/**
 * Core surface — a pure-function CoreRouter, no Express.
 *
 * Dina-mobile runs under Expo's managed workflow, which forbids Node
 * HTTP servers. Every transport (Brain↔Core in-process, MsgBox RPC
 * inbound from paired devices) adapts to this router via
 * `createInProcessDispatch`. Tests call `handleCoreRequest` directly.
 *
 * A cloud-hosted variant of Dina-as-a-Home-Node on a server would layer
 * an Express or Fastify adapter on top — but that's a separate build
 * target, not something the mobile app ships with.
 */

import { CoreRouter } from './router';
import { registerVaultRoutes } from './routes/vault';
import { registerStagingRoutes } from './routes/staging';
import { registerPIIRoutes } from './routes/pii';
import { registerDevicesRoutes } from './routes/devices';
import { registerD2DMsgRoutes } from './routes/d2d_msg';
import { registerServiceConfigRoutes } from './routes/service_config';
import { registerWorkflowRoutes } from './routes/workflow';
import {
  registerServiceQueryRoutes,
  type ServiceQueryRouteOptions,
} from './routes/service_query';
import {
  registerServiceRespondRoutes,
  type ServiceRespondRouteOptions,
} from './routes/service_respond';

import { CORE_DEFAULT_PORT } from '../constants';
export const DEFAULT_PORT = CORE_DEFAULT_PORT;
export const HEALTHZ_PATH = '/healthz';

export interface CoreRouterOptions {
  serviceQuery?: ServiceQueryRouteOptions;
  serviceRespond?: ServiceRespondRouteOptions;
}

/**
 * Build a CoreRouter with every mobile-MVP route registered. The
 * returned router is pure — hand it to `createInProcessDispatch`
 * (brain-side client) or the MsgBox RPC handler (inbound agent
 * requests). No HTTP server is started.
 */
export function createCoreRouter(options: CoreRouterOptions = {}): CoreRouter {
  const router = new CoreRouter();

  router.get(HEALTHZ_PATH, async () => ({
    status: 200,
    body: { status: 'ok', service: 'core', timestamp: new Date().toISOString() },
  }), { auth: 'public' });

  registerVaultRoutes(router);
  registerStagingRoutes(router);
  registerPIIRoutes(router);
  registerDevicesRoutes(router);
  registerD2DMsgRoutes(router);
  registerServiceConfigRoutes(router);
  registerWorkflowRoutes(router);
  registerServiceQueryRoutes(router, options.serviceQuery);
  registerServiceRespondRoutes(router, options.serviceRespond);

  return router;
}
