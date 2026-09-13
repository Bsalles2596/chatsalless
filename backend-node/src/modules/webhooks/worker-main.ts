import { startWebhookWorker } from './webhook.worker.js';

const worker = startWebhookWorker();
if (!worker) {
  throw new Error('REDIS_URL is required to start the webhook worker');
}

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
