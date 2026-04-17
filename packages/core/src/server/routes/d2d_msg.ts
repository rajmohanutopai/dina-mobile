/**
 * D2D messaging stub — scheduled to be wired through `sendD2D` on the
 * D8 completion pass. For now returns 501 so callers (`BrainCoreClient.
 * sendMessage`) fail loudly rather than silently succeeding.
 */

import type { CoreRouter } from '../router';

export function registerD2DMsgRoutes(router: CoreRouter): void {
  router.post('/v1/msg/send', async () => ({
    status: 501,
    body: {
      error: 'D2D send not yet wired to sendD2D',
      note: 'Responder Bridge + MsgBox are the production path; this stub remains pending a direct /v1/msg/send passthrough.',
    },
  }));
}
