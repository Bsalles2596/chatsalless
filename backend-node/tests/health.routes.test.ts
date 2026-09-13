import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const app = buildApp();

describe('health endpoint', () => {
  it('identifies the ChatSalles backend', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.name).toBe('ChatSalles');
    expect(body.status).toBe('ok');
  });

  it('describes the API at the root endpoint', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.name).toBe('ChatSalles');
    expect(body.endpoints.login).toBe('POST /api/v1/auth/login');
  });
});

afterAll(async () => {
  await app.close();
});
