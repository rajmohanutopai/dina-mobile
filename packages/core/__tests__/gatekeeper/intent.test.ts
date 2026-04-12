/**
 * T1F.1 — Gatekeeper intent evaluation: action → risk level mapping.
 *
 * Category A: fixture-based. Verifies the default policy table matches
 * the server exactly for all documented actions.
 *
 * Source: core/test/gatekeeper_test.go
 */

import { evaluateIntent, getDefaultRiskLevel } from '../../src/gatekeeper/intent';
import { DEFAULT_ACTION_POLICIES } from '@dina/test-harness';

describe('Gatekeeper Intent Evaluation', () => {
  describe('getDefaultRiskLevel', () => {
    for (const [action, expectedRisk] of Object.entries(DEFAULT_ACTION_POLICIES)) {
      it(`"${action}" → ${expectedRisk}`, () => {
        expect(getDefaultRiskLevel(action)).toBe(expectedRisk);
      });
    }

    it('returns undefined for unknown action', () => {
      expect(getDefaultRiskLevel('made_up_action')).toBeUndefined();
    });
  });

  describe('evaluateIntent', () => {
    it('SAFE action → allowed, no approval needed', () => {
      const decision = evaluateIntent('search');
      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('SAFE');
      expect(decision.requiresApproval).toBe(false);
    });

    it('MODERATE action → allowed, approval required', () => {
      const decision = evaluateIntent('send_large');
      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('MODERATE');
      expect(decision.requiresApproval).toBe(true);
    });

    it('HIGH action → allowed, approval required', () => {
      const decision = evaluateIntent('purchase');
      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('HIGH');
      expect(decision.requiresApproval).toBe(true);
    });

    it('BLOCKED action → denied', () => {
      const decision = evaluateIntent('credential_export');
      expect(decision.allowed).toBe(false);
      expect(decision.riskLevel).toBe('BLOCKED');
    });

    it('unknown action defaults to MODERATE (require approval)', () => {
      const decision = evaluateIntent('unknown_action');
      expect(decision.riskLevel).toBe('MODERATE');
      expect(decision.requiresApproval).toBe(true);
      expect(decision.allowed).toBe(true);
    });

    it('untrusted agent escalates SAFE → MODERATE', () => {
      const decision = evaluateIntent('search', 'did:key:z6MkBot', 'unknown');
      expect(decision.riskLevel).toBe('MODERATE');
      expect(decision.requiresApproval).toBe(true);
    });

    it('verified agent keeps SAFE as SAFE', () => {
      const decision = evaluateIntent('search', 'did:key:z6MkBot', 'verified');
      expect(decision.riskLevel).toBe('SAFE');
      expect(decision.requiresApproval).toBe(false);
    });

    it('includes reason in decision', () => {
      const decision = evaluateIntent('query');
      expect(decision.reason).toBeTruthy();
      expect(decision.reason.length).toBeGreaterThan(0);
    });

    it('brain-denied action → BLOCKED even for SAFE-classified actions', () => {
      // did_sign is brain-denied, always blocked
      const decision = evaluateIntent('did_sign');
      expect(decision.allowed).toBe(false);
      expect(decision.riskLevel).toBe('BLOCKED');
    });
  });

  describe('policy table completeness', () => {
    it('covers all SAFE actions', () => {
      const safeActions = Object.entries(DEFAULT_ACTION_POLICIES)
        .filter(([, risk]) => risk === 'SAFE')
        .map(([action]) => action);
      expect(safeActions.length).toBeGreaterThanOrEqual(5);
      for (const action of safeActions) {
        const decision = evaluateIntent(action);
        expect(decision.riskLevel).toBe('SAFE');
        expect(decision.allowed).toBe(true);
      }
    });

    it('covers all BLOCKED actions', () => {
      const blockedActions = Object.entries(DEFAULT_ACTION_POLICIES)
        .filter(([, risk]) => risk === 'BLOCKED')
        .map(([action]) => action);
      expect(blockedActions.length).toBeGreaterThanOrEqual(2);
      for (const action of blockedActions) {
        const decision = evaluateIntent(action);
        expect(decision.riskLevel).toBe('BLOCKED');
        expect(decision.allowed).toBe(false);
      }
    });
  });
});
