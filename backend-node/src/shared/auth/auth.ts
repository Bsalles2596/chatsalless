import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../../config/env.js';

export interface AuthUser {
  id: string;
  accountId: string;
  email: string;
  role?: 'admin' | 'agent';
}

export class AccountAccessError extends Error {
  statusCode = 403;

  constructor() {
    super('Account access denied');
    this.name = 'AccountAccessError';
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser;
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, { secret: env.JWT_SECRET });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.unauthorized('Authentication required');
  }
}

export function accountFromRequest(request: FastifyRequest): string {
  const params = request.params as Record<string, unknown>;
  const requestedAccount = typeof params.accountId === 'string' ? params.accountId : undefined;
  if (requestedAccount && requestedAccount !== request.user.accountId) {
    throw new AccountAccessError();
  }
  return request.user.accountId;
}
