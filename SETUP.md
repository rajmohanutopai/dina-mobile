# Dina Mobile — Development Setup

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 20 | `node --version` |
| npm | ≥ 10 | `npm --version` |
| Xcode | ≥ 16 | `xcodebuild -version` |
| CocoaPods | ≥ 1.15 | `pod --version` |
| Android Studio | Latest | Set `ANDROID_HOME` env var |
| iOS Simulator | iPhone 16 Pro recommended | `xcrun simctl list devices` |

## Repository Structure

```
dina-mobile/
├── packages/
│   ├── core/          # @dina/core — cryptography, vault, auth, HTTP server
│   │                  # 131 source files, 168 test files, 2662 tests
│   ├── brain/         # @dina/brain — LLM adapters, chat, staging, guardian
│   │                  # 61 source files, 67 test files, 1271 tests
│   ├── app/           # @dina/app — React Native UI + data hooks
│   │                  # 23 source files, 25 test files, 483 tests
│   ├── test-harness/  # @dina/test-harness — shared types, fixtures, mocks
│   │                  # 13 source files
│   └── fixtures/      # Go-generated test vectors (crypto, D2D, vault)
│                      # 30+ JSON fixture files
├── .github/workflows/ # CI pipeline (lint + typecheck + test per package)
├── ARCHITECTURE.md    # Full system architecture
├── TASKS.md           # 233 tasks: 216 done, 13 pending (native), 4 in-progress
└── package.json       # npm workspaces root
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run tests (no native build needed)

```bash
# All packages
npm test --workspaces

# Individual packages
cd packages/core && npm test
cd packages/brain && npm test
cd packages/app && npm test
```

### 3. Type check

```bash
cd packages/core && npx tsc --noEmit
cd packages/brain && npx tsc --noEmit
```

## Native Build Setup

### Already installed native modules:

| Module | Version | Purpose |
|--------|---------|---------|
| `@op-engineering/op-sqlite` | ^15.2.11 | SQLCipher encrypted vault storage |
| `react-native-keychain` | ^10.0.0 | Platform keychain (passphrase + biometric) |
| `expo-contacts` | ~14.0.5 | Phone contacts import |
| `expo-sharing` | ~13.0.1 | Share .dina export files |
| `expo-background-fetch` | ~13.0.6 | iOS background trust sync + staging sweep |

### Not yet installed (needed for remaining tasks):

| Module | Purpose | Install |
|--------|---------|---------|
| `llama.rn` | On-device LLM inference | `npx expo install llama.rn` |
| `expo-task-manager` | Android background tasks | `npx expo install expo-task-manager` |

### Regenerate native projects

```bash
cd packages/app
npx expo prebuild --clean
```

This generates `ios/` and `android/` directories. They are gitignored —
regenerate them on any new machine.

### iOS Build

```bash
# Option A: Expo CLI
cd packages/app
npx expo run:ios

# Option B: Xcode
open packages/app/ios/Dina.xcworkspace
# Select iPhone 16 Pro simulator → Build & Run
```

### Android Build

```bash
# Set ANDROID_HOME first:
export ANDROID_HOME=$HOME/Library/Android/sdk

cd packages/app
npx expo run:android
```

## Architecture Overview

### Process Model

```
┌─────────────┐   localhost:8100   ┌─────────────┐
│   Core      │◄──────────────────►│   Brain     │
│  (Express)  │   localhost:8200   │  (Express)  │
│  Port 8100  │                    │  Port 8200  │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │         ┌──────────┐             │
       └────────►│  App UI  │◄────────────┘
                 │  (Expo)  │
                 └──────────┘
```

- **Core**: Vault CRUD, auth middleware, staging, audit, identity, D2D
- **Brain**: LLM routing, chat reasoning, domain classification, guardian
- **App**: React Native UI with data hooks consuming Core + Brain

### Cryptographic Stack

| Layer | Algorithm | Library |
|-------|-----------|---------|
| Mnemonic | BIP-39 (24 words) | `@scure/bip39` |
| Key derivation | SLIP-0010 (Ed25519 + secp256k1) | `@noble/hashes` |
| Signing | Ed25519 | `@noble/ed25519` |
| DEK derivation | HKDF-SHA256 | `@noble/hashes` |
| Passphrase → KEK | Argon2id | `@noble/hashes` (JS) / native Argon2 |
| Vault encryption | AES-256-GCM | `@noble/ciphers` |
| D2D encryption | NaCl sealed box | `@noble/curves` |
| DID format | did:key (Ed25519) + did:plc | `@scure/base` (base58) |

### Data Hooks (App Package)

Every UI screen has a corresponding data hook in `packages/app/src/hooks/`:

| Hook | Screen | Tests |
|------|--------|-------|
| `useOnboarding` | Create / Recover identity | 28 |
| `useOnboardingLLM` | LLM provider setup | 16 |
| `useUnlock` | Passphrase unlock screen | 18 |
| `useChatThread` | Chat conversation | 14 |
| `useChatAsk` | /ask command | 24 |
| `useChatRemember` | /remember command | 22 |
| `useChatStreaming` | Token streaming | 22 |
| `useChatApprovals` | Approval cards | 20 |
| `useChatNudges` | Nudge cards | 20 |
| `useChatSystemMessages` | System notifications | 22 |
| `useIdentity` | Settings — identity | 15 |
| `useSecurity` | Settings — security | 23 |
| `useLLMProviders` | Settings — LLM providers | 16 |
| `usePersonas` | Settings — personas | 18 |
| `useReminders` | Reminders tab | 22 |
| `useVaultBrowser` | Vault browser | 15 |
| `useContacts` | Contacts tab | 22 |
| `useContactDetail` | Contact detail editor | 17 |
| `useAuditLog` | Audit log browser | 17 |
| `useConnectorSettings` | Connector settings | 17 |
| `useHealthCheck` | Health diagnostics | 21 |

### Native Backend Plug Points

The codebase uses injectable backends. Swap in-memory for native:

```typescript
// SQLCipher vault
import { setVaultDBFactory } from '@dina/core/storage/vault_db';
setVaultDBFactory((persona) => new NativeVaultDB(persona));

// Keychain
import { setSecureStore } from '@dina/core/storage/secure_store';
setSecureStore(new NativeSecureStore());

// LLM (local)
import { ClaudeAdapter } from '@dina/brain/llm/adapters/claude';
// Already pluggable — just pass the real SDK client
```

## Remaining Tasks (13)

See `TASKS.md` for full details. Priority order:

1. **Wire SQLCipher** — `NativeVaultDB` using `@op-engineering/op-sqlite`
2. **Wire Keychain** — `NativeSecureStore` using `react-native-keychain`
3. **Install llama.rn** — local LLM inference + GGUF model download
4. **Process isolation** — Android foreground service + iOS JSContext
5. **Background tasks** — iOS BackgroundFetch + Android WorkManager
6. **Device features** — Phone contacts, sharing, accessibility
7. **Performance** — Memory profiling with native tools

## CI Pipeline

GitHub Actions runs on every push:

```yaml
# .github/workflows/ci.yml
# 3 parallel jobs: core, brain, app
# Each: npm install → typecheck → test
```

## Test Summary

```
Total: 4,416 tests passing
  Core:  2,662 tests across 168 suites
  Brain: 1,271 tests across  67 suites
  App:     483 tests across  25 suites
```
