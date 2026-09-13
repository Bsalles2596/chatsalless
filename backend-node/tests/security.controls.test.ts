import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { redisConnection } from '../src/modules/webhooks/webhook.queue.js';
import { webhookDeadLetterQueue, webhookQueue } from '../src/modules/webhooks/webhook.queue.js';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  isPrivateAddress,
  validateWebhookUrl,
} from '../src/modules/webhooks/webhook.security.js';
import { consumeRateLimit } from '../src/shared/http/rate-limit.js';
import { pool } from '../src/shared/db/pool.js';

const accountId = '00000000-0000-0000-0000-000000000071';

describe('production security controls', () => {
  it('encrypts webhook secrets and keeps legacy secrets readable', () => {
    const secret = 'a'.repeat(64);
    const encrypted = encryptWebhookSecret(secret);
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
    expect(decryptWebhookSecret(secret)).toBe(secret);
  });

  it('rejects webhook URLs containing embedded credentials', async () => {
    await expect(validateWebhookUrl('http://user:password@127.0.0.1/events'))
      .rejects.toThrow('credentials');
  });

  it('recognizes private, loopback and link-local addresses', () => {
    expect(isPrivateAddress('10.10.10.10')).toBe(true);
    expect(isPrivateAddress('172.16.10.10')).toBe(true);
    expect(isPrivateAddress('192.168.1.10')).toBe(true);
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('169.254.10.10')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('enforces admin permission on webhook administration routes', async () => {
    const app = buildApp();
    await app.ready();
    if (pool) {
      await pool.query(
        `INSERT INTO accounts (id, name) VALUES ($1, 'Security test account')
         ON CONFLICT (id) DO NOTHING`,
        [accountId],
      );
    }
    const token = app.jwt.sign({
      id: 'agent-user',
      accountId,
      email: 'agent@example.com',
      role: 'agent',
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/webhooks`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  describe.skipIf(!env.REDIS_URL)('distributed Redis rate limit', () => {
    const key = `security-test-${Date.now()}`;

    beforeAll(async () => {
      await redisConnection?.del(`chatsalles:rate-limit:${key}`);
    });

    it('shares an atomic counter across calls', async () => {
      await expect(consumeRateLimit(key, 2, 10000)).resolves.toMatchObject({ allowed: true });
      await expect(consumeRateLimit(key, 2, 10000)).resolves.toMatchObject({ allowed: true });
      const blocked = await consumeRateLimit(key, 2, 10000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });

    it('reprocesses only dead-letter jobs from the authenticated account', async () => {
      if (!webhookDeadLetterQueue || !webhookQueue) throw new Error('Redis is required');
      const app = buildApp();
      await app.ready();
      const foreignJob = await webhookDeadLetterQueue.add('security-test', {
        accountId: '00000000-0000-0000-0000-000000000072',
        deliveryId: 'foreign-delivery',
      });
      const token = app.jwt.sign({ id: 'admin-user', accountId, email: 'admin@example.com', role: 'admin' });
      const foreignResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/accounts/${accountId}/webhooks/dead-letter/${foreignJob.id}/reprocess`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(foreignResponse.statusCode).toBe(404);
      await foreignJob.remove();

      const ownJob = await webhookDeadLetterQueue.add('security-test', { accountId, deliveryId: 'own-delivery' });
      const ownResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/accounts/${accountId}/webhooks/dead-letter/${ownJob.id}/reprocess`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(ownResponse.statusCode).toBe(200);
      expect(ownResponse.json()).toMatchObject({ status: 'pending', jobId: ownJob.id });
      await app.close();
    });

    afterAll(async () => {
      await redisConnection?.del(`chatsalles:rate-limit:${key}`);
    });
  });

  afterAll(async () => {
    await redisConnection?.quit();
  });
});
