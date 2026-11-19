const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// ---------- strict priced-input resolution (pricing-availability hardening) --
// Finite number or null. Accepts real numbers and trimmed numeric strings;
// rejects "", "abc", Infinity, NaN, hex/octal strings, null, undefined, objects.
// `Number()` alone would accept "0x10" → 16 and launder it silently.
export const paintStrictNumber = (v) => {
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

// A Settings value that was actually recorded — absent rows/blank text fall
// back to the module default by design (see moduleSettingDefaults).
export const paintSettingRecorded = (settings, key) => {
  const v = settings?.[key];
  return v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");
};

// Strict settings read: a recorded finite value is honored verbatim — an
// explicit 0 stays 0 where the key allows it (the old `num(x,d)||d` revived
// the default and made a deliberate $0 impossible). Absent/blank/malformed or
// out-of-range values resolve the fallback exactly like before; the
// availability layer flags every recorded-but-unusable value separately.
//   positive: true  → value must be > 0 (coverage, ratios that are the paint
//                     itself, waste multiplier, letter perimeter factor)
//   positive: false → value must be >= 0 (rates, multipliers, hours, floors,
//                     costs — an explicit 0 is a legitimate free/zero amount)
export const paintSettingNumber = (settings, key, fallback, { positive = false } = {}) => {
  if (!paintSettingRecorded(settings, key)) return fallback;
  const n = paintStrictNumber(settings[key]);
  if (n === null) return fallback;
  if (positive ? n <= 0 : n < 0) return fallback;
  return n;
};

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

// Strict sibling of parseImperialFraction — same grammar ("a", "a/b",
// "a-b/c"), but malformed text resolves null instead of silently 0 so the
// availability layer can flag it ("-1" laundered to +1 and "1/0" to 0 before).
export function paintThicknessNumber(value) {
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
  const paintCost = costPerGallon(paintSettingNumber(settings, "paint_cost_per_unit", 0), settings.paint_unit);
  const hardenerCost = costPerGallon(paintSettingNumber(settings, "hardener_cost_per_unit", 0), settings.hardener_unit);
  const reducerCost = costPerGallon(paintSettingNumber(settings, "reducer_cost_per_unit", 0), settings.reducer_unit);
  const paintRatio = paintSettingNumber(settings, "paint_mix_ratio", 3, { positive: true });
  const hardenerRatio = paintSettingNumber(settings, "hardener_mix_ratio", 1);
  const reducerRatio = paintSettingNumber(settings, "reducer_mix_ratio", 1);
  const totalRatio = paintRatio + hardenerRatio + reducerRatio;
  const mixCost = totalRatio > 0
    ? (paintCost / totalRatio * paintRatio) + (hardenerCost / totalRatio * hardenerRatio) + (reducerCost / totalRatio * reducerRatio)
    : 0;
  // Coverage defaults to the canonical 350 sq ft/gal here too — the old ||1
  // fallback priced mixCost/1 (≈350x too high) when the setting was unset.
  const coverage = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
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
  // Remote expressed the post-spread normalization as duplicate literal keys
  // (last wins). Post-construction assignment keeps the same semantics, the
  // same key order, and a warning-free bundle.
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
    ...item,
  };
  normalized.paint_colors = Array.isArray(item.paint_colors) ? item.paint_colors : [];
  normalized.paint_sides = item.paint_sides === "none" ? "one_side" : (item.paint_sides || "one_side");
  return normalized;
}

export function calculatePaintingItem(rawItem, settings = {}, liquidRate = 0, projectPaintSuppliesRate = 0) {
  const item = normalizePaintingItem(rawItem);
  const perimFactor = paintSettingNumber(settings, "letter_perimeter_factor", 3.5, { positive: true });
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

  const paintMaskMaterialRate = paintSettingNumber(settings, "paint_mask_rate_per_sqft", 0.75);
  const paintMaskMachineRate = paintSettingNumber(settings, "paint_mask_machine_cutting_rate_per_sqft", 0.10);
  // Preserve SignEstimate Pro behavior exactly: item cost math uses the stored
  // color-array length. Blank entries are only removed when the project is saved.
  const numColors = (item.paint_colors || []).length;
  let paintMaskCost = 0;
  if (numColors > 1 && num(item.paint_mask_sqft) > 0) {
    paintMaskCost = num(item.paint_mask_sqft) * (paintMaskMaterialRate + paintMaskMachineRate) * (numColors - 1);
  }

  let liquidPaintCost = 0;
  let paintApplicationSuppliesCost = 0;
  let paintGallons = 0;
  if (numColors > 0) {
    const wasteMultiplier = paintSettingNumber(settings, "paint_waste_multiplier", 1.25, { positive: true });
    const coverage = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
    paintApplicationSuppliesCost = paintableSqFt * num(projectPaintSuppliesRate) * numColors;
    if (liquidRate > 0) liquidPaintCost = paintableSqFt * liquidRate * wasteMultiplier * numColors;
    paintGallons = paintableSqFt * wasteMultiplier * numColors / coverage;
  }

  const itemFixedWasteGallons = num(item.fixed_waste_gallons);
  paintGallons += itemFixedWasteGallons;
  const coverage = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
  liquidPaintCost += itemFixedWasteGallons * liquidRate * coverage;
  const liquidPaintAndSuppliesCost = paintApplicationSuppliesCost + liquidPaintCost + num(item.base_supplies_cost);

  // Positive-required: the mask-labor terms below divide by this rate, so an
  // explicit 0 can never mean "free labor" here — it resolves the default and
  // the availability layer flags it.
  const laborRate = paintSettingNumber(settings, "default_labor_rate", 60, { positive: true });
  const baseHoursPerSqFt = paintSettingNumber(settings, "base_labor_hours_per_sqft", 0.05);
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
    simple: paintSettingNumber(settings, "simple_complexity_multiplier", 0.7),
    moderate: paintSettingNumber(settings, "moderate_complexity_multiplier", 1),
    complex: paintSettingNumber(settings, "complex_complexity_multiplier", 1.5),
  };
  const paintMultipliers = {
    one_side: paintSettingNumber(settings, "one_side_paint_multiplier", 0.8),
    both_sides: paintSettingNumber(settings, "both_sides_paint_multiplier", 1),
  };
  const additionalColorMultiplier = paintSettingNumber(settings, "additional_color_multiplier", 0.3);

  let baseHours = paintableSqFt * baseHoursPerSqFt * (complexityMultipliers[itemComplexity] || 1) * (paintMultipliers[item.paint_sides] || 1);
  if (numColors > 1) baseHours *= 1 + (numColors - 1) * additionalColorMultiplier;

  const maskApplicationLaborRate = paintSettingNumber(settings, "paint_mask_application_labor_rate_per_sqft", 0.25);
  const maskCuttingLaborRate = paintSettingNumber(settings, "paint_mask_cutting_labor_rate_per_sqft", 0.15);
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
  const projectSuppliesRate = paintSettingNumber(
    project,
    "paint_supplies_per_sqft",
    paintSettingNumber(settings, "default_paint_supplies_per_sqft", 1.25)
  );
  const items = (project.items || []).map((item) => calculatePaintingItem(item, settings, liquidRate, projectSuppliesRate));

  const totalPaintMask = items.reduce((sum, item) => sum + num(item.supplies_cost), 0);
  let totalLiquidPaintAndSupplies = items.reduce((sum, item) => sum + num(item.paint_cost), 0);
  const totalItemLaborCost = items.reduce((sum, item) => sum + num(item.labor_cost), 0);
  let totalPaintGallons = items.reduce((sum, item) => sum + num(item.paint_gallons), 0);

  const globalFixedWasteGallons = paintSettingNumber(settings, "fixed_paint_waste_gallons", 0);
  totalPaintGallons += globalFixedWasteGallons;
  const coverage = paintSettingNumber(settings, "mixed_paint_coverage_sqft_per_gallon", 350, { positive: true });
  totalLiquidPaintAndSupplies += globalFixedWasteGallons * liquidRate * coverage;

  const itemFixedWaste = items.reduce((sum, item) => sum + num(item.fixed_waste_gallons), 0);
  const numberOfMixes = Math.ceil(totalPaintGallons);
  const mixingHours = numberOfMixes * paintSettingNumber(settings, "paint_mixing_labor_hours", 0.25);
  const setupHours = paintSettingNumber(settings, "setup_time_labor_hours", 0.5);

  const uniqueColors = new Set();
  items.forEach((item) => (item.paint_colors || []).forEach((color) => {
    const normalized = String(color || "").trim().toLowerCase();
    if (normalized) uniqueColors.add(normalized);
  }));
  const uniqueColorCount = uniqueColors.size;
  const totalColorChangeHours = uniqueColorCount > 1
    ? (uniqueColorCount - 1) * paintSettingNumber(settings, "color_change_setup_hours", 0.25)
    : 0;
  const totalPaintGunCleaningHours = uniqueColorCount > 0
    ? uniqueColorCount * paintSettingNumber(settings, "paint_gun_cleaning_hours", 0.15)
    : 0;
  const laborRate = paintSettingNumber(settings, "default_labor_rate", 60, { positive: true });
  const fixedLaborCost = (mixingHours + setupHours + totalColorChangeHours + totalPaintGunCleaningHours) * laborRate;
  let totalLabor = totalItemLaborCost + fixedLaborCost;
  const totalLaborHours = items.reduce((sum, item) => sum + num(item.labor_hours), 0)
    + mixingHours + setupHours + totalColorChangeHours + totalPaintGunCleaningHours;

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
      total_cost: totalCost,
    },
  };
}
