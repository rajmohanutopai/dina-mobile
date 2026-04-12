/**
 * T1J.5 — L0 deterministic summary generation (no LLM fallback).
 *
 * Category A: fixture-based. Verifies L0 is generated from metadata
 * alone when LLM is unavailable.
 *
 * Pattern: "{Type} from {sender} on {date}"
 * Caveats appended for low-trust or marketing content.
 *
 * Source: brain/tests/test_enrichment.py
 */

import { generateL0, addTrustCaveat, formatTimestamp } from '../../src/enrichment/l0_deterministic';
import type { L0Input } from '../../src/enrichment/l0_deterministic';

describe('L0 Deterministic Generation', () => {
  describe('generateL0', () => {
    it('generates from full metadata', () => {
      const input: L0Input = {
        type: 'email',
        source: 'gmail',
        sender: 'alice@example.com',
        timestamp: 1700000000, // 2023-11-14
      };
      const l0 = generateL0(input);
      expect(l0).toBe('Email from alice@example.com on 2023-11-14');
    });

    it('uses summary when available (instead of constructing from metadata)', () => {
      const input: L0Input = {
        type: 'email',
        source: 'gmail',
        sender: 'alice@example.com',
        timestamp: 1700000000,
        summary: 'Meeting reminder for Thursday',
      };
      expect(generateL0(input)).toBe('Meeting reminder for Thursday');
    });

    it('handles empty sender gracefully', () => {
      const input: L0Input = {
        type: 'email',
        source: 'gmail',
        sender: '',
        timestamp: 1700000000,
      };
      expect(generateL0(input)).toBe('Email from unknown sender on 2023-11-14');
    });

    it('handles zero timestamp', () => {
      const input: L0Input = {
        type: 'note',
        source: 'personal',
        sender: 'user',
        timestamp: 0,
      };
      expect(generateL0(input)).toBe('Note from user on unknown date');
    });

    it('capitalizes type', () => {
      const input: L0Input = {
        type: 'sms',
        source: 'phone',
        sender: 'Bob',
        timestamp: 1700000000,
      };
      expect(generateL0(input)).toMatch(/^Sms from/);
    });

    it('includes trust caveat for low-trust sender', () => {
      const input: L0Input = {
        type: 'email',
        source: 'gmail',
        sender: 'stranger@unknown.com',
        timestamp: 1700000000,
        sender_trust: 'unknown',
      };
      const l0 = generateL0(input);
      expect(l0).toContain('unverified sender');
    });

    it('includes trust caveat for marketing sender', () => {
      const input: L0Input = {
        type: 'email',
        source: 'gmail',
        sender: 'promo@newsletter.com',
        timestamp: 1700000000,
        sender_trust: 'marketing',
      };
      const l0 = generateL0(input);
      expect(l0).toContain('promotional');
    });

    it('no caveat for high-trust sender (self)', () => {
      const input: L0Input = {
        type: 'note',
        source: 'personal',
        sender: 'user',
        timestamp: 1700000000,
        sender_trust: 'self',
      };
      const l0 = generateL0(input);
      expect(l0).not.toContain('unverified');
      expect(l0).not.toContain('promotional');
    });

    it('no caveat for contact_ring1 trust', () => {
      const input: L0Input = {
        type: 'email',
        source: 'gmail',
        sender: 'alice@example.com',
        timestamp: 1700000000,
        sender_trust: 'contact_ring1',
      };
      const l0 = generateL0(input);
      expect(l0).not.toContain('unverified');
    });

    it('returns empty string for completely empty input', () => {
      const input: L0Input = { type: '', source: '', sender: '', timestamp: 0 };
      expect(generateL0(input)).toBe('');
    });

    it('summary with trust caveat appends caveat to summary', () => {
      const input: L0Input = {
        type: 'email',
        source: 'gmail',
        sender: 'stranger@x.com',
        timestamp: 1700000000,
        summary: 'Special offer inside',
        sender_trust: 'marketing',
      };
      const l0 = generateL0(input);
      expect(l0).toBe('Special offer inside (promotional)');
    });
  });

  describe('addTrustCaveat', () => {
    it('appends caveat for unknown trust', () => {
      expect(addTrustCaveat('Email from stranger', 'unknown'))
        .toBe('Email from stranger (unverified sender)');
    });

    it('appends caveat for marketing trust', () => {
      expect(addTrustCaveat('Newsletter update', 'marketing'))
        .toBe('Newsletter update (promotional)');
    });

    it('appends caveat for spam trust', () => {
      expect(addTrustCaveat('Free money!', 'spam'))
        .toBe('Free money! (likely spam)');
    });

    it('no caveat for self trust', () => {
      expect(addTrustCaveat('My note', 'self')).toBe('My note');
    });

    it('no caveat for contact_ring1', () => {
      expect(addTrustCaveat('Email from Alice', 'contact_ring1'))
        .toBe('Email from Alice');
    });

    it('no caveat for verified', () => {
      expect(addTrustCaveat('Bank statement', 'verified'))
        .toBe('Bank statement');
    });
  });

  describe('formatTimestamp', () => {
    it('formats Unix timestamp to YYYY-MM-DD', () => {
      expect(formatTimestamp(1700000000)).toBe('2023-11-14');
    });

    it('handles zero timestamp', () => {
      expect(formatTimestamp(0)).toBe('unknown date');
    });

    it('handles early date', () => {
      expect(formatTimestamp(946684800)).toBe('2000-01-01');
    });

    it('handles negative timestamp', () => {
      expect(formatTimestamp(-1)).toBe('unknown date');
    });
  });
});
