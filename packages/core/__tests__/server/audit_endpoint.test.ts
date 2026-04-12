/**
 * T2.79 — Audit endpoints: append, query, verify.
 *
 * Source: ARCHITECTURE.md Task 2.79
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { resetAuditState } from '../../src/audit/service';
import { TEST_ED25519_SEED } from '@dina/test-harness';

const pubKey = getPublicKey(TEST_ED25519_SEED);
const did = deriveDIDKey(pubKey);

function splitPQ(url: string): [string, string] {
  const i = url.indexOf('?');
  return i >= 0 ? [url.slice(0, i), url.slice(i + 1)] : [url, ''];
}

function signedPost(app: any, url: string, body: Record<string, unknown>) {
  const [path, query] = splitPQ(url);
  const bodyStr = JSON.stringify(body);
  const bodyBytes = new Uint8Array(Buffer.from(bodyStr));
  const headers = signRequest('POST', path, query, bodyBytes, TEST_ED25519_SEED, did);
  return request(app).post(url)
    .set('X-DID', headers['X-DID']).set('X-Timestamp', headers['X-Timestamp'])
    .set('X-Nonce', headers['X-Nonce']).set('X-Signature', headers['X-Signature'])
    .set('Content-Type', 'application/octet-stream').send(Buffer.from(bodyStr));
}

function signedGet(app: any, url: string) {
  const [path, query] = splitPQ(url);
  const headers = signRequest('GET', path, query, new Uint8Array(0), TEST_ED25519_SEED, did);
  return request(app).get(url)
    .set('X-DID', headers['X-DID']).set('X-Timestamp', headers['X-Timestamp'])
    .set('X-Nonce', headers['X-Nonce']).set('X-Signature', headers['X-Signature']);
}

describe('Audit Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetAuditState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    app = createCoreApp();
  });

  describe('POST /v1/audit/append', () => {
    it('appends entry and returns seq + hash', async () => {
      const res = await signedPost(app, '/v1/audit/append', {
        actor: 'brain', action: 'vault_store', resource: 'general', detail: 'stored 5 items',
      });
      expect(res.status).toBe(201);
      expect(res.body.seq).toBe(1);
      expect(res.body.entry_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('sequential entries have incrementing seq', async () => {
      await signedPost(app, '/v1/audit/append', { actor: 'a', action: 'x', resource: 'r' });
      const res = await signedPost(app, '/v1/audit/append', { actor: 'b', action: 'y', resource: 's' });
      expect(res.body.seq).toBe(2);
    });

    it('rejects missing required fields', async () => {
      const res = await signedPost(app, '/v1/audit/append', { actor: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/audit/query', () => {
    it('returns all entries', async () => {
      await signedPost(app, '/v1/audit/append', { actor: 'brain', action: 'store', resource: 'general' });
      await signedPost(app, '/v1/audit/append', { actor: 'brain', action: 'query', resource: 'health' });
      const res = await signedGet(app, '/v1/audit/query');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });

    it('filters by actor', async () => {
      await signedPost(app, '/v1/audit/append', { actor: 'brain', action: 'store', resource: 'g' });
      await signedPost(app, '/v1/audit/append', { actor: 'device', action: 'read', resource: 'g' });
      const res = await signedGet(app, '/v1/audit/query?actor=brain');
      expect(res.body.count).toBe(1);
    });

    it('filters by action', async () => {
      await signedPost(app, '/v1/audit/append', { actor: 'a', action: 'vault_store', resource: 'r' });
      await signedPost(app, '/v1/audit/append', { actor: 'a', action: 'vault_query', resource: 'r' });
      const res = await signedGet(app, '/v1/audit/query?action=vault_store');
      expect(res.body.count).toBe(1);
    });
  });

  describe('GET /v1/audit/verify', () => {
    it('empty chain is valid', async () => {
      const res = await signedGet(app, '/v1/audit/verify');
      expect(res.body.valid).toBe(true);
    });

    it('valid chain after appends', async () => {
      await signedPost(app, '/v1/audit/append', { actor: 'a', action: 'x', resource: 'r' });
      await signedPost(app, '/v1/audit/append', { actor: 'b', action: 'y', resource: 's' });
      const res = await signedGet(app, '/v1/audit/verify');
      expect(res.body.valid).toBe(true);
      expect(res.body.total).toBe(2);
    });
  });
});
