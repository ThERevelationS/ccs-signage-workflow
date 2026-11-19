# O-014 tail — scoped lint + silent-failure audit at remote HEAD

**Unit:** `foundation-o014t-lint` (audit only — no remote writes, no code edits, no checkpoint)
**App:** `68dfcc5e57bbbc35387da97c` · **Branch:** `main` · **Remote HEAD:** `37d401b5aecbafc7ce1773af233efdde22c7ee75` ("External agent changes", clean worktree, re-verified before pull)
**Date:** 2026-11-08
**Scope:** `src/components/estimator/**` + `src/components/masterInventory/**` + `src/components/foundation/**` + `src/pages/Estimator*.jsx` + `src/pages/FoundationEstimator.jsx` — **243 JS/JSX/MJS files**, mirrored verbatim to `remote/` (3.4 MB, 1:1 with the remote scope listing).
**Out-of-scope boundary (named scope did not include):** `src/pages/Estimating.jsx`, `src/pages/EstimateDetail.jsx`, `src/pages/NewAllInOneEstimate.jsx`, `src/pages/{BrickStone,CNC,ChannelLetter,CustomItems,Laser,Maintenance,Metal,Painting,Vinyl}Estimator.jsx`, `src/pages/Foundation{Catalog,Inventory,Settings}.jsx`. Out-of-scope files were only spot-read where an in-scope helper's caller lived there (noted per finding).

---

## 1. ESLint — runnable in-sandbox, scoped run at HEAD

ESLint **is** configured and runnable in-sandbox:

- `eslint.config.js` (flat config) at repo root — covers `src/components/**/*.{js,mjs,cjs,jsx}`, `src/pages/**/*.{js,mjs,cjs,jsx}`, `src/Layout.jsx`. Plugins: `eslint-plugin-react`, `react-hooks`, `react-refresh`, `unused-imports`; rules incl. `unused-imports/no-unused-imports:error`, `rules-of-hooks:error`, `react/no-unknown-property:error`.
- `package.json`: `"lint": "eslint ."`, `eslint@^9.19.0` in devDeps; installed **v9.36.0** (`node_modules/.bin/eslint` present).

**Command run remotely:** `npx eslint <the 243-path scope> --no-warn-ignored -f json -o /tmp/o014t-eslint.json`
**Result:** exit 1 — **5 errors, 1 warning across 243 files** (all 243 in-scope files linted; verified file list 1:1 vs scope). Full JSON: `lint/eslint-full.json`; file list: `lint/linted-files.txt`.

| # | File:line | Severity | Rule | Finding |
|---|---|---|---|---|
| 1 | `src/components/estimator/paint/paintPricingAvailability.js:28:3` | ERROR | `unused-imports/no-unused-imports` | `paintSettingNumber` imported, never used |
| 2 | `src/components/masterInventory/MasterConcreteStoneTab.jsx:17:8` | ERROR | `unused-imports/no-unused-imports` | `React` imported, never used (JSX runtime) |
| 3 | `src/components/masterInventory/MasterSuppliesTab.jsx:15:10` | ERROR | `unused-imports/no-unused-imports` | `base44` imported, never used |
| 4 | `src/components/masterInventory/inventorySources.jsx:36:3` | ERROR | `unused-imports/no-unused-imports` | `Anchor` imported, never used |
| 5 | `src/pages/FoundationEstimator.jsx:50:107` | ERROR | `unused-imports/no-unused-imports` | `validateFoundationSyncAttempt` imported, never used |
| 6 | `src/components/estimator/foundation/foundationCatalogIntegrity.js:121:17` | warn | `unused-imports/no-unused-vars` | arrow param `row` unused in `priceBasis` lambda |

**Reading of the results:**

- **Zero parse errors, zero `react-hooks` violations, zero `no-undef`/`no-unknown-property`** — the scoped surface compiles and follows hook discipline at HEAD. The "no lint configured" fallback (esbuild pass) was therefore not needed; ESLint's own parse is the syntax proof.
- All six findings are the same class — dead imports / dead param — cosmetic only, none can produce a runtime defect. A "0 errors" clean claim cannot be made; a "no functional lint findings" claim can.
- **Masterplan cross-check:** the O-014 ledger line says "scoped catalog lint error already resolved by reinforcement24 unit" — at HEAD `37d401b5a` there is still a lint diagnostic on the catalog surface (`foundationCatalogIntegrity.js:121`, warn-tier) **plus** five error-tier unused imports elsewhere in scope. The resolved-by-reinforcement24 claim evidently referred to an earlier specific error (now gone); treat "catalog lint error resolved" as *not fully closed* — one warn remains in `foundationCatalogIntegrity.js` and two error-tier hits sit in the masterInventory catalog tabs (`MasterConcreteStoneTab`, `inventorySources`, `MasterSuppliesTab`).
- **`FoundationEstimator.jsx:50` dead import is an O-012 wiring leftover:** `validateFoundationSyncAttempt` (exported by `foundationSyncRecovery.js:16`) was imported during the sync-attempt work but the page uses `resolveFoundationSyncReceiptForSave` (`:779`) — which calls the shape check internally. Dead import only, but worth removing or confirming nothing intended to call it.
- Confirmed landed since the O-014 subunit SPEC: **`saveDisabled` page wiring is live** — `FoundationEstimator.jsx:1431` passes `saveDisabled={pricingBlocked || catalogReloading}` + reason (the O-007 template unit completed it per ledger; verified at HEAD).

---

## 2. Silent-failure sweep — method + coverage

Mirror of all 243 files at `37d401b5a` (`remote/`); structured scans in `grep/`:

| Scan | Hits |
|---|---|
| `.catch(...)` promise handlers | 117 |
| `try/catch` `catch` blocks | 272 |
| `.then(` chains (checked for missing `.catch` on writes) | 42 |
| `console.warn` (warn-and-continue on writes) | 7 |
| `catch` bodies: EMPTY / CONSOLE-ONLY (structured scan) | 26 → all classified |
| `catch` bodies returning success-shaped values | 5 → all verified-deleted/documented |
| `catch` bodies returning default `[]`/`null`/`false` | 18 → all detection-probe/telemetry/parse guards |
| `await ... \|\| []` / `\|\| {}` / `\|\| 0` on reads | 9 → all benign defaults |

Cross-reference keys: **O-004** tombstone (`foundationDraftRecovery.js`), **O-011** saved-adjustments (`partSync.js`, `FoundationBOM.jsx`), **O-012** sync attempts (`foundationSyncRecovery.js`, `FoundationEstimator.jsx`), **O-013** fixes (`EstimatorQueues.jsx` sweep/bulk, `EstimatorAuditPanel.jsx`), **O-014** landed (`FoundationTemplateDialog.jsx`, `foundationTemplateService.js`).

### Verdict: REAL defects (fail-open / stale-success at HEAD)

| ID | File:line | Pattern | Verdict detail |
|---|---|---|---|
| R-1 | `src/components/estimator/moduleShared/moduleTemplateService.js:32-33` | `ProjectTemplate.get(id).catch(()=>null)` → `if (!current) return true` | **Transient pre-read failure reports delete success.** Identical to the defect O-014 fixed in `foundationTemplateService` — the generalized service was not updated. Any non-404 get error (500/429/timeout) → caller removes a live row from the list. |
| R-2 | `src/components/estimator/moduleShared/ModuleTemplateDialog.jsx:31` | `listModuleTemplates(...).then(set)` — **no `.catch`** | `loadAllEntityRows` rethrows; load failure = unhandled rejection + dialog renders "no templates" (the exact fake-empty O-014 fixed in the Foundation dialog). |
| R-3 | `src/components/estimator/moduleShared/ModuleTemplateDialog.jsx:50-61` | `save()` = `try/finally` — **no `catch`** | `saveModuleTemplate` rejection propagates unhandled to the click handler; dialog stays open, `busy` clears, **no error shown** — silent save failure (audit item 2's defect in the shared dialog). |
| R-4 | `src/components/estimator/moduleShared/ModuleTemplateDialog.jsx:69-71` | `catch {}` w/ comment only | Delete failure: row stays (honest list) but **zero user feedback** — silent delete failure (audit item 4's defect class). |
| R-5 | `src/components/estimator/products/clipboardService.js:206-207` + `src/components/estimator/aio/ClipboardManagerModal.jsx:77-78` | `get().catch(()=>null)` → `if (!current) return` | `removeClipboardItem` silently returns on transient get failure → modal `setItems(filter)` removes the still-existing row = **stale-remove**. Separately, a thrown CAS delete propagates through `remove` (no try/catch) = unhandled rejection, no error UI. |
| R-6 | `src/pages/EstimatorQueues.jsx:371-373` | `EstimateAcceptance.filter(...).catch(()=>[])` | Permanent-delete guard read fails open: transient → `acceptances=[]` → the "linked records keep pointing at a removed estimate" **warning is skipped** and the confirm proceeds unadorned. |
| R-7 | `src/pages/EstimatorQueues.jsx:491` | `getOpenEstimateRevision(e.id)` → `.catch(()=>null)` inside | Same shape: transient revision-list failure → `openRevision` falsy → **open-revision trash guard bypassed**; estimate with an open revision can be trashed. (`estimateMutationGuard.js:55` uses the same helper but fails CLOSED — throws on null — so the write-side gate is safe.) |
| R-8 | `src/components/estimator/aio/BuilderPartsPanel.jsx:781` | `updateMany({id:g.id},{sort_order:i}).catch(()=>null)` | Group reorder persistence fully swallowed — drag order appears applied; on reload it reverts. Also unanchored `updateMany` (no `updated_date`). |
| R-9 | `src/components/estimator/aio/BuilderPartsPanel.jsx:305-320` | optimistic `setOpen(next)` + CAS `.catch(()=>null)` | Collapse-toggle write failure leaves UI diverged from persisted `is_collapsed` until reload; no error surfaced. Minor stale-UI. |
| R-10 | `src/components/estimator/useSectionSync.js:59-62` | `delete().catch(()=>null)`, returns void | Swallowed delete in exported helper. **Currently dead code** (zero callers anywhere in `src` — remote-grepped) → latent defect for the next caller; also a cleanup candidate. |

### Verdict: BORDERLINE (fail-open on transient read, bounded by a second layer or documented advisory)

| ID | File:line | Pattern | Residual risk |
|---|---|---|---|
| B-1 | `src/components/estimator/customerLocationService.js:69` | `filter({customer_id}).catch(()=>[])` before `create` | Dedupe read failure → creates a possibly-duplicate `CustomerLocation` AND sets `is_primary_site: rows.length===0` → can wrongly flag primary. Bounded by `creation_request_key` (same address+estimate converges on retry; different addresses not protected). |
| B-2 | `src/components/estimator/customerSync.js:154` | `Customer.get(linkedId).catch(()=>null)` → falls to name-match | Transient get → `resolveCustomerForEstimate` may return nothing → `upsertCustomerFromEstimate` create path → possible duplicate Customer while `form.customer_id` points at the real row. |
| B-3 | `src/components/estimator/estimateConversionService.js:254`, `:540`, `:549` | `WorkOrder.get(id).catch(()=>null)` | Transient get → treated as not-found → conversion can proceed to create/link a **second WO** (orphans the unresolved link); `:549` undercounts `liveIds` → can bypass the "different Work Orders" guard. Downstream `convergeCreatedEstimateWorkOrder` dedupes only `estimate_id`-keyed rows. |
| B-4 | `src/components/estimator/workOrderConversion.js:68,73` | `Part.filter(...).catch(()=>[])` in `loadEstimateConversionParts` | Documented "Pure read; failures return []" — but feeds `buildEstimateWorkOrderProducts` parts pool → transient → WO products seeded **without part attachments/due-date inputs**. Documented intent is advisory; write consequence exists. |
| B-5 | `src/components/estimator/products/kitService.js:34` | `Inventory.get(item.id).catch(()=>null)` | Component read failure → `row:null` → `kitComponentSum` counts it **$0** → kit price display understates on transient. Display-path. |
| B-6 | `src/pages/EstimatorCustomers.jsx:409-415` | per-row `try{invoke}catch{skipped++}` | CSV import: any invoke failure (incl. `data.error`) is counted as "skipped" — the summary conflates "no company name" with "import failed"; no per-row error surfaced. Honesty gap, not data loss (rows weren't created). |
| B-7 | `src/pages/EstimatorQueues.jsx:175-178` | `loadQuoteDefaultsLegacy().catch(()=>{})` | Fallback defaults read failure → silently blank custom statuses/timezone. Advisory display only. |
| B-8 | `src/components/estimator/EstimateActivityPanel.jsx:21,23` | per-feed `.catch(()=>[])` | One feed failing → merged timeline silently drops that feed's rows (partial timeline, no indicator). Cosmetic. |

### Verdict: INTENTIONAL / documented / fail-closed (verified, not defects)

- **Persistence verify-probe family** — `builderEntityPersistence.js:98,107,136,162`, `estimatePersistence.js:120,131,205,213,217`, `customerPersistence.js:109,120`, `sourceProjectPersistence.js:75,85,91`, `inventoryPersistence.js:57,124`, `quickPricePersistence.js:48`, `workOrderConversion.js:640-646`, `legacyInventoryMigrator.jsx:287-297`, `idempotentEntityCreate.js`, `quoteDefaultsPersistence.js:53,63`, `workOrderSyncPersistence.js` — `.catch(()=>null)` on post-write/post-error verification reads, always followed by verified/throw; `permanentlyDeleteTrashedEstimate` distinguishes `alreadyDeleted`/`convergedAfterResponseLoss`. Fail-closed.
- **O-012 landed** — `foundationSyncRecovery.js:103-106` probe `.catch(e => 404?null:undefined)` → `undefined` → error out (fail-closed); `foundationSaveSession.js` resolves outcome objects, never rejects — all `.then` callers safe.
- **O-014 landed** — `foundationTemplateService.js:39` canonical `isNotFound`; `FoundationTemplateDialog.jsx` inner try/catch + `setError` + `loadFailed`/Retry + `saveDisabled` wired at `FoundationEstimator.jsx:1431` + template-apply catch `:1439`.
- **O-013 landed/preserved** — `EstimatorQueues.jsx:91-94` sweep `.catch(()=>{})` (in-code documented best-effort, stale-anchor no-op, next load retries); bulk-status per-row `failures` surfaced `:205-215`; `EstimatorAuditPanel.jsx:48-53` `.catch(()=>[])` semantics deliberate (denied→[]); archive lifecycle audit `try/catch{}` documented "never blocks the archive" `:458-471`.
- **Deferred-repair warn family** — `customerSync.js:71,396,415,432`, `estimateRevisionService.js:63,96` — every `console.warn` is a documented no-session/advisory secondary write with a stated reconciliation path.
- **Best-effort telemetry/audit writes** — `quoteDeliveryService.js:87-97` ("Never throws"), `recordInventoryCostChanges` (returns count, documented), `EstimatorQueues.jsx:471`.
- **Guards & probes** — localStorage/history/URL/pointer-capture/JSON-parse guards (`deepLinks.js`, `CustomerSearchDialog.jsx:18`, `EstimateProductsList.jsx:94`, `FoundationLayoutCanvas.jsx:81`, `FoundationEstimator.jsx:430,437`, `Estimator.jsx:79,86`, `EstimatorQueues.jsx:170-171,315`, `historicalBackfill.js:33,41`), `HasEnginePricing` detection probes → `false` (safe baseline path), `foundationSaveSession.js:21` isCurrent→false→'superseded' (conservative).
- **Advisory display reads** — `auth.me().catch(()=>null)` (everywhere), `loadProductionProductTypes`, `EstimateAcceptancePanel.jsx:100-102` (documented server-default), GlobalSettings thresholds (`CustomerQuotePanel.jsx:164-167`), `InventoryTable.jsx:23-24,33` usage badge, `InventoryFormModal.jsx:58-60` cost history, `Step1EstimateDetails.jsx:80-89` (pre-caught Promise.all), `productionProductTypes.js:11`, `useSectionSync.js:17` snapshot refresh, `builderService.js:53,132` (two-step resolution), `kitService` sum.
- **Recovery/resume semantics** — `importEstimates.js:386` advisory pre-check (idempotent create is the authority), `ExcelImporterDialog.jsx:290` recovery probe → real `res.errors` on failure, `BuilderPartsPanel.jsx:360,449,539,705` refresh-callback swallows (alert already shown), `historicalBackfill.js:19` → false → re-runs (conservative), `Estimator.jsx:83-93` migration `.catch` documented resumable.
- **All page-level save/delete/toggle handlers** in Estimator*/FoundationEstimator/masterInventory/foundation tabs surface errors (`setError`/`setTrashError`/`alert`) — sampled ~40 sites, zero stale-success save paths found (consistent with the O-014 landed audit claim "no false-Saved paths").
- **`estimateConversionService.js:316`** — open-AR read failure stays `null` → block reason honestly says "open AR could not be loaded" (gate still evaluates). Documented + honest.

---

## 3. Remaining real defects → suggested unit scoping

| Suggested unit | Contents | Files | Class |
|---|---|---|---|
| **O-014u — moduleShared template pair** | Port the landed O-014 fixes to the generalized pair: widen `deleteModuleTemplate` not-found detection to canonical shapes + rethrow transient (mirror `foundationTemplateService`); `ModuleTemplateDialog` load `.catch → loadFailed + retry + honest empty`, `save` `catch → setError` (visible inline — dialog has no `error` state today, add it), `remove` `catch → setError`. Check callers: `moduleTemplateService` is the shared service for all non-Foundation module template dialogs. | `moduleShared/moduleTemplateService.js`, `moduleShared/ModuleTemplateDialog.jsx` | (a) now — direct port of landed patterns |
| **O-014v — clipboard stale-remove** | `removeClipboardItem`: distinguish not-found (ok) from transient (throw/return `{removed:false}`); `ClipboardManagerModal.remove`: try/catch + error surface + only filter the row on confirmed removal. | `products/clipboardService.js`, `aio/ClipboardManagerModal.jsx` | (a) now |
| **O-014w — queue guard reads fail-closed** | `EstimatorQueues.jsx:371-373` acceptances warning-read and `:491` open-revision guard: on unverifiable read, block the destructive action with an error (never skip the warning/guard on transient). One-line-shape change: catch → setTrashError + return. | `pages/EstimatorQueues.jsx` | (a) now |
| **O-014x — parts-panel write swallows** | `BuilderPartsPanel`: `persistGroupOrder` — surface reorder write failures (toast/error + revert order); collapse toggle — revert `open` on write failure or show error. Both CAS-path already; just add outcome handling. | `aio/BuilderPartsPanel.jsx` | (a) now |
| **O-014y — lint cleanup** | Remove 5 dead imports + rename unused `row`→`_row` (or drop param); confirm `validateFoundationSyncAttempt` truly unwired vs intended call (O-012 leftover) — if intended, wire it; else delete import. | 5 files listed §1 | (a) now — trivial |
| **O-014z — fail-open dedupe reads (decision)** | `customerLocationService.js:69`, `customerSync.js:154`, `estimateConversionService.js:254/540/549`, `workOrderConversion.js:68/73`: decide policy — retry-once-then-abort vs documented fail-open; if fail-open, log a marker the review surface can see. Needs a product call on duplicate-vs-block tradeoff. | 4 files | (a)+(d) decision |
| **hygiene** | `deleteOwnedSection` (`useSectionSync.js:59`) — dead export; delete it or fix the swallow before someone wires it. `EstimatorCustomers.jsx:414` — separate "failed" count from "skipped" in the CSV summary. | 2 files | (a) trivial |

**Cross-unit note for the ledger:** R-1..R-4 are the *same file cluster family* the O-014 subunit fixed on the Foundation pair — the comment in `moduleTemplateService.js:7` says it "mirrors foundationTemplateService exactly", which is now false (it mirrors the *pre-fix* version). Highest-value follow-up.

---

## 4. Claim-safe ledger paragraph

> **O-014 tail (scoped lint + stale-success audit) — audit complete at HEAD `37d401b5a`, read-only, no remote writes.** In-sandbox ESLint 9.36 (flat config covers `src/components`/`src/pages`) run scoped to all 243 estimator-surface files (`components/estimator/**` + `masterInventory/**` + `foundation/**` + `pages/Estimator*.jsx` + `FoundationEstimator.jsx`): **5 errors + 1 warning, all `unused-imports` class — zero parse/hook/undef findings**; the earlier "catalog lint error" claim narrows at HEAD to one warn-tier dead param in `foundationCatalogIntegrity.js:121` plus 5 error-tier dead imports (incl. O-012's unwired `validateFoundationSyncAttempt` at `FoundationEstimator.jsx:50`). Silent-failure sweep over the 243-file remote mirror (117 `.catch` + 272 try/catch + 42 `.then` + warn/empty/success-return/return-default body scans): all O-004/O-011/O-012/O-013/O-014 landed protections verified present and fail-closed (template pair, draft tombstone, sync-receipt probe, CAS persistence verify family, queue sweep/bulk, audit-panel reads); `saveDisabled` page wiring confirmed live (`FoundationEstimator.jsx:1431`). **10 real defects found**, clustered: the generalized `moduleShared` template service+dialog carries the *pre-fix* versions of all three O-014 defects (transient get → false delete-success; load/save/delete with no or empty catch → fake-empty list, silent save failure, silent delete failure); `clipboardService`+`ClipboardManagerModal` stale-remove; two `EstimatorQueues` guard reads that fail open on transient (permanent-delete linked-records warning, open-revision trash guard); `BuilderPartsPanel` reorder/collapse writes swallowed; `useSectionSync.deleteOwnedSection` swallowed delete (dead export — latent). **8 borderline** fail-open dedupe/guard reads (customer location/customer/WO-linked creates; conversion parts pool; kit sum; CSV import mislabel). No false-Saved write path exists anywhere sampled — residual risk concentrates in **read-side guards that degrade on transient failure** and the **unported moduleShared template pair**. Follow-up units proposed O-014u..O-014z. Evidence: `.audit-work/foundation-o014t-lint/` (remote mirror, eslint JSON, grep scans, this report). O-014 remains OPEN pending those units.

---

## 5. Artifacts

- `report.md` — this file
- `scope-files.txt` — the 243-path in-scope file list (generated from remote `find`/`ls`)
- `lint/eslint-full.json` — raw ESLint JSON (223 KB)
- `lint/linted-files.txt` — linted file list (243 — verified 1:1 vs scope)
- `pull-remote.mjs` — mirror puller (batches of 30, `sandbox read --branch main --json`)
- `remote/` — 243-file remote mirror at `37d401b5a` (3.4 MB)
- `grep/` — raw hit lists (`hits-catch-promise.txt` 117, `hits-catch-trycatch.txt` 272, `hits-catch-swallow-shapes.txt` 90, `hits-then.txt` 42, `hits-console-warn.txt` 7, `hits-await-fallback.txt` 9, `hits-catch-console-only.txt` 26) + scanners (`scan-catch-bodies.cjs`, `scan-catch-success.cjs`, `scan-catch-returndefault.cjs`)
- `scope-gen.sh`, `scope-gen.err`, `lint/linted-files-raw.json` — tooling residue

**Mode compliance:** zero remote writes/edits/checkpoints; remote interactions were `sandbox run` (git log, ls, find, eslint), `sandbox read`, `sandbox grep` only. All local writes under `.audit-work/foundation-o014t-lint/`.
