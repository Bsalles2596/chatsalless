import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/shared/db/pool.js';

const app = buildApp();
const accountId = '00000000-0000-0000-0000-000000000001';

describe('contacts API', () => {
  it('creates and lists contacts scoped to an account', async () => {
    await app.ready();
    if (pool) {
      await pool.query(
        `INSERT INTO accounts (id, name) VALUES ($1, 'Test account')
         ON CONFLICT (id) DO NOTHING`,
        [accountId],
      );
      await pool.query('DELETE FROM contacts WHERE account_id = $1', [accountId]);
    }
    const token = app.jwt.sign({
      id: '00000000-0000-0000-0000-000000000002',
      accountId,
      email: 'test@example.com',
    });
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/contacts`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Maria Silva', email: 'maria@example.com' },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      accountId,
      name: 'Maria Silva',
      email: 'maria@example.com',
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/contacts?q=Maria`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json().payload).toHaveLength(1);
  });
});

afterAll(async () => {
  await app.close();
});
