/**
 * D2D send pipeline — orchestrate the full message send flow.
 *
 * Pipeline:
 *   1. Build DinaMessage envelope (type, body, from, to, id, created_time)
 *   2. Egress 4-gate check (contact → scenario → sharing → audit)
 *   3. Sign plaintext JSON with sender's Ed25519 identity key
 *   4. Seal with recipient's X25519 public key (NaCl crypto_box_seal)
 *   5. Deliver to recipient's MsgBox /forward (or direct HTTPS)
 *   6. On delivery failure → queue in outbox for retry
 *   7. Audit log the send attempt
 *
 * Source: ARCHITECTURE.md Tasks 6.3–6.7
 */

import { buildMessage, sealMessage, type DinaMessage, type D2DPayload } from './envelope';
import { checkEgressGates } from './gates';
import { isValidV1Type } from './families';
import { appendAudit } from '../audit/service';
import { deliverMessage, type ServiceType, type DeliveryResult, type SenderIdentity } from '../transport/delivery';
import { enqueueMessage } from '../transport/outbox';
import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface SendRequest {
  recipientDID: string;
  messageType: string;
  body: string;
  senderDID: string;
  senderPrivateKey: Uint8Array;
  recipientPublicKey: Uint8Array;
  serviceType: ServiceType;
  endpoint: string;
  dataCategories?: string[];
}

export interface SendResult {
  sent: boolean;
  messageId: string;
  delivered: boolean;
  buffered: boolean;
  queued: boolean;
  deniedAt?: string;
  error?: string;
}

/**
 * Send a D2D message through the full pipeline.
 *
 * Never throws — all errors are returned in the result.
 */
export async function sendD2D(req: SendRequest): Promise<SendResult> {
  const messageId = `d2d-${bytesToHex(randomBytes(8))}`;

  // 0. V1 type enforcement — reject non-V1 message types before any further processing.
  // Matches Go's Gate 3 (V1MessageFamilies check in SendMessage).
  if (!isValidV1Type(req.messageType)) {
    return {
      sent: false, messageId, delivered: false, buffered: false, queued: false,
      deniedAt: 'type_enforcement',
      error: `Unknown message type "${req.messageType}". Valid V1 types: presence.signal, coordination.request/response, social.update, safety.alert, trust.vouch.request/response`,
    };
  }

  // 1. Egress 4-gate check
  const gateResult = checkEgressGates(
    req.recipientDID,
    req.messageType,
    req.dataCategories ?? [],
  );

  if (!gateResult.allowed) {
    appendAudit(req.senderDID, 'd2d_send_denied', req.recipientDID,
      `type=${req.messageType} denied_at=${gateResult.deniedAt}`);
    return {
      sent: false, messageId, delivered: false, buffered: false, queued: false,
      deniedAt: gateResult.deniedAt,
    };
  }

  // 2. Build message
  const message: DinaMessage = {
    id: messageId,
    type: req.messageType,
    from: req.senderDID,
    to: req.recipientDID,
    created_time: Date.now(),
    body: req.body,
  };

  // 3 + 4. Sign + seal
  const payload = sealMessage(message, req.senderPrivateKey, req.recipientPublicKey);
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  // 5. Deliver
  try {
    const senderIdentity: SenderIdentity = {
      did: req.senderDID,
      privateKey: req.senderPrivateKey,
    };
    const delivery = await deliverMessage(
      req.recipientDID, payloadBytes, req.serviceType, req.endpoint,
      senderIdentity,
    );

    // 7. Audit
    appendAudit(req.senderDID, 'd2d_send', req.recipientDID,
      `type=${req.messageType} id=${messageId} delivered=${delivery.delivered}`);

    if (delivery.delivered || delivery.buffered) {
      return {
        sent: true, messageId,
        delivered: delivery.delivered,
        buffered: delivery.buffered,
        queued: false,
      };
    }

    // Delivery failed but didn't throw — queue for retry
    // Wrapped in try/catch: enqueueMessage throws on full queue (Fix: Codex #13)
    try { enqueueMessage(req.recipientDID, payloadBytes); } catch { /* queue full */ }
    appendAudit(req.senderDID, 'd2d_send_queued', req.recipientDID,
      `type=${req.messageType} id=${messageId} error=${delivery.error ?? 'delivery_failed'}`);
    return {
      sent: true, messageId, delivered: false, buffered: false, queued: true,
      error: delivery.error,
    };
  } catch (err) {
    // 6. Network failure → queue in outbox
    try { enqueueMessage(req.recipientDID, payloadBytes); } catch { /* queue full */ }

    appendAudit(req.senderDID, 'd2d_send_queued', req.recipientDID,
      `type=${req.messageType} id=${messageId} error=${err instanceof Error ? err.message : 'unknown'}`);

    return {
      sent: true, messageId, delivered: false, buffered: false, queued: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
