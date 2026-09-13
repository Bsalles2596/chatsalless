import bcrypt from 'bcryptjs';
import { pool } from '../shared/db/pool.js';

if (!pool) throw new Error('DATABASE_URL is required to seed the database');

const email = process.env.CHATSALES_ADMIN_EMAIL;
const password = process.env.CHATSALES_ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error('CHATSALES_ADMIN_EMAIL and CHATSALES_ADMIN_PASSWORD are required to seed the administrator');
}
if (password.length < 16) {
  throw new Error('CHATSALES_ADMIN_PASSWORD must contain at least 16 characters');
}
let accountId = (await pool.query(
  'SELECT id FROM accounts WHERE name = $1 ORDER BY created_at LIMIT 1',
  ['ChatSalles'],
)).rows[0]?.id as string | undefined;
if (!accountId) {
  accountId = (await pool.query(
    `INSERT INTO accounts (name, locale) VALUES ('ChatSalles', 'pt-BR') RETURNING id`,
  )).rows[0].id;
}
if (!accountId) throw new Error('Unable to create ChatSalles account');

const passwordDigest = await bcrypt.hash(password, 12);
await pool.query(
  `UPDATE users
   SET email = $1, password_digest = $2
   WHERE email = 'admin@chatsalles.local'
     AND NOT EXISTS (SELECT 1 FROM users WHERE email = $1)`,
  [email, passwordDigest],
);
const userResult = await pool.query(
  `INSERT INTO users (account_id, email, password_digest)
   VALUES ($1, $2, $3)
   ON CONFLICT (email) DO UPDATE SET account_id = EXCLUDED.account_id, password_digest = EXCLUDED.password_digest
   RETURNING id`,
  [accountId, email, passwordDigest],
);
const userId = userResult.rows[0].id as string;

let inboxId = (await pool.query(
  'SELECT id FROM inboxes WHERE account_id = $1 AND name = $2',
  [accountId, 'Demo Inbox'],
)).rows[0]?.id;
if (!inboxId) {
  inboxId = (await pool.query(
    `INSERT INTO inboxes (account_id, name, channel_type)
     VALUES ($1, 'Demo Inbox', 'api') RETURNING id`,
    [accountId],
  )).rows[0].id;
}

let teamId = (await pool.query(
  'SELECT id FROM teams WHERE account_id = $1 AND name = $2',
  [accountId, 'Demo Team'],
)).rows[0]?.id;
if (!teamId) {
  teamId = (await pool.query(
    `INSERT INTO teams (account_id, name, description)
     VALUES ($1, 'Demo Team', 'Equipe criada pelo seed do ChatSalles') RETURNING id`,
    [accountId],
  )).rows[0].id;
}
await pool.query(
  `INSERT INTO team_members (team_id, account_id, user_id)
   VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
  [teamId, accountId, userId],
);

const demoContacts = [
  ['Maria Silva', 'maria.silva@demo.local', '+55 11 99999-1001'],
  ['Joao Santos', 'joao.santos@demo.local', '+55 11 99999-1002'],
  ['Empresa Acme', 'contato@acme.demo', '+55 11 99999-1003'],
] as const;

for (const [name, contactEmail, phone] of demoContacts) {
  const contactResult = await pool.query(
    `INSERT INTO contacts (account_id, name, email, phone_number)
     SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (
       SELECT 1 FROM contacts WHERE account_id = $1 AND email = $3
     )
     RETURNING id`,
    [accountId, name, contactEmail, phone],
  );
  const contactId = contactResult.rows[0]?.id
    ?? (await pool.query('SELECT id FROM contacts WHERE account_id = $1 AND email = $2', [accountId, contactEmail])).rows[0].id;
  const conversationResult = await pool.query(
    `INSERT INTO conversations
       (account_id, contact_id, status, inbox_id, assignee_id, team_id, priority, last_message)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE NOT EXISTS (
       SELECT 1 FROM conversations WHERE account_id = $1 AND contact_id = $2
     )
     RETURNING id`,
    [
      accountId,
      contactId,
      name === 'Empresa Acme' ? 'resolved' : 'open',
      inboxId,
      name === 'Joao Santos' ? null : userId,
      name === 'Joao Santos' ? teamId : null,
      name === 'Empresa Acme' ? 2 : 1,
      `Olá, esta é uma conversa de demonstração com ${name}.`,
    ],
  );
  const conversationId = conversationResult.rows[0]?.id
    ?? (await pool.query('SELECT id FROM conversations WHERE account_id = $1 AND contact_id = $2', [accountId, contactId])).rows[0].id;
  await pool.query(
    `INSERT INTO conversation_labels (conversation_id, account_id, name)
     VALUES ($1, $2, $3), ($1, $2, $4) ON CONFLICT DO NOTHING`,
    [conversationId, accountId, name === 'Empresa Acme' ? 'vip' : 'sales', name === 'Joao Santos' ? 'follow-up' : 'demo'],
  );
  const messageCount = await pool.query('SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1', [conversationId]);
  if (messageCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO messages (account_id, conversation_id, content, private, message_type, status)
       VALUES ($1, $2, $3, false, 'incoming', 'sent'),
              ($1, $2, $4, false, 'outgoing', 'sent')`,
      [accountId, conversationId, `Mensagem recebida de ${name}.`, 'Resposta enviada pelo time ChatSalles.'],
    );
  }
}

console.log(JSON.stringify({ accountId, email, password, demoContacts: demoContacts.length }, null, 2));
await pool.end();
