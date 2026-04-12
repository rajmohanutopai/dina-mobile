/**
 * T2.71 — Staging HTTP endpoints: ingest, claim, resolve, fail, extend-lease.
 *
 * Source: ARCHITECTURE.md Task 2.71
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { resetStagingState, inboxSize } from '../../src/staging/service';
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

describe('Staging HTTP Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetStagingState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    app = createCoreApp();
  });

  describe('POST /v1/staging/ingest', () => {
    it('ingests item and returns ID', async () => {
      const res = await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'msg-001', data: { summary: 'Test' } });
      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^stg-/);
      expect(res.body.duplicate).toBe(false);
    });

    it('rejects duplicate with 409', async () => {
      await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'dup-001' });
      const res = await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'dup-001' });
      expect(res.status).toBe(409);
      expect(res.body.duplicate).toBe(true);
    });
  });

  describe('POST /v1/staging/claim', () => {
    it('claims received items', async () => {
      await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'c1' });
      await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'c2' });
      const res = await signedPost(app, '/v1/staging/claim?limit=10', {});
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });

    it('re-claim returns empty', async () => {
      await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'rc1' });
      await signedPost(app, '/v1/staging/claim', {});
      const res = await signedPost(app, '/v1/staging/claim', {});
      expect(res.body.count).toBe(0);
    });
  });

  describe('POST /v1/staging/resolve', () => {
    it('resolves claimed item → stored', async () => {
      const ingestRes = await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'r1' });
      await signedPost(app, '/v1/staging/claim', {});
      const res = await signedPost(app, '/v1/staging/resolve', { id: ingestRes.body.id, persona: 'general', persona_open: true });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('stored');
    });
  });

  describe('POST /v1/staging/fail', () => {
    it('marks item as failed with retry count', async () => {
      const ingestRes = await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'f1' });
      await signedPost(app, '/v1/staging/claim', {});
      const res = await signedPost(app, '/v1/staging/fail', { id: ingestRes.body.id });
      expect(res.status).toBe(200);
      expect(res.body.retry_count).toBe(1);
    });
  });

  describe('POST /v1/staging/extend-lease', () => {
    it('extends lease by N seconds', async () => {
      const ingestRes = await signedPost(app, '/v1/staging/ingest', { source: 'gmail', source_id: 'el1' });
      await signedPost(app, '/v1/staging/claim', {});
      const res = await signedPost(app, '/v1/staging/extend-lease', { id: ingestRes.body.id, seconds: 600 });
      expect(res.status).toBe(200);
      expect(res.body.extended_by).toBe(600);
    });
  });

  describe('full lifecycle', () => {
    it('ingest → claim → resolve', async () => {
      const ingest = await signedPost(app, '/v1/staging/ingest', { source: 'test', source_id: 'lc1', data: { summary: 'Lifecycle' } });
      expect(ingest.status).toBe(201);

      const claim = await signedPost(app, '/v1/staging/claim?limit=1', {});
      expect(claim.body.count).toBe(1);

      const resolve = await signedPost(app, '/v1/staging/resolve', { id: ingest.body.id, persona: 'general' });
      expect(resolve.body.status).toBe('stored');
    });
  });
});
