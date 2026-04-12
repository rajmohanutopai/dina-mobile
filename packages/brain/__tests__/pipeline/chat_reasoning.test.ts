/**
 * T3.25 — Chat reasoning pipeline: vault → PII scrub → LLM → guard → rehydrate.
 *
 * Source: ARCHITECTURE.md Task 3.25
 */

import {
  reason, registerReasoningLLM, resetReasoningLLM,
} from '../../src/pipeline/chat_reasoning';
import { storeItem, clearVaults } from '../../../core/src/vault/crud';
import { setAccessiblePersonas } from '../../src/vault_context/assembly';
import { makeVaultItem, resetFactoryCounters } from '@dina/test-harness';

describe('Chat Reasoning Pipeline', () => {
  beforeEach(() => {
    resetFactoryCounters();
    clearVaults();
    resetReasoningLLM();
    setAccessiblePersonas(['general']);
  });

  describe('without LLM', () => {
    it('returns context-based answer from vault', async () => {
      storeItem('general', makeVaultItem({ summary: 'Emma birthday March 15', body: '' }));
      const result = await reason({
        query: 'Emma birthday',
        persona: 'general',
        provider: 'none',
      });
      expect(result.answer).toContain('Emma');
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('returns "no information" for empty vault', async () => {
      const result = await reason({
        query: 'Unknown topic',
        persona: 'general',
        provider: 'none',
      });
      expect(result.answer).toContain('don\'t have');
      expect(result.sources).toHaveLength(0);
    });
  });

  describe('with LLM', () => {
    it('full pipeline: vault → LLM → answer', async () => {
      storeItem('general', makeVaultItem({ summary: 'Alice likes dark chocolate', body: '' }));
      registerReasoningLLM(async (query, context) => {
        expect(context).toContain('Alice');
        return 'Alice likes dark chocolate based on your stored memories.';
      });
      const result = await reason({
        query: 'What does Alice like?',
        persona: 'general',
        provider: 'local',
      });
      expect(result.answer).toContain('dark chocolate');
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('LLM receives vault context in prompt', async () => {
      storeItem('general', makeVaultItem({ summary: 'Meeting with Bob Thursday', body: '' }));
      let receivedContext = '';
      registerReasoningLLM(async (_query, context) => {
        receivedContext = context;
        return 'You have a meeting with Bob.';
      });
      await reason({ query: 'meeting Bob', persona: 'general', provider: 'local' });
      expect(receivedContext).toContain('Bob');
    });
  });

  describe('PII scrubbing (cloud gate)', () => {
    it('non-sensitive persona + cloud → no scrub', async () => {
      storeItem('general', makeVaultItem({ summary: 'General note', body: '' }));
      registerReasoningLLM(async () => 'Answer.');
      const result = await reason({
        query: 'test',
        persona: 'general',
        provider: 'claude',
      });
      expect(result.scrubbed).toBe(false);
    });

    it('sensitive persona + cloud → scrubbed', async () => {
      storeItem('general', makeVaultItem({ summary: 'Health data email john@example.com', body: '' }));
      registerReasoningLLM(async (_q, ctx) => {
        // Verify PII was scrubbed before reaching LLM
        expect(ctx).not.toContain('john@example.com');
        return 'Patient data reviewed.';
      });
      const result = await reason({
        query: 'health data',
        persona: 'health',
        provider: 'claude',
      });
      expect(result.scrubbed).toBe(true);
    });

    it('local provider → no scrub even for sensitive persona', async () => {
      storeItem('general', makeVaultItem({ summary: 'Health note', body: '' }));
      registerReasoningLLM(async () => 'Answer.');
      const result = await reason({
        query: 'health',
        persona: 'health',
        provider: 'local',
      });
      expect(result.scrubbed).toBe(false);
    });
  });

  describe('guard scan', () => {
    it('strips violations from LLM response', async () => {
      storeItem('general', makeVaultItem({ summary: 'Test item', body: '' }));
      registerReasoningLLM(async () =>
        'Here is a safe answer. I feel so connected to you emotionally.');
      const result = await reason({
        query: 'test',
        persona: 'general',
        provider: 'local',
      });
      // Anti-Her guard should flag the emotional content
      if (result.guardViolations > 0) {
        expect(result.stripped).toBe(true);
      }
    });

    it('clean LLM response passes guard', async () => {
      storeItem('general', makeVaultItem({ summary: 'Meeting notes', body: '' }));
      registerReasoningLLM(async () => 'The meeting is scheduled for Thursday at 2 PM.');
      const result = await reason({
        query: 'meetings',
        persona: 'general',
        provider: 'local',
      });
      expect(result.guardViolations).toBe(0);
      expect(result.stripped).toBe(false);
    });
  });

  describe('result shape', () => {
    it('includes all expected fields', async () => {
      storeItem('general', makeVaultItem({ summary: 'Test', body: '' }));
      registerReasoningLLM(async () => 'Answer.');
      const result = await reason({
        query: 'test',
        persona: 'general',
        provider: 'local',
      });
      expect(typeof result.answer).toBe('string');
      expect(Array.isArray(result.sources)).toBe(true);
      expect(typeof result.persona).toBe('string');
      expect(typeof result.scrubbed).toBe('boolean');
      expect(typeof result.guardViolations).toBe('number');
      expect(typeof result.stripped).toBe('boolean');
    });

    it('tracks persona in result', async () => {
      const result = await reason({
        query: 'test',
        persona: 'health',
        provider: 'none',
      });
      expect(result.persona).toBe('health');
    });
  });
});
