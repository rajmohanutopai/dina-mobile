# Dina Service Capabilities

Dina-mobile public services advertise one or more **capabilities** on their
AT-Proto profile record. A capability is a typed request/response contract:
both sides know the `params` schema, the `result` schema, and a `schemaHash`
that pins the exact version at the time of query.

Discovery: `AppViewClient.searchServices({capability, lat?, lng?, radiusKm?, q?})`
returns a ranked `ServiceProfile[]` whose `capabilitySchemas[<name>]` carries
`{params, result, schemaHash}` per capability. Callers pin the `schemaHash`
when issuing `query_service` so the provider can detect version skew.

Registry: every capability is registered in
`packages/brain/src/service/capabilities/registry.ts` via `CapabilityDef`,
which binds:

- `validateParams(params) → string | null` — hot-path request validation.
- `defaultTtlSeconds` — the fallback TTL when the caller omits `ttl_seconds`.
- JSON-schema exports for publisher/discovery use.

---

## `eta_query`

Ask a public transit service when its next vehicle will reach a location.

### Params (`EtaQueryParams`)

| Field | Type | Required | Description |
|---|---|---|---|
| `location` | `{lat, lng}` | ✅ | Where the requester is standing. `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`. |
| `route_id` | `string` | optional | Restricts the response to a specific route (bus number, metro line). |

### Result (`EtaQueryResult`)

| Field | Type | Required | Description |
|---|---|---|---|
| `eta_minutes` | `number ≥ 0` | ✅ | Minutes until the next vehicle passes the nearest stop. |
| `vehicle_type` | `string` | ✅ | `"Bus"`, `"Tram"`, `"Metro"`, etc. |
| `route_name` | `string` | ✅ | Human-readable route label (e.g. `"42"`, `"Red Line"`). |
| `current_location` | `{lat, lng}` | optional | Where the vehicle is now. |
| `stop_name` | `string` | optional | Name of the nearest stop to the requester. |
| `stop_distance_m` | `number ≥ 0` | optional | Walking distance to that stop. |
| `map_url` | `string` | optional | Plain URL to a map showing the vehicle's position (no Markdown wrapping). |
| `status` | `"on_route"` \| `"not_on_route"` \| `"out_of_service"` \| `"not_found"` | optional | Explicit error sub-status when the default `on_route` doesn't apply. |
| `message` | `string` | optional | Human-readable explanation for non-`on_route` statuses. |

### Defaults

- `defaultTtlSeconds`: **60** — queries expire 60 seconds after issuance unless
  the caller supplies a higher value (`ttl_seconds ≤ 300`).
- Validation is hand-written (`validateEtaQueryParams` / `validateEtaQueryResult`);
  a `Phase-4` pass will swap these for `ajv` driven by the schema exports.

### Formatted output

`formatServiceQueryResult` in `brain/src/service/result_formatter.ts` renders
`eta_query` responses as plain multi-line text (Telegram-friendly, no Markdown):

```
Bus 42
45 min to Market & Powell
https://maps.google.com/?q=37.77,-122.41
```

### Reference implementation

`createTransitStubInvoker` in `brain/src/service/transit_stub_invoker.ts` is a
deterministic reference implementation with a bundled route table + schedule
model. `nowFn` is injectable so tests lock the clock without mutating process
env.

---

## Adding a new capability

1. Define params + result interfaces in `packages/brain/src/service/capabilities/<cap>.ts`.
2. Export JSON-schema objects (`<Cap>ParamsSchema`, `<Cap>ResultSchema`).
3. Write hand-written validators (`validate<Cap>Params`, `validate<Cap>Result`).
4. Register in `registry.ts:SUPPORTED_CAPABILITIES` with `defaultTtlSeconds`.
5. Add a per-capability formatter in `result_formatter.ts:FORMATTERS` (or rely
   on the generic JSON-truncated fallback).
6. Publish via `ServicePublisher` — requesters will pick up the new capability
   on their next `search_public_services` call.
