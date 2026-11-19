# WS-P..WS-W + WS-Z Ledger Reconciliation — Pricing-Availability Hardening

**Scope:** `ESTIMATOR_MASTERPLAN.md` WS-P (L718) → WS-W (L857) + WS-Z (L464–470).
**Remote:** app `68dfcc5e57bbbc35387da97c`, branch main, HEAD `cbee8813d` (= O-011 checkpoint).
**Method:** ledger items vs `.audit-work/{vinyl,channel-letter,painting,maintenance,laser,cnc,metal,brick-stone}-hardening/` artifacts (transport specs = authoritative applied file lists + live/dead determinations; `*-apply-final-scope.json` = remote readback; frozen `remote-src`/`candidates`/`staged` = post-hardening source). Local worktree is divergent and was NOT trusted.
**Status legend:** SATISFIED-BY-LANDED / PARTIALLY-COVERED / GENUINELY-OPEN.

## 0. What actually landed (the contract, verified identical on all 8 modules)

Per module: a new `*PricingAvailability.js` strict-input scanner wraps the live calculator → structured issues `{kind, index, itemIndex, field, code, message, hold}` (authored kind + `<mod>_catalog` kind) → held derived fields/aggregates re-derived null-propagating → acknowledged saved-snapshot fallback or literal "Not saved" display → `pricingBlocked = issues.length > 0` gates `saveProject` (which is also the `recordBuilderSave` handoff path) AND `handleSaveAsCopy`. Metal additionally gates Download/Print on `pricingUnavailable`. All gates verified in `.audit-work/<mod>-hardening/*-model-verification.json` + browser/page/lint/consumer-build proofs + `*-apply-final-scope.json` remote readback.

| Module | Checkpoint prefix | Files | Availability module (now owns the priced-calc entry) | Live/dead determination (authoritative) |
|---|---|---|---|---|
| Vinyl (WS-V) | `6aef28b8` (git `4af36af0`) | 14 | `components/vinylEstimator/vinylPricingAvailability.js` → `calcVinylWorkflow` + `vinylProjectInputIssues` | LIVE: `vinylNestingCalculator.jsx`, `vinylEstimator/*`, `VinylEstimator.jsx`. DEAD: `components/estimator/vinyl/vinylCalc.js` |
| Painting (WS-R) | `6aef3a11` | 3 | `components/estimator/paint/paintPricingAvailability.js`; strict parsers live in `paintCalc.js` | LIVE: `paintCalc.js` (EDITED — `paintStrictNumber`/`paintSettingNumber` fix `||`-default resurrection of recorded 0s). ~30 `PRICED_SETTINGS` rows scanned |
| Channel (WS-P) | `6aef6af6` | 17 (16 edits + 1 new) | `components/channelLetterInstall/channelLetterPricingAvailability.js` | LIVE: `installCalculator/lettersCalculator/installSizeRates/wallMaterials` (formulas unchanged). DEAD: `components/estimator/channel/*` |
| Brick & Stone (no WS letter) | `6aef8588` | 4 | `components/estimator/brick/brickPricingAvailability.js` | LIVE: `brickCalc.js` (byte-identical, imported by page AND `builder/partSync.js`). No settings entity — project fields + material row only |
| Laser (WS-S) | `6aef8f08` | 2 | `components/estimator/laser/laserPricingAvailability.js` → `calcLaserPricing` | LIVE: inline page math PORTED verbatim into the availability module (`computeLaserTotals`); self-requeuing effect → `useMemo`. DEAD: `components/estimator/laser/laserCalc.js` (divergent units/perimeter math, 0 importers) |
| Maintenance (WS-Q) | `6aef8c0a` | 5 | `components/signMaintenance/maintenancePricingAvailability.js` → `calcMaintenanceProject` | LIVE: `maintenanceCalculator/repaintCalculator/dimLetterPaintCalculator` (unchanged). Selected-action rate-matrix cells must be positive minutes |
| CNC (WS-T) | `6aef9300` | 2 | `components/estimator/cnc/cncPricingAvailability.js` → `calcCncPricing` | LIVE: inline page math (derived pass now re-derives from raw inputs — reprice-staleness defect fixed). DEAD: `components/estimator/cnc/cncCalc.js` |
| Metal (WS-U) | `6aef96cd` | 2 | `components/estimator/metal/metalPricingAvailability.js` → `calcMetalProject` | LIVE: page derive (hardened in place). NO dead calc — `metalCalc.js`/`metalFabrication/` confirmed absent at HEAD |

**Ledger-wide correction required:** every WS-P..V header still says `**Coding:** not started`. Factually stale — a pricing-availability unit landed on remote for all seven letters + brick. Amending stage text is W-004's job. Also flag: the "one module at a time / Concrete first" policy was effectively exercised cross-module by this hardening batch — lead should adjudicate whether that sets precedent or is a one-off exception.

## 1. WS-P — CHANNEL & DIMENSIONAL (L718–735)

- `P-01` Audit — PARTIALLY-COVERED. Landed: pricing-surface audit w/ receipts (liveDeadDetermination, unchanged-formula baselines, zero-legitimacy policy). Remains: non-pricing ownership/set-ID/photo-entry audit + Builder part-mapping audit.
- `P-02` Interview — GENUINELY-OPEN. No interview UX landed. Pre-existing modals (`AIInstallScopeModal`, `AIScopeWriterModal`, `PhotoEstimateModal`, `ChannelLetterHelpAssistant`) protected/unchanged — reuse, don't duplicate.
- `P-03` Photo/scope→brief/proposal — GENUINELY-OPEN.
- `P-04` Editable letter-set/layout preview — GENUINELY-OPEN.
- `P-05` Deterministic takeoff — GENUINELY-OPEN. (Availability layer now guarantees inputs are real — build the takeoff ON it.)
- `P-06` Validate compatibility + missing prices — PARTIALLY-COVERED. "Missing prices" is now a hard gate; `ValidationWarnings.jsx` renders real catalog/input issue groups beside legacy heuristics. Remains: mount/illumination compatibility, size/stock, access/crew/equipment rules, electrical/load assumptions.
- `P-07` Reconcile letters↔install sync + exactly-once personnel/travel — PARTIALLY-COVERED (thin). Travel/personnel/equipment pricing inputs validated at calc boundary. Sync/dedup/edit-semantics untouched. CONFLICT: `TravelCostCard.jsx`, `EquipmentSelector.jsx`, `PersonnelSelector.jsx` shared with Q+V.
- `P-08` Purchased-vs-fabricated alternatives + linked-product ownership — GENUINELY-OPEN.
- `P-09` Export quote scope — GENUINELY-OPEN.
- `P-10` Bulk sets/dup/substitutions/stock warnings/templates/dimension entry/charge-explain/keyboard/recoverable save — PARTIALLY-COVERED. Landed: blank-preserving `channelDraftValue` inputs; save gate; CAS/idempotent save. Remains: bulk/dup/templates/stock-warning/explainability UX.
- `P-11` Copy/template/reopen/locks/undo/accepted pricing — PARTIALLY-COVERED. Landed: `blockIfPricingUnavailable` gates Save-As-Copy; `__held`/`pricingUnavailable` stripped from payload; saved-snapshot display. Remains: template round-trip, manual locks, proposal undo.
- `P-12` Scenarios — PARTIALLY-COVERED (pricing legs proven; 16-item matrix open).
- `P-13` Tests — PARTIALLY-COVERED (`test-channel-pricing-wire.mjs` exists; `.audit-work` harnesses are ephemeral). Remains: durable committed suites.

## 2. WS-Q — SIGN MAINTENANCE

- `Q-01` Audit — PARTIALLY-COVERED (rate-matrix/defaults pricing inputs audited at boundary; 64 unpriced/rate-matrix branches in scanner). Remains: Builder reconciliation + crew/equipment/travel ownership audit.
- `Q-02`..`Q-04` Interview / repair map + AI causes / scope separation — GENUINELY-OPEN.
- `Q-05` Catalog-driven parts + confirmation flag — PARTIALLY-COVERED (missing/unusable inventory + rate records → `maintenance_catalog` issues). Remains: compatibility + confirmation-flag UX.
- `Q-06` Minimums/mobilization/crew/multi-site/return — PARTIALLY-COVERED (rate-matrix cells must be positive minutes → held). Remains: mobilization/multi-site/return/disposal modeling.
- `Q-07`..`Q-09` Repair sequence/WO scope, repaint/replacement links, grouped actions/templates — GENUINELY-OPEN.
- `Q-10` Save/recovery/accepted optional scope — PARTIALLY-COVERED (`pricingBlocked` gates save + save-as-copy; `recordBuilderSave` covered; `recalculated` from `priced.calc`). Remains: reopen/optional-scope/AI-change persistence.
- `Q-11`/`Q-12` Scenarios/Tests — PARTIALLY-COVERED (pricing legs; durable suites open).

## 3. WS-R — PAINT

- `R-01` Audit — PARTIALLY-COVERED (strongest audit leg: exported strict resolvers `paintStrictNumber`/`paintSettingRecorded`/`paintSettingNumber` fix `num(x,d)||d` default-resurrection; ~30 `PRICED_SETTINGS`; `painting-zero-legitimacy-decisions.md`).
- `R-02`..`R-04` Interview / zone preview / coating data sheets — GENUINELY-OPEN.
- `R-05`..`R-07` Prep/primer separation, cure-vs-active + unit conversions, zero overrides — PARTIALLY-COVERED (legitimate-zero policy is REAL — recorded 0 honored; default-resurrecting 0 flagged).
- `R-08`..`R-11` Alternatives/finish schedule, presets/batch/templates, scenarios, tests — PARTIALLY-COVERED (save gate + strict inputs; suites open).

## 4. WS-S — LASER

- `S-01` Audit — PARTIALLY-COVERED (decisive live/dead: inline page math → `laserPricingAvailability.js`; dead `laserCalc.js` divergent, 0 importers; self-requeuing effect → `useMemo`).
- `S-02` Interview — GENUINELY-OPEN.
- `S-03` SVG/DXF import hardening — PARTIALLY-COVERED (`extractLaserDims` bbox prefill exists). Remains: paths/holes/cut-length, dups/open geometry, transforms, diagnostics.
- `S-04`..`S-09` Layer preview, derive cut/passes, envelope checks, remnants, snapshots, job sheet — PARTIALLY-COVERED or GENUINELY-OPEN per item.
- `S-10`..`S-12` Bulk/templates/recovery, scenarios, tests — PARTIALLY-COVERED (save-retry gate; suites open).

## 5. WS-T — CNC

- `T-01` Audit — PARTIALLY-COVERED (inline math → `calcCncPricing`; reprice-staleness fixed — totals re-derive from raw inputs; dead `cncCalc.js` confirmed).
- `T-02` Interview, `T-03` vector preview, `T-04` feed/pass/tool calibration, `T-07` grain/remnant nesting — GENUINELY-OPEN.
- `T-05`/`T-06` passes/pockets/setup + HoldDownAdvisor — PARTIALLY-COVERED (strict derived pass; advisor mounted, warnings contract open).
- `T-08` Lettering count semantics — GENUINELY-OPEN (formula preserved but unproven — needs focused fixture).
- `T-09`..`T-12` Part tree/presets, copy/template/recovery, scenarios, tests — PARTIALLY-COVERED.

## 6. WS-U — METAL FAB

- `U-01` Audit — PARTIALLY-COVERED (`metal-zero-legitimacy-decisions.md` per-field audit incl. settings-seed `"0"→75` resurrection defect fixed).
- `U-02`..`U-08` Interview, part tree, derive stock/kerf/weight, fab stages, bend limits, stock optimization, cross-module links — GENUINELY-OPEN or PARTIALLY-COVERED (calc strict pass + `metal_inventory_*` codes landed).
- `U-09` Quote scope/cut lists — PARTIALLY-COVERED (Download/Print disabled on `pricingUnavailable`; content contract open).
- `U-10`..`U-12` Mixed units/templates/recovery, scenarios, tests — PARTIALLY-COVERED.

## 7. WS-V — VINYL

- `V-01` Audit — PARTIALLY-COVERED (scanner map IS the audit: margins/gutters/bleed, machines, ink/blade/weeding/install labor, waste, setup floor).
- `V-02`/`V-03` Interview / propose workflows — GENUINELY-OPEN.
- `V-04`..`V-08` Preview/compatibility/tiling/reconcile/alternatives — PARTIALLY-COVERED (`vinyl_machine_*`/`vinyl_*_unavailable` codes; layout holds poison derived fields). CONFLICT: `TravelCostCard` shared.
- `V-09`/`V-10` Grouped parts/warning-nav, stable IDs/migration/copy — PARTIALLY-COVERED (warning banner + per-tab dots + focus-owning-tab landed; `_calc` stripped; copy gated; rollup + snapshot fallback).
- `V-11`..`V-13` Export takeoff, scenarios, tests — PARTIALLY-COVERED or OPEN.

## 8. WS-W — SHARED MODULE FOUNDATIONS

- `W-004` (DASH-04) stage text — GENUINELY-OPEN, ACTIONABLE + REQUIRED: "Coding: not started" is false for P–V; record the landed unit per module.
- `W-005`..`W-011` root-ledger/UX/sandbox/worker-cap/fixtures/local/hooks — GENUINELY-OPEN (docs/dashboard).
- `W-012`..`W-023` AI-01..12 — GENUINELY-OPEN. Landed scanners are 8 precedents for W-016 `issues` field + W-017 "calculators own money" — reuse `{kind,field,code,message,hold}` convention.
- `W-024` (AI-13) — GENUINELY-OPEN w/ recorded subunit (InvokeLLM policy pin `6aeda3df`).

## 9. WS-Z

- `Z-03` OPEN (reserved) — leave reserved; no hardening-discovered defect remains unfixed (laser self-requeue, CNC reprice staleness, brick SaveAsCopy bypass, paint default-resurrection, metal seed resurrection all fixed inline).

## 10. Cross-workstream file-ownership conflict map

- `channelLetterInstall/TravelCostCard.jsx` — shared P+Q+V; scanners validate its inputs at THEIR boundary; component must not fork. Serialize edits.
- `EquipmentSelector.jsx` + `PersonnelSelector.jsx` — channel-edited, vinyl-consumed. P↔V conflict on crew/equipment items.
- `moduleShared/moduleProjectActions.js`, `ModuleActionBar.jsx`, `ModuleTemplateDialog.jsx` — shared save/copy/template path for all template items.
- `builder/{partSync,builderService,itemIdentity,sourceProjectPersistence}.js` — shared handoff; serialize any two modules' Builder-mapping items.
- `settings/moduleSettingDefaults.js` — shared absent-row fallback contract.
- `customerPricing.js` + `markup/*` — sell-side wire for every module.
- `paintCalc.js` — owns strict resolvers; R items build on hardened file.
- Per-module availability modules — DISJOINT; extending each scanner is parallel-safe.
- Dead files NEVER import: `estimator/vinyl/vinylCalc.js`, `estimator/channel/*`, `estimator/laser/laserCalc.js`, `estimator/cnc/cncCalc.js`.

## 11. Recommended execution order

Policy gate: module work serialized behind WS-O ("one module at a time"). Within a module: `X-01` audit tail → `X-02` interview → `X-03/04` preview → `X-05` takeoff on landed scanner → `X-06` extend scanner → `X-07/08` ownership/alternatives → `X-09` export → `X-10/11` UX/templates → `X-12` scenario matrix → `X-13` durable suites (promote `.audit-work` patterns into `scripts/`).

Parallel-safe pairs (if policy relaxed): {P,R,S,T,U} module-internal items — EXCEPT shared leaves above. NOT parallel-safe: P-07/Q-06/V-07 (TravelCostCard); any two Builder-mapping items; any two template items; P crew/equipment with V.

## 12. Ledger bookkeeping recommendation

Do NOT flip any `X-01..13` row to DONE — all partially covered at most. Per W-004: append to each module header a one-line landed-unit note + "(pricing leg verified — see .audit-work/<mod>-hardening/)" on audit/test/scenario rows that cite it.
