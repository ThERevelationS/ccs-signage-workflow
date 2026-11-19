import {
  projectFoundationReinforcementWorkOrderPart,
  readFoundationReinforcementWorkOrderPart,
} from "./foundationReinforcementWorkOrderPart";

const clean = value => String(value ?? "").trim();

const displayQuantity = (value) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toPrecision(12)) : value;

export function foundationReinforcementPrintMaterial(part) {
  const projection = Object.hasOwn(part || {}, "foundation_reinforcement_handoff")
    ? null : projectFoundationReinforcementWorkOrderPart(part);
  const row = projection ? { ...part, ...projection } : part;
  const value = readFoundationReinforcementWorkOrderPart(row);
  if (!value) return null;
  const basis = value.frozenStatus === "recorded"
    ? `Frozen priced quantity: ${displayQuantity(value.quantity)} ${value.unit}.`
    : "Frozen quantity and unit cost: Not recorded. Saved extended amount retained.";
  const physical = value.part_type === "material"
    ? `Physical steel (last calculated): ${displayQuantity(value.physical_quantity_ft)} ft; ${displayQuantity(value.physical_weight_lbs)} lb.`
    : `Last-calculated labor: ${displayQuantity(value.last_priced_quantity)} ${value.last_priced_unit}.`;
  const selection = value.part_type === "material"
    ? `Last-calculated material: ${clean(value.last_calculated_material.name) || "Unnamed steel"}.`
    : "";
  return {
    name: clean(row.part_name) || clean(row.name) || clean(row.inventory_item_name) || "Reinforcement",
    type: value.part_type,
    qty: displayQuantity(value.quantity ?? ""),
    unit: value.unit,
    unit_cost: value.unit_cost ?? null,
    ext_cost: value.extended_cost,
    section: clean(row.section_name) || clean(row.module_key),
    reinforcement_note: [basis, physical, selection,
      "Pricing and physical quantities are not a purchasing plan. Engineering and purchasing review required.",
    ].filter(Boolean).join(" "),
  };
}
