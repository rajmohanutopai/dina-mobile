/**
 * Reminder planner — plan reminders from staging items with temporal events.
 *
 * When a staging item has detected events (birthdays, deadlines, appointments):
 * 1. Extract events via event_extractor (deterministic regex)
 * 2. Optionally refine via LLM (add context, adjust timing)
 * 3. Create reminders via Core reminder service
 *
 * The planner runs as part of the staging enrichment pipeline,
 * after classification and L0/L1 generation.
 *
 * Source: ARCHITECTURE.md Task 3.28
 */

import { extractEvents, isValidReminderPayload } from '../enrichment/event_extractor';
import type { ExtractionInput, ExtractedEvent } from '../enrichment/event_extractor';
import { createReminder, type Reminder } from '../../../core/src/reminders/service';
import { parseReminderPlan } from '../llm/output_parser';

export interface PlannerInput {
  itemId: string;
  type: string;
  summary: string;
  body: string;
  timestamp: number;
  persona: string;
  metadata?: Record<string, unknown>;
}

export interface PlannerResult {
  eventsDetected: number;
  remindersCreated: number;
  reminders: Reminder[];
  llmRefined: boolean;
}

/** Injectable LLM planner: given item text, returns reminder plan JSON. */
export type ReminderLLMProvider = (text: string) => Promise<string>;

let llmProvider: ReminderLLMProvider | null = null;

/** Register an LLM provider for reminder planning. */
export function registerReminderLLM(provider: ReminderLLMProvider): void {
  llmProvider = provider;
}

/** Reset the provider (for testing). */
export function resetReminderLLM(): void {
  llmProvider = null;
}

/**
 * Plan reminders for a staging item.
 *
 * Pipeline:
 * 1. Extract events (deterministic)
 * 2. If LLM available → refine/add events
 * 3. Validate each event
 * 4. Create reminders
 */
export async function planReminders(input: PlannerInput): Promise<PlannerResult> {
  const extractionInput: ExtractionInput = {
    item_id: input.itemId,
    type: input.type,
    summary: input.summary,
    body: input.body,
    timestamp: input.timestamp,
    metadata: input.metadata,
  };

  // 1. Deterministic extraction
  const events = extractEvents(extractionInput);
  let allEvents = [...events];
  let llmRefined = false;

  // 2. LLM refinement (adds context, catches events regex misses)
  if (llmProvider) {
    try {
      const text = `${input.summary} ${input.body}`;
      const rawOutput = await llmProvider(text);
      const llmPlan = parseReminderPlan(rawOutput);

      for (const llmReminder of llmPlan.reminders) {
        // Don't duplicate events already found by regex
        const isDuplicate = allEvents.some(e =>
          Math.abs(new Date(e.fire_at).getTime() - llmReminder.due_at) < 86_400_000 &&
          e.kind === llmReminder.kind,
        );

        if (!isDuplicate) {
          allEvents.push({
            fire_at: new Date(llmReminder.due_at).toISOString(),
            message: llmReminder.message,
            kind: llmReminder.kind as ExtractedEvent['kind'],
            source_item_id: input.itemId,
          });
        }
      }

      if (llmPlan.reminders.length > 0) llmRefined = true;
    } catch {
      // LLM failure — proceed with regex-only events
    }
  }

  // 3 + 4. Validate and create reminders
  const created: Reminder[] = [];

  for (const event of allEvents) {
    if (!isValidReminderPayload(event)) continue;

    const dueAt = new Date(event.fire_at).getTime();
    if (isNaN(dueAt) || dueAt <= 0) continue;

    try {
      const reminder = createReminder({
        message: event.message,
        due_at: dueAt,
        persona: input.persona,
        kind: event.kind,
        source_item_id: event.source_item_id,
        source: 'reminder_planner',
      });
      created.push(reminder);
    } catch {
      // Dedup rejection or other error — skip
    }
  }

  return {
    eventsDetected: allEvents.length,
    remindersCreated: created.length,
    reminders: created,
    llmRefined,
  };
}

/**
 * Check if a staging item has potential events worth planning.
 *
 * Quick heuristic check before running the full planner.
 * Returns true if the text contains date-like patterns.
 */
export function hasEventSignals(summary: string, body: string): boolean {
  const text = `${summary} ${body}`.toLowerCase();
  return /\b(january|february|march|april|may|june|july|august|september|october|november|december|due|deadline|birthday|appointment|meeting|remind)\b/i.test(text);
}
