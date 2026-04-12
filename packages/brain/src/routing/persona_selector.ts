/**
 * Persona selector — LLM-assisted persona routing for uncertain classifications.
 *
 * When the keyword-based domain classifier returns low confidence (< threshold),
 * the persona selector uses an LLM to determine the correct persona.
 *
 * Key invariant: Brain NEVER invents persona names. The LLM can only select
 * from the list of existing personas. Any unknown name is rejected and
 * falls back to "general".
 *
 * Source: ARCHITECTURE.md Task 3.11
 */

import { classifyDomain, type ClassificationInput, type ClassificationResult } from './domain';
import { personaExists, listPersonas } from '../../../core/src/persona/service';
import { resolveAlias } from '../persona/registry';

/** Confidence threshold — below this, LLM is consulted. */
const LLM_THRESHOLD = 0.6;

/** Injectable LLM persona selection provider. */
export type PersonaSelectorProvider = (
  input: ClassificationInput,
  availablePersonas: string[],
) => Promise<{ persona: string; confidence: number; reason: string }>;

let selectorProvider: PersonaSelectorProvider | null = null;

/** Register an LLM persona selection provider. */
export function registerPersonaSelector(provider: PersonaSelectorProvider): void {
  selectorProvider = provider;
}

/** Reset the provider (for testing). */
export function resetPersonaSelector(): void {
  selectorProvider = null;
}

/** Set the confidence threshold for LLM consultation. */
let threshold = LLM_THRESHOLD;

export function setLLMThreshold(value: number): void {
  threshold = Math.max(0, Math.min(1, value));
}

export function getLLMThreshold(): number {
  return threshold;
}

/** Reset threshold to default (for testing). */
export function resetThreshold(): void {
  threshold = LLM_THRESHOLD;
}

/**
 * Select the best persona for an item.
 *
 * Pipeline:
 * 1. Run keyword-based domain classifier
 * 2. If confidence >= threshold → use keyword result
 * 3. If confidence < threshold AND LLM provider available → consult LLM
 * 4. Validate LLM's answer against existing personas
 * 5. Fall back to "general" if LLM suggests unknown persona
 */
export async function selectPersona(
  input: ClassificationInput,
): Promise<ClassificationResult> {
  // 1. Keyword-based classification
  const keywordResult = classifyDomain(input);

  // 2. High confidence → use directly
  if (keywordResult.confidence >= threshold) {
    return keywordResult;
  }

  // 3. Low confidence + no LLM → use keyword result as-is
  if (!selectorProvider) {
    return keywordResult;
  }

  // 4. Consult LLM
  const availablePersonas = listPersonas().map(p => p.name);
  if (availablePersonas.length === 0) {
    return keywordResult; // no personas registered
  }

  try {
    const llmResult = await selectorProvider(input, availablePersonas);

    // 5. Validate: Brain never invents persona names
    const resolved = validatePersonaName(llmResult.persona);
    if (!resolved) {
      // LLM suggested unknown persona → fall back to general
      return {
        persona: 'general',
        confidence: keywordResult.confidence,
        matchedKeywords: keywordResult.matchedKeywords,
        method: 'fallback',
      };
    }

    return {
      persona: resolved,
      confidence: llmResult.confidence,
      matchedKeywords: [],
      method: 'keyword', // reported as keyword since we don't have 'llm' in the type
    };
  } catch {
    // LLM failure → use keyword result
    return keywordResult;
  }
}

/**
 * Validate a persona name against existing personas.
 *
 * Checks: exact name match, alias resolution.
 * Returns the canonical persona name, or null if not found.
 */
export function validatePersonaName(name: string): string | null {
  if (!name || name.trim().length === 0) return null;

  const normalized = name.trim().toLowerCase();

  // Direct persona match
  if (personaExists(normalized)) {
    return normalized;
  }

  // Try alias resolution
  const resolved = resolveAlias(normalized);
  if (resolved && personaExists(resolved)) {
    return resolved;
  }

  return null;
}
