// .audit-work/foundation-phaseb3/candidate-tree-src/react-stub.js
var useMemo = (fn) => fn();
var Fragment = Symbol("Fragment");

// .audit-work/foundation-phaseb3/candidate-tree-src/components/masterInventory/inventoryNormalization.js
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
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/wallCalculator.js
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationInputValidation.js
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementCost.js
var STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationCalc.js
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

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/foundationReinforcementBOMRows.js
var known = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var quantity = (value) => known(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not saved";
var text = (value) => typeof value === "string" ? value.trim() : "";
function foundationReinforcementBOMRows(item, { saved = false } = {}) {
  if (item?.reinforcement_calculation_version !== 2) return null;
  const total = known(item.rebar_cost) ? item.rebar_cost : null;
  if (!item.include_rebar && !(saved && total > 0)) return [];
  const label = text(item.description) || `Foundation ${text(item.component_id) || "?"}`;
  const name = text(item.reinforcement_cost_snapshot?.material?.name) || "Reinforcing steel";
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
    material: `${label} - ${text(s.name) || "Rebar support"} (x${s.units_purchased} purchased${Number.isSafeInteger(s.pack_size) && s.pack_size > 1 ? `, packs of ${s.pack_size}` : ""})`,
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

// .audit-work/foundation-phaseb3/verify/stubs/jsx-runtime.js
var jsx = (type, props) => ({ type, props: props || {} });
var jsxs = jsx;
var Fragment2 = "Fragment";

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/FoundationBOM.jsx
var num2 = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
var qty = (n, unit) => `${num2(n).toLocaleString(void 0, { maximumFractionDigits: 2 })} ${unit}`;
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
  polePricing = EMPTY_ITEMS,
  wallPricing: wallPricing2 = EMPTY_ITEMS,
  cabinets = EMPTY_ITEMS,
  landscape,
  landscapePricing,
  pricingUnavailable = false
}) {
  const cabinetRows = useMemo(() => calcSignageCabinetPricing(cabinets), [cabinets]);
  const rows = useMemo(() => {
    const out = [];
    const add = (material, displayQty, cost, rawQty = num2(displayQty)) => {
      if (num2(rawQty) <= 0 && !hasFoundationCostSnapshot(cost)) return;
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
    } else if (num2(delivery?.roundedYards) > 0) {
      add("Ready-mix concrete (delivered)", qty(delivery.roundedYards, "CY"), delivery.concreteTotal, delivery.roundedYards);
    }
    const bags = resolved.reduce((s, i) => s + num2(i.concrete_bags), 0);
    const baggedCost = resolved.reduce((s, i) => s + num2(i.concrete_cost), 0);
    if (bags > 0 || baggedCost > 0) add("Bagged concrete", qty(bags, "bags"), baggedCost, bags);
    const legacyRebar = resolved.filter((item) => item.reinforcement_calculation_version !== 2);
    const rebarFt = legacyRebar.reduce((s, i) => s + num2(i.rebar_feet), 0);
    const rebarLbs = legacyRebar.reduce((s, i) => s + num2(i.rebar_weight_lbs), 0);
    const rebarCost = legacyRebar.reduce((s, i) => s + num2(i.rebar_cost), 0);
    if (rebarFt > 0) {
      add(`Rebar (${qty(rebarLbs, "lbs")})`, qty(rebarFt, "LF"), rebarCost, rebarFt);
    }
    resolved.filter((item) => item.reinforcement_calculation_version === 2).forEach((item) => {
      out.push(...foundationReinforcementBOMRows(item));
    });
    const formingQty = resolved.reduce((s, i) => s + num2(i.forming_qty), 0);
    const formingCost = resolved.reduce((s, i) => s + num2(i.forming_cost), 0);
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
    });
    out.push(...foundationWallBomRows(walls, inventory, wallPricing2));
    (totals.wall_caps_by_material || []).forEach((g) => add(g.name || "Wall cap", qty(g.qty, "pcs"), g.cost, g.qty));
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
    /* @__PURE__ */ jsx("h3", { className: "font-semibold text-gray-900 mb-3", children: "Bill of Materials" }),
    listedPricingUnavailable && /* @__PURE__ */ jsxs("div", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1", children: [
      /* @__PURE__ */ jsx("p", { className: "text-[11px] font-semibold text-amber-800", children: "Pricing unavailable \u2014 saved quantities may be outdated." }),
      itemPricing.filter((p) => p && p.available === false).concat(polePricing.filter((p) => p && p.available === false)).concat(cabinetRows.filter((p) => p && p.available === false)).concat(landscapePricing && landscapePricing.available === false ? [landscapePricing] : []).flatMap(
        (p, k) => (p.issues || []).map((i, j) => /* @__PURE__ */ jsx("p", { className: "text-[10px] text-amber-700", children: i.message }, `${k}-${j}`))
      )
    ] }),
    rows.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500", children: "No materials yet \u2014 add a foundation to build the list." }) : /* @__PURE__ */ jsxs(Fragment2, { children: [
      /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "text-left text-xs text-gray-500 border-b border-gray-200", children: [
          /* @__PURE__ */ jsx("th", { className: "py-1.5", children: "Material" }),
          /* @__PURE__ */ jsx("th", { className: "py-1.5", children: "Quantity" }),
          /* @__PURE__ */ jsx("th", { className: "py-1.5 text-right", children: "Cost" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: rows.map((r, i) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-gray-100 last:border-0", children: [
          /* @__PURE__ */ jsxs("td", { className: `py-1.5 pr-3 text-gray-800${r.note ? " min-w-0 break-words" : ""}`, children: [
            r.material,
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
