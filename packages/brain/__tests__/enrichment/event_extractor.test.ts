/**
 * T1J.8 — Temporal event extraction from vault items.
 *
 * Category A: fixture-based. Verifies date detection creates correct
 * reminder payloads for invoices, appointments, birthdays, deadlines.
 *
 * Source: brain/tests/test_event_extractor.py
 */

import { extractEvents, isValidReminderPayload, extractBirthdayDate } from '../../src/enrichment/event_extractor';
import type { ExtractionInput } from '../../src/enrichment/event_extractor';

describe('Event Extractor', () => {
  describe('extractEvents', () => {
    it('extracts payment due date from invoice', () => {
      const input: ExtractionInput = {
        item_id: 'item-001', type: 'email', timestamp: 1700000000,
        summary: 'Invoice #1234 due March 15, 2026',
        body: 'Your invoice of $500 is due by March 15, 2026.',
      };
      const events = extractEvents(input);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].kind).toBe('payment_due');
      expect(events[0].fire_at).toContain('2026-03-15');
      expect(events[0].source_item_id).toBe('item-001');
    });

    it('extracts appointment from calendar-like text', () => {
      const input: ExtractionInput = {
        item_id: 'item-002', type: 'event', timestamp: 1700000000,
        summary: 'Dentist appointment March 20, 2026 at 2pm',
        body: 'Appointment with Dr. Smith on March 20, 2026 at 2:00 PM.',
      };
      const events = extractEvents(input);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].kind).toBe('appointment');
      expect(events[0].fire_at).toContain('2026-03-20');
    });

    it('extracts birthday with date', () => {
      const input: ExtractionInput = {
        item_id: 'item-003', type: 'note', timestamp: 1700000000,
        summary: "Emma's birthday is March 15",
        body: "Remember: Emma's birthday is on March 15.",
      };
      const events = extractEvents(input);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].kind).toBe('birthday');
      expect(events[0].fire_at).toContain('03-15');
    });

    it('returns empty when no dates found', () => {
      const input: ExtractionInput = {
        item_id: 'item-004', type: 'email', timestamp: 1700000000,
        summary: 'Weekly status update',
        body: 'Everything is on track. No action items.',
      };
      const events = extractEvents(input);
      expect(events).toEqual([]);
    });

    it('skips birthday without parseable date', () => {
      const input: ExtractionInput = {
        item_id: 'item-005', type: 'note', timestamp: 1700000000,
        summary: "Emma's birthday is coming up",
        body: "Don't forget Emma's birthday!",
      };
      const events = extractEvents(input);
      expect(events).toEqual([]);
    });

    it('includes source_item_id for lineage tracking', () => {
      const input: ExtractionInput = {
        item_id: 'item-006', type: 'email', timestamp: 1700000000,
        summary: 'Meeting tomorrow at March 22',
        body: 'See you at March 22.',
      };
      const events = extractEvents(input);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].source_item_id).toBe('item-006');
    });

    it('extracts deadline', () => {
      const input: ExtractionInput = {
        item_id: 'item-007', type: 'email', timestamp: 1700000000,
        summary: 'Project deadline April 1, 2026',
        body: 'The final deadline is April 1, 2026.',
      };
      const events = extractEvents(input);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].kind).toBe('deadline');
      expect(events[0].fire_at).toContain('2026-04-01');
    });

    it('uses current year when year not specified', () => {
      const input: ExtractionInput = {
        item_id: 'item-008', type: 'note', timestamp: 1700000000, // Nov 2023
        summary: 'Meeting on June 5',
        body: '',
      };
      const events = extractEvents(input);
      expect(events.length).toBeGreaterThanOrEqual(1);
      // contextTimestamp is 2023, so year should be 2023
      expect(events[0].fire_at).toContain('2023-06-05');
    });
  });

  describe('isValidReminderPayload', () => {
    it('validates a complete reminder payload', () => {
      expect(isValidReminderPayload({
        fire_at: '2026-03-15T09:00:00Z',
        message: "Emma's birthday tomorrow",
        kind: 'birthday',
        source_item_id: 'item-003',
      })).toBe(true);
    });

    it('rejects payload with empty fire_at', () => {
      expect(isValidReminderPayload({
        fire_at: '', message: 'test', kind: 'custom', source_item_id: 'x',
      })).toBe(false);
    });

    it('rejects payload with invalid ISO date', () => {
      expect(isValidReminderPayload({
        fire_at: 'not-a-date', message: 'test', kind: 'custom', source_item_id: 'x',
      })).toBe(false);
    });

    it('rejects payload with empty message', () => {
      expect(isValidReminderPayload({
        fire_at: '2026-03-15T09:00:00Z', message: '', kind: 'custom', source_item_id: 'x',
      })).toBe(false);
    });

    it('rejects payload with empty source_item_id', () => {
      expect(isValidReminderPayload({
        fire_at: '2026-03-15T09:00:00Z', message: 'test', kind: 'custom', source_item_id: '',
      })).toBe(false);
    });
  });

  describe('extractBirthdayDate', () => {
    it('extracts "March 15" from birthday text', () => {
      const result = extractBirthdayDate("Emma's birthday is March 15");
      expect(result).not.toBeNull();
      expect(result).toContain('03-15');
    });

    it('extracts "March 15, 2026" with year', () => {
      const result = extractBirthdayDate("Alice's birthday is March 15, 2026");
      expect(result).toBe('2026-03-15');
    });

    it('returns null when no date found', () => {
      expect(extractBirthdayDate("Emma's birthday soon")).toBeNull();
    });

    it('returns null when no birthday keyword', () => {
      expect(extractBirthdayDate("Meeting on March 15")).toBeNull();
    });

    it('handles abbreviated month', () => {
      const result = extractBirthdayDate("Birthday is Dec 25");
      expect(result).not.toBeNull();
      expect(result).toContain('12-25');
    });
  });
});
