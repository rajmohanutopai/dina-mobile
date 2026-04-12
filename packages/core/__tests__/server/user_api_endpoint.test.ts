/**
 * T2.80 — User-facing endpoints: /api/v1/ask + /api/v1/remember with polling.
 *
 * Source: ARCHITECTURE.md Task 2.80
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import {
  resetUserApiState, setAskHandler, setRememberHandler, getJob,
} from '../../src/server/routes/user_api';
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

/** Wait for a job to complete (in-process async). */
async function waitForJob(jobId: string, maxWait = 500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const job = getJob(jobId);
    if (job && job.status !== 'processing') return;
    await new Promise(r => setTimeout(r, 10));
  }
}

describe('User-Facing API Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetUserApiState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    // User-facing API is accessible by device (app UI)
    registerService(did, 'admin');
    app = createCoreApp();
  });

  describe('POST /api/v1/ask — submit question', () => {
    it('creates an ask job and returns 202', async () => {
      const res = await signedPost(app, '/api/v1/ask', { query: 'What is the weather?' });
      expect(res.status).toBe(202);
      expect(res.body.id).toMatch(/^job-ask-/);
      expect(res.body.status).toBe('processing');
    });

    it('rejects missing query', async () => {
      const res = await signedPost(app, '/api/v1/ask', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query is required');
    });

    it('defaults persona to general', async () => {
      const res = await signedPost(app, '/api/v1/ask', { query: 'test' });
      const job = getJob(res.body.id);
      expect(job!.persona).toBe('general');
    });

    it('accepts custom persona', async () => {
      const res = await signedPost(app, '/api/v1/ask', { query: 'test', persona: 'work' });
      const job = getJob(res.body.id);
      expect(job!.persona).toBe('work');
    });
  });

  describe('GET /api/v1/ask/:id/status — poll ask job', () => {
    it('returns completed status with result after processing', async () => {
      setAskHandler(async (query) => ({
        answer: `Answer to: ${query}`,
        sources: ['src-1'],
      }));

      const createRes = await signedPost(app, '/api/v1/ask', { query: 'What day is it?' });
      const jobId = createRes.body.id;

      await waitForJob(jobId);

      const res = await signedGet(app, `/api/v1/ask/${jobId}/status`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.result).toBe('Answer to: What day is it?');
      expect(res.body.sources).toContain('src-1');
      expect(res.body.completed_at).toBeTruthy();
    });

    it('returns failed status when handler throws', async () => {
      setAskHandler(async () => { throw new Error('LLM unavailable'); });

      const createRes = await signedPost(app, '/api/v1/ask', { query: 'test' });
      const jobId = createRes.body.id;

      await waitForJob(jobId);

      const res = await signedGet(app, `/api/v1/ask/${jobId}/status`);
      expect(res.body.status).toBe('failed');
      expect(res.body.error).toContain('LLM unavailable');
    });

    it('returns 404 for nonexistent job', async () => {
      const res = await signedGet(app, '/api/v1/ask/job-ask-999/status');
      expect(res.status).toBe(404);
    });

    it('returns 404 when asking for remember job as ask', async () => {
      const createRes = await signedPost(app, '/api/v1/remember', { text: 'test' });
      await waitForJob(createRes.body.id);

      const res = await signedGet(app, `/api/v1/ask/${createRes.body.id}/status`);
      expect(res.status).toBe(404);
    });

    it('fails when no handler registered (fail-closed)', async () => {
      const createRes = await signedPost(app, '/api/v1/ask', { query: 'test' });
      await waitForJob(createRes.body.id);

      const res = await signedGet(app, `/api/v1/ask/${createRes.body.id}/status`);
      expect(res.body.status).toBe('failed');
      expect(res.body.error).toContain('not configured');
    });
  });

  describe('POST /api/v1/remember — submit memory', () => {
    it('creates a remember job and returns 202', async () => {
      const res = await signedPost(app, '/api/v1/remember', { text: 'Emma birthday is March 15' });
      expect(res.status).toBe(202);
      expect(res.body.id).toMatch(/^job-remember-/);
      expect(res.body.status).toBe('processing');
    });

    it('rejects missing text', async () => {
      const res = await signedPost(app, '/api/v1/remember', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('text is required');
    });
  });

  describe('GET /api/v1/remember/:id — poll remember job', () => {
    it('returns completed status after processing', async () => {
      setRememberHandler(async () => ({ id: 'item-1', duplicate: false }));

      const createRes = await signedPost(app, '/api/v1/remember', { text: 'Remember this' });
      const jobId = createRes.body.id;

      await waitForJob(jobId);

      const res = await signedGet(app, `/api/v1/remember/${jobId}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.result).toContain('Stored successfully');
    });

    it('reports duplicate when handler says so', async () => {
      setRememberHandler(async () => ({ id: 'item-1', duplicate: true }));

      const createRes = await signedPost(app, '/api/v1/remember', { text: 'Already know this' });
      await waitForJob(createRes.body.id);

      const res = await signedGet(app, `/api/v1/remember/${createRes.body.id}`);
      expect(res.body.result).toContain('Already stored');
    });

    it('returns failed status when handler throws', async () => {
      setRememberHandler(async () => { throw new Error('Storage full'); });

      const createRes = await signedPost(app, '/api/v1/remember', { text: 'test' });
      await waitForJob(createRes.body.id);

      const res = await signedGet(app, `/api/v1/remember/${createRes.body.id}`);
      expect(res.body.status).toBe('failed');
      expect(res.body.error).toContain('Storage full');
    });

    it('returns 404 for nonexistent job', async () => {
      const res = await signedGet(app, '/api/v1/remember/job-remember-999');
      expect(res.status).toBe(404);
    });

    it('returns 404 when asking for ask job as remember', async () => {
      const createRes = await signedPost(app, '/api/v1/ask', { query: 'test' });
      await waitForJob(createRes.body.id);

      const res = await signedGet(app, `/api/v1/remember/${createRes.body.id}`);
      expect(res.status).toBe(404);
    });
  });
});
