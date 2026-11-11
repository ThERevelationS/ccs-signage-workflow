# Module-lane audit (Q/R/S/T/U/V + brick — bounded subunit)

Session `estimator-modernization-20261105`. Read-only audit of the module
pricing lanes against the prior `*-hardening` passes and the current remote.

## Verified state (this pass)

### Pricing-wire fixtures — all remote-run PASS

| Wire | Fixture | Asserts |
|------|---------|---------|
| channel | `test-channel-pricing-wire.mjs` | 160 |
| channel ownership | `test-channel-cost-ownership.mjs` | 30 |
| cnc | `test-cnc-pricing-wire.mjs` | 193 |
| laser | `test-laser-pricing-wire.mjs` | 199 |
| maintenance | `test-maintenance-pricing-wire.mjs` | 224 |
| metal | `test-metal-pricing-wire.mjs` | 214 |
| paint | `test-paint-pricing-wire.mjs` | 214 |
| brick | `test-brick-pricing-wire.mjs` | 211 |
| vinyl | `test-vinyl-pricing-wire.mjs` + helpers 14 + persistence 8 | 177 |
| **cross-module** | `test-module-wire-ownership.mjs` | **89** |

### Model verifiers (prior `*-hardening` harnesses, candidate mode) — all PASS

- cnc 97/0 · laser 248 · metal 93/0 · painting 167/0 · maintenance 123/0 ·
  vinyl 47/0 · brick-stone 121/0 · channel 85/0

### Consumer verifiers (import-edge checks) — all PASS

- channel 46 inputs/17 candidates · cnc 4/2 · laser 4/2 · metal 4/2 ·
  painting 5/3 · maintenance 12/5 · vinyl 24/13 · brick 8/4 — all exit 0.

### Page verifiers (real-page Save proofs) — all PASS

- channel 17/0 · cnc · laser · metal (11 scenarios) · painting · maintenance ·
  vinyl 14/0 · brick — Save/Save-As-Copy blocked while held, saved totals
  shown, clean paths save.

### Availability-layer remote md5 parity vs hardened candidates

| Layer | Remote md5 == candidate |
|-------|-------------------------|
| `cnc/cncPricingAvailability.js` | EXACT `40cc13b4` |
| `laser/laserPricingAvailability.js` | EXACT `da840c26` |
| `metal/metalPricingAvailability.js` | EXACT `5583c8d8` |
| `brick/brickPricingAvailability.js` | EXACT `e95b0c69` |
| `signMaintenance/maintenancePricingAvailability.js` | EXACT `621c3c88` |
| `vinylEstimator/vinylPricingAvailability.js` | EXACT `371c2562` |
| `channelLetterInstall/channelLetterPricingAvailability.js` | EXACT `e13cf5a6` |
| `paint/paintPricingAvailability.js` | differs — later revision; the availability layer is present (56 unavailable/hold/null refs) and `test-paint-pricing-wire` passes 214 |

### Wire fix landed this pass

`vinylPricingWire.lineKey` — anonymous-workflow anonymous items collided on
`idx-0` (per-workflow index in the fallback). Global line `position` now feeds
the fallback. Checkpoint `6af4197bb647270eb8fe75d5`; vinyl suite still 155/0.

## What remains OPEN on the module lanes

Each lane's full feature spec (interview/preview/takeoff/sync/export/
scenarios) needs its own dedicated module session — same grant class as the
P-lane (`.audit-work/channel-lane-audit.md`). The pricing-wire + availability
layers are hardened and remote-verified; the broader spec surfaces are not
covered by this session's foundation scope.
