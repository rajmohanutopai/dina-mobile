/**
 * Brain's HTTP client for calling Core — Ed25519 signed, with retry.
 *
 * Retry: 3x exponential (1s, 2s, 4s). Non-retryable: 401, 403.
 * Timeout: 30s. Request-ID propagation for audit correlation.
 * PII scrub on outbound vault queries.
 *
 * Source: brain/tests/test_core_client.py
 */

import { signRequest } from '../../../core/src/auth/canonical';
import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { REQUEST_TIMEOUT_MS, STAGING_MAX_RETRIES, VAULT_QUERY_DEFAULT_LIMIT } from '../../../core/src/constants';
import { isNonRetryableStatus, backoff, parseResponseBody } from '../../../core/src/transport/http_retry';
import {
  validateServiceConfig,
  type ServiceConfig,
} from '../../../core/src/service/service_config';
import type { WorkflowTask, WorkflowEvent } from '../../../core/src/workflow/domain';
import { CircuitBreaker, CircuitBreakerOpenError } from './circuit_breaker';

export { CircuitBreakerOpenError };
export type { ServiceConfig, WorkflowTask, WorkflowEvent };

/** Result shape for `sendServiceQuery`. */
export interface SendServiceQueryResult {
  taskId: string;
  queryId: string;
  /** True when Core returned an existing live task for the same idem key. */
  deduped: boolean;
}

/** Result shape for `sendServiceRespond`. */
export interface SendServiceRespondResult {
  status: string;
  taskId: string;
  alreadyProcessed: boolean;
}

/**
 * Structured conflict on workflow-task mutation (duplicate id, duplicate
 * idempotency_key, …). Mirrors the server's `WorkflowConflictError.code`.
 */
export class WorkflowConflictError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'WorkflowConflictError';
  }
}

/**
 * Structured error for non-accept HTTP statuses. Exposes `status` so
 * callers can branch on HTTP code without string-matching the message
 * (CORE-P4-F03). The human-readable `message` is still populated for
 * logs.
 */
export class CoreHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
    readonly method: string,
  ) {
    super(message);
    this.name = 'CoreHttpError';
  }
}

/** Raise a typed error when the response status is outside the accept set. */
function throwForStatus(
  method: string,
  result: { status: number; body: unknown },
  accept: number[] = [200],
): void {
  if (accept.includes(result.status)) return;
  const detail = (result.body as { error?: string })?.error ?? '';
  throw new CoreHttpError(
    `${method}: HTTP ${result.status}${detail ? ` — ${detail}` : ''}`,
    result.status,
    detail,
    method,
  );
}

/**
 * In-process dispatch — used when Core runs in the same JS runtime
 * (dina-mobile RN app). When supplied, `signedRequest` calls this
 * function directly instead of going through `fetch(url, ...)`. The
 * signed canonical + header set are identical; only the wire disappears.
 */
export type SignedDispatch = (
  method: string,
  path: string,
  headers: Record<string, string>,
  body: Uint8Array,
) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;

export interface BrainCoreClientConfig {
  /** Base URL for HTTP mode. Ignored when `signedDispatch` is set. */
  coreURL: string;
  privateKey: Uint8Array;
  did: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;  // injectable for testing
  /**
   * Optional in-process dispatcher. When provided, HTTP is bypassed —
   * requests go directly to the CoreRouter via `createInProcessDispatch`.
   * This is the mobile path (Expo managed, no http.Server).
   */
  signedDispatch?: SignedDispatch;
  /** Circuit breaker failure threshold (default: 5). */
  circuitBreakerThreshold?: number;
  /** Circuit breaker cooldown in ms (default: 30000). */
  circuitBreakerCooldownMs?: number;
}

export class BrainCoreClient {
  private readonly coreURL: string;
  private readonly privateKey: Uint8Array;
  private readonly did: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly signedDispatch: SignedDispatch | null;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(config: BrainCoreClientConfig) {
    if (!config.signedDispatch) {
      // HTTP mode — coreURL is mandatory.
      if (!config.coreURL) throw new Error('coreURL is required (omit when signedDispatch is supplied)');
    }
    if (!config.did) throw new Error('did is required');

    this.coreURL = (config.coreURL ?? '').replace(/\/$/, '');
    this.privateKey = config.privateKey;
    this.did = config.did;
    this.timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? STAGING_MAX_RETRIES;
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.signedDispatch = config.signedDispatch ?? null;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: config.circuitBreakerThreshold,
      cooldownMs: config.circuitBreakerCooldownMs,
    });
  }

  /** Get the circuit breaker status (for health monitoring). */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /** Read a vault item from Core. */
  async readVaultItem(persona: string, itemId: string): Promise<unknown> {
    const result = await this.signedRequest('GET', `/v1/vault/item/${encodeURIComponent(itemId)}?persona=${encodeURIComponent(persona)}`);
    return result.body;
  }

  /** Write a vault item to Core. */
  async writeVaultItem(persona: string, item: unknown): Promise<string> {
    const result = await this.signedRequest('POST', `/v1/vault/store?persona=${encodeURIComponent(persona)}`, item);
    return (result.body as { id: string }).id;
  }

  /** Search vault via Core. */
  async searchVault(persona: string, query: string, limit?: number): Promise<unknown[]> {
    const body = { text: query, mode: 'fts5', limit: limit ?? VAULT_QUERY_DEFAULT_LIMIT };
    const result = await this.signedRequest('POST', `/v1/vault/query?persona=${encodeURIComponent(persona)}`, body);
    return (result.body as { items: unknown[] }).items ?? [];
  }

  /** Write to scratchpad (multi-step reasoning checkpoint). */
  async writeScratchpad(taskId: string, step: number, context: unknown): Promise<void> {
    await this.signedRequest('POST', '/v1/scratchpad', { taskId, step, context });
  }

  /** Read from scratchpad. */
  async readScratchpad(taskId: string): Promise<{ step: number; context: unknown } | null> {
    const result = await this.signedRequest('GET', `/v1/scratchpad/${encodeURIComponent(taskId)}`);
    if (result.status === 404) return null;
    return result.body as { step: number; context: unknown };
  }

  /**
   * Claim staging items from Core for processing.
   *
   * POST /v1/staging/claim?limit=N → atomically moves items
   * from received→classifying with a 15-minute lease.
   */
  async claimStagingItems(limit: number = 10): Promise<unknown[]> {
    const result = await this.signedRequest('POST', `/v1/staging/claim?limit=${limit}`);
    return (result.body as { items: unknown[] }).items ?? [];
  }

  /** Resolve a staging item — store in vault or mark pending_unlock. */
  async resolveStagingItem(itemId: string, persona: string, data: unknown): Promise<unknown> {
    const result = await this.signedRequest('POST', '/v1/staging/resolve', {
      id: itemId, persona, data,
    });
    return result.body;
  }

  /** Fail a staging item — increment retry count. */
  async failStagingItem(itemId: string, reason: string): Promise<void> {
    await this.signedRequest('POST', '/v1/staging/fail', { id: itemId, reason });
  }

  /** Extend the lease on a staging item. */
  async extendStagingLease(itemId: string, seconds: number): Promise<void> {
    await this.signedRequest('POST', '/v1/staging/extend-lease', { id: itemId, seconds });
  }

  /** Send a D2D message via Core. */
  async sendMessage(recipientDID: string, messageType: string, body: unknown): Promise<void> {
    await this.signedRequest('POST', '/v1/msg/send', {
      recipient_did: recipientDID,
      type: messageType,
      body,
    });
  }

  /** PII scrub via Core's Tier 1 scrubber. */
  async piiScrub(text: string): Promise<{ scrubbed: string; entities: unknown[] }> {
    const result = await this.signedRequest('POST', '/v1/pii/scrub', { text });
    return result.body as { scrubbed: string; entities: unknown[] };
  }

  /**
   * Read the current local service configuration from Core.
   * Returns `null` when Core has no config set (HTTP 404).
   *
   * Source: `GET /v1/service/config` (commit f3a1bc7).
   */
  async getServiceConfig(): Promise<ServiceConfig | null> {
    const result = await this.signedRequest('GET', '/v1/service/config');
    if (result.status === 404) return null;
    if (result.status !== 200) {
      throw new Error(`getServiceConfig: unexpected status ${result.status}`);
    }
    // Validate the boundary — Core is trusted but a malformed response (e.g.
    // missing `capabilities` due to a future schema change) should surface as
    // a precise error, not as a downstream TypeError.
    try {
      validateServiceConfig(result.body);
    } catch (err) {
      throw new Error(
        `getServiceConfig: response failed validation — ${(err as Error).message}`,
      );
    }
    return result.body;
  }

  /**
   * Upsert the local service configuration in Core. Core will validate and
   * notify subscribers (`config_changed`) on success.
   *
   * Source: `PUT /v1/service/config` (commit f3a1bc7).
   */
  async putServiceConfig(config: ServiceConfig): Promise<void> {
    const result = await this.signedRequest('PUT', '/v1/service/config', config);
    if (result.status !== 200) {
      const detail = (result.body as { error?: string })?.error ?? '';
      throw new Error(
        `putServiceConfig: HTTP ${result.status}${detail ? ` — ${detail}` : ''}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // BRAIN-P2-AA — service-endpoint adapters
  // -------------------------------------------------------------------------

  /**
   * POST /v1/service/query — create a durable service-query workflow task
   * and send the D2D. Core returns `{task_id, query_id}` (plus `deduped`
   * on idempotent retry).
   */
  async sendServiceQuery(req: {
    toDID: string;
    capability: string;
    params: unknown;
    queryId: string;
    ttlSeconds: number;
    serviceName?: string;
    originChannel?: string;
    schemaHash?: string;
  }): Promise<SendServiceQueryResult> {
    const body: Record<string, unknown> = {
      to_did: req.toDID,
      capability: req.capability,
      params: req.params,
      query_id: req.queryId,
      ttl_seconds: req.ttlSeconds,
    };
    if (req.serviceName !== undefined) body.service_name = req.serviceName;
    if (req.originChannel !== undefined) body.origin_channel = req.originChannel;
    if (req.schemaHash !== undefined) body.schema_hash = req.schemaHash;
    const result = await this.signedRequest('POST', '/v1/service/query', body);
    throwForStatus('sendServiceQuery', result);
    const r = result.body as Record<string, unknown>;
    return {
      taskId: String(r.task_id ?? ''),
      queryId: String(r.query_id ?? ''),
      deduped: r.deduped === true,
    };
  }

  /**
   * POST /v1/service/respond — tell Core to send a `service.response` for
   * an approved approval task. Handles the atomic claim + send + complete
   * in a single call.
   *
   * Returns `{status, taskId, alreadyProcessed?}`.
   */
  async sendServiceRespond(
    taskId: string,
    responseBody: {
      status: 'success' | 'unavailable' | 'error';
      result?: unknown;
      error?: string;
    },
  ): Promise<SendServiceRespondResult> {
    const result = await this.signedRequest('POST', '/v1/service/respond', {
      task_id: taskId,
      response_body: responseBody,
    });
    throwForStatus('sendServiceRespond', result);
    const r = result.body as Record<string, unknown>;
    return {
      status: String(r.status ?? ''),
      taskId: String(r.task_id ?? taskId),
      alreadyProcessed: r.already_processed === true,
    };
  }

  /**
   * POST /v1/workflow/tasks — create a workflow task of any kind. Returns
   * the stored task (including `deduped: true` when a retry matches a live
   * idempotency_key).
   *
   * Throws `WorkflowConflictError` on 409 so callers can match on `code`
   * rather than parse error strings.
   */
  async createWorkflowTask(input: {
    id: string;
    kind: string;
    description: string;
    payload: string;
    expiresAtSec?: number;
    correlationId?: string;
    parentId?: string;
    proposalId?: string;
    priority?: string;
    origin?: string;
    sessionName?: string;
    idempotencyKey?: string;
    policy?: string;
    /**
     * Seed the task in a non-default state (e.g. `pending_approval` for
     * review-policy approval tasks). Server validates against
     * `isValidInitialState`.
     */
    initialState?: string;
  }): Promise<{ task: WorkflowTask; deduped: boolean }> {
    const body: Record<string, unknown> = {
      id: input.id,
      kind: input.kind,
      description: input.description,
      payload: input.payload,
    };
    if (input.expiresAtSec !== undefined) body.expires_at = input.expiresAtSec;
    if (input.correlationId !== undefined) body.correlation_id = input.correlationId;
    if (input.parentId !== undefined) body.parent_id = input.parentId;
    if (input.proposalId !== undefined) body.proposal_id = input.proposalId;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.origin !== undefined) body.origin = input.origin;
    if (input.sessionName !== undefined) body.session_name = input.sessionName;
    if (input.idempotencyKey !== undefined) body.idempotency_key = input.idempotencyKey;
    if (input.policy !== undefined) body.policy = input.policy;
    if (input.initialState !== undefined) body.initial_state = input.initialState;

    const result = await this.signedRequest('POST', '/v1/workflow/tasks', body);
    if (result.status === 409) {
      const r = result.body as { error?: string; code?: string };
      throw new WorkflowConflictError(
        r.error ?? 'workflow conflict',
        typeof r.code === 'string' ? r.code : 'duplicate_id',
      );
    }
    throwForStatus('createWorkflowTask', result, [200, 201]);
    const r = result.body as Record<string, unknown>;
    return {
      task: r.task as WorkflowTask,
      deduped: r.deduped === true,
    };
  }

  /** POST /v1/workflow/tasks/:id/approve */
  async approveWorkflowTask(id: string): Promise<WorkflowTask> {
    return this.workflowAction(id, 'approve');
  }

  /** POST /v1/workflow/tasks/:id/cancel */
  async cancelWorkflowTask(id: string, reason = ''): Promise<WorkflowTask> {
    return this.workflowAction(id, 'cancel', reason !== '' ? { reason } : undefined);
  }

  /** POST /v1/workflow/tasks/:id/complete */
  async completeWorkflowTask(
    id: string,
    result: string,
    resultSummary: string,
    agentDID = '',
  ): Promise<WorkflowTask> {
    return this.workflowAction(id, 'complete', {
      result,
      result_summary: resultSummary,
      ...(agentDID !== '' ? { agent_did: agentDID } : {}),
    });
  }

  /** POST /v1/workflow/tasks/:id/fail */
  async failWorkflowTask(
    id: string,
    errorMsg: string,
    agentDID = '',
  ): Promise<WorkflowTask> {
    return this.workflowAction(id, 'fail', {
      error: errorMsg,
      ...(agentDID !== '' ? { agent_did: agentDID } : {}),
    });
  }

  /**
   * GET /v1/workflow/tasks?kind=&state=&limit= — list tasks filtered by
   * kind + state. Both are required; `limit` defaults 100 / caps 500.
   */
  async listWorkflowTasks(params: {
    kind: string;
    state: string;
    limit?: number;
  }): Promise<WorkflowTask[]> {
    const qs = new URLSearchParams();
    qs.set('kind', params.kind);
    qs.set('state', params.state);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const result = await this.signedRequest('GET', `/v1/workflow/tasks?${qs.toString()}`);
    throwForStatus('listWorkflowTasks', result);
    const r = result.body as { tasks?: WorkflowTask[] };
    return Array.isArray(r.tasks) ? r.tasks : [];
  }

  /** GET /v1/workflow/tasks/:id — returns `null` on 404. */
  async getWorkflowTask(id: string): Promise<WorkflowTask | null> {
    const result = await this.signedRequest(
      'GET',
      `/v1/workflow/tasks/${encodeURIComponent(id)}`,
    );
    if (result.status === 404) return null;
    throwForStatus('getWorkflowTask', result);
    const r = result.body as { task?: WorkflowTask };
    return r.task ?? null;
  }

  /** Shared POST driver for approve / cancel / complete / fail. */
  private async workflowAction(
    id: string,
    action: 'approve' | 'cancel' | 'complete' | 'fail',
    body?: Record<string, unknown>,
  ): Promise<WorkflowTask> {
    const result = await this.signedRequest(
      'POST',
      `/v1/workflow/tasks/${encodeURIComponent(id)}/${action}`,
      body ?? {},
    );
    throwForStatus(`${action}WorkflowTask`, result);
    const r = result.body as { task?: WorkflowTask };
    if (!r.task) {
      throw new Error(`${action}WorkflowTask: response missing task`);
    }
    return r.task;
  }

  /**
   * GET /v1/workflow/events?since=&limit=&needs_delivery= — returns workflow
   * events the delivery scheduler hasn't retired yet. Used by the Guardian
   * consumer to fan `service_query` completions into the chat thread.
   */
  async listWorkflowEvents(params: {
    since?: number;
    limit?: number;
    needsDeliveryOnly?: boolean;
  } = {}): Promise<WorkflowEvent[]> {
    const qs = new URLSearchParams();
    if (params.since !== undefined) qs.set('since', String(params.since));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.needsDeliveryOnly === true) qs.set('needs_delivery', 'true');
    const suffix = qs.toString();
    const path = suffix === '' ? '/v1/workflow/events' : `/v1/workflow/events?${suffix}`;
    const result = await this.signedRequest('GET', path);
    throwForStatus('listWorkflowEvents', result);
    const r = result.body as { events?: WorkflowEvent[] };
    return Array.isArray(r.events) ? r.events : [];
  }

  /**
   * POST /v1/workflow/events/:id/ack — mark an event as acknowledged so the
   * delivery scheduler retires it. Returns `true` on 200, `false` on 404.
   */
  async acknowledgeWorkflowEvent(eventId: number): Promise<boolean> {
    const result = await this.signedRequest(
      'POST',
      `/v1/workflow/events/${eventId}/ack`,
      {},
    );
    if (result.status === 404) return false;
    throwForStatus('acknowledgeWorkflowEvent', result);
    return true;
  }

  /** Check if Core is reachable. */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.signedRequest('GET', '/healthz');
      return result.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Send a signed request to Core with retry semantics.
   *
   * Signs each attempt fresh (nonce + timestamp must be unique).
   * Retries on 5xx and connection errors. Fails immediately on 401/403.
   */
  /** Set an external requestId for audit trail correlation. */
  private externalRequestId: string | null = null;

  /** Bind a request ID from an external trace (e.g., chat reasoning trace). */
  setRequestId(requestId: string | null): void {
    this.externalRequestId = requestId;
  }

  private async signedRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    // Circuit breaker wraps the entire retry loop
    return this.circuitBreaker.execute(() => this.signedRequestInner(method, path, body));
  }

  private async signedRequestInner(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const bodyStr = body !== undefined ? JSON.stringify(body) : '';
    const bodyBytes = new TextEncoder().encode(bodyStr);
    const requestId = this.externalRequestId ?? `req-${bytesToHex(randomBytes(8))}`;

    // In-process fast path — no retries, no circuit-breaker loop. The
    // CoreRouter is synchronous in-memory; a failure here is a handler
    // bug, not a flaky network.
    if (this.signedDispatch !== null) {
      const authHeaders = signRequest(method, path, '', bodyBytes, this.privateKey, this.did);
      const headers: Record<string, string> = {
        ...authHeaders,
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      };
      const result = await this.signedDispatch(method, path, headers, bodyBytes);
      if (isNonRetryableStatus(result.status)) {
        throw new Error(
          `BrainCoreClient: HTTP ${result.status} — ${
            typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? '')
          }`,
        );
      }
      return { status: result.status, body: result.body };
    }

    // HTTP path — existing retry + circuit-breaker logic.
    const url = `${this.coreURL}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const authHeaders = signRequest(method, path, '', bodyBytes, this.privateKey, this.did);

      const headers: Record<string, string> = {
        ...authHeaders,
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      };

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await this.fetchFn(url, {
          method,
          headers,
          body: bodyStr || undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (isNonRetryableStatus(response.status)) {
          const text = await response.text();
          throw new Error(`BrainCoreClient: HTTP ${response.status} — ${text}`);
        }

        if (response.status >= 500) {
          lastError = new Error(`BrainCoreClient: HTTP ${response.status}`);
          if (attempt < this.maxRetries) {
            await backoff(attempt);
            continue;
          }
          throw lastError;
        }

        const respBody = await parseResponseBody(response);
        return { status: response.status, body: respBody };

      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Non-retryable errors (401/403) propagate immediately
        if (error.message.includes('HTTP 401') || error.message.includes('HTTP 403')) {
          throw error;
        }

        lastError = error;

        if (attempt < this.maxRetries) {
          await backoff(attempt);
          continue;
        }
      }
    }

    throw lastError ?? new Error('BrainCoreClient: request failed');
  }

  // parseBody and backoff extracted to core/transport/http_retry.ts
}
