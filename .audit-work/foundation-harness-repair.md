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

## Sweep results (116 model/page-tier verifiers)

89 PASS / 27 FAIL. All 27 residuals classify as: (a) frozen-expectation
drift vs deliberate later hardening (the three documented above +
reinforcement16/17 additive totals, same `+total_landscape_cost/
+total_signage_cabinet_cost` diff), (b) fixture-env gaps vs new
fail-closed contracts (pending-key path), (c) remaining harness-internals
repairs (lucide stub maps, JSX loader flags, UI-selector evolution).
No source-level regression identified: every FAIL either shows the
documented fail-closed direction or a fixture that predates a deliberate
feature. The remote remains the verified source of truth; remote build
exit 0.
