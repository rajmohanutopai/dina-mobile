/**
 * T2.77 — Reminder endpoints: create, list pending, list by persona, delete.
 *
 * Source: ARCHITECTURE.md Task 2.77
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { resetReminderState } from '../../src/reminders/service';
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

describe('Reminder HTTP Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetReminderState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    app = createCoreApp();
  });

  describe('POST /v1/reminder — create', () => {
    it('creates a reminder and returns id + due_at + persona', async () => {
      const dueAt = Date.now() + 3600_000;
      const res = await signedPost(app, '/v1/reminder', {
        message: 'Call the dentist',
        due_at: dueAt,
        persona: 'general',
      });
      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^rem-/);
      expect(res.body.due_at).toBe(dueAt);
      expect(res.body.persona).toBe('general');
    });

    it('rejects missing message', async () => {
      const res = await signedPost(app, '/v1/reminder', { due_at: Date.now() + 1000 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    it('rejects missing due_at', async () => {
      const res = await signedPost(app, '/v1/reminder', { message: 'Test' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('due_at is required');
    });

    it('defaults persona to general', async () => {
      const res = await signedPost(app, '/v1/reminder', {
        message: 'Test',
        due_at: Date.now() + 1000,
      });
      expect(res.status).toBe(201);
      expect(res.body.persona).toBe('general');
    });

    it('deduplicates same source_item_id + kind + due_at + persona', async () => {
      const dueAt = Date.now() + 3600_000;
      const body = { message: 'Test', due_at: dueAt, persona: 'general', source_item_id: 'item-1', kind: 'auto' };
      const res1 = await signedPost(app, '/v1/reminder', body);
      const res2 = await signedPost(app, '/v1/reminder', body);
      expect(res1.body.id).toBe(res2.body.id);
    });

    it('accepts optional recurring field', async () => {
      const res = await signedPost(app, '/v1/reminder', {
        message: 'Weekly standup',
        due_at: Date.now() + 3600_000,
        persona: 'work',
        recurring: 'weekly',
      });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /v1/reminders/pending — list due', () => {
    it('returns empty when no reminders exist', async () => {
      const res = await signedGet(app, '/v1/reminders/pending');
      expect(res.status).toBe(200);
      expect(res.body.reminders).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    it('returns reminders that are due', async () => {
      const pastDue = Date.now() - 1000;
      await signedPost(app, '/v1/reminder', { message: 'Overdue task', due_at: pastDue, persona: 'general' });

      const res = await signedGet(app, '/v1/reminders/pending');
      expect(res.body.count).toBe(1);
      expect(res.body.reminders[0].message).toBe('Overdue task');
    });

    it('excludes future reminders', async () => {
      const future = Date.now() + 999_999_999;
      await signedPost(app, '/v1/reminder', { message: 'Future task', due_at: future, persona: 'general' });

      const res = await signedGet(app, '/v1/reminders/pending');
      expect(res.body.count).toBe(0);
    });

    it('accepts ?now query param to override current time', async () => {
      const dueAt = 1000;
      await signedPost(app, '/v1/reminder', { message: 'Old task', due_at: dueAt, persona: 'general' });

      const res = await signedGet(app, '/v1/reminders/pending?now=2000');
      expect(res.body.count).toBe(1);
    });
  });

  describe('GET /v1/reminders/:persona — list by persona', () => {
    it('returns reminders for a specific persona', async () => {
      await signedPost(app, '/v1/reminder', { message: 'Work task', due_at: Date.now() + 1000, persona: 'work' });
      await signedPost(app, '/v1/reminder', { message: 'General task', due_at: Date.now() + 2000, persona: 'general' });

      const res = await signedGet(app, '/v1/reminders/work');
      expect(res.body.count).toBe(1);
      expect(res.body.reminders[0].message).toBe('Work task');
    });

    it('returns empty for persona with no reminders', async () => {
      const res = await signedGet(app, '/v1/reminders/empty');
      expect(res.body.count).toBe(0);
    });
  });

  describe('DELETE /v1/reminder/:id — delete', () => {
    it('deletes an existing reminder', async () => {
      const createRes = await signedPost(app, '/v1/reminder', {
        message: 'Delete me',
        due_at: Date.now() + 1000,
        persona: 'general',
      });
      const id = createRes.body.id;

      const res = await signedDelete(app, `/v1/reminder/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('returns 404 for nonexistent reminder', async () => {
      const res = await signedDelete(app, '/v1/reminder/rem-nonexistent');
      expect(res.status).toBe(404);
    });

    it('deleted reminder no longer appears in pending', async () => {
      const pastDue = Date.now() - 1000;
      const createRes = await signedPost(app, '/v1/reminder', {
        message: 'Gone soon',
        due_at: pastDue,
        persona: 'general',
      });
      const id = createRes.body.id;

      await signedDelete(app, `/v1/reminder/${id}`);

      const pendingRes = await signedGet(app, '/v1/reminders/pending');
      expect(pendingRes.body.count).toBe(0);
    });
  });
});
