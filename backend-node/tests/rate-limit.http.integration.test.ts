import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { redisConnection } from '../src/modules/webhooks/webhook.queue.js';

const describeRedis = env.REDIS_URL ? describe : describe.skip;

describeRedis('HTTP distributed rate limiting', () => {
  const appOne = buildApp();
  const appTwo = buildApp();
  let portOne: number;
  let portTwo: number;

  beforeAll(async () => {
    appOne.get('/rate-limit-probe-redis', async () => ({ ok: true }));
    appTwo.get('/rate-limit-probe-redis', async () => ({ ok: true }));
    await Promise.all([
      appOne.listen({ host: '127.0.0.1', port: 0 }),
      appTwo.listen({ host: '127.0.0.1', port: 0 }),
    ]);
    const addressOne = appOne.server.address();
    const addressTwo = appTwo.server.address();
    if (!addressOne || typeof addressOne === 'string' || !addressTwo || typeof addressTwo === 'string') {
      throw new Error('Rate limit API instances did not start');
    }
    portOne = addressOne.port;
    portTwo = addressTwo.port;
  });

  it('shares the HTTP limit between two API instances', async () => {
    const key = `chatsalles:rate-limit:127.0.0.1:/rate-limit-probe-redis`;
    await redisConnection?.del(key);
    const responses: number[] = [];
    for (let index = 0; index < env.RATE_LIMIT_MAX + 1; index += 1) {
      const port = index % 2 === 0 ? portOne : portTwo;
      const response = await fetch(`http://127.0.0.1:${port}/rate-limit-probe-redis`);
      responses.push(response.status);
    }
    expect(responses.filter(status => status === 429)).toHaveLength(1);
    await redisConnection?.del(key);
  });

  afterAll(async () => {
    await Promise.all([appOne.close(), appTwo.close()]);
    await redisConnection?.quit();
  });
});
