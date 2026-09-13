import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { contactsRepository } from './contacts.repository.js';
import { accountFromRequest, authenticate } from '../../shared/auth/auth.js';
import { pool } from '../../shared/db/pool.js';

const contactSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().optional(),
  phoneNumber: z.string().trim().min(1).optional(),
});

export async function contactsRoutes(app: FastifyInstance): Promise<void> {
  const listContacts = async (request: FastifyRequest) => {
    const accountId = accountFromRequest(request);

    const query = request.query as Record<string, unknown>;
    const page = Number(query.page ?? 1);
    const search = typeof query.q === 'string' ? query.q : '';
    const sort = typeof query.sort === 'string' ? query.sort : 'name';
    const result = await contactsRepository.list({ accountId, page, search, sort });

    return {
      payload: result.contacts,
      meta: { count: result.count, currentPage: page, totalPages: Math.ceil(result.count / 25) },
    };
  };

  app.get('/api/v1/contacts', { preHandler: authenticate }, listContacts);
  app.get('/api/v1/accounts/:accountId/contacts', { preHandler: authenticate }, listContacts);
  app.get('/api/v1/accounts/:accountId/contacts/search', { preHandler: authenticate }, listContacts);
  app.get('/api/v1/accounts/:accountId/contacts/active', { preHandler: authenticate }, listContacts);

  const createContact = async (
    request: FastifyRequest,
    reply: { badRequest: (message: string) => unknown; code: (status: number) => { send: (body: unknown) => unknown } },
  ) => {
    const accountId = accountFromRequest(request);
    const parsed = contactSchema.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
    const contact = await contactsRepository.create({ accountId, ...parsed.data });
    return reply.code(201).send(contact);
  };

  app.post('/api/v1/contacts', { preHandler: authenticate }, createContact);
  app.post('/api/v1/accounts/:accountId/contacts', { preHandler: authenticate }, createContact);

  app.get<{ Params: { accountId: string; id: string } }>(
    '/api/v1/accounts/:accountId/contacts/:id',
    { preHandler: authenticate }, async (request, reply) => {
      const contact = await contactsRepository.findById(accountFromRequest(request), request.params.id);
      return contact ? contact : reply.notFound('Contact not found');
    },
  );

  app.patch<{ Params: { accountId: string; id: string } }>(
    '/api/v1/accounts/:accountId/contacts/:id',
    { preHandler: authenticate }, async (request, reply) => {
      const parsed = contactSchema.partial().safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      const contact = await contactsRepository.update(
        accountFromRequest(request),
        request.params.id,
        parsed.data,
      );
      return contact ? contact : reply.notFound('Contact not found');
    },
  );

  app.delete<{ Params: { accountId: string; id: string } }>(
    '/api/v1/accounts/:accountId/contacts/:id',
    { preHandler: authenticate }, async (request, reply) => {
      const deleted = await contactsRepository.delete(accountFromRequest(request), request.params.id);
      return deleted ? reply.code(204).send() : reply.notFound('Contact not found');
    },
  );

  app.get<{ Params: { accountId: string; id: string } }>(
    '/api/v1/accounts/:accountId/contacts/:id/labels',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return { payload: [] };
      const result = await pool.query(
        'SELECT name FROM contact_labels WHERE account_id = $1 AND contact_id = $2 ORDER BY name',
        [accountId, request.params.id],
      );
      return { payload: result.rows.map(row => row.name) };
    },
  );

  app.post<{ Params: { accountId: string; id: string }; Body: { labels: string[] } }>(
    '/api/v1/accounts/:accountId/contacts/:id/labels',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const labels = z.array(z.string().trim().min(1)).safeParse(request.body?.labels);
      if (!labels.success) return reply.badRequest('labels must be an array of non-empty strings');
      if (pool) {
        await pool.query('DELETE FROM contact_labels WHERE account_id = $1 AND contact_id = $2', [
          accountId,
          request.params.id,
        ]);
        for (const name of [...new Set(labels.data)]) {
          await pool.query(
            'INSERT INTO contact_labels (account_id, contact_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [accountId, request.params.id, name],
          );
        }
      }
      return { payload: labels.data };
    },
  );

  app.get<{ Params: { accountId: string; id: string } }>(
    '/api/v1/accounts/:accountId/contacts/:id/notes',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return { payload: [] };
      const result = await pool.query(
        'SELECT id, content, created_at FROM contact_notes WHERE account_id = $1 AND contact_id = $2 ORDER BY created_at DESC',
        [accountId, request.params.id],
      );
      return { payload: result.rows };
    },
  );

  app.post<{ Params: { accountId: string; id: string }; Body: { content: string } }>(
    '/api/v1/accounts/:accountId/contacts/:id/notes',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const content = z.string().trim().min(1).safeParse(request.body?.content);
      if (!content.success) return reply.badRequest('content is required');
      if (!pool) return reply.code(201).send({ content: content.data });
      const result = await pool.query(
        'INSERT INTO contact_notes (account_id, contact_id, content) VALUES ($1, $2, $3) RETURNING id, content, created_at',
        [accountId, request.params.id, content.data],
      );
      return reply.code(201).send(result.rows[0]);
    },
  );

  app.get<{ Params: { accountId: string; id: string } }>(
    '/api/v1/accounts/:accountId/contacts/:id/conversations',
    { preHandler: authenticate },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return { payload: [] };
      const result = await pool.query(
        'SELECT id, status, last_message, created_at FROM conversations WHERE account_id = $1 AND contact_id = $2 ORDER BY created_at DESC',
        [accountId, request.params.id],
      );
      return { payload: result.rows };
    },
  );

  app.post<{ Params: { accountId: string }; Body: { name?: string; email?: string; phoneNumber?: string } }>(
    '/api/v1/accounts/:accountId/contacts/import',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const file = await request.file();
      if (!file) return reply.badRequest('import_file is required');
      const rows = (await file.toBuffer()).toString('utf8').split(/\r?\n/).filter(Boolean);
      if (rows.length < 2) return reply.badRequest('CSV must contain a header and at least one row');
      const headers = rows[0].split(',').map(value => value.trim().toLowerCase());
      let imported = 0;
      for (const row of rows.slice(1)) {
        const values = row.split(',').map(value => value.trim());
        const data = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
        if (!data.name) continue;
        await contactsRepository.create({
          accountId,
          name: data.name,
          email: data.email || undefined,
          phoneNumber: data.phone || data.phone_number || undefined,
        });
        imported += 1;
      }
      return reply.code(201).send({ imported });
    },
  );

  app.post<{ Params: { accountId: string }; Body: { payload?: unknown[]; label?: string } }>(
    '/api/v1/accounts/:accountId/contacts/export',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const result = await contactsRepository.list({ accountId, search: '' });
      const csv = [
        'id,name,email,phone_number',
        ...result.contacts.map(contact => [
          contact.id,
          contact.name,
          contact.email ?? '',
          contact.phoneNumber ?? '',
        ].map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')),
      ].join('\r\n');
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="contacts.csv"')
        .send(csv);
    },
  );
}
