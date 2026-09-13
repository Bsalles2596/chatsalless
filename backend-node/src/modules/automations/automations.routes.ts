import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { emitRealtime } from '../../realtime/realtime.js';
import { accountFromRequest, authenticate } from '../../shared/auth/auth.js';
import { pool } from '../../shared/db/pool.js';

const ruleInput = z.object({
  name: z.string().trim().min(1).max(160),
  eventName: z.string().trim().min(1).max(160),
  conditions: z.array(z.unknown()).default([]),
  actions: z.array(z.unknown()).default([]),
  executionDelay: z.number().int().min(0).max(86400).optional(),
});
const ruleUpdate = ruleInput.partial().extend({ active: z.boolean().optional() });

const toRule = (row: Record<string, unknown>) => ({
  id: row.id,
  accountId: row.account_id,
  name: row.name,
  eventName: row.event_name,
  active: row.active,
  conditions: row.conditions,
  actions: row.actions,
  executionDelay: row.execution_delay,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const selectRule = `SELECT id, account_id, name, event_name, active, conditions, actions,
                           execution_delay, created_at, updated_at
                    FROM automation_rules`;

export async function automationsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/automation_rules',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return [];
      const result = await pool.query(
        `${selectRule}
         WHERE account_id = $1
         ORDER BY created_at DESC`,
        [accountId],
      );
      return result.rows.map(toRule);
    },
  );

  app.post<{
    Params: { accountId: string };
    Body: z.input<typeof ruleInput>;
  }>(
    '/api/v1/accounts/:accountId/automation_rules',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = ruleInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for automation rules');
      const result = await pool.query(
        `INSERT INTO automation_rules
          (account_id, name, event_name, conditions, actions, execution_delay)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
         RETURNING id, account_id, name, event_name, active, conditions, actions,
                   execution_delay, created_at, updated_at`,
        [
          accountId,
          parsed.data.name,
          parsed.data.eventName,
          JSON.stringify(parsed.data.conditions),
          JSON.stringify(parsed.data.actions),
          parsed.data.executionDelay ?? null,
        ],
      );
      const rule = toRule(result.rows[0]);
      emitRealtime(accountId, 'automation:created', { ...rule });
      return reply.code(201).send(rule);
    },
  );

  app.patch<{
    Params: { accountId: string; ruleId: string };
    Body: z.input<typeof ruleUpdate>;
  }>(
    '/api/v1/accounts/:accountId/automation_rules/:ruleId',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = ruleUpdate.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for automation rules');
      const fields = Object.entries(parsed.data);
      if (fields.length === 0) return reply.badRequest('At least one field is required');
      const assignments: string[] = [];
      const values: unknown[] = [accountId, request.params.ruleId];
      for (const [field, value] of fields) {
        const column = {
          name: 'name',
          eventName: 'event_name',
          conditions: 'conditions',
          actions: 'actions',
          executionDelay: 'execution_delay',
          active: 'active',
        }[field];
        if (!column) continue;
        assignments.push(`${column} = $${values.length + 1}${field === 'conditions' || field === 'actions' ? '::jsonb' : ''}`);
        values.push(field === 'conditions' || field === 'actions' ? JSON.stringify(value) : value);
      }
      assignments.push('updated_at = NOW()');
      const result = await pool.query(
        `${selectRule}
         WHERE id = $2 AND account_id = $1`,
        values.slice(0, 2),
      );
      if (result.rowCount === 0) return reply.notFound('Automation rule not found');
      const updated = await pool.query(
        `UPDATE automation_rules SET ${assignments.join(', ')}
         WHERE id = $1 AND account_id = $2
         RETURNING id, account_id, name, event_name, active, conditions, actions,
                   execution_delay, created_at, updated_at`,
        [request.params.ruleId, accountId, ...values.slice(2)],
      );
      const rule = toRule(updated.rows[0]);
      emitRealtime(accountId, 'automation:updated', rule);
      return rule;
    },
  );

  app.delete<{ Params: { accountId: string; ruleId: string } }>(
    '/api/v1/accounts/:accountId/automation_rules/:ruleId',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for automation rules');
      const result = await pool.query(
        'DELETE FROM automation_rules WHERE id = $1 AND account_id = $2 RETURNING id',
        [request.params.ruleId, accountId],
      );
      if (result.rowCount === 0) return reply.notFound('Automation rule not found');
      emitRealtime(accountId, 'automation:deleted', { id: request.params.ruleId });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { accountId: string; ruleId: string } }>(
    '/api/v1/accounts/:accountId/automation_rules/:ruleId/toggle',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for automation rules');
      const result = await pool.query(
        `UPDATE automation_rules SET active = NOT active, updated_at = NOW()
         WHERE id = $1 AND account_id = $2
         RETURNING id, account_id, name, event_name, active, conditions, actions,
                   execution_delay, created_at, updated_at`,
        [request.params.ruleId, accountId],
      );
      if (result.rowCount === 0) return reply.notFound('Automation rule not found');
      const rule = toRule(result.rows[0]);
      emitRealtime(accountId, 'automation:updated', rule);
      return rule;
    },
  );

  app.get<{ Params: { accountId: string }; Querystring: { limit?: string } }>(
    '/api/v1/accounts/:accountId/automation_executions',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return [];
      const parsedLimit = Number(request.query.limit ?? 50);
      const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;
      const result = await pool.query(
        `SELECT id, rule_id, event_id, event_name, status, error_message, started_at, finished_at
         FROM automation_executions
         WHERE account_id = $1
         ORDER BY started_at DESC
         LIMIT $2`,
        [accountId, limit],
      );
      return result.rows;
    },
  );
}
