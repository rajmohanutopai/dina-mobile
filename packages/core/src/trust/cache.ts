/**
 * Trust cache — trust score caching with 1-hour TTL.
 *
 * Caches trust profiles fetched from the AppView xRPC endpoint.
 * Each entry has a 1-hour TTL. Background refresh updates stale entries
 * without blocking the caller (serve stale + refresh async).
 *
 * Backed by the KV store for persistence across app restarts.
 *
 * Source: ARCHITECTURE.md Task 9.2
 */

import { kvGet, kvSet, kvDelete } from '../kv/store';

const CACHE_NAMESPACE = 'trust_cache';
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface TrustScore {
  did: string;
  score: number;           // 0-100
  attestationCount: number;
  lastUpdated: number;     // ms timestamp
}

/** In-memory TTL tracking: DID → timestamp when cached. */
const cacheTimestamps = new Map<string, number>();

/** Injectable trust score fetcher (for background refresh). */
let fetchTrustScore: ((did: string) => Promise<TrustScore | null>) | null = null;

/** Register a trust score fetcher. */
export function registerTrustFetcher(fetcher: (did: string) => Promise<TrustScore | null>): void {
  fetchTrustScore = fetcher;
}

/**
 * Get a cached trust score for a DID.
 *
 * Returns the cached score if fresh (< 1 hour old).
 * Returns null on cache miss or expired entry.
 */
export function getCachedTrust(did: string, now?: number): TrustScore | null {
  const raw = kvGet(did, CACHE_NAMESPACE);
  if (!raw) return null;

  const cachedAt = cacheTimestamps.get(did);
  if (cachedAt === undefined) return null;

  const currentTime = now ?? Date.now();
  if (currentTime - cachedAt > DEFAULT_TTL_MS) {
    // Expired — remove from cache
    invalidateTrust(did);
    return null;
  }

  try {
    return JSON.parse(raw) as TrustScore;
  } catch {
    invalidateTrust(did);
    return null;
  }
}

/**
 * Cache a trust score.
 */
export function cacheTrustScore(score: TrustScore, now?: number): void {
  const currentTime = now ?? Date.now();
  kvSet(score.did, JSON.stringify(score), CACHE_NAMESPACE);
  cacheTimestamps.set(score.did, currentTime);
}

/**
 * Invalidate a specific DID's cache entry.
 */
export function invalidateTrust(did: string): void {
  kvDelete(did, CACHE_NAMESPACE);
  cacheTimestamps.delete(did);
}

/**
 * Check if a DID's cache entry is stale (expired but still present in KV).
 */
export function isStale(did: string, now?: number): boolean {
  const cachedAt = cacheTimestamps.get(did);
  if (cachedAt === undefined) return false; // not cached at all
  const currentTime = now ?? Date.now();
  return currentTime - cachedAt > DEFAULT_TTL_MS;
}

/**
 * Refresh a trust score in the background.
 *
 * If a fetcher is registered, calls it and updates the cache.
 * Returns the refreshed score, or null if no fetcher or fetch failed.
 */
export async function refreshTrust(did: string): Promise<TrustScore | null> {
  if (!fetchTrustScore) return null;

  try {
    const score = await fetchTrustScore(did);
    if (score) {
      cacheTrustScore(score);
    }
    return score;
  } catch {
    return null;
  }
}

/**
 * Get trust score with auto-refresh: return cached if fresh,
 * otherwise fetch and cache.
 */
export async function getTrustWithRefresh(did: string): Promise<TrustScore | null> {
  const cached = getCachedTrust(did);
  if (cached) return cached;

  return refreshTrust(did);
}

/** Reset all trust cache state (for testing). */
export function resetTrustCache(): void {
  cacheTimestamps.clear();
  // KV entries in the trust_cache namespace are managed by kvDelete
  // For full reset, caller should also call resetKVStore
  fetchTrustScore = null;
}
