/**
 * Unlock screen hook — passphrase entry → full unlock flow.
 *
 * Flow:
 *   1. User enters passphrase (or biometric triggers keychain retrieval)
 *   2. Argon2id KDF → derive KEK
 *   3. AES-256-GCM unwrap → retrieve master seed
 *   4. SLIP-0010 → derive root signing key → DID
 *   5. Open boot personas (default + standard auto-open)
 *   6. Mark secrets as restored
 *
 * The hook tracks progress through each step for the UI progress indicator.
 * Supports biometric shortcut (passphrase from keychain without typing).
 *
 * Source: ARCHITECTURE.md Task 4.5
 */

import { unwrapSeed, type WrappedSeed } from '../../../core/src/crypto/aesgcm';
import { getPublicKey } from '../../../core/src/crypto/ed25519';
import { deriveRootSigningKey } from '../../../core/src/crypto/slip0010';
import { deriveDIDKey } from '../../../core/src/identity/did';
import { openBootPersonas, createPersona, personaExists, listPersonas } from '../../../core/src/persona/service';

export type UnlockStep =
  | 'idle'
  | 'validating'
  | 'deriving_kek'
  | 'unwrapping'
  | 'deriving_keys'
  | 'opening_vaults'
  | 'complete'
  | 'failed';

export interface UnlockState {
  step: UnlockStep;
  did: string | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  openedPersonas: string[];
}

/** Current unlock state. */
let state: UnlockState = createInitialState();

function createInitialState(): UnlockState {
  return {
    step: 'idle',
    did: null,
    error: null,
    startedAt: null,
    completedAt: null,
    openedPersonas: [],
  };
}

/**
 * Attempt to unlock with a passphrase.
 *
 * @param passphrase — the user's passphrase
 * @param wrappedSeed — the stored wrapped seed (from first onboarding)
 * @returns The unlock state with DID on success, error on failure
 */
export async function unlock(
  passphrase: string,
  wrappedSeed: WrappedSeed,
): Promise<UnlockState> {
  state = createInitialState();
  state.step = 'validating';
  state.startedAt = Date.now();

  // 1. Basic validation
  if (!passphrase) {
    return fail('Passphrase is required');
  }
  if (!wrappedSeed || !wrappedSeed.wrapped || !wrappedSeed.salt) {
    return fail('No stored identity — complete onboarding first');
  }

  // 2. Unwrap seed (Argon2id KDF + AES-256-GCM decrypt)
  state.step = 'deriving_kek';
  let masterSeed: Uint8Array;
  try {
    state.step = 'unwrapping';
    masterSeed = await unwrapSeed(passphrase, wrappedSeed);
  } catch {
    return fail('Wrong passphrase');
  }

  // 3. Derive signing key and DID
  state.step = 'deriving_keys';
  const rootKey = deriveRootSigningKey(masterSeed, 0);
  const pubKey = getPublicKey(rootKey.privateKey);
  const did = deriveDIDKey(pubKey);
  state.did = did;

  // 4. Ensure general persona exists
  if (!personaExists('general')) {
    createPersona('general', 'default', 'Default persona');
  }

  // 5. Open boot personas (default + standard auto-open)
  state.step = 'opening_vaults';
  const opened = openBootPersonas();
  state.openedPersonas = opened;

  // 6. Complete
  state.step = 'complete';
  state.completedAt = Date.now();

  return { ...state };
}

/**
 * Get the current unlock state (for progress display).
 */
export function getUnlockState(): UnlockState {
  return { ...state };
}

/**
 * Get the unlock step label for progress display.
 */
export function getStepLabel(step: UnlockStep): string {
  switch (step) {
    case 'idle': return 'Enter passphrase';
    case 'validating': return 'Validating...';
    case 'deriving_kek': return 'Deriving encryption key...';
    case 'unwrapping': return 'Decrypting identity...';
    case 'deriving_keys': return 'Deriving signing keys...';
    case 'opening_vaults': return 'Opening vaults...';
    case 'complete': return 'Unlocked';
    case 'failed': return 'Unlock failed';
  }
}

/**
 * Get the step index for progress bar (0-5).
 */
export function getStepProgress(step: UnlockStep): number {
  const steps: UnlockStep[] = ['validating', 'deriving_kek', 'unwrapping', 'deriving_keys', 'opening_vaults', 'complete'];
  const idx = steps.indexOf(step);
  return idx >= 0 ? idx : 0;
}

/**
 * Check if unlock is in progress.
 */
export function isUnlocking(): boolean {
  return state.step !== 'idle' && state.step !== 'complete' && state.step !== 'failed';
}

/**
 * Check if unlock completed successfully.
 */
export function isUnlocked(): boolean {
  return state.step === 'complete' && state.did !== null;
}

/**
 * Get unlock duration in milliseconds (for performance tracking).
 */
export function getUnlockDuration(): number | null {
  if (!state.startedAt || !state.completedAt) return null;
  return state.completedAt - state.startedAt;
}

/**
 * Reset unlock state (for testing or re-lock).
 */
export function resetUnlockState(): void {
  state = createInitialState();
}

/** Set failed state with error. */
function fail(error: string): UnlockState {
  state.step = 'failed';
  state.error = error;
  state.completedAt = Date.now();
  return { ...state };
}
