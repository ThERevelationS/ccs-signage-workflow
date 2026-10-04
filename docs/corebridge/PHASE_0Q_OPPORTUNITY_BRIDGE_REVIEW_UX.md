# Phase 0Q — Opportunity Bridge Simulation Review UX

Status: IMPLEMENTED AND VERIFIED AS ADMIN-ONLY READ-ONLY OPERATOR REVIEW.

## Purpose

Phase 0Q gives CCS administrators a usable review surface for the guarded Phase 0P Opportunity bridge simulation without adding any production apply path.

The review lives inside the existing Admin Settings screen, which already requires:

1. an authenticated CCS user;
2. Base44 admin role for the admin-only tabs; and
3. the existing Admin Settings secondary unlock/capability before the settings screen is exposed.

## Added

- `src/components/admin/OpportunityBridgeReview.jsx`
- Opportunity Bridge tab in `src/pages/AdminSettings.jsx`
- `scripts/validate-opportunity-bridge-operator-review.mjs`

The tab can also be opened with:

`AdminSettings?tab=opportunity_bridge`

and remains part of the existing admin-only tab allowlist.

## Operator workflow

The review screen automatically runs the server-side simulation and allows an administrator to manually refresh it with **Run Simulation**.

It shows:

- total current Sales candidates;
- current safe bridge cohort;
- deterministic historical Won cohort;
- held-for-review cohort;
- live WorkOrder and Opportunity counts;
- safe / held / excluded row filters;
- hold reason counts;
- immutable bridge receipt key;
- source WorkOrder snapshot;
- proposed Opportunity payload;
- historical reconciliation evidence where applicable.

Returned detail rows are capped by the Phase 0P backend to 25 records.

## Drift visibility

The latest successful summary is stored only in the operator browser's `localStorage`.

On a later manual simulation the UI compares the fresh server result against that prior browser-local summary and shows count deltas.

This creates useful operator drift awareness without adding any production database write or migration audit entity.

Browser-local drift history is advisory only. The live backend simulation remains authoritative.

## Safety contract

The UI accepts a response only when all three backend safety fields are present:

- `simulation_only === true`
- `write_capability === false`
- `apply_path_enabled === false`

If any safety field changes, the UI rejects the result.

The component:

- invokes only `opportunityBridgeSimulation`;
- never imports the 0O apply engine;
- performs no direct Base44 entity mutation;
- has no Apply button;
- sends no apply/write/commit request field;
- sends only simulation mode, row limit, and allowlisted action filters.

## Filters

The operator can inspect:

### Safe proposals

- proposed_create
- proposed_recover_link
- already_linked

### Held for review

- hold

The server summary is used to display all hold reason counts even though only the first 25 rows are returned.

### Excluded

- excluded

This includes non-Sales-scope records and protected Smartsheet import shells according to the 0N planner.

## Mobile / usability

The review uses the existing responsive Admin Settings container.

Controls have touch-sized minimum heights, cohort cards collapse into responsive columns, filters wrap on narrow screens, and expanded JSON evidence remains independently scrollable.

## Regression protection

`validate-opportunity-bridge-operator-review.mjs` asserts:

- only the simulation endpoint is invoked;
- the three backend safety flags are verified;
- no direct entity writes exist;
- the apply engine is not imported;
- no Apply button or apply-mode value exists;
- safe / historical Won / held counts are visible;
- hold reasons are surfaced;
- source snapshot, proposed Opportunity, and receipt key are inspectable;
- Admin Settings contains an admin-gated Opportunity Bridge tab.

## Explicitly unchanged

- no Opportunity records created;
- no WorkOrder opportunity_id links written;
- no Customer changes;
- no Estimate changes;
- no Smartsheet changes;
- no production migration audit rows;
- no Sales Pipeline ownership/read behavior change;
- no deploy/publish.

## Exact next phase — 0R

**Phase 0R — Production Apply Readiness Gate / Final Preflight**

0R should still perform no bridge writes.

It should define and verify the exact conditions that must all be true before production apply can be enabled:

1. live dry-run has zero duplicate/split/incomplete receipt identities;
2. no existing unexpected Opportunity links;
3. current safe cohort is freshly re-planned;
4. historical deterministic Won rule remains unchanged;
5. held rows remain excluded from apply;
6. admin authorization and secondary confirmation requirements are specified;
7. batch size, stop-on-error, retry, and resumability rules are fixed;
8. durable operation-receipt/audit schema is designed before writes;
9. rollback policy is defined as forward corrective linking, never destructive deletion;
10. a production apply toggle remains hard-disabled until an explicit later phase/authorization.

0R should end with a go/no-go checklist and exact first-batch rollout plan, not an executed migration.
