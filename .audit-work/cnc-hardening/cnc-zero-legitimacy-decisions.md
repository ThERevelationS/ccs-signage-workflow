# CNC pricing — per-key explicit-zero legitimacy decisions

Each value the page-inline calculator consumes (`updateItem` + `calculateTotals`
in `CNCEstimator.jsx`), and whether a recorded `0` is a legitimate authored
value or an unusable one that must flag `cnc_*_unavailable`.

Rule (paint/channel convention): `0` is **valid** where the math treats it as a
real free/zero amount — a rate, a percentage, an hour floor. `0` is **invalid**
where the math divides by it or the value silently cancels a priced leg —
divisors (cut speed, carve speed) and multiplicative factors that zero a whole
work leg (letter perimeter factor, material cut multiplier, letter height /
count, quantity).

## Settings — live-consumed (kind `cnc_catalog`, hold `project`)

Absent rows fall back to the documented module defaults **by design** — never an
issue. Only recorded-but-unusable values flag.

| Settings key | 0 legitimate? | Rationale |
|---|---|---|
| `cnc_letter_perimeter_factor` | **invalid** (positive) | Multiplies `letter_height` in the lettering cut leg — 0 → `cutLength = 0` → lettering prices $0 silently. Remote `\|\|3.5` resurrected it. Channel-letter hardening treats the same key as required-finite (`CNC_REQUIRED`); paint's `letter_perimeter_factor` was positive-required for the identical reason. |
| `min_cnc_labor_hours` | valid (nonneg) | Floor on dynamic setup labor; 0 = no floor (documented default). |
| `cnc_cut_speed_<size>` ×17 | **invalid** (positive) | Written into `item.cut_speed_ipm` on thickness pick — the cut-time divisor, gated `> 0`. A recorded 0/malformed value silently drops all cut pricing at that thickness (remote `\|\|50` laundered both into a 50 write). |
| `<material>_cnc_cut_multiplier` ×8 | **invalid** (positive) | Multiplies the material's entire cut leg — 0 zeroes every cut for that material = silent under-quote (channel-letter hardening applies `channelPositiveNumber` to the same keys; paint's `paint_waste_multiplier` precedent). Remote `\|\|1.0` resurrected it. |

## Settings — copied into the project at load → validated as project fields

The CONSUMED value is the project field (a stored project value wins over the
settings row via `??`), so these flag at `cnc_project_rate_unavailable` on the
project field, not as settings issues — one flag site per consumed value, no
double-flagging.

| Project field ← Settings key | 0 legitimate? | Rationale |
|---|---|---|
| `machine_rate_per_hour` ← `cnc_machine_rate` | valid (nonneg) | $/hr multiplier; 0 = authored "machine time free" (paint's `default_paint_supplies_per_sqft` / channel's finite-ok precedent). Negative → negative costs — flagged. Remote `\|\|75` resurrected 0 AND laundered `"abc"`. |
| `labor_rate` ← `cnc_labor_rate` | valid (nonneg) | $/hr multiplier; same reasoning. Remote `\|\|45` resurrected. |
| `setup_time_percentage` ← `cnc_setup_time_percentage` | valid (nonneg) | % multiplier `/100`; 0 = authored "no setup labor". Remote `\|\|20` resurrected. |
| `fixed_setup_hours` ← `min_cnc_setup_hours` | valid (nonneg) | Additive hours; 0 = none (documented default). Remote `\|\|0` laundered malformed to 0 silently. |

## Item-level fields (hold `item`)

| Field | Decision |
|---|---|
| `item_type` | Must be `panel` / `lettering` / `3d_carving` — anything else fails the cut-leg branch → silent $0 cut leg. Absent also flags (type cannot be determined → cannot price deterministically). |
| `material_type` | (cut leg only) must match a known material case-insensitively — remote lowercases it into the multiplier key, so `"wood"` ≡ `"Wood"`. Unknown/missing resolves to a silent 1× multiplier. Not consumed for `3d_carving` (carve leg only) → not flagged there. |
| `quantity` | (non-lettering only — lettering forces 1 by design) must be finite ≥ 1. Remote `*quantity` verbatim: absent/malformed → `NaN` → `\|\|0` in totals = silent $0 row; 0 → $0; negative → negative cost. |
| `length` / `width` (panel) | Each finite ≥ 0 — a single 0 edge still produces a real perimeter (a rip cut is legitimate). **Both at 0** → `cnc_dimension_unavailable` (0 × 0 panel = no perimeter, silent $0). Negative → flagged (shrinks perimeter below real). `""`/malformed → flagged (remote `parseFloat\|\|0` laundered to 0). |
| `letter_height` / `num_letters` (lettering) | Positive-required — multiplicative legs; any 0/blank/malformed → silent $0 letters. |
| `cut_speed_ipm` (cut leg) | Positive-required — divisor gated `> 0` in remote math; 0/blank/malformed silently drops all cut pricing. |
| `carve_area_sqin` (3d) | Positive-required — the gated `> 0` leg; 0/blank/malformed → silent $0 carving. |
| `carve_area_sqin` (non-3d) | Consumed whenever `> 0` for ANY type (remote gate is field-level, not type-level). Recorded malformed/negative → silently ignored → flagged. |
| `carve_speed_sqipm` (3d) | Positive-required — divisor gate; silent $0 otherwise. |
| `carve_speed_sqipm` (non-3d) | Flagged only when `carve_area_sqin > 0` (the speed is only consumed when an authored carve area exists). |
| `carve_depth` | **Not consumed** by the page math (only by dead `cncCalc.js`) → untouched, unflagged. |
| `material_thickness` | Not a pricing input — only maps to a `cnc_cut_speed_*` key when the user re-picks it; the stored label itself is unconsumed → unflagged. |
| `cutter_diameter_in`, `smallest_detail_in`, `workholding_method`, `creates_loose_pieces`, `force_enhanced` | HoldDownAdvisor advisory inputs — never priced → untouched. |

## Project-level field (hold `project`)

| Field | Decision |
|---|---|
| `items` | Non-array → `cnc_items_unavailable` (the derived pass maps it verbatim). |

## Reprice-staleness design (the unique CNC defect)

Remote bakes `machine_time_hours` / `setup_time_hours` / `machine_cost` /
`labor_cost` onto each item inside `updateItem`, using `prev.setup_time_percentage`,
`prev.machine_rate_per_hour`, `prev.labor_rate`. Editing **Setup Time Percentage**
(or loading a template / changing settings) afterwards never re-walks the items —
`calculateTotals` sums the stale snapshots, so stale totals persist as current
and are SAVED as such.

Fix: `calcCncPricing` re-derives item pricing + totals from the CURRENT raw
inputs every render (`computeCncItemPricing` / `computeCncTotals` — formulas
byte-identical to the remote valid path). Display, totals, badges,
CustomerPricingTab, print/download, and the SAVE PAYLOAD (`items: pricedItems`)
all consume derived values — so (a) a rate edit reprices everything live, and
(b) the acknowledged snapshot persisted on save is always current pricing
(recompute-on-save). `updateItem` keeps writing its stored snapshot
byte-identically for record compatibility; the derived layer owns truth.

## Blank-vs-absent asymmetry (mirrors paint)

- **Settings rows**: `""`/whitespace/null = *not recorded* → documented module
  default applies (matches CNCSettings "unset = default" semantics).
- **Project/item fields**: `""` = *malformed input* → flagged. A cleared field
  isn't "unset" — remote `parseFloat("")||0` laundered it to 0; `cncDraftValue`
  keeps `""` in the input so validation flags it instead of mid-edit zeroing.
