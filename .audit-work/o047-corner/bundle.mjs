// src/components/masterInventory/inventoryNormalization.js
var inventorySettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
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

// src/components/estimator/foundation/wallCalculator.js
var CUBIC_INCHES_PER_CUBIC_YARD = 46656;
function calcWallCosts({ wall, wallShape, wallMaterial, internalMaterial, includeInternalWall, wallHeightInches, internalWallHeightInches, mortarGapInches, internalMortarGapInches, wasteFraction, settings }) {
  if (!wallShape || !wallMaterial || !wallShape.segments) return null;
  const waste = Number.isFinite(wasteFraction) && wasteFraction > 0 ? wasteFraction : 0;
  const isConcrete = canonicalWallMaterialSubtype(wallMaterial.wall_material_subtype) === "concrete";
  const unitL = wallMaterial.wall_unit_length_inches || 8;
  const unitW = wallMaterial.wall_unit_width_inches || 4;
  const unitH = wallMaterial.wall_unit_height_inches || 2.25;
  const mortar = isConcrete ? 0 : mortarGapInches;
  const courseH = unitH + mortar;
  const numCourses = isConcrete ? 0 : wallHeightInches / courseH;
  const brickPitch = unitL + (isConcrete ? 0 : mortar);
  const outerSegCount = wallShape.segments.length;
  const isClosedOutline = wallShape.closed !== false;
  const outerCorners = isClosedOutline ? outerSegCount : Math.max(0, outerSegCount - 1);
  const outerReductionPerSeg = outerSegCount ? unitW * outerCorners / outerSegCount : 0;
  const outerSegLength = (seg) => Math.max(0, seg.length - outerReductionPerSeg);
  const totalLinearInches = wallShape.segments.reduce((s, seg) => s + outerSegLength(seg), 0);
  const grossSqFt = totalLinearInches * wallHeightInches / 144;
  const openings = Array.isArray(wall?.openings) ? wall.openings : [];
  const openingsValid = openings.every((o) => {
    const ow = Number(o?.width_inches), oh = Number(o?.height_inches);
    return Number.isFinite(ow) && ow > 0 && Number.isFinite(oh) && oh > 0;
  });
  const openSqFt = !openingsValid ? 0 : openings.reduce((s, o) => s + Number(o.width_inches) * Number(o.height_inches) / 144, 0);
  let totalBricks = 0;
  if (isConcrete) {
    totalBricks = totalLinearInches * wallHeightInches * unitW / CUBIC_INCHES_PER_CUBIC_YARD;
  } else {
    const numCoursesRounded = Math.ceil(numCourses);
    const bond = Number.isFinite(Number(wall?.bond_fraction)) && Number(wall.bond_fraction) > 0 && Number(wall.bond_fraction) < 1 ? Number(wall.bond_fraction) : 0;
    const staggeredBricks = bond > 0 && numCoursesRounded > 1 ? numCoursesRounded - 1 : 0;
    wallShape.segments.forEach((seg) => {
      const bricksThisCourse = Math.ceil(outerSegLength(seg) / brickPitch);
      totalBricks += bricksThisCourse * numCoursesRounded + staggeredBricks;
    });
  }
  if (isConcrete) {
    totalBricks -= openSqFt * (unitW / 12) / 27;
  } else {
    const bricksPerSqFt = grossSqFt > 0 ? totalBricks / grossSqFt : 0;
    totalBricks = Math.max(0, totalBricks - Math.ceil(openSqFt * bricksPerSqFt));
  }
  totalBricks = isConcrete ? totalBricks * (1 + waste) : Math.ceil(totalBricks * (1 + waste));
  const finalBricks = wallMaterial.custom_outer_material_qty !== void 0 && wallMaterial.custom_outer_material_qty !== null ? wallMaterial.custom_outer_material_qty : totalBricks;
  const materialCost = finalBricks * (wallMaterial.custom_cost_per_unit !== void 0 && wallMaterial.custom_cost_per_unit !== null ? wallMaterial.custom_cost_per_unit : wallMaterial.cost_per_unit || 0);
  const surfaceAreaSqFtSingleSide = Math.max(0, grossSqFt - openSqFt) * (1 + waste);
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
  const laborHours = isConcrete ? 0 : finalBricks / parseFloat(inventorySettingValue(settings?.wall_labor_bricks_per_hour, 50));
  let internalTotalBricks = 0;
  let internalMaterialCost = 0;
  let internalMortarCost = 0;
  let internalLaborCost = 0;
  let internalLaborHours = 0;
  let internalTotalLinearInches = 0;
  let intIsConcrete = false;
  if (includeInternalWall && internalMaterial) {
    intIsConcrete = canonicalWallMaterialSubtype(internalMaterial.wall_material_subtype) === "concrete";
    const intUnitL = internalMaterial.wall_unit_length_inches || 8;
    const intUnitW = internalMaterial.wall_unit_width_inches || 4;
    const intUnitH = internalMaterial.wall_unit_height_inches || 2.25;
    const intMortar = intIsConcrete ? 0 : internalMortarGapInches ?? 0.375;
    const intCourseH = intUnitH + intMortar;
    const intNumCourses = Math.ceil(internalWallHeightInches / intCourseH);
    const intBrickPitch = intUnitL + intMortar;
    const intSegCount = wallShape.segments.length;
    const intCorners = isClosedOutline ? intSegCount : Math.max(0, intSegCount - 1);
    const lengthReduction = intSegCount ? (unitW + intUnitW) * intCorners / intSegCount : 0;
    wallShape.segments.forEach((seg) => {
      const innerSegLength = Math.max(0, seg.length - lengthReduction);
      internalTotalLinearInches += innerSegLength;
      if (intIsConcrete) {
        internalTotalBricks += innerSegLength * internalWallHeightInches * intUnitW / CUBIC_INCHES_PER_CUBIC_YARD;
      } else {
        const bricksThisCourse = Math.ceil(innerSegLength / intBrickPitch);
        internalTotalBricks += bricksThisCourse * intNumCourses;
      }
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
    internalLaborHours = intIsConcrete ? 0 : finalInternalBricks / parseFloat(inventorySettingValue(settings?.wall_labor_bricks_per_hour, 50));
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
    internalMortarBags: includeInternalWall && internalMaterial && !intIsConcrete ? Math.ceil(internalTotalLinearInches * internalWallHeightInches / 144 * 2 / 30) : 0,
    internalMortarCost,
    internalLaborCost,
    internalLaborHours
  };
}
export {
  calcWallCosts
};
