# Concrete Basic Input Validation 16

## Verified Sandbox Unit

- App: `68dfcc5e57bbbc35387da97c`, branch `main`.
- Checkpoint: `6aed8aaf73b8085aacddf128`.
- Commit: `0727ffe5a7e7c9fdccbfd9998b61a6094ae2b2af`.
- Pre-change checkpoint: `6aed89f6b191b420bf235981`.
- This unit is already checkpointed; do not repeat activation.
- No publishing, deployment commands, backend/schema edits, business-record tests or paid AI calls.

## Source Scope

- New `src/components/estimator/foundation/foundationInputValidation.js`.
- Updated `src/components/estimator/foundation/foundationCalc.js`.
- Updated `src/components/estimator/foundation/FoundationItemCard.jsx`.
- Updated `src/pages/FoundationEstimator.jsx`.

Only the helper and these three existing frontend files changed remotely. The helper, card and combined page guard were installed before the calculator delta. Existing files used `sandbox edit`; the new helper used `sandbox write`. Readback verified exact LF-equivalent content, allowing only the new helper's stripped final LF. The first readback intentionally stopped on that final-LF difference; its content was checked, accepted and reused without rewriting.

## Behavior

- Only spread-footing and pillar types are accepted; unsupported or missing types remain explicitly repairable.
- Foundation instance count must be a positive safe whole number. Omitted/null legacy count still defaults to one.
- Active dimensions must be finite positive numbers; malformed strings, booleans and numeric-range overflow/underflow are rejected.
- Nonzero fractional tails in count strings cannot become valid through floating-point rounding.
- Invalid input preserves acknowledged saved item amounts and coupled delivery snapshots rather than recalculating or inventing prices.
- New/ambiguous/unacknowledged rows show unavailable amounts rather than borrowing another row's prices.
- Save, Save & Exit, Copy, conversion, autosave and Builder handoff are paused; drafts, Undo/Redo and corrections remain usable.
- Invalid basic geometry is not passed to the 3D preview.
- Explicit zero rates/cost overrides remain valid; valid calculations stay unchanged in the frozen tested scenarios.

## Evidence

- `financial-verification.json`, `financial-final.txt`: lead-authored and checked 83/83, including exact full-model parity for all 25 frozen Materials14 cases.
- `basic-inputs-before.json`: seven frozen synthetic invalid-input observations; never regenerate.
- `baseline-browser-results.json`, `b0-baseline.png`: actual-router pre-fix negative-count/save reproduction; separate frozen proof, not rerun.
- Baseline results SHA256: `c549e268ef8c54e2a3cd56c340034f0183474fc3366f7258930f150292e2b119`.
- `browser-results.json`, `browser-final.txt`, `v1-*.png` through `v8-*.png`: strengthened actual-router acceptance 8/8, no external requests or console/page errors.
- `r-nav.txt`: navigation10; `r-save.txt`: save58; `r-cat.txt`: catalog7; `r-matui.txt`: materialUI10; `r-matb.txt`: materialBrowser3.
- `lint-final.txt`: four changed source files plus browser fixture, exit0.
- `final-page-meta.json`: real, unstubbed page dependency build, including validator/card/toolbar/auth.
- `reviewed-manifest.json`, `lead-approval.json`: reviewed source hashes and acceptance.
- `activation-events.json`, `readback-*.json`, `checkpoint-source-readback.json`: remote-write/readback evidence.
- `remote-build.json`: exit0, truncatedfalse; actual page/validator/card/auth/toolbar inputs checked.
- `checkpoint-git.json`, `final-clean-state.json`, `activation-final.json`: exact four-file delta and clean remote head.

Reproduction entrypoints: `node .audit-work/foundation-reinforcement16/verify-basic-inputs.mjs` and `node scripts/foundation-input-validation-browser-fixture.mjs`. Do not rerun the baseline (`BASELINE=1`); it refuses to overwrite its frozen proof. Do not overwrite Materials14 inputs or expected results.

## Open Gates

O-015 remains OPEN for broader unit/rate/override/other-assembly validation. Rebar placement, supports, cut schedules, accepted recalculation deltas, 3D parity and large-scene resource limits are separate OPEN gates. Safe-integer instance validation does not establish that very large scenes are usable. No engineering approval, live authorization/RLS, production visual or real provider behavior is claimed. The unattended controller stays disabled pending trusted runtime ownership.
