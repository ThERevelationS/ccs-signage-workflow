# Sales Pipeline Phase 6 — exclude synthetic Smartsheet Unknown shells

Reviewed September 28, 2026 against fresh Base44 Git state and read-only live WorkOrders.

## Found

Current Pipeline contained 14 WorkOrders with:
- `client_name: "Unknown"`
- `in_pipeline: true`
- `sales_status: "lead"`
- numeric Workflow Smartsheet row IDs
- synthetic titles exactly matching `Smartsheet row <same row id>`

All 14 were created on September 23 from Workflow Smartsheet rows and otherwise contained essentially no Sales opportunity data. Read-only verification confirmed all 14 live `Unknown` Current Pipeline records match this exact synthetic import-shell signature.

The backend creation gate allowed any non-terminal Smartsheet Sales row into the modern pipeline and substituted `Unknown` when Customer was blank.

## Fixed

- Added shared Smartsheet Sales import eligibility helpers.
- A Smartsheet Sales row must now contain a meaningful Customer before it can create a Base44 WorkOrder.
- Blank/whitespace/`Unknown` customer rows are skipped instead of creating another synthetic WorkOrder.
- Sync results report `missing_customer_rows_skipped` so skipped blank-customer rows remain observable.
- Current Pipeline classification excludes only the exact preserved synthetic shell signature:
  - customer is `Unknown`
  - numeric `smartsheet_row_id`
  - title exactly equals `Smartsheet row <same row id>`
- Existing shell records are not deleted, soft-deleted, or modified. They remain available outside Current Pipeline for inspection/audit.
- If an existing linked shell later receives a real Customer from Smartsheet, it no longer matches the shell rule and becomes eligible for Current Pipeline automatically.
- Valid active Smartsheet rows with a real customer still create normally.
- Legacy terminal task text continues to prevent modern pipeline creation.

## Verified

- New Unknown-shell safety regression: **17/17 PASS**.
- Smartsheet Sales boundary validation: **PASS**.
- Person alias + Smartsheet translation: **41/41 PASS**.
- Canonical person dropdowns: **26/26 PASS**.
- Date filters: **68/68 PASS**.
- Saved-filter validation: **13/13 PASS**.
- Save single-flight: **21/21 PASS**.
- Column draft: **45/45 PASS**.
- Column catalog: **PASS**.
- Focused ESLint: **PASS**.
- Smartsheet backend bundle: **PASS**.
- `git diff --check`: **PASS**.
- Full production build: **PASS**.

## Live-data verification

Read-only live query found **14** Current Pipeline WorkOrders with `client_name: "Unknown"`; **14/14** matched the exact synthetic Smartsheet shell signature.

Nothing published and no production records modified.
