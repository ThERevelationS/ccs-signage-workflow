# Fleet mechanic authorization / work-order commit boundary

Reviewed: 2026-10-10. App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`). Engineering note; not a deployment or change to live Fleet records.

## Findings

The installed Base44 SDK entity reference documents individual `get`, `filter`, and MongoDB-style conditional `updateMany` operations, as well as `bulkUpdate`. It does **not** document an entity transaction or an atomic conditional update spanning `FleetMechanicAccess`, `FleetOperationReceipt`, and `FleetMaintenanceWorkOrder`. A `functions.invoke` boundary does not supply a transaction. Do not invent transaction, lock, or driver APIs from generic MongoDB behavior. This assessment concerns the available documented SDK; it does not claim knowledge of Base44's internal database capabilities.

Current mechanic commit path: bearer-link scope validation in `fleetMechanicPortal`, durable operation receipt and photo evidence, last authorization check, `fleetWorkOrderAction` receiving-side grant/receipt/plan checks, then `updateFleetRecordIfCurrent` (`FleetMaintenanceWorkOrder.updateMany` conditioned on `id` and `updated_date`). A successful commit gets a work-order operation marker. Subsequent portal responses recheck grant permission and suppress work-order details after revocation. Receipt/work-order marker reconciliation preserves evidence after uncertain acknowledgements.

## Remaining non-atomic interleaving

1. Receiving service reads a currently enabled grant and a valid started receipt.
2. Admin revokes the grant immediately after the final read.
3. The already-authorized call may still pass the `FleetMaintenanceWorkOrder.updateMany` version check and commit.
4. The mechanic portal's committed-response permission check denies the revoked bearer and withholds Fleet work-order data. The durable marker/receipt can be reconciled by an authorized admin.

This is **not** an atomic revocation barrier. An extra `get` can narrow the interval but cannot remove it. The synthetic acceptance `a grant revoked after the final read cannot be made atomic with WorkOrder CAS` reproduces this sequence deliberately. Do not convert this test into a false claim that revocation blocks all previously dispatched writes.

## Bounded safety improvement in this phase

`fleetMechanicWorkOrderCommitGate.ts` now rereads the receipt and saved patch after the first grant check, verifies the operation and photo-retry ownership again, and makes one final grant check before the versioned write. This catches receipt cancellation, photo plan changes, reservation reassignment, and grant changes while the receiving service is validating. It preserves ordinary CCS Work Order updates without mechanic markers and does not change Bouncie or Fleet maintenance entity identity.

## Single-grant administrative concurrency guard (2026-10-11)

The mechanic link's `scope_mode` / `allowed_equipment_ids` and estimate `allowed_actions` administration now use `FleetMechanicAccess.updateMany` conditioned on the exact reviewed `updated_date`, `id`, and `enabled:true`. Revocation continues to set `enabled:false` without waiting for an admin edit. Therefore a delayed scope/permission edit cannot succeed after the revocation or another committed grant edit; a stale editor receives a 409 and must refresh. This preserves existing token hashes, grant IDs, receipt provenance and live work orders. The isolated race suite covers ordinary edits, revoke-before-CAS, competing admin edits and revoked/unversioned fail-closed behavior.

This conditional update concerns **one grant record only**. It does not reserve a work order, drain in-flight mechanic operations, protect a commit already past the last grant read, or establish an authorization transaction. Do not present it as a stronger cross-entity guarantee.

## Future atomicity evaluation

Only consider a stronger guarantee after identifying and verifying a Base44-supported transactional primitive or designing an explicit **server-enforced** fencing scheme encompassing *all* grant mutations (revoke, scope, permissions, expiration) and actual Fleet work-order commits. Any such change must address crashes, retries, lease expiry, in-flight writes, per-grant concurrency, durable operation receipts, and compatibility with existing bearer links. A simple in-memory mutex, more polling, or a CAS on just one of these entities is not sufficient. No production records should be used to test the design; do not publish until explicitly authorized.
