/**
 * T1F.4 — Sharing tier enforcement: per-contact data category access.
 *
 * Source: core/test/gatekeeper_test.go (sharing tiers section)
 */

import {
  checkSharingPolicy,
  getSharingTier,
  filterByTier,
  setSharingPolicy,
  clearSharingPolicies,
} from '../../src/gatekeeper/sharing';
import type { SharingTier } from '../../src/gatekeeper/sharing';
import { PHASE1_RECOGNIZED_CATEGORIES } from '@dina/test-harness';

describe('Sharing Tier Enforcement', () => {
  const friendDID = 'did:plc:closeFriend';
  const collegeDID = 'did:plc:workColleague';

  beforeEach(() => {
    clearSharingPolicies();
    setSharingPolicy(friendDID, 'presence', 'full');
    setSharingPolicy(friendDID, 'availability', 'full');
    setSharingPolicy(friendDID, 'context', 'summary');
    setSharingPolicy(friendDID, 'preferences', 'full');
    setSharingPolicy(friendDID, 'location', 'none');
    setSharingPolicy(friendDID, 'health', 'none');
    setSharingPolicy(collegeDID, 'presence', 'summary');
    setSharingPolicy(collegeDID, 'health', 'none');
    setSharingPolicy(collegeDID, 'location', 'none');
  });

  describe('getSharingTier', () => {
    it('returns tier for known contact + category', () => {
      expect(getSharingTier(friendDID, 'presence')).toBe('full');
    });

    it('returns "none" for unknown contact (default-deny)', () => {
      expect(getSharingTier('did:plc:stranger', 'health')).toBe('none');
    });

    it('returns "none" for unknown category', () => {
      expect(getSharingTier(friendDID, 'invented_category')).toBe('none');
    });

    for (const category of PHASE1_RECOGNIZED_CATEGORIES) {
      it(`recognizes category: "${category}"`, () => {
        // Either has an explicit policy or defaults to 'none'
        const tier = getSharingTier(friendDID, category);
        expect(['none', 'summary', 'full', 'locked']).toContain(tier);
      });
    }
  });

  describe('checkSharingPolicy', () => {
    it('allows when all categories are permitted', () => {
      const result = checkSharingPolicy(friendDID, ['presence']);
      expect(result.allowed).toBe(true);
    });

    it('denies when ANY category is restricted', () => {
      const result = checkSharingPolicy(friendDID, ['presence', 'health']);
      expect(result.allowed).toBe(false);
      expect(result.filteredCategories).toContain('health');
    });

    it('allows empty category list', () => {
      const result = checkSharingPolicy(friendDID, []);
      expect(result.allowed).toBe(true);
    });

    it('denies all categories for unknown contact', () => {
      const result = checkSharingPolicy('did:plc:stranger', ['presence']);
      expect(result.allowed).toBe(false);
    });

    it('returns filtered category list in decision', () => {
      const result = checkSharingPolicy(collegeDID, ['presence', 'health', 'location']);
      expect(result.filteredCategories).toContain('health');
      expect(result.filteredCategories).toContain('location');
    });
  });

  describe('filterByTier', () => {
    const fullData = { summary: 'Test', body: 'Full body text', content_l0: 'L0', content_l1: 'L1' };

    it('full → keeps everything', () => {
      const result = filterByTier(fullData, 'full');
      expect(result).not.toBeNull();
      expect(result!.body).toBe('Full body text');
      expect(result!.summary).toBe('Test');
    });

    it('summary → keeps L0/L1, removes body', () => {
      const result = filterByTier(fullData, 'summary');
      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Test');
      expect(result!.content_l0).toBe('L0');
      expect(result).not.toHaveProperty('body');
    });

    it('none → removes entirely (returns null)', () => {
      expect(filterByTier(fullData, 'none')).toBeNull();
    });

    it('locked → removes entirely (returns null)', () => {
      expect(filterByTier(fullData, 'locked')).toBeNull();
    });
  });
});
