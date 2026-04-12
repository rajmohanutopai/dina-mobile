/**
 * T2.82 — Export/Import stub endpoints.
 *
 * Both return 501 until Phase 9 implementation.
 * Tests verify the routes are mounted and auth-protected.
 *
 * Source: ARCHITECTURE.md Task 2.82
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { TEST_ED25519_SEED } from '@dina/test-harness';

const pubKey = getPublicKey(TEST_ED25519_SEED);
const did = deriveDIDKey(pubKey);

function splitPathQuery(url: string): [string, string] {
  const idx = url.indexOf('?');
  return idx >= 0 ? [url.slice(0, idx), url.slice(idx + 1)] : [url, ''];
}

function signedPost(app: any, url: string, body: Record<string, unknown>) {
  const [path, query] = splitPathQuery(url);
  const bodyStr = JSON.stringify(body);
  const bodyBytes = new Uint8Array(Buffer.from(bodyStr));
  const headers = signRequest('POST', path, query, bodyBytes, TEST_ED25519_SEED, did);
  return request(app).post(url)
    .set('X-DID', headers['X-DID']).set('X-Timestamp', headers['X-Timestamp'])
    .set('X-Nonce', headers['X-Nonce']).set('X-Signature', headers['X-Signature'])
    .set('Content-Type', 'application/octet-stream').send(Buffer.from(bodyStr));
}

describe('Export/Import Stub Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    // Export/import require 'admin' per authz matrix
    registerService(did, 'admin');
    app = createCoreApp();
  });

  describe('POST /v1/export — stub', () => {
    it('returns 501 Not Implemented', async () => {
      const res = await signedPost(app, '/v1/export', {});
      expect(res.status).toBe(501);
      expect(res.body.error).toContain('not yet implemented');
      expect(res.body.phase).toBe(9);
    });
  });

  describe('POST /v1/import — stub', () => {
    it('returns 501 Not Implemented', async () => {
      const res = await signedPost(app, '/v1/import', {});
      expect(res.status).toBe(501);
      expect(res.body.error).toContain('not yet implemented');
      expect(res.body.phase).toBe(9);
    });
  });

  describe('auth enforcement', () => {
    it('rejects unauthenticated export request', async () => {
      const res = await request(app).post('/v1/export')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('{}'));
      expect(res.status).toBe(401);
    });

    it('rejects brain-role export request (admin only)', async () => {
      resetMiddlewareState(); resetCallerTypeState();
      registerPublicKeyResolver((d) => d === did ? pubKey : null);
      registerService(did, 'brain');
      app = createCoreApp();

      const res = await signedPost(app, '/v1/export', {});
      expect(res.status).toBe(403);
    });
  });
});
