import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { env } from '../../config/env.js';

let directoryReady: Promise<void> | undefined;

async function ensureDirectory(): Promise<void> {
  directoryReady ??= mkdir(dirname(env.LOG_FILE_PATH), { recursive: true }).then(() => undefined);
  await directoryReady;
}

export async function writeStructuredLog(entry: Record<string, unknown>): Promise<void> {
  await ensureDirectory();
  await appendFile(env.LOG_FILE_PATH, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'chatsalles-api',
    ...entry,
  })}\n`, 'utf8');
}
