// frozen:/app/src/pages/PaintingEstimator.jsx
import { useEffect, useMemo, useRef, useState } from "react";

// s:s://@/api/gatedEntities
var Project = {
  get: async (id) => {
    globalThis.__spies.push(["projectGet", id]);
    return globalThis.__project ?? null;
  }
};
var Settings = globalThis.__entSettings ||= { __ent: "settings" };

// frozen:/app/src/pages/PaintingEstimator.jsx
import { Link, useNavigate, useSearchParams } from "react-router-dom";

// s:s://lucide-react
var AlertTriangle = () => null;
var ArrowLeft = () => null;
var Palette = () => null;
var Plus = () => null;
var Save = () => null;
var Trash2 = () => null;

// s:s://@/components/ui/button
import { jsx } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx("button", { type: "button", ...p, children: p.children });

// s:s://@/components/ui/input
import { jsx as jsx2 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx2("input", { ...p });

// s:s://@/components/ui/textarea
import { jsx as jsx3 } from "react/jsx-runtime";
var Textarea = (p) => /* @__PURE__ */ jsx3("textarea", { ...p });

// s:s://@/components/ui/select
import { jsx as jsx4 } from "react/jsx-runtime";
var Select = (p) => /* @__PURE__ */ jsx4("div", { children: p.children });
var SelectTrigger = (p) => /* @__PURE__ */ jsx4("div", { "data-trigger": true, ...p, children: p.children });
var SelectValue = () => /* @__PURE__ */ jsx4("span", {});
var SelectContent = (p) => /* @__PURE__ */ jsx4("div", { children: p.children });
var SelectItem = (p) => /* @__PURE__ */ jsx4("div", { children: p.children });

// s:s://@/components/estimator/builder/builderService
var recordBuilderSave = async (a) => {
  globalThis.__spies.push(["recordBuilderSave", a]);
  return { ok: true };
};

// s:s://@/components/estimator/loadAllEntityRows
async function loadAllEntityRows(a) {
  globalThis.__catalogReads.push(a.label);
  if (a.entity === globalThis.__entSettings) return globalThis.__settingRows || [];
  return [];
}

// s:s://@/components/estimator/builder/sourceProjectPersistence
var updateBuilderSourceProject = async (a) => {
  globalThis.__spies.push(["saveSource", a]);
  return { ...a.data, id: a.sourceId, updated_date: "v2" };
};
var preflightBuilderSourceMutation = async (a) => {
  globalThis.__spies.push(["preflight", a]);
};

// s:s://@/components/estimator/idempotentEntityCreate
var ensureIdempotentEntityCreate = async (a) => {
  globalThis.__spies.push(["ensureIdempotent", a]);
  return { ...a.data, id: "new-1", updated_date: "v1" };
};
var newCreationRequestKey = (k) => "key-" + k + "-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);

// s:s://@/components/estimator/moduleShared/ModuleActionBar
import { jsx as jsx5 } from "react/jsx-runtime";
var ModuleActionBar_default = (p) => /* @__PURE__ */ jsx5("button", { type: "button", "data-stub": "copy", onClick: p.onSaveAsCopy, children: "copy" });

// s:s://@/components/estimator/moduleShared/ModuleTemplateDialog
var ModuleTemplateDialog_default = () => null;

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var saveModuleProjectCopy = async (a) => {
  globalThis.__spies.push(["saveCopy", a]);
  return { id: "copy-1" };
};

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx6 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx6("div", { "data-stub": "CustomerPricingTab" });

// frozen:/app/src/components/markup/projectCategorizer.jsx
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
function _impl_categorizePaintProject(p) {
  if (!p) return [];
  const lines = [];
  const mats = num(p.total_paint_mask_cost) + num(p.total_liquid_paint_and_supplies_cost);
  if (mats > 0) lines.push({ module: "paint", label: "Paint Materials & Supplies", cost: mats, category_key: "outsourced_fab" });
  const labor = num(p.total_labor_cost);
  if (labor > 0) lines.push({ module: "paint", label: "Paint Labor", cost: labor, category_key: "inhouse_labor" });
  return lines;
}
var categorizePaintProject = (p) => _catMemo(p, _impl_categorizePaintProject);

// s:s://@/components/markup/savedCustomerPricing
async function calculateSavedCustomerPricing(a) {
  globalThis.__spies.push(["pricing", a]);
  return null;
}

// frozen:/app/src/components/estimator/builder/itemIdentity.js
function newBuilderItemId(prefix = "item") {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}
function seedBuilderItemIds(items = []) {
  return (items || []).map((item, index) => ({
    ...item || {},
    builder_item_id: String(item?.builder_item_id ?? index)
  }));
}

// frozen:/app/src/components/estimator/paint/paintCalc.js
var num2 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
var paintStrictNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
var paintSettingRecorded = (settings, key) => {
  const v = settings?.[key];
  return v !== void 0 && v !== null && !(typeof v === "string" && v.trim() === "");
};
var paintSettingNumber = (settings, key, fallback, { positive = false } = {}) => {
  if (!paintSettingRecorded(settings, key)) return fallback;
  const n = paintStrictNumber(settings[key]);
  if (n === null) return fallback;
  if (positive ? n <= 0 : n < 0) return fallback;
  return n;
};
var PAINT_THICKNESSES = [
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "3/8",
  "1/2",
  "5/8",
  "3/4",
  "7/8",
  "1",
  "1-1/8",
  "1-1/4",
  "1-3/8",
  "1-1/2",
  "1-5/8",
  "1-3/4",
  "1-7/8",
  "2",
  "2-1/4",
  "2-1/2",
  "2-3/4",
  "3",
  "3-1/4",
  "3-1/2",
  "3-3/4",
  "4"
];
function parseImperialFraction(value) {
  if (typeof value !== "string") return num2(value);
  let text = value.trim();
  if (!text) return 0;
  let total = 0;
  const wholeAndFraction = text.split("-");
  if (wholeAndFraction.length === 2) {
    total += num2(wholeAndFraction[0]);
    text = wholeAndFraction[1];
  } else {
    text = wholeAndFraction[0];
  }
  const parts = text.split("/");
  if (parts.length === 2) {
    const denominator = num2(parts[1]);
    if (denominator) total += num2(parts[0]) / denominator;
  } else {
    total += num2(text);
  }
  return total;
}
function paintThicknessNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.trim();
  if (!text) return null;
  let total = 0;
  const wholeAndFraction = text.split("-");
  if (wholeAndFraction.length === 2) {
    const whole = paintStrictNumber(wholeAndFraction[0]);
    if (whole === null) return null;
    total += whole;
    text = wholeAndFraction[1];
  } else if (wholeAndFraction.length > 2) {
    return null;
  } else {
    text = wholeAndFraction[0];
  }
  const parts = text.split("/");
  if (parts.length === 2) {
    const numerator = paintStrictNumber(parts[0]);
    const denominator = paintStrictNumber(parts[1]);
    if (numerator === null || denominator === null || denominator === 0) return null;
    total += numerator / denominator;
  } else if (parts.length === 1) {
    const n = paintStrictNumber(text);
    if (n === null) return null;
    total += n;
  } else {
    return null;
  }
  return Number.isFinite(total) ? total : null;
}
function parseTiers(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function laborTierMultiplier(settings, itemType, quantity) {
  const settingKey = itemType === "panel" ? "panel_labor_tiers" : itemType === "complex_shapes" ? "complex_shapes_labor_tiers" : itemType === "lettering" ? "lettering_labor_tiers" : "";
  if (!settingKey) return 1;
  const tiers = parseTiers(settings?.[settingKey]);
  const qty = num2(quantity, 1);
  const tier = tiers.find((row) => qty >= num2(row.min_quantity) && qty <= num2(row.max_quantity));
  return tier ? num2(tier.labor_multiplier, 1) : 1;
}
function costPerGallon(cost, unit) {
  const unitFactors = { oz: 128, pint: 8, quart: 4, liter: 3.78541, gallon: 1 };
  const factor = unitFactors[unit];
  return factor ? num2(cost) * factor : 0;
}
function liquidPaintRatePerSqft(settings = {}) {
  const paintCost = costPerGallon(paintSettingNumber(settings, "paint_cost_per_unit", 0), settings.paint_unit);
  const hardenerCost = costPerGallon(paintSettingNumber(settings, "hardener_cost_per_unit", 0), settings.hardener_unit);
  const reducerCost = costPerGallon(paintSettingNumber(settings, "reducer_cost_per_unit", 0), settings.reducer_unit);
  const paintRatio = paintSettingNumber(settings, "paint_mix_ratio", 3, { positive: true });
  const hardenerRatio = paintSettingNumber(settings, "hardener_mix_ratio", 1);
  const reducerRatio = paintSettingNumber(settings, "reducer_mix_ratio", 1);
  const totalRatio = paintRatio + hardenerRatio + reducerRatio;
  const mixCost = totalRatio > 0 ? paintCost / totalRatio * paintRatio + hardenerCost / totalRatio * hardenerRatio + reducerCost / totalRatio * reducerRatio : 0;
  const coverage = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
  return coverage > 0 ? mixCost / coverage : 0;
}
function autoPaintMaskSqft(item = {}) {
  if (!(num2(item.length) > 0 && num2(item.width) > 0)) return 0;
  let faceArea = 0;
  if (item.item_type === "lettering") {
    const letterHeight = num2(item.width);
    const letterCount = num2(item.length);
    faceArea = letterHeight ** 2 * 0.8 * letterCount / 144;
  } else {
    faceArea = num2(item.length) * num2(item.width) / 144;
  }
  return item.paint_sides === "both_sides" ? faceArea * 2 : faceArea;
}
function normalizePaintingItem(item = {}) {
  const normalized = {
    item_type: "panel",
    description: "",
    thickness: "1/2",
    length: 0,
    width: 0,
    quantity: 1,
    edge_complexity_multiplier: 1,
    paint_sides: "one_side",
    paint_colors: [""],
    letter_size: "normal",
    paint_mask_sqft: 0,
    base_supplies_cost: 0,
    fixed_waste_gallons: 0,
    supplies_cost: 0,
    paint_cost: 0,
    paint_gallons: 0,
    labor_hours: 0,
    labor_cost: 0,
    ...item
  };
  normalized.paint_colors = Array.isArray(item.paint_colors) ? item.paint_colors : [];
  normalized.paint_sides = item.paint_sides === "none" ? "one_side" : item.paint_sides || "one_side";
  return normalized;
}
function calculatePaintingItem(rawItem, settings = {}, liquidRate = 0, projectPaintSuppliesRate = 0) {
  const item = normalizePaintingItem(rawItem);
  const perimFactor = paintSettingNumber(settings, "letter_perimeter_factor", 3.5, { positive: true });
  const thickness = parseImperialFraction(item.thickness);
  let paintableSqFt = 0;
  if (item.item_type === "panel" && num2(item.length) > 0 && num2(item.width) > 0) {
    const faceArea = num2(item.length) * num2(item.width) / 144;
    const perimeterInches = 2 * (num2(item.length) + num2(item.width));
    const edgeArea = thickness > 0 ? perimeterInches * thickness / 144 : 0;
    paintableSqFt = item.paint_sides === "both_sides" ? faceArea * 2 + edgeArea : faceArea + edgeArea;
  } else if (item.item_type === "lettering" && num2(item.width) > 0 && num2(item.length) > 0 && thickness > 0) {
    const letterHeight = num2(item.width);
    const letterCount = num2(item.length);
    const faceArea = letterHeight ** 2 * 0.8 * letterCount / 144;
    const perimeterInches = letterHeight * perimFactor * letterCount;
    const edgeArea = perimeterInches * thickness / 144;
    paintableSqFt = item.paint_sides === "both_sides" ? faceArea * 2 + edgeArea : faceArea + edgeArea;
  } else if (item.item_type === "complex_shapes" && num2(item.length) > 0 && num2(item.width) > 0 && thickness > 0) {
    const faceArea = num2(item.length) * num2(item.width) / 144;
    const perimeterInches = 2 * (num2(item.length) + num2(item.width));
    const edgeArea = perimeterInches * thickness * num2(item.edge_complexity_multiplier, 1) / 144;
    paintableSqFt = item.paint_sides === "both_sides" ? faceArea * 2 + edgeArea : faceArea + edgeArea;
  }
  const paintMaskMaterialRate = paintSettingNumber(settings, "paint_mask_rate_per_sqft", 0.75);
  const paintMaskMachineRate = paintSettingNumber(settings, "paint_mask_machine_cutting_rate_per_sqft", 0.1);
  const numColors = (item.paint_colors || []).length;
  let paintMaskCost = 0;
  if (numColors > 1 && num2(item.paint_mask_sqft) > 0) {
    paintMaskCost = num2(item.paint_mask_sqft) * (paintMaskMaterialRate + paintMaskMachineRate) * (numColors - 1);
  }
  let liquidPaintCost = 0;
  let paintApplicationSuppliesCost = 0;
  let paintGallons = 0;
  if (numColors > 0) {
    const wasteMultiplier = paintSettingNumber(settings, "paint_waste_multiplier", 1.25, { positive: true });
    const coverage2 = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
    paintApplicationSuppliesCost = paintableSqFt * num2(projectPaintSuppliesRate) * numColors;
    if (liquidRate > 0) liquidPaintCost = paintableSqFt * liquidRate * wasteMultiplier * numColors;
    paintGallons = paintableSqFt * wasteMultiplier * numColors / coverage2;
  }
  const itemFixedWasteGallons = num2(item.fixed_waste_gallons);
  paintGallons += itemFixedWasteGallons;
  const coverage = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
  liquidPaintCost += itemFixedWasteGallons * liquidRate * coverage;
  const liquidPaintAndSuppliesCost = paintApplicationSuppliesCost + liquidPaintCost + num2(item.base_supplies_cost);
  const laborRate = paintSettingNumber(settings, "default_labor_rate", 60, { positive: true });
  const baseHoursPerSqFt = paintSettingNumber(settings, "base_labor_hours_per_sqft", 0.05);
  const complexityMap = {
    extra_small: "complex",
    small: "complex",
    normal: "moderate",
    medium: "moderate",
    large: "simple",
    extra_large: "simple"
  };
  const itemComplexity = item.item_type === "lettering" ? complexityMap[item.letter_size] || "moderate" : "moderate";
  const complexityMultipliers = {
    simple: paintSettingNumber(settings, "simple_complexity_multiplier", 0.7),
    moderate: paintSettingNumber(settings, "moderate_complexity_multiplier", 1),
    complex: paintSettingNumber(settings, "complex_complexity_multiplier", 1.5)
  };
  const paintMultipliers = {
    one_side: paintSettingNumber(settings, "one_side_paint_multiplier", 0.8),
    both_sides: paintSettingNumber(settings, "both_sides_paint_multiplier", 1)
  };
  const additionalColorMultiplier = paintSettingNumber(settings, "additional_color_multiplier", 0.3);
  let baseHours = paintableSqFt * baseHoursPerSqFt * (complexityMultipliers[itemComplexity] || 1) * (paintMultipliers[item.paint_sides] || 1);
  if (numColors > 1) baseHours *= 1 + (numColors - 1) * additionalColorMultiplier;
  const maskApplicationLaborRate = paintSettingNumber(settings, "paint_mask_application_labor_rate_per_sqft", 0.25);
  const maskCuttingLaborRate = paintSettingNumber(settings, "paint_mask_cutting_labor_rate_per_sqft", 0.15);
  if (numColors > 1 && num2(item.paint_mask_sqft) > 0) {
    baseHours += num2(item.paint_mask_sqft) * maskApplicationLaborRate * (numColors - 1) / laborRate + num2(item.paint_mask_sqft) * maskCuttingLaborRate * (numColors - 1) / laborRate;
  }
  const qty = item.item_type === "lettering" ? 1 : Math.max(num2(item.quantity, 1), 1);
  const discountedLaborHours = baseHours * laborTierMultiplier(settings, item.item_type, qty);
  const laborCost = discountedLaborHours * laborRate * qty;
  return {
    ...item,
    quantity: qty,
    supplies_cost: paintMaskCost * qty,
    paint_cost: liquidPaintAndSuppliesCost * qty,
    paint_gallons: paintGallons * qty,
    labor_hours: discountedLaborHours * qty,
    labor_cost: laborCost,
    paintable_sqft: paintableSqFt
  };
}
function calculatePaintingProject(project = {}, settings = {}) {
  const liquidRate = liquidPaintRatePerSqft(settings);
  const projectSuppliesRate = paintSettingNumber(
    project,
    "paint_supplies_per_sqft",
    paintSettingNumber(settings, "default_paint_supplies_per_sqft", 1.25)
  );
  const items = (project.items || []).map((item) => calculatePaintingItem(item, settings, liquidRate, projectSuppliesRate));
  const totalPaintMask = items.reduce((sum, item) => sum + num2(item.supplies_cost), 0);
  let totalLiquidPaintAndSupplies = items.reduce((sum, item) => sum + num2(item.paint_cost), 0);
  const totalItemLaborCost = items.reduce((sum, item) => sum + num2(item.labor_cost), 0);
  let totalPaintGallons = items.reduce((sum, item) => sum + num2(item.paint_gallons), 0);
  const globalFixedWasteGallons = paintSettingNumber(settings, "fixed_paint_waste_gallons", 0);
  totalPaintGallons += globalFixedWasteGallons;
  const coverage = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
  totalLiquidPaintAndSupplies += globalFixedWasteGallons * liquidRate * coverage;
  const itemFixedWaste = items.reduce((sum, item) => sum + num2(item.fixed_waste_gallons), 0);
  const numberOfMixes = Math.ceil(totalPaintGallons);
  const mixingHours = numberOfMixes * paintSettingNumber(settings, "paint_mixing_labor_hours", 0.25);
  const setupHours = paintSettingNumber(settings, "setup_time_labor_hours", 0.5);
  const uniqueColors = /* @__PURE__ */ new Set();
  items.forEach((item) => (item.paint_colors || []).forEach((color) => {
    const normalized = String(color || "").trim().toLowerCase();
    if (normalized) uniqueColors.add(normalized);
  }));
  const uniqueColorCount = uniqueColors.size;
  const totalColorChangeHours = uniqueColorCount > 1 ? (uniqueColorCount - 1) * paintSettingNumber(settings, "color_change_setup_hours", 0.25) : 0;
  const totalPaintGunCleaningHours = uniqueColorCount > 0 ? uniqueColorCount * paintSettingNumber(settings, "paint_gun_cleaning_hours", 0.15) : 0;
  const laborRate = paintSettingNumber(settings, "default_labor_rate", 60, { positive: true });
  const fixedLaborCost = (mixingHours + setupHours + totalColorChangeHours + totalPaintGunCleaningHours) * laborRate;
  let totalLabor = totalItemLaborCost + fixedLaborCost;
  const totalLaborHours = items.reduce((sum, item) => sum + num2(item.labor_hours), 0) + mixingHours + setupHours + totalColorChangeHours + totalPaintGunCleaningHours;
  const minLaborHours = paintSettingNumber(settings, "min_labor_hours", 0);
  const minPaintCost = paintSettingNumber(settings, "min_paint_cost", 0);
  if (totalLaborHours > 0 && totalLaborHours < minLaborHours) totalLabor = minLaborHours * laborRate;
  if (totalLiquidPaintAndSupplies > 0 && totalLiquidPaintAndSupplies < minPaintCost) totalLiquidPaintAndSupplies = minPaintCost;
  const totalCost = totalPaintMask + totalLiquidPaintAndSupplies + totalLabor;
  return {
    items,
    liquidPaintRate: liquidRate,
    totals: {
      total_paint_mask_cost: totalPaintMask,
      total_liquid_paint_and_supplies_cost: totalLiquidPaintAndSupplies,
      total_labor_cost: totalLabor,
      total_labor_hours: totalLaborHours,
      total_paint_gallons: totalPaintGallons,
      number_of_mixes: numberOfMixes,
      mixing_hours: mixingHours,
      setup_hours: setupHours,
      unique_color_count: uniqueColorCount,
      color_change_hours: totalColorChangeHours,
      gun_cleaning_hours: totalPaintGunCleaningHours,
      fixed_waste_gallons: globalFixedWasteGallons + itemFixedWaste,
      total_cost: totalCost
    }
  };
}

// frozen:/app/src/components/estimator/paint/paintPricingAvailability.js
var issue = (kind, { index = null, itemIndex = null, field, code, message, hold }) => ({
  kind,
  index,
  itemIndex,
  field,
  code,
  message,
  hold
});
var PRICED_SETTINGS = [
  ["default_labor_rate", "default labor rate ($/hr)", true],
  ["min_labor_hours", "minimum labor hours floor", false],
  ["min_paint_cost", "minimum paint cost floor", false],
  ["default_paint_supplies_per_sqft", "default paint supplies per sq ft", false],
  ["paint_cost_per_unit", "paint cost per unit", false],
  ["hardener_cost_per_unit", "hardener cost per unit", false],
  ["reducer_cost_per_unit", "reducer cost per unit", false],
  ["paint_mix_ratio", "paint mix ratio", true],
  ["hardener_mix_ratio", "hardener mix ratio", false],
  ["reducer_mix_ratio", "reducer mix ratio", false],
  ["mixed_paint_coverage_sqft_per_gallon", "mixed paint coverage (sq ft/gallon)", true],
  ["paint_waste_multiplier", "paint waste multiplier", true],
  ["fixed_paint_waste_gallons", "fixed paint waste (gallons)", false],
  ["paint_mask_rate_per_sqft", "paint mask material rate per sq ft", false],
  ["paint_mask_machine_cutting_rate_per_sqft", "paint mask machine cutting rate per sq ft", false],
  ["paint_mask_application_labor_rate_per_sqft", "paint mask application labor rate per sq ft", false],
  ["paint_mask_cutting_labor_rate_per_sqft", "paint mask cutting labor rate per sq ft", false],
  ["base_labor_hours_per_sqft", "base labor hours per sq ft", false],
  ["setup_time_labor_hours", "setup time (hours)", false],
  ["paint_mixing_labor_hours", "paint mixing labor hours per mix", false],
  ["color_change_setup_hours", "color change setup hours", false],
  ["paint_gun_cleaning_hours", "paint gun cleaning hours", false],
  ["one_side_paint_multiplier", "one-side paint multiplier", false],
  ["both_sides_paint_multiplier", "both-sides paint multiplier", false],
  ["additional_color_multiplier", "additional color multiplier", false],
  ["simple_complexity_multiplier", "simple complexity multiplier", false],
  ["moderate_complexity_multiplier", "moderate complexity multiplier", false],
  ["complex_complexity_multiplier", "complex complexity multiplier", false],
  ["letter_perimeter_factor", "letter perimeter factor", true]
];
var PAINT_UNITS = ["oz", "pint", "quart", "liter", "gallon"];
var TIER_SETTINGS = [
  ["panel_labor_tiers", "panel labor tiers"],
  ["complex_shapes_labor_tiers", "complex shape labor tiers"],
  ["lettering_labor_tiers", "lettering labor tiers"]
];
function paintSettingIssues(settings = {}) {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("paint_catalog", { field, code, message, hold: "project" }));
  for (const [key, human, positive] of PRICED_SETTINGS) {
    if (!paintSettingRecorded(settings, key)) continue;
    const n = paintStrictNumber(settings[key]);
    if (n === null || (positive ? n <= 0 : n < 0)) {
      add(
        key,
        "paint_setting_unavailable",
        `Setting ${key}: record a finite, ${positive ? "positive" : "nonnegative"} ${human} in Painting Settings \u2014 the stored value cannot price this estimate`
      );
    }
  }
  for (const [costKey, unitKey, human] of [
    ["paint_cost_per_unit", "paint_unit", "paint"],
    ["hardener_cost_per_unit", "hardener_unit", "hardener"],
    ["reducer_cost_per_unit", "reducer_unit", "reducer"]
  ]) {
    const unitRecorded = paintSettingRecorded(settings, unitKey);
    const unitValid = PAINT_UNITS.includes(settings?.[unitKey]);
    if (unitRecorded && !unitValid) {
      add(
        unitKey,
        "paint_liquid_unit_unavailable",
        `Setting ${unitKey}: select a supported ${human} unit (oz / pint / quart / liter / gallon) in Painting Settings`
      );
    } else if (!unitValid && (paintStrictNumber(settings?.[costKey]) ?? 0) > 0) {
      add(
        unitKey,
        "paint_liquid_unit_unavailable",
        `Setting ${unitKey}: set a ${human} unit \u2014 a recorded ${costKey} prices as $0 without one`
      );
    }
  }
  for (const [key, human] of TIER_SETTINGS) {
    if (!paintSettingRecorded(settings, key)) continue;
    const raw = settings[key];
    let tiers = raw;
    if (!Array.isArray(tiers)) {
      try {
        const parsed = JSON.parse(raw || "[]");
        tiers = Array.isArray(parsed) ? parsed : null;
      } catch {
        tiers = null;
      }
    }
    if (tiers === null) {
      add(
        key,
        "paint_labor_tiers_unavailable",
        `Setting ${key}: the ${human} table is not a valid JSON array \u2014 repair it in Painting Settings or quantity discounts price as 1x`
      );
      continue;
    }
    tiers.forEach((row, rowIdx) => {
      const where = `Setting ${key} row ${rowIdx + 1}`;
      for (const [field, human2] of [["min_quantity", "minimum quantity"], ["max_quantity", "maximum quantity"]]) {
        if (row?.[field] !== void 0 && row?.[field] !== null && (paintStrictNumber(row[field]) === null || paintStrictNumber(row[field]) < 0)) {
          add(
            key,
            "paint_labor_tier_row_unavailable",
            `${where}: record a finite, nonnegative ${human2} \u2014 the stored value dead-windows this tier`
          );
        }
      }
      if (row?.labor_multiplier !== void 0 && row?.labor_multiplier !== null && (paintStrictNumber(row.labor_multiplier) === null || paintStrictNumber(row.labor_multiplier) < 0)) {
        add(
          key,
          "paint_labor_tier_row_unavailable",
          `${where}: record a finite, nonnegative labor multiplier \u2014 the stored value cannot price this tier`
        );
      }
    });
  }
  return issues;
}
var LETTER_SIZES = ["extra_small", "small", "normal", "medium", "large", "extra_large"];
var PRESENT = (v) => v !== void 0 && v !== null;
var nonnegField = (v) => paintStrictNumber(v) !== null && paintStrictNumber(v) >= 0;
function paintItemIssues(rawItem = {}, index = 0) {
  const issues = [];
  const label = `Item ${index + 1}${rawItem?.description ? ` "${rawItem.description}"` : ""}`;
  const add = (field, code, message) => issues.push(issue("paint", { index, itemIndex: index, field, code, message: `${label}: ${message}`, hold: "item" }));
  if (PRESENT(rawItem?.item_type) && !["panel", "lettering", "complex_shapes"].includes(rawItem.item_type)) {
    add(
      "item_type",
      "paint_item_type_unavailable",
      "select Panel, Lettering, or Complex Shape \u2014 the stored type prices as $0 silently"
    );
  }
  const effectiveType = rawItem?.item_type || "panel";
  if (rawItem?.thickness !== void 0) {
    const t = paintThicknessNumber(rawItem.thickness);
    if (t === null || t < 0) {
      add(
        "thickness",
        "paint_thickness_unavailable",
        "record a usable thickness (inches, e.g. 1/2 or 1-1/4) \u2014 the stored value silently drops edge pricing"
      );
    } else if (t === 0 && effectiveType !== "panel") {
      add(
        "thickness",
        "paint_thickness_unavailable",
        'record a positive thickness \u2014 lettering and complex shapes price nothing at 0"'
      );
    }
  }
  for (const field of ["length", "width"]) {
    const n = paintStrictNumber(rawItem?.[field]);
    if (n === null || n <= 0) {
      add(
        field,
        "paint_dimension_unavailable",
        `record a positive, finite ${field === "length" ? effectiveType === "lettering" ? "letter count" : "length" : effectiveType === "lettering" ? "letter height" : "width"} (inches) \u2014 a blank or zero dimension prices the item as $0 silently`
      );
    }
  }
  if (effectiveType !== "lettering" && PRESENT(rawItem?.quantity)) {
    const q = paintStrictNumber(rawItem.quantity);
    if (q === null || q < 1) {
      add(
        "quantity",
        "paint_quantity_unavailable",
        "record a quantity of 1 or more \u2014 a blank or malformed value prices as 1 silently"
      );
    }
  }
  if (PRESENT(rawItem?.paint_sides) && rawItem.paint_sides !== "" && !["one_side", "both_sides", "none"].includes(rawItem.paint_sides)) {
    add(
      "paint_sides",
      "paint_sides_unavailable",
      "choose One side or Both sides \u2014 the stored value silently prices as one side"
    );
  }
  if (effectiveType === "complex_shapes" && PRESENT(rawItem?.edge_complexity_multiplier) && !nonnegField(rawItem.edge_complexity_multiplier)) {
    add(
      "edge_complexity_multiplier",
      "paint_edge_complexity_unavailable",
      "record a finite, nonnegative edge complexity multiplier \u2014 the stored value cannot price edges"
    );
  }
  if (PRESENT(rawItem?.paint_mask_sqft) && !nonnegField(rawItem.paint_mask_sqft)) {
    add(
      "paint_mask_sqft",
      "paint_mask_sqft_unavailable",
      "record a finite, nonnegative paint mask area (sq ft) \u2014 the stored value drops mask pricing"
    );
  }
  for (const [field, human] of [["fixed_waste_gallons", "fixed waste (gallons)"], ["base_supplies_cost", "base supplies cost ($)"]]) {
    if (PRESENT(rawItem?.[field]) && !nonnegField(rawItem[field])) {
      add(
        field,
        field === "fixed_waste_gallons" ? "paint_fixed_waste_unavailable" : "paint_base_supplies_unavailable",
        `record a finite, nonnegative ${human} \u2014 the stored value silently became $0`
      );
    }
  }
  if (effectiveType === "lettering" && PRESENT(rawItem?.letter_size) && rawItem.letter_size !== "" && !LETTER_SIZES.includes(rawItem.letter_size)) {
    add(
      "letter_size",
      "paint_letter_size_unavailable",
      "the stored letter size is unsupported \u2014 it silently prices as moderate complexity"
    );
  }
  if (PRESENT(rawItem?.paint_colors) && !Array.isArray(rawItem.paint_colors)) {
    add(
      "paint_colors",
      "paint_colors_unavailable",
      "the stored color list is malformed \u2014 it silently bills $0 paint; re-add the colors"
    );
  }
  return issues;
}
function paintProjectInputIssues(project = {}) {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("paint", { field, code, message, hold: "project" }));
  if (project?.items !== void 0 && !Array.isArray(project.items)) {
    add(
      "items",
      "paint_items_unavailable",
      "the stored paint items are malformed \u2014 the project cannot be repriced"
    );
  }
  if (project?.paint_supplies_per_sqft !== void 0 && (paintStrictNumber(project.paint_supplies_per_sqft) === null || paintStrictNumber(project.paint_supplies_per_sqft) < 0)) {
    add(
      "paint_supplies_per_sqft",
      "paint_supplies_rate_unavailable",
      "record a finite, nonnegative supplies rate per sq ft \u2014 a blank or malformed value silently repriced supplies"
    );
  }
  return issues;
}
var ITEM_HELD_FIELDS = ["supplies_cost", "paint_cost", "paint_gallons", "labor_hours", "labor_cost", "paintable_sqft"];
function calcPaintingProject(project = {}, settings = {}) {
  const issues = [
    ...paintSettingIssues(settings),
    ...(Array.isArray(project?.items) ? project.items : []).flatMap((item, index) => paintItemIssues(item, index)),
    ...paintProjectInputIssues(project)
  ];
  const calcable = Array.isArray(project?.items) ? project : { ...project, items: [] };
  const calc = calculatePaintingProject(calcable, settings);
  const held = issues.length > 0;
  if (!held) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held };
  }
  const out = { ...calc, totals: { ...calc.totals } };
  const hasProjectHold = issues.some((i) => i.hold === "project");
  const itemHolds = new Set(issues.filter((i) => i.hold === "item").map((i) => i.itemIndex));
  out.items = calc.items.map((item, index) => {
    if (!hasProjectHold && !itemHolds.has(index)) return item;
    const heldItem = { ...item };
    for (const field of ITEM_HELD_FIELDS) heldItem[field] = null;
    return heldItem;
  });
  for (const field of Object.keys(out.totals)) out.totals[field] = null;
  if (hasProjectHold) out.liquidPaintRate = null;
  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held };
}
var hasPaintCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var paintDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};
var issuesForField = (issues = [], field, itemIndex = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
var hasIssueFor = (issues = [], field, itemIndex = null) => issuesForField(issues, field, itemIndex).length > 0;

// s:s://@/components/staff/staffEntities
var staffEntities = {
  AllInOneEstimate: { get: async (id) => globalThis.__estimate ?? null }
};

// frozen:/app/src/pages/PaintingEstimator.jsx
import { jsx as jsx7, jsxs } from "react/jsx-runtime";
var money = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
var number = (value, digits = 2) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: digits });
var sumOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
var moneyCell = (v) => hasPaintCostSnapshot(v) ? money(v) : /* @__PURE__ */ jsx7("span", { className: "text-amber-700 font-medium", children: "Not saved" });
var numCell = (v, digits = 2) => Number.isFinite(v) ? number(v, digits) : "\u2014";
var emptyItem = () => normalizePaintingItem({
  builder_item_id: newBuilderItemId("paint-item"),
  paint_colors: [""]
});
function PaintingEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [project, setProject] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const persistedProjectIdRef = useRef(editId || "");
  const createAttemptRef = useRef({ signature: "", key: "" });
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const [templateMode, setTemplateMode] = useState(null);
  useEffect(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
    copyAttemptRef.current = { signature: "", key: "" };
  }, [editId]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [settingsRows, existing, estimate] = await Promise.all([
          loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" }),
          editId ? Project.get(editId) : Promise.resolve(null),
          estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
        ]);
        if (!active) return;
        const settingsMap = {};
        (settingsRows || []).forEach((row) => {
          settingsMap[row.setting_name] = row.setting_value;
        });
        setSettings(settingsMap);
        const suppliesDefault = Number(settingsMap.default_paint_supplies_per_sqft) || 1.25;
        if (existing) {
          setProject({
            ...existing,
            client_name: estimate?.client_name || existing.client_name || "",
            customer_id: estimate?.customer_id || existing.customer_id || null,
            estimate_number: estimate?.estimate_number || existing.estimate_number || "",
            items: seedBuilderItemIds((existing.items || []).map(normalizePaintingItem), "paint-item"),
            paint_supplies_per_sqft: existing.paint_supplies_per_sqft ?? suppliesDefault
          });
        } else {
          setProject({
            project_name: estimate?.project_name ? `${estimate.project_name} \u2014 Painting` : "",
            client_name: estimate?.client_name || "",
            customer_id: estimate?.customer_id || null,
            estimate_number: estimate?.estimate_number || "",
            hyperlink: "",
            status: "draft",
            items: [],
            paint_supplies_per_sqft: suppliesDefault,
            notes: settingsMap.default_notes_template || ""
          });
        }
      } catch (e) {
        console.error("Could not load Painting estimator:", e);
        if (active) setError(e.message || "Could not load Painting estimator.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [editId, estimateId]);
  const priced = useMemo(
    () => project ? calcPaintingProject(project, settings) : null,
    [project, settings]
  );
  const calculated = priced?.calc || null;
  const totals = calculated?.totals || {};
  const allIssues = priced?.issues || [];
  const catalogBlocked = allIssues.some((i) => i.kind === "paint_catalog");
  const pricingBlocked = allIssues.length > 0;
  const pricingUnavailable = !!calculated?.pricingUnavailable;
  const itemIssues = (index) => allIssues.filter((i) => i.itemIndex === index);
  const patchProject = (changes) => setProject((prev) => ({ ...prev, ...changes }));
  const patchItem = (index, changes, { autoMask = false } = {}) => {
    setProject((prev) => {
      const items = [...prev.items || []];
      let item = normalizePaintingItem({ ...items[index], ...changes });
      if (item.item_type === "lettering") item.quantity = 1;
      if (Object.prototype.hasOwnProperty.call(changes, "width") && item.item_type === "lettering") {
        const height = Number(item.width || 0);
        item.letter_size = height <= 4 ? "extra_small" : height <= 8 ? "small" : height <= 12 ? "normal" : height <= 20 ? "medium" : height <= 30 ? "large" : "extra_large";
      }
      if (autoMask) item.paint_mask_sqft = autoPaintMaskSqft(item);
      items[index] = item;
      return { ...prev, items };
    });
  };
  const addItem = () => {
    setTimeout(() => document.querySelector(`input[data-item-desc="${(project.items || []).length}"]`)?.focus(), 60);
    patchProject({ items: [...project.items || [], emptyItem()] });
  };
  const removeItem = (index) => {
    const label = project.items?.[index]?.description || `item ${index + 1}`;
    if (!window.confirm(`Delete "${label}"?`)) return;
    patchProject({ items: project.items.filter((_, i) => i !== index) });
  };
  const updateColor = (itemIndex, colorIndex, value) => {
    const colors = [...project.items[itemIndex].paint_colors || []];
    colors[colorIndex] = value;
    patchItem(itemIndex, { paint_colors: colors });
  };
  const addColor = (itemIndex) => patchItem(itemIndex, { paint_colors: [...project.items[itemIndex].paint_colors || [], ""] });
  const removeColor = (itemIndex, colorIndex) => patchItem(itemIndex, {
    paint_colors: (project.items[itemIndex].paint_colors || []).filter((_, i) => i !== colorIndex)
  });
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) saveProject();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);
  useEffect(() => {
    if (!saving) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  const saveProject = async () => {
    if (pricingBlocked) {
      setError(catalogBlocked ? "Save paused: a Painting Settings value is missing or unusable \u2014 update it in Painting Settings, then save." : "Save paused: fix the flagged pricing values before saving \u2014 unavailable pricing is never written as $0.");
      return;
    }
    if (!project?.project_name?.trim() || !project?.client_name?.trim()) {
      setError("Project name and client name are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const cleanItems = (calculated?.items || []).map((item) => ({
        ...item,
        paint_colors: (item.paint_colors || []).filter((color) => String(color || "").trim())
      }));
      const pricingProject = {
        ...project,
        total_paint_mask_cost: totals.total_paint_mask_cost,
        total_liquid_paint_and_supplies_cost: totals.total_liquid_paint_and_supplies_cost,
        total_labor_cost: totals.total_labor_cost
      };
      const customerPricing = project.customer_pricing?.applied === true ? await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizePaintProject,
        tierNumber: project.customer_pricing?.tier_number
      }) : project.customer_pricing;
      const payload = {
        project_name: project.project_name,
        client_name: project.client_name,
        customer_id: project.customer_id || null,
        estimate_number: project.estimate_number || "",
        hyperlink: project.hyperlink || "",
        status: "calculated",
        items: cleanItems,
        paint_supplies_per_sqft: Number(project.paint_supplies_per_sqft || 0),
        total_paint_mask_cost: totals.total_paint_mask_cost,
        total_liquid_paint_and_supplies_cost: totals.total_liquid_paint_and_supplies_cost,
        total_labor_cost: totals.total_labor_cost,
        customer_pricing: customerPricing,
        notes: project.notes || ""
      };
      let projectId = persistedProjectIdRef.current || editId || "";
      let savedProject;
      if (projectId) {
        savedProject = await updateBuilderSourceProject({
          entity: Project,
          sourceId: projectId,
          expectedUpdatedAt: project.updated_date,
          data: payload,
          estimateId,
          label: "Painting project"
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(payload);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("painting_project")
          };
        }
        savedProject = await ensureIdempotentEntityCreate({
          entity: Project,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: payload,
          label: "Painting project"
        });
        if (!savedProject?.id) throw new Error("Painting project create could not be verified.");
        projectId = savedProject.id;
        persistedProjectIdRef.current = projectId;
      }
      if (!savedProject?.id) savedProject = await Project.get(projectId);
      if (estimateId) {
        await recordBuilderSave({
          estimateId,
          line: { project_id: projectId, module_key: "painting" },
          sourceProject: savedProject,
          liveTotal: totals.total_cost
        });
      }
      setProject((prev) => ({ ...prev, ...savedProject, items: seedBuilderItemIds(savedProject.items || [], "paint-item") }));
      onSaved?.();
      if (!embedded && !editId) navigate(`/PaintingEstimator?id=${projectId}`);
    } catch (e) {
      console.error("Could not save Painting estimator:", e);
      setError(e.message || "Could not save Painting estimator.");
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAsCopy = async () => {
    if (pricingBlocked) {
      setError("Save paused: fix the flagged pricing values before saving a copy \u2014 unavailable pricing is never written as $0.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const cleanItems = (calculated?.items || []).map((item) => ({
        ...item,
        paint_colors: (item.paint_colors || []).filter((color) => String(color || "").trim())
      }));
      const copy = await saveModuleProjectCopy({
        entity: Project,
        payload: {
          project_name: project.project_name,
          client_name: project.client_name,
          customer_id: project.customer_id || null,
          estimate_number: project.estimate_number || "",
          hyperlink: project.hyperlink || "",
          status: "calculated",
          items: cleanItems,
          paint_supplies_per_sqft: Number(project.paint_supplies_per_sqft || 0),
          total_paint_mask_cost: totals.total_paint_mask_cost,
          total_liquid_paint_and_supplies_cost: totals.total_liquid_paint_and_supplies_cost,
          total_labor_cost: totals.total_labor_cost,
          customer_pricing: project.customer_pricing,
          notes: project.notes || ""
        },
        attemptRef: copyAttemptRef,
        keyPrefix: "painting_project_copy",
        baseName: project.project_name || "Painting",
        label: "Painting project copy"
      });
      if (embedded) onSaved?.();
      else navigate(`/PaintingEstimator?id=${copy.id}`);
    } catch (e) {
      console.error("Could not copy Painting estimator:", e);
      setError(e.message || "Could not copy Painting estimator.");
    } finally {
      setSaving(false);
    }
  };
  const buildPaintingTemplateData = (p) => ({
    items: p.items || [],
    paint_supplies_per_sqft: p.paint_supplies_per_sqft,
    notes: p.notes
  });
  if (loading) return /* @__PURE__ */ jsx7("div", { className: "p-10 text-center text-gray-400", children: "Loading Painting Builder\u2026" });
  if (!project) return /* @__PURE__ */ jsx7("div", { className: "p-10 text-center text-red-600", children: error || "Painting project not found." });
  return /* @__PURE__ */ jsxs("div", { className: "min-h-full bg-gray-50", children: [
    /* @__PURE__ */ jsxs("div", { className: "max-w-[1220px] mx-auto p-4 sm:p-5", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3 mb-4", children: [
        embedded ? /* @__PURE__ */ jsxs("button", { type: "button", onClick: onClose, className: "inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900", children: [
          /* @__PURE__ */ jsx7(ArrowLeft, { className: "w-4 h-4" }),
          " Back to products"
        ] }) : /* @__PURE__ */ jsxs(Link, { to: estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator", className: "inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900", children: [
          /* @__PURE__ */ jsx7(ArrowLeft, { className: "w-4 h-4" }),
          " Back to estimator"
        ] }),
        project?.updated_date && /* @__PURE__ */ jsxs("div", { className: "mt-1 text-[10px] text-gray-400", children: [
          "Last saved ",
          new Date(project.updated_date).toLocaleString()
        ] }),
        /* @__PURE__ */ jsxs(Button, { onClick: saveProject, disabled: saving || !project.project_name?.trim() || !project.client_name?.trim(), className: "h-[32px] bg-[#454545] hover:bg-[#353535] text-white text-[12px] font-semibold", children: [
          /* @__PURE__ */ jsx7(Save, { className: "w-4 h-4 mr-1.5" }),
          " ",
          saving ? "Saving\u2026" : "Save Painting"
        ] }),
        /* @__PURE__ */ jsx7(
          ModuleActionBar_default,
          {
            onTemplates: () => setTemplateMode("load"),
            onSaveAsTemplate: () => setTemplateMode("save"),
            onSaveAsCopy: handleSaveAsCopy,
            estimateId,
            saving
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
        /* @__PURE__ */ jsx7("div", { className: "w-9 h-9 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center", children: /* @__PURE__ */ jsx7(Palette, { className: "w-5 h-5" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx7("h1", { className: "text-[20px] font-bold text-gray-900", children: "Painting Builder" }),
          /* @__PURE__ */ jsx7("p", { className: "text-[11px] text-gray-500", children: "Panels, dimensional lettering and complex shapes using the migrated SignEstimate Pro paint formulas." })
        ] })
      ] }),
      error && /* @__PURE__ */ jsx7("div", { className: "mb-3 px-3 py-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded", children: error }),
      allIssues.length > 0 && /* @__PURE__ */ jsxs(
        "div",
        {
          role: "status",
          id: "paint-pricing-issues",
          className: "mb-3 flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-300 rounded px-3 py-2",
          children: [
            /* @__PURE__ */ jsx7(AlertTriangle, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxs("div", { className: "font-semibold", children: [
                "Pricing unavailable \u2014 ",
                allIssues.length,
                " value",
                allIssues.length === 1 ? "" : "s",
                " need",
                allIssues.length === 1 ? "s" : "",
                " attention before this estimate can be priced or saved."
              ] }),
              /* @__PURE__ */ jsxs("ul", { className: "mt-1 space-y-0.5 list-disc list-inside", children: [
                allIssues.slice(0, 5).map((it, i) => /* @__PURE__ */ jsx7("li", { children: it.message }, i)),
                allIssues.length > 5 && /* @__PURE__ */ jsxs("li", { children: [
                  "\u2026and ",
                  allIssues.length - 5,
                  " more"
                ] })
              ] })
            ] })
          ]
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_310px] gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-4 min-w-0", children: [
          /* @__PURE__ */ jsxs("section", { className: "bg-white border border-gray-200 rounded-md p-4", children: [
            /* @__PURE__ */ jsx7("div", { className: "text-[12px] font-bold text-gray-800 mb-3", children: "Project" }),
            /* @__PURE__ */ jsxs("div", { className: "grid sm:grid-cols-2 gap-3", children: [
              /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-600", children: [
                "Project name",
                /* @__PURE__ */ jsx7(Input, { value: project.project_name || "", onChange: (e) => patchProject({ project_name: e.target.value }), className: "mt-1 h-[32px] text-[12px]" })
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-600", children: [
                "Client",
                /* @__PURE__ */ jsx7(Input, { value: project.client_name || "", onChange: (e) => patchProject({ client_name: e.target.value }), disabled: !!estimateId, className: "mt-1 h-[32px] text-[12px]" })
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-600", children: [
                "Estimate number",
                /* @__PURE__ */ jsx7(Input, { value: project.estimate_number || "", onChange: (e) => patchProject({ estimate_number: e.target.value }), disabled: !!estimateId, className: "mt-1 h-[32px] text-[12px]" })
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-600", children: [
                "Paint application supplies / sq ft / color",
                /* @__PURE__ */ jsx7(
                  Input,
                  {
                    type: "number",
                    step: "0.01",
                    min: "0",
                    value: project.paint_supplies_per_sqft ?? "",
                    onChange: (e) => patchProject({ paint_supplies_per_sqft: paintDraftValue(e.target.value) }),
                    "aria-invalid": hasIssueFor(allIssues, "paint_supplies_per_sqft") || void 0,
                    "aria-describedby": hasIssueFor(allIssues, "paint_supplies_per_sqft") ? "paint-pricing-issues" : void 0,
                    className: "mt-1 h-[32px] text-[12px]"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("label", { className: "block text-[11px] text-gray-600 mt-3", children: [
              "Notes",
              /* @__PURE__ */ jsx7(Textarea, { value: project.notes || "", onChange: (e) => patchProject({ notes: e.target.value }), className: "mt-1 min-h-[70px] text-[12px]" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("section", { className: "bg-white border border-gray-200 rounded-md", children: [
            /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx7("div", { className: "text-[12px] font-bold text-gray-800", children: "Paint Items" }),
                /* @__PURE__ */ jsx7("div", { className: "text-[10px] text-gray-500", children: "Geometry drives paintable area; colors drive paint, mask and labor." })
              ] }),
              /* @__PURE__ */ jsxs(Button, { onClick: addItem, variant: "outline", className: "h-[30px] px-3 text-[11px]", children: [
                /* @__PURE__ */ jsx7(Plus, { className: "w-3.5 h-3.5 mr-1" }),
                " Add Item"
              ] })
            ] }),
            (project.items || []).length === 0 ? /* @__PURE__ */ jsx7("div", { className: "py-12 text-center text-[12px] text-gray-400", children: "No paint items yet." }) : /* @__PURE__ */ jsx7("div", { className: "divide-y divide-gray-100", children: project.items.map((rawItem, index) => {
              const item = calculated.items[index] || rawItem;
              const lettering = rawItem.item_type === "lettering";
              const rowIssues = itemIssues(index);
              const rowIssuesId = `paint-item-${index}-issues`;
              const fieldFlag = (field) => hasIssueFor(allIssues, field, index) || void 0;
              const fieldDesc = (field) => hasIssueFor(allIssues, field, index) ? rowIssuesId : void 0;
              return /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx7("span", { className: "w-6 h-6 rounded bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold", children: index + 1 }),
                  /* @__PURE__ */ jsx7(Input, { "data-item-desc": index, value: rawItem.description || "", onChange: (e) => patchItem(index, { description: e.target.value }), placeholder: "Item description", className: "h-[30px] text-[12px] flex-1" }),
                  /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => removeItem(index), className: "w-8 h-8 inline-flex items-center justify-center rounded text-red-500 hover:bg-red-50", "aria-label": "Remove item", children: /* @__PURE__ */ jsx7(Trash2, { className: "w-4 h-4" }) })
                ] }),
                !lettering && /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [
                  /* @__PURE__ */ jsx7("span", { className: "text-[9px] font-bold tracking-wide text-gray-400", children: "SURFACE PRESETS" }),
                  [["4\u2032\xD78\u2032 face", 48, 96], ["8\u2032\xD74\u2032 face", 96, 48], ["2\u2032\xD74\u2032 face", 24, 48], ["4\u2032\xD74\u2032 face", 48, 48]].map(([label, l, w]) => /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => patchItem(index, { length: l, width: w }, { autoMask: true }), className: "px-2 h-[24px] rounded border border-gray-300 text-[10px] text-gray-600 hover:bg-gray-50", children: label }, label))
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5", children: [
                  /* @__PURE__ */ jsx7(Field, { label: "Type", children: /* @__PURE__ */ jsxs(Select, { value: rawItem.item_type || "panel", onValueChange: (value) => patchItem(index, { item_type: value }, { autoMask: true }), children: [
                    /* @__PURE__ */ jsx7(
                      SelectTrigger,
                      {
                        className: "h-[30px] text-[11px]",
                        "aria-invalid": fieldFlag("item_type"),
                        "aria-describedby": fieldDesc("item_type"),
                        children: /* @__PURE__ */ jsx7(SelectValue, {})
                      }
                    ),
                    /* @__PURE__ */ jsxs(SelectContent, { children: [
                      /* @__PURE__ */ jsx7(SelectItem, { value: "panel", children: "Panel" }),
                      /* @__PURE__ */ jsx7(SelectItem, { value: "lettering", children: "Lettering" }),
                      /* @__PURE__ */ jsx7(SelectItem, { value: "complex_shapes", children: "Complex Shape" })
                    ] })
                  ] }) }),
                  /* @__PURE__ */ jsx7(Field, { label: "Thickness", children: /* @__PURE__ */ jsxs(Select, { value: rawItem.thickness || "1/2", onValueChange: (value) => patchItem(index, { thickness: value }, { autoMask: true }), children: [
                    /* @__PURE__ */ jsx7(
                      SelectTrigger,
                      {
                        className: "h-[30px] text-[11px]",
                        "aria-invalid": fieldFlag("thickness"),
                        "aria-describedby": fieldDesc("thickness"),
                        children: /* @__PURE__ */ jsx7(SelectValue, {})
                      }
                    ),
                    /* @__PURE__ */ jsx7(SelectContent, { children: PAINT_THICKNESSES.map((size) => /* @__PURE__ */ jsxs(SelectItem, { value: size, children: [
                      size,
                      '"'
                    ] }, size)) })
                  ] }) }),
                  /* @__PURE__ */ jsx7(Field, { label: lettering ? "Letter height (in)" : "Length (in)", children: /* @__PURE__ */ jsx7(
                    Input,
                    {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      value: rawItem[lettering ? "width" : "length"] ?? "",
                      onChange: (e) => patchItem(index, { [lettering ? "width" : "length"]: paintDraftValue(e.target.value) }, { autoMask: true }),
                      "aria-invalid": fieldFlag(lettering ? "width" : "length"),
                      "aria-describedby": fieldDesc(lettering ? "width" : "length"),
                      className: "h-[30px] text-[11px]"
                    }
                  ) }),
                  /* @__PURE__ */ jsx7(Field, { label: lettering ? "Number of letters" : "Width (in)", children: /* @__PURE__ */ jsx7(
                    Input,
                    {
                      type: "number",
                      min: "0",
                      step: lettering ? "1" : "0.01",
                      value: rawItem[lettering ? "length" : "width"] ?? "",
                      onChange: (e) => patchItem(index, { [lettering ? "length" : "width"]: paintDraftValue(e.target.value) }, { autoMask: true }),
                      "aria-invalid": fieldFlag(lettering ? "length" : "width"),
                      "aria-describedby": fieldDesc(lettering ? "length" : "width"),
                      className: "h-[30px] text-[11px]"
                    }
                  ) }),
                  !lettering && /* @__PURE__ */ jsx7(Field, { label: "Quantity", children: /* @__PURE__ */ jsx7(
                    Input,
                    {
                      type: "number",
                      min: "1",
                      step: "1",
                      value: rawItem.quantity ?? "",
                      onChange: (e) => patchItem(index, { quantity: paintDraftValue(e.target.value) }),
                      "aria-invalid": fieldFlag("quantity"),
                      "aria-describedby": fieldDesc("quantity"),
                      className: "h-[30px] text-[11px]"
                    }
                  ) }),
                  /* @__PURE__ */ jsx7(Field, { label: "Paint sides", children: /* @__PURE__ */ jsxs(Select, { value: rawItem.paint_sides || "one_side", onValueChange: (value) => patchItem(index, { paint_sides: value }), children: [
                    /* @__PURE__ */ jsx7(
                      SelectTrigger,
                      {
                        className: "h-[30px] text-[11px]",
                        "aria-invalid": fieldFlag("paint_sides"),
                        "aria-describedby": fieldDesc("paint_sides"),
                        children: /* @__PURE__ */ jsx7(SelectValue, {})
                      }
                    ),
                    /* @__PURE__ */ jsxs(SelectContent, { children: [
                      /* @__PURE__ */ jsx7(SelectItem, { value: "one_side", children: "One side + edges" }),
                      /* @__PURE__ */ jsx7(SelectItem, { value: "both_sides", children: "Both sides + edges" })
                    ] })
                  ] }) }),
                  rawItem.item_type === "complex_shapes" && /* @__PURE__ */ jsx7(Field, { label: "Edge complexity", children: /* @__PURE__ */ jsx7(
                    Input,
                    {
                      type: "number",
                      min: "0",
                      step: "0.1",
                      value: rawItem.edge_complexity_multiplier ?? "",
                      onChange: (e) => patchItem(index, { edge_complexity_multiplier: paintDraftValue(e.target.value) }),
                      "aria-invalid": fieldFlag("edge_complexity_multiplier"),
                      "aria-describedby": fieldDesc("edge_complexity_multiplier"),
                      className: "h-[30px] text-[11px]"
                    }
                  ) }),
                  /* @__PURE__ */ jsx7(Field, { label: "Paint mask sq ft", children: /* @__PURE__ */ jsx7(
                    Input,
                    {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      value: rawItem.paint_mask_sqft ?? "",
                      onChange: (e) => patchItem(index, { paint_mask_sqft: paintDraftValue(e.target.value) }),
                      "aria-invalid": fieldFlag("paint_mask_sqft"),
                      "aria-describedby": fieldDesc("paint_mask_sqft"),
                      className: "h-[30px] text-[11px]"
                    }
                  ) }),
                  /* @__PURE__ */ jsx7(Field, { label: "Item fixed waste (gal)", children: /* @__PURE__ */ jsx7(
                    Input,
                    {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      value: rawItem.fixed_waste_gallons ?? "",
                      onChange: (e) => patchItem(index, { fixed_waste_gallons: paintDraftValue(e.target.value) }),
                      "aria-invalid": fieldFlag("fixed_waste_gallons"),
                      "aria-describedby": fieldDesc("fixed_waste_gallons"),
                      className: "h-[30px] text-[11px]"
                    }
                  ) }),
                  /* @__PURE__ */ jsx7(Field, { label: "Base supplies", children: /* @__PURE__ */ jsx7(
                    Input,
                    {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      value: rawItem.base_supplies_cost ?? "",
                      onChange: (e) => patchItem(index, { base_supplies_cost: paintDraftValue(e.target.value) }),
                      "aria-invalid": fieldFlag("base_supplies_cost"),
                      "aria-describedby": fieldDesc("base_supplies_cost"),
                      className: "h-[30px] text-[11px]"
                    }
                  ) })
                ] }),
                rowIssues.length > 0 && /* @__PURE__ */ jsxs(
                  "div",
                  {
                    role: "status",
                    id: rowIssuesId,
                    className: "flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1",
                    children: [
                      /* @__PURE__ */ jsx7(AlertTriangle, { className: "w-3 h-3 mt-0.5 flex-shrink-0" }),
                      /* @__PURE__ */ jsx7("div", { className: "space-y-0.5", children: rowIssues.map((it, i) => /* @__PURE__ */ jsx7("div", { children: it.message }, i)) })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 border border-gray-100 rounded p-2.5", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                    /* @__PURE__ */ jsx7("div", { className: "text-[10px] font-bold uppercase tracking-wide text-gray-500", children: "Paint colors" }),
                    /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => addColor(index), className: "text-[10px] font-semibold text-sky-700 hover:text-sky-900", children: "+ Add color" })
                  ] }),
                  (rawItem.paint_colors || []).length === 0 ? /* @__PURE__ */ jsx7("div", { className: "text-[10px] text-gray-400", children: "No colors selected \u2014 no liquid paint is charged." }) : /* @__PURE__ */ jsx7("div", { className: "flex flex-wrap gap-2", children: (rawItem.paint_colors || []).map((color, colorIndex) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                    /* @__PURE__ */ jsx7(Input, { value: color || "", onChange: (e) => updateColor(index, colorIndex, e.target.value), placeholder: "PMS / color", className: "h-[28px] w-[145px] text-[11px]" }),
                    /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => removeColor(index, colorIndex), className: "w-6 h-6 rounded text-gray-400 hover:text-red-600 hover:bg-white", children: "\xD7" })
                  ] }, colorIndex)) })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px]", children: [
                  /* @__PURE__ */ jsx7(Metric, { label: "Paintable area", value: Number.isFinite(item.paintable_sqft) ? `${number(item.paintable_sqft)} sf` : "\u2014" }),
                  /* @__PURE__ */ jsx7(Metric, { label: "Paint mask", value: moneyOrHeld(item.supplies_cost) }),
                  /* @__PURE__ */ jsx7(Metric, { label: "Paint + supplies", value: moneyOrHeld(item.paint_cost) }),
                  /* @__PURE__ */ jsx7(Metric, { label: "Labor", value: moneyOrHeld(item.labor_cost) }),
                  /* @__PURE__ */ jsx7(Metric, { label: "Paint volume", value: Number.isFinite(item.paint_gallons) ? `${number(item.paint_gallons, 3)} gal` : "\u2014" })
                ] })
              ] }, rawItem.builder_item_id || index);
            }) })
          ] })
        ] }),
        /* @__PURE__ */ jsx7("aside", { className: "space-y-3", children: /* @__PURE__ */ jsxs("section", { className: "bg-white border border-gray-200 rounded-md sticky top-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-gray-200", children: [
            /* @__PURE__ */ jsx7("div", { className: "text-[12px] font-bold text-gray-800", children: "Cost Summary" }),
            /* @__PURE__ */ jsx7("div", { className: "text-[10px] text-gray-500", children: "Internal Builder cost before estimate-level markup." })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-2 text-[11px]", children: [
            pricingUnavailable && /* @__PURE__ */ jsx7("p", { className: "text-[11px] text-amber-800 mb-1", children: "Saved amounts (not current pricing) \u2014 fix the flagged values to reprice." }),
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Paint mask", value: moneyCell(Number.isFinite(totals.total_paint_mask_cost) ? totals.total_paint_mask_cost : project.total_paint_mask_cost) }),
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Liquid paint & supplies", value: moneyCell(Number.isFinite(totals.total_liquid_paint_and_supplies_cost) ? totals.total_liquid_paint_and_supplies_cost : project.total_liquid_paint_and_supplies_cost) }),
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Painting labor", value: moneyCell(Number.isFinite(totals.total_labor_cost) ? totals.total_labor_cost : project.total_labor_cost) }),
            /* @__PURE__ */ jsxs("div", { className: "border-t border-gray-200 pt-2 mt-2 flex justify-between items-center", children: [
              /* @__PURE__ */ jsx7("span", { className: "font-bold text-gray-800", children: "Total cost" }),
              /* @__PURE__ */ jsx7("span", { className: "text-[16px] font-bold text-gray-900", children: moneyCell(Number.isFinite(totals.total_cost) ? totals.total_cost : sumOrNull(project.total_paint_mask_cost, project.total_liquid_paint_and_supplies_cost, project.total_labor_cost)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 bg-gray-50 space-y-1.5 text-[10px] text-gray-500", children: [
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Paint needed", value: `${numCell(totals.total_paint_gallons, 3)} gal`, subtle: true }),
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Labor time", value: `${numCell(totals.total_labor_hours)} hr`, subtle: true }),
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Unique colors", value: numCell(totals.unique_color_count, 0), subtle: true }),
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Mixes", value: numCell(totals.number_of_mixes, 0), subtle: true }),
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Setup / cleanup", value: `${numCell(totals.setup_hours)} hr`, subtle: true }),
            /* @__PURE__ */ jsx7(SummaryRow, { label: "Mixing", value: `${numCell(totals.mixing_hours)} hr`, subtle: true })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-t border-gray-100 text-[10px] text-gray-500", children: [
            "Mixed paint rate: ",
            /* @__PURE__ */ jsx7("span", { className: "font-semibold text-gray-700", children: Number.isFinite(calculated.liquidPaintRate) ? `${money(calculated.liquidPaintRate)}/sf` : "\u2014" })
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsx7("div", { className: "mt-4", children: /* @__PURE__ */ jsx7(
        CustomerPricingTab_default,
        {
          project: {
            ...project,
            // Feed live totals so the categorizer sees current numbers. Held
            // values surface as 0 here — this tab is advisory only; the
            // blocked save keeps them from reaching the record.
            total_paint_mask_cost: totals.total_paint_mask_cost ?? 0,
            total_liquid_paint_and_supplies_cost: totals.total_liquid_paint_and_supplies_cost ?? 0,
            total_labor_cost: totals.total_labor_cost ?? 0
          },
          categorize: categorizePaintProject,
          accentColor: "blue",
          onApplyTier: (tier) => patchProject({
            customer_pricing: { ...project.customer_pricing || {}, applied: true, tier_number: tier }
          })
        }
      ) })
    ] }),
    /* @__PURE__ */ jsx7(
      ModuleTemplateDialog_default,
      {
        open: !!templateMode,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => patchProject(data),
        moduleKey: "painting",
        title: "Painting",
        buildTemplateData: buildPaintingTemplateData,
        describeTemplate: (t) => `${(t.project_data?.items || []).length} items`
      }
    )
  ] });
}
function moneyOrHeld(v) {
  return Number.isFinite(v) ? money(v) : "\u2014";
}
function Field({ label, children }) {
  return /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500 min-w-0", children: [
    /* @__PURE__ */ jsx7("span", { className: "block mb-1", children: label }),
    children
  ] });
}
function Metric({ label, value }) {
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-100 rounded px-2 py-1.5", children: [
    /* @__PURE__ */ jsx7("div", { className: "text-gray-400", children: label }),
    /* @__PURE__ */ jsx7("div", { className: "font-semibold text-gray-700 mt-0.5", children: value })
  ] });
}
function SummaryRow({ label, value, subtle = false }) {
  return /* @__PURE__ */ jsxs("div", { className: `flex items-center justify-between gap-3 ${subtle ? "text-gray-500" : "text-gray-600"}`, children: [
    /* @__PURE__ */ jsx7("span", { children: label }),
    /* @__PURE__ */ jsx7("span", { className: subtle ? "font-medium" : "font-semibold text-gray-800", children: value })
  ] });
}
export {
  PaintingEstimator as Page
};
