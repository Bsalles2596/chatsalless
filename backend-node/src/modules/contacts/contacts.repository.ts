import { pool } from '../../shared/db/pool.js';
import type { Contact } from './contact.types.js';

export interface ContactFilters {
  accountId: string;
  page?: number;
  search?: string;
  sort?: string;
}

export interface ContactRepository {
  list(filters: ContactFilters): Promise<{ contacts: Contact[]; count: number }>;
  findById(accountId: string, id: string): Promise<Contact | undefined>;
  create(contact: Omit<Contact, 'id' | 'createdAt'>): Promise<Contact>;
  update(accountId: string, id: string, changes: Partial<Pick<Contact, 'name' | 'email' | 'phoneNumber'>>): Promise<Contact | undefined>;
  delete(accountId: string, id: string): Promise<boolean>;
}

const memoryContacts = new Map<string, Contact>();

class MemoryContactRepository implements ContactRepository {
  async list({ accountId, page = 1, search = '' }: ContactFilters) {
    const normalizedSearch = search.trim().toLowerCase();
    const all = Array.from(memoryContacts.values()).filter(contact =>
      contact.accountId === accountId
      && (!normalizedSearch || [contact.name, contact.email, contact.phoneNumber]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(normalizedSearch))));
    const offset = (Math.max(page, 1) - 1) * 25;
    return { contacts: all.slice(offset, offset + 25), count: all.length };
  }

  async findById(accountId: string, id: string) {
    const contact = memoryContacts.get(id);
    return contact?.accountId === accountId ? contact : undefined;
  }

  async create(input: Omit<Contact, 'id' | 'createdAt'>) {
    const contact: Contact = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    memoryContacts.set(contact.id, contact);
    return contact;
  }

  async update(accountId: string, id: string, changes: Partial<Pick<Contact, 'name' | 'email' | 'phoneNumber'>>) {
    const contact = await this.findById(accountId, id);
    if (!contact) return undefined;
    const updated = { ...contact, ...changes };
    memoryContacts.set(id, updated);
    return updated;
  }

  async delete(accountId: string, id: string) {
    const contact = await this.findById(accountId, id);
    return contact ? memoryContacts.delete(id) : false;
  }
}

class PostgresContactRepository implements ContactRepository {
  async list({ accountId, page = 1, search = '', sort = 'name' }: ContactFilters) {
    const safeSort = ['name', 'created_at', 'email'].includes(sort) ? sort : 'name';
    const offset = (Math.max(page, 1) - 1) * 25;
    const pattern = `%${search.trim()}%`;
    const result = await pool!.query(
      `SELECT id, account_id, name, email, phone_number, created_at
       FROM contacts
       WHERE account_id = $1
         AND ($2 = '%%' OR name ILIKE $2 OR email ILIKE $2 OR phone_number ILIKE $2)
       ORDER BY ${safeSort} ASC NULLS LAST
       LIMIT 25 OFFSET $3`,
      [accountId, pattern, offset],
    );
    const count = await pool!.query(
      `SELECT COUNT(*)::int AS count FROM contacts
       WHERE account_id = $1
         AND ($2 = '%%' OR name ILIKE $2 OR email ILIKE $2 OR phone_number ILIKE $2)`,
      [accountId, pattern],
    );
    return { contacts: result.rows.map(toContact), count: count.rows[0].count };
  }

  async findById(accountId: string, id: string) {
    const result = await pool!.query(
      'SELECT id, account_id, name, email, phone_number, created_at FROM contacts WHERE account_id = $1 AND id = $2',
      [accountId, id],
    );
    return result.rows[0] ? toContact(result.rows[0]) : undefined;
  }

  async create(input: Omit<Contact, 'id' | 'createdAt'>) {
    const result = await pool!.query(
      `INSERT INTO contacts (account_id, name, email, phone_number)
       VALUES ($1, $2, $3, $4)
       RETURNING id, account_id, name, email, phone_number, created_at`,
      [input.accountId, input.name, input.email ?? null, input.phoneNumber ?? null],
    );
    return toContact(result.rows[0]);
  }

  async update(accountId: string, id: string, changes: Partial<Pick<Contact, 'name' | 'email' | 'phoneNumber'>>) {
    const result = await pool!.query(
      `UPDATE contacts
       SET name = COALESCE($3, name), email = $4, phone_number = $5, updated_at = NOW()
       WHERE account_id = $1 AND id = $2
       RETURNING id, account_id, name, email, phone_number, created_at`,
      [accountId, id, changes.name ?? null, changes.email ?? null, changes.phoneNumber ?? null],
    );
    return result.rows[0] ? toContact(result.rows[0]) : undefined;
  }

  async delete(accountId: string, id: string) {
    const result = await pool!.query('DELETE FROM contacts WHERE account_id = $1 AND id = $2', [accountId, id]);
    return result.rowCount === 1;
  }
}

function toContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    name: String(row.name),
    email: row.email ? String(row.email) : undefined,
    phoneNumber: row.phone_number ? String(row.phone_number) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export const contactsRepository: ContactRepository = pool
  ? new PostgresContactRepository()
  : new MemoryContactRepository();
