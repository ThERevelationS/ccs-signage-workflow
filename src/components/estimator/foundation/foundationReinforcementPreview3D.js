import { foundationInputNumber, foundationGeometryValidation } from "./foundationGeometryInputs";
import { layoutPositionInches } from "./foundationLayoutModel";
import { calculateFoundationReinforcementModel } from "./foundationReinforcementModel";

// Rendering budgets only: neither limit changes a design, calculated quantity,
// saved price, or purchasing requirement. Support markers share the same total
// primitive budget as steel so a dense support grid can never crowd steel off
// the preview or vice versa; clipping never changes modeled counts.
export const FOUNDATION_3D_PREVIEW_LIMITS = Object.freeze({ instances: 64, steelPrimitives: 2048, supportMarkers: 1024 });
const IN = 1 / 12;
const renderable = number => Number.isFinite(number) && Number.isFinite(Math.fround(number));
const positive = number => renderable(number) && number > 0 && Math.fround(number) > 0;
const point = value => value && ["x", "y", "z"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]));

const localPoint = (length, depth, width) =>
  value => [(value.x - length / 2) * IN, (value.y - depth / 2) * IN, (value.z - width / 2) * IN];

function steelPrimitive(primitive, length, depth, width) {
  const local = localPoint(length, depth, width);
  const radiusFeet = primitive.diameter_inches / 24;
  if (!positive(radiusFeet)) return null;
  const base = { id: primitive.id, role: primitive.role, kind: primitive.kind, radiusFeet };
  if (primitive.kind === "segment" || primitive.kind === "tie_reference") {
    if (!point(primitive.from) || !point(primitive.to)) return null;
    const from = local(primitive.from), to = local(primitive.to);
    const lengthFeet = Math.hypot(...to.map((value, index) => value - from[index]));
    if (![...from, ...to].every(renderable) || !positive(lengthFeet)) return null;
    return { ...base, from, to, lengthFeet };
  }
  if (primitive.kind === "hoop" && point(primitive.center)) {
    const center = local(primitive.center), centerlineRadiusFeet = primitive.centerline_radius_inches * IN;
    if (!center.every(renderable) || !positive(centerlineRadiusFeet)) return null;
    return { ...base, center, centerlineRadiusFeet, allowanceNotDrawn: primitive.cut_allowance_inches > 0 };
  }
  return null;
}

// A modeled bottom-resting support is a vertical post from its base plane up to
// the mat bearing plane. The marker radius is a fixed visual hint â€” the catalog
// footprint lives on the priced pick, not in geometry â€” so the marker is never
// read as a dimensioned object.
function supportPrimitive(placement, ordinal, local) {
  if (!positive(placement?.required_height_inches)) return null;
  const x = foundationInputNumber(placement.x), z = foundationInputNumber(placement.z);
  const base = foundationInputNumber(placement.base_elevation_inches);
  if (x === null || z === null || base === null || base < 0) return null;
  const from = local({ x, y: base, z }), to = local({ x, y: base + placement.required_height_inches, z });
  const lengthFeet = Math.hypot(...to.map((value, index) => value - from[index]));
  if (![...from, ...to].every(renderable) || !positive(lengthFeet)) return null;
  return {
    id: `support:${placement.target_id ?? "mat"}:${ordinal}`, role: "support", kind: "segment",
    radiusFeet: 0.5 / 24, from, to, lengthFeet,
    target: placement.target_id ?? null, matId: placement.mat_id ?? null,
    base: placement.base ?? null, requiredHeightInches: placement.required_height_inches,
    nominalMarker: true,
  };
}

// Inspection spreads quantity copies; layout uses one recorded anchor per item.
// Steel stays local to its concrete mesh in either mode.
// view "exploded" lifts each steel/support primitive upward proportional to its
// elevation inside the footing (bottom stays, top separates) so multi-mat cages
// read layer-by-layer; view "assembled" leaves modeled positions untouched.
// Section views are renderer-side (a clip plane), not geometry edits — the
// projection passes through sectionHeightInches so a consumer can place it.
export function buildFoundationReinforcementPreview3D(project = {}, { showReinforcement = true, placementMode = "inspection", view = "assembled", explodeDepthFactor = 1.5, sectionHeightInches = null } = {}) {
  const instances = [], issues = [];
  let cursorX = 0, steelCount = 0, clipped = false, hasVersioned = false;
  if (view !== "assembled" && view !== "exploded") return {
    instances, issues: [{ index: null, message: "Preview view is unsupported.", severity: "error" }],
    clipped: false, hasVersioned: false, steelCount, engineeringApproved: false, placementMode: null, view: null,
  };
  const explodeOffsetFeet = view === "exploded" && foundationInputNumber(explodeDepthFactor) > 0
    ? foundationInputNumber(explodeDepthFactor)
    : 0;
  // Elevation-banded explode: each primitive end is lifted by its own height
  // fraction inside the footing depth, so ties stretching between mats stay
  // honest (their ends separate with the mats they connect) and support posts
  // lengthen instead of floating.
  const explodeY = (yFeet, depthFeet) =>
    explodeOffsetFeet > 0 && depthFeet > 0
      ? yFeet + explodeOffsetFeet * depthFeet * Math.min(1, Math.max(0, (yFeet + depthFeet / 2) / depthFeet))
      : yFeet;
  const explodePrimitive = (primitive, depthFeet) => {
    if (explodeOffsetFeet <= 0 || !primitive) return primitive;
    const next = { ...primitive };
    if (Array.isArray(next.from)) next.from = [next.from[0], explodeY(next.from[1], depthFeet), next.from[2]];
    if (Array.isArray(next.to)) next.to = [next.to[0], explodeY(next.to[1], depthFeet), next.to[2]];
    if (Array.isArray(next.center)) next.center = [next.center[0], explodeY(next.center[1], depthFeet), next.center[2]];
    if (Number.isFinite(next.lengthFeet) && Array.isArray(next.from) && Array.isArray(next.to))
      next.lengthFeet = Math.hypot(...next.to.map((value, index) => value - next.from[index]));
    return next;
  };
  const add = (index, message, severity = "warning") => issues.push({ index, message: `Foundation ${index + 1}: ${message}`, severity });
  if (placementMode !== "inspection" && placementMode !== "layout") return {
    instances, issues: [{ index: null, message: "Foundation placement mode is unsupported.", severity: "error" }],
    clipped: false, hasVersioned: false, steelCount, engineeringApproved: false, placementMode: null,
  };
  if (!Array.isArray(project?.items)) return {
    instances, issues: [{ index: null, message: "Foundation items are unavailable for this preview.", severity: "error" }],
    clipped: false, hasVersioned: false, steelCount, engineeringApproved: false, placementMode,
  };
  project.items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) { add(index, "definition is not a record.", "error"); return; }
    const geometry = foundationGeometryValidation(item, index);
    const version = item.reinforcement_calculation_version;
    const versioned = version != null && version !== 1;
    hasVersioned ||= versioned;
    if (instances.length >= FOUNDATION_3D_PREVIEW_LIMITS.instances) { clipped = true; return; }
    if (geometry.issues.length) {
      geometry.issues.forEach(issue => add(index, issue.message, "error"));
      return;
    }
    const offset = foundationInputNumber(item.grade_offset_inches ?? 0);
    const rotation = foundationInputNumber(item.rotation_degrees ?? 0);
    if (offset === null || rotation === null) { add(index, "grade offset or rotation is not a finite decimal.", "error"); return; }
    const length = Number(item.foundation_type === "pillar" ? item.diameter : item.length_inches);
    const width = Number(item.foundation_type === "pillar" ? item.diameter : item.width_inches);
    const depth = Number(item.depth_inches);
    const dimensionsFeet = [length * IN, depth * IN, width * IN];
    if (!dimensionsFeet.every(positive) || !renderable(offset * IN)) { add(index, "dimensions exceed the 3D numeric range.", "error"); return; }
    let report = null, steel = [], supports = [];
    if (versioned) {
      if (version !== 2) add(index, "reinforcement calculation version is unsupported; no legacy steel is substituted.", "error");
      else if (item.include_rebar != null && typeof item.include_rebar !== "boolean") add(index, "reinforcement on/off selection is invalid.", "error");
      else {
        report = calculateFoundationReinforcementModel(item, item.reinforcement_design, { geometryLimit: FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives });
        report.issues.forEach(issue => add(index, issue.message, issue.severity));
        if (report.status === "valid" && showReinforcement) {
          steel = report.geometry.map(primitive => steelPrimitive(primitive, length, depth, width));
          if (steel.some(primitive => primitive === null)) { add(index, "some steel geometry exceeds the 3D numeric range.", "error"); clipped = true; }
          steel = steel.filter(Boolean);
          clipped ||= report.omittedGeometryCount > 0;
          const local = localPoint(length, depth, width);
          const placements = Array.isArray(report.supports?.placements) ? report.supports.placements : [];
          supports = placements.map((placement, ordinal) => supportPrimitive(placement, ordinal, local));
          if (supports.some(primitive => primitive === null)) { add(index, "some support markers exceed the 3D numeric range.", "error"); clipped = true; }
          supports = supports.filter(Boolean).slice(0, FOUNDATION_3D_PREVIEW_LIMITS.supportMarkers);
          clipped ||= supports.length < placements.length;
        }
      }
    }
    if (placementMode === "layout") {
      const pos = layoutPositionInches(item);
      if (!pos.valid) { add(index, "saved placement coordinates are invalid; item is skipped rather than mapped to zero.", "error"); return; }
      const positionFeet = [
        pos.x_inches * IN + dimensionsFeet[0] / 2,
        -dimensionsFeet[1] / 2 + offset * IN,
        pos.z_inches * IN + dimensionsFeet[2] / 2,
      ];
      if (!positionFeet.every(renderable)) { add(index, "saved placement position exceeds the 3D numeric range.", "error"); return; }
      if (geometry.quantity > 1) add(index, "quantity greater than one has additional locations that are not recorded; one representative is shown.");
      const drawn = steel.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount)).map(primitive => explodePrimitive(primitive, dimensionsFeet[1]));
      clipped ||= drawn.length < steel.length;
      steelCount += drawn.length;
      const drawnSupports = supports.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount)).map(primitive => explodePrimitive(primitive, dimensionsFeet[1]));
      clipped ||= drawnSupports.length < supports.length;
      steelCount += drawnSupports.length;
      instances.push({
        index, instanceIndex: 0, type: item.foundation_type, dimensionsFeet, positionFeet,
        rotationRadians: -((rotation % 360) * Math.PI) / 180,
        steel: drawn, supports: drawnSupports,
        reinforcementStatus: report?.status ?? (versioned ? "invalid" : "legacy"),
        versioned, engineeringApproved: false,
      });
      return;
    }
    const shown = Math.min(geometry.quantity, FOUNDATION_3D_PREVIEW_LIMITS.instances - instances.length);
    clipped ||= shown < geometry.quantity;
    const footprint = Math.max(dimensionsFeet[0], dimensionsFeet[2]);
    for (let instanceIndex = 0; instanceIndex < shown; instanceIndex += 1) {
      const positionFeet = [cursorX + footprint / 2, -dimensionsFeet[1] / 2 + offset * IN, 0];
      if (!positionFeet.every(renderable)) { add(index, "inspection position exceeds the 3D numeric range.", "error"); clipped = true; break; }
      const drawn = steel.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount)).map(primitive => explodePrimitive(primitive, dimensionsFeet[1]));
      clipped ||= drawn.length < steel.length;
      steelCount += drawn.length;
      const drawnSupports = supports.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount)).map(primitive => explodePrimitive(primitive, dimensionsFeet[1]));
      clipped ||= drawnSupports.length < supports.length;
      steelCount += drawnSupports.length;
      instances.push({
        index, instanceIndex, type: item.foundation_type, dimensionsFeet, positionFeet,
        rotationRadians: ((rotation % 360) * Math.PI) / 180,
        steel: drawn, supports: drawnSupports,
        reinforcementStatus: report?.status ?? (versioned ? "invalid" : "legacy"),
        versioned, engineeringApproved: false,
      });
      cursorX += footprint + 2;
    }
  });
  return { instances, issues, clipped, hasVersioned, steelCount, engineeringApproved: false, placementMode, view, sectionHeightInches: foundationInputNumber(sectionHeightInches) };
}