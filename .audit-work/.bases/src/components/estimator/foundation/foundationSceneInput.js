// O-039 (CMP-C08) — foundation scene input primitives.
//
// Pure, deterministic helpers that turn raw pointer/keyboard input and plan
// geometry into scene-level decisions: what is under a point, how a drag
// gesture maps to a corner patch, how arrow keys nudge, where a point can
// snap, and what a hit is called. DOM-free — event-shaped plain records go
// in, plain records come out — so the layout canvas, the future
// selection/edit work (O-034/O-035/O-036), undo coalescing (O-040),
// diagnostics click-navigation (O-042) and export labeling (O-043) all share
// one implementation.
//
// Geometry contract (owned by foundationLayoutModel.js /
// foundationAssemblyModel.js — imported read-only):
//   * items carry a TOP-LEFT plan corner in inches (x_inches/z_inches), an
//     unrotated footprint (length_inches x width_inches; diameter x diameter
//     for pillars), and rotation_degrees about the footprint center
//     (CSS-clockwise in the z-down plan).
//   * poles carry a plan POINT in inches (x_inches/z_inches).
//   * walls carry shape.points [{x,z}] plan inches + shape.closed; segment i
//     runs points[i] -> points[(i+1) % n] (last wraps only when closed).
//   * wall_caps / signage_cabinets carry no plan coordinates — they are
//     reference-mounted and are never hit-tested here.
//
// Hit kinds returned by hitTestPlan / hitTestPlanAll:
//   'item-vertex' | 'item-edge' | 'item-face' | 'pole' |
//   'wall-vertex' | 'wall-segment' | 'wall-face'
// Priority inside one object: vertex > edge/segment > face. Across objects
// the caller's layer order applies (default poles > items > walls, matching
// the canvas's DOM paint order where later siblings render on top); each
// collection is walked in REVERSE index order since later rows paint above.

import {
  FOUNDATION_LAYOUT_WIDTH_INCHES,
  FOUNDATION_LAYOUT_DEPTH_INCHES,
  foundationLayoutFootprint,
  layoutPositionInches,
  layoutItemKey,
  layoutItemFingerprint,
} from "./foundationLayoutModel";
import {
  DEFAULT_PLAN_EXTENT,
  planPointOf,
  planFrameForRect,
  planToFrameLocal,
  planViewFromElementRect,
  screenToPlan,
} from "./foundationSceneTransforms";

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const hypot = Math.hypot;

const PLAN_EXTENT = Object.freeze({
  width: FOUNDATION_LAYOUT_WIDTH_INCHES,
  depth: FOUNDATION_LAYOUT_DEPTH_INCHES,
});

// Default tolerances in plan inches. Callers can derive a per-pixel
// tolerance instead: tolInches = pxTolerance / view.scaleX.
export const DEFAULT_HIT_TOLERANCES = Object.freeze({
  edgeInches: 3,
  vertexInches: 4,
  poleInches: 4,
});

// ---------------------------------------------------------------------------
// Pointer normalization (pointer capture / mouse / touch / pen)
// ---------------------------------------------------------------------------

// Canonical pointer record from any event-shaped object: PointerEvent,
// MouseEvent, TouchEvent, or a plain fixture record. Returns null when no
// finite client point can be found. Touch events without clientX/Y fall
// back to the first touch of touches/changedTouches/targetTouches — the
// "numeric fallback" for non-PointerEvent surfaces.
export function normalizeScenePointer(event) {
  if (!event || typeof event !== "object") return null;
  let clientX = event.clientX;
  let clientY = event.clientY;
  if (!fin(clientX) || !fin(clientY)) {
    const lists = [event.touches, event.changedTouches, event.targetTouches];
    for (const list of lists) {
      const t = list && list.length > 0 ? list[0] : null;
      if (t && fin(t.clientX) && fin(t.clientY)) {
        clientX = t.clientX;
        clientY = t.clientY;
        break;
      }
    }
  }
  if (!fin(clientX) || !fin(clientY)) return null;
  const type = typeof event.pointerType === "string" && event.pointerType
    ? event.pointerType
    : typeof event.type === "string" && event.type.startsWith("touch")
      ? "touch"
      : "mouse";
  return {
    pointerId: event.pointerId === undefined ? null : event.pointerId,
    pointerType: type,
    clientX,
    clientY,
    button: fin(event.button) ? event.button : 0,
    buttons: fin(event.buttons) ? event.buttons : 0,
    isPrimary: event.isPrimary !== false,
    shiftKey: event.shiftKey === true,
    ctrlKey: event.ctrlKey === true,
    metaKey: event.metaKey === true,
    altKey: event.altKey === true,
  };
}

// The canvas's primary-press guard, as a named predicate: left button only,
// and a non-primary pointer (second touch) never starts a gesture.
export function isPrimaryScenePress(pointer) {
  const p = pointer && pointer.clientX !== undefined ? pointer : normalizeScenePointer(pointer);
  if (!p) return false;
  return p.button === 0 && p.isPrimary !== false;
}

// One-call input seam: normalize an event and map it to plan inches through
// an element rect. Returns { pointer, point } or null — point mirrors
// layoutPointInches output ({ x_inches, z_inches }).
export function scenePointerToPlan(event, rect, extent = PLAN_EXTENT) {
  const pointer = normalizeScenePointer(event);
  if (!pointer) return null;
  const view = planViewFromElementRect(rect, extent);
  const point = screenToPlan(view, pointer.clientX, pointer.clientY);
  if (!point) return null;
  return { pointer, point };
}

// ---------------------------------------------------------------------------
// Plan-object geometry (shared with hit-testing + diagnostics)
// ---------------------------------------------------------------------------

// Resolved plan geometry for one item row: corner, footprint and the
// rotation-about-center frame. Null when the row cannot be placed — the
// same rows the canvas marks "needs valid dimensions/coordinates" are also
// not hit-testable.
export function itemPlanGeometry(item) {
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  if (!fp || !pos.valid) return null;
  const frame = planFrameForRect({
    corner: { x: pos.x_inches, z: pos.z_inches },
    size: fp,
    rotationDegrees: fin(item?.rotation_degrees) ? item.rotation_degrees : 0,
  });
  if (!frame) return null;
  return {
    corner: { x: pos.x_inches, z: pos.z_inches },
    size: { width: fp.width, depth: fp.depth },
    center: { x: frame.cx, z: frame.cz },
    frame,
    circular: item?.foundation_type === "pillar",
  };
}

// Wall outline as finite plan points (invalid vertices dropped, indices
// preserved via the returned `points` + `indices` pair) plus the closed flag
// — mirrors the assembly model's segEndpoints rule (closed needs >= 3 pts).
export function wallPlanGeometry(wall) {
  const raw = wall?.shape?.points;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const points = [];
  const indices = [];
  raw.forEach((p, i) => {
    const q = planPointOf(p);
    if (q) { points.push(q); indices.push(i); }
  });
  if (!points.length) return null;
  return { points, indices, closed: wall?.shape?.closed === true && points.length >= 3 };
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

const labelFor = (collection, index) => {
  switch (collection) {
    case "items": return `Foundation ${index + 1}`;
    case "poles": return `Pole ${index + 1}`;
    case "walls": return `Wall ${index + 1}`;
    default: return `Object ${index + 1}`;
  }
};

const baseHit = (kind, collection, index, obj, point, extra) => ({
  kind,
  collection,
  index,
  key: layoutItemKey(obj, index),
  componentId: obj?.component_id ?? null,
  distance: 0,
  point: { x: point.x, z: point.z },
  label: labelFor(collection, index),
  ...extra,
});

// Edge/corner naming uses screen-style compass directions over the z-down
// plan: 'n' is the smaller-z edge (top of screen), 'w' the smaller-x edge.
const EDGE_NAMES = ["n", "e", "s", "w"];
const CORNER_NAMES = { "-1,-1": "nw", "1,-1": "ne", "1,1": "se", "-1,1": "sw" };

function hitItem(item, index, p, tol) {
  const g = itemPlanGeometry(item);
  if (!g) return null;

  if (g.circular) {
    const r = Math.min(g.size.width, g.size.depth) / 2;
    const d = hypot(p.x - g.center.x, p.z - g.center.z);
    if (Math.abs(d - r) <= tol.edgeInches) {
      return baseHit("item-edge", "items", index, item, p, {
        edge: "rim",
        distance: Math.abs(d - r),
      });
    }
    if (d <= r) return baseHit("item-face", "items", index, item, p, { distance: 0 });
    return null;
  }

  const local = planToFrameLocal(g.frame, p);
  if (!local) return null;
  const hw = g.size.width / 2;
  const hd = g.size.depth / 2;
  const sx = local.lx >= 0 ? 1 : -1;
  const sz = local.lz >= 0 ? 1 : -1;

  // Vertex: euclidean distance to the nearest corner.
  const cdx = Math.abs(local.lx) - hw;
  const cdz = Math.abs(local.lz) - hd;
  const cornerDist = hypot(cdx, cdz);
  if (cornerDist <= tol.vertexInches) {
    return baseHit("item-vertex", "items", index, item, p, {
      corner: CORNER_NAMES[`${sx},${sz}`],
      distance: cornerDist,
    });
  }

  // Edge: perpendicular distance to the nearest side, measured inside OR
  // outside the rect (an edge stays grabbable from either side), as long as
  // the point sits within the edge's span (corners already handled above).
  const dists = [
    { edge: "n", d: Math.abs(local.lz + hd) },
    { edge: "s", d: Math.abs(local.lz - hd) },
    { edge: "w", d: Math.abs(local.lx + hw) },
    { edge: "e", d: Math.abs(local.lx - hw) },
  ];
  dists.sort((a, b) => a.d - b.d);
  const near = dists[0];
  const inSpan = near.edge === "n" || near.edge === "s"
    ? Math.abs(local.lx) <= hw + tol.vertexInches
    : Math.abs(local.lz) <= hd + tol.vertexInches;
  if (near.d <= tol.edgeInches && inSpan) {
    return baseHit("item-edge", "items", index, item, p, { edge: near.edge, distance: near.d });
  }

  const inside = Math.abs(local.lx) <= hw && Math.abs(local.lz) <= hd;
  if (inside) return baseHit("item-face", "items", index, item, p, { distance: 0 });
  return null;
}

function hitPole(pole, index, p, tol) {
  const q = planPointOf({ x: pole?.x_inches, z: pole?.z_inches });
  if (!q) return null;
  const d = hypot(p.x - q.x, p.z - q.z);
  if (d > tol.poleInches) return null;
  return baseHit("pole", "poles", index, pole, p, { distance: d, center: q });
}

const distToSegment = (p, a, b) => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len2 = vx * vx + vz * vz;
  if (len2 === 0) return { d: hypot(p.x - a.x, p.z - a.z), t: 0, projection: { x: a.x, z: a.z }, degenerate: true };
  let t = ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * vx;
  const pz = a.z + t * vz;
  return { d: hypot(p.x - px, p.z - pz), t, projection: { x: px, z: pz }, degenerate: false };
};

// Even-odd ray cast. Deterministic on degenerate (collinear/zero-area)
// outlines — they report no face, matching their zero enclosed area.
const pointInPolygon = (p, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    if ((a.z > p.z) !== (b.z > p.z) &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};

function hitWall(wall, index, p, tol) {
  const g = wallPlanGeometry(wall);
  if (!g) return null;
  const pts = g.points;
  const segs = Array.isArray(wall?.shape?.segments) ? wall.shape.segments : [];

  // Vertex pass — nearest valid authored point within tolerance.
  let best = null;
  for (let i = 0; i < pts.length; i += 1) {
    const d = hypot(p.x - pts[i].x, p.z - pts[i].z);
    if (d <= tol.vertexInches && (!best || d < best.distance)) {
      best = baseHit("wall-vertex", "walls", index, wall, p, {
        vertexIndex: g.indices[i],
        distance: d,
      });
    }
  }
  if (best) return best;

  // Segment pass — assembly contract: segment i = points[i] -> points[i+1],
  // with points[n-1] -> points[0] only when closed. Degenerate (zero-length)
  // segments are skipped here; their endpoints remain reachable as vertices.
  const segCount = g.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const r = distToSegment(p, a, b);
    if (r.degenerate) continue;
    if (r.d <= tol.edgeInches && (!best || r.d < best.distance)) {
      best = baseHit("wall-segment", "walls", index, wall, p, {
        segmentIndex: i,
        segmentComponentId: segs[i]?.component_id ?? null,
        t: r.t,
        projection: r.projection,
        distance: r.d,
      });
    }
  }
  if (best) return best;

  if (g.closed && pointInPolygon(p, pts)) {
    return baseHit("wall-face", "walls", index, wall, p, { distance: 0 });
  }
  return null;
}

const HITTERS = { pole: hitPole, item: hitItem, wall: hitWall };
const COLLECTION_OF = { pole: "poles", item: "items", wall: "walls" };

// All hits under a plan point, topmost first. `scene` = { items, poles,
// walls }. `opts.order` lists layer names ('pole'|'item'|'wall') topmost
// first; default matches the canvas paint order (poles render last/on top).
export function hitTestPlanAll(scene, point, opts = {}) {
  const p = planPointOf(point);
  if (!p) return [];
  const tol = { ...DEFAULT_HIT_TOLERANCES, ...(opts.tolerances || {}) };
  if (fin(opts.edgeInches)) tol.edgeInches = opts.edgeInches;
  if (fin(opts.vertexInches)) tol.vertexInches = opts.vertexInches;
  if (fin(opts.poleInches)) tol.poleInches = opts.poleInches;
  const order = Array.isArray(opts.order) && opts.order.length ? opts.order : ["pole", "item", "wall"];
  const hits = [];
  for (const layer of order) {
    const rows = scene?.[COLLECTION_OF[layer]];
    const hitter = HITTERS[layer];
    if (!Array.isArray(rows) || !hitter) continue;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const hit = hitter(rows[i], i, p, tol);
      if (hit) hits.push(hit);
    }
  }
  return hits;
}

// The single topmost hit, or null (nothing hit / invalid point). Callers
// distinguish empty-plan from off-plan with classifyPlanPoint.
export function hitTestPlan(scene, point, opts = {}) {
  const hits = hitTestPlanAll(scene, point, opts);
  return hits.length ? hits[0] : null;
}

// 'inside' | 'outside' | 'invalid' — the canvas-vs-outside distinction
// (deselect vs clamp) without conflating it with a miss.
export function classifyPlanPoint(point, extent = PLAN_EXTENT) {
  const p = planPointOf(point);
  if (!p) return "invalid";
  const w = fin(extent?.width) ? extent.width : DEFAULT_PLAN_EXTENT.width;
  const d = fin(extent?.depth) ? extent.depth : DEFAULT_PLAN_EXTENT.depth;
  return p.x >= 0 && p.x <= w && p.z >= 0 && p.z <= d ? "inside" : "outside";
}

// Human label for a hit — the "labels" half of CMP-C08 for future
// selection/status surfaces. Returns null for a null hit.
export function hitLabel(hit) {
  if (!hit || typeof hit !== "object") return null;
  switch (hit.kind) {
    case "item-vertex": return `${hit.label} ${hit.corner} corner`;
    case "item-edge": return `${hit.label} ${hit.edge} edge`;
    case "item-face": return hit.label;
    case "pole": return hit.label;
    case "wall-vertex": return `${hit.label} vertex ${hit.vertexIndex + 1}`;
    case "wall-segment": return `${hit.label} segment ${hit.segmentIndex + 1}`;
    case "wall-face": return `${hit.label} interior`;
    default: return hit.label ?? null;
  }
}

// Label for a scene row without a hit-test — numeric-fallback lists and
// typed-coordinate pickers label rows the same way the canvas does.
export function sceneObjectLabel(collection, index) {
  return labelFor(collection, index);
}

// ---------------------------------------------------------------------------
// Drag primitives (the layout canvas's gesture seam)
// ---------------------------------------------------------------------------

// Begin a corner drag. `corner` is the item's authored top-left plan corner
// ({x,z}); `grabPoint` is the pointer's plan position ({x,z} or
// {x_inches,z_inches}). Produces the same record shape the canvas stores:
// { pointerId, key, identityKind, legacyIndex, count, corner, grab,
//   fingerprint, moved }.
export function beginSceneDrag({ pointerId, key, identityKind, legacyIndex, count, corner, grabPoint, fingerprint } = {}) {
  const c = planPointOf(corner);
  const g = planPointOf(grabPoint);
  if (!c || !g) return null;
  return {
    pointerId,
    key,
    identityKind,
    legacyIndex,
    count,
    corner: { x: c.x, z: c.z },
    grab: { dx: g.x - c.x, dz: g.z - c.z },
    fingerprint,
    moved: false,
  };
}

// The dragged corner for a live plan point (pointer minus grab offset).
export function sceneDragCorner(drag, planPoint) {
  const p = planPointOf(planPoint);
  if (!drag || !p || !fin(drag?.grab?.dx) || !fin(drag?.grab?.dz)) return null;
  return { x: p.x - drag.grab.dx, z: p.z - drag.grab.dz };
}

// Convert a release point into the committed patch, or null when the
// gesture resolves to the original corner. Exactly the canvas's rule:
// unchanged raw corner -> null; sub-inch wiggle that rounds back to the
// same corner -> null; otherwise whole-inch { x_inches, z_inches }.
export function commitSceneDrag(drag, releasePlanPoint) {
  const raw = sceneDragCorner(drag, releasePlanPoint);
  if (!raw || !drag || !fin(drag?.corner?.x) || !fin(drag?.corner?.z)) return null;
  if (raw.x === drag.corner.x && raw.z === drag.corner.z) return null;
  const roundX = Math.round(raw.x);
  const roundZ = Math.round(raw.z);
  if (roundX === drag.corner.x && roundZ === drag.corner.z) return null;
  return { x_inches: roundX, z_inches: roundZ };
}

// Re-resolve the dragged row at release time — the canvas's
// findCurrentIndex + fingerprint guard as one pure step. 'index' identity
// (id-less legacy rows) cancels when the array length changed; component/
// legacy ids re-find their row. A fingerprint mismatch (authoritative write
// mid-gesture) cancels. Returns { index, item } or null.
export function resolveSceneDragTarget(drag, items, { keyOf = layoutItemKey, fingerprintOf = layoutItemFingerprint } = {}) {
  if (!drag || !Array.isArray(items)) return null;
  let index;
  if (drag.identityKind === "index") {
    index = items.length === drag.count ? drag.legacyIndex : -1;
  } else {
    index = items.findIndex((it, i) => keyOf(it, i) === drag.key);
  }
  if (typeof index !== "number" || index < 0 || index >= items.length) return null;
  const item = items[index];
  if (fingerprintOf(item) !== drag.fingerprint) return null;
  return { index, item };
}

// ---------------------------------------------------------------------------
// Keyboard manipulation + numeric fallback
// ---------------------------------------------------------------------------

export const SCENE_KEYBOARD_STEP_INCHES = 1;
export const SCENE_KEYBOARD_BIG_STEP_INCHES = 12;

// Arrow-key nudge delta, or null. Mirrors the canvas: ctrl/meta/alt bail
// (browser shortcuts pass through), Shift multiplies the step to 12",
// non-arrow keys return null. preventDefault stays a caller concern (the
// canvas only prevents after the row validates).
export function keyboardNudge(event, { step = SCENE_KEYBOARD_STEP_INCHES, bigStep = SCENE_KEYBOARD_BIG_STEP_INCHES } = {}) {
  if (!event || typeof event !== "object") return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const s = event.shiftKey ? bigStep : step;
  const dirs = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
  const d = dirs[event.key];
  if (!d) return null;
  return { dx: d[0], dz: d[1] };
}

// Apply a delta to a position — keyboard nudges and typed-coordinate bumps
// produce the same { x_inches, z_inches } patch shape onMoveItem consumes.
// No rounding: authored fractional corners stay fractional (canvas parity).
export function nudgePatch(position, delta) {
  const pos = planPointOf(position);
  if (!pos || !delta || !fin(delta.dx) || !fin(delta.dz)) return null;
  return { x_inches: pos.x + delta.dx, z_inches: pos.z + delta.dz };
}

// Typed-coordinate entry — the numeric fallback path. Accepts { x, z } or
// { x_inches, z_inches }; finite-only, no clamping (bounds decisions belong
// to the editor, not the primitive). `round` opts into whole-inch commits.
export function positionPatch(point, { round = false } = {}) {
  const p = planPointOf(point);
  if (!p) return null;
  const x = round ? Math.round(p.x) : p.x;
  const z = round ? Math.round(p.z) : p.z;
  if (!fin(x) || !fin(z)) return null;
  return { x_inches: x, z_inches: z };
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

// Snap one value to a step. Non-finite values/steps pass through unchanged —
// snapping never invents or destroys authored data.
export function snapValue(v, step) {
  if (!fin(v) || !fin(step) || step <= 0) return v;
  return Math.round(v / step) * step;
}

// Snap a plan point to a uniform grid. Returns { x, z } or null on invalid
// input; `step` is inches (e.g. 1 for the default grid, 12 for foot marks).
export function snapPlanPoint(point, step) {
  const p = planPointOf(point);
  if (!p || !fin(step) || step <= 0) return null;
  return { x: snapValue(p.x, step), z: snapValue(p.z, step) };
}

// Alignment-snap candidates for a scene: every x and z "interesting"
// coordinate a dragged corner could align to — item edges + centers, pole
// points, wall vertices, and the plan bounds. `excludeKey` drops the row
// being dragged so it cannot snap to itself. Deterministic: candidates are
// deduped and returned in stable sorted order with their source.
export function snapCandidatesForScene(scene, { excludeKey, includeBounds = true, includeCenters = true, extent = PLAN_EXTENT } = {}) {
  const xMap = new Map();
  const zMap = new Map();
  const add = (axis, value, source) => {
    if (!fin(value)) return;
    const map = axis === "x" ? xMap : zMap;
    if (!map.has(value)) map.set(value, source);
  };
  if (includeBounds) {
    const w = fin(extent?.width) ? extent.width : DEFAULT_PLAN_EXTENT.width;
    const d = fin(extent?.depth) ? extent.depth : DEFAULT_PLAN_EXTENT.depth;
    add("x", 0, { kind: "bound" });
    add("x", w, { kind: "bound" });
    add("z", 0, { kind: "bound" });
    add("z", d, { kind: "bound" });
  }
  (scene?.items || []).forEach((item, i) => {
    const key = layoutItemKey(item, i);
    if (excludeKey && key === excludeKey) return;
    const g = itemPlanGeometry(item);
    if (!g) return;
    add("x", g.corner.x, { kind: "item-edge", index: i, key });
    add("x", g.corner.x + g.size.width, { kind: "item-edge", index: i, key });
    add("z", g.corner.z, { kind: "item-edge", index: i, key });
    add("z", g.corner.z + g.size.depth, { kind: "item-edge", index: i, key });
    if (includeCenters) {
      add("x", g.center.x, { kind: "item-center", index: i, key });
      add("z", g.center.z, { kind: "item-center", index: i, key });
    }
  });
  (scene?.poles || []).forEach((pole, i) => {
    const key = layoutItemKey(pole, i);
    if (excludeKey && key === excludeKey) return;
    const q = planPointOf({ x: pole?.x_inches, z: pole?.z_inches });
    if (!q) return;
    add("x", q.x, { kind: "pole", index: i, key });
    add("z", q.z, { kind: "pole", index: i, key });
  });
  (scene?.walls || []).forEach((wall, i) => {
    const key = layoutItemKey(wall, i);
    if (excludeKey && key === excludeKey) return;
    const g = wallPlanGeometry(wall);
    if (!g) return;
    g.points.forEach((q, j) => {
      add("x", q.x, { kind: "wall-vertex", index: i, key, vertexIndex: g.indices[j] });
      add("z", q.z, { kind: "wall-vertex", index: i, key, vertexIndex: g.indices[j] });
    });
  });
  const sort = (map) => [...map.entries()].map(([value, source]) => ({ value, source })).sort((a, b) => a.value - b.value);
  return { x: sort(xMap), z: sort(zMap) };
}

// Snap a plan point to candidate axes. Nearest candidate within `tolInches`
// wins per axis; ties resolve to the smaller value then first source.
// Returns { x, z, guides } — guides lists the winning source per snapped
// axis for alignment-line rendering (O-035).
export function snapToCandidates(point, candidates, tolInches) {
  const p = planPointOf(point);
  if (!p || !candidates || !fin(tolInches) || tolInches < 0) return null;
  const pick = (axis, v) => {
    let best = null;
    for (const c of candidates[axis] || []) {
      const delta = Math.abs(c.value - v);
      if (delta > tolInches) continue;
      if (!best || delta < best.delta || (delta === best.delta && c.value < best.value)) {
        best = { value: c.value, source: c.source, delta };
      }
    }
    return best;
  };
  const gx = pick("x", p.x);
  const gz = pick("z", p.z);
  const guides = [];
  if (gx) guides.push({ axis: "x", value: gx.value, source: gx.source, delta: gx.delta });
  if (gz) guides.push({ axis: "z", value: gz.value, source: gz.source, delta: gz.delta });
  return { x: gx ? gx.value : p.x, z: gz ? gz.value : p.z, guides };
}

// ---------------------------------------------------------------------------
// Scene-edit records (O-040 — the stroke-undo seam)
// ---------------------------------------------------------------------------
//
// A finished gesture or keyboard edit as a history-ready record: `before`
// holds the pre-stroke state, `after` the committed patch — for item moves
// both are { x_inches, z_inches } patch-shaped, so the record doubles as
// the undo payload. Anchors are the history store's concern (consumers
// stamp before/after anchors at record time); identity (`key`,
// `identityKind`) rides along for target resolution + labels.

export const SCENE_EDIT_ITEM_MOVE = "item-move";

// A committed corner drag. `drag` is the live beginSceneDrag record (its
// `corner` is the captured pre-stroke state); `patch` is the commitSceneDrag
// result. Null on any missing/invalid piece — callers already null-check
// patch/target upstream.
export function sceneEditFromDrag(drag, patch) {
  if (!drag || !patch) return null;
  if (!fin(drag?.corner?.x) || !fin(drag?.corner?.z)) return null;
  if (!fin(patch?.x_inches) || !fin(patch?.z_inches)) return null;
  return {
    kind: SCENE_EDIT_ITEM_MOVE,
    method: "drag",
    key: drag.key ?? null,
    identityKind: drag.identityKind ?? null,
    before: { x_inches: drag.corner.x, z_inches: drag.corner.z },
    after: { x_inches: patch.x_inches, z_inches: patch.z_inches },
  };
}

// A keyboard nudge — same before/after shape as the drag path so the
// history store treats every item move uniformly. `position` is the row's
// current authored position ({x,z} or {x_inches,z_inches}); `key` is the
// layoutItemKey identity the consumer resolves targets + bursts by.
export function sceneEditFromNudge(key, position, patch) {
  const pos = planPointOf(position);
  if (!pos || !patch || !fin(patch?.x_inches) || !fin(patch?.z_inches)) return null;
  return {
    kind: SCENE_EDIT_ITEM_MOVE,
    method: "nudge",
    key: key ?? null,
    identityKind: "key",
    before: { x_inches: pos.x, z_inches: pos.z },
    after: { x_inches: patch.x_inches, z_inches: patch.z_inches },
  };
}

// Burst-coalescing identity (O-040 "sensible history"): drags never merge —
// one gesture is already one commit. Nudges on the same row merge while the
// key stream keeps hitting the same target; the merge window lives in the
// history store, this is only the identity. Anything else returns null and
// records as its own command.
export function sceneEditCoalesceKey(edit) {
  if (!edit || edit.method !== "nudge" || typeof edit.key !== "string" || !edit.key) return null;
  return `nudge:${edit.key}`;
}