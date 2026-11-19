# O-012 (CMP-A12) — Foundation reopen/quote/revision/WO handoff verification

App `68dfcc5e57bbbc35387da97c`, branch `main`. Remote HEAD analyzed `101321a04`,
re-verified `2e661df98e96e1746bb2f2db4d03b3033ea0ace9` — all seven touched
files byte-identical; diffs apply cleanly. **No remote writes.**

## Result

Contract chain verified on the REAL remote modules (esbuild bundles + shared
in-memory entity store): **36/36 model cases pass**, including 14 RED cases
proving each baseline defect. `verify-handoff.mjs` → `verify-handoff-results.json`.

## Verified already-correct (no patch needed)

- `?id=` reopen: `staffEntities.get` is a staffDataRead point read with **no
  TTL cache** (only filter/list/count cached ≤30s, write-busted); page verifies
  `proj.id === id`, linked `est.id === estimateId`, owner + acknowledged
  `updated_date`; route/context generation + write epochs guard stale saves.
- Source CAS: `updateMany({id, updated_date}, {$set})` + post-read verify +
  lost-response idempotent reuse.
- Receipts: `builder_sync_attempt` shape+ownership validated on save gate AND
  recovery path (estimate, line, pending key, source revision).
- Handoff: `recordBuilderSave` preserves `line_id`/`project_id`/
  `builder_product_id`, stamps `updated_date_snapshot` = saved source version;
  estimate line CAS catches mid-handoff concurrent edits.
- Quote/WO: `customer_price_snapshot`/`total_snapshot` acknowledged chain via
  real `computePricing`/`buildCustomerQuoteRows`/`buildEstimateWorkOrderProducts`;
  WO products carry `estimate_line_id`/`builder_product_id`/`source_project_id`/
  `module_key`; parts resolve by line id then product id.
- `extractFoundation` keys stable across `cloneFoundationComponents` remap
  (index-keyed parts + `cap.id` preserved; every cross-ref remapped through
  one idMap — no dangling).
- Page copy path already strips `builder_sync_attempt` before create.

## Gaps found + hardened (candidates/ only)

| Gap | Fix | Files |
|---|---|---|
| G1 `grand_total:null` poisons `sourceProjectTotal`/`foundationRecordSavedTotal` to $0; foreign `grand_total` undercounts the persisted 12-field partition | partition-first via shared `foundationSplitFieldTotal`; `grand_total` last-resort | `builderService.js` |
| G2 orphaned `builder_sync_attempt` (named estimate deleted) bricks standalone saves forever | `resolveFoundationSyncReceiptForSave` probes via staffDataRead 404 contract → retire receipt through the same CAS patch; live foreign → keep blocking; unverifiable → keep blocking | `foundationSyncRecovery.js`, `FoundationEstimator.jsx` |
| G3 `recordBuilderSave` `|| line` fallback mints orphan `BuilderProduct` when the hint's estimate line was removed mid-session, then throws forever | throw "no longer part of the estimate" before any write | `builderService.js` |
| G4 merge/duplicate/split copy `price_acceptance_pending` verbatim → unresumable foreign marker locks the target ≤24h + permanently breaks the section's reconciliation | `assertNoPendingLinesForCopy` in `builderMutationRecovery`, applied at merge `picked`, `buildDuplicateEstimate`, `buildSplitEstimate` (post-filter via `skipPendingGuard`) | `builderMutationRecovery.js`, `EstimateDetail.jsx`, `estimateCreationService.js` |
| G5 `extractFoundation` crashes on non-array persisted subsections fed raw via `getSourceProject` during estimate reconcile | coerce row arrays + drop non-object rows once at entry | `partSync.js` |

## Open / not claimed

- **Real business-record lifecycle**: save→reopen→quote→revision→WO on live
  data is explicitly OPEN — no live-record evidence claimed.
- Duplicate/split lines share the same `project_id` + `builder_product_id`;
  the copy's builder-side save hits the `estimate_id` guard on the shared
  BuilderProduct (owned by the source estimate). Pre-existing policy gap —
  needs a source/product duplication decision, out of O-012 scope.
- Orphan retirement writes `builder_sync_attempt: null` — harness-verified;
  confirm live entity accepts null clears when candidates land.
- Browser harness not run: the real page reads the live staff gateway and
  can't be pointed at the synthetic store; the model suite bundles the same
  modules the page calls.

## Artifacts

- `candidates/` — 7 patched files (full copies of remote @ 2e661df9 + diffs)
- `diffs/` — unified diffs vs remote
- `verify-handoff.mjs` + `verify-handoff-results.json` — 36/36 model suite
- `fixture/` + `fixture-baseline/` — bundlable real/stub trees
- `remote/` + `remote-head/` — pulled remote sources (evidence)
- `SPEC.json` — machine-readable spec
