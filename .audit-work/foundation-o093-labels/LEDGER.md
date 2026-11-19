# O-093 (CMP-H02) — input-layer labels / ft-in entry / help / defaults

## Claim-safe ledger paragraph

> **O-093 input layer (labels · entry · help · defaults) — implemented as
> candidates against remote `2083c6dbb`, zero remote writes.** A new pure
> module `foundationFtInEntry.js` parses feet/inches text
> (`12' 6"`, `12'-6"`, `12.5'`, `150"`, `12 6`, `12'6`, plus fraction, mixed,
> dash-pair, signed, and mark-variant forms) to canonical inches and formats
> inches back to `12' 6"`-style display; a shared controlled field widget
> commits every keystroke through a draft boundary with the same contract as
> the CMP-A08 `inventoryDraftInput` it replaces — blank stays blank, parseable
> commits canonical inches, malformed stores **verbatim** so the existing
> field-issue diagnostics flag it — never `0`, never `NaN`, never silently
> coerced. `foundationGeometryInputs.js` gained an additive, fail-closed
> `FOUNDATION_DIMENSION_FIELDS` map supplying plain-language labels,
> contextual help (e.g. *"Pier depth below grade — must reach below frost
> line"* on the footing-depth entry), suggested-format **placeholders**
> (display text only — no stored defaults were minted anywhere), and
> per-field unit/ftIn/signed metadata across seven sections (foundation card
> map, pole, wall, wallCap, cabinet, wallOutline, landscape). Five panels
> (Poles, Walls, WallCaps, SignageCabinets, LandscapeDesigner) plus the
> WallShapeEditor rectangle entry consume it through the existing
> field/schema seam; stored values remain canonical inches with no schema
> change and issue contracts (`field`/`code`/`message`, `aria-invalid`,
> `aria-describedby`, `role=status`) are appended to, never replaced.
> Verification: `verify-o093-model.mjs` — **122/122 assertions PASS**
> including all six required acceptance forms and 20+ malformed rejects;
> `verify-o093-browser.mjs` — **39 assertions PASS on real Chrome** mounting
> the candidate panels against the real calc modules (`calcPoles`,
> `foundationWallPricingIssues`, `calcSignageCabinetPricing`,
> `foundationWallRectangle`, `landscapeSummary`), confirming verbatim
> malformed drafts reach inline issues, legacy `y_offset_inches` migrates to
> canonical `embedment_inches` on edit, and labels/help/placeholders render;
> screenshots captured at 1280 and 390 widths. esbuild syntax-checks all 8
> candidate files clean. Byte-exact remote baselines preserved under
> `remote-baseline/` (the flagged `foundationGeometryInputs.js` divergence was
> a missing final newline only).
> **Remainders, by design:** the dimensional diagram is the classified
> (b-scene) half of O-093 — untouched, deferred to the scene/module phase;
> the foundation-item **card** labels (FoundationItemCard.jsx) are mapped in
> the field map but not rendered — that file is a protected choke point owned
> by B-3 recovery, noted in `CARD-LABEL-REMAINDER.md`. `FoundationItemCard.jsx`,
> `FoundationEstimator.jsx`, `foundationCalc.js`, `foundationReinforcement*`,
> `partSync.js`, and `FoundationBOM.jsx` were not modified.

## Verification artifacts

| Artifact | Result |
| --- | --- |
| `verify-o093-model.mjs` → `verify/model-run.txt` | PASS — 122/122 assertions |
| `verify-o093-browser.mjs` → `verify/browser-run.txt` | PASS — 39 assertions, channel=chrome |
| `verify/fixture-out/shot-poles-1280.png` | real-component render evidence |
| `verify/fixture-out/shot-poles-390.png` | narrow-width evidence |
| `verify/fixture-out/shot-walls-1280.png` | walls panel render |
| `verify/fixture-out/shot-shape-1280.png` | wall-outline editor render |
| `verify/fixture-out/shot-landscape-1280.png` | landscape designer render |
| esbuild per-file syntax | 8/8 candidate files OK |
