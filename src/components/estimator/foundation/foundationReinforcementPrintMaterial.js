// Print row for a foundation reinforcement material in the work-order print
// model. Pure: it reads saved snapshots only and returns null for any row that
// is not a foundation reinforcement part, so the generic materials path handles
// everything else. The note states plainly that these quantities are not a
// purchasing plan and that engineering/purchasing review is still required.
import {
  projectFoundationReinforcementWorkOrderPart,
  readFoundationReinforcementWorkOrderPart,
} from "./foundationReinforcementWorkOrderPart";

const clean = (value) => String(value ?? "").trim();

export function foundationReinforcementPrintMaterial(part) {
  if (!part || typeof part !== "object") return null;
  let row = part;
  try {
    const projection = Object.hasOwn(part, "foundation_reinforcement_handoff")
      ? null
      : projectFoundationReinforcementWorkOrderPart(part);
    row = projection ? { ...part, ...projection } : part;
    const value = readFoundationReinforcementWorkOrderPart(row);
    if (!value) return null;
    const basis = value.frozenStatus === "recorded"
      ? `Frozen priced quantity: ${value.quantity} ${value.unit}.`
      : "Frozen quantity and unit cost: Not recorded. Saved extended amount retained.";
    const physical = value.part_type === "material"
      ? `Physical steel (last calculated): ${value.physical_quantity_ft} ft; ${value.physical_weight_lbs} lb.`
      : `Last-calculated labor: ${value.last_priced_quantity} ${value.last_priced_unit}.`;
    const selection = value.part_type === "material"
      ? `Last-calculated material: ${clean(value.last_calculated_material?.name) || "Unnamed steel"}.`
      : "";
    return {
      name: clean(row.part_name) || clean(row.name) || clean(row.inventory_item_name) || "Reinforcement",
      type: value.part_type,
      qty: value.quantity ?? "",
      unit: value.unit,
      unit_cost: value.unit_cost ?? null,
      ext_cost: value.extended_cost,
      section: clean(row.section_name) || clean(row.module_key),
      reinforcement_note: [
        basis,
        physical,
        selection,
        "Pricing and physical quantities are not a purchasing plan. Engineering and purchasing review required.",
      ].filter(Boolean).join(" "),
    };
  } catch {
    // A malformed/stale handoff row must never break printing — fall back to
    // the generic materials path for that row.
    return null;
  }
}