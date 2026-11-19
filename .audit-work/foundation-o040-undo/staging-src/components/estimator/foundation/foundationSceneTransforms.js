// O-038 (CMP-C07) — foundation scene transforms.
//
// Pure, deterministic, DOM-free math for mapping between the three coordinate
// spaces the foundation estimator uses. This module is the single transform
// implementation the 2D layout canvas, the future renderer (O-041),
// diagnostics (O-042) and export (O-043) all consume; it exists so zoom,
// aspect-ratio, scroll and responsive-viewport handling are defined once
// instead of re-derived per component.
//
// UNIT + SPACE CONVENTIONS (the contract every consumer shares):
//
//   * PLAN space — authored scene geometry, ALWAYS in inches.
//       x_inches runs east across the plan width, z_inches runs south down
//       the plan depth; the origin is the plan's north-west corner. This is
//       exactly the space of item x_inches/z_inches corners and wall
//       shape.points {x,z} (geometry contract: foundationLayoutModel.js /
//       foundationAssemblyModel.js).
//   * SCREEN space — CSS pixels in the browser client coordinate frame (the
//       same frame PointerEvent.clientX/clientY and
//       Element.getBoundingClientRect() report in). +x right, +y down.
//       A DOMRect-shaped rect is consumed as a plain record
//       { left, top, width, height } — already zoomed and scrolled, so a
//       view built from it must never be rescaled by zoom again.
//   * WORLD space — 3D renderer units, feet, Y-up right-handed
//       (x_ft = x_inches/12, z_ft = z_inches/12, elevation y_ft = inches/12).
//       Matches Foundation3DPreview: plan x maps to world x, plan z maps to
//       world z, grade/embedment offsets map to world y.
//   * ROTATION — item rotation_degrees is a visual rotation about the
//       footprint CENTER (foundationDuplicateMirror contract). In plan space
//       (+z down, same handedness as the screen) positive degrees rotate +x
//       toward +z — identical to CSS rotate(deg). The world mapping is the
//       raw radians value the existing preview feeds rotation.y; chirality
//       vs the 2D canvas follows each renderer's own convention and is not
//       redefined here.
//
// A PlanView is the plan→screen affine the canvas/renderer agrees on:
//   screen.x = plan.x * scaleX + originX
//   screen.y = plan.z * scaleY + originY
// scaleX/scaleY are pixels-per-inch and MAY differ: the layout canvas maps
// an element rect onto the 480x320 extent independently per axis (that is
// today's behavior for non-3:2 rects — preserved, not corrected).
//
// All functions are total: malformed inputs return null (or a documented
// fallback) rather than throwing or producing NaN. No DOM, no React, no
// timers, no randomness.

export const SCENE_PLAN_UNITS = "inches";
export const SCENE_SCREEN_UNITS = "css-px";
export const SCENE_WORLD_UNITS = "feet";
export const INCHES_PER_FOOT = 12;
export const PLAN_TO_WORLD_SCALE = 1 / INCHES_PER_FOOT;

// Default plan extent in inches — mirrors FOUNDATION_LAYOUT_WIDTH_INCHES /
// FOUNDATION_LAYOUT_DEPTH_INCHES in foundationLayoutModel.js (the model owns
// the layout extent; the mirror is asserted equal in the verification suite
// so drift cannot go unnoticed). Kept local so this module stays
// dependency-free for renderer/worker consumers.
export const DEFAULT_PLAN_EXTENT = Object.freeze({ width: 480, depth: 320 });

// Zoom clamp shared with the layout canvas buttons (0.5x–2x).
export const DEFAULT_ZOOM_RANGE = Object.freeze({ min: 0.5, max: 2 });

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const DEG_TO_RAD = Math.PI / 180;

const validExtent = (extent) =>
  !!extent && fin(extent.width) && fin(extent.depth) && extent.width > 0 && extent.depth > 0;

const resolveExtent = (extent) => (validExtent(extent) ? extent : DEFAULT_PLAN_EXTENT);

// ---------------------------------------------------------------------------
// PlanView construction
// ---------------------------------------------------------------------------

// View implied by a laid-out element rect — the exact transform the layout
// canvas uses today (plan extent stretched onto the rect per axis).
export function planViewFromElementRect(rect, extent = DEFAULT_PLAN_EXTENT) {
  if (!rect || !fin(rect.left) || !fin(rect.top) || !fin(rect.width) || !fin(rect.height)) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ex = resolveExtent(extent);
  if (!validExtent(ex)) return null;
  return {
    originX: rect.left,
    originY: rect.top,
    scaleX: rect.width / ex.width,
    scaleY: rect.height / ex.depth,
    extent: { width: ex.width, depth: ex.depth },
  };
}

// Uniform-scale contain-fit view for an arbitrary viewport — the responsive/
// SVG path. `viewport` is { width, height } in the same units as the desired
// screen output (px for DOM, viewBox units for SVG). The fitted extent is
// centered, scaled by `zoom`, then translated by `panX`/`panY` screen units.
// With zoom=1 and zero padding the whole extent is visible (letterboxed when
// aspect differs — no distortion, unlike planViewFromElementRect).
export function planViewForViewport({ viewport, extent = DEFAULT_PLAN_EXTENT, zoom = 1, panX = 0, panY = 0, padding = 0 } = {}) {
  const ex = resolveExtent(extent);
  if (!viewport || !fin(viewport.width) || !fin(viewport.height)) return null;
  const pad = fin(padding) && padding > 0 ? padding : 0;
  const innerW = viewport.width - pad * 2;
  const innerH = viewport.height - pad * 2;
  if (innerW <= 0 || innerH <= 0 || !validExtent(ex)) return null;
  const z = fin(zoom) && zoom > 0 ? zoom : 1;
  const fit = Math.min(innerW / ex.width, innerH / ex.depth);
  const s = fit * z;
  const px = fin(panX) ? panX : 0;
  const py = fin(panY) ? panY : 0;
  return {
    originX: pad + (innerW - ex.width * s) / 2 + px,
    originY: pad + (innerH - ex.depth * s) / 2 + py,
    scaleX: s,
    scaleY: s,
    extent: { width: ex.width, depth: ex.depth },
    fit,
    zoom: z,
    pan: { x: px, y: py },
  };
}

// Contain-fit view for an arbitrary plan-space bounds box (fit-to-selection,
// O-037). `bounds` = { minX, minZ, maxX, maxZ } in plan inches; degenerate
// (zero-area) bounds expand to a 1-inch square so a single point still fits.
export function planViewForBounds(bounds, viewport, { padding = 0, zoom = 1, panX = 0, panY = 0 } = {}) {
  if (!bounds || !fin(bounds.minX) || !fin(bounds.minZ) || !fin(bounds.maxX) || !fin(bounds.maxZ)) return null;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  if (w < 0 || d < 0) return null;
  const ex = { width: Math.max(w, 1), depth: Math.max(d, 1) };
  const cx = bounds.minX + w / 2;
  const cz = bounds.minZ + d / 2;
  const view = planViewForViewport({ viewport, extent: ex, zoom, panX, panY, padding });
  if (!view) return null;
  // Re-anchor: the fitted extent's center must land on the bounds center.
  const centerX = ex.width / 2;
  const centerZ = ex.depth / 2;
  return {
    ...view,
    originX: view.originX + (centerX - cx) * view.scaleX,
    originY: view.originY + (centerZ - cz) * view.scaleY,
    extent: { width: ex.width, depth: ex.depth },
  };
}

const validView = (view) =>
  !!view && fin(view.originX) && fin(view.originY) && fin(view.scaleX) && fin(view.scaleY)
  && view.scaleX !== 0 && view.scaleY !== 0;

// ---------------------------------------------------------------------------
// Screen <-> plan
// ---------------------------------------------------------------------------

// screen px -> plan inches. Same null-verdict contract as
// foundationLayoutModel.layoutPointInches: non-finite inputs, a missing or
// degenerate view, or a zero scale all return null rather than NaN.
export function screenToPlan(view, screenX, screenY) {
  if (!fin(screenX) || !fin(screenY)) return null;
  if (!validView(view)) return null;
  return {
    x_inches: (screenX - view.originX) / view.scaleX,
    z_inches: (screenY - view.originY) / view.scaleY,
  };
}

// plan inches -> screen px.
export function planToScreen(view, xInches, zInches) {
  if (!fin(xInches) || !fin(zInches)) return null;
  if (!validView(view)) return null;
  return {
    x: xInches * view.scaleX + view.originX,
    y: zInches * view.scaleY + view.originY,
  };
}

// plan inches -> percent of extent — the canvas's pctW/pctD seam, returned
// as numbers so callers choose string formatting (`${v}%`).
export function planToExtentPercent(xInches, zInches, extent = DEFAULT_PLAN_EXTENT) {
  const ex = resolveExtent(extent);
  if (!fin(xInches) || !fin(zInches) || !validExtent(ex)) return null;
  return { leftPct: (xInches / ex.width) * 100, topPct: (zInches / ex.depth) * 100 };
}

// Inverse of planToExtentPercent (e.g. SVG viewBox fractions -> inches).
export function extentPercentToPlan(leftPct, topPct, extent = DEFAULT_PLAN_EXTENT) {
  const ex = resolveExtent(extent);
  if (!fin(leftPct) || !fin(topPct) || !validExtent(ex)) return null;
  return { x_inches: (leftPct / 100) * ex.width, z_inches: (topPct / 100) * ex.depth };
}

// ---------------------------------------------------------------------------
// View manipulation (zoom / pan / clamp)
// ---------------------------------------------------------------------------

export function clampZoomValue(zoom, { min = DEFAULT_ZOOM_RANGE.min, max = DEFAULT_ZOOM_RANGE.max } = {}) {
  if (!fin(zoom)) return null;
  const lo = fin(min) ? min : -Infinity;
  const hi = fin(max) ? max : Infinity;
  return Math.min(hi, Math.max(lo, zoom));
}

// Zoom about a screen-space anchor: the plan point under `anchor` stays
// under it. `factor` multiplies the current uniform scale (non-uniform
// views scale both axes by the same factor). Clamps against zoomRange when
// the view carries a `zoom` field (planViewForViewport views do).
export function zoomPlanViewAt(view, factor, anchor, zoomRange) {
  if (!validView(view) || !fin(factor) || factor <= 0 || !anchor || !fin(anchor.x) || !fin(anchor.y)) return null;
  let f = factor;
  if (fin(view.zoom)) {
    const clamped = clampZoomValue(view.zoom * f, zoomRange);
    if (clamped === null || clamped <= 0) return null;
    f = clamped / view.zoom;
  }
  const scaleX = view.scaleX * f;
  const scaleY = view.scaleY * f;
  if (scaleX === 0 || scaleY === 0 || !fin(scaleX) || !fin(scaleY)) return null;
  const next = {
    ...view,
    scaleX,
    scaleY,
    originX: anchor.x - (anchor.x - view.originX) * f,
    originY: anchor.y - (anchor.y - view.originY) * f,
  };
  if (fin(view.zoom)) next.zoom = view.zoom * f;
  return next;
}

// Translate the view by a screen-space delta (scroll/pan).
export function panPlanView(view, dxScreen, dyScreen) {
  if (!validView(view) || !fin(dxScreen) || !fin(dyScreen)) return null;
  const next = { ...view, originX: view.originX + dxScreen, originY: view.originY + dyScreen };
  if (view.pan && fin(view.pan.x) && fin(view.pan.y)) next.pan = { x: view.pan.x + dxScreen, y: view.pan.y + dyScreen };
  return next;
}

// ---------------------------------------------------------------------------
// Plan-space predicates + clamps
// ---------------------------------------------------------------------------

// Is `point` inside the plan extent? point = { x, z } or { x_inches, z_inches }.
export function pointInPlan(point, extent = DEFAULT_PLAN_EXTENT) {
  const p = planPointOf(point);
  const ex = resolveExtent(extent);
  return !!p && validExtent(ex) && p.x >= 0 && p.x <= ex.width && p.z >= 0 && p.z <= ex.depth;
}

export function clampPlanPoint(point, extent = DEFAULT_PLAN_EXTENT) {
  const p = planPointOf(point);
  const ex = resolveExtent(extent);
  if (!p || !validExtent(ex)) return null;
  return { x: Math.min(ex.width, Math.max(0, p.x)), z: Math.min(ex.depth, Math.max(0, p.z)) };
}

// Accepts { x, z } or { x_inches, z_inches }; returns { x, z } or null.
export function planPointOf(point) {
  if (!point || typeof point !== "object") return null;
  const x = fin(point.x) ? point.x : fin(point.x_inches) ? point.x_inches : null;
  const z = fin(point.z) ? point.z : fin(point.z_inches) ? point.z_inches : null;
  if (x === null || z === null) return null;
  return { x, z };
}

// ---------------------------------------------------------------------------
// Item-local frames (rotation about the footprint center)
// ---------------------------------------------------------------------------

// Frame for a corner-anchored rect: { corner: {x,z}, size: {width,depth},
// rotationDegrees }. The authored corner is the UNROTATED top-left; rotation
// pivots about the rect center, matching CSS transform: rotate(deg) at the
// default 50%/50% origin. Positive degrees rotate +x toward +z.
export function planFrameForRect({ corner, size, rotationDegrees = 0 } = {}) {
  const c = planPointOf(corner);
  const w = size && fin(size.width) ? size.width : null;
  const d = size && fin(size.depth) ? size.depth : null;
  if (!c || w === null || d === null || w <= 0 || d <= 0) return null;
  const deg = fin(rotationDegrees) ? rotationDegrees : 0;
  const rad = deg * DEG_TO_RAD;
  return {
    cx: c.x + w / 2,
    cz: c.z + d / 2,
    degrees: deg,
    cos: Math.cos(rad),
    sin: Math.sin(rad),
  };
}

// plan point -> rect-local coords (center origin, unrotated axes).
export function planToFrameLocal(frame, point) {
  const p = planPointOf(point);
  if (!frame || !fin(frame.cx) || !fin(frame.cz) || !fin(frame.cos) || !fin(frame.sin) || !p) return null;
  const dx = p.x - frame.cx;
  const dz = p.z - frame.cz;
  // inverse of the CSS-rotation matrix [[cos,-sin],[sin,cos]]
  return { lx: frame.cos * dx + frame.sin * dz, lz: -frame.sin * dx + frame.cos * dz };
}

// rect-local coords -> plan point.
export function frameLocalToPlan(frame, local) {
  if (!frame || !fin(frame.cx) || !fin(frame.cz) || !fin(frame.cos) || !fin(frame.sin)) return null;
  if (!local || !fin(local.lx) || !fin(local.lz)) return null;
  return {
    x: frame.cx + frame.cos * local.lx - frame.sin * local.lz,
    z: frame.cz + frame.sin * local.lx + frame.cos * local.lz,
  };
}

// The rect's four corners in plan space, keyed by screen-style quadrants
// (n = smaller z edge, w = smaller x edge, matching the z-down plan axis).
export function framePlanCorners(frame, size) {
  if (!frame || !size || !fin(size.width) || !fin(size.depth) || size.width <= 0 || size.depth <= 0) return null;
  const hw = size.width / 2;
  const hd = size.depth / 2;
  const corner = (lx, lz) => frameLocalToPlan(frame, { lx, lz });
  return {
    nw: corner(-hw, -hd),
    ne: corner(hw, -hd),
    se: corner(hw, hd),
    sw: corner(-hw, hd),
  };
}

// Rotate an arbitrary plan point about an arbitrary center — positive
// degrees rotate +x toward +z (CSS direction).
export function rotatePlanPointAbout(point, center, degrees) {
  const p = planPointOf(point);
  const c = planPointOf(center);
  const deg = fin(degrees) ? degrees : 0;
  if (!p || !c) return null;
  const rad = deg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  return { x: c.x + cos * dx - sin * dz, z: c.z + sin * dx + cos * dz };
}

// ---------------------------------------------------------------------------
// Plan <-> world (3D renderer)
// ---------------------------------------------------------------------------

// plan inches + elevation inches -> world feet (Y-up).
export function planToWorld(point, { elevationInches = 0 } = {}) {
  const p = planPointOf(point);
  if (!p) return null;
  const el = fin(elevationInches) ? elevationInches : 0;
  return { x: p.x * PLAN_TO_WORLD_SCALE, y: el * PLAN_TO_WORLD_SCALE, z: p.z * PLAN_TO_WORLD_SCALE };
}

// world feet -> plan inches + elevation inches.
export function worldToPlan(world) {
  if (!world || !fin(world.x) || !fin(world.z)) return null;
  return {
    x_inches: world.x * INCHES_PER_FOOT,
    z_inches: world.z * INCHES_PER_FOOT,
    elevation_inches: fin(world.y) ? world.y * INCHES_PER_FOOT : 0,
  };
}

// Item rotation_degrees -> the radians value the 3D renderer applies to
// rotation.y (identical feed to Foundation3DPreview today).
export function planRotationToWorldRadians(degrees) {
  return fin(degrees) ? degrees * DEG_TO_RAD : 0;
}