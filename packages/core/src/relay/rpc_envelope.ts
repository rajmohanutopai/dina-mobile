/**
 * Core RPC Relay — request envelope wrapping and inner Ed25519 auth.
 *
 * Wraps Core API requests inside NaCl-encrypted envelopes for MsgBox.
 * MsgBox sees only opaque blobs — cannot read content.
 *
 * Source: ARCHITECTURE.md Section 19.
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { sealEncrypt, sealDecrypt } from '../crypto/nacl';
import { hasSigningHeaders } from '../cli/client';
import { RPC_REQUEST_TYPE, RPC_RESPONSE_TYPE } from '../constants';

export interface CoreRPCRequest {
  type: 'core_rpc_request';
  request_id: string;
  from: string;
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body: string;
}

export interface CoreRPCResponse {
  type: 'core_rpc_response';
  request_id: string;
  from: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  signature: string;
}

/** Build a Core RPC request envelope with unique request_id. */
export function buildRPCRequest(
  method: string,
  path: string,
  query: string,
  body: string,
  headers: Record<string, string>,
  senderDID: string,
): CoreRPCRequest {
  return {
    type: RPC_REQUEST_TYPE as 'core_rpc_request',
    request_id: `rpc-${bytesToHex(randomBytes(8))}`,
    from: senderDID,
    method,
    path,
    query,
    headers,
    body,
  };
}

/** Seal a request envelope with NaCl for MsgBox transport. */
export function sealRPCRequest(
  request: CoreRPCRequest,
  recipientEd25519Pub: Uint8Array,
): Uint8Array {
  const json = JSON.stringify(request);
  return sealEncrypt(new TextEncoder().encode(json), recipientEd25519Pub);
}

/** Unseal a request envelope received via MsgBox WS. */
export function unsealRPCRequest(
  sealed: Uint8Array,
  recipientEd25519Pub: Uint8Array,
  recipientEd25519Priv: Uint8Array,
): CoreRPCRequest {
  const plaintext = sealDecrypt(sealed, recipientEd25519Pub, recipientEd25519Priv);
  const json = new TextDecoder().decode(plaintext);
  const parsed = JSON.parse(json);

  if (parsed.type !== RPC_REQUEST_TYPE) {
    throw new Error(`rpc_envelope: expected ${RPC_REQUEST_TYPE}, got ${parsed.type}`);
  }

  return parsed as CoreRPCRequest;
}

/** Validate the inner Ed25519 auth headers of an unsealed request. */
export function validateInnerAuth(request: CoreRPCRequest): boolean {
  return hasSigningHeaders(request.headers);
}
