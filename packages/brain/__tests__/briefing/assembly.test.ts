/**
 * T5.4 — Daily briefing assembly: collect, structure, Silence First.
 *
 * Source: ARCHITECTURE.md Task 5.4
 */

import {
  assembleBriefing,
  setBriefingHour, getBriefingHour,
  isBriefingTime, markBriefingSent,
  registerEngagementProvider, registerApprovalProvider, registerMemoryProvider,
  resetBriefingState,
} from '../../src/briefing/assembly';
import type { BriefingItem } from '../../src/briefing/assembly';
import { createReminder, resetReminderState } from '../../../core/src/reminders/service';

describe('Daily Briefing Assembly', () => {
  beforeEach(() => {
    resetBriefingState();
    resetReminderState();
  });

  describe('assembleBriefing', () => {
    it('returns null when nothing to report (Silence First)', () => {
      expect(assembleBriefing()).toBeNull();
    });

    it('includes engagement items from provider', () => {
      registerEngagementProvider(() => [
        { type: 'engagement', title: 'New RSS article', timestamp: Date.now() },
        { type: 'engagement', title: 'Social notification', timestamp: Date.now() },
      ]);
      const briefing = assembleBriefing();
      expect(briefing).not.toBeNull();
      expect(briefing!.sections.engagement).toHaveLength(2);
      expect(briefing!.totalItems).toBe(2);
    });

    it('includes upcoming reminders', () => {
      const now = Date.now();
      createReminder({ message: 'Team standup', due_at: now - 1000, persona: 'work' });
      createReminder({ message: 'Future reminder', due_at: now + 999_999_999, persona: 'work' });
      const briefing = assembleBriefing(now);
      expect(briefing).not.toBeNull();
      // First reminder is due, second is within 24h window
      expect(briefing!.sections.reminders.length).toBeGreaterThanOrEqual(1);
    });

    it('includes pending approvals from provider', () => {
      registerApprovalProvider(() => [
        { type: 'approval', title: 'Unlock health persona', timestamp: Date.now() },
      ]);
      const briefing = assembleBriefing();
      expect(briefing!.sections.approvals).toHaveLength(1);
    });

    it('includes new memories from provider', () => {
      registerMemoryProvider(() => [
        { type: 'memory', title: 'Stored 3 emails', timestamp: Date.now() },
      ]);
      const briefing = assembleBriefing();
      expect(briefing!.sections.memories).toHaveLength(1);
    });

    it('combines all sections with correct total', () => {
      registerEngagementProvider(() => [
        { type: 'engagement', title: 'RSS', timestamp: Date.now() },
      ]);
      registerApprovalProvider(() => [
        { type: 'approval', title: 'Approve', timestamp: Date.now() },
      ]);
      registerMemoryProvider(() => [
        { type: 'memory', title: 'New data', timestamp: Date.now() },
      ]);
      const now = Date.now();
      createReminder({ message: 'Reminder', due_at: now - 1000, persona: 'general' });

      const briefing = assembleBriefing(now);
      expect(briefing!.totalItems).toBeGreaterThanOrEqual(4);
    });

    it('has generatedAt timestamp', () => {
      registerEngagementProvider(() => [
        { type: 'engagement', title: 'Item', timestamp: Date.now() },
      ]);
      const before = Date.now();
      const briefing = assembleBriefing();
      expect(briefing!.generatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('briefing time', () => {
    it('default briefing hour is 8 AM', () => {
      expect(getBriefingHour()).toBe(8);
    });

    it('setBriefingHour changes the hour', () => {
      setBriefingHour(7);
      expect(getBriefingHour()).toBe(7);
    });

    it('clamps hour to [0, 23]', () => {
      setBriefingHour(25);
      expect(getBriefingHour()).toBe(23);
      setBriefingHour(-1);
      expect(getBriefingHour()).toBe(0);
    });

    it('isBriefingTime returns true at briefing hour', () => {
      setBriefingHour(8);
      expect(isBriefingTime(8)).toBe(true);
    });

    it('isBriefingTime returns false at other hours', () => {
      setBriefingHour(8);
      expect(isBriefingTime(9)).toBe(false);
      expect(isBriefingTime(7)).toBe(false);
    });

    it('prevents double-send within 23 hours', () => {
      setBriefingHour(8);
      const now = Date.now();
      expect(isBriefingTime(8, now)).toBe(true);
      markBriefingSent(now);
      expect(isBriefingTime(8, now + 1000)).toBe(false);
    });

    it('allows next briefing after 23 hours', () => {
      setBriefingHour(8);
      const now = Date.now();
      markBriefingSent(now);
      const nextDay = now + 23 * 60 * 60 * 1000 + 1000;
      expect(isBriefingTime(8, nextDay)).toBe(true);
    });
  });
});
