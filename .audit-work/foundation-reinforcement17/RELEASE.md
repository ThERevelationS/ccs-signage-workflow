# Active Reinforcement Input Guard 17

## Verified Sandbox Unit

- App `68dfcc5e57bbbc35387da97c`, branch `main`.
- Checkpoint `6aed8d8a8e452a83c24e5abe`.
- Commit `0a01139628455aa8a0a6dac3e155513bb2d35fab`.
- Restore checkpoint: see `checkpoint-before.json`.
- One remote source file: `src/components/estimator/foundation/foundationInputValidation.js`.
- Already activated and checkpointed. Do not repeat its edit.
- No schema/backend edits, deployment commands, publishing, business-record tests or paid AI.

## Guard Behavior

Active spread reinforcement requires positive finite spacing and positive whole mat count. Active pillar reinforcement requires positive whole hoop/longitudinal-bar counts and a positive finite authored hoop diameter no larger than the foundation diameter.

Malformed, partial/exponent/hex strings, fractional counts, non-finite values, explicit zero and negative counts no longer silently use defaults or produce negative steel costs. Missing/null optional legacy fields retain defaults; inactive-shape inputs and all steel inputs with rebar disabled do not block pricing. Explicit zero rate/quantity overrides retain the accepted behavior.

The guard uses existing acknowledged-price fallback, UI issue display, draft storage, source/Builder write guards and 3D gate. Valid prices and legacy reinforcement formulas do not change.

## Evidence

- `fresh-source.json`, `guard-baseline.json`: fresh calculator/UI/schema and helper/page baselines before edits.
- `reinforcement-before.json`: 16 frozen synthetic observations with source hashes and independent legacy decomposition. Do not regenerate.
- `financial-verification.json`, `financial-final.txt`: 111/111 lead-authored checks, including all 25 frozen full-model valid cases.
- `basic-regression/financial-verification.json`, `basic-regression-final.txt`: 83/83 basic validation regressions, executed against the changed helper without overwriting Validation16 evidence.
- `browser-results.json`, `browser-final.txt`: R1-R4 real-page browser acceptance, all four pass, telemetry clean.
- `basic-browser-regression/browser-results.json`, `basic-browser-regression/browser-final.txt`: unchanged V1-V8, all eight pass, telemetry clean.
- `review-v1-browser-results.json`, `review-v1-browser.txt`: failed R3 fixture proof. A seeded clean project correctly disabled Save; the corrected test makes an actual description edit. No source workaround.
- `r1-*.png` through `r4-*.png`: synthetic fixture screenshots, not production visual proof. Fixture CAS versions such as `v2` are intentionally not real timestamps.
- `lint-final.txt`, `final-page-meta.json`: helper/fixture lint0 and actual unstubbed page bundle with helper/card/toolbar/auth.
- `edit-preview.json`, `reviewed-manifest.json`, `lead-approval.json`: reviewed one-file edit and acceptance.
- `source-readback.json`, `final-source-readback.json`: exact LF-equivalent helper readback after `sandbox edit`.
- `remote-build.json`: exit0, truncatedfalse, actual dependency inputs verified.
- `final-git.json`, `final-clean-state.json`, `activation-final.json`: exact one-file delta and clean remote head.

## Remaining Work

O-015 and O-016 through O-031 remain OPEN. A single legacy spread mat still includes vertical steel at every intersection, mat separation is still ignored, and the legacy hoop diameter still clamps to a four-inch reduction. One-hoop pillars already retain longitudinal bars in the current calculator; the current 3D scene does not show reinforcement. Those are not fixed by syntax guards.

The next model must distinguish mats, longitudinal bars, inter-mat ties and supports, require explicit geometry/assumptions, preserve historical quotes and expose a recalculation/cost delta before acceptance. This guard does not claim structural design approval, universal cover limits, large-scene performance, live authorization/RLS or production/provider verification.
