import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
  LOG_FILE_PATH: z.string().default('./logs/chatsalles.jsonl'),
  JWT_SECRET: z.string().min(32).default('development-only-change-me-please-32'),
  STORAGE_DRIVER: z.enum(['bytea', 'local', 's3']).default('bytea'),
  STORAGE_PATH: z.string().default('./storage/attachments'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  REDIS_URL: z.string().url().optional(),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().max(30000).default(5000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
  WEBHOOK_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).default('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
});

const parsedEnv = envSchema.parse(process.env);
if (parsedEnv.NODE_ENV === 'production') {
  if (parsedEnv.JWT_SECRET === 'development-only-change-me-please-32') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  if (parsedEnv.WEBHOOK_ENCRYPTION_KEY === '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff') {
    throw new Error('WEBHOOK_ENCRYPTION_KEY must be configured in production');
  }
}

export const env = parsedEnv;
