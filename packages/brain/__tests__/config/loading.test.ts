/**
 * T2B.13 — Brain configuration loading.
 *
 * Source: brain/tests/test_config.py
 */

import { loadBrainConfig, validateBrainConfig } from '../../src/config/loading';

describe('Brain Configuration', () => {
  describe('loadBrainConfig', () => {
    it('loads with defaults when no env vars', () => {
      const config = loadBrainConfig({});
      expect(config.coreURL).toBe('http://localhost:8100');
      expect(config.listenPort).toBe(8200);
      expect(config.serviceKeyDir).toBe('./service_keys');
      expect(config.logLevel).toBe('info');
      expect(config.llmURL).toBeUndefined();
    });

    it('reads DINA_CORE_URL from env', () => {
      const config = loadBrainConfig({ DINA_CORE_URL: 'http://localhost:9100' });
      expect(config.coreURL).toBe('http://localhost:9100');
    });

    it('defaults core URL to http://localhost:8100', () => {
      expect(loadBrainConfig({}).coreURL).toBe('http://localhost:8100');
    });

    it('reads service key dir from env', () => {
      const config = loadBrainConfig({ DINA_SERVICE_KEY_DIR: '/custom/keys' });
      expect(config.serviceKeyDir).toBe('/custom/keys');
    });

    it('defaults listen port to 8200', () => {
      expect(loadBrainConfig({}).listenPort).toBe(8200);
    });

    it('defaults log level to info', () => {
      expect(loadBrainConfig({}).logLevel).toBe('info');
    });

    it('reads LLM URL from env (optional)', () => {
      const config = loadBrainConfig({ DINA_LLM_URL: 'http://localhost:11434' });
      expect(config.llmURL).toBe('http://localhost:11434');
    });

    it('handles missing LLM URL gracefully', () => {
      expect(loadBrainConfig({}).llmURL).toBeUndefined();
    });

    it('reads custom port from env', () => {
      const config = loadBrainConfig({ DINA_BRAIN_PORT: '9200' });
      expect(config.listenPort).toBe(9200);
    });
  });

  describe('validateBrainConfig', () => {
    it('accepts valid config', () => {
      const errors = validateBrainConfig({
        coreURL: 'http://localhost:8100',
        listenPort: 8200,
        serviceKeyDir: '/keys',
        logLevel: 'info',
      });
      expect(errors).toEqual([]);
    });

    it('rejects invalid core URL', () => {
      const errors = validateBrainConfig({
        coreURL: 'not-a-url',
        listenPort: 8200,
        serviceKeyDir: '/keys',
        logLevel: 'info',
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('coreURL');
    });

    it('rejects empty service key dir', () => {
      const errors = validateBrainConfig({
        coreURL: 'http://localhost:8100',
        listenPort: 8200,
        serviceKeyDir: '',
        logLevel: 'info',
      });
      expect(errors.some(e => e.includes('serviceKeyDir'))).toBe(true);
    });

    it('rejects invalid port', () => {
      const errors = validateBrainConfig({
        coreURL: 'http://localhost:8100',
        listenPort: 0,
        serviceKeyDir: '/keys',
        logLevel: 'info',
      });
      expect(errors.some(e => e.includes('listenPort'))).toBe(true);
    });
  });
});
