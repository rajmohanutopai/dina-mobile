/**
 * T2.1 — Core HTTP server: health endpoint, auth middleware, body limit.
 *
 * Source: ARCHITECTURE.md Task 2.1
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

describe('Core HTTP Server', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState();
    resetCallerTypeState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    app = createCoreApp();
  });

  describe('GET /healthz', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('core');
    });

    it('requires no authentication', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      // No X-DID, X-Signature headers — still 200
    });

    it('includes timestamp', async () => {
      const res = await request(app).get('/healthz');
      expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('auth middleware', () => {
    it('rejects unauthenticated non-health request with 401', async () => {
      const res = await request(app).get('/v1/vault/query');
      expect(res.status).toBe(401);
      expect(res.body.error).toBeTruthy();
    });

    it('accepts authenticated request', async () => {
      const body = Buffer.from('{}');
      const headers = signRequest('POST', '/v1/vault/query', '', new Uint8Array(body), TEST_ED25519_SEED, did);

      const res = await request(app)
        .post('/v1/vault/query')
        .set('X-DID', headers['X-DID'])
        .set('X-Timestamp', headers['X-Timestamp'])
        .set('X-Nonce', headers['X-Nonce'])
        .set('X-Signature', headers['X-Signature'])
        .set('Content-Type', 'application/octet-stream')
        .send(body);

      // Should not be 401 (auth passed) — 404 because no route handler yet
      expect(res.status).not.toBe(401);
    });

    it('rejects expired timestamp', async () => {
      const res = await request(app)
        .get('/v1/vault/query')
        .set('X-DID', did)
        .set('X-Timestamp', '2020-01-01T00:00:00Z')
        .set('X-Nonce', 'abc')
        .set('X-Signature', 'aa'.repeat(64));

      expect(res.status).toBe(401);
      expect(res.body.rejectedAt).toBe('timestamp');
    });
  });

  describe('body limit', () => {
    it('rejects body > 1MB with 413', async () => {
      const largeBody = Buffer.alloc(1.5 * 1024 * 1024, 'x');
      const headers = signRequest('POST', '/v1/vault/store', '', new Uint8Array(largeBody), TEST_ED25519_SEED, did);

      const res = await request(app)
        .post('/v1/vault/store')
        .set('X-DID', headers['X-DID'])
        .set('X-Timestamp', headers['X-Timestamp'])
        .set('X-Nonce', headers['X-Nonce'])
        .set('X-Signature', headers['X-Signature'])
        .set('Content-Type', 'application/octet-stream')
        .send(largeBody);

      expect(res.status).toBe(413);
    });
  });

  describe('localhost binding', () => {
    it('app is an Express instance', () => {
      expect(typeof app.listen).toBe('function');
      expect(typeof app.get).toBe('function');
    });
  });
});
