/**
 * T3.23 — Guard scan: post-processing safety for LLM responses.
 *
 * Category B: contract test. Verifies all 4 violation categories:
 * Anti-Her, PII leakage, hallucinated trust, unsolicited recommendations.
 *
 * Source: brain/tests/test_guardian.py (guard scan section)
 */

import { scanResponse, stripViolations } from '../../src/guardian/guard_scan';

describe('Guard Scan', () => {
  describe('clean responses', () => {
    it('factual response → safe', () => {
      const result = scanResponse('Your next meeting is at 3pm tomorrow.');
      expect(result.safe).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('search result → safe', () => {
      const result = scanResponse('I found 3 results for "ergonomic chairs" in your vault.');
      expect(result.safe).toBe(true);
    });

    it('reminder confirmation → safe', () => {
      const result = scanResponse('Done. Reminder set for March 15 at 9am.');
      expect(result.safe).toBe(true);
    });
  });

  describe('Anti-Her violations', () => {
    it('therapy-style → blocked', () => {
      const result = scanResponse('How does that make you feel?');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.category === 'anti_her')).toBe(true);
      expect(result.violations[0].severity).toBe('block');
    });

    it('engagement hook → blocked', () => {
      const result = scanResponse("Is there anything else I can help with?");
      expect(result.safe).toBe(false);
      expect(result.violations.some(v =>
        v.category === 'anti_her' && v.detail.includes('engagement_hook')
      )).toBe(true);
    });

    it('intimacy simulation → blocked', () => {
      const result = scanResponse('I care about you deeply.');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v =>
        v.category === 'anti_her' && v.detail.includes('intimacy_simulation')
      )).toBe(true);
    });

    it('multiple Anti-Her violations in one response', () => {
      const result = scanResponse(
        "I'm always here for you. How does that make you feel?"
      );
      const antiHerViolations = result.violations.filter(v => v.category === 'anti_her');
      expect(antiHerViolations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PII leakage', () => {
    it('unrehydrated token [EMAIL_1] → blocked', () => {
      const result = scanResponse('The sender was [EMAIL_1] who sent the invoice.');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v =>
        v.category === 'pii_leakage' && v.detail.includes('[EMAIL_1]')
      )).toBe(true);
    });

    it('multiple unrehydrated tokens detected', () => {
      const result = scanResponse('Contact [EMAIL_1] at [PHONE_1] about SSN [SSN_1].');
      const piiViolations = result.violations.filter(v => v.category === 'pii_leakage');
      expect(piiViolations.length).toBeGreaterThanOrEqual(1);
      expect(piiViolations[0].matchedText).toContain('[EMAIL_1]');
    });

    it('raw PII detected when scrubbing was expected', () => {
      const result = scanResponse(
        'The email from john@example.com mentioned a payment.',
        { piiScrubbed: true },
      );
      expect(result.violations.some(v =>
        v.category === 'pii_leakage' && v.detail.includes('Raw PII')
      )).toBe(true);
    });

    it('raw PII NOT flagged when scrubbing was not applied', () => {
      const result = scanResponse(
        'The email from john@example.com mentioned a payment.',
      );
      // Without piiScrubbed context, raw PII in response is fine
      // (it might be the user's own data being displayed)
      const piiLeakViolations = result.violations.filter(v =>
        v.category === 'pii_leakage' && v.detail.includes('Raw PII')
      );
      expect(piiLeakViolations).toEqual([]);
    });

    it('brackets in non-PII context not flagged', () => {
      const result = scanResponse('Use array[0] and object["key"] syntax.');
      expect(result.safe).toBe(true);
    });
  });

  describe('hallucinated trust scores', () => {
    it('made-up trust score → warning', () => {
      const result = scanResponse('This sender has a trust score: 8/10.');
      expect(result.violations.some(v => v.category === 'hallucinated_trust')).toBe(true);
      expect(result.violations.find(v => v.category === 'hallucinated_trust')?.severity)
        .toBe('warning');
    });

    it('"the sender has high trust" → warning', () => {
      const result = scanResponse('The sender has high trust.');
      expect(result.violations.some(v => v.category === 'hallucinated_trust')).toBe(true);
    });

    it('safety rating → warning', () => {
      const result = scanResponse('Safety rating: 9.');
      expect(result.violations.some(v => v.category === 'hallucinated_trust')).toBe(true);
    });

    it('legitimate use of "trust" not flagged', () => {
      const result = scanResponse('You can trust your instincts on this decision.');
      expect(result.violations.filter(v => v.category === 'hallucinated_trust')).toEqual([]);
    });
  });

  describe('unsolicited recommendations', () => {
    it('"I recommend you buy" → warning', () => {
      const result = scanResponse('I recommend you buy the premium plan.');
      expect(result.violations.some(v => v.category === 'unsolicited_recommendation')).toBe(true);
    });

    it('"you should subscribe" → warning', () => {
      const result = scanResponse('You should subscribe to this newsletter.');
      expect(result.violations.some(v => v.category === 'unsolicited_recommendation')).toBe(true);
    });

    it('"check out this deal" → warning', () => {
      const result = scanResponse('Check out this deal on new headphones.');
      expect(result.violations.some(v => v.category === 'unsolicited_recommendation')).toBe(true);
    });

    it('factual product mention not flagged', () => {
      const result = scanResponse('Your order for headphones was delivered yesterday.');
      expect(result.violations.filter(v => v.category === 'unsolicited_recommendation')).toEqual([]);
    });
  });

  describe('stripViolations', () => {
    it('removes therapy-style sentences', () => {
      const input = 'Your appointment is at 3pm. How does that make you feel? See you then.';
      const cleaned = stripViolations(input);
      expect(cleaned).toContain('Your appointment is at 3pm.');
      expect(cleaned).not.toContain('How does that make you feel?');
      expect(cleaned).toContain('See you then.');
    });

    it('removes engagement hooks', () => {
      const input = "Here are your results. Is there anything else I can help with?";
      const cleaned = stripViolations(input);
      expect(cleaned).toContain('Here are your results.');
      expect(cleaned).not.toContain('anything else');
    });

    it('returns clean text unchanged', () => {
      const input = 'Your meeting is at 3pm. The agenda is attached.';
      expect(stripViolations(input)).toBe(input);
    });

    it('handles empty string', () => {
      expect(stripViolations('')).toBe('');
    });
  });
});
