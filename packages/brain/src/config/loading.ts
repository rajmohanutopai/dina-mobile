/**
 * Brain configuration loading — environment variables and defaults.
 *
 * Source: brain/tests/test_config.py
 */

import { DEFAULT_CORE_URL, BRAIN_DEFAULT_PORT } from '../../../core/src/constants';

export interface BrainConfig {
  coreURL: string;
  listenPort: number;
  serviceKeyDir: string;
  logLevel: string;
  llmURL?: string;
}

const DEFAULTS: BrainConfig = {
  coreURL: DEFAULT_CORE_URL,
  listenPort: BRAIN_DEFAULT_PORT,
  serviceKeyDir: './service_keys',
  logLevel: 'info',
};

/** Load brain config from environment variables. */
export function loadBrainConfig(env?: Record<string, string | undefined>): BrainConfig {
  const e = env ?? {};
  return {
    coreURL: e.DINA_CORE_URL ?? DEFAULTS.coreURL,
    listenPort: parseIntOrDefault(e.DINA_BRAIN_PORT, DEFAULTS.listenPort),
    serviceKeyDir: e.DINA_SERVICE_KEY_DIR ?? DEFAULTS.serviceKeyDir,
    logLevel: e.DINA_LOG_LEVEL ?? DEFAULTS.logLevel,
    llmURL: e.DINA_LLM_URL,
  };
}

/** Validate brain config. Returns array of errors (empty = valid). */
export function validateBrainConfig(config: BrainConfig): string[] {
  const errors: string[] = [];
  if (!config.coreURL) errors.push('coreURL is required');
  else if (!/^https?:\/\/.+/.test(config.coreURL)) errors.push(`coreURL is not a valid URL: "${config.coreURL}"`);
  if (!config.serviceKeyDir) errors.push('serviceKeyDir is required');
  if (config.listenPort <= 0 || config.listenPort > 65535) errors.push(`listenPort must be 1-65535, got ${config.listenPort}`);
  if (config.llmURL && !/^https?:\/\/.+/.test(config.llmURL)) errors.push(`llmURL is not a valid URL: "${config.llmURL}"`);
  return errors;
}

function parseIntOrDefault(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
