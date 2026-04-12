/**
 * L0 deterministic summary generation — fallback when LLM is unavailable.
 *
 * Pattern: "{type} from {sender} on {date}"
 * When a summary is already provided, it's used as-is (one-line).
 *
 * Trust caveats appended for low-trust or marketing content:
 *   - unknown: " (unverified sender)"
 *   - marketing: " (promotional)"
 *
 * Source: brain/tests/test_enrichment.py, brain/src/enrichment.py
 */

export interface L0Input {
  type: string;
  source: string;
  sender: string;
  timestamp: number;
  summary?: string;
  sender_trust?: string;
}

/** Trust levels that do NOT require a caveat. */
const TRUSTED_LEVELS = new Set(['self', 'contact_ring1', 'contact_ring2', 'verified']);

/** Trust caveats to append. */
const TRUST_CAVEATS: Record<string, string> = {
  unknown: ' (unverified sender)',
  marketing: ' (promotional)',
  spam: ' (likely spam)',
};

/**
 * Generate a deterministic L0 (one-line headline) from item metadata.
 *
 * If a summary is already provided, uses it directly.
 * Otherwise constructs: "{Type} from {sender} on {date}"
 *
 * Appends trust caveat if sender_trust is low.
 */
export function generateL0(input: L0Input): string {
  if (!input.type && !input.sender && !input.summary) {
    return '';
  }

  let l0: string;

  if (input.summary) {
    // Use provided summary as L0
    l0 = input.summary;
  } else {
    // Construct from metadata
    const typeName = capitalizeFirst(input.type || 'item');
    const sender = input.sender || 'unknown sender';
    const date = input.timestamp > 0 ? formatTimestamp(input.timestamp) : 'unknown date';
    l0 = `${typeName} from ${sender} on ${date}`;
  }

  // Add trust caveat if applicable
  if (input.sender_trust) {
    l0 = addTrustCaveat(l0, input.sender_trust);
  }

  return l0;
}

/**
 * Add trust caveat to L0 if sender_trust is low or marketing.
 * Trusted senders (self, contact_ring1, contact_ring2, verified) get no caveat.
 */
export function addTrustCaveat(l0: string, senderTrust: string): string {
  if (TRUSTED_LEVELS.has(senderTrust)) {
    return l0;
  }

  const caveat = TRUST_CAVEATS[senderTrust];
  if (caveat) {
    return l0 + caveat;
  }

  // Unrecognized trust level → generic caveat
  return l0 + ' (unverified sender)';
}

/**
 * Format a Unix timestamp as a human-readable date string.
 * Output: "YYYY-MM-DD" (short, suitable for L0 one-liners).
 */
export function formatTimestamp(timestamp: number): string {
  if (timestamp <= 0) return 'unknown date';

  const date = new Date(timestamp * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Capitalize the first letter of a string. */
function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
