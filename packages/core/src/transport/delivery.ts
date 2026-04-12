/**
 * D2D message delivery — route to MsgBox relay or direct HTTPS.
 *
 * Delivery decision (from DID document service type):
 *   DinaMsgBox → convert wss:// to https:///forward, POST to relay
 *   DinaDirectHTTPS → POST directly to /msg endpoint
 *
 * Includes: dead drop drain on persona unlock, DID resolution caching.
 *
 * Source: core/test/transport_test.go
 */

export type ServiceType = 'DinaMsgBox' | 'DinaDirectHTTPS';

export interface DeliveryResult {
  delivered: boolean;
  buffered: boolean;
  messageId?: string;
  error?: string;
}

interface CachedResolution {
  type: ServiceType;
  endpoint: string;
  cachedAt: number;
}

const DID_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** In-memory DID → messaging endpoint resolution cache. */
const didCache = new Map<string, CachedResolution>();

/** Injectable fetch function. */
let fetchFn: typeof globalThis.fetch = globalThis.fetch;

/** Injectable DID resolver (for testing/integration). */
let didResolver: ((did: string) => Promise<{ type: ServiceType; endpoint: string } | null>) | null = null;

/** Injectable spool drain handler (for testing/integration). */
let spoolDrainHandler: (() => Promise<number>) | null = null;

/** Clear the DID resolution cache (for testing). */
export function clearDIDCache(): void {
  didCache.clear();
}

/** Get the DID cache size (for testing). */
export function didCacheSize(): number {
  return didCache.size;
}

/** Set the fetch function (for testing). */
export function setDeliveryFetchFn(fn: typeof globalThis.fetch): void {
  fetchFn = fn;
}

/** Set the DID resolver (for testing/integration). */
export function setDIDResolver(resolver: (did: string) => Promise<{ type: ServiceType; endpoint: string } | null>): void {
  didResolver = resolver;
}

/** Set the spool drain handler (for testing/integration). */
export function setSpoolDrainHandler(handler: () => Promise<number>): void {
  spoolDrainHandler = handler;
}

/** Reset all injectable dependencies (for testing). */
export function resetDeliveryDeps(): void {
  fetchFn = globalThis.fetch;
  didResolver = null;
  spoolDrainHandler = null;
}

/**
 * Convert a MsgBox WebSocket URL to the HTTP /forward URL.
 *
 * Matches Go server transport.go:462-471:
 *   wss:// → https://
 *   ws://  → http://
 *   Strip trailing /ws or /
 *   Append /forward
 */
export function msgboxWSToForwardURL(wsURL: string): string {
  let url = wsURL;

  if (url.startsWith('wss://')) {
    url = 'https://' + url.slice(6);
  } else if (url.startsWith('ws://')) {
    url = 'http://' + url.slice(5);
  }

  if (url.endsWith('/ws')) {
    url = url.slice(0, -3);
  }

  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  return url + '/forward';
}

/** Invalidate the DID resolution cache entry for a specific DID. */
export function invalidateDIDCache(did: string): void {
  didCache.delete(did);
}

/** Add a resolution to the DID cache. */
export function cacheDIDResolution(did: string, type: ServiceType, endpoint: string): void {
  didCache.set(did, { type, endpoint, cachedAt: Date.now() });
}

/** Look up a DID in the resolution cache. Returns null if not cached or expired. */
export function lookupDIDCache(did: string, now?: number): { type: ServiceType; endpoint: string } | null {
  const cached = didCache.get(did);
  if (!cached) return null;

  const currentTime = now ?? Date.now();
  if (currentTime - cached.cachedAt > DID_CACHE_TTL_MS) {
    didCache.delete(did);
    return null;
  }

  return { type: cached.type, endpoint: cached.endpoint };
}

/**
 * Deliver a sealed D2D payload to a recipient via their DID service type.
 *
 * DinaMsgBox: convert wss:// → https:///forward, POST with binary body.
 *   MsgBox returns {"status":"delivered"} or {"status":"buffered"}.
 * DinaDirectHTTPS: POST to the endpoint's /msg path with binary body.
 */
export async function deliverMessage(
  recipientDID: string,
  payload: Uint8Array,
  serviceType: ServiceType,
  endpoint: string,
): Promise<DeliveryResult> {
  try {
    if (serviceType === 'DinaMsgBox') {
      const forwardURL = msgboxWSToForwardURL(endpoint);
      const response = await fetchFn(forwardURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: payload,
      });

      if (!response.ok) {
        return { delivered: false, buffered: false, error: `HTTP ${response.status}` };
      }

      const body = await response.json() as Record<string, unknown>;
      const status = body.status as string;

      return {
        delivered: status === 'delivered',
        buffered: status === 'buffered',
        messageId: body.msg_id as string | undefined,
      };
    }

    // DinaDirectHTTPS: POST to /msg
    const msgURL = endpoint.endsWith('/') ? endpoint + 'msg' : endpoint + '/msg';
    const response = await fetchFn(msgURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });

    if (!response.ok) {
      return { delivered: false, buffered: false, error: `HTTP ${response.status}` };
    }

    return { delivered: true, buffered: false };

  } catch (err) {
    return {
      delivered: false,
      buffered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Drain the dead drop spool — process all spooled messages after
 * a persona vault is unlocked.
 *
 * Delegates to the injected spool drain handler.
 * Returns the count of drained messages.
 */
export async function drainDeadDrop(): Promise<number> {
  if (!spoolDrainHandler) return 0;
  return spoolDrainHandler();
}

/**
 * Resolve a DID to its messaging service endpoint.
 *
 * Checks the local cache first (10-min TTL). On cache miss,
 * delegates to the injected DID resolver.
 */
export async function resolveMessagingEndpoint(
  did: string,
): Promise<{ type: ServiceType; endpoint: string } | null> {
  // Check cache first
  const cached = lookupDIDCache(did);
  if (cached) return cached;

  // Delegate to injected resolver
  if (!didResolver) return null;

  const resolved = await didResolver(did);
  if (resolved) {
    cacheDIDResolution(did, resolved.type, resolved.endpoint);
  }
  return resolved;
}
