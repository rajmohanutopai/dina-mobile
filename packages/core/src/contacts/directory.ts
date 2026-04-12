/**
 * Contact directory — CRUD for contacts with trust levels and aliases.
 *
 * Each contact has:
 *   - DID (unique identifier)
 *   - Display name
 *   - Trust level: blocked, unknown, verified, trusted
 *   - Sharing tier: none, summary, full, locked
 *   - Aliases (unique across all contacts)
 *   - Notes (free-text relationship context)
 *
 * Alias uniqueness is enforced globally — no two contacts can share
 * the same alias. This prevents ambiguous person resolution.
 *
 * Source: ARCHITECTURE.md Section 2.50, Task 2.50
 */

export type TrustLevel = 'blocked' | 'unknown' | 'verified' | 'trusted';
export type SharingTier = 'none' | 'summary' | 'full' | 'locked';

export interface Contact {
  did: string;
  displayName: string;
  trustLevel: TrustLevel;
  sharingTier: SharingTier;
  aliases: string[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

/** In-memory contact store keyed by DID. */
const contacts = new Map<string, Contact>();

/** Global alias → DID index for uniqueness enforcement. */
const aliasIndex = new Map<string, string>();

/**
 * Add a new contact. Throws if DID already exists or alias conflicts.
 */
export function addContact(
  did: string,
  displayName: string,
  trustLevel?: TrustLevel,
  sharingTier?: SharingTier,
): Contact {
  if (!did || did.trim().length === 0) throw new Error('contacts: DID is required');
  if (contacts.has(did)) throw new Error(`contacts: "${did}" already exists`);

  const now = Date.now();
  const contact: Contact = {
    did,
    displayName: displayName.trim(),
    trustLevel: trustLevel ?? 'unknown',
    sharingTier: sharingTier ?? 'summary',
    aliases: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };

  contacts.set(did, contact);
  return contact;
}

/** Get a contact by DID. Returns null if not found. */
export function getContact(did: string): Contact | null {
  return contacts.get(did) ?? null;
}

/** List all contacts. */
export function listContacts(): Contact[] {
  return [...contacts.values()];
}

/** Update contact fields. Throws if not found. */
export function updateContact(
  did: string,
  updates: Partial<Pick<Contact, 'displayName' | 'trustLevel' | 'sharingTier' | 'notes'>>,
): Contact {
  const contact = contacts.get(did);
  if (!contact) throw new Error(`contacts: "${did}" not found`);

  if (updates.displayName !== undefined) contact.displayName = updates.displayName.trim();
  if (updates.trustLevel !== undefined) contact.trustLevel = updates.trustLevel;
  if (updates.sharingTier !== undefined) contact.sharingTier = updates.sharingTier;
  if (updates.notes !== undefined) contact.notes = updates.notes;
  contact.updatedAt = Date.now();

  return contact;
}

/** Delete a contact by DID. Returns true if found. */
export function deleteContact(did: string): boolean {
  const contact = contacts.get(did);
  if (!contact) return false;

  // Remove all aliases from the global index
  for (const alias of contact.aliases) {
    aliasIndex.delete(alias.toLowerCase());
  }

  contacts.delete(did);
  return true;
}

/**
 * Add an alias to a contact. Throws if alias already taken.
 *
 * Aliases are globally unique (case-insensitive) across all contacts.
 */
export function addAlias(did: string, alias: string): void {
  const contact = contacts.get(did);
  if (!contact) throw new Error(`contacts: "${did}" not found`);

  const normalized = alias.trim().toLowerCase();
  if (normalized.length === 0) throw new Error('contacts: alias cannot be empty');

  const existingOwner = aliasIndex.get(normalized);
  if (existingOwner !== undefined) {
    if (existingOwner === did) return; // already assigned to this contact
    throw new Error(`contacts: alias "${alias}" already taken by ${existingOwner}`);
  }

  aliasIndex.set(normalized, did);
  contact.aliases.push(alias.trim());
  contact.updatedAt = Date.now();
}

/** Remove an alias from a contact. */
export function removeAlias(did: string, alias: string): void {
  const contact = contacts.get(did);
  if (!contact) throw new Error(`contacts: "${did}" not found`);

  const normalized = alias.trim().toLowerCase();
  aliasIndex.delete(normalized);
  contact.aliases = contact.aliases.filter(a => a.toLowerCase() !== normalized);
  contact.updatedAt = Date.now();
}

/** Resolve a DID from an alias. Returns null if not found. */
export function resolveAlias(alias: string): string | null {
  return aliasIndex.get(alias.trim().toLowerCase()) ?? null;
}

/** Lookup contact by alias. Returns null if not found. */
export function findByAlias(alias: string): Contact | null {
  const did = resolveAlias(alias);
  return did ? (contacts.get(did) ?? null) : null;
}

/** Get contacts filtered by trust level. */
export function getContactsByTrust(trustLevel: TrustLevel): Contact[] {
  return [...contacts.values()].filter(c => c.trustLevel === trustLevel);
}

/** Reset all contact state (for testing). */
export function resetContactDirectory(): void {
  contacts.clear();
  aliasIndex.clear();
}
