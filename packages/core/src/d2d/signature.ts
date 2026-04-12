/**
 * D2D message signature — Ed25519 sign/verify on plaintext JSON.
 *
 * Signs BEFORE encryption, verifies AFTER decryption.
 * Multi-key verification supports key rotation.
 *
 * Source: core/test/transport_d2d_sig_test.go
 */

import { sign, verify } from '../crypto/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { canonicalize } from '../identity/signing';
import type { DinaMessage } from './envelope';

/** Sign a DinaMessage. Returns hex signature over canonical JSON. */
export function signMessage(message: DinaMessage, privateKey: Uint8Array): string {
  const canonical = canonicalize(message as unknown as Record<string, unknown>);
  return bytesToHex(sign(privateKey, new TextEncoder().encode(canonical)));
}

/** Verify against multiple keys (rotation support). True if ANY key matches. */
export function verifyMessage(
  message: DinaMessage, signatureHex: string, verificationKeys: Uint8Array[],
): boolean {
  if (!verificationKeys || verificationKeys.length === 0) return false;
  return verificationKeys.some(key => verifyMessageSingle(message, signatureHex, key));
}

/** Verify against a single public key. */
export function verifyMessageSingle(
  message: DinaMessage, signatureHex: string, publicKey: Uint8Array,
): boolean {
  if (!signatureHex || signatureHex.length !== 128 || !/^[0-9a-f]+$/i.test(signatureHex)) return false;
  try {
    const canonical = canonicalize(message as unknown as Record<string, unknown>);
    return verify(publicKey, new TextEncoder().encode(canonical), hexToBytes(signatureHex));
  } catch { return false; }
}
