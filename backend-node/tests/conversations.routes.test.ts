import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/shared/db/pool.js';

const app = buildApp();
const accountId = '00000000-0000-0000-0000-000000000003';
const contactId = '00000000-0000-0000-0000-000000000004';

function multipartMessage(content: string, filename: string, fileContent: string) {
  const boundary = '----ChatSallesTestBoundary';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="content"',
    '',
    content,
    `--${boundary}`,
    `Content-Disposition: form-data; name="private"`,
    '',
    'false',
    `--${boundary}`,
    `Content-Disposition: form-data; name="attachments[]"; filename="${filename}"`,
    'Content-Type: text/plain',
    '',
    fileContent,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('conversations and messages API', () => {
  it('creates a conversation, sends a message, and enforces tenant scope', async () => {
    if (!pool) return;
    await app.ready();
    await pool.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'Conversation test account')
       ON CONFLICT (id) DO NOTHING`,
      [accountId],
    );
    await pool.query(
      `INSERT INTO contacts (id, account_id, name) VALUES ($1, $2, 'Conversation contact')
       ON CONFLICT (id) DO NOTHING`,
      [contactId, accountId],
    );
    const userId = '00000000-0000-0000-0000-000000000005';
    await pool.query(
      `INSERT INTO users (id, account_id, email, password_digest)
       VALUES ($1, $2, 'conversation@example.com', 'test')
       ON CONFLICT (id) DO NOTHING`,
      [userId, accountId],
    );
    await pool.query('DELETE FROM conversations WHERE account_id = $1', [accountId]);

    const token = app.jwt.sign({
      id: userId,
      accountId,
      email: 'conversation@example.com',
    });
    const headers = { authorization: `Bearer ${token}` };

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations`,
      headers,
      payload: { contactId },
    });
    expect(created.statusCode).toBe(201);

    const conversation = created.json();
    const message = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/messages`,
      headers,
      payload: { content: 'Olá, tudo bem?' },
    });
    expect(message.statusCode).toBe(201);
    expect(message.json()).toMatchObject({
      conversation_id: conversation.id,
      content: 'Olá, tudo bem?',
    });
    const messageId = message.json().id;

    const multipart = multipartMessage(
      'Mensagem com anexo',
      'conversation.txt',
      'conteudo do arquivo',
    );
    const attachmentMessage = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/messages`,
      headers: { ...headers, 'content-type': multipart.contentType },
      payload: multipart.body,
    });
    expect(attachmentMessage.statusCode).toBe(201);
    expect(attachmentMessage.json().attachments).toHaveLength(1);
    expect(attachmentMessage.json().attachments[0]).toMatchObject({
      filename: 'conversation.txt',
      contentType: 'text/plain',
      byteSize: 19,
    });
    const attachment = attachmentMessage.json().attachments[0];

    const downloaded = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/messages/${attachmentMessage.json().id}/attachments/${attachment.id}`,
      headers,
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.headers['content-type']).toBe('text/plain');
    expect(downloaded.body).toBe('conteudo do arquivo');

    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/messages/${messageId}/retry`,
      headers,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().status).toBe('sent');

    const labels = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/labels`,
      headers,
      payload: { labels: ['priority', 'sales'] },
    });
    expect(labels.statusCode).toBe(200);
    expect(labels.json().payload).toEqual(['priority', 'sales']);

    const fetchedLabels = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/labels`,
      headers,
    });
    expect(fetchedLabels.json().payload).toEqual(['priority', 'sales']);

    const status = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/toggle_status`,
      headers,
      payload: { status: 'pending' },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('pending');

    const team = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/teams`,
      headers,
      payload: { name: 'Sales' },
    });
    expect(team.statusCode).toBe(201);
    const assignment = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/assignments`,
      headers,
      payload: { team_id: team.json().id, assignee_type: 'team' },
    });
    expect(assignment.statusCode).toBe(200);
    expect(assignment.json().team_id).toBe(team.json().id);

    const priority = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/toggle_priority`,
      headers,
      payload: { priority: 2 },
    });
    expect(priority.statusCode).toBe(200);
    expect(priority.json().priority).toBe(2);

    const filtered = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/conversations?status=pending&team_id=${team.json().id}&priority=2&assignee_type=team`,
      headers,
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().payload).toHaveLength(1);
    expect(filtered.json().meta.count).toBe(1);

    const emptyFilter = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/conversations?status=open`,
      headers,
    });
    expect(emptyFilter.statusCode).toBe(200);
    expect(emptyFilter.json().payload).toHaveLength(0);

    const searched = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/conversations/search?q=Olá`,
      headers,
    });
    expect(searched.statusCode).toBe(200);
    expect(searched.json().payload).toHaveLength(1);

    const advanced = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/conversations?q=Olá&labels=priority,sales&updated_within=1&sort_by=priority`,
      headers,
    });
    expect(advanced.statusCode).toBe(200);
    expect(advanced.json().payload).toHaveLength(1);
    expect(advanced.json().payload[0]).toMatchObject({
      contact_name: expect.any(String),
      labels: expect.any(Array),
      updated_at: expect.any(String),
      unread_count: expect.any(Number),
    });

    const filteredPost = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/filter?page=1`,
      headers,
      payload: {
        queryData: {
          status: 'pending',
          labels: ['priority', 'sales'],
          priority: 2,
        },
      },
    });
    expect(filteredPost.statusCode).toBe(200);
    expect(filteredPost.json().payload).toHaveLength(1);
    expect(filteredPost.json().meta.count).toBe(1);

    const markedRead = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/update_last_seen`,
      headers,
    });
    expect(markedRead.statusCode).toBe(200);

    const markedUnread = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/unread`,
      headers,
    });
    expect(markedUnread.statusCode).toBe(200);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/messages`,
      headers,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().payload).toHaveLength(2);

    const deletedMessage = await app.inject({
      method: 'DELETE',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}/messages/${messageId}`,
      headers,
    });
    expect(deletedMessage.statusCode).toBe(204);

    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/00000000-0000-0000-0000-000000000006/conversations`,
      headers,
    });
    expect(forbidden.statusCode).toBe(403);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/accounts/${accountId}/conversations/${conversation.id}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
  });
});

afterAll(async () => {
  await app.close();
});
