/**
 * T2.38 — Vault hybrid search: 0.4 × FTS5 + 0.6 × cosine similarity.
 *
 * Source: ARCHITECTURE.md Task 2.38
 */

import { queryVault, storeItem, clearVaults, cosineSimilarity } from '../../src/vault/crud';
import type { SearchQuery } from '@dina/test-harness';

/** Create a normalized 4-dim embedding for testing. */
function embed(...values: number[]): Uint8Array {
  const f32 = new Float32Array(values);
  return new Uint8Array(f32.buffer);
}

/** Create a query embedding as Float32Array. */
function queryEmbed(...values: number[]): Float32Array {
  return new Float32Array(values);
}

describe('Vault Hybrid Search (2.38)', () => {
  beforeEach(() => clearVaults());

  describe('mode=fts5 (keyword search)', () => {
    it('returns keyword matches', () => {
      storeItem('general', { summary: 'Meeting with Alice about budget', type: 'note' });
      storeItem('general', { summary: 'Grocery list for weekend', type: 'note' });

      const results = queryVault('general', { mode: 'fts5', text: 'budget', limit: 10 });
      expect(results).toHaveLength(1);
      expect(results[0].summary).toContain('budget');
    });

    it('returns empty for no matches', () => {
      storeItem('general', { summary: 'Hello world', type: 'note' });
      const results = queryVault('general', { mode: 'fts5', text: 'nonexistent', limit: 10 });
      expect(results).toHaveLength(0);
    });
  });

  describe('mode=semantic (cosine similarity)', () => {
    it('returns items with similar embeddings, ranked by similarity', () => {
      storeItem('general', {
        summary: 'Health checkup results', type: 'note',
        embedding: embed(0.9, 0.1, 0.0, 0.0),
      });
      storeItem('general', {
        summary: 'Budget report Q4', type: 'note',
        embedding: embed(0.1, 0.8, 0.0, 0.1),  // partially similar to query
      });

      const results = queryVault('general', {
        mode: 'semantic',
        text: '',
        embedding: queryEmbed(0.8, 0.2, 0.0, 0.0),
        limit: 10,
      });

      expect(results).toHaveLength(2);
      // Health checkup should rank first (most similar embedding)
      expect(results[0].summary).toContain('Health');
    });

    it('returns empty when no query embedding provided', () => {
      storeItem('general', {
        summary: 'Test', type: 'note', embedding: embed(1, 0, 0, 0),
      });

      const results = queryVault('general', {
        mode: 'semantic', text: '', limit: 10,
      });
      expect(results).toHaveLength(0);
    });

    it('excludes items without embeddings', () => {
      storeItem('general', { summary: 'No embedding', type: 'note' });
      storeItem('general', {
        summary: 'Has embedding', type: 'note', embedding: embed(1, 0, 0, 0),
      });

      const results = queryVault('general', {
        mode: 'semantic', text: '', embedding: queryEmbed(1, 0, 0, 0), limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe('Has embedding');
    });
  });

  describe('mode=hybrid (0.4 FTS + 0.6 cosine)', () => {
    it('combines keyword and semantic scores', () => {
      // Item A: strong keyword match, weak semantic
      storeItem('general', {
        summary: 'Budget report for Q4 financial review', type: 'note',
        embedding: embed(0.1, 0.1, 0.1, 0.9),
      });
      // Item B: weak keyword match, strong semantic
      storeItem('general', {
        summary: 'Financial overview', type: 'note',
        embedding: embed(0.9, 0.1, 0.0, 0.0),
      });

      const results = queryVault('general', {
        mode: 'hybrid',
        text: 'financial',
        embedding: queryEmbed(0.8, 0.2, 0.0, 0.0),
        limit: 10,
      });

      expect(results).toHaveLength(2);
      // Both matched on FTS ("financial"), but Item B has much stronger semantic score
      // 0.6 weight on semantic means B should rank higher
      expect(results[0].summary).toContain('overview');
    });

    it('includes FTS-only matches (no embedding)', () => {
      storeItem('general', { summary: 'Budget meeting notes', type: 'note' });
      storeItem('general', {
        summary: 'Revenue forecast', type: 'note',
        embedding: embed(0.9, 0.1, 0.0, 0.0),
      });

      const results = queryVault('general', {
        mode: 'hybrid',
        text: 'budget',
        embedding: queryEmbed(0.8, 0.2, 0.0, 0.0),
        limit: 10,
      });

      // Budget notes matches on FTS but has no embedding
      // Revenue matches on semantic only
      expect(results.length).toBeGreaterThanOrEqual(1);
      const summaries = results.map(r => r.summary);
      expect(summaries).toContain('Budget meeting notes');
    });

    it('includes semantic-only matches (no keyword match)', () => {
      storeItem('general', {
        summary: 'Lab results from hospital', type: 'note',
        embedding: embed(0.9, 0.1, 0.0, 0.0),
      });

      const results = queryVault('general', {
        mode: 'hybrid',
        text: 'nonexistent',
        embedding: queryEmbed(0.8, 0.2, 0.0, 0.0),
        limit: 10,
      });

      // No keyword match, but embedding is very similar
      expect(results).toHaveLength(1);
      expect(results[0].summary).toContain('Lab results');
    });

    it('returns empty when no text AND no embedding', () => {
      storeItem('general', { summary: 'Something', type: 'note' });
      const results = queryVault('general', {
        mode: 'hybrid', text: '', limit: 10,
      });
      expect(results).toHaveLength(0);
    });

    it('excludes deleted items', () => {
      const id = storeItem('general', {
        summary: 'Delete me', type: 'note',
        embedding: embed(1, 0, 0, 0),
      });
      const { deleteItem } = require('../../src/vault/crud');
      deleteItem('general', id);

      const results = queryVault('general', {
        mode: 'hybrid',
        text: 'delete',
        embedding: queryEmbed(1, 0, 0, 0),
        limit: 10,
      });
      expect(results).toHaveLength(0);
    });

    it('respects limit', () => {
      for (let i = 0; i < 10; i++) {
        storeItem('general', {
          summary: `Item ${i} matching keyword`, type: 'note',
          embedding: embed(0.5, 0.5, 0, 0),
        });
      }

      const results = queryVault('general', {
        mode: 'hybrid',
        text: 'matching',
        embedding: queryEmbed(0.5, 0.5, 0, 0),
        limit: 3,
      });
      expect(results).toHaveLength(3);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it('returns -1 for opposite vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([-1, 0, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });

    it('handles Uint8Array (raw Float32 bytes)', () => {
      const f32 = new Float32Array([0.6, 0.8, 0.0]);
      const bytes = new Uint8Array(f32.buffer);
      expect(cosineSimilarity(f32, bytes)).toBeCloseTo(1.0);
    });

    it('returns 0 for zero vectors', () => {
      const a = new Float32Array([0, 0, 0]);
      const b = new Float32Array([1, 0, 0]);
      expect(cosineSimilarity(a, b)).toBe(0);
    });
  });
});
