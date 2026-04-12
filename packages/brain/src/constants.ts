/**
 * Brain-side constants — single source of truth for Brain-specific values.
 *
 * Core constants are imported from @dina/core where needed.
 * This file covers: LLM thresholds, provider defaults, guardian settings.
 */

// ---------------------------------------------------------------
// LLM routing thresholds
// ---------------------------------------------------------------

export const PERSONA_SELECTOR_THRESHOLD = 0.6;
export const TRIAGE_CONFIDENCE_THRESHOLD = 0.7;
export const LLM_REFINEMENT_THRESHOLD = 0.75;
export const DEFAULT_CONFIDENCE = 0.5;

// ---------------------------------------------------------------
// LLM provider defaults
// ---------------------------------------------------------------

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_OPENROUTER_MODEL = 'auto';
export const DEFAULT_LOCAL_MODEL = 'llama-3n';
export const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';
export const DEFAULT_MAX_TOKENS = 4096;

// ---------------------------------------------------------------
// Vault context / reasoning
// ---------------------------------------------------------------

export const MAX_REASONING_TURNS = 6;
export const TOKEN_BUDGET = 8000;
export const TOKEN_PER_CHAR = 0.25;
export const TIERED_LOADING_L0_ALL = true;
export const TIERED_LOADING_L1_TOP = 5;
export const TIERED_LOADING_L2_TOP = 1;

// ---------------------------------------------------------------
// Guardian / silence
// ---------------------------------------------------------------

export const GUARDIAN_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
export const ESCALATION_THRESHOLD = 3;
export const BATCH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------

export const DEFAULT_BRIEFING_HOUR = 8;
export const REMINDER_LOOKAHEAD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_APP_NAME = 'Dina';
export const OPENROUTER_APP_URL = 'https://dinakernel.com';
