import { randomUUID } from 'node:crypto';
import { pool } from '../../shared/db/pool.js';
import { emitRealtime } from '../../realtime/realtime.js';
import { dispatchWebhooks } from '../webhooks/webhook.service.js';

export interface AutomationEvent {
  id?: string;
  name: string;
  payload: Record<string, unknown>;
  depth?: number;
  ruleIds?: string[];
}

interface RuleRow {
  id: string;
  account_id: string;
  name: string;
  event_name: string;
  conditions: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
  execution_delay: number | null;
}

const valueAt = (payload: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), payload);

function matchesConditions(
  conditions: Array<Record<string, unknown>>,
  payload: Record<string, unknown>,
): boolean {
  return conditions.every(condition => {
    const field = typeof condition.field === 'string' ? condition.field : '';
    const actual = valueAt(payload, field);
    const operator = condition.operator ?? 'equals';
    const expected = condition.value;
    if (operator === 'exists') return actual !== undefined;
    if (operator === 'contains') return typeof actual === 'string' && actual.includes(String(expected));
    if (operator === 'not_equals') return actual !== expected;
    return actual === expected;
  });
}

async function executeAction(
  accountId: string,
  action: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!pool) throw new Error('Database is required for automation execution');
  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : undefined;
  if (!conversationId) throw new Error('Automation action requires payload.conversationId');
  const type = action.type;
  if (type === 'set_status') {
    const status = action.status;
    if (!['open', 'pending', 'resolved'].includes(String(status))) throw new Error('Invalid automation status');
    await pool.query(
      'UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2 AND account_id = $3',
      [status, conversationId, accountId],
    );
    emitRealtime(accountId, 'conversation:status_updated', { id: conversationId, status }, conversationId);
    return;
  }
  if (type === 'set_priority') {
    const priority = Number(action.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 5) throw new Error('Invalid automation priority');
    await pool.query(
      'UPDATE conversations SET priority = $1, updated_at = NOW() WHERE id = $2 AND account_id = $3',
      [priority, conversationId, accountId],
    );
    emitRealtime(accountId, 'conversation:priority_updated', { id: conversationId, priority }, conversationId);
    return;
  }
  if (type === 'add_label') {
    const label = typeof action.label === 'string' ? action.label.trim() : '';
    if (!label) throw new Error('Automation label is required');
    await pool.query(
      `INSERT INTO conversation_labels (conversation_id, account_id, name)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [conversationId, accountId, label],
    );
    emitRealtime(accountId, 'conversation:labels_updated', { id: conversationId, label }, conversationId);
    return;
  }
  throw new Error(`Unsupported automation action: ${String(type)}`);
}

export async function executeAutomations(accountId: string, event: AutomationEvent): Promise<void> {
  if (!pool) return;
  void dispatchWebhooks(accountId, event.name, event.payload);
  const depth = event.depth ?? 0;
  if (depth >= 5) throw new Error('Automation recursion limit reached');
  const eventId = event.id ?? randomUUID();
  const result = await pool.query<RuleRow>(
    `SELECT id, account_id, name, event_name, conditions, actions, execution_delay
     FROM automation_rules
     WHERE account_id = $1 AND event_name = $2 AND active = TRUE`,
    [accountId, event.name],
  );
  for (const rule of result.rows) {
    if (event.ruleIds?.includes(rule.id) || !matchesConditions(rule.conditions, event.payload)) continue;
    const execution = await pool.query(
      `INSERT INTO automation_executions
        (account_id, rule_id, event_id, event_name, status)
       VALUES ($1, $2, $3, $4, 'running')
       ON CONFLICT (rule_id, event_id) DO NOTHING
       RETURNING id`,
      [accountId, rule.id, eventId, event.name],
    );
    if (execution.rowCount === 0) continue;
    try {
      for (const action of rule.actions) await executeAction(accountId, action, event.payload);
      await pool.query(
        `UPDATE automation_executions
         SET status = 'succeeded', finished_at = NOW()
         WHERE id = $1`,
        [execution.rows[0].id],
      );
      emitRealtime(accountId, 'automation:executed', {
        ruleId: rule.id,
        ruleName: rule.name,
        eventName: event.name,
        status: 'succeeded',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Automation execution failed';
      await pool.query(
        `UPDATE automation_executions
         SET status = 'failed', error_message = $2, finished_at = NOW()
         WHERE id = $1`,
        [execution.rows[0].id, message],
      );
      emitRealtime(accountId, 'automation:executed', {
        ruleId: rule.id,
        ruleName: rule.name,
        eventName: event.name,
        status: 'failed',
        error: message,
      });
      throw error;
    }
  }
}
