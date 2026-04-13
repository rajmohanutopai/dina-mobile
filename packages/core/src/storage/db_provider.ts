/**
 * Database provider — manages identity and persona database lifecycle.
 *
 * Two-database architecture (matching Go):
 *   Identity DB: global, encrypted with identity DEK. Contains contacts,
 *     audit_log, paired_devices, reminders, staging_inbox, kv_store.
 *   Persona DBs: one per persona, each encrypted with its own DEK.
 *     Contains vault_items + FTS5.
 *
 * The provider is injectable — tests use InMemoryDatabaseAdapter,
 * production uses OpSQLiteAdapter.
 *
 * Source: ARCHITECTURE.md — op-sqlite persistence layer
 */

import type { DatabaseAdapter } from './db_adapter';

/**
 * Database provider interface.
 */
export interface DBProvider {
  /** Open the global identity database. */
  openIdentityDB(): DatabaseAdapter;

  /** Open a persona-specific vault database. */
  openPersonaDB(persona: string): DatabaseAdapter;

  /** Close a persona database. */
  closePersonaDB(persona: string): void;

  /** Get the identity database (null if not opened). */
  getIdentityDB(): DatabaseAdapter | null;

  /** Get a persona database (null if not opened). */
  getPersonaDB(persona: string): DatabaseAdapter | null;

  /** Close all databases. */
  closeAll(): void;
}

/** The active provider. Null = no persistence (in-memory mode). */
let provider: DBProvider | null = null;

/** Set the database provider (called at app startup). */
export function setDBProvider(p: DBProvider | null): void {
  provider = p;
}

/** Get the active database provider. */
export function getDBProvider(): DBProvider | null {
  return provider;
}

/** Get the identity database adapter (null if no persistence). */
export function getIdentityDB(): DatabaseAdapter | null {
  return provider?.getIdentityDB() ?? null;
}

/** Get a persona database adapter (null if no persistence). */
export function getPersonaDB(persona: string): DatabaseAdapter | null {
  return provider?.getPersonaDB(persona) ?? null;
}

/** Reset provider (for testing). */
export function resetDBProvider(): void {
  if (provider) {
    provider.closeAll();
  }
  provider = null;
}
