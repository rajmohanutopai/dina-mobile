/**
 * Staging service — ingest, claim, resolve, fail, extend lease, sweep.
 *
 * The staging inbox is the entry point for all data entering the vault.
 * Items flow: ingest → claim (lease) → classify/enrich → resolve or fail.
 *
 * Dedup: (source, source_id) — same email ingested twice is rejected.
 * Lease: 15-minute claim window. Expired leases reverted by sweep.
 * Retry: failed items re-queued up to 3 times, then dead-lettered.
 * Expiry: items older than 7 days are purged by sweep.
 *
 * Source: ARCHITECTURE.md Tasks 2.41–2.46
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  type StagingStatus,
  isValidTransition,
  shouldRetry,
  isLeaseExpired,
  isItemExpired,
} from './state_machine';
import { STAGING_LEASE_DURATION_S, STAGING_ITEM_TTL_S } from '../constants';

export interface StagingItem {
  id: string;
  source: string;
  source_id: string;
  producer_id: string;
  status: StagingStatus;
  persona: string;
  retry_count: number;
  lease_until: number;   // unix seconds
  expires_at: number;    // unix seconds
  created_at: number;    // unix seconds
  data: Record<string, unknown>;
}

const LEASE_DURATION_S = STAGING_LEASE_DURATION_S;
const ITEM_TTL_S = STAGING_ITEM_TTL_S;

/** In-memory staging inbox. */
const inbox = new Map<string, StagingItem>();

/** Dedup index: "source|source_id" → staging ID. */
const dedupIndex = new Map<string, string>();

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Ingest a new item into the staging inbox.
 *
 * Dedup by (source, source_id). Duplicate returns the existing ID.
 * Sets expires_at to 7 days from now.
 */
export function ingest(input: {
  source: string;
  source_id: string;
  producer_id?: string;
  data?: Record<string, unknown>;
}): { id: string; duplicate: boolean } {
  const dk = `${input.source}|${input.source_id}`;
  const existingId = dedupIndex.get(dk);
  if (existingId && inbox.has(existingId)) {
    return { id: existingId, duplicate: true };
  }

  const id = `stg-${bytesToHex(randomBytes(8))}`;
  const now = nowSeconds();

  const item: StagingItem = {
    id,
    source: input.source,
    source_id: input.source_id,
    producer_id: input.producer_id ?? '',
    status: 'received',
    persona: '',
    retry_count: 0,
    lease_until: 0,
    expires_at: now + ITEM_TTL_S,
    created_at: now,
    data: input.data ?? {},
  };

  inbox.set(id, item);
  dedupIndex.set(dk, id);
  return { id, duplicate: false };
}

/**
 * Claim up to `limit` received items for processing.
 *
 * Atomically transitions received → classifying with a 15-minute lease.
 * Returns the claimed items. Re-claim returns empty (items already claimed).
 */
export function claim(limit: number = 10): StagingItem[] {
  const now = nowSeconds();
  const claimed: StagingItem[] = [];

  for (const item of inbox.values()) {
    if (claimed.length >= limit) break;
    if (item.status !== 'received') continue;

    item.status = 'classifying';
    item.lease_until = now + LEASE_DURATION_S;
    claimed.push(item);
  }

  return claimed;
}

/**
 * Resolve a claimed item — store in vault or mark pending_unlock.
 *
 * @param personaOpen — whether the target persona vault is currently open
 */
export function resolve(id: string, persona: string, personaOpen: boolean): void {
  const item = inbox.get(id);
  if (!item) throw new Error(`staging: item "${id}" not found`);
  if (item.status !== 'classifying') {
    throw new Error(`staging: cannot resolve item in status "${item.status}"`);
  }

  item.persona = persona;
  item.status = personaOpen ? 'stored' : 'pending_unlock';
}

/**
 * Mark a claimed item as failed. Increments retry_count.
 */
export function fail(id: string): void {
  const item = inbox.get(id);
  if (!item) throw new Error(`staging: item "${id}" not found`);
  if (item.status !== 'classifying') {
    throw new Error(`staging: cannot fail item in status "${item.status}"`);
  }

  item.status = 'failed';
  item.retry_count += 1;
}

/**
 * Extend the lease on a claimed item by N seconds.
 */
export function extendLease(id: string, extensionSeconds: number): void {
  const item = inbox.get(id);
  if (!item) throw new Error(`staging: item "${id}" not found`);
  if (item.status !== 'classifying') {
    throw new Error(`staging: cannot extend lease on item in status "${item.status}"`);
  }

  item.lease_until += extensionSeconds;
}

/**
 * Sweep the inbox: delete expired, revert stale leases, requeue failed, dead-letter exhausted.
 *
 * Returns counts of each action taken.
 */
export function sweep(now?: number): {
  expired: number;
  leaseReverted: number;
  requeued: number;
  deadLettered: number;
} {
  const currentTime = now ?? nowSeconds();
  const result = { expired: 0, leaseReverted: 0, requeued: 0, deadLettered: 0 };

  for (const [id, item] of inbox.entries()) {
    // 1. Delete expired items (7d TTL)
    if (isItemExpired(item.expires_at, currentTime)) {
      inbox.delete(id);
      result.expired++;
      continue;
    }

    // 2. Revert expired leases (classifying → received)
    if (item.status === 'classifying' && isLeaseExpired(item.lease_until, currentTime)) {
      item.status = 'received';
      item.lease_until = 0;
      result.leaseReverted++;
      continue;
    }

    // 3. Requeue failed items (retry ≤ 3) or dead-letter (retry > 3)
    if (item.status === 'failed') {
      if (shouldRetry(item.retry_count)) {
        item.status = 'received';
        result.requeued++;
      } else {
        // Dead-letter: leave as failed, don't requeue
        result.deadLettered++;
      }
    }
  }

  return result;
}

/**
 * Drain all pending_unlock items for a persona (after persona unlocked).
 *
 * Transitions pending_unlock → stored for the given persona.
 * Returns count of drained items.
 */
export function drainForPersona(persona: string): number {
  let drained = 0;
  for (const item of inbox.values()) {
    if (item.status === 'pending_unlock' && item.persona === persona) {
      item.status = 'stored';
      drained++;
    }
  }
  return drained;
}

/** Get a staging item by ID. */
export function getItem(id: string): StagingItem | null {
  return inbox.get(id) ?? null;
}

/** Get inbox size. */
export function inboxSize(): number {
  return inbox.size;
}

/** Reset all staging state (for testing). */
export function resetStagingState(): void {
  inbox.clear();
  dedupIndex.clear();
}
