# Phase 0N — Full Opportunity Bridge Dry-Run Planner

Status: IMPLEMENTED AND VERIFIED AS READ-ONLY PLANNING LOGIC.

## Purpose

Phase 0N combines the verified Phase 0K WorkOrder → Opportunity audit, Phase 0L historical Sales reconciliation, and Phase 0M execution contract into one non-writing planner.

It does not create, update, link, merge, backfill, publish, or deploy anything.

## Planner outputs

Every examined WorkOrder receives one dry-run action:

- `proposed_create` — safe candidate with no existing Opportunity receipt;
- `proposed_recover_link` — the exact Opportunity already exists by both immutable identities but WorkOrder is not linked yet;
- `already_linked` — WorkOrder and Opportunity already form the expected bridge;
- `hold` — source, relationship, receipt, or reconciliation evidence is unsafe/ambiguous;
- `excluded` — not Sales scope or an Unknown Smartsheet import shell.

## Immutable bridge identity

The planner uses only:

`workorder:<WorkOrder.id>:opportunity:v1`

as the Opportunity `creation_request_key`, with the permanent WorkOrder id in `compatibility_work_order_id`.

It does not use name, email, phone, row position, estimate number, or fuzzy similarity as create identity.

## 0K + 0L composition

A Phase 0K `safe_auto_bridge` candidate remains eligible.

A Phase 0K `manual_review` row may become eligible only when:

1. its only 0K blocker is the open-status / terminal-task conflict; and
2. Phase 0L returns `deterministic_won`.

The verified historical deterministic rule remains narrow:

- Current Task begins Completed Sale; and
- Date Order Created is a valid ISO calendar date.

The proposed Opportunity stage becomes `won`, while the original WorkOrder `sales_status`, task text, and Order Created value remain preserved in source provenance and are not rewritten.

Lost and Closed task families remain held because current task text alone is explicitly non-authoritative and no authoritative loss outcome source is presently available.

## Stale-source protection

The planner can consume an earlier WorkOrder source snapshot containing:

- id
- opportunity_id
- sales_status
- in_pipeline
- current_task_description
- date_order_created
- updated_date

If the current WorkOrder differs from that snapshot, the row becomes `hold: stale_source_snapshot`.

This models the mandatory apply-time re-read gate without performing a write.

## Receipt / duplicate protection

Before a future create, Opportunity must be checked by both:

- creation_request_key
- compatibility_work_order_id

The planner classifies:

- clear — no existing receipt;
- matched_existing — exactly one Opportunity has both expected identities;
- duplicate_identity — either identity matches multiple records;
- identity_conflict — receipt identity and compatibility identity point to different Opportunities;
- incomplete_existing_identity — an existing record has only one expected identity.

All ambiguous states fail closed to `hold`.

A matched existing Opportunity becomes `proposed_recover_link` when WorkOrder is still unlinked, or `already_linked` when WorkOrder already points to that same Opportunity.

## Verification fixtures

`scripts/validate-opportunity-bridge-dry-run-planner.mjs` covers:

- ordinary safe create proposal;
- deterministic historical Won promotion;
- preservation of original Sales status in provenance;
- Lost / Closed / unsupported Completed Sale hold behavior;
- stale source detection;
- duplicate receipt identity;
- split receipt/compatibility identity conflict;
- incomplete existing receipt identity;
- safe uncertain-create recovery / reuse;
- already-linked idempotency;
- Smartsheet Unknown shell exclusion.

## Live verification contract

The live read-only Phase 0N run loads:

- all non-rider, non-deleted WorkOrders;
- all Customers;
- all AllInOneEstimates;
- all Opportunities.

The last verified Phase 0M fixture was:

- 3,045 true Sales candidates;
- 428 proposed safe bridge rows total;
- 272 of those deterministic historical Won rows from 0L;
- 2,617 historical status conflicts still held;
- 14 Unknown Smartsheet shells excluded;
- zero production Opportunity records.

Any live drift is reported rather than forced back to these fixtures.

## Live production verification — 2026-10-03

Read-only verification after the planner implementation confirmed the Phase 0M fixture has not drifted:

- non-rider, non-deleted WorkOrders examined: **3,059**
- true Sales candidates: **3,045**
- Phase 0K safe candidates: **156**
- current open-status / terminal-task conflicts: **2,889**
- deterministic historical Won additions: **272**
- proposed safe bridge cohort: **428**
- historical conflicts still held: **2,617**
- terminal conflict families: Completed Sale **1,036**, Lost **1,132**, Closed **721**
- Unknown Smartsheet shells excluded: **14**
- Customers loaded: **898**
- AllInOneEstimates loaded: **21**
- Opportunity records: **0**
- existing WorkOrders with opportunity_id: **0**

No production record was changed by this verification.

## Explicitly unchanged

- no Opportunity creation;
- no WorkOrder opportunity_id writes;
- no WorkOrder Sales-field cleanup;
- no Customer merge or alias changes;
- no Estimate changes;
- no Smartsheet changes;
- no Sales Pipeline behavior changes;
- no publish/deploy.

## Exact next phase — 0O

**Phase 0O — Opportunity Bridge Apply Function Design + Nonproduction Harness**

0O should still avoid production backfill.

It should design and test the backend apply function around the 0M/0N contract, including:

1. exact receipt recovery before create;
2. fresh WorkOrder snapshot verification;
3. retry-safe Opportunity creation;
4. compare-and-set WorkOrder.opportunity_id linking;
5. post-write two-way verification;
6. timeout and lost-acknowledgment recovery;
7. duplicate identity fail-closed behavior;
8. per-row auditable result receipts;
9. a nonproduction/simulated harness proving repeated execution is idempotent.

No production bridge cohort should be applied until that harness is independently verified and an explicit apply phase is authorized.
