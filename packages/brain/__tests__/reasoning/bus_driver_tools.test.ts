/**
 * Bus Driver tool factories — mocked dependency tests.
 */

import {
  createGeocodeTool,
  createSearchPublicServicesTool,
  createQueryServiceTool,
} from '../../src/reasoning/bus_driver_tools';
import type { ServiceProfile } from '../../src/appview_client/http';

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return jest.fn(async (input, init) => impl(String(input), init ?? {})) as unknown as typeof globalThis.fetch;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createGeocodeTool', () => {
  const SF_LAT = 37.76;
  const SF_LNG = -122.42;

  it('returns lat/lng/display_name for a valid address', async () => {
    const fetchFn = mockFetch(() => okJson([{
      lat: String(SF_LAT),
      lon: String(SF_LNG),
      display_name: 'Castro, San Francisco, California, USA',
    }]));
    const tool = createGeocodeTool({ fetch: fetchFn, minGapMs: 0 });
    const result = await tool.execute({ address: 'Castro, SF' }) as { lat: number; lng: number; display_name: string };
    expect(result.lat).toBe(SF_LAT);
    expect(result.lng).toBe(SF_LNG);
    expect(result.display_name).toContain('San Francisco');
  });

  it('sends User-Agent header per Nominatim usage policy', async () => {
    const fetchFn = mockFetch(() => okJson([{ lat: '0', lon: '0' }]));
    const tool = createGeocodeTool({
      fetch: fetchFn,
      userAgent: 'test-ua/1.0 (dev@example.com)',
      minGapMs: 0,
    });
    await tool.execute({ address: 'Anywhere' });
    const [, init] = (fetchFn as jest.Mock).mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('test-ua/1.0 (dev@example.com)');
  });

  it('throws on empty address', async () => {
    const fetchFn = mockFetch(() => okJson([]));
    const tool = createGeocodeTool({ fetch: fetchFn, minGapMs: 0 });
    await expect(tool.execute({ address: '' })).rejects.toThrow(/required/);
  });

  it('throws when Nominatim returns no results', async () => {
    const fetchFn = mockFetch(() => okJson([]));
    const tool = createGeocodeTool({ fetch: fetchFn, minGapMs: 0 });
    await expect(tool.execute({ address: 'Atlantis' })).rejects.toThrow(/no result/);
  });

  it('throws with HTTP status on non-2xx', async () => {
    const fetchFn = mockFetch(() => new Response('', { status: 503 }));
    const tool = createGeocodeTool({ fetch: fetchFn, minGapMs: 0 });
    await expect(tool.execute({ address: 'X' })).rejects.toThrow(/HTTP 503/);
  });

  it('throws on malformed coordinates', async () => {
    const fetchFn = mockFetch(() => okJson([{ lat: 'banana', lon: 'oops' }]));
    const tool = createGeocodeTool({ fetch: fetchFn, minGapMs: 0 });
    await expect(tool.execute({ address: 'x' })).rejects.toThrow(/malformed/);
  });

  it('rate-limits between calls (gap >= minGapMs)', async () => {
    const fetchFn = mockFetch(() => okJson([{ lat: '0', lon: '0' }]));
    const tool = createGeocodeTool({ fetch: fetchFn, minGapMs: 50 });
    const t0 = Date.now();
    await tool.execute({ address: 'a' });
    await tool.execute({ address: 'b' });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});

describe('createSearchPublicServicesTool', () => {
  const sampleProfile: ServiceProfile = {
    did: 'did:plc:busdriver',
    name: 'Bus 42',
    capabilities: ['eta_query'],
    responsePolicy: { eta_query: 'auto' },
    capabilitySchemas: {
      eta_query: {
        params: {},
        result: {},
        schemaHash: 'sha256:abc',
      },
    },
    isPublic: true,
    distanceKm: 2.3,
  };

  it('calls AppView with the right params and returns trimmed profiles', async () => {
    const calls: unknown[] = [];
    const tool = createSearchPublicServicesTool({
      appViewClient: {
        async searchServices(params) {
          calls.push(params);
          return [sampleProfile];
        },
      },
    });
    const result = await tool.execute({
      capability: 'eta_query',
      lat: 37.77,
      lng: -122.41,
      radius_km: 5,
    });
    expect(calls[0]).toMatchObject({ capability: 'eta_query', lat: 37.77, lng: -122.41, radiusKm: 5 });
    const profiles = result as Array<{ did: string; schema_hashes?: Record<string, string> }>;
    expect(profiles).toHaveLength(1);
    expect(profiles[0].did).toBe('did:plc:busdriver');
    expect(profiles[0].schema_hashes).toEqual({ eta_query: 'sha256:abc' });
  });

  it('throws on missing capability', async () => {
    const tool = createSearchPublicServicesTool({
      appViewClient: { searchServices: async () => [] },
    });
    await expect(tool.execute({ capability: '' })).rejects.toThrow(/required/);
  });

  it('caps results to resultLimit', async () => {
    const manyProfiles = Array.from({ length: 10 }, (_, i) => ({
      ...sampleProfile,
      did: `did:plc:bus${i}`,
    }));
    const tool = createSearchPublicServicesTool({
      appViewClient: { searchServices: async () => manyProfiles },
      resultLimit: 3,
    });
    const result = await tool.execute({ capability: 'eta_query' });
    expect((result as unknown[]).length).toBe(3);
  });

  it('omits schema_hashes when no profile carries one', async () => {
    const tool = createSearchPublicServicesTool({
      appViewClient: {
        async searchServices() {
          return [{ ...sampleProfile, capabilitySchemas: undefined }];
        },
      },
    });
    const [profile] = await tool.execute({ capability: 'eta_query' }) as Array<Record<string, unknown>>;
    expect(profile.schema_hashes).toBeUndefined();
  });
});

describe('createQueryServiceTool', () => {
  it('calls orchestrator.issueQueryToDID with the exact operator_did + schema_hash (issue #7/#8)', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const tool = createQueryServiceTool({
      orchestrator: {
        async issueQueryToDID(req) {
          calls.push(req as unknown as Record<string, unknown>);
          return {
            queryId: 'q-1',
            taskId: 'svc-q-1',
            toDID: req.toDID,
            serviceName: req.serviceName ?? req.toDID,
            deduped: false,
          };
        },
      },
    });
    const result = await tool.execute({
      operator_did: 'did:plc:busdriver',
      capability: 'eta_query',
      params: { route: '42' },
      schema_hash: 'sha256:abc',
      ttl_seconds: 60,
    }) as Record<string, unknown>;
    expect(result).toMatchObject({
      task_id: 'svc-q-1',
      query_id: 'q-1',
      to_did: 'did:plc:busdriver',
      deduped: false,
      status: 'pending',
    });
    // The tool MUST forward the LLM's chosen DID + schema_hash verbatim
    // — this is the whole point of the refactor.
    expect(calls[0]).toMatchObject({
      toDID: 'did:plc:busdriver',
      capability: 'eta_query',
      params: { route: '42' },
      ttlSeconds: 60,
      schemaHash: 'sha256:abc',
      originChannel: 'ask',
    });
  });

  it('throws when operator_did or capability is empty', async () => {
    const tool = createQueryServiceTool({
      orchestrator: {
        issueQueryToDID: async () => { throw new Error('unreachable'); },
      },
    });
    await expect(tool.execute({
      operator_did: '', capability: 'eta_query', params: {},
    })).rejects.toThrow(/required/);
    await expect(tool.execute({
      operator_did: 'did:plc:x', capability: '', params: {},
    })).rejects.toThrow(/required/);
  });
});
