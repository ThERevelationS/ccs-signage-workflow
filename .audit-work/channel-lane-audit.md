# Channel-letter lane audit (P-01 bounded subunit)

Session `estimator-modernization-20261105`. Read-only audit of the P-01–P-13
channel-letter lane against the prior `channel-letter-hardening` pass and the
current remote.

## Verified state (this pass)

- `channelLetterPricingAvailability.js` remote md5 `e13cf5a6c16c865f1359ef4143e22f36`
  — EXACT match to the hardened candidate in `.audit-work/channel-letter-hardening/candidates/`.
  The pricing-availability layer is live on `main`.
- `verify-channel-model.mjs` (candidate mode): **85 cases, 0 failed** — held-project
  nulls, saved-snapshot honor, explicit-$0 validity, non-finite rejection,
  issue-shape contract, field/index filtering, remote-contrast cases (hidden
  default, malformed-% laundering, blank-qty laundering).
- `scripts/test-channel-pricing-wire.mjs`: **PASS, 160 asserts** — config
  detection, context blocks, cost-line projection parity, verbatim passthrough,
  line/project sell, tier/fixed/market/break/template/machine pricing, zero-qty,
  dangling tier_ref, inactive/expired rows, engine-vs-legacy precedence,
  sourceProjectEconomics end-to-end.
- Remote `src/components/channelLetterInstall/` carries 61 files including
  `installExport.jsx` (md5 `f2456994...`).

## Prior-hardening artifact inventory (68 files)

- `verify-channel-model.mjs` / `verify-channel-page.mjs` /
  `verify-channel-consumers.mjs` / `verify-channel-browser.mjs` — the four
  harness tiers (model, real-page Save proof, consumer imports, browser bundle).
- `channel-frozen.mjs` — frozen remote-source plugin (lettersCalculator,
  installCalculator, installSizeRates, wallMaterials).
- `channel-pricing-sandbox-*` — the remote apply + verification records for the
  16 target files (`channel-pricing-baseline-v2-status.json` role map).
- `channel-pricing-baseline-v2.json` + `-status.json` — the baseline + role map
  (target vs protected files).

## What the hardening covers

The `channelLetterPricingAvailability` layer: fail-closed pricing availability —
malformed/unavailable rates block Save with zero writes, saved acknowledged
amounts stay visible and labeled, explicit $0 stays a real zero, non-finite
saved totals are not trusted. Verified by the 85-case model matrix and the
real-page Save proof.

## What remains OPEN on the P-lane

Each P-row is a multi-part feature spec beyond the pricing-availability slice.
The lane needs a dedicated channel-letter module session to audit/land the
full spec surface (interview fields, photo/scope workflow, layout preview,
deterministic takeoff, sync reconciliation, export sheets, bulk ops,
copy/reopen proofs, scenario matrix, expanded fixtures). That session is a
named grant — outside this session's estimator scope.
