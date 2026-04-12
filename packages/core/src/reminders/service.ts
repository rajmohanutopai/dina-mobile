/**
 * Reminder service — CRUD with dedup and recurring support.
 *
 * Reminders are per-persona, deduplicated by the compound key
 * (source_item_id, kind, due_at, persona). This prevents the staging
 * pipeline from creating duplicate reminders when re-processing items.
 *
 * Recurring reminders: daily/weekly/monthly. On completion, the next
 * occurrence is auto-created if recurring is set.
 *
 * Source: ARCHITECTURE.md Section 2.61
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { MS_DAY } from '../constants';

export type RecurringFrequency = '' | 'daily' | 'weekly' | 'monthly';

export interface Reminder {
  id: string;
  message: string;
  due_at: number;
  recurring: RecurringFrequency;
  completed: number;         // 0 = pending, 1 = completed
  created_at: number;
  source_item_id: string;
  source: string;
  persona: string;
  timezone: string;
  kind: string;
  status: string;            // 'pending' | 'fired' | 'completed' | 'snoozed'
}

/** In-memory reminder store keyed by ID. */
const reminders = new Map<string, Reminder>();

/** Dedup index: compound key → reminder ID. */
const dedupIndex = new Map<string, string>();

/** Build dedup key from the compound fields. */
function dedupKey(sourceItemId: string, kind: string, dueAt: number, persona: string): string {
  return `${sourceItemId}|${kind}|${dueAt}|${persona}`;
}

/**
 * Create a reminder. Returns the reminder.
 *
 * Dedup: if a reminder with the same (source_item_id, kind, due_at, persona)
 * already exists, returns the existing one without creating a duplicate.
 */
export function createReminder(input: {
  message: string;
  due_at: number;
  persona: string;
  kind?: string;
  source_item_id?: string;
  source?: string;
  recurring?: RecurringFrequency;
  timezone?: string;
}): Reminder {
  const kind = input.kind ?? 'manual';
  const sourceItemId = input.source_item_id ?? '';
  const dk = dedupKey(sourceItemId, kind, input.due_at, input.persona);

  // Dedup check
  const existingId = dedupIndex.get(dk);
  if (existingId) {
    const existing = reminders.get(existingId);
    if (existing) return existing;
  }

  const id = `rem-${bytesToHex(randomBytes(8))}`;
  const now = Date.now();

  const reminder: Reminder = {
    id,
    message: input.message,
    due_at: input.due_at,
    recurring: input.recurring ?? '',
    completed: 0,
    created_at: now,
    source_item_id: sourceItemId,
    source: input.source ?? '',
    persona: input.persona,
    timezone: input.timezone ?? 'UTC',
    kind,
    status: 'pending',
  };

  reminders.set(id, reminder);
  dedupIndex.set(dk, id);
  return reminder;
}

/** Get a reminder by ID. */
export function getReminder(id: string): Reminder | null {
  return reminders.get(id) ?? null;
}

/**
 * List pending reminders (not completed, due_at <= now).
 * Sorted by due_at ascending (soonest first).
 */
export function listPending(now?: number): Reminder[] {
  const currentTime = now ?? Date.now();
  const pending: Reminder[] = [];

  for (const r of reminders.values()) {
    if (r.completed === 0 && r.status === 'pending' && r.due_at <= currentTime) {
      pending.push(r);
    }
  }

  return pending.sort((a, b) => a.due_at - b.due_at);
}

/**
 * List all reminders for a persona.
 * Includes completed reminders.
 */
export function listByPersona(persona: string): Reminder[] {
  return [...reminders.values()].filter(r => r.persona === persona);
}

/**
 * Complete a reminder. If recurring, create the next occurrence.
 * Returns the next occurrence if created, null otherwise.
 */
export function completeReminder(id: string): Reminder | null {
  const reminder = reminders.get(id);
  if (!reminder) throw new Error(`reminders: "${id}" not found`);

  reminder.completed = 1;
  reminder.status = 'completed';

  // Create next occurrence for recurring reminders
  if (reminder.recurring) {
    const nextDueAt = computeNextOccurrence(reminder.due_at, reminder.recurring);
    return createReminder({
      message: reminder.message,
      due_at: nextDueAt,
      persona: reminder.persona,
      kind: reminder.kind,
      source_item_id: reminder.source_item_id,
      source: reminder.source,
      recurring: reminder.recurring,
      timezone: reminder.timezone,
    });
  }

  return null;
}

/** Snooze a reminder by pushing due_at forward. */
export function snoozeReminder(id: string, snoozeMs: number): void {
  const reminder = reminders.get(id);
  if (!reminder) throw new Error(`reminders: "${id}" not found`);
  reminder.due_at += snoozeMs;
  reminder.status = 'snoozed';
}

/** Delete a reminder. Returns true if found. */
export function deleteReminder(id: string): boolean {
  const reminder = reminders.get(id);
  if (!reminder) return false;

  const dk = dedupKey(reminder.source_item_id, reminder.kind, reminder.due_at, reminder.persona);
  dedupIndex.delete(dk);
  reminders.delete(id);
  return true;
}

/** Compute the next occurrence for a recurring reminder. */
function computeNextOccurrence(dueAt: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'daily': return dueAt + MS_DAY;
    case 'weekly': return dueAt + 7 * MS_DAY;
    case 'monthly': return dueAt + 30 * MS_DAY;
    default: return dueAt;
  }
}

/** Reset all reminder state (for testing). */
export function resetReminderState(): void {
  reminders.clear();
  dedupIndex.clear();
}
