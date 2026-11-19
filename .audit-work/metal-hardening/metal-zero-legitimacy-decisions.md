# Metal Fabrication — explicit-zero legitimacy decisions

Pricing-availability hardening audit for `src/pages/MetalEstimator.jsx` +
new `src/components/estimator/metal/metalPricingAvailability.js` (remote HEAD
`5f25691b8966137d4c96cafee690a186a797ebb1`; remote file re-pulled at this HEAD
and confirmed byte-identical to the audited baseline pulled under `4b500776`).

Convention: a stored **0** is legitimate only where the calculator consumes it
verbatim as a real amount. It is flagged where a recorded 0 can never take
effect (a `|| fallback` resurrects a hidden default) or where the field is a
required magnitude the math divides/multiplies against.

| Key | 0 legit? | Rationale |
|---|---|---|
| `project.fabrication_rate` / `welding_rate` / `finishing_rate` | **YES** | Stored rates are consumed verbatim by the per-item derive (`hours * rate`). An authored 0 means "this labor type is free on this estimate" and the derive honors it exactly (RED: remote never touched stored rates; model F/G prove 0 is not flagged and not resurrected). |
| Settings `metal_fabrication_rate` / `metal_welding_rate` / `metal_finishing_rate` (seed rows) | **NO** | The seed expression `parseFloat(x) || 65/75/55` resurrects the module default for a recorded 0 — an authored 0 can NEVER take effect through this path (RED R6: remote turned a stored "0" into 75 with no warning). Flagged `metal_setting_unavailable`. Absent rows are the designed default path and are never flagged. |
| `item.material_length_ft` | **YES** | 0 = no material draw; `length * cost_per_unit` consumes 0 verbatim. |
| `item.supplies_cost` | **YES** | 0 = no supplies; consumed verbatim ×quantity. |
| `item.quantity` | **NO (0 and <1 flagged)** | `(item.quantity || 1)` silently reprices a recorded 0/blank/junk as 1 — the stored record and its totals then disagree (RED R3). Quantity is a required positive magnitude; absent→1 stays the designed default. |
| `item.fabrication_hours` / `welding_hours` / `finishing_hours` | **YES** | 0 = none of that labor type; `hours * rate` consumes 0 verbatim. |
| `item.material_cost` / `fabrication_cost` / `welding_cost` / `finishing_cost` (stored derived) | **YES** | Stored derived costs are consumed verbatim by the totals; 0 is a real derived amount for zero inputs. Only non-finite/negative recorded values flag `metal_derived_cost_unavailable` (they can never arise from legitimate nonnegative inputs; RED R1 proved remote launders NaN→$0). |
| `inventory.cost_per_unit` | **YES** | An explicitly stored 0 catalog cost is honored as a free material (`length * 0 = 0`); only missing/non-finite/negative values flag `metal_inventory_cost_unavailable` — and only when the item actually draws material (length > 0). |
| `item.inventory_item_id` | n/a | Presence/resolution check, not numeric. No link + positive length or positive stored material_cost → `metal_inventory_item_unavailable` (silent $0 material or stale snapshot). Dangling link + draw → catalog flag. |
| `project.stock_length_ft` | n/a | Advisory cut-plan field only — never enters priced totals; left on its existing `Math.max(1, Number(x) || 20)` coercion deliberately (documented non-target). |

Blank/`""`/null policy: **absent** optional numerics keep the remote's designed
defaults (length 0, hours 0, supplies 0, quantity 1). A **recorded** blank,
malformed, or non-finite value is always flagged — `parseFloat(x) || 0`
previously laundered `""` to 0 while the input re-rendered blank (RED R5),
and the strict input helpers now preserve the raw text so the field is
flagged instead of laundered.
