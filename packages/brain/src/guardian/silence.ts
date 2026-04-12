/**
 * Guardian loop — silence classification.
 *
 * Three priority tiers:
 *   1 (fiduciary) — interrupt: security alert, health critical, payment due
 *   2 (solicited) — notify: reminder, search result
 *   3 (engagement) — briefing: social, promo, RSS, podcast
 *
 * Default when ambiguous: Tier 3 (Silence First — don't interrupt).
 *
 * DND mode: downgrades solicited (Tier 2) to engagement (Tier 3).
 * Fiduciary (Tier 1) is NEVER downgraded — Law 1 (fiduciary duty) overrides DND.
 *
 * Stale content: items older than 24h are classified below Tier 3
 * (returned as Tier 3 but with reduced confidence for briefing prioritization).
 *
 * Source: brain/tests/test_guardian.py
 */

export type PriorityTier = 1 | 2 | 3;

export interface ClassificationResult {
  tier: PriorityTier;
  reason: string;
  confidence: number;
  method: 'deterministic' | 'llm';
}

// ---------------------------------------------------------------
// Pattern constants
// ---------------------------------------------------------------

const FIDUCIARY_KEYWORD_PATTERN =
  /cancel|security alert|breach|unusual login|overdrawn|lab result|diagnosis|emergency/i;

const FIDUCIARY_SOURCE_PATTERN = /^(security|health_system|bank|emergency)$/i;

const SOLICITED_TYPE_SET = new Set(['reminder', 'search_result']);

const ENGAGEMENT_TYPE_SET = new Set(['notification', 'promo', 'social', 'rss', 'podcast']);

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------
// DND state
// ---------------------------------------------------------------

let dndEnabled = false;

/** Enable DND mode — downgrades solicited to engagement. */
export function enableDND(): void {
  dndEnabled = true;
}

/** Disable DND mode. */
export function disableDND(): void {
  dndEnabled = false;
}

/** Check if DND mode is active. */
export function isDNDEnabled(): boolean {
  return dndEnabled;
}

/** Reset DND state (for testing). */
export function resetDNDState(): void {
  dndEnabled = false;
}

// ---------------------------------------------------------------
// Escalation tracking — repeated engagement from same source → fiduciary
// ---------------------------------------------------------------

/** Escalation threshold: after N engagement events from the same source, escalate to fiduciary. */
const ESCALATION_THRESHOLD = 3;

/** Source → recent engagement event count. */
const escalationCounts = new Map<string, number>();

/** Record an engagement event for escalation tracking. Returns current count. */
export function recordEngagementEvent(source: string): number {
  const count = (escalationCounts.get(source) ?? 0) + 1;
  escalationCounts.set(source, count);
  return count;
}

/** Check if a source has exceeded the escalation threshold. */
export function isEscalated(source: string): boolean {
  return (escalationCounts.get(source) ?? 0) >= ESCALATION_THRESHOLD;
}

/** Reset escalation state (for testing). */
export function resetEscalationState(): void {
  escalationCounts.clear();
}

// ---------------------------------------------------------------
// User preference overrides — per-source tier override
// ---------------------------------------------------------------

/** Map of source → user-specified tier override. */
const userOverrides = new Map<string, PriorityTier>();

/** Set a user override for a specific source. */
export function setUserOverride(source: string, tier: PriorityTier): void {
  userOverrides.set(source, tier);
}

/** Remove a user override for a specific source. */
export function removeUserOverride(source: string): void {
  userOverrides.delete(source);
}

/** Check if a source has a user override. */
export function getUserOverride(source: string): PriorityTier | null {
  return userOverrides.get(source) ?? null;
}

/** Reset all user overrides (for testing). */
export function resetUserOverrides(): void {
  userOverrides.clear();
}

// ---------------------------------------------------------------
// Quiet hours — time-of-day auto-downgrade
// ---------------------------------------------------------------

/** Default quiet hours: 22:00–07:00. */
let quietHoursStart = 22;
let quietHoursEnd = 7;
let quietHoursEnabled = false;

/** Injectable clock for testing. Returns current hour (0-23). */
let clockFn: () => number = () => new Date().getHours();

/** Enable quiet hours with optional custom window. */
export function enableQuietHours(startHour?: number, endHour?: number): void {
  quietHoursEnabled = true;
  if (startHour !== undefined) quietHoursStart = startHour;
  if (endHour !== undefined) quietHoursEnd = endHour;
}

/** Disable quiet hours. */
export function disableQuietHours(): void {
  quietHoursEnabled = false;
}

/** Check if quiet hours are currently active. */
export function isInQuietHours(hour?: number): boolean {
  if (!quietHoursEnabled) return false;
  const h = hour ?? clockFn();

  // Handle wrap-around (e.g., 22:00 → 07:00)
  if (quietHoursStart > quietHoursEnd) {
    return h >= quietHoursStart || h < quietHoursEnd;
  }
  return h >= quietHoursStart && h < quietHoursEnd;
}

/** Set the clock function (for testing). */
export function setClockFn(fn: () => number): void {
  clockFn = fn;
}

/** Reset quiet hours state (for testing). */
export function resetQuietHoursState(): void {
  quietHoursEnabled = false;
  quietHoursStart = 22;
  quietHoursEnd = 7;
  clockFn = () => new Date().getHours();
}

// ---------------------------------------------------------------
// Event batching — dedup similar events within time window
// ---------------------------------------------------------------

/** Batch window in ms. Events within this window are deduped. */
const BATCH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/** Recent event fingerprints: key → timestamp of last seen. */
const recentEvents = new Map<string, number>();

/**
 * Build a fingerprint for event deduplication.
 * Uses source + type as the grouping key.
 */
export function eventFingerprint(event: Record<string, unknown>): string {
  const source = String(event.source || '');
  const type = String(event.type || '');
  return `${source}:${type}`;
}

/**
 * Check if this event is a duplicate of a recent one.
 * If it's a duplicate (same fingerprint within batch window), returns true.
 * Always records the event for future dedup checks.
 */
export function isDuplicateEvent(event: Record<string, unknown>, now?: number): boolean {
  const fp = eventFingerprint(event);
  const currentTime = now ?? Date.now();
  const lastSeen = recentEvents.get(fp);

  // Record this occurrence
  recentEvents.set(fp, currentTime);

  if (lastSeen === undefined) return false;
  return (currentTime - lastSeen) < BATCH_WINDOW_MS;
}

/** Get the count of tracked event fingerprints. */
export function batchedEventCount(): number {
  return recentEvents.size;
}

/** Purge expired fingerprints (older than batch window). */
export function purgeExpiredFingerprints(now?: number): number {
  const currentTime = now ?? Date.now();
  let purged = 0;
  for (const [fp, ts] of recentEvents.entries()) {
    if (currentTime - ts >= BATCH_WINDOW_MS) {
      recentEvents.delete(fp);
      purged++;
    }
  }
  return purged;
}

/** Reset batching state (for testing). */
export function resetBatchingState(): void {
  recentEvents.clear();
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Classify an event's priority tier.
 * Uses LLM when available, falls back to deterministic.
 * Applies DND downgrade after classification.
 */
export async function classifyPriority(
  event: Record<string, unknown>,
): Promise<ClassificationResult> {
  const source = String(event.source || '');

  // User preference override — always takes priority (except: user can't override TO fiduciary from safety perspective,
  // but CAN override downward or set a specific tier for a source)
  const override = getUserOverride(source);
  if (override !== null) {
    return {
      tier: override,
      reason: `User override for source "${source}"`,
      confidence: 1.0,
      method: 'deterministic',
    };
  }

  const result = classifyDeterministic(event);

  // Escalation: if engagement events from this source exceed threshold → Tier 1
  if (result.tier === 3 && source) {
    recordEngagementEvent(source);
    if (isEscalated(source)) {
      return {
        tier: 1,
        reason: `Escalated: ${ESCALATION_THRESHOLD}+ engagement events from "${source}"`,
        confidence: 0.80,
        method: 'deterministic',
      };
    }
  }

  // DND mode: downgrade Tier 2 → Tier 3. Tier 1 is NEVER downgraded.
  if (dndEnabled && result.tier === 2) {
    return {
      tier: 3,
      reason: `DND active — downgraded from Tier 2 (${result.reason})`,
      confidence: result.confidence * 0.8,
      method: result.method,
    };
  }

  // Quiet hours: same as DND but automatic based on time-of-day.
  if (isInQuietHours() && result.tier === 2) {
    return {
      tier: 3,
      reason: `Quiet hours — downgraded from Tier 2 (${result.reason})`,
      confidence: result.confidence * 0.8,
      method: result.method,
    };
  }

  return result;
}

/**
 * Deterministic fallback: classify using regex keywords only.
 * Priority order: fiduciary (1) > solicited (2) > engagement (3) > default (3).
 */
export function classifyDeterministic(
  event: Record<string, unknown>,
): ClassificationResult {
  const source = String(event.source || '');
  const subject = String(event.subject || '');
  const body = String(event.body || '');
  const type = String(event.type || '');
  const text = `${subject} ${body}`;

  // Tier 1: Fiduciary — urgent, must interrupt
  if (isFiduciarySource(source)) {
    return {
      tier: 1,
      reason: `Fiduciary source: "${source}"`,
      confidence: 0.95,
      method: 'deterministic',
    };
  }

  if (matchesFiduciaryKeywords(text)) {
    return {
      tier: 1,
      reason: 'Fiduciary keyword detected in text',
      confidence: 0.85,
      method: 'deterministic',
    };
  }

  // Tier 2: Solicited — user-requested content
  if (isSolicitedType(type)) {
    return {
      tier: 2,
      reason: `Solicited type: "${type}"`,
      confidence: 0.90,
      method: 'deterministic',
    };
  }

  // Tier 3: Engagement — known engagement types
  if (isEngagementType(type)) {
    return {
      tier: 3,
      reason: `Engagement type: "${type}"`,
      confidence: 0.90,
      method: 'deterministic',
    };
  }

  // Default: Tier 3 — Silence First
  return {
    tier: 3,
    reason: 'Silence First default — no urgent signal detected',
    confidence: 0.50,
    method: 'deterministic',
  };
}

/** Check if text matches fiduciary keywords. */
export function matchesFiduciaryKeywords(text: string): boolean {
  return FIDUCIARY_KEYWORD_PATTERN.test(text);
}

/** Check if a source is a fiduciary source. */
export function isFiduciarySource(source: string): boolean {
  return FIDUCIARY_SOURCE_PATTERN.test(source);
}

/** Check if an event type is solicited (user-requested). */
export function isSolicitedType(type: string): boolean {
  return SOLICITED_TYPE_SET.has(type);
}

/** Check if an event type is engagement (nice-to-know). */
export function isEngagementType(type: string): boolean {
  return ENGAGEMENT_TYPE_SET.has(type);
}

/**
 * Check if content is stale (older than 24 hours).
 *
 * Stale content gets reduced confidence in briefing assembly,
 * making it less likely to be shown prominently.
 * Returns the staleness factor: 0.0 (fresh) to 1.0 (maximally stale).
 */
export function isStaleContent(timestampMs: number, now?: number): { stale: boolean; factor: number } {
  const currentTime = now ?? Date.now();
  const ageMs = currentTime - timestampMs;

  if (ageMs <= 0) return { stale: false, factor: 0 };
  if (ageMs < STALE_THRESHOLD_MS) return { stale: false, factor: ageMs / STALE_THRESHOLD_MS };

  // Stale — factor increases beyond 1.0 for very old content
  const factor = Math.min(ageMs / STALE_THRESHOLD_MS, 5.0);
  return { stale: true, factor };
}
