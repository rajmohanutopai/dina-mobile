/**
 * Export/Import stub endpoints — deferred to Phase 9.
 *
 * POST /v1/export → initiate encrypted .dina archive export
 * POST /v1/import → import .dina archive
 *
 * These are registered stubs that return 501 (Not Implemented) until
 * Phase 9 wires them to the full archive pipeline. Registering them now
 * ensures the authz matrix covers them and integration tests can verify
 * the routes are mounted.
 *
 * Source: ARCHITECTURE.md Task 2.82
 */

import { Router, type Request, type Response } from 'express';

export function createExportImportRouter(): Router {
  const router = Router();

  // POST /v1/export — stub
  router.post('/v1/export', (_req: Request, res: Response) => {
    res.status(501).json({
      error: 'Export not yet implemented',
      phase: 9,
      message: 'Encrypted .dina archive export will be available in Phase 9',
    });
  });

  // POST /v1/import — stub
  router.post('/v1/import', (_req: Request, res: Response) => {
    res.status(501).json({
      error: 'Import not yet implemented',
      phase: 9,
      message: 'Encrypted .dina archive import will be available in Phase 9',
    });
  });

  return router;
}
