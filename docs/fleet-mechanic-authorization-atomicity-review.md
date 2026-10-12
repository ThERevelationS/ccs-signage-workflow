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

## Receiving-side photo source provenance guard (2026-10-11)

The Fleet work-order receiving gate now checks more than the reused-photo source receipt's reservation owner, fingerprint and URL prefix. On its initial read **and** its final post-authorization read, it requires a started Fleet mechanic Save source belonging to the **same** FleetMaintenanceWorkOrder, the same grant/actor, the same saved work-order version, and the Save action. Previously, a source with matching photo reservation fields but mismatched source work-order identity could pass that local receiver check. The mechanic portal already binds sources to a work order on normal retries; the receiver independently enforces the same invariant against substituted or changing source receipts. Ordinary CCS updates and legitimate same-work-order photo retries continue unchanged.

This is a **receiver-side provenance validation**, not a transaction, lease, dispatch-intent CAS or revocation barrier. Historical receipts with missing or inconsistent source provenance fail closed for CCS review rather than being silently rewritten. Isolated tests cover six mismatched source fields and three mid-check changes, alongside normal retry and the documented final-grant-read revocation gap. Production data was not modified for testing.

## Portal source-receipt identity and reservation reconciliation (2026-10-12)

The mechanic portal now independently verifies reused-photo source and retry identity during Save evidence validation, reserved-pair admin/status reconciliation, receipt resolution after a proven commit, and failed-retry reservation release. A source must be a Fleet mechanic Save receipt for the **same FleetMaintenanceWorkOrder**, actor/grant, payload fingerprint and expected work-order version, with exact retry receipt linkage and an unchanged HTTPS photo prefix. Admin resolution of a confirmed work-order marker must not mark a different source receipt applied, even when the retry itself is legitimately applied.

Conditional source transitions now include immutable identity, upload-prefix and current reservation-owner predicates. The initial reservation updates **only** nested reservation fields instead of replacing the full `result_summary`, preserving concurrently added forensic notes, photo URLs and other provenance. Candidate reuse is restricted to same-actor, same-version, same-work-order failed Save receipts. A mismatched or changed source fails closed for manual CCS review; it is not deleted, silently released or reattributed. Existing bearer tokens and the frozen legacy app are unchanged.

Five added in-memory handler regressions cover a competing source identity change during release, preventing marker-based resolution of another work order's source, rejected admin reconciliation on source actor mismatch, preservation of forensic metadata during reservation and rejection of cross-actor photo reuse. They do not prove the availability of cross-entity atomic transactions or resolve revocation after the receiving service's final grant read. No production records were used for testing.

## Work-order marker receipt identity CAS (2026-10-12)

The portal now requires a durable Fleet mechanic receipt to have internally consistent operation-key components (grant, work order, Start/Save action and request ID), actor identity, target entity, payload fingerprint and saved work-order version before it can be treated as matching a committed work-order marker. This check applies to mechanic `mutation_status`, same-request retries, unresolved-receipt preflight and CCS admin reconciliation. Conflicting evidence fails closed for CCS review rather than being reported applied or redispatched.

When a committed Fleet work-order marker proves a Start/Save operation, the conditional `FleetOperationReceipt.updateMany` that marks the receipt applied now also requires the reviewed receipt's operation key, actor, target, fingerprint and saved-plan identity to remain unchanged. A later read may acknowledge an already-applied outcome **only when** its current receipt identity still matches the Fleet work-order marker. Nested photo URLs and admin forensic notes are intentionally not part of the selector and remain untouched by applied-state updates, preserving newer evidence. The committed work-order marker remains positive evidence of the Fleet write; a receipt status alone is not equivalent evidence.

Three additional synthetic tests cover six identity changes racing the applied-state CAS, preservation of audit notes during a valid applied transition, and rejection of forged applied/started receipt identities by mechanic status and admin reconciliation. This protects individual receipt transitions and does **not** make grant revocation and work-order commits atomic. Production records were not modified for testing.

## Future atomicity evaluation

Only consider a stronger guarantee after identifying and verifying a Base44-supported transactional primitive or designing an explicit **server-enforced** fencing scheme encompassing *all* grant mutations (revoke, scope, permissions, expiration) and actual Fleet work-order commits. Any such change must address crashes, retries, lease expiry, in-flight writes, per-grant concurrency, durable operation receipts, and compatibility with existing bearer links. A simple in-memory mutex, more polling, or a CAS on just one of these entities is not sufficient. No production records should be used to test the design; do not publish until explicitly authorized.

## Receipt failure and admin cancellation identity CAS (2026-10-12)

A mechanic receipt's failed/cancelled terminalization formerly matched only its ID and current status, despite a reviewed operation having a full grant, actor, work-order, request, fingerprint and version identity. A concurrent identity change could be relabeled with the earlier operation's failure or cancellation reason. Failed-state writes also ignored CAS results and could return a misleading failed response after an applied/cancelled race.

The portal now matches the reviewed immutable operation identity and expected work-order version when setting failed or cancelled. Unknown write acknowledgments are reconciled against the latest receipt before returning a terminal result. Failure that cannot be verified raises a 409 rather than claiming failed; admin cancellation with changed identity reports blocked without erasing receipt evidence. When cancellation loses to applied, the admin reports applied only after rereading and verifying the FleetMaintenanceWorkOrder operation marker; otherwise it reports blocked for manual review. Ordinary forensic summary metadata and photos remain intact.

Five new isolated synthetic regression scenarios cover failure identity changes, failure-vs-applied races, admin cancellation identity changes, unproven applied status during admin cancellation, and lost success acknowledgments for both terminal transitions. These are individual receipt CAS improvements, not an atomic grant/receipt/work-order transaction. An in-flight receiver commit past the last authorization check remains possible. Do not treat a cancelled receipt or absence of a marker at one instant as proof that no delayed commit may arrive.

## Applied receipt status with superseded work-order marker (2026-10-12)

A separate review found the mechanic status route, same-request replay, CCS admin reconciliation and photo-retry completion could report success from an `applied` receipt status alone, even without the work-order marker or durable evidence that such a marker had been reconciled. Requiring the **current** work-order marker would incorrectly reject legitimate earlier commits after later maintenance replaces that marker.

These read/reconciliation branches now accept the matching current work-order marker **or** a valid applied receipt carrying the persisted `applied_at`, `result_summary.work_order_updated_date`, and boolean `result_summary.recovered_from_work_order_marker` commit evidence recorded by the existing marker reconciliation. A photo source resolved by retry additionally requires exactly one linked, identity-consistent applied retry with equivalent commit evidence. A bare `applied` status with no such provenance fails closed (409 to the mechanic; `blocked` to CCS admin) without altering receipts, photos, forensic notes or work-order data. This may surface legacy malformed/unproven records for explicit admin review rather than granting false success.

Four isolated synthetic scenarios cover unproven applied status, genuine superseded-marker completion, exact linked photo-source provenance and unverified photo-retry evidence. This improves **response integrity** only: stored receipt evidence is not an independent database transaction, cannot cryptographically prove history, and does not close the grant/receipt/work-order atomicity or late-write gaps.

## Interrupted reserved-photo retry proof in mechanic recovery (2026-10-12)

The mechanic-facing reserved-photo retry reconciler was the remaining direct caller that treated `retry.status === 'applied'` as proof of a Fleet commit without examining the current work-order marker or recorded marker-reconciliation evidence. This branch now shares the same verification used by CCS admin review. An applied retry lacking evidence remains blocked/started for review, and the reserved source remains untouched; a genuinely committed retry may still resolve after a newer Fleet update supersedes its marker. Two synthetic cases verify the status and new-request branches cannot claim prior success or release photos from unproven receipt status. No production data was modified.
