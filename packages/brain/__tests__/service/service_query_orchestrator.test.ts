/**
 * ServiceQueryOrchestrator tests.
 *
 * Covers:
 *   - Search + rank + hand off to `coreClient.sendServiceQuery`.
 *   - Returns immediately with dispatch identifiers (no awaiting a response).
 *   - No pending registry, no timeouts, no correlation — the response path
 *     is owned by Guardian/Core.
 *   - Validation errors (capability_required, params_required) fire before
 *     AppView is hit.
 *   - `no_candidate` error when AppView returns nothing.
 *   - `send_failed` wraps coreClient errors.
 *   - Forwards schema_hash from the chosen profile.
 *   - Respects custom ttlSeconds; falls back to capability default otherwise.
 *   - Propagates `deduped` from Core's response.
 *   - Stable queryId: uses the one we generate even if Core echoes a blank.
 */

import {
  ServiceQueryOrchestrator,
  ServiceOrchestratorError,
} from '../../src/service/service_query_orchestrator';
import type {
  AppViewClient,
  ServiceProfile,
  SearchServicesParams,
} from '../../src/appview_client/http';
import type {
  BrainCoreClient,
  SendServiceQueryResult,
} from '../../src/core_client/http';

function stubAppView(services: ServiceProfile[], seen?: SearchServicesParams[]): Pick<AppViewClient, 'searchServices'> {
  return {
    searchServices: async (p) => {
      seen?.push(p);
      return services;
    },
  };
}

interface CoreSend {
  toDID: string;
  capability: string;
  params: unknown;
  queryId: string;
  ttlSeconds: number;
  serviceName?: string;
  originChannel?: string;
  schemaHash?: string;
}

function stubCore(overrides?: {
  sendError?: Error;
  result?: SendServiceQueryResult;
  seen?: CoreSend[];
}): Pick<BrainCoreClient, 'sendServiceQuery'> {
  return {
    sendServiceQuery: async (req) => {
      overrides?.seen?.push(req as CoreSend);
      if (overrides?.sendError) throw overrides.sendError;
      return (
        overrides?.result ?? { taskId: 'sq-1', queryId: req.queryId, deduped: false }
      );
    },
  };
}

const BUS_SERVICE: ServiceProfile = {
  did: 'did:plc:bus42',
  name: 'Bus 42',
  capabilities: ['eta_query'],
  isPublic: true,
  capabilitySchemas: {
    eta_query: {
      params: { type: 'object' },
      result: { type: 'object' },
      schemaHash: 'hash-v1',
    },
  },
};

describe('ServiceQueryOrchestrator — construction', () => {
  it('rejects missing appViewClient', () => {
    expect(
      () =>
        new ServiceQueryOrchestrator({
          appViewClient: undefined as unknown as AppViewClient,
          coreClient: stubCore(),
        }),
    ).toThrow(/appViewClient/);
  });

  it('rejects missing coreClient', () => {
    expect(
      () =>
        new ServiceQueryOrchestrator({
          appViewClient: stubAppView([]),
          coreClient: undefined as unknown as BrainCoreClient,
        }),
    ).toThrow(/coreClient/);
  });
});

describe('ServiceQueryOrchestrator.issueQuery — validation', () => {
  it('capability_required', async () => {
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE]),
      coreClient: stubCore(),
    });
    await expect(
      orch.issueQuery({ capability: '', params: {} }),
    ).rejects.toThrow(ServiceOrchestratorError);
  });

  it('params_required (null and undefined)', async () => {
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE]),
      coreClient: stubCore(),
    });
    await expect(
      orch.issueQuery({ capability: 'eta_query', params: null }),
    ).rejects.toThrow(/params is required/);
    await expect(
      orch.issueQuery({
        capability: 'eta_query',
        params: undefined as unknown as Record<string, unknown>,
      }),
    ).rejects.toThrow(/params is required/);
  });
});

describe('ServiceQueryOrchestrator.issueQuery — dispatch', () => {
  it('hands off to coreClient.sendServiceQuery with the canonical request', async () => {
    const coreSeen: CoreSend[] = [];
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE]),
      coreClient: stubCore({ seen: coreSeen }),
      generateQueryId: () => 'q-deterministic',
    });

    const result = await orch.issueQuery({
      capability: 'eta_query',
      params: { location: { lat: 37.77, lng: -122.41 } },
      ttlSeconds: 90,
      originChannel: 'chat',
    });

    expect(result).toEqual({
      queryId: 'q-deterministic',
      taskId: 'sq-1',
      toDID: 'did:plc:bus42',
      serviceName: 'Bus 42',
      deduped: false,
    });
    expect(coreSeen).toHaveLength(1);
    expect(coreSeen[0]).toEqual({
      toDID: 'did:plc:bus42',
      capability: 'eta_query',
      params: { location: { lat: 37.77, lng: -122.41 } },
      queryId: 'q-deterministic',
      ttlSeconds: 90,
      serviceName: 'Bus 42',
      originChannel: 'chat',
      schemaHash: 'hash-v1',
    });
  });

  it('falls back to the capability default TTL when ttlSeconds is omitted', async () => {
    const coreSeen: CoreSend[] = [];
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE]),
      coreClient: stubCore({ seen: coreSeen }),
    });
    await orch.issueQuery({
      capability: 'eta_query',
      params: { location: { lat: 0, lng: 0 } },
    });
    // eta_query default is 60s (capability registry).
    expect(coreSeen[0].ttlSeconds).toBe(60);
  });

  it('forwards geo search params to AppView', async () => {
    const appViewSeen: SearchServicesParams[] = [];
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE], appViewSeen),
      coreClient: stubCore(),
    });
    await orch.issueQuery({
      capability: 'eta_query',
      params: {},
      viewer: { lat: 37.77, lng: -122.41 },
      radiusKm: 3,
      q: 'bus',
    });
    expect(appViewSeen[0]).toEqual({
      capability: 'eta_query',
      lat: 37.77,
      lng: -122.41,
      radiusKm: 3,
      q: 'bus',
    });
  });

  it('propagates `deduped` from Core', async () => {
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE]),
      coreClient: stubCore({
        result: { taskId: 'sq-42', queryId: 'q-x', deduped: true },
      }),
    });
    const result = await orch.issueQuery({
      capability: 'eta_query',
      params: {},
    });
    expect(result.deduped).toBe(true);
    expect(result.taskId).toBe('sq-42');
  });

  it('omits schema_hash when the chosen profile has none', async () => {
    const plain: ServiceProfile = {
      ...BUS_SERVICE,
      capabilitySchemas: undefined,
    };
    const coreSeen: CoreSend[] = [];
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([plain]),
      coreClient: stubCore({ seen: coreSeen }),
    });
    await orch.issueQuery({ capability: 'eta_query', params: {} });
    expect(coreSeen[0].schemaHash).toBeUndefined();
  });

  it('throws no_candidate when AppView returns nothing', async () => {
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([]),
      coreClient: stubCore(),
    });
    try {
      await orch.issueQuery({ capability: 'eta_query', params: {} });
      fail('expected no_candidate');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceOrchestratorError);
      expect((err as ServiceOrchestratorError).code).toBe('no_candidate');
    }
  });

  it('wraps sendServiceQuery errors as send_failed', async () => {
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE]),
      coreClient: stubCore({ sendError: new Error('network down') }),
    });
    try {
      await orch.issueQuery({ capability: 'eta_query', params: {} });
      fail('expected send_failed');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceOrchestratorError);
      expect((err as ServiceOrchestratorError).code).toBe('send_failed');
      expect((err as Error).message).toMatch(/network down/);
    }
  });

  it('returns synchronously — never awaits a response', async () => {
    // Sanity check: if the orchestrator were polling/awaiting, wiring an
    // unresolved response would hang indefinitely. We don't simulate a
    // response at all and expect the call to resolve.
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE]),
      coreClient: stubCore(),
    });
    const result = await Promise.race([
      orch.issueQuery({ capability: 'eta_query', params: {} }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('hang')), 50)),
    ]);
    expect((result as { taskId: string }).taskId).toBe('sq-1');
  });

  it('preserves our queryId when Core echoes a blank one', async () => {
    const orch = new ServiceQueryOrchestrator({
      appViewClient: stubAppView([BUS_SERVICE]),
      coreClient: stubCore({
        result: { taskId: 'sq-1', queryId: '', deduped: false },
      }),
      generateQueryId: () => 'q-local',
    });
    const result = await orch.issueQuery({
      capability: 'eta_query',
      params: {},
    });
    expect(result.queryId).toBe('q-local');
  });
});
