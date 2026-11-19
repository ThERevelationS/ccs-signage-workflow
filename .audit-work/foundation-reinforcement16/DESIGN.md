# Concrete Basic Input Validation 16

## Current State And Ownership

- Navigation15 is DONE as a subunit: checkpoint `6aed818c8e4b552cf32a811e`, commit `6c06175812c0d5e078a2f7b23c25b4d7f7e711cb`, app ready. Do not repeat that activation.
- Its masterplan/claim/resume/release documents were fully reviewed and accepted. O-004 remains OPEN for broader acceptance.
- Next active task is O-015 basic foundation type/dimension/instance-count validation, not a reinforcement formula redesign.
- LOCAL core now authored and verified by the lead: `foundationInputValidation.js` + `foundationCalc.js`, 83/83 checks including all 25 frozen model cases. Pins `core-hashes.json`; evidence `financial-final.txt` / `financial-verification.json`. Do not rederive accepted results.
- COMPLETE subunit: checkpoint `6aed8aaf73b8085aacddf128`, commit `0727ffe5a7e7c9fdccbfd9998b61a6094ae2b2af`. Page/card integration, strengthened browser8, focused regressions, remote readbacks/build and exact changed-path scope pass. See `RELEASE.md`; do not repeat activation.
- Lead owns validation policy, calculator integration, financial tests, measurement authoring/execution/checking, remote writes/checkpoints, and review.
- Delegate page/card UI and browser verification only after the interfaces below are settled.
- Concrete only. Do not touch other modules, backend/schema, production records, paid integrations, publishing, deployment, or the disabled unattended controller.

## Grounded Evidence

- `fresh-source.json`: earlier current remote legacy calculator, 3D preview and both inventory/project schemas.
- `fresh-validation-baselines.json`: five current source/schema reads matching local content (schema semantically), plus NOT_FOUND for the planned input helper.
- `audit-basic-inputs.mjs`: lead-authored/read-only synthetic measurement using the accepted actual calculator bundle and frozen Materials14 case 1.
- `basic-inputs-before.json`: seven frozen observations. NEVER regenerate/overwrite it or the Materials14 frozen inputs/expected results.
- Calculator findings alone are not proof of backend acceptance. Frozen B0 browser reproduction now demonstrates the synthetic source/Builder path; real backend authorization remains unverified.
- Zero quantity becomes displayed/calculated quantity 1 with 1 CY and $866.55.
- Negative quantity -2 becomes displayed quantity 1 but -2 CY, -128 ft rebar, total -$1733.10.
- Fractional quantity 1.5 produces 1.5 CY but only the one-instance 64 ft rebar.
- Length -36 produces -1 CY and total -$659.35; zero depth still produces $146.05.
- Width `"36oops"` is silently parsed as 36; unsupported foundation type falls into the pillar-volume calculation.
- All seven cases have zero catalog issues and `itemPricing[0].available === true`.
- The frozen pre-change page guards only catalog issues. The verified unit now guards both catalog and basic input issues.

## Settled Pure Helper Interface (Lead To Author)

New file: `src/components/estimator/foundation/foundationInputValidation.js`.

- Export `foundationItemInputIssues(item, index = 0)`.
- Export `foundationProjectInputIssues(project)` to flatten item issues.
- Issue shape: `{ kind: "foundation", index, componentId: item.component_id ?? null, field, code, message }`.
- Types must be exactly `spread_foot` or `pillar`; unknown/missing types are explicitly invalid, never silently cylindrical.
- Legacy omitted/null quantity defaults to 1, matching existing semantics. Explicit zero, negative, fractional, non-finite, unsafe-integer, boolean, empty-string or malformed count is invalid.
- Decimal count strings must have no nonzero fractional digits before numeric conversion; do not let floating-point rounding silently turn `"1.00000000000000001"` into a valid whole count.
- Accept finite numeric values and full ordinary signed decimal strings (not partial parseFloat, unit suffixes, hex, exponent strings, booleans, arrays, objects). Reject exponent count strings because legacy parseInt would truncate them differently from concrete multiplication.
- Active dimensions must be finite and strictly positive: spread length/width/depth; pillar diameter/depth.
- Ignore inactive shape dimensions, layout coordinates, grade offset, rates, cost/quantity overrides and rebar fields in this BASIC phase.
- Explicit zero cost/rate/material overrides remain valid; do not confuse them with zero physical dimensions or zero foundation instances.
- When all basic fields are valid, ensure the computed physical volume is finite and positive (numeric overflow/underflow protection, not an engineering minimum).
- Codes: `foundation_type_invalid`, `foundation_quantity_invalid`, `foundation_dimension_invalid`, `foundation_volume_out_of_range`.
- Messages identify the component and offending field. No engineering approval or invented structural limit.

## Calculator Integration (Lead To Author)

Modify only `foundationCalc.js`:

- Import the two pure validation functions.
- `calcItem` checks basic input issues as well as catalog issues. Either condition uses the EXISTING 17-field historical snapshot fallback, never recalculates invalid costs.
- For input-invalid rows, return the authored `item.quantity` unchanged rather than silently clamping it to one. Catalog-only fallback and all valid paths keep existing behavior.
- `calcProject` returns a separate `inputIssues` array. Do not relabel input defects as missing catalog records.
- Per-item `itemPricing.issues` combines that item's catalog and input issues; `available` is false for either.
- Existing incomplete-item delivery fallback then preserves the acknowledged delivery snapshot; never invent defaults for invalid geometry.
- Existing stable-ID/source-ID matching and ambiguous/new-component fail-closed behavior stay intact.
- Current valid calculations and money defaults must be unchanged. Legacy rebar vertical/tie math stays unchanged until a separately versioned, explicitly accepted design recalculation (O-016/O-031).
- No schema change or calculated metadata persisted inside item rows.

## Page/Card Integration (Delegated Non-Financial Work)

- `FoundationEstimator.jsx`: keep `catalogBlocked` for the catalog warning/reload action; add `inputBlocked` and combined `pricingBlocked`.
- Use combined blocking for autosave, Save/Save & Exit, Copy, conversion, pricing tier application, pricing-unavailable totals/BOM/toolbar, and handoff.
- Display a separate actionable input-validation banner with the exact helper messages. Do not suggest inventory reload as the fix for geometry.
- General save errors should say to fix highlighted design inputs or catalog selections.
- Preserve Navigation15 owner/store/CAS/draft/history/receipt logic and acknowledged-source snapshots without alteration.
- Do not coerce/reset invalid inputs on render or erase the browser draft. Valid edits, Undo and recovery should resolve the warning naturally.
- Do not feed invalid basic geometry to the 3D renderer; show a correction notice instead.
- `FoundationItemCard.jsx`: preserve explicit zero/invalid authored quantity from the calculator. Add visible unavailable/choose options for unsupported/missing foundation types so the user can explicitly repair them.
- Existing unavailable-price display is appropriate for input issues: saved amounts, not current pricing. Say saved quantities may not reflect the current design.
- Keep edits focused; no layout redesign or unrelated panel changes.

## Financial Verification (Lead To Author And Check)

- Compare all 25 frozen valid scenarios' items, equipment, walls, poles, caps, totals and delivery exactly, not just grand totals. Read frozen expected data; do not regenerate it.
- For the seven frozen bad-input mutations, availability must become false with input issues and no fabricated current calculation.
- Use a realistic acknowledged source built from frozen item/totals plus an independently assembled saved delivery snapshot. Every one of the 17 item snapshot fields must remain exact.
- Missing/foreign/ambiguous saved identity yields unavailable fields/null aggregate, not borrowed values or zero.
- Raw invalid quantity remains visible; valid re-edit returns exact frozen current results.
- Test legal decimal strings, missing legacy quantity, signed grade/layout fields, inactive dimensions, explicit zero overrides, and no rebar.
- Test finite/integer/type boundaries and physical volume overflow/underflow. No unsupported engineering claims.

## UI/Browser Acceptance (After Core Ready)

- Actual page/card/calc/store with synthetic services; no live records or SDK calls.
- Quantity 0 and -2 remain visibly authored; error/saved-price warning; all save/copy/conversion/pricing handoff paths produce zero writes.
- Invalid dimensions/type remain editable; explicit correction restores pricing without erasing unrelated description/notes.
- Undo/Redo and browser-draft restore preserve invalid inputs and keep handoff blocked until correction.
- Valid zero overrides still save; correct source CAS and persisted calculated fields remain intact.
- Synthetic telemetry must reject external requests/console/page errors. Fixture port 5172 self-closes; preserve existing processes.
- Do one final narrow regression gate after complete implementation; do not repeatedly rerun unchanged suites.

## Remote Gate

- Current verified head is Navigation15. Fresh compare, restore checkpoint, reviewed helper/calc/card/page only, exact readback, real remote dependency build, clean changed-path scope, final checkpoint.
- Apply helper and card/page first, calculator LAST: the combined page guard must be present before the calculator stops coercing invalid quantities to one. This avoids a partial-update window that could save authored invalid counts with historical prices.
- Do not activate incomplete local work. Keep O-015 OPEN until its broader unit/geometry acceptance is actually satisfied.
- This is basic shape/count validation only. Rebar fields, rates, manual overrides, inventory units/classification, other assemblies and engineering constraints retain their separate OPEN gates.
