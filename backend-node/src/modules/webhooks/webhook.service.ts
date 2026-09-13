import { createHmac, randomBytes } from 'node:crypto';
import { pool } from '../../shared/db/pool.js';
import { emitRealtime } from '../../realtime/realtime.js';
import { env } from '../../config/env.js';
import { webhookQueue } from './webhook.queue.js';
import { decryptWebhookSecret } from './webhook.security.js';

export function createWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

function signature(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function deliver(
  deliveryId: string,
  accountId: string,
  endpointId: string,
  url: string,
  secret: string,
  eventName: string,
  payload: Record<string, unknown>,
  attempt: number,
): Promise<void> {
  if (!pool) return;
  const body = JSON.stringify({ id: deliveryId, event: eventName, payload });
  let status: number | null = null;
  let responseBody = '';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'ChatSalles-Webhooks/1.0',
        'x-chatsalles-event': eventName,
        'x-chatsalles-signature': signature(decryptWebhookSecret(secret), body),
        'x-chatsalles-delivery': deliveryId,
      },
      body,
        signal: AbortSignal.timeout(env.WEBHOOK_TIMEOUT_MS),
    });
    status = response.status;
    responseBody = (await response.text()).slice(0, 4000);
    if (response.ok) {
      await pool.query(
        `UPDATE webhook_deliveries
         SET status = 'succeeded', attempts = $2, response_status = $3,
             response_body = $4, delivered_at = NOW(), next_retry_at = NULL
         WHERE id = $1 AND account_id = $5`,
        [deliveryId, attempt, status, responseBody, accountId],
      );
      emitRealtime(accountId, 'webhook:delivery_succeeded', {
        deliveryId, endpointId, eventName, attempts: attempt, responseStatus: status,
      });
      return;
    }
    throw new Error(`Webhook returned HTTP ${status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook delivery failed';
    const retry = attempt < env.WEBHOOK_MAX_ATTEMPTS;
    const delaySeconds = Math.min(60, 2 ** attempt);
    await pool.query(
      `UPDATE webhook_deliveries
       SET status = $2, attempts = $3, response_status = $4, response_body = $5,
           next_retry_at = CASE WHEN $2 = 'pending' THEN NOW() + ($6 * INTERVAL '1 second') ELSE NULL END
       WHERE id = $1 AND account_id = $7`,
      [deliveryId, retry ? 'pending' : 'failed', attempt, status, message, delaySeconds, accountId],
    );
    emitRealtime(accountId, retry ? 'webhook:delivery_retrying' : 'webhook:delivery_failed', {
      deliveryId, endpointId, eventName, attempts: attempt, error: message, responseStatus: status,
    });
    if (webhookQueue) throw error;
    if (retry && !webhookQueue) {
      setTimeout(() => {
        void deliver(deliveryId, accountId, endpointId, url, secret, eventName, payload, attempt + 1);
      }, delaySeconds * 1000);
    }
  }
}

export async function deliverWebhookJob(data: {
    deliveryId: string;
    accountId: string;
    endpointId: string;
    url: string;
    secret: string;
    eventName: string;
    payload: Record<string, unknown>;
  }, attempt: number): Promise<void> {
    await deliver(data.deliveryId, data.accountId, data.endpointId, data.url, data.secret, data.eventName, data.payload, attempt);
}

export async function retryWebhookDelivery(accountId: string, deliveryId: string): Promise<boolean> {
    if (!pool) return false;
    const result = await pool.query<{
      id: string; endpoint_id: string; url: string; secret: string;
      event_name: string; payload: Record<string, unknown>;
    }>(
      `SELECT d.id, d.endpoint_id, e.url, e.secret, d.event_name, d.payload
       FROM webhook_deliveries d
       JOIN webhook_endpoints e ON e.id = d.endpoint_id AND e.account_id = d.account_id
       WHERE d.id = $1 AND d.account_id = $2`,
      [deliveryId, accountId],
    );
    const delivery = result.rows[0];
    if (!delivery) return false;
    await pool.query(
      `UPDATE webhook_deliveries
       SET status = 'pending', attempts = 0, response_status = NULL,
           response_body = NULL, next_retry_at = NOW(), delivered_at = NULL
       WHERE id = $1 AND account_id = $2`,
      [deliveryId, accountId],
    );
    const data = {
      deliveryId: delivery.id,
      accountId,
      endpointId: delivery.endpoint_id,
      url: delivery.url,
      secret: delivery.secret,
      eventName: delivery.event_name,
      payload: delivery.payload,
    };
    if (webhookQueue) {
      await webhookQueue.add('deliver-webhook', data, {
        attempts: env.WEBHOOK_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
    } else {
      void deliver(data.deliveryId, accountId, data.endpointId, data.url, data.secret, data.eventName, data.payload, 1);
    }
    return true;
}

export async function dispatchWebhooks(
  accountId: string,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!pool) return;
  const endpoints = await pool.query<{ id: string; url: string; secret: string }>(
    `SELECT id, url, secret
     FROM webhook_endpoints
     WHERE account_id = $1 AND active = TRUE
       AND (events = '[]'::jsonb OR events @> $2::jsonb)`,
    [accountId, JSON.stringify([eventName])],
  );
  for (const endpoint of endpoints.rows) {
    const delivery = await pool.query(
      `INSERT INTO webhook_deliveries
        (endpoint_id, account_id, event_name, payload, status, next_retry_at)
       VALUES ($1, $2, $3, $4::jsonb, 'pending', NOW())
       RETURNING id`,
      [endpoint.id, accountId, eventName, JSON.stringify(payload)],
    );
    const data = {
      deliveryId: delivery.rows[0].id,
      accountId,
      endpointId: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      eventName,
      payload,
    };
    if (webhookQueue) {
      await webhookQueue.add('deliver-webhook', data, {
        attempts: env.WEBHOOK_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
    } else {
      void deliver(data.deliveryId, accountId, endpoint.id, endpoint.url, endpoint.secret, eventName, payload, 1);
    }
  }
}
