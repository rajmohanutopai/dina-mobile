/**
 * T2A.3 — Server health endpoints and startup validation.
 *
 * Category B: contract test using real HTTP harness.
 *
 * Source: core/test/server_test.go
 */

import { CoreTestHarness } from '@dina/test-harness';

describe('Server Health', () => {
  let harness: CoreTestHarness | null = null;

  beforeAll(async () => {
    harness = await CoreTestHarness.tryCreate();
  });


  afterAll(async () => {
    if (harness) await harness.teardown();
  });

  function requireHarness(): CoreTestHarness {
    if (!harness) expect("harness").toBe("available (socket binding failed)");
    return harness!;
  }

  describe('/healthz (liveness)', () => {
    it('returns 200', async () => {
      const res = await requireHarness().request('GET', '/healthz');
      expect(res.status).toBe(200);
    });

    it('returns JSON body with status field', async () => {
      const res = await requireHarness().request('GET', '/healthz');
      expect(res.body).toHaveProperty('status');
    });

    it('does not require authentication', async () => {
      // No `as` option — anonymous request
      const res = await requireHarness().request('GET', '/healthz');
      expect(res.status).toBe(200);
    });

    it('responds with correct Content-Type', async () => {
      const res = await requireHarness().request('GET', '/healthz');
      expect(res.headers['content-type']).toContain('application/json');
    });
  });

  describe('/readyz (readiness)', () => {
    it('returns 200 when ready', async () => {
      const res = await requireHarness().request('GET', '/readyz');
      expect(res.status).toBe(200);
    });

    it('returns JSON body with status field', async () => {
      const res = await requireHarness().request('GET', '/readyz');
      expect(res.body).toHaveProperty('status');
    });

    it('does not require authentication', async () => {
      const res = await requireHarness().request('GET', '/readyz');
      expect(res.status).toBe(200);
    });
  });

  describe('server behavior', () => {
    it('serves on assigned port', async () => {
      expect(requireHarness().baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });

    it('rejects unsupported methods gracefully', async () => {
      const res = await requireHarness().request('PATCH', '/healthz');
      // Should return 404 (no PATCH route registered) rather than crash
      expect(res.status).toBe(404);
    });
  });
});
