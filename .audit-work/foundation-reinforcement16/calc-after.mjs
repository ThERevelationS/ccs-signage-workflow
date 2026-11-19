// src/components/estimator/foundation/legacyFoundationCalc.js
var getConcreteMixes = (invItem) => [
  { id: "3500_ae", name: "3500 AIR ENTRAINED (AE)", price: invItem?.mix_3500_price ?? 195.4, desc: "Often used for driveways, slabs, and moderate-load footings." },
  { id: "4000_ae", name: "4000 AIR ENTRAINED (AE)", price: invItem?.mix_4000_price ?? 201, desc: "STANDARD. Used for sign foundations, commercial flatwork, and structural footings requiring good durability." },
  { id: "4500_ae", name: "4500 AIR ENTRAINED (AE)", price: invItem?.mix_4500_price ?? 208.7, desc: "Used for heavy-duty commercial slabs and heavy traffic areas." },
  { id: "5000_ae", name: "5000 AIR ENTRAINED (AE)", price: invItem?.mix_5000_price ?? 214.6, desc: "High-strength mix for heavy structural columns, pillars, and extreme load conditions." },
  { id: "fast_set", name: "FAST SET", price: invItem?.mix_fast_set_price ?? 248, desc: "Quick-curing concrete used when rapid strength gain is needed to minimize downtime." }
];
var getConcreteAdmixtures = (invItem) => [
  { id: "calcium_chloride", name: "Calcium Chloride", price: invItem?.admix_calcium_chloride_price ?? 8.5, desc: "Speeds up how fast the concrete dries. SELECT THIS when pouring in cold weather so it doesn't freeze before it sets. WARNING: Do NOT select this if using Rebar, as it causes rust!" },
  { id: "set_retarding", name: "Set-Retarding Admix (Type D)", price: invItem?.admix_set_retarding_price ?? 4.5, desc: "Slows down how fast the concrete dries. SELECT THIS when pouring in very hot weather, or if the concrete truck has a very long drive to the site." },
  { id: "water_reducing", name: "Water-Reducing Admix (Type A)", price: invItem?.admix_water_reducing_price ?? 4.25, desc: "Makes the concrete easier to pour without weakening it. SELECT THIS if you need the concrete to flow better into tight forms or around lots of rebar." },
  { id: "fibers", name: "Fibers", price: invItem?.admix_fibers_price ?? 12.5, desc: "Tiny fibers mixed into the concrete to prevent small cracks. SELECT THIS for large flat slabs (like monument sign pads) or if the foundation will take physical abuse." },
  { id: "winter_service", name: "Winter Service", price: invItem?.admix_winter_service_price ?? 5.5, desc: "A fee the plant charges to use hot water so the mix doesn't freeze. SELECT THIS always during winter months when temperatures are freezing." }
];
var getSmallLoadFee = (yards, invItem) => {
  if (yards >= 5) return 0;
  if (yards >= 4.5) return invItem?.small_load_fee_4_5_4_75 ?? 40;
  if (yards >= 4) return invItem?.small_load_fee_4_4_25 ?? 80;
  if (yards >= 3) return invItem?.small_load_fee_3_3_75 ?? 105;
  if (yards >= 2) return invItem?.small_load_fee_2_2_75 ?? 120;
  if (yards >= 1) return invItem?.small_load_fee_1_1_75 ?? 150;
  return invItem?.small_load_fee_1_1_75 ?? 150;
};
var getFuelSurcharge = (invItem) => {
  return invItem?.fuel_surcharge ?? 30;
};
var supplierPriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number3 = Number(value);
  return Number.isFinite(number3) && number3 >= 0 ? number3 : null;
};
var foundationSettingNumber = (value, fallback) => supplierPriceNumber(value === 0 ? 0 : value || fallback);
var itemSettingConsumption = (item) => {
  const has = (v) => v !== void 0 && v !== null;
  const consumed = [["foundation_pouring_cost_per_cy", 15, "pouring labor cost per CY"]];
  const laborDivides = Boolean(item?.include_finishing) && !has(item?.custom_finishing_hours);
  if (!has(item?.custom_excavation_rate) || item?.include_rebar || item?.include_finishing && (!has(item?.custom_finishing_rate) || !has(item?.custom_finishing_hours))) {
    consumed.push(["foundation_main_labor_rate", 60, laborDivides ? "positive main labor rate" : "main labor rate", laborDivides]);
  }
  if (item?.include_rebar) {
    consumed.push(
      ["foundation_rebar_time_cross_section", 0.05, "rebar time per intersection"],
      ["foundation_rebar_time_linear_ft", 0.02, "rebar time per linear foot"]
    );
  }
  if (item?.include_forming) {
    consumed.push(
      ["foundation_forming_cost_per_sqft", 2.5, "forming labor cost per sq ft"],
      item?.foundation_type === "spread_foot" ? ["foundation_forming_materials_spread_foot", 0.5, "spread-foot forming materials multiplier"] : ["foundation_forming_materials_pillar", 0.75, "pillar forming materials multiplier"]
    );
  }
  if (item?.include_finishing && !has(item?.custom_finishing_hours)) {
    consumed.push(["foundation_finishing_cost_per_sqft", 1.25, "finishing labor cost per sq ft"]);
  }
  if (!has(item?.custom_excavation_hours)) {
    consumed.push(
      item?.excavation_method === "hand_dig" || !item?.excavation_method ? ["foundation_hand_dig_time_per_cy", 2, "hand excavation time per CY"] : ["foundation_equipment_excavation_time_per_cy", 0.5, "equipment excavation time per CY"]
    );
  }
  return consumed;
};
var foundationItemSettingIssues = (item, settings = {}, index = 0) => {
  const issues = [];
  for (const [key, fallback, label, positive4] of itemSettingConsumption(item)) {
    const number3 = foundationSettingNumber(settings?.[key], fallback);
    if (number3 === null || positive4 && number3 <= 0) {
      issues.push({
        kind: "foundation",
        index,
        componentId: item?.component_id ?? null,
        field: key,
        inventoryId: null,
        code: "foundation_setting_unavailable",
        message: `Foundation ${index + 1}: record a finite, ${positive4 ? "positive" : "nonnegative"} ${label.replace(/^positive /, "")} in Estimator Settings before repricing.`
      });
    }
  }
  return issues;
};
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
var calcConcreteDelivery = (project, items = [], inventory = []) => {
  const concreteServiceItems = items.filter((item) => {
    const inv = inventory.find((i) => i.id === item.selected_concrete_id);
    return !inv || inv.material_type === "concrete_service";
  });
  const totalConcreteYards = concreteServiceItems.reduce((sum, item) => sum + calcItemCost(item, inventory, project.settings || {}).volumeCY, 0);
  const roundedYards = Math.ceil(totalConcreteYards * 4) / 4;
  const firstConcreteItem = concreteServiceItems.find((i) => inventory.find((inv) => inv.id === i.selected_concrete_id)?.material_type === "concrete_service");
  const firstConcreteInv = firstConcreteItem ? inventory.find((inv) => inv.id === firstConcreteItem.selected_concrete_id) : null;
  const availableMixes = getConcreteMixes(firstConcreteInv);
  const availableAdmixes = getConcreteAdmixtures(firstConcreteInv);
  const mix = availableMixes.find((m) => m.id === project.project_concrete_type) || availableMixes.find((m) => m.id === "4000_ae");
  const mixPrice = mix ? mix.price : 201;
  const admixPrice = (project.project_concrete_admixtures || []).reduce((sum, admixId) => {
    const a = availableAdmixes.find((x) => x.id === admixId);
    return sum + (a ? a.price : 0);
  }, 0);
  const ratePerYard = mixPrice + admixPrice;
  let concreteTotal = 0;
  let remainingYards = roundedYards;
  const trucksList = [];
  const fuelSurcharge = getFuelSurcharge(firstConcreteInv);
  while (remainingYards > 0) {
    const truckYards = Math.min(remainingYards, 9);
    remainingYards -= truckYards;
    const roundedTruckYards = Math.ceil(truckYards * 4) / 4;
    const smallOrderFee = getSmallLoadFee(roundedTruckYards, firstConcreteInv);
    const fuelFee = fuelSurcharge;
    const truckCost = roundedTruckYards * ratePerYard + smallOrderFee + fuelFee;
    trucksList.push({ yards: truckYards, roundedYards: roundedTruckYards, cost: truckCost, smallOrderFee, fuelFee });
    concreteTotal += truckCost;
  }
  const newSignLocationsCount = items.filter((i) => i.is_new_sign_location).length;
  const additionalStopsCost = newSignLocationsCount * 100;
  concreteTotal += additionalStopsCost;
  return { concreteTotal, roundedYards, ratePerYard, trucksList, additionalStopsCost, availableMixes, availableAdmixes };
};

// src/components/masterInventory/inventoryNormalization.js
var STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string" || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number3 = Number(value);
  return Number.isFinite(number3) ? number3 : null;
};
var inventoryFiniteNumber = (value) => strictNumber(value);
var inventoryNonnegativeNumber = (value) => {
  const number3 = strictNumber(value);
  return number3 !== null && number3 >= 0 ? number3 : null;
};
var inventoryPositiveNumber = (value) => {
  const number3 = strictNumber(value, { unsignedExponent: true });
  return number3 !== null && number3 > 0 ? number3 : null;
};
var inventoryNonnegativeMeasurement = (value) => {
  const number3 = strictNumber(value, { unsignedExponent: true });
  return number3 !== null && number3 >= 0 ? number3 : null;
};
var inventoryIsPositiveWhole = (value) => {
  const number3 = inventoryFiniteNumber(value);
  const whole3 = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole3 && Number.isSafeInteger(number3) && number3 > 0;
};
var inventorySettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
var inventorySettingNumber = (value, fallback) => inventoryNonnegativeNumber(inventorySettingValue(value, fallback));
var inventoryPositiveSettingNumber = (value, fallback) => inventoryPositiveNumber(inventorySettingValue(value, fallback));
var FOUNDATION_MATERIAL_TYPE_ALIASES = {
  forming: "forming_material"
};
var FOUNDATION_FIELD_ALIASES = [
  ["wall_unit_length_inches", "brick_length_inches"],
  ["wall_unit_width_inches", "brick_width_inches"],
  ["wall_unit_height_inches", "brick_height_inches"]
];
var FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES = {
  brick: "brick",
  clay_brick: "brick",
  face_brick: "brick",
  veneer_brick: "brick",
  cinderblock: "cinderblock",
  cinder_block: "cinderblock",
  cmu: "cinderblock",
  concrete_block: "cinderblock",
  cement_block: "cinderblock",
  concrete_masonry_unit: "cinderblock",
  masonry_block: "cinderblock",
  block: "cinderblock",
  stone: "stone",
  natural_stone: "stone",
  cut_stone: "stone",
  stone_veneer: "stone",
  veneer_stone: "stone",
  limestone: "stone",
  sandstone: "stone",
  concrete: "concrete",
  poured_concrete: "concrete",
  poured: "concrete",
  poured_in_place: "concrete",
  cast_in_place: "concrete",
  cast_in_place_concrete: "concrete",
  monolithic_concrete: "concrete"
};
var wallMaterialSubtypeKey = (value) => typeof value === "string" ? value.trim().toLowerCase().replace(/[\s\-_]+/g, "_") : null;
var wallMaterialSubtypeRecorded = (value) => value !== void 0 && value !== null && (typeof value !== "string" || value.trim() !== "");
var canonicalWallMaterialSubtype = (value) => {
  if (!wallMaterialSubtypeRecorded(value)) return null;
  const key = wallMaterialSubtypeKey(value);
  return key ? FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES[key] ?? null : null;
};
var INCHES_PER_FOOT = 12;
function normalizeFoundationInventoryRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out = { ...row };
  const canonicalType = FOUNDATION_MATERIAL_TYPE_ALIASES[out.material_type];
  if (canonicalType) out.material_type = canonicalType;
  for (const [canonical, legacy] of FOUNDATION_FIELD_ALIASES) {
    if (out[canonical] === void 0 && out[legacy] !== void 0) {
      out[canonical] = out[legacy];
    }
  }
  if (out.pole_stock_length_ft === void 0 && out.pole_stock_length_inches !== void 0) {
    const stockLengthInches = inventoryPositiveNumber(out.pole_stock_length_inches);
    if (stockLengthInches !== null) out.pole_stock_length_ft = stockLengthInches / INCHES_PER_FOOT;
  }
  const canonicalSubtype = canonicalWallMaterialSubtype(out.wall_material_subtype);
  if (canonicalSubtype !== null) out.wall_material_subtype = canonicalSubtype;
  if (out.supplier_key === void 0) {
    const key = inventorySupplierKey(out.supplier);
    if (key !== null) out.supplier_key = key;
  }
  return out;
}
var normalizeFoundationInventoryRows = (rows) => Array.isArray(rows) ? rows.map(normalizeFoundationInventoryRow) : rows;
var inventorySupplierKey = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s\-_.]+/g, "_");
  return key === "" ? null : key;
};

// src/components/estimator/foundation/foundationEquipmentBindings.js
var num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var assigned = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
function resolveFoundationEquipment(entry = {}, inventory = [], index = 0) {
  const source = entry || {};
  const equipment = inventory.find((row) => row.id === source.equipment_id);
  let attachmentMode = "none";
  let attachmentRows = [];
  if (source.attachments?.length) {
    attachmentMode = "normalized";
    attachmentRows = source.attachments.map((row, rowIndex) => {
      const id = row.id || row.inventory_id;
      return {
        id,
        quantity: row.qty ?? 1,
        sourceRecord: row,
        rowIndex,
        field: "attachments",
        inventory: inventory.find((item) => item.id === id)
      };
    });
  } else if (source.attachment_counts) {
    attachmentMode = "counts";
    attachmentRows = Object.entries(source.attachment_counts).map(([id, quantity], rowIndex) => ({
      id,
      quantity: num(quantity),
      rowIndex,
      field: "attachment_counts",
      inventory: inventory.find((item) => item.id === id && item.material_type === "attachment")
    }));
  } else if (source.attachment_ids?.length) {
    attachmentMode = "legacy_ids";
    attachmentRows = source.attachment_ids.map((id, rowIndex) => ({
      id,
      quantity: 1,
      rowIndex,
      field: "attachment_ids",
      inventory: inventory.find((item) => item.id === id && item.material_type === "attachment")
    }));
  }
  const subAttachmentRows = Object.entries(source.sub_attachment_counts || {}).map(([id, quantity], rowIndex) => ({
    id,
    quantity: num(quantity),
    rowIndex,
    field: "sub_attachment_counts",
    inventory: inventory.find((item) => item.id === id && item.material_type === "sub_attachment")
  }));
  const issues = [];
  const check = (id, record, kind, field) => {
    if (assigned(id) && record) {
      const availability = foundationCatalogRowAvailability(record);
      if (availability === "active") return;
      issues.push({
        kind,
        index,
        componentId: source.component_id ?? source._id ?? null,
        field,
        inventoryId: id,
        code: availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        message: `Equipment ${index + 1}: ${kind.replaceAll("_", " ")} ${String(id)} is ${availability === "deleted" ? "marked deleted \u2014 pick a replacement" : "inactive \u2014 reactivate it or pick a replacement"}.`
      });
      return;
    }
    const hasSelection = assigned(id);
    issues.push({
      kind,
      index,
      componentId: source.component_id ?? source._id ?? null,
      field,
      inventoryId: hasSelection ? id : null,
      code: hasSelection ? "catalog_item_unavailable" : "catalog_item_unassigned",
      message: `Equipment ${index + 1}: ${hasSelection ? `${kind.replaceAll("_", " ")} ${String(id)} is unavailable` : `select a catalog ${kind.replaceAll("_", " ")}`}.`
    });
  };
  check(source.equipment_id, equipment, "equipment", "equipment_id");
  for (const row of attachmentRows) {
    if (attachmentMode === "normalized" || row.quantity !== 0) {
      check(row.id, row.inventory, "attachment", row.field);
    }
  }
  for (const row of subAttachmentRows) {
    if (row.quantity !== 0) check(row.id, row.inventory, "sub_attachment", row.field);
  }
  return { equipment, attachmentMode, attachmentRows, subAttachmentRows, issues };
}
function foundationEquipmentCatalogIssues(entries = [], inventory = []) {
  return entries.flatMap((entry, index) => resolveFoundationEquipment(entry, inventory, index).issues);
}

// src/components/estimator/foundation/wallCapCalculator.js
function wallCapCutLengthValue(cap) {
  if (!cap || typeof cap !== "object" || Array.isArray(cap)) return void 0;
  return Object.prototype.hasOwnProperty.call(cap, "length_inches") ? cap.length_inches : cap.cut_length_inches;
}
var known = (value) => typeof value === "number" && Number.isFinite(value);
var assigned2 = (id) => typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
var sumKnown = (rows) => {
  let total = 0;
  for (const row of rows) {
    if (!known(row.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
};
function calcWallCaps(wallCaps = [], inventory = [], options = {}) {
  const issues = [];
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedCaps");
  const currentIds = /* @__PURE__ */ new Map();
  const savedCaps = /* @__PURE__ */ new Map();
  const componentId = (cap) => typeof cap?.component_id === "string" && cap.component_id.trim() !== "" ? cap.component_id : null;
  if (explicitSnapshot) {
    for (const cap of wallCaps || []) {
      const id = componentId(cap);
      if (id !== null) currentIds.set(id, (currentIds.get(id) || 0) + 1);
    }
    for (const cap of Array.isArray(options.savedCaps) ? options.savedCaps : []) {
      const id = componentId(cap);
      if (id !== null) savedCaps.set(id, savedCaps.has(id) ? null : cap);
    }
  }
  const held = (cap) => {
    const result = { ...cap };
    if (!explicitSnapshot) return result;
    const id = componentId(cap);
    const saved = id !== null && currentIds.get(id) === 1 ? savedCaps.get(id) : null;
    for (const field of ["cost", "cap_name", "stock_length_inches"]) {
      if (saved && Object.prototype.hasOwnProperty.call(saved, field)) result[field] = saved[field];
      else delete result[field];
    }
    return result;
  };
  const caps = (wallCaps || []).map((cap, index) => {
    const id = cap.cap_inventory_id;
    const issue = (field, code, message) => issues.push({
      kind: "wall_cap",
      index,
      componentId: cap.component_id ?? cap.id ?? null,
      field,
      inventoryId: assigned2(id) ? id : null,
      code,
      message: `Wall cap ${index + 1}: ${message}`
    });
    const matches = assigned2(id) ? inventory.filter((row) => row?.id === id) : [];
    if (matches.length !== 1) {
      issue(
        "cap_inventory_id",
        !assigned2(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
        !assigned2(id) ? "select a catalog material." : matches.length > 1 ? "the selected catalog ID is ambiguous; refresh the catalog." : "selected catalog material is unavailable."
      );
      return held(cap);
    }
    const inv = matches[0];
    const SUPPORTED_PROFILES = ["flat", "sloped", "beveled", "rounded"];
    const SUPPORTED_SLOPES = ["flat", "single", "double"];
    const SUPPORTED_END_TREATMENTS = ["straight", "mitered", "returned"];
    if (cap?.profile != null && cap.profile !== "" && !SUPPORTED_PROFILES.includes(cap.profile)) {
      issue("profile", "wall_cap_profile_unsupported", `profile ${JSON.stringify(cap.profile)} is not a supported cap profile (${SUPPORTED_PROFILES.join(", ")}).`);
    }
    if (cap?.slope != null && cap.slope !== "" && !SUPPORTED_SLOPES.includes(cap.slope)) {
      issue("slope", "wall_cap_slope_unsupported", `slope ${JSON.stringify(cap.slope)} is not a supported cap slope (${SUPPORTED_SLOPES.join(", ")}).`);
    }
    if (cap?.end_treatment != null && cap.end_treatment !== "" && !SUPPORTED_END_TREATMENTS.includes(cap.end_treatment)) {
      issue("end_treatment", "wall_cap_end_treatment_unsupported", `end treatment ${JSON.stringify(cap.end_treatment)} is not a supported cap end treatment (${SUPPORTED_END_TREATMENTS.join(", ")}).`);
    }
    if (inv.material_type !== "wall_cap") {
      issue("cap_inventory_id", "catalog_item_type_mismatch", "the selected catalog material is not a wall cap.");
      return held(cap);
    }
    const availability = foundationCatalogRowAvailability(inv);
    if (availability !== "active") {
      issue(
        "cap_inventory_id",
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted" ? "the selected catalog material is marked deleted \xE2\u20AC\u201D pick a replacement." : "the selected catalog material is inactive \xE2\u20AC\u201D reactivate it or pick a replacement."
      );
      return held(cap);
    }
    const firstIssue = issues.length;
    const rate = inventoryFiniteNumber(inv.cap_stock_price);
    if (rate === null || rate < 0) {
      issue(
        "cap_stock_price",
        "wall_cap_stock_price_unavailable",
        "record a finite nonnegative full-stock price; a missing price is not zero. Saved amounts are retained."
      );
    }
    const stockLength = inventoryFiniteNumber(inv.cap_stock_length_inches);
    const cutLength = inventoryFiniteNumber(wallCapCutLengthValue(cap));
    if (stockLength === null || stockLength <= 0) {
      issue(
        "cap_stock_length_inches",
        "wall_cap_stock_length_unavailable",
        "the selected catalog stock length must be a recorded finite positive number. Saved dimensions are not a current stock specification."
      );
    }
    if (cutLength === null || cutLength <= 0) {
      issue(
        "length_inches",
        "wall_cap_cut_length_invalid",
        "enter a finite positive cut length in inches. An empty or invalid cut is not changed to a default size."
      );
    } else if (stockLength !== null && stockLength > 0 && cutLength > stockLength) {
      issue(
        "length_inches",
        "wall_cap_cut_exceeds_stock",
        `cut length (${cutLength} in) exceeds the selected stock length (${stockLength} in). Choose longer stock or separate pieces; no extra quantity is assumed.`
      );
    }
    if (issues.length !== firstIssue) return held(cap);
    let extras = 0;
    let extrasInvalid = false;
    for (const p of [cap?.supplies_cost, cap?.cut_labor_cost]) {
      if (p == null || p === "") continue;
      const n = Number(p);
      if (!(Number.isFinite(n) && n >= 0)) {
        extrasInvalid = true;
        break;
      }
      extras += n;
    }
    if (extrasInvalid) return held(cap);
    return {
      ...cap,
      cap_name: inv.material_name || "",
      stock_length_inches: stockLength,
      supplies_cost: cap?.supplies_cost != null && cap.supplies_cost !== "" ? Number(cap.supplies_cost) : void 0,
      cut_labor_cost: cap?.cut_labor_cost != null && cap.cut_labor_cost !== "" ? Number(cap.cut_labor_cost) : void 0,
      cost: rate + extras,
      // O-053 (CMP-D10) -- the reusable offcut after the cut: stockLength -
      // cutLength. Informational only -- the priced contract stays full-stock
      // per cut; the offcut surfaces for the reuse alternative, never priced.
      offcut_inches: stockLength !== null && stockLength > 0 && cutLength !== null && cutLength > 0 && cutLength <= stockLength ? stockLength - cutLength : null
    };
  });
  const groups = /* @__PURE__ */ new Map();
  for (const cap of caps) {
    if (!assigned2(cap.cap_inventory_id)) continue;
    if (!groups.has(cap.cap_inventory_id)) groups.set(cap.cap_inventory_id, []);
    groups.get(cap.cap_inventory_id).push(cap);
  }
  const byInventory = [...groups].map(([id, rows]) => ({
    id,
    name: rows[0].cap_name,
    qty: rows.length,
    cost: sumKnown(rows)
  }));
  const total = sumKnown(caps);
  if (total === null && caps.every((cap) => known(cap.cost))) {
    issues.push({
      kind: "wall_cap",
      index: 0,
      componentId: caps[0]?.component_id ?? caps[0]?.id ?? null,
      field: "cost",
      inventoryId: null,
      code: "wall_cap_cost_total_invalid",
      message: "Wall cap total is outside the supported numeric range; current pricing is unavailable."
    });
  }
  return { caps, byInventory, total, issues };
}
function foundationWallCapCatalogIssues(wallCaps = [], inventory = []) {
  return calcWallCaps(wallCaps, inventory).issues;
}

// src/components/estimator/foundation/foundationCatalogIntegrity.js
function foundationCatalogRowAvailability(row) {
  if (!row) return "unavailable";
  if (row.deleted === true) return "deleted";
  if (row.show_in_foundation === false) return "inactive";
  return "active";
}
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
    if (row && row.show_in_foundation === false) {
      add(field, id, label, "catalog_item_inactive");
      return;
    }
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
function foundationAssemblyCatalogIssues(project, inventory = []) {
  const available = new Set(inventory.map((row) => row.id));
  const issues = [];
  const check = (row, index, kind, field, label) => {
    const id = row[field];
    const assigned3 = typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
    if (assigned3 && available.has(id)) return;
    issues.push({
      kind,
      index,
      componentId: row.component_id ?? row.id ?? null,
      field,
      inventoryId: assigned3 ? id : null,
      code: assigned3 ? "catalog_item_unavailable" : "catalog_item_unassigned",
      message: `${label} ${index + 1}: ${assigned3 ? "selected catalog material is unavailable" : "select a catalog material"}.`
    });
  };
  for (const [index, pole] of (project?.poles || []).entries()) {
    check(pole, index, "pole", "pole_id", "Pole");
  }
  for (const [index, wall] of (project?.walls || []).entries()) {
    check(wall, index, "wall", "materialId", "Wall");
    if (wall.includeInternalWall) {
      check(wall, index, "internal_wall", "internalMaterialId", "Internal wall");
    }
  }
  return [
    ...issues,
    ...foundationWallCapCatalogIssues(project?.wall_caps || [], inventory),
    ...(project?.items || []).flatMap((item, index) => foundationItemCatalogIssues(item, inventory, index)),
    ...foundationEquipmentCatalogIssues(project?.selected_equipment || [], inventory)
  ];
}
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// src/components/estimator/foundation/wallCalculator.js
var CUBIC_INCHES_PER_CUBIC_YARD = 46656;
var POURED_CONCRETE_UNIT_BASIS = /* @__PURE__ */ new Set([
  "cy",
  "cyd",
  "cy_d",
  "yd",
  "yd3",
  "cu_yd",
  "cubic_yard",
  "cubic_yards",
  "yard",
  "yards"
]);
function calcWallCosts({ wall, wallShape, wallMaterial, internalMaterial, includeInternalWall, wallHeightInches, internalWallHeightInches, mortarGapInches, internalMortarGapInches, wasteFraction, settings }) {
  if (!wallShape || !wallMaterial || !wallShape.segments) return null;
  const waste = Number.isFinite(wasteFraction) && wasteFraction > 0 ? wasteFraction : 0;
  const isConcrete = canonicalWallMaterialSubtype(wallMaterial.wall_material_subtype) === "concrete";
  const unitL = wallMaterial.wall_unit_length_inches || 8;
  const unitW = wallMaterial.wall_unit_width_inches || 4;
  const unitH = wallMaterial.wall_unit_height_inches || 2.25;
  const mortar = isConcrete ? 0 : mortarGapInches;
  const courseH = unitH + mortar;
  const numCourses = isConcrete ? 0 : wallHeightInches / courseH;
  const brickPitch = unitL + (isConcrete ? 0 : mortar);
  const totalLinearInches = wallShape.segments.reduce((s, seg) => s + seg.length, 0);
  const grossSqFt = totalLinearInches * wallHeightInches / 144;
  const openings = Array.isArray(wall?.openings) ? wall.openings : [];
  const openingsValid = openings.every((o) => {
    const ow = Number(o?.width_inches), oh = Number(o?.height_inches);
    return Number.isFinite(ow) && ow > 0 && Number.isFinite(oh) && oh > 0;
  });
  const openSqFt = !openingsValid ? 0 : openings.reduce((s, o) => s + Number(o.width_inches) * Number(o.height_inches) / 144, 0);
  let totalBricks = 0;
  if (isConcrete) {
    totalBricks = totalLinearInches * wallHeightInches * unitW / CUBIC_INCHES_PER_CUBIC_YARD;
  } else {
    const numCoursesRounded = Math.ceil(numCourses);
    const bond = Number.isFinite(Number(wall?.bond_fraction)) && Number(wall.bond_fraction) > 0 && Number(wall.bond_fraction) < 1 ? Number(wall.bond_fraction) : 0;
    const staggeredBricks = bond > 0 && numCoursesRounded > 1 ? numCoursesRounded - 1 : 0;
    wallShape.segments.forEach((seg) => {
      const bricksThisCourse = Math.ceil(seg.length / brickPitch);
      totalBricks += bricksThisCourse * numCoursesRounded + staggeredBricks;
    });
  }
  if (isConcrete) {
    totalBricks -= openSqFt * (unitW / 12) / 27;
  } else {
    const bricksPerSqFt = grossSqFt > 0 ? totalBricks / grossSqFt : 0;
    totalBricks = Math.max(0, totalBricks - Math.ceil(openSqFt * bricksPerSqFt));
  }
  totalBricks = isConcrete ? totalBricks * (1 + waste) : Math.ceil(totalBricks * (1 + waste));
  const finalBricks = wallMaterial.custom_outer_material_qty !== void 0 && wallMaterial.custom_outer_material_qty !== null ? wallMaterial.custom_outer_material_qty : totalBricks;
  const materialCost = finalBricks * (wallMaterial.custom_cost_per_unit !== void 0 && wallMaterial.custom_cost_per_unit !== null ? wallMaterial.custom_cost_per_unit : wallMaterial.cost_per_unit || 0);
  const surfaceAreaSqFtSingleSide = Math.max(0, grossSqFt - openSqFt) * (1 + waste);
  let mortarCost = 0;
  let mortarBags = 0;
  if (!isConcrete) {
    const surfaceAreaSqFtMortar = surfaceAreaSqFtSingleSide * 2;
    mortarBags = Math.ceil(surfaceAreaSqFtMortar / 30);
    const finalMortarBags = wallMaterial.custom_outer_mortar_qty !== void 0 && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags;
    const mortarCostPerBag = parseFloat(inventorySettingValue(settings?.wall_mortar_cost_per_bag, 10));
    const finalMortarRate = wallMaterial.custom_outer_mortar_rate !== void 0 && wallMaterial.custom_outer_mortar_rate !== null ? wallMaterial.custom_outer_mortar_rate : mortarCostPerBag;
    mortarCost = finalMortarBags * finalMortarRate;
  }
  const laborRatePerSqFt = wallMaterial.custom_outer_labor_rate !== void 0 && wallMaterial.custom_outer_labor_rate !== null ? wallMaterial.custom_outer_labor_rate : parseFloat(inventorySettingValue(settings?.wall_labor_rate, 45));
  const minCharge = parseFloat(inventorySettingValue(settings?.wall_minimum_charge, 150));
  let laborCost = surfaceAreaSqFtSingleSide * laborRatePerSqFt;
  if (laborCost < minCharge) {
    laborCost = minCharge;
  }
  const laborHours = isConcrete ? 0 : finalBricks / parseFloat(inventorySettingValue(settings?.wall_labor_bricks_per_hour, 50));
  let internalTotalBricks = 0;
  let internalMaterialCost = 0;
  let internalMortarCost = 0;
  let internalLaborCost = 0;
  let internalLaborHours = 0;
  let internalTotalLinearInches = 0;
  let intIsConcrete = false;
  if (includeInternalWall && internalMaterial) {
    intIsConcrete = canonicalWallMaterialSubtype(internalMaterial.wall_material_subtype) === "concrete";
    const intUnitL = internalMaterial.wall_unit_length_inches || 8;
    const intUnitW = internalMaterial.wall_unit_width_inches || 4;
    const intUnitH = internalMaterial.wall_unit_height_inches || 2.25;
    const intMortar = intIsConcrete ? 0 : internalMortarGapInches ?? 0.375;
    const intCourseH = intUnitH + intMortar;
    const intNumCourses = Math.ceil(internalWallHeightInches / intCourseH);
    const intBrickPitch = intUnitL + intMortar;
    const isClosed = wallShape.closed !== false;
    const lengthReduction = isClosed ? unitW + intUnitW : 0;
    wallShape.segments.forEach((seg) => {
      const innerSegLength = Math.max(0, seg.length - lengthReduction);
      internalTotalLinearInches += innerSegLength;
      if (intIsConcrete) {
        internalTotalBricks += innerSegLength * internalWallHeightInches * intUnitW / CUBIC_INCHES_PER_CUBIC_YARD;
      } else {
        const bricksThisCourse = Math.ceil(innerSegLength / intBrickPitch);
        internalTotalBricks += bricksThisCourse * intNumCourses;
      }
    });
    const finalInternalBricks = wall.custom_internal_material_qty !== void 0 && wall.custom_internal_material_qty !== null ? wall.custom_internal_material_qty : internalTotalBricks;
    internalMaterialCost = finalInternalBricks * (wall.custom_internal_material_cost_per_unit !== void 0 && wall.custom_internal_material_cost_per_unit !== null ? wall.custom_internal_material_cost_per_unit : internalMaterial.cost_per_unit || 0);
    const intSurfaceAreaSqFtSingleSide = internalTotalLinearInches * internalWallHeightInches / 144;
    let internalMortarBags = 0;
    if (!intIsConcrete) {
      const intSurfaceAreaSqFtMortar = intSurfaceAreaSqFtSingleSide * 2;
      internalMortarBags = Math.ceil(intSurfaceAreaSqFtMortar / 30);
      const finalInternalMortarBags = wall.custom_internal_mortar_qty !== void 0 && wall.custom_internal_mortar_qty !== null ? wall.custom_internal_mortar_qty : internalMortarBags;
      const internalMortarCostPerBag = parseFloat(inventorySettingValue(settings?.wall_mortar_cost_per_bag, 10));
      const finalInternalMortarRate = wall.custom_internal_mortar_rate !== void 0 && wall.custom_internal_mortar_rate !== null ? wall.custom_internal_mortar_rate : internalMortarCostPerBag;
      internalMortarCost = finalInternalMortarBags * finalInternalMortarRate;
    }
    const internalLaborRatePerSqFt = wall.custom_internal_labor_rate !== void 0 && wall.custom_internal_labor_rate !== null ? wall.custom_internal_labor_rate : parseFloat(inventorySettingValue(settings?.wall_labor_rate, 45));
    internalLaborCost = intSurfaceAreaSqFtSingleSide * internalLaborRatePerSqFt;
    internalLaborHours = intIsConcrete ? 0 : finalInternalBricks / parseFloat(inventorySettingValue(settings?.wall_labor_bricks_per_hour, 50));
  }
  return {
    totalBricks,
    finalBricks,
    materialCost,
    mortarBags,
    finalMortarBags: !isConcrete ? wallMaterial.custom_outer_mortar_qty !== void 0 && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags : 0,
    mortarCost,
    laborHours,
    laborRatePerSqFt,
    laborCost,
    totalCost: materialCost + mortarCost + laborCost + internalMaterialCost + internalMortarCost + internalLaborCost,
    totalLinearInches,
    numCourses,
    internalTotalBricks,
    internalMaterialCost,
    internalMortarBags: includeInternalWall && internalMaterial && !intIsConcrete ? Math.ceil(internalTotalLinearInches * internalWallHeightInches / 144 * 2 / 30) : 0,
    internalMortarCost,
    internalLaborCost,
    internalLaborHours
  };
}
var assignedId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var WALL_MORTAR_GAP_DEFAULT = 0.375;
var wallMortarGapNumber = (value) => value === void 0 || value === null || value === "" ? WALL_MORTAR_GAP_DEFAULT : inventoryNonnegativeNumber(value);
var wallRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var wallPoint = (point) => wallRecord(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.z === "number" && Number.isFinite(point.z);
function foundationWallSegments(points, closed = false) {
  if (!Array.isArray(points) || !points.every(wallPoint) || typeof closed !== "boolean") return null;
  const segments = [];
  const add = (a, b) => segments.push({ length: Math.hypot(b.x - a.x, b.z - a.z) });
  for (let i = 0; i < points.length - 1; i++) add(points[i], points[i + 1]);
  if (closed && points.length > 2) add(points[points.length - 1], points[0]);
  return segments.every((segment) => Number.isFinite(segment.length)) ? segments : null;
}
function foundationWallOutlineBasis(shape) {
  const result = {
    shape: null,
    points: [],
    closed: shape?.closed === true,
    hasRecordedPoints: false,
    perimeterInches: null,
    issues: []
  };
  const add = (code, message) => result.issues.push({ code, message });
  const unavailable = () => add("wall_outline_unavailable", "draw an outline with positive segment lengths before repricing");
  if (!wallRecord(shape)) {
    unavailable();
    return result;
  }
  result.hasRecordedPoints = shape.points != null && (!Array.isArray(shape.points) || shape.points.length > 0);
  const validPoints = Array.isArray(shape.points) && shape.points.every(wallPoint);
  if (validPoints) result.points = shape.points.map((point) => ({ ...point }));
  if (result.hasRecordedPoints && !validPoints) {
    add("wall_outline_points_unavailable", "repair the recorded footprint coordinates before repricing");
  }
  if ((shape.closed != null || result.hasRecordedPoints) && typeof shape.closed !== "boolean") {
    add("wall_outline_closure_unavailable", "record whether the outline is open or closed before repricing");
  }
  let segments = null;
  if (!Array.isArray(shape.segments) || !shape.segments.length) {
    unavailable();
  } else {
    const lengths = shape.segments.map((segment) => wallRecord(segment) ? inventoryPositiveNumber(segment.length) : null);
    if (lengths.some((length) => length === null)) {
      add("wall_outline_segment_unavailable", "record positive, finite segment lengths in inches before repricing");
    } else {
      segments = shape.segments.map((segment, index) => ({ ...segment, length: lengths[index] }));
      if (!Number.isFinite(lengths.reduce((sum, length) => sum + length, 0))) {
        add("wall_outline_length_unavailable", "record a finite outline perimeter before repricing");
      }
    }
  }
  if (segments && result.hasRecordedPoints && validPoints && typeof shape.closed === "boolean") {
    const expected = foundationWallSegments(result.points, shape.closed);
    const same = result.points.length >= (shape.closed ? 3 : 2) && expected && expected.length === segments.length && expected.every((segment, index) => {
      const stored = segments[index].length;
      const tolerance = Number.EPSILON * 8 * Math.max(1, segment.length, stored);
      return segment.length > 0 && Math.abs(segment.length - stored) <= tolerance;
    });
    if (!same) add("wall_outline_geometry_mismatch", "repair footprint points and segment lengths so they describe the same outline before repricing");
  }
  if (!result.issues.length) {
    result.shape = { ...shape, segments };
    if (validPoints) result.shape.points = result.points;
    result.perimeterInches = segments.reduce((sum, segment) => sum + segment.length, 0);
  }
  return result;
}
var WALL_SETTING_DEFAULTS = {
  wall_mortar_cost_per_bag: 10,
  wall_labor_rate: 45,
  wall_minimum_charge: 150,
  wall_labor_bricks_per_hour: 50
};
var WALL_OUTER_OVERRIDE_FIELDS = [
  ["custom_outer_material_qty", "material quantity"],
  ["custom_outer_labor_rate", "labor rate"]
];
var WALL_OUTER_MORTAR_OVERRIDE_FIELDS = [
  ["custom_outer_mortar_qty", "mortar quantity"],
  ["custom_outer_mortar_rate", "mortar rate"]
];
var WALL_INTERNAL_OVERRIDE_FIELDS = [
  ["custom_internal_material_qty", "material quantity"],
  ["custom_internal_labor_rate", "labor rate"]
];
var WALL_INTERNAL_MORTAR_OVERRIDE_FIELDS = [
  ["custom_internal_mortar_qty", "mortar quantity"],
  ["custom_internal_mortar_rate", "mortar rate"]
];
function wallPricing(wall, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const heightInches = inventoryPositiveNumber(wall?.heightInches);
  const internalWallHeightInches = wall?.includeInternalWall ? inventoryPositiveNumber(wall.internalWallHeightInches ?? wall.heightInches) : null;
  const heightIssue = (field, kind, label, code) => issues.push({
    kind,
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field,
    inventoryId: wall?.[kind === "wall" ? "materialId" : "internalMaterialId"] ?? null,
    code,
    message: `${label} ${index + 1}: record a positive, finite wall height in inches before repricing.`
  });
  if (heightInches === null) heightIssue("heightInches", "wall", "Wall", "wall_height_unavailable");
  if (wall?.includeInternalWall && internalWallHeightInches === null) {
    heightIssue("internalWallHeightInches", "internal_wall", "Internal wall", "internal_wall_height_unavailable");
  }
  const outline = foundationWallOutlineBasis(wall?.shape);
  issues.push(...outline.issues.map((issue) => ({
    ...issue,
    kind: "wall",
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field: "shape",
    inventoryId: wall?.materialId ?? null,
    message: `Wall ${index + 1}: ${issue.message}.`
  })));
  const check = (field, kind, label) => {
    const id = wall?.[field];
    const add2 = (code, message) => issues.push({
      kind,
      index,
      componentId: wall?.component_id ?? wall?.id ?? null,
      field,
      inventoryId: assignedId(id) ? id : null,
      code,
      message: `${label} ${index + 1}: ${message}.`
    });
    if (!assignedId(id)) {
      add2("catalog_item_unassigned", "select a catalog material");
      return null;
    }
    const matches = inventory.filter((row) => row?.id === id);
    if (!matches.length) {
      add2("catalog_item_unavailable", "selected catalog material is unavailable");
      return null;
    }
    if (matches.length !== 1) {
      add2("catalog_item_ambiguous", "selected catalog material is ambiguous");
      return null;
    }
    const material = matches[0];
    if (!["brick_stone", "wall_material"].includes(material.material_type)) {
      add2("catalog_item_type_mismatch", "selected catalog material is not a wall material");
      return null;
    }
    const availability = foundationCatalogRowAvailability(material);
    if (availability !== "active") {
      add2(
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted" ? "selected catalog material is marked deleted \xE2\u20AC\u201D pick a replacement" : "selected catalog material is inactive \xE2\u20AC\u201D reactivate it or pick a replacement"
      );
      return null;
    }
    const override = kind === "wall" ? material.custom_cost_per_unit : wall.custom_internal_material_cost_per_unit;
    const price = override !== void 0 && override !== null ? override : material.cost_per_unit;
    if (inventoryNonnegativeNumber(price) === null) {
      add2("wall_material_price_unavailable", "record a finite, nonnegative material unit price before repricing");
    }
    const subtype = canonicalWallMaterialSubtype(material.wall_material_subtype);
    if (wallMaterialSubtypeRecorded(material.wall_material_subtype) && subtype === null) {
      add2(
        "wall_material_subtype_unavailable",
        "record a supported wall material subtype (brick, cinderblock / CMU, stone, or poured concrete) before repricing"
      );
      return null;
    }
    const pouredConcrete = subtype === "concrete";
    if (pouredConcrete) {
      const recordedUnit = material.unit;
      const unitRecorded = recordedUnit !== void 0 && recordedUnit !== null && (typeof recordedUnit !== "string" || recordedUnit.trim() !== "");
      if (unitRecorded) {
        const unitKey = typeof recordedUnit === "string" ? recordedUnit.trim().toLowerCase().replace(/[\s\-_.]+/g, "_").replace(/^_+|_+$/g, "") : String(recordedUnit);
        if (!POURED_CONCRETE_UNIT_BASIS.has(unitKey)) {
          add2(
            "wall_material_unit_mismatch",
            "poured concrete is priced per cubic yard \xE2\u20AC\u201D record the unit as CY (or clear it) so the cost basis is unambiguous before repricing"
          );
        }
      }
    }
    const normalizedMaterial = { ...material };
    if (subtype !== null) normalizedMaterial.wall_material_subtype = subtype;
    for (const [key, label2] of pouredConcrete ? [["wall_unit_width_inches", "wall thickness"]] : [["wall_unit_length_inches", "unit length"], ["wall_unit_width_inches", "unit width"], ["wall_unit_height_inches", "unit height"]]) {
      const dimension = inventoryPositiveNumber(material[key]);
      if (dimension === null) {
        add2(key + "_unavailable", `record a positive, finite ${label2} in inches before repricing`);
      } else {
        normalizedMaterial[key] = dimension;
      }
    }
    return normalizedMaterial;
  };
  const wallMaterial = check("materialId", "wall", "Wall");
  const internalMaterial = wall?.includeInternalWall ? check("internalMaterialId", "internal_wall", "Internal wall") : null;
  const add = (kind, field, inventoryId, code, message) => issues.push({
    kind,
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field,
    inventoryId: inventoryId ?? null,
    code,
    message: `${kind === "internal_wall" ? "Internal wall" : "Wall"} ${index + 1}: ${message}.`
  });
  const overrideCheck = (source, fields, kind, inventoryId) => {
    for (const [field, label] of fields) {
      const raw = source?.[field];
      if (raw === void 0 || raw === null) continue;
      const value = inventoryNonnegativeNumber(raw);
      if (value === null) {
        add(
          kind,
          field,
          inventoryId,
          field + "_unavailable",
          `record a finite, nonnegative ${label} override or clear it before repricing`
        );
      } else {
        source[field] = value;
      }
    }
  };
  const settingCheck = (key, label, positive4) => {
    const value = positive4 ? inventoryPositiveSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]) : inventorySettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]);
    if (value === null) {
      add(
        "wall",
        key,
        wall?.materialId,
        "wall_setting_unavailable",
        `record a finite, ${positive4 ? "positive" : "nonnegative"} ${label} in Estimator Settings before repricing`
      );
    }
    return value;
  };
  const outerConcrete = wallMaterial?.wall_material_subtype === "concrete";
  const intConcrete = internalMaterial?.wall_material_subtype === "concrete";
  const calcWall = wall?.includeInternalWall && internalMaterial ? { ...wall } : wall;
  let mortarGapInches = WALL_MORTAR_GAP_DEFAULT;
  let internalMortarGapInches = WALL_MORTAR_GAP_DEFAULT;
  if (wallMaterial) {
    overrideCheck(wallMaterial, WALL_OUTER_OVERRIDE_FIELDS, "wall", wall?.materialId);
    settingCheck("wall_labor_rate", "wall labor rate");
    settingCheck("wall_minimum_charge", "wall minimum labor charge");
    if (!outerConcrete || internalMaterial && !intConcrete) {
      settingCheck("wall_labor_bricks_per_hour", "wall production rate", true);
    }
    if (!outerConcrete) {
      mortarGapInches = wallMortarGapNumber(wall?.mortarGapInches);
      if (mortarGapInches === null) {
        add(
          "wall",
          "mortarGapInches",
          wall?.materialId,
          "wall_mortar_gap_unavailable",
          "record a finite, nonnegative mortar gap in inches before repricing"
        );
      }
      overrideCheck(wallMaterial, WALL_OUTER_MORTAR_OVERRIDE_FIELDS, "wall", wall?.materialId);
    }
  }
  if (wall?.includeInternalWall && internalMaterial) {
    overrideCheck(calcWall, WALL_INTERNAL_OVERRIDE_FIELDS, "internal_wall", wall?.internalMaterialId);
    if (!intConcrete) {
      internalMortarGapInches = wallMortarGapNumber(wall?.internalMortarGapInches);
      if (internalMortarGapInches === null) {
        add(
          "internal_wall",
          "internalMortarGapInches",
          wall?.internalMaterialId,
          "internal_wall_mortar_gap_unavailable",
          "record a finite, nonnegative mortar gap in inches before repricing"
        );
      }
      overrideCheck(calcWall, WALL_INTERNAL_MORTAR_OVERRIDE_FIELDS, "internal_wall", wall?.internalMaterialId);
    }
  }
  if (wallMaterial && !outerConcrete || internalMaterial && !intConcrete) {
    settingCheck("wall_mortar_cost_per_bag", "mortar cost per bag");
  }
  return {
    issues,
    wallMaterial,
    internalMaterial,
    heightInches,
    internalWallHeightInches,
    wallShape: outline.shape,
    calcWall,
    mortarGapInches,
    internalMortarGapInches
  };
}
function calcWalls(project, inventory, settings = {}, options = {}) {
  const walls = project.walls || [];
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedWalls");
  const savedWalls = Array.isArray(options?.savedWalls) ? options.savedWalls : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(walls), savedCounts = counts(savedWalls);
  const savedById = new Map(savedWalls.filter((row) => assignedId(row?.component_id)).map((row) => [row.component_id, row]));
  const held = (wall) => {
    const id = wall?.component_id;
    const acknowledged = explicitSnapshot ? assignedId(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null : wall;
    const costs = acknowledged?.calculatedCosts;
    return {
      ...wall,
      calculatedCosts: costs && typeof costs === "object" && !Array.isArray(costs) ? { ...costs } : {}
    };
  };
  const results = walls.map((wall, index) => wallPricing(wall, inventory, index, settings));
  return {
    walls: results.map((check, index) => {
      const wall = walls[index];
      if (check.issues.length) return held(wall);
      const {
        wallMaterial,
        internalMaterial,
        heightInches,
        internalWallHeightInches,
        wallShape,
        calcWall,
        mortarGapInches,
        internalMortarGapInches
      } = check;
      const costs = calcWallCosts({
        wall: calcWall ?? wall,
        wallShape,
        wallMaterial,
        internalMaterial,
        includeInternalWall: wall.includeInternalWall,
        wallHeightInches: heightInches,
        internalWallHeightInches,
        mortarGapInches,
        internalMortarGapInches,
        wasteFraction: wall.wasteFraction,
        settings
      }) || {};
      return {
        ...wall,
        calculatedCosts: {
          // ?? keeps an accidental NaN visible instead of laundering it to $0.
          totalBricks: costs.finalBricks ?? 0,
          materialCost: costs.materialCost ?? 0,
          mortarCost: costs.mortarCost ?? 0,
          laborHours: costs.laborHours ?? 0,
          laborCost: costs.laborCost ?? 0,
          totalCost: costs.totalCost ?? 0,
          totalLinearInches: costs.totalLinearInches ?? 0,
          numCourses: costs.numCourses ?? 0,
          internalTotalBricks: costs.internalTotalBricks ?? 0,
          internalMaterialCost: costs.internalMaterialCost ?? 0,
          internalMortarCost: costs.internalMortarCost ?? 0,
          internalLaborCost: costs.internalLaborCost ?? 0,
          internalLaborHours: costs.internalLaborHours ?? 0,
          // CMP-D03: poured-concrete walls carry the quantity basis on the
          // snapshot ("cy" placed volume, vs the unit-masonry count) so saved
          // rows, BOM and Builder parts can label the quantity honestly. Unit
          // masonry is untouched â€” no extra keys on unchanged paths.
          ...wallMaterial?.wall_material_subtype === "concrete" ? { materialQuantityUnit: "cy" } : {},
          ...wall.includeInternalWall && internalMaterial?.wall_material_subtype === "concrete" ? { internalMaterialQuantityUnit: "cy" } : {}
        }
      };
    }),
    wallPricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues }))
  };
}

// src/components/estimator/foundation/poleCalculator.js
var assignedId2 = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var setting = (settings, key, def) => parseFloat(inventorySettingValue(settings?.[key], def));
var POLE_PAINT_SETTING_DEFAULTS = {
  pole_paint_cost_per_lf: 3.5,
  pole_paint_labor_per_lf: 2.5,
  pole_paint_size_multiplier_12in: 2,
  pole_paint_size_multiplier_10in: 1.75,
  pole_paint_size_multiplier_8in: 1.5,
  pole_paint_size_multiplier_6in: 1.25,
  pole_paint_size_multiplier_4in: 1
};
var polePaintMultiplierKey = (widthInches) => {
  const w = widthInches === null ? 6 : widthInches;
  if (w >= 12) return "pole_paint_size_multiplier_12in";
  if (w >= 10) return "pole_paint_size_multiplier_10in";
  if (w >= 8) return "pole_paint_size_multiplier_8in";
  if (w >= 6) return "pole_paint_size_multiplier_6in";
  return "pole_paint_size_multiplier_4in";
};
var getPolePaintingSizeMultiplier = (inv, settings) => {
  const w = inv?.pole_width_inches || 6;
  if (w >= 12) return setting(settings, "pole_paint_size_multiplier_12in", 2);
  if (w >= 10) return setting(settings, "pole_paint_size_multiplier_10in", 1.75);
  if (w >= 8) return setting(settings, "pole_paint_size_multiplier_8in", 1.5);
  if (w >= 6) return setting(settings, "pole_paint_size_multiplier_6in", 1.25);
  return setting(settings, "pole_paint_size_multiplier_4in", 1);
};
var calcPolePaintingCost = (p, inv, settings) => {
  if (!p.include_pole_painting || !inv) return 0;
  const heightFt = ((p.height_inches || 0) + (p.y_offset_inches || 0)) / 12;
  const paintCostPerLf = setting(settings, "pole_paint_cost_per_lf", 3.5);
  const paintLaborPerLf = setting(settings, "pole_paint_labor_per_lf", 2.5);
  const sizeMult = getPolePaintingSizeMultiplier(inv, settings);
  return heightFt * (paintCostPerLf + paintLaborPerLf) * sizeMult;
};
var POLE_SHAPE_VALUES = ["round", "square", "rectangular", "elliptical", "other"];
var recorded = (v) => v !== void 0 && v !== null && v !== "";
function foundationPoleGeometry(pole, inv = null) {
  const p = pole ?? {};
  const problems = [];
  const add = (field, code, message) => problems.push({ field, code, message });
  const height = inventoryPositiveNumber(p.height_inches);
  const heightSource = height !== null ? "height_inches" : "unavailable";
  if (height === null) {
    add(
      "height_inches",
      "pole_height_unavailable",
      "record a positive, finite height above grade in inches before repricing"
    );
  }
  const canonEmbedRaw = p.embedment_inches;
  const legacyEmbedRaw = p.y_offset_inches;
  const canonEmbedPresent = recorded(canonEmbedRaw);
  const legacyEmbedPresent = recorded(legacyEmbedRaw);
  let embedment = null;
  let embedmentSource = "unavailable";
  if (canonEmbedPresent) {
    embedment = inventoryNonnegativeMeasurement(canonEmbedRaw);
    if (embedment === null) {
      add(
        "embedment_inches",
        "pole_embedment_unavailable",
        "record a finite, nonnegative embedment below grade in inches before repricing"
      );
    } else {
      embedmentSource = "embedment_inches";
    }
  }
  if (legacyEmbedPresent) {
    const legacy = inventoryNonnegativeMeasurement(legacyEmbedRaw);
    if (!canonEmbedPresent) {
      embedment = legacy;
      if (legacy === null) {
        add(
          "y_offset_inches",
          "pole_depth_unavailable",
          "record a finite, nonnegative depth in ground in inches before repricing"
        );
      } else {
        embedmentSource = "y_offset_inches";
      }
    } else if (embedment !== null && legacy !== null && legacy !== embedment) {
      add(
        "embedment_inches",
        "pole_embedment_conflict",
        "embedment and legacy depth-in-ground record different values \xE2\u20AC\u201D clear one before repricing"
      );
    }
  }
  if (!canonEmbedPresent && !legacyEmbedPresent) {
    add(
      "y_offset_inches",
      "pole_depth_unavailable",
      "record a finite, nonnegative depth in ground in inches before repricing"
    );
  }
  const baseRaw = p.base_offset_inches;
  let baseOffset = 0;
  let baseSource = "default";
  if (recorded(baseRaw)) {
    baseOffset = inventoryNonnegativeMeasurement(baseRaw);
    if (baseOffset === null) {
      add(
        "base_offset_inches",
        "pole_base_offset_unavailable",
        "record a finite, nonnegative base offset above grade in inches or clear it before repricing"
      );
    } else {
      baseSource = "base_offset_inches";
    }
  }
  const totalRaw = p.total_length_inches;
  let total = null;
  let totalSource = "derived";
  if (recorded(totalRaw)) {
    total = inventoryPositiveNumber(totalRaw);
    if (total === null) {
      add(
        "total_length_inches",
        "pole_total_length_unavailable",
        "record a positive, finite total stock length in inches or clear it before repricing"
      );
    } else {
      totalSource = "total_length_inches";
    }
  }
  let required = null;
  if (totalSource === "total_length_inches" && total !== null) {
    required = total;
    if (height !== null && embedment !== null && total < height + embedment) {
      add(
        "total_length_inches",
        "pole_total_length_conflict",
        "total stock length is shorter than height above grade plus embedment \xE2\u20AC\u201D lengthen it or clear it before repricing"
      );
    }
  } else if (height !== null && embedment !== null) {
    required = height + embedment;
  }
  const authoredShapePresent = recorded(p.pole_shape);
  const shapeRaw = authoredShapePresent ? p.pole_shape : inv?.pole_shape;
  let shape = null;
  let shapeSource = null;
  let shapeKnown = false;
  if (recorded(shapeRaw)) {
    if (typeof shapeRaw !== "string") {
      add(
        "pole_shape",
        "pole_shape_unavailable",
        "recorded pole shape must be a value like round or square \xE2\u20AC\u201D clear or correct it before repricing"
      );
    } else {
      shape = shapeRaw.trim().toLowerCase();
      shapeSource = authoredShapePresent ? "pole_shape" : "catalog";
      shapeKnown = POLE_SHAPE_VALUES.includes(shape);
    }
  }
  const cross_section = inv == null ? null : {
    shape,
    width_inches: inventoryNonnegativeMeasurement(inv.pole_width_inches),
    depth_inches: inventoryNonnegativeMeasurement(inv.pole_depth_inches),
    wall_thickness_inches: inventoryNonnegativeMeasurement(inv.pole_wall_thickness_inches)
  };
  const planOffset = {
    x_inches: inventoryFiniteNumber(p.x_inches) ?? 0,
    z_inches: inventoryFiniteNumber(p.z_inches) ?? 0
  };
  return {
    height_above_grade_inches: height,
    embedment_inches: embedment,
    base_offset_inches: baseOffset,
    plan_offset_inches: planOffset,
    total_length_inches: total,
    required_length_inches: required,
    pole_shape: shape,
    pole_shape_known: shapeKnown,
    cross_section,
    sources: {
      height_above_grade: heightSource,
      embedment: embedmentSource,
      base_offset: baseSource,
      total_length: totalSource,
      shape: shapeSource
    },
    problems
  };
}
var POLE_ORIGIN_LEGACY_ITEM = "legacy_item";
function polePricing(pole, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const id = pole?.pole_id;
  const paint = { costPerLf: null, laborPerLf: null, sizeMultiplier: null };
  const add = (field, code, message) => issues.push({
    kind: "pole",
    index,
    componentId: pole?.component_id ?? pole?.id ?? null,
    field,
    inventoryId: assignedId2(id) ? id : null,
    code,
    message: `Pole ${index + 1}: ${message}.`
  });
  if (pole?.pole_origin === POLE_ORIGIN_LEGACY_ITEM) {
    add(
      "pole_origin",
      "pole_legacy_representation",
      "legacy item-pole data cannot price here \xE2\u20AC\u201D migrate it into the Poles section or remove it"
    );
    return { issues, inv: null, geometry: null, painting: false, rate: null, stockLengthInches: null, widthInches: null, paint };
  }
  let inv = null;
  if (!assignedId2(id)) {
    add("pole_id", "catalog_item_unassigned", "select a catalog material");
  } else {
    const matches = inventory.filter((row) => row?.id === id);
    if (!matches.length) {
      add("pole_id", "catalog_item_unavailable", "selected catalog material is unavailable");
    } else if (matches.length !== 1) {
      add("pole_id", "catalog_item_ambiguous", "selected catalog material is ambiguous");
    } else if (matches[0].material_type !== "pole") {
      add("pole_id", "catalog_item_type_mismatch", "selected catalog material is not a pole");
    } else {
      const availability = foundationCatalogRowAvailability(matches[0]);
      if (availability !== "active") {
        add(
          "pole_id",
          availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
          availability === "deleted" ? "selected catalog material is marked deleted \xE2\u20AC\u201D pick a replacement" : "selected catalog material is inactive \xE2\u20AC\u201D reactivate it or pick a replacement"
        );
      } else {
        inv = matches[0];
      }
    }
  }
  const geometry = foundationPoleGeometry(pole, inv);
  for (const problem of geometry.problems) add(problem.field, problem.code, problem.message);
  const painting = pole?.include_pole_painting === true;
  let rate = null;
  let stockLengthInches = null;
  let widthInches = null;
  if (inv) {
    const override = pole?.custom_cost_per_unit;
    const hasOverride = override !== void 0 && override !== null;
    const stockMode = inv.pole_pricing_mode === "stock_price";
    rate = inventoryNonnegativeNumber(hasOverride ? override : stockMode ? inv.pole_stock_price : inv.cost_per_unit);
    if (rate === null) {
      add(
        hasOverride ? "custom_cost_per_unit" : stockMode ? "pole_stock_price" : "cost_per_unit",
        "pole_price_unavailable",
        "record a finite, nonnegative pole price before repricing"
      );
    }
    if (stockMode) {
      const stockLengthFt = inventoryPositiveSettingNumber(inv.pole_stock_length_ft, 20);
      if (stockLengthFt === null) {
        add(
          "pole_stock_length_ft",
          "pole_stock_length_unavailable",
          "the selected catalog stock length must be a recorded finite positive number"
        );
      } else {
        stockLengthInches = stockLengthFt * 12;
      }
    }
    if (painting) {
      widthInches = inventoryPositiveSettingNumber(inv.pole_width_inches, 6);
      if (widthInches === null) {
        add(
          "pole_width_inches",
          "pole_width_unavailable",
          "the selected catalog pole width must be a recorded finite positive number"
        );
      }
      const paintSetting = (key, label) => {
        const value = inventorySettingNumber(settings?.[key], POLE_PAINT_SETTING_DEFAULTS[key]);
        if (value === null) {
          add(
            key,
            "pole_paint_setting_unavailable",
            `record a finite, nonnegative ${label} before repricing`
          );
        }
        return value;
      };
      paint.costPerLf = paintSetting("pole_paint_cost_per_lf", "pole paint cost per LF");
      paint.laborPerLf = paintSetting("pole_paint_labor_per_lf", "pole paint labor per LF");
      paint.sizeMultiplier = paintSetting(polePaintMultiplierKey(widthInches), "pole paint size multiplier");
    }
  }
  return { issues, inv, geometry, painting, rate, stockLengthInches, widthInches, paint };
}
function calcPoles(poles = [], inventory = [], settings = {}, options = {}) {
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedPoles");
  const savedPoles = Array.isArray(options?.savedPoles) ? options.savedPoles : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId2(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(poles), savedCounts = counts(savedPoles);
  const savedById = new Map(savedPoles.filter((row) => assignedId2(row?.component_id)).map((row) => [row.component_id, row]));
  const held = (pole) => {
    const id = pole?.component_id;
    const acknowledged = explicitSnapshot ? assignedId2(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null : pole;
    const result = { ...pole };
    if (explicitSnapshot) {
      for (const field of [
        "pole_name",
        "pole_cost",
        "pole_painting_cost",
        "total_cost",
        "required_length_inches",
        "stock_pieces"
      ]) {
        if (acknowledged && Object.prototype.hasOwnProperty.call(acknowledged, field)) result[field] = acknowledged[field];
        else delete result[field];
      }
    }
    return result;
  };
  const results = (poles || []).map((pole, index) => polePricing(pole, inventory, index, settings));
  return {
    poles: results.map((check, index) => {
      const pole = poles[index];
      if (check.issues.length) return held(pole);
      const { inv, geometry, rate, stockLengthInches, widthInches, paint } = check;
      const requiredInches = geometry.required_length_inches;
      let poleCost;
      let stockPieces = null;
      if (inv.pole_pricing_mode === "stock_price") {
        stockPieces = Math.ceil(requiredInches / stockLengthInches);
        poleCost = stockPieces * rate;
      } else {
        poleCost = requiredInches / 12 * rate;
      }
      const paintingCost = check.painting ? calcPolePaintingCost(
        { include_pole_painting: true, height_inches: requiredInches, y_offset_inches: 0 },
        { ...inv, pole_width_inches: widthInches },
        {
          pole_paint_cost_per_lf: paint.costPerLf,
          pole_paint_labor_per_lf: paint.laborPerLf,
          [polePaintMultiplierKey(widthInches)]: paint.sizeMultiplier
        }
      ) : 0;
      const signRows = Array.isArray(pole?.signs) ? pole.signs : [];
      const signCosts = signRows.map((s) => {
        if (s?.display_only === true) return 0;
        const unit = Number(s?.unit_cost);
        if (!(Number.isFinite(unit) && unit >= 0)) return null;
        const parts = [s?.hardware_cost, s?.labor_cost, s?.paint_cost, s?.waste_cost];
        let total = unit;
        for (const p of parts) {
          if (p == null || p === "") continue;
          const n = Number(p);
          if (!(Number.isFinite(n) && n >= 0)) return null;
          total += n;
        }
        return total;
      });
      const signTotal = !signRows.length ? 0 : signCosts.every((c) => c !== null) ? signCosts.reduce((a, b) => a + b, 0) : null;
      return {
        ...pole,
        // Resolved-geometry snapshots (CMP-E02): the canonical embedment
        // materializes alongside the authored legacy spelling; required
        // length, stock pieces, base offset and resolved shape persist so the
        // BOM, preview and handoff read the same distinct quantities.
        embedment_inches: geometry.embedment_inches,
        base_offset_inches: geometry.base_offset_inches,
        required_length_inches: requiredInches,
        stock_pieces: stockPieces,
        ...geometry.pole_shape !== null ? { pole_shape: geometry.pole_shape } : {},
        pole_name: inv.material_name || "",
        pole_cost: poleCost,
        pole_painting_cost: paintingCost,
        total_sign_cost: signTotal,
        total_cost: poleCost + paintingCost + (signTotal ?? 0)
      };
    }),
    polePricing: results.map((check) => ({
      available: check.issues.length === 0,
      issues: check.issues,
      // Resolved canonical geometry for display surfaces (never priced again).
      geometry: check.geometry
    }))
  };
}
var FOUNDATION_METHOD_DOMAIN = Object.freeze({
  // The documented embedment domain: embedment is a third of the exposed pole
  // height (engineering guidance minimum, never a universal claim) and the
  // shaft diameter clears twice the pole diameter (a shop-assumption clearance,
  // not a code number).
  embedment_min_ratio: 1 / 3,
  shaft_diameter_min_ratio: 2,
  domain: "sign-pole embedment inside engineering guidance; shop-assumption diameter clearance"
});
var FOUNDATION_TYPE_METHOD_DOMAIN = Object.freeze({
  spread_foot_depth_min_inches: 12,
  wall_height_min_inches: 6,
  domain: "shop-assumption minimum dims (spread_foot depth / wall height); inside the documented domain"
});
var FOUNDATION_METHOD_WORKED_EXAMPLES = Object.freeze([
  {
    domain: "pole embedment",
    inputs: { height_inches: 120, pole_diameter_inches: 8 },
    derivation: "embedment = ceil(height * embedment_min_ratio); shaft_diameter = ceil(pole_dia * shaft_diameter_min_ratio)",
    output: { embedment_inches: 42, shaft_diameter_inches: 10 },
    note: "the domain's ratios applied to the authored height/diameter -- inside the documented domain, never an unexplained multiplier"
  },
  {
    domain: "spread_foot depth",
    inputs: { foundation_type: "spread_foot" },
    derivation: "depth_inches = spread_foot_depth_min_inches (shop-assumption minimum)",
    output: { depth_inches: 12 },
    note: "the domain's minimum depth -- a shop-assumption floor, not a structural calc"
  },
  {
    domain: "wall height",
    inputs: { foundation_type: "wall" },
    derivation: "height_inches = wall_height_min_inches (shop-assumption minimum)",
    output: { height_inches: 6 },
    note: "the domain's minimum height -- a shop-assumption floor, not a structural calc"
  }
]);

// src/components/estimator/foundation/landscapeMaterials.js
var LANDSCAPE_MATERIALS = [
  { key: "dirt", label: "Dirt (Eraser)", color: "#a1866f", cost_per_sqft: 0 },
  { key: "grass", label: "Grass", color: "#4ade80", cost_per_sqft: 0.75 },
  { key: "concrete", label: "Concrete", color: "#cbd5e1", cost_per_sqft: 8 },
  { key: "asphalt", label: "Asphalt", color: "#475569", cost_per_sqft: 5 },
  { key: "gravel", label: "Gravel", color: "#94a3b8", cost_per_sqft: 2.25 },
  { key: "sand", label: "Sand", color: "#fcd34d", cost_per_sqft: 1.75 },
  { key: "mulch", label: "Mulch", color: "#92400e", cost_per_sqft: 1.25 },
  { key: "wood_decking", label: "Wood Decking", color: "#d97706", cost_per_sqft: 14 },
  { key: "water", label: "Water", color: "#38bdf8", cost_per_sqft: 6 },
  // O-069 (CMP-F02) -- additional sqft-priced site materials. These bill by
  // coverage like the base set; per-count objects (trees, lights, boulders)
  // need a count-priced model -- they are intentionally absent rather than
  // billed per square foot.
  { key: "pavers", label: "Pavers", color: "#a8a29e", cost_per_sqft: 12 },
  { key: "flagstone", label: "Flagstone", color: "#b45309", cost_per_sqft: 16, pattern: "stone" },
  { key: "river_rock", label: "River Rock", color: "#78716c", cost_per_sqft: 3.5, pattern: "pebble" },
  { key: "sod", label: "Sod (installed)", color: "#16a34a", cost_per_sqft: 1.5, pattern: "grass" },
  { key: "artificial_turf", label: "Artificial Turf", color: "#059669", cost_per_sqft: 11, pattern: "turf" },
  { key: "ground_cover", label: "Ground Cover", color: "#65a30d", cost_per_sqft: 4, pattern: "foliage" },
  { key: "planting_bed", label: "Planting Bed", color: "#7c3f00", cost_per_sqft: 6, pattern: "soil" }
];
var materialByKey = (key) => LANDSCAPE_MATERIALS.find((m) => m.key === key);
var configuredMaterialPrice = (key, overrides) => {
  const ov = isRecord(overrides) ? overrides[key] : null;
  const up = ov ? Number(ov.unit_price) : null;
  if (Number.isFinite(up) && up >= 0) return { rate: up, catalog_id: typeof ov.catalog_id === "string" && ov.catalog_id !== "" ? ov.catalog_id : null, configured: true };
  return { rate: null, catalog_id: null, configured: false };
};
var LANDSCAPE_VISUAL_OBJECTS = [
  { key: "tree", label: "Tree", color: "#166534", height_inches: 96, radius_inches: 24 },
  { key: "shrub", label: "Shrub", color: "#15803d", height_inches: 18, radius_inches: 12 },
  { key: "light", label: "Light", color: "#f59e0b", height_inches: 72, radius_inches: 2 },
  { key: "boulder", label: "Boulder", color: "#57534e", height_inches: 30, radius_inches: 18 }
];
var VISUAL_PREFIX = "visual:";
var isVisualCellKey = (key) => typeof key === "string" && key.startsWith(VISUAL_PREFIX);
var visualObjectByKey = (key) => isVisualCellKey(key) ? LANDSCAPE_VISUAL_OBJECTS.find((o) => o.key === key.slice(VISUAL_PREFIX.length)) : void 0;
var LANDSCAPE_COUNT_OBJECTS = [
  { key: "tree", label: "Tree", unit_cost: 350, height_inches: 96, radius_inches: 24 },
  { key: "shrub", label: "Shrub", unit_cost: 45, height_inches: 18, radius_inches: 12 },
  { key: "light", label: "Light", unit_cost: 120, height_inches: 72, radius_inches: 2 },
  { key: "boulder", label: "Boulder", unit_cost: 180, height_inches: 30, radius_inches: 18 },
  // O-069 (CMP-F02) -- additional placed-object types: grass clumps / flower
  // beds / small rocks / a fountain bill by authored unit_cost per placed
  // object (count-priced, NOT sqft coverage -- the same count-priced model
  // the base objects use).
  { key: "grass_clump", label: "Grass clump", unit_cost: 12, height_inches: 12, radius_inches: 6 },
  { key: "flower_bed", label: "Flower bed", unit_cost: 65, height_inches: 14, radius_inches: 10 },
  { key: "small_rock", label: "Small rock", unit_cost: 25, height_inches: 10, radius_inches: 8 },
  { key: "fountain", label: "Fountain", unit_cost: 850, height_inches: 54, radius_inches: 22 }
];
var countObjectByKey = (key) => LANDSCAPE_COUNT_OBJECTS.find((o) => o.key === key);
var LANDSCAPE_BORDER_TYPES = [
  { key: "steel_edging", label: "Steel edging", cost_per_ft: 4.5 },
  { key: "plastic_edging", label: "Plastic edging", cost_per_ft: 1.75 },
  { key: "brick_border", label: "Brick border", cost_per_ft: 8 },
  { key: "concrete_curb", label: "Concrete curb", cost_per_ft: 12 }
];
var borderTypeByKey = (key) => LANDSCAPE_BORDER_TYPES.find((b) => b.key === key);
var LANDSCAPE_ASSET_MANIFEST = Object.freeze({
  license_policy: "CC0 or shop-licensed, individually curated per object type -- no blanket packs",
  source_kind: "procedural shop-authored primitives",
  materials: LANDSCAPE_MATERIALS.map((m) => ({
    key: m.key,
    label: m.label,
    kind: "billable material",
    source: "shop-authored color tile",
    license: "shop-authored",
    // O-075 (CMP-F08) -- manifest metadata: author/provenance, original scale,
    // preview, optimized-file hash, bounds/pivot, and a fallback representation.
    // Shop-authored primitives carry the primitive itself as the fallback.
    author: "shop",
    original_scale_inches: null,
    preview: null,
    file_hash: null,
    bounds_inches: null,
    pivot: "center-bottom",
    fallback: "color tile",
    // O-077 (CMP-F10) -- asset-verification checklist: procedural primitives
    // have no textures/CORS/foliage (not_applicable) but scale comes from the
    // authored material coverage (verified). Re-check when real assets land.
    verification: {
      transparent_foliage: "not_applicable",
      shadows: "procedural",
      scale: "verified",
      thumbnail: "procedural",
      cors: "not_applicable",
      unavailable_asset: "not_applicable",
      low_power_fallback: "procedural-fallback"
    }
  })),
  visual_objects: LANDSCAPE_VISUAL_OBJECTS.map((o) => ({
    key: o.key,
    label: o.label,
    kind: "decorative object",
    source: "shop-authored primitive shape",
    license: "shop-authored",
    author: "shop",
    original_scale_inches: o.height_inches ?? null,
    preview: null,
    file_hash: null,
    bounds_inches: o.height_inches != null && o.radius_inches != null ? { h: o.height_inches, r: o.radius_inches } : null,
    pivot: "center-bottom",
    fallback: "primitive shape",
    verification: {
      transparent_foliage: "not_applicable",
      shadows: "procedural",
      scale: "verified",
      thumbnail: "procedural",
      cors: "not_applicable",
      unavailable_asset: "not_applicable",
      low_power_fallback: "procedural-fallback"
    }
  }))
});
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function landscapeInputIssues(landscape) {
  const issues = [];
  if (landscape === void 0 || landscape === null) return issues;
  const add = (field, code, message) => issues.push({
    kind: "landscape",
    index: null,
    componentId: null,
    field,
    code,
    message: `Landscape: ${message}`
  });
  const rawCells = landscape.cells;
  const cells = isRecord(rawCells) ? rawCells : null;
  if (rawCells !== void 0 && rawCells !== null && cells === null) {
    add(
      "cells",
      "landscape_cells_unavailable",
      "the recorded site grid is malformed  -  -  -  -  -  -  - ? repair or clear it before repricing"
    );
    return issues;
  }
  const painted = Object.entries(cells || {}).filter(([, key]) => key && key !== "dirt");
  if (!painted.length) return issues;
  if (inventoryPositiveNumber(landscape.cell_size_inches) === null) {
    add(
      "cell_size_inches",
      "landscape_cell_size_unavailable",
      "record a finite, positive cell size in inches before repricing site materials"
    );
  }
  const reported = /* @__PURE__ */ new Set();
  for (const [, key] of painted) {
    if (reported.has(key)) continue;
    reported.add(key);
    if (isVisualCellKey(key)) {
      if (!visualObjectByKey(key)) {
        add(
          "cells",
          "landscape_visual_unavailable",
          `decorative object ${JSON.stringify(key)} is not in the visual catalog -- pick a listed object or erase it before repricing`
        );
      }
      continue;
    }
    const mat = materialByKey(key);
    if (!mat) {
      add(
        "cells",
        "landscape_material_unavailable",
        `site material ${JSON.stringify(key)} is not in the landscape catalog  -  -  -  -  -  -  - ? pick a catalog material or erase it before repricing`
      );
    } else if (inventoryNonnegativeNumber(mat.cost_per_sqft) === null) {
      add(
        "cost_per_sqft",
        "landscape_material_price_unavailable",
        `record a finite, nonnegative cost per sq ft for "${mat.label}" before repricing`
      );
    }
  }
  return issues;
}
var landscapeSummary = (landscape) => {
  const cells = isRecord(landscape?.cells) ? landscape.cells : {};
  const cellSize = inventoryPositiveNumber(landscape?.cell_size_inches);
  const sqftPerCell = cellSize === null ? null : Math.pow(cellSize / 12, 2);
  const waste = Number.isFinite(landscape?.waste_fraction) && landscape.waste_fraction >= 0 ? landscape.waste_fraction : 0;
  const labor = landscape?.labor_cost == null ? null : Number.isFinite(Number(landscape.labor_cost)) && Number(landscape.labor_cost) >= 0 ? Number(landscape.labor_cost) : null;
  const laborInvalid = landscape?.labor_cost != null && labor === null;
  const bedDepth = Number.isFinite(landscape?.bed_depth_inches) && landscape.bed_depth_inches > 0 ? landscape.bed_depth_inches : null;
  const counts = {};
  const rows = {};
  let plantCount = 0;
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt") return;
    if (isVisualCellKey(key)) {
      plantCount += 1;
      return;
    }
    counts[key] = (counts[key] || 0) + 1;
    if (sqftPerCell !== null) rows[key] = (rows[key] || 0) + sqftPerCell;
  });
  const lines = Object.entries(counts).map(([key, count]) => {
    const mat = materialByKey(key);
    const sqft = sqftPerCell === null ? null : rows[key] * (1 + waste);
    const configured = configuredMaterialPrice(key, landscape?.material_overrides);
    const rate = configured.configured ? configured.rate : mat ? inventoryNonnegativeNumber(mat.cost_per_sqft) : null;
    return {
      key,
      label: mat?.label || key,
      color: mat?.color || "#999",
      cells: count,
      sqft,
      volume_cuft: sqft === null || bedDepth === null ? null : sqft * bedDepth / 12,
      cost_per_sqft: rate,
      configured_catalog_id: configured.catalog_id,
      cost: sqft === null || rate === null ? null : sqft * rate
    };
  });
  const materialsTotal = lines.every((l) => l.cost !== null) ? lines.reduce((s, l) => s + l.cost, 0) : null;
  const objectLines = (Array.isArray(landscape?.objects) ? landscape.objects : []).map((o) => {
    const catalog = countObjectByKey(o?.type);
    const qty = Number(o?.qty);
    const validQty = Number.isFinite(qty) && qty > 0;
    const unit = catalog ? Number(catalog.unit_cost) : null;
    return {
      key: o?.type || "unknown",
      label: catalog?.label || (o?.type || "Object"),
      qty: validQty ? qty : null,
      unit_cost: unit,
      cost: validQty && unit !== null ? qty * unit : null,
      invalid: !catalog || !validQty || unit === null
    };
  });
  const objectsTotal = objectLines.length === 0 ? 0 : objectLines.every((l) => l.cost !== null) ? objectLines.reduce((s, l) => s + l.cost, 0) : null;
  const borderLines = (Array.isArray(landscape?.borders) ? landscape.borders : []).map((b) => {
    const type = borderTypeByKey(b?.type);
    const feet = Number(b?.linear_feet);
    const validFeet = Number.isFinite(feet) && feet > 0;
    const rate = type ? Number(type.cost_per_ft) : null;
    return {
      key: b?.type || "unknown",
      label: type?.label || (b?.type || "Border"),
      linear_feet: validFeet ? feet : null,
      cost_per_ft: rate,
      cost: validFeet && rate !== null ? feet * rate : null,
      invalid: !type || !validFeet || rate === null
    };
  });
  const bordersTotal = borderLines.length === 0 ? 0 : borderLines.every((l) => l.cost !== null) ? borderLines.reduce((s, l) => s + l.cost, 0) : null;
  const bedLines = (Array.isArray(landscape?.beds) ? landscape.beds : []).map((b) => {
    const mat = materialByKey(b?.material);
    const sqft = Number(b?.sqft);
    const validSqft = Number.isFinite(sqft) && sqft > 0;
    const rate = mat ? inventoryNonnegativeNumber(mat.cost_per_sqft) : null;
    return {
      key: b?.material || "unknown",
      label: mat?.label || (b?.material || "Bed"),
      sqft: validSqft ? sqft : null,
      cost_per_sqft: rate,
      cost: validSqft && rate !== null ? sqft * rate : null,
      invalid: !mat || !validSqft || rate === null
    };
  });
  const bedsTotal = bedLines.length === 0 ? 0 : bedLines.every((l) => l.cost !== null) ? bedLines.reduce((s, l) => s + l.cost, 0) : null;
  const bedsSqft = bedLines.reduce((s, l) => s + (Number.isFinite(l.sqft) ? l.sqft : 0), 0);
  const bedVolumeCy = bedDepth !== null && bedLines.every((l) => l.sqft !== null) && bedsSqft > 0 ? bedsSqft * bedDepth / 27 : null;
  const total = laborInvalid || objectsTotal === null || materialsTotal === null || bordersTotal === null || bedsTotal === null ? null : materialsTotal + (labor === null ? 0 : labor) + objectsTotal + bordersTotal + bedsTotal;
  const groups = {};
  (Array.isArray(landscape?.objects) ? landscape.objects : []).forEach((o, i) => {
    const key = o?.group;
    if (!key) return;
    const l = objectLines[i];
    const g = groups[key] || (groups[key] = { count: 0, cost: 0 });
    g.count += 1;
    if (l && Number.isFinite(l.cost)) g.cost += l.cost;
  });
  return {
    lines,
    object_lines: objectLines,
    border_lines: borderLines,
    bed_lines: bedLines,
    total,
    materials_total: materialsTotal,
    objects_total: objectsTotal,
    borders_total: bordersTotal,
    beds_total: bedsTotal,
    labor_cost: labor,
    plant_count: plantCount,
    groups,
    bed_volume_cy: bedVolumeCy,
    issues: landscapeInputIssues(landscape)
  };
};

// src/components/estimator/foundation/foundationGeometryInputs.js
var foundationInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number3 = Number(value);
  return Number.isFinite(number3) ? number3 : null;
};
var foundationPositiveWholeNumber = (value) => {
  const number3 = foundationInputNumber(value);
  const whole3 = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole3 && Number.isSafeInteger(number3) && number3 > 0;
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
var FOUNDATION_DIMENSION_FIELDS = Object.freeze({
  // Foundation item card (spread footing / pillar)  -  -  -  consumed by the card-label
  // remainder; recorded here so card + panels share one label source.
  foundation: Object.freeze({
    length_inches: Object.freeze({
      label: "Length (in)",
      help: "Footing length  -  -  -  the long side of a rectangular spread footing.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    width_inches: Object.freeze({
      label: "Width (in)",
      help: "Footing width  -  -  -  the short side of a rectangular spread footing.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "Depth (in)",
      help: "Footing or pier depth below grade  -  -  -  must reach below the frost line for your area.",
      placeholder: `3' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    diameter: Object.freeze({
      label: "Diameter (in)",
      help: "Round pier diameter measured straight across the top.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    grade_offset_inches: Object.freeze({
      label: "Grade offset (in)",
      help: "How far the footing top sits above (+) or below (-) finished grade.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: true
    })
  }),
  // Project poles (FoundationPolesPanel).
  pole: Object.freeze({
    height_inches: Object.freeze({
      label: "Height above grade (in)",
      help: "Exposed pole length from finished grade up to the sign mount.",
      placeholder: `10' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    embedment_inches: Object.freeze({
      label: "Embedment below grade (in)",
      help: "Pole length buried in the footing  -  -  -  must satisfy frost depth and the pole supplier's embedment guidance.",
      placeholder: `3' 6"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    base_offset_inches: Object.freeze({
      label: "Base offset above grade (in)",
      help: "Lifts the pole bottom above grade for wall or pier mounts  -  -  -  the gap still counts toward required stock length.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    total_length_inches: Object.freeze({
      label: "Total stock length (in)",
      help: "Billed pole length when a full stick is purchased  -  -  -  leave blank to price height above grade plus embedment.",
      placeholder: `20' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Masonry walls (FoundationWallsPanel)  -  -  -  camelCase wall record keys.
  wall: Object.freeze({
    heightInches: Object.freeze({
      label: "Wall height (in)",
      help: "Finished masonry height measured from the footing up.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mortarGapInches: Object.freeze({
      label: "Mortar joint (in)",
      help: 'Mortar thickness between masonry units  -  -  -  3/8" is typical.',
      placeholder: '3/8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    wasteFraction: Object.freeze({
      label: "Waste (0-1)",
      help: "Waste/cut factor on brick+mortar+labor quantities (0.1 = +10%).",
      placeholder: "0.1",
      unit: "fraction",
      ftIn: false,
      signed: false
    }),
    internalWallHeightInches: Object.freeze({
      label: "Fill wall height (in)",
      help: "Internal fill wall height  -  -  -  blank follows the outer wall height.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    internalMortarGapInches: Object.freeze({
      label: "Fill mortar joint (in)",
      help: "Mortar thickness for the internal fill wall.",
      placeholder: '3/8"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Wall caps (FoundationWallCapsPanel)  -  -  -  length_inches is the cap cut, not a
  // footing length; keep it in its own section.
  wallCap: Object.freeze({
    length_inches: Object.freeze({
      label: "Cut length (in)",
      help: "Cap stock cut for this piece  -  -  -  the full stock price is charged per cut piece.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    overhang_inches: Object.freeze({
      label: "Overhang (in)",
      help: "How far the cap projects past each wall face -- 0 is flush.",
      placeholder: '1"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "Cap thickness (in)",
      help: "Vertical thickness of the cap piece sitting on the wall.",
      placeholder: '3"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    // O-050 (CMP-D07) -- cap profile / width / elevation / joints / slope /
    // end-treatment metadata. Optional authored fields; blank = "not recorded",
    // never a silent default on the cap's geometry or finish.
    width_inches: Object.freeze({
      label: "Cap width (in)",
      help: "How wide the cap spans the wall top  -  0 is flush with the wall face.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    elevation_inches: Object.freeze({
      label: "Cap elevation (in)",
      help: "Height of the cap's top surface above the slab.",
      placeholder: '24"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    joint_spacing_inches: Object.freeze({
      label: "Joint spacing (in)",
      help: "Distance between cap joints along the wall run.",
      placeholder: '48"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    profile: Object.freeze({
      label: "Cap profile",
      help: "The cap's edge profile (flat, sloped, beveled, rounded).",
      placeholder: "flat",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    slope: Object.freeze({
      label: "Cap slope",
      help: "Whether the cap top sheds water (flat, single-slope, double-slope).",
      placeholder: "flat",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    end_treatment: Object.freeze({
      label: "End treatment",
      help: "How the cap terminates at wall ends (straight, mitered, returned).",
      placeholder: "straight",
      unit: "text",
      ftIn: false,
      signed: false
    })
  }),
  // Pole-mounted signs (FoundationPolesPanel sign sub-list).
  sign: Object.freeze({
    width_inches: Object.freeze({
      label: "W (in)",
      help: "Sign face width across the pole.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "H (in)",
      help: "Sign face height.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mount_height_inches: Object.freeze({
      label: "Mount ht (in)",
      help: "Height from grade up to the sign's mounting point.",
      placeholder: `8' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "D (in)",
      help: "Sign face depth (thickness) in plan view.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    horizontal_offset_inches: Object.freeze({
      label: "Offset (in)",
      help: "Horizontal offset from the pole center in plan view (+ = one side, - = other).",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: true
    }),
    // O-060 (CMP-E05) -- panel-shape/trim/body-color/envelope metadata.
    // Optional authored fields; blank = "not recorded", never a silent default.
    panel_shape: Object.freeze({
      label: "Panel shape",
      help: "Sign panel shape: cabinet / panel / letters.",
      placeholder: "cabinet",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    trim_color: Object.freeze({
      label: "Trim color",
      help: "Sign trim / frame color.",
      placeholder: "bronze",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    body_color: Object.freeze({
      label: "Body color",
      help: "Sign body / cabinet color.",
      placeholder: "white",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    envelope: Object.freeze({
      label: "Envelope",
      help: "Physical envelope note (overall bounding box / projection).",
      placeholder: `e.g. 4'x2'x8"`,
      unit: "text",
      ftIn: false,
      signed: false
    }),
    orientation: Object.freeze({
      label: "Orient (deg)",
      help: "Sign face rotation on the pole (0 = facing the plan's +x direction).",
      placeholder: "0",
      unit: "degrees",
      ftIn: false,
      signed: true
    })
  }),
  // Signage cabinets (SignageCabinetsPanel).
  cabinet: Object.freeze({
    width_inches: Object.freeze({
      label: "Width (in)",
      help: "Cabinet face width  -  -  -  horizontal across the sign face.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "Height (in)",
      help: "Cabinet face height  -  -  -  vertical on the sign face.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "Depth (in)",
      help: "Cabinet depth front-to-back  -  -  -  affects wind load and mounting.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mount_height_inches: Object.freeze({
      label: "Mount height (in)",
      help: "Height from grade up to the cabinet's mounting point.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Rectangle outline entry (WallShapeEditor)  -  -  -  local draft, applied on click.
  wallOutline: Object.freeze({
    rect_length: Object.freeze({
      label: "Rectangle length (in)",
      help: "Footprint length for a rectangular wall outline.",
      placeholder: `8' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    rect_width: Object.freeze({
      label: "Rectangle width (in)",
      help: "Footprint width for a rectangular wall outline.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Landscape grid (LandscapeDesigner).
  landscape: Object.freeze({
    cell_size_inches: Object.freeze({
      label: "Cell size (in)",
      help: 'Edge length of one grid cell  -  -  -  12" makes each cell 1 sq ft.',
      placeholder: '12"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  })
});

// src/components/estimator/foundation/foundationRuleRegistry.js
var FOUNDATION_SOURCE_LICENSE_POLICY = Object.freeze({
  paid_standards_citation_only: true,
  paid_standards_no_content_reproduction: true,
  paid_standards_list: ["ACI 315", "ACI 318", "ACI 301", "CRSI MSP", "CRSI PRB", "CRSI RB4.1", "ASTM", "AASHTO"],
  candidate_source_cannot_gate: true,
  public_sources_verified_vs_candidate: true,
  policy_version: "1.0.0"
});
var RULE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
var DOMAIN_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
var SEMVER = /^\d+\.\d+\.\d+$/;
var REGISTER_ID = /^[A-Z]{2,}(?:-[A-Z0-9]+)*-\d{3,}$/;
var STATUSES = /* @__PURE__ */ new Set(["active", "held"]);
var VERIFIED_VALUES = /* @__PURE__ */ new Set([true, false, "candidate"]);
var GATED_PREFIXES = ["max_", "min_", "equals_"];
var APPLICABILITY_LIST_KEYS = /* @__PURE__ */ new Set([
  "usages",
  "member_types",
  "support_classes",
  "bearing_modes",
  "substrates",
  "bar_coatings",
  "bar_sizes",
  "products",
  "mat_layers",
  "exposures"
]);
var isRecord2 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var text = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
var finite = (value) => typeof value === "number" && Number.isFinite(value);
function deepFreeze(value, seen = /* @__PURE__ */ new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry) => deepFreeze(entry, seen));
  else for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}
var FOUNDATION_SOURCE_TOPIC_INDEX = Object.freeze({
  "support.placement.spacing": "spacing/count ceilings per bearing mode",
  "support.density": "density/count caps (never a universal entitlement)",
  "support.compatibility": "member-type vs support-kind compatibility (pillar/base-plate/drilled-shaft)",
  "support.catalog": "per-SKU catalog-row modeling rules",
  "support.placement": "placement rules (bracing, plates, coatings)",
  "authority": "citation/authority markers (paid standards, licensed-only)"
});
var FOUNDATION_RULE_SOURCES = deepFreeze({
  "CMP-SUP-001": {
    authority: "Dayton Superior, manufacturer",
    title: "HC Rebar High Chair / Individual High Chair product page",
    edition: null,
    url: "https://www.daytonsuperior.com/products/accessories?name=hc",
    verified: true
    // product text inspected; SKU/load/installation depth not verified
  },
  "CMP-SUP-002": {
    authority: "Dayton Superior, manufacturer",
    title: "HCP Individual High Chair With Plates product page",
    edition: null,
    url: "https://www.daytonsuperior.com/products/accessories?name=hcp",
    verified: false
    // unresolved manufacturer-internal height conflict on the page
  },
  "CMP-SUP-003": {
    authority: "Dayton Superior, manufacturer",
    title: '"Bar Support" handbook, document code DS98',
    edition: "DS98 REV. 04/24; footers also carry 10/26 and REV. 09/23",
    url: "https://www.daytonsuperior.com/docs/default-source/handbooks/bar-support-handbook.pdf?sfvrsn=6dffd560_132",
    verified: true
  },
  "CMP-SUP-004": {
    authority: "Dayton Superior, manufacturer",
    title: "SB - SLAB BOLSTER Bar Supports, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/sb_slab_bolster.pdf?sfvrsn=d61db060_12",
    verified: true
  },
  "CMP-SUP-005": {
    authority: "Dayton Superior, manufacturer",
    title: "SBU - SLAB BOLSTER UPPER Rebar Supports, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/sbuslabbolsterupper.pdf",
    verified: true
  },
  "CMP-SUP-006": {
    authority: "Dayton Superior, manufacturer",
    title: "BB - BEAM BOLSTER Bar Support, Technical Data Sheet",
    edition: "file date 5/18/2022 on sheet",
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/bb-beam-bolster-bar-support-tech-data-sheet.pdf?sfvrsn=4719b060_16",
    verified: true
  },
  "CMP-SUP-007": {
    authority: "Dayton Superior, manufacturer",
    title: "BBP - BEAM BOLSTER WITH PLATE, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/bbp-beam-bolster-with-plate-tech-data-sheet.pdf?sfvrsn=68f8b260_11",
    verified: true
  },
  "CMP-SUP-008": {
    authority: "Dayton Superior, manufacturer",
    title: "CHC - CONTINUOUS HIGH CHAIR, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/chc---continuous-high-chair-(us)-tech-data-sheet.pdf?sfvrsn=2229b460_6",
    verified: true
  },
  "CMP-SUP-009": {
    authority: "Dayton Superior, manufacturer",
    title: "HC - INDIVIDUAL HIGH CHAIR, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/hcindividualhighchair.pdf?sfvrsn=4ca7af60_20",
    verified: true
  },
  "CMP-SUP-010": {
    authority: "Meadow Burke / Leviat, manufacturer",
    title: "Technical Manual - Reinforcing (Supporting and Spacing Rebar spec sheets)",
    edition: null,
    url: "https://www.tpacaz.com/wp-content/uploads/sites/11/2025/02/Meadow-Burke-technical-manual-reinforcing-compressed.pdf",
    verified: true
  },
  "CMP-SUP-011": {
    authority: "SureBuilt, manufacturer/distributor",
    title: '"Bar Support" guide with Bar Support Wire Size table',
    edition: "footer dated 02/25",
    url: "https://surebuilt-usa.com/docs/Rebar-Support.pdf",
    verified: true
  },
  "CMP-SUP-012": {
    authority: "Dayton Superior (Aztec line), manufacturer",
    title: "PSBB - Aztec StrongBack Slab / Beam Bolster, Technical Data Sheet",
    edition: null,
    url: "https://www.daytonsuperior.com/docs/default-source/tech-data-sheets/psbbaztecstrongbackslabbeambolster.pdf",
    verified: true
  },
  "CMP-SUP-013": {
    authority: "Iowa Department of Transportation, public agency",
    title: "Standard Specifications Section 2404, Reinforcement",
    edition: "spec book revision 10/20/2026 as displayed",
    url: "https://ia.iowadot.gov/erl/current/GS/content/2404.htm",
    verified: true
  },
  "CMP-SUP-014": {
    authority: "Iowa Department of Transportation, public agency",
    title: "Construction Manual Chapter 11, sections 11.40 Reinforcement and 11.41 Placement and Checking (Bridge Floors)",
    edition: null,
    url: "https://www.iowadot.gov/erl/current/CM/content/CM%2011.40.htm",
    verified: true
  },
  "CMP-SUP-015": {
    authority: "Florida Department of Transportation, public agency",
    title: "Section 415, Reinforcing Steel (Standard Specifications for Road and Bridge Construction review copy)",
    edition: "July 2016 FHWA review",
    url: "https://fdotwww.blob.core.windows.net/sitefinity/docs/default-source/specifications/by-year/2016/july-2016/review/fhwa/4150000.fhwa.pdf?sfvrsn=d440ed72_0",
    verified: true
  },
  "CMP-SUP-016": {
    authority: "Utah DFCM adopted APWA Manual of Standard Specifications, public agency standard",
    title: "Section 03 20 00, Concrete Reinforcing",
    edition: "2025 APWA Specifications - DFCM Adopted Standards",
    url: "https://dfcm.utah.gov/wp-content/uploads/2025-APWA-Specifications-DFCM-Adopted-Standards.pdf",
    verified: true
  },
  "CMP-SUP-017": {
    authority: "U.S. Navy Education and Training (NAVEDTRA), U.S. government",
    title: 'Steelworker 14251C, Chapter 7 "Placing and Tying Reinforcing Steel" (tpub.com mirror)',
    edition: "14251C; dated military manual",
    url: "https://www.tpub.com/steelworker2/78.htm",
    verified: true
  },
  "CMP-SUP-018": {
    authority: "Concrete Reinforcing Steel Institute (CRSI), industry institute",
    title: "Placing Reinforcing Bars, 10th Edition - Table of Contents",
    edition: "10th edition TOC; book content is paid",
    url: "https://www.crsi.org/wp-content/uploads/CRSI-Placing_Reinforcing_Bars_10th-TOC.pdf",
    verified: "candidate"
    // TOC verified; any numeric rule attributed to the book is candidate
  },
  "CMP-SUP-019": {
    authority: "Concrete Construction / Aberdeen group, trade press (via SEF India forum mirror)",
    title: '"Supports and Ties" trade article quoting CRSI documents',
    edition: null,
    url: "https://www.sefindia.org/forum/download.php?id=489",
    verified: "candidate"
    // search-extracted fragments; full article not inspected
  },
  "CMP-SUP-020": {
    authority: "Whitacre Rebar, regional rebar fabricator/supplier",
    title: '"Reinforcing Bar Supports" product page',
    edition: null,
    url: "https://www.whitacrerebar.com/products/reinforcing-bar-supports/",
    verified: "candidate"
    // public page text captured via search index; no data-sheet depth
  },
  "CMP-SUP-021": {
    authority: "Lotel (Baton Rouge, LA), manufacturer of plastic support chairs",
    title: "Rebar-ups / Mesh-ups product pages and published spacing & sizing charts",
    edition: null,
    url: "https://lotel.com/rebar-ups",
    verified: true
    // pages + charts verified; the "how many" sq-ft text is candidate
  },
  "CMP-SUP-022": {
    authority: "Castle NZ, manufacturer (New Zealand)",
    title: "Ground Chairs - Optimal Chair Spacing (AS/NZS context)",
    edition: "2019",
    url: "https://castlenz.com/wp-content/uploads/2019/04/Ground-Chair-Optimal-Spacings.pdf",
    verified: true
    // verified manufacturer chart; foreign standard, not a US code basis
  },
  "CMP-SUP-023": {
    authority: "ACI 318 (paid standard) as publicly quoted by government/educational sources",
    title: 'LA County DPW "2023 Retaining Wall Plan Review" quoting ACI 20.5.1.3.1 (corroborated by iRebar.com table + NAVEDTRA CMP-SUP-017)',
    edition: "2023 code version",
    url: "https://dpw.lacounty.gov/bsd/lib/fp/Building/Structural%20and%20Technical/2023%20Code%20Version/2023%20Retaining%20Wall%20Plan%20Review%20v1.0%20(completed%202-24-23).pdf",
    verified: true
    // consistent multi-source public quotation; ACI 318 itself uninspected
  },
  "CMP-SUP-024": {
    authority: "ACI, CRSI, ASTM, AASHTO standards bodies",
    title: "Paid/restricted standards register markers (MSP, PRB, ACI 315/318/301, RB4.1, ASTM/AASHTO specs)",
    edition: null,
    url: null,
    verified: "candidate"
    // authority markers only; contents not retrieved, no paywall bypassed
  },
  // O-103 (CMP-I02) -- shop_assumptions source: the shop's estimating-
  // assumption corpus (the method-domain constants / shop-authored defaults
  // the estimator carries). `verified: "candidate"` -- a shop assumption is
  // never an external code or a verified engineering source.
  "CMP-SUP-025": {
    authority: "CCS shop estimating assumptions",
    title: "Shop-authored estimating assumptions (method-domain constants, shop defaults)",
    edition: "shop-authored",
    url: null,
    verified: "candidate"
    // a shop assumption -- never an external code or verified engineering source
  }
});
var FOUNDATION_SOURCE_CLASSES = deepFreeze({
  local_code: "adopted local code / amendments",
  structural_standard: "referenced structural standard",
  engineering_guidance: "engineering guidance",
  manufacturer_instructions: "manufacturer instructions",
  shop_assumptions: "shop estimating assumptions"
});
var SOURCE_AUTHORITY_CLASS = deepFreeze({
  "CMP-SUP-001": "manufacturer_instructions",
  "CMP-SUP-002": "manufacturer_instructions",
  "CMP-SUP-003": "manufacturer_instructions",
  "CMP-SUP-004": "manufacturer_instructions",
  "CMP-SUP-005": "manufacturer_instructions",
  "CMP-SUP-006": "manufacturer_instructions",
  "CMP-SUP-007": "manufacturer_instructions",
  "CMP-SUP-008": "manufacturer_instructions",
  "CMP-SUP-009": "manufacturer_instructions",
  "CMP-SUP-010": "manufacturer_instructions",
  "CMP-SUP-011": "manufacturer_instructions",
  "CMP-SUP-012": "manufacturer_instructions",
  "CMP-SUP-013": "structural_standard",
  "CMP-SUP-014": "structural_standard",
  "CMP-SUP-015": "structural_standard",
  "CMP-SUP-016": "local_code",
  "CMP-SUP-017": "engineering_guidance",
  "CMP-SUP-018": "engineering_guidance",
  "CMP-SUP-019": "engineering_guidance",
  "CMP-SUP-020": "manufacturer_instructions",
  "CMP-SUP-021": "manufacturer_instructions",
  "CMP-SUP-022": "manufacturer_instructions",
  "CMP-SUP-023": "structural_standard",
  "CMP-SUP-024": "structural_standard",
  "CMP-SUP-025": "shop_assumptions"
});
var src = (register_id, section, verified) => {
  const base2 = FOUNDATION_RULE_SOURCES[register_id];
  return {
    register_id,
    authority: base2.authority,
    authority_class: SOURCE_AUTHORITY_CLASS[register_id] ?? null,
    title: base2.title,
    edition: base2.edition ?? null,
    section: section ?? null,
    url: base2.url ?? null,
    verified: verified === void 0 ? base2.verified : verified
  };
};
var FOUNDATION_RULE_SEEDS = deepFreeze([
  // ===== support.placement.spacing — count ceilings (all ceilings, not densities) =====
  {
    rule_id: "SUP-SPACING-CONTINUOUS-IOWA-MAX",
    domain: "support.placement.spacing",
    statement: "Bolsters or continuous high chairs spaced not more than 4 feet in each direction; the agency cap applies on top of manufacturer recommendation or CRSI Manual of Standard Practice spacing.",
    params: { max_spacing_inches_each_way: 48 },
    units: "inches",
    logic: "ceiling on authored spacing; consumer grid count stays ceil(span/spacing)+1 per axis at or under this cap",
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: [],
    applicability: { support_classes: ["continuous"] },
    limits: [
      "public-agency ceiling for highway work, not a building code; a stricter project spec or CRSI MSP rule may govern",
      "a ceiling, not an entitlement to 48-inch spacing"
    ],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-CHAIR-IOWA-MAX",
    domain: "support.placement.spacing",
    statement: "Individual bar chairs (individual high chairs) spaced not more than 3 feet in each direction under the same agency-cap structure as bolsters.",
    params: { max_spacing_inches_each_way: 36 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: ["CMP-SUP-014"],
    applicability: { support_classes: ["individual"] },
    limits: [
      "public-agency ceiling for highway work; CRSI MSP or a stricter project spec may govern",
      "a ceiling, not an entitlement to 36-inch spacing"
    ],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-FLATSLAB-UTAH-MAX",
    domain: "support.placement.spacing",
    statement: "In flat slab work, support chairs and bolsters spaced not more than five (5) feet on centers in each direction (placing clause).",
    params: { max_spacing_inches_each_way: 60 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-016", "placing - flat slab work"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"], support_classes: ["individual", "continuous"] },
    limits: ["public-agency spec clause; 'unless specified otherwise' acceptance language governs", "ceiling, not a density"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-CHAIR-UTAH-LE5-MAX",
    domain: "support.placement.spacing",
    statement: "Flat-slab support chairs spaced 3 feet maximum for No. 5 and smaller bars (acceptance clause).",
    params: { max_spacing_inches_each_way: 36 },
    units: "inches",
    logic: "bar_size_class le_#5 = #5 and smaller",
    source_ref: src("CMP-SUP-016", "acceptance clause - flat slab work"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"], support_classes: ["individual"], bar_size_class: "le_#5" },
    limits: ["acceptance-clause default when the spec does not state otherwise", "ceiling, not a density"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-CHAIR-UTAH-GT5-MAX",
    domain: "support.placement.spacing",
    statement: "Flat-slab support chairs spaced 5 feet maximum for bars larger than No. 5 (acceptance clause).",
    params: { max_spacing_inches_each_way: 60 },
    units: "inches",
    logic: "bar_size_class gt_#5 = larger than #5",
    source_ref: src("CMP-SUP-016", "acceptance clause - flat slab work"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"], support_classes: ["individual"], bar_size_class: "gt_#5" },
    limits: ["acceptance-clause default when the spec does not state otherwise", "ceiling, not a density"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-BEAM-BOLSTER-FDOT-MAX",
    domain: "support.placement.spacing",
    statement: "Beam bottom clearance carried on approved heavy beam bolsters; spacing begins not more than 2 feet from the beam end and continues at not more than 4 feet.",
    params: { max_first_bolster_from_end_inches: 24, max_spacing_inches_along_beam: 48 },
    units: "inches",
    logic: "linear-run spacing rule: first bolster <= 24 in from beam end, subsequent <= 48 in",
    source_ref: src("CMP-SUP-015", "415 - beams and caps"),
    corroborating_register_ids: [],
    applicability: { member_types: ["beam", "grade_beam", "stem_wall"], support_classes: ["continuous"] },
    limits: ["highway-agency spec; formed beam/stem members, not mat grids"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SPACING-HIGHCHAIR-TRADE-EXAMPLE-HELD",
    domain: "support.placement.spacing",
    statement: 'Trade-press example: one-way solid slab with #5 temperature-shrinkage bars uses high chairs at 4 feet on center; #4 bars would need 3 feet on center "to prevent sagging."',
    params: { example_spacing_inches_for_no5_bars: 48, example_spacing_inches_for_no4_bars: 36 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-019", "spacing example, quoted from search-extracted article text"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"], support_classes: ["individual"] },
    limits: [
      "HELD: secondary trade-press fragment not inspected in full; demonstrates bar-size-dependent spacing, not an adoptable ceiling",
      "cannot gate counts or pricing until corroborated by a public spec or licensed standard"
    ],
    unsupported: ["unverified secondary source \u2014 documentation of the evidence gap only"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-SPACING-CASTLE-NZ-CHART-HELD",
    domain: "support.placement.spacing",
    statement: "Foreign manufacturer example proving spacing is a function of bar diameter AND bar spacing AND expected traffic: Y12@200 mm gets 0.7 m centers, Y25@200 mm drops to 0.25-0.3 m; basis is one 80 kg workman per square metre.",
    params: { spacing_function_inputs: ["bar_diameter", "bar_spacing", "construction_traffic"] },
    units: "mixed",
    logic: null,
    source_ref: src("CMP-SUP-022", "Ground Chairs - Optimal Chair Spacing chart"),
    corroborating_register_ids: [],
    applicability: { member_types: ["slab_on_grade"], support_classes: ["individual"], products: ["castle_ground_chairs"] },
    limits: [
      "HELD: AS/NZS foreign-manufacturer chart, not a US code basis \u2014 records the input shape a real spacing rule needs",
      "values are metric and load-basis-specific; do not convert into a US ceiling"
    ],
    unsupported: ["foreign standard basis \u2014 documentation only"],
    rule_version: "1.0.0",
    status: "held"
  },
  // ===== support.density — count philosophy + product-specific densities =====
  {
    rule_id: "SUP-DENSITY-NO-UNIVERSAL",
    domain: "support.density",
    statement: "No universal support density exists. Public agency spacing is a ceiling deferred to manufacturer recommendation or CRSI MSP; manufacturer density is product-specific; spacing depends on bar size, bar spacing and allowed deflection.",
    params: {},
    units: null,
    logic: "the model must be able to answer 'density unverified - manual review' instead of minting a number",
    source_ref: src("CMP-SUP-013", "2404.03 E.5 spacing basis"),
    corroborating_register_ids: ["CMP-SUP-014", "CMP-SUP-021", "CMP-SUP-019"],
    applicability: {},
    limits: ["documentation rule \u2014 carries no assertable params"],
    unsupported: ["a count claimed without a governing source is unsupported \u2014 route to off/manual/review"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DENSITY-TOLERANCE-DRIVEN",
    domain: "support.density",
    statement: '"Contractors must provide an adequate number of bolsters and/or bar chairs of suitable height and strength to maintain clearance" within tolerance \u2014 the required count is whatever holds placement tolerance; no fixed density is granted.',
    params: {},
    units: null,
    logic: "count = area coverage at max spacing, flagged unverified-density; the real requirement is maintaining clearance under construction loads",
    source_ref: src("CMP-SUP-014", "11.41 placement and checking"),
    corroborating_register_ids: ["CMP-SUP-013"],
    applicability: {},
    limits: ["inspector guidance, not a numeric grant"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DENSITY-REBARUPS-AREA",
    domain: "support.density",
    statement: 'Lotel Rebar-ups manufacturer spacing chart: "1 Rebar-up PER 2 SQ. FT. (Suggested)"; a lighter "1 PER 3 SQ. FT." pattern is also published. A product-specific area-density suggestion, not a universal rule.',
    params: { suggested_area_sqft_per_support: 2, suggested_area_sqft_per_support_light_traffic: 3 },
    units: "sqft",
    logic: "count = ceil(mat_area / suggested_area_sqft_per_support) for this product family only",
    source_ref: src("CMP-SUP-021", "Rebar-ups spacing chart B (verified image)"),
    corroborating_register_ids: [],
    applicability: { support_classes: ["snap_on"], products: ["lotel_rebar_ups"], member_types: ["slab_on_grade"] },
    limits: ["manufacturer suggestion for this product on slab-on-grade bar/mesh work \u2014 not a footing-mat density", "add a chair at heavy-traffic crossings per mfr"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DENSITY-MESHUPS-AREA-HELD",
    domain: "support.density",
    statement: 'Lotel Mesh-ups "sq ft / 2" quantity rule \u2014 captured only through search extraction; the page text was not fully inspected.',
    params: { suggested_area_sqft_per_support: 2 },
    units: "sqft",
    logic: null,
    source_ref: src("CMP-SUP-021", 'Mesh-ups "how many" page (search-extracted)', "candidate"),
    corroborating_register_ids: [],
    applicability: { support_classes: ["snap_on"], products: ["lotel_mesh_ups"], member_types: ["slab_on_grade"] },
    limits: ["HELD: the quantity text was not directly inspected"],
    unsupported: ["unverified fragment \u2014 documents the gap"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-DENSITY-DOBIE-CRSI-QUOTE-HELD",
    domain: "support.density",
    statement: "CRSI-derived rule as quoted in trade press: footing mats commonly use precast concrete block supports (dobies), not less than 4 blocks per footing mat spaced about 5 feet on center each way.",
    params: { min_blocks_per_footing_mat: 4, suggested_spacing_inches_each_way: 60 },
    units: "mixed",
    logic: null,
    source_ref: src("CMP-SUP-019", "footing dobie rule as quoted from CRSI Placing Reinforcing Bars"),
    corroborating_register_ids: ["CMP-SUP-018"],
    applicability: { member_types: ["footing_mat"], support_classes: ["dobie"] },
    limits: [
      "HELD: CRSI PRB is a paid standard not inspected (O-120); this is a secondary quotation",
      "consistent with the FDOT 4x4 block rule but density stays candidate until PRB is licensed"
    ],
    unsupported: ["paid-source content unverified \u2014 documents the licensing gap"],
    rule_version: "1.0.0",
    status: "held"
  },
  // ===== support.placement.mat — multi-mat rules =====
  {
    rule_id: "SUP-MAT-INDEPENDENT-SUPPORT",
    domain: "support.placement.mat",
    statement: "When two or more separate mats are required, each mat must be supported independently with an approved support system \u2014 an upper mat may not implicitly rest through the lower mat to the base.",
    params: {},
    units: null,
    logic: "per-layer support targets; an upper mat whose inter-layer gap cannot take a real support reports an issue, never an overlapping object",
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: ["CMP-SUP-014"],
    applicability: { mat_layers: ["upper", "bottom"] },
    limits: [],
    unsupported: ["multi-mat (>2 layers) needs per-layer support rows"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-MAT-UPPER-OVER-LOWER-FDOT",
    domain: "support.placement.mat",
    statement: "Additional longitudinal beam layers are carried on heavy upper-beam bolsters placed directly over the low supports \u2014 a stacking alignment rule for multi-layer cages.",
    params: {},
    units: null,
    logic: "upper support column must align vertically over the lower support it bears on",
    source_ref: src("CMP-SUP-015", "415 - beams and caps"),
    corroborating_register_ids: [],
    applicability: { member_types: ["beam", "grade_beam"], mat_layers: ["upper"] },
    limits: ["beam/cap context"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.bearing_mode — bearing semantics =====
  {
    rule_id: "SUP-UPPER-NO-BASE-REACH",
    domain: "support.bearing_mode",
    statement: '"Upper" support types (SBU/BBU/CHCU/PSBU/UJC) rest on the lower steel mat or on soft material; their height is the clear inter-layer gap. They do not reach the pour bottom.',
    params: {},
    units: null,
    logic: "bearing_mode on_lower_mat: required support height = upper-mat underside - lower-mat top, NOT cover",
    source_ref: src("CMP-SUP-005", "SBU allowed use and limits"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { bearing_modes: ["on_lower_mat"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-UPPER-ORIENTATION-PERPENDICULAR",
    domain: "support.bearing_mode",
    statement: "Upper-type bolsters install with runner wires perpendicular to the lower rebar and the supported upper rebar perpendicular across the top supporting wire \u2014 an orthogonal mat direction is required for correct bearing.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-005", "SBU installation"),
    corroborating_register_ids: [],
    applicability: { bearing_modes: ["on_lower_mat"], support_classes: ["continuous"] },
    limits: [],
    unsupported: ["parallel-bar layouts cannot take an upper bolster in this orientation"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-BEARING-CHCP-NO-STRADDLE",
    domain: "support.bearing_mode",
    statement: "CHCP (continuous high chair with plates) will NOT straddle lower steel \u2014 its continuous bearing plates prevent legs passing around a lower mat.",
    params: {},
    units: null,
    logic: "plate-bearing supports cannot be modeled as straddle mode",
    source_ref: src("CMP-SUP-003", "CHCP product facts"),
    corroborating_register_ids: [],
    applicability: { products: ["chcp"] },
    limits: [],
    unsupported: ["a plate chair asked to straddle a lower mat is incompatible, not resizable"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-CARRIER-BAR-SEPARATE-LINE",
    domain: "support.bearing_mode",
    statement: "HC individual high chairs support upper steel directly or by means of a carrier bar \u2014 a separate span piece the chairs hold up, which then carries the mat. CHC exists to eliminate carrier bars. A modeled carrier bar is its own BOM line.",
    params: {},
    units: null,
    logic: "carrier bar = separate span element; never folded silently into chair quantity",
    source_ref: src("CMP-SUP-009", "HC TDS inspected facts"),
    corroborating_register_ids: ["CMP-SUP-008"],
    applicability: {},
    limits: ["concept verified by manufacturer data; a public-spec spacing basis for carrier/support bars is still unlicensed"],
    unsupported: ["carrier-bar spacing rules seen only in a private-document fragment \u2014 no public-spec analogue registered"],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.geometry — height semantics and tall-support constraints =====
  {
    rule_id: "SUP-GEOMETRY-HEIGHT-DEFINITION",
    domain: "support.geometry",
    statement: "A support's working height is the clearance it maintains between its bearing surface and the underside of the supported bar. For a bottom mat on a flat base, required support height equals the specified bottom cover.",
    params: {},
    units: "inches",
    logic: "support_height = bearing_face to underside-of-bar clearance",
    source_ref: src("CMP-SUP-005", "SBU height semantics"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-021"],
    applicability: {},
    limits: ["catalog heights are nominal values"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-STAND-HEIGHT",
    domain: "support.geometry",
    statement: "Needed stand height = target mat underside elevation minus support bearing-surface elevation. Top-mat target underside = slab top - top cover - bar diameter; bearing surface = pour base (base-resting) or lower-mat top (upper types).",
    params: {},
    units: "inches",
    logic: "needed_stand_height = target_underside_inches - bearing_surface_elevation_inches",
    source_ref: src("CMP-SUP-009", "HC duty pattern - upper steel held above base"),
    corroborating_register_ids: ["CMP-SUP-005", "CMP-SUP-003"],
    applicability: {},
    limits: ["derivation rule for the O-024 model contract; the catalog row still must prove the height fits"],
    unsupported: ["a target more than the catalog max above the bearing surface = incompatible, not a stretched chair"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-TALL-CHAIR-BRACING",
    domain: "support.geometry",
    statement: "Individual high chairs over 12 inches require cross bracing or lacing of legs \u2014 a hard catalog constraint, confirmed on the manufacturer technical data sheet.",
    params: { max_unbraced_height_inches: 12 },
    units: "inches",
    logic: "required_height_inches > max_unbraced_height_inches => braced/laced support or a different system, never a plain tall chair",
    source_ref: src("CMP-SUP-009", "HC TDS - chairs over 12 inches require cross bracing or lacing"),
    corroborating_register_ids: ["CMP-SUP-001"],
    applicability: { support_classes: ["individual"], products: ["hc", "hcp", "individual_high_chair"] },
    limits: ["bracing/lacing and its labor are separate cost items \u2014 they cannot disappear from the BOM"],
    unsupported: ["mat target >12 in above bearing with an unbraced plain chair"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-TALL-CHAIR-LEG-ANGLE",
    domain: "support.geometry",
    statement: "SureBuilt wire-size table: high-chair legs are held at 20 degrees or less of lean-in when the chair height exceeds 12 inches; wire diameter steps up with height (HC .162 -> .312 across the range).",
    params: { max_leg_angle_degrees: 20, applies_above_height_inches: 12 },
    units: "deg",
    logic: null,
    source_ref: src("CMP-SUP-011", "Bar Support Wire Size table - HC row"),
    corroborating_register_ids: ["CMP-SUP-009"],
    applicability: { support_classes: ["individual"], products: ["hc"] },
    limits: ["wire-diameter-by-height is catalog data; do not derive a capacity in pounds from wire diameter"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-VARIABLE-DEPTH",
    domain: "support.geometry",
    statement: "Variable-depth (haunched or crowned) slabs need variable-height chairs to hold the top-mat position \u2014 a non-constant mat elevation breaks a single-height stand grid.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-014", "11.41 placement and checking"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab", "deck"] },
    limits: [],
    unsupported: ["variable-depth slab with single-height support grid"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-GEOMETRY-LEG-UPTURN-MIN",
    domain: "support.geometry",
    statement: "All support legs are turned up a minimum of 1/8 inch; Iowa additionally requires upturned legs or a welded horizontal base bar, with legs cross-tied or nailed if needed to prevent spreading.",
    params: { min_leg_upturn_inches: 0.125 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-003", "handbook general notes"),
    corroborating_register_ids: ["CMP-SUP-013"],
    applicability: { support_classes: ["individual", "continuous"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.substrate — base-condition rules =====
  {
    rule_id: "SUP-SUBSTRATE-LOOSE-PLATE",
    domain: "support.substrate",
    statement: "Loosely compacted soil, rock, sand, carton forms or uneven bases require plate-bearing supports \u2014 the manufacturer pattern is a plate variant (HCP/SBP/BBP/CHCP) or an attached sand plate (R28, PSP, PTCSP); plates keep the support at elevation on loose substrate.",
    params: {},
    units: null,
    logic: "substrate class (firm form vs loose soil/sand/fill) is a support-selection input, not a height tweak",
    source_ref: src("CMP-SUP-007", "BBP allowed use and limits"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-002"],
    applicability: { substrates: ["loose_soil", "sand", "fill", "carton_form", "uneven"] },
    limits: ["a chair touching the bottom is not proof it will maintain mat elevation on a soft base"],
    unsupported: ["non-plate support on loose substrate"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SUBSTRATE-PROHIBITED-EMBEDS",
    domain: "support.substrate",
    statement: "No concrete block inserts, bricks, stones, wood blocks, wood stakes or similar embedded materials may be used as bar supports.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-013", "2404.03 E.4"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: ["improvised embeddable scraps as supports"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SUBSTRATE-NONOXIDIZING-FLATSLAB",
    domain: "support.substrate",
    statement: "Formed flat slabs are supported with plastic chairs, precast concrete blocks, or other non-oxidizing slab bolsters sized to position the steel exactly \u2014 a durability/staining requirement.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-016", "flat slab work - placing"),
    corroborating_register_ids: [],
    applicability: { member_types: ["flat_slab"] },
    limits: ["bright-basic wire chairs at a formed exposed face risk oxidation staining"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SUBSTRATE-MEMBRANE",
    domain: "support.substrate",
    statement: "On membrane or vapor-barrier bases, wide-base or ring-base plastic chairs reduce puncture risk \u2014 treat membrane protection as a substrate input.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-021", "Rebar-ups base ring fact"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { substrates: ["membrane", "vapor_barrier", "insulating_foam"] },
    limits: [],
    unsupported: ["point-load wire feet on puncture-sensitive membrane"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-SUBSTRATE-SUSPENDED-ALT",
    domain: "support.substrate",
    statement: "In footings without piling (e.g., culvert floors), reinforcement may be suspended from cross wales, supported on steel stakes driven into the subgrade, or supported on chairs \u2014 a codified alternative to bearing supports.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: [],
    applicability: { member_types: ["footing_mat"], usages: ["spread_foot"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DOBIE-FOOTING-BLOCK-FDOT",
    domain: "support.substrate",
    statement: "Footing mat steel is supported on precast concrete blocks not greater than 4 in x 4 in x plan clearance, fastened by cast-in wires; block strength equal to or greater than the surrounding concrete, moist-cured at least three days, with certification of concrete class/batch.",
    params: { max_block_face_inches: 4, min_moist_cure_days: 3, block_height_basis: "plan_clearance_inches" },
    units: "mixed",
    logic: "earth-bearing footing bottom mats: dobie block footprint <= 4x4, block height = plan bottom clearance",
    source_ref: src("CMP-SUP-015", "415 - footings"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { member_types: ["footing_mat"], support_classes: ["dobie"], substrates: ["earth", "loose_soil"] },
    limits: ["public-agency footing precedent \u2014 the codified earth-bearing answer"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-DOBIE-COLUMN-WALL-BLOCK-FDOT",
    domain: "support.substrate",
    statement: "Column and wall side spacing is maintained by precast blocks not exceeding 2 in x 2 in x required clearance, wired to the steel.",
    params: { max_block_face_inches: 2 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - columns and walls"),
    corroborating_register_ids: [],
    applicability: { member_types: ["column", "wall"], support_classes: ["dobie"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.compatibility — selection constraints =====
  {
    rule_id: "SUP-EPOXY-BARS-COATED-SUPPORTS",
    domain: "support.compatibility",
    statement: "Epoxy-coated bars require epoxy-coated steel or plastic bar supports and epoxy- or plastic-coated tie wires; epoxy wire can slide or break, so double-tie or use stronger ties where needed.",
    params: {},
    units: null,
    logic: "bar_coating epoxy => support finish must be coated/plastic and tie wire coated",
    source_ref: src("CMP-SUP-013", "2404.03 E"),
    corroborating_register_ids: ["CMP-SUP-014", "CMP-SUP-010"],
    applicability: { bar_coatings: ["epoxy"] },
    limits: [],
    unsupported: ["bare bright-basic supports or uncoated wire on epoxy bars"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-BARSIZE-PER-SKU",
    domain: "support.compatibility",
    statement: "Supported-bar size range is a per-catalog-row fact (PCC/PTC/PBC fit up to #8; Lotel chairs take #3-#5; PEZS takes #3-#10; foundation wheels take #7-#11). A bar outside the authored range is incompatible \u2014 it must not be clamped into the cradle list.",
    params: {},
    units: null,
    logic: "catalog row rebar_support_compatible_bar_sizes is authoritative per SKU",
    source_ref: src("CMP-SUP-003", "product bar-size fits"),
    corroborating_register_ids: ["CMP-SUP-021"],
    applicability: {},
    limits: [],
    unsupported: ["bar size outside the catalog compatibility list"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-DECK-PROFILE",
    domain: "support.compatibility",
    statement: "Metal-deck supports (HCM/CHCM/HCMD families) require the deck profile dimensions to order \u2014 support compatibility can depend on the bearing-surface profile, not just height.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-010", "HCMD ordering note"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { substrates: ["metal_deck"], products: ["hcm", "chcm", "hcmd"] },
    limits: [],
    unsupported: ["deck-profile support selected without deck profile dimensions"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-SUBFREEZING-SNAPON",
    domain: "support.compatibility",
    statement: "Lotel snap-on supports are not recommended for installation in subfreezing temperature \u2014 a placement-condition constraint on clip-on products.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-021", "Rebar-ups installation note"),
    corroborating_register_ids: [],
    applicability: { support_classes: ["snap_on"], products: ["lotel_rebar_ups", "lotel_mesh_ups"] },
    limits: [],
    unsupported: ["subfreezing installation of snap-on chairs"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-DRILLED-SHAFT-POSITIONER",
    domain: "support.compatibility",
    statement: "Drilled-shaft (caisson/pier) cages are positioned by cage wheels or centralizers engineered for #7-#11 bars, not by mat chairs \u2014 the support kind differs wholesale.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-003", "BarTender wheel and Paragon centralizer facts"),
    corroborating_register_ids: [],
    applicability: { member_types: ["drilled_shaft", "pillar_cage"], support_classes: ["positioner"] },
    limits: [],
    unsupported: ["chair/bolster selection for a drilled-shaft cage"],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.compatibility — pillar-bar / base-plate entries (O-111) =====
  {
    rule_id: "SUP-COMPAT-PILLAR-BAR-LONGITUDINAL",
    domain: "support.compatibility",
    statement: "A pillar/column cage's longitudinal bars run vertically through the shaft \u2014 the pillar bar is the cage's vertical member carried on the cage's own stand, not a slab-chair/bolster selection. The pillar bar's support kind is the drilled-shaft/cage class, never a flat-slab chair.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-003", "cage vs slab support taxonomy \u2014 drilled-shaft cages are positioned by wheels/centralizers, not mat chairs"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-010"],
    applicability: { member_types: ["pillar", "pillar_cage", "drilled_shaft"], support_classes: ["positioner", "cage_stand"] },
    limits: [],
    unsupported: ["a pillar bar's vertical bar size/count is a structural design input, not a register constant \u2014 the entry records the support kind only"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-COMPAT-BASE-PLATE-ON-SHAFT",
    member_types: ["base_plate"],
    usages: ["sign_pole", "shaft_mount"],
    statement: "A base plate mounts the sign pole on the drilled shaft's top \u2014 the plate's support kind is the shaft-mount class, not a flat-slab chair. The base plate's support is the shaft's top bearing, never a mat support.",
    usage_note: "base_plate member_types + sign_pole/shaft_mount usages record the support-kind distinction",
    source_ref: src("CMP-SUP-024", "base-plate mounting via manufacturer catalog", "candidate"),
    rule_version: "1.0.0",
    status: "active",
    unsupported: ["base-plate anchor bolt sizing is a structural design input, not a register constant \u2014 the entry records the support kind only"]
  },
  {
    rule_id: "SUP-PLACE-PILLAR-CAGE-STAND",
    domain: "support.placement",
    member_types: ["pillar", "pillar_cage", "drilled_shaft"],
    usages: ["cage_stand"],
    statement: "The pillar cage's cage_stand is a separate support from the footing mat \u2014 each mat is independently supported (corpus: 'each mat independently supported'). The cage_stand carries the cage's longitudinal bars; it never doubles as the mat's chair.",
    usage_note: "cage_stand usages on pillar/drilled-shaft member types record the independent-support rule",
    source_ref: src("CMP-SUP-013", "each mat independently supported (Iowa DOT 2404 / Utah APWA spacing ceilings)"),
    rule_version: "1.0.0",
    status: "active",
    unsupported: ["cage-stand count/spacing is a structural design input, not a register constant \u2014 the entry records the independent-support rule only"]
  },
  {
    rule_id: "SUP-PLACE-BASE-PLATE-LOOSE-SOIL",
    domain: "support.placement",
    member_types: ["base_plate"],
    usages: ["shaft_mount"],
    statement: "A base plate on loose soil requires a bearing plate \u2014 'plates required on loose soil' (corpus critical rule). A base plate on undisturbed/competent soil carries the shaft mount directly; loose soil holds the plate requirement, never a silent default.",
    usage_note: "base_plate member_types + shaft_mount usages record the loose-soil plate requirement",
    source_ref: src("CMP-SUP-013", "plates required on loose soil (manufacturer placement guidance)"),
    rule_version: "1.0.0",
    status: "active",
    unsupported: ["plate sizing is a structural design input, not a register constant \u2014 the entry records the loose-soil requirement only"]
  },
  // ===== support.catalog — catalog-row modeling rules =====
  {
    rule_id: "SUP-CATALOG-PER-SKU-RANGES",
    domain: "support.catalog",
    statement: "Height ranges and increments are per-manufacturer per-SKU facts \u2014 Dayton HC runs 2-15 in, Meadow Burke HC 2-40 in, Dayton SB 3/4-3 in while SureBuilt SB runs 3/4-7 in. Catalog data lives on the SKU row, never as a global type constant.",
    params: {},
    units: "inches",
    logic: "store height_min/height_max/increment per inventory row",
    source_ref: src("CMP-SUP-010", "cross-manufacturer range comparison"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-011"],
    applicability: {},
    limits: [],
    unsupported: ["required height outside the selected product's verified range = incompatibility, not a stretched value"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-CATALOG-BELOWGRADE-TAGGING",
    domain: "support.catalog",
    statement: "The manufacturer application matrix tags foundation/below-grade use for cementitious dobies, plastic chairs, foundation wheels/centralizers and side-form spacers \u2014 Dayton metal wire chair/bolster families are NOT tagged for foundation/below-grade. An untagged wire chair on an earth-bearing footing bottom mat gets flagged for review, not silently selected.",
    params: {},
    units: null,
    logic: "foundation_usage tagging is a manufacturer-stated applicability boundary",
    source_ref: src("CMP-SUP-003", "product application matrix"),
    corroborating_register_ids: [],
    applicability: { usages: ["spread_foot"], substrates: ["earth", "loose_soil"] },
    limits: ["a manufacturer application claim, not a structural adequacy proof"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-CATALOG-HCP-HEIGHT-CONFLICT-HELD",
    domain: "support.catalog",
    statement: "Dayton HCP product page is internally inconsistent: Cover Height section says 2-12 in in 1/4-in increments while the Features section claims 1/2-15 in. Neither interval is authoritative from this page alone.",
    params: { page_cover_height_min_inches: 2, page_cover_height_max_inches: 12, page_features_height_min_inches: 0.5, page_features_height_max_inches: 15 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-002", "inspected product facts and conflict", false),
    corroborating_register_ids: [],
    applicability: { products: ["hcp"] },
    limits: ["HELD: unresolved manufacturer-internal inconsistency; cannot authorize an automatic 0.5-15 in range"],
    unsupported: ["any automatic height-range claim for HCP until the TDS is inspected"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-CATALOG-SBU-RANGE-DISPUTED-HELD",
    domain: "support.catalog",
    statement: "SBU product-specification height is 3/4-5 in on the Dayton TDS while the Dayton handbook body text says 3/4-3 in \u2014 an unresolved manufacturer-internal discrepancy; do not assume the deeper range without SKU-level confirmation.",
    params: { tds_height_max_inches: 5, handbook_height_max_inches: 3, documented_height_min_inches: 0.75 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-005", "product specification vs handbook discrepancy"),
    corroborating_register_ids: ["CMP-SUP-003"],
    applicability: { products: ["sbu"] },
    limits: ["HELD: verified sources conflict; the deeper range stays unconfirmed at SKU level"],
    unsupported: ["assuming the 5-inch top end without SKU-level confirmation"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-CATALOG-UNIT-LENGTHS",
    domain: "support.catalog",
    statement: "Continuous-support unit length is a per-row fact: wire bolsters run 5 ft standard, Aztec PSBB is 30-in interlocking sections (5 ft/10 ft packs), Meadow Burke composite bolsters are true 60 in, and CS continuous support has a 7 ft usable span billed as 8 ft.",
    params: { standard_wire_unit_length_inches: 60 },
    units: "inches",
    logic: "linear-feet quantity = ceil(run_length / unit_length) per row; pack arithmetic differs across families",
    source_ref: src("CMP-SUP-003", "product unit lengths"),
    corroborating_register_ids: ["CMP-SUP-010", "CMP-SUP-012"],
    applicability: { support_classes: ["continuous"] },
    limits: ["ordering increments and pack basis still require live inventory data; no cost basis established by these facts"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-CATALOG-LOAD-RATING-FIELD",
    domain: "support.catalog",
    statement: '"CRSI Load Category" marks (SB/SBU 200 lb, PSBB 400 lb) and point ratings (BB 2-inch = 180 lb point / 270 plf, PHC <= 500 lb) are manufacturer-declared rating classes \u2014 store as a catalog rating field, never as a structural-adequacy proof for a given mat.',
    params: {},
    units: "lb",
    logic: null,
    source_ref: src("CMP-SUP-012", "CRSI Load Category 400 lb mark"),
    corroborating_register_ids: ["CMP-SUP-004", "CMP-SUP-005", "CMP-SUP-006"],
    applicability: {},
    limits: ["the defining documents (CRSI RB4.1) were not inspected \u2014 O-120"],
    unsupported: ["converting a declared rating into a per-mat adequacy claim"],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== support.finish — corrosion class rules =====
  {
    rule_id: "SUP-FINISH-CLASS-SYSTEM",
    domain: "support.finish",
    statement: "CRSI support finish classes: Class 1 plastic-protected (severe exposure / grinding or sandblasting required); Class 1A epoxy/vinyl/plastic-coated (moderate-to-maximum exposure, no grinding \u2014 typical with epoxy bars); Class 2A/2B stainless-protected (moderate exposure + light grinding under 1/16 in; non-stainless wire setback 1/4 in (2A) / 3/4 in (2B) from the face); Class 3 bright basic (no protection, no exposed-surface contact).",
    params: { class_2a_setback_inches: 0.25, class_2b_setback_inches: 0.75 },
    units: "inches",
    logic: "coating class is a catalog attribute driven by bar coating + exposure surface + ground contact",
    source_ref: src("CMP-SUP-003", "Rust Prevention / support classes"),
    corroborating_register_ids: ["CMP-SUP-010"],
    applicability: {},
    limits: ["class system per manufacturer-declared compliance; defining CRSI documents uninspected"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-FINISH-EPOXY-BARS-CLASS-1A",
    domain: "support.finish",
    statement: "Class 1A epoxy/vinyl/plastic-coated bright-basic wire is the standard support finish for epoxy-coated bars (moderate to maximum exposure where no grinding or sandblasting is required).",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-003", "support classes"),
    corroborating_register_ids: ["CMP-SUP-010", "CMP-SUP-013"],
    applicability: { bar_coatings: ["epoxy"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "SUP-FINISH-PLASTIC-ALL-CLASSES",
    domain: "support.finish",
    statement: "Plastic (all-plastic/composite) supports are permitted for all corrosion-resistance classifications \u2014 they sidestep the wire-finish class question.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-003", "Rust Prevention note"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== tie.pattern — where ties are required =====
  {
    rule_id: "TIE-INTERSECTIONS-ALL-OR-ALTERNATE",
    domain: "tie.pattern",
    statement: "Tie reinforcing bars at all intersections; where bar spacing is less than 12 inches in each direction, tie alternate intersections instead (Iowa and Utah APWA adopt the same pattern).",
    params: { alternate_tie_bar_spacing_lt_inches: 12 },
    units: "inches",
    logic: "bar_spacing < 12 in each direction => alternate intersections; otherwise tie all",
    source_ref: src("CMP-SUP-013", "2404.03 D"),
    corroborating_register_ids: ["CMP-SUP-016"],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-TOPMAT-DOWN-MAX",
    domain: "tie.pattern",
    statement: "Top mat tied down at not greater than 4 ft spacing in each direction with at least 50% of bar contacts tied, concentrated near ends and curbs (bridge-floor practice).",
    params: { max_tiedown_spacing_inches_each_way: 48, min_tied_contact_fraction: 0.5 },
    units: "mixed",
    logic: null,
    source_ref: src("CMP-SUP-014", "11.41 bridge floors"),
    corroborating_register_ids: [],
    applicability: { mat_layers: ["upper"] },
    limits: ["bridge-deck inspector guidance \u2014 heavier-duty than light sign work but a valid public ceiling"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-FOOTING-PATTERN-FDOT",
    domain: "tie.pattern",
    statement: "Footing mats are tied with a double-strand single tie at all periphery intersections and alternate intersections within the mat.",
    params: {},
    units: null,
    logic: "periphery all-tied double-strand + interior alternate",
    source_ref: src("CMP-SUP-015", "415 - footings"),
    corroborating_register_ids: [],
    applicability: { member_types: ["footing_mat"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-WALL-COLUMN-PATTERNS-FDOT",
    domain: "tie.pattern",
    statement: "Retaining-wall steel is tied cross/figure-8 at every periphery intersection and every third interior intersection (more if the mat is used as a ladder); columns get a cross or figure-8 tie at every hoop intersection.",
    params: { wall_interior_tie_every_nth: 3 },
    units: "count",
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - walls and columns"),
    corroborating_register_ids: [],
    applicability: { member_types: ["wall", "column"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-STAINLESS-FRP-WIRE",
    domain: "tie.pattern",
    statement: "Stainless bars use plastic/polymer/nylon-coated or ASTM A276 UNS S31600 stainless tie wire; FRP reinforcement uses coated wire.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - tie wire"),
    corroborating_register_ids: [],
    applicability: { bar_coatings: ["stainless", "frp"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-EPOXY-WIRE-DOUBLE",
    domain: "tie.pattern",
    statement: "Epoxy-coated tie wire can slide or break on epoxy bars \u2014 double-tie or use stronger ties where needed.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-014", "epoxy-coated bar note"),
    corroborating_register_ids: ["CMP-SUP-013"],
    applicability: { bar_coatings: ["epoxy"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== tie.wire — material rules =====
  {
    rule_id: "TIE-WIRE-GAUGE-MIN",
    domain: "tie.wire",
    statement: "Tie wire minimum 16-gage annealed type or an acceptable patented system; heavily reinforced work steps to 15- or 14-gauge (or double-strand).",
    params: { max_tie_wire_gauge_awg: 16, heavy_work_gauge_awg: [15, 14] },
    units: "awg",
    logic: "minimum 16-gage means the AWG NUMBER must be <= 16 (heavier wire = smaller number); patented mechanical systems are an allowed alternative",
    source_ref: src("CMP-SUP-016", "accessory materials"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-WIRE-WEIGHT-PER-TON",
    domain: "tie.wire",
    statement: "About 12 pounds of tie wire per average ton of bars \u2014 an estimating quantity basis, not a structural value.",
    params: { approx_tie_wire_lb_per_ton_bars: 12 },
    units: "lb_per_ton",
    logic: "tie_wire_lb = approx_tie_wire_lb_per_ton_bars * bar_weight_tons",
    source_ref: src("CMP-SUP-017", "placing and tying"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["dated military-manual average; corroborating estimate basis, not a spec value"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-WIRE-NO-STRENGTH",
    domain: "tie.wire",
    statement: "Tie wire adds NOTHING to structural strength \u2014 it only holds bar position during placement.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-017", "placing and tying"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: ["crediting tie wire with structural capacity"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "TIE-TYPES-TAXONOMY",
    domain: "tie.wire",
    statement: "Six tie types with stated uses: snap/simple tie (floor slabs), wall tie (light vertical mats), double-strand single tie (heavy work), saddle/U tie (special locations e.g. walls), saddle tie with twist (mats crane-lifted), cross/figure-8 tie (little or no bar twist; columns, retaining walls).",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-017", "tie types"),
    corroborating_register_ids: ["CMP-SUP-015"],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== clearance.cover — cover floors (verified-as-quoted ACI values) =====
  {
    rule_id: "CLR-COVER-EARTH-CAST-FOOTING",
    domain: "clearance.cover",
    statement: "Concrete cast against and permanently exposed to earth (footing bottoms and sides): minimum cover 3 inches. A sign footing poured against earth is a 3-inch class.",
    params: { min_cover_inches: 3 },
    units: "inches",
    logic: "earth-cast footing support height = 3 in bottom cover at the bearing face",
    source_ref: src("CMP-SUP-023", "ACI 20.5.1.3.1 values via public quotation"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: { exposures: ["cast_against_earth"], member_types: ["footing_mat", "grade_beam"] },
    limits: ["value via public quotation of a paid standard; ACI 318 itself uninspected (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-COVER-FORMED-EXPOSED-GT5",
    domain: "clearance.cover",
    statement: "Formed cast-in-place concrete exposed to earth or weather: minimum cover 2 inches for #6 through #18 bars.",
    params: { min_cover_inches: 2 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-023", "ACI 20.5.1.3.1 values via public quotation"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: { exposures: ["formed_earth_or_weather"], bar_size_class: "gt_#5" },
    limits: ["verified-as-quoted, not inspected at source"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-COVER-FORMED-EXPOSED-LE5",
    domain: "clearance.cover",
    statement: "Formed cast-in-place concrete exposed to earth or weather: minimum cover 1-1/2 inches for #5 and smaller bars.",
    params: { min_cover_inches: 1.5 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-023", "ACI 20.5.1.3.1 values via public quotation"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: { exposures: ["formed_earth_or_weather"], bar_size_class: "le_#5" },
    limits: ["verified-as-quoted, not inspected at source"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-COVER-INTERIOR",
    domain: "clearance.cover",
    statement: "Not-exposed interior members: slabs/walls/joists 3/4 inch for #11 and smaller (1-1/2 in for #14/#18); beams and columns primary reinforcement plus ties 1-1/2 inches; shells 3/4 in (#6+) / 1/2 in (#5 and smaller).",
    params: { interior_slabs_le11_inches: 0.75, interior_beams_columns_inches: 1.5, interior_shells_gt5_inches: 0.75, interior_shells_le5_inches: 0.5 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-023", "interior exposure rows via public quotation"),
    corroborating_register_ids: ["CMP-SUP-017"],
    applicability: { exposures: ["interior"] },
    limits: ["verified-as-quoted, not inspected at source"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== clearance.tolerance — placement tolerances =====
  {
    rule_id: "CLR-TOL-FDOT-PLACEMENT",
    domain: "clearance.tolerance",
    statement: "FDOT placement tolerances: bar spacing +/-1 inch from plan; concrete cover -1/4 to +1/2 inch from plan.",
    params: { bar_spacing_tol_inches: 1, cover_tol_minus_inches: 0.25, cover_tol_plus_inches: 0.5 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - tolerances"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-TOL-FDOT-FOOTING-MAT",
    domain: "clearance.tolerance",
    statement: "Footing mat placed within 1/2 inch vertically of plan bottom clearance and within 1 inch of plan side clearance.",
    params: { vertical_position_tol_inches: 0.5, side_clearance_tol_inches: 1 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - footings"),
    corroborating_register_ids: [],
    applicability: { member_types: ["footing_mat"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-TOL-IOWA-PLACEMENT",
    domain: "clearance.tolerance",
    statement: "Iowa inspector tolerances: bar spacing within 1/2 inch of specified; edge and end clearances plan value minus zero / plus 1/2 inch; deck bottom clearance -1/8/+1/4 inch; top-mat depth held within -1/4 inch; slab thickness -0/+3/4 inch; cover over top mat nominal minus 1/8 inch.",
    params: { bar_spacing_tol_inches: 0.5, edge_end_clearance_plus_inches: 0.5, bottom_clearance_minus_inches: 0.125, bottom_clearance_plus_inches: 0.25, top_mat_depth_minus_inches: 0.25, slab_thickness_plus_inches: 0.75 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-014", "11.40-11.41 tolerances"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["bridge-work inspector guidance"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "CLR-CATALOG-NOMINAL-TOLERANCE",
    domain: "clearance.tolerance",
    statement: "Catalog support heights are nominal \u2014 placement tolerances mean a minus-1/8-inch working tolerance exists in practice; a support at its exact nominal limit has no margin.",
    params: { nominal_height_minus_inches: 0.125 },
    units: "inches",
    logic: "flag when required height sits within tolerance band of the catalog limit",
    source_ref: src("CMP-SUP-014", "clearance tolerance basis"),
    corroborating_register_ids: ["CMP-SUP-015"],
    applicability: {},
    limits: ["inference from stated placement tolerances, not a catalog print spec"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== stock.* — reinforcement stock rules =====
  {
    rule_id: "STOCK-LAP-SPLICE-DEFAULT",
    domain: "stock.splice",
    statement: "Where lap splices are not dimensioned on the plans, lap not less than 30 bar diameters nor less than 12 inches.",
    params: { min_lap_bar_diameters: 30, min_lap_inches: 12 },
    units: "mixed",
    logic: "lap_length = max(30 * bar_diameter, 12 in)",
    source_ref: src("CMP-SUP-017", "default lap splice guidance"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["dated military manual; a dimensioned plan or governing spec supersedes"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "STOCK-MESH-LAP-PATTERN",
    domain: "stock.splice",
    statement: "Welded-wire mesh: end-lap tied at 1 ft 6 in centers with a snap tie; side-lap tied at 3 ft with a snap tie.",
    params: { mesh_end_lap_tie_spacing_inches: 18, mesh_side_lap_tie_spacing_inches: 36 },
    units: "inches",
    logic: null,
    source_ref: src("CMP-SUP-017", "wire-mesh lap guidance"),
    corroborating_register_ids: [],
    applicability: { member_types: ["slab_on_grade"] },
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "STOCK-DOWEL-TEMPLATE-FDOT",
    domain: "stock.placement",
    statement: "Dowel bars projecting into columns or walls are positioned by a rigid template BEFORE the footing pour \u2014 never inserted into plastic concrete.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - dowel bars"),
    corroborating_register_ids: [],
    applicability: { member_types: ["footing_mat", "column", "wall"] },
    limits: [],
    unsupported: ["dowels pushed into plastic concrete"],
    rule_version: "1.0.0",
    status: "active"
  },
  {
    rule_id: "STOCK-STORAGE-ABOVE-GROUND",
    domain: "stock.placement",
    statement: "Reinforcement is stored above ground on platforms or skids; thin tight rust is acceptable but section loss is a rejection cause; no field welding or flame cutting without approval.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-015", "415 - storage"),
    corroborating_register_ids: [],
    applicability: {},
    limits: [],
    unsupported: [],
    rule_version: "1.0.0",
    status: "active"
  },
  // ===== authority.marker — paid-standard citation markers (O-120) =====
  {
    rule_id: "AUTH-CRSI-MSP-HELD",
    domain: "authority.marker",
    statement: "CRSI Manual of Standard Practice (referenced as 28th/29th edition by manufacturers) is the industry-standard bar-support and placing authority that Iowa DOT, FDOT, Utah APWA and every manufacturer catalog defer to by name. Contents are paid and were not inspected.",
    params: {},
    units: null,
    logic: "any rule phrased 'per CRSI MSP' in output is a citation of this marker, not verified content",
    source_ref: src("CMP-SUP-024", "CRSI Manual of Standard Practice marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-013", "CMP-SUP-015", "CMP-SUP-016"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120); no content reproduced"],
    unsupported: ["licensed MSP copy required before MSP-specific values can gate"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-CRSI-PRB-HELD",
    domain: "authority.marker",
    statement: 'CRSI "Placing Reinforcing Bars" (9th/10th ed) is cited by spec writers as the definitive jobsite placement resource; its Chapter 10 covers bar supports and Chapter 12 footings. Only the free TOC was inspected; content is paid.',
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-018", "PRB 10th-edition TOC + 2011 press release", "candidate"),
    corroborating_register_ids: ["CMP-SUP-024"],
    applicability: {},
    limits: ["HELD: TOC verified, numeric content candidate until licensed"],
    unsupported: ["the footing dobie 4-per-mat rule stays held until PRB is licensed"],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-ACI-315-HELD",
    domain: "authority.marker",
    statement: 'ACI 315 / ACI 315R "Details and Detailing of Concrete Reinforcement" is repeatedly named as the installation basis on manufacturer data sheets ("Per ACI 315-99"). Not inspected \u2014 citation marker only.',
    params: {},
    units: null,
    logic: "estimator output must not claim 'per ACI 315' until the standard is licensed and read",
    source_ref: src("CMP-SUP-024", "ACI 315 marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-004", "CMP-SUP-008"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-ACI-318-HELD",
    domain: "authority.marker",
    statement: 'ACI 318 "Building Code Requirements for Structural Concrete" holds the cover table whose values appear in CLR-COVER-* via public quotation (CMP-SUP-023). The standard itself was not inspected.',
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "ACI 318 marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-023"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-ACI-301-HELD",
    domain: "authority.marker",
    statement: 'ACI 301 "Specifications for Structural Concrete" is the typical building-spec source of the chair/bolster spacing clauses seen in public agency specs. Not inspected \u2014 citation marker only.',
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "ACI 301 marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-016"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-CRSI-RB41-HELD",
    domain: "authority.marker",
    statement: 'CRSI RB4.1-2022 (bar-support product standard) and the "CRSI Load Category" ratings (200/400 lb) are manufacturer-declared compliance marks; the defining documents were not inspected.',
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "CRSI RB4.1 marker", "candidate"),
    corroborating_register_ids: ["CMP-SUP-003", "CMP-SUP-012"],
    applicability: {},
    limits: ["HELD: paid standard \u2014 citation marker only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-ASTM-AASHTO-MATERIAL-HELD",
    domain: "authority.marker",
    statement: "Material spec markers referenced by the corpus: ASTM A1064 (support wire), A615/A706 (bars), A184/A185 (welded wire), A775 (epoxy), A493 (stainless wire), AASHTO M254 (bar supports). Not inspected \u2014 citation markers only.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "ASTM/AASHTO spec list", "candidate"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["HELD: paid/restricted standards \u2014 citation markers only (O-120)"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  {
    rule_id: "AUTH-WHITACRE-TAXONOMY-HELD",
    domain: "authority.marker",
    statement: "Whitacre Rebar product line corroborates the support-type taxonomy breadth (composite/high chairs, sand plates, mesh and paving chairs, double-mat extensions, shims, side-form spacers, tie wire) \u2014 captured via search-index extraction only.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-020", "product page via search-index text", "candidate"),
    corroborating_register_ids: [],
    applicability: {},
    limits: ["HELD: page captured without data-sheet depth; taxonomy corroboration only"],
    unsupported: [],
    rule_version: "1.0.0",
    status: "held"
  },
  // ===== method.* — O-113 skeleton encoding (registered-but-unencoded method
  // rules; status "held" until a real cited method lands). =====
  {
    rule_id: "METHOD-SIGN-WIND-HELD",
    domain: "method.sign_wind",
    statement: "Sign wind load basis is held pending a real cited sign-wind method; no invented force/area/eccentricity formula is encoded.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no sign-wind method is encoded; the authored sign_wind design-basis field carries the operator's basis"],
    unsupported: ["wind force/area/height/eccentricity method; solid-vs-open sign treatment; single/twin support"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-FOOTING-BEARING-HELD",
    domain: "method.footing",
    statement: "Spread-footing bearing/overturning/sliding/uplift basis is held pending a real cited footing method; no invented 'adequate' flag is encoded.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no footing check is encoded; the authored footing_basis field carries the operator's basis"],
    unsupported: ["bearing/overturning/sliding/uplift/frost as distinct checks"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-SHAFT-HELD",
    domain: "method.shaft",
    statement: "Drilled-shaft/embedded-pole basis is held pending a real cited shaft method; lateral soil pressure vs vertical bearing is not encoded.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no shaft method is encoded; the authored shaft_basis field carries the operator's basis"],
    unsupported: ["constrained/nonconstrained; depth/soil limits; lateral soil pressure vs vertical bearing"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-PILLAR-BAR-HELD",
    domain: "method.pillar_bar",
    statement: "Pillar longitudinal-bar sizing/placement basis is held pending a real cited method; the design-basis field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no pillar-bar method is encoded; the authored pillar_bar field carries the operator's basis"],
    unsupported: ["pillar-bar sizing; base-plate connection detailing"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-BASE-PLATE-HELD",
    domain: "method.base_plate",
    statement: "Base-plate sizing/anchor basis is held pending a real cited method; the design-basis field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no base-plate method is encoded; the authored base_plate field carries the operator's basis"],
    unsupported: ["base-plate sizing; anchor layout"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-LATERAL-HELD",
    domain: "method.lateral",
    statement: "Lateral-load/footing-lateral basis is held pending a real cited method; the design-basis field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no lateral-load method is encoded; the authored lateral field carries the operator's basis"],
    unsupported: ["lateral-load sizing; footing lateral resistance"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "METHOD-FROST-HELD",
    domain: "method.frost_depth",
    statement: "Frost-depth/footing-depth basis is held pending a real cited method; the design-basis field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no frost-depth method is encoded; the authored frost_depth field carries the operator's basis"],
    unsupported: ["frost-depth sizing; footing embedment"],
    rule_version: "0.0.0",
    status: "held"
  }
]);
function gatedChecks(params) {
  const checks = [];
  for (const key of Object.keys(params)) {
    const prefix = GATED_PREFIXES.find((p) => key.startsWith(p));
    if (!prefix) {
      checks.push({ key, gated: false, param: key, comparator: "informational", limit: params[key] });
      continue;
    }
    const comparator = prefix.slice(0, -1);
    checks.push({ key, gated: true, param: key.slice(prefix.length), comparator, limit: params[key] });
  }
  return checks;
}
function normalizeRule(rule) {
  const errors = [];
  const warnings = [];
  if (!isRecord2(rule)) return { ok: false, errors: ["rule must be a plain record"], warnings };
  const rule_id = text(rule.rule_id);
  if (!rule_id || !RULE_ID.test(rule_id)) errors.push("rule_id must be an UPPER-KEBAB stable identifier");
  const domain = text(rule.domain);
  if (!domain || !DOMAIN_ID.test(domain)) errors.push("domain must be a lowercase dotted identifier");
  const statement = text(rule.statement);
  if (!statement || statement.length > 4e3) errors.push("statement must be 1-4000 characters");
  const params = rule.params === void 0 ? {} : rule.params;
  if (!isRecord2(params)) errors.push("params must be a plain record when present");
  else {
    for (const [key, value] of Object.entries(params)) {
      if (!text(key)) errors.push("params keys must be nonempty strings");
      if (typeof value === "number" && !Number.isFinite(value)) errors.push(`params.${key} must be finite`);
      if (![null, "number", "string", "boolean"].includes(value === null ? null : typeof value) && !Array.isArray(value)) {
        errors.push(`params.${key} has an unsupported value type`);
      }
    }
  }
  const sref = rule.source_ref;
  if (!isRecord2(sref)) {
    errors.push("source_ref is required for every registry rule");
  } else {
    if (!text(sref.register_id) || !REGISTER_ID.test(sref.register_id)) {
      errors.push("source_ref.register_id must match the CMP-SUP-### register-id shape");
    }
    if (!text(sref.authority)) errors.push("source_ref.authority is required");
    if (!text(sref.title)) errors.push("source_ref.title is required");
    if (!VERIFIED_VALUES.has(sref.verified)) {
      errors.push("source_ref.verified must be true, false or 'candidate'");
    }
    if (sref.edition !== void 0 && sref.edition !== null && typeof sref.edition !== "string") {
      errors.push("source_ref.edition must be a string or null");
    }
    if (sref.section !== void 0 && sref.section !== null && typeof sref.section !== "string") {
      errors.push("source_ref.section must be a string or null");
    }
    if (sref.url !== void 0 && sref.url !== null && typeof sref.url !== "string") {
      errors.push("source_ref.url must be a string or null");
    }
  }
  let status = text(rule.status) || "active";
  if (!STATUSES.has(status)) {
    errors.push("status must be 'active' or 'held'");
    status = "held";
  }
  if (isRecord2(sref) && sref.verified !== true && status === "active") {
    warnings.push(`rule ${rule_id} declared active with source verified=${String(sref.verified)}; coerced to held`);
    status = "held";
  }
  const rule_version = text(rule.rule_version);
  if (!rule_version || !SEMVER.test(rule_version)) errors.push("rule_version must be semver (x.y.z)");
  const applicability = rule.applicability === void 0 ? {} : rule.applicability;
  if (!isRecord2(applicability)) {
    errors.push("applicability must be a plain record when present");
  } else {
    for (const [key, value] of Object.entries(applicability)) {
      if (APPLICABILITY_LIST_KEYS.has(key)) {
        if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
          errors.push(`applicability.${key} must be an array of nonempty strings`);
        }
      } else if (key === "bar_size_class") {
        if (!["le_#5", "gt_#5", null, void 0].includes(value)) {
          errors.push("applicability.bar_size_class must be 'le_#5', 'gt_#5' or null");
        }
      } else {
        warnings.push(`applicability key '${key}' is not a registered filter dimension; it is kept as documentation`);
      }
    }
  }
  for (const listKey of ["limits", "unsupported", "corroborating_register_ids"]) {
    const list2 = rule[listKey];
    if (list2 !== void 0 && (!Array.isArray(list2) || list2.some((entry) => typeof entry !== "string" || !entry.trim()))) {
      errors.push(`${listKey} must be an array of strings when present`);
    }
  }
  if (Array.isArray(rule.corroborating_register_ids)) {
    for (const id of rule.corroborating_register_ids) {
      if (!REGISTER_ID.test(id)) errors.push(`corroborating_register_ids entry '${id}' is not a register-id shape`);
    }
  }
  if (rule.units !== void 0 && rule.units !== null && typeof rule.units !== "string") {
    errors.push("units must be a string or null");
  }
  if (rule.logic !== void 0 && rule.logic !== null && typeof rule.logic !== "string") {
    errors.push("logic must be a string or null");
  }
  if (errors.length) return { ok: false, errors, warnings };
  const normalized = deepFreeze({
    rule_id,
    domain,
    statement,
    params: { ...params },
    units: rule.units ?? null,
    logic: rule.logic ?? null,
    source_ref: {
      register_id: sref.register_id.trim(),
      authority: sref.authority.trim(),
      title: sref.title.trim(),
      edition: sref.edition ?? null,
      section: sref.section ?? null,
      url: sref.url ?? null,
      verified: sref.verified
    },
    corroborating_register_ids: Array.isArray(rule.corroborating_register_ids) ? [...rule.corroborating_register_ids] : [],
    applicability: { ...applicability },
    limits: Array.isArray(rule.limits) ? [...rule.limits] : [],
    unsupported: Array.isArray(rule.unsupported) ? [...rule.unsupported] : [],
    rule_version,
    status
  });
  return { ok: true, rule: normalized, errors: [], warnings };
}
function foundationBarSizeClass(barSize) {
  const raw = typeof barSize === "string" ? barSize.trim() : "";
  const match = raw.match(/^#?(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 2 || n > 18) return null;
  return n <= 5 ? "le_#5" : "gt_#5";
}
function ruleAppliesTo(rule, context) {
  const a = rule.applicability || {};
  const check = (list2, value) => {
    if (!Array.isArray(list2) || !list2.length || value === void 0 || value === null || value === "") return true;
    return list2.includes(value);
  };
  if (!check(a.usages, context.usage)) return false;
  if (!check(a.member_types, context.member_type)) return false;
  if (!check(a.support_classes, context.support_class)) return false;
  if (!check(a.bearing_modes, context.bearing_mode)) return false;
  if (!check(a.substrates, context.substrate)) return false;
  if (!check(a.bar_coatings, context.bar_coating)) return false;
  if (!check(a.bar_sizes, context.bar_size)) return false;
  if (!check(a.products, context.product)) return false;
  if (!check(a.mat_layers, context.mat_layer)) return false;
  if (!check(a.exposures, context.exposure)) return false;
  if (typeof a.bar_size_class === "string") {
    const have = context.bar_size_class ?? foundationBarSizeClass(context.bar_size);
    if (have !== null && have !== void 0 && have !== a.bar_size_class) return false;
  }
  return true;
}
var byRuleId = (a, b) => a.rule_id.localeCompare(b.rule_id);
function createFoundationRuleRegistry(seedRules = FOUNDATION_RULE_SEEDS) {
  const byId = /* @__PURE__ */ new Map();
  const errors = [];
  function registerRule(candidate) {
    const verdict = normalizeRule(candidate);
    if (!verdict.ok) return { ok: false, errors: verdict.errors, warnings: verdict.warnings };
    const rule = verdict.rule;
    if (byId.has(rule.rule_id)) {
      return { ok: false, errors: [`duplicate rule_id '${rule.rule_id}'`], warnings: verdict.warnings };
    }
    byId.set(rule.rule_id, rule);
    return { ok: true, rule, errors: [], warnings: verdict.warnings };
  }
  for (const seed of Array.isArray(seedRules) ? seedRules : []) {
    const verdict = registerRule(seed);
    if (!verdict.ok) errors.push({ rule_id: isRecord2(seed) ? seed.rule_id ?? null : null, errors: verdict.errors });
  }
  function lookupRule(rule_id) {
    return byId.get(rule_id) ?? null;
  }
  function allRules({ includeHeld = true } = {}) {
    return [...byId.values()].filter((rule) => includeHeld || rule.status === "active").sort(byRuleId);
  }
  function rulesForDomain(domain, context = {}, { includeHeld = false } = {}) {
    const want = text(domain);
    const ctx = isRecord2(context) ? context : {};
    return [...byId.values()].filter((rule) => includeHeld || rule.status === "active").filter((rule) => !want || want === "*" || rule.domain === want || rule.domain.startsWith(want + ".")).filter((rule) => ruleAppliesTo(rule, ctx)).sort(byRuleId);
  }
  function assertParamsAgainstRule(ruleOrId, actualParams = {}) {
    const rule = isRecord2(ruleOrId) ? ruleOrId : lookupRule(ruleOrId);
    if (!rule) {
      return { ok: false, verdict: "rule_not_found", rule_id: isRecord2(ruleOrId) ? ruleOrId.rule_id ?? null : ruleOrId ?? null, checks: [], violations: [{ code: "rule_not_found" }] };
    }
    if (rule.status !== "active") {
      return { ok: false, verdict: "rule_not_active", rule_id: rule.rule_id, status: rule.status, checks: [], violations: [{ code: "rule_not_active", status: rule.status }] };
    }
    if (!isRecord2(actualParams)) {
      return { ok: false, verdict: "invalid_input", rule_id: rule.rule_id, checks: [], violations: [{ code: "actual_params_invalid" }] };
    }
    const checks = gatedChecks(rule.params).map((check) => {
      if (!check.gated) {
        return { ...check, actual: null, verdict: "informational" };
      }
      const actual = actualParams[check.param];
      if (check.comparator === "equals") {
        if (actual === check.limit) return { ...check, actual, verdict: "pass" };
        if (actual === void 0 || actual === null) return { ...check, actual: null, verdict: "unverified" };
        return { ...check, actual, verdict: "fail" };
      }
      if (!finite(check.limit) || !finite(actual)) {
        return { ...check, actual: finite(actual) ? actual : null, verdict: "unverified" };
      }
      const pass = check.comparator === "max" ? actual <= check.limit : actual >= check.limit;
      return { ...check, actual, verdict: pass ? "pass" : "fail" };
    });
    const gated = checks.filter((check) => check.gated);
    if (!gated.length) {
      return { ok: false, verdict: "unverified", rule_id: rule.rule_id, status: rule.status, checks, violations: [{ code: "no_gated_params" }] };
    }
    const violations = checks.filter((check) => check.verdict === "fail" || check.verdict === "unverified");
    return {
      ok: violations.length === 0,
      verdict: violations.length ? "fail" : "pass",
      rule_id: rule.rule_id,
      status: rule.status,
      checks,
      violations
    };
  }
  function stats() {
    const by_domain = {};
    let active = 0, held = 0;
    for (const rule of byId.values()) {
      if (rule.status === "active") active += 1;
      else held += 1;
      by_domain[rule.domain] = (by_domain[rule.domain] ?? 0) + 1;
    }
    return { total: byId.size, active, held, seed_errors: errors.length, by_domain };
  }
  return deepFreeze({
    registerRule,
    lookupRule,
    allRules,
    rulesForDomain,
    assertParamsAgainstRule,
    stats,
    errors,
    get size() {
      return byId.size;
    }
  });
}
var FOUNDATION_RULE_REGISTRY = createFoundationRuleRegistry();
var foundationRulesForDomain = (domain, context, opts) => FOUNDATION_RULE_REGISTRY.rulesForDomain(domain, context, opts);
var FOUNDATION_SOURCE_CLASS_LABELS = Object.freeze({
  local_code: "Adopted local code",
  structural_standard: "Referenced structural standard",
  engineering_guidance: "Engineering guidance",
  manufacturer_instructions: "Manufacturer instructions",
  shop_assumptions: "Shop estimating assumption"
});
var FOUNDATION_SOURCE_INDEX = Object.freeze(
  Object.entries(SOURCE_AUTHORITY_CLASS).map(([rule_id, authority_class]) => ({
    rule_id,
    authority_class
  }))
);
var FOUNDATION_METHOD_DOMAIN2 = Object.freeze([
  "method.sign_wind",
  "method.footing_bearing",
  "method.shaft",
  "method.lateral",
  "method.frost_depth",
  "method.pillar_bar",
  "method.base_plate"
]);

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
  const number3 = (value, field, { zero = false, integer = false } = {}) => {
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
  const list2 = (value, field, limit, allowEmpty = true) => {
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
    number: number3,
    list: list2,
    identity,
    bounds,
    group,
    get missing() {
      return missing;
    }
  };
}
function spreadSteel(c, dimensions, covers, diameter) {
  const { design, number: number3, list: list2, identity, bounds, issue, group, counts } = c;
  const { length, width, depth } = dimensions;
  const radius = diameter / 2, edge = covers.side + radius;
  const xSpan = length - 2 * edge, zSpan = width - 2 * edge;
  if (less(xSpan, 0) || less(zSpan, 0)) {
    issue("cover_inches.side", "reinforcement_clearance_invalid", "Side cover and bar diameter leave no room for the mat.");
    return;
  }
  const mats = /* @__PURE__ */ new Map();
  const rawMats = list2(design.spread?.mats, "spread.mats", 256, false);
  rawMats.forEach((mat, index) => {
    const field = `spread.mats.${index}`;
    const id = identity(mat?.id, `${field}.id`);
    const bearing = number3(mat?.bearing_elevation_inches, `${field}.bearing_elevation_inches`, { zero: true });
    const sx = number3(mat?.max_spacing_x_inches, `${field}.max_spacing_x_inches`);
    const sz = number3(mat?.max_spacing_z_inches, `${field}.max_spacing_z_inches`);
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
  list2(design.spread?.inter_mat_ties, "spread.inter_mat_ties", 2048).forEach((tie, index) => {
    const field = `spread.inter_mat_ties.${index}`;
    const id = identity(tie?.id, `${field}.id`);
    const from = mats.get(tie?.from_mat_id), to = mats.get(tie?.to_mat_id);
    const x = number3(tie?.x_inches, `${field}.x_inches`, { zero: true });
    const z = number3(tie?.z_inches, `${field}.z_inches`, { zero: true });
    const length2 = number3(tie?.cut_length_inches, `${field}.cut_length_inches`);
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
  const authoredSpacing = Number(config?.spacing_inches);
  if (Number.isFinite(authoredSpacing) && authoredSpacing > 0) {
    const spacingRules = foundationRulesForDomain("support.placement.spacing", void 0, { activeOnly: true });
    const ceiling = spacingRules.map((r) => r?.params?.max_spacing_inches_each_way).filter(Number.isFinite).sort((a, b) => a - b)[0];
    if (ceiling != null && authoredSpacing > ceiling) {
      c.issue("supports.spacing_inches", "reinforcement_support_spacing_exceeds_ceiling", `Authored support spacing ${authoredSpacing}" exceeds the ${ceiling}" spacing ceiling -- confirm the basis or lower the spacing.`, "warning");
    }
  }
  return { status: "unconfigured", count: null };
}
function pillarSteel(c, dimensions, covers, diameter) {
  const { design, number: number3, list: list2, identity, bounds, issue, group, counts } = c;
  const radius = diameter / 2, center = dimensions.diameter / 2;
  const outer = center - covers.side;
  const longitudinal = design.pillar?.longitudinal;
  const n = number3(longitudinal?.count, "pillar.longitudinal.count", { zero: true, integer: true });
  let long = null;
  if (n > 0) {
    const r = number3(longitudinal.radius_inches, "pillar.longitudinal.radius_inches", { zero: true });
    const bottom = number3(longitudinal.bottom_end_inches, "pillar.longitudinal.bottom_end_inches", { zero: true });
    const top = number3(longitudinal.top_end_inches, "pillar.longitudinal.top_end_inches", { zero: true });
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
  list2(design.pillar?.hoops, "pillar.hoops", 256).forEach((hoop, index) => {
    const field = `pillar.hoops.${index}`;
    const id = identity(hoop?.id, `${field}.id`);
    const y = number3(hoop?.center_y_inches, `${field}.center_y_inches`, { zero: true });
    const d = number3(hoop?.centerline_diameter_inches, `${field}.centerline_diameter_inches`);
    const allowance = number3(hoop?.cut_allowance_inches, `${field}.cut_allowance_inches`, { zero: true });
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
  const base2 = {
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
    ...base2,
    issues: foundationIssues.map(({ field, code, message }) => ({ field, code, message, severity: "error" }))
  };
  const quantity = Number(item.quantity ?? 1);
  base2.instanceCount = quantity;
  if (!item.include_rebar) return {
    ...base2,
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
    ...base2,
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
    ...base2,
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
var ITEM_CUSTOM_OVERRIDE_FIELDS = [
  ["custom_concrete_cost_per_cy", "concrete cost-per-unit override"],
  ["custom_concrete_qty", "concrete quantity override"],
  ["custom_rebar_cost_per_ft", "rebar cost-per-foot override"],
  ["custom_rebar_qty", "rebar quantity override"],
  ["custom_forming_rate", "forming rate override"],
  ["custom_forming_qty", "forming quantity override"],
  ["custom_finishing_rate", "finishing rate override"],
  ["custom_finishing_hours", "finishing hours override"],
  ["custom_excavation_hours", "excavation hours override"],
  ["custom_excavation_rate", "excavation rate override"]
];
function foundationItemInputIssues(item, index = 0) {
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
  if (record.excavation_method !== void 0 && record.excavation_method !== null && record.excavation_method !== "" && record.excavation_method !== "hand_dig" && record.excavation_method !== "equipment_excavation") {
    add(
      "excavation_method",
      "foundation_excavation_method_invalid",
      "select a supported excavation method (Hand dig or Equipment)."
    );
  }
  const count = record.quantity ?? 1;
  const quantity = inventoryFiniteNumber(count);
  if (!inventoryIsPositiveWhole(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot" ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]] : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = inventoryFiniteNumber(record[field]);
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
  const version = record.reinforcement_calculation_version;
  if (version != null && version !== 1 && version !== 2) {
    add(
      "reinforcement_calculation_version",
      "foundation_reinforcement_version_unsupported",
      "the active reinforcement calculation version is unsupported. Reload before changing prices."
    );
    return issues;
  }
  if (version === 2) {
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
  } else if (record.include_rebar) {
    const optional = (field, code, label, valid) => {
      const value = record[field];
      if (value !== void 0 && value !== null && !valid(value)) add(field, code, label);
    };
    const positive4 = (value) => {
      const number3 = inventoryFiniteNumber(value);
      return number3 !== null && number3 > 0;
    };
    const whole3 = (field, label) => optional(
      field,
      "foundation_rebar_count_invalid",
      `${label} must be a positive whole number within the supported range.`,
      inventoryIsPositiveWhole
    );
    if (type === "spread_foot") {
      for (const [field, label] of [["rebar_spacing_length", "length"], ["rebar_spacing_width", "width"]]) {
        optional(
          field,
          "foundation_rebar_spacing_invalid",
          `rebar spacing ${label} (inches) must be a finite positive number.`,
          positive4
        );
      }
      whole3("rebar_layers", "Rebar mat count");
    } else if (type === "pillar") {
      whole3("pillar_rebar_layers", "Hoop count");
      whole3("pillar_vertical_rebar_count", "Longitudinal bar count");
      optional(
        "pillar_rebar_hoop_diameter",
        "foundation_rebar_diameter_invalid",
        "hoop diameter (inches) must be finite, positive and no greater than the foundation diameter.",
        (value) => positive4(value) && (dimensions.diameter === null || dimensions.diameter <= 0 || inventoryFiniteNumber(value) <= dimensions.diameter)
      );
    }
  }
  for (const [field, label] of ITEM_CUSTOM_OVERRIDE_FIELDS) {
    const raw = record[field];
    if (raw === void 0 || raw === null) continue;
    const number3 = inventoryFiniteNumber(raw);
    if (number3 === null || number3 < 0) {
      add(
        field,
        "foundation_override_invalid",
        `${label} must be a finite, nonnegative number \u2014 clear it or record a valid value.`
      );
    }
  }
  return issues;
}
function signageCabinetInputIssues(cabinet, index = 0) {
  const issues = [];
  const record = cabinet ?? {};
  const add = (field, code, message) => issues.push({
    kind: "signage_cabinet",
    index,
    componentId: record.component_id ?? record.id ?? null,
    field,
    code,
    message: `Signage cabinet ${index + 1}: ${message}`
  });
  const qty = record.quantity;
  if (qty !== void 0 && qty !== null && qty !== "" && inventoryPositiveNumber(qty) === null) {
    add(
      "quantity",
      "signage_cabinet_quantity_unavailable",
      "record a finite, positive quantity \u2014 a zero or malformed quantity cannot be repriced"
    );
  }
  if (inventoryNonnegativeNumber(record.unit_cost) === null) {
    add(
      "unit_cost",
      "signage_cabinet_price_unavailable",
      "record a finite, nonnegative unit cost \u2014 a missing price is not a free cabinet"
    );
  }
  return issues;
}
function signageCabinetsInputIssues(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : []).flatMap((cabinet, index) => signageCabinetInputIssues(cabinet, index));
}
function foundationProjectInputIssues(project) {
  const items = project?.items ?? [];
  if (!Array.isArray(items)) throw new Error("Foundation items must be an array.");
  const projectIssues = [];
  const method = project?.excavation_method;
  const projectMethodInvalid = method !== void 0 && method !== null && method !== "" && method !== "hand_dig" && method !== "equipment_excavation";
  if (projectMethodInvalid) {
    projectIssues.push({
      kind: "foundation",
      index: null,
      componentId: null,
      field: "excavation_method",
      code: "foundation_excavation_method_invalid",
      message: "Project: select a supported default excavation method (Hand dig or Equipment)."
    });
  }
  const landscape = project?.landscape;
  const landscapeIssues = landscape !== void 0 && landscape !== null && (typeof landscape !== "object" || Array.isArray(landscape)) ? [{
    kind: "landscape",
    index: null,
    componentId: null,
    field: "landscape",
    code: "landscape_unavailable",
    message: "Landscape: the recorded site design is malformed \u2014 repair or clear it before repricing."
  }] : landscapeInputIssues(landscape);
  return [
    ...items.flatMap((item, index) => {
      const itemIssues = foundationItemInputIssues(item, index);
      if (projectMethodInvalid && (item?.excavation_method === void 0 || item?.excavation_method === null || item?.excavation_method === "")) {
        itemIssues.push({
          kind: "foundation",
          index,
          componentId: item?.component_id ?? null,
          field: "excavation_method",
          code: "foundation_excavation_method_invalid",
          message: `Foundation ${index + 1}: inherits the invalid project default excavation method \u2014 fix the project default or pick a method on this item.`
        });
      }
      return itemIssues;
    }),
    ...projectIssues,
    ...signageCabinetsInputIssues(project?.signage_cabinets || []),
    ...landscapeIssues
  ];
}

// src/components/estimator/foundation/foundationConstructionChecks.js
var METHOD_LABELS = {
  hand_dig: "hand dig",
  equipment_excavation: "equipment"
};
var blank = (v) => v === void 0 || v === null || v === "";
var effectiveMethod = (item, project) => blank(item?.excavation_method) ? blank(project?.excavation_method) ? null : project.excavation_method : item.excavation_method;
var pricedMethod = (item, project) => effectiveMethod(item, project) || "hand_dig";
var list = (indexes) => indexes.map((i) => i + 1).join(", ");
var round2 = (n) => Math.round(n * 100) / 100;
var readyMixItem = (item, inventory) => {
  const inv = inventory.find((i) => i.id === item?.selected_concrete_id);
  return !inv || inv.material_type === "concrete_service";
};
function foundationConstructionWarnings(project, inventory = [], context = {}) {
  const warnings = [];
  const sourceItems = Array.isArray(project?.items) ? project.items : [];
  const pricedItems = Array.isArray(context.items) ? context.items : [];
  const deliveryCheck = context.deliveryCheck ?? null;
  const push = (kind, index, componentId, field, code, message) => warnings.push({
    kind,
    index,
    componentId,
    field,
    inventoryId: null,
    code,
    severity: "advisory",
    message
  });
  const spoilGroups = /* @__PURE__ */ new Map();
  pricedItems.forEach((item, index) => {
    const cy = item?.excavation_volume_cy;
    if (!Number.isFinite(cy) || cy <= 0) return;
    const method = pricedMethod(sourceItems[index] ?? item, project);
    const group = spoilGroups.get(method) || { indexes: [], cy: 0 };
    group.indexes.push(index);
    group.cy += cy;
    spoilGroups.set(method, group);
  });
  for (const [method, group] of spoilGroups) {
    const single = group.indexes.length === 1;
    push(
      "foundation",
      single ? group.indexes[0] : null,
      single ? sourceItems[group.indexes[0]]?.component_id ?? null : null,
      "excavation_method",
      "excavation_spoil_unaccounted",
      `Foundation${single ? "" : "s"} ${list(group.indexes)}: under ${METHOD_LABELS[method] || method} excavation the soil spoil is assumed at 125% of the priced concrete volume (\u2248${round2(group.cy)} CY across ${group.indexes.length} foundation${single ? "" : "s"}) \u2014 excavation is priced as labor only; haul-off, disposal, and backfill are not priced. Verify spoil handling.`
    );
  }
  const unspecified = [];
  sourceItems.forEach((item, index) => {
    if (blank(item?.excavation_method) && blank(project?.excavation_method)) unspecified.push(index);
  });
  if (unspecified.length) {
    push(
      "foundation",
      unspecified.length === 1 ? unspecified[0] : null,
      unspecified.length === 1 ? sourceItems[unspecified[0]]?.component_id ?? null : null,
      "excavation_method",
      "excavation_method_unspecified",
      `Foundation${unspecified.length === 1 ? "" : "s"} ${list(unspecified)}: no excavation method is recorded and the project has no default \u2014 priced assuming hand dig. Verify the excavation method.`
    );
  }
  const equipmentItems = [];
  sourceItems.forEach((item, index) => {
    if (effectiveMethod(item, project) === "equipment_excavation") equipmentItems.push(index);
  });
  if (equipmentItems.length && !(Array.isArray(project?.selected_equipment) && project.selected_equipment.length)) {
    push(
      "foundation",
      equipmentItems.length === 1 ? equipmentItems[0] : null,
      equipmentItems.length === 1 ? sourceItems[equipmentItems[0]]?.component_id ?? null : null,
      "excavation_method",
      "excavation_equipment_unpriced",
      `Foundation${equipmentItems.length === 1 ? "" : "s"} ${list(equipmentItems)}: equipment excavation is priced as crew hours at the equipment rate \u2014 no excavation equipment rental is attached to this project. Verify whether a rental is needed.`
    );
  }
  sourceItems.forEach((item, index) => {
    const componentId = item?.component_id ?? null;
    const forming = Boolean(item?.include_forming);
    const finishing = Boolean(item?.include_finishing);
    if (forming && !finishing) {
      push(
        "foundation",
        index,
        componentId,
        "include_finishing",
        "forming_without_finishing",
        `Foundation ${index + 1}: forming is priced but top finishing is not \u2014 a formed pour still exposes the top surface. Verify whether finishing is in scope.`
      );
    }
    if (finishing && !forming) {
      push(
        "foundation",
        index,
        componentId,
        "include_forming",
        "finishing_without_forming",
        `Foundation ${index + 1}: top finishing is priced but no forming \u2014 the priced model assumes the sides are formed another way (e.g. neat-cut excavation or existing formwork). Verify.`
      );
    }
    if (forming && item?.foundation_type === "pillar") {
      push(
        "foundation",
        index,
        componentId,
        "selected_forming_id",
        "pillar_forming_straight_stock",
        `Foundation ${index + 1}: pillar/caisson forming is priced as straight 16-ft forming stock \u2014 the priced material does not represent round formwork (e.g. sonotube). Verify the forming material choice.`
      );
    }
  });
  const readyMixIndexes = [];
  sourceItems.forEach((item, index) => {
    if (readyMixItem(item, inventory)) readyMixIndexes.push(index);
  });
  const deliveryActive = readyMixIndexes.length > 0 && (deliveryCheck === null || (Number(deliveryCheck.roundedYards) || 0) > 0);
  const admixtures = Array.isArray(project?.project_concrete_admixtures) ? project.project_concrete_admixtures : [];
  if (deliveryActive) {
    if (blank(project?.project_concrete_type)) {
      push(
        "concrete_delivery",
        null,
        null,
        "project_concrete_type",
        "concrete_mix_unspecified",
        "Concrete delivery: no mix strength is recorded \u2014 delivery is priced assuming 4000 AIR ENTRAINED (AE), the catalog fallback. Verify the mix."
      );
    }
    const has = (id) => admixtures.includes(id);
    const admixName = (id) => getConcreteAdmixtures().find((a) => a.id === id)?.name || id;
    if (has("calcium_chloride")) {
      const rebarIndexes = [];
      sourceItems.forEach((item, index) => {
        if (item?.include_rebar) rebarIndexes.push(index);
      });
      if (rebarIndexes.length) {
        push(
          "concrete_delivery",
          null,
          null,
          "project_concrete_admixtures",
          "admixture_rebar_corrosion",
          `Concrete delivery: ${admixName("calcium_chloride")} is selected while Foundation${rebarIndexes.length === 1 ? "" : "s"} ${list(rebarIndexes)} include${rebarIndexes.length === 1 ? "s" : ""} rebar \u2014 the supplier catalog warns calcium chloride corrodes rebar. Verify the admixture choice.`
        );
      }
      if (has("set_retarding")) {
        push(
          "concrete_delivery",
          null,
          null,
          "project_concrete_admixtures",
          "admixture_set_pace_conflict",
          `Concrete delivery: ${admixName("calcium_chloride")} (accelerating) and ${admixName("set_retarding")} (retarding) admixtures are selected together \u2014 verify the intended set behavior.`
        );
      }
    }
    if (has("set_retarding")) {
      if ((project?.project_concrete_type || "4000_ae") === "fast_set") {
        push(
          "concrete_delivery",
          null,
          null,
          "project_concrete_admixtures",
          "mix_admixture_pace_conflict",
          `Concrete delivery: FAST SET mix is selected with a ${admixName("set_retarding")} admixture \u2014 verify the intended set time.`
        );
      }
      if (has("winter_service")) {
        push(
          "concrete_delivery",
          null,
          null,
          "project_concrete_admixtures",
          "admixture_weather_conflict",
          `Concrete delivery: ${admixName("winter_service")} (freezing conditions) and ${admixName("set_retarding")} (hot-weather placement) are selected together \u2014 verify pour conditions.`
        );
      }
    }
  }
  if (admixtures.length && sourceItems.length && readyMixIndexes.length === 0) {
    push(
      "concrete_delivery",
      null,
      null,
      "project_concrete_admixtures",
      "admixtures_without_ready_mix",
      "Concrete delivery: selected admixtures apply to delivered ready-mix only \u2014 every foundation uses bagged concrete, so they price nothing here. Verify the admixture selection."
    );
  }
  return warnings;
}

// src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);
var finiteRate = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive = (value) => finiteRate(value) && value > 0;
var isRecord3 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var numeric = (value) => {
  const parsed = foundationInputNumber(value);
  if (parsed !== null) return parsed;
  return value === null || ["undefined", "number", "string", "boolean"].includes(typeof value) ? value : NaN;
};
var text2 = (value) => typeof value === "string" ? value.trim() : "";
function resolveFoundationReinforcementBasis({
  material,
  inventory = [],
  settings = {},
  quantityOverride = null,
  rateOverride = null
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const reference = isRecord3(material) ? material : {};
  let row = null, source = null, name = "", reason = "", inventoryId = null;
  if (reference.kind === "manual") {
    source = reference;
    name = text2(reference.name) || "Manual rebar";
    reason = text2(reference.reason);
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
        name = text2(row.material_name) || "Catalog rebar";
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
  const settingsValid = isRecord3(settings);
  if (!settingsValid) issue("settings", "reinforcement_settings_unavailable", "Labor settings are unavailable; do not infer defaults from a failed read.");
  const rateSources = [];
  const setting2 = (key, fallback) => {
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
    labor_rate_per_hour: setting2("foundation_main_labor_rate", 60),
    labor_hours_per_ft: setting2("foundation_rebar_time_linear_ft", 0.02),
    labor_hours_per_connection: setting2("foundation_rebar_time_cross_section", 0.05),
    labor_hours_per_support: setting2("foundation_rebar_support_time_each", 0.05)
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

// src/components/estimator/foundation/foundationReinforcementSupport.js
var HEIGHT_TOLERANCE_INCHES = 0.0625;
var isRecord4 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finite2 = (value) => typeof value === "number" && Number.isFinite(value);
var nonnegative2 = (value) => finite2(value) && value >= 0;
var positive2 = (value) => finite2(value) && value > 0;
var wholeNonnegative = (value) => nonnegative2(value) && Number.isSafeInteger(value);
var text3 = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
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
  if (!isRecord4(row) || row.material_type !== "rebar_support") return null;
  const heightNominal = number(row.rebar_support_height_inches);
  const heightMin = number(row.rebar_support_height_min_inches);
  const heightMax = number(row.rebar_support_height_max_inches);
  const footprintLength = number(row.rebar_support_footprint_length_inches);
  const footprintWidth = number(row.rebar_support_footprint_width_inches);
  const packRaw = number(row.rebar_support_pack_size);
  const packMalformed = packRaw !== null && (!Number.isSafeInteger(packRaw) || packRaw <= 0);
  const costRaw = row.cost_per_unit;
  const cost = costRaw === null || costRaw === void 0 || costRaw === "" ? null : foundationInputNumber(costRaw);
  const barSizes = Array.isArray(row.rebar_support_compatible_bar_sizes) ? row.rebar_support_compatible_bar_sizes.map((size) => text3(size)).filter(Boolean) : null;
  return {
    id: typeof row.id === "string" ? row.id : null,
    name: text3(row.material_name) || "Rebar support",
    kind: text3(row.rebar_support_kind) || null,
    foundation_usage: text3(row.foundation_usage) || null,
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
    placementNotes: text3(row.rebar_support_placement_notes) || null,
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
  const matches = (Array.isArray(inventory) ? inventory : []).filter((row) => isRecord4(row) && row.id === material.inventory_id && row.material_type === "rebar");
  if (matches.length !== 1) return null;
  return text3(matches[0].rebar_size) || null;
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
  const config = isRecord4(design?.supports) ? design.supports : {};
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

// src/components/estimator/foundation/foundationReinforcementCutSchedule.js
var MAX_STOCK_LENGTH_INCHES = 1200;
var MAX_PIECES = 65536;
var FIT_TOLERANCE = 1e-9;
var STEEL_ROLES2 = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
var ROLE_SHAPES = Object.freeze({
  horizontal: "straight",
  longitudinal: "straight",
  hoop: "hoop",
  inter_mat_tie: "as_authored"
});
var isRecord5 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finite3 = (value) => typeof value === "number" && Number.isFinite(value);
var positive3 = (value) => finite3(value) && value > 0;
var whole2 = (value) => finite3(value) && Number.isSafeInteger(value) && value >= 0;
var text4 = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
var number2 = (value) => value === null || value === void 0 || value === "" ? null : foundationInputNumber(value);
var base = (status) => ({
  version: 1,
  status,
  bar_size: null,
  bar_diameter_inches: null,
  instance_count: null,
  cut_lines: [],
  piece_count_total: 0,
  stock: null,
  elevation_summary: [],
  issues: []
});
function matRun(groupId) {
  if (typeof groupId !== "string") return null;
  if (groupId.endsWith("/x")) return { mat_id: groupId.slice(0, -2), direction: "x" };
  if (groupId.endsWith("/z")) return { mat_id: groupId.slice(0, -2), direction: "z" };
  return null;
}
function stockPool(material, inventory, issue) {
  const lengths = /* @__PURE__ */ new Set();
  let malformed = 0, row = null;
  if (material?.kind === "catalog" && typeof material.inventory_id === "string" && material.inventory_id) {
    const matches = (Array.isArray(inventory) ? inventory : []).filter((candidate) => isRecord5(candidate) && candidate.id === material.inventory_id && candidate.material_type === "rebar");
    row = matches.length === 1 ? matches[0] : null;
  }
  const add = (raw) => {
    const value = number2(raw);
    if (value === null) {
      if (raw !== null && raw !== void 0 && raw !== "") malformed += 1;
      return;
    }
    if (!positive3(value) || value > MAX_STOCK_LENGTH_INCHES) {
      malformed += 1;
      return;
    }
    lengths.add(value);
  };
  if (row) {
    add(row.rebar_stock_length_inches);
    const list2 = row.rebar_stock_lengths_inches;
    if (list2 !== null && list2 !== void 0 && list2 !== "") {
      if (Array.isArray(list2)) list2.forEach(add);
      else if (typeof list2 === "string") list2.split(",").forEach(add);
      else malformed += 1;
    }
  }
  if (malformed) {
    issue(
      "stock_lengths",
      "reinforcement_stock_length_invalid",
      `${malformed} rebar stock-length entr${malformed === 1 ? "y was" : "ies were"} malformed and ignored; repair the catalog row.`,
      "warning"
    );
  }
  return {
    row,
    lengths: [...lengths].sort((a, b) => a - b)
  };
}
function elevationSummary(design, model, groups) {
  const summary = [];
  const diameter = model?.groups?.[0]?.diameter_inches ?? design?.bar_diameter_inches;
  const radius = positive3(diameter) ? diameter / 2 : null;
  const mats = Array.isArray(design?.spread?.mats) ? design.spread.mats : [];
  const bearings = mats.map((mat) => number2(mat?.bearing_elevation_inches));
  const order = bearings.map((bearing, index) => ({ bearing, index })).sort((a, b) => (a.bearing ?? Infinity) - (b.bearing ?? Infinity));
  const tier = new Map(order.map((entry, rank) => [entry.index, rank]));
  mats.forEach((mat, index) => {
    const id = text4(mat?.id);
    if (!id) return;
    const xRun = groups.find((group) => group.id === `${id}/x`);
    const zRun = groups.find((group) => group.id === `${id}/z`);
    const bearing = bearings[index];
    summary.push({
      kind: "mat",
      index,
      tier: tier.get(index) ?? index,
      mat_id: id,
      bearing_elevation_inches: bearing,
      x_bars: xRun ? {
        count: xRun.count,
        cut_length_inches: xRun.cut_length_inches,
        elevation_inches: bearing !== null && radius !== null ? bearing + radius : null
      } : null,
      z_bars: zRun ? {
        count: zRun.count,
        cut_length_inches: zRun.cut_length_inches,
        elevation_inches: bearing !== null && radius !== null ? bearing + 3 * radius : null
      } : null,
      crossings: xRun && zRun ? xRun.count * zRun.count : null
    });
  });
  const longitudinal = design?.pillar?.longitudinal;
  const cageRun = groups.find((group) => group.id === "pillar/longitudinal");
  if (cageRun) {
    const bottom = number2(longitudinal?.bottom_end_inches);
    const top = number2(longitudinal?.top_end_inches);
    summary.push({
      kind: "pillar_cage",
      index: 0,
      bar_count: cageRun.count,
      cut_length_inches: cageRun.cut_length_inches,
      bottom_elevation_inches: bottom,
      top_elevation_inches: top,
      radius_inches: number2(longitudinal?.radius_inches)
    });
  }
  (Array.isArray(design?.pillar?.hoops) ? design.pillar.hoops : []).forEach((hoop, index) => {
    const run = groups.find((group) => group.id === hoop?.id && group.role === "hoop");
    if (!run) return;
    summary.push({
      kind: "pillar_hoop",
      index,
      hoop_id: text4(hoop?.id) || run.id,
      center_y_inches: number2(hoop?.center_y_inches),
      centerline_diameter_inches: number2(hoop?.centerline_diameter_inches),
      cut_length_inches: run.cut_length_inches
    });
  });
  return summary;
}
function packFirstFitDecreasing(pieces, lengths) {
  const bins = [];
  for (const piece of pieces) {
    let target = null;
    for (const bin of bins) {
      if (bin.remaining + FIT_TOLERANCE >= piece.cut_length_inches) {
        target = bin;
        break;
      }
    }
    if (!target) {
      const stock = lengths.find((length) => length + FIT_TOLERANCE >= piece.cut_length_inches);
      if (stock === void 0) return null;
      target = { stock_length_inches: stock, remaining: stock, cuts: /* @__PURE__ */ new Map() };
      bins.push(target);
    }
    target.remaining -= piece.cut_length_inches;
    if (target.remaining < 0 && target.remaining > -FIT_TOLERANCE) target.remaining = 0;
    target.cuts.set(piece.cut_length_inches, (target.cuts.get(piece.cut_length_inches) ?? 0) + 1);
  }
  return bins;
}
function calculateFoundationReinforcementCutSchedule({
  item,
  design,
  model,
  material,
  inventory = [],
  maxPieces = MAX_PIECES
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const result = base("unavailable");
  result.issues = issues;
  if (model?.version !== 2 || !["valid", "off"].includes(model.status)) return result;
  if (model.status === "off") {
    return { ...base("not_required"), instance_count: model.instanceCount ?? null, issues };
  }
  const instanceCount = whole2(model.instanceCount) && model.instanceCount > 0 ? model.instanceCount : null;
  if (instanceCount === null) {
    issue(
      "model.instanceCount",
      "reinforcement_numeric_range_invalid",
      "A cut schedule requires a known positive foundation instance count."
    );
    return { ...result, issues };
  }
  result.instance_count = instanceCount;
  const groups = Array.isArray(model.groups) ? model.groups : [];
  let malformedRuns = 0;
  for (const group of groups) {
    const run = isRecord5(group) && STEEL_ROLES2.includes(group.role) && whole2(group.count) && group.count > 0 && positive3(group.cut_length_inches) && positive3(group.diameter_inches) ? group : null;
    if (!run) {
      malformedRuns += 1;
      continue;
    }
    result.cut_lines.push({
      source_run_id: run.id,
      role: run.role,
      mat_id: matRun(run.id)?.mat_id ?? null,
      bar_size: null,
      bar_diameter_inches: run.diameter_inches,
      cut_length_inches: run.cut_length_inches,
      shape: ROLE_SHAPES[run.role],
      bend_code: null,
      quantity_per_instance: run.count,
      quantity_total: run.count * instanceCount
    });
  }
  if (malformedRuns) {
    issue(
      "model.groups",
      "reinforcement_cut_schedule_run_invalid",
      `${malformedRuns} modeled bar run${malformedRuns === 1 ? "" : "s"} could not be scheduled; the schedule is incomplete.`
    );
    return { ...result, issues };
  }
  result.piece_count_total = result.cut_lines.reduce((sum, line) => sum + line.quantity_total, 0);
  if (!result.cut_lines.length) return { ...result, status: "resolved", issues };
  const { row: stockRow, lengths } = stockPool(material, inventory, issue);
  const barSize = text4(stockRow?.rebar_size) || null;
  result.bar_size = barSize;
  result.bar_diameter_inches = result.cut_lines[0]?.bar_diameter_inches ?? null;
  for (const line of result.cut_lines) line.bar_size = barSize;
  result.elevation_summary = elevationSummary(design, model, groups);
  if (!lengths.length) {
    issue(
      "stock_lengths",
      "reinforcement_stock_length_unconfigured",
      material?.kind === "manual" ? "A manual rebar basis carries no catalog stock lengths; the cut lines stand but the stock/waste plan is unresolved \u2014 record stock lengths or pin a catalog row." : "The configured rebar catalog row declares no usable stock lengths; the cut lines stand but the stock/waste plan is unresolved \u2014 record rebar stock length metadata on the catalog row.",
      "warning"
    );
    return { ...result, status: "unresolved", issues };
  }
  if (result.piece_count_total > maxPieces) {
    issue(
      "model.groups",
      "reinforcement_cut_schedule_budget_exceeded",
      `${result.piece_count_total} total cut pieces exceed the ${maxPieces}-piece schedule budget; cut lines are reported but stock packing is skipped.`,
      "warning"
    );
    return { ...result, status: "unresolved", issues };
  }
  const byBar = /* @__PURE__ */ new Map();
  for (const line of result.cut_lines) {
    const key = `diameter:${line.bar_diameter_inches}`;
    if (!byBar.has(key)) byBar.set(key, { bar_group: key, bar_size: barSize, bar_diameter_inches: line.bar_diameter_inches, lines: [] });
    byBar.get(key).lines.push(line);
  }
  const stock = {
    source_inventory_id: typeof stockRow?.id === "string" ? stockRow.id : null,
    lengths_inches: lengths,
    groups: [],
    totals: {
      total_linear_inches_required: 0,
      stock_linear_inches_purchased: 0,
      stock_count_total: 0,
      waste_inches: 0,
      waste_pct: 0
    }
  };
  let infeasible = false;
  for (const bar of byBar.values()) {
    const pieces = bar.lines.flatMap((line, lineIndex) => Array.from(
      { length: line.quantity_total },
      () => ({ cut_length_inches: line.cut_length_inches, lineIndex })
    )).sort((a, b) => b.cut_length_inches - a.cut_length_inches || a.lineIndex - b.lineIndex);
    const packed = packFirstFitDecreasing(pieces, lengths);
    if (packed === null) {
      const longest = bar.lines.reduce((max, line) => Math.max(max, line.cut_length_inches), 0);
      issue(
        "stock_lengths",
        "reinforcement_cut_exceeds_stock",
        `A ${longest}-in ${bar.bar_size ?? `\u2300${bar.bar_diameter_inches}in`} cut exceeds the longest configured stock (${Math.max(...lengths)} in); the run cannot be fabricated from the configured stock \u2014 update the catalog stock lengths or split the authored run.`
      );
      infeasible = true;
      continue;
    }
    const bins = packed.map((bin, index) => ({
      index,
      stock_length_inches: bin.stock_length_inches,
      cuts: [...bin.cuts.entries()].sort((a, b) => b[0] - a[0]).map(([cut_length_inches, quantity]) => ({ cut_length_inches, quantity })),
      offcut_inches: bin.remaining
    }));
    const byLength = /* @__PURE__ */ new Map();
    for (const bin of bins) {
      const entry = byLength.get(bin.stock_length_inches) ?? { stock_length_inches: bin.stock_length_inches, stock_count: 0, pieces_per_stock: [], offcut_inches: 0 };
      entry.stock_count += 1;
      entry.pieces_per_stock.push(bin.cuts.reduce((sum, cut) => sum + cut.quantity, 0));
      entry.offcut_inches += bin.offcut_inches;
      byLength.set(bin.stock_length_inches, entry);
    }
    const groupOut = {
      bar_group: bar.bar_group,
      bar_size: bar.bar_size,
      bar_diameter_inches: bar.bar_diameter_inches,
      bins,
      by_length: [...byLength.values()].sort((a, b) => a.stock_length_inches - b.stock_length_inches).map((entry) => ({
        ...entry,
        waste_pct: entry.stock_count * entry.stock_length_inches > 0 ? entry.offcut_inches / (entry.stock_count * entry.stock_length_inches) * 100 : 0
      })),
      totals: { pieces: pieces.length, linear_inches_required: 0, stock_linear_inches_purchased: 0, stock_count: bins.length, offcut_inches: 0, waste_pct: 0 }
    };
    for (const bin of bins) {
      groupOut.totals.stock_linear_inches_purchased += bin.stock_length_inches;
      groupOut.totals.offcut_inches += bin.offcut_inches;
    }
    groupOut.totals.linear_inches_required = bar.lines.reduce((sum, line) => sum + line.cut_length_inches * line.quantity_total, 0);
    groupOut.totals.waste_pct = groupOut.totals.stock_linear_inches_purchased > 0 ? groupOut.totals.offcut_inches / groupOut.totals.stock_linear_inches_purchased * 100 : 0;
    stock.groups.push(groupOut);
    stock.totals.total_linear_inches_required += groupOut.totals.linear_inches_required;
    stock.totals.stock_linear_inches_purchased += groupOut.totals.stock_linear_inches_purchased;
    stock.totals.stock_count_total += groupOut.totals.stock_count;
  }
  stock.totals.waste_inches = stock.totals.stock_linear_inches_purchased - stock.totals.total_linear_inches_required;
  stock.totals.waste_pct = stock.totals.stock_linear_inches_purchased > 0 ? stock.totals.waste_inches / stock.totals.stock_linear_inches_purchased * 100 : 0;
  result.stock = stock.groups.length ? stock : null;
  result.status = infeasible ? "unresolved" : "resolved";
  return result;
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
  const supports = model.status === "valid" ? resolveFoundationReinforcementSupports({
    item: record,
    design,
    model,
    material: resolution?.materialSnapshot ?? null,
    inventory,
    basis: resolution?.basis ?? {}
  }) : null;
  const cutSchedule = ["valid", "off"].includes(model.status) ? calculateFoundationReinforcementCutSchedule({
    item: record,
    design,
    model,
    material: resolution?.materialSnapshot ?? null,
    inventory
  }) : null;
  const steel = priceFoundationReinforcementModel(model, resolution?.basis, supports);
  const issues = [
    ...model.issues.map((issue) => ({ ...issue, scope: "geometry" })),
    ...(resolution?.issues || []).map((issue) => ({ ...issue, scope: "basis" })),
    ...(supports?.issues || []).map((issue) => ({ ...issue, scope: "supports" })),
    ...(cutSchedule?.issues || []).map((issue) => ({ ...issue, scope: "cut_schedule" })),
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
    cutSchedule,
    materialSnapshot: resolution?.materialSnapshot ?? null,
    rateSources: resolution?.rateSources ?? [],
    canApplyToEstimate: steel.canApplyToEstimate && !issues.some((issue) => issue.severity === "error")
  };
}

// src/components/estimator/foundation/foundationReinforcementItemProjection.js
var isRecord6 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
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
  if (!isRecord6(item)) {
    issue("item", "reinforcement_common_item_invalid", "A current foundation record is required.");
    return unavailable();
  }
  if (!Array.isArray(inventory) || inventory.some((row) => !isRecord6(row))) {
    issue("inventory", "reinforcement_common_inventory_unavailable", "Current concrete and forming catalog records could not be verified.");
    return unavailable();
  }
  if (!isRecord6(settings)) {
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

// src/components/estimator/foundation/foundationCalc.js
var num2 = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
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
  "rebar_connection_count",
  "support_count",
  "support_purchased_units",
  "support_packs",
  "support_material_cost",
  "support_labor_cost",
  "support_labor_hours",
  "support_cost"
];
function calculateVersionedItem(item, project, inventory, settings, savedItem) {
  const version = item.reinforcement_calculation_version;
  if (version == null || version === 1) return null;
  const effectiveItem = { ...item, excavation_method: item.excavation_method || project?.excavation_method };
  const inputIssues = foundationItemInputIssues(effectiveItem);
  const catalogIssues = foundationItemCatalogIssues(item, inventory);
  const settingIssues = foundationItemSettingIssues(effectiveItem, settings);
  const projection = inputIssues.length || catalogIssues.length || settingIssues.length ? null : calculateFoundationReinforcementItemProjection({
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
          rate_sources: structuredClone(reinforcement.rateSources),
          supports: structuredClone(reinforcement.supports),
          cut_schedule: structuredClone(reinforcement.cutSchedule)
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
  const effectiveItem = { ...item, excavation_method: item.excavation_method || project?.excavation_method };
  const inputIssues = foundationItemInputIssues(effectiveItem);
  const settingIssues = foundationItemSettingIssues(effectiveItem, settings);
  if (inputIssues.length || settingIssues.length || foundationItemCatalogIssues(item, inventory).length) {
    return {
      quantity: inputIssues.length ? item.quantity : Math.max(1, num2(item.quantity, 1)),
      ...Object.fromEntries(ITEM_SNAPSHOT_FIELDS.map((key) => [
        key,
        hasFoundationCostSnapshot(savedItem?.[key]) ? savedItem[key] : void 0
      ]))
    };
  }
  const legacy = calcItemCost(effectiveItem, inventory, settings);
  const isPillar = item.foundation_type === "pillar";
  const rebarSize = (isPillar ? item.pillar_rebar_size : item.rebar_size) || "#4";
  return {
    quantity: Math.max(1, num2(item.quantity, 1)),
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
var RENTAL_PERIODS = ["day", "week", "month"];
var equipmentAssignedId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var equipmentComponentId = (entry) => {
  const id = entry?.component_id ?? entry?._id;
  return equipmentAssignedId(id) ? id : null;
};
function equipmentPricing(entry, bindings, index) {
  const issues = [...bindings.issues];
  const eq = bindings.equipment;
  const add = (kind, field, inventoryId, code, message) => issues.push({
    kind,
    index,
    componentId: entry?.component_id ?? entry?._id ?? null,
    field,
    inventoryId: inventoryId ?? null,
    code,
    message: `Equipment ${index + 1}: ${message}.`
  });
  const customQtyOn = entry?.custom_qty !== void 0 && entry?.custom_qty !== null;
  const customRateOn = entry?.custom_rate !== void 0 && entry?.custom_rate !== null;
  const rentedRows = (rows) => (rows || []).filter((row) => row.inventory && row.quantity !== 0);
  const periodDriven = !customRateOn || rentedRows(bindings.attachmentRows).length > 0 || rentedRows(bindings.subAttachmentRows).length > 0;
  const rentalPeriod = entry?.rental_period || "day";
  const periodField = RENTAL_PERIODS.includes(rentalPeriod) ? `cost_per_${rentalPeriod}` : null;
  if (periodDriven && periodField === null) {
    add(
      "equipment",
      "rental_period",
      eq?.id ?? null,
      "equipment_period_unavailable",
      "select a daily, weekly, or monthly rental period before repricing"
    );
  }
  let duration = null;
  if (customQtyOn) {
    duration = inventoryPositiveNumber(entry.custom_qty);
    if (duration === null) {
      add(
        "equipment",
        "custom_qty",
        eq?.id ?? null,
        "custom_qty_unavailable",
        "record a finite, positive custom quantity or clear the override before repricing"
      );
    }
  } else {
    duration = entry?.rental_duration === void 0 || entry?.rental_duration === null || entry?.rental_duration === "" ? 1 : inventoryPositiveNumber(entry.rental_duration);
    if (duration === null) {
      add(
        "equipment",
        "rental_duration",
        eq?.id ?? null,
        "equipment_duration_unavailable",
        "record a finite, positive rental duration or clear it before repricing"
      );
    }
  }
  let rate = null;
  if (customRateOn) {
    rate = inventoryNonnegativeNumber(entry.custom_rate);
    if (rate === null) {
      add(
        "equipment",
        "custom_rate",
        eq?.id ?? null,
        "custom_rate_unavailable",
        "record a finite, nonnegative custom rate or clear the override before repricing"
      );
    }
  } else if (eq && periodField !== null) {
    rate = inventoryNonnegativeNumber(eq[periodField]);
    if (rate === null) {
      add(
        "equipment",
        periodField,
        eq.id ?? null,
        "equipment_price_unavailable",
        `record a finite, nonnegative catalog ${rentalPeriod} rental price before repricing`
      );
    }
  }
  let deliveryCharge = null;
  if (entry?.include_delivery) {
    const customDeliveryOn = entry?.custom_delivery_charge !== void 0 && entry?.custom_delivery_charge !== null;
    if (customDeliveryOn) {
      deliveryCharge = inventoryNonnegativeNumber(entry.custom_delivery_charge);
      if (deliveryCharge === null) {
        add(
          "equipment",
          "custom_delivery_charge",
          eq?.id ?? null,
          "custom_delivery_charge_unavailable",
          "record a finite, nonnegative custom delivery charge or clear the override before repricing"
        );
      }
    } else if (eq) {
      deliveryCharge = inventoryNonnegativeNumber(eq.pickup_delivery_cost);
      if (deliveryCharge === null) {
        add(
          "equipment",
          "pickup_delivery_cost",
          eq.id ?? null,
          "equipment_delivery_price_unavailable",
          "record a finite, nonnegative catalog delivery charge before repricing"
        );
      }
    }
  }
  const rawQuantity = (row) => row.field === "attachment_counts" || row.field === "sub_attachment_counts" ? entry?.[row.field]?.[row.id] : row.quantity;
  const priceRows = (rows, kind) => (rows || []).map((row) => {
    const quantity = !row.inventory ? 0 : rawQuantity(row);
    if (!row.inventory || Number(quantity) === 0) return { row, skipped: true };
    const parsedQuantity = inventoryPositiveNumber(quantity);
    if (parsedQuantity === null) {
      add(
        kind,
        row.field,
        row.id ?? null,
        "equipment_attachment_qty_unavailable",
        `record a finite, positive ${kind.replaceAll("_", " ")} quantity or clear it before repricing`
      );
      return { row, quantity: null, rate: null };
    }
    const rowRate = periodField === null ? null : inventoryNonnegativeNumber(row.inventory[periodField]);
    if (periodField !== null && rowRate === null) {
      add(
        kind,
        periodField,
        row.id ?? null,
        "equipment_price_unavailable",
        `record a finite, nonnegative catalog ${rentalPeriod} price for the selected ${kind.replaceAll("_", " ")} before repricing`
      );
    }
    return { row, quantity: parsedQuantity, rate: rowRate };
  });
  return {
    issues,
    equipment: eq,
    rentalPeriod,
    duration,
    rate,
    deliveryCharge,
    attachmentLines: priceRows(bindings.attachmentRows, "attachment"),
    subAttachmentLines: priceRows(bindings.subAttachmentRows, "sub_attachment")
  };
}
function calcEquipmentPricing(selected, inventory = [], options = {}) {
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedEquipment");
  const savedEquipment = Array.isArray(options?.savedEquipment) ? options.savedEquipment : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows || []) {
      const id = equipmentComponentId(row);
      if (id !== null) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(selected), savedCounts = counts(savedEquipment);
  const savedById = new Map(savedEquipment.filter((row) => equipmentComponentId(row) !== null).map((row) => [equipmentComponentId(row), row]));
  const held = (entry) => {
    const result = { ...entry };
    if (!explicitSnapshot) return result;
    const id = equipmentComponentId(entry);
    const saved = id !== null && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null;
    if (saved && Object.prototype.hasOwnProperty.call(saved, "equipment_cost")) result.equipment_cost = saved.equipment_cost;
    else delete result.equipment_cost;
    return result;
  };
  return (selected || []).map((storedEntry, index) => {
    const entry = storedEntry || {};
    const bindings = resolveFoundationEquipment(entry, inventory, index);
    const check = equipmentPricing(entry, bindings, index);
    const context = { ...bindings, issues: check.issues, rentalPeriod: check.rentalPeriod, duration: check.duration };
    if (check.issues.length) {
      const pricedEntry = held(entry);
      return {
        ...context,
        pricedEntry,
        baseCost: null,
        deliveryCost: null,
        totalCost: hasFoundationCostSnapshot(pricedEntry.equipment_cost) ? pricedEntry.equipment_cost : null,
        attachmentRows: bindings.attachmentRows.map((row) => ({ ...row, cost: null })),
        subAttachmentRows: bindings.subAttachmentRows.map((row) => ({ ...row, cost: null }))
      };
    }
    const baseCost = check.rate * check.duration;
    let entryTotal = baseCost;
    if (entry.include_delivery) entryTotal += check.deliveryCharge;
    const pricedLines = (lines) => lines.map((line) => {
      if (line.skipped) return { ...line.row, cost: 0 };
      const cost = line.rate * check.duration * line.quantity;
      entryTotal += cost;
      return { ...line.row, cost };
    });
    const attachmentRows = pricedLines(check.attachmentLines);
    const subAttachmentRows = pricedLines(check.subAttachmentLines);
    return {
      ...context,
      pricedEntry: { ...entry, equipment_cost: entryTotal },
      baseCost,
      deliveryCost: entry.include_delivery ? check.deliveryCharge : 0,
      attachmentRows,
      subAttachmentRows,
      totalCost: entryTotal
    };
  });
}
function calcEquipment(selected, inventory = [], options = {}) {
  return calcEquipmentPricing(selected, inventory, options).map((row) => row.pricedEntry);
}
function equipmentCostTotal(pricedEntries = []) {
  let total = 0;
  for (const entry of pricedEntries || []) {
    if (!hasFoundationCostSnapshot(entry?.equipment_cost)) return null;
    total += entry.equipment_cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}
function calcSignageCabinetPricing(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : []).map((cabinet, index) => {
    const issues = signageCabinetInputIssues(cabinet, index);
    const entry = { ...cabinet ?? {} };
    if (issues.length) return { available: false, issues, cost: null, pricedEntry: entry };
    const quantity = entry.quantity === void 0 || entry.quantity === null || entry.quantity === "" ? 1 : Number(entry.quantity);
    const cost = Number(entry.unit_cost) * quantity;
    return { available: true, issues, cost, pricedEntry: entry };
  });
}
function signageCabinetCostTotal(pricedRows = []) {
  let total = 0;
  for (const row of pricedRows || []) {
    if (!hasFoundationCostSnapshot(row?.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}
function captureConcreteDeliverySnapshot(delivery) {
  return {
    version: 1,
    concrete_total: delivery.concreteTotal,
    rounded_yards: delivery.roundedYards,
    rate_per_yard: delivery.ratePerYard,
    additional_stops_cost: delivery.additionalStopsCost,
    trucks: delivery.trucksList.map((truck) => ({
      yards: truck.yards,
      rounded_yards: truck.roundedYards,
      cost: truck.cost,
      small_order_fee: truck.smallOrderFee,
      fuel_fee: truck.fuelFee
    }))
  };
}
function savedConcreteDelivery(project) {
  const snapshot = project?.concrete_delivery_snapshot?.version === 1 ? project.concrete_delivery_snapshot : null;
  const value = (record, key) => hasFoundationCostSnapshot(record?.[key]) ? record[key] : void 0;
  return {
    pricingUnavailable: true,
    concreteTotal: value(snapshot, "concrete_total"),
    roundedYards: value(snapshot, "rounded_yards"),
    ratePerYard: value(snapshot, "rate_per_yard"),
    additionalStopsCost: value(snapshot, "additional_stops_cost"),
    trucksList: (Array.isArray(snapshot?.trucks) ? snapshot.trucks : []).map((truck) => ({
      yards: value(truck, "yards"),
      roundedYards: value(truck, "rounded_yards"),
      cost: value(truck, "cost"),
      smallOrderFee: value(truck, "small_order_fee"),
      fuelFee: value(truck, "fuel_fee")
    })),
    availableMixes: [],
    availableAdmixes: []
  };
}
function calcProject(project, rawInventory, settings = {}, options = {}) {
  const inventory = normalizeFoundationInventoryRows(rawInventory);
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options, "savedProject");
  const savedProject = !explicitSnapshot ? project : project.id !== void 0 && project.id !== null && project.id !== "" && options.savedProject?.id === project.id ? options.savedProject : null;
  const sourceItems = project.items || [];
  const savedItems = /* @__PURE__ */ new Map();
  const currentIds = /* @__PURE__ */ new Map();
  for (const item of savedProject?.items || []) {
    if (item.component_id) savedItems.set(item.component_id, savedItems.has(item.component_id) ? null : item);
  }
  for (const item of sourceItems) currentIds.set(item.component_id, (currentIds.get(item.component_id) || 0) + 1);
  const poleCalc = calcPoles(
    project.poles,
    inventory,
    settings,
    explicitSnapshot ? { savedPoles: savedProject?.poles ?? [] } : {}
  );
  const wallCalc = calcWalls(
    project,
    inventory,
    settings,
    explicitSnapshot ? { savedWalls: savedProject?.walls ?? [] } : {}
  );
  const equipmentCalc = calcEquipmentPricing(
    project.selected_equipment,
    inventory,
    explicitSnapshot ? { savedEquipment: savedProject?.selected_equipment ?? [] } : {}
  );
  const equipmentPricing2 = equipmentCalc.map((row) => ({ available: row.issues.length === 0, issues: row.issues }));
  const catalogIssues = [
    ...poleCalc.polePricing.flatMap((entry) => entry.issues),
    ...wallCalc.wallPricing.flatMap((entry) => entry.issues),
    ...equipmentPricing2.flatMap((entry) => entry.issues),
    ...foundationAssemblyCatalogIssues(project, inventory).filter((issue) => !["pole", "wall", "internal_wall", "equipment", "attachment", "sub_attachment"].includes(issue.kind)),
    // Item-consumed Settings availability — kind "foundation" + item index so
    // each issue marks the card it belongs to (and gates the delivery scan).
    ...sourceItems.flatMap((item, index) => foundationItemSettingIssues(
      { ...item, excavation_method: item.excavation_method || project.excavation_method },
      settings,
      index
    ))
  ];
  const inputIssues = foundationProjectInputIssues(project);
  const versioned = sourceItems.map((item, index) => {
    const savedItem = !explicitSnapshot ? item : item.component_id && currentIds.get(item.component_id) === 1 ? savedItems.get(item.component_id) || null : null;
    const result = calculateVersionedItem(item, project, inventory, settings, savedItem);
    for (const issue of result?.issues || []) inputIssues.push({
      kind: "foundation",
      index,
      componentId: item.component_id ?? null,
      field: issue.field,
      code: issue.code,
      severity: "error",
      message: `Foundation ${index + 1}: ${issue.message}`
    });
    return result;
  });
  const cabinetCalc = calcSignageCabinetPricing(project.signage_cabinets);
  const signageCabinetPricing = cabinetCalc.map((row) => ({ available: row.available, issues: row.issues }));
  const landscapeCalc = landscapeSummary(project.landscape);
  const landscapeIssues = inputIssues.filter((issue) => issue.kind === "landscape");
  const landscapePricing = { available: landscapeIssues.length === 0, issues: landscapeIssues };
  const itemPricing = sourceItems.map((item, index) => {
    const issues = [
      ...catalogIssues.filter((issue) => issue.kind === "foundation" && issue.index === index),
      ...inputIssues.filter((issue) => issue.kind === "foundation" && issue.index === index)
    ];
    return { available: issues.length === 0, issues };
  });
  const items = sourceItems.map((item, index) => {
    const savedItem = !explicitSnapshot ? item : item.component_id && currentIds.get(item.component_id) === 1 ? savedItems.get(item.component_id) || null : null;
    return { ...item, ...versioned[index]?.cost || calcItem(item, project, inventory, settings, savedItem) };
  });
  const equipment = equipmentCalc.map((row) => row.pricedEntry);
  const deliveryCheck = itemPricing.some((item) => !item.available) ? null : calcConcreteDelivery(
    { ...project, settings },
    (project.items || []).map((i) => ({
      ...i,
      // Versioned items price steel outside the ported legacy formula — the
      // delivery volume scan must not read their rebar through that lens.
      ...i.reinforcement_calculation_version === 2 ? { include_rebar: false } : {},
      excavation_method: i.excavation_method || project.excavation_method
    })),
    inventory
  );
  const delivery = deliveryCheck === null || deliveryCheck.pricingUnavailable === true ? savedConcreteDelivery(savedProject) : deliveryCheck;
  if (deliveryCheck?.issues?.length) catalogIssues.push(...deliveryCheck.issues);
  const constructionWarnings = foundationConstructionWarnings(
    project,
    inventory,
    { items, deliveryCheck }
  );
  const walls = wallCalc.walls;
  const poles = poleCalc.poles;
  const wallCaps = calcWallCaps(
    project.wall_caps,
    inventory,
    explicitSnapshot ? { savedCaps: savedProject?.wall_caps ?? [] } : {}
  );
  const sum = (key) => items.some((item, index) => !itemPricing[index].available && !hasFoundationCostSnapshot(item[key])) ? null : items.reduce((s, i) => s + num2(i[key]), 0);
  const addKnown = (a, b) => hasFoundationCostSnapshot(a) && hasFoundationCostSnapshot(b) ? a + b : null;
  const category = (key, value) => value !== null ? value : hasFoundationCostSnapshot(savedProject?.[key]) ? savedProject[key] : null;
  const itemsTotal = addKnown(sum("item_total_cost"), delivery.concreteTotal);
  const sumWall = (key) => {
    let total = 0;
    for (const wall of walls) {
      const value = wall.calculatedCosts?.[key];
      if (!hasFoundationCostSnapshot(value)) return null;
      total += value;
      if (!Number.isFinite(total)) return null;
    }
    return total;
  };
  const wallTotal = sumWall("totalCost");
  const sumPole = (key) => {
    let total = 0;
    for (const pole of poles) {
      const value = pole?.[key];
      if (!hasFoundationCostSnapshot(value)) return null;
      total += value;
      if (!Number.isFinite(total)) return null;
    }
    return total;
  };
  const polesTotal = sumPole("total_cost");
  const equipmentTotal = equipmentCostTotal(equipment);
  const totals = {
    // Bagged concrete is priced per item; ready-mix is priced per delivered truck.
    total_concrete_cost: category("total_concrete_cost", addKnown(sum("concrete_cost"), delivery.concreteTotal)),
    concrete_delivery_cost: delivery.concreteTotal,
    concrete_delivered_yards: delivery.roundedYards,
    concrete_rate_per_yard: delivery.ratePerYard,
    concrete_trucks: delivery.trucksList,
    additional_stops_cost: delivery.additionalStopsCost,
    total_rebar_cost: category("total_rebar_cost", sum("rebar_cost")),
    total_excavation_cost: category("total_excavation_cost", sum("excavation_cost")),
    total_forming_materials_cost: category("total_forming_materials_cost", sum("forming_cost")),
    total_labor_cost: category("total_labor_cost", addKnown(sum("pouring_cost"), sum("finishing_cost"))),
    total_pole_cost: category("total_pole_cost", sumPole("pole_cost")),
    total_pole_painting_cost: category("total_pole_painting_cost", sumPole("pole_painting_cost")),
    total_brick_cost: sumWall("materialCost"),
    total_fill_cost: sumWall("internalMaterialCost"),
    total_equipment_cost: category("total_equipment_cost", equipmentTotal),
    total_wall_cost: wallTotal,
    total_wall_cap_cost: wallCaps.total,
    wall_caps_by_material: wallCaps.byInventory,
    total_concrete_volume_cy: sum("concrete_volume_cy"),
    total_excavation_volume_cy: sum("excavation_volume_cy"),
    total_labor_hours: addKnown(sum("finishing_hours"), sum("excavation_hours")),
    // Page-level extras: held at the acknowledged project totals when the
    // recorded rows cannot be repriced — a null here is "unavailable", never $0.
    total_signage_cabinet_cost: category("total_signage_cabinet_cost", signageCabinetCostTotal(cabinetCalc)),
    total_landscape_cost: category("total_landscape_cost", landscapeIssues.length ? null : landscapeCalc.total)
  };
  totals.grand_total = itemsTotal === null || wallTotal === null || polesTotal === null || equipmentTotal === null || wallCaps.total === null ? null : itemsTotal + wallTotal + polesTotal + equipmentTotal + wallCaps.total;
  return {
    items,
    equipment,
    walls,
    poles,
    wallCaps: wallCaps.caps,
    totals,
    delivery,
    itemPricing,
    polePricing: poleCalc.polePricing,
    wallPricing: wallCalc.wallPricing,
    equipmentPricing: equipmentPricing2,
    signageCabinetPricing,
    landscapePricing,
    catalogIssues,
    inputIssues,
    constructionWarnings
  };
}
var money = (n) => `$${num2(n).toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export {
  calcEquipment,
  calcEquipmentPricing,
  calcItem,
  calcProject,
  calcSignageCabinetPricing,
  captureConcreteDeliverySnapshot,
  equipmentCostTotal,
  money,
  signageCabinetCostTotal
};
