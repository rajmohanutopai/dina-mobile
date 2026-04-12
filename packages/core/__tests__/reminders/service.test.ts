/**
 * T2.61 — Reminder service: CRUD, dedup, recurring, pending list.
 *
 * Source: ARCHITECTURE.md Section 2.61
 */

import {
  createReminder,
  getReminder,
  listPending,
  listByPersona,
  completeReminder,
  snoozeReminder,
  deleteReminder,
  resetReminderState,
} from '../../src/reminders/service';

describe('Reminder Service', () => {
  beforeEach(() => resetReminderState());

  describe('createReminder', () => {
    it('creates a reminder with generated ID', () => {
      const r = createReminder({ message: 'Buy milk', due_at: Date.now() + 60_000, persona: 'general' });
      expect(r.id).toMatch(/^rem-[0-9a-f]{16}$/);
      expect(r.message).toBe('Buy milk');
      expect(r.status).toBe('pending');
      expect(r.completed).toBe(0);
    });

    it('defaults kind to manual', () => {
      const r = createReminder({ message: 'Test', due_at: Date.now(), persona: 'general' });
      expect(r.kind).toBe('manual');
    });

    it('accepts custom kind and source', () => {
      const r = createReminder({
        message: 'Birthday', due_at: Date.now(), persona: 'general',
        kind: 'birthday', source: 'gmail', source_item_id: 'email-123',
      });
      expect(r.kind).toBe('birthday');
      expect(r.source).toBe('gmail');
      expect(r.source_item_id).toBe('email-123');
    });

    it('stores persona', () => {
      const r = createReminder({ message: 'Test', due_at: Date.now(), persona: 'health' });
      expect(r.persona).toBe('health');
    });

    it('supports recurring frequencies', () => {
      const r = createReminder({ message: 'Daily standup', due_at: Date.now(), persona: 'work', recurring: 'daily' });
      expect(r.recurring).toBe('daily');
    });
  });

  describe('dedup', () => {
    it('prevents duplicate by (source_item_id, kind, due_at, persona)', () => {
      const dueAt = Date.now() + 60_000;
      const r1 = createReminder({
        message: 'Birthday', due_at: dueAt, persona: 'general',
        kind: 'birthday', source_item_id: 'email-123',
      });
      const r2 = createReminder({
        message: 'Birthday duplicate', due_at: dueAt, persona: 'general',
        kind: 'birthday', source_item_id: 'email-123',
      });
      expect(r1.id).toBe(r2.id); // same reminder returned
    });

    it('allows same kind+source_item_id in different persona', () => {
      const dueAt = Date.now() + 60_000;
      const r1 = createReminder({ message: 'A', due_at: dueAt, persona: 'general', kind: 'birthday', source_item_id: 'x' });
      const r2 = createReminder({ message: 'B', due_at: dueAt, persona: 'health', kind: 'birthday', source_item_id: 'x' });
      expect(r1.id).not.toBe(r2.id);
    });

    it('allows same kind+persona with different due_at', () => {
      const r1 = createReminder({ message: 'A', due_at: 1000, persona: 'general', kind: 'birthday', source_item_id: 'x' });
      const r2 = createReminder({ message: 'B', due_at: 2000, persona: 'general', kind: 'birthday', source_item_id: 'x' });
      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('listPending', () => {
    it('returns due reminders', () => {
      const pastDue = Date.now() - 60_000;
      createReminder({ message: 'Due', due_at: pastDue, persona: 'general' });
      createReminder({ message: 'Future', due_at: Date.now() + 999_999, persona: 'general' });
      const pending = listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].message).toBe('Due');
    });

    it('excludes completed reminders', () => {
      const r = createReminder({ message: 'Done', due_at: Date.now() - 1000, persona: 'general' });
      completeReminder(r.id);
      expect(listPending()).toHaveLength(0);
    });

    it('sorted by due_at ascending', () => {
      const now = Date.now();
      createReminder({ message: 'Later', due_at: now - 1000, persona: 'general' });
      createReminder({ message: 'Earlier', due_at: now - 5000, persona: 'general' });
      const pending = listPending();
      expect(pending[0].message).toBe('Earlier');
      expect(pending[1].message).toBe('Later');
    });

    it('returns empty when none pending', () => {
      expect(listPending()).toEqual([]);
    });
  });

  describe('listByPersona', () => {
    it('returns reminders for specific persona', () => {
      createReminder({ message: 'General', due_at: Date.now(), persona: 'general' });
      createReminder({ message: 'Health', due_at: Date.now(), persona: 'health' });
      expect(listByPersona('general')).toHaveLength(1);
      expect(listByPersona('health')).toHaveLength(1);
    });

    it('includes completed reminders', () => {
      const r = createReminder({ message: 'Done', due_at: Date.now(), persona: 'general' });
      completeReminder(r.id);
      expect(listByPersona('general')).toHaveLength(1);
    });
  });

  describe('completeReminder', () => {
    it('marks reminder as completed', () => {
      const r = createReminder({ message: 'Task', due_at: Date.now(), persona: 'general' });
      completeReminder(r.id);
      expect(getReminder(r.id)!.completed).toBe(1);
      expect(getReminder(r.id)!.status).toBe('completed');
    });

    it('creates next occurrence for recurring daily', () => {
      const dueAt = Date.now();
      const r = createReminder({ message: 'Standup', due_at: dueAt, persona: 'work', recurring: 'daily' });
      const next = completeReminder(r.id);
      expect(next).not.toBeNull();
      expect(next!.due_at).toBe(dueAt + 86_400_000);
      expect(next!.recurring).toBe('daily');
    });

    it('creates next occurrence for recurring weekly', () => {
      const dueAt = Date.now();
      const r = createReminder({ message: 'Review', due_at: dueAt, persona: 'work', recurring: 'weekly' });
      const next = completeReminder(r.id);
      expect(next!.due_at).toBe(dueAt + 7 * 86_400_000);
    });

    it('returns null for non-recurring reminder', () => {
      const r = createReminder({ message: 'Once', due_at: Date.now(), persona: 'general' });
      expect(completeReminder(r.id)).toBeNull();
    });

    it('throws for unknown ID', () => {
      expect(() => completeReminder('rem-nonexistent')).toThrow('not found');
    });
  });

  describe('snoozeReminder', () => {
    it('pushes due_at forward', () => {
      const dueAt = Date.now();
      const r = createReminder({ message: 'Snooze me', due_at: dueAt, persona: 'general' });
      snoozeReminder(r.id, 600_000); // 10 min
      expect(getReminder(r.id)!.due_at).toBe(dueAt + 600_000);
      expect(getReminder(r.id)!.status).toBe('snoozed');
    });

    it('throws for unknown ID', () => {
      expect(() => snoozeReminder('rem-missing', 1000)).toThrow('not found');
    });
  });

  describe('deleteReminder', () => {
    it('removes reminder', () => {
      const r = createReminder({ message: 'Del', due_at: Date.now(), persona: 'general' });
      expect(deleteReminder(r.id)).toBe(true);
      expect(getReminder(r.id)).toBeNull();
    });

    it('returns false for unknown ID', () => {
      expect(deleteReminder('rem-missing')).toBe(false);
    });
  });
});
