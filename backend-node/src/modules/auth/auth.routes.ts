import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../../shared/db/pool.js';
import { authenticate } from '../../shared/auth/auth.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/auth/me', { preHandler: authenticate }, async request => ({
    payload: {
      data: {
        id: request.user.id,
        email: request.user.email,
        account_id: request.user.accountId,
        accounts: [{ id: request.user.accountId, name: 'ChatSalles' }],
      },
    },
  }));

  app.get('/api/v1/auth/login', async (_request, reply) => reply.code(405).send({
    error: 'Method Not Allowed',
    message: 'Use POST /api/v1/auth/login with email and password',
  }));

  app.post('/api/v1/auth/login', async (request, reply) => {
    if (!pool) return reply.serviceUnavailable('Database is required for authentication');
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.badRequest('Valid email and password are required');
    const result = await pool.query(
      'SELECT id, account_id, email, password_digest, role FROM users WHERE email = $1',
      [parsed.data.email.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_digest))) {
      return reply.unauthorized('Invalid credentials');
    }
    const token = app.jwt.sign({
      id: user.id,
      accountId: user.account_id,
      email: user.email,
      role: user.role,
    });
    return { token, user: { id: user.id, accountId: user.account_id, email: user.email, role: user.role } };
  });
}
