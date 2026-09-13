const baseUrl = process.env.LOAD_BASE_URL || 'http://127.0.0.1:3001';
const total = Number(process.env.LOAD_REQUESTS || 500);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 25);
const p95LimitMs = Number(process.env.LOAD_P95_LIMIT_MS || 500);
const errorRateLimit = Number(process.env.LOAD_ERROR_RATE || 0.01);

if (!Number.isInteger(total) || total < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error('LOAD_REQUESTS and LOAD_CONCURRENCY must be positive integers');
}

const durations = [];
let completed = 0;
let errors = 0;
let cursor = 0;

async function requestHealth() {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) errors += 1;
  } catch {
    errors += 1;
  } finally {
    durations.push(performance.now() - started);
    completed += 1;
  }
}

async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= total) return;
    await requestHealth();
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
durations.sort((a, b) => a - b);
const percentile = (value) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)];
const result = {
  baseUrl,
  requests: completed,
  errors,
  errorRate: errors / completed,
  p50Ms: Number(percentile(0.5).toFixed(2)),
  p95Ms: Number(percentile(0.95).toFixed(2)),
  p99Ms: Number(percentile(0.99).toFixed(2)),
  elapsedMs: Number((performance.now() - started).toFixed(2)),
};
console.log(JSON.stringify(result, null, 2));

if (result.errorRate > errorRateLimit || result.p95Ms > p95LimitMs) {
  process.exitCode = 1;
}
