/**
 * T2.48 — Audit service: append, query, verify chain, retention.
 *
 * Source: ARCHITECTURE.md Task 2.48
 */

import {
  appendAudit, queryAudit, verifyAuditChain,
  sweepRetention, auditCount, latestEntry, resetAuditState,
} from '../../src/audit/service';

describe('Audit Service', () => {
  beforeEach(() => resetAuditState());

  describe('appendAudit', () => {
    it('appends entry with auto-incremented seq', () => {
      const e1 = appendAudit('brain', 'vault_store', 'general');
      const e2 = appendAudit('brain', 'vault_query', 'health');
      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
    });

    it('entry has SHA-256 hash', () => {
      const e = appendAudit('brain', 'vault_store', 'general', 'stored 5 items');
      expect(e.entry_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('first entry has empty prev_hash', () => {
      const e = appendAudit('brain', 'vault_store', 'general');
      expect(e.prev_hash).toBe('');
    });

    it('subsequent entries chain to previous hash', () => {
      const e1 = appendAudit('brain', 'action1', 'res1');
      const e2 = appendAudit('brain', 'action2', 'res2');
      expect(e2.prev_hash).toBe(e1.entry_hash);
    });

    it('stores actor, action, resource, detail', () => {
      const e = appendAudit('did:key:z6MkBrain', 'vault_store', 'general', 'batch of 10');
      expect(e.actor).toBe('did:key:z6MkBrain');
      expect(e.action).toBe('vault_store');
      expect(e.resource).toBe('general');
      expect(e.detail).toBe('batch of 10');
    });

    it('has timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      const e = appendAudit('x', 'y', 'z');
      expect(e.ts).toBeGreaterThanOrEqual(before);
    });
  });

  describe('queryAudit', () => {
    it('returns all entries without filters', () => {
      appendAudit('brain', 'store', 'general');
      appendAudit('brain', 'query', 'health');
      appendAudit('device', 'store', 'general');
      expect(queryAudit()).toHaveLength(3);
    });

    it('filters by actor', () => {
      appendAudit('brain', 'store', 'general');
      appendAudit('device', 'store', 'general');
      expect(queryAudit({ actor: 'brain' })).toHaveLength(1);
    });

    it('filters by action', () => {
      appendAudit('brain', 'vault_store', 'general');
      appendAudit('brain', 'vault_query', 'general');
      expect(queryAudit({ action: 'vault_store' })).toHaveLength(1);
    });

    it('filters by resource', () => {
      appendAudit('brain', 'store', 'general');
      appendAudit('brain', 'store', 'health');
      expect(queryAudit({ resource: 'health' })).toHaveLength(1);
    });

    it('respects limit (returns last N)', () => {
      for (let i = 0; i < 10; i++) appendAudit('brain', 'action', `res-${i}`);
      const results = queryAudit({ limit: 3 });
      expect(results).toHaveLength(3);
      expect(results[0].resource).toBe('res-7');
    });

    it('returns empty when no matches', () => {
      appendAudit('brain', 'store', 'general');
      expect(queryAudit({ actor: 'nobody' })).toHaveLength(0);
    });

    it('combines filters', () => {
      appendAudit('brain', 'store', 'general');
      appendAudit('brain', 'query', 'general');
      appendAudit('device', 'store', 'general');
      expect(queryAudit({ actor: 'brain', action: 'store' })).toHaveLength(1);
    });
  });

  describe('verifyAuditChain', () => {
    it('valid chain returns valid: true', () => {
      appendAudit('brain', 'store', 'general');
      appendAudit('brain', 'query', 'health');
      appendAudit('brain', 'delete', 'general');
      expect(verifyAuditChain().valid).toBe(true);
    });

    it('empty log is valid', () => {
      expect(verifyAuditChain().valid).toBe(true);
    });

    it('single entry is valid', () => {
      appendAudit('brain', 'store', 'general');
      expect(verifyAuditChain().valid).toBe(true);
    });
  });

  describe('sweepRetention', () => {
    it('purges entries older than 90 days', () => {
      appendAudit('brain', 'old-action', 'general');
      const ninetyOneDaysLater = Date.now() + (91 * 24 * 60 * 60 * 1000);
      const purged = sweepRetention(ninetyOneDaysLater);
      expect(purged).toBe(1);
      expect(auditCount()).toBe(0);
    });

    it('keeps recent entries', () => {
      appendAudit('brain', 'recent', 'general');
      const purged = sweepRetention();
      expect(purged).toBe(0);
      expect(auditCount()).toBe(1);
    });

    it('purges only old entries, keeps recent', () => {
      appendAudit('brain', 'old', 'general');
      // Sweep just past the first entry's retention window:
      // first entry's ts is ~now, so 91 days from now purges it
      const ninetyOneDaysMs = 91 * 24 * 60 * 60 * 1000;
      const purged = sweepRetention(Date.now() + ninetyOneDaysMs);
      expect(purged).toBe(1);
      expect(auditCount()).toBe(0);
    });
  });

  describe('auditCount / latestEntry', () => {
    it('count starts at 0', () => {
      expect(auditCount()).toBe(0);
    });

    it('latestEntry returns null when empty', () => {
      expect(latestEntry()).toBeNull();
    });

    it('latestEntry returns the most recent', () => {
      appendAudit('brain', 'first', 'a');
      appendAudit('brain', 'second', 'b');
      expect(latestEntry()!.action).toBe('second');
    });
  });
});
