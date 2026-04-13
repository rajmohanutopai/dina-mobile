/**
 * KV store SQL repository — backs kvGet/kvSet/kvDelete with SQLite.
 *
 * Uses the identity DB's `kv_store` table.
 * When the repository is wired, all KV operations go through SQL.
 * When null, the in-memory Map is used (backward compatible for tests).
 *
 * Source: ARCHITECTURE.md — op-sqlite persistence layer
 */

import type { DatabaseAdapter } from '../storage/db_adapter';
import type { KVEntry } from './store';

export interface KVRepository {
  get(key: string): KVEntry | null;
  set(key: string, value: string): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  list(prefix?: string): KVEntry[];
  count(prefix?: string): number;
}

/**
 * SQLite-backed KV repository.
 */
export class SQLiteKVRepository implements KVRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  get(key: string): KVEntry | null {
    const rows = this.db.query<{ key: string; value: string; updated_at: number }>(
      'SELECT key, value, updated_at FROM kv_store WHERE key = ?', [key],
    );
    if (rows.length === 0) return null;
    return { key: rows[0].key, value: rows[0].value, updatedAt: Number(rows[0].updated_at) };
  }

  set(key: string, value: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.execute(
      'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)',
      [key, value, now],
    );
  }

  delete(key: string): boolean {
    const existing = this.get(key);
    if (!existing) return false;
    this.db.execute('DELETE FROM kv_store WHERE key = ?', [key]);
    return true;
  }

  has(key: string): boolean {
    const rows = this.db.query('SELECT 1 FROM kv_store WHERE key = ?', [key]);
    return rows.length > 0;
  }

  list(prefix?: string): KVEntry[] {
    const rows = prefix
      ? this.db.query<{ key: string; value: string; updated_at: number }>(
          'SELECT key, value, updated_at FROM kv_store WHERE key LIKE ? ORDER BY key',
          [`${prefix}%`],
        )
      : this.db.query<{ key: string; value: string; updated_at: number }>(
          'SELECT key, value, updated_at FROM kv_store ORDER BY key',
        );

    return rows.map(r => ({ key: r.key, value: r.value, updatedAt: Number(r.updated_at) }));
  }

  count(prefix?: string): number {
    const rows = prefix
      ? this.db.query<{ c: number }>(
          'SELECT COUNT(*) as c FROM kv_store WHERE key LIKE ?', [`${prefix}%`],
        )
      : this.db.query<{ c: number }>('SELECT COUNT(*) as c FROM kv_store');
    return Number(rows[0]?.c ?? 0);
  }
}
