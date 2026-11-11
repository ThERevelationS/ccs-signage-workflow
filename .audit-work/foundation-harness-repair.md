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
