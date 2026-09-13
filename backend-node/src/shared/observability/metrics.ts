const requests = new Map<string, number>();
let requestDurationMs = 0;
let requestCount = 0;
const webhookJobs = { processed: 0, succeeded: 0, failed: 0, retried: 0, dead_letter: 0 };

export function recordWebhookMetric(status: keyof typeof webhookJobs): void {
  webhookJobs[status] += 1;
}

export function recordRequest(method: string, statusCode: number, durationMs: number): void {
  const key = `${method}|${statusCode}`;
  requests.set(key, (requests.get(key) ?? 0) + 1);
  requestDurationMs += durationMs;
  requestCount += 1;
}

export function renderPrometheusMetrics(): string {
  const lines = [
    '# HELP chatsalles_http_requests_total Total HTTP requests by method and status.',
    '# TYPE chatsalles_http_requests_total counter',
  ];
  for (const [key, count] of requests) {
    const [method, status] = key.split('|');
    lines.push(`chatsalles_http_requests_total{method="${method}",status="${status}"} ${count}`);
  }
  lines.push(
    '# HELP chatsalles_http_request_duration_ms_sum Sum of HTTP request durations in milliseconds.',
    '# TYPE chatsalles_http_request_duration_ms_sum counter',
    `chatsalles_http_request_duration_ms_sum ${requestDurationMs}`,
    '# HELP chatsalles_http_request_duration_ms_count Number of measured HTTP requests.',
    '# TYPE chatsalles_http_request_duration_ms_count counter',
    `chatsalles_http_request_duration_ms_count ${requestCount}`,
    '# HELP chatsalles_webhook_jobs_total Webhook jobs processed by outcome.',
    '# TYPE chatsalles_webhook_jobs_total counter',
    ...Object.entries(webhookJobs).map(([status, count]) =>
      `chatsalles_webhook_jobs_total{status="${status}"} ${count}`),
  );
  return `${lines.join('\n')}\n`;
}
