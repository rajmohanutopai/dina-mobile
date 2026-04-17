/**
 * Requester-side orchestrator for public-service queries.
 *
 * Invariants:
 *   - Core's `workflow_tasks` table owns lifecycle (queued → running →
 *     completed/failed/cancelled). No in-memory pending map.
 *   - Core's workflow sweeper expires tasks whose `expires_at` elapses.
 *     No periodic orchestrator-side timeout loop.
 *   - `issueQuery` returns immediately with `{queryId, taskId, toDID,
 *     serviceName, deduped}`. The response lands asynchronously as a
 *     `workflow_event(completed)` on the service_query task; the
 *     `WorkflowEventConsumer` formats + delivers it to chat.
 *
 * Pipeline: AppView search → rank candidates → `coreClient.sendServiceQuery`.
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  AppViewClient,
  SearchServicesParams,
} from '../appview_client/http';
import type {
  BrainCoreClient,
  SendServiceQueryResult,
} from '../core_client/http';
import {
  pickTopCandidate,
  type Location,
  type RankOptions,
} from './candidate_ranker';
import { getTTL } from './capabilities/registry';

/** Minimal subset of `BrainCoreClient` the orchestrator needs. */
export type OrchestratorCoreClient = Pick<BrainCoreClient, 'sendServiceQuery'>;

/** Minimal subset of `AppViewClient` the orchestrator needs. */
export type OrchestratorAppView = Pick<AppViewClient, 'searchServices'>;

/** Inputs to `issueQuery`. */
export interface IssueQueryRequest {
  capability: string;
  params: unknown;
  /** Override the capability default TTL (seconds). */
  ttlSeconds?: number;
  /** Requester location — used for ranking + AppView geo search. */
  viewer?: Location;
  /** Radius for AppView geo search (km). Default 5. */
  radiusKm?: number;
  /** Free-text match — passed through to AppView. */
  q?: string;
  /** Per-candidate lat/lng resolver for the ranker. */
  coordsOf?: RankOptions['coordsOf'];
  /** Tag for telemetry — e.g. "chat", "scheduled". */
  originChannel?: string;
}

/**
 * Synchronous outcome of `issueQuery`. Note this is the **dispatch** result,
 * not the response — the response arrives later via a workflow event.
 */
export interface IssueQueryResult {
  queryId: string;
  taskId: string;
  toDID: string;
  serviceName: string;
  /** True when Core returned an existing live task for the same idem key. */
  deduped: boolean;
}

/** Options for `ServiceQueryOrchestrator`. */
export interface OrchestratorOptions {
  appViewClient: OrchestratorAppView;
  coreClient: OrchestratorCoreClient;
  /** Injectable query-id generator for deterministic tests. */
  generateQueryId?: () => string;
}

/**
 * Structured errors surfaced when the orchestrator fails before Core has
 * accepted the query. Once Core owns the task, failures arrive through the
 * Guardian event path.
 */
export class ServiceOrchestratorError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'capability_required'
      | 'params_required'
      | 'no_candidate'
      | 'send_failed',
  ) {
    super(message);
    this.name = 'ServiceOrchestratorError';
  }
}

/**
 * Thin Phase-2 orchestrator. One instance per brain process is plenty —
 * there is no per-query state.
 */
export class ServiceQueryOrchestrator {
  private readonly appView: OrchestratorAppView;
  private readonly core: OrchestratorCoreClient;
  private readonly generateQueryId: () => string;

  constructor(options: OrchestratorOptions) {
    if (!options.appViewClient) {
      throw new Error('ServiceQueryOrchestrator: appViewClient is required');
    }
    if (!options.coreClient) {
      throw new Error('ServiceQueryOrchestrator: coreClient is required');
    }
    this.appView = options.appViewClient;
    this.core = options.coreClient;
    this.generateQueryId = options.generateQueryId ?? defaultQueryId;
  }

  /**
   * Search AppView, pick the top candidate, hand off to Core. Returns
   * immediately with the dispatch identifiers. Response delivery is
   * Guardian's responsibility.
   *
   * Throws `ServiceOrchestratorError` for pre-send failures (no
   * candidate, send failed). Post-send failures (provider unavailable,
   * TTL expired, capability errored) surface via the workflow event and
   * never raise here.
   */
  async issueQuery(req: IssueQueryRequest): Promise<IssueQueryResult> {
    if (!req.capability) {
      throw new ServiceOrchestratorError(
        'capability is required',
        'capability_required',
      );
    }
    if (req.params === undefined || req.params === null) {
      throw new ServiceOrchestratorError(
        'params is required',
        'params_required',
      );
    }

    const ttlSeconds = this.pickTtl(req);

    const searchParams: SearchServicesParams = {
      capability: req.capability,
      lat: req.viewer?.lat,
      lng: req.viewer?.lng,
      radiusKm: req.radiusKm,
      q: req.q,
    };
    const services = await this.appView.searchServices(searchParams);

    const top = pickTopCandidate(req.capability, services, {
      viewer: req.viewer,
      coordsOf: req.coordsOf,
    });
    if (top === null) {
      throw new ServiceOrchestratorError(
        `no service advertises "${req.capability}"`,
        'no_candidate',
      );
    }

    const queryId = this.generateQueryId();
    const schemaHash = top.profile.capabilitySchemas?.[req.capability]?.schemaHash;

    let sendResult: SendServiceQueryResult;
    try {
      sendResult = await this.core.sendServiceQuery({
        toDID: top.profile.did,
        capability: req.capability,
        params: req.params,
        queryId,
        ttlSeconds,
        serviceName: top.profile.name,
        originChannel: req.originChannel,
        schemaHash: schemaHash !== '' ? schemaHash : undefined,
      });
    } catch (err) {
      throw new ServiceOrchestratorError(
        `failed to send service.query: ${(err as Error).message ?? String(err)}`,
        'send_failed',
      );
    }

    return {
      queryId: sendResult.queryId || queryId,
      taskId: sendResult.taskId,
      toDID: top.profile.did,
      serviceName: top.profile.name,
      deduped: sendResult.deduped,
    };
  }

  private pickTtl(req: IssueQueryRequest): number {
    if (
      typeof req.ttlSeconds === 'number' &&
      Number.isFinite(req.ttlSeconds) &&
      req.ttlSeconds > 0
    ) {
      return req.ttlSeconds;
    }
    return getTTL(req.capability);
  }
}

/** Default query-id: 16-byte hex. Matches existing dina-mobile conventions. */
function defaultQueryId(): string {
  return bytesToHex(randomBytes(16));
}
