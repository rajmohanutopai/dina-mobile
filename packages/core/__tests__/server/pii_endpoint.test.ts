/**
 * T2.76 — PII scrub endpoint: POST /v1/pii/scrub.
 *
 * Source: ARCHITECTURE.md Task 2.76
 */

import request from 'supertest';
import { createCoreApp } from '../../src/server/core_server';
import { signRequest } from '../../src/auth/canonical';
import { getPublicKey } from '../../src/crypto/ed25519';
import { deriveDIDKey } from '../../src/identity/did';
import { registerPublicKeyResolver, resetMiddlewareState } from '../../src/auth/middleware';
import { registerService, resetCallerTypeState } from '../../src/auth/caller_type';
import { TEST_ED25519_SEED } from '@dina/test-harness';

const pubKey = getPublicKey(TEST_ED25519_SEED);
const did = deriveDIDKey(pubKey);

function signedPost(app: any, url: string, body: Record<string, unknown>) {
  const [path, query] = url.includes('?') ? [url.slice(0, url.indexOf('?')), url.slice(url.indexOf('?') + 1)] : [url, ''];
  const bodyStr = JSON.stringify(body);
  const bodyBytes = new Uint8Array(Buffer.from(bodyStr));
  const headers = signRequest('POST', path, query, bodyBytes, TEST_ED25519_SEED, did);
  return request(app).post(url)
    .set('X-DID', headers['X-DID']).set('X-Timestamp', headers['X-Timestamp'])
    .set('X-Nonce', headers['X-Nonce']).set('X-Signature', headers['X-Signature'])
    .set('Content-Type', 'application/octet-stream').send(Buffer.from(bodyStr));
}

describe('PII Scrub Endpoint', () => {
  let app: ReturnType<typeof createCoreApp>;

  beforeEach(() => {
    resetMiddlewareState(); resetCallerTypeState();
    registerPublicKeyResolver((d) => d === did ? pubKey : null);
    registerService(did, 'brain');
    app = createCoreApp();
  });

  it('scrubs email from text', async () => {
    const res = await signedPost(app, '/v1/pii/scrub', { text: 'Contact john@example.com about the meeting' });
    expect(res.status).toBe(200);
    expect(res.body.scrubbed).not.toContain('john@example.com');
    expect(res.body.scrubbed).toContain('[EMAIL_1]');
    expect(res.body.entityCount).toBeGreaterThan(0);
  });

  it('scrubs phone number', async () => {
    const res = await signedPost(app, '/v1/pii/scrub', { text: 'Call 555-123-4567 today' });
    expect(res.body.scrubbed).not.toContain('555-123-4567');
  });

  it('returns entities with token + type', async () => {
    const res = await signedPost(app, '/v1/pii/scrub', { text: 'Email john@example.com' });
    expect(res.body.entities[0].token).toBe('[EMAIL_1]');
    expect(res.body.entities[0].type).toBe('EMAIL');
  });

  it('clean text → 0 entities', async () => {
    const res = await signedPost(app, '/v1/pii/scrub', { text: 'No personal data here' });
    expect(res.body.entityCount).toBe(0);
    expect(res.body.scrubbed).toBe('No personal data here');
  });

  it('rejects empty text', async () => {
    const res = await signedPost(app, '/v1/pii/scrub', { text: '' });
    expect(res.status).toBe(400);
  });

  it('rejects missing text field', async () => {
    const res = await signedPost(app, '/v1/pii/scrub', {});
    expect(res.status).toBe(400);
  });
});
