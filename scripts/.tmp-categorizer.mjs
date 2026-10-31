// src/components/markup/projectCategorizer.jsx
var num = (v) => Number(v) || 0;
var _catCache = /* @__PURE__ */ new WeakMap();
var _catMemo = (p, compute) => {
  if (!p || typeof p !== "object") return compute(p);
  let byFn = _catCache.get(p);
  if (byFn && byFn.has(compute)) return byFn.get(compute);
  const out = compute(p);
  if (!byFn) {
    byFn = /* @__PURE__ */ new Map();
    _catCache.set(p, byFn);
  }
  byFn.set(compute, out);
  return out;
};
function _impl_categorizeChannelLetterProject(p) {
  if (!p) return [];
  const lines = [];
  (p.letter_purchases || []).forEach((lp) => {
    const isDimensional = lp.letter_type === "dimensional_letters";
    const total = num(lp.total_cost);
    if (total <= 0) return;
    if (isDimensional && lp.fab_config) {
      const matCost2 = num(lp.fab_config.material_cost) + num(lp.fab_config.paint_material_cost);
      const laborCost = num(lp.fab_config.cnc_labor_cost) + num(lp.fab_config.paint_labor_cost);
      if (matCost2 > 0) {
        lines.push({ module: "channel_letter", label: `Dimensional Letter Material \u2014 ${lp.description || ""}`, cost: matCost2, category_key: "substrates" });
      }
      if (laborCost > 0) {
        lines.push({ module: "channel_letter", label: `Dimensional Letter Fab Labor \u2014 ${lp.description || ""}`, cost: laborCost, category_key: "inhouse_labor" });
      }
      const remainder = total - matCost2 - laborCost;
      if (remainder > 0.01) {
        lines.push({ module: "channel_letter", label: `Dimensional Letter (other) \u2014 ${lp.description || ""}`, cost: remainder, category_key: "substrates" });
      }
    } else if (isDimensional) {
      lines.push({ module: "channel_letter", label: `Dimensional Letters \u2014 ${lp.description || ""}`, cost: total, category_key: "substrates" });
    } else {
      lines.push({ module: "channel_letter", label: `Letter Purchase \u2014 ${lp.description || lp.letter_type}`, cost: total, category_key: "outsourced_fab" });
    }
  });
  const onlyDimensional = (p.letter_purchases || []).length > 0 && (p.letter_purchases || []).every((lp) => lp.letter_type === "dimensional_letters");
  const letterFees = (onlyDimensional ? 0 : num(p.letters_delivery_fee)) + num(p.letters_design_fee) + num(p.letters_install_supplies_fee) + num(p.letters_permitting_fee) + num(p.letters_other_fee);
  if (letterFees > 0) {
    lines.push({ module: "channel_letter", label: "Letter Fees (delivery/design/permit/etc.)", cost: letterFees, category_key: "outsourced_fab" });
  }
  const baseLabor = p.labor_cost_in_subtotal !== void 0 ? num(p.labor_cost_in_subtotal) : num(p.labor_cost);
  const installLabor = baseLabor + num(p.total_personnel_cost);
  if (installLabor > 0) {
    lines.push({ module: "channel_letter", label: "Installation Labor", cost: installLabor, category_key: "inhouse_labor" });
  }
  const matCost = num(p.total_materials_cost) + num(p.total_supplies_cost);
  if (matCost > 0) {
    lines.push({ module: "channel_letter", label: "Install Materials & Supplies", cost: matCost, category_key: "outsourced_fab" });
  }
  const eqCost = num(p.total_equipment_cost);
  if (eqCost > 0) {
    lines.push({ module: "channel_letter", label: "Equipment Rental", cost: eqCost, category_key: "outsourced_services" });
  }
  const travelCost = num(p.total_travel_cost);
  if (travelCost > 0) {
    lines.push({ module: "channel_letter", label: "Travel & Fuel", cost: travelCost, category_key: "outsourced_services" });
  }
  return lines;
}
function _impl_categorizeFoundationProject(p) {
  if (!p) return [];
  const lines = [];
  const concrete = num(p.total_concrete_cost) + num(p.total_rebar_cost) + num(p.total_forming_materials_cost);
  if (concrete > 0) lines.push({ module: "foundation", label: "Concrete / Rebar / Forming Materials", cost: concrete, category_key: "outsourced_fab" });
  const fLabor = num(p.total_labor_cost) + num(p.total_excavation_cost);
  if (fLabor > 0) lines.push({ module: "foundation", label: "Foundation Labor", cost: fLabor, category_key: "inhouse_labor" });
  const poles = num(p.total_pole_cost) + num(p.total_pole_painting_cost);
  if (poles > 0) lines.push({ module: "foundation", label: "Poles & Pole Painting", cost: poles, category_key: "outsourced_fab" });
  const eq = num(p.total_equipment_cost);
  if (eq > 0) lines.push({ module: "foundation", label: "Foundation Equipment Rental", cost: eq, category_key: "outsourced_services" });
  const wallMaterial = (p.walls || []).reduce((sum, wall) => {
    const costs = wall?.calculatedCosts || {};
    return sum + num(costs.materialCost) + num(costs.mortarCost) + num(costs.internalMaterialCost) + num(costs.internalMortarCost);
  }, 0);
  const wallLabor = (p.walls || []).reduce((sum, wall) => {
    const costs = wall?.calculatedCosts || {};
    return sum + num(costs.laborCost) + num(costs.internalLaborCost);
  }, 0);
  if (wallMaterial > 0) lines.push({ module: "foundation", label: "Brick / Wall / Mortar Materials", cost: wallMaterial, category_key: "outsourced_fab" });
  if (wallLabor > 0) lines.push({ module: "foundation", label: "Masonry Labor", cost: wallLabor, category_key: "outsourced_services" });
  const wallCaps = num(p.total_wall_cap_cost);
  if (wallCaps > 0) lines.push({ module: "foundation", label: "Wall Cap Materials", cost: wallCaps, category_key: "outsourced_fab" });
  const cabinets = num(p.total_signage_cabinet_cost);
  if (cabinets > 0) lines.push({ module: "foundation", label: "Purchased Signage Cabinets", cost: cabinets, category_key: "outsourced_fab" });
  const landscape = num(p.total_landscape_cost);
  if (landscape > 0) lines.push({ module: "foundation", label: "Landscape / Site Materials", cost: landscape, category_key: "outsourced_fab" });
  return lines;
}
function _impl_categorizePaintProject(p) {
  if (!p) return [];
  const lines = [];
  const mats = num(p.total_paint_mask_cost) + num(p.total_liquid_paint_and_supplies_cost);
  if (mats > 0) lines.push({ module: "paint", label: "Paint Materials & Supplies", cost: mats, category_key: "outsourced_fab" });
  const labor = num(p.total_labor_cost);
  if (labor > 0) lines.push({ module: "paint", label: "Paint Labor", cost: labor, category_key: "inhouse_labor" });
  return lines;
}
function _impl_categorizeLaserProject(p) {
  if (!p) return [];
  const lines = [];
  const machine = num(p.total_machine_cost);
  if (machine > 0) lines.push({ module: "laser", label: "Laser Machine Time", cost: machine, category_key: "machine_time" });
  const labor = num(p.total_labor_cost);
  if (labor > 0) lines.push({ module: "laser", label: "Laser Labor", cost: labor, category_key: "inhouse_labor" });
  const supplies = num(p.total_supplies_cost);
  if (supplies > 0) lines.push({ module: "laser", label: "Laser Materials", cost: supplies, category_key: "substrates" });
  return lines;
}
function _impl_categorizeCNCProject(p) {
  if (!p) return [];
  const lines = [];
  const machine = num(p.total_machine_cost);
  if (machine > 0) lines.push({ module: "cnc", label: "CNC Machine Time", cost: machine, category_key: "machine_time" });
  const labor = num(p.total_labor_cost);
  if (labor > 0) lines.push({ module: "cnc", label: "CNC Labor", cost: labor, category_key: "inhouse_labor" });
  return lines;
}
function _impl_categorizeMetalProject(p) {
  if (!p) return [];
  const lines = [];
  const mat = num(p.total_material_cost) + num(p.total_supplies_cost);
  if (mat > 0) lines.push({ module: "metal", label: "Metal Fab Material", cost: mat, category_key: "substrates" });
  const labor = num(p.total_fabrication_cost) + num(p.total_welding_cost) + num(p.total_finishing_cost);
  if (labor > 0) lines.push({ module: "metal", label: "Metal Fab Labor", cost: labor, category_key: "inhouse_labor" });
  return lines;
}
function _impl_categorizeBrickStoneProject(p) {
  if (!p) return [];
  const lines = [];
  const materials = num(p.material_cost) + num(p.mortar_cost);
  if (materials > 0) lines.push({ module: "brick_stone", label: "Brick / Stone / Mortar Materials", cost: materials, category_key: "outsourced_fab" });
  const labor = num(p.labor_cost);
  if (labor > 0) lines.push({ module: "brick_stone", label: "Masonry Labor", cost: labor, category_key: "outsourced_services" });
  return lines;
}
function _impl_categorizeMaintenanceProject(p) {
  if (!p) return [];
  const lines = [];
  const labor = num(p.labor_cost) + num(p.total_personnel_cost);
  if (labor > 0) lines.push({ module: "maintenance", label: "Maintenance Labor", cost: labor, category_key: "inhouse_labor" });
  const materials = num(p.total_materials_cost) + num(p.total_supplies_cost);
  if (materials > 0) lines.push({ module: "maintenance", label: "Maintenance Materials & Supplies", cost: materials, category_key: "outsourced_fab" });
  const services = num(p.total_equipment_cost) + num(p.total_travel_cost);
  if (services > 0) lines.push({ module: "maintenance", label: "Equipment & Travel", cost: services, category_key: "outsourced_services" });
  return lines;
}
function _impl_categorizeVinylProject(p) {
  if (!p) return [];
  const lines = [];
  const materials = num(p.total_vinyl_cost) + num(p.total_laminate_cost) + num(p.total_ink_cost) + num(p.total_blade_cost) + num(p.total_supplies_cost);
  if (materials > 0) lines.push({ module: "vinyl", label: "Vinyl, Laminate, Tape, Ink & Supplies", cost: materials, category_key: "substrates" });
  const machine = num(p.total_machine_cost);
  if (machine > 0) lines.push({ module: "vinyl", label: "Printer / Cutter / Laminator Time", cost: machine, category_key: "machine_time" });
  const labor = num(p.labor_cost) + num(p.total_personnel_cost);
  if (labor > 0) lines.push({ module: "vinyl", label: "Production & Install Labor", cost: labor, category_key: "inhouse_labor" });
  const equip = num(p.total_equipment_cost);
  if (equip > 0) lines.push({ module: "vinyl", label: "Install Equipment", cost: equip, category_key: "outsourced_services" });
  const travel = num(p.total_travel_cost);
  if (travel > 0) lines.push({ module: "vinyl", label: "Travel", cost: travel, category_key: "outsourced_services" });
  return lines;
}
var categorizeChannelLetterProject = (p) => _catMemo(p, _impl_categorizeChannelLetterProject);
var categorizeFoundationProject = (p) => _catMemo(p, _impl_categorizeFoundationProject);
var categorizePaintProject = (p) => _catMemo(p, _impl_categorizePaintProject);
var categorizeLaserProject = (p) => _catMemo(p, _impl_categorizeLaserProject);
var categorizeCNCProject = (p) => _catMemo(p, _impl_categorizeCNCProject);
var categorizeMetalProject = (p) => _catMemo(p, _impl_categorizeMetalProject);
var categorizeBrickStoneProject = (p) => _catMemo(p, _impl_categorizeBrickStoneProject);
var categorizeMaintenanceProject = (p) => _catMemo(p, _impl_categorizeMaintenanceProject);
var categorizeVinylProject = (p) => _catMemo(p, _impl_categorizeVinylProject);
var MODULE_CATEGORIZERS = {
  channel_letter_installation: categorizeChannelLetterProject,
  foundation: categorizeFoundationProject,
  paint: categorizePaintProject,
  laser: categorizeLaserProject,
  cnc: categorizeCNCProject,
  metal_fabrication: categorizeMetalProject,
  vinyl_estimator: categorizeVinylProject,
  brick_stone: categorizeBrickStoneProject,
  maintenance: categorizeMaintenanceProject
};
export {
  MODULE_CATEGORIZERS,
  categorizeBrickStoneProject,
  categorizeCNCProject,
  categorizeChannelLetterProject,
  categorizeFoundationProject,
  categorizeLaserProject,
  categorizeMaintenanceProject,
  categorizeMetalProject,
  categorizePaintProject,
  categorizeVinylProject
};
