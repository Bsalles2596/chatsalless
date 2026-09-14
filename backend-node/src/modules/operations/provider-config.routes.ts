import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accountFromRequest, authenticate } from '../../shared/auth/auth.js';
import { requireAccountAdmin } from '../../shared/auth/permissions.js';
import { pool } from '../../shared/db/pool.js';
import { encryptWebhookSecret } from '../webhooks/webhook.security.js';

const provider = z.enum(['api', 'web_widget', 'email', 'whatsapp', 'telegram', 'sms']);
const configInput = z.object({
  provider,
  enabled: z.boolean().default(false),
  publicConfig: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  credentials: z.record(z.string(), z.string().min(1).max(1000)),
});

function validateCredentials(channel: z.infer<typeof provider>, credentials: Record<string, string>): string | undefined {
  const required: Record<string, string[]> = {
    api: [],
    web_widget: [],
    email: ['host', 'username', 'password'],
    whatsapp: ['access_token', 'phone_number_id'],
    telegram: ['bot_token'],
    sms: ['api_key', 'from'],
  };
  const missing = (required[channel] ?? []).filter(key => !credentials[key]?.trim());
  return missing.length ? `Missing credentials: ${missing.join(', ')}` : undefined;
}

function assertChannelMatchesInbox(providerName: string, channelType: string): void {
  if (providerName !== channelType) throw new Error('Provider must match the inbox channel type');
}

export async function providerConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { accountId: string; inboxId: string } }>(
    '/api/v1/accounts/:accountId/inboxes/:inboxId/provider',
    { preHandler: [authenticate, requireAccountAdmin] },
    async request => {
      const accountId = accountFromRequest(request);
      if (!pool) return null;
      const result = await pool.query(
        `SELECT id, inbox_id, provider, enabled, public_config AS "publicConfig",
                (credentials_ciphertext IS NOT NULL) AS "hasCredentials",
                created_at, updated_at
         FROM inbox_provider_configs WHERE account_id = $1 AND inbox_id = $2`,
        [accountId, request.params.inboxId],
      );
      return result.rows[0] ?? null;
    },
  );

  app.put<{ Params: { accountId: string; inboxId: string } }>(
    '/api/v1/accounts/:accountId/inboxes/:inboxId/provider',
    { preHandler: [authenticate, requireAccountAdmin] },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const parsed = configInput.safeParse(request.body);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for provider configuration');
      const inbox = await pool.query(
        'SELECT channel_type FROM inboxes WHERE id = $1 AND account_id = $2',
        [request.params.inboxId, accountId],
      );
      if (!inbox.rows[0]) return reply.notFound('Inbox not found');
      try {
        assertChannelMatchesInbox(parsed.data.provider, inbox.rows[0].channel_type);
      } catch (error) {
        return reply.badRequest(error instanceof Error ? error.message : 'Provider does not match inbox');
      }
      const credentialError = validateCredentials(parsed.data.provider, parsed.data.credentials);
      if (credentialError) return reply.badRequest(credentialError);
      const result = await pool.query(
        `INSERT INTO inbox_provider_configs
          (account_id, inbox_id, provider, enabled, public_config, credentials_ciphertext)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (account_id, inbox_id) DO UPDATE SET
          provider = EXCLUDED.provider, enabled = EXCLUDED.enabled,
          public_config = EXCLUDED.public_config,
          credentials_ciphertext = EXCLUDED.credentials_ciphertext,
          updated_at = NOW()
         RETURNING id, inbox_id, provider, enabled, public_config AS "publicConfig",
                   (credentials_ciphertext IS NOT NULL) AS "hasCredentials",
                   created_at, updated_at`,
        [
          accountId,
          request.params.inboxId,
          parsed.data.provider,
          parsed.data.enabled,
          JSON.stringify(parsed.data.publicConfig),
          encryptWebhookSecret(JSON.stringify(parsed.data.credentials)),
        ],
      );
      return reply.send(result.rows[0]);
    },
  );

  app.post<{ Params: { accountId: string; inboxId: string } }>(
    '/api/v1/accounts/:accountId/inboxes/:inboxId/provider/rotate',
    { preHandler: [authenticate, requireAccountAdmin] },
    async (request, reply) => {
      const accountId = accountFromRequest(request);
      const credentials = z.record(z.string(), z.string().min(1).max(1000)).safeParse(request.body);
      if (!credentials.success) return reply.badRequest(credentials.error.issues[0].message);
      if (!pool) return reply.serviceUnavailable('Database is required for provider configuration');
      const current = await pool.query(
        'SELECT provider FROM inbox_provider_configs WHERE account_id = $1 AND inbox_id = $2',
        [accountId, request.params.inboxId],
      );
      if (!current.rows[0]) return reply.notFound('Provider configuration not found');
      const credentialError = validateCredentials(current.rows[0].provider, credentials.data);
      if (credentialError) return reply.badRequest(credentialError);
      const result = await pool.query(
        `UPDATE inbox_provider_configs
         SET credentials_ciphertext = $3, updated_at = NOW()
         WHERE account_id = $1 AND inbox_id = $2
         RETURNING id, inbox_id, provider, enabled, public_config AS "publicConfig",
                   (credentials_ciphertext IS NOT NULL) AS "hasCredentials",
                   created_at, updated_at`,
        [accountId, request.params.inboxId, encryptWebhookSecret(JSON.stringify(credentials.data))],
      );
      return result.rows[0];
    },
  );
}
