/**
 * Configuration loading — environment variables and defaults.
 *
 * Validates required fields, applies defaults, and rejects invalid values.
 * Adapted from server config for mobile (no Docker-specific settings).
 *
 * Environment variables:
 *   DINA_CORE_URL        → listenAddr (default: ":8100")
 *   DINA_BRAIN_URL       → brainURL (default: "http://localhost:8200")
 *   DINA_VAULT_PATH      → vaultPath (default: "./data")
 *   DINA_SERVICE_KEY_DIR → serviceKeyDir (default: "./service_keys")
 *   DINA_SECURITY_MODE   → securityMode (default: "security")
 *   DINA_SESSION_TTL     → sessionTTL (default: 86400)
 *   DINA_RATE_LIMIT      → rateLimit (default: 50)
 *   DINA_SPOOL_MAX       → spoolMax (default: 500)
 *   DINA_MSGBOX_URL      → msgboxURL (optional)
 *
 * Source: core/test/config_test.go
 */

export interface CoreConfig {
  listenAddr: string;
  brainURL: string;
  vaultPath: string;
  serviceKeyDir: string;
  securityMode: 'security' | 'convenience';
  sessionTTL: number;
  rateLimit: number;
  spoolMax: number;
  msgboxURL?: string;
}

/** Default values for all config fields. */
const DEFAULTS: CoreConfig = {
  listenAddr: ':8100',
  brainURL: 'http://localhost:8200',
  vaultPath: './data',
  serviceKeyDir: './service_keys',
  securityMode: 'security',
  sessionTTL: 86400,
  rateLimit: 50,
  spoolMax: 500,
};

/**
 * Load configuration from environment variables with defaults.
 *
 * @param env - Environment variable map (defaults to process.env)
 */
export function loadConfig(env?: Record<string, string | undefined>): CoreConfig {
  const e = env ?? {};

  const securityMode = e.DINA_SECURITY_MODE;
  if (securityMode && securityMode !== 'security' && securityMode !== 'convenience') {
    throw new Error(`config: invalid security mode "${securityMode}" (must be "security" or "convenience")`);
  }

  return {
    listenAddr: e.DINA_CORE_URL ?? DEFAULTS.listenAddr,
    brainURL: e.DINA_BRAIN_URL ?? DEFAULTS.brainURL,
    vaultPath: e.DINA_VAULT_PATH ?? DEFAULTS.vaultPath,
    serviceKeyDir: e.DINA_SERVICE_KEY_DIR ?? DEFAULTS.serviceKeyDir,
    securityMode: (securityMode as 'security' | 'convenience') ?? DEFAULTS.securityMode,
    sessionTTL: parseIntOrDefault(e.DINA_SESSION_TTL, DEFAULTS.sessionTTL),
    rateLimit: parseIntOrDefault(e.DINA_RATE_LIMIT, DEFAULTS.rateLimit),
    spoolMax: parseIntOrDefault(e.DINA_SPOOL_MAX, DEFAULTS.spoolMax),
    msgboxURL: e.DINA_MSGBOX_URL,
  };
}

/**
 * Validate a loaded config. Returns array of error messages (empty = valid).
 */
export function validateConfig(config: CoreConfig): string[] {
  const errors: string[] = [];

  if (!config.listenAddr) {
    errors.push('listenAddr is required');
  }

  if (!config.brainURL) {
    errors.push('brainURL is required');
  } else if (!isValidURL(config.brainURL)) {
    errors.push(`brainURL is not a valid URL: "${config.brainURL}"`);
  }

  if (!config.vaultPath) {
    errors.push('vaultPath is required');
  }

  if (!config.serviceKeyDir) {
    errors.push('serviceKeyDir is required');
  }

  if (config.securityMode !== 'security' && config.securityMode !== 'convenience') {
    errors.push(`securityMode must be "security" or "convenience", got "${config.securityMode}"`);
  }

  if (config.sessionTTL <= 0) {
    errors.push(`sessionTTL must be positive, got ${config.sessionTTL}`);
  }

  if (config.rateLimit < 0) {
    errors.push(`rateLimit must be non-negative, got ${config.rateLimit}`);
  }

  if (config.spoolMax <= 0) {
    errors.push(`spoolMax must be positive, got ${config.spoolMax}`);
  }

  if (config.msgboxURL && !isValidURL(config.msgboxURL)) {
    errors.push(`msgboxURL is not a valid URL: "${config.msgboxURL}"`);
  }

  return errors;
}

/** Parse an integer from string, return default if missing or invalid. */
function parseIntOrDefault(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/** Basic URL validation — must start with http://, https://, ws://, or wss://. */
function isValidURL(url: string): boolean {
  return /^(?:https?|wss?):\/\/.+/.test(url);
}
