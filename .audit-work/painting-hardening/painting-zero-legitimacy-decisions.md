# Painting pricing — per-key explicit-zero legitimacy decisions

Each Settings key the calculator prices from, and whether a recorded `0` is a
legitimate authored value or an unusable one that must flag
`paint_setting_unavailable` (kind `paint_catalog`, hold `project`).

Rule: `0` is **valid** where the math treats it as a real free/zero amount —
a rate, a multiplier, hours, a cost floor, a per-unit price. `0` is
**invalid** (`positive: true`) where the math divides by it or the value is
meaningless at zero (a divisor, the paint-constituent ratio, the waste
multiplier, the perimeter factor, the labor rate used as a mask-labor
divisor).

| Settings key | `positive` | 0 legitimate? | Rationale |
|---|---|---|---|
| `default_labor_rate` | true | **invalid** | Used as a DIVISOR for mask application/cutting labor hours (`maskSqft × rate / laborRate`). 0 → `Infinity`/`NaN` in remote. |
| `min_labor_hours` | false | valid | Floor; 0 = no floor (already the remote default). |
| `min_paint_cost` | false | valid | Floor; 0 = no floor (remote default). |
| `default_paint_supplies_per_sqft` | false | valid | Supplies rate/sqft; 0 = no supplies charge (remote `||1.25` resurrected it — defect fixed). |
| `paint_cost_per_unit` | false | valid | $/unit price; 0 = free paint (remote already honored 0 — plain `num()`, no `\|\|`). |
| `hardener_cost_per_unit` | false | valid | Same. |
| `reducer_cost_per_unit` | false | valid | Same. |
| `paint_mix_ratio` | true | **invalid** | The paint's own share of the mix — the mix denominator `paint+hardener+reducer` must be >0 for a real blend; 0 = no paint in "paint". Remote `||3` resurrected it. |
| `hardener_mix_ratio` | false | valid | Optional blend component; 0 = not in mix. Remote `||1` resurrected it. |
| `reducer_mix_ratio` | false | valid | Same. |
| `mixed_paint_coverage_sqft_per_gallon` | true | **invalid** | Divisor for gallons AND the rate denominator (`mixCost / coverage`). Remote `num(0,1)||1` divided the whole mix cost by 1 → rate exploded ~350x. |
| `paint_waste_multiplier` | true | **invalid** | Multiplies gallons; 0 → 0 gallons → $0 paint for a real job (silent under-quote, not "free"). Remote `||1.25` resurrected it. |
| `fixed_paint_waste_gallons` | false | valid | Additive waste gallons; 0 = none (remote default). |
| `paint_mask_rate_per_sqft` | false | valid | $/sqft mask material rate; 0 = no mask material charge. Remote `||0.75` resurrected it — the headline defect (authored $0 billed $8.50). |
| `paint_mask_machine_cutting_rate_per_sqft` | false | valid | $/sqft machine rate; 0 = free cutting. Remote `||0.10` resurrected it. |
| `paint_mask_application_labor_rate_per_sqft` | false | valid | $/sqft applied as labor hours via labor-rate division; 0 = no app labor. Remote `||0.25` resurrected it. |
| `paint_mask_cutting_labor_rate_per_sqft` | false | valid | Same. Remote `||0.15` resurrected it. |
| `base_labor_hours_per_sqft` | false | valid | Hours/sqft; 0 = no per-area labor. Remote `||0.05` resurrected it. |
| `setup_time_labor_hours` | false | valid | Fixed hours; 0 = none. Remote `||0.5` resurrected it. |
| `paint_mixing_labor_hours` | false | valid | Hours per mix; 0 = none. Remote `||0.25` resurrected it. |
| `color_change_setup_hours` | false | valid | Hours per extra color; 0 = none. Remote `||0.25` resurrected it. |
| `paint_gun_cleaning_hours` | false | valid | Hours per color; 0 = none. Remote `||0.15` resurrected it. |
| `one_side_paint_multiplier` | false | valid | Side multiplier; 0 = authored "no charge" (user's call). Remote `||0.8` resurrected it. |
| `both_sides_paint_multiplier` | false | valid | Same. Remote `||1` resurrected it. |
| `additional_color_multiplier` | false | valid | Extra-color labor multiplier; 0 = no extra labor markup. Remote `||0.3` resurrected it. |
| `simple_complexity_multiplier` | false | valid | Complexity multiplier; 0 = authored. Remote `||0.7` resurrected it. |
| `moderate_complexity_multiplier` | false | valid | Same. Remote `||1` resurrected it. |
| `complex_complexity_multiplier` | false | valid | Same. Remote `||1.5` resurrected it. |
| `letter_perimeter_factor` | true | **invalid** | Perimeter estimate divisor-ish factor for lettering geometry; 0 → letter face area collapses to 0. Remote `||3.5` resurrected it. |

## Non-priced / structural Settings

| Key | Handling |
|---|---|
| `paint_unit` / `hardener_unit` / `reducer_unit` | Enumerated units. Recorded-but-unsupported → `paint_liquid_unit_unavailable`. Missing unit next to a priced component (>0 cost) → same. Missing unit + $0 cost → fine. |
| `panel_labor_tiers` / `complex_shapes_labor_tiers` / `lettering_labor_tiers` | JSON `[{min_quantity,max_quantity,labor_multiplier}]`. Malformed JSON → `paint_labor_tiers_unavailable` (remote silently disabled the whole table). Malformed row field → `paint_labor_tier_row_unavailable`. |
| `default_notes_template` | Not priced — untouched. |

## Item-level fields (hold `item`, code `paint_*_unavailable`)

| Field | Decision |
|---|---|
| `thickness` | Unparseable (incl. `""`, `"abc"`) → `paint_thickness_unavailable`. `0` tolerated for `panel` only (real edge-less math branch exists); `0` flagged for lettering/complex_shapes (nothing prices). Negative → flagged. Remote `parseImperialFraction` returned 0 for ALL unparseable text — the original silent-drop defect. |
| `length` / `width` | Must be finite >0 — every geometry branch gates `>0`; blank/zero/negative/malformed silently collapsed the item. |
| `quantity` | (panel/complex only — lettering forces 1) recorded <1 or malformed → flagged; remote clamped to 1 silently. Absent → default 1, fine. |
| `paint_sides` | Must be `one_side`/`both_sides`/`none`(legacy alias) or absent — anything else silently repriced as one_side. |
| `edge_complexity_multiplier` | (complex_shapes only) recorded must be finite ≥0; negative priced negative edge area, `""` silently zeroed edges. |
| `paint_mask_sqft` | Recorded must be finite ≥0; blank/malformed silently dropped mask. |
| `fixed_waste_gallons` / `base_supplies_cost` | Recorded must be finite ≥0; `""`/junk → `num()` → silent $0. |
| `letter_size` | (lettering only) must be a known size or absent — unknown silently repriced as `moderate`. |
| `paint_colors` | Must be an array — non-array normalized to `[]` → silent $0 paint bill. |
| `item_type` | Must be panel/lettering/complex_shapes or absent — anything else fails every branch → silent $0 item. |

## Project-level fields (hold `project`)

| Field | Decision |
|---|---|
| `items` | Non-array → `paint_items_unavailable` (calc maps it verbatim). |
| `paint_supplies_per_sqft` | Recorded must be finite ≥0 — `""`/null/`"abc"` silently repriced supplies ($0 or default). Explicit 0 = legitimate "no supplies" (remote `!= null` check already let a real 0 through). |

## Blank-vs-absent asymmetry (documented deviation)

- **Settings rows**: `""`/whitespace/null = *not recorded* → module default applies (matches PaintingSettings "unset = default" semantics). Remote `num("")` produced `0`/`fallback` inconsistently — candidate uniformly treats blank as absent, which is strictly safer (a recorded blank `paint_cost_per_unit` priced $0 in remote).
- **Item fields**: `""` = *malformed input* → flagged. A cleared row field isn't "unset" — the calc's `num("")` laundered it to 0/clamp. The page's `paintDraftValue` keeps `""` in the input so validation can flag it instead of mid-edit zeroing.
