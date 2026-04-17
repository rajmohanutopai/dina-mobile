# Walkthrough: Bus Driver Scenario

Alice is waiting at a bus stop. She asks her Dina:
> "When will the next Bus 42 reach me?"

Bus 42's operator (a public Dina instance at `did:plc:bus42`) advertises an
`eta_query` capability. Alice's Dina finds them, asks, and replies with the ETA
— without any human routing in between.

This walkthrough traces every hop.

---

## Sequence

### 1. Provider publishes

**Bus 42's Dina** publishes a service profile at
`com.dina.service.profile/self` on its PDS. The record carries:

```json
{
  "$type": "com.dina.service.profile",
  "name": "Bus 42",
  "capabilities": ["eta_query"],
  "isPublic": true,
  "responsePolicy": { "eta_query": "auto" },
  "capabilitySchemas": {
    "eta_query": {
      "params": { "type": "object", "required": ["location"], "properties": {...} },
      "result": { "type": "object", "required": ["eta_minutes", ...] },
      "schemaHash": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
    }
  },
  "updatedAt": "2026-04-17T12:00:00.000Z"
}
```

AppView indexes this record; requesters will see it in search results.

### 2. Requester types a chat command

```
Alice (iOS): /service eta_query when will bus 42 reach me?
```

- `parseCommand` (packages/brain/src/chat/command_parser.ts) identifies
  `intent: 'service'`, `capability: 'eta_query'`, `payload: 'when will bus 42 reach me?'`.
- `handleChat` routes to the installed `ServiceCommandHandler` (wired at
  brain startup — see BRAIN-P2-Q04 WS2 orchestrator).

### 3. Orchestrator searches + dispatches

`ServiceQueryOrchestratorWS2.issueQuery({capability: 'eta_query', params: {...}, viewer: {lat, lng}})`:

- Calls `AppViewClient.searchServices({capability: 'eta_query', lat, lng, radiusKm: 5})`.
- `pickTopCandidate` ranks (by haversine distance + trust score) and picks `did:plc:bus42`.
- Pulls `schema_hash` from the picked profile's `capabilitySchemas.eta_query`.
- Calls `coreClient.sendServiceQuery({toDID, capability, params, queryId: <fresh uuid>, ttlSeconds: 60, schemaHash})`.

Core's `POST /v1/service/query`:
- Computes `idempotency_key = sha256(canonicalJSON({to_did, capability, params}))`.
- Creates a `kind: service_query` workflow task in state `created`.
- Sends the D2D `service.query` to `did:plc:bus42`.
- Transitions task to `running` on successful send.
- Returns `{task_id: 'sq-<id>', query_id, deduped: false}`.

The orchestrator returns **immediately** with `{taskId, queryId, toDID, serviceName: "Bus 42", deduped: false}` — no waiting for a reply.

### 4. Provider receives + executes

Bus 42's Core `receive_pipeline`:
- Validates the envelope (Ed25519 signature, replay cache, etc.).
- `applyServiceIngressDecision` returns `action: 'bypassed'` for `service.query`, opening a 30s provider window.
- Hands the parsed body to Brain's D2D dispatcher → `ServiceHandlerWS2.handleQuery`.

`ServiceHandlerWS2.handleQuery(fromDID, body)`:
- Looks up the capability config (`responsePolicy: 'auto'` — in this example).
- Checks `body.schema_hash` against the locally stored hash (BRAIN-P3-P04 — request-time snapshot).
- Validates `body.params` via `validateEtaQueryParams` (cheap hand-written validator).
- **Auto policy path:** calls `coreClient.createWorkflowTask({kind: 'delegation', payload: <service_query_execution envelope>, correlationId: queryId})`.
- (Review policy path would instead create a `kind: 'approval'` task and notify the operator via Telegram / chat / push.)

The capability runner (currently `createTransitStubInvoker` — OPENCLAW-005) picks up the delegation, computes the ETA deterministically, and calls `coreClient.completeWorkflowTask(taskId, resultJSON, resultSummary)`.

### 5. Response Bridge emits

`WorkflowService.complete` calls `bridgeServiceQueryCompletion` (CORE-P3-I01/I02):
- Recognises `payload.type === 'service_query_execution'`.
- Reconstructs the `ServiceQueryBridgeContext` from payload + task result.
- Invokes the injected `responseBridgeSender` callback.
- Sender builds the D2D `service.response` body: `{query_id, capability, status: 'success', ttl_seconds, result: parsedJSON}`.
- Sender writes to the egress via the provider window opened at ingress.

### 6. Requester receives + renders

Alice's Core `receive_pipeline`:
- Matches the inbound `service.response` against her pending `service_query` task via `findServiceQueryTask(queryId, peerDID, capability, now)`.
- Transitions her task `running → completed`, stores the result JSON, emits a `workflow_event(kind=service_query, needs_delivery=true, details={response_status, capability, service_name, result})`.

Brain's Guardian (BRAIN-P2-W03, pending — simulated in tests):
- Polls `GET /v1/workflow/events?needs_delivery=true`.
- Dispatches the event by kind: `service_query → _handleServiceQueryResult → formatServiceQueryResult(details)`.
- ACKs via `POST /v1/workflow/events/:id/ack`.

`formatServiceQueryResult` renders:

```
Bus 42
45 min to Market & Powell
https://maps.google.com/?q=37.77,-122.41
```

Alice sees this in her chat UI. Total wall-clock time: ~1–3 seconds.

---

## Key properties

- **Idempotent dispatch:** Alice can retry the `/service` command; Core's `idempotency_key` returns the same task id with `deduped: true`, no duplicate D2D.
- **Schema-version-safe:** the hash pinned at query-time survives mid-flight config changes on the provider side.
- **Approval path:** for capabilities with `responsePolicy: 'review'`, an operator must `/service_approve <taskId>` before the delegation spawns. The approval reconciler (5-min cadence) sends `unavailable` + cancels tasks whose operator never approves within TTL.
- **Race-safe completion:** `findServiceQueryTask` matches tasks in both `created` and `running` state, so a response arriving mid-transition doesn't crash the handler.
- **Fail-closed on AppView unavailable:** the service resolver returns `false` on network error, so the contact gate never opens on doubt.

## Reference

- Spec doc: `BUS_DRIVER_IMPLEMENTATION.md`
- Flow diagram: `ARCHITECTURE.md` § 20
- Wire envelope: `DINA_DELEGATION_CONTRACT.md` Appendix A
- Task lifecycles: `DINA_WORKFLOW_CONTROL_PLANE.md` Appendix B
- Capability registry: `CAPABILITIES.md`
