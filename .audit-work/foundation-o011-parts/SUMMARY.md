# O-011 (CMP-A11) — signage_cabinets + landscape Builder part extraction

Remote HEAD 3258e9b2 — app 68dfcc5e57bbbc35387da97c, branch main.

## Recon correction
The recon stated `extractFoundation` had NO signage_cabinets/landscape
extraction. Remote HEAD actually contains a first-pass block (partSync.js
L2562–2588 baseline): cabinets minted unconditionally with
`extendedCost = num(unit_cost) * num(quantity, 1)` — **a $0 part for any held
row** — and landscape only when `builder_calculation.landscape_cost > 0.005`
(single aggregate, ignores `project.landscape` detail and null totals).
The candidate replaces that block in place.

## What verifiably works (verified, not claimed)
- `extractFoundation` now prices cabinets through the same hardened check the
  calc runs at save (`calcSignageCabinetPricing`): priced rows mint
  `foundation:cabinet:<id|index>` fabrication parts at exact `unit_cost × qty`
  (`row.cost`); held rows mint nothing; the gap to the acknowledged section
  total (`builder_calculation.cabinet_cost` → `totals.*` →
  `total_signage_cabinet_cost`) mints one `foundation:cabinet:saved-adjustment`
  part — the equipment saved-adjustment contract. No $0 mints, ever.
- Landscape mints per-material parts `foundation:landscape:<materialKey>`
  (sqft qty, catalog rate, line cost) from `landscapeSummary`; unpriceable
  lines and legacy aggregate-only saves are preserved via
  `foundation:landscape:saved-adjustment` against the acknowledged total.
  Malformed landscape records don't crash; absent sections mint nothing.
- Equipment coverage confirmed complete — base rental, delivery, attachments,
  sub-attachments, saved-adjustment; parts sum to acknowledged equipment_cost.
- Regression: every non-cabinet/landscape part byte-identical to baseline on a
  full-project fixture (16 model cases PASS).
- `FoundationBOM.jsx`: priced cabinets + per-material site rows list normally;
  held rows list `(saved)` + `Not saved` (blocked-item/delivery precedent);
  held grids show the acknowledged `total_landscape_cost` aggregate; the
  pricing banner now lists cabinet + landscape issues. Page mount gained 3
  additive props. 6/6 browser cases PASS at 1280px + 390px, 0 page errors,
  0 foreign requests.

## What remains (Phase B, explicitly out of scope)
Rebar supports and the v2 rebar-mat part model are NOT implemented — current
rebar extraction is unchanged (per-item material + labor split only).

## Artifacts
- `baseline/` — fresh remote pulls at HEAD 3258e9b2 + raw read JSON
- `candidates/` — 3 candidate files + per-file `*.edits.json` +
  `TRANSPORT-SPEC.edits.json` (replay-verified byte-identical)
- `verify-extract.mjs` + `verify-extract-results.json` (16/16 PASS)
- `verify-bom-browser.mjs` + `bom-browser-verification.json` + snapshots/PNGs
- `SPEC.json`, `protected-files.json` (227 estimator files untouched)
