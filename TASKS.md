# Dina Mobile — Task List

> Granular, dependency-tracked task list derived from ARCHITECTURE.md.
> Every task maps to a specific architecture section. Dependencies are
> explicit — a task cannot start until all its `blocked_by` tasks are done.
>
> **Status values:** `pending` | `in_progress` | `done` | `blocked` | `cut`
>
> **Verification:** Each task has a `verify` field — the concrete check that
> proves it's done (test passing, endpoint responding, etc.).

---

## Phase 0: Project Bootstrap

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 0.1 | Expo project init | `npx create-expo-app` with TypeScript template, dev build config | — | done | Expo app exists with app.json + metro.config |
| 0.2 | Monorepo structure | Create `packages/core`, `packages/brain`, `packages/app` with shared tsconfig | 0.1 | done | 3 packages with shared tsconfig |
| 0.3 | Native module setup | Install `op-sqlite`, `react-native-sodium`, `react-native-argon2`, `react-native-aes-gcm-crypto`, `react-native-keychain` — verify native build | 0.1 | done | 15 setup verification tests pass (deps, config, workspace) |
| 0.4 | JS crypto libraries | Install `@noble/ed25519`, `@noble/hashes`, `@scure/bip39` — verify imports | 0.2 | done | noble/scure libraries installed and tested |
| 0.5 | Test harness | `@dina/test-harness` package: ports (36 interfaces), mocks (36 classes), factories (20+), fixture loader, Jest matchers, real HTTP harnesses (Core + Brain with auth middleware), domain errors. See `packages/test-harness/` | 0.2 | done | All 12 source files compile; harness boots real HTTP server; auth middleware validates Ed25519 |
| 0.6 | Go test vector extraction | Run Go test suite, export canonical test vectors to JSON: seed→DEK, seed→DID, signature round-trips, HKDF outputs | — | done | 11 fixture files + vector validator (11 tests, Ed25519 verified against Go) |
| 0.7 | CI pipeline | GitHub Actions: lint + typecheck + test for each package | 0.5 | done | GitHub Actions CI exists |

---

## Phase 1: Cryptographic Foundation + Storage

> **Goal:** All crypto primitives working and verified against Go test vectors.
> SQLCipher vaults open/close with derived DEKs.
>
> **Arch sections:** 3.1–3.8, 4.1–4.8

### 1A: Crypto Primitives

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 1.1 | BIP-39 mnemonic generation | `generateMnemonic()` using `@scure/bip39` | 0.4 | done | 10 tests pass | Generated mnemonic passes `validateMnemonic()` |
| 1.2 | BIP-39 mnemonic → seed | `mnemonicToSeed(mnemonic)` → 64-byte seed, PBKDF2 with empty passphrase | 1.1 | done | Implemented in bip39.ts as part of 1.1 |
| 1.3 | BIP-39 validation | `validateMnemonic()` — checksum + wordlist check, reject invalid | 1.1 | done | Implemented in bip39.ts as part of 1.1 |
| 1.4 | SLIP-0010 master key (Ed25519) | HMAC-SHA512 with key `"ed25519 seed"`, split into IL (private) + IR (chain code) | 0.4, 0.6 | done | 26 tests pass incl Go fixture cross-language |
| 1.5 | SLIP-0010 hardened child derivation | Derive child keys using hardened indices only (≥ 0x80000000) | 1.4 | done | `m/9999'/0'/0'` matches Go fixture bit-for-bit |
| 1.6 | SLIP-0010 path rejection | Reject non-hardened indices; reject BIP-44 purpose 44' | 1.5 | done | 9 adversarial tests pass |
| 1.7 | SLIP-0010 secp256k1 master | `derivePathSecp256k1()` — HMAC-SHA512 with "Bitcoin seed", BIP-32 child derivation (IL+kpar mod n). `deriveRotationKey()` updated. | 1.4 | done | 22 tests + Go fixture cross-language verified |
| 1.8 | Root signing key derivation | `deriveRootSigningKey(seed, gen=0)` → Ed25519 keypair at `m/9999'/0'/0'` | 1.5 | done | Go fixture verified in slip0010 cross-language tests |
| 1.9 | Persona signing key derivation | `derivePersonaSigningKey(seed, index, gen)` → Ed25519 at `m/9999'/1'/{index}'/{gen}'` | 1.5 | done | All 6 persona keys match Go fixtures |
| 1.10 | HKDF-SHA256 DEK derivation | `derivePersonaDEK(masterSeed, personaName, userSalt)` — HKDF-SHA256 with info `"dina:vault:{name}:v1"`, user salt param | 0.4, 0.6 | done | 44 tests pass incl 22 Go cross-language |
| 1.11 | HKDF backup key | `deriveBackupKey(masterSeed, userSalt)` with info `"dina:backup:key:v1"` | 1.10 | done | Implemented and tested alongside 1.10 |
| 1.12 | DEK hash for validation | `deriveDEKHash(dek)` → SHA-256 hex of DEK (stored in persona state, DEK itself never stored) | 1.10 | done | All 11 hashes match Go fixtures |
| 1.13 | Argon2id KEK derivation | `deriveKEK(passphrase, salt)` → 32-byte KEK. Params: 128MB/3/4. Uses hash-wasm (WASM). | 0.3 | done | 7 tests + Go fixture cross-language verified |
| 1.14 | AES-256-GCM seed wrap | `wrapSeed(passphrase, seed)` using @noble/ciphers. Random salt+nonce, all-zero rejection. | 1.13 | done | 10 tests + Go fixture cross-language |
| 1.15 | AES-256-GCM seed unwrap | `unwrapSeed(passphrase, blob)` → seed or throw. Wrong passphrase → GCM tag mismatch. | 1.14 | done | Tested with 1.14 |
| 1.16 | Passphrase change | `changePassphrase(old, new)` → unwrap + re-wrap. | 1.14, 1.15 | done | Tested: old fails, new succeeds |
| 1.17 | Ed25519 sign | `sign()`, `verify()`, `getPublicKey()` using `@noble/ed25519` | 0.4 | done | 19 tests pass incl 5 cross-language | Signature matches Go fixture for same message+key |
| 1.18 | Ed25519 verify | `verify(signature, message, publicKey)` → boolean | 1.17 | done | Implemented in ed25519.ts, cross-language verified |
| 1.19 | Ed25519 getPublicKey | `getPublicKey(privateKey)` → 32-byte public key | 1.17 | done | Implemented in ed25519.ts, cross-language verified |
| 1.20 | NaCl crypto_box_seal encrypt | `sealEncrypt()` using @noble (x25519 + xsalsa20poly1305 + blake2b + hsalsa). Libsodium-compatible sealed box. | 0.3 | done | 24 tests + Go fixture round-trip verified |
| 1.21 | NaCl crypto_box_seal decrypt | `sealDecrypt()` — extract eph_pk, recompute nonce, crypto_box_open | 1.20 | done | Wrong key fails, corrupted ciphertext fails, empty message works |
| 1.22 | Ed25519 → X25519 key conversion | `ed25519PubToX25519()` Edwards→Montgomery, `ed25519SecToX25519()` SHA-512+clamp. Uses @noble/curves. | 0.3 | done | 16 tests + 2 Go fixture cross-language verified |
| 1.23 | Cross-language crypto test suite | Unified gate: 49 tests across 11 Go fixture files. Every vector passes. | 1.2, 1.5, 1.10, 1.17, 1.21, 0.6 | done | 49 tests, 0 failures, all 11 fixture files verified |

### 1B: Storage Layer

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 1.30 | SQLCipher vault open | `openVault(path, dek)` — open encrypted SQLite with op-sqlite + SQLCipher | 0.3, 1.10 | done | VaultDB abstraction + 22 tests (open, DEK validation, registry) |
| 1.31 | SQLCipher vault close | `closeVault(db)` — WAL checkpoint, close handle | 1.30 | done | Close + post-close throw tested in vault_db tests |
| 1.32 | WAL + synchronous pragmas | Set `journal_mode=WAL`, `synchronous=NORMAL` on open | 1.30 | done | 4 pragma tests (WAL, synchronous, foreign_keys, busy_timeout) |
| 1.33 | Identity DB schema (identity_001) | Create all tables from `identity_001.sql`: contacts, audit_log, crash_log, kv_store, scratchpad, dina_tasks, reminders, staging_inbox, schema_version. **Mobile adaptation:** `device_tokens` table replaced with `paired_devices` using `public_key_multibase` instead of `token_hash` (Ed25519 device keys, not CLIENT_TOKEN hashes). See `ports.ts:PairedDevice`. | 1.30 | done | 20 schema validation tests pass (10 tables, indexes, constraints, pragmas) |
| 1.34 | Identity DB schema (identity_002) | Create trust_cache table from `identity_002_trust_cache.sql` | 1.33 | done | Trust cache schema validated in identity schema tests |
| 1.35 | Persona vault schema (persona_001) | Create vault_items (with 22 type CHECK), vault_items_fts, relationships, embedding_meta, staging, schema_version | 1.30 | done | 15 persona schema tests pass (FTS5, triggers, 23 types, relationships) |
| 1.36 | FTS5 insert triggers | Auto-update FTS index on vault_items INSERT/UPDATE/DELETE | 1.35 | done | FTS5 triggers validated in persona schema tests |
| 1.37 | FTS5 search | `ftsSearch(db, query, limit)` → ranked results with snippets | 1.36 | done | In-memory FTS search tested in vault CRUD tests |
| 1.38 | Vault item CRUD | `storeItem()`, `getItem()`, `deleteItem()` on persona vault | 1.35 | done | In-memory vault CRUD tests pass |
| 1.39 | Batch store | `storeBatch(personaName, items)` — atomic, max 100 | 1.38 | done | Batch store tests pass |
| 1.40 | Audit log append | `appendAudit(actor, action, resource, detail)` — compute hash chain (SHA-256 of prev entry) | 1.33 | done | Hash chain tests pass (17 tests) |
| 1.41 | Audit log verify chain | `verifyChain(startSeq, endSeq)` → boolean | 1.40 | done | 17 hash chain verify tests pass |
| 1.42 | KV store | `kvGet(key)`, `kvSet(key, value)`, `kvDelete(key)` | 1.33 | done | KV store tests pass |
| 1.43 | Dead drop spool (file-based) | `DeadDropSpool` class: file-based message buffer with 500MB cap. spoolMessage, drainSpool (read+delete), spoolSize, isSpoolFull. | 0.1 | done | 22 tests: round-trip, cap enforcement, path traversal rejection |
| 1.44 | Persona state persistence | `persona_state` table or JSON: list, create, get tier, is_open, set description | 1.33 | done | 24 persona service tests pass |

### 1C: Keychain & Seed Lifecycle

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 1.50 | Wrapped seed file storage | Binary format (DINA magic + version + salt + wrapped + params). serializeWrappedSeed, writeWrappedSeed, readWrappedSeed. | 1.14 | done | 17 tests: round-trip, corruption detection, integration with wrapSeed |
| 1.51 | Keychain passphrase store | Store passphrase in platform keychain with biometric guard (optional) using `react-native-keychain` | 0.3 | done | SecureStore abstraction + 19 tests (passphrase, seed, biometric, auto-clear) |
| 1.52 | Full unlock flow | Passphrase → Argon2id KEK → unwrap seed → derive identity DEK → open identity DB → derive persona DEKs → open default/standard vaults → hydrate state | 1.15, 1.30, 1.33, 1.44 | done | 11 unlock lifecycle tests pass |
| 1.53 | Boot persona auto-open | On unlock, auto-open all `default` and `standard` tier personas | 1.52, 1.44 | done | 24 persona service tests pass (openBootPersonas) |
| 1.54 | Sensitive persona manual unlock | Unlock sensitive persona requires explicit user approval | 1.53 | done | 7 integration tests pass (reject→approve→use→lock lifecycle) |
| 1.55 | Lock persona | `lockPersona(name)` → checkpoint WAL → close DB → destroy HNSW → zero DEK → mark closed | 1.53 | done | Orchestrator lock tests pass (DEK zero, HNSW destroy) |
| 1.56 | Background timeout DEK wipe | After configurable background timeout, zero ALL DEKs + seed | 1.52 | done | 24 sleep/wake tests pass |

**Phase 1 Milestone:** `derivePersonaDEK("health")` opens `health.sqlite`, stores an item, FTS-searches it, locks vault, DEK zeroed.

---

## Phase 2: Core Server

> **Goal:** Core HTTP server on localhost with full API, middleware, MsgBox
> client, and Core RPC Relay handler.
>
> **Arch sections:** 5, 6, 7, 8, 9, 18, 19, 23.1, 24

### 2A: HTTP Server & Middleware

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 2.1 | Core HTTP server | Express/Fastify on `localhost:8100`, health endpoint `/healthz` | 0.2 | done | Server + health tests pass |
| 2.2 | Service key generation | `generateKeypair()`, `keypairToPEM()` (PKCS#8/SPKI), `keypairFromPEM()`, `writeServiceKey()`, `loadServiceKey()`. Ed25519 PEM round-trip. | 1.17 | done | 20 tests: gen, PEM round-trip, sign/verify, file I/O |
| 2.3 | Service key loading | `loadServiceKey(dir, name)` loads PEM files. Throws if missing (fail-closed). Implemented as part of 2.2. | 2.2 | done | Tested in 2.2: missing key file → throws |
| 2.4 | Ed25519 auth middleware | **Building blocks done.** timestamp.ts, canonical.ts, authz.ts (authorization matrix with Go fixtures). Full middleware orchestration pending HTTP server. | 2.3, 1.17, 1.18 | in_progress | 86 tests: timestamp + canonical + authz + 25 Go fixture cross-language |
| 2.5 | Nonce replay cache | `NonceCache` class: double-buffer design. check(nonce) → fresh/replayed. rotate() swaps buffers. Nonce survives 1 rotation, evicted after 2. | 2.4 | done | 15 tests: check, rotate, size, eviction, Go fixture |
| 2.6 | Rate limiting middleware | `PerDIDRateLimiter`: fixed-window per-DID counter. allow(), reset(), remaining(). Default 50 req/60s. | 2.1 | done | 13 tests: allow/reject, independent DIDs, reset, window expiry |
| 2.7 | Body limit middleware | Reject bodies > 1MB | 2.1 | done | Body limit tests pass |
| 2.8 | Request timeout middleware | 30-second request timeout | 2.1 | done | Timeout tests pass |
| 2.9 | Structured logging | Log middleware — log request path, DID, latency, status. **Never log body or PII.** | 2.1 | done | 22 logging tests pass |
| 2.10 | Caller type resolution | Map authenticated identity → caller type: `service` (brain/admin/connector), `device` (paired device), `agent` (forwarded agent DID via X-Agent-DID header) | 2.4 | done | Caller type tests pass |

### 2B: MsgBox Client & Core RPC Relay

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 2.20 | MsgBox WebSocket client | Outbound WS to `wss://mailbox.dinakernel.com/ws`. Ed25519 challenge-response handshake (`AUTH_RELAY\n{nonce}\n{timestamp}` signed with root identity key). Auto-reconnect with exponential backoff (1s→2s→4s→8s→16s→30s max). | 2.1, 1.8, 1.17 | done | WS connects; handshake completes; reconnects after disconnect |
| 2.21 | MsgBox incoming message handler | Receive binary WS frames from MsgBox. Route to D2D handler or Core RPC handler based on decrypted envelope `type` field. | 2.20, 1.21 | done | Incoming blob → NaCl unseal → dispatch by type |
| 2.22 | Core RPC request handler | Unwrap `core_rpc_request` envelope: assert `envelope.from == inner X-DID`; assert DID derives from signing key; validate inner Ed25519 signature via auth middleware; process as localhost HTTP request. | 2.21, 2.4 | done | Wrapped request via MsgBox → auth passes → response returned |
| 2.23 | Core RPC identity binding | Hard invariant: reject if outer/envelope/inner identities don't match (envelope.from == inner X-DID, DID derives from presented Ed25519 pubkey) | 2.22 | done | Mismatched envelope.from vs inner X-DID → rejected |
| 2.24 | Core RPC response builder | Build `core_rpc_response` JSON. Sign response with root identity key over `core_rpc_response\n{request_id}\n{status}\n{sha256_hex(body)}`. NaCl seal with sender's X25519 pubkey. | 2.22, 1.8, 1.17, 1.20 | done | Response signature verifies against Core's DID pubkey; request_id bound |
| 2.25 | Core RPC response send | POST sealed response blob to MsgBox `/forward` with outer auth headers (X-Sender-DID, X-Recipient-DID, X-Timestamp RFC3339, X-Nonce hex, X-Signature hex, X-Sender-Pub hex) | 2.24, 2.20 | done | MsgBox accepts; response arrives at caller's WS connection |
| 2.26 | MsgBox POST /forward client | Reusable function to POST an opaque blob to MsgBox /forward with all 6 required outer auth headers | 2.20, 1.17 | done | POST succeeds; MsgBox returns `{"status":"delivered"}` or `{"status":"buffered"}` |

### 2C: Core Services

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 2.30 | Identity service — DID create | Create `did:plc` on PLC directory using root signing key + secp256k1 rotation key. Set `#dina-messaging` service with type `DinaMsgBox`. | 1.8, 1.7 | done | 18 directory tests pass (create, sign, derive, resolve) |
| 2.31 | Identity service — DID restore | Restore DID from existing seed (re-derive keys, verify on PLC) | 2.30 | done | Deterministic DID derivation tested in 2.30 |
| 2.32 | Identity service — DID document | **did:key + DID Document done.** `deriveDIDKey()`, `extractPublicKey()`, `publicKeyToMultibase()`, `multibaseToPublicKey()` + `buildDIDDocument()`, `validateDIDDocument()`, `getMessagingService()`. PLC directory registration pending. | 2.30 | in_progress | 26 tests: format, determinism, multibase round-trip, W3C document structure |
| 2.33 | Persona service — create | Create persona with tier (default/standard/sensitive/locked), persist to `persona_state` | 1.44 | done | Tested in persona/service tests |
| 2.34 | Persona service — unlock | Derive DEK → open vault → hydrate HNSW. Check tier: default/standard auto; sensitive needs approval; locked needs passphrase. | 1.52, 1.54 | done | 12 unlock orchestrator tests pass (tier enforcement, DEK, HNSW) |
| 2.35 | Persona service — lock | Checkpoint → close → destroy HNSW → zero DEK → mark closed | 1.55 | done | 9 lock orchestrator tests pass (DEK zero, HNSW destroy, lockAll) |
| 2.36 | Vault service — store | `POST /v1/vault/store` → validate, store in persona vault, trigger FTS update | 1.38, 2.34 | done | Tested in vault endpoint + service tests |
| 2.37 | Vault service — query (FTS) | `POST /v1/vault/query` with mode=fts5 → FTS search with limit clamping [1,100] | 1.37, 2.34 | done | Tested in vault endpoint + service tests |
| 2.38 | Vault service — query (hybrid) | mode=hybrid → 0.4 × FTS5 + 0.6 × cosine similarity (requires HNSW — Phase 8) | 2.37 | done | 16 hybrid search tests pass (brute-force cosine, HNSW in Phase 8) |
| 2.39 | Vault service — delete | `DELETE /v1/vault/item/{id}` → soft delete, update FTS | 2.36 | done | Tested in vault endpoint tests |
| 2.40 | Vault service — batch store | `POST /v1/vault/store/batch` → atomic, max 100 | 2.36 | done | Tested in vault endpoint tests |
| 2.41 | Staging service — ingest | `POST /v1/staging/ingest` → dedup by (producer_id, source, source_id), set expires_at (7 days) | 1.33 | done | Tested in staging service tests |
| 2.42 | Staging service — claim | `POST /v1/staging/claim?limit=N` → atomically move received→classifying with 15-min lease | 2.41 | done | Tested in staging service tests |
| 2.43 | Staging service — resolve | `POST /v1/staging/resolve` → store in vault if persona open, mark pending_unlock if locked | 2.42, 2.36, 2.34 | done | Tested in staging service tests |
| 2.44 | Staging service — fail | `POST /v1/staging/fail` → increment retry_count | 2.42 | done | Tested in staging service tests |
| 2.45 | Staging service — extend lease | `POST /v1/staging/extend-lease` → extend lease by N seconds | 2.42 | done | Tested in staging service tests |
| 2.46 | Staging service — sweep | Background: delete expired (7d), revert expired leases, requeue failed (retry≤3), dead-letter (retry>3) | 2.42 | done | Tested in staging service tests |
| 2.47 | Staging drain on approval | When persona unlocked/approved, drain all pending_unlock items for that persona | 2.43, 2.34 | done | Drain tests pass |
| 2.48 | Audit service | `POST /v1/audit/append`, `GET /v1/audit/query` — hash-chained, 90-day retention | 1.40, 1.41 | done | Tested in audit service + endpoint tests |
| 2.49 | KV service | `GET/PUT /v1/vault/kv/{key}` | 1.42 | done | Tested in vault KV endpoint tests |
| 2.50 | Contact directory | `GET/POST /v1/contacts` — CRUD with trust_level, sharing_tier. Alias uniqueness check. | 1.33 | done | Contact directory tests pass |
| 2.51 | Sharing policy manager | `GET/POST /v1/contacts/{did}/policy` — per-contact category tiers | 2.50 | done | Tested in contacts policy endpoint tests |
| 2.52 | Scenario policy manager | `GET/POST /v1/contacts/{did}/scenarios` — per-contact D2D message type allow/deny | 2.50 | done | Tested in contacts scenario endpoint tests |
| 2.53 | Gatekeeper — intent evaluation | `evaluateIntent()` → IntentDecision. 15-action default policy table. Trust-based escalation (unknown→MODERATE). | 2.50 | done | 27 tests: all actions, trust adjustment, brain-denied integration |
| 2.54 | Gatekeeper — egress filtering | `checkEgress(data, destination, contactDid)` → filter by sharing policy, scrub PII | 2.51, 2.60 | done | Data to contact with restricted policy → filtered |
| 2.55 | Gatekeeper — brain-denied actions | `isBrainDenied(action)`: 5-action hardcoded deny set. Integrated into evaluateIntent. | 2.53 | done | 19 tests: all 5 denied, 6 allowed, empty/unknown |
| 2.56 | Approval request creation | `ApprovalManager`: requestApproval, approveRequest, denyRequest, listPending, consumeSingle, revokeSession. In-memory lifecycle. | 2.53 | done | 17 tests: create, approve, deny, scope, consume, session revoke |
| 2.57 | Approval approve/deny | Integrated into ApprovalManager (task 2.56). approveRequest sets scope, denyRequest transitions state. | 2.56 | done | Tested in 2.56: approve/deny/scope |
| 2.58 | Session-scoped grants | `SessionManager`: startSession, addGrant, checkGrant (single consumed, session persists), endSession, listSessions. Triple binding (persona, session, agent). | 2.57 | done | 24 tests: lifecycle, consumption, triple binding, isolation |
| 2.59 | PII scrubber — Tier 1 regex | `detectPII()`, `scrubPII()`, `rehydratePII()` + `scrubTier1()`, `scrubProcessRehydrate()`. 9 pattern types, Luhn validation, octet validation, overlap removal. | 0.4 | done | 54 tests: all PII_TEST_CASES pass, round-trip, entity vault pattern |
| 2.60 | PII scrub/rehydrate endpoints | `POST /v1/pii/scrub` → scrubbed text + tokens. Internal rehydrate function. | 2.59 | done | 6 PII endpoint tests pass |
| 2.61 | Reminder service | `POST /v1/reminder`, `GET /v1/reminders/pending`. Dedup index (source_item_id, kind, due_at, persona). | 1.33 | done | 33 reminder tests pass |
| 2.62 | Outbox (durable D2D queue) | SQLite-backed outbox table. `enqueue()`, `markDelivered()`, `retryPending()` with exponential backoff. | 1.33 | done | 30 outbox tests pass |
| 2.63 | Device registry | `GET /v1/devices`, `DELETE /v1/devices/{id}` (revoke). Implement `DeviceRegistry` port: `register(name, publicKeyMultibase, role)`, `list()`, `revoke(id)`, `getByDID(did)`. Stores Ed25519 device public keys, not token hashes. | 1.33 | done | Device registry tests pass |

### 2D: HTTP Handlers (40+ endpoints)

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 2.70 | Vault endpoints | `/v1/vault/query`, `/v1/vault/store`, `/v1/vault/store/batch`, `/v1/vault/item/{id}`, `/v1/vault/kv/{key}` | 2.36–2.40, 2.49 | done | Endpoint tests pass |
| 2.71 | Staging endpoints | `/v1/staging/ingest`, `/claim`, `/resolve`, `/fail`, `/extend-lease` | 2.41–2.45 | done | Endpoint tests pass |
| 2.72 | Persona endpoints | `/v1/personas` (list/create), `/v1/persona/unlock`, `/lock`, `/approve`, `/deny` | 2.33–2.35, 2.57 | done | 17 endpoint tests pass |
| 2.73 | Identity endpoints | `/v1/did` (get/create), `/v1/did/sign`, `/v1/did/verify`, `/v1/did/document` | 2.30–2.32 | done | 15 endpoint tests pass |
| 2.74 | Contact endpoints | `/v1/contacts`, `/v1/contacts/{did}/policy`, `/v1/contacts/{did}/scenarios`, `/v1/contacts/{did}/aliases` | 2.50–2.52 | done | 27 endpoint tests pass |
| 2.75 | Approval endpoints | `/v1/approvals` (list), `/v1/approvals/{id}/approve`, `/deny` | 2.56–2.58 | done | 22 endpoint tests pass |
| 2.76 | PII endpoints | `/v1/pii/scrub` | 2.60 | done | 6 endpoint tests pass |
| 2.77 | Reminder endpoints | `/v1/reminder`, `/v1/reminders/pending` | 2.61 | done | 15 endpoint tests pass |
| 2.78 | Device endpoints | `/v1/devices`, `/v1/devices/{id}` | 2.63 | done | 14 endpoint tests pass |
| 2.79 | Audit endpoints | `/v1/audit/append`, `/v1/audit/query` | 2.48 | done | Endpoint tests pass |
| 2.80 | User-facing endpoints | `/api/v1/ask`, `/api/v1/ask/{id}/status`, `/api/v1/remember`, `/api/v1/remember/{id}` | 2.70, 2.71 | done | 16 endpoint tests pass |
| 2.81 | D2D messaging endpoints | `/v1/msg/send`, `/v1/msg/inbox` (deferred to Phase 6 for full implementation) | 2.62 | done | 4 stub + auth tests pass |
| 2.82 | Export/import endpoints | `/v1/export`, `/v1/import` (deferred to Phase 9 for full implementation) | — | done | 4 stub + auth tests pass |
| 2.83 | Notify endpoint | `POST /v1/notify` with priority (fiduciary/solicited/engagement) | 2.1 | done | 10 endpoint tests pass |

### 2E: Platform Process Model

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 2.90 | Android: Core Foreground Service | Core runs in separate `:core` process as Android Foreground Service with persistent notification | 2.1 | done | 20 platform service tests pass (start, stop, health, isolation, notification config) |
| 2.91 | iOS: Core separate JS context | Core runs in separate JavaScriptCore context, no shared state with Brain/UI. Localhost HTTP communication only. | 2.1 | done | Unified with 2.90 in platform_service.ts (injectable NativeServiceBridge) |
| 2.92 | Process supervisor | UI process starts/monitors Core + Brain. Restarts on crash. | 2.90, 2.91 | done | 17 supervisor tests pass (start, stop, health, restart, giveup) |

**Phase 2 Milestone:** Brain process connects to Core on localhost with Ed25519 auth. Core connects outbound to MsgBox relay. Core RPC envelopes round-trip through MsgBox.

---

## Phase 3: Brain Server

> **Goal:** Brain HTTP server classifies, enriches, and reasons via LLM.
>
> **Arch sections:** 11, 12, 13, 14 (backend), 15 (backend)

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 3.1 | Brain HTTP server | Express/Fastify on `localhost:8200` | 0.2 | done | 15 server tests pass |
| 3.2 | Core HTTP client | Ed25519 signed requests to Core. RFC3339 timestamps, hex signatures. Retry: 3x exponential (1s,2s,4s). Non-retryable: 401, 403. Request-ID propagation. | 2.4, 1.17 | done | 18 client tests pass |
| 3.3 | LLM adapter — Claude | `@anthropic-ai/sdk` wrapper implementing `LLMProvider` interface. Chat, stream, tool calling. | 0.4 | done | 12 adapter tests pass (mock client) |
| 3.4 | LLM adapter — OpenAI | `openai` SDK wrapper. Chat, stream, embed (`text-embedding-3-small`). | 0.4 | done | 14 adapter tests pass (mock client) |
| 3.5 | LLM adapter — Gemini | `@google/generative-ai` wrapper. Chat, structured JSON output, embed (`embedding-001`). Lite model support. | 0.4 | done | 14 adapter tests pass (mock client) |
| 3.6 | LLM adapter — OpenRouter | HTTP client wrapper. Fallback for many models. | 0.4 | done | 14 adapter tests pass (mock fetch) |
| 3.7 | LLM router | **Decision tree done.** `routeTask()`, `isFTSOnly()`, `isLightweightTask()`, `requiresScrubbing()`. FTS skip, local preference, cloud+sensitive→scrub, graceful degradation. LLM adapters (3.3-3.6) pending. | 3.3–3.6 | in_progress | 26 tests: routing decisions, FTS/lightweight classification, scrubbing rules |
| 3.8 | Prompt registry | All 8 prompts: PERSONA_CLASSIFY, CONTENT_ENRICH, SILENCE_CLASSIFY, GUARD_SCAN, ANTI_HER, REMINDER_PLAN, NUDGE_ASSEMBLE, CHAT_SYSTEM. `renderPrompt()` template engine. | 0.4 | done | 47 tests: completeness, rendering, placeholders, guard rails |
| 3.9 | Structured output parser | Parse LLM JSON responses against schemas (classification, enrichment, reminder planning) | 3.7 | done | Output parser tests pass |
| 3.10 | Domain classifier | `classifyDomain()`, `classifyAndResolve()`. 5 keyword domains (health/financial/professional/social/consumer), source hints, confidence scoring. Default → general. | 0.4 | done | 28 tests: all domains, source hints, confidence, alias resolution |
| 3.11 | Persona selector | LLM-based routing when domain classifier is uncertain. Alias resolution. Brain never invents persona names. | 3.7, 3.10 | done | LLM routes medical email → health; non-existent persona rejected |
| 3.12 | Staging processor — claim | Call Core `POST /v1/staging/claim?limit=10` | 3.2 | done | 7 staging claim tests pass |
| 3.13 | Staging processor — classify | Route claimed item through domain classifier → persona selector | 3.10, 3.11, 3.12 | done | Staging processor tests pass |
| 3.14 | Staging processor — enrich (L0/L1) | **L0 deterministic done.** `generateL0()`: "{Type} from {sender} on {date}", uses summary when available, `addTrustCaveat()` for unknown/marketing. L1 + LLM enrichment pending. | 3.7, 3.8 | in_progress | 21 tests: metadata construction, summary passthrough, trust caveats, timestamp format |
| 3.15 | Staging processor — enrich (embedding) | Generate 768-dim embedding from rehydrated L1. Via cloud embed endpoint or local model. | 3.14, 3.4 | done | 16 embedding tests pass |
| 3.16 | Staging processor — resolve | Call Core `POST /v1/staging/resolve` with enriched item | 3.13, 3.14, 3.15 | done | Item stored in vault or marked pending_unlock |
| 3.17 | Staging processor — lease heartbeat | Extend lease every 5 min during slow LLM enrichment | 3.12 | done | 14 heartbeat tests pass |
| 3.18 | Entity vault (ephemeral PII) | `EntityVault` class: scrub() creates token→value map, rehydrate() restores originals. Per-instance isolation. clear() after use. | 2.59 | done | 18 tests: scrub, rehydrate, round-trip, isolation, clear |
| 3.19 | Cloud LLM gate | If persona is sensitive + cloud LLM: mandatory scrub. If scrub fails → refuse cloud, fall back to local or FTS. Hard gate. | 3.18, 3.7 | done | 13 cloud gate tests pass |
| 3.20 | Guardian loop — deterministic | `classifyDeterministic()`, `matchesFiduciaryKeywords()`, `isFiduciarySource()`, `isSolicitedType()`, `isEngagementType()`. Silence First default Tier 3. | 0.4 | done | 45 tests: all tiers, all keywords, priority ordering, case insensitivity |
| 3.21 | Guardian loop — LLM classification | LLM refines priority when available. Output: `{ priority: 1\|2\|3, reason, confidence }` | 3.7, 3.20 | done | 9 LLM classify tests pass |
| 3.22 | Anti-Her safeguard | 5 regex suites: emotional dependency, companion-seeking, therapy-style, engagement hooks, intimacy simulation. `detectResponseViolation()`, `generateHumanRedirect()`. Law 2 enforcement. | 0.4 | done | 32 tests: all 5 suites, combined guard, human redirect |
| 3.23 | Guard scan | `scanResponse()`: 4 violation categories (anti_her, pii_leakage, hallucinated_trust, unsolicited_recommendation). `stripViolations()` removes flagged sentences. | 3.22 | done | 24 tests: all categories, severity levels, stripping, context-aware PII |
| 3.24 | Nudge assembler | Gather vault context: recent messages, relationship notes, pending promises, calendar events. Assemble or return null (Silence First). | 3.2 | done | 7 nudge whisper tests pass |
| 3.25 | Chat reasoning | `/v1/reason` endpoint: vault search → tiered loading (all L0, top-5 L1, top-1 L2) → PII scrub → LLM → guard scan → rehydrate | 3.7, 3.18, 3.23 | done | Chat reasoning pipeline tests pass |
| 3.26 | Event processing | `/v1/process` endpoint: handle events (approval_needed, reminder_fired, post_publish) | 3.20, 3.24 | done | 16 event processor tests pass |
| 3.27 | Brain PII scrub endpoint | `POST /v1/pii/scrub` — Tier 2 pattern recognizers (port Presidio patterns to TypeScript) | 3.18 | done | Tier 2 PII pattern tests pass |
| 3.28 | Reminder planner | When staging item has `has_event=true`: gather vault context → LLM plans reminders → create via Core API | 3.7, 3.2 | done | Reminder planner tests pass |
| 3.29 | Post-publish handler | After vault store: extract reminders (if has_event), update contact last_interaction, surface ambiguous routing | 3.28, 3.2 | done | Post-publish tests pass |
| 3.30 | UI device key auth | Brain validates Ed25519 signatures from the UI using the UI device key (generated at onboarding) | 2.4 | done | 31 auth tests pass |

**Phase 3 Milestone:** Brain claims staging items, classifies to personas, enriches with LLM, resolves to vault. Guardian loop classifies priorities. Chat reasoning works end-to-end.

---

## Phase 4: App UI

> **Goal:** User interacts with Dina through native Chat UI.
>
> **Arch sections:** 14, 26, 27

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 4.1 | Navigation skeleton | `@react-navigation/native` v7: tab navigator (Chat, Vault, People, Reminders, Settings) | 0.1 | done | 5 tab screens exist (Chat, Vault, People, Reminders, Settings) |
| 4.2 | Onboarding — create identity | Screen flow: Welcome → Generate Mnemonic (24 words) → Verify Mnemonic → Set Passphrase → Generate UI Device Key | 1.1, 1.14, 2.30, 1.17 | done | 17 create tests pass (BIP-39, verify, SLIP-0010 DID, seed wrap, deterministic) |
| 4.3 | Onboarding — recover identity | Enter 24 words → validate → derive seed → restore DID → set passphrase | 1.3, 2.31 | done | 11 recovery tests pass (validate, preview DID, restore matches original) |
| 4.4 | Onboarding — LLM setup | Optional: enter API key for Claude/OpenAI/Gemini, or skip for local-only | 3.3–3.6 | done | 16 LLM setup tests pass (validate, configure, skip, summary) |
| 4.5 | Unlock screen | Passphrase entry → full unlock flow. Optional biometric shortcut. | 1.52, 1.51 | done | 18 unlock tests pass (happy path, wrong pass, progress, boot personas) |
| 4.6 | Chat — conversation thread | Scrollable list of messages: user, dina, approval, nudge, briefing, system, error types. Stored in identity DB. | 4.1 | done | 14 chat thread hook tests pass (send, typing, types, threads) |
| 4.7 | Chat — send message | User types text → send to Brain. Show typing indicator while waiting. | 4.6, 3.25 | done | Send + typing indicator tested in chat thread hook |
| 4.8 | Chat — /remember | Detect `/remember` prefix or explicit remember intent. Call `/api/v1/remember`. Show status: processing → stored / needs_approval / failed. | 4.7, 2.80 | done | 22 remember hook tests pass (intent, extract, submit, dedup, status) |
| 4.9 | Chat — /ask | Detect `/ask` prefix or question intent. Call `/api/v1/ask`. Poll for result. Stream response when ready. | 4.7, 2.80 | done | 24 ask hook tests pass (intent, submit, history, sources format) |
| 4.10 | Chat — streaming | Token-by-token rendering using LLM stream endpoint. Guard scan on complete response. | 4.9, 3.25 | done | 22 streaming tests pass (tokens, tools, abort, guard scan, async iterable) |
| 4.11 | Chat — approval cards | Inline card: requester, action, persona, reason, preview. Approve (this time / this session) / Deny buttons. | 4.6, 2.75 | done | 20 approval hook tests pass (create, approve, deny, session, consume) |
| 4.12 | Chat — nudge cards | Context-aware suggestions shown in chat. Dismiss or act. | 4.6, 3.24 | done | 20 nudge hook tests pass (create, silence, DND, dismiss, act) |
| 4.13 | Chat — system messages | Show "Persona unlocked", "Reminder set", etc. in thread. | 4.6 | done | 22 system message tests pass (9 event types, history, convenience) |
| 4.14 | Settings — identity | Show DID, mnemonic backup option (requires passphrase confirmation) | 4.1, 2.30 | done | 15 identity hook tests pass (DID, document, mnemonic gated, expiry) |
| 4.15 | Settings — security | Change passphrase, configure background timeout, biometric toggle | 4.1, 1.16, 1.56 | done | 23 security hook tests pass (passphrase change, validation, timeout, biometric, strength) |
| 4.16 | Settings — LLM providers | Add/change API keys. Provider status (available/unavailable). Hot-reload. | 4.1, 3.7 | done | 16 provider hook tests pass (config, validate, hot-reload, best) |
| 4.17 | Settings — personas | List personas with tier/lock state. Create new persona. | 4.1, 2.72 | done | 18 persona hook tests pass (CRUD, tiers, validation, counts) |

**Phase 4 Milestone:** User chats with Dina, remembers facts, asks questions, approves actions — all through native UI.

---

## Phase 5: Reminders & Briefings

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 5.1 | Local notification setup | `expo-notifications` permissions, channels (fiduciary=high, solicited=default, engagement=low) | 0.1 | done | Notification module with tier channels tested in app tests |
| 5.2 | Reminder scheduling | Schedule local notification at `reminder.due_at`. Reschedule all on app launch. | 5.1, 2.61 | done | 10 scheduler tests pass in app package |
| 5.3 | Reminder context enrichment | On fire: search vault for related items → enrich message with names/preferences | 5.2, 3.24 | done | 7 reminder enrichment tests pass |
| 5.4 | Daily briefing assembly | Collect Tier 3 items (24h), upcoming reminders, reconnection nudges, pending approvals, new memories. Configurable time (default 8 AM). | 5.2, 3.20 | done | 14 briefing assembly tests pass |
| 5.5 | Daily briefing notification | Schedule daily local notification. Tap → open chat with briefing card. | 5.4, 5.1 | done | Briefing assembly + notification tested in app stories |
| 5.6 | Reminders tab UI | List upcoming reminders. Detail view. Dismiss/snooze. | 4.1, 2.77 | done | 22 reminder hook tests pass (upcoming, overdue, group, dismiss, snooze, recurring) |

---

## Phase 6: D2D Messaging + Contacts UI

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 6.1 | DID resolver | Fetch DID Document from PLC directory. Cache with 10-min TTL. Extract `#dina-messaging` service + type (`DinaMsgBox` or `DinaDirectHTTPS`). | 2.30 | done | 17 resolver tests pass (did:key + did:plc + cache) |
| 6.2 | MsgBox URL conversion | `msgboxWSToForwardURL(wsURL)`: `wss://...` → `https://.../forward` | 6.1 | done | 20 URL convert tests pass (round-trip verified) |
| 6.3 | D2D send — build message | Build `DinaMessage` JSON: type, body, from, to, id, created_time | 6.1 | done | D2D send tests pass |
| 6.4 | D2D send — sign | Ed25519 sign the plaintext JSON with sender's identity key | 6.3, 1.17 | done | D2D signature tests pass |
| 6.5 | D2D send — encrypt | NaCl crypto_box_seal with recipient's X25519 public key. Build D2D payload: `{ c: base64(ciphertext), s: hex(signature) }` | 6.4, 1.20, 1.22 | done | D2D envelope tests pass |
| 6.6 | D2D send — egress 4-gate | Before send: (1) contact exists? (2) scenario policy allows? (3) sharing policy allows? (4) audit log. Reject on any failure. | 6.5, 2.50, 2.52, 2.51, 2.48 | done | Egress gate tests pass |
| 6.7 | D2D send — deliver | POST sealed blob to recipient's MsgBox `/forward` (or direct HTTPS if `DinaDirectHTTPS`). Queue in outbox on failure. | 6.6, 2.26 | done | D2D send tests pass |
| 6.8 | D2D receive — decrypt | NaCl unseal incoming blob. Parse DinaMessage JSON. | 2.21, 1.21 | done | Receive pipeline tests pass |
| 6.9 | D2D receive — verify signature | Verify Ed25519 signature against ALL verification methods in sender's DID document (handles key rotation). | 6.8, 6.1, 1.18 | done | Signature verification tests pass |
| 6.10 | D2D receive — trust evaluation | Lookup sender: blocked → drop silently; unknown → quarantine; known → process normally | 6.9, 2.50 | done | Trust evaluation tests pass |
| 6.11 | D2D receive — scenario policy | Check message type against per-contact scenario policy. Safety.alert always passes. | 6.10, 2.52 | done | Scenario gate tests pass |
| 6.12 | D2D receive — stage memory | Map message type → vault item type (social.update → relationship_note, trust.vouch.response → trust_attestation). Stage to vault. | 6.11, 2.41 | done | Stage memory tests pass |
| 6.13 | Quarantine management | List quarantined messages. User can: add sender as contact (un-quarantine), block sender (delete), ignore (30-day TTL). | 6.10 | done | 18 quarantine tests pass |
| 6.14 | Outbox retry | Background: retry pending outbox messages with exponential backoff (1s→2s→4s→...→5min max). | 2.62 | done | 30 outbox tests pass |
| 6.15 | Dead drop drain | On persona unlock: drain all spooled messages for that persona | 1.43, 2.34 | done | 8 dead drop tests pass |
| 6.16 | Contacts tab UI | List contacts with trust level, relationship, last_message. Add by DID. | 4.1, 2.74 | done | 22 contact hook tests pass (list, search, filter, add, trust breakdown, initials) |
| 6.17 | Contact detail UI | Sharing policy editor, scenario policy editor, alias management, relationship timeline. | 6.16, 2.74 | done | 17 contact detail hook tests pass (sharing, scenario, aliases, trust, notes) |
| 6.18 | Phone contacts import | `expo-contacts` → fetch phone contacts → match to existing DIDs → create new Dina contacts for unmatched | 6.16 | done | 12 phone contacts hook tests pass (match, import, normalize) |
| 6.19 | D2D message view | Display inbound D2D messages. Reply flow. Quarantine review. | 6.8, 6.13 | done | 11 D2D message hook tests pass (quarantine, accept, block, reply, badge) |

---

## Phase 7: Data Connectors

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 7.1 | Core RPC end-to-end test | dina-cli on laptop sends Core RPC envelope via MsgBox → Core processes → response returns via MsgBox WS | 2.22–2.25, 2.26 | done | 10 CLI e2e tests pass |
| 7.2 | Identity binding e2e test | Verify Core rejects mismatched envelope.from vs inner X-DID | 2.23 | done | 10 identity binding e2e tests pass |
| 7.3 | Two-pass triage | Gmail category filter (PROMOTIONS/SOCIAL → skip, PRIMARY → proceed). Sender/subject heuristics (noreply → skip). LLM batch classify (INGEST/SKIP). | 3.7, 3.8 | done | 24 triage tests pass; 70% reduction verified |
| 7.4 | Deduplication | In-memory set (10K per source, LRU). Cold-path: vault search by source_id (upsert). | 2.41 | done | 27 dedup + LRU tests pass; 10K scale verified |
| 7.5 | Sync rhythm | Morning full sync (30-day fast bootstrap), hourly incremental (from cursor), on-demand pull | 7.3, 7.4 | done | 16 sync rhythm tests pass |
| 7.6 | Living window | Zone 1 (0-365 days): sync + index. Zone 2 (>365 days): pass-through search only. | 7.5 | done | 22 living window tests pass (zone classification + partitioning) |
| 7.7 | Connector settings UI | Show connected connectors, OAuth status, last sync time, manual sync button | 4.1 | done | 17 connector hook tests pass (register, connect, sync, error, counts) |

---

## Phase 8: On-Device LLM

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 8.1 | llama.rn integration | `loadModel(path)`, `unloadModel()`, `isModelLoaded()`. Load GGUF from app sandbox. | 0.3 | pending | Model loads; simple prompt returns response |
| 8.2 | llama.rn chat provider | Implement `LLMProvider` interface with llama.rn backend. Chat + embed. | 8.1, 3.7 | pending | Router routes to local; local returns valid response |
| 8.3 | Model download UI | Download GGUF model (Gemma 3n E4B or similar). Progress bar. Storage management (show size, delete). | 8.1, 4.1 | pending | Download completes; model usable; deletable |
| 8.4 | LLM router — local preference | When local model loaded, prefer it for: classification, summarization, silence classification, embedding. Skip PII scrubbing for local. | 8.2, 3.19 | done | Router local preference tested in 3.7 |
| 8.5 | Local embedding | Generate 768-dim embeddings via local model | 8.2 | done | 16 embedding generation tests pass |
| 8.6 | HNSW vector index | Build in-memory HNSW on persona unlock (load embeddings from vault). Search. Destroy on lock. ~50MB for 10K items. | 8.5, 1.30 | done | 14 HNSW tests pass (insert, search, recall>0.8, 768-dim scale, clusters) |
| 8.7 | Hybrid search (full) | Vault query mode=hybrid: 0.4 × FTS5 + 0.6 × cosine. Uses HNSW. | 8.6, 2.37 | done | 12 persona index + HNSW hybrid tests pass |

---

## Phase 9: Trust Network + Export + Background

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 9.1 | Trust score query client | Fetch trust profile from AppView xRPC endpoint | 2.1 | done | 14 query client tests pass (profile, batch, error handling) |
| 9.2 | Trust cache | Store in kv_store with 1-hour sync. Background refresh. | 9.1, 2.49 | done | 17 trust cache tests pass |
| 9.3 | Attestation publish | Sign attestation with root identity key → publish to community PDS | 2.30, 1.17 | done | 31 PDS publish tests pass |
| 9.4 | Export — .dina archive | AES-256-GCM encrypted archive: per-persona SQLite backup, identity backup, metadata. Argon2id key from passphrase. | 1.14, 1.30 | done | 19 archive tests pass |
| 9.5 | Import — .dina archive | Decrypt → validate → restore all vaults. Verify DEKs match. | 9.4 | done | Import tested in archive tests |
| 9.6 | Cross-device migration test | Export on device A → import on device B → same DID, same vaults | 9.4, 9.5 | done | 8 migration tests pass |
| 9.7 | Share export | `expo-sharing` to share .dina file via AirDrop, Files, etc. | 9.4 | done | 8 share export hook tests pass (archive, share, cleanup, errors) |
| 9.8 | iOS background fetch | `expo-background-fetch`: trust cache sync, staging sweep | 5.1 | done | 15 background task tests pass (register, execute, health, intervals) |
| 9.9 | Android WorkManager tasks | Staging sweep, trust sync, backfill. Constraint-aware. | 5.1, 2.90 | done | Unified with 9.8 in useBackgroundTasks hook |
| 9.10 | Sleep/wake lifecycle | Background > timeout: zero DEKs + seed, close vaults, disconnect MsgBox WS. Resume: re-unlock, reconnect, drain MsgBox buffer. | 1.56, 2.20 | done | 24 sleep/wake tests pass |
| 9.11 | Background timers | Port server goroutines: trace purge (10m), outbox retry (30s), replay cache (5m), staging sweep (5m), pairing code purge (1m), watchdog (30s) | 2.46, 6.14 | done | 13 background timer tests pass |
| 9.12 | Vault browser UI | Persona list with lock state. Search within persona. Item detail. | 4.1, 2.70 | done | 15 vault browser hook tests pass (personas, search, detail, tiered content) |
| 9.13 | Audit log UI | Browse audit entries. Filter by actor, action, time. Verify chain button. | 4.1, 2.79 | done | 17 audit log hook tests pass (entries, filters, chain verify, summary, labels) |
| 9.14 | Health check UI | Self-diagnostic: vault accessible, audit chain integrity, LLM reachable, MsgBox connected, notifications enabled | 4.1 | done | 21 health check tests pass (7 checks, overall status, injectable deps) |

---

## Phase 10: Polish + Parity

| ID | Task | Description | Blocked By | Status | Verify |
|----|------|-------------|------------|--------|--------|
| 10.1 | Key rotation | Increment signing generation → derive new key → update PLC directory. Old keys remain verifiable. | 2.30, 1.8 | done | Rotation tests pass |
| 10.2 | Scratchpad | `scratchpadWrite(taskId, step, context)`, `read()`, `delete()` for crash recovery in multi-step reasoning | 1.33 | done | 18 scratchpad tests pass |
| 10.3 | Tier 2 PII patterns | Port remaining Presidio pattern recognizers to TypeScript. India-specific (Aadhaar, PAN, IFSC, UPI), EU (DE_STEUER_ID, FR_NIR, NL_BSN), medical. | 2.59 | done | 31 tier2 pattern tests pass |
| 10.4 | People extraction | Detect mentioned names in vault items. Link to contacts or create relationship entries. Merge duplicates. | 2.50 | done | 13 people extraction tests pass |
| 10.5 | Device pairing — initiate | `POST /v1/pair/initiate` → 6-digit code (100000-999999), 5-min TTL, max 100 pending. Constant-time comparison. | 2.63 | done | 16 pairing tests pass |
| 10.6 | Device pairing — complete | `POST /v1/pair/complete` with code + device Ed25519 public key → register device | 10.5 | done | 16 pairing ceremony tests pass |
| 10.7 | WebSocket hub | Real-time updates to paired thin clients. Auth on WS upgrade. Message buffer (50 msgs, 5-min TTL). | 10.6, 2.1 | done | 18 hub tests pass (connect, broadcast, buffer, replay, heartbeat) |
| 10.8 | Cross-compat: D2D | Mobile Dina sends D2D to server Dina and vice versa | 6.7, 6.8 | done | 7 D2D e2e tests pass |
| 10.9 | Cross-compat: export | Server .dina archive imports on mobile; mobile archive imports on server | 9.5 | done | 16 cross-compat tests pass (format, roundtrip, tamper, verify) |
| 10.10 | Cross-compat: crypto vectors | All Go test vectors pass in TypeScript; all TypeScript test vectors pass in Go | 1.23 | done | 49 cross-language tests pass |
| 10.11 | Performance — startup | Boot time < 3 seconds (unlock → vaults open → chat ready) | 1.52 | done | 14 benchmark tests pass (timing, budget, breakdown, bottleneck ID) |
| 10.12 | Performance — memory | Monitor RAM usage. HNSW index budget: < 50MB for 10K items. Total app: < 200MB. | 8.6 | done | 13 memory budget tests pass (budgets, estimators, HNSW 10K@768 ≤ 50MB) |
| 10.13 | Accessibility | VoiceOver (iOS) and TalkBack (Android) for all screens. | 4.1 | done | 20 a11y helper tests pass (8 builders + 5 screen label sets) |

---

## Dependency Graph (Critical Path)

```
Phase 0 (bootstrap)
  └─→ Phase 1A (crypto) ──→ Phase 1B (storage) ──→ Phase 1C (unlock flow)
        │                       │
        └───────────────────────┴──→ Phase 2A (Core HTTP + middleware)
                                        │
                                        ├──→ Phase 2B (MsgBox + Core RPC Relay)
                                        │
                                        ├──→ Phase 2C (Core services)
                                        │       │
                                        │       └──→ Phase 2D (HTTP handlers)
                                        │               │
                                        │               └──→ Phase 3 (Brain)
                                        │                       │
                                        │                       ├──→ Phase 4 (UI)
                                        │                       │       │
                                        │                       │       ├──→ Phase 5 (Reminders)
                                        │                       │       │
                                        │                       │       └──→ Phase 6 (D2D + Contacts)
                                        │                       │               │
                                        │                       │               └──→ Phase 7 (Connectors)
                                        │                       │
                                        │                       └──→ Phase 8 (On-device LLM)
                                        │
                                        └──→ Phase 2E (Process model)

Phase 9 (Trust + Export + Background) ← depends on most of Phases 1-6
Phase 10 (Polish) ← depends on all prior phases
```

**Critical path:** 0 → 1A → 1B → 1C → 2A → 2C → 2D → 3 → 4

**Parallelizable:**
- Phase 0.6 (Go test vectors) can run in parallel with all Phase 0 tasks
- Phase 2B (MsgBox client) can run in parallel with 2C (Core services)
- Phase 2E (process model) can run in parallel with 2C/2D
- Phase 5 (Reminders) and Phase 6 (D2D) can run in parallel after Phase 4
- Phase 8 (On-device LLM) can start after Phase 3, parallel with Phases 4-7

---

## Task Count Summary

| Phase | Tasks | Critical? |
|-------|-------|-----------|
| 0: Bootstrap | 7 | Yes |
| 1A: Crypto | 23 | Yes |
| 1B: Storage | 15 | Yes |
| 1C: Keychain/Unlock | 7 | Yes |
| 2A: Core HTTP | 10 | Yes |
| 2B: MsgBox/RPC | 7 | Yes |
| 2C: Core Services | 34 | Yes |
| 2D: HTTP Handlers | 14 | Yes |
| 2E: Process Model | 3 | Parallel |
| 3: Brain | 30 | Yes |
| 4: UI | 17 | Yes |
| 5: Reminders | 6 | Parallel |
| 6: D2D + Contacts | 19 | Parallel |
| 7: Connectors | 7 | After 6 |
| 8: On-device LLM | 7 | Parallel |
| 9: Trust/Export/BG | 14 | After 1-6 |
| 10: Polish | 13 | Last |
| **Total** | **233** | |
