/**
 * D2D messaging stub endpoints — deferred to Phase 6.
 *
 * POST /v1/msg/send  → send a D2D message
 * GET  /v1/msg/inbox → list received D2D messages
 *
 * These are registered stubs that return 501 (Not Implemented) until
 * Phase 6 wires them to the full D2D pipeline (NaCl sealed box,
 * 4-gate egress, MsgBox relay).
 *
 * Source: ARCHITECTURE.md Task 2.81
 */

import { Router, type Request, type Response } from 'express';

export function createD2DMsgRouter(): Router {
  const router = Router();

  // POST /v1/msg/send — stub
  router.post('/v1/msg/send', (_req: Request, res: Response) => {
    res.status(501).json({
      error: 'D2D send not yet implemented',
      phase: 6,
      message: 'D2D messaging via NaCl sealed box will be available in Phase 6',
    });
  });

  // GET /v1/msg/inbox — stub
  router.get('/v1/msg/inbox', (_req: Request, res: Response) => {
    res.status(501).json({
      error: 'D2D inbox not yet implemented',
      phase: 6,
      message: 'D2D inbox with quarantine will be available in Phase 6',
    });
  });

  return router;
}
