/**
 * T2.72 — Persona endpoints: list, create, unlock, lock.
 *
 * Source: ARCHITECTURE.md Task 2.72
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { resetPersonaState } from '../../src/persona/service';
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

describe('Persona HTTP Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetPersonaState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    // Persona unlock/lock require 'admin' role per authz matrix;
    // /v1/personas (list/create) also allows admin.
    registerService(did, 'admin');
    app = createCoreApp();
  });

  describe('POST /v1/personas — create', () => {
    it('creates a persona with default tier', async () => {
      const res = await signedPost(app, '/v1/personas', { name: 'work', tier: 'standard' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('work');
      expect(res.body.tier).toBe('standard');
    });

    it('defaults to standard tier when omitted', async () => {
      const res = await signedPost(app, '/v1/personas', { name: 'social' });
      expect(res.status).toBe(201);
      expect(res.body.tier).toBe('standard');
    });

    it('rejects empty name', async () => {
      const res = await signedPost(app, '/v1/personas', { name: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name is required');
    });

    it('rejects missing name', async () => {
      const res = await signedPost(app, '/v1/personas', { tier: 'standard' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid tier', async () => {
      const res = await signedPost(app, '/v1/personas', { name: 'test', tier: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('tier must be one of');
    });

    it('returns 409 for duplicate name', async () => {
      await signedPost(app, '/v1/personas', { name: 'work' });
      const res = await signedPost(app, '/v1/personas', { name: 'work' });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });
  });

  describe('GET /v1/personas — list', () => {
    it('returns empty list when no personas exist', async () => {
      const res = await signedGet(app, '/v1/personas');
      expect(res.status).toBe(200);
      expect(res.body.personas).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    it('lists created personas with tier and open state', async () => {
      await signedPost(app, '/v1/personas', { name: 'work', tier: 'standard' });
      await signedPost(app, '/v1/personas', { name: 'health', tier: 'sensitive' });

      const res = await signedGet(app, '/v1/personas');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      const names = res.body.personas.map((p: any) => p.name);
      expect(names).toContain('work');
      expect(names).toContain('health');
    });
  });

  describe('POST /v1/persona/unlock', () => {
    it('unlocks a standard persona without approval', async () => {
      await signedPost(app, '/v1/personas', { name: 'work', tier: 'standard' });
      const res = await signedPost(app, '/v1/persona/unlock', { name: 'work' });
      expect(res.status).toBe(200);
      expect(res.body.unlocked).toBe(true);
    });

    it('denies unlocking sensitive persona without approval', async () => {
      await signedPost(app, '/v1/personas', { name: 'health', tier: 'sensitive' });
      const res = await signedPost(app, '/v1/persona/unlock', { name: 'health' });
      expect(res.status).toBe(403);
    });

    it('unlocks sensitive persona with approval flag', async () => {
      await signedPost(app, '/v1/personas', { name: 'health', tier: 'sensitive' });
      const res = await signedPost(app, '/v1/persona/unlock', { name: 'health', approved: true });
      expect(res.status).toBe(200);
      expect(res.body.unlocked).toBe(true);
    });

    it('returns 404 for nonexistent persona', async () => {
      const res = await signedPost(app, '/v1/persona/unlock', { name: 'ghost' });
      expect(res.status).toBe(404);
    });

    it('rejects empty name', async () => {
      const res = await signedPost(app, '/v1/persona/unlock', { name: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/persona/lock', () => {
    it('locks an open persona', async () => {
      await signedPost(app, '/v1/personas', { name: 'work', tier: 'standard' });
      await signedPost(app, '/v1/persona/unlock', { name: 'work' });
      const res = await signedPost(app, '/v1/persona/lock', { name: 'work' });
      expect(res.status).toBe(200);
      expect(res.body.locked).toBe(true);
    });

    it('returns 404 for nonexistent persona', async () => {
      const res = await signedPost(app, '/v1/persona/lock', { name: 'ghost' });
      expect(res.status).toBe(404);
    });

    it('rejects empty name', async () => {
      const res = await signedPost(app, '/v1/persona/lock', { name: '' });
      expect(res.status).toBe(400);
    });

    it('lock then unlock verifies state change', async () => {
      await signedPost(app, '/v1/personas', { name: 'work', tier: 'standard' });
      await signedPost(app, '/v1/persona/unlock', { name: 'work' });

      // Verify it's open
      let list = await signedGet(app, '/v1/personas');
      const open = list.body.personas.find((p: any) => p.name === 'work');
      expect(open.isOpen).toBe(true);

      // Lock it
      await signedPost(app, '/v1/persona/lock', { name: 'work' });

      // Verify it's closed
      list = await signedGet(app, '/v1/personas');
      const closed = list.body.personas.find((p: any) => p.name === 'work');
      expect(closed.isOpen).toBe(false);
    });
  });
});
