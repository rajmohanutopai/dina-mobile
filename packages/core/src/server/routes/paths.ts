/**
 * Route path constants — single source of truth for all API paths.
 *
 * Every route, authz rule, and client call must reference these constants.
 * This prevents the exact class of bug where Brain calls /v1/staging/extend
 * but Core exposes /v1/staging/extend-lease.
 */

// ---------------------------------------------------------------
// Health
// ---------------------------------------------------------------

export const HEALTHZ = '/healthz';

// ---------------------------------------------------------------
// Vault
// ---------------------------------------------------------------

export const VAULT_STORE = '/v1/vault/store';
export const VAULT_STORE_BATCH = '/v1/vault/store/batch';
export const VAULT_QUERY = '/v1/vault/query';
export const VAULT_ITEM = '/v1/vault/item';      // + /:id
export const VAULT_KV = '/v1/vault/kv';          // + /:key

// ---------------------------------------------------------------
// Staging
// ---------------------------------------------------------------

export const STAGING_INGEST = '/v1/staging/ingest';
export const STAGING_CLAIM = '/v1/staging/claim';
export const STAGING_RESOLVE = '/v1/staging/resolve';
export const STAGING_FAIL = '/v1/staging/fail';
export const STAGING_EXTEND_LEASE = '/v1/staging/extend-lease';

// ---------------------------------------------------------------
// Identity
// ---------------------------------------------------------------

export const DID_ROOT = '/v1/did';
export const DID_SIGN = '/v1/did/sign';
export const DID_VERIFY = '/v1/did/verify';
export const DID_DOCUMENT = '/v1/did/document';

// ---------------------------------------------------------------
// Personas
// ---------------------------------------------------------------

export const PERSONAS_LIST = '/v1/personas';
export const PERSONA_UNLOCK = '/v1/persona/unlock';
export const PERSONA_LOCK = '/v1/persona/lock';

// ---------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------

export const CONTACTS_ROOT = '/v1/contacts';

// ---------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------

export const APPROVALS_ROOT = '/v1/approvals';

// ---------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------

export const REMINDER_ROOT = '/v1/reminder';
export const REMINDERS_PENDING = '/v1/reminders/pending';

// ---------------------------------------------------------------
// PII
// ---------------------------------------------------------------

export const PII_SCRUB = '/v1/pii/scrub';

// ---------------------------------------------------------------
// Audit
// ---------------------------------------------------------------

export const AUDIT_APPEND = '/v1/audit/append';
export const AUDIT_QUERY = '/v1/audit/query';
export const AUDIT_VERIFY = '/v1/audit/verify';

// ---------------------------------------------------------------
// Notify
// ---------------------------------------------------------------

export const NOTIFY = '/v1/notify';

// ---------------------------------------------------------------
// D2D Messaging
// ---------------------------------------------------------------

export const MSG_SEND = '/v1/msg/send';
export const MSG_INBOX = '/v1/msg/inbox';

// ---------------------------------------------------------------
// Devices
// ---------------------------------------------------------------

export const DEVICES_ROOT = '/v1/devices';

// ---------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------

export const EXPORT = '/v1/export';
export const IMPORT = '/v1/import';

// ---------------------------------------------------------------
// User-facing API
// ---------------------------------------------------------------

export const API_ASK = '/api/v1/ask';
export const API_REMEMBER = '/api/v1/remember';
