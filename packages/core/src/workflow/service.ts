/**
 * Workflow business-logic layer.
 *
 * Sits on top of the `WorkflowRepository` (pure storage). The service owns:
 *   - Input validation (kind/origin/priority shape-checks).
 *   - Transition validation (`isValidTransition` guard before each state change).
 *   - Event fan-out on lifecycle changes.
 *   - Timestamp injection (seconds for `expires_at`, ms for `created_at` /
 *     `updated_at` — see `repository.ts` for the unit contract).
 *
 * Handlers call the service, not the repository directly.
 *
 * Source: `core/internal/service/workflow.go` (commit 9c01611+).
 */

import {
  AllowedOrigins,
  WorkflowTaskKind,
  WorkflowTaskPriority,
  WorkflowTaskState,
  isValidTransition,
  type WorkflowEvent,
  type WorkflowTask,
} from './domain';
import {
  WorkflowConflictError,
  type WorkflowRepository,
} from './repository';

/** Input for `WorkflowService.create`. */
export interface CreateWorkflowTaskInput {
  id: string;
  kind: string;
  description: string;
  /** JSON-encoded payload. Shape is kind-specific. */
  payload: string;
  /** Unix SECONDS. Null/undefined = no expiry. */
  expiresAtSec?: number;
  correlationId?: string;
  parentId?: string;
  proposalId?: string;
  priority?: string;
  origin?: string;
  sessionName?: string;
  idempotencyKey?: string;
  /** JSON-encoded policy blob. Optional. */
  policy?: string;
  /** Initial state. Defaults to `created`. */
  initialState?: WorkflowTaskState;
}

/** Structured error surfaces raised by the service. */
export class WorkflowValidationError extends Error {
  constructor(message: string, readonly field: string) {
    super(message);
    this.name = 'WorkflowValidationError';
  }
}

export class WorkflowTransitionError extends Error {
  constructor(
    message: string,
    readonly from: WorkflowTaskState,
    readonly to: WorkflowTaskState,
  ) {
    super(message);
    this.name = 'WorkflowTransitionError';
  }
}

/**
 * Payload shape the Response Bridge receives when a delegation task whose
 * payload.type is `service_query_execution` reaches `completed`. Matches
 * the fields `ServiceHandler.createExecutionTaskRaw` persists (see
 * `brain/src/service/service_handler.ts`).
 */
export interface ServiceQueryBridgeContext {
  taskId: string;
  fromDID: string;
  queryId: string;
  capability: string;
  ttlSeconds: number;
  /** JSON string — the task's `result` column as stored by `complete`. */
  resultJSON: string;
  serviceName: string;
}

/**
 * Callback fired from `WorkflowService.complete` when a delegation task
 * with `payload.type === 'service_query_execution'` finishes. The bridge
 * synthesises a `service.response` D2D and hands it to Core's egress —
 * keeping Brain agnostic of the response wire format.
 *
 * Best-effort: errors are isolated so a faulty sender never rolls back
 * the completion. The completion has already landed when this fires.
 *
 * Source: BUS_DRIVER_IMPLEMENTATION.md CORE-P3-I01 / I02.
 */
export type ResponseBridgeSender = (
  ctx: ServiceQueryBridgeContext,
) => Promise<void> | void;

/** `getWorkflowService` returns null when no repo is wired. */
export interface WorkflowServiceOptions {
  repository: WorkflowRepository;
  /** Returns current ms. Defaults to `Date.now`. */
  nowMsFn?: () => number;
  /**
   * Optional Response Bridge. When set, `complete()` invokes this after a
   * delegation task with `payload.type === 'service_query_execution'` lands
   * so the D2D `service.response` can be emitted. Null/absent = bridging
   * skipped.
   */
  responseBridgeSender?: ResponseBridgeSender | null;
}

const VALID_KINDS = new Set<string>([
  WorkflowTaskKind.Delegation,
  WorkflowTaskKind.Approval,
  WorkflowTaskKind.ServiceQuery,
  WorkflowTaskKind.Timer,
  WorkflowTaskKind.Watch,
  WorkflowTaskKind.Generic,
]);

const VALID_PRIORITIES = new Set<string>([
  WorkflowTaskPriority.UserBlocking,
  WorkflowTaskPriority.Normal,
  WorkflowTaskPriority.Background,
]);

const VALID_ORIGINS = new Set<string>(AllowedOrigins);

export class WorkflowService {
  private readonly repo: WorkflowRepository;
  private readonly nowMsFn: () => number;
  private readonly responseBridgeSender: ResponseBridgeSender | null;

  constructor(options: WorkflowServiceOptions) {
    if (!options.repository) {
      throw new Error('WorkflowService: repository is required');
    }
    this.repo = options.repository;
    this.nowMsFn = options.nowMsFn ?? Date.now;
    this.responseBridgeSender = options.responseBridgeSender ?? null;
  }

  /** Expose the underlying repository for callers that need read access (e.g. sweepers). */
  store(): WorkflowRepository {
    return this.repo;
  }

  /**
   * Validate, create, and emit a `created` event for a new task.
   * Idempotency is enforced by the repository via the partial unique index;
   * duplicates raise `WorkflowConflictError`.
   */
  create(input: CreateWorkflowTaskInput): WorkflowTask {
    this.validateInput(input);

    const nowMs = this.nowMsFn();
    const task: WorkflowTask = {
      id: input.id,
      kind: input.kind,
      status: input.initialState ?? WorkflowTaskState.Created,
      priority: input.priority ?? WorkflowTaskPriority.Normal,
      description: input.description,
      payload: input.payload,
      result_summary: '',
      policy: input.policy ?? '{}',
      correlation_id: input.correlationId,
      parent_id: input.parentId,
      proposal_id: input.proposalId,
      origin: input.origin ?? '',
      session_name: input.sessionName,
      idempotency_key: input.idempotencyKey,
      expires_at: input.expiresAtSec,
      created_at: nowMs,
      updated_at: nowMs,
    };
    this.repo.create(task);

    // Emit the `created` event. Needs delivery so Brain can observe new
    // tasks (e.g. approval tasks that need operator attention).
    this.repo.appendEvent({
      task_id: task.id,
      at: nowMs,
      event_kind: 'created',
      needs_delivery: true,
      delivery_attempts: 0,
      delivery_failed: false,
      details: JSON.stringify({
        kind: task.kind,
        state: task.status,
        correlation_id: task.correlation_id ?? '',
      }),
    });
    return task;
  }

  /**
   * Approve a task that's waiting for operator review. Moves
   * `pending_approval → queued` and emits an `approved` event whose
   * `details` embed the task payload so Brain can kick off execution
   * without an extra roundtrip.
   */
  approve(id: string): WorkflowTask {
    const task = this.repo.getById(id);
    if (task === null) {
      throw new WorkflowValidationError(`task "${id}" not found`, 'id');
    }
    this.guardTransition(
      task.status as WorkflowTaskState,
      WorkflowTaskState.Queued,
    );
    const nowMs = this.nowMsFn();
    const moved = this.repo.transition(
      id,
      WorkflowTaskState.PendingApproval,
      WorkflowTaskState.Queued,
      nowMs,
    );
    if (!moved) {
      // Either someone else transitioned first, or it was never in
      // pending_approval. Surface as a transition error with current state.
      const fresh = this.repo.getById(id);
      throw new WorkflowTransitionError(
        `task "${id}" cannot be approved from state ${fresh?.status ?? 'unknown'}`,
        (fresh?.status ?? task.status) as WorkflowTaskState,
        WorkflowTaskState.Queued,
      );
    }
    this.repo.appendEvent({
      task_id: id,
      at: nowMs,
      event_kind: 'approved',
      needs_delivery: true,
      delivery_attempts: 0,
      delivery_failed: false,
      details: JSON.stringify({
        task_payload: task.payload,
        kind: task.kind,
      }),
    });
    const updated = this.repo.getById(id);
    return updated ?? task;
  }

  /**
   * Transition a task to `completed`, attach result + summary, emit the
   * `completed` event. Requires the task to be in an active (non-terminal)
   * state.
   */
  complete(
    id: string,
    resultJSON: string,
    resultSummary: string,
    agentDID = '',
  ): WorkflowTask {
    const task = this.repo.getById(id);
    if (task === null) {
      throw new WorkflowValidationError(`task "${id}" not found`, 'id');
    }
    this.guardTransition(
      task.status as WorkflowTaskState,
      WorkflowTaskState.Completed,
    );
    const eventId = this.repo.completeWithDetails(
      id,
      agentDID,
      resultSummary,
      resultJSON,
      JSON.stringify({ state: 'completed' }),
      this.nowMsFn(),
    );
    if (eventId === 0) {
      throw new WorkflowTransitionError(
        `task "${id}" was terminal before completion landed`,
        task.status as WorkflowTaskState,
        WorkflowTaskState.Completed,
      );
    }
    const updated = this.repo.getById(id);
    this.bridgeServiceQueryCompletion(updated ?? task, resultJSON);
    return updated ?? task;
  }

  /**
   * Fire the Response Bridge if the completed task is a service-query
   * delegation. No-op when the bridge isn't wired, the task isn't a
   * delegation, or the payload isn't JSON / lacks the expected type.
   * Best-effort: errors are isolated so the completion caller isn't
   * rolled back by a faulty sender.
   */
  private bridgeServiceQueryCompletion(task: WorkflowTask, resultJSON: string): void {
    const send = this.responseBridgeSender;
    if (send === null) return;
    if (task.kind !== WorkflowTaskKind.Delegation) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(task.payload) as Record<string, unknown>;
    } catch {
      return;
    }
    if (payload.type !== 'service_query_execution') return;
    const fromDID = typeof payload.from_did === 'string' ? payload.from_did : '';
    const queryId = typeof payload.query_id === 'string' ? payload.query_id : '';
    const capability = typeof payload.capability === 'string' ? payload.capability : '';
    if (fromDID === '' || queryId === '' || capability === '') return;
    const ttlSeconds =
      typeof payload.ttl_seconds === 'number' && Number.isFinite(payload.ttl_seconds)
        ? payload.ttl_seconds
        : 60;
    const serviceName = typeof payload.service_name === 'string' ? payload.service_name : '';
    try {
      const ret = send({
        taskId: task.id,
        fromDID,
        queryId,
        capability,
        ttlSeconds,
        resultJSON,
        serviceName,
      });
      if (ret instanceof Promise) {
        ret.catch(() => { /* swallow — bridge failures are non-fatal */ });
      }
    } catch {
      // Non-fatal — completion has already landed.
    }
  }

  /** Mark a task as failed with a reason. */
  fail(id: string, errorMsg: string, agentDID = ''): WorkflowTask {
    const task = this.repo.getById(id);
    if (task === null) {
      throw new WorkflowValidationError(`task "${id}" not found`, 'id');
    }
    this.guardTransition(
      task.status as WorkflowTaskState,
      WorkflowTaskState.Failed,
    );
    const eventId = this.repo.fail(id, agentDID, errorMsg, this.nowMsFn());
    if (eventId === 0) {
      throw new WorkflowTransitionError(
        `task "${id}" was terminal before failure landed`,
        task.status as WorkflowTaskState,
        WorkflowTaskState.Failed,
      );
    }
    const updated = this.repo.getById(id);
    return updated ?? task;
  }

  /**
   * Cancel an active task. No-op on already-terminal tasks (throws
   * `WorkflowTransitionError` so callers see the reason).
   */
  cancel(id: string, reason: string): WorkflowTask {
    const task = this.repo.getById(id);
    if (task === null) {
      throw new WorkflowValidationError(`task "${id}" not found`, 'id');
    }
    this.guardTransition(
      task.status as WorkflowTaskState,
      WorkflowTaskState.Cancelled,
    );
    const eventId = this.repo.cancel(id, reason, this.nowMsFn());
    if (eventId === 0) {
      throw new WorkflowTransitionError(
        `task "${id}" was terminal before cancel landed`,
        task.status as WorkflowTaskState,
        WorkflowTaskState.Cancelled,
      );
    }
    const updated = this.repo.getById(id);
    return updated ?? task;
  }

  /**
   * Return events for a task, most-recent last, optionally filtered.
   */
  deliverEventsForTask(
    taskId: string,
    eligibility?: { eventKind?: string; needsDelivery?: boolean },
  ): WorkflowEvent[] {
    const events = this.repo.listEventsForTask(taskId);
    if (eligibility === undefined) return events;
    return events.filter((e) => {
      if (eligibility.eventKind !== undefined && e.event_kind !== eligibility.eventKind) {
        return false;
      }
      if (
        eligibility.needsDelivery !== undefined &&
        e.needs_delivery !== eligibility.needsDelivery
      ) {
        return false;
      }
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private validateInput(input: CreateWorkflowTaskInput): void {
    if (input.id === '') {
      throw new WorkflowValidationError('id is required', 'id');
    }
    if (!VALID_KINDS.has(input.kind)) {
      throw new WorkflowValidationError(
        `kind "${input.kind}" is not a valid WorkflowTaskKind`,
        'kind',
      );
    }
    if (input.priority !== undefined && !VALID_PRIORITIES.has(input.priority)) {
      throw new WorkflowValidationError(
        `priority "${input.priority}" is not a valid WorkflowTaskPriority`,
        'priority',
      );
    }
    if (input.origin !== undefined && !VALID_ORIGINS.has(input.origin)) {
      throw new WorkflowValidationError(
        `origin "${input.origin}" is not on AllowedOrigins`,
        'origin',
      );
    }
    if (
      input.initialState !== undefined &&
      !isValidInitialState(input.initialState)
    ) {
      throw new WorkflowValidationError(
        `initialState "${input.initialState}" cannot start a new task`,
        'initialState',
      );
    }
    if (
      input.expiresAtSec !== undefined &&
      (!Number.isFinite(input.expiresAtSec) || input.expiresAtSec < 0)
    ) {
      throw new WorkflowValidationError(
        'expiresAtSec must be a non-negative finite number',
        'expiresAtSec',
      );
    }
    if (input.payload === undefined || input.payload === '') {
      throw new WorkflowValidationError(
        'payload is required (use "{}" for an empty payload)',
        'payload',
      );
    }
  }

  private guardTransition(from: WorkflowTaskState, to: WorkflowTaskState): void {
    if (!isValidTransition(from, to)) {
      throw new WorkflowTransitionError(
        `transition ${from} → ${to} is not allowed by ValidTransitions`,
        from,
        to,
      );
    }
  }
}

/**
 * Sensible initial states — only these can seed a new task. A task never
 * starts life in a terminal or claim state.
 */
function isValidInitialState(state: WorkflowTaskState): boolean {
  return (
    state === WorkflowTaskState.Created ||
    state === WorkflowTaskState.Pending ||
    state === WorkflowTaskState.Queued ||
    state === WorkflowTaskState.PendingApproval ||
    state === WorkflowTaskState.Scheduled
  );
}

// ---------------------------------------------------------------------------
// Global accessor — matches the `reminders/service.ts` convention so HTTP
// handlers don't have to thread the service through every caller.
// ---------------------------------------------------------------------------

let instance: WorkflowService | null = null;

export function setWorkflowService(s: WorkflowService | null): void {
  instance = s;
}

export function getWorkflowService(): WorkflowService | null {
  return instance;
}

/** Forward re-export so route files don't import from two locations. */
export { WorkflowConflictError };
