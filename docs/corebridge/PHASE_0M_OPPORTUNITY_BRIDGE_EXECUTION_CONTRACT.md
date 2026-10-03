# Phase 0M — Safe Opportunity Bridge Execution Contract / Idempotent Dry-Run Plan

Status: IMPLEMENTED AS READ-ONLY EXECUTION CONTRACT. No production bridge executed.

## Purpose

Phase 0M converts the verified 0K/0L classification work into a retry-safe apply contract without creating or linking any Opportunity records.

The bridge remains compatibility-only. WorkOrder source facts are preserved exactly; Opportunity receives a proposed snapshot and provenance.

## Cohorts

The verified bridge population is:

- Phase 0K safe candidates: 156
- Phase 0L deterministic historical Won candidates: 272
- proposed safe bridge cohort: 428
- historical conflicts still held for review: 2,617
- Smartsheet Unknown shells excluded: 14

The 272 historical additions are only Completed Sale rows with a valid Order Created date. Their WorkOrder sales_status remains lead; the proposed Opportunity stage is won because the 0L reconciliation contract supplies that derived historical outcome.

## Immutable identity

Every proposed bridge uses the permanent WorkOrder id:

`workorder:<WorkOrder.id>:opportunity:v1`

This value is the Opportunity `creation_request_key`. The same WorkOrder id is also written to `compatibility_work_order_id`.

Customer name, Smartsheet row position, estimate number, title, email, and phone are never used as the create identity.

## Pre-create source snapshot

Before an apply attempt, capture the source fields that determine bridge safety:

- WorkOrder.id
- opportunity_id
- sales_status
- in_pipeline
- current_task_description
- date_order_created
- updated_date

The apply phase must re-read the WorkOrder immediately before creation. If any captured field changed, that row is held and re-audited. A nonblank opportunity_id is never overwritten.

## Receipt recovery

Before any create, query Opportunity by both:

- creation_request_key
- compatibility_work_order_id

Outcomes:

- neither exists: creation may proceed after the source snapshot still matches;
- both resolve to the same Opportunity with the expected values: recover/reuse it;
- either identity returns more than one record: stop for review;
- the two identities resolve to different records: stop for review;
- an existing Opportunity has only one of the expected identities: stop for review.

After an unknown/timeout create response, the apply phase must query these identities again before deciding whether another create is allowed.

## Link compare-and-set

After an Opportunity is known to exist:

1. re-read WorkOrder;
2. verify the source snapshot still matches;
3. verify WorkOrder.opportunity_id is still blank or already equals the same Opportunity;
4. only then set opportunity_id;
5. re-read both records and verify the two-way compatibility relationship.

The bridge never rewrites sales_status, Current Task, Order Created, customer text, Smartsheet identity, estimate identity, or other original WorkOrder source fields.

## Historical Won proposal

For the 272 0L rows, the proposed Opportunity receives:

- stage: won
- source_summary.historical_reconciliation.version: 1
- source_summary.historical_reconciliation.decision: deterministic_won
- preserved original sales_status
- preserved original Current Task
- preserved original Order Created date

This derived stage is written only to the future Opportunity. It does not clean up the WorkOrder.

## Recovery guarantees

The later apply phase must be safe under:

- repeated execution;
- create response timeout;
- link response timeout;
- concurrent Sales edits;
- an Opportunity created between dry-run and apply;
- a WorkOrder linked by another actor between reads;
- duplicate receipt or compatibility identities.

Any uncertainty fails closed to review rather than guessing.

## Implementation

Added read-only helper:

- `base44/shared/opportunityBridgeExecutionPlan.mjs`

It currently defines the immutable receipt key and the WorkOrder source snapshot used by the future apply gate.

No backend write function is added in 0M.

## Explicitly unchanged

- no Opportunity records created;
- no WorkOrder records updated;
- no opportunity_id links written;
- no Customer/Estimate/Smartsheet records changed;
- no source Sales fields normalized;
- no publish/deploy.

## Exact next phase — 0N

Phase 0N should add and verify the full dry-run planner around this contract: combine the 0K audit and 0L reconciliation in code, emit the exact proposed/hold rows, add duplicate-receipt and stale-source fixtures, and re-run the live 428/2,617 cohort verification. It must remain non-writing. Only after that dry-run planner is verified should a separately approved apply phase be considered.
