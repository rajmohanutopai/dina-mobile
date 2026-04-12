/**
 * Notify endpoint — push notification with guardian priority.
 *
 * POST /v1/notify → queue a notification with tier-based priority
 *
 * Source: ARCHITECTURE.md Task 2.83
 */

import { Router, type Request, type Response } from 'express';
import { mapTierToPriority, shouldInterrupt, shouldDeferToBriefing, type GuardianTier } from '../../notify/priority';

export interface Notification {
  id: string;
  title: string;
  body: string;
  tier: GuardianTier;
  priority: string;
  interrupt: boolean;
  deferred: boolean;
  persona: string;
  created_at: number;
}

/** In-memory notification queue. */
const notifications: Notification[] = [];
let notifyCounter = 0;

/** Reset notify state (for testing). */
export function resetNotifyState(): void {
  notifications.length = 0;
  notifyCounter = 0;
}

/** Get all queued notifications (for testing). */
export function getNotifications(): Notification[] {
  return [...notifications];
}

const VALID_TIERS = new Set([1, 2, 3]);

export function createNotifyRouter(): Router {
  const router = Router();

  // POST /v1/notify — queue a notification
  router.post('/v1/notify', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const title = String(body.title ?? '');
      const notifyBody = String(body.body ?? '');
      const tier = Number(body.tier ?? 0);
      const persona = String(body.persona ?? 'general');

      if (!title) { res.status(400).json({ error: 'title is required' }); return; }
      if (!notifyBody) { res.status(400).json({ error: 'body is required' }); return; }
      if (!VALID_TIERS.has(tier)) {
        res.status(400).json({ error: 'tier must be 1 (fiduciary), 2 (solicited), or 3 (engagement)' });
        return;
      }

      const guardianTier = tier as GuardianTier;
      const priority = mapTierToPriority(guardianTier);
      const interrupt = shouldInterrupt(guardianTier);
      const deferred = shouldDeferToBriefing(guardianTier);

      notifyCounter++;
      const notification: Notification = {
        id: `notify-${notifyCounter}`,
        title,
        body: notifyBody,
        tier: guardianTier,
        priority,
        interrupt,
        deferred,
        persona,
        created_at: Date.now(),
      };

      notifications.push(notification);

      res.status(201).json({
        id: notification.id,
        priority,
        interrupt,
        deferred,
      });
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
