# Sales Pipeline Phase 6 — Save & Sync exact WorkOrders

Reviewed September 28, 2026 against fresh Base44 Git state and live Smartsheet sync configuration.

## Requirement

Add a Sales Pipeline **Save & Sync** button so users do not have to wait for the scheduled sync interval after making Sales changes.

## Implemented

### Sales toolbar

- Added a compact **Save & Sync** button beside New Client / Tools.
- Phone layout uses a compact **Save** label while desktop shows **Save & Sync**.
- Button waits for pending Sales quick-edit saves to finish before attempting Smartsheet sync.
- Blocked/conflicted quick edits fail closed and do not push stale Base44 data.
- Success/failure feedback is shown inline in the Sales toolbar.

### Exact saved-record queue

Successful Sales saves mark only their permanent WorkOrder ID for manual sync:
- quick edits
- Est/Inv + CoreBridge field save
- newly created Sales WorkOrders
- successful WorkOrder Detail updates

The queue is session-local and contains only records saved during that Sales page session.

A per-WorkOrder generation counter prevents this race:
- WorkOrder version A begins syncing
- user saves version B before A finishes
- completion of A does **not** clear B from the pending sync queue

### Backend manual Sales push

Added authenticated `push_saved_sales` to the existing `smartsheetSyncAction` backend.

The action:
- is available to an authenticated Sign Shop user without granting access to full/admin sync actions;
- accepts only exact permanent WorkOrder IDs;
- re-reads only those WorkOrders by ID before writing;
- blocks if requested records are missing/deleted;
- honors the global sync kill switch;
- honors observation mode;
- requires the existing Sales mirror to be enabled;
- uses a hard maximum of 100 WorkOrders per button press, even if the global mass-change limit is higher;
- respects `create_smartsheet_from_base44` for unlinked Sales records;
- preserves existing Sales snapshot-review checks;
- preserves Smartsheet conflict detection;
- preserves backup-before-write behavior;
- records requested WorkOrder IDs and requesting user in sync status;
- does **not** enable or modify scheduled `push_enabled`.

The generic push engine now accepts exact record IDs for either Orders or Sales. Existing Order Form Save & Sync behavior remains intact.

## Current live configuration

Read-only verification after implementation:
- `global_enabled: true`
- `observation_mode: false`
- Sales `mirror_enabled: false`
- Sales `push_enabled: false`
- Sales `create_smartsheet_from_base44: true`

Therefore the new button is implemented and guarded, but the backend will currently return:
**Sales Pipeline Smartsheet mirror is OFF.**

This chunk intentionally did not enable the production Sales mirror.

## Verified

- Sales Save & Sync regression: **21/21 PASS**.
- Order targeted Save & Sync regression: **PASS**.
- Order Save & Sync button regression: **PASS**.
- Shared Order sync review/safety regression: **PASS**.
- Sales top toolbar: **30/30 PASS**.
- Sales mobile toolbar: **32/32 PASS**.
- Focused ESLint: **0 errors**, five pre-existing unused-variable warnings in SalesPipelineSpreadsheet.
- Smartsheet backend bundle: **PASS**.
- `git diff --check`: **PASS**.
- Full production build: **PASS**.

No Smartsheet rows, WorkOrders, sync settings, or other production records were modified. Nothing published.
