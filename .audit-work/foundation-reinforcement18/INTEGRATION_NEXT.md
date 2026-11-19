# Next Integration Decisions - Lead-Owned

## Frozen Accepted Inputs

- Remote17 is complete: checkpoint `6aed8d8a8e452a83c24e5abe`, head `0a01139628455aa8a0a6dac3e155513bb2d35fab`. Do not reactivate16/17.
- Local `foundationReinforcementModel.js` is authored, independently checked39/39 by lead (`model-verification.json`, `model-final.txt`). No pricing/page/schema imports. Do not rederive these accepted results unless model source changes.
- Core steel-only quantities are per instance, scaled arithmetically; geometry is per instance/bounded4096. Missing support quantity is NULL, not zero. Engineering approval is always false.
- `foundationReinforcementCost.js` is now lead-authored/checked74/74 as a preliminary steel-only projection (`cost-verification.json`, `cost-final.txt`, `cost-acceptance.json`). It remains NOT imported by the page/calculator and NOT activated. Explicit canonical per-foot unit/rates/diameter, schedule reconciliation/range, aggregatezero overrides, geometry/priced weights and unresolved support/weight/connection application gates are checked. First baseline71/74 caught3 invalid-diagnostics/unknown-role gaps; repaired without changing valid cost formulas. Lint/syntax/standalone/current-page bundles pass. Frozen input models are in `cost-model-fixtures.json`; reuse them for cost-helper rework, do not rerun core derivations merely to present these results.
- Current39 tests include20ft explicit single top mat, no invented ties, explicit ties/cut allowances, independent pillar bars, physical overlaps/clearances, missing input, numeric range, geometry budgets and purity.

## Remaining Before Any18 Activation

The pure core is NOT a complete app unit. Keep it local until persistence, pricing projection, explicit proposal/cost-delta acceptance, editor/BOM/preview integration and browser/readback/build gates pass. Never checkpoint an unused helper as a completed feature.

### Dependency Seam

Avoid circular imports when version2 validation consumes the model. Extract the existing BASIC shape/count/dimension validator and numeric primitives into a pure `foundationGeometryInputs.js`. Existing `foundationInputValidation.js` imports it and appends either legacy steel guards (version1) or version2 model diagnostics. The model imports ONLY basic geometry inputs. Preserve existing issue shape and every accepted16/17 policy; regression83/111 is mandatory after changing that seam.

### Persistence

Proposed schema seam (must inspect fresh schemas before edits):

- Optional `items[].reinforcement_calculation_version` (absent/1 remains legacy;2 only after explicit acceptance).
- `items[].reinforcement_design`: accepted version2 numeric geometry configuration.
- `items[].reinforcement_proposal`: separately editable, potentially incomplete proposal. It does NOT affect live costs while version1 remains selected. The editor must state "Proposal not applied; current pricing uses the saved calculation mode."
- Unapplied proposal edits may be saved/recovered without converting prices. Do not make unknown engineering inputs block all preliminary legacy pricing.
- The existing items-array draft/copy/template paths must retain these nested objects; verify, do not assume.
- Changed accepted geometry can reprice normally as a dirty version2 design; infeasible edits use acknowledged saved-price fallback and block Save/handoff. Accepted quote/estimate mutation protections and source CAS remain authoritative.

### Explicit Acceptance

- Show legacy/current amount, proposed internal steel amount, full section delta, quantity differences and unresolved assumptions.
- Accept is an in-memory atomic parent commit keyed by stable component ID, one Undo step. It is not an immediate backend write.
- Capture a deterministic basis fingerprint over current raw project calculation inputs, source acknowledgment version, relevant catalog/settings and proposed configuration. Strip proposal/transient/calculated metadata deliberately; keep the exact allowlist aligned to actual calculator reads.
- Recheck the current fingerprint synchronously before applying; any changed design/catalog/source basis requires refreshed proposal review. Do not apply a stale result after edits, reorder or project/owner switch.
- A fingerprint is not server authorization. Existing source/Builder CAS and estimate mutation guards stay in force; no live RLS claim.
- Manual/auto supports are not yet modeled/priced by18. Unknown support count/cost must NOT become zero. An explained support-off condition may be explicit; otherwise proposal remains unapplied until the support/catalog gate is implemented.

### Version2 Internal Cost Projection

This is an INTERNAL cost calculation feeding shared platform pricing, not a new module pricing engine.

- Do not call the old legacy steel math and subtract its result: malformed/inactive legacy fields can produce invalid intermediate numbers.
- For version2 common foundation costs call the legacy calculator with a clone having `include_rebar:false`, then add the independently calculated version2 steel cost. Concrete/forming/pouring/finishing/excavation behavior remains identical.
- Steel linear quantity comes from model totals; authored `custom_rebar_qty` retains its existing aggregate-item override semantics, including explicit0. Show geometry-vs-priced-quantity differences visibly. Do not scale an aggregate override twice.
- Explicit `custom_rebar_cost_per_ft:0` is valid. Version2 rates must be finite/nonnegative; do not use `||` to replace explicit zero.
- Labor basis: total authored mat crossings + established hoop/bar crossings + tie ends, plus total priced linear feet. Use the existing named labor-time/rate settings with transparent units. Missing settings can use documented legacy defaults only when genuinely absent; explicit malformed values are unavailable, not fallback. Never hide zero as missing.
- A selected material must have a known per-foot pricing unit and a diameter compatible with the geometry. Legacy `find` by size is ambiguous; version2 should select stable rebar inventory ID or an explicit manual per-foot rate/diameter basis.
- Do NOT infer diameter for arbitrary `#n` values. Add/review catalog diameter metadata or a verified published standard mapping; #9 and higher are not simply n/8. No fabricated material or weight defaults.
- Unknown weight is not zero. If material weight metadata is unavailable, preserve/display unknown honestly; settle BOM/parts contract before acceptance/handoff.
- Preserve version1 and frozen complete-model prices exactly. Any intentional version2 difference must appear in the acceptance delta.

## Engineering And Support Gates

- Explicit cover, mat elevations, bar diameter, hoop centerline geometry and cut allowances are estimator inputs, not certified design recommendations.
- The core currently models two contacting orthogonal tiers per mat. It does not implement stock waste, fabrication bend schedules, structural capacities or support catalogs.
- Supports need manufacturer/engineer-reviewed dimensions/ranges/placement constraints; do not invent chair density or universal stand spacing.
- Add bottom-plane support feet, bearing height from mat underside, compatible catalog selection, physical fit, pack rounding, cost/labor/BOM/Builder/purchasing and shared3D only as a complete subsequent model layer.
- Unknown engineering inputs remain visible in proposals; application must never imply build-ready or engineer-approved output.
