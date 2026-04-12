/**
 * PLC directory client — create and update did:plc identities.
 *
 * did:plc creation:
 *   1. Derive root signing key (Ed25519, m/9999'/0'/0')
 *   2. Derive rotation key (secp256k1, m/9999'/2'/{gen}')
 *   3. Build creation operation (signed JSON)
 *   4. POST to PLC directory → get did:plc:{hash}
 *
 * The PLC directory returns the DID based on the SHA-256 hash of the
 * signed creation operation. Same keys always produce the same DID.
 *
 * Source: ARCHITECTURE.md Task 2.30, AT Protocol PLC directory spec
 */

import { getPublicKey, sign } from '../crypto/ed25519';
import { deriveRotationKey } from '../crypto/slip0010';
import { deriveDIDKey, publicKeyToMultibase } from './did';
import { buildDIDDocument } from './did_document';
import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58 } from '@scure/base';

/** Multicodec varint prefix for secp256k1 public key: 0xe7 0x01. */
const SECP256K1_MULTICODEC = new Uint8Array([0xe7, 0x01]);

/** Encode a secp256k1 compressed public key (33 bytes) as did:key multibase. */
function secp256k1ToMultibase(pubKey: Uint8Array): string {
  const payload = new Uint8Array(SECP256K1_MULTICODEC.length + pubKey.length);
  payload.set(SECP256K1_MULTICODEC, 0);
  payload.set(pubKey, SECP256K1_MULTICODEC.length);
  return 'z' + base58.encode(payload);
}

const DEFAULT_PLC_URL = 'https://plc.directory';

export interface PLCCreateParams {
  /** 32-byte root signing seed (Ed25519). */
  signingKey: Uint8Array;
  /** 32-byte seed for secp256k1 rotation key derivation. */
  rotationSeed: Uint8Array;
  /** MsgBox WebSocket endpoint. */
  msgboxEndpoint?: string;
  /** Rotation key generation (default: 0). */
  rotationGeneration?: number;
  /** Display handle (optional, for PLC directory). */
  handle?: string;
}

export interface PLCCreateResult {
  did: string;
  didKey: string;
  publicKeyMultibase: string;
  rotationKeyHex: string;
  operationHash: string;
}

export interface PLCDirectoryConfig {
  plcURL?: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Build the PLC creation operation (unsigned).
 *
 * The creation operation defines the identity:
 * - type: "plc_operation" (or "create" for v1)
 * - signingKey: Ed25519 public key (multibase)
 * - rotationKeys: secp256k1 compressed public keys (multibase)
 * - services: { #dina-messaging: { type, endpoint } }
 * - handle (optional)
 */
export function buildCreationOperation(params: PLCCreateParams): {
  operation: Record<string, unknown>;
  signingPubKey: Uint8Array;
  rotationPubKey: Uint8Array;
} {
  const signingPubKey = getPublicKey(params.signingKey);
  const signingMultibase = publicKeyToMultibase(signingPubKey);

  const rotationGen = params.rotationGeneration ?? 0;
  const rotationDerived = deriveRotationKey(params.rotationSeed, rotationGen);
  const rotationPubKey = rotationDerived.publicKey;

  const services: Record<string, unknown> = {};
  if (params.msgboxEndpoint) {
    services['#dina-messaging'] = {
      type: 'DinaMsgBox',
      endpoint: params.msgboxEndpoint,
    };
  }

  const operation: Record<string, unknown> = {
    type: 'plc_operation',
    verificationMethods: {
      atproto: `did:key:${signingMultibase}`,
    },
    rotationKeys: [
      `did:key:${secp256k1ToMultibase(rotationPubKey)}`,
    ],
    alsoKnownAs: params.handle ? [`at://${params.handle}`] : [],
    services,
    prev: null,  // genesis operation
  };

  return { operation, signingPubKey, rotationPubKey };
}

/**
 * Sign a PLC operation with the signing key.
 *
 * The signature covers the SHA-256 hash of the canonical JSON operation.
 */
export function signOperation(
  operation: Record<string, unknown>,
  signingKey: Uint8Array,
): { signedOperation: Record<string, unknown>; operationHash: string } {
  const canonical = JSON.stringify(operation, Object.keys(operation).sort());
  const hash = sha256(new TextEncoder().encode(canonical));
  const signature = sign(signingKey, hash);

  return {
    signedOperation: {
      ...operation,
      sig: bytesToHex(signature),
    },
    operationHash: bytesToHex(hash),
  };
}

/**
 * Derive the did:plc from the signed creation operation.
 *
 * did:plc is the first 24 characters of the base32-lower-no-pad encoding
 * of the SHA-256 hash of the signed genesis operation.
 */
export function derivePLCDID(signedOperation: Record<string, unknown>): string {
  const canonical = JSON.stringify(signedOperation);
  const hash = sha256(new TextEncoder().encode(canonical));
  // PLC DIDs use truncated base32-lower
  const b32 = base32Encode(hash).slice(0, 24).toLowerCase();
  return `did:plc:${b32}`;
}

/**
 * Create a did:plc identity — build, sign, and optionally register.
 *
 * If no fetch/plcURL is provided, returns the operation without posting
 * (useful for testing and offline DID derivation).
 */
export async function createDIDPLC(
  params: PLCCreateParams,
  config?: PLCDirectoryConfig,
): Promise<PLCCreateResult> {
  // 1. Build creation operation
  const { operation, signingPubKey, rotationPubKey } = buildCreationOperation(params);

  // 2. Sign the operation
  const { signedOperation, operationHash } = signOperation(operation, params.signingKey);

  // 3. Derive the DID
  const did = derivePLCDID(signedOperation);

  // 4. Derive did:key for the signing key
  const didKey = deriveDIDKey(signingPubKey);
  const publicKeyMultibase = publicKeyToMultibase(signingPubKey);
  const rotationKeyHex = bytesToHex(rotationPubKey);

  // 5. Register on PLC directory (if configured)
  if (config?.fetch) {
    const plcURL = (config.plcURL ?? DEFAULT_PLC_URL).replace(/\/$/, '');
    const response = await config.fetch(`${plcURL}/${did}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedOperation),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PLC directory registration failed: HTTP ${response.status} — ${errorText}`);
    }
  }

  return {
    did,
    didKey,
    publicKeyMultibase,
    rotationKeyHex,
    operationHash,
  };
}

/**
 * Resolve a did:plc from the PLC directory.
 */
export async function resolveDIDPLC(
  did: string,
  config?: PLCDirectoryConfig,
): Promise<Record<string, unknown>> {
  const fetchFn = config?.fetch ?? globalThis.fetch;
  const plcURL = (config?.plcURL ?? DEFAULT_PLC_URL).replace(/\/$/, '');

  const response = await fetchFn(`${plcURL}/${did}`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`PLC resolve failed: HTTP ${response.status}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Base32 encode (RFC 4648 without padding). */
function base32Encode(data: Uint8Array): string {
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let value = 0;
  let result = '';

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += ALPHABET[(value << (5 - bits)) & 31];
  }

  return result;
}
