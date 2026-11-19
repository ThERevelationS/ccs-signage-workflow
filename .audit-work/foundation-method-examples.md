# Foundation method worked examples

Lane A's worked-example docs — the method-domain worked examples the held
METHOD-* seeds name. Each method's worked example records the input shape +
the expected output shape (never an encoded method — the method is HELD
pending a real cited source).

## METHOD-SIGN-WIND-HELD (O-106)

- **Input shape**: `sign_wind` (the sign's wind design-basis — the wind-load
  method/source the design relies on, e.g. "ASCE 7-22 110mph" or "shop
  standard").
- **Output shape**: the design-basis field carries the operator's entry; the
  method is HELD pending a real cited wind-load method.

## METHOD-FOOTING-BEARING-HELD (O-107)

- **Input shape**: `bearing` (the footing's bearing design-basis — the
  soil-bearing method/source, e.g. "geotech 1500psf" or "presumptive 2000psf").
- **Output shape**: the design-basis field carries the operator's entry; the
  method is HELD pending a real cited bearing method.

## METHOD-SHAFT-HELD (O-108)

- **Input shape**: `shaft` (the shaft's design-basis — the drilled-shaft
  method/source, e.g. "shaft diameter 24in" or "manufacturer spec").
- **Output shape**: the design-basis field carries the operator's entry; the
  method is HELD pending a real cited shaft method.

## METHOD-LATERAL-HELD (O-109)

- **Input shape**: `lateral` (the lateral-load method/source — wind +
  seismic lateral on the footing).
- **Output shape**: the design-basis field carries the operator's entry; the
  method is HELD pending a real cited lateral method.

## METHOD-FROST-HELD (O-110)

- **Input shape**: `frost_depth` (the frost-depth method/source — the local
  frost depth the footing embeds below).
- **Output shape**: the design-basis field carries the operator's entry; the
  method is HELD pending a real cited frost-depth method.

## METHOD-PILLAR-BAR-HELD (O-111)

- **Input shape**: `pillar_bar` (the pillar-bar method/source — the cage
  manufacturer's pillar-bar detail).
- **Output shape**: the design-basis field carries the operator's entry; the
  method is HELD pending a real cited pillar-bar method.

## METHOD-BASE-PLATE-HELD (O-111)

- **Input shape**: `base_plate` (the base-plate method/source — the sign
  manufacturer's base-plate detail).
- **Output shape**: the design-basis field carries the operator's entry; the
  method is HELD pending a real cited base-plate method.

## The fail-closed contract

Every method is HELD — the design-basis field carries the operator's entry;
no method is encoded. A worked example names the input shape + the expected
output shape, never an invented method or a cited-source value the corpus
doesn't carry.

## WORKED-EX-UNIT-CONV — feet/inches entry → canonical inches

`FoundationDimensionInput` (`foundationFtInEntry.js`) parses authored text into
canonical inches; the malformed draft is stored verbatim for diagnostics, never
snapped to a guess.

- Input: `4' 6"` → `foundationDimensionDraftValue` → `54` (inches)
- Input: `48` → `48` (a bare number is inches, unchanged)
- Input: `4' 6x"` (malformed) → the draft string is stored verbatim and the
  input's hint/`foundationDimensionInputIssue` surfaces — never a silent 0.
- Boundary: `""` (blank) stays blank — "not recorded", not a stored zero.

## WORKED-EX-MONOTONIC — feasible embedment scales monotonically with height

`suggestFeasibleDimensions` (`poleCalculator.js:668`) derives embedment =
`ceil(height * embedment_min_ratio)` with `embedment_min_ratio = 1/3` — a
monotonic function of the exposed height (never a capped or inverted result).

- `height_inches = 120` → `embedment_inches = 40`; `pole_diameter_inches = 8`
  → `shaft_diameter_inches = 16` (`ceil(dia * 2)`)
- `height_inches = 240` → `embedment_inches = 80` (double the height doubles
  the suggested embedment — monotonic in its input)
- `height_inches = 121` → `embedment_inches = 41` (ceil lifts the fraction)

`FOUNDATION_METHOD_WORKED_EXAMPLES` records the 120/8 case with the same
outputs (40 / 16) — the documented example reproduces the derivation exactly.

## WORKED-EX-BOUNDARY — held behavior at the domain edges

- `suggestFeasibleDimensions({height_inches: 0})` → `{available: false,
  reason: "a positive exposed pole height is required..."}` — a zero/blank
  height never mints a 0-inch embedment.
- `suggestFeasibleDimensions({height_inches: 120})` (no recorded diameter) →
  `available: true` with embedment only — the shaft-diameter key stays absent
  (never an invented bore).
- `suggestFeasibleFoundationDims({foundation_type: "pillar"})` →
  `{available: false, reason: "no documented feasible-dims domain..."}` —
  types outside the documented domain hold rather than guess.
- `wallCapInputNumber("")` → `null`; a cap with no authored `length_inches`
  keeps a blank cut on the cut list (held-closed, never a guessed stock cut).
