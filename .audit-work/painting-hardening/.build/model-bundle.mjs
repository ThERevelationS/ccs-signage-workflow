var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .audit-work/painting-hardening/remote-src/src/components/estimator/paint/paintCalc.js
var paintCalc_exports = {};
__export(paintCalc_exports, {
  PAINT_THICKNESSES: () => PAINT_THICKNESSES,
  autoPaintMaskSqft: () => autoPaintMaskSqft,
  calculatePaintingItem: () => calculatePaintingItem,
  calculatePaintingProject: () => calculatePaintingProject,
  laborTierMultiplier: () => laborTierMultiplier,
  liquidPaintRatePerSqft: () => liquidPaintRatePerSqft,
  normalizePaintingItem: () => normalizePaintingItem,
  parseImperialFraction: () => parseImperialFraction
});
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
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
  if (typeof value !== "string") return num(value);
  let text = value.trim();
  if (!text) return 0;
  let total = 0;
  const wholeAndFraction = text.split("-");
  if (wholeAndFraction.length === 2) {
    total += num(wholeAndFraction[0]);
    text = wholeAndFraction[1];
  } else {
    text = wholeAndFraction[0];
  }
  const parts = text.split("/");
  if (parts.length === 2) {
    const denominator = num(parts[1]);
    if (denominator) total += num(parts[0]) / denominator;
  } else {
    total += num(text);
  }
  return total;
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
  const qty = num(quantity, 1);
  const tier = tiers.find((row) => qty >= num(row.min_quantity) && qty <= num(row.max_quantity));
  return tier ? num(tier.labor_multiplier, 1) : 1;
}
function costPerGallon(cost, unit) {
  const unitFactors = { oz: 128, pint: 8, quart: 4, liter: 3.78541, gallon: 1 };
  const factor = unitFactors[unit];
  return factor ? num(cost) * factor : 0;
}
function liquidPaintRatePerSqft(settings = {}) {
  const paintCost = costPerGallon(settings.paint_cost_per_unit, settings.paint_unit);
  const hardenerCost = costPerGallon(settings.hardener_cost_per_unit, settings.hardener_unit);
  const reducerCost = costPerGallon(settings.reducer_cost_per_unit, settings.reducer_unit);
  const paintRatio = num(settings.paint_mix_ratio, 3) || 3;
  const hardenerRatio = num(settings.hardener_mix_ratio, 1) || 1;
  const reducerRatio = num(settings.reducer_mix_ratio, 1) || 1;
  const totalRatio = paintRatio + hardenerRatio + reducerRatio;
  const mixCost = totalRatio > 0 ? paintCost / totalRatio * paintRatio + hardenerCost / totalRatio * hardenerRatio + reducerCost / totalRatio * reducerRatio : 0;
  const coverage = num(settings.mixed_paint_coverage_sqft_per_gallon, 1) || 1;
  return coverage > 0 ? mixCost / coverage : 0;
}
function autoPaintMaskSqft(item = {}) {
  if (!(num(item.length) > 0 && num(item.width) > 0)) return 0;
  let faceArea = 0;
  if (item.item_type === "lettering") {
    const letterHeight = num(item.width);
    const letterCount = num(item.length);
    faceArea = letterHeight ** 2 * 0.8 * letterCount / 144;
  } else {
    faceArea = num(item.length) * num(item.width) / 144;
  }
  return item.paint_sides === "both_sides" ? faceArea * 2 : faceArea;
}
function normalizePaintingItem(item = {}) {
  return {
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
    ...item,
    paint_colors: Array.isArray(item.paint_colors) ? item.paint_colors : [],
    paint_sides: item.paint_sides === "none" ? "one_side" : item.paint_sides || "one_side"
  };
}
function calculatePaintingItem(rawItem, settings = {}, liquidRate = 0, projectPaintSuppliesRate = 0) {
  const item = normalizePaintingItem(rawItem);
  const perimFactor = num(settings.letter_perimeter_factor, 3.5) || 3.5;
  const thickness = parseImperialFraction(item.thickness);
  let paintableSqFt = 0;
  if (item.item_type === "panel" && num(item.length) > 0 && num(item.width) > 0) {
    const faceArea = num(item.length) * num(item.width) / 144;
    const perimeterInches = 2 * (num(item.length) + num(item.width));
    const edgeArea = thickness > 0 ? perimeterInches * thickness / 144 : 0;
    paintableSqFt = item.paint_sides === "both_sides" ? faceArea * 2 + edgeArea : faceArea + edgeArea;
  } else if (item.item_type === "lettering" && num(item.width) > 0 && num(item.length) > 0 && thickness > 0) {
    const letterHeight = num(item.width);
    const letterCount = num(item.length);
    const faceArea = letterHeight ** 2 * 0.8 * letterCount / 144;
    const perimeterInches = letterHeight * perimFactor * letterCount;
    const edgeArea = perimeterInches * thickness / 144;
    paintableSqFt = item.paint_sides === "both_sides" ? faceArea * 2 + edgeArea : faceArea + edgeArea;
  } else if (item.item_type === "complex_shapes" && num(item.length) > 0 && num(item.width) > 0 && thickness > 0) {
    const faceArea = num(item.length) * num(item.width) / 144;
    const perimeterInches = 2 * (num(item.length) + num(item.width));
    const edgeArea = perimeterInches * thickness * num(item.edge_complexity_multiplier, 1) / 144;
    paintableSqFt = item.paint_sides === "both_sides" ? faceArea * 2 + edgeArea : faceArea + edgeArea;
  }
  const paintMaskMaterialRate = num(settings.paint_mask_rate_per_sqft, 0.75) || 0.75;
  const paintMaskMachineRate = num(settings.paint_mask_machine_cutting_rate_per_sqft, 0.1) || 0.1;
  const numColors = (item.paint_colors || []).length;
  let paintMaskCost = 0;
  if (numColors > 1 && num(item.paint_mask_sqft) > 0) {
    paintMaskCost = num(item.paint_mask_sqft) * (paintMaskMaterialRate + paintMaskMachineRate) * (numColors - 1);
  }
  let liquidPaintCost = 0;
  let paintApplicationSuppliesCost = 0;
  let paintGallons = 0;
  if (numColors > 0) {
    const wasteMultiplier = num(settings.paint_waste_multiplier, 1.25) || 1.25;
    const coverage2 = num(settings.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
    paintApplicationSuppliesCost = paintableSqFt * num(projectPaintSuppliesRate) * numColors;
    if (liquidRate > 0) liquidPaintCost = paintableSqFt * liquidRate * wasteMultiplier * numColors;
    paintGallons = paintableSqFt * wasteMultiplier * numColors / coverage2;
  }
  const itemFixedWasteGallons = num(item.fixed_waste_gallons);
  paintGallons += itemFixedWasteGallons;
  const coverage = num(settings.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
  liquidPaintCost += itemFixedWasteGallons * liquidRate * coverage;
  const liquidPaintAndSuppliesCost = paintApplicationSuppliesCost + liquidPaintCost + num(item.base_supplies_cost);
  const laborRate = num(settings.default_labor_rate, 60) || 60;
  const baseHoursPerSqFt = num(settings.base_labor_hours_per_sqft, 0.05) || 0.05;
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
    simple: num(settings.simple_complexity_multiplier, 0.7) || 0.7,
    moderate: num(settings.moderate_complexity_multiplier, 1) || 1,
    complex: num(settings.complex_complexity_multiplier, 1.5) || 1.5
  };
  const paintMultipliers = {
    one_side: num(settings.one_side_paint_multiplier, 0.8) || 0.8,
    both_sides: num(settings.both_sides_paint_multiplier, 1) || 1
  };
  const additionalColorMultiplier = num(settings.additional_color_multiplier, 0.3) || 0.3;
  let baseHours = paintableSqFt * baseHoursPerSqFt * (complexityMultipliers[itemComplexity] || 1) * (paintMultipliers[item.paint_sides] || 1);
  if (numColors > 1) baseHours *= 1 + (numColors - 1) * additionalColorMultiplier;
  const maskApplicationLaborRate = num(settings.paint_mask_application_labor_rate_per_sqft, 0.25) || 0.25;
  const maskCuttingLaborRate = num(settings.paint_mask_cutting_labor_rate_per_sqft, 0.15) || 0.15;
  if (numColors > 1 && num(item.paint_mask_sqft) > 0) {
    baseHours += num(item.paint_mask_sqft) * maskApplicationLaborRate * (numColors - 1) / laborRate + num(item.paint_mask_sqft) * maskCuttingLaborRate * (numColors - 1) / laborRate;
  }
  const qty = item.item_type === "lettering" ? 1 : Math.max(num(item.quantity, 1), 1);
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
  const projectSuppliesRate = num(
    project.paint_supplies_per_sqft,
    num(settings.default_paint_supplies_per_sqft, 1.25) || 1.25
  );
  const items = (project.items || []).map((item) => calculatePaintingItem(item, settings, liquidRate, projectSuppliesRate));
  const totalPaintMask = items.reduce((sum, item) => sum + num(item.supplies_cost), 0);
  let totalLiquidPaintAndSupplies = items.reduce((sum, item) => sum + num(item.paint_cost), 0);
  const totalItemLaborCost = items.reduce((sum, item) => sum + num(item.labor_cost), 0);
  let totalPaintGallons = items.reduce((sum, item) => sum + num(item.paint_gallons), 0);
  const globalFixedWasteGallons = num(settings.fixed_paint_waste_gallons);
  totalPaintGallons += globalFixedWasteGallons;
  const coverage = num(settings.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
  totalLiquidPaintAndSupplies += globalFixedWasteGallons * liquidRate * coverage;
  const itemFixedWaste = items.reduce((sum, item) => sum + num(item.fixed_waste_gallons), 0);
  const numberOfMixes = Math.ceil(totalPaintGallons);
  const mixingHours = numberOfMixes * (num(settings.paint_mixing_labor_hours, 0.25) || 0.25);
  const setupHours = num(settings.setup_time_labor_hours, 0.5) || 0.5;
  const uniqueColors = /* @__PURE__ */ new Set();
  items.forEach((item) => (item.paint_colors || []).forEach((color) => {
    const normalized = String(color || "").trim().toLowerCase();
    if (normalized) uniqueColors.add(normalized);
  }));
  const uniqueColorCount = uniqueColors.size;
  const totalColorChangeHours = uniqueColorCount > 1 ? (uniqueColorCount - 1) * (num(settings.color_change_setup_hours, 0.25) || 0.25) : 0;
  const totalPaintGunCleaningHours = uniqueColorCount > 0 ? uniqueColorCount * (num(settings.paint_gun_cleaning_hours, 0.15) || 0.15) : 0;
  const laborRate = num(settings.default_labor_rate, 60) || 60;
  const fixedLaborCost = (mixingHours + setupHours + totalColorChangeHours + totalPaintGunCleaningHours) * laborRate;
  let totalLabor = totalItemLaborCost + fixedLaborCost;
  const totalLaborHours = items.reduce((sum, item) => sum + num(item.labor_hours), 0) + mixingHours + setupHours + totalColorChangeHours + totalPaintGunCleaningHours;
  const minLaborHours = num(settings.min_labor_hours);
  const minPaintCost = num(settings.min_paint_cost);
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

// .audit-work/painting-hardening/frozen-src/components/estimator/paint/paintCalc.js
var paintCalc_exports2 = {};
__export(paintCalc_exports2, {
  PAINT_THICKNESSES: () => PAINT_THICKNESSES2,
  autoPaintMaskSqft: () => autoPaintMaskSqft2,
  calculatePaintingItem: () => calculatePaintingItem2,
  calculatePaintingProject: () => calculatePaintingProject2,
  laborTierMultiplier: () => laborTierMultiplier2,
  liquidPaintRatePerSqft: () => liquidPaintRatePerSqft2,
  normalizePaintingItem: () => normalizePaintingItem2,
  paintSettingNumber: () => paintSettingNumber,
  paintSettingRecorded: () => paintSettingRecorded,
  paintStrictNumber: () => paintStrictNumber,
  paintThicknessNumber: () => paintThicknessNumber,
  parseImperialFraction: () => parseImperialFraction2
});
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
var PAINT_THICKNESSES2 = [
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
function parseImperialFraction2(value) {
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
function parseTiers2(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function laborTierMultiplier2(settings, itemType, quantity) {
  const settingKey = itemType === "panel" ? "panel_labor_tiers" : itemType === "complex_shapes" ? "complex_shapes_labor_tiers" : itemType === "lettering" ? "lettering_labor_tiers" : "";
  if (!settingKey) return 1;
  const tiers = parseTiers2(settings?.[settingKey]);
  const qty = num2(quantity, 1);
  const tier = tiers.find((row) => qty >= num2(row.min_quantity) && qty <= num2(row.max_quantity));
  return tier ? num2(tier.labor_multiplier, 1) : 1;
}
function costPerGallon2(cost, unit) {
  const unitFactors = { oz: 128, pint: 8, quart: 4, liter: 3.78541, gallon: 1 };
  const factor = unitFactors[unit];
  return factor ? num2(cost) * factor : 0;
}
function liquidPaintRatePerSqft2(settings = {}) {
  const paintCost = costPerGallon2(paintSettingNumber(settings, "paint_cost_per_unit", 0), settings.paint_unit);
  const hardenerCost = costPerGallon2(paintSettingNumber(settings, "hardener_cost_per_unit", 0), settings.hardener_unit);
  const reducerCost = costPerGallon2(paintSettingNumber(settings, "reducer_cost_per_unit", 0), settings.reducer_unit);
  const paintRatio = paintSettingNumber(settings, "paint_mix_ratio", 3, { positive: true });
  const hardenerRatio = paintSettingNumber(settings, "hardener_mix_ratio", 1);
  const reducerRatio = paintSettingNumber(settings, "reducer_mix_ratio", 1);
  const totalRatio = paintRatio + hardenerRatio + reducerRatio;
  const mixCost = totalRatio > 0 ? paintCost / totalRatio * paintRatio + hardenerCost / totalRatio * hardenerRatio + reducerCost / totalRatio * reducerRatio : 0;
  const coverage = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
  return coverage > 0 ? mixCost / coverage : 0;
}
function autoPaintMaskSqft2(item = {}) {
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
function normalizePaintingItem2(item = {}) {
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
function calculatePaintingItem2(rawItem, settings = {}, liquidRate = 0, projectPaintSuppliesRate = 0) {
  const item = normalizePaintingItem2(rawItem);
  const perimFactor = paintSettingNumber(settings, "letter_perimeter_factor", 3.5, { positive: true });
  const thickness = parseImperialFraction2(item.thickness);
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
  const discountedLaborHours = baseHours * laborTierMultiplier2(settings, item.item_type, qty);
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
function calculatePaintingProject2(project = {}, settings = {}) {
  const liquidRate = liquidPaintRatePerSqft2(settings);
  const projectSuppliesRate = paintSettingNumber(
    project,
    "paint_supplies_per_sqft",
    paintSettingNumber(settings, "default_paint_supplies_per_sqft", 1.25)
  );
  const items = (project.items || []).map((item) => calculatePaintingItem2(item, settings, liquidRate, projectSuppliesRate));
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

// .audit-work/painting-hardening/frozen-src/components/estimator/paint/paintPricingAvailability.js
var paintPricingAvailability_exports = {};
__export(paintPricingAvailability_exports, {
  calcPaintingProject: () => calcPaintingProject,
  hasIssueFor: () => hasIssueFor,
  hasPaintCostSnapshot: () => hasPaintCostSnapshot,
  issuesForField: () => issuesForField,
  paintDraftValue: () => paintDraftValue,
  paintItemIssues: () => paintItemIssues,
  paintProjectInputIssues: () => paintProjectInputIssues,
  paintSettingIssues: () => paintSettingIssues
});
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
  const calc = calculatePaintingProject2(calcable, settings);
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
export {
  paintPricingAvailability_exports as avail,
  paintCalc_exports2 as cand,
  paintCalc_exports as remote
};
