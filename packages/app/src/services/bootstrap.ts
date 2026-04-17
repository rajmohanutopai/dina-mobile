/**
 * Home-node bootstrap — composes Core + Brain + runners + MsgBox transport
 * into a `DinaNode` handle. One call on app unlock.
 *
 * The factory's contract:
 *   - Caller supplies pre-built clients (`BrainCoreClient`, `AppViewClient`,
 *     optional `PDSPublisher`) + a storage backend (`WorkflowRepository`)
 *     + a `ServiceConfig` accessor.
 *   - Bootstrap owns: constructing `WorkflowService` with the Response
 *     Bridge wired, `ServiceHandler` (inbound), orchestrator
 *     (outbound), `WorkflowEventConsumer` (delivers chat + dispatches
 *     approvals), `ApprovalReconciler` (TTL sweeper).
 *   - Chat-orchestrator globals (`setServiceCommandHandler` et al) are
 *     installed when `globalWiring !== false`. Integration tests that
 *     run multiple nodes in one process should pass `globalWiring: false`
 *     and interact with the node's direct handles instead.
 *
 * `start()` connects MsgBox + (if provider) publishes the service profile
 * + starts the polling runners. `stop()` halts them in reverse order.
 */

import type { WorkflowRepository } from '../../../core/src/workflow/repository';
import type { CoreRouter } from '../../../core/src/server/router';
import {
  WorkflowService,
} from '../../../core/src/workflow/service';
import {
  bootstrapMsgBox,
  type MsgBoxBootConfig,
} from '../../../core/src/relay/msgbox_boot';
import {
  disconnect as disconnectMsgBox,
  type WSFactory,
} from '../../../core/src/relay/msgbox_ws';
import {
  makeServiceResponseBridgeSender,
  type ResponseBridgeD2DSender,
} from '../../../core/src/workflow/response_bridge_sender';
import type { BrainCoreClient } from '../../../brain/src/core_client/http';
import type { AppViewClient } from '../../../brain/src/appview_client/http';
import type { PDSPublisher } from '../../../brain/src/pds/publisher';
import type { IdentityKeypair } from '../../../core/src/identity/keypair';
import type { PDSSession } from '../../../brain/src/pds/account';
import type { ServiceConfig } from '../../../core/src/service/service_config';
import {
  ServiceHandler,
  type ApprovalNotifier,
} from '../../../brain/src/service/service_handler';
import {
  ServiceQueryOrchestrator,
  type OrchestratorAppView,
} from '../../../brain/src/service/service_query_orchestrator';
import {
  WorkflowEventConsumer,
  type WorkflowEventDeliverer,
  type ApprovalEventDispatcher,
} from '../../../brain/src/service/workflow_event_consumer';
import { ApprovalReconciler } from '../../../brain/src/service/approval_reconciliation';
import { wireServiceOrchestrator } from '../../../brain/src/service/service_wiring';
import {
  setServiceApproveCommandHandler,
  resetServiceApproveCommandHandler,
  setServiceDenyCommandHandler,
  resetServiceDenyCommandHandler,
  setAskCommandHandler,
  resetAskCommandHandler,
} from '../../../brain/src/chat/orchestrator';
import type { LLMProvider } from '../../../brain/src/llm/adapters/provider';
import type { ToolRegistry } from '../../../brain/src/reasoning/tool_registry';
import {
  makeAgenticAskHandler,
  type AgenticAskHandlerOptions,
} from '../../../brain/src/reasoning/ask_handler';
import {
  makeServiceApproveHandler,
  makeServiceDenyHandler,
} from '../../../brain/src/service/approve_command';
import {
  ServicePublisher,
} from '../../../brain/src/service/service_publisher';
import { toPublisherConfig } from '../../../brain/src/service/config_sync';
import { addDinaResponse } from '../../../brain/src/chat/thread';
import { setInboxCoreClient, resetInboxCoreClient } from '../hooks/useServiceInbox';
import {
  setServiceConfigCoreClient,
  resetServiceConfigCoreClient,
} from '../hooks/useServiceConfigForm';

export type NodeRole = 'requester' | 'provider' | 'both';

export interface CreateNodeOptions {
  // --- Identity -----------------------------------------------------------
  did: string;
  signingKeypair: IdentityKeypair;
  pdsSession: PDSSession;

  // --- Transport plumbing --------------------------------------------------
  /** MsgBox WebSocket URL. Omit for nodes that don't hit the wire. */
  msgboxURL?: string;
  wsFactory?: WSFactory;
  /** D2D send — used by the Response Bridge to emit `service.response`. */
  sendD2D: ResponseBridgeD2DSender;
  /** Inbound receive pipeline sender-resolver. */
  resolveSender?: (did: string) => Promise<{ keys: Uint8Array[]; trust: string }>;
  /** CoreRouter — receives inbound MsgBox RPC envelopes via in-process dispatch. */
  coreRouter?: CoreRouter;

  // --- Clients + stores the caller provides -------------------------------
  coreClient: BrainCoreClient;
  appViewClient: Pick<AppViewClient, 'searchServices'>;
  pdsPublisher?: PDSPublisher;
  workflowRepository: WorkflowRepository;
  /** Accessor for the node's ServiceConfig. Return null when not configured. */
  readConfig: () => ServiceConfig | null;

  // --- Role + wiring ------------------------------------------------------
  role: NodeRole;
  chatThreadId?: string;
  /**
   * When provided alongside `globalWiring=true`, installs an agentic
   * `/ask` handler that routes natural-language questions through the
   * multi-turn tool-use loop. The LLM autonomously picks which tools to
   * call based on each tool's registered description. Tools are supplied
   * via the `tools` registry below — adding a new capability is a
   * registry insertion, not a handler rewrite. Omit `agenticAsk` for
   * test/minimal nodes that only speak the explicit `/service` slash
   * command.
   */
  agenticAsk?: {
    provider: LLMProvider;
    tools: ToolRegistry;
    options?: Omit<AgenticAskHandlerOptions, 'provider' | 'tools'>;
  };
  /** Optional approval-operator notifier. Defaults to chat-thread system msg. */
  approvalNotifier?: ApprovalNotifier;
  /**
   * Install chat-orchestrator globals (`/service` handler, approve/deny,
   * inbox + config hook clients). Default true; tests with multiple
   * nodes in one process must opt out.
   */
  globalWiring?: boolean;

  // --- Testing overrides --------------------------------------------------
  nowMsFn?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
  logger?: (entry: Record<string, unknown>) => void;
}

export interface DinaNode {
  did: string;
  coreClient: BrainCoreClient;
  workflowService: WorkflowService;
  orchestrator: ServiceQueryOrchestrator;
  handler: ServiceHandler;
  runners: {
    events: WorkflowEventConsumer;
    approvals: ApprovalReconciler;
  };
  /** Connect MsgBox, publish profile (if provider), start runners. */
  start(): Promise<void>;
  /** Stop runners, disconnect MsgBox. Safe to call multiple times. */
  stop(): Promise<void>;
  /** Force one poll cycle each on events + approvals. Tests use this. */
  drainOnce(): Promise<void>;
  /** Release all resources and undo global wiring. */
  dispose(): Promise<void>;
}

const DEFAULT_THREAD_ID = 'main';

export async function createNode(options: CreateNodeOptions): Promise<DinaNode> {
  validate(options);

  const log = options.logger ?? (() => { /* no-op */ });
  const nowMsFn = options.nowMsFn ?? Date.now;
  const threadId = options.chatThreadId ?? DEFAULT_THREAD_ID;
  const globalWiring = options.globalWiring !== false;
  const isProvider = options.role === 'provider' || options.role === 'both';

  // 1. WorkflowService with Response Bridge — completion on a delegation
  // task with payload.type === 'service_query_execution' auto-emits
  // service.response on the wire.
  const responseBridgeSender = makeServiceResponseBridgeSender({
    sendResponse: options.sendD2D,
    onMalformedResult: (ctx, err) => log({
      event: 'bridge.malformed_result', query_id: ctx.queryId, error: err.message,
    }),
    onSendError: (ctx, err) => log({
      event: 'bridge.send_failed', query_id: ctx.queryId, error: err.message,
    }),
  });
  const workflowService = new WorkflowService({
    repository: options.workflowRepository,
    nowMsFn,
    responseBridgeSender,
  });

  // 2. ServiceHandler — inbound service.query → delegation/approval task.
  const handler = new ServiceHandler({
    coreClient: options.coreClient,
    readConfig: options.readConfig,
    notifier: options.approvalNotifier ?? defaultApprovalNotifier(threadId),
    logger: log,
  });

  // 3. Orchestrator — outbound service.query dispatch.
  const orchestrator = new ServiceQueryOrchestrator({
    appViewClient: options.appViewClient as OrchestratorAppView,
    coreClient: options.coreClient,
  });

  // 4. WorkflowEventConsumer — deliver service_query completions to the
  // chat thread, dispatch `approved` events to `executeAndRespond`.
  const deliver: WorkflowEventDeliverer = ({ text, event, details }) => {
    const sources: string[] = [];
    if (event.task_id !== '') sources.push(event.task_id);
    if (details.capability !== undefined && details.capability !== '') {
      sources.push(details.capability);
    }
    addDinaResponse(threadId, text, sources.length > 0 ? sources : undefined);
  };
  const onApproved: ApprovalEventDispatcher = async ({ task, payload }) => {
    await handler.executeAndRespond(task.id, payload);
  };
  const events = new WorkflowEventConsumer({
    coreClient: options.coreClient,
    deliver,
    onApproved,
    setInterval: options.setInterval,
    clearInterval: options.clearInterval,
    logger: log,
  });

  // 5. ApprovalReconciler — provider-side TTL expiry sweeper.
  const approvals = new ApprovalReconciler({
    coreClient: options.coreClient,
    nowMsFn,
    setInterval: options.setInterval,
    clearInterval: options.clearInterval,
  });

  // 6. Install chat-orchestrator globals (unless opted out).
  const globalDisposers: Array<() => void> = [];
  if (globalWiring) {
    const disposeWire = wireServiceOrchestrator({ orchestrator });
    globalDisposers.push(() => disposeWire());
    setServiceApproveCommandHandler(
      makeServiceApproveHandler(options.coreClient),
    );
    globalDisposers.push(resetServiceApproveCommandHandler);
    setServiceDenyCommandHandler(
      makeServiceDenyHandler(options.coreClient),
    );
    globalDisposers.push(resetServiceDenyCommandHandler);
    setInboxCoreClient(options.coreClient);
    globalDisposers.push(resetInboxCoreClient);
    setServiceConfigCoreClient(options.coreClient);
    globalDisposers.push(resetServiceConfigCoreClient);
    if (options.agenticAsk !== undefined) {
      setAskCommandHandler(makeAgenticAskHandler({
        provider: options.agenticAsk.provider,
        tools: options.agenticAsk.tools,
        ...options.agenticAsk.options,
      }));
      globalDisposers.push(resetAskCommandHandler);
    }
  }

  // 7. ServicePublisher — publishes service profile record to PDS when
  // provider+isPublic. Instantiated lazily; caller supplies the publisher
  // so we don't duplicate credentials.
  let publisher: ServicePublisher | null = null;
  if (isProvider && options.pdsPublisher !== undefined) {
    publisher = new ServicePublisher({
      pds: options.pdsPublisher,
      expectedDID: options.did,
      nowFn: nowMsFn,
    });
  }

  // --- Lifecycle ---------------------------------------------------------

  let started = false;
  let disposed = false;

  const node: DinaNode = {
    did: options.did,
    coreClient: options.coreClient,
    workflowService,
    orchestrator,
    handler,
    runners: { events, approvals },

    async start(): Promise<void> {
      if (started) return;
      started = true;

      // MsgBox connection — only if url + wsFactory + coreRouter all supplied.
      if (
        options.msgboxURL !== undefined &&
        options.wsFactory !== undefined &&
        options.coreRouter !== undefined &&
        options.resolveSender !== undefined
      ) {
        const bootConfig: MsgBoxBootConfig = {
          did: options.did,
          privateKey: options.signingKeypair.privateKey,
          msgboxURL: options.msgboxURL,
          wsFactory: options.wsFactory,
          coreRouter: options.coreRouter,
          resolveSender: options.resolveSender,
        };
        await bootstrapMsgBox(bootConfig);
        log({ event: 'node.msgbox_connected', did: options.did });
      }

      // Publish the service profile record (provider role + isPublic).
      // Silent when the config isn't set yet — operator flips isPublic
      // later via settings and a config-change listener re-invokes sync.
      if (publisher !== null) {
        const cfg = options.readConfig();
        if (cfg !== null) {
          try {
            await publisher.sync(toPublisherConfig(cfg));
            log({ event: 'node.service_profile_synced', is_public: cfg.isPublic });
          } catch (err) {
            log({
              event: 'node.service_profile_sync_failed',
              error: (err as Error).message,
            });
          }
        }
      }

      events.start();
      approvals.start();
      log({ event: 'node.started', did: options.did });
    },

    async stop(): Promise<void> {
      if (!started) return;
      started = false;
      approvals.stop();
      events.stop();
      if (options.msgboxURL !== undefined) {
        try { await disconnectMsgBox(); } catch { /* swallow */ }
      }
      log({ event: 'node.stopped', did: options.did });
    },

    async drainOnce(): Promise<void> {
      await Promise.all([
        events.runTick(),
        approvals.runTick(),
      ]);
    },

    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      await this.stop();
      for (const fn of globalDisposers.reverse()) {
        try { fn(); } catch { /* swallow */ }
      }
    },
  };

  return node;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validate(o: CreateNodeOptions): void {
  if (!o.did) throw new Error('createNode: did is required');
  if (!o.signingKeypair) throw new Error('createNode: signingKeypair is required');
  if (!o.pdsSession) throw new Error('createNode: pdsSession is required');
  if (!o.sendD2D) throw new Error('createNode: sendD2D is required');
  if (!o.coreClient) throw new Error('createNode: coreClient is required');
  if (!o.appViewClient) throw new Error('createNode: appViewClient is required');
  if (!o.workflowRepository) throw new Error('createNode: workflowRepository is required');
  if (!o.readConfig) throw new Error('createNode: readConfig is required');
  if (o.role === 'provider' || o.role === 'both') {
    if (o.pdsPublisher === undefined) {
      throw new Error('createNode: provider role requires pdsPublisher');
    }
  }
}

function defaultApprovalNotifier(threadId: string): ApprovalNotifier {
  return ({ taskId, serviceName, capability, approveCommand }) => {
    const line = serviceName !== ''
      ? `${serviceName} wants to run ${capability}. Approve? ${approveCommand}`
      : `Pending approval: ${capability} (${taskId}). ${approveCommand}`;
    addDinaResponse(threadId, line, [taskId, capability]);
  };
}
