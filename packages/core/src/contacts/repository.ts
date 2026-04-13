/**
 * Contact SQL repository — backs contact CRUD with SQLite.
 *
 * Uses the identity DB's `contacts` + `contact_aliases` tables.
 * Handles camelCase ↔ snake_case mapping.
 *
 * Source: ARCHITECTURE.md — op-sqlite persistence layer
 */

import type { DatabaseAdapter, DBRow } from '../storage/db_adapter';
import type { Contact, TrustLevel, SharingTier, Relationship, DataResponsibility } from './directory';

export interface ContactRepository {
  add(contact: Contact): void;
  get(did: string): Contact | null;
  list(): Contact[];
  update(did: string, updates: Partial<Contact>): void;
  remove(did: string): boolean;
  addAlias(did: string, aliasNormalized: string): void;
  removeAlias(aliasNormalized: string): void;
  resolveAlias(aliasNormalized: string): string | null;
  getAliases(did: string): string[];
}

/** Singleton repository (null = in-memory). */
let repo: ContactRepository | null = null;
export function setContactRepository(r: ContactRepository | null): void { repo = r; }
export function getContactRepository(): ContactRepository | null { return repo; }

export class SQLiteContactRepository implements ContactRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  add(contact: Contact): void {
    this.db.execute(
      `INSERT INTO contacts (did, display_name, trust_level, sharing_tier, relationship, data_responsibility, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [contact.did, contact.displayName, contact.trustLevel, contact.sharingTier,
       contact.relationship, contact.dataResponsibility, contact.notes,
       contact.createdAt, contact.updatedAt],
    );
    for (const alias of contact.aliases) {
      this.addAlias(contact.did, alias.toLowerCase());
    }
  }

  get(did: string): Contact | null {
    const rows = this.db.query('SELECT * FROM contacts WHERE did = ?', [did]);
    if (rows.length === 0) return null;
    const aliases = this.getAliases(did);
    return rowToContact(rows[0], aliases);
  }

  list(): Contact[] {
    const rows = this.db.query('SELECT * FROM contacts ORDER BY display_name');
    return rows.map(r => {
      const aliases = this.getAliases(String(r.did));
      return rowToContact(r, aliases);
    });
  }

  update(did: string, updates: Partial<Contact>): void {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (updates.displayName !== undefined) { sets.push('display_name = ?'); params.push(updates.displayName); }
    if (updates.trustLevel !== undefined) { sets.push('trust_level = ?'); params.push(updates.trustLevel); }
    if (updates.sharingTier !== undefined) { sets.push('sharing_tier = ?'); params.push(updates.sharingTier); }
    if (updates.relationship !== undefined) { sets.push('relationship = ?'); params.push(updates.relationship); }
    if (updates.dataResponsibility !== undefined) { sets.push('data_responsibility = ?'); params.push(updates.dataResponsibility); }
    if (updates.notes !== undefined) { sets.push('notes = ?'); params.push(updates.notes); }
    sets.push('updated_at = ?'); params.push(Date.now());
    params.push(did);
    this.db.execute(`UPDATE contacts SET ${sets.join(', ')} WHERE did = ?`, params);
  }

  remove(did: string): boolean {
    const existing = this.db.query('SELECT 1 FROM contacts WHERE did = ?', [did]);
    if (existing.length === 0) return false;
    this.db.execute('DELETE FROM contacts WHERE did = ?', [did]);
    return true;
  }

  addAlias(did: string, aliasNormalized: string): void {
    this.db.execute(
      'INSERT OR IGNORE INTO contact_aliases (alias_normalized, did) VALUES (?, ?)',
      [aliasNormalized, did],
    );
  }

  removeAlias(aliasNormalized: string): void {
    this.db.execute('DELETE FROM contact_aliases WHERE alias_normalized = ?', [aliasNormalized]);
  }

  resolveAlias(aliasNormalized: string): string | null {
    const rows = this.db.query('SELECT did FROM contact_aliases WHERE alias_normalized = ?', [aliasNormalized]);
    return rows.length > 0 ? String(rows[0].did) : null;
  }

  getAliases(did: string): string[] {
    const rows = this.db.query('SELECT alias_normalized FROM contact_aliases WHERE did = ?', [did]);
    return rows.map(r => String(r.alias_normalized));
  }
}

function rowToContact(row: DBRow, aliases: string[]): Contact {
  return {
    did: String(row.did ?? ''),
    displayName: String(row.display_name ?? ''),
    trustLevel: String(row.trust_level ?? 'unknown') as TrustLevel,
    sharingTier: String(row.sharing_tier ?? 'summary') as SharingTier,
    relationship: String(row.relationship ?? 'unknown') as Relationship,
    dataResponsibility: String(row.data_responsibility ?? 'external') as DataResponsibility,
    aliases,
    notes: String(row.notes ?? ''),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}
