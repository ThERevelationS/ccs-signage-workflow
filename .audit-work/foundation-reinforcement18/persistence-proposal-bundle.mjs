// src/components/estimator/foundation/legacyFoundationCalc.js
var calcItemCost = (item, inventory = [], settings = {}) => {
  const getSetting = (key, def) => parseFloat(settings[key] || def);
  const selectedConcrete = inventory.find((c) => c.id === item.selected_concrete_id);
  const conc_cost = item.custom_concrete_cost_per_cy !== null && item.custom_concrete_cost_per_cy !== void 0 ? item.custom_concrete_cost_per_cy : selectedConcrete?.cost_per_unit || 0;
  const selectedRebar = inventory.find((r) => r.material_type === "rebar" && r.rebar_size === item.rebar_size);
  const pillarSelectedRebar = inventory.find((r) => r.material_type === "rebar" && r.rebar_size === (item.pillar_rebar_size || "#4"));
  const activeRebar = item.foundation_type === "spread_foot" ? selectedRebar : pillarSelectedRebar;
  const rebar_cost = item.custom_rebar_cost_per_ft !== null && item.custom_rebar_cost_per_ft !== void 0 ? item.custom_rebar_cost_per_ft : activeRebar?.cost_per_unit || 0;
  const main_labor_rate = getSetting("foundation_main_labor_rate", 60);
  const rebar_time_cross_section = getSetting("foundation_rebar_time_cross_section", 0.05);
  const rebar_time_linear_ft = getSetting("foundation_rebar_time_linear_ft", 0.02);
  const forming_cost_per_sqft = getSetting("foundation_forming_cost_per_sqft", 2.5);
  const pouring_cost_per_cy = getSetting("foundation_pouring_cost_per_cy", 15);
  const finishing_cost_per_sqft = getSetting("foundation_finishing_cost_per_sqft", 1.25);
  const forming_mult = item.foundation_type === "spread_foot" ? getSetting("foundation_forming_materials_spread_foot", 0.5) : getSetting("foundation_forming_materials_pillar", 0.75);
  let baseVolumeCY = 0;
  const lenIn = parseFloat(item.length_inches) || 0;
  const widIn = parseFloat(item.width_inches) || 0;
  const depIn = parseFloat(item.depth_inches) || 0;
  const diaIn = parseFloat(item.diameter) || 0;
  if (item.foundation_type === "spread_foot") {
    baseVolumeCY = lenIn / 12 * (widIn / 12) * (depIn / 12) / 27;
  } else {
    const r = diaIn / 2 / 12;
    baseVolumeCY = Math.PI * r * r * (depIn / 12) / 27;
  }
  baseVolumeCY = baseVolumeCY * (item.quantity || 1);
  const volumeCY = item.custom_concrete_qty !== null && item.custom_concrete_qty !== void 0 ? item.custom_concrete_qty : baseVolumeCY;
  let concreteCost = 0;
  let baseBags = null;
  let concreteBags = null;
  if (selectedConcrete?.material_type === "bagged_concrete") {
    baseBags = Math.ceil(baseVolumeCY * 45);
    concreteBags = item.custom_concrete_qty !== null && item.custom_concrete_qty !== void 0 ? item.custom_concrete_qty : baseBags;
    concreteCost = concreteBags * conc_cost;
  }
  let rebarCost = 0;
  let baseRebarFt = 0;
  let totalIntersections = 0;
  if (item.include_rebar && item.foundation_type === "spread_foot") {
    const nBarsL = Math.floor(widIn / (parseFloat(item.rebar_spacing_width) || 12)) + 1;
    const nBarsW = Math.floor(lenIn / (parseFloat(item.rebar_spacing_length) || 12)) + 1;
    const layers = parseInt(item.rebar_layers) || 1;
    const horizontalFt = (nBarsL * (lenIn / 12) + nBarsW * (widIn / 12)) * layers;
    const numIntersections = nBarsL * nBarsW * layers;
    const verticalLengthFt = Math.max(0, depIn - 6) / 12;
    const verticalFt = numIntersections * verticalLengthFt;
    baseRebarFt = (horizontalFt + verticalFt) * (parseInt(item.quantity) || 1);
    totalIntersections = numIntersections * (parseInt(item.quantity) || 1);
  } else if (item.include_rebar && item.foundation_type === "pillar") {
    const hoopDia = parseFloat(item.pillar_rebar_hoop_diameter) || Math.max(0, diaIn - 4);
    const safeHoopDia = Math.min(hoopDia, Math.max(0, diaIn - 4));
    const layers = parseInt(item.pillar_rebar_layers) || 1;
    const verticalCount = parseInt(item.pillar_vertical_rebar_count) || 4;
    const hoopLengthFt = Math.PI * safeHoopDia / 12;
    const totalHoopFt = hoopLengthFt * layers;
    const verticalLengthFt = Math.max(0, depIn - 6) / 12;
    const totalVerticalFt = verticalCount * verticalLengthFt;
    baseRebarFt = (totalHoopFt + totalVerticalFt) * (parseInt(item.quantity) || 1);
    totalIntersections = layers * verticalCount * (parseInt(item.quantity) || 1);
  }
  const rebarFt = item.custom_rebar_qty !== null && item.custom_rebar_qty !== void 0 ? item.custom_rebar_qty : baseRebarFt;
  if (item.include_rebar) {
    const materialCost = rebarFt * rebar_cost;
    const totalTimeHours = totalIntersections * rebar_time_cross_section + rebarFt * rebar_time_linear_ft;
    const laborCost = totalTimeHours * main_labor_rate;
    rebarCost = materialCost + laborCost;
  }
  let formingCost = 0;
  let baseFormingQty = 0;
  const selectedForming = inventory.find((i) => i.id === item.selected_forming_id);
  const forming_rate = item.custom_forming_rate !== null && item.custom_forming_rate !== void 0 ? item.custom_forming_rate : selectedForming?.cost_per_unit || 0;
  if (item.include_forming) {
    const perim = item.foundation_type === "spread_foot" ? 2 * (lenIn + widIn) / 12 : Math.PI * diaIn / 12;
    const formingAreaSqFt = perim * (depIn / 12);
    baseFormingQty = Math.ceil(perim / 16) * (parseInt(item.quantity) || 1);
    const formingQty = item.custom_forming_qty !== null && item.custom_forming_qty !== void 0 ? item.custom_forming_qty : baseFormingQty;
    const formingMaterialCost = formingQty * forming_rate;
    const laborCost = formingAreaSqFt * (parseInt(item.quantity) || 1) * forming_cost_per_sqft;
    formingCost = laborCost + formingMaterialCost + concreteCost * forming_mult;
  }
  let finishingCost = 0;
  let baseFinishingHours = 0;
  const finishing_rate = item.custom_finishing_rate !== null && item.custom_finishing_rate !== void 0 ? item.custom_finishing_rate : main_labor_rate;
  if (item.include_finishing) {
    const topArea = item.foundation_type === "spread_foot" ? lenIn * widIn / 144 : Math.PI * (diaIn / 2 / 12) ** 2;
    const defaultFinishingCost = topArea * (parseInt(item.quantity) || 1) * finishing_cost_per_sqft;
    baseFinishingHours = defaultFinishingCost / main_labor_rate;
    const finishingHours = item.custom_finishing_hours !== null && item.custom_finishing_hours !== void 0 ? item.custom_finishing_hours : baseFinishingHours;
    finishingCost = finishingHours * finishing_rate;
  }
  const pouringCost = volumeCY * pouring_cost_per_cy;
  let excavationCost = 0;
  let baseExcavationHours = 0;
  const excVol = volumeCY * 1.25;
  if (item.excavation_method === "hand_dig" || !item.excavation_method) {
    const timePerCy = getSetting("foundation_hand_dig_time_per_cy", 2);
    baseExcavationHours = excVol * timePerCy;
  } else {
    const timePerCy = getSetting("foundation_equipment_excavation_time_per_cy", 0.5);
    baseExcavationHours = excVol * timePerCy;
  }
  const excavationHours = item.custom_excavation_hours !== null && item.custom_excavation_hours !== void 0 ? item.custom_excavation_hours : baseExcavationHours;
  const excavation_rate = item.custom_excavation_rate !== null && item.custom_excavation_rate !== void 0 ? item.custom_excavation_rate : main_labor_rate;
  excavationCost = excavationHours * excavation_rate;
  return {
    concreteCost,
    concreteBags,
    volumeCY,
    baseVolumeCY,
    baseBags,
    rebarCost,
    rebarFt,
    baseRebarFt,
    formingCost,
    formingQty: item.custom_forming_qty !== null && item.custom_forming_qty !== void 0 ? item.custom_forming_qty : baseFormingQty,
    baseFormingQty,
    finishingCost,
    finishingHours: item.custom_finishing_hours !== null && item.custom_finishing_hours !== void 0 ? item.custom_finishing_hours : baseFinishingHours,
    baseFinishingHours,
    pouringCost,
    excavationCost,
    excavationHours,
    baseExcavationHours,
    concreteRate: conc_cost,
    rebarRate: rebar_cost,
    formingRate: forming_rate,
    finishingRate: finishing_rate,
    excavationRate: excavation_rate,
    selectedConcreteName: selectedConcrete?.material_name || "",
    selectedRebarName: activeRebar?.material_name || "",
    selectedFormingName: selectedForming?.material_name || "",
    total: concreteCost + rebarCost + formingCost + finishingCost + pouringCost + excavationCost
  };
};

// src/components/estimator/foundation/foundationCatalogIntegrity.js
function foundationItemCatalogIssues(item, inventory = [], index = 0) {
  const issues = [];
  const add = (field, id, label, code = "catalog_item_unavailable") => issues.push({
    kind: "foundation",
    index,
    componentId: item.component_id ?? null,
    field,
    inventoryId: id ?? null,
    code,
    message: `Foundation ${index + 1}: ${label} is unavailable.`
  });
  const selected = (id) => id !== void 0 && id !== null && id !== "";
  const check = (field, types, label) => {
    const id = item[field];
    if (!selected(id)) return;
    const row = inventory.find((record) => record.id === id);
    if (!row || !types.includes(row.material_type)) {
      add(field, id, label, row ? "catalog_item_type_mismatch" : "catalog_item_unavailable");
    }
  };
  check("selected_concrete_id", ["bagged_concrete", "concrete_service"], "selected concrete catalog material");
  if (item.include_forming) check("selected_forming_id", ["forming_material"], "selected forming catalog material");
  if (item.reinforcement_calculation_version != null && item.reinforcement_calculation_version !== 1) {
    if (item.reinforcement_calculation_version === 2 && item.include_rebar && item.reinforcement_material?.kind === "catalog") {
      const id = item.reinforcement_material.inventory_id;
      const matches = selected(id) ? inventory.filter((row) => row.id === id) : [];
      if (matches.length !== 1 || matches[0].material_type !== "rebar") {
        add(
          "reinforcement_material.inventory_id",
          id,
          "selected reinforcement catalog material",
          !selected(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable"
        );
      }
    }
    return issues;
  }
  const manualRebar = hasFoundationCostSnapshot(item.custom_rebar_cost_per_ft) && item.custom_rebar_cost_per_ft >= 0;
  if (item.include_rebar && !manualRebar) {
    const field = item.foundation_type === "spread_foot" ? "rebar_size" : "pillar_rebar_size";
    const size = field === "rebar_size" ? item.rebar_size : item.pillar_rebar_size || "#4";
    if (!inventory.some((row) => row.material_type === "rebar" && row.rebar_size === size)) {
      add(field, null, `rebar catalog size ${size || "(not selected)"}`, size ? "catalog_item_unavailable" : "catalog_item_unassigned");
    }
  }
  return issues;
}
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// src/components/estimator/foundation/foundationGeometryInputs.js
var foundationInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var foundationPositiveWholeNumber = (value) => {
  const number = foundationInputNumber(value);
  const whole2 = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole2 && Number.isSafeInteger(number) && number > 0;
};
function foundationGeometryValidation(item, index = 0) {
  const record = item ?? {};
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "foundation",
    index,
    componentId: record.component_id ?? null,
    field,
    code,
    message: `Foundation ${index + 1}: ${message}`
  });
  const type = record.foundation_type;
  if (type !== "spread_foot" && type !== "pillar") {
    add("foundation_type", "foundation_type_invalid", "select Spread Footing or Pillar / Caisson.");
  }
  const count = record.quantity ?? 1;
  const quantity = foundationInputNumber(count);
  if (!foundationPositiveWholeNumber(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot" ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]] : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = foundationInputNumber(record[field]);
    dimensions[field] = value;
    if (value === null || value <= 0) {
      add(field, "foundation_dimension_invalid", `${label} (inches) must be a finite positive number.`);
    }
  }
  if (!issues.length) {
    const depth = dimensions.depth_inches / 12;
    const radius = dimensions.diameter / 24;
    const volume = type === "spread_foot" ? dimensions.length_inches / 12 * (dimensions.width_inches / 12) * depth / 27 * quantity : Math.PI * radius * radius * depth / 27 * quantity;
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
  return { issues, type, quantity, dimensions };
}
function foundationItemGeometryIssues(item, index = 0) {
  return foundationGeometryValidation(item, index).issues;
}

// src/components/estimator/foundation/foundationReinforcementModel.js
var MAX_GEOMETRY = 4096;
var less = (a, b) => a < b - 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
var emptyQuantities = () => ({
  horizontal_count: 0,
  horizontal_length_inches: 0,
  longitudinal_count: 0,
  longitudinal_length_inches: 0,
  hoop_count: 0,
  hoop_length_inches: 0,
  inter_mat_tie_count: 0,
  inter_mat_tie_length_inches: 0,
  mat_crossings: 0,
  hoop_bar_crossings: 0,
  tie_ends: 0
});
function modelContext(item, design, geometryLimit) {
  const issues = [], groups = [], geometry = [], ids = /* @__PURE__ */ new Set();
  const counts = emptyQuantities();
  let missing = false;
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const required = (field, message) => {
    missing = true;
    issue(field, "reinforcement_input_required", message);
  };
  const number = (value, field, { zero = false, integer = false } = {}) => {
    if (value === void 0 || value === null) {
      required(field, "An explicit value is required.");
      return null;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || (zero ? value < 0 : value <= 0) || integer && !Number.isSafeInteger(value)) {
      issue(field, "reinforcement_number_invalid", `Use a finite ${zero ? "nonnegative" : "positive"}${integer ? " whole" : ""} number.`);
      return null;
    }
    return value;
  };
  const list = (value, field, limit, allowEmpty = true) => {
    if (value === void 0 || value === null) {
      required(field, "An explicit list is required.");
      return [];
    }
    if (!Array.isArray(value) || value.length > limit || !allowEmpty && !value.length) {
      issue(field, "reinforcement_list_invalid", `Use ${allowEmpty ? "up to" : "one to"} ${limit} records.`);
      return [];
    }
    return value;
  };
  const identity = (value, field) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value) || ids.has(value)) {
      issue(field, "reinforcement_id_invalid", "Use a unique stable identifier (letters, numbers, hyphen or underscore).");
      return null;
    }
    ids.add(value);
    return value;
  };
  const bounds = (value, min, max, field) => {
    if (value !== null && (less(value, min) || less(max, value))) {
      issue(field, "reinforcement_clearance_invalid", "The authored geometry does not fit the concrete and explicit clearances.");
      return false;
    }
    return value !== null;
  };
  const group = (id, role, count, length, makeGeometry) => {
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(length) || length <= 0) {
      issue(id, "reinforcement_numeric_range_invalid", "The steel quantity is outside the supported numeric range.");
      return;
    }
    if (!count) return;
    groups.push({ id, role, count, cut_length_inches: length, diameter_inches: design.bar_diameter_inches });
    counts[`${role}_count`] += count;
    counts[`${role}_length_inches`] += count * length;
    const generated = Math.min(count, geometryLimit - geometry.length);
    for (let i = 0; i < generated; i++) geometry.push({ id: `${id}/${i}`, groupId: id, role, ...makeGeometry(i) });
  };
  return {
    item,
    design,
    issues,
    groups,
    geometry,
    counts,
    issue,
    required,
    number,
    list,
    identity,
    bounds,
    group,
    get missing() {
      return missing;
    }
  };
}
function spreadSteel(c, dimensions, covers, diameter) {
  const { design, number, list, identity, bounds, issue, group, counts } = c;
  const { length, width, depth } = dimensions;
  const radius = diameter / 2, edge = covers.side + radius;
  const xSpan = length - 2 * edge, zSpan = width - 2 * edge;
  if (less(xSpan, 0) || less(zSpan, 0)) {
    issue("cover_inches.side", "reinforcement_clearance_invalid", "Side cover and bar diameter leave no room for the mat.");
    return;
  }
  const mats = /* @__PURE__ */ new Map();
  const rawMats = list(design.spread?.mats, "spread.mats", 256, false);
  rawMats.forEach((mat, index) => {
    const field = `spread.mats.${index}`;
    const id = identity(mat?.id, `${field}.id`);
    const bearing = number(mat?.bearing_elevation_inches, `${field}.bearing_elevation_inches`, { zero: true });
    const sx = number(mat?.max_spacing_x_inches, `${field}.max_spacing_x_inches`);
    const sz = number(mat?.max_spacing_z_inches, `${field}.max_spacing_z_inches`);
    if ([id, bearing, sx, sz].some((v) => v === null)) return;
    if (!bounds(bearing, covers.bottom, depth - covers.top - 2 * diameter, field)) return;
    const nx = xSpan <= 0 ? 1 : Math.ceil(xSpan / sx) + 1;
    const nz = zSpan <= 0 ? 1 : Math.ceil(zSpan / sz) + 1;
    const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
    group(`${id}/x`, "horizontal", nz, length - 2 * covers.side, (i) => ({
      kind: "segment",
      matId: id,
      diameter_inches: diameter,
      from: { x: covers.side, y: bearing + radius, z: at(nz, i, zSpan) },
      to: { x: length - covers.side, y: bearing + radius, z: at(nz, i, zSpan) }
    }));
    group(`${id}/z`, "horizontal", nx, width - 2 * covers.side, (i) => ({
      kind: "segment",
      matId: id,
      diameter_inches: diameter,
      from: { x: at(nx, i, xSpan), y: bearing + 3 * radius, z: covers.side },
      to: { x: at(nx, i, xSpan), y: bearing + 3 * radius, z: width - covers.side }
    }));
    counts.mat_crossings += nx * nz;
    mats.set(id, { id, bearing, field });
  });
  const sorted = [...mats.values()].sort((a, b) => a.bearing - b.bearing);
  sorted.forEach((mat, index) => {
    if (index && less(mat.bearing - sorted[index - 1].bearing, 2 * diameter)) {
      issue(mat.field, "reinforcement_mat_overlap", "Mat tier envelopes overlap.");
    }
  });
  list(design.spread?.inter_mat_ties, "spread.inter_mat_ties", 2048).forEach((tie, index) => {
    const field = `spread.inter_mat_ties.${index}`;
    const id = identity(tie?.id, `${field}.id`);
    const from = mats.get(tie?.from_mat_id), to = mats.get(tie?.to_mat_id);
    const x = number(tie?.x_inches, `${field}.x_inches`, { zero: true });
    const z = number(tie?.z_inches, `${field}.z_inches`, { zero: true });
    const length2 = number(tie?.cut_length_inches, `${field}.cut_length_inches`);
    if (!from || !to || from.id === to.id) {
      issue(field, "reinforcement_tie_parent_invalid", "Tie endpoints require two distinct existing mats.");
      return;
    }
    if ([id, x, z, length2].some((v) => v === null)) return;
    if (!bounds(x, edge, dimensions.length - edge, `${field}.x_inches`) || !bounds(z, edge, width - edge, `${field}.z_inches`)) return;
    const distance = Math.abs(to.bearing - from.bearing);
    if (less(length2, distance)) {
      issue(`${field}.cut_length_inches`, "reinforcement_tie_length_invalid", "Cut length is shorter than the mat-to-mat path.");
      return;
    }
    group(id, "inter_mat_tie", 1, length2, () => ({
      kind: "tie_reference",
      diameter_inches: diameter,
      from: { x, y: from.bearing + radius, z },
      to: { x, y: to.bearing + radius, z }
    }));
    counts.tie_ends += 2;
  });
  if (counts.inter_mat_tie_count) issue(
    "spread.inter_mat_ties",
    "reinforcement_tie_path_only",
    "Tie paths are references; authored cut lengths include any hook/bend allowance and require engineering/fabrication review.",
    "warning"
  );
}
function supportsState(c) {
  const config = c.design.supports;
  const mode = config?.mode ?? "unconfigured";
  if (mode === "off") {
    if (typeof config.reason !== "string" || !config.reason.trim()) {
      c.required("supports.reason", "Explain how the steel is supported when support items are off.");
      return { status: "unconfigured", count: null };
    }
    c.issue("supports", "reinforcement_supports_off_explained", "Support items are off with an explicit explanation; this is not an engineering approval.", "warning");
    return { status: "off_explained", count: 0, reason: config.reason.trim() };
  }
  if (!["unconfigured", "manual", "auto"].includes(mode)) {
    c.issue("supports.mode", "reinforcement_support_mode_invalid", "Choose a supported support-selection mode.");
  } else c.issue("supports", "reinforcement_supports_unconfigured", "Supports have not been modeled or priced; no zero quantity or build-ready status is inferred.", "warning");
  return { status: "unconfigured", count: null };
}
function pillarSteel(c, dimensions, covers, diameter) {
  const { design, number, list, identity, bounds, issue, group, counts } = c;
  const radius = diameter / 2, center = dimensions.diameter / 2;
  const outer = center - covers.side;
  const longitudinal = design.pillar?.longitudinal;
  const n = number(longitudinal?.count, "pillar.longitudinal.count", { zero: true, integer: true });
  let long = null;
  if (n > 0) {
    const r = number(longitudinal.radius_inches, "pillar.longitudinal.radius_inches", { zero: true });
    const bottom = number(longitudinal.bottom_end_inches, "pillar.longitudinal.bottom_end_inches", { zero: true });
    const top = number(longitudinal.top_end_inches, "pillar.longitudinal.top_end_inches", { zero: true });
    if (![r, bottom, top].some((v) => v === null)) {
      bounds(r, 0, outer - radius, "pillar.longitudinal.radius_inches");
      bounds(bottom, covers.bottom, dimensions.depth - covers.top, "pillar.longitudinal.bottom_end_inches");
      bounds(top, covers.bottom, dimensions.depth - covers.top, "pillar.longitudinal.top_end_inches");
      if (top <= bottom) issue("pillar.longitudinal", "reinforcement_length_invalid", "Longitudinal bar ends require a positive cut length.");
      if (n > 1 && less(2 * r * Math.sin(Math.PI / n), diameter)) {
        issue("pillar.longitudinal", "reinforcement_bar_overlap", "Longitudinal bars overlap on the authored radius.");
      }
      group("pillar/longitudinal", "longitudinal", n, top - bottom, (i) => {
        const angle = i * 2 * Math.PI / n;
        const x = center + r * Math.cos(angle), z = center + r * Math.sin(angle);
        return { kind: "segment", diameter_inches: diameter, from: { x, y: bottom, z }, to: { x, y: top, z } };
      });
      long = { r, bottom, top };
    }
  }
  const hoops = [];
  list(design.pillar?.hoops, "pillar.hoops", 256).forEach((hoop, index) => {
    const field = `pillar.hoops.${index}`;
    const id = identity(hoop?.id, `${field}.id`);
    const y = number(hoop?.center_y_inches, `${field}.center_y_inches`, { zero: true });
    const d = number(hoop?.centerline_diameter_inches, `${field}.centerline_diameter_inches`);
    const allowance = number(hoop?.cut_allowance_inches, `${field}.cut_allowance_inches`, { zero: true });
    if ([id, y, d, allowance].some((v) => v === null)) return;
    const r = d / 2;
    if (less(d, diameter)) issue(
      `${field}.centerline_diameter_inches`,
      "reinforcement_hoop_self_overlap",
      "Hoop centerline diameter is smaller than the bar diameter."
    );
    bounds(y, covers.bottom + radius, dimensions.depth - covers.top - radius, `${field}.center_y_inches`);
    bounds(r, 0, outer - radius, `${field}.centerline_diameter_inches`);
    for (const other of hoops) {
      if (less(Math.hypot(other.y - y, other.r - r), diameter)) {
        issue(field, "reinforcement_hoop_overlap", "Hoop envelopes overlap.");
      }
    }
    hoops.push({ y, r });
    group(id, "hoop", 1, Math.PI * d + allowance, () => ({
      kind: "hoop",
      center: { x: center, y, z: center },
      centerline_radius_inches: r,
      diameter_inches: diameter,
      cut_allowance_inches: allowance
    }));
    if (long) {
      const radial = Math.abs(r - long.r);
      const outsideY = Math.max(long.bottom - y, y - long.top, 0);
      if (less(Math.hypot(radial, outsideY), diameter)) {
        issue(field, "reinforcement_bar_overlap", "Hoop and longitudinal bar envelopes overlap.");
      } else if (!outsideY && !less(diameter, radial)) counts.hoop_bar_crossings += n;
      else issue(field, "reinforcement_connection_unverified", "Hoop-to-longitudinal connections are not established by this geometry.", "warning");
    }
  });
  if (hoops.length) issue(
    "pillar.hoops",
    "reinforcement_hoop_allowance_authored",
    "Hoop cut allowance is authored explicitly; hooks, laps and structural adequacy require review.",
    "warning"
  );
}
function quantityTotals(counts, quantity) {
  const totals = {};
  for (const [key, value] of Object.entries(counts)) {
    const length = key.endsWith("_length_inches");
    totals[length ? key.replace("_length_inches", "_feet") : key] = (length ? value / 12 : value) * quantity;
  }
  totals.total_steel_feet = ["horizontal", "longitudinal", "hoop", "inter_mat_tie"].reduce((sum, role) => sum + totals[`${role}_feet`], 0);
  return totals;
}
function calculateFoundationReinforcementModel(item = {}, design, options = {}) {
  item = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const geometryLimit = options?.geometryLimit ?? MAX_GEOMETRY;
  const base = {
    version: 2,
    componentId: item.component_id ?? null,
    instanceCount: null,
    engineeringApproved: false,
    status: "invalid",
    issues: [],
    perInstance: null,
    totals: null,
    groups: [],
    geometry: [],
    omittedGeometryCount: 0,
    supports: { status: "unconfigured", count: null }
  };
  const foundationIssues = foundationItemGeometryIssues({ ...item, include_rebar: false });
  if (foundationIssues.length) return {
    ...base,
    issues: foundationIssues.map(({ field, code, message }) => ({ field, code, message, severity: "error" }))
  };
  const quantity = Number(item.quantity ?? 1);
  base.instanceCount = quantity;
  if (!item.include_rebar) return {
    ...base,
    status: "off",
    perInstance: emptyQuantities(),
    totals: quantityTotals(emptyQuantities(), quantity),
    supports: { status: "not_required", count: 0 }
  };
  const c = modelContext(item, design ?? {}, geometryLimit);
  if (!Number.isSafeInteger(geometryLimit) || geometryLimit < 0 || geometryLimit > MAX_GEOMETRY) {
    c.issue("geometryLimit", "reinforcement_geometry_budget_invalid", `Geometry budget must be a whole number from zero to ${MAX_GEOMETRY}.`);
  }
  if (design?.version !== 2) {
    if (design?.version === void 0 || design?.version === null) c.required("version", "An explicit version-2 reinforcement design is required.");
    else c.issue("version", "reinforcement_version_invalid", "This model accepts only version 2.");
  }
  const diameter = c.number(design?.bar_diameter_inches, "bar_diameter_inches");
  const covers = Object.fromEntries(["side", "top", "bottom"].map((key) => [
    key,
    c.number(design?.cover_inches?.[key], `cover_inches.${key}`, { zero: true })
  ]));
  if (!c.issues.some((i) => i.severity === "error")) {
    const dimensions = {
      length: Number(item.length_inches),
      width: Number(item.width_inches),
      depth: Number(item.depth_inches),
      diameter: Number(item.diameter)
    };
    if (item.foundation_type === "spread_foot") spreadSteel(c, dimensions, covers, diameter);
    else pillarSteel(c, dimensions, covers, diameter);
  }
  const supports = supportsState(c);
  const totals = quantityTotals(c.counts, quantity);
  const count = ["horizontal", "longitudinal", "hoop", "inter_mat_tie"].reduce((sum, role) => sum + c.counts[`${role}_count`], 0);
  if (!c.issues.some((i) => i.severity === "error") && !count) {
    c.issue("design", "reinforcement_empty_design", "Enabled reinforcement requires steel geometry; otherwise turn rebar off explicitly.");
  }
  const safeCounts = Object.entries(c.counts).filter(([key]) => !key.endsWith("_length_inches"));
  const safeTotals = Object.entries(totals).filter(([key]) => !key.endsWith("_feet"));
  if (!Number.isSafeInteger(count) || [...safeCounts, ...safeTotals].some(([, v]) => !Number.isSafeInteger(v)) || Object.values(totals).some((v) => !Number.isFinite(v))) {
    c.issue("quantities", "reinforcement_numeric_range_invalid", "Scaled reinforcement quantities exceed the supported numeric range.");
  }
  if (c.issues.some((i) => i.severity === "error")) return {
    ...base,
    status: c.missing ? "incomplete" : "invalid",
    issues: c.issues
  };
  const omitted = count - c.geometry.length;
  if (omitted) c.issue(
    "geometry",
    "reinforcement_geometry_truncated",
    `${omitted} steel primitives are omitted from this per-instance preview; complete quantities remain reported.`,
    "warning"
  );
  return {
    ...base,
    status: "valid",
    issues: c.issues,
    perInstance: c.counts,
    totals,
    groups: c.groups,
    geometry: c.geometry,
    omittedGeometryCount: omitted,
    supports
  };
}

// src/components/estimator/foundation/foundationInputValidation.js
function foundationItemInputIssues(item, index = 0) {
  const record = item ?? {};
  const { issues, type, dimensions } = foundationGeometryValidation(record, index);
  const add = (field, code, message) => issues.push({
    kind: "foundation",
    index,
    componentId: record.component_id ?? null,
    field,
    code,
    message: `Foundation ${index + 1}: ${message}`
  });
  const version2 = record.reinforcement_calculation_version;
  if (version2 != null && version2 !== 1 && version2 !== 2) {
    add(
      "reinforcement_calculation_version",
      "foundation_reinforcement_version_unsupported",
      "the active reinforcement calculation version is unsupported. Reload before changing prices."
    );
    return issues;
  }
  if (version2 === 2) {
    if (record.include_rebar != null && typeof record.include_rebar !== "boolean") {
      add("include_rebar", "foundation_reinforcement_enabled_invalid", "reinforcement must be explicitly enabled or disabled.");
      return issues;
    }
    if (!issues.length) {
      const model = calculateFoundationReinforcementModel(record, record.reinforcement_design, { geometryLimit: 0 });
      for (const issue of model.issues.filter((value) => value.severity === "error")) {
        add(`reinforcement_design.${issue.field}`, issue.code, issue.message);
      }
    }
    return issues;
  }
  if (record.include_rebar) {
    const optional = (field, code, label, valid) => {
      const value = record[field];
      if (value !== void 0 && value !== null && !valid(value)) add(field, code, label);
    };
    const positive2 = (value) => {
      const number = foundationInputNumber(value);
      return number !== null && number > 0;
    };
    const whole2 = (field, label) => optional(
      field,
      "foundation_rebar_count_invalid",
      `${label} must be a positive whole number within the supported range.`,
      foundationPositiveWholeNumber
    );
    if (type === "spread_foot") {
      for (const [field, label] of [["rebar_spacing_length", "length"], ["rebar_spacing_width", "width"]]) {
        optional(
          field,
          "foundation_rebar_spacing_invalid",
          `rebar spacing ${label} (inches) must be a finite positive number.`,
          positive2
        );
      }
      whole2("rebar_layers", "Rebar mat count");
    } else if (type === "pillar") {
      whole2("pillar_rebar_layers", "Hoop count");
      whole2("pillar_vertical_rebar_count", "Longitudinal bar count");
      optional(
        "pillar_rebar_hoop_diameter",
        "foundation_rebar_diameter_invalid",
        "hoop diameter (inches) must be finite, positive and no greater than the foundation diameter.",
        (value) => positive2(value) && (dimensions.diameter === null || dimensions.diameter <= 0 || foundationInputNumber(value) <= dimensions.diameter)
      );
    }
  }
  return issues;
}

// src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);
var finiteRate = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive = (value) => finiteRate(value) && value > 0;
var isRecord = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var numeric = (value) => {
  const parsed = foundationInputNumber(value);
  if (parsed !== null) return parsed;
  return value === null || ["undefined", "number", "string", "boolean"].includes(typeof value) ? value : NaN;
};
var text = (value) => typeof value === "string" ? value.trim() : "";
function resolveFoundationReinforcementBasis({
  material,
  inventory = [],
  settings = {},
  quantityOverride = null,
  rateOverride = null
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const reference = isRecord(material) ? material : {};
  let row = null, source = null, name = "", reason = "", inventoryId = null;
  if (reference.kind === "manual") {
    source = reference;
    name = text(reference.name) || "Manual rebar";
    reason = text(reference.reason);
    if (!reason || reason.length > 1e3) issue(
      "material.reason",
      "reinforcement_manual_basis_reason_required",
      "Explain the manual material/rate basis in 1 to 1000 characters; this is not an engineering approval."
    );
  } else if (reference.kind === "catalog") {
    const id = reference.inventory_id;
    if (typeof id !== "string" || !id || id.trim() !== id || id.length > 128) {
      issue("material.inventory_id", "reinforcement_material_id_required", "Select a stable rebar inventory ID.");
    } else if (!Array.isArray(inventory)) {
      issue("inventory", "reinforcement_inventory_unavailable", "The rebar catalog could not be read; do not assume the material was deleted.");
    } else {
      const matches = inventory.filter((candidate) => candidate?.id === id);
      row = matches.length === 1 ? matches[0] : null;
      if (matches.length > 1) issue("material.inventory_id", "reinforcement_material_id_ambiguous", "Multiple current records have the selected ID; refresh the catalog before pricing.");
      else if (!row) issue("material.inventory_id", "reinforcement_material_unavailable", "The selected rebar catalog record is unavailable.");
      else if (row.material_type !== "rebar") {
        issue("material.inventory_id", "reinforcement_material_type_invalid", "The selected catalog record is not rebar.");
        row = null;
      }
      if (row) {
        inventoryId = id;
        name = text(row.material_name) || "Catalog rebar";
        source = {
          unit: row.unit,
          cost_per_ft: row.cost_per_unit,
          bar_diameter_inches: row.rebar_diameter_inches,
          weight_lb_per_ft: row.rebar_weight_lb_per_ft
        };
      }
    }
  } else issue("material.kind", "reinforcement_material_source_required", "Choose an explicit manual basis or a stable catalog record.");
  const rawUnit = source?.unit;
  const unit = typeof rawUnit === "string" && FOOT_UNITS.includes(rawUnit.trim().toLowerCase()) ? "ft" : void 0;
  if (!unit) issue(
    "material.unit",
    "reinforcement_material_unit_unsupported",
    "Rebar needs a known per-foot pricing unit; each/stick/weight units are not silently converted."
  );
  const diameter = numeric(source?.bar_diameter_inches);
  if (!positive(diameter)) issue(
    "material.bar_diameter_inches",
    "reinforcement_material_diameter_required",
    "Enter a known positive nominal bar diameter; a #size label alone is not diameter metadata."
  );
  const weight = source?.weight_lb_per_ft == null ? null : numeric(source.weight_lb_per_ft);
  if (weight === null) issue(
    "material.weight_lb_per_ft",
    "reinforcement_material_weight_unknown",
    "Material weight per foot is unknown, not zero.",
    "warning"
  );
  else if (!positive(weight)) issue(
    "material.weight_lb_per_ft",
    "reinforcement_material_weight_invalid",
    "Known material weight per foot must be finite and positive."
  );
  const override = rateOverride !== null && rateOverride !== void 0;
  const rate = numeric(override ? rateOverride : source?.cost_per_ft);
  if (!finiteRate(rate)) issue(
    override ? "custom_rebar_cost_per_ft" : "material.cost_per_ft",
    "reinforcement_material_rate_invalid",
    "Use an explicit finite nonnegative per-foot rate; zero is allowed."
  );
  if (reference.kind === "catalog" && !override && rate === 0) {
    issue(
      "material.cost_per_ft",
      "reinforcement_zero_catalog_rate_unconfirmed",
      "A zero catalog price may be unpriced, not free. Use an explicit per-foot override to confirm a zero rate."
    );
  }
  const quantity = quantityOverride == null ? null : numeric(quantityOverride);
  if (quantity !== null && !finiteRate(quantity)) issue(
    "custom_rebar_qty",
    "reinforcement_quantity_override_invalid",
    "Use a finite nonnegative aggregate item quantity; zero is allowed."
  );
  const settingsValid = isRecord(settings);
  if (!settingsValid) issue("settings", "reinforcement_settings_unavailable", "Labor settings are unavailable; do not infer defaults from a failed read.");
  const rateSources = [];
  const setting = (key, fallback) => {
    const missing = settingsValid && (!Object.prototype.hasOwnProperty.call(settings, key) || settings[key] === void 0);
    const value = !settingsValid ? void 0 : missing ? fallback : numeric(settings[key]);
    if (!finiteRate(value)) issue(
      `settings.${key}`,
      "reinforcement_labor_rate_invalid",
      `${key} must be a finite nonnegative number; an explicit malformed value does not use its default.`
    );
    rateSources.push({ key, source: missing ? "legacy_default" : "settings", value });
    return value;
  };
  const basis = {
    unit,
    bar_diameter_inches: diameter,
    weight_lb_per_ft: weight,
    cost_per_ft: rate,
    quantity_override_ft: quantity,
    labor_rate_per_hour: setting("foundation_main_labor_rate", 60),
    labor_hours_per_ft: setting("foundation_rebar_time_linear_ft", 0.02),
    labor_hours_per_connection: setting("foundation_rebar_time_cross_section", 0.05)
  };
  return {
    basis,
    issues,
    rateSources,
    materialSnapshot: {
      kind: reference.kind === "manual" ? "manual" : reference.kind === "catalog" ? "catalog" : null,
      inventory_id: inventoryId,
      inventory_updated_date: typeof row?.updated_date === "string" ? row.updated_date : null,
      name: name || "Unresolved rebar",
      reason: reference.kind === "manual" ? reason : null,
      pricing_unit: unit ?? null,
      original_unit: typeof rawUnit === "string" ? rawUnit : null,
      bar_diameter_inches: diameter,
      weight_lb_per_ft: weight,
      cost_per_ft: rate,
      rate_source: override ? "custom_rebar_cost_per_ft" : reference.kind === "catalog" ? "catalog" : "manual"
    }
  };
}

// src/components/estimator/foundation/foundationReinforcementCost.js
var close = (a, b) => Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
var nonnegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var whole = (value) => nonnegative(value) && Number.isSafeInteger(value);
var STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
function priceFoundationReinforcementModel(model, basis = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const unavailable = () => ({
    steelPriceAvailable: false,
    canApplyToEstimate: false,
    amounts: null,
    engineeringApproved: false,
    issues
  });
  if (model?.version !== 2 || !["valid", "off"].includes(model.status) || !model.totals || !Array.isArray(model.groups) || !whole(model.instanceCount) || !model.instanceCount || !Array.isArray(model.issues) || model.issues.some((i) => i?.severity !== "warning")) {
    issue("model", "reinforcement_model_unavailable", "Calculate a valid current version-2 model before pricing.");
    return unavailable();
  }
  const connections = ["mat_crossings", "hoop_bar_crossings", "tie_ends"];
  if (!connections.every((key) => whole(model.totals[key])) || !nonnegative(model.totals.total_steel_feet)) {
    issue("model.totals", "reinforcement_model_quantities_invalid", "Complete finite steel quantities and connection counts are required.");
    return unavailable();
  }
  const modelConnections = connections.reduce((sum, key) => sum + model.totals[key], 0);
  if (!Number.isSafeInteger(modelConnections)) {
    issue("model.totals", "reinforcement_connection_range_invalid", "Connection count is outside the supported numeric range.");
    return unavailable();
  }
  const feet = model.totals.total_steel_feet;
  if (model.status === "off") {
    if (feet || modelConnections || model.groups.length) {
      issue("model", "reinforcement_off_model_invalid", "A disabled steel model cannot contain priced steel.");
      return unavailable();
    }
    return {
      steelPriceAvailable: true,
      canApplyToEstimate: true,
      engineeringApproved: false,
      issues,
      amounts: {
        geometry_feet: 0,
        priced_feet: 0,
        connection_count: 0,
        material_cost: 0,
        labor_hours: 0,
        labor_cost: 0,
        steel_cost: 0,
        priced_weight_lbs: 0,
        geometry_weight_lbs: 0
      }
    };
  }
  basis = basis && typeof basis === "object" ? basis : {};
  if (basis.unit !== "ft") issue("unit", "reinforcement_cost_unit_invalid", "An explicit per-foot material pricing basis is required.");
  for (const key of ["cost_per_ft", "labor_rate_per_hour", "labor_hours_per_ft", "labor_hours_per_connection"]) {
    if (!nonnegative(basis[key])) issue(key, "reinforcement_cost_input_invalid", "Use an explicit finite nonnegative rate; zero is allowed.");
  }
  if (!nonnegative(basis.bar_diameter_inches) || !basis.bar_diameter_inches) {
    issue("bar_diameter_inches", "reinforcement_material_diameter_required", "The priced material needs a known positive nominal diameter.");
  }
  let scheduledFeet = 0;
  if (!model.groups.length || !feet) issue("model.groups", "reinforcement_cost_schedule_missing", "Enabled steel requires a nonempty cut-quantity schedule.");
  for (const group of model.groups) {
    if (!STEEL_ROLES.includes(group?.role) || !whole(group?.count) || !group.count || !nonnegative(group.cut_length_inches) || !group.cut_length_inches || !nonnegative(group.diameter_inches) || !group.diameter_inches) {
      issue("model.groups", "reinforcement_cost_schedule_invalid", "Each cut group needs finite positive quantity, length and diameter.");
      continue;
    }
    scheduledFeet += group.count * group.cut_length_inches / 12 * model.instanceCount;
    if (!close(group.diameter_inches, basis.bar_diameter_inches)) {
      issue("bar_diameter_inches", "reinforcement_material_diameter_mismatch", "The priced bar diameter does not match the geometry.");
    }
  }
  if (!Number.isFinite(scheduledFeet) || !close(scheduledFeet, feet)) {
    issue("model.groups", "reinforcement_cost_schedule_mismatch", "Current model totals and cut schedule do not reconcile.");
  }
  const override = basis.quantity_override_ft;
  if (override !== null && override !== void 0 && !nonnegative(override)) {
    issue("quantity_override_ft", "reinforcement_quantity_override_invalid", "An explicit aggregate quantity override must be finite and nonnegative.");
  }
  const weight = basis.weight_lb_per_ft;
  if (weight !== null && weight !== void 0 && (!nonnegative(weight) || !weight)) {
    issue("weight_lb_per_ft", "reinforcement_material_weight_invalid", "Known material weight per foot must be finite and positive.");
  }
  if (issues.some((i) => i.severity === "error")) return unavailable();
  const multiply = (a, b, field) => {
    const value = a * b;
    if (!Number.isFinite(value) || a > 0 && b > 0 && value === 0) {
      issue(field, "reinforcement_cost_numeric_range_invalid", "A positive cost/weight calculation overflowed or underflowed.");
    }
    return value;
  };
  const pricedFeet = override ?? feet;
  const material = multiply(pricedFeet, basis.cost_per_ft, "material_cost");
  const hours = multiply(pricedFeet, basis.labor_hours_per_ft, "linear_labor_hours") + multiply(modelConnections, basis.labor_hours_per_connection, "connection_labor_hours");
  const labor = multiply(hours, basis.labor_rate_per_hour, "labor_cost");
  const amounts = {
    geometry_feet: feet,
    priced_feet: pricedFeet,
    connection_count: modelConnections,
    material_cost: material,
    labor_hours: hours,
    labor_cost: labor,
    steel_cost: material + labor,
    priced_weight_lbs: weight == null ? null : multiply(pricedFeet, weight, "priced_weight_lbs"),
    geometry_weight_lbs: weight == null ? null : multiply(feet, weight, "geometry_weight_lbs")
  };
  if (issues.some((i) => i.severity === "error")) return unavailable();
  if (Object.values(amounts).some((value) => value !== null && !Number.isFinite(value))) {
    issue("amounts", "reinforcement_cost_numeric_range_invalid", "Steel cost or weight exceeds the supported numeric range.");
    return unavailable();
  }
  if (override != null && !close(pricedFeet, feet)) issue(
    "quantity_override_ft",
    "reinforcement_priced_quantity_differs",
    "The explicit aggregate priced quantity differs from geometric steel; it was not scaled again by foundation quantity.",
    "warning"
  );
  if (weight == null) issue("weight_lb_per_ft", "reinforcement_weight_unknown", "Steel weight is unknown, not zero; BOM/handoff compatibility still requires resolution.", "warning");
  const supportsReady = model.supports?.status === "off_explained" && model.supports.count === 0 && typeof model.supports.reason === "string" && Boolean(model.supports.reason.trim());
  if (!supportsReady) issue("supports", "reinforcement_support_cost_unknown", "Support quantities/costs are unresolved; steel-only pricing cannot replace the estimate.", "warning");
  const connectionUnverified = model.issues?.some((i) => ["reinforcement_connection_unverified", "reinforcement_tie_path_only"].includes(i.code));
  if (connectionUnverified) issue(
    "connections",
    "reinforcement_connection_cost_unverified",
    "Connection/fabrication assumptions need review before this steel-only amount can replace current pricing.",
    "warning"
  );
  return {
    steelPriceAvailable: true,
    canApplyToEstimate: supportsReady && weight != null && !connectionUnverified,
    engineeringApproved: false,
    amounts,
    issues
  };
}

// src/components/estimator/foundation/foundationReinforcementProjection.js
function calculateFoundationReinforcementProjection({
  item,
  design,
  material,
  inventory = [],
  settings = {},
  quantityOverride = null,
  rateOverride = null,
  geometryLimit = 0
} = {}) {
  const record = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const model = calculateFoundationReinforcementModel(record, design, { geometryLimit });
  const resolution = model.status === "off" ? null : resolveFoundationReinforcementBasis({
    material,
    inventory,
    settings,
    quantityOverride,
    rateOverride
  });
  const steel = priceFoundationReinforcementModel(model, resolution?.basis);
  const issues = [
    ...model.issues.map((issue) => ({ ...issue, scope: "geometry" })),
    ...(resolution?.issues || []).map((issue) => ({ ...issue, scope: "basis" })),
    ...steel.issues.map((issue) => ({ ...issue, scope: "pricing" }))
  ];
  return {
    calculationVersion: 2,
    projectionVersion: 1,
    engineeringApproved: false,
    model,
    steel,
    issues,
    basis: resolution?.basis ?? null,
    materialSnapshot: resolution?.materialSnapshot ?? null,
    rateSources: resolution?.rateSources ?? [],
    canApplyToEstimate: steel.canApplyToEstimate && !issues.some((issue) => issue.severity === "error")
  };
}

// src/components/estimator/foundation/foundationReinforcementItemProjection.js
var isRecord2 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finiteNonnegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var COMMON_OVERRIDES = [
  "custom_concrete_qty",
  "custom_concrete_cost_per_cy",
  "custom_forming_qty",
  "custom_forming_rate",
  "custom_finishing_hours",
  "custom_finishing_rate",
  "custom_excavation_hours",
  "custom_excavation_rate"
];
function calculateFoundationReinforcementItemProjection({
  item,
  design,
  material,
  inventory = [],
  settings = {},
  excavationMethod,
  quantityOverride = null,
  rateOverride = null
} = {}) {
  const reinforcement = calculateFoundationReinforcementProjection({
    item,
    design,
    material,
    inventory,
    settings,
    quantityOverride,
    rateOverride
  });
  const issues = [...reinforcement.issues];
  const issue = (field, code, message) => issues.push({ field, code, message, scope: "common_cost", severity: "error" });
  const unavailable = () => ({
    calculationVersion: 2,
    engineeringApproved: false,
    reinforcement,
    commonCost: null,
    itemCost: null,
    issues,
    priceAvailable: false,
    canApplyToEstimate: false
  });
  if (!["valid", "off"].includes(reinforcement.model.status)) return unavailable();
  if (!isRecord2(item)) {
    issue("item", "reinforcement_common_item_invalid", "A current foundation record is required.");
    return unavailable();
  }
  if (!Array.isArray(inventory) || inventory.some((row) => !isRecord2(row))) {
    issue("inventory", "reinforcement_common_inventory_unavailable", "Current concrete and forming catalog records could not be verified.");
    return unavailable();
  }
  if (!isRecord2(settings)) {
    issue("settings", "reinforcement_common_settings_unavailable", "Current common-cost settings could not be verified.");
    return unavailable();
  }
  const commonItem = { ...item, include_rebar: false, excavation_method: item.excavation_method || excavationMethod };
  const bagged = inventory.some((row) => row.id === item.selected_concrete_id && row.material_type === "bagged_concrete");
  const commonSettings = { ...settings };
  const activeSettings = [
    "foundation_main_labor_rate",
    "foundation_pouring_cost_per_cy",
    commonItem.excavation_method === "hand_dig" || !commonItem.excavation_method ? "foundation_hand_dig_time_per_cy" : "foundation_equipment_excavation_time_per_cy",
    ...item.include_finishing ? ["foundation_finishing_cost_per_sqft"] : [],
    ...item.include_forming ? [
      "foundation_forming_cost_per_sqft",
      item.foundation_type === "spread_foot" ? "foundation_forming_materials_spread_foot" : "foundation_forming_materials_pillar"
    ] : []
  ];
  for (const key of activeSettings) {
    if (!Object.hasOwn(settings, key) || settings[key] === void 0) continue;
    const value = foundationInputNumber(settings[key]);
    if (value === null || value < 0) issue(
      `settings.${key}`,
      "reinforcement_common_setting_invalid",
      "An explicit active common-cost setting must be a finite nonnegative decimal; malformed values do not infer defaults."
    );
    else commonSettings[key] = value === 0 ? "0" : value;
  }
  for (const field of COMMON_OVERRIDES) {
    if (field.startsWith("custom_forming_") && !item.include_forming) continue;
    if (field.startsWith("custom_finishing_") && !item.include_finishing) continue;
    if (field === "custom_concrete_cost_per_cy" && !bagged) continue;
    if (item[field] == null) continue;
    const value = foundationInputNumber(item[field]);
    if (value === null || value < 0) issue(
      field,
      "reinforcement_common_override_invalid",
      "An active common-cost override must be a finite nonnegative decimal; clear it explicitly to use the current basis."
    );
    else commonItem[field] = value;
  }
  const catalogIssues = foundationItemCatalogIssues(commonItem, inventory);
  issues.push(...catalogIssues.map((value) => ({ ...value, severity: "error", scope: "common_cost" })));
  for (const field of ["selected_concrete_id", ...item.include_forming ? ["selected_forming_id"] : []]) {
    if (item[field] == null || item[field] === "") continue;
    if (inventory.filter((row) => row.id === item[field]).length > 1) issue(
      field,
      "reinforcement_common_catalog_ambiguous",
      "The selected common-cost catalog ID is duplicated; refresh the catalog before previewing a replacement price."
    );
  }
  if (issues.some((value) => value.scope === "common_cost" && value.severity === "error")) return unavailable();
  const common = calcItemCost(commonItem, inventory, commonSettings);
  const commonCost = {
    concrete: common.concreteCost,
    forming: common.formingCost,
    pouring: common.pouringCost,
    finishing: common.finishingCost,
    excavation: common.excavationCost,
    total: common.total
  };
  const commonValues = [
    ...Object.values(commonCost),
    common.volumeCY,
    common.baseVolumeCY,
    common.excavationHours,
    common.excavationRate,
    ...bagged ? [common.concreteRate] : [],
    ...item.include_forming ? [common.formingRate, common.formingQty] : [],
    ...item.include_finishing ? [common.finishingRate, common.finishingHours] : [],
    ...common.concreteBags === null ? [] : [common.concreteBags]
  ];
  if (common.rebarCost !== 0 || !commonValues.every(finiteNonnegative)) {
    issue(
      "common_cost",
      "reinforcement_common_result_invalid",
      "Common quantities, rates, hours or amounts are invalid. No replacement total is available; current saved pricing is unchanged."
    );
    return unavailable();
  }
  const steel = reinforcement.steel.amounts;
  if (!reinforcement.steel.steelPriceAvailable || !steel) return unavailable();
  const total = commonCost.total + steel.steel_cost, excavationVolume = common.volumeCY * 1.25;
  if (![total, excavationVolume].every(finiteNonnegative)) {
    issue("item_total_cost", "reinforcement_item_result_invalid", "The proposed item cost or excavation volume exceeds the supported numeric range.");
    return unavailable();
  }
  return {
    calculationVersion: 2,
    engineeringApproved: false,
    reinforcement,
    commonCost,
    issues,
    priceAvailable: true,
    canApplyToEstimate: reinforcement.canApplyToEstimate,
    itemCost: {
      quantity: reinforcement.model.instanceCount,
      concrete_volume_cy: common.volumeCY,
      excavation_volume_cy: excavationVolume,
      concrete_bags: common.concreteBags,
      concrete_cost: common.concreteCost,
      concrete_rate: finiteNonnegative(common.concreteRate) ? common.concreteRate : null,
      rebar_feet: steel.priced_feet,
      rebar_weight_lbs: steel.priced_weight_lbs,
      rebar_cost: steel.steel_cost,
      rebar_rate: reinforcement.basis?.cost_per_ft ?? 0,
      rebar_material_cost: steel.material_cost,
      rebar_labor_cost: steel.labor_cost,
      rebar_labor_hours: steel.labor_hours,
      rebar_geometry_feet: steel.geometry_feet,
      rebar_geometry_weight_lbs: steel.geometry_weight_lbs,
      rebar_connection_count: steel.connection_count,
      excavation_cost: common.excavationCost,
      excavation_hours: common.excavationHours,
      forming_cost: common.formingCost,
      forming_qty: item.include_forming ? common.formingQty : 0,
      pouring_cost: common.pouringCost,
      finishing_cost: common.finishingCost,
      finishing_hours: item.include_finishing ? common.finishingHours : 0,
      item_total_cost: total
    }
  };
}

// src/components/estimator/foundation/foundationCalc.js
var num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
var REBAR_LB_PER_FT = { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502, "#7": 2.044, "#8": 2.67 };
var ITEM_SNAPSHOT_FIELDS = [
  "concrete_volume_cy",
  "excavation_volume_cy",
  "concrete_bags",
  "rebar_feet",
  "rebar_weight_lbs",
  "concrete_cost",
  "concrete_rate",
  "rebar_cost",
  "rebar_rate",
  "excavation_cost",
  "excavation_hours",
  "forming_cost",
  "forming_qty",
  "pouring_cost",
  "finishing_cost",
  "finishing_hours",
  "item_total_cost"
];
var REINFORCEMENT_SNAPSHOT_FIELDS = [
  "rebar_material_cost",
  "rebar_labor_cost",
  "rebar_labor_hours",
  "rebar_geometry_feet",
  "rebar_geometry_weight_lbs",
  "rebar_connection_count"
];
function calculateVersionedItem(item, project, inventory, settings, savedItem) {
  const version2 = item.reinforcement_calculation_version;
  if (version2 == null || version2 === 1) return null;
  const inputIssues = foundationItemInputIssues(item);
  const catalogIssues = foundationItemCatalogIssues(item, inventory);
  const projection = inputIssues.length || catalogIssues.length ? null : calculateFoundationReinforcementItemProjection({
    item,
    design: item.reinforcement_design,
    material: item.reinforcement_material,
    inventory,
    settings,
    excavationMethod: project?.excavation_method,
    quantityOverride: item.custom_rebar_qty ?? null,
    rateOverride: item.custom_rebar_cost_per_ft ?? null
  });
  if (projection?.canApplyToEstimate && projection.itemCost) {
    const reinforcement = projection.reinforcement;
    return {
      cost: {
        ...projection.itemCost,
        reinforcement_cost_snapshot: item.include_rebar ? {
          version: 1,
          calculation_version: 2,
          engineering_approved: false,
          amounts: structuredClone(reinforcement.steel.amounts),
          material: structuredClone(reinforcement.materialSnapshot),
          basis: structuredClone(reinforcement.basis),
          rate_sources: structuredClone(reinforcement.rateSources)
        } : void 0
      },
      issues: []
    };
  }
  const blockers = projection?.issues.filter((issue) => issue.severity === "error") || [];
  if (projection && !blockers.length) blockers.push({
    field: "reinforcement_design",
    code: "foundation_reinforcement_not_ready",
    message: "Reinforcement support, weight, connection or pricing prerequisites remain unresolved; saved amounts are shown and saving is paused."
  });
  return {
    cost: {
      quantity: item.quantity,
      ...Object.fromEntries([...ITEM_SNAPSHOT_FIELDS, ...REINFORCEMENT_SNAPSHOT_FIELDS].map((key) => [
        key,
        hasFoundationCostSnapshot(savedItem?.[key]) ? savedItem[key] : void 0
      ])),
      reinforcement_cost_snapshot: savedItem?.reinforcement_cost_snapshot == null ? void 0 : structuredClone(savedItem.reinforcement_cost_snapshot)
    },
    issues: blockers
  };
}
function calcItem(item, project, inventory, settings = {}, savedItem = item) {
  const versioned = calculateVersionedItem(item, project, inventory, settings, savedItem);
  if (versioned) return versioned.cost;
  const inputIssues = foundationItemInputIssues(item);
  if (inputIssues.length || foundationItemCatalogIssues(item, inventory).length) {
    return {
      quantity: inputIssues.length ? item.quantity : Math.max(1, num(item.quantity, 1)),
      ...Object.fromEntries(ITEM_SNAPSHOT_FIELDS.map((key) => [
        key,
        hasFoundationCostSnapshot(savedItem?.[key]) ? savedItem[key] : void 0
      ]))
    };
  }
  const legacy = calcItemCost(
    { ...item, excavation_method: item.excavation_method || project?.excavation_method },
    inventory,
    settings
  );
  const isPillar = item.foundation_type === "pillar";
  const rebarSize = (isPillar ? item.pillar_rebar_size : item.rebar_size) || "#4";
  return {
    quantity: Math.max(1, num(item.quantity, 1)),
    concrete_volume_cy: legacy.volumeCY,
    excavation_volume_cy: legacy.volumeCY * 1.25,
    concrete_bags: legacy.concreteBags,
    rebar_feet: legacy.rebarFt,
    rebar_weight_lbs: legacy.rebarFt * (REBAR_LB_PER_FT[rebarSize] || 0.668),
    concrete_cost: legacy.concreteCost,
    concrete_rate: legacy.concreteRate,
    rebar_cost: legacy.rebarCost,
    rebar_rate: legacy.rebarRate,
    excavation_cost: legacy.excavationCost,
    excavation_hours: legacy.excavationHours,
    forming_cost: legacy.formingCost,
    forming_qty: legacy.formingQty,
    pouring_cost: legacy.pouringCost,
    finishing_cost: legacy.finishingCost,
    finishing_hours: legacy.finishingHours,
    item_total_cost: legacy.total
  };
}

// src/components/estimator/foundation/foundationReinforcementDraft.js
var isRecord3 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var scalar = (value) => value === null || ["undefined", "string", "number", "boolean"].includes(typeof value) ? value : NaN;
var numeric2 = (value) => {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = foundationInputNumber(value);
  return parsed !== null ? parsed : scalar(value);
};
function prepareFoundationReinforcementDraft(draft) {
  const issues = [];
  const issue = (field, message) => issues.push({ field, code: "reinforcement_draft_invalid", severity: "error", message });
  if (!isRecord3(draft) || draft.schema_version !== 1) {
    issue("schema_version", "A supported version-1 reinforcement proposal is required.");
    return { prepared: null, issues };
  }
  const raw = draft.design;
  if (!isRecord3(raw)) {
    issue("design", "The proposal needs a reinforcement design object.");
    return { prepared: null, issues };
  }
  const numbers = (record, fields) => Object.fromEntries(fields.map((field) => [field, numeric2(record?.[field])]));
  const reference = (value) => typeof value === "string" ? value : scalar(value);
  const list = (value, field, maximum, map) => {
    if (value == null) return value;
    if (!Array.isArray(value) || value.length > maximum) {
      issue(field, `Use an explicit list of at most ${maximum} records.`);
      return null;
    }
    return value.map((record, index) => {
      if (!isRecord3(record)) {
        issue(`${field}.${index}`, "Each proposal row must be an object.");
        return null;
      }
      return map(record);
    });
  };
  const design = {
    version: scalar(raw.version),
    bar_diameter_inches: numeric2(raw.bar_diameter_inches),
    cover_inches: numbers(raw.cover_inches, ["side", "top", "bottom"]),
    supports: { mode: scalar(raw.supports?.mode), reason: scalar(raw.supports?.reason) },
    spread: {
      mats: list(raw.spread?.mats, "design.spread.mats", 256, (record) => ({
        id: reference(record.id),
        ...numbers(record, ["bearing_elevation_inches", "max_spacing_x_inches", "max_spacing_z_inches"])
      })),
      inter_mat_ties: list(raw.spread?.inter_mat_ties, "design.spread.inter_mat_ties", 4096, (record) => ({
        id: reference(record.id),
        from_mat_id: reference(record.from_mat_id),
        to_mat_id: reference(record.to_mat_id),
        ...numbers(record, ["x_inches", "z_inches", "cut_length_inches"])
      }))
    },
    pillar: {
      hoops: list(raw.pillar?.hoops, "design.pillar.hoops", 256, (record) => ({
        id: reference(record.id),
        ...numbers(record, ["center_y_inches", "centerline_diameter_inches", "cut_allowance_inches"])
      })),
      longitudinal: numbers(raw.pillar?.longitudinal, ["count", "radius_inches", "bottom_end_inches", "top_end_inches"])
    }
  };
  const source = isRecord3(draft.material) ? draft.material : {};
  const material = {
    kind: scalar(source.kind),
    inventory_id: reference(source.inventory_id),
    name: scalar(source.name),
    reason: scalar(source.reason),
    unit: scalar(source.unit),
    ...numbers(source, ["bar_diameter_inches", "weight_lb_per_ft", "cost_per_ft"])
  };
  const overrides = isRecord3(draft.overrides) ? draft.overrides : {};
  if (draft.overrides != null && !isRecord3(draft.overrides)) issue("overrides", "Proposal overrides must be an object.");
  return {
    prepared: {
      schema_version: 1,
      design,
      material,
      overrides: { quantity_ft: numeric2(overrides.quantity_ft ?? null), cost_per_ft: numeric2(overrides.cost_per_ft ?? null) }
    },
    issues
  };
}

// src/components/estimator/foundation/foundationReinforcementBasisKey.js
var MAX_DEPTH = 32;
var MAX_NODES = 1e6;
var MAX_CHARACTERS = 16e6;
function encodeFoundationReinforcementBasis(value) {
  const chunks = [], ancestors = /* @__PURE__ */ new Set();
  let nodes = 0, characters = 0;
  const append = (text2) => {
    characters += text2.length;
    if (characters > MAX_CHARACTERS) throw new RangeError("Reinforcement preview basis is too large.");
    chunks.push(text2);
  };
  const visit = (current, depth) => {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) throw new RangeError("Reinforcement preview basis exceeds the supported traversal limit.");
    if (current === null) {
      append("null;");
      return;
    }
    switch (typeof current) {
      case "undefined":
        append("undefined;");
        return;
      case "boolean":
        append(current ? "boolean:true;" : "boolean:false;");
        return;
      case "string":
        append(`string:${JSON.stringify(current)};`);
        return;
      case "number":
        if (!Number.isFinite(current)) throw new TypeError("Reinforcement preview basis contains a nonfinite number.");
        append(`number:${Object.is(current, -0) ? "-0" : current};`);
        return;
      case "object":
        break;
      default:
        throw new TypeError("Reinforcement preview basis contains an unsupported value.");
    }
    if (ancestors.has(current)) throw new TypeError("Reinforcement preview basis contains a cycle.");
    if (Object.getOwnPropertySymbols(current).length) throw new TypeError("Reinforcement preview basis cannot contain symbol keys.");
    const array = Array.isArray(current);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) {
      throw new TypeError("Reinforcement preview basis requires plain objects and arrays.");
    }
    const keys = Object.getOwnPropertyNames(current);
    const child = (key) => {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
        throw new TypeError("Reinforcement preview basis cannot contain hidden properties or accessors.");
      }
      visit(descriptor.value, depth + 1);
    };
    ancestors.add(current);
    if (array) {
      if (keys.length !== current.length + 1 || !keys.includes("length")) {
        throw new TypeError("Reinforcement preview basis requires dense arrays without extra properties.");
      }
      append(`array:${current.length}[`);
      for (let index = 0; index < current.length; index++) child(String(index));
      append("];");
    } else {
      keys.sort();
      append(`object:${keys.length}{`);
      for (const key of keys) {
        append(`${JSON.stringify(key)}:`);
        child(key);
      }
      append("};");
    }
    ancestors.delete(current);
  };
  visit(value, 0);
  return chunks.join("");
}

// src/components/estimator/foundation/foundationReinforcementProposal.js
var isRecord4 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var identifier = (value) => typeof value === "string" && Boolean(value.trim()) && value.trim() === value && value.length <= 256;
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var amount = (item, key) => finite(item?.[key]) ? item[key] : null;
var version = (item) => item.reinforcement_calculation_version == null ? 1 : item.reinforcement_calculation_version;
var DERIVED_ITEM_FIELDS = /* @__PURE__ */ new Set([
  "concrete_volume_cy",
  "excavation_volume_cy",
  "concrete_bags",
  "rebar_feet",
  "rebar_weight_lbs",
  "concrete_cost",
  "concrete_rate",
  "rebar_cost",
  "rebar_rate",
  "excavation_cost",
  "excavation_hours",
  "forming_cost",
  "forming_qty",
  "pouring_cost",
  "finishing_cost",
  "finishing_hours",
  "item_total_cost",
  "rebar_material_cost",
  "rebar_labor_cost",
  "rebar_labor_hours",
  "rebar_geometry_feet",
  "rebar_geometry_weight_lbs",
  "rebar_connection_count",
  "reinforcement_cost_snapshot",
  "reinforcement_proposal"
]);
var DERIVED_PROJECT_FIELDS = /* @__PURE__ */ new Set([
  "grand_total",
  "total_concrete_cost",
  "total_rebar_cost",
  "total_excavation_cost",
  "total_labor_cost",
  "total_equipment_cost",
  "total_forming_materials_cost",
  "total_pole_cost",
  "total_pole_painting_cost",
  "total_brick_cost",
  "total_fill_cost",
  "total_wall_cost",
  "total_wall_cap_cost",
  "total_signage_cabinet_cost",
  "total_landscape_cost",
  "concrete_delivery_snapshot",
  "builder_calculation"
]);
var rawProject = (project) => Object.fromEntries(Object.entries(project).filter(([key]) => !DERIVED_PROJECT_FIELDS.has(key)).map(([key, value]) => [key, key === "items" ? value.map((item) => Object.fromEntries(Object.entries(item).filter(([field]) => !DERIVED_ITEM_FIELDS.has(field)))) : value]));
var compare = (before, proposed) => {
  const delta = before === null || proposed === null ? null : proposed - before;
  return { before, proposed, delta: finite(delta) ? delta : null };
};
function createFoundationReinforcementProposal({
  project,
  savedProject,
  inventory = [],
  settings = {},
  context,
  componentId,
  rawDraft,
  proposalId,
  acknowledgments = {}
} = {}) {
  const issues = [];
  const issue = (code, message) => issues.push({ code, message, severity: "error", scope: "proposal" });
  const unavailable = () => ({
    version: 1,
    id: proposalId,
    componentId,
    basisKey: null,
    canAccept: false,
    engineeringApproved: false,
    issues,
    projection: null,
    comparisons: null
  });
  if (!isRecord4(project) || !Array.isArray(project.items) || project.items.some((item2) => !isRecord4(item2)) || !isRecord4(savedProject) || !Array.isArray(savedProject.items) || savedProject.items.some((item2) => !isRecord4(item2))) {
    issue("reinforcement_proposal_source_required", "Current raw design and acknowledged saved source are required.");
    return unavailable();
  }
  if (!isRecord4(context) || context.loaded !== true || !identifier(context.ownerId) || !identifier(context.sourceId) || context.sourceId !== project.id || savedProject.id !== project.id || !identifier(context.sourceUpdatedAt) || savedProject.updated_date !== context.sourceUpdatedAt || !Number.isSafeInteger(context.generation) || context.generation < 0 || !Number.isSafeInteger(context.editRevision) || context.editRevision < 0 || !(context.estimateId === null || identifier(context.estimateId)) || context.estimateId !== null && !identifier(context.estimateUpdatedAt)) {
    issue("reinforcement_proposal_context_unavailable", "Reload or resolve the current owner, source acknowledgment and linked estimate revision before previewing.");
    return unavailable();
  }
  if (!identifier(componentId) || !identifier(proposalId)) {
    issue("reinforcement_proposal_identity_required", "Stable component and opaque proposal identities are required.");
    return unavailable();
  }
  const matches = project.items.filter((item2) => item2.component_id === componentId);
  if (matches.length !== 1) {
    issue("reinforcement_proposal_component_ambiguous", "The target component is missing or has a duplicate ID.");
    return unavailable();
  }
  const item = matches[0], savedMatches = savedProject.items.filter((record) => record.component_id === componentId);
  const savedItem = savedMatches.length === 1 ? savedMatches[0] : null;
  if (![1, 2].includes(version(item))) {
    issue("reinforcement_proposal_version_unsupported", "An unsupported active calculation version cannot be silently replaced.");
    return unavailable();
  }
  const preparation = prepareFoundationReinforcementDraft(rawDraft);
  issues.push(...preparation.issues);
  if (!preparation.prepared || preparation.issues.some((value) => value.severity === "error")) return unavailable();
  const prepared = preparation.prepared;
  const calculate = (source, design, material, quantityOverride, rateOverride) => calculateFoundationReinforcementItemProjection({
    item: source,
    design,
    material,
    inventory,
    settings,
    excavationMethod: project.excavation_method,
    quantityOverride,
    rateOverride
  });
  const projection = calculate(item, prepared.design, prepared.material, prepared.overrides.quantity_ft, prepared.overrides.cost_per_ft);
  issues.push(...projection.issues);
  let current, currentProvenance;
  if (version(item) === 2) {
    const active = calculate(item, item.reinforcement_design, item.reinforcement_material, item.custom_rebar_qty, item.custom_rebar_cost_per_ft);
    current = active.canApplyToEstimate ? active.itemCost : null;
    currentProvenance = current ? "Current version-2 calculation" : "Acknowledged saved amount";
    current ??= savedItem;
  } else {
    const blocked = !isRecord4(settings) || !Array.isArray(inventory) || inventory.some((row) => !isRecord4(row)) || foundationItemInputIssues(item).length || foundationItemCatalogIssues(item, inventory).length;
    current = blocked ? savedItem : calcItem(item, project, inventory, settings, savedItem);
    currentProvenance = blocked ? "Acknowledged saved amount" : "Current legacy calculation";
  }
  const comparisons = {
    steel: compare(amount(current, "rebar_cost"), amount(projection.itemCost, "rebar_cost")),
    item: compare(amount(current, "item_total_cost"), amount(projection.itemCost, "item_total_cost")),
    savedSteel: amount(savedItem, "rebar_cost"),
    savedItem: amount(savedItem, "item_total_cost"),
    currentProvenance,
    savedProvenance: "Acknowledged saved source; not a customer selling price"
  };
  if (comparisons.steel.delta === null || comparisons.item.delta === null) {
    issue("reinforcement_proposal_delta_unavailable", "Both current steel and full item cost deltas must be known before replacement.");
  }
  const warningCodes = [...new Set(projection.issues.filter((value) => value.severity === "warning").map((value) => value.code))].sort();
  const warningAcknowledgments = Array.isArray(acknowledgments?.warningCodes) ? acknowledgments.warningCodes : [];
  if (acknowledgments?.preliminary !== true || warningCodes.some((code) => !warningAcknowledgments.includes(code))) {
    issue("reinforcement_proposal_acknowledgment_required", "Explicitly acknowledge the preliminary-only status and every current warning before acceptance.");
  }
  let basisKey;
  try {
    basisKey = encodeFoundationReinforcementBasis({
      protocolRevision: 1,
      calculationRevision: "foundation-v2-proposal-1",
      context,
      componentId,
      project: rawProject(project),
      savedProject,
      inventory,
      settings,
      rawDraft,
      prepared,
      acknowledgments,
      proposedItemCost: projection.itemCost,
      comparisons
    });
  } catch (error) {
    issue("reinforcement_proposal_basis_unavailable", error.message);
    basisKey = null;
  }
  return {
    version: 1,
    id: proposalId,
    componentId,
    basisKey,
    prepared,
    projection,
    comparisons,
    warningCodes,
    issues,
    engineeringApproved: false,
    canAccept: Boolean(basisKey && projection.canApplyToEstimate && !issues.some((value) => value.severity === "error"))
  };
}
function acceptFoundationReinforcementProposal({ proposal, requestedId, activeProposalId, acceptedAt, ...currentInputs } = {}) {
  const reject = (code, message) => ({ ok: false, code, message, project: null });
  if (proposal?.version !== 1 || proposal.canAccept !== true || !identifier(requestedId) || requestedId !== activeProposalId || requestedId !== proposal.id || !identifier(proposal.componentId) || typeof proposal.basisKey !== "string" || !proposal.basisKey) {
    return reject("reinforcement_proposal_not_acceptable", "Use the exact currently eligible proposal; no design or price was changed.");
  }
  if (typeof acceptedAt !== "string" || !Number.isFinite(Date.parse(acceptedAt))) {
    return reject("reinforcement_acceptance_time_required", "An explicit acceptance timestamp is required.");
  }
  const fresh = createFoundationReinforcementProposal({ ...currentInputs, componentId: proposal.componentId, proposalId: requestedId });
  if (!fresh.basisKey || fresh.basisKey !== proposal.basisKey) {
    return reject("reinforcement_proposal_stale", "Inputs, context, source, settings or catalog changed. Refresh and review the full delta again.");
  }
  if (!fresh.canAccept) return reject("reinforcement_proposal_not_ready", "The fresh calculation is not eligible for replacement.");
  const { prepared, projection } = fresh;
  const nextItems = currentInputs.project.items.map((item) => {
    if (item.component_id !== proposal.componentId) return item;
    const next = {
      ...item,
      ...projection.itemCost,
      reinforcement_calculation_version: 2,
      reinforcement_design: structuredClone(prepared.design),
      reinforcement_material: structuredClone(prepared.material),
      custom_rebar_qty: prepared.overrides.quantity_ft,
      custom_rebar_cost_per_ft: prepared.overrides.cost_per_ft,
      reinforcement_cost_snapshot: {
        version: 1,
        calculation_version: 2,
        engineering_approved: false,
        amounts: structuredClone(projection.reinforcement.steel.amounts),
        material: structuredClone(projection.reinforcement.materialSnapshot),
        basis: structuredClone(projection.reinforcement.basis),
        rate_sources: structuredClone(projection.reinforcement.rateSources)
      },
      reinforcement_acceptance: {
        version: 1,
        proposal_id: requestedId,
        accepted_at: acceptedAt,
        owner_id: currentInputs.context.ownerId,
        source_id: currentInputs.context.sourceId,
        component_id: proposal.componentId,
        source_updated_at: currentInputs.context.sourceUpdatedAt,
        acknowledged_warning_codes: [...fresh.warningCodes],
        engineering_approved: false
      }
    };
    delete next.reinforcement_proposal;
    return next;
  });
  return { ok: true, code: "reinforcement_proposal_accepted_locally", project: { ...currentInputs.project, items: nextItems }, proposal: fresh };
}
export {
  acceptFoundationReinforcementProposal,
  createFoundationReinforcementProposal
};
