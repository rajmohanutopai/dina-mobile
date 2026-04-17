/**
 * MsgBox bootstrap — wire WebSocket transport into runtime.
 *
 * Routes incoming RPC envelopes through the pure `CoreRouter` via
 * `createInProcessDispatch`. Express is not involved at any point —
 * dina-mobile runs under Expo managed and never ships an HTTP server.
 */

import {
  setIdentity, setWSFactory, connectToMsgBox,
  onD2DMessage, onRPCRequest, onRPCCancel,
  type WSFactory,
} from './msgbox_ws';
import {
  handleInboundD2D, handleInboundRPC, handleRPCCancel,
  setRPCRouter, sendD2DViaWS, type RPCRouterFn,
} from './msgbox_handlers';
import { setWSDeliverFn } from '../transport/delivery';
import type { CoreRouter } from '../server/router';
import { createInProcessDispatch } from '../server/in_process_dispatch';

export interface MsgBoxBootConfig {
  /** Home node DID (did:key:z...) */
  did: string;
  /** Home node Ed25519 private key (32 bytes) */
  privateKey: Uint8Array;
  /** MsgBox relay URL (wss://mailbox.dinakernel.com/ws) */
  msgboxURL: string;
  /** WebSocket factory (production: React Native WebSocket) */
  wsFactory: WSFactory;
  /** CoreRouter — where incoming RPC envelopes are dispatched. */
  coreRouter: CoreRouter;
  /** Resolve sender info for D2D receive pipeline */
  resolveSender: (did: string) => Promise<{ keys: Uint8Array[]; trust: string }>;
}

/**
 * Wire identity + envelope handlers + RPC dispatch into a connected
 * MsgBox WebSocket. Returns once the relay is reachable.
 */
export async function bootstrapMsgBox(config: MsgBoxBootConfig): Promise<void> {
  setIdentity(config.did, config.privateKey);
  setWSFactory(config.wsFactory);

  onD2DMessage((env) => {
    handleInboundD2D(env, config.resolveSender).catch(() => {
      /* handler errors logged inside handleInboundD2D */
    });
  });

  onRPCRequest((env) => {
    handleInboundRPC(env).catch(() => {
      /* handler errors logged inside handleInboundRPC */
    });
  });

  onRPCCancel((env) => {
    handleRPCCancel(env);
  });

  // Inbound RPC envelopes → decrypt → CoreRouter dispatch.
  setRPCRouter(createCoreRPCRouter(config.coreRouter));

  setWSDeliverFn(sendD2DViaWS);

  await connectToMsgBox(config.msgboxURL);
}

/**
 * Build an `RPCRouterFn` that hands decrypted inner HTTP-shaped requests
 * to the CoreRouter. No Express, no req/res objects — just a function
 * call.
 */
function createCoreRPCRouter(router: CoreRouter): RPCRouterFn {
  const dispatch = createInProcessDispatch({ router });
  return async (method, path, headers, body, signal?) => {
    if (signal?.aborted) {
      return { status: 499, headers: {}, body: '{"error":"cancelled"}' };
    }
    // Envelope transports body as a string; dispatch wants bytes.
    const bodyBytes = new TextEncoder().encode(body);
    const coreResp = await dispatch(
      method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      path,
      headers,
      bodyBytes,
    );
    const bodyStr = coreResp.body === undefined ? '' : JSON.stringify(coreResp.body);
    return {
      status: coreResp.status,
      headers: coreResp.headers ?? { 'content-type': 'application/json' },
      body: bodyStr,
    };
  };
}
