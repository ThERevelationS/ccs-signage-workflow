# Fleet Work Order List Refresh Review

## Finding

Concurrent list refreshes in `FleetWorkOrders.jsx` previously applied whichever request resolved last. A request that started earlier could therefore replace a newer Fleet snapshot, clear a newer refresh error, or change loading state after a retry or confirmed work-order action had already refreshed the list.

The deterministic Chromium regression holds an old `FleetMaintenanceWorkOrder` response after it captures its snapshot, performs a synthetic work-order creation, retries the refresh, and then releases the old response. Before the fix, the stale response removed the newly created row and restored the old title.

## Change

Each list load receives an increasing sequence number. Only the latest-started load may update Fleet work orders, equipment, maintenance schedules, Fleet parts and fluids, current user, refresh error, or loading state. Older requests still settle normally. No mutation is replayed, and mutation receipts and server authorization are unchanged.

Fleet data continues to load from `FleetMaintenanceWorkOrder`, `FleetEquipment`, `FleetMaintenanceTask`, `FleetPart`, and `FleetFluid`.

## Verification

- The stale-response regression passes with the older response released after the newer refresh; Fleet Work Orders Chromium acceptance passes 10/10 at desktop and mobile viewports.
- Work-order refresh error handling, save focus, and focus safety checks pass. The Fleet mechanic work-recovery browser suite passes 34/34, and mechanic authorization, mutation recovery, and receipt race scripts pass.
- Targeted ESLint, production build, and `git diff --check` pass. Typecheck exits with 8,049 unrelated TypeScript diagnostics and zero Fleet/Bouncie diagnostics.
- Separate repair-estimate browser acceptance is still failing in the scope-narrowing then reopen scenario: 11 earlier cases pass, but the reopened job does not show its expected ownership-verification lock. This phase changed no mechanic files.
