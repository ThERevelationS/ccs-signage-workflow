// Ported verbatim from SignEstimate Pro (src/utils/wallCalculator.js).
// Do not re-derive this math â€” outer wall + optional internal (fill) wall
// brick counts, mortar bags, labor and totals.
//
// Residual-input hardening: a malformed mortar gap, override quantity/rate, or
// wall labor setting is not a free or negative wall â€” the row is held with its
// acknowledged snapshot amounts and reported instead of silently repricing to
// $0 or producing negative/NaN quantities.

// Inventory normalization boundary (CMP-A08): the canonical settings pick,
// price/dimension kernels and their setting compositions live in
// masterInventory/inventoryNormalization. CMP-D03 adds the canonical wall
// material subtype classifier â€” brick/CMU/stone are unit masonry priced by
// unit count, `concrete` is poured concrete priced by placed volume (CY).
import {
  inventorySettingValue as wallSettingValue,
  inventoryNonnegativeNumber as wallPriceNumber,
  inventoryPositiveNumber as wallDimensionNumber,
  inventorySettingNumber as wallSettingNumber,
  inventoryPositiveSettingNumber as wallPositiveSettingNumber,
  canonicalWallMaterialSubtype,
  wallMaterialSubtypeRecorded,
} from "@/components/masterInventory/inventoryNormalization";
// O-009 tail: catalog lifecycle classification is the single contract â€” a
// resolved-but-inactive/deleted wall material flags catalog_item_inactive /
// catalog_item_deleted instead of silently repricing (the acknowledged
// snapshot holds through the unchanged issues channel). The integrity module
// imports foundationWallCatalogIssues back from this file â€” both directions
// are call-time function declarations, so the import cycle is eval-safe.
import { foundationCatalogRowAvailability } from "./foundationCatalogIntegrity";

// 36Â³ inÂ³ per cubic yard â€” the poured-concrete wall quantity conversion.
const CUBIC_INCHES_PER_CUBIC_YARD = 46656;

// Recorded `unit` spellings accepted as the cubic-yard cost basis on a
// poured-concrete catalog row. A blank unit keeps the catalog's implicit
// $/CY basis; any OTHER recorded unit is an unresolved price-basis ambiguity
// the check reports rather than guessing (never silently repriced wrong).
const POURED_CONCRETE_UNIT_BASIS = new Set([
  "cy", "cyd", "cy_d", "yd", "yd3", "cu_yd", "cubic_yard", "cubic_yards", "yard", "yards",
]);

export function calcWallCosts({ wall, wallShape, wallMaterial, internalMaterial, includeInternalWall, wallHeightInches, internalWallHeightInches, mortarGapInches, internalMortarGapInches, wasteFraction, settings }) {
  if (!wallShape || !wallMaterial || !wallShape.segments) return null;

  // O-047 -- authored waste/cut factor: `wall.wasteFraction` (0..0.5, e.g.
  // 0.1 = +10%) scales the geometry-derived brick/mortar/labor quantities
  // before rounding; absent or malformed stays 0 (never a silent default).
  const waste = Number.isFinite(wasteFraction) && wasteFraction > 0 ? wasteFraction : 0;

  // CMP-D03: the canonical subtype picks the quantity method. Unit masonry
  // (brick / cinderblock / stone) counts units from cataloged unit dimensions;
  // `concrete` is poured â€” its material quantity is the placed volume in
  // cubic yards (outline perimeter x wall height x cataloged wall thickness),
  // with no courses, mortar joints, or per-unit production-hours basis.
  const isConcrete = canonicalWallMaterialSubtype(wallMaterial.wall_material_subtype) === 'concrete';
  const unitL = wallMaterial.wall_unit_length_inches || 8;
  const unitW = wallMaterial.wall_unit_width_inches || 4;
  const unitH = wallMaterial.wall_unit_height_inches || 2.25;
  const mortar = isConcrete ? 0 : mortarGapInches;
  const courseH = unitH + mortar;
  const numCourses = isConcrete ? 0 : wallHeightInches / courseH;
  const brickPitch = unitL + (isConcrete ? 0 : mortar);

  // O-047 (CMP-D04) -- corner/return adjustment: at each corner vertex the
  // returning run's units overlap the through-run's corner zone by ~one unit
  // width, so the unit-count basis loses unitW per corner. A closed outline
  // has one corner per segment; an open polyline has corners only at its
  // interior vertices (a single straight run has none). The deduction is
  // apportioned per segment and clamps at 0 — a short segment never prices
  // a negative length.
  const outerSegCount = wallShape.segments.length;
  const isClosedOutline = wallShape.closed !== false;
  const outerCorners = isClosedOutline ? outerSegCount : Math.max(0, outerSegCount - 1);
  const outerReductionPerSeg = outerSegCount ? (unitW * outerCorners) / outerSegCount : 0;
  const outerSegLength = (seg) => Math.max(0, seg.length - outerReductionPerSeg);
  const totalLinearInches = wallShape.segments.reduce((s, seg) => s + outerSegLength(seg), 0);
  const grossSqFt = (totalLinearInches * wallHeightInches) / 144;

  // O-045 (CMP-D02) -- authored wall openings deduct their area from masonry
  // quantities. Each opening must carry finite positive width+height; a
  // malformed row holds the WHOLE deduction (never a partial subtraction).
  const openings = Array.isArray(wall?.openings) ? wall.openings : [];
  const openingsValid = openings.every((o) => {
    const ow = Number(o?.width_inches), oh = Number(o?.height_inches);
    return Number.isFinite(ow) && ow > 0 && Number.isFinite(oh) && oh > 0;
  });
  const openSqFt = !openingsValid
    ? 0
    : openings.reduce((s, o) => s + (Number(o.width_inches) * Number(o.height_inches)) / 144, 0);

  let totalBricks = 0;
  if (isConcrete) {
    // Poured concrete â€” distinct quantity method: volume of the placed wall.
    totalBricks = (totalLinearInches * wallHeightInches * unitW) / CUBIC_INCHES_PER_CUBIC_YARD;
  } else {
    const numCoursesRounded = Math.ceil(numCourses);
    // O-047 (CMP-D04) -- bond/offset quantity effect: a `bond_fraction`
    // (0..1, e.g. 0.5 = half-bond stagger) adds a partial brick at the
    // wall's ends for every staggered course — the offset starts the course
    // on a partial unit, not a full one (the bond stagger's quantity effect,
    // not a silent no-op on the authored field).
    const bond = Number.isFinite(Number(wall?.bond_fraction)) && Number(wall.bond_fraction) > 0 && Number(wall.bond_fraction) < 1
      ? Number(wall.bond_fraction) : 0;
    const staggeredBricks = bond > 0 && numCoursesRounded > 1 ? numCoursesRounded - 1 : 0;
    wallShape.segments.forEach(seg => {
      const bricksThisCourse = Math.ceil(outerSegLength(seg) / brickPitch);
      totalBricks += (bricksThisCourse * numCoursesRounded) + staggeredBricks;
    });
  }
  // O-045 -- openings deduct their equivalent quantity on either basis.
  if (isConcrete) {
    totalBricks -= (openSqFt * (unitW / 12)) / 27;
  } else {
    const bricksPerSqFt = grossSqFt > 0 ? totalBricks / grossSqFt : 0;
    totalBricks = Math.max(0, totalBricks - Math.ceil(openSqFt * bricksPerSqFt));
  }
  // O-047 -- waste scales the quantity on either basis: CY stays fractional,
  // a unit count rounds up to whole pieces.
  totalBricks = isConcrete ? totalBricks * (1 + waste) : Math.ceil(totalBricks * (1 + waste));

  const finalBricks = wallMaterial.custom_outer_material_qty !== undefined && wallMaterial.custom_outer_material_qty !== null ? wallMaterial.custom_outer_material_qty : totalBricks;
  const materialCost = finalBricks * (wallMaterial.custom_cost_per_unit !== undefined && wallMaterial.custom_cost_per_unit !== null ? wallMaterial.custom_cost_per_unit : (wallMaterial.cost_per_unit || 0));

  const surfaceAreaSqFtSingleSide = Math.max(0, grossSqFt - openSqFt) * (1 + waste); // O-045 openings + O-047 waste/cut factor

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

  // Poured work is priced by wall-face area (laborCost) â€” there is no
  // per-unit production-hours basis to divide by, so hours stay 0 rather than
  // minting a fictitious bricks-per-hour figure on a CY quantity.
  const laborHours = isConcrete ? 0 : finalBricks / (parseFloat(wallSettingValue(settings?.wall_labor_bricks_per_hour, 50)));

  // --- Internal Wall Calculation ---
  let internalTotalBricks = 0;
  let internalMaterialCost = 0;
  let internalMortarCost = 0;
  let internalLaborCost = 0;
  let internalLaborHours = 0;
  let internalTotalLinearInches = 0;
  let intIsConcrete = false;

  if (includeInternalWall && internalMaterial) {
    intIsConcrete = canonicalWallMaterialSubtype(internalMaterial.wall_material_subtype) === 'concrete';
    const intUnitL = internalMaterial.wall_unit_length_inches || 8;
    const intUnitW = internalMaterial.wall_unit_width_inches || 4;
    const intUnitH = internalMaterial.wall_unit_height_inches || 2.25;
    const intMortar = intIsConcrete ? 0 : (internalMortarGapInches ?? 0.375);
    const intCourseH = intUnitH + intMortar;
    const intNumCourses = Math.ceil(internalWallHeightInches / intCourseH);
    const intBrickPitch = intUnitL + intMortar;

    // O-047 -- the internal fill's corner reduction now rides the same
    // corner count as the outer wall: closed outlines keep the exact
    // unitW+intUnitW-per-segment reduction they always had; open polylines
    // deduct at their interior return joints too (segments-1 corners).
    const intSegCount = wallShape.segments.length;
    const intCorners = isClosedOutline ? intSegCount : Math.max(0, intSegCount - 1);
    const lengthReduction = intSegCount ? ((unitW + intUnitW) * intCorners) / intSegCount : 0;

    wallShape.segments.forEach(seg => {
      const innerSegLength = Math.max(0, seg.length - lengthReduction);
      internalTotalLinearInches += innerSegLength;

      // Poured internal fill prices by placed volume too â€” same CY method as
      // the outer wall; unit masonry keeps the per-course unit count.
      if (intIsConcrete) {
        internalTotalBricks += (innerSegLength * internalWallHeightInches * intUnitW) / CUBIC_INCHES_PER_CUBIC_YARD;
      } else {
        const bricksThisCourse = Math.ceil(innerSegLength / intBrickPitch);
        internalTotalBricks += bricksThisCourse * intNumCourses;
      }
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
    internalLaborHours = intIsConcrete ? 0
      : finalInternalBricks / (parseFloat(wallSettingValue(settings?.wall_labor_bricks_per_hour, 50)));
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
    internalMortarBags: includeInternalWall && internalMaterial && !intIsConcrete ? Math.ceil(((internalTotalLinearInches * internalWallHeightInches) / 144) * 2 / 30) : 0,
    internalMortarCost,
    internalLaborCost,
    internalLaborHours
  };
}

const assignedId = value => (typeof value === "string" && value.trim() !== "")
  || (typeof value === "number" && Number.isFinite(value));

// Missing/blank settings fall back to the module default; present values must be
// finite nonnegative numbers (explicit 0 honored â€” a genuinely free rate).
// wallSettingNumber / wallPositiveSettingNumber are boundary aliases (rates
// that are meaningless at zero â€” production speed â€” must be finite positive).

// Blank/absent mortar gaps keep the ported 3/8" default; a recorded gap must be
// finite nonnegative â€” explicit 0 is a legitimate stack-bond joint.
const WALL_MORTAR_GAP_DEFAULT = 0.375;
const wallMortarGapNumber = (value) => value === undefined || value === null || value === ""
  ? WALL_MORTAR_GAP_DEFAULT : wallPriceNumber(value);

const wallRecord = value => !!value && typeof value === "object" && !Array.isArray(value);
const wallPoint = point => wallRecord(point)
  && typeof point.x === "number" && Number.isFinite(point.x)
  && typeof point.z === "number" && Number.isFinite(point.z);

export function foundationWallSegments(points, closed = false) {
  if (!Array.isArray(points) || !points.every(wallPoint) || typeof closed !== "boolean") return null;
  const segments = [];
  const add = (a, b) => segments.push({ length: Math.hypot(b.x - a.x, b.z - a.z) });
  for (let i = 0; i < points.length - 1; i++) add(points[i], points[i + 1]);
  if (closed && points.length > 2) add(points[points.length - 1], points[0]);
  return segments.every(segment => Number.isFinite(segment.length)) ? segments : null;
}

export function foundationWallOutlineBasis(shape) {
  const result = {
    shape: null, points: [], closed: shape?.closed === true,
    hasRecordedPoints: false, perimeterInches: null, issues: [],
  };
  const add = (code, message) => result.issues.push({ code, message });
  const unavailable = () => add("wall_outline_unavailable", "draw an outline with positive segment lengths before repricing");
  if (!wallRecord(shape)) { unavailable(); return result; }
  result.hasRecordedPoints = shape.points != null
    && (!Array.isArray(shape.points) || shape.points.length > 0);
  const validPoints = Array.isArray(shape.points) && shape.points.every(wallPoint);
  if (validPoints) result.points = shape.points.map(point => ({ ...point }));
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
    const lengths = shape.segments.map(segment => wallRecord(segment) ? wallDimensionNumber(segment.length) : null);
    if (lengths.some(length => length === null)) {
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
    const same = result.points.length >= (shape.closed ? 3 : 2)
      && expected && expected.length === segments.length && expected.every((segment, index) => {
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

export function foundationWallRectangle(length, width) {
  const l = wallDimensionNumber(length), w = wallDimensionNumber(width);
  if (l === null || w === null) return null;
  const points = [{ x: 0, z: 0 }, { x: l, z: 0 }, { x: l, z: w }, { x: 0, z: w }];
  return foundationWallOutlineBasis({ points, closed: true, segments: foundationWallSegments(points, true) }).shape;
}

const WALL_SETTING_DEFAULTS = {
  wall_mortar_cost_per_bag: 10,
  wall_labor_rate: 45,
  wall_minimum_charge: 150,
  wall_labor_bricks_per_hour: 50,
};
const WALL_OUTER_OVERRIDE_FIELDS = [
  ["custom_outer_material_qty", "material quantity"],
  ["custom_outer_labor_rate", "labor rate"],
];
const WALL_OUTER_MORTAR_OVERRIDE_FIELDS = [
  ["custom_outer_mortar_qty", "mortar quantity"],
  ["custom_outer_mortar_rate", "mortar rate"],
];
const WALL_INTERNAL_OVERRIDE_FIELDS = [
  ["custom_internal_material_qty", "material quantity"],
  ["custom_internal_labor_rate", "labor rate"],
];
const WALL_INTERNAL_MORTAR_OVERRIDE_FIELDS = [
  ["custom_internal_mortar_qty", "mortar quantity"],
  ["custom_internal_mortar_rate", "mortar rate"],
];

function wallPricing(wall, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const heightInches = wallDimensionNumber(wall?.heightInches);
  const internalWallHeightInches = wall?.includeInternalWall
    ? wallDimensionNumber(wall.internalWallHeightInches ?? wall.heightInches) : null;
  const heightIssue = (field, kind, label, code) => issues.push({
    kind, index, componentId: wall?.component_id ?? wall?.id ?? null,
    field, inventoryId: wall?.[kind === "wall" ? "materialId" : "internalMaterialId"] ?? null, code,
    message: `${label} ${index + 1}: record a positive, finite wall height in inches before repricing.`,
  });
  if (heightInches === null) heightIssue("heightInches", "wall", "Wall", "wall_height_unavailable");
  if (wall?.includeInternalWall && internalWallHeightInches === null) {
    heightIssue("internalWallHeightInches", "internal_wall", "Internal wall", "internal_wall_height_unavailable");
  }
  const outline = foundationWallOutlineBasis(wall?.shape);
  issues.push(...outline.issues.map(issue => ({
    ...issue, kind: "wall", index, componentId: wall?.component_id ?? wall?.id ?? null,
    field: "shape", inventoryId: wall?.materialId ?? null,
    message: `Wall ${index + 1}: ${issue.message}.`,
  })));
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
    // O-009 tail: existence -> type -> lifecycle -> consumed basis, the item
    // scan's precedence. A resolved-but-inactive/deleted row priced silently
    // before; flagging here holds the wall on its acknowledged snapshot.
    const availability = foundationCatalogRowAvailability(material);
    if (availability !== "active") {
      add(availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted"
          ? "selected catalog material is marked deleted â€” pick a replacement"
          : "selected catalog material is inactive â€” reactivate it or pick a replacement");
      return null;
    }
    const override = kind === "wall"
      ? material.custom_cost_per_unit
      : wall.custom_internal_material_cost_per_unit;
    const price = override !== undefined && override !== null ? override : material.cost_per_unit;
    if (wallPriceNumber(price) === null) {
      add("wall_material_price_unavailable", "record a finite, nonnegative material unit price before repricing");
    }
    // CMP-D03: the recorded subtype picks the quantity method. Absent or blank
    // keeps the legacy unit-masonry default (brick_stone rows never carried a
    // subtype); a recorded-but-unrecognized subtype is held â€” pouring concrete
    // spelled off-enum must never silently price as mortared unit masonry, and
    // an unknown material family must never be guessed concrete either.
    const subtype = canonicalWallMaterialSubtype(material.wall_material_subtype);
    if (wallMaterialSubtypeRecorded(material.wall_material_subtype) && subtype === null) {
      add("wall_material_subtype_unavailable",
        "record a supported wall material subtype (brick, cinderblock / CMU, stone, or poured concrete) before repricing");
      return null;
    }
    const pouredConcrete = subtype === "concrete";
    // A poured row's cost basis is $/CY. A blank unit keeps that basis; any
    // OTHER recorded unit is a real price-basis ambiguity â€” hold it rather
    // than multiply cubic yards by a per-each price.
    if (pouredConcrete) {
      const recordedUnit = material.unit;
      const unitRecorded = recordedUnit !== undefined && recordedUnit !== null
        && (typeof recordedUnit !== "string" || recordedUnit.trim() !== "");
      if (unitRecorded) {
        const unitKey = typeof recordedUnit === "string"
          ? recordedUnit.trim().toLowerCase().replace(/[\s\-_.]+/g, "_").replace(/^_+|_+$/g, "")
          : String(recordedUnit);
        if (!POURED_CONCRETE_UNIT_BASIS.has(unitKey)) {
          add("wall_material_unit_mismatch",
            "poured concrete is priced per cubic yard â€” record the unit as CY (or clear it) so the cost basis is unambiguous before repricing");
        }
      }
    }
    const normalizedMaterial = { ...material };
    // The canonical subtype spelling rides the calculation copy so the
    // strict `=== 'concrete'` reads below stay exact even when this row was
    // classified from a recorded alias ("poured concrete", "cmu").
    if (subtype !== null) normalizedMaterial.wall_material_subtype = subtype;
    // Poured concrete has no unit length/height â€” a wall's face dimensions
    // come from the authored outline and height; the only cataloged
    // dimension is the wall thickness it is poured to (unit width field).
    for (const [key, label] of (pouredConcrete
      ? [["wall_unit_width_inches", "wall thickness"]]
      : [["wall_unit_length_inches", "unit length"], ["wall_unit_width_inches", "unit width"], ["wall_unit_height_inches", "unit height"]])) {
      const dimension = wallDimensionNumber(material[key]);
      if (dimension === null) {
        add(key + "_unavailable", `record a positive, finite ${label} in inches before repricing`);
      } else {
        normalizedMaterial[key] = dimension;
      }
    }
    return normalizedMaterial;
  };
  const wallMaterial = check("materialId", "wall", "Wall");
  const internalMaterial = wall?.includeInternalWall
    ? check("internalMaterialId", "internal_wall", "Internal wall")
    : null;

  // Residual-input checks mirror the pole unit: only values the ported math
  // actually consumes are validated, each on a normalized calculation copy â€”
  // authored rows and settings are never mutated. An explicit 0 override or
  // mortar gap is legitimate; negatives/malformed values hold the wall.
  const add = (kind, field, inventoryId, code, message) => issues.push({
    kind, index, componentId: wall?.component_id ?? wall?.id ?? null,
    field, inventoryId: inventoryId ?? null, code,
    message: `${kind === "internal_wall" ? "Internal wall" : "Wall"} ${index + 1}: ${message}.`,
  });
  const overrideCheck = (source, fields, kind, inventoryId) => {
    for (const [field, label] of fields) {
      const raw = source?.[field];
      if (raw === undefined || raw === null) continue;
      const value = wallPriceNumber(raw);
      if (value === null) {
        add(kind, field, inventoryId, field + "_unavailable",
          `record a finite, nonnegative ${label} override or clear it before repricing`);
      } else {
        source[field] = value;
      }
    }
  };
  const settingCheck = (key, label, positive) => {
    const value = positive
      ? wallPositiveSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key])
      : wallSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]);
    if (value === null) {
      add("wall", key, wall?.materialId, "wall_setting_unavailable",
        `record a finite, ${positive ? "positive" : "nonnegative"} ${label} in Estimator Settings before repricing`);
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
    // The production-rate setting is only consumed by unit-masonry paths â€” a
    // poured wall has no per-unit hours basis, so a malformed setting must not
    // hold a poured wall it cannot affect (unit fill still consumes it).
    if (!outerConcrete || (internalMaterial && !intConcrete)) {
      settingCheck("wall_labor_bricks_per_hour", "wall production rate", true);
    }
    if (!outerConcrete) {
      mortarGapInches = wallMortarGapNumber(wall?.mortarGapInches);
      if (mortarGapInches === null) {
        add("wall", "mortarGapInches", wall?.materialId, "wall_mortar_gap_unavailable",
          "record a finite, nonnegative mortar gap in inches before repricing");
      }
      overrideCheck(wallMaterial, WALL_OUTER_MORTAR_OVERRIDE_FIELDS, "wall", wall?.materialId);
    }
  }
  if (wall?.includeInternalWall && internalMaterial) {
    overrideCheck(calcWall, WALL_INTERNAL_OVERRIDE_FIELDS, "internal_wall", wall?.internalMaterialId);
    if (!intConcrete) {
      internalMortarGapInches = wallMortarGapNumber(wall?.internalMortarGapInches);
      if (internalMortarGapInches === null) {
        add("internal_wall", "internalMortarGapInches", wall?.internalMaterialId, "internal_wall_mortar_gap_unavailable",
          "record a finite, nonnegative mortar gap in inches before repricing");
      }
      overrideCheck(calcWall, WALL_INTERNAL_MORTAR_OVERRIDE_FIELDS, "internal_wall", wall?.internalMaterialId);
    }
  }
  if ((wallMaterial && !outerConcrete) || (internalMaterial && !intConcrete)) {
    settingCheck("wall_mortar_cost_per_bag", "mortar cost per bag");
  }

  return {
    issues, wallMaterial, internalMaterial, heightInches, internalWallHeightInches,
    wallShape: outline.shape, calcWall, mortarGapInches, internalMortarGapInches,
  };
}

export function foundationWallPricingIssues(wall, inventory = [], index = 0, settings = {}) {
  return wallPricing(wall, inventory, index, settings).issues;
}

export function foundationWallCatalogIssues(walls = [], inventory = [], settings = {}) {
  return walls.flatMap((wall, index) => foundationWallPricingIssues(wall, inventory, index, settings));
}

export function foundationWallBomRows(walls = [], inventory = [], wallPricing) {
  const out = [];
  const known = value => typeof value === "number" && Number.isFinite(value);
  // CMP-D03: the material quantity is labeled in its recorded basis â€” the
  // snapshot's materialQuantityUnit ("cy" placed volume on poured rows vs the
  // unit-masonry count). Snapshots pre-dating the flag keep the legacy
  // "units" vocabulary â€” the acknowledged number is never re-labeled.
  const quantity = (value, unit = "units") => known(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}` : "Not saved";
  const amount = value => known(value) ? value : "Not saved";
  const used = (qty, cost) => (known(qty) && qty > 0) || (known(cost) && cost !== 0);
  walls.forEach((wall, index) => {
    const costs = wall.calculatedCosts || {};
    const label = wall.name || `Wall ${index + 1}`;
    const saved = Array.isArray(wallPricing) && wallPricing[index]
      ? wallPricing[index].available === false
      : foundationWallPricingIssues(wall, inventory, index).length > 0;
    const nameOf = id => inventory.find(row => row.id === id)?.material_name || "Material";
    const add = (material, qty, cost) => out.push({ material, quantity: qty, cost: amount(cost), saved });
    if (saved || used(costs.totalBricks, costs.materialCost)) {
      add(saved ? `${label} â€” saved outer material` : `${label} â€” ${nameOf(wall.materialId)}`,
        quantity(costs.totalBricks, costs.materialQuantityUnit === "cy" ? "CY" : "units"), costs.materialCost);
    }
    if (known(costs.mortarCost) && costs.mortarCost !== 0) {
      add(`${label} â€” ${saved ? "saved mortar" : "mortar"}`, "â€”", costs.mortarCost);
    }
    const internalUsed = used(costs.internalTotalBricks, costs.internalMaterialCost);
    if ((saved && wall.includeInternalWall) || internalUsed) {
      add(saved ? `${label} â€” saved internal material` : `${label} â€” ${nameOf(wall.internalMaterialId)} (internal)`,
        quantity(costs.internalTotalBricks, costs.internalMaterialQuantityUnit === "cy" ? "CY" : "units"), costs.internalMaterialCost);
    }
    if (known(costs.internalMortarCost) && costs.internalMortarCost !== 0) {
      add(`${label} â€” ${saved ? "saved internal mortar" : "internal mortar"}`, "â€”", costs.internalMortarCost);
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
  const results = walls.map((wall, index) => wallPricing(wall, inventory, index, settings));
  return {
    walls: results.map((check, index) => {
      const wall = walls[index];
      if (check.issues.length) return held(wall);
      const { wallMaterial, internalMaterial, heightInches, internalWallHeightInches, wallShape,
        calcWall, mortarGapInches, internalMortarGapInches } = check;
      const costs =
        calcWallCosts({
          wall: calcWall ?? wall,
          wallShape,
          wallMaterial,
          internalMaterial,
          includeInternalWall: wall.includeInternalWall,
          wallHeightInches: heightInches,
          internalWallHeightInches,
          mortarGapInches,
          internalMortarGapInches,
          wasteFraction: wall.wasteFraction,
          settings,
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
          internalLaborHours: costs.internalLaborHours ?? 0,
          // CMP-D03: poured-concrete walls carry the quantity basis on the
          // snapshot ("cy" placed volume, vs the unit-masonry count) so saved
          // rows, BOM and Builder parts can label the quantity honestly. Unit
          // masonry is untouched â€” no extra keys on unchanged paths.
          ...(wallMaterial?.wall_material_subtype === "concrete" ? { materialQuantityUnit: "cy" } : {}),
          ...(wall.includeInternalWall && internalMaterial?.wall_material_subtype === "concrete"
            ? { internalMaterialQuantityUnit: "cy" } : {}),
        },
      };
    }),
    wallPricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues })),
  };
}