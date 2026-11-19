# O-013 estimator fixes — notes (claim-safe)

**App:** `68dfcc5e57bbbc35387da97c` · **Branch:** `main` · **HEAD at pull:** `1fe65f4445bd5963adfb87f8b92eb30d08ff6730` (descendant of `d04cbe54d` — verified via `git merge-base --is-ancestor`)
**Mode:** read-only sandbox. No remote writes, no publish/deploy, no entity ops. Fixes staged locally under `fixed/` + `SPEC.json` for `sandbox edit`.

## What was fixed (3 findings, 4 files, 7 edits)

### F-2 — `staffEntities.AllInOneEstimate.update` → 403 (3 dead writes)
`WRITE_OPS['AllInOneEstimate'] = {updateMany, delete}` — op `update` is denied at `staffEntityWrite/entry.ts:138-139`. All writes now use shapes the gateway accepts; CAS anchors come from already-loaded rows.

| Site | Intent (from surrounding code) | Fix |
|---|---|---|
| `src/pages/EstimatorQueues.jsx` `syncExpiredFlags` (~L89) | Best-effort sweep: persist the `quote_expired` flag on ≤10 stale rows per load so the flag "stays a truthful filter" (in-code comment). `.catch(()=>{})` is **deliberate** — a sweep failure must never break the queue load; the next load retries. | `updateMany({id: e.id, updated_date: e.updated_date}, {$set:{quote_expired}})`, swallow preserved. Stale anchor → `updated:0` no-op → next load retries. Feed rows carry `updated_date` (`ESTIMATE_QUEUE_FIELDS` in `shared/queueFeedModel.mjs:215`). |
| `src/pages/EstimatorQueues.jsx` `applyBulkStatus` (~L193) | User-initiated bulk status change with per-row failure reporting (`failures.push`). | `updateMany({id, updated_date: row?.updated_date}, {$set:{status}})` + `result.updated !== 1 → throw` so a drifted row surfaces as a named failure instead of a silent skip. Deliberately NOT the full `replaceEstimateFieldsIfUnchanged` helper — its per-row `get` would multiply entity-budget spend on bulk selects. |
| `src/pages/EstimateDetail.jsx` `handleMerge` (~L319) | After merging sections into the primary, archive the secondary estimate; on failure an alert tells the user to archive manually. | `replaceEstimateFieldsIfUnchanged({entity: staffEntities.AllInOneEstimate, estimateId: secondary.id, expectedFields: expectedEstimateFields(secondary, mergeArchiveFields), guardFields: {updated_date: secondary.updated_date}, nextFields: mergeArchiveFields, label: "Estimate merge archive"})` — the **exact idiom the queue-archive path already uses** (`EstimatorQueues.jsx:435`). Throws on field drift / trashed secondary → reaches the existing alert. `secondary` is a full `staffEntities.get` row from `MergeEstimateDialog.jsx:60` — `updated_date` present. `estimateAfter` for the audit revision stays `secondaryAfter` (the verified intended state) rather than the helper's return — see observation O-1. |

### F-3 — `updateEstimateRevisionAudit`: caller-scoped read made `complete_manual_revision` unreachable
`entry.ts:41` bound `base44.entities.AllInOneEstimate` (caller context). `AllInOneEstimate` read-RLS is backend-only → `.catch(()=>null)` → `!estimate?.id` → 404 for every actor (proven: baseline bundle returns 404 in the harness). Fix binds `base44.asServiceRole.entities.AllInOneEstimate` — the handle is used only *after* `authenticateSignShopSession`/`auth.me()` succeeds (L35-37), matching the sibling `RevisionService` service-role handle and `asServiceRole` reads elsewhere in the same function (L134). Renamed `EstimateUser` → `EstimateService`; the old name encoded the defect.

### F-4 — `EstimatorAuditPanel.jsx:49`: `AdminAuditLog` read bypassed the staff gateway
`AdminAuditLog` is **not** in the `base44Client` `STAFF_READ_ENTITIES` proxy set, so the raw `base44.entities.AdminAuditLog.filter` went straight to platform RLS (admin-only) and failed for EmailGate sessions → the "Admin actions" tab was always empty. Fix routes through `staffEntities.AdminAuditLog.filter` — the same path `DataExportPanel.jsx:94` already uses (`staffEntities.AdminAuditLog.list`). `AdminAuditLog` sits in the gateway's `ADMIN_READABLE` tier (`staffDataRead:145`), so the admin role is re-checked server-side; the panel itself mounts only under `isAdmin` (`EstimatorSettings.jsx:88-92`). `.catch(()=>[])` semantics preserved — for non-admins the gateway marks the entity `denied` and the client resolves `[]` (verified in harness).

## Verification (`test-o013-fixes.mjs` — 20 assertions, all pass)

Bundles the **real remote modules** (esbuild + stubs): `staffEntityWrite`, `staffDataRead`, `staffEntities` client, `estimatePersistence`, shared `estimateRevisionAudit` — plus baseline+fixed `updateEstimateRevisionAudit` bundles.

- **RED (bug proven):** `op:'update'` on `AllInOneEstimate` → 403 through the real gateway; `staffEntities.AllInOneEstimate.update(...)` → 403 end-to-end through the real client facade; baseline `complete_manual_revision` → 404.
- **GREEN (fix proven):** all three write payloads → 200 `updated:1`; fixed `complete_manual_revision` → 200 with `revision_status:'completed'`, correct `quote_version`/`new_status`/`completed_at`; `attach_delivery_evidence` regression → 200; admin `staffEntities.AdminAuditLog.filter` → real rows via the batch path.
- **Fail-closed preserved:** non-admin `AdminAuditLog` → `denied`→`[]`; no session → 401; unanchored/wide `updateMany` queries → 400; stale anchor → `updated:0` (drives the bulk-status failure branch); drifted merge-archive → throws (reaches the alert).
- **Static:** no `staffEntities.AllInOneEstimate.update(` call remains; fixed files transform cleanly under esbuild.

## Observations (not fixed — flagging for the audit trail)

- **O-1 · `staffDataRead` 45s response cache covers `get`-by-id reads** (`readOneCached`, key = request + role tier + owner scope). `replaceEstimateFieldsIfUnchanged`'s post-write re-read can therefore return the pre-write row — every CAS caller already lives with this. It is why the merge-archive fix keeps `secondaryAfter` (verified intended state) for the revision's `estimateAfter` rather than trusting the helper's re-read. Pre-existing behavior; not introduced by these fixes.
- **O-2 · `staffEntities` client 30s read-cache + denied-scope are keyed by session token** — correct; a different user on the same token is impossible by construction.
- **`updateMany` zero-match is a silent 200** (`{updated:0}`) — the bulk-status fix adds the `updated !== 1` check precisely because of this contract.

## How to apply (parent agent)

```
npx base44@latest sandbox edit <file> --app-id 68dfcc5e57bbbc35387da97c --branch main --json
# per fix entry in SPEC.json — each old_string verified unique at 1fe65f444
# fallback: sandbox write <file> < fixed/<path>  (prefer edit; re-verify head first)
# after edits: re-run node .audit-work/foundation-o013-fixes/test-o013-fixes.mjs
# against re-pulled files, then sandbox checkpoint
```

## Untouched (per scope)

- F-1 `fileBridgeMaintenance` — FileBridge module, outside estimator scope.
- F-5..F-9 notes + all REQUIRES-LIVE-PROBE items.
- `src/api/base44Client.js` `STAFF_READ_ENTITIES` — considered for F-4 but rejected: adding `AdminAuditLog` there proxies it for every caller (still admin-gated server-side) while the `staffEntities` direct route matches the established `DataExportPanel` pattern and keeps the diff in one file.
- Other gateway allowlists — no changes needed; every fixed call already fits the existing contract.
