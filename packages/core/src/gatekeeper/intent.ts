/**
 * Gatekeeper intent evaluation — maps actions to risk levels.
 *
 * Risk levels:
 *   SAFE      → auto-approve (search, list, query, remember, store)
 *   MODERATE  → require user approval (send >3, delete >3, modify settings)
 *   HIGH      → require user approval with clear explanation (financial, bulk ops)
 *   BLOCKED   → deny always (credential export, key access)
 *
 * Brain-denied actions — hardcoded, not configurable:
 *   did_sign, did_rotate, vault_backup, persona_unlock, seed_export
 *   These can NEVER be performed by automated reasoning (Brain/agents).
 *
 * Source: core/internal/adapter/gatekeeper/gatekeeper.go
 */

export type RiskLevel = 'SAFE' | 'MODERATE' | 'HIGH' | 'BLOCKED';

export interface IntentDecision {
  allowed: boolean;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  reason: string;
}

// ---------------------------------------------------------------
// Policy table — matches server gatekeeper.go exactly
// ---------------------------------------------------------------

const DEFAULT_POLICY: Record<string, RiskLevel> = {
  search:            'SAFE',
  list:              'SAFE',
  query:             'SAFE',
  remember:          'SAFE',
  store:             'SAFE',
  send_small:        'SAFE',
  delete_small:      'SAFE',
  send_large:        'MODERATE',
  delete_large:      'MODERATE',
  modify_settings:   'MODERATE',
  purchase:          'HIGH',
  payment:           'HIGH',
  bulk_operation:    'HIGH',
  credential_export: 'BLOCKED',
  key_access:        'BLOCKED',
};

/** Actions that Brain/agents can NEVER perform — user-only via UI. */
const BRAIN_DENIED = new Set([
  'did_sign',
  'did_rotate',
  'vault_backup',
  'persona_unlock',
  'seed_export',
]);

const RISK_REASONS: Record<RiskLevel, string> = {
  SAFE:     'Action is safe — auto-approved',
  MODERATE: 'Action requires user approval',
  HIGH:     'High-risk action — requires explicit user approval with explanation',
  BLOCKED:  'Action is blocked by security policy',
};

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Evaluate an action's risk level based on the default policy table.
 *
 * @param action - The action being attempted (e.g., "search", "purchase")
 * @param agentDID - The agent requesting the action (optional)
 * @param trustLevel - The agent's trust level (optional: "verified", "unknown")
 */
export function evaluateIntent(
  action: string,
  agentDID?: string,
  trustLevel?: string,
): IntentDecision {
  // Brain-denied check first — these are always BLOCKED for automated callers
  if (isBrainDenied(action)) {
    return {
      allowed: false,
      riskLevel: 'BLOCKED',
      requiresApproval: false,
      reason: `Action "${action}" is brain-denied — requires direct user interaction`,
    };
  }

  let riskLevel = getDefaultRiskLevel(action) ?? 'MODERATE';

  // Trust-based adjustment: any non-trusted agent escalates SAFE → MODERATE
  // Trusted levels: 'verified', 'self', undefined/empty (user-initiated)
  const TRUSTED_LEVELS = ['verified', 'self', '', undefined];
  if (trustLevel !== undefined && !TRUSTED_LEVELS.includes(trustLevel) && riskLevel === 'SAFE') {
    riskLevel = 'MODERATE';
  }

  const allowed = riskLevel !== 'BLOCKED';
  const requiresApproval = riskLevel === 'MODERATE' || riskLevel === 'HIGH';

  return {
    allowed,
    riskLevel,
    requiresApproval,
    reason: RISK_REASONS[riskLevel],
  };
}

/**
 * Check if an action is brain-denied (hardcoded deny, not configurable).
 *
 * Brain-denied actions can NEVER be performed by automated reasoning:
 * did_sign, did_rotate, vault_backup, persona_unlock, seed_export
 */
export function isBrainDenied(action: string): boolean {
  return BRAIN_DENIED.has(action);
}

/**
 * Get the risk level for an action from the default policy table.
 * Returns undefined for unknown actions (treated as MODERATE by evaluateIntent).
 */
export function getDefaultRiskLevel(action: string): RiskLevel | undefined {
  return DEFAULT_POLICY[action];
}
