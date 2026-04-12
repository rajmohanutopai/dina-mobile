/**
 * T2B.5 — LLM router: provider selection decision tree.
 *
 * Category B: contract test. Verifies routing logic:
 * FTS-only skip, local preference, sensitive scrubbing, graceful degradation.
 *
 * Source: brain/tests/test_llm.py
 */

import {
  routeTask,
  isFTSOnly,
  isLightweightTask,
  requiresScrubbing,
} from '../../src/llm/router';
import type { RouterConfig } from '../../src/llm/router';

describe('LLM Router', () => {
  const localConfig: RouterConfig = {
    localAvailable: true,
    cloudProviders: ['gemini', 'claude'],
    sensitivePersonas: ['health', 'financial'],
  };

  const cloudOnlyConfig: RouterConfig = {
    localAvailable: false,
    cloudProviders: ['gemini'],
    sensitivePersonas: ['health', 'financial'],
  };

  const noProvidersConfig: RouterConfig = {
    localAvailable: false,
    cloudProviders: [],
    sensitivePersonas: ['health', 'financial'],
  };

  describe('routeTask', () => {
    it('FTS-only task → skip LLM (provider: none)', () => {
      const result = routeTask('keyword_search', undefined, localConfig);
      expect(result.provider).toBe('none');
      expect(result.requiresScrubbing).toBe(false);
    });

    it('fts_lookup → skip LLM', () => {
      const result = routeTask('fts_lookup', undefined, localConfig);
      expect(result.provider).toBe('none');
    });

    it('local available → use local', () => {
      const result = routeTask('summarize', 'general', localConfig);
      expect(result.provider).toBe('local');
      expect(result.requiresScrubbing).toBe(false);
    });

    it('lightweight task + local available → prefer local', () => {
      const result = routeTask('classify', 'general', localConfig);
      expect(result.provider).toBe('local');
    });

    it('sensitive persona + cloud → requires scrubbing', () => {
      const result = routeTask('reason', 'health', cloudOnlyConfig);
      expect(result.provider).toBe('gemini');
      expect(result.requiresScrubbing).toBe(true);
    });

    it('non-sensitive persona + cloud → no scrubbing', () => {
      const result = routeTask('reason', 'general', cloudOnlyConfig);
      expect(result.provider).toBe('gemini');
      expect(result.requiresScrubbing).toBe(false);
    });

    it('local available + sensitive persona → local (no scrubbing needed)', () => {
      const result = routeTask('reason', 'health', localConfig);
      expect(result.provider).toBe('local');
      expect(result.requiresScrubbing).toBe(false);
    });

    it('no providers → graceful degradation (FTS-only)', () => {
      const result = routeTask('summarize', 'general', noProvidersConfig);
      expect(result.provider).toBe('none');
      expect(result.reason).toContain('falling back');
    });

    it('uses first cloud provider from list', () => {
      const result = routeTask('reason', 'general', cloudOnlyConfig);
      expect(result.provider).toBe('gemini'); // first in cloudProviders
    });

    it('includes reason in decision', () => {
      const result = routeTask('classify', 'general', localConfig);
      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it('financial persona + cloud → requires scrubbing', () => {
      const result = routeTask('reason', 'financial', cloudOnlyConfig);
      expect(result.requiresScrubbing).toBe(true);
    });
  });

  describe('isFTSOnly', () => {
    it('keyword_search → true', () => {
      expect(isFTSOnly('keyword_search')).toBe(true);
    });

    it('fts_lookup → true', () => {
      expect(isFTSOnly('fts_lookup')).toBe(true);
    });

    it('classify → false', () => {
      expect(isFTSOnly('classify')).toBe(false);
    });

    it('reason → false', () => {
      expect(isFTSOnly('reason')).toBe(false);
    });

    it('embed → false', () => {
      expect(isFTSOnly('embed')).toBe(false);
    });
  });

  describe('isLightweightTask', () => {
    it('classify → true', () => {
      expect(isLightweightTask('classify')).toBe(true);
    });

    it('summarize → true', () => {
      expect(isLightweightTask('summarize')).toBe(true);
    });

    it('reason → false (complex)', () => {
      expect(isLightweightTask('reason')).toBe(false);
    });

    it('embed → false', () => {
      expect(isLightweightTask('embed')).toBe(false);
    });
  });

  describe('requiresScrubbing', () => {
    it('health persona + cloud → true', () => {
      expect(requiresScrubbing('health', 'gemini')).toBe(true);
    });

    it('financial persona + cloud → true', () => {
      expect(requiresScrubbing('financial', 'claude')).toBe(true);
    });

    it('general persona + cloud → false', () => {
      expect(requiresScrubbing('general', 'gemini')).toBe(false);
    });

    it('any persona + local → false (no scrubbing for local)', () => {
      expect(requiresScrubbing('health', 'local')).toBe(false);
    });

    it('any persona + none → false', () => {
      expect(requiresScrubbing('health', 'none')).toBe(false);
    });

    it('custom sensitive personas', () => {
      expect(requiresScrubbing('medical', 'gemini', ['medical', 'legal'])).toBe(true);
      expect(requiresScrubbing('health', 'gemini', ['medical', 'legal'])).toBe(false);
    });
  });
});
