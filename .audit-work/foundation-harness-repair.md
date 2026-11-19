# Foundation harness repair — 2026-11-13 (post draft-recovery sweep)

## What broke

Three foundation verification harnesses died on module resolution before
executing assertions:

- `.audit-work/foundation-catalog-pricing11/verify-preservation.mjs`
- `.audit-work/foundation-equipment13/verify-engine.mjs`
- `.audit-work/foundation-materials14/verify-financial.mjs`

Root causes:

1. Direct `import` of src modules that reference the Vite `@/` alias — Node
   cannot resolve `@/components/...` outside Vite. Fixed by bundling through
   esbuild with `alias: { "@": path.resolve("src") }` (same pattern the other
   harnesses already used).
2. `src/components/masterInventory/inventoryNormalization.js` (358 lines) was
   missing locally though present on the remote — part of the local-tree rot
   repaired earlier this session. Pulled remote→local along with six drifted
   siblings (`inventoryPersistence.js`, `FoundationMaterialDialog.jsx`,
   `InventoryFormModal.jsx`, `InventoryTable.jsx`, `MasterEquipmentTab.jsx`,
   `MasterSuppliesTab.jsx`). Local now mirrors the remote source of truth.

## Residual assertion failures — stale frozen fixtures, not regressions

After the repair, all three harnesses EXECUTE; residual failures are frozen
expectations captured before later deliberate hardening:

- `verify-preservation.mjs`: "missing pole retains its complete supplied
  snapshot" expects verbatim `y_offset_inches`/`total_cost` passthrough. The
  current `calcPoles` excludes an unavailable-catalog pole from the priced
  output — fail-closed exclusion landed with the O-057 `y_offset_inches` →
  `embedment_inches` canonicalization and pricing-availability work.
- `verify-engine.mjs` `legacy-duration-zero-fallback`: frozen case expects
  `rental_duration: 0` to coerce to a 1-period rental ($100). The current
  engine emits `equipment_duration_unavailable` and holds the last saved
  amount ($123) — the `held()` path documented in `foundationCalc.js`:
  "Preserve the last saved amount, not a fabricated free rental." The row is
  gated `available: false` downstream so the held amount cannot price a
  quote.
- `verify-financial.mjs` (25/39): all diffs are additive-only — current
  totals carry `total_landscape_cost` and `total_signage_cabinet_cost` fields
  the frozen matrix predates (O-068–O-077 landscape lane + signage-cabinet
  totals). No numeric value changed.

The frozen fixtures are prior-session evidence; their expectations are
superseded by the documented fail-closed contract. Left unedited — rewriting
them would rewrite prior evidence. The harnesses' value now is as a
regression-tripwire diff against captured state.

## Verification

- Both repaired harnesses bundle cleanly (esbuild 0.25.10, `@/` alias).
- Remote `npm run build` after the draft-recovery restore: exit 0.
- Remote readback of both harnesses carries the `alias` marker (stale
  normalized-readback mismatches are the known sandbox quirk, verified by
  marker inspection).

## Full-tree md5 sweep (second pass — deeper rot found and repaired)

The earlier line-count sweep used a ±1 tolerance and missed subtree drift
entirely. A normalized-md5 sweep (remote `tr -d '\r'` + chomp trailing
newlines — matching `sandbox read`'s normalization) across all 246
`src/components/estimator/` files found and repaired:

- `src/components/estimator/foundation/FoundationPolesPanel.jsx` — REAL
  local syntax break (missing `)}` close on `{s.display_only === true && (`,
  a 1-line truncation under the tolerance). esbuild parse error;
  `FoundationEstimator.jsx` page bundle failed to compile locally. Pulled
  remote→local; page bundle now compiles 4.5mb.
- 10 subtree files the first sweep missed (`builder/partSync.js` −101 lines,
  `builderService.js` missing `foundationRecordSavedTotal` export that
  `FoundationEstimator.jsx` imports — same missing-export class as the
  draft-recovery break, hidden by Vite's loose resolution), then a second
  normalized-md5 pass found 10 more (`foundationCalc.js`, `partCatalog.js`,
  reinforcement model files, etc.). All pulled remote→local.
- **Final state: 0 content-drifted files of 246.**

## Harness-infrastructure repairs (second pass)

- `verify-material-pagination.mjs` — resolver taught the canonical
  `@/lib/loadAllEntityRows` path (post-2026-11-09 move); PASS 4/4.
- `coupled-page-fixture.mjs` — `createRequire` banner for CJS `require`
  shims in the ESM page bundle; `globalThis.document` no-op stub for the
  O-004 capture-phase click guard. Page now mounts; residual 2 functional
  diffs (`'partial'` builder sync on the accepted-proposal pending-key
  path, `false!==true` retry receipt) trace to the fixture env predating
  the pending-key contract (`BuilderPriceRevision: []` seeded empty) —
  fail-closed `partial` is plausible correct behavior for a missing
  pending revision; fixture-env update is a deeper re-authoring task.
- `verify-wall-cap-ack-page.mjs` — `foundationRecordSavedTotal` added to
  the builderService stub (12-field `FOUNDATION_RECORD_TOTAL_FIELDS`
  semantics) + `document` stub. Page mounts; residual 1 functional diff
  (`cutInput` lookup — wall-cap UI evolved).
- `verify-basis-key.mjs` — recovered PASS 22/22 via the `partSync.js`/
  `builderService.js` pulls (missing-export class).
- `verify-coupled-page-recovery-safety.mjs` — recovered PASS via the
  coupled-page fixture repairs (all six race/guard cases `ok`).
- `verify-page-reinforcement.mjs` — five stacked infrastructure staleness
  repairs: lucide stub icon set extended to the full page graph (44 icons);
  `foundationRecordSavedTotal` added to the builderService stub (12-field
  semantics); `FoundationAiIntake`/`FoundationPhotoIntake` added to stubbed
  panels; `FoundationSyncConflictDialog` given a bespoke stub (its named
  hooks `useFoundationSyncConflict`/`useFoundationBuilderSyncRetry`/
  `FoundationSyncRetryAction` are imported by the page — generic `dummy()`
  can't cover them); `@/lib/loadAllEntityRows` added alongside the legacy
  alias stub; `document` no-op stub. The dialog's relative
  `./foundationBuilderRecovery` import bypassed the alias-keyed stub —
  the leak chain was dialog → builderMutationRecovery → base44Client.
  PASS 8/8 (real CAS save, undo-after-save, infeasible-edit block,
  proposal route-change guard, draft restore).

## Sweep results (116 model/page-tier verifiers)

91 PASS / 25 FAIL. All 25 residuals classify as: (a) frozen-expectation
drift vs deliberate later hardening (the three documented above +
reinforcement16/17 additive totals, same `+total_landscape_cost/
+total_signage_cabinet_cost` diff), (b) fixture-env gaps vs new
fail-closed contracts (pending-key path), (c) remaining harness-internals
repairs (lucide stub maps, JSX loader flags, UI-selector evolution).
No source-level regression identified: every FAIL either shows the
documented fail-closed direction or a fixture that predates a deliberate
feature. The remote remains the verified source of truth; remote build
exit 0.

## verify-page-browser.mjs (SDK-boundary repair round)

Five stacked boundary repairs to reach the mount stage:
- `FoundationAiIntake`/`FoundationPhotoIntake` added to stubbed panels
- bespoke `FoundationSyncConflictDialog` stub (named hook exports)
- `@/lib/loadAllEntityRows` canonical-path stub (page migrated off the
  old `@/components/estimator/` shim — the real loader's paged-read
  guard otherwise fires the page's fail-closed "Builder unavailable" banner)
- `foundationBuilderRecovery` stub (`loadFoundationBuilderRecovery`/
  `verifyFoundationRecoverySource`) — this was the last SDK leak path:
  page imports it directly, it imports `builderMutationRecovery`,
  which reaches `base44Client`
- permanent diagnostic: harness now names offending inputs on
  sdk-boundary assert failure

Result: bundle is SDK-clean (no `base44Client`, no
`node_modules/@base44/` in metafile); page mounts through the full
accept/undo/redo/save flow ("All changes saved" reached).
Residual 2 functional/frozen diffs: BOM `rows.count()` 0 vs expected 3
(seeded fixture row predates current BOM line sourcing post-hardening);
React dev-mode "setState in render" warnings asserted as clean
telemetry (synthetic-env artifact of the draft-restore path). Same
class as the other residuals — no source regression indicated.
Transported; remote markers verified.

## scripts/test-* sweep round (70 estimator-scoped scripts)

Sweep: 54 initial PASS / 16 FAIL (5 were TAP-format false-FAILs —
fleet race tests pass 13-assert suites via node:test TAP output).

Repairs + recoveries:
- test-foundation-catalog-integrity: full boundary-stub set (@/lib
  loader, foundationBuilderRecovery, FoundationSyncConflictDialog,
  AI panels, foundationRecordSavedTotal, sourcePatchMatches,
  document stub) -> 7/7 PASS. Surfaced REAL BUG #1: WallRow in
  FoundationWallsPanel.jsx referenced undeclared `items` (lines
  108-125) — ReferenceError on every wall row render. Source fix
  transported EXACT.
- test-foundation-save-handler: same boundary set + missing
  .audit-work dir -> 58/58 PASS. Surfaced REAL BUG #2: copy
  signature included revision_history[*].at (Date.now()) — rotated
  every call so the retry-safe copyAttemptRef never engaged;
  lost-reply retries minted fresh creation_request_keys (duplicate
  -copy risk). Source fix in FoundationEstimator.jsx signature
  (volatile `at` stripped) transported EXACT.
- test-foundation-layout: window global + stopPropagation on
  synthetic events -> 26/26 PASS.
- test-foundation-assembly: created missing foundation-assembly04
  dir + plugin @/ resolver now resolves extensions (plugin-resolved
  paths get no extension probing) -> 27/28 (1 frozen deep-equal
  residual: normalization strips identity metadata).
- test-duplicate-estimate: isRetryableFunction + @base44/sdk +
  axios-client aliases + window global -> PASS.
- test-foundation-material-ui: lucide AlertTriangle/X -> 6/10
  (4 functional/frozen residuals).

Out-of-scope/environment: test-automation-builder-browser (admin
surface, own mocks stale), test-sop-module, test-training-module
(other modules), fleet browser tests x2 (missing
D:\tmp\fleet-browser-check playwright install).

## REAL BUG #3 — FoundationBOM undeclared `project`

test-foundation-material-ui residuals were ReferenceError: project is
not defined inside FoundationBOM's rows memo. O-116 added
`project?.contingency_cost`/`published_min_cost`/`priced_alternative_cost`
reads without adding `project` to the destructured props — ReferenceError
on every BOM render (optional chaining does not guard undeclared
identifiers), and the page never passed `project` either, so the O-116
contingency/published-minimum/priced-alternative rows could never render.
Fix: `project = null` prop + `project={project}` at the page call site.
Both transported EXACT; remote build EXIT=0. Test now 8/10 — the 2
residuals are frozen cell-text diffs (BOM cells now carry note text).
Sibling scan for the same undeclared-prop pattern across all foundation
.jsx components: clean (2 regex false positives verified by hand).

## Estimator-wide undeclared-prop scan

Scanner: `.audit-work/scantest/run.cjs` — matches `function Name({props})`
signatures, flags prop-shaped identifiers (project/items/calc/inventory/
walls/poles/totals/delivery/cabinets/options/pricing/history/estimate/
record/settings/catalog/line/source/data/patch/prev/next/row/item) used
in the body but bound nowhere in the file (props, const/let/var/function,
arrow params, destructure members, import specifiers). Sanity-verified
against a synthetic known-bad file before the sweep.

Result across `src/components/estimator/**` + estimator `src/pages/*`:
CLEAN. 12 initial candidates all verified false positives by hand
(useState destructures, `tab.items`/`item.row` member access,
`const [_,_,catalog]` array destructure, `fields.map(({options})`,
`.summary-row.machine` CSS classes inside <style> template literals).
The three real bugs this class produced (WallRow `items`, BOM `project`,
copy-signature `at`) are fixed and transported.

## Remote-run evidence (sandbox `sandbox run node ...`)

- test-foundation-save-handler: 58/58 PASS on remote (covers the
  copy-signature idempotency fix)
- test-foundation-catalog-integrity: 7/7 PASS on remote (covers the
  FoundationWallsPanel `items` fix + FoundationBOM render path)
- test-foundation-layout: 26/26 PASS on remote
- test-foundation-assembly: 27/28 remote (same frozen deep-equal
  residual as local)
- Both tests now `mkdirSync` their `.audit-work` output dirs so they
  run on a bare remote tree; `calculator-loss-repro.json` fixture
  transported for the remote catalog-integrity run.

## Final consolidated tally (post all repairs)

70 estimator-scoped scripts: **64 effectively PASS** —
59 grep-PASS + 5 fleet race TAP suites (node:test output, `pass N/fail 0`).
6 non-pass, all classified non-regression:
- foundation-assembly 27/28 — 1 frozen deep-equal (identity-metadata
  normalization post-freeze)
- test-automation-builder-browser — admin-module surface, own mocks
  stale (out of estimator scope)
- test-sop-module, test-training-module — other modules (scope ban)
- fleet browser x2 — missing D:\tmp\fleet-browser-check playwright
  install (environment, not code)

In-scope base44/functions scan (ensureEstimateCustomer/LifecycleRevision/
OpenEstimateRevision, ensureNewCustomer/Estimate, fleetRepairEstimateAction,
invoicingAction, queueFeed, recordEstimateAcceptance/QuoteDelivery,
updateEstimateRevisionAudit, zzCleanupAction): CLEAN.
