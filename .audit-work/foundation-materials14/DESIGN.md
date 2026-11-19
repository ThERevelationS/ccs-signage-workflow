# Foundation Materials 14 - Missing Selection Cost Integrity

## Evidence And Scope

- Equipment13 is checkpointed at `6aecdb9e49bb991a05ec7376`.
- Fresh remote source/schema: `fresh-baselines.json` (six files), `ui-baselines.json` (page and three other consumers).
- Frozen actual pre-change engine: `calc-before.mjs`, copied from accepted Equipment13 canonical engine.
- Lead-authored/lead-executed synthetic reproduction: `material-loss-repro.json`.
- Missing concrete, rebar and forming selections change historical cost without catalog issues.
- Missing bagged concrete is assumed to be ready-mix: the fixture's saved delivery zero becomes 381 of default delivery/material cost.
- Actual source-save payload persists per-item calculated fields and category totals, but NOT delivery/truck snapshots.
- Raw editor state retains earlier cached item values after saving newly calculated values. Price fallback must use the acknowledged source snapshot, not assume raw editor caches represent the latest save.

No production records, paid integrations, publishing or deployment. Concrete only.

## Settled Interfaces

1. `foundationItemCatalogIssues(item, inventory, index=0)` in existing integrity helper.
   - Explicit nonempty `selected_concrete_id` requires a matching bagged_concrete or concrete_service record.
   - Active forming with explicit nonempty `selected_forming_id` requires forming_material.
   - Inactive forming selections remain visible but do not block.
   - Included rebar requires the SAME size lookup as legacy: spread uses rebar_size (no invented fallback), pillar uses pillar_rebar_size || "#4".
   - Explicit finite nonnegative numeric custom_rebar_cost_per_ft, including zero, supplies manual pricing without a catalog rebar row.
   - Included rebar with no valid manual rate and no size match blocks. Rebar disabled does not block.
   - Existing unassigned concrete/project-default mode is NOT redesigned here.
   - Wrong-role records also block. Preserve existing codes/kind/index metadata conventions; foundation issues use kind "foundation" and the concrete/forming/rebar selection field.
2. `calcItem(item, project, inventory, settings={}, savedItem=item)`.
   - Complete valid catalog path stays byte-for-byte equivalent in returned fields/numbers to the frozen engine.
   - Missing required selection returns ALL calculated snapshot fields from savedItem, not a mix of fresh labor and cached material. Invalid/absent numeric snapshots become undefined, not zero. Numeric zero is preserved.
   - Authored dimensions/selection/overrides remain untouched. No render-time mutation.
   - Explicit null savedItem means the component has no acknowledged saved snapshot.
3. `calcProject(project, inventory, settings={}, {savedProject}={})`.
   - No optional snapshot argument: use project's own historical fields (existing direct callers).
   - Explicit savedProject: trust only matching source ID; match item snapshots by unique stable component_id, never array position. Newly copied/added components have no saved snapshot.
   - Return additional `itemPricing[]` sidecars: `{ available, issues }`; no extra price metadata persisted in item rows.
   - ANY incomplete foundation item bypasses legacy project delivery calculation entirely (its quantities are saved, not current). Do not let missing bagged concrete become ready-mix.
   - Delivery fallback reads ONLY versioned `concrete_delivery_snapshot` from the acknowledged saved project.
   - Incomplete delivery result: `{pricingUnavailable:true, concreteTotal, roundedYards, ratePerYard, trucksList, additionalStopsCost, availableMixes:[], availableAdmixes:[]}`.
   - Missing saved delivery values are undefined; trucks remain visible when saved. No default supplier/mix/fee fabrication.
   - Unknown item component sums are null. Category totals may fall back to explicit finite acknowledged category snapshots. Unknown aggregate grand total is null, not zero.
   - Complete totals/delivery/rows remain equivalent to the frozen engine. Existing pole/equipment/cap/wall behavior otherwise unchanged.
4. `captureConcreteDeliverySnapshot(delivery)` returns version 1 plus snake-case fields:
   - version, concrete_total, rounded_yards, rate_per_yard, additional_stops_cost, trucks (copied, with yards/rounded_yards/cost/small_order_fee/fuel_fee).
   - No default numeric values or reconstruction from category totals. Legacy absent snapshot stays absent.

## Source Save And Snapshot Provenance (Lead-Owned)

- Extend existing acknowledgedVersionRef metadata with sourceSnapshot.
- On successful load, bind the normalized source project to that ref.
- On context-key reset, preserve an already matching acknowledged snapshot; NEVER promote the mutable draft into a saved snapshot.
- On verified source acknowledgement in the same context (also partial/superseded-by-new-edit outcomes), bind `{...captured.project,...captured.basePayload,id,updated_date}` to the ref.
- Use the matching acknowledged snapshot as calcProject's optional savedProject. Include its identity in memo dependencies.
- Undo/Redo and newer edits cannot roll back the acknowledged snapshot or overwrite newer geometry.
- Old-context replies cannot install a snapshot in a reopened/new context.
- Add concrete_delivery_snapshot to the actual source-save payload.
- Add optional, no-default schema field for that snapshot. Add missing calculated item snapshot properties supported by the engine (bags/rates/feet/weight/excavation hours/forming qty). No data migration.
- Do not change save-session ownership, CAS, Builder acknowledgement, recovery or navigation policy.

## UI Work (Delegated Only After Core Is Authored)

- ItemCard receives `pricing={calc.itemPricing[index]}`. Show unavailable issues, saved-vs-current status, Not saved vs explicit numeric zero. Saved quantities may not match current dimensions.
- Native concrete/forming pickers retain missing selected IDs with disabled unavailable option. Active/inactive selection warning is accurate. Reassignment preserves other fields.
- Concrete override's unit is bag when known bagged, CY for known ready-mix, unknown when unavailable. Empty override explicitly clears to null; numeric zero remains zero.
- Spread rebar size missing is visibly empty rather than displaying a fictitious selected #4; pillar legacy #4 fallback stays.
- Delivery panel handles missing numeric snapshots without toFixed crashes, shows saved-zero/Not saved correctly, no fabricated mix/fee choices, retains saved mix/admixture selections visibly. Disable catalog-dependent price controls while unavailable; no render updates.
- Totals formats null/unknown quantities/costs as Not saved; grand total remains Pricing unavailable when blocked.
- BOM receives itemPricing and pricingUnavailable. Keep ordinary grouping for resolved items; exclude blocked items from these groups, then list their saved concrete/rebar/forming values per foundation with unknown quantities/costs visible as Not saved.
- Unavailable delivery always has a visible saved/unknown order row (never synthetic ready-mix). BOM total is Pricing unavailable while blocked.
- Existing add helper must not drop real positive formatted quantities solely because cost is zero. Label the sum "Listed cost subtotal" rather than falsely implying all legacy rebar/forming labor is material-only.
- No private draft buffers; explicit valid edits reach shared project immediately, as in Equipment13.

## Required Verification

- Before editing: freeze complete-catalog results from the frozen engine for bagged/ready-mix, pillar/spread, active/inactive forming and rebar, manual overrides incl. zero, delivery mixes/admixes/trucks/fees/stops and mixed projects.
- After: exact whole calculated item/totals/delivery parity for every complete case.
- Missing each binding: immutable saved-item preservation, absent vs zero, wrong role, inactive selection, manual-zero rebar, no synthetic truck pricing.
- Saved delivery 0, saved nonzero/trucks, legacy absent snapshot, unsupported/malformed snapshot, and source-ID mismatch.
- Acknowledged snapshot by stable ID after reorder/copy; no positional borrowing or raw stale cache fallback.
- Page synthetic tests: raw draft survives reload, all write paths blocked, exact CAS after recovery, source payload includes delivery snapshot; Undo/newer edits use acknowledged saved costs; old-route replies do not install snapshots.
- UI/node/browser/lint/actual page build. SDK-free fixture, zero external requests/console/page errors.
- Fresh remote compare, restore checkpoint, existing edit/new write, dependency build/readback/status ready, named checkpoint.

## Explicit Remaining Gates

This unit does not complete O-009. Missing/invalid rates/types/geometry, active/unpriced/free taxonomy, unassigned supplier defaults, normalizer erasing absent prices to zero, single-layer vertical rebar, bag/CY override units, multiple-supplier delivery grouping and broader native navigation remain open. Equipment raw-cache freshness after acknowledged saves is a later display hardening case; its missing-catalog write guard remains fail-closed.

## Next Gate: Native Navigation (Static Evidence Only)

- `FoundationEstimator.jsx` guards toolbar Back and registers `beforeunload` for dirty, saving, or pending recovery.
- It currently has no page-local unsent-draft persistence or SPA history navigation blocker.
- `App.jsx` uses React Router `BrowserRouter`; package requests React Router DOM `^6.26.0`. Do not replace the app router to use a data-router-only blocker API.
- `EmailGate.jsx` supplies the verified staff identity through `getSessionUser()` / its own auth context. The separate `lib/AuthContext.jsx` is Base44 platform auth, not the staff identity. Any recoverable local draft must bind to the verified staff identity and source/estimate context without storing tokens.
- These are code observations, NOT a browser reproduction of native Back losing edits. Reproduce using synthetic real-router navigation before choosing the contained repair.
- No native-navigation source changes are included in Materials14.
