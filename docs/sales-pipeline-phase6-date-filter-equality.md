# Sales Pipeline — Phase 6 saved date equality correction

Reviewed September 28, 2026 against fresh Base44 Git state. Scope: saved Information Filter date equality/membership behavior only. No production records, schemas, Smartsheet mappings, pricing, permissions, or downstream handoffs were changed.

## Found

The prior date-range correction fixed Greater Than / Less Than for date-typed fields, but the same saved filter evaluator still used raw string comparisons for Is / Equals / Is Not / Is One Of / Is Not One Of. That fails for timestamp-backed date fields such as `sales_stage_changed_at` and `sales_last_follow_up_completed_at`: a stored value like `2026-09-27T18:30:00Z` would not match a saved date-only condition `2026-09-27`.

## Fixed

- Added `salesDateFilterEquals` to the existing calendar-day helper module.
- Date-typed Is / Equals conditions now compare validated calendar days while retaining the existing OR grouping for multiple Is/Equals conditions on the same field.
- Date-typed Is Not, Is One Of and Is Not One Of use the same calendar-day equality helper.
- All non-date equality, inequality and membership comparisons keep their prior behavior.
- Missing/invalid dates do not falsely match equality; Is Not / Is Not One Of continue to behave as negations of equality.
- Existing date parsing rules remain unchanged: ISO date/date-time and reviewed legacy M/D/YYYY or M/D/YY inputs, with no inference from created_date or updated_date.

## Verified

- `scripts/validate-sales-date-filters.mjs`: **68/68 PASS**.
- Responsive filter editor: **26/26 PASS**.
- Filter/preset pool accessibility: **21/21 PASS**.
- Column draft: **45/45 PASS**.
- Column catalog: **PASS**.
- Focused ESLint: **0 errors**, five pre-existing unused-variable warnings in `SalesPipelineSpreadsheet.jsx`.
- `git diff --check`: PASS.
- Full `npm run build`: PASS; nonempty `dist/index.html` verified.

## Remaining

Authenticated browser acceptance is still blocked by unavailable browser tooling / authorized test session. Source-level tests and a successful build do not prove actual phone/tablet/desktop behavior. Preserve the compact always-visible column checkboxes and horizontal preview. Nothing published.
