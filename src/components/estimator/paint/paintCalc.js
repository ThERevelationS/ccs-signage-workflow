const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const PAINT_THICKNESSES = [
  "1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8", "1",
  "1-1/8", "1-1/4", "1-3/8", "1-1/2", "1-5/8", "1-3/4", "1-7/8", "2",
  "2-1/4", "2-1/2", "2-3/4", "3", "3-1/4", "3-1/2", "3-3/4", "4",
];

export function parseImperialFraction(value) {
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

export function laborTierMultiplier(settings, itemType, quantity) {
  const settingKey = itemType === "panel"
    ? "panel_labor_tiers"
    : itemType === "complex_shapes"
      ? "complex_shapes_labor_tiers"
      : itemType === "lettering"
        ? "lettering_labor_tiers"
        : "";
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

export function liquidPaintRatePerSqft(settings = {}) {
  const paintCost = costPerGallon(settings.paint_cost_per_unit, settings.paint_unit);
  const hardenerCost = costPerGallon(settings.hardener_cost_per_unit, settings.hardener_unit);
  const reducerCost = costPerGallon(settings.reducer_cost_per_unit, settings.reducer_unit);
  const paintRatio = num(settings.paint_mix_ratio, 3) || 3;
  const hardenerRatio = num(settings.hardener_mix_ratio, 1) || 1;
  const reducerRatio = num(settings.reducer_mix_ratio, 1) || 1;
  const totalRatio = paintRatio + hardenerRatio + reducerRatio;
  const mixCost = totalRatio > 0
    ? (paintCost / totalRatio * paintRatio) + (hardenerCost / totalRatio * hardenerRatio) + (reducerCost / totalRatio * reducerRatio)
    : 0;
  const coverage = num(settings.mixed_paint_coverage_sqft_per_gallon, 1) || 1;
  return coverage > 0 ? mixCost / coverage : 0;
}

export function autoPaintMaskSqft(item = {}) {
  if (!(num(item.length) > 0 && num(item.width) > 0)) return 0;
  let faceArea = 0;
  if (item.item_type === "lettering") {
    const letterHeight = num(item.width);
    const letterCount = num(item.length);
    faceArea = (letterHeight ** 2 * 0.8 * letterCount) / 144;
  } else {
    faceArea = num(item.length) * num(item.width) / 144;
  }
  return item.paint_sides === "both_sides" ? faceArea * 2 : faceArea;
}

export function normalizePaintingItem(item = {}) {
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
    paint_sides: item.paint_sides === "none" ? "one_side" : (item.paint_sides || "one_side"),
  };
}

export function calculatePaintingItem(rawItem, settings = {}, liquidRate = 0, projectPaintSuppliesRate = 0) {
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
    const faceArea = (letterHeight ** 2 * 0.8 * letterCount) / 144;
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
  const paintMaskMachineRate = num(settings.paint_mask_machine_cutting_rate_per_sqft, 0.10) || 0.10;
  const colors = (item.paint_colors || []).filter((color) => String(color || "").trim());
  const numColors = colors.length;
  let paintMaskCost = 0;
  if (numColors > 1 && num(item.paint_mask_sqft) > 0) {
    paintMaskCost = num(item.paint_mask_sqft) * (paintMaskMaterialRate + paintMaskMachineRate) * (numColors - 1);
  }

  let liquidPaintCost = 0;
  let paintApplicationSuppliesCost = 0;
  let paintGallons = 0;
  if (numColors > 0) {
    const wasteMultiplier = num(settings.paint_waste_multiplier, 1.25) || 1.25;
    const coverage = num(settings.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
    paintApplicationSuppliesCost = paintableSqFt * num(projectPaintSuppliesRate) * numColors;
    if (liquidRate > 0) liquidPaintCost = paintableSqFt * liquidRate * wasteMultiplier * numColors;
    paintGallons = paintableSqFt * wasteMultiplier * numColors / coverage;
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
    extra_large: "simple",
  };
  const itemComplexity = item.item_type === "lettering" ? complexityMap[item.letter_size] || "moderate" : "moderate";
  const complexityMultipliers = {
    simple: num(settings.simple_complexity_multiplier, 0.7) || 0.7,
    moderate: num(settings.moderate_complexity_multiplier, 1) || 1,
    complex: num(settings.complex_complexity_multiplier, 1.5) || 1.5,
  };
  const paintMultipliers = {
    one_side: num(settings.one_side_paint_multiplier, 0.8) || 0.8,
    both_sides: num(settings.both_sides_paint_multiplier, 1) || 1,
  };
  const additionalColorMultiplier = num(settings.additional_color_multiplier, 0.3) || 0.3;

  let baseHours = paintableSqFt * baseHoursPerSqFt * (complexityMultipliers[itemComplexity] || 1) * (paintMultipliers[item.paint_sides] || 1);
  if (numColors > 1) baseHours *= 1 + (numColors - 1) * additionalColorMultiplier;

  const maskApplicationLaborRate = num(settings.paint_mask_application_labor_rate_per_sqft, 0.25) || 0.25;
  const maskCuttingLaborRate = num(settings.paint_mask_cutting_labor_rate_per_sqft, 0.15) || 0.15;
  if (numColors > 1 && num(item.paint_mask_sqft) > 0) {
    baseHours += (num(item.paint_mask_sqft) * maskApplicationLaborRate * (numColors - 1) / laborRate)
      + (num(item.paint_mask_sqft) * maskCuttingLaborRate * (numColors - 1) / laborRate);
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
    paintable_sqft: paintableSqFt,
  };
}

export function calculatePaintingProject(project = {}, settings = {}) {
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

  const uniqueColors = new Set();
  items.forEach((item) => (item.paint_colors || []).forEach((color) => {
    const normalized = String(color || "").trim().toLowerCase();
    if (normalized) uniqueColors.add(normalized);
  }));
  const uniqueColorCount = uniqueColors.size;
  const totalColorChangeHours = uniqueColorCount > 1
    ? (uniqueColorCount - 1) * (num(settings.color_change_setup_hours, 0.25) || 0.25)
    : 0;
  const totalPaintGunCleaningHours = uniqueColorCount > 0
    ? uniqueColorCount * (num(settings.paint_gun_cleaning_hours, 0.15) || 0.15)
    : 0;
  const laborRate = num(settings.default_labor_rate, 60) || 60;
  const fixedLaborCost = (mixingHours + setupHours + totalColorChangeHours + totalPaintGunCleaningHours) * laborRate;
  let totalLabor = totalItemLaborCost + fixedLaborCost;
  const totalLaborHours = items.reduce((sum, item) => sum + num(item.labor_hours), 0)
    + mixingHours + setupHours + totalColorChangeHours + totalPaintGunCleaningHours;

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
      total_cost: totalCost,
    },
  };
}
