/**
 * T3.24 — Nudge assembler: vault context for contact nudges.
 *
 * Source: ARCHITECTURE.md Task 3.24
 */

import { assembleNudge } from '../../src/nudge/assembler';
import { storeItem, clearVaults } from '../../../core/src/vault/crud';
import { makeVaultItem, resetFactoryCounters } from '@dina/test-harness';

describe('Nudge Assembler', () => {
  beforeEach(() => {
    resetFactoryCounters();
    clearVaults();
  });

  describe('assembleNudge', () => {
    it('returns null when no context found (Silence First)', () => {
      expect(assembleNudge('did:plc:alice', 'Alice')).toBeNull();
    });

    it('returns nudge with items when context exists', () => {
      storeItem('general', makeVaultItem({
        summary: 'Lunch with Alice next Thursday', body: '',
        contact_did: 'did:plc:alice',
      }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge).not.toBeNull();
      expect(nudge!.items.length).toBeGreaterThan(0);
      expect(nudge!.contactDID).toBe('did:plc:alice');
    });

    it('searches by contact name', () => {
      storeItem('general', makeVaultItem({ summary: 'Bob prefers dark roast coffee', body: '' }));
      const nudge = assembleNudge('did:plc:bob', 'Bob');
      expect(nudge).not.toBeNull();
      expect(nudge!.items[0].text).toContain('Bob');
    });

    it('searches multiple personas', () => {
      storeItem('general', makeVaultItem({ summary: 'Alice general note', body: '' }));
      storeItem('work', makeVaultItem({ summary: 'Alice work project', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice', ['general', 'work']);
      expect(nudge!.items.length).toBe(2);
    });

    it('limits to top 5 items', () => {
      for (let i = 0; i < 8; i++) {
        storeItem('general', makeVaultItem({ summary: `Alice item ${i}`, body: '' }));
      }
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.items.length).toBeLessThanOrEqual(5);
    });

    it('sorts by recency (newest first)', () => {
      storeItem('general', makeVaultItem({ summary: 'Old Alice note', body: '', timestamp: 1000 }));
      storeItem('general', makeVaultItem({ summary: 'Recent Alice note', body: '', timestamp: 9999 }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.items[0].timestamp).toBeGreaterThan(nudge!.items[1].timestamp);
    });

    it('has generatedAt timestamp', () => {
      storeItem('general', makeVaultItem({ summary: 'Alice test', body: '' }));
      const before = Date.now();
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.generatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('nudge item classification', () => {
    it('classifies promise items', () => {
      storeItem('general', makeVaultItem({ summary: 'Promised to lend Alice the book', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.items[0].type).toBe('promise');
    });

    it('classifies event items (birthday)', () => {
      storeItem('general', makeVaultItem({ summary: 'Alice birthday March 15', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.items[0].type).toBe('event');
    });

    it('classifies preference items', () => {
      storeItem('general', makeVaultItem({ summary: 'Alice prefers dark chocolate', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.items[0].type).toBe('preference');
    });

    it('classifies relationship notes', () => {
      storeItem('general', makeVaultItem({ type: 'relationship_note', summary: 'Alice caught up', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.items[0].type).toBe('note');
    });

    it('defaults to message for unclassified items', () => {
      storeItem('general', makeVaultItem({ type: 'email', summary: 'Email from Alice about report', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.items[0].type).toBe('message');
    });
  });

  describe('summary generation', () => {
    it('includes contact name in summary', () => {
      storeItem('general', makeVaultItem({ summary: 'Alice meeting notes', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.summary).toContain('Alice');
    });

    it('includes promise count', () => {
      storeItem('general', makeVaultItem({ summary: 'Promised Alice coffee', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.summary).toContain('promise');
    });

    it('includes event count', () => {
      storeItem('general', makeVaultItem({ summary: 'Alice birthday party', body: '' }));
      const nudge = assembleNudge('did:plc:alice', 'Alice');
      expect(nudge!.summary).toContain('event');
    });
  });
});
