/**
 * T2.49 — KV service: GET/PUT key-value store.
 *
 * Source: ARCHITECTURE.md Task 2.49
 */

import {
  kvGet, kvSet, kvDelete, kvHas, kvList, kvCount, resetKVStore,
} from '../../src/kv/store';

describe('KV Store', () => {
  beforeEach(() => resetKVStore());

  describe('kvSet + kvGet', () => {
    it('stores and retrieves a value', () => {
      kvSet('theme', 'dark');
      expect(kvGet('theme')).toBe('dark');
    });

    it('overwrites existing value', () => {
      kvSet('theme', 'dark');
      kvSet('theme', 'light');
      expect(kvGet('theme')).toBe('light');
    });

    it('returns null for missing key', () => {
      expect(kvGet('nonexistent')).toBeNull();
    });
  });

  describe('kvDelete', () => {
    it('deletes an existing key', () => {
      kvSet('key', 'value');
      expect(kvDelete('key')).toBe(true);
      expect(kvGet('key')).toBeNull();
    });

    it('returns false for missing key', () => {
      expect(kvDelete('missing')).toBe(false);
    });
  });

  describe('kvHas', () => {
    it('returns true for existing key', () => {
      kvSet('exists', 'yes');
      expect(kvHas('exists')).toBe(true);
    });

    it('returns false for missing key', () => {
      expect(kvHas('nope')).toBe(false);
    });
  });

  describe('namespace support', () => {
    it('isolates keys by namespace', () => {
      kvSet('theme', 'dark', 'general');
      kvSet('theme', 'light', 'health');
      expect(kvGet('theme', 'general')).toBe('dark');
      expect(kvGet('theme', 'health')).toBe('light');
    });

    it('namespaced key is not found without namespace', () => {
      kvSet('key', 'value', 'ns');
      expect(kvGet('key')).toBeNull();
    });

    it('delete is namespace-scoped', () => {
      kvSet('key', 'a', 'ns1');
      kvSet('key', 'b', 'ns2');
      kvDelete('key', 'ns1');
      expect(kvGet('key', 'ns1')).toBeNull();
      expect(kvGet('key', 'ns2')).toBe('b');
    });

    it('kvHas respects namespace', () => {
      kvSet('x', 'y', 'ns');
      expect(kvHas('x', 'ns')).toBe(true);
      expect(kvHas('x')).toBe(false);
    });
  });

  describe('kvList', () => {
    it('lists all entries', () => {
      kvSet('a', '1');
      kvSet('b', '2');
      kvSet('c', '3');
      expect(kvList()).toHaveLength(3);
    });

    it('filters by namespace', () => {
      kvSet('x', '1', 'ns1');
      kvSet('y', '2', 'ns1');
      kvSet('z', '3', 'ns2');
      expect(kvList('ns1')).toHaveLength(2);
      expect(kvList('ns2')).toHaveLength(1);
    });

    it('sorted by key', () => {
      kvSet('c', '3');
      kvSet('a', '1');
      kvSet('b', '2');
      const keys = kvList().map(e => e.key);
      expect(keys).toEqual(['a', 'b', 'c']);
    });

    it('returns empty when nothing stored', () => {
      expect(kvList()).toEqual([]);
    });
  });

  describe('kvCount', () => {
    it('counts total entries', () => {
      kvSet('a', '1');
      kvSet('b', '2');
      expect(kvCount()).toBe(2);
    });

    it('counts entries in namespace', () => {
      kvSet('a', '1', 'ns1');
      kvSet('b', '2', 'ns1');
      kvSet('c', '3', 'ns2');
      expect(kvCount('ns1')).toBe(2);
      expect(kvCount('ns2')).toBe(1);
    });

    it('returns 0 when empty', () => {
      expect(kvCount()).toBe(0);
    });
  });

  describe('updatedAt tracking', () => {
    it('tracks update timestamp', () => {
      const before = Date.now();
      kvSet('key', 'value');
      const entries = kvList();
      expect(entries[0].updatedAt).toBeGreaterThanOrEqual(before);
    });
  });
});
