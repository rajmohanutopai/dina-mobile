/**
 * PII scrub endpoint — scrub text and return tokens.
 *
 * POST /v1/pii/scrub → { scrubbed, entities }
 *
 * Source: ARCHITECTURE.md Task 2.76
 */

import { Router, type Request, type Response } from 'express';
import { scrubPII } from '../../pii/patterns';
import { rehydrate } from '../../pii/scrub';

export function createPIIRouter(): Router {
  const router = Router();

  // POST /v1/pii/scrub — scrub PII from text, return tokens for rehydration
  router.post('/v1/pii/scrub', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const text = String(body.text ?? '');

      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }

      const result = scrubPII(text);
      res.json({
        scrubbed: result.scrubbed,
        entities: result.entities.map(e => ({
          token: e.token,
          type: e.type,
          start: e.start,
          end: e.end,
        })),
        entityCount: result.entities.length,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /v1/pii/rehydrate — restore PII from tokens (internal only)
  router.post('/v1/pii/rehydrate', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const text = String(body.text ?? '');
      const entities = body.entities as Array<{ token: string; value: string }> ?? [];

      const rehydrated = rehydrate(text, entities);
      res.json({ rehydrated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
