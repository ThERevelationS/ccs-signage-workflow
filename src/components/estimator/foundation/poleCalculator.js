// Pole + pole-painting math — ported VERBATIM from SignEstimate Pro
// (NewFoundationEstimate.jsx: polesTotal / calcPolePaintingCost /
//  getPolePaintingSizeMultiplier). Poles are PROJECT-level, not per foundation item.
//
// Availability hardening: a missing price, malformed dimension, or invalid
// painting setting is not a free pole — the row is held with its acknowledged
// snapshot amounts and reported instead of silently repricing to $0.

const assignedId = value => (typeof value === "string" && value.trim() !== "")
  || (typeof value === "number" && Number.isFinite(value));

// Inventory normalization boundary (CMP-A08): the canonical settings pick and
// price/dimension/measurement kernels live in
// masterInventory/inventoryNormalization.
//   poleSettingValue      — explicit-0-respecting pick (same semantics as wallSettingValue)
//   polePriceNumber       — catalog/customer price basis: finite, nonnegative
//                           (explicit 0 is a valid free price)
//   poleDimensionNumber   — positive finite dimension in inches/feet (height
//                           above grade, stock length, pole width)
//   poleOffsetNumber      — finite nonnegative measurement (depth in ground may
//                           legitimately be zero; negatives are not lengths)
//   poleSettingNumber / polePositiveSettingNumber — setting compositions;
//                           missing/blank settings keep the module default,
//                           recorded values must parse on the basis.
import {
  inventorySettingValue as poleSettingValue,
  inventoryNonnegativeNumber as polePriceNumber,
  inventoryPositiveNumber as poleDimensionNumber,
  inventoryNonnegativeMeasurement as poleOffsetNumber,
  inventorySettingNumber as poleSettingNumber,
  inventoryPositiveSettingNumber as polePositiveSettingNumber,
} from "@/components/masterInventory/inventoryNormalization";

const setting = (settings, key, def) => parseFloat(poleSettingValue(settings?.[key], def));

const POLE_PAINT_SETTING_DEFAULTS = {
  pole_paint_cost_per_lf: 3.5,
  pole_paint_labor_per_lf: 2.5,
  pole_paint_size_multiplier_12in: 2.0,
  pole_paint_size_multiplier_10in: 1.75,
  pole_paint_size_multiplier_8in: 1.5,
  pole_paint_size_multiplier_6in: 1.25,
  pole_paint_size_multiplier_4in: 1.0,
};

const polePaintMultiplierKey = (widthInches) => {
  const w = widthInches === null ? 6 : widthInches;
  if (w >= 12) return "pole_paint_size_multiplier_12in";
  if (w >= 10) return "pole_paint_size_multiplier_10in";
  if (w >= 8) return "pole_paint_size_multiplier_8in";
  if (w >= 6) return "pole_paint_size_multiplier_6in";
  return "pole_paint_size_multiplier_4in";
};

const getPolePaintingSizeMultiplier = (inv, settings) => {
  const w = inv?.pole_width_inches || 6;
  if (w >= 12) return setting(settings, "pole_paint_size_multiplier_12in", 2.0);
  if (w >= 10) return setting(settings, "pole_paint_size_multiplier_10in", 1.75);
  if (w >= 8) return setting(settings, "pole_paint_size_multiplier_8in", 1.5);
  if (w >= 6) return setting(settings, "pole_paint_size_multiplier_6in", 1.25);
  return setting(settings, "pole_paint_size_multiplier_4in", 1.0);
};

export const calcPolePaintingCost = (p, inv, settings) => {
  if (!p.include_pole_painting || !inv) return 0;
  // Total pole length = height above ground + depth in ground.
  const heightFt = ((p.height_inches || 0) + (p.y_offset_inches || 0)) / 12;
  const paintCostPerLf = setting(settings, "pole_paint_cost_per_lf", 3.5);
  const paintLaborPerLf = setting(settings, "pole_paint_labor_per_lf", 2.5);
  const sizeMult = getPolePaintingSizeMultiplier(inv, settings);
  return heightFt * (paintCostPerLf + paintLaborPerLf) * sizeMult;
};

// Resolves the catalog row and every value the pricing formulas read, on a
// normalized calculation copy — authored rows and settings are never mutated.
function polePricing(pole, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const id = pole?.pole_id;
  const add = (field, code, message) => issues.push({
    kind: "pole", index, componentId: pole?.component_id ?? pole?.id ?? null,
    field, inventoryId: assignedId(id) ? id : null, code,
    message: `Pole ${index + 1}: ${message}.`,
  });
  let inv = null;
  if (!assignedId(id)) {
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
    add("height_inches", "pole_height_unavailable",
      "record a positive, finite height above grade in inches before repricing");
  }
  const depthInches = poleOffsetNumber(pole?.y_offset_inches);
  if (depthInches === null) {
    add("y_offset_inches", "pole_depth_unavailable",
      "record a finite, nonnegative depth in ground in inches before repricing");
  }
  let rate = null;
  let stockLengthInches = null;
  let widthInches = null;
  const paint = { costPerLf: null, laborPerLf: null, sizeMultiplier: null };
  if (inv) {
    const override = pole?.custom_cost_per_unit;
    const hasOverride = override !== undefined && override !== null;
    const stockMode = inv.pole_pricing_mode === "stock_price";
    rate = polePriceNumber(hasOverride ? override : (stockMode ? inv.pole_stock_price : inv.cost_per_unit));
    if (rate === null) {
      add(hasOverride ? "custom_cost_per_unit" : stockMode ? "pole_stock_price" : "cost_per_unit",
        "pole_price_unavailable", "record a finite, nonnegative pole price before repricing");
    }
    if (stockMode) {
      const stockLengthFt = polePositiveSettingNumber(inv.pole_stock_length_ft, 20);
      if (stockLengthFt === null) {
        add("pole_stock_length_ft", "pole_stock_length_unavailable",
          "the selected catalog stock length must be a recorded finite positive number");
      } else {
        stockLengthInches = stockLengthFt * 12;
      }
    }
    if (pole?.include_pole_painting) {
      widthInches = polePositiveSettingNumber(inv.pole_width_inches, 6);
      if (widthInches === null) {
        add("pole_width_inches", "pole_width_unavailable",
          "the selected catalog pole width must be a recorded finite positive number");
      }
      const paintSetting = (key, label) => {
        const value = poleSettingNumber(settings?.[key], POLE_PAINT_SETTING_DEFAULTS[key]);
        if (value === null) {
          add(key, "pole_paint_setting_unavailable",
            `record a finite, nonnegative ${label} before repricing`);
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

export function foundationPolePricingIssues(pole, inventory = [], index = 0, settings = {}) {
  return polePricing(pole, inventory, index, settings).issues;
}

export function foundationPoleCatalogIssues(poles = [], inventory = [], settings = {}) {
  return (poles || []).flatMap((pole, index) => foundationPolePricingIssues(pole, inventory, index, settings));
}

export function calcPoles(poles = [], inventory = [], settings = {}, options = {}) {
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedPoles");
  const savedPoles = Array.isArray(options?.savedPoles) ? options.savedPoles : [];
  const counts = rows => {
    const out = new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(poles), savedCounts = counts(savedPoles);
  const savedById = new Map(savedPoles.filter((row) => assignedId(row?.component_id))
    .map((row) => [row.component_id, row]));
  // Preserve the last saved amounts, not a fabricated free pole. The project
  // availability gate prevents these historical values becoming a new quote.
  const held = pole => {
    const id = pole?.component_id;
    const acknowledged = explicitSnapshot
      ? assignedId(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1
        ? savedById.get(id) : null
      : pole;
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
        poleCost = (totalPoleInches / 12) * rate;
      }
      // The guarded path reuses the ported painting math on the normalized
      // calculation copy, so valid inputs price identically to the original.
      const paintingCost = pole?.include_pole_painting
        ? calcPolePaintingCost(
            { include_pole_painting: true, height_inches: heightInches, y_offset_inches: depthInches },
            { ...inv, pole_width_inches: widthInches },
            {
              pole_paint_cost_per_lf: paint.costPerLf,
              pole_paint_labor_per_lf: paint.laborPerLf,
              [polePaintMultiplierKey(widthInches)]: paint.sizeMultiplier,
            })
        : 0;
      return {
        ...pole,
        pole_name: inv.material_name || "",
        pole_cost: poleCost,
        pole_painting_cost: paintingCost,
        total_cost: poleCost + paintingCost,
      };
    }),
    polePricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues })),
  };
}
