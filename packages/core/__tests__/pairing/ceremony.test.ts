/**
 * T2A.5 — Device pairing ceremony: code generation, completion, security.
 *
 * Category B: contract test.
 *
 * Source: core/test/pairing_test.go
 */

import {
  generatePairingCode,
  completePairing,
  isCodeValid,
  activePairingCount,
  purgeExpiredCodes,
  clearPairingState,
} from '../../src/pairing/ceremony';

describe('Device Pairing Ceremony', () => {
  beforeEach(() => {
    clearPairingState();
  });

  describe('generatePairingCode', () => {
    it('generates a 6-digit numeric code', () => {
      const { code } = generatePairingCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('code is in range 100000–999999', () => {
      const { code } = generatePairingCode();
      const num = parseInt(code, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    });

    it('sets expiry in the future (~5 minutes)', () => {
      const { expiresAt } = generatePairingCode();
      const now = Math.floor(Date.now() / 1000);
      expect(expiresAt).toBeGreaterThan(now);
      expect(expiresAt).toBeLessThanOrEqual(now + 310); // ~5 min + slack
    });

    it('generates different codes on each call', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 10; i++) {
        codes.add(generatePairingCode().code);
      }
      // At least most should be unique (cryptographic randomness)
      expect(codes.size).toBeGreaterThanOrEqual(8);
    });
  });

  describe('completePairing', () => {
    it('completes with valid code + public key', () => {
      const { code } = generatePairingCode();
      const result = completePairing(code, 'iPhone 15', 'z6MkTestDeviceKey');
      expect(result.deviceId).toMatch(/^dev-/);
      expect(result.nodeDID).toMatch(/^did:/);
    });

    it('returns deviceId and nodeDID', () => {
      const { code } = generatePairingCode();
      const result = completePairing(code, 'Phone', 'z6MkKey');
      expect(typeof result.deviceId).toBe('string');
      expect(typeof result.nodeDID).toBe('string');
    });

    it('rejects invalid code', () => {
      expect(() => completePairing('000000', 'Phone', 'z6MkKey'))
        .toThrow('invalid, expired, or already-used');
    });

    it('code is single-use (second completion fails)', () => {
      const { code } = generatePairingCode();
      completePairing(code, 'Phone', 'z6MkKey');
      expect(() => completePairing(code, 'Phone2', 'z6MkKey2'))
        .toThrow('invalid, expired, or already-used');
    });
  });

  describe('isCodeValid', () => {
    it('returns true for active code', () => {
      const { code } = generatePairingCode();
      expect(isCodeValid(code)).toBe(true);
    });

    it('returns false for unknown code', () => {
      expect(isCodeValid('999999')).toBe(false);
    });

    it('returns false for already-used code', () => {
      const { code } = generatePairingCode();
      completePairing(code, 'Phone', 'z6MkKey');
      expect(isCodeValid(code)).toBe(false);
    });
  });

  describe('activePairingCount', () => {
    it('reports count of unexpired codes', () => {
      expect(activePairingCount()).toBe(0);
      generatePairingCode();
      generatePairingCode();
      expect(activePairingCount()).toBe(2);
    });

    it('completed codes not counted', () => {
      const { code } = generatePairingCode();
      generatePairingCode();
      completePairing(code, 'Phone', 'z6MkKey');
      expect(activePairingCount()).toBe(1);
    });
  });

  describe('purgeExpiredCodes', () => {
    it('removes used codes', () => {
      const { code } = generatePairingCode();
      completePairing(code, 'Phone', 'z6MkKey');
      const purged = purgeExpiredCodes();
      expect(purged).toBe(1);
      expect(activePairingCount()).toBe(0);
    });

    it('does not purge active codes', () => {
      generatePairingCode();
      const purged = purgeExpiredCodes();
      expect(purged).toBe(0);
      expect(activePairingCount()).toBe(1);
    });

    it('returns count of purged codes', () => {
      const { code: c1 } = generatePairingCode();
      const { code: c2 } = generatePairingCode();
      completePairing(c1, 'P1', 'z1');
      completePairing(c2, 'P2', 'z2');
      expect(purgeExpiredCodes()).toBe(2);
    });
  });
});
