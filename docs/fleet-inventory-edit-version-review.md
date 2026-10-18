# Fleet inventory edit version review

Fleet Parts and Fleet Fluids edit through `fleetInventoryAction`. The dialog sends the `updated_date` from the item snapshot it opened, and the backend applies the edit with `updateMany({ id, updated_date })`.

The endpoint previously substituted its own freshly-read `updated_date` when a caller omitted the client version. That made a missing version look current and could allow a stale form to overwrite a newer inventory edit. The endpoint now requires the request's version. Missing versions receive the existing 409 reload response; older versions continue to fail the conditional update without changing Fleet inventory.

This affects FleetPart and FleetFluid only. It does not touch signage inventory, Fleet maintenance work orders, request receiving receipts, or production Fleet records.

Synthetic regression coverage:
- Missing client version is rejected before any write.
- A delayed edit with an older snapshot conflicts after a newer save.
- A current snapshot saves successfully.

Validation is local/synthetic and does not replace authenticated production browser acceptance.
