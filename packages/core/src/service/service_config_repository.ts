/**
 * Service-config SQLite repository — durable backing for
 * `service/service_config.ts`.
 *
 * Two-tier pattern (matches `reminders/repository.ts`):
 *   - In-memory state in `service_config.ts` is the source of truth within
 *     the process.
 *   - The repository mirrors writes to SQLite so config survives restart.
 *   - When no repository is wired (tests), the in-memory layer still works.
 */

import type { DatabaseAdapter } from '../storage/db_adapter';

export interface ServiceConfigRepository {
  /** Read the JSON-encoded config blob by key, or `null` if absent. */
  get(key: string): string | null;

  /** Upsert the JSON-encoded config blob. */
  put(key: string, valueJSON: string, updatedAtMs: number): void;

  /** Delete the blob. No-op if the key does not exist. */
  remove(key: string): void;
}

let repo: ServiceConfigRepository | null = null;

export function setServiceConfigRepository(r: ServiceConfigRepository | null): void {
  repo = r;
}

export function getServiceConfigRepository(): ServiceConfigRepository | null {
  return repo;
}

/** SQLite-backed implementation. Uses the identity DB. */
export class SQLiteServiceConfigRepository implements ServiceConfigRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  get(key: string): string | null {
    const rows = this.db.query<{ value: string }>(
      'SELECT value FROM service_config WHERE key = ?',
      [key],
    );
    return rows.length > 0 ? String(rows[0].value) : null;
  }

  put(key: string, valueJSON: string, updatedAtMs: number): void {
    this.db.execute(
      `INSERT INTO service_config (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, valueJSON, updatedAtMs],
    );
  }

  remove(key: string): void {
    this.db.execute('DELETE FROM service_config WHERE key = ?', [key]);
  }
}

/**
 * Pure in-memory implementation for tests that want repository-style
 * persistence without a real SQLite connection.
 */
export class InMemoryServiceConfigRepository implements ServiceConfigRepository {
  private readonly rows = new Map<string, string>();

  get(key: string): string | null {
    return this.rows.get(key) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  put(key: string, valueJSON: string, _updatedAtMs: number): void {
    this.rows.set(key, valueJSON);
  }

  remove(key: string): void {
    this.rows.delete(key);
  }
}
