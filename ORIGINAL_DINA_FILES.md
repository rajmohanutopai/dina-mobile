# Original Dina — Source File Inventory

All source files from the main Dina codebase (Go + Python).
Tests, `__init__.py`, config boilerplate, deploy, and generated assets excluded.

Status: `PENDING` = not yet ported to mobile

---

## Core (Go) — `core/`

### Entry Point
- `core/cmd/dina-core/main.go` — REVIEWED (see GAP_ANALYSIS.md §A54)
- `core/cmd/dina-core/vault_cgo.go` — N/A (Go build tag)
- `core/cmd/dina-core/vault_iface.go` — N/A (Go build tag)
- `core/cmd/dina-core/vault_nocgo.go` — N/A (Go build tag)

### Domain Model (`core/internal/domain/`) — REVIEWED as group (see GAP_ANALYSIS.md §A72)
- `actions.go` — REVIEWED (types ported)
- `approval.go` — REVIEWED (types ported)
- `audit.go` — REVIEWED (types ported)
- `config.go` — REVIEWED (types ported)
- `contact.go` — REVIEWED (VALIDATION MAPS MISSING: ValidContactRelationships, ValidDataResponsibility, DefaultResponsibility(), ReservedAliases, ValidateAlias(), NormalizeAlias())
- `delegated_task.go` — REVIEWED (types ported)
- `device.go` — REVIEWED (types ported, role mismatch)
- `did_document.go` — REVIEWED (types ported)
- `docker.go` — N/A (not applicable to mobile)
- `errors.go` — REVIEWED (sentinel errors missing as centralized set)
- `event.go` — REVIEWED (types ported)
- `identity.go` — REVIEWED (types ported, ValidTrustLevels map missing)
- `intent.go` — REVIEWED (types ported)
- `message.go` — REVIEWED (VALIDATION MISSING: V1MessageFamilies, MsgTypeToScenario(), ValidateV1Body(), MaxMessageBodySize)
- `onboarding.go` — REVIEWED (types ported)
- `pds.go` — REVIEWED (types ported)
- `pending_reason.go` — REVIEWED (constants missing: DefaultPendingReasonTTL, CompletedReasonRetention)
- `person.go` — REVIEWED (VALIDATION MISSING: ValidPersonConfidence, ValidSurfaceTypes, ValidPersonCreatedFrom)
- `pii.go` — REVIEWED (types ported)
- `session.go` — REVIEWED (types ported)
- `staging.go` — REVIEWED (TTL constants ported, ValidStagingStatus map missing)
- `task.go` — REVIEWED (types ported)
- `token.go` — REVIEWED (types ported)
- `trust.go` — REVIEWED (TrustLevel ported, ValidTrustRings/ValidRelationships/ValidTrustSources maps missing)
- `vault_limits.go` — REVIEWED (ALL MISSING: ValidVaultItemTypes, ValidSenderTrust, ValidSourceType, ValidConfidence, ValidRetrievalPolicy, ValidEnrichmentStatus, MaxVaultItemSize)
- `vault.go` — REVIEWED (SearchMode ported)

### Port Interfaces (`core/internal/port/`) — REVIEWED as group (see GAP_ANALYSIS.md §A78)
- 20/26 have mobile equivalents. Missing: Clock, DelegatedTaskStore, EstateManager, PDSPublisher, PendingReasonStore, TraceStore
- `approval.go` — REVIEWED (mobile: approval/)
- `auth.go` — REVIEWED (mobile: auth/)
- `backup.go` — REVIEWED (mobile: export/ only — partial)
- `brain.go` — REVIEWED (mobile: brain_client/)
- `clock.go` — REVIEWED (MISSING — no injectable clock)
- `crypto.go` — REVIEWED (mobile: crypto/)
- `delegated_task.go` — REVIEWED (MISSING — no delegated task store)
- `device.go` — REVIEWED (mobile: devices/ + pairing/)
- `estate.go` — REVIEWED (MISSING — no estate manager)
- `gatekeeper.go` — REVIEWED (mobile: gatekeeper/)
- `identity.go` — REVIEWED (mobile: identity/)
- `notification.go` — REVIEWED (mobile: notify/)
- `observability.go` — REVIEWED (mobile: diagnostics/ — partial)
- `pds.go` — REVIEWED (MISSING — no PDS publisher)
- `pending_reason.go` — REVIEWED (MISSING — no pending reason store)
- `person.go` — REVIEWED (mobile: contacts/)
- `pii.go` — REVIEWED (mobile: pii/)
- `server.go` — REVIEWED (mobile: server/)
- `session.go` — REVIEWED (mobile: session/)
- `staging.go` — REVIEWED (mobile: staging/)
- `task.go` — REVIEWED (mobile: task/)
- `trace.go` — REVIEWED (MISSING — no trace store)
- `transport.go` — REVIEWED (mobile: transport/ + sync/)
- `trust.go` — REVIEWED (mobile: trust/)
- `vault.go` — REVIEWED (mobile: vault/)
- `websocket.go` — REVIEWED (mobile: ws/)

### HTTP Handlers (`core/internal/handler/`)
- `admin.go` — REVIEWED (see GAP_ANALYSIS.md §A77)
- `agent.go` — REVIEWED (see GAP_ANALYSIS.md §A68)
- `approval.go` — REVIEWED (see GAP_ANALYSIS.md §A48)
- `audit.go` — REVIEWED (see GAP_ANALYSIS.md §A23)
- `contact.go` — REVIEWED (see GAP_ANALYSIS.md §A33)
- `delegated_task_callback.go` — REVIEWED (see GAP_ANALYSIS.md §A68)
- `delegated_task.go` — REVIEWED (see GAP_ANALYSIS.md §A68)
- `device.go` — REVIEWED (see GAP_ANALYSIS.md §A41)
- `errors.go` — REVIEWED (see §A72)
- `export.go` — REVIEWED (see GAP_ANALYSIS.md §A22)
- `health.go` — REVIEWED (see GAP_ANALYSIS.md §A73)
- `identity.go` — REVIEWED (see GAP_ANALYSIS.md §A28)
- `intent_proposal.go` — REVIEWED (see GAP_ANALYSIS.md §A73)
- `message.go` — REVIEWED (see GAP_ANALYSIS.md §A50)
- `notify.go` — REVIEWED (see GAP_ANALYSIS.md §A66)
- `person.go` — REVIEWED (see GAP_ANALYSIS.md §A56)
- `persona.go` — REVIEWED (see GAP_ANALYSIS.md §A46)
- `pii.go` — REVIEWED (see §A72)
- `reason.go` — REVIEWED (see GAP_ANALYSIS.md §2, §5)
- `remember.go` — REVIEWED (see GAP_ANALYSIS.md §2, §3)
- `reminder.go` — REVIEWED (see GAP_ANALYSIS.md §A66)
- `session.go` — REVIEWED (see GAP_ANALYSIS.md §A60)
- `staging.go` — REVIEWED (see GAP_ANALYSIS.md §A37)
- `task.go` — REVIEWED (see GAP_ANALYSIS.md §A73)
- `trace.go` — REVIEWED (see GAP_ANALYSIS.md §A77)
- `trust.go` — REVIEWED (see GAP_ANALYSIS.md §A55)
- `vault.go` — REVIEWED (see GAP_ANALYSIS.md §A43)
- `wellknown.go` — REVIEWED (see GAP_ANALYSIS.md §A77)

### Middleware (`core/internal/middleware/`)
- `auth.go` — REVIEWED (see GAP_ANALYSIS.md §A16)
- `bodylimit.go` — REVIEWED (mobile: auth/body_limit.ts)
- `cors.go` — REVIEWED (N/A — mobile is localhost only)
- `logging.go` — REVIEWED (MISSING — no per-request structured logging middleware)
- `ratelimit.go` — REVIEWED (mobile: auth/ratelimit.ts — adapted to per-DID)
- `recovery.go` — REVIEWED (MISSING — no panic/crash recovery middleware)
- `timeout.go` — REVIEWED (mobile: auth/timeout.ts)

### Adapters — Auth & Crypto (`core/internal/adapter/`)
- `auth/auth.go` — REVIEWED (see GAP_ANALYSIS.md §A16)
- `auth/session.go` — REVIEWED (see GAP_ANALYSIS.md §A16)
- `crypto/argon2.go` — REVIEWED (see GAP_ANALYSIS.md §A19)
- `crypto/convert.go` — REVIEWED (mobile: nacl.ts — parity)
- `crypto/hkdf.go` — REVIEWED (see GAP_ANALYSIS.md §A13)
- `crypto/identity_signer.go` — REVIEWED (partial — no stateful signer class)
- `crypto/k256.go` — REVIEWED (mobile: slip0010.ts — derivation parity, no disk persistence)
- `crypto/keyderiver.go` — REVIEWED (see GAP_ANALYSIS.md §A13)
- `crypto/keywrap.go` — REVIEWED (see GAP_ANALYSIS.md §A19)
- `crypto/nacl.go` — REVIEWED (see GAP_ANALYSIS.md §A13)
- `crypto/signer.go` — REVIEWED (mobile: ed25519.ts — parity)
- `crypto/slip0010.go` — REVIEWED (see GAP_ANALYSIS.md §A13)

### Adapters — Storage (`core/internal/adapter/sqlite/`)
- `audit.go` — REVIEWED (see GAP_ANALYSIS.md §A23)
- `contact_aliases.go` — REVIEWED (see GAP_ANALYSIS.md §A33)
- `contacts.go` — REVIEWED (see GAP_ANALYSIS.md §A33)
- `d2d_outbox.go` — REVIEWED (see GAP_ANALYSIS.md §A69)
- `delegated_task.go` — REVIEWED (see GAP_ANALYSIS.md §A79)
- `embedding_codec.go` — REVIEWED (see GAP_ANALYSIS.md §A39)
- `hnsw_index.go` — REVIEWED (see GAP_ANALYSIS.md §A39)
- `pending_reason.go` — REVIEWED (see GAP_ANALYSIS.md §A79)
- `person_store.go` — REVIEWED (see GAP_ANALYSIS.md §A79)
- `pool.go` — REVIEWED (see GAP_ANALYSIS.md §A71)
- `reminders.go` — REVIEWED (see GAP_ANALYSIS.md §A18)
- `scenario_policy.go` — REVIEWED (see GAP_ANALYSIS.md §A69)
- `staging_inbox.go` — REVIEWED (see GAP_ANALYSIS.md §A30)
- `trace.go` — REVIEWED (see §A77)
- `vault.go` — REVIEWED (see GAP_ANALYSIS.md §A15)
- `schema/identity_001.sql` — REVIEWED (see §A15+A71)
- `schema/identity_002_trust_cache.sql` — REVIEWED (see §A84)
- `schema/persona_001.sql` — REVIEWED (see GAP_ANALYSIS.md §A15)

### Adapters — Infrastructure
- `adminproxy/adminproxy.go` — N/A (admin proxy)
- `apicontract/apicontract.go` — REVIEWED (see §A83)
- `bot/bot.go` — REVIEWED (see GAP_ANALYSIS.md §A75)
- `brainclient/brainclient.go` — REVIEWED (see §A59)
- `clock/clock.go` — REVIEWED (MISSING — no injectable clock; Date.now() hardcoded)
- `errors/errors.go` — REVIEWED (MISSING — no structured HTTP error handling)
- `estate/estate.go` — REVIEWED (see §A64)
- `gatekeeper/gatekeeper.go` — REVIEWED (see GAP_ANALYSIS.md §A27)
- `logging/logging.go` — REVIEWED (MISSING — no PII-safe structured logging)
- `observability/observability.go` — REVIEWED (partial — diagnostics/ + background/timers.ts)
- `onboarding/onboarding.go` — REVIEWED (see GAP_ANALYSIS.md §A19)
- `pairing/pairing.go` — REVIEWED (see GAP_ANALYSIS.md §A25)
- `pairing/persist.go` — REVIEWED (see GAP_ANALYSIS.md §A25)
- `pii/scrubber.go` — REVIEWED (see GAP_ANALYSIS.md §A8)
- `portability/portability.go` — REVIEWED (see GAP_ANALYSIS.md §A22)
- `security/security.go` — REVIEWED (see GAP_ANALYSIS.md §A75)
- `server/server.go` — REVIEWED (see GAP_ANALYSIS.md §A54)
- `servicekey/servicekey.go` — REVIEWED (see GAP_ANALYSIS.md §A75)
- `sync/sync.go` — REVIEWED (see GAP_ANALYSIS.md §A31)
- `taskqueue/taskqueue.go` — REVIEWED (see GAP_ANALYSIS.md §A75)

### Adapters — Identity & PDS
- `identity/contact_aliases.go` — REVIEWED (see GAP_ANALYSIS.md §A75)
- `identity/export.go` — REVIEWED (see GAP_ANALYSIS.md §A75)
- `identity/identity.go` — REVIEWED (see GAP_ANALYSIS.md §A28)
- `identity/web.go` — REVIEWED (see GAP_ANALYSIS.md §A75)
- `pds/pds.go` — REVIEWED (see GAP_ANALYSIS.md §A62)
- `pds/plc_client.go` — REVIEWED (see GAP_ANALYSIS.md §A62)
- `pds/plc_resolver.go` — REVIEWED (see GAP_ANALYSIS.md §A62)
- `pds/plc_update.go` — REVIEWED (see GAP_ANALYSIS.md §A62)
- `pds/xrpc_publisher.go` — REVIEWED (see §A62)

### Adapters — Trust & Transport
- `trust/cache.go` — REVIEWED (see GAP_ANALYSIS.md §A84)
- `trust/resolver.go` — REVIEWED (see GAP_ANALYSIS.md §A84)
- `trust/schema.sql` — REVIEWED (see GAP_ANALYSIS.md §A84)
- `transport/msgbox_client.go` — REVIEWED (see GAP_ANALYSIS.md §A21)
- `transport/rpc_bridge.go` — REVIEWED (see GAP_ANALYSIS.md §A21)
- `transport/rpc_decrypt.go` — REVIEWED (see GAP_ANALYSIS.md §A21)
- `transport/rpc_idempotency.go` — REVIEWED (see GAP_ANALYSIS.md §A21)
- `transport/rpc_worker_pool.go` — REVIEWED (see GAP_ANALYSIS.md §A21)
- `transport/transport.go` — REVIEWED (see GAP_ANALYSIS.md §A21)
- `vault/staging.go` — REVIEWED (see GAP_ANALYSIS.md §A84)
- `vault/vault.go` — REVIEWED (see GAP_ANALYSIS.md §A84)

### Adapters — WebSocket
- `ws/notifier.go` — REVIEWED (see GAP_ANALYSIS.md §A82)
- `ws/upgrader.go` — REVIEWED (see GAP_ANALYSIS.md §A82)
- `ws/ws.go` — REVIEWED (see GAP_ANALYSIS.md §A82)

### Services (`core/internal/service/`)
- `device.go` — REVIEWED (see GAP_ANALYSIS.md §A41)
- `estate.go` — REVIEWED (see GAP_ANALYSIS.md §A64)
- `gatekeeper.go` — REVIEWED (see GAP_ANALYSIS.md §A27)
- `identity.go` — REVIEWED (see GAP_ANALYSIS.md §A28)
- `migration.go` — REVIEWED (see GAP_ANALYSIS.md §A64)
- `onboarding.go` — REVIEWED (see §A19)
- `sync.go` — REVIEWED (see GAP_ANALYSIS.md §A31)
- `task.go` — REVIEWED (see §A73)
- `transport.go` — REVIEWED (see GAP_ANALYSIS.md §A61)
- `trust.go` — REVIEWED (see GAP_ANALYSIS.md §A58)
- `vault.go` — REVIEWED (see GAP_ANALYSIS.md §A35)
- `watchdog.go` — REVIEWED (see GAP_ANALYSIS.md §A64)

### Other
- `core/internal/config/config.go` — REVIEWED (see GAP_ANALYSIS.md §A45)
- `core/internal/gen/brainapi/brain_types.gen.go` — REVIEWED (PARTIAL — hand-written TS types)
- `core/internal/gen/core_types.gen.go` — REVIEWED (PARTIAL — hand-written TS types)
- `core/internal/ingress/deaddrop.go` — REVIEWED (see GAP_ANALYSIS.md §A53)
- `core/internal/ingress/ratelimit.go` — REVIEWED (see GAP_ANALYSIS.md §A53)
- `core/internal/ingress/router.go` — REVIEWED (see GAP_ANALYSIS.md §A53)
- `core/internal/ingress/sweeper.go` — REVIEWED (see GAP_ANALYSIS.md §A53)
- `core/internal/reminder/loop.go` — REVIEWED (see GAP_ANALYSIS.md §A18+A84)

---

## Brain (Python) — `brain/`

### Entry Point
- `brain/src/main.py` — REVIEWED (see GAP_ANALYSIS.md §A57)
- `brain/src/prompts.py` — REVIEWED (see GAP_ANALYSIS.md §A4)

### Brain HTTP App (`brain/src/dina_brain/`)
- `app.py` — REVIEWED (see GAP_ANALYSIS.md §A52)
- `routes/pii.py` — REVIEWED (see GAP_ANALYSIS.md §A52)
- `routes/process.py` — REVIEWED (see GAP_ANALYSIS.md §A52)
- `routes/proposals.py` — REVIEWED (see GAP_ANALYSIS.md §A52)
- `routes/reason.py` — REVIEWED (see GAP_ANALYSIS.md §A52)
- `routes/trace.py` — REVIEWED (see GAP_ANALYSIS.md §A52)

### Admin Web App (`brain/src/dina_admin/`)
- `app.py` — N/A (admin web UI, not applicable to mobile)
- `core_client.py` — N/A (admin web UI)
- `routes/chat.py` — N/A (admin web UI)
- `routes/contacts.py` — N/A (admin web UI)
- `routes/dashboard.py` — N/A (admin web UI)
- `routes/devices.py` — N/A (admin web UI)
- `routes/history.py` — N/A (admin web UI)
- `routes/login.py` — N/A (admin web UI)
- `routes/pages.py` — N/A (admin web UI)
- `routes/settings.py` — N/A (admin web UI)
- `routes/trust.py` — N/A (admin web UI)
- `templates/base.html` — N/A (admin web UI)
- `templates/contacts.html` — N/A
- `templates/dashboard.html` — N/A
- `templates/devices.html` — N/A
- `templates/history.html` — N/A
- `templates/login.html` — N/A
- `templates/settings.html` — N/A
- `templates/trust.html` — N/A

### Domain (`brain/src/domain/`) — REVIEWED as group (see GAP_ANALYSIS.md §A74)
- `enums.py` — REVIEWED (6 enums; Sensitivity/SilenceDecision missing from mobile)
- `errors.py` — REVIEWED (10 custom error classes; mobile has zero — all bare Error)
- `request.py` — REVIEWED (Command enum 15 variants; mobile has 5-intent string union)
- `response.py` — REVIEWED (BotResponse + 7 subclasses; mobile returns plain strings)
- `types.py` — REVIEWED (9 dataclasses; mobile has types scattered inline)

### Port Interfaces (`brain/src/port/`) — REVIEWED as group (see GAP_ANALYSIS.md §A80)
- `channel.py` — REVIEWED (N/A — mobile uses native UI, not channel abstraction)
- `core_client.py` — REVIEWED (mobile: core_client/http.ts)
- `llm.py` — REVIEWED (mobile: llm/adapters/provider.ts — classify() missing, is_local missing)
- `mcp.py` — REVIEWED (MISSING — no MCP client interface)
- `pii.py` — REVIEWED (MISSING — no dedicated port interface)
- `scrubber.py` — REVIEWED (MISSING — no EntityVault port interface)
- `telegram.py` — REVIEWED (N/A — no Telegram on mobile)

### LLM Adapters (`brain/src/adapter/`)
- `llm_claude.py` — REVIEWED (see GAP_ANALYSIS.md §A34)
- `llm_gemini.py` — REVIEWED (see GAP_ANALYSIS.md §A29)
- `llm_llama.py` — REVIEWED (see GAP_ANALYSIS.md §A49)
- `llm_openai.py` — REVIEWED (see GAP_ANALYSIS.md §A26)
- `llm_openrouter.py` — REVIEWED (see GAP_ANALYSIS.md §A40)

### PII & NER Adapters
- `scrubber_presidio.py` — REVIEWED (see §A8+A14+A76)
- `scrubber_spacy.py` — REVIEWED (see §A8)
- `recognizers_eu.py` — REVIEWED (see GAP_ANALYSIS.md §A76)
- `recognizers_india.py` — REVIEWED (see GAP_ANALYSIS.md §A76)

### Channel Adapters
- `bluesky_bot.py` — N/A (channel adapter)
- `bluesky_channel.py` — N/A (channel adapter)
- `telegram_bot.py` — N/A (channel adapter)
- `telegram_channel.py` — N/A (channel adapter)

### Other Adapters
- `core_http.py` — REVIEWED (see GAP_ANALYSIS.md §A59)
- `mcp_http.py` — REVIEWED (see GAP_ANALYSIS.md §A67)
- `mcp_stdio.py` — REVIEWED (see GAP_ANALYSIS.md §A67)
- `pds_publisher.py` — REVIEWED (see §A62)
- `signing.py` — REVIEWED (see GAP_ANALYSIS.md §A63)

### Services (`brain/src/service/`)
- `command_dispatcher.py` — REVIEWED (see GAP_ANALYSIS.md §A44)
- `contact_matcher.py` — REVIEWED (see GAP_ANALYSIS.md §A20)
- `domain_classifier.py` — REVIEWED (see GAP_ANALYSIS.md §A11)
- `enrichment.py` — REVIEWED (see GAP_ANALYSIS.md §A5)
- `entity_vault.py` — REVIEWED (see GAP_ANALYSIS.md §A14)
- `event_extractor.py` — REVIEWED (see GAP_ANALYSIS.md §A24)
- `guardian.py` — REVIEWED (see GAP_ANALYSIS.md §2, §5, §6, §7)
- `llm_router.py` — REVIEWED (see GAP_ANALYSIS.md §A32)
- `nudge.py` — REVIEWED (see GAP_ANALYSIS.md §A17)
- `person_link_extractor.py` — REVIEWED (see GAP_ANALYSIS.md §A20)
- `person_resolver.py` — REVIEWED (see GAP_ANALYSIS.md §A20)
- `persona_registry.py` — REVIEWED (see GAP_ANALYSIS.md §A47)
- `persona_selector.py` — REVIEWED (see GAP_ANALYSIS.md §A9)
- `reminder_planner.py` — REVIEWED (see GAP_ANALYSIS.md §A6)
- `scratchpad.py` — REVIEWED (see GAP_ANALYSIS.md §A42)
- `sensitive_signals.py` — REVIEWED (see GAP_ANALYSIS.md §A38)
- `staging_processor.py` — REVIEWED (see GAP_ANALYSIS.md §A10)
- `subject_attributor.py` — REVIEWED (see GAP_ANALYSIS.md §A20)
- `sync_engine.py` — REVIEWED (see GAP_ANALYSIS.md §A51)
- `telegram.py` — N/A (channel adapter)
- `tier_classifier.py` — REVIEWED (see GAP_ANALYSIS.md §A36)
- `trust_scorer.py` — REVIEWED (see GAP_ANALYSIS.md §A12)
- `user_commands.py` — REVIEWED (see GAP_ANALYSIS.md §A44)
- `vault_context.py` — REVIEWED (see GAP_ANALYSIS.md §A7)

### Infrastructure (`brain/src/infra/`)
- `config.py` — REVIEWED (see GAP_ANALYSIS.md §A45)
- `crash_handler.py` — REVIEWED (see GAP_ANALYSIS.md §A65)
- `logging.py` — REVIEWED (see §A70)
- `model_config.py` — REVIEWED (see GAP_ANALYSIS.md §A70)
- `rate_limit.py` — REVIEWED (see GAP_ANALYSIS.md §A70)
- `trace_emit.py` — REVIEWED (see GAP_ANALYSIS.md §A70)
- `trace.py` — REVIEWED (see GAP_ANALYSIS.md §A70)

### Generated
- `brain/src/gen/core_types.py` — REVIEWED (MISSING — types hand-written)

### Config
- `brain/config/pii_allowlist.yaml` — REVIEWED (MISSING — no PII allowlist)

---

## API Contracts — `api/`
- `api/brain-api.json` — REVIEWED (PARTIAL — types hand-written, no codegen)
- `api/brain-api.yaml` — REVIEWED (PARTIAL)
- `api/components/schemas.yaml` — REVIEWED (PARTIAL)
- `api/core-api.bundled.yaml` — REVIEWED (PARTIAL)
- `api/core-api.yaml` — REVIEWED (PARTIAL)
- `api/msgbox-api.yaml` — REVIEWED (PARTIAL)
- `api/oapi-brain-codegen.yaml` — REVIEWED (N/A — no codegen)
- `api/oapi-codegen.yaml` — REVIEWED (N/A — no codegen)

## Admin CLI — `admin-cli/`
- `admin-cli/src/dina_admin_cli/__main__.py` — N/A (CLI tool)
- `admin-cli/src/dina_admin_cli/client.py` — N/A (CLI tool)
- `admin-cli/src/dina_admin_cli/config.py` — N/A (CLI tool)
- `admin-cli/src/dina_admin_cli/main.py` — N/A (CLI tool)
- `admin-cli/src/dina_admin_cli/output.py` — N/A (CLI tool)

## Other
- `dina.html` — REVIEWED (design system source — ported to theme.ts)
- `models.json` — REVIEWED (MISSING — see §A70)

---

## File Counts

| Component | Files |
|-----------|-------|
| Core (Go) | ~130 |
| Brain (Python) | ~65 |
| Admin CLI | ~5 |
| API contracts | ~8 |
| **Total** | **~208** |
