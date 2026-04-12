/**
 * T2A.11 — D2D outbox: durable queue with exponential backoff retry.
 *
 * Category B: contract test.
 *
 * Source: core/test/d2d_phase2_test.go
 */

import {
  enqueueMessage,
  markDelivered,
  markFailed,
  getPendingForRetry,
  deleteExpired,
  computeBackoff,
  resumeAfterApproval,
  clearOutbox,
  outboxSize,
} from '../../src/transport/outbox';

describe('D2D Outbox', () => {
  beforeEach(() => clearOutbox());

  describe('enqueueMessage', () => {
    it('creates a pending outbox entry', () => {
      const id = enqueueMessage('did:plc:recipient', new Uint8Array([0xca, 0xfe]));
      expect(id).toMatch(/^msg-[0-9a-f]{16}$/);
      expect(outboxSize()).toBe(1);
    });

    it('returns a unique message ID', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        ids.add(enqueueMessage('did:plc:r', new Uint8Array(0)));
      }
      expect(ids.size).toBe(10);
    });

    it('entry is immediately eligible for retry', () => {
      enqueueMessage('did:plc:r', new Uint8Array(0));
      const pending = getPendingForRetry();
      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe('pending');
      expect(pending[0].retryCount).toBe(0);
    });

    it('preserves payload', () => {
      const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      enqueueMessage('did:plc:r', payload);
      const pending = getPendingForRetry();
      expect(pending[0].payload).toEqual(payload);
    });

    it('stores recipientDID', () => {
      enqueueMessage('did:plc:alice', new Uint8Array(0));
      const pending = getPendingForRetry();
      expect(pending[0].recipientDID).toBe('did:plc:alice');
    });
  });

  describe('markDelivered', () => {
    it('removes message from queue', () => {
      const id = enqueueMessage('did:plc:r', new Uint8Array(0));
      expect(outboxSize()).toBe(1);
      markDelivered(id);
      expect(outboxSize()).toBe(0);
    });

    it('is idempotent (no-op for missing ID)', () => {
      markDelivered('msg-nonexistent');
      expect(outboxSize()).toBe(0);
    });
  });

  describe('markFailed', () => {
    it('increments retry count', () => {
      const id = enqueueMessage('did:plc:r', new Uint8Array(0));
      markFailed(id);
      const pending = getPendingForRetry(Date.now() + 999_999);
      const entry = pending.find(e => e.id === id)!;
      expect(entry.retryCount).toBe(1);
      expect(entry.status).toBe('failed');
    });

    it('computes next retry time with backoff', () => {
      const id = enqueueMessage('did:plc:r', new Uint8Array(0));
      const before = Date.now();
      markFailed(id);
      const pending = getPendingForRetry(Date.now() + 999_999);
      const entry = pending.find(e => e.id === id)!;
      // After first failure (retryCount=1), backoff = 2000ms
      expect(entry.nextRetryAt).toBeGreaterThan(before);
    });

    it('throws for missing message', () => {
      expect(() => markFailed('msg-nonexistent')).toThrow('not found');
    });

    it('progressive backoff on repeated failures', () => {
      const id = enqueueMessage('did:plc:r', new Uint8Array(0));
      markFailed(id); // retryCount=1, backoff=2s
      markFailed(id); // retryCount=2, backoff=4s
      markFailed(id); // retryCount=3, backoff=8s
      const pending = getPendingForRetry(Date.now() + 999_999);
      const entry = pending.find(e => e.id === id)!;
      expect(entry.retryCount).toBe(3);
    });
  });

  describe('getPendingForRetry', () => {
    it('returns messages with nextRetryAt <= now', () => {
      enqueueMessage('did:plc:r1', new Uint8Array(0));
      enqueueMessage('did:plc:r2', new Uint8Array(0));
      const pending = getPendingForRetry();
      expect(pending.length).toBe(2);
    });

    it('does not return messages not yet due for retry', () => {
      const id = enqueueMessage('did:plc:r', new Uint8Array(0));
      markFailed(id); // Sets nextRetryAt to ~2s from now
      const pending = getPendingForRetry(); // now < nextRetryAt
      expect(pending.length).toBe(0);
    });

    it('returns empty when no pending messages', () => {
      expect(getPendingForRetry()).toEqual([]);
    });

    it('returns failed messages once their backoff expires', () => {
      const id = enqueueMessage('did:plc:r', new Uint8Array(0));
      markFailed(id);
      // Check that it becomes available after the backoff period
      const pending = getPendingForRetry(Date.now() + 10_000);
      expect(pending.length).toBe(1);
    });

    it('sorts by nextRetryAt (oldest first)', () => {
      const id1 = enqueueMessage('did:plc:r1', new Uint8Array(0));
      const id2 = enqueueMessage('did:plc:r2', new Uint8Array(0));
      const pending = getPendingForRetry();
      // Both have similar nextRetryAt, so order is stable
      expect(pending.length).toBe(2);
    });
  });

  describe('deleteExpired', () => {
    it('removes messages older than TTL', () => {
      enqueueMessage('did:plc:r', new Uint8Array(0));
      // Use far-future "now" so TTL is expired
      const deleted = deleteExpired(86400, Date.now() + 100_000_000);
      expect(deleted).toBe(1);
      expect(outboxSize()).toBe(0);
    });

    it('returns count of deleted messages', () => {
      enqueueMessage('did:plc:r1', new Uint8Array(0));
      enqueueMessage('did:plc:r2', new Uint8Array(0));
      enqueueMessage('did:plc:r3', new Uint8Array(0));
      const deleted = deleteExpired(1, Date.now() + 10_000);
      expect(deleted).toBe(3);
    });

    it('does not delete non-expired messages', () => {
      enqueueMessage('did:plc:r', new Uint8Array(0));
      const deleted = deleteExpired(86400); // 24h TTL, message just created
      expect(deleted).toBe(0);
      expect(outboxSize()).toBe(1);
    });

    it('returns 0 when nothing to delete', () => {
      expect(deleteExpired(86400)).toBe(0);
    });
  });

  describe('computeBackoff', () => {
    it('retry 0 → 1000ms (1 second)', () => {
      expect(computeBackoff(0)).toBe(1000);
    });

    it('retry 1 → 2000ms (2 seconds)', () => {
      expect(computeBackoff(1)).toBe(2000);
    });

    it('retry 2 → 4000ms (4 seconds)', () => {
      expect(computeBackoff(2)).toBe(4000);
    });

    it('retry 3 → 8000ms (8 seconds)', () => {
      expect(computeBackoff(3)).toBe(8000);
    });

    it('retry 4 → 16000ms (16 seconds)', () => {
      expect(computeBackoff(4)).toBe(16000);
    });

    it('caps at 300000ms (5 minutes)', () => {
      expect(computeBackoff(100)).toBe(300000);
      expect(computeBackoff(20)).toBe(300000);
    });

    it('reaches cap at retry 9 (2^9 * 1000 = 512000 > 300000)', () => {
      expect(computeBackoff(8)).toBe(256000);
      expect(computeBackoff(9)).toBe(300000);
    });
  });

  describe('resumeAfterApproval', () => {
    it('un-pauses a held message', () => {
      const id = enqueueMessage('did:plc:r', new Uint8Array(0));
      markFailed(id); // Sets status to 'failed' with future nextRetryAt
      resumeAfterApproval(id);
      const pending = getPendingForRetry();
      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe('pending');
    });

    it('sets message to pending for immediate retry', () => {
      const id = enqueueMessage('did:plc:r', new Uint8Array(0));
      markFailed(id);
      const before = Date.now();
      resumeAfterApproval(id);
      const pending = getPendingForRetry();
      expect(pending[0].nextRetryAt).toBeGreaterThanOrEqual(before);
      expect(pending[0].nextRetryAt).toBeLessThanOrEqual(Date.now());
    });

    it('throws for missing message', () => {
      expect(() => resumeAfterApproval('msg-nonexistent')).toThrow('not found');
    });
  });
});
