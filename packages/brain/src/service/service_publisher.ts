/**
 * Service Publisher — publishes `com.dina.service.profile` to the PDS.
 *
 * The service profile is the public face of this home node's capability
 * offering. Requesters find this record via the AppView's index
 * (`com.dina.service.search`) which ingests it.
 *
 * The publisher is **idempotent** at every edge:
 *   - `publish()` uses `putRecord` with a fixed rkey (`self`), so repeat
 *     calls overwrite in place rather than creating duplicates.
 *   - `unpublish()` uses `deleteRecordIdempotent`, so calling it when no
 *     record exists is a no-op.
 *   - `sync(config)` dispatches between the two based on `config.isPublic`
 *     and tolerates transitions between states without bespoke glue.
 *
 * Security: before every write the publisher verifies that the PDS session
 * DID matches the caller-supplied `expectedDID`. This prevents accidentally
 * publishing a home node's profile under the wrong identity (e.g. when app
 * passwords get mixed across accounts).
 *
 * Source: brain/src/service/service_publisher.py  (Python reference)
 */

import type { PDSPublisher, PutRecordResult } from '../pds/publisher';

/** AT-Proto NSID collection the profile record is published under. */
export const SERVICE_PROFILE_COLLECTION = 'com.dina.service.profile';
/** Stable record key — one profile per account, key = 'self'. */
export const SERVICE_PROFILE_RKEY = 'self';

/** A JSON Schema + its published hash, per capability. */
export interface PublishedCapabilitySchema {
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  schemaHash: string;
}

/** Minimum shape the publisher needs from the service config. */
export interface ServicePublisherConfig {
  isPublic: boolean;
  name: string;
  description?: string;
  /** Capability names advertised in this profile. */
  capabilities: string[];
  /** Per-capability response policy ("auto" | "review"). */
  responsePolicy?: Record<string, 'auto' | 'review'>;
  /** Per-capability JSON Schemas. Added in commit 9b1c4a4. */
  capabilitySchemas?: Record<string, PublishedCapabilitySchema>;
}

/** Options for `ServicePublisher`. */
export interface ServicePublisherOptions {
  /** PDS-facing adapter. */
  pds: PDSPublisher;
  /**
   * DID that **must** match the PDS session DID before any write.
   * Typically the Home Node's identity DID from Core. A mismatch throws
   * `PublisherIdentityMismatchError`.
   */
  expectedDID: string;
  /** Injectable clock for `updatedAt` timestamp generation. */
  nowFn?: () => number;
}

/**
 * Thrown when the PDS session DID does not match the caller-supplied
 * `expectedDID`. The write is refused before leaving the process.
 */
export class PublisherIdentityMismatchError extends Error {
  constructor(readonly expectedDID: string, readonly actualDID: string | null) {
    super(
      `PDS session DID (${actualDID ?? 'null'}) does not match expectedDID (${expectedDID})`,
    );
    this.name = 'PublisherIdentityMismatchError';
  }
}

/**
 * Thrown when the supplied config fails structural validation (e.g. empty
 * `name`). The caller is responsible for ensuring the config is well-formed;
 * we nonetheless do a last-mile check so a bad config never reaches PDS.
 */
export class PublisherConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublisherConfigError';
  }
}

export class ServicePublisher {
  private readonly pds: PDSPublisher;
  private readonly expectedDID: string;
  private readonly nowFn: () => number;

  constructor(options: ServicePublisherOptions) {
    if (!options.pds) throw new Error('ServicePublisher: pds is required');
    if (!options.expectedDID) {
      throw new Error('ServicePublisher: expectedDID is required');
    }
    this.pds = options.pds;
    this.expectedDID = options.expectedDID;
    this.nowFn = options.nowFn ?? Date.now;
  }

  /**
   * Upsert the service-profile record for `config`.
   * Returns the `{uri, cid}` reported by the PDS.
   *
   * Identity is verified **before** the write so that a credential mismatch
   * never results in a record landing in the wrong repo.
   */
  async publish(config: ServicePublisherConfig): Promise<PutRecordResult> {
    validateConfig(config);
    await this.verifyIdentity();
    const record = buildRecord(config, this.nowFn());
    return this.pds.putRecord(
      SERVICE_PROFILE_COLLECTION,
      SERVICE_PROFILE_RKEY,
      record,
    );
  }

  /**
   * Remove the published profile. Safe to call when nothing is published.
   * Identity is verified before any write.
   */
  async unpublish(): Promise<void> {
    await this.verifyIdentity();
    await this.pds.deleteRecordIdempotent(
      SERVICE_PROFILE_COLLECTION,
      SERVICE_PROFILE_RKEY,
    );
  }

  /**
   * Dispatch between `publish` and `unpublish` based on `config.isPublic`.
   * This is the method to wire into the config-changed event.
   *
   * Returns `{published: true, result}` after a publish, `{published: false}`
   * after an unpublish.
   */
  async sync(
    config: ServicePublisherConfig,
  ): Promise<{ published: true; result: PutRecordResult } | { published: false }> {
    if (config.isPublic) {
      const result = await this.publish(config);
      return { published: true, result };
    }
    await this.unpublish();
    return { published: false };
  }

  // -------------------------------------------------------------------------

  /**
   * Pre-write identity check: force a PDS session and compare the
   * authenticated DID against `expectedDID`. Throws before any data leaves
   * the process if the PDS account doesn't belong to this home node.
   */
  private async verifyIdentity(): Promise<void> {
    const actual = await this.pds.authenticate();
    if (actual !== this.expectedDID) {
      throw new PublisherIdentityMismatchError(this.expectedDID, actual);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Build the `com.dina.service.profile` record shape from the publisher's
 * config input. Returns a plain JSON-serialisable object that PDS XRPC will
 * accept without further transformation.
 *
 * The shape mirrors the Python reference:
 *   {
 *     "$type": "com.dina.service.profile",
 *     "name": ..., "description"?: ...,
 *     "capabilities": [...],
 *     "responsePolicy": {cap: "auto"|"review", ...},
 *     "capabilitySchemas"?: {cap: {params, result, schemaHash}, ...},
 *     "isPublic": true,
 *     "updatedAt": "ISO-8601-Z"
 *   }
 */
export function buildRecord(
  config: ServicePublisherConfig,
  nowMs: number,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    $type: SERVICE_PROFILE_COLLECTION,
    name: config.name,
    capabilities: [...config.capabilities],
    isPublic: config.isPublic,
    updatedAt: new Date(nowMs).toISOString(),
  };
  if (config.description !== undefined && config.description !== '') {
    record.description = config.description;
  }
  if (config.responsePolicy !== undefined && Object.keys(config.responsePolicy).length > 0) {
    record.responsePolicy = { ...config.responsePolicy };
  }
  if (
    config.capabilitySchemas !== undefined &&
    Object.keys(config.capabilitySchemas).length > 0
  ) {
    record.capabilitySchemas = serialiseSchemas(config.capabilitySchemas);
  }
  return record;
}

function serialiseSchemas(
  schemas: Record<string, PublishedCapabilitySchema>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [cap, s] of Object.entries(schemas)) {
    out[cap] = {
      params: s.params,
      result: s.result,
      schemaHash: s.schemaHash,
    };
  }
  return out;
}

function validateConfig(config: ServicePublisherConfig): void {
  if (typeof config.isPublic !== 'boolean') {
    throw new PublisherConfigError('config.isPublic must be a boolean');
  }
  if (typeof config.name !== 'string' || config.name === '') {
    throw new PublisherConfigError('config.name is required');
  }
  if (!Array.isArray(config.capabilities)) {
    throw new PublisherConfigError('config.capabilities must be an array');
  }
  for (const cap of config.capabilities) {
    if (typeof cap !== 'string' || cap === '') {
      throw new PublisherConfigError(
        'config.capabilities must contain non-empty strings',
      );
    }
  }
}
