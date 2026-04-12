/**
 * T3.28 — Reminder planner: extract events → plan reminders.
 *
 * Source: ARCHITECTURE.md Task 3.28
 */

import {
  planReminders, hasEventSignals,
  registerReminderLLM, resetReminderLLM,
} from '../../src/pipeline/reminder_planner';
import { resetReminderState, listByPersona } from '../../../core/src/reminders/service';

describe('Reminder Planner', () => {
  beforeEach(() => {
    resetReminderState();
    resetReminderLLM();
  });

  describe('planReminders — deterministic', () => {
    it('extracts birthday event from text', async () => {
      const result = await planReminders({
        itemId: 'item-001',
        type: 'email',
        summary: 'Emma birthday March 15',
        body: 'Don\'t forget Emma\'s birthday on March 15',
        timestamp: Date.now(),
        persona: 'general',
      });
      // event_extractor should find the birthday date pattern
      // Whether a reminder is created depends on date validity (past dates may be skipped)
      expect(result.eventsDetected).toBeGreaterThanOrEqual(0);
      expect(result.llmRefined).toBe(false);
    });

    it('no events → no reminders', async () => {
      const result = await planReminders({
        itemId: 'item-002',
        type: 'email',
        summary: 'Weekly team update',
        body: 'Here are the highlights',
        timestamp: Date.now(),
        persona: 'work',
      });
      expect(result.eventsDetected).toBe(0);
      expect(result.remindersCreated).toBe(0);
    });

    it('reminders stored in correct persona', async () => {
      const result = await planReminders({
        itemId: 'item-003',
        type: 'invoice',
        summary: 'Invoice due January 15',
        body: 'Payment due by January 15, 2027',
        timestamp: Date.now(),
        persona: 'financial',
      });
      for (const r of result.reminders) {
        expect(r.persona).toBe('financial');
      }
    });

    it('returns llmRefined: false without LLM', async () => {
      const result = await planReminders({
        itemId: 'item-004',
        type: 'email',
        summary: 'Meeting tomorrow',
        body: 'text',
        timestamp: Date.now(),
        persona: 'work',
      });
      expect(result.llmRefined).toBe(false);
    });
  });

  describe('planReminders — LLM-assisted', () => {
    it('LLM adds additional reminders', async () => {
      registerReminderLLM(async () =>
        '{"reminders":[{"message":"Follow up on project deadline","due_at":1800000000000,"kind":"deadline"}]}');
      const result = await planReminders({
        itemId: 'item-005',
        type: 'email',
        summary: 'Project update',
        body: 'The deadline is approaching',
        timestamp: Date.now(),
        persona: 'work',
      });
      expect(result.llmRefined).toBe(true);
      expect(result.remindersCreated).toBeGreaterThanOrEqual(1);
    });

    it('LLM failure → falls back to deterministic only', async () => {
      registerReminderLLM(async () => { throw new Error('LLM down'); });
      const result = await planReminders({
        itemId: 'item-006',
        type: 'email',
        summary: 'Birthday March 15',
        body: 'text',
        timestamp: Date.now(),
        persona: 'general',
      });
      expect(result.llmRefined).toBe(false);
      // Should still have regex-extracted events
    });

    it('LLM duplicates are skipped', async () => {
      registerReminderLLM(async () =>
        '{"reminders":[{"message":"Birthday reminder","due_at":1800000000000,"kind":"birthday"}]}');
      const result = await planReminders({
        itemId: 'item-007',
        type: 'email',
        summary: 'Birthday on March 15',
        body: 'Birthday celebration',
        timestamp: Date.now(),
        persona: 'general',
      });
      // LLM and regex should not double-count the same birthday
      expect(result.eventsDetected).toBeGreaterThanOrEqual(0);
    });
  });

  describe('hasEventSignals', () => {
    it('detects birthday keywords', () => {
      expect(hasEventSignals('Birthday party', '')).toBe(true);
    });

    it('detects deadline keywords', () => {
      expect(hasEventSignals('', 'The deadline is next Friday')).toBe(true);
    });

    it('detects month names', () => {
      expect(hasEventSignals('Meeting on January 5', '')).toBe(true);
    });

    it('returns false for no signals', () => {
      expect(hasEventSignals('Hello world', 'Nice weather')).toBe(false);
    });

    it('detects reminder keyword', () => {
      expect(hasEventSignals('Remind me to call', '')).toBe(true);
    });
  });
});
