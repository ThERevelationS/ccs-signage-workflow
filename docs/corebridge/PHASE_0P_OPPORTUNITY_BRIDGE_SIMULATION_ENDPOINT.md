# Phase 0P — Guarded Base44 Opportunity Bridge Simulation Endpoint

Status: IMPLEMENTED AND VERIFIED AS ADMIN-ONLY, READ-ONLY, SIMULATION-ONLY BACKEND.

No production apply path exists in this phase.

## Purpose

Phase 0P connects the verified 0N planning logic to real Base44 production reads so an administrator can request a fresh server-side bridge simulation without trusting client-supplied Opportunity payloads.

It deliberately does **not** connect the Phase 0O apply engine to live entities.

## Added

- `base44/shared/opportunityBridgeSimulationPolicy.mjs`
- `base44/functions/opportunityBridgeSimulation/entry.ts`
- `scripts/validate-opportunity-bridge-simulation-endpoint.mjs`

## Authorization

The endpoint requires a valid Base44 session and:

`actor.role === "admin"`

All entity reads occur through service role only after that authorization check.

## Hard-disabled write path

Production writes are disabled at multiple layers.

### Source-level separation

The endpoint imports:

- `buildOpportunityBridgeDryRunPlan`

It does **not** import:

- `opportunityBridgeApplyEngine.mjs`
- `executeOpportunityBridgePlanRow`

The endpoint source contains no entity:

- create
- update
- updateMany
- delete
- deleteMany
- bulk create

call.

This means request parameters cannot activate a hidden write branch because no write branch exists in the endpoint source.

### Request policy

The policy rejects write-shaped request fields including:

- apply
- write
- commit
- execute
- persist
- create
- update
- delete
- link
- Opportunity payload/proposal injection

It also rejects:

- `mode` other than `simulation`
- `dry_run: false`
- `simulate: false`

The server response explicitly reports:

- `simulation_only: true`
- `write_capability: false`
- `apply_path_enabled: false`

## Backend-authoritative planning

The client may not supply an Opportunity payload.

The endpoint freshly reads:

- non-rider, non-deleted WorkOrders
- Customers
- AllInOneEstimates
- Opportunities

and runs the verified 0N planner inside the backend.

Therefore bridge identity, Customer resolution, historical reconciliation, receipt state, proposed Opportunity content, and hold reasons are generated from current authoritative records rather than trusted from the request.

## Read safety ceilings

Entity pagination uses 500-row pages with a hard 10,000-row ceiling per entity.

If a source exceeds that ceiling, the simulation fails rather than silently planning from a partial dataset.

## Response limits

The endpoint can compute the full summary while returning only a small inspected subset.

Request controls are limited to:

- `limit` — positive integer, clamped to **25**
- `work_order_ids` — maximum **25 unique ids**
- `actions` — allowlisted dry-run action filters only

Default returned actions are:

- proposed_create
- proposed_recover_link
- already_linked

Held/excluded rows can be inspected explicitly with an action filter.

## Output

The backend returns:

- live entity counts
- full 0N summary
- source 0K audit summary
- selected rows up to the response limit
- backend-computed proposed Opportunity payloads
- source snapshots
- receipt state
- historical reconciliation result
- hold reasons
- existing Opportunity id when applicable

No audit record is persisted in 0P because even audit persistence would create a write-capable endpoint.

## Regression requirements

The validation script proves:

- default mode is simulation
- response limit is capped
- WorkOrder id list is capped and duplicate ids are rejected
- unsupported action filters are rejected
- apply/write/execute/commit requests are rejected
- client Opportunity payloads are rejected
- disabling dry-run/simulation is rejected
- endpoint remains admin-only
- endpoint does not import the apply engine
- endpoint contains no Base44 entity write calls
- live plan is generated from service-role reads

## Explicitly unchanged

- no Opportunity creation
- no WorkOrder opportunity_id writes
- no Customer changes
- no Estimate changes
- no Smartsheet changes
- no production migration receipt rows
- no Sales Pipeline behavior changes
- no publish/deploy

## Exact next phase — 0Q

**Phase 0Q — Simulation Invocation Surface + Operator Review UX**

Build a tightly scoped admin-facing way to invoke the simulation endpoint and review:

- current safe cohort count
- historical deterministic Won count
- held cohort count and reasons
- per-row source snapshot
- proposed Opportunity
- immutable receipt identity
- live drift since the previous simulation

0Q must still have no apply button and no production write capability.

A later explicit phase can design production enablement only after the operator review surface and final rollout gates are verified.
