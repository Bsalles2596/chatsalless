import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '../../config/env.js';

export interface AttachmentStorage {
  put(accountId: string, filename: string, data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

function safeFilename(filename: string): string {
  return basename(filename).replace(/[^\w.-]/g, '_');
}

class LocalAttachmentStorage implements AttachmentStorage {
  private readonly root = env.STORAGE_PATH;

  async put(accountId: string, filename: string, data: Buffer): Promise<string> {
    const key = join(accountId, `${randomUUID()}-${safeFilename(filename)}`);
    const filePath = join(this.root, key);
    await mkdir(join(this.root, accountId), { recursive: true });
    await writeFile(filePath, data, { flag: 'wx' });
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return readFile(join(this.root, key));
  }

  async delete(key: string): Promise<void> {
    await unlink(join(this.root, key));
  }
}

export class S3AttachmentStorage implements AttachmentStorage {
  private readonly bucket: string;

  private readonly client: S3Client;

  constructor(client?: S3Client, bucket = env.S3_BUCKET) {
    if (!bucket) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
    this.bucket = bucket;
    this.client =
      client ??
      new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials:
          env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: env.S3_ACCESS_KEY_ID,
                secretAccessKey: env.S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
  }

  async put(accountId: string, filename: string, data: Buffer): Promise<string> {
    const key = `${accountId}/${randomUUID()}-${safeFilename(filename)}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
      }),
    );
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error('S3 object has no body');
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const attachmentStorage: AttachmentStorage | undefined =
  env.STORAGE_DRIVER === 'local'
    ? new LocalAttachmentStorage()
    : env.STORAGE_DRIVER === 's3'
      ? new S3AttachmentStorage()
      : undefined;
