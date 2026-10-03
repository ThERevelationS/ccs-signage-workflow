# Phase 0J — Opportunity / Intake / Estimating Request Additive Foundation

Status: IMPLEMENTED — dormant foundation only.

## Scope

Phase 0J implements the additive source/schema and persistence foundation defined by Phase 0I without changing current Sales Pipeline, Smartsheet, Estimator, Customer, or WorkOrder runtime ownership.

No production business records are created, migrated, backfilled, linked, merged, deleted, or rewritten by this phase.

## Added entities

### Opportunity

Canonical future commercial pursuit record.

Key characteristics:

- stable retry-safe creation_request_key
- canonical Customer link when verified
- future CustomerContact / CustomerLocation link slots without fabricating IDs
- transitional compatibility_work_order_id
- primary intake/request links
- commercial stage and timestamps
- sales owner/source/origination
- budget, desired dates and priority
- survey/permit/install/removal/electrical requirements
- owner/tenant/agent relationship
- next action and internal notes
- attachment references rather than forced duplicate file copies

Opportunity is backend-only in this dormant phase.

### OpportunityIntake

Inbound source/provenance event.

Supports manual, existing customer, phone, email, website, Smartsheet, repeat customer, walk-in, historical and future integration sources.

Important rules:

- may exist before opportunity_id is resolved
- stable creation_request_key
- source system/external identity fields
- source fingerprint and raw source reference
- captured_fields keeps unverified source facts separate from canonical identity
- no payment credentials or full card/bank authentication data
- no automatic customer merge semantics

OpportunityIntake is backend-only in this dormant phase.

### EstimatingRequest

Controlled Opportunity → Estimating handoff.

Key characteristics:

- stable creation_request_key
- required opportunity_id
- Customer/Contact/Location links when resolved
- Estimate and compatibility WorkOrder links
- estimating workflow status
- assignment, priority and desired dates
- requirement summary
- handoff_snapshot and version
- attachment references
- completion/cancellation audit fields

The shared persistence layer freezes handoff_snapshot and handoff_snapshot_version after the request leaves draft. A submitted/ready handoff must be superseded/revised rather than silently rewriting what Estimating originally received.

EstimatingRequest is backend-only in this dormant phase.

## Additive compatibility links

WorkOrder now has nullable:

- opportunity_id
- estimating_request_id

AllInOneEstimate now has nullable:

- opportunity_id
- estimating_request_id

These fields are additive only. No existing records are backfilled in 0J. Existing estimate_id, work_order_id, customer_id, Smartsheet IDs, client_name and all current Sales fields remain untouched.

## Persistence contract

base44/shared/opportunityFoundationPersistence.mjs provides:

- creation_request_key validation/query construction
- retry-safe create recovery
- ambiguity detection that never auto-deletes duplicate records
- conflict-safe compare-and-set field replacement using updated_date
- safe uncertain-write recovery
- frozen Estimating Request handoff protection
- relationship consistency diagnostics for Opportunity / Intake / Request / Estimate / WorkOrder link chains

This intentionally follows existing CCS WorkOrder/Estimate recovery patterns.

## Permissions

All three new entities use backend-only RLS while dormant.

No existing page can accidentally begin using or mutating the new foundation merely because schemas now exist.

Permissions should be deliberately opened through a later application/API surface only when the corresponding UI workflow is implemented and tested.

## Explicitly unchanged

- Sales Pipeline still reads/writes WorkOrder
- SalesOpportunityDialog still operates on WorkOrder
- Smartsheet Sales mirror still owns its existing WorkOrder links/snapshots
- Smartsheet create/pull/push behavior is unchanged
- spreadsheet import remains WorkOrder + ImportJob
- Customer matching/dedupe behavior is unchanged
- NewAllInOneEstimate pipeline sync behavior is unchanged
- Estimate formulas/pricing/BOM are unchanged
- approved Estimate → WorkOrder conversion is unchanged
- CustomerInfo and PendingImport remain legacy/retired
- no production data backfill or historical migration is run
- nothing is published/deployed by this phase

## Validation

scripts/validate-opportunity-foundation.mjs verifies:

- required schema contracts
- new WorkOrder/Estimate links remain optional
- backend-only RLS
- intake may exist before Opportunity resolution
- retry-safe create reuse
- uncertain create recovery
- duplicate-create ambiguity fails closed without deletion
- conflict-safe updates preserve concurrent values
- submitted Estimating Request handoff snapshots cannot be rewritten
- cross-record relationship diagnostics detect contradictory links

## Exact next phase — 0K

**Phase 0K — WorkOrder ↔ Opportunity Compatibility Bridge / Dry-Run Candidate Audit**

0K should remain non-destructive.

It should:

1. inspect fresh current Sales/Smartsheet state;
2. build a read-only candidate mapper from existing non-rider Sales WorkOrders to proposed Opportunity records;
3. classify candidates by evidence strength using stable WorkOrder identity, estimate_id, customer_id, Smartsheet row/sheet IDs and approved customer mappings;
4. never treat company name, email, phone or fuzzy similarity alone as authoritative;
5. produce dry-run counts and review reasons without writing Opportunity, WorkOrder or Customer records;
6. define exactly which WorkOrders are safe for later automatic bridge creation versus manual review;
7. add parity/regression fixtures for Sales stage/source/owner/next-action preservation;
8. leave live Sales Pipeline and Smartsheet behavior unchanged;
9. checkpoint the verified dry-run bridge logic.

0K should end with a trustworthy proposed mapping plan, not a production backfill.
