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
import { alwaysPasses } from './families';
import { receiveAndStage, type ReceiveResult } from './receive';
import { quarantineMessage } from './quarantine';
import { appendAudit } from '../audit/service';

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

  // 3. Trust evaluation + 4. Scenario policy (combined in receiveAndStage for trusted)
  // But we need scenario check BEFORE staging for known senders
  if (senderTrust !== 'blocked' && senderTrust !== 'unknown') {
    // Known sender — check scenario policy
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

  // 5. Stage / quarantine / drop via existing receive module
  const stageResult = receiveAndStage(
    message.type, message.from, senderTrust, message.body, message.id,
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
