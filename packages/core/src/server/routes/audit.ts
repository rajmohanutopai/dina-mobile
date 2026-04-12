/**
 * Audit endpoints — append + query hash-chained audit log.
 *
 * POST /v1/audit/append → append entry with auto hash chain
 * GET  /v1/audit/query  → query with optional filters
 * GET  /v1/audit/verify → verify chain integrity
 *
 * Source: ARCHITECTURE.md Task 2.79
 */

import { Router, type Request, type Response } from 'express';
import { appendAudit, queryAudit, verifyAuditChain, auditCount } from '../../audit/service';

export function createAuditRouter(): Router {
  const router = Router();

  // POST /v1/audit/append
  router.post('/v1/audit/append', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const actor = String(body.actor ?? '');
      const action = String(body.action ?? '');
      const resource = String(body.resource ?? '');
      const detail = body.detail ? String(body.detail) : undefined;

      if (!actor || !action || !resource) {
        res.status(400).json({ error: 'actor, action, resource are required' });
        return;
      }

      const entry = appendAudit(actor, action, resource, detail);
      res.status(201).json({ seq: entry.seq, entry_hash: entry.entry_hash });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /v1/audit/query
  router.get('/v1/audit/query', (req: Request, res: Response) => {
    const filters: Record<string, unknown> = {};
    if (req.query.actor) filters.actor = String(req.query.actor);
    if (req.query.action) filters.action = String(req.query.action);
    if (req.query.resource) filters.resource = String(req.query.resource);
    if (req.query.limit) filters.limit = Number(req.query.limit);

    const entries = queryAudit(filters as Parameters<typeof queryAudit>[0]);
    res.json({ entries, count: entries.length, total: auditCount() });
  });

  // GET /v1/audit/verify — verify chain integrity
  router.get('/v1/audit/verify', (_req: Request, res: Response) => {
    const result = verifyAuditChain();
    res.json({ ...result, total: auditCount() });
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
