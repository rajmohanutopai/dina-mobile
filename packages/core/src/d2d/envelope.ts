/**
 * D2D message envelope — NaCl sealed box wrapping a signed DinaMessage.
 *
 * Outbound: build JSON → Ed25519 sign plaintext → NaCl seal → D2DPayload
 * Inbound: NaCl unseal → parse JSON → return message + signature for verification
 *
 * Source: core/internal/service/transport.go
 */

import { sealEncrypt, sealDecrypt } from '../crypto/nacl';
import { signMessage } from './signature';
import type { DinaMessage } from '@dina/test-harness';

export type { DinaMessage } from '@dina/test-harness';

export interface D2DPayload {
  /** Base64-encoded NaCl sealed ciphertext */
  c: string;
  /** Hex-encoded Ed25519 signature over the plaintext JSON */
  s: string;
}

const REQUIRED_FIELDS = ['id', 'type', 'from', 'to', 'created_time', 'body'];

/** Build a DinaMessage JSON string. Deterministic key order. */
export function buildMessage(msg: DinaMessage): string {
  return JSON.stringify({
    id: msg.id,
    type: msg.type,
    from: msg.from,
    to: msg.to,
    created_time: msg.created_time,
    body: msg.body,
  });
}

/** Parse a DinaMessage from JSON string. Validates required fields. */
export function parseMessage(json: string): DinaMessage {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('envelope: invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('envelope: JSON is not an object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in parsed)) {
      throw new Error(`envelope: missing required field "${field}"`);
    }
  }

  if (typeof parsed.id !== 'string') throw new Error('envelope: id must be a string');
  if (typeof parsed.type !== 'string') throw new Error('envelope: type must be a string');
  if (typeof parsed.from !== 'string') throw new Error('envelope: from must be a string');
  if (typeof parsed.to !== 'string') throw new Error('envelope: to must be a string');
  if (typeof parsed.created_time !== 'number') throw new Error('envelope: created_time must be a number');
  if (typeof parsed.body !== 'string') throw new Error('envelope: body must be a string');

  return parsed as unknown as DinaMessage;
}

/**
 * Seal a DinaMessage for D2D transport.
 * Signs plaintext JSON, then NaCl seals it.
 */
export function sealMessage(
  msg: DinaMessage,
  senderPrivateKey: Uint8Array,
  recipientEd25519Pub: Uint8Array,
): D2DPayload {
  const json = buildMessage(msg);
  const sig = signMessage(msg, senderPrivateKey);
  const sealed = sealEncrypt(new TextEncoder().encode(json), recipientEd25519Pub);

  return {
    c: Buffer.from(sealed).toString('base64'),
    s: sig,
  };
}

/**
 * Unseal a D2D payload. Returns message + signature for separate verification.
 */
export function unsealMessage(
  payload: D2DPayload,
  recipientEd25519Pub: Uint8Array,
  recipientEd25519Priv: Uint8Array,
): { message: DinaMessage; signatureHex: string } {
  const ciphertext = new Uint8Array(Buffer.from(payload.c, 'base64'));
  const plaintext = sealDecrypt(ciphertext, recipientEd25519Pub, recipientEd25519Priv);
  const json = new TextDecoder().decode(plaintext);
  const message = parseMessage(json);

  return { message, signatureHex: payload.s };
}
