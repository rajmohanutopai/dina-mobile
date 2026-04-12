# Dina Mobile — Test Case Creation Tasks

> Tracks every test that needs to be written for the mobile port.
> Organized by: fixture extraction first, then Category A (fixture-based),
> then Category B (contract), then B+ (new mobile-specific), then
> cross-language verification.
>
> **Status values:** `pending` | `in_progress` | `done` | `blocked`
>
> All tasks start as `pending`. Nothing has been built yet.
>
> **Source of truth:** TEST_PLAN.md Section 2 defines the classification.
> This file tracks the creation status of each test.

---

## Phase F0: Fixture Extraction from Go/Python Test Suites

> Must complete BEFORE any TypeScript test is written. These tasks produce
> the JSON fixture files that Category A tests consume.

| ID | Task | Source File | Output Fixture | Tests Covered | Blocked By | Status |
|----|------|-------------|----------------|---------------|------------|--------|
| F0.1 | Extract BIP-39 seed vectors | `core/test/crypto_test.go` + `testutil/fixtures.go` | `fixtures/crypto/bip39_mnemonic_to_seed.json` | 1 | — | done |
| F0.2 | Extract SLIP-0010 root key vectors | `core/test/crypto_test.go` | `fixtures/crypto/slip0010_root_signing_key.json` | 1 | — | done |
| F0.3 | Extract SLIP-0010 persona key vectors | `core/test/crypto_test.go` | `fixtures/crypto/slip0010_persona_keys.json` | 6 | — | done |
| F0.4 | Extract SLIP-0010 rotation key vectors | `core/test/crypto_test.go` | `fixtures/crypto/slip0010_rotation_key.json` | 1 | — | done |
| F0.5 | Extract SLIP-0010 adversarial vectors | `core/test/crypto_adversarial_test.go` | `fixtures/crypto/slip0010_adversarial.json` | 6 | — | done |
| F0.6 | Extract HKDF persona DEK vectors | `core/test/crypto_test.go` + `testutil/fixtures.go:HKDFInfoStrings` | `fixtures/crypto/hkdf_persona_deks.json` | 11 | — | done |
| F0.7 | Extract Argon2id KEK vectors | `core/test/crypto_test.go` | `fixtures/crypto/argon2id_kek.json` | ~5 | — | done |
| F0.8 | Extract AES-GCM wrap/unwrap vectors | `core/test/crypto_test.go` | `fixtures/crypto/aesgcm_wrap_unwrap.json` | 1 | — | done |
| F0.9 | Extract Ed25519 sign/verify vectors | `core/test/crypto_test.go` + `signature_test.go` | `fixtures/crypto/ed25519_sign_verify.json` | 5 | — | done |
| F0.10 | Extract Ed25519→X25519 conversion vectors | `core/test/crypto_test.go` | `fixtures/crypto/key_convert_ed25519_x25519.json` | 2 | — | done |
| F0.11 | Extract NaCl seal/unseal vectors | `core/test/transport_d2d_sig_test.go` | `fixtures/crypto/nacl_seal_unseal.json` | ~8 | — | done |
| F0.12 | Extract auth canonical payload vectors | `core/test/signature_test.go` + `auth_test.go` | `fixtures/auth/canonical_payload.json` | 3 | — | done |
| F0.13 | Extract auth timestamp validation vectors | `core/test/auth_test.go` | `fixtures/auth/timestamp_validation.json` | ~8 | — | done |
| F0.14 | Extract nonce replay vectors | `core/test/signature_test.go` | `fixtures/auth/nonce_replay.json` | ~5 | — | done |
| F0.15 | Extract seed→DID vectors | `core/test/identity_test.go` + `identity_deterministic_test.go` | `fixtures/identity/seed_to_did.json` | ~10 | — | done |
| F0.16 | Extract DID document structure vectors | `core/test/identity_test.go` | `fixtures/identity/did_document.json` | ~8 | — | done |
| F0.17 | Extract D2D envelope round-trip vectors | `core/test/transport_d2d_sig_test.go` | `fixtures/d2d/envelope_round_trip.json` | ~10 | — | done |
| F0.18 | Extract D2D V1 message type vectors | `core/test/d2d_v1_domain_test.go` | `fixtures/d2d/v1_message_types.json` | ~15 | — | done |
| F0.19 | Extract D2D egress gate decision vectors | `core/test/d2d_v1_protocol_test.go` | `fixtures/d2d/egress_gate_decisions.json` | ~17 | — | done |
| F0.20 | Extract PII regex pattern vectors | `core/test/pii_test.go` + `pii_handler_test.go` | `fixtures/pii/regex_patterns.json` | 7 | — | done |
| F0.21 | Extract PII scrub/rehydrate vectors | `core/test/pii_handler_test.go` + Brain `test_pii.py` | `fixtures/pii/scrub_rehydrate.json` | ~20 | — | done |
| F0.22 | Extract gatekeeper intent decision vectors | `core/test/gatekeeper_test.go` | `fixtures/gatekeeper/intent_decisions.json` | 20 | — | done |
| F0.23 | Extract gatekeeper adversarial vectors | `core/test/gatekeeper_adversarial_test.go` | `fixtures/gatekeeper/adversarial.json` | ~20 | — | done |
| F0.24 | Extract gatekeeper brain-denied actions | `core/test/gatekeeper_test.go` | `fixtures/gatekeeper/brain_denied.json` | 5 | — | done (included in F0.22) |
| F0.25 | Extract sharing tier enforcement vectors | `core/test/gatekeeper_test.go` | `fixtures/gatekeeper/sharing_tiers.json` | ~10 | — | done |
| F0.26 | Extract vault lifecycle vectors | `core/test/vault_test.go` | `fixtures/vault/persona_tier_lifecycle.json` | ~15 | — | done |
| F0.27 | Extract staging state machine vectors | `core/test/staging_inbox_test.go` | `fixtures/staging/state_transitions.json` | 17 | — | done |
| F0.28 | Extract trust scoring rule vectors | Brain `test_trust_scorer.py` | `fixtures/trust/scoring_rules.json` | ~17 | — | done |
| F0.29 | Extract silence classification vectors | Brain `test_guardian.py` (priority assignment) | `fixtures/silence/priority_classification.json` | ~15 | — | done |
| F0.30 | Extract L0 deterministic vectors | Brain `test_enrichment.py` | `fixtures/enrichment/l0_deterministic.json` | ~5 | — | done |
| F0.31 | Extract source trust vectors | `core/test/source_trust_test.go` | `fixtures/trust/source_trust.json` | varies | — | done |
| F0.32 | Extract auth matrix vectors | `core/test/authz_test.go` | `fixtures/auth/authorization_matrix.json` | ~10 | — | done |
| F0.33 | Extract rate limit bucket vectors | `core/test/ratelimit_test.go` | `fixtures/auth/ratelimit_buckets.json` | varies | — | done |
| F0.34 | Extract tiered content loading vectors | `core/test/tiered_content_test.go` | `fixtures/vault/tiered_content.json` | varies | — | done |
| F0.35 | Extract export/import format vectors | `core/test/portability_test.go` | `fixtures/export/archive_format.json` | varies | — | done |
| F0.36 | Extract audit hash chain vectors | `core/test/traceability_test.go` | `fixtures/audit/hash_chain.json` | 1 | — | done |
| F0.37 | Extract trust cache vectors | `core/test/trust_test.go` | `fixtures/trust/cache_semantics.json` | ~15 | — | done |
| F0.38 | Extract contact matcher vectors | Brain `test_contact_matcher.py` | `fixtures/contact/matcher.json` | ~11 | — | done |
| F0.39 | Extract subject attributor vectors | Brain `test_subject_attributor.py` | `fixtures/contact/subject_attributor.json` | ~17 | — | done |
| F0.40 | Extract event extractor vectors | Brain `test_event_extractor.py` | `fixtures/enrichment/event_extractor.json` | ~7 | — | done |
| F0.41 | Extract tier classifier vectors | Brain `test_tier_classifier.py` | `fixtures/vault/tier_classifier.json` | ~7 | — | done |
| F0.42 | Extract entity vault vectors | Brain `test_pii.py` (Entity Vault section) | `fixtures/pii/entity_vault.json` | ~11 | — | done |
| F0.43 | Copy schema SQL files | `core/internal/adapter/sqlite/schema/identity_001.sql`, `identity_002_trust_cache.sql`, `persona_001.sql` | `fixtures/schema/*.sql` | 3 files | — | done |
| F0.44 | Extract CLI signing vectors | `cli/tests/test_signing.py` | `fixtures/cli/sign_request.json` | ~14 | — | done |
| F0.45 | Extract CLI DID format vectors | `cli/tests/test_signing.py` | `fixtures/cli/did_format.json` | (included in F0.44) | — | done |
| F0.46 | Extract PDS attestation signing vectors | `core/test/pds_test.go` (portable subset) | `fixtures/trust/attestation_signing.json` | ~5 | — | done |
| F0.47 | Extract root-level signing/DID vectors | `tests/test_signing.py`, `tests/test_did_key.py`, `tests/test_did_models.py` | `fixtures/identity/python_signing.json`, `fixtures/identity/did_key.json`, `fixtures/identity/did_models.json` | ~55 | — | done |
| F0.48 | Extract root-level identity/models vectors | `tests/test_identity.py`, `tests/test_models.py` | `fixtures/identity/python_identity.json`, `fixtures/models/product_verdict.json` | ~38 | — | done |
| F0.49 | Extract root-level memory integration vectors | `tests/test_memory_integration.py` | `fixtures/vault/signed_memory.json` | ~21 | — | done |
| F0.50 | Verify fixture stability | Run ALL extractions twice; diff = zero | — | — | F0.1–F0.49 | done |
| F0.51 | Commit fixtures to mobile repo | Copy all `fixtures/` to `packages/fixtures/` with README | — | — | F0.50 | done |

**Total fixture extraction tasks: 51**

---

## Phase T1: Category A — Fixture-Based Tests (Port Exactly)

> Each test file loads JSON fixtures and asserts bit-identical output.
> **Written BEFORE implementation** — all tests fail initially, then
> implementation makes them pass.

### T1A: Core Crypto (~89 tests from `crypto_test.go` + adversarial)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1A.1 | `core/__tests__/crypto/bip39.test.ts` | F0.1 | 7 | F0.1, F0.51 | done |
| T1A.2 | `core/__tests__/crypto/slip0010.test.ts` | F0.2, F0.3, F0.4 | 13 | F0.2–F0.4, F0.51 | done |
| T1A.3 | `core/__tests__/crypto/slip0010_adversarial.test.ts` | F0.5 | 9 | F0.5, F0.51 | done |
| T1A.4 | `core/__tests__/crypto/hkdf.test.ts` | F0.6 | 15 | F0.6, F0.51 | done |
| T1A.5 | `core/__tests__/crypto/argon2id.test.ts` | F0.7 | 5 | F0.7, F0.51 | done |
| T1A.6 | `core/__tests__/crypto/aesgcm.test.ts` | F0.8 | 8 | F0.8, F0.51 | done |
| T1A.7 | `core/__tests__/crypto/ed25519.test.ts` | F0.9 | 15 | F0.9, F0.51 | done |
| T1A.8 | `core/__tests__/crypto/nacl.test.ts` | F0.10, F0.11 | 12 | F0.10–F0.11, F0.51 | done |

**Subtotal: ~86 tests across 8 files**

### T1B: Core Auth (~40 tests from `signature_test.go`, `auth_test.go`, `authz_test.go`)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1B.1 | `core/__tests__/auth/canonical.test.ts` | F0.12 | 16 | F0.12, F0.51 | done |
| T1B.2 | `core/__tests__/auth/timestamp.test.ts` | F0.13 | 16 | F0.13, F0.51 | done |
| T1B.3 | `core/__tests__/auth/nonce.test.ts` | F0.14 | 6 | F0.14, F0.51 | done |
| T1B.4 | `core/__tests__/auth/authz_matrix.test.ts` | F0.32 | 13 | F0.32, F0.51 | done |
| T1B.5 | `core/__tests__/auth/ratelimit.test.ts` | F0.33 | 9 | F0.33, F0.51 | done |

**Subtotal: ~40 tests across 5 files**

### T1C: Core Identity (~20 tests from `identity_test.go`, `identity_deterministic_test.go`)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1C.1 | `core/__tests__/identity/did.test.ts` | F0.15 | 11 | F0.15, F0.51 | done |
| T1C.2 | `core/__tests__/identity/did_document.test.ts` | F0.16 | 16 | F0.16, F0.51 | done |

**Subtotal: ~18 tests across 2 files**

### T1D: Core D2D (~64 tests from `transport_d2d_sig_test.go`, `d2d_v1_domain_test.go`, `d2d_v1_protocol_test.go`)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1D.1 | `core/__tests__/d2d/envelope.test.ts` | F0.17 | 12 | F0.17, F0.51 | done |
| T1D.2 | `core/__tests__/d2d/families.test.ts` | F0.18 | 22 | F0.18, F0.51 | done |
| T1D.3 | `core/__tests__/d2d/gates.test.ts` | F0.19 | 17 | F0.19, F0.51 | done |
| T1D.4 | `core/__tests__/d2d/d2d_sig.test.ts` | F0.17 | 14 | F0.17, F0.51 | done |

**Subtotal: ~59 tests across 4 files**

### T1E: Core PII (~15 tests from `pii_test.go`, `pii_handler_test.go`)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1E.1 | `core/__tests__/pii/patterns.test.ts` | F0.20 | 31 | F0.20, F0.51 | done |
| T1E.2 | `core/__tests__/pii/scrub.test.ts` | F0.21 | 20 | F0.21, F0.51 | done |

**Subtotal: ~35 tests across 2 files**

### T1F: Core Gatekeeper (~95 tests from `gatekeeper_test.go`, `gatekeeper_adversarial_test.go`)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1F.1 | `core/__tests__/gatekeeper/intent.test.ts` | F0.22 | 27 | F0.22, F0.51 | done |
| T1F.2 | `core/__tests__/gatekeeper/adversarial.test.ts` | F0.23 | 16 | F0.23, F0.51 | done |
| T1F.3 | `core/__tests__/gatekeeper/brain_denied.test.ts` | F0.24 | 18 | F0.24, F0.51 | done |
| T1F.4 | `core/__tests__/gatekeeper/sharing.test.ts` | F0.25 | 18 | F0.25, F0.51 | done |

**Subtotal: ~75 tests across 4 files**

### T1G: Core Vault & Staging (~85 tests)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1G.1 | `core/__tests__/vault/lifecycle.test.ts` | F0.26 | 21 | F0.26, F0.51 | done |
| T1G.2 | `core/__tests__/vault/tiered_content.test.ts` | F0.34 | 10 | F0.34, F0.51 | done |
| T1G.3 | `core/__tests__/staging/state_machine.test.ts` | F0.27 | 29 | F0.27, F0.51 | done |
| T1G.4 | `core/__tests__/vault/crud.test.ts` | F0.26 | 22 | F0.26, F0.51 | done |

**Subtotal: ~85+ tests across 4 files**

### T1H: Core Trust & Audit (~30 tests)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1H.1 | `core/__tests__/trust/levels.test.ts` | F0.37 | 20 | F0.37, F0.51 | done |
| T1H.2 | `core/__tests__/trust/source.test.ts` | F0.31 | 17 | F0.31, F0.51 | done |
| T1H.3 | `core/__tests__/audit/hash_chain.test.ts` | F0.36 | 13 | F0.36, F0.51 | done |

**Subtotal: ~25+ tests across 3 files**

### T1I: Core Export (~10 tests)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1I.1 | `core/__tests__/export/archive.test.ts` | F0.35 | 9 | F0.35, F0.51 | done |

### T1J: Brain Category A (~120 tests)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1J.1 | `brain/__tests__/pii/entity_vault.test.ts` | F0.42 | 14 | F0.42, F0.51 | done |
| T1J.2 | `brain/__tests__/pii/tier2_patterns.test.ts` | F0.21 | 30 | F0.21, F0.51 | done |
| T1J.3 | `brain/__tests__/trust/scorer.test.ts` | F0.28 | 18 | F0.28, F0.51 | done |
| T1J.4 | `brain/__tests__/trust/tier_classifier.test.ts` | F0.41 | 7 | F0.41, F0.51 | done |
| T1J.5 | `brain/__tests__/enrichment/l0_deterministic.test.ts` | F0.30 | 13 | F0.30, F0.51 | done |
| T1J.6 | `brain/__tests__/contact/matcher.test.ts` | F0.38 | 13 | F0.38, F0.51 | done |
| T1J.7 | `brain/__tests__/contact/attributor.test.ts` | F0.39 | 21 | F0.39, F0.51 | done |
| T1J.8 | `brain/__tests__/enrichment/event_extractor.test.ts` | F0.40 | 10 | F0.40, F0.51 | done |

**Subtotal: ~131 tests across 8 files**

### T1K: CLI Category A (~14 tests)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1K.1 | `core/__tests__/auth/cli_signing.test.ts` | F0.44, F0.45 | 14 | F0.44, F0.51 | done |

### T1L: Root-Level Category A (~114 tests)

| ID | Test File | Fixture(s) | Tests | Blocked By | Status |
|----|-----------|-----------|-------|------------|--------|
| T1L.1 | `core/__tests__/identity/python_signing.test.ts` | F0.47 | 28 | F0.47, F0.51 | done |
| T1L.2 | `core/__tests__/identity/did_key.test.ts` | F0.47 | 20 | F0.47, F0.51 | done |
| T1L.3 | `core/__tests__/identity/did_models.test.ts` | F0.47 | 10 | F0.47, F0.51 | done |
| T1L.4 | `core/__tests__/identity/python_identity.test.ts` | F0.48 | 19 | F0.48, F0.51 | done |
| T1L.5 | `core/__tests__/models/product_verdict.test.ts` | F0.48 | 19 | F0.48, F0.51 | done |
| T1L.6 | `core/__tests__/vault/signed_memory.test.ts` | F0.49 | 21 | F0.49, F0.51 | done |

**Subtotal: ~114 tests across 6 files**

### Category A Totals

| Group | Tests | Files |
|-------|-------|-------|
| T1A: Crypto | ~86 | 8 |
| T1B: Auth | ~40 | 5 |
| T1C: Identity | ~18 | 2 |
| T1D: D2D | ~59 | 4 |
| T1E: PII | ~35 | 2 |
| T1F: Gatekeeper | ~75 | 4 |
| T1G: Vault & Staging | ~85 | 4 |
| T1H: Trust & Audit | ~25 | 3 |
| T1I: Export | varies | 1 |
| T1J: Brain | ~131 | 8 |
| T1K: CLI | ~14 | 1 |
| T1L: Root-level | ~114 | 6 |
| **Total Category A** | **~682** | **48** |

---

## Phase T2: Category B — Contract Tests (Port as Behavioral Equivalence)

> These test behavioral contracts using the TypeScript implementation directly.
> Not fixture-based — they create test harnesses and assert behavior.

### T2A: Core Contract Tests (~330 tests)

| ID | Test File | Source | Tests | Blocked By | Status |
|----|-----------|--------|-------|------------|--------|
| T2A.1 | `core/__tests__/api/contract.test.ts` | `apicontract_test.go` | 16 | T1A, T1B | done |
| T2A.2 | `core/__tests__/brain_client/http.test.ts` | `brainclient_test.go` | 14 | T1B | done |
| T2A.3 | `core/__tests__/server/health.test.ts` | `server_test.go` | 9 | T1A | done |
| T2A.4 | `core/__tests__/task/queue.test.ts` | `taskqueue_test.go` | 21 | T1G.3 | done |
| T2A.5 | `core/__tests__/pairing/ceremony.test.ts` | `pairing_test.go` | 20 | T1A, T1B | done |
| T2A.6 | `core/__tests__/session/lifecycle.test.ts` | `session_handler_test.go` | 14 | T2A.5 | done |
| T2A.7 | `core/__tests__/approval/lifecycle.test.ts` | `approval_preview_test.go` | 12 | T1F | done |
| T2A.8 | `core/__tests__/errors/hierarchy.test.ts` | `errors_test.go` | 12 | — | done |
| T2A.9 | `core/__tests__/config/loading.test.ts` | `config_test.go` | 16 | — | done |
| T2A.10 | `core/__tests__/notify/priority.test.ts` | `notify_test.go` | 9 | — | done |
| T2A.11 | `core/__tests__/transport/outbox.test.ts` | `d2d_phase2_test.go` | 22 | T1D | done |
| T2A.12 | `core/__tests__/transport/delivery.test.ts` | `transport_test.go` | 18 | T1D | done |
| T2A.13 | `core/__tests__/transport/adversarial.test.ts` | `transport_adversarial_test.go` | 14 | T1D | done |
| T2A.14 | `core/__tests__/ws/framing.test.ts` | `ws_test.go` | 26 | T1B | done |
| T2A.15 | `core/__tests__/fixes/verification.test.ts` | `fix_verification_*.go` | 15 | T1A–T1G | done |
| T2A.16 | `core/__tests__/vault/cross_persona.test.ts` | `vault_test.go` (remaining) | 10 | T1G | done |
| T2A.17 | `core/__tests__/wiring/bootstrap.test.ts` | `wiring_test.go` | 8 | T2A.1–T2A.16 | done |
| T2A.18 | `core/__tests__/onboarding/portable.test.ts` | `onboarding_test.go` (partial) | 12 | T1A, T1C | done |
| T2A.19 | `core/__tests__/trust/pds_publish.test.ts` | `pds_test.go` (partial) | 15 | T1C, T1H | done |
| T2A.20 | `core/__tests__/approval/pending_reason.test.ts` | `pending_reason_test.go` | 15 | T2A.7 | done |
| T2A.21 | `core/__tests__/schema/identity.test.ts` | F0.43 | 11 | F0.43 | done |
| T2A.22 | `core/__tests__/schema/persona.test.ts` | F0.43 | 16 | F0.43 | done |

**Subtotal: ~330 tests across 22 files**

### T2B: Brain Contract Tests (~194 tests)

| ID | Test File | Source | Tests | Blocked By | Status |
|----|-----------|--------|-------|------------|--------|
| T2B.1 | `brain/__tests__/api/process.test.ts` | `test_api.py` | 18 | T1J | done |
| T2B.2 | `brain/__tests__/auth/service_key.test.ts` | `test_auth.py` | 15 | T1B | done |
| T2B.3 | `brain/__tests__/core_client/http.test.ts` | `test_core_client.py` | 16 | T1B | done |
| T2B.4 | `brain/__tests__/guardian/silence.test.ts` | `test_guardian.py` | 39 | T1J.3 | done |
| T2B.5 | `brain/__tests__/llm/router.test.ts` | `test_llm.py` | 23 | — | done |
| T2B.6 | `brain/__tests__/staging/processor.test.ts` | `test_staging_processor.py` | 17 | T1G.3, T1J | done |
| T2B.7 | `brain/__tests__/contact/alias.test.ts` | `test_alias_support.py` | 19 | T1J.6 | done |
| T2B.8 | `brain/__tests__/scratchpad/lifecycle.test.ts` | `test_scratchpad.py` | 14 | — | done |
| T2B.9 | `brain/__tests__/routing/task.test.ts` | `test_routing.py` | 15 | T2B.5 | done |
| T2B.10 | `brain/__tests__/sync/engine.test.ts` | `test_sync.py` | 23 | T2B.6 | done |
| T2B.11 | `brain/__tests__/embedding/generation.test.ts` | `test_embedding.py` | 7 | T2B.5 | done |
| T2B.12 | `brain/__tests__/mcp/delegation.test.ts` | `test_mcp.py` | 18 | T1F | done |
| T2B.13 | `brain/__tests__/config/loading.test.ts` | `test_config.py` | 12 | — | done |
| T2B.14 | `brain/__tests__/resilience/degradation.test.ts` | `test_resilience.py` | 12 | T2B.5 | done |
| T2B.15 | `brain/__tests__/crash/safety.test.ts` | `test_crash.py` | 15 | — | done |
| T2B.16 | `brain/__tests__/persona/registry.test.ts` | `test_persona_registry.py` | 12 | T1C | done |
| T2B.17 | `brain/__tests__/vault_context/assembly.test.ts` | `test_vault_context.py` | 16 | T1G | done |
| T2B.18 | `brain/__tests__/fixes/verification.test.ts` | `test_fix_verification.py` | 22 | T2B.1–T2B.17 | done |
| T2B.19 | `brain/__tests__/staging/responsibility.test.ts` | `test_staging_responsibility.py` | 8 | T2B.6 | done |
| T2B.20 | `brain/__tests__/guardian/advanced_silence.test.ts` | `test_silence.py` | 21 | T2B.4 | done |
| T2B.21 | `brain/__tests__/pipeline/safety.test.ts` | `test_pipeline_safety.py` | 13 | T2B.4, T2B.12 | done |
| T2B.22 | `brain/__tests__/person/linking.test.ts` | `test_person_linking.py` | 27 | T1J.6 | done |

**Subtotal: ~508 tests across 22 files**

### T2C: CLI Contract Tests (~18 tests)

| ID | Test File | Source | Tests | Blocked By | Status |
|----|-----------|--------|-------|------------|--------|
| T2C.1 | `core/__tests__/auth/cli_session.test.ts` | `cli/tests/test_session.py` | 8 | T1K | done |
| T2C.2 | `core/__tests__/task/cli_task.test.ts` | `cli/tests/test_task.py` | 8 | T1K, T1F | done |
| T2C.3 | `core/__tests__/auth/cli_client.test.ts` | `cli/tests/test_client.py` (partial) | 11 | T1K | done |

**Subtotal: ~18 tests across 3 files**

### T2D: Integration/Root/E2E Contract Tests (~340 tests)

| ID | Test File | Source | Tests | Blocked By | Status |
|----|-----------|--------|-------|------------|--------|
| T2D.1 | `app/__tests__/chat/integration.test.ts` | `tests/test_chat_integration.py` | 21 | T1C, T1L | done |
| T2D.2 | `brain/__tests__/llm/providers.test.ts` | `tests/test_providers.py` | 18 | T2B.5 | done |
| T2D.3 | `core/__tests__/vault/ceramic.test.ts` | `tests/test_vault.py` | 17 | T1G | done |
| T2D.4 | `core/__tests__/audit/integration.test.ts` | `tests/integration/test_audit.py` | 6 | T1H | done |
| T2D.5 | `core/__tests__/approval/async.test.ts` | `tests/integration/test_async_approval.py` | 10 | T2A.7 | done |
| T2D.6 | `brain/__tests__/guardian/anti_her.test.ts` | `tests/integration/test_anti_her.py` | 12 | T2B.4 | done |
| T2D.7 | `core/__tests__/d2d/delegation.test.ts` | `tests/integration/test_delegation.py` | 7 | T1F, T1D | done |
| T2D.8 | `core/__tests__/d2d/didcomm.test.ts` | `tests/integration/test_didcomm.py` (partial) | 7 | T1D, T1A.8 | done |
| T2D.9 | `brain/__tests__/nudge/whisper.test.ts` | `tests/integration/test_whisper.py` | 11 | T2B.4, T1J | done |
| T2D.10 | `core/__tests__/gatekeeper/trust_rings.test.ts` | `tests/integration/test_trust_rings.py` (partial) | 4 | T1F | done |
| T2D.11 | `core/__tests__/sync/client.test.ts` | `tests/integration/test_client_sync.py` | 13 | T2A.5, T1B | done |
| T2D.12 | `core/__tests__/d2d/dina_to_dina.test.ts` | `tests/integration/test_dina_to_dina.py` | 14 | T1D, T1E | done |
| T2D.13 | `core/__tests__/vault/memory_flows.test.ts` | `tests/integration/test_memory_flows.py` | 12 | T1G, T1E | done |
| T2D.14 | `core/__tests__/trust/network.test.ts` | `tests/integration/test_trust_network.py` | 14 | T1H, T1C | done |
| T2D.15 | `core/__tests__/d2d/wire_format.test.ts` | `tests/integration/test_contract_wire_format.py` (partial) | 6 | T1D | done |
| T2D.16 | `app/__tests__/stories/user_stories.test.ts` | `tests/system/user_stories/*` (partial) | 32 | T2A, T2B | done |
| T2D.17 | `core/__tests__/vault/persistence.test.ts` | `tests/release/test_rel_003` | 6 | T1G | done |
| T2D.18 | `core/__tests__/vault/locked_state.test.ts` | `tests/release/test_rel_004` | 7 | T1G | done |
| T2D.19 | `core/__tests__/identity/recovery.test.ts` | `tests/release/test_rel_005` | 7 | T1A, T1C | done |
| T2D.20 | `core/__tests__/vault/persona_wall.test.ts` | `tests/release/test_rel_009` | 16 | T1F, T1G | done |
| T2D.21 | `app/__tests__/sync/multi_device.test.ts` | `tests/e2e/test_suite_11` | 11 | T2D.11 | done |
| T2D.22 | `core/__tests__/auth/cli_e2e.test.ts` | `tests/e2e/test_suite_15` | 8 | T1K, T2A.5 | done |

**Subtotal: ~340 tests across 22 files — ALL T2D DONE**

---

## Phase T3: Category B+ — New Mobile-Specific Tests

> These tests have no server equivalent. They verify mobile-only behavior.

| ID | Test File | What It Verifies | Tests | Blocked By | Status |
|----|-----------|------------------|-------|------------|--------|
| T3.1 | `core/__tests__/recovery/task_recovery.test.ts` | Task timeout reset → pending; dead-letter transition when retry > max | 6 | T2A.4 | done |
| T3.2 | `core/__tests__/recovery/staging_sweep.test.ts` | Staging lease expiry → revert; retry cap → dead-letter | 8 | T1G.3 | done |
| T3.3 | `core/__tests__/recovery/audit_cleanup.test.ts` | Crash log 90-day purge; audit log 90-day retention | 6 | T1H.3 | done |
| T3.4 | `core/__tests__/recovery/background_timers.test.ts` | Timers fire when active; stop when backgrounded; resume on foreground | 14 | — | done |
| T3.5 | `core/__tests__/relay/rpc_envelope.test.ts` | Core RPC request envelope wrapping, NaCl sealing, inner Ed25519 auth | 10 | T1A, T1B, T1D | done |
| T3.6 | `core/__tests__/relay/rpc_response_auth.test.ts` | Response Ed25519 signature binds request_id + status + body hash | 12 | T3.5 | done |
| T3.7 | `core/__tests__/relay/identity_binding.test.ts` | Reject if envelope.from != inner X-DID; DID must derive from signing key | 12 | T3.5 | done |
| T3.8 | `core/__tests__/relay/msgbox_ws.test.ts` | WS connect, Ed25519 challenge-response, reconnect backoff | 14 | T1A.7, T1B | done |
| T3.9 | `core/__tests__/relay/msgbox_forward.test.ts` | POST /forward with all 6 headers (RFC3339, hex sig/nonce/pubkey) | 10 | T3.8 | done |
| T3.10 | `core/__tests__/auth/ratelimit_did.test.ts` | Per-DID buckets (not per-IP); Brain gets higher limit | 6 | T1B.5 | done |
| T3.11 | `core/__tests__/process/android.test.ts` | Core runs in :core process; survives app background | 7 | T2A.3 | done |
| T3.12 | `core/__tests__/process/ios.test.ts` | Core/Brain separate JS contexts; no shared state | 7 | T2A.3 | done |
| T3.13 | `core/__tests__/lifecycle/sleep_wake.test.ts` | Background > timeout → DEKs zeroed → vaults closed → re-unlock required; MsgBox reconnects on wake | 17 | T1A, T3.8 | done |
| T3.14 | `brain/__tests__/auth/ui_device_key.test.ts` | Chat UI authenticates to Brain with Ed25519 device key (no CLIENT_TOKEN) | 8 | T1B | done |
| T3.15 | `app/__tests__/notifications/local.test.ts` | Reminder fires → local notification at correct priority | 12 | — | done |

**Subtotal: 15/15 done — ALL T3 COMPLETE**

---

## Phase T4: Cross-Language Verification

> Final gate — all 22 checkpoints must pass before v1.0.

| ID | Primitive | Go Source | TS Test | Fixture | Blocked By | Status |
|----|-----------|----------|---------|---------|------------|--------|
| T4.1 | BIP-39 seed | `TestCrypto_1_*` | T1A.1 | F0.1 | T1A.1 | pending |
| T4.2 | SLIP-0010 root key | `TestCrypto_2_2_*` | T1A.2 | F0.2 | T1A.2 | pending |
| T4.3 | SLIP-0010 persona keys | `TestCrypto_2_3_*` | T1A.2 | F0.3 | T1A.2 | pending |
| T4.4 | SLIP-0010 rotation key | `TestCrypto_2_4_*` | T1A.2 | F0.4 | T1A.2 | pending |
| T4.5 | HKDF persona DEKs | `TestCrypto_3_*` | T1A.4 | F0.6 | T1A.4 | pending |
| T4.6 | Argon2id KEK | `TestCrypto_4_*` | T1A.5 | F0.7 | T1A.5 | pending |
| T4.7 | AES-256-GCM wrap | `TestCrypto_5_*` | T1A.6 | F0.8 | T1A.6 | pending |
| T4.8 | Ed25519 sign | `TestSignature_*` | T1A.7 | F0.9 | T1A.7 | pending |
| T4.9 | Ed25519 verify | `TestSignature_*` | T1A.7 | F0.9 | T1A.7 | pending |
| T4.10 | Ed25519→X25519 | `TestCrypto_6_*` | T1A.8 | F0.10 | T1A.8 | pending |
| T4.11 | NaCl seal/unseal | `TestD2D_*` | T1A.8 | F0.11 | T1A.8 | pending |
| T4.12 | Auth canonical | `TestAuth_*` | T1B.1 | F0.12 | T1B.1 | pending |
| T4.13 | DID from seed | `TestIdentity_*` | T1C.1 | F0.15 | T1C.1 | pending |
| T4.14 | D2D envelope | `TestD2D_*` | T1D.1 | F0.17 | T1D.1 | pending |
| T4.15 | PII regex | `TestPII_*` | T1E.1 | F0.20 | T1E.1 | pending |
| T4.16 | Gatekeeper intents | `TestGatekeeper_*` | T1F.1 | F0.22 | T1F.1 | pending |
| T4.17 | Audit hash chain | `TestTrace_*` | T1H.3 | F0.36 | T1H.3 | pending |
| T4.18 | Schema DDL | SQL files | T2A.21–22 | F0.43 | T2A.21 | pending |
| T4.19 | CLI sign_request | `test_signing.py` | T1K.1 | F0.44 | T1K.1 | pending |
| T4.20 | CLI DID format | `test_signing.py` | T1K.1 | F0.44 | T1K.1 | pending |
| T4.21 | CLI multibase | `test_signing.py` | T1K.1 | F0.44 | T1K.1 | pending |
| T4.22 | PDS attestation sign | `pds_test.go` | T2A.19 | F0.46 | T2A.19 | pending |

---

## Summary

| Phase | Description | Tasks | Test Count | Status |
|-------|-------------|-------|------------|--------|
| F0 | Fixture extraction | 51 | — (produces fixtures) | all pending |
| T1 | Category A (fixture-based) | 48 files | ~682 tests | all pending |
| T2 | Category B (contract) | 69 files | ~1,122 tests | all pending |
| T3 | Category B+ (mobile-specific) | 15 files | ~63 tests | all pending |
| T4 | Cross-language verification | 22 checkpoints | — (gates) | all pending |
| **Total** | | **183 tasks + 22 gates** | **~1,867 tests** | **all pending** |

**Dependency chain:** F0 → T1 → T2 → T3 → T4 (gate)

**Critical path for Phase 1 implementation:** F0.1–F0.11 (crypto fixtures) → T1A (crypto tests) → implement crypto → T4.1–T4.11 (cross-language verify)
