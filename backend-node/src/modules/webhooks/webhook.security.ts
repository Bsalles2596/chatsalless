import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { env } from '../../config/env.js';

const algorithm = 'aes-256-gcm';

export function encryptWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, Buffer.from(env.WEBHOOK_ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptWebhookSecret(value: string): string {
  if (/^[a-f0-9]{64}$/i.test(value)) return value;
  const [version, ivHex, tagHex, encryptedHex] = value.split(':');
  if (version !== 'v1' || !ivHex || !tagHex || !encryptedHex) throw new Error('Invalid webhook secret');
  const decipher = createDecipheriv(algorithm, Buffer.from(env.WEBHOOK_ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
}

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc')
      || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return true;
}

export async function validateWebhookUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && url.protocol === 'http:')) {
    throw new Error('Webhook URL must use HTTPS');
  }
  if (url.username || url.password) throw new Error('Webhook URL cannot include credentials');
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || (env.NODE_ENV === 'production' && records.some(record => isPrivateAddress(record.address)))) {
    throw new Error('Webhook URL resolves to a private or local address');
  }
}
