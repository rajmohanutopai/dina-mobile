/**
 * Bus Driver tool set — the three tools the LLM uses during `/ask` to
 * classify a query as service-answerable and dispatch it.
 *
 *   geocode                    free-text address → {lat, lng}
 *   search_public_services     capability + geo  → ranked service profiles
 *   query_service              operator DID + params → task_id (fire-and-forget)
 *
 * Each tool is a factory returning an `AgentTool`. Factories accept their
 * dependencies (AppView client, orchestrator, injectable fetch) so the
 * tools can be unit-tested against fakes.
 *
 * Source: main-dina `brain/src/service/vault_context.py:VAULT_TOOLS`
 *         (geocode / search_public_services / query_service entries).
 */

import type { AgentTool } from './tool_registry';
import type { AppViewClient, ServiceProfile } from '../appview_client/http';
import type {
  ServiceQueryOrchestrator,
} from '../service/service_query_orchestrator';

// ---------------------------------------------------------------------------
// geocode
// ---------------------------------------------------------------------------

export interface GeocodeToolOptions {
  /** Injectable fetch for tests + custom TLS configs. */
  fetch?: typeof globalThis.fetch;
  /**
   * Nominatim requires a User-Agent with contact info per their usage
   * policy. Default: `dina-mobile/0.0.1 (ops@dinakernel.com)` — callers
   * should override with a real contact on production builds.
   */
  userAgent?: string;
  /** Override endpoint (demo defaults to public Nominatim). */
  endpoint?: string;
  /**
   * Optional rate-limiter ceiling in ms — the tool waits at least this
   * long between calls to respect Nominatim's 1 req/sec rule. Default
   * 1_100 ms.
   */
  minGapMs?: number;
  /**
   * Hard timeout for a single Nominatim HTTP call. Default 10_000 ms.
   * Without this a stalled upstream can hang the whole agentic tool
   * loop because the loop awaits `execute()` synchronously (review
   * #18). On timeout the tool throws a "geocode: timeout" error which
   * the loop catches and returns to the LLM as a tool failure.
   */
  timeoutMs?: number;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
}

const DEFAULT_NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'dina-mobile/0.0.1 (ops@dinakernel.com)';
const DEFAULT_MIN_GAP_MS = 1_100;
const DEFAULT_GEOCODE_TIMEOUT_MS = 10_000;

/**
 * Factory — returns an `AgentTool` that geocodes a free-text address via
 * Nominatim. For production deployments that want offline / commercial
 * providers, swap the body via a different factory while keeping the
 * `geocode` name so the LLM prompt stays stable.
 */
export function createGeocodeTool(options: GeocodeToolOptions = {}): AgentTool {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const endpoint = options.endpoint ?? DEFAULT_NOMINATIM_ENDPOINT;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const minGapMs = options.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GEOCODE_TIMEOUT_MS;
  let lastCallMs = 0;

  return {
    name: 'geocode',
    description:
      'Convert a free-text address, landmark, or place name into latitude + longitude coordinates. Useful when the user mentions a location by name ("Castro, SF", "Saratoga Junction") and a downstream service needs coordinates.',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'The free-text address, landmark, or place name to geocode.',
        },
      },
      required: ['address'],
    },
    async execute(args): Promise<GeocodeResult> {
      const address = String(args.address ?? '');
      if (address === '') throw new Error('geocode: address is required');
      const gap = Date.now() - lastCallMs;
      if (gap < minGapMs) {
        await new Promise((r) => setTimeout(r, minGapMs - gap));
      }
      lastCallMs = Date.now();
      const url = `${endpoint}?q=${encodeURIComponent(address)}&format=jsonv2&limit=1`;
      // Review #18: hard timeout — the agentic loop awaits execute()
      // synchronously, so a stalled Nominatim response would freeze the
      // whole chat turn until the LLM gave up.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let resp: Response;
      try {
        resp = await fetchFn(url, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError' || controller.signal.aborted) {
          throw new Error(`geocode: timeout after ${timeoutMs}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) {
        throw new Error(`geocode: HTTP ${resp.status}`);
      }
      const rows = (await resp.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(`geocode: no result for "${address}"`);
      }
      const top = rows[0];
      const lat = Number(top.lat);
      const lng = Number(top.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('geocode: malformed coordinates in response');
      }
      return {
        lat,
        lng,
        display_name: top.display_name ?? address,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// search_public_services
// ---------------------------------------------------------------------------

export interface SearchPublicServicesToolOptions {
  appViewClient: Pick<AppViewClient, 'searchServices'>;
  /** Cap the number of profiles returned to the LLM. Default 5. */
  resultLimit?: number;
}

/**
 * Factory — returns an `AgentTool` that searches AppView for public
 * services matching a capability and (optionally) geo filter.
 *
 * Returned profiles are trimmed to the fields the LLM needs: DID, name,
 * capabilities list, per-capability schema_hash (so the LLM forwards it
 * on `query_service`), optional distance. Heavy fields (full JSON
 * schemas) are dropped from the LLM result to save tokens.
 */
export function createSearchPublicServicesTool(
  options: SearchPublicServicesToolOptions,
): AgentTool {
  const limit = options.resultLimit ?? 5;
  return {
    name: 'search_public_services',
    description:
      'Find public services on the Dina network that advertise a given capability (e.g. "eta_query" for transit ETAs). Returns a ranked list of service profiles with their DIDs, names, and per-capability schema hashes. Pass lat/lng when the user mentioned a location.',
    parameters: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          description: 'The capability name to search for (e.g. "eta_query", "price_check").',
        },
        lat: { type: 'number', description: 'Optional viewer latitude for proximity ranking.' },
        lng: { type: 'number', description: 'Optional viewer longitude for proximity ranking.' },
        radius_km: { type: 'number', description: 'Optional search radius in kilometres.' },
        q: { type: 'string', description: 'Optional free-text match against service names.' },
      },
      required: ['capability'],
    },
    async execute(args): Promise<Array<{
      did: string;
      name: string;
      capabilities: string[];
      response_policy?: Record<string, 'auto' | 'review'>;
      schema_hashes?: Record<string, string>;
      distance_km?: number;
    }>> {
      const capability = String(args.capability ?? '');
      if (capability === '') throw new Error('search_public_services: capability is required');
      const profiles = await options.appViewClient.searchServices({
        capability,
        lat: typeof args.lat === 'number' ? args.lat : undefined,
        lng: typeof args.lng === 'number' ? args.lng : undefined,
        radiusKm: typeof args.radius_km === 'number' ? args.radius_km : undefined,
        q: typeof args.q === 'string' ? args.q : undefined,
      });
      return profiles.slice(0, limit).map(toLLMProfile);
    },
  };
}

function toLLMProfile(p: ServiceProfile): {
  did: string;
  name: string;
  capabilities: string[];
  response_policy?: Record<string, 'auto' | 'review'>;
  schema_hashes?: Record<string, string>;
  distance_km?: number;
} {
  const schemaHashes: Record<string, string> = {};
  if (p.capabilitySchemas !== undefined) {
    for (const [cap, schema] of Object.entries(p.capabilitySchemas)) {
      if (schema.schemaHash !== undefined && schema.schemaHash !== '') {
        schemaHashes[cap] = schema.schemaHash;
      }
    }
  }
  return {
    did: p.did,
    name: p.name,
    capabilities: p.capabilities,
    response_policy: p.responsePolicy,
    schema_hashes: Object.keys(schemaHashes).length > 0 ? schemaHashes : undefined,
    distance_km: p.distanceKm,
  };
}

// ---------------------------------------------------------------------------
// query_service
// ---------------------------------------------------------------------------

export interface QueryServiceToolOptions {
  orchestrator: Pick<ServiceQueryOrchestrator, 'issueQueryToDID'>;
}

/**
 * Factory — returns an `AgentTool` that dispatches a service query via
 * the orchestrator. Fire-and-forget: the call returns `{task_id, ...}`
 * immediately; the actual response arrives later as a workflow event
 * and is delivered via `WorkflowEventConsumer.deliver` to the chat
 * thread (wired by the bootstrap, D4).
 *
 * The LLM should return a short user-facing ack after this tool ("Asking
 * Bus 42…") and NOT block waiting for the answer.
 */
export function createQueryServiceTool(
  options: QueryServiceToolOptions,
): AgentTool {
  return {
    name: 'query_service',
    description:
      'Send a structured service query to a specific provider DID. Fire-and-forget: returns a task_id immediately; the answer is delivered asynchronously to the chat thread. Use after search_public_services has identified the target.',
    parameters: {
      type: 'object',
      properties: {
        operator_did: {
          type: 'string',
          description: 'The provider DID from search_public_services results.',
        },
        capability: {
          type: 'string',
          description: 'The capability to invoke (e.g. "eta_query").',
        },
        params: {
          type: 'object',
          description: 'Capability-specific parameters. Shape depends on the capability.',
        },
        schema_hash: {
          type: 'string',
          description: 'The per-capability schema hash from search_public_services (forwarded for version safety).',
        },
        service_name: {
          type: 'string',
          description: 'The provider\'s display name from search_public_services (used as the acknowledgement label).',
        },
        ttl_seconds: {
          type: 'number',
          description: 'Optional TTL override. Default comes from the capability registry.',
        },
      },
      required: ['operator_did', 'capability', 'params'],
    },
    async execute(args): Promise<{
      task_id: string;
      query_id: string;
      to_did: string;
      service_name: string;
      deduped: boolean;
      status: 'pending';
    }> {
      const operatorDID = String(args.operator_did ?? '');
      const capability = String(args.capability ?? '');
      if (operatorDID === '' || capability === '') {
        throw new Error('query_service: operator_did and capability are required');
      }
      // Review #12: `params` is declared required by the tool schema
      // and every known capability expects a concrete shape (eta_query
      // needs route_id + location, etc.). Silently substituting {}
      // hid bugs where the LLM called query_service without having
      // ever called geocode → search_public_services first. Fail
      // fast so the loop surfaces a tool error back to the LLM and
      // it retries correctly.
      if (args.params === undefined || args.params === null) {
        throw new Error('query_service: params is required');
      }
      if (typeof args.params !== 'object' || Array.isArray(args.params)) {
        throw new Error('query_service: params must be a JSON object');
      }
      const params = args.params as Record<string, unknown>;
      const schemaHash = typeof args.schema_hash === 'string' ? args.schema_hash : undefined;
      const serviceName = typeof args.service_name === 'string' ? args.service_name : undefined;
      const ttl = typeof args.ttl_seconds === 'number' ? args.ttl_seconds : undefined;
      // Issue #7: dispatch to the EXACT DID + schema_hash the LLM chose
      // (typically from a prior `search_public_services` call). No
      // AppView re-search, no ranker substitution.
      // Issue #14: forward the service_name through so the orchestrator
      // has a human-readable label for ack/formatting instead of
      // falling back to the DID.
      const result = await options.orchestrator.issueQueryToDID({
        toDID: operatorDID,
        capability,
        params,
        ttlSeconds: ttl,
        schemaHash,
        serviceName,
        originChannel: 'ask',
      });
      return {
        task_id: result.taskId,
        query_id: result.queryId,
        to_did: result.toDID,
        service_name: result.serviceName,
        deduped: result.deduped,
        status: 'pending',
      };
    },
  };
}
