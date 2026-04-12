/**
 * T2.74 — Contact endpoints: CRUD, sharing policy, scenario policy, aliases.
 *
 * Source: ARCHITECTURE.md Task 2.74
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { resetContactDirectory } from '../../src/contacts/directory';
import { clearSharingPolicies } from '../../src/gatekeeper/sharing';
import { clearGatesState } from '../../src/d2d/gates';
import { resetScenarioDenyLists } from '../../src/server/routes/contacts';
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

const ALICE_DID = 'did:key:z6MkAlice000000000000000000000000000000000000';

describe('Contact HTTP Endpoints', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState();
    resetContactDirectory(); clearSharingPolicies();
    clearGatesState(); resetScenarioDenyLists();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    app = createCoreApp();
  });

  describe('POST /v1/contacts — add contact', () => {
    it('creates a contact and returns fields', async () => {
      const res = await signedPost(app, '/v1/contacts', {
        did: ALICE_DID, displayName: 'Alice',
      });
      expect(res.status).toBe(201);
      expect(res.body.did).toBe(ALICE_DID);
      expect(res.body.displayName).toBe('Alice');
      expect(res.body.trustLevel).toBe('unknown');
      expect(res.body.sharingTier).toBe('summary');
    });

    it('accepts optional trust level and sharing tier', async () => {
      const res = await signedPost(app, '/v1/contacts', {
        did: ALICE_DID, displayName: 'Alice',
        trustLevel: 'trusted', sharingTier: 'full',
      });
      expect(res.body.trustLevel).toBe('trusted');
      expect(res.body.sharingTier).toBe('full');
    });

    it('rejects missing DID', async () => {
      const res = await signedPost(app, '/v1/contacts', { displayName: 'Alice' });
      expect(res.status).toBe(400);
    });

    it('rejects missing displayName', async () => {
      const res = await signedPost(app, '/v1/contacts', { did: ALICE_DID });
      expect(res.status).toBe(400);
    });

    it('rejects invalid trust level', async () => {
      const res = await signedPost(app, '/v1/contacts', {
        did: ALICE_DID, displayName: 'Alice', trustLevel: 'invalid',
      });
      expect(res.status).toBe(400);
    });

    it('returns 409 for duplicate DID', async () => {
      await signedPost(app, '/v1/contacts', { did: ALICE_DID, displayName: 'Alice' });
      const res = await signedPost(app, '/v1/contacts', { did: ALICE_DID, displayName: 'Alice2' });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /v1/contacts — list all', () => {
    it('returns empty list when no contacts', async () => {
      const res = await signedGet(app, '/v1/contacts');
      expect(res.status).toBe(200);
      expect(res.body.contacts).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    it('lists contacts after creation', async () => {
      await signedPost(app, '/v1/contacts', { did: ALICE_DID, displayName: 'Alice' });
      const res = await signedGet(app, '/v1/contacts');
      expect(res.body.count).toBe(1);
      expect(res.body.contacts[0].did).toBe(ALICE_DID);
    });
  });

  describe('GET /v1/contacts/:did — get single', () => {
    it('returns contact details', async () => {
      await signedPost(app, '/v1/contacts', { did: ALICE_DID, displayName: 'Alice' });
      const res = await signedGet(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}`);
      expect(res.status).toBe(200);
      expect(res.body.did).toBe(ALICE_DID);
      expect(res.body.displayName).toBe('Alice');
    });

    it('returns 404 for nonexistent contact', async () => {
      const res = await signedGet(app, '/v1/contacts/did:key:z6MkNope');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/contacts/:did — delete', () => {
    it('deletes an existing contact', async () => {
      await signedPost(app, '/v1/contacts', { did: ALICE_DID, displayName: 'Alice' });
      const res = await signedDelete(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('returns 404 for nonexistent contact', async () => {
      const res = await signedDelete(app, '/v1/contacts/did:key:z6MkNope');
      expect(res.status).toBe(404);
    });
  });

  describe('Sharing policy — /v1/contacts/:did/policy', () => {
    beforeEach(async () => {
      await signedPost(app, '/v1/contacts', { did: ALICE_DID, displayName: 'Alice' });
    });

    it('GET returns default "none" for all categories', async () => {
      const res = await signedGet(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/policy`);
      expect(res.status).toBe(200);
      expect(res.body.policy.health).toBe('none');
      expect(res.body.policy.general).toBe('none');
    });

    it('POST sets category tier, GET reflects it', async () => {
      await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/policy`, {
        category: 'health', tier: 'summary',
      });

      const res = await signedGet(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/policy`);
      expect(res.body.policy.health).toBe('summary');
    });

    it('rejects invalid tier', async () => {
      const res = await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/policy`, {
        category: 'health', tier: 'invalid',
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing category', async () => {
      const res = await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/policy`, {
        tier: 'full',
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for nonexistent contact', async () => {
      const res = await signedGet(app, '/v1/contacts/did:key:z6MkNope/policy');
      expect(res.status).toBe(404);
    });
  });

  describe('Scenario policy — /v1/contacts/:did/scenarios', () => {
    beforeEach(async () => {
      await signedPost(app, '/v1/contacts', { did: ALICE_DID, displayName: 'Alice' });
    });

    it('GET returns empty deny list by default', async () => {
      const res = await signedGet(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/scenarios`);
      expect(res.status).toBe(200);
      expect(res.body.denied).toHaveLength(0);
    });

    it('POST sets deny list, GET reflects it', async () => {
      await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/scenarios`, {
        denied: ['social.update', 'promo.offer'],
      });

      const res = await signedGet(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/scenarios`);
      expect(res.body.denied).toContain('social.update');
      expect(res.body.denied).toContain('promo.offer');
    });

    it('rejects non-array denied field', async () => {
      const res = await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/scenarios`, {
        denied: 'not-array',
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for nonexistent contact', async () => {
      const res = await signedGet(app, '/v1/contacts/did:key:z6MkNope/scenarios');
      expect(res.status).toBe(404);
    });
  });

  describe('Aliases — /v1/contacts/:did/aliases', () => {
    beforeEach(async () => {
      await signedPost(app, '/v1/contacts', { did: ALICE_DID, displayName: 'Alice' });
    });

    it('GET returns empty aliases by default', async () => {
      const res = await signedGet(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/aliases`);
      expect(res.status).toBe(200);
      expect(res.body.aliases).toHaveLength(0);
    });

    it('POST adds an alias', async () => {
      const res = await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/aliases`, {
        alias: 'Ali',
      });
      expect(res.status).toBe(201);
      expect(res.body.aliases).toContain('Ali');
    });

    it('rejects empty alias', async () => {
      const res = await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/aliases`, {
        alias: '',
      });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate alias across contacts', async () => {
      const BOB_DID = 'did:key:z6MkBob0000000000000000000000000000000000000';
      await signedPost(app, '/v1/contacts', { did: BOB_DID, displayName: 'Bob' });
      await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/aliases`, { alias: 'Pal' });
      const res = await signedPost(app, `/v1/contacts/${encodeURIComponent(BOB_DID)}/aliases`, { alias: 'Pal' });
      expect(res.status).toBe(409);
    });

    it('DELETE removes an alias', async () => {
      await signedPost(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/aliases`, { alias: 'Ali' });
      const res = await signedDelete(app, `/v1/contacts/${encodeURIComponent(ALICE_DID)}/aliases/Ali`);
      expect(res.status).toBe(200);
      expect(res.body.aliases).not.toContain('Ali');
    });

    it('returns 404 for alias on nonexistent contact', async () => {
      const res = await signedPost(app, '/v1/contacts/did:key:z6MkNope/aliases', { alias: 'x' });
      expect(res.status).toBe(404);
    });
  });
});
