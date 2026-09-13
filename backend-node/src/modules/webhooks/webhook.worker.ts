import { Worker } from 'bullmq';
import { deliverWebhookJob } from './webhook.service.js';
import { redisConnection, webhookDeadLetterQueue } from './webhook.queue.js';
import { recordWebhookJob } from './webhook.metrics.js';
import { recordWebhookMetric } from '../../shared/observability/metrics.js';
import { writeStructuredLog } from '../../shared/observability/structured-log.js';

const queuePrefix = process.env.BULLMQ_QUEUE_PREFIX?.trim();
const webhookQueueName = queuePrefix ? `${queuePrefix}-chatsalles-webhooks` : 'chatsalles-webhooks';

export function startWebhookWorker(): Worker | undefined {
  if (!redisConnection) return undefined;
  const worker = new Worker(webhookQueueName, async job => {
    await deliverWebhookJob(job.data, job.attemptsMade + 1);
    recordWebhookJob('succeeded');
    recordWebhookMetric('processed');
    recordWebhookMetric('succeeded');
    await writeStructuredLog({ type: 'webhook.job', status: 'succeeded', jobId: job.id, attempts: job.attemptsMade + 1 });
  }, {
    connection: redisConnection,
    concurrency: 10,
  });
  worker.on('failed', async (job, error) => {
    recordWebhookJob(job && job.attemptsMade < Number(job.opts.attempts ?? 1) ? 'retried' : 'failed');
    recordWebhookMetric('processed');
    recordWebhookMetric(job && job.attemptsMade < Number(job.opts.attempts ?? 1) ? 'retried' : 'failed');
    await writeStructuredLog({
      type: 'webhook.job',
      status: job && job.attemptsMade < Number(job.opts.attempts ?? 1) ? 'retrying' : 'failed',
      jobId: job?.id,
      error: error.message,
    });
    if (!job || !webhookDeadLetterQueue || job.attemptsMade < Number(job.opts.attempts ?? 1)) return;
    await webhookDeadLetterQueue.add('dead-letter-webhook', {
      ...job.data,
      error: error.message,
      failedAt: new Date().toISOString(),
    }, { removeOnComplete: 1000 });
    recordWebhookMetric('dead_letter');
  });
  return worker;
}
