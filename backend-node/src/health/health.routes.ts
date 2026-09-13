import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    name: 'ChatSalles',
    status: 'ok',
    service: 'backend-node',
    timestamp: new Date().toISOString(),
  }));
}
