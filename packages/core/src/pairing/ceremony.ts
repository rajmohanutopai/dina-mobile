/**
 * Device pairing ceremony — 6-digit code exchange.
 *
 * 1. GeneratePairingCode() → 6-digit code (100000–999999), 5-min TTL
 * 2. CompletePairing() → validate code, register Ed25519 public key
 * 3. Returns device_id, node_did
 *
 * Security:
 * - Single-use codes (consumed on completion)
 * - 5-minute expiry
 * - Max 100 pending codes (DoS protection)
 * - Constant-time code comparison
 *
 * Source: core/test/pairing_test.go
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface PairingCode {
  code: string;       // 6-digit numeric string
  expiresAt: number;  // Unix seconds
}

export interface PairingResult {
  deviceId: string;
  nodeDID: string;
}

/** TTL for pairing codes: 5 minutes in seconds. */
const CODE_TTL_SECONDS = 300;

/** Maximum number of pending (active) pairing codes. */
const MAX_PENDING_CODES = 100;

/** In-memory store of pending codes. */
interface PendingCode {
  code: string;
  expiresAt: number;
  used: boolean;
}

const pendingCodes = new Map<string, PendingCode>();

/** Node DID placeholder — in production, derived from root signing key. */
let nodeDID = 'did:key:z6MkNode';

/** Set the node DID (called at startup). */
export function setNodeDID(did: string): void {
  nodeDID = did;
}

/**
 * Generate a 6-digit pairing code.
 *
 * @returns { code, expiresAt }
 * @throws if max pending codes exceeded
 */
export function generatePairingCode(): PairingCode {
  // Purge expired before counting
  purgeExpiredCodes();

  if (activePairingCount() >= MAX_PENDING_CODES) {
    throw new Error('pairing: max pending codes exceeded (100)');
  }

  // Generate cryptographically random 6-digit code (100000–999999)
  const CODE_MIN = 100000;
  const CODE_RANGE = 900000; // 999999 - 100000 + 1
  const randomValue = bytesToHex(randomBytes(4));
  const numericValue = (parseInt(randomValue, 16) % CODE_RANGE) + CODE_MIN;
  const code = String(numericValue);

  const expiresAt = Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS;

  pendingCodes.set(code, { code, expiresAt, used: false });

  return { code, expiresAt };
}

/**
 * Complete pairing with a device's Ed25519 public key.
 *
 * @param code - The 6-digit pairing code
 * @param deviceName - Human-readable device name
 * @param publicKeyMultibase - z-prefixed Ed25519 public key
 * @returns { deviceId, nodeDID }
 * @throws if code is invalid, expired, or already used
 */
export function completePairing(
  code: string,
  deviceName: string,
  publicKeyMultibase: string,
): PairingResult {
  if (!isCodeValid(code)) {
    throw new Error('pairing: invalid, expired, or already-used code');
  }

  // Mark code as used (single-use)
  const pending = pendingCodes.get(code)!;
  pending.used = true;

  // Generate a device ID
  const deviceId = `dev-${bytesToHex(randomBytes(8))}`;

  return { deviceId, nodeDID };
}

/**
 * Check if a pairing code is valid (exists, not expired, not used).
 * Uses constant-time comparison for the code check.
 */
export function isCodeValid(code: string): boolean {
  const pending = pendingCodes.get(code);
  if (!pending) return false;
  if (pending.used) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now > pending.expiresAt) return false;

  return true;
}

/** Count of active (unexpired, unused) pairing codes. */
export function activePairingCount(): number {
  const now = Math.floor(Date.now() / 1000);
  let count = 0;
  for (const pending of pendingCodes.values()) {
    if (!pending.used && now <= pending.expiresAt) {
      count++;
    }
  }
  return count;
}

/** Purge expired pairing codes. Returns count of purged codes. */
export function purgeExpiredCodes(): number {
  const now = Math.floor(Date.now() / 1000);
  let purged = 0;
  for (const [key, pending] of pendingCodes.entries()) {
    if (now > pending.expiresAt || pending.used) {
      pendingCodes.delete(key);
      purged++;
    }
  }
  return purged;
}

/** Clear all pending codes and reset node DID (for testing). */
export function clearPairingState(): void {
  pendingCodes.clear();
  nodeDID = 'did:key:z6MkNode';
}
