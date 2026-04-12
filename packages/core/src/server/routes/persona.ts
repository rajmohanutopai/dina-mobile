/**
 * Persona endpoints — create, list, unlock, lock.
 *
 * GET  /v1/personas        → list all with tier + open state
 * POST /v1/personas        → create with tier
 * POST /v1/persona/unlock  → open a persona (approval flag)
 * POST /v1/persona/lock    → close a persona
 *
 * Source: ARCHITECTURE.md Task 2.72
 */

import { Router, type Request, type Response } from 'express';
import {
  createPersona, listPersonas, getPersona, openPersona, closePersona,
} from '../../persona/service';
import type { PersonaTier } from '../../vault/lifecycle';

const VALID_TIERS = new Set<string>(['default', 'standard', 'sensitive', 'locked']);

export function createPersonaRouter(): Router {
  const router = Router();

  // GET /v1/personas — list all
  router.get('/v1/personas', (_req: Request, res: Response) => {
    const personas = listPersonas();
    res.json({
      personas: personas.map(p => ({
        name: p.name, tier: p.tier, isOpen: p.isOpen, description: p.description,
      })),
      count: personas.length,
    });
  });

  // POST /v1/personas — create
  router.post('/v1/personas', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const name = String(body.name ?? '');
      const tier = String(body.tier ?? 'standard');
      const description = body.description ? String(body.description) : undefined;

      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      if (!VALID_TIERS.has(tier)) { res.status(400).json({ error: `tier must be one of: ${[...VALID_TIERS].join(', ')}` }); return; }

      const persona = createPersona(name, tier as PersonaTier, description);
      res.status(201).json({ name: persona.name, tier: persona.tier });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  // POST /v1/persona/unlock
  router.post('/v1/persona/unlock', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const name = String(body.name ?? '');
      const approved = body.approved === true;

      if (!name) { res.status(400).json({ error: 'name is required' }); return; }

      const opened = openPersona(name, approved);
      if (!opened) {
        res.status(403).json({ error: 'Approval required to unlock this persona' });
        return;
      }
      res.json({ name, unlocked: true });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /v1/persona/lock
  router.post('/v1/persona/lock', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const name = String(body.name ?? '');
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }

      closePersona(name);
      res.json({ name, locked: true });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
