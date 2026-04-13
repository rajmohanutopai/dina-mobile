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

import { validateAlias, validateRelationship, validateDataResponsibility, defaultResponsibility } from './validation';
import { getContactRepository } from './repository';

export type TrustLevel = 'blocked' | 'unknown' | 'verified' | 'trusted';
export type SharingTier = 'none' | 'summary' | 'full' | 'locked';
export type Relationship = 'spouse' | 'child' | 'parent' | 'sibling' | 'friend' | 'colleague' | 'acquaintance' | 'unknown';
export type DataResponsibility = 'household' | 'care' | 'financial' | 'external';

export interface Contact {
  did: string;
  displayName: string;
  trustLevel: TrustLevel;
  sharingTier: SharingTier;
  relationship: Relationship;
  dataResponsibility: DataResponsibility;
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
 *
 * If relationship is provided, dataResponsibility is auto-derived
 * via defaultResponsibility() (matching Go domain/contact.go):
 *   spouse/child → "household"
 *   all others → "external"
 */
export function addContact(
  did: string,
  displayName: string,
  trustLevel?: TrustLevel,
  sharingTier?: SharingTier,
  relationship?: Relationship,
): Contact {
  if (!did || did.trim().length === 0) throw new Error('contacts: DID is required');
  if (contacts.has(did)) throw new Error(`contacts: "${did}" already exists`);

  // Validate relationship if provided
  const rel = relationship ?? 'unknown';
  const relError = validateRelationship(rel);
  if (relError) throw new Error(`contacts: ${relError}`);

  const now = Date.now();
  const contact: Contact = {
    did,
    displayName: displayName.trim(),
    trustLevel: trustLevel ?? 'unknown',
    sharingTier: sharingTier ?? 'summary',
    relationship: rel,
    dataResponsibility: defaultResponsibility(rel) as DataResponsibility,
    aliases: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };

  contacts.set(did, contact);
  // SQL write-through
  const sqlRepo = getContactRepository();
  if (sqlRepo) { try { sqlRepo.add(contact); } catch { /* fail-safe */ } }
  return contact;
}

/**
 * Add a contact if it doesn't already exist (INSERT OR IGNORE semantics).
 *
 * Returns { contact, created: true } for new contacts, or
 * { contact, created: false } for existing contacts (no throw).
 * Matching Go's INSERT OR IGNORE behavior.
 */
export function addContactIfNotExists(
  did: string,
  displayName: string,
  trustLevel?: TrustLevel,
  sharingTier?: SharingTier,
  relationship?: Relationship,
): { contact: Contact; created: boolean } {
  const existing = contacts.get(did);
  if (existing) {
    return { contact: existing, created: false };
  }
  const contact = addContact(did, displayName, trustLevel, sharingTier, relationship);
  return { contact, created: true };
}

/** Get a contact by DID. Returns null if not found. */
export function getContact(did: string): Contact | null {
  return contacts.get(did) ?? null;
}

/** List all contacts. */
export function listContacts(): Contact[] {
  return [...contacts.values()];
}

/**
 * Update contact fields. Throws if not found.
 *
 * When relationship is updated, dataResponsibility is auto-re-derived
 * unless an explicit dataResponsibility override is provided.
 */
export function updateContact(
  did: string,
  updates: Partial<Pick<Contact, 'displayName' | 'trustLevel' | 'sharingTier' | 'notes' | 'relationship' | 'dataResponsibility'>>,
): Contact {
  const contact = contacts.get(did);
  if (!contact) throw new Error(`contacts: "${did}" not found`);

  if (updates.displayName !== undefined) contact.displayName = updates.displayName.trim();
  if (updates.trustLevel !== undefined) contact.trustLevel = updates.trustLevel;
  if (updates.sharingTier !== undefined) contact.sharingTier = updates.sharingTier;
  if (updates.notes !== undefined) contact.notes = updates.notes;

  // Relationship update → auto-derive dataResponsibility
  if (updates.relationship !== undefined) {
    const relError = validateRelationship(updates.relationship);
    if (relError) throw new Error(`contacts: ${relError}`);
    contact.relationship = updates.relationship;
    // Auto-derive unless explicit override provided
    if (updates.dataResponsibility === undefined) {
      contact.dataResponsibility = defaultResponsibility(updates.relationship) as DataResponsibility;
    }
  }

  // Explicit dataResponsibility override (user-set vs auto-derived)
  // Fix: Codex #20 — validate the override value
  if (updates.dataResponsibility !== undefined) {
    const drError = validateDataResponsibility(updates.dataResponsibility);
    if (drError) throw new Error(`contacts: ${drError}`);
    contact.dataResponsibility = updates.dataResponsibility;
  }

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

  // Validate alias: min 2 chars, not a reserved pronoun
  const validationError = validateAlias(alias);
  if (validationError) throw new Error(`contacts: ${validationError}`);

  const normalized = alias.trim().toLowerCase();

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

// ---------------------------------------------------------------
// Fast-path ingress interfaces (matching Go contact.go)
// ---------------------------------------------------------------

/**
 * Check if a DID belongs to a known contact. O(1) lookup.
 *
 * Used by D2D receive pipeline for fast trust evaluation
 * without loading the full Contact object.
 */
export function isContact(did: string): boolean {
  return contacts.has(did);
}

/**
 * Get the trust level for a DID. Returns null if not a contact.
 *
 * Fast-path for ingress trust evaluation — avoids full contact
 * deserialization when only the trust level is needed.
 */
export function getTrustLevel(did: string): TrustLevel | null {
  const contact = contacts.get(did);
  return contact ? contact.trustLevel : null;
}

/**
 * Resolve a contact by exact display name match.
 *
 * Returns the first contact whose displayName matches exactly
 * (case-insensitive). Returns null if no match.
 *
 * Matching Go's Resolve(name) — exact match at directory level.
 */
export function resolveByName(name: string): Contact | null {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  for (const contact of contacts.values()) {
    if (contact.displayName.toLowerCase() === lower) {
      return contact;
    }
  }
  return null;
}

/** Reset all contact state (for testing). */
export function resetContactDirectory(): void {
  contacts.clear();
  aliasIndex.clear();
}
