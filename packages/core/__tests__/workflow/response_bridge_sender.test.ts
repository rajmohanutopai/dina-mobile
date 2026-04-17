/**
 * CORE-P3-I03 — Response Bridge wiring tests.
 *
 * Exercises the happy path (bridge context → D2D call), malformed
 * resultJSON handling, send-failure isolation, and the end-to-end
 * composition with a real `WorkflowService`.
 */

import {
  makeServiceResponseBridgeSender,
  type ResponseBridgeD2DSender,
} from '../../src/workflow/response_bridge_sender';
import {
  InMemoryWorkflowRepository,
} from '../../src/workflow/repository';
import {
  WorkflowService,
  type ServiceQueryBridgeContext,
} from '../../src/workflow/service';
import {
  WorkflowTaskKind,
} from '../../src/workflow/domain';
import type { ServiceResponseBody } from '../../src/d2d/service_bodies';

interface SendCall {
  to: string;
  body: ServiceResponseBody;
}

function makeSender(overrides?: {
  error?: Error;
  calls?: SendCall[];
}): ResponseBridgeD2DSender {
  return async (to, body) => {
    overrides?.calls?.push({ to, body });
    if (overrides?.error) throw overrides.error;
  };
}

const SAMPLE_CTX: ServiceQueryBridgeContext = {
  taskId: 'svc-exec-1',
  fromDID: 'did:plc:requester',
  queryId: 'q-1',
  capability: 'eta_query',
  ttlSeconds: 60,
  resultJSON: '{"eta_minutes":45,"vehicle_type":"Bus","route_name":"42"}',
  serviceName: 'Bus 42',
};

describe('makeServiceResponseBridgeSender — construction', () => {
  it('rejects missing sendResponse', () => {
    expect(() =>
      makeServiceResponseBridgeSender({
        sendResponse: undefined as unknown as ResponseBridgeD2DSender,
      }),
    ).toThrow(/sendResponse/);
  });
});

describe('makeServiceResponseBridgeSender — happy path', () => {
  it('emits a well-formed service.response body from the bridge context', async () => {
    const calls: SendCall[] = [];
    const bridge = makeServiceResponseBridgeSender({
      sendResponse: makeSender({ calls }),
    });
    await bridge(SAMPLE_CTX);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      to: 'did:plc:requester',
      body: {
        query_id: 'q-1',
        capability: 'eta_query',
        status: 'success',
        result: { eta_minutes: 45, vehicle_type: 'Bus', route_name: '42' },
        ttl_seconds: 60,
      },
    });
  });

  it('preserves non-default ttl_seconds unchanged (payload TTL, not hardcoded)', async () => {
    const calls: SendCall[] = [];
    const bridge = makeServiceResponseBridgeSender({
      sendResponse: makeSender({ calls }),
    });
    await bridge({ ...SAMPLE_CTX, ttlSeconds: 120 });
    expect(calls[0].body.ttl_seconds).toBe(120);
  });

  it('sends body with undefined result when resultJSON is empty (summary-only completion)', async () => {
    const calls: SendCall[] = [];
    const bridge = makeServiceResponseBridgeSender({
      sendResponse: makeSender({ calls }),
    });
    await bridge({ ...SAMPLE_CTX, resultJSON: '' });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.result).toBeUndefined();
    expect(calls[0].body.status).toBe('success');
  });
});

describe('makeServiceResponseBridgeSender — error paths', () => {
  it('invokes onMalformedResult on unparseable JSON; does NOT call sendResponse', async () => {
    const calls: SendCall[] = [];
    const malformed: Array<{ ctx: ServiceQueryBridgeContext; err: Error }> = [];
    const bridge = makeServiceResponseBridgeSender({
      sendResponse: makeSender({ calls }),
      onMalformedResult: (ctx, err) => malformed.push({ ctx, err }),
    });
    await bridge({ ...SAMPLE_CTX, resultJSON: '{not json' });
    expect(calls).toHaveLength(0);
    expect(malformed).toHaveLength(1);
    expect(malformed[0].ctx.queryId).toBe('q-1');
  });

  it('invokes onSendError when the transport rejects; never throws out of the bridge', async () => {
    const errors: Array<{ ctx: ServiceQueryBridgeContext; err: Error }> = [];
    const bridge = makeServiceResponseBridgeSender({
      sendResponse: makeSender({ error: new Error('ECONNRESET') }),
      onSendError: (ctx, err) => errors.push({ ctx, err }),
    });
    // Must NOT throw.
    await expect(bridge(SAMPLE_CTX)).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].err.message).toBe('ECONNRESET');
  });

  it('swallows send errors with no hook installed (no unhandled rejection)', async () => {
    const bridge = makeServiceResponseBridgeSender({
      sendResponse: makeSender({ error: new Error('silent failure') }),
    });
    await expect(bridge(SAMPLE_CTX)).resolves.toBeUndefined();
  });
});

describe('makeServiceResponseBridgeSender — end-to-end with WorkflowService', () => {
  it('fires on delegation completion with the canonical payload', async () => {
    const calls: SendCall[] = [];
    const repo = new InMemoryWorkflowRepository();
    const service = new WorkflowService({
      repository: repo,
      nowMsFn: () => 1_700_000_000_000,
      responseBridgeSender: makeServiceResponseBridgeSender({
        sendResponse: makeSender({ calls }),
      }),
    });

    service.create({
      id: 'svc-exec-1',
      kind: WorkflowTaskKind.Delegation,
      description: '',
      payload: JSON.stringify({
        type: 'service_query_execution',
        from_did: 'did:plc:requester',
        query_id: 'q-1',
        capability: 'eta_query',
        ttl_seconds: 60,
        service_name: 'Bus 42',
        params: { location: { lat: 37.77, lng: -122.41 } },
      }),
    });
    service.complete(
      'svc-exec-1',
      '{"eta_minutes":45,"vehicle_type":"Bus","route_name":"42"}',
      'responded',
    );

    // Give the bridge's async invocation a tick to land.
    await new Promise((r) => setImmediate(r));

    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe('did:plc:requester');
    expect(calls[0].body).toEqual({
      query_id: 'q-1',
      capability: 'eta_query',
      status: 'success',
      result: { eta_minutes: 45, vehicle_type: 'Bus', route_name: '42' },
      ttl_seconds: 60,
    });
  });

  it('does NOT fire for non-delegation tasks or wrong-typed payloads', async () => {
    const calls: SendCall[] = [];
    const repo = new InMemoryWorkflowRepository();
    const service = new WorkflowService({
      repository: repo,
      nowMsFn: () => 1_700_000_000_000,
      responseBridgeSender: makeServiceResponseBridgeSender({
        sendResponse: makeSender({ calls }),
      }),
    });
    service.create({
      id: 'gen-1',
      kind: WorkflowTaskKind.Delegation,
      description: '',
      // payload.type is not service_query_execution
      payload: JSON.stringify({ type: 'generic_job' }),
    });
    service.complete('gen-1', '{"ok":true}', 'done');
    await new Promise((r) => setImmediate(r));
    expect(calls).toHaveLength(0);
  });
});
