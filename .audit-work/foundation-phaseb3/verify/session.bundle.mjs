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
var inventoryFiniteNumber = (value) => strictNumber(value);
var inventoryNonnegativeNumber = (value) => {
  const number2 = strictNumber(value);
  return number2 !== null && number2 >= 0 ? number2 : null;
};
var inventoryPositiveNumber = (value) => {
  const number2 = strictNumber(value, { unsignedExponent: true });
  return number2 !== null && number2 > 0 ? number2 : null;
};
var inventoryNonnegativeMeasurement = (value) => {
  const number2 = strictNumber(value, { unsignedExponent: true });
  return number2 !== null && number2 >= 0 ? number2 : null;
};
var inventoryIsPositiveWhole = (value) => {
  const number2 = inventoryFiniteNumber(value);
  const whole2 = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole2 && Number.isSafeInteger(number2) && number2 > 0;
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/legacyFoundationCalc.js
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
  for (const [key, fallback, label, positive3] of itemSettingConsumption(item)) {
    const number2 = inventorySettingNumber(settings?.[key], fallback);
    if (number2 === null || positive3 && number2 <= 0) {
      issues.push({
        kind: "foundation",
        index,
        componentId: item?.component_id ?? null,
        field: key,
        inventoryId: null,
        code: "foundation_setting_unavailable",
        message: `Foundation ${index + 1}: record a finite, ${positive3 ? "positive" : "nonnegative"} ${label.replace(/^positive /, "")} in Estimator Settings before repricing.`
      });
    }
  }
  return issues;
};
var getConcreteMixes = (invItem) => [
  { id: "3500_ae", name: "3500 AIR ENTRAINED (AE)", price: inventoryNonnegativeNumber(invItem?.mix_3500_price), field: "mix_3500_price", desc: "Often used for driveways, slabs, and moderate-load footings." },
  { id: "4000_ae", name: "4000 AIR ENTRAINED (AE)", price: inventoryNonnegativeNumber(invItem?.mix_4000_price), field: "mix_4000_price", desc: "STANDARD. Used for sign foundations, commercial flatwork, and structural footings requiring good durability." },
  { id: "4500_ae", name: "4500 AIR ENTRAINED (AE)", price: inventoryNonnegativeNumber(invItem?.mix_4500_price), field: "mix_4500_price", desc: "Used for heavy-duty commercial slabs and heavy traffic areas." },
  { id: "5000_ae", name: "5000 AIR ENTRAINED (AE)", price: inventoryNonnegativeNumber(invItem?.mix_5000_price), field: "mix_5000_price", desc: "High-strength mix for heavy structural columns, pillars, and extreme load conditions." },
  { id: "fast_set", name: "FAST SET", price: inventoryNonnegativeNumber(invItem?.mix_fast_set_price), field: "mix_fast_set_price", desc: "Quick-curing concrete used when rapid strength gain is needed to minimize downtime." }
];
var getConcreteAdmixtures = (invItem) => [
  { id: "calcium_chloride", name: "Calcium Chloride", price: inventoryNonnegativeNumber(invItem?.admix_calcium_chloride_price), field: "admix_calcium_chloride_price", desc: "Speeds up how fast the concrete dries. SELECT THIS when pouring in cold weather so it doesn't freeze before it sets. WARNING: Do NOT select this if using Rebar, as it causes rust!" },
  { id: "set_retarding", name: "Set-Retarding Admix (Type D)", price: inventoryNonnegativeNumber(invItem?.admix_set_retarding_price), field: "admix_set_retarding_price", desc: "Slows down how fast the concrete dries. SELECT THIS when pouring in very hot weather, or if the concrete truck has a very long drive to the site." },
  { id: "water_reducing", name: "Water-Reducing Admix (Type A)", price: inventoryNonnegativeNumber(invItem?.admix_water_reducing_price), field: "admix_water_reducing_price", desc: "Makes the concrete easier to pour without weakening it. SELECT THIS if you need the concrete to flow better into tight forms or around lots of rebar." },
  { id: "fibers", name: "Fibers", price: inventoryNonnegativeNumber(invItem?.admix_fibers_price), field: "admix_fibers_price", desc: "Tiny fibers mixed into the concrete to prevent small cracks. SELECT THIS for large flat slabs (like monument sign pads) or if the foundation will take physical abuse." },
  { id: "winter_service", name: "Winter Service", price: inventoryNonnegativeNumber(invItem?.admix_winter_service_price), field: "admix_winter_service_price", desc: "A fee the plant charges to use hot water so the mix doesn't freeze. SELECT THIS always during winter months when temperatures are freezing." }
];
var getSmallLoadFee = (yards, invItem) => {
  if (yards >= 5) return 0;
  if (yards >= 4.5) return inventoryNonnegativeNumber(invItem?.small_load_fee_4_5_4_75);
  if (yards >= 4) return inventoryNonnegativeNumber(invItem?.small_load_fee_4_4_25);
  if (yards >= 3) return inventoryNonnegativeNumber(invItem?.small_load_fee_3_3_75);
  if (yards >= 2) return inventoryNonnegativeNumber(invItem?.small_load_fee_2_2_75);
  if (yards >= 1) return inventoryNonnegativeNumber(invItem?.small_load_fee_1_1_75);
  return inventoryNonnegativeNumber(invItem?.small_load_fee_1_1_75);
};
var getFuelSurcharge = (invItem) => {
  return inventoryNonnegativeNumber(invItem?.fuel_surcharge);
};
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
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "concrete_delivery",
    index: null,
    componentId: null,
    field,
    inventoryId: firstConcreteInv?.id ?? null,
    code,
    message: `Concrete delivery: ${message}.`
  });
  const mix = availableMixes.find((m) => m.id === project.project_concrete_type) || availableMixes.find((m) => m.id === "4000_ae");
  if (roundedYards > 0) {
    if (firstConcreteInv === null) {
      add(
        "selected_concrete_id",
        "supplier_unavailable",
        "no ready-mix concrete supplier is assigned \u2014 select a supplier with catalog prices before repricing"
      );
    } else {
      if (project.project_concrete_type && !availableMixes.some((m) => m.id === project.project_concrete_type)) {
        add(
          "project_concrete_type",
          "supplier_price_unavailable",
          "the saved mix selection is not in the supplier catalog \u2014 pick a listed mix before repricing"
        );
      }
      if (!mix || inventoryNonnegativeNumber(mix.price) === null) {
        add(
          mix?.field || "mix_price",
          "supplier_price_unavailable",
          `record a finite, nonnegative ${mix?.name || "selected mix"} price on the concrete supplier before repricing`
        );
      }
      for (const admixId of project.project_concrete_admixtures || []) {
        const admix = availableAdmixes.find((x) => x.id === admixId);
        if (!admix) {
          add(
            "project_concrete_admixtures",
            "supplier_price_unavailable",
            "the saved admixture selection is not in the supplier catalog \u2014 pick a listed admixture before repricing"
          );
        } else if (inventoryNonnegativeNumber(admix.price) === null) {
          add(
            admix.field || "admix_price",
            "supplier_price_unavailable",
            `record a finite, nonnegative ${admix.name} price on the concrete supplier before repricing`
          );
        }
      }
      if (inventoryNonnegativeNumber(firstConcreteInv.fuel_surcharge) === null) {
        add(
          "fuel_surcharge",
          "supplier_price_unavailable",
          "record a finite, nonnegative fuel surcharge on the concrete supplier before repricing"
        );
      }
      let scanYards = roundedYards;
      while (scanYards > 0) {
        const truckYards = Math.min(scanYards, 9);
        scanYards -= truckYards;
        const roundedTruckYards = Math.ceil(truckYards * 4) / 4;
        if (getSmallLoadFee(roundedTruckYards, firstConcreteInv) === null) {
          add(
            "small_load_fee",
            "supplier_price_unavailable",
            `record a finite, nonnegative small-load fee for the ${roundedTruckYards} CY truck bracket on the concrete supplier before repricing`
          );
          break;
        }
      }
    }
  }
  if (issues.length) {
    return {
      pricingUnavailable: true,
      issues,
      concreteTotal: null,
      roundedYards,
      ratePerYard: null,
      trucksList: [],
      additionalStopsCost: null,
      availableMixes,
      availableAdmixes
    };
  }
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
  return { issues, concreteTotal, roundedYards, ratePerYard, trucksList, additionalStopsCost, availableMixes, availableAdmixes };
};

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationEquipmentBindings.js
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
    attachmentRows = Object.entries(source.attachment_counts).map(([id, quantity2], rowIndex) => ({
      id,
      quantity: num(quantity2),
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
  const subAttachmentRows = Object.entries(source.sub_attachment_counts || {}).map(([id, quantity2], rowIndex) => ({
    id,
    quantity: num(quantity2),
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/wallCapCalculator.js
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
    if (inv.material_type !== "wall_cap") {
      issue("cap_inventory_id", "catalog_item_type_mismatch", "the selected catalog material is not a wall cap.");
      return held(cap);
    }
    const availability = foundationCatalogRowAvailability(inv);
    if (availability !== "active") {
      issue(
        "cap_inventory_id",
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted" ? "the selected catalog material is marked deleted \u2014 pick a replacement." : "the selected catalog material is inactive \u2014 reactivate it or pick a replacement."
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
    return {
      ...cap,
      cap_name: inv.material_name || "",
      stock_length_inches: stockLength,
      cost: rate
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
function foundationAssemblyCatalogIssues(project, inventory = []) {
  const issues = [];
  const check = (row, index, kind, field, label) => {
    const id = row[field];
    const assigned3 = typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
    if (!assigned3) {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: null,
        code: "catalog_item_unassigned",
        message: `${label} ${index + 1}: select a catalog material.`
      });
      return;
    }
    const match = inventory.find((record) => record.id === id);
    if (!match) {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: id,
        code: "catalog_item_unavailable",
        message: `${label} ${index + 1}: selected catalog material is unavailable \u2014 it may have been deleted or deactivated.`
      });
      return;
    }
    const availability = foundationCatalogRowAvailability(match);
    if (availability !== "active") {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: id,
        code: availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        message: availability === "deleted" ? `${label} ${index + 1}: selected catalog material is marked deleted \u2014 pick a replacement.` : `${label} ${index + 1}: selected catalog material is inactive \u2014 reactivate it or pick a replacement.`
      });
    }
  };
  for (const [index, pole] of (project?.poles || []).entries()) {
    check(pole, index, "pole", "pole_id", "Pole");
  }
  if (!project?.project_concrete_type) {
    const firstServiceItem = (project?.items || []).find((item) => {
      const row = inventory.find((record) => record?.id === item?.selected_concrete_id);
      return row?.material_type === "concrete_service";
    });
    if (firstServiceItem) {
      issues.push({
        kind: "concrete_delivery",
        index: null,
        componentId: null,
        field: "project_concrete_type",
        inventoryId: firstServiceItem.selected_concrete_id ?? null,
        code: "catalog_item_unassigned_default",
        message: "Concrete delivery: no concrete mix is selected \u2014 the supplier's catalog default mix is consumed when concrete ships. Pick a mix explicitly."
      });
    }
  }
  return [
    ...issues,
    ...foundationWallCatalogIssues(project?.walls || [], inventory),
    ...foundationWallCapCatalogIssues(project?.wall_caps || [], inventory),
    ...(project?.items || []).flatMap((item, index) => foundationItemCatalogIssues(item, inventory, index)),
    ...foundationEquipmentCatalogIssues(project?.selected_equipment || [], inventory)
  ];
}
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/wallCalculator.js
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
function calcWallCosts({ wall, wallShape, wallMaterial, internalMaterial, includeInternalWall, wallHeightInches, internalWallHeightInches, mortarGapInches, internalMortarGapInches, settings }) {
  if (!wallShape || !wallMaterial || !wallShape.segments) return null;
  const isConcrete = canonicalWallMaterialSubtype(wallMaterial.wall_material_subtype) === "concrete";
  const unitL = wallMaterial.wall_unit_length_inches || 8;
  const unitW = wallMaterial.wall_unit_width_inches || 4;
  const unitH = wallMaterial.wall_unit_height_inches || 2.25;
  const mortar = isConcrete ? 0 : mortarGapInches;
  const courseH = unitH + mortar;
  const numCourses = isConcrete ? 0 : wallHeightInches / courseH;
  const brickPitch = unitL + (isConcrete ? 0 : mortar);
  const totalLinearInches = wallShape.segments.reduce((s, seg) => s + seg.length, 0);
  let totalBricks = 0;
  if (isConcrete) {
    totalBricks = totalLinearInches * wallHeightInches * unitW / CUBIC_INCHES_PER_CUBIC_YARD;
  } else {
    const numCoursesRounded = Math.ceil(numCourses);
    wallShape.segments.forEach((seg) => {
      const bricksThisCourse = Math.ceil(seg.length / brickPitch);
      totalBricks += bricksThisCourse * numCoursesRounded;
    });
  }
  const finalBricks = wallMaterial.custom_outer_material_qty !== void 0 && wallMaterial.custom_outer_material_qty !== null ? wallMaterial.custom_outer_material_qty : totalBricks;
  const materialCost = finalBricks * (wallMaterial.custom_cost_per_unit !== void 0 && wallMaterial.custom_cost_per_unit !== null ? wallMaterial.custom_cost_per_unit : wallMaterial.cost_per_unit || 0);
  const surfaceAreaSqFtSingleSide = totalLinearInches * wallHeightInches / 144;
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
        availability === "deleted" ? "selected catalog material is marked deleted \u2014 pick a replacement" : "selected catalog material is inactive \u2014 reactivate it or pick a replacement"
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
            "poured concrete is priced per cubic yard \u2014 record the unit as CY (or clear it) so the cost basis is unambiguous before repricing"
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
  const settingCheck = (key, label, positive3) => {
    const value = positive3 ? inventoryPositiveSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]) : inventorySettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]);
    if (value === null) {
      add(
        "wall",
        key,
        wall?.materialId,
        "wall_setting_unavailable",
        `record a finite, ${positive3 ? "positive" : "nonnegative"} ${label} in Estimator Settings before repricing`
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
function foundationWallPricingIssues(wall, inventory = [], index = 0, settings = {}) {
  return wallPricing(wall, inventory, index, settings).issues;
}
function foundationWallCatalogIssues(walls = [], inventory = [], settings = {}) {
  return walls.flatMap((wall, index) => foundationWallPricingIssues(wall, inventory, index, settings));
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
          // masonry is untouched — no extra keys on unchanged paths.
          ...wallMaterial?.wall_material_subtype === "concrete" ? { materialQuantityUnit: "cy" } : {},
          ...wall.includeInternalWall && internalMaterial?.wall_material_subtype === "concrete" ? { internalMaterialQuantityUnit: "cy" } : {}
        }
      };
    }),
    wallPricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues }))
  };
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/poleCalculator.js
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
        "embedment and legacy depth-in-ground record different values \u2014 clear one before repricing"
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
        "total stock length is shorter than height above grade plus embedment \u2014 lengthen it or clear it before repricing"
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
        "recorded pole shape must be a value like round or square \u2014 clear or correct it before repricing"
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
      "legacy item-pole data cannot price here \u2014 migrate it into the Poles section or remove it"
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
          availability === "deleted" ? "selected catalog material is marked deleted \u2014 pick a replacement" : "selected catalog material is inactive \u2014 reactivate it or pick a replacement"
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
        total_cost: poleCost + paintingCost
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/landscapeMaterials.js
var LANDSCAPE_MATERIALS = [
  { key: "dirt", label: "Dirt (Eraser)", color: "#a1866f", cost_per_sqft: 0 },
  { key: "grass", label: "Grass", color: "#4ade80", cost_per_sqft: 0.75 },
  { key: "concrete", label: "Concrete", color: "#cbd5e1", cost_per_sqft: 8 },
  { key: "asphalt", label: "Asphalt", color: "#475569", cost_per_sqft: 5 },
  { key: "gravel", label: "Gravel", color: "#94a3b8", cost_per_sqft: 2.25 },
  { key: "sand", label: "Sand", color: "#fcd34d", cost_per_sqft: 1.75 },
  { key: "mulch", label: "Mulch", color: "#92400e", cost_per_sqft: 1.25 },
  { key: "wood_decking", label: "Wood Decking", color: "#d97706", cost_per_sqft: 14 },
  { key: "water", label: "Water", color: "#38bdf8", cost_per_sqft: 6 }
];
var materialByKey = (key) => LANDSCAPE_MATERIALS.find((m) => m.key === key);
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
      "the recorded site grid is malformed \u2014 repair or clear it before repricing"
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
    const mat = materialByKey(key);
    if (!mat) {
      add(
        "cells",
        "landscape_material_unavailable",
        `site material ${JSON.stringify(key)} is not in the landscape catalog \u2014 pick a catalog material or erase it before repricing`
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
  const counts = {};
  const rows = {};
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt") return;
    counts[key] = (counts[key] || 0) + 1;
    if (sqftPerCell !== null) rows[key] = (rows[key] || 0) + sqftPerCell;
  });
  const lines = Object.entries(counts).map(([key, count]) => {
    const mat = materialByKey(key);
    const sqft = sqftPerCell === null ? null : rows[key];
    const rate = mat ? inventoryNonnegativeNumber(mat.cost_per_sqft) : null;
    return {
      key,
      label: mat?.label || key,
      color: mat?.color || "#999",
      cells: count,
      sqft,
      cost: sqft === null || rate === null ? null : sqft * rate
    };
  });
  const total = lines.every((l) => l.cost !== null) ? lines.reduce((s, l) => s + l.cost, 0) : null;
  return { lines, total, issues: landscapeInputIssues(landscape) };
};

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
  const quantity2 = foundationInputNumber(count);
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
    const volume = type === "spread_foot" ? dimensions.length_inches / 12 * (dimensions.width_inches / 12) * depth / 27 * quantity2 : Math.PI * radius * radius * depth / 27 * quantity2;
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
  return { issues, type, quantity: quantity2, dimensions };
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
    number: number2,
    list: list2,
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
  const { design, number: number2, list: list2, identity, bounds, issue, group, counts } = c;
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
  list2(design.spread?.inter_mat_ties, "spread.inter_mat_ties", 2048).forEach((tie, index) => {
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
  const { design, number: number2, list: list2, identity, bounds, issue, group, counts } = c;
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
  list2(design.pillar?.hoops, "pillar.hoops", 256).forEach((hoop, index) => {
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
function quantityTotals(counts, quantity2) {
  const totals = {};
  for (const [key, value] of Object.entries(counts)) {
    const length = key.endsWith("_length_inches");
    totals[length ? key.replace("_length_inches", "_feet") : key] = (length ? value / 12 : value) * quantity2;
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
  const quantity2 = Number(item.quantity ?? 1);
  base.instanceCount = quantity2;
  if (!item.include_rebar) return {
    ...base,
    status: "off",
    perInstance: emptyQuantities(),
    totals: quantityTotals(emptyQuantities(), quantity2),
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
  const totals = quantityTotals(c.counts, quantity2);
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationInputValidation.js
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
  const quantity2 = inventoryFiniteNumber(count);
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
    const volume = type === "spread_foot" ? dimensions.length_inches / 12 * (dimensions.width_inches / 12) * depth / 27 * quantity2 : Math.PI * radius * radius * depth / 27 * quantity2;
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
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
  } else if (record.include_rebar) {
    const optional = (field, code, label, valid) => {
      const value = record[field];
      if (value !== void 0 && value !== null && !valid(value)) add(field, code, label);
    };
    const positive3 = (value) => {
      const number2 = inventoryFiniteNumber(value);
      return number2 !== null && number2 > 0;
    };
    const whole2 = (field, label) => optional(
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
          positive3
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
        (value) => positive3(value) && (dimensions.diameter === null || dimensions.diameter <= 0 || inventoryFiniteNumber(value) <= dimensions.diameter)
      );
    }
  }
  for (const [field, label] of ITEM_CUSTOM_OVERRIDE_FIELDS) {
    const raw = record[field];
    if (raw === void 0 || raw === null) continue;
    const number2 = inventoryFiniteNumber(raw);
    if (number2 === null || number2 < 0) {
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationConstructionChecks.js
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);
var finiteRate = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive = (value) => finiteRate(value) && value > 0;
var isRecord2 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
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
  const reference = isRecord2(material) ? material : {};
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
  const quantity2 = quantityOverride == null ? null : numeric(quantityOverride);
  if (quantity2 !== null && !finiteRate(quantity2)) issue(
    "custom_rebar_qty",
    "reinforcement_quantity_override_invalid",
    "Use a finite nonnegative aggregate item quantity; zero is allowed."
  );
  const settingsValid = isRecord2(settings);
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
    quantity_override_ft: quantity2,
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
var isRecord3 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
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
  if (!isRecord3(row) || row.material_type !== "rebar_support") return null;
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
  const matches = (Array.isArray(inventory) ? inventory : []).filter((row) => isRecord3(row) && row.id === material.inventory_id && row.material_type === "rebar");
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
  const config = isRecord3(design?.supports) ? design.supports : {};
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
var isRecord4 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
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
  if (!isRecord4(item)) {
    issue("item", "reinforcement_common_item_invalid", "A current foundation record is required.");
    return unavailable();
  }
  if (!Array.isArray(inventory) || inventory.some((row) => !isRecord4(row))) {
    issue("inventory", "reinforcement_common_inventory_unavailable", "Current concrete and forming catalog records could not be verified.");
    return unavailable();
  }
  if (!isRecord4(settings)) {
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationCalc.js
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
  const version2 = item.reinforcement_calculation_version;
  if (version2 == null || version2 === 1) return null;
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
          supports: structuredClone(reinforcement.supports)
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
    const quantity2 = !row.inventory ? 0 : rawQuantity(row);
    if (!row.inventory || Number(quantity2) === 0) return { row, skipped: true };
    const parsedQuantity = inventoryPositiveNumber(quantity2);
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
    const quantity2 = entry.quantity === void 0 || entry.quantity === null || entry.quantity === "" ? 1 : Number(entry.quantity);
    const cost = Number(entry.unit_cost) * quantity2;
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementDraft.js
var isRecord5 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var scalar = (value) => value === null || ["undefined", "string", "number", "boolean"].includes(typeof value) ? value : NaN;
var numeric2 = (value) => {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = foundationInputNumber(value);
  return parsed !== null ? parsed : scalar(value);
};
function createFoundationReinforcementDraft(item = {}) {
  const accepted = item?.reinforcement_calculation_version === 2;
  const design = accepted && isRecord5(item.reinforcement_design) ? structuredClone(item.reinforcement_design) : {
    version: 2,
    bar_diameter_inches: "",
    cover_inches: { side: "", top: "", bottom: "" },
    supports: {
      mode: "unconfigured",
      reason: "",
      spacing_inches: "",
      catalog_id: "",
      mats: [],
      placements: []
    },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } }
  };
  return {
    schema_version: 1,
    design,
    material: accepted && isRecord5(item.reinforcement_material) ? structuredClone(item.reinforcement_material) : { kind: "" },
    overrides: { quantity_ft: item?.custom_rebar_qty ?? null, cost_per_ft: item?.custom_rebar_cost_per_ft ?? null }
  };
}
function prepareFoundationReinforcementDraft(draft) {
  const issues = [];
  const issue = (field, message) => issues.push({ field, code: "reinforcement_draft_invalid", severity: "error", message });
  if (!isRecord5(draft) || draft.schema_version !== 1) {
    issue("schema_version", "A supported version-1 reinforcement proposal is required.");
    return { prepared: null, issues };
  }
  const raw = draft.design;
  if (!isRecord5(raw)) {
    issue("design", "The proposal needs a reinforcement design object.");
    return { prepared: null, issues };
  }
  const numbers = (record, fields) => Object.fromEntries(fields.map((field) => [field, numeric2(record?.[field])]));
  const reference = (value) => typeof value === "string" ? value : scalar(value);
  const list2 = (value, field, maximum, map) => {
    if (value == null) return value;
    if (!Array.isArray(value) || value.length > maximum) {
      issue(field, `Use an explicit list of at most ${maximum} records.`);
      return null;
    }
    return value.map((record, index) => {
      if (!isRecord5(record)) {
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
    supports: {
      mode: scalar(raw.supports?.mode),
      reason: scalar(raw.supports?.reason),
      spacing_inches: numeric2(raw.supports?.spacing_inches),
      catalog_id: reference(raw.supports?.catalog_id),
      mats: list2(raw.supports?.mats, "design.supports.mats", 256, (record) => ({
        mat_id: reference(record.mat_id),
        count: numeric2(record.count)
      })),
      placements: list2(raw.supports?.placements, "design.supports.placements", 4096, (record) => ({
        mat_id: reference(record.mat_id),
        x_inches: numeric2(record.x_inches),
        z_inches: numeric2(record.z_inches)
      }))
    },
    spread: {
      mats: list2(raw.spread?.mats, "design.spread.mats", 256, (record) => ({
        id: reference(record.id),
        ...numbers(record, ["bearing_elevation_inches", "max_spacing_x_inches", "max_spacing_z_inches"])
      })),
      inter_mat_ties: list2(raw.spread?.inter_mat_ties, "design.spread.inter_mat_ties", 4096, (record) => ({
        id: reference(record.id),
        from_mat_id: reference(record.from_mat_id),
        to_mat_id: reference(record.to_mat_id),
        ...numbers(record, ["x_inches", "z_inches", "cut_length_inches"])
      }))
    },
    pillar: {
      hoops: list2(raw.pillar?.hoops, "design.pillar.hoops", 256, (record) => ({
        id: reference(record.id),
        ...numbers(record, ["center_y_inches", "centerline_diameter_inches", "cut_allowance_inches"])
      })),
      longitudinal: numbers(raw.pillar?.longitudinal, ["count", "radius_inches", "bottom_end_inches", "top_end_inches"])
    }
  };
  const source = isRecord5(draft.material) ? draft.material : {};
  const material = {
    kind: scalar(source.kind),
    inventory_id: reference(source.inventory_id),
    name: scalar(source.name),
    reason: scalar(source.reason),
    unit: scalar(source.unit),
    ...numbers(source, ["bar_diameter_inches", "weight_lb_per_ft", "cost_per_ft"])
  };
  const overrides = isRecord5(draft.overrides) ? draft.overrides : {};
  if (draft.overrides != null && !isRecord5(draft.overrides)) issue("overrides", "Proposal overrides must be an object.");
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementBasisKey.js
var MAX_DEPTH = 32;
var MAX_NODES = 1e6;
var MAX_CHARACTERS = 16e6;
function encodeFoundationReinforcementBasis(value) {
  const chunks = [], ancestors = /* @__PURE__ */ new Set();
  let nodes = 0, characters = 0;
  const append = (text3) => {
    characters += text3.length;
    if (characters > MAX_CHARACTERS) throw new RangeError("Reinforcement preview basis is too large.");
    chunks.push(text3);
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementProposal.js
var isRecord6 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var identifier = (value) => typeof value === "string" && Boolean(value.trim()) && value.trim() === value && value.length <= 256;
var finite2 = (value) => typeof value === "number" && Number.isFinite(value);
var amount = (item, key) => finite2(item?.[key]) ? item[key] : null;
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
  "reinforcement_proposal",
  "support_count",
  "support_purchased_units",
  "support_packs",
  "support_material_cost",
  "support_labor_cost",
  "support_labor_hours",
  "support_cost"
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
  return { before, proposed, delta: finite2(delta) ? delta : null };
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
  if (!isRecord6(project) || !Array.isArray(project.items) || project.items.some((item2) => !isRecord6(item2)) || !isRecord6(savedProject) || !Array.isArray(savedProject.items) || savedProject.items.some((item2) => !isRecord6(item2))) {
    issue("reinforcement_proposal_source_required", "Current raw design and acknowledged saved source are required.");
    return unavailable();
  }
  if (!isRecord6(context) || context.loaded !== true || !identifier(context.ownerId) || !identifier(context.sourceId) || context.sourceId !== project.id || savedProject.id !== project.id || !identifier(context.sourceUpdatedAt) || savedProject.updated_date !== context.sourceUpdatedAt || !Number.isSafeInteger(context.generation) || context.generation < 0 || !Number.isSafeInteger(context.editRevision) || context.editRevision < 0 || !(context.estimateId === null || identifier(context.estimateId)) || context.estimateId !== null && !identifier(context.estimateUpdatedAt)) {
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
    const blocked = !isRecord6(settings) || !Array.isArray(inventory) || inventory.some((row) => !isRecord6(row)) || foundationItemInputIssues(item).length || foundationItemCatalogIssues(item, inventory).length;
    current = blocked ? savedItem : calcItem(item, project, inventory, settings, savedItem);
    currentProvenance = blocked ? "Acknowledged saved amount" : "Current legacy calculation";
  }
  const comparisons = {
    steel: compare(amount(current, "rebar_cost"), amount(projection.itemCost, "rebar_cost")),
    supports: compare(amount(current, "support_cost"), amount(projection.itemCost, "support_cost")),
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
        rate_sources: structuredClone(projection.reinforcement.rateSources),
        supports: structuredClone(projection.reinforcement.supports)
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementEditorSession.js
var plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finite3 = (value) => typeof value === "number" && Number.isFinite(value);
var money = (value) => finite3(value) ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Unavailable";
var quantity = (value) => finite3(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not recorded";
var emptyAcknowledgments = () => ({ preliminary: false, warningCodes: [] });
var sameAnchors = (before, after) => before && before.project === after.project && before.savedProject === after.savedProject && before.inventory === after.inventory && before.settings === after.settings && before.contextKey === JSON.stringify(after.context);
var anchors = (input) => ({ ...input, contextKey: JSON.stringify(input.context) });
function section(input, project) {
  const calculation = calcProject(project, input.inventory, input.settings, { savedProject: input.savedProject });
  const base = calculation.totals.grand_total;
  const cabinetCost = calculation.totals.total_signage_cabinet_cost;
  const landscapeCost = calculation.totals.total_landscape_cost;
  const total = finite3(base) && finite3(cabinetCost) && finite3(landscapeCost) ? base + cabinetCost + landscapeCost : null;
  return { calculation, total };
}
function proposalView(proposal, input, componentId) {
  const issues = [...proposal.issues], comparisons = proposal.comparisons;
  const proposedCost = proposal.projection?.itemCost;
  let before, after, sectionDelta = null;
  if (proposal.prepared && proposedCost) {
    try {
      const prepared = proposal.prepared;
      const project = { ...input.project, items: input.project.items.map((item) => item.component_id === componentId ? {
        ...item,
        reinforcement_calculation_version: 2,
        reinforcement_design: prepared.design,
        reinforcement_material: prepared.material,
        custom_rebar_qty: prepared.overrides.quantity_ft,
        custom_rebar_cost_per_ft: prepared.overrides.cost_per_ft
      } : item) };
      before = section(input, input.project);
      after = section(input, project);
      if (finite3(before.total) && finite3(after.total)) sectionDelta = after.total - before.total;
      if (after.calculation.catalogIssues.length || after.calculation.inputIssues.length) sectionDelta = null;
    } catch {
      sectionDelta = null;
    }
  }
  if (!finite3(sectionDelta)) issues.push({
    code: "reinforcement_section_delta_unavailable",
    severity: "error",
    message: "The full Concrete section delta is unavailable. Resolve other design or catalog issues and refresh before accepting."
  });
  const currentItem = before?.calculation.items.find((item) => item.component_id === componentId);
  const currentProvenance = comparisons?.currentProvenance || "Current amount unavailable";
  const sectionProvenance = before?.calculation.catalogIssues.length || before?.calculation.inputIssues.length ? "Current section with acknowledged fallback amounts where unavailable" : "Current full Concrete section calculation";
  const row = (label, value, provenance) => ({ label, value: money(value), provenance });
  return {
    id: proposal.id,
    canAccept: proposal.canAccept && finite3(sectionDelta),
    stale: false,
    warningCodes: [...proposal.warningCodes || []],
    issues,
    quantities: [
      { label: "Physical steel (ft)", before: quantity(currentItem?.rebar_geometry_feet), after: quantity(proposedCost?.rebar_geometry_feet) },
      { label: "Priced steel (ft)", before: quantity(currentItem?.rebar_feet), after: quantity(proposedCost?.rebar_feet) },
      { label: "Reinforcement labor (hr)", before: quantity(currentItem?.rebar_labor_hours), after: quantity(proposedCost?.rebar_labor_hours) },
      { label: "Supports (required)", before: quantity(currentItem?.support_count), after: quantity(proposedCost?.support_count) },
      { label: "Supports (purchased)", before: quantity(currentItem?.support_purchased_units), after: quantity(proposedCost?.support_purchased_units) }
    ],
    costs: [
      row("Current steel", comparisons?.steel.before, currentProvenance),
      row("Proposed steel", comparisons?.steel.proposed, "Fresh preliminary internal steel cost"),
      row("Steel delta", comparisons?.steel.delta, "Proposed minus current"),
      row("Current supports", comparisons?.supports?.before, currentProvenance),
      row("Proposed supports", comparisons?.supports?.proposed, "Fresh modeled support cost"),
      row("Support delta", comparisons?.supports?.delta, "Proposed minus current"),
      row("Current foundation", comparisons?.item.before, currentProvenance),
      row("Proposed foundation", comparisons?.item.proposed, "Fresh full foundation cost"),
      row("Foundation delta", comparisons?.item.delta, "Proposed minus current"),
      row("Current section", before?.total, sectionProvenance),
      row("Proposed section", after?.total, "Full Concrete section including signage and landscape"),
      row("Section delta", sectionDelta, "Proposed minus current; not a customer selling price"),
      row("Saved steel", comparisons?.savedSteel, "Acknowledged saved source"),
      row("Saved foundation", comparisons?.savedItem, "Acknowledged saved source")
    ]
  };
}
function createFoundationReinforcementEditorSession({ getCurrent, commit, createId, now, onChange = () => {
} }) {
  const entries = /* @__PURE__ */ new Map();
  let scope;
  const current = () => {
    const input = getCurrent();
    const nextScope = JSON.stringify([
      input.context?.ownerId,
      input.context?.sourceId,
      input.context?.estimateId,
      input.context?.generation
    ]);
    if (scope !== nextScope) {
      entries.clear();
      scope = nextScope;
    }
    return input;
  };
  const entryFor = (id) => {
    if (!entries.has(id)) entries.set(id, { acknowledgments: emptyAcknowledgments(), proposal: null, view: null, activeId: null, error: "" });
    return entries.get(id);
  };
  const findItem = (input, id) => {
    const matches = input.project?.items?.filter((item) => item.component_id === id) || [];
    return matches.length === 1 ? matches[0] : null;
  };
  const allowed = (input, id) => input.context?.loaded === true && !input.blocked && Boolean(findItem(input, id));
  const report = (entry, message) => {
    entry.error = message;
    onChange();
    return false;
  };
  const reset = (entry) => Object.assign(entry, { acknowledgments: emptyAcknowledgments(), proposal: null, view: null, activeId: null, error: "" });
  const edit = (id, update) => {
    const input = current(), entry = entryFor(id);
    if (!allowed(input, id)) return report(entry, "The editor context is unavailable or busy; no proposal was changed.");
    const item = findItem(input, id);
    const nextItem = update(item);
    const ok = commit((previous) => ({ items: previous.items.map((record) => record.component_id === id ? nextItem : record) }));
    if (ok !== true) return report(entry, "The proposal edit could not be committed in the current editor.");
    reset(entry);
    onChange();
    return true;
  };
  return {
    read(id) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      return {
        draft: item?.reinforcement_proposal ?? null,
        preview: entry.view ? { ...entry.view, stale: entry.activeId !== entry.proposal?.id || !sameAnchors(entry.anchors, input) } : null,
        acknowledgments: structuredClone(entry.acknowledgments),
        error: entry.error,
        disabled: !allowed(input, id)
      };
    },
    start(id) {
      return edit(id, (item) => ({ ...item, reinforcement_proposal: createFoundationReinforcementDraft(item) }));
    },
    changeDraft(id, draft) {
      if (!plain(draft)) return false;
      return edit(id, (item) => ({ ...item, reinforcement_proposal: structuredClone(draft) }));
    },
    discard(id) {
      return edit(id, (item) => {
        const next = { ...item };
        delete next.reinforcement_proposal;
        return next;
      });
    },
    acknowledge(id, value) {
      const input = current(), entry = entryFor(id);
      if (!allowed(input, id) || !plain(value) || typeof value.preliminary !== "boolean" || !Array.isArray(value.warningCodes) || value.warningCodes.some((code) => typeof code !== "string" || !code.trim())) return false;
      entry.acknowledgments = { preliminary: value.preliminary, warningCodes: [...new Set(value.warningCodes)] };
      entry.activeId = null;
      entry.error = "";
      onChange();
      return true;
    },
    preview(id) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      if (!allowed(input, id) || !item?.reinforcement_proposal) return report(entry, "Start a proposal in the current editor before previewing.");
      try {
        const proposal = createFoundationReinforcementProposal({
          ...input,
          rawDraft: item.reinforcement_proposal,
          componentId: id,
          proposalId: createId(),
          acknowledgments: entry.acknowledgments
        });
        entry.proposal = proposal;
        entry.view = proposalView(proposal, input, id);
        entry.activeId = proposal.id;
        entry.anchors = anchors(input);
        entry.error = "";
        onChange();
        return true;
      } catch (error) {
        entry.activeId = null;
        return report(entry, error.message || "The proposal could not be calculated.");
      }
    },
    accept(id, requestedId) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      if (!allowed(input, id) || !entry.view?.canAccept || !entry.activeId || requestedId !== entry.activeId || !sameAnchors(entry.anchors, input)) return report(entry, "Refresh and review the current proposal before accepting.");
      const activeProposalId = entry.activeId;
      entry.activeId = null;
      const result = acceptFoundationReinforcementProposal({
        ...input,
        rawDraft: item.reinforcement_proposal,
        acknowledgments: entry.acknowledgments,
        proposal: entry.proposal,
        requestedId,
        activeProposalId,
        acceptedAt: now()
      });
      if (!result.ok) return report(entry, result.message);
      if (commit(() => result.project) !== true) return report(entry, "Acceptance could not be committed; refresh the proposal.");
      reset(entry);
      onChange();
      return true;
    }
  };
}
export {
  createFoundationReinforcementEditorSession
};
