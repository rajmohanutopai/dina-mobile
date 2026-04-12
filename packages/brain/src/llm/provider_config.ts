/**
 * LLM provider configuration manager — store and manage API keys.
 *
 * Providers: claude, openai, gemini, openrouter, local.
 * Each provider has: API key, model preference, availability status.
 *
 * Features:
 *   - Store/update API keys per provider
 *   - Validate key format (basic format check, not network validation)
 *   - Check availability (key present + not revoked)
 *   - List all configured providers with status
 *   - Hot-reload: update key without restart
 *
 * Source: ARCHITECTURE.md Tasks 4.4, 4.16
 */

export type ProviderName = 'claude' | 'openai' | 'gemini' | 'openrouter' | 'local';

export interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  model: string;
  enabled: boolean;
  configuredAt: number;
}

export interface ProviderStatus {
  name: ProviderName;
  available: boolean;
  model: string;
  reason: string;
}

import {
  DEFAULT_CLAUDE_MODEL, DEFAULT_OPENAI_MODEL, DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENROUTER_MODEL, DEFAULT_LOCAL_MODEL,
} from '../constants';

/** Provider defaults: model names for each provider. */
const DEFAULT_MODELS: Record<ProviderName, string> = {
  claude: DEFAULT_CLAUDE_MODEL,
  openai: DEFAULT_OPENAI_MODEL,
  gemini: DEFAULT_GEMINI_MODEL,
  openrouter: DEFAULT_OPENROUTER_MODEL,
  local: DEFAULT_LOCAL_MODEL,
};

/** API key format patterns (basic validation). */
const KEY_PATTERNS: Record<string, RegExp> = {
  claude: /^sk-ant-/,
  openai: /^sk-/,
  gemini: /^AI/,
  openrouter: /^sk-or-/,
};

/** Configured providers. */
const providers = new Map<ProviderName, ProviderConfig>();

/**
 * Configure a provider with an API key.
 *
 * @param name — provider name
 * @param apiKey — the API key (empty string to clear)
 * @param model — optional model override
 */
export function configureProvider(name: ProviderName, apiKey: string, model?: string): void {
  if (name === 'local') {
    // Local doesn't need an API key
    providers.set(name, {
      name,
      apiKey: '',
      model: model ?? DEFAULT_MODELS.local,
      enabled: true,
      configuredAt: Date.now(),
    });
    return;
  }

  providers.set(name, {
    name,
    apiKey,
    model: model ?? DEFAULT_MODELS[name],
    enabled: apiKey.length > 0,
    configuredAt: Date.now(),
  });
}

/**
 * Remove a provider configuration.
 */
export function removeProvider(name: ProviderName): void {
  providers.delete(name);
}

/**
 * Get a provider's configuration. Returns null if not configured.
 */
export function getProviderConfig(name: ProviderName): ProviderConfig | null {
  return providers.get(name) ?? null;
}

/**
 * Validate an API key format (basic pattern check).
 *
 * This is NOT a network validation — it only checks the prefix format.
 * Returns null if valid, or an error message if invalid.
 */
export function validateKeyFormat(name: ProviderName, apiKey: string): string | null {
  if (name === 'local') return null; // no key needed

  if (!apiKey || apiKey.trim().length === 0) {
    return 'API key is required';
  }

  const pattern = KEY_PATTERNS[name];
  if (pattern && !pattern.test(apiKey)) {
    return `Invalid key format for ${name} — expected prefix: ${pattern.source}`;
  }

  if (apiKey.length < 10) {
    return 'API key is too short';
  }

  return null;
}

/**
 * Check if a provider is available (configured + enabled).
 */
export function isProviderAvailable(name: ProviderName): boolean {
  const config = providers.get(name);
  if (!config) return false;
  return config.enabled;
}

/**
 * Get the status of all providers (configured or not).
 */
export function getProviderStatuses(): ProviderStatus[] {
  const allNames: ProviderName[] = ['claude', 'openai', 'gemini', 'openrouter', 'local'];

  return allNames.map(name => {
    const config = providers.get(name);
    if (!config) {
      return { name, available: false, model: DEFAULT_MODELS[name], reason: 'Not configured' };
    }
    if (!config.enabled) {
      return { name, available: false, model: config.model, reason: 'Disabled (empty API key)' };
    }
    return { name, available: true, model: config.model, reason: 'Ready' };
  });
}

/**
 * Get the best available provider (preference: local → claude → openai → gemini → openrouter).
 */
export function getBestProvider(): ProviderName | null {
  const preference: ProviderName[] = ['local', 'claude', 'openai', 'gemini', 'openrouter'];
  for (const name of preference) {
    if (isProviderAvailable(name)) return name;
  }
  return null;
}

/**
 * Count configured providers.
 */
export function configuredCount(): number {
  return providers.size;
}

/** Reset all provider config (for testing). */
export function resetProviderConfig(): void {
  providers.clear();
}
