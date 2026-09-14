import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { healthRoutes } from './health/health.routes.js';
import { accountsRoutes } from './modules/accounts/accounts.routes.js';
import { contactsRoutes } from './modules/contacts/contacts.routes.js';
import { automationsRoutes } from './modules/automations/automations.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { conversationsRoutes } from './modules/conversations/conversations.routes.js';
import fastifyJwt from '@fastify/jwt';
import { operationsRoutes } from './modules/operations/operations.routes.js';
import { providerConfigRoutes } from './modules/operations/provider-config.routes.js';
import { webhooksRoutes } from './modules/webhooks/webhooks.routes.js';
import { rateLimit } from './shared/http/rate-limit.js';
import { recordRequest, renderPrometheusMetrics } from './shared/observability/metrics.js';
import { writeStructuredLog } from './shared/observability/structured-log.js';

export function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  const requestStartedAt = new WeakMap<object, bigint>();
  app.addHook('onRequest', async (request, reply) => {
    requestStartedAt.set(request, process.hrtime.bigint());
    await rateLimit(request, reply);
  });
  app.addHook('onResponse', async request => {
    const startedAt = requestStartedAt.get(request);
    const durationMs = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1_000_000 : 0;
    recordRequest(request.method, request.raw.statusCode ?? 500, durationMs);
    await writeStructuredLog({
      type: 'http.request',
      requestId: request.id,
      method: request.method,
      path: request.url.split('?')[0],
      statusCode: request.raw.statusCode,
      durationMs,
      remoteAddress: request.ip,
    });
  });

  app.register(cors, { origin: env.FRONTEND_URL });
  app.register(sensible);
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.register(fastifyJwt, { secret: env.JWT_SECRET });
  app.get('/', async () => ({
    name: 'ChatSalles',
    service: 'backend-node',
    status: 'ok',
    endpoints: {
      health: '/health',
      login: 'POST /api/v1/auth/login',
      contacts: 'GET /api/v1/accounts/:accountId/contacts',
    },
  }));
  app.get('/metrics', async (_request, reply) => {
    reply.type('text/plain; version=0.0.4').send(renderPrometheusMetrics());
  });
  app.register(authRoutes);
  app.register(healthRoutes);
  app.register(accountsRoutes);
  app.register(contactsRoutes);
  app.register(conversationsRoutes);
  app.register(operationsRoutes);
  app.register(providerConfigRoutes);
  app.register(automationsRoutes);
  app.register(webhooksRoutes);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const errorRecord = typeof error === 'object' && error !== null ? error : undefined;
    const statusCode = errorRecord && 'statusCode' in errorRecord && typeof errorRecord.statusCode === 'number'
      ? errorRecord.statusCode
      : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';
    const name = error instanceof Error ? error.name : 'Error';

    return reply.status(statusCode).send({
      error: name,
      message: statusCode === 500 ? 'Internal server error' : message,
    });
  });

  return app;
}
