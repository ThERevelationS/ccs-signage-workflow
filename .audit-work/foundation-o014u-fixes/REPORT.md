# O-014u — candidate fixes for the O-014t silent-failure + lint audit

**Unit:** `foundation-o014u-fixes` (candidate fixes only — NO remote writes, edits, checkpoints, deploys, publishes, or entity ops)

- **App:** `68dfcc5e57bbbc35387da97c`, branch `main`
- **Remote HEAD at pull:** `37d401b5aecbafc7ce1773af233efdde22c7ee75` (`37d401b5a External agent changes`)
- **Parent audit:** `.audit-work/foundation-o014t-lint/report.md` — 10 real silent-failure defects (R-1…R-10) + 6 lint findings (L-1…L-6)
- **Layout:** `remote/` = fresh `sandbox read` pulls at HEAD; `candidates/` = fixed files; `test-o014u-fixes.mjs` = model/transient-injection harness; `SPEC.json` = machine-readable ledger
- **Reference implementations mirrored:** `foundationTemplateService.js` + `FoundationTemplateDialog.jsx` (landed O-014 fixes), pulled read-only into `remote/`
- **Read-only dependency pulled:** `builder/builderEntityPersistence.js` (canonical CAS helper — bundled for real inside the harness)

## Verification summary

| Check | Command | Result |
|---|---|---|
| Harness | `node .audit-work/foundation-o014u-fixes/test-o014u-fixes.mjs` | **PASS — 23/23 cases** |
| Syntax | `npx esbuild <file> --loader:.jsx=jsx --outfile=NUL` per candidate | **13/13 clean** |
| Lint | repo flat-config rules mirrored into `candidates/`, scoped to the 13 touched files | **0 errors, 0 warnings** |
| Diffs | `diff -u remote/<f> candidates/<f>` for every file | all hunks limited to the listed fixes |

The harness bundles candidates under Node + react-test-renderer with injectable entity/gateway stubs. The **real** `builderEntityPersistence.js` CAS helper is bundled (not stubbed), so anchored `updateMany`/`deleteMany` query shapes, `{updated:n}`/`{deleted:n}` result verification, retry/re-read behavior, and not-found classification are exercised for real.

## Claim-safe ledger (one paragraph per defect)

**R-1 — `moduleShared/moduleTemplateService.js`.** `deleteModuleTemplate` resolved its pre-read with `.get(id).catch(() => null)` and returned `true` on falsy `current`, so any transient get failure (500/429/timeout/network) minted a false delete-success and the dialog dropped a live template row. The candidate uses an explicit try/catch: canonical not-found detection (status 404, or "not found"/"does not exist" matched across `message`, `response.data.message/error`, `data.message/error`) returns `true` as already-gone; all other errors rethrow. The fetched record must be a non-array object with `current.id === id` or the delete aborts, and the delete still routes through the anchored `deleteEntityIfUnchanged` CAS helper. Harness proves: 404 family resolves with no delete attempted; 500/TypeError/403/429 propagate; null/array/wrong-id/scalar fetched records abort; a verified record issues exactly one `{id, updated_date}`-anchored `deleteMany`.

**R-2 — `moduleShared/ModuleTemplateDialog.jsx` (load).** The load effect ran `listModuleTemplates(...).then(setTemplates)` with no rejection handling: a failed load leaked an unhandled rejection and rendered a fake "no templates" list indistinguishable from an empty library. The candidate adds `loading`/`loadFailed`/`error` state plus a seq-guarded `loadRows()` (mountedRef + loadSeqRef make stale responses inert), surfaces the failure message with a Retry affordance, and renders rows only after a resolved load. Harness: rejecting mount shows failure copy + retry rather than fake-empty; retry with a now-resolving loader recovers the real list.

**R-3 — `moduleShared/ModuleTemplateDialog.jsx` (save).** `save()` had try/finally with no catch, so a save rejection surfaced nowhere while `busy` silently reset — a silent save failure. The candidate catches and surfaces `e.message || "Template could not be saved."` inline with the dialog staying open; the success path (idempotent attempt key, name reset, `onClose`) is unchanged. Contract note verified against all 8 out-of-scope caller pages: `onApply` callbacks return `undefined`, so the dialog correctly closes after a non-throwing save rather than requiring a boolean success return. Harness: rejection surfaces inline error and the dialog stays open; success closes and the service receives moduleKey + idempotency data; a throwing `onApply` surfaces and stays open while an `undefined`-returning `onApply` still closes.

**R-4 — `moduleShared/ModuleTemplateDialog.jsx` (delete).** The per-row delete ended in a bare `catch {}` whose own comment admitted the failure was a no-op; combined with R-1 a transient pre-read error could instead mint false success and drop the row. The candidate surfaces `e.message || "Template could not be deleted."` in the dialog error region and filters the row only after `deleteModuleTemplate` resolves — which now means verified delete or genuine not-found, never transient guesswork. Harness: transient PRE-READ 500 keeps the row + shows the error; 404 removes the row; CAS delete rejection keeps the row + shows the error.

**R-5 — `products/clipboardService.js` + `aio/ClipboardManagerModal.jsx`.** `removeClipboardItem` used `.get(id).catch(() => null)` + `if (!current) return`, so every transient get failure silently returned success and the modal unconditionally filtered the row — a live clipboard item disappeared from the UI. The service now uses explicit try/catch: canonical not-found resolves (already gone), transient errors rethrow. The modal wraps removal in try/catch with `busyId` guard + `setError`, and filters the row only after the service resolves. Harness: service 500/429/TypeError propagate, 404 family + resolved-null return without delete, verified record issues an anchored `deleteMany`; modal keeps the row + surfaces the error on transient failure and drops it only on confirmed removal.

**R-6 — `pages/EstimatorQueues.jsx` (permanent delete).** `handlePermanentDelete` read `EstimateAcceptance.filter(...).catch(() => [])` before `window.confirm` — a transient failure resolved to "no acceptances" and skipped the only warning in front of an irreversible delete. The candidate wraps the read in try/catch that fails CLOSED: any rejection sets `trashError` ("Linked records could not be verified, so the estimate was not permanently deleted. Try again." + error detail) and returns before confirm. Harness: rejecting read shows no confirm, attempts no delete, and renders the block reason; verified acceptances adorn the confirm warning ("2 recorded customer acceptances") and the delete proceeds only on confirm.

**R-7 — `pages/EstimatorQueues.jsx` (quick trash).** The open-revision guard called `getOpenEstimateRevision`, which ends in `.catch(() => null)` — correct for its advisory caller (`ensureEstimateLifecycleRevision`, where null just triggers ensure) but fail-open for the trash guard: a transient read error let an estimate with an open revision be trashed. The candidate performs the identical bounded read inline — `loadAllEntityRows({entity: EstimateRevision, query: {estimate_id, revision_status: "open"}, sort: "-revision_number", limit: 50, label: "Open estimate revision"})` — without the swallow, so rejection reaches the handler's existing catch which sets `trashError` and returns (fail closed). The out-of-scope helper itself is untouched; its now-dead import was removed. Harness: rejecting read shows no confirm and no trash with read args verified identical to the helper's; an open revision blocks with a message before confirm; verified-empty proceeds to confirm + soft delete.

**R-8 — `aio/BuilderPartsPanel.jsx` (group reorder).** `persistGroupOrder` ran `updateMany({id},{sort_order}).catch(() => null)` per moved group — rejections and CAS no-matches (`updated: 0`) were equally swallowed, so the drag order appeared applied while persistence silently diverged. The candidate anchors each write on the loaded `updated_date` when known, verifies `result.updated === 1`, collects failures, and on any failure restores the previous order, alerts the user naming the failed groups ("The saved order was restored — try again."), and re-reads the product to resync. Harness: write rejection reverts the visual order + alerts + re-reads; `updated: 0` counts as failure rather than fake-applying; success applies the order with anchored writes and no alert.

**R-9 — `aio/BuilderPartsPanel.jsx` (collapse toggle).** `toggleOpen` ran `.get().catch(() => null)` for its pre-read (transient → `current` null → early return while the optimistic `setOpen` stayed flipped, diverging from persisted `is_collapsed`) and `.catch(() => null)` on the CAS write (failure → UI held a collapse state the record never stored). The candidate wraps both separately: any rejection reverts `setOpen(!next)` and alerts "Part Group collapsed state could not be saved." with the error detail appended (descriptive lead + diagnostic tail, matching the panel's other alerts); success refreshes `groupVersionRef` from the verified write result. Harness: pre-read 500 and CAS write rejection each revert `open` + alert; success persists a real `{$set: {is_collapsed}}` anchored on the loaded `updated_date`, verified by the helper's post-save re-read, with no alert.

**R-10 — `useSectionSync.js` (deleteOwnedSection).** The exported helper ran `delete(project_id).catch(() => null)` — every delete outcome swallowed. Decision: **fixed rather than removed** — it is part of the documented module-shared API surface (jsdoc'd, adjacent to used exports), zero callers at HEAD `37d401b5a` was verified by a full remote source search, and the corrected implementation can never fail silently; a code comment records the O-014u rationale. The candidate returns `false` for non-owned/unknown-module/missing-project no-ops, `true` for verified delete or canonical not-found, and rethrows transient delete errors. Harness: 500/429/TypeError/403 propagate; 404 resolves true; resolved delete resolves true; non-owned/unknown-module/missing-project return false without touching the entity.

**L-1…L-6 — lint findings.** `paintPricingAvailability.js`: dead `paintSettingNumber` specifier removed. `MasterConcreteStoneTab.jsx`: dead default `React` import removed (automatic JSX runtime; `react-in-jsx-scope` is off). `MasterSuppliesTab.jsx`: dead `base44` import removed. `inventorySources.jsx`: dead lucide `Anchor` specifier removed. `FoundationEstimator.jsx`: dead `validateFoundationSyncAttempt` specifier removed — O-012 replaced its call with `resolveFoundationSyncReceiptForSave` which validates internally; the symbol stays exported and used by `foundationBuilderRecovery.js`. `foundationCatalogIntegrity.js:121`: `priceBasis: row =>` became a zero-argument `priceBasis: () =>`. Scoped eslint re-run over all 13 candidate files: **0 errors, 0 warnings**.

## Out-of-scope / deferred

- The audit's eight O-014z **borderline fail-open dedupe/guard reads** were intentionally not touched — those files are outside the authorized ownership list.
- `getOpenEstimateRevision` and `estimateRevisionService.js` are out of scope; the strict read lives at the queue call site instead.
- No checkpoint was created: the task explicitly forbade any remote writes, and a sandbox checkpoint is a remote-side artifact. If application is approved later, apply candidates → sandbox checkpoint → verify → (optional) publish per normal flow.
- `candidates/eslint.config.js` is a verbatim copy of the repo flat config placed inside the candidate tree solely so the scoped lint run resolves `files` globs against the candidate `src/` — it is not a code change.

## Reproduce

```bash
node .audit-work/foundation-o014u-fixes/test-o014u-fixes.mjs   # PASS o014u-fixes passed=23 failed=0
cd .audit-work/foundation-o014u-fixes/candidates
npx eslint src/components/estimator/aio/BuilderPartsPanel.jsx \
  src/components/estimator/aio/ClipboardManagerModal.jsx \
  src/components/estimator/foundation/foundationCatalogIntegrity.js \
  src/components/estimator/moduleShared/ModuleTemplateDialog.jsx \
  src/components/estimator/moduleShared/moduleTemplateService.js \
  src/components/estimator/paint/paintPricingAvailability.js \
  src/components/estimator/products/clipboardService.js \
  src/components/estimator/useSectionSync.js \
  src/components/masterInventory/MasterConcreteStoneTab.jsx \
  src/components/masterInventory/MasterSuppliesTab.jsx \
  src/components/masterInventory/inventorySources.jsx \
  src/pages/EstimatorQueues.jsx src/pages/FoundationEstimator.jsx \
  --no-warn-ignored -f stylish   # clean
```
