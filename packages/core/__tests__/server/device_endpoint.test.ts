/**
 * T2.78 — Device endpoints: list, register, get, revoke.
 *
 * Source: ARCHITECTURE.md Task 2.78
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { resetDeviceRegistry } from '../../src/devices/registry';
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

function signedDelete(app: any, url: string) {
  const [path, query] = splitPathQuery(url);
  const headers = signRequest('DELETE', path, query, new Uint8Array(0), TEST_ED25519_SEED, did);
  return request(app).delete(url)
    .set('X-DID', headers['X-DID']).set('X-Timestamp', headers['X-Timestamp'])
    .set('X-Nonce', headers['X-Nonce']).set('X-Signature', headers['X-Signature']);
}

describe('Device HTTP Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetDeviceRegistry();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    // Device endpoints require 'admin' role per authz matrix
    registerService(did, 'admin');
    app = createCoreApp();
  });

  describe('POST /v1/devices — register device', () => {
    it('registers a device and returns ID + name + role', async () => {
      const res = await signedPost(app, '/v1/devices', {
        name: 'iPhone 15', publicKeyMultibase: 'z6MkTest1', role: 'rich',
      });
      expect(res.status).toBe(201);
      expect(res.body.deviceId).toMatch(/^dev-/);
      expect(res.body.deviceName).toBe('iPhone 15');
      expect(res.body.role).toBe('rich');
    });

    it('defaults role to rich when omitted', async () => {
      const res = await signedPost(app, '/v1/devices', {
        name: 'Test', publicKeyMultibase: 'z6MkTest2',
      });
      expect(res.status).toBe(201);
      expect(res.body.role).toBe('rich');
    });

    it('rejects missing name', async () => {
      const res = await signedPost(app, '/v1/devices', {
        publicKeyMultibase: 'z6MkTest3',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name is required');
    });

    it('rejects missing publicKeyMultibase', async () => {
      const res = await signedPost(app, '/v1/devices', { name: 'Test' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('publicKeyMultibase is required');
    });

    it('rejects invalid role', async () => {
      const res = await signedPost(app, '/v1/devices', {
        name: 'Test', publicKeyMultibase: 'z6MkTest4', role: 'invalid',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('role must be one of');
    });

    it('returns 409 for duplicate public key', async () => {
      await signedPost(app, '/v1/devices', {
        name: 'Device A', publicKeyMultibase: 'z6MkDup', role: 'rich',
      });
      const res = await signedPost(app, '/v1/devices', {
        name: 'Device B', publicKeyMultibase: 'z6MkDup', role: 'thin',
      });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /v1/devices — list all', () => {
    it('returns empty list when no devices', async () => {
      const res = await signedGet(app, '/v1/devices');
      expect(res.status).toBe(200);
      expect(res.body.devices).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    it('lists all registered devices', async () => {
      await signedPost(app, '/v1/devices', {
        name: 'Phone', publicKeyMultibase: 'z6MkP', role: 'rich',
      });
      await signedPost(app, '/v1/devices', {
        name: 'CLI', publicKeyMultibase: 'z6MkC', role: 'cli',
      });

      const res = await signedGet(app, '/v1/devices');
      expect(res.body.count).toBe(2);
      const names = res.body.devices.map((d: any) => d.deviceName);
      expect(names).toContain('Phone');
      expect(names).toContain('CLI');
    });
  });

  describe('GET /v1/devices/:id — get single', () => {
    it('returns device details', async () => {
      const createRes = await signedPost(app, '/v1/devices', {
        name: 'Phone', publicKeyMultibase: 'z6MkP', role: 'rich',
      });
      const id = createRes.body.deviceId;

      const res = await signedGet(app, `/v1/devices/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.deviceName).toBe('Phone');
      expect(res.body.revoked).toBe(false);
    });

    it('returns 404 for nonexistent device', async () => {
      const res = await signedGet(app, '/v1/devices/dev-nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/devices/:id — revoke', () => {
    it('revokes an existing device', async () => {
      const createRes = await signedPost(app, '/v1/devices', {
        name: 'Phone', publicKeyMultibase: 'z6MkP', role: 'rich',
      });
      const id = createRes.body.deviceId;

      const res = await signedDelete(app, `/v1/devices/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.revoked).toBe(true);
    });

    it('returns 404 for nonexistent device', async () => {
      const res = await signedDelete(app, '/v1/devices/dev-nonexistent');
      expect(res.status).toBe(404);
    });

    it('revoked device shows revoked=true in list', async () => {
      const createRes = await signedPost(app, '/v1/devices', {
        name: 'Phone', publicKeyMultibase: 'z6MkP', role: 'rich',
      });
      const id = createRes.body.deviceId;

      await signedDelete(app, `/v1/devices/${id}`);

      const listRes = await signedGet(app, '/v1/devices');
      const device = listRes.body.devices.find((d: any) => d.deviceId === id);
      expect(device.revoked).toBe(true);
    });

    it('revoked device still visible via GET (audit trail)', async () => {
      const createRes = await signedPost(app, '/v1/devices', {
        name: 'Phone', publicKeyMultibase: 'z6MkP', role: 'rich',
      });
      const id = createRes.body.deviceId;

      await signedDelete(app, `/v1/devices/${id}`);

      const res = await signedGet(app, `/v1/devices/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.revoked).toBe(true);
    });
  });
});
