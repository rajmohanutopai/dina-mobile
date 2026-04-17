/**
 * Production-wiring helper for the Response Bridge (CORE-P3-I01/I02/I03).
 *
 * Turns a `ServiceQueryBridgeContext` (produced by `WorkflowService.
 * bridgeServiceQueryCompletion` when a delegation task completes) into
 * an outbound `service.response` D2D. The actual network send is
 * injected so this helper stays free of node-identity / keypair /
 * transport coupling — those live in the app-layer bootstrap.
 *
 * Usage (in app bootstrap):
 *
 *   const bridgeSender = makeServiceResponseBridgeSender({
 *     sendResponse: (to, body) => sendD2D({
 *       recipientDID: to,
 *       messageType: 'service.response',
 *       body: JSON.stringify(body),
 *       senderDID, senderPrivateKey, recipientPublicKey: resolve(to),
 *       serviceType: 'DinaDirectHTTPS',
 *       endpoint: coreURL,
 *     }).then(() => {}),
 *   });
 *   setWorkflowService(new WorkflowService({
 *     repository,
 *     responseBridgeSender: bridgeSender,
 *   }));
 *
 * Errors from `sendResponse` are caught and fed to the optional
 * `onSendError` hook — the bridge MUST NOT roll back the completion
 * that already landed. Durable retry is the outbox layer (CORE-P4-I05).
 *
 * Source: BUS_DRIVER_IMPLEMENTATION.md CORE-P3-I03.
 */

import type { ResponseBridgeSender, ServiceQueryBridgeContext } from './service';
import type { ServiceResponseBody } from '../d2d/service_bodies';

/**
 * Network-layer callback the bridge uses to deliver a well-formed
 * `service.response` body. The app bootstrap wraps `sendD2D` behind
 * this interface so this module stays pure.
 */
export type ResponseBridgeD2DSender = (
  recipientDID: string,
  body: ServiceResponseBody,
) => Promise<void>;

export interface MakeResponseBridgeSenderOptions {
  /** D2D egress callback. See `ResponseBridgeD2DSender` docstring. */
  sendResponse: ResponseBridgeD2DSender;
  /**
   * Optional hook fired when `sendResponse` rejects or the payload is
   * malformed. Receives the bridge context + the error. Completion
   * state is NOT rolled back — the durable outbox layer (CORE-P4-I05)
   * will retry on future sweeper ticks when wired.
   */
  onSendError?: (ctx: ServiceQueryBridgeContext, err: Error) => void;
  /**
   * Optional hook fired when a result JSON cannot be parsed. Separate
   * from `onSendError` so dashboards can distinguish "runner emitted
   * garbage" from "network is down."
   */
  onMalformedResult?: (
    ctx: ServiceQueryBridgeContext,
    err: Error,
  ) => void;
}

/**
 * Factory — returns a `ResponseBridgeSender` ready to plug into
 * `WorkflowServiceOptions.responseBridgeSender`. The returned function
 * never throws: all error paths route through the optional hooks.
 */
export function makeServiceResponseBridgeSender(
  options: MakeResponseBridgeSenderOptions,
): ResponseBridgeSender {
  if (!options.sendResponse) {
    throw new Error(
      'makeServiceResponseBridgeSender: sendResponse callback is required',
    );
  }
  const onSendError = options.onSendError ?? (() => { /* no-op */ });
  const onMalformedResult = options.onMalformedResult ?? (() => { /* no-op */ });

  return async (ctx: ServiceQueryBridgeContext) => {
    let result: unknown;
    try {
      // `resultJSON` is empty when the runner called `complete` with a
      // summary-only finish (rare but legal). Treat that as a success
      // with an undefined `result` field.
      result = ctx.resultJSON === '' ? undefined : JSON.parse(ctx.resultJSON);
    } catch (e) {
      onMalformedResult(ctx, e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const body: ServiceResponseBody = {
      query_id: ctx.queryId,
      capability: ctx.capability,
      status: 'success',
      result,
      ttl_seconds: ctx.ttlSeconds,
    };
    try {
      await options.sendResponse(ctx.fromDID, body);
    } catch (e) {
      onSendError(ctx, e instanceof Error ? e : new Error(String(e)));
    }
  };
}
