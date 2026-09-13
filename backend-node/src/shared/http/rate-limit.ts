import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { redisOperationalConnection } from '../../modules/webhooks/webhook.queue.js';

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function consumeRateLimit(
  key: string,
  max = env.RATE_LIMIT_MAX,
  windowMs = env.RATE_LIMIT_WINDOW_MS,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = Date.now();
  if (redisOperationalConnection) {
    try {
      const redisKey = `chatsalles:rate-limit:${key}`;
      const count = await redisOperationalConnection.incr(redisKey);
      if (count === 1) await redisOperationalConnection.pexpire(redisKey, windowMs);
      const ttl = Math.max(1, await redisOperationalConnection.pttl(redisKey));
      return { allowed: count <= max, retryAfter: Math.ceil(ttl / 1000) };
    } catch (error) {
      process.emitWarning(`Redis rate limit unavailable; using local fallback: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: Math.ceil(windowMs / 1000) };
  }
  current.count += 1;
  return {
    allowed: current.count <= max,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export async function rateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const key = `${request.ip}:${request.url.split('?')[0]}`;
  const result = await consumeRateLimit(key);
  if (!result.allowed) {
    reply.header('retry-after', result.retryAfter);
    await reply.tooManyRequests('Rate limit exceeded');
  }
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, env.RATE_LIMIT_WINDOW_MS);
cleanup.unref();
