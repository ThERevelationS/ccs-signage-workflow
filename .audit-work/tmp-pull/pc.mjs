// src/components/masterInventory/inventoryNormalization.js
var STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string" || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var inventoryFiniteNumber = (value) => strictNumber(value);
var inventoryNonnegativeNumber = (value) => {
  const number = strictNumber(value);
  return number !== null && number >= 0 ? number : null;
};
var inventoryPositiveNumber = (value) => {
  const number = strictNumber(value, { unsignedExponent: true });
  return number !== null && number > 0 ? number : null;
};
var inventoryNonnegativeMeasurement = (value) => {
  const number = strictNumber(value, { unsignedExponent: true });
  return number !== null && number >= 0 ? number : null;
};
var inventorySettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
var inventorySettingNumber = (value, fallback) => inventoryNonnegativeNumber(inventorySettingValue(value, fallback));
var inventoryPositiveSettingNumber = (value, fallback) => inventoryPositiveNumber(inventorySettingValue(value, fallback));

// src/components/estimator/foundation/foundationCatalogIntegrity.js
function foundationCatalogRowAvailability(row) {
  if (!row) return "unavailable";
  if (row.deleted === true) return "deleted";
  if (row.show_in_foundation === false) return "inactive";
  return "active";
}

// src/components/estimator/foundation/poleCalculator.js
var assignedId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
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
var POLE_ORIGIN_PROJECT = "project";
var POLE_ORIGIN_LEGACY_ITEM = "legacy_item";
var LEGACY_ITEM_POLE_FIELDS = [
  "selected_pole_id",
  "pole_total_height_inches",
  "pole_offset_from_bottom_inches",
  "include_pole_painting"
];
var isCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
function itemHasLegacyPole(item) {
  if (!item || typeof item !== "object") return false;
  const id = item.selected_pole_id;
  if (assignedId(id)) return true;
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
    pole_id: assignedId(item.selected_pole_id) ? item.selected_pole_id : "",
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
function migrateLegacyItemPole(item, index = 0, { createId } = {}) {
  if (!itemHasLegacyPole(item)) return null;
  const height = inventoryFiniteNumber(item.pole_total_height_inches);
  const offBottom = inventoryFiniteNumber(item.pole_offset_from_bottom_inches);
  const planX = inventoryFiniteNumber(item.x_inches);
  const planZ = inventoryFiniteNumber(item.z_inches);
  const pole = {
    ...typeof createId === "function" ? { component_id: createId("pole") } : {},
    pole_id: assignedId(item.selected_pole_id) ? item.selected_pole_id : "",
    ...height !== null && height > 0 ? { height_inches: height } : {},
    include_pole_painting: item.include_pole_painting === true,
    foundation_component_id: item.component_id ?? "",
    foundation_idx: index,
    ...planX !== null ? { x_inches: planX } : {},
    ...planZ !== null ? { z_inches: planZ } : {},
    migrated_from: POLE_ORIGIN_LEGACY_ITEM,
    source_item_component_id: item.component_id ?? void 0,
    ...offBottom !== null ? { legacy_pole_offset_from_bottom_inches: offBottom } : {}
  };
  const itemPatch = {
    selected_pole_id: "",
    pole_total_height_inches: 0,
    pole_offset_from_bottom_inches: 0,
    include_pole_painting: false,
    // The dead item-level snapshots clear too â€” leaving them would keep the
    // item flagged as carrying a legacy pole after its explicit migration.
    pole_cost: void 0,
    pole_painting_cost: void 0
  };
  return { pole, itemPatch };
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
    inventoryId: assignedId(id) ? id : null,
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
function foundationPolePricingIssues(pole, inventory = [], index = 0, settings = {}) {
  return polePricing(pole, inventory, index, settings).issues;
}
function foundationPoleCatalogIssues(poles = [], inventory = [], settings = {}) {
  return (poles || []).flatMap((pole, index) => foundationPolePricingIssues(pole, inventory, index, settings));
}
function calcPoles(poles = [], inventory = [], settings = {}, options = {}) {
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedPoles");
  const savedPoles = Array.isArray(options?.savedPoles) ? options.savedPoles : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(poles), savedCounts = counts(savedPoles);
  const savedById = new Map(savedPoles.filter((row) => assignedId(row?.component_id)).map((row) => [row.component_id, row]));
  const held = (pole) => {
    const id = pole?.component_id;
    const acknowledged = explicitSnapshot ? assignedId(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null : pole;
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
var suggestFeasibleFoundationDims = (item) => {
  const type = item?.foundation_type;
  if (type !== "spread_foot" && type !== "wall") return { available: false, reason: "no documented feasible-dims domain for this foundation type" };
  if (type === "spread_foot") {
    return {
      available: true,
      depth_inches: FOUNDATION_TYPE_METHOD_DOMAIN.spread_foot_depth_min_inches,
      governing: 'spread_foot depth >= 12" (shop-assumption minimum)'
    };
  }
  return {
    available: true,
    height_inches: FOUNDATION_TYPE_METHOD_DOMAIN.wall_height_min_inches,
    governing: 'wall height >= 6" (shop-assumption minimum)'
  };
};
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
export {
  FOUNDATION_METHOD_DOMAIN,
  FOUNDATION_METHOD_WORKED_EXAMPLES,
  FOUNDATION_TYPE_METHOD_DOMAIN,
  LEGACY_ITEM_POLE_FIELDS,
  POLE_ORIGIN_LEGACY_ITEM,
  POLE_ORIGIN_PROJECT,
  POLE_SHAPE_VALUES,
  calcPolePaintingCost,
  calcPoles,
  consolidateFoundationPoles,
  deriveLegacyItemPole,
  foundationPoleCatalogIssues,
  foundationPoleGeometry,
  foundationPolePricingIssues,
  itemHasLegacyPole,
  migrateLegacyItemPole,
  suggestFeasibleDimensions,
  suggestFeasibleFoundationDims
};
