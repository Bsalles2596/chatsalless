import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAccountAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.user.role === 'admin') return;
  await reply.forbidden('Administrator permission required');
}
