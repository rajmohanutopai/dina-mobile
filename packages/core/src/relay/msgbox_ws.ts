/**
 * MsgBox WebSocket client — real transport for D2D + RPC relay.
 *
 * Protocol (from MsgBox Universal Transport spec):
 *   1. Connect outbound to wss://mailbox.dinakernel.com/ws
 *   2. Auth: sign "AUTH_RELAY\n{nonce}\n{ts}" with root Ed25519 key
 *   3. Read pump: dispatch JSON envelopes by type (d2d/rpc/cancel)
 *   4. Reconnect with exponential backoff (1s → 60s cap)
 *
 * The WebSocket implementation is injectable — production uses React
 * Native's WebSocket, tests use a mock.
 *
 * Source: MsgBox Protocol — Home Node Implementation Guide
 */

import { sign, getPublicKey } from '../crypto/ed25519';
import { bytesToHex } from '@noble/hashes/utils.js';

// ---------------------------------------------------------------
// Envelope types (unified format for all MsgBox frames)
// ---------------------------------------------------------------

export interface MsgBoxEnvelope {
  type: 'd2d' | 'rpc' | 'cancel';
  id: string;
  from_did: string;
  to_did: string;
  direction?: 'request' | 'response';
  expires_at?: number;
  subtype?: string;
  cancel_of?: string;
  ciphertext?: string;
}

export type EnvelopeHandler = (envelope: MsgBoxEnvelope) => void;

// ---------------------------------------------------------------
// Backoff constants
// ---------------------------------------------------------------

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60_000; // 60s cap (matching Go)

// ---------------------------------------------------------------
// Injectable WebSocket factory (for testing)
// ---------------------------------------------------------------

export interface WSLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
}

export type WSFactory = (url: string) => WSLike;

let wsFactory: WSFactory | null = null;

/** Set the WebSocket factory (production: React Native WebSocket, tests: mock). */
export function setWSFactory(factory: WSFactory | null): void {
  wsFactory = factory;
}

// ---------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------

let ws: WSLike | null = null;
let connected = false;
let authenticated = false;
let currentURL: string | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = true;

// Identity for auth handshake
let homeNodeDID: string = '';
let homeNodePrivateKey: Uint8Array | null = null;

// Message handlers
let d2dHandler: EnvelopeHandler | null = null;
let rpcHandler: EnvelopeHandler | null = null;
let cancelHandler: EnvelopeHandler | null = null;

// ---------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------

/** Configure identity for auth handshake. Must be called before connect. */
export function setIdentity(did: string, privateKey: Uint8Array): void {
  homeNodeDID = did;
  homeNodePrivateKey = privateKey;
}

/** Get the current identity (used by handlers module for unified config). */
export function getIdentity(): { did: string; privateKey: Uint8Array } | null {
  if (!homeNodeDID || !homeNodePrivateKey) return null;
  return { did: homeNodeDID, privateKey: homeNodePrivateKey };
}

/** Register handler for inbound D2D envelopes. */
export function onD2DMessage(handler: EnvelopeHandler): void { d2dHandler = handler; }

/** Register handler for inbound RPC request envelopes. */
export function onRPCRequest(handler: EnvelopeHandler): void { rpcHandler = handler; }

/** Register handler for RPC cancel envelopes. */
export function onRPCCancel(handler: EnvelopeHandler): void { cancelHandler = handler; }

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Build the handshake payload: "AUTH_RELAY\n{nonce}\n{timestamp}".
 */
export function buildHandshakePayload(nonce: string, timestamp: string): string {
  return `AUTH_RELAY\n${nonce}\n${timestamp}`;
}

/**
 * Compute reconnect backoff delay in ms.
 * Exponential: 1s → 2s → 4s → ... → capped at 60s.
 */
export function computeReconnectDelay(attempt: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
}

/**
 * Sign the handshake payload with the root identity Ed25519 key.
 */
export function signHandshake(nonce: string, timestamp: string, privateKey: Uint8Array): string {
  const payload = buildHandshakePayload(nonce, timestamp);
  const sig = sign(privateKey, new TextEncoder().encode(payload));
  return bytesToHex(sig);
}

/**
 * Connect to MsgBox WebSocket relay.
 *
 * 1. Opens WebSocket to the MsgBox URL
 * 2. Waits for auth_challenge
 * 3. Signs and sends auth_response
 * 4. Starts read pump for envelope dispatch
 * 5. Auto-reconnects on disconnect
 */
export async function connectToMsgBox(url: string): Promise<void> {
  if (!wsFactory) {
    throw new Error('msgbox_ws: no WebSocket factory set — call setWSFactory() first');
  }
  if (!homeNodePrivateKey || !homeNodeDID) {
    throw new Error('msgbox_ws: identity not configured — call setIdentity() first');
  }

  const isSecure = url.startsWith('wss://');
  const isLocalDev = url.startsWith('ws://localhost') || url.startsWith('ws://127.0.0.1');
  if (!isSecure && !isLocalDev) {
    throw new Error('msgbox_ws: insecure URL — wss:// required (ws:// only for localhost)');
  }

  currentURL = url;
  shouldReconnect = true;
  doConnect(url);
}

/** Check if connected to MsgBox. */
export function isConnected(): boolean {
  return connected;
}

/** Check if fully authenticated (connected + auth complete). */
export function isAuthenticated(): boolean {
  return connected && authenticated;
}

/** Send a raw envelope over the WebSocket. */
export function sendEnvelope(envelope: MsgBoxEnvelope): boolean {
  if (!ws || !connected || !authenticated) return false;
  try {
    ws.send(JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/** Disconnect and stop reconnection. */
export async function disconnect(): Promise<void> {
  shouldReconnect = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { try { ws.close(); } catch { /* ok */ } ws = null; }
  connected = false;
  authenticated = false;
  currentURL = null;
  reconnectAttempt = 0;
}

/** Complete the handshake (for backward compat with existing tests). */
export async function completeHandshake(
  nonce: string, timestamp: string, privateKey: Uint8Array,
): Promise<boolean> {
  if (privateKey.length !== 32) return false;
  signHandshake(nonce, timestamp, privateKey);
  return true;
}

/** Reset all connection state (for testing). */
export function resetConnectionState(): void {
  disconnect();
  d2dHandler = null;
  rpcHandler = null;
  cancelHandler = null;
  homeNodeDID = '';
  homeNodePrivateKey = null;
  wsFactory = null;
}

// ---------------------------------------------------------------
// Internal: connection lifecycle
// ---------------------------------------------------------------

function doConnect(url: string): void {
  if (!wsFactory) return;

  try {
    ws = wsFactory(url);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected = true;
    reconnectAttempt = 0; // reset backoff on successful connect
    // Wait for auth_challenge from server — handled in onmessage
  };

  ws.onmessage = (event) => {
    try {
      // Finding #8: Reject binary frames — MsgBox protocol is JSON-only
      if (typeof event.data !== 'string') return;

      const msg = JSON.parse(event.data);

      // Auth challenge from server
      if (msg.type === 'auth_challenge' && !authenticated) {
        handleAuthChallenge(msg);
        return;
      }

      // Auth success confirmation
      if (msg.type === 'auth_success') {
        authenticated = true;
        return;
      }

      // Authenticated message dispatch
      if (authenticated) {
        dispatchEnvelope(msg as MsgBoxEnvelope);
      }
    } catch {
      // Malformed message — ignore
    }
  };

  ws.onclose = () => {
    connected = false;
    authenticated = false;
    ws = null;
    if (shouldReconnect) scheduleReconnect();
  };

  ws.onerror = () => {
    // Error triggers close, which triggers reconnect
  };
}

function handleAuthChallenge(challenge: { nonce: string; ts: number }): void {
  if (!ws || !homeNodePrivateKey || !homeNodeDID) return;

  const sig = signHandshake(challenge.nonce, String(challenge.ts), homeNodePrivateKey);
  const pubHex = bytesToHex(getPublicKey(homeNodePrivateKey));

  ws.send(JSON.stringify({
    type: 'auth_response',
    did: homeNodeDID,
    sig,
    pub: pubHex,
  }));

  // Wait for server's auth_success message before marking authenticated.
  // The onmessage handler checks for msg.type === 'auth_success'.
}

function dispatchEnvelope(env: MsgBoxEnvelope): void {
  // Finding #9: Validate to_did matches our DID — reject misdirected envelopes
  if (env.to_did && homeNodeDID && env.to_did !== homeNodeDID) return;

  // Finding #9: Reject expired envelopes (expires_at is unix seconds)
  if (env.expires_at && env.expires_at < Math.floor(Date.now() / 1000)) return;

  switch (env.type) {
    case 'd2d':
      if (d2dHandler) d2dHandler(env);
      break;
    case 'rpc':
      if (env.direction === 'request' && rpcHandler) rpcHandler(env);
      break;
    case 'cancel':
      if (cancelHandler) cancelHandler(env);
      break;
  }
}

function scheduleReconnect(): void {
  if (!shouldReconnect || !currentURL) return;
  const delay = computeReconnectDelay(reconnectAttempt);
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    if (currentURL && shouldReconnect) doConnect(currentURL);
  }, delay);
}
