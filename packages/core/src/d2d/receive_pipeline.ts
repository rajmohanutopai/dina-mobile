/**
 * D2D receive pipeline — orchestrate the full inbound message flow.
 *
 * Pipeline:
 *   1. Unseal NaCl-encrypted payload → plaintext DinaMessage JSON
 *   2. Verify Ed25519 signature against sender's verification keys
 *   3. Trust evaluation: blocked → drop, unknown → quarantine, known → proceed
 *   4. Scenario policy: check message type against per-contact deny list
 *   5. Stage to vault (map message type → vault item type) or quarantine
 *   6. Audit log the receive
 *
 * Source: ARCHITECTURE.md Tasks 6.8–6.12
 */

import { unsealMessage, type D2DPayload } from './envelope';
import { verifyMessage } from './signature';
import { checkScenarioGate } from './gates';
import { alwaysPasses, isValidV1Type, validateMessageBody } from './families';
import { receiveAndStage, type ReceiveResult } from './receive';
import { quarantineMessage } from './quarantine';
import { appendAudit } from '../audit/service';
import { isReplayedMessage, recordMessageId } from '../transport/adversarial';

export type ReceivePipelineAction = 'staged' | 'quarantined' | 'dropped' | 'ephemeral';

export interface ReceivePipelineResult {
  action: ReceivePipelineAction;
  messageId?: string;
  messageType?: string;
  senderDID?: string;
  signatureValid: boolean;
  stagingId?: string;
  quarantineId?: string;
  reason: string;
}

/**
 * Process an incoming D2D payload through the full receive pipeline.
 *
 * @param payload — the sealed D2D payload { c: base64, s: hex }
 * @param recipientPub — recipient's Ed25519 public key
 * @param recipientPriv — recipient's Ed25519 private key
 * @param senderVerificationKeys — sender's verification public keys (from DID doc)
 * @param senderTrust — sender's trust level (from contact directory)
 */
export function receiveD2D(
  payload: D2DPayload,
  recipientPub: Uint8Array,
  recipientPriv: Uint8Array,
  senderVerificationKeys: Uint8Array[],
  senderTrust: string,
): ReceivePipelineResult {
  // 1. Unseal
  let message;
  let signatureHex: string;
  try {
    const unsealed = unsealMessage(payload, recipientPub, recipientPriv);
    message = unsealed.message;
    signatureHex = unsealed.signatureHex;
  } catch (err) {
    return {
      action: 'dropped',
      signatureValid: false,
      reason: `Unseal failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }

  // 2. Verify signature
  const signatureValid = verifyMessage(message, signatureHex, senderVerificationKeys);
  if (!signatureValid) {
    appendAudit(message.from, 'd2d_recv_bad_sig', message.to, `id=${message.id}`);
    return {
      action: 'dropped',
      messageId: message.id,
      messageType: message.type,
      senderDID: message.from,
      signatureValid: false,
      reason: 'Signature verification failed',
    };
  }

  // 3. Replay detection (SEC-HIGH-08) — reject already-seen message IDs.
  // Uses sender DID + message ID as the cache key to prevent cross-sender
  // ID collisions. Must come AFTER signature verification to prevent
  // unauthenticated messages from polluting the cache.
  const replayKey = `${message.from}|${message.id}`;
  if (isReplayedMessage(replayKey)) {
    appendAudit(message.from, 'd2d_recv_replay', message.to,
      `id=${message.id}`);
    return {
      action: 'dropped',
      messageId: message.id,
      messageType: message.type,
      senderDID: message.from,
      signatureValid: true,
      reason: 'Replayed message (already processed)',
    };
  }
  recordMessageId(replayKey);

  // 4. V1 type enforcement — silently drop non-V1 message types.
  // Matches Go's ProcessInbound which rejects non-V1 types (benign drop —
  // still returns 202 to prevent sender fingerprinting). Audit logged.
  if (!isValidV1Type(message.type)) {
    appendAudit(message.from, 'd2d_recv_type_rejected', message.to,
      `type=${message.type}`);
    return {
      action: 'dropped',
      messageId: message.id,
      messageType: message.type,
      senderDID: message.from,
      signatureValid: true,
      reason: `Non-V1 message type "${message.type}" rejected`,
    };
  }

  // 5. Body size validation — reject oversized message bodies after decryption.
  // Matches Go's ValidateBody() in ProcessInbound (256 KB max).
  const bodyValidationError = validateMessageBody(message.body);
  if (bodyValidationError) {
    appendAudit(message.from, 'd2d_recv_body_oversized', message.to,
      `id=${message.id}`);
    return {
      action: 'dropped',
      messageId: message.id,
      messageType: message.type,
      senderDID: message.from,
      signatureValid: true,
      reason: bodyValidationError,
    };
  }

  // Determine if sender is an explicit contact with a positive trust level.
  // 'unknown' and '' mean "not a known contact" → quarantine.
  // Only explicit trust levels (verified, trusted, contact_ring1, etc.) proceed.
  // Fix: Codex #15 — 'unknown' was incorrectly treated as contact-equivalent.
  const CONTACT_TRUST_LEVELS = new Set(['verified', 'trusted', 'contact_ring1', 'contact_ring2', 'self']);
  const isContact = CONTACT_TRUST_LEVELS.has(senderTrust);

  // 6. Trust evaluation + 7. Scenario policy
  // Check scenario policy for known (non-blocked) senders
  if (isContact) {
    if (!alwaysPasses(message.type) && !checkScenarioGate(message.from, message.type)) {
      appendAudit(message.from, 'd2d_recv_scenario_denied', message.to,
        `type=${message.type}`);
      return {
        action: 'dropped',
        messageId: message.id,
        messageType: message.type,
        senderDID: message.from,
        signatureValid: true,
        reason: `Scenario policy denied message type "${message.type}"`,
      };
    }
  }

  // 8. Stage / quarantine / drop via existing receive module
  const stageResult = receiveAndStage(
    message.type, message.from, senderTrust, message.body, message.id, isContact,
  );

  // If quarantined, also store in quarantine management
  let quarantineId: string | undefined;
  if (stageResult.action === 'quarantined') {
    const q = quarantineMessage(message.from, message.type, message.body);
    quarantineId = q.id;
  }

  // 6. Audit log
  appendAudit(message.from, `d2d_recv_${stageResult.action}`, message.to,
    `type=${message.type} id=${message.id}`);

  return {
    action: stageResult.action,
    messageId: message.id,
    messageType: message.type,
    senderDID: message.from,
    signatureValid: true,
    stagingId: stageResult.stagingId,
    quarantineId,
    reason: stageResult.reason,
  };
}
