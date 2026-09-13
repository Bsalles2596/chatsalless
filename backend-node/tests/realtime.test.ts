import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { buildApp } from '../src/app.js';
import { setupRealtime, emitRealtime } from '../src/realtime/realtime.js';
import { pool } from '../src/shared/db/pool.js';
import { executeAutomations } from '../src/modules/automations/automation.service.js';

const accountOne = '00000000-0000-0000-0000-000000000031';
const accountTwo = '00000000-0000-0000-0000-000000000032';

describe('Socket.IO realtime gateway', () => {
  const app = buildApp();
  let port: number;
  let clientOne: Socket;
  let clientTwo: Socket;

  beforeAll(async () => {
    setupRealtime(app);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Realtime test server did not start');
    port = address.port;
    const tokenOne = app.jwt.sign({ id: 'user-one', accountId: accountOne, email: 'one@example.com' });
    const tokenTwo = app.jwt.sign({ id: 'user-two', accountId: accountTwo, email: 'two@example.com' });
    clientOne = createClient(`http://127.0.0.1:${port}`, { auth: { token: tokenOne }, forceNew: true });
    clientTwo = createClient(`http://127.0.0.1:${port}`, { auth: { token: tokenTwo }, forceNew: true });
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        clientOne.once('connect', resolve);
        clientOne.once('connect_error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        clientTwo.once('connect', resolve);
        clientTwo.once('connect_error', reject);
      }),
    ]);
  });

  it('delivers events only to the matching account room', async () => {
    const receivedOne = new Promise<Record<string, unknown>>(resolve => {
      clientOne.once('message:created', resolve);
    });
    let receivedByTwo = false;
    clientTwo.once('message:created', () => { receivedByTwo = true; });

    emitRealtime(accountOne, 'message:created', {
      id: 'message-one',
      conversation_id: 'conversation-one',
      content: 'Olá',
    }, 'conversation-one');

    await expect(receivedOne).resolves.toMatchObject({ id: 'message-one' });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(receivedByTwo).toBe(false);
  });

  it('delivers read state events with the unread count', async () => {
    const received = new Promise<Record<string, unknown>>(resolve => {
      clientTwo.once('conversation:read_updated', resolve);
    });

    emitRealtime(accountTwo, 'conversation:read_updated', {
      conversationId: 'conversation-two',
      unreadCount: 0,
      lastSeenAt: new Date().toISOString(),
    }, 'conversation-two');

    await expect(received).resolves.toMatchObject({
      conversationId: 'conversation-two',
      unreadCount: 0,
    });
  });

  it('emits read state from the real HTTP endpoint', async () => {
    if (!pool) return;
    const accountId = '00000000-0000-0000-0000-000000000011';
    const contactId = '00000000-0000-0000-0000-000000000012';
    const userId = '00000000-0000-0000-0000-000000000013';
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'Realtime test account')
       ON CONFLICT (id) DO NOTHING`,
      [accountId],
    );
    await pool.query(
      `INSERT INTO contacts (id, account_id, name) VALUES ($1, $2, 'Realtime contact')
       ON CONFLICT (id) DO NOTHING`,
      [contactId, accountId],
    );
    await pool.query(
      `INSERT INTO users (id, account_id, email, password_digest)
       VALUES ($1, $2, 'realtime@example.com', 'test')
       ON CONFLICT (id) DO NOTHING`,
      [userId, accountId],
    );
    await pool.query('DELETE FROM conversations WHERE account_id = $1', [accountId]);
    const conversation = await pool.query(
      `INSERT INTO conversations (account_id, contact_id, status)
       VALUES ($1, $2, 'open') RETURNING id`,
      [accountId, contactId],
    );
    const conversationId = conversation.rows[0].id as string;
    const token = app.jwt.sign({ id: userId, accountId, email: 'realtime@example.com' });
    const client = createClient(`http://127.0.0.1:${port}`, { auth: { token }, forceNew: true });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    const event = new Promise<Record<string, unknown>>(resolve => {
      client.once('conversation:read_updated', resolve);
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversationId}/unread`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    await expect(event).resolves.toMatchObject({ conversationId, unreadCount: 1 });
    const readEvent = new Promise<Record<string, unknown>>(resolve => {
      client.once('conversation:read_updated', resolve);
    });
    const readResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversationId}/update_last_seen`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(readResponse.statusCode).toBe(200);
    await expect(readEvent).resolves.toMatchObject({ conversationId, unreadCount: 0 });
    client.close();
  });

  it('emits mutation events from the real conversation endpoints', async () => {
    if (!pool) return;
    const accountId = '00000000-0000-0000-0000-000000000021';
    const contactId = '00000000-0000-0000-0000-000000000022';
    const userId = '00000000-0000-0000-0000-000000000023';
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'Mutation realtime account')
       ON CONFLICT (id) DO NOTHING`,
      [accountId],
    );
    await pool.query(
      `INSERT INTO contacts (id, account_id, name) VALUES ($1, $2, 'Mutation contact')
       ON CONFLICT (id) DO NOTHING`,
      [contactId, accountId],
    );
    await pool.query(
      `INSERT INTO users (id, account_id, email, password_digest)
       VALUES ($1, $2, 'mutation-realtime@example.com', 'test')
       ON CONFLICT (id) DO NOTHING`,
      [userId, accountId],
    );
    await pool.query('DELETE FROM conversations WHERE account_id = $1', [accountId]);
    const conversation = await pool.query(
      `INSERT INTO conversations (account_id, contact_id, status)
       VALUES ($1, $2, 'open') RETURNING id`,
      [accountId, contactId],
    );
    const conversationId = conversation.rows[0].id as string;
    const token = app.jwt.sign({ id: userId, accountId, email: 'mutation-realtime@example.com' });
    const client = createClient(`http://127.0.0.1:${port}`, { auth: { token }, forceNew: true });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    const headers = { authorization: `Bearer ${token}` };
    const waitForEvent = (eventName: string) => new Promise<Record<string, unknown>>(resolve => {
      client.once(eventName, resolve);
    });

    const messageEvent = waitForEvent('message:created');
    const messageResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      headers,
      payload: { content: 'Mensagem em tempo real' },
    });
    expect(messageResponse.statusCode).toBe(201);
    await expect(messageEvent).resolves.toMatchObject({ content: 'Mensagem em tempo real' });

    const statusEvent = waitForEvent('conversation:status_updated');
    const statusResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`,
      headers,
      payload: { status: 'pending' },
    });
    expect(statusResponse.statusCode).toBe(200);
    await expect(statusEvent).resolves.toMatchObject({ id: conversationId, status: 'pending' });

    const priorityEvent = waitForEvent('conversation:priority_updated');
    const priorityResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_priority`,
      headers,
      payload: { priority: 2 },
    });
    expect(priorityResponse.statusCode).toBe(200);
    await expect(priorityEvent).resolves.toMatchObject({ id: conversationId, priority: 2 });

    const teamResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/teams`,
      headers,
      payload: { name: 'Realtime team' },
    });
    expect(teamResponse.statusCode).toBe(201);
    const assignmentEvent = waitForEvent('conversation:assignment_updated');
    const assignmentResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
      headers,
      payload: { team_id: teamResponse.json().id, assignee_type: 'team' },
    });
    expect(assignmentResponse.statusCode).toBe(200);
    await expect(assignmentEvent).resolves.toMatchObject({ id: conversationId });

    const inboxResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/inboxes`,
      headers,
      payload: { name: 'Realtime inbox' },
    });
    expect(inboxResponse.statusCode).toBe(201);
    const inboxEvent = waitForEvent('conversation:inbox_updated');
    const updateInboxResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversationId}/inbox`,
      headers,
      payload: { inbox_id: inboxResponse.json().id },
    });
    expect(updateInboxResponse.statusCode).toBe(200);
    await expect(inboxEvent).resolves.toMatchObject({
      id: conversationId,
      inbox_id: inboxResponse.json().id,
    });
    client.close();
  });

  it('emits automation events from the authenticated automation endpoint', async () => {
    if (!pool) return;
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'Automation realtime account')
       ON CONFLICT (id) DO NOTHING`,
      [accountOne],
    );
    const token = app.jwt.sign({
      id: 'user-one',
      accountId: accountOne,
      email: 'one@example.com',
    });
    const event = new Promise<Record<string, unknown>>(resolve => {
      clientOne.once('automation:created', resolve);
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountOne}/automation_rules`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Notify realtime',
        eventName: 'message.created',
        actions: [{ type: 'notify' }],
      },
    });

    expect(response.statusCode).toBe(201);
    await expect(event).resolves.toMatchObject({
      accountId: accountOne,
      name: 'Notify realtime',
      eventName: 'message.created',
    });
  });

  it('updates, toggles, lists and deletes automation rules within the tenant', async () => {
    if (!pool) return;
    const accountId = accountTwo;
    const userId = '00000000-0000-0000-0000-000000000033';
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'Automation CRUD account')
       ON CONFLICT (id) DO NOTHING`,
      [accountId],
    );
    await pool.query(
      `INSERT INTO users (id, account_id, email, password_digest)
       VALUES ($1, $2, 'automation-crud@example.com', 'test')
       ON CONFLICT (id) DO NOTHING`,
      [userId, accountId],
    );
    const token = app.jwt.sign({ id: userId, accountId, email: 'automation-crud@example.com' });
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/automation_rules`,
      headers,
      payload: { name: 'Initial', eventName: 'message.created' },
    });
    expect(created.statusCode).toBe(201);
    const ruleId = created.json().id as string;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${accountId}/automation_rules/${ruleId}`,
      headers,
      payload: { name: 'Updated', active: false, actions: [{ type: 'set_status', status: 'pending' }] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Updated', active: false });

    const toggled = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/automation_rules/${ruleId}/toggle`,
      headers,
    });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json().active).toBe(true);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/automation_rules`,
      headers,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ruleId, name: 'Updated' }),
    ]));

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/accounts/${accountId}/automation_rules/${ruleId}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('executes status, priority and label actions once per event', async () => {
    if (!pool) return;
    const contactId = '00000000-0000-0000-0000-000000000034';
    await pool.query(
      `INSERT INTO contacts (id, account_id, name) VALUES ($1, $2, 'Automation action contact')
       ON CONFLICT (id) DO NOTHING`,
      [contactId, accountOne],
    );
    const conversation = await pool.query(
      `INSERT INTO conversations (account_id, contact_id, status, priority)
       VALUES ($1, $2, 'open', 0) RETURNING id`,
      [accountOne, contactId],
    );
    const conversationId = conversation.rows[0].id as string;
    const rule = await pool.query(
      `INSERT INTO automation_rules
        (account_id, name, event_name, conditions, actions)
       VALUES ($1, 'Execute actions', 'automation.test', '[]'::jsonb,
         $2::jsonb) RETURNING id`,
      [
        accountOne,
        JSON.stringify([
          { type: 'set_status', status: 'pending' },
          { type: 'set_priority', priority: 2 },
          { type: 'add_label', label: 'automated' },
        ]),
      ],
    );
    await executeAutomations(accountOne, {
      id: '00000000-0000-0000-0000-000000000035',
      name: 'automation.test',
      payload: { conversationId },
    });
    await executeAutomations(accountOne, {
      id: '00000000-0000-0000-0000-000000000035',
      name: 'automation.test',
      payload: { conversationId },
    });
    const updated = await pool.query(
      'SELECT status, priority FROM conversations WHERE id = $1 AND account_id = $2',
      [conversationId, accountOne],
    );
    const labels = await pool.query(
      'SELECT name FROM conversation_labels WHERE conversation_id = $1 AND account_id = $2',
      [conversationId, accountOne],
    );
    const executions = await pool.query(
      `SELECT status FROM automation_executions
       WHERE rule_id = $1 AND event_id = $2`,
      [rule.rows[0].id, '00000000-0000-0000-0000-000000000035'],
    );
    expect(updated.rows[0]).toMatchObject({ status: 'pending', priority: 2 });
    expect(labels.rows).toEqual([{ name: 'automated' }]);
    expect(executions.rows).toEqual([{ status: 'succeeded' }]);
  });

  afterAll(async () => {
    clientOne?.close();
    clientTwo?.close();
    await app.close();
  });
});
