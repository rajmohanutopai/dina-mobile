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
import * as FileSystem from 'expo-file-system';

/** The active provider. */
let provider: ProductionDBProvider | null = null;

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
  // Use Expo's document directory for database storage
  const dbDir = FileSystem.documentDirectory ?? '';

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

  // Wire all identity-scoped repositories
  setKVRepository(new SQLiteKVRepository(identityDB));
  setContactRepository(new SQLiteContactRepository(identityDB));
  setReminderRepository(new SQLiteReminderRepository(identityDB));
  setAuditRepository(new SQLiteAuditRepository(identityDB));
  setDeviceRepository(new SQLiteDeviceRepository(identityDB));
  setStagingRepository(new SQLiteStagingRepository(identityDB));
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
}
