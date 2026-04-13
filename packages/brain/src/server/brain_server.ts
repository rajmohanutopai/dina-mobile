/**
 * Brain HTTP server — Express on localhost:8200.
 *
 * Endpoints:
 *   GET /healthz — health check (no auth)
 *   POST /v1/reason — chat reasoning pipeline
 *   POST /v1/process — event processing (approval, reminder, post-publish)
 *   POST /v1/classify — domain classification
 *   POST /v1/enrich — item enrichment (L0/L1)
 *
 * The Brain server is called by the app UI (via Core proxy or direct
 * localhost) and by Core for event processing. All non-health routes
 * require Ed25519 auth from the UI device key or Core service key.
 *
 * Source: ARCHITECTURE.md Task 3.1
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { classifyDomain, type ClassificationInput } from '../routing/domain';
import { generateL0, type L0Input } from '../enrichment/l0_deterministic';
import { processEvent } from '../pipeline/event_processor';

export const DEFAULT_BRAIN_PORT = 8200;
export const HEALTHZ_PATH = '/healthz';

/** Injectable auth middleware — set via configureBrainAuth(). */
let authMiddleware: ((req: Request, res: Response, next: NextFunction) => void) | null = null;

/** Configure the auth middleware (for production + testing). */
export function configureBrainAuth(middleware: (req: Request, res: Response, next: NextFunction) => void): void {
  authMiddleware = middleware;
}

/** Reset auth middleware (for testing). */
export function resetBrainAuth(): void {
  authMiddleware = null;
}

/**
 * Create the Brain Express app with middleware pipeline.
 */
export function createBrainApp() {
  const app = express();

  // Raw body parser (consistent with Core)
  app.use(express.raw({ type: '*/*', limit: '2mb' }));

  // Health check — no auth required
  app.get(HEALTHZ_PATH, (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'brain',
      timestamp: new Date().toISOString(),
    });
  });

  // Auth middleware for all non-health routes
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === HEALTHZ_PATH) return next();

    if (authMiddleware) {
      return authMiddleware(req, res, next);
    }

    // No auth configured — reject (fail-closed)
    res.status(401).json({ error: 'Auth middleware not configured' });
    return;
  });

  // POST /v1/reason — chat reasoning (stub, wired in Phase 3.25)
  app.post('/v1/reason', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const query = String(body.query ?? '');
      const persona = String(body.persona ?? 'general');

      if (!query) { res.status(400).json({ error: 'query is required' }); return; }

      // Not wired — return 501 so callers know the pipeline isn't ready
      res.status(501).json({
        error: 'Reasoning pipeline not yet wired',
        query,
        persona,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /v1/process — event processing (stub, wired in Phase 3.26)
  app.post('/v1/process', async (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const event = String(body.event ?? '');

      if (!event) { res.status(400).json({ error: 'event is required' }); return; }

      // Event processing wired to the real event processor
      const result = await processEvent({ event: event as import('../pipeline/event_processor').EventType, data: body });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /v1/classify — domain classification
  app.post('/v1/classify', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const text = String(body.text ?? '');
      const source = body.source ? String(body.source) : undefined;

      if (!text) { res.status(400).json({ error: 'text is required' }); return; }

      const input: ClassificationInput = { body: text, source };
      const result = classifyDomain(input);

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /v1/enrich — item enrichment
  app.post('/v1/enrich', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const summary = String(body.summary ?? '');
      const type = String(body.type ?? 'note');

      if (!summary) { res.status(400).json({ error: 'summary is required' }); return; }

      const input: L0Input = {
        type,
        source: String(body.source ?? 'manual'),
        sender: String(body.sender ?? 'user'),
        timestamp: Date.now(),
        summary,
      };
      const l0 = generateL0(input);

      res.json({ content_l0: l0, type });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return app;
}

/**
 * Start the Brain HTTP server.
 */
export function startBrainServer(port: number = DEFAULT_BRAIN_PORT) {
  const app = createBrainApp();

  const server = app.listen(port, '127.0.0.1', () => {
    // Brain server started on localhost only
  });

  return {
    app,
    server,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    port,
  };
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
