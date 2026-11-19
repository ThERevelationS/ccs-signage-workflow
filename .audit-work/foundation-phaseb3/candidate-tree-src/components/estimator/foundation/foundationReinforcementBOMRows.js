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
  const rows = [{
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
  rows.push(...supportBOMRows(item, label, provenance, review, saved));
  return rows;
}

// Modeled rebar supports list one material row per selected catalog pick (with
// its pack-rounded purchase quantity) plus one install-labor row. A saved item
// whose snapshot predates support modeling surfaces the gap instead of
// implying zero; no support amount is ever invented.
function supportBOMRows(item, label, provenance, review, saved) {
  const snapshot = item.reinforcement_cost_snapshot?.supports;
  const required = known(item.support_count) ? item.support_count : null;
  if (!snapshot && required === null) {
    return saved ? [{
      material: `${label} - supports (not recorded)`, quantity: "Not saved", cost: "Not saved",
      saved: true, reinforcement: true, basisUnavailable: true,
      note: `${provenance}This acknowledged item predates support modeling; support quantity and cost were not recorded. ${review}`,
    }] : [];
  }
  if (required === 0) return [];
  const selections = Array.isArray(snapshot?.selections) ? snapshot.selections : [];
  const supportMaterial = known(item.support_material_cost) ? item.support_material_cost : null;
  const supportLabor = known(item.support_labor_cost) ? item.support_labor_cost : null;
  const supportLaborHours = known(item.support_labor_hours) ? item.support_labor_hours : null;
  const supportTotal = known(item.support_cost) ? item.support_cost : null;
  const unresolved = [required, supportMaterial, supportLabor, supportLaborHours, supportTotal].some(v => v === null)
    || selections.some(s => !known(s?.material_cost) || !known(s?.units_purchased));
  if (unresolved || !selections.length) {
    return [{
      material: `${label} - supports (${required === null ? "not recorded" : `${required} required`})`,
      quantity: required === null ? "Not saved" : `${required.toLocaleString("en-US")} required`,
      cost: supportTotal === null ? "Not saved" : supportTotal,
      saved: true, reinforcement: true, basisUnavailable: true,
      note: `${provenance}Modeled support economics are unresolved; the acknowledged amount is shown without an invented catalog breakdown. ${review}`,
    }];
  }
  const rows = selections.map((s, index) => ({
    material: `${label} - ${text(s.name) || "Rebar support"} (x${s.units_purchased} purchased${Number.isSafeInteger(s.pack_size) && s.pack_size > 1 ? `, packs of ${s.pack_size}` : ""})`,
    quantity: `${quantity(s.units_purchased)} ea (${quantity(s.units_required)} required)`,
    cost: s.material_cost,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    support: true,
    note: `${provenance}Bottom-resting support pick ${index + 1}${s.mat_id ? ` for mat ${s.mat_id}` : ""}; ${quantity(s.support_height_inches)} in stand height. Internal material cost only. ${review}`,
  }));
  rows.push({
    material: `${label} - support install labor`,
    quantity: `${quantity(supportLaborHours)} hr`,
    cost: supportLabor,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    support: true,
    note: `${provenance}Internal support installation labor, separate from support material. ${review}`,
  });
  return rows;
}
