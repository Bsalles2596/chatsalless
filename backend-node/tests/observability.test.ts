import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('observability', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  it('exposes Prometheus-compatible HTTP metrics', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('chatsalles_http_requests_total');
    expect(response.body).toContain('method="GET"');
  });

  afterAll(async () => {
    await app.close();
  });
});
