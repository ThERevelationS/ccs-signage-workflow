// src/pages/FoundationEstimator.jsx
import { useState as useState5, useEffect, useMemo, useRef as useRef2, useSyncExternalStore } from "react";
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

// src/pages/FoundationEstimator.jsx
import {
  Plus as Plus4,
  Anchor as AnchorIcon,
  Wrench as WrenchIcon,
  LayoutGrid,
  Layers,
  ClipboardList,
  TrendingUp,
  Trees,
  Tag
} from "lucide-react";

// s:s://@/components/estimator/foundation/FoundationItemCard
import { jsx as jsx3 } from "react/jsx-runtime";
var FoundationItemCard_default = () => /* @__PURE__ */ jsx3("div", {});

// src/components/estimator/foundation/foundationPreliminaryNotice.js
import { createElement, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
var PRELIMINARY_NOTICE_TEXT = "Preliminary estimating only - final engineering required";
function hasPreliminaryNotice(text5) {
  return typeof text5 === "string" && text5.includes(PRELIMINARY_NOTICE_TEXT);
}
function ensurePreliminaryNotice(notes) {
  if (notes === null || notes === void 0) return PRELIMINARY_NOTICE_TEXT;
  if (typeof notes !== "string") {
    throw new Error("Preliminary notice can only be applied to string notes.");
  }
  if (notes.trim() === "") return PRELIMINARY_NOTICE_TEXT;
  if (hasPreliminaryNotice(notes)) return notes;
  return `${PRELIMINARY_NOTICE_TEXT}

${notes}`;
}

// s:s://@/components/estimator/foundation/FoundationReinforcementProposalPanel
import { jsx as jsx4 } from "react/jsx-runtime";
var FoundationReinforcementProposalPanel_default = () => /* @__PURE__ */ jsx4("div", {});

// src/components/estimator/foundation/useFoundationReinforcementEditor.js
import { useRef, useState as useState2 } from "react";

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
var normalizeConcreteSupplier = (row) => ({
  id: row.id,
  material_name: row.service_name,
  material_description: row.description || "",
  material_type: "concrete_service",
  supplier: row.vendor_name || row.service_name,
  // O-009 (CMP-A09) -- explicit-0-respecting price fields: `|| 0` silently
  // turned a missing/malformed rate into 0 (the O-008 boundary violation); `?? null`
  // honors an authored 0 vs a missing rate reading "Not priced", never a silent 0.
  cost_per_unit: row.default_rate ?? null,
  unit: "cy",
  minimum_order_yards: row.minimum_order_yards ?? null,
  below_minimum_cost_per_cy: row.below_minimum_cost_per_cy ?? null,
  minimum_cost: row.minimum_charge || 0,
  mix_3500_price: row.mix_3500_price || 0,
  mix_4000_price: row.mix_4000_price || 0,
  mix_4500_price: row.mix_4500_price || 0,
  mix_5000_price: row.mix_5000_price || 0,
  mix_fast_set_price: row.mix_fast_set_price || 0,
  admix_calcium_chloride_price: row.admix_calcium_chloride_price || 0,
  admix_set_retarding_price: row.admix_set_retarding_price || 0,
  admix_water_reducing_price: row.admix_water_reducing_price || 0,
  admix_fibers_price: row.admix_fibers_price || 0,
  admix_winter_service_price: row.admix_winter_service_price || 0,
  small_load_fee_1_1_75: row.small_load_fee_1_1_75 || 0,
  small_load_fee_2_2_75: row.small_load_fee_2_2_75 || 0,
  small_load_fee_3_3_75: row.small_load_fee_3_3_75 || 0,
  small_load_fee_4_4_25: row.small_load_fee_4_4_25 || 0,
  small_load_fee_4_5_4_75: row.small_load_fee_4_5_4_75 || 0,
  fuel_surcharge: row.fuel_surcharge || 0,
  show_in_foundation: row.show_in_foundation !== false,
  _source: "labor_services"
});
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
function foundationWallPricingIssues(wall, inventory = [], index = 0, settings = {}) {
  return wallPricing(wall, inventory, index, settings).issues;
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
var isCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
function itemHasLegacyPole(item) {
  if (!item || typeof item !== "object") return false;
  const id = item.selected_pole_id;
  if (assignedId2(id)) return true;
  const height = inventoryFiniteNumber(item.pole_total_height_inches);
  if (height !== null && height !== 0) return true;
  const offBottom = inventoryFiniteNumber(item.pole_offset_from_bottom_inches);
  if (offBottom !== null && offBottom !== 0) return true;
  if (item.include_pole_painting === true) return true;
  if (isCostSnapshot(item.pole_cost) || isCostSnapshot(item.pole_painting_cost)) return true;
  return false;
}
function deriveLegacyItemPole(item, index = 0) {
  if (!itemHasLegacyPole(item)) return null;
  const height = inventoryFiniteNumber(item.pole_total_height_inches);
  const offBottom = inventoryFiniteNumber(item.pole_offset_from_bottom_inches);
  return {
    pole_origin: POLE_ORIGIN_LEGACY_ITEM,
    source_item_index: index,
    source_item_component_id: item.component_id ?? null,
    foundation_component_id: item.component_id ?? "",
    foundation_idx: index,
    pole_id: assignedId2(item.selected_pole_id) ? item.selected_pole_id : "",
    height_inches: height !== null && height > 0 ? height : null,
    include_pole_painting: item.include_pole_painting === true,
    legacy_pole_offset_from_bottom_inches: offBottom,
    legacy_pole_cost: isCostSnapshot(item.pole_cost) ? item.pole_cost : null,
    legacy_pole_painting_cost: isCostSnapshot(item.pole_painting_cost) ? item.pole_painting_cost : null
  };
}
function consolidateFoundationPoles(source = {}) {
  const items = Array.isArray(source?.items) ? source.items : [];
  const poles = Array.isArray(source?.poles) ? source.poles : [];
  const legacyPoles = [];
  const overlaps = [];
  const issues = [];
  items.forEach((item, index) => {
    const derived = deriveLegacyItemPole(item, index);
    if (!derived) return;
    const derivedIndex = legacyPoles.length;
    legacyPoles.push(derived);
    issues.push({
      kind: "pole",
      severity: "advisory",
      code: "legacy_item_pole_fields",
      componentId: item?.component_id ?? null,
      field: "selected_pole_id",
      message: `Foundation ${index + 1} carries legacy item-pole fields that are not priced \xE2\u20AC\u201D migrate them into the Poles section or clear them.`
    });
    poles.forEach((p, poleIndex) => {
      const assignedToItem = p?.foundation_component_id && item?.component_id ? p.foundation_component_id === item.component_id : p?.foundation_idx !== void 0 && p?.foundation_idx !== null && p.foundation_idx === index;
      if (assignedToItem) {
        overlaps.push({
          derivedIndex,
          poleIndex,
          itemComponentId: item?.component_id ?? null,
          poleComponentId: p?.component_id ?? null
        });
      }
    });
  });
  const overlappedItems = new Set(overlaps.map((o) => o.derivedIndex));
  for (const derivedIndex of overlappedItems) {
    const count = overlaps.filter((o) => o.derivedIndex === derivedIndex).length;
    const itemIndex = legacyPoles[derivedIndex]?.source_item_index ?? derivedIndex;
    issues.push({
      kind: "pole",
      severity: "advisory",
      code: "pole_representation_overlap",
      componentId: legacyPoles[derivedIndex]?.source_item_component_id ?? null,
      field: "selected_pole_id",
      message: `Foundation ${itemIndex + 1} has legacy item-pole fields and ${count} project pole(s) on the same foundation \xE2\u20AC\u201D verify they describe different physical poles before migrating.`
    });
  }
  return { poles, legacyPoles, overlaps, issues };
}
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
var suggestFeasibleDimensions = (pole) => {
  const height = Number(pole?.height_inches) || 0;
  const poleDia = Number(pole?.diameter_inches) || Number(pole?.cross_section?.diameter) || null;
  if (!(height > 0)) return { available: false, reason: "a positive exposed pole height is required before a feasible-dimension estimate" };
  const embedment = Math.ceil(height * FOUNDATION_METHOD_DOMAIN.embedment_min_ratio);
  const out = {
    available: true,
    height_inches: height,
    embedment_inches: embedment,
    governing: "embedment = exposed height / 3 (engineering guidance minimum)"
  };
  if (poleDia != null && poleDia > 0) {
    out.shaft_diameter_inches = Math.ceil(poleDia * FOUNDATION_METHOD_DOMAIN.shaft_diameter_min_ratio);
    out.governing += "; shaft diameter >= 2x pole diameter (shop-assumption clearance)";
  }
  return out;
};
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
var foundationDimensionFieldMeta = (section2, field) => {
  const group = FOUNDATION_DIMENSION_FIELDS[section2];
  return group ? group[field] ?? null : null;
};

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
var src = (register_id, section2, verified) => {
  const base2 = FOUNDATION_RULE_SOURCES[register_id];
  return {
    register_id,
    authority: base2.authority,
    authority_class: SOURCE_AUTHORITY_CLASS[register_id] ?? null,
    title: base2.title,
    edition: base2.edition ?? null,
    section: section2 ?? null,
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
  const byId2 = /* @__PURE__ */ new Map();
  const errors = [];
  function registerRule(candidate) {
    const verdict = normalizeRule(candidate);
    if (!verdict.ok) return { ok: false, errors: verdict.errors, warnings: verdict.warnings };
    const rule = verdict.rule;
    if (byId2.has(rule.rule_id)) {
      return { ok: false, errors: [`duplicate rule_id '${rule.rule_id}'`], warnings: verdict.warnings };
    }
    byId2.set(rule.rule_id, rule);
    return { ok: true, rule, errors: [], warnings: verdict.warnings };
  }
  for (const seed of Array.isArray(seedRules) ? seedRules : []) {
    const verdict = registerRule(seed);
    if (!verdict.ok) errors.push({ rule_id: isRecord2(seed) ? seed.rule_id ?? null : null, errors: verdict.errors });
  }
  function lookupRule(rule_id) {
    return byId2.get(rule_id) ?? null;
  }
  function allRules({ includeHeld = true } = {}) {
    return [...byId2.values()].filter((rule) => includeHeld || rule.status === "active").sort(byRuleId);
  }
  function rulesForDomain(domain, context = {}, { includeHeld = false } = {}) {
    const want = text(domain);
    const ctx = isRecord2(context) ? context : {};
    return [...byId2.values()].filter((rule) => includeHeld || rule.status === "active").filter((rule) => !want || want === "*" || rule.domain === want || rule.domain.startsWith(want + ".")).filter((rule) => ruleAppliesTo(rule, ctx)).sort(byRuleId);
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
    for (const rule of byId2.values()) {
      if (rule.status === "active") active += 1;
      else held += 1;
      by_domain[rule.domain] = (by_domain[rule.domain] ?? 0) + 1;
    }
    return { total: byId2.size, active, held, seed_errors: errors.length, by_domain };
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
      return byId2.size;
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
  const quantity2 = Number(item.quantity ?? 1);
  base2.instanceCount = quantity2;
  if (!item.include_rebar) return {
    ...base2,
    status: "off",
    perInstance: emptyQuantities(),
    totals: quantityTotals(emptyQuantities(), quantity2),
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
  const quantity2 = quantityOverride == null ? null : numeric(quantityOverride);
  if (quantity2 !== null && !finiteRate(quantity2)) issue(
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
      cuts: [...bin.cuts.entries()].sort((a, b) => b[0] - a[0]).map(([cut_length_inches, quantity2]) => ({ cut_length_inches, quantity: quantity2 })),
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

// src/components/estimator/foundation/foundationReinforcementDraft.js
var isRecord7 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var scalar = (value) => value === null || ["undefined", "string", "number", "boolean"].includes(typeof value) ? value : NaN;
var numeric2 = (value) => {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = foundationInputNumber(value);
  return parsed !== null ? parsed : scalar(value);
};
function createFoundationReinforcementDraft(item = {}) {
  const accepted = item?.reinforcement_calculation_version === 2;
  const design = accepted && isRecord7(item.reinforcement_design) ? structuredClone(item.reinforcement_design) : {
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
    material: accepted && isRecord7(item.reinforcement_material) ? structuredClone(item.reinforcement_material) : { kind: "" },
    overrides: { quantity_ft: item?.custom_rebar_qty ?? null, cost_per_ft: item?.custom_rebar_cost_per_ft ?? null }
  };
}
function prepareFoundationReinforcementDraft(draft) {
  const issues = [];
  const issue = (field, message) => issues.push({ field, code: "reinforcement_draft_invalid", severity: "error", message });
  if (!isRecord7(draft) || draft.schema_version !== 1) {
    issue("schema_version", "A supported version-1 reinforcement proposal is required.");
    return { prepared: null, issues };
  }
  const raw = draft.design;
  if (!isRecord7(raw)) {
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
      if (!isRecord7(record)) {
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
  const source = isRecord7(draft.material) ? draft.material : {};
  const material = {
    kind: scalar(source.kind),
    inventory_id: reference(source.inventory_id),
    name: scalar(source.name),
    reason: scalar(source.reason),
    unit: scalar(source.unit),
    ...numbers(source, ["bar_diameter_inches", "weight_lb_per_ft", "cost_per_ft"])
  };
  const overrides = isRecord7(draft.overrides) ? draft.overrides : {};
  if (draft.overrides != null && !isRecord7(draft.overrides)) issue("overrides", "Proposal overrides must be an object.");
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
  const append = (text5) => {
    characters += text5.length;
    if (characters > MAX_CHARACTERS) throw new RangeError("Reinforcement preview basis is too large.");
    chunks.push(text5);
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
var isRecord8 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var identifier = (value) => typeof value === "string" && Boolean(value.trim()) && value.trim() === value && value.length <= 256;
var finite4 = (value) => typeof value === "number" && Number.isFinite(value);
var amount = (item, key) => finite4(item?.[key]) ? item[key] : null;
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
  return { before, proposed, delta: finite4(delta) ? delta : null };
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
  if (!isRecord8(project) || !Array.isArray(project.items) || project.items.some((item2) => !isRecord8(item2)) || !isRecord8(savedProject) || !Array.isArray(savedProject.items) || savedProject.items.some((item2) => !isRecord8(item2))) {
    issue("reinforcement_proposal_source_required", "Current raw design and acknowledged saved source are required.");
    return unavailable();
  }
  if (!isRecord8(context) || context.loaded !== true || !identifier(context.ownerId) || !identifier(context.sourceId) || context.sourceId !== project.id || savedProject.id !== project.id || !identifier(context.sourceUpdatedAt) || savedProject.updated_date !== context.sourceUpdatedAt || !Number.isSafeInteger(context.generation) || context.generation < 0 || !Number.isSafeInteger(context.editRevision) || context.editRevision < 0 || !(context.estimateId === null || identifier(context.estimateId)) || context.estimateId !== null && !identifier(context.estimateUpdatedAt)) {
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
    const blocked = !isRecord8(settings) || !Array.isArray(inventory) || inventory.some((row) => !isRecord8(row)) || foundationItemInputIssues(item).length || foundationItemCatalogIssues(item, inventory).length;
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
        supports: structuredClone(projection.reinforcement.supports),
        cut_schedule: structuredClone(projection.reinforcement.cutSchedule)
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

// src/components/estimator/foundation/foundationReinforcementEditorSession.js
var plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finite5 = (value) => typeof value === "number" && Number.isFinite(value);
var money2 = (value) => finite5(value) ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Unavailable";
var quantity = (value) => finite5(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not recorded";
var emptyAcknowledgments = () => ({ preliminary: false, warningCodes: [] });
var sameAnchors = (before, after) => before && before.project === after.project && before.savedProject === after.savedProject && before.inventory === after.inventory && before.settings === after.settings && before.contextKey === JSON.stringify(after.context);
var anchors = (input) => ({ ...input, contextKey: JSON.stringify(input.context) });
function section(input, project) {
  const calculation = calcProject(project, input.inventory, input.settings, { savedProject: input.savedProject });
  const base2 = calculation.totals.grand_total;
  const cabinetCost = calculation.totals.total_signage_cabinet_cost;
  const landscapeCost = calculation.totals.total_landscape_cost;
  const total = finite5(base2) && finite5(cabinetCost) && finite5(landscapeCost) ? base2 + cabinetCost + landscapeCost : null;
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
      if (finite5(before.total) && finite5(after.total)) sectionDelta = after.total - before.total;
      if (after.calculation.catalogIssues.length || after.calculation.inputIssues.length) sectionDelta = null;
    } catch {
      sectionDelta = null;
    }
  }
  if (!finite5(sectionDelta)) issues.push({
    code: "reinforcement_section_delta_unavailable",
    severity: "error",
    message: "The full Concrete section delta is unavailable. Resolve other design or catalog issues and refresh before accepting."
  });
  const currentItem = before?.calculation.items.find((item) => item.component_id === componentId);
  const currentProvenance = comparisons?.currentProvenance || "Current amount unavailable";
  const sectionProvenance = before?.calculation.catalogIssues.length || before?.calculation.inputIssues.length ? "Current section with acknowledged fallback amounts where unavailable" : "Current full Concrete section calculation";
  const row = (label, value, provenance) => ({ label, value: money2(value), provenance });
  return {
    id: proposal.id,
    canAccept: proposal.canAccept && finite5(sectionDelta),
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

// s:s://@/components/estimator/idempotentEntityCreate
var ensureIdempotentEntityCreate = (...a) => {
  globalThis.__spies.push(["ensureIdempotent", a]);
  return Promise.resolve({ id: "new-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1) });
};
var newCreationRequestKey = (k) => "key-" + (k || "x") + "-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);

// src/components/estimator/foundation/useFoundationReinforcementEditor.js
function useFoundationReinforcementEditor({ getCurrent, commit }) {
  const [, setRevision] = useState2(0);
  const callbacksRef = useRef({ getCurrent, commit });
  callbacksRef.current = { getCurrent, commit };
  const sessionRef = useRef(null);
  if (sessionRef.current === null) {
    sessionRef.current = createFoundationReinforcementEditorSession({
      getCurrent: () => callbacksRef.current.getCurrent(),
      commit: (updater) => callbacksRef.current.commit(updater),
      createId: () => newCreationRequestKey("foundation_reinforcement_proposal"),
      now: () => (/* @__PURE__ */ new Date()).toISOString(),
      onChange: () => setRevision((r) => r + 1)
    });
  }
  return sessionRef.current;
}

// s:s://@/components/estimator/foundation/FoundationRatesPanel
import { jsx as jsx5 } from "react/jsx-runtime";
var FoundationRatesPanel_default = () => /* @__PURE__ */ jsx5("div", {});

// s:s://@/components/estimator/foundation/FoundationEquipmentTab
import { jsx as jsx6 } from "react/jsx-runtime";
var FoundationEquipmentTab_default = () => /* @__PURE__ */ jsx6("div", {});

// s:s://@/components/estimator/foundation/FoundationTotals
import { jsx as jsx7 } from "react/jsx-runtime";
var FoundationTotals_default = () => /* @__PURE__ */ jsx7("div", {});

// s:s://@/components/estimator/foundation/ConcreteDeliveryPanel
import { jsx as jsx8 } from "react/jsx-runtime";
var ConcreteDeliveryPanel_default = () => /* @__PURE__ */ jsx8("div", {});

// s:s://@/components/estimator/foundation/FoundationBOM
import { jsx as jsx9 } from "react/jsx-runtime";
var FoundationBOM_default = () => /* @__PURE__ */ jsx9("div", {});

// s:s://@/components/estimator/foundation/FoundationFieldPackage
import { jsx as jsx10 } from "react/jsx-runtime";
var FoundationFieldPackage_default = () => /* @__PURE__ */ jsx10("div", {});

// s:s://@/components/estimator/foundation/FoundationDesignBasis
import { jsx as jsx11 } from "react/jsx-runtime";
var FoundationDesignBasis_default = () => /* @__PURE__ */ jsx11("div", {});

// s:s://@/components/estimator/foundation/FoundationBulkMaterialPanel
import { jsx as jsx12 } from "react/jsx-runtime";
var FoundationBulkMaterialPanel_default = () => /* @__PURE__ */ jsx12("div", {});

// s:s://@/components/estimator/foundation/FoundationGuidedSteps
import { jsx as jsx13 } from "react/jsx-runtime";
var FoundationGuidedSteps_default = () => /* @__PURE__ */ jsx13("div", {});

// src/components/estimator/foundation/foundationRevisionDiff.js
var DIM_FIELDS = [
  ["length_inches", "Length"],
  ["width_inches", "Width"],
  ["depth_inches", "Depth"],
  ["diameter", "Diameter"],
  ["quantity", "Qty"],
  ["rotation_degrees", "Rotation"],
  ["grade_offset_inches", "Grade offset"],
  ["include_rebar", "Rebar"]
];
var POLE_FIELDS = [
  ["height_inches", "Height"],
  ["embedment_inches", "Embedment"],
  ["x_inches", "X"],
  ["z_inches", "Z"],
  ["pole_shape", "Shape"]
];
var CAP_FIELDS = [
  ["length_inches", "Cut length"],
  ["position_along_segment_inches", "Position"],
  ["wall_component_id", "Wall"],
  ["segment_component_id", "Segment"]
];
var CAB_FIELDS = [
  ["width_inches", "Width"],
  ["height_inches", "Height"],
  ["depth_inches", "Depth"],
  ["mount_height_inches", "Mount height"],
  ["mount", "Mount"]
];
var PRICE_FIELDS = [
  ["customer_markup_percent", "Markup %"],
  ["customer_price_override", "Price override"]
];
var isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
var byId = (rows) => {
  const m = /* @__PURE__ */ new Map();
  (Array.isArray(rows) ? rows : []).forEach((r, i) => {
    const key = isObj(r) ? r.component_id ?? `idx:${i}` : `idx:${i}`;
    m.set(key, { row: r, index: i });
  });
  return m;
};
var fmt = (v) => {
  if (v === void 0 || v === null || v === "") return "not saved";
  if (v === true) return "yes";
  if (v === false) return "no";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "invalid";
  if (typeof v === "string") return v.length > 24 ? `${v.slice(0, 21)}...` : v;
  return "recorded";
};
var sameVal = (a, b) => {
  if (a === b) return true;
  if ((a === void 0 || a === null || a === "") && (b === void 0 || b === null || b === "")) return true;
  if (typeof a === "number" && typeof b === "number" && !Number.isFinite(a) && !Number.isFinite(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
};
var diffRows = (savedRows, liveRows, fields, labelFor2) => {
  const saved = byId(savedRows), live = byId(liveRows);
  const out = [];
  for (const [key, { row: sRow, index: si }] of saved) {
    const liveHit = live.get(key);
    if (!liveHit) {
      out.push({ change: "removed", label: labelFor2(sRow, si), detail: "removed from the live project" });
      continue;
    }
    for (const [field, fname] of fields) {
      if (!sameVal(sRow?.[field], liveHit.row?.[field])) {
        out.push({ change: "changed", label: labelFor2(liveHit.row, liveHit.index), detail: `${fname}: ${fmt(sRow?.[field])} -> ${fmt(liveHit.row?.[field])}` });
      }
    }
  }
  for (const [key, { row: lRow, index: li }] of live) {
    if (!saved.has(key)) out.push({ change: "added", label: labelFor2(lRow, li), detail: "new in the live project" });
  }
  return out;
};
var itemLabel = (it, i) => typeof it?.description === "string" && it.description.trim() || `Foundation ${i + 1}`;
var wallLabel = (w, i) => w?.name || `Wall ${i + 1}`;
var poleLabel = (p, i) => `Pole ${i + 1}`;
var capLabel = (c, i) => `Cap ${i + 1}`;
var cabLabel = (c, i) => `Cabinet ${i + 1}`;
function diffFoundationProjects(saved, live) {
  const rows = [];
  if (!isObj(saved)) {
    return [{ change: "unavailable", label: "Saved baseline", detail: "no saved project snapshot is recorded for this session -- comparison unavailable." }];
  }
  if (!isObj(live)) return rows;
  const pushAll = (section2, list2) => list2.forEach((r) => rows.push({ section: section2, ...r }));
  pushAll("items", diffRows(saved.items, live.items, DIM_FIELDS, itemLabel));
  pushAll("walls", diffRows(saved.walls, live.walls, [["heightInches", "Height"], ["name", "Name"], ["foundation_component_id", "Foundation"]], wallLabel));
  pushAll("poles", diffRows(saved.poles, live.poles, POLE_FIELDS, poleLabel));
  pushAll("wall_caps", diffRows(saved.wall_caps, live.wall_caps, CAP_FIELDS, capLabel));
  pushAll("signage_cabinets", diffRows(saved.signage_cabinets, live.signage_cabinets, CAB_FIELDS, cabLabel));
  pushAll("pricing", PRICE_FIELDS.filter(([f]) => !sameVal(saved[f], live[f])).map(([f, name]) => ({ change: "changed", label: "Customer pricing", detail: `${name}: ${fmt(saved[f])} -> ${fmt(live[f])}` })));
  ["engineering_approved", "procurement_ready"].forEach((f) => {
    if (!sameVal(saved[f], live[f])) {
      rows.push({ section: "review", change: "changed", label: "Review state", detail: `${f}: ${fmt(saved[f])} -> ${fmt(live[f])}` });
    }
  });
  const land = (p) => Object.keys(p?.landscape?.cells || {}).length;
  if (land(saved) !== land(live)) {
    rows.push({ section: "landscape", change: "changed", label: "Landscape", detail: `painted cells: ${land(saved)} -> ${land(live)}` });
  }
  return rows;
}
function summarizeFoundationDiff(rows) {
  const counts = { added: 0, removed: 0, changed: 0, unavailable: 0 };
  (rows || []).forEach((r) => {
    counts[r.change] = (counts[r.change] || 0) + 1;
  });
  return counts;
}

// src/components/estimator/foundation/FoundationWallsPanel.jsx
import React from "react";

// s:s://@/components/ui/button
import { jsx as jsx14 } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx14("button", { type: "button", ...p, children: p.children });

// src/components/estimator/foundation/FoundationWallsPanel.jsx
import { Trash2, Plus, PenLine } from "lucide-react";

// src/components/estimator/foundation/foundationFtInEntry.js
import { createElement as h, useId, useState as useState3 } from "react";
var FT_MARKS = /['′’‘`´]/g;
var IN_MARKS = /["″”]/g;
var DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
var dimensionNumberToken = (text5) => {
  const t = String(text5).trim();
  if (t === "") return null;
  if (DECIMAL.test(t)) {
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }
  const frac = t.match(/^(\d+(?:\.\d*)?|\.\d+)\s*\/\s*(\d+(?:\.\d*)?|\.\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!Number.isFinite(den) || den === 0) return null;
    const v = Number(frac[1]) / den;
    return Number.isFinite(v) ? v : null;
  }
  const mixed = t.match(/^(\d+(?:\.\d*)?|\.\d+)\s+(\d+(?:\.\d*)?|\.\d+)\s*\/\s*(\d+(?:\.\d*)?|\.\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!Number.isFinite(den) || den === 0) return null;
    const v = Number(mixed[1]) + Number(mixed[2]) / den;
    return Number.isFinite(v) ? v : null;
  }
  return null;
};
var dashPair = (body) => {
  const i = body.indexOf("-");
  if (i < 0) return null;
  const left = body.slice(0, i);
  const right = body.slice(i + 1);
  if (left === "" || right === "" || right.includes("-")) return null;
  const a = dimensionNumberToken(left);
  const b = dimensionNumberToken(right);
  if (a === null || b === null) return null;
  return right.includes("/") ? [0, a + b] : [a, b];
};
var spacePair = (body) => {
  const parts = body.split(" ").filter((p) => p !== "");
  if (parts.length !== 2 || parts[1].includes("/")) return null;
  const a = dimensionNumberToken(parts[0]);
  const b = dimensionNumberToken(parts[1]);
  return a === null || b === null ? null : [a, b];
};
function parseFoundationDimension(text5) {
  if (typeof text5 === "number") {
    return Number.isFinite(text5) ? { ok: true, inches: text5 } : { ok: false, reason: "not_finite" };
  }
  if (typeof text5 !== "string") return { ok: false, reason: "not_text" };
  let s = text5.trim();
  if (s === "") return { ok: false, reason: "blank" };
  s = s.replace(FT_MARKS, "'").replace(IN_MARKS, '"').replace(/\s+/g, " ");
  let sign = 1;
  const leading = s.match(/^[+-]\s*/);
  if (leading) {
    if (leading[0][0] === "-") sign = -1;
    s = s.slice(leading[0].length);
  }
  if (s === "") return { ok: false, reason: "blank" };
  const total = (feet, inches) => {
    const v = sign * (feet * 12 + inches);
    return Number.isFinite(v) ? { ok: true, inches: v } : { ok: false, reason: "not_finite" };
  };
  if (s.includes("'")) {
    const parts = s.split("'");
    if (parts.length !== 2) return { ok: false, reason: "bad_marks" };
    const feet = dimensionNumberToken(parts[0]);
    if (feet === null) return { ok: false, reason: "feet" };
    let rest = parts[1].trim();
    const separator = rest.match(/^[+-]\s*/);
    if (separator) rest = rest.slice(separator[0].length).trim();
    if (rest.endsWith('"')) rest = rest.slice(0, -1).trim();
    if (rest.includes('"') || rest.includes("'")) return { ok: false, reason: "bad_marks" };
    const inches = rest === "" ? 0 : dimensionNumberToken(rest);
    if (inches === null) return { ok: false, reason: "inches" };
    return total(feet, inches);
  }
  if (s.includes('"')) {
    if (!s.endsWith('"')) return { ok: false, reason: "bad_marks" };
    const body = s.slice(0, -1).trim();
    if (body === "" || body.includes('"') || body.includes("'")) {
      return { ok: false, reason: "bad_marks" };
    }
    const direct = dimensionNumberToken(body);
    if (direct !== null) return { ok: true, inches: sign * direct };
    const pair = dashPair(body) ?? spacePair(body);
    if (pair) return total(pair[0], pair[1]);
    return { ok: false, reason: "inches" };
  }
  const tokens = s.split(" ");
  if (tokens.length === 1) {
    const v = dimensionNumberToken(tokens[0]);
    return v === null ? { ok: false, reason: "inches" } : { ok: true, inches: sign * v };
  }
  if (tokens.length === 2) {
    if (tokens[1].includes("/")) {
      const v = dimensionNumberToken(`${tokens[0]} ${tokens[1]}`);
      return v === null ? { ok: false, reason: "inches" } : { ok: true, inches: sign * v };
    }
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(tokens[1]);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  if (tokens.length === 3) {
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(`${tokens[1]} ${tokens[2]}`);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  return { ok: false, reason: "tokens" };
}
function formatFoundationDimension(inches) {
  if (!Number.isFinite(inches)) return "";
  const sign = inches < 0 ? "-" : "";
  const magnitude = Math.abs(inches);
  const feet = Math.floor(magnitude / 12);
  const rest = Math.round((magnitude - feet * 12) * 1e4) / 1e4;
  if (feet === 0) return `${sign}${rest}"`;
  if (rest === 0) return `${sign}${feet}'`;
  return `${sign}${feet}' ${rest}"`;
}
var foundationDimensionDraftValue = (text5) => {
  if (typeof text5 !== "string") return text5;
  if (text5.trim() === "") return "";
  const parsed = parseFoundationDimension(text5);
  return parsed.ok ? parsed.inches : text5;
};
var foundationDimensionStoredText = (value) => typeof value === "number" && Number.isFinite(value) ? formatFoundationDimension(value) : value === null || value === void 0 ? "" : String(value);
var FOUNDATION_DIMENSION_FORMAT_HELP = `inches (150) or feet/inches like 12' 6", 12.5', 12 6, or 3/8"`;
var foundationDimensionInputIssue = (value) => typeof value === "string" && value.trim() !== "" ? `Not a recognized measurement \u2014 enter ${FOUNDATION_DIMENSION_FORMAT_HELP}.` : null;
function FoundationDimensionInput({
  label,
  help,
  value,
  onCommit,
  placeholder,
  invalid,
  describedBy,
  ariaLabel,
  id,
  disabled,
  labelClassName,
  inputClassName
}) {
  const [editing, setEditing] = useState3(null);
  const autoId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const base2 = id ?? `dim-${autoId}`;
  const hint = foundationDimensionInputIssue(value);
  const hintId = `${base2}-dimhint`;
  const helpId = `${base2}-dimhelp`;
  const described = [
    describedBy,
    hint ? hintId : null,
    editing !== null && help ? helpId : null
  ].filter(Boolean).join(" ") || void 0;
  return h(
    "label",
    { className: labelClassName ?? "text-xs text-gray-500" },
    label,
    h(Input, {
      id,
      type: "text",
      // full keyboard: the ft/in marks ( ' " - space / ) are the feature —
      // decimal/numeric pads would lock them out on mobile.
      inputMode: "text",
      disabled,
      className: inputClassName,
      value: editing !== null ? editing : foundationDimensionStoredText(value),
      placeholder,
      title: help,
      "aria-label": ariaLabel ?? (typeof label === "string" ? label : void 0),
      "aria-invalid": invalid || !!hint || void 0,
      "aria-describedby": described,
      onFocus: () => setEditing(foundationDimensionStoredText(value)),
      onChange: (e) => {
        setEditing(e.target.value);
        onCommit(foundationDimensionDraftValue(e.target.value));
      },
      onBlur: () => setEditing(null)
    }),
    hint ? h("span", {
      id: hintId,
      role: "status",
      className: "block text-[10px] text-amber-700 mt-0.5"
    }, hint) : null,
    editing !== null && help ? h("span", {
      id: helpId,
      className: "block text-[10px] text-gray-400 mt-0.5"
    }, help) : null
  );
}

// s:s://./WallShapeEditor
function WallShapeEditor_default() {
  return null;
}

// src/components/estimator/foundation/FoundationWallsPanel.jsx
import { jsx as jsx15, jsxs } from "react/jsx-runtime";
var wallDimMeta = (field) => foundationDimensionFieldMeta("wall", field);
function WallRow({ wall, index, options, pricing, onChange, onRemove, items = [] }) {
  const c = wall.calculatedCosts || {};
  const set = (changes) => onChange(index, changes);
  const pricingIssues = pricing?.issues ?? foundationWallPricingIssues(wall, options, index);
  const pricingUnavailable = pricing?.available === false || pricingIssues.length > 0;
  const amt = (v) => hasFoundationCostSnapshot(v) ? money(v) : "Not saved";
  const [showEditor, setShowEditor] = React.useState(false);
  const fieldIssue = (field) => pricingIssues.some((i) => i.field === field);
  const describedBy = (field) => fieldIssue(field) ? `wall-${index}-pricing` : void 0;
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-3 space-y-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx15(
        Input,
        {
          className: "min-w-0 max-w-[220px]",
          value: wall.name || "",
          placeholder: `Wall ${index + 1}`,
          onChange: (e) => set({ name: e.target.value })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex shrink-0 items-center gap-3", children: [
        /* @__PURE__ */ jsx15("span", { className: "whitespace-nowrap font-bold text-gray-900", children: amt(c.totalCost) }),
        /* @__PURE__ */ jsx15(Button, { variant: "ghost", size: "icon", onClick: () => onRemove(index), children: /* @__PURE__ */ jsx15(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2", children: [
      /* @__PURE__ */ jsx15(
        FoundationDimensionInput,
        {
          ...wallDimMeta("heightInches"),
          value: wall.heightInches ?? "",
          onCommit: (v) => set({ heightInches: v }),
          ariaLabel: "Wall height (in)",
          invalid: fieldIssue("heightInches") || void 0,
          describedBy: describedBy("heightInches")
        }
      ),
      /* @__PURE__ */ jsx15(
        FoundationDimensionInput,
        {
          ...wallDimMeta("mortarGapInches"),
          value: wall.mortarGapInches ?? 0.375,
          onCommit: (v) => set({ mortarGapInches: v }),
          ariaLabel: "Wall mortar gap (in)",
          invalid: fieldIssue("mortarGapInches") || void 0,
          describedBy: describedBy("mortarGapInches")
        }
      ),
      /* @__PURE__ */ jsx15(
        FoundationDimensionInput,
        {
          ...wallDimMeta("wasteFraction"),
          value: wall.wasteFraction ?? "",
          onCommit: (v) => set({ wasteFraction: v === "" || v == null ? void 0 : v }),
          ariaLabel: "Wall waste fraction",
          invalid: fieldIssue("wasteFraction") || void 0,
          describedBy: describedBy("wasteFraction")
        }
      ),
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
        "Wall material",
        /* @__PURE__ */ jsxs(
          "select",
          {
            className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
            value: wall.materialId || "",
            "aria-label": "Wall material",
            "aria-invalid": fieldIssue("materialId") || void 0,
            "aria-describedby": describedBy("materialId"),
            onChange: (e) => set({ materialId: e.target.value }),
            children: [
              /* @__PURE__ */ jsx15("option", { value: "", children: "Select material -  -  - " }),
              wall.materialId && !options.some((o) => o.id === wall.materialId) && /* @__PURE__ */ jsx15("option", { value: wall.materialId, disabled: true, children: `Catalog material unavailable (${wall.materialId})` }),
              options.map((o) => /* @__PURE__ */ jsx15("option", { value: o.id, children: o.material_name }, o.id))
            ]
          }
        ),
        wall.materialId && !options.some((o) => o.id === wall.materialId) && /* @__PURE__ */ jsx15("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog material unavailable; current pricing needs review." })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
        "Foundation",
        /* @__PURE__ */ jsxs(
          "select",
          {
            className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
            value: wall.foundation_component_id ?? "",
            "aria-label": "Wall foundation",
            onChange: (e) => {
              const id = e.target.value;
              const i = items.findIndex((it) => it.component_id === id);
              set({
                foundation_component_id: id,
                foundation_index: id === "" || i < 0 ? void 0 : i
              });
            },
            children: [
              /* @__PURE__ */ jsx15("option", { value: "", children: "Freestanding (no foundation)" }),
              wall.foundation_component_id && !items.some((it) => it.component_id === wall.foundation_component_id) && /* @__PURE__ */ jsx15("option", { value: wall.foundation_component_id, disabled: true, children: `Missing foundation (${String(wall.foundation_component_id).slice(0, 18)}...)` }),
              items.map((it, i) => /* @__PURE__ */ jsx15("option", { value: it.component_id || "", children: it.name || it.label || `Foundation ${i + 1}` }, it.component_id || i))
            ]
          }
        ),
        wall.foundation_component_id && !items.some((it) => it.component_id === wall.foundation_component_id) && /* @__PURE__ */ jsx15("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Referenced foundation is not in this section; the wall stays priced until reassigned." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg bg-slate-50 p-2 space-y-2", children: [
      /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-xs font-medium text-gray-700", children: [
        /* @__PURE__ */ jsx15(
          "input",
          {
            type: "checkbox",
            checked: !!wall.includeInternalWall,
            onChange: (e) => set({ includeInternalWall: e.target.checked })
          }
        ),
        "Internal fill wall"
      ] }),
      wall.includeInternalWall && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
          "Fill material",
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: wall.internalMaterialId || "",
              "aria-label": "Internal wall material",
              "aria-invalid": fieldIssue("internalMaterialId") || void 0,
              "aria-describedby": describedBy("internalMaterialId"),
              onChange: (e) => set({ internalMaterialId: e.target.value }),
              children: [
                /* @__PURE__ */ jsx15("option", { value: "", children: "Select material -  -  - " }),
                wall.internalMaterialId && !options.some((o) => o.id === wall.internalMaterialId) && /* @__PURE__ */ jsx15("option", { value: wall.internalMaterialId, disabled: true, children: `Catalog material unavailable (${wall.internalMaterialId})` }),
                options.map((o) => /* @__PURE__ */ jsx15("option", { value: o.id, children: o.material_name }, o.id))
              ]
            }
          ),
          wall.internalMaterialId && !options.some((o) => o.id === wall.internalMaterialId) && /* @__PURE__ */ jsx15("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog material unavailable; current pricing needs review." })
        ] }),
        /* @__PURE__ */ jsx15(
          FoundationDimensionInput,
          {
            ...wallDimMeta("internalWallHeightInches"),
            value: wall.internalWallHeightInches ?? wall.heightInches ?? "",
            onCommit: (v) => set({ internalWallHeightInches: v }),
            ariaLabel: "Internal wall height (in)",
            invalid: fieldIssue("internalWallHeightInches") || void 0,
            describedBy: describedBy("internalWallHeightInches")
          }
        ),
        /* @__PURE__ */ jsx15(
          FoundationDimensionInput,
          {
            ...wallDimMeta("internalMortarGapInches"),
            value: wall.internalMortarGapInches ?? 0.375,
            onCommit: (v) => set({ internalMortarGapInches: v }),
            ariaLabel: "Internal wall mortar gap (in)",
            invalid: fieldIssue("internalMortarGapInches") || void 0,
            describedBy: describedBy("internalMortarGapInches")
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600", children: [
      c.materialQuantityUnit === "cy" ? /* @__PURE__ */ jsxs("div", { children: [
        "CY: ",
        /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.totalBricks) ? c.totalBricks.toFixed(2) : "Not saved" })
      ] }) : /* @__PURE__ */ jsxs("div", { children: [
        "Units: ",
        /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.totalBricks) ? Math.round(c.totalBricks) : "Not saved" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Courses: ",
        /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.numCourses) ? Math.ceil(c.numCourses) : "Not saved" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Material: ",
        /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: amt(c.materialCost) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Mortar: ",
        /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: amt(c.mortarCost) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Labor: ",
        /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: amt(c.laborCost) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Labor hrs: ",
        /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.laborHours) ? c.laborHours.toFixed(1) : "Not saved" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Linear in: ",
        /* @__PURE__ */ jsx15("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(c.totalLinearInches) ? Math.round(c.totalLinearInches) : "Not saved" })
      ] }),
      pricingUnavailable && /* @__PURE__ */ jsx15("div", { className: "col-span-full text-[10px] font-semibold text-amber-700", children: "Saved amounts (not current pricing)" }),
      pricingIssues.length > 0 && /* @__PURE__ */ jsx15("div", { role: "status", className: "col-span-full text-[10px] text-amber-700 space-y-0.5", id: `wall-${index}-pricing`, children: pricingIssues.map((issue) => /* @__PURE__ */ jsx15("p", { children: issue.message }, `${issue.field}-${issue.code}`)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxs(
        Button,
        {
          variant: "outline",
          size: "sm",
          onClick: () => setShowEditor((v) => !v),
          "aria-expanded": showEditor,
          "aria-invalid": fieldIssue("shape") || void 0,
          "aria-describedby": describedBy("shape"),
          children: [
            /* @__PURE__ */ jsx15(PenLine, { className: "w-4 h-4", "aria-hidden": "true" }),
            " ",
            showEditor ? "Hide outline" : "Wall outline"
          ]
        }
      ),
      fieldIssue("shape") ? /* @__PURE__ */ jsx15("span", { className: "text-xs text-amber-600", children: "Outline geometry needs repair before repricing - see diagnostics above." }) : !wall.shape?.segments?.length ? /* @__PURE__ */ jsx15("span", { className: "text-xs text-amber-600", children: "No outline yet - draw the wall footprint before estimating quantities." }) : null
    ] }),
    showEditor && /* @__PURE__ */ jsx15(WallShapeEditor_default, { shape: wall.shape, onChange: (shape) => set({ shape }) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs("span", { className: "text-[11px] font-semibold text-gray-600", children: [
          "Openings (",
          (wall.openings || []).length,
          ")"
        ] }),
        /* @__PURE__ */ jsx15(
          "button",
          {
            type: "button",
            onClick: () => set({ openings: [...wall.openings || [], { id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, width_inches: "", height_inches: "" }] }),
            className: "h-5 px-1.5 rounded-sm border border-gray-300 text-[10px] text-gray-600 hover:bg-gray-50",
            children: "+ Opening"
          }
        )
      ] }),
      (wall.openings || []).map((o, oi) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 mt-1", children: [
        /* @__PURE__ */ jsx15(
          "input",
          {
            type: "number",
            min: "0",
            step: "0.25",
            placeholder: "W in",
            value: o.width_inches ?? "",
            onChange: (e) => set({ openings: (wall.openings || []).map((row, j) => j === oi ? { ...row, width_inches: e.target.value === "" ? void 0 : Number(e.target.value) } : row) }),
            className: "w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
            "aria-label": `Wall opening ${oi + 1} width (inches)`
          }
        ),
        /* @__PURE__ */ jsx15(
          "input",
          {
            type: "number",
            min: "0",
            step: "0.25",
            placeholder: "H in",
            value: o.height_inches ?? "",
            onChange: (e) => set({ openings: (wall.openings || []).map((row, j) => j === oi ? { ...row, height_inches: e.target.value === "" ? void 0 : Number(e.target.value) } : row) }),
            className: "w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
            "aria-label": `Wall opening ${oi + 1} height (inches)`
          }
        ),
        /* @__PURE__ */ jsx15(
          "button",
          {
            type: "button",
            onClick: () => set({ openings: (wall.openings || []).filter((_, j) => j !== oi) }),
            className: "h-7 px-1.5 rounded-sm border border-gray-300 text-[10px] text-gray-500 hover:bg-gray-50",
            "aria-label": `Remove opening ${oi + 1}`,
            children: "x"
          }
        )
      ] }, o.id || oi))
    ] })
  ] });
}
function FoundationWallsPanel({ walls = [], options = [], onChange, wallPricing: wallPricing2 = [], items = [] }) {
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
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx15("h2", { className: "font-semibold text-gray-900", children: "Masonry Walls" }),
      /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: addWall, children: [
        /* @__PURE__ */ jsx15(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
        " Wall"
      ] })
    ] }),
    walls.length === 0 ? /* @__PURE__ */ jsx15("div", { className: "text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No walls on this section." }) : walls.map((wall, index) => /* @__PURE__ */ jsx15(
      WallRow,
      {
        wall,
        index,
        options,
        pricing: wallPricing2[index],
        onChange: patchWall,
        onRemove: removeWall,
        items
      },
      wall.component_id || index
    ))
  ] });
}

// src/components/estimator/foundation/FoundationWallCapsPanel.jsx
import { useState as useState4 } from "react";
import { Trash2 as Trash22, Plus as Plus2 } from "lucide-react";
import { Fragment, jsx as jsx16, jsxs as jsxs2 } from "react/jsx-runtime";
var capDimMeta = (field) => foundationDimensionFieldMeta("wallCap", field);
function FoundationWallCapsPanel({ caps = [], walls = [], options = [], onChange }) {
  const [capWallId, setCapWallId] = useState4("");
  const [selectedWallIds, setSelectedWallIds] = useState4(() => /* @__PURE__ */ new Set());
  const toggleWall = (id) => setSelectedWallIds((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const patchCap = (index, changes) => onChange(caps.map((c, i) => i === index ? { ...c, ...changes } : c));
  const capWalls = (wallIds) => {
    const inv = options[0];
    const stockLength = inventoryFiniteNumber(inv?.cap_stock_length_inches);
    const capped = new Set(caps.filter((c) => c?.locked !== false).map((c) => c.segment_component_id).filter(Boolean));
    const made = [];
    wallIds.forEach((wallId) => {
      const wi = walls.findIndex((w) => w.component_id === wallId);
      const wall = walls[wi];
      (wall?.shape?.segments || []).forEach((sg, si) => {
        if (sg?.component_id && capped.has(sg.component_id)) return;
        const len = inventoryFiniteNumber(sg?.length);
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: wi < 0 ? void 0 : wi,
          segment_component_id: sg?.component_id || "",
          segment_index: si,
          position_along_segment_inches: 0,
          length_inches: len !== null && len > 0 ? len : stockLength !== null && stockLength > 0 ? stockLength : "",
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0
        });
        if (sg?.component_id) capped.add(sg.component_id);
      });
    });
    if (made.length) onChange([...caps, ...made]);
  };
  const capFit = (wallId) => {
    const inv = options[0];
    const stockLength = inventoryFiniteNumber(inv?.cap_stock_length_inches);
    const wall = walls.find((w) => w.component_id === wallId);
    if (!wall || !Number.isFinite(stockLength) || stockLength <= 0) return;
    const capped = new Set(caps.filter((c) => c?.locked !== false).map((c) => c.segment_component_id).filter(Boolean));
    const made = [];
    const wi = walls.indexOf(wall);
    (wall?.shape?.segments || []).forEach((sg, si) => {
      if (sg?.component_id && capped.has(sg.component_id)) return;
      const len = inventoryFiniteNumber(sg?.length);
      if (!Number.isFinite(len) || len <= 0) return;
      let pos = 0, n = 0;
      while (pos + stockLength <= len && n < 200) {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: wi < 0 ? void 0 : wi,
          segment_component_id: sg?.component_id || "",
          segment_index: si,
          position_along_segment_inches: Math.round(pos * 100) / 100,
          length_inches: stockLength,
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0
        });
        pos += stockLength;
        n += 1;
      }
      if (len - pos > 0.01) {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: wi < 0 ? void 0 : wi,
          segment_component_id: sg?.component_id || "",
          segment_index: si,
          position_along_segment_inches: Math.round(pos * 100) / 100,
          length_inches: "",
          // remainder tail -- authored entry (held-closed)
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0
        });
      }
      if (sg?.component_id) capped.add(sg.component_id);
    });
    if (made.length) onChange([...caps, ...made]);
  };
  const capCorners = (wallId) => {
    const inv = options[0];
    const wall = walls.find((w) => w.component_id === wallId);
    const pts = wall?.shape?.points || [];
    const closed = wall?.shape?.closed === true;
    if (pts.length < 2) return;
    const cross = (a, b, c) => (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    const n = pts.length;
    const cornerIdx = [];
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      if (Math.abs(cross(a, b, c)) > 0.01) cornerIdx.push(i);
    }
    const made = cornerIdx.map((vi) => ({
      id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      cap_inventory_id: inv?.id || "",
      wall_component_id: wallId,
      wall_index: walls.findIndex((w) => w.component_id === wallId),
      end_treatment: "mitered",
      length_inches: "",
      position_along_segment_inches: 0,
      rotation_offset_degrees: 0,
      lateral_offset_inches: 0,
      corner_vertex_index: vi
    }));
    if (!closed) {
      [0, n - 1].forEach((ei) => {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: walls.findIndex((w) => w.component_id === wallId),
          end_treatment: "straight",
          length_inches: "",
          position_along_segment_inches: 0,
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0,
          end_vertex_index: ei
        });
      });
    }
    if (made.length) onChange([...caps, ...made]);
  };
  const removeCap = (index) => {
    if (!window.confirm(`Remove cap ${index + 1}?`)) return;
    onChange(caps.filter((_, i) => i !== index));
  };
  const addCap = () => {
    const inv = options[0];
    const stockLength = inventoryFiniteNumber(inv?.cap_stock_length_inches);
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
  const cutList = [];
  walls.forEach((wall, wi) => {
    (wall?.shape?.segments || []).forEach((sg, si) => {
      const segLen = inventoryFiniteNumber(sg?.length);
      const segCaps = caps.map((c, ci) => ({ c, ci })).filter(({ c }) => c.segment_component_id && c.segment_component_id === sg?.component_id).map(({ c, ci }) => {
        const cut = inventoryFiniteNumber(wallCapCutLengthValue(c));
        const pos = inventoryFiniteNumber(c.position_along_segment_inches);
        return { ci, cut, pos: pos !== null ? pos : 0 };
      }).sort((a, b) => a.pos - b.pos);
      if (!segCaps.length) return;
      const pieces = [];
      let cursor = 0;
      segCaps.forEach(({ ci, cut, pos }) => {
        const start = Math.max(0, pos);
        if (segLen !== null && start > cursor) {
          pieces.push({ gap: start - cursor });
        }
        const overlap = cursor > start ? cursor - start : 0;
        if (cut !== null && cut > 0) {
          pieces.push({ ci, start, end: start + cut, over: segLen !== null && start + cut > segLen, overlap });
          cursor = Math.max(cursor, start + cut);
        } else {
          pieces.push({ ci, start, end: null, uncut: true });
        }
      });
      if (segLen !== null && cursor < segLen) pieces.push({ gap: segLen - cursor });
      cutList.push({
        wall: wall?.name || `Wall ${wi + 1}`,
        seg: si + 1,
        segLen,
        pieces
      });
    });
  });
  const splitCap = (index) => {
    const cap = caps[index];
    const inv = options.find((o) => o.id === cap?.cap_inventory_id);
    const stock = inventoryFiniteNumber(inv?.cap_stock_length_inches);
    const cut = inventoryFiniteNumber(wallCapCutLengthValue(cap));
    if (!cap || stock === null || stock <= 0 || cut === null || cut <= stock) return;
    const pos = inventoryFiniteNumber(cap.position_along_segment_inches) ?? 0;
    const next = [...caps];
    next.splice(
      index,
      1,
      { ...cap, length_inches: stock },
      {
        ...cap,
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        component_id: void 0,
        length_inches: cut - stock,
        position_along_segment_inches: pos + stock
      }
    );
    onChange(next);
  };
  const capIssues = foundationWallCapCatalogIssues(caps, options);
  const unavailableCaps = new Set(capIssues.filter((issue) => issue.code !== "wall_cap_cost_total_invalid").map((issue) => issue.index));
  const geometryIssues = (index) => capIssues.filter((issue) => issue.index === index && ["length_inches", "cap_stock_length_inches"].includes(issue.field));
  return /* @__PURE__ */ jsxs2("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx16("h2", { className: "font-semibold text-gray-900", children: "Wall Caps" }),
        /* @__PURE__ */ jsx16("p", { className: "text-xs text-gray-500", children: "Full stock price is charged per cut piece." })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-1.5 flex-wrap justify-end", children: [
        /* @__PURE__ */ jsxs2(
          "select",
          {
            className: "h-8 rounded-md border border-input bg-transparent px-2 text-xs",
            value: capWallId,
            "aria-label": "Wall to cap",
            onChange: (e) => setCapWallId(e.target.value),
            children: [
              /* @__PURE__ */ jsx16("option", { value: "", children: "This wall\u2026" }),
              walls.map((w, i) => /* @__PURE__ */ jsx16("option", { value: w.component_id || "", children: w.name || `Wall ${i + 1}` }, w.component_id || i))
            ]
          }
        ),
        /* @__PURE__ */ jsx16(
          Button,
          {
            variant: "outline",
            size: "sm",
            disabled: options.length === 0 || !capWallId,
            onClick: () => capWalls([capWallId]),
            children: "Cap wall"
          }
        ),
        /* @__PURE__ */ jsx16(
          Button,
          {
            variant: "outline",
            size: "sm",
            disabled: options.length === 0 || !capWallId,
            onClick: () => capFit(capWallId),
            children: "Fit caps"
          }
        ),
        /* @__PURE__ */ jsx16(
          Button,
          {
            variant: "outline",
            size: "sm",
            disabled: options.length === 0 || walls.length === 0,
            onClick: () => capWalls(walls.map((w) => w.component_id)),
            children: "Cap all walls"
          }
        ),
        (() => {
          const dangling = caps.filter((c) => {
            const w = walls.find((x) => x.component_id === c?.wall_component_id);
            const segs = w?.shape?.segments || [];
            return c?.segment_component_id && !segs.some((s) => s?.component_id === c.segment_component_id);
          });
          return dangling.length > 0 && /* @__PURE__ */ jsxs2(
            Button,
            {
              variant: "outline",
              size: "sm",
              title: `Re-anchor ${dangling.length} dangling cap${dangling.length === 1 ? "" : "s"} to their wall's first available segment`,
              onClick: () => onChange(caps.map((c) => {
                const w = walls.find((x) => x.component_id === c?.wall_component_id);
                const segs = w?.shape?.segments || [];
                if (c?.segment_component_id && !segs.some((s) => s?.component_id === c.segment_component_id)) {
                  return { ...c, segment_component_id: segs[0]?.component_id || c.segment_component_id, segment_index: 0 };
                }
                return c;
              })),
              children: [
                "Re-anchor ",
                dangling.length
              ]
            }
          );
        })(),
        caps.length > 0 && (() => {
          const lockedCount = caps.filter((c) => c?.locked !== false).length;
          const freeCount = caps.length - lockedCount;
          return /* @__PURE__ */ jsxs2("span", { className: "text-[10px] text-gray-500", title: "Caps that hold their segment vs free for regeneration", children: [
            lockedCount,
            " locked hold",
            lockedCount === 1 ? "" : "s",
            " \xB7 ",
            freeCount,
            " free to regenerate"
          ] });
        })(),
        walls.length > 1 && /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsx16("div", { className: "flex items-center gap-1 flex-wrap", role: "group", "aria-label": "Walls to cap", children: walls.map((w, i) => {
            const id = w.component_id || "";
            const checked = selectedWallIds.has(id);
            return /* @__PURE__ */ jsxs2("label", { className: "flex items-center gap-1 text-[11px] text-gray-600 border rounded px-1.5 h-7", children: [
              /* @__PURE__ */ jsx16(
                "input",
                {
                  type: "checkbox",
                  checked,
                  onChange: () => toggleWall(id),
                  "aria-label": `Select ${w.name || `wall ${i + 1}`} for capping`
                }
              ),
              w.name || `Wall ${i + 1}`
            ] }, id || i);
          }) }),
          /* @__PURE__ */ jsx16(
            Button,
            {
              variant: "outline",
              size: "sm",
              disabled: options.length === 0 || selectedWallIds.size === 0,
              onClick: () => capWalls([...selectedWallIds]),
              children: "Cap selected"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2(Button, { variant: "outline", size: "sm", onClick: addCap, disabled: options.length === 0, children: [
          /* @__PURE__ */ jsx16(Plus2, { className: "w-4 h-4", "aria-hidden": "true" }),
          " Cap"
        ] }),
        /* @__PURE__ */ jsx16(
          Button,
          {
            variant: "outline",
            size: "sm",
            disabled: options.length === 0 || !capWallId,
            onClick: () => capCorners(capWallId),
            title: "Mint a mitered cap at each wall vertex plus end-pieces on open runs",
            children: "Corner pieces"
          }
        )
      ] })
    ] }),
    options.length === 0 && /* @__PURE__ */ jsx16("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: "Wall cap catalog unavailable \xE2\u20AC\u201D existing rows remain editable; new caps cannot be added." }),
    cutList.length > 0 && /* @__PURE__ */ jsxs2("details", { className: "bg-slate-50 border border-slate-200 rounded-lg px-3 py-2", children: [
      /* @__PURE__ */ jsxs2("summary", { className: "text-[11px] font-semibold text-gray-700 cursor-pointer select-none", children: [
        "Cut list \u2014 ",
        cutList.reduce((s, r) => s + r.pieces.filter((p) => p.ci !== void 0).length, 0),
        " piece",
        cutList.reduce((s, r) => s + r.pieces.filter((p) => p.ci !== void 0).length, 0) === 1 ? "" : "s",
        " on ",
        cutList.length,
        " segment",
        cutList.length === 1 ? "" : "s"
      ] }),
      /* @__PURE__ */ jsx16("div", { className: "mt-2 space-y-1.5 text-[11px] text-gray-700", children: cutList.map((row) => /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsxs2("span", { className: "font-medium text-gray-800", children: [
          row.wall,
          " \xB7 Segment ",
          row.seg
        ] }),
        row.segLen !== null && /* @__PURE__ */ jsxs2("span", { className: "text-gray-500", children: [
          " (",
          Math.round(row.segLen),
          " in)"
        ] }),
        /* @__PURE__ */ jsxs2("span", { className: "text-gray-500", children: [
          " \u2014 ",
          row.pieces.map((p, pi) => {
            if (p.gap !== void 0) return /* @__PURE__ */ jsxs2("span", { className: "text-amber-700", children: [
              "gap ",
              Math.round(p.gap),
              "\u2033"
            ] }, pi);
            if (p.uncut) return /* @__PURE__ */ jsxs2("span", { children: [
              "cap ",
              p.ci + 1,
              " @ ",
              Math.round(p.start),
              "\u2033 (no cut length)"
            ] }, pi);
            return /* @__PURE__ */ jsxs2("span", { className: p.over ? "text-red-600 font-medium" : void 0, children: [
              "cap ",
              p.ci + 1,
              " @ ",
              Math.round(p.start),
              "\u2033\u2013",
              Math.round(p.end),
              "\u2033",
              p.over ? " (overruns segment)" : "",
              p.overlap ? ` (miter overlap ${Math.round(p.overlap)}\u2033)` : ""
            ] }, pi);
          }).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [])
        ] })
      ] }, `${row.wall}:${row.seg}`)) })
    ] }),
    caps.length === 0 ? /* @__PURE__ */ jsx16("div", { className: "text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No caps on this section." }) : caps.map((cap, index) => /* @__PURE__ */ jsxs2("div", { className: "bg-white rounded-xl border border-gray-200 p-3", children: [
      /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-2 items-end", children: [
        /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
          "Cap material",
          /* @__PURE__ */ jsxs2(
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
                /* @__PURE__ */ jsx16("option", { value: "", children: "Select cap\xE2\u20AC\xA6" }),
                cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && /* @__PURE__ */ jsx16("option", { value: cap.cap_inventory_id, disabled: true, children: `Catalog cap unavailable (${cap.cap_inventory_id})` }),
                options.map((o) => /* @__PURE__ */ jsx16("option", { value: o.id, children: o.material_name }, o.id))
              ]
            }
          ),
          cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && /* @__PURE__ */ jsx16("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog cap unavailable; current pricing needs review." })
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500", children: [
          "Wall",
          /* @__PURE__ */ jsxs2(
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
                /* @__PURE__ */ jsx16("option", { value: "", children: "Unassigned" }),
                cap.wall_component_id && !walls.some((w) => w.component_id === cap.wall_component_id) && /* @__PURE__ */ jsx16("option", { value: cap.wall_component_id, disabled: true, children: `Missing wall (${String(cap.wall_component_id).slice(0, 18)}\xE2\u20AC\xA6)` }),
                walls.map((w, i) => /* @__PURE__ */ jsx16("option", { value: w.component_id || "", children: w.name || `Wall ${i + 1}` }, w.component_id || i))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500", children: [
          "Segment",
          /* @__PURE__ */ jsxs2(
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
                /* @__PURE__ */ jsx16("option", { value: "", children: "Unassigned" }),
                cap.segment_component_id && !(walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).some((sg) => sg.component_id === cap.segment_component_id) && /* @__PURE__ */ jsx16("option", { value: cap.segment_component_id, disabled: true, children: `Missing segment (${String(cap.segment_component_id).slice(0, 18)}\xE2\u20AC\xA6)` }),
                (walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).map((sg, i) => /* @__PURE__ */ jsx16("option", { value: sg.component_id || "", children: `Segment ${i + 1}` }, sg.component_id || i))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx16(
          FoundationDimensionInput,
          {
            ...capDimMeta("length_inches"),
            value: wallCapCutLengthValue(cap),
            onCommit: (v) => patchCap(index, { length_inches: v }),
            ariaLabel: `Cap ${index + 1} cut length (inches)`,
            invalid: geometryIssues(index).some((i) => i.field === "length_inches") || void 0,
            describedBy: geometryIssues(index).length ? `wall-cap-${index}-geometry` : void 0
          }
        ),
        /* @__PURE__ */ jsx16(
          FoundationDimensionInput,
          {
            ...capDimMeta("overhang_inches"),
            value: cap.overhang_inches,
            onCommit: (v) => patchCap(index, { overhang_inches: v }),
            ariaLabel: `Cap ${index + 1} overhang (inches)`
          }
        ),
        /* @__PURE__ */ jsx16(
          FoundationDimensionInput,
          {
            ...capDimMeta("height_inches"),
            value: cap.height_inches,
            onCommit: (v) => patchCap(index, { height_inches: v }),
            ariaLabel: `Cap ${index + 1} thickness (inches)`
          }
        )
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-2 md:grid-cols-6 gap-2 mt-2", children: [
        /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500", children: [
          "Profile",
          /* @__PURE__ */ jsx16(
            "input",
            {
              type: "text",
              value: cap.profile ?? "",
              placeholder: capDimMeta("profile")?.placeholder ?? "flat",
              onChange: (e) => patchCap(index, { profile: e.target.value === "" ? void 0 : e.target.value }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} profile`
            }
          )
        ] }),
        /* @__PURE__ */ jsx16(
          FoundationDimensionInput,
          {
            ...capDimMeta("width_inches"),
            value: cap.width_inches,
            onCommit: (v) => patchCap(index, { width_inches: v }),
            ariaLabel: `Cap ${index + 1} width (inches)`
          }
        ),
        /* @__PURE__ */ jsx16(
          FoundationDimensionInput,
          {
            ...capDimMeta("elevation_inches"),
            value: cap.elevation_inches,
            onCommit: (v) => patchCap(index, { elevation_inches: v }),
            ariaLabel: `Cap ${index + 1} elevation (inches)`
          }
        ),
        /* @__PURE__ */ jsx16(
          FoundationDimensionInput,
          {
            ...capDimMeta("joint_spacing_inches"),
            value: cap.joint_spacing_inches,
            onCommit: (v) => patchCap(index, { joint_spacing_inches: v }),
            ariaLabel: `Cap ${index + 1} joint spacing (inches)`
          }
        ),
        /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500", children: [
          "Slope",
          /* @__PURE__ */ jsxs2(
            "select",
            {
              value: cap.slope ?? "",
              onChange: (e) => patchCap(index, { slope: e.target.value === "" ? void 0 : e.target.value }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} slope`,
              children: [
                /* @__PURE__ */ jsx16("option", { value: "", children: "Not recorded" }),
                /* @__PURE__ */ jsx16("option", { value: "flat", children: "Flat" }),
                /* @__PURE__ */ jsx16("option", { value: "single", children: "Single-slope" }),
                /* @__PURE__ */ jsx16("option", { value: "double", children: "Double-slope" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500", children: [
          "End treatment",
          /* @__PURE__ */ jsxs2(
            "select",
            {
              value: cap.end_treatment ?? "",
              onChange: (e) => patchCap(index, { end_treatment: e.target.value === "" ? void 0 : e.target.value }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} end treatment`,
              children: [
                /* @__PURE__ */ jsx16("option", { value: "", children: "Not recorded" }),
                /* @__PURE__ */ jsx16("option", { value: "straight", children: "Straight" }),
                /* @__PURE__ */ jsx16("option", { value: "mitered", children: "Mitered" }),
                /* @__PURE__ */ jsx16("option", { value: "returned", children: "Returned" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500", children: [
          "Supplies $",
          /* @__PURE__ */ jsx16(
            "input",
            {
              type: "number",
              min: "0",
              step: "0.01",
              placeholder: "0",
              value: cap.supplies_cost ?? "",
              onChange: (e) => patchCap(index, { supplies_cost: e.target.value === "" ? void 0 : Number(e.target.value) }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} supplies cost`
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500", children: [
          "Cut labor $",
          /* @__PURE__ */ jsx16(
            "input",
            {
              type: "number",
              min: "0",
              step: "0.01",
              placeholder: "0",
              value: cap.cut_labor_cost ?? "",
              onChange: (e) => patchCap(index, { cut_labor_cost: e.target.value === "" ? void 0 : Number(e.target.value) }),
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              "aria-label": `Cap ${index + 1} cut labor cost`
            }
          )
        ] })
      ] }),
      geometryIssues(index).length > 0 && /* @__PURE__ */ jsxs2("div", { id: `wall-cap-${index}-geometry`, className: "mt-1 text-[11px] text-amber-700 space-y-0.5", children: [
        geometryIssues(index).map((issue) => /* @__PURE__ */ jsx16("p", { children: issue.message }, issue.code)),
        geometryIssues(index).some((i) => i.code === "wall_cap_cut_exceeds_stock") && /* @__PURE__ */ jsx16(Button, { variant: "outline", size: "sm", className: "mt-1", onClick: () => splitCap(index), children: "Split at stock length" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-2 text-xs text-gray-600", children: [
        /* @__PURE__ */ jsxs2("span", { children: [
          unavailableCaps.has(index) ? "Saved stock length: " : "Stock length: ",
          /* @__PURE__ */ jsx16("span", { className: "font-semibold text-gray-900", children: hasFoundationCostSnapshot(cap.stock_length_inches) && cap.stock_length_inches > 0 ? cap.stock_length_inches + String.fromCharCode(34) : "Not saved" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "ml-auto flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs2("label", { className: "flex items-center gap-1 text-[10px] text-gray-500", title: "Locked caps keep their segment covered; unlock to regenerate", children: [
            /* @__PURE__ */ jsx16(
              "input",
              {
                type: "checkbox",
                checked: cap.locked !== false,
                onChange: (e) => patchCap(index, { locked: e.target.checked ? void 0 : false }),
                "aria-label": `Cap ${index + 1} locked`
              }
            ),
            "Locked"
          ] }),
          /* @__PURE__ */ jsx16("span", { className: "font-bold text-gray-900", children: hasFoundationCostSnapshot(cap.cost) ? money(cap.cost) : "Not saved" }),
          unavailableCaps.has(index) && /* @__PURE__ */ jsx16("span", { className: "text-[10px] text-amber-700", children: "Saved amounts (not current pricing)" }),
          /* @__PURE__ */ jsx16(Button, { variant: "ghost", size: "icon", onClick: () => removeCap(index), children: /* @__PURE__ */ jsx16(Trash22, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
        ] })
      ] })
    ] }, cap.component_id || cap.id || index)),
    (() => {
      const offcuts = (caps || []).map((c) => {
        const inv = options.find((o) => o.id === c?.cap_inventory_id);
        const stock = inventoryFiniteNumber(inv?.cap_stock_length_inches);
        const cut = inventoryFiniteNumber(wallCapCutLengthValue(c));
        return stock !== null && stock > 0 && cut !== null && cut > 0 && cut <= stock ? stock - cut : null;
      }).filter((n) => n !== null && n > 0);
      if (!offcuts.length) return null;
      const total = offcuts.reduce((a, b) => a + b, 0);
      const purchased = (caps || []).length;
      const labor = (caps || []).reduce((a, c) => a + (inventoryFiniteNumber(c?.cut_labor_cost) || 0), 0);
      return /* @__PURE__ */ jsxs2("details", { className: "text-[11px] text-gray-500 mt-1", children: [
        /* @__PURE__ */ jsxs2("summary", { className: "cursor-pointer hover:text-gray-700", children: [
          "Offcuts: ",
          offcuts.length,
          " piece",
          offcuts.length === 1 ? "" : "s",
          " totaling ",
          Math.round(total),
          '" reusable -- not billed (full-stock pricing already charged).'
        ] }),
        /* @__PURE__ */ jsxs2("ul", { className: "mt-0.5 list-disc pl-4", children: [
          /* @__PURE__ */ jsxs2("li", { children: [
            "Purchased pieces: ",
            purchased,
            " (one stock row per cut piece)"
          ] }),
          /* @__PURE__ */ jsxs2("li", { children: [
            "Waste: ",
            Math.round(total),
            '" reusable offcut across ',
            offcuts.length,
            " piece",
            offcuts.length === 1 ? "" : "s"
          ] }),
          /* @__PURE__ */ jsxs2("li", { children: [
            "Cut labor: ",
            labor > 0 ? `$${labor.toFixed(2)}` : "not recorded"
          ] }),
          /* @__PURE__ */ jsx16("li", { children: "Price delta: $0 -- offcut reuse is informational; full-stock pricing already charged" })
        ] })
      ] });
    })()
  ] });
}

// src/components/estimator/foundation/FoundationPolesPanel.jsx
import { Trash2 as Trash23, Plus as Plus3 } from "lucide-react";

// src/components/estimator/foundation/foundationSceneTransforms.js
var INCHES_PER_FOOT2 = 12;
var PLAN_TO_WORLD_SCALE = 1 / INCHES_PER_FOOT2;
var DEFAULT_PLAN_EXTENT = Object.freeze({ width: 480, depth: 320 });
var DEFAULT_ZOOM_RANGE = Object.freeze({ min: 0.5, max: 2 });
var fin = (v) => typeof v === "number" && Number.isFinite(v);
var DEG_TO_RAD = Math.PI / 180;
function planPointOf(point) {
  if (!point || typeof point !== "object") return null;
  const x = fin(point.x) ? point.x : fin(point.x_inches) ? point.x_inches : null;
  const z = fin(point.z) ? point.z : fin(point.z_inches) ? point.z_inches : null;
  if (x === null || z === null) return null;
  return { x, z };
}
function planFrameForRect({ corner, size, rotationDegrees = 0 } = {}) {
  const c = planPointOf(corner);
  const w = size && fin(size.width) ? size.width : null;
  const d = size && fin(size.depth) ? size.depth : null;
  if (!c || w === null || d === null || w <= 0 || d <= 0) return null;
  const deg = fin(rotationDegrees) ? rotationDegrees : 0;
  const rad = deg * DEG_TO_RAD;
  return {
    cx: c.x + w / 2,
    cz: c.z + d / 2,
    degrees: deg,
    cos: Math.cos(rad),
    sin: Math.sin(rad)
  };
}
function planToFrameLocal(frame, point) {
  const p = planPointOf(point);
  if (!frame || !fin(frame.cx) || !fin(frame.cz) || !fin(frame.cos) || !fin(frame.sin) || !p) return null;
  const dx = p.x - frame.cx;
  const dz = p.z - frame.cz;
  return { lx: frame.cos * dx + frame.sin * dz, lz: -frame.sin * dx + frame.cos * dz };
}
function frameLocalToPlan(frame, local) {
  if (!frame || !fin(frame.cx) || !fin(frame.cz) || !fin(frame.cos) || !fin(frame.sin)) return null;
  if (!local || !fin(local.lx) || !fin(local.lz)) return null;
  return {
    x: frame.cx + frame.cos * local.lx - frame.sin * local.lz,
    z: frame.cz + frame.sin * local.lx + frame.cos * local.lz
  };
}
function framePlanCorners(frame, size) {
  if (!frame || !size || !fin(size.width) || !fin(size.depth) || size.width <= 0 || size.depth <= 0) return null;
  const hw = size.width / 2;
  const hd = size.depth / 2;
  const corner = (lx, lz) => frameLocalToPlan(frame, { lx, lz });
  return {
    nw: corner(-hw, -hd),
    ne: corner(hw, -hd),
    se: corner(hw, hd),
    sw: corner(-hw, hd)
  };
}

// src/components/estimator/foundation/foundationLayoutModel.js
var FOUNDATION_LAYOUT_WIDTH_INCHES = 480;
var FOUNDATION_LAYOUT_DEPTH_INCHES = 320;
var finiteNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
function foundationLayoutFootprint(item) {
  if (!item || typeof item !== "object") return null;
  const w = item.foundation_type === "pillar" ? finiteNumber(item.diameter) : finiteNumber(item.length_inches);
  const d = item.foundation_type === "pillar" ? finiteNumber(item.diameter) : finiteNumber(item.width_inches);
  if (w === null || d === null || w <= 0 || d <= 0) return null;
  return { width: w, depth: d };
}
function layoutPositionInches(item) {
  if (!item || typeof item !== "object") return { valid: false, x_inches: 0, z_inches: 0 };
  const read = (v) => {
    if (v === void 0 || v === null) return 0;
    return finiteNumber(v);
  };
  const x = read(item.x_inches);
  const z = read(item.z_inches);
  if (x === null || z === null) return { valid: false, x_inches: 0, z_inches: 0 };
  return { valid: true, x_inches: x, z_inches: z };
}
function layoutItemKey(item, index) {
  if (item?.component_id) return `component:${item.component_id}`;
  if (item?.id !== void 0 && item?.id !== null) return `legacy:${item.id}`;
  return `index:${index}`;
}
function layoutItemFingerprint(item) {
  if (!item || typeof item !== "object") return null;
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  return JSON.stringify({
    v: pos.valid,
    t: item.foundation_type || null,
    x: pos.x_inches,
    z: pos.z_inches,
    w: fp?.width ?? null,
    d: fp?.depth ?? null,
    r: item.rotation_degrees ?? null
  });
}

// src/components/estimator/foundation/FoundationPolesPanel.jsx
import { Fragment as Fragment2, jsx as jsx17, jsxs as jsxs3 } from "react/jsx-runtime";
var poleDimMeta = (field) => foundationDimensionFieldMeta("pole", field);
var signDimMeta = (field) => foundationDimensionFieldMeta("sign", field);
function FoundationPolesPanel({ poles = [], options = [], items = [], onChange, polePricing: polePricing2 = [], onMigrateItemPole }) {
  const patchPole = (index, changes) => onChange(poles.map((p, i) => i === index ? { ...p, ...changes } : p));
  const removePole = (index) => {
    if (!window.confirm(`Remove Pole ${index + 1}? Cabinets mounted on it are retained for review.`)) return;
    onChange(poles.filter((_, i) => i !== index));
  };
  const addPole = () => onChange([
    ...poles,
    { pole_id: options[0]?.id || "", height_inches: 120, embedment_inches: 42, include_pole_painting: false }
  ]);
  const consolidated = consolidateFoundationPoles({ items, poles });
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx17("h2", { className: "font-semibold text-gray-900", children: "Poles" }),
        /* @__PURE__ */ jsx17("p", { className: "text-xs text-gray-500", children: "Priced on billed length  -  an explicit total stock length, or height above grade plus embedment." })
      ] }),
      /* @__PURE__ */ jsxs3(Button, { variant: "outline", size: "sm", onClick: addPole, disabled: options.length === 0, children: [
        /* @__PURE__ */ jsx17(Plus3, { className: "w-4 h-4", "aria-hidden": "true" }),
        " Pole"
      ] })
    ] }),
    options.length === 0 && /* @__PURE__ */ jsx17("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: "Pole catalog unavailable  -  existing rows remain editable; new poles cannot be added." }),
    consolidated.legacyPoles.length > 0 && /* @__PURE__ */ jsxs3("div", { role: "status", className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 space-y-1", children: [
      /* @__PURE__ */ jsx17("p", { className: "font-semibold", children: "Legacy item-pole data  -  not priced" }),
      consolidated.legacyPoles.map((d) => /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsxs3("span", { children: [
          "Foundation ",
          d.source_item_index + 1,
          " carries legacy pole fields",
          d.legacy_pole_cost !== null || d.legacy_pole_painting_cost !== null ? " (with saved amounts)" : "",
          "."
        ] }),
        typeof onMigrateItemPole === "function" && /* @__PURE__ */ jsx17(Button, { variant: "outline", size: "sm", onClick: () => onMigrateItemPole(d.source_item_index), children: "Move to Poles" })
      ] }, d.source_item_component_id || `item-${d.source_item_index}`)),
      consolidated.overlaps.length > 0 && /* @__PURE__ */ jsx17("p", { children: "A project pole already sits on the same foundation  -  verify it is not the same physical pole before migrating." })
    ] }),
    poles.length === 0 ? /* @__PURE__ */ jsx17("div", { className: "text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No poles on this section." }) : poles.map((pole, index) => {
      const issues = polePricing2[index]?.issues || [];
      const pricingUnavailable = polePricing2[index]?.available === false;
      const geometry = polePricing2[index]?.geometry || null;
      const fieldIssue = (field) => issues.some((i) => i.field === field);
      const describedBy = issues.length ? `pole-${index}-pricing` : void 0;
      const authoredShape = pole.pole_shape ?? "";
      const shapeChoices = authoredShape && !POLE_SHAPE_VALUES.includes(authoredShape) ? [authoredShape, ...POLE_SHAPE_VALUES] : POLE_SHAPE_VALUES;
      return /* @__PURE__ */ jsxs3("div", { className: "bg-white rounded-xl border border-gray-200 p-3", children: [
        /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2 items-end", children: [
          /* @__PURE__ */ jsxs3("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
            "Pole",
            /* @__PURE__ */ jsxs3(
              "select",
              {
                className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
                value: pole.pole_id || "",
                "aria-label": "Pole material",
                "aria-invalid": fieldIssue("pole_id") || void 0,
                "aria-describedby": fieldIssue("pole_id") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { pole_id: e.target.value }),
                children: [
                  /* @__PURE__ */ jsx17("option", { value: "", children: "Select pole..." }),
                  pole.pole_id && !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx17("option", { value: pole.pole_id, disabled: true, children: `Catalog pole unavailable (${pole.pole_id})` }),
                  options.map((o) => /* @__PURE__ */ jsx17("option", { value: o.id, children: o.material_name }, o.id))
                ]
              }
            ),
            pole.pole_id && !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx17("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog pole unavailable; current pricing needs review." })
          ] }),
          /* @__PURE__ */ jsxs3("label", { className: "text-xs text-gray-500", children: [
            "Shape",
            /* @__PURE__ */ jsxs3(
              "select",
              {
                className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
                value: authoredShape,
                "aria-label": `Pole ${index + 1} cross-section shape`,
                "aria-invalid": fieldIssue("pole_shape") || void 0,
                "aria-describedby": fieldIssue("pole_shape") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { pole_shape: e.target.value === "" ? void 0 : e.target.value }),
                children: [
                  /* @__PURE__ */ jsx17("option", { value: "", children: "Catalog / unspecified" }),
                  shapeChoices.map((s) => /* @__PURE__ */ jsx17("option", { value: s, children: s }, s))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs3("label", { className: "text-xs text-gray-500", children: [
            "Foundation",
            /* @__PURE__ */ jsxs3(
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
                  /* @__PURE__ */ jsx17("option", { value: "", children: "Unassigned" }),
                  pole.foundation_component_id && !items.some((it) => it.component_id === pole.foundation_component_id) && /* @__PURE__ */ jsx17("option", { value: pole.foundation_component_id, disabled: true, children: `Missing foundation (${String(pole.foundation_component_id).slice(0, 18)}...)` }),
                  items.map((it, i) => /* @__PURE__ */ jsx17("option", { value: it.component_id || "", children: it.description || `Foundation ${i + 1}` }, it.component_id || i))
                ]
              }
            ),
            /* @__PURE__ */ jsx17(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "sm",
                className: "mt-1",
                disabled: !pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id),
                onClick: () => {
                  const it = items.find((x) => x.component_id === pole.foundation_component_id);
                  const pos = it && layoutPositionInches(it);
                  const fp = it && foundationLayoutFootprint(it);
                  if (!pos?.valid || !fp) return;
                  patchPole(index, {
                    x_inches: Math.round((pos.x_inches + fp.width / 2) * 100) / 100,
                    z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100
                  });
                },
                children: "Center on foundation"
              }
            ),
            /* @__PURE__ */ jsx17(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "sm",
                disabled: !pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id),
                onClick: () => {
                  const it = items.find((x) => x.component_id === pole.foundation_component_id);
                  const pos = it && layoutPositionInches(it);
                  const fp = it && foundationLayoutFootprint(it);
                  if (!pos?.valid || !fp) return;
                  const cover = Math.min(4, Math.max(0, fp.width / 2));
                  patchPole(index, {
                    x_inches: Math.round((pos.x_inches + fp.width - cover) * 100) / 100,
                    z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100
                  });
                },
                children: "Snap to edge"
              }
            ),
            /* @__PURE__ */ jsx17(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "sm",
                disabled: !pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id),
                onClick: () => {
                  const it = items.find((x2) => x2.component_id === pole.foundation_component_id);
                  const pos = it && layoutPositionInches(it);
                  const fp = it && foundationLayoutFootprint(it);
                  if (!pos?.valid || !fp) return;
                  const siblings = (poles || []).filter((p) => p?.foundation_component_id === pole.foundation_component_id);
                  const n = Math.max(1, siblings.length);
                  const slot = siblings.findIndex((p) => p === pole || p.component_id === pole.component_id);
                  const i = slot < 0 ? 0 : slot;
                  const cover = Math.min(4, Math.max(0, fp.width / 4));
                  const span = fp.width - 2 * cover;
                  const x = n === 1 ? pos.x_inches + fp.width / 2 : pos.x_inches + cover + span * i / (n - 1 || 1);
                  patchPole(index, {
                    x_inches: Math.round(x * 100) / 100,
                    z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100
                  });
                },
                children: "Spread on foundation"
              }
            ),
            (() => {
              const it = pole.foundation_component_id ? items.find((x) => x.component_id === pole.foundation_component_id) : null;
              const pos = it && layoutPositionInches(it);
              const fp = it && foundationLayoutFootprint(it);
              const px = Number(pole.x_inches), pz = Number(pole.z_inches);
              if (!pos?.valid || !fp || !Number.isFinite(px) || !Number.isFinite(pz)) return null;
              const edge = Math.min(px - pos.x_inches, pos.x_inches + fp.width - px, pz - pos.z_inches, pos.z_inches + fp.depth - pz);
              return /* @__PURE__ */ jsxs3("span", { className: "block text-[10px] text-gray-500 mt-1", title: "Pole distance to the mounted foundation's nearest edge", children: [
                "Edge cover: ",
                edge >= 0 ? `${Math.round(edge)}"` : "outside footprint"
              ] });
            })()
          ] }),
          /* @__PURE__ */ jsx17(
            FoundationDimensionInput,
            {
              ...poleDimMeta("height_inches"),
              value: pole.height_inches ?? "",
              onCommit: (v) => patchPole(index, { height_inches: v }),
              ariaLabel: `Pole ${index + 1} height above grade (inches)`,
              invalid: fieldIssue("height_inches") || void 0,
              describedBy: fieldIssue("height_inches") ? describedBy : void 0
            }
          ),
          /* @__PURE__ */ jsx17(
            FoundationDimensionInput,
            {
              ...poleDimMeta("embedment_inches"),
              value: pole.embedment_inches !== void 0 && pole.embedment_inches !== null && pole.embedment_inches !== "" ? pole.embedment_inches : pole.y_offset_inches ?? "",
              onCommit: (v) => patchPole(index, {
                // Canonical field carries the edit; the legacy spelling
                // clears so the two can never diverge into a conflict.
                embedment_inches: v,
                y_offset_inches: void 0
              }),
              ariaLabel: `Pole ${index + 1} embedment below grade (inches)`,
              invalid: fieldIssue("embedment_inches") || fieldIssue("y_offset_inches") || void 0,
              describedBy: fieldIssue("embedment_inches") || fieldIssue("y_offset_inches") ? describedBy : void 0
            }
          ),
          /* @__PURE__ */ jsx17(
            FoundationDimensionInput,
            {
              ...poleDimMeta("base_offset_inches"),
              value: pole.base_offset_inches ?? "",
              onCommit: (v) => patchPole(index, { base_offset_inches: v }),
              ariaLabel: `Pole ${index + 1} base offset above grade (inches)`,
              invalid: fieldIssue("base_offset_inches") || void 0,
              describedBy: fieldIssue("base_offset_inches") ? describedBy : void 0
            }
          ),
          /* @__PURE__ */ jsx17(
            FoundationDimensionInput,
            {
              ...poleDimMeta("total_length_inches"),
              value: pole.total_length_inches ?? "",
              onCommit: (v) => patchPole(index, { total_length_inches: v }),
              ariaLabel: `Pole ${index + 1} total stock length (inches)`,
              invalid: fieldIssue("total_length_inches") || void 0,
              describedBy: fieldIssue("total_length_inches") ? describedBy : void 0
            }
          )
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between mt-2", children: [
          /* @__PURE__ */ jsxs3("label", { className: "flex items-center gap-1.5 text-xs font-medium text-gray-700", children: [
            /* @__PURE__ */ jsx17(
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
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-3 text-xs text-gray-600", children: [
            geometry && Number.isFinite(geometry.required_length_inches) && /* @__PURE__ */ jsxs3("span", { title: `Required ${geometry.required_length_inches} in${Number.isFinite(pole.stock_pieces) ? `  -  ${pole.stock_pieces} stock ${pole.stock_pieces === 1 ? "piece" : "pieces"}` : ""}${geometry.pole_shape ? `  -  ${geometry.pole_shape}` : ""}${geometry.base_offset_inches > 0 ? `  -  base +${geometry.base_offset_inches} in` : ""}`, children: [
              geometry.required_length_inches,
              " in req"
            ] }),
            /* @__PURE__ */ jsxs3("span", { children: [
              "Pole ",
              hasFoundationCostSnapshot(pole.pole_cost) ? money(pole.pole_cost) : "Not saved"
            ] }),
            /* @__PURE__ */ jsxs3("span", { children: [
              "Paint ",
              hasFoundationCostSnapshot(pole.pole_painting_cost) ? money(pole.pole_painting_cost) : "Not saved"
            ] }),
            /* @__PURE__ */ jsx17("span", { className: "font-bold text-gray-900 text-sm", children: hasFoundationCostSnapshot(pole.total_cost) ? money(pole.total_cost) : "Not saved" }),
            pricingUnavailable && /* @__PURE__ */ jsx17("span", { className: "col-span-full text-[10px] text-amber-700", children: "Saved amounts (not current pricing)" }),
            /* @__PURE__ */ jsx17(Button, { variant: "ghost", size: "icon", onClick: () => removePole(index), children: /* @__PURE__ */ jsx17(Trash23, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
          ] })
        ] }),
        issues.length > 0 && /* @__PURE__ */ jsx17("div", { role: "status", className: "mt-2 text-[10px] text-amber-700 space-y-0.5", id: `pole-${index}-pricing`, children: issues.map((issue) => /* @__PURE__ */ jsx17("p", { children: issue.message }, `${issue.field}-${issue.code}`)) }),
        (() => {
          const s = suggestFeasibleDimensions(pole);
          if (!s.available) return null;
          return /* @__PURE__ */ jsxs3("p", { className: "mt-1 text-[9px] text-gray-400 italic", children: [
            "Feasible dims: embedment \u2265",
            s.embedment_inches,
            "\u2033",
            s.shaft_diameter_inches ? `, shaft dia &ge;${s.shaft_diameter_inches}&Prime;` : "",
            " ",
            "(",
            s.governing,
            ")"
          ] });
        })(),
        /* @__PURE__ */ jsxs3("div", { className: "mt-2 border-t border-gray-100 pt-2", children: [
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between mb-1.5", children: [
            /* @__PURE__ */ jsxs3("span", { className: "text-[11px] font-semibold text-gray-600", children: [
              "Signs on this pole (",
              (pole.signs || []).length,
              ")"
            ] }),
            /* @__PURE__ */ jsx17(
              "button",
              {
                type: "button",
                onClick: () => patchPole(index, {
                  signs: [...pole.signs || [], {
                    component_id: `pole_sign_${Math.random().toString(36).slice(2, 10)}`,
                    name: "",
                    width_inches: 48,
                    height_inches: 24,
                    depth_inches: 8,
                    mount_height_inches: pole.height_inches || 96,
                    face_count: 1
                  }]
                }),
                className: "h-[24px] px-2 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50",
                children: "+ Sign"
              }
            )
          ] }),
          (pole.signs || []).map((s, si) => {
            const patchSign = (changes) => patchPole(index, {
              signs: (pole.signs || []).map((sg, j) => j === si ? { ...sg, ...changes } : sg)
            });
            return /* @__PURE__ */ jsxs3("div", { className: "flex flex-wrap items-end gap-2 mb-1.5 rounded-sm border border-gray-100 bg-gray-50/60 px-2 py-1.5", children: [
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Sign",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    value: s.name ?? "",
                    placeholder: `Sign ${si + 1}`,
                    onChange: (e) => patchSign({ name: e.target.value }),
                    className: "block w-24 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} name`
                  }
                )
              ] }),
              /* @__PURE__ */ jsx17(
                FoundationDimensionInput,
                {
                  ...signDimMeta("width_inches"),
                  value: s.width_inches ?? "",
                  onCommit: (v) => patchSign({ width_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} width (inches)`
                }
              ),
              /* @__PURE__ */ jsx17(
                FoundationDimensionInput,
                {
                  ...signDimMeta("height_inches"),
                  value: s.height_inches ?? "",
                  onCommit: (v) => patchSign({ height_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} height (inches)`
                }
              ),
              /* @__PURE__ */ jsx17(
                FoundationDimensionInput,
                {
                  ...signDimMeta("mount_height_inches"),
                  value: s.mount_height_inches ?? "",
                  onCommit: (v) => patchSign({ mount_height_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} mount height (inches)`
                }
              ),
              /* @__PURE__ */ jsx17(
                FoundationDimensionInput,
                {
                  ...signDimMeta("depth_inches"),
                  value: s.depth_inches ?? "",
                  onCommit: (v) => patchSign({ depth_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} depth (inches)`
                }
              ),
              /* @__PURE__ */ jsx17(
                FoundationDimensionInput,
                {
                  ...signDimMeta("horizontal_offset_inches"),
                  value: s.horizontal_offset_inches ?? "",
                  onCommit: (v) => patchSign({ horizontal_offset_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} horizontal offset (inches)`
                }
              ),
              /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  onClick: () => patchSign({ horizontal_offset_inches: 0 }),
                  className: "h-9 px-2 self-end rounded-md border border-gray-300 text-[10px] text-gray-600 hover:bg-gray-50",
                  "aria-label": `Pole ${index + 1} sign ${si + 1} center on pole`,
                  children: "Center"
                }
              ),
              /* @__PURE__ */ jsxs3("label", { className: "flex items-center gap-1 text-[10px] text-gray-500 self-end pb-1", title: "Mirror a second sign across the pole", children: [
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "checkbox",
                    checked: s.twin === true,
                    onChange: (e) => patchSign({ twin: e.target.checked }),
                    className: "h-3.5 w-3.5",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} twin`
                  }
                ),
                "Twin"
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "flex items-center gap-1 text-[10px] text-gray-500 self-end pb-1", title: "Linked sign -- display only, excluded from sign cost", children: [
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "checkbox",
                    checked: s.display_only === true,
                    onChange: (e) => patchSign({ display_only: e.target.checked ? true : void 0 }),
                    className: "h-3.5 w-3.5",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} linked display-only`
                  }
                ),
                "Linked"
              ] }),
              s.display_only === true && /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", title: "The linked sign product this display-only sign represents", children: [
                "Linked product",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    placeholder: "product id/name",
                    value: s.linked_product_id ?? "",
                    onChange: (e) => patchSign({ linked_product_id: e.target.value === "" ? void 0 : e.target.value }),
                    className: "ml-1 h-5 w-20 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} linked product`
                  }
                )
              ] }),
              s.display_only === true && /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", title: "The sign's quote/job links (preserved through edits)", children: [
                "Quote / job",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    placeholder: "quote id",
                    value: s.quote_link ?? "",
                    onChange: (e) => patchSign({ quote_link: e.target.value === "" ? void 0 : e.target.value }),
                    className: "ml-1 h-5 w-16 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} quote link`
                  }
                ),
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    placeholder: "job id",
                    value: s.job_link ?? "",
                    onChange: (e) => patchSign({ job_link: e.target.value === "" ? void 0 : e.target.value }),
                    className: "ml-0.5 h-5 w-16 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} job link`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", title: "The sign's span -- comma-separated pole indexes it spans (a multipole sign)", children: [
                "Spans",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    placeholder: "pole idx e.g. 1,3",
                    value: s.spans ?? "",
                    onChange: (e) => patchSign({ spans: e.target.value === "" ? void 0 : e.target.value }),
                    className: "ml-1 h-5 w-20 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} spans`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", title: "The sign's mount kind -- pole (default) vs wall_top / foundation", children: [
                "Mount",
                /* @__PURE__ */ jsxs3(
                  "select",
                  {
                    value: s.mount_type ?? "pole",
                    onChange: (e) => patchSign({ mount_type: e.target.value === "pole" ? void 0 : e.target.value }),
                    className: "ml-1 h-5 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} mount type`,
                    children: [
                      /* @__PURE__ */ jsx17("option", { value: "pole", children: "pole" }),
                      /* @__PURE__ */ jsx17("option", { value: "wall_top", children: "wall top" }),
                      /* @__PURE__ */ jsx17("option", { value: "foundation", children: "foundation" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Weight (lb)",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "number",
                    min: "0",
                    step: "0.1",
                    value: s.weight_lbs ?? "",
                    onChange: (e) => patchSign({ weight_lbs: e.target.value === "" ? void 0 : Number(e.target.value) }),
                    className: "block w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} weight (lbs)`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Cost $",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "number",
                    min: "0",
                    step: "0.01",
                    value: s.unit_cost ?? "",
                    placeholder: "Not saved",
                    onChange: (e) => patchSign({ unit_cost: e.target.value === "" ? void 0 : Number(e.target.value) }),
                    className: "block w-20 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} unit cost`
                  }
                )
              ] }),
              [["hardware_cost", "Hardware $"], ["labor_cost", "Labor $"], ["paint_cost", "Paint $"], ["waste_cost", "Waste $"]].map(([f, label]) => /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                label,
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "number",
                    min: "0",
                    step: "0.01",
                    value: s[f] ?? "",
                    placeholder: "0",
                    onChange: (e) => patchSign({ [f]: e.target.value === "" ? void 0 : Number(e.target.value) }),
                    className: "block w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} ${f}`
                  }
                )
              ] }, f)),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Faces",
                /* @__PURE__ */ jsx17(
                  "select",
                  {
                    value: Number(s.face_count) || 1,
                    onChange: (e) => patchSign({ face_count: Number(e.target.value) }),
                    className: "block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} face count`,
                    children: [1, 2, 3, 4].map((n) => /* @__PURE__ */ jsx17("option", { value: n, children: n }, n))
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Shape",
                /* @__PURE__ */ jsxs3(
                  "select",
                  {
                    value: s.panel_shape ?? "",
                    onChange: (e) => patchSign({ panel_shape: e.target.value === "" ? void 0 : e.target.value }),
                    className: "block w-16 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} panel shape`,
                    children: [
                      /* @__PURE__ */ jsx17("option", { value: "", children: "--" }),
                      /* @__PURE__ */ jsx17("option", { value: "cabinet", children: "Cabinet" }),
                      /* @__PURE__ */ jsx17("option", { value: "panel", children: "Panel" }),
                      /* @__PURE__ */ jsx17("option", { value: "letters", children: "Letters" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Trim",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    value: s.trim_color ?? "",
                    placeholder: "color",
                    onChange: (e) => patchSign({ trim_color: e.target.value === "" ? void 0 : e.target.value }),
                    className: "block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} trim color`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Body",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    value: s.body_color ?? "",
                    placeholder: "color",
                    onChange: (e) => patchSign({ body_color: e.target.value === "" ? void 0 : e.target.value }),
                    className: "block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} body color`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Envelope",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    value: s.envelope ?? "",
                    placeholder: `4'x2'x8"`,
                    onChange: (e) => patchSign({ envelope: e.target.value === "" ? void 0 : e.target.value }),
                    className: "block w-20 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} envelope`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "text-[10px] text-gray-500", children: [
                "Artwork",
                /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "text",
                    value: s.artwork_url ?? "",
                    placeholder: "image URL or file ref",
                    onChange: (e) => patchSign({ artwork_url: e.target.value === "" ? void 0 : e.target.value }),
                    "aria-label": `Pole ${index + 1} sign ${si + 1} artwork URL`
                  }
                )
              ] }),
              /* @__PURE__ */ jsx17(
                "input",
                {
                  type: "file",
                  accept: "image/*",
                  onChange: (e) => {
                    const f = e.target.files?.[0];
                    if (f) patchSign({ artwork_url: URL.createObjectURL(f), artwork_name: f.name });
                    e.target.value = "";
                  },
                  className: "text-[10px]",
                  "aria-label": `Pole ${index + 1} sign ${si + 1} artwork upload`
                }
              ),
              s.artwork_url && /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  onClick: () => patchSign({ artwork_url: void 0, artwork_name: void 0, artwork_fit: void 0, artwork_scale: void 0 }),
                  className: "text-[9px] text-red-600 hover:underline",
                  "aria-label": `Pole ${index + 1} sign ${si + 1} clear artwork`,
                  children: "Clear artwork"
                }
              ),
              s.artwork_url && /* @__PURE__ */ jsxs3(Fragment2, { children: [
                /* @__PURE__ */ jsx17("label", { className: "text-[10px] text-gray-500 self-end", title: "Artwork fit", children: /* @__PURE__ */ jsxs3(
                  "select",
                  {
                    value: s.artwork_fit ?? "cover",
                    onChange: (e) => patchSign({ artwork_fit: e.target.value === "cover" ? void 0 : e.target.value }),
                    className: "h-5 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Sign ${si + 1} artwork fit`,
                    children: [
                      /* @__PURE__ */ jsx17("option", { value: "cover", children: "Cover" }),
                      /* @__PURE__ */ jsx17("option", { value: "contain", children: "Contain" }),
                      /* @__PURE__ */ jsx17("option", { value: "fill", children: "Fill" })
                    ]
                  }
                ) }),
                /* @__PURE__ */ jsx17("label", { className: "text-[10px] text-gray-500 self-end", title: "Artwork scale", children: /* @__PURE__ */ jsx17(
                  "input",
                  {
                    type: "number",
                    min: "0.1",
                    max: "4",
                    step: "0.1",
                    placeholder: "1",
                    value: s.artwork_scale ?? "",
                    onChange: (e) => patchSign({ artwork_scale: e.target.value === "" ? void 0 : Number(e.target.value) }),
                    className: "h-5 w-10 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Sign ${si + 1} artwork scale`
                  }
                ) }),
                /* @__PURE__ */ jsx17(
                  "img",
                  {
                    src: s.artwork_url,
                    alt: `Sign ${si + 1} artwork`,
                    className: "h-7 w-7 self-end rounded-sm border border-gray-200 object-cover",
                    style: { objectFit: s.artwork_fit || "cover", transform: s.artwork_scale ? `scale(${s.artwork_scale})` : void 0 },
                    onError: (e) => {
                      e.currentTarget.style.display = "none";
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  onClick: () => patchPole(index, { signs: (pole.signs || []).filter((_, j) => j !== si) }),
                  className: "h-7 w-7 rounded-sm text-red-500 hover:bg-red-50",
                  "aria-label": `Remove sign ${si + 1} from pole ${index + 1}`,
                  children: /* @__PURE__ */ jsx17(Trash23, { className: "w-3.5 h-3.5 mx-auto", "aria-hidden": "true" })
                }
              )
            ] }, s.component_id || si);
          }),
          (pole.signs || []).length > 0 && (() => {
            const costs = (pole.signs || []).map((s) => {
              const unit = Number(s?.unit_cost);
              if (!(Number.isFinite(unit) && unit >= 0)) return null;
              let t = unit;
              for (const p of [s?.hardware_cost, s?.labor_cost, s?.paint_cost, s?.waste_cost]) {
                if (p == null || p === "") continue;
                const n = Number(p);
                if (!(Number.isFinite(n) && n >= 0)) return null;
                t += n;
              }
              return t;
            });
            const all = costs.every((c) => c !== null) && costs.length > 0;
            return /* @__PURE__ */ jsxs3("div", { className: "text-right text-[11px] text-gray-600 mt-1", children: [
              "Signs total: ",
              all ? /* @__PURE__ */ jsx17("span", { className: "font-semibold text-gray-900", children: money(costs.reduce((a, b) => a + b, 0)) }) : /* @__PURE__ */ jsx17("span", { className: "text-amber-700", children: "Not saved  -  record a cost on every sign" })
            ] });
          })()
        ] })
      ] }, pole.component_id || index);
    })
  ] });
}

// s:s://@/components/estimator/foundation/FoundationToolbar
import { jsx as jsx18 } from "react/jsx-runtime";
var FoundationToolbar_default = () => /* @__PURE__ */ jsx18("div", {});

// s:s://@/components/estimator/foundation/FoundationSectionBanner
import { jsx as jsx19 } from "react/jsx-runtime";
var FoundationSectionBanner_default = () => /* @__PURE__ */ jsx19("div", {});

// s:s://@/components/estimator/foundation/AiEngineeringAssistant
import { jsx as jsx20 } from "react/jsx-runtime";
var AiEngineeringAssistant_default = () => /* @__PURE__ */ jsx20("div", {});

// s:s://@/components/estimator/foundation/FoundationPhotoIntake
import { jsx as jsx21 } from "react/jsx-runtime";
var FoundationPhotoIntake_default = () => /* @__PURE__ */ jsx21("div", {});

// s:s://@/components/estimator/foundation/FoundationAiIntake
import { jsx as jsx22 } from "react/jsx-runtime";
var FoundationAiIntake_default = () => /* @__PURE__ */ jsx22("div", {});

// s:s://@/components/estimator/foundation/Foundation3DPreview
import { jsx as jsx23 } from "react/jsx-runtime";
var Foundation3DPreview_default = (p) => {
  globalThis.__seenProject = p.project;
  return /* @__PURE__ */ jsx23("div", {});
};

// s:s://@/components/estimator/foundation/FoundationTemplateDialog
var FoundationTemplateDialog_default = () => null;

// s:s://@/components/estimator/foundation/FoundationSyncConflictDialog
var FoundationSyncConflictDialog_default = () => null;
var FoundationSyncRetryAction = () => null;
var useFoundationBuilderSyncRetry = () => ({ retrying: false, retry: async () => ({}) });
var useFoundationSyncConflict = () => ({ conflict: null, openDraftConflict: () => {
}, closeConflict: () => {
} });

// s:s://@/components/estimator/foundation/FoundationLayoutCanvas
import { jsx as jsx24 } from "react/jsx-runtime";
var FoundationLayoutCanvas_default = () => /* @__PURE__ */ jsx24("div", {});

// src/components/estimator/foundation/foundationSceneHistory.js
var fin2 = (v) => typeof v === "number" && Number.isFinite(v);
var SCENE_HISTORY_CAPACITY = 100;
var SCENE_HISTORY_COALESCE_WINDOW_MS = 1200;
var wallAnchorPart = (wall) => JSON.stringify({
  pts: Array.isArray(wall?.shape?.points) ? wall.shape.points : null,
  closed: wall?.shape?.closed === true
});
function sceneLayoutAnchor(scene) {
  const s = Array.isArray(scene) ? { items: scene } : scene && typeof scene === "object" ? scene : {};
  const fp = (rows, f) => Array.isArray(rows) ? rows.map(f).join(",") : "";
  return `i:${fp(s.items, layoutItemFingerprint)}|p:${fp(s.poles, layoutItemFingerprint)}|w:${fp(s.walls, wallAnchorPart)}`;
}
var hasAnchor = (v) => v !== void 0 && v !== null;
function createSceneHistory({
  capacity = SCENE_HISTORY_CAPACITY,
  coalesceWindowMs = SCENE_HISTORY_COALESCE_WINDOW_MS,
  now = () => Date.now(),
  equal
} = {}) {
  const eq = typeof equal === "function" ? equal : (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const cap = fin2(capacity) && capacity >= 1 ? Math.floor(capacity) : SCENE_HISTORY_CAPACITY;
  const window_ = coalesceWindowMs === Infinity ? Infinity : fin2(coalesceWindowMs) && coalesceWindowMs >= 0 ? coalesceWindowMs : SCENE_HISTORY_COALESCE_WINDOW_MS;
  const clock = typeof now === "function" ? now : () => Date.now();
  let past = [];
  let future = [];
  let open = null;
  let detached = 0;
  let currentAnchor;
  let anchored = false;
  let seq = 0;
  let stateVersion = 0;
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    stateVersion += 1;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
      }
    }
  };
  const info = (e, i) => ({
    id: e.id,
    kind: e.kind ?? null,
    method: e.method ?? null,
    label: e.label ?? null,
    target: e.target ?? null,
    moves: e.moves ?? 1,
    openedAt: e.openedAt ?? null,
    committedAt: e.committedAt ?? null,
    lastAt: e.lastAt ?? null,
    detached: typeof i === "number" ? i < detached : false
  });
  const markDetached = () => {
    let changed = false;
    if (open) {
      open = null;
      changed = true;
    }
    if (future.length) {
      future = [];
      changed = true;
    }
    if (detached !== past.length) {
      detached = past.length;
      changed = true;
    }
    return changed;
  };
  const boundStacks = () => {
    while (past.length > cap) {
      past.shift();
      if (detached > 0) detached -= 1;
    }
    while (future.length > cap) future.pop();
  };
  const topApplies = () => past.length > detached && (!hasAnchor(past[past.length - 1].afterAnchor) || past[past.length - 1].afterAnchor === currentAnchor);
  const topRedoApplies = () => future.length > 0 && (!hasAnchor(future[0].beforeAnchor) || future[0].beforeAnchor === currentAnchor);
  const seedAnchor = (anchor) => {
    if (!anchored && hasAnchor(anchor)) {
      anchored = true;
      currentAnchor = anchor;
    }
  };
  const reconcileBase = (beforeAnchor) => {
    if (anchored && hasAnchor(beforeAnchor) && beforeAnchor !== currentAnchor) return markDetached();
    return false;
  };
  const observe = (anchor) => {
    if (!hasAnchor(anchor)) return { status: "unanchored" };
    if (!anchored) {
      anchored = true;
      currentAnchor = anchor;
      return { status: "anchored" };
    }
    if (anchor === currentAnchor) return { status: "current" };
    const changed = markDetached();
    currentAnchor = anchor;
    if (changed) emit();
    return { status: "detached", detached };
  };
  const clear = (anchor) => {
    past = [];
    future = [];
    open = null;
    detached = 0;
    anchored = false;
    currentAnchor = void 0;
    if (hasAnchor(anchor)) {
      anchored = true;
      currentAnchor = anchor;
    }
    emit();
    return { status: "cleared" };
  };
  const recordEdit = (edit = {}) => {
    const at = fin2(edit.at) ? edit.at : clock();
    if (open) commitStroke({ at });
    if (anchored && !(hasAnchor(edit.beforeAnchor) && hasAnchor(edit.afterAnchor))) {
      return { status: "ignored-unanchored" };
    }
    if (hasAnchor(edit.beforeAnchor) && edit.beforeAnchor === edit.afterAnchor && eq(edit.before, edit.after)) {
      return { status: "ignored-noop" };
    }
    seedAnchor(edit.beforeAnchor);
    const detachedBefore = reconcileBase(edit.beforeAnchor) ? detached : null;
    const key = edit.coalesceKey ?? null;
    const top = past[past.length - 1];
    const mergeable = key != null && top && past.length - 1 >= detached && top.coalesceKey === key && top.mergeable !== false && (!hasAnchor(edit.beforeAnchor) || !hasAnchor(top.afterAnchor) || edit.beforeAnchor === top.afterAnchor) && window_ > 0 && at - top.lastAt <= window_;
    if (mergeable) {
      top.after = edit.after;
      if (hasAnchor(edit.afterAnchor)) {
        top.afterAnchor = edit.afterAnchor;
        currentAnchor = edit.afterAnchor;
      }
      top.lastAt = at;
      top.moves = (top.moves ?? 1) + 1;
      if (edit.label) top.label = edit.label;
      future = [];
      if (hasAnchor(top.beforeAnchor) && top.beforeAnchor === top.afterAnchor && eq(top.before, top.after)) {
        past.pop();
        emit();
        return { status: "merged-noop", detachedBefore };
      }
      emit();
      return { status: "merged", entry: top, detachedBefore };
    }
    const entry = {
      id: seq += 1,
      kind: edit.kind ?? null,
      method: edit.method ?? null,
      label: edit.label ?? null,
      target: edit.target ?? null,
      coalesceKey: key,
      before: edit.before,
      after: edit.after,
      beforeAnchor: edit.beforeAnchor,
      afterAnchor: edit.afterAnchor,
      mergeable: edit.mergeable,
      openedAt: at,
      committedAt: at,
      lastAt: at,
      moves: 1
    };
    past.push(entry);
    boundStacks();
    future = [];
    if (hasAnchor(edit.afterAnchor)) currentAnchor = edit.afterAnchor;
    emit();
    return { status: "recorded", entry, detachedBefore };
  };
  const beginStroke = (opts = {}) => {
    const at = fin2(opts.at) ? opts.at : clock();
    if (open) commitStroke({ at });
    if (anchored && !hasAnchor(opts.beforeAnchor)) return { status: "ignored-unanchored" };
    seedAnchor(opts.beforeAnchor);
    const detachedBefore = reconcileBase(opts.beforeAnchor) ? detached : null;
    open = {
      id: seq += 1,
      kind: opts.kind ?? null,
      method: opts.method ?? null,
      label: opts.label ?? null,
      target: opts.target ?? null,
      coalesceKey: opts.coalesceKey ?? null,
      before: opts.before,
      after: void 0,
      beforeAnchor: opts.beforeAnchor,
      afterAnchor: void 0,
      mergeable: opts.mergeable,
      openedAt: at,
      lastAt: at,
      moves: 0
    };
    emit();
    return { status: "open", stroke: open, detachedBefore };
  };
  const extendStroke = ({ after, afterAnchor, at } = {}) => {
    if (!open) return { status: "no-stroke" };
    const t = fin2(at) ? at : clock();
    if (after !== void 0) open.after = after;
    if (hasAnchor(afterAnchor)) {
      open.afterAnchor = afterAnchor;
      currentAnchor = afterAnchor;
    }
    open.lastAt = t;
    open.moves = (open.moves ?? 0) + 1;
    emit();
    return { status: "extended", stroke: open };
  };
  const commitStroke = ({ after, afterAnchor, label, at } = {}) => {
    if (!open) return { status: "no-stroke" };
    const t = fin2(at) ? at : clock();
    const s = open;
    open = null;
    if (after !== void 0) s.after = after;
    if (hasAnchor(afterAnchor)) {
      s.afterAnchor = afterAnchor;
      currentAnchor = afterAnchor;
    }
    if (label) s.label = label;
    if (s.after === void 0) {
      emit();
      return { status: "cancelled-empty" };
    }
    if (anchored && !hasAnchor(s.afterAnchor)) {
      emit();
      return { status: "ignored-unanchored" };
    }
    if (hasAnchor(s.beforeAnchor) && s.beforeAnchor === s.afterAnchor && eq(s.before, s.after)) {
      emit();
      return { status: "ignored-noop" };
    }
    const entry = { ...s, committedAt: t, lastAt: t, moves: Math.max(1, s.moves ?? 0) };
    past.push(entry);
    boundStacks();
    future = [];
    emit();
    return { status: "recorded", entry };
  };
  const cancelStroke = () => {
    if (!open) return { status: "no-stroke" };
    open = null;
    emit();
    return { status: "cancelled" };
  };
  const traverse = (direction, anchor, apply) => {
    if (open) return { status: "busy" };
    if (hasAnchor(anchor) && anchored && anchor !== currentAnchor) {
      return { status: "anchor-mismatch" };
    }
    const applies = direction === "undo" ? topApplies : topRedoApplies;
    if (!applies()) {
      const source = direction === "undo" ? past : future;
      if (!source.length || direction === "undo" && past.length <= detached) {
        if (direction === "undo" && past.length) {
          past = [];
          detached = 0;
          emit();
          return { status: "stale" };
        }
        return { status: source.length ? "stale" : "empty" };
      }
      if (direction === "undo") {
        if (markDetached()) emit();
        return { status: "stale" };
      }
      if (future.length) {
        future = [];
        emit();
      }
      return { status: "stale" };
    }
    const entry = direction === "undo" ? past[past.length - 1] : future[0];
    const patch = direction === "undo" ? entry.before : entry.after;
    const payload = {
      status: "applied",
      direction,
      kind: entry.kind,
      method: entry.method,
      label: entry.label,
      target: entry.target,
      patch,
      entry
    };
    if (typeof apply === "function") {
      let result;
      try {
        result = apply(payload);
      } catch {
        result = false;
      }
      if (result === false) return { status: "rejected", entry };
    }
    if (direction === "undo") {
      past.pop();
      future.unshift(entry);
      if (hasAnchor(entry.beforeAnchor)) currentAnchor = entry.beforeAnchor;
    } else {
      future.shift();
      past.push(entry);
      if (hasAnchor(entry.afterAnchor)) currentAnchor = entry.afterAnchor;
    }
    emit();
    return payload;
  };
  const undo = (anchor, apply) => traverse("undo", anchor, apply);
  const redo = (anchor, apply) => traverse("redo", anchor, apply);
  const peekUndo = () => topApplies() ? info(past[past.length - 1]) : null;
  const peekRedo = () => topRedoApplies() ? info(future[0]) : null;
  const entries = () => ({
    past: past.map((e, i) => info(e, i)),
    future: future.map((e, i) => ({ ...info(e), detached: false })),
    detached,
    open: open ? info(open) : null
  });
  const getState = () => ({
    stateVersion,
    capacity: cap,
    coalesceWindowMs: window_,
    busy: open != null,
    open: open ? info(open) : null,
    canUndo: !open && topApplies(),
    canRedo: !open && topRedoApplies(),
    undoDepth: Math.max(0, past.length - detached),
    redoDepth: future.length,
    detached,
    undoLabel: peekUndo()?.label ?? null,
    redoLabel: peekRedo()?.label ?? null
  });
  const subscribe = (fn) => {
    if (typeof fn !== "function") return () => {
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  return {
    // observation + lifecycle
    observe,
    clear,
    // recording
    recordEdit,
    beginStroke,
    extendStroke,
    commitStroke,
    cancelStroke,
    // traversal
    undo,
    redo,
    // inspection + subscription
    peekUndo,
    peekRedo,
    entries,
    getState,
    subscribe,
    get stateVersion() {
      return stateVersion;
    },
    get currentAnchor() {
      return currentAnchor;
    },
    get anchored() {
      return anchored;
    }
  };
}

// src/components/estimator/foundation/foundationSceneInput.js
var fin3 = (v) => typeof v === "number" && Number.isFinite(v);
var hypot = Math.hypot;
var PLAN_EXTENT = Object.freeze({
  width: FOUNDATION_LAYOUT_WIDTH_INCHES,
  depth: FOUNDATION_LAYOUT_DEPTH_INCHES
});
var DEFAULT_HIT_TOLERANCES = Object.freeze({
  edgeInches: 3,
  vertexInches: 4,
  poleInches: 4
});
function itemPlanGeometry(item) {
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  if (!fp || !pos.valid) return null;
  const frame = planFrameForRect({
    corner: { x: pos.x_inches, z: pos.z_inches },
    size: fp,
    rotationDegrees: fin3(item?.rotation_degrees) ? item.rotation_degrees : 0
  });
  if (!frame) return null;
  return {
    corner: { x: pos.x_inches, z: pos.z_inches },
    size: { width: fp.width, depth: fp.depth },
    center: { x: frame.cx, z: frame.cz },
    frame,
    circular: item?.foundation_type === "pillar"
  };
}
function wallPlanGeometry(wall) {
  const raw = wall?.shape?.points;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const points = [];
  const indices = [];
  raw.forEach((p, i) => {
    const q = planPointOf(p);
    if (q) {
      points.push(q);
      indices.push(i);
    }
  });
  if (!points.length) return null;
  return { points, indices, closed: wall?.shape?.closed === true && points.length >= 3 };
}
var labelFor = (collection, index) => {
  switch (collection) {
    case "items":
      return `Foundation ${index + 1}`;
    case "poles":
      return `Pole ${index + 1}`;
    case "walls":
      return `Wall ${index + 1}`;
    default:
      return `Object ${index + 1}`;
  }
};
var baseHit = (kind, collection, index, obj, point, extra) => ({
  kind,
  collection,
  index,
  key: layoutItemKey(obj, index),
  componentId: obj?.component_id ?? null,
  distance: 0,
  point: { x: point.x, z: point.z },
  label: labelFor(collection, index),
  ...extra
});
var CORNER_NAMES = { "-1,-1": "nw", "1,-1": "ne", "1,1": "se", "-1,1": "sw" };
function hitItem(item, index, p, tol) {
  const g = itemPlanGeometry(item);
  if (!g) return null;
  if (g.circular) {
    const r = Math.min(g.size.width, g.size.depth) / 2;
    const d = hypot(p.x - g.center.x, p.z - g.center.z);
    if (Math.abs(d - r) <= tol.edgeInches) {
      return baseHit("item-edge", "items", index, item, p, {
        edge: "rim",
        distance: Math.abs(d - r)
      });
    }
    if (d <= r) return baseHit("item-face", "items", index, item, p, { distance: 0 });
    return null;
  }
  const local = planToFrameLocal(g.frame, p);
  if (!local) return null;
  const hw = g.size.width / 2;
  const hd = g.size.depth / 2;
  const sx = local.lx >= 0 ? 1 : -1;
  const sz = local.lz >= 0 ? 1 : -1;
  const cdx = Math.abs(local.lx) - hw;
  const cdz = Math.abs(local.lz) - hd;
  const cornerDist = hypot(cdx, cdz);
  if (cornerDist <= tol.vertexInches) {
    return baseHit("item-vertex", "items", index, item, p, {
      corner: CORNER_NAMES[`${sx},${sz}`],
      distance: cornerDist
    });
  }
  const dists = [
    { edge: "n", d: Math.abs(local.lz + hd) },
    { edge: "s", d: Math.abs(local.lz - hd) },
    { edge: "w", d: Math.abs(local.lx + hw) },
    { edge: "e", d: Math.abs(local.lx - hw) }
  ];
  dists.sort((a, b) => a.d - b.d);
  const near = dists[0];
  const inSpan = near.edge === "n" || near.edge === "s" ? Math.abs(local.lx) <= hw + tol.vertexInches : Math.abs(local.lz) <= hd + tol.vertexInches;
  if (near.d <= tol.edgeInches && inSpan) {
    return baseHit("item-edge", "items", index, item, p, { edge: near.edge, distance: near.d });
  }
  const inside = Math.abs(local.lx) <= hw && Math.abs(local.lz) <= hd;
  if (inside) return baseHit("item-face", "items", index, item, p, { distance: 0 });
  return null;
}
function hitPole(pole, index, p, tol) {
  const q = planPointOf({ x: pole?.x_inches, z: pole?.z_inches });
  if (!q) return null;
  const d = hypot(p.x - q.x, p.z - q.z);
  if (d > tol.poleInches) return null;
  return baseHit("pole", "poles", index, pole, p, { distance: d, center: q });
}
var distToSegment = (p, a, b) => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len2 = vx * vx + vz * vz;
  if (len2 === 0) return { d: hypot(p.x - a.x, p.z - a.z), t: 0, projection: { x: a.x, z: a.z }, degenerate: true };
  let t = ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * vx;
  const pz = a.z + t * vz;
  return { d: hypot(p.x - px, p.z - pz), t, projection: { x: px, z: pz }, degenerate: false };
};
var pointInPolygon = (p, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};
function hitWall(wall, index, p, tol) {
  const g = wallPlanGeometry(wall);
  if (!g) return null;
  const pts = g.points;
  const segs = Array.isArray(wall?.shape?.segments) ? wall.shape.segments : [];
  let best = null;
  for (let i = 0; i < pts.length; i += 1) {
    const d = hypot(p.x - pts[i].x, p.z - pts[i].z);
    if (d <= tol.vertexInches && (!best || d < best.distance)) {
      best = baseHit("wall-vertex", "walls", index, wall, p, {
        vertexIndex: g.indices[i],
        distance: d
      });
    }
  }
  if (best) return best;
  const segCount = g.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const r = distToSegment(p, a, b);
    if (r.degenerate) continue;
    if (r.d <= tol.edgeInches && (!best || r.d < best.distance)) {
      best = baseHit("wall-segment", "walls", index, wall, p, {
        segmentIndex: i,
        segmentComponentId: segs[i]?.component_id ?? null,
        t: r.t,
        projection: r.projection,
        distance: r.d
      });
    }
  }
  if (best) return best;
  if (g.closed && pointInPolygon(p, pts)) {
    return baseHit("wall-face", "walls", index, wall, p, { distance: 0 });
  }
  return null;
}
var HITTERS = { pole: hitPole, item: hitItem, wall: hitWall };
var COLLECTION_OF = { pole: "poles", item: "items", wall: "walls" };
function hitTestPlanAll(scene, point, opts = {}) {
  const p = planPointOf(point);
  if (!p) return [];
  const tol = { ...DEFAULT_HIT_TOLERANCES, ...opts.tolerances || {} };
  if (fin3(opts.edgeInches)) tol.edgeInches = opts.edgeInches;
  if (fin3(opts.vertexInches)) tol.vertexInches = opts.vertexInches;
  if (fin3(opts.poleInches)) tol.poleInches = opts.poleInches;
  const order = Array.isArray(opts.order) && opts.order.length ? opts.order : ["pole", "item", "wall"];
  const hits = [];
  for (const layer of order) {
    const rows = scene?.[COLLECTION_OF[layer]];
    const hitter = HITTERS[layer];
    if (!Array.isArray(rows) || !hitter) continue;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const hit = hitter(rows[i], i, p, tol);
      if (hit) hits.push(hit);
    }
  }
  return hits;
}
function hitLabel(hit) {
  if (!hit || typeof hit !== "object") return null;
  switch (hit.kind) {
    case "item-vertex":
      return `${hit.label} ${hit.corner} corner`;
    case "item-edge":
      return `${hit.label} ${hit.edge} edge`;
    case "item-face":
      return hit.label;
    case "pole":
      return hit.label;
    case "wall-vertex":
      return `${hit.label} vertex ${hit.vertexIndex + 1}`;
    case "wall-segment":
      return `${hit.label} segment ${hit.segmentIndex + 1}`;
    case "wall-face":
      return `${hit.label} interior`;
    default:
      return hit.label ?? null;
  }
}
function sceneObjectLabel(collection, index) {
  return labelFor(collection, index);
}

// src/components/estimator/foundation/foundationSceneSelection.js
var fin4 = (v) => typeof v === "number" && Number.isFinite(v);
var isId = (v) => typeof v === "string" && v.length > 0;
var hypot2 = Math.hypot;
var REGION_SELECT_MODES = Object.freeze(["intersect", "contain"]);
var SCENE_NODE_KINDS = Object.freeze([
  "item",
  "wall",
  "wall-segment",
  "pole",
  "pole-sign",
  "wall-cap",
  "cabinet"
]);
var COLLECTION_OF_KIND = Object.freeze({
  item: "items",
  wall: "walls",
  "wall-segment": "walls",
  pole: "poles",
  "pole-sign": "poles",
  "wall-cap": "wall_caps",
  cabinet: "signage_cabinets"
});
function sceneCollections(scene) {
  const s = scene && typeof scene === "object" ? scene : {};
  return {
    items: Array.isArray(s.items) ? s.items : [],
    walls: Array.isArray(s.walls) ? s.walls : [],
    poles: Array.isArray(s.poles) ? s.poles : [],
    wall_caps: Array.isArray(s.wall_caps) ? s.wall_caps : Array.isArray(s.wallCaps) ? s.wallCaps : [],
    signage_cabinets: Array.isArray(s.signage_cabinets) ? s.signage_cabinets : Array.isArray(s.signageCabinets) ? s.signageCabinets : []
  };
}
var subRef = (componentId, index) => isId(componentId) ? `component:${componentId}` : `index:${index}`;
var sceneNodeId = Object.freeze({
  item: (key) => `item:${key}`,
  pole: (key) => `pole:${key}`,
  wall: (key) => `wall:${key}`,
  wallSegment: (wallKey, ref) => `wall-segment:${wallKey}|${ref}`,
  poleSign: (poleKey, ref) => `pole-sign:${poleKey}|${ref}`,
  wallCap: (key) => `wall-cap:${key}`,
  cabinet: (key) => `cabinet:${key}`
});
function parseSceneNodeId(id) {
  if (typeof id !== "string" || !id) return null;
  const prefixed = (prefix, kind, sub) => {
    if (!id.startsWith(prefix)) return null;
    const body = id.slice(prefix.length);
    if (!sub) return { kind, key: body, parentKey: null, ref: null };
    const cut = body.lastIndexOf("|");
    if (cut < 0) return { kind, key: body, parentKey: null, ref: null };
    return { kind, key: body.slice(0, cut), parentKey: body.slice(0, cut), ref: body.slice(cut + 1) };
  };
  return prefixed("wall-segment:", "wall-segment", true) || prefixed("pole-sign:", "pole-sign", true) || prefixed("wall-cap:", "wall-cap") || prefixed("item:", "item") || prefixed("wall:", "wall") || prefixed("pole:", "pole") || prefixed("cabinet:", "cabinet") || null;
}
var wallSegmentCount = (wall) => {
  const g = wallPlanGeometry(wall);
  if (!g || g.points.length < 2) return 0;
  return g.closed ? g.points.length : g.points.length - 1;
};
var parentItemId = (ref, rows, kind) => {
  if (!isId(ref) || ref.startsWith("unresolved:")) return null;
  const i = (rows || []).findIndex((r) => r?.component_id === ref);
  return i >= 0 ? `${kind}:${layoutItemKey(rows[i], i)}` : null;
};
var parentByIndex = (idx, rows, kind) => {
  const n = typeof idx === "string" && /^\d+$/.test(idx) ? parseInt(idx, 10) : idx;
  if (!Number.isInteger(n) || n < 0 || n >= (rows || []).length) return null;
  return `${kind}:${layoutItemKey(rows[n], n)}`;
};
var refPresent = (v) => v !== void 0 && v !== null;
var parentForPole = (p, cols) => {
  if (refPresent(p?.foundation_component_id)) return parentItemId(p.foundation_component_id, cols.items, "item");
  return parentByIndex(p?.foundation_idx ?? p?.foundation_index, cols.items, "item");
};
var parentForCabinet = (c, cols) => {
  if (c?.mount === "pole") {
    if (refPresent(c?.pole_component_id)) return parentItemId(c.pole_component_id, cols.poles, "pole");
    return parentByIndex(c?.pole_index ?? c?.pole_idx, cols.poles, "pole");
  }
  if (c?.mount === "foundation") {
    if (refPresent(c?.foundation_component_id)) return parentItemId(c.foundation_component_id, cols.items, "item");
    return parentByIndex(c?.foundation_index ?? c?.foundation_idx, cols.items, "item");
  }
  return null;
};
function buildSceneTree(scene) {
  const cols = sceneCollections(scene);
  const nodes = /* @__PURE__ */ new Map();
  const childIds = /* @__PURE__ */ new Map();
  const addChild = (parentId, id) => {
    if (!parentId) return;
    const list2 = childIds.get(parentId) || [];
    list2.push(id);
    childIds.set(parentId, list2);
  };
  const define = (node) => {
    if (!node || !isId(node.id) || nodes.has(node.id)) return null;
    nodes.set(node.id, { childIds: [], ...node });
    addChild(node.parentId, node.id);
    return node.id;
  };
  const itemIds = cols.items.map((it, i) => define({
    id: sceneNodeId.item(layoutItemKey(it, i)),
    kind: "item",
    collection: "items",
    index: i,
    key: layoutItemKey(it, i),
    componentId: it?.component_id ?? null,
    label: sceneObjectLabel("items", i),
    parentId: null,
    depth: 0,
    planar: true,
    selectable: true
  }));
  const wallIds = cols.walls.map((w, i) => define({
    id: sceneNodeId.wall(layoutItemKey(w, i)),
    kind: "wall",
    collection: "walls",
    index: i,
    key: layoutItemKey(w, i),
    componentId: w?.component_id ?? null,
    label: sceneObjectLabel("walls", i),
    parentId: null,
    depth: 0,
    planar: true,
    selectable: true
  }));
  const poleIds = cols.poles.map((p, i) => {
    const parent = parentForPole(p, cols);
    return define({
      id: sceneNodeId.pole(layoutItemKey(p, i)),
      kind: "pole",
      collection: "poles",
      index: i,
      key: layoutItemKey(p, i),
      componentId: p?.component_id ?? null,
      label: sceneObjectLabel("poles", i),
      parentId: parent,
      planar: true,
      selectable: true,
      parentComponentId: isId(p?.foundation_component_id) ? p.foundation_component_id : null
    });
  });
  cols.walls.forEach((w, i) => {
    const wallKey = layoutItemKey(w, i);
    const segs = Array.isArray(w?.shape?.segments) ? w.shape.segments : [];
    const count = Math.max(wallSegmentCount(w), segs.length);
    for (let s = 0; s < count; s += 1) {
      const ref = subRef(segs[s]?.component_id, s);
      define({
        id: sceneNodeId.wallSegment(wallKey, ref),
        kind: "wall-segment",
        collection: "walls",
        index: i,
        key: wallKey,
        componentId: segs[s]?.component_id ?? null,
        label: `Segment ${s + 1}`,
        parentId: wallIds[i],
        planar: true,
        selectable: true,
        segmentIndex: s,
        segmentComponentId: segs[s]?.component_id ?? null
      });
    }
  });
  cols.poles.forEach((p, i) => {
    const poleKey = layoutItemKey(p, i);
    const signs = Array.isArray(p?.signs) ? p.signs : [];
    signs.forEach((s, j) => {
      const ref = subRef(s?.component_id, j);
      define({
        id: sceneNodeId.poleSign(poleKey, ref),
        kind: "pole-sign",
        collection: "poles",
        index: i,
        key: poleKey,
        componentId: s?.component_id ?? null,
        label: `Sign ${j + 1}`,
        parentId: poleIds[i],
        planar: false,
        selectable: true,
        signIndex: j
      });
    });
  });
  cols.wall_caps.forEach((c, i) => {
    const key = layoutItemKey(c, i);
    const wallNodeId = refPresent(c?.wall_component_id) ? parentItemId(c.wall_component_id, cols.walls, "wall") : parentByIndex(c?.wall_index, cols.walls, "wall");
    let parentId = null;
    if (wallNodeId) {
      parentId = wallNodeId;
      if (isId(c?.segment_component_id) && !c.segment_component_id.startsWith("unresolved:")) {
        const wi = nodes.get(wallNodeId)?.index;
        const segs = wi !== void 0 ? cols.walls[wi]?.shape?.segments : null;
        const si = Array.isArray(segs) ? segs.findIndex((s) => s?.component_id === c.segment_component_id) : -1;
        if (si >= 0) parentId = sceneNodeId.wallSegment(layoutItemKey(cols.walls[wi], wi), `component:${c.segment_component_id}`);
      }
    }
    define({
      id: sceneNodeId.wallCap(key),
      kind: "wall-cap",
      collection: "wall_caps",
      index: i,
      key,
      componentId: c?.component_id ?? null,
      label: `Cap ${i + 1}`,
      parentId,
      planar: false,
      selectable: true,
      parentComponentId: isId(c?.wall_component_id) ? c.wall_component_id : null
    });
  });
  cols.signage_cabinets.forEach((c, i) => {
    const key = layoutItemKey(c, i);
    const parentId = parentForCabinet(c, cols);
    const parentComponentId = c?.mount === "pole" ? isId(c?.pole_component_id) ? c.pole_component_id : null : c?.mount === "foundation" ? isId(c?.foundation_component_id) ? c.foundation_component_id : null : null;
    define({
      id: sceneNodeId.cabinet(key),
      kind: "cabinet",
      collection: "signage_cabinets",
      index: i,
      key,
      componentId: c?.component_id ?? null,
      label: `Cabinet ${i + 1}`,
      parentId,
      planar: false,
      selectable: true,
      parentComponentId
    });
  });
  const order = [];
  const roots = [];
  const depth = /* @__PURE__ */ new Map();
  const visit = (id, d) => {
    depth.set(id, d);
    const n = nodes.get(id);
    if (n) n.depth = d;
    order.push(id);
    (childIds.get(id) || []).forEach((c) => visit(c, d + 1));
  };
  for (const id of itemIds) if (id) visit(id, 0);
  for (const id of wallIds) if (id) visit(id, 0);
  for (const id of poleIds) if (id && !nodes.get(id)?.parentId) visit(id, 0);
  for (const id of nodes.keys()) if (!depth.has(id)) visit(id, 0);
  for (const [id, n] of nodes) if (!n.parentId) roots.push(id);
  return { nodes, order, roots };
}
function resolveSceneNode(scene, nodeId) {
  const parsed = parseSceneNodeId(nodeId);
  if (!parsed) return null;
  const cols = sceneCollections(scene);
  const findRow = (rows, key) => {
    const i = (rows || []).findIndex((r, j) => layoutItemKey(r, j) === key);
    return i >= 0 ? { row: rows[i], index: i } : null;
  };
  switch (parsed.kind) {
    case "item":
    case "pole":
    case "wall":
    case "wall-cap":
    case "cabinet": {
      const found = findRow(cols[COLLECTION_OF_KIND[parsed.kind]], parsed.key);
      if (!found) return null;
      return {
        node: parsed.kind,
        collection: COLLECTION_OF_KIND[parsed.kind],
        index: found.index,
        row: found.row,
        id: nodeId
      };
    }
    case "wall-segment": {
      const found = findRow(cols.walls, parsed.key);
      if (!found) return null;
      const segs = Array.isArray(found.row?.shape?.segments) ? found.row.shape.segments : [];
      let si = -1;
      if (parsed.ref?.startsWith("component:")) {
        si = segs.findIndex((s) => s?.component_id === parsed.ref.slice(10));
      } else if (parsed.ref?.startsWith("index:")) {
        const n = parseInt(parsed.ref.slice(6), 10);
        si = Number.isInteger(n) && n >= 0 && n < Math.max(wallSegmentCount(found.row), segs.length) ? n : -1;
      }
      if (si < 0) return null;
      return {
        node: "wall-segment",
        collection: "walls",
        index: found.index,
        row: found.row,
        wallIndex: found.index,
        segmentIndex: si,
        segment: segs[si] ?? null,
        id: nodeId
      };
    }
    case "pole-sign": {
      const found = findRow(cols.poles, parsed.key);
      if (!found) return null;
      const signs = Array.isArray(found.row?.signs) ? found.row.signs : [];
      let si = -1;
      if (parsed.ref?.startsWith("component:")) {
        si = signs.findIndex((s) => s?.component_id === parsed.ref.slice(10));
      } else if (parsed.ref?.startsWith("index:")) {
        const n = parseInt(parsed.ref.slice(6), 10);
        si = Number.isInteger(n) && n >= 0 && n < signs.length ? n : -1;
      }
      if (si < 0) return null;
      return {
        node: "pole-sign",
        collection: "poles",
        index: found.index,
        row: found.row,
        poleIndex: found.index,
        signIndex: si,
        sign: signs[si] ?? null,
        id: nodeId
      };
    }
    default:
      return null;
  }
}
function hitPartFromHit(hit) {
  if (!hit || typeof hit !== "object") return { type: "row" };
  switch (hit.kind) {
    case "item-face":
      return { type: "face" };
    case "item-edge":
      return { type: "edge", edge: hit.edge ?? null };
    case "item-vertex":
      return { type: "vertex", corner: hit.corner ?? null };
    case "pole":
      return { type: "point" };
    case "wall-vertex":
      return { type: "vertex", vertexIndex: hit.vertexIndex ?? null };
    case "wall-segment":
      return {
        type: "segment",
        segmentIndex: hit.segmentIndex ?? null,
        segmentComponentId: hit.segmentComponentId ?? null,
        t: fin4(hit.t) ? hit.t : null
      };
    case "wall-face":
      return { type: "face" };
    default:
      return { type: "row" };
  }
}
function nodeTargetForHit(hit) {
  if (!hit || typeof hit !== "object" || !isId(hit.collection)) return null;
  const part = hitPartFromHit(hit);
  if (hit.collection === "items") {
    return { id: sceneNodeId.item(hit.key), kind: "item", part, hit };
  }
  if (hit.collection === "poles") {
    return { id: sceneNodeId.pole(hit.key), kind: "pole", part, hit };
  }
  if (hit.collection === "walls") {
    if (hit.kind === "wall-segment" && fin4(hit.segmentIndex)) {
      const ref = subRef(hit.segmentComponentId, hit.segmentIndex);
      return {
        id: sceneNodeId.wallSegment(hit.key, ref),
        kind: "wall-segment",
        part,
        hit
      };
    }
    return { id: sceneNodeId.wall(hit.key), kind: "wall", part, hit };
  }
  return null;
}
var hitDescriptor = (hit) => ({
  collection: hit?.collection ?? null,
  index: hit?.index ?? null,
  key: hit?.key ?? null,
  componentId: hit?.componentId ?? null,
  label: hit ? hitLabel(hit) : null
});
function selectionKeyAction(event) {
  if (!event || typeof event !== "object") return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key;
  if (key === "Tab" || key === "ArrowRight" || key === "ArrowDown") {
    return { action: "cycle", direction: event.shiftKey ? -1 : 1 };
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return { action: "cycle", direction: -1 };
  }
  if (key === "Escape") return { action: "clear" };
  if (key === "Delete" || key === "Backspace") return { action: "delete-request" };
  return null;
}
function regionFromPoints(a, b) {
  const pa = planPointOf(a);
  const pb = planPointOf(b);
  if (!pa || !pb) return null;
  return {
    minX: Math.min(pa.x, pb.x),
    minZ: Math.min(pa.z, pb.z),
    maxX: Math.max(pa.x, pb.x),
    maxZ: Math.max(pa.z, pb.z)
  };
}
var regionIsUsable = (r) => !!r && fin4(r.minX) && fin4(r.minZ) && fin4(r.maxX) && fin4(r.maxZ) && r.minX <= r.maxX && r.minZ <= r.maxZ;
var pointInRegion = (r, p) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
var regionCorners = (r) => [
  { x: r.minX, z: r.minZ },
  { x: r.maxX, z: r.minZ },
  { x: r.maxX, z: r.maxZ },
  { x: r.minX, z: r.maxZ }
];
var segSegIntersect = (a, b, c, d) => {
  const cross = (o, p, q) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if ((d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0)) return true;
  const on = (p, q, r0) => Math.min(p.x, q.x) <= r0.x && r0.x <= Math.max(p.x, q.x) && Math.min(p.z, q.z) <= r0.z && r0.z <= Math.max(p.z, q.z) && Math.abs(cross(p, q, r0)) <= 1e-9;
  if (d1 === 0 && on(c, d, a)) return true;
  if (d2 === 0 && on(c, d, b)) return true;
  if (d3 === 0 && on(a, b, c)) return true;
  if (d4 === 0 && on(a, b, d)) return true;
  return false;
};
var segmentIntersectsRegion = (a, b, r) => {
  if (pointInRegion(r, a) || pointInRegion(r, b)) return true;
  const c = regionCorners(r);
  for (let i = 0; i < 4; i += 1) {
    if (segSegIntersect(a, b, c[i], c[(i + 1) % 4])) return true;
  }
  return false;
};
var rectsIntersect = (cornersA, cornersB) => {
  const axes = [];
  for (const corners of [cornersA, cornersB]) {
    for (let i = 0; i < 2; i += 1) {
      const e = { x: corners[(i + 1) % 4].x - corners[i].x, z: corners[(i + 1) % 4].z - corners[i].z };
      const len = hypot2(e.x, e.z) || 1;
      axes.push({ x: -e.z / len, z: e.x / len });
    }
  }
  for (const axis of axes) {
    const proj = (c) => c.x * axis.x + c.z * axis.z;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const c of cornersA) {
      const p = proj(c);
      if (p < aMin) aMin = p;
      if (p > aMax) aMax = p;
    }
    for (const c of cornersB) {
      const p = proj(c);
      if (p < bMin) bMin = p;
      if (p > bMax) bMax = p;
    }
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
};
var circleIntersectsRegion = (center, radius, r) => {
  const cx = Math.min(Math.max(center.x, r.minX), r.maxX);
  const cz = Math.min(Math.max(center.z, r.minZ), r.maxZ);
  return hypot2(center.x - cx, center.z - cz) <= radius;
};
var pointInPolygon2 = (p, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};
var itemInRegion = (item, r, mode) => {
  const g = itemPlanGeometry(item);
  if (!g) return false;
  if (g.circular) {
    const radius = Math.min(g.size.width, g.size.depth) / 2;
    if (mode === "contain") {
      return g.center.x - radius >= r.minX && g.center.x + radius <= r.maxX && g.center.z - radius >= r.minZ && g.center.z + radius <= r.maxZ;
    }
    return circleIntersectsRegion(g.center, radius, r);
  }
  const corners = framePlanCorners(g.frame, g.size);
  if (!corners) return false;
  const list2 = [corners.nw, corners.ne, corners.se, corners.sw];
  if (mode === "contain") return list2.every((c) => pointInRegion(r, c));
  return rectsIntersect(list2, regionCorners(r));
};
var wallInRegion = (wall, r, mode) => {
  const g = wallPlanGeometry(wall);
  if (!g || !g.points.length) return false;
  if (mode === "contain") {
    return g.points.every((p) => pointInRegion(r, p));
  }
  if (g.points.some((p) => pointInRegion(r, p))) return true;
  const segCount = g.closed ? g.points.length : g.points.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    if (segmentIntersectsRegion(g.points[i], g.points[(i + 1) % g.points.length], r)) return true;
  }
  if (g.closed && pointInPolygon2(regionCorners(r)[0], g.points)) return true;
  return false;
};
function sceneObjectsInRegion(scene, region, { mode = "intersect" } = {}) {
  if (!regionIsUsable(region)) return [];
  const m = REGION_SELECT_MODES.includes(mode) ? mode : "intersect";
  const cols = sceneCollections(scene);
  const picked = /* @__PURE__ */ new Set();
  cols.items.forEach((it, i) => {
    if (itemInRegion(it, region, m)) picked.add(sceneNodeId.item(layoutItemKey(it, i)));
  });
  cols.walls.forEach((w, i) => {
    if (wallInRegion(w, region, m)) picked.add(sceneNodeId.wall(layoutItemKey(w, i)));
  });
  cols.poles.forEach((p, i) => {
    const q = planPointOf({ x: p?.x_inches, z: p?.z_inches });
    if (q && pointInRegion(region, q)) picked.add(sceneNodeId.pole(layoutItemKey(p, i)));
  });
  const tree = buildSceneTree(scene);
  return tree.order.filter((id) => picked.has(id));
}
function createSceneSelection() {
  let ids = [];
  let primaryId = null;
  let parts = {};
  let descriptors = {};
  let marquee = null;
  let version2 = 0;
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    version2 += 1;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
      }
    }
  };
  const has = (id) => ids.includes(id);
  const descriptorFor = (target, extra = {}) => ({
    id: target.id,
    kind: target.kind ?? parseSceneNodeId(target.id)?.kind ?? null,
    collection: extra.collection ?? null,
    index: extra.index ?? null,
    key: extra.key ?? null,
    componentId: extra.componentId ?? null,
    label: extra.label ?? null,
    parentId: extra.parentId ?? null,
    segmentIndex: extra.segmentIndex ?? null,
    signIndex: extra.signIndex ?? null
  });
  const describe = (id, target, extra) => {
    const t = typeof target === "string" ? { id: target } : target;
    if (!t) return;
    descriptors = { ...descriptors, [id]: descriptorFor(t, extra) };
  };
  const setState = (nextIds, nextPrimary, nextParts, nextDescriptors) => {
    ids = nextIds;
    primaryId = nextPrimary;
    parts = nextParts;
    descriptors = nextDescriptors;
    emit();
  };
  const setSelection = (entries2, { primary } = {}) => {
    const list2 = Array.isArray(entries2) ? entries2 : [];
    const seen = /* @__PURE__ */ new Set();
    const nextIds = [];
    const nextParts = {};
    const nextDescriptors = {};
    for (const entry of list2) {
      const id = typeof entry === "string" ? entry : entry?.id;
      if (!isId(id) || seen.has(id)) continue;
      seen.add(id);
      nextIds.push(id);
      nextParts[id] = typeof entry === "object" && entry?.part ? entry.part : { type: "row" };
      nextDescriptors[id] = typeof entry === "object" && entry?.descriptor ? entry.descriptor : { id, kind: parseSceneNodeId(id)?.kind ?? null, collection: null, index: null, key: null, componentId: null, label: null, parentId: null, segmentIndex: null, signIndex: null };
    }
    const nextPrimary = isId(primary) && seen.has(primary) ? primary : nextIds[nextIds.length - 1] ?? null;
    setState(nextIds, nextPrimary, nextParts, nextDescriptors);
    return { status: "set", ids: [...nextIds], primaryId: nextPrimary };
  };
  const select = (target, { additive = false } = {}) => {
    const id = typeof target === "string" ? target : target?.id;
    if (!isId(id)) {
      if (!additive) {
        if (!ids.length && primaryId === null) return { status: "empty" };
        setState([], null, {}, {});
        return { status: "cleared" };
      }
      return { status: "kept", ids: [...ids] };
    }
    if (!additive) {
      const part2 = typeof target === "object" && target?.part ? target.part : { type: "row" };
      describe(id, target, target?.descriptor);
      setState([id], id, { [id]: part2 }, descriptors);
      return { status: "selected", id, primaryId: id };
    }
    if (has(id)) {
      const nextIds = ids.filter((x) => x !== id);
      const nextParts = { ...parts };
      delete nextParts[id];
      const nextDescriptors = { ...descriptors };
      delete nextDescriptors[id];
      const nextPrimary = primaryId === id ? nextIds[nextIds.length - 1] ?? null : primaryId;
      setState(nextIds, nextPrimary, nextParts, nextDescriptors);
      return { status: "toggled-off", id, primaryId: nextPrimary };
    }
    const part = typeof target === "object" && target?.part ? target.part : { type: "row" };
    describe(id, target, target?.descriptor);
    setState([...ids, id], id, { ...parts, [id]: part }, descriptors);
    return { status: "selected", id, primaryId: id };
  };
  const selectHit = (hit, { additive = false } = {}) => {
    const target = nodeTargetForHit(hit);
    return select(target ? { ...target, descriptor: hitDescriptor(hit) } : null, { additive });
  };
  const pickAtPoint = (scene, point, opts = {}) => {
    const hits = hitTestPlanAll(scene, point, opts);
    const hit = hits.length ? hits[0] : null;
    return { hit, target: nodeTargetForHit(hit), hits };
  };
  const selectAtPoint = (scene, point, { additive = false, ...opts } = {}) => selectHit(pickAtPoint(scene, point, opts).hit, { additive });
  const clear = () => {
    if (!ids.length && primaryId === null) return { status: "empty" };
    setState([], null, {}, {});
    return { status: "cleared" };
  };
  const isSelected = (id) => has(id);
  const entries = () => ids.map((id) => ({
    ...descriptors[id] || { id, kind: parseSceneNodeId(id)?.kind ?? null },
    id,
    part: parts[id] || { type: "row" },
    primary: id === primaryId
  }));
  const cycle = (scene, direction = 1) => {
    const tree = buildSceneTree(scene);
    const order = tree.order.filter((id) => tree.nodes.get(id)?.selectable !== false);
    if (!order.length) return { status: "empty", id: null };
    const dir = direction < 0 ? -1 : 1;
    let next;
    if (!primaryId || !order.includes(primaryId)) {
      next = dir > 0 ? order[0] : order[order.length - 1];
    } else {
      const i = order.indexOf(primaryId);
      next = order[(i + dir + order.length) % order.length];
    }
    const n = tree.nodes.get(next);
    describe(next, { id: next, kind: n?.kind }, n ? {
      collection: n.collection,
      index: n.index,
      key: n.key,
      componentId: n.componentId,
      label: n.label,
      parentId: n.parentId,
      segmentIndex: n.segmentIndex ?? null,
      signIndex: n.signIndex ?? null
    } : void 0);
    setState([next], next, { [next]: { type: "row" } }, descriptors);
    return { status: "cycled", id: next, label: n?.label ?? null };
  };
  const applyKey = (event, scene) => {
    const act = selectionKeyAction(event);
    if (!act) return null;
    if (act.action === "cycle") return cycle(scene, act.direction);
    if (act.action === "clear") {
      clear();
      return { status: "cleared" };
    }
    if (act.action === "delete-request") {
      return { status: "delete-request", entries: entries() };
    }
    return null;
  };
  const reconcile = (scene) => {
    const tree = buildSceneTree(scene);
    const nextIds = [];
    const nextParts = {};
    const nextDescriptors = {};
    const dropped = [];
    const remapped = {};
    const downgraded = [];
    const seen = /* @__PURE__ */ new Set();
    const adopt = (oldId, newId, node, part) => {
      if (seen.has(newId)) {
        dropped.push(oldId);
        return;
      }
      seen.add(newId);
      nextIds.push(newId);
      nextParts[newId] = part;
      nextDescriptors[newId] = {
        id: newId,
        kind: node?.kind ?? null,
        collection: node?.collection ?? null,
        index: node?.index ?? null,
        key: node?.key ?? null,
        componentId: node?.componentId ?? null,
        label: node?.label ?? null,
        parentId: node?.parentId ?? null,
        segmentIndex: node?.segmentIndex ?? null,
        signIndex: node?.signIndex ?? null
      };
      if (newId !== oldId) remapped[oldId] = newId;
    };
    const sanitizePart = (id, node, part) => {
      if (!part || part.type === "row") return { type: "row" };
      if (part.type === "vertex" && Number.isInteger(part.vertexIndex)) {
        const w = node?.collection === "walls" ? sceneCollections(scene).walls[node.index] : null;
        const authored = Array.isArray(w?.shape?.points) ? w.shape.points.length : 0;
        if (part.vertexIndex >= 0 && part.vertexIndex < authored) return part;
        downgraded.push(id);
        return { type: "row" };
      }
      if (part.type === "segment") {
        if (node?.kind === "wall-segment" && node.segmentIndex === part.segmentIndex) return part;
        downgraded.push(id);
        return { type: "row" };
      }
      return part;
    };
    for (const oldId of ids) {
      if (tree.nodes.has(oldId)) {
        const node = tree.nodes.get(oldId);
        adopt(oldId, oldId, node, sanitizePart(oldId, node, parts[oldId]));
        continue;
      }
      const parsed = parseSceneNodeId(oldId);
      if (parsed && (parsed.kind === "wall-segment" || parsed.kind === "pole-sign") && parsed.ref?.startsWith("index:")) {
        const res = resolveSceneNode(scene, oldId);
        if (res) {
          const parentKey = parsed.key;
          const sub = parsed.kind === "wall-segment" ? res.segment?.component_id : res.sign?.component_id;
          const newId = parsed.kind === "wall-segment" ? sceneNodeId.wallSegment(parentKey, subRef(sub ?? res.segment?.component_id, res.segmentIndex)) : sceneNodeId.poleSign(parentKey, subRef(sub ?? res.sign?.component_id, res.signIndex));
          if (tree.nodes.has(newId)) {
            adopt(oldId, newId, tree.nodes.get(newId), sanitizePart(newId, tree.nodes.get(newId), parts[oldId]));
            continue;
          }
        }
      }
      dropped.push(oldId);
    }
    const nextPrimary = primaryId && seen.has(primaryId) ? primaryId : primaryId && remapped[primaryId] && seen.has(remapped[primaryId]) ? remapped[primaryId] : nextIds[nextIds.length - 1] ?? null;
    const descChanged = nextIds.some((id) => JSON.stringify(nextDescriptors[id]) !== JSON.stringify(descriptors[id])) || Object.keys(nextDescriptors).length !== Object.keys(descriptors).length;
    const changed = dropped.length > 0 || Object.keys(remapped).length > 0 || nextIds.length !== ids.length || nextIds.some((id, i) => id !== ids[i]) || nextPrimary !== primaryId || downgraded.length > 0 || descChanged;
    if (changed) {
      setState(nextIds, nextPrimary, nextParts, nextDescriptors);
      return { status: "reconciled", kept: [...nextIds], dropped, remapped, downgraded };
    }
    return { status: "unchanged", kept: [...nextIds], dropped: [], remapped: {}, downgraded: [] };
  };
  const beginMarquee = ({ point, additive = false } = {}) => {
    const p = planPointOf(point);
    if (!p) return { status: "invalid" };
    marquee = { start: p, current: p, additive: additive === true };
    emit();
    return { status: "open" };
  };
  const updateMarquee = (point) => {
    if (!marquee) return { status: "no-marquee" };
    const p = planPointOf(point);
    if (!p) return { status: "invalid" };
    marquee = { ...marquee, current: p };
    emit();
    return { status: "updated" };
  };
  const commitMarquee = (scene, { mode = "intersect", empty = false } = {}) => {
    if (!marquee) return { status: "no-marquee" };
    const m = marquee;
    marquee = null;
    if (empty) {
      emit();
      if (!m.additive) {
        clear();
        return { status: "cleared" };
      }
      return { status: "kept" };
    }
    const region = regionFromPoints(m.start, m.current);
    const picked = sceneObjectsInRegion(scene, region, { mode });
    if (m.additive) {
      const nextIds = [...ids];
      const nextParts2 = { ...parts };
      const nextDescriptors2 = { ...descriptors };
      const tree2 = buildSceneTree(scene);
      for (const id of picked) {
        if (nextIds.includes(id)) continue;
        nextIds.push(id);
        nextParts2[id] = { type: "row" };
        const n = tree2.nodes.get(id);
        nextDescriptors2[id] = descriptorFor(
          { id, kind: n?.kind },
          { collection: n?.collection, index: n?.index, key: n?.key, componentId: n?.componentId, label: n?.label, parentId: n?.parentId }
        );
      }
      const nextPrimary = picked.length ? picked[picked.length - 1] : primaryId;
      setState(nextIds, nextPrimary, nextParts2, nextDescriptors2);
      return { status: "marquee", ids: [...nextIds], picked, additive: true };
    }
    const tree = buildSceneTree(scene);
    const nextDescriptors = {};
    for (const id of picked) {
      const n = tree.nodes.get(id);
      nextDescriptors[id] = descriptorFor(
        { id, kind: n?.kind },
        { collection: n?.collection, index: n?.index, key: n?.key, componentId: n?.componentId, label: n?.label, parentId: n?.parentId }
      );
    }
    const nextParts = {};
    for (const id of picked) nextParts[id] = { type: "row" };
    setState(picked, picked[picked.length - 1] ?? null, nextParts, nextDescriptors);
    return { status: "marquee", ids: [...picked], picked, additive: false };
  };
  const cancelMarquee = () => {
    if (!marquee) return { status: "no-marquee" };
    marquee = null;
    emit();
    return { status: "cancelled" };
  };
  const getState = () => ({
    stateVersion: version2,
    ids: [...ids],
    count: ids.length,
    primaryId,
    primary: primaryId ? { ...descriptors[primaryId] || { id: primaryId }, id: primaryId, part: parts[primaryId] || { type: "row" } } : null,
    marquee: marquee ? { ...marquee, start: { ...marquee.start }, current: { ...marquee.current } } : null
  });
  const subscribe = (fn) => {
    if (typeof fn !== "function") return () => {
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  return {
    // queries
    isSelected,
    entries,
    getState,
    subscribe,
    // mutation
    select,
    setSelection,
    selectHit,
    selectAtPoint,
    clear,
    cycle,
    applyKey,
    // scene-facing
    pickAtPoint,
    reconcile,
    // marquee
    beginMarquee,
    updateMarquee,
    commitMarquee,
    cancelMarquee,
    get stateVersion() {
      return version2;
    },
    get primaryId() {
      return primaryId;
    }
  };
}

// src/components/estimator/foundation/foundationAssemblyModel.js
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
var isRecord9 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var isId2 = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= ID_MAX;
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
var cloneNode = (n) => isRecord9(n) ? { ...n } : n;
var fin5 = (v) => typeof v === "number" && Number.isFinite(v);
var segEndpoints = (shape, i) => {
  const pts = shape?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const closed = shape?.closed === true && pts.length >= 3;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  if (i >= pts.length || !closed && i >= pts.length - 1) return null;
  if (!fin5(a?.x) || !fin5(a?.z) || !fin5(b?.x) || !fin5(b?.z)) return null;
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
    if (isId2(r?.component_id)) ids.add(r.component_id);
  });
  ARRAYS.forEach((k) => walk(project?.[k]));
  (project?.walls || []).forEach((w) => walk(w?.shape?.segments));
  (project?.poles || []).forEach((p) => walk(p?.signs));
  return ids;
};
var collectRefs = (project) => {
  const refs = /* @__PURE__ */ new Set();
  const add = (v) => {
    if (isId2(v)) refs.add(v);
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
    if (isId2(id) && !isReserved(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`foundation assembly: could not mint a unique component id for ${kind}`);
};
var validateRef = (v, kind) => {
  if (v === void 0 || v === null) return;
  if (typeof v !== "string" || v !== "" && !isId2(v) && !isUnresolvedToken(v)) {
    throw new Error(`foundation assembly: invalid ${kind} reference value`);
  }
};
var ensureNodeId = (row, createId, kind, used, seen) => {
  if (!isRecord9(row)) throw new Error(`foundation assembly: ${kind} row must be a record`);
  const n = cloneNode(row);
  const existing = n.component_id;
  if (existing !== void 0 && existing !== null) {
    if (!isId2(existing) || isReserved(existing)) throw new Error(`foundation assembly: invalid component_id on ${kind} row`);
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
  for (const src2 of [previous || {}, project || {}]) {
    collectIds(src2).forEach((id) => used.add(id));
    collectRefs(src2).forEach((id) => used.add(id));
    const kinds = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
    for (const k of kinds) for (const r of src2?.[k] || []) {
      if (!isRecord9(r)) throw new Error(`foundation assembly: ${k} row must be a record`);
      for (const [f, kind] of [["foundation_component_id", "foundation"], ["pole_component_id", "pole"], ["wall_component_id", "wall"], ["segment_component_id", "segment"]]) validateRef(r[f], kind);
    }
    for (const w of src2?.walls || []) for (const s of w?.shape?.segments || []) check(s?.component_id);
    for (const p of src2?.poles || []) for (const s of p?.signs || []) check(s?.component_id);
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
    if (isId2(canon) && (incoming || []).some((p) => p?.component_id === canon)) {
      return { canon, index: rebuildIndex(canon, incoming) };
    }
    if (isId2(canon)) return { canon: unresolvedToken, index: void 0, dangling: true, token: true };
    return { canon: unresolvedToken, index: void 0, dangling: true, token: true, outOfRange: true };
  }
  if (legacy.invalid !== void 0) return { canon: unresolvedToken, index: void 0, dangling: true, token: true, invalid: legacy.invalid };
  if (legacy.explicit) return { canon: "", index: void 0 };
  return { canon: void 0, index: void 0 };
};
var normalizeWalls = (walls, prevWalls, items, prevItems, createId, used, seen) => {
  const prevSegIds = /* @__PURE__ */ new Map();
  (prevWalls || []).forEach((w) => {
    const segs = w?.shape?.segments || [];
    segs.forEach((s, i) => {
      const key = segEndpoints(w?.shape, i);
      if (!isId2(s?.component_id) || !key) return;
      const k = `${w.component_id}|${key}`;
      if (prevSegIds.has(k)) prevSegIds.set(k, null);
      else prevSegIds.set(k, s.component_id);
    });
  });
  const out = [];
  for (const w of walls || []) {
    const n = ensureNodeId(w, createId, "wall", used, seen);
    const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(n, "foundation_component_id"), legacyIndexOf(n, ["foundation_index"]), items, prevItems, UNRESOLVED.foundation);
    n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
    n.foundation_index = res.index;
    const shape = isRecord9(n.shape) ? { ...n.shape } : n.shape;
    const segs = shape?.segments;
    if (segs !== void 0 && !Array.isArray(segs)) throw new Error("foundation assembly: wall shape segments must be an array");
    if (Array.isArray(segs)) {
      for (const s of segs) if (!isRecord9(s)) throw new Error("foundation assembly: wall shape segments must be records");
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
  if (!isRecord9(project)) throw new Error("foundation assembly: project must be a record");
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
  next.walls = normalizeWalls(project.walls, previous?.walls, next.items, previous?.items, createId, used, seen);
  next.poles = normalizePoles(project.poles, next.items, previous?.items, createId, used, seen);
  next.wall_caps = normalizeCaps(project.wall_caps, next.walls, previous?.walls, createId, used, seen);
  next.signage_cabinets = normalizeCabinets(project.signage_cabinets, next.items, next.poles, previous?.items, previous?.poles, createId, used, seen);
  return { project: next, issues: foundationAssemblyIssues(next) };
}
function foundationAssemblyIssues(project) {
  const issues = [];
  if (!isRecord9(project)) return issues;
  const items = project.items || [];
  const walls = project.walls || [];
  const poles = project.poles || [];
  const byId2 = (arr, id) => isId2(id) && (arr || []).some((p) => p?.component_id === id);
  for (const p of poles) {
    const canon = p?.foundation_component_id;
    if (canon === "" || canon === void 0 || canon === null) continue;
    if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole legacy foundation index could not be resolved; left unresolved until reassigned." });
    else if (!byId2(items, canon)) issues.push({ code: "dangling-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole references a foundation that is not present; it stays priced until reassigned." });
  }
  for (const w of project.walls || []) {
    const fId = w?.foundation_component_id;
    if (fId === "" || fId === void 0 || fId === null) continue;
    if (isReserved(fId)) issues.push({ code: "unresolved-parent", kind: "wall", componentId: w?.component_id, parentId: fId, message: "Wall legacy foundation index could not be resolved; left unresolved until reassigned." });
    else if (!byId2(items, fId)) issues.push({ code: "dangling-parent", kind: "wall", componentId: w?.component_id, parentId: fId, message: "Wall references a foundation that is not present; it stays priced until reassigned." });
  }
  for (const c of project.wall_caps || []) {
    const wId = c?.wall_component_id;
    if (wId === "" || wId === void 0 || wId === null) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall assigned; it stays priced until assigned." });
    else if (isReserved(wId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap wall could not be resolved; left unresolved until reassigned." });
    else if (!byId2(walls, wId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap references a wall that is not present; it stays priced until reassigned." });
    const wall = walls.find((w) => w?.component_id === wId);
    const segs = wall?.shape?.segments || [];
    const sId = c?.segment_component_id;
    if (sId === "" || sId === void 0 || sId === null) {
      if (wall) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall segment assigned; it stays priced until assigned." });
    } else if (isReserved(sId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap segment could not be resolved; left unresolved until reassigned." });
    else if (!byId2(segs, sId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap references a wall segment that is not present; it stays priced until reassigned." });
  }
  for (const c of project.signage_cabinets || []) {
    if (c?.mount === "pole") {
      const canon = c?.pole_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet pole could not be resolved; left unresolved until reassigned." });
      else if (!byId2(poles, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a pole that is not present; it stays priced until reassigned." });
    } else if (c?.mount === "foundation") {
      const canon = c?.foundation_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet foundation could not be resolved; left unresolved until reassigned." });
      else if (!byId2(items, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a foundation that is not present; it stays priced until reassigned." });
    } else {
      issues.push({ code: "unsupported-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet mount is not supported; it stays priced and visible until reassigned." });
    }
  }
  return issues;
}
function cloneFoundationComponents(project, { createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord9(project)) throw new Error("foundation assembly: project must be a record");
  const rawWallSegments = /* @__PURE__ */ new Map();
  const wallsForNormalize = (Array.isArray(project.walls) ? project.walls : []).map((w, i) => {
    if (!isRecord9(w) || !isRecord9(w.shape)) return w;
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
    if (!isId2(oldId) || isReserved(oldId)) return oldId;
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
      shape: isRecord9(w.shape) ? {
        ...w.shape,
        segments: rawWallSegments.has(i) ? cloneRawValue(rawWallSegments.get(i)) : Array.isArray(w.shape.segments) ? w.shape.segments.map((s) => ({ ...s, component_id: remap(s.component_id, "wall_segment") })) : w.shape.segments || []
      } : w.shape
    }));
  }
  if (project.poles !== void 0) {
    components.poles = copyRows(normalized.poles, "pole").map((p) => ({
      ...p,
      foundation_component_id: isId2(p.foundation_component_id) && idMap.has(p.foundation_component_id) ? idMap.get(p.foundation_component_id) : p.foundation_component_id,
      signs: (p.signs || []).map((s) => ({ ...s, component_id: remap(s.component_id, "pole_sign") }))
    }));
  }
  if (project.wall_caps !== void 0) {
    components.wall_caps = copyRows(normalized.wall_caps, "wall_cap").map((c) => ({
      ...c,
      wall_component_id: isId2(c.wall_component_id) && idMap.has(c.wall_component_id) ? idMap.get(c.wall_component_id) : c.wall_component_id,
      segment_component_id: isId2(c.segment_component_id) && idMap.has(c.segment_component_id) ? idMap.get(c.segment_component_id) : c.segment_component_id
    }));
  }
  if (project.signage_cabinets !== void 0) {
    components.signage_cabinets = copyRows(normalized.signage_cabinets, "signage_cabinet").map((c) => ({
      ...c,
      foundation_component_id: isId2(c.foundation_component_id) && idMap.has(c.foundation_component_id) ? idMap.get(c.foundation_component_id) : c.foundation_component_id,
      pole_component_id: isId2(c.pole_component_id) && idMap.has(c.pole_component_id) ? idMap.get(c.pole_component_id) : c.pole_component_id
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

// src/components/estimator/foundation/foundationDuplicateMirror.js
var ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var ID_RETRY_MAX = 8;
var DEFAULT_OFFSET_INCHES = { x: 12, z: 12 };
var isRecord10 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var fin6 = (v) => typeof v === "number" && Number.isFinite(v);
var isId3 = (v) => typeof v === "string" && v.length > 0;
var deepClone2 = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var cloneRow = (r) => {
  try {
    return deepClone2(r);
  } catch {
    return isRecord10(r) ? { ...r } : r;
  }
};
var rebuildIndex2 = (id, parents) => {
  if (!isId3(id)) return void 0;
  const i = (parents || []).findIndex((p) => p?.component_id === id);
  return i >= 0 ? i : void 0;
};
var collectUsedComponentIds = (project) => {
  const ids = /* @__PURE__ */ new Set();
  const push = (v) => {
    if (isId3(v)) ids.add(v);
  };
  for (const k of ASSEMBLY_ARRAYS) {
    for (const r of project?.[k] || []) {
      if (!isRecord10(r)) continue;
      push(r.component_id);
      push(r.foundation_component_id);
      push(r.pole_component_id);
      push(r.wall_component_id);
      push(r.segment_component_id);
      push(r.source_item_component_id);
    }
  }
  for (const w of project?.walls || []) for (const s of w?.shape?.segments || []) push(s?.component_id);
  for (const p of project?.poles || []) for (const s of p?.signs || []) push(s?.component_id);
  return ids;
};
var collisionFreeId = (createId, used, kind) => {
  for (let i = 0; i < ID_RETRY_MAX; i += 1) {
    const id = createId(kind);
    if (isId3(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`foundation duplicate/mirror: could not mint a collision-free ${kind} id`);
};
var selectRows = (project, componentIds, includeDependents) => {
  const selected = {};
  for (const k of ASSEMBLY_ARRAYS) selected[k] = /* @__PURE__ */ new Set();
  if (componentIds !== void 0 && componentIds !== null && !Array.isArray(componentIds)) {
    throw new Error("foundation duplicate/mirror: component_ids must be an array");
  }
  if (componentIds === void 0 || componentIds === null) {
    for (const k of ASSEMBLY_ARRAYS) for (const r of project?.[k] || []) selected[k].add(r);
  } else {
    const lookup = /* @__PURE__ */ new Map();
    for (const k of ASSEMBLY_ARRAYS) {
      for (const r of project?.[k] || []) {
        if (isId3(r?.component_id) && !lookup.has(r.component_id)) lookup.set(r.component_id, { kind: k, row: r });
      }
    }
    const unmatched = componentIds.filter((id) => !lookup.has(id));
    if (unmatched.length) {
      throw new Error(`foundation duplicate/mirror: unknown component id(s): ${unmatched.join(", ")}`);
    }
    for (const id of componentIds) {
      const hit = lookup.get(id);
      selected[hit.kind].add(hit.row);
    }
  }
  if (includeDependents) {
    const itemIds = () => new Set([...selected.items].map((r) => r?.component_id).filter(isId3));
    const wallIds = () => new Set([...selected.walls].map((r) => r?.component_id).filter(isId3));
    const poleIds = () => new Set([...selected.poles].map((r) => r?.component_id).filter(isId3));
    let grew = true;
    while (grew) {
      grew = false;
      const items = itemIds();
      for (const p of project?.poles || []) {
        if (!selected.poles.has(p) && items.has(p?.foundation_component_id)) {
          selected.poles.add(p);
          grew = true;
        }
      }
      const walls = wallIds();
      for (const c of project?.wall_caps || []) {
        if (!selected.wall_caps.has(c) && walls.has(c?.wall_component_id)) {
          selected.wall_caps.add(c);
          grew = true;
        }
      }
      const poles = poleIds();
      for (const c of project?.signage_cabinets || []) {
        if (selected.signage_cabinets.has(c)) continue;
        const pool = c?.mount === "pole" ? poles : items;
        const parent = c?.mount === "pole" ? c?.pole_component_id : c?.foundation_component_id;
        if (pool.has(parent)) {
          selected.signage_cabinets.add(c);
          grew = true;
        }
      }
    }
  }
  return selected;
};
var subsetOf = (project, selected) => {
  const out = {};
  for (const k of ASSEMBLY_ARRAYS) out[k] = (project?.[k] || []).filter((r) => selected[k].has(r));
  return out;
};
function appendClonedFoundationAssemblies(project, assemblyData, { createId, transformClone } = {}) {
  if (!isRecord10(project)) throw new Error("foundation duplicate/mirror: project must be a record");
  if (!isRecord10(assemblyData)) throw new Error("foundation duplicate/mirror: assembly data must be a record");
  if (typeof createId !== "function") throw new Error("foundation duplicate/mirror: createId(kind) factory is required");
  const used = collectUsedComponentIds(project);
  const guarded = (kind) => collisionFreeId(createId, used, kind);
  const { components, idMap } = cloneFoundationComponents(assemblyData, { createId: guarded });
  if (typeof transformClone === "function") {
    for (const k of ASSEMBLY_ARRAYS) for (const r of components[k] || []) transformClone(r, k);
  }
  for (const p of components.poles || []) {
    if (isId3(p?.source_item_component_id) && idMap.has(p.source_item_component_id)) {
      p.source_item_component_id = idMap.get(p.source_item_component_id);
    }
  }
  const items = [...(project.items || []).map(cloneRow), ...components.items || []];
  const walls = [...(project.walls || []).map(cloneRow), ...components.walls || []];
  const poles = [...(project.poles || []).map(cloneRow), ...components.poles || []];
  const wallCaps = [...(project.wall_caps || []).map(cloneRow), ...components.wall_caps || []];
  const cabinets = [...(project.signage_cabinets || []).map(cloneRow), ...components.signage_cabinets || []];
  for (const p of components.poles || []) {
    p.foundation_idx = rebuildIndex2(p.foundation_component_id, items);
  }
  for (const c of components.wall_caps || []) {
    c.wall_index = rebuildIndex2(c.wall_component_id, walls);
    const wall = walls.find((w) => w?.component_id === c.wall_component_id);
    const segs = Array.isArray(wall?.shape?.segments) ? wall.shape.segments : [];
    c.segment_index = rebuildIndex2(c.segment_component_id, segs);
  }
  for (const c of components.signage_cabinets || []) {
    if (c.mount === "pole") {
      c.pole_index = rebuildIndex2(c.pole_component_id, poles);
      c.foundation_index = void 0;
    } else {
      c.foundation_index = rebuildIndex2(c.foundation_component_id, items);
      c.pole_index = void 0;
    }
  }
  const patch = {};
  const clonedCounts = {};
  const pairs = [["items", items], ["walls", walls], ["poles", poles], ["wall_caps", wallCaps], ["signage_cabinets", cabinets]];
  for (const [k, arr] of pairs) {
    const n = (components[k] || []).length;
    clonedCounts[k] = n;
    if (n > 0) patch[k] = arr;
  }
  return { patch, components, idMap, clonedCounts };
}
var normalizeOffset = (v) => {
  if (v === void 0 || v === null) return { ...DEFAULT_OFFSET_INCHES };
  if (fin6(v)) return { x: v, z: v };
  if (isRecord10(v)) {
    const x = v.x !== void 0 ? v.x : v.x_inches;
    const z = v.z !== void 0 ? v.z : v.z_inches;
    if ((x === void 0 || fin6(x)) && (z === void 0 || fin6(z))) {
      return { x: x ?? DEFAULT_OFFSET_INCHES.x, z: z ?? DEFAULT_OFFSET_INCHES.z };
    }
  }
  throw new Error("foundation duplicate: offset_inches must be a finite number or {x, z} inches");
};
var translateRow = (row, kind, off) => {
  if (kind === "items" || kind === "poles") {
    if (fin6(row.x_inches)) row.x_inches += off.x;
    if (fin6(row.z_inches)) row.z_inches += off.z;
  } else if (kind === "walls") {
    const pts = row?.shape?.points;
    if (Array.isArray(pts)) {
      for (const p of pts) {
        if (fin6(p?.x)) p.x += off.x;
        if (fin6(p?.z)) p.z += off.z;
      }
    }
  }
};
function duplicateFoundationAssembly(project, {
  component_ids,
  include_dependents = true,
  offset_inches,
  createId
} = {}) {
  if (!isRecord10(project)) throw new Error("foundation duplicate: project must be a record");
  if (typeof createId !== "function") throw new Error("foundation duplicate: createId(kind) factory is required");
  const off = normalizeOffset(offset_inches);
  const selected = selectRows(project, component_ids, include_dependents !== false);
  const subset = subsetOf(project, selected);
  const { patch, idMap, clonedCounts } = appendClonedFoundationAssemblies(project, subset, {
    createId,
    transformClone: (row, kind) => translateRow(row, kind, off)
  });
  return {
    patch,
    summary: {
      operation: "duplicate",
      offset_inches: off,
      duplicated: clonedCounts,
      rows_added: Object.values(clonedCounts).reduce((a, n) => a + n, 0),
      id_map: Object.fromEntries(idMap)
    }
  };
}

// s:s://@/components/estimator/foundation/SignageCabinetsPanel
import { jsx as jsx25 } from "react/jsx-runtime";
var SignageCabinetsPanel_default = () => /* @__PURE__ */ jsx25("div", {});

// s:s://@/components/estimator/foundation/LandscapeDesigner
import { jsx as jsx26 } from "react/jsx-runtime";
var LandscapeDesigner_default = () => /* @__PURE__ */ jsx26("div", {});

// s:s://@/components/estimator/foundation/CustomerPricingPanel
import { jsx as jsx27 } from "react/jsx-runtime";
var CustomerPricingPanel_default = () => /* @__PURE__ */ jsx27("div", { "data-stub": "CustomerPricingPanel" });

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx28 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx28("div", { "data-stub": "CustomerPricingTab" });

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
var FIELDS = ["total_concrete_cost", "total_rebar_cost", "total_excavation_cost", "total_forming_materials_cost", "total_labor_cost", "total_wall_cost", "total_pole_cost", "total_pole_painting_cost", "total_equipment_cost", "total_wall_cap_cost", "total_signage_cabinet_cost", "total_landscape_cost"];
var foundationRecordSavedTotal = (r) => {
  if (!r || !FIELDS.some((k) => Number.isFinite(Number(r[k])))) return null;
  return FIELDS.reduce((s, k) => s + (Number.isFinite(Number(r[k])) ? Number(r[k]) : 0), 0);
};
var recordBuilderSave = async (a) => {
  globalThis.__spies.push(["recordBuilderSave", a]);
  return { module_key: "foundation", project_id: a.line.project_id, estimate_id: a.estimateId, updated_date_snapshot: a.sourceProject.updated_date };
};

// s:s://@/lib/loadAllEntityRows
async function loadAllEntityRows(a) {
  const rec = { label: a.label, entity: a.entity, query: a.query || null, sort: a.sort || null };
  globalThis.__catalogReads.push(rec);
  if (globalThis.__deferReads) {
    return new Promise((res, rj) => {
      globalThis.__deferReads.push({ rec, res, rj });
    });
  }
  if (a.entity === globalThis.__entInv) return globalThis.__invRows || [];
  if (a.entity === globalThis.__entLab) return globalThis.__labRows || [];
  if (a.entity === globalThis.__entSet) return globalThis.__setRows || [];
  return [];
}

// s:s://@/components/estimator/builder/sourceProjectPersistence
var sourcePatchMatches = (r, p) => !!r && !!p && Object.entries(p).every(([k, v]) => r[k] === v || v == null && r[k] == null);
var updateBuilderSourceProject = async (a) => {
  globalThis.__spies.push(["saveSource", a]);
  globalThis.__project = { ...globalThis.__project, ...a.data, id: a.sourceId, updated_date: globalThis.__savedVersion || "v2" };
  return globalThis.__project;
};

// s:s://@/components/estimator/foundation/foundationBuilderRecovery
async function loadFoundationBuilderRecovery() {
  return null;
}
function verifyFoundationRecoverySource() {
}

// src/components/estimator/foundation/foundationSaveSession.js
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
      const base2 = { sourceId, sourceVersion: null, savedEditRevision: editRevision, sourceSaved: false, builderSync: "not_required", error: null, warnings };
      const isCurrent = () => {
        try {
          const c = getCurrent() || {};
          return c.sourceId === sourceId && c.editRevision === editRevision && c.loaded === true;
        } catch {
          return false;
        }
      };
      if (!isCurrent()) return { ...base2, status: "superseded" };
      let savedProject;
      try {
        savedProject = await saveSource();
      } catch (error) {
        const cls = classify(error);
        return { ...base2, status: isCurrent() ? cls : "superseded", error, ...cls === "conflict" ? { conflictDetected: true } : {} };
      }
      if (!savedProject || savedProject.id !== sourceId || typeof savedProject.updated_date !== "string" || !savedProject.updated_date) {
        const error = new Error("Source save returned an unverified record.");
        const cls = classify(error);
        return { ...base2, status: isCurrent() ? cls : "superseded", error, ...cls === "conflict" ? { conflictDetected: true } : {} };
      }
      base2.sourceSaved = true;
      base2.sourceVersion = savedProject.updated_date;
      if (!isCurrent()) {
        return { ...base2, status: "superseded", builderSync: syncBuilder ? "pending" : "not_required" };
      }
      if (syncBuilder) {
        try {
          await syncBuilder(savedProject);
          base2.builderSync = "synced";
        } catch (error) {
          base2.builderSync = "pending";
          base2.error = error;
          warnings.push("builder_sync_failed");
          return { ...base2, status: isCurrent() ? "partial" : "superseded" };
        }
      }
      return { ...base2, status: isCurrent() ? "saved" : "superseded" };
    });
    const shared = attempt.finally(() => {
      if (inFlight === shared) inFlight = null;
    });
    inFlight = shared;
    return shared;
  };
  return { run, isSaving: () => inFlight !== null };
}

// src/components/estimator/foundation/foundationDraftRecovery.js
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
  // O-104/O-105 — design-basis + site/hazard capture blocks.
  "design_basis",
  "site_hazard",
  // Customer Pricing tab surface — markup %, manual price override, and the
  // applied-tier record (applied/tier_number). Persisted by payload(); restored
  // verbatim through the assembly normalizer's passthrough.
  "customer_markup_percent",
  "customer_price_override",
  "customer_pricing",
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
var ASSEMBLY_ARRAYS2 = ["items", "walls", "poles", "wall_caps", "signage_cabinets", "selected_equipment"];
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
  for (const f of ASSEMBLY_ARRAYS2) {
    if (f in data && !Array.isArray(data[f])) return `${f} must be an array.`;
    if (Array.isArray(data[f])) {
      for (const r of data[f]) if (!isPlain(r)) return `${f} must contain plain records.`;
    }
  }
  if (data.customer_pricing !== void 0 && !isPlain(data.customer_pricing))
    return "customer_pricing must be a record.";
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
  if (env.draftLost === true) return { ok: true, env, lost: true };
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
      const msg = String(e.message || e);
      const cls = /quota|exceeded|full/i.test(msg) ? "eviction" : "death";
      return { __err: `storage_${cls}: ${msg}` };
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
    if (v.lost) return { status: "invalid", revision: got.raw, savedAt: v.env.savedAt, baseUpdatedAt: v.env.baseUpdatedAt, message: `A browser draft (saved ${v.env.savedAt}) could not be kept \u2014 the browser's per-tab storage refused to store it. Nothing was restored; the saved project is unchanged.` };
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
      const got = getItem(s);
      if (got.err) return unavailable(got.err);
      const leaveLossMarker = (bytes) => {
        try {
          const cur = getItem(s);
          if (cur.err || cur.raw !== null && cur.raw !== void 0) return false;
          const marker = JSON.stringify({ version: 1, ownerId, sourceId, estimateId: estimateId ?? null, token, baseUpdatedAt, savedAt, draftLost: true, droppedBytes: bytes });
          if (marker.length > MAX_CHARS) return false;
          s.setItem(key, marker);
          return true;
        } catch {
          return false;
        }
      };
      if (serialized.length > MAX_CHARS) {
        const marked = leaveLossMarker(serialized.length);
        return { status: "invalid", message: got.raw !== null && got.raw !== void 0 ? "Draft exceeds 1,000,000 character limit; previous draft retained." : `Draft exceeds 1,000,000 character limit.${marked ? " A loss marker was stored so reopening this tab warns." : ""}` };
      }
      if ((got.raw ?? null) !== (expectedRevision ?? null))
        return { status: "conflict", revision: got.raw ?? void 0, message: "Draft changed since expected revision; existing draft retained." };
      try {
        s.setItem(key, serialized);
      } catch (e) {
        const marked = leaveLossMarker(serialized.length);
        const suffix = marked ? " A loss marker was stored so reopening this tab warns." : got.raw !== null && got.raw !== void 0 ? " The previously stored draft was retained." : "";
        return unavailable(`Draft write failed: ${e.message || e}${suffix}`);
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
function foundationDraftRebaseProject({ draft, sourceId } = {}) {
  if (!isPlain(draft) || !validId(sourceId)) return null;
  return { id: sourceId, ...cloneChecked(draft) };
}

// s:s://@/components/auth/EmailGate
var useAuth = () => ({ currentUser: { id: "synthetic-staff" } });

// src/components/estimator/foundation/foundationSyncRecovery.js
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
async function resolveFoundationSyncReceiptForSave({ project, estimateId, getEstimate }) {
  const prior = project?.builder_sync_attempt;
  if (prior === void 0 || prior === null) return { ok: true, clearStaleReceipt: false };
  if (!attemptShapeOk(prior) || prior.source_project_id !== project?.id) {
    return { ok: false, error: "An unrecognised Builder sync receipt blocks saving. Reload and retry." };
  }
  if (!!estimateId && prior.estimate_id === estimateId) {
    return { ok: true, clearStaleReceipt: false };
  }
  if (typeof getEstimate !== "function") {
    return { ok: false, error: "This project's Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };
  }
  const named = await Promise.resolve().then(() => getEstimate(prior.estimate_id)).then((row) => row || null).catch((error) => Number(error?.status) === 404 ? null : void 0);
  if (named === void 0) {
    return { ok: false, error: "The estimate named by the saved Builder sync receipt could not be verified. Reload and retry." };
  }
  if (named) {
    return { ok: false, error: "This project's Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };
  }
  return { ok: true, clearStaleReceipt: true };
}
var pendingLineMarker = (line) => {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && !Array.isArray(pending) && String(pending.key || "").trim() ? pending : null;
};
function classifyFoundationSyncRetry({ project, estimateId, estimate } = {}) {
  const state = foundationSyncRecoveryState({ project, estimateId, estimate });
  const line = state.line || null;
  const pending = pendingLineMarker(line);
  const attempt = state.attempt ?? null;
  const base2 = { attempt, line, pendingKey: pending ? String(pending.key) : null, stateStatus: state.status };
  if (state.status === "unsupported") {
    return { ...base2, mode: "blocked_unsupported", retryable: false, reason: state.message || "An unrecognised Builder sync receipt blocks retrying; review it first." };
  }
  if (state.status === "mismatch") {
    return { ...base2, mode: "blocked_mismatch", retryable: false, reason: state.message || "This project's sync receipt belongs to a different estimate context." };
  }
  if (!estimateId) {
    return { ...base2, mode: "blocked_no_estimate", retryable: false, reason: "This project is not linked to an estimate; there is no Builder sync to retry." };
  }
  if (pending) {
    return { ...base2, mode: "resume_pending", retryable: true, reason: "A saved Builder mutation is still in progress; retry resumes its recorded remainder." };
  }
  if (state.status === "pending") {
    return { ...base2, mode: "resync_unacknowledged", retryable: true, reason: state.message || "A saved Builder sync attempt is still unacknowledged." };
  }
  return { ...base2, mode: "none_needed", retryable: false, reason: "" };
}

// src/components/estimator/foundation/foundationTemplateModel.js
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
  "notes",
  "hyperlink",
  "beautify_data_url",
  "customer_markup_percent",
  "customer_price_override",
  "customer_pricing",
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
var ASSEMBLY_ARRAYS3 = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var isRecord11 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var deepClone3 = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
var checkTemplateRecord = (data, noun) => {
  if (!isRecord11(data)) throw new Error(`Foundation template ${noun} must be a record.`);
  if (data.assembly_schema_version !== void 0 && data.assembly_schema_version !== 1) {
    throw new Error("Template uses an unsupported assembly version and was not applied.");
  }
};
var sanitizeTemplateCustomerPricing = (v) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (!isRecord11(v)) throw new Error("Foundation template customer_pricing must be a record.");
  if (v.applied !== true) return deepClone3(v);
  return { applied: true, tier_number: v.tier_number };
};
var stampTemplateAppliedAiData = (v, { appliedAt } = {}) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (!isRecord11(v)) throw new Error("Foundation template ai_engineering_data must be a record.");
  const out = deepClone3(v);
  if (out.origin_source_key === void 0) {
    out.origin_source_key = typeof out.source_key === "string" && out.source_key ? out.source_key : null;
  }
  out.template_applied = true;
  out.template_applied_at = typeof appliedAt === "string" && Number.isFinite(Date.parse(appliedAt)) ? appliedAt : (/* @__PURE__ */ new Date()).toISOString();
  return out;
};
var stampTemplateNotesNotice = (v) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (typeof v !== "string") throw new Error("Foundation template notes must be a string.");
  return ensurePreliminaryNotice(v);
};
function prepareFoundationTemplatePatch(data, { createId, appliedAt } = {}) {
  checkTemplateRecord(data, "data");
  if (typeof createId !== "function") throw new Error("Foundation template apply requires a createId factory.");
  const provided = {};
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (data[k] !== void 0) provided[k] = deepClone3(data[k]);
  }
  if (provided.customer_pricing !== void 0) {
    provided.customer_pricing = sanitizeTemplateCustomerPricing(provided.customer_pricing);
  }
  if (provided.ai_engineering_data !== void 0) {
    provided.ai_engineering_data = stampTemplateAppliedAiData(provided.ai_engineering_data, { appliedAt });
  }
  if (provided.notes !== void 0) {
    provided.notes = stampTemplateNotesNotice(provided.notes);
  }
  const arrays = {};
  for (const k of ASSEMBLY_ARRAYS3) if (provided[k] !== void 0) arrays[k] = provided[k];
  const cloned = Object.keys(arrays).length ? cloneFoundationComponents(arrays, { createId }).components : {};
  return { ...provided, ...cloned };
}

// s:s://@/components/estimator/foundation/convertToBrickStone
var convertFoundationToBrickStone = async () => {
  globalThis.__spies.push(["converter"]);
  return { id: "d1" };
};

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var createEstimateReadOnlyShareLink = async () => "/share";

// s:s://@/components/staff/staffEntities
var staffEntities = { FoundationProject: { get: async (id) => {
  globalThis.__spies.push(["projectGet", id]);
  return globalThis.__getProject ? globalThis.__getProject(id) : globalThis.__project;
}, update: async () => ({}), updateMany: async () => ({ updated: 0 }) }, FoundationInventory: globalThis.__entInv || (globalThis.__entInv = { __ent: "inv" }), LaborServiceInventory: globalThis.__entLab || (globalThis.__entLab = { __ent: "lab" }), Settings: globalThis.__entSet || (globalThis.__entSet = { __ent: "set" }), AllInOneEstimate: { get: async (id) => {
  globalThis.__spies.push(["estimateGet", id]);
  return globalThis.__estimates?.[id] ?? globalThis.__estimate;
} } };

// src/pages/FoundationEstimator.jsx
import { Fragment as Fragment3, jsx as jsx29, jsxs as jsxs4 } from "react/jsx-runtime";
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
  const [project, setProject] = useState5(null);
  const [inventory, setInventory] = useState5([]);
  const [settings, setSettings] = useState5({});
  const [loading, setLoading] = useState5(true);
  const [loadError, setLoadError] = useState5("");
  const [saving, setSaving] = useState5(false);
  const [dirty, setDirty] = useState5(false);
  const [autoSave, setAutoSave] = useState5(false);
  const [mainTab, setMainTab] = useState5("foundations");
  const [history, setHistory] = useState5({ past: [], future: [] });
  const [templateMode, setTemplateMode] = useState5(null);
  const [showHelp, setShowHelp] = useState5(false);
  const saveRef = useRef2(null);
  const saveSessionRef = useRef2(null);
  if (!saveSessionRef.current) saveSessionRef.current = createFoundationSaveSession();
  const editRevisionRef = useRef2(0);
  const acknowledgedVersionRef = useRef2(null);
  const currentEditorRef = useRef2({ sourceId: null, editRevision: 0, loaded: false });
  const contextKeyRef = useRef2(null);
  const contextGenerationRef = useRef2(0);
  const mountedRef = useRef2(true);
  const saveAttemptRef = useRef2(null);
  const exitGenerationRef = useRef2(-1);
  const loadedOwnerRef = useRef2(null);
  const sceneHistoryRef = useRef2(null);
  if (!sceneHistoryRef.current) sceneHistoryRef.current = createSceneHistory();
  const sceneHistory = sceneHistoryRef.current;
  useSyncExternalStore(sceneHistory.subscribe, () => sceneHistory.stateVersion);
  const sceneSelectionRef = useRef2(null);
  if (!sceneSelectionRef.current) sceneSelectionRef.current = createSceneSelection();
  const sceneSelection = sceneSelectionRef.current;
  useSyncExternalStore(sceneSelection.subscribe, () => sceneSelection.stateVersion);
  const highlightComponentIds = sceneSelection.getState().ids.map((id2) => parseSceneNodeId(id2)?.componentId).filter(Boolean);
  const [saveError, setSaveError] = useState5("");
  const [reloadRevision, setReloadRevision] = useState5(0);
  const [linkedEstimate, setLinkedEstimate] = useState5(null);
  const [recoveryRequired, setRecoveryRequired] = useState5(false);
  const contextKey = JSON.stringify([ownerId, id, estimateId, project?.id, reloadRevision]);
  if (contextKeyRef.current !== contextKey) {
    contextKeyRef.current = contextKey;
    editRevisionRef.current += 1;
    contextGenerationRef.current += 1;
    sceneHistory.clear(sceneLayoutAnchor({ items: project?.items || [], poles: project?.poles || [], walls: project?.walls || [] }));
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
  const copyAttemptRef = useRef2({ signature: "", key: "" });
  const copyFlightRef = useRef2(null);
  const sourceRefreshRef = useRef2(null);
  const sourceWriteEpochRef = useRef2(/* @__PURE__ */ new Map());
  const projectRef = useRef2(null);
  const swapAttemptRef = useRef2({ signature: "", key: "" });
  projectRef.current = contextLoaded ? project : null;
  const draftStore = useMemo(
    () => createFoundationDraftStore({ getStorage: () => window.sessionStorage, ownerId, sourceId: id, estimateId: estimateId || null }),
    [ownerId, id, estimateId]
  );
  const draftSessionRef = useRef2({ store: null, revision: null, pending: false });
  if (draftSessionRef.current.store !== draftStore) draftSessionRef.current = { store: draftStore, revision: null, pending: false };
  const [draftOffer, setDraftOffer] = useState5(null);
  const draftVisible = draftOffer?.store === draftStore ? draftOffer : null;
  const syncConflict = useFoundationSyncConflict();
  const lastSyncCaptureRef = useRef2(null);
  const syncRetry = useFoundationBuilderSyncRetry(() => ({
    sourceId: id,
    estimateId,
    expectedSourceVersion: acknowledgedVersionRef.current?.updated_date,
    savedProject: acknowledgedVersionRef.current?.sourceSnapshot,
    builderCalculation: lastSyncCaptureRef.current?.builderCalculation ?? null,
    liveTotal: lastSyncCaptureRef.current?.liveTotal,
    expectedPendingKey: classifyFoundationSyncRetry({ project, estimateId, estimate: linkedEstimate }).pendingKey ?? void 0
  }));
  useEffect(() => {
    copyAttemptRef.current = { signature: "", key: "" };
    swapAttemptRef.current = { signature: "", key: "" };
  }, [id]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
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
      setInventory(normalizeFoundationInventoryRows([...inv || [], ...(concreteServices || []).map(normalizeConcreteSupplier)]));
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
  const diffRows2 = useMemo(
    () => savedSourceProject && project ? diffFoundationProjects(savedSourceProject, project) : [],
    [savedSourceProject, project]
  );
  const diffCounts = useMemo(() => summarizeFoundationDiff(diffRows2), [diffRows2]);
  const calc = useMemo(
    () => project ? calcProject(project, inventory, settings, { savedProject: savedSourceProject }) : null,
    [project, inventory, settings, savedSourceProject]
  );
  const catalogBlocked = Boolean(calc?.catalogIssues?.length);
  const inputIssues = calc?.inputIssues || [];
  const inputBlocked = inputIssues.length > 0;
  const pricingBlocked = catalogBlocked || inputBlocked;
  const constructionWarnings = calc?.constructionWarnings || [];
  const [catalogReloading, setCatalogReloading] = useState5(false);
  const catalogReloadRef = useRef2(null);
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
      setInventory(normalizeFoundationInventoryRows([...inv || [], ...(concreteServices || []).map(normalizeConcreteSupplier)]));
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
  useEffect(() => {
    catalogReloadRef.current = null;
    setCatalogReloading(false);
  }, [id, estimateId, reloadRevision, ownerId]);
  const assemblyIssues = useMemo(() => project ? foundationAssemblyIssues(project) : [], [project]);
  const catalog = useMemo(
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
  useEffect(() => {
    if (!autoSave || !dirty || recoveryRequired || pricingBlocked || catalogReloading || catalogReloadRef.current || draftSessionRef.current.pending) return;
    const t = setTimeout(() => saveRef.current?.(), 2e3);
    return () => clearTimeout(t);
  }, [autoSave, dirty, project, recoveryRequired, pricingBlocked, catalogReloading]);
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) saveRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);
  useEffect(() => {
    if (!saving && !dirty && !recoveryRequired && !draftSessionRef.current.pending) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, dirty, recoveryRequired, draftOffer]);
  const navGuardArmedRef = useRef2(false);
  useEffect(() => {
    const needsGuard = () => saving || dirty || recoveryRequired || draftSessionRef.current.pending;
    const confirmLeave = () => window.confirm(
      "You have unsaved changes or an unacknowledged Builder sync. Leave without saving?" + (draftSessionRef.current.revision ? " Unsent edits stay backed up in this browser tab only." : "")
    );
    const onClickCapture = (e) => {
      if (!needsGuard() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target?.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    if (!embedded && !navGuardArmedRef.current && needsGuard()) {
      try {
        window.history.pushState({ ccsFoundationLeaveGuard: true }, "", window.location.href);
        navGuardArmedRef.current = true;
      } catch {
      }
    }
    const onPop = (e) => {
      if (!navGuardArmedRef.current) return;
      if (e.state?.ccsFoundationLeaveGuard === true) return;
      if (!needsGuard()) {
        navGuardArmedRef.current = false;
        window.history.back();
        return;
      }
      if (confirmLeave()) {
        navGuardArmedRef.current = false;
        window.history.back();
      } else {
        try {
          window.history.forward();
        } catch {
        }
      }
    };
    document.addEventListener("click", onClickCapture, true);
    if (navGuardArmedRef.current) window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [embedded, saving, dirty, recoveryRequired, draftOffer]);
  const reinforcementEditor = useFoundationReinforcementEditor({
    getCurrent: () => {
      const live = currentEditorRef.current;
      const ack = acknowledgedVersionRef.current;
      return {
        project: projectRef.current,
        savedProject: ack?.sourceSnapshot ?? null,
        inventory,
        settings,
        context: {
          ...live,
          loaded: mountedRef.current && live.loaded,
          ownerId,
          sourceUpdatedAt: ack?.updated_date ?? null,
          estimateUpdatedAt: linkedEstimate?.updated_date ?? null
        },
        blocked: saving || !!saveAttemptRef.current || !!copyFlightRef.current || !!catalogReloadRef.current || catalogReloading || draftSessionRef.current.pending || recoveryRequired || !!sourceRefreshRef.current || !ack?.sourceSnapshot || ack?.ownerId !== ownerId || ack?.sourceId !== live.sourceId
      };
    },
    commit: (updater) => commit(updater)
  });
  if (loading) return /* @__PURE__ */ jsx29("div", { className: "p-10 text-center text-gray-400", children: "Loading section\xE2\u20AC\xA6" });
  if (loadError) return /* @__PURE__ */ jsxs4("div", { className: "p-10 text-center text-red-700 bg-red-50 border border-red-200 rounded", children: [
    "Foundation Builder unavailable. Required project data, foundation inventory, concrete services, or Settings could not be verified. ",
    loadError
  ] });
  if (!project) return /* @__PURE__ */ jsx29("div", { className: "p-10 text-center text-gray-500", children: "Foundation section not found." });
  const persistBrowserDraft = (next) => {
    const session = draftSessionRef.current;
    if (!session.store || session.store !== draftStore || !mountedRef.current) return;
    const ack = acknowledgedVersionRef.current;
    const base2 = ack?.sourceId === id && ack?.ownerId === ownerId ? ack.updated_date : null;
    if (!base2) {
      setDraftOffer({ store: draftStore, warning: "Latest edits could not be backed up; no saved source to anchor the browser draft." });
      return;
    }
    const result = session.store.write({
      project: next,
      baseUpdatedAt: base2,
      token: newCreationRequestKey("foundation_draft"),
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      expectedRevision: session.revision
    });
    if (result.status === "stored") {
      session.revision = result.revision;
      session.pending = false;
      setDraftOffer({ store: draftStore, backedUp: true, message: "Design and customer-pricing edits backed up in this browser tab only \xE2\u20AC\u201D closing the tab loses them; save to keep all changes." });
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
    setHistory((h2) => ({ past: [...h2.past.slice(-40), prev], future: [] }));
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
  const patchScene = (patches) => {
    const list2 = (Array.isArray(patches) ? patches : []).filter(
      (p) => p && typeof p.collection === "string" && Number.isInteger(p.index) && p.index >= 0 && p.patch && typeof p.patch === "object"
    );
    const base2 = projectRef.current ?? project;
    const applicable = list2.filter((p) => Array.isArray(base2?.[p.collection]) && base2[p.collection][p.index]);
    if (!applicable.length) return false;
    return commit((prev) => {
      const changes = {};
      for (const p of applicable) {
        const rows = prev?.[p.collection];
        if (!Array.isArray(rows) || !rows[p.index]) continue;
        const nextRows = changes[p.collection] || (changes[p.collection] = rows.slice());
        nextRows[p.index] = { ...nextRows[p.index], ...p.patch };
      }
      return changes;
    }) !== false;
  };
  const prefNumber = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : void 0;
  };
  const layoutPrefs = {
    objectSnap: `${settings?.foundation_layout_object_snap ?? "true"}`.trim().toLowerCase() !== "false",
    snapToleranceInches: prefNumber(settings?.foundation_layout_snap_tolerance_inches),
    gridSnapInches: prefNumber(settings?.foundation_layout_grid_snap_inches)
  };
  const sceneAnchorOf = (p) => sceneLayoutAnchor({ items: p?.items || [], poles: p?.poles || [], walls: p?.walls || [] });
  const applySceneRev = (rev) => {
    if (rev?.kind === "scene-multi" || Array.isArray(rev?.patch?.multi)) {
      const multi = Array.isArray(rev?.patch?.multi) ? rev.patch.multi : [];
      return patchScene(multi.map((m) => ({ collection: m?.collection, index: m?.index, patch: m?.fields })));
    }
    return patchItem(rev.target.index, rev.patch) !== false;
  };
  const sceneUndo = () => sceneHistory.undo(sceneAnchorOf(projectRef.current), applySceneRev);
  const sceneRedo = () => sceneHistory.redo(sceneAnchorOf(projectRef.current), applySceneRev);
  const removeItem = (index) => {
    const label = project.items?.[index]?.description || `item ${index + 1}`;
    if (!window.confirm(`Delete "${label}"? Dependent placements are retained for review.`)) return;
    commit((prev) => ({ items: prev.items.filter((_, i) => i !== index) }));
  };
  const deleteSceneSelection = (entries) => {
    const FIELD_OF_COLLECTION = {
      items: "items",
      walls: "walls",
      poles: "poles",
      wall_caps: "wall_caps",
      signage_cabinets: "signage_cabinets"
    };
    const rows = (Array.isArray(entries) ? entries : []).filter(
      (e) => e && FIELD_OF_COLLECTION[e.collection] && e.kind !== "wall-segment" && e.kind !== "pole-sign" && Number.isInteger(e.index) && e.index >= 0
    );
    if (!rows.length) return;
    const drop = {};
    for (const e of rows) {
      const field = FIELD_OF_COLLECTION[e.collection];
      (drop[field] = drop[field] || /* @__PURE__ */ new Set()).add(e.index);
    }
    const label = rows.length === 1 ? `"${rows[0].label || `${rows[0].collection} row`}"` : `${rows.length} selected objects`;
    if (!window.confirm(`Delete ${label}? Dependent placements are retained for review.`)) return;
    commit((prev) => {
      const changes = {};
      for (const [field, idx] of Object.entries(drop)) {
        changes[field] = (Array.isArray(prev[field]) ? prev[field] : []).filter((_, i) => !idx.has(i));
      }
      return changes;
    });
  };
  const duplicateItem = (index) => commit((prev) => {
    const items = [...prev.items];
    items.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(items[index])), component_id: newCreationRequestKey("foundation_item") });
    return { items };
  });
  const duplicateSceneSelection = (plan) => {
    try {
      const component_ids = (Array.isArray(plan?.sources) ? plan.sources : []).map((s) => s?.componentId).filter((v) => typeof v === "string" && v.length > 0);
      if (!component_ids.length) return;
      commit((prev) => duplicateFoundationAssembly(prev, {
        component_ids,
        include_dependents: true,
        offset_inches: plan?.offset_inches,
        createId: (kind) => newCreationRequestKey(`foundation_${kind}`)
      }).patch);
    } catch (e) {
      setSaveError(e?.message || "Selected objects could not be duplicated.");
    }
  };
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
  const conflictDraftFields = (draft) => {
    const out = {};
    const src2 = draft && typeof draft === "object" ? draft : {};
    for (const field of FOUNDATION_DRAFT_FIELDS) if (Object.hasOwn(src2, field)) out[field] = src2[field];
    return out;
  };
  const adoptFreshSavedForConflict = async () => {
    let saved = null;
    try {
      saved = await staffEntities.FoundationProject.get(id);
    } catch {
      saved = null;
    }
    if (!saved || saved.id !== id || typeof saved.updated_date !== "string" || !saved.updated_date) return null;
    let normalizedSaved;
    try {
      normalizedSaved = normalizeFoundationAssembly({
        ...saved,
        excavation_method: saved.excavation_method || "hand_dig",
        project_concrete_type: saved.project_concrete_type || "4000_ae",
        project_concrete_admixtures: saved.project_concrete_admixtures || [],
        items: saved.items || [],
        walls: saved.walls || [],
        poles: saved.poles || [],
        wall_caps: saved.wall_caps || [],
        signage_cabinets: saved.signage_cabinets || [],
        landscape: saved.landscape || { cell_size_inches: 12, cells: {} },
        selected_equipment: saved.selected_equipment || []
      }, { createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }).project;
    } catch {
      return null;
    }
    return { saved, normalizedSaved };
  };
  const handleConflictKeepDraft = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c?.draft || session.store !== draftStore) return false;
    if (c.kind === "draft_vs_saved") {
      const latest = draftStore.read();
      if (latest.status !== "found") return false;
      if (draftVisible?.revision && latest.revision !== draftVisible.revision) {
        session.revision = latest.revision;
        setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
        return false;
      }
      session.revision = latest.revision;
      setAutoSave(false);
      return commit(() => latest.draft, { restoreDraft: true });
    }
    const adopted = await adoptFreshSavedForConflict();
    if (!adopted) return false;
    const stored = draftStore.read();
    if (stored.status === "found" || stored.status === "invalid") draftStore.clear(stored.revision);
    session.revision = null;
    session.pending = false;
    acknowledgedVersionRef.current = { sourceId: id, updated_date: adopted.saved.updated_date, ownerId, sourceSnapshot: adopted.normalizedSaved };
    setAutoSave(false);
    return commit(() => ({ ...adopted.normalizedSaved, ...conflictDraftFields(c.draft) }), { restoreDraft: true });
  });
  const handleConflictKeepSaved = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c || session.store !== draftStore) return false;
    if (c.kind === "draft_vs_saved") {
      const cleared = draftStore.clear(draftVisible?.revision ?? session.revision ?? null);
      if (cleared.status !== "removed") {
        const latest = draftStore.read();
        if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
        else if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
        return false;
      }
      session.revision = null;
      session.pending = false;
      setDraftOffer(null);
      if (dirty) persistBrowserDraft(projectRef.current ?? project);
      return true;
    }
    const stored = draftStore.read();
    if (stored.status === "found" || stored.status === "invalid") draftStore.clear(stored.revision);
    session.revision = null;
    session.pending = false;
    setDraftOffer(null);
    setReloadRevision((r) => r + 1);
    return true;
  });
  const handleConflictKeepBoth = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c?.draft || session.store !== draftStore) return false;
    const baseRev = c.summary?.savedUpdatedAt ?? acknowledgedVersionRef.current?.updated_date ?? null;
    const rebase = foundationDraftRebaseProject({ draft: c.draft, sourceId: id });
    if (!rebase || !baseRev) return false;
    const stored = draftStore.read();
    if (stored.status === "unavailable") return false;
    const expectedRevision = stored.status === "found" || stored.status === "invalid" ? stored.revision ?? null : null;
    const w = draftStore.write({ project: rebase, baseUpdatedAt: baseRev, token: newCreationRequestKey("foundation_draft"), savedAt: (/* @__PURE__ */ new Date()).toISOString(), expectedRevision });
    if (w.status !== "stored") {
      const after = draftStore.read();
      if (after.status === "found") {
        session.revision = after.revision;
        setDraftOffer({ store: draftStore, revision: after.revision, draft: after.draft, savedAt: after.savedAt, baseUpdatedAt: after.baseUpdatedAt, conflict: true });
      }
      return false;
    }
    session.revision = w.revision;
    if (c.kind === "save_conflict") {
      setReloadRevision((r) => r + 1);
    } else {
      session.pending = true;
      setDraftOffer({ store: draftStore, revision: w.revision, draft: w.draft, savedAt: (/* @__PURE__ */ new Date()).toISOString(), baseUpdatedAt: baseRev });
    }
    return true;
  });
  const cabinetCost = calc.totals.total_signage_cabinet_cost;
  const landscapeCost = calc.totals.total_landscape_cost;
  const sectionTotal = calc.totals.grand_total === null || cabinetCost === null || landscapeCost === null ? null : calc.totals.grand_total + cabinetCost + landscapeCost;
  const savedSectionTotal = foundationRecordSavedTotal(savedSourceProject);
  const undo = () => {
    const live = currentEditorRef.current;
    if (!history.past.length || !live.loaded || live.generation !== saveContext.generation || draftSessionRef.current.pending) return;
    bumpEdit();
    const prevState = history.past[history.past.length - 1];
    setHistory((h2) => ({ past: h2.past.slice(0, -1), future: [project, ...h2.future] }));
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
    setHistory((h2) => ({ past: [...h2.past, project], future: h2.future.slice(1) }));
    projectRef.current = nextState;
    setProject(nextState);
    setDirty(true);
    persistBrowserDraft(nextState);
  };
  const handleUndo = () => {
    if (sceneUndo()?.status === "applied") return;
    undo();
  };
  const handleRedo = () => {
    if (sceneRedo()?.status === "applied") return;
    redo();
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
    // O-099 (CMP-H08) -- revision history: each save appends the prior
    // `updated_date` (the revision being superseded) to a capped 12-entry
    // list, so a revision-pair compare can diff any two stored revisions.
    revision_history: [
      ...(Array.isArray(project.revision_history) ? project.revision_history : []).slice(-11),
      ...project.updated_date ? [{
        updated_date: project.updated_date,
        at: Date.now(),
        // Lane E -- revision_label/revision_approved_by: the superseded
        // revision's authored label + approver ride the row (never a
        // fabricated approver; blank = "not recorded").
        revision_label: typeof project.revision_label === "string" && project.revision_label ? project.revision_label : null,
        revision_approved_by: typeof project.revision_approved_by === "string" && project.revision_approved_by ? project.revision_approved_by : null,
        // O-099 (CMP-H08) -- lightweight snapshot: the superseded revision's
        // counts + dims ride the row so a pair-compare can diff any two
        // stored revisions without a full record copy (bounded — counts +
        // dims, not the whole scene).
        snapshot: {
          item_count: Array.isArray(project.items) ? project.items.length : 0,
          wall_count: Array.isArray(project.walls) ? project.walls.length : 0,
          pole_count: Array.isArray(project.poles) ? project.poles.length : 0,
          cap_count: Array.isArray(project.wall_caps) ? project.wall_caps.length : 0,
          cabinet_count: Array.isArray(project.signage_cabinets) ? project.signage_cabinets.length : 0,
          // O-099 (CMP-H08) -- cost-delta numbers: the superseded revision's
          // total cost rides the snapshot so a pair-compare surfaces the
          // cost delta per change (never an invented total; held = null).
          total_cost: Number.isFinite(calc?.totals?.total) ? calc.totals.total : null
        }
      }] : []
    ],
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
    design_basis: project.design_basis,
    site_hazard: project.site_hazard,
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
    lastSyncCaptureRef.current = {
      builderCalculation: { totals: captured.totals, delivery: captured.delivery, cabinet_cost: captured.cabinetCost, landscape_cost: captured.landscapeCost, section_total: captured.sectionTotal },
      liveTotal: captured.sectionTotal
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
          const receipt = await resolveFoundationSyncReceiptForSave({
            project: captured.project,
            estimateId: captured.estimateId,
            getEstimate: (id2) => staffEntities.AllInOneEstimate.get(id2)
          });
          if (!receipt.ok) throw new Error(receipt.error);
          captured.clearStaleSyncReceipt = receipt.clearStaleReceipt === true;
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
          data: { ...captured.basePayload, customer_pricing: customerPricing, ...captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : captured.clearStaleSyncReceipt ? { builder_sync_attempt: null } : {} },
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
        if (outcome.status === "conflict" && outcome.conflictDetected) {
          const latestDraft = draftSessionRef.current.store === draftStore ? draftStore.read() : { status: "unavailable" };
          const draftBackedUp = latestDraft.status === "found";
          syncConflict.openSaveConflict({
            draft: draftBackedUp ? latestDraft.draft : projectRef.current ?? project,
            draftSavedAt: draftBackedUp ? latestDraft.savedAt ?? null : null,
            baseUpdatedAt: draftBackedUp ? latestDraft.baseUpdatedAt ?? null : acknowledgedVersionRef.current?.updated_date ?? null,
            getSavedProject: () => staffEntities.FoundationProject.get(id),
            hasUnbackedEdits: !draftBackedUp
          });
        }
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
        customer_id: project.customer_id,
        // Same-job metadata payload() does not own â€” a copy keeps the
        // document link, the saved estimate-number lineage (mirroring
        // convertFoundationToBrickStone), the persisted beautify brief
        // image, and any externally-set pricing-engine context.
        estimate_number: project.estimate_number,
        hyperlink: project.hyperlink,
        beautify_data_url: project.beautify_data_url,
        pricing_engine: project.pricing_engine
      };
      const signature = JSON.stringify({
        ...baseData,
        // revision_history[*].at is minted per payload() call (Date.now()) and
        // would rotate the signature on every retry — defeating the held key.
        revision_history: (baseData.revision_history || []).map(({ at, ...entry }) => entry)
      });
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
  return /* @__PURE__ */ jsxs4("div", { className: "clay-scope min-h-full bg-gray-50", children: [
    /* @__PURE__ */ jsxs4("div", { className: "max-w-[1500px] mx-auto p-4", children: [
      /* @__PURE__ */ jsx29(FoundationSectionBanner_default, { sectionName: project.project_name }),
      saveError && /* @__PURE__ */ jsx29("div", { role: "alert", className: "mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800", children: saveError }),
      catalogBlocked && /* @__PURE__ */ jsxs4("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsx29("div", { className: "font-semibold", children: "Pricing unavailable: selected materials or rental items need attention. Unavailable items show saved amounts only; other amounts may be recalculated. Save and estimate handoff are paused." }),
        /* @__PURE__ */ jsx29("ul", { className: "mt-1 list-disc pl-5", children: calc.catalogIssues.map((i, idx) => /* @__PURE__ */ jsx29("li", { children: i.message }, idx)) }),
        /* @__PURE__ */ jsx29(
          "button",
          {
            type: "button",
            onClick: handleCatalogReload,
            disabled: catalogReloading || loading || saving,
            className: "mt-2 rounded-sm border border-amber-400 bg-white px-2 py-1 text-[12px] font-semibold text-amber-800 disabled:opacity-50",
            children: catalogReloading ? "Reloading catalogs\xE2\u20AC\xA6" : "Reload catalogs"
          }
        )
      ] }),
      inputBlocked && /* @__PURE__ */ jsxs4("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsx29("div", { className: "font-semibold", children: "Design input required: fix highlighted design inputs below. Save and estimate handoff are paused." }),
        /* @__PURE__ */ jsx29("ul", { className: "mt-1 list-disc pl-5", children: inputIssues.map((i, idx) => /* @__PURE__ */ jsx29("li", { children: i.message }, idx)) })
      ] }),
      (() => {
        const marker = sourceRefreshRef.current;
        const live = currentEditorRef.current;
        if (!marker || !live.loaded || live.sourceId !== marker.sourceId || live.generation !== marker.generation) return null;
        return /* @__PURE__ */ jsxs4("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800", children: [
          "An earlier save finished after this view changed. Reload the saved project before saving again.",
          /* @__PURE__ */ jsx29("button", { type: "button", onClick: handleReloadSaved, className: "ml-2 font-semibold underline", children: "Reload saved project" })
        ] });
      })(),
      (() => {
        const recovery = foundationSyncRecoveryState({ project, estimateId, estimate: linkedEstimate });
        if (!["pending", "unsupported", "mismatch"].includes(recovery.status) && !recoveryRequired) return null;
        const detail = recovery.status === "mismatch" && recovery.attempt?.estimate_id ? "Open the linked estimate to review." : recovery.message || "A saved Builder sync attempt is still unacknowledged.";
        return /* @__PURE__ */ jsxs4(Fragment3, { children: [
          /* @__PURE__ */ jsxs4("div", { role: "status", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 flex items-center gap-3", children: [
            /* @__PURE__ */ jsxs4("span", { children: [
              detail,
              " Current displayed totals will be synchronized; accepted quote prices remain under the platform workflow. ",
              dirty ? "You also have unsaved local edits." : ""
            ] }),
            recovery.status === "mismatch" && recovery.attempt?.estimate_id && /* @__PURE__ */ jsx29("a", { className: "underline", href: `/EstimateDetail?id=${encodeURIComponent(recovery.attempt.estimate_id)}`, children: "Open estimate" }),
            /* @__PURE__ */ jsx29("button", { type: "button", disabled: saving || recovery.status === "unsupported" || recovery.status === "mismatch", className: "px-2 py-1 rounded bg-amber-600 text-white disabled:opacity-50", onClick: () => saveRef.current?.(), children: "Review and retry Save" })
          ] }),
          /* @__PURE__ */ jsx29("div", { className: "mb-3", children: /* @__PURE__ */ jsx29(
            FoundationSyncRetryAction,
            {
              retryState: classifyFoundationSyncRetry({ project, estimateId, estimate: linkedEstimate }),
              retrying: syncRetry.retrying,
              lastOutcome: syncRetry.lastOutcome,
              estimateHref: estimateId ? `/EstimateDetail?id=${estimateId}` : null,
              onRetry: async () => {
                const o = await syncRetry.retry();
                if (o?.status === "synced" || o?.status === "already_synced") {
                  setRecoveryRequired(false);
                  if (o.line) setLinkedEstimate((prev) => prev && prev.id === estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === id ? o.line : it) } : prev);
                }
              }
            }
          ) })
        ] });
      })(),
      assemblyIssues.length > 0 && /* @__PURE__ */ jsxs4("div", { role: "status", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900", children: [
        /* @__PURE__ */ jsx29("span", { className: "font-semibold", children: "Unresolved placements" }),
        /* @__PURE__ */ jsx29("ul", { className: "list-disc pl-5 mt-1 space-y-0.5", children: assemblyIssues.map((issue, i) => /* @__PURE__ */ jsx29("li", { children: issue.message }, `${issue.code}-${issue.kind}-${issue.componentId || ""}-${issue.parentId || ""}-${i}`)) })
      ] }),
      constructionWarnings.length > 0 && /* @__PURE__ */ jsxs4("div", { role: "status", className: "mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] text-blue-900", children: [
        /* @__PURE__ */ jsx29("span", { className: "font-semibold", children: "Construction checks \xE2\u20AC\u201D verify before build" }),
        /* @__PURE__ */ jsx29("ul", { className: "list-disc pl-5 mt-1 space-y-0.5", children: constructionWarnings.map((warning, i) => /* @__PURE__ */ jsx29("li", { children: warning.message }, `${warning.code}-${warning.kind}-${warning.index ?? ""}-${i}`)) })
      ] }),
      draftVisible?.backedUp && !draftVisible?.warning && /* @__PURE__ */ jsx29("div", { role: "status", className: "mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[13px] text-blue-900", children: draftVisible.message }),
      draftVisible?.warning && /* @__PURE__ */ jsx29("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: draftVisible.warning }),
      (draftVisible?.draft || draftVisible?.message) && draftSessionRef.current.pending && /* @__PURE__ */ jsx29("div", { role: "alert", className: "mb-3 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-[13px] text-indigo-900", children: draftVisible.draft ? /* @__PURE__ */ jsxs4(Fragment3, { children: [
        /* @__PURE__ */ jsxs4("div", { className: "font-semibold", children: [
          "Unsent browser-tab draft found. Nothing restored or sent. ",
          draftVisible.savedAt ? `Saved ${draftVisible.savedAt}.` : "",
          " Recovery covers design and customer-pricing fields; customer links and saved receipts stay as stored."
        ] }),
        draftVisible.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== draftVisible.baseUpdatedAt && /* @__PURE__ */ jsxs4("div", { className: "mt-1", children: [
          "Saved project changed since these edits.",
          /* @__PURE__ */ jsx29(
            "button",
            {
              type: "button",
              className: "ml-2 font-semibold underline",
              onClick: () => syncConflict.openDraftConflict({
                draft: draftVisible.draft,
                draftSavedAt: draftVisible.savedAt ?? null,
                baseUpdatedAt: draftVisible.baseUpdatedAt,
                savedProject: acknowledgedVersionRef.current?.sourceSnapshot ?? null,
                getSavedProject: () => staffEntities.FoundationProject.get(id)
              }),
              children: "Review changes"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "mt-2 flex gap-2", children: [
          /* @__PURE__ */ jsx29("button", { type: "button", onClick: restoreBrowserDraft, className: "rounded-sm border border-indigo-400 bg-white px-2 py-1 text-[12px] font-semibold text-indigo-800", children: "Restore browser draft" }),
          /* @__PURE__ */ jsx29("button", { type: "button", onClick: discardBrowserDraft, className: "rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700", children: "Discard browser draft" })
        ] })
      ] }) : /* @__PURE__ */ jsxs4(Fragment3, { children: [
        /* @__PURE__ */ jsxs4("div", { className: "font-semibold", children: [
          "A browser draft exists but cannot be restored. ",
          draftVisible.message || "",
          " Recovery covers design and customer-pricing fields; customer links and saved receipts stay as stored."
        ] }),
        /* @__PURE__ */ jsx29("div", { className: "mt-2", children: /* @__PURE__ */ jsx29("button", { type: "button", onClick: discardBrowserDraft, className: "rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700", children: "Discard browser draft" }) })
      ] }) }),
      /* @__PURE__ */ jsxs4("fieldset", { disabled: draftSessionRef.current.pending, className: "contents min-w-0", children: [
        /* @__PURE__ */ jsx29(
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
            canUndo: history.past.length > 0 || sceneHistory.getState().canUndo,
            canRedo: history.future.length > 0 || sceneHistory.getState().canRedo,
            onUndo: handleUndo,
            onRedo: handleRedo,
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
        showHelp && /* @__PURE__ */ jsxs4("div", { className: "bg-blue-50 border border-blue-200 rounded-sm p-3 mb-3 text-[12px] text-blue-900 space-y-2", children: [
          /* @__PURE__ */ jsxs4("p", { children: [
            "Add each footing or pillar under ",
            /* @__PURE__ */ jsx29("b", { children: "Foundation" }),
            ", then place poles, masonry walls and caps in the other tabs. Concrete, rebar, excavation and labor rates come from your settings and supplier inventory. Save & Exit pushes the total back to the combined estimate."
          ] }),
          /* @__PURE__ */ jsxs4("ol", { className: "list-decimal pl-5 space-y-0.5 text-blue-900/90", children: [
            /* @__PURE__ */ jsxs4("li", { children: [
              /* @__PURE__ */ jsx29("b", { children: "Foundations" }),
              ` - add items, enter dimensions as feet/inches (4' 0") or plain inches; malformed entries keep your draft and show a hint.`
            ] }),
            /* @__PURE__ */ jsxs4("li", { children: [
              /* @__PURE__ */ jsx29("b", { children: "Walls & Poles" }),
              " - draw wall outlines (rectangle, L, U or click-to-place), set a Foundation per wall, snap poles onto a footing."
            ] }),
            /* @__PURE__ */ jsxs4("li", { children: [
              /* @__PURE__ */ jsx29("b", { children: "Wall Caps" }),
              " - use Cap wall / Cap all walls for one row per segment; over-stock cuts split at the stock length."
            ] }),
            /* @__PURE__ */ jsxs4("li", { children: [
              /* @__PURE__ */ jsx29("b", { children: "Signage & Landscape" }),
              " - mount cabinets on poles or foundations; paint landscape cells (Fill floods a region, strokes undo as one)."
            ] }),
            /* @__PURE__ */ jsxs4("li", { children: [
              /* @__PURE__ */ jsx29("b", { children: "Canvas tools" }),
              " - click objects to select (tree + breadcrumb on the left), Mount to reparent, Diagnostics for clashes/unsupported spans, Layers to hide/lock/isolate, Fit zooms to selection."
            ] }),
            /* @__PURE__ */ jsxs4("li", { children: [
              /* @__PURE__ */ jsx29("b", { children: "3D preview" }),
              " - left drag orbits, right drag pans, scroll zooms; Exploded spreads the rebar, Section cuts at an elevation."
            ] }),
            /* @__PURE__ */ jsxs4("li", { children: [
              /* @__PURE__ */ jsx29("b", { children: "Cost Summary + BOM" }),
              " - check the changes-vs-saved list, then the field/production package on the BOM tab prints a labeled sheet."
            ] })
          ] }),
          /* @__PURE__ */ jsxs4("p", { className: "pt-1 border-t border-blue-200/60", children: [
            /* @__PURE__ */ jsx29("b", { children: "Worked example:" }),
            ` a 2-pole monument sign \u2014 add a 48"x48"x12" spread footing under Foundation; two 12' poles on Walls & Poles (Mount each onto the footing); a 4'x6" wall cap under Wall Caps; the cabinet on Signage & Landscape (Mount onto a pole at 8'). The canvas selects the footing (tree + breadcrumb); Diagnostics flags the pole off its footing until you Mount it; the 3D preview shows the footing + poles + cap; Cost Summary prices concrete + rebar + labor; the BOM prints the labeled field sheet.`
          ] })
        ] }),
        /* @__PURE__ */ jsx29(FoundationGuidedSteps_default, { project, calc, savedSourceProject, onStepClick: setMainTab }),
        /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_560px] gap-4 items-start mt-3", children: [
          /* @__PURE__ */ jsx29("div", { children: /* @__PURE__ */ jsxs4(Tabs, { value: mainTab, onValueChange: setMainTab, children: [
            /* @__PURE__ */ jsxs4(TabsList, { className: "flex flex-wrap h-auto bg-white border border-gray-200 p-1 mb-3 rounded-sm justify-start", children: [
              /* @__PURE__ */ jsxs4(TabsTrigger, { value: "foundations", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx29(AnchorIcon, { className: "w-3.5 h-3.5" }),
                " Foundation (",
                calc.items.length,
                ")"
              ] }),
              /* @__PURE__ */ jsxs4(TabsTrigger, { value: "landscape", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx29(LayoutGrid, { className: "w-3.5 h-3.5" }),
                " Walls & Poles (",
                (calc.walls?.length || 0) + (calc.poles?.length || 0),
                ")"
              ] }),
              /* @__PURE__ */ jsxs4(TabsTrigger, { value: "caps", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx29(Layers, { className: "w-3.5 h-3.5" }),
                " Wall Caps"
              ] }),
              /* @__PURE__ */ jsxs4(TabsTrigger, { value: "signage", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx29(Trees, { className: "w-3.5 h-3.5" }),
                " Signage & Landscape"
              ] }),
              /* @__PURE__ */ jsxs4(TabsTrigger, { value: "equipment", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx29(WrenchIcon, { className: "w-3.5 h-3.5" }),
                " Equipment"
              ] }),
              /* @__PURE__ */ jsxs4(TabsTrigger, { value: "summary", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx29(TrendingUp, { className: "w-3.5 h-3.5" }),
                " Cost Summary"
              ] }),
              /* @__PURE__ */ jsxs4(TabsTrigger, { value: "bom", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx29(ClipboardList, { className: "w-3.5 h-3.5" }),
                " Bill of Materials"
              ] }),
              /* @__PURE__ */ jsxs4(TabsTrigger, { value: "pricing", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx29(Tag, { className: "w-3.5 h-3.5" }),
                " Customer Pricing"
              ] })
            ] }),
            /* @__PURE__ */ jsxs4(TabsContent, { value: "foundations", className: "space-y-3", children: [
              /* @__PURE__ */ jsx29(AiEngineeringAssistant_default, { project, onResult: patch }),
              /* @__PURE__ */ jsx29(FoundationPhotoIntake_default, { project, onChange: patch }),
              /* @__PURE__ */ jsx29(FoundationAiIntake_default, { project, catalog, onApply: ({ foundations: newItems, poles: newPoles }) => commit((prev) => ({ items: [...prev.items || [], ...newItems], poles: [...prev.poles || [], ...newPoles] })) }),
              calc.items.length === 0 ? /* @__PURE__ */ jsxs4("div", { className: "bg-white rounded-sm border border-dashed border-gray-300 p-6", children: [
                /* @__PURE__ */ jsx29("p", { className: "text-[12px] font-semibold text-gray-700 mb-3", children: "Start a foundation project" }),
                /* @__PURE__ */ jsxs4("div", { className: "flex flex-wrap gap-2", children: [
                  /* @__PURE__ */ jsx29("button", { type: "button", onClick: () => setMainTab("foundations"), className: "px-3 py-1.5 rounded-sm bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700", "data-mode": "ai", children: "Start with AI" }),
                  /* @__PURE__ */ jsx29("button", { type: "button", onClick: () => {
                    if (!draftSessionRef.current.pending) setTemplateMode("load");
                  }, className: "px-3 py-1.5 rounded-sm border border-gray-300 text-gray-700 text-[11px] font-semibold hover:bg-gray-50", "data-mode": "template", children: "Use a template" }),
                  /* @__PURE__ */ jsx29("button", { type: "button", className: "px-3 py-1.5 rounded-sm border border-gray-200 text-gray-500 text-[11px] font-semibold", "data-mode": "manual", "aria-disabled": "true", title: "Author items directly below", children: "Build manually" })
                ] }),
                "No foundations yet \xE2\u20AC\u201D add a spread footing or pillar to start."
              ] }) : /* @__PURE__ */ jsx29("div", { className: "space-y-3", children: calc.items.map((item, index) => {
                const componentId = item.component_id;
                const proposalState = reinforcementEditor.read(componentId);
                return /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
                  /* @__PURE__ */ jsx29(
                    FoundationItemCard_default,
                    {
                      item,
                      pricing: calc.itemPricing[index],
                      index,
                      catalog,
                      onChange: patchItem,
                      onRemove: removeItem,
                      onDuplicate: duplicateItem,
                      supportCatalog: inventory.filter((row) => row.material_type === "rebar_support")
                    }
                  ),
                  /* @__PURE__ */ jsx29(
                    FoundationReinforcementProposalPanel_default,
                    {
                      item,
                      catalog: inventory.filter((row) => row.material_type === "rebar"),
                      ...proposalState,
                      busy: saving || catalogReloading,
                      onStart: () => reinforcementEditor.start(componentId),
                      onDraftChange: (draft) => reinforcementEditor.changeDraft(componentId, draft),
                      onPreview: () => reinforcementEditor.preview(componentId),
                      onAccept: (proposalId) => reinforcementEditor.accept(componentId, proposalId),
                      onDiscard: () => reinforcementEditor.discard(componentId),
                      onAcknowledgmentsChange: (value) => reinforcementEditor.acknowledge(componentId, value)
                    }
                  )
                ] }, componentId || index);
              }) }),
              /* @__PURE__ */ jsxs4(
                "button",
                {
                  type: "button",
                  onClick: () => addItem("spread_foot"),
                  className: "h-[30px] px-3 flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50",
                  children: [
                    /* @__PURE__ */ jsx29(Plus4, { className: "w-3.5 h-3.5" }),
                    " Add Foundation Item"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4(TabsContent, { value: "landscape", className: "space-y-4", children: [
              /* @__PURE__ */ jsx29(
                FoundationWallsPanel,
                {
                  walls: calc.walls,
                  options: catalog.walls,
                  wallPricing: calc.wallPricing,
                  items: calc.items,
                  onChange: (walls) => patch({ walls })
                }
              ),
              /* @__PURE__ */ jsx29(
                FoundationPolesPanel,
                {
                  poles: calc.poles,
                  options: catalog.poles,
                  items: calc.items,
                  polePricing: calc.polePricing,
                  onChange: (poles) => patch({ poles })
                }
              ),
              /* @__PURE__ */ jsx29(
                FoundationLayoutCanvas_default,
                {
                  items: project.items || [],
                  poles: project.poles || [],
                  walls: project.walls || [],
                  wallCaps: project.wall_caps || [],
                  signageCabinets: project.signage_cabinets || [],
                  onMoveItem: patchItem,
                  onPatchScene: patchScene,
                  sceneHistory,
                  sceneSelection,
                  onDeleteSelection: deleteSceneSelection,
                  onDuplicateSelection: duplicateSceneSelection,
                  objectSnap: layoutPrefs.objectSnap,
                  snapToleranceInches: layoutPrefs.snapToleranceInches,
                  gridSnapInches: layoutPrefs.gridSnapInches
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4(TabsContent, { value: "signage", className: "space-y-4", children: [
              /* @__PURE__ */ jsx29(
                SignageCabinetsPanel_default,
                {
                  cabinets: project.signage_cabinets || [],
                  items: project.items || [],
                  poles: project.poles || [],
                  onChange: (signage_cabinets) => patch({ signage_cabinets })
                }
              ),
              /* @__PURE__ */ jsx29(
                LandscapeDesigner_default,
                {
                  landscape: project.landscape,
                  onChange: (landscape) => patch({ landscape })
                }
              )
            ] }),
            /* @__PURE__ */ jsx29(TabsContent, { value: "caps", children: /* @__PURE__ */ jsx29(
              FoundationWallCapsPanel,
              {
                caps: calc.wallCaps,
                walls: calc.walls,
                options: catalog.caps,
                onChange: (wall_caps) => patch({ wall_caps })
              }
            ) }),
            /* @__PURE__ */ jsx29(TabsContent, { value: "equipment", children: /* @__PURE__ */ jsx29(
              FoundationEquipmentTab_default,
              {
                foundationItems: project.items || [],
                inventory,
                selectedEquipmentList: project.selected_equipment || [],
                onUpdate: (rows) => patch({ selected_equipment: rows }),
                markDirty: () => setDirty(true)
              }
            ) }),
            /* @__PURE__ */ jsxs4(TabsContent, { value: "summary", className: "space-y-3", children: [
              /* @__PURE__ */ jsxs4("label", { className: "block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500", children: [
                "Section name",
                /* @__PURE__ */ jsx29(
                  Input,
                  {
                    value: project.project_name || "",
                    onChange: (e) => patch({ project_name: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs4("label", { className: "block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500", children: [
                "Notes ",
                /* @__PURE__ */ jsx29("span", { className: "text-[10px] text-gray-400", children: "(carried to the estimate/handoff)" }),
                /* @__PURE__ */ jsx29(
                  "textarea",
                  {
                    value: project.notes || "",
                    onChange: (e) => patch({ notes: e.target.value }),
                    placeholder: "Notes for the estimate -- the preliminary notice stays attached.",
                    rows: 3,
                    className: "mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-800"
                  }
                ),
                hasPreliminaryNotice(project.notes) ? /* @__PURE__ */ jsx29("p", { className: "mt-1 text-[10px] text-amber-700", children: "Preliminary notice attached." }) : /* @__PURE__ */ jsx29("p", { className: "mt-1 text-[10px] text-gray-400", children: "The preliminary-engineering notice stamps on save." })
              ] }),
              /* @__PURE__ */ jsx29(ConcreteDeliveryPanel_default, { project, delivery: calc.delivery, onChange: patch }),
              /* @__PURE__ */ jsx29(FoundationRatesPanel_default, { settings, project, onChange: patch }),
              /* @__PURE__ */ jsxs4("div", { className: "max-w-xl", children: [
                /* @__PURE__ */ jsx29(FoundationTotals_default, { totals: calc.totals, pricingUnavailable: pricingBlocked, savedSectionTotal, sectionTotal, project, calc }),
                /* @__PURE__ */ jsxs4("div", { className: "mt-3 space-y-1 text-[12px] text-gray-600", children: [
                  /* @__PURE__ */ jsxs4("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx29("span", { children: "Signage cabinets" }),
                    /* @__PURE__ */ jsx29("span", { children: hasFoundationCostSnapshot(cabinetCost) ? money(cabinetCost) : "Not saved" })
                  ] }),
                  /* @__PURE__ */ jsxs4("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx29("span", { children: "Site landscaping" }),
                    /* @__PURE__ */ jsx29("span", { children: hasFoundationCostSnapshot(landscapeCost) ? money(landscapeCost) : "Not saved" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "mt-2 text-right text-[12px] text-gray-500", children: [
                  "Section total flowing to estimate: ",
                  pricingBlocked ? /* @__PURE__ */ jsx29("b", { className: "text-amber-700", children: "Estimate handoff paused" }) : /* @__PURE__ */ jsx29("b", { className: "text-red-700", children: money(sectionTotal) })
                ] }),
                /* @__PURE__ */ jsx29(
                  Link,
                  {
                    to: "/FoundationCatalog",
                    className: "inline-block mt-3 text-[12px] text-gray-600 hover:text-red-600",
                    children: "Manage foundation catalog \xE2\u2020\u2019"
                  }
                ),
                diffRows2.length > 0 && /* @__PURE__ */ jsxs4("details", { className: "mt-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2", children: [
                  /* @__PURE__ */ jsxs4("summary", { className: "cursor-pointer select-none text-[11px] font-semibold text-amber-800", children: [
                    diffCounts.added + diffCounts.removed + diffCounts.changed,
                    " change",
                    diffCounts.added + diffCounts.removed + diffCounts.changed === 1 ? "" : "s",
                    " vs saved",
                    /* @__PURE__ */ jsxs4("span", { className: "ml-2 font-normal text-amber-700", children: [
                      diffCounts.added ? `${diffCounts.added} added ` : "",
                      diffCounts.removed ? `${diffCounts.removed} removed ` : "",
                      diffCounts.changed ? `${diffCounts.changed} changed` : ""
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs4("ul", { className: "mt-2 space-y-0.5 text-[11px] text-amber-900", children: [
                    diffRows2.slice(0, 40).map((r, i) => /* @__PURE__ */ jsxs4("li", { children: [
                      /* @__PURE__ */ jsx29("span", { className: "font-medium capitalize", children: r.change }),
                      /* @__PURE__ */ jsxs4("span", { className: "text-amber-700", children: [
                        " \xB7 ",
                        r.label
                      ] }),
                      r.detail ? /* @__PURE__ */ jsxs4("span", { className: "text-amber-800", children: [
                        " \u2014 ",
                        r.detail
                      ] }) : null
                    ] }, `${r.section}:${r.label}:${i}`)),
                    diffRows2.length > 40 && /* @__PURE__ */ jsxs4("li", { className: "text-amber-700", children: [
                      "\u2026",
                      diffRows2.length - 40,
                      " more"
                    ] })
                  ] })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs4(TabsContent, { value: "bom", children: [
              /* @__PURE__ */ jsx29(
                FoundationBulkMaterialPanel_default,
                {
                  project,
                  selectedComponentIds: null,
                  onApply: (patch2) => setProject((prev) => prev ? { ...prev, ...patch2 } : prev)
                }
              ),
              /* @__PURE__ */ jsx29(
                FoundationBOM_default,
                {
                  onSelectIssue: (issue) => {
                    const kindMap = { foundation: "item", item: "item", pole: "pole", wall: "wall", cabinet: "cabinet" };
                    const nodeKind = kindMap[issue?.kind] || null;
                    if (!nodeKind || typeof sceneNodeId[nodeKind] !== "function") return;
                    const key = issue.componentId != null ? `component:${issue.componentId}` : issue.index != null ? `index:${issue.index}` : null;
                    if (!key) return;
                    sceneSelection.select({ id: sceneNodeId[nodeKind](key) });
                    setMainTab("foundations");
                    if (typeof issue.field === "string" && issue.field) {
                      setTimeout(() => {
                        const el = document.querySelector(`[data-field="${issue.field}"], #field-${issue.field}`);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "center" });
                          el.focus?.();
                        }
                      }, 0);
                    }
                  },
                  items: calc.items,
                  poles: calc.poles,
                  walls: calc.walls,
                  delivery: calc.delivery,
                  totals: calc.totals,
                  inventory,
                  itemPricing: calc.itemPricing,
                  polePricing: calc.polePricing,
                  wallPricing: calc.wallPricing,
                  cabinets: project.signage_cabinets || [],
                  landscape: project.landscape,
                  landscapePricing: calc.landscapePricing,
                  pricingUnavailable: pricingBlocked,
                  project
                }
              ),
              /* @__PURE__ */ jsx29(
                FoundationDesignBasis_default,
                {
                  project,
                  onChange: (patch2) => setProject((prev) => prev ? { ...prev, ...patch2 } : prev)
                }
              ),
              /* @__PURE__ */ jsx29(
                FoundationFieldPackage_default,
                {
                  project,
                  calc,
                  revision: acknowledgedVersionRef.current?.updated_date || null,
                  pricingUnavailable: pricingBlocked
                }
              )
            ] }),
            /* @__PURE__ */ jsx29(TabsContent, { value: "pricing", className: "space-y-4", children: pricingBlocked ? /* @__PURE__ */ jsx29("div", { className: "rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800", children: "Customer pricing unavailable: fix highlighted design inputs or catalog selections." }) : /* @__PURE__ */ jsxs4(Fragment3, { children: [
              /* @__PURE__ */ jsx29(
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
              /* @__PURE__ */ jsx29(
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
          /* @__PURE__ */ jsx29("div", { className: "xl:sticky xl:top-4", children: inputBlocked ? /* @__PURE__ */ jsx29("div", { className: "rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800", children: "3D preview hidden until the highlighted design inputs are corrected." }) : /* @__PURE__ */ jsx29(Foundation3DPreview_default, { project, highlightComponentIds }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx29(
      FoundationSyncConflictDialog_default,
      {
        conflict: syncConflict.conflict,
        busy: saving || syncConflict.resolving,
        disabled: {
          keep_draft: sourceRefreshRef.current ? "The project must be reloaded after the earlier save finished \xE2\u20AC\u201D reload before applying draft edits." : null
        },
        onKeepDraft: handleConflictKeepDraft,
        onKeepSaved: handleConflictKeepSaved,
        onKeepBoth: handleConflictKeepBoth,
        onDismiss: syncConflict.dismiss
      }
    ),
    /* @__PURE__ */ jsx29(
      FoundationTemplateDialog_default,
      {
        open: !!templateMode && !draftSessionRef.current.pending,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        saveDisabled: pricingBlocked || catalogReloading,
        saveDisabledReason: "Pricing unavailable: fix highlighted design inputs or catalog selections before saving a template.",
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
  FoundationEstimator as default
};
