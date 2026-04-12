/**
 * BIP-39 mnemonic generation and seed derivation.
 *
 * Uses @scure/bip39 — audited, zero-dep.
 * Uses @noble/hashes for the PBKDF2 used internally by mnemonicToSeedSync.
 */

import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/** Generate a new 24-word BIP-39 mnemonic from 256-bit entropy. */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(wordlist, 256);
}

/**
 * Convert a BIP-39 mnemonic to a 64-byte seed.
 * Uses PBKDF2 with empty passphrase (standard BIP-39 behavior).
 */
export function mnemonicToSeed(mnemonic: string): Uint8Array {
  return bip39.mnemonicToSeedSync(mnemonic, '');
}

/** Validate a BIP-39 mnemonic (checksum + wordlist check). */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic, wordlist);
}
