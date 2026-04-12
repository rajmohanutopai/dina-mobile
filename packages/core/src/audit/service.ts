/**
 * Audit service — append-only hash-chained log with query and retention.
 *
 * Every security-relevant action is appended to the audit log.
 * Entries form a tamper-evident chain (SHA-256 hash of previous entry).
 * 90-day retention: older entries are purged by sweepRetention.
 *
 * Builds on hash_chain.ts which provides the cryptographic primitives.
 *
 * Source: ARCHITECTURE.md Task 2.48
 */

import { buildAuditEntry, verifyChain, type AuditEntry } from './hash_chain';

const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** In-memory audit log. Append-only array. */
const log: AuditEntry[] = [];

/**
 * Append an audit entry.
 *
 * Automatically computes seq, prev_hash, and entry_hash using the
 * hash_chain primitives. Returns the appended entry.
 */
export function appendAudit(
  actor: string,
  action: string,
  resource: string,
  detail?: string,
): AuditEntry {
  const seq = log.length + 1;
  const prevHash = log.length > 0 ? log[log.length - 1].entry_hash : '';
  const entry = buildAuditEntry(seq, actor, action, resource, detail ?? '', prevHash);
  log.push(entry);
  return entry;
}

/**
 * Query audit entries with optional filters.
 *
 * Filters by actor, action, resource, and time range.
 * Returns matching entries in chronological order.
 */
export function queryAudit(filters?: {
  actor?: string;
  action?: string;
  resource?: string;
  since?: number;    // unix ms timestamp
  until?: number;    // unix ms timestamp
  limit?: number;
}): AuditEntry[] {
  let results = [...log];

  if (filters?.actor) {
    results = results.filter(e => e.actor === filters.actor);
  }
  if (filters?.action) {
    results = results.filter(e => e.action === filters.action);
  }
  if (filters?.resource) {
    results = results.filter(e => e.resource === filters.resource);
  }
  if (filters?.since) {
    const sinceS = Math.floor(filters.since / 1000);
    results = results.filter(e => e.ts >= sinceS);
  }
  if (filters?.until) {
    const untilS = Math.floor(filters.until / 1000);
    results = results.filter(e => e.ts <= untilS);
  }
  if (filters?.limit) {
    results = results.slice(-filters.limit);
  }

  return results;
}

/**
 * Verify the integrity of the full audit chain.
 *
 * Returns { valid: true } if the chain is intact, or
 * { valid: false, brokenAt: N } if entry N's hash doesn't match.
 */
export function verifyAuditChain(): { valid: boolean; brokenAt?: number } {
  return verifyChain(log);
}

/**
 * Sweep entries older than 90 days.
 * Returns the count of purged entries.
 *
 * Note: this breaks the hash chain at the purge point.
 * In production, a compaction marker is stored so verification
 * starts from the new head. For the in-memory implementation,
 * we simply remove old entries.
 */
export function sweepRetention(now?: number): number {
  const cutoff = ((now ?? Date.now()) - RETENTION_MS) / 1000;
  let purged = 0;

  while (log.length > 0 && log[0].ts < cutoff) {
    log.shift();
    purged++;
  }

  return purged;
}

/** Get the total number of audit entries. */
export function auditCount(): number {
  return log.length;
}

/** Get the latest entry. Returns null if log is empty. */
export function latestEntry(): AuditEntry | null {
  return log.length > 0 ? log[log.length - 1] : null;
}

/** Reset all audit state (for testing). */
export function resetAuditState(): void {
  log.length = 0;
}
