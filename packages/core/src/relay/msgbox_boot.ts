/**
 * MsgBox bootstrap — wire WebSocket transport into runtime.
 *
 * Called at startup to:
 *   1. Configure identity for WS auth handshake
 *   2. Register envelope handlers (D2D → receive pipeline, RPC → Express app)
 *   3. Bind RPC router to Core Express app via request injection
 *   4. Connect to MsgBox relay with auto-reconnect
 *
 * Source: MsgBox Protocol — Home Node Implementation Guide
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
import type { Express } from 'express';

export interface MsgBoxBootConfig {
  /** Home node DID (did:key:z...) */
  did: string;
  /** Home node Ed25519 private key (32 bytes) */
  privateKey: Uint8Array;
  /** MsgBox relay URL (wss://mailbox.dinakernel.com/ws) */
  msgboxURL: string;
  /** WebSocket factory (production: React Native WebSocket) */
  wsFactory: WSFactory;
  /** Core Express app for RPC routing */
  coreApp: Express;
  /** Resolve sender info for D2D receive pipeline */
  resolveSender: (did: string) => Promise<{ keys: Uint8Array[]; trust: string }>;
}

/**
 * Bootstrap MsgBox WebSocket transport.
 *
 * Wires up:
 * - Identity (for WS auth handshake + envelope signing)
 * - D2D inbound → receive pipeline
 * - RPC inbound → Express request injection → encrypted response
 * - RPC cancel → abort in-flight handlers
 * - WS-first delivery in transport layer
 * - Auto-reconnect with exponential backoff
 */
export async function bootstrapMsgBox(config: MsgBoxBootConfig): Promise<void> {
  // 1. Configure identity
  setIdentity(config.did, config.privateKey);

  // 2. Set WebSocket factory
  setWSFactory(config.wsFactory);

  // 3. Register envelope handlers
  onD2DMessage((env) => {
    handleInboundD2D(env, config.resolveSender).catch(() => {
      // Handler errors are logged inside handleInboundD2D
    });
  });

  onRPCRequest((env) => {
    handleInboundRPC(env).catch(() => {
      // Handler errors are logged inside handleInboundRPC
    });
  });

  onRPCCancel((env) => {
    handleRPCCancel(env);
  });

  // 4. Bind RPC router to Core Express app
  const rpcRouter = createExpressRPCRouter(config.coreApp);
  setRPCRouter(rpcRouter);

  // 5. Wire WS-first delivery into transport layer
  setWSDeliverFn(sendD2DViaWS);

  // 6. Connect to MsgBox relay
  await connectToMsgBox(config.msgboxURL);
}

/**
 * RPC router response type.
 */
interface RouterResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Create an RPC router function that injects requests into the Core Express app.
 *
 * Converts the decrypted RPC inner request into an Express-compatible
 * request/response pair and routes through the same middleware chain
 * (auth, body limit, rate limit) as direct HTTP requests.
 */
function createExpressRPCRouter(app: Express): RPCRouterFn {
  return async (method, path, headers, body, signal?) => {
    return new Promise<RouterResponse>((resolve) => {
      let resolved = false;
      const settle = (response: RouterResponse): void => {
        if (resolved) return;
        resolved = true;
        resolve(response);
      };

      // If already cancelled, resolve immediately
      if (signal?.aborted) {
        settle({ status: 499, headers: {}, body: '{"error":"cancelled"}' });
        return;
      }

      signal?.addEventListener('abort', () => {
        settle({ status: 499, headers: {}, body: '{"error":"cancelled"}' });
      }, { once: true });

      // Build a minimal Express-compatible request object
      const bodyBuffer = Buffer.from(body);
      const mockReq: Record<string, unknown> = {
        method,
        url: path,
        path: path.split('?')[0],
        headers: Object.fromEntries(
          Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
        ),
        body: bodyBuffer,
        query: {},
        params: {},
        on() { return mockReq; },
        once() { return mockReq; },
        emit() { return false; },
      };

      // Build a minimal Express-compatible response object
      let statusCode = 200;
      const responseHeaders: Record<string, string> = {};
      const responseChunks: Buffer[] = [];
      const locals: Record<string, unknown> = {};

      const mockRes: Record<string, unknown> = {
        statusCode: 200,
        locals,
        status(code: number) { statusCode = code; mockRes.statusCode = code; return mockRes; },
        setHeader(name: string, value: string) { responseHeaders[name.toLowerCase()] = value; },
        getHeader(name: string) { return responseHeaders[name.toLowerCase()]; },
        removeHeader(name: string) { delete responseHeaders[name.toLowerCase()]; },
        write(chunk: Buffer | string) {
          responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          return true;
        },
        end(chunk?: Buffer | string) {
          if (chunk) {
            responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const responseBody = Buffer.concat(responseChunks).toString('utf-8');
          settle({ status: statusCode, headers: responseHeaders, body: responseBody });
        },
        json(obj: unknown) {
          responseHeaders['content-type'] = 'application/json';
          (mockRes.end as (c: string) => void)(JSON.stringify(obj));
        },
        on() { return mockRes; },
        once() { return mockRes; },
        emit() { return false; },
      };

      // Inject into Express handler chain
      try {
        (app as unknown as (req: unknown, res: unknown, next: () => void) => void)(
          mockReq, mockRes,
          () => settle({ status: 404, headers: {}, body: '{"error":"Not found"}' }),
        );
      } catch (err) {
        settle({
          status: 500, headers: {},
          body: JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
        });
      }
    });
  };
}
