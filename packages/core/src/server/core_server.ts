/**
 * Core HTTP server — Express on localhost:8100.
 *
 * Endpoints:
 *   GET /healthz — health check (no auth)
 *   All other routes — Ed25519 auth middleware
 *
 * Mobile-specific: binds to localhost only (Core and Brain
 * communicate over localhost HTTP, never exposed to network).
 *
 * Source: ARCHITECTURE.md Task 2.1
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { authenticateRequest, type AuthRequest } from '../auth/middleware';
import { checkBodyLimit } from '../auth/body_limit';
import { logRequest, logResponse } from '../logging/structured';
import { createVaultRouter } from './routes/vault';
import { createStagingRouter } from './routes/staging';
import { createPIIRouter } from './routes/pii';
import { createAuditRouter } from './routes/audit';
import { createPersonaRouter } from './routes/persona';
import { createReminderRouter } from './routes/reminder';
import { createIdentityRouter } from './routes/identity';
import { createNotifyRouter } from './routes/notify';
import { createContactsRouter } from './routes/contacts';
import { createDevicesRouter } from './routes/devices';
import { createApprovalsRouter } from './routes/approvals';
import { createExportImportRouter } from './routes/export_import';
import { createUserApiRouter } from './routes/user_api';
import { createD2DMsgRouter } from './routes/d2d_msg';

import { CORE_DEFAULT_PORT } from '../constants';
export const DEFAULT_PORT = CORE_DEFAULT_PORT;
export const HEALTHZ_PATH = '/healthz';

/**
 * Create the Core Express app with middleware pipeline.
 */
export function createCoreApp() {
  const app = express();

  // Raw body parser (we need bytes for Ed25519 signature verification)
  app.use(express.raw({ type: '*/*', limit: '2mb' }));

  // Request logging (PII-safe)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logRequest({
      path: req.path,
      method: req.method,
      did: req.headers['x-did'] as string,
      requestId: req.headers['x-request-id'] as string,
    });
    next();
  });

  // Health check — no auth required
  app.get(HEALTHZ_PATH, (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'core', timestamp: new Date().toISOString() });
  });

  // Body limit check (before auth to prevent DoS)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === HEALTHZ_PATH) return next();
    const body = req.body instanceof Buffer ? new Uint8Array(req.body) : new Uint8Array(0);
    const limitResult = checkBodyLimit(body);
    if (!limitResult.allowed) {
      res.status(413).json({ error: 'Payload Too Large', detail: limitResult.reason });
      return;
    }
    next();
  });

  // Ed25519 auth middleware (all non-health routes)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === HEALTHZ_PATH) return next();

    const body = req.body instanceof Buffer ? new Uint8Array(req.body) : new Uint8Array(0);

    const authReq: AuthRequest = {
      method: req.method,
      path: req.path,
      query: req.url.includes('?') ? req.url.split('?')[1] : '',
      body,
      headers: normalizeHeaders(req.headers as Record<string, string>),
    };

    const result = authenticateRequest(authReq);

    if (!result.authenticated) {
      const status = result.rejectedAt === 'rate_limit' ? 429
        : result.rejectedAt === 'authorization' ? 403
        : 401;
      res.status(status).json({
        error: result.reason,
        rejectedAt: result.rejectedAt,
      });
      return;
    }

    // Attach auth info to request for downstream handlers
    // Using res.locals (Express-standard) instead of req mutation
    res.locals.callerDID = result.did;
    res.locals.callerType = result.callerType;
    next();
  });

  // Response time logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      logResponse({
        path: req.path,
        method: req.method,
        status: res.statusCode,
        latencyMs: Date.now() - start,
        did: req.headers['x-did'] as string,
        requestId: req.headers['x-request-id'] as string,
      });
    });
    next();
  });

  // Mount API routes
  app.use(createVaultRouter());
  app.use(createStagingRouter());
  app.use(createPIIRouter());
  app.use(createAuditRouter());
  app.use(createPersonaRouter());
  app.use(createReminderRouter());
  app.use(createIdentityRouter());
  app.use(createNotifyRouter());
  app.use(createContactsRouter());
  app.use(createDevicesRouter());
  app.use(createApprovalsRouter());
  app.use(createExportImportRouter());
  app.use(createUserApiRouter());
  app.use(createD2DMsgRouter());

  return app;
}

/**
 * Normalize Express lowercase headers to the X-Title-Case format
 * expected by the auth middleware (X-DID, X-Timestamp, X-Nonce, X-Signature).
 */
function normalizeHeaders(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const headerMap: Record<string, string> = {
    'x-did': 'X-DID',
    'x-timestamp': 'X-Timestamp',
    'x-nonce': 'X-Nonce',
    'x-signature': 'X-Signature',
    'x-agent-did': 'X-Agent-DID',
    'x-request-id': 'X-Request-ID',
  };

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') continue;
    const normalized = headerMap[k] ?? k;
    result[normalized] = v;
  }
  return result;
}

/**
 * Start the Core HTTP server.
 *
 * @returns A handle to stop the server.
 */
export function startCoreServer(port: number = DEFAULT_PORT) {
  const app = createCoreApp();

  const server = app.listen(port, '127.0.0.1', () => {
    // Server started on localhost only
  });

  return {
    app,
    server,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    port,
  };
}
