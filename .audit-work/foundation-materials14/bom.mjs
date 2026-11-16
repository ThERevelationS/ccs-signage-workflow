// src/components/estimator/foundation/FoundationBOM.jsx
import { useMemo } from "react";

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
var inventoryNonnegativeNumber = (value) => {
  const number = strictNumber(value);
  return number !== null && number >= 0 ? number : null;
};
var inventoryPositiveNumber = (value) => {
  const number = strictNumber(value, { unsignedExponent: true });
  return number !== null && number > 0 ? number : null;
};
var inventorySettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
var inventorySettingNumber = (value, fallback) => inventoryNonnegativeNumber(inventorySettingValue(value, fallback));
var inventoryPositiveSettingNumber = (value, fallback) => inventoryPositiveNumber(inventorySettingValue(value, fallback));
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

// src/components/estimator/foundation/foundationCatalogIntegrity.js
function foundationCatalogRowAvailability(row) {
  if (!row) return "unavailable";
  if (row.deleted === true) return "deleted";
  if (row.show_in_foundation === false) return "inactive";
  return "active";
}
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// src/components/estimator/foundation/wallCalculator.js
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
  const settingCheck = (key, label, positive) => {
    const value = positive ? inventoryPositiveSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]) : inventorySettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]);
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
function foundationWallBomRows(walls = [], inventory = [], wallPricing2) {
  const out = [];
  const known2 = (value) => typeof value === "number" && Number.isFinite(value);
  const quantity2 = (value, unit = "units") => known2(value) ? `${value.toLocaleString(void 0, { maximumFractionDigits: 2 })} ${unit}` : "Not saved";
  const amount = (value) => known2(value) ? value : "Not saved";
  const used = (qty2, cost) => known2(qty2) && qty2 > 0 || known2(cost) && cost !== 0;
  walls.forEach((wall, index) => {
    const costs = wall.calculatedCosts || {};
    const label = wall.name || `Wall ${index + 1}`;
    const saved = Array.isArray(wallPricing2) && wallPricing2[index] ? wallPricing2[index].available === false : foundationWallPricingIssues(wall, inventory, index).length > 0;
    const nameOf = (id) => inventory.find((row) => row.id === id)?.material_name || "Material";
    const add = (material, qty2, cost) => out.push({ material, quantity: qty2, cost: amount(cost), saved });
    if (saved || used(costs.totalBricks, costs.materialCost)) {
      add(
        saved ? `${label} \u2014 saved outer material` : `${label} \u2014 ${nameOf(wall.materialId)}`,
        quantity2(costs.totalBricks, costs.materialQuantityUnit === "cy" ? "CY" : "units"),
        costs.materialCost
      );
    }
    if (known2(costs.mortarCost) && costs.mortarCost !== 0) {
      add(`${label} \u2014 ${saved ? "saved mortar" : "mortar"}`, "\u2014", costs.mortarCost);
    }
    const internalUsed = used(costs.internalTotalBricks, costs.internalMaterialCost);
    if (saved && wall.includeInternalWall || internalUsed) {
      add(
        saved ? `${label} \u2014 saved internal material` : `${label} \u2014 ${nameOf(wall.internalMaterialId)} (internal)`,
        quantity2(costs.internalTotalBricks, costs.internalMaterialQuantityUnit === "cy" ? "CY" : "units"),
        costs.internalMaterialCost
      );
    }
    if (known2(costs.internalMortarCost) && costs.internalMortarCost !== 0) {
      add(`${label} \u2014 ${saved ? "saved internal mortar" : "internal mortar"}`, "\u2014", costs.internalMortarCost);
    }
  });
  return out;
}

// src/components/estimator/foundation/poleCalculator.js
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
    output: { embedment_inches: 40, shaft_diameter_inches: 16 },
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
    const qty2 = Number(o?.qty);
    const validQty = Number.isFinite(qty2) && qty2 > 0;
    const unit = catalog ? Number(catalog.unit_cost) : null;
    return {
      key: o?.type || "unknown",
      label: catalog?.label || (o?.type || "Object"),
      qty: validQty ? qty2 : null,
      unit_cost: unit,
      cost: validQty && unit !== null ? qty2 * unit : null,
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
  "support.catalog": "per-SKU catalog-row modeling rules + held capacity seed",
  "support.placement": "placement rules (bracing, plates, coatings)",
  "support.geometry": "support height/geometry rules + held height seed",
  "method.sign_wind": "held sign-wind method seed \u2014 no encoded formula; design_basis.sign_wind carries the operator basis",
  "method.footing": "held footing-bearing method seed (bearing/overturn/sliding/uplift) \u2014 design_basis.bearing carries the basis",
  "method.shaft": "held drilled-shaft/embedment method seed \u2014 design_basis.shaft carries the basis",
  "method.pillar_bar": "held pillar-bar method seed \u2014 design_basis.pillar_bar carries the basis",
  "method.base_plate": "held base-plate method seed \u2014 design_basis.base_plate carries the basis",
  "method.lateral": "held lateral-load method seed \u2014 design_basis.lateral carries the basis",
  "method.frost_depth": "held frost-depth method seed + source index \u2014 design_basis.frost_depth carries the basis",
  "masonry.cap_detail": "held masonry cap-detail seeds (coping/drip/mortar) \u2014 design_basis.cap_detail carries the basis",
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
  const base = FOUNDATION_RULE_SOURCES[register_id];
  return {
    register_id,
    authority: base.authority,
    authority_class: SOURCE_AUTHORITY_CLASS[register_id] ?? null,
    title: base.title,
    edition: base.edition ?? null,
    section: section ?? null,
    url: base.url ?? null,
    verified: verified === void 0 ? base.verified : verified
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
    domain: "support.compatibility",
    statement: "A base plate mounts the sign pole on the drilled shaft's top \u2014 the plate's support kind is the shaft-mount class, not a flat-slab chair. The base plate's support is the shaft's top bearing, never a mat support.",
    params: {},
    units: null,
    logic: null,
    source_ref: src("CMP-SUP-024", "base-plate mounting via manufacturer catalog", "candidate"),
    corroborating_register_ids: [],
    applicability: { member_types: ["base_plate"], usages: ["sign_pole", "shaft_mount"] },
    limits: ["base_plate member_types + sign_pole/shaft_mount usages record the support-kind distinction"],
    unsupported: ["base-plate anchor bolt sizing is a structural design input, not a register constant \u2014 the entry records the support kind only"],
    rule_version: "1.0.0",
    status: "active"
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
  },
  // ===== support/masonry held encodings — O-111 support-basis + O-112
  // masonry-caps bounded subunits. Same held-seed contract: the named gap is
  // registered so consumers can cite it; nothing is encoded to gate on. =====
  {
    rule_id: "SUP-HEIGHT-HELD",
    domain: "support.geometry",
    statement: "Support height/stand-height basis beyond the cited geometry rows is held pending a real cited height method; no invented chair/bolster height ceiling is encoded.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no support-height method is encoded beyond the cited SUP-GEOMETRY rows; the operator's authored basis carries the entry"],
    unsupported: ["support height ceilings; stand-height sizing; tall-chair thresholds not already cited"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "SUP-CAPACITY-HELD",
    domain: "support.catalog",
    statement: "Support load/capacity basis is held pending a real cited capacity method; no invented per-SKU load rating or universal capacity is encoded.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no support-capacity method is encoded; per-SKU load data must come from a cited catalog row or the operator's authored basis"],
    unsupported: ["per-SKU load ratings; universal capacity tables; chair/bolster strength limits"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "CAP-COPING-HELD",
    domain: "masonry.cap_detail",
    statement: "Masonry cap coping profile/material basis is held pending a real cited coping method; the design-basis cap_detail field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no coping profile/material method is encoded; the authored cap_detail field carries the operator's basis"],
    unsupported: ["coping profile selection; coping material spec; overhang/drip geometry"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "CAP-DRIP-HELD",
    domain: "masonry.cap_detail",
    statement: "Masonry cap drip-edge/wash basis is held pending a real cited drip-detail method; the design-basis cap_detail field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no drip-edge/wash method is encoded; the authored cap_detail field carries the operator's basis"],
    unsupported: ["drip-edge geometry; cap wash/slope; weep placement"],
    rule_version: "0.0.0",
    status: "held"
  },
  {
    rule_id: "CAP-MORTAR-HELD",
    domain: "masonry.cap_detail",
    statement: "Masonry cap mortar-joint/attachment basis is held pending a real cited mortar-detail method; the design-basis cap_detail field carries the operator's entry.",
    params: null,
    units: null,
    logic: null,
    source_ref: null,
    corroborating_register_ids: [],
    applicability: {},
    limits: ["no mortar-joint/attachment method is encoded; the authored cap_detail field carries the operator's basis"],
    unsupported: ["mortar joint profile; cap attachment method; sealant spec"],
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
  let status = text(rule.status) || "active";
  if (!STATUSES.has(status)) {
    errors.push("status must be 'active' or 'held'");
    status = "held";
  }
  const isHeld = status === "held";
  const params = rule.params === void 0 ? {} : rule.params;
  if (params === null && isHeld) {
  } else if (!isRecord2(params)) {
    errors.push("params must be a plain record when present");
  } else {
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
    if (!(isHeld && (sref === null || sref === void 0))) {
      errors.push("source_ref is required for every registry rule");
    }
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
    const list = rule[listKey];
    if (list !== void 0 && (!Array.isArray(list) || list.some((entry) => typeof entry !== "string" || !entry.trim()))) {
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
    params: isRecord2(params) ? { ...params } : {},
    units: rule.units ?? null,
    logic: rule.logic ?? null,
    source_ref: isRecord2(sref) ? {
      register_id: sref.register_id.trim(),
      authority: sref.authority.trim(),
      title: sref.title.trim(),
      edition: sref.edition ?? null,
      section: sref.section ?? null,
      url: sref.url ?? null,
      verified: sref.verified
    } : null,
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
  const check = (list, value) => {
    if (!Array.isArray(list) || !list.length || value === void 0 || value === null || value === "") return true;
    return list.includes(value);
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

// src/components/estimator/foundation/foundationInputValidation.js
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
  if (qty2 !== void 0 && qty2 !== null && qty2 !== "" && inventoryPositiveNumber(qty2) === null) {
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

// src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);

// src/components/estimator/foundation/foundationReinforcementCost.js
var STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);

// src/components/estimator/foundation/foundationReinforcementCutSchedule.js
var STEEL_ROLES2 = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
var ROLE_SHAPES = Object.freeze({
  horizontal: "straight",
  longitudinal: "straight",
  hoop: "hoop",
  inter_mat_tie: "as_authored"
});

// src/components/estimator/foundation/foundationCalc.js
var num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
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
var money = (n) => `$${num(n).toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// src/components/estimator/foundation/foundationPreliminaryNotice.js
import { createElement, useState } from "react";

// s:s://lucide-react
var I = () => null;
var AlertTriangle = I;
var X = I;

// src/components/estimator/foundation/foundationPreliminaryNotice.js
var PRELIMINARY_NOTICE_TEXT = "Preliminary estimating only - final engineering required";
function PreliminaryNotice({ text: text3 = PRELIMINARY_NOTICE_TEXT, dismissible = false, className = "" }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return createElement(
    "div",
    {
      role: "status",
      className: `flex items-center gap-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ${className}`.trim()
    },
    createElement(AlertTriangle, { className: "w-4 h-4 text-amber-600 flex-shrink-0", "aria-hidden": true }),
    createElement("span", { className: "flex-1 font-medium" }, text3),
    dismissible ? createElement(
      "button",
      {
        type: "button",
        onClick: () => setDismissed(true),
        "aria-label": "Dismiss preliminary notice",
        className: "h-[22px] px-1.5 rounded-sm text-amber-700 hover:bg-amber-100"
      },
      createElement(X, { className: "w-3.5 h-3.5", "aria-hidden": true })
    ) : null
  );
}

// src/components/estimator/foundation/foundationReinforcementBOMRows.js
var known = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var quantity = (value) => known(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not saved";
var text2 = (value) => typeof value === "string" ? value.trim() : "";
function foundationReinforcementBOMRows(item, { saved = false } = {}) {
  if (item?.reinforcement_calculation_version !== 2) return null;
  const total = known(item.rebar_cost) ? item.rebar_cost : null;
  if (!item.include_rebar && !(saved && total > 0)) return [];
  const label = text2(item.description) || `Foundation ${text2(item.component_id) || "?"}`;
  const name = text2(item.reinforcement_cost_snapshot?.material?.name) || "Reinforcing steel";
  const physical = quantity(item.rebar_geometry_feet);
  const priced = quantity(item.rebar_feet);
  const material = known(item.rebar_material_cost) ? item.rebar_material_cost : null;
  const labor = known(item.rebar_labor_cost) ? item.rebar_labor_cost : null;
  const quantities = `${physical} LF physical / ${priced} LF priced`;
  const provenance = saved ? "Acknowledged saved quantities and amounts; current pricing unavailable. " : "";
  const review = "Not a purchasing plan. Engineering and purchasing review required.";
  const weights = `Physical weight: ${quantity(item.rebar_geometry_weight_lbs)} lb. Priced weight: ${quantity(item.rebar_weight_lbs)} lb.`;
  const splitMissing = material === null || labor === null;
  const splitMismatch = !splitMissing && total !== null && material + labor !== total;
  if (total !== null && (splitMissing || splitMismatch)) return [{
    material: `${label} - reinforcement (combined saved amount)`,
    quantity: quantities,
    cost: total,
    saved: true,
    reinforcement: true,
    basisUnavailable: true,
    note: `${provenance}${splitMissing ? "Material/labor split: Not saved." : "Stored material/labor split does not reconcile."} Combined steel amount retained without an invented breakdown. ${weights} ${review}`
  }];
  const basisUnavailable = [
    item.rebar_geometry_feet,
    item.rebar_feet,
    item.rebar_geometry_weight_lbs,
    item.rebar_weight_lbs,
    item.rebar_labor_hours,
    material,
    labor
  ].some((value) => !known(value));
  const rows = [{
    material: `${label} - ${name} (material)`,
    quantity: quantities,
    cost: material,
    saved,
    reinforcement: true,
    basisUnavailable,
    note: `${provenance}${weights} Internal material cost only. ${review}`
  }, {
    material: `${label} - reinforcement labor`,
    quantity: `${quantity(item.rebar_labor_hours)} hr`,
    cost: labor,
    saved,
    reinforcement: true,
    basisUnavailable,
    note: `${provenance}Internal reinforcement labor cost, separate from steel material. ${review}`
  }];
  rows.push(...supportBOMRows(item, label, provenance, review, saved));
  rows.push(...stockBOMRows(item, label, provenance, review, saved));
  return rows;
}
function supportBOMRows(item, label, provenance, review, saved) {
  const snapshot = item.reinforcement_cost_snapshot?.supports;
  const required = known(item.support_count) ? item.support_count : null;
  if (!snapshot && required === null) {
    return saved ? [{
      material: `${label} - supports (not recorded)`,
      quantity: "Not saved",
      cost: "Not saved",
      saved: true,
      reinforcement: true,
      basisUnavailable: true,
      note: `${provenance}This acknowledged item predates support modeling; support quantity and cost were not recorded. ${review}`
    }] : [];
  }
  if (required === 0) return [];
  const selections = Array.isArray(snapshot?.selections) ? snapshot.selections : [];
  const supportMaterial = known(item.support_material_cost) ? item.support_material_cost : null;
  const supportLabor = known(item.support_labor_cost) ? item.support_labor_cost : null;
  const supportLaborHours = known(item.support_labor_hours) ? item.support_labor_hours : null;
  const supportTotal = known(item.support_cost) ? item.support_cost : null;
  const unresolved = [required, supportMaterial, supportLabor, supportLaborHours, supportTotal].some((v) => v === null) || selections.some((s) => !known(s?.material_cost) || !known(s?.units_purchased));
  if (unresolved || !selections.length) {
    return [{
      material: `${label} - supports (${required === null ? "not recorded" : `${required} required`})`,
      quantity: required === null ? "Not saved" : `${required.toLocaleString("en-US")} required`,
      cost: supportTotal === null ? "Not saved" : supportTotal,
      saved: true,
      reinforcement: true,
      basisUnavailable: true,
      note: `${provenance}Modeled support economics are unresolved; the acknowledged amount is shown without an invented catalog breakdown. ${review}`
    }];
  }
  const rows = selections.map((s, index) => ({
    material: `${label} - ${text2(s.name) || "Rebar support"} (x${s.units_purchased} purchased${Number.isSafeInteger(s.pack_size) && s.pack_size > 1 ? `, packs of ${s.pack_size}` : ""})`,
    quantity: `${quantity(s.units_purchased)} ea (${quantity(s.units_required)} required)`,
    cost: s.material_cost,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    support: true,
    note: `${provenance}Bottom-resting support pick ${index + 1}${s.mat_id ? ` for mat ${s.mat_id}` : ""}; ${quantity(s.support_height_inches)} in stand height. Internal material cost only. ${review}`
  }));
  rows.push({
    material: `${label} - support install labor`,
    quantity: `${quantity(supportLaborHours)} hr`,
    cost: supportLabor,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    support: true,
    note: `${provenance}Internal support installation labor, separate from support material. ${review}`
  });
  return rows;
}
function stockBOMRows(item, label, provenance, review, saved) {
  if (item.include_rebar === false) return [];
  const schedule = item.reinforcement_cost_snapshot?.cut_schedule;
  if (!schedule) {
    return saved ? [{
      material: `${label} - rebar cut/stock schedule (not recorded)`,
      quantity: "Not recorded",
      cost: 0,
      saved: true,
      reinforcement: true,
      basisUnavailable: true,
      stock: true,
      note: `${provenance}This acknowledged item predates cut/stock scheduling; the plan was not recorded. Steel cost is unaffected. ${review}`
    }] : [];
  }
  if (schedule.status !== "resolved" || !schedule.stock) {
    const reason = schedule.status === "unresolved" ? "stock lengths are unconfigured or a cut exceeds the configured stock" : `status ${text2(schedule.status) || "unknown"}`;
    return [{
      material: `${label} - rebar stock (plan unresolved)`,
      quantity: `${quantity(schedule.piece_count_total)} pieces scheduled`,
      cost: 0,
      saved,
      reinforcement: true,
      basisUnavailable: true,
      stock: true,
      note: `${provenance}Rebar stock plan is unresolved (${reason}); ${quantity(schedule.cut_lines?.length)} authored cut lines stand. Steel cost is unaffected \u2014 verify stock lengths on the catalog row. ${review}`
    }];
  }
  const barSize = text2(schedule.bar_size);
  const barLabel = barSize ? ` ${barSize}` : "";
  const totals = schedule.stock.totals || {};
  const rows = (schedule.stock.groups || []).flatMap((group) => (group.by_length || []).map((entry) => ({
    material: `${label} - rebar stock${barLabel} ${entry.stock_length_inches} in (x${entry.stock_count})`,
    quantity: `${quantity(entry.stock_count)} \xD7 ${quantity(entry.stock_length_inches)} in stock`,
    cost: 0,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    stock: true,
    note: `${provenance}Cut plan: ${quantity(entry.pieces_per_stock?.reduce((s, n) => s + n, 0))} pieces on ${entry.stock_count} \xD7 ${entry.stock_length_inches}-in stock, ${quantity(entry.offcut_inches)} in offcut (${quantity(entry.waste_pct)}%). ${review}`
  })));
  rows.push({
    material: `${label} - rebar cut/waste summary${barLabel}`,
    quantity: `${quantity(totals.total_linear_inches_required / 12)} LF required / ${quantity(totals.stock_linear_inches_purchased / 12)} LF stock`,
    cost: 0,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    stock: true,
    note: `${provenance}${quantity(schedule.piece_count_total)} pieces on ${quantity(totals.stock_count_total)} stock pieces; ${quantity(totals.waste_inches)} in offcut (${quantity(totals.waste_pct)}% of purchased). First-fit-decreasing packing \u2014 not an optimized purchasing plan. ${review}`
  });
  return rows;
}

// src/components/estimator/foundation/foundationPlanExport.js
var esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function buildFoundationBomSvg(lines, { width = 480, title = "Bill of materials" } = {}) {
  const rows = Array.isArray(lines) ? lines : [];
  const rowH = 16, headerH = 22, height = headerH + rows.length * rowH + 22;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`);
  out.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  out.push(`<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#94a3b8" stroke-width="1"/>`);
  out.push(`<text x="8" y="15" font-size="10" font-weight="600" fill="#1e293b">${esc(title)}</text>`);
  out.push(`<text x="8" y="15" text-anchor="end" x2="${width - 8}" font-size="8" fill="#64748b" x="${width - 8}">qty | cost</text>`);
  rows.forEach((r, i) => {
    const y = headerH + i * rowH;
    if (i % 2 === 0) out.push(`<rect x="4" y="${y}" width="${width - 8}" height="${rowH}" fill="#f8fafc"/>`);
    const cost = r?.cost;
    const costText = Number.isFinite(cost) ? `$${cost.toFixed(2)}` : typeof cost === "string" && cost !== "" ? cost : "-";
    out.push(`<text x="8" y="${y + 11}" font-size="9" fill="#334155">${esc(String(r?.material || "Item"))}</text>`);
    out.push(`<text x="${width - 90}" y="${y + 11}" font-size="8" fill="#475569" text-anchor="end">${esc(String(r?.quantity || ""))}</text>`);
    out.push(`<text x="${width - 8}" y="${y + 11}" font-size="9" fill="#1e293b" text-anchor="end">${esc(costText)}</text>`);
  });
  out.push(`<text x="6" y="${height - 6}" font-size="8" fill="#64748b">${rows.length} line(s) -- labeled export</text>`);
  out.push("</svg>");
  return out.join("\n");
}

// src/components/estimator/foundation/FoundationBOM.jsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var num2 = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
var qty = (n, unit) => `${num2(n).toLocaleString(void 0, { maximumFractionDigits: 2 })} ${unit}`;
var EMPTY_ITEMS = [];
var EMPTY_POLES = [];
var EMPTY_WALLS = [];
var EMPTY_TOTALS = {};
var EMPTY_INVENTORY = [];
function FoundationBOM({
  onSelectIssue,
  items = EMPTY_ITEMS,
  poles = EMPTY_POLES,
  walls = EMPTY_WALLS,
  delivery,
  totals = EMPTY_TOTALS,
  inventory = EMPTY_INVENTORY,
  itemPricing = EMPTY_ITEMS,
  polePricing = EMPTY_ITEMS,
  wallPricing: wallPricing2 = EMPTY_ITEMS,
  cabinets = EMPTY_ITEMS,
  landscape,
  landscapePricing,
  pricingUnavailable = false,
  project = null
}) {
  const cabinetRows = useMemo(() => calcSignageCabinetPricing(cabinets), [cabinets]);
  const rows = useMemo(() => {
    const out = [];
    const add = (material, displayQty, cost, rawQty = num2(displayQty), note = null, costClass = "calculated", supplierGroup = null, authorizationGate = null, sensitivityPct = null) => {
      if (num2(rawQty) <= 0 && !hasFoundationCostSnapshot(cost)) return;
      out.push({
        material,
        quantity: displayQty,
        cost,
        cost_class: costClass,
        ...note ? { note } : {},
        supplier_group: supplierGroup,
        authorization_gate: authorizationGate,
        ...sensitivityPct != null ? { sensitivity_pct: sensitivityPct } : {}
      });
    };
    const nameOf = (id) => inventory.find((i) => i.id === id)?.material_name || "Material";
    const resolved = items.filter((_, i) => itemPricing[i]?.available !== false);
    const blocked = items.filter((_, i) => itemPricing[i]?.available === false);
    if (delivery?.pricingUnavailable) {
      out.push({
        material: "Concrete delivery/order (saved)",
        quantity: Number.isFinite(delivery.roundedYards) ? qty(delivery.roundedYards, "CY") : "Not saved",
        cost: hasFoundationCostSnapshot(delivery.concreteTotal) ? delivery.concreteTotal : "Not saved",
        cost_class: "saved",
        saved: true
      });
    } else if (num2(delivery?.roundedYards) > 0) {
      add("Ready-mix concrete (delivered)", qty(delivery.roundedYards, "CY"), delivery.concreteTotal, delivery.roundedYards, "Volume from item footprints x depth x quantity, rounded to delivery order.");
    }
    const bags = resolved.reduce((s, i) => s + num2(i.concrete_bags), 0);
    const baggedCost = resolved.reduce((s, i) => s + num2(i.concrete_cost), 0);
    if (bags > 0 || baggedCost > 0) add("Bagged concrete", qty(bags, "bags"), baggedCost, bags, "Item volume converted to bag count at the supplier bag rate.");
    const legacyRebar = resolved.filter((item) => item.reinforcement_calculation_version !== 2);
    const rebarFt = legacyRebar.reduce((s, i) => s + num2(i.rebar_feet), 0);
    const rebarLbs = legacyRebar.reduce((s, i) => s + num2(i.rebar_weight_lbs), 0);
    const rebarCost = legacyRebar.reduce((s, i) => s + num2(i.rebar_cost), 0);
    if (rebarFt > 0) {
      add(`Rebar (${qty(rebarLbs, "lbs")})`, qty(rebarFt, "LF"), rebarCost, rebarFt, "Aggregate authored rebar feet and weight on legacy items.");
    }
    resolved.filter((item) => item.reinforcement_calculation_version === 2).forEach((item) => {
      out.push(...foundationReinforcementBOMRows(item));
    });
    const formingQty = resolved.reduce((s, i) => s + num2(i.forming_qty), 0);
    const formingCost = resolved.reduce((s, i) => s + num2(i.forming_cost), 0);
    if (formingQty > 0) add("Forming material", qty(formingQty, "units"), formingCost, formingQty, "Form units from item perimeter x depth.");
    const contingency = num2(project?.contingency_cost);
    if (contingency > 0) {
      add("Shop/user contingency", qty(1, "allowance"), contingency, 1, "A disclosed shop/user contingency allowance -- not a calculated baseline quantity.", "contingency");
    }
    const pubMin = num2(project?.published_min_cost);
    if (pubMin > 0) {
      add("Published minimum", qty(1, "published"), pubMin, 1, "The published engineering-minimum authored amount -- a minimum bound, not a calculated baseline or a contingency.", "published_minimum");
    }
    const pricedAlt = num2(project?.priced_alternative_cost);
    if (pricedAlt > 0) {
      add("Priced alternative", qty(1, "alternative"), pricedAlt, 1, "An elected alternative's authored amount -- a priced-alternative estimate, not the calculated baseline.", "priced_alternative");
    }
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
      if (i.reinforcement_calculation_version === 2) {
        out.push(...foundationReinforcementBOMRows(i, { saved: true }));
      } else if (i.include_rebar) {
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
      if (polePricing[index]?.available === false) return;
      if (!p.pole_id) return;
      poleGroups[p.pole_id] = poleGroups[p.pole_id] || { ft: 0, cost: 0 };
      const billedInches = hasFoundationCostSnapshot(p.required_length_inches) ? p.required_length_inches : num2(p.height_inches) + num2(p.embedment_inches ?? p.y_offset_inches);
      poleGroups[p.pole_id].ft += billedInches / 12;
      poleGroups[p.pole_id].cost += num2(p.pole_cost);
    });
    Object.entries(poleGroups).forEach(([id, g]) => add(nameOf(id), qty(g.ft, "LF"), g.cost, g.ft));
    const polePainting = poles.reduce((s, p, index) => polePricing[index]?.available === false ? s : s + num2(p.pole_painting_cost), 0);
    if (polePainting > 0) {
      add("Pole painting", "\u2014", polePainting);
    }
    const savedPoleFt = (p) => {
      const req = Number(p.required_length_inches);
      if (Number.isFinite(req) && req > 0) return req / 12;
      const h = Number(p.height_inches), d = Number(p.embedment_inches ?? p.y_offset_inches);
      return Number.isFinite(h) && h > 0 && Number.isFinite(d) && d >= 0 ? (h + d) / 12 : null;
    };
    poles.forEach((p, index) => {
      if (polePricing[index]?.available !== false) return;
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
      (Array.isArray(p.signs) ? p.signs : []).forEach((s, si) => {
        const extras = ["hardware_cost", "labor_cost", "paint_cost", "waste_cost"].map((k) => Number(s?.[k]) || 0).reduce((a, b) => a + b, 0);
        const linked = s?.display_only === true;
        out.push({
          material: `${label} \u2014 sign ${si + 1}${s?.name ? ` (${s.name})` : ""}`,
          quantity: `1 sign${s?.faces ? ` x ${s.faces} faces` : ""}${linked ? " (linked)" : ""}`,
          cost: linked ? "\u2014" : hasFoundationCostSnapshot(s?.unit_cost) ? Number(s.unit_cost) + extras : "Not saved",
          saved: true
        });
      });
    });
    out.push(...foundationWallBomRows(walls, inventory, wallPricing2));
    (totals.wall_caps_by_material || []).forEach((g) => {
      const notes = [g.profile, g.slope, g.end_treatment].filter(Boolean).join(", ");
      const extras = [g.supplies_cost > 0 ? "supplies" : null, g.cut_labor_cost > 0 ? "cut labor" : null].filter(Boolean).join(" + ");
      add(g.name || "Wall cap", qty(g.qty, "pcs"), g.cost, g.qty, [notes, extras].filter(Boolean).join("; ") || null);
    });
    cabinetRows.forEach((row, index) => {
      const cabinet = cabinets[index] || {};
      const label = cabinet.description || `Signage cabinet ${index + 1}`;
      if (row.available === false) {
        const recordedQty = Number(cabinet.quantity);
        out.push({
          material: `${label} (saved)`,
          quantity: Number.isFinite(recordedQty) ? qty(recordedQty, "pcs") : "Not saved",
          cost: "Not saved",
          saved: true
        });
        return;
      }
      const quantity2 = cabinet.quantity === void 0 || cabinet.quantity === null || cabinet.quantity === "" ? 1 : Number(cabinet.quantity);
      add(label, qty(quantity2, "pcs"), row.cost, quantity2);
    });
    if (landscapePricing && landscapePricing.available === false) {
      out.push({
        material: "Site landscaping (saved)",
        quantity: "\u2014",
        cost: hasFoundationCostSnapshot(totals.total_landscape_cost) ? totals.total_landscape_cost : "Not saved",
        saved: true
      });
    } else {
      landscapeSummary(landscape).lines.forEach((line) => {
        if (line.cost === null || line.sqft === null) {
          out.push({
            material: `Site \u2014 ${line.label} (saved)`,
            quantity: Number.isFinite(line.sqft) ? qty(line.sqft, "sq ft") : qty(line.cells, "cells"),
            cost: "Not saved",
            saved: true
          });
          return;
        }
        add(`Site \u2014 ${line.label}`, qty(line.sqft, "sq ft"), line.cost, line.sqft);
      });
    }
    return out;
  }, [items, poles, walls, delivery, totals, inventory, itemPricing, polePricing, wallPricing2, cabinets, cabinetRows, landscape, landscapePricing]);
  const materialTotal = rows.every((r) => hasFoundationCostSnapshot(r.cost)) ? rows.reduce((sum, row) => sum + row.cost, 0) : null;
  const listedPricingUnavailable = pricingUnavailable || rows.some((row) => row.basisUnavailable);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between mb-3", children: [
      /* @__PURE__ */ jsx("h3", { className: "font-semibold text-gray-900", children: "Bill of Materials" }),
      rows.length > 0 && /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => {
            const svg = buildFoundationBomSvg(rows, { title: `${project?.project_name || "Foundation"} \u2014 Bill of materials` });
            const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(project?.project_name || "foundation").replace(/[^\w-]+/g, "_")}-bom.svg`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4e3);
          },
          className: "text-[10px] text-blue-600 hover:text-blue-800 underline print:hidden",
          "aria-label": "Download the bill of materials as an SVG image",
          children: "Download image (SVG)"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(PreliminaryNotice, {}),
    listedPricingUnavailable && /* @__PURE__ */ jsxs("div", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1", children: [
      /* @__PURE__ */ jsx("p", { className: "text-[11px] font-semibold text-amber-800", children: "Pricing unavailable \u2014 saved quantities may be outdated." }),
      itemPricing.filter((p) => p && p.available === false).concat(polePricing.filter((p) => p && p.available === false)).concat(cabinetRows.filter((p) => p && p.available === false)).concat(landscapePricing && landscapePricing.available === false ? [landscapePricing] : []).flatMap(
        (p, k) => (p.issues || []).map((i, j) => /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-amber-700", children: [
          i.message,
          onSelectIssue && (i.componentId != null || i.index != null) && /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => onSelectIssue(i),
              className: "ml-1 text-[9px] text-amber-800 underline hover:text-amber-900",
              "aria-label": `Select ${i.kind || "item"} ${i.index != null ? i.index + 1 : ""}${i.field ? ` field ${i.field}` : ""}`,
              children: [
                "(select",
                i.field ? ` ${i.field}` : "",
                ")"
              ]
            }
          )
        ] }, `${k}-${j}`))
      )
    ] }),
    rows.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500", children: "No materials yet \u2014 add a foundation to build the list." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "text-left text-xs text-gray-500 border-b border-gray-200", children: [
          /* @__PURE__ */ jsx("th", { className: "py-1.5", children: "Material" }),
          /* @__PURE__ */ jsx("th", { className: "py-1.5", children: "Quantity" }),
          /* @__PURE__ */ jsx("th", { className: "py-1.5 text-right", children: "Cost" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: rows.map((r, i) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-gray-100 last:border-0", children: [
          /* @__PURE__ */ jsxs("td", { className: `py-1.5 pr-3 text-gray-800${r.note ? " min-w-0 break-words" : ""}`, children: [
            r.material,
            r.cost_class && r.cost_class !== "calculated" && /* @__PURE__ */ jsx("span", { className: "ml-1 rounded-sm bg-gray-100 px-1 text-[9px] uppercase tracking-wide text-gray-500", children: r.cost_class.replace(/_/g, " ") }),
            r.sensitivity_pct != null && /* @__PURE__ */ jsxs("span", { className: "ml-1 rounded-sm bg-blue-50 px-1 text-[9px] text-blue-700", title: "Sensitivity bound on this row's cost", children: [
              "\xB1",
              r.sensitivity_pct,
              "%"
            ] }),
            r.note && /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] leading-snug text-gray-500 break-words", children: r.note })
          ] }),
          /* @__PURE__ */ jsx("td", { className: "py-1.5 pr-3 whitespace-nowrap text-gray-600", children: r.quantity }),
          /* @__PURE__ */ jsx("td", { className: "py-1.5 pl-3 whitespace-nowrap text-right text-gray-900", children: hasFoundationCostSnapshot(r.cost) ? money(r.cost) : "Not saved" })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between pt-3 mt-1 border-t border-gray-200 font-bold text-gray-900", children: [
        /* @__PURE__ */ jsx("span", { children: "Listed cost subtotal" }),
        /* @__PURE__ */ jsx("span", { children: listedPricingUnavailable ? /* @__PURE__ */ jsx("span", { className: "text-amber-700", children: "Pricing unavailable" }) : hasFoundationCostSnapshot(materialTotal) ? money(materialTotal) : "Not saved" })
      ] })
    ] })
  ] });
}
export {
  FoundationBOM as default
};
