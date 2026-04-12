/**
 * T2.83 — Notify endpoint: POST /v1/notify with guardian priority.
 *
 * Source: ARCHITECTURE.md Task 2.83
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { resetNotifyState, getNotifications } from '../../src/server/routes/notify';
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

describe('Notify HTTP Endpoint', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetNotifyState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    app = createCoreApp();
  });

  describe('POST /v1/notify — queue notification', () => {
    it('creates a tier-1 (fiduciary) notification with high priority + interrupt', async () => {
      const res = await signedPost(app, '/v1/notify', {
        title: 'Security Alert',
        body: 'Unusual login detected',
        tier: 1,
      });
      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^notify-/);
      expect(res.body.priority).toBe('high');
      expect(res.body.interrupt).toBe(true);
      expect(res.body.deferred).toBe(false);
    });

    it('creates a tier-2 (solicited) notification with default priority', async () => {
      const res = await signedPost(app, '/v1/notify', {
        title: 'New Message',
        body: 'Alice sent you a message',
        tier: 2,
      });
      expect(res.status).toBe(201);
      expect(res.body.priority).toBe('default');
      expect(res.body.interrupt).toBe(false);
      expect(res.body.deferred).toBe(false);
    });

    it('creates a tier-3 (engagement) notification with low priority + deferred', async () => {
      const res = await signedPost(app, '/v1/notify', {
        title: 'Daily Digest',
        body: 'Your briefing is ready',
        tier: 3,
      });
      expect(res.status).toBe(201);
      expect(res.body.priority).toBe('low');
      expect(res.body.interrupt).toBe(false);
      expect(res.body.deferred).toBe(true);
    });

    it('stores notification in queue', async () => {
      await signedPost(app, '/v1/notify', {
        title: 'Test',
        body: 'Test body',
        tier: 2,
        persona: 'work',
      });

      const notifications = getNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Test');
      expect(notifications[0].persona).toBe('work');
    });

    it('defaults persona to general', async () => {
      await signedPost(app, '/v1/notify', {
        title: 'Test',
        body: 'Test body',
        tier: 1,
      });

      const notifications = getNotifications();
      expect(notifications[0].persona).toBe('general');
    });

    it('rejects missing title', async () => {
      const res = await signedPost(app, '/v1/notify', { body: 'test', tier: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('title is required');
    });

    it('rejects missing body', async () => {
      const res = await signedPost(app, '/v1/notify', { title: 'test', tier: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('body is required');
    });

    it('rejects invalid tier', async () => {
      const res = await signedPost(app, '/v1/notify', { title: 'test', body: 'test', tier: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('tier must be');
    });

    it('rejects missing tier', async () => {
      const res = await signedPost(app, '/v1/notify', { title: 'test', body: 'test' });
      expect(res.status).toBe(400);
    });

    it('assigns incremental IDs', async () => {
      const res1 = await signedPost(app, '/v1/notify', { title: 'A', body: 'A', tier: 1 });
      const res2 = await signedPost(app, '/v1/notify', { title: 'B', body: 'B', tier: 2 });
      expect(res1.body.id).toBe('notify-1');
      expect(res2.body.id).toBe('notify-2');
    });
  });
});
