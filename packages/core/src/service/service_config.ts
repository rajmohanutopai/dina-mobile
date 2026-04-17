/**
 * Service Config — local description of which capabilities this home node
 * offers, whether they are public, and which MCP tool backs each one.
 *
 * Read by:
 *   - D2D ingress for `service.query`: checks whether the requested
 *     capability is configured locally (contact-gate bypass).
 *   - Brain `ServicePublisher`: publishes the profile to the community PDS.
 *   - Brain `ServiceHandler`: validates inbound params against published schema.
 *
 * Persistence shape is a single row `(key='self', value=<JSON>)`. The schema
 * matches what the Python reference stores under a dedicated table — one row
 * so GET returns the current config as an atomic blob.
 *
 * Source: core/internal/service/service_config.go  (Go reference)
 */

import { getServiceConfigRepository } from './service_config_repository';
import { configEventChannel } from './config_event_channel';

/** Policy for how the provider responds to a `service.query`. */
export type ServiceResponsePolicy = 'auto' | 'review';

/** Configuration for a single capability published by this node. */
export interface ServiceCapabilityConfig {
  /** Name of the MCP server that backs this capability, e.g. `transit`. */
  mcpServer: string;
  /** MCP tool within that server to invoke. */
  mcpTool: string;
  /** Whether responses are auto-sent or gated by operator review. */
  responsePolicy: ServiceResponsePolicy;
  /**
   * SHA-256 of the canonical schema for this capability. Published alongside
   * the profile so requesters can detect version skew. Added in 9b1c4a4.
   */
  schemaHash?: string;
}

/** Per-capability JSON Schemas, published via the service profile. */
export interface ServiceCapabilitySchemas {
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  schemaHash: string;
}

/** The full local service configuration. Mirrors the Go `ServiceConfig`. */
export interface ServiceConfig {
  /**
   * Whether this home node is publicly discoverable. When `false`, the
   * service-profile record is removed from PDS and no inbound service
   * queries bypass the contact gate.
   */
  isPublic: boolean;
  /** Human-readable service name. */
  name: string;
  description?: string;
  /** One entry per advertised capability. */
  capabilities: Record<string, ServiceCapabilityConfig>;
  /** JSON Schemas per capability. Omit to leave params unvalidated. */
  capabilitySchemas?: Record<string, ServiceCapabilitySchemas>;
}

/** Listener fired after a successful config write. Fresh config is passed. */
export type ConfigChangeListener = (config: ServiceConfig | null) => void;

// ---------------------------------------------------------------------------
// In-memory state — the source of truth within the process. Repository (when
// wired) mirrors writes to SQLite so config survives restart.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'self';

let current: ServiceConfig | null = null;
const listeners = new Set<ConfigChangeListener>();
let hydrated = false;

/**
 * Return the current service config, or `null` if none has been set. Lazily
 * hydrates from the repository on first call.
 */
export function getServiceConfig(): ServiceConfig | null {
  if (!hydrated) {
    hydrate();
  }
  return current;
}

/**
 * Replace the current service config. Caller supplies a fully-formed object;
 * no partial updates. Triggers listeners synchronously after the write.
 *
 * Throws if the config fails structural validation — the write is atomic,
 * so the previous value is preserved on error.
 */
export function setServiceConfig(config: ServiceConfig): void {
  validateServiceConfig(config);
  const repo = getServiceConfigRepository();
  const json = JSON.stringify(config);
  if (repo !== null) {
    repo.put(STORAGE_KEY, json, Date.now());
  }
  current = config;
  hydrated = true;
  notifyListeners(current);
  configEventChannel().emitConfigChanged();
}

/**
 * Clear the config. When `isPublic` flips to `false` the caller can either
 * `setServiceConfig({...existing, isPublic: false})` (keeping the config row
 * for diagnostics) or `clearServiceConfig()` (removing it entirely).
 */
export function clearServiceConfig(): void {
  const repo = getServiceConfigRepository();
  if (repo !== null) {
    repo.remove(STORAGE_KEY);
  }
  current = null;
  hydrated = true;
  notifyListeners(null);
  configEventChannel().emitConfigChanged();
}

/** Reset module state — tests only. */
export function resetServiceConfigState(): void {
  current = null;
  hydrated = false;
  listeners.clear();
}

/**
 * Subscribe to config changes. The returned disposer unsubscribes.
 * Listener errors are swallowed and logged — one broken subscriber must not
 * cascade to the others.
 */
export function onServiceConfigChanged(
  listener: ConfigChangeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Return whether this home node advertises `capability` to inbound
 * `service.query` traffic. Used by D2D ingress as the contact-gate bypass
 * check.
 */
export function isCapabilityConfigured(capability: string): boolean {
  const cfg = getServiceConfig();
  if (cfg === null || !cfg.isPublic) return false;
  return Object.prototype.hasOwnProperty.call(cfg.capabilities, capability);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function hydrate(): void {
  hydrated = true;
  const repo = getServiceConfigRepository();
  if (repo === null) return;
  const raw = repo.get(STORAGE_KEY);
  if (raw === null) return;
  try {
    const parsed = JSON.parse(raw) as ServiceConfig;
    validateServiceConfig(parsed);
    current = parsed;
  } catch {
    // Corrupt row — leave `current` null. A subsequent `setServiceConfig`
    // call will overwrite the bad data.
    current = null;
  }
}

function notifyListeners(cfg: ServiceConfig | null): void {
  for (const l of listeners) {
    try {
      l(cfg);
    } catch {
      // Intentional: a faulty listener should not break the caller's write.
    }
  }
}

/**
 * Structural validation. Throws `Error` with a precise message naming the
 * first violated invariant. Matches the wire-level invariants the Go code
 * enforces in the HTTP handler.
 */
export function validateServiceConfig(value: unknown): asserts value is ServiceConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('service_config: must be a JSON object');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.isPublic !== 'boolean') {
    throw new Error('service_config: isPublic must be a boolean');
  }
  if (typeof v.name !== 'string' || v.name === '') {
    throw new Error('service_config: name is required');
  }
  if (v.description !== undefined && typeof v.description !== 'string') {
    throw new Error('service_config: description must be a string when present');
  }
  if (!v.capabilities || typeof v.capabilities !== 'object') {
    throw new Error('service_config: capabilities must be an object');
  }
  const caps = v.capabilities as Record<string, unknown>;
  for (const [name, entryU] of Object.entries(caps)) {
    if (!name) {
      throw new Error('service_config: capability name cannot be empty');
    }
    if (!entryU || typeof entryU !== 'object') {
      throw new Error(`service_config: capabilities.${name} must be an object`);
    }
    const entry = entryU as Record<string, unknown>;
    if (typeof entry.mcpServer !== 'string' || entry.mcpServer === '') {
      throw new Error(`service_config: capabilities.${name}.mcpServer is required`);
    }
    if (typeof entry.mcpTool !== 'string' || entry.mcpTool === '') {
      throw new Error(`service_config: capabilities.${name}.mcpTool is required`);
    }
    if (entry.responsePolicy !== 'auto' && entry.responsePolicy !== 'review') {
      throw new Error(
        `service_config: capabilities.${name}.responsePolicy must be "auto" or "review"`,
      );
    }
    if (entry.schemaHash !== undefined && typeof entry.schemaHash !== 'string') {
      throw new Error(
        `service_config: capabilities.${name}.schemaHash must be a string when present`,
      );
    }
  }
  if (v.capabilitySchemas !== undefined) {
    if (!v.capabilitySchemas || typeof v.capabilitySchemas !== 'object') {
      throw new Error('service_config: capabilitySchemas must be an object');
    }
    const schemas = v.capabilitySchemas as Record<string, unknown>;
    for (const [name, schemaU] of Object.entries(schemas)) {
      if (!schemaU || typeof schemaU !== 'object') {
        throw new Error(`service_config: capabilitySchemas.${name} must be an object`);
      }
      const s = schemaU as Record<string, unknown>;
      if (!s.params || typeof s.params !== 'object') {
        throw new Error(`service_config: capabilitySchemas.${name}.params is required`);
      }
      if (!s.result || typeof s.result !== 'object') {
        throw new Error(`service_config: capabilitySchemas.${name}.result is required`);
      }
      if (typeof s.schemaHash !== 'string' || s.schemaHash === '') {
        throw new Error(`service_config: capabilitySchemas.${name}.schemaHash is required`);
      }
    }
  }
}
