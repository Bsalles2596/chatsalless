import type { FastifyInstance } from 'fastify';
import type { Account } from './account.types.js';

const accounts = new Map<string, Account>();

export async function accountsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/accounts', async () => Array.from(accounts.values()));

  app.post<{ Body: { name: string; locale?: string } }>(
    '/api/v1/accounts',
    async (request, reply) => {
      const account: Account = {
        id: crypto.randomUUID(),
        name: request.body.name,
        locale: request.body.locale ?? 'en',
        createdAt: new Date().toISOString(),
      };

      accounts.set(account.id, account);
      return reply.code(201).send(account);
    },
  );
}
