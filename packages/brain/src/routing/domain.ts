/**
 * Domain classifier — keyword-based persona routing.
 *
 * Routes incoming items to personas based on keyword matching.
 * Used as the first pass before LLM-based persona selection (task 3.11).
 *
 * Priority: strongest keyword match wins. If ambiguous or no match → "general".
 * Brain never invents persona names — only routes to known personas.
 *
 * Source: brain/tests/test_routing.py, brain/src/routing/domain.py
 */

import { resolveAlias } from '../persona/registry';

export interface ClassificationInput {
  type?: string;
  source?: string;
  sender?: string;
  subject?: string;
  body?: string;
}

export interface ClassificationResult {
  persona: string;
  confidence: number;
  matchedKeywords: string[];
  method: 'keyword' | 'fallback';
}

// ---------------------------------------------------------------
// Keyword tables per domain
// ---------------------------------------------------------------

const HEALTH_KEYWORDS = [
  'lab result', 'diagnosis', 'prescription', 'medical', 'doctor',
  'hospital', 'clinic', 'pharmacy', 'health', 'patient',
  'blood test', 'x-ray', 'mri', 'ct scan', 'vaccine',
  'appointment', 'symptom', 'treatment', 'therapy', 'surgery',
  'insurance claim', 'copay', 'deductible',
];

const FINANCIAL_KEYWORDS = [
  'invoice', 'payment', 'bank', 'transaction', 'credit card',
  'debit', 'wire transfer', 'tax', 'salary', 'payroll',
  'investment', 'portfolio', 'dividend', 'stock', 'mutual fund',
  'loan', 'mortgage', 'interest rate', 'account balance', 'statement',
  'receipt', 'expense', 'budget', 'refund', 'overdue',
];

const PROFESSIONAL_KEYWORDS = [
  'meeting', 'deadline', 'project', 'standup', 'sprint',
  'quarterly', 'annual report', 'presentation', 'proposal',
  'contract', 'client', 'colleague', 'manager', 'team',
  'onboarding', 'interview', 'resume', 'performance review',
  'conference', 'workshop', 'training',
];

const SOCIAL_KEYWORDS = [
  'birthday', 'party', 'dinner', 'hangout', 'catch up',
  'reunion', 'wedding', 'baby shower', 'graduation',
  'holiday', 'vacation', 'trip', 'festival',
];

const CONSUMER_KEYWORDS = [
  'order', 'shipment', 'delivery', 'tracking', 'amazon',
  'purchase', 'return', 'warranty', 'subscription',
  'discount', 'coupon', 'sale', 'deal',
];

interface DomainDef {
  persona: string;
  keywords: string[];
}

const DOMAINS: DomainDef[] = [
  { persona: 'health',       keywords: HEALTH_KEYWORDS },
  { persona: 'financial',    keywords: FINANCIAL_KEYWORDS },
  { persona: 'professional', keywords: PROFESSIONAL_KEYWORDS },
  { persona: 'social',       keywords: SOCIAL_KEYWORDS },
  { persona: 'consumer',     keywords: CONSUMER_KEYWORDS },
];

// ---------------------------------------------------------------
// Source-based hints (higher confidence than keyword alone)
// ---------------------------------------------------------------

const SOURCE_HINTS: Record<string, string> = {
  'health_system': 'health',
  'hospital':      'health',
  'clinic':        'health',
  'pharmacy':      'health',
  'bank':          'financial',
  'payroll':       'financial',
  'tax':           'financial',
  'hr':            'professional',
  'jira':          'professional',
  'slack':         'professional',
};

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Classify an item into a persona domain using keyword matching.
 *
 * @param input - Item metadata (type, source, sender, subject, body)
 * @returns Classification with persona name, confidence, matched keywords
 */
export function classifyDomain(input: ClassificationInput): ClassificationResult {
  const text = buildSearchText(input);
  const source = (input.source || '').toLowerCase();

  // Source-based hint (high confidence)
  const sourceHint = SOURCE_HINTS[source];
  if (sourceHint) {
    return {
      persona: sourceHint,
      confidence: 0.90,
      matchedKeywords: [`source:${source}`],
      method: 'keyword',
    };
  }

  // Keyword matching across all domains
  let bestPersona = 'general';
  let bestScore = 0;
  let bestKeywords: string[] = [];

  for (const domain of DOMAINS) {
    const matched = matchKeywords(text, domain.keywords);
    if (matched.length > bestScore) {
      bestScore = matched.length;
      bestPersona = domain.persona;
      bestKeywords = matched;
    }
  }

  if (bestScore > 0) {
    // Confidence scales with number of keyword matches (capped at 0.85)
    const confidence = Math.min(0.85, 0.50 + bestScore * 0.10);
    return {
      persona: bestPersona,
      confidence,
      matchedKeywords: bestKeywords,
      method: 'keyword',
    };
  }

  // No match → default to general
  return {
    persona: 'general',
    confidence: 0.30,
    matchedKeywords: [],
    method: 'fallback',
  };
}

/**
 * Classify and resolve through alias table.
 * Returns canonical persona name via resolveAlias, or "general" if unknown.
 */
export function classifyAndResolve(input: ClassificationInput): ClassificationResult {
  const result = classifyDomain(input);
  const resolved = resolveAlias(result.persona);
  if (resolved) {
    result.persona = resolved;
  } else {
    result.persona = 'general';
    result.confidence = 0.30;
  }
  return result;
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

/** Build a single lowercase search string from all input fields. */
function buildSearchText(input: ClassificationInput): string {
  return [
    input.type || '',
    input.source || '',
    input.sender || '',
    input.subject || '',
    input.body || '',
  ].join(' ').toLowerCase();
}

/** Find which keywords from the list appear in the text. */
function matchKeywords(text: string, keywords: string[]): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (text.includes(kw)) {
      matched.push(kw);
    }
  }
  return matched;
}
