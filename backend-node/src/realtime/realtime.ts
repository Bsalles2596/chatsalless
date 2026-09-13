import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../config/env.js';
import { redisConnection } from '../modules/webhooks/webhook.queue.js';
import { Redis } from 'ioredis';

let io: Server | null = null;

export const accountRoom = (accountId: string) => `account:${accountId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

export function setupRealtime(app: FastifyInstance): Server {
  io = new Server(app.server, {
    cors: { origin: true, credentials: true },
  });
  if (env.REDIS_URL && redisConnection) {
    const publisher = redisConnection;
    const subscriber = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      commandTimeout: 1000,
      lazyConnect: true,
    });
    io.adapter(createAdapter(publisher, subscriber));
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') return next(new Error('Authentication required'));
    try {
      const payload = app.jwt.verify<{ id: string; accountId: string; email: string }>(token);
      socket.data.user = payload;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', socket => {
    const accountId = socket.data.user.accountId;
    socket.join(accountRoom(accountId));
    socket.on('conversation:subscribe', (conversationId: unknown) => {
      if (typeof conversationId === 'string') socket.join(conversationRoom(conversationId));
    });
    socket.on('conversation:unsubscribe', (conversationId: unknown) => {
      if (typeof conversationId === 'string') socket.leave(conversationRoom(conversationId));
    });
  });

  return io;
}

export function emitRealtime(
  accountId: string,
  event: string,
  payload: Record<string, unknown>,
  conversationId?: string,
): void {
  // Account rooms are the authorization boundary; clients filter by conversation.
  // Do not broadcast the conversation room independently, or an authenticated
  // client could subscribe to an arbitrary conversation room.
  io?.to(accountRoom(accountId)).emit(event, {
    ...payload,
    ...(conversationId ? { conversationId } : {}),
  });
}
