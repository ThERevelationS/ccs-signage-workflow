// Ported verbatim from SignEstimate Pro (src/utils/wallCalculator.js).
// Do not re-derive this math — outer wall + optional internal (fill) wall
// brick counts, mortar bags, labor and totals.

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
    const mortarCostPerBag = parseFloat(settings?.wall_mortar_cost_per_bag || 10);
    const finalMortarRate = wallMaterial.custom_outer_mortar_rate !== undefined && wallMaterial.custom_outer_mortar_rate !== null ? wallMaterial.custom_outer_mortar_rate : mortarCostPerBag;
    mortarCost = finalMortarBags * finalMortarRate;
  }

  const laborRatePerSqFt = wallMaterial.custom_outer_labor_rate !== undefined && wallMaterial.custom_outer_labor_rate !== null ? wallMaterial.custom_outer_labor_rate : parseFloat(settings?.wall_labor_rate || 45);
  const minCharge = parseFloat(settings?.wall_minimum_charge || 150);

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
      const internalMortarCostPerBag = parseFloat(settings?.wall_mortar_cost_per_bag || 10);
      const finalInternalMortarRate = wall.custom_internal_mortar_rate !== undefined && wall.custom_internal_mortar_rate !== null ? wall.custom_internal_mortar_rate : internalMortarCostPerBag;
      internalMortarCost = finalInternalMortarBags * finalInternalMortarRate;
    }

    const internalLaborRatePerSqFt = wall.custom_internal_labor_rate !== undefined && wall.custom_internal_labor_rate !== null ? wall.custom_internal_labor_rate : parseFloat(settings?.wall_labor_rate || 45);
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

// Runs the legacy wall math for every wall on a FoundationProject.
export function calcWalls(project, inventory, settings = {}) {
  const find = (id) => inventory.find((i) => i.id === id);
  return (project.walls || []).map((wall) => {
    const costs =
      calcWallCosts({
        wall,
        wallShape: wall.shape,
        wallMaterial: find(wall.materialId),
        internalMaterial: find(wall.internalMaterialId),
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