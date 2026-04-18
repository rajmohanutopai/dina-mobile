/**
 * App persistence initialization — called after identity unlock.
 *
 * Wires all SQL repositories into the service modules.
 * After this call, all data operations persist to SQLCipher databases.
 *
 * Usage in app startup:
 *   const masterSeed = await unwrapSeed(passphrase, wrappedSeed);
 *   await initializePersistence(masterSeed, userSalt);
 *
 * Source: ARCHITECTURE.md — op-sqlite persistence layer
 */

import { ProductionDBProvider } from './provider';
import { bootstrapPersistence, openPersonaVault, shutdownPersistence } from '../../../core/src/storage/bootstrap';
import { setKVRepository } from '../../../core/src/kv/store';
import { SQLiteKVRepository } from '../../../core/src/kv/repository';
import { setContactRepository, SQLiteContactRepository } from '../../../core/src/contacts/repository';
import { setReminderRepository, SQLiteReminderRepository } from '../../../core/src/reminders/repository';
import { setAuditRepository, SQLiteAuditRepository } from '../../../core/src/audit/repository';
import { setDeviceRepository, SQLiteDeviceRepository } from '../../../core/src/devices/repository';
import { setStagingRepository, SQLiteStagingRepository } from '../../../core/src/staging/repository';
import { setVaultRepository, SQLiteVaultRepository } from '../../../core/src/vault/repository';
import {
  setChatMessageRepository,
  SQLiteChatMessageRepository,
} from '../../../core/src/chat/repository';
import type { DatabaseAdapter } from '../../../core/src/storage/db_adapter';
// Expo 55 moved the document-directory constant behind `Paths.document` (a
// `Directory` object exposing `.uri`). The legacy flat `documentDirectory`
// export now lives under `expo-file-system/legacy` — we use it here because
// op-sqlite's `location` parameter takes a raw string directory URI.
import { Paths } from 'expo-file-system';

/** The active provider. */
let provider: ProductionDBProvider | null = null;
/**
 * The open identity database adapter, cached for consumers like
 * `boot_capabilities` that need to feed it to `bootAppNode` as the
 * workflow + service-config durable store. Reset to `null` on shutdown.
 */
let identityAdapter: DatabaseAdapter | null = null;

/**
 * Initialize all persistence after identity unlock.
 *
 * 1. Opens the identity database (encrypted with identity DEK)
 * 2. Applies schema migrations
 * 3. Wires all SQL repositories into service modules
 * 4. Returns the provider for persona DB management
 */
export async function initializePersistence(
  masterSeed: Uint8Array,
  userSalt: Uint8Array,
): Promise<void> {
  // Use Expo's document directory for database storage. `Paths.document`
  // returns a `Directory` whose `.uri` is a `file://…/` string — op-sqlite
  // wants a raw filesystem path without the scheme prefix.
  const docUri = Paths.document.uri;
  const dbDir = docUri.startsWith('file://') ? docUri.slice('file://'.length) : docUri;

  // Lazy import op-sqlite (native module, not available in tests)
  const { open } = require('@op-engineering/op-sqlite');

  provider = new ProductionDBProvider({
    dbDir,
    masterSeed,
    userSalt,
    openFn: open,
  });

  // Open identity DB + apply migrations
  const identityDB = bootstrapPersistence(provider);
  identityAdapter = identityDB;

  // Wire all identity-scoped repositories
  setKVRepository(new SQLiteKVRepository(identityDB));
  setContactRepository(new SQLiteContactRepository(identityDB));
  setReminderRepository(new SQLiteReminderRepository(identityDB));
  setAuditRepository(new SQLiteAuditRepository(identityDB));
  setDeviceRepository(new SQLiteDeviceRepository(identityDB));
  setStagingRepository(new SQLiteStagingRepository(identityDB));
  setChatMessageRepository(new SQLiteChatMessageRepository(identityDB));
}

/**
 * Get the open identity DatabaseAdapter — `null` when persistence hasn't
 * been initialized yet (pre-unlock, or running in a test harness that
 * doesn't boot op-sqlite). `boot_capabilities` reads this to decide
 * between SQLite and in-memory workflow repositories.
 */
export function getIdentityAdapter(): DatabaseAdapter | null {
  return identityAdapter;
}

/** True when initializePersistence has run successfully. */
export function isPersistenceReady(): boolean {
  return identityAdapter !== null;
}

/**
 * Open a persona vault database after persona unlock.
 *
 * Called when the user unlocks a persona (provides DEK).
 * Wires the persona's vault repository.
 */
export function openPersonaDB(persona: string): void {
  if (!provider) throw new Error('persistence: not initialized — call initializePersistence first');
  const personaDB = openPersonaVault(provider, persona);
  setVaultRepository(persona, new SQLiteVaultRepository(personaDB));
}

/**
 * Shutdown all persistence — close databases, clear repositories.
 *
 * Called on app background or explicit logout.
 */
export function shutdownAllPersistence(): void {
  shutdownPersistence();
  provider = null;
  identityAdapter = null;
}
