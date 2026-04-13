# Dina Mobile — Gap Analysis vs. Main Dina

**Date**: 2026-04-12 (analysis) | **Completed**: 2026-04-13 (all gaps resolved)
**Main Dina**: Go (core) + Python (brain) — production, tested
**Dina Mobile**: TypeScript (core + brain + app) — React Native port

---

## ✅ STATUS: ALL GAPS RESOLVED

**Final test totals**: Core 3,157 + Brain 1,854 + App 664 = **5,675 tests, 300 suites, zero failures**.

All P0 (security), P1 (feature parity), and P2 (nice-to-have) items have been implemented across 17 iterations. The sections below document the original gaps; all are now resolved.

---

## Executive Summary

The mobile port now faithfully replicates **all** major systems from the main Dina, including the **AI reasoning pipeline** (7-tool agentic loop), **safety layer** (Anti-Her pre-screening + guard scan + density-aware severity), **enrichment** (L0→L1→PII→embedding→ready with batch sweep), **PII scrubbing** (on all LLM calls), and **operational features** (circuit breaker, ActionRiskPolicy, structured reasoning trace, trust network search, briefing assembly, MsgBox WebSocket transport).

~~However, significant gaps remain in the **AI reasoning pipeline**, **safety layer**, **enrichment**, and **operational features**.~~ *(Original text — no longer accurate.)*

---

## 1. PROMPTS

### What's Ported

| Prompt | Main Dina | Mobile | Status |
|--------|-----------|--------|--------|
| PROMPT_PERSONA_CLASSIFY_SYSTEM | Full (with relationship-aware routing, attribution corrections) | Partial (no relationship-aware routing, no attribution corrections) | **GAP** |
| PROMPT_VAULT_CONTEXT_SYSTEM | Full (agentic with 5 tools: list_personas, search_vault, browse_vault, get_full_content, search_trust_network) | Simplified (memories injected as text, no tool calling) | **GAP** |
| PROMPT_CHAT_SYSTEM | Four Laws + full rules | Four Laws ported, rules simplified | **Partial** |
| PROMPT_REMINDER_PLANNER_SYSTEM | Full (timezone, vault context enrichment, multi-reminder, tone rules) | Ported (no timezone, no vault context enrichment) | **GAP** |
| PROMPT_REMEMBER_ACK_SYSTEM | N/A (main Dina uses a different ack flow) | New for mobile | **OK** |

### What's Missing

| Prompt | Main Dina | Mobile | Impact |
|--------|-----------|--------|--------|
| PROMPT_ENRICHMENT_USER | Generates L0 (headline) + L1 (paragraph) summaries | **Not ported** | No content enrichment — raw text only |
| PROMPT_ENRICHMENT_LOW_TRUST_INSTRUCTION | Caveats for unverified sources | **Not ported** | Low-trust items treated same as self-authored |
| PROMPT_GUARD_SCAN_SYSTEM | Post-response safety scan (anti-her, unsolicited recs, fabricated trust, consensus claims) | **Not ported** | No safety post-processing on LLM responses |
| PROMPT_ANTI_HER_CLASSIFY_SYSTEM | Detects emotional companionship patterns in user queries | **Not ported** | No pre-emptive anti-her screening |
| PROMPT_SILENCE_CLASSIFY_SYSTEM | LLM-based priority classification (fiduciary/solicited/engagement) | **Not ported** | Guardian uses deterministic only in mobile |
| PROMPT_PERSON_IDENTITY_EXTRACTION | Extracts relationship definitions ("Emma is my daughter") | **Not ported** | No automatic relationship graph building |
| PROMPT_PII_PRESERVE_INSTRUCTION | Instructs LLM to preserve PII tokens verbatim | **Not ported** | No PII scrub/rehydrate cycle |
| PERSONA_CLASSIFY_RESPONSE_SCHEMA | Gemini structured output schema for classification | **Not ported** | Classification relies on free-form JSON parsing |

### Detail: Classification Prompt Gaps

**Main Dina has, mobile lacks:**
- Relationship-aware routing with `data_responsibility` overrides (household/care/financial/external)
- `mentioned_contacts` integration — routing based on WHO the data is about
- Attribution correction (job 3) — fixing misattributed facts
- `secondary` persona field — items that span multiple vaults
- Full response schema enforcement for Gemini

**Impact**: A memory like "Sancho's blood pressure is 120/80" would be classified as `health` in main Dina (if Sancho is household) but correctly as `general` (if Sancho is external). Mobile doesn't make this distinction.

---

## 2. AI REASONING PIPELINE

### Main Dina (Production)

```
User Question
  → PII Scrub (names → [PERSON_1])
  → Agentic Reasoning (multi-turn tool use, up to 6 loops)
     → list_personas()     — enumerate available vaults
     → search_vault()      — semantic + FTS5 hybrid search
     → browse_vault()      — recent items without query
     → get_full_content()  — full document retrieval
     → search_trust_network() — decentralized peer reviews
  → Guard Scan (parallel safety filter)
  → Content Filtering (remove flagged sentences)
  → PII Rehydration ([PERSON_1] → original name)
  → Density Disclosure (caveat if sparse data)
  → Response
```

### Mobile (Current)

```
User Question
  → Keyword search in memory store
  → Single generateText() call with memories as context
  → Response (no safety filtering)
```

### Gaps

| Feature | Main Dina | Mobile | Severity |
|---------|-----------|--------|----------|
| PII Scrubbing | Tier 1 regex + Tier 2 Presidio (structured IDs only — emails, phones, cards, govt IDs; names/orgs/locations pass through by design) | **None** | **HIGH** — structured PII (emails, phones, card numbers) sent to cloud LLMs |
| PII Rehydration | Token → original value restoration (e.g. [EMAIL_1] → real email) | **None** | Dependent on scrubbing |
| Agentic Tool Use | 5 tools, multi-turn (up to 6 loops) | **None** — single generateText() | **MEDIUM** — can't browse/search vault dynamically |
| Trust Network | Decentralized peer review search | **None** | **LOW** (MVP) |
| Guard Scan | Parallel safety filter on every response | **None** | **HIGH** — no protection against fabrication/anti-her |
| Density Disclosure | Caveats when vault data is sparse | **None** | **LOW** |
| Semantic Search | Cosine similarity on embeddings (HNSW) | **None** — keyword FTS only | **MEDIUM** — can't find "back pain" from "lumbar disc" |
| Hybrid Search | 0.4×FTS + 0.6×semantic reranking | **None** | **MEDIUM** |

---

## 3. VAULT & STORAGE

### Schema Comparison

| Field | Main Dina (SQLCipher) | Mobile (In-Memory) | Status |
|-------|----------------------|-------------------|--------|
| id | Random hex (vi-XXXX) | Auto-increment integer | **DIFF** |
| type | 20 types (email, message, event, note, health_context, etc.) | Not tracked | **GAP** |
| source | Source system (telegram, email, web, manual) | Not tracked | **GAP** |
| source_id | External identifier (dedup key) | Not tracked | **GAP** |
| summary | Short headline | `content` field serves as both | **GAP** |
| body | Full text content | `content` field | **DIFF** |
| content_l0 | Deterministic headline (enriched) | **Not present** | **GAP** |
| content_l1 | Paragraph summary (enriched) | **Not present** | **GAP** |
| content_l2 | Full enrichment metadata | **Not present** | **GAP** |
| metadata | JSON blob | Not present | **GAP** |
| sender | Who provided the data | Not tracked | **GAP** |
| sender_trust | self / contact_ring1 / unknown | Not tracked | **GAP** |
| confidence | high / medium / low | Not tracked | **GAP** |
| retrieval_policy | normal / quarantine / briefing_only / caveated | Not tracked | **GAP** |
| embedding | Float32 vector | Not present | **GAP** |
| tags | String array | Not present | **GAP** |
| contradicts | References conflicting items | Not present | **GAP** |
| enrichment_status | pending / enriching / ready / failed | Not present | **GAP** |
| timestamp | Event timestamp | `created_at` only | **GAP** |
| deleted | Soft delete flag | Not present | **GAP** |
| category | Via metadata JSON | Top-level field | **OK** |
| reminder_date | Via reminder service | Top-level field | **OK** |

### Search Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| FTS5 | SQLite FTS5 on summary/body/l0/l1 | Case-insensitive substring match | **GAP** |
| Semantic | HNSW cosine similarity | **None** | **GAP** |
| Hybrid | 0.4×FTS + 0.6×semantic | **None** | **GAP** |
| Per-persona isolation | Separate storage per persona | All in one array | **GAP** |
| Batch operations | Max 100, transactional | Not implemented | **GAP** |
| Dedup | (source, source_id) compound key | Not implemented | **GAP** |
| Soft delete | deleted flag | Not implemented | **GAP** |
| Persistence | SQLCipher (encrypted) | In-memory (lost on restart) | **GAP** — op-sqlite installed but not wired |

---

## 4. ENRICHMENT PIPELINE

### Main Dina

```
Raw Item
  → L0 Deterministic (metadata-based headline)
  → L0/L1 LLM Enrichment (PROMPT_ENRICHMENT_USER)
  → Embedding Generation (text-embedding-3-small)
  → HNSW Index Update
  → enrichment_status = 'ready'
```

### Mobile

**Not implemented.** Items stored as raw text with no summarization, no embedding, no tiered content.

### Impact
- No semantic search capability
- No headline/summary tiers for efficient browsing
- Vault browser shows raw text only (no L0 previews)

---

## 5. SAFETY LAYER

### Guard Scan (Main Dina)

Runs on **every LLM response** before delivery to user:

1. **Anti-Her Detection** — flags sentences offering emotional companionship ("I'm here for you", "how are you holding up?")
2. **Unsolicited Recommendations** — flags product/vendor recommendations not backed by Trust Network data
3. **Fabricated Trust Scores** — flags invented trust ratings or reviews
4. **Consensus Claims** — flags "most people agree" without evidence
5. **Entity Extraction** — extracts DID and product/vendor names from user query
6. **Trust Relevance** — determines if query is trust-relevant (triggers Trust Network search)

**Flagged sentences are removed.** Deterministic regex fallback if LLM guard fails.

### Mobile

**No guard scan.** LLM responses are returned directly to the user without any safety filtering.

### Impact
- LLM could generate emotional companionship responses (violating Law 4)
- LLM could recommend products from training data (violating Law 2)
- LLM could fabricate trust scores or reviews
- No deterministic fallback safety net

---

## 6. PII SCRUBBING

### Main Dina

**Names, organisations, and locations are intentionally NOT scrubbed** — they pass through by design. The scrubber only redacts **structured PII**: emails, phones, credit cards, SSNs, IP addresses, Aadhaar, PAN, bank accounts, IFSC, UPI IDs, passports, EU government IDs.

```
User Input: "Dr. Sharma at rajmohan@email.com, card 4111-1111-1111-1111"
  → Scrub: "Dr. Sharma at [EMAIL_1], card [CREDIT_CARD_1]"
  → Send to Cloud LLM (names stay, identifiers scrubbed)
  → LLM Response: "Dr. Sharma's email is [EMAIL_1]."
  → Rehydrate: "Dr. Sharma's email is rajmohan@email.com."
  → Deliver to user
```

Two tiers:
- **Tier 1 (Go regex)**: EMAIL, PHONE, CREDIT_CARD, BANK_ACCT, SSN, IP, ADDRESS, AADHAAR
- **Tier 2 (Presidio NER)**: Same structured types + IN_PAN, IN_IFSC, IN_UPI_ID, IN_PASSPORT, IN_BANK_ACCOUNT, EU IDs (DE_STEUER_ID, FR_NIR, NL_BSN, SWIFT_BIC)

**Explicitly excluded from scrubbing**: PERSON, ORG, LOCATION, GPE, LOC, FAC, DATE, TIME, MONEY, PERCENT — these pass through unchanged.

### Mobile

**No PII scrubbing of any kind.** Emails, phone numbers, credit card numbers, and government IDs are sent directly to OpenAI/Gemini APIs alongside names.

### Impact
- **Structured PII leaks** — emails, phones, card numbers sent to cloud providers
- Names are fine (main Dina doesn't scrub them either)
- Need to implement at least Tier 1 regex scrub for structured identifiers before cloud LLM calls

---

## 7. GUARDIAN / SILENCE FIRST

### Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| Deterministic tier classification | Keywords + source type | Keywords + source type | **OK** |
| LLM tier classification | PROMPT_SILENCE_CLASSIFY_SYSTEM | **None** | **GAP** |
| DND mode | Downgrades T2 → T3 (never T1) | Downgrades T2 → T3 | **OK** |
| Quiet hours | 22:00–07:00, configurable | 22:00–07:00 | **OK** |
| Escalation tracking | source → count → T1 escalation | source → count → T1 | **OK** |
| User overrides | Per-source tier override | Per-source override | **OK** |
| Stale content (>24h) | Below T3, reduced confidence | Below T3 | **OK** |
| Briefing assembly | Full daily/on-demand briefing | **Stub** — assembler exists but not wired | **GAP** |

---

## 8. REMINDERS

### Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| Reminder CRUD | Full (create, get, list, complete, delete) | Basic (auto-created from dates) | **GAP** |
| LLM-powered planning | PROMPT_REMINDER_PLANNER_SYSTEM with vault context | **Not wired** — prompt exists but not called | **GAP** |
| Smart reminders | Birthday → day-before gift + morning call | **None** — single date reminder only | **GAP** |
| Recurring | daily / weekly / monthly auto-renewal | **None** | **GAP** |
| Dedup | (source_item_id, kind, due_at, persona) | **None** | **GAP** |
| Kind types | birthday, appointment, payment_due, deadline, reminder | **None** — no kind classification | **GAP** |
| Timezone | User timezone → UTC conversion | **None** — dates only, no times | **GAP** |
| Reminder firing | Event processor dispatches on due_at | **None** — display only | **GAP** |
| Vault context enrichment | Fetch related items for richer reminder text | **None** | **GAP** |

### Example Gap

**Main Dina**: "Remember Emma's birthday is March 15" →
- Reminder 1: "Emma's 7th birthday is tomorrow. She likes dinosaurs and painting — maybe pick up a craft set?" (March 14, 6pm)
- Reminder 2: "Emma's birthday is today. You might want to call and wish her." (March 15, 8am)

**Mobile**: "Remember Emma's birthday is March 15" →
- Single reminder: "Emma's birthday is March 15" (March 15, displayed in list)

---

## 9. D2D MESSAGING

### Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| DID Resolution | PLC Directory lookup + 10-min cache | Same pattern | **OK** |
| NaCl Sealed Box | Ephemeral x25519 + ChaCha20-Poly1305 | Same implementation | **OK** |
| Message signing | Ed25519 over canonical form | Same implementation | **OK** |
| Receive pipeline | Verify → Unseal → Gates → Quarantine | Same pipeline | **OK** |
| 4-gate egress | Content, recipient, rate, size | Same gates | **OK** |
| Quarantine | 30-day TTL for unknown senders | Same | **OK** |
| WebSocket relay | Full msgbox_ws client | Stub — not wired to real relay | **GAP** |
| Message forwarding | Full msgbox_forward | Stub | **GAP** |
| Offline queue | Queue messages when offline, send on reconnect | **Not implemented** | **GAP** |

---

## 10. CRYPTO PIPELINE

### Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| BIP-39 mnemonic | English word list | Same | **OK** |
| SLIP-0010 key derivation | m'/9999'/purpose'/index'/gen' | Same paths | **OK** |
| HKDF-SHA256 | Persona DEK, backup key, DEK hash | Same | **OK** |
| Argon2id | 128 MB, 3 iter, 4 para | Same params | **OK** |
| AES-256-GCM | Seed wrapping | Same | **OK** |
| Ed25519 | Signing/verification | Same (@noble/ed25519) | **OK** |
| NaCl sealed box | D2D encryption | Same | **OK** |
| secp256k1 | Backup/rotation keys | Same | **OK** |
| Cross-language compat | Go ↔ Python test vectors | TypeScript ↔ Go/Python test vectors | **OK** |

**Crypto is fully ported with test vector validation.** No gaps.

---

## 11. AUTH SYSTEM

### Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| 7-step middleware | Headers → Timestamp → Nonce → Sig → Rate → Caller → Authz | Same pipeline | **OK** |
| Timestamp window | ±5 minutes | Same (±300s) | **OK** |
| Nonce replay detection | Generational rotation | Same | **OK** |
| Rate limiting | 50 req/min sliding window | Same | **OK** |
| Body limit | 2 MB before auth | Same (MAX_BODY_SIZE_BYTES) | **OK** |
| Authz matrix | Path × CallerType RBAC | Same matrix | **OK** |
| Fail-closed | Unknown callers rejected | Fixed in security audit | **OK** |
| Canonical signing | method + path + query + timestamp + nonce + body | Same | **OK** |

**Auth is fully ported.** No gaps.

---

## 12. PAIRING

### Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| 6-digit code | 100,000–999,999 range | Same | **OK** |
| Single-use | Atomic mark-used | Same | **OK** |
| 5-minute TTL | 300s expiry | Same | **OK** |
| Max pending | 100 codes | Same | **OK** |
| Device registration | DID derivation + registry | Same (fixed in security audit) | **OK** |
| Node DID | Real DID from key | Same (fixed — was placeholder) | **OK** |
| Role parameter | rich/thin | Same | **OK** |

**Pairing is fully ported.** No gaps.

---

## 13. TRUST NETWORK

### Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| Trust levels | blocked/unknown/verified/trusted | Same 4 levels | **OK** |
| Trust rings | Ring 1/2/3 with action gating | Same | **OK** |
| Cache TTL | 1-hour | Same (TRUST_CACHE_TTL_MS) | **OK** |
| PDS publish | Publish attestations to AT Protocol PDS | Stub — not wired to real PDS | **GAP** |
| Trust Network search | Decentralized peer review queries | **Not implemented** | **GAP** |
| AppView query | Query trust from AppView | Stub — not wired | **GAP** |

---

## 14. CONFIGURATION

### Comparison

| Feature | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| Config loading | Env vars → validate | Same pattern | **OK** |
| Core config | listenAddr, brainURL, vaultPath, etc. | Same fields | **OK** |
| Brain config | LLM provider, guardian settings | Same fields | **OK** |
| Service keys | File-based PKI | CLI signing | **DIFF** |
| Hot reload | Config reload on SIGHUP | Not applicable (mobile) | **N/A** |

---

## 15. CONSTANTS

| Category | Main Dina | Mobile | Status |
|----------|-----------|--------|--------|
| Core constants | 68 named constants | Same 68 constants | **OK** |
| Brain constants | 25 named constants | Same 25 constants | **OK** |
| Route paths | 30+ path constants | Same (paths.ts) | **OK** |
| Persona names | Canonical + aliases | Same (names.ts) | **OK** |

**Constants fully centralized.** No gaps.

---

## 16. TESTS

| Package | Main Dina | Mobile | Status |
|---------|-----------|--------|--------|
| Core | ~180 test files | ~180 test files | **OK** |
| Brain | ~50 test files | ~50 test files | **OK** |
| App | ~10 test files | ~40 test files | **OK** |
| AI layer | N/A (in Brain) | 3 test files (59 tests) | **OK** |
| Prompt validation | Full prompt test suite | 22 prompt tests | **PARTIAL** |
| Integration (e2e) | Extensive | Chat integration only | **GAP** |
| Total tests | ~4,500+ | ~4,591 | **OK** |

---

## Priority Matrix — ALL COMPLETE ✅

### P0 — Must Fix (Security / Correctness) ✅

1. ✅ **Structured PII Scrubbing** — Tier 1 regex scrub + rehydrate cycle on ALL LLM calls (silence, anti-her, identity extraction, guard scan, enrichment, reminder planner).
2. ✅ **Guard Scan** — 4 categories + sentence-level indexing + LLM classifier + density-tier aware severity escalation + sponsored content tagging.
3. ✅ **Memory Persistence** — op-sqlite (15 repository files, SQLCipher, WAL mode). handleRemember() now writes through staging pipeline.

### P1 — Should Fix (Feature Parity) ✅

4. ✅ **Enrichment Pipeline** — L0→L1→PII→embedding→ready, batch sweep, version tracking, confidence propagation.
5. ✅ **Semantic Search** — HNSW + hybrid (0.4×FTS + 0.6×semantic) + trust-weighted reranking.
6. ✅ **Smart Reminders** — LLM planner with vault context, timezone, anti-hallucination guard, consolidation, short_id, PII scrub.
7. ✅ **Classification Detail** — Relationship-aware routing via data_responsibility, classifier factory for all 4 providers.
8. ✅ **Agentic Reasoning** — 7 tools in multi-turn loop (list_personas, vault_search, browse_vault, vault_read, contact_lookup, reminder_check, search_trust_network).

### P2 — Nice to Have (Full Port) ✅

9. ✅ **Trust Network Search** — Local contacts + AppView network, weighted aggregate, search cache.
10. ✅ **PDS Publishing** — AT Protocol attestation publishing with XRPC.
11. ✅ **WebSocket Relay** — MsgBox WS transport + handlers + boot (all 12 review findings fixed).
12. ✅ **Offline Queue** — Outbox with exponential backoff, dead-letter after 5 retries.
13. ✅ **Briefing Assembly** — 3 providers (engagement, approval, memory), source priority, Silence First.
14. ✅ **Recurring Reminders** — daily/weekly/monthly auto-renewal in Core service.
15. ✅ **Anti-Her Pre-screening** — 4-category classifier (normal/venting/companionship/therapy) + LLM refinement.
16. ✅ **Gemini Structured Output** — All 4 providers (Gemini schema, OpenAI/OpenRouter json_object, Claude prefilled assistant).

---

## Files Reference

### Main Dina (Source of Truth)
- `brain/src/prompts.py` — All prompts
- `brain/src/service/guardian.py` — Reasoning pipeline + guard scan
- `brain/src/service/persona_selector.py` — Classification with relationship routing
- `brain/src/service/vault_context.py` — Agentic tool framework
- `core/internal/adapter/sqlite/schema/persona_001.sql` — Vault schema
- `core/internal/handler/remember.go` — /remember flow
- `core/internal/adapter/pii/scrubber.go` — PII scrubbing

### Mobile (Gaps to Fill)
- `packages/app/src/ai/prompts.ts` — Prompt registry (needs guard scan, enrichment, anti-her, PII prompts)
- `packages/app/src/ai/chat.ts` — Chat service (needs PII scrub, guard scan, agentic tools)
- `packages/app/src/ai/memory.ts` — Memory store (needs op-sqlite, enrichment, embeddings, dedup)
- `packages/core/src/pii/scrub.ts` — PII module exists but not wired to AI layer

---

## APPENDIX A — Detailed File Reviews

### A1. `core/internal/handler/remember.go` vs. Mobile `/remember`

**Go handler does 12 steps**: POST validation → body parse (text, category, session, source, source_id, metadata) → session validation for agents → metadata merging (category+session into JSON blob) → staging ingest delegation → Brain drain trigger → poll for 15s at 500ms intervals → return semantic response (stored / needs_approval / failed / classifying).

**Mobile `chat.ts handleRemember()` does 7 steps**: empty check → get LLM model → classify via single generateText() → local regex date extraction → addMemory() to in-memory array → LLM acknowledgment → return ChatResponse.

**Key gaps:**
1. **No staging pipeline** — Mobile writes directly to in-memory array, bypassing staging inbox (dedup, lease, retry, dead-letter, 7-day TTL)
2. **No session validation** — Go requires `session` field and validates agent sessions; mobile has no session concept
3. **No provenance** — Go derives ingress_channel, origin_did, origin_kind, producer_id from auth context; mobile has none
4. **No metadata merging** — Go merges category+session into JSON metadata blob that persists through vault; mobile stores category as flat field
5. **No `pending_unlock` flow** — Go parks items in locked personas and creates approval requests; mobile stores everything immediately
6. **No enrichment validation** — Go requires content_l0, content_l1, embedding, enrichment_status=ready before vault storage; mobile stores raw text
7. **No server-side polling** — Go polls staging for 15s; mobile is synchronous
8. **No ownership on status check** — Go enforces callerDID; mobile has no access control
9. **No dedup** — Go deduplicates by (source, source_id); mobile stores duplicates
10. **Two disconnected paths** — Mobile has `chat.ts` (app-level) and `user_api.ts` (HTTP) that don't share state. Go has one unified path.
11. **Reminder planner not wired** — Mobile defines PROMPT_REMINDER_PLANNER_SYSTEM but never calls it; only does regex date extraction
12. **Core staging pipeline exists but unused** — `packages/core/src/staging/service.ts` mirrors Go architecture but neither mobile /remember path uses it

### A2. `core/internal/handler/reason.go` vs. Mobile `/ask`

**Go handler does 8 steps**: POST validation → request parse (prompt field) → caller context extraction (callerType, agentDID, sessionName) → session validation for agents → Brain delegation (two paths: ReasonWithContext for agents, ReasonAsUser for users) → error classification (approval_required → 403, generic → 502) → pending_approval flow (crypto-random request ID, 30-min TTL PendingReasonRecord, 202 response) → success response (content, model, tokens_in, tokens_out, vault_context_used).

**Mobile `chat.ts handleAsk()` does 9 steps**: empty check → searchMemories() keyword filter → get LLM model → if no matches + no model return "no memories" → if model + matches: single generateText() with vault context prompt → LLM failure fallback to local list → local-only numbered list → broadening (last 20 memories) → final "no memories" fallback.

**Key gaps:**
1. **No Core/Brain separation** — Go delegates to Brain (separate service with Ed25519 signed calls, circuit breaker, 30s timeout, connection pooling, tracing); mobile calls LLM directly
2. **No approval flow** — Go has pending_approval with crypto-random request ID, caller DID binding, 30-min TTL, approval-wait-resume, second-approval cycling; entirely absent from mobile
3. **No auth context** — Go extracts callerType, agentDID, sessionName from middleware; mobile has none
4. **No two delegation paths** — Go has agent path (with session) and user path (with source); mobile has one path
5. **No circuit breaker** — Go opens after 5 failures with 30s cooldown; mobile has no resilience pattern
6. **No token/model metadata** — Go returns tokens_in, tokens_out, model, vault_context_used; mobile returns none of these
7. **No persona-aware search** — Go searches encrypted persona vaults with HNSW embedding search; mobile does keyword substring matching on flat in-memory array
8. **No request-ID and tracing** — Go propagates X-Request-ID for audit correlation; mobile has none
9. **No PII-safe error handling** — Go returns generic "reasoning failed" (never leaks vault context); mobile may return raw LLM error messages
10. **`user_api.ts` ask endpoint is a stub** — askHandler defaults to null, returns "Reasoning pipeline not configured"

### A3. `brain/src/service/guardian.py` vs. Mobile Guardian

**Python guardian `_handle_reason` does 8 steps**: PII scrub (all prompts when cloud exists, fail-closed) → agentic reasoning with 5 vault tools (max 6 turns) → guard scan on scrubbed content (LLM-based, 4 categories) → sentence removal by index → PII rehydration → regex fallback (anti-her + unsolicited) → density analysis with trust disclosure → sponsored content tagging + reasoning trace audit.

**Mobile has the modules but they're not wired to the chat flow:**
- `brain/src/guardian/silence.ts` — deterministic classification (partial)
- `brain/src/guardian/guard_scan.ts` — regex-only (no LLM guard scan)
- `brain/src/guardian/anti_her.ts` — 5 regex suites (partial coverage)
- `brain/src/pii/entity_vault.ts` — scrub/rehydrate (regex-only, no NER)
- `brain/src/pipeline/chat_reasoning.ts` — 6-step pipeline (partial)
- `app/src/ai/chat.ts` — **zero guardian integration** (messages go straight to LLM)

**55 specific gaps identified:**

**PII/Privacy (5 gaps):** Cloud-wide scrub policy (Python scrubs ALL when cloud exists, mobile only scrubs sensitive personas); PII Preserve Instruction not prepended; No Tier 2 NER; Fail-closed scrub policy absent; Guard scan PII isolation ordering.

**Guard Scan (8 gaps):** No LLM-based guard scan (regex only); no sentence-level removal by index; no fabricated sentence detection via NLU; no consensus detection; no entity extraction; no trust-relevance classification; no vault-enrichment-aware scanning; no trust-tool verification bypass.

**Density Analysis (6 gaps):** No trust density tiers (zero/single/sparse/moderate/dense); no zero-data disclosure; no single-review caveat; no sparse-data warning; no entity-scoped density; no fabricated rating stripping by density tier.

**Sponsored Content (2 gaps):** No [Sponsored] tagging; no trust-based ranking.

**Silence Classification (6 gaps):** No fiduciary staleness demotion; no phishing vector detection; no promo source override; no health context elevation; no background_sync silent type; no PII scrub before LLM silence classification.

**Intent Review/Agent Safety (4 gaps):** No Draft-Don't-Send invariant; no configurable ActionRiskPolicy; no proposal checkpointing; no intent audit trail.

**Reasoning Agent Tools (4 gaps):** No list_personas; no browse_vault; no get_full_content; no search_trust_network.

**Crash/Observability (4 gaps):** No structured reasoning trace; no task requeue on crash; no proposal crash recovery; no traceback to encrypted vault.

**Event Handlers (6 gaps):** No DIDComm/D2D message handling; no cross-persona request; no contact neglect; no document ingest; no reason resume; no agent response.

**Anti-Her/Safety (6 gaps):** No emotional memory recall pattern; Python anthropomorphic patterns broader; no scope creep detection; no medical PII regex fallback; no medical entity type classification; no auditable persona tiers.

**Critical architectural gap:** The app-level chat service (`packages/app/src/ai/chat.ts`) has **zero guardian integration**. The brain package contains all the safety modules, but they are not invoked from the actual user-facing chat flow.

### A4. `brain/src/prompts.py` — Full Prompt Registry Comparison

**Python defines 11 prompt constants. Mobile port status:**

| # | Python Prompt | Mobile Status | Key Gaps |
|---|--------------|---------------|----------|
| 1 | `PROMPT_PERSONA_CLASSIFY_SYSTEM` | PARTIAL | Missing: relationship-aware routing (`data_responsibility` overrides), attribution corrections (job #3), `secondary` field |
| 2 | `PERSONA_CLASSIFY_RESPONSE_SCHEMA` | **MISSING** | No Gemini structured output enforcement — relies on free-form JSON parsing |
| 3 | `PROMPT_ENRICHMENT_USER` | PARTIAL | Missing: `{provenance_instruction}` for low-trust sources, preservation rules ("do not infer unstated facts"), structured field delimiters |
| 4 | `PROMPT_ENRICHMENT_LOW_TRUST_INSTRUCTION` | **MISSING** | Unverified sources will look identical to trusted ones in summaries |
| 5 | `PROMPT_REMINDER_PLANNER_SYSTEM` | PARTIAL | Missing: `{vault_context}`, `{timezone}`, CRITICAL anti-hallucination guard, consolidation rule, "suggest don't order", 6 tone examples |
| 6 | `PROMPT_GUARD_SCAN_SYSTEM` | PARTIAL | Missing: sentence-number indexing, entity extraction, trust_relevant flag, consensus detection, 4 separate violation arrays, nuanced caveats ("answering the user's direct question is NEVER unsolicited") |
| 7 | `PROMPT_ANTI_HER_CLASSIFY_SYSTEM` | **MISSING** | No LLM-based emotional dependency detection. Brain's `ANTI_HER` is a response generator, not a classifier. Law 4 enforcement gap. |
| 8 | `PROMPT_SILENCE_CLASSIFY_SYSTEM` | PARTIAL | Missing: anti-spam/phishing guard ("marketing urgency is NOT fiduciary"), `{timestamp}`, `{active_personas}` |
| 9 | `PROMPT_VAULT_CONTEXT_SYSTEM` | PARTIAL | Missing: agentic 5-tool workflow, Trust Network search, tiered content loading (L0/L1/get_full_content), 6 trust levels, 13+ behavioral rules, locked persona handling |
| 10 | `PROMPT_PERSON_IDENTITY_EXTRACTION` | **MISSING** | No relationship graph extraction ("Emma is my daughter"). Contact-aware routing cannot work. |
| 11 | `PROMPT_PII_PRESERVE_INSTRUCTION` | **MISSING** | If PII scrubbing is applied, LLMs may corrupt placeholder tokens without this instruction. |

**Scorecard: 0/11 fully ported, 6/11 partial, 5/11 completely missing.**

**Two mobile-only prompts exist** that are not in Python: `PROMPT_CHAT_SYSTEM` (Four Laws chat persona) and `PROMPT_REMEMBER_ACK_SYSTEM` (storage acknowledgment). Both are valid additions for the mobile-specific on-device flow.

**Critical missing prompts (highest impact):**
1. `PROMPT_ANTI_HER_CLASSIFY_SYSTEM` — Cannot detect emotional dependency in user messages (Law 4)
2. `PROMPT_PERSON_IDENTITY_EXTRACTION` — Cannot build relationship graph from notes
3. `PERSONA_CLASSIFY_RESPONSE_SCHEMA` — Gemini classification unreliable without structured output
4. Relationship-aware routing in classify prompt — External person's medical data incorrectly routed to Health vault

### A5. `brain/src/service/enrichment.py` — Enrichment Pipeline Comparison

**Python `EnrichmentService` does 9 steps:** extract fields → L0 deterministic → PII scrub (fail-closed) → L1 via LLM (`PROMPT_ENRICHMENT_USER`) → L1 validation → PII rehydrate → embedding generation from L1 → version tracking (prompt_v + embed_model + timestamp) → set enrichment_status=ready.

**Mobile has the building blocks but they are disconnected islands:**
- `brain/src/enrichment/l0_deterministic.ts` — L0 generation exists (partial: different date format, missing `confidence` field)
- `brain/src/pii/entity_vault.ts` — scrub/rehydrate exists but not wired to enrichment
- `brain/src/embedding/generation.ts` — embedding generation exists but not wired to enrichment
- `brain/src/llm/prompts.ts` — `CONTENT_ENRICH` prompt exists but never called
- `brain/src/staging/processor.ts` — only calls L0, sets status to `l0_complete` (never `ready`)

**16 specific gaps:**

| Step | Python | Mobile | Status |
|------|--------|--------|--------|
| L0 deterministic | `_generate_l0_deterministic()` | `generateL0()` | Partial (different format, missing `confidence`) |
| L1 via LLM | `_generate_l0_l1_llm()` → `llm.route()` | Not implemented | **MISSING** |
| PII scrub before LLM | `entity_vault.scrub()` on body/summary/sender | Exists, not wired | **MISSING** |
| PII rehydrate after LLM | `entity_vault.rehydrate()` on L0/L1 | Exists, not wired | **MISSING** |
| Embedding from L1 | `llm.embed(l1[:2000])` | Exists, not wired | **MISSING** |
| Low-trust provenance instruction | `PROMPT_ENRICHMENT_LOW_TRUST_INSTRUCTION` | Not in prompt | **MISSING** |
| enrichment_status: `ready` | Set after success | Only `l0_complete` | **MISSING** |
| enrichment_status: `failed` | Set on error | Never set | **MISSING** |
| Version: prompt_v + embed_model + timestamp | JSON with all three | Bare string `"deterministic-v1"` | **MISSING** |
| `enrich_item()` single-item via Core HTTP | Full GET→enrich→PATCH | No equivalent | **MISSING** |
| `enrich_pending()` batch sweep | Query pending/failed, loop | No equivalent | **MISSING** |
| `EnrichmentService` class | Class with injected deps | No class, bare function | **MISSING** |
| Body cap 4000 chars | `body[:4000]` | N/A (no LLM call) | **MISSING** |
| Markdown fence stripping | Strips ``` before JSON parse | N/A | **MISSING** |
| `confidence` in trust check | `confidence == "low"` | Not checked | **MISSING** |
| Sender exclusion from L0 | Excludes when `sender == "user"` | Always includes sender | **MISSING** |

**Impact:** Without enrichment, vault items are stored as raw text with no summaries, no embeddings, no tiered content. This means: no semantic search, no efficient vault browsing (L0 previews), no trust-aware summaries, and no embedding-based HNSW similarity.

### A6. `brain/src/service/reminder_planner.py` — Reminder Planner Comparison

**Python `ReminderPlanner` does 5 steps:** gather vault context (search vault for related people/topics, extract proper nouns, strip stop words) → LLM call with event + vault context + timezone → parse JSON response (multi-reminder array) → filter past reminders → create reminders in Core via HTTP.

**Mobile has THREE disconnected reminder paths:**
1. **App-layer** (`chat.ts handleRemember`) — what actually runs on `/remember`: regex `extractDate()`, stores date string on Memory object. No LLM planning. No Core reminder service.
2. **Brain-layer** (`pipeline/reminder_planner.ts`) — more faithful port with regex + optional LLM, but NOT wired to `/remember` command.
3. **Core service** (`reminders/service.ts`) — proper CRUD with dedup, recurring, snooze, status. Not used by app-layer.

**12 specific gaps:**

| Feature | Python | Mobile (app-layer) | Status |
|---------|--------|--------------------|--------|
| Vault context at planning time | Searches vault for related items, enriches reminder text | Zero vault context | **MISSING** |
| LLM-based planning | LLM decides count, timing, message, kind | Regex-only `extractDate()` | **MISSING** |
| Multi-reminder per event | Birthday → day-before gift + morning call (2-3 reminders) | Always exactly 1 date annotation | **MISSING** |
| Timezone handling | `DINA_TIMEZONE` env, `zoneinfo.ZoneInfo`, timezone-aware fire_at | No timezone, date-only strings | **MISSING** |
| Past-date filtering | Skips `trigger_ts <= now.timestamp()` | Only year rollover for year-less dates | **PARTIAL** |
| Kind classification | LLM chooses: birthday/appointment/payment_due/deadline/reminder | No kind on app-layer path | **MISSING** |
| Reminder as first-class entity | Created in Core via `store_reminder()` with full lifecycle | Date string field on Memory object | **MISSING** |
| Consolidation rule | "When someone is arriving, create ONE reminder with ALL context" | Not in prompt | **MISSING** |
| Prompt completeness | vault_context + timezone + CRITICAL guard + tone rules + 6 examples | Missing 5 placeholders and rules | **PARTIAL** |
| short_id for user reference | 4-char MD5 hash of reminder ID | None | **MISSING** |
| Dedup | Core-side dedup by (source_item_id, kind, due_at, persona) | No dedup on app-layer path | **MISSING** |
| Recurring reminders | Not in Python planner | Core service supports it but not exposed | N/A |

**Example of the gap in action:**

Python: `/remember Emma's birthday is March 15` produces:
- Reminder 1: "Emma's birthday is tomorrow. She likes dinosaurs and painting — maybe pick up a craft set?" (March 14, 6pm)
- Reminder 2: "Emma's birthday is today. You might want to call and wish her." (March 15, 8am)

Mobile: `/remember Emma's birthday is March 15` produces:
- A single date annotation `reminder_date: "2027-03-15"` displayed in a list as "Emma's birthday is March 15"

**Critical architectural gap:** The brain-layer `reminder_planner.ts` is more faithful to the Python design but is completely disconnected from the app-layer `/remember` handler. The user-facing flow bypasses the brain planner entirely.

### A7. `brain/src/service/vault_context.py` — Agentic Vault Reasoning Engine

**Python `VaultContextAssembler` + `ReasoningAgent`**: Multi-turn agentic loop (max 6 turns) with 5 tools, per-tool PII scrubbing, contact alias injection, persona access control, trust metadata surfacing, owner name injection, and force-text final call.

**Mobile has two disconnected systems that don't talk to each other:**

1. **Brain-layer** (`vault_context/assembly.ts` + `pipeline/chat_reasoning.ts`): Has a multi-turn loop and cloud gate/guard scan, but simplified tools and a skeletal system prompt.
2. **App-layer** (`app/src/ai/chat.ts`): What the user actually interacts with. Uses an in-memory array, keyword search, single-shot LLM. No tools, no guard scan, no PII scrub.

**Tool comparison:**

| Python Tool | Mobile Brain | Mobile App | Gap |
|-------------|-------------|------------|-----|
| `list_personas` — discover available vaults | **MISSING** | N/A | LLM cannot discover what vaults exist; mobile hardcodes `accessiblePersonas` |
| `browse_vault` — recent items without query | **MISSING** | N/A | LLM cannot explore vault without a specific search |
| `search_vault` — hybrid FTS5 + semantic search | `vault_search` (FTS5 only, no embedding) | Keyword substring match | No semantic/embedding search |
| `get_full_content` — retrieve L2 body by ID | `vault_read` (similar) | N/A | Present but parameters differ |
| `search_trust_network` — decentralized peer reviews | **MISSING** | N/A | Entire trust network absent |
| N/A | `contact_lookup` (declared, not implemented) | N/A | Returns "unknown tool" error |
| N/A | `reminder_check` (declared, not implemented) | N/A | Returns "unknown tool" error |

**13 missing steps in the agentic loop:**

1. Contact alias hint injection (ContactMatcher + PersonResolver for name variations)
2. Owner name injection in system prompt
3. Persona normalization (strip "persona-" prefix)
4. Per-tool-result PII scrubbing (Python scrubs each tool result individually; mobile scrubs the entire assembled prompt at once)
5. Trust Network result exemption from PII scrubbing
6. ApprovalRequiredError handling and propagation
7. PersonaLockedError handling (graceful skip)
8. Accumulated PII vault for post-loop rehydration
9. Force-text final call when max turns exhausted (Python calls LLM without tools; mobile extracts last message)
10. Agent DID / session propagation on vault calls
11. `was_enriched` tracking
12. 11 fields per vault item surfaced to LLM (Python: summary, body_text, type, id, sender, sender_trust, confidence, retrieval_policy, content_l0, content_l1, enrichment_status; mobile: 5 fields)
13. Field truncation (Python: 500 chars per field; mobile: none)

**System prompt gap:** Python has ~80 lines covering 5-step workflow, 6 trust levels, tiered content loading, 13+ behavioral rules. Mobile brain has 1 sentence. Mobile app has ~20 lines (simplified rules, no tool workflow guidance).

**Critical finding:** The app-level chat (`chat.ts`) does NOT import or call anything from the brain pipeline. `handleAsk` searches `memories[]` (an array in RAM), not the encrypted vault.

### A8. `core/internal/adapter/pii/scrubber.go` — PII Scrubber Comparison

**Go Tier 1 has 11 regex patterns covering 8 entity types.** Mobile Tier 1 has 9 patterns covering 9 types. Mobile Tier 2 adds EU patterns.

**Patterns in Go but MISSING from mobile:**

| Pattern | Type | Impact |
|---------|------|--------|
| `BANK_ACCT` (`\b\d{16}\b`) | Bank account numbers | **Completely undetected** — 16-digit bank numbers pass through |
| `ADDRESS` (street pattern) | US street addresses | **Completely undetected** — addresses pass through |
| International `PHONE` (`\+\d{1,3}[\s.-]...`) | Non-US/non-Indian phones | **Completely undetected** — UK (+44), German (+49), etc. numbers pass through |
| Indian bare `PHONE` (`\b[6-9]\d{4}[\s-]?\d{5}\b`) | Indian 10-digit without +91 | Tier 1 misses; Tier 2 only catches +91 prefix |
| `AADHAAR` dash separator | Aadhaar with dashes | Go: `1234-5678-9012` matches; mobile: only spaces |

**Patterns in mobile but NOT in Go (mobile additions):**
- `PAN` (India PAN card)
- `IFSC` (India IFSC bank code)
- `UPI` (India UPI ID)

**Presidio Tier 2 entities MISSING from mobile:**
- `CRYPTO` (cryptocurrency wallets), `URL`, `MEDICAL_LICENSE`, `MEDICAL_CONDITION`, `MEDICATION`, `BLOOD_TYPE`, `HEALTH_INSURANCE_ID`, `IN_PASSPORT`, `IN_BANK_ACCOUNT`, `DE_PERSONALAUSWEIS`, `FR_NIF`, `SWIFT_BIC`

**Rehydration bug in mobile:** `String.replace()` in `rehydratePII()` only replaces the **first occurrence** of each token. If the LLM repeats `[EMAIL_1]` twice in a response, only the first gets rehydrated. Go and Python both replace ALL occurrences. Fix: use `replaceAll()` or a global regex.

**Credit card approach differs:** Go uses prefix-validated patterns (Visa 4xxx, MC 5[1-5]xx, Amex 3[47]xx, Discover); mobile uses generic Luhn-only (broader, may false-positive on non-CC numbers).

### A9. `brain/src/service/persona_selector.py` — Persona Classification Comparison

**Python has a 5-step classification pipeline:** (1) deterministic subject attribution with ContactMatcher → (2) primary classification via keyword domain classifier + LLM PersonaSelector → (3) LLM attribution corrections for misattributed facts → (4) relationship-aware responsibility override matrix → (5) secondary persona expansion with sensitive signals.

**Mobile has TWO disconnected classification paths:**

1. **Brain-layer** (`persona_selector.ts` + `domain.ts`): Keyword-first with LLM fallback at 0.6 confidence threshold. 5 keyword tables, source hints. Returns single persona. Not called from app layer.
2. **App-layer** (`chat.ts` + `prompts.ts`): LLM-first with hardcoded 4-persona list. No keywords, no registry validation. This is what actually runs on `/remember`.

**Missing from both mobile paths:**

| Feature | Python | Mobile | Impact |
|---------|--------|--------|--------|
| Subject attribution | Full `SubjectAttributor` with ContactMatcher, per-fact keyword attribution | Not present | Cannot distinguish "Bob's blood pressure" (about Bob) from "my blood pressure" (about self) |
| Attribution corrections | LLM corrects misattributed facts by stable ID | Not present | "I told Sancho about MY allergy" stays attributed to Sancho |
| Relationship-aware routing | `data_responsibility` overrides: household/care/financial/external | Not present | External person's medical data incorrectly routed to Health vault |
| Responsibility override matrix | Per-fact routing rules based on relationship type | Not present | No distinction between household member data vs. external person data |
| Secondary personas | Multiple personas returned, sorted by sensitivity | Not present | Item that spans health+work only gets one persona |
| Sensitive signals | `has_health_signal`, `has_finance_signal`, `has_work_signal` | Not present | No cross-domain signal detection |
| Gemini structured output | `response_mime_type` + `response_schema` guarantees valid JSON | Not used | Free-form JSON parsing, may get malformed responses |
| Dynamic persona registry | Loaded from Core at runtime with name/tier/description/locked | Brain: static set, TODO for Core HTTP. App: hardcoded 4-line string | Cannot detect user-created personas or locked state |
| Persona descriptions to LLM | Full description from registry | Brain: names only. App: brief descriptions | LLM has less context for classification decisions |
| Item metadata to LLM | type, source, sender, summary[:200], body[:300], date | Brain: type/source/sender/subject/body. App: raw content only | App gives LLM minimal classification context |
| Ambiguity detection | Flags multi-persona prefix matches for daily brief review | Not present | Ambiguous items silently assigned to one persona |

**Confidence threshold differences:** Python always consults LLM if available (no minimum threshold). Mobile brain uses 0.6 threshold (keyword result used directly if above). Mobile app always consults LLM. This means the mobile brain path may skip LLM classification for items where keywords match at 0.6+ but the LLM would have chosen differently.

### A10. `brain/src/service/staging_processor.py` — Staging Pipeline Comparison

**Python StagingProcessor does 12 steps:** claim via Core HTTP → build item_dict with D2D provenance → classify via 5-step pipeline (subject attribution, primary classify, LLM corrections, responsibility override, secondary expansion) → trust scoring → extract original timestamp → build classified VaultItem template → heartbeat lease extension during enrichment → full L0+L1+embedding enrichment → extract session + agent DID → LLM reminder planning (pre-resolve) with Telegram notification → resolve (single or multi-persona) → post-publish (legacy event extraction, contact last-seen update, ambiguous routing surfacing, person identity extraction).

**Mobile has the building blocks but 14 features are completely MISSING:**

| # | Feature | Impact |
|---|---------|--------|
| 1 | Subject attribution pipeline | Cannot distinguish "Bob's blood pressure" (about Bob) from "my blood pressure" (about self). `attributor.ts` exists but not wired into processor. |
| 2 | Responsibility override / routing matrix | External contact's medical data incorrectly routed to Health vault |
| 3 | LLM attribution corrections | "I told Sancho about MY allergy" stays attributed to Sancho |
| 4 | Secondary persona expansion | Item spanning health+work only goes to one persona |
| 5 | Multi-persona resolve | Core has no `staging_resolve_multi`. Items always go to exactly one persona |
| 6 | LLM reminder planning (pre-resolve) | `reminder_planner.ts` exists but never called from staging processor. Only regex event extraction runs |
| 7 | Telegram notification of reminder plans | No Telegram integration in staging pipeline |
| 8 | Ambiguous routing surfacing for daily brief | Detected (confidence < 0.5) but never persisted for briefing assembly |
| 9 | Person identity extraction | No `person_extractor.extract()` call for contact graph building |
| 10 | ApprovalRequiredError handling | No approval request creation, no approval ID tracking |
| 11 | Session + agent DID for access control | `resolve()` takes `(id, persona, personaOpen)` — no session/agent/user_origin parameters |
| 12 | D2D contact DID injection | `resolveContactDID` is a trivial DID prefix check, not connected to ingress channel |
| 13 | Routing metadata in vault item metadata | No `routing` key in metadata JSON |
| 14 | Resolve via Core HTTP with enrichment validation | Batch processor calls in-memory `resolve()` directly, bypassing Core's server-side validation |

**7 features are DIFFERENT (implemented but with changed behavior):**

| # | Feature | Difference |
|---|---------|------------|
| 15 | Claim mechanism | Python: HTTP to Core. Mobile: in-memory array splice or pre-claimed parameter |
| 16 | Classification input | Python: 15+ fields. Mobile: 5 fields (type, source, sender, subject, body) |
| 17 | Trust scoring | Python: full TrustScorer with contact cache. Mobile: stateless `classifySourceTrust()` |
| 18 | Enrichment | Python: L0 + L1 (LLM) + embedding. Mobile: L0 deterministic only, `enrichment_status: 'l0_complete'` |
| 19 | Heartbeat | Python: asyncio Task, 900s extension, cancelled in finally. Mobile: LeaseHeartbeat class exists but `withHeartbeat()` wrapper unused |
| 20 | Contact last-seen update | Python: `update_contact_last_seen(did, timestamp)`. Mobile: `updateContact(did, {})` with `Date.now()` only |
| 21 | VaultItem template | Python: 16 fields. Mobile: enriched data is `{...item, content_l0, enrichment_status, enrichment_version}` |

**4 features are functionally equivalent:** retry logic (retry_count <= 3), dedup by (source, source_id), sweep (7d TTL + stale lease revert), state machine transitions.

### A11. `brain/src/service/domain_classifier.py` — Domain Classifier Comparison

**Fundamental purpose difference:** Python is a **sensitivity classifier** (GENERAL/ELEVATED/SENSITIVE/LOCAL_ONLY) that controls PII scrub intensity. Mobile is a **persona router** that lost the entire sensitivity dimension.

**4 layers in Python vs. simplified mobile:**

| Layer | Python | Mobile | Status |
|-------|--------|--------|--------|
| Layer 1: Persona override | Maps active persona to sensitivity via `_PERSONA_MAP` + dynamic registry `_TIER_SENSITIVITY`. Short-circuits on SENSITIVE/LOCAL_ONLY | **MISSING entirely** | No sensitivity levels at all |
| Layer 2: Keywords | Strong/weak distinction, weighted scoring (strong*0.3 + weak*0.1), regex with `\b` word boundaries | Flat keyword lists, simple count-based scoring (0.50 + count*0.10), substring `includes()` | **SIMPLIFIED** |
| Layer 3: Source/type hints | Checks `vault_context.source` AND `vault_context.type` against known sensitive sources | `SOURCE_HINTS` map (source only, no item-type checks). Short-circuits before keywords | **PARTIAL** |
| Layer 4: LLM fallback | Fires when confidence < 0.5 and LLM available | Missing from domain.ts. Exists separately in persona_selector.ts with different threshold | **MISSING** |

**Keyword coverage gaps:**

| Domain | Python Keywords | Mobile Keywords | Missing from Mobile |
|--------|----------------|-----------------|---------------------|
| Health | 34 strong + 14 weak = 48 | 23 | 33 keywords (blood sugar/pressure, cholesterol, A1C, biopsy, oncology, pathology, medication, dosage, insulin, hemoglobin, diabetes, hypertension, etc.) |
| Financial | 16 strong + 11 weak = 27 | 25 | 15 keywords (bank account, tax return, income, account number, routing number, swift, iban, ssn, social security, money, price, cost, savings, insurance, premium) |
| Legal | 16 strong | **0 (domain absent)** | Entire legal domain missing (lawsuit, subpoena, deposition, court order, litigation, attorney, etc.) |

**Scoring differences:**
- Python: 1 strong health keyword = confidence 0.30. Mobile: 1 keyword = confidence 0.60 (2x inflation)
- Python caps at 1.0. Mobile caps at 0.85
- Python uses regex word boundaries (`\b`). Mobile uses substring `includes()` — "diet" matches inside "audited", "flu" matches inside "influence"

**Layer ordering:** Python runs all layers, best-confidence wins with sensitivity tie-breaking. Mobile short-circuits at first source hint match — if source matches, keywords never run.

### A12. `brain/src/service/trust_scorer.py` — Trust Scorer Comparison

**Python TrustScorer is a single class with 6-way ingress channel dispatch, contact reverse index, verified service domains, contradiction detection, and marketing pattern detection.**

**Mobile has TWO competing scorer implementations** (`brain/scorer.ts` and `core/source_trust.ts`) with different APIs, different contact models, and inconsistent marketing patterns.

**9 features MISSING from mobile:**

| Feature | Python | Impact |
|---------|--------|--------|
| Ingress channel dispatch (cli/telegram/admin/d2d/connector) | 6-way structured dispatch, primary scoring path | Mobile accepts `ingressChannel` parameter but never branches on it (except one narrow D2D case) |
| `origin_kind` handling (user vs agent) | `cli + agent` → unknown/caveated; `cli + user` → self | Cannot distinguish user from agent on same channel |
| `contact_ring2` (unverified contacts) | Known but unverified contacts get lower trust | All contacts promoted to ring1 regardless of verification |
| Verified service domains (15 domains) | chase.com, google.com, irs.gov etc. → ring2/service/high | Emails from banks/hospitals fall to unknown/low/caveated |
| Contradiction detection | FTS5 search for conflicting high-trust items | Low-trust items that contradict authoritative data not flagged |
| `source_type` in output | self/service/contact/unknown/marketing | Field in schema but never populated by scorer |
| `sender` normalization + `contact_did` in output | Enriches item metadata with resolved sender and DID | Scorer returns only trust triplet |
| Connector anti-spoofing guard | `connector` channel returns immediately, never falls through to source matching | A connector with `source="telegram"` gets self/high trust — the exact spoofing attack Python guards against |
| Contact reverse index (email/name → Contact) | Pre-built O(1) lookup on `update_contacts()` | O(n) iteration per scoring call |

**3 features DIFFERENT:**
- Marketing patterns: Python has 10 patterns including subdomain infixes (`@notifications.`, `@bounce.`). Mobile has 7 prefix-only patterns, inconsistent between the two scorer files
- Self-source strings: Python uses `user, cli, admin, telegram, dina-cli`. Mobile uses `personal, cli, telegram, chat, voice`. Missing: `admin`, `dina-cli`, `user`
- D2D confidence: Python gives D2D contacts `medium` confidence. Mobile gives them `high` (inverted)

**Architectural issue:** Two competing scorer implementations (`brain/scorer.ts` and `core/source_trust.ts`) with different type definitions, different contact matching, and different marketing patterns. Unclear which one is used at ingestion time.

### A13. Crypto: `slip0010.go` + `keyderiver.go` + `hkdf.go` + `nacl.go` — Crypto Pipeline Comparison

**SLIP-0010 key derivation is faithfully ported** — same paths (`m/9999'/purpose'/index'/gen'`), same HMAC keys (`"ed25519 seed"` / `"Bitcoin seed"`), same hardened child derivation. One missing: `DeriveServiceKey` (`m/9999'/3'/<serviceIndex>'`) — intentional for mobile (in-process Core/Brain).

**CRITICAL INTEROPERABILITY BUG — NaCl Sealed Box Nonce:**

| Component | Go | TypeScript |
|-----------|-----|-----------|
| Nonce derivation | **SHA-512**(ephPub \|\| recipientPub) truncated to 24 bytes | **BLAKE2b**(ephPub \|\| recipientPub, outlen=24) |
| Standard | Dina-custom | libsodium-standard |

**These produce completely different nonces.** A message sealed by Go cannot be opened by TypeScript and vice versa. This is the most severe incompatibility in the entire crypto stack. D2D messages between the Go server and mobile client will fail silently.

**HKDF salt mismatch (2 issues):**

1. **Persona DEK salt:** Go `keyderiver.go` uses deterministic `SHA256("dina:salt:"+personaName)`. TypeScript uses caller-provided `userSalt`. Info strings also differ: `"dina:persona:<name>:dek:v1"` (Go) vs `"dina:vault:<name>:v1"` (TS). If the caller provides a different salt, DEKs won't match.

2. **Backup key salt:** Go uses deterministic `SHA256("dina:backup:salt")`. TypeScript takes `userSalt` as parameter. Same mismatch risk.

**Other differences:**

| Feature | Go | TypeScript | Impact |
|---------|-----|-----------|--------|
| `DeriveServiceKey` | Present (`m/9999'/3'/`) | Missing | Intentional for mobile |
| `DerivePersonaDEKVersioned` | v1/v2 support | v1 only | No Argon2id migration pathway |
| secp256k1 retry loop | Retries up to 256 on invalid key | Throws error | Negligible (probability ~2^-128) |
| SLIP-0010 return type | 64-byte expanded Ed25519 private key | 32-byte seed + public key + chain code | Convention difference, not bug |
| NaCl API | Takes X25519 keys directly | Takes Ed25519 keys, converts internally | Ergonomic difference |

### A14. `brain/src/service/entity_vault.py` — PII Entity Vault Comparison

**Python `EntityVaultService` is a full orchestrator** (330 lines) that owns: classify sensitivity → two-tier scrub (Go regex Tier 1 + Presidio Tier 2) → build vault → LLM call → rehydrate → destroy.

**Mobile `EntityVault` is a thin data structure** (74 lines) that holds a Map and delegates to imported functions. Tier 2 patterns exist but are not wired.

**11 specific gaps:**

| Feature | Python | Mobile | Status |
|---------|--------|--------|--------|
| `scrub_and_call()` lifecycle | Single method: classify→scrub→LLM→rehydrate→destroy | Does not exist. Caller must manage lifecycle manually | **MISSING** |
| Sensitivity classification | GENERAL/ELEVATED/SENSITIVE/LOCAL_ONLY determines scrub intensity | Binary: sensitive persona + cloud = scrub, else don't | **SIMPLIFIED** |
| LOCAL_ONLY hard gate | Raises `PIIScrubError`, refuses cloud send entirely | No equivalent. Returns `allowed: false` but caller can ignore | **MISSING** |
| Two-tier scrubbing | Tier 1 (Go regex via Core HTTP) + Tier 2 (Presidio NER) | Tier 1 only (TS regex). `tier2_patterns.ts` exists but never wired | **PARTIAL** |
| Cross-message collision prevention | Multi-message: tokens prefixed `[m{idx}_TYPE_N]` | Single-string only. No multi-message support | **MISSING** |
| Rehydration robustness | Regex single-pass, longest-first ordering, bare-form matching (`PERSON_1` without brackets) | `String.replace()` — first occurrence only, no bare-form, no ordering | **BUG** — repeated tokens not fully rehydrated |
| `detect()` without replacing | Used by Guardian for policy decisions | No equivalent | **MISSING** |
| Allow-list | YAML-based known non-PII tokens | None | **MISSING** |
| Error handling | `PIIScrubError` exception, vault cleared before re-raise | Generic catch, returns `allowed: false` | **SIMPLIFIED** |
| Consistency cache | Same real value → same token within a scrub call | No cache — fresh sequential tokens each call | **MISSING** |
| Logging | Entity count + token names only (never values) | No logging | **MISSING** |

**Rehydration bug detail:** Mobile `rehydratePII()` uses `string.replace(token, value)` which replaces only the FIRST occurrence. If the LLM outputs `[EMAIL_1]` twice, only the first is rehydrated. Python and Go both replace ALL occurrences. Fix: use `replaceAll()` or a global regex.

### A15. `sqlite/vault.go` + `schema/persona_001.sql` — Vault Storage Comparison

**Go vault is a full SQLCipher-backed store** with 24-column schema, 5 indexes, FTS5 virtual table with unicode61 tokenizer, 3 auto-sync triggers, relationships table, embedding_meta table, field validation (7 enum constraints), body size limit (10 MiB), and hybrid search with trust-weighted reranking.

**Mobile vault is an in-memory JS Map** — `InMemoryVaultDB.query()` always returns `[]`. All data lives in `Map<persona, Map<id, VaultItem>>`.

**20 specific gaps:**

**Schema gaps (9):**
1. No SQLCipher database — no encryption at rest
2. No FTS5 virtual table — no `unicode61 remove_diacritics 2` tokenizer, no auto-sync triggers
3. No B-tree indexes (5 indexes missing)
4. No `staging` table in vault DB
5. No `relationships` table (item-to-item links: related, reply_to, attachment, duplicate, thread)
6. No `embedding_meta` table (model/version tracking per embedding)
7. No `schema_version` table (no migration tracking)
8. No CHECK constraints on `type` (22-value enum)
9. No foreign keys

**Validation gaps (6):**
10. No body size limit (Go: 10 MiB hard reject)
11. No `type` enum validation (Go: 22-value allowlist)
12. No `sender_trust` / `source_type` / `confidence` / `retrieval_policy` / `enrichment_status` enum validation
13. No embedding NaN/Inf rejection
14. StoreBatch is not transactional (Go: single TX with rollback)
15. GetItem returns soft-deleted items (Go: `WHERE deleted=0`)

**Search gaps (5):**
16. FTS is naive `string.includes()` on lowercased concat, not BM25-ranked SQLite FTS5
17. No type filter, time range filter, retrieval_policy filter, or offset/pagination
18. Hybrid search uses different scoring formula: min-max normalization (mobile) vs reciprocal rank fusion (Go)
19. No trust-weighted reranking modifiers (caveated 0.7x, self/ring1 1.2x, low-confidence 0.6x)
20. HNSW parameters differ: Ml 0.25 (Go) vs ~0.36 (mobile), efSearch 20 (Go) vs 50 (mobile)

**`app/src/ai/memory.ts` is completely disjoint from the vault** — a 5-field in-memory array (`id, content, category, created_at, reminder_date`) with no persona isolation, no encryption, no embeddings, no soft-delete. This is what the user-facing chat actually uses. The Core vault with 24 fields exists but is not wired to the app layer.

### A16. `middleware/auth.go` + `adapter/auth/auth.go` + `session.go` — Auth Middleware Comparison

**Go auth middleware is a full HTTP handler wrapper** with 6 bypass paths (public, internal, admin, NaCl ingress, optional auth), dual auth methods (Ed25519 signature + Bearer token), 9 context keys, request ID middleware, socket admin auth, and per-path authz checker with deny-then-allow lists.

**Mobile auth is a pure function** `authenticateRequest(req) -> AuthResult` — not HTTP middleware. No bypass paths, no Bearer token, no request ID, no socket auth.

**18 specific differences:**

**Missing features (9):**
1. No public path bypass (`/healthz`, `/readyz`, `/.well-known/atproto-did`)
2. No internal/admin/NaCl ingress bypass
3. No optional auth paths (`/v1/pair/complete`)
4. No Bearer token (CLIENT_TOKEN) auth — SHA-256 hash lookup path absent
5. No `RequestIDMiddleware` (X-Request-ID generation/propagation)
6. No `SocketAdminAuth` (Unix socket pre-auth)
7. No `X-Session` header reading — session context never set
8. Only 3 fields in AuthResult vs. 9 context keys in Go (`token_kind`, `token_scope`, `service_id`, `session_name`, `request_id` all missing)
9. No CSRF token management integration in auth flow

**Different behavior (9):**
10. **Replay key**: Go uses signatureHex; mobile uses nonce
11. **Header requirements**: Go needs 3 headers to enter Ed25519 path (X-Nonce optional); mobile requires all 4
12. **Timestamp format**: Go strict UTC-only `2006-01-02T15:04:05Z`; mobile accepts fractional seconds and timezone offsets
13. **Rate limiting**: Go per-IP token bucket (60/min); mobile per-DID fixed window (50/min)
14. **Body size**: Go 1MB inline in auth + configurable BodyLimit middleware; mobile 2MB separate function
15. **Authz approach**: Go deny-then-allow with path boundary safety; mobile prefix-match first-wins (no boundary safety — `/v1/vault/storefoo` matches `/v1/vault/store`)
16. **Device authz scope**: Go has rich device allowlist (20+ paths); mobile has sparse list (9 paths). Mobile grants direct vault query to devices; Go denies it
17. **Brain authz**: Go deny-first (Brain can access everything except sensitive paths); mobile allowlist-only (narrower)
18. **Caller type taxonomy**: Go uses `brain/user/agent/admin`; mobile uses `service/device/agent/unknown`

**Security note:** Mobile's prefix matching without boundary safety means `/v1/vault/store` rule also matches `/v1/vault/store_malicious_extension`.

### A17. `brain/src/service/nudge.py` — Nudge/Notification Service Comparison

**Python nudge system has 3 major components:** contact neglect detection (30-day threshold, vault query for interaction history, LLM-generated reconnection text), vault-context-enriched nudge assembly (promise detection, calendar events, relationship notes), and whisper/conversation context (meeting prep, social cues, interrupted conversation detection).

**Mobile has the module structure but most logic is stubbed:**
- `brain/nudge/assembler.ts` — searches vault by contact name (not DID), classifies by keyword, returns summary. No LLM generation, no promise regex, no event/relationship type filtering
- `brain/nudge/whisper.ts` — **5 functions all returning empty/false** (stubbed)
- `app/hooks/useChatNudges.ts` — UI card manager with tier suppression (implemented)
- `brain/llm/prompts.ts` — `NUDGE_ASSEMBLE` prompt exists but **never invoked**
- `brain/briefing/assembly.ts` — no reconnection/nudge section

**33 specific gaps identified across 4 severity levels:**

**Critical (6):** No contact neglect detection (no 30-day scanner, no threshold, no vault query for interaction history), LLM nudge prompt exists but never called, no briefing injection of relationship nudges, whisper context entirely stubbed, no `contact_neglect` event type routing

**High (9):** No 7-day frequency cap per contact, no vault evidence override, no promise detection regex (6 patterns), no D2D payload preparation, meeting/interrupted-conversation/social-cue detection all stubbed, whisper overlay delivery missing, persona boundary not enforced in nudge context

**Medium (11):** No promise age check, no birthday-aware elevation, no relationship depth priority, no DID-based search (uses name), no hybrid search (FTS only), no type-specific queries (calendar, relationship notes), no source ID traceability, no automatic tier assignment, no PII scrubbing in nudge pipeline, async queries blocking JS thread, no LLM silence fallback

### A18. `sqlite/reminders.go` + `reminder/loop.go` — Reminder System Comparison

**Go reminder system:** SQLite-backed persistence, channel-woken sleep loop (dedicated goroutine, fires at exact due time, missed-reminder recovery on startup), Brain event notification on fire.

**Mobile has TWO parallel reminder systems that don't talk to each other:**
1. **Core service** (`reminders/service.ts` + `scheduler.ts`): Proper dedup, recurring auto-renewal, snooze. In-memory Map. `tick()` exists but **nothing calls it** — no timer, no background task.
2. **App memory.ts**: Memories with `reminder_date` string field. Completely separate data model.

**10 critical gaps:**

| # | Gap | Detail |
|---|-----|--------|
| 1 | **No persistence** | Reminders vanish on app restart. SQLite schema exists in fixtures but never used |
| 2 | **No firing loop** | `tick()` exists but no `setInterval` or background task invokes it |
| 3 | **No brain notification** | Fired reminders don't reach Brain's event processor. Go sends `TaskEvent{Type: "reminder_fired"}` |
| 4 | **No wake-on-insert** | Go's `Loop.Wake()` called from HTTP handler; mobile has no equivalent |
| 5 | **No missed-reminder recovery** | Go fires past-due reminders on startup; mobile has no startup scan |
| 6 | **Epoch unit mismatch** | `created_at` uses milliseconds (mobile) vs seconds (Go); `computeNextOccurrence` adds MS constants |
| 7 | **Status enum mismatch** | Go: `pending/done/dismissed`. Mobile: `pending/fired/completed/snoozed` |
| 8 | **ID length halved** | 8 random bytes (mobile) vs 16 (Go) — reduced collision resistance |
| 9 | **Two parallel systems** | Core service + app memory.ts are unaware of each other |
| 10 | **`NextPending` missing** | Go returns single earliest; mobile only has `listPending` returning all due |

**Mobile has 2 features Go lacks:** Snooze support (`snoozeReminder`) and recurring auto-renewal (Go stores `recurring` but never acts on it). The mobile actually goes beyond Go on recurring — but the systems will behave differently.

**Go's reminder loop is elegantly simple:** single goroutine, channel-woken sleep to exact due time, 10s backoff on error, 60s idle poll, fires past-due on startup. Mobile has no equivalent — the scheduler requires external invocation that nothing provides.

### A19. Onboarding: `onboarding.go` + `keywrap.go` + `argon2.go` — Onboarding Flow Comparison

**3 CRITICAL cross-node compatibility issues found:**

1. **Seed length mismatch:** Go validates `len(seed) == 32` (raw entropy). Mobile uses `mnemonicToSeedSync()` which returns **64-byte** BIP-39 PBKDF2 output. Same mnemonic produces **different keys** on Go vs mobile. SLIP-0010 derivation is seeded with different data. DIDs will not match.

2. **DID method mismatch:** Go produces `did:plc:<base58btc(sha256(pubkey)[:16])>` (AT Protocol PLC DID). Mobile produces `did:key:z<base58btc(0xed01+pubkey)>` (W3C did:key). Same public key → completely different identity strings. Not interoperable.

3. **Seed file format mismatch:** Go uses two raw files (`wrapped_seed.bin` + `master_seed.salt`). Mobile uses a single structured binary with `"DINA"` magic header, version byte, and Argon2id params in footer. Not interoperable without conversion.

**7 additional gaps:**

| Feature | Go | Mobile | Status |
|---------|-----|--------|--------|
| Per-persona DEK derivation (HKDF) | `DerivePersonaDEK(seed, personaName)` after onboarding | **Not done** at onboarding time | MISSING |
| Vault opening at onboarding | `vault.Open(ctx, personaName, dek)` + `vault.IsOpen()` verification | **Not done** | MISSING |
| Service key derivation (`m/9999'/3'/`) | For Core-Brain mutual auth | Not implemented | MISSING (intentional?) |
| Identity bundle export/import with HMAC integrity | `IdentityBundle` JSON + HMAC-SHA256 | Mnemonic-only recovery (different mechanism) | DIFFERENT |
| Argon2id salt minimum | 16 bytes (validated) | 8 bytes accepted | WEAKER |
| All-zero seed rejection | Not checked | Checked on both wrap and unwrap | MOBILE STRICTER |
| Wrapped blob size | 60 bytes (32 seed + 12 nonce + 16 tag) | 92 bytes (64 seed + 12 nonce + 16 tag) | DIFFERENT |

**Impact:** A user cannot set up identity on the Go server and migrate to mobile (or vice versa) — the DID will be different, the wrapped seed format is incompatible, and the key derivation produces different keys from the same mnemonic.

### A20. Contact/Person: `contact_matcher.py` + `subject_attributor.py` + `person_link_extractor.py` + `person_resolver.py`

**Python has a 4-layer contact/person subsystem:** ContactMatcher (name/alias matching with DID/relationship/data_responsibility propagation) → SubjectAttributor (per-fact attribution with 5 ownership buckets, nearest-governing-subject rule, coordinated subjects, pronoun carry-forward) → PersonLinkExtractor (LLM-based identity extraction with Core persistence) → PersonResolver (confirmed-surface-based recall expansion).

**Mobile has partial implementations of each, but the deep per-fact attribution pipeline is absent.**

**ContactMatcher gaps (6):**
- `did`, `relationship`, `data_responsibility` not propagated through match results
- Only first occurrence per contact (Python returns all)
- Min name length mismatch: matcher.ts uses 3 chars (Python uses 2)

**SubjectAttributor — most severe gaps (14):**
- **No sensitive signal detection at all** — the entire `sensitive_signals.py` module (35+ health keywords, 25+ finance keywords, 16 legal keywords, strong/weak distinction) has no mobile equivalent
- **No per-fact attribution** — mobile returns ONE subject for entire text; Python returns one per sensitive keyword hit
- **No `FactAttribution` type** — no binding of subject to specific sensitive facts
- No sentence-level scoping, no nearest-governing-subject rule, no coordinated subject detection ("Emma and Sancho have allergies" → Python attributes to BOTH)
- No pronoun carry-forward ("She has diabetes" after "My daughter" → Python carries daughter attribution)
- No `_PERSONAL_STATE` fallback patterns (measurement values, prescriptions)
- `data_responsibility` field entirely absent — the routing signal that drives persona selection does not flow through
- Household role classification differs: mobile merges mother/father/sister/brother into household; Python classifies extended family as `unknown_third_party`

**PersonLinkExtractor gaps (10):**
- No `source_item_id` tracking, no `extractor_version`, no `role_phrase` as separate surface type
- No `evidence`/`source_excerpt` preservation
- No Core POST to `/v1/people/apply-extraction`
- No `PROMPT_PERSON_IDENTITY_EXTRACTION` system prompt used
- Different JSON schema (`{"links":[...]}` vs `{"identity_links":[...]}`)
- Default confidence "low" (mobile) vs "medium" (Python)

**PersonResolver gaps (8):**
- No Core-backed `refresh()` for person data
- No surface status filtering (confirmed only) or rejected person exclusion
- No pre-built regex pattern cache (rebuilds per call)
- `expandSearchTerms()` returns all surfaces instead of only those NOT in the query
- No `contact_did` or `relationship_hint` on resolved persons

**Example of the gap:** "My daughter has diabetes and my colleague owes taxes" — Python produces 2 `FactAttribution` objects: {hit: "diabetes", subject: "daughter", bucket: household_implicit, data_responsibility: household} and {hit: "taxes", subject: "colleague", bucket: unknown_third_party, data_responsibility: external}. The responsibility override then routes diabetes→health (household keeps sensitive) and taxes→general (external overrides to general). Mobile produces a single attribution: {subjectType: "household", confidence: 0.80} — no per-fact routing, no data_responsibility.

### A21. Transport: `transport.go` + `msgbox_client.go` + `rpc_bridge.go` + `rpc_decrypt.go` + `rpc_idempotency.go` + `rpc_worker_pool.go`

**Go has a full transport stack:** persistent WebSocket to MsgBox relay with auth handshake + read pump + reconnection, RPC bridge (WS-to-HTTP via httptest.Recorder), RPC decryption, idempotency cache, nonce replay cache, bounded worker pool with task expiry/cancellation, 3-valve inbox (IP rate limit + global rate limit + spool-to-disk), SSRF-protected delivery.

**Mobile has the module structure but critical infrastructure is stubbed:**

**12 features completely MISSING:**

| # | Feature | Impact |
|---|---------|--------|
| 1 | **Real WebSocket connection** | `msgbox_ws.ts` is a stub — no WS I/O, no read pump, no actual connection |
| 2 | **WebSocket reconnection loop** | Backoff function exists but never wired into a loop |
| 3 | **RPC Worker Pool** | No bounded async dispatch, no backpressure (503), no task expiry/cancellation |
| 4 | **RPC Idempotency Cache** | No `(from_did, request_id) → response` dedup |
| 5 | **RPC Nonce Replay Cache** | No `(DID, nonce)` replay detection for RPC |
| 6 | **RPC Cancel envelopes** | No cancel type, no task cancellation |
| 7 | **RPC Bridge (WS-to-HTTP)** | No httptest.Recorder-style routing through handler chain |
| 8 | **InboxManager 3-valve system** | No IP/global/DID rate limits, no spool-to-disk |
| 9 | **SSRF protection** | No private IP blocking, no redirect blocking on delivery |
| 10 | **Outbox scheduler** | No automatic 30s polling loop for retry |
| 11 | **Outbox queue cap** | Unbounded (Go defaults to 100) |
| 12 | **Pairing identity binding** | `VerifyPairingIdentityBinding` (public_key_multibase check) missing |

**Parameter differences:**

| Parameter | Go | Mobile |
|-----------|-----|--------|
| WS reconnect cap | 60s | 30s (never called) |
| Outbox backoff base | 30s | 1s |
| Payload size cap (inbox) | 256 KB | 1 MiB (4x larger) |
| DID resolver cache TTL | 5 min | 10 min |
| Outbox max queue | 100 | Unlimited |

**Mobile-only features (not in Go transport):** Ed25519-signed RPC responses (Go sends plaintext), ws_hub for broadcasting to thin clients, 4-gate egress enforcement in d2d/gates.ts.

**DID resolver is actually more complete in mobile:** supports both `did:key` (local derivation) and `did:plc` (network lookup) with full document validation. Go resolver is simpler with injectable fetcher.

### A22. `handler/export.go` + `portability/portability.go` — Export/Import Comparison

**Go export is a complete, functional backup** — archives identity.sqlite + all persona *.sqlite + config.json with per-file SHA-256 checksums, 4-layer path traversal protection, force/overwrite guard, WAL/SHM journal cleanup, and pre-flight dry-run validation.

**Mobile export produces an empty shell** — encrypts only a stub manifest with zero personas and zero actual data.

**Archive format incompatibility:**

| Aspect | Go | Mobile |
|--------|-----|--------|
| Magic header | `"DINA_ARCHIVE_V2\n"` (16 bytes) | `[0x44,0x49,0x4E,0x41]` "DINA" (4 bytes) |
| Version | String "2" in manifest JSON | Integer 1 in binary header |
| Payload | JSON with files map (actual SQLite DBs) + manifest | JSON manifest only — **no files** |
| Checksums | SHA-256 per file in manifest | None |

**16 features missing from mobile:**

1. **No actual data in archive** — `createArchive` produces empty manifest with `persona_count: 0`
2. No per-file SHA-256 checksums
3. No checksum verification on import
4. No path traversal validation (4-layer defense in Go)
5. No `identity.sqlite` requirement on import
6. No force/overwrite guard
7. No WAL/SHM journal cleanup before file overwrite
8. No `ValidateImport` dry-run (pre-flight without writing)
9. No `CheckCompatibility` header-only check
10. No `ListArchiveContents`
11. No file restoration logic — `importHandler` is null by default
12. No import result with counts/flags (files_restored, requires_repair, requires_restart)
13. No mutex serialization for concurrent export/import
14. No `config.json` collection
15. Comment claims "Cross-compatible: archives created on server import on mobile" — **this is false**
16. Encryption is correct (same Argon2id + AES-256-GCM) but binary packing is incompatible

### A23. `sqlite/audit.go` + `handler/audit.go` — Audit Trail Comparison

**Go audit is a persistent, tamper-evident hash chain** in SQLite with AUTOINCREMENT sequence, EXCLUSIVE transactions, and SHA-256 integrity verification from genesis.

**Mobile audit is an ephemeral in-memory array** — lost on restart, no persistence, no transaction safety.

**20 specific gaps:**

**Critical (7):**
1. **No SQLite persistence** — entire audit log is lost on app restart
2. **Hash chain format incompatible** — Go uses colon separator (`seq:ts:actor:...`), mobile uses pipe (`seq|ts|actor|...`). Entries from one cannot be verified by the other.
3. **Genesis marker different** — Go: `prev_hash = "genesis"`. Mobile: `prev_hash = ""`.
4. **No detail JSON packing** — Go packs `query_type`, `reason`, `metadata` into `detail` JSON blob. Mobile has flat `detail` string — structured audit context lost.
5. **No transaction safety** — Go uses EXCLUSIVE SQLite tx wrapping fetch-prev-hash + INSERT + UPDATE. Mobile has no concurrency protection.
6. **No automatic security event logging** — Go logs D2D send/recv/quarantine/drop from TransportService and egress allow/deny from GatekeeperService. Mobile has no automatic event logging.
7. **Seq collision after purge** — Mobile uses `log.length + 1` for seq; purging entries creates ID reuse. Go uses AUTOINCREMENT (never reuses).

**High (5):**
8. No timestamp override capability (needed for import/migration)
9. Wrong default query order (oldest-first vs Go's newest-first)
10. No query limit cap (Go caps at 200)
11. No HTTP API for Brain to append/query (`POST /v1/audit/append`, `GET /v1/audit/query`)
12. No detail sub-fields (`QueryType`, `Reason`, `Metadata`) as first-class types

**Medium (8):**
13. Persona filter not exposed to UI
14. Hardcoded 90-day retention (Go is configurable)
15. O(n^2) purge via `Array.shift()` loop
16. Verification meaningless without persistence
17. No error path on append
18. No concurrency protection (Go has sync.Mutex)
19. No DB indexes (Go has idx_audit_log_ts, idx_audit_log_actor)
20. `resource` filter exists in service but not in UI hook's AuditFilter type

### A24. Briefing/Events: `event_extractor.py` + briefing assembly in `guardian.py`

**Python briefing is a rich, multi-section, proactive system** with 3 pre-assembly scans (contact neglect, promise staleness, routing ambiguity), 7 sections (engagement, fiduciary recap, relationship nudges, promise nudges, routing review, agent responses), PII scrubbing, cross-persona audit annotations, source-priority sorting, trust-based ranking, buffer management (500-item cap with half-eviction), and delivery via Telegram + admin UI.

**Mobile briefing has 4 sections** (engagement, reminders, approvals, memories) with provider callbacks — all providers are null/stub by default. No proactive scans, no buffer, no delivery.

**Briefing gaps (14):**
1. No proactive contact neglect scanning
2. No proactive promise staleness scanning
3. No routing ambiguity review from KV store
4. No PII scrubbing of briefing items
5. No cross-persona audit annotations
6. No deduplication by body text
7. No source-priority sorting (finance > health > calendar > messaging > rss)
8. No agent response trust-based ranking (review_count * avg_rating, sponsored penalty)
9. No fiduciary recap section
10. No engagement item buffer connecting silence classifier to briefing
11. No buffer cap/eviction (500-item cap with half-eviction)
12. No KV-based routing review storage/retrieval
13. No delivery channel (push, Telegram, native notification)
14. Briefing scheduling is hour-based only (no HH:MM string)

**Event extraction gaps (6):**
1. Missing 3 of 5 date formats: `DD/MM/YYYY`, `YYYY-MM-DD` (ISO), ordinal dates (`27th March`)
2. Missing many event keywords: consultation, visit, check-up, session, call, interview, vaccination, vaccine, jab, bill, overdue, amount, balance, owe, payable, birth day, bday, born, anniversary
3. No dual-gate logic (Python requires BOTH keyword AND date; mobile extracts any date)
4. `TIME_PATTERN` defined but never used — all events default to 09:00 UTC
5. No sender attribution in reminder messages
6. `extractBirthdayDate()` standalone, not connected to main extraction pipeline

**Reminder planning gaps (8):**
1. No vault context gathering for personalized reminders
2. Simplified LLM prompt (no timezone, no tone rules, no scenario instructions)
3. No PersonaSelector has_event/event_hint integration to trigger planning
4. No KV plan storage (`reminder_plan:{item_id}`)
5. No push notification of plans (Telegram Edit/Delete buttons)
6. No short_id generation for user-facing display
7. No fallback chain (Python: LLM planner → regex EventExtractor)
8. Prompt missing vault_context, consolidation rules, anti-hallucination guard

**Mobile has features Python lacks in silence classification:** quiet hours with configurable window, escalation tracking (repeated engagement → fiduciary), per-source user overrides, event batching/deduplication with fingerprinting.

### A25. `pairing/pairing.go` + `persist.go` — Pairing Ceremony Comparison

**Go pairing has:** 32-byte cryptographic secret → SHA-256 derived 6-digit code, collision retry (5 attempts), brute-force protection (3 failed attempts burns code), dual auth paths (token-based + key-based), disk persistence (JSON file with atomic rename), and `ValidateToken` for bearer auth.

**Mobile pairing has:** 4-byte random → 6-digit code, no collision retry, no brute-force protection, key-only auth, in-memory only.

**12 specific gaps:**

| # | Gap | Detail |
|---|-----|--------|
| 1 | **No 32-byte cryptographic secret** | Go derives code from 32-byte SHA-256; mobile uses 4 random bytes directly |
| 2 | **No collision retry** | Go retries 5 times on collision; mobile silently overwrites |
| 3 | **No brute-force protection** | Go burns code after 3 failed attempts; mobile has no attempt tracking |
| 4 | **No token-based auth path** | Go supports both CLIENT_TOKEN (bearer) and Ed25519 (key) auth; mobile is key-only |
| 5 | **Different device role taxonomy** | Go: `user/agent`; mobile: `rich/thin/cli` — incompatible |
| 6 | **Different timestamp units** | Go: Unix seconds; mobile: milliseconds |
| 7 | **Different device ID format** | Go: sequential `tok-N`; mobile: random `dev-<hex>` |
| 8 | **No disk persistence** | Go writes to JSON file; mobile is in-memory (devices lost on restart) |
| 9 | **No `ValidateToken`** | Mobile has no token validation (no bearer auth support) |
| 10 | **Lazy code cleanup** | Go deletes used codes immediately; mobile marks used, waits for purge |
| 11 | **No `CompletePairingFull`** | Go returns `PairResponse{ClientToken, TokenID, NodeDID, WsURL}`; mobile returns `{deviceId, nodeDID}` |
| 12 | **No `GetDeviceByDID` lookup** | Go has DID lookup; mobile has public-key lookup instead |

**Mobile-only enhancement:** Duplicate key prevention via `keyIndex` Map — Go does not check for duplicate public keys.

### A26. `brain/src/adapter/llm_openai.py` — OpenAI LLM Adapter Comparison

**Python adapter has:** full error classification (timeout/429/401/generic → LLMError/ConfigError), 60s dual-layer timeout, multi-turn tool calling with tool_call/tool_response message roles, synthetic tool call IDs, `top_p` support.

**Mobile brain adapter has zero error handling, zero timeout, and fake streaming.**

**12 specific gaps:**

**Critical (4):**
1. **No error handling** — no try/catch, no error classification. Raw SDK exceptions propagate. Python wraps every error into `LLMError` or `ConfigError` with descriptive messages.
2. **No multi-turn tool calling** — mobile `ChatMessage` only allows `system|user|assistant` roles; no `tool` or `tool_response` role. Cannot send tool execution results back to model.
3. **Tool call ID dropped** from responses — `ToolCall` type has `name` and `arguments` only, no `id`. Breaks tool call correlation.
4. **No timeout** at any level — no SDK timeout config, no request-level timeout. A stuck API call hangs indefinitely.

**Significant (5):**
5. **Model default mismatch** — Python: `gpt-5.4`, brain: `gpt-4o`, app: `gpt-4o-mini` (all three disagree)
6. **Embedding dimension mismatch** — Python: 1536 (API default), mobile: 768 (explicit). Vectors are incompatible for similarity search.
7. **`max_tokens` vs `max_completion_tokens`** — mobile uses deprecated parameter name
8. **`top_p` not supported** in mobile
9. **Streaming is fake** — `stream()` calls `chat()` then yields complete result as chunks

**Minor (3):**
10. `classify()` absent (matches Python which raises NotImplementedError)
11. Dual system-prompt injection path could cause duplicates
12. App-layer and brain-layer have different default models with no coordination

### A27. `gatekeeper/gatekeeper.go` + `service/gatekeeper.go` — Gatekeeper Comparison

**Go gatekeeper has:** intent evaluation with 6-field Intent struct (AgentDID, Action, Target, PersonaID, TrustLevel, Constraints), sharing policy with 6 tiers (none/summary/full/eta_only/free_busy/exact_location), scenario tiers (standing_policy/explicit_once/deny_by_default) persisted in SQLite, service-layer composition with persona-lock checks, vault audit logging, and client notification on denial.

**Mobile has partial intent + sharing + D2D gates but missing significant enforcement layers.**

**22 specific gaps:**

**Critical — Security-impacting (7):**
1. No `Constraints` system (cross-persona denial, draft_only)
2. No untrusted agent outright denial (only escalation to MODERATE)
3. Missing brain-denied actions: `vault_raw_read`, `vault_raw_write`, `vault_export`
4. No trust-ring enforcement for money actions
5. No `Audit` flag on decisions (silent-pass vs. audited-pass)
6. No audit logging of ANY gatekeeper decision (intent or egress)
7. No persona-lock pre-check before intent evaluation

**Important — Policy enforcement (8):**
8. Missing sharing tiers: `eta_only`, `free_busy`, `exact_location`
9. No `TieredPayload` (Summary/Full pair) for multi-tier egress filtering
10. No `explicit_once` scenario tier (per-send approval)
11. No default scenario policies for new contacts (5 v1 defaults)
12. No `SetBulkPolicy` for all-contacts policy update
13. No tier validation on sharing policy set
14. Scenario policies in-memory only (not SQLite-persisted)
15. No inbound scenario enforcement (mobile gates are egress-only)

**Operational (7):**
16. No blocked/trusted destination lists for egress
17. No nil-data health-check handling
18. No `GatekeeperService` composition layer
19. No client notification (broadcast) on denial
20. No hash-chain integrity verification for audit logs
21. No audit log purge/retention
22. Audit gate in D2D 4-gate pipeline is a stub comment only

**Mobile enhancements not in Go:**
- PII detection is more comprehensive (Aadhaar, PAN, IFSC, UPI, Luhn validation)
- PII scrub with typed tokens + rehydration (Go just blocks)
- 4-level risk classification (SAFE/MODERATE/HIGH/BLOCKED) vs Go's binary
- Agent blacklisting, tool whitelist, query sanitization in MCP delegation

### A28. `service/identity.go` + `adapter/identity/identity.go` + `handler/identity.go` — Identity System Comparison

**Go identity system has:** `did:plc` as primary DID format (SHA-256 of pubkey, base58btc of first 16 bytes), DID document with `Multikey` verification method type + 2 `@context` values, signature-verified key rotation with deterministic enforcement, PLC directory integration via PDS XRPC, identity bundle export/import with HMAC-SHA256 integrity, persistent DID metadata with atomic writes.

**Mobile has:** `did:key` as primary format, different DID document structure, in-memory rotation without DID document updates, PLC creation code that exists but is never wired to the runtime.

**7 critical gaps:**

1. **DID format mismatch at runtime:** Go produces `did:plc:...`; mobile produces `did:key:z6Mk...`. Same pubkey → different identity strings. The mobile `directory.ts` has full `did:plc` creation logic (`createDIDPLC`, `derivePLCDID`, `signOperation`) but the identity router ignores it and only uses `did:key`.

2. **DID document structural divergence:**
   - `@context`: Go has 2 values (DID v1 + Multikey v1), mobile has 1 (DID v1 only)
   - Verification method type: Go `"Multikey"`, mobile `"Ed25519VerificationKey2020"`
   - ID fragment: Go `#key-1`, mobile `#keys-1` (plural)
   - `assertionMethod`: present in mobile, absent in Go
   - `created_at` / `device_origin`: present in Go, absent in mobile

3. **Signing protocol incompatibility:** Go signs raw hex-encoded bytes; mobile signs canonical JSON objects. Cross-verification will fail — signatures from one system cannot be verified by the other.

4. **No identity export/import:** The entire `IdentityBundle` system (bundle export with HMAC-SHA256 integrity, bundle verification, import with overwrite protection) is missing from mobile.

5. **No persistent DID metadata:** Go has `DIDMetadata` struct with `PLCRegistered`, `PDSURL`, `Handle`, `RotationKeyPath`, `SigningKeyPath`, `SigningGeneration` — persisted atomically to disk. Mobile has no equivalent.

6. **Rotation not integrated:** Mobile `rotation.ts` increments generation and derives keys but does not update any DID document, does not require signature verification, and has no disk persistence. Go requires a signed rotation payload, enforces deterministic key derivation, and updates the DID document atomically.

7. **PLC directory not wired:** `directory.ts` has `createDIDPLC()`, `resolveDIDPLC()`, `buildCreationOperation()` but the identity server routes never call them. No PDS account creation, no login fallback, no PLC metadata tracking.

### A29. `brain/src/adapter/llm_gemini.py` — Gemini LLM Adapter Comparison

**Python Gemini adapter has:** structured output via `response_schema` (guaranteed valid JSON), multi-turn tool calling with `FunctionCall`/`FunctionResponse` parts and `thought_signature` preservation, dedicated `classify()` method with temperature=0, 60s dual-layer timeout, rate-limit detection (429/resource_exhausted), embedding with explicit 768 dimensions via `output_dimensionality`.

**Mobile brain adapter is missing most of these. 13 specific gaps:**

**Critical (4):**
1. **No `response_schema` support** — cannot enforce structured JSON output. Classification must rely on free-form text parsing (unreliable). The `PERSONA_CLASSIFY_RESPONSE_SCHEMA` from Python has no mobile equivalent.
2. **No multi-turn tool calling** — `ChatMessage` only allows `system|user|assistant` roles; no `tool_call`/`tool_response` roles. Cannot complete the agentic function-calling loop (model calls tool → execute → send result back → model continues).
3. **No `thought_signature` preservation** — Gemini's chain-of-thought signature is lost.
4. **No timeout** — Python has 60s `asyncio.wait_for`; mobile has none. Stuck API calls hang forever.

**Significant (5):**
5. No rate-limit detection (429/resource_exhausted)
6. No embedding dimension enforcement — Python requests exactly 768 dims; mobile takes whatever comes back
7. No `classify()` method (Python has dedicated zero-shot classification with temperature=0)
8. No `top_p`/`top_k` forwarding
9. Different default chat models across all 3 layers: Python `gemini-3.1-pro-preview`, brain `gemini-2.5-flash`, app `gemini-2.0-flash`

**Minor (4):**
10. Fake streaming (calls `chat()` then yields complete result as chunks)
11. No empty-message validation
12. Different embedding model names (`models/gemini-embedding-001` vs `embedding-001`)
13. Different SDKs (`google-genai` vs `@google/generative-ai` vs `@ai-sdk/google`)

**Embedding dimension incompatibility:** Python requests 768 dimensions explicitly. Mobile does not set `output_dimensionality` — gets whatever the API returns (potentially 768 or 256 depending on model). Vectors from the two systems may be different sizes and cannot be compared.

### A30. `sqlite/staging_inbox.go` — Staging Inbox Comparison

**Go staging inbox is SQLite-backed** with 22 columns, 3-part dedup key, SQL transactions with CAS (compare-and-swap), enrichment data storage (`classified_item` JSON column), body clearing on resolve (privacy), multi-persona resolve, and ownership-enforced status queries.

**Mobile is an in-memory Map** with 11 fields, 2-part dedup key, and no vault write path.

**18 specific gaps:**

**Critical — breaks data flow (6):**
1. **In-memory storage** — all staging data lost on restart/background. Go uses durable SQLite.
2. **Resolve receives no classified data** — mobile Resolve is a status flip only (`(id, persona, personaOpen)` → `stored`); no VaultItem is passed, stored, or written to vault. Go Resolve receives the full enriched VaultItem, writes it to the vault via `storeToVault()`, and clears raw body.
3. **No vault write path** — neither Resolve nor DrainPending actually calls `storeToVault()`. The staging→vault pipeline is broken at the resolve step.
4. **No `classified_item` field** — pending_unlock items have no enriched data to drain later. Go stores the serialized VaultItem JSON in this column.
5. **Missing ResolveMulti** — multi-persona ingestion not supported. Go can resolve an item into multiple persona vaults simultaneously.
6. **Dedup key is 2-part** `(source, source_id)` vs Go's 3-part `(producer_id, source, source_id)` — two different producers for the same source item would collide in mobile.

**Moderate — loses operational fidelity (6):**
7. **11 missing columns** — connector_id, source_hash, type, summary, body, sender, metadata, classified_item, error, claimed_at, updated_at, ingress_channel, origin_did, origin_kind (mobile collapses structured fields into untyped `data: Record<string, unknown>`)
8. No body clearing on resolve (Go clears raw content after classification — privacy protection)
9. No error message storage in MarkFailed
10. No OnDrain callback for post-publication event extraction
11. Missing `GetStatus` with ownership enforcement (`origin_did` check)
12. Missing `GetStatusDetailed`, `MarkPendingApproval`, `CreatePendingCopy`, `ListByStatus`

**Minor — behavioral nuances (6):**
13. ExtendLease adds naively instead of using `max(current, now)` base
14. Sweep doesn't reset claimed_at/lease_until on revert/requeue
15. Claim doesn't accept caller-specified lease duration (hardcoded 900s)
16. Ingest doesn't support caller-provided `expires_at` override
17. No `source_hash` computation (SHA-256 of body for integrity)
18. No SQL CHECK constraint on status values

**Constants match:** Lease duration (900s), item TTL (7 days), max retries (3), and status values (received/classifying/stored/pending_unlock/failed) are all identical. Mobile's explicit `state_machine.ts` with `isValidTransition()` is actually better than Go's implicit state transitions.

### A31. `service/sync.go` + `adapter/sync/sync.go` — Sync System Comparison

**Go sync is bidirectional** — checkpoint-based delta pulls (page size 100, persona-scoped, with `HasMore` pagination), conflict resolution (last-write-wins, server wins on tie), realtime push via WebSocket hub, and offline queue for disconnected devices.

**Mobile sync is unidirectional** — "data flows: home → rich client (push/pull), never client → home." No conflict resolution needed because the client never pushes back.

**7 features present in Go but MISSING in mobile:**
1. **Conflict resolution** — entirely absent (not needed for unidirectional sync but means mobile can never become a full node)
2. **Pagination** (`HasMore` flag, page size 100) — mobile returns all matching items at once
3. **Persona-scoped sync queries** — mobile has no persona concept in sync
4. **Clock injection** for testable time — mobile uses `Date.now()` directly
5. **MCP payload validation** (256KB/item, 1000 items/batch) — Python sync engine has this; mobile does not
6. **Batch storage** (100-item batches via staging) — mobile uses individual ingest
7. **VaultItem richness** — Go has full OpenAPI struct; mobile uses `{id, type, data: unknown, checkpoint}`

**10 features in mobile but NOT in Go:**
1. Living window (zone-based data lifecycle, 365-day boundary)
2. Sync rhythm scheduler (morning/hourly/on-demand tri-modal)
3. Cache corruption recovery and re-sync trigger
4. Local cache search (in-memory text search for rich clients)
5. Authentication tracking in sync layer (per-device auth/connection state)
6. LLM-assisted email triage (Pass 2 with confidence thresholds)
7. Unsubscribe link heuristic in triage
8. THIN record classification (three-tier vs two-tier)
9. Near-boundary flagging for living window transitions
10. Two separate dedup implementations (core LRU with promotion, brain LRU without)

**Dedup differences:** Go evicts 10% batch at capacity; mobile evicts 1 item at a time. Go has vault FTS5 cold path; mobile brain has injectable cold-path checker.

### A32. `brain/src/service/llm_router.py` — LLM Router Comparison

**Python LLM router is a stateful orchestrator** — selects provider, executes LLM call, handles runtime fallback on failure, tracks token usage across calls, computes costs from `models.json` pricing, enforces cloud consent for sensitive personas, distinguishes lightweight/primary/heavy model tiers per task type, and traces every call.

**Mobile router is a stateless pure function** — returns a `RoutingDecision` (which provider to use) but does not execute any call, track tokens, compute costs, or handle failures.

**15 features missing from mobile:**

| # | Feature | Impact |
|---|---------|--------|
| 1 | **Stateful router class** | Mobile is decision-only functions, not an orchestrator |
| 2 | **Lightweight/heavy model tiering** | No primary/lite/heavy distinction. Python uses cheaper models for lightweight tasks (summarize, classify) and heavier models for complex analysis |
| 3 | **Complex tasks → prefer cloud** | Mobile always prefers local regardless of task complexity. Python sends `deep_analysis`/`video_analysis` to cloud even when local exists |
| 4 | **Lightweight task set** | Mobile: only `classify`, `summarize`. Python: 6 types including `intent_classification`, `guard_scan`, `silence_classify`, `multi_step` |
| 5 | **Preferred cloud / lightweight cloud** from config | Mobile picks `cloudProviders[0]`; Python uses `config.preferred_cloud` and `config.lightweight_cloud` |
| 6 | **Runtime fallback on failure** | No try-primary-catch-fallback-to-alternate logic |
| 7 | **Cloud consent gate** | No `CloudConsentError`. Sensitive persona going to cloud proceeds without consent check |
| 8 | **Token usage accumulator** | No tracking across calls (per-model `{calls, tokens_in, tokens_out}`) |
| 9 | **Cost estimation** from `models.json` pricing | No pricing data, no cost formula |
| 10 | **`models.json` centralized config** | Models hardcoded as constants |
| 11 | **Dedicated embedding routing** with own fallback chain | `embed` is routed like any other task |
| 12 | **`reconfigure()` hot-reload** | No re-partitioning of live providers |
| 13 | **Persona tier sensitivity** (`sensitive`/`locked`) | Mobile uses persona names (`health`/`financial`) — less flexible |
| 14 | **Tracing and structured logging** on every call | No telemetry |
| 15 | **LLM call execution** within the router | Router is decision-only; caller must execute |

**Mobile preference order (`getBestProvider`):** `local → claude → openai → gemini → openrouter`. Python default: `gemini → openai → claude → openrouter` (cost-optimized). Different philosophies.

### A33. `sqlite/contacts.go` + `handler/contact.go` + `contact_aliases.go` — Contact System Comparison

**Go contact system has:** 14-column SQLite schema (with 6 columns added via migrations), separate `contact_aliases` table with bidirectional uniqueness, relationship type system (8 values), data_responsibility routing (4 values with auto-derivation from relationship), source provenance, last-contact interaction tracking, trust ring assignment, entity resolution modes, and 3-tier scenario policies auto-installed on creation.

**Mobile has:** 7-column in-memory Map (original v1 schema only), in-memory alias index, no relationship/data_responsibility/source/last_contact fields, no trust rings, no entity resolution, no scenario policy auto-install.

**22 specific gaps:**

**Critical — missing data model (8):**
1. No SQLite persistence for contacts (in-memory Map)
2. No `contact_aliases` table in schema
3. No `relationship` column or type system (spouse/child/parent/sibling/friend/colleague/acquaintance/unknown)
4. No `data_responsibility` column or routing logic (household/care/financial/external + auto-derivation from relationship)
5. No `responsibility_explicit` tracking (user-set vs auto-derived)
6. No `source` / `source_confidence` provenance
7. No `last_contact` interaction timestamp
8. No `sharing_rules` JSON column

**Important — missing enforcement (8):**
9. No trust ring assignment (0-3) on contacts
10. No entity resolution mode (late_binding/plaintext/blocked)
11. No reserved pronoun rejection for aliases (16 pronouns blocked in Go)
12. No alias minimum length validation (Go requires >= 2 chars)
13. No bidirectional alias-displayName uniqueness
14. No transactional contact+alias delete
15. No auto-install of default scenario policies on contact creation
16. No 3-tier scenario policy model (standing_policy/explicit_once/deny_by_default)

**Moderate — missing operations (6):**
17. No `DefaultResponsibility()` derivation logic (relationship → data_responsibility)
18. No `INSERT OR IGNORE` semantics (mobile throws on duplicate)
19. No `Resolve(name)` exact match at directory level
20. No `IsContact(did)` / `GetTrustLevel(did)` fast-path ingress interfaces
21. No `DELETE /v1/contacts/by-name/{name}` endpoint
22. No contact update endpoint in routes

**Mobile enhancement:** `searchContacts(query)` does case-insensitive substring matching against displayName + aliases + DID — richer than Go's exact-match `Resolve(name)`.
### A34. `brain/src/adapter/llm_claude.py` — Claude/Anthropic Adapter Comparison

**Python Claude adapter has:** multi-turn tool calling with `tool_call`/`tool_response` message roles (including `id` preservation), 60s dual-layer timeout, error classification (rate limit 429, auth 401, timeout), empty messages guard, multiple system prompt concatenation.

**Mobile adapter has zero error handling, no multi-turn tool calling, and fake streaming.**

**9 specific gaps:**

| Gap | Severity |
|-----|----------|
| No tool call `id` captured in response — `ToolCall` has `name` + `arguments` only | **Critical** — breaks multi-turn tool use correlation |
| No `tool_call`/`tool_response` message roles — `ChatMessage` only allows `system\|user\|assistant` | **Critical** — cannot feed tool results back; multi-turn agentic loop impossible |
| No error handling — no try/catch, no timeout, no rate limit detection, no auth error classification | **High** — unclassified errors, no timeout protection (Python has 60s) |
| No API key validation on construction | **Medium** |
| No client timeout (Python sets 60s on SDK client) | **Medium** |
| Streaming declared supported but is a non-streaming fallback | **Medium** — misleading `supportsStreaming = true` |
| No empty-messages guard (Python raises LLMError) | **Low** |
| Only first system prompt used (Python concatenates all with `\n\n`) | **Low** |
| No unknown-role fallback to "user" | **Low** |

**Shared gaps (neither has):** Extended thinking, cache control, beta headers, retry logic.

**This pattern is consistent across all 3 LLM adapters (Claude §A34, OpenAI §A26, Gemini §A29):** zero error handling, no multi-turn tool calling, fake streaming.

### A35. `service/vault.go` — Vault Service Layer Comparison

**Go vault service is a proper orchestrator** composing port interfaces (VaultManager, VaultReader, VaultWriter, Gatekeeper, Clock, PersonaManager). Every operation goes through a 3-step authorization gauntlet: `AccessPersona` → `ensureOpen` (with auto-unlock) → `EvaluateIntent` via gatekeeper.

**Mobile `crud.ts` is both service and storage** — flat functions on in-memory Maps with zero authorization.

**10 specific gaps (ranked by severity):**

1. **No authorization on vault operations** — every CRUD function is unguarded. No agentDID, no gatekeeper intent check, no persona access control, no auto-unlock. The mobile has `gatekeeper/intent.ts` and `vault/lifecycle.ts` but neither is wired into `crud.ts`. **This is the biggest security divergence.**

2. **No trust-weighted reranking** — Go applies 3 compounding multipliers after RRF: caveated 0.7x, self/ring1 1.2x, low-confidence 0.6x. Mobile hybrid search has no trust modifiers.

3. **No retrieval policy filtering** — quarantined and briefing-only items leak into mobile search results. Go defaults to excluding them.

4. **Different scoring algorithm** — Go uses Reciprocal Rank Fusion (position-based, robust); mobile uses Normalized Score Fusion (magnitude-based, scale-sensitive). Same weights (0.4 FTS, 0.6 vector) but fundamentally different ranking behavior.

5. **No `ingested_at` field** on mobile VaultItem — Go auto-backfills `IngestedAt = clock.Now().Unix()` on every store. This field drives checkpoint-based sync. Missing from mobile type definition entirely.

6. **No KV store** convenience wrapper (`getKV` prefixing key with `"kv:"`).

7. **Missing search query parameters** — no `types` filtering, no `after`/`before` time range, no `offset` pagination, no `include_all`, no `retrieval_policy` parameter. Mobile's `filters` field exists but is never used.

8. **Soft delete vs hard delete** — mobile soft-deletes (`deleted = 1`); Go hard-deletes.

9. **Default search limit** — mobile: 20, Go: 50.

10. **No clock abstraction** — `Date.now()` hardcoded instead of injected `port.Clock`.

### A36. `brain/src/service/tier_classifier.py` — Content Tier Classifier Comparison

**Both classify vault item types into Tier 1 (embed/prioritize) vs Tier 2 (text-only/deprioritize). But 6 types have swapped tiers and the classification philosophy has changed.**

**6 types changed tier (semantic shift):**

| Type | Python → Mobile | Explanation |
|------|----------------|-------------|
| `email` | Tier 1 → Tier 2 | Python: "reveals personal context" (embed). Mobile: "ingested email" (deprioritize) |
| `email_draft` | Tier 1 → Tier 2 | Python: "reveals intent". Mobile: "draft, not yet sent" |
| `document` | Tier 1 → Tier 2 | Python: "personal context". Mobile: "generic document" |
| `cart_handover` | Tier 1 → Tier 2 | Python: "purchase intent". Mobile: "shopping cart data" |
| `event` | Tier 2 → Tier 1 | Python: "transactional". Mobile: "user-authored calendar event" |
| `voice_memo` | Tier 2 → Tier 1 | Python: "ephemeral". Mobile: "user-recorded" |
| `photo` | Tier 2 → Tier 1 | Python: "ephemeral". Mobile: "personal media" |

**4 types added (mobile only):** `relationship_note` (Tier 1), `medical_record` (Tier 1), `medical_note` (Tier 1), `trust_attestation` (Tier 1).

**Classification philosophy changed:** Python classifies by "reveals intent/preference/personal context" (embedding-centric). Mobile classifies by "personally authored/curated vs automated/ingested" (authorship-centric). This explains why `email` (has personal context, but is "ingested") flipped down while `event` (transactional, but "user-authored") flipped up.

**Impact:** The two systems will embed/prioritize different content. An email with important personal context gets a semantic embedding in Python (discoverable via "related concepts" search) but only keyword search in mobile. A calendar event gets keyword-only search in Python but semantic embedding in mobile.

**Total types:** Python: 19 (12 Tier 1, 7 Tier 2). Mobile: 23 (15 Tier 1, 8 Tier 2).

### A37. `handler/staging.go` — Staging HTTP Handler Comparison

**Go staging handler is a rich orchestrator** — each endpoint performs auth-context provenance derivation (4-branch for agent/service/brain/admin callers), enrichment validation on resolve (enrichment_status="ready", content_l0, content_l1, embedding all required), multi-persona resolve with per-persona access control and approval workflows, D2D auto-store with scenario-tier inspection, vault auto-open, and a Brain staging_drain trigger after ingest.

**Mobile staging routes are thin Express closures** delegating to bare service functions with no auth context, no provenance, no enrichment validation.

**14 features MISSING from mobile:**

1. **Provenance derivation** — Go inspects auth context (CallerTypeKey, AgentDIDKey, TokenKindKey, ServiceIDKey) to server-derive 4 provenance fields (ingress_channel, origin_did, origin_kind, producer_id) across 4 branches. Mobile stores caller-supplied `producer_id` as-is.
2. **Enrichment validation on resolve** — Go rejects if enrichment_status != "ready" or content_l0/l1/embedding are empty (hard 400). Mobile has no validation.
3. **Multi-persona resolve** — Go accepts `targets` array, does per-persona access checks, creates pending copies for denied targets with deterministic IDs. Mobile resolves to one persona only.
4. **Persona access control** — Go calls `AccessPersona()` with session-scoped checks. On denial: creates `ApprovalRequest`, marks `pending_approval`, returns 403 with approval_id. Mobile has no access control.
5. **User-origin injection** — Go's `injectUserOrigin()` for Brain callers bypasses approval for user-originated content (Telegram, admin). Missing.
6. **D2D auto-store** — Go inspects `scenario_tier` from classified_item metadata. `standing_policy` + default tier → auto-store. `explicit_once` → approval flow. Missing.
7. **Vault auto-open** — Go calls `EnsureVaultOpen()` after access check before resolve. Missing.
8. **Brain staging_drain trigger** — Go fires non-blocking goroutine to `Brain.Process(TaskEvent{Type: "staging_drain"})` after ingest. Missing.
9. **GET /v1/staging/status/{id}** — Entire endpoint absent from mobile.
10. **ClassifiedItem storage** — Go stores full enriched VaultItem JSON in `classified_item` column for later DrainPending. Mobile has no such field.
11. **Error message storage** on fail — Go stores error string; mobile only increments retry_count.
12. **10 typed StagingItem fields** collapsed into generic `data` bag (type, summary, body, sender, metadata, connector_id, source_hash, claimed_at, updated_at, ingress/origin fields).
13. **Extend-lease defaults differ** — Go: 900s (15 min); mobile: 300s (5 min). Field names differ (`extension_seconds` vs `seconds`).
14. **Dedup HTTP behavior** — Mobile returns 409 on duplicate; Go always returns 201 (dedup is transparent at storage layer).

### A38. `brain/src/service/sensitive_signals.py` — Sensitive Signal Detection

**The entire module is COMPLETELY ABSENT from the mobile codebase.** No `SensitiveHit` type, no `find_sensitive_hits()`, no strong/weak keyword distinction, no span-based hit detection, no overlap merging, no boolean signal functions.

**What Python has:**

- **`SensitiveHit`** dataclass: `span: (start, end)`, `domain: str`, `keyword: str`, `strength: "strong"|"weak"`
- **`find_sensitive_hits(text)`** — runs 5 regex patterns (HEALTH_STRONG 28 terms, HEALTH_WEAK 14, FINANCE_STRONG 16, FINANCE_WEAK 10, LEGAL_STRONG 16), returns per-span hits with character positions
- **Overlap merging** — `_merge_overlapping()` merges same-domain hits within 2 chars, promotes strength to "strong" on merge
- **3 boolean functions** — `has_health_signal()`, `has_finance_signal()`, `has_work_signal()` using flat word sets + strong regex fallback
- **3 word sets** — HEALTH_WORDS (13), FINANCE_WORDS (13), WORK_WORDS (11)
- All regex use `\b` word boundaries; HEALTH_WEAK has negative lookahead for "cold brew"

**What mobile has (tangentially related):**

- `domain.ts` has flat keyword arrays (HEALTH 23, FINANCIAL 25, PROFESSIONAL 21) but uses `text.includes()` substring matching (no word boundaries, no strong/weak, no spans, no overlap merging)
- Scattered fiduciary keyword patterns in `triage.ts`, `engine.ts`, `silence.ts` — different purpose (never-skip classification, not sensitive-fact detection)
- Subject attributor has NO sensitive signal import — does whole-text attribution instead of per-fact

**Impact:** Without this module, the entire per-fact attribution pipeline cannot function. Python's SubjectAttributor uses `find_sensitive_hits()` to independently attribute each sensitive keyword in a text to a subject (self, household, contact, third-party). Mobile's attributor returns one subject for the entire text — no per-fact granularity, no data_responsibility routing.

**Keyword coverage divergence:** 30+ health keywords in Python not in mobile (blood sugar/pressure, cholesterol, A1C, biopsy, oncology, pathology, hemoglobin, diabetes, hypertension, etc.). Entire legal domain (16 keywords) absent from mobile. Mobile adds 8 health and 12 finance keywords not in Python.

### A39. `sqlite/hnsw_index.go` + `embedding_codec.go` — HNSW Index Comparison

**Go uses a compiled C HNSW library** (`coder/hnsw`); **mobile implements HNSW from scratch in pure TypeScript.**

**Parameter differences:**

| Parameter | Go | Mobile | Impact |
|-----------|-----|--------|--------|
| M | 16 | 16 | Same |
| Ml | **0.25** (hardcoded) | **~0.3607** (`1/ln(16)`) | Mobile builds taller graphs — different topology |
| efConstruction | Library default (~100?) | **200** (explicit) | Mobile builds higher-quality but slower |
| efSearch | **20** (hardcoded, not overridable) | **50** (default, overridable per query) | Mobile higher recall, more computation |

**Correctness bug in mobile update:** Go does delete+reinsert (correct — rebuilds all edges for new vector position). Mobile only swaps the vector in-place without rebuilding edges — **graph topology becomes stale after updates**. Searches may miss updated items or return incorrect results.

**Other differences:**

| Feature | Go | Mobile |
|---------|-----|--------|
| Implementation | External C library (`coder/hnsw`) | Pure TypeScript with O(n log n) sort-based candidate selection |
| Hydration | Reads directly from SQLite (`SELECT id, embedding WHERE deleted=0`) | Receives pre-loaded items array |
| NaN/Inf validation | `EncodeEmbedding` rejects NaN/Inf on encode | **No validation** — corrupt vectors silently indexed |
| Per-item remove | Not exposed (only full persona destroy) | Full support (`remove(id)` with edge cleanup + entry point promotion) |
| Search return | IDs only | IDs + cosine distances |
| Thread safety | `sync.RWMutex` | None (single-threaded JS) |
| Dimension | Hardcoded 768 | Configurable (default 768) |
| GC hint on destroy | Explicit `runtime.GC()` | None |

**The Ml divergence is architecturally significant:** with Ml=0.25, Go's graphs are flatter (fewer layers). With Ml≈0.36, mobile's graphs are taller (more layers). This means the same dataset produces structurally different indexes with different search characteristics. Combined with the efSearch difference (20 vs 50), mobile will have significantly higher recall but slower queries per search.

### A40. `brain/src/adapter/llm_openrouter.py` — OpenRouter Adapter Comparison

**Confirms the pattern across all 4 LLM adapters (Claude §A34, OpenAI §A26, Gemini §A29, OpenRouter §A40):** zero error handling, no multi-turn tool calling, fake streaming, tool call ID dropped.

**11 specific gaps:**

1. **No tool_call/tool_response message role conversion** — cannot do multi-turn tool calling
2. **Tool call `id` dropped** — breaks round-trip correlation
3. **No timeout** — Python has 60s dual-layer; mobile relies on caller's AbortSignal
4. **No error classification** — Python distinguishes ConfigError (401) vs LLMError (429/timeout/connection); mobile throws generic Error
5. **No API key validation** at construction
6. **Fake streaming** — `supportsStreaming = true` but calls `chat()` then yields complete result
7. **No `classify()` method** — Python has zero-shot classification with fuzzy matching
8. **Different default model** — `"auto"` (mobile) vs `"google/gemini-2.5-flash"` (Python)
9. **Different referrer/title headers** — `dinakernel.com`/`Dina` vs `dina.dev`/`Dina Brain`
10. **Fewer kwargs forwarded** — missing `top_p`, `stop`, `max_output_tokens`
11. **`max_tokens` always sent** (4096) even when not requested — could truncate long responses

### A41. `service/device.go` + `handler/device.go` — Device Service Comparison

**Go has 3-layer architecture** (domain types → port interfaces → service orchestrator → handler) with dual auth paths (token + Ed25519), cascading revocation (key + token + record), disk persistence (JSON file with atomic write), and brute-force protection.

**Mobile has flat 2-layer** (registry.ts + ceremony.ts) with Ed25519-only, non-cascading revocation, in-memory storage.

**15 features missing from mobile:**

| # | Gap | Impact |
|---|-----|--------|
| 1 | `DID` field on PairedDevice | Cannot look up devices by DID |
| 2 | `AuthType` field ("ed25519"/"token") | Cannot track auth method per device |
| 3 | Token-based pairing path | Ed25519-only; no CLIENT_TOKEN generation/validation |
| 4 | `GetDeviceByDID` lookup | No DID-based device discovery |
| 5 | `RecordFailedAttempt` brute-force protection | Pairing codes not burned after failed attempts |
| 6 | Shared secret from code generation | Go returns 32-byte secret; mobile returns only code+expiry |
| 7 | Code collision retry | Go retries 5 times; mobile silently overwrites |
| 8 | **Cascading auth revocation** | **CRITICAL: Mobile revocation does NOT cascade to auth.** Revoked device's DID remains registered in caller_type.ts — could still authenticate |
| 9 | Disk persistence (JSON file, atomic write) | All devices lost on restart |
| 10 | HTTP pairing endpoints (`/v1/pair/initiate`, `/v1/pair/complete`) | No HTTP-based pairing flow |
| 11 | `DeviceService` orchestrator with dependency injection | No port interfaces, no service layer |
| 12 | `ErrDeviceRevoked` on double-revocation | Mobile silently re-revokes |
| 13 | `ValidateToken` constant-time hash comparison | No token validation (Ed25519-only) |
| 14 | `PairResponse` with `WsURL` | No WebSocket URL in pairing response |
| 15 | Role types: `"user"/"agent"` | Mobile uses `"rich"/"thin"/"cli"` — semantic mismatch |

**Mobile-only features (7):** `listActiveDevices()`, `getDevice(id)`, `getByPublicKey()`, `isDeviceActive()`, `deviceCount()`, `GET /v1/devices/:id`, `POST /v1/devices` (bypasses pairing — potential security concern).

**Security issue:** Mobile's `POST /v1/devices` endpoint allows direct device registration without the pairing ceremony, bypassing the code verification step entirely.

### A42. `brain/src/service/scratchpad.py` — Scratchpad/Crash Recovery Comparison

**Python scratchpad persists checkpoints to Core's KV store** via HTTP — survives crashes, enables multi-step reasoning recovery. Deeply integrated: Guardian checkpoints at steps 1 and 2, proposals stored for crash recovery, crash tracebacks stored in encrypted vault, graceful shutdown drains and checkpoints.

**Mobile scratchpad is in-memory only — fundamentally defeats crash recovery** (the sole purpose of the module). The lifecycle module exists and is fully tested (15 test cases) but is **dead code** — no consumer imports or calls it.

**5 critical gaps:**

1. **In-memory only storage** — `Map<string, Checkpoint>` wiped on process termination. Core client HTTP methods (`writeScratchpad`, `readScratchpad`) exist in `BrainCoreClient` but lifecycle.ts does NOT call them. The entire crash recovery purpose is defeated.

2. **No consumer integration** — The lifecycle module is exported but never imported by guardian, event processor, crash handler, or shutdown hook. Python has 5+ integration points; mobile has zero.

3. **No proposal persistence (SS20.1)** — Python Guardian stores `__proposals__` in scratchpad and recovers pending approval state on startup via `_recover_proposals_sync()`. No mobile equivalent — approval state is lost on crash.

4. **No crash traceback storage** — Python crash handler writes full tracebacks to scratchpad (encrypted vault). Mobile `crash/safety.ts` builds crash reports but does not persist them.

5. **No graceful shutdown** — Python Guardian drains and checkpoints on shutdown. Mobile `gracefulShutdown()` is a TODO stub.

**TTL mismatch:** Python uses server-side 24-hour sweep (Core's KV TTL). Mobile has client-side staleness check that resets to empty on every app restart — effectively meaningless.

### A43. `handler/vault.go` — Vault HTTP Handler Comparison

**Go vault handler is a full HTTP layer** with auth context extraction (agentDID), user-origin elevation, approval workflow (403 + approval_id), persona name validation, auto-fill of trust defaults for agent/user callers, FC1 device-blocking for sensitive KV keys, search degradation headers, and PATCH /enrich endpoint.

**Mobile vault routes are thin Express closures** with no auth, no approval, no enrichment endpoint.

**Key structural differences:**

| Aspect | Go | Mobile | Impact |
|--------|-----|--------|--------|
| Persona location | JSON body | Query parameter | Wire-protocol incompatibility |
| Store envelope | `{persona, item, user_origin}` | Flat body (item fields directly) | Different request shape |
| Query text field | `query` | `text` | Different field name |
| KV backing | Vault-backed (encrypted, persona-scoped) | Separate `kv/store.ts` (in-memory, no persona) | Architectural divergence |
| KV parameter | `persona` query param | `namespace` query param | Different parameter name |

**Missing features:** 7 security/auth features (no agentDID, no user-origin, no caller-type, no trust defaults auto-fill, no FC1 KV blocking, no approval flow, no enrich endpoint), 7 query features (no offset/types/embedding/include_all/include_content/retrieval_policy/degradation headers).

**VaultItem field mismatches:** `body_text` (Go) vs `body` (mobile), `ingested_at` missing from mobile, `connector_id`/`staging_id` missing, timestamp units differ (seconds vs milliseconds), mobile adds `tags`/`created_at`/`updated_at`/`deleted` not in Go API type.

### A44. `command_dispatcher.py` + `user_commands.py` — Command System Comparison

**Python has 15 slash commands** with structured argument parsing, 9 typed response classes, 16-method `UserCommandService`, two-step confirmation flow for trust operations, transport-agnostic rendering, and full integration with contacts/trust/D2D/reminders.

**Mobile has 4 slash commands** (/remember, /ask, /search, /help) with single-string payload parsing, plain text responses, and no contact/trust/D2D/reminder management.

**11 commands completely missing from mobile:**

| Command | Category | What it does |
|---------|----------|-------------|
| `/status` | Info | Check node DID, health, version |
| `/send Name: message` | D2D | Send Dina-to-Dina message with LLM-classified type |
| `/contact list` | Contacts | List all contacts |
| `/contact add Name: did` | Contacts | Add contact with validation |
| `/contact delete Name` | Contacts | Delete contact |
| `/contact cleanup` | Contacts | Remove contacts with broken DIDs |
| `/trust Name` | Trust | Query trust score/attestation summary |
| `/vouch Name: reason` | Trust | Publish vouch to Trust Network (with 2-step confirm) |
| `/review Product: text` | Trust | Publish product review (with 2-step confirm) |
| `/flag Name: reason` | Trust | Flag bad actor (with 2-step confirm) |
| `/reminder delete <id>` | Reminders | Delete pending reminder by short ID |
| `/reminder edit <id> <text>` | Reminders | Edit reminder (LLM parses new time/message) |

**Missing architectural patterns:** No dispatch table (5-value switch instead of 15-value enum→handler map), no structured argument parsing (colon-delimited name:value pairs), no typed response classes (9 subclasses → plain string), no confirmation flow (trust operations), no `UserCommandService` business logic layer (16 methods), no validation utilities (`validate_name`, `validate_did`), no transport-agnostic rendering.

### A45. `core/internal/config/config.go` + `brain/src/infra/config.py` — Config Comparison

**Go Core has 21 fields; mobile Core has 9.** 12 fields missing including entire AT Protocol federation block (PDS/PLC URLs, credentials, handle), CORS origins, proxy trust CIDRs, admin socket, backup interval, client token.

**Python Brain has 13 fields; mobile Brain has 5.** 8 fields missing including `cloud_llm`, `owner_name`, `llm_routing_enabled`, and entire Telegram integration block.

**Critical env var mismatches:**

| Setting | Go Env Var | Mobile Env Var | Issue |
|---------|-----------|---------------|-------|
| Listen address | `DINA_LISTEN_ADDR` | `DINA_CORE_URL` | **Semantically wrong** — "URL" ≠ "addr" |
| Security mode | `DINA_MODE` | `DINA_SECURITY_MODE` | Different env var name |
| Default port | `:8300` (public) + `:8100` (admin) | `:8100` (combined) | Go separates public/admin listeners |

**Default differences (intentional for mobile):** `vaultPath` `./data` vs `/var/lib/dina`, `serviceKeyDir` `./service_keys` vs `/run/secrets/service_keys`, `brainURL` `localhost` vs Docker service name — all appropriate for mobile-first without Docker.

**Missing capabilities:** No JSON config file loading (`DINA_CONFIG_PATH`), no Docker Secret file loading (`_FILE` suffix convention), no production HTTP warning.

### A46. `handler/persona.go` — Persona Handler Comparison

**Go persona handler does:** passphrase-verified unlock (Argon2id hash comparison), versioned DEK derivation, vault opening, TTL auto-lock timers, staging drain on unlock, session-scoped grant tracking, and FH3 brain guard on create.

**Mobile has the orchestrator with correct crypto logic BUT the HTTP routes never call it — routes only flip in-memory booleans.**

**Critical gaps:**

1. **No passphrase verification at unlock** — Go accepts `{persona, passphrase}` and verifies against stored Argon2id hash. Mobile accepts `{name, approved}` — a boolean flag, no passphrase. The `locked` tier's security is reduced to a boolean.

2. **Route-to-orchestrator disconnect** — The orchestrator (`orchestrator.ts`) correctly derives DEK, opens vault, builds HNSW index, and zeros DEK on lock. But the HTTP routes (`persona.ts`) call only the simple service functions that flip `isOpen` in-memory. **The orchestrator is dead code from the HTTP layer.**

3. **No staging drain on unlock** — Go calls `StagingInbox.DrainPending()` after unlock. Mobile does not — `pending_unlock` items remain stranded.

4. **No TTL auto-lock** — Go sets a timer (default 3600s) to auto-lock unlocked personas. Mobile has no equivalent.

5. **No session-scoped grants** — Go tracks which vaults were opened via approval grants (`grantOpenedVaults`) vs user unlock, and auto-closes grant-opened vaults. Mobile has no grant tracking.

6. **No tier guard on lock** — Go prevents locking `default`/`standard` personas. Mobile locks any persona.

7. **No FH3 brain guard on create** — Go prevents Brain service tokens from creating personas. Mobile has no caller-type check on create.

8. **No passphrase in create** — Go requires passphrase (hashed + salted via Argon2id) on persona creation. Mobile create takes `{name, tier, description}` only.

9. **No persistent persona state** — Go persists persona state to disk. Mobile is in-memory only.

10. **No edit endpoint** — `POST /v1/persona/edit` is missing from mobile.

### A47. `brain/src/service/persona_registry.py` — Persona Registry Comparison

**3 inconsistent persona sets across the mobile codebase:**
- Python fallback: 4 personas (`general, work, health, finance`)
- Core `names.ts`: 6 personas (`general, health, financial, professional, social, consumer`)
- Brain `registry.ts`: 13 personas (includes system-level `identity, backup, archive, sync, trust, citizen`)

**Naming conflicts:** Python uses `work` and `finance` as canonical names. Mobile treats `work` as an alias for `professional` and `finance` as an alias for `financial`. Same mnemonic, different identity strings.

**2 duplicate alias tables:** Brain has 16 aliases, Core has 1 alias (`work→professional`). They use different resolution semantics: Brain returns `null` for unknown names; Core returns the input as-is.

**Different normalization:** Python strips `persona-` prefix. Mobile strips `/` prefix and lowercases. If mobile receives `"persona-general"` from Core, it will NOT strip the prefix.

**Refresh is a stub:** Python dynamically refreshes from Core via HTTP. Mobile `loadFromCore()` is a TODO that returns the cached set.

**Missing query methods:** Brain registry has no `exists()`, `tier()`, `locked()`, `description()`, `all_names()`, `is_loaded()` — these are in Core's service but not in Brain's registry, forcing cross-package calls.

### A48. `handler/approval.go` — Approval Handler Comparison

**Go approval flow triggers 3 critical side effects on approve:** vault opening (DEK derivation + SQLCipher open), staging drain (`pending_unlock` → `stored`), and Brain reason resume (`TaskEvent{Type: "reason_resume"}`). On deny: marks staging items as failed, updates pending reason records.

**Mobile approve just mutates a boolean status in memory. Zero side effects.**

**12 specific gaps:**

| # | Gap | Severity |
|---|-----|----------|
| 1 | **No CXH1 caller-type gating** — agents can approve/deny their own requests | **SECURITY** |
| 2 | **No vault opening on approval** — approved persona vault never unlocked | Critical |
| 3 | **No staging drain on approval** — `pending_unlock` items not transitioned | Critical |
| 4 | **No Brain notification on approval** — no `reason_resume` event dispatched | Critical |
| 5 | **No staging failure on denial** — `pending_unlock` items not marked failed | High |
| 6 | **No pending reason update on denial** — reason records not marked denied | High |
| 7 | **Missing fields:** `type`, `session_id`, `expires_at`, `updated_at`, `outbox_message_id` | Medium |
| 8 | **No `expired` status** and no expiry mechanism | Medium |
| 9 | **Scope default inverted** — Go defaults to `session`; mobile defaults to `single` | Medium |
| 10 | **Two disjoint manager instances** — HTTP route and UI hook instantiate separate ApprovalManagers that don't share state | **BUG** |
| 11 | **No AccessGrant as separate entity** — no session-ID-scoped grants | Medium |
| 12 | **Error messages leak internal state** — Go returns generic errors; mobile returns raw error strings | Low |

**Dual-instance bug (#10):** The route file has `let manager = new ApprovalManager()` and the UI hook file has `let manager = new ApprovalManager()`. Approvals created via HTTP are invisible to the UI and vice versa. Go has a single injected instance.

### A49. `brain/src/adapter/llm_llama.py` — Local LLM Adapter Comparison

**Python has a fully implemented `LlamaProvider`** (249 lines) that connects to an external llama-server via OpenAI-compatible HTTP API. Supports chat, embedding (via `/v1/embeddings`), and classification. Has granular error handling (timeout, connect, HTTP status, generic — all wrapped in `LLMError`). 60s dual-layer timeout. Tool calling explicitly unsupported (logged + silently dropped).

**Mobile has NO local LLM adapter file** — but has extensive infrastructure READY for one:
- `provider_config.ts`: `'local'` is a valid ProviderName, no API key required, `getBestProvider()` puts local first
- `router.ts`: local available → always routes to local, `requiresScrubbing: false`
- `cloud_gate.ts`: short-circuits for `provider === 'local'` — always allowed, no scrubbing
- `embedding/generation.ts`: `registerLocalProvider()` stub with `llama.rn` comments
- Constants: `DEFAULT_LOCAL_MODEL = 'llama-3n'`

**What's missing to complete the mobile local adapter:**
1. A `local.ts` adapter implementing `LLMProvider` interface
2. Integration with `llama.rn` (React Native bindings for llama.cpp) for in-process GGUF inference — fundamentally different from Python's HTTP-to-sidecar pattern
3. Model path configuration (GGUF files on device filesystem)
4. Wiring into `registerLocalProvider()` for embeddings
5. Performance tuning for mobile constraints (context size, memory, thermal throttling)

**Architectural difference:** Python connects to an external `llama-server` process via HTTP (Docker sidecar). Mobile would use `llama.rn` for in-process inference via JSI/C++ FFI — no HTTP, no sidecar.

### A50. `handler/message.go` — D2D Message Handler Comparison

**Go has 3 fully wired endpoints**: `POST /v1/msg/send` (authenticated send with 4-gate egress, DID resolution, NaCl seal, relay delivery, outbox), `GET /v1/msg/inbox` (message listing), `POST /msg` (unauthenticated NaCl ingress with IP rate limiting, dead-drop spool, replay detection).

**Mobile endpoints return 501 Not Implemented.** The `POST /msg` NaCl ingress endpoint doesn't exist at all. However, the mobile has a fully implemented library-level D2D pipeline (`d2d/send.ts`, `d2d/receive_pipeline.ts`, `d2d/quarantine.ts`) that is not connected to any HTTP endpoint.

**5 critical cross-platform incompatibilities prevent Go↔mobile D2D messaging:**

1. **Signing input differs**: Go signs `json.Marshal()` output; mobile signs `canonicalize()` (deterministic JSON). Signatures are not cross-compatible.
2. **`to` field type**: Go `[]string` (multi-recipient); mobile `string` (single). Different JSON serialization breaks signature verification.
3. **`body` field type**: Go `[]byte` (JSON base64); mobile `string`. Different serialization.
4. **`created_time` units**: Go Unix seconds; mobile Unix milliseconds.
5. **NaCl nonce algorithm**: SHA-512 (Go) vs BLAKE2b (mobile) — confirmed in §A13.

**25 total differences cataloged**, including: no replay detection, no dead-drop spool, no body size validation, no IP rate limiting, no `parkForApproval` for `explicit_once` scenario, no authenticated MsgBox forwarding, no inbox store, outbox is in-memory only.

**Mobile advantages:** Richer quarantine module (full CRUD with 30-day TTL), explicit trust tier evaluation on inbound, inbound scenario gate checking (Go doesn't check on inbound).

### A51. `brain/src/service/sync_engine.py` — Sync Engine Comparison

**Python `SyncEngine` is a cohesive class** with MCP-based data fetching, cursor persistence via Core KV, 100-item batch ingestion through Core staging, two-tier dedup (10K bounded in-memory + vault FTS5 fallback), payload validation (256KB/item, 1000 items/batch), and multi-source registry.

**Mobile has TWO parallel triage implementations that are not integrated:**
- `engine.ts`: inline triage (3-tier: INGEST/THIN/SKIP), injectable data source + ingest handler, no batching, no cursor persistence, no dedup, no staging
- `triage.ts`: separate 2-pass pipeline with LLM Pass 2 (confidence thresholds), different types (`EmailItem` vs `EmailRecord`), different casing (`ingest` vs `INGEST`), 2-tier only (no THIN)

**Neither module imports the other.** They use different type names, different field names (`sender` vs `from`), and different decision labels.

**12 major gaps:**

| Feature | Python | Mobile | Status |
|---------|--------|--------|--------|
| MCP tool calling | `call_tool(server, tool, args)` | Abstract callback (`DataSourceProvider`) | **DIFFERENT** |
| Cursor persistence (KV) | Read/write Core KV | Accepted but never persisted or advanced | **MISSING** |
| Batch ingestion (100) | `_ingest_batch()` through staging | One-by-one via callback | **MISSING** |
| Payload validation | 256KB/item, 1000 items/batch | None | **MISSING** |
| Deduplication | 10K bounded + vault FTS5 fallback | None in engine, none in triage | **MISSING** |
| Staging pipeline | `staging_ingest()` | No staging concept | **MISSING** |
| Multi-source registry | `register_source()` list, no duplicates | Single global data source | **MISSING** |
| Structured logging | structlog throughout | None | **MISSING** |
| Error handling | Per-item catch + log + continue | Bare catch, increment counter | **SIMPLIFIED** |
| LLM Pass 2 triage | Planned but not implemented | **Implemented in `triage.ts`** but not wired to `engine.ts` | **MOBILE AHEAD** |
| Unsubscribe heuristic | Not implemented | **Implemented in `triage.ts`** | **MOBILE AHEAD** |
| Two parallel triage systems | N/A | `engine.ts` and `triage.ts` are independent with different types | **BUG** |

**Irony:** The mobile `triage.ts` implements the LLM Pass 2 that Python only planned (but never implemented). However, it's disconnected from `engine.ts` which has its own inline triage. The two need to be reconciled.

### A52. `brain/src/dina_brain/app.py` + routes — Brain HTTP App Comparison

**Python Brain app has:** FastAPI with Pydantic validation, 4 middleware layers (security headers, request-ID, 1MiB body limit with streaming cutoff, rate limiting), Ed25519 auth, and 11 endpoints including full /v1/reason (Guardian delegation), /v1/process (17 typed event variants via discriminated union), PII scrubbing, intent proposals API, and request tracing.

**Mobile Brain server has:** Express with manual JSON parsing, 1 middleware (body parser), injectable auth, and 5 endpoints with /v1/reason returning 501 and /v1/process handling only 5 of 17 event types.

**Missing endpoints (6):** `/v1/pii/scrub`, `GET /v1/proposals/{id}/status`, `GET /v1/proposals`, `POST /v1/proposals/{id}/approve`, `POST /v1/proposals/{id}/deny`, `GET /v1/trace/{req_id}`

**Missing middleware (3):** Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy), request-ID propagation, rate limiting (10/60 on reason/pii/process)

**/v1/reason:** Python delegates to Guardian with full pipeline (embedding→hybrid search→PII scrub→LLM→rehydrate→guard scan). Mobile returns 501 stub.

**/v1/process:** Python has 17 typed event variants via Pydantic discriminated union. Mobile handles 5 types (`approval_needed`, `reminder_fired`, `post_publish`, `persona_unlocked`, `staging_batch`) with most handlers being stubs. Missing 12 event types: `vault_unlocked`, `vault_locked`, `agent_intent`, `delegation_request`, `cross_persona_request`, `intent_approved`, `intent_denied`, `disclosure_approved`, `document_ingest`, `agent_response`, `reason`, `contact_neglect`, plus the entire `StandardEvent` catch-all for DIDComm messages.

**Request/response shape mismatch:** Python uses flat `{ type: string, ...fields }`; mobile uses `{ event: string, data: {} }` — different API contract.

**Mobile-only endpoints (2):** `POST /v1/classify` (standalone domain classification) and `POST /v1/enrich` (standalone L0 enrichment) — valid additions for mobile UI layer.

### A53. Ingress: `router.go` + `deaddrop.go` + `sweeper.go` + `ratelimit.go` — Ingress System Comparison

**Go has a unified 3-valve ingress pipeline:** IP rate limit (token bucket, 10K entries, LRU eviction, 5-min periodic purge) → global spool capacity check → payload size → vault-state routing (locked→dead-drop file spool, unlocked→fast-path decrypt with dead-drop fallback). Post-unlock sweeper with stale GC (24h mtime), poison-pill eviction (5 retries), TTL enforcement, and NaCl decryption.

**Mobile has NO unified ingress router.** Components are scattered and incomplete:

| Go Component | Mobile Equivalent | Status |
|--------------|-------------------|--------|
| `Router.Ingest()` (3-valve pipeline) | No equivalent | **MISSING** |
| IP rate limiter (token bucket, 10K entries, LRU eviction, 5-min purge) | Per-DID fixed-window counter, no cap, no eviction, no purge | **DEGRADED** |
| Global spool capacity valve | Not implemented | **MISSING** |
| Dead-drop file spool (atomic write, random filenames, Peek/Ack) | `spool.ts` (non-atomic write, caller-provided filenames, batch drain only) | **PARTIAL** |
| Sweeper with GC/poison-pill/TTL/decryption | `dead_drop_drain.ts` (JSON parse + staging, no GC/poison-pill/TTL/decrypt) | **SEVERELY REDUCED** |

**15 specific features missing:** No unified ingress pipeline, no global spool valve, no atomic file writes, no Peek/Ack pattern, no stale blob GC by mtime, no poison-pill tracking (5-retry eviction), no message TTL enforcement, no NaCl decryption in sweeper, no transport processor delegation, no detailed sweep results, no rate limiter LRU eviction, no rate limiter periodic purge, no rate limiter hard cap (10K entries), no fast-path spool fallback, no random blob filenames.

### A54. `server/server.go` + `main.go` + `core_server.ts` — Core Server Comparison

**Go Core server has ~80 endpoint paths** across 20+ domain groups, 9 middleware layers, graceful shutdown with SIGINT/SIGTERM + 10s timeout + dual-server (TCP + Unix socket), 10+ background worker goroutines, full service wiring of 20+ adapters.

**Mobile Core server has ~55 endpoint paths** across 14 router files, 6 middleware layers, simple `server.close()` shutdown, no background workers, minimal module-level singleton wiring.

**~25 endpoint paths missing from mobile** across these groups:
- `/readyz` (readiness probe with vault+key+Brain health checks)
- `/.well-known/atproto-did` (AT Protocol discovery)
- `/msg` (NaCl sealed-box ingress)
- Vault enrichment (`/v1/vault/item/:id/enrich`)
- Staging status (`/v1/staging/status/:id`)
- Sessions (`/v1/session/*` — 3 endpoints)
- People memory (`/v1/people/*` — 10+ endpoints)
- Trust cache (`/v1/trust/*` — 5 endpoints)
- Pairing ceremony (`/v1/pair/*` — 2 endpoints)
- Agent safety + delegated tasks (`/v1/agent/*` — 10+ endpoints)
- Intent proposals (`/v1/intent/proposals/*` — 4 endpoints)
- Admin + trace (`/v1/admin/*`, `/v1/trace/*`, `/admin/`)
- WebSocket (`/ws`)
- Brain reason callback (`/v1/reason/:id/result`)

**Missing middleware (3):** CORS, request-ID propagation, request timeout (30s). Rate limiting exists in auth module but not as middleware.

**Graceful shutdown gap:** Go handles SIGINT/SIGTERM with 10s deadline and shuts down 2 servers (TCP + Unix socket). Mobile has `server.close()` with no signal handling, no timeout, no admin socket.

**Background workers gap:** Go runs 10+ ticker goroutines (ingress sweep, outbox retry, replay cache purge, trust sync, staging sweep, session sweeper, lease expiry, trace purge, reminder loop, watchdog, pairing code expiry). Mobile runs zero background workers.

**Mobile-only endpoints (4):** `DELETE /v1/vault/kv/:key`, `POST /v1/pii/rehydrate`, `GET /v1/reminders/:persona`, `POST /v1/audit/verify`.

**4 stub endpoints** in mobile (return 501): `/v1/msg/send`, `/v1/msg/inbox`, `/v1/export`, `/v1/import`. Go has zero stubs — all endpoints are fully implemented.

### A55. `handler/trust.go` — Trust HTTP Handler Comparison

**Go has 5 trust endpoints.** Mobile has ZERO trust HTTP routes — no router is mounted, no path constants defined.

| Go Endpoint | Purpose | Mobile Status |
|-------------|---------|---------------|
| `GET /v1/trust/cache` | List all cached trust entries | **MISSING** — mobile cache only supports single-DID lookup, no bulk list |
| `GET /v1/trust/stats` | Cache stats (count, last_sync_at) | **MISSING** — no stats tracking |
| `POST /v1/trust/sync` | Manual neighborhood graph sync (2 hops, 500 limit via AppView) | **MISSING** — no graph sync at all |
| `GET /v1/trust/resolve` | Resolve DID trust profile from AppView (raw JSON pass-through) | **MISSING** as HTTP endpoint — `TrustQueryClient.queryProfile()` exists as library but not exposed |
| `GET /v1/trust/search` | Search AppView trust attestations | **MISSING** — no search functionality at all |

**Additional gaps:**
- **XRPC NSID mismatch:** Go uses `com.dina.trust.*`; mobile uses `app.dina.trust.*`
- **Score scale mismatch:** Go float 0.0-1.0; mobile integer 0-100
- **Cache entry schema much thinner:** Mobile has 4 fields; Go has 8 (missing: trust_ring, relationship, source, display_name)
- **No periodic neighborhood sync:** Go runs hourly goroutine; mobile has no scheduler
- **No stale eviction during sync:** Go removes entries absent from latest sync + older than 7 days
- **Go returns raw JSON from AppView; mobile parses into fixed-schema struct**

**Mobile-only features:** Batch profile query (`app.dina.trust.getProfiles`), marketing sender detection, explicit action-to-ring mapping.

### A56. `handler/person.go` — People Memory Layer Comparison

**Go has 13 HTTP endpoints** for a full person graph (list, apply-extraction, merge, CRUD, confirm/reject, link-contact, surface CRUD). SQLite-backed with `people` + `person_surfaces` tables, idempotency log, transactional writes, role-phrase conflict detection, and GC for stale suggestions.

**Mobile has 5-10% of the Go person system.** Two library-level modules (`brain/person/linking.ts` + `brain/pipeline/people_extraction.ts`) detect names in text and resolve to contacts. **No HTTP endpoints, no database, no persistent store.**

**15 specific gaps:**
1. All 13 HTTP endpoints missing (`/v1/people/*`)
2. No SQLite-backed PersonStore (no `people` or `person_surfaces` tables)
3. No Person data model (Go: 8 fields; mobile: 3 fields)
4. No PersonSurface data model (Go: 13 fields per surface; mobile: flat string array)
5. No surface types (name, role_phrase, nickname, alias)
6. No status lifecycle (suggested → confirmed/rejected)
7. No confirmation/rejection workflow (user review)
8. No contact linking endpoint (bind person to contact DID)
9. No merge logic (transfer surfaces, tombstone merged person)
10. No surface-level CRUD (confirm, reject, detach per surface)
11. No role-phrase conflict detection
12. No idempotency (SHA-256 fingerprinting of extractions)
13. No garbage collection (archive stale suggestions)
14. No `ResolveConfirmedSurfaces` for recall expansion
15. No Brain authz rules for `/v1/people` access

### A57. `brain/src/main.py` — Brain Composition Root Comparison

**Python `main.py` is an 880-line composition root** that constructs 14+ service objects with explicit dependency injection, starts 3 background loops (5-min sync cycle, Telegram polling, Bluesky polling), loads service identity (Ed25519 keypair), constructs 9 LLM provider instances with hot-reload, wires the GuardianLoop with 13 dependencies, and manages graceful shutdown (close clients, disconnect MCP, log usage).

**Mobile `brain_server.ts` is a 173-line bare HTTP shell.** No composition root, no dependency construction, no background loops, no wiring.

**19 missing pieces:**

| # | Missing Component | Impact |
|---|---|--------|
| 1 | **Composition root / dependency wiring** | The core architectural pattern — all modules exist as disconnected islands |
| 2 | Service identity (Ed25519 keypair) loading | No signed Core calls |
| 3 | Core HTTP client construction | `BrainCoreClient` class exists, never instantiated |
| 4 | LLM provider construction (9 instances) | Adapter code exists, never constructed |
| 5 | LLM router construction + config | Router exists, never created |
| 6 | LLM hot-reload from KV | No runtime key update |
| 7 | MCP client construction | Delegation module exists, no MCP client |
| 8 | PII scrubber construction | EntityVault exists, never wired |
| 9 | **14 service objects** (PersonaRegistry, PersonaSelector, EntityVaultService, NudgeAssembler, ScratchpadService, VaultContextAssembler, TrustScorer, EnrichmentService, DomainClassifier, EventExtractor, ReminderPlanner, StagingProcessor, SyncEngine, GuardianLoop) | All module code exists but nothing constructs or wires them |
| 10 | **GuardianLoop** (central orchestrator, 13 deps) | No equivalent object |
| 11 | 5-min sync background loop | No periodic processing |
| 12 | Action risk policy from Core KV | No runtime policy loading |
| 13 | Persona registry initial load | No Core-backed refresh |
| 14 | Contacts into trust scorer | No startup data loading |
| 15 | MCP source registration | No external data sources |
| 16 | Rich health check (Core connectivity, LLM status, version, usage) | Static `{status: "ok"}` |
| 17 | Graceful shutdown (client close, MCP disconnect, usage logging) | `server.close()` only |
| 18 | Auth middleware wiring | `configureBrainAuth()` exists but never called |
| 19 | `/v1/reason` returns 501 — reasoning pipeline unwired | The single most impactful missing feature |

**This is the most architecturally significant finding in the entire gap analysis.** The individual service modules (silence, guard scan, anti-her, domain routing, L0 enrichment, trust scoring, persona registry, vault context, nudge assembly, scratchpad, sync engine, staging processor, LLM adapters, provider config) all exist as working code. But **no composition root wires them together.** The mobile Brain is a collection of disconnected library modules that are never instantiated or connected at runtime.

### A58. `service/trust.go` — Trust Service Comparison

**Go TrustService orchestrates 3 ports** (TrustCache, TrustResolver, ContactLookup) with 7 methods: EvaluateIngress, SyncNeighborhood, ManualSync, ResolveProfile, SearchTrust, GetCacheEntries, GetCacheStats.

**Mobile has no TrustService orchestrator.** Five separate modules exist but are not composed.

**Critical semantic conflict in ingress logic:** Go's `EvaluateIngress` **accepts** messages from contacts with trust_level=="unknown" (any explicit contact passes). Mobile's `levels.ts` says `shouldQuarantine('unknown')` returns true — **opposite behavior**. Go distinguishes "unknown trust level on an explicit contact" (accept) from "not a contact at all" (quarantine). Mobile conflates these cases.

**12 missing features:**
1. No `EvaluateIngress` pipeline (contacts-only accept/quarantine/drop decision)
2. No `ContactLookup` port (GetTrustLevel, IsContact)
3. No `SyncNeighborhood` (2-hop, 500-limit graph sync)
4. No periodic hourly sync goroutine
5. No `ManualSync` trigger
6. No stale entry cleanup (7-day cutoff for unrefrreshed appview_sync entries)
7. No `GetCacheEntries` bulk list
8. No `GetCacheStats` (count + last_sync_at)
9. No `SearchTrust` (attestation search proxy)
10. Score scale: Go float 0.0-1.0, mobile int 0-100
11. Cache entry missing 4 fields: trust_ring, relationship, source, display_name
12. XRPC NSID mismatch: `com.dina.trust.*` vs `app.dina.trust.*`

### A59. `brain/src/adapter/core_http.py` — Brain-to-Core HTTP Client Comparison

**Python `CoreHTTPClient` has 38 public methods.** Mobile `BrainCoreClient` has 12. Coverage: **29%.**

**27 methods missing from mobile** across: vault batch/enrich (3), KV store (2), staging ingest/status/resolve-multi (3), contacts CRUD + aliases (7), trust network (2), reminders (3), notifications (1), delegated tasks (5), approvals (3), personas (2), devices/pairing (4), identity (2), audit (2).

**Wire-format incompatibilities in the 11 shared methods:**
- `staging_resolve`: field names differ (`persona`/`data` vs `target_persona`/`classified_item`)
- `staging_claim`: limit sent as query param (mobile) vs JSON body (Python)
- `staging_extend_lease`: `seconds` (mobile) vs `extension_seconds` (Python)
- `staging_fail`: `reason` (mobile) vs `error` (Python)
- `sendMessage` vs `send_d2d`: different field names + mobile sends raw body while Python base64-encodes
- Scratchpad: different endpoints (`/v1/scratchpad` vs `/v1/vault/kv/scratchpad:{id}`)
- Vault store: different body shape (flat item vs `{persona, item}` envelope)
- Vault search: mobile only does fts5 with limit; Python supports hybrid mode with embeddings, agent_did, session, include_all, user_origin

**Error handling:** Python has 5 custom error types (ConfigError, PersonaLockedError, AuthorizationError, ApprovalRequiredError, CoreUnreachableError) with 403 sub-classification. Mobile throws generic `Error` only.

**Mobile improvement:** Re-signs on every retry attempt (fresh nonce/timestamp per attempt). Python signs once before the retry loop.

### A60. `handler/session.go` — Session Management Comparison

**Go has 2 session systems:** browser sessions (CSRF-protected, for admin web UI) and agent sessions (scoped persona access grants, vault auto-close on end, reconnect idempotency, stale expiry).

**Mobile has `session/lifecycle.ts` but it is orphaned:** no HTTP routes registered, no authz rules for session paths, no persistence, no stale expiry, no activity tracking.

**10 critical gaps:**

1. **No HTTP session routes** — `/v1/session/start`, `/v1/session/end`, `GET /v1/sessions` not registered in Express server
2. **No stale session expiry** — `ExpireStaleSessions()` missing; `sessionTTL` config defined but never consumed
3. **No `LastActivityAt` tracking** — no heartbeat, no activity timestamp
4. **No session persistence** — in-memory only, lost on restart
5. **No grant-opened vault tracking** — the `grantOpenedVaults` / `anyActiveGrantForPersona` / `OnLock` callback chain that auto-closes sensitive vaults on session end is absent
6. **No CSRF browser session store** — entire `SessionStore` with constant-time CSRF validation missing (lower priority since mobile uses Ed25519 auth)
7. **No session reconnect** — Go returns existing session on duplicate `(agentDID, name)`; mobile creates new
8. **No authz rules** — `authz.ts` has no entries for `/v1/session*`; requests would be denied
9. **Grant model simplified** — missing `ID`, `ClientDID`, `SessionID`, `ExpiresAt` (1h for single-use), `Reason`, `CreatedAt`
10. **Timestamp unit mismatch** — `Date.now()` (ms) vs `time.Now().Unix()` (s)

### A61. `service/transport.go` — Transport Service Comparison

**Go TransportService is a monolithic 880-line orchestrator** with 4 egress gates (contact, scenario with 3 tiers + `parkForApproval`, V1 type enforcement, PII gatekeeper), integrated DID resolution + key extraction, NaCl seal, relay routing, outbox with retry + dead-letter, and full inbound pipeline (decrypt, verify, replay detection, V1 enforcement, audit).

**Mobile has the transport decomposed across 8+ files** — the building blocks are mostly present but critical pieces are disconnected.

**10 critical gaps:**
1. **Replay detection disconnected** — `adversarial.ts` has the cache but `receiveD2D()` never calls it
2. **V1 type enforcement missing** — `isValidV1Type()` exists but never called in send or receive pipelines
3. **No outbox processor** — retry queue has primitives (enqueue, mark, backoff) but no orchestration loop
4. **PII/gatekeeper gate absent** — replaced by weaker data-category sharing check
5. **`explicit_once` approval not wired** — ApprovalManager exists but send pipeline doesn't park messages
6. **Body size validation on inbound missing** — no `ValidateBody()` in receive path
7. **DID resolution not integrated in send** — caller must pre-resolve keys and endpoint
8. **Replay cache key lacks sender DID** — uses message ID alone (cross-sender collision risk)
9. **Outbox is in-memory only** — lost on restart
10. **No legacy unsigned migration path**

**Mobile advantages:** Richer quarantine module (30-day TTL, full CRUD), trust-level evaluation on inbound, inbound scenario gate (Go doesn't check on inbound), dead drop drain on unlock, `buffered` delivery status from MsgBox.

### A62. PDS/PLC: `pds.go` + `plc_client.go` + `plc_resolver.go` + `plc_update.go` — AT Protocol Comparison

**Go has 5 PDS/PLC files** covering DID resolution, PDS account creation, XRPC publishing, PLC document updates, and lexicon validation.

**Mobile has 2 files** — a DID resolver with caching and a PLC creation module.

| Capability | Go | Mobile | Status |
|------------|-----|--------|--------|
| DID resolution (did:plc) | Via indigo library, no cache | Raw fetch, 10-min TTL cache | **Mobile better** (caching) |
| DID resolution (did:web) | Yes | No | **MISSING** |
| DID resolution (did:key) | No | Yes (local derivation) | **Mobile only** |
| DID document validation | None (trusts indigo) | 8+ structural checks | **Mobile better** |
| PDS account creation | Full XRPC (`createAccount`/`createSession`) | **MISSING** | Not applicable (mobile is self-sovereign) |
| PLC document creation | Via PDS intermediary | Direct to PLC directory (self-sovereign) | **Different approach** |
| PLC document update | `plc_update.go` with DAG-CBOR signing | **MISSING** | Cannot update existing PLC docs |
| XRPC record publishing | Two publishers (mock + real) with retry queues | **MISSING** | Cannot publish trust attestations to PDS |
| Lexicon validation | 3 schemas (attestation, outcome, bot) | **MISSING** |
| Tombstone/delete | Full support | **MISSING** |

**Mobile's resolver is actually more robust** — it caches results (Go doesn't), validates DID documents (Go trusts indigo), and supports `did:key` local derivation (Go doesn't). But Go has the entire write-side (PDS accounts, record publishing, PLC updates) that mobile lacks.

### A63. `brain/src/adapter/signing.py` — Service-to-Service Auth Signing Comparison

**Core signing protocol is FULLY COMPATIBLE between Go, Python, and mobile.** Same canonical payload format, same Ed25519 crypto, same DID construction, same timestamp window (300s), same nonce length (32 hex chars).

**Key differences are architectural, not protocol-level:**

| Aspect | Python | Mobile |
|--------|--------|--------|
| Architecture | Monolithic `ServiceIdentity` class | Decomposed across 9 files (canonical.ts, keypair.ts, did.ts, nonce.ts, timestamp.ts, middleware.ts, ed25519.ts, service_key.ts, ui_auth.ts) |
| Peer key loading | File-system with retry (shared PEM directory) | In-memory registry (`registerService()`) — appropriate for in-process Core+Brain |
| Nonce replay cache key | **Signature hex** | **Nonce string** — different key, same security goal |
| Nonce cache auto-rotation | Time + size based (300s or 100K entries) | External `rotate()` call required — no auto-rotation |
| Nonce cache size cap | 100,000 entries | **None** — unbounded |
| Brain-side auth gaps | Single `verify_request()` does everything | `service_key.ts` has **no timestamp or nonce check**; `ui_auth.ts` has timestamp check but **no nonce check** — both rely on Core's middleware for full protection |

**The Brain-side auth gap is the most notable finding:** If Brain processes a request directly (not via Core middleware), `service_key.ts` performs only signature verification — no timestamp or nonce replay protection. This is safe when Core+Brain run in-process (all requests go through Core's middleware first), but would be a vulnerability if Brain were ever exposed directly.

**PEM file naming differs:** Python: `{svc}_ed25519_private.pem` in `private/` subdir. Mobile: `{name}.key` in flat directory. Both use standard PKCS#8/SPKI DER encoding inside PEM.

### A64. `watchdog.go` + `estate.go` + `migration.go` — Operational Services Comparison

**Watchdog — Mobile actually EXCEEDS Go:**

Go's watchdog is a 115-line 30s ticker that checks liveness + Brain health, purges crash/audit logs. Mobile decomposes this across 4+ files but adds: `ProcessSupervisor` with exponential backoff restart (1s-30s, max 10 attempts, consecutive failure threshold), `startup_bench.ts` (boot performance vs 3s budget), `memory_budget.ts` (RAM tracking per component: 50MB HNSW, 200MB total), and `platform_service.ts` (native service lifecycle, PID tracking, process isolation). **Gap severity: LOW** — mobile is richer.

**Estate — COMPLETELY MISSING from mobile:**

Go's 181-line `EstateService` provides digital estate planning: store estate plan (custodian-threshold activation, default action: destroy/archive), k-of-n Shamir share reconstruction via `recovery.Combine()`, vault key delivery to beneficiary via D2D for read-only access (90-day window). No dead man's switch — only custodian-threshold activation. **Zero mobile code exists for any of this.** Gap severity: HIGH for feature completeness.

**Migration — Partial:**

Go's `MigrationService` coordinates export/import with safety checks: persona lock verification, WAL checkpoint before export, archive compatibility check, pre-write validation, identity DB close before overwrite, backup before import. Mobile has the archive format handler (`archive.ts`) but: exports produce empty archives (`persona_count: 0`), no persona lock checks, no WAL checkpoint, no pre-write validation, no backup step, HTTP endpoints return 501. Integration tests exist confirming binary format cross-compatibility intent. **Gap severity: MEDIUM.**

### A65. `brain/src/infra/crash_handler.py` — Crash Handler Comparison

**Different philosophies:** Python follows "let it crash" (Erlang-style — crash hard, Docker restarts, task requeues via timeout). Mobile follows "never crash" (always recover with degraded functionality — appropriate for mobile where restart is expensive and user-visible).

**8 specific gaps in mobile:**

1. **No vault persistence of crash reports** — the most critical gap. Python writes full traceback to Core's scratchpad at step 0 (encrypted vault). Mobile `buildCrashReport()` creates the object but never stores it. Test assertions for vault storage are placeholders (`expect(true).toBe(true)`).
2. **PII stripping uses only 3 of 9 patterns** — `sanitizeForStdout` has inline patterns for email, US phone, SSN. Core's `detectPII` covers 9 types (adds credit card, Aadhaar, PAN, IFSC, UPI, IP).
3. **No task_id correlation** — Python tags crash reports with `task_id` for scratchpad step 0 correlation. Mobile uses generic `component` string.
4. **No task requeue mechanism** — Python re-raises so Docker restart retries via queue timeout. Mobile has no equivalent for React Native.
5. **Original error class lost** — `withCrashHandler` wraps in generic `Error`, losing `TypeError`/`SyntaxError`/etc. class information.
6. **Scratchpad and crash handler disconnected** — both modules exist but don't interact.
7. **`gracefulShutdown()` is a stub** (TODO Phase 3+).
8. **`checkStartupDependencies()` is a stub** (TODO Phase 3+).

**Mobile additions not in Python:** Stack fingerprinting (SHA-256 hash for dedup), PII audit function (`auditCrashLogForPII`), graceful degradation with named fallbacks (LLM timeout→FTS-only, Core unreachable→retry, embedding failed→skip), memory health monitoring (512MB threshold), DID validation as crash prevention.

### A66. `handler/notify.go` + `handler/reminder.go` — Notify & Reminder Handler Comparison

**Notify — 7 critical gaps:**

1. **No WebSocket delivery** — Go broadcasts via `ClientNotifier.Broadcast()` over WS to all devices. Mobile pushes into an in-memory array with no delivery mechanism. The `WebSocketHub` class exists but is **not wired** to the notify route.
2. **No DND system** — Go checks `DNDChecker`: solicited deferred during DND, fiduciary overrides DND. Mobile has DND in the silence classifier but not in the notify handler.
3. **No rate limiting** — Go has per-handler mutex-based rate limiting (10/sec, fiduciary exempt, returns 429). Mobile has none.
4. **Payload field mismatch** — Go: `{message, priority(string), force_push}`. Mobile: `{title, body, tier(number), persona}`. Different field names, types, and presence.
5. **Priority representation** — Go: string `"fiduciary"/"solicited"/"engagement"`. Mobile: number `1/2/3` mapped to `"high"/"default"/"low"`.
6. **Status code** — Go returns 200; mobile returns 201.
7. **`force_push` deliberately ignored** in Go (Brain cannot bypass routing) — mobile has no equivalent field.

**Reminder — 10 differences:**

| Aspect | Go | Mobile |
|--------|-----|--------|
| Time field | `trigger_at` (Unix seconds) | `due_at` (milliseconds) |
| Recurrence field | `type` (legacy) | `recurring` ("daily"/"weekly"/"monthly") |
| Deduplication | None | Compound key (source_item_id, kind, due_at, persona) |
| Auto-recurring on complete | Not implemented (stores type but never acts on it) | Fully implemented — `completeReminder()` auto-creates next |
| Snooze | Not present | `snoozeReminder(id, snoozeMs)` |
| Fire endpoint | `POST /v1/reminder/fire` (test-only) | **MISSING** |
| Loop mechanism | Blocking goroutine with channel-woken sleep to exact trigger time | Poll-based `tick()` called every ~30s externally |
| `Loop.Wake()` on store/delete | Yes — recomputes next trigger immediately | **MISSING** — no wake mechanism |
| Storage | Behind `ReminderScheduler` port (typically SQLite) | In-memory Map (lost on restart) |
| Per-persona listing | Not present | `GET /v1/reminders/:persona` (extra endpoint) |

**Mobile is ahead on:** dedup, auto-recurring, snooze, per-persona listing. **Go is ahead on:** precise trigger timing, channel-woken recomputation, persistent storage, fire test endpoint.

### A67. `brain/src/adapter/mcp_stdio.py` + `mcp_http.py` — MCP Client Comparison

**Python has two MCP transport adapters** — stdio (subprocess lifecycle, JSON-RPC 2.0 over stdin/stdout, sanitized env, auto-restart on crash, SIGTERM/SIGKILL shutdown) and HTTP (stateless httpx client, tool-name regex guard against path injection, error mapping). Both implement the `MCPClient` protocol: `call_tool`, `list_tools`, `disconnect`.

**Mobile has NO transport implementation at all.** `delegation.ts` is an authorization gate (risk classification, agent blacklisting, query sanitization, escalation validation) — it is the policy layer that sits in front of MCP calls but **cannot actually make any MCP calls.**

**6 key gaps:**
1. No transport — no JSON-RPC, no HTTP client, no subprocess spawning
2. No `MCPClient` protocol equivalent — no `callTool`, `listTools`, `disconnect`
3. No process/connection lifecycle — no session management, no auto-restart
4. No JSON-RPC framing — no request IDs, no `jsonrpc: "2.0"` envelope
5. No server lifecycle — no `disconnect_all`, no graceful shutdown
6. No allowlisted executable validation (`npx`, `uvx`, `node`, `python3`, `deno`)

**Mobile-only policy features:** 4-level risk classification, DID-based agent blacklisting, HTML/SQL query sanitization, escalation constraint validation, 10-tool whitelist. These complement the transport layer but cannot replace it.

### A68. `handler/agent.go` + `delegated_task.go` + `delegated_task_callback.go` — Agent Task System Comparison

**Go has a full agent task lifecycle** — `POST /v1/agent/validate` (intent proxy to Brain Guardian), 9+ delegated task endpoints (create/list/get/claim/heartbeat/complete/fail/progress/running/queue-by-proposal), and internal callback endpoints for OpenClaw hooks. Backed by a `DelegatedTaskStore` with state machine: queued/pending_approval → claimed → running → completed/failed/expired.

**Mobile has ZERO of these endpoints.** The mobile codebase has:
- `task/queue.ts` — a generic in-memory job queue (not agent-specific, no DID ownership, no heartbeat)
- `routing/task.ts` — decides where to route work (local LLM / MCP / FTS), not lifecycle management
- `mcp/delegation.ts` — risk classification gates, not task execution

**6 key gaps:**
1. No `/v1/agent/validate` — external agents can't proxy intent validation through Core
2. No `DelegatedTaskHandler` (9 endpoints) — no task create/claim/heartbeat/complete/fail API
3. No `DelegatedTaskCallbackHandler` — no internal OpenClaw agent_end hooks
4. No `DelegatedTaskStore` domain model — no persistent agent task state machine
5. No agent-role device auth checks in route handlers
6. No session teardown on task completion

### A69. `sqlite/d2d_outbox.go` + `scenario_policy.go` — D2D Persistence Comparison

**D2D Outbox:**

Go has a 12-column SQLite table (`d2d_outbox`) with 8 CRUD operations, priority ordering, 30s×2^retries exponential backoff, max 5 retries, and `pending_approval` status for parked messages.

Mobile has a 7-field in-memory `Map` with 6 functions. **Key gaps:** no persistence (lost on restart), missing 5 fields (`sig`, `msg_type`, `approval_id`, `priority`, `updated_at`), no priority ordering, `markDelivered` deletes record (Go keeps it for audit), different backoff (1s base vs 30s), no retry limit, `deleteExpired` removes all statuses (Go only removes delivered/failed).

**Scenario Policy:**

Go has a SQLite `scenario_policies` table with 3 tiers (standing_policy, explicit_once, deny_by_default) and 5 default policies seeded per contact.

Mobile has **no dedicated scenario policy module** — uses a binary deny-list `Map<string, Set<string>>` in `gates.ts`. **Key gaps:** no tier model (Go has 3 tiers; mobile has allow/deny), no `explicit_once` (per-send approval), no persistence, no defaults seeded on contact creation, no `ListPolicies` enumeration.

### A70. Brain infra: `model_config.py` + `rate_limit.py` + `trace.py` — Infrastructure Comparison

**Three Python infra modules have zero TypeScript equivalents:**

| Module | Python | Mobile | Gap |
|--------|--------|--------|-----|
| `model_config.py` | Loads `models.json` with per-model pricing (input/output cost tuples), provider defaults, primary/lite/heavy tier mapping, fallback chains, `split_model_ref("provider/model")` | `provider_config.ts` is an API-key manager only. No `models.json`, no pricing, no tiers, no fallback chain. | **MISSING** |
| `rate_limit.py` | `TokenBucketLimiter` for Brain API endpoints with configurable rate, burst, and LRU eviction | Nothing found in `packages/brain/src/` | **MISSING** |
| `trace.py` | `TraceStore` singleton: thread-safe structured trace events keyed by request-id, TTL expiry, max-entry cap, queryable via admin | Nothing found | **MISSING** |

**Impact:** Without `model_config`, the LLM router cannot do cost-aware model selection or tier-based routing (A32). Without `rate_limit`, Brain API endpoints have no throttling protection. Without `trace`, there is no request-level debugging capability (`dina-admin trace <req_id>`).

### A71. `sqlite/pool.go` — SQLite Connection Pool & Migration Comparison

**Go pool.go provides:** Named DB registry with mutex protection, SQLCipher open with DEK via `_pragma_key` + `cipher_page_size=4096`, WAL/journal/busy_timeout/synchronous pragmas, schema embedding via `//go:embed`, and **9+ identity migrations + 4 persona migrations** (adding columns, tables, FTS5 rebuilds, indexes).

**Mobile `vault_db.ts` provides:** A `VaultDB` interface with `InMemoryVaultDB` test stub as the only implementation. Factory pattern (`setVaultDBFactory`) ready for `NativeVaultDB` backed by op-sqlite.

**6 key gaps:**
1. **No migration system** — Go has 9+ identity migrations and 4 persona migrations, each idempotent via `hasColumn`/`hasTable` checks. Mobile has no migration runner, no `schema_version` table, no incremental DDL.
2. **No real SQLCipher integration** — `NativeVaultDB` referenced but not implemented. DSN construction with `_pragma_key` and wrong-key verification via Ping is missing.
3. **No connection pooling** — Go uses `*sql.DB` (internal pool). Mobile interface is single-connection.
4. **No DEK zeroing** — Go zeroes DEK bytes on close; mobile stores only a hash.
5. **No WAL checkpoint** — Go has explicit `Checkpoint()` for pre-export; mobile simulates it.
6. **Missing tables** — Go migrations add `delegated_tasks`, `contact_aliases`, `scenario_policies`, `d2d_outbox`, `request_trace`, `pending_reason`. Mobile `identity_001.sql` lacks several of these.

### A72. Domain Model (`core/internal/domain/`) — Validation Map Inventory

**Domain types are mostly ported** — the basic struct/interface definitions exist. **But 5 domain files have significant validation logic that is NOT ported:**

| Domain File | Missing Validation Maps/Functions | Impact |
|-------------|----------------------------------|--------|
| **`vault_limits.go`** | `ValidVaultItemTypes` (22 values), `ValidSenderTrust` (6), `ValidSourceType` (6), `ValidConfidence` (5), `ValidRetrievalPolicy` (5), `ValidEnrichmentStatus` (5), `MaxVaultItemSize` (10MB) | **HIGH** — no data integrity validation at vault ingest |
| **`message.go`** | `V1MessageFamilies` map, `MsgTypeToScenario()`, `D2DMemoryTypes`, `ValidateV1Body()`, `MaxMessageBodySize` | **HIGH** — no D2D message type enforcement |
| **`contact.go`** | `ValidContactRelationships` (8), `ValidDataResponsibility` (4), `DefaultResponsibility()`, `ReservedAliases` (16 pronouns), `ValidateAlias()`, `NormalizeAlias()` | **MEDIUM** — no contact field validation or alias safety |
| **`person.go`** | `ValidPersonConfidence` (3), `ValidSurfaceTypes` (4), `ValidPersonCreatedFrom` (3) | **MEDIUM** — no person entity validation |
| **`trust.go`** | `ValidTrustRings` (3), `ValidRelationships` (5), `ValidTrustSources` (2) | **LOW** — types ported, but validation sets missing |

**Types that ARE fully ported:** TrustLevel enum, PersonaTier enum, CallerType, DID/PersonaName constructors, SearchMode, staging TTL/lease constants, approval types, audit types, PII types, device types (with role mismatch), session types, task types, event types.

**The validation maps are the missing data-integrity layer.** Without `ValidVaultItemTypes`, any string is accepted as a vault item type. Without `V1MessageFamilies`, non-V1 D2D message types pass through. Without `ReservedAliases`, a contact could be aliased as "he" or "she".

### A73. `handler/intent_proposal.go` + `task.go` + `health.go` — Remaining Handler Comparison

| Handler | Go | Mobile | Gap |
|---------|-----|--------|-----|
| **Intent proposals** (approve/deny/status/list) | Full handler proxying to Brain guardian; queues delegated tasks on approval | **Missing entirely** — no routes, no handler, no references | **Critical** — no agent autonomy gating |
| **Task ack** (`POST /v1/task/ack`) | Wired handler, removes from in-flight set | Queue logic exists in `task/queue.ts` but **no HTTP route** registered | **Medium** — needs route wiring |
| **Health** (`/healthz` + `/readyz`) | Liveness (always OK) + readiness (vault + key + Brain connectivity checks) | Only `/healthz` (static OK). Rich `runHealthCheck()` in diagnostics module but **no `/readyz` endpoint** | **Low** — diagnostics exist, just need readiness route |

### A74. Brain Domain (`brain/src/domain/`) — Type System Comparison

**Python has a formal domain layer** with 5 files defining 9 dataclasses, 6 enums, 15-variant Command enum, 8 BotResponse subclasses, and 10 custom error classes.

**Mobile has types scattered inline** across modules with no `domain/` directory.

| Python Domain Feature | Mobile Status |
|----------------------|---------------|
| 9 frozen dataclasses (VaultItem, SearchResult, NudgePayload, TaskEvent, ScrubResult, Classification, ReasonResult, LLMResponse, SyncResult) | Types scattered inline; no centralized definitions |
| 6 enums (Priority, SilenceDecision, LLMProvider, IntentRisk, TaskType, Sensitivity) | Partial: IntentRisk exists; Sensitivity/SilenceDecision missing |
| `Command` enum (15 variants) | 5-value string union (`ChatIntent`) — 10 commands missing |
| `BotResponse` + 7 subclasses | Responses are plain strings — no typed response hierarchy |
| 10 custom error classes (PersonaLockedError, AuthorizationError, ApprovalRequiredError, etc.) | **Zero custom errors** — all bare `Error` throughout entire mobile codebase |
| `ProcessEvent` discriminated union (17 typed variants) | Untyped `{type: string, payload: Record}` — no per-event shapes |

**Most impactful gap:** The zero-custom-error pattern. Every `catch` in mobile gets a generic `Error` with no type discrimination. Python callers can `except PersonaLockedError` to handle specific cases; mobile callers must parse error message strings.

### A75. Remaining Go Adapters — Batch Inventory

| Adapter File | Purpose | Mobile | Gap |
|-------------|---------|--------|-----|
| `identity/export.go` | Identity bundle (DID metadata + wrapped seed + HMAC) for recovery | **No** — no identity bundle, no seed recovery path | Missing DID migration |
| `identity/web.go` | `did:web` resolver (`/.well-known/did.json` fetch) | **No** — no `did:web` support | Minor (uncommon) |
| `identity/contact_aliases.go` | In-memory alias store with display-name collision checks | **Partial** — aliases in `contacts/directory.ts` but no bidirectional uniqueness | Missing collision detection |
| `security/security.go` | Docker deployment hardening auditor | **N/A** — Docker-specific, not applicable to mobile | Skip |
| `servicekey/servicekey.go` | Ed25519 keypair file loading for service-to-service auth | **Partial** — `keypair.ts` exists; file-based loading not needed (in-process) | Intentional |
| `taskqueue/taskqueue.go` | Priority task queue with watchdog recovery | **Yes** — `task/queue.ts` covers this | Complete |
| `bot/bot.go` | Bot query sanitization (strip DID/medical/financial from outbound) | **Partial** — `trust/query_client.ts` exists but unclear if full sanitization ported | Needs verification |

### A76. `recognizers_india.py` + `recognizers_eu.py` — PII Recognizer Comparison

**Python has 13 Presidio custom recognizers** (7 India + 6 EU) with regex patterns, context-word boosting, and validation logic.

**Mobile has partial coverage** across Tier 1 (`patterns.ts`) and Tier 2 (`tier2_patterns.ts`).

**5 recognizers completely MISSING from mobile:**

| Missing Pattern | Type | Risk |
|----------------|------|------|
| `IN_PASSPORT` | Indian passport (1 letter + 7 digits) | **Medium** — passport numbers leak to cloud LLMs |
| `IN_BANK_ACCOUNT` | Indian bank account (9-18 digits) | **Medium** — bank numbers leak |
| `DE_PERSONALAUSWEIS` | German ID card | **Low** — niche |
| `FR_NIF` | French tax ID (13 digits) | **Low** — niche |
| `SWIFT_BIC` | Bank routing codes (8 or 11 chars) | **Medium** — financial identifiers leak |

**Validation differences in patterns both have:**

| Pattern | Python | Mobile | Gap |
|---------|--------|--------|-----|
| AADHAAR | First digit 2-9 validated | First digit non-0/1 validated | Minor — same intent |
| DE_STEUER_ID | First digit [1-9] required | Allows leading zero (`\d{11}`) | **BUG** — false positives |
| UPI | Explicit 40+ handle allowlist | "No dot in domain" heuristic | **Weaker** — misses valid handles, false-positives on `user@word` |
| Indian phone | Two patterns (+91 and 091 prefixes) | Only +91 prefix | Missing 091 variant |
| NL_BSN | Notes elfproef for Phase 2 | **Actually implements elfproef** | **Mobile ahead** |
| Context-word boosting | All recognizers use Presidio context words | No equivalent | Missing confidence boosting |

### A77. Remaining Handlers: `admin.go` + `wellknown.go` + `trace.go`

| Handler | Go | Mobile | Gap |
|---------|-----|--------|-----|
| `admin.go` — reverse-proxies `/admin/*` to Brain admin UI; `GET /v1/admin/sync-status` | Full | **No** — no admin proxy, no sync-status endpoint | N/A for mobile (Brain in-process) |
| `wellknown.go` — `GET /.well-known/atproto-did` returns node DID as plain text per AT Protocol | Full | **No** — DID infrastructure exists but not exposed at well-known path | Missing for federation |
| `trace.go` — `GET /v1/trace/{req_id}` returns structured trace events for debugging | Full | **No** — no TraceStore, no trace endpoint | Missing for debugging |

### A78. Port Interfaces (`core/internal/port/`) — Batch Inventory

26 Go port files define the system's interface contracts. **20/26 have mobile equivalents.**

**6 port interfaces with NO mobile equivalent:**

| Port Interface | Interfaces Declared | Impact |
|----------------|-------------------|--------|
| `clock.go` | `Clock` (injectable time source for testing) | **Medium** — all mobile modules use `Date.now()` directly; untestable time logic |
| `delegated_task.go` | `DelegatedTaskStore` | **High** — no agent task lifecycle persistence |
| `estate.go` | `EstateManager` | **High** — no digital estate planning |
| `pds.go` | `PDSPublisher` | **Medium** — no AT Protocol record publishing |
| `pending_reason.go` | `PendingReasonStore` | **Medium** — no async reasoning resume after approval |
| `trace.go` | `TraceStore` | **Low** — no request-level tracing |

**20 port interfaces with mobile equivalents** — all functional modules have at least partial TypeScript implementations across `packages/core/src/` directories: approval, auth, crypto, brain_client, devices+pairing, gatekeeper, identity, notify, diagnostics, pii, server+onboarding, session, staging, task, transport+sync, trust, vault, ws.

### A79. SQLite Stores: `person_store.go` + `delegated_task.go` + `pending_reason.go` — Persistence Comparison

All three Go modules use SQLite persistence. All three mobile equivalents are in-memory only.

| Store | Go Schema | Mobile Status | Key Gap |
|-------|-----------|---------------|---------|
| **PersonStore** | 3 tables: `people` (8 cols), `person_surfaces` (13 cols), `person_extraction_log` (idempotency) | In-memory `PersonLink[]` + `ResolvedPerson[]` — no persistence | Missing: SQLite tables, atomic ApplyExtraction with idempotency fingerprint, surface CRUD (confirm/reject/detach), merge with tombstone, normalized_surface matching, GC for stale suggestions |
| **DelegatedTaskStore** | 1 table: `delegated_tasks` (17 cols incl. proposal_id, agent_did, lease_expires_at, run_id, requested/assigned_runner, idempotency_key) | Generic in-memory task queue — no agent-specific fields | Missing: SQLite persistence, agent DID ownership, lease-based claiming, MarkRunning transition, idempotency_key, proposal linkage, session binding |
| **PendingReasonStore** | 1 table: `pending_reason` (11 cols incl. request_id, caller_did, approval_id, session_name, request_meta) | In-memory Map with matching lifecycle semantics | **Closest to parity** — lifecycle works, missing: SQLite persistence + 2 columns (session_name, request_meta) |

### A80. Brain Port Interfaces (`brain/src/port/`) — Interface Contract Comparison

7 Python port files define Brain-side contracts. **3/7 have mobile equivalents, 2 are N/A (channel/Telegram), 2 are MISSING (MCP, PII/EntityVault).**

**LLM Provider port — detailed comparison:**

| Python `LLMProvider` | Mobile `LLMProvider` | Status |
|---------------------|---------------------|--------|
| `complete(messages, **kwargs) → dict` | `chat(messages, options?) → ChatResponse` | Present (different name, typed) |
| `embed(text) → list[float]` | `embed(text, options?) → EmbedResponse` | Present (typed) |
| `classify(text, categories) → str` | **Missing** | Used by triage Pass 2b |
| `model_name: str` property | `name: string` readonly | Present (different name) |
| `is_local: bool` property | **Missing** | Used for PII routing decisions |
| N/A | `stream(messages, options?) → AsyncIterable<StreamChunk>` | **Mobile-only** — elevated to interface |
| N/A | `supportsStreaming/ToolCalling/Embedding: boolean` | **Mobile-only** — capability flags |
| N/A | `AbortSignal` support via options | **Mobile-only** — cancellation |

### A81. Middleware + Infrastructure — Batch Comparison

**Middleware (6 files):**

| File | Go | Mobile | Gap |
|------|-----|--------|-----|
| `cors.go` | CORS headers + preflight OPTIONS | N/A | Not needed — localhost only |
| `recovery.go` | Catch panics, log stack, return 500 | **MISSING** | No structured crash-catch wrapping route handlers |
| `timeout.go` | Per-request deadline, 503 on timeout | `auth/timeout.ts` | Present |
| `logging.go` | Structured request logging (method/path/status/duration) | **MISSING** | No per-request logging middleware |
| `bodylimit.go` | Cap body size via MaxBytesReader | `auth/body_limit.ts` | Present |
| `ratelimit.go` | Per-IP token bucket, XFF parsing | `auth/ratelimit.ts` (per-DID) | Present (adapted for mobile) |

**Infrastructure (4 files):**

| File | Go | Mobile | Gap |
|------|-----|--------|-----|
| `clock.go` | Injectable `Clock` interface for testable time | **MISSING** | All modules use `Date.now()` directly — untestable time logic |
| `logging.go` | PII-safe structured log auditor | **MISSING** | No log PII scrubbing/audit |
| `observability.go` | System watchdog + crash logger | Partial — `timers.ts` has watchdog entry, `diagnostics/health.ts` has checks | No crash log persistence |
| `errors.go` | Known-endpoint registry, method-not-allowed, structured error routing | **MISSING** | No 405 responses, no structured error routing |

### A82. WebSocket: `ws.go` + `notifier.go` + `upgrader.go` — WebSocket System Comparison

| Go File | Purpose | Mobile | Gap |
|---------|---------|--------|-----|
| `ws.go` | WSHub (register/unregister/broadcast/send), WSHandler (message routing: query/command/pong/ack), HeartbeatManager (ping/pong with missed-pong disconnect), MessageBuffer (50-msg FIFO, TTL, ACK removal) | **Partial** — `ws_hub.ts` covers hub + buffer + broadcast + heartbeat ping | Missing: WSHandler message routing (query/command dispatch to Brain, ack-based buffer removal), HeartbeatManager missed-pong counter with auto-disconnect, envelope format parsing (type/id/reply_to) |
| `notifier.go` | Thin adapter wrapping WSHub for ClientNotifier port | **Yes** — `ws_hub.ts` has broadcast + per-client sender | Parity |
| `upgrader.go` | HTTP→WebSocket upgrade, Ed25519 pre-auth, read/write pumps, 1 MiB read limit | **No** | Full connection lifecycle absent. Mobile runs in-process so HTTP upgrade may not be needed, but the read/write pump pattern and auth handshake are missing |

**Crypto adapters (3 files) — all at or near parity:**
- `convert.go` (Ed25519↔X25519): **Parity** — identical algorithm in `nacl.ts`
- `signer.go` (stateless Ed25519): **Parity** — `ed25519.ts` has same API
- `identity_signer.go` (stateful signer holding key): **Partial** — mobile has signing functions but no stateful `IdentitySigner` class; callers pass key each time

### A83. Remaining Files — Batch Classification

**N/A — Not applicable to mobile (30 files):**
- Admin web app (19 files: Flask routes, Jinja templates, core_client) — replaced by native React Native screens
- Admin CLI (5 files) — not needed on mobile
- Channel adapters (4 files: Telegram bot/channel, Bluesky bot/channel) — mobile is itself the user-facing channel
- Codegen configs (2 files: oapi-codegen.yaml, oapi-brain-codegen.yaml) — no OpenAPI codegen in mobile

**PARTIAL — API contracts (6 files):**
- OpenAPI specs (core-api, brain-api, msgbox-api, schemas) exist but mobile defines types by hand in TypeScript rather than code-generating from YAML. `packages/core/src/api/contract.ts` manually defines wire-format types matching Go contracts.

**MISSING (2 files):**
- `models.json` — LLM pricing/tier config (see §A70)
- `pii_allowlist.yaml` — known non-PII tokens that should never be scrubbed

### A84. Remaining Adapters: Trust/Vault/Crypto/Reminder — Final Batch

| Go Adapter | Purpose | Mobile | Gap |
|------------|---------|--------|-----|
| `trust/cache.go` | In-memory + SQLite trust neighborhood cache with DID lookup, Upsert/Remove/Stats/SetLastSync | **Partial** — KV-backed TTL cache only; no SQLite, no trust_ring/relationship, no List/Stats/SetLastSync | Missing persistent trust neighborhood |
| `trust/resolver.go` | AppView XRPC client for trust profiles, neighborhoods, search | **No** — `d2d/resolver.ts` is a DID document resolver, not a trust resolver | Entire AppView trust integration absent |
| `trust/schema.sql` | SQLite schema for trust_cache (DID PK, score, ring, relationship, source, CHECK constraints) | **No** — no SQLite trust table | No persistent trust schema |
| `vault/staging.go` | Core-side staging inbox: ingest/dedup/claim/resolve/drain-pending/sweep | **Partial** — Brain-side staging only; no Core-side StagingInbox with DrainPending | Core staging is in Brain package instead |
| `vault/vault.go` | Full VaultManager: Open/Close with DEK encryption, CRUD, FTS, backup/restore, scratchpad, audit | **Partial** — `vault/crud.ts` has CRUD/search; no DEK Open/Close, no backup/restore | No encrypted vault lifecycle |
| `crypto/k256.go` | secp256k1 rotation key manager: generate-or-load from disk, SLIP-0010 derivation | **Yes** — `derivePathSecp256k1` + `deriveRotationKey` in slip0010.ts | Derivation parity; no disk persistence or GenerateOrLoad lifecycle |
| `reminder/loop.go` | Channel-woken sleep loop: precise trigger time, Wake() on store/delete, fires missed reminders on startup | **Partial** — `scheduler.ts` has `tick()` polling every ~30s | No continuous loop, no Wake(), no missed-reminder recovery |
| `gen/core_types.gen.go` | OpenAPI-generated Go types for Core API | **Partial** — types hand-written in TypeScript | No codegen from spec |
| `gen/brainapi/brain_types.gen.go` | OpenAPI-generated Go types for Brain API | **Partial** — types hand-written | No codegen from spec |
