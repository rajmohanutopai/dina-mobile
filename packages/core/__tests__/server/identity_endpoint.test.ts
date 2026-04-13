/**
 * T2.73 — Identity endpoints: DID get, sign, verify, document.
 *
 * Source: ARCHITECTURE.md Task 2.73
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { registerIdentity, resetIdentityState } from '../../src/server/routes/identity';
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

describe('Identity HTTP Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetIdentityState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    registerIdentity(TEST_ED25519_SEED);
    app = createCoreApp();
  });

  describe('GET /v1/did — get current DID', () => {
    it('returns current DID and multibase public key', async () => {
      const res = await signedGet(app, '/v1/did');
      expect(res.status).toBe(200);
      expect(res.body.did).toBe(did);
      expect(res.body.publicKeyMultibase).toMatch(/^z6Mk/);
    });

    it('returns 503 when identity not initialized', async () => {
      resetIdentityState();
      const res = await signedGet(app, '/v1/did');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not initialized');
    });
  });

  describe('POST /v1/did/sign — sign payload', () => {
    it('signs a payload and returns signature + signer', async () => {
      const payload = { action: 'test', value: 42 };
      const res = await signedPost(app, '/v1/did/sign', { payload });
      expect(res.status).toBe(200);
      expect(res.body.signature).toHaveLength(128); // 64-byte hex
      expect(res.body.signer).toBe(did);
      expect(res.body.canonical).toBeTruthy();
    });

    it('produces deterministic canonical JSON', async () => {
      // Keys in different order → same canonical
      const res1 = await signedPost(app, '/v1/did/sign', { payload: { b: 2, a: 1 } });
      const res2 = await signedPost(app, '/v1/did/sign', { payload: { a: 1, b: 2 } });
      expect(res1.body.canonical).toBe(res2.body.canonical);
    });

    it('rejects missing payload', async () => {
      const res = await signedPost(app, '/v1/did/sign', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('payload is required');
    });

    it('rejects non-object payload', async () => {
      const res = await signedPost(app, '/v1/did/sign', { payload: 'string' });
      expect(res.status).toBe(400);
    });

    it('returns 503 when identity not initialized', async () => {
      resetIdentityState();
      const res = await signedPost(app, '/v1/did/sign', { payload: { test: true } });
      expect(res.status).toBe(503);
    });
  });

  describe('POST /v1/did/verify — verify signature', () => {
    it('verifies a valid signature', async () => {
      // First sign something
      const payload = { message: 'hello world' };
      const signRes = await signedPost(app, '/v1/did/sign', { payload });
      const { signature, signer } = signRes.body;

      // Then verify it
      const verifyRes = await signedPost(app, '/v1/did/verify', {
        payload,
        signature,
        signer,
      });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(true);
      expect(verifyRes.body.signer).toBe(did);
    });

    it('rejects tampered payload', async () => {
      const payload = { message: 'original' };
      const signRes = await signedPost(app, '/v1/did/sign', { payload });
      const { signature, signer } = signRes.body;

      const verifyRes = await signedPost(app, '/v1/did/verify', {
        payload: { message: 'tampered' },
        signature,
        signer,
      });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(false);
    });

    it('rejects invalid signature hex', async () => {
      const verifyRes = await signedPost(app, '/v1/did/verify', {
        payload: { test: true },
        signature: 'deadbeef',
        signer: did,
      });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(false);
    });

    it('rejects missing payload', async () => {
      const res = await signedPost(app, '/v1/did/verify', { signature: 'abc', signer: did });
      expect(res.status).toBe(400);
    });

    it('rejects missing signature', async () => {
      const res = await signedPost(app, '/v1/did/verify', { payload: { a: 1 }, signer: did });
      expect(res.status).toBe(400);
    });

    it('rejects missing signer', async () => {
      const res = await signedPost(app, '/v1/did/verify', { payload: { a: 1 }, signature: 'abc' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/did/document — get DID document', () => {
    it('returns valid W3C DID document', async () => {
      const res = await signedGet(app, '/v1/did/document');
      expect(res.status).toBe(200);
      expect(res.body['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(res.body.id).toBe(did);
      expect(res.body.verificationMethod).toHaveLength(1);
      expect(res.body.verificationMethod[0].type).toBe('Multikey');
      expect(res.body.verificationMethod[0].publicKeyMultibase).toMatch(/^z6Mk/);
      expect(res.body.authentication).toContain(`${did}#key-1`);
    });

    it('returns 503 when identity not initialized', async () => {
      resetIdentityState();
      const res = await signedGet(app, '/v1/did/document');
      expect(res.status).toBe(503);
    });
  });
});
