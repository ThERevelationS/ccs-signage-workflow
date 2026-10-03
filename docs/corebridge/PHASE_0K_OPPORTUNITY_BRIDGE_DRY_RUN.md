# Phase 0K — WorkOrder ↔ Opportunity Compatibility Bridge / Dry-Run Candidate Audit

Status: IMPLEMENTED AND VERIFIED — read-only bridge analysis only.

## Purpose

Phase 0K determines how existing WorkOrder-backed Sales Pipeline records can later be represented by canonical Opportunity records without changing production data or changing current Sales Pipeline/Smartsheet ownership.

This phase does **not** create Opportunity records, backfill WorkOrder links, update Customers, change Smartsheet rows, change Estimate behavior, or publish/deploy anything.

## Source-of-truth rules preserved

The dry-run bridge follows the existing Sales Pipeline record-scope behavior:

- current: `in_pipeline === true`, status is not won/lost, and the row is not an Unknown Smartsheet import shell;
- outcome: `in_pipeline === true` and status is won/lost;
- legacy history: not modern/current-pipeline and task begins with Lost, Completed Sale, or Closed;
- Unknown Smartsheet import shells remain excluded;
- other WorkOrders are not silently treated as Opportunities.

The validation fixture imports the current `salesRecordScopes.js` helper and checks classification parity.

## Stable identity / evidence hierarchy

The bridge never uses company name, email, phone, or fuzzy similarity alone to establish a canonical Customer or merge business identity.

Allowed strong/stable evidence:

1. WorkOrder.id — immutable bridge source identity.
2. complete Smartsheet sheet + row identity.
3. unique Estimate id with a non-contradictory Estimate relationship.
4. existing verified WorkOrder.customer_id.
5. exact Customer.legacy_client_names mapping because those names are already recorded as reconciled/approved aliases.
6. sales_import_source_id as additional source provenance.

An unresolved Customer is allowed. A valid Opportunity can later exist with customer_id blank while identity is reviewed.

## Automatic bridge blockers

A candidate is held for manual review if any of these are detected:

- duplicate Estimate identity among Sales candidates;
- missing referenced Estimate;
- Estimate.work_order_id points to a different WorkOrder;
- Estimate Customer conflicts with the resolved Customer anchor;
- Estimate already points to a different Opportunity;
- partial/malformed Smartsheet identity;
- duplicate Smartsheet sheet/row identity;
- duplicate sales_import_source_id;
- WorkOrder.customer_id points to a missing Customer;
- one approved legacy alias maps to multiple Customers;
- existing WorkOrder opportunity_id points to a missing/conflicting Opportunity;
- missing WorkOrder/display identity;
- current/open status conflicts with terminal task text;
- won/lost status conflicts with contradictory terminal task text;
- legacy task begins with generic Closed and therefore does not safely identify won vs lost.

No duplicate/ambiguous record is auto-deleted or auto-merged.

## Proposed Opportunity mapping

The mapper produces a proposal only; it does not persist it.

Preserved fields include:

- compatibility WorkOrder id;
- captured customer display name;
- verified/approved Customer id when available;
- title and job description;
- Sales owner;
- lead_source and origination as separate source facts;
- Sales status → Opportunity stage where the source is unambiguous;
- permit/install/removal/electrical requirement evidence;
- property relationship evidence;
- next action, due date and assignee;
- Sales activity/stage timestamps when they are valid source timestamps;
- Smartsheet identity;
- Estimate/Customer source links;
- source Sales status;
- current pipeline/completed flags;
- initial contact / estimate sent / order created / expected close / close / follow-up dates;
- lost reason;
- contact fields;
- raw budget_less_than value.

`budget_less_than` is deliberately preserved only in source_summary. It is **not** silently converted into Opportunity.budget_amount because its semantics are not guaranteed to mean an exact budget.

## Live read-only audit — 2026-10-03

The verified production read used:

- all non-rider, non-deleted WorkOrders;
- all 898 Customer records;
- all 21 AllInOneEstimate records;
- current Opportunity records;
- no writes.

### Population

- WorkOrders examined: **3,059**
- Current Sales scope: **3,043**
- Trusted won/lost outcomes: **0**
- Legacy-history Sales rows: **2**
- Smartsheet Unknown import shells: **14**
- True Sales bridge candidates: **3,045**
- Existing Opportunity records: **0**

Every one of the 3,045 true Sales candidates currently has a strong stable source anchor, principally the complete Smartsheet sheet/row identity.

### Dry-run decision

- Safe automatic bridge candidates: **156**
  - 154 current Sales rows
  - 2 legacy-history Completed Sale rows
- Manual review required: **2,889**
- Smartsheet import shells excluded: **14**
- Already-linked Opportunities: **0**

### Why 2,889 rows are held

All 2,889 held rows have the same class of contradiction:

**The modern Sales status says the Opportunity is open (`sales_status = lead`) while the current task text says the business event is terminal.**

Breakdown:

- task begins **Completed Sale**: **1,036**
- task begins **Lost**: **1,132**
- task begins **Closed**: **721**

No precedence is assumed between these fields in 0K. Choosing terminal task text over Sales status, or Sales status over terminal task text, would change the historical business meaning and therefore requires a deliberate reconciliation rule before backfill.

This also explains why a naive migration of every `in_pipeline=true` row would be unsafe: it would create thousands of Opportunity records in stage New even though their source task text says they were already won/lost/closed.

### Customer resolution

Among the 3,045 Sales candidates:

- **1,189** resolve to a canonical Customer through an existing exact `legacy_client_names` approved mapping;
- **1,856** remain unresolved, which is permitted;
- name/email/phone matching is not used to force those 1,856 into Customer records.

The dry run does not modify WorkOrder.customer_id.

## Verification coverage

`scripts/validate-opportunity-bridge-audit.mjs` verifies:

- parity with current Sales scope classification;
- WorkOrder status → Opportunity stage behavior;
- Sales owner/source/origination/next-action preservation;
- `budget_less_than` is not reinterpreted;
- approved Customer legacy-alias resolution;
- name/email/phone alone cannot authorize a Customer link;
- unresolved Customer is allowed;
- missing Customer references fail closed;
- duplicate Estimate identity fails closed;
- duplicate Smartsheet identity fails closed;
- open-status/terminal-task contradictions require review;
- ambiguous legacy Closed records require review;
- already-linked Opportunity records are recognized;
- Unknown Smartsheet shells remain excluded.

## Explicitly unchanged

- no Opportunity records created;
- no OpportunityIntake records created;
- no EstimatingRequest records created;
- no WorkOrder records updated;
- no WorkOrder.opportunity_id backfill;
- no Customer records updated or merged;
- no Estimate records updated;
- no Smartsheet configuration/row changes;
- no Sales Pipeline reads/writes changed;
- no stage/status cleanup;
- no estimate formula/pricing changes;
- no publish/deploy.

## Migration implication

The next bridge phase must not simply backfill all 3,045 candidates.

The safe 156 can form an automatic bridge cohort once write behavior itself is separately implemented and verified.

The 2,889 conflicting records first need an explicit historical Sales-status reconciliation contract that defines whether terminal task text can override `sales_status=lead`, how Completed Sale/Lost/Closed are translated, and how that decision is audited without rewriting the original WorkOrder source facts.

## Exact next phase — 0L

**Phase 0L — Historical Sales Status Reconciliation Contract / Review Cohorts**

0L should remain read-only.

It should:

1. inspect the 2,889 conflicting WorkOrders by terminal task family, dates, Smartsheet source state, and other corroborating source fields;
2. preserve original WorkOrder values unchanged;
3. define explicit proposed precedence rules for Completed Sale, Lost, and Closed cohorts;
4. separate deterministic cases from genuinely ambiguous cases;
5. prove the rule against representative production fixtures and current Sales behavior;
6. quantify how many additional rows would become safe for bridge creation under each approved rule;
7. do not write Opportunity or WorkOrder records;
8. checkpoint the reconciliation contract and dry-run logic.

0L should end with an auditable answer to “what historical Sales stage should each conflicting row become?” before any production bridge backfill exists.
