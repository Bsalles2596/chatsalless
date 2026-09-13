import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../shared/db/pool.js';
import { accountFromRequest, authenticate } from '../../shared/auth/auth.js';
import { attachmentStorage } from '../../shared/storage/attachmentStorage.js';
import { emitRealtime } from '../../realtime/realtime.js';
import { executeAutomations } from '../automations/automation.service.js';

const conversationInput = z.object({
  contactId: z.string().uuid(),
  status: z.enum(['open', 'pending', 'resolved']).default('open'),
});

const messageInput = z.object({
  content: z.string().trim().min(1),
  private: z.boolean().default(false),
});

const labelsInput = z.object({
  labels: z.array(z.string().trim().min(1).max(100)).max(50),
});

const statusInput = z.object({
  status: z.enum(['open', 'pending', 'resolved']),
});

const assignmentInput = z.object({
  assignee_id: z.string().uuid().nullable().optional(),
  assignee_type: z.enum(['user', 'team']).optional(),
  team_id: z.string().uuid().nullable().optional(),
});

const inboxInput = z.object({
  inbox_id: z.string().uuid().nullable(),
});

const conversationFilters = z.object({
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(['open', 'pending', 'resolved']).optional(),
  inbox_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  assignee_id: z.string().uuid().optional(),
  assignee_type: z.enum(['user', 'team', 'unassigned']).optional(),
  priority: z.coerce.number().int().min(0).max(3).optional(),
  q: z.string().trim().max(200).optional(),
  labels: z.union([z.string(), z.array(z.string())]).optional(),
  updated_within: z.coerce.number().int().positive().optional(),
  sort_by: z.enum(['created_at', 'updated_at', 'priority', 'alphabetical']).default('created_at'),
});

const attachmentField = z.object({
  filename: z.string().min(1).max(255),
  mimetype: z.string().min(1).max(255),
  data: z.instanceof(Buffer),
});

function conversationQueries(accountId: string, userId: string, filters: z.infer<typeof conversationFilters>) {
  const conditions = ['conversations.account_id = $1'];
  const values: unknown[] = [accountId];
  const addFilter = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.status) addFilter('conversations.status = ?', filters.status);
  if (filters.inbox_id) addFilter('conversations.inbox_id = ?', filters.inbox_id);
  if (filters.team_id) addFilter('conversations.team_id = ?', filters.team_id);
  if (filters.assignee_id) addFilter('conversations.assignee_id = ?', filters.assignee_id);
  if (filters.priority !== undefined) addFilter('conversations.priority = ?', filters.priority);
  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`(
      last_message ILIKE $${values.length}
      OR EXISTS (
        SELECT 1 FROM messages search_message
        WHERE search_message.conversation_id = conversations.id
          AND search_message.account_id = $1
          AND search_message.content ILIKE $${values.length}
      )
      OR EXISTS (
        SELECT 1 FROM contacts search_contact
        WHERE search_contact.id = conversations.contact_id
          AND search_contact.account_id = $1
          AND (search_contact.name ILIKE $${values.length}
            OR search_contact.email ILIKE $${values.length}
            OR search_contact.phone_number ILIKE $${values.length})
      )
    )`);
  }
  const labels = filters.labels
    ? (Array.isArray(filters.labels) ? filters.labels : filters.labels.split(','))
      .map(label => label.trim())
      .filter(Boolean)
    : [];
  if (labels.length) {
    values.push(labels);
    conditions.push(`(
      SELECT COUNT(DISTINCT conversation_label.name)
      FROM conversation_labels conversation_label
      WHERE conversation_label.account_id = $1
        AND conversation_label.conversation_id = conversations.id
        AND conversation_label.name = ANY($${values.length}::text[])
    ) = ${labels.length}`);
  }
  if (filters.updated_within) {
    values.push(filters.updated_within);
    conditions.push(`conversations.updated_at >= NOW() - ($${values.length} * INTERVAL '1 hour')`);
  }
  if (filters.assignee_type === 'user') conditions.push('assignee_id IS NOT NULL');
  if (filters.assignee_type === 'team') conditions.push('team_id IS NOT NULL');
  if (filters.assignee_type === 'unassigned') conditions.push('assignee_id IS NULL AND team_id IS NULL');
  const orderBy = {
    created_at: 'conversations.created_at DESC',
    updated_at: 'conversations.updated_at DESC',
    priority: 'conversations.priority DESC, conversations.created_at DESC',
    alphabetical: 'contacts.name ASC, conversations.created_at DESC',
  }[filters.sort_by];
  const whereClause = conditions.join(' AND ');
  const countValues = [...values];
  const userParam = values.length + 1;
  values.push(userId);
  const limitParam = values.length + 1;
  values.push(25);
  const offsetParam = values.length + 1;
  values.push((filters.page - 1) * 25);
  return {
    list: {
      text: `SELECT conversations.id, conversations.contact_id, contacts.name AS contact_name,
          contacts.email AS contact_email, contacts.phone_number AS contact_phone,
          conversations.status, conversations.inbox_id, inboxes.name AS inbox_name,
          conversations.assignee_id, assignee.email AS assignee_email,
          conversations.team_id, teams.name AS team_name, conversations.priority,
          conversations.last_message, conversations.created_at, conversations.updated_at,
          COALESCE((
            SELECT json_agg(label.name ORDER BY label.name)
            FROM conversation_labels label
            WHERE label.account_id = $1 AND label.conversation_id = conversations.id
          ), '[]'::json) AS labels,
          (SELECT COUNT(*)::int FROM messages unread_message
           WHERE unread_message.account_id = $1
             AND unread_message.conversation_id = conversations.id
             AND unread_message.private = FALSE
             AND unread_message.created_at > COALESCE((
               SELECT read_state.last_seen_at FROM conversation_reads read_state
               WHERE read_state.account_id = $1 AND read_state.conversation_id = conversations.id
                 AND read_state.user_id = $${userParam}
             ), TO_TIMESTAMP(0))) AS unread_count
        FROM conversations
        JOIN contacts ON contacts.id = conversations.contact_id AND contacts.account_id = $1
        LEFT JOIN inboxes ON inboxes.id = conversations.inbox_id AND inboxes.account_id = $1
        LEFT JOIN users assignee ON assignee.id = conversations.assignee_id AND assignee.account_id = $1
        LEFT JOIN teams ON teams.id = conversations.team_id AND teams.account_id = $1
        WHERE ${whereClause}
        ORDER BY ${orderBy} LIMIT $${limitParam} OFFSET $${offsetParam}`,
      values,
    },
    count: {
      text: `SELECT COUNT(*)::int AS count FROM conversations WHERE ${whereClause}`,
      values: countValues,
    },
  };
}

async function parseMessageRequest(request: Parameters<typeof authenticate>[0]) {
  if (!request.isMultipart()) {
    const parsed = messageInput.safeParse(request.body);
    return parsed.success ? { message: parsed.data, attachments: [] } : undefined;
  }

  const fields: Record<string, unknown> = {};
  const attachments: Array<{ filename: string; mimetype: string; data: Buffer }> = [];
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const data = await part.toBuffer();
      const parsedFile = attachmentField.safeParse({
        filename: part.filename,
        mimetype: part.mimetype,
        data,
      });
      if (!parsedFile.success) return undefined;
      attachments.push(parsedFile.data);
    } else {
      fields[part.fieldname] = part.value;
    }
  }
  const parsed = messageInput.safeParse({
    content: fields.content || (attachments.length ? '[Attachment]' : ''),
    private: fields.private === true || fields.private === 'true',
  });
  return parsed.success ? { message: parsed.data, attachments } : undefined;
}

export async function conversationsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/conversations',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return { payload: [], meta: { count: 0 } };
      const parsedFilters = conversationFilters.safeParse(request.query);
      if (!parsedFilters.success) return reply.badRequest(parsedFilters.error.issues[0].message);
      const filters = parsedFilters.data;
      const queries = conversationQueries(accountId, request.user.id, filters);
      const result = await pool.query(queries.list.text, queries.list.values);
      const count = await pool.query(queries.count.text, queries.count.values);
      return {
        payload: result.rows,
        data: result.rows,
        meta: { count: count.rows[0].count, currentPage: filters.page },
      };
    },
  );

  app.post<{ Params: { accountId: string }; Querystring: { page?: number } }>(
    '/api/v1/accounts/:accountId/conversations/filter',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const body = request.body as { queryData?: unknown } | undefined;
      const queryData = body?.queryData ?? request.body;
      const parsed = conversationFilters.safeParse({
        ...(typeof queryData === 'object' && queryData !== null ? queryData : {}),
        page: request.query.page ?? (typeof queryData === 'object' && queryData !== null
          ? (queryData as Record<string, unknown>).page
          : undefined),
      });
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return { payload: [], meta: { count: 0, currentPage: parsed.data.page } };
      const queries = conversationQueries(accountId, request.user.id, parsed.data);
      const [result, count] = await Promise.all([
        pool.query(queries.list.text, queries.list.values),
        pool.query(queries.count.text, queries.count.values),
      ]);
      return {
        payload: result.rows,
        data: result.rows,
        meta: { count: count.rows[0].count, currentPage: parsed.data.page },
      };
    },
  );

  app.get<{ Params: { accountId: string }; Querystring: { q?: string; page?: number } }>(
    '/api/v1/accounts/:accountId/conversations/search',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = z.object({
        q: z.string().trim().min(1).max(200),
        page: z.coerce.number().int().min(1).default(1),
      }).safeParse(request.query);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return { payload: [], meta: { count: 0, currentPage: parsed.data.page } };
      const search = `%${parsed.data.q}%`;
      const offset = (parsed.data.page - 1) * 25;
      const result = await pool.query(
        `SELECT id, contact_id, status, inbox_id, assignee_id, team_id, priority, last_message, created_at
         FROM conversations
         WHERE account_id = $1
           AND (
             last_message ILIKE $2
             OR EXISTS (
               SELECT 1 FROM messages
               WHERE messages.conversation_id = conversations.id
                 AND messages.account_id = $1
                 AND messages.content ILIKE $2
             )
             OR EXISTS (
               SELECT 1 FROM contacts
               WHERE contacts.id = conversations.contact_id
                 AND contacts.account_id = $1
                 AND (contacts.name ILIKE $2 OR contacts.email ILIKE $2 OR contacts.phone_number ILIKE $2)
             )
           )
         ORDER BY created_at DESC LIMIT 25 OFFSET $3`,
        [accountId, search, offset],
      );
      return { payload: result.rows, meta: { count: result.rowCount, currentPage: parsed.data.page } };
    },
  );

  app.get<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/conversations/unread_counts',
    { preHandler: authenticate },
    async (request) => {
      const accountId = accountFromRequest(request);
      if (!pool) return { open: 0, pending: 0, resolved: 0 };
      const result = await pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM conversations WHERE account_id = $1
         GROUP BY status`,
        [accountId],
      );
      return result.rows.reduce<Record<string, number>>(
        (counts, row) => ({ ...counts, [row.status]: row.count }),
        { open: 0, pending: 0, resolved: 0 },
      );
    },
  );

  app.get<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/labels',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return { payload: [] };
      const result = await pool.query(
        `SELECT name FROM conversation_labels
         WHERE account_id = $1 AND conversation_id = $2
         ORDER BY name`,
        [accountId, request.params.conversationId],
      );
      return { payload: result.rows.map(row => row.name) };
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/labels',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = labelsInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for conversation labels');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const conversation = await client.query(
          'SELECT id FROM conversations WHERE account_id = $1 AND id = $2',
          [accountId, request.params.conversationId],
        );
        if (!conversation.rows[0]) {
          await client.query('ROLLBACK');
          return reply.notFound('Conversation not found');
        }
        await client.query(
          'DELETE FROM conversation_labels WHERE account_id = $1 AND conversation_id = $2',
          [accountId, request.params.conversationId],
        );
        for (const label of parsed.data.labels) {
          await client.query(
            `INSERT INTO conversation_labels (account_id, conversation_id, name)
             VALUES ($1, $2, $3)`,
            [accountId, request.params.conversationId, label],
          );
        }
        await client.query(
          'UPDATE conversations SET updated_at = NOW() WHERE account_id = $1 AND id = $2',
          [accountId, request.params.conversationId],
        );
        await client.query('COMMIT');
        return { payload: parsed.data.labels };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.post<{ Params: { accountId: string } }>(
    '/api/v1/accounts/:accountId/conversations',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = conversationInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for conversations');
      const result = await pool.query(
        `INSERT INTO conversations (account_id, contact_id, status)
         SELECT $1, id, $3 FROM contacts WHERE id = $2 AND account_id = $1
         RETURNING id, contact_id, status, inbox_id, assignee_id, team_id, priority, last_message, created_at`,
        [accountId, parsed.data.contactId, parsed.data.status],
      );
      return result.rows[0]
        ? reply.code(201).send(result.rows[0])
        : reply.notFound('Contact not found');
    },
  );

  app.get<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.notFound('Conversation not found');
      const result = await pool.query(
        'SELECT id, contact_id, status, inbox_id, assignee_id, team_id, priority, last_message, created_at FROM conversations WHERE account_id = $1 AND id = $2',
        [accountId, request.params.conversationId],
      );
      return result.rows[0] ?? reply.notFound('Conversation not found');
    },
  );

  app.patch<{ Params: { accountId: string; conversationId: string }; Body: { status?: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = statusInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for conversations');
      const result = await pool.query(
        `UPDATE conversations SET status = $3, updated_at = NOW()
         WHERE account_id = $1 AND id = $2
         RETURNING id, contact_id, status, inbox_id, assignee_id, team_id, priority, last_message, created_at`,
        [accountId, request.params.conversationId, parsed.data.status],
      );
      if (result.rows[0]) {
        emitRealtime(accountId, 'conversation:status_updated', result.rows[0], request.params.conversationId);
        await executeAutomations(accountId, {
          name: 'conversation.status_updated',
          payload: { ...result.rows[0], conversationId: request.params.conversationId },
        });
      }
      return result.rows[0] ?? reply.notFound('Conversation not found');
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/assignments',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = assignmentInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for assignments');

      const teamId = parsed.data.team_id ?? (parsed.data.assignee_type === 'team' ? parsed.data.assignee_id : null);
      const assigneeId = parsed.data.assignee_type === 'team' ? null : parsed.data.assignee_id ?? null;
      const result = await pool.query(
        `UPDATE conversations SET assignee_id = $3, team_id = $4, updated_at = NOW()
         WHERE account_id = $1 AND id = $2
         AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM users WHERE id = $3 AND account_id = $1))
         AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM teams WHERE id = $4 AND account_id = $1))
         RETURNING id, contact_id, status, inbox_id, assignee_id, team_id, priority, last_message, created_at`,
        [accountId, request.params.conversationId, assigneeId, teamId],
      );
      if (result.rows[0]) {
        emitRealtime(accountId, 'conversation:assignment_updated', result.rows[0], request.params.conversationId);
        await executeAutomations(accountId, {
          name: 'conversation.assignment_updated',
          payload: { ...result.rows[0], conversationId: request.params.conversationId },
        });
      }

      return result.rows[0] ?? reply.notFound('Conversation or assignee not found');
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/inbox',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = inboxInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for inboxes');
      const result = await pool.query(
        `UPDATE conversations SET inbox_id = $3, updated_at = NOW()
         WHERE account_id = $1 AND id = $2
         AND ($3::uuid IS NULL OR EXISTS (
           SELECT 1 FROM inboxes WHERE id = $3 AND account_id = $1
         ))
         RETURNING id, inbox_id`,
        [accountId, request.params.conversationId, parsed.data.inbox_id],
      );
      if (result.rows[0]) {
        emitRealtime(accountId, 'conversation:inbox_updated', result.rows[0], request.params.conversationId);
        await executeAutomations(accountId, {
          name: 'conversation.inbox_updated',
          payload: { ...result.rows[0], conversationId: request.params.conversationId },
        });
      }
      return result.rows[0] ?? reply.notFound('Conversation or inbox not found');
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/toggle_priority',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = z.object({ priority: z.coerce.number().int().min(0).max(3) }).safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for priorities');
      const result = await pool.query(
        `UPDATE conversations SET priority = $3, updated_at = NOW()
         WHERE account_id = $1 AND id = $2
         RETURNING id, priority`,
        [accountId, request.params.conversationId, parsed.data.priority],
      );
      if (result.rows[0]) {
        emitRealtime(accountId, 'conversation:priority_updated', result.rows[0], request.params.conversationId);
        await executeAutomations(accountId, {
          name: 'conversation.priority_updated',
          payload: { ...result.rows[0], conversationId: request.params.conversationId },
        });
      }
      return result.rows[0] ?? reply.notFound('Conversation not found');
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/toggle_status',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = statusInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for conversations');
      const result = await pool.query(
        `UPDATE conversations SET status = $3, updated_at = NOW()
         WHERE account_id = $1 AND id = $2
         RETURNING id, contact_id, status, last_message, created_at`,
        [accountId, request.params.conversationId, parsed.data.status],
      );
      if (result.rows[0]) {
        emitRealtime(accountId, 'conversation:status_updated', result.rows[0], request.params.conversationId);
        await executeAutomations(accountId, {
          name: 'conversation.status_updated',
          payload: { ...result.rows[0], conversationId: request.params.conversationId },
        });
      }
      return result.rows[0] ?? reply.notFound('Conversation not found');
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/update_last_seen',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for conversations');
      const result = await pool.query(
        `INSERT INTO conversation_reads (conversation_id, account_id, user_id)
         SELECT id, $1, $3 FROM conversations
         WHERE account_id = $1 AND id = $2
         ON CONFLICT (conversation_id, user_id)
         DO UPDATE SET last_seen_at = NOW()
         RETURNING conversation_id, last_seen_at`,
        [accountId, request.params.conversationId, request.user.id],
      );
      if (result.rows[0]) {
        emitRealtime(accountId, 'conversation:read_updated', {
          conversationId: request.params.conversationId,
          unreadCount: 0,
          lastSeenAt: result.rows[0].last_seen_at,
        }, request.params.conversationId);
        await executeAutomations(accountId, {
          name: 'conversation.read_updated',
          payload: {
            conversationId: request.params.conversationId,
            unreadCount: 0,
            lastSeenAt: result.rows[0].last_seen_at,
          },
        });
      }
      return result.rows[0] ?? reply.notFound('Conversation not found');
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/unread',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for conversations');
      const result = await pool.query(
        `INSERT INTO conversation_reads (conversation_id, account_id, user_id, last_seen_at)
         SELECT id, $1, $3, TO_TIMESTAMP(0) FROM conversations
         WHERE account_id = $1 AND id = $2
         ON CONFLICT (conversation_id, user_id)
         DO UPDATE SET last_seen_at = TO_TIMESTAMP(0)
         RETURNING conversation_id, last_seen_at`,
        [accountId, request.params.conversationId, request.user.id],
      );
      if (result.rows[0]) {
        emitRealtime(accountId, 'conversation:read_updated', {
          conversationId: request.params.conversationId,
          unreadCount: 1,
          lastSeenAt: result.rows[0].last_seen_at,
        }, request.params.conversationId);
        await executeAutomations(accountId, {
          name: 'conversation.read_updated',
          payload: {
            conversationId: request.params.conversationId,
            unreadCount: 1,
            lastSeenAt: result.rows[0].last_seen_at,
          },
        });
      }
      return result.rows[0] ?? reply.notFound('Conversation not found');
    },
  );

  app.get<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/messages',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return { payload: [] };
      const result = await pool.query(
        `SELECT id, conversation_id, content, private, message_type, status, created_at,
                COALESCE((
                  SELECT json_agg(json_build_object(
                    'id', a.id, 'filename', a.filename,
                    'contentType', a.content_type, 'byteSize', a.byte_size
                  ) ORDER BY a.created_at)
                  FROM message_attachments a
                  WHERE a.message_id = messages.id AND a.account_id = $1
                ), '[]'::json) AS attachments
         FROM messages WHERE account_id = $1 AND conversation_id = $2
         ORDER BY created_at ASC`,
        [accountId, request.params.conversationId],
      );
      return { payload: result.rows };
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/messages',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = await parseMessageRequest(request);
      if (!parsed) return reply.badRequest('Invalid message payload');
      if (!pool) return reply.serviceUnavailable('Database is required for messages');
      const result = await pool.query(
        `WITH valid_conversation AS (
          SELECT id FROM conversations WHERE id = $2 AND account_id = $1
        ), inserted AS (
          INSERT INTO messages (account_id, conversation_id, content, private)
          SELECT $1, id, $3, $4 FROM valid_conversation
          RETURNING id, conversation_id, content, private, message_type, status, created_at
        )
        SELECT * FROM inserted`,
        [accountId, request.params.conversationId, parsed.message.content, parsed.message.private],
      );
      if (!result.rows[0]) return reply.notFound('Conversation not found');
      for (const attachment of parsed.attachments) {
        const storageKey = attachmentStorage
          ? await attachmentStorage.put(accountId, attachment.filename, attachment.data)
          : null;
        await pool.query(
          `INSERT INTO message_attachments
           (message_id, account_id, filename, content_type, byte_size, content, storage_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            result.rows[0].id,
            accountId,
            attachment.filename,
            attachment.mimetype,
            attachment.data.length,
            storageKey ? null : attachment.data,
            storageKey,
          ],
        );
      }
      const attachments = await pool.query(
        `SELECT id, filename, content_type AS "contentType", byte_size AS "byteSize"
         FROM message_attachments WHERE account_id = $1 AND message_id = $2
         ORDER BY created_at`,
        [accountId, result.rows[0].id],
      );
      result.rows[0].attachments = attachments.rows;
      await pool.query(
        'UPDATE conversations SET last_message = $3, updated_at = NOW() WHERE account_id = $1 AND id = $2',
        [accountId, request.params.conversationId, parsed.message.content],
      );
      emitRealtime(accountId, 'message:created', result.rows[0], request.params.conversationId);
      await executeAutomations(accountId, {
        id: result.rows[0].id,
        name: 'message.created',
        payload: {
          ...result.rows[0],
          conversationId: request.params.conversationId,
        },
      });
      return reply.code(201).send(result.rows[0]);
    },
  );

  app.get<{
    Params: { accountId: string; conversationId: string; messageId: string; attachmentId: string };
  }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/messages/:messageId/attachments/:attachmentId',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for attachments');
      const result = await pool.query(
        `SELECT filename, content_type, content, storage_key
         FROM message_attachments
         WHERE id = $1 AND account_id = $2 AND message_id = $3
           AND EXISTS (
             SELECT 1 FROM messages
             WHERE messages.id = message_attachments.message_id
               AND messages.conversation_id = $4
               AND messages.account_id = $2
           )`,
        [
          request.params.attachmentId,
          accountId,
          request.params.messageId,
          request.params.conversationId,
        ],
      );
      const attachment = result.rows[0];
      if (!attachment) return reply.notFound('Attachment not found');
      const content = attachment.storage_key
        ? await attachmentStorage?.get(attachment.storage_key)
        : attachment.content;
      if (!content) return reply.internalServerError('Attachment storage is not configured');
      return reply
        .header('Content-Type', attachment.content_type)
        .header('Content-Disposition', `inline; filename="${attachment.filename}"`)
        .send(content);
    },
  );

  app.delete<{ Params: { accountId: string; conversationId: string; messageId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/messages/:messageId',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for messages');
      const attachmentKeys = await pool.query(
        `SELECT storage_key FROM message_attachments
         WHERE account_id = $1 AND message_id = $2`,
        [accountId, request.params.messageId],
      );
      const result = await pool.query(
        `DELETE FROM messages
         WHERE account_id = $1 AND conversation_id = $2 AND id = $3
         RETURNING id`,
        [accountId, request.params.conversationId, request.params.messageId],
      );
      if (!result.rows[0]) return reply.notFound('Message not found');
      if (attachmentStorage) {
        for (const row of attachmentKeys.rows) {
          if (row.storage_key) await attachmentStorage.delete(row.storage_key);
        }
      }
      emitRealtime(accountId, 'message:deleted', { messageId: request.params.messageId }, request.params.conversationId);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { accountId: string; conversationId: string; messageId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId/messages/:messageId/retry',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for messages');
      const result = await pool.query(
        `UPDATE messages SET status = 'sent'
         WHERE account_id = $1 AND conversation_id = $2 AND id = $3
         RETURNING id, conversation_id, content, private, message_type, status, created_at`,
        [accountId, request.params.conversationId, request.params.messageId],
      );
      if (result.rows[0]) {
        emitRealtime(accountId, 'message:updated', result.rows[0], request.params.conversationId);
      }
      return result.rows[0] ?? reply.notFound('Message not found');
    },
  );

  app.delete<{ Params: { accountId: string; conversationId: string } }>(
    '/api/v1/accounts/:accountId/conversations/:conversationId',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      if (!pool) return reply.serviceUnavailable('Database is required for conversations');
      const attachmentKeys = await pool.query(
        `SELECT storage_key FROM message_attachments
         WHERE account_id = $1 AND message_id IN (
           SELECT id FROM messages WHERE account_id = $1 AND conversation_id = $2
         )`,
        [accountId, request.params.conversationId],
      );
      const result = await pool.query(
        'DELETE FROM conversations WHERE account_id = $1 AND id = $2 RETURNING id',
        [accountId, request.params.conversationId],
      );
      if (!result.rows[0]) return reply.notFound('Conversation not found');
      if (attachmentStorage) {
        for (const row of attachmentKeys.rows) {
          if (row.storage_key) await attachmentStorage.delete(row.storage_key);
        }
      }
      return reply.code(204).send();
    },
  );
}
