import { buildApp } from './app.js';
import { env } from './config/env.js';
import { setupRealtime } from './realtime/realtime.js';
import { startWebhookWorker } from './modules/webhooks/webhook.worker.js';

const app = buildApp();
setupRealtime(app);
const webhookWorker = startWebhookWorker();

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  await webhookWorker?.close();
  process.exitCode = 1;
}
