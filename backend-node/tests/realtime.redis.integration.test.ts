import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { buildApp } from '../src/app.js';
import { accountRoom, setupRealtime } from '../src/realtime/realtime.js';
import { redisConnection } from '../src/modules/webhooks/webhook.queue.js';
import { env } from '../src/config/env.js';

const accountId = '00000000-0000-0000-0000-000000000061';
const describeRedis = env.REDIS_URL ? describe : describe.skip;

describeRedis('Socket.IO Redis Adapter', () => {
  const appOne = buildApp();
  const appTwo = buildApp();
  let clientOne: Socket;
  let clientTwo: Socket;
  let portOne: number;
  let portTwo: number;
  let ioOne: Server;

  beforeAll(async () => {
    ioOne = setupRealtime(appOne);
    const ioTwo = setupRealtime(appTwo);
    await Promise.all([
      appOne.listen({ host: '127.0.0.1', port: 0 }),
      appTwo.listen({ host: '127.0.0.1', port: 0 }),
    ]);
    const addressOne = appOne.server.address();
    const addressTwo = appTwo.server.address();
    if (!addressOne || typeof addressOne === 'string' || !addressTwo || typeof addressTwo === 'string') {
      throw new Error('Redis realtime instances did not start');
    }
    portOne = addressOne.port;
    portTwo = addressTwo.port;
    const token = appOne.jwt.sign({ id: 'redis-user', accountId, email: 'redis@example.com' });
    clientOne = createClient(`http://127.0.0.1:${portOne}`, { auth: { token }, forceNew: true });
    clientTwo = createClient(`http://127.0.0.1:${portTwo}`, { auth: { token }, forceNew: true });
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        clientOne.once('connect', resolve);
        clientOne.once('connect_error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        clientTwo.once('connect', resolve);
        clientTwo.once('connect_error', reject);
      }),
    ]);
    expect(ioOne).not.toBe(ioTwo);
  });

  it('broadcasts an account event from one API instance to the other', async () => {
    const received = new Promise<Record<string, unknown>>(resolve => {
      clientTwo.once('message:created', resolve);
    });

    ioOne.to(accountRoom(accountId)).emit('message:created', {
      id: 'redis-message-1',
      content: 'cross-instance',
    });

    await expect(received).resolves.toMatchObject({
      id: 'redis-message-1',
      content: 'cross-instance',
    });
  });

  it('does not deliver events to a different account room', async () => {
    const otherToken = appTwo.jwt.sign({ id: 'other-user', accountId: '00000000-0000-0000-0000-000000000062', email: 'other@example.com' });
    const otherClient = createClient(`http://127.0.0.1:${portTwo}`, { auth: { token: otherToken }, forceNew: true });
    await new Promise<void>((resolve, reject) => {
      otherClient.once('connect', resolve);
      otherClient.once('connect_error', reject);
    });
    let received = false;
    otherClient.once('message:created', () => { received = true; });

    ioOne.to(accountRoom(accountId)).emit('message:created', { id: 'redis-message-2' });
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(received).toBe(false);
    otherClient.close();
  });

  afterAll(async () => {
    clientOne?.close();
    clientTwo?.close();
    await Promise.all([appOne.close(), appTwo.close()]);
    await redisConnection?.quit();
  });
});
