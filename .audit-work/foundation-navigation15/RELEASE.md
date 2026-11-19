# Navigation15 — O-004 browser-tab draft recovery (verified subunit)

**App**: `68dfcc5e57bbbc35387da97c` / branch `main`
**Checkpoint**: `6aed818c8e4b552cf32a811e` · commit `6c06175812c0d5e078a2f7b23c25b4d7f7e711cb` · pre-checkpoint `6aed80b65e7407481bc2019e`

## What shipped
- `src/components/estimator/foundation/foundationDraftRecovery.js` — pure per-tab sessionStorage draft store; owner+source+estimate key isolation; CAS read/write/clear; 13/13 structural node cases.
- `src/pages/FoundationEstimator.jsx` — integration: synchronous draft persist on every accepted edit/Undo/Redo; explicit Restore/Discard offer; pending state blocks editor/handlers; newer-edits and late-save retention; storage-failure warnings.
- `scripts/foundation-navigation-browser-fixture.mjs` — 10 actual-router synthetic cases (telemetry zero).

## Verified
- Local: helper 13/13, navigation 10/10, save-handler 58/58, catalog 7/7, material-ui 10/10, material-browser 3/3.
- Remote: build exit 0, truncated false; metafile contains real `FoundationEstimator.jsx` + `foundationDraftRecovery.js` + `EmailGate.jsx` + `FoundationToolbar.jsx`; clean 2-file diff; app ready.
- N9 fail-before evidence preserved: `review-v1-browser-results.json` (stale-offer revision-erasure bug reproduced, then fixed).

## Explicit limitations
- **Design-allowlist fields only** — pricing, customer, and manual markup/override edits are NOT captured or recovered.
- Per-tab sessionStorage — lost on tab close or storage eviction; this is not a backend save.
- No global route interception — native/app navigation may still leave; recovery is an explicit offer on return.
- No live authorization, production-visual, or RLS proof claimed. Broader O-004 and O-013 remain OPEN.

## Evidence
`nav-final.txt` · `browser-results.json` · `remote-build.json` · `activation-final.json` · `review-v1-browser-results.json` · `final-metafile.json` · `page-before.jsx`

## Repro
```
node scripts/foundation-navigation-browser-fixture.mjs
node scripts/test-foundation-draft-recovery.mjs
```

## Next scope
Concrete-only geometry/quantity/inventory validation audit; then reinforcement/AI/signage/wallcaps queued. Other modules not started.
