import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accountFromRequest, authenticate } from '../../shared/auth/auth.js';
import { requireAccountAdmin } from '../../shared/auth/permissions.js';
import { pool } from '../../shared/db/pool.js';
import { createWebhookSecret, retryWebhookDelivery } from './webhook.service.js';
import { webhookDeadLetterQueue, webhookQueue } from './webhook.queue.js';
import { getWebhookWorkerMetrics } from './webhook.metrics.js';
import { encryptWebhookSecret, validateWebhookUrl } from './webhook.security.js';

const webhookInput = z.object({
  name: z.string().trim().min(1).max(160),
  url: z.string().url().max(2000),
  events: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
});
const webhookUpdate = webhookInput.partial().extend({ active: z.boolean().optional() });

export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/webhooks',
    { preHandler: [authenticate, requireAccountAdmin] },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return [];
      const result = await pool.query(
        `SELECT id, name, url, events, active, created_at, updated_at
         FROM webhook_endpoints WHERE account_id = $1 ORDER BY created_at DESC`,
        [accountId],
      );
      return result.rows;
    },
  );

  app.post<{ Params: { accountId: string }; Body: z.input<typeof webhookInput> }>(
    '/api/v1/accounts/:accountId/webhooks',
    { preHandler: [authenticate, requireAccountAdmin] },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = webhookInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      try { await validateWebhookUrl(parsed.data.url); } catch (error) {
        return reply.badRequest(error instanceof Error ? error.message : 'Invalid webhook URL');
      }
      if (!pool) return reply.serviceUnavailable('Database is required for webhooks');
      const secret = createWebhookSecret();
      const result = await pool.query(
        `INSERT INTO webhook_endpoints (account_id, name, url, secret, events)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, name, url, events, active, created_at, updated_at`,
        [accountId, parsed.data.name, parsed.data.url, encryptWebhookSecret(secret), JSON.stringify(parsed.data.events)],
      );

      return reply.code(201).send({ ...result.rows[0], secret });
    },
  );

  app.patch<{
    Params: { accountId: string; webhookId: string };
    Body: z.input<typeof webhookUpdate>;
  }>(
    '/api/v1/accounts/:accountId/webhooks/:webhookId',
    { preHandler: [authenticate, requireAccountAdmin] },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = webhookUpdate.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (parsed.data.url) {
        try { await validateWebhookUrl(parsed.data.url); } catch (error) {
          return reply.badRequest(error instanceof Error ? error.message : 'Invalid webhook URL');
        }
      }
      if (!pool) return reply.serviceUnavailable('Database is required for webhooks');
      const fields = Object.entries(parsed.data);
      if (!fields.length) return reply.badRequest('At least one field is required');
      const columns: Record<string, string> = { name: 'name', url: 'url', events: 'events', active: 'active' };
      const assignments: string[] = [];
      const values: unknown[] = [request.params.webhookId, accountId];
      for (const [field, value] of fields) {
        const column = columns[field];
        if (!column) continue;
        assignments.push(`${column} = $${values.length + 1}${field === 'events' ? '::jsonb' : ''}`);
        values.push(field === 'events' ? JSON.stringify(value) : value);
      }
      assignments.push('updated_at = NOW()');
      const result = await pool.query(
        `UPDATE webhook_endpoints SET ${assignments.join(', ')}
         WHERE id = $1 AND account_id = $2
         RETURNING id, name, url, events, active, created_at, updated_at`,
        values,
      );
      if (!result.rows[0]) return reply.notFound('Webhook endpoint not found');
      return result.rows[0];
    },
  );

  app.post<{ Params: { accountId: string; webhookId: string } }>(
    '/api/v1/accounts/:accountId/webhooks/:webhookId/rotate-secret',
    { preHandler: [authenticate, requireAccountAdmin] },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for webhooks');
      const secret = createWebhookSecret();
      const result = await pool.query(
        `UPDATE webhook_endpoints SET secret = $3, updated_at = NOW()
         WHERE id = $1 AND account_id = $2
         RETURNING id, name, url, events, active, created_at, updated_at`,
        [request.params.webhookId, accountId, encryptWebhookSecret(secret)],
      );
      if (!result.rows[0]) return reply.notFound('Webhook endpoint not found');
      return { ...result.rows[0], secret };
    },
  );

  app.delete<{ Params: { accountId: string; webhookId: string } }>(
    '/api/v1/accounts/:accountId/webhooks/:webhookId',
    { preHandler: [authenticate, requireAccountAdmin] },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for webhooks');
      const result = await pool.query(
        'DELETE FROM webhook_endpoints WHERE id = $1 AND account_id = $2 RETURNING id',
        [request.params.webhookId, accountId],
      );
      if (!result.rows[0]) return reply.notFound('Webhook endpoint not found');
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { accountId: string }; Querystring: { limit?: string } }>(
    '/api/v1/accounts/:accountId/webhooks/deliveries',
    { preHandler: [authenticate, requireAccountAdmin] },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return [];
      const limitValue = Number(request.query.limit ?? 50);
      const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 50;
      const result = await pool.query(
        `SELECT id, endpoint_id, event_name, status, attempts, response_status,
                response_body, next_retry_at, created_at, delivered_at
         FROM webhook_deliveries WHERE account_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [accountId, limit],
      );
      return result.rows;
    },
  );

  app.post<{ Params: { accountId: string; deliveryId: string } }>(
    '/api/v1/accounts/:accountId/webhooks/deliveries/:deliveryId/retry',
    { preHandler: [authenticate, requireAccountAdmin] },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const retried = await retryWebhookDelivery(accountId, request.params.deliveryId);
      if (!retried) return reply.notFound('Webhook delivery not found');
      return { status: 'pending', deliveryId: request.params.deliveryId };
    },
  );

  app.get<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/webhooks/queue-metrics',
    { preHandler: [authenticate, requireAccountAdmin] },
    async request => {
      accountFromRequest(request);
      if (!webhookQueue || !webhookDeadLetterQueue) return { enabled: false };
      return {
        enabled: true,
        ...(await webhookQueue.getJobCounts('waiting', 'active', 'delayed', 'failed')),
        deadLetter: await webhookDeadLetterQueue.getJobCounts('waiting', 'active', 'failed'),
        worker: getWebhookWorkerMetrics(),
      };
    },
  );

  app.get<{
    Params: { accountId: string };
    Querystring: { event?: string; limit?: string };
  }>(
    '/api/v1/accounts/:accountId/webhooks/dead-letter',
    { preHandler: [authenticate, requireAccountAdmin] },
    async request => {
      accountFromRequest(request);
      if (!webhookDeadLetterQueue) return [];
      const limitValue = Number(request.query.limit ?? 50);
      const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 50;
      const jobs = await webhookDeadLetterQueue.getJobs(['waiting', 'active', 'failed'], 0, limit * 2);
      return jobs
        .filter(job => job.data.accountId === request.user.accountId)
        .filter(job => !request.query.event || job.data.eventName === request.query.event)
        .slice(0, limit)
        .map(job => ({
          id: job.id,
          eventName: job.data.eventName,
          deliveryId: job.data.deliveryId,
          failedAt: job.data.failedAt,
          error: job.data.error,
          attempts: job.attemptsMade,
        }));
    },
  );

  app.post<{ Params: { accountId: string; jobId: string } }>(
    '/api/v1/accounts/:accountId/webhooks/dead-letter/:jobId/reprocess',
    { preHandler: [authenticate, requireAccountAdmin] },
    async (request, reply) => {
      accountFromRequest(request);
      if (!webhookQueue || !webhookDeadLetterQueue) return reply.serviceUnavailable('Redis is required');
      const job = await webhookDeadLetterQueue.getJob(request.params.jobId);
      if (!job) return reply.notFound('Dead-letter job not found');
      if (job.data.accountId !== request.user.accountId) return reply.notFound('Dead-letter job not found');
      await webhookQueue.add('deliver-webhook', job.data, {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      await job.remove();
      return { status: 'pending', jobId: request.params.jobId };
    },
  );
}
