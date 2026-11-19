# Brick & Stone explicit-zero legitimacy decisions
| field | 0 valid? | rationale |
|---|---|---|
| bricks_along_length / bricks_along_width | YES | a flat side is a real wall shape; the extent check requires only that one axis is > 0 |
| courses_high | NO | 0 courses is no wall at all — the remote surface-area gate refused the save anyway |
| layers | NO | Math.max(1,·) silently repriced any <1 as 1 — a recorded 0/0.5 is the clamp defect |
| mortar_gap | YES | dry-stacked / zero-gap masonry is authored; negative priced negative joint volume |
| waste_factor | NO | multiplies the whole count — 0 silently priced $0 bricks/material/labor while the surface-area gate still passed |
| mortar_bag_cost | YES | a legitimately free/included bag |
| bricks_per_hour | NO | the labor divisor — Math.max(1,·) clamped <1 to 1, exploding labor hours |
| labor_rate_per_hour | YES | legitimately free labor |
| markup_percent | YES | a legitimate no-markup price (negative flagged like vinyl) |
| material.length / .width / .height | NO | a masonry unit cannot have 0" dimensions — missing catalog data silently priced 0" geometry |
| material.cost_per_unit | YES for 0, NO for absent | an explicit $0 unit is authored; a MISSING price is not free (vinyl convention) |
| selected_material_id | n/a | absent/dangling selection = catalog unavailability |
