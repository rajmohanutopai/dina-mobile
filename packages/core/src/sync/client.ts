/**
 * Device sync — initial checkpoint, realtime push, offline queue,
 * local cache, corruption recovery, authenticated-only, QR pairing.
 *
 * Rich clients (paired devices) sync vault state from the home node.
 * Data flows: home → rich client (push/pull), never client → home.
 *
 * Thin clients (Web UI, dina-cli) have no local cache — they stream
 * directly. searchLocalCache returns empty for thin clients.
 *
 * Source: tests/integration/test_client_sync.py
 */

export interface SyncItem {
  id: string;
  type: string;
  data: unknown;
  checkpoint: number;
}

/** In-memory sync state. */
const syncStore: SyncItem[] = [];
const offlineQueues = new Map<string, unknown[]>();
const connectedDevices = new Set<string>();
const authenticatedDevices = new Set<string>();
let cacheCorrupted = false;

/** Reset all sync state (for testing). */
export function resetSyncState(): void {
  syncStore.length = 0;
  offlineQueues.clear();
  connectedDevices.clear();
  authenticatedDevices.clear();
  cacheCorrupted = false;
}

/** Register a device as authenticated (after QR pairing). */
export function registerDevice(deviceId: string): void {
  authenticatedDevices.add(deviceId);
}

/** Mark a device as connected (WebSocket active). */
export function connectDevice(deviceId: string): void {
  connectedDevices.add(deviceId);
}

/** Mark a device as disconnected. */
export function disconnectDevice(deviceId: string): void {
  connectedDevices.delete(deviceId);
}

/** Add an item to the sync store (for testing/integration). */
export function addSyncItem(item: SyncItem): void {
  syncStore.push(item);
}

/** Simulate cache corruption (for testing). */
export function corruptCache(): void {
  cacheCorrupted = true;
}

/**
 * Sync from home node at a checkpoint.
 *
 * Returns all items with checkpoint > given value, plus the new
 * highest checkpoint for the client to store.
 * Checkpoint 0 = initial full sync.
 */
export async function syncFromCheckpoint(
  checkpoint: number,
): Promise<{ items: unknown[]; newCheckpoint: number }> {
  const items = syncStore.filter(item => item.checkpoint > checkpoint);
  const newCheckpoint = items.length > 0
    ? Math.max(...items.map(i => i.checkpoint))
    : checkpoint;

  return { items, newCheckpoint };
}

/**
 * Push new data to a connected rich client in real time.
 *
 * Returns true if the device is connected and data was pushed.
 * If the device is offline, data is queued for later flush.
 */
export async function pushToClient(deviceId: string, data: unknown): Promise<boolean> {
  if (!authenticatedDevices.has(deviceId)) {
    return false;
  }

  if (connectedDevices.has(deviceId)) {
    return true;
  }

  // Device offline — queue for later
  let queue = offlineQueues.get(deviceId);
  if (!queue) {
    queue = [];
    offlineQueues.set(deviceId, queue);
  }
  queue.push(data);
  return false;
}

/**
 * Flush offline queue for a device on reconnect.
 *
 * Returns the count of items flushed. Clears the queue.
 */
export async function flushOfflineQueue(deviceId: string): Promise<number> {
  const queue = offlineQueues.get(deviceId);
  if (!queue || queue.length === 0) return 0;

  const count = queue.length;
  offlineQueues.delete(deviceId);
  return count;
}

/**
 * Search local cache when offline.
 *
 * Rich clients maintain a local cache of synced vault items.
 * Thin clients have no cache — returns empty array.
 * Returns matching items from the sync store.
 */
export function searchLocalCache(query: string): unknown[] {
  if (cacheCorrupted) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return [];

  return syncStore.filter(item => {
    const text = JSON.stringify(item.data).toLowerCase();
    return terms.some(term => text.includes(term));
  });
}

/**
 * Detect and recover from corrupted local cache.
 *
 * If corruption is detected, clears the cache and returns true
 * (indicating the caller should trigger a full re-sync from checkpoint 0).
 * Returns false if cache is healthy.
 */
export async function recoverCorruptedCache(): Promise<boolean> {
  if (!cacheCorrupted) return false;

  // Clear corrupted data
  syncStore.length = 0;
  cacheCorrupted = false;
  return true;
}

/**
 * Check if a device connection is authenticated.
 *
 * Only paired devices (with registered Ed25519 public key) are authenticated.
 * Unauthenticated devices receive nothing.
 */
export function isAuthenticated(deviceId: string): boolean {
  return authenticatedDevices.has(deviceId);
}
