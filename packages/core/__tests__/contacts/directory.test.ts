/**
 * T2.50 — Contact directory: CRUD, trust levels, aliases, uniqueness.
 *
 * Source: ARCHITECTURE.md Section 2.50
 */

import {
  addContact,
  getContact,
  listContacts,
  updateContact,
  deleteContact,
  addAlias,
  removeAlias,
  resolveAlias,
  findByAlias,
  getContactsByTrust,
  resetContactDirectory,
} from '../../src/contacts/directory';

describe('Contact Directory', () => {
  beforeEach(() => resetContactDirectory());

  describe('addContact', () => {
    it('adds a contact with default trust/sharing', () => {
      const c = addContact('did:plc:alice', 'Alice');
      expect(c.did).toBe('did:plc:alice');
      expect(c.displayName).toBe('Alice');
      expect(c.trustLevel).toBe('unknown');
      expect(c.sharingTier).toBe('summary');
    });

    it('accepts custom trust level and sharing tier', () => {
      const c = addContact('did:plc:bob', 'Bob', 'trusted', 'full');
      expect(c.trustLevel).toBe('trusted');
      expect(c.sharingTier).toBe('full');
    });

    it('rejects duplicate DID', () => {
      addContact('did:plc:alice', 'Alice');
      expect(() => addContact('did:plc:alice', 'Alice 2')).toThrow('already exists');
    });

    it('rejects empty DID', () => {
      expect(() => addContact('', 'Nobody')).toThrow('DID is required');
    });

    it('has timestamps', () => {
      const before = Date.now();
      const c = addContact('did:plc:alice', 'Alice');
      expect(c.createdAt).toBeGreaterThanOrEqual(before);
      expect(c.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getContact / listContacts', () => {
    it('retrieves contact by DID', () => {
      addContact('did:plc:alice', 'Alice');
      expect(getContact('did:plc:alice')!.displayName).toBe('Alice');
    });

    it('returns null for unknown DID', () => {
      expect(getContact('did:plc:unknown')).toBeNull();
    });

    it('lists all contacts', () => {
      addContact('did:plc:alice', 'Alice');
      addContact('did:plc:bob', 'Bob');
      expect(listContacts()).toHaveLength(2);
    });
  });

  describe('updateContact', () => {
    it('updates trust level', () => {
      addContact('did:plc:alice', 'Alice');
      const updated = updateContact('did:plc:alice', { trustLevel: 'trusted' });
      expect(updated.trustLevel).toBe('trusted');
    });

    it('updates sharing tier', () => {
      addContact('did:plc:alice', 'Alice');
      updateContact('did:plc:alice', { sharingTier: 'full' });
      expect(getContact('did:plc:alice')!.sharingTier).toBe('full');
    });

    it('updates notes', () => {
      addContact('did:plc:alice', 'Alice');
      updateContact('did:plc:alice', { notes: 'Met at conference 2025' });
      expect(getContact('did:plc:alice')!.notes).toBe('Met at conference 2025');
    });

    it('updates updatedAt timestamp', () => {
      addContact('did:plc:alice', 'Alice');
      const before = Date.now();
      updateContact('did:plc:alice', { trustLevel: 'verified' });
      expect(getContact('did:plc:alice')!.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('throws for unknown DID', () => {
      expect(() => updateContact('did:plc:unknown', { trustLevel: 'trusted' }))
        .toThrow('not found');
    });
  });

  describe('deleteContact', () => {
    it('removes contact', () => {
      addContact('did:plc:alice', 'Alice');
      expect(deleteContact('did:plc:alice')).toBe(true);
      expect(getContact('did:plc:alice')).toBeNull();
    });

    it('returns false for unknown DID', () => {
      expect(deleteContact('did:plc:unknown')).toBe(false);
    });

    it('removes associated aliases', () => {
      addContact('did:plc:alice', 'Alice');
      addAlias('did:plc:alice', 'Ali');
      deleteContact('did:plc:alice');
      expect(resolveAlias('Ali')).toBeNull();
    });
  });

  describe('alias management', () => {
    it('adds alias to contact', () => {
      addContact('did:plc:alice', 'Alice');
      addAlias('did:plc:alice', 'Ali');
      expect(getContact('did:plc:alice')!.aliases).toContain('Ali');
    });

    it('resolves DID from alias', () => {
      addContact('did:plc:alice', 'Alice');
      addAlias('did:plc:alice', 'Ali');
      expect(resolveAlias('Ali')).toBe('did:plc:alice');
    });

    it('alias is case-insensitive', () => {
      addContact('did:plc:alice', 'Alice');
      addAlias('did:plc:alice', 'Ali');
      expect(resolveAlias('ALI')).toBe('did:plc:alice');
      expect(resolveAlias('ali')).toBe('did:plc:alice');
    });

    it('rejects duplicate alias across contacts', () => {
      addContact('did:plc:alice', 'Alice');
      addContact('did:plc:bob', 'Bob');
      addAlias('did:plc:alice', 'Ali');
      expect(() => addAlias('did:plc:bob', 'Ali')).toThrow('already taken');
    });

    it('allows adding same alias to same contact (idempotent)', () => {
      addContact('did:plc:alice', 'Alice');
      addAlias('did:plc:alice', 'Ali');
      addAlias('did:plc:alice', 'Ali'); // no throw
      expect(getContact('did:plc:alice')!.aliases.filter(a => a === 'Ali')).toHaveLength(1);
    });

    it('rejects empty alias', () => {
      addContact('did:plc:alice', 'Alice');
      expect(() => addAlias('did:plc:alice', '')).toThrow('cannot be empty');
    });

    it('removes alias', () => {
      addContact('did:plc:alice', 'Alice');
      addAlias('did:plc:alice', 'Ali');
      removeAlias('did:plc:alice', 'Ali');
      expect(resolveAlias('Ali')).toBeNull();
      expect(getContact('did:plc:alice')!.aliases).toHaveLength(0);
    });

    it('findByAlias returns contact', () => {
      addContact('did:plc:alice', 'Alice');
      addAlias('did:plc:alice', 'Ali');
      const c = findByAlias('Ali');
      expect(c).not.toBeNull();
      expect(c!.did).toBe('did:plc:alice');
    });

    it('findByAlias returns null for unknown alias', () => {
      expect(findByAlias('nobody')).toBeNull();
    });
  });

  describe('trust filtering', () => {
    it('getContactsByTrust filters correctly', () => {
      addContact('did:plc:alice', 'Alice', 'trusted');
      addContact('did:plc:bob', 'Bob', 'unknown');
      addContact('did:plc:charlie', 'Charlie', 'trusted');
      const trusted = getContactsByTrust('trusted');
      expect(trusted).toHaveLength(2);
      expect(trusted.map(c => c.displayName).sort()).toEqual(['Alice', 'Charlie']);
    });

    it('returns empty for no matches', () => {
      addContact('did:plc:alice', 'Alice', 'unknown');
      expect(getContactsByTrust('blocked')).toHaveLength(0);
    });
  });
});
