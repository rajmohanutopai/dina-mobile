/**
 * Reminder endpoints — create + list pending.
 *
 * POST /v1/reminder          → create reminder (dedup)
 * GET  /v1/reminders/pending → list due reminders
 *
 * Source: ARCHITECTURE.md Task 2.77
 */

import { Router, type Request, type Response } from 'express';
import { createReminder, listPending, getReminder, deleteReminder, listByPersona } from '../../reminders/service';

export function createReminderRouter(): Router {
  const router = Router();

  // POST /v1/reminder — create
  router.post('/v1/reminder', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const message = String(body.message ?? '');
      const due_at = Number(body.due_at ?? 0);
      const persona = String(body.persona ?? 'general');

      if (!message) { res.status(400).json({ error: 'message is required' }); return; }
      if (!due_at) { res.status(400).json({ error: 'due_at is required' }); return; }

      const reminder = createReminder({
        message,
        due_at,
        persona,
        kind: body.kind ? String(body.kind) : undefined,
        source_item_id: body.source_item_id ? String(body.source_item_id) : undefined,
        source: body.source ? String(body.source) : undefined,
        recurring: body.recurring as '' | 'daily' | 'weekly' | 'monthly' | undefined,
      });

      res.status(201).json({ id: reminder.id, due_at: reminder.due_at, persona: reminder.persona });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /v1/reminders/pending — list due
  router.get('/v1/reminders/pending', (req: Request, res: Response) => {
    const now = req.query.now ? Number(req.query.now) : undefined;
    const pending = listPending(now);
    res.json({
      reminders: pending.map(r => ({
        id: r.id, message: r.message, due_at: r.due_at,
        persona: r.persona, kind: r.kind, recurring: r.recurring,
      })),
      count: pending.length,
    });
  });

  // GET /v1/reminders/:persona — list by persona
  router.get('/v1/reminders/:persona', (req: Request, res: Response) => {
    const reminders = listByPersona(String(req.params.persona));
    res.json({ reminders, count: reminders.length });
  });

  // DELETE /v1/reminder/:id
  router.delete('/v1/reminder/:id', (req: Request, res: Response) => {
    const deleted = deleteReminder(String(req.params.id));
    if (!deleted) { res.status(404).json({ error: 'Reminder not found' }); return; }
    res.json({ deleted: true });
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
