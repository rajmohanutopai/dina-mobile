/**
 * ServiceHandler tests.
 */

import {
  ServiceHandler,
  type ServiceHandlerCoreClient,
} from '../../src/service/service_handler';
import { WorkflowConflictError } from '../../src/core_client/http';
import type {
  ServiceConfig,
} from '../../../core/src/service/service_config';

interface CreateCall {
  id: string;
  kind: string;
  description: string;
  payload: unknown;
  origin?: string;
  correlationId?: string;
  expiresAtSec?: number;
  initialState?: string;
}

function stubCore(overrides?: {
  nextCreateError?: Error;
  nextCancelError?: Error;
}): {
  client: ServiceHandlerCoreClient;
  createCalls: CreateCall[];
  cancelCalls: Array<{ id: string; reason?: string }>;
  respondCalls: Array<unknown>;
  nextCreateError: Error | null;
  nextCancelError: Error | null;
} {
  const createCalls: CreateCall[] = [];
  const cancelCalls: Array<{ id: string; reason?: string }> = [];
  const respondCalls: Array<unknown> = [];
  let nextCreateError: Error | null = overrides?.nextCreateError ?? null;
  let nextCancelError: Error | null = overrides?.nextCancelError ?? null;
  const client = {
    async createWorkflowTask(input: CreateCall) {
      if (nextCreateError !== null) {
        const err = nextCreateError;
        nextCreateError = null;
        throw err;
      }
      createCalls.push(input);
      return { task: { id: input.id } as never, deduped: false };
    },
    async cancelWorkflowTask(id: string, reason?: string) {
      if (nextCancelError !== null) {
        const err = nextCancelError;
        nextCancelError = null;
        throw err;
      }
      cancelCalls.push({ id, reason });
      return {} as never;
    },
    async sendServiceRespond(..._args: unknown[]) {
      respondCalls.push(_args);
      return { status: 'sent', taskId: '', alreadyProcessed: false };
    },
  } as unknown as ServiceHandlerCoreClient;
  return {
    client,
    createCalls,
    cancelCalls,
    respondCalls,
    get nextCreateError() { return nextCreateError; },
    set nextCreateError(e: Error | null) { nextCreateError = e; },
    get nextCancelError() { return nextCancelError; },
    set nextCancelError(e: Error | null) { nextCancelError = e; },
  };
}

const baseConfig: ServiceConfig = {
  isPublic: true,
  name: 'Bus 42',
  capabilities: {
    eta_query: {
      mcpServer: 'transit',
      mcpTool: 'get_eta',
      responsePolicy: 'auto',
      schemaHash: 'hash-v1',
    },
    route_info: {
      mcpServer: 'transit',
      mcpTool: 'get_route',
      responsePolicy: 'review',
    },
  },
  capabilitySchemas: {
    eta_query: {
      params: { type: 'object' },
      result: { type: 'object' },
      schemaHash: 'hash-v1',
    },
  },
};

const REQUESTER = 'did:plc:requester';

const validQuery = {
  query_id: 'q-1',
  capability: 'eta_query',
  params: { location: { lat: 37.77, lng: -122.41 } },
  ttl_seconds: 60,
};

function makeHandler(opts: {
  core: ReturnType<typeof stubCore>;
  config?: ServiceConfig | null;
  nowSec?: number;
  uuid?: string;
  notifier?: Parameters<typeof ServiceHandler.prototype.handleQuery>[0] extends infer _
    ? never
    : never;
}) {
  const uuids = (opts.uuid ?? 'uuid-seq').split(',');
  let i = 0;
  return new ServiceHandler({
    coreClient: opts.core.client,
    readConfig: () => opts.config ?? baseConfig,
    nowSecFn: () => opts.nowSec ?? 1_700_000_000,
    generateUUID: () => uuids[i++ % uuids.length],
  });
}

describe('ServiceHandler.handleQuery — auto path', () => {
  it('creates a delegation task with the canonical payload', async () => {
    const core = stubCore();
    const handler = makeHandler({ core, uuid: 'uuid-abc', nowSec: 1_000 });

    await handler.handleQuery(REQUESTER, validQuery);

    expect(core.createCalls).toHaveLength(1);
    const call = core.createCalls[0];
    expect(call.id).toBe('svc-exec-uuid-abc');
    expect(call.kind).toBe('delegation');
    expect(call.origin).toBe('d2d');
    expect(call.correlationId).toBe('q-1');
    expect(call.expiresAtSec).toBe(1_060); // nowSec + ttl
    const payload = JSON.parse(call.payload as string);
    expect(payload.type).toBe('service_query_execution');
    expect(payload.from_did).toBe(REQUESTER);
    expect(payload.query_id).toBe('q-1');
    expect(payload.service_name).toBe('Bus 42');
  });

  it('includes schema_hash in the payload when the query supplied one', async () => {
    const core = stubCore();
    const handler = makeHandler({ core, uuid: 'u1' });

    await handler.handleQuery(REQUESTER, {
      ...validQuery,
      schema_hash: 'hash-v1',
    });

    const payload = JSON.parse(core.createCalls[0].payload as string);
    expect(payload.schema_hash).toBe('hash-v1');
  });

  it('drops silently when capability is not configured', async () => {
    const core = stubCore();
    const handler = makeHandler({ core });
    await handler.handleQuery(REQUESTER, {
      ...validQuery,
      capability: 'unknown_cap',
    });
    expect(core.createCalls).toHaveLength(0);
  });

  it('drops when isPublic is false', async () => {
    const core = stubCore();
    const handler = makeHandler({
      core,
      config: { ...baseConfig, isPublic: false },
    });
    await handler.handleQuery(REQUESTER, validQuery);
    expect(core.createCalls).toHaveLength(0);
  });

  it('drops on schema_hash mismatch', async () => {
    const core = stubCore();
    const handler = makeHandler({ core });
    await handler.handleQuery(REQUESTER, {
      ...validQuery,
      schema_hash: 'stale-hash',
    });
    expect(core.createCalls).toHaveLength(0);
  });

  it('drops on invalid params (via capability registry validator)', async () => {
    const core = stubCore();
    const handler = makeHandler({ core });
    await handler.handleQuery(REQUESTER, {
      ...validQuery,
      params: { location: { lat: 999, lng: 0 } }, // lat out of range
    });
    expect(core.createCalls).toHaveLength(0);
  });

  it('checks schema_hash BEFORE params validation (BRAIN-P3-P04 — cheap filter first)', async () => {
    // Bad schema_hash AND invalid params. If check order reverses, the
    // emitted rejection would carry a `lat`-related message instead of
    // `schema_version_mismatch`. Pins the ordering via the log sink.
    const core = stubCore();
    const logs: Array<Record<string, unknown>> = [];
    const handler = new ServiceHandler({
      coreClient: core.client,
      readConfig: () => baseConfig,
      logger: (e) => { logs.push(e); },
      generateUUID: () => 'u1',
    });
    await handler.handleQuery(REQUESTER, {
      ...validQuery,
      schema_hash: 'stale-hash',
      params: { location: { lat: 999, lng: 0 } }, // would also fail params check
    });
    expect(core.createCalls).toHaveLength(0);
    const rejection = logs.find((l) => l.event === 'service.query.rejected');
    expect(rejection).toBeDefined();
    expect(rejection!.message).toBe('schema_version_mismatch');
  });

  it('drops silently on invalid body (no task created)', async () => {
    const core = stubCore();
    const handler = makeHandler({ core });
    await handler.handleQuery(REQUESTER, {
      capability: 'eta_query',
      ttl_seconds: 60,
      // no query_id or params
    });
    expect(core.createCalls).toHaveLength(0);
  });
});

describe('ServiceHandler.handleQuery — review path', () => {
  it('creates an approval task (not delegation) for review-policy capability', async () => {
    const core = stubCore();
    const handler = makeHandler({ core, uuid: 'u1', nowSec: 1_000 });

    await handler.handleQuery(REQUESTER, {
      ...validQuery,
      capability: 'route_info',
      schema_hash: undefined,
    });

    expect(core.createCalls).toHaveLength(1);
    const call = core.createCalls[0];
    expect(call.kind).toBe('approval');
    expect(call.id).toMatch(/^approval-/);
    // Seeded in `pending_approval` so the operator's /service_approve
    // command (pending_approval → queued) fires without an extra hop.
    expect(call.initialState).toBe('pending_approval');
    // Invariant: NO delegation task is created on the review path. The
    // delegation only appears later, after approval → executeAndRespond.
    expect(core.createCalls.filter((c) => c.kind === 'delegation')).toHaveLength(0);

    // Payload shape matters: Guardian extracts these fields when it sees
    // the approved event and calls executeAndRespond. A silent regression
    // that dropped query_id / capability would break the whole flow.
    expect(call.correlationId).toBe('q-1');
    expect(call.expiresAtSec).toBe(1_060); // nowSec + ttl
    const payload = JSON.parse(call.payload as string);
    expect(payload).toMatchObject({
      type: 'service_query_execution',
      from_did: REQUESTER,
      query_id: 'q-1',
      capability: 'route_info',
      ttl_seconds: 60,
      service_name: 'Bus 42',
    });
  });

  it('auto-path delegation task enters `queued` state so paired agents can claim it', async () => {
    const core = stubCore();
    const handler = makeHandler({ core, uuid: 'u1' });
    await handler.handleQuery(REQUESTER, validQuery);
    expect(core.createCalls[0].kind).toBe('delegation');
    expect(core.createCalls[0].initialState).toBe('queued');
  });

  it('fires the notifier with the approve command', async () => {
    const core = stubCore();
    const notifications: Array<{ taskId: string; approveCommand: string }> = [];
    const handler = new ServiceHandler({
      coreClient: core.client,
      readConfig: () => baseConfig,
      notifier: (n) => { notifications.push(n); },
      generateUUID: () => 'u1',
    });

    await handler.handleQuery(REQUESTER, {
      ...validQuery,
      capability: 'route_info',
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].taskId).toBe('approval-u1');
    expect(notifications[0].approveCommand).toBe('/service_approve approval-u1');
  });

  it('isolates notifier errors (create still succeeds)', async () => {
    const core = stubCore();
    const logs: Array<Record<string, unknown>> = [];
    const handler = new ServiceHandler({
      coreClient: core.client,
      readConfig: () => baseConfig,
      notifier: () => { throw new Error('notifier broke'); },
      logger: (e) => { logs.push(e); },
      generateUUID: () => 'u1',
    });

    await handler.handleQuery(REQUESTER, {
      ...validQuery,
      capability: 'route_info',
    });

    expect(core.createCalls).toHaveLength(1);
    expect(logs.some((l) => l.event === 'service.query.notifier_threw')).toBe(true);
  });
});

describe('ServiceHandler.executeAndRespond', () => {
  const approvalTaskId = 'approval-test';
  const payload = {
    from_did: REQUESTER,
    query_id: 'q-1',
    capability: 'eta_query',
    params: { location: { lat: 0, lng: 0 } },
    ttl_seconds: 60,
    schema_hash: 'hash-v1',
    service_name: 'Bus 42',
  };

  it('creates a fresh delegation task + cancels the approval task', async () => {
    const core = stubCore();
    const handler = makeHandler({ core });

    await handler.executeAndRespond(approvalTaskId, payload);

    expect(core.createCalls).toHaveLength(1);
    expect(core.createCalls[0].id).toBe(`svc-exec-from-${approvalTaskId}`);
    expect(core.createCalls[0].kind).toBe('delegation');
    expect(core.cancelCalls).toEqual([
      { id: approvalTaskId, reason: 'executed_via_delegation' },
    ]);
    // BRAIN-P4-T05 invariant: `executeAndRespond` NEVER calls
    // `sendServiceRespond` directly — wire-level response emission is
    // owned by the Response Bridge (CORE-P3-I01/I02) which fires when
    // the delegation task reaches `completed`.
    expect(core.respondCalls).toHaveLength(0);
  });

  it('tolerates an existing delegation task (idempotent retry)', async () => {
    const core = stubCore({
      nextCreateError: new WorkflowConflictError('exists', 'duplicate_id'),
    });
    const handler = makeHandler({ core });
    // First call: create throws WorkflowConflictError → swallowed.
    await handler.executeAndRespond(approvalTaskId, payload);
    // Approval task still cancelled despite the conflict.
    expect(core.cancelCalls).toEqual([
      { id: approvalTaskId, reason: 'executed_via_delegation' },
    ]);
  });

  it('bubbles unexpected errors from createWorkflowTask', async () => {
    const core = stubCore({ nextCreateError: new Error('network down') });
    const handler = makeHandler({ core });
    await expect(
      handler.executeAndRespond(approvalTaskId, payload),
    ).rejects.toThrow(/network down/);
  });

  it('BRAIN-P4-T06: calling executeAndRespond twice yields exactly one successful delegation', async () => {
    // Two calls on the same approvalTaskId. First succeeds (create OK).
    // Second hits WorkflowConflictError on create (swallowed) + may also
    // hit a terminal approval task (tolerated). Net: one delegation on
    // the books, one successful cancel event — matching Guardian retry.
    const core = stubCore();
    const handler = makeHandler({ core });

    // First execution — both create + cancel succeed.
    await handler.executeAndRespond(approvalTaskId, payload);
    expect(core.createCalls).toHaveLength(1);
    expect(core.cancelCalls).toHaveLength(1);

    // Second execution — simulate Core reporting the delegation already
    // exists (deterministic id is the whole point).
    core.nextCreateError = new WorkflowConflictError('exists', 'duplicate_id');
    await handler.executeAndRespond(approvalTaskId, payload);

    // Still exactly one successful create on the books — the second's
    // throw happened before the stub recorded it. The two cancels are OK
    // (the real repo is idempotent on cancel of a cancelled task).
    expect(core.createCalls).toHaveLength(1);
    expect(core.createCalls[0].id).toBe(`svc-exec-from-${approvalTaskId}`);
  });

  it('tolerates an already-cancelled approval task (log-only)', async () => {
    const core = stubCore({
      nextCancelError: new Error('already terminal'),
    });
    const logs: Array<Record<string, unknown>> = [];
    const handler = new ServiceHandler({
      coreClient: core.client,
      readConfig: () => baseConfig,
      logger: (e) => { logs.push(e); },
    });

    await handler.executeAndRespond(approvalTaskId, payload);

    expect(core.createCalls).toHaveLength(1); // delegation still created
    expect(
      logs.some((l) => l.event === 'service.query.approval_cancel_failed'),
    ).toBe(true);
  });

  it('throws WorkflowValidationError-like error on incomplete payload', async () => {
    const core = stubCore();
    const handler = makeHandler({ core });
    await expect(
      handler.executeAndRespond(approvalTaskId, {
        ...payload,
        query_id: '',
      }),
    ).rejects.toThrow(/incomplete payload/);
  });
});
