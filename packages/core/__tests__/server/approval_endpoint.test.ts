/**
 * T2.75 — Approval endpoints: list, create, approve, deny.
 *
 * Source: ARCHITECTURE.md Task 2.75
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { resetApprovalState } from '../../src/server/routes/approvals';
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

describe('Approval HTTP Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState(); resetApprovalState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    // Approval endpoints require 'admin' or 'device' per authz matrix
    registerService(did, 'admin');
    app = createCoreApp();
  });

  describe('POST /v1/approvals — create request', () => {
    it('creates an approval request', async () => {
      const res = await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'unlock_persona',
        requester_did: 'did:key:z6MkBrain', persona: 'health',
        reason: 'Need to access health records', preview: 'Accessing health vault',
      });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('apr-1');
      expect(res.body.status).toBe('pending');
    });

    it('rejects missing id', async () => {
      const res = await signedPost(app, '/v1/approvals', {
        action: 'test', requester_did: 'did:key:z6MkX',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('id is required');
    });

    it('rejects missing action', async () => {
      const res = await signedPost(app, '/v1/approvals', {
        id: 'apr-1', requester_did: 'did:key:z6MkX',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('action is required');
    });

    it('rejects missing requester_did', async () => {
      const res = await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'test',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('requester_did is required');
    });

    it('returns 409 for duplicate ID', async () => {
      await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'test', requester_did: 'did:key:z6MkX',
      });
      const res = await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'test2', requester_did: 'did:key:z6MkX',
      });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /v1/approvals — list pending', () => {
    it('returns empty when no approvals exist', async () => {
      const res = await signedGet(app, '/v1/approvals');
      expect(res.status).toBe(200);
      expect(res.body.approvals).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    it('lists only pending requests', async () => {
      await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'unlock', requester_did: 'did:key:z6MkX',
        persona: 'health', reason: 'Need access',
      });
      await signedPost(app, '/v1/approvals', {
        id: 'apr-2', action: 'share', requester_did: 'did:key:z6MkX',
      });

      const res = await signedGet(app, '/v1/approvals');
      expect(res.body.count).toBe(2);
    });

    it('excludes approved requests from pending list', async () => {
      await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'unlock', requester_did: 'did:key:z6MkX',
      });
      await signedPost(app, '/v1/approvals/apr-1/approve', {
        scope: 'single', approved_by: did,
      });

      const res = await signedGet(app, '/v1/approvals');
      expect(res.body.count).toBe(0);
    });
  });

  describe('GET /v1/approvals/:id — get specific', () => {
    it('returns approval details', async () => {
      await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'unlock', requester_did: 'did:key:z6MkX',
        persona: 'health', reason: 'Need access', preview: 'Health vault',
      });

      const res = await signedGet(app, '/v1/approvals/apr-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('apr-1');
      expect(res.body.action).toBe('unlock');
      expect(res.body.persona).toBe('health');
      expect(res.body.status).toBe('pending');
    });

    it('returns 404 for nonexistent request', async () => {
      const res = await signedGet(app, '/v1/approvals/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/approvals/:id/approve — approve', () => {
    beforeEach(async () => {
      await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'unlock', requester_did: 'did:key:z6MkX',
      });
    });

    it('approves with single scope', async () => {
      const res = await signedPost(app, '/v1/approvals/apr-1/approve', {
        scope: 'single', approved_by: did,
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
      expect(res.body.scope).toBe('single');
    });

    it('approves with session scope', async () => {
      const res = await signedPost(app, '/v1/approvals/apr-1/approve', {
        scope: 'session', approved_by: did,
      });
      expect(res.body.scope).toBe('session');
    });

    it('defaults scope to single when omitted', async () => {
      const res = await signedPost(app, '/v1/approvals/apr-1/approve', {
        approved_by: did,
      });
      expect(res.body.scope).toBe('single');
    });

    it('rejects invalid scope', async () => {
      const res = await signedPost(app, '/v1/approvals/apr-1/approve', {
        scope: 'invalid', approved_by: did,
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing approved_by', async () => {
      const res = await signedPost(app, '/v1/approvals/apr-1/approve', {
        scope: 'single',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('approved_by is required');
    });

    it('returns 404 for nonexistent request', async () => {
      const res = await signedPost(app, '/v1/approvals/nonexistent/approve', {
        scope: 'single', approved_by: did,
      });
      expect(res.status).toBe(404);
    });

    it('rejects approving already-approved request', async () => {
      await signedPost(app, '/v1/approvals/apr-1/approve', {
        scope: 'single', approved_by: did,
      });
      const res = await signedPost(app, '/v1/approvals/apr-1/approve', {
        scope: 'single', approved_by: did,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not pending');
    });

    it('approved request reflects status via GET', async () => {
      await signedPost(app, '/v1/approvals/apr-1/approve', {
        scope: 'session', approved_by: did,
      });

      const res = await signedGet(app, '/v1/approvals/apr-1');
      expect(res.body.status).toBe('approved');
      expect(res.body.scope).toBe('session');
      expect(res.body.approved_by).toBe(did);
    });
  });

  describe('POST /v1/approvals/:id/deny — deny', () => {
    beforeEach(async () => {
      await signedPost(app, '/v1/approvals', {
        id: 'apr-1', action: 'unlock', requester_did: 'did:key:z6MkX',
      });
    });

    it('denies a pending request', async () => {
      const res = await signedPost(app, '/v1/approvals/apr-1/deny', {});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('denied');
    });

    it('returns 404 for nonexistent request', async () => {
      const res = await signedPost(app, '/v1/approvals/nonexistent/deny', {});
      expect(res.status).toBe(404);
    });

    it('rejects denying already-denied request', async () => {
      await signedPost(app, '/v1/approvals/apr-1/deny', {});
      const res = await signedPost(app, '/v1/approvals/apr-1/deny', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not pending');
    });

    it('denied request reflects status via GET', async () => {
      await signedPost(app, '/v1/approvals/apr-1/deny', {});
      const res = await signedGet(app, '/v1/approvals/apr-1');
      expect(res.body.status).toBe('denied');
    });
  });
});
