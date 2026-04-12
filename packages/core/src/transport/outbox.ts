/**
 * D2D outbox — durable message queue with exponential backoff retry.
 *
 * Enqueue → pending. Deliver → delivered (remove). Fail → retry with
 * backoff (1s, 2s, 4s, 8s, 16s, max 5 min). Expire after 24h TTL.
 *
 * Source: core/test/d2d_phase2_test.go
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface OutboxEntry {
  id: string;
  recipientDID: string;
  payload: Uint8Array;
  status: 'pending' | 'delivered' | 'failed';
  retryCount: number;
  nextRetryAt: number;
  createdAt: number;
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 300_000; // 5 minutes

/** In-memory outbox keyed by message ID. */
const outbox = new Map<string, OutboxEntry>();

/** Clear all outbox entries (for testing). */
export function clearOutbox(): void {
  outbox.clear();
}

/** Get the current outbox size (for testing). */
export function outboxSize(): number {
  return outbox.size;
}

/**
 * Compute next retry delay in ms using exponential backoff.
 *
 * Formula: min(1000 * 2^retryCount, 300000)
 * Sequence: 1s → 2s → 4s → 8s → 16s → 32s → ... → capped at 5 min.
 */
export function computeBackoff(retryCount: number): number {
  const delay = BASE_BACKOFF_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_BACKOFF_MS);
}

/**
 * Enqueue a D2D message for delivery. Returns the unique message ID.
 *
 * Message starts as 'pending' with nextRetryAt = now (immediately eligible).
 */
export function enqueueMessage(recipientDID: string, payload: Uint8Array): string {
  const id = `msg-${bytesToHex(randomBytes(8))}`;
  const now = Date.now();
  outbox.set(id, {
    id,
    recipientDID,
    payload,
    status: 'pending',
    retryCount: 0,
    nextRetryAt: now,
    createdAt: now,
  });
  return id;
}

/**
 * Mark a message as delivered — removes from queue.
 *
 * No-op if the message doesn't exist (idempotent).
 */
export function markDelivered(messageId: string): void {
  outbox.delete(messageId);
}

/**
 * Mark a message as failed — increment retry, compute next backoff.
 *
 * Throws if message not found.
 */
export function markFailed(messageId: string): void {
  const entry = outbox.get(messageId);
  if (!entry) throw new Error(`outbox: message ${messageId} not found`);

  entry.retryCount += 1;
  entry.status = 'failed';
  entry.nextRetryAt = Date.now() + computeBackoff(entry.retryCount);
}

/**
 * Get all pending/failed messages ready for retry (nextRetryAt <= now).
 *
 * Returns entries sorted by nextRetryAt (oldest first).
 */
export function getPendingForRetry(now?: number): OutboxEntry[] {
  const currentTime = now ?? Date.now();
  const ready: OutboxEntry[] = [];

  for (const entry of outbox.values()) {
    if ((entry.status === 'pending' || entry.status === 'failed') &&
        entry.nextRetryAt <= currentTime) {
      ready.push(entry);
    }
  }

  return ready.sort((a, b) => a.nextRetryAt - b.nextRetryAt);
}

/**
 * Delete messages older than TTL. Returns count deleted.
 *
 * TTL is in seconds. Checks createdAt against (now - ttl).
 */
export function deleteExpired(ttlSeconds: number, now?: number): number {
  const currentTime = now ?? Date.now();
  const cutoff = currentTime - (ttlSeconds * 1000);
  let deleted = 0;

  for (const [id, entry] of outbox.entries()) {
    if (entry.createdAt < cutoff) {
      outbox.delete(id);
      deleted++;
    }
  }

  return deleted;
}

/**
 * Resume a message after approval — sets to pending for immediate retry.
 *
 * Used when a held message's approval gate clears.
 * Throws if message not found.
 */
export function resumeAfterApproval(messageId: string): void {
  const entry = outbox.get(messageId);
  if (!entry) throw new Error(`outbox: message ${messageId} not found`);

  entry.status = 'pending';
  entry.nextRetryAt = Date.now();
}
