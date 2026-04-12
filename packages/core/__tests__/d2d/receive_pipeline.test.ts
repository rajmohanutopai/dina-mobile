/**
 * T6.8–6.12 — Full D2D receive pipeline: unseal → verify → trust → scenario → stage.
 *
 * Source: ARCHITECTURE.md Tasks 6.8–6.12
 */

import { receiveD2D } from '../../src/d2d/receive_pipeline';
import { sealMessage, type DinaMessage } from '../../src/d2d/envelope';
import { addContact, setScenarioDeny, clearGatesState } from '../../src/d2d/gates';
import { resetStagingState } from '../../src/staging/service';
import { resetAuditState, queryAudit } from '../../src/audit/service';
import { resetQuarantineState, quarantineSize } from '../../src/d2d/quarantine';
import { getPublicKey } from '../../src/crypto/ed25519';
import { TEST_ED25519_SEED } from '@dina/test-harness';

const senderPriv = TEST_ED25519_SEED;
const senderPub = getPublicKey(senderPriv);
const recipientPriv = new Uint8Array(32).fill(0x42);
const recipientPub = getPublicKey(recipientPriv);

function buildSealed(overrides?: Partial<DinaMessage>) {
  const msg: DinaMessage = {
    id: 'msg-001',
    type: 'social.update',
    from: 'did:plc:sender',
    to: 'did:plc:recipient',
    created_time: Date.now(),
    body: '{"text":"hello"}',
    ...overrides,
  };
  return sealMessage(msg, senderPriv, recipientPub);
}

describe('D2D Receive Pipeline', () => {
  beforeEach(() => {
    clearGatesState();
    resetStagingState();
    resetAuditState();
    resetQuarantineState();
  });

  describe('full pipeline success', () => {
    it('unseals → verifies → stages trusted message', () => {
      addContact('did:plc:sender');
      const payload = buildSealed();
      const result = receiveD2D(payload, recipientPub, recipientPriv, [senderPub], 'trusted');
      expect(result.action).toBe('staged');
      expect(result.signatureValid).toBe(true);
      expect(result.messageId).toBe('msg-001');
      expect(result.messageType).toBe('social.update');
      expect(result.senderDID).toBe('did:plc:sender');
      expect(result.stagingId).toMatch(/^stg-/);
    });

    it('audit logs the receive', () => {
      addContact('did:plc:sender');
      receiveD2D(buildSealed(), recipientPub, recipientPriv, [senderPub], 'trusted');
      const audits = queryAudit({ action: 'd2d_recv_staged' });
      expect(audits.length).toBeGreaterThan(0);
    });
  });

  describe('unseal failure', () => {
    it('wrong recipient key → dropped', () => {
      const payload = buildSealed();
      const wrongPriv = new Uint8Array(32).fill(0x99);
      const wrongPub = getPublicKey(wrongPriv);
      const result = receiveD2D(payload, wrongPub, wrongPriv, [senderPub], 'trusted');
      expect(result.action).toBe('dropped');
      expect(result.signatureValid).toBe(false);
      expect(result.reason).toContain('Unseal failed');
    });
  });

  describe('signature verification', () => {
    it('valid signature passes', () => {
      addContact('did:plc:sender');
      const result = receiveD2D(buildSealed(), recipientPub, recipientPriv, [senderPub], 'trusted');
      expect(result.signatureValid).toBe(true);
    });

    it('wrong verification keys → dropped', () => {
      const wrongKey = getPublicKey(new Uint8Array(32).fill(0x77));
      const result = receiveD2D(buildSealed(), recipientPub, recipientPriv, [wrongKey], 'trusted');
      expect(result.action).toBe('dropped');
      expect(result.signatureValid).toBe(false);
      expect(result.reason).toContain('Signature');
    });

    it('bad signature audit-logged', () => {
      const wrongKey = getPublicKey(new Uint8Array(32).fill(0x77));
      receiveD2D(buildSealed(), recipientPub, recipientPriv, [wrongKey], 'trusted');
      expect(queryAudit({ action: 'd2d_recv_bad_sig' }).length).toBeGreaterThan(0);
    });
  });

  describe('trust evaluation', () => {
    it('blocked sender → dropped', () => {
      const result = receiveD2D(buildSealed(), recipientPub, recipientPriv, [senderPub], 'blocked');
      expect(result.action).toBe('dropped');
    });

    it('unknown sender → quarantined', () => {
      const result = receiveD2D(buildSealed(), recipientPub, recipientPriv, [senderPub], 'unknown');
      expect(result.action).toBe('quarantined');
      expect(result.quarantineId).toBeTruthy();
      expect(quarantineSize()).toBe(1);
    });
  });

  describe('scenario policy', () => {
    it('denied message type → dropped', () => {
      addContact('did:plc:sender');
      setScenarioDeny('did:plc:sender', ['social.update']);
      const result = receiveD2D(buildSealed(), recipientPub, recipientPriv, [senderPub], 'trusted');
      expect(result.action).toBe('dropped');
      expect(result.reason).toContain('Scenario policy');
    });

    it('safety.alert always passes scenario check', () => {
      addContact('did:plc:sender');
      setScenarioDeny('did:plc:sender', ['safety.alert']);
      const payload = buildSealed({ type: 'safety.alert' });
      const result = receiveD2D(payload, recipientPub, recipientPriv, [senderPub], 'trusted');
      expect(result.action).toBe('staged'); // safety.alert cannot be blocked
    });

    it('scenario denial audit-logged', () => {
      addContact('did:plc:sender');
      setScenarioDeny('did:plc:sender', ['social.update']);
      receiveD2D(buildSealed(), recipientPub, recipientPriv, [senderPub], 'trusted');
      expect(queryAudit({ action: 'd2d_recv_scenario_denied' }).length).toBeGreaterThan(0);
    });
  });

  describe('ephemeral messages', () => {
    it('presence.signal → ephemeral (not staged)', () => {
      addContact('did:plc:sender');
      const payload = buildSealed({ type: 'presence.signal' });
      const result = receiveD2D(payload, recipientPub, recipientPriv, [senderPub], 'trusted');
      expect(result.action).toBe('ephemeral');
    });
  });
});
