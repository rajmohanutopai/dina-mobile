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
  isContact,
  getTrustLevel,
  resolveByName,
  addContactIfNotExists,
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

    it('addContactIfNotExists creates new contact', () => {
      const { contact, created } = addContactIfNotExists('did:plc:new', 'New Contact');
      expect(created).toBe(true);
      expect(contact.did).toBe('did:plc:new');
      expect(contact.displayName).toBe('New Contact');
    });

    it('addContactIfNotExists returns existing on duplicate (no throw)', () => {
      addContact('did:plc:alice', 'Alice', 'trusted');
      const { contact, created } = addContactIfNotExists('did:plc:alice', 'Alice Copy');
      expect(created).toBe(false);
      expect(contact.displayName).toBe('Alice'); // original, not "Alice Copy"
      expect(contact.trustLevel).toBe('trusted');
    });

    it('addContactIfNotExists preserves existing contact data', () => {
      addContact('did:plc:bob', 'Bob', 'verified', 'full');
      const { contact } = addContactIfNotExists('did:plc:bob', 'Bobby', 'unknown', 'none');
      // Original data preserved, not overwritten
      expect(contact.displayName).toBe('Bob');
      expect(contact.trustLevel).toBe('verified');
      expect(contact.sharingTier).toBe('full');
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

  describe('relationship + data_responsibility', () => {
    it('defaults to relationship=unknown, dataResponsibility=external', () => {
      const c = addContact('did:plc:alice', 'Alice');
      expect(c.relationship).toBe('unknown');
      expect(c.dataResponsibility).toBe('external');
    });

    it('accepts relationship parameter on creation', () => {
      const c = addContact('did:plc:alice', 'Alice', undefined, undefined, 'spouse');
      expect(c.relationship).toBe('spouse');
    });

    it('auto-derives household for spouse', () => {
      const c = addContact('did:plc:alice', 'Alice', undefined, undefined, 'spouse');
      expect(c.dataResponsibility).toBe('household');
    });

    it('auto-derives household for child', () => {
      const c = addContact('did:plc:kid', 'Emma', undefined, undefined, 'child');
      expect(c.dataResponsibility).toBe('household');
    });

    it('auto-derives external for friend', () => {
      const c = addContact('did:plc:bob', 'Bob', undefined, undefined, 'friend');
      expect(c.dataResponsibility).toBe('external');
    });

    it('auto-derives external for colleague', () => {
      const c = addContact('did:plc:carol', 'Carol', undefined, undefined, 'colleague');
      expect(c.dataResponsibility).toBe('external');
    });

    it('rejects invalid relationship on creation', () => {
      expect(() => addContact('did:plc:x', 'X', undefined, undefined, 'bestie' as any))
        .toThrow('invalid relationship');
    });

    it('updateContact with relationship auto-derives dataResponsibility', () => {
      addContact('did:plc:alice', 'Alice');
      expect(getContact('did:plc:alice')!.dataResponsibility).toBe('external');

      updateContact('did:plc:alice', { relationship: 'spouse' });
      expect(getContact('did:plc:alice')!.relationship).toBe('spouse');
      expect(getContact('did:plc:alice')!.dataResponsibility).toBe('household');
    });

    it('updateContact rejects invalid relationship', () => {
      addContact('did:plc:alice', 'Alice');
      expect(() => updateContact('did:plc:alice', { relationship: 'enemy' as any }))
        .toThrow('invalid relationship');
    });

    it('explicit dataResponsibility override on update', () => {
      addContact('did:plc:alice', 'Alice', undefined, undefined, 'friend');
      // Default: friend → external
      expect(getContact('did:plc:alice')!.dataResponsibility).toBe('external');

      // Override: friend → care (e.g., user manages friend's medical decisions)
      updateContact('did:plc:alice', { dataResponsibility: 'care' });
      expect(getContact('did:plc:alice')!.dataResponsibility).toBe('care');
    });

    it('relationship change re-derives unless explicit override', () => {
      addContact('did:plc:alice', 'Alice', undefined, undefined, 'friend');
      expect(getContact('did:plc:alice')!.dataResponsibility).toBe('external');

      // Change to child → auto-derive to household
      updateContact('did:plc:alice', { relationship: 'child' });
      expect(getContact('did:plc:alice')!.dataResponsibility).toBe('household');

      // Change to colleague with explicit financial override
      updateContact('did:plc:alice', { relationship: 'colleague', dataResponsibility: 'financial' });
      expect(getContact('did:plc:alice')!.relationship).toBe('colleague');
      expect(getContact('did:plc:alice')!.dataResponsibility).toBe('financial');
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

  describe('fast-path ingress APIs', () => {
    describe('isContact', () => {
      it('returns true for known DID', () => {
        addContact('did:plc:alice', 'Alice');
        expect(isContact('did:plc:alice')).toBe(true);
      });

      it('returns false for unknown DID', () => {
        expect(isContact('did:plc:stranger')).toBe(false);
      });

      it('O(1) lookup — does not iterate contacts', () => {
        // Add many contacts to verify performance doesn't degrade
        for (let i = 0; i < 100; i++) addContact(`did:plc:c${i}`, `Contact ${i}`);
        expect(isContact('did:plc:c50')).toBe(true);
        expect(isContact('did:plc:missing')).toBe(false);
      });
    });

    describe('getTrustLevel', () => {
      it('returns trust level for known DID', () => {
        addContact('did:plc:alice', 'Alice', 'trusted');
        expect(getTrustLevel('did:plc:alice')).toBe('trusted');
      });

      it('returns null for unknown DID', () => {
        expect(getTrustLevel('did:plc:stranger')).toBeNull();
      });

      it('reflects updated trust level', () => {
        addContact('did:plc:alice', 'Alice', 'unknown');
        expect(getTrustLevel('did:plc:alice')).toBe('unknown');
        updateContact('did:plc:alice', { trustLevel: 'verified' });
        expect(getTrustLevel('did:plc:alice')).toBe('verified');
      });
    });

    describe('resolveByName', () => {
      it('resolves contact by exact display name', () => {
        addContact('did:plc:alice', 'Alice');
        const contact = resolveByName('Alice');
        expect(contact).not.toBeNull();
        expect(contact!.did).toBe('did:plc:alice');
      });

      it('case-insensitive match', () => {
        addContact('did:plc:alice', 'Alice');
        expect(resolveByName('alice')).not.toBeNull();
        expect(resolveByName('ALICE')).not.toBeNull();
      });

      it('returns null for unknown name', () => {
        expect(resolveByName('Nobody')).toBeNull();
      });

      it('returns null for empty name', () => {
        expect(resolveByName('')).toBeNull();
      });

      it('trims whitespace', () => {
        addContact('did:plc:bob', 'Bob');
        expect(resolveByName('  Bob  ')).not.toBeNull();
      });
    });
  });
});
