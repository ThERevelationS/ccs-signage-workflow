# Sales Pipeline — Phase 6 person-assignee identity + Smartsheet first-name translation

Reviewed September 28, 2026 against fresh Base44 Git state and read-only live records/config.

## Found

The saved Information Filter "Brett's Assigned Jobs" stores `current_task_assigned_to Is Brett Heinlein`, while live WorkOrders contain both `Brett` and `Brett Heinlein`. The same legacy/current naming pattern exists for other authorized users such as Carl and Twyla. The Sales custom-filter evaluator used exact string equality for user-backed fields, so a canonical full-name preset excluded rows stored under that person's legacy first-name label.

The existing Smartsheet translation/review model already understands a unique first name as the corresponding authorized user, but the live Sales spreadsheet filter did not use that translation. The runtime Sales sync boundary also filtered `current_task_assigned_to` out of the approved binding set, even though the verified Workflow configuration contains permanent column ID `3326787726927748` and the mapping blueprint defines the field as two-way.

## Fixed

### Preset/user identity matching

- Reused the existing Smartsheet person-resolution model instead of creating a duplicate identity system.
- Added `personValuesReferToSameUser`, which:
  - preserves normalized exact matches;
  - resolves a unique authorized first name to its canonical full name;
  - compares resolved users by email when available, otherwise canonical full name;
  - fails closed when a short first name is ambiguous.
- Wired the matcher into user-backed Sales filter fields:
  - Salesperson / Owner
  - Task Assigned To
  - Designer
  - Project Manager
  - Estimator
- Applied the identity translation consistently to Is/Equals, Is Not, Is One Of and Is Not One Of.
- Role-scoped matching mirrors the filter editor's existing role eligibility, including PM / Project Manager compatibility.
- Non-user filters and date-filter semantics are unchanged.

### Smartsheet sync translation

- Added the runtime Sales sync assignee translation `smartsheetSalesAssigneeLabel`.
- `current_task_assigned_to` now translates from Base44 full/display names to **first name only** at the Smartsheet write/snapshot boundary:
  - Brett Heinlein → Brett
  - Carl Heinlein → Carl
  - Kyle Heinlein → Kyle
  - Twyla Heinlein → Twyla
  - already-short names remain unchanged
  - legacy display names such as `Terri Tarter <email>` translate to `Terri`
- The same first-name value is used in the stored sync snapshot, so conflict detection compares against what was actually sent to Smartsheet.
- Smartsheet pull now performs the reverse translation before any Sales write: a unique authorized first name becomes the canonical Base44 full name (`Brett` → `Brett Heinlein`, `Twyla` → `Twyla Heinlein`, etc.). Already-canonical full names remain unchanged.
- Ambiguous or unresolved nonblank Smartsheet assignees fail closed and block the Sales pull before any Sales records are changed; the response includes review samples rather than guessing.
- The Assigned selector now displays the resolver's canonical full name for legacy first-name WorkOrders, so `Brett` and `Brett Heinlein` no longer appear as two separate visible assignees while historical records remain untouched.
- Added only `current_task_assigned_to` to the backend Sales sync allowlist. `sales_rep` and the other protected Base44-only bindings remain blocked.
- No production data was migrated or rewritten.

## Read-only live verification

- The authorized-user roster contains unique current first names for Brett Heinlein, Carl Heinlein, Kyle Heinlein, Twyla Heinlein and the other current examples inspected.
- Live WorkOrders contain both first-name and full-name forms, confirming the reported mismatch is real rather than hypothetical.
- The actual saved preset `Brett's Assigned Jobs` uses `current_task_assigned_to Is Brett Heinlein`.
- The existing Workflow Smartsheet binding for Current Task Assigned To is permanent column ID `3326787726927748`.
- Sales sync remains disabled in production config: `mirror_enabled:false`, `pull_enabled:false`, `push_enabled:false`. This chunk did not enable sync.

## Verified

- Person alias + canonical Smartsheet translation regression: **41/41 PASS**.
- Smartsheet Sales boundary validation: **PASS**.
- Existing Smartsheet translation regression: **PASS**.
- Smartsheet vocabulary review regression: **PASS**.
- Sales date filters: **68/68 PASS**.
- Saved-filter condition validation: **13/13 PASS**.
- Save single-flight lock: **21/21 PASS**.
- Responsive filter editor: **26/26 PASS**.
- Filter/preset accessibility: **21/21 PASS**.
- Column draft: **45/45 PASS**.
- Column catalog: **PASS**.
- Sales identifier: **7/7 PASS**.
- Sales number-backfill safety: **PASS**.
- Focused ESLint: **0 errors**, five pre-existing unused-variable warnings in `SalesPipelineSpreadsheet.jsx`.
- Smartsheet backend bundle: **PASS**.
- Full production build: **PASS**.
- `git diff --check`: PASS.

### Existing unrelated validation debt

`scripts/validate-smartsheet-sync.mjs` still fails its old assertion that frontend safety normalization must force global sync OFF. The current `smartsheetSyncSafetyModel.js` intentionally preserves admin-entered toggle values and delegates enforcement to the deployed backend; that model was changed separately from this assignee work. This chunk did not alter that safety model or stale test.

## Remaining

Authenticated browser acceptance remains outstanding. If a future authorized user roster contains two active users with the same first name, automatic short-name expansion intentionally fails closed; a reviewed explicit alias/unique Smartsheet label will be required rather than guessing.

Nothing published and no production records modified.
