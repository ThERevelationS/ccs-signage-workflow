# Sales Pipeline — Phase 6 contained functional correction: custom date range filters

Reviewed September 27, 2026 against fresh clean production repository state; implemented in the Base44 app source only. This is a source-level correction, not an authorized browser or live-data acceptance test.

## Found

Saved Information Filters used `parseFloat(fieldValue)` and `parseFloat(condValue)` for every Greater Than / Less Than condition. ISO calendar dates in the same year therefore compared as the same number (e.g. both dates in 2026 become `2026`), silently excluding valid Follow Up, Estimate Sent, Expected Close and other date-filter results. Date fields and numeric fields shared the same unconditional comparison.

## Fixed

Added `src/components/sales/salesDateFilterRange.mjs` with an exact list of the 15 date-typed fields already offered by the Information Filter editor; no new/deprecated fields were introduced. The existing live spreadsheet condition evaluator now dispatches those 15 fields to validated calendar-day range comparisons, preserving the prior `parseFloat` comparison for non-date fields. ISO YYYY-MM-DD and valid ISO timestamps use the stored calendar day without browser-timezone shifts; legacy M/D/YYYY and M/D/YY date cutoffs are accepted, with two-digit years explicitly interpreted as 2000–2099. Invalid/missing dates and unsupported operators do not match. Greater Than and Less Than remain strict (equal dates do not match). Added a date-specific YYYY-MM-DD hint without changing saved values or switching old text inputs to a date picker that would erase legacy display values.

No changes to the existing `is`/`equals` grouping, numeric filters, custom-filter save/selection behavior, WorkOrders, schema, data, Smartsheet sync, pricing, permissions, CellHistory, or downstream handoffs. Preserved dense always-visible column checkboxes and horizontal preview.

## Test → Verify

- New isolated custom-date tests: **59/59 PASS**, including the complete existing date-field catalog, intra-month/intra-year comparisons, time-stamped stage/activity dates, legacy US input, invalid and missing values, strict boundaries and source wiring to the active spreadsheet evaluator.
- Prior filter/preset pool accessibility: **21/21 PASS**. Column draft: **45/45 PASS**. Column catalog: **PASS**.
- Targeted ESLint: **zero errors, six existing unused-variable warnings** across the pre-existing UI components; whitespace diff check PASS.
- Full `npm run build`: exited successfully; nonempty `dist/index.html` verified. Stale baseline-browser-mapping/Browserslist advisory messages remain.
- The existing scoped spreadsheet filtering path calls `applyCustomFilter` before view rendering; no separate filter evaluator was created.

## Remaining / blocked

Actual authenticated phone/tablet/desktop browser acceptance, non-admin permission acceptance, cross-session state and authorized screenshots remain blocked by unavailable browser tooling / test session. Neither source tests nor build verify live visual behavior. A possible narrow-phone Information Filter condition editor overflow was noted during inspection (fixed-width operator and a nonwrapping row within a height-limited dialog); assess against authorized mobile screenshots in a separate, contained chunk. No live customer records were changed and nothing was published.
