/**
 * T3.11 — Persona selector: LLM-assisted routing when uncertain.
 *
 * Source: ARCHITECTURE.md Task 3.11
 */

import {
  selectPersona, validatePersonaName,
  registerPersonaSelector, resetPersonaSelector,
  setLLMThreshold, resetThreshold,
} from '../../src/routing/persona_selector';
import { createPersona, resetPersonaState } from '../../../core/src/persona/service';

describe('Persona Selector', () => {
  beforeEach(() => {
    resetPersonaSelector();
    resetThreshold();
    resetPersonaState();
    createPersona('general', 'default');
    createPersona('health', 'sensitive');
    createPersona('financial', 'sensitive');
    createPersona('work', 'standard');
  });

  describe('selectPersona — keyword only', () => {
    it('high-confidence keyword result used directly', async () => {
      const result = await selectPersona({
        subject: 'Lab results from your doctor',
        body: 'Your blood test results are ready',
      });
      expect(result.persona).toBe('health');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('general fallback for ambiguous items', async () => {
      const result = await selectPersona({
        subject: 'Hello',
        body: 'Just saying hi',
      });
      expect(result.persona).toBe('general');
    });

    it('financial keywords route to financial', async () => {
      const result = await selectPersona({
        subject: 'Invoice payment due',
        body: 'Your invoice for $500 is due',
      });
      expect(result.persona).toBe('financial');
    });
  });

  describe('selectPersona — LLM assisted', () => {
    it('consults LLM when keyword confidence is low', async () => {
      setLLMThreshold(0.99); // force all to low confidence
      registerPersonaSelector(async (_input, personas) => ({
        persona: 'work',
        confidence: 0.85,
        reason: 'LLM determined work-related content',
      }));
      const result = await selectPersona({
        subject: 'Ambiguous content',
        body: 'Could be anything',
      });
      expect(result.persona).toBe('work');
    });

    it('rejects non-existent persona from LLM', async () => {
      setLLMThreshold(0.99);
      registerPersonaSelector(async () => ({
        persona: 'invented_persona',
        confidence: 0.9,
        reason: 'LLM invented a name',
      }));
      const result = await selectPersona({
        subject: 'Test',
        body: 'text',
      });
      expect(result.persona).toBe('general'); // falls back
    });

    it('handles LLM provider failure gracefully', async () => {
      setLLMThreshold(0.99);
      registerPersonaSelector(async () => { throw new Error('LLM unavailable'); });
      const result = await selectPersona({
        subject: 'Test',
        body: 'text',
      });
      // Should fall back to keyword result, not throw
      expect(result.persona).toBeTruthy();
    });

    it('skips LLM when no provider registered', async () => {
      setLLMThreshold(0.99);
      const result = await selectPersona({
        subject: 'Ambiguous',
        body: 'text',
      });
      expect(result.persona).toBe('general');
    });

    it('passes available persona list to LLM', async () => {
      setLLMThreshold(0.99);
      let receivedPersonas: string[] = [];
      registerPersonaSelector(async (_input, personas) => {
        receivedPersonas = personas;
        return { persona: 'general', confidence: 0.5, reason: '' };
      });
      await selectPersona({ subject: 'Test' });
      expect(receivedPersonas).toContain('general');
      expect(receivedPersonas).toContain('health');
      expect(receivedPersonas).toContain('work');
    });
  });

  describe('validatePersonaName', () => {
    it('accepts existing persona name', () => {
      expect(validatePersonaName('health')).toBe('health');
    });

    it('normalizes to lowercase', () => {
      expect(validatePersonaName('Health')).toBe('health');
    });

    it('rejects non-existent persona', () => {
      expect(validatePersonaName('invented')).toBeNull();
    });

    it('rejects empty string', () => {
      expect(validatePersonaName('')).toBeNull();
    });

    it('trims whitespace', () => {
      expect(validatePersonaName('  health  ')).toBe('health');
    });
  });
});
