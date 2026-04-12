/**
 * LLM router — decision tree for provider selection.
 *
 * Routing logic:
 *   1. FTS-only task → skip LLM entirely (provider: 'none')
 *   2. Local LLM available → use local (no PII scrubbing needed)
 *   3. Lightweight task → prefer lite/local model
 *   4. Sensitive persona + cloud → mandatory PII scrub
 *   5. Fallback chain: local → first cloud provider → FTS-only
 *   6. No providers available → graceful degradation to FTS
 *
 * Source: brain/tests/test_llm.py
 */

export type TaskType = 'classify' | 'summarize' | 'reason' | 'embed' | 'keyword_search' | 'fts_lookup';
export type ProviderName = 'claude' | 'openai' | 'gemini' | 'openrouter' | 'local' | 'none';

export interface RoutingDecision {
  provider: ProviderName;
  model?: string;
  requiresScrubbing: boolean;
  reason: string;
}

export interface RouterConfig {
  localAvailable: boolean;
  cloudProviders: ProviderName[];
  sensitivePersonas: string[];
}

/** Default config when none provided. */
const DEFAULT_CONFIG: RouterConfig = {
  localAvailable: false,
  cloudProviders: [],
  sensitivePersonas: ['health', 'financial'],
};

/** Task types that need no LLM — pure full-text search. */
const FTS_ONLY_TASKS = new Set<TaskType>(['keyword_search', 'fts_lookup']);

/** Task types that are lightweight (small model sufficient). */
const LIGHTWEIGHT_TASKS = new Set<TaskType>(['classify', 'summarize']);

/**
 * Route a task to the optimal LLM provider.
 *
 * @param taskType - What kind of work needs doing
 * @param persona - Which persona's data is involved (affects scrub requirements)
 * @param config - Available providers and sensitivity configuration
 */
export function routeTask(
  taskType: TaskType,
  persona?: string,
  config?: RouterConfig,
): RoutingDecision {
  const cfg = config ?? DEFAULT_CONFIG;

  // 1. FTS-only tasks skip LLM entirely
  if (isFTSOnly(taskType)) {
    return {
      provider: 'none',
      requiresScrubbing: false,
      reason: `Task "${taskType}" is FTS-only — no LLM needed`,
    };
  }

  // 2. If local LLM is available, prefer it (no scrubbing ever needed)
  if (cfg.localAvailable) {
    return {
      provider: 'local',
      requiresScrubbing: false,
      reason: 'Local LLM available — no PII leaves device',
    };
  }

  // 3. No local — try cloud providers
  if (cfg.cloudProviders.length > 0) {
    const provider = cfg.cloudProviders[0];
    const needsScrub = requiresScrubbing(persona ?? '', provider, cfg.sensitivePersonas);

    return {
      provider,
      requiresScrubbing: needsScrub,
      reason: needsScrub
        ? `Cloud "${provider}" with mandatory PII scrubbing (sensitive persona "${persona}")`
        : `Cloud "${provider}" selected`,
    };
  }

  // 4. No providers at all — graceful degradation to FTS
  return {
    provider: 'none',
    requiresScrubbing: false,
    reason: 'No LLM providers available — falling back to FTS-only',
  };
}

/** Check if a task type can skip LLM entirely (FTS-only). */
export function isFTSOnly(taskType: TaskType): boolean {
  return FTS_ONLY_TASKS.has(taskType);
}

/** Check if a task is lightweight (classify, summarize — small model sufficient). */
export function isLightweightTask(taskType: TaskType): boolean {
  return LIGHTWEIGHT_TASKS.has(taskType);
}

/**
 * Check if PII scrubbing is required for a persona+provider combination.
 *
 * Rules:
 * - Local provider → never scrub (data stays on device)
 * - 'none' provider → never scrub (no LLM call)
 * - Sensitive persona + cloud provider → must scrub
 * - Non-sensitive persona + cloud → no scrubbing needed
 */
export function requiresScrubbing(
  persona: string,
  provider: ProviderName | string,
  sensitivePersonas?: string[],
): boolean {
  if (provider === 'local' || provider === 'none') {
    return false;
  }
  if (!persona) {
    return false;
  }
  const sensitive = sensitivePersonas ?? ['health', 'financial'];
  return sensitive.includes(persona);
}
