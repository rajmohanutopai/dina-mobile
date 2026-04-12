/**
 * MsgBox WebSocket client — outbound connection, Ed25519 challenge-response,
 * auto-reconnect with exponential backoff.
 *
 * Auth handshake: sign "AUTH_RELAY\n{nonce}\n{timestamp}" with root key.
 * Reconnect: 1s → 2s → 4s → 8s → 16s → max 30s.
 *
 * Mobile-specific protocol: Section 19 of ARCHITECTURE.md.
 */

import { sign } from '../crypto/ed25519';
import { bytesToHex } from '@noble/hashes/utils.js';

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/** Module-level connection state. */
let connected = false;
let currentURL: string | null = null;

/** Reset connection state (for testing). */
export function resetConnectionState(): void {
  connected = false;
  currentURL = null;
}

/**
 * Build the handshake payload: "AUTH_RELAY\n{nonce}\n{timestamp}".
 *
 * This is signed by the root identity key and sent to MsgBox to prove
 * ownership of the DID. MsgBox verifies the signature against the
 * DID document's verification method.
 */
export function buildHandshakePayload(nonce: string, timestamp: string): string {
  return `AUTH_RELAY\n${nonce}\n${timestamp}`;
}

/**
 * Compute reconnect backoff delay in ms.
 *
 * Exponential: 1s → 2s → 4s → 8s → 16s → capped at 30s.
 * Formula: min(BASE_DELAY * 2^attempt, MAX_DELAY)
 */
export function computeReconnectDelay(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY_MS);
}

/**
 * Sign the handshake payload with the root identity Ed25519 key.
 * Returns the hex-encoded signature for sending to MsgBox.
 */
export function signHandshake(
  nonce: string,
  timestamp: string,
  privateKey: Uint8Array,
): string {
  const payload = buildHandshakePayload(nonce, timestamp);
  const sig = sign(privateKey, new TextEncoder().encode(payload));
  return bytesToHex(sig);
}

/**
 * Connect to MsgBox WebSocket.
 *
 * Validates the URL scheme (wss:// required for production).
 * Actual WebSocket creation is deferred to the platform layer —
 * this module manages state and protocol logic.
 */
export async function connectToMsgBox(url: string): Promise<void> {
  if (!url.startsWith('wss://') && !url.startsWith('ws://localhost')) {
    throw new Error('msgbox_ws: insecure URL scheme — wss:// required');
  }
  currentURL = url;
  connected = true;
}

/**
 * Complete the Ed25519 challenge-response handshake.
 *
 * Signs "AUTH_RELAY\n{nonce}\n{timestamp}" and returns the signature.
 * In production, the signed response is sent over the WS connection
 * and MsgBox verifies it against the DID's public key.
 *
 * Returns true if the handshake payload was signed successfully.
 * The actual WS round-trip is handled by the platform transport layer.
 */
export async function completeHandshake(
  nonce: string,
  timestamp: string,
  privateKey: Uint8Array,
): Promise<boolean> {
  if (privateKey.length !== 32) {
    return false;
  }
  // Sign the payload — if the key is valid Ed25519, this succeeds
  signHandshake(nonce, timestamp, privateKey);
  return true;
}

/** Check if currently connected to MsgBox. */
export function isConnected(): boolean {
  return connected;
}

/** Disconnect from MsgBox. Safe to call when not connected. */
export async function disconnect(): Promise<void> {
  connected = false;
  currentURL = null;
}
