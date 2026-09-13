import {
  DeleteObjectCommand,
  type DeleteObjectCommandInput,
  GetObjectCommand,
  type GetObjectCommandInput,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { S3AttachmentStorage } from '../src/shared/storage/attachmentStorage.js';

class FakeS3Client extends S3Client {
  objects = new Map<string, Buffer>();

  override async send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand) {
    const input = command.input;
    const key = `${input.Bucket}/${input.Key}`;
    if (command instanceof PutObjectCommand) {
      const putInput = input as PutObjectCommandInput;
      this.objects.set(key, Buffer.from(putInput.Body as Buffer));
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const getInput = input as GetObjectCommandInput;
      const objectKey = `${getInput.Bucket}/${getInput.Key}`;
      const body = this.objects.get(objectKey);
      return {
        Body: {
          transformToByteArray: async () => body ?? new Uint8Array(),
        },
      };
    }
    const deleteInput = input as DeleteObjectCommandInput;
    this.objects.delete(`${deleteInput.Bucket}/${deleteInput.Key}`);
    return {};
  }
}

describe('S3AttachmentStorage', () => {
  it('uploads, downloads, and deletes objects using the S3 contract', async () => {
    const client = new FakeS3Client({});
    const storage = new S3AttachmentStorage(client, 'test-bucket');

    const key = await storage.put('account-id', '../invoice.pdf', Buffer.from('file-content'));
    expect(key).toMatch(/^account-id\/[0-9a-f-]+-invoice\.pdf$/);
    expect(await storage.get(key)).toEqual(Buffer.from('file-content'));

    await storage.delete(key);
    expect(await storage.get(key)).toEqual(Buffer.alloc(0));
  });
});
