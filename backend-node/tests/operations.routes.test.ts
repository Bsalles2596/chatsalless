import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/shared/db/pool.js';

const app = buildApp();
const accountId = '00000000-0000-0000-0000-000000000081';
const foreignAccountId = '00000000-0000-0000-0000-000000000082';
const userId = '00000000-0000-0000-0000-000000000083';

describe('operations API', () => {
  beforeAll(async () => {
    await app.ready();
    if (!pool) return;
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES
        ($1, 'Operations test account'),
        ($2, 'Foreign operations account')
       ON CONFLICT (id) DO NOTHING`,
      [accountId, foreignAccountId],
    );
    await pool.query(
      `INSERT INTO users (id, account_id, email, password_digest)
       VALUES ($1, $2, 'operations@example.com', 'test')
       ON CONFLICT (id) DO NOTHING`,
      [userId, accountId],
    );
    await pool.query('DELETE FROM inboxes WHERE account_id IN ($1, $2)', [accountId, foreignAccountId]);
    await pool.query('DELETE FROM teams WHERE account_id IN ($1, $2)', [accountId, foreignAccountId]);
  });

  it('creates, updates and deletes inboxes with validated channel types', async () => {
    if (!pool) return;
    const headers = {
      authorization: `Bearer ${app.jwt.sign({
        id: userId,
        accountId,
        email: 'operations@example.com',
        role: 'admin',
      })}`,
    };

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/inboxes`,
      headers,
      payload: { name: 'Invalid', channelType: 'carrier-pigeon' },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/inboxes`,
      headers,
      payload: { name: 'WhatsApp', channelType: 'whatsapp' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'WhatsApp', channelType: 'whatsapp' });

    const inboxId = created.json().id;
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${accountId}/inboxes/${inboxId}`,
      headers,
      payload: { name: 'Widget', channelType: 'web_widget' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Widget', channelType: 'web_widget' });

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/inboxes`,
      headers,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: inboxId, channelType: 'web_widget' }),
    ]));

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/accounts/${accountId}/inboxes/${inboxId}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('creates, updates and deletes teams within the authenticated account', async () => {
    if (!pool) return;
    const headers = {
      authorization: `Bearer ${app.jwt.sign({
        id: userId,
        accountId,
        email: 'operations@example.com',
        role: 'admin',
      })}`,
    };
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/teams`,
      headers,
      payload: { name: 'Support', description: 'Initial team' },
    });
    expect(created.statusCode).toBe(201);
    const teamId = created.json().id;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${accountId}/teams/${teamId}`,
      headers,
      payload: { name: 'Customer Support', description: 'Updated team' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Customer Support', description: 'Updated team' });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/accounts/${accountId}/teams/${teamId}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('rejects requests targeting another account', async () => {
    if (!pool) return;
    const headers = {
      authorization: `Bearer ${app.jwt.sign({
        id: userId,
        accountId,
        email: 'operations@example.com',
        role: 'admin',
      })}`,
    };

    const inboxes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${foreignAccountId}/inboxes`,
      headers,
    });
    const teams = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${foreignAccountId}/teams`,
      headers,
    });
    expect(inboxes.statusCode).toBe(403);
    expect(teams.statusCode).toBe(403);
  });
});

afterAll(async () => {
  await app.close();
});
