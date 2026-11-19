// remotetree/src/components/masterInventory/inventoryNormalization.js
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

// remotetree/src/components/estimator/foundation/wallCalculator.js
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
  const laborHours = finalBricks / parseFloat(inventorySettingValue(settings?.wall_labor_bricks_per_hour, 50));
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
      const internalMortarCostPerBag = parseFloat(inventorySettingValue(settings?.wall_mortar_cost_per_bag, 10));
      const finalInternalMortarRate = wall.custom_internal_mortar_rate !== void 0 && wall.custom_internal_mortar_rate !== null ? wall.custom_internal_mortar_rate : internalMortarCostPerBag;
      internalMortarCost = finalInternalMortarBags * finalInternalMortarRate;
    }
    const internalLaborRatePerSqFt = wall.custom_internal_labor_rate !== void 0 && wall.custom_internal_labor_rate !== null ? wall.custom_internal_labor_rate : parseFloat(inventorySettingValue(settings?.wall_labor_rate, 45));
    internalLaborCost = intSurfaceAreaSqFtSingleSide * internalLaborRatePerSqFt;
    internalLaborHours = finalInternalBricks / parseFloat(inventorySettingValue(settings?.wall_labor_bricks_per_hour, 50));
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
function foundationWallRectangle(length, width) {
  const l = inventoryPositiveNumber(length), w = inventoryPositiveNumber(width);
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
    const override = kind === "wall" ? material.custom_cost_per_unit : wall.custom_internal_material_cost_per_unit;
    const price = override !== void 0 && override !== null ? override : material.cost_per_unit;
    if (inventoryNonnegativeNumber(price) === null) {
      add2("wall_material_price_unavailable", "record a finite, nonnegative material unit price before repricing");
    }
    const normalizedMaterial = { ...material };
    for (const [key, label2] of [
      ["wall_unit_length_inches", "unit length"],
      ["wall_unit_width_inches", "unit width"],
      ["wall_unit_height_inches", "unit height"]
    ]) {
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
  const known = (value) => typeof value === "number" && Number.isFinite(value);
  const quantity = (value) => known(value) ? `${value.toLocaleString(void 0, { maximumFractionDigits: 2 })} units` : "Not saved";
  const amount = (value) => known(value) ? value : "Not saved";
  const used = (qty, cost) => known(qty) && qty > 0 || known(cost) && cost !== 0;
  walls.forEach((wall, index) => {
    const costs = wall.calculatedCosts || {};
    const label = wall.name || `Wall ${index + 1}`;
    const saved = Array.isArray(wallPricing2) && wallPricing2[index] ? wallPricing2[index].available === false : foundationWallPricingIssues(wall, inventory, index).length > 0;
    const nameOf = (id) => inventory.find((row) => row.id === id)?.material_name || "Material";
    const add = (material, qty, cost) => out.push({ material, quantity: qty, cost: amount(cost), saved });
    if (saved || used(costs.totalBricks, costs.materialCost)) {
      add(
        saved ? `${label} \u2014 saved outer material` : `${label} \u2014 ${nameOf(wall.materialId)}`,
        quantity(costs.totalBricks),
        costs.materialCost
      );
    }
    if (known(costs.mortarCost) && costs.mortarCost !== 0) {
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
    if (known(costs.internalMortarCost) && costs.internalMortarCost !== 0) {
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
export {
  calcWallCosts,
  calcWalls,
  foundationWallBomRows,
  foundationWallCatalogIssues,
  foundationWallOutlineBasis,
  foundationWallPricingIssues,
  foundationWallRectangle,
  foundationWallSegments
};
