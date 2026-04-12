/**
 * T2A.9 — Configuration loading from environment and defaults.
 *
 * Category B: contract test.
 *
 * Source: core/test/config_test.go
 */

import { loadConfig, validateConfig } from '../../src/config/loading';
import type { CoreConfig } from '../../src/config/loading';

describe('Configuration Loading', () => {
  describe('loadConfig', () => {
    it('loads with all defaults when no env vars', () => {
      const config = loadConfig({});
      expect(config.listenAddr).toBe(':8100');
      expect(config.brainURL).toBe('http://localhost:8200');
      expect(config.vaultPath).toBe('./data');
      expect(config.serviceKeyDir).toBe('./service_keys');
      expect(config.securityMode).toBe('security');
      expect(config.sessionTTL).toBe(86400);
      expect(config.rateLimit).toBe(50);
      expect(config.spoolMax).toBe(500);
      expect(config.msgboxURL).toBeUndefined();
    });

    it('reads DINA_CORE_URL from env', () => {
      const config = loadConfig({ DINA_CORE_URL: 'http://localhost:9100' });
      expect(config.listenAddr).toBe('http://localhost:9100');
    });

    it('defaults listenAddr to :8100', () => {
      expect(loadConfig({}).listenAddr).toBe(':8100');
    });

    it('reads DINA_BRAIN_URL from env', () => {
      const config = loadConfig({ DINA_BRAIN_URL: 'http://localhost:9200' });
      expect(config.brainURL).toBe('http://localhost:9200');
    });

    it('defaults brainURL to http://localhost:8200', () => {
      expect(loadConfig({}).brainURL).toBe('http://localhost:8200');
    });

    it('reads service key directory from env', () => {
      const config = loadConfig({ DINA_SERVICE_KEY_DIR: '/custom/keys' });
      expect(config.serviceKeyDir).toBe('/custom/keys');
    });

    it('reads security mode from env', () => {
      const config = loadConfig({ DINA_SECURITY_MODE: 'convenience' });
      expect(config.securityMode).toBe('convenience');
    });

    it('defaults security mode to security', () => {
      expect(loadConfig({}).securityMode).toBe('security');
    });

    it('rejects invalid security mode', () => {
      expect(() => loadConfig({ DINA_SECURITY_MODE: 'yolo' }))
        .toThrow('invalid security mode');
    });

    it('reads rate limit from env', () => {
      const config = loadConfig({ DINA_RATE_LIMIT: '100' });
      expect(config.rateLimit).toBe(100);
    });

    it('reads spool max from env', () => {
      const config = loadConfig({ DINA_SPOOL_MAX: '1000' });
      expect(config.spoolMax).toBe(1000);
    });

    it('reads MsgBox URL from env', () => {
      const config = loadConfig({ DINA_MSGBOX_URL: 'wss://mailbox.dinakernel.com' });
      expect(config.msgboxURL).toBe('wss://mailbox.dinakernel.com');
    });

    it('handles missing optional env vars gracefully', () => {
      const config = loadConfig({});
      expect(config.msgboxURL).toBeUndefined();
    });

    it('handles non-numeric rate limit (falls back to default)', () => {
      const config = loadConfig({ DINA_RATE_LIMIT: 'abc' });
      expect(config.rateLimit).toBe(50);
    });
  });

  describe('validateConfig', () => {
    const validConfig: CoreConfig = {
      listenAddr: ':8100',
      brainURL: 'http://localhost:8200',
      vaultPath: '/data',
      serviceKeyDir: '/keys',
      securityMode: 'security',
      sessionTTL: 86400,
      rateLimit: 50,
      spoolMax: 500,
    };

    it('accepts valid config', () => {
      const errors = validateConfig(validConfig);
      expect(errors).toEqual([]);
    });

    it('rejects invalid brainURL', () => {
      const errors = validateConfig({ ...validConfig, brainURL: 'not-a-url' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('brainURL');
    });

    it('rejects empty vaultPath', () => {
      const errors = validateConfig({ ...validConfig, vaultPath: '' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('vaultPath');
    });

    it('rejects negative rate limit', () => {
      const errors = validateConfig({ ...validConfig, rateLimit: -1 });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('rateLimit');
    });

    it('rejects zero sessionTTL', () => {
      const errors = validateConfig({ ...validConfig, sessionTTL: 0 });
      expect(errors.some(e => e.includes('sessionTTL'))).toBe(true);
    });

    it('rejects zero spoolMax', () => {
      const errors = validateConfig({ ...validConfig, spoolMax: 0 });
      expect(errors.some(e => e.includes('spoolMax'))).toBe(true);
    });

    it('accepts valid msgboxURL', () => {
      const errors = validateConfig({ ...validConfig, msgboxURL: 'wss://mailbox.dinakernel.com' });
      expect(errors).toEqual([]);
    });

    it('rejects invalid msgboxURL', () => {
      const errors = validateConfig({ ...validConfig, msgboxURL: 'not-a-url' });
      expect(errors.some(e => e.includes('msgboxURL'))).toBe(true);
    });

    it('allows rateLimit of 0', () => {
      const errors = validateConfig({ ...validConfig, rateLimit: 0 });
      expect(errors).toEqual([]);
    });

    it('collects multiple errors', () => {
      const errors = validateConfig({
        ...validConfig,
        brainURL: 'bad',
        vaultPath: '',
        rateLimit: -5,
      });
      expect(errors.length).toBe(3);
    });
  });
});
