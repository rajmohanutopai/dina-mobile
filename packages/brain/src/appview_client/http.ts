/**
 * Brain's HTTP client for the AppView service discovery API.
 *
 * This is the **requester-side** surface. The provider side publishes records
 * via PDS (`packages/brain/src/pds/publisher.ts`); the requester reads the
 * indexed view via AppView:
 *
 *   GET /xrpc/com.dina.service.search    — find services by capability + geo
 *   GET /xrpc/com.dina.service.isPublic  — check whether a DID is public
 *
 * The Core-side `AppViewServiceResolver` (`packages/core/src/appview/`) exists
 * for egress-gate bypass decisions and caches `isPublic` results. It is a
 * separate role — Core's resolver is a policy input for D2D sending, while
 * this client drives ranked discovery for LLM tools and Brain orchestration.
 *
 * Retry: 3× exponential backoff on 5xx (reuses `core/src/transport/http_retry`).
 * Non-retryable 4xx (other than 408/429) bubble up as `AppViewError`.
 * Timeout per attempt: 10 s default (matches Python reference `httpx.AsyncClient(timeout=10)`).
 *
 * Source: brain/src/adapter/appview_client.py
 */

import {
  backoff,
  isRetryableStatus,
  parseResponseBody,
} from '../../../core/src/transport/http_retry';

/** Retryable client-side response statuses beyond 5xx. */
const RETRYABLE_4XX = new Set([408, 429]);

/** Default per-attempt timeout (ms). Mirrors Python `httpx.AsyncClient(timeout=10)`. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Default max retries. Mirrors Brain's `STAGING_MAX_RETRIES`. */
const DEFAULT_MAX_RETRIES = 3;

/**
 * One service profile entry from `com.dina.service.search` results.
 * Field naming is camelCase — this matches AppView's lexicon on the wire.
 */
export interface ServiceProfile {
  did: string;
  handle?: string;
  name: string;
  description?: string;
  capabilities: string[];
  responsePolicy?: Record<string, 'auto' | 'review'>;
  isPublic: boolean;
  /** Published schemas, one per capability. Added in commit 9b1c4a4. */
  capabilitySchemas?: Record<
    string,
    { params: Record<string, unknown>; result: Record<string, unknown>; schemaHash: string }
  >;
  /** Distance in km from the query location, if the query supplied lat/lng. */
  distanceKm?: number;
}

/** Parameters for `searchServices`. */
export interface SearchServicesParams {
  capability: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  /** Free-text match against service name/description. */
  q?: string;
  /** Maximum results returned. AppView caps this at 50 today. */
  limit?: number;
}

/** Result of `isPublic`. */
export interface IsPublicResult {
  isPublic: boolean;
  capabilities: string[];
}

/** Configuration for `AppViewClient`. */
export interface AppViewClientOptions {
  /** Base URL of the AppView (trailing slash stripped). */
  appViewURL: string;
  /** Per-attempt request timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** Maximum retries on transient failure. Default 3. */
  maxRetries?: number;
  /** Injectable `fetch`. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /**
   * Injectable sleep for retry backoff — tests override to skip real waits.
   * Must honour the standard `backoff(attempt)` signature (attempt 0-indexed).
   */
  sleepFn?: (attemptZeroIndexed: number) => Promise<void>;
}

/** Structured error raised for every non-success terminal outcome. */
export class AppViewError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly path: string,
  ) {
    super(message);
    this.name = 'AppViewError';
  }
}

/**
 * Read-only AppView client. Safe to share across callers — no mutable state
 * beyond the injected `fetch`.
 */
export class AppViewClient {
  private readonly appViewURL: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly sleepFn: (attempt: number) => Promise<void>;

  constructor(options: AppViewClientOptions) {
    if (!options.appViewURL) {
      throw new Error('AppViewClient: appViewURL is required');
    }
    this.appViewURL = options.appViewURL.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.sleepFn = options.sleepFn ?? backoff;
    if (this.timeoutMs <= 0) {
      throw new Error(`AppViewClient: timeoutMs must be > 0 (got ${this.timeoutMs})`);
    }
    if (this.maxRetries < 0) {
      throw new Error(`AppViewClient: maxRetries must be ≥ 0 (got ${this.maxRetries})`);
    }
  }

  /**
   * Search for public services by capability (optionally scoped by geo).
   * Returns the `services` array, ordered by trust + proximity as AppView
   * decides. An empty list means "no matches" (not an error).
   *
   * Throws `AppViewError` on HTTP failure past the retry budget.
   */
  async searchServices(params: SearchServicesParams): Promise<ServiceProfile[]> {
    if (!params.capability) {
      throw new AppViewError(
        'searchServices: capability is required',
        null,
        '/xrpc/com.dina.service.search',
      );
    }
    const query: Record<string, string> = { capability: params.capability };
    if (params.lat !== undefined) query.lat = String(params.lat);
    if (params.lng !== undefined) query.lng = String(params.lng);
    if (params.radiusKm !== undefined) query.radiusKm = String(params.radiusKm);
    if (params.q !== undefined && params.q !== '') query.q = params.q;
    if (params.limit !== undefined) query.limit = String(params.limit);

    const body = await this.get('/xrpc/com.dina.service.search', query);
    const services = (body as { services?: unknown }).services;
    if (!Array.isArray(services)) return [];
    return services.filter((s): s is ServiceProfile => isServiceProfile(s));
  }

  /**
   * Check whether a DID is registered as a public service, and list its
   * advertised capabilities. Matches Python `is_public` tuple return as an
   * object for ergonomic destructuring: `const {isPublic, capabilities} = …`.
   */
  async isPublic(did: string): Promise<IsPublicResult> {
    if (!did) {
      throw new AppViewError(
        'isPublic: did is required',
        null,
        '/xrpc/com.dina.service.isPublic',
      );
    }
    const body = await this.get('/xrpc/com.dina.service.isPublic', { did });
    const r = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    return {
      isPublic: typeof r.isPublic === 'boolean' ? r.isPublic : false,
      capabilities: Array.isArray(r.capabilities)
        ? r.capabilities.filter((c): c is string => typeof c === 'string')
        : [],
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async get(path: string, query: Record<string, string>): Promise<unknown> {
    const qs = new URLSearchParams(query).toString();
    const url = `${this.appViewURL}${path}${qs ? '?' + qs : ''}`;

    let lastError: AppViewError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
      } catch (err) {
        lastError = new AppViewError(
          `network error: ${(err as Error).message}`,
          null,
          path,
        );
        if (attempt < this.maxRetries) {
          await this.sleepFn(attempt);
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 200) {
        return parseResponseBody(response);
      }

      const retryable = isRetryableStatus(response.status) || RETRYABLE_4XX.has(response.status);
      lastError = new AppViewError(
        `AppView responded ${response.status}`,
        response.status,
        path,
      );
      if (retryable && attempt < this.maxRetries) {
        await this.sleepFn(attempt);
        continue;
      }
      throw lastError;
    }
    // Unreachable — loop either returns or throws.
    throw lastError ?? new AppViewError('AppView: retries exhausted', null, path);
  }
}

function isServiceProfile(x: unknown): x is ServiceProfile {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.did === 'string' &&
    typeof r.name === 'string' &&
    Array.isArray(r.capabilities) &&
    r.capabilities.every(c => typeof c === 'string') &&
    typeof r.isPublic === 'boolean'
  );
}
