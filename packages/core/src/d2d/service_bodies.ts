/**
 * D2D `service.query` / `service.response` body schemas + validators.
 *
 * These messages are ephemeral (never persisted) and bypass the contact gate
 * via a reservation window (see `packages/core/src/service/query_window.ts`).
 * Core treats `params` and `result` as opaque JSON payloads — Brain owns
 * capability-specific schema validation.
 *
 * Field naming: `snake_case` to match the D2D wire format and the rest of the
 * dina-mobile TS surface (e.g. `DinaMessage.created_time`). Callers receive
 * JSON off the wire and validate it directly; we do not introduce a
 * camelCase↔snake_case translation layer.
 *
 * Source:
 *   core/internal/domain/message.go  — ServiceQueryBody / ServiceResponseBody
 *   core/internal/domain/message.go  — ValidateV1Body (service.query / service.response)
 *
 * Wire invariants (enforced here):
 *   - `query_id` non-empty
 *   - `capability` non-empty
 *   - `ttl_seconds` in (0, MAX_SERVICE_TTL]
 *   - response `status` ∈ {"success", "unavailable", "error"}
 *   - future-skew guard on message `created_time` (caller-provided)
 */

import { MAX_SERVICE_TTL } from './families';

/** Valid response statuses on the wire. */
export type ServiceResponseStatus = 'success' | 'unavailable' | 'error';

/**
 * Body of a `service.query` D2D message.
 *
 * `params` is a capability-specific JSON-serialisable value. Core does not
 * inspect its shape — schema validation is the Brain's responsibility (and is
 * gated by `schema_hash` when both sides agree on a published schema).
 */
export interface ServiceQueryBody {
  query_id: string;
  capability: string;
  params: unknown;
  ttl_seconds: number;
  /**
   * Optional SHA-256 of the provider's published capability schema. When both
   * sides supply this field, a mismatch produces an `error` response with
   * `schema_version_mismatch` rather than reaching the capability handler.
   * (Introduced in commit 9b1c4a4.)
   */
  schema_hash?: string;
}

/**
 * Body of a `service.response` D2D message. Sent by the provider back to the
 * requester (or by the requester's Core on behalf of an internal failure).
 */
export interface ServiceResponseBody {
  query_id: string;
  capability: string;
  status: ServiceResponseStatus;
  /** Capability-specific result payload. Present iff `status === 'success'`. */
  result?: unknown;
  /** Human-readable error detail. Present iff `status !== 'success'`. */
  error?: string;
  ttl_seconds: number;
}

const VALID_STATUSES: ReadonlySet<ServiceResponseStatus> = new Set([
  'success',
  'unavailable',
  'error',
]);

/**
 * Validate a `service.query` body. Returns `null` on success, or an error
 * string naming the first violated invariant.
 */
export function validateServiceQueryBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'service.query: body must be a JSON object';
  }
  const b = body as Record<string, unknown>;

  if (typeof b.query_id !== 'string' || b.query_id === '') {
    return 'service.query: query_id is required';
  }
  if (typeof b.capability !== 'string' || b.capability === '') {
    return 'service.query: capability is required';
  }
  if (b.params === undefined || b.params === null) {
    return 'service.query: params is required';
  }
  if (typeof b.ttl_seconds !== 'number' || !Number.isFinite(b.ttl_seconds)) {
    return 'service.query: ttl_seconds is required and must be a number';
  }
  if (b.ttl_seconds <= 0 || b.ttl_seconds > MAX_SERVICE_TTL) {
    return `service.query: ttl_seconds must be 1-${MAX_SERVICE_TTL}, got ${b.ttl_seconds}`;
  }
  if (b.schema_hash !== undefined && typeof b.schema_hash !== 'string') {
    return 'service.query: schema_hash must be a string when present';
  }
  return null;
}

/**
 * Validate a `service.response` body. Returns `null` on success, or an error
 * string naming the first violated invariant.
 */
export function validateServiceResponseBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'service.response: body must be a JSON object';
  }
  const b = body as Record<string, unknown>;

  if (typeof b.query_id !== 'string' || b.query_id === '') {
    return 'service.response: query_id is required';
  }
  if (typeof b.capability !== 'string' || b.capability === '') {
    return 'service.response: capability is required';
  }
  if (typeof b.status !== 'string' || b.status === '') {
    return 'service.response: status is required';
  }
  if (!VALID_STATUSES.has(b.status as ServiceResponseStatus)) {
    return `service.response: status must be success|unavailable|error, got "${b.status}"`;
  }
  if (typeof b.ttl_seconds !== 'number' || !Number.isFinite(b.ttl_seconds)) {
    return 'service.response: ttl_seconds is required and must be a number';
  }
  if (b.ttl_seconds <= 0 || b.ttl_seconds > MAX_SERVICE_TTL) {
    return `service.response: ttl_seconds must be 1-${MAX_SERVICE_TTL}, got ${b.ttl_seconds}`;
  }
  return null;
}

/**
 * Future-skew guard. Rejects messages whose `created_time` is more than
 * `max_skew_seconds` in the future, which would otherwise allow a sender to
 * extend the effective freshness window by lying about the send time.
 *
 * `created_time` is Unix seconds (matches the D2D wire format).
 */
export function validateFutureSkew(
  created_time: number,
  now_unix: number,
  max_skew_seconds = 60,
): string | null {
  if (!Number.isFinite(created_time)) {
    return 'created_time must be a finite number';
  }
  if (created_time > now_unix + max_skew_seconds) {
    return `created_time is ${created_time - now_unix}s in the future (max skew ${max_skew_seconds}s)`;
  }
  return null;
}
