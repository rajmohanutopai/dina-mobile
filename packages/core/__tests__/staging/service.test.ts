/**
 * T2.41–2.47 — Staging service: ingest, claim, resolve, fail, sweep, drain.
 *
 * Source: ARCHITECTURE.md Tasks 2.41–2.47
 */

import {
  ingest, claim, resolve, fail, extendLease, sweep, drainForPersona,
  getItem, inboxSize, resetStagingState,
} from '../../src/staging/service';

describe('Staging Service', () => {
  beforeEach(() => resetStagingState());

  describe('ingest (2.41)', () => {
    it('ingests an item with generated ID', () => {
      const { id, duplicate } = ingest({ source: 'gmail', source_id: 'msg-001' });
      expect(id).toMatch(/^stg-[0-9a-f]{16}$/);
      expect(duplicate).toBe(false);
      expect(getItem(id)!.status).toBe('received');
    });

    it('dedup rejects same (source, source_id)', () => {
      const r1 = ingest({ source: 'gmail', source_id: 'msg-001' });
      const r2 = ingest({ source: 'gmail', source_id: 'msg-001' });
      expect(r2.duplicate).toBe(true);
      expect(r2.id).toBe(r1.id);
      expect(inboxSize()).toBe(1);
    });

    it('different source_id is not a duplicate', () => {
      ingest({ source: 'gmail', source_id: 'msg-001' });
      const r2 = ingest({ source: 'gmail', source_id: 'msg-002' });
      expect(r2.duplicate).toBe(false);
      expect(inboxSize()).toBe(2);
    });

    it('sets expires_at 7 days from now', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'x' });
      const item = getItem(id)!;
      const sevenDays = 7 * 24 * 3600;
      expect(item.expires_at - item.created_at).toBe(sevenDays);
    });

    it('stores custom data payload', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'x', data: { subject: 'Hello' } });
      expect(getItem(id)!.data).toEqual({ subject: 'Hello' });
    });
  });

  describe('claim (2.42)', () => {
    it('claims received items → classifying', () => {
      ingest({ source: 'gmail', source_id: 'a' });
      ingest({ source: 'gmail', source_id: 'b' });
      const claimed = claim(10);
      expect(claimed).toHaveLength(2);
      expect(claimed[0].status).toBe('classifying');
      expect(claimed[0].lease_until).toBeGreaterThan(0);
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) ingest({ source: 'gmail', source_id: `m-${i}` });
      expect(claim(2)).toHaveLength(2);
    });

    it('re-claim returns empty (items already claimed)', () => {
      ingest({ source: 'gmail', source_id: 'a' });
      claim(10);
      expect(claim(10)).toHaveLength(0);
    });

    it('sets 15-minute lease', () => {
      ingest({ source: 'gmail', source_id: 'a' });
      const [item] = claim(1);
      const now = Math.floor(Date.now() / 1000);
      expect(item.lease_until - now).toBeCloseTo(15 * 60, -1);
    });
  });

  describe('resolve (2.43)', () => {
    it('resolves to open persona → stored', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      claim(10);
      resolve(id, 'general', true);
      expect(getItem(id)!.status).toBe('stored');
      expect(getItem(id)!.persona).toBe('general');
    });

    it('resolves to locked persona → pending_unlock', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      claim(10);
      resolve(id, 'health', false);
      expect(getItem(id)!.status).toBe('pending_unlock');
    });

    it('throws for unclaimed item', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      expect(() => resolve(id, 'general', true)).toThrow('cannot resolve');
    });
  });

  describe('fail (2.44)', () => {
    it('increments retry_count', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      claim(10);
      fail(id);
      expect(getItem(id)!.retry_count).toBe(1);
      expect(getItem(id)!.status).toBe('failed');
    });

    it('throws for non-classifying item', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      expect(() => fail(id)).toThrow('cannot fail');
    });
  });

  describe('extendLease (2.45)', () => {
    it('extends lease by N seconds', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      claim(10);
      const before = getItem(id)!.lease_until;
      extendLease(id, 300);
      expect(getItem(id)!.lease_until).toBe(before + 300);
    });

    it('throws for non-classifying item', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      expect(() => extendLease(id, 300)).toThrow('cannot extend');
    });
  });

  describe('sweep (2.46)', () => {
    it('deletes expired items', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      const item = getItem(id)!;
      const futureNow = item.expires_at + 1;
      const result = sweep(futureNow);
      expect(result.expired).toBe(1);
      expect(inboxSize()).toBe(0);
    });

    it('reverts stale leases', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      claim(10);
      const item = getItem(id)!;
      const pastLease = item.lease_until + 1;
      const result = sweep(pastLease);
      expect(result.leaseReverted).toBe(1);
      expect(getItem(id)!.status).toBe('received');
    });

    it('requeues failed items (retry ≤ 3)', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      claim(10);
      fail(id); // retry_count = 1
      const result = sweep();
      expect(result.requeued).toBe(1);
      expect(getItem(id)!.status).toBe('received');
    });

    it('dead-letters failed items (retry > 3)', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      // Simulate 4 failures
      for (let i = 0; i < 4; i++) {
        claim(10);
        fail(id);
        if (i < 3) sweep(); // requeue first 3 times
      }
      const result = sweep();
      expect(result.deadLettered).toBe(1);
      expect(getItem(id)!.status).toBe('failed'); // stays failed
    });
  });

  describe('drainForPersona (2.47)', () => {
    it('drains pending_unlock items when persona unlocked', () => {
      const { id: id1 } = ingest({ source: 'gmail', source_id: 'a' });
      const { id: id2 } = ingest({ source: 'gmail', source_id: 'b' });
      claim(10);
      resolve(id1, 'health', false); // pending_unlock
      resolve(id2, 'health', false); // pending_unlock
      const drained = drainForPersona('health');
      expect(drained).toBe(2);
      expect(getItem(id1)!.status).toBe('stored');
      expect(getItem(id2)!.status).toBe('stored');
    });

    it('does not drain items for different persona', () => {
      const { id } = ingest({ source: 'gmail', source_id: 'a' });
      claim(10);
      resolve(id, 'health', false);
      expect(drainForPersona('general')).toBe(0);
    });
  });
});
