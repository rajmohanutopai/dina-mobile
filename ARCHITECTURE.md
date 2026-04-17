# Dina Mobile Architecture

> The mobile device **is** the Dina Home Node. dina-core (TypeScript) and
> dina-brain (TypeScript) communicate via Ed25519 signed HTTP on localhost —
> same protocol as the Go and Python originals. On Android, they are separate
> OS processes; on iOS, separate JS contexts (platform constraint — see
> Section 23.1). All off-device traffic (D2D, dina-cli, OpenClaw) flows
> through the **MsgBox relay** via a new **Core RPC Relay protocol**
> (Section 19) — the phone never exposes a listening port. Implementation
> language is TypeScript; the native Chat UI replaces Telegram.

**Platform:** React Native (Expo) with TypeScript  
**Targets:** iOS 16+, Android 13+ (API 33+)  
**Source truth:** [dina/ARCHITECTURE.md](../dina/ARCHITECTURE.md) — this document
maps every component to its TypeScript equivalent.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [High-Level Component Map](#2-high-level-component-map)
3. [Cryptographic Foundation](#3-cryptographic-foundation)
   - 3.1 Master Seed & BIP-39 Mnemonic
   - 3.2 SLIP-0010 Key Derivation
   - 3.3 Per-Persona DEK Derivation (HKDF)
   - 3.4 Seed Wrapping (Argon2id + AES-256-GCM)
   - 3.5 Ed25519 Signing & Verification
   - 3.6 NaCl crypto_box_seal (D2D Encryption)
   - 3.7 Key Converter (Ed25519 to X25519)
   - 3.8 Secure Key Storage (Platform Keychain)
4. [Storage Layer](#4-storage-layer)
   - 4.1 SQLCipher on Mobile
   - 4.2 Per-Persona Vault Files
   - 4.3 Identity Database (Tier 0)
   - 4.4 Full-Text Search (FTS5)
   - 4.5 Vector Storage & HNSW Index
   - 4.6 Audit Log (Hash Chain)
   - 4.7 Key-Value Store
   - 4.8 Dead Drop Spool (File-Based)
5. [Identity System](#5-identity-system)
   - 5.1 DID Creation & Restoration
   - 5.2 DID Document (W3C)
   - 5.3 Key Rotation (Signing Generations)
   - 5.4 Seed Export & Recovery
6. [Persona Management](#6-persona-management)
   - 6.1 Persona Tiers (default / standard / sensitive / locked)
   - 6.2 Persona State Persistence
   - 6.3 Persona Unlock / Lock Lifecycle
   - 6.4 DEK Lifecycle in RAM
   - 6.5 Auto-Open on Boot
7. [Vault Operations](#7-vault-operations)
   - 7.1 Store (Single & Batch)
   - 7.2 Query (FTS5 + Semantic Hybrid)
   - 7.3 Delete
   - 7.4 Enrichment (L0 / L1 / Embedding)
   - 7.5 Tiered Content Loading
   - 7.6 Scratchpad (Multi-Step Reasoning)
8. [Staging Pipeline](#8-staging-pipeline)
   - 8.1 Ingest (Universal Inbox)
   - 8.2 Claim & Lease
   - 8.3 Classify (Persona Routing)
   - 8.4 Enrich (L0/L1/Embedding)
   - 8.5 Resolve (Store or Pending-Unlock)
   - 8.6 Sweep (TTL, Lease Expiry, Retry)
   - 8.7 Post-Publish Artifacts (Reminders, Contacts)
9. [Gatekeeper & Policy Engine](#9-gatekeeper--policy-engine)
   - 9.1 Intent Evaluation (SAFE / MODERATE / HIGH / BLOCKED)
   - 9.2 Egress Filtering
   - 9.3 PII Detection (Regex Patterns)
   - 9.4 Action Policies (Default Risk Levels)
   - 9.5 Brain-Denied Actions
10. [Approval System](#10-approval-system)
    - 10.1 Approval Request Creation
    - 10.2 Approval UI (In-App, Replaces Telegram)
    - 10.3 Session-Scoped Grants
    - 10.4 Pending Staging Drain on Approval
    - 10.5 Constraint-Based Access
11. [LLM Integration](#11-llm-integration)
    - 11.1 Provider Adapters (Claude, OpenAI, Gemini, OpenRouter, Local)
    - 11.2 LLM Router (Decision Tree)
    - 11.3 On-Device LLM (llama.rn)
    - 11.4 Hot-Reload Provider Configuration
    - 11.5 Structured Output & Tool Calling
    - 11.6 Prompt Registry
12. [Guardian Loop (Silence Classification)](#12-guardian-loop)
    - 12.1 Three-Tier Priority (Fiduciary / Solicited / Engagement)
    - 12.2 Deterministic Fallback Filters (Regex)
    - 12.3 LLM-Based Classification
    - 12.4 Daily Briefing Assembly
    - 12.5 Event Processing Pipeline
13. [PII Scrubbing](#13-pii-scrubbing)
    - 13.1 Tier 1: Regex Patterns (Core — TypeScript port of Go)
    - 13.2 Tier 2: Pattern Recognizers (Brain — Presidio Port)
    - 13.3 Entity Vault Pattern (Ephemeral)
    - 13.4 Rehydration
    - 13.5 Cloud LLM Gate (Scrub-Before-Send)
14. [Chat UI (Replaces Telegram)](#14-chat-ui)
    - 14.1 Conversation Thread
    - 14.2 /remember Command
    - 14.3 /ask Command (with Vault Search)
    - 14.4 Approval Inline Cards
    - 14.5 Nudge Assembly & Context Injection
    - 14.6 Anti-Her Safeguard (Law 2)
    - 14.7 Guard Scan (Post-Processing Safety)
    - 14.8 Streaming Responses
15. [Nudge & Reminder System](#15-nudge--reminder-system)
    - 15.1 Reminder Storage & Scheduling
    - 15.2 Context-Aware Nudge Assembly
    - 15.3 Local Notifications (iOS/Android)
    - 15.4 Reminder Planner (LLM-Driven)
    - 15.5 Briefing Generation
16. [Contact Management](#16-contact-management)
    - 16.1 Contact Directory (DID, Trust Level, Relationship)
    - 16.2 Sharing Policies (Per-Contact, Per-Category)
    - 16.3 Scenario Policies (D2D Message Types)
    - 16.4 Alias Management
    - 16.5 People Extraction (NER)
17. [Dina-to-Dina Messaging](#17-dina-to-dina-messaging)
    - 17.1 V1 Message Families
    - 17.2 Encryption (NaCl crypto_box_seal + Ed25519 Signature)
    - 17.3 Egress 4-Gate Enforcement
    - 17.4 Inbound Processing (Trust Evaluation)
    - 17.5 Quarantine (Unknown Senders)
    - 17.6 Memory Staging from D2D (social.update → relationship_note)
    - 17.7 DID Resolution & Endpoint Discovery
18. [Inter-Service Communication (Core ↔ Brain)](#18-inter-service-communication)
    - 18.1 Ed25519 Service Key Authentication
    - 18.2 Request Signing Protocol
    - 18.3 Service Key Provisioning
    - 18.4 Internal API Surface
    - 18.5 Error Classification & Retry
19. [Core RPC Relay (New Protocol)](#19-core-rpc-relay)
    - 19.1 Why MsgBox Is Not Enough
    - 19.2 RPC-over-D2D Envelope
    - 19.3 Request/Response Flow
    - 19.4 Privacy Model
    - 19.5 Caller Requirements
20. [Ingestion (OpenClaw + dina-cli)](#20-ingestion)
    - 20.1 Architecture (dina-cli via Core RPC Relay)
    - 20.2 Gmail Connector (via OpenClaw)
    - 20.3 Google Calendar Connector (via OpenClaw)
    - 20.4 Phone Contacts Import (Mobile-Specific)
    - 20.5 Two-Pass Triage Filter
    - 20.6 Deduplication (In-Memory + Cold-Path)
    - 20.7 Sync Rhythm
    - 20.8 Living Window (365 Days Hot, Older on Demand)
21. [Trust Network (AT Protocol)](#21-trust-network)
    - 21.1 Trust Score Querying
    - 21.2 Attestation Publishing
    - 21.3 AppView Integration (Read-Only Client)
    - 21.4 Trust Cache (Local)
22. [Export & Import](#22-export--import)
    - 22.1 Encrypted Archive (.dina Format)
    - 22.2 Per-Persona Backup
    - 22.3 Restore from Archive
    - 22.4 Cross-Device Migration
23. [Background Processing & Sleep](#23-background-processing--sleep)
    - 23.1 Process Model (iOS vs. Android)
    - 23.2 iOS Background Modes
    - 23.3 Android WorkManager & Process Isolation
    - 23.4 Reminder Firing (Local Notifications)
    - 23.5 Background Goroutines → Background Tasks
    - 23.6 Sleep/Wake Lifecycle
24. [Middleware Stack](#24-middleware-stack)
    - 24.1 Authentication Middleware
    - 24.2 Rate Limiting
    - 24.3 Body Limit, Timeout, Recovery
    - 24.4 Logging (Never Log PII)
25. [Observability](#25-observability)
    - 25.1 Audit Trail (Hash Chain)
    - 25.2 Crash Logging
    - 25.3 Health Self-Check
    - 25.4 Trace Store (Ephemeral Debug Events)
26. [Security Invariants](#26-security-invariants)
27. [Navigation & Screen Map](#27-navigation--screen-map)
28. [Technology Choices](#28-technology-choices)
29. [Implementation Phases](#29-implementation-phases)

---

## 1. Design Principles

### Carried Over Unchanged from Server Dina

1. **Dina is a Kernel, Not a Platform.** Zero internal plugins. No untrusted
   code runs inside Core or Brain. External agents (OpenClaw, etc.) communicate
   via MCP or DIDComm only.

2. **Core and Brain are Separated with Ed25519 Auth Boundary.** Core owns
   identity, master seed, vault encryption, policy enforcement. Brain owns
   LLM reasoning, ingestion scheduling, classification, enrichment. They
   communicate via Ed25519 signed HTTP on localhost — same protocol as server.
   On **Android**, they run as separate OS processes (Foreground Service in
   `:core`). On **iOS**, they run as separate JS contexts in one process
   (platform limitation — no background daemons). See Section 23.1 for the
   full process model and honest security assessment.

3. **Silence First (Law 1).** Default to quiet. Only interrupt for fiduciary
   events. Everything else waits for daily briefing or user query.

4. **Anti-Her (Law 2).** Never simulate emotional intimacy. Redirect to real
   humans when detecting companionship-seeking patterns.

5. **Cart Handover (Law 3).** Never touch money. Advise, draft, hand control
   back to the user.

6. **Draft-Don't-Send.** Never call `send()` — only `draft()`. User approves
   every outbound action.

7. **Cryptographic Isolation.** Each persona is a separate SQLCipher database
   with its own DEK. Locked persona = DEK not in RAM = opaque bytes. Math,
   not code.

8. **Explicit Composition Root.** Single `main.ts` per component shows every
   dependency. No DI frameworks, no auto-wiring.

9. **Fail Closed.** Missing keys → deny. Missing config → deny. Ambiguous
   classification → Engagement tier. Unknown sender → quarantine.

### Mobile-Specific Additions

10. **MsgBox Relay for All Off-Device Traffic.** The phone never exposes a
    listening port to the network. All inbound traffic — D2D messages,
    dina-cli/OpenClaw requests — arrives via the MsgBox relay. The home node
    maintains an outbound WebSocket to MsgBox (`wss://mailbox.dinakernel.com`),
    authenticated via Ed25519 challenge-response. The only direct localhost
    connection is Brain ↔ Core.

11. **Sleep is Normal.** Unlike a server, a phone sleeps. MsgBox durably
    buffers messages (100 msgs / 10 MiB / 24h TTL per DID) while the phone
    is offline. On wake, the home node reconnects and drains the buffer.
    Silence First makes this natural — when asleep, Dina is silent.

12. **Chat UI Replaces Telegram.** The native chat interface is the primary
    user interaction channel. It handles /remember, /ask, approvals, nudges,
    and briefings — everything Telegram did, but native.

13. **Same Parameters, Same Algorithms.** Argon2id: 128MB memory, 3 iterations,
    4 parallelism. SLIP-0010 paths identical. HKDF info strings identical.
    Service key format identical. Nothing is "tuned for mobile" — it is the
    same Dina.

---

## 2. High-Level Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                      MOBILE DEVICE                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  UI LAYER (React Native)               │  │
│  │  Chat │ Approvals │ Vault Browser │ Settings           │  │
│  │  Contacts │ Reminders │ Onboarding │ Briefing          │  │
│  └──────────────────────┬────────────────────────────────┘  │
│                         │ (HTTP to Brain on localhost)        │
│  ┌──────────────────────┴────────────────────────────────┐  │
│  │       dina-brain (TypeScript, SEPARATE PROCESS — see 23.1)      │  │
│  │                                                        │  │
│  │  GuardianLoop      LLMRouter       NudgeAssembler      │  │
│  │  StagingProcessor  EnrichmentSvc   EntityVault         │  │
│  │  PersonaSelector   SyncEngine      ReminderPlanner     │  │
│  │  DomainClassifier  ChatService     AdminRoutes         │  │
│  │                                                        │  │
│  │  Port: CoreClient, LLMProvider, PIIScrubber             │  │
│  │  Adapter: CoreHTTPClient (Ed25519 signed),              │  │
│  │     Claude/Gemini/OpenAI/Llama, PatternRecognizers      │  │
│  └──────────────────────┬────────────────────────────────┘  │
│                         │                                    │
│         Ed25519 signed HTTP requests (same as server)        │
│         X-DID, X-Timestamp, X-Nonce, X-Signature headers     │
│                         │                                    │
│  ┌──────────────────────┴────────────────────────────────┐  │
│  │       dina-core (TypeScript, SEPARATE PROCESS — see 23.1)       │  │
│  │                                                        │  │
│  │  IdentityService   VaultService    GatekeeperService   │  │
│  │  TransportService  DeviceService   ExportService       │  │
│  │  ContactService    AuditService    StagingService      │  │
│  │                                                        │  │
│  │  Port layer: VaultReader/Writer, HDKeyDeriver, Signer, │  │
│  │       Encryptor, PersonaManager, ContactDirectory,     │  │
│  │       OutboxManager, AuditLogger, StagingManager,      │  │
│  │       Gatekeeper, SharingPolicyManager, PIIScrubber    │  │
│  │  Adapter layer: SQLCipherVault, SLIP0010Deriver,       │  │
│  │       Ed25519Signer, NaClBoxSealer, HKDFKeyDeriver,    │  │
│  │       Argon2idWrapper, SQLiteOutbox, SQLiteAuditLog,   │  │
│  │       FileDeadDrop, ContactDirectoryImpl, etc.         │  │
│  │                                                        │  │
│  │  MsgBoxClient (outbound WS to relay)                    │  │
│  │                                                        │  │
│  │  Middleware: Auth (Ed25519 only), RateLimit              │  │
│  │  HTTP Router: 40+ endpoints on localhost                │  │
│  └──────────────────────┬────────────────────────────────┘  │
│                    Outbound WebSocket                        │
│                    (Ed25519 challenge-response)               │
└─────────────────────────┼────────────────────────────────────┘
                          ▼
              ┌───────────────────────┐
              │   MsgBox Relay Server  │
              │  wss://mailbox.dina…  │
              │                       │
              │  WS  /ws     ← Phone  │
              │  POST /forward ← All  │
              │    off-device callers  │
              └───────────┬───────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
  ┌──────────────────┐       ┌──────────────────┐
  │ Other Dina Nodes │       │ User's Laptop    │
  │ (D2D messages)   │       │ OpenClaw ←(MCP)→ │
  │ POST /forward    │       │ dina-cli         │
  └──────────────────┘       │ POST /forward    │
                             └──────────────────┘
```

**Key architectural facts:**

- Core and Brain communicate via **Ed25519 signed HTTP on localhost**. On
  Android, they are **separate OS processes** (Foreground Service). On iOS,
  they are **separate JS contexts in one process** (platform limitation —
  see Section 23.1 for honest security assessment)
- **All off-device traffic flows through MsgBox relay.** The phone never
  exposes a listening port. Core maintains an outbound WebSocket to MsgBox,
  authenticated via Ed25519 challenge-response
- Brain authenticates to Core with its **Ed25519 service key** on every call
- Chat UI authenticates to Brain with an **Ed25519 UI device key** generated
  at onboarding (no CLIENT_TOKEN — mobile implements Ed25519-everywhere
  from day 1, ahead of the server's planned Phase 2 migration)
- Brain has **no direct database access** — all data through Core's API
- External agents (OpenClaw, dina-cli, other Dinas) reach Core via
  MsgBox relay's `/forward` endpoint
- All middleware (auth, rate limit, body limit) runs on Core's localhost server

**What changes from server:**

| Aspect | Server | Mobile |
|--------|--------|--------|
| Core language | Go | TypeScript |
| Brain language | Python | TypeScript |
| User interaction | Telegram bot | Native Chat UI |
| Admin UI | Web (FastAPI + HTML) | Native Settings screens |
| Network exposure | Direct HTTPS or MsgBox | MsgBox only (no public IP) |
| Process isolation | Docker containers | Separate OS processes |
| Background tasks | Go goroutines | Mobile OS background APIs |
| PII Tier 2 | Presidio pattern recognizers | TypeScript pattern recognizer port |

---

## 3. Cryptographic Foundation

> Every algorithm, parameter, key path, info string, and salt formula is
> **identical** to the server implementation. The canonical source of truth
> for HKDF strings is `core/internal/adapter/crypto/keyderiver.go`. This
> section documents the TypeScript library choices for each primitive.
>
> **Before implementing:** Cross-language test vectors MUST be generated from
> the Go test suite and verified against the TypeScript implementation. A
> seed + persona name must produce the same DEK in both languages.

### 3.1 Master Seed & BIP-39 Mnemonic

**Identical to:** `core/internal/adapter/crypto/seed.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| BIP-39 wordlist | `tyler-smith/go-bip39` | `@scure/bip39` (audited, zero-dep) |
| Mnemonic → seed | PBKDF2, empty passphrase | Same — `mnemonicToSeed()` |
| Entropy | `crypto/rand` | `expo-crypto.getRandomBytes(32)` (OS CSPRNG) |
| Seed length | 256-bit (32 bytes) | Same |

**Functions (same signatures as Go):**
- `generateMnemonic()` → 24-word string
- `mnemonicToSeed(mnemonic)` → `Uint8Array(64)`
- `validateMnemonic(mnemonic)` → `boolean`

**Invariant:** Raw seed NEVER persisted to disk unencrypted. Always wrapped (3.4).

---

### 3.2 SLIP-0010 Key Derivation

**Identical to:** `core/internal/adapter/crypto/slip0010.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| HMAC-SHA512 | `crypto/hmac` + `crypto/sha512` | `@noble/hashes/hmac` + `@noble/hashes/sha512` |
| Hardened only | Enforced (index >= 0x80000000) | Same enforcement |

**Derivation tree (unchanged):**
```
Master Seed
  └─ m/9999'
       ├─ 0'/{gen}' ──────── Root Identity Key (signs did:plc)
       ├─ 1'/{index}'/{gen}' Per-Persona Signing Keys
       │   ├─ 0'/0' ──────── /consumer
       │   ├─ 1'/0' ──────── /professional
       │   ├─ 2'/0' ──────── /social
       │   ├─ 3'/0' ──────── /health
       │   └─ 4'/0' ──────── /financial
       └─ 2'/{gen}' ──────── secp256k1 PLC Rotation Key
```

**Functions:**
- `derivePath(seed, path)` → `{ privateKey, chainCode }`
- `deriveRootSigningKey(seed, generation)` → Ed25519 keypair
- `derivePersonaSigningKey(seed, personaIndex, generation)` → Ed25519 keypair
- `deriveRotationKey(seed, generation)` → secp256k1 keypair

**Constraint:** Reject any path containing non-hardened components. Reject
BIP-44 purpose 44' (reserved for crypto wallets).

**Note:** Service auth keys (purpose 3) exist in the derivation tree
definition but **service keys are NOT derived from seed in practice.**
They are independently generated Ed25519 PEM files (see Section 18.3).

---

### 3.3 Per-Persona DEK Derivation (HKDF)

**Identical to:** `core/internal/adapter/crypto/key_deriver.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| HKDF-SHA256 | `golang.org/x/crypto/hkdf` | `@noble/hashes/hkdf` + `@noble/hashes/sha256` |

**Canonical HKDF strings (from `keyderiver.go` — the authoritative source):**

```
info = "dina:persona:{personaName}:dek:v1"
salt = SHA256("dina:salt:{personaName}")
```

**Note:** The codebase also contains `hkdf.go` which uses a different pattern
(`"dina:vault:{personaID}:v1"` with a user-supplied salt). The `keyderiver.go`
pattern above is **canonical** for persona DEK derivation. The `hkdf.go`
pattern is a lower-level utility used internally. Cross-language test vectors
will resolve any ambiguity.

**Derivation (exact same parameters as `keyderiver.go`):**
```
IKM  = masterSeed (first 32 bytes)
salt = SHA256("dina:salt:{personaName}")     // e.g., SHA256("dina:salt:health")
info = "dina:persona:{personaName}:dek:v1"   // e.g., "dina:persona:health:dek:v1"
DEK  = HKDF-SHA256-Expand(HKDF-SHA256-Extract(salt, IKM), info, 32)
```

**Backup key derivation:**
```
info = "dina:backup:key:v1"
salt = SHA256("dina:backup:salt")
```

**V2 migration path (if applicable):**
```
info = "dina:persona:{personaName}:dek:v2"
IKM  = Argon2id KEK (upgraded)
```

**Functions:**
- `derivePersonaDEK(seed, personaName)` → `Uint8Array(32)`
- `deriveDEKHash(dek)` → SHA-256 hex string (for validation — DEK itself never stored)
- `deriveBackupKey(seed)` → `Uint8Array(32)`

**Invariant:** DEK for a locked persona is NEVER derived. Code path must check
tier and lock state before calling.

---

### 3.4 Seed Wrapping (Argon2id + AES-256-GCM)

**Identical to:** `core/internal/adapter/crypto/key_wrapper.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| Argon2id | `golang.org/x/crypto/argon2` | `react-native-argon2` (native C binding) |
| AES-256-GCM | `crypto/aes` + `crypto/cipher` | `react-native-aes-gcm-crypto` |

**Parameters (IDENTICAL — not reduced for mobile):**
```
Argon2id v1.3:
  memory:      128 MB
  iterations:  3
  parallelism: 4
  output:      32 bytes (KEK)
```

**Wrap flow (same as server):**
```
1. Generate random salt (16 bytes)
2. passphrase → Argon2id(salt, memory=128MB, iter=3, par=4) → KEK (32 bytes)
3. Generate random IV (12 bytes)
4. AES-256-GCM.encrypt(KEK, IV, masterSeed) → ciphertext + tag
5. Store: { salt, iv, ciphertext, tag, argon2_params }
```

**Unwrap flow (same as server):**
```
1. Read wrapped blob from disk
2. passphrase → Argon2id(same params, same salt) → KEK
3. AES-256-GCM.decrypt(KEK, iv, ciphertext, tag) → masterSeed
4. Validate: SHA-256(masterSeed) matches stored hash
5. Reject all-zero seed (fail closed)
```

**Functions:**
- `wrapSeed(passphrase, seed)` → `WrappedSeed`
- `unwrapSeed(passphrase, wrappedBlob)` → `Uint8Array(32)`
- `changePassphrase(oldPass, newPass)` → Re-wrap with new KEK

---

### 3.5 Ed25519 Signing & Verification

**Identical to:** `core/internal/adapter/crypto/ed25519.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| Ed25519 | `crypto/ed25519` | `@noble/ed25519` (audited, pure JS) |

**Functions:**
- `sign(message, privateKey)` → `Uint8Array(64)`
- `verify(signature, message, publicKey)` → `boolean`
- `getPublicKey(privateKey)` → `Uint8Array(32)`

**Used for:** DID identity, D2D message authentication, inter-service request
signing (Core ↔ Brain), device authentication.

---

### 3.6 NaCl crypto_box_seal (D2D Encryption)

**Identical to:** `core/internal/adapter/crypto/nacl.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| NaCl | `golang.org/x/crypto/nacl/box` | `react-native-sodium` |

**Functions:**
- `sealEncrypt(plaintext, recipientEd25519Pub)` → `Uint8Array`
- `sealDecrypt(ciphertext, recipientEd25519Keypair)` → `Uint8Array`

---

### 3.7 Key Converter (Ed25519 ↔ X25519)

**Identical to:** `core/internal/adapter/crypto/key_converter.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| Conversion | libsodium `crypto_sign_ed25519_*` | `react-native-sodium` (same libsodium) |

**Functions:**
- `ed25519PubToX25519(ed25519Pub)` → `Uint8Array(32)`
- `ed25519SecToX25519(ed25519Sec)` → `Uint8Array(32)`

---

### 3.8 Secure Key Storage (Platform Keychain)

**Mobile-specific (no server equivalent — server uses file permissions).**

| Platform | Mechanism |
|----------|-----------|
| iOS | Keychain Services (Secure Enclave for biometric guard) |
| Android | Android Keystore (StrongBox if available) |
| Abstraction | `react-native-keychain` |

**What goes in keychain:**
- Passphrase for biometric unlock (if user opts in)

**What goes in app sandbox files (NOT keychain):**
- Wrapped seed blob (`wrapped_seed.bin`)
- Service key PEM files (`service_keys/`)
- Both are protected by app sandbox permissions, not keychain

**Note:** Biometric is an optional convenience layer over the passphrase, NOT
a replacement. The passphrase-based unlock path is always available and works
identically to server mode.

---

## 4. Storage Layer

### 4.1 SQLCipher on Mobile

**Identical to:** `core/internal/adapter/vault/manager.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| SQLite + SQLCipher | CGO + `go-sqlcipher` | `op-sqlite` with SQLCipher flag |
| Connection pool | Write + read pool | Same (op-sqlite handles via JSI) |
| WAL mode | `PRAGMA journal_mode=WAL` | Same |
| Synchronous | `PRAGMA synchronous=NORMAL` | Same |

**File layout (same structure as server `/var/lib/dina/`):**
```
{APP_SANDBOX}/dina/
  ├── vaults/
  │   ├── identity.sqlite        (Tier 0)
  │   ├── general.sqlite         (Tier 1 — default)
  │   ├── work.sqlite            (Tier 1 — standard)
  │   ├── health.sqlite          (Tier 1 — sensitive)
  │   ├── finance.sqlite         (Tier 1 — sensitive)
  │   └── {custom}.sqlite        (Tier 1 — user-created)
  ├── deaddrop/                   (encrypted D2D message spool)
  ├── wrapped_seed.bin            (Argon2id-wrapped master seed)
  ├── persona_state.json          (persona metadata)
  └── service_keys/               (Ed25519 PEM — NOT seed-derived)
       ├── private/               (brain + core private keys)
       └── public/                (brain + core public keys)
```

**Functions (same interface as Go VaultManager):**
- `openVault(path, dek)` → `Database`
- `closeVault(db)` — Close and zero DEK reference
- `isVaultOpen(personaName)` → `boolean`
- `checkpoint(db)` — WAL checkpoint for backup consistency

---

### 4.2 Per-Persona Vault Files

**Schema (from server `persona_001.sql` — verbatim):**

```sql
-- Source: core/internal/adapter/sqlite/schema/persona_001.sql

CREATE TABLE vault_items (
  id                 TEXT PRIMARY KEY,
  type               TEXT NOT NULL
                     CHECK (type IN ('email','message','event','note','photo',
                       'email_draft','cart_handover','contact_card','document',
                       'bookmark','voice_memo','kv','contact','health_context',
                       'work_context','finance_context','family_context',
                       'trust_review','purchase_decision','relationship_note',
                       'medical_record','medical_note','trust_attestation')),
  source             TEXT NOT NULL DEFAULT '',
  source_id          TEXT NOT NULL DEFAULT '',
  contact_did        TEXT NOT NULL DEFAULT '',
  summary            TEXT NOT NULL DEFAULT '',
  body               TEXT NOT NULL DEFAULT '',
  metadata           TEXT NOT NULL DEFAULT '{}',
  embedding          BLOB,
  tags               TEXT NOT NULL DEFAULT '[]',
  timestamp          INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  created_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  deleted            INTEGER NOT NULL DEFAULT 0,
  sender             TEXT NOT NULL DEFAULT '',
  sender_trust       TEXT NOT NULL DEFAULT '',
  source_type        TEXT NOT NULL DEFAULT '',
  confidence         TEXT NOT NULL DEFAULT '',
  retrieval_policy   TEXT NOT NULL DEFAULT 'normal',
  contradicts        TEXT NOT NULL DEFAULT '',
  content_l0         TEXT NOT NULL DEFAULT '',
  content_l1         TEXT NOT NULL DEFAULT '',
  enrichment_status  TEXT NOT NULL DEFAULT 'pending',
  enrichment_version TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_vault_items_type ON vault_items(type);
CREATE INDEX idx_vault_items_source ON vault_items(source, source_id);
CREATE INDEX idx_vault_items_ts ON vault_items(timestamp);
CREATE INDEX idx_vault_items_contact ON vault_items(contact_did);
CREATE INDEX idx_vault_items_retrieval_policy ON vault_items(retrieval_policy);

CREATE VIRTUAL TABLE vault_items_fts USING fts5(
  summary, body, tags, contact_did,
  content='vault_items',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
-- FTS5 triggers (INSERT/DELETE/UPDATE) omitted for brevity — same as server

CREATE TABLE relationships (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id    TEXT NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  rel_type   TEXT NOT NULL DEFAULT 'related'
             CHECK (rel_type IN ('related','reply_to','attachment','duplicate','thread')),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  UNIQUE(from_id, to_id, rel_type)
);
CREATE INDEX idx_relationships_from ON relationships(from_id);
CREATE INDEX idx_relationships_to ON relationships(to_id);

CREATE TABLE embedding_meta (
  item_id       TEXT PRIMARY KEY REFERENCES vault_items(id) ON DELETE CASCADE,
  model_name    TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT '',
  dimensions    INTEGER NOT NULL DEFAULT 768,
  embedded_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
) WITHOUT ROWID;

CREATE TABLE staging (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT '',
  summary    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  metadata   TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
) WITHOUT ROWID;
CREATE INDEX idx_staging_expires ON staging(expires_at);

CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  description TEXT NOT NULL DEFAULT ''
);
```

**Key differences from naive assumptions:**
- `vault_items.body` (not `body_text`)
- `vault_items.type` has 22 specific CHECK-constrained values
- `relationships` table uses `from_id`/`to_id` foreign keys (not entity_name)
- `embedding_meta` is a separate table tracking model provenance
- Per-persona `staging` table exists alongside the identity-level `staging_inbox`

---

### 4.3 Identity Database (Tier 0)

**Schema (from server `identity_001.sql` + `identity_002_trust_cache.sql` —
verbatim, not paraphrased):**

```sql
-- Source: core/internal/adapter/sqlite/schema/identity_001.sql

CREATE TABLE contacts (
  did           TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL DEFAULT '',
  trust_level   TEXT NOT NULL DEFAULT 'unknown'
                CHECK (trust_level IN ('blocked','unknown','verified','trusted')),
  sharing_tier  TEXT NOT NULL DEFAULT 'none'
                CHECK (sharing_tier IN ('none','summary','full','locked')),
  notes         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
) WITHOUT ROWID;
CREATE INDEX idx_contacts_trust ON contacts(trust_level);

CREATE TABLE audit_log (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  prev_hash   TEXT NOT NULL DEFAULT '',
  entry_hash  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_audit_log_ts ON audit_log(ts);
CREATE INDEX idx_audit_log_actor ON audit_log(actor);

CREATE TABLE device_tokens (
  device_id   TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT '',
  last_seen   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  revoked     INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE TABLE crash_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  component   TEXT NOT NULL,
  message     TEXT NOT NULL,
  stack_hash  TEXT NOT NULL DEFAULT '',
  reported    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_crash_log_ts ON crash_log(ts);

CREATE TABLE kv_store (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
) WITHOUT ROWID;

CREATE TABLE scratchpad (
  task_id     TEXT PRIMARY KEY,
  step        INTEGER NOT NULL DEFAULT 0,
  context     TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
) WITHOUT ROWID;

CREATE TABLE dina_tasks (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  payload       TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','completed','failed','dead_letter')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  scheduled_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  started_at    INTEGER,
  completed_at  INTEGER,
  error         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
) WITHOUT ROWID;
CREATE INDEX idx_dina_tasks_status ON dina_tasks(status, scheduled_at);

CREATE TABLE reminders (
  id              TEXT PRIMARY KEY,
  message         TEXT NOT NULL,
  due_at          INTEGER NOT NULL,
  recurring       TEXT NOT NULL DEFAULT ''
                  CHECK (recurring IN ('','daily','weekly','monthly')),
  completed       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  source_item_id  TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT '',
  persona         TEXT NOT NULL DEFAULT '',
  timezone        TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending'
) WITHOUT ROWID;
CREATE UNIQUE INDEX idx_reminders_dedup
  ON reminders(source_item_id, kind, due_at, persona);
CREATE INDEX idx_reminders_due ON reminders(due_at) WHERE completed=0;

CREATE TABLE staging_inbox (
  id              TEXT PRIMARY KEY,
  connector_id    TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT '',
  source_id       TEXT NOT NULL DEFAULT '',
  source_hash     TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT '',
  summary         TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  sender          TEXT NOT NULL DEFAULT '',
  metadata        TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received','classifying','stored','pending_unlock','failed')),
  target_persona  TEXT NOT NULL DEFAULT '',
  classified_item TEXT NOT NULL DEFAULT '{}',
  error           TEXT NOT NULL DEFAULT '',
  retry_count     INTEGER NOT NULL DEFAULT 0,
  claimed_at      INTEGER NOT NULL DEFAULT 0,
  lease_until     INTEGER NOT NULL DEFAULT 0,
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  ingress_channel TEXT NOT NULL DEFAULT '',
  origin_did      TEXT NOT NULL DEFAULT '',
  origin_kind     TEXT NOT NULL DEFAULT '',
  producer_id     TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX idx_staging_inbox_dedup
  ON staging_inbox(producer_id, source, source_id);
CREATE INDEX idx_staging_inbox_status ON staging_inbox(status);
CREATE INDEX idx_staging_inbox_expires ON staging_inbox(expires_at);

-- Source: core/internal/adapter/sqlite/schema/identity_002_trust_cache.sql

CREATE TABLE trust_cache (
  did              TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL DEFAULT '',
  trust_score      REAL NOT NULL DEFAULT 0.0
                   CHECK (trust_score >= 0.0 AND trust_score <= 1.0),
  trust_ring       INTEGER NOT NULL DEFAULT 1
                   CHECK (trust_ring IN (1, 2, 3)),
  relationship     TEXT NOT NULL DEFAULT 'unknown'
                   CHECK (relationship IN ('contact','frequent','1-hop','2-hop','unknown')),
  source           TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','appview_sync')),
  last_verified_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
) WITHOUT ROWID;

CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  description TEXT NOT NULL DEFAULT ''
);
```

**Encrypted with:** `HKDF(seed, info="dina:persona:identity:dek:v1", salt=SHA256("dina:salt:identity"))` — same canonical HKDF pattern as all persona vaults.

---

### 4.4 Full-Text Search (FTS5)

**Identical to server.** op-sqlite compiles with FTS5 enabled. Same `unicode61
remove_diacritics 2` tokenizer. Index columns: `summary, body, tags,
contact_did` (as defined in `persona_001.sql` — NOT `body_text` or
`content_l0`).

### 4.5 Vector Storage & HNSW Index

**Identical to:** `core/internal/adapter/vault/hnsw.go`

| Concern | Server (Go) | Mobile (TypeScript) |
|---------|-------------|---------------------|
| Embedding storage | BLOB in vault_items | Same |
| HNSW index | Pure Go HNSW | Pure JS HNSW or `hnswlib-wasm` |
| Hydration | On persona unlock | Same |
| Destruction | On persona lock | Same |

**Hybrid search scoring (same formula):**
```
score = 0.4 × fts5_rank + 0.6 × cosine_similarity
```

### 4.6 Audit Log (Hash Chain)

**Identical to server.** Append-only, SHA-256 chained, 90-day retention.

### 4.7 Key-Value Store

**Identical to server.** `kv_store` table in identity database.

### 4.8 Dead Drop Spool (File-Based)

**Identical to:** `core/internal/adapter/transport/deaddrop.go`

File-based spool under `{APP_SANDBOX}/dina/deaddrop/`. Same 500MB cap.
Same drain-on-unlock behavior.

---

## 5. Identity System

### 5.1–5.4: DID Creation, Document, Rotation, Recovery

**All identical to server.** Same PLC directory interaction, same DID Document
format, same signing generation tracking, same mnemonic-based recovery.

| Function | Server | Mobile |
|----------|--------|--------|
| PLC directory HTTP | Go `net/http` | `fetch()` |
| DID format | `did:plc:...` | Same |
| Service endpoint | `#dina-messaging` type `DinaMsgBox` | Same (always MsgBox on mobile) |

---

## 6. Persona Management

### 6.1–6.5: Tiers, State, Unlock/Lock, DEK Lifecycle, Auto-Open

**All identical to server.** Same four tiers (default/standard/sensitive/locked),
same `persona_state.json` persistence, same DEK derivation on unlock, same
auto-open of default+standard on boot.

**Mobile-specific addition for DEK lifecycle:**

When the app is backgrounded beyond a configurable timeout, all DEKs are
zeroed and vaults closed, requiring re-unlock on foregrounding. This is
analogous to the server's "Security Mode" where the seed is not stored and
must be re-entered on reboot. The timeout is user-configurable.

---

## 7. Vault Operations

### 7.1–7.6: Store, Query, Delete, Enrichment, Tiered Loading, Scratchpad

**All identical to server.** Same store/batch semantics, same hybrid search
(FTS5 + HNSW), same L0/L1/L2 tiered content model, same scratchpad for
multi-step reasoning crash recovery.

---

## 8. Staging Pipeline

### 8.1–8.7: Ingest, Claim, Classify, Enrich, Resolve, Sweep, Post-Publish

**All identical to server.** Same universal inbox, same claim-with-lease
pattern (15-min lease, 5-min heartbeat extension), same classification
(domain keywords → LLM fallback), same enrichment (L0/L1/embedding with
PII scrub gate), same resolve (stored vs. pending_unlock), same sweep
(7-day TTL, lease expiry revert, retry ≤ 3).

**Ingress channels on mobile:** `chat` (replaces `telegram`), `connector`,
`d2d`, `admin`, `cli`. Same staging_inbox schema.

---

## 9. Gatekeeper & Policy Engine

### 9.1–9.5: Intent Evaluation, Egress, PII, Policies, Brain-Denied

**All identical to server.** Same risk levels (SAFE/MODERATE/HIGH/BLOCKED),
same default action policies, same egress filtering, same PII regex patterns
(ported from Go), same brain-denied actions list (did_sign, did_rotate,
vault_backup, persona_unlock, seed_export).

---

## 10. Approval System

### 10.1, 10.3–10.5: Request Creation, Grants, Drain, Constraints

**Identical to server.**

### 10.2 Approval UI (In-App, Replaces Telegram)

**This is the primary change.** Instead of sending approval requests to
Telegram and receiving user responses via Telegram messages, the mobile
app shows inline approval cards in the Chat UI.

**The approval data model and lifecycle are unchanged.** Only the
presentation and interaction surface changes:

| Server | Mobile |
|--------|--------|
| Brain → Telegram notification | Brain → local notification + chat card |
| User replies in Telegram | User taps Approve/Deny in chat |
| `TelegramService.handle_approval_response()` | `ChatService.handleApprovalResponse()` |

**Approval card shows:** requester DID/name, action, persona, reason, preview.
Same fields as the Telegram message, rendered as a native UI card.

---

## 11. LLM Integration

### 11.1–11.6: Providers, Router, Local, Hot-Reload, Tools, Prompts

**All identical to server** in logic and routing decisions.

| Provider | Server (Python) | Mobile (TypeScript) |
|----------|----------------|---------------------|
| Claude | `anthropic` SDK | `@anthropic-ai/sdk` |
| OpenAI | `openai` SDK | `openai` SDK (JS) |
| Gemini | `google.generativeai` | `@google/generative-ai` |
| OpenRouter | HTTP client | `fetch()` |
| Local | Ollama endpoint | `llama.rn` (on-device) |

**LLM Router decision tree: identical.** Same precedence: FTS-only tasks skip
LLM → local if available → lite model for lightweight tasks → PII scrub gate
for sensitive + cloud → fallback chain → graceful degradation to FTS-only.

**Prompt registry: identical.** All prompts ported verbatim from
`brain/src/prompts.py` to `brain/src/prompts.ts`.

---

## 12. Guardian Loop

### 12.1–12.5: Priority Tiers, Deterministic Filters, LLM Classification, Briefing, Events

**All identical to server.** Same three tiers (Fiduciary/Solicited/Engagement),
same regex fallback filters, same LLM-based refinement, same daily briefing
assembly, same event processing pipeline.

---

## 13. PII Scrubbing

### 13.1 Tier 1: Regex Patterns (Core)

**Identical to:** `core/internal/adapter/pii/scrubber.go`

Same regex patterns ported to TypeScript. Same overlap removal (prefer longer
matches). Same type-based numbering (`[EMAIL_1]`, `[PHONE_1]`).

### 13.2 Tier 2: Pattern Recognizers (Brain)

**Server:** Microsoft Presidio AnalyzerEngine + AnonymizerEngine with
**deterministic pattern recognizers** (NOT statistical NER — spaCy NER is
disabled in the server due to false positives on Indian names/medical terms).
Presidio's value is its structured pattern matchers for international PII
formats.

**Mobile:** Presidio (Python) cannot run on mobile. The TypeScript port
must replicate Presidio's **pattern recognizer** behavior — these are
essentially regex-based matchers with entity-type-aware replacement, NOT
machine learning models.

**Implementation plan:**

1. **Port Presidio's pattern recognizers to TypeScript.** These are
   deterministic regex patterns with overlap resolution and entity typing.
   The server's `scrubber_presidio.py` adapter shows exactly which
   recognizers are enabled and which are disabled.

2. **Scrubbed entity types (same as server):**
   - Structured PII: EMAIL_ADDRESS, PHONE_NUMBER, CREDIT_CARD, IP_ADDRESS, US_SSN
   - India-specific: AADHAAR_NUMBER, IN_PAN, IN_IFSC, IN_UPI_ID
   - EU: DE_STEUER_ID, FR_NIR, NL_BSN
   - Medical: MEDICAL_CONDITION, MEDICATION, HEALTH_INSURANCE_ID

3. **Safe entities (same allow-list — never scrubbed):** DATE, TIME, MONEY,
   PERCENT, QUANTITY, ORDINAL, CARDINAL, NORP

4. **Country-level GPE filter (same):** "India", "USA" pass through.
   City-level scrubbed.

5. **Replacement strategy (same as server):**
   - Synthetic data (when Faker equivalent available): `PERSON_1` → `Robert Smith`
   - Fallback: tagged tokens `[PERSON_1]`

6. **V1 known gap (same as server):** Names and addresses in free text
   not detected. Both server V1 and mobile V1 share this limitation.
   Server V2 plan (GLiNER) can be ported to mobile later.

**Port interface:** Same as `brain/src/port/scrubber.py` so the adapter
can be swapped without changing service logic.

### 13.3–13.5: Entity Vault, Rehydration, Cloud Gate

**All identical to server.** Same ephemeral in-memory mapping, same
scrub-before-cloud-send hard gate, same rehydration after response.

---

## 14. Chat UI (Replaces Telegram)

> This is the main user-facing change. Everything the Telegram bot did —
> `/remember`, `/ask`, approval prompts, nudges, briefings — the Chat UI does
> natively. The underlying data models, service calls, and processing are
> unchanged.

### 14.1 Conversation Thread

**Message types:**
- `user_message` — Text from user
- `dina_response` — Dina's reply (with source citations)
- `approval_card` — Inline approval request (same data as Telegram notification)
- `nudge` — Context-aware suggestion
- `briefing` — Daily briefing summary
- `system` — System notifications (persona unlocked, reminder set, etc.)
- `error` — Error messages

**Chat history:** Stored in identity database (cross-persona, not in
individual vaults).

### 14.2 /remember Command

**Same flow as server Telegram `/remember`:**
```
User types "Emma's birthday is March 15"
  → Core /api/v1/remember endpoint
  → Staging ingest (channel='chat')
  → Brain claims, classifies, enriches
  → Core resolves to vault
  → Response: "stored" / "needs_approval" / "processing" / "failed"
```

### 14.3 /ask Command

**Same flow as server Telegram `/ask` → Brain `/v1/reason`:**
```
User types "When is Emma's birthday?"
  → Core /api/v1/ask endpoint
  → Brain: vault search → tiered loading → PII scrub → LLM → guard scan → rehydrate
  → Response streamed to chat
```

### 14.4 Approval Inline Cards

Same data as Telegram approval messages. Native UI with Approve/Deny buttons
and scope selector (this time / this session).

### 14.5–14.8: Nudge, Anti-Her, Guard Scan, Streaming

**All identical to server Brain logic.** Same nudge assembly from vault context,
same Anti-Her regex suites + LLM detection, same guard scan post-processing,
same streaming token delivery.

---

## 15. Nudge & Reminder System

### 15.1–15.5: Storage, Assembly, Notifications, Planner, Briefing

**All identical to server.** Same reminder data model, same LLM-driven
planner, same context enrichment from vault.

**Mobile-specific:** Reminders fire via `expo-notifications` (local
notifications) instead of Telegram messages. Same priority mapping.

---

## 16. Contact Management

### 16.1–16.5: Directory, Sharing, Scenarios, Aliases, People

**All identical to server.** Same data models, same policies, same enforcement.

---

## 17. Dina-to-Dina Messaging

### 17.1–17.6: Families, Encryption, Egress, Inbound, Quarantine, Staging

**All identical to server.** Same V1 message families, same NaCl encryption
flow, same 4-gate egress enforcement, same trust evaluation, same quarantine
for unknown senders.

### 17.7 DID Resolution & Endpoint Discovery (MsgBox-Aware)

**What:** To send a D2D message, resolve the recipient's DID to find their
messaging service and transport type.

**Resolution flow (same as server `transport.go`):**
1. Resolve DID via PLC directory → DID Document
2. Find service with ID suffix `#dina-messaging`
3. Read service type:
   - `DinaMsgBox` → convert WS URL to HTTP `/forward` URL, POST to MsgBox
   - `DinaDirectHTTPS` → POST directly to endpoint's `/msg`
4. Route message based on type

**URL conversion (from server `transport.go:462-471`):**
```
wss://mailbox.dinakernel.com → https://mailbox.dinakernel.com/forward
ws://msgbox:7700             → http://msgbox:7700/forward
```

**On mobile, own service type is always `DinaMsgBox`.** When sending D2D
messages, the phone POSTs to the recipient's MsgBox `/forward` endpoint
(if `DinaMsgBox`) or directly to `/msg` (if `DinaDirectHTTPS`).

Cache DID resolution results with 10-minute TTL.

---

## 18. Inter-Service Communication (Core ↔ Brain)

> This section preserves the server's inter-service boundary exactly.

### 18.1 Ed25519 Service Key Authentication

**Identical to server.** Brain authenticates to Core using its Ed25519 service
key on every request. Same headers: `X-DID`, `X-Timestamp`, `X-Nonce`,
`X-Signature`.

### 18.2 Request Signing Protocol

**Identical to:** `core/internal/middleware/auth.go` and
`brain/src/adapter/core_http.py`

**Canonical payload (same format as server `auth.go:309`):**
```
{METHOD}\n{PATH}\n{QUERY}\n{TIMESTAMP}\n{NONCE}\n{SHA256_HEX(BODY)}
```

**Headers (exact wire format from server source):**
- `X-DID` — Caller's identity (`did:key:z...`)
- `X-Timestamp` — **RFC3339 format** (e.g., `2026-04-09T12:00:00Z`), 5-min window
- `X-Nonce` — Random hex string (replay protection via double-buffer cache)
- `X-Signature` — **Hex-encoded** Ed25519 signature (NOT base64)

**Warning:** Getting the wire format wrong causes silent auth failures.
The server uses RFC3339 timestamps and hex signatures — NOT Unix seconds
and NOT base64. Verified from `auth.go:72` and `handler.go:135,196`.

### 18.3 Service Key Provisioning

**Same as server:** PEM files generated at install time by
`provision_service_keys.py`, stored in `{APP_SANDBOX}/dina/service_keys/`.
Brain key required (fail-closed if missing). Admin/Connector keys optional.

**Service keys are NOT derived from the master seed.** They are independently
generated Ed25519 keypairs, provisioned once at install time and never
regenerated. This matches the server exactly — `servicekey.go` loads existing
keys and never generates new material at runtime.

**On mobile, keys are generated during onboarding** (equivalent to server's
`provision_service_keys.py`). Stored as PEM (PKCS#8 private, SPKI public):

```
{APP_SANDBOX}/dina/service_keys/
  private/
    brain_ed25519_private.pem    (app sandbox permissions)
    core_ed25519_private.pem     (app sandbox permissions)
  public/
    brain_ed25519_public.pem
    core_ed25519_public.pem
```

**DID format for service identity:** `did:key:z{base58btc(0xed01 + raw_32byte_pubkey)}`

### 18.4 Internal API Surface

**Identical to server.** All 40+ Core endpoints preserved with same routes,
same request/response schemas, same authorization matrix:

| Endpoint | Brain | Admin | Connector |
|----------|:-----:|:-----:|:---------:|
| `/v1/vault/query` | yes | no | no |
| `/v1/vault/store` | yes | no | no |
| `/v1/staging/ingest` | yes | no | yes |
| `/v1/staging/claim` | yes | no | no |
| `/v1/persona/unlock` | no | yes | no |
| `/v1/devices` | no | yes | no |
| `/v1/export` | no | yes | no |

### 18.5 Error Classification & Retry

**Identical to:** `brain/src/adapter/core_http.py`

- Timeout: 30 seconds
- Max retries: 3 (exponential backoff: 1s, 2s, 4s)
- Non-retryable: 401, 403
- Retryable: 5xx, connection errors
- Request-ID propagation for audit trail correlation

---

## 19. Core RPC Relay (New Protocol — Mobile Extension)

> This is a **new protocol** designed for mobile Dina. It does not exist in
> the server implementation. The server's MsgBox is an opaque D2D mailbox
> that forwards NaCl-encrypted blobs and **never decrypts**. It has no concept
> of HTTP methods, paths, or request/response pairing.
>
> For off-device callers (dina-cli, OpenClaw) to invoke Core API endpoints on
> a mobile home node — which never exposes a listening port — we need a way to
> tunnel Core API requests through the same MsgBox transport while preserving
> MsgBox's zero-knowledge property.

### 19.1 Why MsgBox Is Not Enough

**Current MsgBox behavior (from source — `handler.go`, `hub.go`):**

`POST /forward` requires these headers:
- `X-Recipient-DID` — target DID (must start with `"did:"`)
- `X-Sender-DID` — sender DID (for routing + rate limiting)
- `X-Timestamp` — RFC3339 format (e.g., `2026-04-09T12:00:00Z`), within 5-min window
- `X-Nonce` — random hex string (replay protection)
- `X-Signature` — hex-encoded Ed25519 signature over canonical payload
- `X-Sender-Pub` — hex-encoded 32-byte Ed25519 public key

Canonical payload for `/forward` auth:
```
POST\n/forward\n\n{timestamp}\n{nonce}\n{sha256_hex(body)}
```

Body: raw binary blob (max 1 MiB). MsgBox reads it as opaque bytes —
no JSON parsing, no structure inspection, **never decrypts**.

Delivery: push blob as binary WebSocket frame to recipient's connection.
If offline: buffer in SQLite (100 msgs / 10 MiB / 24h TTL per DID).
Response to sender: `{"status": "delivered"|"buffered", "msg_id": "..."}`.

Rate limit: 60 req/min per sender DID.

**Fire-and-forget.** No request/response pairing. No return channel.

**The gap:** dina-cli needs to call Core API endpoints and receive responses.
MsgBox has no response mechanism — it's a mailbox, not a proxy.

### 19.2 RPC-over-D2D Envelope

**Solution:** Wrap Core API requests inside D2D-style messages. MsgBox
transports them as opaque blobs (unchanged). Core unwraps, processes, and
sends an **authenticated** response back through the same MsgBox channel.

**Request envelope (plaintext before NaCl encryption):**

```json
{
  "type": "core_rpc_request",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "from": "did:key:z6Mk_sender...",
  "method": "POST",
  "path": "/v1/staging/ingest",
  "query": "",
  "headers": {
    "X-DID": "did:key:z6Mk_sender...",
    "X-Timestamp": "2026-04-09T12:00:00Z",
    "X-Nonce": "a1b2c3d4e5f6...",
    "X-Signature": "hex_ed25519_signature..."
  },
  "body": "{\"source\":\"gmail\",\"type\":\"email\",...}"
}
```

**Response envelope (plaintext before NaCl encryption):**

```json
{
  "type": "core_rpc_response",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "from": "did:plc:phone_core_did...",
  "status": 200,
  "headers": {"Content-Type": "application/json"},
  "body": "{\"id\":\"stg_abc123\",\"status\":\"received\"}",
  "signature": "hex_ed25519_signature_over_canonical_response..."
}
```

**Response authentication:** The response includes an Ed25519 `signature`
from Core's root identity key over a canonical response payload:
```
core_rpc_response\n{request_id}\n{status}\n{sha256_hex(body)}
```

The caller verifies this signature against the target's DID public key.
This binds the response to the specific `request_id` and proves it came
from the target Core — not from MsgBox or any MITM. Without this, NaCl
`crypto_box_seal` alone only provides confidentiality (anonymous sender),
not response authenticity.

**Both envelopes** are NaCl `crypto_box_seal` encrypted before transit.
MsgBox sees nothing but opaque blobs.

### 19.3 Request/Response Flow

```
[dina-cli on Laptop]                [MsgBox]              [Mobile Phone]

1. Build Core API request
   (method, path, headers, body)
   with inner Ed25519 signature
   (RFC3339 timestamp, hex sig)
2. Wrap in core_rpc_request JSON
3. NaCl seal(JSON, phone_X25519_pub)
4. POST /forward to MsgBox           ──→ 5. Route to phone's WS
   Headers:                               (or buffer if offline)
     X-Sender-DID                                           │
     X-Recipient-DID                      6. Core receives blob via WS
     X-Timestamp (RFC3339)                7. NaCl unseal → JSON
     X-Nonce (hex)                        8. Validate inner Ed25519 sig
     X-Signature (hex)                       (same auth middleware)
     X-Sender-Pub (hex, 32 bytes)         9. Process → HTTP response
   Body: sealed blob                     10. Build core_rpc_response JSON
                                         11. Sign response (Ed25519,
                                              binds request_id + status
                                              + body hash)
                                         12. NaCl seal(JSON,
                                              sender_X25519_pub)
                                         13. POST /forward to MsgBox
                                              (recipient = original sender)
                                     ←──
14. dina-cli receives blob           14a. MsgBox routes to
    via its own WS connection              dina-cli's WS
15. NaCl unseal → JSON
16. Verify Core's Ed25519 signature
    on response (proves authenticity,
    binds to request_id)
17. Return to caller as HTTP response
```

**Key properties:**
- **MsgBox is unchanged.** Forwards opaque blobs both directions. No new
  endpoints or capabilities needed.
- **Requests are authenticated.** Inner Ed25519 signature validated by Core's
  normal auth middleware.
- **Responses are authenticated.** Core signs the response with its root
  identity key, binding `request_id` to the response. Caller verifies
  against the target's DID public key. This prevents response forgery.
- **Both parties need authenticated MsgBox WS connections.** dina-cli must
  complete the Ed25519 challenge-response handshake on its WS connection
  before MsgBox will deliver responses to it (see 19.5).
- **Asynchronous.** dina-cli sends a request and waits for a response blob
  on its WS connection, correlated by `request_id`. Timeout: 30 seconds.

**Identity-binding invariant (HARD REQUIREMENT):**

Three identities appear in a relayed request. Core MUST reject the request
unless all three are the same principal:

1. **Outer MsgBox identity** — `X-Sender-DID` + `X-Sender-Pub` on the
   `/forward` POST. MsgBox verifies possession of the signing key but does
   not itself bind the DID to that key.
2. **Envelope sender** — `from` field in the `core_rpc_request` JSON
   (visible after NaCl decryption).
3. **Inner Core caller** — `X-DID` in the inner request headers (validated
   by Core's auth middleware).

**Core's validation (step 8 in the flow above):**
```
a. NaCl unseal → plaintext JSON
b. Parse core_rpc_request envelope
c. Assert: envelope.from == inner headers.X-DID
d. Assert: envelope.from is a valid did:key derived from the Ed25519
   public key that signed the inner request
e. Validate inner Ed25519 signature via normal auth middleware
f. (Optional future hardening) Assert: envelope.from == outer X-Sender-DID
   — requires Core to receive outer headers from MsgBox WS frame, which
   current MsgBox does not provide. For now, steps c+d+e are sufficient
   because the NaCl sealed box ensures only the intended recipient can
   read the envelope, and the inner Ed25519 signature proves possession
   of the claimed DID's private key.
```

This prevents: a compromised MsgBox from injecting requests (NaCl blocks
it), an attacker from replaying requests with a different sender DID
(inner signature binds to X-DID), and identity confusion between the
three layers.

### 19.4 Privacy Model

**MsgBox sees (both directions):**
- Sender DID, Recipient DID (routing only)
- Blob size
- Outer timestamp (for replay protection at MsgBox edge)

**MsgBox does NOT see:**
- Whether this is a D2D message or a Core RPC call (same NaCl envelope)
- Request method, path, query, body, or any API content
- Response status, headers, body
- Inner signatures or any auth material
- Any PII or vault data

**Indistinguishable from D2D.** MsgBox cannot tell Core RPC traffic apart
from regular D2D messages. Both are opaque NaCl sealed boxes.

### 19.5 Caller Requirements

**dina-cli must be upgraded for mobile targets:**
1. Resolve target DID → find `#dina-messaging` service with `DinaMsgBox` type
2. Connect to MsgBox WebSocket (`wss://mailbox.dinakernel.com/ws`) and
   **complete Ed25519 challenge-response handshake** before any traffic flows.
   MsgBox sends a challenge; dina-cli signs `AUTH_RELAY\n{nonce}\n{timestamp}`
   with its Ed25519 private key and returns the signed response. MsgBox
   verifies and associates the WS connection with dina-cli's DID. Without
   this handshake, MsgBox will not deliver response blobs to dina-cli.
   (Source: `msgbox/internal/auth.go:17-35`)
3. Wrap API requests in `core_rpc_request` envelopes with inner Ed25519 auth
   (RFC3339 timestamps, hex-encoded signatures — same format as direct HTTP).
   The `from` field and inner `X-DID` MUST match dina-cli's authenticated DID.
4. NaCl-encrypt with target's X25519 public key (converted from Ed25519)
5. POST to MsgBox `/forward` with outer auth headers (X-Sender-DID,
   X-Recipient-DID, X-Timestamp, X-Nonce, X-Signature, X-Sender-Pub).
   X-Sender-DID MUST match the DID authenticated on the WS connection.
6. Wait for `core_rpc_response` on its WS connection (match by `request_id`)
7. Verify Core's Ed25519 response signature (match target DID, bind request_id)
8. Timeout after 30 seconds

**When target DID has `DinaDirectHTTPS` service type** (server Dina with
public IP), dina-cli uses direct HTTP as today — no wrapping needed.

**dina-cli detects the target's service type automatically** and routes
through MsgBox or direct HTTPS accordingly.

---

## 20. Ingestion (OpenClaw + dina-cli via Core RPC Relay)

> OpenClaw and dina-cli run on a **separate machine**. All traffic to the
> mobile Core flows through the Core RPC Relay protocol (Section 19) over
> MsgBox. This is a **new transport layer** on top of the existing D2D
> mailbox — not "identical to server."

### 20.1 Architecture

```
[User's Laptop / Server]            [MsgBox Relay]            [Mobile Phone]

OpenClaw ←(MCP)→ dina-cli                                     dina-core
                    │                                              ▲
                    │  core_rpc_request                             │
                    │  (NaCl sealed)                                │
                    │  POST /forward     ─── route/buffer ────→    │
                    │                                              │
                    │  ←──── core_rpc_response (NaCl sealed) ──────│
                    │        via WS                                │
```

**This differs from server Dina** where dina-cli connects directly to Core
over HTTPS. On mobile, the same API calls are tunneled through MsgBox using
the Core RPC Relay protocol. The inner request content is identical — same
endpoints, same auth headers, same request/response schemas. Only the
transport is different.

| Concern | Server | Mobile |
|---------|--------|--------|
| Transport | Direct HTTPS to Core | Core RPC over MsgBox (NaCl encrypted) |
| Auth | Ed25519 on HTTP | Ed25519 inside NaCl envelope (same signatures) |
| Response | Synchronous HTTP | Async via MsgBox WS (30s timeout) |
| Privacy | TLS only | NaCl end-to-end (MsgBox sees nothing) |

### 20.2 Gmail Connector (via OpenClaw + dina-cli)

OpenClaw handles OAuth, fetches emails. dina-cli wraps `POST /v1/staging/ingest`
in a Core RPC envelope, sends via MsgBox. Core receives, validates, ingests.

### 20.3 Google Calendar Connector (via OpenClaw + dina-cli)

Same flow. dina-cli wraps calendar event ingestion requests.

### 20.4 Phone Contacts Import (Mobile-Specific)

**New for mobile.** Import contacts from the phone's native contact list
via `expo-contacts`. Maps to Dina contact creation through the standard
`POST /v1/contacts` endpoint.

### 20.5–20.8: Triage, Dedup, Sync Rhythm, Living Window

**All identical to server.** Same two-pass triage filter, same dedup (10K
in-memory + cold-path vault search), same sync rhythm (morning full + hourly
+ on-demand), same living window (365 days hot, older on demand).

---

## 21. Trust Network (AT Protocol)

### 21.1–21.4: Querying, Publishing, AppView Client, Cache

**All identical to server.** Mobile is a read-only client of the AppView
(does not run Ingester/Scorer daemons). Same trust score formula, same
attestation publishing to PDS, same 1-hour cache sync.

---

## 22. Export & Import

### 22.1–22.4: Archive, Backup, Restore, Migration

**All identical to server.** Same `.dina` encrypted archive format, same
AES-256-GCM encryption, same Argon2id key derivation for archive key.

**Mobile-specific:** Share via `expo-sharing` (AirDrop, Files app, etc.).

---

## 23. Background Processing & Sleep

### 23.1 Process Model (iOS vs. Android)

> This is the biggest implementation risk in the mobile architecture. The
> server runs Core and Brain in separate Docker containers with full OS
> process isolation. Mobile platforms have different constraints.

**Android: Real OS-Level Process Separation**

Android supports separate processes via the `android:process` manifest attribute.

```
Main App Process (UI + Brain)
  - React Native UI layer
  - dina-brain HTTP server on localhost:8200

Separate Process: :core (Foreground Service)
  - dina-core HTTP server on localhost:8100
  - MsgBox WebSocket client
  - SQLCipher vaults (file handles in this process only)
  - Persistent notification: "Dina is running"
```

- Core runs as an Android Foreground Service in a separate OS process (`:core`)
- Brain runs in the main app process alongside the UI
- They communicate via localhost HTTP with Ed25519 signatures
- Full process isolation: Core crash does not crash Brain/UI, and vice versa
- Core's Foreground Service keeps it alive when the app is backgrounded

**iOS: Logical Process Separation (Platform Constraint)**

iOS does NOT allow apps to spawn arbitrary background processes. There is no
equivalent of Android's `android:process`. The available mechanisms (App
Extensions, Background Tasks API) have severe memory and execution time limits.

```
Single App Process
  ├── UI Thread (React Native)
  ├── dina-brain (separate JS context, no shared state)
  │   HTTP server on localhost:8200
  └── dina-core (separate JS context, no shared state)
      HTTP server on localhost:8100
      MsgBox WebSocket client
```

- Core and Brain run as **separate JavaScript contexts** within the same
  OS process, with **no shared memory** and **no direct function calls**
- They communicate via localhost HTTP with Ed25519 signatures — the auth
  boundary is enforced at the HTTP level, identical to server
- A compromised Brain JS context cannot read Core's memory or call Core
  functions directly — it must go through the authenticated HTTP API
- **This is logical isolation, not OS-level isolation.** A memory-safety
  exploit in the JS runtime could theoretically cross the boundary.
  This is an accepted trade-off imposed by the iOS platform.

**Defense-in-depth on iOS:**
- Ed25519 service key auth on every request (same as server)
- No shared variables, closures, or module imports between contexts
- Core's vault DEKs exist only in Core's JS context memory
- Brain cannot access Core's file handles (SQLCipher connections)

**Honest assessment:** Android provides the same security boundary as server
Docker. iOS provides a weaker boundary — logical separation within one process.
The Ed25519 auth layer still prevents accidental coupling but cannot prevent
a runtime-level compromise. This is the best achievable on iOS without
jailbreaking.

### 23.2 iOS Background Modes

| Mode | Used For |
|------|----------|
| `background-fetch` | Trust cache sync, staging sweep |
| `remote-notification` | MsgBox wake (push notification triggers reconnect) |
| `processing` | Backfill ingestion (charging + Wi-Fi) |

### 23.3 Android WorkManager & Process Isolation

| Task | Constraint | Interval | Process |
|------|-----------|----------|---------|
| Staging sweep | None | ~5 min | :core |
| Trust cache sync | Network | ~1 hour | :core |
| Backfill | Charging + Wi-Fi | ~6 hours | :core |

### 23.4 Reminder Firing

`expo-notifications` local notifications. Same priority mapping as server
Telegram notifications.

### 23.5 Background Goroutines → Background Tasks

**Server background goroutines mapped to mobile equivalents:**

| Server Goroutine | Interval | Mobile Equivalent |
|-----------------|----------|-------------------|
| Trace purge | 10 min | Timer when app active |
| Ingress sweep | 10 sec | Timer when app active |
| Outbox retry | 30 sec | Timer when app active |
| Replay cache cleanup | 5 min | Timer when app active |
| Rate limit reset | 1 min | Timer when app active |
| Trust sync | 1 hour | Background fetch |
| Pairing code purge | 1 min | Timer when app active |
| Staging sweep | 5 min | Timer when app active |
| Watchdog | 30 sec | Timer when app active |

All timers stop when app is backgrounded. Critical tasks (outbox retry,
staging sweep) also run during background fetch windows.

### 23.6 Sleep/Wake Lifecycle

```
App Foreground (Active):
  - Core localhost HTTP server running (Brain connects to it)
  - Core outbound WebSocket to MsgBox active (receives relayed requests)
  - Brain process running, connected to Core on localhost
  - All background timers active
  - Full functionality

App Background (< timeout):
  - Core and Brain processes still running
  - MsgBox WebSocket still connected (receives D2D, dina-cli traffic)
  - Background fetch for additional processing
  - Local notifications fire

App Background (> timeout):
  - Zero all DEKs, zero master seed
  - Close all vaults
  - Disconnect MsgBox WebSocket (MsgBox buffers incoming messages)
  - Stop Core and Brain processes
  - Only pre-scheduled local notifications fire

App Killed:
  - Everything zeroed
  - MsgBox buffers incoming messages (24h TTL)
  - Pre-scheduled local notifications fire
  - On next launch: full startup sequence (unlock → boot)

App Resume (from background > timeout):
  - Require unlock (passphrase)
  - Re-derive seed → DEKs → open vaults
  - Restart Core + Brain processes
  - Reconnect MsgBox WebSocket → drain buffered messages
  - Resume all timers
```

---

## 24. Middleware Stack

> All Core middleware from the server is preserved.

### 24.1 Authentication Middleware

**Identical to:** `core/internal/middleware/auth.go`

**Ed25519-only authentication (mobile diverges from server here):**

The server has two auth methods: Ed25519 signatures (primary) and
CLIENT_TOKEN bearer (Phase 1 gap for admin web UI). Mobile implements
the server's planned Phase 2 from day 1: **Ed25519 everywhere, no
CLIENT_TOKEN.**

**Single auth method:**
- Headers: `X-DID`, `X-Signature`, `X-Timestamp` (5-min window), `X-Nonce`
- Used by: Brain (service key), Chat UI via Brain (UI device key → Brain
  service key), dina-cli (device key, inside Core RPC envelope)
- Canonical payload: `{METHOD}\n{PATH}\n{QUERY}\n{TIMESTAMP}\n{NONCE}\n{SHA256_HEX(BODY)}`
- Validation: check service key registry first, then device key registry

**Auth chain:**
```
Chat UI → Brain: Ed25519 (UI device key, generated at onboarding)
Brain → Core: Ed25519 (Brain service key)
dina-cli → Core (via MsgBox): Ed25519 (device key, inside NaCl envelope)
D2D → Core (via MsgBox): NaCl crypto_box_seal (identity verified post-decrypt)
```

**Middleware flow:**
1. Public paths (`/healthz`, `/readyz`, `/.well-known/atproto-did`) → bypass
2. `POST /msg` → bypass (NaCl box is the auth)
3. Core RPC from MsgBox → unwrap NaCl, validate inner Ed25519
4. Ed25519 signature present? → validate → set caller type
5. Optional auth paths (`/v1/pair/complete`) → allow unauthenticated
6. Otherwise → 401

**This is a deliberate divergence from server.** The server still has
CLIENT_TOKEN as a Phase 1 gap. Mobile skips that gap entirely.

### 24.2 Rate Limiting

**Diverges from server.** On the server, Core sees remote client IPs and
applies per-IP rate limiting. On mobile, all off-device traffic arrives
through MsgBox (localhost or WS) — Core never sees remote IPs.

**Two-layer rate limiting on mobile:**

1. **MsgBox edge (unchanged, server-side):** 60 req/min per sender DID.
   This is the first line of defense against flooding.

2. **Core (mobile-specific):** Per-DID and per-service rate limiting,
   replacing per-IP buckets:
   - Per-service-DID: 50 req/min per authenticated service identity
   - Per-device-DID: 50 req/min per paired device identity
   - Per-Core-RPC-sender-DID: 50 req/min per relay caller
   - Global: configurable total request cap
   - Brain (localhost): higher limit (trusted local process)

**Why not per-IP:** Core only sees `127.0.0.1` (Brain) and MsgBox WS
(all relayed traffic). Per-IP is meaningless. Per-DID is the correct
mobile equivalent.

### 24.3 Body Limit, Timeout, Recovery

**Identical to server.** Same body size limits, same request timeouts, same
panic recovery middleware.

### 24.4 Logging (Never Log PII)

**Identical to server.** Structured logging (structlog equivalent). Never log
content, secrets, or user data — only metadata (persona names, item counts,
latencies, error types).

---

## 25. Observability

### 25.1–25.4: Audit Trail, Crash Log, Health Check, Traces

**All identical to server.** Same hash-chained audit log, same crash log
with task correlation, same health self-check (vault + service key +
LLM reachability), same ephemeral trace store (1h TTL).

---

## 26. Security Invariants

**Carried over unchanged from server. Non-negotiable:**

1. **Raw seed never persisted unencrypted.** Always wrapped with Argon2id KEK.
2. **DEK for locked persona never derived.** Check tier before calling `derivePersonaDEK()`.
3. **PII never sent to cloud LLM unscrubbed.** Hard gate — fail closed.
4. **Entity vault never persisted, never logged.** Ephemeral only.
5. **D2D signatures verified against ALL verification methods.** Handle key rotation.
6. **Egress enforces 4 gates.** Contact → scenario → sharing → audit.
7. **Audit log is append-only with hash chain.** Tampering detectable.
8. **Anti-Her checked on every response.** LLM + regex fallback.
9. **Draft-Don't-Send.** No outbound action without user approval.
10. **Cart Handover.** No financial transactions.
11. **Brain authenticates to Core on every request.** Ed25519 service key.
12. **All callers authenticate with Ed25519.** No CLIENT_TOKEN on mobile.
13. **Brain has no direct database access.** All data through Core API.
14. **Pairing codes: single-use, 5-min TTL, constant-time comparison.**
15. **All-zero seed rejected.** Fail closed.
16. **Unknown sender → quarantine, not delete.**
17. **Ambiguous classification → Engagement tier.** Silence First.
18. **DINA_TEST_MODE forbidden in production.**
19. **Background timeout zeros all secrets.** DEKs, seed, vaults — wiped.
20. **Phone never exposes a listening port.** All off-device traffic via MsgBox.

---

## 27. Navigation & Screen Map

```
App
├── Onboarding (first launch)
│   ├── Welcome
│   ├── Create or Recover Identity
│   │   ├── Generate New Mnemonic (24 words)
│   │   ├── Verify Mnemonic (user confirms)
│   │   └── Recover from Mnemonic (enter 24 words)
│   ├── Set Passphrase (Argon2id — same params as server)
│   ├── Setup LLM Provider (API key or skip for local)
│   └── Connect Connectors (OpenClaw setup)
│
├── Unlock Screen (after timeout or restart)
│   └── Passphrase Entry (biometric optional convenience layer)
│
├── Main (Tab Navigator)
│   ├── Chat Tab
│   │   ├── Conversation Thread
│   │   ├── Approval Cards (inline)
│   │   ├── Nudge Cards (inline)
│   │   └── Briefing Cards (inline)
│   │
│   ├── Vault Tab
│   │   ├── Persona List (lock/unlock state)
│   │   ├── Persona Detail (search within)
│   │   ├── Item Detail
│   │   └── Add Memory (manual)
│   │
│   ├── People Tab
│   │   ├── Contact List
│   │   ├── Contact Detail (sharing/scenario policies)
│   │   ├── Add Contact (by DID)
│   │   └── Phone Import
│   │
│   ├── Reminders Tab
│   │   ├── Upcoming Reminders
│   │   ├── Briefing View
│   │   └── Reminder Detail
│   │
│   └── Settings Tab
│       ├── Identity (DID, mnemonic backup)
│       ├── Security (passphrase, timeout)
│       ├── LLM Providers (keys, local model)
│       ├── Personas (create, tiers)
│       ├── Connectors (OpenClaw status)
│       ├── Notifications (priority settings)
│       ├── Devices (paired devices)
│       ├── Export / Import
│       ├── Audit Log
│       └── Health Check
│
└── D2D Message View (from notification)
    ├── Inbound Message
    ├── Quarantine Review
    └── Reply
```

---

## 28. Technology Choices

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | Expo (managed → dev build) | Cross-platform, OTA updates |
| Language | TypeScript (strict) | Same language for Core and Brain |
| Navigation | `@react-navigation/native` v7 | Standard, type-safe |
| SQLite | `op-sqlite` + SQLCipher | Fastest RN SQLite, JSI, FTS5 |
| Ed25519 | `@noble/ed25519` | Audited, pure JS |
| Hashing | `@noble/hashes` | HKDF, SHA-256, SHA-512, HMAC |
| BIP-39 | `@scure/bip39` | Audited, zero-dep |
| NaCl | `react-native-sodium` | Native libsodium, crypto_box_seal |
| Argon2id | `react-native-argon2` | Native C binding, same params |
| AES-GCM | `react-native-aes-gcm-crypto` | Seed wrapping |
| Keychain | `react-native-keychain` | Biometric guard |
| HTTP server (Core) | `express` or `fastify` on localhost | Core's HTTP API (separate process) |
| HTTP server (Brain) | `express` or `fastify` on localhost | Brain's HTTP API (separate process) |
| LLM (cloud) | Provider SDKs via `fetch()` | Direct HTTP |
| LLM (local) | `llama.rn` | On-device GGUF |
| MsgBox client | Custom WebSocket client | Outbound WS to MsgBox relay |
| Notifications | `expo-notifications` | Local reminders |
| File system | `expo-file-system` | Dead drop, models |
| Sharing | `expo-sharing` | Export archives |
| Background | `expo-background-fetch` + `expo-task-manager` | Sync |
| Contacts | `expo-contacts` | Phone import |
| State (UI) | `zustand` | Lightweight |
| Testing | `jest` + `@testing-library/react-native` | Standard |
| Vector index | Pure-JS HNSW | In-memory NN search |

---

## 29. Implementation Phases

### Phase 1: Cryptographic Foundation + Storage

**Goal:** All crypto primitives working and tested. SQLCipher vaults open/close.

| # | Component | Scope |
|---|-----------|-------|
| 1.1 | Project scaffolding | Expo init, TypeScript, monorepo (core + brain + app) |
| 1.2 | BIP-39 mnemonic | Generate, validate, seed derivation |
| 1.3 | SLIP-0010 derivation | Full tree, all paths, hardened enforcement |
| 1.4 | HKDF DEK derivation | Per-persona keys, same info strings |
| 1.5 | Argon2id + AES-GCM | Seed wrap/unwrap, 128MB/3/4 params |
| 1.6 | Ed25519 sign/verify | Identity + service key signing |
| 1.7 | NaCl crypto_box_seal | Seal/unseal, Ed25519↔X25519 conversion |
| 1.8 | SQLCipher vault manager | Open/close with DEK, WAL mode |
| 1.9 | Schema creation | All tables for identity + persona vaults |
| 1.10 | FTS5 indexing | Insert triggers, search |
| 1.11 | Keychain integration | Wrapped seed storage, biometric guard |
| 1.12 | Crypto test suite | Verify against Go test vectors for cross-compatibility |

**Milestone:** `derivePersonaDEK("health")` opens `health.sqlite`, stores/searches items.

---

### Phase 2: Core Server (Identity + Vault + Personas + Middleware)

**Goal:** Core HTTP server running with full API surface and middleware.

| # | Component | Scope |
|---|-----------|-------|
| 2.1 | Core HTTP server + MsgBox client | Express/Fastify on localhost + outbound WS to MsgBox |
| 2.2 | Auth middleware | Ed25519 signature only (no CLIENT_TOKEN) |
| 2.3 | Rate limiting middleware | Per-IP + global buckets |
| 2.4 | Identity service | DID create/restore, key rotation |
| 2.5 | Persona service | Create, list, unlock, lock, tier enforcement |
| 2.6 | Vault service | Store, query (FTS5), delete, batch |
| 2.7 | Staging service | Ingest, claim, resolve, sweep |
| 2.8 | Audit service | Append, query, verify chain |
| 2.9 | KV store | Get/set/delete |
| 2.10 | Gatekeeper | Intent evaluation, egress filtering |
| 2.11 | PII scrubber (Tier 1) | Regex patterns from Go |
| 2.12 | Contact directory | CRUD, sharing policies, scenario policies |
| 2.13 | Service key provisioning | Generate Ed25519 PEM files (NOT seed-derived) |
| 2.14 | All 40+ HTTP handlers | Same routes as server |
| 2.15 | Core RPC Relay handler | Unwrap NaCl envelopes from MsgBox WS, process inner request |
| 2.16 | Core RPC response path | Wrap response in NaCl envelope, send back via MsgBox |
| 2.17 | Android: Core as Foreground Service | Separate `:core` process |
| 2.18 | iOS: Core as separate JS context | Logical isolation, localhost HTTP |

**Milestone:** Brain connects to Core on localhost with Ed25519 auth. Core connects outbound to MsgBox relay and processes Core RPC envelopes from off-device callers.

---

### Phase 3: Brain Server (LLM + Classification + Enrichment)

**Goal:** Brain HTTP server running, classifies and enriches via LLM.

| # | Component | Scope |
|---|-----------|-------|
| 3.1 | Brain HTTP server | Express/Fastify, listen on localhost |
| 3.2 | Core HTTP client | Ed25519 signed requests to Core |
| 3.3 | LLM provider adapters | Claude, OpenAI, Gemini, OpenRouter |
| 3.4 | LLM router | Decision tree (same as Python) |
| 3.5 | Prompt registry | All prompts from prompts.py |
| 3.6 | Staging processor | Claim → classify → enrich → resolve |
| 3.7 | Domain classifier | Keyword-based persona routing |
| 3.8 | Persona selector | Alias resolution, LLM-based routing |
| 3.9 | Enrichment service | L0/L1 generation, embedding |
| 3.10 | Entity vault | Ephemeral PII scrub/rehydrate |
| 3.11 | Guardian loop | Silence classification, priority tiers |
| 3.12 | Nudge assembler | Context injection from vault |
| 3.13 | Anti-Her safeguard | Regex suites + LLM detection |
| 3.14 | Guard scan | Post-processing safety |
| 3.15 | Connector auth | Accept dina-cli Ed25519 requests from external machines |
| 3.16 | Brain API endpoints | POST /v1/process, /v1/reason, /v1/pii/scrub |

**Milestone:** Brain claims staging items, classifies into personas, enriches with LLM.

---

### Phase 4: App UI (Onboarding + Chat + Unlock)

**Goal:** User can interact with Dina through native Chat UI.

| # | Component | Scope |
|---|-----------|-------|
| 4.1 | Onboarding flow | Create identity, set passphrase, show mnemonic, generate UI device key |
| 4.2 | Unlock screen | Passphrase entry, biometric option |
| 4.3 | Navigation skeleton | Tab navigator, screen routing |
| 4.4 | Chat UI | Conversation thread, message rendering |
| 4.5 | /remember in chat | Staging → classify → store, status display |
| 4.6 | /ask in chat | Vault search → LLM → streamed response |
| 4.7 | Approval cards | Inline approve/deny with scope |
| 4.8 | Nudge cards | Context-aware suggestions in chat |
| 4.9 | Streaming responses | Token-by-token rendering |
| 4.10 | Settings screens | LLM provider config, identity display |

**Milestone:** User chats with Dina, remembers facts, asks questions, approves actions.

---

### Phase 5: Reminders & Briefings

| # | Component | Scope |
|---|-----------|-------|
| 5.1 | Reminder planner | LLM-driven temporal extraction |
| 5.2 | Reminder storage | CRUD in identity database |
| 5.3 | Local notifications | expo-notifications scheduling |
| 5.4 | Context enrichment | Vault search for reminder context |
| 5.5 | Daily briefing | Assembly + notification + chat card |
| 5.6 | Reminders tab UI | List, detail, dismiss |

**Milestone:** Dina proactively reminds with enriched context.

---

### Phase 6: D2D Messaging + Contacts UI

| # | Component | Scope |
|---|-----------|-------|
| 6.1 | NaCl D2D send | Encrypt + sign + deliver |
| 6.2 | NaCl D2D receive | Decrypt + verify + process |
| 6.3 | DID resolution | PLC directory lookup + cache |
| 6.4 | Egress 4-gate | Contact → scenario → sharing → audit |
| 6.5 | Inbound trust eval | Blocked/unknown/trusted routing |
| 6.6 | Quarantine | Unknown sender handling |
| 6.7 | D2D memory staging | Message type → vault item type |
| 6.8 | Outbox (durable queue) | Retry with exponential backoff |
| 6.9 | Dead drop spool | File-based, drain-on-unlock |
| 6.10 | Contacts UI | List, detail, policies, add by DID |
| 6.11 | Phone contacts import | expo-contacts → Dina contacts |

**Milestone:** Two mobile Dina instances exchange encrypted messages.

---

### Phase 7: Data Connectors (OpenClaw + dina-cli via Core RPC Relay)

| # | Component | Scope |
|---|-----------|-------|
| 7.1 | Core RPC end-to-end test | dina-cli sends Core RPC envelope via MsgBox, receives response |
| 7.2 | Connector auth handling | Validate dina-cli Ed25519 inside NaCl envelope |
| 7.3 | Staging ingest from external | Accept connector pushes via /v1/staging/ingest |
| 7.4 | Two-pass triage (Brain) | Category filter + heuristics (same as server) |
| 7.5 | Dedup | In-memory + cold-path |
| 7.6 | Sync rhythm | Morning + hourly + on-demand |
| 7.7 | Living window | 30-day fast + 365-day backfill |
| 7.8 | Connector settings UI | Connection status, paired dina-cli devices |

**Milestone:** OpenClaw + dina-cli on a laptop pushes data to mobile Core
via Core RPC Relay over MsgBox. Same API endpoints, Ed25519 auth inside
NaCl envelopes, async response via MsgBox WS.

---

### Phase 8: On-Device LLM

| # | Component | Scope |
|---|-----------|-------|
| 8.1 | llama.rn integration | Load/unload GGUF models |
| 8.2 | Model download UI | Download, progress, storage |
| 8.3 | Router: local preference | Route to local when available |
| 8.4 | Local embedding | On-device 768-dim vectors |
| 8.5 | Vector index (HNSW) | Build, search, destroy lifecycle |

**Milestone:** Dina works fully offline with on-device model.

---

### Phase 9: Trust Network + Export + Background

| # | Component | Scope |
|---|-----------|-------|
| 9.1 | Trust score querying | AppView API client |
| 9.2 | Trust cache | KV-based with 1h sync |
| 9.3 | Attestation publishing | Sign + publish to PDS |
| 9.4 | Export archive | .dina encrypted format |
| 9.5 | Import archive | Decrypt + restore |
| 9.6 | Background fetch | iOS + Android scheduling |
| 9.7 | Sleep/wake lifecycle | DEK zeroing, vault close, re-unlock |
| 9.8 | All background timers | Mapped from server goroutines |
| 9.9 | Vault browser UI | Persona list, search, item detail |
| 9.10 | Audit log UI | Browse, verify chain |
| 9.11 | Health check UI | System diagnostic |

**Milestone:** Feature-complete mobile home node. All server capabilities
present, with mobile-specific transport (Core RPC Relay), auth (Ed25519-
everywhere), and process model (see Appendix A for deliberate forks).

---

### Phase 10: Polish + Parity

| # | Component | Scope |
|---|-----------|-------|
| 10.1 | Key rotation | Signing generation management |
| 10.2 | Scratchpad | Multi-step reasoning recovery |
| 10.3 | Tier 2 PII (pattern recognizers) | Port remaining Presidio patterns to TS |
| 10.4 | People extraction | NER-based entity linking |
| 10.5 | Device pairing | QR/code ceremony for multi-device |
| 10.6 | WebSocket hub | Real-time updates to paired thin clients |
| 10.7 | Cross-compat testing | Verify mobile ↔ server interop (D2D, export) |
| 10.8 | Performance | Memory, index tuning, startup time |
| 10.9 | Accessibility | VoiceOver, TalkBack |

---

## Appendix A: What Changes from Server (Deliberate Forks)

These are not incidental — each is a deliberate architectural decision for
mobile. "Different from server" does not mean "weaker" — several are
improvements (Ed25519-everywhere, end-to-end encrypted transport).

| Aspect | Server | Mobile | Why |
|--------|--------|--------|-----|
| Core language | Go | TypeScript | Single language across Core + Brain + UI |
| Brain language | Python | TypeScript | Same reason |
| User interaction | Telegram bot | Native Chat UI | No Telegram dependency |
| Admin UI | Web (FastAPI + HTML) | Native Settings screens | Native experience |
| Admin auth | CLIENT_TOKEN bearer (Phase 1 gap) | Ed25519 UI device key | Implements server's Phase 2 target from day 1 |
| Off-device transport | Direct HTTPS or MsgBox (D2D only) | Core RPC Relay over MsgBox (new protocol) | Phone never exposes a listening port |
| Process isolation (Android) | Docker containers | Separate OS processes (Foreground Service) | Real isolation, different mechanism |
| Process isolation (iOS) | Docker containers | Logical separation (same process, separate JS contexts) | iOS platform limitation — honest trade-off |
| Background tasks | Go goroutines | Mobile OS background APIs | Mobile lifecycle constraints |
| PII Tier 2 | Presidio (Python) pattern recognizers | TypeScript pattern recognizer port | No Python on mobile |
| Sleep handling | Always-on server | App lifecycle + MsgBox buffering | Phone sleeps — MsgBox durably buffers |
| dina-cli transport | Direct HTTPS to Core | Core RPC envelopes via MsgBox | Async with 30s timeout, NaCl end-to-end |

## Appendix B: Frozen Invariants

These are the architectural decisions that are **identical between server and
mobile** and must not be changed during porting. If a mobile implementation
diverges from any of these, it is a bug.

**Cryptographic invariants:**
- BIP-39 24-word mnemonic → seed derivation (PBKDF2, empty passphrase)
- SLIP-0010 derivation tree (purpose 9999', hardened only, BIP-44 44' forbidden)
- HKDF-SHA256 DEK derivation: `info="dina:persona:{name}:dek:v1"`, `salt=SHA256("dina:salt:{name}")`
- Argon2id parameters: 128MB memory, 3 iterations, 4 parallelism, 32-byte output
- AES-256-GCM seed wrapping: `nonce(12) || ciphertext+tag`
- Ed25519 request signing: `{METHOD}\n{PATH}\n{QUERY}\n{TIMESTAMP}\n{NONCE}\n{SHA256_HEX(BODY)}`
- NaCl crypto_box_seal for D2D encryption
- Ed25519 ↔ X25519 key conversion for D2D

**Protocol invariants:**
- Core ↔ Brain process boundary with Ed25519 service key auth
- DID service endpoint: `#dina-messaging`, type `DinaMsgBox`
- D2D V1 message families and type mappings
- Egress 4-gate enforcement (contact → scenario → sharing → audit)
- MsgBox relay protocol (outbound WS, `/forward` endpoint, Ed25519 challenge-response)
- Staging pipeline states: received → classifying → stored / pending_unlock / failed

**Security invariants:**
- Persona tier access control (default / standard / sensitive / locked)
- DEK not in RAM for locked personas
- PII scrub-before-cloud-send hard gate
- Entity vault ephemeral (never persisted, never logged)
- Draft-Don't-Send, Cart Handover, Anti-Her enforcement
- Audit log append-only hash chain
- Unknown sender → quarantine
- Ambiguous classification → Engagement tier

**Data invariants:**
- SQLCipher vault-per-persona architecture
- FTS5 + HNSW hybrid search (0.4 FTS5 + 0.6 cosine)
- Identity database schema (from `identity_001.sql`, `identity_002_trust_cache.sql`)
- Persona vault schema (from `persona_001.sql`)
- Export/import `.dina` archive format

**Behavioral invariants:**
- Gatekeeper action risk levels and brain-denied actions
- Guardian loop silence classification (fiduciary / solicited / engagement)
- LLM router decision tree
- Prompt registry (same prompts)
- Reminder planner
- Nudge assembly

**Mobile additions (not in server, not regressions):**
- Core RPC Relay protocol (Section 19) — new transport for tunneling API
  calls through MsgBox. Required because phone has no public IP.
- Ed25519 UI device key authentication — replaces CLIENT_TOKEN. Server will
  adopt this in Phase 2.

**What is NOT in this list** is intentionally not claimed as identical. Check
Appendix A for what explicitly changes.

## Appendix C: Cross-Compatibility Requirements

Mobile Dina and server Dina MUST be interoperable:

1. **Same seed → same DID.** A mnemonic entered on mobile produces the same
   `did:plc` as on server. Verified by cross-language test vectors.
2. **Same seed + persona → same DEK.** Verified by cross-language test vectors
   using canonical HKDF strings from `keyderiver.go`.
3. **D2D messaging.** Mobile Dina can send/receive D2D messages to/from server
   Dina instances. Both use `DinaMsgBox` service type.
4. **Export/Import.** A `.dina` archive created on server can be imported on
   mobile and vice versa.
5. **OpenClaw + dina-cli.** Same MCP tools. dina-cli must support the Core RPC
   Relay protocol (Section 19) when targeting a `DinaMsgBox` home node — same
   API endpoints and Ed25519 auth inside the NaCl envelope. When targeting a
   `DinaDirectHTTPS` server, dina-cli works unchanged.
6. **Trust network.** Same attestation format, same PDS, same AppView queries.

---

## 20. Bus Driver Scenario (Public Service Query Flow)

End-to-end sequence for a user ("requester") asking a public service ("provider") a capability question — e.g. `"/service eta_query when will bus 42 arrive?"`:

```
Requester Brain                   AppView                    Provider Brain + Core
───────────────                   ───────                    ─────────────────────
handleChat("/service eta …")
  │
  ▼
ServiceQueryOrchestratorWS2.issueQuery
  │ searchServices(capability=eta_query, geo?) ─────▶
  │                                                    returns ServiceProfile[]
  │                                                    with capabilitySchemas + schemaHash
  ◀── pickTopCandidate (ranked by distance + trust)
  │
  │ coreClient.sendServiceQuery({toDID, capability, params, queryId, ttl, schemaHash}) ────▶
  │                                         Core creates kind=service_query workflow_task
  │                                         + sends D2D service.query
  ◀── {taskId, queryId, deduped}
  (returns immediately — no waiting)

                            [network — D2D service.query] ──────▶ receive_pipeline
                                                                       │
                                                                       ▼
                                                              ServiceHandlerWS2.handleQuery
                                                                 ├─ schema_hash check
                                                                 ├─ params validate
                                                                 │
                                                                 ▼ (auto policy)
                                                              createWorkflowTask(kind=delegation,
                                                                                 payload=service_query_execution,
                                                                                 correlationId=queryId)
                                                                 │
                                                                 ▼ (review policy)
                                                              createWorkflowTask(kind=approval,
                                                                                 initialState=pending_approval)
                                                                 │ + notify operator
                                                                 ▼
                                                              Operator: /service_approve <taskId>
                                                                 │
                                                                 ▼
                                                              executeAndRespond → spawns delegation

                                                                 ▼ (delegation completes)
                                                              WorkflowService.complete
                                                                 │
                                                                 ▼
                                                              bridgeServiceQueryCompletion (Response Bridge)
                                                                 │ extracts query_id + capability + result
                                                                 ▼
                                                              send D2D service.response ────────────▶

receive_pipeline (service.response)
  │
  ▼
completeMatchingServiceQueryTask   (findServiceQueryTask by queryId+peerDID+capability)
  │
  ▼
emits workflow_event(kind=service_query, needs_delivery=true, details={response_status, capability, result})
  │
  ▼
Guardian consumer (BRAIN-P2-W03, pending)
  │
  ▼
formatServiceQueryResult(details) ─▶ chat UI renders "Bus 42 — 45 min to Market & Powell\nhttps://maps…"
```

Key durability points:
- Requester's idempotency: `computeIdempotencyKey(to_did, capability, canonicalJSON(params))` on `POST /v1/service/query` — retries return the same taskId.
- Provider's race safety: `findServiceQueryTask` filter includes both `created` and `running` so a fast inbound response lands correctly even mid-transition.
- Schema-version pin: `schema_hash` is request-time-snapshotted into the delegation payload, so mid-execution config republishes don't shift the provider's validation target.
- Approval idempotency: `executeAndRespond` uses deterministic child id `svc-exec-from-<approvalId>` and swallows `WorkflowConflictError{code:'duplicate_id'}` — Guardian retries are safe.

For the per-kind workflow task lifecycles see `DINA_WORKFLOW_CONTROL_PLANE.md` Appendix B.
For the delegation payload envelope see `DINA_DELEGATION_CONTRACT.md` Appendix A.
