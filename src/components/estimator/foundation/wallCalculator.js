// Ported verbatim from SignEstimate Pro (src/utils/wallCalculator.js).
// Do not re-derive this math — outer wall + optional internal (fill) wall
// brick counts, mortar bags, labor and totals.

const wallSettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;

export function calcWallCosts({ wall, wallShape, wallMaterial, internalMaterial, includeInternalWall, wallHeightInches, internalWallHeightInches, mortarGapInches, internalMortarGapInches, settings }) {
  if (!wallShape || !wallMaterial || !wallShape.segments) return null;

  const isConcrete = wallMaterial.wall_material_subtype === 'concrete';
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
  wallShape.segments.forEach(seg => {
    const bricksThisCourse = Math.ceil(seg.length / brickPitch);
    totalBricks += bricksThisCourse * numCoursesRounded;
  });

  const finalBricks = wallMaterial.custom_outer_material_qty !== undefined && wallMaterial.custom_outer_material_qty !== null ? wallMaterial.custom_outer_material_qty : totalBricks;
  const materialCost = finalBricks * (wallMaterial.custom_cost_per_unit !== undefined && wallMaterial.custom_cost_per_unit !== null ? wallMaterial.custom_cost_per_unit : (wallMaterial.cost_per_unit || 0));

  const surfaceAreaSqFtSingleSide = (totalLinearInches * wallHeightInches) / 144;

  let mortarCost = 0;
  let mortarBags = 0;
  if (!isConcrete) {
    const surfaceAreaSqFtMortar = surfaceAreaSqFtSingleSide * 2;
    mortarBags = Math.ceil(surfaceAreaSqFtMortar / 30);
    const finalMortarBags = wallMaterial.custom_outer_mortar_qty !== undefined && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags;
    const mortarCostPerBag = parseFloat(wallSettingValue(settings?.wall_mortar_cost_per_bag, 10));
    const finalMortarRate = wallMaterial.custom_outer_mortar_rate !== undefined && wallMaterial.custom_outer_mortar_rate !== null ? wallMaterial.custom_outer_mortar_rate : mortarCostPerBag;
    mortarCost = finalMortarBags * finalMortarRate;
  }

  const laborRatePerSqFt = wallMaterial.custom_outer_labor_rate !== undefined && wallMaterial.custom_outer_labor_rate !== null ? wallMaterial.custom_outer_labor_rate : parseFloat(wallSettingValue(settings?.wall_labor_rate, 45));
  const minCharge = parseFloat(wallSettingValue(settings?.wall_minimum_charge, 150));

  let laborCost = surfaceAreaSqFtSingleSide * laborRatePerSqFt;
  if (laborCost < minCharge) {
    laborCost = minCharge;
  }

  const laborHours = finalBricks / (parseFloat(settings?.wall_labor_bricks_per_hour || 50));

  // --- Internal Wall Calculation ---
  let internalTotalBricks = 0;
  let internalMaterialCost = 0;
  let internalMortarCost = 0;
  let internalLaborCost = 0;
  let internalLaborHours = 0;
  let internalTotalLinearInches = 0;

  if (includeInternalWall && internalMaterial) {
    const intIsConcrete = internalMaterial.wall_material_subtype === 'concrete';
    const intUnitL = internalMaterial.wall_unit_length_inches || 8;
    const intUnitW = internalMaterial.wall_unit_width_inches || 4;
    const intUnitH = internalMaterial.wall_unit_height_inches || 2.25;
    const intMortar = intIsConcrete ? 0 : (internalMortarGapInches || 0.375);
    const intCourseH = intUnitH + intMortar;
    const intNumCourses = Math.ceil(internalWallHeightInches / intCourseH);
    const intBrickPitch = intUnitL + intMortar;

    const isClosed = wallShape.closed !== false;
    const lengthReduction = isClosed ? (unitW + intUnitW) : 0;

    wallShape.segments.forEach(seg => {
      const innerSegLength = Math.max(0, seg.length - lengthReduction);
      internalTotalLinearInches += innerSegLength;

      const bricksThisCourse = Math.ceil(innerSegLength / intBrickPitch);
      internalTotalBricks += bricksThisCourse * intNumCourses;
    });

    const finalInternalBricks = wall.custom_internal_material_qty !== undefined && wall.custom_internal_material_qty !== null ? wall.custom_internal_material_qty : internalTotalBricks;
    internalMaterialCost = finalInternalBricks * (wall.custom_internal_material_cost_per_unit !== undefined && wall.custom_internal_material_cost_per_unit !== null ? wall.custom_internal_material_cost_per_unit : (internalMaterial.cost_per_unit || 0));

    const intSurfaceAreaSqFtSingleSide = (internalTotalLinearInches * internalWallHeightInches) / 144;

    let internalMortarBags = 0;
    if (!intIsConcrete) {
      const intSurfaceAreaSqFtMortar = intSurfaceAreaSqFtSingleSide * 2;
      internalMortarBags = Math.ceil(intSurfaceAreaSqFtMortar / 30);
      const finalInternalMortarBags = wall.custom_internal_mortar_qty !== undefined && wall.custom_internal_mortar_qty !== null ? wall.custom_internal_mortar_qty : internalMortarBags;
      const internalMortarCostPerBag = parseFloat(wallSettingValue(settings?.wall_mortar_cost_per_bag, 10));
      const finalInternalMortarRate = wall.custom_internal_mortar_rate !== undefined && wall.custom_internal_mortar_rate !== null ? wall.custom_internal_mortar_rate : internalMortarCostPerBag;
      internalMortarCost = finalInternalMortarBags * finalInternalMortarRate;
    }

    const internalLaborRatePerSqFt = wall.custom_internal_labor_rate !== undefined && wall.custom_internal_labor_rate !== null ? wall.custom_internal_labor_rate : parseFloat(wallSettingValue(settings?.wall_labor_rate, 45));
    internalLaborCost = intSurfaceAreaSqFtSingleSide * internalLaborRatePerSqFt;
    internalLaborHours = finalInternalBricks / (parseFloat(settings?.wall_labor_bricks_per_hour || 50));
  }

  return {
    totalBricks,
    finalBricks,
    materialCost,
    mortarBags,
    finalMortarBags: !isConcrete ? (wallMaterial.custom_outer_mortar_qty !== undefined && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags) : 0,
    mortarCost,
    laborHours,
    laborRatePerSqFt,
    laborCost,
    totalCost: materialCost + mortarCost + laborCost + internalMaterialCost + internalMortarCost + internalLaborCost,
    totalLinearInches,
    numCourses,
    internalTotalBricks,
    internalMaterialCost,
    internalMortarBags: includeInternalWall && internalMaterial && internalMaterial.wall_material_subtype !== 'concrete' ? Math.ceil(((internalTotalLinearInches * internalWallHeightInches) / 144) * 2 / 30) : 0,
    internalMortarCost,
    internalLaborCost,
    internalLaborHours
  };
}

const assignedId = value => (typeof value === "string" && value.trim() !== "")
  || (typeof value === "number" && Number.isFinite(value));

function wallPriceNumber(value) {
  if (typeof value !== "number" && (typeof value !== "string"
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function wallPricing(wall, inventory = [], index = 0) {
  const issues = [];
  const check = (field, kind, label) => {
    const id = wall?.[field];
    const add = (code, message) => issues.push({
      kind, index, componentId: wall?.component_id ?? wall?.id ?? null,
      field, inventoryId: assignedId(id) ? id : null, code,
      message: `${label} ${index + 1}: ${message}.`,
    });
    if (!assignedId(id)) {
      add("catalog_item_unassigned", "select a catalog material");
      return null;
    }
    const matches = inventory.filter(row => row?.id === id);
    if (!matches.length) {
      add("catalog_item_unavailable", "selected catalog material is unavailable");
      return null;
    }
    if (matches.length !== 1) {
      add("catalog_item_ambiguous", "selected catalog material is ambiguous");
      return null;
    }
    const material = matches[0];
    if (!["brick_stone", "wall_material"].includes(material.material_type)) {
      add("catalog_item_type_mismatch", "selected catalog material is not a wall material");
      return null;
    }
    const override = kind === "wall"
      ? material.custom_cost_per_unit
      : wall.custom_internal_material_cost_per_unit;
    const price = override !== undefined && override !== null ? override : material.cost_per_unit;
    if (wallPriceNumber(price) === null) {
      add("wall_material_price_unavailable", "record a finite, nonnegative material unit price before repricing");
    }
    return material;
  };
  const wallMaterial = check("materialId", "wall", "Wall");
  const internalMaterial = wall?.includeInternalWall
    ? check("internalMaterialId", "internal_wall", "Internal wall")
    : null;
  return { issues, wallMaterial, internalMaterial };
}

export function foundationWallPricingIssues(wall, inventory = [], index = 0) {
  return wallPricing(wall, inventory, index).issues;
}

export function foundationWallCatalogIssues(walls = [], inventory = []) {
  return walls.flatMap((wall, index) => foundationWallPricingIssues(wall, inventory, index));
}

export function foundationWallBomRows(walls = [], inventory = []) {
  const out = [];
  const known = value => typeof value === "number" && Number.isFinite(value);
  const quantity = value => known(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} units` : "Not saved";
  const amount = value => known(value) ? value : "Not saved";
  const used = (qty, cost) => (known(qty) && qty > 0) || (known(cost) && cost !== 0);
  walls.forEach((wall, index) => {
    const costs = wall.calculatedCosts || {};
    const label = wall.name || `Wall ${index + 1}`;
    const saved = foundationWallPricingIssues(wall, inventory, index).length > 0;
    const nameOf = id => inventory.find(row => row.id === id)?.material_name || "Material";
    const add = (material, qty, cost) => out.push({ material, quantity: qty, cost: amount(cost), saved });
    if (saved || used(costs.totalBricks, costs.materialCost)) {
      add(saved ? `${label} — saved outer material` : `${label} — ${nameOf(wall.materialId)}`,
        quantity(costs.totalBricks), costs.materialCost);
    }
    if (known(costs.mortarCost) && costs.mortarCost !== 0) {
      add(`${label} — ${saved ? "saved mortar" : "mortar"}`, "—", costs.mortarCost);
    }
    const internalUsed = used(costs.internalTotalBricks, costs.internalMaterialCost);
    if ((saved && wall.includeInternalWall) || internalUsed) {
      add(saved ? `${label} — saved internal material` : `${label} — ${nameOf(wall.internalMaterialId)} (internal)`,
        quantity(costs.internalTotalBricks), costs.internalMaterialCost);
    }
    if (known(costs.internalMortarCost) && costs.internalMortarCost !== 0) {
      add(`${label} — ${saved ? "saved internal mortar" : "internal mortar"}`, "—", costs.internalMortarCost);
    }
  });
  return out;
}

// Runs the legacy wall math only when the selected material basis is available.
export function calcWalls(project, inventory, settings = {}, options = {}) {
  const walls = project.walls || [];
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedWalls");
  const savedWalls = Array.isArray(options?.savedWalls) ? options.savedWalls : [];
  const counts = rows => {
    const out = new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(walls), savedCounts = counts(savedWalls);
  const savedById = new Map(savedWalls.filter(row => assignedId(row?.component_id))
    .map(row => [row.component_id, row]));
  const held = wall => {
    const id = wall?.component_id;
    const acknowledged = explicitSnapshot
      ? assignedId(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1
        ? savedById.get(id) : null
      : wall;
    const costs = acknowledged?.calculatedCosts;
    return {
      ...wall,
      calculatedCosts: costs && typeof costs === "object" && !Array.isArray(costs) ? { ...costs } : {},
    };
  };
  return walls.map((wall, index) => {
    const { wallMaterial, internalMaterial, issues } = wallPricing(wall, inventory, index);
    if (issues.length) return held(wall);
    const costs =
      calcWallCosts({
        wall,
        wallShape: wall.shape,
        wallMaterial,
        internalMaterial,
        includeInternalWall: wall.includeInternalWall,
        wallHeightInches: wall.heightInches || 24,
        internalWallHeightInches: wall.internalWallHeightInches || wall.heightInches || 24,
        mortarGapInches: wall.mortarGapInches ?? 0.375,
        internalMortarGapInches: wall.internalMortarGapInches ?? 0.375,
        settings,
      }) || {};
    return {
      ...wall,
      calculatedCosts: {
        totalBricks: costs.finalBricks || 0,
        materialCost: costs.materialCost || 0,
        mortarCost: costs.mortarCost || 0,
        laborHours: costs.laborHours || 0,
        laborCost: costs.laborCost || 0,
        totalCost: costs.totalCost || 0,
        totalLinearInches: costs.totalLinearInches || 0,
        numCourses: costs.numCourses || 0,
        internalTotalBricks: costs.internalTotalBricks || 0,
        internalMaterialCost: costs.internalMaterialCost || 0,
        internalMortarCost: costs.internalMortarCost || 0,
        internalLaborCost: costs.internalLaborCost || 0,
        internalLaborHours: costs.internalLaborHours || 0,
      },
    };
  });
}