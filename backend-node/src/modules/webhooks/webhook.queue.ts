import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

export const redisConnection = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
  : undefined;

const queuePrefix = process.env.BULLMQ_QUEUE_PREFIX?.trim();
const webhookQueueName = queuePrefix ? `${queuePrefix}-chatsalles-webhooks` : 'chatsalles-webhooks';
const webhookDeadLetterQueueName = queuePrefix
  ? `${queuePrefix}-chatsalles-webhooks-dead-letter`
  : 'chatsalles-webhooks-dead-letter';

export const webhookQueue = redisConnection
  ? new Queue(webhookQueueName, { connection: redisConnection })
  : undefined;

export const webhookDeadLetterQueue = redisConnection
  ? new Queue(webhookDeadLetterQueueName, { connection: redisConnection })
  : undefined;
