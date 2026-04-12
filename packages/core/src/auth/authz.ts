/**
 * Per-service authorization matrix.
 *
 * Maps (path, caller_type) → allowed/denied. Matches the server's
 * auth middleware exactly.
 *
 * Caller types:
 *   brain:     vault/query, vault/store, staging/*, pii/scrub, vault/kv
 *   admin:     persona/unlock, persona/lock, devices, export, pair, approvals
 *   connector: staging/ingest only
 *   device:    all read endpoints (query, list), approvals
 *   agent:     vault/query (via session grant), staging/ingest
 *
 * Paths are matched by prefix: "/v1/staging" matches "/v1/staging/ingest",
 * "/v1/staging/claim", etc.
 *
 * Source: core/internal/middleware/authz.go, ARCHITECTURE.md Section 18.4
 */

export type CallerType = 'brain' | 'admin' | 'connector' | 'device' | 'agent';

/**
 * Authorization rules: each entry maps a path prefix to the set of
 * caller types allowed to access it.
 *
 * More specific paths are listed first. The first matching prefix wins.
 */
const AUTHZ_RULES: Array<{ prefix: string; allowed: Set<CallerType> }> = [
  // Vault — Brain reads/writes, device reads, agent reads (via grant)
  { prefix: '/v1/vault/store/batch', allowed: new Set(['brain']) },
  { prefix: '/v1/vault/store',       allowed: new Set(['brain']) },
  { prefix: '/v1/vault/query',       allowed: new Set(['brain', 'device', 'agent']) },
  { prefix: '/v1/vault/item/',       allowed: new Set(['brain', 'device']) },
  { prefix: '/v1/vault/kv/',         allowed: new Set(['brain', 'device']) },

  // Staging — Brain full access, connector ingest only
  { prefix: '/v1/staging/ingest',    allowed: new Set(['brain', 'connector']) },
  { prefix: '/v1/staging/claim',     allowed: new Set(['brain']) },
  { prefix: '/v1/staging/resolve',   allowed: new Set(['brain']) },
  { prefix: '/v1/staging/fail',      allowed: new Set(['brain']) },
  { prefix: '/v1/staging/extend-lease', allowed: new Set(['brain']) },

  // Persona management — Admin only
  { prefix: '/v1/persona/unlock',    allowed: new Set(['admin']) },
  { prefix: '/v1/persona/lock',      allowed: new Set(['admin']) },
  { prefix: '/v1/personas',          allowed: new Set(['admin', 'brain', 'device']) },

  // Identity — Admin + Brain (read)
  { prefix: '/v1/did',               allowed: new Set(['admin', 'brain']) },

  // Devices — Admin only
  { prefix: '/v1/devices',           allowed: new Set(['admin']) },

  // Export/Import — Admin only
  { prefix: '/v1/export',            allowed: new Set(['admin']) },
  { prefix: '/v1/import',            allowed: new Set(['admin']) },

  // Approvals — Admin + Device (user approves from UI)
  { prefix: '/v1/approvals',         allowed: new Set(['admin', 'device']) },

  // PII — Brain
  { prefix: '/v1/pii/',              allowed: new Set(['brain']) },

  // Audit — Admin + Brain
  { prefix: '/v1/audit/',            allowed: new Set(['admin', 'brain']) },

  // Contacts — Admin + Brain
  { prefix: '/v1/contacts',          allowed: new Set(['admin', 'brain']) },

  // Reminders — Admin + Brain + Device
  { prefix: '/v1/reminder',          allowed: new Set(['admin', 'brain', 'device']) },

  // Notify — Brain
  { prefix: '/v1/notify',            allowed: new Set(['brain']) },

  // D2D messaging — Brain
  { prefix: '/v1/msg/',              allowed: new Set(['brain']) },

  // User-facing API — Device (app UI) + Admin
  { prefix: '/api/v1/ask',           allowed: new Set(['device', 'admin', 'brain']) },
  { prefix: '/api/v1/remember',      allowed: new Set(['device', 'admin', 'brain']) },

  // Health check — everyone
  { prefix: '/healthz',              allowed: new Set(['brain', 'admin', 'connector', 'device', 'agent']) },
];

/**
 * Check if a caller type is authorized for an endpoint.
 *
 * @param callerType - The authenticated caller's type
 * @param method - HTTP method (unused currently — all methods share the same rule per path)
 * @param path - URL path (e.g., "/v1/vault/query")
 * @returns true if authorized
 */
export function isAuthorized(callerType: CallerType, method: string, path: string): boolean {
  for (const rule of AUTHZ_RULES) {
    if (path.startsWith(rule.prefix)) {
      return rule.allowed.has(callerType);
    }
  }
  // Unknown path — deny by default (fail-closed)
  return false;
}

/**
 * Get the full authorization matrix as a lookup table.
 * Maps path prefix → list of allowed caller types.
 */
export function getAuthorizationMatrix(): Record<string, CallerType[]> {
  const matrix: Record<string, CallerType[]> = {};
  for (const rule of AUTHZ_RULES) {
    matrix[rule.prefix] = Array.from(rule.allowed);
  }
  return matrix;
}
