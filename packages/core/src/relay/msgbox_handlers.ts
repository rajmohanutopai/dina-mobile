/**
 * MsgBox envelope handlers — D2D inbound, RPC inbound, RPC response.
 *
 * Processes envelopes dispatched by the WebSocket read pump:
 *   - D2D: parse ciphertext → delegate to receive pipeline (decrypt + verify + stage)
 *   - RPC: decrypt → verify identity binding → paired-device check → verify inner auth → route → respond
 *   - Cancel: abort in-flight RPC handler via AbortController
 *
 * Source: MsgBox Protocol — Home Node Implementation Guide
 */

import { sealEncrypt, sealDecrypt } from '../crypto/nacl';
import { sign, verify, getPublicKey } from '../crypto/ed25519';
import { extractPublicKey } from '../identity/did';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { appendAudit } from '../audit/service';
import { sendEnvelope, getIdentity, type MsgBoxEnvelope } from './msgbox_ws';
import { randomBytes } from '@noble/ciphers/utils.js';
import { isDevice } from '../auth/caller_type';
import { receiveD2D, type ReceivePipelineResult } from '../d2d/receive_pipeline';
import type { D2DPayload } from '../d2d/envelope';

/** Reset handler state (for testing). */
export function resetHandlerState(): void {
  rpcRouter = null;
  inFlightRequests.clear();
}

/** Get the unified identity from the WS module. Throws if not configured. */
function identity(): { did: string; privateKey: Uint8Array } {
  const id = getIdentity();
  if (!id) throw new Error('msgbox: identity not configured — call setIdentity() first');
  return id;
}

// ---------------------------------------------------------------
// Injectable RPC router (routes inner HTTP requests)
// ---------------------------------------------------------------

export type RPCRouterFn = (
  method: string, path: string, headers: Record<string, string>, body: string,
  signal?: AbortSignal,
) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

let rpcRouter: RPCRouterFn | null = null;

/** Set the RPC router (routes decrypted RPC requests through the handler chain). */
export function setRPCRouter(router: RPCRouterFn): void { rpcRouter = router; }

// ---------------------------------------------------------------
// In-flight RPC tracking (for cancel support)
// ---------------------------------------------------------------

const inFlightRequests = new Map<string, AbortController>();

// ---------------------------------------------------------------
// D2D Inbound Handler
// ---------------------------------------------------------------

export interface D2DInboundResult {
  success: boolean;
  messageType?: string;
  senderDID?: string;
  pipelineAction?: string;
  stagingId?: string;
  error?: string;
}

/**
 * Handle an inbound D2D envelope from another Home Node.
 *
 * Routes through the full receive pipeline:
 *   1. Parse D2DPayload { c, s } from envelope ciphertext
 *   2. Resolve sender verification keys + trust level
 *   3. Delegate to receiveD2D (unseal → verify → replay check → trust → stage/quarantine)
 *   4. Return result
 *
 * @param resolveSender — callback to resolve sender's verification keys and trust level from DID
 */
export async function handleInboundD2D(
  env: MsgBoxEnvelope,
  resolveSender: (did: string) => Promise<{ keys: Uint8Array[]; trust: string }>,
): Promise<D2DInboundResult> {
  const { did: myDID, privateKey } = (() => {
    try { return identity(); } catch { return { did: '', privateKey: null as Uint8Array | null }; }
  })();
  if (!privateKey) {
    return { success: false, error: 'Identity not configured' };
  }

  try {
    if (!env.ciphertext) {
      return { success: false, error: 'No ciphertext in D2D envelope' };
    }

    // 1. Parse D2DPayload from envelope ciphertext
    const d2dPayload: D2DPayload = JSON.parse(env.ciphertext);
    if (!d2dPayload.c || !d2dPayload.s) {
      return { success: false, error: 'Invalid D2D payload — missing c or s field' };
    }

    // 2. Resolve sender
    const sender = await resolveSender(env.from_did);
    const myPub = getPublicKey(privateKey);

    // 3. Route through receive pipeline
    const result: ReceivePipelineResult = receiveD2D(
      d2dPayload,
      myPub,
      privateKey,
      sender.keys,
      sender.trust,
    );

    appendAudit(env.from_did, 'd2d_recv', myDID,
      `type=${result.messageType ?? 'unknown'} id=${env.id} action=${result.action}`);

    return {
      success: result.action === 'staged' || result.action === 'ephemeral',
      messageType: result.messageType,
      senderDID: env.from_did,
      pipelineAction: result.action,
      stagingId: result.stagingId,
      error: result.action === 'dropped' ? result.reason : undefined,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'D2D processing failed' };
  }
}

// ---------------------------------------------------------------
// RPC Inbound Handler
// ---------------------------------------------------------------

/**
 * Handle an inbound RPC request from a paired CLI device.
 *
 * 1. Verify from_did is a registered paired device
 * 2. Decrypt NaCl sealed box
 * 3. Verify identity binding (envelope from_did == inner X-DID)
 * 4. Verify inner Ed25519 signature
 * 5. Route through handler chain (with AbortSignal)
 * 6. Encrypt and send response
 */
export async function handleInboundRPC(env: MsgBoxEnvelope): Promise<void> {
  const { did: myDID, privateKey } = (() => {
    try { return identity(); } catch { return { did: '', privateKey: null as Uint8Array | null }; }
  })();
  if (!privateKey || !rpcRouter) return;

  // 0. Paired-device registration check — only registered devices can RPC
  if (!isDevice(env.from_did)) {
    appendAudit(env.from_did, 'rpc_unregistered_device', myDID, `id=${env.id}`);
    await sendRPCError(env, myDID, privateKey, 403, 'Device not registered');
    return;
  }

  const controller = new AbortController();
  inFlightRequests.set(env.id, controller);

  try {
    if (!env.ciphertext) {
      await sendRPCError(env, myDID, privateKey, 400, 'No ciphertext');
      return;
    }

    // 1. Decrypt
    const ctBytes = base64ToBytes(env.ciphertext);
    const myPub = getPublicKey(privateKey);
    const plaintext = sealDecrypt(ctBytes, myPub, privateKey);
    const inner = JSON.parse(new TextDecoder().decode(plaintext));

    // Schema validation: inner must have method, path, headers
    if (!inner || typeof inner.method !== 'string' || typeof inner.path !== 'string' || !inner.headers) {
      await sendRPCError(env, myDID, privateKey, 400, 'Malformed RPC inner payload');
      return;
    }

    // 2. Identity binding: envelope from_did must match inner X-DID
    if (env.from_did !== inner.headers?.['X-DID']) {
      appendAudit(env.from_did, 'rpc_identity_mismatch', myDID, `id=${env.id}`);
      await sendRPCError(env, myDID, privateKey, 403, 'Identity binding failed');
      return;
    }

    // 3. Verify inner Ed25519 signature
    const cliPub = extractPublicKey(env.from_did);
    const bodyHash = bytesToHex(sha256(new TextEncoder().encode(inner.body ?? '')));
    const canonical = `${inner.method}\n${inner.path}\n\n${inner.headers['X-Timestamp']}\n${inner.headers['X-Nonce']}\n${bodyHash}`;
    const sigBytes = hexToBytes(inner.headers['X-Signature']);

    if (!verify(cliPub, new TextEncoder().encode(canonical), sigBytes)) {
      appendAudit(env.from_did, 'rpc_sig_invalid', myDID, `id=${env.id}`);
      await sendRPCError(env, myDID, privateKey, 401, 'Invalid signature');
      return;
    }

    // 4. Route through handler chain (pass AbortSignal for cancellation)
    if (controller.signal.aborted) return;

    const response = await rpcRouter(
      inner.method, inner.path, inner.headers, inner.body ?? '',
      controller.signal,
    );

    // 5. Send encrypted response
    if (!controller.signal.aborted) {
      await sendRPCResponse(env, myDID, privateKey, response);
      appendAudit(env.from_did, 'rpc_handled', myDID,
        `id=${env.id} path=${inner.path} status=${response.status}`);
    }
  } catch (err) {
    await sendRPCError(env, myDID, privateKey, 500, err instanceof Error ? err.message : 'Internal error');
  } finally {
    inFlightRequests.delete(env.id);
  }
}

/**
 * Handle an RPC cancel envelope — abort the in-flight handler.
 */
export function handleRPCCancel(env: MsgBoxEnvelope): void {
  const cancelId = env.cancel_of ?? env.id;
  const controller = inFlightRequests.get(cancelId);
  if (controller) {
    controller.abort();
    inFlightRequests.delete(cancelId);
    const myDID = getIdentity()?.did ?? '';
    appendAudit(env.from_did, 'rpc_cancelled', myDID, `id=${cancelId}`);
  }
}

// ---------------------------------------------------------------
// D2D Outbound via WebSocket
// ---------------------------------------------------------------

/**
 * Send a D2D message to another Home Node via WebSocket envelope.
 *
 * Alternative to HTTP POST /forward — uses the persistent WS connection.
 */
export function sendD2DViaWS(
  recipientDID: string,
  recipientEd25519Pub: Uint8Array,
  plaintextMessage: Record<string, unknown>,
): boolean {
  const id = getIdentity();
  if (!id) return false;

  const plainBytes = new TextEncoder().encode(JSON.stringify(plaintextMessage));

  // Encrypt with recipient's Ed25519 key (sealEncrypt handles Ed25519→X25519)
  const sealed = sealEncrypt(plainBytes, recipientEd25519Pub);

  // Sign the plaintext
  const sig = sign(id.privateKey, plainBytes);

  // Build d2dPayload
  const d2dPayload = JSON.stringify({
    c: bytesToBase64(sealed),
    s: bytesToHex(sig),
  });

  // Send as envelope
  return sendEnvelope({
    type: 'd2d',
    id: `d2d-${bytesToHex(randomBytes(8))}`,
    from_did: id.did,
    to_did: recipientDID,
    expires_at: Math.floor(Date.now() / 1000) + 300,
    ciphertext: d2dPayload,
  });
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

async function sendRPCResponse(
  requestEnv: MsgBoxEnvelope,
  myDID: string,
  privateKey: Uint8Array,
  response: { status: number; headers: Record<string, string>; body: string },
): Promise<void> {
  const responseJSON = JSON.stringify(response);
  const responseBytes = new TextEncoder().encode(responseJSON);

  // Encrypt response with CLI's public key
  const cliPub = extractPublicKey(requestEnv.from_did);
  const sealed = sealEncrypt(responseBytes, cliPub);

  sendEnvelope({
    type: 'rpc',
    id: requestEnv.id,
    from_did: myDID,
    to_did: requestEnv.from_did,
    direction: 'response',
    expires_at: Math.floor(Date.now() / 1000) + 120,
    ciphertext: bytesToBase64(sealed),
  });
}

async function sendRPCError(
  requestEnv: MsgBoxEnvelope,
  myDID: string,
  privateKey: Uint8Array,
  status: number,
  message: string,
): Promise<void> {
  await sendRPCResponse(requestEnv, myDID, privateKey, {
    status,
    headers: {},
    body: JSON.stringify({ error: message }),
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
