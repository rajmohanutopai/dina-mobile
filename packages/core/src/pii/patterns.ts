/**
 * Tier 1 PII detection — regex patterns ported from Go core.
 *
 * Detects: email, phone (US + Indian), credit card (Luhn), SSN,
 * Aadhaar (12-digit Indian ID), PAN (Indian tax ID), IFSC (bank branch),
 * UPI (payment address), IP address (octet 0-255 validation).
 *
 * Features:
 * - Overlap removal (prefer longer matches)
 * - Type-based numbering ([EMAIL_1], [EMAIL_2], [PHONE_1])
 * - Scrub (replace PII with tokens) and rehydrate (restore originals)
 *
 * Source: core/internal/adapter/pii/scrubber.go
 */

export interface PIIMatch {
  type: string;
  start: number;
  end: number;
  value: string;
}

export interface ScrubResult {
  scrubbed: string;
  entities: Array<PIIMatch & { token: string }>;
}

// ---------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------

interface PatternDef {
  type: string;
  regex: RegExp;
  validate?: (match: string) => boolean;
}

const PATTERNS: PatternDef[] = [
  // Email — standard RFC-ish pattern
  {
    type: 'EMAIL',
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  },
  // Credit card — 13-19 digits, optional separators. Luhn validated.
  {
    type: 'CREDIT_CARD',
    regex: /\b(\d[ \-]?){12,18}\d\b/g,
    validate: luhnCheck,
  },
  // SSN — US Social Security Number: NNN-NN-NNNN
  {
    type: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  // Aadhaar — 12 digits optionally separated by spaces: NNNN NNNN NNNN
  {
    type: 'AADHAAR',
    regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
    validate: (m: string) => {
      const digits = m.replace(/\s/g, '');
      // Aadhaar is exactly 12 digits, doesn't start with 0 or 1
      return digits.length === 12 && digits[0] !== '0' && digits[0] !== '1';
    },
  },
  // PAN — Indian tax ID: AAAAA0000A (5 letters, 4 digits, 1 letter)
  {
    type: 'PAN',
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  },
  // IFSC — Indian bank branch code: 4 letters, 0, 6 alphanumeric
  {
    type: 'IFSC',
    regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
  },
  // UPI — Indian payment address: name@handle
  {
    type: 'UPI',
    regex: /\b[a-zA-Z0-9._]+@[a-zA-Z]{2,}\b/g,
    // Distinguish from email: UPI handles don't have dots in the domain
    validate: (m: string) => {
      const domain = m.split('@')[1];
      return !domain.includes('.');
    },
  },
  // Phone — US format: optional +1, area code with optional parens/dots/dashes
  {
    type: 'PHONE',
    regex: /(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/g,
    validate: (m: string) => {
      const digits = m.replace(/\D/g, '');
      // 10 or 11 digits (with country code)
      return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
    },
  },
  // IP address — with octet validation (0-255)
  {
    type: 'IP',
    regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    validate: (m: string) => {
      return m.split('.').every(octet => {
        const n = parseInt(octet, 10);
        return n >= 0 && n <= 255;
      });
    },
  },
];

// ---------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------

/** Detect all PII matches in text. Returns raw match positions. */
export function detectPII(text: string): PIIMatch[] {
  if (!text) return [];

  const allMatches: PIIMatch[] = [];

  for (const pat of PATTERNS) {
    // Reset regex state for global patterns
    pat.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.regex.exec(text)) !== null) {
      const value = m[0];
      if (pat.validate && !pat.validate(value)) continue;
      allMatches.push({
        type: pat.type,
        start: m.index,
        end: m.index + value.length,
        value,
      });
    }
  }

  // Resolve overlaps: UPI regex overlaps with EMAIL. If a match is contained
  // within a longer match, drop the shorter one.
  return resolveOverlaps(allMatches);
}

/**
 * Scrub PII from text — replace each match with a typed token.
 * Tokens are numbered per type: [EMAIL_1], [EMAIL_2], [PHONE_1], etc.
 */
export function scrubPII(text: string): ScrubResult {
  if (!text) return { scrubbed: '', entities: [] };

  const matches = detectPII(text);
  if (matches.length === 0) {
    return { scrubbed: text, entities: [] };
  }

  // Sort by start position
  matches.sort((a, b) => a.start - b.start);

  // Assign tokens: per-type sequential numbering
  const typeCounts: Record<string, number> = {};
  const entities: Array<PIIMatch & { token: string }> = [];

  for (const match of matches) {
    const count = (typeCounts[match.type] || 0) + 1;
    typeCounts[match.type] = count;
    const token = `[${match.type}_${count}]`;
    entities.push({ ...match, token });
  }

  // Build scrubbed text by replacing matches back-to-front
  let scrubbed = text;
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    scrubbed = scrubbed.slice(0, e.start) + e.token + scrubbed.slice(e.end);
  }

  return { scrubbed, entities };
}

/**
 * Rehydrate scrubbed text — restore original PII values from tokens.
 */
export function rehydratePII(scrubbed: string, entities: Array<{ token: string; value: string }>): string {
  let result = scrubbed;
  for (const entity of entities) {
    result = result.replace(entity.token, entity.value);
  }
  return result;
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

/** Resolve overlapping matches: prefer longer spans, drop contained shorter ones. */
function resolveOverlaps(matches: PIIMatch[]): PIIMatch[] {
  if (matches.length <= 1) return matches;

  // Sort by start position, then by length descending (longer first)
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const result: PIIMatch[] = [];
  let lastEnd = -1;

  for (const m of matches) {
    if (m.start >= lastEnd) {
      // No overlap
      result.push(m);
      lastEnd = m.end;
    } else if (m.end > lastEnd) {
      // Partial overlap, this one extends further — replace previous
      // Actually this shouldn't happen with well-structured regexes,
      // but handle it by keeping the earlier one.
    }
    // else: fully contained in previous match — drop it
  }

  return result;
}

/** Luhn algorithm for credit card validation. */
function luhnCheck(value: string): boolean {
  const digits = value.replace(/[\s\-]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  if (!/^\d+$/.test(digits)) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
