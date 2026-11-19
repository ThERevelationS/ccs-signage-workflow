# Laser pricing — per-key explicit-zero legitimacy decisions

Each Settings key and project/item field the Laser Builder prices from, and
whether a recorded `0` is a legitimate authored value or an unusable one that
must flag `laser_*_unavailable`. Mirrors `painting-zero-legitimacy-decisions.md`.

Rule: `0` is **valid** where the math treats it as a real free/zero amount —
a fixed cost, a handling percentage, setup hours. `0` is **invalid**
(`positive: true`) where the math divides by it or the value is meaningless
at zero (rates, speeds, multipliers that feed a speed, perimeter factor,
dimensions, counts).

Only **consumed** values are validated — Laser has no catalog entities; the
shared Settings rows plus the project's own stored rate/item fields are the
priced surface.

## Seed Settings → project fields (new project only — kind `laser_catalog`, hold `project`)

The load-time seeding maps these into `project.*` for NEW projects
(`!project.id`). Existing records carry their own fields, validated as
project inputs instead — a stored Laser row's rates are record data, not
settings consumption. Recorded-but-unusable values flag
`laser_setting_unavailable` and the strict seed resolver still applies the
documented module default for the math.

| Settings key → project field | `positive` | 0 legitimate? | Rationale |
|---|---|---|---|
| `parameter_laser_machine_rate` → `machine_rate_per_hour` | true | **invalid** | $/hr machine rate; 0 = unconfigured → remote `parseFloat\|\|100` fabricated 100 silently. |
| `parameter_laser_labor_rate` → `labor_rate` | true | **invalid** | $/hr labor; 0 = free labor silently (also drives fixed setup). |
| `engraving_laser_machine_rate` → `engraving_machine_rate_per_hour` | true | **invalid** | Same — engrave-side machine $/hr. |
| `engraving_labor_rate` → `engraving_labor_rate` | true | **invalid** | Same — engrave-side labor $/hr. |
| `parameter_handling_time_percentage` → `parameter_handling_time_percentage` | false | valid | Handling %; authored 0% = no handling labor. Remote `\|\|15` resurrected it — seed now honors 0. |
| `engraving_handling_time_percentage` → `engraving_handling_time_percentage` | false | valid | Same. Remote `\|\|20` resurrected. |
| `min_parameter_laser_setup_hours` → `fixed_setup_hours` | false | valid | One-time setup hours; 0 = none (matches existing-record `?? 0`). Remote `\|\|0.5` resurrected. |
| `parameter_laser_fixed_material_setup_cost` → `fixed_material_setup_cost` | false | valid | One-time supplies cost; 0 = none (remote default already 0). |

## Item-derived Settings (kind `laser_catalog`, hold `project`) — validated only when consumed

`updateItem` re-derives `cut_speed_ipm` / `engrave_speed_sqipm` /
`total_cut_length_inches` / `engrave_area_sqin` from these on every field
edit — a recorded-but-unusable value silently prices at a hidden default.

| Settings key | Consumed when | `positive` | 0 legitimate? |
|---|---|---|---|
| `cut_speed_<t>` (7 thickness keys) | any cutting item (`panel`/`lettering`/`engrave_and_cut`) has `material_thickness` = t | true | **invalid** — 0 speed = infinite cut time; remote `\|\|20` launders. |
| `acrylic/wood/leather_cut_multiplier` | any cutting item uses that material | true | **invalid** — 0 → speed 0 → remote `\|\|1`-style silent reprice (speed lands `0 \|\| 20` → 20). |
| `laser_engrave_speed_sqipm` | any `engraving`/`engrave_and_cut` item | true | **invalid** — engrave divisor. |
| `acrylic/wood/leather_engrave_multiplier` | any engraving-type item uses that material | true | **invalid** — same laundering path. |
| `laser_letter_perimeter_factor` | any `lettering` item | true | **invalid** — 0 → letter perimeter collapses to $0. Remote `\|\|3.5` resurrected. |

## Project-level stored fields (kind `laser`, hold `project`, code `laser_rate_unavailable`)

These live ON the LaserProject record (seeded once, then authoritative for
that record — remote calc reads them with `||` launders that pass truthy
malformed strings straight into NaN).

| Field | Consumed | Decision |
|---|---|---|
| `machine_rate_per_hour` | any cutting item | finite >0; 0 = unconfigured machine time. |
| `labor_rate` | always (fixed setup = `fixed_setup_hours * labor_rate`) | finite >0. |
| `engraving_machine_rate_per_hour` | any engraving-type item | finite >0. |
| `engraving_labor_rate` | any engraving-type item | finite >0. |
| `parameter_handling_time_percentage` | any cutting item | finite ≥0 — authored 0% legitimate. |
| `engraving_handling_time_percentage` | any engraving-type item | finite ≥0 — authored 0% legitimate. |
| `fixed_setup_hours` | always | finite ≥0 — 0 = no setup. |
| `fixed_material_setup_cost` | always | finite ≥0 — 0 = no supplies charge. |
| `items` | — | non-array → `laser_items_unavailable` (calc maps verbatim). |

## Item-level fields (kind `laser`, hold `item`)

| Field | Scope | Decision |
|---|---|---|
| `item_type` | all | Must be panel/lettering/engraving/engrave_and_cut — anything else fails every cost branch → silent $0 item (`laser_item_type_unavailable`). |
| `material_type` | all | Must be Acrylic/Wood/Leather — unknown/absent derives `undefined_*_multiplier` → silent 1× (`laser_material_type_unavailable`). |
| `material_thickness` | cutting items | Must be one of the 7 imperial sizes — anything else reads a nonexistent `cut_speed_*` row → silent 20 mm/s (`laser_thickness_unavailable`). Skipped for pure engraving (not price-consumed). |
| `length` / `width` | panel, engrave_and_cut | finite >0 — blank/0/negative/malformed silently collapses perimeter (`laser_dimension_unavailable`). |
| `length` / `width` | engraving | flag only when recorded-but-malformed (feeds `engrave_area_sqin` derivation on edit); 0/absent fine when area is hand-entered. Not rendered for lettering. |
| `letter_height` | lettering | finite >0 (`laser_dimension_unavailable`). |
| `num_letters` | lettering | finite ≥1 (`laser_quantity_unavailable`). |
| `quantity` | all | finite ≥1 — consumed by `engrave_area_sqin * quantity` (every row) and all cut-length derivations (`laser_quantity_unavailable`). |
| `total_cut_length_inches` | cutting items | finite >0 — the value the calc multiplies by `MM_PER_IN` verbatim (`laser_cut_length_unavailable`). Engraving type: finite ≥0. |
| `engrave_area_sqin` | engraving types | finite >0 (`laser_engrave_area_unavailable`). Other types: finite ≥0 (multiplied unconditionally). |
| `cut_speed_ipm` | all | finite >0 — unconditional divisor; malformed truthy string → NaN (`laser_cut_speed_unavailable`). |
| `engrave_speed_sqipm` | all | finite >0 — unconditional divisor (`laser_engrave_speed_unavailable`). |

## Blank-vs-absent asymmetry (same convention as painting)

- **Settings rows**: `""`/whitespace/null = *not recorded* → module default
  applies (`LASER_SETTINGS_DEFAULTS` documents every fallback).
- **Item/project fields**: `""` = *malformed input* → flagged. A cleared
  field isn't "unset" — `"" * x` silently zeroed or NaN'd before.
  `laserDraftValue` keeps `""` in the input so validation flags it instead
  of mid-edit laundering.

## Not scanned (not consumed by the page)

`min_parameter_laser_labor_hours`, `min_engraving_laser_setup_hours`,
`min_engraving_laser_labor_hours`, `engraving_laser_fixed_material_setup_cost`,
`electricity_cost_per_kwh`, `operator_cost_per_hour`,
`facility_overhead_per_hour`, all `*_purchase_price`/`lifespan`/`usage`/
`maintenance`/`power`/`tube` machine-cost-calculator rows (informational
only — LaserSettings' cost helper, not the estimate path),
`default_notes_template` (not priced), and `total_supplies_cost` on the
record (a derived output, not an input).

## Dead code note

`src/components/estimator/laser/laserCalc.js` (`calcLaserProject`) is DEAD —
zero importers remote-wide — and DIVERGENT from the live inline math
(ipm-vs-mm/s units, `letter_height * 4` perimeter, no fixed-setup handling
split, different rate fallbacks). NOT hardened; the ported live math inside
`laserPricingAvailability.js` (`computeLaserTotals`) is the byte-identical
reproduction of the page's `calculateTotals`.
