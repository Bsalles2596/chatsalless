import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { decryptWebhookSecret } from '../src/modules/webhooks/webhook.security.js';
import { pool } from '../src/shared/db/pool.js';

const app = buildApp();
const accountId = '00000000-0000-0000-0000-000000000091';
const foreignAccountId = '00000000-0000-0000-0000-000000000092';
const userId = '00000000-0000-0000-0000-000000000093';

describe('provider configuration API', () => {
  let inboxId = '';
  beforeAll(async () => {
    await app.ready();
    if (!pool) return;
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES
        ($1, 'Provider test account'), ($2, 'Foreign provider account')
       ON CONFLICT (id) DO NOTHING`,
      [accountId, foreignAccountId],
    );
    await pool.query(
      `INSERT INTO users (id, account_id, email, password_digest)
       VALUES ($1, $2, 'provider@example.com', 'test')
       ON CONFLICT (id) DO NOTHING`,
      [userId, accountId],
    );
    const result = await pool.query(
      `INSERT INTO inboxes (account_id, name, channel_type)
       VALUES ($1, 'Provider WhatsApp', 'whatsapp') RETURNING id`,
      [accountId],
    );
    inboxId = result.rows[0].id;
  });

  it('validates channel/provider, encrypts credentials, and supports rotation', async () => {
    if (!pool) return;
    const headers = {
      authorization: `Bearer ${app.jwt.sign({
        id: userId, accountId, email: 'provider@example.com', role: 'admin',
      })}`,
    };
    const mismatch = await app.inject({
      method: 'PUT',
      url: `/api/v1/accounts/${accountId}/inboxes/${inboxId}/provider`,
      headers,
      payload: { provider: 'telegram', credentials: { bot_token: 'token' } },
    });
    expect(mismatch.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'PUT',
      url: `/api/v1/accounts/${accountId}/inboxes/${inboxId}/provider`,
      headers,
      payload: { provider: 'whatsapp', credentials: { access_token: 'token' } },
    });
    expect(missing.statusCode).toBe(400);

    const configured = await app.inject({
      method: 'PUT',
      url: `/api/v1/accounts/${accountId}/inboxes/${inboxId}/provider`,
      headers,
      payload: {
        provider: 'whatsapp',
        enabled: true,
        publicConfig: { displayName: 'ChatSalles' },
        credentials: { access_token: 'token-a', phone_number_id: 'phone-1' },
      },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json()).toMatchObject({
      provider: 'whatsapp', enabled: true, hasCredentials: true,
      publicConfig: { displayName: 'ChatSalles' },
    });
    expect(JSON.stringify(configured.json())).not.toContain('token-a');

    const stored = await pool.query(
      'SELECT credentials_ciphertext FROM inbox_provider_configs WHERE account_id = $1 AND inbox_id = $2',
      [accountId, inboxId],
    );
    expect(stored.rows[0].credentials_ciphertext).not.toContain('token-a');
    expect(JSON.parse(decryptWebhookSecret(stored.rows[0].credentials_ciphertext))).toEqual({
      access_token: 'token-a', phone_number_id: 'phone-1',
    });

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/inboxes/${inboxId}/provider/rotate`,
      headers,
      payload: { access_token: 'token-b', phone_number_id: 'phone-2' },
    });
    expect(rotated.statusCode).toBe(200);
    expect(JSON.stringify(rotated.json())).not.toContain('token-b');
  });

  it('rejects provider configuration from another tenant', async () => {
    if (!pool) return;
    const headers = {
      authorization: `Bearer ${app.jwt.sign({
        id: userId, accountId, email: 'provider@example.com', role: 'admin',
      })}`,
    };
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${foreignAccountId}/inboxes/${inboxId}/provider`,
      headers,
    });
    expect(response.statusCode).toBe(403);
  });
});

afterAll(async () => {
  await app.close();
});
