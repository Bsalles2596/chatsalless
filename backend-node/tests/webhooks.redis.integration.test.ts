import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { pool } from '../src/shared/db/pool.js';
import { dispatchWebhooks } from '../src/modules/webhooks/webhook.service.js';
import {
  redisConnection,
  webhookDeadLetterQueue,
  webhookQueue,
} from '../src/modules/webhooks/webhook.queue.js';
import { startWebhookWorker } from '../src/modules/webhooks/webhook.worker.js';
import { encryptWebhookSecret } from '../src/modules/webhooks/webhook.security.js';

const accountId = '00000000-0000-0000-0000-000000000051';
const describeRedis = env.REDIS_URL && pool ? describe : describe.skip;

describeRedis('webhooks with Redis and BullMQ', () => {
  let worker: ReturnType<typeof startWebhookWorker>;
  let server: ReturnType<typeof createServer>;
  let port: number;
  const testHost = process.env.WEBHOOK_TEST_HOST || '127.0.0.1';
  const endpointHost = process.env.WEBHOOK_TEST_ENDPOINT_HOST || testHost;
  let mode: '4xx' | '5xx' | 'timeout' = '4xx';

  beforeAll(async () => {
    if (!pool || !webhookQueue || !webhookDeadLetterQueue) return;
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'Redis webhook test account')
       ON CONFLICT (id) DO NOTHING`,
      [accountId],
    );
    await pool.query('DELETE FROM webhook_endpoints WHERE account_id = $1', [accountId]);
    await webhookQueue.obliterate({ force: true });
    await webhookDeadLetterQueue.obliterate({ force: true });

    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      if (mode === 'timeout') {
        request.resume();
        return;
      }
      response.writeHead(mode === '4xx' ? 429 : 503);
      response.end(mode);
    });
    await new Promise<void>(resolve => server.listen(0, testHost, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Redis webhook server did not start');
    port = address.port;
    worker = startWebhookWorker();
  });

  async function createEndpoint(eventName: string): Promise<string> {
    if (!pool) throw new Error('Database is required');
    const result = await pool.query<{ id: string }>(
      `INSERT INTO webhook_endpoints (account_id, name, url, secret, events, active)
       VALUES ($1, $2, $3, $4, $5::jsonb, TRUE) RETURNING id`,
      [accountId, eventName, `http://${endpointHost}:${port}/events`, encryptWebhookSecret('redis-test-secret'), JSON.stringify([eventName])],
    );
    return result.rows[0].id;
  }

  async function waitForDelivery(endpointId: string): Promise<{ status: string; attempts: number }> {
    if (!pool) throw new Error('Database is required');
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await pool.query<{ status: string; attempts: number }>(
        `SELECT status, attempts FROM webhook_deliveries
         WHERE account_id = $1 AND endpoint_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [accountId, endpointId],
      );
      const delivery = result.rows[0];
      if (delivery?.status === 'failed') return delivery;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Delivery for ${endpointId} did not fail within the timeout`);
  }

  it.each([
    ['4xx', 429],
    ['5xx', 503],
  ] as const)('retries and dead-letters HTTP %s responses', async (responseMode, responseStatus) => {
    if (!pool || !webhookDeadLetterQueue) return;
    mode = responseMode;
    const endpointId = await createEndpoint(`redis.${responseMode}`);
    await dispatchWebhooks(accountId, `redis.${responseMode}`, { responseStatus });
    const delivery = await waitForDelivery(endpointId);
    expect(delivery).toMatchObject({ status: 'failed', attempts: env.WEBHOOK_MAX_ATTEMPTS });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const counts = await webhookDeadLetterQueue.getJobCounts('waiting', 'active', 'completed');
      if (counts.waiting + counts.active + counts.completed > 0) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const deadLetterJobs = await webhookDeadLetterQueue.getJobs(['waiting', 'completed'], 0, 10);
    expect(deadLetterJobs.some(job => job.data.endpointId === endpointId)).toBe(true);
  }, 20000);

  it('records timeout failures and uses delayed retry backoff', async () => {
    if (!pool || !webhookQueue) return;
    mode = 'timeout';
    const endpointId = await createEndpoint('redis.timeout');
    await dispatchWebhooks(accountId, 'redis.timeout', { timeout: true });

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = await pool.query<{ status: string; attempts: number }>(
        `SELECT status, attempts FROM webhook_deliveries
         WHERE account_id = $1 AND endpoint_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [accountId, endpointId],
      );
      if ((result.rows[0]?.attempts ?? 0) >= 1) {
        expect(['pending', 'failed']).toContain(result.rows[0].status);
        const counts = await webhookQueue.getJobCounts('delayed');
        if (result.rows[0].status === 'pending') expect(counts.delayed).toBeGreaterThan(0);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timeout delivery did not enter delayed retry state');
  }, 20000);

  afterAll(async () => {
    await worker?.close();
    await new Promise<void>(resolve => server?.close(() => resolve()));
    await redisConnection?.quit();
  });
});
