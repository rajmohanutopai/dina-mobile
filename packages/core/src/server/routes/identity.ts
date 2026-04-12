/**
 * Identity endpoints — DID operations.
 *
 * GET  /v1/did           → get current DID
 * POST /v1/did/sign      → sign canonical JSON
 * POST /v1/did/verify    → verify canonical JSON signature
 * GET  /v1/did/document  → get DID document
 *
 * Source: ARCHITECTURE.md Task 2.73
 */

import { Router, type Request, type Response } from 'express';
import { deriveDIDKey, publicKeyToMultibase, extractPublicKey } from '../../identity/did';
import { getPublicKey } from '../../crypto/ed25519';
import { canonicalize, signCanonical, verifyCanonical } from '../../identity/signing';
import { buildDIDDocument, validateDIDDocument } from '../../identity/did_document';

/**
 * In-memory identity store — holds current seed + DID.
 * In production, these come from keychain-unlocked secrets.
 */
let currentSeed: Uint8Array | null = null;
let currentDID: string | null = null;

/** Register identity material (for testing and boot). */
export function registerIdentity(seed: Uint8Array): void {
  currentSeed = seed;
  const pubKey = getPublicKey(seed);
  currentDID = deriveDIDKey(pubKey);
}

/** Clear identity state (for testing). */
export function resetIdentityState(): void {
  currentSeed = null;
  currentDID = null;
}

export function createIdentityRouter(): Router {
  const router = Router();

  // GET /v1/did — return current DID
  router.get('/v1/did', (_req: Request, res: Response) => {
    if (!currentDID || !currentSeed) {
      res.status(503).json({ error: 'Identity not initialized' });
      return;
    }
    const pubKey = getPublicKey(currentSeed);
    const multibase = publicKeyToMultibase(pubKey);
    res.json({ did: currentDID, publicKeyMultibase: multibase });
  });

  // POST /v1/did/sign — sign canonical JSON
  router.post('/v1/did/sign', (req: Request, res: Response) => {
    try {
      if (!currentSeed || !currentDID) {
        res.status(503).json({ error: 'Identity not initialized' });
        return;
      }
      const body = parseJSON(req);
      const payload = body.payload as Record<string, unknown> | undefined;
      if (!payload || typeof payload !== 'object') {
        res.status(400).json({ error: 'payload is required and must be an object' });
        return;
      }

      const canonical = canonicalize(payload);
      const signatureHex = signCanonical(canonical, currentSeed);

      res.json({
        signature: signatureHex,
        signer: currentDID,
        canonical,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /v1/did/verify — verify a signature
  router.post('/v1/did/verify', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const payload = body.payload as Record<string, unknown> | undefined;
      const signature = body.signature ? String(body.signature) : '';
      const signerDid = body.signer ? String(body.signer) : '';

      if (!payload || typeof payload !== 'object') {
        res.status(400).json({ error: 'payload is required and must be an object' });
        return;
      }
      if (!signature) {
        res.status(400).json({ error: 'signature is required' });
        return;
      }
      if (!signerDid) {
        res.status(400).json({ error: 'signer is required' });
        return;
      }

      // Extract public key from signer DID
      const pubKey = extractPublicKey(signerDid);

      const canonical = canonicalize(payload);
      const valid = verifyCanonical(canonical, signature, pubKey);

      res.json({ valid, signer: signerDid });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /v1/did/document — return DID document
  router.get('/v1/did/document', (_req: Request, res: Response) => {
    if (!currentDID || !currentSeed) {
      res.status(503).json({ error: 'Identity not initialized' });
      return;
    }

    const pubKey = getPublicKey(currentSeed);
    const multibase = publicKeyToMultibase(pubKey);
    const doc = buildDIDDocument(currentDID, multibase);
    const errors = validateDIDDocument(doc);

    if (errors.length > 0) {
      res.status(500).json({ error: 'DID document validation failed', errors });
      return;
    }

    res.json(doc);
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
