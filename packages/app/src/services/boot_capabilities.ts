/**
 * Boot capability composer — assembles `BootServiceInputs` from live app
 * state (persisted DID, keychain BYOK key, role preference, open identity
 * DB). The Expo layout calls `buildBootInputs()` once after unlock;
 * whatever is ready at that moment is forwarded to `bootAppNode` and
 * everything else surfaces as a `BootDegradation` the banner renders.
 *
 * The composer is intentionally side-effect-light: it only reads from
 * keychain / Core globals / module-level getters, never writes. That way
 * re-running it on identity change or role change yields a deterministic
 * result, and the useNodeBootstrap lifecycle never sees a half-mutated
 * world.
 *
 * What this helper fixes (review findings #3, #4, #5, #6, #7, #8, #18):
 *   #3 — loads a persisted DID from `identity_record` before deriving
 *        did:key; a did:plc persisted by onboarding takes effect on
 *        next boot.
 *   #4 — reuses the open identity DatabaseAdapter (if persistence was
 *        initialised pre-boot) so workflow + service config persist.
 *   #5 — builds the Bus Driver tool registry + AISDK LLM provider so
 *        `/ask` runs the multi-turn agentic loop when a BYOK key is set.
 *   #6 — supplies `AppViewStub` seeded with the demo profile so public
 *        lookups don't bottom out in no_candidate.
 *   #7 — MsgBox stays unconfigured by design in the demo build (there's
 *        no relay to connect to); the degradation remains, but the
 *        INPUT shape the caller provides is explicit, not forgotten.
 *   #8 — pulls role from the persisted preference so the Service
 *        Sharing screen can flip to provider / both.
 *   #18 — the AppView stub from #6 uses `busDriverDemoProfile()` so the
 *         Bus 42 demo is actually runnable from the current app shell.
 */

import { loadOrGenerateSeeds } from './identity_store';
import { loadPersistedDid } from './identity_record';
import { loadRolePreference } from './role_preference';
import { AppViewStub, busDriverDemoProfile } from './appview_stub';
import { getIdentityAdapter } from '../storage/init';
import { getPublicKey } from '../../../core/src/crypto/ed25519';
import { deriveDIDKey } from '../../../core/src/identity/did';
import { AISDKAdapter } from '../ai/aisdk_adapter';
import { createModel, getConfiguredProviders } from '../ai/provider';
import { loadActiveProvider } from '../ai/active_provider';
import type { ProviderType } from '../ai/provider';
import {
  ToolRegistry,
} from '../../../brain/src/reasoning/tool_registry';
import {
  createGeocodeTool,
  createSearchPublicServicesTool,
  createQueryServiceTool,
} from '../../../brain/src/reasoning/bus_driver_tools';
import type { BootServiceInputs } from './boot_service';
import type { NodeRole } from './bootstrap';
import type { IdentityKeypair } from '../../../core/src/identity/keypair';

export interface BuiltBootInputs extends BootServiceInputs {
  // Identity fields become required after composition — the caller no
  // longer needs to supply them separately.
  did: string;
  signingKeypair: IdentityKeypair;
}

export interface BuildBootInputsOptions {
  /**
   * Override the active BYOK provider. When omitted the helper reads
   * `loadActiveProvider()` (the durable Settings-side selection) and
   * falls back to the first keychain-ordered configured provider only
   * if nothing was persisted. Tests pass `'none'` to opt out entirely.
   */
  activeProvider?: ProviderType | 'none';
  /**
   * Override the persisted role preference. Tests use this to exercise
   * provider-side code paths deterministically.
   */
  roleOverride?: NodeRole;
  /**
   * Override the persisted DID. Tests or onboarding screens use this
   * to inject a known did:plc without touching keychain state.
   */
  didOverride?: string;
  /**
   * Supply a pre-built AppView client. When omitted the helper either
   * returns an `AppViewStub` seeded with the Bus 42 demo profile (when
   * `demoMode` is true), or leaves the field unset so `bootAppNode`
   * records the `discovery.no_appview` degradation — the shipped app
   * no longer silently boots against fake discovery data (findings
   * #1, #15).
   */
  appViewClient?: BootServiceInputs['appViewClient'];
  /**
   * Enable demo-mode affordances: Bus 42 AppView seeding, demo-friendly
   * role/identity fallbacks. Off by default so a production install
   * never picks up demo state by accident. The Expo entrypoint flips
   * this on only when `process.env.EXPO_PUBLIC_DINA_DEMO === '1'`.
   */
  demoMode?: boolean;
  /** Additional logger sink — layered on top of the default. */
  logger?: BootServiceInputs['logger'];
}

/**
 * Compose a full `BootServiceInputs` bundle from the current app state.
 * Safe to call once per boot; safe to re-call on identity / role change.
 */
export async function buildBootInputs(
  options: BuildBootInputsOptions = {},
): Promise<BuiltBootInputs> {
  const { did, signingKeypair } = await resolveIdentity(options.didOverride);
  const role = options.roleOverride ?? await loadRolePreference();
  // AppView client: explicit caller-supplied > demo-mode stub > undefined
  // (which makes bootAppNode emit `discovery.no_appview`).
  const appViewClient =
    options.appViewClient ??
    (options.demoMode === true ? demoAppView() : undefined);
  const databaseAdapter = getIdentityAdapter() ?? undefined;

  const agenticAsk = await tryBuildAgenticAsk({
    activeProvider: options.activeProvider,
    appViewClient,
  });

  return {
    did,
    signingKeypair,
    role,
    appViewClient,
    databaseAdapter,
    agenticAsk,
    logger: options.logger,
    // MsgBox + PDS publisher stay unset — the boot service records
    // explicit degradations for each so the banner surfaces the gap
    // instead of quietly running in half-mode.
  };
}

// ---------------------------------------------------------------------------
// Identity (issue #3)
// ---------------------------------------------------------------------------

async function resolveIdentity(
  didOverride: string | undefined,
): Promise<{ did: string; signingKeypair: IdentityKeypair }> {
  const seedsResult = await loadOrGenerateSeeds();
  const privateKey = seedsResult.seeds.signingSeed;
  const publicKey = getPublicKey(privateKey);
  const signingKeypair: IdentityKeypair = { privateKey, publicKey };

  if (didOverride !== undefined && didOverride !== '') {
    return { did: didOverride, signingKeypair };
  }

  const persisted = await loadPersistedDid();
  if (persisted !== null) {
    return { did: persisted, signingKeypair };
  }

  // Fallback: derive a did:key. `bootAppNode` still records the
  // identity.did_key degradation so the banner flags the missing
  // publishable identity.
  return { did: deriveDIDKey(publicKey), signingKeypair };
}

// ---------------------------------------------------------------------------
// AppView stub seeded with the demo profile (issues #6, #18)
// ---------------------------------------------------------------------------

function demoAppView(): AppViewStub {
  return new AppViewStub({
    profiles: [
      busDriverDemoProfile({
        // Pin the demo lat/lng so `search_public_services` lat/lng ranking
        // returns a deterministic distance for the walk-through scenario.
        lat: 37.7749,
        lng: -122.4194,
      } as Parameters<typeof busDriverDemoProfile>[0]),
    ],
  });
}

// ---------------------------------------------------------------------------
// Agentic /ask (issue #5)
// ---------------------------------------------------------------------------

async function tryBuildAgenticAsk(opts: {
  activeProvider: ProviderType | 'none' | undefined;
  appViewClient: BootServiceInputs['appViewClient'];
}): Promise<BootServiceInputs['agenticAsk']> {
  if (opts.activeProvider === 'none') return undefined;

  const provider = await pickProvider(opts.activeProvider);
  if (provider === null) return undefined;

  const model = await createModel(provider);
  if (model === null) return undefined;

  const llm = new AISDKAdapter({ model, name: provider });

  // Tool registry: geocode + search_public_services + query_service.
  // When there's no AppView client we still register
  // `search_public_services`, but backed by an empty stub that returns
  // no candidates — so the LLM learns "no providers for that capability
  // here" instead of blowing up at call time. The orchestrator handle
  // for `query_service` is resolved via the lazy proxy below.
  const tools = new ToolRegistry();
  tools.register(createGeocodeTool());
  const searchClient = opts.appViewClient ?? emptyAppView();
  tools.register(createSearchPublicServicesTool({
    appViewClient: searchClient as Parameters<
      typeof createSearchPublicServicesTool
    >[0]['appViewClient'],
  }));
  tools.register(createQueryServiceTool({
    orchestrator: lazyOrchestratorHandle(),
  }));

  return { provider: llm, tools };
}

/** Empty AppView used by the agentic tools when no real client is
 *  supplied — lets the tool report "no candidates" rather than throw. */
function emptyAppView(): AppViewStub {
  return new AppViewStub();
}

async function pickProvider(
  override: ProviderType | undefined,
): Promise<ProviderType | null> {
  if (override !== undefined) return override;
  // Durable Settings-side selection wins (finding #5) — BUT only when
  // the user's selected provider STILL has an API key stored. Without
  // the key check, a persisted provider whose key was deleted (manual
  // keychain reset, user removed it elsewhere) would be treated as
  // active and the agentic loop would boot with no usable credential
  // (review #9). In that case we fall through to the first-configured
  // provider — the same behaviour as a first-run boot.
  const configured = await getConfiguredProviders();
  const persisted = await loadActiveProvider();
  if (persisted !== null && configured.includes(persisted)) {
    return persisted;
  }
  return configured[0] ?? null;
}

/**
 * Lazy handle to the orchestrator.
 *
 * The tool needs to call `issueQueryToDID`, but the orchestrator
 * instance is owned by the `DinaNode` returned from `createNode()`
 * which doesn't exist at tool-construction time. We return a thin
 * proxy that resolves the handle on first call via the module-level
 * singleton installed by `useNodeBootstrap`.
 *
 * Design tradeoff (finding #9): this uses a `require()` at call time
 * to avoid a real import cycle (`boot_capabilities → useNodeBootstrap
 * → boot_capabilities`). The alternatives are strictly worse:
 *   - Build tools AFTER `createNode` returns: requires a second
 *     wiring pass inside useNodeBootstrap for every provider change,
 *     duplicating the composer's work and making agenticAsk a live
 *     mutable state instead of an immutable boot input.
 *   - Pass a resolver closure in from the bootstrap hook: same
 *     problem — the hook becomes the authority on tool construction
 *     instead of this composer, splitting the logic.
 * The lazy proxy is the least-bad option: one module-global read,
 * guaranteed to be populated by the time the agentic loop runs (the
 * loop only fires inside `handleChat`, which runs post-start).
 */
function lazyOrchestratorHandle(): Parameters<typeof createQueryServiceTool>[0]['orchestrator'] {
  return {
    async issueQueryToDID(args) {
      // Deferred import to avoid a cycle: useNodeBootstrap → boot_capabilities
      // → useNodeBootstrap. At *call* time the bootstrap module is already
      // loaded because a query was only possible after the node started.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getBootedNode } = require('../hooks/useNodeBootstrap') as typeof import('../hooks/useNodeBootstrap');
      const node = getBootedNode();
      if (node === null) {
        throw new Error('query_service: DinaNode is not booted yet');
      }
      return node.orchestrator.issueQueryToDID(args);
    },
  };
}
