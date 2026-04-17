/**
 * Guardian workflow-event consumer (BRAIN-P2-W03).
 *
 * Polls Core's `listWorkflowEvents(needs_delivery=true)`, picks out the
 * `service_query` completions, formats them via `formatServiceQueryResult`,
 * delivers the text through an injected `deliver` callback, then ACKs the
 * event so Core retires it from the delivery queue.
 *
 * Design mirrors `DelegationRunner`:
 *   - Injectable clock + scheduler (production `setInterval`, tests a fake).
 *   - Default cadence 1 second so requester-side replies feel snappy.
 *   - Per-event error isolation — one bad event never breaks the tick.
 *   - Events that do not match our filter are still acknowledged: we are
 *     the single Bus Driver consumer, so leaving them unacked would stall
 *     the delivery scheduler. Other event streams (approval lifecycle
 *     audit, etc.) are write-only from Core's perspective; the ack is
 *     a no-op from their side because nothing else consumes them.
 *
 * Source: BUS_DRIVER_IMPLEMENTATION.md BRAIN-P2-W03 / MOBILE-009.
 */

import type {
  BrainCoreClient,
  WorkflowEvent,
  WorkflowTask,
} from '../core_client/http';
import {
  formatServiceQueryResult,
  type ServiceQueryEventDetails,
} from './result_formatter';
import type { ServiceResponseBody } from '../../../core/src/d2d/service_bodies';

/**
 * How the formatted response reaches the surface (chat thread, Telegram,
 * test spy). The consumer hands over the ready-to-render text plus the
 * underlying event so callers can route by capability / correlation_id.
 */
export type WorkflowEventDeliverer = (args: {
  text: string;
  event: WorkflowEvent;
  task: WorkflowTask;
  details: ServiceQueryEventDetails;
}) => void | Promise<void>;

/**
 * Payload of a `service_query_execution` delegation, embedded on every
 * approval task. The `approved`-event dispatcher needs the same shape
 * that `ServiceHandler.executeAndRespond` already accepts.
 */
export interface ApprovedExecutionPayload {
  from_did: string;
  query_id: string;
  capability: string;
  params: unknown;
  ttl_seconds?: number;
  schema_hash?: string;
  service_name?: string;
}

/**
 * Fired when a workflow task transitions `pending_approval → queued`.
 * Callers typically forward to `ServiceHandler.executeAndRespond` to
 * spawn the delegation task that actually runs the capability. Hook
 * errors behave like `deliver` errors: the event is NOT acked, so Core
 * re-drives it on the next tick.
 *
 * Source: BUS_DRIVER_IMPLEMENTATION.md BRAIN-P4-P01.
 */
export type ApprovalEventDispatcher = (args: {
  event: WorkflowEvent;
  task: WorkflowTask;
  payload: ApprovedExecutionPayload;
}) => void | Promise<void>;

export interface WorkflowEventConsumerCoreClient
  extends Pick<
    BrainCoreClient,
    'listWorkflowEvents' | 'acknowledgeWorkflowEvent' | 'getWorkflowTask'
  > {}

export interface WorkflowEventConsumerOptions {
  coreClient: WorkflowEventConsumerCoreClient;
  deliver: WorkflowEventDeliverer;
  /**
   * Optional dispatcher for `approved` events on approval tasks. When
   * installed, the consumer parses the approval task's payload and hands
   * it to the dispatcher (typically `ServiceHandler.executeAndRespond`).
   * When absent, the event is acked as skipped — matching the prior
   * "chat-approve handler owns execution" posture.
   */
  onApproved?: ApprovalEventDispatcher;
  /** Poll cadence in ms. Defaults to 1_000 (snappy chat delivery). */
  intervalMs?: number;
  /** Max events per tick. Defaults to 50 — events are light. */
  batchSize?: number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
  onTaskOutcome?: (
    event: WorkflowEvent,
    outcome: 'delivered' | 'skipped' | 'failed',
  ) => void;
  onError?: (err: unknown) => void;
  logger?: (entry: Record<string, unknown>) => void;
}

export interface WorkflowEventTickResult {
  discovered: number;
  delivered: number;
  skipped: number;
  failed: number;
  errors: Error[];
}

const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_BATCH_SIZE = 50;

export class WorkflowEventConsumer {
  private readonly core: WorkflowEventConsumerCoreClient;
  private readonly deliver: WorkflowEventDeliverer;
  private readonly onApproved: ApprovalEventDispatcher | null;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly setIntervalFn: (fn: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (h: unknown) => void;
  private readonly onTaskOutcome:
    | ((event: WorkflowEvent, outcome: 'delivered' | 'skipped' | 'failed') => void)
    | null;
  private readonly onError: ((err: unknown) => void) | null;
  private readonly log: (entry: Record<string, unknown>) => void;

  private handle: unknown = null;
  private inFlight: Promise<WorkflowEventTickResult> | null = null;

  constructor(options: WorkflowEventConsumerOptions) {
    if (!options.coreClient) {
      throw new Error('WorkflowEventConsumer: coreClient is required');
    }
    if (!options.deliver) {
      throw new Error('WorkflowEventConsumer: deliver is required');
    }
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    if (intervalMs <= 0) {
      throw new Error('WorkflowEventConsumer: intervalMs must be positive');
    }
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    if (batchSize <= 0) {
      throw new Error('WorkflowEventConsumer: batchSize must be positive');
    }
    this.core = options.coreClient;
    this.deliver = options.deliver;
    this.onApproved = options.onApproved ?? null;
    this.intervalMs = intervalMs;
    this.batchSize = batchSize;
    this.setIntervalFn =
      options.setInterval ??
      ((fn, ms) => globalThis.setInterval(fn, ms) as unknown);
    this.clearIntervalFn =
      options.clearInterval ??
      ((h) => globalThis.clearInterval(h as ReturnType<typeof globalThis.setInterval>));
    this.onTaskOutcome = options.onTaskOutcome ?? null;
    this.onError = options.onError ?? null;
    this.log = options.logger ?? (() => { /* no-op */ });
  }

  start(): void {
    if (this.handle !== null) return;
    this.runTick().catch(() => { /* errors routed via onError already */ });
    this.handle = this.setIntervalFn(() => {
      this.runTick().catch(() => { /* per-event errors isolated */ });
    }, this.intervalMs);
    const h = this.handle as { unref?: () => void };
    if (h !== null && typeof h.unref === 'function') h.unref();
  }

  stop(): void {
    if (this.handle === null) return;
    this.clearIntervalFn(this.handle);
    this.handle = null;
  }

  async flush(): Promise<void> {
    if (this.inFlight !== null) {
      try {
        await this.inFlight;
      } catch { /* already reported */ }
    }
  }

  async runTick(): Promise<WorkflowEventTickResult> {
    if (this.inFlight !== null) return this.inFlight;
    this.inFlight = this.runTickInner();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async runTickInner(): Promise<WorkflowEventTickResult> {
    const result: WorkflowEventTickResult = {
      discovered: 0,
      delivered: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    let events: WorkflowEvent[];
    try {
      events = await this.core.listWorkflowEvents({
        needsDeliveryOnly: true,
        limit: this.batchSize,
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      result.errors.push(err);
      if (this.onError !== null) {
        try { this.onError(err); } catch { /* swallow */ }
      }
      this.log({ event: 'workflow_event.list_failed', error: err.message });
      return result;
    }

    result.discovered = events.length;
    for (const ev of events) {
      await this.processEvent(ev, result);
    }
    return result;
  }

  private async processEvent(
    event: WorkflowEvent,
    result: WorkflowEventTickResult,
  ): Promise<void> {
    // Fast path: event kinds this consumer never dispatches on get acked
    // immediately to retire them from Core's delivery queue. `failed` /
    // `cancelled` events are surfaced by the orchestrator's own code
    // paths; this consumer is sole owner of the delivery scheduler.
    if (event.event_kind !== 'completed' && event.event_kind !== 'approved') {
      await this.ackAndTrack(event, 'skipped', result);
      return;
    }
    // `approved` events are only meaningful when an onApproved dispatcher
    // is installed. Without one, the chat-approve handler owns execution
    // and we should still retire the event so it doesn't redrive.
    if (event.event_kind === 'approved' && this.onApproved === null) {
      await this.ackAndTrack(event, 'skipped', result);
      return;
    }

    let task: WorkflowTask | null;
    try {
      task = await this.core.getWorkflowTask(event.task_id);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      result.failed++;
      result.errors.push(err);
      if (this.onError !== null) {
        try { this.onError(err); } catch { /* swallow */ }
      }
      if (this.onTaskOutcome !== null) {
        try { this.onTaskOutcome(event, 'failed'); } catch { /* swallow */ }
      }
      this.log({
        event: 'workflow_event.fetch_task_failed',
        task_id: event.task_id,
        error: err.message,
      });
      return;
    }

    if (task === null) {
      // Task archived before we got here — nothing to dispatch.
      await this.ackAndTrack(event, 'skipped', result);
      return;
    }

    if (event.event_kind === 'approved') {
      if (task.kind !== 'approval') {
        await this.ackAndTrack(event, 'skipped', result);
        return;
      }
      await this.dispatchApproved(event, task, result);
      return;
    }

    // event_kind === 'completed'
    if (task.kind !== 'service_query') {
      await this.ackAndTrack(event, 'skipped', result);
      return;
    }

    const details = this.composeDetails(event, task);
    const text = formatServiceQueryResult(details);

    try {
      await this.deliver({ text, event, task, details });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      result.failed++;
      result.errors.push(err);
      if (this.onError !== null) {
        try { this.onError(err); } catch { /* swallow */ }
      }
      if (this.onTaskOutcome !== null) {
        try { this.onTaskOutcome(event, 'failed'); } catch { /* swallow */ }
      }
      this.log({
        event: 'workflow_event.deliver_failed',
        event_id: event.event_id,
        error: err.message,
      });
      // Do NOT ack: delivery failed, let Core re-surface this event so a
      // retry can land the text (idempotency is the deliverer's concern).
      return;
    }

    await this.ackAndTrack(event, 'delivered', result);
  }

  /**
   * Parse the approval task's payload and hand it to the installed
   * dispatcher. Payload must include `from_did / query_id / capability /
   * params` for the downstream execution call; anything else surfaces as
   * a failed dispatch (the event is NOT acked — a redriven event with a
   * corrected payload can still land).
   */
  private async dispatchApproved(
    event: WorkflowEvent,
    task: WorkflowTask,
    result: WorkflowEventTickResult,
  ): Promise<void> {
    const dispatcher = this.onApproved;
    if (dispatcher === null) return;

    const payload = parseApprovedPayload(task.payload);
    if (payload === null) {
      result.failed++;
      const err = new Error(
        `workflow_event.approved_payload_invalid: task ${task.id}`,
      );
      result.errors.push(err);
      if (this.onError !== null) {
        try { this.onError(err); } catch { /* swallow */ }
      }
      if (this.onTaskOutcome !== null) {
        try { this.onTaskOutcome(event, 'failed'); } catch { /* swallow */ }
      }
      this.log({
        event: 'workflow_event.approved_payload_invalid',
        task_id: task.id,
      });
      return;
    }

    try {
      await dispatcher({ event, task, payload });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      result.failed++;
      result.errors.push(err);
      if (this.onError !== null) {
        try { this.onError(err); } catch { /* swallow */ }
      }
      if (this.onTaskOutcome !== null) {
        try { this.onTaskOutcome(event, 'failed'); } catch { /* swallow */ }
      }
      this.log({
        event: 'workflow_event.approved_dispatch_failed',
        event_id: event.event_id,
        error: err.message,
      });
      // Do NOT ack: dispatch failed, let Core redrive.
      return;
    }

    await this.ackAndTrack(event, 'delivered', result);
  }

  /**
   * Merge `event.details` with the task's stored `result` (the full D2D
   * `service.response` body) so the formatter sees both the metadata
   * written at completion time and the capability payload.
   */
  private composeDetails(
    event: WorkflowEvent,
    task: WorkflowTask,
  ): ServiceQueryEventDetails {
    let details: ServiceQueryEventDetails = {};
    try {
      const parsed = JSON.parse(event.details) as ServiceQueryEventDetails;
      if (parsed !== null && typeof parsed === 'object') details = parsed;
    } catch {
      /* malformed details — fall through with an empty object */
    }

    if (typeof task.result === 'string' && task.result !== '') {
      try {
        const body = JSON.parse(task.result) as Partial<ServiceResponseBody>;
        if (details.result === undefined && body.result !== undefined) {
          details.result = body.result;
        }
        if ((details.response_status === undefined || details.response_status === '')
            && typeof body.status === 'string') {
          details.response_status = body.status;
        }
      } catch {
        /* malformed body — formatter falls back on details alone */
      }
    }
    return details;
  }

  private async ackAndTrack(
    event: WorkflowEvent,
    outcome: 'delivered' | 'skipped',
    result: WorkflowEventTickResult,
  ): Promise<void> {
    try {
      await this.core.acknowledgeWorkflowEvent(event.event_id);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      result.errors.push(err);
      if (this.onError !== null) {
        try { this.onError(err); } catch { /* swallow */ }
      }
      this.log({
        event: 'workflow_event.ack_failed',
        event_id: event.event_id,
        error: err.message,
      });
      return;
    }
    if (outcome === 'delivered') result.delivered++;
    else result.skipped++;
    if (this.onTaskOutcome !== null) {
      try { this.onTaskOutcome(event, outcome); } catch { /* swallow */ }
    }
    this.log({ event: `workflow_event.${outcome}`, event_id: event.event_id });
  }
}

/**
 * Extract the `service_query_execution` envelope from an approval task's
 * payload. Returns `null` when the payload is malformed or missing any
 * required field — the consumer treats that as a dispatch-failure so
 * Core can redrive after an operator re-issues the task.
 */
function parseApprovedPayload(raw: string): ApprovedExecutionPayload | null {
  let parsed: Record<string, unknown>;
  try {
    const p = JSON.parse(raw);
    if (p === null || typeof p !== 'object') return null;
    parsed = p as Record<string, unknown>;
  } catch {
    return null;
  }
  const from_did = parsed.from_did;
  const query_id = parsed.query_id;
  const capability = parsed.capability;
  if (
    typeof from_did !== 'string' || from_did === '' ||
    typeof query_id !== 'string' || query_id === '' ||
    typeof capability !== 'string' || capability === ''
  ) {
    return null;
  }
  return {
    from_did,
    query_id,
    capability,
    params: parsed.params,
    ttl_seconds: typeof parsed.ttl_seconds === 'number' ? parsed.ttl_seconds : undefined,
    // Treat empty-string schema_hash / service_name as absent — the handler
    // writes them as '' when no value is available, and downstream consumers
    // expect a missing field in that case.
    schema_hash:
      typeof parsed.schema_hash === 'string' && parsed.schema_hash !== ''
        ? parsed.schema_hash
        : undefined,
    service_name:
      typeof parsed.service_name === 'string' && parsed.service_name !== ''
        ? parsed.service_name
        : undefined,
  };
}
