# Reinforcement Input Guard 17

## Verified

Checkpoint `6aed8d8a8e452a83c24e5abe`, commit `0a01139628455aa8a0a6dac3e155513bb2d35fab`, app main. One existing helper edited/read back exactly; remote build and clean changed-path verification pass. Lead111 plus basic83, steel browser4 plus basic browser8, lint/bundle pass. See `RELEASE.md`. Do not repeat activation.

## Settled Scope

The 16 frozen observations in `reinforcement-before.json` use fresh source from accepted checkpoint `6aed8aaf73b8085aacddf128`. Do not regenerate them. The audit confirms negative steel costs from negative spacing/layers/bar counts, silent fractional-count truncation, zero-count defaults, oversized/negative hoop behavior, and mat-separation inputs ignored by the legacy calculator.

This contained repair changes only `foundationInputValidation.js`. Existing calculator snapshot fallback, page write guards, draft store, UI issue display and 3D gate already consume its issue contract. Do not alter valid prices, legacy reinforcement formulas, schemas or unrelated UI.

## Input Policy

- Validate only active reinforcement fields while `include_rebar` is enabled; ignore inactive shape fields and all steel fields when rebar is off.
- Missing/null optional legacy steel fields retain their existing implicit defaults; explicit malformed, empty, non-finite or negative values do not.
- Spread spacing length/width must be full ordinary finite positive numbers.
- Spread mat count, pillar hoop count and pillar longitudinal-bar count must be positive safe whole numbers, including lexical fractional-tail checks before floating conversion.
- Explicit zero counts are rejected rather than silently replaced with one/four. Separate no-bar/hoop-only design modeling remains a versioned-model task; current legacy math cannot represent those authored zero values faithfully.
- Explicit pillar hoop diameter must be finite positive and not exceed the authored foundation diameter. This is a physical outer bound, not an invented cover requirement.
- Do not enforce the legacy four-inch diameter reduction as an engineering standard; explicit cover, bar diameter, placements, clearance and corrected hoop geometry remain OPEN.
- Ignore currently unused separation fields and manual rate/quantity overrides in this guard phase. Explicit zero overrides remain valid under the accepted contract.
- Use existing issue shape with codes `foundation_rebar_spacing_invalid`, `foundation_rebar_count_invalid`, `foundation_rebar_diameter_invalid`.

## Verification

- Read accepted frozen Materials14 inputs/results; all 25 full-model valid cases must remain exact.
- Test each newly invalid synthetic mutation against acknowledged saved item/delivery data; all 17 snapshot fields exact, raw authored fields retained, pricing unavailable, no fabricated totals.
- Test omitted/null legacy fields, disabled rebar, inactive-shape junk, legal decimal strings, malformed/exponent strings, safe-integer/fractional-tail boundaries and explicit zero overrides.
- Real-page browser acceptance must demonstrate malformed/negative active steel blocks all writes, explicit correction saves with current CAS, and disabled rebar does not create false errors.
- Reuse already accepted guard16 behavior; no need to redo unchanged navigation/save suites repeatedly. One final focused guard16 regression pass plus added steel cases and lint/bundle is sufficient.
- Fresh compare and named restore checkpoint before a one-file sandbox edit; exact readback, remote dependency build, clean changed-path scope and final checkpoint. No publish, live-record tests or paid AI.

## Next Model Gate

Do not fix single-mat verticals by silently changing legacy prices. A versioned reinforcement proposal must separate horizontal mats, longitudinal bars, inter-mat ties and supports, show assumptions/unknown engineering inputs and an explicit saved-price delta, and apply only after deliberate acceptance. The current preview renders neither mats nor supports; no rebar visual verification or engineering approval is claimed.
