/**
 * T1B.3 — Nonce replay cache.
 *
 * Category A: fixture-based. Verifies double-buffer nonce tracking
 * rejects duplicates within the window.
 *
 * Source: core/test/signature_test.go (nonce replay)
 */

import { NonceCache } from '../../src/auth/nonce';
import { hasFixture, loadVectors } from '@dina/test-harness';

describe('Nonce Replay Cache', () => {
  it('constructs without error', () => {
    expect(() => new NonceCache()).not.toThrow();
  });

  describe('check', () => {
    it('accepts a fresh nonce', () => {
      const cache = new NonceCache();
      expect(cache.check('abc123')).toBe(true);
    });

    it('rejects a duplicate nonce', () => {
      const cache = new NonceCache();
      expect(cache.check('abc123')).toBe(true);
      expect(cache.check('abc123')).toBe(false);
    });

    it('accepts different nonces', () => {
      const cache = new NonceCache();
      expect(cache.check('nonce1')).toBe(true);
      expect(cache.check('nonce2')).toBe(true);
      expect(cache.check('nonce3')).toBe(true);
    });

    it('rejects empty nonce', () => {
      const cache = new NonceCache();
      expect(cache.check('')).toBe(false);
    });
  });

  describe('rotate', () => {
    it('nonce survives one rotation (in previous buffer)', () => {
      const cache = new NonceCache();
      cache.check('old-nonce');
      cache.rotate();
      // "old-nonce" is now in previous buffer — still rejected
      expect(cache.check('old-nonce')).toBe(false);
    });

    it('nonce accepted after two rotations (evicted)', () => {
      const cache = new NonceCache();
      cache.check('old-nonce');
      cache.rotate(); // old-nonce moves to previous
      cache.rotate(); // previous discarded → old-nonce gone
      expect(cache.check('old-nonce')).toBe(true);
    });

    it('fresh nonces accepted after rotation', () => {
      const cache = new NonceCache();
      cache.check('a');
      cache.rotate();
      expect(cache.check('b')).toBe(true);
    });

    it('multiple rotations work correctly', () => {
      const cache = new NonceCache();
      cache.check('round1');
      cache.rotate();
      cache.check('round2');
      cache.rotate();
      // round1 evicted (2 rotations), round2 in previous
      expect(cache.check('round1')).toBe(true);  // fresh again
      expect(cache.check('round2')).toBe(false); // still in previous
    });
  });

  describe('size', () => {
    it('starts at 0', () => {
      expect(new NonceCache().size()).toBe(0);
    });

    it('increases with each new nonce', () => {
      const cache = new NonceCache();
      cache.check('a');
      cache.check('b');
      expect(cache.size()).toBe(2);
    });

    it('counts both buffers', () => {
      const cache = new NonceCache();
      cache.check('a');
      cache.check('b');
      cache.rotate();
      cache.check('c');
      // previous: {a, b}, current: {c}
      expect(cache.size()).toBe(3);
    });

    it('decreases after rotation evicts old buffer', () => {
      const cache = new NonceCache();
      cache.check('a');
      cache.check('b');
      cache.rotate();
      cache.check('c');
      cache.rotate();
      // previous: {c}, current: empty. {a,b} evicted.
      expect(cache.size()).toBe(1);
    });

    it('duplicate nonce does not increase size', () => {
      const cache = new NonceCache();
      cache.check('same');
      cache.check('same'); // rejected, no insert
      expect(cache.size()).toBe(1);
    });
  });

  // ------------------------------------------------------------------
  // Cross-language verification against Go fixtures
  // ------------------------------------------------------------------

  const fixture = 'auth/nonce_replay.json';
  const suite = hasFixture(fixture) ? describe : describe.skip;
  suite('cross-language: nonce replay (Go fixtures)', () => {
    const vectors = loadVectors<
      { nonce: string; seen_before: string },
      { accepted: boolean }
    >(fixture);

    it('fresh → accepted, replay → rejected, different → accepted', () => {
      const cache = new NonceCache();

      for (const v of vectors) {
        if (v.inputs.seen_before === 'true') {
          // Simulate "seen before" by checking the same nonce first
          cache.check(v.inputs.nonce);
        }
        const result = cache.check(v.inputs.nonce);
        expect(result).toBe(v.expected.accepted);
      }
    });
  });
});
