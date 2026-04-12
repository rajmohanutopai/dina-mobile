/**
 * Argon2id KEK derivation for seed wrapping.
 *
 * Parameters (IDENTICAL to server — not reduced for mobile):
 *   memory:      128 MB (131072 KiB)
 *   iterations:  3
 *   parallelism: 4
 *   output:      32 bytes
 *
 * Uses hash-wasm (WASM-based) for Node.js testing.
 * Production mobile will use react-native-argon2 (native C binding).
 *
 * Source of truth: core/internal/adapter/crypto/argon2.go
 */

import { argon2id } from 'hash-wasm';

/** Argon2id parameters — must match server exactly. */
export const ARGON2ID_PARAMS = {
  memorySize: 128 * 1024, // 131072 KiB = 128 MB
  iterations: 3,
  parallelism: 4,
  hashLength: 32,
} as const;

/**
 * Derive a 32-byte Key Encryption Key from a passphrase using Argon2id.
 *
 * @param passphrase - User's passphrase
 * @param salt - 16-byte random salt
 * @returns 32-byte KEK for AES-256-GCM seed wrapping
 */
export async function deriveKEK(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error('argon2id: empty passphrase');
  }
  if (!salt || salt.length < 8) {
    throw new Error('argon2id: salt must be at least 8 bytes');
  }

  return argon2id({
    password: passphrase,
    salt,
    ...ARGON2ID_PARAMS,
    outputType: 'binary',
  });
}
