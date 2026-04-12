/**
 * T3.8 — MsgBox WebSocket: connect, Ed25519 challenge-response handshake,
 * reconnect with exponential backoff.
 *
 * Category B+: NEW mobile-specific test.
 *
 * Source: ARCHITECTURE.md Section 19 + msgbox/internal/auth.go.
 */

import {
  connectToMsgBox,
  completeHandshake,
  buildHandshakePayload,
  computeReconnectDelay,
  isConnected,
  disconnect,
  resetConnectionState,
  signHandshake,
} from '../../src/relay/msgbox_ws';
import { verify, getPublicKey } from '../../src/crypto/ed25519';
import { TEST_ED25519_SEED } from '@dina/test-harness';

describe('MsgBox WebSocket Client', () => {
  beforeEach(() => resetConnectionState());

  describe('connectToMsgBox', () => {
    it('connects to wss:// endpoint', async () => {
      await connectToMsgBox('wss://mailbox.dinakernel.com/ws');
      expect(isConnected()).toBe(true);
    });

    it('rejects non-wss URL in production', async () => {
      await expect(connectToMsgBox('http://insecure.com'))
        .rejects.toThrow('insecure URL scheme');
    });

    it('allows ws://localhost for development', async () => {
      await connectToMsgBox('ws://localhost:9000/ws');
      expect(isConnected()).toBe(true);
    });
  });

  describe('Ed25519 challenge-response handshake', () => {
    it('builds correct handshake payload', () => {
      const payload = buildHandshakePayload('abc123nonce', '2026-04-09T12:00:00Z');
      expect(payload).toBe('AUTH_RELAY\nabc123nonce\n2026-04-09T12:00:00Z');
    });

    it('payload starts with AUTH_RELAY', () => {
      const payload = buildHandshakePayload('nonce', '2026-04-09T12:00:00Z');
      expect(payload.startsWith('AUTH_RELAY')).toBe(true);
    });

    it('payload contains nonce and timestamp', () => {
      const payload = buildHandshakePayload('my-nonce', '2026-01-01T00:00:00Z');
      expect(payload).toContain('my-nonce');
      expect(payload).toContain('2026-01-01T00:00:00Z');
    });

    it('completes handshake with valid key', async () => {
      const result = await completeHandshake('nonce', '2026-04-09T12:00:00Z', TEST_ED25519_SEED);
      expect(result).toBe(true);
    });

    it('signHandshake produces verifiable signature', () => {
      const nonce = 'test-nonce';
      const timestamp = '2026-04-09T12:00:00Z';
      const sigHex = signHandshake(nonce, timestamp, TEST_ED25519_SEED);

      expect(sigHex).toMatch(/^[0-9a-f]{128}$/);

      // Verify the signature against the public key
      const pubKey = getPublicKey(TEST_ED25519_SEED);
      const payload = buildHandshakePayload(nonce, timestamp);
      const sigBytes = Uint8Array.from(Buffer.from(sigHex, 'hex'));
      expect(verify(pubKey, new TextEncoder().encode(payload), sigBytes)).toBe(true);
    });

    it('different nonce → different signature', () => {
      const sig1 = signHandshake('nonce-A', '2026-04-09T12:00:00Z', TEST_ED25519_SEED);
      const sig2 = signHandshake('nonce-B', '2026-04-09T12:00:00Z', TEST_ED25519_SEED);
      expect(sig1).not.toBe(sig2);
    });

    it('different timestamp → different signature', () => {
      const sig1 = signHandshake('nonce', '2026-04-09T12:00:00Z', TEST_ED25519_SEED);
      const sig2 = signHandshake('nonce', '2026-04-09T13:00:00Z', TEST_ED25519_SEED);
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('reconnect backoff', () => {
    it('attempt 0 → 1000ms', () => {
      expect(computeReconnectDelay(0)).toBe(1000);
    });

    it('attempt 1 → 2000ms', () => {
      expect(computeReconnectDelay(1)).toBe(2000);
    });

    it('attempt 2 → 4000ms', () => {
      expect(computeReconnectDelay(2)).toBe(4000);
    });

    it('attempt 3 → 8000ms', () => {
      expect(computeReconnectDelay(3)).toBe(8000);
    });

    it('attempt 4 → 16000ms', () => {
      expect(computeReconnectDelay(4)).toBe(16000);
    });

    it('caps at 30000ms (30s max)', () => {
      expect(computeReconnectDelay(5)).toBe(30000);
      expect(computeReconnectDelay(10)).toBe(30000);
      expect(computeReconnectDelay(100)).toBe(30000);
    });
  });

  describe('connection state', () => {
    it('isConnected before connect → false', () => {
      expect(isConnected()).toBe(false);
    });

    it('isConnected after connect → true', async () => {
      await connectToMsgBox('wss://mailbox.dinakernel.com/ws');
      expect(isConnected()).toBe(true);
    });

    it('disconnect sets connected to false', async () => {
      await connectToMsgBox('wss://mailbox.dinakernel.com/ws');
      await disconnect();
      expect(isConnected()).toBe(false);
    });

    it('disconnect is safe when not connected', async () => {
      await expect(disconnect()).resolves.toBeUndefined();
      expect(isConnected()).toBe(false);
    });
  });
});
