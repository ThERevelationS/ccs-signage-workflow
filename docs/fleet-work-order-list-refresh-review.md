# Fleet Work Order List Refresh Review

## Finding

Concurrent list refreshes in `FleetWorkOrders.jsx` previously applied whichever request resolved last. A request that started earlier could therefore replace a newer Fleet snapshot, clear a newer refresh error, or change loading state after a retry or confirmed work-order action had already refreshed the list.

The deterministic Chromium regression holds an old `FleetMaintenanceWorkOrder` response after it captures its snapshot, performs a synthetic work-order creation, retries the refresh, and then releases the old response. Before the fix, the stale response removed the newly created row and restored the old title.

## Change

Each list load receives an increasing sequence number. Only the latest-started load may update Fleet work orders, equipment, maintenance schedules, Fleet parts and fluids, current user, refresh error, or loading state. Older requests still settle normally. No mutation is replayed, and mutation receipts and server authorization are unchanged.

Fleet data continues to load from `FleetMaintenanceWorkOrder`, `FleetEquipment`, `FleetMaintenanceTask`, `FleetPart`, and `FleetFluid`.

## Synthetic verification

- The stale-response regression passes with the older response released after the newer refresh.
- Fleet Work Orders Chromium acceptance passes at desktop and mobile viewports.
- Work-order refresh error handling, save focus, and focus safety checks pass.
- Mechanic authorization, mutation recovery, and receipt race scripts pass.
