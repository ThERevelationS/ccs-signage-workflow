# Phase 0L — Historical Sales Status Reconciliation Contract / Review Cohorts

Status: IMPLEMENTED AND VERIFIED — read-only reconciliation contract only.

## Why this phase exists

Phase 0K found 2,889 WorkOrder-backed Sales records where:

- `in_pipeline = true`
- `sales_status = lead`
- but `current_task_description` begins with Completed Sale, Lost, or Closed.

Those source fields contradict each other. Phase 0L defines what can be inferred safely without changing the original WorkOrder.

No production record is modified by this phase.

## Existing safety rule preserved

CCS already states in the Smartsheet vocabulary/review model:

> A label such as Lost or Completed Sale in Current Task is NOT an authoritative sales outcome.

That rule remains authoritative for migration.

The live CellHistory also proves why this matters. Of 25 current-task history rows read during 0L, 13 show a terminal task later changed back to a non-terminal task:

- Lost → active/non-terminal: 8
- Completed Sale → active/non-terminal: 5

Examples include Lost → Estimate - To Be Reviewed, Lost → WIP - Inspections, Completed Sale → SIPs, and Completed Sale → WIP - Installation.

Therefore terminal task text can route historical records into review, but it cannot independently establish Won or Lost.

## Evidence rules

### Strong historical conversion evidence

A valid `date_order_created` is treated as strong conversion evidence only when it agrees with `Completed Sale`.

This is grounded in the current approved Estimate → WorkOrder conversion contract, which writes both:

- `sales_status: "won"`
- `date_order_created: conversionDate`

A historical row with Completed Sale **and** a valid Order Created date therefore contains two separate business facts pointing to the same outcome.

### Evidence that is deliberately NOT authoritative by itself

These fields are preserved as context but do not determine Won/Lost:

- `est_inv_at` — it is an Est/Inv identifier, not proof that the value represents an invoice;
- `estimate_amount`;
- `date_estimate_sent`;
- `site_survey_date`;
- `project_install_date` — may represent planning/scheduling;
- permit number/receipt/approval fields;
- customer/company name;
- email/phone;
- Current Task text by itself.

The live data supports this caution: `est_inv_at`, estimate amounts, install dates and permit evidence appear in both Completed Sale and Lost/Closed cohorts.

## Reconciliation contract

### Completed Sale

**Completed Sale + valid `date_order_created`**

→ proposed historical stage: **Won**

→ decision: **deterministic_won**

→ eligible to join the later safe Opportunity bridge cohort.

**Completed Sale without a valid Order Created date**

→ **manual review**

The task text is not enough on its own.

### Lost

**Lost / Lost - We took too long without authoritative loss evidence**

→ **manual review**

There is no current independent loss field on these imported conflicts: live `lost_reason` and `close_date` are blank across the conflict cohort.

**Lost + valid Order Created date**

→ **manual review due contradiction**

The source simultaneously says Lost and that an Order was created. Neither side is silently overwritten.

### Closed

Both observed Closed families remain manual:

- Closed - Did not Lose
- Closed - Attempted Follow-up/No Response

The phrases are useful review context but are still Current Task text, not authoritative outcome state.

Closed + Order Created is also manual because the source remains semantically contradictory/ambiguous.

## Live read-only results — 2026-10-03

### Original conflicts

- total: **2,889**
- Completed Sale: **1,036**
- Lost: **1,132**
- Closed: **721**

Closed breakdown:

- Closed - Did not Lose: **429**
- Closed - Attempted Follow-up/No Response: **292**

Lost breakdown:

- Lost: **1,083**
- Lost - We took too long: **49**

Completed Sale breakdown:

- Completed Sale: **1,034**
- Completed Sale - Electrical Inspection: **1**
- Completed Sale - Sign Inspection: **1**

### Order Created evidence

Rows with a valid Order Created date:

- Completed Sale: **272**
- Lost: **30**
- Closed: **31**

No future Order Created dates were found in the 272 Completed Sale deterministic cohort.

The 30 Lost + Order Created and 31 Closed + Order Created rows stay manual because their source evidence conflicts.

### Result after applying the contract

From the 2,889 conflicts:

- newly deterministic Won: **272**
- deterministic Lost: **0**
- remaining manual review: **2,617**

Combined with Phase 0K's previously safe 156 bridge records:

- prospective safe bridge cohort becomes **428**
- unresolved/review cohort remains **2,617**
- Smartsheet Unknown shells remain excluded: **14**

Nothing has been bridged yet. These are dry-run classifications only.

## Additional source observations

All 2,889 conflicting imported rows currently have:

- `sales_status = lead`
- `current_stage = estimating`
- `completed = false`

None has a linked modern `estimate_id`.
None has a populated `lost_reason` or `close_date`.

The active `Order` entity cannot establish historical sales outcomes for this cohort: only a handful of current material-request Orders have WorkOrder links, and that entity remains the material/request workflow rather than a sales/invoice ledger.

The proper long-term corroboration source for unresolved history will be canonical historical Invoice/Payment data after that migration is materialized.

## Implementation

Added:

- `base44/shared/historicalSalesOutcomeReconciliation.mjs`
- `scripts/validate-historical-sales-outcome-reconciliation.mjs`

The module is pure/read-only. It has no Base44 client and no mutation path.

It:

- identifies historical status/task conflicts;
- validates strict ISO Order Created dates;
- classifies terminal task families/subtypes;
- produces deterministic Won only for Completed Sale + valid Order Created;
- fails Lost/Closed contradictions closed to review;
- records weak contextual evidence without promoting it;
- summarizes known terminal-task reversals from CellHistory;
- returns cohort/review counts.

## Validation

The regression script verifies:

- Completed Sale + valid Order Created → deterministic Won;
- Completed Sale alone remains review;
- weak estimate/install/permit context cannot promote outcome;
- Lost alone remains review;
- Lost + Order Created remains contradiction/review;
- both Closed families remain review;
- invalid order dates cannot promote outcome;
- terminal-task reversals are recognized;
- current approved Estimate conversion still writes Won + Date Order Created;
- the existing Smartsheet rule that terminal task text is not authoritative remains present.

## Explicitly unchanged

- no WorkOrder writes;
- no `sales_status` cleanup;
- no Current Task cleanup;
- no Opportunity creates;
- no WorkOrder.opportunity_id updates;
- no Customer changes;
- no Estimate changes;
- no Smartsheet changes;
- no Order changes;
- no historical Invoice fabrication;
- no publish/deploy.

## Exact next phase — 0M

**Phase 0M — Safe Opportunity Bridge Execution Contract / Idempotent Dry-Run Plan**

0M should still avoid production backfill.

It should:

1. combine Phase 0K safe candidates with the 272 newly reconciled deterministic Won rows;
2. produce the exact 428-record proposed bridge cohort and 2,617-record hold cohort;
3. define immutable bridge receipts/idempotency identities from WorkOrder.id;
4. define compare-and-set rules for linking WorkOrder ↔ Opportunity without overwriting concurrent Sales edits;
5. preserve every original WorkOrder source field unchanged;
6. define recovery behavior for uncertain Opportunity create/link responses;
7. add dry-run execution fixtures and duplicate/race protections;
8. verify the live cohort read-only again;
9. do not execute the production backfill;
10. checkpoint the execution contract.

0M should end with an implementation-ready, retry-safe bridge plan where a later explicitly controlled apply phase can create Opportunities without guessing or duplicating records.
