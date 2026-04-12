/**
 * Post-publish handler — triggered after a vault item is stored.
 *
 * Responsibilities:
 * 1. Extract temporal events (birthdays, deadlines) → create reminders
 * 2. Update contact last_interaction timestamp
 * 3. Flag ambiguous routing for user review
 *
 * This runs as a post-hook on the staging resolve → stored transition.
 * It does NOT block the store operation — failures are logged, not thrown.
 *
 * Source: ARCHITECTURE.md Task 3.29
 */

import { extractEvents, isValidReminderPayload } from '../enrichment/event_extractor';
import type { ExtractedEvent, ExtractionInput } from '../enrichment/event_extractor';
import { createReminder } from '../../../core/src/reminders/service';
import { getContact, updateContact } from '../../../core/src/contacts/directory';

export interface PostPublishResult {
  remindersCreated: number;
  contactUpdated: boolean;
  ambiguousRouting: boolean;
  errors: string[];
}

/**
 * Run post-publish processing on a stored vault item.
 *
 * Safe: catches all errors internally. Returns a result summary.
 */
export function handlePostPublish(item: {
  id: string;
  type: string;
  summary: string;
  body: string;
  timestamp: number;
  persona: string;
  sender_did?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}): PostPublishResult {
  const result: PostPublishResult = {
    remindersCreated: 0,
    contactUpdated: false,
    ambiguousRouting: false,
    errors: [],
  };

  // 1. Extract events and create reminders
  try {
    const input: ExtractionInput = {
      item_id: item.id,
      type: item.type,
      summary: item.summary,
      body: item.body,
      timestamp: item.timestamp,
      metadata: item.metadata,
    };

    const events = extractEvents(input);

    for (const event of events) {
      if (isValidReminderPayload(event)) {
        try {
          createReminder({
            message: event.message,
            due_at: new Date(event.fire_at).getTime(),
            persona: item.persona,
            kind: event.kind,
            source_item_id: event.source_item_id,
            source: 'post_publish',
          });
          result.remindersCreated++;
        } catch (err) {
          result.errors.push(`reminder: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`events: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Update contact last_interaction
  if (item.sender_did) {
    try {
      const contact = getContact(item.sender_did);
      if (contact) {
        updateContact(item.sender_did, {});
        result.contactUpdated = true;
      }
    } catch (err) {
      result.errors.push(`contact: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Flag ambiguous routing (low confidence classification)
  if (item.confidence !== undefined && item.confidence < 0.5) {
    result.ambiguousRouting = true;
  }

  return result;
}
