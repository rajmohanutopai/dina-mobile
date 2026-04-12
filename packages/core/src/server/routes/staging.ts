/**
 * Staging HTTP endpoints — full staging inbox lifecycle.
 *
 * POST /v1/staging/ingest       → dedup + create staging item
 * POST /v1/staging/claim        → claim N items with 15-min lease
 * POST /v1/staging/resolve      → resolve claimed item to vault
 * POST /v1/staging/fail         → mark item as failed
 * POST /v1/staging/extend-lease → extend lease on claimed item
 *
 * Source: ARCHITECTURE.md Task 2.71
 */

import { Router, type Request, type Response } from 'express';
import { ingest, claim, resolve, fail, extendLease, getItem } from '../../staging/service';

export function createStagingRouter(): Router {
  const router = Router();

  // POST /v1/staging/ingest
  router.post('/v1/staging/ingest', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const result = ingest({
        source: String(body.source ?? ''),
        source_id: String(body.source_id ?? ''),
        producer_id: body.producer_id ? String(body.producer_id) : undefined,
        data: (body.data as Record<string, unknown>) ?? {},
      });

      if (result.duplicate) {
        res.status(409).json({ id: result.id, duplicate: true });
        return;
      }
      res.status(201).json({ id: result.id, duplicate: false });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // POST /v1/staging/claim?limit=N
  router.post('/v1/staging/claim', (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));
    const items = claim(limit);
    res.json({ items, count: items.length });
  });

  // POST /v1/staging/resolve
  router.post('/v1/staging/resolve', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const id = String(body.id ?? '');
      const persona = String(body.persona ?? 'general');
      const personaOpen = body.persona_open !== false; // default true

      resolve(id, persona, personaOpen);
      const item = getItem(id);
      res.json({ id, status: item?.status ?? 'unknown' });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // POST /v1/staging/fail
  router.post('/v1/staging/fail', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const id = String(body.id ?? '');
      fail(id);
      const item = getItem(id);
      res.json({ id, retry_count: item?.retry_count ?? 0 });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // POST /v1/staging/extend-lease
  router.post('/v1/staging/extend-lease', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const id = String(body.id ?? '');
      const seconds = Number(body.seconds ?? 300);
      extendLease(id, seconds);
      res.json({ id, extended_by: seconds });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
