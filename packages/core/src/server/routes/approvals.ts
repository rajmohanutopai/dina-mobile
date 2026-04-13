/**
 * Approval endpoints — list pending, approve, deny.
 *
 * GET  /v1/approvals             → list pending approval requests
 * POST /v1/approvals             → create an approval request
 * POST /v1/approvals/:id/approve → approve a request (with scope)
 * POST /v1/approvals/:id/deny    → deny a request
 * GET  /v1/approvals/:id         → get a specific request
 *
 * Source: ARCHITECTURE.md Task 2.75
 */

import { Router, type Request, type Response } from 'express';
import {
  getApprovalManager, resetApprovalManager,
} from '../../approval/manager';

/** Reset approval state (for testing). */
export function resetApprovalState(): void {
  resetApprovalManager();
}

/** Convenience accessor — returns the shared singleton. */
export { getApprovalManager } from '../../approval/manager';

const VALID_SCOPES = new Set(['single', 'session']);

export function createApprovalsRouter(): Router {
  const router = Router();

  // GET /v1/approvals — list pending
  router.get('/v1/approvals', (_req: Request, res: Response) => {
    const pending = getApprovalManager().listPending();
    res.json({
      approvals: pending.map(a => ({
        id: a.id, action: a.action, requester_did: a.requester_did,
        persona: a.persona, reason: a.reason, preview: a.preview,
        status: a.status, created_at: a.created_at,
      })),
      count: pending.length,
    });
  });

  // POST /v1/approvals — create approval request
  router.post('/v1/approvals', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const id = String(body.id ?? '');
      const action = String(body.action ?? '');
      const requester_did = String(body.requester_did ?? '');
      const persona = String(body.persona ?? 'general');
      const reason = String(body.reason ?? '');
      const preview = String(body.preview ?? '');

      if (!id) { res.status(400).json({ error: 'id is required' }); return; }
      if (!action) { res.status(400).json({ error: 'action is required' }); return; }
      if (!requester_did) { res.status(400).json({ error: 'requester_did is required' }); return; }

      getApprovalManager().requestApproval({
        id, action, requester_did, persona, reason, preview,
        created_at: Date.now(),
      });

      res.status(201).json({ id, status: 'pending' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  // GET /v1/approvals/:id — get specific request
  router.get('/v1/approvals/:id', (req: Request, res: Response) => {
    const approval = getApprovalManager().getRequest(String(req.params.id));
    if (!approval) { res.status(404).json({ error: 'Approval request not found' }); return; }
    res.json(approval);
  });

  // POST /v1/approvals/:id/approve — approve a request
  router.post('/v1/approvals/:id/approve', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const body = parseJSON(req);
      const scope = String(body.scope ?? 'single');
      const approved_by = String(body.approved_by ?? '');

      if (!VALID_SCOPES.has(scope)) {
        res.status(400).json({ error: `scope must be one of: ${[...VALID_SCOPES].join(', ')}` });
        return;
      }
      if (!approved_by) {
        res.status(400).json({ error: 'approved_by is required' });
        return;
      }

      getApprovalManager().approveRequest(id, scope as 'single' | 'session', approved_by);
      res.json({ id, status: 'approved', scope });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not found') ? 404 : 400;
      res.status(status).json({ error: msg });
    }
  });

  // POST /v1/approvals/:id/deny — deny a request
  router.post('/v1/approvals/:id/deny', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      getApprovalManager().denyRequest(id);
      res.json({ id, status: 'denied' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not found') ? 404 : 400;
      res.status(status).json({ error: msg });
    }
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
