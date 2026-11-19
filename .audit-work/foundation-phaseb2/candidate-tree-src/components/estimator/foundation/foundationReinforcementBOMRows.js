const known = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const quantity = value => known(value)
  ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not saved";
const text = value => typeof value === "string" ? value.trim() : "";

// These are displayed source-cost snapshots, not a cut/stock/waste purchasing plan.
// Never derive an unknown split by subtracting from a saved combined amount.
export function foundationReinforcementBOMRows(item, { saved = false } = {}) {
  if (item?.reinforcement_calculation_version !== 2) return null;
  const total = known(item.rebar_cost) ? item.rebar_cost : null;
  if (!item.include_rebar && !(saved && total > 0)) return [];
  const label = text(item.description) || `Foundation ${text(item.component_id) || "?"}`;
  const name = text(item.reinforcement_cost_snapshot?.material?.name) || "Reinforcing steel";
  const physical = quantity(item.rebar_geometry_feet);
  const priced = quantity(item.rebar_feet);
  const material = known(item.rebar_material_cost) ? item.rebar_material_cost : null;
  const labor = known(item.rebar_labor_cost) ? item.rebar_labor_cost : null;
  const quantities = `${physical} LF physical / ${priced} LF priced`;
  const provenance = saved ? "Acknowledged saved quantities and amounts; current pricing unavailable. " : "";
  const review = "Not a purchasing plan. Engineering and purchasing review required.";
  const weights = `Physical weight: ${quantity(item.rebar_geometry_weight_lbs)} lb. Priced weight: ${quantity(item.rebar_weight_lbs)} lb.`;
  const splitMissing = material === null || labor === null;
  const splitMismatch = !splitMissing && total !== null && material + labor !== total;
  if (total !== null && (splitMissing || splitMismatch)) return [{
    material: `${label} - reinforcement (combined saved amount)`,
    quantity: quantities,
    cost: total,
    saved: true,
    reinforcement: true,
    basisUnavailable: true,
    note: `${provenance}${splitMissing ? "Material/labor split: Not saved." : "Stored material/labor split does not reconcile."} Combined steel amount retained without an invented breakdown. ${weights} ${review}`,
  }];
  const basisUnavailable = [item.rebar_geometry_feet, item.rebar_feet, item.rebar_geometry_weight_lbs,
    item.rebar_weight_lbs, item.rebar_labor_hours, material, labor].some(value => !known(value));
  return [{
    material: `${label} - ${name} (material)`,
    quantity: quantities,
    cost: material,
    saved,
    reinforcement: true,
    basisUnavailable,
    note: `${provenance}${weights} Internal material cost only. ${review}`,
  }, {
    material: `${label} - reinforcement labor`,
    quantity: `${quantity(item.rebar_labor_hours)} hr`,
    cost: labor,
    saved,
    reinforcement: true,
    basisUnavailable,
    note: `${provenance}Internal reinforcement labor cost, separate from steel material. ${review}`,
  }];
}
