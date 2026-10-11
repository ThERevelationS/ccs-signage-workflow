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

## Dispatch-intent receipt CAS assessment (2026-10-11)

**Decision: defer a dispatch-intent mutation.** This phase reviewed every caller that can dispatch a Start/Save update: direct mechanic `start` and `save`; mechanic `mutation_status` replay; recovery of unresolved receipts before a new request; CCS `admin_reconcile_mechanic_mutation`; `admin_revoke_link`'s receipt-by-receipt reconciliation; and reserved-photo source/retry reconciliation shared by mechanic status, preflight, and admin review. All dispatch through `fleetWorkOrderAction`, where `verifyFleetMechanicWorkOrderCommit` checks the saved receipt, grant, exact patch and reservation evidence before the work-order versioned write. This review did not alter those production paths.

| Concern | Existing behavior | Risk of a naive `FleetOperationReceipt.updateMany` dispatch claim |
| --- | --- | --- |
| Concurrent Start/Save recovery by status/admin | Same saved operation marker and expected work-order version; one work-order CAS succeeds, losers reconcile the marker | A single-use claim would serialize callers but block a legitimate second attempt if the winner disappears before the write |
| Revocation or scope narrowing | Fresh checks at the portal and receiver, plus committed-response denial; already-dispatched writes remain potentially in flight | A receipt claim cannot atomically fence a grant edit or a work-order commit; a claimed receipt is **not** permission to bypass fresh grant checks |
| Crash after claim but before dispatch | Current durable started receipt and saved plan can be recovered after permission/version/evidence verification | The claim remains without a work-order marker, so a permanent lock would strand recoverable maintenance. A timeout-based takeover cannot prove the original invocation has stopped |
| Lost response or delayed work-order commit | Work-order marker gives positive proof; otherwise receipt and current version are inspected for cautious recovery | Claim age does not prove whether the underlying call committed, is still running, or failed; releasing an expired claim risks two active senders |
| Save photos and retries | URL prefix is recorded before dispatch; a reserved source and its retry require paired provenance and exact source ownership | A CAS on just the retry receipt cannot atomically fence the source reservation, photo evidence, and work-order update. Never discard either receipt's URLs |
| Idempotency | Stable operation key/fingerprint, receipt status, expected work-order version and committed marker control replay | An intent token with no server-enforced receiver contract is advisory, not a guarantee; requiring it only for new receipts would need an explicit legacy compatibility policy |

A safe design would first need **documented Base44 support for an enforceable receiver-side fencing token or a transaction** covering the relevant grant, receipt, photo reservation and work-order state. It must preserve historical started receipts and existing bearer grants, define how admin can resolve an indefinitely unknown dispatch without falsely asserting non-commit, and include deterministic races for winner crashes, late dispatch, revoke/scope edits, photo reservation ownership and lost acknowledgements. Do not auto-expire claims or treat absence of the work-order marker as proof that no write is still in flight.

**Synthetic regression evidence:** `scripts/test-fleet-mechanic-started-receipt-race.mjs` now covers a stranded Start receipt that safely resumes with no original dispatch, parallel admin/status Start redispatch constrained by work-order version CAS while a narrowed grant withholds mechanic data, and revocation of a noncommitted Start receipt preventing replay. Existing tests separately exercise Save/photo reservation/revocation races. These are isolated in-memory handler tests; the receiving-side gate and production database are not actually exercised by this suite. The new tests are a protection against introducing a permanent intent lock without an explicit crash-recovery design, **not** proof of cross-entity atomicity.

## Future atomicity evaluation

Only consider a stronger guarantee after identifying and verifying a Base44-supported transactional primitive or designing an explicit **server-enforced** fencing scheme encompassing *all* grant mutations (revoke, scope, permissions, expiration) and actual Fleet work-order commits. Any such change must address crashes, retries, lease expiry, in-flight writes, per-grant concurrency, durable operation receipts, and compatibility with existing bearer links. A simple in-memory mutex, more polling, or a CAS on just one of these entities is not sufficient. No production records should be used to test the design; do not publish until explicitly authorized.
