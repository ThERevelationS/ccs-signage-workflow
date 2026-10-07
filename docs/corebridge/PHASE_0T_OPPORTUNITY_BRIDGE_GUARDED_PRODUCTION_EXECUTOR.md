# Phase 0T — Guarded Production Apply Executor / Pre-Pilot Authorization Harness

Status: IMPLEMENTED AND VERIFIED IN NONPRODUCTION HARNESS. PRODUCTION APPLY REMAINS HARD-DISABLED.

## Purpose

Phase 0T wires the previously validated Opportunity bridge apply engine to the durable receipt ledger and secondary-confirmation foundations created in 0S.

This phase adds the guarded production execution path but does **not** authorize or execute the first production migration record.

The production kill switch remains:

`OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED = false`

## New guarded executor

Source:

`base44/shared/opportunityBridgeProductionExecutor.mjs`

Policy version:

`0T-v1`

The executor requires every pre-pilot condition to pass before it can write even a durable receipt:

1. production apply kill switch explicitly enabled in source;
2. exact one-record pilot batch;
3. requested WorkOrder is the freshly selected first pilot candidate;
4. plan is no more than five minutes old;
5. exact authenticated admin actor is present;
6. durable receipt ledger has zero identity anomalies;
7. durable receipt ledger has zero unresolved planned/started/held/failed receipts;
8. secondary confirmation matches the exact actor, rollout run, fresh plan and exact one-record batch.

If any check fails, the executor returns `LOCKED` with `write_attempted:false`.

The client cannot override the production kill switch.

## Production endpoint

Backend function:

`base44/functions/opportunityBridgeProductionApply/entry.ts`

Supported actions:

- `prepare_pilot` — read-only preflight; recomputes the complete live bridge plan, current first pilot candidate, receipt state and confirmation binding.
- `apply_pilot` — guarded executor entry point.

The endpoint:

- is admin-only;
- recomputes the live dry-run plan server-side;
- reads all required WorkOrders, Customers, Estimates, Opportunities and durable receipts;
- never trusts a client-supplied Opportunity proposal;
- never accepts a client-supplied apply-enabled flag;
- binds apply authorization to the exact current first pilot candidate;
- uses `updated_date` compare-and-set protection for the WorkOrder Opportunity link;
- creates Opportunities only through the existing idempotent apply engine;
- writes durable receipts only after every pre-pilot authorization gate passes.

With the current policy, `apply_pilot` cannot reach the receipt or business-record write path.

No frontend caller or Apply button was added in 0T.

## Receipt lifecycle during a future authorized execution

Only after authorization:

1. claim or recover the deterministic durable receipt;
2. append a `started` attempt using compare-and-set receipt versioning;
3. execute the existing Opportunity/WorkOrder apply engine;
4. append the final `linked`, `already_linked`, `held` or `failed` outcome;
5. preserve all uncertain outcomes for reconciliation instead of deleting/recreating records.

A terminal `linked` / `already_linked` receipt is allowed to converge across the expected post-link WorkOrder snapshot change when the Opportunity proposal fingerprint still matches. This prevents a safe retry from falsely treating the expected Opportunity link itself as source drift.

## Retry/reconciliation rule

Any receipt in `planned`, `started`, `opportunity_ready`, `held` or `failed` state makes the durable ledger unresolved.

The pre-pilot executor blocks while any unresolved receipt exists.

This implements the existing policy:

`replan_and_reconcile_before_retry`

No uncertain receipt is silently replayed or deleted.

## Nonproduction harness

Validation:

`scripts/validate-opportunity-bridge-production-executor.mjs`

The in-memory harness proves:

- hard kill switch blocks before any write;
- wrong requested record blocks before any write;
- wrong confirmation phrase blocks before any write;
- stale plan blocks before any write;
- receipt identity anomaly blocks before any write;
- unresolved prior receipt blocks before any write;
- wrong admin actor blocks before any write;
- exact authorized one-record execution creates one Opportunity, one WorkOrder link and one durable receipt;
- receipt attempt history records started + linked;
- confirmation phrase is never persisted;
- terminal receipt identity safely converges across the expected post-link snapshot change;
- completed records are no longer eligible for the proposed-create first-pilot selector;
- endpoint source cannot accept a client apply-enabled override.

The harness uses only in-memory records. It does not mutate production.

## Readiness integration

The production readiness policy is now `0T-v1`.

New rollout check:

- `guarded_production_executor_wired`

New durable reconciliation check:

- `durable_receipt_ledger_reconciled`

Expected clean-state readiness after 0T:

- technical readiness: READY
- receipt schema: READY
- receipt identity state: READY
- receipt reconciliation state: READY
- secondary confirmation: READY
- guarded executor: READY
- production apply enabled: NO
- rollout readiness: LOCKED
- overall decision: NO_GO

The NO_GO is intentional and is controlled by the explicit source kill switch.

## Explicitly unchanged

0T does not:

- run the production pilot;
- create a production Opportunity;
- write a production WorkOrder `opportunity_id`;
- create a production bridge receipt;
- alter historical Sales facts;
- alter Customer identity;
- alter Estimate formulas;
- alter Sales Pipeline behavior;
- alter Smartsheet authority/configuration;
- add a public/frontend Apply control;
- publish/deploy the frontend.

## Next phase

Phase 0U should be:

**Final Single-Record Pilot Review / Explicit Authorization Boundary**

0U should perform a fresh live preflight, freeze/report the exact one-record candidate, current source snapshot, proposed Opportunity, canonical Customer evidence, durable receipt state and confirmation binding.

The actual production write must remain separate and require explicit user authorization after that exact record is presented for review.
