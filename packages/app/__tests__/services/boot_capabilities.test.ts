/**
 * Boot capability composer contract — `buildBootInputs` is the single
 * seam where persisted identity, role, BYOK provider, AppView stub, and
 * the open identity DB come together into a `BootServiceInputs` bundle.
 * Regressions here show up as "boot succeeds but nothing actually
 * works" — the reviewer caught exactly that pattern twice, so pin the
 * invariants.
 *
 * Test strategy: pure module contract. No React render, no op-sqlite
 * (the composer reads the identity DB through a getter that returns
 * null in tests), no network.
 */

import {
  buildBootInputs,
} from '../../src/services/boot_capabilities';
import { savePersistedDid, clearPersistedDid } from '../../src/services/identity_record';
import { saveRolePreference } from '../../src/services/role_preference';
import { clearIdentitySeeds } from '../../src/services/identity_store';
import { AppViewStub } from '../../src/services/appview_stub';
import { resetKeychainMock } from '../../__mocks__/react-native-keychain';

beforeEach(async () => {
  resetKeychainMock();
  await clearIdentitySeeds();
  await clearPersistedDid();
});

describe('buildBootInputs — identity resolution (#3)', () => {
  it('falls back to did:key derivation when no DID is persisted', async () => {
    const inputs = await buildBootInputs({ activeProvider: 'none' });
    expect(inputs.did.startsWith('did:key:')).toBe(true);
    expect(inputs.signingKeypair.privateKey).toHaveLength(32);
    expect(inputs.signingKeypair.publicKey).toHaveLength(32);
  });

  it('prefers the persisted did:plc over derived did:key', async () => {
    await savePersistedDid('did:plc:test-node');
    const inputs = await buildBootInputs({ activeProvider: 'none' });
    expect(inputs.did).toBe('did:plc:test-node');
  });

  it('respects didOverride for test/onboarding injection', async () => {
    await savePersistedDid('did:plc:persisted');
    const inputs = await buildBootInputs({
      activeProvider: 'none',
      didOverride: 'did:plc:override',
    });
    expect(inputs.did).toBe('did:plc:override');
  });
});

describe('buildBootInputs — role preference (#8)', () => {
  it('defaults to requester when no preference is stored', async () => {
    const inputs = await buildBootInputs({ activeProvider: 'none' });
    expect(inputs.role).toBe('requester');
  });

  it('loads the persisted role preference', async () => {
    await saveRolePreference('provider');
    const inputs = await buildBootInputs({ activeProvider: 'none' });
    expect(inputs.role).toBe('provider');
  });

  it('respects roleOverride', async () => {
    await saveRolePreference('provider');
    const inputs = await buildBootInputs({
      activeProvider: 'none',
      roleOverride: 'both',
    });
    expect(inputs.role).toBe('both');
  });
});

describe('buildBootInputs — AppView seeding (#1, #6, #15, #18)', () => {
  it('leaves appViewClient undefined by default (demo mode OFF)', async () => {
    // Production default: no AppView client is seeded. The boot
    // service's `discovery.no_appview` degradation then fires, which
    // surfaces in the banner instead of the app silently answering
    // from fake data. Findings #1 + #15.
    const inputs = await buildBootInputs({ activeProvider: 'none' });
    expect(inputs.appViewClient).toBeUndefined();
  });

  it('seeds the Bus 42 demo profile when demoMode is explicitly ON', async () => {
    const inputs = await buildBootInputs({
      activeProvider: 'none',
      demoMode: true,
    });
    expect(inputs.appViewClient).toBeDefined();
    const results = await inputs.appViewClient!.searchServices({
      capability: 'eta_query',
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].did).toBe('did:plc:bus42demo');
  });

  it('honours a caller-supplied AppViewClient regardless of demoMode', async () => {
    const custom = new AppViewStub();
    const inputs = await buildBootInputs({
      activeProvider: 'none',
      appViewClient: custom,
      demoMode: true,
    });
    expect(inputs.appViewClient).toBe(custom);
  });
});

describe('buildBootInputs — persistence adapter (#4)', () => {
  it('leaves databaseAdapter undefined when persistence is not initialised', async () => {
    // Tests never boot op-sqlite — so getIdentityAdapter() returns null,
    // and the composer must omit the field so bootAppNode falls back to
    // the in-memory repos (and emits the persistence.in_memory
    // degradation loudly).
    const inputs = await buildBootInputs({ activeProvider: 'none' });
    expect(inputs.databaseAdapter).toBeUndefined();
  });
});

describe('buildBootInputs — agenticAsk (#5)', () => {
  it('omits agenticAsk when activeProvider is "none"', async () => {
    const inputs = await buildBootInputs({ activeProvider: 'none' });
    expect(inputs.agenticAsk).toBeUndefined();
  });

  it('omits agenticAsk when no BYOK provider is configured', async () => {
    // activeProvider unset + no keychain entries → no provider picked
    // → the degradation ask.single_shot_fallback stays active.
    const inputs = await buildBootInputs({});
    expect(inputs.agenticAsk).toBeUndefined();
  });
});
