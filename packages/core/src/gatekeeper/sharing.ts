/**
 * Sharing tier enforcement — per-contact data category access control.
 *
 * Each contact has sharing tiers per data category:
 *   none    → no data shared
 *   summary → L0/L1 summaries only (body stripped)
 *   full    → full content including body
 *   locked  → never shared (passphrase-protected persona)
 *
 * Default-deny: unknown contacts and unknown categories get 'none'.
 *
 * Source: core/internal/adapter/gatekeeper/sharing.go
 */

export type SharingTier = 'none' | 'summary' | 'full' | 'locked';

export interface SharingDecision {
  allowed: boolean;
  tier: SharingTier;
  filteredCategories: string[];
  reason?: string;
}

// ---------------------------------------------------------------
// In-memory policy store (populated by setSharingPolicy for testing,
// backed by contacts DB in production)
// ---------------------------------------------------------------

/** Per-contact, per-category sharing tiers. */
const policies = new Map<string, Map<string, SharingTier>>();

/** Set sharing policy for a contact + category. */
export function setSharingPolicy(contactDID: string, category: string, tier: SharingTier): void {
  let contactPolicy = policies.get(contactDID);
  if (!contactPolicy) {
    contactPolicy = new Map();
    policies.set(contactDID, contactPolicy);
  }
  contactPolicy.set(category, tier);
}

/** Clear all policies (for testing). */
export function clearSharingPolicies(): void {
  policies.clear();
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Check if data categories are shareable with a contact.
 * If ANY category is restricted (none/locked), the entire send is denied.
 */
export function checkSharingPolicy(
  contactDID: string,
  categories: string[],
): SharingDecision {
  if (categories.length === 0) {
    return { allowed: true, tier: 'full', filteredCategories: [] };
  }

  const filtered: string[] = [];
  let lowestTier: SharingTier = 'full';

  for (const cat of categories) {
    const tier = getSharingTier(contactDID, cat);
    if (tier === 'none' || tier === 'locked') {
      filtered.push(cat);
      lowestTier = 'none';
    } else if (tier === 'summary' && lowestTier === 'full') {
      lowestTier = 'summary';
    }
  }

  if (filtered.length > 0) {
    return {
      allowed: false,
      tier: 'none',
      filteredCategories: filtered,
      reason: `Categories restricted: ${filtered.join(', ')}`,
    };
  }

  return { allowed: true, tier: lowestTier, filteredCategories: [] };
}

/**
 * Get the sharing tier for a specific contact + category.
 * Returns 'none' if no policy exists (default-deny).
 */
export function getSharingTier(contactDID: string, category: string): SharingTier {
  const contactPolicy = policies.get(contactDID);
  if (!contactPolicy) return 'none';
  return contactPolicy.get(category) ?? 'none';
}

/**
 * Filter egress data based on sharing tier.
 * - 'none' / 'locked' → remove entirely (returns null)
 * - 'summary' → keep L0/L1 summaries, remove body
 * - 'full' → keep everything
 */
export function filterByTier(
  data: Record<string, unknown>,
  tier: SharingTier,
): Record<string, unknown> | null {
  if (tier === 'none' || tier === 'locked') return null;

  if (tier === 'summary') {
    const { body, ...rest } = data;
    return rest;
  }

  // 'full' — keep everything
  return { ...data };
}
