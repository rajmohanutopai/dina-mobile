/**
 * T1J.3 — Trust scorer: sender identity → trust metadata.
 *
 * Category A: fixture-based. Verifies scoring rules match server for
 * self, contact, service, unknown, marketing senders.
 *
 * Source: brain/tests/test_trust_scorer.py
 */

import { scoreSender, matchSenderToContact, matchByAlias } from '../../src/trust/scorer';

describe('Trust Scorer', () => {
  const contacts = [
    { name: 'Alice', email: 'alice@example.com', aliases: ['Ali'] },
    { name: 'Bob', email: 'bob@work.com' },
  ];

  describe('scoreSender', () => {
    it('user content → self, high, normal', () => {
      const score = scoreSender('user', 'personal', 'chat', contacts);
      expect(score.sender_trust).toBe('self');
      expect(score.confidence).toBe('high');
      expect(score.retrieval_policy).toBe('normal');
    });

    it('CLI source → self', () => {
      const score = scoreSender('user', 'cli', 'cli', contacts);
      expect(score.sender_trust).toBe('self');
    });

    it('telegram source → self', () => {
      const score = scoreSender('user', 'telegram', 'chat', contacts);
      expect(score.sender_trust).toBe('self');
    });

    it('known contact by email → contact_ring1, medium, normal', () => {
      const score = scoreSender('alice@example.com', 'gmail', 'connector', contacts);
      expect(score.sender_trust).toBe('contact_ring1');
      expect(score.confidence).toBe('medium');
      expect(score.retrieval_policy).toBe('normal');
    });

    it('known contact by name → contact_ring1', () => {
      const score = scoreSender('Alice', 'gmail', 'connector', contacts);
      expect(score.sender_trust).toBe('contact_ring1');
    });

    it('known contact by alias → contact_ring1', () => {
      const score = scoreSender('Ali', 'gmail', 'connector', contacts);
      expect(score.sender_trust).toBe('contact_ring1');
    });

    it('unknown sender → unknown, low, caveated', () => {
      const score = scoreSender('stranger@unknown.com', 'gmail', 'connector', contacts);
      expect(score.sender_trust).toBe('unknown');
      expect(score.confidence).toBe('low');
      expect(score.retrieval_policy).toBe('caveated');
    });

    it('marketing sender → marketing, low, briefing_only', () => {
      const score = scoreSender('noreply@promo.com', 'gmail', 'connector', contacts);
      expect(score.sender_trust).toBe('marketing');
      expect(score.confidence).toBe('low');
      expect(score.retrieval_policy).toBe('briefing_only');
    });

    it('empty sender → unknown (caveated)', () => {
      const score = scoreSender('', 'gmail', 'connector', contacts);
      expect(score.sender_trust).toBe('unknown');
      expect(score.retrieval_policy).toBe('caveated');
    });

    it('newsletter sender → marketing', () => {
      const score = scoreSender('newsletter@tech.com', 'gmail', 'connector', contacts);
      expect(score.sender_trust).toBe('marketing');
    });
  });

  describe('matchSenderToContact', () => {
    it('matches by email', () => {
      const result = matchSenderToContact('alice@example.com', contacts);
      expect(result.matched).toBe(true);
      expect(result.contactName).toBe('Alice');
    });

    it('matches by name (case-insensitive)', () => {
      const result = matchSenderToContact('ALICE', contacts);
      expect(result.matched).toBe(true);
      expect(result.contactName).toBe('Alice');
    });

    it('matches by alias', () => {
      const result = matchSenderToContact('Ali', contacts);
      expect(result.matched).toBe(true);
      expect(result.contactName).toBe('Alice');
    });

    it('returns no match for unknown sender', () => {
      const result = matchSenderToContact('stranger@x.com', contacts);
      expect(result.matched).toBe(false);
      expect(result.contactName).toBeUndefined();
    });

    it('empty sender → no match', () => {
      const result = matchSenderToContact('', contacts);
      expect(result.matched).toBe(false);
    });
  });

  describe('matchByAlias', () => {
    it('matches exact alias', () => {
      expect(matchByAlias('Ali', ['Ali', 'Ally'])).toBe(true);
    });

    it('case-insensitive', () => {
      expect(matchByAlias('ali', ['Ali'])).toBe(true);
    });

    it('no match', () => {
      expect(matchByAlias('Charlie', ['Ali'])).toBe(false);
    });

    it('empty alias list', () => {
      expect(matchByAlias('Ali', [])).toBe(false);
    });

    it('empty sender', () => {
      expect(matchByAlias('', ['Ali'])).toBe(false);
    });
  });
});
