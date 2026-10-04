# Phase 0O — Opportunity Bridge Apply Engine / Nonproduction Harness

Status: IMPLEMENTED AND VERIFIED AS A PURE APPLY ENGINE + IN-MEMORY HARNESS.

No production bridge function was exposed or executed.

## Purpose

Phase 0O converts the verified 0M execution contract and 0N dry-run planner into an executable migration algorithm without connecting that algorithm to live Base44 entities.

The result is a dependency-injected apply engine that can be tested against simulated entity behavior, including timeouts and concurrency races, before any production-capable backend function is introduced.

## Implementation

Added:

- `base44/shared/opportunityBridgeApplyEngine.mjs`
- `scripts/validate-opportunity-bridge-apply-engine.mjs`

The engine has no Base44 SDK import and no direct entity access.

It receives an adapter with exactly these operations:

- `getWorkOrder(id)`
- `findOpportunities({ workOrderId, receiptKey })`
- `createOpportunity(payload)`
- `getOpportunity(id)`
- `linkWorkOrderIfUnchanged({ workOrderId, opportunityId, expectedSnapshot })`

That makes the migration algorithm independently testable and prevents the Phase 0O harness from writing production data.

## Apply sequence

For an eligible 0N plan row:

1. validate immutable proposal identity;
2. fresh-read the WorkOrder;
3. read Opportunity receipts by BOTH `creation_request_key` and `compatibility_work_order_id`;
4. fail closed on duplicate, split, incomplete, or invalid receipt identity;
5. recognize an already-complete two-way bridge before stale-snapshot checks so repeated execution is idempotent;
6. for an unlinked WorkOrder, verify the fresh source still matches the pre-create snapshot;
7. reuse an exact existing Opportunity or create one;
8. after a create response OR create error, re-query immutable receipt identities;
9. require the recovered Opportunity to match the full proposed payload;
10. fresh-read the WorkOrder again before linking;
11. re-check the original source snapshot;
12. invoke compare-and-set linking through the adapter;
13. even if the link call errors, re-read WorkOrder + Opportunity to recover a lost acknowledgment;
14. return a per-row auditable result object.

The engine never deletes duplicates and never retries blindly after an uncertain result.

## Idempotency correction discovered in 0O

The original pre-link WorkOrder snapshot contains blank `opportunity_id` and its pre-link `updated_date`.

A successful first bridge necessarily changes both fields.

Therefore a repeated identical run must first check whether:

- WorkOrder.opportunity_id points to an Opportunity;
- that Opportunity has the exact immutable receipt key; and
- its compatibility_work_order_id points back to the same WorkOrder.

When that two-way identity is already complete, the engine reports `already_linked` and performs no write.

Without this ordering, a correct retry would have been falsely classified as stale.

## Per-row results

Results use one of:

- `linked`
- `already_linked`
- `held`

Each result carries:

- immutable operation key;
- WorkOrder id;
- planned action;
- source snapshot;
- result code;
- Opportunity id when known;
- create/link recovery status when relevant;
- error text only when needed for an uncertain/recovered operation.

These are result objects only in 0O. No production receipt entity is created yet.

## Nonproduction harness coverage

The in-memory harness proves:

### Normal create + link

- one Opportunity is created;
- WorkOrder links to it;
- exact immutable receipt identities are preserved.

### Repeated execution

Running the exact same pre-link plan again:

- creates no duplicate;
- reports `already_linked`;
- preserves the existing bridge.

### Lost create acknowledgment

The simulated store:

1. durably creates the Opportunity;
2. throws before acknowledging success.

The engine re-queries immutable identities, recovers the created Opportunity, and continues without a second create.

### Lost link acknowledgment

The simulated store:

1. durably sets WorkOrder.opportunity_id;
2. throws before acknowledging success.

The engine re-reads both sides and reports a recovered successful link.

### Stale source before create

If a Sales field changes after planning but before apply:

- the row is held;
- no Opportunity is created.

### Concurrent source change after create but before link

If a Sales field changes after Opportunity creation:

- the created Opportunity is preserved as an auditable receipt;
- WorkOrder is NOT linked;
- the row is held for re-audit;
- nothing is deleted to hide the race.

### Duplicate receipt identity

If multiple Opportunities share the bridge identity:

- the row is held;
- no duplicate is deleted or auto-selected.

### Exact existing Opportunity recovery

If the exact Opportunity already exists but WorkOrder is unlinked:

- no second Opportunity is created;
- the existing record is reused;
- WorkOrder is linked only through the guarded link operation.

### Existing Opportunity payload mismatch

If immutable identities resolve to an Opportunity whose proposed migration payload differs:

- the row is held;
- WorkOrder remains unlinked;
- the engine does not overwrite that Opportunity.

## Base44 production adapter design

A future production adapter should map the pure contract as follows.

### getWorkOrder

Use service-role `WorkOrder.get(id)`.

### findOpportunities

Query BOTH:

- `Opportunity.filter({ creation_request_key: receiptKey })`
- `Opportunity.filter({ compatibility_work_order_id: workOrderId })`

Combine by permanent Opportunity id before passing records to the engine.

Do not rely on either identity alone.

### createOpportunity

Use the existing foundation create-recovery semantics. After any create result or exception, immutable identities must be re-read before another create is considered.

### linkWorkOrderIfUnchanged

Use `WorkOrder.updateMany` with a compare-and-set query including:

- permanent WorkOrder id;
- expected `updated_date`;
- expected blank `opportunity_id`;
- source fields that are practical to include as an additional guard where supported.

Then re-read the WorkOrder.

An update count of zero is not permission to retry blindly; the source must be re-read and classified.

### getOpportunity

Use service-role `Opportunity.get(id)` and verify:

- creation_request_key;
- compatibility_work_order_id.

## Production safety

Phase 0O deliberately does NOT add a callable production bridge endpoint.

That keeps the verified algorithm from becoming accidentally executable against the live 430-row cohort before the Base44-specific adapter, authorization boundary, batching policy, audit persistence, and rollout controls are separately reviewed.

## Explicitly unchanged

- no Opportunity records created;
- no WorkOrder opportunity_id links written;
- no Customer changes;
- no Estimate changes;
- no Smartsheet changes;
- no WorkOrder source Sales facts rewritten;
- no production migration receipt rows;
- no publish/deploy.

## Exact next phase — 0P

**Phase 0P — Guarded Base44 Bridge Backend + Simulation-Only Endpoint**

Build the Base44-specific adapter around the verified 0O engine, but keep it incapable of production apply.

Required safeguards:

1. admin/service-role authorization;
2. explicit simulation-only mode;
3. strict per-run row cap;
4. fresh 0N planning inside the backend;
5. no client-supplied Opportunity payload authority;
6. backend-generated immutable receipt identity;
7. structured per-row simulated result/audit output;
8. production-write path hard-disabled in source;
9. tests proving a caller cannot enable apply with request parameters;
10. no publish and no production backfill.

Only after that guarded backend is verified should a later phase consider enabling a tightly controlled production apply mode.
