import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { dispatchWebhooks } from '../src/modules/webhooks/webhook.service.js';
import { pool } from '../src/shared/db/pool.js';

const accountId = '00000000-0000-0000-0000-000000000041';

describe('webhooks', () => {
  const app = buildApp();
  let webhookServer: ReturnType<typeof createServer>;
  let webhookUrl: string;
  let received: { body: string; headers: IncomingMessage['headers'] } | undefined;

  beforeAll(async () => {
    if (!pool) return;
    await app.ready();
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'Webhook test account')
       ON CONFLICT (id) DO NOTHING`,
      [accountId],
    );
    await pool.query('DELETE FROM webhook_endpoints WHERE account_id = $1', [accountId]);
    webhookServer = createServer((request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        received = { body: Buffer.concat(chunks).toString('utf8'), headers: request.headers };
        response.writeHead(200);
        response.end('ok');
      });
    });
    await new Promise<void>(resolve => webhookServer.listen(0, '127.0.0.1', resolve));
    const address = webhookServer.address();
    if (!address || typeof address === 'string') throw new Error('Webhook server did not start');
    webhookUrl = `http://127.0.0.1:${address.port}/events`;
  });

  it('persists endpoints, signs deliveries, and records success', async () => {
    if (!pool) return;
    const token = app.jwt.sign({ id: 'webhook-user', accountId, email: 'webhook@example.com', role: 'admin' });
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/webhooks`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Local receiver', url: webhookUrl, events: ['message.created'] },
    });
    expect(created.statusCode).toBe(201);
    const secret = created.json().secret as string;
    expect(secret).toHaveLength(64);

    received = undefined;
    await dispatchWebhooks(accountId, 'message.created', { conversationId: 'conversation-1', content: 'hello' });
    for (let attempt = 0; attempt < 40 && !received; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    expect(received).toBeDefined();
    const delivery = received as { body: string; headers: IncomingMessage['headers'] } | undefined;
    if (!delivery) throw new Error('Webhook receiver did not receive the delivery');
    const body = delivery.body;
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(delivery.headers['x-chatsalles-signature']).toBe(expected);
    expect(JSON.parse(body)).toMatchObject({ event: 'message.created' });

    let deliveries = await pool.query(
      `SELECT status, attempts, response_status FROM webhook_deliveries
       WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [accountId],
    );
    for (let attempt = 0; attempt < 40; attempt += 1) {
      deliveries = await pool.query(
        `SELECT status, attempts, response_status FROM webhook_deliveries
         WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [accountId],
      );
      if (deliveries.rows[0]?.status === 'succeeded') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    expect(deliveries.rows[0]).toMatchObject({ status: 'succeeded', attempts: 1, response_status: 200 });
  });

  it('updates, rotates and deletes an endpoint inside its account', async () => {
    if (!pool) return;
    const token = app.jwt.sign({ id: 'webhook-crud-user', accountId, email: 'crud@example.com', role: 'admin' });
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/webhooks`,
      headers,
      payload: { name: 'CRUD endpoint', url: webhookUrl, events: [] },
    });
    const endpoint = created.json();
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${accountId}/webhooks/${endpoint.id}`,
      headers,
      payload: { name: 'Updated endpoint', active: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Updated endpoint', active: false });

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/webhooks/${endpoint.id}/rotate-secret`,
      headers,
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().secret).not.toBe(endpoint.secret);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/accounts/${accountId}/webhooks/${endpoint.id}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('retries a failed delivery through the authenticated endpoint', async () => {
    if (!pool) return;
    const token = app.jwt.sign({ id: 'webhook-retry-user', accountId, email: 'retry@example.com', role: 'admin' });
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/webhooks`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Retry endpoint', url: 'http://127.0.0.1:1/unavailable', events: ['retry.test'] },
    });
    const endpoint = created.json();
    await dispatchWebhooks(accountId, 'retry.test', { conversationId: 'conversation-retry' });
    const delivery = await pool.query(
      `SELECT id FROM webhook_deliveries
       WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [endpoint.id],
    );
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/webhooks/deliveries/${delivery.rows[0].id}/retry`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'pending', deliveryId: delivery.rows[0].id });
  });

  afterAll(async () => {
    webhookServer?.close();
    await app.close();
  });
});
