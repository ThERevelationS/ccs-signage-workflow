import { foundationInputNumber, foundationGeometryValidation } from "./foundationGeometryInputs";
import { calculateFoundationReinforcementModel } from "./foundationReinforcementModel";

// Rendering budgets only: neither limit changes a design, calculated quantity,
// saved price, or purchasing requirement.
export const FOUNDATION_3D_PREVIEW_LIMITS = Object.freeze({ instances: 64, steelPrimitives: 2048 });
const IN = 1 / 12;
const renderable = number => Number.isFinite(number) && Number.isFinite(Math.fround(number));
const positive = number => renderable(number) && number > 0 && Math.fround(number) > 0;
const point = value => value && ["x", "y", "z"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]));

function steelPrimitive(primitive, length, depth, width) {
  const local = value => [(value.x - length / 2) * IN, (value.y - depth / 2) * IN, (value.z - width / 2) * IN];
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

// Schematic overview, matching the existing inspection arrangement. Coordinates
// are NOT saved layout placement; the steel is local to its concrete mesh and
// therefore receives exactly the same rotation and grade offset.
export function buildFoundationReinforcementPreview3D(project = {}, { showReinforcement = true } = {}) {
  const instances = [], issues = [];
  let cursorX = 0, steelCount = 0, clipped = false, hasVersioned = false;
  const add = (index, message, severity = "warning") => issues.push({ index, message: `Foundation ${index + 1}: ${message}`, severity });
  if (!Array.isArray(project?.items)) return {
    instances, issues: [{ index: null, message: "Foundation items are unavailable for this preview.", severity: "error" }],
    clipped: false, hasVersioned: false, steelCount, engineeringApproved: false,
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
    let report = null, steel = [];
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
        }
      }
    }
    const shown = Math.min(geometry.quantity, FOUNDATION_3D_PREVIEW_LIMITS.instances - instances.length);
    clipped ||= shown < geometry.quantity;
    const footprint = Math.max(dimensionsFeet[0], dimensionsFeet[2]);
    for (let instanceIndex = 0; instanceIndex < shown; instanceIndex += 1) {
      const positionFeet = [cursorX + footprint / 2, -dimensionsFeet[1] / 2 + offset * IN, 0];
      if (!positionFeet.every(renderable)) { add(index, "inspection position exceeds the 3D numeric range.", "error"); clipped = true; break; }
      const drawn = steel.slice(0, Math.max(0, FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives - steelCount));
      clipped ||= drawn.length < steel.length;
      steelCount += drawn.length;
      instances.push({
        index, instanceIndex, type: item.foundation_type, dimensionsFeet, positionFeet,
        rotationRadians: ((rotation % 360) * Math.PI) / 180,
        steel: drawn, reinforcementStatus: report?.status ?? (versioned ? "invalid" : "legacy"),
        versioned, engineeringApproved: false,
      });
      cursorX += footprint + 2;
    }
  });
  return { instances, issues, clipped, hasVersioned, steelCount, engineeringApproved: false };
}
