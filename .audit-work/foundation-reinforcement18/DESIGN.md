# Versioned Reinforcement Geometry 18 - Local Core First

## Status And Boundary

- Core-start remote baseline was verified Reinforcement17: checkpoint `6aed8d8a8e452a83c24e5abe`, commit `0a01139628455aa8a0a6dac3e155513bb2d35fab`. Latest main additionally contains the separately verified InvokeLLM policy at `6aeda3df9662f00bac5c9411` / `b359c0a43e62075b1d25d61fa132ceeb9b875d51`; that unit did not activate model18 or cost18.
- `fresh-source.json` confirms the planned new model helper is absent remotely and captures the current validator/calculator/page.
- This stage authors a pure version-2 steel geometry/quantity model locally. It is NOT wired into pricing, schemas or the page yet. Do not activate an unused or incomplete model.
- The lead owns this numeric model, its independent expected quantities, tests and later financial/cost-delta integration. No engineering design rules or universal cover/support density are inferred.
- Future integration must retain absent/version1 legacy calculations and require explicit proposal review/acceptance with a visible cost delta before changing the calculation version. No silent migration.
- Local core verification COMPLETE:39/39 lead-authored independent cases, lint0, standalone bundle and actual unchanged-page dependency bundle. `core-acceptance.json` pins source SHA256 and proves no page import. Next actions are in `INTEGRATION_NEXT.md`; this is still NOT an activated/complete app unit.
- Local cost projection verification COMPLETE:74/74 lead-authored/checked synthetic cases, lint0, syntax0, standalone and actual-page bundle; `cost-acceptance.json` pins cost source and frozen `cost-model-fixtures.json`. Neither helper is imported by the active page. Three baseline fail-closed gaps (errored/malformed model diagnostics and unknown cut roles) were fixed; valid geometry formulas and current app prices did not change.

## Pure Interface

`calculateFoundationReinforcementModel(item, design, { geometryLimit = 4096 } = {})`

Return:

- `version: 2`, `componentId`, `instanceCount`, `status: "off" | "incomplete" | "invalid" | "valid"`.
- `issues: [{ field, code, severity: "error" | "warning", message }]`.
- `perInstance`: separate horizontal-bar, longitudinal-bar, hoop and inter-mat-tie counts/lengths in inches, plus mat crossings / hoop-bar crossings / tie ends.
- `totals`: scaled counts, separate lengths in feet and total steel feet. No prices, weights, waste, stock/pack rounding or structural capacity.
- `groups`: per-instance cut-quantity groups, independent of preview sampling.
- `geometry`: per-instance straight bars, circular hoops and explicit tie reference paths in local inches (`x` length, `y` height above concrete bottom, `z` width).
- `omittedGeometryCount`: exact number not generated when the preview budget is reached; quantities remain complete. Never instantiate foundation quantity copies in the model.
- `supports`: explicit unknown count while unconfigured, or zero only when support mode is explicitly `off` with a nonempty explanation. Manual/auto catalog support modeling is a subsequent gate, never silently zero.
- `engineeringApproved: false` always. "valid" means numeric/geometric validity, not engineering or readiness to build.

If any error exists, return null quantities and empty groups/geometry, never plausible partial/zero totals. Missing required inputs yield `incomplete`; malformed/infeasible inputs yield `invalid`. Rebar disabled returns zero steel without requiring a design, provided basic foundation geometry is valid.

## Shared Required Design

```json
{
  "version": 2,
  "bar_diameter_inches": 0.5,
  "cover_inches": { "side": 3, "top": 3, "bottom": 3 },
  "supports": { "mode": "unconfigured" }
}
```

Numbers above are SYNTHETIC EXPLICIT INPUTS, not defaults or engineering recommendations. Design numeric fields require finite numbers (no partial string parsing). Basic item dimensions/count use the existing validator with legacy steel validation disabled for this independent version-2 proposal.

Cover is nonnegative geometric clearance. Bar diameter is positive. No universal structural cover minimum is invented. Stable nonempty IDs are required and duplicates are rejected. Model list budgets bound CPU; geometry budget is capped at4096, including a zero-budget quantities-only mode.

## Spread Footing

```json
{
  "spread": {
    "mats": [{
      "id": "top",
      "bearing_elevation_inches": 32,
      "max_spacing_x_inches": 12,
      "max_spacing_z_inches": 12
    }],
    "inter_mat_ties": []
  }
}
```

- A mat has two contacting orthogonal bar tiers: X bars at bearing+diameter/2, Z bars at bearing+1.5diameter. Its lowest steel surface is the bearing elevation; highest is bearing+2diameter.
- Side bars' centerlines are sideCover+diameter/2 from faces. Straight cut ends stop at sideCover. Thus cut lengths are length/width minus twice sideCover, not twice the centerline offset.
- Spacing means MAXIMUM center-to-center spacing. Include both edge centerlines and use `ceil(centerlineSpan/maxSpacing)+1` (one if span is zero), evenly distributed. Never use floor and exceed the authored maximum.
- Require bottom/top/side clearance and nonoverlapping mat tier envelopes. No extra structural inter-mat clearance is invented.
- No automatic vertical steel for a single mat or at every crossing.
- Explicit ties are records `{id, from_mat_id, to_mat_id, x_inches, z_inches, cut_length_inches}`. Distinct existing mats are required; centerline path is between their lower X tiers. Cut length must be at least that straight distance. Hook/bend allowance is authored in cut length, not invented.
- Tie geometry is a reference path, not fabrication-ready bent-bar geometry; counts/lengths are explicit and a warning preserves that distinction.

Independent synthetic expectation: 36x36x36, explicit3-inch cover, 0.5-inch bar, one top mat bearing32, max spacing12 ->4 bars each direction, 30-inch cuts, 8 bars /20ft per instance,16 mat crossings, ZERO inter-mat ties. This is not the legacy64ft and must NOT replace saved costs automatically.

## Pillar

```json
{
  "pillar": {
    "hoops": [{
      "id": "h1",
      "center_y_inches": 6,
      "centerline_diameter_inches": 17,
      "cut_allowance_inches": 0
    }],
    "longitudinal": {
      "count": 4,
      "radius_inches": 8,
      "bottom_end_inches": 3,
      "top_end_inches": 33
    }
  }
}
```

- Hoop length is PI*authored centerline diameter+explicit allowance. Never silently clamp diameter to foundation diameter minus4.
- Check hoop outer radius including bar radius against concrete side clearance; check hoop thickness against top/bottom clearance; adjacent hoops cannot overlap.
- Longitudinal bars are independent of hoop count. Even one hoop retains all authored longitudinal bars.
- A version2 explicit longitudinal count0 means zero bars, not legacy fallback4. Hoop-only and longitudinal-only layouts are representable; enabled steel cannot be entirely empty.
- Bars lie on the authored radius with evenly spaced angles. Check radial and end clearances, bar-to-bar overlap, and hoop-to-longitudinal overlap. Missing connections/hoops outside longitudinal span are visible warnings, not invented structural rules.
- One explicit17-inch hoop plus four30-inch longitudinal bars -> PI*17/12+10 feet. Count0 with that hoop -> PI*17/12 feet.

## Completion Before Activation

1. Author/check core and independent geometry/count/range/budget/purity tests.
2. Settle cost projection, versioned persistence and stale-proposal fingerprinting; accepted quotes and source/Builder CAS remain protected.
3. Integrate proposal UI with explicit accept/undo and cost-delta review; unknown supports/engineering inputs visible, never fake zero prices.
4. Integrate shared preview/BOM/parts using this same accepted model, not duplicated formulas.
5. Browser/regression/readback/build gates, then checkpoint a complete contained unit. O-016 through O-031 stay OPEN until their actual requirements are satisfied.
