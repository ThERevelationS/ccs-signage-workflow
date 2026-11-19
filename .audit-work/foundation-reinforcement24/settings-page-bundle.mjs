// frozen:/app/src/pages/FoundationEstimator.jsx
import { useState as useState3, useEffect as useEffect2, useMemo as useMemo2, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

// s:s://@/components/ui/input
import { jsx } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx("input", { ...p });

// s:s://@/components/ui/tabs
import { jsx as jsx2 } from "react/jsx-runtime";
var Tabs = (p) => /* @__PURE__ */ jsx2("div", { children: p.children });
var TabsContent = (p) => /* @__PURE__ */ jsx2("div", { children: p.children });
var TabsList = (p) => /* @__PURE__ */ jsx2("div", { children: p.children });
var TabsTrigger = (p) => /* @__PURE__ */ jsx2("button", { type: "button", onClick: p.onClick, children: p.children });

// s:s://lucide-react
var Trash2 = () => null;
var Plus = () => null;
var Layers = () => null;
var Wrench = () => null;
var Square = () => null;
var Anchor = () => null;
var LayoutGrid = () => null;
var ClipboardList = () => null;
var TrendingUp = () => null;
var Trees = () => null;
var Tag = () => null;
var PenLine = () => null;
var Box = () => null;
var Copy = () => null;
var Undo2 = () => null;

// frozen:/app/src/components/estimator/foundation/legacyFoundationCalc.js
var supplierPriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
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
  for (const [key, fallback, label, positive] of itemSettingConsumption(item)) {
    const number = foundationSettingNumber(settings?.[key], fallback);
    if (number === null || positive && number <= 0) {
      issues.push({
        kind: "foundation",
        index,
        componentId: item?.component_id ?? null,
        field: key,
        inventoryId: null,
        code: "foundation_setting_unavailable",
        message: `Foundation ${index + 1}: record a finite, ${positive ? "positive" : "nonnegative"} ${label.replace(/^positive /, "")} in Estimator Settings before repricing.`
      });
    }
  }
  return issues;
};
var getConcreteMixes = (invItem) => [
  { id: "3500_ae", name: "3500 AIR ENTRAINED (AE)", price: supplierPriceNumber(invItem?.mix_3500_price), field: "mix_3500_price", desc: "Often used for driveways, slabs, and moderate-load footings." },
  { id: "4000_ae", name: "4000 AIR ENTRAINED (AE)", price: supplierPriceNumber(invItem?.mix_4000_price), field: "mix_4000_price", desc: "STANDARD. Used for sign foundations, commercial flatwork, and structural footings requiring good durability." },
  { id: "4500_ae", name: "4500 AIR ENTRAINED (AE)", price: supplierPriceNumber(invItem?.mix_4500_price), field: "mix_4500_price", desc: "Used for heavy-duty commercial slabs and heavy traffic areas." },
  { id: "5000_ae", name: "5000 AIR ENTRAINED (AE)", price: supplierPriceNumber(invItem?.mix_5000_price), field: "mix_5000_price", desc: "High-strength mix for heavy structural columns, pillars, and extreme load conditions." },
  { id: "fast_set", name: "FAST SET", price: supplierPriceNumber(invItem?.mix_fast_set_price), field: "mix_fast_set_price", desc: "Quick-curing concrete used when rapid strength gain is needed to minimize downtime." }
];
var getConcreteAdmixtures = (invItem) => [
  { id: "calcium_chloride", name: "Calcium Chloride", price: supplierPriceNumber(invItem?.admix_calcium_chloride_price), field: "admix_calcium_chloride_price", desc: "Speeds up how fast the concrete dries. SELECT THIS when pouring in cold weather so it doesn't freeze before it sets. WARNING: Do NOT select this if using Rebar, as it causes rust!" },
  { id: "set_retarding", name: "Set-Retarding Admix (Type D)", price: supplierPriceNumber(invItem?.admix_set_retarding_price), field: "admix_set_retarding_price", desc: "Slows down how fast the concrete dries. SELECT THIS when pouring in very hot weather, or if the concrete truck has a very long drive to the site." },
  { id: "water_reducing", name: "Water-Reducing Admix (Type A)", price: supplierPriceNumber(invItem?.admix_water_reducing_price), field: "admix_water_reducing_price", desc: "Makes the concrete easier to pour without weakening it. SELECT THIS if you need the concrete to flow better into tight forms or around lots of rebar." },
  { id: "fibers", name: "Fibers", price: supplierPriceNumber(invItem?.admix_fibers_price), field: "admix_fibers_price", desc: "Tiny fibers mixed into the concrete to prevent small cracks. SELECT THIS for large flat slabs (like monument sign pads) or if the foundation will take physical abuse." },
  { id: "winter_service", name: "Winter Service", price: supplierPriceNumber(invItem?.admix_winter_service_price), field: "admix_winter_service_price", desc: "A fee the plant charges to use hot water so the mix doesn't freeze. SELECT THIS always during winter months when temperatures are freezing." }
];
var getSmallLoadFee = (yards, invItem) => {
  if (yards >= 5) return 0;
  if (yards >= 4.5) return supplierPriceNumber(invItem?.small_load_fee_4_5_4_75);
  if (yards >= 4) return supplierPriceNumber(invItem?.small_load_fee_4_4_25);
  if (yards >= 3) return supplierPriceNumber(invItem?.small_load_fee_3_3_75);
  if (yards >= 2) return supplierPriceNumber(invItem?.small_load_fee_2_2_75);
  if (yards >= 1) return supplierPriceNumber(invItem?.small_load_fee_1_1_75);
  return supplierPriceNumber(invItem?.small_load_fee_1_1_75);
};
var getFuelSurcharge = (invItem) => {
  return supplierPriceNumber(invItem?.fuel_surcharge);
};
var normalizeConcreteSupplier = (row) => ({
  id: row.id,
  material_name: row.service_name,
  material_description: row.description || "",
  material_type: "concrete_service",
  supplier: row.vendor_name || row.service_name,
  cost_per_unit: row.default_rate || 0,
  unit: "cy",
  minimum_order_yards: row.minimum_order_yards || 0,
  below_minimum_cost_per_cy: row.below_minimum_cost_per_cy || 0,
  minimum_cost: row.minimum_charge || 0,
  mix_3500_price: row.mix_3500_price ?? null,
  mix_4000_price: row.mix_4000_price ?? null,
  mix_4500_price: row.mix_4500_price ?? null,
  mix_5000_price: row.mix_5000_price ?? null,
  mix_fast_set_price: row.mix_fast_set_price ?? null,
  admix_calcium_chloride_price: row.admix_calcium_chloride_price ?? null,
  admix_set_retarding_price: row.admix_set_retarding_price ?? null,
  admix_water_reducing_price: row.admix_water_reducing_price ?? null,
  admix_fibers_price: row.admix_fibers_price ?? null,
  admix_winter_service_price: row.admix_winter_service_price ?? null,
  small_load_fee_1_1_75: row.small_load_fee_1_1_75 ?? null,
  small_load_fee_2_2_75: row.small_load_fee_2_2_75 ?? null,
  small_load_fee_3_3_75: row.small_load_fee_3_3_75 ?? null,
  small_load_fee_4_4_25: row.small_load_fee_4_4_25 ?? null,
  small_load_fee_4_5_4_75: row.small_load_fee_4_5_4_75 ?? null,
  fuel_surcharge: row.fuel_surcharge ?? null,
  show_in_foundation: row.show_in_foundation !== false,
  _source: "labor_services"
});
var calcItemCost = (item, inventory = [], settings = {}) => {
  const getSetting = (key, def) => parseFloat(settings[key] === 0 ? 0 : settings[key] || def);
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
      if (!mix || supplierPriceNumber(mix.price) === null) {
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
        } else if (supplierPriceNumber(admix.price) === null) {
          add(
            admix.field || "admix_price",
            "supplier_price_unavailable",
            `record a finite, nonnegative ${admix.name} price on the concrete supplier before repricing`
          );
        }
      }
      if (supplierPriceNumber(firstConcreteInv.fuel_surcharge) === null) {
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

// frozen:/app/src/components/estimator/foundation/wallCalculator.js
var wallSettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
function calcWallCosts({ wall, wallShape, wallMaterial, internalMaterial, includeInternalWall, wallHeightInches, internalWallHeightInches, mortarGapInches, internalMortarGapInches, settings }) {
  if (!wallShape || !wallMaterial || !wallShape.segments) return null;
  const isConcrete = wallMaterial.wall_material_subtype === "concrete";
  const unitL = wallMaterial.wall_unit_length_inches || 8;
  const unitW = wallMaterial.wall_unit_width_inches || 4;
  const unitH = wallMaterial.wall_unit_height_inches || 2.25;
  const mortar = isConcrete ? 0 : mortarGapInches;
  const courseH = unitH + mortar;
  const numCourses = wallHeightInches / courseH;
  const brickPitch = unitL + (isConcrete ? 0 : mortar);
  const totalLinearInches = wallShape.segments.reduce((s, seg) => s + seg.length, 0);
  const numCoursesRounded = Math.ceil(numCourses);
  let totalBricks = 0;
  wallShape.segments.forEach((seg) => {
    const bricksThisCourse = Math.ceil(seg.length / brickPitch);
    totalBricks += bricksThisCourse * numCoursesRounded;
  });
  const finalBricks = wallMaterial.custom_outer_material_qty !== void 0 && wallMaterial.custom_outer_material_qty !== null ? wallMaterial.custom_outer_material_qty : totalBricks;
  const materialCost = finalBricks * (wallMaterial.custom_cost_per_unit !== void 0 && wallMaterial.custom_cost_per_unit !== null ? wallMaterial.custom_cost_per_unit : wallMaterial.cost_per_unit || 0);
  const surfaceAreaSqFtSingleSide = totalLinearInches * wallHeightInches / 144;
  let mortarCost = 0;
  let mortarBags = 0;
  if (!isConcrete) {
    const surfaceAreaSqFtMortar = surfaceAreaSqFtSingleSide * 2;
    mortarBags = Math.ceil(surfaceAreaSqFtMortar / 30);
    const finalMortarBags = wallMaterial.custom_outer_mortar_qty !== void 0 && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags;
    const mortarCostPerBag = parseFloat(wallSettingValue(settings?.wall_mortar_cost_per_bag, 10));
    const finalMortarRate = wallMaterial.custom_outer_mortar_rate !== void 0 && wallMaterial.custom_outer_mortar_rate !== null ? wallMaterial.custom_outer_mortar_rate : mortarCostPerBag;
    mortarCost = finalMortarBags * finalMortarRate;
  }
  const laborRatePerSqFt = wallMaterial.custom_outer_labor_rate !== void 0 && wallMaterial.custom_outer_labor_rate !== null ? wallMaterial.custom_outer_labor_rate : parseFloat(wallSettingValue(settings?.wall_labor_rate, 45));
  const minCharge = parseFloat(wallSettingValue(settings?.wall_minimum_charge, 150));
  let laborCost = surfaceAreaSqFtSingleSide * laborRatePerSqFt;
  if (laborCost < minCharge) {
    laborCost = minCharge;
  }
  const laborHours = finalBricks / parseFloat(wallSettingValue(settings?.wall_labor_bricks_per_hour, 50));
  let internalTotalBricks = 0;
  let internalMaterialCost = 0;
  let internalMortarCost = 0;
  let internalLaborCost = 0;
  let internalLaborHours = 0;
  let internalTotalLinearInches = 0;
  if (includeInternalWall && internalMaterial) {
    const intIsConcrete = internalMaterial.wall_material_subtype === "concrete";
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
      const bricksThisCourse = Math.ceil(innerSegLength / intBrickPitch);
      internalTotalBricks += bricksThisCourse * intNumCourses;
    });
    const finalInternalBricks = wall.custom_internal_material_qty !== void 0 && wall.custom_internal_material_qty !== null ? wall.custom_internal_material_qty : internalTotalBricks;
    internalMaterialCost = finalInternalBricks * (wall.custom_internal_material_cost_per_unit !== void 0 && wall.custom_internal_material_cost_per_unit !== null ? wall.custom_internal_material_cost_per_unit : internalMaterial.cost_per_unit || 0);
    const intSurfaceAreaSqFtSingleSide = internalTotalLinearInches * internalWallHeightInches / 144;
    let internalMortarBags = 0;
    if (!intIsConcrete) {
      const intSurfaceAreaSqFtMortar = intSurfaceAreaSqFtSingleSide * 2;
      internalMortarBags = Math.ceil(intSurfaceAreaSqFtMortar / 30);
      const finalInternalMortarBags = wall.custom_internal_mortar_qty !== void 0 && wall.custom_internal_mortar_qty !== null ? wall.custom_internal_mortar_qty : internalMortarBags;
      const internalMortarCostPerBag = parseFloat(wallSettingValue(settings?.wall_mortar_cost_per_bag, 10));
      const finalInternalMortarRate = wall.custom_internal_mortar_rate !== void 0 && wall.custom_internal_mortar_rate !== null ? wall.custom_internal_mortar_rate : internalMortarCostPerBag;
      internalMortarCost = finalInternalMortarBags * finalInternalMortarRate;
    }
    const internalLaborRatePerSqFt = wall.custom_internal_labor_rate !== void 0 && wall.custom_internal_labor_rate !== null ? wall.custom_internal_labor_rate : parseFloat(wallSettingValue(settings?.wall_labor_rate, 45));
    internalLaborCost = intSurfaceAreaSqFtSingleSide * internalLaborRatePerSqFt;
    internalLaborHours = finalInternalBricks / parseFloat(wallSettingValue(settings?.wall_labor_bricks_per_hour, 50));
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
    internalMortarBags: includeInternalWall && internalMaterial && internalMaterial.wall_material_subtype !== "concrete" ? Math.ceil(internalTotalLinearInches * internalWallHeightInches / 144 * 2 / 30) : 0,
    internalMortarCost,
    internalLaborCost,
    internalLaborHours
  };
}
var assignedId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
function wallPriceNumber(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function wallDimensionNumber(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
var wallSettingNumber = (value, fallback) => wallPriceNumber(wallSettingValue(value, fallback));
var wallPositiveSettingNumber = (value, fallback) => wallDimensionNumber(wallSettingValue(value, fallback));
var WALL_MORTAR_GAP_DEFAULT = 0.375;
var wallMortarGapNumber = (value) => value === void 0 || value === null || value === "" ? WALL_MORTAR_GAP_DEFAULT : wallPriceNumber(value);
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
    const lengths = shape.segments.map((segment) => wallRecord(segment) ? wallDimensionNumber(segment.length) : null);
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
function foundationWallRectangle(length, width) {
  const l = wallDimensionNumber(length), w = wallDimensionNumber(width);
  if (l === null || w === null) return null;
  const points = [{ x: 0, z: 0 }, { x: l, z: 0 }, { x: l, z: w }, { x: 0, z: w }];
  return foundationWallOutlineBasis({ points, closed: true, segments: foundationWallSegments(points, true) }).shape;
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
  const heightInches = wallDimensionNumber(wall?.heightInches);
  const internalWallHeightInches = wall?.includeInternalWall ? wallDimensionNumber(wall.internalWallHeightInches ?? wall.heightInches) : null;
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
    const override = kind === "wall" ? material.custom_cost_per_unit : wall.custom_internal_material_cost_per_unit;
    const price = override !== void 0 && override !== null ? override : material.cost_per_unit;
    if (wallPriceNumber(price) === null) {
      add2("wall_material_price_unavailable", "record a finite, nonnegative material unit price before repricing");
    }
    const normalizedMaterial = { ...material };
    for (const [key, label2] of [
      ["wall_unit_length_inches", "unit length"],
      ["wall_unit_width_inches", "unit width"],
      ["wall_unit_height_inches", "unit height"]
    ]) {
      const dimension = wallDimensionNumber(material[key]);
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
      const value = wallPriceNumber(raw);
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
  const settingCheck = (key, label, positive) => {
    const value = positive ? wallPositiveSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]) : wallSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]);
    if (value === null) {
      add(
        "wall",
        key,
        wall?.materialId,
        "wall_setting_unavailable",
        `record a finite, ${positive ? "positive" : "nonnegative"} ${label} in Estimator Settings before repricing`
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
    settingCheck("wall_labor_bricks_per_hour", "wall production rate", true);
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
function foundationWallBomRows(walls = [], inventory = [], wallPricing2) {
  const out = [];
  const known3 = (value) => typeof value === "number" && Number.isFinite(value);
  const quantity = (value) => known3(value) ? `${value.toLocaleString(void 0, { maximumFractionDigits: 2 })} units` : "Not saved";
  const amount = (value) => known3(value) ? value : "Not saved";
  const used = (qty2, cost) => known3(qty2) && qty2 > 0 || known3(cost) && cost !== 0;
  walls.forEach((wall, index) => {
    const costs = wall.calculatedCosts || {};
    const label = wall.name || `Wall ${index + 1}`;
    const saved = Array.isArray(wallPricing2) && wallPricing2[index] ? wallPricing2[index].available === false : foundationWallPricingIssues(wall, inventory, index).length > 0;
    const nameOf = (id) => inventory.find((row) => row.id === id)?.material_name || "Material";
    const add = (material, qty2, cost) => out.push({ material, quantity: qty2, cost: amount(cost), saved });
    if (saved || used(costs.totalBricks, costs.materialCost)) {
      add(
        saved ? `${label} \u2014 saved outer material` : `${label} \u2014 ${nameOf(wall.materialId)}`,
        quantity(costs.totalBricks),
        costs.materialCost
      );
    }
    if (known3(costs.mortarCost) && costs.mortarCost !== 0) {
      add(`${label} \u2014 ${saved ? "saved mortar" : "mortar"}`, "\u2014", costs.mortarCost);
    }
    const internalUsed = used(costs.internalTotalBricks, costs.internalMaterialCost);
    if (saved && wall.includeInternalWall || internalUsed) {
      add(
        saved ? `${label} \u2014 saved internal material` : `${label} \u2014 ${nameOf(wall.internalMaterialId)} (internal)`,
        quantity(costs.internalTotalBricks),
        costs.internalMaterialCost
      );
    }
    if (known3(costs.internalMortarCost) && costs.internalMortarCost !== 0) {
      add(`${label} \u2014 ${saved ? "saved internal mortar" : "internal mortar"}`, "\u2014", costs.internalMortarCost);
    }
  });
  return out;
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
          internalLaborHours: costs.internalLaborHours ?? 0
        }
      };
    }),
    wallPricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues }))
  };
}

// frozen:/app/src/components/estimator/foundation/poleCalculator.js
var assignedId2 = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var poleSettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
var setting = (settings, key, def) => parseFloat(poleSettingValue(settings?.[key], def));
var polePriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var poleDimensionNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
var poleOffsetNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var poleSettingNumber = (value, fallback) => polePriceNumber(poleSettingValue(value, fallback));
var polePositiveSettingNumber = (value, fallback) => poleDimensionNumber(poleSettingValue(value, fallback));
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
function polePricing(pole, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const id = pole?.pole_id;
  const add = (field, code, message) => issues.push({
    kind: "pole",
    index,
    componentId: pole?.component_id ?? pole?.id ?? null,
    field,
    inventoryId: assignedId2(id) ? id : null,
    code,
    message: `Pole ${index + 1}: ${message}.`
  });
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
      inv = matches[0];
    }
  }
  const heightInches = poleDimensionNumber(pole?.height_inches);
  if (heightInches === null) {
    add(
      "height_inches",
      "pole_height_unavailable",
      "record a positive, finite height above grade in inches before repricing"
    );
  }
  const depthInches = poleOffsetNumber(pole?.y_offset_inches);
  if (depthInches === null) {
    add(
      "y_offset_inches",
      "pole_depth_unavailable",
      "record a finite, nonnegative depth in ground in inches before repricing"
    );
  }
  let rate = null;
  let stockLengthInches = null;
  let widthInches = null;
  const paint = { costPerLf: null, laborPerLf: null, sizeMultiplier: null };
  if (inv) {
    const override = pole?.custom_cost_per_unit;
    const hasOverride = override !== void 0 && override !== null;
    const stockMode = inv.pole_pricing_mode === "stock_price";
    rate = polePriceNumber(hasOverride ? override : stockMode ? inv.pole_stock_price : inv.cost_per_unit);
    if (rate === null) {
      add(
        hasOverride ? "custom_cost_per_unit" : stockMode ? "pole_stock_price" : "cost_per_unit",
        "pole_price_unavailable",
        "record a finite, nonnegative pole price before repricing"
      );
    }
    if (stockMode) {
      const stockLengthFt = polePositiveSettingNumber(inv.pole_stock_length_ft, 20);
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
    if (pole?.include_pole_painting) {
      widthInches = polePositiveSettingNumber(inv.pole_width_inches, 6);
      if (widthInches === null) {
        add(
          "pole_width_inches",
          "pole_width_unavailable",
          "the selected catalog pole width must be a recorded finite positive number"
        );
      }
      const paintSetting = (key, label) => {
        const value = poleSettingNumber(settings?.[key], POLE_PAINT_SETTING_DEFAULTS[key]);
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
  return { issues, inv, heightInches, depthInches, rate, stockLengthInches, widthInches, paint };
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
      for (const field of ["pole_name", "pole_cost", "pole_painting_cost", "total_cost"]) {
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
      const { inv, heightInches, depthInches, rate, stockLengthInches, widthInches, paint } = check;
      const totalPoleInches = heightInches + depthInches;
      let poleCost;
      if (inv.pole_pricing_mode === "stock_price") {
        const pieces = Math.ceil(totalPoleInches / stockLengthInches);
        poleCost = pieces * rate;
      } else {
        poleCost = totalPoleInches / 12 * rate;
      }
      const paintingCost = pole?.include_pole_painting ? calcPolePaintingCost(
        { include_pole_painting: true, height_inches: heightInches, y_offset_inches: depthInches },
        { ...inv, pole_width_inches: widthInches },
        {
          pole_paint_cost_per_lf: paint.costPerLf,
          pole_paint_labor_per_lf: paint.laborPerLf,
          [polePaintMultiplierKey(widthInches)]: paint.sizeMultiplier
        }
      ) : 0;
      return {
        ...pole,
        pole_name: inv.material_name || "",
        pole_cost: poleCost,
        pole_painting_cost: paintingCost,
        total_cost: poleCost + paintingCost
      };
    }),
    polePricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues }))
  };
}

// frozen:/app/src/components/estimator/foundation/wallCapCalculator.js
var wallCapInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
function wallCapCutLengthValue(cap) {
  if (!cap || typeof cap !== "object" || Array.isArray(cap)) return void 0;
  return Object.prototype.hasOwnProperty.call(cap, "length_inches") ? cap.length_inches : cap.cut_length_inches;
}
var known = (value) => typeof value === "number" && Number.isFinite(value);
var assigned = (id) => typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
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
      inventoryId: assigned(id) ? id : null,
      code,
      message: `Wall cap ${index + 1}: ${message}`
    });
    const matches = assigned(id) ? inventory.filter((row) => row?.id === id) : [];
    if (matches.length !== 1) {
      issue(
        "cap_inventory_id",
        !assigned(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
        !assigned(id) ? "select a catalog material." : matches.length > 1 ? "the selected catalog ID is ambiguous; refresh the catalog." : "selected catalog material is unavailable."
      );
      return held(cap);
    }
    const inv = matches[0];
    if (inv.material_type !== "wall_cap") {
      issue("cap_inventory_id", "catalog_item_type_mismatch", "the selected catalog material is not a wall cap.");
      return held(cap);
    }
    const firstIssue = issues.length;
    const rate = wallCapInputNumber(inv.cap_stock_price);
    if (rate === null || rate < 0) {
      issue(
        "cap_stock_price",
        "wall_cap_stock_price_unavailable",
        "record a finite nonnegative full-stock price; a missing price is not zero. Saved amounts are retained."
      );
    }
    const stockLength = wallCapInputNumber(inv.cap_stock_length_inches);
    const cutLength = wallCapInputNumber(wallCapCutLengthValue(cap));
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
    if (!assigned(cap.cap_inventory_id)) continue;
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

// frozen:/app/src/components/estimator/foundation/foundationEquipmentBindings.js
var num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var assigned2 = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
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
    if (assigned2(id) && record) return;
    const hasSelection = assigned2(id);
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
function setFoundationEquipmentCount(entry, { kind, id, quantity }) {
  if (kind !== "attachment" && kind !== "sub_attachment") throw new Error("Unknown equipment selection kind.");
  if (!assigned2(id)) throw new Error("Select a catalog item before changing its quantity.");
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Attachment quantities must be nonnegative whole numbers.");
  }
  const source = entry || {};
  if (kind === "attachment" && source.attachments?.length) {
    const matches = source.attachments.filter((row) => (row.id || row.inventory_id) === id);
    if (matches.length > 1 && quantity !== 0) {
      throw new Error("Duplicate attachment references require review. Remove the duplicates and add one selection.");
    }
    let attachments = source.attachments.filter((row) => (row.id || row.inventory_id) !== id);
    if (quantity > 0) {
      if (matches.length) {
        attachments = source.attachments.map((row) => (row.id || row.inventory_id) === id ? { ...row, qty: quantity } : row);
      } else {
        attachments = [...attachments, { id, qty: quantity }];
      }
    }
    return { ...source, attachments, attachment_counts: {}, attachment_ids: [] };
  }
  const field = kind === "sub_attachment" ? "sub_attachment_counts" : "attachment_counts";
  const raw = source[field];
  if (raw && (typeof raw !== "object" || Array.isArray(raw))) {
    throw new Error("This legacy quantity map needs review before editing.");
  }
  const counts = new Map(Object.entries(raw || {}));
  if (kind === "attachment" && !raw) {
    for (const legacyId of source.attachment_ids || []) {
      if (typeof legacyId !== "string") throw new Error("Legacy numeric attachment IDs need reassignment before editing.");
      counts.set(legacyId, (counts.get(legacyId) || 0) + 1);
    }
  }
  if (typeof id !== "string") throw new Error("Legacy numeric attachment IDs need reassignment before editing.");
  if (quantity === 0) counts.delete(id);
  else counts.set(id, quantity);
  const next = { ...source, [field]: Object.fromEntries(counts) };
  return kind === "attachment" ? { ...next, attachments: [], attachment_ids: [] } : next;
}

// frozen:/app/src/components/estimator/foundation/foundationCatalogIntegrity.js
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

// frozen:/app/src/components/estimator/foundation/landscapeMaterials.js
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
var landscapePriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var landscapeCellSizeNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
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
  if (landscapeCellSizeNumber(landscape.cell_size_inches) === null) {
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
    } else if (landscapePriceNumber(mat.cost_per_sqft) === null) {
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
  const cellSize = landscapeCellSizeNumber(landscape?.cell_size_inches);
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
    const rate = mat ? landscapePriceNumber(mat.cost_per_sqft) : null;
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

// frozen:/app/src/components/estimator/foundation/foundationInputValidation.js
var inputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var positiveWholeNumber = (value) => {
  const number = inputNumber(value);
  const whole = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole && Number.isSafeInteger(number) && number > 0;
};
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
  const quantity = inputNumber(count);
  if (!positiveWholeNumber(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot" ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]] : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = inputNumber(record[field]);
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
  if (record.include_rebar) {
    const optional = (field, code, label, valid) => {
      const value = record[field];
      if (value !== void 0 && value !== null && !valid(value)) add(field, code, label);
    };
    const positive = (value) => {
      const number = inputNumber(value);
      return number !== null && number > 0;
    };
    const whole = (field, label) => optional(
      field,
      "foundation_rebar_count_invalid",
      `${label} must be a positive whole number within the supported range.`,
      positiveWholeNumber
    );
    if (type === "spread_foot") {
      for (const [field, label] of [["rebar_spacing_length", "length"], ["rebar_spacing_width", "width"]]) {
        optional(
          field,
          "foundation_rebar_spacing_invalid",
          `rebar spacing ${label} (inches) must be a finite positive number.`,
          positive
        );
      }
      whole("rebar_layers", "Rebar mat count");
    } else if (type === "pillar") {
      whole("pillar_rebar_layers", "Hoop count");
      whole("pillar_vertical_rebar_count", "Longitudinal bar count");
      optional(
        "pillar_rebar_hoop_diameter",
        "foundation_rebar_diameter_invalid",
        "hoop diameter (inches) must be finite, positive and no greater than the foundation diameter.",
        (value) => positive(value) && (dimensions.diameter === null || dimensions.diameter <= 0 || inputNumber(value) <= dimensions.diameter)
      );
    }
  }
  for (const [field, label] of ITEM_CUSTOM_OVERRIDE_FIELDS) {
    const raw = record[field];
    if (raw === void 0 || raw === null) continue;
    const number = inputNumber(raw);
    if (number === null || number < 0) {
      add(
        field,
        "foundation_override_invalid",
        `${label} must be a finite, nonnegative number \u2014 clear it or record a valid value.`
      );
    }
  }
  return issues;
}
var cabinetQuantityNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
var cabinetPriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
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
  const qty2 = record.quantity;
  if (qty2 !== void 0 && qty2 !== null && qty2 !== "" && cabinetQuantityNumber(qty2) === null) {
    add(
      "quantity",
      "signage_cabinet_quantity_unavailable",
      "record a finite, positive quantity \u2014 a zero or malformed quantity cannot be repriced"
    );
  }
  if (cabinetPriceNumber(record.unit_cost) === null) {
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

// frozen:/app/src/components/estimator/foundation/foundationCalc.js
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
function calcItem(item, project, inventory, settings = {}, savedItem = item) {
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
var equipmentPriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var equipmentPositiveNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
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
    duration = equipmentPositiveNumber(entry.custom_qty);
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
    duration = entry?.rental_duration === void 0 || entry?.rental_duration === null || entry?.rental_duration === "" ? 1 : equipmentPositiveNumber(entry.rental_duration);
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
    rate = equipmentPriceNumber(entry.custom_rate);
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
    rate = equipmentPriceNumber(eq[periodField]);
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
      deliveryCharge = equipmentPriceNumber(entry.custom_delivery_charge);
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
      deliveryCharge = equipmentPriceNumber(eq.pickup_delivery_cost);
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
    const parsedQuantity = equipmentPositiveNumber(quantity);
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
    const rowRate = periodField === null ? null : equipmentPriceNumber(row.inventory[periodField]);
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
function calcProject(project, inventory, settings = {}, options = {}) {
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
  const items = sourceItems.map((item) => {
    const savedItem = !explicitSnapshot ? item : item.component_id && currentIds.get(item.component_id) === 1 ? savedItems.get(item.component_id) || null : null;
    return { ...item, ...calcItem(item, project, inventory, settings, savedItem) };
  });
  const equipment = equipmentCalc.map((row) => row.pricedEntry);
  const deliveryCheck = itemPricing.some((item) => !item.available) ? null : calcConcreteDelivery(
    { ...project, settings },
    (project.items || []).map((i) => ({
      ...i,
      excavation_method: i.excavation_method || project.excavation_method
    })),
    inventory
  );
  const delivery = deliveryCheck === null || deliveryCheck.pricingUnavailable === true ? savedConcreteDelivery(savedProject) : deliveryCheck;
  if (deliveryCheck?.issues?.length) catalogIssues.push(...deliveryCheck.issues);
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
    inputIssues
  };
}
var money = (n) => `$${num2(n).toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// frozen:/app/src/components/estimator/foundation/FoundationItemCard.jsx
import { Fragment, jsx as jsx3, jsxs } from "react/jsx-runtime";
var amt = (v) => hasFoundationCostSnapshot(v) ? money(v) : "Not saved";
var num22 = (v) => Number.isFinite(v) ? v.toFixed(2) : "Not saved";
var Field = ({ label, ...props }) => /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
  label,
  /* @__PURE__ */ jsx3(Input, { ...props })
] });
var Check = ({ label, checked, onChange }) => /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-gray-700", children: [
  /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: !!checked, onChange: (e) => onChange(e.target.checked) }),
  label
] });
var Picker = ({ label, value, onChange, options, placeholder }) => {
  const missing = value && !options.some((o) => o.id === value);
  return /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
    label,
    /* @__PURE__ */ jsxs(
      "select",
      {
        value: value || "",
        onChange: (e) => onChange(e.target.value),
        className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm",
        children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: placeholder }),
          missing && /* @__PURE__ */ jsxs("option", { value, disabled: true, children: [
            "Catalog item unavailable (",
            value,
            ")"
          ] }),
          options.map((o) => /* @__PURE__ */ jsx3("option", { value: o.id, children: o.material_name }, o.id))
        ]
      }
    )
  ] });
};
function FoundationItemCard({ item, index, catalog, onChange, onRemove, onDuplicate, pricing }) {
  const set = (patch) => onChange(index, patch);
  const numSet = (key) => (e) => set({ [key]: parseFloat(e.target.value) || 0 });
  const nullSet = (key) => (e) => set({
    [key]: e.target.value === "" ? null : Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value
  });
  const isPillar = item.foundation_type === "pillar";
  const unavailable = pricing?.available === false;
  const concreteRow = (catalog.concrete || []).find((c) => c.id === item.selected_concrete_id);
  const overrideLabel = !concreteRow ? "Concrete cost override (unknown unit)" : concreteRow.material_type === "bagged_concrete" ? "Concrete $/bag override" : "Concrete $/CY override";
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-sm border border-gray-200 border-l-4 border-l-amber-500 p-4", children: [
    unavailable && /* @__PURE__ */ jsxs("div", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1", id: `foundation-${index}-pricing`, children: [
      /* @__PURE__ */ jsx3("p", { className: "text-[11px] font-semibold text-amber-800", children: "Saved amounts (not current pricing)" }),
      /* @__PURE__ */ jsx3("p", { className: "text-[10px] text-amber-700", children: "Saved quantities may not reflect the current design." }),
      (pricing.issues || []).map((i, k) => /* @__PURE__ */ jsx3("p", { className: "text-[10px] text-amber-700", children: i.message }, k))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3 mb-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx3(Box, { className: "w-4 h-4 text-amber-500", "aria-hidden": "true" }),
        /* @__PURE__ */ jsxs("span", { className: "text-[12px] font-bold text-gray-700", children: [
          "Foundation #",
          index + 1
        ] }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: item.foundation_type || "",
            onChange: (e) => set({ foundation_type: e.target.value }),
            className: "h-8 rounded-md border border-input bg-transparent px-2 text-sm font-semibold",
            children: [
              item.foundation_type !== "spread_foot" && item.foundation_type !== "pillar" && /* @__PURE__ */ jsx3("option", { value: item.foundation_type || "", disabled: true, children: item.foundation_type ? `Unsupported type: ${item.foundation_type}` : "Choose foundation type" }),
              /* @__PURE__ */ jsx3("option", { value: "spread_foot", children: "Spread Footing" }),
              /* @__PURE__ */ jsx3("option", { value: "pillar", children: "Pillar / Caisson" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
        /* @__PURE__ */ jsx3("div", { className: "font-bold text-gray-900", children: amt(item.item_total_cost) }),
        /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-gray-400", children: [
          num22(item.concrete_volume_cy),
          " CY concrete"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        onDuplicate && /* @__PURE__ */ jsx3("button", { type: "button", onClick: () => onDuplicate(index), className: "text-gray-400 hover:text-blue-600", title: "Duplicate", children: /* @__PURE__ */ jsx3(Copy, { className: "w-4 h-4", "aria-hidden": "true" }) }),
        /* @__PURE__ */ jsx3(
          "button",
          {
            type: "button",
            onClick: () => {
              if (!window.confirm(`Remove Foundation #${index + 1}?`)) return;
              onRemove(index);
            },
            className: "text-gray-400 hover:text-red-600",
            title: "Delete",
            children: /* @__PURE__ */ jsx3(Trash2, { className: "w-4 h-4", "aria-hidden": "true" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx3(
      Field,
      {
        label: "Description",
        value: item.description || "",
        onChange: (e) => set({ description: e.target.value })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3", children: [
      /* @__PURE__ */ jsx3(Field, { label: "Quantity", type: "number", value: item.quantity ?? 1, onChange: numSet("quantity") }),
      isPillar ? /* @__PURE__ */ jsx3(Field, { label: "Diameter (in)", type: "number", value: item.diameter ?? 0, onChange: numSet("diameter") }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx3(Field, { label: "Length (in)", type: "number", value: item.length_inches ?? 0, onChange: numSet("length_inches") }),
        /* @__PURE__ */ jsx3(Field, { label: "Width (in)", type: "number", value: item.width_inches ?? 0, onChange: numSet("width_inches") })
      ] }),
      /* @__PURE__ */ jsx3(Field, { label: "Depth (in)", type: "number", value: item.depth_inches ?? 0, onChange: numSet("depth_inches") }),
      /* @__PURE__ */ jsx3(
        Field,
        {
          label: "Grade offset (in)",
          type: "number",
          value: item.grade_offset_inches ?? 0,
          onChange: numSet("grade_offset_inches")
        }
      ),
      /* @__PURE__ */ jsx3(
        Field,
        {
          label: "Rotation (\xB0)",
          type: "number",
          value: item.rotation_degrees ?? 0,
          onChange: numSet("rotation_degrees")
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3", children: [
      /* @__PURE__ */ jsx3(
        Picker,
        {
          label: "Concrete",
          value: item.selected_concrete_id,
          onChange: (v) => set({ selected_concrete_id: v }),
          options: catalog.concrete,
          placeholder: "Use project rate"
        }
      ),
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
        "Excavation method",
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: item.excavation_method || "",
            onChange: (e) => set({ excavation_method: e.target.value }),
            className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm",
            children: [
              /* @__PURE__ */ jsx3("option", { value: "", children: "Project default" }),
              /* @__PURE__ */ jsx3("option", { value: "hand_dig", children: "Hand dig" }),
              /* @__PURE__ */ jsx3("option", { value: "equipment_excavation", children: "Equipment" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx3(
        Picker,
        {
          label: "Forming material",
          value: item.selected_forming_id,
          onChange: (v) => set({ selected_forming_id: v }),
          options: catalog.forming || [],
          placeholder: "None"
        }
      ),
      /* @__PURE__ */ jsx3(
        Field,
        {
          label: overrideLabel,
          type: "number",
          step: "any",
          min: "0",
          value: item.custom_concrete_cost_per_cy ?? "",
          onChange: nullSet("custom_concrete_cost_per_cy"),
          "aria-label": overrideLabel,
          "aria-invalid": pricing?.issues?.some((i) => i.field === "custom_concrete_cost_per_cy") || void 0,
          "aria-describedby": pricing?.issues?.some((i) => i.field === "custom_concrete_cost_per_cy") ? `foundation-${index}-pricing` : void 0
        }
      ),
      item.custom_concrete_cost_per_cy !== null && item.custom_concrete_cost_per_cy !== void 0 && /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          className: "text-[10px] text-amber-700 hover:underline self-end",
          onClick: () => set({ custom_concrete_cost_per_cy: null }),
          children: "Clear override"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100", children: [
      /* @__PURE__ */ jsx3(Check, { label: "Rebar", checked: item.include_rebar, onChange: (v) => set({ include_rebar: v }) }),
      /* @__PURE__ */ jsx3(Check, { label: "Forming", checked: item.include_forming, onChange: (v) => set({ include_forming: v }) }),
      /* @__PURE__ */ jsx3(Check, { label: "Finishing", checked: item.include_finishing, onChange: (v) => set({ include_finishing: v }) }),
      /* @__PURE__ */ jsx3(
        Check,
        {
          label: "This is a new sign location",
          checked: item.is_new_sign_location,
          onChange: (v) => set({ is_new_sign_location: v })
        }
      )
    ] }),
    item.include_rebar && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3", children: [
      isPillar ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx3(
          Field,
          {
            label: "Rebar size",
            value: item.pillar_rebar_size || "#4",
            onChange: (e) => set({ pillar_rebar_size: e.target.value })
          }
        ),
        /* @__PURE__ */ jsx3(
          Field,
          {
            label: "Hoop dia (in)",
            type: "number",
            value: item.pillar_rebar_hoop_diameter ?? 0,
            onChange: numSet("pillar_rebar_hoop_diameter")
          }
        ),
        /* @__PURE__ */ jsx3(
          Field,
          {
            label: "Hoops (layers)",
            type: "number",
            value: item.pillar_rebar_layers ?? 1,
            onChange: numSet("pillar_rebar_layers")
          }
        ),
        /* @__PURE__ */ jsx3(
          Field,
          {
            label: "Vertical bars",
            type: "number",
            value: item.pillar_vertical_rebar_count ?? 4,
            onChange: numSet("pillar_vertical_rebar_count")
          }
        )
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx3(
          Field,
          {
            label: "Rebar size",
            value: item.rebar_size ?? "",
            onChange: (e) => set({ rebar_size: e.target.value })
          }
        ),
        /* @__PURE__ */ jsx3(
          Field,
          {
            label: "Spacing length (in)",
            type: "number",
            value: item.rebar_spacing_length ?? 12,
            onChange: numSet("rebar_spacing_length")
          }
        ),
        /* @__PURE__ */ jsx3(
          Field,
          {
            label: "Spacing width (in)",
            type: "number",
            value: item.rebar_spacing_width ?? 12,
            onChange: numSet("rebar_spacing_width")
          }
        ),
        /* @__PURE__ */ jsx3(Field, { label: "Layers", type: "number", value: item.rebar_layers ?? 1, onChange: numSet("rebar_layers") })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "col-span-2 sm:col-span-4 text-xs text-gray-500", children: [
        Number.isFinite(item.rebar_feet) ? item.rebar_feet.toFixed(1) : "Not saved",
        " ft \xB7",
        " ",
        Number.isFinite(item.rebar_weight_lbs) ? item.rebar_weight_lbs.toFixed(0) : "Not saved",
        " lbs \xB7",
        " ",
        amt(item.rebar_cost)
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2", children: [
      /* @__PURE__ */ jsx3("div", { className: "text-[10px] font-bold uppercase tracking-wide text-amber-700", children: "Excavation" }),
      /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-amber-900", children: [
        "Volume: ~",
        Number.isFinite(item.excavation_volume_cy) ? item.excavation_volume_cy.toFixed(2) : "Not saved",
        " CY \xB7 Cost: ",
        amt(item.excavation_cost)
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 rounded-sm border border-gray-200 bg-slate-50 p-2", children: [
      /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs", children: [
        ["Rebar", item.rebar_cost],
        ["Forming", item.forming_cost],
        ["Pouring", item.pouring_cost],
        ["Finishing", item.finishing_cost],
        ["Excavation", item.excavation_cost]
      ].map(([label, value]) => /* @__PURE__ */ jsxs("div", { className: "px-1", children: [
        /* @__PURE__ */ jsx3("div", { className: "text-gray-400", children: label }),
        /* @__PURE__ */ jsx3("div", { className: "font-semibold text-gray-800", children: amt(value) })
      ] }, label)) }),
      /* @__PURE__ */ jsx3("div", { className: "mt-2 text-center text-[11px] italic text-amber-700", children: "Concrete material & truck costs are aggregated for the entire project." })
    ] })
  ] });
}

// frozen:/app/src/components/estimator/foundation/FoundationRatesPanel.jsx
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
var RATES = [
  { key: "foundation_main_labor_rate", label: "Main labor $/hr", def: 60 },
  { key: "foundation_pouring_cost_per_cy", label: "Pouring $/CY", def: 15 },
  { key: "foundation_forming_cost_per_sqft", label: "Forming labor $/sqft", def: 2.5 },
  { key: "foundation_finishing_cost_per_sqft", label: "Finishing $/sqft", def: 1.25 },
  { key: "foundation_forming_materials_spread_foot", label: "Form mat. mult. (footing)", def: 0.5 },
  { key: "foundation_forming_materials_pillar", label: "Form mat. mult. (pillar)", def: 0.75 },
  { key: "foundation_rebar_time_cross_section", label: "Rebar hrs / intersection", def: 0.05 },
  { key: "foundation_rebar_time_linear_ft", label: "Rebar hrs / LF", def: 0.02 },
  { key: "foundation_hand_dig_time_per_cy", label: "Hand dig hrs/CY", def: 2 },
  { key: "foundation_equipment_excavation_time_per_cy", label: "Equip. dig hrs/CY", def: 0.5 },
  { key: "wall_labor_rate", label: "Wall labor $/sqft", def: 45 },
  { key: "wall_mortar_cost_per_bag", label: "Mortar $/bag", def: 10 }
];
function FoundationRatesPanel({ settings = {}, project, onChange }) {
  return /* @__PURE__ */ jsxs2("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-baseline justify-between mb-3", children: [
      /* @__PURE__ */ jsx4("h2", { className: "font-semibold text-gray-900", children: "Rates in Use" }),
      /* @__PURE__ */ jsx4("span", { className: "text-xs text-gray-400", children: "Shop-wide \u2014 change in Estimator Settings" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2", children: RATES.map((r) => /* @__PURE__ */ jsxs2("div", { className: "bg-slate-50 rounded-lg px-2 py-1.5", children: [
      /* @__PURE__ */ jsx4("div", { className: "text-[11px] text-gray-400", children: r.label }),
      /* @__PURE__ */ jsx4("div", { className: "text-sm font-semibold text-gray-800", children: settings[r.key] ?? r.def })
    ] }, r.key)) }),
    /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500 block mt-3 max-w-[220px]", children: [
      "Default excavation method",
      /* @__PURE__ */ jsxs2(
        "select",
        {
          value: project.excavation_method || "hand_dig",
          onChange: (e) => onChange({ excavation_method: e.target.value }),
          className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm",
          children: [
            /* @__PURE__ */ jsx4("option", { value: "hand_dig", children: "Hand dig" }),
            /* @__PURE__ */ jsx4("option", { value: "equipment_excavation", children: "Equipment" })
          ]
        }
      )
    ] })
  ] });
}

// frozen:/app/src/components/estimator/foundation/FoundationEquipmentTab.jsx
import { useEffect, useState } from "react";

// s:s://@/components/ui/card
import { jsx as jsx5 } from "react/jsx-runtime";
var Card = (p) => /* @__PURE__ */ jsx5("div", { ...p, children: p.children });
var CardContent = (p) => /* @__PURE__ */ jsx5("div", { ...p, children: p.children });
var CardHeader = (p) => /* @__PURE__ */ jsx5("div", { ...p, children: p.children });
var CardTitle = (p) => /* @__PURE__ */ jsx5("div", { ...p, children: p.children });

// s:s://@/components/ui/button
import { jsx as jsx6 } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx6("button", { type: "button", ...p, children: p.children });

// s:s://@/components/ui/label
import { jsx as jsx7 } from "react/jsx-runtime";
var Label = (p) => /* @__PURE__ */ jsx7("label", { ...p, children: p.children });

// s:s://@/components/ui/select
import { jsx as jsx8 } from "react/jsx-runtime";
var Select = (p) => /* @__PURE__ */ jsx8("div", { children: p.children });
var SelectTrigger = (p) => /* @__PURE__ */ jsx8("div", { children: p.children });
var SelectValue = () => /* @__PURE__ */ jsx8("span", {});
var SelectContent = (p) => /* @__PURE__ */ jsx8("div", { children: p.children });
var SelectItem = (p) => /* @__PURE__ */ jsx8("div", { children: p.children });

// s:s://@/components/ui/badge
import { jsx as jsx9 } from "react/jsx-runtime";
var Badge = (p) => /* @__PURE__ */ jsx9("span", { ...p, children: p.children });

// s:s://@/components/ui/checkbox
import { jsx as jsx10 } from "react/jsx-runtime";
var Checkbox = (p) => /* @__PURE__ */ jsx10("input", { type: "checkbox", checked: p.checked, onChange: (e) => p.onCheckedChange?.(e.target.checked) });

// frozen:/app/src/components/estimator/foundation/FoundationEquipmentTab.jsx
import { jsx as jsx11, jsxs as jsxs3 } from "react/jsx-runtime";
var fin = (v) => Number.isFinite(v);
var intQty = (v) => fin(v) && Number.isInteger(v) && v >= 0;
var equipmentInputValue = (value) => value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;
function OverrideChip({ label, value, onClear, moneyVal = false, invalid = false }) {
  if (value === void 0 || value === null) return null;
  return /* @__PURE__ */ jsxs3("span", { className: `inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${invalid ? "bg-red-100 text-red-800 border border-red-300" : "bg-amber-100 text-amber-800"}`, children: [
    label,
    ": ",
    moneyVal && typeof value === "number" ? money(value) : String(value),
    /* @__PURE__ */ jsx11("button", { type: "button", "aria-label": `Clear ${label}`, onClick: onClear, className: invalid ? "text-red-900 hover:underline" : "text-amber-900 hover:underline", children: "Clear" })
  ] });
}
function EquipmentCard({ entry, detail, index, inventory, onUpdate, onRemove, showMiscAttachments }) {
  const [err, setErr] = useState("");
  useEffect(() => {
    setErr("");
  }, [entry]);
  const eq = detail.equipment;
  const issues = detail.issues || [];
  const broken = issues.length > 0;
  const fieldIssue = (field) => issues.some((i) => i.field === field);
  const describedBy = (field) => fieldIssue(field) ? `equipment-${index}-pricing` : void 0;
  const update = (next) => onUpdate(index, next);
  const setQty = (kind, id, quantity) => {
    try {
      const next = setFoundationEquipmentCount(entry, { kind, id, quantity });
      setErr("");
      update(next);
    } catch (e) {
      setErr(e.message || "Quantity change rejected.");
    }
  };
  const changeQty = (kind, id, raw) => {
    if (raw === "") return;
    const n = Number(raw);
    if (!intQty(n)) {
      setErr("Quantity must be a whole number 0 or greater.");
      return;
    }
    setQty(kind, id, n);
  };
  const eqOptions = inventory.filter((i) => i.material_type === "excavation_equipment");
  const compatibleAtts = inventory.filter((a) => a.material_type === "attachment" && (showMiscAttachments || !a.is_miscellaneous_attachment) && (eq?.compatible_attachment_ids || []).includes(a.id));
  const activeParents = detail.attachmentRows.filter((r) => r.quantity > 0 && r.inventory);
  const compatibleSubs = inventory.filter((s) => s.material_type === "sub_attachment" && (showMiscAttachments || !s.is_miscellaneous_attachment) && activeParents.some((r) => (eq?.compatible_attachment_ids || []).includes(r.id) && (r.inventory.compatible_sub_attachment_ids || []).includes(s.id)));
  const selectedAttIds = new Set(detail.attachmentMode === "normalized" ? detail.attachmentRows.map((r) => r.id) : detail.attachmentRows.filter((r) => r.quantity !== 0).map((r) => r.id));
  const selectedSubIds = new Set(detail.subAttachmentRows.filter((r) => r.quantity !== 0).map((r) => r.id));
  const attView = detail.attachmentMode === "legacy_ids" ? [...new Set(detail.attachmentRows.map((r) => r.id))].map((id) => ({
    id,
    quantity: detail.attachmentRows.filter((r) => r.id === id).length,
    inventory: detail.attachmentRows.find((r) => r.id === id)?.inventory,
    row: detail.attachmentRows.find((r) => r.id === id),
    group: detail.attachmentRows.filter((r) => r.id === id).length > 1
  })) : detail.attachmentRows.map((row) => ({ id: row.id, quantity: row.quantity, inventory: row.inventory, row, group: false }));
  const dupNormIds = detail.attachmentMode === "normalized" ? new Set(detail.attachmentRows.map((r) => r.id).filter((id) => detail.attachmentRows.filter((r) => r.id === id).length > 1)) : /* @__PURE__ */ new Set();
  const periodOptions = ["day", "week", "month"].filter((p) => eq ? fin(eq[`cost_per_${p}`]) : true);
  const savedPeriod = detail.rentalPeriod;
  if (savedPeriod && !periodOptions.includes(savedPeriod)) periodOptions.push(savedPeriod);
  const customQtyActive = entry.custom_qty !== void 0 && entry.custom_qty !== null;
  const cardTotal = !broken ? money(detail.totalCost) : hasFoundationCostSnapshot(detail.totalCost) ? money(detail.totalCost) : "Not saved";
  const lineAmt = (v) => broken ? "Unavailable" : money(v);
  const attRow = (a, key) => {
    const inv = a.inventory;
    const missing = !inv;
    const dupNorm = detail.attachmentMode === "normalized" && dupNormIds.has(a.id);
    const disabledQty = dupNorm;
    return /* @__PURE__ */ jsxs3("div", { className: `flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${a.quantity > 0 ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200"}`, children: [
      /* @__PURE__ */ jsxs3("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx11("div", { className: "font-medium text-slate-800 truncate", children: inv?.material_name || `Catalog item unavailable (${a.id})` }),
        /* @__PURE__ */ jsxs3("div", { className: "text-[10px] text-slate-500", children: [
          missing && /* @__PURE__ */ jsx11("span", { className: "text-amber-700 font-semibold", children: "Unavailable \u2014 review. " }),
          dupNorm && /* @__PURE__ */ jsx11("span", { className: "text-amber-700 font-semibold", children: "Duplicate rows \u2014 quantity editing disabled. " }),
          detail.attachmentMode === "normalized" && a.row.sourceRecord?.qty === 0 && /* @__PURE__ */ jsx11("span", { children: "qty 0 priced as 1. " }),
          a.group && /* @__PURE__ */ jsxs3("span", { children: [
            "legacy duplicate ids \xD7",
            a.quantity,
            " \u2014 catalog per-unit rate only. "
          ] }),
          !missing && inv && !a.group && hasFoundationCostSnapshot(a.row.cost) && /* @__PURE__ */ jsx11("span", { children: money(a.row.cost) }),
          !missing && a.group && fin(inv?.cost_per_day) && /* @__PURE__ */ jsxs3("span", { children: [
            "rate ",
            money(inv.cost_per_day),
            "/day"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx11("div", { className: "flex items-center gap-1 shrink-0", children: dupNorm ? /* @__PURE__ */ jsx11(Button, { size: "sm", variant: "outline", className: "h-6 text-[10px]", onClick: () => setQty("attachment", a.id, 0), children: "Remove all duplicates" }) : /* @__PURE__ */ jsx11(
        "input",
        {
          type: "number",
          min: "0",
          disabled: disabledQty,
          "aria-label": `Attachment qty ${inv?.material_name || a.id}`,
          className: "h-7 w-14 rounded-md border border-input px-1 text-xs disabled:opacity-40",
          value: a.quantity,
          onChange: (e) => changeQty("attachment", a.id, e.target.value)
        }
      ) })
    ] }, key);
  };
  const subRow = (s, key) => {
    const inv = s.inventory;
    const missing = !inv;
    const parentLinked = activeParents.some((r) => (r.inventory.compatible_sub_attachment_ids || []).includes(s.id));
    return /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-2 p-2 rounded-lg border text-xs bg-slate-50 border-slate-200", children: [
      /* @__PURE__ */ jsxs3("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx11("div", { className: "font-medium text-slate-800 truncate", children: inv?.material_name || `Catalog item unavailable (${s.id})` }),
        /* @__PURE__ */ jsxs3("div", { className: "text-[10px] text-slate-500", children: [
          missing && /* @__PURE__ */ jsx11("span", { className: "text-amber-700 font-semibold", children: "Unavailable \u2014 review. " }),
          !missing && !parentLinked && /* @__PURE__ */ jsx11("span", { className: "text-amber-700 font-semibold", children: "No selected parent attachment links this item. " }),
          !missing && hasFoundationCostSnapshot(s.cost) && /* @__PURE__ */ jsx11("span", { children: money(s.cost) })
        ] })
      ] }),
      /* @__PURE__ */ jsx11(
        "input",
        {
          type: "number",
          min: "0",
          "aria-label": `Sub attachment qty ${inv?.material_name || s.id}`,
          className: "h-7 w-14 rounded-md border border-input px-1 text-xs",
          value: s.quantity,
          onChange: (e) => changeQty("sub_attachment", s.id, e.target.value)
        }
      )
    ] }, key);
  };
  return /* @__PURE__ */ jsxs3(Card, { "data-equipment-index": index, className: "border border-indigo-200 shadow-sm overflow-hidden mb-4", children: [
    /* @__PURE__ */ jsx11(CardHeader, { className: "py-3 px-4 bg-indigo-50/60 border-b border-indigo-100", children: /* @__PURE__ */ jsxs3("div", { className: "flex items-start justify-between", children: [
      /* @__PURE__ */ jsxs3("div", { className: "flex flex-col gap-1.5", children: [
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsx11(CardTitle, { className: "text-sm font-semibold", children: eq?.material_name || `Equipment ${index + 1}` }),
          eq?.equipment_type && /* @__PURE__ */ jsx11(Badge, { variant: "outline", className: "text-xs", children: eq.equipment_type }),
          eq?.rental_company && /* @__PURE__ */ jsx11("span", { className: "text-xs text-slate-500", children: eq.rental_company }),
          broken && /* @__PURE__ */ jsx11(Badge, { variant: "secondary", className: "text-xs text-amber-800", children: "Saved amounts (not current pricing)" }),
          /* @__PURE__ */ jsxs3(Badge, { variant: "secondary", className: "text-xs", children: [
            "Total: ",
            cardTotal
          ] })
        ] }),
        eq?.notes && /* @__PURE__ */ jsx11("p", { className: "text-xs text-slate-500 leading-relaxed max-w-3xl", children: eq.notes })
      ] }),
      /* @__PURE__ */ jsx11("div", { className: "flex gap-1", children: /* @__PURE__ */ jsx11(Button, { size: "sm", variant: "ghost", className: "text-red-500", "aria-label": `Remove equipment ${index + 1}`, onClick: onRemove, children: /* @__PURE__ */ jsx11(Trash2, { className: "w-3 h-3", "aria-hidden": "true" }) }) })
    ] }) }),
    /* @__PURE__ */ jsxs3(CardContent, { className: "px-4 pb-4 space-y-4", children: [
      broken && /* @__PURE__ */ jsx11("ul", { role: "status", id: `equipment-${index}-pricing`, className: "list-disc pl-5 text-[11px] text-amber-800", children: issues.map((i, k) => /* @__PURE__ */ jsx11("li", { children: i.message }, k)) }),
      /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx11(Label, { className: "text-xs", children: "Equipment" }),
          /* @__PURE__ */ jsxs3(
            Select,
            {
              value: entry.equipment_id || "",
              onValueChange: (v) => update({ ...entry, equipment_id: v }),
              children: [
                /* @__PURE__ */ jsx11(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx11(SelectValue, { placeholder: "Select equipment\u2026" }) }),
                /* @__PURE__ */ jsxs3(SelectContent, { children: [
                  entry.equipment_id && !eqOptions.some((o) => o.id === entry.equipment_id) && /* @__PURE__ */ jsx11(SelectItem, { value: entry.equipment_id, disabled: true, children: `Catalog equipment unavailable (${entry.equipment_id})` }),
                  eqOptions.map((o) => /* @__PURE__ */ jsx11(SelectItem, { value: o.id, children: o.material_name }, o.id))
                ] })
              ]
            }
          ),
          eq && (eq.compatible_attachment_ids?.length || eq.compatible_sub_attachment_ids?.length) === 0 ? null : null,
          broken && /* @__PURE__ */ jsx11("p", { className: "text-[10px] text-amber-700 mt-0.5", children: "Reassigning preserves selected attachments/overrides \u2014 review compatibility." })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx11(Label, { className: "text-xs", children: "Rental Period" }),
          /* @__PURE__ */ jsxs3(Select, { value: detail.rentalPeriod, onValueChange: (v) => update({ ...entry, rental_period: v }), children: [
            /* @__PURE__ */ jsx11(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx11(SelectValue, {}) }),
            /* @__PURE__ */ jsx11(SelectContent, { children: periodOptions.map((p) => /* @__PURE__ */ jsx11(SelectItem, { value: p, children: p === "day" ? `Daily (${fin(eq?.cost_per_day) ? money(eq.cost_per_day) : "?"}/day)` : p === "week" ? `Weekly (${fin(eq?.cost_per_week) ? money(eq.cost_per_week) : "?"}/wk)` : p === "month" ? `Monthly (${fin(eq?.cost_per_month) ? money(eq.cost_per_month) : "?"}/mo)` : `Review (${savedPeriod})` }, p)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsxs3(Label, { className: "text-xs", children: [
            "Duration ",
            customQtyActive && /* @__PURE__ */ jsx11("span", { className: "text-amber-700", children: "(custom qty override active \u2014 editing duration does not clear it)" })
          ] }),
          /* @__PURE__ */ jsx11(
            "input",
            {
              type: "number",
              "aria-label": "Rental duration",
              min: 1,
              step: "any",
              className: "flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm",
              value: entry.rental_duration ?? "",
              placeholder: "1",
              "aria-invalid": fieldIssue("rental_duration") || void 0,
              "aria-describedby": describedBy("rental_duration"),
              onChange: (e) => update({ ...entry, rental_duration: equipmentInputValue(e.target.value) })
            }
          )
        ] }),
        /* @__PURE__ */ jsx11("div", { className: "flex items-end pb-1", children: /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx11(
            Checkbox,
            {
              checked: entry.include_delivery || false,
              onCheckedChange: (v) => update({ ...entry, include_delivery: v }),
              id: `delivery-${entry._id || index}`
            }
          ),
          /* @__PURE__ */ jsxs3(Label, { htmlFor: `delivery-${entry._id || index}`, className: "text-xs cursor-pointer", children: [
            "Include Delivery ",
            fin(eq?.pickup_delivery_cost) ? `(${money(eq.pickup_delivery_cost)})` : ""
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx11(OverrideChip, { label: "Custom rate", value: entry.custom_rate, moneyVal: true, invalid: fieldIssue("custom_rate"), onClear: () => update({ ...entry, custom_rate: null }) }),
        /* @__PURE__ */ jsx11(OverrideChip, { label: "Custom qty", value: entry.custom_qty, invalid: fieldIssue("custom_qty"), onClear: () => update({ ...entry, custom_qty: null }) }),
        /* @__PURE__ */ jsx11(OverrideChip, { label: `Custom delivery${entry.include_delivery ? "" : " (inactive \u2014 delivery excluded)"}`, value: entry.custom_delivery_charge, moneyVal: true, invalid: fieldIssue("custom_delivery_charge"), onClear: () => update({ ...entry, custom_delivery_charge: null }) })
      ] }),
      err && /* @__PURE__ */ jsx11("p", { role: "alert", className: "text-[11px] text-red-700", children: err }),
      /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-3 gap-2 text-xs text-slate-600", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          "Base: ",
          /* @__PURE__ */ jsx11("span", { className: "font-semibold text-slate-900", children: lineAmt(detail.baseCost) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          "Delivery: ",
          /* @__PURE__ */ jsx11("span", { className: "font-semibold text-slate-900", children: lineAmt(detail.deliveryCost) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          "Total: ",
          /* @__PURE__ */ jsx11("span", { className: "font-semibold text-slate-900", children: cardTotal })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsxs3(Label, { className: "text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block", children: [
          /* @__PURE__ */ jsx11(Wrench, { className: "w-3 h-3 inline mr-1", "aria-hidden": "true" }),
          " Attachments"
        ] }),
        /* @__PURE__ */ jsx11("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2", children: attView.filter((a) => detail.attachmentMode === "normalized" || a.quantity !== 0).map((a, k) => attRow(a, k)) }),
        compatibleAtts.filter((a) => !selectedAttIds.has(a.id)).length > 0 && eq && /* @__PURE__ */ jsx11("div", { className: "mt-2", children: /* @__PURE__ */ jsxs3(Select, { value: "", onValueChange: (v) => v && setQty("attachment", v, 1), children: [
          /* @__PURE__ */ jsx11(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx11(SelectValue, { placeholder: "Add attachment\u2026" }) }),
          /* @__PURE__ */ jsx11(SelectContent, { children: compatibleAtts.filter((a) => !selectedAttIds.has(a.id)).map((a) => /* @__PURE__ */ jsx11(SelectItem, { value: a.id, children: a.material_name }, a.id)) })
        ] }) }),
        attView.some((a) => a.inventory && !(eq?.compatible_attachment_ids || []).includes(a.id)) && /* @__PURE__ */ jsx11("p", { className: "text-[10px] text-amber-700 mt-1", children: "Selected item incompatible with this parent \u2014 review." })
      ] }),
      detail.subAttachmentRows.filter((s) => s.quantity !== 0).length > 0 && /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx11(Label, { className: "text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block", children: "Sub-attachments" }),
        /* @__PURE__ */ jsx11("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2", children: detail.subAttachmentRows.filter((s) => s.quantity !== 0).map((s, k) => subRow(s, k)) })
      ] }),
      compatibleSubs.filter((s) => !selectedSubIds.has(s.id)).length > 0 && eq && /* @__PURE__ */ jsx11("div", { children: /* @__PURE__ */ jsxs3(Select, { value: "", onValueChange: (v) => v && setQty("sub_attachment", v, 1), children: [
        /* @__PURE__ */ jsx11(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx11(SelectValue, { placeholder: "Add sub-attachment\u2026" }) }),
        /* @__PURE__ */ jsx11(SelectContent, { children: compatibleSubs.filter((s) => !selectedSubIds.has(s.id)).map((s) => /* @__PURE__ */ jsx11(SelectItem, { value: s.id, children: s.material_name }, s.id)) })
      ] }) })
    ] })
  ] });
}
function EquipmentTab({ foundationItems = [], inventory = [], selectedEquipmentList = [], onUpdate, markDirty }) {
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const [showMiscAttachments, setShowMiscAttachments] = useState(false);
  const pricingRows = calcEquipmentPricing(selectedEquipmentList, inventory);
  const total = equipmentCostTotal(pricingRows.map((r) => r.pricedEntry));
  const incomplete = pricingRows.some((r) => r.issues.length);
  const sortByOrder = (rows) => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const excavation = sortByOrder(inventory.filter((i) => i.material_type === "excavation_equipment" && !i.is_non_excavation_equipment));
  const nonExcavation = sortByOrder(inventory.filter((i) => i.material_type === "excavation_equipment" && i.is_non_excavation_equipment));
  const types = new Set((foundationItems || []).map((f) => f.foundation_type));
  const hasPillar = types.has("pillar");
  const hasSpread = types.has("spread_foot");
  const filteredExcavation = showAllEquipment || !hasPillar && !hasSpread ? excavation : excavation.filter((e) => hasPillar && e.is_pillar_excavation || hasSpread && e.is_spread_foot_excavation);
  const filteredNonExcavation = nonExcavation;
  const addEquipment = (eqId) => {
    if (!eqId || eqId === "_none") return;
    const eqItem = inventory.find((i) => i.id === eqId);
    const newEntry = {
      _id: `eq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      equipment_id: eqId,
      rental_period: "day",
      rental_duration: 1,
      include_delivery: (eqItem?.pickup_delivery_cost || 0) > 0,
      attachment_counts: {},
      sub_attachment_counts: {}
    };
    onUpdate([...selectedEquipmentList, newEntry]);
    markDirty();
  };
  const removeEquipment = (idx) => {
    const eq = inventory.find((i) => i.id === selectedEquipmentList[idx]?.equipment_id);
    if (!window.confirm(`Remove ${eq?.material_name || "this equipment"}?`)) return;
    onUpdate(selectedEquipmentList.filter((_, i) => i !== idx));
    markDirty();
  };
  const updateEntry = (idx, updated) => {
    const arr = [...selectedEquipmentList];
    arr[idx] = updated;
    onUpdate(arr);
    markDirty();
  };
  const addSelect = (label, rows, placeholder) => /* @__PURE__ */ jsxs3("div", { className: "flex-1 min-w-[260px]", children: [
    /* @__PURE__ */ jsx11(Label, { className: "text-xs font-semibold text-indigo-900 uppercase tracking-wide", children: label }),
    /* @__PURE__ */ jsxs3(Select, { value: "", onValueChange: addEquipment, children: [
      /* @__PURE__ */ jsx11(SelectTrigger, { className: "h-9 mt-1", children: /* @__PURE__ */ jsx11(SelectValue, { placeholder }) }),
      /* @__PURE__ */ jsx11(SelectContent, { children: rows.length === 0 ? /* @__PURE__ */ jsx11(SelectItem, { value: "_none", disabled: true, children: "No equipment available" }) : rows.map((eq) => /* @__PURE__ */ jsx11(SelectItem, { value: eq.id, children: eq.material_name }, eq.id)) })
    ] })
  ] });
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx11(Card, { className: "border-indigo-200 bg-indigo-50/50 shadow-sm mb-4", children: /* @__PURE__ */ jsxs3(CardContent, { className: "py-3 px-4", children: [
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-6 mb-4 pb-4 border-b border-indigo-100", children: [
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx11(Checkbox, { id: "showAllEq", checked: showAllEquipment, onCheckedChange: setShowAllEquipment }),
          /* @__PURE__ */ jsx11(Label, { htmlFor: "showAllEq", className: "text-sm cursor-pointer text-indigo-900 font-medium", children: "Show all equipment" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx11(Checkbox, { id: "showMiscAtt", checked: showMiscAttachments, onCheckedChange: setShowMiscAttachments }),
          /* @__PURE__ */ jsx11(Label, { htmlFor: "showMiscAtt", className: "text-sm cursor-pointer text-indigo-900 font-medium", children: "Show Miscellaneous Attachments" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex flex-wrap items-end gap-4", children: [
        addSelect("Add Excavation Equipment", filteredExcavation, "Select excavation equipment to add\u2026"),
        addSelect("Add Non-Excavation Equipment", filteredNonExcavation, "Select non-excavation equipment to add\u2026")
      ] })
    ] }) }),
    incomplete && /* @__PURE__ */ jsx11("div", { role: "alert", className: "rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 font-semibold", children: "Pricing unavailable: selected materials or rental items need attention. Saved/known amounts only." }),
    selectedEquipmentList.length === 0 && /* @__PURE__ */ jsx11(Card, { className: "border-dashed", children: /* @__PURE__ */ jsxs3(CardContent, { className: "py-10 text-center text-slate-400", children: [
      /* @__PURE__ */ jsx11(Wrench, { className: "w-8 h-8 mx-auto mb-2", "aria-hidden": "true" }),
      /* @__PURE__ */ jsx11("p", { className: "font-medium", children: "No equipment added yet" }),
      /* @__PURE__ */ jsx11("p", { className: "text-sm mt-1", children: "Select equipment from the dropdown above." })
    ] }) }),
    selectedEquipmentList.map((entry, idx) => /* @__PURE__ */ jsx11(
      EquipmentCard,
      {
        entry,
        detail: pricingRows[idx],
        index: idx,
        inventory,
        onUpdate: updateEntry,
        onRemove: () => removeEquipment(idx),
        showMiscAttachments
      },
      entry.component_id || entry._id || idx
    )),
    selectedEquipmentList.length > 0 && /* @__PURE__ */ jsx11(Card, { className: "bg-amber-50 border-amber-200", children: /* @__PURE__ */ jsxs3(CardContent, { className: "py-3 px-4 flex items-center justify-between", children: [
      /* @__PURE__ */ jsx11("span", { className: "font-medium text-amber-800", children: "Total Equipment Cost" }),
      /* @__PURE__ */ jsx11("span", { className: "text-lg font-bold text-amber-700", children: incomplete ? "Pricing unavailable" : money(total) })
    ] }) })
  ] });
}

// frozen:/app/src/components/estimator/foundation/FoundationTotals.jsx
import { jsx as jsx12, jsxs as jsxs4 } from "react/jsx-runtime";
var amt2 = (v) => Number.isFinite(v) ? money(v) : "Not saved";
var known2 = (v, d, u) => Number.isFinite(v) ? `${v.toFixed(d)} ${u}` : "Not saved";
function FoundationTotals({ totals, pricingUnavailable = false }) {
  const wallMortar = [totals.total_wall_cost, totals.total_brick_cost, totals.total_fill_cost].every(Number.isFinite) ? totals.total_wall_cost - totals.total_brick_cost - totals.total_fill_cost : null;
  const lines = [
    ["Concrete", totals.total_concrete_cost],
    ["Rebar", totals.total_rebar_cost],
    ["Excavation", totals.total_excavation_cost],
    ["Forming materials", totals.total_forming_materials_cost],
    ["Labor", totals.total_labor_cost],
    ["Poles", totals.total_pole_cost],
    ["Pole painting", totals.total_pole_painting_cost],
    ["Wall material", totals.total_brick_cost],
    ["Internal fill wall", totals.total_fill_cost],
    ["Wall mortar + labor", wallMortar],
    ["Wall caps", totals.total_wall_cap_cost],
    ["Equipment", totals.total_equipment_cost]
  ];
  return /* @__PURE__ */ jsxs4("div", { className: "bg-white rounded-xl border border-gray-200 p-4 sticky top-4", children: [
    /* @__PURE__ */ jsx12("h2", { className: "font-semibold text-gray-900 mb-3", children: "Section Total" }),
    pricingUnavailable && /* @__PURE__ */ jsx12("p", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800", children: "Saved/known amounts only; current pricing is incomplete." }),
    /* @__PURE__ */ jsx12("div", { className: "grid grid-cols-3 gap-2 mb-3 text-center", children: [
      ["Concrete", known2(totals.total_concrete_volume_cy, 2, "CY")],
      ["Excavation", known2(totals.total_excavation_volume_cy, 2, "CY")],
      ["Labor", known2(totals.total_labor_hours, 1, "hr")]
    ].map(([label, value]) => /* @__PURE__ */ jsxs4("div", { className: "bg-slate-50 rounded-lg py-2", children: [
      /* @__PURE__ */ jsx12("div", { className: "text-[10px] uppercase tracking-wide text-gray-400", children: label }),
      /* @__PURE__ */ jsx12("div", { className: "text-sm font-semibold text-gray-800", children: value })
    ] }, label)) }),
    /* @__PURE__ */ jsxs4("div", { className: "space-y-1.5 text-sm border-t border-gray-100 pt-3", children: [
      lines.map(([label, value]) => /* @__PURE__ */ jsxs4("div", { className: "flex justify-between text-gray-600", children: [
        /* @__PURE__ */ jsx12("span", { children: label }),
        /* @__PURE__ */ jsx12("span", { children: amt2(value) })
      ] }, label)),
      /* @__PURE__ */ jsxs4("div", { className: "flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2", children: [
        /* @__PURE__ */ jsx12("span", { children: "Total" }),
        /* @__PURE__ */ jsx12("span", { className: "text-red-600", children: pricingUnavailable ? /* @__PURE__ */ jsx12("span", { className: "text-amber-700", children: "Pricing unavailable" }) : money(totals.grand_total) })
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/estimator/foundation/ConcreteDeliveryPanel.jsx
import { jsx as jsx13, jsxs as jsxs5 } from "react/jsx-runtime";
var amt3 = (v) => hasFoundationCostSnapshot(v) ? money(v) : "Not saved";
var cy = (v) => Number.isFinite(v) ? `${v.toFixed(2)} CY` : "Not saved";
function ConcreteDeliveryPanel({ project, delivery, onChange }) {
  const admixtures = project.project_concrete_admixtures || [];
  const unavailable = delivery?.pricingUnavailable === true;
  const mixes = delivery?.availableMixes || [];
  const admix = delivery?.availableAdmixes || [];
  const savedMixId = project.project_concrete_type;
  const mixMissing = savedMixId && !mixes.some((m) => m.id === savedMixId);
  const trucks = delivery?.trucksList || [];
  const toggleAdmix = (id) => onChange({
    project_concrete_admixtures: admixtures.includes(id) ? admixtures.filter((a) => a !== id) : [...admixtures, id]
  });
  return /* @__PURE__ */ jsxs5("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [
    unavailable && /* @__PURE__ */ jsx13("p", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800", children: "Saved amounts (not current pricing)" }),
    /* @__PURE__ */ jsxs5("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsx13("h3", { className: "font-semibold text-gray-900 text-sm", children: "Ready-Mix Concrete Order" }),
      /* @__PURE__ */ jsxs5("div", { className: "text-right", children: [
        /* @__PURE__ */ jsx13("div", { className: "font-bold text-gray-900", children: amt3(delivery?.concreteTotal) }),
        /* @__PURE__ */ jsxs5("div", { className: "text-[11px] text-gray-400", children: [
          cy(delivery?.roundedYards),
          " \xB7 ",
          amt3(delivery?.ratePerYard),
          "/CY"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("label", { className: "text-xs text-gray-500 block", children: [
      "Mix strength",
      /* @__PURE__ */ jsxs5(
        "select",
        {
          value: savedMixId || "4000_ae",
          disabled: unavailable,
          onChange: (e) => onChange({ project_concrete_type: e.target.value }),
          className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:opacity-60",
          children: [
            mixMissing && /* @__PURE__ */ jsxs5("option", { value: savedMixId, disabled: true, children: [
              "Catalog mix unavailable (",
              savedMixId,
              ")"
            ] }),
            mixes.map((m) => /* @__PURE__ */ jsxs5("option", { value: m.id, children: [
              m.name,
              " \u2014 ",
              hasFoundationCostSnapshot(m.price) ? `${money(m.price)}/CY` : "price unavailable"
            ] }, m.id))
          ]
        }
      )
    ] }),
    !mixMissing && /* @__PURE__ */ jsx13("p", { className: "text-[11px] text-gray-400 mt-1", children: mixes.find((m) => m.id === (savedMixId || "4000_ae"))?.desc }),
    /* @__PURE__ */ jsxs5("div", { className: "mt-3 pt-3 border-t border-gray-100", children: [
      /* @__PURE__ */ jsx13("div", { className: "text-xs font-medium text-gray-700 mb-2", children: "Admixtures" }),
      /* @__PURE__ */ jsxs5("div", { className: "space-y-2", children: [
        admixtures.filter((id) => !admix.some((a) => a.id === id)).map((id) => /* @__PURE__ */ jsxs5("div", { className: "text-xs text-amber-700", children: [
          "Catalog admixture unavailable (",
          id,
          ")"
        ] }, id)),
        admix.map((a) => /* @__PURE__ */ jsxs5("label", { className: `flex gap-2 items-start text-xs ${unavailable ? "text-gray-400" : "text-gray-600"}`, children: [
          /* @__PURE__ */ jsx13(
            "input",
            {
              type: "checkbox",
              className: "mt-0.5",
              disabled: unavailable,
              checked: admixtures.includes(a.id),
              onChange: () => toggleAdmix(a.id)
            }
          ),
          /* @__PURE__ */ jsxs5("span", { children: [
            /* @__PURE__ */ jsx13("span", { className: "font-medium text-gray-800", children: a.name }),
            " \u2014 ",
            hasFoundationCostSnapshot(a.price) ? `${money(a.price)}/CY` : "price unavailable",
            /* @__PURE__ */ jsx13("span", { className: "block text-[11px] text-gray-400", children: a.desc })
          ] })
        ] }, a.id))
      ] })
    ] }),
    trucks.length > 0 && /* @__PURE__ */ jsxs5("div", { className: "mt-3 pt-3 border-t border-gray-100 space-y-1", children: [
      trucks.map((t, i) => /* @__PURE__ */ jsxs5("div", { className: "flex justify-between text-xs text-gray-600", children: [
        /* @__PURE__ */ jsxs5("span", { children: [
          "Truck ",
          i + 1,
          " \u2014 ",
          cy(t.roundedYards),
          Number.isFinite(t.smallOrderFee) && t.smallOrderFee > 0 && ` (small load ${money(t.smallOrderFee)})`,
          Number.isFinite(t.fuelFee) && t.fuelFee > 0 && ` + fuel ${money(t.fuelFee)}`
        ] }),
        /* @__PURE__ */ jsx13("span", { className: "font-medium text-gray-800", children: amt3(t.cost) })
      ] }, i)),
      (delivery?.additionalStopsCost ?? 0) > 0 && /* @__PURE__ */ jsxs5("div", { className: "flex justify-between text-xs text-gray-600", children: [
        /* @__PURE__ */ jsx13("span", { children: "Additional sign locations / stops" }),
        /* @__PURE__ */ jsx13("span", { className: "font-medium text-gray-800", children: amt3(delivery.additionalStopsCost) })
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/estimator/foundation/FoundationBOM.jsx
import { useMemo } from "react";
import { Fragment as Fragment2, jsx as jsx14, jsxs as jsxs6 } from "react/jsx-runtime";
var num3 = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
var qty = (n, unit) => `${num3(n).toLocaleString(void 0, { maximumFractionDigits: 2 })} ${unit}`;
var EMPTY_ITEMS = [];
var EMPTY_POLES = [];
var EMPTY_WALLS = [];
var EMPTY_TOTALS = {};
var EMPTY_INVENTORY = [];
function FoundationBOM({
  items = EMPTY_ITEMS,
  poles = EMPTY_POLES,
  walls = EMPTY_WALLS,
  delivery,
  totals = EMPTY_TOTALS,
  inventory = EMPTY_INVENTORY,
  itemPricing = EMPTY_ITEMS,
  polePricing: polePricing2 = EMPTY_ITEMS,
  wallPricing: wallPricing2 = EMPTY_ITEMS,
  pricingUnavailable = false
}) {
  const rows = useMemo(() => {
    const out = [];
    const add = (material, displayQty, cost, rawQty = num3(displayQty)) => {
      if (num3(rawQty) <= 0 && !hasFoundationCostSnapshot(cost)) return;
      out.push({ material, quantity: displayQty, cost });
    };
    const nameOf = (id) => inventory.find((i) => i.id === id)?.material_name || "Material";
    const resolved = items.filter((_, i) => itemPricing[i]?.available !== false);
    const blocked = items.filter((_, i) => itemPricing[i]?.available === false);
    if (delivery?.pricingUnavailable) {
      out.push({
        material: "Concrete delivery/order (saved)",
        quantity: Number.isFinite(delivery.roundedYards) ? qty(delivery.roundedYards, "CY") : "Not saved",
        cost: hasFoundationCostSnapshot(delivery.concreteTotal) ? delivery.concreteTotal : "Not saved",
        saved: true
      });
    } else if (num3(delivery?.roundedYards) > 0) {
      add("Ready-mix concrete (delivered)", qty(delivery.roundedYards, "CY"), delivery.concreteTotal, delivery.roundedYards);
    }
    const bags = resolved.reduce((s, i) => s + num3(i.concrete_bags), 0);
    const baggedCost = resolved.reduce((s, i) => s + num3(i.concrete_cost), 0);
    if (bags > 0 || baggedCost > 0) add("Bagged concrete", qty(bags, "bags"), baggedCost, bags);
    const rebarFt = resolved.reduce((s, i) => s + num3(i.rebar_feet), 0);
    const rebarLbs = resolved.reduce((s, i) => s + num3(i.rebar_weight_lbs), 0);
    const rebarCost = resolved.reduce((s, i) => s + num3(i.rebar_cost), 0);
    if (rebarFt > 0) {
      add(`Rebar (${qty(rebarLbs, "lbs")})`, qty(rebarFt, "LF"), rebarCost, rebarFt);
    }
    const formingQty = resolved.reduce((s, i) => s + num3(i.forming_qty), 0);
    const formingCost = resolved.reduce((s, i) => s + num3(i.forming_cost), 0);
    if (formingQty > 0) add("Forming material", qty(formingQty, "units"), formingCost, formingQty);
    blocked.forEach((i) => {
      const label = `Foundation ${i.component_id ?? "?"} (saved)`;
      {
        out.push({
          material: `${label} \u2014 concrete`,
          quantity: Number.isFinite(i.concrete_bags) ? qty(i.concrete_bags, "bags") : "Not saved",
          cost: hasFoundationCostSnapshot(i.concrete_cost) ? i.concrete_cost : "Not saved",
          saved: true
        });
      }
      if (i.include_rebar) {
        out.push({
          material: `${label} \u2014 rebar`,
          quantity: Number.isFinite(i.rebar_feet) ? qty(i.rebar_feet, "LF") : "Not saved",
          cost: hasFoundationCostSnapshot(i.rebar_cost) ? i.rebar_cost : "Not saved",
          saved: true
        });
      }
      if (i.include_forming) {
        out.push({
          material: `${label} \u2014 forming`,
          quantity: Number.isFinite(i.forming_qty) ? qty(i.forming_qty, "units") : "Not saved",
          cost: hasFoundationCostSnapshot(i.forming_cost) ? i.forming_cost : "Not saved",
          saved: true
        });
      }
    });
    const poleGroups = {};
    poles.forEach((p, index) => {
      if (polePricing2[index]?.available === false) return;
      if (!p.pole_id) return;
      poleGroups[p.pole_id] = poleGroups[p.pole_id] || { ft: 0, cost: 0 };
      poleGroups[p.pole_id].ft += (num3(p.height_inches) + num3(p.y_offset_inches)) / 12;
      poleGroups[p.pole_id].cost += num3(p.pole_cost);
    });
    Object.entries(poleGroups).forEach(([id, g]) => add(nameOf(id), qty(g.ft, "LF"), g.cost, g.ft));
    const polePainting = poles.reduce((s, p, index) => polePricing2[index]?.available === false ? s : s + num3(p.pole_painting_cost), 0);
    if (polePainting > 0) {
      add("Pole painting", "\u2014", polePainting);
    }
    const savedPoleFt = (p) => {
      const h = Number(p.height_inches), d = Number(p.y_offset_inches);
      return Number.isFinite(h) && h > 0 && Number.isFinite(d) && d >= 0 ? (h + d) / 12 : null;
    };
    poles.forEach((p, index) => {
      if (polePricing2[index]?.available !== false) return;
      const label = `Pole ${index + 1} (saved)`;
      const ft = savedPoleFt(p);
      out.push({
        material: `${label} \u2014 pole`,
        quantity: Number.isFinite(ft) ? qty(ft, "LF") : "Not saved",
        cost: hasFoundationCostSnapshot(p.pole_cost) ? p.pole_cost : "Not saved",
        saved: true
      });
      if (p.include_pole_painting || hasFoundationCostSnapshot(p.pole_painting_cost)) {
        out.push({
          material: `${label} \u2014 painting`,
          quantity: "\u2014",
          cost: hasFoundationCostSnapshot(p.pole_painting_cost) ? p.pole_painting_cost : "Not saved",
          saved: true
        });
      }
    });
    out.push(...foundationWallBomRows(walls, inventory, wallPricing2));
    (totals.wall_caps_by_material || []).forEach((g) => add(g.name || "Wall cap", qty(g.qty, "pcs"), g.cost, g.qty));
    return out;
  }, [items, poles, walls, delivery, totals, inventory, itemPricing, polePricing2, wallPricing2]);
  const materialTotal = rows.every((r) => hasFoundationCostSnapshot(r.cost)) ? rows.reduce((sum, row) => sum + row.cost, 0) : null;
  return /* @__PURE__ */ jsxs6("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [
    /* @__PURE__ */ jsx14("h3", { className: "font-semibold text-gray-900 mb-3", children: "Bill of Materials" }),
    pricingUnavailable && /* @__PURE__ */ jsxs6("div", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1", children: [
      /* @__PURE__ */ jsx14("p", { className: "text-[11px] font-semibold text-amber-800", children: "Pricing unavailable \u2014 saved quantities may be outdated." }),
      itemPricing.filter((p) => p && p.available === false).concat(polePricing2.filter((p) => p && p.available === false)).flatMap(
        (p, k) => (p.issues || []).map((i, j) => /* @__PURE__ */ jsx14("p", { className: "text-[10px] text-amber-700", children: i.message }, `${k}-${j}`))
      )
    ] }),
    rows.length === 0 ? /* @__PURE__ */ jsx14("p", { className: "text-sm text-gray-500", children: "No materials yet \u2014 add a foundation to build the list." }) : /* @__PURE__ */ jsxs6(Fragment2, { children: [
      /* @__PURE__ */ jsxs6("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx14("thead", { children: /* @__PURE__ */ jsxs6("tr", { className: "text-left text-xs text-gray-500 border-b border-gray-200", children: [
          /* @__PURE__ */ jsx14("th", { className: "py-1.5", children: "Material" }),
          /* @__PURE__ */ jsx14("th", { className: "py-1.5", children: "Quantity" }),
          /* @__PURE__ */ jsx14("th", { className: "py-1.5 text-right", children: "Cost" })
        ] }) }),
        /* @__PURE__ */ jsx14("tbody", { children: rows.map((r, i) => /* @__PURE__ */ jsxs6("tr", { className: "border-b border-gray-100 last:border-0", children: [
          /* @__PURE__ */ jsx14("td", { className: "py-1.5 pr-3 text-gray-800", children: r.material }),
          /* @__PURE__ */ jsx14("td", { className: "py-1.5 pr-3 whitespace-nowrap text-gray-600", children: r.quantity }),
          /* @__PURE__ */ jsx14("td", { className: "py-1.5 pl-3 whitespace-nowrap text-right text-gray-900", children: hasFoundationCostSnapshot(r.cost) ? money(r.cost) : "Not saved" })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "flex justify-between pt-3 mt-1 border-t border-gray-200 font-bold text-gray-900", children: [
        /* @__PURE__ */ jsx14("span", { children: "Listed cost subtotal" }),
        /* @__PURE__ */ jsx14("span", { children: pricingUnavailable ? /* @__PURE__ */ jsx14("span", { className: "text-amber-700", children: "Pricing unavailable" }) : hasFoundationCostSnapshot(materialTotal) ? money(materialTotal) : "Not saved" })
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/estimator/foundation/FoundationWallsPanel.jsx
import React from "react";

// frozen:/app/src/components/estimator/foundation/WallShapeEditor.jsx
import { useId, useState as useState2 } from "react";
import { jsx as jsx15, jsxs as jsxs7 } from "react/jsx-runtime";
var PX_PER_IN = 1.4;
var SNAP = 2;
var shapeRecord = (current) => current && typeof current === "object" && !Array.isArray(current) ? current : {};
var emitShape = (current, points, closed) => {
  const segments = foundationWallSegments(points, closed);
  if (!segments) return null;
  return { ...shapeRecord(current), points, closed, segments };
};
function WallShapeEditor({ shape, onChange }) {
  const basis = foundationWallOutlineBasis(shape);
  const points = basis.points;
  const closed = basis.closed;
  const [rect, setRect] = useState2({ l: 96, w: 48 });
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gridId = `wallGrid-${uid}`;
  const rectLId = `rectL-${uid}`;
  const rectWId = `rectW-${uid}`;
  const rectErrId = `rect-err-${uid}`;
  const W = 520;
  const H = 300;
  const toPx = (p) => ({ x: p.x * PX_PER_IN + 20, y: p.z * PX_PER_IN + 20 });
  const addPoint = (e) => {
    if (closed) return;
    const box = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - box.left) * (W / box.width);
    const sy = (e.clientY - box.top) * (H / box.height);
    const x = Math.max(0, Math.round((sx - 20) / PX_PER_IN / SNAP) * SNAP);
    const z = Math.max(0, Math.round((sy - 20) / PX_PER_IN / SNAP) * SNAP);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const last = points[points.length - 1];
    if (last && last.x === x && last.z === z) return;
    const next = emitShape(shape, [...points, { x, z }], false);
    if (next) onChange(next);
  };
  const rectShape = foundationWallRectangle(rect.l, rect.w);
  const rectLBad = foundationWallRectangle(rect.l, 1) === null;
  const rectWBad = foundationWallRectangle(1, rect.w) === null;
  const setRectangle = () => {
    if (!rectShape) return;
    onChange({ ...shapeRecord(shape), ...rectShape });
  };
  const segments = Array.isArray(shape?.segments) ? shape.segments : [];
  const hasSegmentLengths = segments.length > 0;
  const legacyOnly = !basis.hasRecordedPoints && hasSegmentLengths;
  const malformedPoints = basis.hasRecordedPoints && !points.length;
  const clearable = points.length > 0 || hasSegmentLengths || shape?.points != null || shape?.segments != null;
  const perimeter = basis.perimeterInches;
  const emit = (pointsNext, closedNext) => {
    const next = emitShape(shape, pointsNext, closedNext);
    if (next) onChange(next);
  };
  return /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxs7("div", { className: "flex flex-wrap items-end gap-2", children: [
      /* @__PURE__ */ jsxs7("label", { className: "text-xs text-gray-500", children: [
        "Rect L (in)",
        /* @__PURE__ */ jsx15(
          Input,
          {
            type: "number",
            step: "any",
            className: "w-24",
            value: rect.l,
            id: rectLId,
            "aria-invalid": rectLBad || void 0,
            "aria-describedby": rectLBad ? rectErrId : void 0,
            onChange: (e) => setRect({ ...rect, l: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs7("label", { className: "text-xs text-gray-500", children: [
        "Rect W (in)",
        /* @__PURE__ */ jsx15(
          Input,
          {
            type: "number",
            step: "any",
            className: "w-24",
            value: rect.w,
            id: rectWId,
            "aria-invalid": rectWBad || void 0,
            "aria-describedby": rectWBad ? rectErrId : void 0,
            onChange: (e) => setRect({ ...rect, w: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs7(
        Button,
        {
          variant: "outline",
          size: "sm",
          onClick: setRectangle,
          disabled: !rectShape,
          "aria-describedby": !rectShape ? rectErrId : void 0,
          children: [
            /* @__PURE__ */ jsx15(Square, { className: "w-4 h-4", "aria-hidden": "true" }),
            " Use rectangle"
          ]
        }
      ),
      !rectShape && /* @__PURE__ */ jsx15("span", { role: "status", id: rectErrId, className: "text-xs text-amber-600", children: "Rectangle dimensions must be positive finite inches; current outline is unchanged." }),
      /* @__PURE__ */ jsx15(
        Button,
        {
          variant: "outline",
          size: "sm",
          disabled: points.length < 3 || closed,
          onClick: () => emit(points, true),
          children: "Close outline"
        }
      ),
      /* @__PURE__ */ jsxs7(
        Button,
        {
          variant: "ghost",
          size: "sm",
          disabled: !points.length,
          onClick: () => emit(points.slice(0, -1), false),
          children: [
            /* @__PURE__ */ jsx15(Undo2, { className: "w-4 h-4", "aria-hidden": "true" }),
            " Undo"
          ]
        }
      ),
      /* @__PURE__ */ jsxs7(
        Button,
        {
          variant: "ghost",
          size: "sm",
          disabled: !clearable,
          onClick: () => {
            if (!window.confirm("Clear the drawn outline?")) return;
            onChange({ ...shapeRecord(shape), points: [], closed: false, segments: [] });
          },
          children: [
            /* @__PURE__ */ jsx15(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }),
            " Clear"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs7(
      "svg",
      {
        width: "100%",
        viewBox: `0 0 ${W} ${H}`,
        onClick: addPoint,
        className: "rounded-lg border border-gray-200 bg-slate-50",
        style: { cursor: closed ? "default" : "crosshair" },
        children: [
          /* @__PURE__ */ jsx15("defs", { children: /* @__PURE__ */ jsx15("pattern", { id: gridId, width: 12 * PX_PER_IN, height: 12 * PX_PER_IN, patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx15("path", { d: `M ${12 * PX_PER_IN} 0 L 0 0 0 ${12 * PX_PER_IN}`, fill: "none", stroke: "#e2e8f0", strokeWidth: "1" }) }) }),
          /* @__PURE__ */ jsx15("rect", { width: W, height: H, fill: `url(#${gridId})` }),
          points.length > 1 && /* @__PURE__ */ jsx15(
            "polyline",
            {
              points: [...points, ...closed ? [points[0]] : []].map((p) => {
                const q = toPx(p);
                return `${q.x},${q.y}`;
              }).join(" "),
              fill: closed ? "rgba(248,113,113,0.12)" : "none",
              stroke: "#ef4444",
              strokeWidth: "3"
            }
          ),
          points.map((p, i) => {
            const q = toPx(p);
            return /* @__PURE__ */ jsx15("circle", { cx: q.x, cy: q.y, r: "5", fill: "#fff", stroke: "#ef4444", strokeWidth: "2" }, i);
          }),
          points.length === 0 && /* @__PURE__ */ jsx15("text", { x: "20", y: "28", fontSize: "12", fill: "#94a3b8", children: "Click to place footprint corners, or enter a rectangle above." })
        ]
      }
    ),
    /* @__PURE__ */ jsxs7("div", { className: "text-xs text-gray-600", children: [
      hasSegmentLengths ? `${segments.length} segment${segments.length === 1 ? "" : "s"}` : "no segments",
      " \xB7 perimeter",
      " ",
      /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: perimeter === null ? "Unavailable" : `${Math.round(perimeter)}"` }),
      closed ? " \xB7 closed" : points.length > 2 ? " \xB7 open (close it for an internal fill wall)" : ""
    ] }),
    legacyOnly && /* @__PURE__ */ jsx15("div", { role: "status", className: "text-xs text-amber-600", children: "Recorded segment lengths only \u2014 no drawable footprint. Draw or enter a rectangle to re-establish geometry." }),
    malformedPoints && /* @__PURE__ */ jsx15("div", { role: "status", className: "text-xs text-amber-600", children: "Recorded footprint coordinates need repair before a preview can be drawn." })
  ] });
}

// frozen:/app/src/components/estimator/foundation/FoundationWallsPanel.jsx
import { jsx as jsx16, jsxs as jsxs8 } from "react/jsx-runtime";
var heightInput = (value) => value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;
function WallRow({ wall, index, options, pricing, onChange, onRemove }) {
  const c = wall.calculatedCosts || {};
  const set = (changes) => onChange(index, changes);
  const pricingIssues = pricing?.issues ?? foundationWallPricingIssues(wall, options, index);
  const pricingUnavailable = pricing?.available === false || pricingIssues.length > 0;
  const amt4 = (v) => hasFoundationCostSnapshot(v) ? money(v) : "Not saved";
  const [showEditor, setShowEditor] = React.useState(false);
  const fieldIssue = (field) => pricingIssues.some((i) => i.field === field);
  const describedBy = (field) => fieldIssue(field) ? `wall-${index}-pricing` : void 0;
  return /* @__PURE__ */ jsxs8("div", { className: "bg-white rounded-xl border border-gray-200 p-3 space-y-3", children: [
    /* @__PURE__ */ jsxs8("div", { className: "flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx16(
        Input,
        {
          className: "min-w-0 max-w-[220px]",
          value: wall.name || "",
          placeholder: `Wall ${index + 1}`,
          onChange: (e) => set({ name: e.target.value })
        }
      ),
      /* @__PURE__ */ jsxs8("div", { className: "flex shrink-0 items-center gap-3", children: [
        /* @__PURE__ */ jsx16("span", { className: "whitespace-nowrap font-bold text-gray-900", children: amt4(c.totalCost) }),
        /* @__PURE__ */ jsx16(Button, { variant: "ghost", size: "icon", onClick: () => onRemove(index), children: /* @__PURE__ */ jsx16(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2", children: [
      /* @__PURE__ */ jsxs8("label", { className: "text-xs text-gray-500", children: [
        "Height (in)",
        /* @__PURE__ */ jsx16(
          Input,
          {
            type: "number",
            step: "any",
            value: wall.heightInches ?? "",
            onChange: (e) => set({ heightInches: heightInput(e.target.value) }),
            "aria-label": "Wall height (in)",
            "aria-invalid": fieldIssue("heightInches") || void 0,
            "aria-describedby": describedBy("heightInches")
          }
        )
      ] }),
      /* @__PURE__ */ jsxs8("label", { className: "text-xs text-gray-500", children: [
        "Mortar gap (in)",
        /* @__PURE__ */ jsx16(
          Input,
          {
            type: "number",
            step: "0.125",
            min: "0",
            value: wall.mortarGapInches ?? 0.375,
            placeholder: "0.375",
            onChange: (e) => set({ mortarGapInches: heightInput(e.target.value) }),
            "aria-label": "Wall mortar gap (in)",
            "aria-invalid": fieldIssue("mortarGapInches") || void 0,
            "aria-describedby": describedBy("mortarGapInches")
          }
        )
      ] }),
      /* @__PURE__ */ jsxs8("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
        "Wall material",
        /* @__PURE__ */ jsxs8(
          "select",
          {
            className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
            value: wall.materialId || "",
            "aria-label": "Wall material",
            "aria-invalid": fieldIssue("materialId") || void 0,
            "aria-describedby": describedBy("materialId"),
            onChange: (e) => set({ materialId: e.target.value }),
            children: [
              /* @__PURE__ */ jsx16("option", { value: "", children: "Select material\u2026" }),
              wall.materialId && !options.some((o) => o.id === wall.materialId) && /* @__PURE__ */ jsx16("option", { value: wall.materialId, disabled: true, children: `Catalog material unavailable (${wall.materialId})` }),
              options.map((o) => /* @__PURE__ */ jsx16("option", { value: o.id, children: o.material_name }, o.id))
            ]
          }
        ),
        wall.materialId && !options.some((o) => o.id === wall.materialId) && /* @__PURE__ */ jsx16("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog material unavailable; current pricing needs review." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "rounded-lg bg-slate-50 p-2 space-y-2", children: [
      /* @__PURE__ */ jsxs8("label", { className: "flex items-center gap-2 text-xs font-medium text-gray-700", children: [
        /* @__PURE__ */ jsx16(
          "input",
          {
            type: "checkbox",
            checked: !!wall.includeInternalWall,
            onChange: (e) => set({ includeInternalWall: e.target.checked })
          }
        ),
        "Internal fill wall"
      ] }),
      wall.includeInternalWall && /* @__PURE__ */ jsxs8("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsxs8("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
          "Fill material",
          /* @__PURE__ */ jsxs8(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: wall.internalMaterialId || "",
              "aria-label": "Internal wall material",
              "aria-invalid": fieldIssue("internalMaterialId") || void 0,
              "aria-describedby": describedBy("internalMaterialId"),
              onChange: (e) => set({ internalMaterialId: e.target.value }),
              children: [
                /* @__PURE__ */ jsx16("option", { value: "", children: "Select material\u2026" }),
                wall.internalMaterialId && !options.some((o) => o.id === wall.internalMaterialId) && /* @__PURE__ */ jsx16("option", { value: wall.internalMaterialId, disabled: true, children: `Catalog material unavailable (${wall.internalMaterialId})` }),
                options.map((o) => /* @__PURE__ */ jsx16("option", { value: o.id, children: o.material_name }, o.id))
              ]
            }
          ),
          wall.internalMaterialId && !options.some((o) => o.id === wall.internalMaterialId) && /* @__PURE__ */ jsx16("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog material unavailable; current pricing needs review." })
        ] }),
        /* @__PURE__ */ jsxs8("label", { className: "text-xs text-gray-500", children: [
          "Fill height (in)",
          /* @__PURE__ */ jsx16(
            Input,
            {
              type: "number",
              step: "any",
              value: wall.internalWallHeightInches ?? wall.heightInches ?? "",
              onChange: (e) => set({ internalWallHeightInches: heightInput(e.target.value) }),
              "aria-label": "Internal wall height (in)",
              "aria-invalid": fieldIssue("internalWallHeightInches") || void 0,
              "aria-describedby": describedBy("internalWallHeightInches")
            }
          )
        ] }),
        /* @__PURE__ */ jsxs8("label", { className: "text-xs text-gray-500", children: [
          "Fill mortar gap (in)",
          /* @__PURE__ */ jsx16(
            Input,
            {
              type: "number",
              step: "0.125",
              min: "0",
              value: wall.internalMortarGapInches ?? 0.375,
              placeholder: "0.375",
              onChange: (e) => set({ internalMortarGapInches: heightInput(e.target.value) }),
              "aria-label": "Internal wall mortar gap (in)",
              "aria-invalid": fieldIssue("internalMortarGapInches") || void 0,
              "aria-describedby": describedBy("internalMortarGapInches")
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600", children: [
      /* @__PURE__ */ jsxs8("div", { children: [
        "Units: ",
        /* @__PURE__ */ jsx16("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.totalBricks) ? Math.round(c.totalBricks) : "Not saved" })
      ] }),
      /* @__PURE__ */ jsxs8("div", { children: [
        "Courses: ",
        /* @__PURE__ */ jsx16("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.numCourses) ? Math.ceil(c.numCourses) : "Not saved" })
      ] }),
      /* @__PURE__ */ jsxs8("div", { children: [
        "Material: ",
        /* @__PURE__ */ jsx16("span", { className: "font-semibold text-gray-900", children: amt4(c.materialCost) })
      ] }),
      /* @__PURE__ */ jsxs8("div", { children: [
        "Mortar: ",
        /* @__PURE__ */ jsx16("span", { className: "font-semibold text-gray-900", children: amt4(c.mortarCost) })
      ] }),
      /* @__PURE__ */ jsxs8("div", { children: [
        "Labor: ",
        /* @__PURE__ */ jsx16("span", { className: "font-semibold text-gray-900", children: amt4(c.laborCost) })
      ] }),
      /* @__PURE__ */ jsxs8("div", { children: [
        "Labor hrs: ",
        /* @__PURE__ */ jsx16("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.laborHours) ? c.laborHours.toFixed(1) : "Not saved" })
      ] }),
      /* @__PURE__ */ jsxs8("div", { children: [
        "Linear in: ",
        /* @__PURE__ */ jsx16("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.totalLinearInches) ? Math.round(c.totalLinearInches) : "Not saved" })
      ] }),
      pricingUnavailable && /* @__PURE__ */ jsx16("div", { className: "col-span-full text-[10px] font-semibold text-amber-700", children: "Saved amounts (not current pricing)" }),
      pricingIssues.length > 0 && /* @__PURE__ */ jsx16("div", { role: "status", className: "col-span-full text-[10px] text-amber-700 space-y-0.5", id: `wall-${index}-pricing`, children: pricingIssues.map((issue) => /* @__PURE__ */ jsx16("p", { children: issue.message }, `${issue.field}-${issue.code}`)) })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxs8(
        Button,
        {
          variant: "outline",
          size: "sm",
          onClick: () => setShowEditor((v) => !v),
          "aria-expanded": showEditor,
          "aria-invalid": fieldIssue("shape") || void 0,
          "aria-describedby": describedBy("shape"),
          children: [
            /* @__PURE__ */ jsx16(PenLine, { className: "w-4 h-4", "aria-hidden": "true" }),
            " ",
            showEditor ? "Hide outline" : "Wall outline"
          ]
        }
      ),
      fieldIssue("shape") ? /* @__PURE__ */ jsx16("span", { className: "text-xs text-amber-600", children: "Outline geometry needs repair before repricing - see diagnostics above." }) : !wall.shape?.segments?.length ? /* @__PURE__ */ jsx16("span", { className: "text-xs text-amber-600", children: "No outline yet - draw the wall footprint before estimating quantities." }) : null
    ] }),
    showEditor && /* @__PURE__ */ jsx16(WallShapeEditor, { shape: wall.shape, onChange: (shape) => set({ shape }) })
  ] });
}
function FoundationWallsPanel({ walls = [], options = [], onChange, wallPricing: wallPricing2 = [] }) {
  const patchWall = (index, changes) => onChange(walls.map((w, i) => i === index ? { ...w, ...changes } : w));
  const removeWall = (index) => {
    const name = walls[index]?.name || `Wall ${index + 1}`;
    if (!window.confirm(`Remove ${name}? Wall caps attached to it are retained for review.`)) return;
    onChange(walls.filter((_, i) => i !== index));
  };
  const addWall = () => onChange([
    ...walls,
    { name: `Wall ${walls.length + 1}`, heightInches: 24, mortarGapInches: 0.375, offsetFraction: 0.5 }
  ]);
  return /* @__PURE__ */ jsxs8("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs8("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx16("h2", { className: "font-semibold text-gray-900", children: "Masonry Walls" }),
      /* @__PURE__ */ jsxs8(Button, { variant: "outline", size: "sm", onClick: addWall, children: [
        /* @__PURE__ */ jsx16(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
        " Wall"
      ] })
    ] }),
    walls.length === 0 ? /* @__PURE__ */ jsx16("div", { className: "text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No walls on this section." }) : walls.map((wall, index) => /* @__PURE__ */ jsx16(
      WallRow,
      {
        wall,
        index,
        options,
        pricing: wallPricing2[index],
        onChange: patchWall,
        onRemove: removeWall
      },
      wall.component_id || index
    ))
  ] });
}

// frozen:/app/src/components/estimator/foundation/FoundationWallCapsPanel.jsx
import { jsx as jsx17, jsxs as jsxs9 } from "react/jsx-runtime";
function FoundationWallCapsPanel({ caps = [], walls = [], options = [], onChange }) {
  const patchCap = (index, changes) => onChange(caps.map((c, i) => i === index ? { ...c, ...changes } : c));
  const removeCap = (index) => {
    if (!window.confirm(`Remove cap ${index + 1}?`)) return;
    onChange(caps.filter((_, i) => i !== index));
  };
  const addCap = () => {
    const inv = options[0];
    const stockLength = wallCapInputNumber(inv?.cap_stock_length_inches);
    onChange([
      ...caps,
      {
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cap_inventory_id: inv?.id || "",
        wall_component_id: walls[0]?.component_id || "",
        wall_index: walls.length ? 0 : void 0,
        segment_component_id: walls[0]?.shape?.segments?.[0]?.component_id || "",
        segment_index: walls[0]?.shape?.segments?.length ? 0 : void 0,
        position_along_segment_inches: 0,
        length_inches: stockLength !== null && stockLength > 0 ? stockLength : "",
        rotation_offset_degrees: 0,
        lateral_offset_inches: 0
      }
    ]);
  };
  const capIssues = foundationWallCapCatalogIssues(caps, options);
  const unavailableCaps = new Set(capIssues.filter((issue) => issue.code !== "wall_cap_cost_total_invalid").map((issue) => issue.index));
  const geometryIssues = (index) => capIssues.filter((issue) => issue.index === index && ["length_inches", "cap_stock_length_inches"].includes(issue.field));
  return /* @__PURE__ */ jsxs9("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs9("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs9("div", { children: [
        /* @__PURE__ */ jsx17("h2", { className: "font-semibold text-gray-900", children: "Wall Caps" }),
        /* @__PURE__ */ jsx17("p", { className: "text-xs text-gray-500", children: "Full stock price is charged per cut piece." })
      ] }),
      /* @__PURE__ */ jsxs9(Button, { variant: "outline", size: "sm", onClick: addCap, disabled: options.length === 0, children: [
        /* @__PURE__ */ jsx17(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
        " Cap"
      ] })
    ] }),
    options.length === 0 && /* @__PURE__ */ jsx17("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: "Wall cap catalog unavailable \u2014 existing rows remain editable; new caps cannot be added." }),
    caps.length === 0 ? /* @__PURE__ */ jsx17("div", { className: "text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No caps on this section." }) : caps.map((cap, index) => /* @__PURE__ */ jsxs9("div", { className: "bg-white rounded-xl border border-gray-200 p-3", children: [
      /* @__PURE__ */ jsxs9("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-2 items-end", children: [
        /* @__PURE__ */ jsxs9("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
          "Cap material",
          /* @__PURE__ */ jsxs9(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: cap.cap_inventory_id || "",
              "aria-label": "Cap material",
              onChange: (e) => {
                patchCap(index, {
                  cap_inventory_id: e.target.value
                });
              },
              children: [
                /* @__PURE__ */ jsx17("option", { value: "", children: "Select cap\u2026" }),
                cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && /* @__PURE__ */ jsx17("option", { value: cap.cap_inventory_id, disabled: true, children: `Catalog cap unavailable (${cap.cap_inventory_id})` }),
                options.map((o) => /* @__PURE__ */ jsx17("option", { value: o.id, children: o.material_name }, o.id))
              ]
            }
          ),
          cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && /* @__PURE__ */ jsx17("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog cap unavailable; current pricing needs review." })
        ] }),
        /* @__PURE__ */ jsxs9("label", { className: "text-xs text-gray-500", children: [
          "Wall",
          /* @__PURE__ */ jsxs9(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: cap.wall_component_id ?? "",
              "aria-label": "Cap wall",
              onChange: (e) => {
                const id = e.target.value;
                const i = walls.findIndex((w) => w.component_id === id);
                patchCap(index, {
                  wall_component_id: id,
                  wall_index: id === "" || i < 0 ? void 0 : i,
                  segment_component_id: "",
                  segment_index: void 0
                });
              },
              children: [
                /* @__PURE__ */ jsx17("option", { value: "", children: "Unassigned" }),
                cap.wall_component_id && !walls.some((w) => w.component_id === cap.wall_component_id) && /* @__PURE__ */ jsx17("option", { value: cap.wall_component_id, disabled: true, children: `Missing wall (${String(cap.wall_component_id).slice(0, 18)}\u2026)` }),
                walls.map((w, i) => /* @__PURE__ */ jsx17("option", { value: w.component_id || "", children: w.name || `Wall ${i + 1}` }, w.component_id || i))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs9("label", { className: "text-xs text-gray-500", children: [
          "Segment",
          /* @__PURE__ */ jsxs9(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: cap.segment_component_id ?? "",
              "aria-label": "Cap segment",
              onChange: (e) => {
                const id = e.target.value;
                const wall = walls.find((w) => w.component_id === cap.wall_component_id);
                const segs = wall?.shape?.segments || [];
                const i = segs.findIndex((sg) => sg.component_id === id);
                patchCap(index, {
                  segment_component_id: id,
                  segment_index: id === "" || i < 0 ? void 0 : i
                });
              },
              children: [
                /* @__PURE__ */ jsx17("option", { value: "", children: "Unassigned" }),
                cap.segment_component_id && !(walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).some((sg) => sg.component_id === cap.segment_component_id) && /* @__PURE__ */ jsx17("option", { value: cap.segment_component_id, disabled: true, children: `Missing segment (${String(cap.segment_component_id).slice(0, 18)}\u2026)` }),
                (walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).map((sg, i) => /* @__PURE__ */ jsx17("option", { value: sg.component_id || "", children: `Segment ${i + 1}` }, sg.component_id || i))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs9("label", { className: "text-xs text-gray-500", children: [
          "Cut length (in)",
          /* @__PURE__ */ jsx17(
            Input,
            {
              type: "number",
              step: "any",
              value: wallCapInputNumber(wallCapCutLengthValue(cap)) === null ? "" : wallCapCutLengthValue(cap),
              "aria-label": `Cap ${index + 1} cut length (inches)`,
              "aria-invalid": geometryIssues(index).some((i) => i.field === "length_inches") || void 0,
              "aria-describedby": geometryIssues(index).length ? `wall-cap-${index}-geometry` : void 0,
              onChange: (e) => {
                const raw = e.target.value;
                const parsed = wallCapInputNumber(raw);
                patchCap(index, { length_inches: parsed === null ? raw : parsed });
              }
            }
          )
        ] })
      ] }),
      geometryIssues(index).length > 0 && /* @__PURE__ */ jsx17("div", { id: `wall-cap-${index}-geometry`, className: "mt-1 text-[11px] text-amber-700 space-y-0.5", children: geometryIssues(index).map((issue) => /* @__PURE__ */ jsx17("p", { children: issue.message }, issue.code)) }),
      /* @__PURE__ */ jsxs9("div", { className: "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-2 text-xs text-gray-600", children: [
        /* @__PURE__ */ jsxs9("span", { children: [
          unavailableCaps.has(index) ? "Saved stock length: " : "Stock length: ",
          /* @__PURE__ */ jsx17("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(cap.stock_length_inches) && cap.stock_length_inches > 0 ? cap.stock_length_inches + String.fromCharCode(34) : "Not saved" })
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "ml-auto flex items-center gap-3", children: [
          /* @__PURE__ */ jsx17("span", { className: "font-bold text-gray-900", children: hasFoundationCostSnapshot(cap.cost) ? money(cap.cost) : "Not saved" }),
          unavailableCaps.has(index) && /* @__PURE__ */ jsx17("span", { className: "text-[10px] text-amber-700", children: "Saved amounts (not current pricing)" }),
          /* @__PURE__ */ jsx17(Button, { variant: "ghost", size: "icon", onClick: () => removeCap(index), children: /* @__PURE__ */ jsx17(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
        ] })
      ] })
    ] }, cap.component_id || cap.id || index))
  ] });
}

// frozen:/app/src/components/estimator/foundation/FoundationPolesPanel.jsx
import { jsx as jsx18, jsxs as jsxs10 } from "react/jsx-runtime";
var heightInput2 = (value) => value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;
function FoundationPolesPanel({ poles = [], options = [], items = [], onChange, polePricing: polePricing2 = [] }) {
  const patchPole = (index, changes) => onChange(poles.map((p, i) => i === index ? { ...p, ...changes } : p));
  const removePole = (index) => {
    if (!window.confirm(`Remove Pole ${index + 1}? Cabinets mounted on it are retained for review.`)) return;
    onChange(poles.filter((_, i) => i !== index));
  };
  const addPole = () => onChange([
    ...poles,
    { pole_id: options[0]?.id || "", height_inches: 120, y_offset_inches: 42, include_pole_painting: false }
  ]);
  return /* @__PURE__ */ jsxs10("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs10("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs10("div", { children: [
        /* @__PURE__ */ jsx18("h2", { className: "font-semibold text-gray-900", children: "Poles" }),
        /* @__PURE__ */ jsx18("p", { className: "text-xs text-gray-500", children: "Priced on total length \u2014 height above grade plus depth in the ground." })
      ] }),
      /* @__PURE__ */ jsxs10(Button, { variant: "outline", size: "sm", onClick: addPole, disabled: options.length === 0, children: [
        /* @__PURE__ */ jsx18(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
        " Pole"
      ] })
    ] }),
    options.length === 0 && /* @__PURE__ */ jsx18("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: "Pole catalog unavailable \u2014 existing rows remain editable; new poles cannot be added." }),
    poles.length === 0 ? /* @__PURE__ */ jsx18("div", { className: "text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No poles on this section." }) : poles.map((pole, index) => {
      const issues = polePricing2[index]?.issues || [];
      const pricingUnavailable = polePricing2[index]?.available === false;
      const fieldIssue = (field) => issues.some((i) => i.field === field);
      const describedBy = issues.length ? `pole-${index}-pricing` : void 0;
      return /* @__PURE__ */ jsxs10("div", { className: "bg-white rounded-xl border border-gray-200 p-3", children: [
        /* @__PURE__ */ jsxs10("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-2 items-end", children: [
          /* @__PURE__ */ jsxs10("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
            "Pole",
            /* @__PURE__ */ jsxs10(
              "select",
              {
                className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
                value: pole.pole_id || "",
                "aria-label": "Pole material",
                "aria-invalid": fieldIssue("pole_id") || void 0,
                "aria-describedby": fieldIssue("pole_id") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { pole_id: e.target.value }),
                children: [
                  /* @__PURE__ */ jsx18("option", { value: "", children: "Select pole\u2026" }),
                  pole.pole_id && !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx18("option", { value: pole.pole_id, disabled: true, children: `Catalog pole unavailable (${pole.pole_id})` }),
                  options.map((o) => /* @__PURE__ */ jsx18("option", { value: o.id, children: o.material_name }, o.id))
                ]
              }
            ),
            pole.pole_id && !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx18("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog pole unavailable; current pricing needs review." })
          ] }),
          /* @__PURE__ */ jsxs10("label", { className: "text-xs text-gray-500", children: [
            "Height above grade (in)",
            /* @__PURE__ */ jsx18(
              Input,
              {
                type: "number",
                step: "any",
                value: pole.height_inches ?? "",
                "aria-label": `Pole ${index + 1} height above grade (inches)`,
                "aria-invalid": fieldIssue("height_inches") || void 0,
                "aria-describedby": fieldIssue("height_inches") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { height_inches: heightInput2(e.target.value) })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs10("label", { className: "text-xs text-gray-500", children: [
            "Depth in ground (in)",
            /* @__PURE__ */ jsx18(
              Input,
              {
                type: "number",
                step: "any",
                value: pole.y_offset_inches ?? "",
                "aria-label": `Pole ${index + 1} depth in ground (inches)`,
                "aria-invalid": fieldIssue("y_offset_inches") || void 0,
                "aria-describedby": fieldIssue("y_offset_inches") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { y_offset_inches: heightInput2(e.target.value) })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs10("label", { className: "text-xs text-gray-500", children: [
            "Foundation",
            /* @__PURE__ */ jsxs10(
              "select",
              {
                className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
                value: pole.foundation_component_id ?? "",
                "aria-label": "Pole foundation",
                onChange: (e) => {
                  const id = e.target.value;
                  const i = items.findIndex((it) => it.component_id === id);
                  patchPole(index, {
                    foundation_component_id: id,
                    foundation_idx: id === "" || i < 0 ? void 0 : i
                  });
                },
                children: [
                  /* @__PURE__ */ jsx18("option", { value: "", children: "Unassigned" }),
                  pole.foundation_component_id && !items.some((it) => it.component_id === pole.foundation_component_id) && /* @__PURE__ */ jsx18("option", { value: pole.foundation_component_id, disabled: true, children: `Missing foundation (${String(pole.foundation_component_id).slice(0, 18)}\u2026)` }),
                  items.map((it, i) => /* @__PURE__ */ jsx18("option", { value: it.component_id || "", children: it.description || `Foundation ${i + 1}` }, it.component_id || i))
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs10("div", { className: "flex items-center justify-between mt-2", children: [
          /* @__PURE__ */ jsxs10("label", { className: "flex items-center gap-1.5 text-xs font-medium text-gray-700", children: [
            /* @__PURE__ */ jsx18(
              "input",
              {
                type: "checkbox",
                checked: !!pole.include_pole_painting,
                "aria-invalid": issues.some((i) => i.code === "pole_paint_setting_unavailable") || void 0,
                "aria-describedby": issues.some((i) => i.code === "pole_paint_setting_unavailable") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { include_pole_painting: e.target.checked })
              }
            ),
            "Paint pole"
          ] }),
          /* @__PURE__ */ jsxs10("div", { className: "flex items-center gap-3 text-xs text-gray-600", children: [
            /* @__PURE__ */ jsxs10("span", { children: [
              "Pole ",
              hasFoundationCostSnapshot(pole.pole_cost) ? money(pole.pole_cost) : "Not saved"
            ] }),
            /* @__PURE__ */ jsxs10("span", { children: [
              "Paint ",
              hasFoundationCostSnapshot(pole.pole_painting_cost) ? money(pole.pole_painting_cost) : "Not saved"
            ] }),
            /* @__PURE__ */ jsx18("span", { className: "font-bold text-gray-900 text-sm", children: hasFoundationCostSnapshot(pole.total_cost) ? money(pole.total_cost) : "Not saved" }),
            pricingUnavailable && /* @__PURE__ */ jsx18("span", { className: "col-span-full text-[10px] text-amber-700", children: "Saved amounts (not current pricing)" }),
            /* @__PURE__ */ jsx18(Button, { variant: "ghost", size: "icon", onClick: () => removePole(index), children: /* @__PURE__ */ jsx18(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
          ] })
        ] }),
        issues.length > 0 && /* @__PURE__ */ jsx18("div", { role: "status", className: "mt-2 text-[10px] text-amber-700 space-y-0.5", id: `pole-${index}-pricing`, children: issues.map((issue) => /* @__PURE__ */ jsx18("p", { children: issue.message }, `${issue.field}-${issue.code}`)) })
      ] }, pole.component_id || index);
    })
  ] });
}

// s:s://@/components/estimator/foundation/FoundationToolbar
import { jsx as jsx19 } from "react/jsx-runtime";
var FoundationToolbar_default = () => /* @__PURE__ */ jsx19("div", { "data-stub": "Toolbar" });

// s:s://@/components/estimator/foundation/FoundationSectionBanner
import { jsx as jsx20 } from "react/jsx-runtime";
var FoundationSectionBanner_default = () => /* @__PURE__ */ jsx20("div", {});

// s:s://@/components/estimator/foundation/AiEngineeringAssistant
import { jsx as jsx21 } from "react/jsx-runtime";
var AiEngineeringAssistant_default = () => /* @__PURE__ */ jsx21("div", {});

// s:s://@/components/estimator/foundation/Foundation3DPreview
import { jsx as jsx22 } from "react/jsx-runtime";
var Foundation3DPreview_default = (p) => {
  globalThis.__seenProject = p.project;
  return /* @__PURE__ */ jsx22("div", {});
};

// s:s://@/components/estimator/foundation/FoundationTemplateDialog
var FoundationTemplateDialog_default = () => null;

// s:s://@/components/estimator/foundation/FoundationLayoutCanvas
import { jsx as jsx23 } from "react/jsx-runtime";
var FoundationLayoutCanvas_default = () => /* @__PURE__ */ jsx23("div", {});

// s:s://@/components/estimator/foundation/SignageCabinetsPanel
import { jsx as jsx24 } from "react/jsx-runtime";
var SignageCabinetsPanel_default = () => /* @__PURE__ */ jsx24("div", {});

// s:s://@/components/estimator/foundation/LandscapeDesigner
import { jsx as jsx25 } from "react/jsx-runtime";
var LandscapeDesigner_default = () => /* @__PURE__ */ jsx25("div", {});

// s:s://@/components/estimator/foundation/CustomerPricingPanel
import { jsx as jsx26 } from "react/jsx-runtime";
var CustomerPricingPanel_default = () => /* @__PURE__ */ jsx26("div", { "data-stub": "CustomerPricingPanel" });

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx27 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx27("div", { "data-stub": "CustomerPricingTab" });

// s:s://@/components/markup/projectCategorizer
function categorizeFoundationProject() {
  return {};
}

// s:s://@/components/markup/savedCustomerPricing
async function calculateSavedCustomerPricing(a) {
  globalThis.__spies.push(["pricing", a]);
  return { applied: true };
}

// s:s://@/components/estimator/builder/builderService
var recordBuilderSave = async (a) => {
  globalThis.__spies.push(["recordBuilderSave", a]);
  return { module_key: "foundation", project_id: a.line?.project_id || a.sourceId, estimate_id: a.estimateId, updated_date_snapshot: a.sourceProject?.updated_date || "synthetic-v2" };
};

// s:s://@/components/estimator/loadAllEntityRows
async function loadAllEntityRows(a) {
  const rec = { label: a.label, entity: a.entity, query: a.query || null, sort: a.sort || null };
  globalThis.__catalogReads.push(rec);
  if (a.entity === globalThis.__entInv) return globalThis.__invRows || [];
  if (a.entity === globalThis.__entLab) return globalThis.__labRows || [];
  if (a.entity === globalThis.__entSet) return globalThis.__setRows || [];
  return [];
}

// s:s://@/components/estimator/estimateMutationGuard
async function assertEstimateProductMutationAllowed() {
}

// s:s://@/components/staff/staffEntities
var staffEntities = { FoundationProject: { get: async (id) => {
  globalThis.__spies.push(["projectGet", id]);
  return globalThis.__project;
}, update: async () => {
  globalThis.__unexpectedSdk++;
  throw Error("FoundationProject.update not permitted in settings proof");
}, updateMany: async (query, patch) => {
  globalThis.__spies.push(["saveSource", { query, patch }]);
  const p = globalThis.__project;
  if (p && p.id === query?.id && p.updated_date === query?.updated_date) {
    globalThis.__project = { ...p, ...patch?.$set || {}, id: query.id, updated_date: globalThis.__savedVersion };
    return { updated: 1 };
  }
  return { updated: 0 };
} }, FoundationInventory: globalThis.__entInv || (globalThis.__entInv = { __ent: "inv" }), LaborServiceInventory: globalThis.__entLab || (globalThis.__entLab = { __ent: "lab" }), Settings: globalThis.__entSet || (globalThis.__entSet = { __ent: "set" }), AllInOneEstimate: { get: async (id) => {
  globalThis.__spies.push(["estimateGet", id]);
  return globalThis.__estimates?.[id] ?? globalThis.__estimate;
}, update: async () => {
  globalThis.__unexpectedSdk++;
  throw Error("AllInOneEstimate.update not permitted in settings proof");
}, updateMany: async () => {
  globalThis.__unexpectedSdk++;
  throw Error("AllInOneEstimate.updateMany not permitted in settings proof");
} } };

// frozen:/app/src/components/estimator/builder/sourceProjectPersistence.js
var cleanString = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString(a) === cleanString(b);
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function sourcePatchMatches(record, patch) {
  if (!record || !patch) return false;
  return Object.entries(patch).every(([key, value]) => sameValue(record?.[key], value));
}
async function preflightBuilderSourceMutation({ estimateId = "" } = {}) {
  if (!estimateId) return null;
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (!estimate?.id) throw new Error("Estimate could not be verified before saving this Builder source.");
  await assertEstimateProductMutationAllowed(estimate);
  return estimate;
}
async function updateBuilderSourceProject({
  entity: entity2,
  sourceId,
  expectedUpdatedAt,
  data,
  estimateId = "",
  label = "Builder source project"
}) {
  if (!entity2?.updateMany || !entity2?.get || !sourceId) {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  const expected = String(expectedUpdatedAt || "").trim();
  if (!expected) {
    throw new Error(`${label} is missing its loaded version. Reload it before saving.`);
  }
  await preflightBuilderSourceMutation({ estimateId });
  const verified = (record) => !!record && record.id === sourceId && typeof record.updated_date === "string" && record.updated_date.length > 0 && sourcePatchMatches(record, data);
  const conflict = () => new Error(`${label} changed in another session. Reload it before saving.`);
  let result;
  try {
    result = await entity2.updateMany(
      { id: sourceId, updated_date: expected },
      { $set: data }
    );
  } catch (error) {
    const current2 = await entity2.get(sourceId).catch(() => null);
    if (verified(current2)) return current2;
    throw error;
  }
  if (!result || !Number.isInteger(result.updated) || result.updated !== 0 && result.updated !== 1) {
    throw new Error(`${label} conditional-update result could not be verified.`);
  }
  if (result.updated === 1) {
    const saved = await entity2.get(sourceId).catch(() => null);
    if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
    if (!verified(saved)) throw conflict();
    return saved;
  }
  const current = await entity2.get(sourceId).catch(() => null);
  if (verified(current)) {
    return current;
  }
  throw conflict();
}

// s:s://@/api/base44Client
var fail = () => {
  globalThis.__unexpectedSdk++;
  throw Error("Unexpected SDK access in the settings page proof");
};
var entity = new Proxy({}, { get: () => fail });
var base44 = { functions: { invoke: fail }, entities: new Proxy({}, { get: () => entity }) };

// frozen:/app/src/components/estimator/builder/builderMutationRecovery.js
function pendingBuilderMutation(line) {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && String(pending.key || "").trim() ? pending : null;
}
var STALE_PENDING_BUILDER_MUTATION_MS = 24 * 60 * 60 * 1e3;

// frozen:/app/src/components/estimator/foundation/foundationSyncRecovery.js
var MAX_ID = 200;
var MAX_TS = 64;
var bounded = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
function createFoundationSyncAttempt({ sourceId, estimateId, key, requestedAt }) {
  if (!bounded(sourceId, MAX_ID)) throw new Error("A source project id is required for a sync attempt.");
  if (!bounded(estimateId, MAX_ID)) throw new Error("An estimate id is required for a sync attempt.");
  if (!bounded(key, MAX_ID)) throw new Error("A sync attempt key is required.");
  if (!bounded(requestedAt, MAX_TS) || !ISO_RE.test(requestedAt) || Number.isNaN(Date.parse(requestedAt))) throw new Error("A sync attempt needs a valid ISO timestamp.");
  return { schema_version: 1, key, source_project_id: sourceId, estimate_id: estimateId, requested_at: requestedAt };
}
var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
function validateFoundationSyncAttempt(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  if (a.schema_version !== 1) return false;
  return bounded(a.key, MAX_ID) && bounded(a.source_project_id, MAX_ID) && bounded(a.estimate_id, MAX_ID) && bounded(a.requested_at, MAX_TS) && ISO_RE.test(a.requested_at) && !Number.isNaN(Date.parse(a.requested_at));
}
var attemptShapeOk = validateFoundationSyncAttempt;
var foundationLine = (estimate, sourceId) => {
  const items = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  return items.find((i) => i && i.module_key === "foundation" && i.project_id === sourceId) || null;
};
function foundationSyncRecoveryState({ project, estimateId, estimate }) {
  const attempt = project?.builder_sync_attempt;
  const sourceId = project?.id || "";
  const line = foundationLine(estimate, sourceId);
  const keyedPending = !!(line && line.price_acceptance_pending && line.price_acceptance_pending.key);
  if (attempt === void 0 || attempt === null) {
    return keyedPending ? { status: "pending", message: "A saved Builder sync attempt is still unacknowledged.", attempt: null, line } : { status: "none", message: "", attempt: null, line };
  }
  if (!attemptShapeOk(attempt)) {
    return { status: "unsupported", message: "An unrecognised Builder sync receipt was found and left untouched.", attempt, line };
  }
  if (attempt.source_project_id !== sourceId || !estimateId || attempt.estimate_id !== estimateId || !estimate || estimate.id !== estimateId) {
    return { status: "mismatch", message: "This project's sync receipt belongs to a different estimate context.", attempt, line };
  }
  if (typeof project.updated_date === "string" && project.updated_date && line && line.updated_date_snapshot === project.updated_date && !keyedPending) {
    return { status: "acknowledged", message: "", attempt, line };
  }
  return { status: "pending", message: "A saved Builder sync attempt is still unacknowledged.", attempt, line };
}
function assertFoundationBuilderAcknowledgment({ sourceProject, estimateId, line }) {
  if (!bounded(estimateId, MAX_ID) || !bounded(sourceProject?.id, MAX_ID)) {
    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");
  }
  const ok = !!line && typeof line === "object" && !Array.isArray(line) && line.module_key === "foundation" && line.project_id === sourceProject?.id && typeof sourceProject?.updated_date === "string" && sourceProject.updated_date && line.updated_date_snapshot === sourceProject.updated_date && !(line.price_acceptance_pending && line.price_acceptance_pending.key) && (!estimateId || !line.estimate_id || line.estimate_id === estimateId);
  if (!ok) {
    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");
  }
}

// frozen:/app/src/components/estimator/foundation/foundationBuilderRecovery.js
async function verifyFoundationRecoverySource({ sourceId, expectedSourceVersion }) {
  const saved = await staffEntities.FoundationProject.get(sourceId);
  if (saved?.id !== sourceId || !expectedSourceVersion || saved.updated_date !== expectedSourceVersion) {
    throw new Error("The Foundation project changed in another session. Reload it before recovering this Builder synchronization.");
  }
  return saved;
}
async function loadFoundationBuilderRecovery({ sourceId, estimateId, expectedSourceVersion }) {
  if (!estimateId) return null;
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (estimate?.id !== estimateId) throw new Error("The linked estimate could not be verified before Builder recovery.");
  const line = (estimate.line_items || []).find((item) => item.module_key === "foundation" && item.project_id === sourceId);
  const pending = pendingBuilderMutation(line);
  if (!pending) return null;
  if (!line.builder_product_id || typeof pending.key !== "string" || pending.estimate_id !== estimateId || pending.builder_product_id !== line.builder_product_id || pending.estimate_line_id && (line.line_id || pending.line_patch?.line_id) && pending.estimate_line_id !== (line.line_id || pending.line_patch?.line_id)) {
    throw new Error("The pending Builder operation does not match this Foundation Product. Review it in the linked estimate.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  const sourceProject = await verifyFoundationRecoverySource({ sourceId, expectedSourceVersion });
  const receipt = sourceProject.builder_sync_attempt;
  if (receipt != null && (!validateFoundationSyncAttempt(receipt) || receipt.source_project_id !== sourceId || receipt.estimate_id !== estimateId)) {
    throw new Error("The saved Foundation sync receipt does not match this estimate. Reload and review it before recovery.");
  }
  const operationSourceVersion = pending.line_patch?.updated_date_snapshot || line.updated_date_snapshot;
  if (!operationSourceVersion || operationSourceVersion !== sourceProject.updated_date) {
    throw new Error("This Builder operation belongs to a different Foundation source revision. Reload and review it before recovery.");
  }
  return { sourceProject, pendingKey: pending.key };
}

// frozen:/app/src/components/estimator/foundation/foundationSaveSession.js
var CONFLICT_RE = /409|conflict|changed by another|changed in another session/i;
function classify(error) {
  const msg = String(error && (error.message || error) || "");
  if (CONFLICT_RE.test(msg) || error?.status === 409 || error?.code === 409) return "conflict";
  return "failed";
}
function createFoundationSaveSession() {
  let inFlight = null;
  const run = ({ sourceId, editRevision, getCurrent, saveSource, syncBuilder }) => {
    if (inFlight) return inFlight;
    const attempt = Promise.resolve().then(async () => {
      const warnings = [];
      const base = { sourceId, sourceVersion: null, savedEditRevision: editRevision, sourceSaved: false, builderSync: "not_required", error: null, warnings };
      const isCurrent = () => {
        try {
          const c = getCurrent() || {};
          return c.sourceId === sourceId && c.editRevision === editRevision && c.loaded === true;
        } catch {
          return false;
        }
      };
      if (!isCurrent()) return { ...base, status: "superseded" };
      let savedProject;
      try {
        savedProject = await saveSource();
      } catch (error) {
        return { ...base, status: isCurrent() ? classify(error) : "superseded", error };
      }
      if (!savedProject || savedProject.id !== sourceId || typeof savedProject.updated_date !== "string" || !savedProject.updated_date) {
        const error = new Error("Source save returned an unverified record.");
        return { ...base, status: isCurrent() ? classify(error) : "superseded", error };
      }
      base.sourceSaved = true;
      base.sourceVersion = savedProject.updated_date;
      if (!isCurrent()) {
        return { ...base, status: "superseded", builderSync: syncBuilder ? "pending" : "not_required" };
      }
      if (syncBuilder) {
        try {
          await syncBuilder(savedProject);
          base.builderSync = "synced";
        } catch (error) {
          base.builderSync = "pending";
          base.error = error;
          warnings.push("builder_sync_failed");
          return { ...base, status: isCurrent() ? "partial" : "superseded" };
        }
      }
      return { ...base, status: isCurrent() ? "saved" : "superseded" };
    });
    const shared = attempt.finally(() => {
      if (inFlight === shared) inFlight = null;
    });
    inFlight = shared;
    return shared;
  };
  return { run, isSaving: () => inFlight !== null };
}

// frozen:/app/src/components/estimator/foundation/foundationDraftRecovery.js
var FOUNDATION_DRAFT_FIELDS = [
  "project_name",
  "notes",
  "assembly_schema_version",
  "items",
  "walls",
  "poles",
  "wall_caps",
  "signage_cabinets",
  "selected_equipment",
  "landscape",
  "project_concrete_type",
  "project_concrete_admixtures",
  "excavation_method",
  "selected_concrete_id",
  "ai_engineering_recommendation",
  "ai_engineering_data",
  "concrete_cost_per_cy",
  "rebar_cost_per_ft",
  "forming_materials_cost_spread_foot",
  "forming_materials_cost_pillar",
  "min_excavation_time_hours",
  "hand_dig_excavation_cost_per_cy",
  "equipment_excavation_cost_per_cy",
  "forming_labor_rate",
  "pouring_labor_rate",
  "finishing_labor_rate",
  "hand_dig_labor_rate",
  "equipment_excavation_labor_rate"
];
var KEY_PREFIX = "ccs:foundation-draft:v1:";
var MAX_CHARS = 1e6;
var ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets", "selected_equipment"];
var validId = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 256;
var isPlain = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
var keyFor = (ownerId, sourceId, estimateId) => KEY_PREFIX + encodeURIComponent(JSON.stringify([ownerId, sourceId, estimateId ?? null]));
var cloneChecked = (value, seen = /* @__PURE__ */ new Set(), inArray = false) => {
  if (value === void 0) {
    if (inArray) throw new Error("Undefined array entry in draft data.");
    return void 0;
  }
  if (value === null) return null;
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in draft data.");
    return value;
  }
  if (t === "string" || t === "boolean") return value;
  if (t !== "object") throw new Error(`Unsupported draft value type: ${t}`);
  if (seen.has(value)) throw new Error("Cycle in draft data.");
  if (Array.isArray(value)) {
    seen.add(value);
    const out = Array.from(value, (v) => cloneChecked(v, seen, true));
    seen.delete(value);
    return out;
  }
  if (!isPlain(value)) throw new Error("Non-plain object in draft data (Date/Map/class instance not supported).");
  seen.add(value);
  const entries = [];
  for (const [k, v] of Object.entries(value)) {
    const c = cloneChecked(v, seen, false);
    if (c !== void 0) entries.push([k, c]);
  }
  seen.delete(value);
  return Object.fromEntries(entries);
};
var checkAssembly = (data) => {
  for (const f of ASSEMBLY_ARRAYS) {
    if (f in data && !Array.isArray(data[f])) return `${f} must be an array.`;
    if (Array.isArray(data[f])) {
      for (const r of data[f]) if (!isPlain(r)) return `${f} must contain plain records.`;
    }
  }
  if (data.assembly_schema_version !== void 0 && data.assembly_schema_version !== 1)
    return `Unsupported assembly_schema_version: ${data.assembly_schema_version}`;
  return null;
};
var pickDraft = (project) => {
  const entries = [];
  for (const field of FOUNDATION_DRAFT_FIELDS) {
    if (!Object.hasOwn(project, field)) continue;
    const v = cloneChecked(project[field]);
    if (v !== void 0) entries.push([field, v]);
  }
  return Object.fromEntries(entries);
};
var validEnvelope = (raw, ownerId, sourceId, estimateId) => {
  let env;
  try {
    env = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Stored draft is not valid JSON." };
  }
  if (!isPlain(env)) return { ok: false, message: "Stored draft is not a record." };
  if (env.version !== 1) return { ok: false, message: "Unsupported draft version." };
  if (env.ownerId !== ownerId || env.sourceId !== sourceId || (env.estimateId ?? null) !== (estimateId ?? null))
    return { ok: false, message: "Stored draft context does not match." };
  if (!validId(env.token)) return { ok: false, message: "Missing draft token." };
  if (!validId(env.baseUpdatedAt)) return { ok: false, message: "Missing base revision." };
  if (typeof env.savedAt !== "string" || !Number.isFinite(Date.parse(env.savedAt))) return { ok: false, message: "Invalid savedAt timestamp." };
  if (!isPlain(env.data)) return { ok: false, message: "Draft data missing." };
  const bad = checkAssembly(env.data);
  if (bad) return { ok: false, message: bad };
  let data;
  try {
    data = pickDraft(env.data);
  } catch (e) {
    return { ok: false, message: String(e.message || e) };
  }
  return { ok: true, env, data };
};
function createFoundationDraftStore({ getStorage, ownerId, sourceId, estimateId = null }) {
  const unavailable = (msg) => ({ status: "unavailable", message: msg });
  const noAccess = () => ({ read: () => unavailable("No valid draft identity for this owner/source."), write: () => unavailable("No valid draft identity for this owner/source."), clear: () => unavailable("No valid draft identity for this owner/source.") });
  if (typeof getStorage !== "function") return noAccess();
  if (!validId(ownerId) || !validId(sourceId) || estimateId !== null && !validId(estimateId)) return noAccess();
  const key = keyFor(ownerId, sourceId, estimateId);
  const storage = () => {
    try {
      const s = getStorage();
      if (!s || typeof s.getItem !== "function" || typeof s.setItem !== "function" || typeof s.removeItem !== "function")
        return { __err: "Storage provider returned no session storage." };
      return s;
    } catch (e) {
      return { __err: String(e.message || e) };
    }
  };
  const getItem = (s) => {
    try {
      return { raw: s.getItem(key) };
    } catch (e) {
      return { err: `Draft read failed: ${e.message || e}` };
    }
  };
  const read = () => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    const got = getItem(s);
    if (got.err) return unavailable(got.err);
    if (got.raw === null || got.raw === void 0) return { status: "empty" };
    if (got.raw.length > MAX_CHARS) return { status: "invalid", revision: got.raw, message: "Stored draft exceeds size limit." };
    const v = validEnvelope(got.raw, ownerId, sourceId, estimateId);
    if (!v.ok) return { status: "invalid", revision: got.raw, message: v.message };
    return { status: "found", revision: got.raw, draft: v.data, savedAt: v.env.savedAt, baseUpdatedAt: v.env.baseUpdatedAt, token: v.env.token };
  };
  const write = ({ project, baseUpdatedAt, token, savedAt, expectedRevision }) => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    try {
      if (!isPlain(project)) return { status: "invalid", message: "Draft needs a plain project record." };
      if (project.id !== sourceId) return { status: "invalid", message: `Draft project.id must equal sourceId (${sourceId}).` };
      if (!validId(token)) return { status: "invalid", message: "Draft token must be a nonempty string." };
      if (!validId(baseUpdatedAt)) return { status: "invalid", message: "baseUpdatedAt must be a nonempty string." };
      if (typeof savedAt !== "string" || !Number.isFinite(Date.parse(savedAt))) return { status: "invalid", message: "savedAt must be a valid ISO timestamp string." };
      const data = pickDraft(project);
      const bad = checkAssembly(data);
      if (bad) return { status: "invalid", message: bad };
      const envelope = { version: 1, ownerId, sourceId, estimateId: estimateId ?? null, token, baseUpdatedAt, savedAt, data };
      const serialized = JSON.stringify(envelope);
      if (serialized.length > MAX_CHARS) return { status: "invalid", message: "Draft exceeds 1,000,000 character limit; previous draft retained." };
      const got = getItem(s);
      if (got.err) return unavailable(got.err);
      if ((got.raw ?? null) !== (expectedRevision ?? null))
        return { status: "conflict", revision: got.raw ?? void 0, message: "Draft changed since expected revision; existing draft retained." };
      try {
        s.setItem(key, serialized);
      } catch (e) {
        return unavailable(`Draft write failed: ${e.message || e}`);
      }
      return { status: "stored", revision: serialized, draft: data };
    } catch (e) {
      return { status: "invalid", message: String(e.message || e) };
    }
  };
  const clear = (expectedRevision) => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    const got = getItem(s);
    if (got.err) return unavailable(got.err);
    if (got.raw === null || got.raw === void 0) return { status: "removed" };
    if (got.raw !== expectedRevision) return { status: "retained", message: "Draft changed since expected revision; retained." };
    try {
      s.removeItem(key);
    } catch (e) {
      return unavailable(`Draft clear failed: ${e.message || e}`);
    }
    return { status: "removed" };
  };
  return { read, write, clear };
}

// s:s://@/components/auth/EmailGate
var useAuth = () => ({ currentUser: { id: "synthetic-staff" } });

// frozen:/app/src/components/estimator/foundation/foundationAssemblyModel.js
var ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var ID_MAX = 200;
var MAX_COLLISIONS = 8;
var UNRESOLVED_PREFIX = "unresolved:";
var UNRESOLVED = {
  foundation: `${UNRESOLVED_PREFIX}legacy-foundation`,
  pole: `${UNRESOLVED_PREFIX}legacy-pole`,
  wall: `${UNRESOLVED_PREFIX}legacy-wall`,
  segment: `${UNRESOLVED_PREFIX}legacy-segment`
};
var isRecord2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var isId = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= ID_MAX;
var isReserved = (v) => typeof v === "string" && v.startsWith(UNRESOLVED_PREFIX);
var isUnresolvedToken = (v) => Object.values(UNRESOLVED).includes(v);
var deepClone = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var cloneRawValue = (v) => {
  try {
    return deepClone(v);
  } catch {
    return v;
  }
};
var cloneNode = (n) => isRecord2(n) ? { ...n } : n;
var fin2 = (v) => typeof v === "number" && Number.isFinite(v);
var segEndpoints = (shape, i) => {
  const pts = shape?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const closed = shape?.closed === true && pts.length >= 3;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  if (i >= pts.length || !closed && i >= pts.length - 1) return null;
  if (!fin2(a?.x) || !fin2(a?.z) || !fin2(b?.x) || !fin2(b?.z)) return null;
  return `${a.x},${a.z}->${b.x},${b.z}`;
};
var legacyIndexOf = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v === null || v === void 0) continue;
    if (v === -1) return { explicit: true };
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return { index: v };
    if (typeof v === "string" && /^\d+$/.test(v)) return { index: parseInt(v, 10) };
    return { invalid: v };
  }
  return { absent: true };
};
var collectIds = (project) => {
  const ids = /* @__PURE__ */ new Set();
  const walk = (rows) => (rows || []).forEach((r) => {
    if (isId(r?.component_id)) ids.add(r.component_id);
  });
  ARRAYS.forEach((k) => walk(project?.[k]));
  (project?.walls || []).forEach((w) => walk(w?.shape?.segments));
  (project?.poles || []).forEach((p) => walk(p?.signs));
  return ids;
};
var collectRefs = (project) => {
  const refs = /* @__PURE__ */ new Set();
  const add = (v) => {
    if (isId(v)) refs.add(v);
  };
  (project?.poles || []).forEach((p) => add(p?.foundation_component_id));
  (project?.wall_caps || []).forEach((c) => {
    add(c?.wall_component_id);
    add(c?.segment_component_id);
  });
  (project?.signage_cabinets || []).forEach((c) => {
    add(c?.foundation_component_id);
    add(c?.pole_component_id);
  });
  return refs;
};
var freshId = (createId, kind, used) => {
  for (let i = 0; i < MAX_COLLISIONS; i += 1) {
    const id = createId(kind);
    if (isId(id) && !isReserved(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`foundation assembly: could not mint a unique component id for ${kind}`);
};
var validateRef = (v, kind) => {
  if (v === void 0 || v === null) return;
  if (typeof v !== "string" || v !== "" && !isId(v) && !isUnresolvedToken(v)) {
    throw new Error(`foundation assembly: invalid ${kind} reference value`);
  }
};
var ensureNodeId = (row, createId, kind, used, seen) => {
  if (!isRecord2(row)) throw new Error(`foundation assembly: ${kind} row must be a record`);
  const n = cloneNode(row);
  const existing = n.component_id;
  if (existing !== void 0 && existing !== null) {
    if (!isId(existing) || isReserved(existing)) throw new Error(`foundation assembly: invalid component_id on ${kind} row`);
    if (seen.has(existing)) throw new Error(`foundation assembly: duplicate component_id "${existing}"`);
    seen.add(existing);
    used.add(existing);
  } else {
    const id = freshId(createId, kind, used);
    n.component_id = id;
    seen.add(id);
  }
  return n;
};
var reserve = (project, previous, used) => {
  const check = (v) => {
    if (typeof v === "string" && v.length > 0) used.add(v);
  };
  for (const src of [previous || {}, project || {}]) {
    collectIds(src).forEach((id) => used.add(id));
    collectRefs(src).forEach((id) => used.add(id));
    const kinds = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
    for (const k of kinds) for (const r of src?.[k] || []) {
      if (!isRecord2(r)) throw new Error(`foundation assembly: ${k} row must be a record`);
      for (const [f, kind] of [["foundation_component_id", "foundation"], ["pole_component_id", "pole"], ["wall_component_id", "wall"], ["segment_component_id", "segment"]]) validateRef(r[f], kind);
    }
    for (const w of src?.walls || []) for (const s of w?.shape?.segments || []) check(s?.component_id);
    for (const p of src?.poles || []) for (const s of p?.signs || []) check(s?.component_id);
  }
};
var rebuildIndex = (canon, parents) => {
  if (canon === "" || canon === void 0 || isUnresolvedToken(canon)) return void 0;
  const i = (parents || []).findIndex((p) => p?.component_id === canon);
  return i >= 0 ? i : void 0;
};
var resolveParent = (canonValue, hasCanon, legacy, incoming, prev, unresolvedToken) => {
  if (hasCanon) {
    if (canonValue === void 0 || canonValue === null) return { canon: "", index: void 0 };
    if (canonValue === "") return { canon: "", index: void 0 };
    if (isUnresolvedToken(canonValue)) return { canon: canonValue, index: void 0, dangling: true, token: true };
    const found = (incoming || []).some((p) => p?.component_id === canonValue);
    return { canon: canonValue, index: found ? rebuildIndex(canonValue, incoming) : void 0, dangling: !found };
  }
  if (legacy.index !== void 0) {
    let canon;
    if (prev) canon = prev[legacy.index]?.component_id;
    else canon = incoming?.[legacy.index]?.component_id;
    if (isId(canon) && (incoming || []).some((p) => p?.component_id === canon)) {
      return { canon, index: rebuildIndex(canon, incoming) };
    }
    if (isId(canon)) return { canon: unresolvedToken, index: void 0, dangling: true, token: true };
    return { canon: unresolvedToken, index: void 0, dangling: true, token: true, outOfRange: true };
  }
  if (legacy.invalid !== void 0) return { canon: unresolvedToken, index: void 0, dangling: true, token: true, invalid: legacy.invalid };
  if (legacy.explicit) return { canon: "", index: void 0 };
  return { canon: void 0, index: void 0 };
};
var normalizeWalls = (walls, prevWalls, createId, used, seen) => {
  const prevSegIds = /* @__PURE__ */ new Map();
  (prevWalls || []).forEach((w) => {
    const segs = w?.shape?.segments || [];
    segs.forEach((s, i) => {
      const key = segEndpoints(w?.shape, i);
      if (!isId(s?.component_id) || !key) return;
      const k = `${w.component_id}|${key}`;
      if (prevSegIds.has(k)) prevSegIds.set(k, null);
      else prevSegIds.set(k, s.component_id);
    });
  });
  const out = [];
  for (const w of walls || []) {
    const n = ensureNodeId(w, createId, "wall", used, seen);
    const shape = isRecord2(n.shape) ? { ...n.shape } : n.shape;
    const segs = shape?.segments;
    if (segs !== void 0 && !Array.isArray(segs)) throw new Error("foundation assembly: wall shape segments must be an array");
    if (Array.isArray(segs)) {
      for (const s of segs) if (!isRecord2(s)) throw new Error("foundation assembly: wall shape segments must be records");
      const incomingCount = /* @__PURE__ */ new Map();
      segs.forEach((s, i) => {
        const key = segEndpoints(shape, i);
        if (key) incomingCount.set(key, (incomingCount.get(key) || 0) + 1);
      });
      const priorCount = /* @__PURE__ */ new Map();
      (prevWalls || []).forEach((w2) => {
        (w2?.shape?.segments || []).forEach((s2, i) => {
          const key = segEndpoints(w2?.shape, i);
          if (w2?.component_id === n.component_id && key) priorCount.set(key, (priorCount.get(key) || 0) + 1);
        });
      });
      shape.segments = segs.map((s, i) => {
        const prior = s.component_id;
        if (prior !== void 0 && prior !== null) return ensureNodeId(s, createId, "wall_segment", used, seen);
        const key = segEndpoints(shape, i);
        const kept = key && incomingCount.get(key) === 1 && priorCount.get(key) === 1 ? prevSegIds.get(`${n.component_id}|${key}`) : void 0;
        if (kept && !seen.has(kept)) {
          const sn = cloneNode(s);
          sn.component_id = kept;
          seen.add(kept);
          used.add(kept);
          return sn;
        }
        return ensureNodeId(s, createId, "wall_segment", used, seen);
      });
    }
    n.shape = shape;
    out.push(n);
  }
  return out;
};
var normalizePoles = (poles, items, prevItems, createId, used, seen) => (poles || []).map((p) => {
  const n = ensureNodeId(p, createId, "pole", used, seen);
  const legacy = legacyIndexOf(p, ["foundation_idx"]);
  const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(p, "foundation_component_id"), legacy, items, prevItems, UNRESOLVED.foundation);
  n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
  n.foundation_idx = res.index;
  const signs = p?.signs;
  if (signs !== void 0 && !Array.isArray(signs)) throw new Error("foundation assembly: pole signs must be an array");
  if (Array.isArray(signs)) n.signs = signs.map((s) => ensureNodeId(s, createId, "pole_sign", used, seen));
  return n;
});
var normalizeCaps = (caps, walls, prevWalls, createId, used, seen) => (caps || []).map((c) => {
  const n = ensureNodeId(c, createId, "wall_cap", used, seen);
  const wRes = resolveParent(n.wall_component_id, Object.prototype.hasOwnProperty.call(c, "wall_component_id"), legacyIndexOf(c, ["wall_index"]), walls, prevWalls, UNRESOLVED.wall);
  n.wall_component_id = wRes.canon === void 0 ? "" : wRes.canon;
  n.wall_index = wRes.index;
  const wall = (walls || []).find((w) => w?.component_id === n.wall_component_id);
  const segs = wall?.shape?.segments || [];
  const prevSegs = prevWalls ? prevWalls.find((w) => w?.component_id === n.wall_component_id)?.shape?.segments || [] : null;
  const sRes = resolveParent(n.segment_component_id, Object.prototype.hasOwnProperty.call(c, "segment_component_id"), legacyIndexOf(c, ["segment_index"]), segs, prevSegs, UNRESOLVED.segment);
  n.segment_component_id = sRes.canon === void 0 ? "" : sRes.canon;
  n.segment_index = sRes.index;
  return n;
});
var normalizeCabinets = (cabinets, items, poles, prevItems, prevPoles, createId, used, seen) => (cabinets || []).map((c) => {
  const n = ensureNodeId(c, createId, "signage_cabinet", used, seen);
  const mount = c?.mount;
  if (mount === "pole") {
    const res = resolveParent(n.pole_component_id, Object.prototype.hasOwnProperty.call(c, "pole_component_id"), legacyIndexOf(c, ["pole_index"]), poles, prevPoles, UNRESOLVED.pole);
    n.pole_component_id = res.canon === void 0 ? "" : res.canon;
    n.pole_index = res.index;
    n.foundation_component_id = n.foundation_component_id ?? "";
    n.foundation_index = void 0;
  } else if (mount === "foundation") {
    const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(c, "foundation_component_id"), legacyIndexOf(c, ["foundation_index"]), items, prevItems, UNRESOLVED.foundation);
    n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
    n.foundation_index = res.index;
    n.pole_component_id = n.pole_component_id ?? "";
    n.pole_index = void 0;
  } else {
    n.mount = mount;
    if (n.foundation_component_id === void 0) n.foundation_component_id = "";
    if (n.pole_component_id === void 0) n.pole_component_id = "";
    n.foundation_index = void 0;
    n.pole_index = void 0;
  }
  return n;
});
function normalizeFoundationAssembly(project, { previous = null, createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord2(project)) throw new Error("foundation assembly: project must be a record");
  const ver = project.assembly_schema_version;
  if (ver !== void 0 && ver !== 1) throw new Error(`foundation assembly: unsupported assembly_schema_version ${String(ver)}`);
  const used = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  for (const k of ARRAYS) {
    if (project[k] !== void 0 && !Array.isArray(project[k])) throw new Error(`foundation assembly: ${k} must be an array`);
  }
  reserve(project, previous, used);
  const next = { ...project, assembly_schema_version: 1 };
  next.items = (project.items || []).map((it) => ensureNodeId(it, createId, "item", used, seen));
  next.walls = normalizeWalls(project.walls, previous?.walls, createId, used, seen);
  next.poles = normalizePoles(project.poles, next.items, previous?.items, createId, used, seen);
  next.wall_caps = normalizeCaps(project.wall_caps, next.walls, previous?.walls, createId, used, seen);
  next.signage_cabinets = normalizeCabinets(project.signage_cabinets, next.items, next.poles, previous?.items, previous?.poles, createId, used, seen);
  return { project: next, issues: foundationAssemblyIssues(next) };
}
function foundationAssemblyIssues(project) {
  const issues = [];
  if (!isRecord2(project)) return issues;
  const items = project.items || [];
  const walls = project.walls || [];
  const poles = project.poles || [];
  const byId = (arr, id) => isId(id) && (arr || []).some((p) => p?.component_id === id);
  for (const p of poles) {
    const canon = p?.foundation_component_id;
    if (canon === "" || canon === void 0 || canon === null) continue;
    if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole legacy foundation index could not be resolved; left unresolved until reassigned." });
    else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole references a foundation that is not present; it stays priced until reassigned." });
  }
  for (const c of project.wall_caps || []) {
    const wId = c?.wall_component_id;
    if (wId === "" || wId === void 0 || wId === null) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall assigned; it stays priced until assigned." });
    else if (isReserved(wId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap wall could not be resolved; left unresolved until reassigned." });
    else if (!byId(walls, wId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap references a wall that is not present; it stays priced until reassigned." });
    const wall = walls.find((w) => w?.component_id === wId);
    const segs = wall?.shape?.segments || [];
    const sId = c?.segment_component_id;
    if (sId === "" || sId === void 0 || sId === null) {
      if (wall) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall segment assigned; it stays priced until assigned." });
    } else if (isReserved(sId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap segment could not be resolved; left unresolved until reassigned." });
    else if (!byId(segs, sId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap references a wall segment that is not present; it stays priced until reassigned." });
  }
  for (const c of project.signage_cabinets || []) {
    if (c?.mount === "pole") {
      const canon = c?.pole_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet pole could not be resolved; left unresolved until reassigned." });
      else if (!byId(poles, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a pole that is not present; it stays priced until reassigned." });
    } else if (c?.mount === "foundation") {
      const canon = c?.foundation_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet foundation could not be resolved; left unresolved until reassigned." });
      else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a foundation that is not present; it stays priced until reassigned." });
    } else {
      issues.push({ code: "unsupported-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet mount is not supported; it stays priced and visible until reassigned." });
    }
  }
  return issues;
}
function cloneFoundationComponents(project, { createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord2(project)) throw new Error("foundation assembly: project must be a record");
  const rawWallSegments = /* @__PURE__ */ new Map();
  const wallsForNormalize = (Array.isArray(project.walls) ? project.walls : []).map((w, i) => {
    if (!isRecord2(w) || !isRecord2(w.shape)) return w;
    const segs = w.shape.segments;
    if (segs === void 0 || Array.isArray(segs)) return w;
    rawWallSegments.set(i, segs);
    const shape = { ...w.shape };
    delete shape.segments;
    return { ...w, shape };
  });
  const { project: normalized } = normalizeFoundationAssembly(
    rawWallSegments.size ? { ...project, walls: wallsForNormalize } : project,
    { createId }
  );
  const used = /* @__PURE__ */ new Set([...collectIds(normalized), ...collectRefs(normalized)]);
  const idMap = /* @__PURE__ */ new Map();
  const remap = (oldId, kind) => {
    if (!isId(oldId) || isReserved(oldId)) return oldId;
    if (idMap.has(oldId)) return idMap.get(oldId);
    const id = freshId(createId, kind, used);
    idMap.set(oldId, id);
    return id;
  };
  const components = { assembly_schema_version: 1 };
  const copyRows = (rows, kind) => (rows || []).map((r) => {
    const n = deepClone(r);
    n.component_id = remap(n.component_id, kind);
    return n;
  });
  if (project.items !== void 0) components.items = copyRows(normalized.items, "item");
  if (project.walls !== void 0) {
    components.walls = copyRows(normalized.walls, "wall").map((w, i) => ({
      ...w,
      shape: isRecord2(w.shape) ? {
        ...w.shape,
        segments: rawWallSegments.has(i) ? cloneRawValue(rawWallSegments.get(i)) : Array.isArray(w.shape.segments) ? w.shape.segments.map((s) => ({ ...s, component_id: remap(s.component_id, "wall_segment") })) : w.shape.segments || []
      } : w.shape
    }));
  }
  if (project.poles !== void 0) {
    components.poles = copyRows(normalized.poles, "pole").map((p) => ({
      ...p,
      foundation_component_id: isId(p.foundation_component_id) && idMap.has(p.foundation_component_id) ? idMap.get(p.foundation_component_id) : p.foundation_component_id,
      signs: (p.signs || []).map((s) => ({ ...s, component_id: remap(s.component_id, "pole_sign") }))
    }));
  }
  if (project.wall_caps !== void 0) {
    components.wall_caps = copyRows(normalized.wall_caps, "wall_cap").map((c) => ({
      ...c,
      wall_component_id: isId(c.wall_component_id) && idMap.has(c.wall_component_id) ? idMap.get(c.wall_component_id) : c.wall_component_id,
      segment_component_id: isId(c.segment_component_id) && idMap.has(c.segment_component_id) ? idMap.get(c.segment_component_id) : c.segment_component_id
    }));
  }
  if (project.signage_cabinets !== void 0) {
    components.signage_cabinets = copyRows(normalized.signage_cabinets, "signage_cabinet").map((c) => ({
      ...c,
      foundation_component_id: isId(c.foundation_component_id) && idMap.has(c.foundation_component_id) ? idMap.get(c.foundation_component_id) : c.foundation_component_id,
      pole_component_id: isId(c.pole_component_id) && idMap.has(c.pole_component_id) ? idMap.get(c.pole_component_id) : c.pole_component_id
    }));
  }
  const parents = components.items || [];
  const wallRows = components.walls || [];
  const poleRows = components.poles || [];
  (components.poles || []).forEach((p) => {
    p.foundation_idx = rebuildIndex(p.foundation_component_id, parents);
  });
  (components.wall_caps || []).forEach((c) => {
    c.wall_index = rebuildIndex(c.wall_component_id, wallRows);
    const rawSegs = wallRows.find((w) => w?.component_id === c.wall_component_id)?.shape?.segments;
    const segs = Array.isArray(rawSegs) ? rawSegs : [];
    c.segment_index = rebuildIndex(c.segment_component_id, segs);
  });
  (components.signage_cabinets || []).forEach((c) => {
    if (c.mount === "pole") {
      c.pole_index = rebuildIndex(c.pole_component_id, poleRows);
      c.foundation_index = void 0;
    } else {
      c.foundation_index = rebuildIndex(c.foundation_component_id, parents);
      c.pole_index = void 0;
    }
  });
  return { components, idMap };
}

// frozen:/app/src/components/estimator/foundation/foundationTemplateModel.js
var FOUNDATION_TEMPLATE_FIELDS = [
  "items",
  "walls",
  "poles",
  "wall_caps",
  "signage_cabinets",
  "selected_equipment",
  "project_concrete_type",
  "project_concrete_admixtures",
  "excavation_method",
  "selected_concrete_id",
  "landscape",
  "ai_engineering_recommendation",
  "ai_engineering_data",
  "notes"
];
var ASSEMBLY_ARRAYS2 = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var isRecord3 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var deepClone2 = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
var checkTemplateRecord = (data, noun) => {
  if (!isRecord3(data)) throw new Error(`Foundation template ${noun} must be a record.`);
  if (data.assembly_schema_version !== void 0 && data.assembly_schema_version !== 1) {
    throw new Error("Template uses an unsupported assembly version and was not applied.");
  }
};
function prepareFoundationTemplatePatch(data, { createId } = {}) {
  checkTemplateRecord(data, "data");
  if (typeof createId !== "function") throw new Error("Foundation template apply requires a createId factory.");
  const provided = {};
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (data[k] !== void 0) provided[k] = deepClone2(data[k]);
  }
  const arrays = {};
  for (const k of ASSEMBLY_ARRAYS2) if (provided[k] !== void 0) arrays[k] = provided[k];
  const cloned = Object.keys(arrays).length ? cloneFoundationComponents(arrays, { createId }).components : {};
  return { ...provided, ...cloned };
}

// s:s://@/components/estimator/idempotentEntityCreate
var ensureIdempotentEntityCreate = (...a) => {
  globalThis.__spies.push(["ensureIdempotent", a]);
  return Promise.resolve({ id: "new-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1) });
};
var newCreationRequestKey = (k) => "key-" + (k || "x") + "-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);

// s:s://@/components/estimator/foundation/convertToBrickStone
var convertFoundationToBrickStone = async () => {
  globalThis.__spies.push(["converter"]);
  return { id: "d1" };
};

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var createEstimateReadOnlyShareLink = async () => "/share";

// frozen:/app/src/pages/FoundationEstimator.jsx
import { Fragment as Fragment3, jsx as jsx28, jsxs as jsxs11 } from "react/jsx-runtime";
var blankItem = (type) => ({
  // Defaults mirror SignEstimate Pro `newItem()` exactly. CCS still lets the
  // user choose Spread Foot or Pillar at add-time; only the type is overridden.
  foundation_type: type || "spread_foot",
  description: "",
  quantity: 1,
  length_inches: 48,
  width_inches: 48,
  diameter: 24,
  depth_inches: 36,
  grade_offset_inches: 0,
  include_rebar: false,
  include_forming: false,
  include_finishing: false,
  rebar_size: "#4",
  rebar_spacing_length: 12,
  rebar_spacing_width: 12,
  rebar_layers: 1,
  rebar_layer_separation_inches: 12,
  pillar_rebar_size: "#4",
  pillar_rebar_hoop_diameter: 20,
  pillar_rebar_layer_separation_inches: 12,
  pillar_rebar_layers: 1,
  pillar_vertical_rebar_count: 4,
  selected_pole_id: "",
  pole_offset_from_bottom_inches: 0,
  pole_total_height_inches: 0,
  include_pole_painting: false,
  custom_concrete_cost_per_cy: null,
  custom_rebar_cost_per_ft: null,
  excavation_method: "hand_dig",
  selected_concrete_id: "",
  is_new_sign_location: false,
  mortar_gap_inches: 0.375,
  wall_width_inches: 8
});
var TAB_CLASS = "gap-1.5 text-[12px] data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-sm";
function FoundationEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const params = new URLSearchParams(window.location.search);
  const id = embeddedProjectId || params.get("id") || params.get("edit");
  const estimateId = embeddedEstimateId || params.get("estimateId");
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const ownerId = currentUser?.id || null;
  const [project, setProject] = useState3(null);
  const [inventory, setInventory] = useState3([]);
  const [settings, setSettings] = useState3({});
  const [loading, setLoading] = useState3(true);
  const [loadError, setLoadError] = useState3("");
  const [saving, setSaving] = useState3(false);
  const [dirty, setDirty] = useState3(false);
  const [autoSave, setAutoSave] = useState3(false);
  const [history, setHistory] = useState3({ past: [], future: [] });
  const [templateMode, setTemplateMode] = useState3(null);
  const [showHelp, setShowHelp] = useState3(false);
  const saveRef = useRef(null);
  const saveSessionRef = useRef(null);
  if (!saveSessionRef.current) saveSessionRef.current = createFoundationSaveSession();
  const editRevisionRef = useRef(0);
  const acknowledgedVersionRef = useRef(null);
  const currentEditorRef = useRef({ sourceId: null, editRevision: 0, loaded: false });
  const contextKeyRef = useRef(null);
  const contextGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const saveAttemptRef = useRef(null);
  const exitGenerationRef = useRef(-1);
  const loadedOwnerRef = useRef(null);
  const [saveError, setSaveError] = useState3("");
  const [reloadRevision, setReloadRevision] = useState3(0);
  const [linkedEstimate, setLinkedEstimate] = useState3(null);
  const [recoveryRequired, setRecoveryRequired] = useState3(false);
  const contextKey = JSON.stringify([ownerId, id, estimateId, project?.id, reloadRevision]);
  if (contextKeyRef.current !== contextKey) {
    contextKeyRef.current = contextKey;
    editRevisionRef.current += 1;
    contextGenerationRef.current += 1;
    const previousAcknowledgment = acknowledgedVersionRef.current;
    acknowledgedVersionRef.current = project?.id ? {
      sourceId: project.id,
      updated_date: project.updated_date,
      ownerId,
      sourceSnapshot: previousAcknowledgment?.sourceId === project.id && previousAcknowledgment?.ownerId === ownerId ? previousAcknowledgment.sourceSnapshot : null
    } : null;
  }
  const contextLoaded = mountedRef.current && !loading && !loadError && !!project && project.id === id && (!estimateId || linkedEstimate?.id === estimateId) && loadedOwnerRef.current === ownerId;
  currentEditorRef.current = {
    sourceId: contextLoaded ? project.id : null,
    estimateId: estimateId || null,
    generation: contextGenerationRef.current,
    editRevision: editRevisionRef.current,
    loaded: contextLoaded
  };
  const bumpEdit = () => {
    editRevisionRef.current += 1;
    currentEditorRef.current = { ...currentEditorRef.current, editRevision: editRevisionRef.current };
  };
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const copyFlightRef = useRef(null);
  const sourceRefreshRef = useRef(null);
  const sourceWriteEpochRef = useRef(/* @__PURE__ */ new Map());
  const projectRef = useRef(null);
  const swapAttemptRef = useRef({ signature: "", key: "" });
  projectRef.current = contextLoaded ? project : null;
  const draftStore = useMemo2(
    () => createFoundationDraftStore({ getStorage: () => window.sessionStorage, ownerId, sourceId: id, estimateId: estimateId || null }),
    [ownerId, id, estimateId]
  );
  const draftSessionRef = useRef({ store: null, revision: null, pending: false });
  if (draftSessionRef.current.store !== draftStore) draftSessionRef.current = { store: draftStore, revision: null, pending: false };
  const [draftOffer, setDraftOffer] = useState3(null);
  const draftVisible = draftOffer?.store === draftStore ? draftOffer : null;
  useEffect2(() => {
    copyAttemptRef.current = { signature: "", key: "" };
    swapAttemptRef.current = { signature: "", key: "" };
  }, [id]);
  useEffect2(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect2(() => {
    if (!id) {
      setLoading(false);
      setProject(null);
      setLinkedEstimate(null);
      setRecoveryRequired(false);
      setDirty(false);
      setHistory({ past: [], future: [] });
      setSaveError("");
      return;
    }
    let active = true;
    const epochAtStart = sourceWriteEpochRef.current.get(id)?.epoch || 0;
    setLoading(true);
    setLoadError("");
    setSaveError("");
    setDirty(false);
    setHistory({ past: [], future: [] });
    Promise.all([
      staffEntities.FoundationProject.get(id),
      loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
      loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
      loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" }),
      estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
    ]).then(([proj, inv, concreteServices, settingRows, est]) => {
      if (!active) return;
      if (proj?.id !== id || estimateId && est?.id !== estimateId) {
        setProject(proj?.id === id ? proj : null);
        if (estimateId && est?.id !== estimateId) setLoadError("Linked estimate could not be verified.");
        return;
      }
      const epochNow = sourceWriteEpochRef.current.get(proj.id);
      if (epochNow && epochNow.epoch > epochAtStart && proj.updated_date !== epochNow.lastSavedVersion) {
        setReloadRevision((r) => r + 1);
        return;
      }
      setLinkedEstimate(est || null);
      const merged = {
        ...proj,
        excavation_method: proj.excavation_method || "hand_dig",
        project_concrete_type: proj.project_concrete_type || "4000_ae",
        project_concrete_admixtures: proj.project_concrete_admixtures || [],
        items: proj.items || [],
        walls: proj.walls || [],
        poles: proj.poles || [],
        wall_caps: proj.wall_caps || [],
        signage_cabinets: proj.signage_cabinets || [],
        landscape: proj.landscape || { cell_size_inches: 12, cells: {} },
        selected_equipment: proj.selected_equipment || []
      };
      let normalized;
      try {
        normalized = normalizeFoundationAssembly(merged, {
          createId: (kind) => newCreationRequestKey(`foundation_${kind}`)
        }).project;
      } catch (e) {
        setLoadError(e?.message || "Foundation assembly could not be normalized.");
        return;
      }
      if (sourceRefreshRef.current?.sourceId === proj.id) sourceRefreshRef.current = null;
      acknowledgedVersionRef.current = { sourceId: proj.id, updated_date: proj.updated_date, ownerId, sourceSnapshot: normalized };
      loadedOwnerRef.current = ownerId;
      const found = draftStore.read();
      if (found.status === "found" || found.status === "invalid") {
        draftSessionRef.current.revision = found.revision ?? null;
        draftSessionRef.current.pending = true;
        setAutoSave(false);
        setDraftOffer(found.status === "found" ? { store: draftStore, revision: found.revision, draft: found.draft, savedAt: found.savedAt, baseUpdatedAt: found.baseUpdatedAt } : { store: draftStore, revision: found.revision, message: found.message });
      } else if (found.status === "unavailable") {
        draftSessionRef.current.revision = null;
        draftSessionRef.current.pending = false;
        setDraftOffer({ store: draftStore, warning: found.message });
      } else {
        draftSessionRef.current.revision = null;
        draftSessionRef.current.pending = false;
        setDraftOffer(null);
      }
      setProject(normalized);
      projectRef.current = normalized;
      const rec = foundationSyncRecoveryState({ project: merged, estimateId, estimate: est });
      if (["pending", "unsupported", "mismatch"].includes(rec.status)) {
        setRecoveryRequired(true);
        setDirty(true);
      } else {
        setRecoveryRequired(false);
      }
      setInventory([...inv || [], ...(concreteServices || []).map(normalizeConcreteSupplier)]);
      setSettings(
        Object.fromEntries((settingRows || []).map((s) => [s.setting_name, s.setting_value]))
      );
    }).catch((error) => {
      if (!active) return;
      console.error("Foundation Builder prerequisites could not be loaded:", error);
      setLoadError(error?.message || "Foundation Builder prerequisites could not be verified.");
    }).finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, estimateId, reloadRevision, ownerId, draftStore]);
  const savedSourceProject = acknowledgedVersionRef.current?.sourceId === project?.id && acknowledgedVersionRef.current?.ownerId === ownerId ? acknowledgedVersionRef.current?.sourceSnapshot ?? null : null;
  const calc = useMemo2(
    () => project ? calcProject(project, inventory, settings, { savedProject: savedSourceProject }) : null,
    [project, inventory, settings, savedSourceProject]
  );
  const catalogBlocked = Boolean(calc?.catalogIssues?.length);
  const inputIssues = calc?.inputIssues || [];
  const inputBlocked = inputIssues.length > 0;
  const pricingBlocked = catalogBlocked || inputBlocked;
  const [catalogReloading, setCatalogReloading] = useState3(false);
  const catalogReloadRef = useRef(null);
  const handleCatalogReload = async () => {
    if (draftSessionRef.current.pending) return;
    const live = currentEditorRef.current;
    const generation = live.generation;
    const sourceId = live.sourceId;
    const estimateKey = live.estimateId;
    if (!mountedRef.current || !live.loaded || saveAttemptRef.current || copyFlightRef.current || saveSessionRef.current?.isSaving() || catalogReloadRef.current) return;
    const isCurrentFlight = (flight2) => {
      const l = currentEditorRef.current;
      return mountedRef.current && catalogReloadRef.current === flight2 && l.loaded && l.sourceId === sourceId && l.estimateId === estimateKey && l.generation === generation;
    };
    const flight = (async () => {
      const [inv, concreteServices, settingRows] = await Promise.all([
        loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
        loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
        loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" })
      ]);
      if (!isCurrentFlight(flight)) return;
      bumpEdit();
      setInventory([...inv || [], ...(concreteServices || []).map(normalizeConcreteSupplier)]);
      setSettings(Object.fromEntries((settingRows || []).map((r) => [r.setting_name, r.setting_value])));
      setAutoSave(false);
      setDirty(true);
      setSaveError("");
    })();
    catalogReloadRef.current = flight;
    setCatalogReloading(true);
    try {
      await flight;
    } catch (e) {
      if (isCurrentFlight(flight)) setSaveError("Catalog reload failed: " + (e?.message || "unknown error") + " Last known catalog retained; retry.");
    } finally {
      if (catalogReloadRef.current === flight) {
        const current = isCurrentFlight(flight);
        catalogReloadRef.current = null;
        if (current) setCatalogReloading(false);
      }
    }
  };
  useEffect2(() => {
    catalogReloadRef.current = null;
    setCatalogReloading(false);
  }, [id, estimateId, reloadRevision, ownerId]);
  const assemblyIssues = useMemo2(() => project ? foundationAssemblyIssues(project) : [], [project]);
  const catalog = useMemo2(
    () => ({
      concrete: inventory.filter(
        (i) => ["concrete_service", "bagged_concrete"].includes(i.material_type) && i.show_in_foundation !== false
      ),
      poles: inventory.filter((i) => i.material_type === "pole"),
      walls: inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type)),
      fill: inventory.filter((i) => i.material_type === "fill_material"),
      forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
      caps: inventory.filter((i) => i.material_type === "wall_cap"),
      equipment: inventory.filter((i) => i.material_type === "excavation_equipment")
    }),
    [inventory]
  );
  useEffect2(() => {
    if (!autoSave || !dirty || recoveryRequired || pricingBlocked || catalogReloading || catalogReloadRef.current || draftSessionRef.current.pending) return;
    const t = setTimeout(() => saveRef.current?.(), 2e3);
    return () => clearTimeout(t);
  }, [autoSave, dirty, project, recoveryRequired, pricingBlocked, catalogReloading]);
  useEffect2(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) saveRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);
  useEffect2(() => {
    if (!saving && !dirty && !recoveryRequired && !draftSessionRef.current.pending) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, dirty, recoveryRequired, draftOffer]);
  if (loading) return /* @__PURE__ */ jsx28("div", { className: "p-10 text-center text-gray-400", children: "Loading section\u2026" });
  if (loadError) return /* @__PURE__ */ jsxs11("div", { className: "p-10 text-center text-red-700 bg-red-50 border border-red-200 rounded", children: [
    "Foundation Builder unavailable. Required project data, foundation inventory, concrete services, or Settings could not be verified. ",
    loadError
  ] });
  if (!project) return /* @__PURE__ */ jsx28("div", { className: "p-10 text-center text-gray-500", children: "Foundation section not found." });
  const persistBrowserDraft = (next) => {
    const session = draftSessionRef.current;
    if (!session.store || session.store !== draftStore || !mountedRef.current) return;
    const ack = acknowledgedVersionRef.current;
    const base = ack?.sourceId === id && ack?.ownerId === ownerId ? ack.updated_date : null;
    if (!base) {
      setDraftOffer({ store: draftStore, warning: "Latest edits could not be backed up; no saved source to anchor the browser draft." });
      return;
    }
    const result = session.store.write({
      project: next,
      baseUpdatedAt: base,
      token: newCreationRequestKey("foundation_draft"),
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      expectedRevision: session.revision
    });
    if (result.status === "stored") {
      session.revision = result.revision;
      session.pending = false;
      setDraftOffer({ store: draftStore, backedUp: true, message: "Design edits backed up in this browser tab. Pricing/customer details are not included; save to keep all changes." });
    } else if (result.status === "conflict") {
      const latest = session.store.read();
      session.revision = latest.status !== "unavailable" ? latest.revision ?? null : result.revision ?? session.revision;
      session.pending = true;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to merge." });
      } else if (latest.status === "unavailable") setDraftOffer({ store: draftStore, revision: session.revision, message: latest.message || "Draft changed in another tab; could not re-read." });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Draft changed in another tab; review before continuing." });
    } else {
      setDraftOffer({ store: draftStore, warning: `Latest edits could not be backed up; save before leaving. ${result.message || ""}` });
    }
  };
  const commit = (updater, opts = {}) => {
    const live = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live.loaded || live.generation !== saveContext.generation || live.sourceId !== saveContext.sourceId) return false;
    if (draftSessionRef.current.pending && !opts.restoreDraft) return false;
    const prev = projectRef.current ?? project;
    let next;
    try {
      next = normalizeFoundationAssembly(
        { ...prev, ...updater(prev) },
        { previous: prev, createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }
      ).project;
    } catch (e) {
      setSaveError(e?.message || "Foundation assembly update was rejected.");
      return false;
    }
    bumpEdit();
    setHistory((h) => ({ past: [...h.past.slice(-40), prev], future: [] }));
    projectRef.current = next;
    setProject(next);
    setDirty(true);
    if (opts.restoreDraft) draftSessionRef.current.pending = false;
    persistBrowserDraft(next);
    return true;
  };
  const patch = (changes) => commit(() => changes);
  const patchItem = (index, changes) => commit((prev) => ({
    items: prev.items.map((it, i) => i === index ? { ...it, ...changes } : it)
  }));
  const removeItem = (index) => {
    const label = project.items?.[index]?.description || `item ${index + 1}`;
    if (!window.confirm(`Delete "${label}"? Dependent placements are retained for review.`)) return;
    commit((prev) => ({ items: prev.items.filter((_, i) => i !== index) }));
  };
  const duplicateItem = (index) => commit((prev) => {
    const items = [...prev.items];
    items.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(items[index])), component_id: newCreationRequestKey("foundation_item") });
    return { items };
  });
  const addItem = (type) => commit((prev) => ({ items: [...prev.items || [], blankItem(type)] }));
  const restoreBrowserDraft = () => {
    const session = draftSessionRef.current;
    const offer = draftVisible;
    if (!session.store || session.store !== draftStore || !offer?.revision) return;
    const latest = session.store.read();
    if (latest.status !== "found" || latest.revision !== offer.revision) {
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to restore." });
      } else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; nothing restored." });
      return;
    }
    session.revision = latest.revision;
    const baseChanged = latest.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== latest.baseUpdatedAt;
    if ((dirty || baseChanged) && !window.confirm("Restoring the browser draft replaces the current design edits in this editor. Continue?")) return;
    setAutoSave(false);
    if (!commit(() => latest.draft, { restoreDraft: true })) setSaveError("Browser draft could not be applied; offer retained.");
  };
  const discardBrowserDraft = () => {
    const session = draftSessionRef.current;
    const offer = draftVisible;
    if (!session.store || session.store !== draftStore) return;
    if (!window.confirm("Discard the unsent browser draft for this project?")) return;
    const result = session.store.clear(offer?.revision ?? null);
    if (result.status === "removed") {
      session.revision = null;
      session.pending = false;
      setDraftOffer(null);
      if (dirty) persistBrowserDraft(projectRef.current ?? project);
    } else if (result.status === "retained") {
      const latest = session.store.read();
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing kept." });
      } else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be re-read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; kept." });
    } else {
      setDraftOffer({ ...offer, warning: `Browser draft could not be cleared. ${result.message || ""}` });
    }
  };
  const cabinetCost = calc.totals.total_signage_cabinet_cost;
  const landscapeCost = calc.totals.total_landscape_cost;
  const sectionTotal = calc.totals.grand_total === null || cabinetCost === null || landscapeCost === null ? null : calc.totals.grand_total + cabinetCost + landscapeCost;
  const undo = () => {
    const live = currentEditorRef.current;
    if (!history.past.length || !live.loaded || live.generation !== saveContext.generation || draftSessionRef.current.pending) return;
    bumpEdit();
    const prevState = history.past[history.past.length - 1];
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [project, ...h.future] }));
    projectRef.current = prevState;
    setProject(prevState);
    setDirty(true);
    persistBrowserDraft(prevState);
  };
  const redo = () => {
    const live = currentEditorRef.current;
    if (!history.future.length || !live.loaded || live.generation !== saveContext.generation || draftSessionRef.current.pending) return;
    bumpEdit();
    const nextState = history.future[0];
    setHistory((h) => ({ past: [...h.past, project], future: h.future.slice(1) }));
    projectRef.current = nextState;
    setProject(nextState);
    setDirty(true);
    persistBrowserDraft(nextState);
  };
  const payload = () => ({
    project_name: project.project_name,
    notes: project.notes,
    status: "calculated",
    assembly_schema_version: project.assembly_schema_version ?? 1,
    items: calc.items,
    selected_equipment: calc.equipment,
    walls: calc.walls,
    // Persist the calculated snapshots too. SignEstimate Pro stored raw pole/cap
    // placement; CCS keeps those original fields plus their calculated values so
    // a later Builder/BOM sync can preserve the exact accepted cost without
    // requiring a live catalog recalc.
    wall_caps: calc.wallCaps,
    poles: calc.poles,
    signage_cabinets: project.signage_cabinets || [],
    landscape: project.landscape || { cell_size_inches: 12, cells: {} },
    total_signage_cabinet_cost: cabinetCost,
    total_landscape_cost: landscapeCost,
    customer_markup_percent: project.customer_markup_percent || 0,
    customer_price_override: project.customer_price_override,
    customer_pricing: project.customer_pricing,
    excavation_method: project.excavation_method,
    selected_concrete_id: project.selected_concrete_id,
    project_concrete_type: project.project_concrete_type,
    project_concrete_admixtures: project.project_concrete_admixtures || [],
    concrete_cost_per_cy: project.concrete_cost_per_cy,
    rebar_cost_per_ft: project.rebar_cost_per_ft,
    forming_materials_cost_spread_foot: project.forming_materials_cost_spread_foot,
    forming_materials_cost_pillar: project.forming_materials_cost_pillar,
    min_excavation_time_hours: project.min_excavation_time_hours,
    hand_dig_excavation_cost_per_cy: project.hand_dig_excavation_cost_per_cy,
    equipment_excavation_cost_per_cy: project.equipment_excavation_cost_per_cy,
    forming_labor_rate: project.forming_labor_rate,
    pouring_labor_rate: project.pouring_labor_rate,
    finishing_labor_rate: project.finishing_labor_rate,
    hand_dig_labor_rate: project.hand_dig_labor_rate,
    equipment_excavation_labor_rate: project.equipment_excavation_labor_rate,
    ai_engineering_recommendation: project.ai_engineering_recommendation,
    ai_engineering_data: project.ai_engineering_data,
    concrete_delivery_snapshot: captureConcreteDeliverySnapshot(calc.delivery),
    total_concrete_cost: calc.totals.total_concrete_cost,
    total_rebar_cost: calc.totals.total_rebar_cost,
    total_excavation_cost: calc.totals.total_excavation_cost,
    total_labor_cost: calc.totals.total_labor_cost,
    total_equipment_cost: calc.totals.total_equipment_cost,
    total_forming_materials_cost: calc.totals.total_forming_materials_cost,
    total_pole_cost: calc.totals.total_pole_cost,
    total_pole_painting_cost: calc.totals.total_pole_painting_cost,
    total_brick_cost: calc.totals.total_brick_cost,
    total_fill_cost: calc.totals.total_fill_cost,
    total_wall_cost: calc.totals.total_wall_cost,
    total_wall_cap_cost: calc.totals.total_wall_cap_cost
  });
  const saveContext = { ...currentEditorRef.current };
  const runSave = (intent) => {
    const attemptKey = `${saveContext.generation}|${saveContext.editRevision}|${intent}`;
    const liveNow = currentEditorRef.current;
    const staleOutcome = { status: "superseded", sourceId: saveContext.sourceId, sourceVersion: null, savedEditRevision: saveContext.editRevision, sourceSaved: false, builderSync: "not_required", error: null, warnings: [] };
    if (!(mountedRef.current && saveContext.loaded && liveNow.loaded && liveNow.sourceId === saveContext.sourceId && liveNow.generation === saveContext.generation && liveNow.editRevision === saveContext.editRevision)) {
      return Promise.resolve(staleOutcome);
    }
    if (copyFlightRef.current) return Promise.resolve(staleOutcome);
    if (draftSessionRef.current.pending) return Promise.resolve({ ...staleOutcome, status: "conflict", error: new Error("Resolve the unsent browser draft offer before saving.") });
    {
      const marker = sourceRefreshRef.current;
      if (marker && liveNow.loaded && liveNow.sourceId === marker.sourceId && liveNow.generation === marker.generation) {
        return Promise.resolve({ ...staleOutcome, status: "conflict", error: new Error("The project must be reloaded after the earlier save finished.") });
      }
    }
    const existing = saveAttemptRef.current;
    if (existing) return existing.promise;
    if (catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before saving.");
      setDirty(true);
      return Promise.resolve({ ...staleOutcome, status: "failed", error: new Error("Save paused: fix highlighted design inputs or catalog selections.") });
    }
    const captured = {
      project,
      estimateId,
      basePayload: payload(),
      draftStoreRef: draftStore,
      draftOwner: ownerId,
      draftRevision: draftSessionRef.current.revision,
      items: calc.items,
      equipment: calc.equipment,
      walls: calc.walls,
      poles: calc.poles,
      wallCaps: calc.wallCaps,
      delivery: calc.delivery,
      totals: calc.totals,
      sectionTotal,
      cabinetCost,
      landscapeCost,
      computedPricing: void 0
    };
    if (!saveContext.loaded) {
      return Promise.resolve(staleOutcome);
    }
    setSaveError("");
    setSaving(true);
    const promise = saveSessionRef.current.run({
      sourceId: saveContext.sourceId,
      editRevision: saveContext.editRevision,
      getCurrent: () => ({ ...currentEditorRef.current, loaded: mountedRef.current && currentEditorRef.current.loaded }),
      saveSource: async () => {
        const recoveryAck = acknowledgedVersionRef.current;
        const recovery = await loadFoundationBuilderRecovery({
          sourceId: saveContext.sourceId,
          estimateId: captured.estimateId,
          expectedSourceVersion: recoveryAck?.sourceId === saveContext.sourceId ? recoveryAck.updated_date : captured.project.updated_date
        });
        if (recovery) {
          captured.builderRecovery = recovery;
          captured.recoveryMatchesCurrent = sourcePatchMatches(recovery.sourceProject, captured.basePayload);
          return recovery.sourceProject;
        }
        if (pricingBlocked) {
          throw Object.assign(new Error("Save paused: fix highlighted design inputs or catalog selections."), { pricingUnavailable: true });
        }
        let customerPricing = captured.project.customer_pricing;
        if (captured.project.customer_pricing?.applied === true) {
          customerPricing = await calculateSavedCustomerPricing({
            project: { ...captured.project, ...captured.basePayload },
            categorize: categorizeFoundationProject,
            tierNumber: captured.project.customer_pricing?.tier_number
          });
          captured.computedPricing = customerPricing;
          const live = currentEditorRef.current;
          if (!(mountedRef.current && live.sourceId === saveContext.sourceId && live.generation === saveContext.generation && live.editRevision === saveContext.editRevision && live.loaded)) {
            throw Object.assign(new Error("Save superseded by a newer edit or route change."), { superseded: true });
          }
        }
        {
          const prior = captured.project.builder_sync_attempt;
          if (prior != null) {
            const ok = validateFoundationSyncAttempt(prior) && prior.source_project_id === captured.project.id && (!!captured.estimateId && prior.estimate_id === captured.estimateId);
            if (!ok) throw new Error("An unrecognised Builder sync receipt blocks saving. Reload and retry.");
          }
        }
        if (captured.estimateId) {
          captured.syncAttempt = createFoundationSyncAttempt({
            sourceId: captured.project.id,
            estimateId: captured.estimateId,
            key: newCreationRequestKey("foundation_sync"),
            requestedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        const ack = acknowledgedVersionRef.current;
        const expectedUpdatedAt = ack?.sourceId === saveContext.sourceId ? ack.updated_date : captured.project.updated_date;
        return updateBuilderSourceProject({
          entity: staffEntities.FoundationProject,
          sourceId: saveContext.sourceId,
          expectedUpdatedAt,
          data: { ...captured.basePayload, customer_pricing: customerPricing, ...captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : {} },
          estimateId: captured.estimateId,
          label: "Foundation project"
        });
      },
      syncBuilder: captured.estimateId ? async (savedProject) => recordBuilderSave({
        estimateId: captured.estimateId,
        line: { project_id: saveContext.sourceId, module_key: "foundation" },
        sourceProject: captured.builderRecovery ? savedProject : {
          ...savedProject,
          items: captured.items,
          selected_equipment: captured.equipment,
          walls: captured.walls,
          poles: captured.poles,
          wall_caps: captured.wallCaps,
          builder_calculation: { totals: captured.totals, delivery: captured.delivery, cabinet_cost: captured.cabinetCost, landscape_cost: captured.landscapeCost, section_total: captured.sectionTotal }
        },
        liveTotal: captured.builderRecovery ? void 0 : captured.sectionTotal,
        ...captured.builderRecovery ? { expectedPendingKey: captured.builderRecovery.pendingKey } : {}
      }).then(async (result) => {
        if (captured.builderRecovery) {
          await verifyFoundationRecoverySource({ sourceId: savedProject.id, expectedSourceVersion: savedProject.updated_date });
        }
        const ackLine = result?.line || result;
        assertFoundationBuilderAcknowledgment({ sourceProject: savedProject, estimateId: captured.estimateId, line: ackLine });
        captured.ackLine = ackLine;
        return result;
      }) : null
    }).then((outcome) => {
      if (!mountedRef.current) return outcome;
      const live = currentEditorRef.current;
      const sameContext = live.generation === saveContext.generation && live.sourceId === saveContext.sourceId;
      const fullyCurrent = sameContext && live.editRevision === saveContext.editRevision && live.loaded;
      if (outcome.sourceSaved && live.generation !== saveContext.generation) {
        const prevEpoch = sourceWriteEpochRef.current.get(outcome.sourceId) || { epoch: 0 };
        sourceWriteEpochRef.current.set(outcome.sourceId, { epoch: prevEpoch.epoch + 1, lastSavedVersion: outcome.sourceVersion });
      }
      if (outcome.sourceSaved && live.loaded && live.sourceId === outcome.sourceId && live.generation !== saveContext.generation && projectRef.current?.updated_date !== outcome.sourceVersion) {
        sourceRefreshRef.current = { sourceId: live.sourceId, generation: live.generation, sourceVersion: outcome.sourceVersion };
        setDirty(true);
        setSaveError("An earlier save finished after you navigated away. Reload the saved project before saving again.");
      }
      if (outcome.sourceSaved && outcome.sourceVersion && sameContext) {
        acknowledgedVersionRef.current = {
          sourceId: outcome.sourceId,
          updated_date: outcome.sourceVersion,
          ownerId,
          sourceSnapshot: captured.builderRecovery ? captured.builderRecovery.sourceProject : {
            ...captured.project,
            ...captured.basePayload,
            id: outcome.sourceId,
            updated_date: outcome.sourceVersion
          }
        };
      }
      if (captured.builderRecovery && outcome.builderSync === "synced" && sameContext) {
        setRecoveryRequired(false);
        setProject((prev) => prev?.id === outcome.sourceId ? { ...prev, updated_date: outcome.sourceVersion, builder_sync_attempt: captured.builderRecovery.sourceProject.builder_sync_attempt } : prev);
        if (!fullyCurrent || !captured.recoveryMatchesCurrent) {
          if (captured.ackLine) {
            setLinkedEstimate((prev) => prev?.id === captured.estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === outcome.sourceId ? captured.ackLine : it) } : prev);
          }
          setAutoSave(false);
          setDirty(true);
          setSaveError("Previous Builder synchronization recovered. Review and save your unsent changes separately.");
          outcome.status = "superseded";
          outcome.warnings.push("previous_sync_recovered_unsent_changes_remain");
          return outcome;
        }
      }
      if (outcome.status === "saved" && fullyCurrent) {
        setRecoveryRequired(false);
        setProject((prev) => prev && prev.id === outcome.sourceId ? { ...prev, updated_date: outcome.sourceVersion, ...captured.computedPricing !== void 0 ? { customer_pricing: captured.computedPricing } : {}, ...captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : {} } : prev);
        if (captured.ackLine) {
          setLinkedEstimate((prev) => prev && prev.id === captured.estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === outcome.sourceId ? captured.ackLine : it) } : prev);
        }
        setDirty(false);
        setSaveError("");
        if (draftSessionRef.current.store === captured.draftStoreRef && captured.draftOwner === ownerId && captured.draftRevision) {
          const cleared = captured.draftStoreRef.clear(captured.draftRevision);
          if (cleared.status === "removed") {
            draftSessionRef.current.revision = null;
            setDraftOffer((o) => o?.store === draftStore ? { store: draftStore } : o);
          } else if (cleared.status === "unavailable") setDraftOffer((o) => o?.store === draftStore ? { store: draftStore, warning: `Saved, but the browser draft backup could not be cleared. ${cleared.message || ""}` } : o);
          else if (cleared.status === "retained") setDraftOffer((o) => o?.store === draftStore ? { store: draftStore, warning: "Saved; a newer browser draft remains - review it before leaving." } : o);
        }
        try {
          onSaved?.();
        } catch (e) {
          console.error(e);
          outcome.warnings.push("observer_error");
        }
      } else if (sameContext && outcome.status === "superseded" && outcome.builderSync === "pending") {
        setRecoveryRequired(true);
        setSaveError("Source saved; estimate/Builder sync incomplete. Retry save.");
        setDirty(true);
      } else if (sameContext && outcome.status === "partial") {
        setRecoveryRequired(true);
        setSaveError("Source saved; estimate/Builder sync incomplete. Retry save.");
        setDirty(true);
      } else if (sameContext && (outcome.status === "conflict" || outcome.status === "failed")) {
        setSaveError(outcome.error?.pricingUnavailable ? "Pricing unavailable: fix highlighted design inputs or catalog selections before saving." : "Save failed: " + (outcome.error?.message || outcome.status));
        setDirty(true);
      }
      return outcome;
    }).finally(() => {
      if (saveAttemptRef.current?.promise === promise) {
        saveAttemptRef.current = null;
        if (mountedRef.current) setSaving(saveSessionRef.current.isSaving());
      }
    });
    saveAttemptRef.current = { key: attemptKey, promise };
    return promise;
  };
  const handleSave = () => runSave("save");
  saveRef.current = handleSave;
  const handleReloadSaved = () => {
    const marker = sourceRefreshRef.current;
    const live = currentEditorRef.current;
    if (!marker || !mountedRef.current || !live.loaded || live.sourceId !== marker.sourceId || live.generation !== marker.generation) return;
    if (dirty && !window.confirm("Reload the saved project and discard current unsaved changes?")) return;
    currentEditorRef.current = { ...currentEditorRef.current, loaded: false };
    setReloadRevision((r) => r + 1);
  };
  const backTo = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator";
  const handleSaveAndExit = async () => {
    const outcome = await runSave("save_exit");
    const c = currentEditorRef.current;
    if (outcome?.status === "saved" && mountedRef.current && c.generation === saveContext.generation && c.sourceId === saveContext.sourceId && outcome.sourceId === c.sourceId && outcome.savedEditRevision === c.editRevision && c.editRevision === saveContext.editRevision && c.loaded === true && exitGenerationRef.current !== c.generation) {
      exitGenerationRef.current = c.generation;
      if (embedded) onClose?.();
      else navigate(backTo);
    }
    return outcome;
  };
  const handleSaveAsCopy = () => {
    if (draftSessionRef.current.pending) return;
    if (copyFlightRef.current) return copyFlightRef.current;
    const live0 = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live0.loaded || live0.generation !== saveContext.generation || live0.sourceId !== saveContext.sourceId || live0.estimateId !== saveContext.estimateId || live0.editRevision !== saveContext.editRevision) return null;
    if (saveAttemptRef.current || saveSessionRef.current?.isSaving()) return null;
    if (pricingBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before copying.");
      return null;
    }
    const gen = saveContext.generation;
    const sourceId = saveContext.sourceId;
    const estimateKey = saveContext.estimateId;
    const editRev = saveContext.editRevision;
    let attempt;
    try {
      const baseData = {
        ...payload(),
        project_name: `${project.project_name || "Foundation"} (Copy)`,
        client_name: project.client_name,
        customer_id: project.customer_id
      };
      const signature = JSON.stringify(baseData);
      if (copyAttemptRef.current.signature !== signature) {
        const { components } = cloneFoundationComponents(
          {
            items: calc.items || [],
            walls: calc.walls || [],
            poles: calc.poles || [],
            wall_caps: calc.wallCaps || [],
            signage_cabinets: project.signage_cabinets || []
          },
          { createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }
        );
        const data = { ...baseData, ...components, status: "draft" };
        delete data.builder_sync_attempt;
        copyAttemptRef.current = { signature, key: newCreationRequestKey("foundation_project_copy"), data };
      }
      attempt = copyAttemptRef.current;
    } catch (e) {
      setSaveError(e?.message || "Foundation project copy could not be prepared.");
      return null;
    }
    const run = Promise.resolve().then(async () => {
      const live = currentEditorRef.current;
      if (!mountedRef.current || !live.loaded || live.generation !== gen || live.sourceId !== sourceId || live.estimateId !== estimateKey || live.editRevision !== editRev) return;
      setSaving(true);
      try {
        const copy = await ensureIdempotentEntityCreate({
          entity: staffEntities.FoundationProject,
          keyField: "creation_request_key",
          key: attempt.key,
          data: attempt.data,
          label: "Foundation project copy"
        });
        if (!copy?.id) throw new Error("Foundation project copy could not be verified.");
        const live2 = currentEditorRef.current;
        if (!mountedRef.current || !live2.loaded || live2.generation !== gen || live2.sourceId !== sourceId || live2.estimateId !== estimateKey || live2.editRevision !== editRev) return;
        navigate(`/FoundationEstimator?id=${encodeURIComponent(copy.id)}`);
      } catch (e) {
        if (mountedRef.current && currentEditorRef.current.loaded && currentEditorRef.current.generation === gen && currentEditorRef.current.sourceId === sourceId) {
          console.error(e);
          alert("Save failed: " + e.message);
        }
      }
    });
    const wrapped = run.finally(() => {
      if (copyFlightRef.current !== wrapped) return;
      copyFlightRef.current = null;
      if (mountedRef.current) setSaving(Boolean(saveSessionRef.current?.isSaving()) || Boolean(saveAttemptRef.current));
    });
    copyFlightRef.current = wrapped;
    return wrapped;
  };
  const handleSwapToBrickStone = async () => {
    if (draftSessionRef.current.pending) return;
    const live = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live.loaded || live.generation !== saveContext.generation || live.sourceId !== saveContext.sourceId || live.estimateId !== saveContext.estimateId || live.editRevision !== saveContext.editRevision) return null;
    if (pricingBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before swapping.");
      return null;
    }
    setSaving(true);
    try {
      const draft = await convertFoundationToBrickStone({ project, attemptRef: swapAttemptRef });
      navigate(`/BrickStoneEstimator?id=${draft.id}`);
    } catch (e) {
      console.error(e);
      alert("Swap failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const handleShareLink = async () => {
    if (draftSessionRef.current.pending) return;
    try {
      const url = await createEstimateReadOnlyShareLink({ estimateId });
      await navigator.clipboard.writeText(url);
      alert("Read-only link copied to clipboard:\n" + url);
    } catch (e) {
      console.error(e);
      alert("Share link failed: " + e.message);
    }
  };
  return /* @__PURE__ */ jsxs11("div", { className: "clay-scope min-h-full bg-gray-50", children: [
    /* @__PURE__ */ jsxs11("div", { className: "max-w-[1500px] mx-auto p-4", children: [
      /* @__PURE__ */ jsx28(FoundationSectionBanner_default, { sectionName: project.project_name }),
      saveError && /* @__PURE__ */ jsx28("div", { role: "alert", className: "mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800", children: saveError }),
      catalogBlocked && /* @__PURE__ */ jsxs11("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsx28("div", { className: "font-semibold", children: "Pricing unavailable: selected materials or rental items need attention. Unavailable items show saved amounts only; other amounts may be recalculated. Save and estimate handoff are paused." }),
        /* @__PURE__ */ jsx28("ul", { className: "mt-1 list-disc pl-5", children: calc.catalogIssues.map((i, idx) => /* @__PURE__ */ jsx28("li", { children: i.message }, idx)) }),
        /* @__PURE__ */ jsx28(
          "button",
          {
            type: "button",
            onClick: handleCatalogReload,
            disabled: catalogReloading || loading || saving,
            className: "mt-2 rounded-sm border border-amber-400 bg-white px-2 py-1 text-[12px] font-semibold text-amber-800 disabled:opacity-50",
            children: catalogReloading ? "Reloading catalogs\u2026" : "Reload catalogs"
          }
        )
      ] }),
      inputBlocked && /* @__PURE__ */ jsxs11("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsx28("div", { className: "font-semibold", children: "Design input required: fix highlighted design inputs below. Save and estimate handoff are paused." }),
        /* @__PURE__ */ jsx28("ul", { className: "mt-1 list-disc pl-5", children: inputIssues.map((i, idx) => /* @__PURE__ */ jsx28("li", { children: i.message }, idx)) })
      ] }),
      (() => {
        const marker = sourceRefreshRef.current;
        const live = currentEditorRef.current;
        if (!marker || !live.loaded || live.sourceId !== marker.sourceId || live.generation !== marker.generation) return null;
        return /* @__PURE__ */ jsxs11("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800", children: [
          "An earlier save finished after this view changed. Reload the saved project before saving again.",
          /* @__PURE__ */ jsx28("button", { type: "button", onClick: handleReloadSaved, className: "ml-2 font-semibold underline", children: "Reload saved project" })
        ] });
      })(),
      (() => {
        const recovery = foundationSyncRecoveryState({ project, estimateId, estimate: linkedEstimate });
        if (!["pending", "unsupported", "mismatch"].includes(recovery.status) && !recoveryRequired) return null;
        const detail = recovery.status === "mismatch" && recovery.attempt?.estimate_id ? "Open the linked estimate to review." : recovery.message || "A saved Builder sync attempt is still unacknowledged.";
        return /* @__PURE__ */ jsxs11("div", { role: "status", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs11("span", { children: [
            detail,
            " Current displayed totals will be synchronized; accepted quote prices remain under the platform workflow. ",
            dirty ? "You also have unsaved local edits." : ""
          ] }),
          recovery.status === "mismatch" && recovery.attempt?.estimate_id && /* @__PURE__ */ jsx28("a", { className: "underline", href: `/EstimateDetail?id=${encodeURIComponent(recovery.attempt.estimate_id)}`, children: "Open estimate" }),
          /* @__PURE__ */ jsx28("button", { type: "button", disabled: saving || recovery.status === "unsupported" || recovery.status === "mismatch", className: "px-2 py-1 rounded bg-amber-600 text-white disabled:opacity-50", onClick: () => saveRef.current?.(), children: "Review and retry Save" })
        ] });
      })(),
      assemblyIssues.length > 0 && /* @__PURE__ */ jsxs11("div", { role: "status", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900", children: [
        /* @__PURE__ */ jsx28("span", { className: "font-semibold", children: "Unresolved placements" }),
        /* @__PURE__ */ jsx28("ul", { className: "list-disc pl-5 mt-1 space-y-0.5", children: assemblyIssues.map((issue, i) => /* @__PURE__ */ jsx28("li", { children: issue.message }, `${issue.code}-${issue.kind}-${issue.componentId || ""}-${issue.parentId || ""}-${i}`)) })
      ] }),
      draftVisible?.backedUp && !draftVisible?.warning && /* @__PURE__ */ jsx28("div", { role: "status", className: "mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[13px] text-blue-900", children: draftVisible.message }),
      draftVisible?.warning && /* @__PURE__ */ jsx28("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: draftVisible.warning }),
      (draftVisible?.draft || draftVisible?.message) && draftSessionRef.current.pending && /* @__PURE__ */ jsx28("div", { role: "alert", className: "mb-3 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-[13px] text-indigo-900", children: draftVisible.draft ? /* @__PURE__ */ jsxs11(Fragment3, { children: [
        /* @__PURE__ */ jsxs11("div", { className: "font-semibold", children: [
          "Unsent browser-tab draft found. Nothing restored or sent. ",
          draftVisible.savedAt ? `Saved ${draftVisible.savedAt}.` : "",
          " Recovery covers design fields only."
        ] }),
        draftVisible.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== draftVisible.baseUpdatedAt && /* @__PURE__ */ jsx28("div", { className: "mt-1", children: "Saved project changed since these edits." }),
        /* @__PURE__ */ jsxs11("div", { className: "mt-2 flex gap-2", children: [
          /* @__PURE__ */ jsx28("button", { type: "button", onClick: restoreBrowserDraft, className: "rounded-sm border border-indigo-400 bg-white px-2 py-1 text-[12px] font-semibold text-indigo-800", children: "Restore browser draft" }),
          /* @__PURE__ */ jsx28("button", { type: "button", onClick: discardBrowserDraft, className: "rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700", children: "Discard browser draft" })
        ] })
      ] }) : /* @__PURE__ */ jsxs11(Fragment3, { children: [
        /* @__PURE__ */ jsxs11("div", { className: "font-semibold", children: [
          "A browser draft exists but cannot be restored. ",
          draftVisible.message || "",
          " Recovery covers design fields only."
        ] }),
        /* @__PURE__ */ jsx28("div", { className: "mt-2", children: /* @__PURE__ */ jsx28("button", { type: "button", onClick: discardBrowserDraft, className: "rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700", children: "Discard browser draft" }) })
      ] }) }),
      /* @__PURE__ */ jsxs11("fieldset", { disabled: draftSessionRef.current.pending, className: "contents min-w-0", children: [
        /* @__PURE__ */ jsx28(
          FoundationToolbar_default,
          {
            title: "Edit Concrete | Masonry | Poles Estimate",
            subtitle: "Engineering, foundation, excavation, wall & pole estimating",
            backTo,
            total: sectionTotal,
            saving,
            dirty: dirty || draftSessionRef.current.pending,
            lastSavedAt: project?.updated_date,
            autoSave,
            pricingUnavailable: pricingBlocked,
            onToggleAutoSave: () => {
              if (!draftSessionRef.current.pending) setAutoSave((v) => !v);
            },
            canUndo: history.past.length > 0,
            canRedo: history.future.length > 0,
            onUndo: undo,
            onRedo: redo,
            onSave: handleSave,
            onSaveAndExit: handleSaveAndExit,
            onSaveAsCopy: handleSaveAsCopy,
            onSaveAsTemplate: () => {
              if (!draftSessionRef.current.pending) setTemplateMode("save");
            },
            onTemplates: () => {
              if (!draftSessionRef.current.pending) setTemplateMode("load");
            },
            onSwapToBrickStone: handleSwapToBrickStone,
            onShareLink: estimateId ? handleShareLink : void 0,
            onHelp: () => setShowHelp((v) => !v),
            onBack: embedded ? () => {
              if (saving) return;
              if ((dirty || recoveryRequired) && !window.confirm("You have unsaved changes or an unacknowledged Builder sync. Leave without saving?")) return;
              onClose?.();
            } : () => {
              if (saving) return;
              if ((dirty || recoveryRequired) && !window.confirm("You have unsaved changes or an unacknowledged Builder sync. Leave without saving?")) return;
              navigate(backTo);
            }
          }
        ),
        showHelp && /* @__PURE__ */ jsxs11("div", { className: "bg-blue-50 border border-blue-200 rounded-sm p-3 mb-3 text-[12px] text-blue-900", children: [
          "Add each footing or pillar under ",
          /* @__PURE__ */ jsx28("b", { children: "Foundation" }),
          ", then place poles, masonry walls and caps in the other tabs. Concrete, rebar, excavation and labor rates come from your settings and supplier inventory. The 3D preview on the right updates as you type \u2014 left drag orbits, right drag pans, scroll zooms. Save & Exit pushes the total back to the combined estimate."
        ] }),
        /* @__PURE__ */ jsxs11("div", { className: "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_560px] gap-4 items-start", children: [
          /* @__PURE__ */ jsx28("div", { children: /* @__PURE__ */ jsxs11(Tabs, { defaultValue: "foundations", children: [
            /* @__PURE__ */ jsxs11(TabsList, { className: "flex flex-wrap h-auto bg-white border border-gray-200 p-1 mb-3 rounded-sm justify-start", children: [
              /* @__PURE__ */ jsxs11(TabsTrigger, { value: "foundations", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx28(Anchor, { className: "w-3.5 h-3.5" }),
                " Foundation (",
                calc.items.length,
                ")"
              ] }),
              /* @__PURE__ */ jsxs11(TabsTrigger, { value: "landscape", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx28(LayoutGrid, { className: "w-3.5 h-3.5" }),
                " Walls & Poles (",
                (calc.walls?.length || 0) + (calc.poles?.length || 0),
                ")"
              ] }),
              /* @__PURE__ */ jsxs11(TabsTrigger, { value: "caps", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx28(Layers, { className: "w-3.5 h-3.5" }),
                " Wall Caps"
              ] }),
              /* @__PURE__ */ jsxs11(TabsTrigger, { value: "signage", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx28(Trees, { className: "w-3.5 h-3.5" }),
                " Signage & Landscape"
              ] }),
              /* @__PURE__ */ jsxs11(TabsTrigger, { value: "equipment", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx28(Wrench, { className: "w-3.5 h-3.5" }),
                " Equipment"
              ] }),
              /* @__PURE__ */ jsxs11(TabsTrigger, { value: "summary", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx28(TrendingUp, { className: "w-3.5 h-3.5" }),
                " Cost Summary"
              ] }),
              /* @__PURE__ */ jsxs11(TabsTrigger, { value: "bom", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx28(ClipboardList, { className: "w-3.5 h-3.5" }),
                " Bill of Materials"
              ] }),
              /* @__PURE__ */ jsxs11(TabsTrigger, { value: "pricing", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx28(Tag, { className: "w-3.5 h-3.5" }),
                " Customer Pricing"
              ] })
            ] }),
            /* @__PURE__ */ jsxs11(TabsContent, { value: "foundations", className: "space-y-3", children: [
              /* @__PURE__ */ jsx28(AiEngineeringAssistant_default, { project, onResult: patch }),
              calc.items.length === 0 ? /* @__PURE__ */ jsx28("div", { className: "text-center py-12 bg-white rounded-sm border border-dashed border-gray-300 text-[12px] text-gray-500", children: "No foundations yet \u2014 add a spread footing or pillar to start." }) : /* @__PURE__ */ jsx28("div", { className: "space-y-3", children: calc.items.map((item, index) => /* @__PURE__ */ jsx28(
                FoundationItemCard,
                {
                  item,
                  pricing: calc.itemPricing[index],
                  index,
                  catalog,
                  onChange: patchItem,
                  onRemove: removeItem,
                  onDuplicate: duplicateItem
                },
                item.component_id || index
              )) }),
              /* @__PURE__ */ jsxs11(
                "button",
                {
                  type: "button",
                  onClick: () => addItem("spread_foot"),
                  className: "h-[30px] px-3 flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50",
                  children: [
                    /* @__PURE__ */ jsx28(Plus, { className: "w-3.5 h-3.5" }),
                    " Add Foundation Item"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs11(TabsContent, { value: "landscape", className: "space-y-4", children: [
              /* @__PURE__ */ jsx28(
                FoundationWallsPanel,
                {
                  walls: calc.walls,
                  options: catalog.walls,
                  wallPricing: calc.wallPricing,
                  onChange: (walls) => patch({ walls })
                }
              ),
              /* @__PURE__ */ jsx28(
                FoundationPolesPanel,
                {
                  poles: calc.poles,
                  options: catalog.poles,
                  items: calc.items,
                  polePricing: calc.polePricing,
                  onChange: (poles) => patch({ poles })
                }
              ),
              /* @__PURE__ */ jsx28(
                FoundationLayoutCanvas_default,
                {
                  items: project.items || [],
                  poles: project.poles || [],
                  onMoveItem: patchItem
                }
              )
            ] }),
            /* @__PURE__ */ jsxs11(TabsContent, { value: "signage", className: "space-y-4", children: [
              /* @__PURE__ */ jsx28(
                SignageCabinetsPanel_default,
                {
                  cabinets: project.signage_cabinets || [],
                  items: project.items || [],
                  poles: project.poles || [],
                  onChange: (signage_cabinets) => patch({ signage_cabinets })
                }
              ),
              /* @__PURE__ */ jsx28(
                LandscapeDesigner_default,
                {
                  landscape: project.landscape,
                  onChange: (landscape) => patch({ landscape })
                }
              )
            ] }),
            /* @__PURE__ */ jsx28(TabsContent, { value: "caps", children: /* @__PURE__ */ jsx28(
              FoundationWallCapsPanel,
              {
                caps: calc.wallCaps,
                walls: calc.walls,
                options: catalog.caps,
                onChange: (wall_caps) => patch({ wall_caps })
              }
            ) }),
            /* @__PURE__ */ jsx28(TabsContent, { value: "equipment", children: /* @__PURE__ */ jsx28(
              EquipmentTab,
              {
                foundationItems: project.items || [],
                inventory,
                selectedEquipmentList: project.selected_equipment || [],
                onUpdate: (rows) => patch({ selected_equipment: rows }),
                markDirty: () => setDirty(true)
              }
            ) }),
            /* @__PURE__ */ jsxs11(TabsContent, { value: "summary", className: "space-y-3", children: [
              /* @__PURE__ */ jsxs11("label", { className: "block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500", children: [
                "Section name",
                /* @__PURE__ */ jsx28(
                  Input,
                  {
                    value: project.project_name || "",
                    onChange: (e) => patch({ project_name: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsx28(ConcreteDeliveryPanel, { project, delivery: calc.delivery, onChange: patch }),
              /* @__PURE__ */ jsx28(FoundationRatesPanel, { settings, project, onChange: patch }),
              /* @__PURE__ */ jsxs11("div", { className: "max-w-xl", children: [
                /* @__PURE__ */ jsx28(FoundationTotals, { totals: calc.totals, pricingUnavailable: pricingBlocked }),
                /* @__PURE__ */ jsxs11("div", { className: "mt-3 space-y-1 text-[12px] text-gray-600", children: [
                  /* @__PURE__ */ jsxs11("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx28("span", { children: "Signage cabinets" }),
                    /* @__PURE__ */ jsx28("span", { children: hasFoundationCostSnapshot(cabinetCost) ? money(cabinetCost) : "Not saved" })
                  ] }),
                  /* @__PURE__ */ jsxs11("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx28("span", { children: "Site landscaping" }),
                    /* @__PURE__ */ jsx28("span", { children: hasFoundationCostSnapshot(landscapeCost) ? money(landscapeCost) : "Not saved" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs11("div", { className: "mt-2 text-right text-[12px] text-gray-500", children: [
                  "Section total flowing to estimate: ",
                  pricingBlocked ? /* @__PURE__ */ jsx28("b", { className: "text-amber-700", children: "Estimate handoff paused" }) : /* @__PURE__ */ jsx28("b", { className: "text-red-700", children: money(sectionTotal) })
                ] }),
                /* @__PURE__ */ jsx28(
                  Link,
                  {
                    to: "/FoundationCatalog",
                    className: "inline-block mt-3 text-[12px] text-gray-600 hover:text-red-600",
                    children: "Manage foundation catalog \u2192"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx28(TabsContent, { value: "bom", children: /* @__PURE__ */ jsx28(
              FoundationBOM,
              {
                items: calc.items,
                poles: calc.poles,
                walls: calc.walls,
                delivery: calc.delivery,
                totals: calc.totals,
                inventory,
                itemPricing: calc.itemPricing,
                polePricing: calc.polePricing,
                wallPricing: calc.wallPricing,
                pricingUnavailable: pricingBlocked
              }
            ) }),
            /* @__PURE__ */ jsx28(TabsContent, { value: "pricing", className: "space-y-4", children: pricingBlocked ? /* @__PURE__ */ jsx28("div", { className: "rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800", children: "Customer pricing unavailable: fix highlighted design inputs or catalog selections." }) : /* @__PURE__ */ jsxs11(Fragment3, { children: [
              /* @__PURE__ */ jsx28(
                CustomerPricingPanel_default,
                {
                  cost: sectionTotal,
                  project,
                  onChange: (changes) => patch({
                    ...changes,
                    customer_pricing: { ...project.customer_pricing || {}, applied: false }
                  })
                }
              ),
              /* @__PURE__ */ jsx28(
                CustomerPricingTab_default,
                {
                  project: { ...project, ...payload() },
                  categorize: categorizeFoundationProject,
                  accentColor: "red",
                  onApplyTier: (tier) => patch({
                    customer_pricing: { ...project.customer_pricing || {}, applied: true, tier_number: tier }
                  })
                }
              )
            ] }) })
          ] }) }),
          /* @__PURE__ */ jsx28("div", { className: "xl:sticky xl:top-4", children: inputBlocked ? /* @__PURE__ */ jsx28("div", { className: "rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800", children: "3D preview hidden until the highlighted design inputs are corrected." }) : /* @__PURE__ */ jsx28(Foundation3DPreview_default, { project }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx28(
      FoundationTemplateDialog_default,
      {
        open: !!templateMode && !draftSessionRef.current.pending,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => {
          let patchData;
          try {
            patchData = prepareFoundationTemplatePatch(data, {
              createId: (kind) => newCreationRequestKey(`foundation_${kind}`)
            });
          } catch (e) {
            setSaveError(e?.message || "Template assembly could not be applied.");
            return false;
          }
          return commit(() => patchData);
        }
      }
    )
  ] });
}
export {
  FoundationEstimator as Page,
  calcEquipmentPricing,
  calcProject,
  foundationItemInputIssues,
  foundationItemSettingIssues,
  foundationProjectInputIssues,
  resolveFoundationEquipment
};
