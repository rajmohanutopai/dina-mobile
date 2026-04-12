# Dina Mobile — Test Plan

> The server Dina has ~3,300+ tests across 200+ files. These are our strongest
> asset for preventing architectural drift. This plan classifies the test
> inventory into three categories, defines the fixture extraction strategy,
> and specifies how TypeScript implementations prove equivalence before
> features are built.
>
> **Caveat:** This classification is best-effort. The server codebase is
> actively developed. New tests may appear that are not yet catalogued here.
> The classification process should be re-run before each implementation
> phase begins.
>
> **Principle:** The Go/Python tests ARE the specification. If the TypeScript
> implementation passes the same test vectors, it is correct. If it doesn't,
> it is wrong — regardless of what the docs say.

---

## 1. Test Classification

Every server test falls into one of three buckets:

### Category A: Port Exactly (Must-Match Fixtures)

Tests whose inputs and expected outputs define a **cross-language contract**.
The TypeScript implementation must produce bit-identical results for the same
inputs. These are extracted as JSON fixture files and run in both Go and
TypeScript CI.

**Scope:**
- Crypto derivation (SLIP-0010, HKDF, Argon2id, AES-GCM, BIP-39)
- Ed25519 signing/verification (canonical payloads, signatures, public keys)
- DID generation and document structure
- D2D message encode/decode/verify (NaCl seal, signature, JSON structure)
- PII scrubber behavior (Tier 1 regex — same patterns, same inputs, same outputs)
- Policy/gatekeeper decisions (same intent → same SAFE/MODERATE/HIGH/BLOCKED)
- Persona/vault lifecycle semantics (tier enforcement, lock/unlock, DEK derivation)
- Staging pipeline state machine (received → classifying → stored/pending_unlock/failed)
- Request auth canonicalization (canonical payload → signature → verify)
- Trust record serialization/verification
- Audit log hash chain computation

### Category B: Port as Contract/Integration Tests

Tests that verify cross-component behavior or API contracts. The exact
assertion values may differ (different HTTP library, different process model)
but the **behavioral contract** must be preserved.

**Scope:**
- Core↔Brain API behavior (request/response schemas, error codes, auth flow)
- Schema migrations (identity_001, identity_002, persona_001 — table structure)
- Export/import compatibility (.dina archive format)
- Task queue semantics (state machine, retry, dead-letter)
- Reminder behavior (creation, dedup, firing, recurring)
- Pairing/auth flows (code generation, completion, device registration)
- LLM router decision tree (same routing logic, different provider SDKs)
- Guardian silence classification (same priority assignment logic)
- Staging processor lifecycle (claim, classify, enrich, resolve, sweep)
- Entity vault pattern (ephemeral scrub/rehydrate, never persist)
- Nudge assembly logic (same vault context → same nudge output)

### Category C: Do Not Port (Server-Only)

Tests tied to server deployment, Go/Python-specific patterns, or channels
that don't exist on mobile.

**Scope:**
- Go-specific concurrency tests (goroutine leak detection, race conditions)
- Docker/network/topology tests (container health, Docker Compose, port binding)
- Telegram channel tests (bot commands, message parsing, group handling)
- Admin HTML/web UI tests (login page rendering, cookie auth, CSRF)
- Bluesky channel tests (DM parsing, PDS publisher)
- Voice processing tests (Deepgram integration)
- Home-node inbound networking assumptions (direct HTTPS, IP-based rate limiting)
- Process supervision tests that depend on Linux/container behavior
- Install/deploy tests (installer wizard, Docker setup, startup modes)
- Python-specific refactoring guards (import checks, module isolation)
- Go interface compliance checks (`iface_check_test.go`)

---

## 2. Server Test Inventory — Working Classification

### 2.1 Core (Go) — 1,420 tests across 65 files

#### Category A: Port Exactly (extract fixtures)

| File | Tests | What to Extract |
|------|-------|-----------------|
| `crypto_test.go` | ~89 | **SLIP-0010**: seed → derived keys at all paths. **HKDF**: seed + persona → DEK. **Argon2id**: passphrase + salt → KEK. **AES-GCM**: wrap/unwrap round-trips. **Ed25519**: sign/verify pairs. **Key conversion**: Ed25519 → X25519. |
| `crypto_adversarial_test.go` | ~9 | All-zero seed rejection, short seed rejection, forbidden BIP-44 path, non-hardened path rejection |
| `signature_test.go` | ~26 | Canonical payload construction, signature hex encoding, timestamp RFC3339 validation, nonce replay rejection |
| `transport_d2d_sig_test.go` | ~17 | D2D envelope JSON structure, NaCl seal/unseal round-trips, signature on plaintext before encryption |
| `d2d_v1_domain_test.go` | ~30 | V1 message family validation, type→vault_item_type mappings, presence.signal never-stored invariant |
| `d2d_v1_protocol_test.go` | ~17 | Contact gate enforcement, scenario policy checks, egress 4-gate sequencing |
| `pii_test.go` | ~15 | Regex pattern matches: credit card (Luhn), phone, email, SSN, Aadhaar, PAN, IFSC, UPI, IP (octet validation). Overlap removal. Type numbering. |
| `pii_handler_test.go` | varies | Scrub/rehydrate round-trips with known PII text |
| `gatekeeper_test.go` | ~75 | Intent → risk level mapping (SAFE/MODERATE/HIGH/BLOCKED). Brain-denied actions. Sharing tier enforcement. |
| `gatekeeper_adversarial_test.go` | ~20 | Edge cases: unknown trust level, mixed policies, cascading denials |
| `vault_test.go` | ~50 | Vault lifecycle: open with DEK → store → FTS search → delete. Persona tier enforcement. Batch semantics. |
| `identity_test.go` | ~20 | DID creation from seed, DID document structure, key rotation generation tracking |
| `identity_deterministic_test.go` | varies | Same seed → same DID (determinism proof) |
| `staging_inbox_test.go` | ~20 | State machine: received→classifying→stored/pending_unlock/failed. Dedup. Lease mechanics. Sweep. |
| `trust_test.go` | ~15 | Trust level assignment, sharing tier enforcement, trust cache semantics |
| `source_trust_test.go` | varies | Source trust classification: self, contact_ring1, unknown, marketing |
| `tiered_content_test.go` | varies | L0/L1/L2 progressive loading logic |
| `portability_test.go` | varies | Export/import archive format, per-persona backup structure |
| `auth_test.go` (partial) | ~30 | Ed25519 auth canonical payload, timestamp window, nonce cache. **NOT** session/cookie/CSRF parts. |
| `authz_test.go` | ~10 | Per-service authorization matrix (Brain yes/no, Admin yes/no per endpoint) |
| `ratelimit_test.go` | varies | Rate limit bucket mechanics (portable as per-DID logic) |

**Estimated Category A tests from Core: ~510**

#### Category B: Port as Contract Tests

| File | Tests | Contract to Port |
|------|-------|------------------|
| `apicontract_test.go` | ~16 | Request/response schemas, JSON wire format, error response structure |
| `brainclient_test.go` | ~23 | Brain→Core HTTP client behavior: retry semantics, error classification, circuit breaker |
| `server_test.go` | varies | Health endpoint behavior, startup validation |
| `taskqueue_test.go` | varies | Task state machine: pending→running→completed/failed/dead_letter |
| `pairing_test.go` | varies | 6-digit code generation, TTL, completion flow, device registration |
| `session_handler_test.go` | varies | Session start/end, grant lifecycle |
| `approval_preview_test.go` | ~4 | Approval request creation, preview content |
| `errors_test.go` | ~10 | Error type hierarchy, error response format |
| `config_test.go` | ~18 | Configuration loading (adapt for mobile env) |
| `notify_test.go` | varies | Notification priority mapping |
| `d2d_phase2_test.go` | ~22 | Outbox retry semantics, exponential backoff |
| `transport_test.go` | ~30 | Message delivery retry, dead drop drain, DID resolution caching |
| `transport_adversarial_test.go` | varies | Adversarial transport (port scenarios, adapt infrastructure) |
| `ws_test.go` | varies | WebSocket message framing (port for paired-device WS hub, Phase 10) |
| `fix_verification_*.go` | ~38 | Cross-subsystem integration fixes (port the behavioral assertions) |
| `vault_test.go` (remaining) | varies | Cross-persona queries, audit log integration |
| `wiring_test.go` | varies | Composition root validation (adapt for TS bootstrap) |
| `onboarding_test.go` (partial) | ~7 | Portable parts: seed client-side, root keypair derivation, DEKs derived, password wraps seed, one default persona, mnemonic deferred, sharing rules default empty |
| `pds_test.go` (partial) | ~5 | Attestation record signing, lexicon validation, rating range enforcement — portable as PDS publish contract tests (mobile publishes to PDS) |
| `pending_reason_test.go` | ~15 | Approval lifecycle: create→resume→complete/deny, caller binding, sweep expiry — portable as approval contract |

**Estimated Category B tests from Core: ~330**

#### Category B+: Watchdog Recovery Contract Tests (NEW — replace dropped watchdog_test.go)

The server `watchdog_test.go` tests Go-goroutine-specific supervision and is
Category C. However, the recovery behaviors it verifies are needed on mobile
(TASKS.md:357). These must be re-created as explicit contract tests:

| Contract | Source Behavior | Mobile Test |
|----------|----------------|-------------|
| Task timeout reset | Running task past timeout_at → reset to pending, retry_count++ | `task_recovery.test.ts` |
| Dead-letter transition | retry_count > max_attempts → status=dead_letter | `task_recovery.test.ts` |
| Staging lease expiry | classifying + lease_until < now → revert to received | `staging_sweep.test.ts` |
| Staging retry cap | retry_count > 3 → dead-lettered, not requeued | `staging_sweep.test.ts` |
| Crash log cleanup | Entries older than 90 days → purged | `audit_cleanup.test.ts` |
| Audit log retention | Entries older than 90 days → purged | `audit_cleanup.test.ts` |
| Background timer semantics | Timers fire at interval when active, stop when backgrounded | `background_timers.test.ts` |

#### Category C: Do Not Port

| File | Tests | Why Not |
|------|-------|---------|
| `auth_test.go` (partial) | ~30 | Session/cookie/CSRF tests — no web browser on mobile |
| `adminproxy_test.go` | ~5 | Admin web proxy — replaced by native UI |
| `telegram_access_test.go` | varies | Telegram-specific |
| `bot_test.go` | ~5 | Bot interface — replaced by Chat UI |
| `logging_test.go` | varies | Go-specific structured logging |
| `observability_test.go` | varies | Go-specific metrics/tracing |
| `watchdog_test.go` | varies | Go goroutine-based watchdog — **recovery behaviors ported as contract tests above** |
| `sync_test.go` | varies | Device sync — server-specific topology |
| `estate_test.go` | ~11 | Digital estate — deferred feature |
| `deferred_test.go` | ~26 | Future features |
| `security_test.go` (partial) | varies | Go-specific memory/concurrency security |
| `/internal/adapter/*_test.go` | ~6 | Go interface compliance checks |
| `onboarding_test.go` (partial) | ~7 | Server-specific: managed onboarding, convenience mode, Brain starts guardian, initial MCP sync, databases created |
| `pds_test.go` (partial) | ~16 | Server-specific PDS infrastructure: Merkle repo, type A/B PDS, tombstone propagation, bot lexicon |
| `pending_reason_test.go` (SQLite-specific) | varies | Go-specific SQLite adapter tests (behavior ported in Category B above) |

**Estimated Category C tests from Core: ~600**

---

### 2.2 Brain (Python) — 327 tests across 37 files

#### Category A: Port Exactly

| File | Tests | What to Extract |
|------|-------|-----------------|
| `test_pii.py` | ~52 | PII patterns, Entity Vault behavior, India/EU recognizers, safe whitelist, Faker replacement |
| `test_trust_scorer.py` | ~17 | Trust scoring rules: self, contact, service, unknown, marketing. Sender matching. |
| `test_tier_classifier.py` | ~7 | Vault item type → tier classification (Tier 1 vs Tier 2). Exhaustiveness. |
| `test_enrichment.py` | ~9 | L0 deterministic generation, L0/L1 field structure, trust caveats |
| `test_contact_matcher.py` | ~11 | Name matching: case-insensitive, word boundary, longest-first, dedup |
| `test_subject_attributor.py` | ~17 | Subject attribution: self, contact, household, third party, unresolved |
| `test_event_extractor.py` | ~7 | Temporal event extraction: invoice, appointment, birthday, payload format |

**Estimated Category A tests from Brain: ~120**

#### Category B: Port as Contract Tests

| File | Tests | Contract to Port |
|------|-------|------------------|
| `test_api.py` | ~27 | Brain API endpoint contracts: /healthz, /v1/process, /v1/reason, /v1/pii/scrub |
| `test_auth.py` | ~18 | Brain auth behavior: service key validation, subapp isolation |
| `test_core_client.py` | ~16 | Core HTTP client: retry, error classification, timeout, PII scrub |
| `test_guardian.py` | ~42 | Silence classification rules, Anti-Her detection, priority assignment |
| `test_llm.py` | ~40 | LLM router decision tree, provider selection, fallback, cost tracking |
| `test_staging_processor.py` | ~21 | Staging lifecycle: claim, classify, enrich, resolve, failure handling |
| `test_alias_support.py` | ~25 | Alias matching, precedence, staging override, recall hints |
| `test_scratchpad.py` | ~13 | Checkpoint/resume lifecycle, expiration, multi-task independence |
| `test_routing.py` | ~12 | Task routing: local LLM, MCP agent, trust-based selection |
| `test_sync.py` | ~42 | Sync engine: scheduling, 2-pass filtering, bulk ingestion |
| `test_embedding.py` | ~7 | Embedding generation: local/cloud fallback, storage |
| `test_mcp.py` | ~20 | MCP agent delegation, safety gates, query sanitization |
| `test_config.py` | ~12 | Configuration loading (adapt for mobile env) |
| `test_resilience.py` | ~9 | Error handling, graceful degradation, startup dependency |
| `test_crash.py` | ~8 | Crash traceback safety, no PII in logs |
| `test_persona_registry.py` | ~7 | Persona loading, alias resolution, cache behavior |
| `test_vault_context.py` | ~15 | Tool execution, reasoning agent, context assembly |
| `test_fix_verification.py` | ~29 | Cross-subsystem behavioral fixes |
| `test_staging_responsibility.py` | ~9 | Responsibility override for sensitive personas |
| `test_silence.py` | ~30 | Advanced silence classification (overlaps with test_guardian.py) |

| `test_pipeline_safety.py` | ~9 | Pipeline safety: no outbound MCP tools in reader, structured sender output, disallowed tool rejection, Tier 3 queued not interrupted, briefing dedup, briefing crash recovery, connector degradation |
| `test_person_linking.py` | ~23 | Person link extraction (LLM-based), person resolution (surface matching, synonym, dedup), parse validation |

**Estimated Category B tests from Brain: ~194**

#### Category C: Do Not Port

| File | Tests | Why Not |
|------|-------|---------|
| `test_telegram.py` | ~27 | Telegram-specific |
| `test_channel_parity.py` | ~10 | Multi-channel parity (Telegram/Bluesky) |
| `test_admin.py` | ~19 | Admin web API — replaced by native UI |
| `test_admin_html.py` | ~18 | Admin HTML pages — no web UI on mobile |
| `test_voice.py` | ~3 | Deepgram integration — deferred |
| `test_deferred.py` | ~25 | Future features |
| `test_refactoring_guards.py` | ~8 | Python-specific module guards |
| `test_pipeline_safety.py` (partial) | ~3 | Connector tracker tests (OpenClaw/Telegram-specific degradation tracking) |

**Estimated Category C tests from Brain: ~113**

---

### 2.3 CLI (Python) — ~80 tests across 10 files

> The original plan dropped CLI tests wholesale as server-only. This was
> wrong — the mobile architecture depends on dina-cli as an off-device client
> via Core RPC Relay (ARCHITECTURE.md Section 19). CLI signing, session, and
> task behaviors define the contract that the Core RPC Relay must satisfy.

#### Category A: Port Exactly (client-side crypto)

| File | Tests | What to Extract |
|------|-------|-----------------|
| `cli/tests/test_signing.py` | 14 | Ed25519 keypair generation, DID format (`did:key:z6Mk`), DID determinism, multibase roundtrip, `sign_request()` canonical payload + verification, empty body handling |

**Estimated Category A tests from CLI: ~14**

#### Category B: Port as Contract Tests

| File | Tests | Contract to Port |
|------|-------|------------------|
| `cli/tests/test_session.py` | 6 | Session ID format, PII entity save/load, rehydration, atomic write |
| `cli/tests/test_task.py` | ~5 | Task validation: research intent, denied task → no call, dry-run, session lifecycle (start/end in finally) |
| `cli/tests/test_client.py` (partial) | ~7 | Connection error handling, auth error, signing headers set, no bearer on Core, body extraction (JSON, string, empty) |

**Estimated Category B tests from CLI: ~18**

#### Category C: Do Not Port

| File | Tests | Why Not |
|------|-------|---------|
| `cli/tests/test_client.py` (partial) | ~6 | Vault store/query/kv via Python client — server-specific HTTP calls |
| `cli/tests/test_commands.py` | varies | Python CLI command parsing — replaced by native Chat UI |
| `cli/tests/test_openclaw.py` | varies | OpenClaw subprocess management — runs on laptop, not mobile |
| `cli/tests/test_runner.py` | varies | Python CLI runner — not on mobile |
| `admin-cli/tests/*` | ~81 | Admin CLI — not on mobile |

**Estimated Category C tests from CLI: ~120**

---

### 2.4 Integration/E2E/Release/Install — ~900 tests

#### Category A: Port Exactly (root-level crypto/auth tests)

> **Path correction:** These files live at `tests/` (project root), NOT
> `tests/integration/`. The earlier version of this plan had wrong paths.

| Suite | Tests | What to Extract |
|-------|-------|-----------------|
| `tests/test_signing.py` | 26 | Verdict canonicalization (sorted keys, compact JSON, excluded fields), Ed25519 sign/verify round-trip, deterministic signing, tampered data/signature detection |
| `tests/test_did_key.py` | 20 | `did:key:z6Mk` format, multibase encoding, multicodec prefix 0xed01, 32-byte pubkey payload, deterministic DID, DID Document structure (W3C compliant) |
| `tests/test_did_models.py` | 9 | W3C DID Document schema: publicKeyMultibase alias, @context, verificationMethod camelCase, JSON roundtrip |
| `tests/test_identity.py` | 19 | Ed25519 keypair generation, PEM files, 32-byte keys, sign/verify, deterministic signatures, identity reload stability |
| `tests/test_models.py` | 19 | ProductVerdict with signature fields, canonical JSON excludes signature, confidence 0-100 range, JSON roundtrip |
| `tests/test_memory_integration.py` | 21 | Signed verdict storage, signature metadata roundtrip, upsert idempotency, semantic search across signed/unsigned |

**Estimated Category A from root tests: ~114**

#### Category B: Port as Contract Tests

| Suite | Tests | Contract to Port |
|-------|-------|------------------|
| `tests/test_chat_integration.py` | ~34 | DID Document printing, signed verdict verification, tampered signature detection, history with signed indicators, vault publish, command routing |
| `tests/test_providers.py` | ~34 | LLM provider spec parsing, light/heavy model routing, embed provider inference, video analysis capability detection, status lines |
| `tests/test_vault.py` | ~17 | CeramicVault: disabled behavior, health check, publish/index, persistence, status messages |
| `tests/integration/test_audit.py` | varies | Audit log append/query/verify chain |
| `tests/integration/test_async_approval.py` | varies | Approval lifecycle: create → approve/deny → drain |
| `tests/integration/test_anti_her.py` | varies | Anti-Her detection and redirect |
| `tests/integration/test_delegation.py` | ~7 | Agent delegation: detect task, suggest delegation, user approves, read-only auto-approved, write requires approval, financial always HIGH, scope limited |
| `tests/integration/test_didcomm.py` (partial) | ~3 | X25519 key exchange, friend/seller sharing rules, cryptographic sharing enforcement |
| `tests/integration/test_whisper.py` | ~6 | Context assembly: conversation context, meeting prep, silence tier respect, interrupted conversation, social cue awareness |
| `tests/integration/test_trust_rings.py` (partial) | ~2 | Transaction limits for unverified, larger transactions for Ring 2 (gatekeeper contract) |
| `tests/integration/test_client_sync.py` | ~11 | Device sync: initial checkpoint, realtime push, offline queue, local cache, corruption recovery, authenticated-only, QR pairing |
| `tests/integration/test_dina_to_dina.py` | ~15 | D2D P2P: arrival notification, context recall, E2E encryption, mutual auth, reject unknown DID, buyer/seller persona isolation, trust network consulted |
| `tests/integration/test_memory_flows.py` | ~11 | Memory persistence, encrypted at rest, semantic search, raw memory never sent to bots, deletion permanent, persona isolation, calendar/chat ingestion |
| `tests/integration/test_trust_network.py` | ~14 | Attestation signing, multiple experts, outcome tracking, anonymization, trust scoring, auto-routing, PDS cannot forge records |
| `tests/integration/test_contract_wire_format.py` (partial) | ~5 | D2D correlation ID embedding, trust tool patterns (portable as wire-format contracts) |
| `tests/system/user_stories/*` (partial) | ~50 | Purchase journey, persona wall, agent gateway — portable as behavioral contracts |
| `tests/release/test_rel_003_vault_persistence.py` | varies | Vault data survives restart |
| `tests/release/test_rel_004_locked_state.py` | varies | Locked persona stays locked |
| `tests/release/test_rel_005_recovery.py` | varies | Mnemonic recovery restores identity |
| `tests/release/test_rel_009_persona_wall.py` | varies | Persona tier enforcement end-to-end |
| `tests/e2e/test_suite_11_multi_device.py` | 6 | Real-time multi-device push, offline sync reconciliation, thin/rich client behavior, cache corruption recovery, heartbeat stale cleanup |
| `tests/e2e/test_suite_15_cli_signing.py` | 8 | CLI keypair generation, pairing via multibase, signed staging ingest, tampered/expired/unpaired rejection, bearer fallback |

**Estimated Category B from integration/root/E2E: ~340**

#### Category C: Do Not Port

| Suite | Tests | Why Not |
|-------|-------|---------|
| `tests/e2e/*` (most) | ~118 | Multi-node Docker orchestration (except suites 11, 15) |
| `tests/e2e/test_suite_16_at_protocol_pds.py` | 7 | PDS Docker container health/registration — server infra |
| `tests/install/*` | ~120 | Linux/Docker install flows |
| `tests/release/` (most) | ~90 | Docker-based release verification |
| `tests/test_bootstrap.py` | ~21 | Shell install script verification — Docker/system infra |
| `tests/integration/test_chaos.py` | varies | Network fault injection via iptables |
| `tests/integration/test_crash_recovery.py` | varies | Container crash recovery |
| `tests/integration/test_compliance.py` | varies | Server compliance checks |
| `tests/integration/test_contract_wire_format.py` (most) | ~14 | Server-to-server wire format (ReminderFired, BotResponse, ConfirmResponse) |
| `tests/integration/test_didcomm.py` (most) | ~15 | Server P2P networking: direct connection, NAT relay, social/commerce/identity message routing, offline queueing |
| `tests/integration/test_trust_rings.py` (most) | ~21 | Trust ring scoring internals (ZKP, credentials, time factor, composite calculation) — AppView backend |
| `tests/integration/test_delegation.py` (partial) | ~3 | Server-specific: agent executes with oversight, completion reported, failure handled |
| `tests/sanity/*` | ~9 | Telegram sanity checks |

**Estimated Category C from integration: ~570**

---

### 2.5 AppView (TypeScript) — 627 tests

#### Category B: Port as Contract Tests

| Suite | Tests | Contract to Port |
|-------|-------|------------------|
| `unit/01-scorer-algorithms.test.ts` | 77 | Trust score formula, reviewer quality, sentiment aggregation |
| Trust record serialization tests | varies | AT Protocol record format, Zod schemas |

**Note:** AppView is a server-side component. Mobile is a read-only client.
Most AppView tests verify Ingester/Scorer/Web daemons that don't run on
mobile. Only trust score calculation and record serialization tests are
portable.

**Estimated Category B from AppView: ~80**
**Estimated Category C from AppView: ~547**

---

## 3. Summary Classification

| Category | Core | Brain | CLI | Root/Integ/E2E | AppView | Total |
|----------|------|-------|-----|----------------|---------|-------|
| **A: Port Exactly** | ~510 | ~120 | ~14 | ~114 | — | **~758** |
| **B: Port as Contract** | ~330 | ~194 | ~18 | ~340 | ~80 | **~962** |
| **B+: New Contract** | ~7 | — | — | — | — | **~7** |
| **C: Do Not Port** | ~600 | ~113 | ~120 | ~460 | ~547 | **~1,840** |
| **Total** | ~1,447 | ~427 | ~152 | ~914 | ~627 | **~3,567** |

**~1,727 tests to port** (758 exact + 962 contract + 7 new recovery
contracts). This is the mobile test suite target.

**Notable corrections:**
- Root-level `tests/*.py` files (signing, did_key, did_models, identity,
  models, memory_integration) now have correct paths and are classified
  as Category A (~114 tests) — these are pure crypto/auth tests
- `tests/test_chat_integration.py` (~34 tests), `tests/test_providers.py`
  (~34 tests), `tests/test_vault.py` (~17 tests) added as Category B
- Integration suites `test_client_sync.py`, `test_dina_to_dina.py`,
  `test_memory_flows.py`, `test_trust_network.py`, `test_contract_wire_format.py`
  classified with partial A/B/C splits
- E2E `test_suite_15_cli_signing.py` (8 tests) classified as Category B
- `test_bootstrap.py` (21 tests) classified as Category C (shell/Docker)
- `test_suite_16_at_protocol_pds.py` (7 tests) classified as Category C
  (PDS Docker infra)
- CLI signing/session/task tests reclassified from C→A/B
- Brain `test_pipeline_safety.py` and `test_person_linking.py` added
- Core `onboarding_test.go`, `pds_test.go`, `pending_reason_test.go` classified
- Watchdog recovery behaviors extracted as 7 new contract tests (B+)

---

## 4. Fixture Extraction Strategy

### 4.1 What Fixtures Are

A fixture is a JSON file containing:
```json
{
  "description": "SLIP-0010 root signing key derivation",
  "source_test": "core/test/crypto_test.go:TestCrypto_2_2_DeriveRootIdentityKey",
  "inputs": {
    "seed_hex": "408b285c12383600...",
    "path": "m/9999'/0'/0'"
  },
  "expected": {
    "private_key_hex": "a1b2c3...",
    "public_key_hex": "d4e5f6...",
    "chain_code_hex": "789abc..."
  }
}
```

The fixture is generated by running the Go test and capturing I/O. The
TypeScript test loads the same fixture and asserts identical outputs.

### 4.2 Fixture Categories

| Category | Fixtures | Source |
|----------|----------|--------|
| **Crypto: BIP-39** | Mnemonic ↔ seed, validation | `fixtures.go:TestMnemonicSeed` |
| **Crypto: SLIP-0010** | seed → key at every derivation path (root, 5 personas, rotation, service) | `crypto_test.go` |
| **Crypto: HKDF** | seed + persona → DEK for all 11 persona names in `HKDFInfoStrings` | `fixtures.go:HKDFInfoStrings` |
| **Crypto: Argon2id** | passphrase + salt → KEK (128MB/3/4) | `crypto_test.go` |
| **Crypto: AES-GCM** | KEK + seed → wrapped blob → unwrap recovers seed | `crypto_test.go` |
| **Crypto: Ed25519** | message + privkey → signature; signature + pubkey → verify | `signature_test.go` |
| **Crypto: NaCl** | plaintext + recipient pubkey → sealed box → unseal with privkey | `transport_d2d_sig_test.go` |
| **Crypto: Key Convert** | Ed25519 pubkey → X25519 pubkey | `crypto_test.go` |
| **Auth: Canonical Payload** | method + path + query + timestamp + nonce + body → canonical string → signature | `signature_test.go` |
| **Auth: Timestamp** | RFC3339 timestamps within/outside 5-min window | `auth_test.go` |
| **Identity: DID** | seed → did:plc string; seed → DID document JSON | `identity_test.go` |
| **D2D: Envelope** | DinaMessage JSON → sign → seal → unseal → verify → parse | `d2d_v1_domain_test.go` |
| **D2D: Message Types** | All V1 family type strings, storage mappings | `d2d_v1_domain_test.go` |
| **PII: Patterns** | Input text → detected PII matches (type, start, end) → scrubbed output | `pii_test.go` |
| **PII: Entity Vault** | Scrub → token map → rehydrate round-trip | Brain `test_pii.py` |
| **Gatekeeper: Intents** | action + trust level → SAFE/MODERATE/HIGH/BLOCKED | `gatekeeper_test.go` |
| **Gatekeeper: Brain-Denied** | did_sign/did_rotate/vault_backup/persona_unlock/seed_export → always BLOCKED | `gatekeeper_test.go` |
| **Vault: Lifecycle** | Persona tier → auto-open/requires-approval/requires-passphrase/denied | `vault_test.go` |
| **Staging: State Machine** | Status transitions + conditions (claim, resolve, fail, sweep) | `staging_inbox_test.go` |
| **Trust: Scoring** | sender + source → sender_trust + confidence + retrieval_policy | Brain `test_trust_scorer.py` |
| **Silence: Classification** | Event attributes → priority tier (1/2/3) | Brain `test_guardian.py` |
| **L0: Deterministic** | Item metadata → L0 string | Brain `test_enrichment.py` |
| **Schema: Identity** | Table definitions from `identity_001.sql` + `identity_002_trust_cache.sql` | Schema files |
| **Schema: Persona** | Table definitions from `persona_001.sql` | Schema files |
| **Export: Archive** | Archive structure, encryption, per-persona backup format | `portability_test.go` |
| **Audit: Hash Chain** | Sequence of entries → prev_hash → entry_hash chain | `traceability_test.go` |

### 4.3 Extraction Process

**Step 1: Build fixture extractor** (Go program)
```
cd core && go test -run TestFixtureExport -v -count=1 > fixtures.json
```

Modify key test functions to emit JSON fixtures alongside assertions. This
is a one-time effort that produces a `fixtures/` directory:

```
fixtures/
  crypto/
    bip39_mnemonic_to_seed.json
    slip0010_root_signing_key.json
    slip0010_persona_keys.json
    slip0010_rotation_key.json
    hkdf_persona_deks.json
    argon2id_kek.json
    aesgcm_wrap_unwrap.json
    ed25519_sign_verify.json
    nacl_seal_unseal.json
    key_convert_ed25519_x25519.json
  auth/
    canonical_payload.json
    timestamp_validation.json
    nonce_replay.json
  identity/
    seed_to_did.json
    did_document.json
  d2d/
    v1_message_types.json
    envelope_round_trip.json
    egress_gate_decisions.json
  pii/
    regex_patterns.json
    scrub_rehydrate.json
  gatekeeper/
    intent_decisions.json
    brain_denied_actions.json
    sharing_tier_enforcement.json
  vault/
    persona_tier_lifecycle.json
  staging/
    state_transitions.json
  trust/
    scoring_rules.json
  silence/
    priority_classification.json
  schema/
    identity_001.sql
    identity_002_trust_cache.sql
    persona_001.sql
  audit/
    hash_chain.json
```

**Step 2: Verify fixtures are stable**

Run fixture extraction twice. Diff the outputs. If any differ, the test has
non-determinism — fix before extracting.

**Step 3: Commit fixtures to the mobile repo**

Fixtures are committed under `packages/fixtures/` and imported by both
Go (for regression) and TypeScript (for equivalence).

---

## 5. TypeScript Test Structure

### 5.1 Directory Layout

```
packages/
  core/
    src/
    __tests__/
      crypto/
        bip39.test.ts          ← Category A (fixture-based)
        slip0010.test.ts       ← Category A
        hkdf.test.ts           ← Category A
        argon2id.test.ts       ← Category A
        aesgcm.test.ts         ← Category A
        ed25519.test.ts        ← Category A
        nacl.test.ts           ← Category A
      auth/
        canonical.test.ts      ← Category A
        middleware.test.ts     ← Category B (contract)
        ratelimit.test.ts     ← Category B
      identity/
        did.test.ts            ← Category A
        rotation.test.ts      ← Category B
      vault/
        lifecycle.test.ts     ← Category A
        crud.test.ts          ← Category B
        fts5.test.ts          ← Category B
      staging/
        state_machine.test.ts ← Category A
        ingest.test.ts        ← Category B
        sweep.test.ts         ← Category B
      gatekeeper/
        intent.test.ts        ← Category A
        egress.test.ts        ← Category A
        adversarial.test.ts   ← Category A
      pii/
        patterns.test.ts      ← Category A
        scrub.test.ts         ← Category A
      d2d/
        envelope.test.ts      ← Category A
        families.test.ts      ← Category A
        gates.test.ts         ← Category A
      transport/
        outbox.test.ts        ← Category B
        deaddrop.test.ts      ← Category B
      contact/
        directory.test.ts     ← Category B
        sharing.test.ts       ← Category A
      approval/
        lifecycle.test.ts     ← Category B
      relay/
        rpc_envelope.test.ts  ← NEW (mobile-specific)
        identity_binding.test.ts ← NEW
      handlers/
        vault_handler.test.ts ← Category B
        staging_handler.test.ts ← Category B
        ...
  brain/
    src/
    __tests__/
      llm/
        router.test.ts        ← Category B
        providers.test.ts     ← Category B
      classification/
        domain.test.ts        ← Category B
        persona.test.ts       ← Category B
        silence.test.ts       ← Category A (fixture)
      enrichment/
        l0_deterministic.test.ts ← Category A
        l0l1_llm.test.ts     ← Category B
        embedding.test.ts     ← Category B
      pii/
        entity_vault.test.ts  ← Category A
        tier2_patterns.test.ts ← Category A
        cloud_gate.test.ts    ← Category B
      guardian/
        priority.test.ts      ← Category A (fixture)
        anti_her.test.ts      ← Category B
        guard_scan.test.ts    ← Category B
      staging/
        processor.test.ts     ← Category B
        responsibility.test.ts ← Category B
      trust/
        scorer.test.ts        ← Category A (fixture)
        tier_classifier.test.ts ← Category A
      contact/
        matcher.test.ts       ← Category A (fixture)
        attributor.test.ts    ← Category A
        alias.test.ts         ← Category B
      nudge/
        assembler.test.ts     ← Category B
      scratchpad/
        lifecycle.test.ts     ← Category B
      api/
        process.test.ts       ← Category B
        reason.test.ts        ← Category B
      core_client/
        http.test.ts          ← Category B
        retry.test.ts         ← Category B
  fixtures/
    crypto/
      *.json                   ← Shared test vectors
    auth/
      *.json
    ...
  app/
    __tests__/
      onboarding.test.tsx     ← UI tests (new)
      chat.test.tsx           ← UI tests (new)
      unlock.test.tsx         ← UI tests (new)
```

### 5.2 Category A Test Pattern

```typescript
// crypto/slip0010.test.ts
import fixtures from '../../../fixtures/crypto/slip0010_root_signing_key.json';

describe('SLIP-0010 Root Signing Key', () => {
  for (const vector of fixtures.vectors) {
    it(`derives correct key for ${vector.description}`, () => {
      const seed = hexToBytes(vector.inputs.seed_hex);
      const { privateKey, chainCode } = derivePath(seed, vector.inputs.path);
      expect(bytesToHex(privateKey)).toBe(vector.expected.private_key_hex);
      expect(bytesToHex(chainCode)).toBe(vector.expected.chain_code_hex);
      // Public key from private
      const publicKey = getPublicKey(privateKey);
      expect(bytesToHex(publicKey)).toBe(vector.expected.public_key_hex);
    });
  }
});
```

**Every Category A test loads a fixture and asserts bit-identical output.**
No implementation logic in the test — only fixture comparison.

### 5.3 Category B Test Pattern

```typescript
// staging/state_machine.test.ts
describe('Staging State Machine', () => {
  let core: CoreTestHarness;

  beforeEach(async () => {
    core = await CoreTestHarness.create(); // in-memory SQLCipher, mock auth
  });

  it('ingest creates received item', async () => {
    const res = await core.post('/v1/staging/ingest', { source: 'gmail', ... });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('received');
  });

  it('claim moves to classifying with 15-min lease', async () => {
    await core.ingestItem();
    const res = await core.post('/v1/staging/claim', { limit: 1 });
    expect(res.body[0].status).toBe('classifying');
    expect(res.body[0].lease_until).toBeGreaterThan(Date.now() / 1000);
  });

  it('resolve to open persona stores', async () => { ... });
  it('resolve to locked persona marks pending_unlock', async () => { ... });
  it('sweep reverts expired leases', async () => { ... });
});
```

**Category B tests verify behavioral contracts — same inputs → same state
transitions — but use the TypeScript implementation directly.**

---

## 6. Implementation Order

The test plan drives the implementation order. **Tests are written before
features** — the fixture proves correctness, the implementation satisfies it.

### Phase 0: Fixture Extraction (BEFORE any TypeScript code)

| # | Task | Output |
|---|------|--------|
| 0.1 | Build Go fixture extractor | `go test -run TestFixtureExport` produces JSON |
| 0.2 | Extract crypto fixtures | `fixtures/crypto/*.json` — all SLIP-0010, HKDF, Argon2id, AES-GCM, Ed25519, NaCl vectors |
| 0.3 | Extract auth fixtures | `fixtures/auth/*.json` — canonical payloads, timestamps, nonces |
| 0.4 | Extract identity fixtures | `fixtures/identity/*.json` — seed→DID, DID document |
| 0.5 | Extract D2D fixtures | `fixtures/d2d/*.json` — envelope round-trips, message types |
| 0.6 | Extract PII fixtures | `fixtures/pii/*.json` — regex matches, scrub/rehydrate |
| 0.7 | Extract gatekeeper fixtures | `fixtures/gatekeeper/*.json` — intent decisions |
| 0.8 | Extract staging fixtures | `fixtures/staging/*.json` — state transitions |
| 0.9 | Extract trust/silence fixtures | `fixtures/trust/*.json`, `fixtures/silence/*.json` |
| 0.10 | Extract schema fixtures | Copy `identity_001.sql`, `identity_002_trust_cache.sql`, `persona_001.sql` verbatim |
| 0.11 | Verify fixture stability | Run extraction twice, diff = zero |
| 0.12 | Commit fixtures to mobile repo | `packages/fixtures/` with README |

### Phase 1: Crypto Tests First

Write ALL Category A crypto tests **before implementing crypto**.
Each test initially fails. Implementation makes them pass one by one.

| # | Test File | Fixture | Passes When |
|---|-----------|---------|-------------|
| 1.1 | `bip39.test.ts` | `bip39_mnemonic_to_seed.json` | `@scure/bip39` produces matching seed |
| 1.2 | `slip0010.test.ts` | `slip0010_*.json` | Derivation at all paths matches Go |
| 1.3 | `hkdf.test.ts` | `hkdf_persona_deks.json` | All 11 persona DEKs match Go |
| 1.4 | `argon2id.test.ts` | `argon2id_kek.json` | KEK matches Go (128MB/3/4) |
| 1.5 | `aesgcm.test.ts` | `aesgcm_wrap_unwrap.json` | Wrap/unwrap round-trip matches |
| 1.6 | `ed25519.test.ts` | `ed25519_sign_verify.json` | Signatures match; cross-verify |
| 1.7 | `nacl.test.ts` | `nacl_seal_unseal.json` | Seal/unseal round-trip works |
| 1.8 | `canonical.test.ts` | `canonical_payload.json` | Same canonical string → same signature |

**Gate:** Phase 1 code is NOT merged until ALL crypto fixture tests pass
with zero failures.

### Phase 2+: Feature Tests Track Features

Each subsequent phase follows the same pattern:
1. Write Category A fixture tests for the phase's domain
2. Write Category B contract tests for the phase's contracts
3. Implement until all tests pass
4. Gate: merge only when all prior + current phase tests pass

---

## 7. Mobile-Specific Tests (New, No Server Equivalent)

| Domain | Test | What It Verifies |
|--------|------|------------------|
| Core RPC Relay | `rpc_envelope.test.ts` | Request envelope wrapping, NaCl sealing, inner Ed25519 auth |
| Core RPC Relay | `rpc_response_auth.test.ts` | Response Ed25519 signature binds request_id + status + body hash |
| Core RPC Relay | `identity_binding.test.ts` | Reject if envelope.from != inner X-DID; reject if DID doesn't derive from signing key |
| MsgBox Client | `msgbox_ws.test.ts` | WS connect, Ed25519 challenge-response handshake, reconnect backoff |
| MsgBox Client | `msgbox_forward.test.ts` | POST /forward with all 6 headers (RFC3339 timestamp, hex sig/nonce/pubkey) |
| Per-DID Rate Limit | `ratelimit_did.test.ts` | Per-DID buckets instead of per-IP; Brain gets higher limit |
| Process Model (Android) | `process_android.test.ts` | Core runs in :core process; survives app background |
| Process Model (iOS) | `process_ios.test.ts` | Core/Brain in separate JS contexts; no shared state |
| Sleep/Wake | `lifecycle.test.ts` | Background > timeout → DEKs zeroed → vaults closed → re-unlock required |
| UI Device Key | `ui_auth.test.ts` | Chat UI authenticates to Brain with Ed25519 device key |
| Local Notifications | `notifications.test.ts` | Reminder fires → local notification at correct priority |

---

## 8. CI Pipeline

```
┌─ Lint + Typecheck (all packages) ─────────────────────────┐
│                                                            │
├─ Phase A: Fixture Tests (Category A) ─────────────────────┤
│  ├─ packages/core/__tests__/crypto/*.test.ts               │
│  ├─ packages/core/__tests__/auth/canonical.test.ts         │
│  ├─ packages/core/__tests__/pii/patterns.test.ts           │
│  ├─ packages/core/__tests__/gatekeeper/intent.test.ts      │
│  ├─ packages/core/__tests__/d2d/*.test.ts                  │
│  ├─ packages/brain/__tests__/trust/scorer.test.ts          │
│  └─ ... (all fixture-based tests)                          │
│  GATE: Zero failures required.                             │
│                                                            │
├─ Phase B: Contract Tests (Category B) ────────────────────┤
│  ├─ packages/core/__tests__/handlers/*.test.ts             │
│  ├─ packages/core/__tests__/staging/*.test.ts              │
│  ├─ packages/brain/__tests__/llm/*.test.ts                 │
│  ├─ packages/brain/__tests__/staging/*.test.ts             │
│  └─ ...                                                    │
│  GATE: Zero failures required.                             │
│                                                            │
├─ Phase C: Mobile-Specific Tests ──────────────────────────┤
│  ├─ packages/core/__tests__/relay/*.test.ts                │
│  ├─ packages/app/__tests__/*.test.tsx                      │
│  └─ ...                                                    │
│  GATE: Zero failures required.                             │
│                                                            │
└─ All gates pass → merge allowed                            │
```

**CI runs fixture tests on EVERY PR.** If a crypto test regresses, the PR
is blocked — no exceptions, no overrides.

---

## 9. Cross-Language Verification Matrix

This matrix must be all-green before v1.0 release:

| Primitive | Go Test | TS Test | Same Fixture | Status |
|-----------|---------|---------|--------------|--------|
| BIP-39 seed | `TestCrypto_1_*` | `bip39.test.ts` | `bip39_mnemonic_to_seed.json` | pending |
| SLIP-0010 root key | `TestCrypto_2_2_*` | `slip0010.test.ts` | `slip0010_root_signing_key.json` | pending |
| SLIP-0010 persona keys | `TestCrypto_2_3_*` | `slip0010.test.ts` | `slip0010_persona_keys.json` | pending |
| SLIP-0010 rotation key | `TestCrypto_2_4_*` | `slip0010.test.ts` | `slip0010_rotation_key.json` | pending |
| HKDF persona DEKs | `TestCrypto_3_*` | `hkdf.test.ts` | `hkdf_persona_deks.json` | pending |
| Argon2id KEK | `TestCrypto_4_*` | `argon2id.test.ts` | `argon2id_kek.json` | pending |
| AES-256-GCM wrap | `TestCrypto_5_*` | `aesgcm.test.ts` | `aesgcm_wrap_unwrap.json` | pending |
| Ed25519 sign | `TestSignature_*` | `ed25519.test.ts` | `ed25519_sign_verify.json` | pending |
| Ed25519 verify | `TestSignature_*` | `ed25519.test.ts` | `ed25519_sign_verify.json` | pending |
| Ed25519→X25519 | `TestCrypto_6_*` | `nacl.test.ts` | `key_convert_ed25519_x25519.json` | pending |
| NaCl seal/unseal | `TestD2D_*` | `nacl.test.ts` | `nacl_seal_unseal.json` | pending |
| Auth canonical | `TestAuth_*` | `canonical.test.ts` | `canonical_payload.json` | pending |
| DID from seed | `TestIdentity_*` | `did.test.ts` | `seed_to_did.json` | pending |
| D2D envelope | `TestD2D_*` | `envelope.test.ts` | `envelope_round_trip.json` | pending |
| PII regex | `TestPII_*` | `patterns.test.ts` | `regex_patterns.json` | pending |
| Gatekeeper intents | `TestGatekeeper_*` | `intent.test.ts` | `intent_decisions.json` | pending |
| Audit hash chain | `TestTrace_*` | `audit.test.ts` | `hash_chain.json` | pending |
| Schema DDL | SQL files | Schema creation | Verbatim SQL | pending |
| CLI sign_request | `test_signing.py` | `cli_signing.test.ts` | `cli_sign_request.json` | pending |
| CLI DID format | `test_signing.py` | `cli_signing.test.ts` | `cli_did_format.json` | pending |
| CLI multibase | `test_signing.py` | `cli_signing.test.ts` | `cli_multibase.json` | pending |
| PDS attestation sign | `pds_test.go` | `pds_publish.test.ts` | `attestation_signing.json` | pending |

**22 cross-language checkpoints.** All must pass before any feature is
considered "done."
