/**
 * T1I.1 — Encrypted export archive (.dina format).
 *
 * Category A: fixture-based. Verifies archive creation, manifest reading,
 * import, verification, and round-trip.
 *
 * Source: core/test/portability_test.go
 */

import {
  createArchive, readManifest, importArchive, verifyArchive,
  setImportHandler, resetImportHandler,
} from '../../src/export/archive';
import type { ArchiveManifest } from '../../src/export/archive';
import { TEST_PASSPHRASE, TEST_PASSPHRASE_WRONG } from '@dina/test-harness';

describe('Export Archive (.dina format)', () => {
  let archive: Uint8Array;

  beforeAll(async () => {
    archive = await createArchive(TEST_PASSPHRASE);
  }, 30_000);

  afterEach(() => resetImportHandler());

  describe('createArchive', () => {
    it('creates an encrypted archive', () => {
      expect(archive).toBeInstanceOf(Uint8Array);
    });

    it('archive is non-empty bytes', () => {
      expect(archive.length).toBeGreaterThan(10);
    });

    it('archive starts with DINA magic', () => {
      const magic = String.fromCharCode(...archive.slice(0, 4));
      expect(magic).toBe('DINA');
    });

    it('archive has version byte', () => {
      expect(archive[4]).toBe(1);
    });

    it('different passphrases produce different archives', async () => {
      const archive2 = await createArchive('other passphrase');
      expect(Buffer.from(archive)).not.toEqual(Buffer.from(archive2));
    }, 30_000);
  });

  describe('readManifest', () => {
    it('reads manifest without decrypting vault data', async () => {
      const manifest = await readManifest(archive, TEST_PASSPHRASE);
      expect(manifest.header).toBeDefined();
      expect(manifest.personas).toBeDefined();
    }, 30_000);

    it('manifest includes header with version and format', async () => {
      const manifest = await readManifest(archive, TEST_PASSPHRASE);
      expect(manifest.header.version).toBe(1);
      expect(manifest.header.format).toBe('dina-archive-v1');
      expect(manifest.header.created_at).toBeGreaterThan(0);
    }, 30_000);

    it('manifest has persona list', async () => {
      const manifest = await readManifest(archive, TEST_PASSPHRASE);
      expect(Array.isArray(manifest.personas)).toBe(true);
    }, 30_000);

    it('rejects wrong passphrase', async () => {
      await expect(readManifest(archive, TEST_PASSPHRASE_WRONG)).rejects.toThrow();
    }, 30_000);

    it('rejects corrupted archive', async () => {
      await expect(readManifest(new Uint8Array([0xDE, 0xAD]), TEST_PASSPHRASE)).rejects.toThrow();
    });
  });

  describe('importArchive', () => {
    it('decrypts and validates archive', async () => {
      await expect(importArchive(archive, TEST_PASSPHRASE)).resolves.toBeUndefined();
    }, 30_000);

    it('rejects wrong passphrase', async () => {
      await expect(importArchive(archive, TEST_PASSPHRASE_WRONG))
        .rejects.toThrow();
    }, 30_000);

    it('rejects corrupted archive', async () => {
      await expect(importArchive(new Uint8Array([0xBA, 0xAD]), TEST_PASSPHRASE))
        .rejects.toThrow();
    });

    it('calls import handler with manifest', async () => {
      let receivedManifest: ArchiveManifest | null = null;
      setImportHandler(async (manifest) => { receivedManifest = manifest; });
      await importArchive(archive, TEST_PASSPHRASE);
      expect(receivedManifest).not.toBeNull();
      expect(receivedManifest!.header.format).toBe('dina-archive-v1');
    }, 30_000);

    it('succeeds without handler (dry-run)', async () => {
      resetImportHandler();
      await expect(importArchive(archive, TEST_PASSPHRASE)).resolves.toBeUndefined();
    }, 30_000);
  });

  describe('verifyArchive', () => {
    it('verifies a valid archive', async () => {
      expect(await verifyArchive(archive, TEST_PASSPHRASE)).toBe(true);
    }, 30_000);

    it('rejects corrupted archive', async () => {
      expect(await verifyArchive(new Uint8Array([0xDE, 0xAD]), TEST_PASSPHRASE)).toBe(false);
    });

    it('rejects wrong passphrase', async () => {
      expect(await verifyArchive(archive, TEST_PASSPHRASE_WRONG)).toBe(false);
    }, 30_000);
  });

  describe('round-trip: create → verify → import', () => {
    it('archive created → verified → imported → manifest matches', async () => {
      const fresh = await createArchive(TEST_PASSPHRASE);
      expect(await verifyArchive(fresh, TEST_PASSPHRASE)).toBe(true);

      let imported: ArchiveManifest | null = null;
      setImportHandler(async (m) => { imported = m; });
      await importArchive(fresh, TEST_PASSPHRASE);

      expect(imported).not.toBeNull();
      expect(imported!.header.format).toBe('dina-archive-v1');
    }, 60_000);
  });
});
