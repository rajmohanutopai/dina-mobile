/**
 * D2D V1 message families — type validation and vault-item-type mapping.
 *
 * Seven message types defined by the V1 protocol:
 *   presence.signal       → never stored (ephemeral, online/typing indicator)
 *   coordination.request  → stored (meeting, scheduling)
 *   coordination.response → stored (reply to coordination)
 *   social.update         → stored as "relationship_note"
 *   safety.alert          → always passes (cannot be blocked by policy)
 *   trust.vouch.request   → stored (identity verification request)
 *   trust.vouch.response  → stored as "trust_attestation"
 *
 * Source: core/internal/domain/d2d.go
 */

/** All valid V1 message types. */
const V1_TYPES = new Set([
  'presence.signal',
  'coordination.request',
  'coordination.response',
  'social.update',
  'safety.alert',
  'trust.vouch.request',
  'trust.vouch.response',
]);

/**
 * Mapping from D2D message type to vault item type.
 * Types not in this map are stored with their original message type as the item type.
 * presence.signal is never stored at all.
 */
const VAULT_TYPE_MAP: Record<string, string> = {
  'social.update':         'relationship_note',
  'trust.vouch.response':  'trust_attestation',
};

/** Types that are never stored (ephemeral). */
const EPHEMERAL_TYPES = new Set(['presence.signal']);

/** Types that cannot be blocked by sharing policy (always delivered). */
const ALWAYS_PASS_TYPES = new Set(['safety.alert']);

/**
 * Message type → scenario mapping for scenario-policy gating.
 * Used by egress/ingress gates to look up which scenario tier applies.
 *
 * Source: Go domain/message.go MsgTypeToScenario()
 */
const TYPE_TO_SCENARIO: Record<string, string> = {
  'presence.signal':        'presence',
  'coordination.request':   'coordination',
  'coordination.response':  'coordination',
  'social.update':          'social',
  'safety.alert':           'safety',
  'trust.vouch.request':    'trust',
  'trust.vouch.response':   'trust',
};

/** Maximum D2D message body size in bytes (256 KB). */
export const MAX_MESSAGE_BODY_SIZE = 256 * 1024;

/**
 * Check if a message type string is a valid V1 family.
 */
export function isValidV1Type(messageType: string): boolean {
  return V1_TYPES.has(messageType);
}

/**
 * Map a D2D message type to a vault item type for storage.
 * Returns null for types that should not be stored (e.g., presence.signal).
 */
export function mapToVaultItemType(messageType: string): string | null {
  if (EPHEMERAL_TYPES.has(messageType)) {
    return null;
  }
  return VAULT_TYPE_MAP[messageType] ?? messageType;
}

/**
 * Check if a message type should be stored in the vault.
 * presence.signal is the only type that should NOT be stored.
 */
export function shouldStore(messageType: string): boolean {
  return !EPHEMERAL_TYPES.has(messageType);
}

/**
 * Check if a message type always passes (cannot be blocked by policy).
 * Only safety.alert has this property.
 */
export function alwaysPasses(messageType: string): boolean {
  return ALWAYS_PASS_TYPES.has(messageType);
}

/**
 * Map a D2D message type to its scenario name for policy gating.
 * Returns empty string for unknown types (caller should reject).
 *
 * Source: Go domain/message.go MsgTypeToScenario()
 */
export function msgTypeToScenario(messageType: string): string {
  return TYPE_TO_SCENARIO[messageType] ?? '';
}

/**
 * Validate a D2D message body size.
 * Returns null if valid, or an error message if too large.
 */
export function validateMessageBody(body: string | Uint8Array): string | null {
  const size = typeof body === 'string'
    ? new TextEncoder().encode(body).byteLength
    : body.byteLength;
  if (size > MAX_MESSAGE_BODY_SIZE) {
    return `message body exceeds maximum size of ${MAX_MESSAGE_BODY_SIZE} bytes (got ${size})`;
  }
  return null;
}
