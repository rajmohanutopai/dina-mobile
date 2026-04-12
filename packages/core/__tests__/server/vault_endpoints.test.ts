/**
 * T2.70 — Vault HTTP endpoints: query, store, batch, get, KV.
 *
 * Source: ARCHITECTURE.md Task 2.70
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { clearVaults } from '../../src/vault/crud';
import { resetKVStore } from '../../src/kv/store';
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

describe('Vault HTTP Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); clearVaults(); resetKVStore();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    app = createCoreApp();
  });

  describe('POST /v1/vault/store', () => {
    it('stores item and returns ID', async () => {
      const res = await signedPost(app, '/v1/vault/store?persona=general', { summary: 'Test item', type: 'note' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
    });
  });

  describe('POST /v1/vault/query', () => {
    it('searches and returns matching items', async () => {
      await signedPost(app, '/v1/vault/store?persona=general', { summary: 'Budget report Q4', type: 'note', body: '' });
      const res = await signedPost(app, '/v1/vault/query?persona=general', { text: 'budget', limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('returns empty for no matches', async () => {
      const res = await signedPost(app, '/v1/vault/query?persona=general', { text: 'nonexistent' });
      expect(res.body.items).toHaveLength(0);
    });
  });

  describe('POST /v1/vault/store/batch', () => {
    it('stores multiple items', async () => {
      const items = [{ summary: 'A', type: 'note' }, { summary: 'B', type: 'note' }];
      const res = await signedPost(app, '/v1/vault/store/batch?persona=general', { items });
      expect(res.status).toBe(201);
      expect(res.body.ids).toHaveLength(2);
    });

    it('rejects non-array items', async () => {
      const res = await signedPost(app, '/v1/vault/store/batch', { items: 'not-array' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/vault/item/:id', () => {
    it('retrieves stored item', async () => {
      const storeRes = await signedPost(app, '/v1/vault/store?persona=general', { summary: 'Find me', type: 'note' });
      const id = storeRes.body.id;
      const res = await signedGet(app, `/v1/vault/item/${id}?persona=general`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toBe('Find me');
    });

    it('returns 404 for missing item', async () => {
      const res = await signedGet(app, '/v1/vault/item/nonexistent?persona=general');
      expect(res.status).toBe(404);
    });
  });

  describe('KV endpoints', () => {
    it('PUT → GET round-trip', async () => {
      const bodyStr = JSON.stringify({ value: 'dark-mode' });
      const bodyBytes = new Uint8Array(Buffer.from(bodyStr));
      const headers = signRequest('PUT', '/v1/vault/kv/theme', '', bodyBytes, TEST_ED25519_SEED, did);
      await request(app).put('/v1/vault/kv/theme')
        .set('X-DID', headers['X-DID']).set('X-Timestamp', headers['X-Timestamp'])
        .set('X-Nonce', headers['X-Nonce']).set('X-Signature', headers['X-Signature'])
        .set('Content-Type', 'application/octet-stream').send(Buffer.from(bodyStr));

      const res = await signedGet(app, '/v1/vault/kv/theme');
      expect(res.status).toBe(200);
      expect(res.body.value).toBe('dark-mode');
    });

    it('GET missing key → 404', async () => {
      const res = await signedGet(app, '/v1/vault/kv/missing');
      expect(res.status).toBe(404);
    });
  });
});
