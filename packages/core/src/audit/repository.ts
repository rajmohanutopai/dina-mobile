/**
 * Audit SQL repository — backs the hash-chained audit log with SQLite.
 *
 * Critical: uses AUTOINCREMENT for seq. The service layer computes
 * entry_hash and prev_hash before INSERT — the repository just persists.
 *
 * Source: ARCHITECTURE.md — op-sqlite persistence layer
 */

import type { DatabaseAdapter, DBRow } from '../storage/db_adapter';
import type { AuditEntry } from './hash_chain';

export interface AuditRepository {
  append(entry: AuditEntry): void;
  latest(): AuditEntry | null;
  query(filters: {
    actor?: string; action?: string; resource?: string;
    since?: number; until?: number; limit?: number;
  }): AuditEntry[];
  sweep(cutoffTs: number): number;
  count(): number;
  allEntries(): AuditEntry[];
}

let repo: AuditRepository | null = null;
export function setAuditRepository(r: AuditRepository | null): void { repo = r; }
export function getAuditRepository(): AuditRepository | null { return repo; }

export class SQLiteAuditRepository implements AuditRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  append(entry: AuditEntry): void {
    this.db.execute(
      `INSERT INTO audit_log (seq, ts, actor, action, resource, detail, prev_hash, entry_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [entry.seq, entry.ts, entry.actor, entry.action, entry.resource, entry.detail, entry.prev_hash, entry.entry_hash],
    );
  }

  latest(): AuditEntry | null {
    const rows = this.db.query('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    return rows.length > 0 ? rowToAuditEntry(rows[0]) : null;
  }

  query(filters: {
    actor?: string; action?: string; resource?: string;
    since?: number; until?: number; limit?: number;
  }): AuditEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.actor) { conditions.push('actor = ?'); params.push(filters.actor); }
    if (filters.action) { conditions.push('action = ?'); params.push(filters.action); }
    if (filters.resource) { conditions.push('resource = ?'); params.push(filters.resource); }
    if (filters.since) { conditions.push('ts >= ?'); params.push(Math.floor(filters.since / 1000)); }
    if (filters.until) { conditions.push('ts <= ?'); params.push(Math.floor(filters.until / 1000)); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(filters.limit ?? 200, 200);

    const rows = this.db.query(
      `SELECT * FROM audit_log ${where} ORDER BY seq DESC LIMIT ?`,
      [...params, limit],
    );
    return rows.map(rowToAuditEntry);
  }

  sweep(cutoffTs: number): number {
    const before = this.count();
    this.db.execute('DELETE FROM audit_log WHERE ts < ?', [cutoffTs]);
    return before - this.count();
  }

  count(): number {
    const rows = this.db.query<{ c: number }>('SELECT COUNT(*) as c FROM audit_log');
    return Number(rows[0]?.c ?? 0);
  }

  allEntries(): AuditEntry[] {
    const rows = this.db.query('SELECT * FROM audit_log ORDER BY seq ASC');
    return rows.map(rowToAuditEntry);
  }
}

function rowToAuditEntry(row: DBRow): AuditEntry {
  return {
    seq: Number(row.seq ?? 0),
    ts: Number(row.ts ?? 0),
    actor: String(row.actor ?? ''),
    action: String(row.action ?? ''),
    resource: String(row.resource ?? ''),
    detail: String(row.detail ?? ''),
    prev_hash: String(row.prev_hash ?? ''),
    entry_hash: String(row.entry_hash ?? ''),
  };
}
