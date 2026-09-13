let processed = 0;
let succeeded = 0;
let failed = 0;
let retried = 0;

export function recordWebhookJob(status: 'succeeded' | 'failed' | 'retried'): void {
  processed += 1;
  if (status === 'succeeded') succeeded += 1;
  if (status === 'failed') failed += 1;
  if (status === 'retried') retried += 1;
}

export function getWebhookWorkerMetrics() {
  return { processed, succeeded, failed, retried };
}
