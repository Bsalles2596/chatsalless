import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../shared/db/pool.js';
import { accountFromRequest, authenticate } from '../../shared/auth/auth.js';

const resourceInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
});

export async function operationsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/inboxes',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return [];
      const result = await pool.query(
        'SELECT id, name, channel_type AS "channelType", created_at FROM inboxes WHERE account_id = $1 ORDER BY name',
        [accountId],
      );
      return result.rows;
    },
  );

  app.post<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/inboxes',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = resourceInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for inboxes');
      const result = await pool.query(
        `INSERT INTO inboxes (account_id, name)
         VALUES ($1, $2) RETURNING id, name, channel_type AS "channelType", created_at`,
        [accountId, parsed.data.name],
      );
      return reply.code(201).send(result.rows[0]);
    },
  );

  app.get<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/agents',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return [];
      const result = await pool.query(
        'SELECT id, email FROM users WHERE account_id = $1 ORDER BY email',
        [accountId],
      );
      return result.rows;
    },
  );

  app.get<{ Params: { accountId: string }; Querystring: { inbox_ids?: string | string[] } }>(
    '/api/v1/accounts/:accountId/assignable_agents',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return [];
      const result = await pool.query(
        'SELECT id, email FROM users WHERE account_id = $1 ORDER BY email',
        [accountId],
      );
      return result.rows;
    },
  );

  app.get<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/teams',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return [];
      const result = await pool.query(
        'SELECT id, name, description, created_at FROM teams WHERE account_id = $1 ORDER BY name',
        [accountId],
      );
      return result.rows;
    },
  );

  app.post<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/teams',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = resourceInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for teams');
      const result = await pool.query(
        `INSERT INTO teams (account_id, name, description)
         VALUES ($1, $2, $3) RETURNING id, name, description, created_at`,
        [accountId, parsed.data.name, parsed.data.description ?? null],
      );
      return reply.code(201).send(result.rows[0]);
    },
  );

  app.post<{ Params: { accountId: string; teamId: string }; Body: { user_ids: string[] } }>(
    '/api/v1/accounts/:accountId/teams/:teamId/team_members',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const userIds = z.array(z.string().uuid()).safeParse(request.body?.user_ids);
      if (!userIds.success) return reply.badRequest('user_ids must be UUIDs');
      if (!pool) return reply.serviceUnavailable('Database is required for team members');
      const team = await pool.query(
        'SELECT id FROM teams WHERE id = $1 AND account_id = $2',
        [request.params.teamId, accountId],
      );
      if (!team.rows[0]) return reply.notFound('Team not found');
      for (const userId of userIds.data) {
        await pool.query(
          `INSERT INTO team_members (team_id, account_id, user_id)
           SELECT $1, $2, id FROM users WHERE id = $3 AND account_id = $2
           ON CONFLICT DO NOTHING`,
          [request.params.teamId, accountId, userId],
        );
      }
      return { user_ids: userIds.data };
    },
  );
}
