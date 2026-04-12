/**
 * NaCl crypto_box_seal and Ed25519↔X25519 key conversion.
 *
 * Used for D2D message encryption (anonymous sender, authenticated recipient).
 *
 * Sealed box protocol (libsodium-compatible):
 *   seal:   eph_pk || crypto_box(m, blake2b(eph_pk||pk, 24), pk, eph_sk)
 *   unseal: extract eph_pk, recompute nonce, crypto_box_open(ct, nonce, eph_pk, sk)
 *
 * Uses @noble ecosystem exclusively:
 *   - @noble/curves/ed25519 (x25519 DH)
 *   - @noble/ciphers/salsa (xsalsa20poly1305, hsalsa)
 *   - @noble/hashes/blake2 (nonce derivation)
 *   - @noble/hashes/sha2 (Ed25519→X25519 private key conversion)
 *
 * Source of truth: core/internal/adapter/crypto/nacl.go
 */

import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { xsalsa20poly1305, hsalsa } from '@noble/ciphers/salsa.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Overhead added by sealed box: 32-byte ephemeral public key + 16-byte Poly1305 tag. */
const SEAL_OVERHEAD = 32 + 16;

/**
 * Compute the NaCl crypto_box shared key from a raw X25519 shared secret.
 *
 * Equivalent to libsodium's crypto_box_beforenm: HSalsa20(shared, zeros).
 */
function cryptoBoxBeforenm(sharedSecret: Uint8Array): Uint8Array {
  const k = new Uint32Array(8);
  const dv = new DataView(sharedSecret.buffer, sharedSecret.byteOffset, 32);
  for (let i = 0; i < 8; i++) k[i] = dv.getUint32(i * 4, true);

  const sigma = new Uint32Array(4); // 16 zero bytes
  const out = new Uint32Array(8);
  const state = new Uint32Array(16);

  hsalsa(state, k, sigma, out);

  const result = new Uint8Array(32);
  const rdv = new DataView(result.buffer);
  for (let i = 0; i < 8; i++) rdv.setUint32(i * 4, out[i], true);
  return result;
}

/**
 * Derive the sealed box nonce: BLAKE2b(eph_pub || recipient_pub, outlen=24).
 */
function sealNonce(ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const data = new Uint8Array(64);
  data.set(ephPub, 0);
  data.set(recipientPub, 32);
  return blake2b(data, { dkLen: 24 });
}

/**
 * Encrypt with NaCl crypto_box_seal (anonymous sender).
 *
 * The sender generates an ephemeral X25519 keypair, so the recipient
 * cannot identify who sent the message — only that it was meant for them.
 *
 * @param plaintext - Message to encrypt
 * @param recipientEd25519Pub - Recipient's Ed25519 public key (32 bytes)
 * @returns Sealed box: eph_pub (32) || ciphertext || Poly1305 tag (16)
 */
export function sealEncrypt(plaintext: Uint8Array, recipientEd25519Pub: Uint8Array): Uint8Array {
  if (!recipientEd25519Pub || recipientEd25519Pub.length !== 32) {
    throw new Error('nacl: recipient public key must be 32 bytes');
  }

  // Convert Ed25519 public key → X25519
  const recipientX25519Pub = ed25519PubToX25519(recipientEd25519Pub);

  // Generate ephemeral X25519 keypair
  const ephPriv = randomBytes(32);
  const ephPub = x25519.getPublicKey(ephPriv);

  // Derive nonce and shared key
  const nonce = sealNonce(ephPub, recipientX25519Pub);
  const shared = x25519.getSharedSecret(ephPriv, recipientX25519Pub);
  const boxKey = cryptoBoxBeforenm(shared);

  // Encrypt
  const ciphertext = xsalsa20poly1305(boxKey, nonce).encrypt(plaintext);

  // sealed = eph_pub || ciphertext (includes Poly1305 tag)
  const sealed = new Uint8Array(32 + ciphertext.length);
  sealed.set(ephPub, 0);
  sealed.set(ciphertext, 32);
  return sealed;
}

/**
 * Decrypt with NaCl crypto_box_seal_open.
 *
 * @param ciphertext - Sealed box (eph_pub || encrypted || tag)
 * @param recipientEd25519Pub - Recipient's Ed25519 public key (32 bytes)
 * @param recipientEd25519Priv - Recipient's Ed25519 private key/seed (32 bytes)
 * @returns Decrypted plaintext
 * @throws if authentication fails (wrong key or corrupted)
 */
export function sealDecrypt(
  ciphertext: Uint8Array,
  recipientEd25519Pub: Uint8Array,
  recipientEd25519Priv: Uint8Array,
): Uint8Array {
  if (!ciphertext || ciphertext.length < SEAL_OVERHEAD) {
    throw new Error(`nacl: ciphertext too short (need at least ${SEAL_OVERHEAD} bytes)`);
  }
  if (!recipientEd25519Pub || recipientEd25519Pub.length !== 32) {
    throw new Error('nacl: recipient public key must be 32 bytes');
  }
  if (!recipientEd25519Priv || recipientEd25519Priv.length !== 32) {
    throw new Error('nacl: recipient private key must be 32 bytes');
  }

  // Convert keys
  const recipientX25519Pub = ed25519PubToX25519(recipientEd25519Pub);
  const recipientX25519Priv = ed25519SecToX25519(recipientEd25519Priv);

  // Extract ephemeral public key and encrypted data
  const ephPub = ciphertext.slice(0, 32);
  const encrypted = ciphertext.slice(32);

  // Derive nonce and shared key
  const nonce = sealNonce(ephPub, recipientX25519Pub);
  const shared = x25519.getSharedSecret(recipientX25519Priv, ephPub);
  const boxKey = cryptoBoxBeforenm(shared);

  // Decrypt
  try {
    return xsalsa20poly1305(boxKey, nonce).decrypt(encrypted);
  } catch {
    throw new Error('nacl: decryption failed — wrong key or corrupted ciphertext');
  }
}

/**
 * Convert Ed25519 public key to X25519 (Curve25519) public key.
 *
 * Edwards → Montgomery point conversion: u = (1 + y) / (1 - y) mod p
 * where y is the affine y-coordinate of the Ed25519 point.
 */
export function ed25519PubToX25519(ed25519Pub: Uint8Array): Uint8Array {
  if (!ed25519Pub || ed25519Pub.length !== 32) {
    throw new Error('nacl: Ed25519 public key must be 32 bytes');
  }

  const Point = ed25519.Point;
  const Fp = Point.Fp;

  // Decode the compressed Edwards point
  const point = Point.fromHex(bytesToHex(ed25519Pub));

  // Get affine y coordinate: Y / Z mod p
  const y = Fp.div(point.Y, point.Z);

  // Montgomery u = (1 + y) / (1 - y) mod p
  const u = Fp.div(Fp.add(1n, y), Fp.sub(1n, y));

  // Encode as 32 bytes little-endian
  const bytes = new Uint8Array(32);
  let val = u;
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(val & 0xFFn);
    val >>= 8n;
  }
  return bytes;
}

/**
 * Convert Ed25519 private key (seed) to X25519 private key (scalar).
 *
 * Standard conversion (same as libsodium crypto_sign_ed25519_sk_to_curve25519):
 * SHA-512(ed25519_seed)[0:32] with clamping.
 */
export function ed25519SecToX25519(ed25519Sec: Uint8Array): Uint8Array {
  if (!ed25519Sec || ed25519Sec.length !== 32) {
    throw new Error('nacl: Ed25519 private key must be 32 bytes');
  }

  const h = sha512(ed25519Sec);
  const scalar = h.slice(0, 32);

  // Clamp (RFC 7748 / X25519 scalar format)
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;

  return scalar;
}
