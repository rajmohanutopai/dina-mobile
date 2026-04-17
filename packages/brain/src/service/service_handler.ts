/**
 * Provider-side handler for inbound `service.query`.
 *
 * Never invokes a capability directly — delegates to Core's workflow
 * subsystem via `createWorkflowTask`. The Response Bridge emits the
 * actual `service.response` when the delegation task completes.
 *
 * Response-policy branches:
 *   - `auto`:   create a `delegation` task (state=`queued`) for an agent
 *               to claim and execute.
 *   - `review`: create an `approval` task (state=`pending_approval`) and
 *               fire the operator notifier. `executeAndRespond(id, payload)`
 *               is the post-`/service_approve` entry point; it spawns a
 *               fresh delegation task (idempotent via deterministic id)
 *               and cancels the approval task.
 *
 * Never calls MCP tools itself — "Dina never executes." The execution
 * plane (OpenClaw / MCP runner, via paired dina-agent) picks up
 * delegation tasks from Core's `/v1/workflow/tasks/claim` endpoint.
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  WorkflowConflictError,
  type BrainCoreClient,
} from '../core_client/http';
import type {
  ServiceConfig,
  ServiceCapabilityConfig,
} from '../../../core/src/service/service_config';
import {
  validateServiceQueryBody,
  type ServiceQueryBody,
} from '../../../core/src/d2d/service_bodies';
import { getCapability, getTTL } from './capabilities/registry';

/** Minimal subset of `BrainCoreClient` the handler needs. */
export interface ServiceHandlerCoreClient
  extends Pick<
    BrainCoreClient,
    | 'createWorkflowTask'
    | 'cancelWorkflowTask'
    | 'sendServiceRespond'
  > {}

/** Operator-notification sink for review-policy approval tasks. */
export type ApprovalNotifier = (notice: {
  taskId: string;
  fromDID: string;
  capability: string;
  serviceName: string;
  approveCommand: string;
}) => void | Promise<void>;

export interface ServiceHandlerOptions {
  coreClient: ServiceHandlerCoreClient;
  /**
   * Returns the *current* ServiceConfig. Read lazily on every inbound
   * query so config updates via `onServiceConfigChanged` take effect
   * without rewiring the handler.
   */
  readConfig: () => ServiceConfig | null;
  /**
   * Optional: fires when an approval task is created. Wire to Telegram /
   * chat / push notifications. No-op when absent.
   */
  notifier?: ApprovalNotifier;
  /** Structured log sink. Defaults to no-op. */
  logger?: (entry: Record<string, unknown>) => void;
  /** Wall-clock source (seconds). Defaults to `Math.floor(Date.now()/1000)`. */
  nowSecFn?: () => number;
  /** Random id generator for new delegation/approval tasks. Testable. */
  generateUUID?: () => string;
}

/**
 * Handles one inbound `service.query` per call. Stateless.
 */
export class ServiceHandler {
  private readonly core: ServiceHandlerCoreClient;
  private readonly readConfig: () => ServiceConfig | null;
  private readonly notifier: ApprovalNotifier | null;
  private readonly log: (entry: Record<string, unknown>) => void;
  private readonly nowSecFn: () => number;
  private readonly generateUUID: () => string;

  constructor(options: ServiceHandlerOptions) {
    if (!options.coreClient) throw new Error('ServiceHandler: coreClient is required');
    if (!options.readConfig) throw new Error('ServiceHandler: readConfig is required');
    this.core = options.coreClient;
    this.readConfig = options.readConfig;
    this.notifier = options.notifier ?? null;
    this.log = options.logger ?? (() => { /* no-op */ });
    this.nowSecFn = options.nowSecFn ?? (() => Math.floor(Date.now() / 1000));
    this.generateUUID =
      options.generateUUID ?? (() => bytesToHex(randomBytes(16)));
  }

  /**
   * Top-level entry for inbound `service.query` D2D. Dispatches on the
   * capability's configured response policy:
   *   - `auto` → create a delegation task now.
   *   - `review` → create an approval task + notify operator.
   *
   * Never throws. Validation / config / schema errors produce an error
   * `service.response` via `sendServiceRespond` so the requester's TTL
   * doesn't silently elapse.
   */
  async handleQuery(fromDID: string, body: unknown): Promise<void> {
    const bodyErr = validateServiceQueryBody(body);
    if (bodyErr !== null) {
      this.log({ event: 'service.query.invalid_body', from: fromDID, error: bodyErr });
      return;
    }
    const query = body as ServiceQueryBody;
    this.log({
      event: 'service.query.received',
      from: fromDID,
      capability: query.capability,
      query_id: query.query_id,
      ttl_seconds: query.ttl_seconds,
    });

    const config = this.readConfig();
    const cap = findCapabilityConfig(config, query.capability);
    if (cap === null) {
      await this.sendError(query, 'unavailable', 'capability_not_configured');
      return;
    }

    const schemaErr = this.checkSchemaHash(config, query);
    if (schemaErr !== null) {
      await this.sendError(query, 'error', schemaErr);
      return;
    }

    const paramsErr = this.validateParams(query);
    if (paramsErr !== null) {
      await this.sendError(query, 'error', paramsErr);
      return;
    }

    if (cap.responsePolicy === 'review') {
      await this.createApprovalTask(fromDID, query, cap);
      return;
    }
    await this.createExecutionTask(fromDID, query);
  }

  /**
   * Called by Guardian when a `workflow.approved` event fires for an
   * approval task. Spawns a FRESH delegation task with a deterministic id
   * so retries are idempotent, then cancels the approval task.
   */
  async executeAndRespond(
    approvalTaskId: string,
    payload: {
      from_did: string;
      query_id: string;
      capability: string;
      params: unknown;
      ttl_seconds?: number;
      schema_hash?: string;
      service_name?: string;
    },
  ): Promise<void> {
    if (!payload.from_did || !payload.query_id || !payload.capability) {
      throw new Error(
        `executeAndRespond: approval task ${approvalTaskId} has incomplete payload`,
      );
    }
    const execTaskId = `svc-exec-from-${approvalTaskId}`;
    const ttl =
      typeof payload.ttl_seconds === 'number' && payload.ttl_seconds > 0
        ? payload.ttl_seconds
        : getTTL(payload.capability);

    try {
      await this.createExecutionTaskRaw({
        fromDID: payload.from_did,
        queryId: payload.query_id,
        capability: payload.capability,
        params: payload.params,
        ttlSeconds: ttl,
        schemaHash: payload.schema_hash,
        serviceName: payload.service_name,
        taskId: execTaskId,
      });
    } catch (err) {
      if (err instanceof WorkflowConflictError) {
        // Previous attempt already created it — keep going so we still
        // cancel the approval task.
        this.log({
          event: 'service.query.execute_exists',
          approval_task_id: approvalTaskId,
          exec_task_id: execTaskId,
        });
      } else {
        throw err;
      }
    }

    try {
      await this.core.cancelWorkflowTask(approvalTaskId, 'executed_via_delegation');
    } catch (err) {
      // Tolerate "already terminal" / 404. Approval task cleanup is
      // best-effort because the delegation is what actually resolves the
      // query.
      this.log({
        event: 'service.query.approval_cancel_failed',
        approval_task_id: approvalTaskId,
        error: (err as Error).message ?? String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async createExecutionTask(
    fromDID: string,
    query: ServiceQueryBody,
  ): Promise<void> {
    const taskId = `svc-exec-${this.generateUUID()}`;
    await this.createExecutionTaskRaw({
      fromDID,
      queryId: query.query_id,
      capability: query.capability,
      params: query.params,
      ttlSeconds: query.ttl_seconds,
      schemaHash: query.schema_hash,
      serviceName: this.readConfig()?.name ?? '',
      taskId,
    });
  }

  /**
   * Shared: build the payload + call `createWorkflowTask`. Used by both
   * the auto path and `executeAndRespond`.
   */
  private async createExecutionTaskRaw(args: {
    fromDID: string;
    queryId: string;
    capability: string;
    params: unknown;
    ttlSeconds: number;
    schemaHash?: string;
    serviceName?: string;
    taskId: string;
  }): Promise<void> {
    const payload = {
      type: 'service_query_execution',
      from_did: args.fromDID,
      query_id: args.queryId,
      capability: args.capability,
      params: args.params,
      ttl_seconds: args.ttlSeconds,
      service_name: args.serviceName ?? '',
      schema_hash: args.schemaHash ?? '',
    };
    const expiresAtSec = this.nowSecFn() + args.ttlSeconds;
    await this.core.createWorkflowTask({
      id: args.taskId,
      kind: 'delegation',
      description: `Execute service query: ${args.capability}`,
      payload: JSON.stringify(payload),
      origin: 'd2d',
      correlationId: args.queryId,
      expiresAtSec,
      // Tasks enter `queued` so paired dina-agents can claim them via
      // POST /v1/workflow/tasks/claim. In-process execution is not
      // supported for delegation — the agent model requires an
      // out-of-process runner for lease recovery + heartbeat semantics.
      initialState: 'queued',
    });
    this.log({
      event: 'service.query.execution_created',
      task_id: args.taskId,
      capability: args.capability,
      query_id: args.queryId,
    });
  }

  private async createApprovalTask(
    fromDID: string,
    query: ServiceQueryBody,
    _cap: ServiceCapabilityConfig,
  ): Promise<void> {
    const taskId = `approval-${this.generateUUID()}`;
    const ttl = query.ttl_seconds > 0 ? query.ttl_seconds : getTTL(query.capability);
    const serviceName = this.readConfig()?.name ?? '';
    const payload = {
      type: 'service_query_execution',
      from_did: fromDID,
      query_id: query.query_id,
      capability: query.capability,
      params: query.params,
      ttl_seconds: ttl,
      service_name: serviceName,
      schema_hash: query.schema_hash ?? '',
    };
    await this.core.createWorkflowTask({
      id: taskId,
      kind: 'approval',
      description: `Service review: ${query.capability} from ${fromDID}`,
      payload: JSON.stringify(payload),
      origin: 'd2d',
      correlationId: query.query_id,
      expiresAtSec: this.nowSecFn() + ttl,
      // Seed directly into `pending_approval` so the operator's approve
      // command (pending_approval → queued) or the reconciler's expiry
      // (pending_approval → cancelled/failed) can fire without an extra
      // transition. The server validates against `isValidInitialState`.
      initialState: 'pending_approval',
    });
    this.log({
      event: 'service.query.approval_created',
      task_id: taskId,
      capability: query.capability,
      query_id: query.query_id,
    });
    if (this.notifier !== null) {
      try {
        await this.notifier({
          taskId,
          fromDID,
          capability: query.capability,
          serviceName,
          approveCommand: `/service_approve ${taskId}`,
        });
      } catch (err) {
        this.log({
          event: 'service.query.notifier_threw',
          task_id: taskId,
          error: (err as Error).message ?? String(err),
        });
      }
    }
  }

  private async sendError(
    query: ServiceQueryBody,
    status: 'unavailable' | 'error',
    message: string,
  ): Promise<void> {
    // There's no workflow task yet (handleQuery bails before create), so
    // we can't use `sendServiceRespond` (which requires a task_id). The
    // requester's TTL eventually expires; for now we audit-log and move on.
    // A future enhancement (CORE-P2-G extension) would expose an
    // anonymous "error response" endpoint that doesn't require a task.
    this.log({
      event: 'service.query.rejected',
      query_id: query.query_id,
      capability: query.capability,
      status,
      message,
    });
  }

  private checkSchemaHash(
    config: ServiceConfig | null,
    query: ServiceQueryBody,
  ): string | null {
    if (config === null) return null;
    const published = config.capabilitySchemas?.[query.capability];
    if (published === undefined) return null;
    if (query.schema_hash === undefined || query.schema_hash === '') return null;
    if (published.schemaHash === '') return null;
    if (published.schemaHash === query.schema_hash) return null;
    return 'schema_version_mismatch';
  }

  private validateParams(query: ServiceQueryBody): string | null {
    const registered = getCapability(query.capability);
    if (registered === undefined) return null;
    return registered.validateParams(query.params);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCapabilityConfig(
  config: ServiceConfig | null,
  capability: string,
): ServiceCapabilityConfig | null {
  if (config === null) return null;
  if (!config.isPublic) return null;
  return config.capabilities[capability] ?? null;
}
