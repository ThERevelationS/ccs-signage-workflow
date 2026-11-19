// .audit-work/foundation-phaseb3/candidate-tree-src/components/masterInventory/inventoryNormalization.js
var STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string" || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number2 = Number(value);
  return Number.isFinite(number2) ? number2 : null;
};
var inventoryNonnegativeNumber = (value) => {
  const number2 = strictNumber(value);
  return number2 !== null && number2 >= 0 ? number2 : null;
};
var inventorySettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/legacyFoundationCalc.js
var calcItemCost = (item, inventory = [], settings = {}) => {
  const getSetting = (key, def) => parseFloat(inventorySettingValue(settings[key], def));
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationCatalogIntegrity.js
var INACTIVE_STATUS_VALUES = /* @__PURE__ */ new Set([
  "inactive",
  "disabled",
  "archived",
  "discontinued",
  "retired",
  "deactivated"
]);
var DELETED_STATUS_VALUES = /* @__PURE__ */ new Set(["deleted", "removed", "purged"]);
function foundationCatalogRowAvailability(row) {
  if (!row || typeof row !== "object") return "deleted";
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (row.deleted === true || row.is_deleted === true || row.deleted_at != null || DELETED_STATUS_VALUES.has(status)) return "deleted";
  if (row.is_active === false || row.active === false || row.archived === true || row.is_archived === true || row.disabled === true || row.show_in_foundation === false || INACTIVE_STATUS_VALUES.has(status)) return "inactive";
  return "active";
}
function foundationCatalogPriceClass(value) {
  const number2 = inventoryNonnegativeNumber(value);
  if (number2 === null) return "unpriced";
  return number2 === 0 ? "free" : "priced";
}
var authoredOverride = (value) => value !== void 0 && value !== null;
function foundationItemCatalogIssues(item, inventory = [], index = 0) {
  const issues = [];
  const add = (field, id, code, message) => issues.push({
    kind: "foundation",
    index,
    componentId: item.component_id ?? null,
    field,
    inventoryId: id ?? null,
    code,
    message: `Foundation ${index + 1}: ${message}`
  });
  const selected = (id) => id !== void 0 && id !== null && id !== "";
  const check = (field, types, label, { unassigned = null, priceBasis = null } = {}) => {
    const id = item[field];
    if (!selected(id)) {
      if (unassigned) add(field, null, "catalog_item_unassigned", unassigned);
      return;
    }
    const row = inventory.find((record) => record.id === id);
    if (!row) {
      add(
        field,
        id,
        "catalog_item_unavailable",
        `${label} is unavailable \u2014 the catalog row may have been deleted or deactivated`
      );
      return;
    }
    if (!types.includes(row.material_type)) {
      add(field, id, "catalog_item_type_mismatch", `${label} is the wrong catalog type`);
      return;
    }
    const availability = foundationCatalogRowAvailability(row);
    if (availability !== "active") {
      add(
        field,
        id,
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted" ? `${label} is marked deleted in the catalog \u2014 pick a replacement` : `${label} is inactive in the catalog \u2014 reactivate it or pick a replacement`
      );
      return;
    }
    const basis = priceBasis?.(row);
    if (basis && foundationCatalogPriceClass(row[basis]) === "unpriced") {
      add(
        field,
        id,
        "catalog_item_unpriced",
        `${label} has no recorded ${basis} \u2014 a missing price is not a free material`
      );
    }
  };
  check("selected_concrete_id", ["bagged_concrete", "concrete_service"], "the selected concrete catalog material", {
    unassigned: "select a concrete catalog material \u2014 unassigned concrete rides the first supplier's delivery mix or prices at $0",
    // Item-level bag pricing consumes cost_per_unit; a service row's mixes
    // and fees are the delivery scan's own checks, never duplicated here.
    priceBasis: (row) => row.material_type === "bagged_concrete" && !authoredOverride(item.custom_concrete_cost_per_cy) ? "cost_per_unit" : null
  });
  if (item.include_forming) check("selected_forming_id", ["forming_material"], "the selected forming catalog material", {
    // An authored custom rate replaces the catalog basis entirely; the row
    // is then consumed for nothing and unassigned/unpriced stay silent.
    unassigned: !authoredOverride(item.custom_forming_rate) ? "select a forming catalog material or record a custom forming rate" : null,
    priceBasis: () => !authoredOverride(item.custom_forming_rate) ? "cost_per_unit" : null
  });
  if (item.reinforcement_calculation_version != null && item.reinforcement_calculation_version !== 1) {
    if (item.reinforcement_calculation_version === 2 && item.include_rebar && item.reinforcement_material?.kind === "catalog") {
      const id = item.reinforcement_material.inventory_id;
      const matches = selected(id) ? inventory.filter((row) => row.id === id) : [];
      if (matches.length !== 1 || matches[0].material_type !== "rebar") {
        add(
          "reinforcement_material.inventory_id",
          id,
          !selected(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
          !selected(id) ? "select a reinforcement catalog material" : matches.length > 1 ? "the selected reinforcement catalog ID is ambiguous; refresh the catalog" : "the selected reinforcement catalog material is unavailable \u2014 it may have been deleted or deactivated"
        );
      } else {
        const availability = foundationCatalogRowAvailability(matches[0]);
        if (availability !== "active") {
          add(
            "reinforcement_material.inventory_id",
            id,
            availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
            availability === "deleted" ? "the selected reinforcement catalog material is marked deleted \u2014 pick a replacement" : "the selected reinforcement catalog material is inactive \u2014 reactivate it or pick a replacement"
          );
        }
      }
    }
    return issues;
  }
  const manualRebar = hasFoundationCostSnapshot(item.custom_rebar_cost_per_ft) && item.custom_rebar_cost_per_ft >= 0;
  if (item.include_rebar && !manualRebar) {
    const field = item.foundation_type === "spread_foot" ? "rebar_size" : "pillar_rebar_size";
    const authoredSize = field === "rebar_size" ? item.rebar_size : item.pillar_rebar_size;
    const defaulted = field === "pillar_rebar_size" && !authoredSize;
    const size = defaulted ? "#4" : authoredSize;
    const row = size ? inventory.find((record) => record.material_type === "rebar" && record.rebar_size === size) : null;
    if (defaulted) {
      const rowState = row ? foundationCatalogRowAvailability(row) : null;
      add(field, row?.id ?? null, "catalog_item_unassigned_default", !row ? `no rebar size is selected and the catalog has no ${size} rebar default to consume \u2014 select a size` : rowState !== "active" ? `no rebar size is selected \u2014 the catalog ${size} default resolves to ${rowState === "inactive" ? "an inactive" : "a deleted"} row; pick a size explicitly` : `no rebar size is selected \u2014 the catalog ${size} default is consumed; pick a size explicitly`);
    } else if (!row) {
      add(
        field,
        null,
        size ? "catalog_item_unavailable" : "catalog_item_unassigned",
        size ? `rebar catalog size ${size} is unavailable \u2014 it may have been deleted or deactivated` : "select a rebar catalog size"
      );
    } else {
      const availability = foundationCatalogRowAvailability(row);
      if (availability !== "active") {
        add(
          field,
          row.id,
          availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
          availability === "deleted" ? `rebar catalog size ${size} is marked deleted \u2014 pick another size` : `rebar catalog size ${size} is inactive \u2014 reactivate it or pick another size`
        );
      } else if (!authoredOverride(item.custom_rebar_cost_per_ft) && foundationCatalogPriceClass(row.cost_per_unit) === "unpriced") {
        add(
          field,
          row.id,
          "catalog_item_unpriced",
          `rebar catalog size ${size} has no recorded cost_per_unit \u2014 a missing price is not a free material`
        );
      }
    }
  }
  return issues;
}
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationGeometryInputs.js
var foundationInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number2 = Number(value);
  return Number.isFinite(number2) ? number2 : null;
};
var foundationPositiveWholeNumber = (value) => {
  const number2 = foundationInputNumber(value);
  const whole2 = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole2 && Number.isSafeInteger(number2) && number2 > 0;
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementModel.js
var MAX_GEOMETRY = 4096;
var MAX_SUPPORTS = 4096;
var SUPPORT_CAGE_TARGET = "cage";
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
  const number2 = (value, field, { zero = false, integer = false } = {}) => {
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
    number: number2,
    list,
    identity,
    bounds,
    group,
    supportContext: null,
    get missing() {
      return missing;
    }
  };
}
function spreadSteel(c, dimensions, covers, diameter) {
  const { design, number: number2, list, identity, bounds, issue, group, counts } = c;
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
    const bearing = number2(mat?.bearing_elevation_inches, `${field}.bearing_elevation_inches`, { zero: true });
    const sx = number2(mat?.max_spacing_x_inches, `${field}.max_spacing_x_inches`);
    const sz = number2(mat?.max_spacing_z_inches, `${field}.max_spacing_z_inches`);
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
  c.supportContext = { kind: "spread", edge, xSpan, zSpan, mats: sorted, diameter, covers, dimensions };
  list(design.spread?.inter_mat_ties, "spread.inter_mat_ties", 2048).forEach((tie, index) => {
    const field = `spread.inter_mat_ties.${index}`;
    const id = identity(tie?.id, `${field}.id`);
    const from = mats.get(tie?.from_mat_id), to = mats.get(tie?.to_mat_id);
    const x = number2(tie?.x_inches, `${field}.x_inches`, { zero: true });
    const z = number2(tie?.z_inches, `${field}.z_inches`, { zero: true });
    const length2 = number2(tie?.cut_length_inches, `${field}.cut_length_inches`);
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
function supportTargets(c) {
  const sc = c.supportContext;
  if (!sc) return [];
  if (sc.kind === "pillar") {
    if (!sc.cage) return [];
    return [{
      target_id: SUPPORT_CAGE_TARGET,
      mat_id: null,
      base: "concrete_bottom",
      base_elevation_inches: 0,
      required_height_inches: sc.cage.bottom_end_inches,
      footprint: { kind: "pillar", center_inches: sc.center }
    }];
  }
  return sc.mats.map((mat, index) => {
    const lower = index ? sc.mats[index - 1] : null;
    const baseElevation = lower ? lower.bearing + 2 * sc.diameter : 0;
    return {
      target_id: mat.id,
      mat_id: mat.id,
      base: lower ? "mat_below" : "concrete_bottom",
      base_elevation_inches: baseElevation,
      required_height_inches: mat.bearing - baseElevation,
      footprint: {
        kind: "spread",
        edge_inches: sc.edge,
        x_span_inches: sc.xSpan,
        z_span_inches: sc.zSpan,
        length_inches: sc.dimensions.length,
        width_inches: sc.dimensions.width
      }
    };
  });
}
function supportGridPositions(footprint, spacing) {
  const { edge_inches: edge, x_span_inches: xSpan, z_span_inches: zSpan } = footprint;
  const nx = Math.ceil(xSpan / spacing) + 1;
  const nz = Math.ceil(zSpan / spacing) + 1;
  const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
  const positions = [];
  for (let zi = 0; zi < nz; zi += 1) {
    for (let xi = 0; xi < nx; xi += 1) positions.push({ x: at(nx, xi, xSpan), z: at(nz, zi, zSpan) });
  }
  return positions;
}
function supportCountPositions(footprint, count) {
  const { edge_inches: edge, x_span_inches: xSpan, z_span_inches: zSpan } = footprint;
  const aspect = zSpan > 0 ? xSpan / zSpan : count;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  const rows = Math.ceil(count / cols);
  const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    positions.push({ x: at(cols, i % cols, xSpan), z: at(rows, Math.floor(i / cols), zSpan) });
  }
  return positions;
}
function supportsPlan(c) {
  const config = c.design.supports;
  const mode = config?.mode ?? "unconfigured";
  const result = {
    status: "unconfigured",
    mode,
    count: null,
    requirements: [],
    uncovered: [],
    placements: [],
    context: null
  };
  if (mode === "off") {
    if (typeof config.reason !== "string" || !config.reason.trim()) {
      c.required("supports.reason", "Explain how the steel is supported when support items are off.");
      return result;
    }
    c.issue("supports", "reinforcement_supports_off_explained", "Support items are off with an explicit explanation; this is not an engineering approval.", "warning");
    return { ...result, status: "off_explained", count: 0, reason: config.reason.trim() };
  }
  if (!["unconfigured", "manual", "auto"].includes(mode)) {
    c.issue("supports.mode", "reinforcement_support_mode_invalid", "Choose a supported support-selection mode.");
    return result;
  }
  if (mode === "unconfigured") {
    c.issue("supports", "reinforcement_supports_unconfigured", "Supports have not been modeled or priced; no zero quantity or build-ready status is inferred.", "warning");
    return result;
  }
  const sc = c.supportContext;
  const targets = supportTargets(c);
  if (!sc || !targets.length) {
    c.issue("supports", "reinforcement_supports_unconfigured", "No modeled steel accepts supports in this design; no zero quantity or build-ready status is inferred.", "warning");
    return result;
  }
  result.context = sc.kind === "pillar" ? { kind: "pillar", center_inches: sc.center, depth_inches: sc.dimensions.depth, diameter_inches: sc.diameter } : {
    kind: "spread",
    edge_inches: sc.edge,
    length_inches: sc.dimensions.length,
    width_inches: sc.dimensions.width,
    depth_inches: sc.dimensions.depth,
    diameter_inches: sc.diameter
  };
  const coverage = /* @__PURE__ */ new Map();
  const labelOf = (target) => target.mat_id ? `Mat ${target.mat_id}` : "The pillar cage";
  if (mode === "auto") {
    if (sc.kind === "pillar") {
      c.issue(
        "supports.mode",
        "reinforcement_support_mode_unavailable",
        "Auto support placement is unavailable for pillar cages; place manual supports or explain off."
      );
      return result;
    }
    const spacing = c.number(config?.spacing_inches, "supports.spacing_inches");
    if (spacing === null) return result;
    for (const target of targets) {
      coverage.set(target.target_id, { positions: supportGridPositions(target.footprint, spacing) });
    }
  } else {
    const optList = (value, field, limit) => {
      if (value === void 0 || value === null) return [];
      if (!Array.isArray(value) || value.length > limit) {
        c.issue(field, "reinforcement_list_invalid", `Use up to ${limit} records.`);
        return [];
      }
      return value;
    };
    const targetFor = (ref, field) => {
      const cageRef = ref === void 0 || ref === null || ref === "" || ref === SUPPORT_CAGE_TARGET;
      const target = cageRef ? sc.kind === "pillar" ? targets[0] : null : targets.find((record) => record.target_id === ref);
      if (!target) {
        c.issue(
          field,
          "reinforcement_support_target_invalid",
          "Support coverage requires an existing spread mat or the pillar cage."
        );
      }
      return target;
    };
    optList(config?.mats, "supports.mats", 256).forEach((entry, index) => {
      const field = `supports.mats.${index}`;
      const target = targetFor(entry?.mat_id, `${field}.mat_id`);
      const count = c.number(entry?.count, `${field}.count`, { zero: true, integer: true });
      if (!target || count === null) return;
      const cov = coverage.get(target.target_id) || {};
      if (cov.positions || cov.count !== void 0) {
        c.issue(
          field,
          "reinforcement_support_manual_ambiguous",
          "Cover each target once: an authored count or explicit placements, not both."
        );
        return;
      }
      coverage.set(target.target_id, { ...cov, count });
    });
    optList(config?.placements, "supports.placements", MAX_SUPPORTS).forEach((entry, index) => {
      const field = `supports.placements.${index}`;
      const target = targetFor(entry?.mat_id, `${field}.mat_id`);
      const x = c.number(entry?.x_inches, `${field}.x_inches`, { zero: true });
      const z = c.number(entry?.z_inches, `${field}.z_inches`, { zero: true });
      if (!target || x === null || z === null) return;
      if (sc.kind === "pillar") {
        if (Math.hypot(x - sc.center, z - sc.center) > sc.center) {
          c.issue(
            field,
            "reinforcement_support_placement_out_of_bounds",
            "Support position is outside the concrete footprint."
          );
          return;
        }
      } else {
        const footprint = target.footprint;
        if (less(x, footprint.edge_inches) || less(footprint.length_inches - footprint.edge_inches, x) || less(z, footprint.edge_inches) || less(footprint.width_inches - footprint.edge_inches, z)) {
          c.issue(
            field,
            "reinforcement_support_placement_out_of_bounds",
            "Support position is outside the supported mat footprint."
          );
          return;
        }
      }
      const cov = coverage.get(target.target_id) || {};
      if (cov.count !== void 0) {
        c.issue(
          field,
          "reinforcement_support_manual_ambiguous",
          "Cover each target once: an authored count or explicit placements, not both."
        );
        return;
      }
      (cov.positions ||= []).push({ x, z });
      coverage.set(target.target_id, cov);
    });
  }
  let total = 0;
  for (const target of targets) {
    const cov = coverage.get(target.target_id) || {};
    let positions = cov.positions;
    if (positions === void 0 && cov.count !== void 0) {
      positions = supportCountPositions(target.footprint, cov.count);
    }
    positions ||= [];
    const needed = target.required_height_inches > 0;
    if (!needed) {
      if (positions.length && mode === "manual") {
        c.issue(
          "supports",
          "reinforcement_support_height_infeasible",
          `${labelOf(target)} bears directly on its base plane; authored supports cannot fit under it.`
        );
      } else {
        c.issue(
          "supports",
          "reinforcement_support_unneeded",
          `${labelOf(target)} bears directly on its base plane; no support device is required for it.`,
          "warning"
        );
      }
      continue;
    }
    if (!positions.length) {
      c.issue(
        "supports",
        "reinforcement_support_mat_unsupported",
        `${labelOf(target)} has no modeled supports; verify how it is held before build.`,
        "warning"
      );
      result.uncovered.push({ target_id: target.target_id, mat_id: target.mat_id });
      continue;
    }
    total += positions.length;
    if (total > MAX_SUPPORTS) {
      c.issue(
        "supports",
        "reinforcement_numeric_range_invalid",
        "Modeled support positions exceed the supported numeric range."
      );
      return result;
    }
    result.requirements.push({ ...target, count: positions.length, positions });
    for (const position of positions) {
      result.placements.push({
        target_id: target.target_id,
        mat_id: target.mat_id,
        x: position.x,
        z: position.z,
        base: target.base,
        base_elevation_inches: target.base_elevation_inches,
        required_height_inches: target.required_height_inches
      });
    }
  }
  result.status = "modeled";
  result.count = total;
  return result;
}
function pillarSteel(c, dimensions, covers, diameter) {
  const { design, number: number2, list, identity, bounds, issue, group, counts } = c;
  const radius = diameter / 2, center = dimensions.diameter / 2;
  const outer = center - covers.side;
  const longitudinal = design.pillar?.longitudinal;
  const n = number2(longitudinal?.count, "pillar.longitudinal.count", { zero: true, integer: true });
  let long = null;
  if (n > 0) {
    const r = number2(longitudinal.radius_inches, "pillar.longitudinal.radius_inches", { zero: true });
    const bottom = number2(longitudinal.bottom_end_inches, "pillar.longitudinal.bottom_end_inches", { zero: true });
    const top = number2(longitudinal.top_end_inches, "pillar.longitudinal.top_end_inches", { zero: true });
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
    const y = number2(hoop?.center_y_inches, `${field}.center_y_inches`, { zero: true });
    const d = number2(hoop?.centerline_diameter_inches, `${field}.centerline_diameter_inches`);
    const allowance = number2(hoop?.cut_allowance_inches, `${field}.cut_allowance_inches`, { zero: true });
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
  c.supportContext = {
    kind: "pillar",
    center,
    outer,
    diameter,
    covers,
    dimensions,
    cage: long ? { bottom_end_inches: long.bottom } : null
  };
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
    supports: { status: "unconfigured", mode: "unconfigured", count: null, requirements: [], uncovered: [], placements: [], context: null }
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
    supports: { status: "not_required", mode: null, count: 0, requirements: [], uncovered: [], placements: [], context: null }
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
  const supports = supportsPlan(c);
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementBasis.js
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
    labor_hours_per_connection: setting("foundation_rebar_time_cross_section", 0.05),
    labor_hours_per_support: setting("foundation_rebar_support_time_each", 0.05)
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementCost.js
var close = (a, b) => Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
var nonnegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var whole = (value) => nonnegative(value) && Number.isSafeInteger(value);
var STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
function priceFoundationReinforcementModel(model, basis = {}, supportsResolution = null) {
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
  const supportsReady = model.supports?.status === "not_required" || model.supports?.status === "off_explained" && model.supports.count === 0 && typeof model.supports.reason === "string" && Boolean(model.supports.reason.trim()) || model.supports?.status === "modeled" && supportsResolution?.status === "resolved";
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementSupport.js
var HEIGHT_TOLERANCE_INCHES = 0.0625;
var isRecord2 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var nonnegative2 = (value) => finite(value) && value >= 0;
var positive2 = (value) => finite(value) && value > 0;
var wholeNonnegative = (value) => nonnegative2(value) && Number.isSafeInteger(value);
var text2 = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
var number = (value) => value === null || value === void 0 || value === "" ? null : foundationInputNumber(value);
var close2 = (a, b) => Math.abs(a - b) <= HEIGHT_TOLERANCE_INCHES;
var zeroAmounts = () => ({
  support_count: 0,
  support_purchased_units: 0,
  support_packs: 0,
  support_material_cost: 0,
  support_labor_hours: 0,
  support_labor_cost: 0,
  support_cost: 0
});
var passthrough = (supports, issues = []) => ({
  version: 1,
  status: supports?.status ?? "unconfigured",
  mode: supports?.mode ?? null,
  count: supports?.count ?? null,
  per_instance_count: supports?.count ?? null,
  selections: [],
  amounts: zeroAmounts(),
  issues
});
function catalogSupport(row) {
  if (!isRecord2(row) || row.material_type !== "rebar_support") return null;
  const heightNominal = number(row.rebar_support_height_inches);
  const heightMin = number(row.rebar_support_height_min_inches);
  const heightMax = number(row.rebar_support_height_max_inches);
  const footprintLength = number(row.rebar_support_footprint_length_inches);
  const footprintWidth = number(row.rebar_support_footprint_width_inches);
  const packRaw = number(row.rebar_support_pack_size);
  const packMalformed = packRaw !== null && (!Number.isSafeInteger(packRaw) || packRaw <= 0);
  const costRaw = row.cost_per_unit;
  const cost = costRaw === null || costRaw === void 0 || costRaw === "" ? null : foundationInputNumber(costRaw);
  const barSizes = Array.isArray(row.rebar_support_compatible_bar_sizes) ? row.rebar_support_compatible_bar_sizes.map((size) => text2(size)).filter(Boolean) : null;
  return {
    id: typeof row.id === "string" ? row.id : null,
    name: text2(row.material_name) || "Rebar support",
    kind: text2(row.rebar_support_kind) || null,
    foundation_usage: text2(row.foundation_usage) || null,
    heightNominal,
    heightMin,
    heightMax,
    footprintLength,
    footprintWidth,
    packSize: packRaw === null ? 1 : packRaw,
    packMalformed,
    costPerUnit: nonnegative2(cost) ? cost : null,
    costMalformed: cost !== null && !nonnegative2(cost),
    barSizes,
    placementNotes: text2(row.rebar_support_placement_notes) || null,
    sortOrder: number(row.sort_order) ?? 0,
    updated_date: typeof row.updated_date === "string" ? row.updated_date : null
  };
}
function heightCheck(row, required) {
  if (positive2(row.heightNominal)) return close2(row.heightNominal, required) ? "fits" : "incompatible";
  if (positive2(row.heightMin) && positive2(row.heightMax) && row.heightMin <= row.heightMax) {
    return row.heightMin <= required && required <= row.heightMax ? "fits" : "incompatible";
  }
  return "unverified";
}
function footprintCheck(row, requirement) {
  const { footprint, positions } = requirement;
  const halfL = row.footprintLength === null ? null : row.footprintLength / 2;
  const halfW = row.footprintWidth === null ? null : row.footprintWidth / 2;
  if (footprint.kind === "pillar") {
    if (halfL === null || halfW === null) return "unverified";
    const radial = Math.hypot(halfL, halfW);
    const center = footprint.center_inches;
    const out = positions.some((position) => Math.hypot(position.x - center, position.z - center) + radial > center);
    return out ? "incompatible" : "fits";
  }
  const edge = footprint.edge_inches;
  if (halfL === null || halfW === null) return "unverified";
  if (halfL > edge || halfW > edge) return "incompatible";
  const xFit = positions.every((p) => p.x - halfL >= 0 && p.x + halfL <= footprint.length_inches);
  const zFit = positions.every((p) => p.z - halfW >= 0 && p.z + halfW <= footprint.width_inches);
  return xFit && zFit ? "fits" : "incompatible";
}
function barCheck(row, barSize) {
  if (barSize === null) return "unverified";
  if (Array.isArray(row.barSizes) && row.barSizes.length) {
    return row.barSizes.includes(barSize) ? "fits" : "incompatible";
  }
  return "unverified";
}
function usageCheck(row, requirement) {
  const usage = row.foundation_usage;
  if (!usage || usage === "general") return "unverified";
  const wants = requirement.footprint.kind === "pillar" ? "pillar" : "spread_foot";
  return usage === wants ? "fits" : "incompatible";
}
function checkRow(row, requirement, barSize) {
  const checks = {
    height: heightCheck(row, requirement.required_height_inches),
    footprint: footprintCheck(row, requirement),
    bar: barCheck(row, barSize),
    usage: usageCheck(row, requirement)
  };
  const incompatible = Object.values(checks).includes("incompatible");
  const proven = checks.height === "fits" && checks.footprint === "fits" && checks.bar === "fits" && checks.usage !== "incompatible";
  return { checks, incompatible, proven };
}
function provenBarSize(material, inventory) {
  if (material?.kind !== "catalog" || typeof material.inventory_id !== "string" || !material.inventory_id) return null;
  const matches = (Array.isArray(inventory) ? inventory : []).filter((row) => isRecord2(row) && row.id === material.inventory_id && row.material_type === "rebar");
  if (matches.length !== 1) return null;
  return text2(matches[0].rebar_size) || null;
}
var supportLabel = (requirement) => requirement.mat_id ? `Mat ${requirement.mat_id}` : "The pillar cage";
function resolveFoundationReinforcementSupports({
  item,
  design,
  model,
  material,
  inventory = [],
  basis = {}
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const supports = model?.supports;
  if (model?.version !== 2 || model.status !== "valid" || supports?.status !== "modeled") {
    return passthrough(supports);
  }
  const result = passthrough(supports);
  const mode = supports.mode;
  const config = isRecord2(design?.supports) ? design.supports : {};
  const rows = (Array.isArray(inventory) ? inventory : []).map(catalogSupport).filter(Boolean);
  const dupes = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (row.id !== null && seen.has(row.id)) dupes.add(row.id);
    if (row.id !== null) seen.add(row.id);
  }
  const barSize = provenBarSize(material, inventory);
  let pinned = null;
  if (config.catalog_id !== void 0 && config.catalog_id !== null && config.catalog_id !== "") {
    const id = config.catalog_id;
    if (typeof id !== "string" || !id.trim() || id.trim() !== id || id.length > 128) {
      issue(
        "supports.catalog_id",
        "reinforcement_support_catalog_id_invalid",
        "The pinned support catalog ID must be a stable trimmed identifier."
      );
      return { ...result, issues };
    }
    const matches = rows.filter((row) => row.id === id);
    if (!matches.length) {
      issue(
        "supports.catalog_id",
        "reinforcement_support_catalog_unavailable",
        "The pinned rebar support catalog record is unavailable; refresh the catalog before pricing."
      );
      return { ...result, issues };
    }
    if (matches.length > 1 || dupes.has(id)) {
      issue(
        "supports.catalog_id",
        "reinforcement_support_catalog_ambiguous",
        "Multiple current rebar support records have the pinned ID; refresh the catalog before pricing."
      );
      return { ...result, issues };
    }
    pinned = matches[0];
  }
  const laborRate = nonnegative2(basis?.labor_rate_per_hour) ? basis.labor_rate_per_hour : null;
  const laborEach = nonnegative2(basis?.labor_hours_per_support) ? basis.labor_hours_per_support : null;
  const instanceCount = wholeNonnegative(model.instanceCount) && model.instanceCount > 0 ? model.instanceCount : null;
  if (instanceCount === null) {
    issue(
      "model.instanceCount",
      "reinforcement_numeric_range_invalid",
      "Support quantities require a known positive foundation instance count."
    );
    return { ...result, issues };
  }
  const warnedPin = /* @__PURE__ */ new Set();
  let unresolvedCost = false, unverifiedPin = false;
  for (const requirement of supports.requirements || []) {
    const required = requirement.required_height_inches;
    const count = requirement.count;
    if (!Number.isSafeInteger(count) || count <= 0 || !positive2(required)) {
      issue(
        "supports",
        "reinforcement_support_requirement_invalid",
        `${supportLabel(requirement)} produced an invalid support requirement.`
      );
      continue;
    }
    let chosen = null, provenance = "verified";
    if (pinned) {
      const verdict = checkRow(pinned, requirement, barSize);
      if (verdict.incompatible) {
        issue(
          "supports.catalog_id",
          "reinforcement_support_pinned_incompatible",
          `${supportLabel(requirement)} cannot use the pinned catalog support: height, footprint, bar-size or usage is provably incompatible \u2014 pick a different row or clear the pin.`
        );
        continue;
      }
      if (!verdict.proven) unverifiedPin = true;
      if (!verdict.proven && !warnedPin.has("unverified")) {
        warnedPin.add("unverified");
        issue(
          "supports.catalog_id",
          "reinforcement_support_compatibility_unverified",
          "The pinned support cannot be proven compatible from catalog metadata (height, footprint or bar-size data is missing); the authored pick stands pending verification.",
          "warning"
        );
      }
      chosen = pinned;
      provenance = verdict.proven ? "verified" : "authored_unverified";
    } else {
      const candidates = rows.map((row) => ({ row, verdict: checkRow(row, requirement, barSize) })).filter((entry) => entry.verdict.proven);
      if (!candidates.length) {
        issue(
          "supports",
          "reinforcement_support_no_compatible",
          `${supportLabel(requirement)} needs a ${required}-in support; no catalog rebar_support row is proven compatible on height, footprint and bar size \u2014 catalog one, pin an explicit pick, or explain supports off.`
        );
        continue;
      }
      const priced = (entry) => entry.row.costPerUnit !== null ? 0 : 1;
      const heightRank = (entry) => entry.row.heightNominal !== null ? Math.abs(entry.row.heightNominal - required) : required - entry.row.heightMin;
      candidates.sort((a, b) => priced(a) - priced(b) || heightRank(a) - heightRank(b) || a.row.costPerUnit - b.row.costPerUnit || (a.row.sortOrder ?? 0) - (b.row.sortOrder ?? 0) || String(a.row.id).localeCompare(String(b.row.id)));
      chosen = candidates[0].row;
    }
    if (chosen.packMalformed) {
      issue(
        "supports",
        "reinforcement_support_pack_invalid",
        `${supportLabel(requirement)} selection "${chosen.name}" has a malformed pack size; units are priced individually and the catalog row needs repair.`,
        "warning"
      );
    }
    if (chosen.costMalformed || chosen.costPerUnit === null) unresolvedCost = true;
    const unitsRequired = count * instanceCount;
    const pack = chosen.packMalformed ? 1 : chosen.packSize;
    const packs = Math.ceil(unitsRequired / pack);
    const purchased = packs * pack;
    const materialCost = chosen.costPerUnit === null ? null : purchased * chosen.costPerUnit;
    const laborHours = laborEach !== null && laborRate !== null ? unitsRequired * laborEach : null;
    const laborCost = laborHours !== null ? laborHours * laborRate : null;
    if (materialCost === null || laborCost === null) unresolvedCost = true;
    const usedHeight = chosen.heightNominal ?? required;
    result.selections.push({
      target_id: requirement.target_id,
      mat_id: requirement.mat_id,
      base: requirement.base,
      required_height_inches: required,
      support_height_inches: usedHeight,
      inventory_id: chosen.id,
      name: chosen.name,
      kind: chosen.kind,
      compatibility: provenance,
      count_per_instance: count,
      units_required: unitsRequired,
      pack_size: pack,
      packs,
      units_purchased: purchased,
      unit_cost: chosen.costPerUnit,
      material_cost: materialCost,
      labor_hours: laborHours,
      labor_cost: laborCost,
      cost: materialCost !== null && laborCost !== null ? materialCost + laborCost : null,
      placement_notes: chosen.placementNotes
    });
  }
  const amounts = zeroAmounts();
  for (const selection of result.selections) {
    amounts.support_count += selection.units_required;
    amounts.support_purchased_units += selection.units_purchased;
    amounts.support_packs += selection.packs;
    amounts.support_material_cost += selection.material_cost ?? 0;
    amounts.support_labor_hours += selection.labor_hours ?? 0;
    amounts.support_labor_cost += selection.labor_cost ?? 0;
  }
  amounts.support_cost = amounts.support_material_cost + amounts.support_labor_cost;
  result.amounts = amounts;
  result.per_instance_count = supports.count ?? 0;
  result.count = amounts.support_count;
  result.pin = pinned ? { inventory_id: pinned.id, name: pinned.name } : null;
  if (unresolvedCost) {
    issue(
      "supports",
      "reinforcement_support_cost_unknown",
      "A selected support has no verifiable catalog unit price or install-labor basis; support quantities are known but support cost is unresolved \u2014 never a silent zero.",
      "warning"
    );
  }
  if (amounts.support_count > 0) {
    issue(
      "supports",
      "reinforcement_support_obstructions_unverified",
      "Embedded poles, sleeves, conduits and voids are not modeled; verify modeled support positions clear all obstructions before build.",
      "warning"
    );
  }
  const covered = supports.requirements?.length ?? 0;
  const selected = result.selections.length;
  result.status = issues.some((entry) => entry.severity === "error") ? "unresolved" : covered === selected && !unresolvedCost ? "resolved" : "unresolved";
  result.issues = issues;
  return result;
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementProjection.js
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
  const supports = model.status === "valid" ? resolveFoundationReinforcementSupports({
    item: record,
    design,
    model,
    material: resolution?.materialSnapshot ?? null,
    inventory,
    basis: resolution?.basis ?? {}
  }) : null;
  const steel = priceFoundationReinforcementModel(model, resolution?.basis, supports);
  const issues = [
    ...model.issues.map((issue) => ({ ...issue, scope: "geometry" })),
    ...(resolution?.issues || []).map((issue) => ({ ...issue, scope: "basis" })),
    ...(supports?.issues || []).map((issue) => ({ ...issue, scope: "supports" })),
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
    supports,
    materialSnapshot: resolution?.materialSnapshot ?? null,
    rateSources: resolution?.rateSources ?? [],
    canApplyToEstimate: steel.canApplyToEstimate && !issues.some((issue) => issue.severity === "error")
  };
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementItemProjection.js
var isRecord3 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
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
  if (!isRecord3(item)) {
    issue("item", "reinforcement_common_item_invalid", "A current foundation record is required.");
    return unavailable();
  }
  if (!Array.isArray(inventory) || inventory.some((row) => !isRecord3(row))) {
    issue("inventory", "reinforcement_common_inventory_unavailable", "Current concrete and forming catalog records could not be verified.");
    return unavailable();
  }
  if (!isRecord3(settings)) {
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
  const supports = reinforcement.supports;
  const supportsModeled = reinforcement.model.supports?.status === "modeled";
  if (supportsModeled && supports?.status !== "resolved") {
    issue(
      "supports",
      "reinforcement_support_cost_unknown",
      "Modeled support economics are unresolved; no replacement item total is available."
    );
    return unavailable();
  }
  const supportCost = supportsModeled ? supports.amounts.support_cost : 0;
  const total = commonCost.total + steel.steel_cost + supportCost, excavationVolume = common.volumeCY * 1.25;
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
      support_count: supports?.amounts?.support_count ?? 0,
      support_purchased_units: supports?.amounts?.support_purchased_units ?? 0,
      support_packs: supports?.amounts?.support_packs ?? 0,
      support_material_cost: supports?.amounts?.support_material_cost ?? 0,
      support_labor_cost: supports?.amounts?.support_labor_cost ?? 0,
      support_labor_hours: supports?.amounts?.support_labor_hours ?? 0,
      support_cost: supportCost,
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
export {
  calculateFoundationReinforcementItemProjection
};
