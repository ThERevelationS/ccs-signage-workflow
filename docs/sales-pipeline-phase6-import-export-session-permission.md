# Sales Pipeline Phase 6 — import/export permission uses authenticated Sign Shop session

Reviewed September 28, 2026 against fresh Base44 Git state.

## Found

Sales Pipeline already reset import/export permission state when the signed-in user changed, but non-admin permission was still verified by a direct browser query to the RLS-protected AuthorizedEmail entity.

That was redundant because the custom Sign Shop login/session already returns `can_import_export`, and it risked the same published-app RLS mismatch previously confirmed for Sales person roster reads.

A dormant inline spreadsheet toolbar also exposed Import/Export based only on registration state rather than the authoritative import/export permission.

## Fixed

- Removed the direct browser AuthorizedEmail permission query from `SalesPipeline.jsx`.
- `canImportExport` is now derived directly from the authenticated Sign Shop user:
  - admin, or
  - `currentUser.can_import_export === true`
- Login and restored-session responses already refresh this field from AuthorizedEmail.
- The existing backend Sales import action independently enforces the exact same permission rule.
- Passed the same permission into `SalesPipelineSpreadsheet`.
- The dormant inline Import and Export controls now fail closed unless `canImportExport` is true.
- New Client remains available to registered users independently of import/export permission.
- No RLS, AuthorizedEmail records, WorkOrders or import data were changed.

## Verified

- New import/export session-permission regression: **11/11 PASS**.
- Top toolbar: **30/30 PASS**.
- Mobile toolbar: **32/32 PASS**.
- Contextual action safety: **16/16 PASS**.
- Filter preference persistence: **21/21 PASS**.
- Canonical person dropdowns: **26/26 PASS**.
- Focused ESLint: **0 errors**, five pre-existing unused-variable warnings in SalesPipelineSpreadsheet.
- `git diff --check`: **PASS**.
- Full production build: **PASS**.

## Next requested chunk

Add an explicit Sales Pipeline **Save & Sync** action that uses the existing Smartsheet sync path to push verified Sales changes immediately instead of waiting for the 15-minute automatic sync interval. Preserve current sync safeguards and do not create a second sync system.

Nothing published and no production records modified.
