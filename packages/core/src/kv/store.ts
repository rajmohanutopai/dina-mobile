/**
 * Key-value store — simple persistent key-value service.
 *
 * Used for lightweight config, state flags, and metadata that doesn't
 * belong in a vault or persona. Namespace support allows per-persona
 * or per-feature isolation.
 *
 * In production, backed by the identity DB's `kv_store` table.
 * In-memory implementation for testing and early integration.
 *
 * Source: ARCHITECTURE.md Task 2.49
 */

import type { KVRepository } from './repository';

export interface KVEntry {
  key: string;
  value: string;
  updatedAt: number;
}

/** SQL-backed repository (null = in-memory mode for tests). */
let repo: KVRepository | null = null;

/** Set the SQL repository for persistence. */
export function setKVRepository(r: KVRepository | null): void { repo = r; }

/** In-memory KV store: namespace:key → value. */
const store = new Map<string, KVEntry>();

/** Build the internal composite key. */
function compositeKey(key: string, namespace?: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

/**
 * Get a value by key. Returns null if not found.
 */
export function kvGet(key: string, namespace?: string): string | null {
  const ck = compositeKey(key, namespace);
  if (repo) {
    const entry = repo.get(ck);
    return entry?.value ?? null;
  }
  const entry = store.get(ck);
  return entry?.value ?? null;
}

/**
 * Set a value. Creates or overwrites.
 */
export function kvSet(key: string, value: string, namespace?: string): void {
  const ck = compositeKey(key, namespace);
  if (repo) {
    repo.set(ck, value);
    return;
  }
  store.set(ck, { key: ck, value, updatedAt: Date.now() });
}

/**
 * Delete a key. Returns true if it existed.
 */
export function kvDelete(key: string, namespace?: string): boolean {
  const ck = compositeKey(key, namespace);
  if (repo) return repo.delete(ck);
  return store.delete(ck);
}

/**
 * Check if a key exists.
 */
export function kvHas(key: string, namespace?: string): boolean {
  const ck = compositeKey(key, namespace);
  if (repo) return repo.has(ck);
  return store.has(ck);
}

/**
 * List all keys in a namespace (or all keys if no namespace).
 * Returns entries sorted by key.
 */
export function kvList(namespace?: string): KVEntry[] {
  const prefix = namespace ? `${namespace}:` : undefined;
  if (repo) return repo.list(prefix);

  const entries: KVEntry[] = [];
  for (const entry of store.values()) {
    if (!namespace || entry.key.startsWith(prefix!)) {
      entries.push(entry);
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Get the count of entries in a namespace (or total).
 */
export function kvCount(namespace?: string): number {
  const prefix = namespace ? `${namespace}:` : undefined;
  if (repo) return repo.count(prefix);

  if (!namespace) return store.size;
  let count = 0;
  for (const entry of store.values()) {
    if (entry.key.startsWith(prefix!)) count++;
  }
  return count;
}

/** Reset all KV state (for testing). */
export function resetKVStore(): void {
  store.clear();
  repo = null;
}
