/**
 * Temporal event extraction — detects dates/deadlines in vault items
 * and creates reminder payloads.
 *
 * Detects: invoice due dates, appointments, birthdays, deadlines.
 * Creates reminder payloads compatible with Core's /v1/reminder endpoint.
 *
 * Extraction is regex-based (deterministic). LLM-based extraction (task 3.28)
 * can refine results when available.
 *
 * Source: brain/tests/test_event_extractor.py
 */

export interface ExtractedEvent {
  fire_at: string;    // ISO 8601 timestamp for reminder
  message: string;    // Human-readable reminder text
  kind: 'payment_due' | 'appointment' | 'birthday' | 'deadline' | 'custom';
  source_item_id: string;
}

export interface ExtractionInput {
  item_id: string;
  type: string;
  summary: string;
  body: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------
// Month name → number mapping
// ---------------------------------------------------------------

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// ---------------------------------------------------------------
// Date patterns
// ---------------------------------------------------------------

/** Matches "March 15, 2026" or "March 15" or "Mar 15 2026" */
const MONTH_DAY_PATTERN = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/gi;

/** Matches "due March 15" or "due by March 15" or "due date: March 15" */
const DUE_DATE_PATTERN = /\bdue\s+(?:by\s+|date\s*:\s*)?(\w+\s+\d{1,2}(?:\s*,?\s*\d{4})?)\b/i;

/** Matches "at 2pm" or "at 2:00 PM" or "at 14:00" */
const TIME_PATTERN = /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;

/** Matches "deadline" keyword near a date */
const DEADLINE_PATTERN = /\bdeadline\b/i;

/** Matches "birthday" keyword */
const BIRTHDAY_PATTERN = /\bbirthday\b/i;

/** Matches "appointment" or "meeting" keyword */
const APPOINTMENT_PATTERN = /\b(?:appointment|meeting)\b/i;

/** Matches "invoice" or "payment" keyword */
const INVOICE_PATTERN = /\b(?:invoice|payment)\b/i;

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Extract temporal events from a vault item.
 * Returns empty array if no dates found.
 */
export function extractEvents(input: ExtractionInput): ExtractedEvent[] {
  const text = `${input.summary} ${input.body}`;
  const events: ExtractedEvent[] = [];

  // Find all date mentions in the text
  const dates = extractDates(text, input.timestamp);
  if (dates.length === 0) return [];

  // Classify each date by context
  for (const { dateStr, isoDate } of dates) {
    const kind = classifyEventKind(text);
    const message = buildMessage(kind, input.summary, dateStr);

    events.push({
      fire_at: isoDate,
      message,
      kind,
      source_item_id: input.item_id,
    });
  }

  return events;
}

/** Check if an extraction result is a valid Core reminder payload. */
export function isValidReminderPayload(event: ExtractedEvent): boolean {
  if (!event.fire_at || event.fire_at.length === 0) return false;
  if (!event.message || event.message.length === 0) return false;
  if (!event.kind) return false;
  if (!event.source_item_id || event.source_item_id.length === 0) return false;

  // fire_at must be valid ISO 8601
  const date = new Date(event.fire_at);
  if (isNaN(date.getTime())) return false;

  return true;
}

/**
 * Extract a birthday date from text.
 * Looks for "birthday is March 15" or "birthday on March 15".
 *
 * @returns ISO date string (YYYY-MM-DD) or null if no parseable date found
 */
export function extractBirthdayDate(text: string): string | null {
  if (!BIRTHDAY_PATTERN.test(text)) return null;

  const dates = extractDates(text, Date.now() / 1000);
  if (dates.length === 0) return null;

  // Return just the date portion (YYYY-MM-DD)
  return dates[0].isoDate.split('T')[0];
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

interface ParsedDate {
  dateStr: string;
  isoDate: string;
}

/**
 * Extract all recognizable dates from text.
 * Returns ISO 8601 strings. Uses current year if year is missing.
 */
function extractDates(text: string, contextTimestamp: number): ParsedDate[] {
  const results: ParsedDate[] = [];
  const currentYear = new Date(contextTimestamp * 1000).getUTCFullYear();

  // Reset regex state
  MONTH_DAY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MONTH_DAY_PATTERN.exec(text)) !== null) {
    const monthName = match[1].toLowerCase();
    const day = parseInt(match[2], 10);
    const year = match[3] ? parseInt(match[3], 10) : currentYear;
    const month = MONTH_MAP[monthName];

    if (!month || day < 1 || day > 31) continue;

    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:00:00Z`;
    results.push({ dateStr: match[0], isoDate });
  }

  return results;
}

/** Classify the kind of event based on text context. */
function classifyEventKind(text: string): ExtractedEvent['kind'] {
  if (BIRTHDAY_PATTERN.test(text)) return 'birthday';
  if (INVOICE_PATTERN.test(text) || DUE_DATE_PATTERN.test(text)) return 'payment_due';
  if (APPOINTMENT_PATTERN.test(text)) return 'appointment';
  if (DEADLINE_PATTERN.test(text)) return 'deadline';
  return 'custom';
}

/** Build a human-readable reminder message. */
function buildMessage(kind: ExtractedEvent['kind'], summary: string, dateStr: string): string {
  switch (kind) {
    case 'birthday':
      return summary || `Birthday on ${dateStr}`;
    case 'payment_due':
      return summary || `Payment due ${dateStr}`;
    case 'appointment':
      return summary || `Appointment on ${dateStr}`;
    case 'deadline':
      return summary || `Deadline: ${dateStr}`;
    default:
      return summary || `Event on ${dateStr}`;
  }
}
