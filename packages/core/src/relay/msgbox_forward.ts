/**
 * MsgBox POST /forward — send opaque blob with all 6 required headers.
 *
 * Headers (from msgbox/internal/handler.go):
 *   X-Recipient-DID, X-Sender-DID, X-Timestamp (RFC3339),
 *   X-Nonce (hex), X-Signature (hex), X-Sender-Pub (hex, 32 bytes)
 *
 * Canonical for /forward auth:
 *   "POST\n/forward\n\n{timestamp}\n{nonce}\n{sha256_hex(body)}"
 *
 * Source: ARCHITECTURE.md Section 19.1
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { sign } from '../crypto/ed25519';
import { toRFC3339 } from '../auth/timestamp';

export interface ForwardHeaders {
  'X-Recipient-DID': string;
  'X-Sender-DID': string;
  'X-Timestamp': string;
  'X-Nonce': string;
  'X-Signature': string;
  'X-Sender-Pub': string;
}

export interface ForwardResult {
  status: 'delivered' | 'buffered';
  msg_id: string;
}

/** Injectable fetch for testing. */
let fetchFn: typeof globalThis.fetch = globalThis.fetch;

/** Set the fetch function (for testing). */
export function setFetchFn(fn: typeof globalThis.fetch): void {
  fetchFn = fn;
}

/** Reset the fetch function to default (for testing). */
export function resetFetchFn(): void {
  fetchFn = globalThis.fetch;
}

/**
 * Build all 6 required headers for MsgBox /forward POST.
 *
 * Generates timestamp + nonce, computes SHA-256 body hash,
 * builds canonical string, signs with Ed25519.
 */
export function buildForwardHeaders(
  recipientDID: string,
  senderDID: string,
  senderPubHex: string,
  senderPrivateKey: Uint8Array,
  body: Uint8Array,
): ForwardHeaders {
  const timestamp = toRFC3339(new Date());
  const nonce = bytesToHex(randomBytes(16));
  const bodyHash = bytesToHex(sha256(body));
  const canonical = buildForwardCanonical(timestamp, nonce, bodyHash);
  const signature = sign(senderPrivateKey, new TextEncoder().encode(canonical));

  return {
    'X-Recipient-DID': recipientDID,
    'X-Sender-DID': senderDID,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': bytesToHex(signature),
    'X-Sender-Pub': senderPubHex,
  };
}

/**
 * Build the canonical payload for /forward authentication.
 * Format: "POST\n/forward\n\n{timestamp}\n{nonce}\n{sha256_hex(body)}"
 */
export function buildForwardCanonical(timestamp: string, nonce: string, bodyHash: string): string {
  return `POST\n/forward\n\n${timestamp}\n${nonce}\n${bodyHash}`;
}

/**
 * POST an opaque blob to MsgBox /forward with all 6 auth headers.
 *
 * MsgBox returns:
 *   - {"status":"delivered", "msg_id":"..."} — recipient WS connected
 *   - {"status":"buffered", "msg_id":"..."} — recipient offline, buffered 24h
 *
 * Throws on HTTP errors (4xx/5xx) or network failures.
 */
export async function postToForward(
  msgboxURL: string,
  headers: ForwardHeaders,
  payload: Uint8Array,
): Promise<ForwardResult> {
  const url = msgboxURL.endsWith('/') ? msgboxURL + 'forward' : msgboxURL + '/forward';

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
    },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`msgbox_forward: HTTP ${response.status} — ${text}`);
  }

  const body = await response.json() as Record<string, unknown>;
  return {
    status: (body.status as 'delivered' | 'buffered') ?? 'buffered',
    msg_id: (body.msg_id as string) ?? '',
  };
}
