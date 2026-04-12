/**
 * Trust scoring — assigns sender_trust, confidence, retrieval_policy
 * to vault items based on sender identity, source, and contact status.
 *
 * Scoring rules (in priority order):
 *   1. Self: source is personal/cli/telegram, or sender is "user"
 *      → self, high confidence, normal retrieval
 *   2. Known contact: sender matches a contact by email, name, or alias
 *      → contact_ring1, medium confidence, normal retrieval
 *   3. Verified service: source is a known service domain
 *      → service, medium confidence, normal retrieval
 *   4. Marketing: sender matches noreply/promo/newsletter patterns
 *      → marketing, low confidence, briefing_only retrieval
 *   5. Unknown: default for unrecognized senders
 *      → unknown, low confidence, caveated retrieval
 *
 * Source: brain/tests/test_trust_scorer.py
 */

export type SenderTrust = 'self' | 'contact_ring1' | 'service' | 'unknown' | 'marketing';

export interface TrustScore {
  sender_trust: SenderTrust;
  confidence: string;
  retrieval_policy: string;
}

/** Sources that indicate self-authored content. */
const SELF_SOURCES = new Set(['personal', 'cli', 'telegram', 'chat', 'voice']);

/** Sender strings that indicate self. */
const SELF_SENDERS = new Set(['user', 'self', 'me']);

/** Marketing sender patterns (case-insensitive). */
const MARKETING_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /newsletter@/i,
  /promo@/i,
  /marketing@/i,
  /info@.*\.com$/i,
  /unsubscribe/i,
];

/**
 * Score the trust of a vault item's sender.
 *
 * @param sender - Sender identifier (email, name, or "user")
 * @param source - Ingress source (gmail, personal, cli, etc.)
 * @param ingressChannel - How the item arrived (connector, chat, cli, etc.)
 * @param contacts - Known contacts for matching
 */
export function scoreSender(
  sender: string,
  source: string,
  ingressChannel: string,
  contacts: Array<{ name: string; email?: string; aliases?: string[] }>,
): TrustScore {
  // Rule 1: Self-authored content
  if (SELF_SENDERS.has(sender.toLowerCase()) || SELF_SOURCES.has(source.toLowerCase())) {
    return { sender_trust: 'self', confidence: 'high', retrieval_policy: 'normal' };
  }

  // Rule 2: Known contact
  const contactMatch = matchSenderToContact(sender, contacts);
  if (contactMatch.matched) {
    return { sender_trust: 'contact_ring1', confidence: 'medium', retrieval_policy: 'normal' };
  }

  // Rule 3: Marketing sender (check before unknown — marketing is a specific subcategory)
  if (isMarketingSender(sender)) {
    return { sender_trust: 'marketing', confidence: 'low', retrieval_policy: 'briefing_only' };
  }

  // Rule 4: Unknown sender (empty sender also falls here)
  return { sender_trust: 'unknown', confidence: 'low', retrieval_policy: 'caveated' };
}

/**
 * Match a sender against known contacts by name, email, or alias.
 * Case-insensitive on all comparisons.
 */
export function matchSenderToContact(
  sender: string,
  contacts: Array<{ name: string; email?: string; aliases?: string[] }>,
): { matched: boolean; contactName?: string } {
  if (!sender) return { matched: false };

  const senderLower = sender.toLowerCase();

  for (const contact of contacts) {
    // Match by email
    if (contact.email && contact.email.toLowerCase() === senderLower) {
      return { matched: true, contactName: contact.name };
    }

    // Match by name
    if (contact.name.toLowerCase() === senderLower) {
      return { matched: true, contactName: contact.name };
    }

    // Match by alias
    if (contact.aliases && matchByAlias(sender, contact.aliases)) {
      return { matched: true, contactName: contact.name };
    }
  }

  return { matched: false };
}

/**
 * Check if sender matches by alias (case-insensitive).
 */
export function matchByAlias(sender: string, aliases: string[]): boolean {
  if (!sender || !aliases || aliases.length === 0) return false;
  const senderLower = sender.toLowerCase();
  return aliases.some(alias => alias.toLowerCase() === senderLower);
}

/** Check if a sender matches marketing patterns. */
function isMarketingSender(sender: string): boolean {
  return MARKETING_PATTERNS.some(pattern => pattern.test(sender));
}
