/**
 * Guard scan — post-processing safety for LLM responses.
 *
 * Scans Dina's LLM-generated responses for safety violations before
 * delivering to the user. Four violation categories:
 *
 *   1. Anti-Her: therapy-style, engagement hooks, intimacy simulation
 *   2. PII leakage: tokens like [EMAIL_1] not rehydrated, or raw PII in
 *      a context where it should have been scrubbed
 *   3. Hallucinated trust: made-up trust scores or relationship claims
 *   4. Unsolicited recommendations: pushing products/services/actions
 *      the user didn't ask for
 *
 * Source: brain/tests/test_guardian.py (guard scan section)
 */

import {
  detectResponseViolation,
  isTherapyStyle,
  isEngagementHook,
  isIntimacySimulation,
} from './anti_her';
import { detectPII } from '../../../core/src/pii/patterns';

// ---------------------------------------------------------------
// Violation types
// ---------------------------------------------------------------

export interface GuardViolation {
  category: 'anti_her' | 'pii_leakage' | 'hallucinated_trust' | 'unsolicited_recommendation';
  severity: 'warning' | 'block';
  detail: string;
  matchedText?: string;
}

export interface ScanResult {
  safe: boolean;
  violations: GuardViolation[];
}

// ---------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------

/** Unrehydrated PII token left in output. */
const PII_TOKEN_RE = /\[[A-Z_]+_\d+\]/g;

/** Hallucinated trust score pattern — LLM invents trust/safety/confidence numbers. */
const HALLUCINATED_TRUST_PATTERNS = [
  /\btrust\s+(score|level|rating)\s*[:=]?\s*\d/i,
  /\bsafety\s+(score|rating)\s*[:=]?\s*\d/i,
  /\breliability\s+(score|rating)\s*[:=]?\s*\d/i,
  /\b(?:this|the)\s+(?:sender|contact|source)\s+(?:is|has)\s+(?:a\s+)?(?:\d+%?|high|low|medium)\s+trust/i,
];

/** Unsolicited recommendation patterns — pushing products or actions. */
const UNSOLICITED_REC_PATTERNS = [
  /\bi\s+(?:would\s+)?recommend\s+(?:you\s+)?(?:buy|purchase|sign\s+up|subscribe|try|switch\s+to)/i,
  /\byou\s+should\s+(?:buy|purchase|sign\s+up|subscribe|switch\s+to|upgrade)/i,
  /\bhave\s+you\s+(?:considered|thought\s+about)\s+(?:buying|purchasing|signing\s+up|subscribing)/i,
  /\bcheck\s+out\s+(?:this|these)\s+(?:deal|offer|product|service)/i,
];

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Scan a response for all safety violations.
 *
 * @param response - The LLM-generated response text
 * @param context - Optional context: persona name, whether PII scrubbing was applied
 * @returns ScanResult with safe flag and list of violations
 */
export function scanResponse(
  response: string,
  context?: { persona?: string; piiScrubbed?: boolean },
): ScanResult {
  const violations: GuardViolation[] = [];

  // 1. Anti-Her violations
  const antiHer = detectResponseViolation(response);
  if (antiHer.violated) {
    for (const suite of antiHer.suites) {
      violations.push({
        category: 'anti_her',
        severity: 'block',
        detail: `Anti-Her violation: ${suite}`,
      });
    }
  }

  // 2. PII leakage — unrehydrated tokens left in output
  // Reset lastIndex for global regex safety
  PII_TOKEN_RE.lastIndex = 0;
  const tokenMatches = response.match(PII_TOKEN_RE);
  if (tokenMatches) {
    violations.push({
      category: 'pii_leakage',
      severity: 'block',
      detail: `Unrehydrated PII tokens found: ${tokenMatches.join(', ')}`,
      matchedText: tokenMatches.join(', '),
    });
  }

  // 2b. Raw PII in response when scrubbing was expected
  if (context?.piiScrubbed) {
    const rawPII = detectPII(response);
    if (rawPII.length > 0) {
      violations.push({
        category: 'pii_leakage',
        severity: 'warning',
        detail: `Raw PII detected in scrubbed context: ${rawPII.map(p => p.type).join(', ')}`,
      });
    }
  }

  // 3. Hallucinated trust scores
  for (const pattern of HALLUCINATED_TRUST_PATTERNS) {
    if (pattern.test(response)) {
      violations.push({
        category: 'hallucinated_trust',
        severity: 'warning',
        detail: 'LLM hallucinated a trust/safety/reliability score',
      });
      break; // One violation per category is enough
    }
  }

  // 4. Unsolicited recommendations
  for (const pattern of UNSOLICITED_REC_PATTERNS) {
    if (pattern.test(response)) {
      violations.push({
        category: 'unsolicited_recommendation',
        severity: 'warning',
        detail: 'Unsolicited product/service recommendation detected',
      });
      break;
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Strip Anti-Her violations from a response by removing flagged sentences.
 * Returns cleaned text. Used when blocking isn't appropriate (e.g., partial response).
 */
export function stripViolations(response: string): string {
  const sentences = response.split(/(?<=[.!?])\s+/);
  const cleaned = sentences.filter(sentence => {
    return !isTherapyStyle(sentence) &&
           !isEngagementHook(sentence) &&
           !isIntimacySimulation(sentence);
  });
  return cleaned.join(' ').trim();
}
