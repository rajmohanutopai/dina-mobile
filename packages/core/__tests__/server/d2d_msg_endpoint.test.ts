/**
 * T2.81 — D2D messaging stub endpoints.
 *
 * Both return 501 until Phase 6 implementation.
 * Tests verify routes are mounted and auth-protected.
 *
 * Source: ARCHITECTURE.md Task 2.81
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

function signedGet(app: any, url: string) {
  const [path, query] = splitPathQuery(url);
  const headers = signRequest('GET', path, query, new Uint8Array(0), TEST_ED25519_SEED, did);
  return request(app).get(url)
    .set('X-DID', headers['X-DID']).set('X-Timestamp', headers['X-Timestamp'])
    .set('X-Nonce', headers['X-Nonce']).set('X-Signature', headers['X-Signature']);
}

describe('D2D Messaging Stub Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    // D2D messaging requires 'brain' per authz matrix
    registerService(did, 'brain');
    app = createCoreApp();
  });

  describe('POST /v1/msg/send — stub', () => {
    it('returns 501 Not Implemented', async () => {
      const res = await signedPost(app, '/v1/msg/send', {
        recipient: 'did:key:z6MkAlice', type: 'social.update',
      });
      expect(res.status).toBe(501);
      expect(res.body.error).toContain('not yet implemented');
      expect(res.body.phase).toBe(6);
    });
  });

  describe('GET /v1/msg/inbox — stub', () => {
    it('returns 501 Not Implemented', async () => {
      const res = await signedGet(app, '/v1/msg/inbox');
      expect(res.status).toBe(501);
      expect(res.body.error).toContain('not yet implemented');
      expect(res.body.phase).toBe(6);
    });
  });

  describe('auth enforcement', () => {
    it('rejects unauthenticated send request', async () => {
      const res = await request(app).post('/v1/msg/send')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('{}'));
      expect(res.status).toBe(401);
    });

    it('rejects device-role send request (brain only)', async () => {
      resetMiddlewareState(); resetCallerTypeState();
      registerPublicKeyResolver((d) => d === did ? pubKey : null);
      registerService(did, 'admin');
      app = createCoreApp();

      const res = await signedPost(app, '/v1/msg/send', {});
      expect(res.status).toBe(403);
    });
  });
});
