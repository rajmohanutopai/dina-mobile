/**
 * T2B.4 — Guardian loop: silence classification across all priority tiers.
 *
 * Category B: contract test. Verifies classification rules for
 * fiduciary, solicited, engagement events.
 *
 * Source: brain/tests/test_guardian.py
 */

import {
  classifyPriority,
  classifyDeterministic,
  matchesFiduciaryKeywords,
  isFiduciarySource,
  isSolicitedType,
  isEngagementType,
} from '../../src/guardian/silence';
import {
  makeFiduciaryEvent,
  makeSolicitedEvent,
  makeEngagementEvent,
  makeEvent,
} from '@dina/test-harness';

describe('Guardian Silence Classification', () => {
  describe('classifyPriority (async, falls back to deterministic)', () => {
    it('fiduciary event → Tier 1', async () => {
      const result = await classifyPriority(makeFiduciaryEvent());
      expect(result.tier).toBe(1);
    });

    it('solicited event → Tier 2', async () => {
      const result = await classifyPriority(makeSolicitedEvent());
      expect(result.tier).toBe(2);
    });

    it('engagement event → Tier 3', async () => {
      const result = await classifyPriority(makeEngagementEvent());
      expect(result.tier).toBe(3);
    });

    it('ambiguous event → Tier 3 (Silence First default)', async () => {
      const result = await classifyPriority(makeEvent({ source: 'unknown', subject: 'Hello' }));
      expect(result.tier).toBe(3);
    });

    it('security alert → Tier 1', async () => {
      const result = await classifyPriority(makeEvent({ subject: 'Security Alert: Unusual login' }));
      expect(result.tier).toBe(1);
    });

    it('lab results → Tier 1 (health fiduciary)', async () => {
      const result = await classifyPriority(makeEvent({ subject: 'Your lab results are ready' }));
      expect(result.tier).toBe(1);
    });

    it('promo email → Tier 3', async () => {
      const result = await classifyPriority(makeEvent({ type: 'promo', source: 'social' }));
      expect(result.tier).toBe(3);
    });

    it('reminder → Tier 2', async () => {
      const result = await classifyPriority(makeEvent({ type: 'reminder' }));
      expect(result.tier).toBe(2);
    });
  });

  describe('classifyDeterministic (regex fallback, no LLM)', () => {
    it('bank source → Tier 1', () => {
      const result = classifyDeterministic(makeEvent({ source: 'bank' }));
      expect(result.tier).toBe(1);
    });

    it('health_system source → Tier 1', () => {
      const result = classifyDeterministic(makeEvent({ source: 'health_system' }));
      expect(result.tier).toBe(1);
    });

    it('emergency source → Tier 1', () => {
      const result = classifyDeterministic(makeEvent({ source: 'emergency' }));
      expect(result.tier).toBe(1);
    });

    it('"cancel" keyword → Tier 1', () => {
      const result = classifyDeterministic(makeEvent({ subject: 'Order cancelled' }));
      expect(result.tier).toBe(1);
    });

    it('search_result type → Tier 2', () => {
      const result = classifyDeterministic(makeEvent({ type: 'search_result' }));
      expect(result.tier).toBe(2);
    });

    it('notification type → Tier 3', () => {
      const result = classifyDeterministic(makeEvent({ type: 'notification' }));
      expect(result.tier).toBe(3);
    });

    it('podcast type → Tier 3', () => {
      const result = classifyDeterministic(makeEvent({ type: 'podcast' }));
      expect(result.tier).toBe(3);
    });

    it('returns method: "deterministic"', () => {
      const result = classifyDeterministic(makeEvent());
      expect(result.method).toBe('deterministic');
    });

    it('includes a reason string', () => {
      const result = classifyDeterministic(makeEvent({ source: 'bank' }));
      expect(result.reason).toContain('bank');
    });

    it('includes confidence score', () => {
      const result = classifyDeterministic(makeEvent({ source: 'bank' }));
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('fiduciary source takes priority over engagement type', () => {
      const result = classifyDeterministic(makeEvent({ source: 'bank', type: 'notification' }));
      expect(result.tier).toBe(1); // source wins
    });
  });

  describe('matchesFiduciaryKeywords', () => {
    const keywords = ['cancel', 'security alert', 'breach', 'unusual login',
      'overdrawn', 'lab result', 'diagnosis', 'emergency'];

    for (const keyword of keywords) {
      it(`matches "${keyword}"`, () => {
        expect(matchesFiduciaryKeywords(`Something about ${keyword} happened`)).toBe(true);
      });
    }

    it('is case-insensitive', () => {
      expect(matchesFiduciaryKeywords('SECURITY ALERT detected')).toBe(true);
    });

    it('does not match regular text', () => {
      expect(matchesFiduciaryKeywords('Nice weather today')).toBe(false);
    });
  });

  describe('isFiduciarySource', () => {
    for (const source of ['security', 'health_system', 'bank', 'emergency']) {
      it(`"${source}" is fiduciary`, () => {
        expect(isFiduciarySource(source)).toBe(true);
      });
    }

    it('"gmail" is NOT fiduciary', () => {
      expect(isFiduciarySource('gmail')).toBe(false);
    });

    it('"social" is NOT fiduciary', () => {
      expect(isFiduciarySource('social')).toBe(false);
    });
  });

  describe('isSolicitedType', () => {
    it('"reminder" is solicited', () => {
      expect(isSolicitedType('reminder')).toBe(true);
    });

    it('"search_result" is solicited', () => {
      expect(isSolicitedType('search_result')).toBe(true);
    });

    it('"email" is NOT solicited', () => {
      expect(isSolicitedType('email')).toBe(false);
    });
  });

  describe('isEngagementType', () => {
    for (const type of ['notification', 'promo', 'social', 'rss', 'podcast']) {
      it(`"${type}" is engagement`, () => {
        expect(isEngagementType(type)).toBe(true);
      });
    }

    it('"email" is NOT engagement', () => {
      expect(isEngagementType('email')).toBe(false);
    });

    it('"reminder" is NOT engagement', () => {
      expect(isEngagementType('reminder')).toBe(false);
    });
  });
});
