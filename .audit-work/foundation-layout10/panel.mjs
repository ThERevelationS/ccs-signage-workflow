// src/components/estimator/foundation/FoundationLayoutCanvas.jsx
import { useEffect, useRef, useState as useState2, useSyncExternalStore } from "react";

// s:/app/s-lucide_react
var Move = () => null;
var ZoomIn = () => null;
var ZoomOut = () => null;

// src/components/estimator/foundation/foundationSceneTransforms.js
var INCHES_PER_FOOT = 12;
var PLAN_TO_WORLD_SCALE = 1 / INCHES_PER_FOOT;
var DEFAULT_PLAN_EXTENT = Object.freeze({ width: 480, depth: 320 });
var DEFAULT_ZOOM_RANGE = Object.freeze({ min: 0.5, max: 2 });
var fin = (v) => typeof v === "number" && Number.isFinite(v);
var DEG_TO_RAD = Math.PI / 180;
var validExtent = (extent) => !!extent && fin(extent.width) && fin(extent.depth) && extent.width > 0 && extent.depth > 0;
var resolveExtent = (extent) => validExtent(extent) ? extent : DEFAULT_PLAN_EXTENT;
function planViewFromElementRect(rect, extent = DEFAULT_PLAN_EXTENT) {
  if (!rect || !fin(rect.left) || !fin(rect.top) || !fin(rect.width) || !fin(rect.height)) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ex = resolveExtent(extent);
  if (!validExtent(ex)) return null;
  return {
    originX: rect.left,
    originY: rect.top,
    scaleX: rect.width / ex.width,
    scaleY: rect.height / ex.depth,
    extent: { width: ex.width, depth: ex.depth }
  };
}
var validView = (view) => !!view && fin(view.originX) && fin(view.originY) && fin(view.scaleX) && fin(view.scaleY) && view.scaleX !== 0 && view.scaleY !== 0;
function screenToPlan(view, screenX, screenY) {
  if (!fin(screenX) || !fin(screenY)) return null;
  if (!validView(view)) return null;
  return {
    x_inches: (screenX - view.originX) / view.scaleX,
    z_inches: (screenY - view.originY) / view.scaleY
  };
}
function planPointOf(point) {
  if (!point || typeof point !== "object") return null;
  const x = fin(point.x) ? point.x : fin(point.x_inches) ? point.x_inches : null;
  const z = fin(point.z) ? point.z : fin(point.z_inches) ? point.z_inches : null;
  if (x === null || z === null) return null;
  return { x, z };
}
function planFrameForRect({ corner, size, rotationDegrees = 0 } = {}) {
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
    sin: Math.sin(rad)
  };
}
function planToFrameLocal(frame, point) {
  const p = planPointOf(point);
  if (!frame || !fin(frame.cx) || !fin(frame.cz) || !fin(frame.cos) || !fin(frame.sin) || !p) return null;
  const dx = p.x - frame.cx;
  const dz = p.z - frame.cz;
  return { lx: frame.cos * dx + frame.sin * dz, lz: -frame.sin * dx + frame.cos * dz };
}
function frameLocalToPlan(frame, local) {
  if (!frame || !fin(frame.cx) || !fin(frame.cz) || !fin(frame.cos) || !fin(frame.sin)) return null;
  if (!local || !fin(local.lx) || !fin(local.lz)) return null;
  return {
    x: frame.cx + frame.cos * local.lx - frame.sin * local.lz,
    z: frame.cz + frame.sin * local.lx + frame.cos * local.lz
  };
}
function framePlanCorners(frame, size) {
  if (!frame || !size || !fin(size.width) || !fin(size.depth) || size.width <= 0 || size.depth <= 0) return null;
  const hw = size.width / 2;
  const hd = size.depth / 2;
  const corner = (lx, lz) => frameLocalToPlan(frame, { lx, lz });
  return {
    nw: corner(-hw, -hd),
    ne: corner(hw, -hd),
    se: corner(hw, hd),
    sw: corner(-hw, hd)
  };
}

// src/components/estimator/foundation/foundationLayoutModel.js
var FOUNDATION_LAYOUT_WIDTH_INCHES = 480;
var FOUNDATION_LAYOUT_DEPTH_INCHES = 320;
var finiteNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n2 = Number(v);
    return Number.isFinite(n2) ? n2 : null;
  }
  return null;
};
function layoutPointInches(clientX, clientY, rect) {
  const view = planViewFromElementRect(rect, {
    width: FOUNDATION_LAYOUT_WIDTH_INCHES,
    depth: FOUNDATION_LAYOUT_DEPTH_INCHES
  });
  return screenToPlan(view, clientX, clientY);
}
function foundationLayoutFootprint(item) {
  if (!item || typeof item !== "object") return null;
  const w = item.foundation_type === "pillar" ? finiteNumber(item.diameter) : finiteNumber(item.length_inches);
  const d = item.foundation_type === "pillar" ? finiteNumber(item.diameter) : finiteNumber(item.width_inches);
  if (w === null || d === null || w <= 0 || d <= 0) return null;
  return { width: w, depth: d };
}
function layoutPositionInches(item) {
  if (!item || typeof item !== "object") return { valid: false, x_inches: 0, z_inches: 0 };
  const read = (v) => {
    if (v === void 0 || v === null) return 0;
    return finiteNumber(v);
  };
  const x = read(item.x_inches);
  const z = read(item.z_inches);
  if (x === null || z === null) return { valid: false, x_inches: 0, z_inches: 0 };
  return { valid: true, x_inches: x, z_inches: z };
}
function layoutItemKey(item, index) {
  if (item?.component_id) return `component:${item.component_id}`;
  if (item?.id !== void 0 && item?.id !== null) return `legacy:${item.id}`;
  return `index:${index}`;
}
function layoutItemFingerprint(item) {
  if (!item || typeof item !== "object") return null;
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  return JSON.stringify({
    v: pos.valid,
    t: item.foundation_type || null,
    x: pos.x_inches,
    z: pos.z_inches,
    w: fp?.width ?? null,
    d: fp?.depth ?? null,
    r: item.rotation_degrees ?? null
  });
}

// src/components/estimator/foundation/foundationSceneInput.js
var fin2 = (v) => typeof v === "number" && Number.isFinite(v);
var hypot = Math.hypot;
var PLAN_EXTENT = Object.freeze({
  width: FOUNDATION_LAYOUT_WIDTH_INCHES,
  depth: FOUNDATION_LAYOUT_DEPTH_INCHES
});
var DEFAULT_HIT_TOLERANCES = Object.freeze({
  edgeInches: 3,
  vertexInches: 4,
  poleInches: 4
});
function itemPlanGeometry(item) {
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  if (!fp || !pos.valid) return null;
  const frame = planFrameForRect({
    corner: { x: pos.x_inches, z: pos.z_inches },
    size: fp,
    rotationDegrees: fin2(item?.rotation_degrees) ? item.rotation_degrees : 0
  });
  if (!frame) return null;
  return {
    corner: { x: pos.x_inches, z: pos.z_inches },
    size: { width: fp.width, depth: fp.depth },
    center: { x: frame.cx, z: frame.cz },
    frame,
    circular: item?.foundation_type === "pillar"
  };
}
function wallPlanGeometry(wall) {
  const raw = wall?.shape?.points;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const points = [];
  const indices = [];
  raw.forEach((p, i) => {
    const q = planPointOf(p);
    if (q) {
      points.push(q);
      indices.push(i);
    }
  });
  if (!points.length) return null;
  return { points, indices, closed: wall?.shape?.closed === true && points.length >= 3 };
}
var labelFor = (collection, index) => {
  switch (collection) {
    case "items":
      return `Foundation ${index + 1}`;
    case "poles":
      return `Pole ${index + 1}`;
    case "walls":
      return `Wall ${index + 1}`;
    default:
      return `Object ${index + 1}`;
  }
};
var baseHit = (kind, collection, index, obj, point, extra) => ({
  kind,
  collection,
  index,
  key: layoutItemKey(obj, index),
  componentId: obj?.component_id ?? null,
  distance: 0,
  point: { x: point.x, z: point.z },
  label: labelFor(collection, index),
  ...extra
});
var CORNER_NAMES = { "-1,-1": "nw", "1,-1": "ne", "1,1": "se", "-1,1": "sw" };
function hitItem(item, index, p, tol) {
  const g = itemPlanGeometry(item);
  if (!g) return null;
  if (g.circular) {
    const r2 = Math.min(g.size.width, g.size.depth) / 2;
    const d = hypot(p.x - g.center.x, p.z - g.center.z);
    if (Math.abs(d - r2) <= tol.edgeInches) {
      return baseHit("item-edge", "items", index, item, p, {
        edge: "rim",
        distance: Math.abs(d - r2)
      });
    }
    if (d <= r2) return baseHit("item-face", "items", index, item, p, { distance: 0 });
    return null;
  }
  const local = planToFrameLocal(g.frame, p);
  if (!local) return null;
  const hw = g.size.width / 2;
  const hd = g.size.depth / 2;
  const sx = local.lx >= 0 ? 1 : -1;
  const sz = local.lz >= 0 ? 1 : -1;
  const cdx = Math.abs(local.lx) - hw;
  const cdz = Math.abs(local.lz) - hd;
  const cornerDist = hypot(cdx, cdz);
  if (cornerDist <= tol.vertexInches) {
    return baseHit("item-vertex", "items", index, item, p, {
      corner: CORNER_NAMES[`${sx},${sz}`],
      distance: cornerDist
    });
  }
  const dists = [
    { edge: "n", d: Math.abs(local.lz + hd) },
    { edge: "s", d: Math.abs(local.lz - hd) },
    { edge: "w", d: Math.abs(local.lx + hw) },
    { edge: "e", d: Math.abs(local.lx - hw) }
  ];
  dists.sort((a, b) => a.d - b.d);
  const near = dists[0];
  const inSpan = near.edge === "n" || near.edge === "s" ? Math.abs(local.lx) <= hw + tol.vertexInches : Math.abs(local.lz) <= hd + tol.vertexInches;
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
var distToSegment = (p, a, b) => {
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
var pointInPolygon = (p, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) {
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
  let best = null;
  for (let i = 0; i < pts.length; i += 1) {
    const d = hypot(p.x - pts[i].x, p.z - pts[i].z);
    if (d <= tol.vertexInches && (!best || d < best.distance)) {
      best = baseHit("wall-vertex", "walls", index, wall, p, {
        vertexIndex: g.indices[i],
        distance: d
      });
    }
  }
  if (best) return best;
  const segCount = g.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const r2 = distToSegment(p, a, b);
    if (r2.degenerate) continue;
    if (r2.d <= tol.edgeInches && (!best || r2.d < best.distance)) {
      best = baseHit("wall-segment", "walls", index, wall, p, {
        segmentIndex: i,
        segmentComponentId: segs[i]?.component_id ?? null,
        t: r2.t,
        projection: r2.projection,
        distance: r2.d
      });
    }
  }
  if (best) return best;
  if (g.closed && pointInPolygon(p, pts)) {
    return baseHit("wall-face", "walls", index, wall, p, { distance: 0 });
  }
  return null;
}
var HITTERS = { pole: hitPole, item: hitItem, wall: hitWall };
var COLLECTION_OF = { pole: "poles", item: "items", wall: "walls" };
function hitTestPlanAll(scene, point, opts = {}) {
  const p = planPointOf(point);
  if (!p) return [];
  const tol = { ...DEFAULT_HIT_TOLERANCES, ...opts.tolerances || {} };
  if (fin2(opts.edgeInches)) tol.edgeInches = opts.edgeInches;
  if (fin2(opts.vertexInches)) tol.vertexInches = opts.vertexInches;
  if (fin2(opts.poleInches)) tol.poleInches = opts.poleInches;
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
function hitLabel(hit) {
  if (!hit || typeof hit !== "object") return null;
  switch (hit.kind) {
    case "item-vertex":
      return `${hit.label} ${hit.corner} corner`;
    case "item-edge":
      return `${hit.label} ${hit.edge} edge`;
    case "item-face":
      return hit.label;
    case "pole":
      return hit.label;
    case "wall-vertex":
      return `${hit.label} vertex ${hit.vertexIndex + 1}`;
    case "wall-segment":
      return `${hit.label} segment ${hit.segmentIndex + 1}`;
    case "wall-face":
      return `${hit.label} interior`;
    default:
      return hit.label ?? null;
  }
}
function sceneObjectLabel(collection, index) {
  return labelFor(collection, index);
}
function beginSceneDrag({ pointerId, key, identityKind, legacyIndex: legacyIndex2, count, corner, grabPoint, fingerprint } = {}) {
  const c = planPointOf(corner);
  const g = planPointOf(grabPoint);
  if (!c || !g) return null;
  return {
    pointerId,
    key,
    identityKind,
    legacyIndex: legacyIndex2,
    count,
    corner: { x: c.x, z: c.z },
    grab: { dx: g.x - c.x, dz: g.z - c.z },
    fingerprint,
    moved: false
  };
}
function sceneDragCorner(drag, planPoint) {
  const p = planPointOf(planPoint);
  if (!drag || !p || !fin2(drag?.grab?.dx) || !fin2(drag?.grab?.dz)) return null;
  return { x: p.x - drag.grab.dx, z: p.z - drag.grab.dz };
}
function commitSceneDrag(drag, releasePlanPoint) {
  const raw = sceneDragCorner(drag, releasePlanPoint);
  if (!raw || !drag || !fin2(drag?.corner?.x) || !fin2(drag?.corner?.z)) return null;
  if (raw.x === drag.corner.x && raw.z === drag.corner.z) return null;
  const roundX = Math.round(raw.x);
  const roundZ = Math.round(raw.z);
  if (roundX === drag.corner.x && roundZ === drag.corner.z) return null;
  return { x_inches: roundX, z_inches: roundZ };
}
function resolveSceneDragTarget(drag, items, { keyOf = layoutItemKey, fingerprintOf = layoutItemFingerprint } = {}) {
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
var SCENE_KEYBOARD_STEP_INCHES = 1;
var SCENE_KEYBOARD_BIG_STEP_INCHES = 12;
function keyboardNudge(event, { step = SCENE_KEYBOARD_STEP_INCHES, bigStep = SCENE_KEYBOARD_BIG_STEP_INCHES } = {}) {
  if (!event || typeof event !== "object") return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const s = event.shiftKey ? bigStep : step;
  const dirs = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
  const d = dirs[event.key];
  if (!d) return null;
  return { dx: d[0], dz: d[1] };
}
function nudgePatch(position, delta) {
  const pos = planPointOf(position);
  if (!pos || !delta || !fin2(delta.dx) || !fin2(delta.dz)) return null;
  return { x_inches: pos.x + delta.dx, z_inches: pos.z + delta.dz };
}
function snapCandidatesForScene(scene, { excludeKey, includeBounds = true, includeCenters = true, extent = PLAN_EXTENT } = {}) {
  const xMap = /* @__PURE__ */ new Map();
  const zMap = /* @__PURE__ */ new Map();
  const add = (axis, value, source) => {
    if (!fin2(value)) return;
    const map = axis === "x" ? xMap : zMap;
    if (!map.has(value)) map.set(value, source);
  };
  if (includeBounds) {
    const w = fin2(extent?.width) ? extent.width : DEFAULT_PLAN_EXTENT.width;
    const d = fin2(extent?.depth) ? extent.depth : DEFAULT_PLAN_EXTENT.depth;
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
function snapToCandidates(point, candidates, tolInches) {
  const p = planPointOf(point);
  if (!p || !candidates || !fin2(tolInches) || tolInches < 0) return null;
  const pick = (axis, v) => {
    let best = null;
    for (const c of candidates[axis] || []) {
      const delta = Math.abs(c.value - v);
      if (delta > tolInches) continue;
      if (!best || delta < best.delta || delta === best.delta && c.value < best.value) {
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
var SCENE_EDIT_ITEM_MOVE = "item-move";
function sceneEditFromDrag(drag, patch) {
  if (!drag || !patch) return null;
  if (!fin2(drag?.corner?.x) || !fin2(drag?.corner?.z)) return null;
  if (!fin2(patch?.x_inches) || !fin2(patch?.z_inches)) return null;
  return {
    kind: SCENE_EDIT_ITEM_MOVE,
    method: "drag",
    key: drag.key ?? null,
    identityKind: drag.identityKind ?? null,
    before: { x_inches: drag.corner.x, z_inches: drag.corner.z },
    after: { x_inches: patch.x_inches, z_inches: patch.z_inches }
  };
}
function sceneEditFromNudge(key, position, patch) {
  const pos = planPointOf(position);
  if (!pos || !patch || !fin2(patch?.x_inches) || !fin2(patch?.z_inches)) return null;
  return {
    kind: SCENE_EDIT_ITEM_MOVE,
    method: "nudge",
    key: key ?? null,
    identityKind: "key",
    before: { x_inches: pos.x, z_inches: pos.z },
    after: { x_inches: patch.x_inches, z_inches: patch.z_inches }
  };
}
function sceneEditCoalesceKey(edit) {
  if (!edit || edit.method !== "nudge" || typeof edit.key !== "string" || !edit.key) return null;
  return `nudge:${edit.key}`;
}

// src/components/estimator/foundation/foundationSceneHistory.js
var fin3 = (v) => typeof v === "number" && Number.isFinite(v);
var SCENE_HISTORY_CAPACITY = 100;
var SCENE_HISTORY_COALESCE_WINDOW_MS = 1200;
var wallAnchorPart = (wall) => JSON.stringify({
  pts: Array.isArray(wall?.shape?.points) ? wall.shape.points : null,
  closed: wall?.shape?.closed === true
});
function sceneLayoutAnchor(scene) {
  const s = Array.isArray(scene) ? { items: scene } : scene && typeof scene === "object" ? scene : {};
  const fp = (rows, f) => Array.isArray(rows) ? rows.map(f).join(",") : "";
  return `i:${fp(s.items, layoutItemFingerprint)}|p:${fp(s.poles, layoutItemFingerprint)}|w:${fp(s.walls, wallAnchorPart)}`;
}
var hasAnchor = (v) => v !== void 0 && v !== null;
function createSceneHistory({
  capacity = SCENE_HISTORY_CAPACITY,
  coalesceWindowMs = SCENE_HISTORY_COALESCE_WINDOW_MS,
  now = () => Date.now(),
  equal
} = {}) {
  const eq = typeof equal === "function" ? equal : (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const cap = fin3(capacity) && capacity >= 1 ? Math.floor(capacity) : SCENE_HISTORY_CAPACITY;
  const window_ = coalesceWindowMs === Infinity ? Infinity : fin3(coalesceWindowMs) && coalesceWindowMs >= 0 ? coalesceWindowMs : SCENE_HISTORY_COALESCE_WINDOW_MS;
  const clock = typeof now === "function" ? now : () => Date.now();
  let past = [];
  let future = [];
  let open = null;
  let detached = 0;
  let currentAnchor;
  let anchored = false;
  let seq = 0;
  let stateVersion = 0;
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    stateVersion += 1;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
      }
    }
  };
  const info = (e, i) => ({
    id: e.id,
    kind: e.kind ?? null,
    method: e.method ?? null,
    label: e.label ?? null,
    target: e.target ?? null,
    moves: e.moves ?? 1,
    openedAt: e.openedAt ?? null,
    committedAt: e.committedAt ?? null,
    lastAt: e.lastAt ?? null,
    detached: typeof i === "number" ? i < detached : false
  });
  const markDetached = () => {
    let changed = false;
    if (open) {
      open = null;
      changed = true;
    }
    if (future.length) {
      future = [];
      changed = true;
    }
    if (detached !== past.length) {
      detached = past.length;
      changed = true;
    }
    return changed;
  };
  const boundStacks = () => {
    while (past.length > cap) {
      past.shift();
      if (detached > 0) detached -= 1;
    }
    while (future.length > cap) future.pop();
  };
  const topApplies = () => past.length > detached && (!hasAnchor(past[past.length - 1].afterAnchor) || past[past.length - 1].afterAnchor === currentAnchor);
  const topRedoApplies = () => future.length > 0 && (!hasAnchor(future[0].beforeAnchor) || future[0].beforeAnchor === currentAnchor);
  const seedAnchor = (anchor) => {
    if (!anchored && hasAnchor(anchor)) {
      anchored = true;
      currentAnchor = anchor;
    }
  };
  const reconcileBase = (beforeAnchor) => {
    if (anchored && hasAnchor(beforeAnchor) && beforeAnchor !== currentAnchor) return markDetached();
    return false;
  };
  const observe = (anchor) => {
    if (!hasAnchor(anchor)) return { status: "unanchored" };
    if (!anchored) {
      anchored = true;
      currentAnchor = anchor;
      return { status: "anchored" };
    }
    if (anchor === currentAnchor) return { status: "current" };
    const changed = markDetached();
    currentAnchor = anchor;
    if (changed) emit();
    return { status: "detached", detached };
  };
  const clear = (anchor) => {
    past = [];
    future = [];
    open = null;
    detached = 0;
    anchored = false;
    currentAnchor = void 0;
    if (hasAnchor(anchor)) {
      anchored = true;
      currentAnchor = anchor;
    }
    emit();
    return { status: "cleared" };
  };
  const recordEdit = (edit = {}) => {
    const at = fin3(edit.at) ? edit.at : clock();
    if (open) commitStroke({ at });
    if (anchored && !(hasAnchor(edit.beforeAnchor) && hasAnchor(edit.afterAnchor))) {
      return { status: "ignored-unanchored" };
    }
    if (hasAnchor(edit.beforeAnchor) && edit.beforeAnchor === edit.afterAnchor && eq(edit.before, edit.after)) {
      return { status: "ignored-noop" };
    }
    seedAnchor(edit.beforeAnchor);
    const detachedBefore = reconcileBase(edit.beforeAnchor) ? detached : null;
    const key = edit.coalesceKey ?? null;
    const top = past[past.length - 1];
    const mergeable = key != null && top && past.length - 1 >= detached && top.coalesceKey === key && top.mergeable !== false && (!hasAnchor(edit.beforeAnchor) || !hasAnchor(top.afterAnchor) || edit.beforeAnchor === top.afterAnchor) && window_ > 0 && at - top.lastAt <= window_;
    if (mergeable) {
      top.after = edit.after;
      if (hasAnchor(edit.afterAnchor)) {
        top.afterAnchor = edit.afterAnchor;
        currentAnchor = edit.afterAnchor;
      }
      top.lastAt = at;
      top.moves = (top.moves ?? 1) + 1;
      if (edit.label) top.label = edit.label;
      future = [];
      if (hasAnchor(top.beforeAnchor) && top.beforeAnchor === top.afterAnchor && eq(top.before, top.after)) {
        past.pop();
        emit();
        return { status: "merged-noop", detachedBefore };
      }
      emit();
      return { status: "merged", entry: top, detachedBefore };
    }
    const entry = {
      id: seq += 1,
      kind: edit.kind ?? null,
      method: edit.method ?? null,
      label: edit.label ?? null,
      target: edit.target ?? null,
      coalesceKey: key,
      before: edit.before,
      after: edit.after,
      beforeAnchor: edit.beforeAnchor,
      afterAnchor: edit.afterAnchor,
      mergeable: edit.mergeable,
      openedAt: at,
      committedAt: at,
      lastAt: at,
      moves: 1
    };
    past.push(entry);
    boundStacks();
    future = [];
    if (hasAnchor(edit.afterAnchor)) currentAnchor = edit.afterAnchor;
    emit();
    return { status: "recorded", entry, detachedBefore };
  };
  const beginStroke = (opts = {}) => {
    const at = fin3(opts.at) ? opts.at : clock();
    if (open) commitStroke({ at });
    if (anchored && !hasAnchor(opts.beforeAnchor)) return { status: "ignored-unanchored" };
    seedAnchor(opts.beforeAnchor);
    const detachedBefore = reconcileBase(opts.beforeAnchor) ? detached : null;
    open = {
      id: seq += 1,
      kind: opts.kind ?? null,
      method: opts.method ?? null,
      label: opts.label ?? null,
      target: opts.target ?? null,
      coalesceKey: opts.coalesceKey ?? null,
      before: opts.before,
      after: void 0,
      beforeAnchor: opts.beforeAnchor,
      afterAnchor: void 0,
      mergeable: opts.mergeable,
      openedAt: at,
      lastAt: at,
      moves: 0
    };
    emit();
    return { status: "open", stroke: open, detachedBefore };
  };
  const extendStroke = ({ after, afterAnchor, at } = {}) => {
    if (!open) return { status: "no-stroke" };
    const t = fin3(at) ? at : clock();
    if (after !== void 0) open.after = after;
    if (hasAnchor(afterAnchor)) {
      open.afterAnchor = afterAnchor;
      currentAnchor = afterAnchor;
    }
    open.lastAt = t;
    open.moves = (open.moves ?? 0) + 1;
    emit();
    return { status: "extended", stroke: open };
  };
  const commitStroke = ({ after, afterAnchor, label, at } = {}) => {
    if (!open) return { status: "no-stroke" };
    const t = fin3(at) ? at : clock();
    const s = open;
    open = null;
    if (after !== void 0) s.after = after;
    if (hasAnchor(afterAnchor)) {
      s.afterAnchor = afterAnchor;
      currentAnchor = afterAnchor;
    }
    if (label) s.label = label;
    if (s.after === void 0) {
      emit();
      return { status: "cancelled-empty" };
    }
    if (anchored && !hasAnchor(s.afterAnchor)) {
      emit();
      return { status: "ignored-unanchored" };
    }
    if (hasAnchor(s.beforeAnchor) && s.beforeAnchor === s.afterAnchor && eq(s.before, s.after)) {
      emit();
      return { status: "ignored-noop" };
    }
    const entry = { ...s, committedAt: t, lastAt: t, moves: Math.max(1, s.moves ?? 0) };
    past.push(entry);
    boundStacks();
    future = [];
    emit();
    return { status: "recorded", entry };
  };
  const cancelStroke = () => {
    if (!open) return { status: "no-stroke" };
    open = null;
    emit();
    return { status: "cancelled" };
  };
  const traverse = (direction, anchor, apply) => {
    if (open) return { status: "busy" };
    if (hasAnchor(anchor) && anchored && anchor !== currentAnchor) {
      return { status: "anchor-mismatch" };
    }
    const applies = direction === "undo" ? topApplies : topRedoApplies;
    if (!applies()) {
      const source = direction === "undo" ? past : future;
      if (!source.length || direction === "undo" && past.length <= detached) {
        if (direction === "undo" && past.length) {
          past = [];
          detached = 0;
          emit();
          return { status: "stale" };
        }
        return { status: source.length ? "stale" : "empty" };
      }
      if (direction === "undo") {
        if (markDetached()) emit();
        return { status: "stale" };
      }
      if (future.length) {
        future = [];
        emit();
      }
      return { status: "stale" };
    }
    const entry = direction === "undo" ? past[past.length - 1] : future[0];
    const patch = direction === "undo" ? entry.before : entry.after;
    const payload = {
      status: "applied",
      direction,
      kind: entry.kind,
      method: entry.method,
      label: entry.label,
      target: entry.target,
      patch,
      entry
    };
    if (typeof apply === "function") {
      let result;
      try {
        result = apply(payload);
      } catch {
        result = false;
      }
      if (result === false) return { status: "rejected", entry };
    }
    if (direction === "undo") {
      past.pop();
      future.unshift(entry);
      if (hasAnchor(entry.beforeAnchor)) currentAnchor = entry.beforeAnchor;
    } else {
      future.shift();
      past.push(entry);
      if (hasAnchor(entry.afterAnchor)) currentAnchor = entry.afterAnchor;
    }
    emit();
    return payload;
  };
  const undo = (anchor, apply) => traverse("undo", anchor, apply);
  const redo = (anchor, apply) => traverse("redo", anchor, apply);
  const peekUndo = () => topApplies() ? info(past[past.length - 1]) : null;
  const peekRedo = () => topRedoApplies() ? info(future[0]) : null;
  const entries = () => ({
    past: past.map((e, i) => info(e, i)),
    future: future.map((e, i) => ({ ...info(e), detached: false })),
    detached,
    open: open ? info(open) : null
  });
  const getState = () => ({
    stateVersion,
    capacity: cap,
    coalesceWindowMs: window_,
    busy: open != null,
    open: open ? info(open) : null,
    canUndo: !open && topApplies(),
    canRedo: !open && topRedoApplies(),
    undoDepth: Math.max(0, past.length - detached),
    redoDepth: future.length,
    detached,
    undoLabel: peekUndo()?.label ?? null,
    redoLabel: peekRedo()?.label ?? null
  });
  const subscribe = (fn) => {
    if (typeof fn !== "function") return () => {
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  return {
    // observation + lifecycle
    observe,
    clear,
    // recording
    recordEdit,
    beginStroke,
    extendStroke,
    commitStroke,
    cancelStroke,
    // traversal
    undo,
    redo,
    // inspection + subscription
    peekUndo,
    peekRedo,
    entries,
    getState,
    subscribe,
    get stateVersion() {
      return stateVersion;
    },
    get currentAnchor() {
      return currentAnchor;
    },
    get anchored() {
      return anchored;
    }
  };
}

// src/components/estimator/foundation/foundationSceneSelection.js
var fin4 = (v) => typeof v === "number" && Number.isFinite(v);
var isId = (v) => typeof v === "string" && v.length > 0;
var hypot2 = Math.hypot;
var SELECTION_CLICK_THRESHOLD_PX = 5;
var REGION_SELECT_MODES = Object.freeze(["intersect", "contain"]);
var SCENE_NODE_KINDS = Object.freeze([
  "item",
  "wall",
  "wall-segment",
  "pole",
  "pole-sign",
  "wall-cap",
  "cabinet"
]);
var COLLECTION_OF_KIND = Object.freeze({
  item: "items",
  wall: "walls",
  "wall-segment": "walls",
  pole: "poles",
  "pole-sign": "poles",
  "wall-cap": "wall_caps",
  cabinet: "signage_cabinets"
});
function sceneCollections(scene) {
  const s = scene && typeof scene === "object" ? scene : {};
  return {
    items: Array.isArray(s.items) ? s.items : [],
    walls: Array.isArray(s.walls) ? s.walls : [],
    poles: Array.isArray(s.poles) ? s.poles : [],
    wall_caps: Array.isArray(s.wall_caps) ? s.wall_caps : Array.isArray(s.wallCaps) ? s.wallCaps : [],
    signage_cabinets: Array.isArray(s.signage_cabinets) ? s.signage_cabinets : Array.isArray(s.signageCabinets) ? s.signageCabinets : []
  };
}
var subRef = (componentId, index) => isId(componentId) ? `component:${componentId}` : `index:${index}`;
var sceneNodeId = Object.freeze({
  item: (key) => `item:${key}`,
  pole: (key) => `pole:${key}`,
  wall: (key) => `wall:${key}`,
  wallSegment: (wallKey, ref) => `wall-segment:${wallKey}|${ref}`,
  poleSign: (poleKey, ref) => `pole-sign:${poleKey}|${ref}`,
  wallCap: (key) => `wall-cap:${key}`,
  cabinet: (key) => `cabinet:${key}`
});
function parseSceneNodeId(id) {
  if (typeof id !== "string" || !id) return null;
  const prefixed = (prefix, kind, sub) => {
    if (!id.startsWith(prefix)) return null;
    const body = id.slice(prefix.length);
    if (!sub) return { kind, key: body, parentKey: null, ref: null };
    const cut = body.lastIndexOf("|");
    if (cut < 0) return { kind, key: body, parentKey: null, ref: null };
    return { kind, key: body.slice(0, cut), parentKey: body.slice(0, cut), ref: body.slice(cut + 1) };
  };
  return prefixed("wall-segment:", "wall-segment", true) || prefixed("pole-sign:", "pole-sign", true) || prefixed("wall-cap:", "wall-cap") || prefixed("item:", "item") || prefixed("wall:", "wall") || prefixed("pole:", "pole") || prefixed("cabinet:", "cabinet") || null;
}
var wallSegmentCount = (wall) => {
  const g = wallPlanGeometry(wall);
  if (!g || g.points.length < 2) return 0;
  return g.closed ? g.points.length : g.points.length - 1;
};
var parentItemId = (ref, rows, kind) => {
  if (!isId(ref) || ref.startsWith("unresolved:")) return null;
  const i = (rows || []).findIndex((r2) => r2?.component_id === ref);
  return i >= 0 ? `${kind}:${layoutItemKey(rows[i], i)}` : null;
};
var parentByIndex = (idx, rows, kind) => {
  const n2 = typeof idx === "string" && /^\d+$/.test(idx) ? parseInt(idx, 10) : idx;
  if (!Number.isInteger(n2) || n2 < 0 || n2 >= (rows || []).length) return null;
  return `${kind}:${layoutItemKey(rows[n2], n2)}`;
};
var refPresent = (v) => v !== void 0 && v !== null;
var parentForPole = (p, cols) => {
  if (refPresent(p?.foundation_component_id)) return parentItemId(p.foundation_component_id, cols.items, "item");
  return parentByIndex(p?.foundation_idx ?? p?.foundation_index, cols.items, "item");
};
var parentForCabinet = (c, cols) => {
  if (c?.mount === "pole") {
    if (refPresent(c?.pole_component_id)) return parentItemId(c.pole_component_id, cols.poles, "pole");
    return parentByIndex(c?.pole_index ?? c?.pole_idx, cols.poles, "pole");
  }
  if (c?.mount === "foundation") {
    if (refPresent(c?.foundation_component_id)) return parentItemId(c.foundation_component_id, cols.items, "item");
    return parentByIndex(c?.foundation_index ?? c?.foundation_idx, cols.items, "item");
  }
  return null;
};
function buildSceneTree(scene) {
  const cols = sceneCollections(scene);
  const nodes = /* @__PURE__ */ new Map();
  const childIds = /* @__PURE__ */ new Map();
  const addChild = (parentId, id) => {
    if (!parentId) return;
    const list = childIds.get(parentId) || [];
    list.push(id);
    childIds.set(parentId, list);
  };
  const define = (node) => {
    if (!node || !isId(node.id) || nodes.has(node.id)) return null;
    nodes.set(node.id, { childIds: [], ...node });
    addChild(node.parentId, node.id);
    return node.id;
  };
  const itemIds = cols.items.map((it, i) => define({
    id: sceneNodeId.item(layoutItemKey(it, i)),
    kind: "item",
    collection: "items",
    index: i,
    key: layoutItemKey(it, i),
    componentId: it?.component_id ?? null,
    label: sceneObjectLabel("items", i),
    parentId: null,
    depth: 0,
    planar: true,
    selectable: true
  }));
  const wallIds = cols.walls.map((w, i) => define({
    id: sceneNodeId.wall(layoutItemKey(w, i)),
    kind: "wall",
    collection: "walls",
    index: i,
    key: layoutItemKey(w, i),
    componentId: w?.component_id ?? null,
    label: sceneObjectLabel("walls", i),
    parentId: null,
    depth: 0,
    planar: true,
    selectable: true
  }));
  const poleIds = cols.poles.map((p, i) => {
    const parent = parentForPole(p, cols);
    return define({
      id: sceneNodeId.pole(layoutItemKey(p, i)),
      kind: "pole",
      collection: "poles",
      index: i,
      key: layoutItemKey(p, i),
      componentId: p?.component_id ?? null,
      label: sceneObjectLabel("poles", i),
      parentId: parent,
      planar: true,
      selectable: true,
      parentComponentId: isId(p?.foundation_component_id) ? p.foundation_component_id : null
    });
  });
  cols.walls.forEach((w, i) => {
    const wallKey = layoutItemKey(w, i);
    const segs = Array.isArray(w?.shape?.segments) ? w.shape.segments : [];
    const count = Math.max(wallSegmentCount(w), segs.length);
    for (let s = 0; s < count; s += 1) {
      const ref = subRef(segs[s]?.component_id, s);
      define({
        id: sceneNodeId.wallSegment(wallKey, ref),
        kind: "wall-segment",
        collection: "walls",
        index: i,
        key: wallKey,
        componentId: segs[s]?.component_id ?? null,
        label: `Segment ${s + 1}`,
        parentId: wallIds[i],
        planar: true,
        selectable: true,
        segmentIndex: s,
        segmentComponentId: segs[s]?.component_id ?? null
      });
    }
  });
  cols.poles.forEach((p, i) => {
    const poleKey = layoutItemKey(p, i);
    const signs = Array.isArray(p?.signs) ? p.signs : [];
    signs.forEach((s, j) => {
      const ref = subRef(s?.component_id, j);
      define({
        id: sceneNodeId.poleSign(poleKey, ref),
        kind: "pole-sign",
        collection: "poles",
        index: i,
        key: poleKey,
        componentId: s?.component_id ?? null,
        label: `Sign ${j + 1}`,
        parentId: poleIds[i],
        planar: false,
        selectable: true,
        signIndex: j
      });
    });
  });
  cols.wall_caps.forEach((c, i) => {
    const key = layoutItemKey(c, i);
    const wallNodeId = refPresent(c?.wall_component_id) ? parentItemId(c.wall_component_id, cols.walls, "wall") : parentByIndex(c?.wall_index, cols.walls, "wall");
    let parentId = null;
    if (wallNodeId) {
      parentId = wallNodeId;
      if (isId(c?.segment_component_id) && !c.segment_component_id.startsWith("unresolved:")) {
        const wi = nodes.get(wallNodeId)?.index;
        const segs = wi !== void 0 ? cols.walls[wi]?.shape?.segments : null;
        const si = Array.isArray(segs) ? segs.findIndex((s) => s?.component_id === c.segment_component_id) : -1;
        if (si >= 0) parentId = sceneNodeId.wallSegment(layoutItemKey(cols.walls[wi], wi), `component:${c.segment_component_id}`);
      }
    }
    define({
      id: sceneNodeId.wallCap(key),
      kind: "wall-cap",
      collection: "wall_caps",
      index: i,
      key,
      componentId: c?.component_id ?? null,
      label: `Cap ${i + 1}`,
      parentId,
      planar: false,
      selectable: true,
      parentComponentId: isId(c?.wall_component_id) ? c.wall_component_id : null
    });
  });
  cols.signage_cabinets.forEach((c, i) => {
    const key = layoutItemKey(c, i);
    const parentId = parentForCabinet(c, cols);
    const parentComponentId = c?.mount === "pole" ? isId(c?.pole_component_id) ? c.pole_component_id : null : c?.mount === "foundation" ? isId(c?.foundation_component_id) ? c.foundation_component_id : null : null;
    define({
      id: sceneNodeId.cabinet(key),
      kind: "cabinet",
      collection: "signage_cabinets",
      index: i,
      key,
      componentId: c?.component_id ?? null,
      label: `Cabinet ${i + 1}`,
      parentId,
      planar: false,
      selectable: true,
      parentComponentId
    });
  });
  const order = [];
  const roots = [];
  const depth = /* @__PURE__ */ new Map();
  const visit = (id, d) => {
    depth.set(id, d);
    const n2 = nodes.get(id);
    if (n2) n2.depth = d;
    order.push(id);
    (childIds.get(id) || []).forEach((c) => visit(c, d + 1));
  };
  for (const id of itemIds) if (id) visit(id, 0);
  for (const id of wallIds) if (id) visit(id, 0);
  for (const id of poleIds) if (id && !nodes.get(id)?.parentId) visit(id, 0);
  for (const id of nodes.keys()) if (!depth.has(id)) visit(id, 0);
  for (const [id, n2] of nodes) if (!n2.parentId) roots.push(id);
  return { nodes, order, roots };
}
function resolveSceneNode(scene, nodeId) {
  const parsed = parseSceneNodeId(nodeId);
  if (!parsed) return null;
  const cols = sceneCollections(scene);
  const findRow = (rows, key) => {
    const i = (rows || []).findIndex((r2, j) => layoutItemKey(r2, j) === key);
    return i >= 0 ? { row: rows[i], index: i } : null;
  };
  switch (parsed.kind) {
    case "item":
    case "pole":
    case "wall":
    case "wall-cap":
    case "cabinet": {
      const found = findRow(cols[COLLECTION_OF_KIND[parsed.kind]], parsed.key);
      if (!found) return null;
      return {
        node: parsed.kind,
        collection: COLLECTION_OF_KIND[parsed.kind],
        index: found.index,
        row: found.row,
        id: nodeId
      };
    }
    case "wall-segment": {
      const found = findRow(cols.walls, parsed.key);
      if (!found) return null;
      const segs = Array.isArray(found.row?.shape?.segments) ? found.row.shape.segments : [];
      let si = -1;
      if (parsed.ref?.startsWith("component:")) {
        si = segs.findIndex((s) => s?.component_id === parsed.ref.slice(10));
      } else if (parsed.ref?.startsWith("index:")) {
        const n2 = parseInt(parsed.ref.slice(6), 10);
        si = Number.isInteger(n2) && n2 >= 0 && n2 < Math.max(wallSegmentCount(found.row), segs.length) ? n2 : -1;
      }
      if (si < 0) return null;
      return {
        node: "wall-segment",
        collection: "walls",
        index: found.index,
        row: found.row,
        wallIndex: found.index,
        segmentIndex: si,
        segment: segs[si] ?? null,
        id: nodeId
      };
    }
    case "pole-sign": {
      const found = findRow(cols.poles, parsed.key);
      if (!found) return null;
      const signs = Array.isArray(found.row?.signs) ? found.row.signs : [];
      let si = -1;
      if (parsed.ref?.startsWith("component:")) {
        si = signs.findIndex((s) => s?.component_id === parsed.ref.slice(10));
      } else if (parsed.ref?.startsWith("index:")) {
        const n2 = parseInt(parsed.ref.slice(6), 10);
        si = Number.isInteger(n2) && n2 >= 0 && n2 < signs.length ? n2 : -1;
      }
      if (si < 0) return null;
      return {
        node: "pole-sign",
        collection: "poles",
        index: found.index,
        row: found.row,
        poleIndex: found.index,
        signIndex: si,
        sign: signs[si] ?? null,
        id: nodeId
      };
    }
    default:
      return null;
  }
}
function nodeBreadcrumb(scene, nodeId) {
  const tree = buildSceneTree(scene);
  const trail = [];
  let cur = tree.nodes.get(nodeId) || null;
  let guard = 0;
  while (cur && guard < 64) {
    trail.unshift({ id: cur.id, kind: cur.kind, label: cur.label, index: cur.index });
    cur = cur.parentId ? tree.nodes.get(cur.parentId) : null;
    guard += 1;
  }
  return trail;
}
function hitPartFromHit(hit) {
  if (!hit || typeof hit !== "object") return { type: "row" };
  switch (hit.kind) {
    case "item-face":
      return { type: "face" };
    case "item-edge":
      return { type: "edge", edge: hit.edge ?? null };
    case "item-vertex":
      return { type: "vertex", corner: hit.corner ?? null };
    case "pole":
      return { type: "point" };
    case "wall-vertex":
      return { type: "vertex", vertexIndex: hit.vertexIndex ?? null };
    case "wall-segment":
      return {
        type: "segment",
        segmentIndex: hit.segmentIndex ?? null,
        segmentComponentId: hit.segmentComponentId ?? null,
        t: fin4(hit.t) ? hit.t : null
      };
    case "wall-face":
      return { type: "face" };
    default:
      return { type: "row" };
  }
}
function nodeTargetForHit(hit) {
  if (!hit || typeof hit !== "object" || !isId(hit.collection)) return null;
  const part = hitPartFromHit(hit);
  if (hit.collection === "items") {
    return { id: sceneNodeId.item(hit.key), kind: "item", part, hit };
  }
  if (hit.collection === "poles") {
    return { id: sceneNodeId.pole(hit.key), kind: "pole", part, hit };
  }
  if (hit.collection === "walls") {
    if (hit.kind === "wall-segment" && fin4(hit.segmentIndex)) {
      const ref = subRef(hit.segmentComponentId, hit.segmentIndex);
      return {
        id: sceneNodeId.wallSegment(hit.key, ref),
        kind: "wall-segment",
        part,
        hit
      };
    }
    return { id: sceneNodeId.wall(hit.key), kind: "wall", part, hit };
  }
  return null;
}
var hitDescriptor = (hit) => ({
  collection: hit?.collection ?? null,
  index: hit?.index ?? null,
  key: hit?.key ?? null,
  componentId: hit?.componentId ?? null,
  label: hit ? hitLabel(hit) : null
});
function beginClickCandidate({ pointerId, clientX, clientY, hit = null, additive = false } = {}) {
  if (!fin4(clientX) || !fin4(clientY)) return null;
  return {
    pointerId: pointerId === void 0 ? null : pointerId,
    clientX,
    clientY,
    hit,
    additive: additive === true
  };
}
function clickTravelPx(candidate, point) {
  if (!candidate || !fin4(candidate.clientX) || !fin4(candidate.clientY)) return null;
  const x = fin4(point?.clientX) ? point.clientX : fin4(point?.x) ? point.x : null;
  const y = fin4(point?.clientY) ? point.clientY : fin4(point?.y) ? point.y : null;
  if (x === null || y === null) return null;
  return hypot2(x - candidate.clientX, y - candidate.clientY);
}
function isClickRelease(candidate, releaseEvent, thresholdPx = SELECTION_CLICK_THRESHOLD_PX) {
  const d = clickTravelPx(candidate, releaseEvent);
  const t = fin4(thresholdPx) && thresholdPx >= 0 ? thresholdPx : SELECTION_CLICK_THRESHOLD_PX;
  return d !== null && d < t;
}
function selectionKeyAction(event) {
  if (!event || typeof event !== "object") return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key;
  if (key === "Tab" || key === "ArrowRight" || key === "ArrowDown") {
    return { action: "cycle", direction: event.shiftKey ? -1 : 1 };
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return { action: "cycle", direction: -1 };
  }
  if (key === "Escape") return { action: "clear" };
  if (key === "Delete" || key === "Backspace") return { action: "delete-request" };
  return null;
}
function regionFromPoints(a, b) {
  const pa = planPointOf(a);
  const pb = planPointOf(b);
  if (!pa || !pb) return null;
  return {
    minX: Math.min(pa.x, pb.x),
    minZ: Math.min(pa.z, pb.z),
    maxX: Math.max(pa.x, pb.x),
    maxZ: Math.max(pa.z, pb.z)
  };
}
var regionIsUsable = (r2) => !!r2 && fin4(r2.minX) && fin4(r2.minZ) && fin4(r2.maxX) && fin4(r2.maxZ) && r2.minX <= r2.maxX && r2.minZ <= r2.maxZ;
var pointInRegion = (r2, p) => p.x >= r2.minX && p.x <= r2.maxX && p.z >= r2.minZ && p.z <= r2.maxZ;
var regionCorners = (r2) => [
  { x: r2.minX, z: r2.minZ },
  { x: r2.maxX, z: r2.minZ },
  { x: r2.maxX, z: r2.maxZ },
  { x: r2.minX, z: r2.maxZ }
];
var segSegIntersect = (a, b, c, d) => {
  const cross = (o, p, q) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if ((d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0)) return true;
  const on = (p, q, r0) => Math.min(p.x, q.x) <= r0.x && r0.x <= Math.max(p.x, q.x) && Math.min(p.z, q.z) <= r0.z && r0.z <= Math.max(p.z, q.z) && Math.abs(cross(p, q, r0)) <= 1e-9;
  if (d1 === 0 && on(c, d, a)) return true;
  if (d2 === 0 && on(c, d, b)) return true;
  if (d3 === 0 && on(a, b, c)) return true;
  if (d4 === 0 && on(a, b, d)) return true;
  return false;
};
var segmentIntersectsRegion = (a, b, r2) => {
  if (pointInRegion(r2, a) || pointInRegion(r2, b)) return true;
  const c = regionCorners(r2);
  for (let i = 0; i < 4; i += 1) {
    if (segSegIntersect(a, b, c[i], c[(i + 1) % 4])) return true;
  }
  return false;
};
var rectsIntersect = (cornersA, cornersB) => {
  const axes = [];
  for (const corners of [cornersA, cornersB]) {
    for (let i = 0; i < 2; i += 1) {
      const e = { x: corners[(i + 1) % 4].x - corners[i].x, z: corners[(i + 1) % 4].z - corners[i].z };
      const len = hypot2(e.x, e.z) || 1;
      axes.push({ x: -e.z / len, z: e.x / len });
    }
  }
  for (const axis of axes) {
    const proj = (c) => c.x * axis.x + c.z * axis.z;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const c of cornersA) {
      const p = proj(c);
      if (p < aMin) aMin = p;
      if (p > aMax) aMax = p;
    }
    for (const c of cornersB) {
      const p = proj(c);
      if (p < bMin) bMin = p;
      if (p > bMax) bMax = p;
    }
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
};
var circleIntersectsRegion = (center, radius, r2) => {
  const cx = Math.min(Math.max(center.x, r2.minX), r2.maxX);
  const cz = Math.min(Math.max(center.z, r2.minZ), r2.maxZ);
  return hypot2(center.x - cx, center.z - cz) <= radius;
};
var pointInPolygon2 = (p, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};
var itemInRegion = (item, r2, mode) => {
  const g = itemPlanGeometry(item);
  if (!g) return false;
  if (g.circular) {
    const radius = Math.min(g.size.width, g.size.depth) / 2;
    if (mode === "contain") {
      return g.center.x - radius >= r2.minX && g.center.x + radius <= r2.maxX && g.center.z - radius >= r2.minZ && g.center.z + radius <= r2.maxZ;
    }
    return circleIntersectsRegion(g.center, radius, r2);
  }
  const corners = framePlanCorners(g.frame, g.size);
  if (!corners) return false;
  const list = [corners.nw, corners.ne, corners.se, corners.sw];
  if (mode === "contain") return list.every((c) => pointInRegion(r2, c));
  return rectsIntersect(list, regionCorners(r2));
};
var wallInRegion = (wall, r2, mode) => {
  const g = wallPlanGeometry(wall);
  if (!g || !g.points.length) return false;
  if (mode === "contain") {
    return g.points.every((p) => pointInRegion(r2, p));
  }
  if (g.points.some((p) => pointInRegion(r2, p))) return true;
  const segCount = g.closed ? g.points.length : g.points.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    if (segmentIntersectsRegion(g.points[i], g.points[(i + 1) % g.points.length], r2)) return true;
  }
  if (g.closed && pointInPolygon2(regionCorners(r2)[0], g.points)) return true;
  return false;
};
function sceneObjectsInRegion(scene, region, { mode = "intersect" } = {}) {
  if (!regionIsUsable(region)) return [];
  const m = REGION_SELECT_MODES.includes(mode) ? mode : "intersect";
  const cols = sceneCollections(scene);
  const picked = /* @__PURE__ */ new Set();
  cols.items.forEach((it, i) => {
    if (itemInRegion(it, region, m)) picked.add(sceneNodeId.item(layoutItemKey(it, i)));
  });
  cols.walls.forEach((w, i) => {
    if (wallInRegion(w, region, m)) picked.add(sceneNodeId.wall(layoutItemKey(w, i)));
  });
  cols.poles.forEach((p, i) => {
    const q = planPointOf({ x: p?.x_inches, z: p?.z_inches });
    if (q && pointInRegion(region, q)) picked.add(sceneNodeId.pole(layoutItemKey(p, i)));
  });
  const tree = buildSceneTree(scene);
  return tree.order.filter((id) => picked.has(id));
}
function createSceneSelection() {
  let ids = [];
  let primaryId = null;
  let parts = {};
  let descriptors = {};
  let marquee = null;
  let version = 0;
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    version += 1;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
      }
    }
  };
  const has2 = (id) => ids.includes(id);
  const descriptorFor = (target, extra = {}) => ({
    id: target.id,
    kind: target.kind ?? parseSceneNodeId(target.id)?.kind ?? null,
    collection: extra.collection ?? null,
    index: extra.index ?? null,
    key: extra.key ?? null,
    componentId: extra.componentId ?? null,
    label: extra.label ?? null,
    parentId: extra.parentId ?? null,
    segmentIndex: extra.segmentIndex ?? null,
    signIndex: extra.signIndex ?? null
  });
  const describe = (id, target, extra) => {
    const t = typeof target === "string" ? { id: target } : target;
    if (!t) return;
    descriptors = { ...descriptors, [id]: descriptorFor(t, extra) };
  };
  const setState = (nextIds, nextPrimary, nextParts, nextDescriptors) => {
    ids = nextIds;
    primaryId = nextPrimary;
    parts = nextParts;
    descriptors = nextDescriptors;
    emit();
  };
  const setSelection = (entries2, { primary } = {}) => {
    const list = Array.isArray(entries2) ? entries2 : [];
    const seen = /* @__PURE__ */ new Set();
    const nextIds = [];
    const nextParts = {};
    const nextDescriptors = {};
    for (const entry of list) {
      const id = typeof entry === "string" ? entry : entry?.id;
      if (!isId(id) || seen.has(id)) continue;
      seen.add(id);
      nextIds.push(id);
      nextParts[id] = typeof entry === "object" && entry?.part ? entry.part : { type: "row" };
      nextDescriptors[id] = typeof entry === "object" && entry?.descriptor ? entry.descriptor : { id, kind: parseSceneNodeId(id)?.kind ?? null, collection: null, index: null, key: null, componentId: null, label: null, parentId: null, segmentIndex: null, signIndex: null };
    }
    const nextPrimary = isId(primary) && seen.has(primary) ? primary : nextIds[nextIds.length - 1] ?? null;
    setState(nextIds, nextPrimary, nextParts, nextDescriptors);
    return { status: "set", ids: [...nextIds], primaryId: nextPrimary };
  };
  const select = (target, { additive = false } = {}) => {
    const id = typeof target === "string" ? target : target?.id;
    if (!isId(id)) {
      if (!additive) {
        if (!ids.length && primaryId === null) return { status: "empty" };
        setState([], null, {}, {});
        return { status: "cleared" };
      }
      return { status: "kept", ids: [...ids] };
    }
    if (!additive) {
      const part2 = typeof target === "object" && target?.part ? target.part : { type: "row" };
      describe(id, target, target?.descriptor);
      setState([id], id, { [id]: part2 }, descriptors);
      return { status: "selected", id, primaryId: id };
    }
    if (has2(id)) {
      const nextIds = ids.filter((x) => x !== id);
      const nextParts = { ...parts };
      delete nextParts[id];
      const nextDescriptors = { ...descriptors };
      delete nextDescriptors[id];
      const nextPrimary = primaryId === id ? nextIds[nextIds.length - 1] ?? null : primaryId;
      setState(nextIds, nextPrimary, nextParts, nextDescriptors);
      return { status: "toggled-off", id, primaryId: nextPrimary };
    }
    const part = typeof target === "object" && target?.part ? target.part : { type: "row" };
    describe(id, target, target?.descriptor);
    setState([...ids, id], id, { ...parts, [id]: part }, descriptors);
    return { status: "selected", id, primaryId: id };
  };
  const selectHit = (hit, { additive = false } = {}) => {
    const target = nodeTargetForHit(hit);
    return select(target ? { ...target, descriptor: hitDescriptor(hit) } : null, { additive });
  };
  const pickAtPoint = (scene, point, opts = {}) => {
    const hits = hitTestPlanAll(scene, point, opts);
    const hit = hits.length ? hits[0] : null;
    return { hit, target: nodeTargetForHit(hit), hits };
  };
  const selectAtPoint = (scene, point, { additive = false, ...opts } = {}) => selectHit(pickAtPoint(scene, point, opts).hit, { additive });
  const clear = () => {
    if (!ids.length && primaryId === null) return { status: "empty" };
    setState([], null, {}, {});
    return { status: "cleared" };
  };
  const isSelected = (id) => has2(id);
  const entries = () => ids.map((id) => ({
    ...descriptors[id] || { id, kind: parseSceneNodeId(id)?.kind ?? null },
    id,
    part: parts[id] || { type: "row" },
    primary: id === primaryId
  }));
  const cycle = (scene, direction = 1) => {
    const tree = buildSceneTree(scene);
    const order = tree.order.filter((id) => tree.nodes.get(id)?.selectable !== false);
    if (!order.length) return { status: "empty", id: null };
    const dir = direction < 0 ? -1 : 1;
    let next;
    if (!primaryId || !order.includes(primaryId)) {
      next = dir > 0 ? order[0] : order[order.length - 1];
    } else {
      const i = order.indexOf(primaryId);
      next = order[(i + dir + order.length) % order.length];
    }
    const n2 = tree.nodes.get(next);
    describe(next, { id: next, kind: n2?.kind }, n2 ? {
      collection: n2.collection,
      index: n2.index,
      key: n2.key,
      componentId: n2.componentId,
      label: n2.label,
      parentId: n2.parentId,
      segmentIndex: n2.segmentIndex ?? null,
      signIndex: n2.signIndex ?? null
    } : void 0);
    setState([next], next, { [next]: { type: "row" } }, descriptors);
    return { status: "cycled", id: next, label: n2?.label ?? null };
  };
  const applyKey = (event, scene) => {
    const act = selectionKeyAction(event);
    if (!act) return null;
    if (act.action === "cycle") return cycle(scene, act.direction);
    if (act.action === "clear") {
      clear();
      return { status: "cleared" };
    }
    if (act.action === "delete-request") {
      return { status: "delete-request", entries: entries() };
    }
    return null;
  };
  const reconcile = (scene) => {
    const tree = buildSceneTree(scene);
    const nextIds = [];
    const nextParts = {};
    const nextDescriptors = {};
    const dropped = [];
    const remapped = {};
    const downgraded = [];
    const seen = /* @__PURE__ */ new Set();
    const adopt = (oldId, newId, node, part) => {
      if (seen.has(newId)) {
        dropped.push(oldId);
        return;
      }
      seen.add(newId);
      nextIds.push(newId);
      nextParts[newId] = part;
      nextDescriptors[newId] = {
        id: newId,
        kind: node?.kind ?? null,
        collection: node?.collection ?? null,
        index: node?.index ?? null,
        key: node?.key ?? null,
        componentId: node?.componentId ?? null,
        label: node?.label ?? null,
        parentId: node?.parentId ?? null,
        segmentIndex: node?.segmentIndex ?? null,
        signIndex: node?.signIndex ?? null
      };
      if (newId !== oldId) remapped[oldId] = newId;
    };
    const sanitizePart = (id, node, part) => {
      if (!part || part.type === "row") return { type: "row" };
      if (part.type === "vertex" && Number.isInteger(part.vertexIndex)) {
        const w = node?.collection === "walls" ? sceneCollections(scene).walls[node.index] : null;
        const authored = Array.isArray(w?.shape?.points) ? w.shape.points.length : 0;
        if (part.vertexIndex >= 0 && part.vertexIndex < authored) return part;
        downgraded.push(id);
        return { type: "row" };
      }
      if (part.type === "segment") {
        if (node?.kind === "wall-segment" && node.segmentIndex === part.segmentIndex) return part;
        downgraded.push(id);
        return { type: "row" };
      }
      return part;
    };
    for (const oldId of ids) {
      if (tree.nodes.has(oldId)) {
        const node = tree.nodes.get(oldId);
        adopt(oldId, oldId, node, sanitizePart(oldId, node, parts[oldId]));
        continue;
      }
      const parsed = parseSceneNodeId(oldId);
      if (parsed && (parsed.kind === "wall-segment" || parsed.kind === "pole-sign") && parsed.ref?.startsWith("index:")) {
        const res = resolveSceneNode(scene, oldId);
        if (res) {
          const parentKey = parsed.key;
          const sub = parsed.kind === "wall-segment" ? res.segment?.component_id : res.sign?.component_id;
          const newId = parsed.kind === "wall-segment" ? sceneNodeId.wallSegment(parentKey, subRef(sub ?? res.segment?.component_id, res.segmentIndex)) : sceneNodeId.poleSign(parentKey, subRef(sub ?? res.sign?.component_id, res.signIndex));
          if (tree.nodes.has(newId)) {
            adopt(oldId, newId, tree.nodes.get(newId), sanitizePart(newId, tree.nodes.get(newId), parts[oldId]));
            continue;
          }
        }
      }
      dropped.push(oldId);
    }
    const nextPrimary = primaryId && seen.has(primaryId) ? primaryId : primaryId && remapped[primaryId] && seen.has(remapped[primaryId]) ? remapped[primaryId] : nextIds[nextIds.length - 1] ?? null;
    const descChanged = nextIds.some((id) => JSON.stringify(nextDescriptors[id]) !== JSON.stringify(descriptors[id])) || Object.keys(nextDescriptors).length !== Object.keys(descriptors).length;
    const changed = dropped.length > 0 || Object.keys(remapped).length > 0 || nextIds.length !== ids.length || nextIds.some((id, i) => id !== ids[i]) || nextPrimary !== primaryId || downgraded.length > 0 || descChanged;
    if (changed) {
      setState(nextIds, nextPrimary, nextParts, nextDescriptors);
      return { status: "reconciled", kept: [...nextIds], dropped, remapped, downgraded };
    }
    return { status: "unchanged", kept: [...nextIds], dropped: [], remapped: {}, downgraded: [] };
  };
  const beginMarquee = ({ point, additive = false } = {}) => {
    const p = planPointOf(point);
    if (!p) return { status: "invalid" };
    marquee = { start: p, current: p, additive: additive === true };
    emit();
    return { status: "open" };
  };
  const updateMarquee = (point) => {
    if (!marquee) return { status: "no-marquee" };
    const p = planPointOf(point);
    if (!p) return { status: "invalid" };
    marquee = { ...marquee, current: p };
    emit();
    return { status: "updated" };
  };
  const commitMarquee = (scene, { mode = "intersect", empty = false } = {}) => {
    if (!marquee) return { status: "no-marquee" };
    const m = marquee;
    marquee = null;
    if (empty) {
      emit();
      if (!m.additive) {
        clear();
        return { status: "cleared" };
      }
      return { status: "kept" };
    }
    const region = regionFromPoints(m.start, m.current);
    const picked = sceneObjectsInRegion(scene, region, { mode });
    if (m.additive) {
      const nextIds = [...ids];
      const nextParts2 = { ...parts };
      const nextDescriptors2 = { ...descriptors };
      const tree2 = buildSceneTree(scene);
      for (const id of picked) {
        if (nextIds.includes(id)) continue;
        nextIds.push(id);
        nextParts2[id] = { type: "row" };
        const n2 = tree2.nodes.get(id);
        nextDescriptors2[id] = descriptorFor(
          { id, kind: n2?.kind },
          { collection: n2?.collection, index: n2?.index, key: n2?.key, componentId: n2?.componentId, label: n2?.label, parentId: n2?.parentId }
        );
      }
      const nextPrimary = picked.length ? picked[picked.length - 1] : primaryId;
      setState(nextIds, nextPrimary, nextParts2, nextDescriptors2);
      return { status: "marquee", ids: [...nextIds], picked, additive: true };
    }
    const tree = buildSceneTree(scene);
    const nextDescriptors = {};
    for (const id of picked) {
      const n2 = tree.nodes.get(id);
      nextDescriptors[id] = descriptorFor(
        { id, kind: n2?.kind },
        { collection: n2?.collection, index: n2?.index, key: n2?.key, componentId: n2?.componentId, label: n2?.label, parentId: n2?.parentId }
      );
    }
    const nextParts = {};
    for (const id of picked) nextParts[id] = { type: "row" };
    setState(picked, picked[picked.length - 1] ?? null, nextParts, nextDescriptors);
    return { status: "marquee", ids: [...picked], picked, additive: false };
  };
  const cancelMarquee = () => {
    if (!marquee) return { status: "no-marquee" };
    marquee = null;
    emit();
    return { status: "cancelled" };
  };
  const getState = () => ({
    stateVersion: version,
    ids: [...ids],
    count: ids.length,
    primaryId,
    primary: primaryId ? { ...descriptors[primaryId] || { id: primaryId }, id: primaryId, part: parts[primaryId] || { type: "row" } } : null,
    marquee: marquee ? { ...marquee, start: { ...marquee.start }, current: { ...marquee.current } } : null
  });
  const subscribe = (fn) => {
    if (typeof fn !== "function") return () => {
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  return {
    // queries
    isSelected,
    entries,
    getState,
    subscribe,
    // mutation
    select,
    setSelection,
    selectHit,
    selectAtPoint,
    clear,
    cycle,
    applyKey,
    // scene-facing
    pickAtPoint,
    reconcile,
    // marquee
    beginMarquee,
    updateMarquee,
    commitMarquee,
    cancelMarquee,
    get stateVersion() {
      return version;
    },
    get primaryId() {
      return primaryId;
    }
  };
}

// src/components/estimator/foundation/foundationSceneEditOps.js
var fin5 = (v) => typeof v === "number" && Number.isFinite(v);
var isId2 = (v) => typeof v === "string" && v.length > 0;
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var hypot3 = Math.hypot;
var normDeg = (v) => (v % 360 + 360) % 360;
var SCENE_OP_KINDS = Object.freeze({
  move: SCENE_EDIT_ITEM_MOVE,
  resize: "item-resize",
  rotate: "item-rotate",
  geometry: "item-geometry",
  multi: "scene-multi"
});
var ITEM_RESIZE_HANDLES = Object.freeze([
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w"
]);
var ALIGN_EDGES = Object.freeze([
  "left",
  "centerX",
  "right",
  "top",
  "centerZ",
  "bottom"
]);
var DISTRIBUTE_AXES = Object.freeze(["x", "z"]);
var MIN_ITEM_SIZE_INCHES = 1;
var ROTATE_SNAP_DEGREES = 15;
var ROTATE_KEY_STEP_DEGREES = 15;
var ROTATE_KEY_BIG_STEP_DEGREES = 45;
var DEFAULT_SNAP_TOLERANCE_INCHES = 3;
var DEFAULT_DUPLICATE_OFFSET_INCHES = Object.freeze({ x: 12, z: 12 });
var WHOLE_ROW_KINDS = Object.freeze(["item", "pole", "wall", "wall-cap", "cabinet"]);
var PLANAR_KINDS = Object.freeze(["item", "pole", "wall"]);
var COLLECTION_OF_KIND2 = Object.freeze({
  item: "items",
  pole: "poles",
  wall: "walls",
  "wall-cap": "wall_caps",
  cabinet: "signage_cabinets"
});
var defaultIsLocked = (row) => row?.locked === true || row?.locked === 1;
var sceneCols = (scene) => {
  const s = isRecord(scene) ? scene : {};
  return {
    items: Array.isArray(s.items) ? s.items : [],
    walls: Array.isArray(s.walls) ? s.walls : [],
    poles: Array.isArray(s.poles) ? s.poles : [],
    wall_caps: Array.isArray(s.wall_caps) ? s.wall_caps : Array.isArray(s.wallCaps) ? s.wallCaps : [],
    signage_cabinets: Array.isArray(s.signage_cabinets) ? s.signage_cabinets : Array.isArray(s.signageCabinets) ? s.signageCabinets : []
  };
};
var idOf = (entry) => typeof entry === "string" ? entry : entry?.id;
function planBoundsOfItem(item) {
  const g = itemPlanGeometry(item);
  if (!g) return null;
  if (g.circular) {
    const r2 = Math.min(g.size.width, g.size.depth) / 2;
    return {
      minX: g.center.x - r2,
      maxX: g.center.x + r2,
      minZ: g.center.z - r2,
      maxZ: g.center.z + r2,
      cx: g.center.x,
      cz: g.center.z,
      width: 2 * r2,
      depth: 2 * r2
    };
  }
  const corners = framePlanCorners(g.frame, g.size);
  if (!corners) return null;
  const xs = [corners.nw.x, corners.ne.x, corners.se.x, corners.sw.x];
  const zs = [corners.nw.z, corners.ne.z, corners.se.z, corners.sw.z];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    cx: g.center.x,
    cz: g.center.z,
    width: maxX - minX,
    depth: maxZ - minZ
  };
}
function planBoundsOfPole(pole) {
  const q = planPointOf({ x: pole?.x_inches, z: pole?.z_inches });
  if (!q) return null;
  return { minX: q.x, maxX: q.x, minZ: q.z, maxZ: q.z, cx: q.x, cz: q.z, width: 0, depth: 0 };
}
function planBoundsOfWall(wall) {
  const g = wallPlanGeometry(wall);
  if (!g || !g.points.length) return null;
  const xs = g.points.map((p) => p.x);
  const zs = g.points.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ
  };
}
var boundsOf = (kind, row) => kind === "item" ? planBoundsOfItem(row) : kind === "pole" ? planBoundsOfPole(row) : kind === "wall" ? planBoundsOfWall(row) : null;
function resolveOpTargets(scene, ids, { isLocked = defaultIsLocked } = {}) {
  const list = Array.isArray(ids) ? ids : [];
  const targets = [];
  const skipped = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of list) {
    const id = idOf(entry);
    if (!isId2(id) || seen.has(id)) continue;
    seen.add(id);
    const parsed = parseSceneNodeId(id);
    const kind = parsed?.kind ?? null;
    if (!kind || !PLANAR_KINDS.includes(kind)) {
      skipped.push({ id, reason: kind ? "non-planar" : "unparseable" });
      continue;
    }
    const res = resolveSceneNode(scene, id);
    if (!res || !isRecord(res.row)) {
      skipped.push({ id, reason: "unresolved" });
      continue;
    }
    if (typeof isLocked === "function" && isLocked(res.row)) {
      skipped.push({ id, reason: "locked" });
      continue;
    }
    const bounds = boundsOf(kind, res.row);
    if (!bounds) {
      skipped.push({ id, reason: "no-geometry" });
      continue;
    }
    targets.push({
      id,
      kind,
      collection: COLLECTION_OF_KIND2[kind],
      index: res.index,
      key: parsed.key,
      row: res.row,
      bounds
    });
  }
  return { targets, skipped };
}
function targetsBounds(targets) {
  const list = Array.isArray(targets) ? targets : [];
  if (!list.length) return null;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const t of list) {
    const b = t?.bounds;
    if (!b) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minZ < minZ) minZ = b.minZ;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxZ > maxZ) maxZ = b.maxZ;
  }
  if (!fin5(minX)) return null;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ
  };
}
var beforeFieldsOf = (row, patch) => {
  const before = {};
  if (!isRecord(row) || !isRecord(patch)) return before;
  for (const k of Object.keys(patch)) before[k] = row[k];
  return before;
};
var pickNum = (v) => {
  if (fin5(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n2 = Number(v);
    return fin5(n2) ? n2 : null;
  }
  return null;
};
var maybeRound = (v, round) => round ? Math.round(v) : v;
function translateTargetPatch(target, dx, dz, { round = false } = {}) {
  if (!target || !fin5(dx) || !fin5(dz)) return null;
  const { kind, row } = target;
  if (kind === "item") {
    const pos = layoutPositionInches(row);
    if (!pos.valid) return null;
    const patch = {
      x_inches: maybeRound(pos.x_inches + dx, round),
      z_inches: maybeRound(pos.z_inches + dz, round)
    };
    if (!fin5(patch.x_inches) || !fin5(patch.z_inches)) return null;
    return { collection: "items", index: target.index, key: target.key, before: beforeFieldsOf(row, patch), patch };
  }
  if (kind === "pole") {
    const q = planPointOf({ x: row?.x_inches, z: row?.z_inches });
    if (!q) return null;
    const patch = {
      x_inches: maybeRound(q.x + dx, round),
      z_inches: maybeRound(q.z + dz, round)
    };
    if (!fin5(patch.x_inches) || !fin5(patch.z_inches)) return null;
    return { collection: "poles", index: target.index, key: target.key, before: beforeFieldsOf(row, patch), patch };
  }
  if (kind === "wall") {
    const shape = isRecord(row?.shape) ? row.shape : {};
    const pts = Array.isArray(shape.points) ? shape.points : null;
    if (!pts || !pts.length) return null;
    const next = pts.map((p) => {
      const q = planPointOf(p);
      if (!q) return p;
      return { ...p, x: maybeRound(q.x + dx, round), z: maybeRound(q.z + dz, round) };
    });
    const patch = { shape: { ...shape, points: next } };
    return { collection: "walls", index: target.index, key: target.key, before: beforeFieldsOf(row, patch), patch };
  }
  return null;
}
function sceneWithOpPatches(scene, patchRows, { side = "patch" } = {}) {
  const cols = sceneCols(scene);
  const list = Array.isArray(patchRows) ? patchRows : [];
  const field = side === "before" ? "before" : "patch";
  const apply = (rows, collection) => (Array.isArray(rows) ? rows : []).map((row, i) => {
    let out = row;
    for (const p of list) {
      if (p.collection === collection && p.index === i && isRecord(p[field])) {
        out = { ...out, ...p[field] };
      }
    }
    return out;
  });
  return {
    ...cols,
    items: apply(cols.items, "items"),
    poles: apply(cols.poles, "poles"),
    walls: apply(cols.walls, "walls")
  };
}
var patchesFitSingleItemChannel = (patches) => Array.isArray(patches) && patches.length === 1 && patches[0]?.collection === "items";
function snapCandidatesOutside(scene, movingIds, opts = {}) {
  const moving = /* @__PURE__ */ new Set();
  const cols = sceneCols(scene);
  for (const entry of Array.isArray(movingIds) ? movingIds : []) {
    const id = idOf(entry);
    const parsed = isId2(id) ? parseSceneNodeId(id) : null;
    if (parsed?.key) moving.add(parsed.key);
  }
  const keep = (rows) => Array.isArray(rows) ? rows.filter((r2, i) => !moving.has(layoutItemKey(r2, i))) : [];
  return snapCandidatesForScene(
    { items: keep(cols.items), poles: keep(cols.poles), walls: keep(cols.walls) },
    opts
  );
}
var pickGuide = (probes, candidates, tolInches) => {
  let best = null;
  for (const c of candidates || []) {
    if (!fin5(c?.value)) continue;
    for (const probe of probes) {
      const adj = c.value - probe;
      if (Math.abs(adj) > tolInches) continue;
      if (!best || Math.abs(adj) < Math.abs(best.adj)) {
        best = { adj, value: c.value, source: c.source ?? null };
      }
    }
  }
  return best;
};
function snapBoundsDelta(bounds, candidates, { tolInches = DEFAULT_SNAP_TOLERANCE_INCHES, gridStepInches = 0 } = {}) {
  if (!bounds || !fin5(bounds.minX) || !fin5(bounds.minZ)) return null;
  const tol = fin5(tolInches) && tolInches >= 0 ? tolInches : DEFAULT_SNAP_TOLERANCE_INCHES;
  const probesX = [bounds.minX, bounds.cx, bounds.maxX];
  const probesZ = [bounds.minZ, bounds.cz, bounds.maxZ];
  const gx = pickGuide(probesX, candidates?.x, tol);
  const gz = pickGuide(probesZ, candidates?.z, tol);
  const step = fin5(gridStepInches) && gridStepInches > 0 ? gridStepInches : 0;
  let dx = null, dz = null;
  const guides = [];
  if (gx) {
    dx = gx.adj;
    guides.push({ axis: "x", value: gx.value, source: gx.source });
  } else if (step) {
    dx = Math.round(bounds.minX / step) * step - bounds.minX;
    guides.push({ axis: "x", value: bounds.minX + dx, source: { kind: "grid" } });
  }
  if (gz) {
    dz = gz.adj;
    guides.push({ axis: "z", value: gz.value, source: gz.source });
  } else if (step) {
    dz = Math.round(bounds.minZ / step) * step - bounds.minZ;
    guides.push({ axis: "z", value: bounds.minZ + dz, source: { kind: "grid" } });
  }
  if (dx === null && dz === null) return null;
  return { dx: dx ?? 0, dz: dz ?? 0, guides };
}
function snapDraggedItem(item, proposedCorner, candidates, opts = {}) {
  const g = itemPlanGeometry(item);
  const c = planPointOf(proposedCorner);
  if (!g || !c) return null;
  const bounds = {
    minX: c.x,
    maxX: c.x + g.size.width,
    cx: c.x + g.size.width / 2,
    minZ: c.z,
    maxZ: c.z + g.size.depth,
    cz: c.z + g.size.depth / 2
  };
  return snapBoundsDelta(bounds, candidates, opts);
}
function moveSelectionPatch(scene, ids, delta, opts = {}) {
  const op = "move";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  const dx = fin5(delta?.dx) ? delta.dx : fin5(delta?.x) ? delta.x : null;
  const dz = fin5(delta?.dz) ? delta.dz : fin5(delta?.z) ? delta.z : null;
  if (dx === null || dz === null) return { status: "rejected", op, reason: "invalid-delta" };
  const { targets, skipped } = resolveOpTargets(scene, ids, opts);
  if (!targets.length) {
    return { status: "rejected", op, reason: "empty-selection", skipped };
  }
  let ddx = dx, ddz = dz, guides = [];
  const snap = isRecord(opts.snap) ? opts.snap : null;
  const bounds = targetsBounds(targets);
  if (bounds && (snap || fin5(opts.gridStepInches) && opts.gridStepInches > 0)) {
    const moved = { ...bounds, minX: bounds.minX + dx, maxX: bounds.maxX + dx, cx: bounds.cx + dx, minZ: bounds.minZ + dz, maxZ: bounds.maxZ + dz, cz: bounds.cz + dz };
    const adj = snapBoundsDelta(moved, snap?.candidates, {
      tolInches: snap?.tolInches,
      gridStepInches: opts.gridStepInches
    });
    if (adj) {
      ddx += adj.dx;
      ddz += adj.dz;
      guides = adj.guides;
    }
  }
  const patches = targets.map((t) => translateTargetPatch(t, ddx, ddz, { round: opts.round === true })).filter(Boolean).filter((p) => JSON.stringify(p.before) !== JSON.stringify(p.patch));
  if (!patches.length) return { status: "noop", op, skipped };
  return { status: "ok", op, delta: { dx: ddx, dz: ddz }, patches, skipped, guides };
}
function beginItemResize(item, handle, grabPoint) {
  if (!ITEM_RESIZE_HANDLES.includes(handle)) return null;
  const g = itemPlanGeometry(item);
  const grab = planPointOf(grabPoint);
  if (!g || !grab) return null;
  const local = planToFrameLocal(g.frame, grab);
  if (!local) return null;
  const hw = g.size.width / 2;
  const hd = g.size.depth / 2;
  let anchorLocal = null;
  if (handle.includes("w")) anchorLocal = { ...anchorLocal || {}, lx: hw };
  if (handle.includes("e")) anchorLocal = { ...anchorLocal || {}, lx: -hw };
  if (handle.includes("n")) anchorLocal = { ...anchorLocal || {}, lz: hd };
  if (handle.includes("s")) anchorLocal = { ...anchorLocal || {}, lz: -hd };
  return {
    handle,
    frame: g.frame,
    center: g.center,
    size: { width: g.size.width, depth: g.size.depth },
    circular: g.circular === true,
    anchorLocal,
    grabLocal: local,
    corner: { ...g.corner }
  };
}
function resizeItemFromHandle(session, planPoint, opts = {}) {
  if (!session || !session.frame) return null;
  let p = planPointOf(planPoint);
  if (!p) return null;
  let guides = [];
  const snap = isRecord(opts.snap) ? opts.snap : null;
  if (snap?.candidates) {
    const s = snapToCandidates(p, snap.candidates, fin5(snap.tolInches) ? snap.tolInches : DEFAULT_SNAP_TOLERANCE_INCHES);
    if (s) {
      p = { x: s.x, z: s.z };
      guides = s.guides || [];
    }
  }
  const local = planToFrameLocal(session.frame, p);
  if (!local) return null;
  const min = fin5(opts.minInches) && opts.minInches > 0 ? opts.minInches : MIN_ITEM_SIZE_INCHES;
  const round = opts.round === true;
  const h2 = session.handle;
  if (session.circular) {
    let d = 2 * Math.max(Math.abs(local.lx), Math.abs(local.lz));
    if (!fin5(d)) return null;
    d = Math.max(min, d);
    if (round) d = Math.round(d);
    if (!fin5(d) || d <= 0) return null;
    const corner = { x: session.center.x - d / 2, z: session.center.z - d / 2 };
    const patch2 = { x_inches: maybeRound(corner.x, round), z_inches: maybeRound(corner.z, round), diameter: d };
    return fin5(patch2.x_inches) && fin5(patch2.z_inches) ? { patch: patch2, guides } : null;
  }
  const a = session.anchorLocal || {};
  const sx = h2.includes("w") ? -1 : 1;
  const sz = h2.includes("n") ? -1 : 1;
  let newW = session.size.width;
  let newD = session.size.depth;
  let cxLocal = 0;
  let czLocal = 0;
  if (fin5(a.lx)) {
    newW = Math.abs(local.lx - a.lx);
    if (!fin5(newW)) return null;
    if (newW < min) newW = min;
    const side = local.lx === a.lx ? sx : Math.sign(local.lx - a.lx);
    cxLocal = a.lx + side * (newW / 2);
  }
  if (fin5(a.lz)) {
    newD = Math.abs(local.lz - a.lz);
    if (!fin5(newD)) return null;
    if (newD < min) newD = min;
    const side = local.lz === a.lz ? sz : Math.sign(local.lz - a.lz);
    czLocal = a.lz + side * (newD / 2);
  }
  const centerPlan = frameLocalToPlan(session.frame, { lx: cxLocal, lz: czLocal });
  if (!centerPlan) return null;
  let patch = {
    x_inches: centerPlan.x - newW / 2,
    z_inches: centerPlan.z - newD / 2,
    length_inches: newW,
    width_inches: newD
  };
  if (round) patch = { x_inches: Math.round(patch.x_inches), z_inches: Math.round(patch.z_inches), length_inches: Math.round(patch.length_inches), width_inches: Math.round(patch.width_inches) };
  if (!fin5(patch.x_inches) || !fin5(patch.z_inches) || !fin5(patch.length_inches) || !fin5(patch.width_inches)) return null;
  if (patch.length_inches <= 0 || patch.width_inches <= 0) return null;
  return { patch, guides };
}
function beginItemRotate(item, grabPoint) {
  const g = itemPlanGeometry(item);
  const grab = planPointOf(grabPoint);
  if (!g || !grab) return null;
  const dx = grab.x - g.center.x;
  const dz = grab.z - g.center.z;
  if (hypot3(dx, dz) < 1e-6) return null;
  const start = fin5(item?.rotation_degrees) ? item.rotation_degrees : 0;
  return {
    center: { x: g.center.x, z: g.center.z },
    offsetDeg: Math.atan2(dz, dx) * 180 / Math.PI - start,
    startDeg: start
  };
}
function rotateItemFromPointer(session, planPoint, opts = {}) {
  if (!session || !fin5(session.center?.x) || !fin5(session.center?.z)) return null;
  const p = planPointOf(planPoint);
  if (!p) return null;
  const dx = p.x - session.center.x;
  const dz = p.z - session.center.z;
  if (hypot3(dx, dz) < 1e-6) return null;
  let deg = normDeg(Math.atan2(dz, dx) * 180 / Math.PI - session.offsetDeg);
  const step = fin5(opts.snapDegrees) ? opts.snapDegrees : ROTATE_SNAP_DEGREES;
  if (opts.free !== true && step > 0) deg = normDeg(Math.round(deg / step) * step);
  return { patch: { rotation_degrees: deg } };
}
function rotateItemBy(item, deltaDegrees, opts = {}) {
  const d = pickNum(deltaDegrees);
  if (d === null) return null;
  const cur = fin5(item?.rotation_degrees) ? item.rotation_degrees : 0;
  let deg = normDeg(cur + d);
  const snapTo = fin5(opts.snapTo) ? opts.snapTo : 0;
  if (snapTo > 0) deg = normDeg(Math.round(deg / snapTo) * snapTo);
  return { patch: { rotation_degrees: deg } };
}
function alignSelectionPatch(scene, ids, edge, opts = {}) {
  const op = "align";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  if (!ALIGN_EDGES.includes(edge)) return { status: "rejected", op, reason: "unknown-edge", edge };
  const { targets, skipped } = resolveOpTargets(scene, ids, opts);
  if (!targets.length) return { status: "rejected", op, reason: "empty-selection", skipped };
  const extent = opts.extent && fin5(opts.extent.width) && fin5(opts.extent.depth) ? opts.extent : DEFAULT_PLAN_EXTENT;
  const to = opts.to === "plan" || opts.to === "primary" ? opts.to : targets.length === 1 ? "plan" : "primary";
  let anchor;
  let primary = null;
  if (to === "plan") {
    anchor = {
      left: 0,
      centerX: extent.width / 2,
      right: extent.width,
      top: 0,
      centerZ: extent.depth / 2,
      bottom: extent.depth
    };
  } else {
    const primaryId = idOf(opts.primaryId);
    primary = primaryId && targets.find((t) => t.id === primaryId) || targets[0];
    const b = primary.bounds;
    anchor = { left: b.minX, centerX: b.cx, right: b.maxX, top: b.minZ, centerZ: b.cz, bottom: b.maxZ };
  }
  const line = anchor[edge];
  if (!fin5(line)) return { status: "rejected", op, reason: "no-anchor", edge };
  const onX = edge === "left" || edge === "centerX" || edge === "right";
  const probes = { left: (b) => b.minX, centerX: (b) => b.cx, right: (b) => b.maxX, top: (b) => b.minZ, centerZ: (b) => b.cz, bottom: (b) => b.maxZ };
  const probe = probes[edge];
  const patches = [];
  for (const t of targets) {
    if (to === "primary" && t === primary) continue;
    const delta = line - probe(t.bounds);
    if (Math.abs(delta) < 1e-9) continue;
    const p = translateTargetPatch(t, onX ? delta : 0, onX ? 0 : delta, { round: opts.round === true });
    if (p) patches.push(p);
  }
  if (!patches.length) return { status: "noop", op, edge, to, skipped };
  return { status: "ok", op, edge, to, line, patches, skipped };
}
function distributeSelectionPatch(scene, ids, axis, opts = {}) {
  const op = "distribute";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  if (!DISTRIBUTE_AXES.includes(axis)) return { status: "rejected", op, reason: "unknown-axis", axis };
  const { targets, skipped } = resolveOpTargets(scene, ids, opts);
  if (targets.length < 3) return { status: "rejected", op, reason: "needs-three", count: targets.length, skipped };
  const minE = axis === "x" ? "minX" : "minZ";
  const maxE = axis === "x" ? "maxX" : "maxZ";
  const ctr = axis === "x" ? "cx" : "cz";
  const size = axis === "x" ? "width" : "depth";
  const sorted = [...targets].sort((a, b) => a.bounds[ctr] - b.bounds[ctr] || (a.id < b.id ? -1 : 1));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const middles = sorted.slice(1, -1);
  const free = last.bounds[minE] - first.bounds[maxE] - middles.reduce((s, t) => s + t.bounds[size], 0);
  const gap = free / (sorted.length - 1);
  let cursor = first.bounds[maxE];
  const patches = [];
  for (const t of middles) {
    const desired = cursor + gap;
    const delta = desired - t.bounds[minE];
    cursor = desired + t.bounds[size];
    if (Math.abs(delta) < 1e-9) continue;
    const p = translateTargetPatch(t, axis === "x" ? delta : 0, axis === "x" ? 0 : delta, { round: opts.round === true });
    if (p) patches.push(p);
  }
  if (!patches.length) return { status: "noop", op, axis, gap, skipped };
  return { status: "ok", op, axis, gap, patches, skipped };
}
var STRICT_NUM = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var typedNum = (v) => {
  if (fin5(v)) return { ok: true, v };
  if (typeof v === "string" && STRICT_NUM.test(v.trim())) {
    const n2 = Number(v.trim());
    return fin5(n2) ? { ok: true, v: n2 } : { ok: false };
  }
  return { ok: false };
};
function typedItemPatch(item, fields, opts = {}) {
  const op = "typed";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  if (!isRecord(item)) return { status: "rejected", op, reason: "no-item" };
  const f = isRecord(fields) ? fields : {};
  const pillar = item.foundation_type === "pillar";
  const spec = {
    x: { field: "x_inches", min: -Infinity },
    z: { field: "z_inches", min: -Infinity },
    length: { field: "length_inches", min: 0, exclusive: true, pillar: false },
    width: { field: "width_inches", min: 0, exclusive: true, pillar: false },
    diameter: { field: "diameter", min: 0, exclusive: true, pillar: true },
    rotation: { field: "rotation_degrees", normalize: true }
  };
  const patch = {};
  for (const key of Object.keys(f)) {
    const s = spec[key];
    if (!s) return { status: "rejected", op, reason: "unknown-field", field: key };
    if (f[key] === void 0) continue;
    if (s.pillar === true && !pillar) return { status: "rejected", op, reason: "field-not-applicable", field: key };
    if (s.pillar === false && pillar) return { status: "rejected", op, reason: "field-not-applicable", field: key };
    const n2 = typedNum(f[key]);
    if (!n2.ok) return { status: "rejected", op, reason: "invalid-field", field: key };
    if (s.exclusive && !(n2.v > s.min)) return { status: "rejected", op, reason: "non-positive", field: key };
    patch[s.field] = s.normalize ? normDeg(n2.v) : n2.v;
  }
  if (!Object.keys(patch).length) return { status: "noop", op };
  return { status: "ok", op, patch, before: beforeFieldsOf(item, patch) };
}
function deleteSelectionPlan(scene, idsOrEntries, opts = {}) {
  const op = "delete";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  const removals = [];
  const skipped = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of Array.isArray(idsOrEntries) ? idsOrEntries : []) {
    const id = idOf(entry);
    if (!isId2(id) || seen.has(id)) continue;
    seen.add(id);
    const kind = typeof entry === "object" && entry?.kind || parseSceneNodeId(id)?.kind || null;
    if (!kind || !WHOLE_ROW_KINDS.includes(kind)) {
      skipped.push({ id, reason: "sub-object" });
      continue;
    }
    const res = resolveSceneNode(scene, id);
    if (!res || !Number.isInteger(res.index) || res.index < 0) {
      skipped.push({ id, reason: "unresolved" });
      continue;
    }
    if (typeof opts.isLocked === "function" && opts.isLocked(res.row)) {
      skipped.push({ id, reason: "locked" });
      continue;
    }
    removals.push({
      id,
      kind,
      collection: COLLECTION_OF_KIND2[kind] ?? res.collection,
      index: res.index,
      key: parseSceneNodeId(id)?.key ?? null,
      componentId: res.row?.component_id ?? null
    });
  }
  if (!removals.length) return { status: "empty", op, removals, skipped };
  return { status: "ok", op, removals, skipped, requiresConfirm: true };
}
function duplicateSelectionPlan(scene, idsOrEntries, opts = {}) {
  const op = "duplicate";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  const sources = [];
  const skipped = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of Array.isArray(idsOrEntries) ? idsOrEntries : []) {
    const id = idOf(entry);
    if (!isId2(id) || seen.has(id)) continue;
    seen.add(id);
    const kind = typeof entry === "object" && entry?.kind || parseSceneNodeId(id)?.kind || null;
    if (!kind || !WHOLE_ROW_KINDS.includes(kind)) {
      skipped.push({ id, reason: "sub-object" });
      continue;
    }
    const res = resolveSceneNode(scene, id);
    if (!res || !Number.isInteger(res.index) || res.index < 0) {
      skipped.push({ id, reason: "unresolved" });
      continue;
    }
    sources.push({
      id,
      kind,
      collection: COLLECTION_OF_KIND2[kind] ?? res.collection,
      index: res.index,
      key: parseSceneNodeId(id)?.key ?? null,
      componentId: res.row?.component_id ?? null
    });
  }
  if (!sources.length) return { status: "empty", op, sources, skipped };
  const off = isRecord(opts.offsetInches) && fin5(opts.offsetInches.x) && fin5(opts.offsetInches.z) ? { x: opts.offsetInches.x, z: opts.offsetInches.z } : { ...DEFAULT_DUPLICATE_OFFSET_INCHES };
  return { status: "ok", op, sources, skipped, offset_inches: off };
}
function editRecordForPatches(op, method, patches, { label, key } = {}) {
  const list = Array.isArray(patches) ? patches : [];
  if (!list.length) return null;
  if (patchesFitSingleItemChannel(list)) {
    const p = list[0];
    const k = key ?? p.key ?? null;
    return {
      kind: op === "move" ? SCENE_OP_KINDS.move : SCENE_OP_KINDS[op] ?? op,
      method: method ?? "edit",
      key: k,
      identityKind: typeof k === "string" && k.includes(":") ? k.split(":")[0] : "key",
      before: p.before,
      after: p.patch,
      target: { key: k, index: p.index },
      label: label ?? null
    };
  }
  return {
    kind: SCENE_OP_KINDS.multi,
    method: method ?? "edit",
    key: null,
    identityKind: null,
    before: { multi: list.map((p) => ({ collection: p.collection, index: p.index, fields: p.before })) },
    after: { multi: list.map((p) => ({ collection: p.collection, index: p.index, fields: p.patch })) },
    target: null,
    // see the honesty-guard note above
    label: label ?? null
  };
}

// src/components/estimator/foundation/foundationReparentModel.js
var fin6 = (v) => typeof v === "number" && Number.isFinite(v);
var isId3 = (v) => typeof v === "string" && v.length > 0;
var isRecord2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var has = (row, field) => Object.prototype.hasOwnProperty.call(row ?? {}, field);
var isReservedRef = (v) => typeof v === "string" && v.startsWith("unresolved:");
var mirrorLive = (v) => v !== void 0 && v !== null && v !== -1;
var REPARENT_CHILD_KINDS = Object.freeze(["pole", "wall-cap", "cabinet"]);
var REPARENT_PARENT_KINDS = Object.freeze(["item", "pole", "wall", "wall-segment", "standalone"]);
var REPARENT_KEEP_MODES = Object.freeze(["world", "local"]);
var CHILD_SPEC = Object.freeze({
  pole: { collection: "poles", parents: ["item"], nodeId: sceneNodeId.pole },
  "wall-cap": { collection: "wall_caps", parents: ["wall", "wall-segment"], nodeId: sceneNodeId.wallCap },
  cabinet: { collection: "signage_cabinets", parents: ["pole", "item"], nodeId: sceneNodeId.cabinet }
});
var COLLECTION_TO_KIND = Object.freeze({
  poles: "pole",
  wall_caps: "wall-cap",
  signage_cabinets: "cabinet"
});
function reparentChildSpec(kind) {
  const spec = CHILD_SPEC[kind] ?? null;
  return spec ? { kind, collection: spec.collection, parents: [...spec.parents] } : null;
}
var defaultIsLocked2 = (row) => row?.locked === true || row?.locked === 1;
var ROW_OF_KIND = Object.freeze({
  item: "items",
  pole: "poles",
  wall: "walls",
  "wall-cap": "wall_caps",
  cabinet: "signage_cabinets"
});
var byComponentId = (rows, id) => {
  if (!isId3(id)) return null;
  const i = (rows || []).findIndex((r2) => r2?.component_id === id);
  return i >= 0 ? { row: rows[i], index: i } : null;
};
var legacyIndex = (v, count) => {
  const n2 = typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : v;
  if (!Number.isInteger(n2) || n2 < 0 || n2 >= count) return null;
  return n2;
};
var nodeIdOf = (kind, row, index) => {
  if (kind === "item") return sceneNodeId.item(layoutItemKey(row, index));
  if (kind === "wall") return sceneNodeId.wall(layoutItemKey(row, index));
  const make = CHILD_SPEC[kind]?.nodeId;
  return make ? make(layoutItemKey(row, index)) : null;
};
var parentLinkOf = (cols, kind, row) => {
  if (!isRecord2(row)) return null;
  const link = (parentKind, canonField, mirrorField, parentRows) => {
    if (has(row, canonField)) {
      const v = row[canonField];
      return isId3(v) ? { kind: parentKind, componentId: v, via: "canon" } : null;
    }
    const i = legacyIndex(row?.[mirrorField], parentRows.length);
    return i !== null ? { kind: parentKind, componentId: parentRows[i]?.component_id ?? null, index: i, via: "legacy" } : null;
  };
  if (kind === "pole") return link("item", "foundation_component_id", "foundation_idx", cols.items);
  if (kind === "cabinet") {
    if (row.mount === "pole") return link("pole", "pole_component_id", "pole_index", cols.poles);
    if (row.mount === "foundation") return link("item", "foundation_component_id", "foundation_index", cols.items);
    return null;
  }
  if (kind === "wall-cap") return link("wall", "wall_component_id", "wall_index", cols.walls);
  return null;
};
function ancestorComponentIds(scene, kind, row) {
  const cols = sceneCollections(scene);
  const seen = /* @__PURE__ */ new Set();
  let cur = { kind, row };
  let guard = 0;
  while (cur && guard < 64) {
    guard += 1;
    const link = parentLinkOf(cols, cur.kind, cur.row);
    if (!link || !isId3(link.componentId) || isReservedRef(link.componentId)) break;
    if (seen.has(link.componentId)) break;
    seen.add(link.componentId);
    const coll = ROW_OF_KIND[link.kind];
    const found = coll ? byComponentId(cols[coll], link.componentId) : null;
    cur = found ? { kind: link.kind, row: found.row } : null;
  }
  return seen;
}
function reparentParentOf(scene, kind, row) {
  const cols = sceneCollections(scene);
  if (!CHILD_SPEC[kind] || !isRecord2(row)) return null;
  const resolve = (link) => {
    if (!link) return { kind: "standalone" };
    if (isReservedRef(link.componentId)) return { kind: "unresolved", componentId: link.componentId };
    const coll = ROW_OF_KIND[link.kind];
    const found = coll ? byComponentId(cols[coll], link.componentId) : null;
    if (!found) return { kind: "dangling", componentId: link.componentId };
    return {
      kind: link.kind,
      componentId: link.componentId,
      index: found.index,
      nodeId: nodeIdOf(link.kind, found.row, found.index),
      via: link.via ?? "canon"
    };
  };
  if (kind === "pole") return resolve(parentLinkOf(cols, kind, row));
  if (kind === "cabinet") {
    const out = resolve(parentLinkOf(cols, kind, row));
    out.mount = row.mount ?? null;
    return out;
  }
  const wallLink = parentLinkOf(cols, kind, row);
  if (!wallLink) return { kind: "standalone" };
  if (isReservedRef(wallLink.componentId)) return { kind: "unresolved", componentId: wallLink.componentId };
  const wall = byComponentId(cols.walls, wallLink.componentId);
  if (!wall) return { kind: "dangling", componentId: wallLink.componentId };
  const wallNodeId = sceneNodeId.wall(layoutItemKey(wall.row, wall.index));
  const base = { componentId: wallLink.componentId, index: wall.index, nodeId: wallNodeId, via: wallLink.via ?? "canon" };
  const segs = Array.isArray(wall.row?.shape?.segments) ? wall.row.shape.segments : [];
  const segRef = row.segment_component_id;
  if (!isId3(segRef)) {
    const si2 = legacyIndex(row.segment_index, segs.length);
    const segRow = si2 !== null ? segs[si2] : null;
    if (segRow && isId3(segRow.component_id) && !isReservedRef(segRow.component_id)) {
      return {
        kind: "wall-segment",
        componentId: segRow.component_id,
        index: si2,
        wallComponentId: wallLink.componentId,
        wallIndex: wall.index,
        nodeId: sceneNodeId.wallSegment(layoutItemKey(wall.row, wall.index), `component:${segRow.component_id}`),
        via: "legacy"
      };
    }
    return { kind: "wall", ...base };
  }
  if (isReservedRef(segRef)) {
    return { kind: "wall", ...base, segment: { kind: "unresolved", componentId: segRef } };
  }
  const si = segs.findIndex((s) => s?.component_id === segRef);
  if (si < 0) {
    return { kind: "wall", ...base, segment: { kind: "dangling", componentId: segRef } };
  }
  return {
    kind: "wall-segment",
    componentId: segRef,
    index: si,
    wallComponentId: wallLink.componentId,
    wallIndex: wall.index,
    nodeId: sceneNodeId.wallSegment(layoutItemKey(wall.row, wall.index), `component:${segRef}`),
    via: "canon"
  };
}
var resolveChild = (scene, ref) => {
  const cols = sceneCollections(scene);
  if (typeof ref === "string") {
    const parsed = parseSceneNodeId(ref);
    if (!parsed || !CHILD_SPEC[parsed.kind]) return null;
    const res = resolveSceneNode(scene, ref);
    if (!res || !isRecord2(res.row)) return null;
    return {
      id: ref,
      kind: parsed.kind,
      collection: res.collection,
      index: res.index,
      key: parsed.key,
      row: res.row,
      componentId: res.row?.component_id ?? null
    };
  }
  if (isRecord2(ref) && typeof ref.collection === "string" && Number.isInteger(ref.index)) {
    const kind = COLLECTION_TO_KIND[ref.collection];
    const spec = kind ? CHILD_SPEC[kind] : null;
    if (!spec) return null;
    const row = cols[spec.collection]?.[ref.index];
    if (!isRecord2(row)) return null;
    const key = layoutItemKey(row, ref.index);
    return {
      id: spec.nodeId(key),
      kind,
      collection: spec.collection,
      index: ref.index,
      key,
      row,
      componentId: row?.component_id ?? null
    };
  }
  return null;
};
function resolveReparentTargetNode(scene, target) {
  const cols = sceneCollections(scene);
  if (target === null || target === void 0 || target === "standalone" || target?.detach === true || target?.kind === "standalone") {
    return { target: { kind: "standalone" } };
  }
  const finishRow = (kind, found, nodeId) => {
    const componentId = found.row?.component_id ?? null;
    if (!isId3(componentId) || isReservedRef(componentId)) {
      return { reason: "target-not-addressable", detail: componentId };
    }
    return {
      target: { kind, componentId, index: found.index, row: found.row, nodeId: nodeId ?? nodeIdOf(kind, found.row, found.index) }
    };
  };
  const finishSegment = (wall, wallIndex, segmentIndex, segRow, nodeId) => {
    const segId = segRow?.component_id ?? null;
    const wallId = wall?.component_id ?? null;
    if (!isId3(wallId) || isReservedRef(wallId)) return { reason: "target-not-addressable", detail: "segment-wall" };
    if (!isId3(segId) || isReservedRef(segId)) return { reason: "target-not-addressable", detail: segId };
    return {
      target: {
        kind: "wall-segment",
        componentId: segId,
        index: segmentIndex,
        wallComponentId: wallId,
        wallIndex,
        wall,
        nodeId: nodeId ?? sceneNodeId.wallSegment(layoutItemKey(wall, wallIndex), `component:${segId}`)
      }
    };
  };
  const locateSegment = (segId, wallComponentId) => {
    const pool = isId3(wallComponentId) ? [byComponentId(cols.walls, wallComponentId)].filter(Boolean) : cols.walls.map((row, index) => ({ row, index }));
    for (const w of pool) {
      const segs = Array.isArray(w.row?.shape?.segments) ? w.row.shape.segments : [];
      const si = segs.findIndex((s) => s?.component_id === segId);
      if (si >= 0) return { wall: w.row, wallIndex: w.index, segmentIndex: si, segRow: segs[si] };
    }
    if (isId3(wallComponentId)) {
      for (const w of cols.walls.map((row, index) => ({ row, index }))) {
        const segs = Array.isArray(w.row?.shape?.segments) ? w.row.shape.segments : [];
        if (segs.some((s) => s?.component_id === segId)) {
          return { reason: "segment-not-on-wall", wallComponentId };
        }
      }
    }
    return null;
  };
  if (typeof target === "string") {
    const parsed = parseSceneNodeId(target);
    if (!parsed) return { reason: "target-not-found", detail: target };
    if (parsed.kind === "wall-segment") {
      const res2 = resolveSceneNode(scene, target);
      if (!res2) return { reason: "target-not-found", detail: target };
      const segRow = res2.segment ?? null;
      if (!segRow) return { reason: "target-not-addressable", detail: parsed.ref ?? null };
      return finishSegment(res2.row, res2.wallIndex, res2.segmentIndex, segRow, target);
    }
    const res = resolveSceneNode(scene, target);
    if (!res || !isRecord2(res.row)) return { reason: "target-not-found", detail: target };
    return finishRow(parsed.kind, { row: res.row, index: res.index }, target);
  }
  if (isRecord2(target)) {
    const spec = { ...target };
    const segId = spec.segmentComponentId ?? (spec.kind === "wall-segment" ? spec.componentId : null);
    if (spec.kind === "wall-segment" || spec.kind === "wall" && isId3(segId)) {
      const bound = spec.kind === "wall" ? spec.wallComponentId ?? spec.componentId : spec.wallComponentId;
      const found2 = isId3(segId) ? locateSegment(segId, bound) : null;
      if (found2?.reason) return { reason: found2.reason, detail: found2 };
      if (!found2) return { reason: "target-not-found", detail: segId };
      return finishSegment(found2.wall, found2.wallIndex, found2.segmentIndex, found2.segRow, spec.nodeId);
    }
    const coll = ROW_OF_KIND[spec.kind];
    const found = coll ? byComponentId(cols[coll], spec.componentId) : null;
    if (!found) return { reason: "target-not-found", detail: spec.componentId ?? null };
    return finishRow(spec.kind, found, spec.nodeId);
  }
  return { reason: "target-not-found", detail: target ?? null };
}
var reject = (reason, extra = {}) => ({ status: "rejected", op: "reparent", reason, ...extra });
var legacyParentGuard = (child) => {
  const row = child.row;
  const live = (mirror) => mirrorLive(row?.[mirror]);
  if (child.kind === "pole") {
    if (!has(row, "foundation_component_id") && live("foundation_idx")) return "legacy-parent-unresolved";
    return null;
  }
  if (child.kind === "cabinet") {
    if (row?.mount === "pole" && !has(row, "pole_component_id") && live("pole_index")) return "legacy-parent-unresolved";
    if (row?.mount === "foundation" && !has(row, "foundation_component_id") && live("foundation_index")) return "legacy-parent-unresolved";
    return null;
  }
  if (child.kind === "wall-cap") {
    if (!has(row, "wall_component_id") && live("wall_index")) return "legacy-parent-unresolved";
    const wallLink = has(row, "wall_component_id") ? isId3(row.wall_component_id) : live("wall_index");
    if (wallLink && !has(row, "segment_component_id") && live("segment_index")) return "legacy-parent-unresolved";
    return null;
  }
  return null;
};
var polePointOf = (row) => planPointOf({ x: row?.x_inches, z: row?.z_inches });
var localPolePatch = (cols, child, from, to) => {
  const point = polePointOf(child.row);
  if (!point) return reject("invalid-geometry", { detail: "pole-point" });
  let oldLocal = point;
  if (from?.kind === "item" && isId3(from.componentId)) {
    const oldItem = byComponentId(cols.items, from.componentId)?.row;
    const oldFrame = oldItem ? itemPlanGeometry(oldItem)?.frame : null;
    if (!oldFrame) return reject("invalid-source-geometry", { detail: "old-parent-frame" });
    oldLocal = planToFrameLocal(oldFrame, point);
    if (!oldLocal) return reject("invalid-geometry", { detail: "pole-local" });
  }
  const newItem = byComponentId(cols.items, to.componentId)?.row;
  const newFrame = newItem ? itemPlanGeometry(newItem)?.frame : null;
  if (!newFrame) return reject("invalid-target-geometry", { detail: "new-parent-frame" });
  const next = frameLocalToPlan(newFrame, oldLocal);
  if (!next || !fin6(next.x) || !fin6(next.z)) return reject("invalid-geometry", { detail: "pole-plan" });
  return { fields: { x_inches: next.x, z_inches: next.z }, resolved: "local", local: oldLocal };
};
var patchForChild = (child, to) => {
  if (child.kind === "pole") {
    const target = to.kind === "standalone" ? null : to;
    return {
      foundation_component_id: target ? target.componentId : "",
      foundation_idx: target ? target.index : void 0
    };
  }
  if (child.kind === "cabinet") {
    if (to.kind === "standalone") {
      return {
        mount: child.row?.mount,
        pole_component_id: "",
        pole_index: void 0,
        foundation_component_id: "",
        foundation_index: void 0
      };
    }
    if (to.kind === "pole") {
      return {
        mount: "pole",
        pole_component_id: to.componentId,
        pole_index: to.index,
        foundation_component_id: "",
        foundation_index: void 0
      };
    }
    return {
      mount: "foundation",
      foundation_component_id: to.componentId,
      foundation_index: to.index,
      pole_component_id: "",
      pole_index: void 0
    };
  }
  if (to.kind === "standalone") {
    return {
      wall_component_id: "",
      wall_index: void 0,
      segment_component_id: "",
      segment_index: void 0
    };
  }
  if (to.kind === "wall") {
    return {
      wall_component_id: to.componentId,
      wall_index: to.index,
      segment_component_id: "",
      segment_index: void 0
    };
  }
  return {
    wall_component_id: to.wallComponentId,
    wall_index: to.wallIndex,
    segment_component_id: to.componentId,
    segment_index: to.index
  };
};
var childShort = (child) => `${child.kind} ${child.index + 1}`;
var parentShort = (to) => to.kind === "standalone" ? "standalone" : to.kind === "wall-segment" ? `wall ${to.wallIndex + 1} segment ${to.index + 1}` : `${to.kind} ${to.index + 1}`;
function planReparent(scene, childRef, target, opts = {}) {
  const op = "reparent";
  if (opts.readOnly === true) return reject("read-only");
  const cols = sceneCollections(scene);
  const child = resolveChild(scene, childRef);
  if (!child) {
    const ANY_KIND_OF_COLLECTION = { items: "item", walls: "wall", ...COLLECTION_TO_KIND };
    const kind = typeof childRef === "string" ? parseSceneNodeId(childRef)?.kind : ANY_KIND_OF_COLLECTION[childRef?.collection];
    return reject(kind && !CHILD_SPEC[kind] ? "kind-not-reparentable" : "unresolved", { kind: kind ?? null });
  }
  const isLocked = typeof opts.isLocked === "function" ? opts.isLocked : defaultIsLocked2;
  if (isLocked(child.row)) return reject("locked", { child: child.id });
  const legacy = legacyParentGuard(child);
  if (legacy) return reject(legacy, { child: child.id });
  const resolved = resolveReparentTargetNode(scene, target);
  if (resolved.reason) return reject(resolved.reason, { detail: resolved.detail, child: child.id });
  const to = resolved.target;
  if (to.kind !== "standalone" && !CHILD_SPEC[child.kind].parents.includes(to.kind)) {
    return reject("invalid-target-type", { child: child.id, detail: { childKind: child.kind, targetKind: to.kind } });
  }
  if (to.kind !== "standalone" && isId3(child.componentId)) {
    if (child.componentId === to.componentId || to.kind === "wall-segment" && child.componentId === to.wallComponentId) {
      return reject("cycle", { child: child.id, detail: "self" });
    }
    const startKind = to.kind === "wall-segment" ? "wall" : to.kind;
    const startRow = to.kind === "wall-segment" ? to.wall : to.row;
    if (ancestorComponentIds(scene, startKind, startRow).has(child.componentId)) {
      return reject("cycle", { child: child.id, detail: to.componentId });
    }
  }
  const from = reparentParentOf(scene, child.kind, child.row);
  const keepRequested = opts.keep === "local" ? "local" : "world";
  const patch = patchForChild(child, to);
  let keep = "world";
  if (keepRequested === "local" && child.kind === "pole" && to.kind === "item") {
    const local = localPolePatch(cols, child, from, to);
    if (local.status === "rejected") return { ...local, child: child.id };
    Object.assign(patch, local.fields);
    keep = local.resolved;
  }
  const before = beforeFieldsOf(child.row, patch);
  if (JSON.stringify(before) === JSON.stringify(patch)) {
    return { status: "noop", op, child: child.id, from, to, keep, keepRequested };
  }
  const patchRow = {
    collection: child.collection,
    index: child.index,
    key: child.key,
    before,
    patch
  };
  return {
    status: "ok",
    op,
    patches: [patchRow],
    skipped: [],
    child: { id: child.id, kind: child.kind, collection: child.collection, index: child.index, componentId: child.componentId },
    from,
    to,
    keep,
    keepRequested,
    preserveIds: [child.id],
    label: to.kind === "standalone" ? `Detach ${childShort(child)}` : `Reparent ${childShort(child)} to ${parentShort(to)}`
  };
}
function planReparentSelection(scene, ids, target, opts = {}) {
  const op = "reparent";
  if (opts.readOnly === true) return reject("read-only");
  const list = (Array.isArray(ids) ? ids : []).map((e) => typeof e === "string" ? e : e?.id).filter(isId3);
  if (!list.length) return reject("empty-selection");
  const probe = resolveReparentTargetNode(scene, target);
  if (probe.reason) return reject(probe.reason, { detail: probe.detail });
  const patches = [];
  const skipped = [];
  const children = [];
  let keep = "world";
  const keepRequested = opts.keep === "local" ? "local" : "world";
  for (const id of list) {
    const r2 = planReparent(scene, id, target, opts);
    if (r2.status === "ok") {
      patches.push(...r2.patches);
      children.push(r2.child);
      if (r2.keep === "local") keep = "local";
    } else if (r2.status === "noop") {
      skipped.push({ id, reason: "already-mounted" });
    } else {
      skipped.push({ id, reason: r2.reason ?? "rejected", detail: r2.detail ?? null });
    }
  }
  if (!children.length) {
    if (skipped.length && skipped.every((s) => s.reason === "already-mounted")) {
      return { status: "noop", op, skipped };
    }
    return { status: "rejected", op, reason: "empty-selection", skipped };
  }
  return {
    status: "ok",
    op,
    patches,
    skipped,
    children,
    count: children.length,
    keep,
    keepRequested,
    preserveIds: children.map((c) => c.id),
    label: children.length === 1 ? `Reparent ${childShort(children[0])}` : `Reparent ${children.length} objects`
  };
}
function reparentTargetsFor(scene, childRef) {
  const child = resolveChild(scene, childRef);
  if (!child) return { status: "rejected", reason: "unresolved", targets: [], detach: false };
  const cols = sceneCollections(scene);
  const from = reparentParentOf(scene, child.kind, child.row);
  const parents = CHILD_SPEC[child.kind].parents;
  const targets = [];
  const push = (kind, row, index, extra = {}) => {
    const componentId = row?.component_id ?? null;
    if (!isId3(componentId) || isReservedRef(componentId)) return;
    targets.push({
      kind,
      componentId,
      index,
      nodeId: nodeIdOf(kind, row, index),
      label: `${kind} ${index + 1}`,
      current: from?.kind === kind && from?.componentId === componentId,
      ...extra
    });
  };
  if (parents.includes("item")) {
    cols.items.forEach((it, i) => push("item", it, i));
  }
  if (parents.includes("pole")) {
    cols.poles.forEach((p, i) => push("pole", p, i));
  }
  if (parents.includes("wall") || parents.includes("wall-segment")) {
    cols.walls.forEach((w, i) => {
      if (parents.includes("wall")) push("wall", w, i);
      if (parents.includes("wall-segment")) {
        const key = layoutItemKey(w, i);
        const segs = Array.isArray(w?.shape?.segments) ? w.shape.segments : [];
        segs.forEach((s, si) => {
          const segId = s?.component_id ?? null;
          if (!isId3(segId) || isReservedRef(segId)) return;
          targets.push({
            kind: "wall-segment",
            componentId: segId,
            index: si,
            wallComponentId: w.component_id,
            wallIndex: i,
            nodeId: sceneNodeId.wallSegment(key, `component:${segId}`),
            label: `wall ${i + 1} segment ${si + 1}`,
            current: from?.kind === "wall-segment" && from?.componentId === segId
          });
        });
      }
    });
  }
  return {
    status: "ok",
    child: { id: child.id, kind: child.kind, collection: child.collection, index: child.index, componentId: child.componentId },
    from: from ?? { kind: "standalone" },
    detach: true,
    detached: !from || from.kind === "standalone",
    targets
  };
}
function mountLinkDescriptors(scene) {
  const cols = sceneCollections(scene);
  const out = [];
  const itemCenter = (id) => {
    const found = byComponentId(cols.items, id);
    if (!found) return null;
    const g = itemPlanGeometry(found.row);
    return g ? { x: g.center.x, z: g.center.z } : null;
  };
  const polePoint = (id) => {
    const found = byComponentId(cols.poles, id);
    return found ? polePointOf(found.row) : null;
  };
  const wallAnchor = (id) => {
    const found = byComponentId(cols.walls, id);
    const g = found ? wallPlanGeometry(found.row) : null;
    if (!g || !g.points.length) return null;
    const xs = g.points.map((p) => p.x);
    const zs = g.points.map((p) => p.z);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  };
  const segAnchor = (wallRow, segmentIndex) => {
    const g = wallPlanGeometry(wallRow);
    if (!g || !Number.isInteger(segmentIndex)) return null;
    const count = g.closed ? g.points.length : g.points.length - 1;
    if (segmentIndex < 0 || segmentIndex >= count) return null;
    const a = g.points[segmentIndex];
    const b = g.points[(segmentIndex + 1) % g.points.length];
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  };
  cols.poles.forEach((p, i) => {
    const from = reparentParentOf(scene, "pole", p);
    if (from?.kind !== "item") return;
    out.push({
      childId: sceneNodeId.pole(layoutItemKey(p, i)),
      childKind: "pole",
      collection: "poles",
      index: i,
      componentId: p?.component_id ?? null,
      parentId: from.nodeId ?? null,
      parentKind: "item",
      parentComponentId: from.componentId,
      handlePoint: polePointOf(p),
      parentPoint: itemCenter(from.componentId)
    });
  });
  cols.wall_caps.forEach((c, i) => {
    const from = reparentParentOf(scene, "wall-cap", c);
    if (!from || from.kind !== "wall" && from.kind !== "wall-segment") return;
    const wallId = from.kind === "wall-segment" ? from.wallComponentId : from.componentId;
    const wall = byComponentId(cols.walls, wallId)?.row;
    out.push({
      childId: sceneNodeId.wallCap(layoutItemKey(c, i)),
      childKind: "wall-cap",
      collection: "wall_caps",
      index: i,
      componentId: c?.component_id ?? null,
      parentId: from.nodeId ?? null,
      parentKind: from.kind,
      parentComponentId: from.kind === "wall-segment" ? from.componentId : wallId,
      handlePoint: from.kind === "wall-segment" ? segAnchor(wall, from.index) : wallAnchor(wallId),
      parentPoint: wallAnchor(wallId),
      segmentIndex: from.kind === "wall-segment" ? from.index : null
    });
  });
  cols.signage_cabinets.forEach((c, i) => {
    const from = reparentParentOf(scene, "cabinet", c);
    if (!from || from.kind !== "pole" && from.kind !== "item") return;
    const anchor = from.kind === "pole" ? polePoint(from.componentId) : itemCenter(from.componentId);
    out.push({
      childId: sceneNodeId.cabinet(layoutItemKey(c, i)),
      childKind: "cabinet",
      collection: "signage_cabinets",
      index: i,
      componentId: c?.component_id ?? null,
      parentId: from.nodeId ?? null,
      parentKind: from.kind,
      parentComponentId: from.componentId,
      mount: c?.mount ?? null,
      // A cabinet carries no plan point of its own — the handle sits on the
      // mount itself (the pole's point or the item's center).
      handlePoint: anchor,
      parentPoint: anchor
    });
  });
  return out;
}

// src/components/estimator/foundation/foundationPlanExport.js
var esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
var itemFootprint = (item) => {
  const type = String(item?.foundation_type || "spread").toLowerCase();
  if (type === "pillar") {
    const d = n(item?.diameter);
    return d ? { w: d, h: d, circular: true } : null;
  }
  const w = n(item?.length_inches), h2 = n(item?.width_inches);
  if (!w || !h2) return null;
  return { w, h: h2, circular: false };
};
var itemName = (it, i) => typeof it?.description === "string" && it.description.trim() || `Foundation ${i + 1}`;
function buildFoundationPlanSvg(scene, { width = 480, depth = 320 } = {}) {
  const items = scene?.items || [], poles = scene?.poles || [];
  const walls = scene?.walls || [], caps = scene?.wall_caps || [], cabinets = scene?.signage_cabinets || [];
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${depth}" font-family="system-ui, sans-serif">`);
  out.push(`<rect width="${width}" height="${depth}" fill="#ffffff"/>`);
  out.push(`<rect x="0.5" y="0.5" width="${width - 1}" height="${depth - 1}" fill="none" stroke="#94a3b8" stroke-width="1"/>`);
  for (let x = 12; x < width; x += 12) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${depth}" stroke="#f1f5f9" stroke-width="0.5"/>`);
  for (let y = 12; y < depth; y += 12) out.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#f1f5f9" stroke-width="0.5"/>`);
  items.forEach((item, i) => {
    const fp = itemFootprint(item);
    const x = n(item?.x_inches), z = n(item?.z_inches);
    if (!fp || x === null || z === null) return;
    const qty = Math.max(1, Number(item?.quantity) || 1);
    out.push(`<rect x="${x}" y="${z}" width="${fp.w}" height="${fp.h}" fill="rgba(245,158,11,0.18)" stroke="#d97706" stroke-width="1.5"/>`);
    out.push(`<text x="${x + 2}" y="${z + 9}" font-size="8" fill="#92400e">${esc(itemName(item, i))}${qty > 1 ? ` x${qty}` : ""} ${fp.w}x${fp.h}"</text>`);
  });
  walls.forEach((w, i) => {
    const pts = (w?.shape?.points || []).filter((p) => n(p?.x) !== null && n(p?.z) !== null);
    if (pts.length < 2) return;
    const path = pts.map((p, j) => `${j ? "L" : "M"}${p.x},${p.z}`).join(" ") + (w?.shape?.closed ? " Z" : "");
    out.push(`<path d="${path}" fill="none" stroke="#7c2d12" stroke-width="${Math.max(3, (n(w?.thicknessInches) || 8) / 4)}"/>`);
    const [p0] = pts;
    out.push(`<text x="${p0.x + 2}" y="${p0.z - 3}" font-size="8" fill="#7c2d12">${esc(w?.name || `Wall ${i + 1}`)}</text>`);
  });
  caps.forEach((c, i) => {
    const wall = walls.find((wl) => wl?.component_id === c?.wall_component_id);
    const segs = wall?.shape?.segments || [];
    const seg = segs.find((sg) => sg?.component_id === c?.segment_component_id);
    const pts = wall?.shape?.points || [];
    const si = segs.indexOf(seg);
    if (si < 0 || !pts[si] || !pts[si + 1]) return;
    const [a, b] = [pts[si], pts[si + 1]];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    out.push(`<line x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="#57534e" stroke-width="1.5" stroke-dasharray="3 2"/>`);
    out.push(`<circle cx="${mx}" cy="${mz}" r="2" fill="#57534e"/>`);
    out.push(`<text x="${mx + 3}" y="${mz - 3}" font-size="7" fill="#44403c">cap ${i + 1}</text>`);
  });
  poles.forEach((p, i) => {
    const x = n(p?.x_inches), z = n(p?.z_inches);
    if (x === null || z === null) return;
    out.push(`<circle cx="${x}" cy="${z}" r="4" fill="rgba(71,85,105,0.3)" stroke="#334155" stroke-width="1.5"/>`);
    out.push(`<text x="${x + 6}" y="${z + 3}" font-size="8" fill="#1e293b">Pole ${i + 1}${n(p?.height_inches) ? ` ${p.height_inches}"` : ""}</text>`);
    (p.signs || []).forEach((s) => {
      const sw = n(s?.width_inches), sd = n(s?.depth_inches);
      if (!sw || !sd) return;
      out.push(`<rect x="${x - sw / 2}" y="${z - sd / 2}" width="${sw}" height="${sd}" fill="rgba(59,130,246,0.12)" stroke="#2563eb" stroke-width="0.8"/>`);
    });
  });
  cabinets.forEach((c, i) => {
    let x = null, z = null;
    if (c?.mount === "pole") {
      const pole = poles.find((p) => p?.component_id === c?.pole_component_id);
      if (pole) {
        x = n(pole.x_inches);
        z = n(pole.z_inches);
      }
    } else if (c?.mount === "foundation") {
      const it = items.find((it2) => it2?.component_id === c?.foundation_component_id);
      const fp = it ? itemFootprint(it) : null;
      if (it && fp) {
        x = (n(it.x_inches) || 0) + fp.w / 2;
        z = (n(it.z_inches) || 0) + fp.h / 2;
      }
    }
    const cw = n(c?.width_inches), cd = n(c?.depth_inches);
    if (x === null || z === null || !cw || !cd) return;
    out.push(`<rect x="${x - cw / 2}" y="${z - cd / 2}" width="${cw}" height="${cd}" fill="rgba(31,41,55,0.2)" stroke="#1f2937" stroke-width="1.2"/>`);
    out.push(`<text x="${x - cw / 2}" y="${z - cd / 2 - 2}" font-size="7" fill="#1f2937">Cabinet ${i + 1}</text>`);
  });
  out.push(`<text x="6" y="${depth - 6}" font-size="9" fill="#64748b">${width}x${depth} plan -- labeled export (inches)</text>`);
  out.push("</svg>");
  return out.join("\n");
}

// src/components/estimator/foundation/landscapeMaterials.js
var LANDSCAPE_MATERIALS = [
  { key: "dirt", label: "Dirt (Eraser)", color: "#a1866f", cost_per_sqft: 0 },
  { key: "grass", label: "Grass", color: "#4ade80", cost_per_sqft: 0.75 },
  { key: "concrete", label: "Concrete", color: "#cbd5e1", cost_per_sqft: 8 },
  { key: "asphalt", label: "Asphalt", color: "#475569", cost_per_sqft: 5 },
  { key: "gravel", label: "Gravel", color: "#94a3b8", cost_per_sqft: 2.25 },
  { key: "sand", label: "Sand", color: "#fcd34d", cost_per_sqft: 1.75 },
  { key: "mulch", label: "Mulch", color: "#92400e", cost_per_sqft: 1.25 },
  { key: "wood_decking", label: "Wood Decking", color: "#d97706", cost_per_sqft: 14 },
  { key: "water", label: "Water", color: "#38bdf8", cost_per_sqft: 6 },
  // O-069 (CMP-F02) -- additional sqft-priced site materials. These bill by
  // coverage like the base set; per-count objects (trees, lights, boulders)
  // need a count-priced model -- they are intentionally absent rather than
  // billed per square foot.
  { key: "pavers", label: "Pavers", color: "#a8a29e", cost_per_sqft: 12 },
  { key: "flagstone", label: "Flagstone", color: "#b45309", cost_per_sqft: 16, pattern: "stone" },
  { key: "river_rock", label: "River Rock", color: "#78716c", cost_per_sqft: 3.5, pattern: "pebble" },
  { key: "sod", label: "Sod (installed)", color: "#16a34a", cost_per_sqft: 1.5, pattern: "grass" },
  { key: "artificial_turf", label: "Artificial Turf", color: "#059669", cost_per_sqft: 11, pattern: "turf" },
  { key: "ground_cover", label: "Ground Cover", color: "#65a30d", cost_per_sqft: 4, pattern: "foliage" },
  { key: "planting_bed", label: "Planting Bed", color: "#7c3f00", cost_per_sqft: 6, pattern: "soil" }
];
var LANDSCAPE_VISUAL_OBJECTS = [
  { key: "tree", label: "Tree", color: "#166534", height_inches: 96, radius_inches: 24 },
  { key: "shrub", label: "Shrub", color: "#15803d", height_inches: 18, radius_inches: 12 },
  { key: "light", label: "Light", color: "#f59e0b", height_inches: 72, radius_inches: 2 },
  { key: "boulder", label: "Boulder", color: "#57534e", height_inches: 30, radius_inches: 18 }
];
var VISUAL_PREFIX = "visual:";
var isVisualCellKey = (key) => typeof key === "string" && key.startsWith(VISUAL_PREFIX);
var visualObjectByKey = (key) => isVisualCellKey(key) ? LANDSCAPE_VISUAL_OBJECTS.find((o) => o.key === key.slice(VISUAL_PREFIX.length)) : void 0;
var LANDSCAPE_ASSET_MANIFEST = Object.freeze({
  license_policy: "CC0 or shop-licensed, individually curated per object type -- no blanket packs",
  source_kind: "procedural shop-authored primitives",
  materials: LANDSCAPE_MATERIALS.map((m) => ({
    key: m.key,
    label: m.label,
    kind: "billable material",
    source: "shop-authored color tile",
    license: "shop-authored",
    // O-075 (CMP-F08) -- manifest metadata: author/provenance, original scale,
    // preview, optimized-file hash, bounds/pivot, and a fallback representation.
    // Shop-authored primitives carry the primitive itself as the fallback.
    author: "shop",
    original_scale_inches: null,
    preview: null,
    file_hash: null,
    bounds_inches: null,
    pivot: "center-bottom",
    fallback: "color tile",
    // O-077 (CMP-F10) -- asset-verification checklist: procedural primitives
    // have no textures/CORS/foliage (not_applicable) but scale comes from the
    // authored material coverage (verified). Re-check when real assets land.
    verification: {
      transparent_foliage: "not_applicable",
      shadows: "procedural",
      scale: "verified",
      thumbnail: "procedural",
      cors: "not_applicable",
      unavailable_asset: "not_applicable",
      low_power_fallback: "procedural-fallback"
    }
  })),
  visual_objects: LANDSCAPE_VISUAL_OBJECTS.map((o) => ({
    key: o.key,
    label: o.label,
    kind: "decorative object",
    source: "shop-authored primitive shape",
    license: "shop-authored",
    author: "shop",
    original_scale_inches: o.height_inches ?? null,
    preview: null,
    file_hash: null,
    bounds_inches: o.height_inches != null && o.radius_inches != null ? { h: o.height_inches, r: o.radius_inches } : null,
    pivot: "center-bottom",
    fallback: "primitive shape",
    verification: {
      transparent_foliage: "not_applicable",
      shadows: "procedural",
      scale: "verified",
      thumbnail: "procedural",
      cors: "not_applicable",
      unavailable_asset: "not_applicable",
      low_power_fallback: "procedural-fallback"
    }
  }))
});

// src/components/estimator/foundation/foundationSceneDiagnostics.js
var PLAN_W2 = 480;
var PLAN_D = 320;
var itemRowName = (item, index) => typeof item?.description === "string" && item.description.trim() || `Foundation ${index + 1}`;
var rectOverlap = (a, b) => {
  const verts = (r2) => {
    const c = Math.cos(r2.rot * Math.PI / 180), s = Math.sin(r2.rot * Math.PI / 180);
    const hw = r2.w / 2, hd = r2.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [r2.cx + x * c - z * s, r2.cz + x * s + z * c]);
  };
  const va = verts(a), vb = verts(b);
  const axes = [
    [Math.cos(a.rot * Math.PI / 180), Math.sin(a.rot * Math.PI / 180)],
    [-Math.sin(a.rot * Math.PI / 180), Math.cos(a.rot * Math.PI / 180)],
    [Math.cos(b.rot * Math.PI / 180), Math.sin(b.rot * Math.PI / 180)],
    [-Math.sin(b.rot * Math.PI / 180), Math.cos(b.rot * Math.PI / 180)]
  ];
  for (const [ax, az] of axes) {
    const pr = (vs) => vs.map(([x, z]) => x * ax + z * az);
    const pa = pr(va), pb = pr(vb);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
};
var itemRect = (item, index) => {
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  if (!fp || !pos.valid) return null;
  return {
    cx: pos.x_inches + fp.width / 2,
    cz: pos.z_inches + fp.depth / 2,
    w: fp.width,
    d: fp.depth,
    rot: Number(item.rotation_degrees) || 0
  };
};
var pointInRect = (px, pz, r2) => {
  const c = Math.cos(r2.rot * Math.PI / 180), s = Math.sin(r2.rot * Math.PI / 180);
  const dx = px - r2.cx, dz = pz - r2.cz;
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  return Math.abs(lx) <= r2.w / 2 && Math.abs(lz) <= r2.d / 2;
};
function foundationSceneDiagnostics(scene) {
  const findings = [];
  const FIX_HINTS = {
    "pole-edge-clearance": "raise the mount height above the base offset",
    "sign-mount-mismatch": "change the sign's mount_type to pole or move it off the pole",
    "anchor-assembly-held": "record the anchor-bolt pattern (count/circle/embedment)",
    "mortar-joint-held": "record the mortar joint width (inches)",
    "brick-bond-held": "record the coursing bond (running/stack/Flemish)",
    "cap-miter-held": "record the cap miter cut (degrees)",
    "cap-joint-held": "record the cap joint width (inches)",
    "landscape-waste-held": "record a valid waste_fraction (0..1)",
    "impossible-fit": "lower the mount height or shorten the sign",
    "unresolvable-mount": "remount or detach the object",
    "unmounted-cap": "bind the cap to a wall or wall segment",
    "wall-cap-over-position": "shorten the cap or reposition it within the segment"
  };
  const push = (severity, kind, message, nodeIds) => findings.push({ severity, kind, message, nodeIds: nodeIds.filter(Boolean), issue_severity: severity, issue_fix_hint: FIX_HINTS[kind] || null });
  const items = scene?.items || [], poles = scene?.poles || [];
  const walls = scene?.walls || [], caps = scene?.wall_caps || [], cabinets = scene?.signage_cabinets || [];
  const landscape = scene?.landscape || null;
  const photos = Array.isArray(scene?.reference_photos) ? scene.reference_photos : [];
  photos.forEach((p, pi) => {
    const rd = p?.reported_dims;
    if (rd && typeof rd === "object") {
      items.forEach((item, i) => {
        const claimType = typeof rd.foundation_type === "string" && rd.foundation_type ? rd.foundation_type : null;
        const realType = typeof item.foundation_type === "string" && item.foundation_type ? item.foundation_type : null;
        if (claimType && realType && claimType !== realType) {
          push(
            "warning",
            "photo-catalog-mismatch",
            `Photo ${pi + 1}'s reported foundation type ("${claimType}") contradicts ${itemRowName(item, i)}'s authored type ("${realType}") -- review the photo's claim.`,
            [sceneNodeId.item(layoutItemKey(item, i))]
          );
        }
        const claimMat = typeof rd.material === "string" && rd.material ? rd.material : null;
        const realMat = typeof item.material_type === "string" && item.material_type ? item.material_type : null;
        if (claimMat && realMat && claimMat !== realMat) {
          push(
            "warning",
            "photo-catalog-mismatch",
            `Photo ${pi + 1}'s reported material ("${claimMat}") contradicts ${itemRowName(item, i)}'s authored material ("${realMat}") -- review the photo's claim.`,
            [sceneNodeId.item(layoutItemKey(item, i))]
          );
        }
      });
    }
    if (!rd || typeof rd !== "object") return;
    items.forEach((item, i) => {
      const claimL = Number(rd.length_inches), claimW = Number(rd.width_inches);
      const realL = Number(item.length_inches), realW = Number(item.width_inches);
      if (Number.isFinite(claimL) && Number.isFinite(realL) && Math.abs(claimL - realL) > 6) {
        push(
          "warning",
          "photo-contradicts-geometry",
          `Photo ${pi + 1}'s reported length (${claimL}") contradicts ${itemRowName(item, i)}'s authored length (${realL}") -- review the photo's claim.`,
          [sceneNodeId.item(layoutItemKey(item, i))]
        );
      }
      if (Number.isFinite(claimW) && Number.isFinite(realW) && Math.abs(claimW - realW) > 6) {
        push(
          "warning",
          "photo-contradicts-geometry",
          `Photo ${pi + 1}'s reported width (${claimW}") contradicts ${itemRowName(item, i)}'s authored width (${realW}") -- review the photo's claim.`,
          [sceneNodeId.item(layoutItemKey(item, i))]
        );
      }
      const claimQty = Number(rd.quantity), realQty = Number(item.quantity);
      if (Number.isFinite(claimQty) && Number.isFinite(realQty) && claimQty !== realQty) {
        push(
          "warning",
          "photo-quantity-mismatch",
          `Photo ${pi + 1}'s reported quantity (${claimQty}) contradicts ${itemRowName(item, i)}'s authored quantity (${realQty}) -- review the photo's claim.`,
          [sceneNodeId.item(layoutItemKey(item, i))]
        );
      }
    });
    const claimUnits = typeof rd.units === "string" && rd.units ? rd.units.toLowerCase() : null;
    if (claimUnits && !["in", "inch", "inches", '"'].includes(claimUnits)) {
      push(
        "warning",
        "photo-scale-mismatch",
        `Photo ${pi + 1}'s reported units ("${rd.units}") contradict the scene's inches-units -- review the photo's scale claim.`,
        []
      );
    }
    const claimMount = typeof rd.mount_type === "string" && rd.mount_type ? rd.mount_type : null;
    if (claimMount) {
      (poles || []).forEach((pole, pi2) => {
        (pole.signs || []).forEach((s, si) => {
          const realMount = typeof s?.mount_type === "string" && s.mount_type ? s.mount_type : "pole";
          if (claimMount !== realMount) {
            push(
              "warning",
              "photo-mount-mismatch",
              `Photo ${pi + 1}'s reported mount ("${claimMount}") contradicts pole ${pi2 + 1} sign ${si + 1}'s authored mount ("${realMount}") -- review the photo's claim.`,
              []
            );
          }
        });
      });
    }
  });
  const rects = items.map((item, i) => ({ item, index: i, rect: itemRect(item, i) }));
  rects.forEach(({ item, index, rect }) => {
    const id = sceneNodeId.item(layoutItemKey(item, index));
    if (!rect) {
      push("warning", "unplaced", `${itemRowName(item, index)} has no valid plan placement -- fix its dimensions or position.`, [id]);
      return;
    }
    const out = rect.cx - rect.w / 2 < -0.5 || rect.cx + rect.w / 2 > PLAN_W2 + 0.5 || rect.cz - rect.d / 2 < -0.5 || rect.cz + rect.d / 2 > PLAN_D + 0.5;
    if (out) push("warning", "out-of-bounds", `${itemRowName(item, index)} sits partly outside the plan area.`, [id]);
  });
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i], b = rects[j];
      if (!a.rect || !b.rect) continue;
      if (rectOverlap(a.rect, b.rect)) {
        push(
          "error",
          "clash",
          `${itemRowName(a.item, a.index)} and ${itemRowName(b.item, b.index)} footprints overlap.`,
          [sceneNodeId.item(layoutItemKey(a.item, a.index)), sceneNodeId.item(layoutItemKey(b.item, b.index))]
        );
      }
    }
  }
  poles.forEach((pole, i) => {
    const poleId = sceneNodeId.pole(layoutItemKey(pole, i));
    const parent = reparentParentOf(scene, "pole", pole);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Pole ${i + 1} is mounted to a foundation that no longer exists -- remount or detach it.`, [poleId]);
      return;
    }
    if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Pole ${i + 1}'s mount is stored in legacy form -- save once to normalize it.`, [poleId]);
    }
    const px = Number(pole.x_inches), pz = Number(pole.z_inches);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
    const inside = rects.filter(({ rect }) => rect && pointInRect(px, pz, rect));
    if (!parent?.componentId && inside.length > 0) {
      push(
        "info",
        "mount-candidate",
        `Pole ${i + 1} stands unmounted inside ${itemRowName(inside[0].item, inside[0].index)} -- select it and Mount to attach.`,
        [poleId, sceneNodeId.item(layoutItemKey(inside[0].item, inside[0].index))]
      );
    }
    if (inside.length > 1 && !parent?.componentId) {
      push(
        "warning",
        "ambiguous-footprint",
        `Pole ${i + 1} sits inside ${inside.length} overlapping foundations -- mount it to pick one.`,
        [poleId, ...inside.map((r2) => sceneNodeId.item(layoutItemKey(r2.item, r2.index)))]
      );
    }
    if (parent?.componentId) {
      const target = rects.find((r2) => r2.item?.component_id === parent.componentId);
      if (target?.rect && !pointInRect(px, pz, target.rect)) {
        push(
          "warning",
          "mounted-off-foundation",
          `Pole ${i + 1} is mounted to ${itemRowName(target.item, target.index)} but its position lies outside that footing -- move it onto the footing or remount it.`,
          [poleId, sceneNodeId.item(layoutItemKey(target.item, target.index))]
        );
      }
    }
    const poleTop = (Number(pole.base_offset_inches) || 0) + (Number(pole.height_inches) || 0);
    if (poleTop > 0) {
      (pole.signs || []).forEach((s, si) => {
        const mh = Number(s?.mount_height_inches), sh = Number(s?.height_inches);
        if (Number.isFinite(mh) && Number.isFinite(sh) && mh + sh > poleTop + 0.5) {
          push(
            "warning",
            "impossible-fit",
            `Pole ${i + 1} sign ${si + 1} rises to ${Math.round(mh + sh)}in but the pole tops out at ${Math.round(poleTop)}in -- lower the mount height or shorten the sign.`,
            [poleId]
          );
        }
        const baseOff = Number(pole.base_offset_inches) || 0;
        if (Number.isFinite(mh) && mh < baseOff - 0.5) {
          push(
            "warning",
            "pole-edge-clearance",
            `Pole ${i + 1} sign ${si + 1} mounts at ${Math.round(mh)}in but the pole's base offset is ${Math.round(baseOff)}in -- the sign hangs below the footing line.`,
            [poleId]
          );
        }
        if (s?.panel_shape === "letters") {
          push(
            "info",
            "sign-letter-mount",
            `Pole ${i + 1} sign ${si + 1} is a letters panel -- each letter mounts individually rather than as a continuous face.`,
            [poleId]
          );
        }
        const signMount = typeof s?.mount_type === "string" && s.mount_type ? s.mount_type : "pole";
        if (signMount !== "pole") {
          push(
            "warning",
            "sign-mount-mismatch",
            `Pole ${i + 1} sign ${si + 1} claims a "${signMount}" mount but lives on a pole -- the mount type and the pole context disagree.`,
            [poleId]
          );
        }
      });
    }
    if (pole?.anchor_assembly == null || pole.anchor_assembly === "") {
      push(
        "info",
        "anchor-assembly-held",
        `Pole ${i + 1}'s anchor-bolt pattern is not recorded -- record the assembly (bolt count/circle/embedment) for the field.`,
        [poleId]
      );
    }
    const signsArr = pole.signs || [];
    for (let a = 0; a < signsArr.length; a++) {
      const A = signsArr[a];
      const ax = Number(A?.horizontal_offset_inches) || 0, aw = Number(A?.width_inches);
      const amh = Number(A?.mount_height_inches), ash = Number(A?.height_inches);
      if (!Number.isFinite(aw) || aw <= 0 || !Number.isFinite(amh) || !Number.isFinite(ash)) continue;
      for (let b = a + 1; b < signsArr.length; b++) {
        const B = signsArr[b];
        const bx = Number(B?.horizontal_offset_inches) || 0, bw = Number(B?.width_inches);
        const bmh = Number(B?.mount_height_inches), bsh = Number(B?.height_inches);
        if (!Number.isFinite(bw) || bw <= 0 || !Number.isFinite(bmh) || !Number.isFinite(bsh)) continue;
        const xOverlap = ax - aw / 2 < bx + bw / 2 && bx - bw / 2 < ax + aw / 2;
        const yOverlap = amh < bmh + bsh && bmh < amh + ash;
        if (xOverlap && yOverlap) {
          push(
            "warning",
            "sign-horizontal-overlap",
            `Pole ${i + 1} signs ${a + 1} and ${b + 1} overlap in plan + elevation -- check horizontal offset or mount height.`,
            [poleId]
          );
        }
      }
    }
  });
  caps.forEach((cap, i) => {
    const capId = sceneNodeId.wallCap(layoutItemKey(cap, i));
    const parent = reparentParentOf(scene, "wall-cap", cap);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Wall cap ${i + 1} is bound to a wall that no longer exists -- remount it.`, [capId]);
    } else if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Wall cap ${i + 1}'s mount is stored in legacy form -- save once to normalize it.`, [capId]);
    } else if (!parent?.componentId) {
      push("error", "unmounted-cap", `Wall cap ${i + 1} isn't bound to a wall or wall segment -- it won't be billed to any wall.`, [capId]);
    }
    const capWall = walls.find((w) => w?.component_id === parent?.componentId);
    const capSeg = capWall?.shape?.segments?.find((s) => s?.component_id === cap?.segment_component_id) ?? (Number.isInteger(cap?.segment_index) ? capWall?.shape?.segments?.[cap.segment_index] : null);
    const segLen = Number(capSeg?.length);
    const capPos = Number(cap?.position_along_segment_inches);
    const capLen = Number(cap?.length_inches ?? cap?.cut_length_inches);
    if (Number.isFinite(segLen) && segLen > 0 && Number.isFinite(capPos) && capPos >= 0 && Number.isFinite(capLen) && capLen > 0 && capPos + capLen > segLen + 0.01) {
      push("warning", "wall-cap-over-position", `Wall cap ${i + 1} overruns its segment (position ${capPos}" + ${capLen}" > ${Math.round(segLen)}").`, [capId]);
    }
    if (cap?.miter_angle_deg == null) {
      push(
        "info",
        "cap-miter-held",
        `Wall cap ${i + 1}'s miter angle is not recorded -- record the miter cut (degrees) for the cut-list.`,
        [capId]
      );
    }
    if (cap?.joint_width_inches == null) {
      push(
        "info",
        "cap-joint-held",
        `Wall cap ${i + 1}'s joint width is not recorded -- record the cap joint (inches) for the cut-list.`,
        [capId]
      );
    }
  });
  cabinets.forEach((cab, i) => {
    const cabId = sceneNodeId.cabinet(layoutItemKey(cab, i));
    const parent = reparentParentOf(scene, "cabinet", cab);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Cabinet ${i + 1} is mounted to an object that no longer exists -- remount it.`, [cabId]);
    } else if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Cabinet ${i + 1}'s mount is stored in legacy form -- save once to normalize it.`, [cabId]);
    } else if (!parent?.componentId) {
      push("error", "unmounted-cabinet", `Cabinet ${i + 1} isn't mounted to a pole or foundation -- remount it.`, [cabId]);
    } else if (parent?.componentId && cab?.mount === "pole") {
      const poleRow = (poles || []).find((p) => p?.component_id === cab?.pole_component_id);
      const poleParent = poleRow ? reparentParentOf(scene, "pole", poleRow) : null;
      if (!poleParent?.componentId) {
        push("warning", "engineering-review", `Cabinet ${i + 1} hangs on a pole with no foundation mount -- the load path needs engineering review.`, [cabId]);
      }
    }
  });
  const cabSpan = (cab) => {
    const mh = Number(cab?.mount_height_inches);
    const h2 = Number(cab?.height_inches);
    if (!Number.isFinite(mh) || !Number.isFinite(h2) || h2 <= 0) return null;
    return [mh, mh + h2];
  };
  const byMount = /* @__PURE__ */ new Map();
  cabinets.forEach((cab, i) => {
    const parent = reparentParentOf(scene, "cabinet", cab);
    if (!parent?.componentId) return;
    const key = parent.componentId;
    if (!byMount.has(key)) byMount.set(key, []);
    byMount.get(key).push({ cab, i });
  });
  for (const [parentId, list] of byMount) {
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        const sa = cabSpan(list[a].cab), sb = cabSpan(list[b].cab);
        if (!sa || !sb) continue;
        if (sa[0] < sb[1] && sb[0] < sa[1]) {
          push(
            "warning",
            "sign-collision",
            `Cabinets ${list[a].i + 1} and ${list[b].i + 1} on the same mount overlap vertically (${Math.round(sa[0])}-${Math.round(sa[1])} vs ${Math.round(sb[0])}-${Math.round(sb[1])} in) -- raise one or resize.`,
            [sceneNodeId.cabinet(layoutItemKey(list[a].cab, list[a].i)), sceneNodeId.cabinet(layoutItemKey(list[b].cab, list[b].i))]
          );
        }
      }
    }
  }
  poles.forEach((pole, i) => {
    const poleId = pole?.component_id;
    const occupants = [];
    (pole.signs || []).forEach((s, si) => {
      const mh = Number(s?.mount_height_inches), h2 = Number(s?.height_inches);
      if (Number.isFinite(mh) && Number.isFinite(h2) && h2 > 0) {
        occupants.push({ label: `sign ${si + 1}`, span: [mh, mh + h2], id: poleId ? sceneNodeId.pole(layoutItemKey(pole, i)) : null });
      }
    });
    cabinets.forEach((cab, ci) => {
      if (cab?.mount !== "pole" || cab?.pole_component_id !== poleId) return;
      const mh = Number(cab?.mount_height_inches), h2 = Number(cab?.height_inches);
      if (Number.isFinite(mh) && Number.isFinite(h2) && h2 > 0) {
        occupants.push({ label: `cabinet ${ci + 1}`, span: [mh, mh + h2], id: poleId ? sceneNodeId.cabinet(layoutItemKey(cab, ci)) : null });
      }
    });
    for (let a = 0; a < occupants.length; a += 1) {
      for (let b = a + 1; b < occupants.length; b += 1) {
        const [sa, sb] = [occupants[a].span, occupants[b].span];
        if (sa[0] < sb[1] && sb[0] < sa[1]) {
          push(
            "warning",
            "sign-collision",
            `Pole ${i + 1}: ${occupants[a].label} and ${occupants[b].label} overlap vertically (${Math.round(sa[0])}-${Math.round(sa[1])} vs ${Math.round(sb[0])}-${Math.round(sb[1])} in) -- raise one or resize.`,
            [occupants[a].id, occupants[b].id]
          );
        }
      }
    }
  });
  walls.forEach((wall, i) => {
    const pts = wall?.shape?.points;
    if (!Array.isArray(pts) || pts.length < 2) return;
    const closed = wall.shape?.closed === true && pts.length >= 3;
    const n2 = closed ? pts.length : pts.length - 1;
    const wallId = sceneNodeId.wall(layoutItemKey(wall, i));
    const wName = wall?.name || `Wall ${i + 1}`;
    const fId = wall?.foundation_component_id;
    const assigned = typeof fId === "string" && fId && !fId.startsWith("unresolved:") ? fId : null;
    if (typeof fId === "string" && fId.startsWith("unresolved:")) {
      push("warning", "unsupported-span", `${wName} keeps an unresolved foundation assignment -- reassign it to check support.`, [wallId]);
      return;
    }
    const assignedRect = assigned ? rects.find(({ item }) => item?.component_id === assigned)?.rect : null;
    const wMat = typeof wall?.material === "string" && wall.material ? wall.material : null;
    if (wMat && ["brick", "cmu", "block", "masonry"].includes(wMat)) {
      if (wall?.mortar_joint_inches == null) {
        push(
          "info",
          "mortar-joint-held",
          `${wName}'s mortar joint is not recorded -- record the joint width (inches) for the coursing math.`,
          [wallId]
        );
      }
      if (wall?.brick_bond_type == null) {
        push(
          "info",
          "brick-bond-held",
          `${wName}'s bond type is not recorded -- record the coursing bond (running/stack/Flemish) for the coursing math.`,
          [wallId]
        );
      }
    }
    let tested = 0, uncovered = 0;
    for (let si = 0; si < n2; si += 1) {
      const a = pts[si], b = pts[(si + 1) % pts.length];
      const mx = (Number(a?.x) + Number(b?.x)) / 2;
      const mz = (Number(a?.z) + Number(b?.z)) / 2;
      if (!Number.isFinite(mx) || !Number.isFinite(mz)) continue;
      tested += 1;
      const covered = assignedRect ? pointInRect(mx, mz, assignedRect) : rects.some(({ rect }) => rect && pointInRect(mx, mz, rect));
      if (!covered) uncovered += 1;
    }
    if (tested === 0) return;
    if (assigned && !assignedRect) {
      push("warning", "unsupported-span", `${wName} is bound to a foundation whose placement can't be checked -- verify its footing.`, [wallId]);
      return;
    }
    if (uncovered === tested) {
      push(
        assigned ? "warning" : "info",
        "unsupported-span",
        `${wName}: no segment has a footing beneath it${assigned ? " (its bound foundation does not cover it)" : " -- assign a foundation or confirm it is freestanding"}.`,
        [wallId]
      );
    } else if (uncovered > 0) {
      push("warning", "unsupported-span", `${wName}: ${uncovered} of ${tested} segments span beyond any footing.`, [wallId]);
    }
  });
  const lcs = Number(landscape?.cell_size_inches) || 0;
  if (landscape?.cells && lcs > 0) {
    Object.entries(landscape.cells).forEach(([key, mat]) => {
      const vobj = visualObjectByKey(mat);
      if (!vobj) return;
      const [gx, gy] = String(key).split(",").map(Number);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
      const wx = (gx + 0.5) * lcs, wz = (gy + 0.5) * lcs;
      const target = rects.find(({ rect }) => rect && pointInRect(wx, wz, rect));
      if (target) {
        push(
          "warning",
          "visual-object-on-foundation",
          `${vobj.label || "Visual object"} at (${wx.toFixed(0)}, ${wz.toFixed(0)}) sits on ${itemRowName(target.item, target.index)} -- a footing can't carry plantings/decor.`,
          [sceneNodeId.item(layoutItemKey(target.item, target.index))]
        );
      }
      const wf = vobj?.waste_fraction;
      if (wf != null && (!Number.isFinite(Number(wf)) || Number(wf) < 0)) {
        push(
          "warning",
          "landscape-waste-held",
          `${vobj.label || "Visual object"}'s waste_fraction (${wf}) is malformed -- the cell can't carry a material-ordering waste factor.`,
          []
        );
      }
    });
  }
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}
function diagnosticTarget(scene, finding) {
  const id = finding?.nodeIds?.[0];
  if (!id || !parseSceneNodeId(id)) return null;
  return resolveSceneNode(scene, id) ? id : null;
}

// src/components/estimator/foundation/foundationFtInEntry.js
import { createElement as h, useId, useState } from "react";

// src/components/ui/input.jsx
import * as React from "react";

// node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t, f, n2 = "";
  if ("string" == typeof e || "number" == typeof e) n2 += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n2 && (n2 += " "), n2 += f);
  } else for (f in e) e[f] && (n2 && (n2 += " "), n2 += f);
  return n2;
}
function clsx() {
  for (var e, t, f = 0, n2 = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n2 && (n2 += " "), n2 += t);
  return n2;
}

// node_modules/tailwind-merge/dist/bundle-mjs.mjs
var CLASS_PART_SEPARATOR = "-";
var createClassGroupUtils = (config) => {
  const classMap = createClassMap(config);
  const {
    conflictingClassGroups,
    conflictingClassGroupModifiers
  } = config;
  const getClassGroupId = (className) => {
    const classParts = className.split(CLASS_PART_SEPARATOR);
    if (classParts[0] === "" && classParts.length !== 1) {
      classParts.shift();
    }
    return getGroupRecursive(classParts, classMap) || getGroupIdForArbitraryProperty(className);
  };
  const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
    const conflicts = conflictingClassGroups[classGroupId] || [];
    if (hasPostfixModifier && conflictingClassGroupModifiers[classGroupId]) {
      return [...conflicts, ...conflictingClassGroupModifiers[classGroupId]];
    }
    return conflicts;
  };
  return {
    getClassGroupId,
    getConflictingClassGroupIds
  };
};
var getGroupRecursive = (classParts, classPartObject) => {
  if (classParts.length === 0) {
    return classPartObject.classGroupId;
  }
  const currentClassPart = classParts[0];
  const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
  const classGroupFromNextClassPart = nextClassPartObject ? getGroupRecursive(classParts.slice(1), nextClassPartObject) : void 0;
  if (classGroupFromNextClassPart) {
    return classGroupFromNextClassPart;
  }
  if (classPartObject.validators.length === 0) {
    return void 0;
  }
  const classRest = classParts.join(CLASS_PART_SEPARATOR);
  return classPartObject.validators.find(({
    validator
  }) => validator(classRest))?.classGroupId;
};
var arbitraryPropertyRegex = /^\[(.+)\]$/;
var getGroupIdForArbitraryProperty = (className) => {
  if (arbitraryPropertyRegex.test(className)) {
    const arbitraryPropertyClassName = arbitraryPropertyRegex.exec(className)[1];
    const property = arbitraryPropertyClassName?.substring(0, arbitraryPropertyClassName.indexOf(":"));
    if (property) {
      return "arbitrary.." + property;
    }
  }
};
var createClassMap = (config) => {
  const {
    theme,
    classGroups
  } = config;
  const classMap = {
    nextPart: /* @__PURE__ */ new Map(),
    validators: []
  };
  for (const classGroupId in classGroups) {
    processClassesRecursively(classGroups[classGroupId], classMap, classGroupId, theme);
  }
  return classMap;
};
var processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
  classGroup.forEach((classDefinition) => {
    if (typeof classDefinition === "string") {
      const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
      classPartObjectToEdit.classGroupId = classGroupId;
      return;
    }
    if (typeof classDefinition === "function") {
      if (isThemeGetter(classDefinition)) {
        processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
        return;
      }
      classPartObject.validators.push({
        validator: classDefinition,
        classGroupId
      });
      return;
    }
    Object.entries(classDefinition).forEach(([key, classGroup2]) => {
      processClassesRecursively(classGroup2, getPart(classPartObject, key), classGroupId, theme);
    });
  });
};
var getPart = (classPartObject, path) => {
  let currentClassPartObject = classPartObject;
  path.split(CLASS_PART_SEPARATOR).forEach((pathPart) => {
    if (!currentClassPartObject.nextPart.has(pathPart)) {
      currentClassPartObject.nextPart.set(pathPart, {
        nextPart: /* @__PURE__ */ new Map(),
        validators: []
      });
    }
    currentClassPartObject = currentClassPartObject.nextPart.get(pathPart);
  });
  return currentClassPartObject;
};
var isThemeGetter = (func) => func.isThemeGetter;
var createLruCache = (maxCacheSize) => {
  if (maxCacheSize < 1) {
    return {
      get: () => void 0,
      set: () => {
      }
    };
  }
  let cacheSize = 0;
  let cache = /* @__PURE__ */ new Map();
  let previousCache = /* @__PURE__ */ new Map();
  const update = (key, value) => {
    cache.set(key, value);
    cacheSize++;
    if (cacheSize > maxCacheSize) {
      cacheSize = 0;
      previousCache = cache;
      cache = /* @__PURE__ */ new Map();
    }
  };
  return {
    get(key) {
      let value = cache.get(key);
      if (value !== void 0) {
        return value;
      }
      if ((value = previousCache.get(key)) !== void 0) {
        update(key, value);
        return value;
      }
    },
    set(key, value) {
      if (cache.has(key)) {
        cache.set(key, value);
      } else {
        update(key, value);
      }
    }
  };
};
var IMPORTANT_MODIFIER = "!";
var MODIFIER_SEPARATOR = ":";
var MODIFIER_SEPARATOR_LENGTH = MODIFIER_SEPARATOR.length;
var createParseClassName = (config) => {
  const {
    prefix,
    experimentalParseClassName
  } = config;
  let parseClassName = (className) => {
    const modifiers = [];
    let bracketDepth = 0;
    let parenDepth = 0;
    let modifierStart = 0;
    let postfixModifierPosition;
    for (let index = 0; index < className.length; index++) {
      let currentCharacter = className[index];
      if (bracketDepth === 0 && parenDepth === 0) {
        if (currentCharacter === MODIFIER_SEPARATOR) {
          modifiers.push(className.slice(modifierStart, index));
          modifierStart = index + MODIFIER_SEPARATOR_LENGTH;
          continue;
        }
        if (currentCharacter === "/") {
          postfixModifierPosition = index;
          continue;
        }
      }
      if (currentCharacter === "[") {
        bracketDepth++;
      } else if (currentCharacter === "]") {
        bracketDepth--;
      } else if (currentCharacter === "(") {
        parenDepth++;
      } else if (currentCharacter === ")") {
        parenDepth--;
      }
    }
    const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.substring(modifierStart);
    const baseClassName = stripImportantModifier(baseClassNameWithImportantModifier);
    const hasImportantModifier = baseClassName !== baseClassNameWithImportantModifier;
    const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : void 0;
    return {
      modifiers,
      hasImportantModifier,
      baseClassName,
      maybePostfixModifierPosition
    };
  };
  if (prefix) {
    const fullPrefix = prefix + MODIFIER_SEPARATOR;
    const parseClassNameOriginal = parseClassName;
    parseClassName = (className) => className.startsWith(fullPrefix) ? parseClassNameOriginal(className.substring(fullPrefix.length)) : {
      isExternal: true,
      modifiers: [],
      hasImportantModifier: false,
      baseClassName: className,
      maybePostfixModifierPosition: void 0
    };
  }
  if (experimentalParseClassName) {
    const parseClassNameOriginal = parseClassName;
    parseClassName = (className) => experimentalParseClassName({
      className,
      parseClassName: parseClassNameOriginal
    });
  }
  return parseClassName;
};
var stripImportantModifier = (baseClassName) => {
  if (baseClassName.endsWith(IMPORTANT_MODIFIER)) {
    return baseClassName.substring(0, baseClassName.length - 1);
  }
  if (baseClassName.startsWith(IMPORTANT_MODIFIER)) {
    return baseClassName.substring(1);
  }
  return baseClassName;
};
var createSortModifiers = (config) => {
  const orderSensitiveModifiers = Object.fromEntries(config.orderSensitiveModifiers.map((modifier) => [modifier, true]));
  const sortModifiers = (modifiers) => {
    if (modifiers.length <= 1) {
      return modifiers;
    }
    const sortedModifiers = [];
    let unsortedModifiers = [];
    modifiers.forEach((modifier) => {
      const isPositionSensitive = modifier[0] === "[" || orderSensitiveModifiers[modifier];
      if (isPositionSensitive) {
        sortedModifiers.push(...unsortedModifiers.sort(), modifier);
        unsortedModifiers = [];
      } else {
        unsortedModifiers.push(modifier);
      }
    });
    sortedModifiers.push(...unsortedModifiers.sort());
    return sortedModifiers;
  };
  return sortModifiers;
};
var createConfigUtils = (config) => ({
  cache: createLruCache(config.cacheSize),
  parseClassName: createParseClassName(config),
  sortModifiers: createSortModifiers(config),
  ...createClassGroupUtils(config)
});
var SPLIT_CLASSES_REGEX = /\s+/;
var mergeClassList = (classList, configUtils) => {
  const {
    parseClassName,
    getClassGroupId,
    getConflictingClassGroupIds,
    sortModifiers
  } = configUtils;
  const classGroupsInConflict = [];
  const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
  let result = "";
  for (let index = classNames.length - 1; index >= 0; index -= 1) {
    const originalClassName = classNames[index];
    const {
      isExternal,
      modifiers,
      hasImportantModifier,
      baseClassName,
      maybePostfixModifierPosition
    } = parseClassName(originalClassName);
    if (isExternal) {
      result = originalClassName + (result.length > 0 ? " " + result : result);
      continue;
    }
    let hasPostfixModifier = !!maybePostfixModifierPosition;
    let classGroupId = getClassGroupId(hasPostfixModifier ? baseClassName.substring(0, maybePostfixModifierPosition) : baseClassName);
    if (!classGroupId) {
      if (!hasPostfixModifier) {
        result = originalClassName + (result.length > 0 ? " " + result : result);
        continue;
      }
      classGroupId = getClassGroupId(baseClassName);
      if (!classGroupId) {
        result = originalClassName + (result.length > 0 ? " " + result : result);
        continue;
      }
      hasPostfixModifier = false;
    }
    const variantModifier = sortModifiers(modifiers).join(":");
    const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
    const classId = modifierId + classGroupId;
    if (classGroupsInConflict.includes(classId)) {
      continue;
    }
    classGroupsInConflict.push(classId);
    const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
    for (let i = 0; i < conflictGroups.length; ++i) {
      const group = conflictGroups[i];
      classGroupsInConflict.push(modifierId + group);
    }
    result = originalClassName + (result.length > 0 ? " " + result : result);
  }
  return result;
};
function twJoin() {
  let index = 0;
  let argument;
  let resolvedValue;
  let string = "";
  while (index < arguments.length) {
    if (argument = arguments[index++]) {
      if (resolvedValue = toValue(argument)) {
        string && (string += " ");
        string += resolvedValue;
      }
    }
  }
  return string;
}
var toValue = (mix) => {
  if (typeof mix === "string") {
    return mix;
  }
  let resolvedValue;
  let string = "";
  for (let k = 0; k < mix.length; k++) {
    if (mix[k]) {
      if (resolvedValue = toValue(mix[k])) {
        string && (string += " ");
        string += resolvedValue;
      }
    }
  }
  return string;
};
function createTailwindMerge(createConfigFirst, ...createConfigRest) {
  let configUtils;
  let cacheGet;
  let cacheSet;
  let functionToCall = initTailwindMerge;
  function initTailwindMerge(classList) {
    const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
    configUtils = createConfigUtils(config);
    cacheGet = configUtils.cache.get;
    cacheSet = configUtils.cache.set;
    functionToCall = tailwindMerge;
    return tailwindMerge(classList);
  }
  function tailwindMerge(classList) {
    const cachedResult = cacheGet(classList);
    if (cachedResult) {
      return cachedResult;
    }
    const result = mergeClassList(classList, configUtils);
    cacheSet(classList, result);
    return result;
  }
  return function callTailwindMerge() {
    return functionToCall(twJoin.apply(null, arguments));
  };
}
var fromTheme = (key) => {
  const themeGetter = (theme) => theme[key] || [];
  themeGetter.isThemeGetter = true;
  return themeGetter;
};
var arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
var arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
var fractionRegex = /^\d+\/\d+$/;
var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
var shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
var imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
var isFraction = (value) => fractionRegex.test(value);
var isNumber = (value) => !!value && !Number.isNaN(Number(value));
var isInteger = (value) => !!value && Number.isInteger(Number(value));
var isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
var isTshirtSize = (value) => tshirtUnitRegex.test(value);
var isAny = () => true;
var isLengthOnly = (value) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  lengthUnitRegex.test(value) && !colorFunctionRegex.test(value)
);
var isNever = () => false;
var isShadow = (value) => shadowRegex.test(value);
var isImage = (value) => imageRegex.test(value);
var isAnyNonArbitrary = (value) => !isArbitraryValue(value) && !isArbitraryVariable(value);
var isArbitrarySize = (value) => getIsArbitraryValue(value, isLabelSize, isNever);
var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
var isArbitraryLength = (value) => getIsArbitraryValue(value, isLabelLength, isLengthOnly);
var isArbitraryNumber = (value) => getIsArbitraryValue(value, isLabelNumber, isNumber);
var isArbitraryPosition = (value) => getIsArbitraryValue(value, isLabelPosition, isNever);
var isArbitraryImage = (value) => getIsArbitraryValue(value, isLabelImage, isImage);
var isArbitraryShadow = (value) => getIsArbitraryValue(value, isLabelShadow, isShadow);
var isArbitraryVariable = (value) => arbitraryVariableRegex.test(value);
var isArbitraryVariableLength = (value) => getIsArbitraryVariable(value, isLabelLength);
var isArbitraryVariableFamilyName = (value) => getIsArbitraryVariable(value, isLabelFamilyName);
var isArbitraryVariablePosition = (value) => getIsArbitraryVariable(value, isLabelPosition);
var isArbitraryVariableSize = (value) => getIsArbitraryVariable(value, isLabelSize);
var isArbitraryVariableImage = (value) => getIsArbitraryVariable(value, isLabelImage);
var isArbitraryVariableShadow = (value) => getIsArbitraryVariable(value, isLabelShadow, true);
var getIsArbitraryValue = (value, testLabel, testValue) => {
  const result = arbitraryValueRegex.exec(value);
  if (result) {
    if (result[1]) {
      return testLabel(result[1]);
    }
    return testValue(result[2]);
  }
  return false;
};
var getIsArbitraryVariable = (value, testLabel, shouldMatchNoLabel = false) => {
  const result = arbitraryVariableRegex.exec(value);
  if (result) {
    if (result[1]) {
      return testLabel(result[1]);
    }
    return shouldMatchNoLabel;
  }
  return false;
};
var isLabelPosition = (label) => label === "position" || label === "percentage";
var isLabelImage = (label) => label === "image" || label === "url";
var isLabelSize = (label) => label === "length" || label === "size" || label === "bg-size";
var isLabelLength = (label) => label === "length";
var isLabelNumber = (label) => label === "number";
var isLabelFamilyName = (label) => label === "family-name";
var isLabelShadow = (label) => label === "shadow";
var getDefaultConfig = () => {
  const themeColor = fromTheme("color");
  const themeFont = fromTheme("font");
  const themeText = fromTheme("text");
  const themeFontWeight = fromTheme("font-weight");
  const themeTracking = fromTheme("tracking");
  const themeLeading = fromTheme("leading");
  const themeBreakpoint = fromTheme("breakpoint");
  const themeContainer = fromTheme("container");
  const themeSpacing = fromTheme("spacing");
  const themeRadius = fromTheme("radius");
  const themeShadow = fromTheme("shadow");
  const themeInsetShadow = fromTheme("inset-shadow");
  const themeTextShadow = fromTheme("text-shadow");
  const themeDropShadow = fromTheme("drop-shadow");
  const themeBlur = fromTheme("blur");
  const themePerspective = fromTheme("perspective");
  const themeAspect = fromTheme("aspect");
  const themeEase = fromTheme("ease");
  const themeAnimate = fromTheme("animate");
  const scaleBreak = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
  const scalePosition = () => [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top-left",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "left-top",
    "top-right",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "right-top",
    "bottom-right",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "right-bottom",
    "bottom-left",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "left-bottom"
  ];
  const scalePositionWithArbitrary = () => [...scalePosition(), isArbitraryVariable, isArbitraryValue];
  const scaleOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
  const scaleOverscroll = () => ["auto", "contain", "none"];
  const scaleUnambiguousSpacing = () => [isArbitraryVariable, isArbitraryValue, themeSpacing];
  const scaleInset = () => [isFraction, "full", "auto", ...scaleUnambiguousSpacing()];
  const scaleGridTemplateColsRows = () => [isInteger, "none", "subgrid", isArbitraryVariable, isArbitraryValue];
  const scaleGridColRowStartAndEnd = () => ["auto", {
    span: ["full", isInteger, isArbitraryVariable, isArbitraryValue]
  }, isInteger, isArbitraryVariable, isArbitraryValue];
  const scaleGridColRowStartOrEnd = () => [isInteger, "auto", isArbitraryVariable, isArbitraryValue];
  const scaleGridAutoColsRows = () => ["auto", "min", "max", "fr", isArbitraryVariable, isArbitraryValue];
  const scaleAlignPrimaryAxis = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"];
  const scaleAlignSecondaryAxis = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"];
  const scaleMargin = () => ["auto", ...scaleUnambiguousSpacing()];
  const scaleSizing = () => [isFraction, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
  const scaleColor = () => [themeColor, isArbitraryVariable, isArbitraryValue];
  const scaleBgPosition = () => [...scalePosition(), isArbitraryVariablePosition, isArbitraryPosition, {
    position: [isArbitraryVariable, isArbitraryValue]
  }];
  const scaleBgRepeat = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }];
  const scaleBgSize = () => ["auto", "cover", "contain", isArbitraryVariableSize, isArbitrarySize, {
    size: [isArbitraryVariable, isArbitraryValue]
  }];
  const scaleGradientStopPosition = () => [isPercent, isArbitraryVariableLength, isArbitraryLength];
  const scaleRadius = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    themeRadius,
    isArbitraryVariable,
    isArbitraryValue
  ];
  const scaleBorderWidth = () => ["", isNumber, isArbitraryVariableLength, isArbitraryLength];
  const scaleLineStyle = () => ["solid", "dashed", "dotted", "double"];
  const scaleBlendMode = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
  const scaleMaskImagePosition = () => [isNumber, isPercent, isArbitraryVariablePosition, isArbitraryPosition];
  const scaleBlur = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    themeBlur,
    isArbitraryVariable,
    isArbitraryValue
  ];
  const scaleRotate = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleScale = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleSkew = () => [isNumber, isArbitraryVariable, isArbitraryValue];
  const scaleTranslate = () => [isFraction, "full", ...scaleUnambiguousSpacing()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [isTshirtSize],
      breakpoint: [isTshirtSize],
      color: [isAny],
      container: [isTshirtSize],
      "drop-shadow": [isTshirtSize],
      ease: ["in", "out", "in-out"],
      font: [isAnyNonArbitrary],
      "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
      "inset-shadow": [isTshirtSize],
      leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
      perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
      radius: [isTshirtSize],
      shadow: [isTshirtSize],
      spacing: ["px", isNumber],
      text: [isTshirtSize],
      "text-shadow": [isTshirtSize],
      tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"]
    },
    classGroups: {
      // --------------
      // --- Layout ---
      // --------------
      /**
       * Aspect Ratio
       * @see https://tailwindcss.com/docs/aspect-ratio
       */
      aspect: [{
        aspect: ["auto", "square", isFraction, isArbitraryValue, isArbitraryVariable, themeAspect]
      }],
      /**
       * Container
       * @see https://tailwindcss.com/docs/container
       * @deprecated since Tailwind CSS v4.0.0
       */
      container: ["container"],
      /**
       * Columns
       * @see https://tailwindcss.com/docs/columns
       */
      columns: [{
        columns: [isNumber, isArbitraryValue, isArbitraryVariable, themeContainer]
      }],
      /**
       * Break After
       * @see https://tailwindcss.com/docs/break-after
       */
      "break-after": [{
        "break-after": scaleBreak()
      }],
      /**
       * Break Before
       * @see https://tailwindcss.com/docs/break-before
       */
      "break-before": [{
        "break-before": scaleBreak()
      }],
      /**
       * Break Inside
       * @see https://tailwindcss.com/docs/break-inside
       */
      "break-inside": [{
        "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
      }],
      /**
       * Box Decoration Break
       * @see https://tailwindcss.com/docs/box-decoration-break
       */
      "box-decoration": [{
        "box-decoration": ["slice", "clone"]
      }],
      /**
       * Box Sizing
       * @see https://tailwindcss.com/docs/box-sizing
       */
      box: [{
        box: ["border", "content"]
      }],
      /**
       * Display
       * @see https://tailwindcss.com/docs/display
       */
      display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
      /**
       * Screen Reader Only
       * @see https://tailwindcss.com/docs/display#screen-reader-only
       */
      sr: ["sr-only", "not-sr-only"],
      /**
       * Floats
       * @see https://tailwindcss.com/docs/float
       */
      float: [{
        float: ["right", "left", "none", "start", "end"]
      }],
      /**
       * Clear
       * @see https://tailwindcss.com/docs/clear
       */
      clear: [{
        clear: ["left", "right", "both", "none", "start", "end"]
      }],
      /**
       * Isolation
       * @see https://tailwindcss.com/docs/isolation
       */
      isolation: ["isolate", "isolation-auto"],
      /**
       * Object Fit
       * @see https://tailwindcss.com/docs/object-fit
       */
      "object-fit": [{
        object: ["contain", "cover", "fill", "none", "scale-down"]
      }],
      /**
       * Object Position
       * @see https://tailwindcss.com/docs/object-position
       */
      "object-position": [{
        object: scalePositionWithArbitrary()
      }],
      /**
       * Overflow
       * @see https://tailwindcss.com/docs/overflow
       */
      overflow: [{
        overflow: scaleOverflow()
      }],
      /**
       * Overflow X
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-x": [{
        "overflow-x": scaleOverflow()
      }],
      /**
       * Overflow Y
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-y": [{
        "overflow-y": scaleOverflow()
      }],
      /**
       * Overscroll Behavior
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      overscroll: [{
        overscroll: scaleOverscroll()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": scaleOverscroll()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": scaleOverscroll()
      }],
      /**
       * Position
       * @see https://tailwindcss.com/docs/position
       */
      position: ["static", "fixed", "absolute", "relative", "sticky"],
      /**
       * Top / Right / Bottom / Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      inset: [{
        inset: scaleInset()
      }],
      /**
       * Right / Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-x": [{
        "inset-x": scaleInset()
      }],
      /**
       * Top / Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-y": [{
        "inset-y": scaleInset()
      }],
      /**
       * Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      start: [{
        start: scaleInset()
      }],
      /**
       * End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      end: [{
        end: scaleInset()
      }],
      /**
       * Top
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      top: [{
        top: scaleInset()
      }],
      /**
       * Right
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      right: [{
        right: scaleInset()
      }],
      /**
       * Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      bottom: [{
        bottom: scaleInset()
      }],
      /**
       * Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      left: [{
        left: scaleInset()
      }],
      /**
       * Visibility
       * @see https://tailwindcss.com/docs/visibility
       */
      visibility: ["visible", "invisible", "collapse"],
      /**
       * Z-Index
       * @see https://tailwindcss.com/docs/z-index
       */
      z: [{
        z: [isInteger, "auto", isArbitraryVariable, isArbitraryValue]
      }],
      // ------------------------
      // --- Flexbox and Grid ---
      // ------------------------
      /**
       * Flex Basis
       * @see https://tailwindcss.com/docs/flex-basis
       */
      basis: [{
        basis: [isFraction, "full", "auto", themeContainer, ...scaleUnambiguousSpacing()]
      }],
      /**
       * Flex Direction
       * @see https://tailwindcss.com/docs/flex-direction
       */
      "flex-direction": [{
        flex: ["row", "row-reverse", "col", "col-reverse"]
      }],
      /**
       * Flex Wrap
       * @see https://tailwindcss.com/docs/flex-wrap
       */
      "flex-wrap": [{
        flex: ["nowrap", "wrap", "wrap-reverse"]
      }],
      /**
       * Flex
       * @see https://tailwindcss.com/docs/flex
       */
      flex: [{
        flex: [isNumber, isFraction, "auto", "initial", "none", isArbitraryValue]
      }],
      /**
       * Flex Grow
       * @see https://tailwindcss.com/docs/flex-grow
       */
      grow: [{
        grow: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Flex Shrink
       * @see https://tailwindcss.com/docs/flex-shrink
       */
      shrink: [{
        shrink: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Order
       * @see https://tailwindcss.com/docs/order
       */
      order: [{
        order: [isInteger, "first", "last", "none", isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Grid Template Columns
       * @see https://tailwindcss.com/docs/grid-template-columns
       */
      "grid-cols": [{
        "grid-cols": scaleGridTemplateColsRows()
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start-end": [{
        col: scaleGridColRowStartAndEnd()
      }],
      /**
       * Grid Column Start
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start": [{
        "col-start": scaleGridColRowStartOrEnd()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-end": [{
        "col-end": scaleGridColRowStartOrEnd()
      }],
      /**
       * Grid Template Rows
       * @see https://tailwindcss.com/docs/grid-template-rows
       */
      "grid-rows": [{
        "grid-rows": scaleGridTemplateColsRows()
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start-end": [{
        row: scaleGridColRowStartAndEnd()
      }],
      /**
       * Grid Row Start
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start": [{
        "row-start": scaleGridColRowStartOrEnd()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-end": [{
        "row-end": scaleGridColRowStartOrEnd()
      }],
      /**
       * Grid Auto Flow
       * @see https://tailwindcss.com/docs/grid-auto-flow
       */
      "grid-flow": [{
        "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
      }],
      /**
       * Grid Auto Columns
       * @see https://tailwindcss.com/docs/grid-auto-columns
       */
      "auto-cols": [{
        "auto-cols": scaleGridAutoColsRows()
      }],
      /**
       * Grid Auto Rows
       * @see https://tailwindcss.com/docs/grid-auto-rows
       */
      "auto-rows": [{
        "auto-rows": scaleGridAutoColsRows()
      }],
      /**
       * Gap
       * @see https://tailwindcss.com/docs/gap
       */
      gap: [{
        gap: scaleUnambiguousSpacing()
      }],
      /**
       * Gap X
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-x": [{
        "gap-x": scaleUnambiguousSpacing()
      }],
      /**
       * Gap Y
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-y": [{
        "gap-y": scaleUnambiguousSpacing()
      }],
      /**
       * Justify Content
       * @see https://tailwindcss.com/docs/justify-content
       */
      "justify-content": [{
        justify: [...scaleAlignPrimaryAxis(), "normal"]
      }],
      /**
       * Justify Items
       * @see https://tailwindcss.com/docs/justify-items
       */
      "justify-items": [{
        "justify-items": [...scaleAlignSecondaryAxis(), "normal"]
      }],
      /**
       * Justify Self
       * @see https://tailwindcss.com/docs/justify-self
       */
      "justify-self": [{
        "justify-self": ["auto", ...scaleAlignSecondaryAxis()]
      }],
      /**
       * Align Content
       * @see https://tailwindcss.com/docs/align-content
       */
      "align-content": [{
        content: ["normal", ...scaleAlignPrimaryAxis()]
      }],
      /**
       * Align Items
       * @see https://tailwindcss.com/docs/align-items
       */
      "align-items": [{
        items: [...scaleAlignSecondaryAxis(), {
          baseline: ["", "last"]
        }]
      }],
      /**
       * Align Self
       * @see https://tailwindcss.com/docs/align-self
       */
      "align-self": [{
        self: ["auto", ...scaleAlignSecondaryAxis(), {
          baseline: ["", "last"]
        }]
      }],
      /**
       * Place Content
       * @see https://tailwindcss.com/docs/place-content
       */
      "place-content": [{
        "place-content": scaleAlignPrimaryAxis()
      }],
      /**
       * Place Items
       * @see https://tailwindcss.com/docs/place-items
       */
      "place-items": [{
        "place-items": [...scaleAlignSecondaryAxis(), "baseline"]
      }],
      /**
       * Place Self
       * @see https://tailwindcss.com/docs/place-self
       */
      "place-self": [{
        "place-self": ["auto", ...scaleAlignSecondaryAxis()]
      }],
      // Spacing
      /**
       * Padding
       * @see https://tailwindcss.com/docs/padding
       */
      p: [{
        p: scaleUnambiguousSpacing()
      }],
      /**
       * Padding X
       * @see https://tailwindcss.com/docs/padding
       */
      px: [{
        px: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Y
       * @see https://tailwindcss.com/docs/padding
       */
      py: [{
        py: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Start
       * @see https://tailwindcss.com/docs/padding
       */
      ps: [{
        ps: scaleUnambiguousSpacing()
      }],
      /**
       * Padding End
       * @see https://tailwindcss.com/docs/padding
       */
      pe: [{
        pe: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Top
       * @see https://tailwindcss.com/docs/padding
       */
      pt: [{
        pt: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Right
       * @see https://tailwindcss.com/docs/padding
       */
      pr: [{
        pr: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Bottom
       * @see https://tailwindcss.com/docs/padding
       */
      pb: [{
        pb: scaleUnambiguousSpacing()
      }],
      /**
       * Padding Left
       * @see https://tailwindcss.com/docs/padding
       */
      pl: [{
        pl: scaleUnambiguousSpacing()
      }],
      /**
       * Margin
       * @see https://tailwindcss.com/docs/margin
       */
      m: [{
        m: scaleMargin()
      }],
      /**
       * Margin X
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: scaleMargin()
      }],
      /**
       * Margin Y
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: scaleMargin()
      }],
      /**
       * Margin Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: scaleMargin()
      }],
      /**
       * Margin End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: scaleMargin()
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: scaleMargin()
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: scaleMargin()
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: scaleMargin()
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: scaleMargin()
      }],
      /**
       * Space Between X
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-x": [{
        "space-x": scaleUnambiguousSpacing()
      }],
      /**
       * Space Between X Reverse
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-x-reverse": ["space-x-reverse"],
      /**
       * Space Between Y
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-y": [{
        "space-y": scaleUnambiguousSpacing()
      }],
      /**
       * Space Between Y Reverse
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-y-reverse": ["space-y-reverse"],
      // --------------
      // --- Sizing ---
      // --------------
      /**
       * Size
       * @see https://tailwindcss.com/docs/width#setting-both-width-and-height
       */
      size: [{
        size: scaleSizing()
      }],
      /**
       * Width
       * @see https://tailwindcss.com/docs/width
       */
      w: [{
        w: [themeContainer, "screen", ...scaleSizing()]
      }],
      /**
       * Min-Width
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-w": [{
        "min-w": [
          themeContainer,
          "screen",
          /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          "none",
          ...scaleSizing()
        ]
      }],
      /**
       * Max-Width
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-w": [{
        "max-w": [
          themeContainer,
          "screen",
          "none",
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          "prose",
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          {
            screen: [themeBreakpoint]
          },
          ...scaleSizing()
        ]
      }],
      /**
       * Height
       * @see https://tailwindcss.com/docs/height
       */
      h: [{
        h: ["screen", "lh", ...scaleSizing()]
      }],
      /**
       * Min-Height
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-h": [{
        "min-h": ["screen", "lh", "none", ...scaleSizing()]
      }],
      /**
       * Max-Height
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-h": [{
        "max-h": ["screen", "lh", ...scaleSizing()]
      }],
      // ------------------
      // --- Typography ---
      // ------------------
      /**
       * Font Size
       * @see https://tailwindcss.com/docs/font-size
       */
      "font-size": [{
        text: ["base", themeText, isArbitraryVariableLength, isArbitraryLength]
      }],
      /**
       * Font Smoothing
       * @see https://tailwindcss.com/docs/font-smoothing
       */
      "font-smoothing": ["antialiased", "subpixel-antialiased"],
      /**
       * Font Style
       * @see https://tailwindcss.com/docs/font-style
       */
      "font-style": ["italic", "not-italic"],
      /**
       * Font Weight
       * @see https://tailwindcss.com/docs/font-weight
       */
      "font-weight": [{
        font: [themeFontWeight, isArbitraryVariable, isArbitraryNumber]
      }],
      /**
       * Font Stretch
       * @see https://tailwindcss.com/docs/font-stretch
       */
      "font-stretch": [{
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", isPercent, isArbitraryValue]
      }],
      /**
       * Font Family
       * @see https://tailwindcss.com/docs/font-family
       */
      "font-family": [{
        font: [isArbitraryVariableFamilyName, isArbitraryValue, themeFont]
      }],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-normal": ["normal-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-ordinal": ["ordinal"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-slashed-zero": ["slashed-zero"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-figure": ["lining-nums", "oldstyle-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-spacing": ["proportional-nums", "tabular-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
      /**
       * Letter Spacing
       * @see https://tailwindcss.com/docs/letter-spacing
       */
      tracking: [{
        tracking: [themeTracking, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Line Clamp
       * @see https://tailwindcss.com/docs/line-clamp
       */
      "line-clamp": [{
        "line-clamp": [isNumber, "none", isArbitraryVariable, isArbitraryNumber]
      }],
      /**
       * Line Height
       * @see https://tailwindcss.com/docs/line-height
       */
      leading: [{
        leading: [
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          themeLeading,
          ...scaleUnambiguousSpacing()
        ]
      }],
      /**
       * List Style Image
       * @see https://tailwindcss.com/docs/list-style-image
       */
      "list-image": [{
        "list-image": ["none", isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * List Style Position
       * @see https://tailwindcss.com/docs/list-style-position
       */
      "list-style-position": [{
        list: ["inside", "outside"]
      }],
      /**
       * List Style Type
       * @see https://tailwindcss.com/docs/list-style-type
       */
      "list-style-type": [{
        list: ["disc", "decimal", "none", isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Text Alignment
       * @see https://tailwindcss.com/docs/text-align
       */
      "text-alignment": [{
        text: ["left", "center", "right", "justify", "start", "end"]
      }],
      /**
       * Placeholder Color
       * @deprecated since Tailwind CSS v3.0.0
       * @see https://v3.tailwindcss.com/docs/placeholder-color
       */
      "placeholder-color": [{
        placeholder: scaleColor()
      }],
      /**
       * Text Color
       * @see https://tailwindcss.com/docs/text-color
       */
      "text-color": [{
        text: scaleColor()
      }],
      /**
       * Text Decoration
       * @see https://tailwindcss.com/docs/text-decoration
       */
      "text-decoration": ["underline", "overline", "line-through", "no-underline"],
      /**
       * Text Decoration Style
       * @see https://tailwindcss.com/docs/text-decoration-style
       */
      "text-decoration-style": [{
        decoration: [...scaleLineStyle(), "wavy"]
      }],
      /**
       * Text Decoration Thickness
       * @see https://tailwindcss.com/docs/text-decoration-thickness
       */
      "text-decoration-thickness": [{
        decoration: [isNumber, "from-font", "auto", isArbitraryVariable, isArbitraryLength]
      }],
      /**
       * Text Decoration Color
       * @see https://tailwindcss.com/docs/text-decoration-color
       */
      "text-decoration-color": [{
        decoration: scaleColor()
      }],
      /**
       * Text Underline Offset
       * @see https://tailwindcss.com/docs/text-underline-offset
       */
      "underline-offset": [{
        "underline-offset": [isNumber, "auto", isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Text Transform
       * @see https://tailwindcss.com/docs/text-transform
       */
      "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
      /**
       * Text Overflow
       * @see https://tailwindcss.com/docs/text-overflow
       */
      "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
      /**
       * Text Wrap
       * @see https://tailwindcss.com/docs/text-wrap
       */
      "text-wrap": [{
        text: ["wrap", "nowrap", "balance", "pretty"]
      }],
      /**
       * Text Indent
       * @see https://tailwindcss.com/docs/text-indent
       */
      indent: [{
        indent: scaleUnambiguousSpacing()
      }],
      /**
       * Vertical Alignment
       * @see https://tailwindcss.com/docs/vertical-align
       */
      "vertical-align": [{
        align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Whitespace
       * @see https://tailwindcss.com/docs/whitespace
       */
      whitespace: [{
        whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
      }],
      /**
       * Word Break
       * @see https://tailwindcss.com/docs/word-break
       */
      break: [{
        break: ["normal", "words", "all", "keep"]
      }],
      /**
       * Overflow Wrap
       * @see https://tailwindcss.com/docs/overflow-wrap
       */
      wrap: [{
        wrap: ["break-word", "anywhere", "normal"]
      }],
      /**
       * Hyphens
       * @see https://tailwindcss.com/docs/hyphens
       */
      hyphens: [{
        hyphens: ["none", "manual", "auto"]
      }],
      /**
       * Content
       * @see https://tailwindcss.com/docs/content
       */
      content: [{
        content: ["none", isArbitraryVariable, isArbitraryValue]
      }],
      // -------------------
      // --- Backgrounds ---
      // -------------------
      /**
       * Background Attachment
       * @see https://tailwindcss.com/docs/background-attachment
       */
      "bg-attachment": [{
        bg: ["fixed", "local", "scroll"]
      }],
      /**
       * Background Clip
       * @see https://tailwindcss.com/docs/background-clip
       */
      "bg-clip": [{
        "bg-clip": ["border", "padding", "content", "text"]
      }],
      /**
       * Background Origin
       * @see https://tailwindcss.com/docs/background-origin
       */
      "bg-origin": [{
        "bg-origin": ["border", "padding", "content"]
      }],
      /**
       * Background Position
       * @see https://tailwindcss.com/docs/background-position
       */
      "bg-position": [{
        bg: scaleBgPosition()
      }],
      /**
       * Background Repeat
       * @see https://tailwindcss.com/docs/background-repeat
       */
      "bg-repeat": [{
        bg: scaleBgRepeat()
      }],
      /**
       * Background Size
       * @see https://tailwindcss.com/docs/background-size
       */
      "bg-size": [{
        bg: scaleBgSize()
      }],
      /**
       * Background Image
       * @see https://tailwindcss.com/docs/background-image
       */
      "bg-image": [{
        bg: ["none", {
          linear: [{
            to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
          }, isInteger, isArbitraryVariable, isArbitraryValue],
          radial: ["", isArbitraryVariable, isArbitraryValue],
          conic: [isInteger, isArbitraryVariable, isArbitraryValue]
        }, isArbitraryVariableImage, isArbitraryImage]
      }],
      /**
       * Background Color
       * @see https://tailwindcss.com/docs/background-color
       */
      "bg-color": [{
        bg: scaleColor()
      }],
      /**
       * Gradient Color Stops From Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-from-pos": [{
        from: scaleGradientStopPosition()
      }],
      /**
       * Gradient Color Stops Via Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via-pos": [{
        via: scaleGradientStopPosition()
      }],
      /**
       * Gradient Color Stops To Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to-pos": [{
        to: scaleGradientStopPosition()
      }],
      /**
       * Gradient Color Stops From
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-from": [{
        from: scaleColor()
      }],
      /**
       * Gradient Color Stops Via
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via": [{
        via: scaleColor()
      }],
      /**
       * Gradient Color Stops To
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to": [{
        to: scaleColor()
      }],
      // ---------------
      // --- Borders ---
      // ---------------
      /**
       * Border Radius
       * @see https://tailwindcss.com/docs/border-radius
       */
      rounded: [{
        rounded: scaleRadius()
      }],
      /**
       * Border Radius Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-s": [{
        "rounded-s": scaleRadius()
      }],
      /**
       * Border Radius End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-e": [{
        "rounded-e": scaleRadius()
      }],
      /**
       * Border Radius Top
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-t": [{
        "rounded-t": scaleRadius()
      }],
      /**
       * Border Radius Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-r": [{
        "rounded-r": scaleRadius()
      }],
      /**
       * Border Radius Bottom
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-b": [{
        "rounded-b": scaleRadius()
      }],
      /**
       * Border Radius Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-l": [{
        "rounded-l": scaleRadius()
      }],
      /**
       * Border Radius Start Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ss": [{
        "rounded-ss": scaleRadius()
      }],
      /**
       * Border Radius Start End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-se": [{
        "rounded-se": scaleRadius()
      }],
      /**
       * Border Radius End End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ee": [{
        "rounded-ee": scaleRadius()
      }],
      /**
       * Border Radius End Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-es": [{
        "rounded-es": scaleRadius()
      }],
      /**
       * Border Radius Top Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tl": [{
        "rounded-tl": scaleRadius()
      }],
      /**
       * Border Radius Top Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tr": [{
        "rounded-tr": scaleRadius()
      }],
      /**
       * Border Radius Bottom Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-br": [{
        "rounded-br": scaleRadius()
      }],
      /**
       * Border Radius Bottom Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-bl": [{
        "rounded-bl": scaleRadius()
      }],
      /**
       * Border Width
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w": [{
        border: scaleBorderWidth()
      }],
      /**
       * Border Width X
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-x": [{
        "border-x": scaleBorderWidth()
      }],
      /**
       * Border Width Y
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-y": [{
        "border-y": scaleBorderWidth()
      }],
      /**
       * Border Width Start
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-s": [{
        "border-s": scaleBorderWidth()
      }],
      /**
       * Border Width End
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-e": [{
        "border-e": scaleBorderWidth()
      }],
      /**
       * Border Width Top
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-t": [{
        "border-t": scaleBorderWidth()
      }],
      /**
       * Border Width Right
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-r": [{
        "border-r": scaleBorderWidth()
      }],
      /**
       * Border Width Bottom
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-b": [{
        "border-b": scaleBorderWidth()
      }],
      /**
       * Border Width Left
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-l": [{
        "border-l": scaleBorderWidth()
      }],
      /**
       * Divide Width X
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-x": [{
        "divide-x": scaleBorderWidth()
      }],
      /**
       * Divide Width X Reverse
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-x-reverse": ["divide-x-reverse"],
      /**
       * Divide Width Y
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-y": [{
        "divide-y": scaleBorderWidth()
      }],
      /**
       * Divide Width Y Reverse
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-y-reverse": ["divide-y-reverse"],
      /**
       * Border Style
       * @see https://tailwindcss.com/docs/border-style
       */
      "border-style": [{
        border: [...scaleLineStyle(), "hidden", "none"]
      }],
      /**
       * Divide Style
       * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
       */
      "divide-style": [{
        divide: [...scaleLineStyle(), "hidden", "none"]
      }],
      /**
       * Border Color
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color": [{
        border: scaleColor()
      }],
      /**
       * Border Color X
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-x": [{
        "border-x": scaleColor()
      }],
      /**
       * Border Color Y
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-y": [{
        "border-y": scaleColor()
      }],
      /**
       * Border Color S
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-s": [{
        "border-s": scaleColor()
      }],
      /**
       * Border Color E
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-e": [{
        "border-e": scaleColor()
      }],
      /**
       * Border Color Top
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-t": [{
        "border-t": scaleColor()
      }],
      /**
       * Border Color Right
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-r": [{
        "border-r": scaleColor()
      }],
      /**
       * Border Color Bottom
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-b": [{
        "border-b": scaleColor()
      }],
      /**
       * Border Color Left
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-l": [{
        "border-l": scaleColor()
      }],
      /**
       * Divide Color
       * @see https://tailwindcss.com/docs/divide-color
       */
      "divide-color": [{
        divide: scaleColor()
      }],
      /**
       * Outline Style
       * @see https://tailwindcss.com/docs/outline-style
       */
      "outline-style": [{
        outline: [...scaleLineStyle(), "none", "hidden"]
      }],
      /**
       * Outline Offset
       * @see https://tailwindcss.com/docs/outline-offset
       */
      "outline-offset": [{
        "outline-offset": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Outline Width
       * @see https://tailwindcss.com/docs/outline-width
       */
      "outline-w": [{
        outline: ["", isNumber, isArbitraryVariableLength, isArbitraryLength]
      }],
      /**
       * Outline Color
       * @see https://tailwindcss.com/docs/outline-color
       */
      "outline-color": [{
        outline: scaleColor()
      }],
      // ---------------
      // --- Effects ---
      // ---------------
      /**
       * Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow
       */
      shadow: [{
        shadow: [
          // Deprecated since Tailwind CSS v4.0.0
          "",
          "none",
          themeShadow,
          isArbitraryVariableShadow,
          isArbitraryShadow
        ]
      }],
      /**
       * Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
       */
      "shadow-color": [{
        shadow: scaleColor()
      }],
      /**
       * Inset Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
       */
      "inset-shadow": [{
        "inset-shadow": ["none", themeInsetShadow, isArbitraryVariableShadow, isArbitraryShadow]
      }],
      /**
       * Inset Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
       */
      "inset-shadow-color": [{
        "inset-shadow": scaleColor()
      }],
      /**
       * Ring Width
       * @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
       */
      "ring-w": [{
        ring: scaleBorderWidth()
      }],
      /**
       * Ring Width Inset
       * @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-w-inset": ["ring-inset"],
      /**
       * Ring Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
       */
      "ring-color": [{
        ring: scaleColor()
      }],
      /**
       * Ring Offset Width
       * @see https://v3.tailwindcss.com/docs/ring-offset-width
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-offset-w": [{
        "ring-offset": [isNumber, isArbitraryLength]
      }],
      /**
       * Ring Offset Color
       * @see https://v3.tailwindcss.com/docs/ring-offset-color
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-offset-color": [{
        "ring-offset": scaleColor()
      }],
      /**
       * Inset Ring Width
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
       */
      "inset-ring-w": [{
        "inset-ring": scaleBorderWidth()
      }],
      /**
       * Inset Ring Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
       */
      "inset-ring-color": [{
        "inset-ring": scaleColor()
      }],
      /**
       * Text Shadow
       * @see https://tailwindcss.com/docs/text-shadow
       */
      "text-shadow": [{
        "text-shadow": ["none", themeTextShadow, isArbitraryVariableShadow, isArbitraryShadow]
      }],
      /**
       * Text Shadow Color
       * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
       */
      "text-shadow-color": [{
        "text-shadow": scaleColor()
      }],
      /**
       * Opacity
       * @see https://tailwindcss.com/docs/opacity
       */
      opacity: [{
        opacity: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Mix Blend Mode
       * @see https://tailwindcss.com/docs/mix-blend-mode
       */
      "mix-blend": [{
        "mix-blend": [...scaleBlendMode(), "plus-darker", "plus-lighter"]
      }],
      /**
       * Background Blend Mode
       * @see https://tailwindcss.com/docs/background-blend-mode
       */
      "bg-blend": [{
        "bg-blend": scaleBlendMode()
      }],
      /**
       * Mask Clip
       * @see https://tailwindcss.com/docs/mask-clip
       */
      "mask-clip": [{
        "mask-clip": ["border", "padding", "content", "fill", "stroke", "view"]
      }, "mask-no-clip"],
      /**
       * Mask Composite
       * @see https://tailwindcss.com/docs/mask-composite
       */
      "mask-composite": [{
        mask: ["add", "subtract", "intersect", "exclude"]
      }],
      /**
       * Mask Image
       * @see https://tailwindcss.com/docs/mask-image
       */
      "mask-image-linear-pos": [{
        "mask-linear": [isNumber]
      }],
      "mask-image-linear-from-pos": [{
        "mask-linear-from": scaleMaskImagePosition()
      }],
      "mask-image-linear-to-pos": [{
        "mask-linear-to": scaleMaskImagePosition()
      }],
      "mask-image-linear-from-color": [{
        "mask-linear-from": scaleColor()
      }],
      "mask-image-linear-to-color": [{
        "mask-linear-to": scaleColor()
      }],
      "mask-image-t-from-pos": [{
        "mask-t-from": scaleMaskImagePosition()
      }],
      "mask-image-t-to-pos": [{
        "mask-t-to": scaleMaskImagePosition()
      }],
      "mask-image-t-from-color": [{
        "mask-t-from": scaleColor()
      }],
      "mask-image-t-to-color": [{
        "mask-t-to": scaleColor()
      }],
      "mask-image-r-from-pos": [{
        "mask-r-from": scaleMaskImagePosition()
      }],
      "mask-image-r-to-pos": [{
        "mask-r-to": scaleMaskImagePosition()
      }],
      "mask-image-r-from-color": [{
        "mask-r-from": scaleColor()
      }],
      "mask-image-r-to-color": [{
        "mask-r-to": scaleColor()
      }],
      "mask-image-b-from-pos": [{
        "mask-b-from": scaleMaskImagePosition()
      }],
      "mask-image-b-to-pos": [{
        "mask-b-to": scaleMaskImagePosition()
      }],
      "mask-image-b-from-color": [{
        "mask-b-from": scaleColor()
      }],
      "mask-image-b-to-color": [{
        "mask-b-to": scaleColor()
      }],
      "mask-image-l-from-pos": [{
        "mask-l-from": scaleMaskImagePosition()
      }],
      "mask-image-l-to-pos": [{
        "mask-l-to": scaleMaskImagePosition()
      }],
      "mask-image-l-from-color": [{
        "mask-l-from": scaleColor()
      }],
      "mask-image-l-to-color": [{
        "mask-l-to": scaleColor()
      }],
      "mask-image-x-from-pos": [{
        "mask-x-from": scaleMaskImagePosition()
      }],
      "mask-image-x-to-pos": [{
        "mask-x-to": scaleMaskImagePosition()
      }],
      "mask-image-x-from-color": [{
        "mask-x-from": scaleColor()
      }],
      "mask-image-x-to-color": [{
        "mask-x-to": scaleColor()
      }],
      "mask-image-y-from-pos": [{
        "mask-y-from": scaleMaskImagePosition()
      }],
      "mask-image-y-to-pos": [{
        "mask-y-to": scaleMaskImagePosition()
      }],
      "mask-image-y-from-color": [{
        "mask-y-from": scaleColor()
      }],
      "mask-image-y-to-color": [{
        "mask-y-to": scaleColor()
      }],
      "mask-image-radial": [{
        "mask-radial": [isArbitraryVariable, isArbitraryValue]
      }],
      "mask-image-radial-from-pos": [{
        "mask-radial-from": scaleMaskImagePosition()
      }],
      "mask-image-radial-to-pos": [{
        "mask-radial-to": scaleMaskImagePosition()
      }],
      "mask-image-radial-from-color": [{
        "mask-radial-from": scaleColor()
      }],
      "mask-image-radial-to-color": [{
        "mask-radial-to": scaleColor()
      }],
      "mask-image-radial-shape": [{
        "mask-radial": ["circle", "ellipse"]
      }],
      "mask-image-radial-size": [{
        "mask-radial": [{
          closest: ["side", "corner"],
          farthest: ["side", "corner"]
        }]
      }],
      "mask-image-radial-pos": [{
        "mask-radial-at": scalePosition()
      }],
      "mask-image-conic-pos": [{
        "mask-conic": [isNumber]
      }],
      "mask-image-conic-from-pos": [{
        "mask-conic-from": scaleMaskImagePosition()
      }],
      "mask-image-conic-to-pos": [{
        "mask-conic-to": scaleMaskImagePosition()
      }],
      "mask-image-conic-from-color": [{
        "mask-conic-from": scaleColor()
      }],
      "mask-image-conic-to-color": [{
        "mask-conic-to": scaleColor()
      }],
      /**
       * Mask Mode
       * @see https://tailwindcss.com/docs/mask-mode
       */
      "mask-mode": [{
        mask: ["alpha", "luminance", "match"]
      }],
      /**
       * Mask Origin
       * @see https://tailwindcss.com/docs/mask-origin
       */
      "mask-origin": [{
        "mask-origin": ["border", "padding", "content", "fill", "stroke", "view"]
      }],
      /**
       * Mask Position
       * @see https://tailwindcss.com/docs/mask-position
       */
      "mask-position": [{
        mask: scaleBgPosition()
      }],
      /**
       * Mask Repeat
       * @see https://tailwindcss.com/docs/mask-repeat
       */
      "mask-repeat": [{
        mask: scaleBgRepeat()
      }],
      /**
       * Mask Size
       * @see https://tailwindcss.com/docs/mask-size
       */
      "mask-size": [{
        mask: scaleBgSize()
      }],
      /**
       * Mask Type
       * @see https://tailwindcss.com/docs/mask-type
       */
      "mask-type": [{
        "mask-type": ["alpha", "luminance"]
      }],
      /**
       * Mask Image
       * @see https://tailwindcss.com/docs/mask-image
       */
      "mask-image": [{
        mask: ["none", isArbitraryVariable, isArbitraryValue]
      }],
      // ---------------
      // --- Filters ---
      // ---------------
      /**
       * Filter
       * @see https://tailwindcss.com/docs/filter
       */
      filter: [{
        filter: [
          // Deprecated since Tailwind CSS v3.0.0
          "",
          "none",
          isArbitraryVariable,
          isArbitraryValue
        ]
      }],
      /**
       * Blur
       * @see https://tailwindcss.com/docs/blur
       */
      blur: [{
        blur: scaleBlur()
      }],
      /**
       * Brightness
       * @see https://tailwindcss.com/docs/brightness
       */
      brightness: [{
        brightness: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Contrast
       * @see https://tailwindcss.com/docs/contrast
       */
      contrast: [{
        contrast: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Drop Shadow
       * @see https://tailwindcss.com/docs/drop-shadow
       */
      "drop-shadow": [{
        "drop-shadow": [
          // Deprecated since Tailwind CSS v4.0.0
          "",
          "none",
          themeDropShadow,
          isArbitraryVariableShadow,
          isArbitraryShadow
        ]
      }],
      /**
       * Drop Shadow Color
       * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
       */
      "drop-shadow-color": [{
        "drop-shadow": scaleColor()
      }],
      /**
       * Grayscale
       * @see https://tailwindcss.com/docs/grayscale
       */
      grayscale: [{
        grayscale: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Hue Rotate
       * @see https://tailwindcss.com/docs/hue-rotate
       */
      "hue-rotate": [{
        "hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Invert
       * @see https://tailwindcss.com/docs/invert
       */
      invert: [{
        invert: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Saturate
       * @see https://tailwindcss.com/docs/saturate
       */
      saturate: [{
        saturate: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Sepia
       * @see https://tailwindcss.com/docs/sepia
       */
      sepia: [{
        sepia: ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Filter
       * @see https://tailwindcss.com/docs/backdrop-filter
       */
      "backdrop-filter": [{
        "backdrop-filter": [
          // Deprecated since Tailwind CSS v3.0.0
          "",
          "none",
          isArbitraryVariable,
          isArbitraryValue
        ]
      }],
      /**
       * Backdrop Blur
       * @see https://tailwindcss.com/docs/backdrop-blur
       */
      "backdrop-blur": [{
        "backdrop-blur": scaleBlur()
      }],
      /**
       * Backdrop Brightness
       * @see https://tailwindcss.com/docs/backdrop-brightness
       */
      "backdrop-brightness": [{
        "backdrop-brightness": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Contrast
       * @see https://tailwindcss.com/docs/backdrop-contrast
       */
      "backdrop-contrast": [{
        "backdrop-contrast": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Grayscale
       * @see https://tailwindcss.com/docs/backdrop-grayscale
       */
      "backdrop-grayscale": [{
        "backdrop-grayscale": ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Hue Rotate
       * @see https://tailwindcss.com/docs/backdrop-hue-rotate
       */
      "backdrop-hue-rotate": [{
        "backdrop-hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Invert
       * @see https://tailwindcss.com/docs/backdrop-invert
       */
      "backdrop-invert": [{
        "backdrop-invert": ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Opacity
       * @see https://tailwindcss.com/docs/backdrop-opacity
       */
      "backdrop-opacity": [{
        "backdrop-opacity": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Saturate
       * @see https://tailwindcss.com/docs/backdrop-saturate
       */
      "backdrop-saturate": [{
        "backdrop-saturate": [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Backdrop Sepia
       * @see https://tailwindcss.com/docs/backdrop-sepia
       */
      "backdrop-sepia": [{
        "backdrop-sepia": ["", isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      // --------------
      // --- Tables ---
      // --------------
      /**
       * Border Collapse
       * @see https://tailwindcss.com/docs/border-collapse
       */
      "border-collapse": [{
        border: ["collapse", "separate"]
      }],
      /**
       * Border Spacing
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing": [{
        "border-spacing": scaleUnambiguousSpacing()
      }],
      /**
       * Border Spacing X
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-x": [{
        "border-spacing-x": scaleUnambiguousSpacing()
      }],
      /**
       * Border Spacing Y
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-y": [{
        "border-spacing-y": scaleUnambiguousSpacing()
      }],
      /**
       * Table Layout
       * @see https://tailwindcss.com/docs/table-layout
       */
      "table-layout": [{
        table: ["auto", "fixed"]
      }],
      /**
       * Caption Side
       * @see https://tailwindcss.com/docs/caption-side
       */
      caption: [{
        caption: ["top", "bottom"]
      }],
      // ---------------------------------
      // --- Transitions and Animation ---
      // ---------------------------------
      /**
       * Transition Property
       * @see https://tailwindcss.com/docs/transition-property
       */
      transition: [{
        transition: ["", "all", "colors", "opacity", "shadow", "transform", "none", isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Transition Behavior
       * @see https://tailwindcss.com/docs/transition-behavior
       */
      "transition-behavior": [{
        transition: ["normal", "discrete"]
      }],
      /**
       * Transition Duration
       * @see https://tailwindcss.com/docs/transition-duration
       */
      duration: [{
        duration: [isNumber, "initial", isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Transition Timing Function
       * @see https://tailwindcss.com/docs/transition-timing-function
       */
      ease: [{
        ease: ["linear", "initial", themeEase, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Transition Delay
       * @see https://tailwindcss.com/docs/transition-delay
       */
      delay: [{
        delay: [isNumber, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Animation
       * @see https://tailwindcss.com/docs/animation
       */
      animate: [{
        animate: ["none", themeAnimate, isArbitraryVariable, isArbitraryValue]
      }],
      // ------------------
      // --- Transforms ---
      // ------------------
      /**
       * Backface Visibility
       * @see https://tailwindcss.com/docs/backface-visibility
       */
      backface: [{
        backface: ["hidden", "visible"]
      }],
      /**
       * Perspective
       * @see https://tailwindcss.com/docs/perspective
       */
      perspective: [{
        perspective: [themePerspective, isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Perspective Origin
       * @see https://tailwindcss.com/docs/perspective-origin
       */
      "perspective-origin": [{
        "perspective-origin": scalePositionWithArbitrary()
      }],
      /**
       * Rotate
       * @see https://tailwindcss.com/docs/rotate
       */
      rotate: [{
        rotate: scaleRotate()
      }],
      /**
       * Rotate X
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-x": [{
        "rotate-x": scaleRotate()
      }],
      /**
       * Rotate Y
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-y": [{
        "rotate-y": scaleRotate()
      }],
      /**
       * Rotate Z
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-z": [{
        "rotate-z": scaleRotate()
      }],
      /**
       * Scale
       * @see https://tailwindcss.com/docs/scale
       */
      scale: [{
        scale: scaleScale()
      }],
      /**
       * Scale X
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-x": [{
        "scale-x": scaleScale()
      }],
      /**
       * Scale Y
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-y": [{
        "scale-y": scaleScale()
      }],
      /**
       * Scale Z
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-z": [{
        "scale-z": scaleScale()
      }],
      /**
       * Scale 3D
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-3d": ["scale-3d"],
      /**
       * Skew
       * @see https://tailwindcss.com/docs/skew
       */
      skew: [{
        skew: scaleSkew()
      }],
      /**
       * Skew X
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-x": [{
        "skew-x": scaleSkew()
      }],
      /**
       * Skew Y
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-y": [{
        "skew-y": scaleSkew()
      }],
      /**
       * Transform
       * @see https://tailwindcss.com/docs/transform
       */
      transform: [{
        transform: [isArbitraryVariable, isArbitraryValue, "", "none", "gpu", "cpu"]
      }],
      /**
       * Transform Origin
       * @see https://tailwindcss.com/docs/transform-origin
       */
      "transform-origin": [{
        origin: scalePositionWithArbitrary()
      }],
      /**
       * Transform Style
       * @see https://tailwindcss.com/docs/transform-style
       */
      "transform-style": [{
        transform: ["3d", "flat"]
      }],
      /**
       * Translate
       * @see https://tailwindcss.com/docs/translate
       */
      translate: [{
        translate: scaleTranslate()
      }],
      /**
       * Translate X
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-x": [{
        "translate-x": scaleTranslate()
      }],
      /**
       * Translate Y
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-y": [{
        "translate-y": scaleTranslate()
      }],
      /**
       * Translate Z
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-z": [{
        "translate-z": scaleTranslate()
      }],
      /**
       * Translate None
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-none": ["translate-none"],
      // ---------------------
      // --- Interactivity ---
      // ---------------------
      /**
       * Accent Color
       * @see https://tailwindcss.com/docs/accent-color
       */
      accent: [{
        accent: scaleColor()
      }],
      /**
       * Appearance
       * @see https://tailwindcss.com/docs/appearance
       */
      appearance: [{
        appearance: ["none", "auto"]
      }],
      /**
       * Caret Color
       * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
       */
      "caret-color": [{
        caret: scaleColor()
      }],
      /**
       * Color Scheme
       * @see https://tailwindcss.com/docs/color-scheme
       */
      "color-scheme": [{
        scheme: ["normal", "dark", "light", "light-dark", "only-dark", "only-light"]
      }],
      /**
       * Cursor
       * @see https://tailwindcss.com/docs/cursor
       */
      cursor: [{
        cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", isArbitraryVariable, isArbitraryValue]
      }],
      /**
       * Field Sizing
       * @see https://tailwindcss.com/docs/field-sizing
       */
      "field-sizing": [{
        "field-sizing": ["fixed", "content"]
      }],
      /**
       * Pointer Events
       * @see https://tailwindcss.com/docs/pointer-events
       */
      "pointer-events": [{
        "pointer-events": ["auto", "none"]
      }],
      /**
       * Resize
       * @see https://tailwindcss.com/docs/resize
       */
      resize: [{
        resize: ["none", "", "y", "x"]
      }],
      /**
       * Scroll Behavior
       * @see https://tailwindcss.com/docs/scroll-behavior
       */
      "scroll-behavior": [{
        scroll: ["auto", "smooth"]
      }],
      /**
       * Scroll Margin
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-m": [{
        "scroll-m": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin X
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mx": [{
        "scroll-mx": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Y
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-my": [{
        "scroll-my": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ms": [{
        "scroll-ms": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-me": [{
        "scroll-me": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Top
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mt": [{
        "scroll-mt": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Right
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mr": [{
        "scroll-mr": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Bottom
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mb": [{
        "scroll-mb": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Margin Left
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ml": [{
        "scroll-ml": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-p": [{
        "scroll-p": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding X
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-px": [{
        "scroll-px": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Y
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-py": [{
        "scroll-py": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-ps": [{
        "scroll-ps": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pe": [{
        "scroll-pe": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Top
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pt": [{
        "scroll-pt": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Right
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pr": [{
        "scroll-pr": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Bottom
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pb": [{
        "scroll-pb": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Padding Left
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pl": [{
        "scroll-pl": scaleUnambiguousSpacing()
      }],
      /**
       * Scroll Snap Align
       * @see https://tailwindcss.com/docs/scroll-snap-align
       */
      "snap-align": [{
        snap: ["start", "end", "center", "align-none"]
      }],
      /**
       * Scroll Snap Stop
       * @see https://tailwindcss.com/docs/scroll-snap-stop
       */
      "snap-stop": [{
        snap: ["normal", "always"]
      }],
      /**
       * Scroll Snap Type
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      "snap-type": [{
        snap: ["none", "x", "y", "both"]
      }],
      /**
       * Scroll Snap Type Strictness
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      "snap-strictness": [{
        snap: ["mandatory", "proximity"]
      }],
      /**
       * Touch Action
       * @see https://tailwindcss.com/docs/touch-action
       */
      touch: [{
        touch: ["auto", "none", "manipulation"]
      }],
      /**
       * Touch Action X
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-x": [{
        "touch-pan": ["x", "left", "right"]
      }],
      /**
       * Touch Action Y
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-y": [{
        "touch-pan": ["y", "up", "down"]
      }],
      /**
       * Touch Action Pinch Zoom
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-pz": ["touch-pinch-zoom"],
      /**
       * User Select
       * @see https://tailwindcss.com/docs/user-select
       */
      select: [{
        select: ["none", "text", "all", "auto"]
      }],
      /**
       * Will Change
       * @see https://tailwindcss.com/docs/will-change
       */
      "will-change": [{
        "will-change": ["auto", "scroll", "contents", "transform", isArbitraryVariable, isArbitraryValue]
      }],
      // -----------
      // --- SVG ---
      // -----------
      /**
       * Fill
       * @see https://tailwindcss.com/docs/fill
       */
      fill: [{
        fill: ["none", ...scaleColor()]
      }],
      /**
       * Stroke Width
       * @see https://tailwindcss.com/docs/stroke-width
       */
      "stroke-w": [{
        stroke: [isNumber, isArbitraryVariableLength, isArbitraryLength, isArbitraryNumber]
      }],
      /**
       * Stroke
       * @see https://tailwindcss.com/docs/stroke
       */
      stroke: [{
        stroke: ["none", ...scaleColor()]
      }],
      // ---------------------
      // --- Accessibility ---
      // ---------------------
      /**
       * Forced Color Adjust
       * @see https://tailwindcss.com/docs/forced-color-adjust
       */
      "forced-color-adjust": [{
        "forced-color-adjust": ["auto", "none"]
      }]
    },
    conflictingClassGroups: {
      overflow: ["overflow-x", "overflow-y"],
      overscroll: ["overscroll-x", "overscroll-y"],
      inset: ["inset-x", "inset-y", "start", "end", "top", "right", "bottom", "left"],
      "inset-x": ["right", "left"],
      "inset-y": ["top", "bottom"],
      flex: ["basis", "grow", "shrink"],
      gap: ["gap-x", "gap-y"],
      p: ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"],
      px: ["pr", "pl"],
      py: ["pt", "pb"],
      m: ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"],
      mx: ["mr", "ml"],
      my: ["mt", "mb"],
      size: ["w", "h"],
      "font-size": ["leading"],
      "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
      "fvn-ordinal": ["fvn-normal"],
      "fvn-slashed-zero": ["fvn-normal"],
      "fvn-figure": ["fvn-normal"],
      "fvn-spacing": ["fvn-normal"],
      "fvn-fraction": ["fvn-normal"],
      "line-clamp": ["display", "overflow"],
      rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
      "rounded-s": ["rounded-ss", "rounded-es"],
      "rounded-e": ["rounded-se", "rounded-ee"],
      "rounded-t": ["rounded-tl", "rounded-tr"],
      "rounded-r": ["rounded-tr", "rounded-br"],
      "rounded-b": ["rounded-br", "rounded-bl"],
      "rounded-l": ["rounded-tl", "rounded-bl"],
      "border-spacing": ["border-spacing-x", "border-spacing-y"],
      "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
      "border-w-x": ["border-w-r", "border-w-l"],
      "border-w-y": ["border-w-t", "border-w-b"],
      "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
      "border-color-x": ["border-color-r", "border-color-l"],
      "border-color-y": ["border-color-t", "border-color-b"],
      translate: ["translate-x", "translate-y", "translate-none"],
      "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
      "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
      "scroll-mx": ["scroll-mr", "scroll-ml"],
      "scroll-my": ["scroll-mt", "scroll-mb"],
      "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
      "scroll-px": ["scroll-pr", "scroll-pl"],
      "scroll-py": ["scroll-pt", "scroll-pb"],
      touch: ["touch-x", "touch-y", "touch-pz"],
      "touch-x": ["touch"],
      "touch-y": ["touch"],
      "touch-pz": ["touch"]
    },
    conflictingClassGroupModifiers: {
      "font-size": ["leading"]
    },
    orderSensitiveModifiers: ["*", "**", "after", "backdrop", "before", "details-content", "file", "first-letter", "first-line", "marker", "placeholder", "selection"]
  };
};
var twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);

// src/lib/utils.js
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
var isIframe = window.self !== window.top;

// src/components/ui/input.jsx
import { jsx } from "react/jsx-runtime";
var Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return /* @__PURE__ */ jsx(
    "input",
    {
      type,
      className: cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      ),
      ref,
      ...props
    }
  );
});
Input.displayName = "Input";

// src/components/estimator/foundation/foundationFtInEntry.js
var FT_MARKS = /['′’‘`´]/g;
var IN_MARKS = /["″”]/g;
var DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
var dimensionNumberToken = (text) => {
  const t = String(text).trim();
  if (t === "") return null;
  if (DECIMAL.test(t)) {
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }
  const frac = t.match(/^(\d+(?:\.\d*)?|\.\d+)\s*\/\s*(\d+(?:\.\d*)?|\.\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!Number.isFinite(den) || den === 0) return null;
    const v = Number(frac[1]) / den;
    return Number.isFinite(v) ? v : null;
  }
  const mixed = t.match(/^(\d+(?:\.\d*)?|\.\d+)\s+(\d+(?:\.\d*)?|\.\d+)\s*\/\s*(\d+(?:\.\d*)?|\.\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!Number.isFinite(den) || den === 0) return null;
    const v = Number(mixed[1]) + Number(mixed[2]) / den;
    return Number.isFinite(v) ? v : null;
  }
  return null;
};
var dashPair = (body) => {
  const i = body.indexOf("-");
  if (i < 0) return null;
  const left = body.slice(0, i);
  const right = body.slice(i + 1);
  if (left === "" || right === "" || right.includes("-")) return null;
  const a = dimensionNumberToken(left);
  const b = dimensionNumberToken(right);
  if (a === null || b === null) return null;
  return right.includes("/") ? [0, a + b] : [a, b];
};
var spacePair = (body) => {
  const parts = body.split(" ").filter((p) => p !== "");
  if (parts.length !== 2 || parts[1].includes("/")) return null;
  const a = dimensionNumberToken(parts[0]);
  const b = dimensionNumberToken(parts[1]);
  return a === null || b === null ? null : [a, b];
};
function parseFoundationDimension(text) {
  if (typeof text === "number") {
    return Number.isFinite(text) ? { ok: true, inches: text } : { ok: false, reason: "not_finite" };
  }
  if (typeof text !== "string") return { ok: false, reason: "not_text" };
  let s = text.trim();
  if (s === "") return { ok: false, reason: "blank" };
  s = s.replace(FT_MARKS, "'").replace(IN_MARKS, '"').replace(/\s+/g, " ");
  let sign = 1;
  const leading = s.match(/^[+-]\s*/);
  if (leading) {
    if (leading[0][0] === "-") sign = -1;
    s = s.slice(leading[0].length);
  }
  if (s === "") return { ok: false, reason: "blank" };
  const total = (feet, inches) => {
    const v = sign * (feet * 12 + inches);
    return Number.isFinite(v) ? { ok: true, inches: v } : { ok: false, reason: "not_finite" };
  };
  if (s.includes("'")) {
    const parts = s.split("'");
    if (parts.length !== 2) return { ok: false, reason: "bad_marks" };
    const feet = dimensionNumberToken(parts[0]);
    if (feet === null) return { ok: false, reason: "feet" };
    let rest = parts[1].trim();
    const separator = rest.match(/^[+-]\s*/);
    if (separator) rest = rest.slice(separator[0].length).trim();
    if (rest.endsWith('"')) rest = rest.slice(0, -1).trim();
    if (rest.includes('"') || rest.includes("'")) return { ok: false, reason: "bad_marks" };
    const inches = rest === "" ? 0 : dimensionNumberToken(rest);
    if (inches === null) return { ok: false, reason: "inches" };
    return total(feet, inches);
  }
  if (s.includes('"')) {
    if (!s.endsWith('"')) return { ok: false, reason: "bad_marks" };
    const body = s.slice(0, -1).trim();
    if (body === "" || body.includes('"') || body.includes("'")) {
      return { ok: false, reason: "bad_marks" };
    }
    const direct = dimensionNumberToken(body);
    if (direct !== null) return { ok: true, inches: sign * direct };
    const pair = dashPair(body) ?? spacePair(body);
    if (pair) return total(pair[0], pair[1]);
    return { ok: false, reason: "inches" };
  }
  const tokens = s.split(" ");
  if (tokens.length === 1) {
    const v = dimensionNumberToken(tokens[0]);
    return v === null ? { ok: false, reason: "inches" } : { ok: true, inches: sign * v };
  }
  if (tokens.length === 2) {
    if (tokens[1].includes("/")) {
      const v = dimensionNumberToken(`${tokens[0]} ${tokens[1]}`);
      return v === null ? { ok: false, reason: "inches" } : { ok: true, inches: sign * v };
    }
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(tokens[1]);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  if (tokens.length === 3) {
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(`${tokens[1]} ${tokens[2]}`);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  return { ok: false, reason: "tokens" };
}
function formatFoundationDimension(inches) {
  if (!Number.isFinite(inches)) return "";
  const sign = inches < 0 ? "-" : "";
  const magnitude = Math.abs(inches);
  const feet = Math.floor(magnitude / 12);
  const rest = Math.round((magnitude - feet * 12) * 1e4) / 1e4;
  if (feet === 0) return `${sign}${rest}"`;
  if (rest === 0) return `${sign}${feet}'`;
  return `${sign}${feet}' ${rest}"`;
}

// src/components/estimator/foundation/FoundationLayoutCanvas.jsx
import { Fragment, jsx as jsx2, jsxs } from "react/jsx-runtime";
var HANDLE_CURSORS = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize"
};
var HANDLE_POSITION = {
  nw: { left: "-4px", top: "-4px" },
  n: { left: "calc(50% - 4px)", top: "-4px" },
  ne: { right: "-4px", top: "-4px" },
  e: { right: "-4px", top: "calc(50% - 4px)" },
  se: { right: "-4px", bottom: "-4px" },
  s: { left: "calc(50% - 4px)", bottom: "-4px" },
  sw: { left: "-4px", bottom: "-4px" },
  w: { left: "-4px", top: "calc(50% - 4px)" }
};
var ALIGN_LABELS = {
  left: "Align left edges",
  centerX: "Align horizontal centers",
  right: "Align right edges",
  top: "Align top edges",
  centerZ: "Align vertical centers",
  bottom: "Align bottom edges"
};
var ALIGN_TEXT = { left: "\u25E7", centerX: "\u2194", right: "\u25E8", top: "\u2B12", centerZ: "\u2195", bottom: "\u2B13" };
var REPARENT_REASON_TEXT = {
  "read-only": "The layout is read-only.",
  "unresolved": "That object could not be resolved.",
  "locked": "The object is locked.",
  "kind-not-reparentable": "Only poles, wall caps, and cabinets can be mounted.",
  "legacy-parent-unresolved": "Its mount is stored in legacy form \u2014 save once to normalize before remounting.",
  "target-not-found": "Mount target not found.",
  "target-not-addressable": "That target can't hold a mount (no component id \u2014 save once to normalize).",
  "invalid-target-type": "That target can't hold the selected object.",
  "segment-not-on-wall": "That segment belongs to a different wall.",
  "cycle": "An object can't be mounted to itself.",
  "invalid-geometry": "The object's position can't be resolved.",
  "invalid-target-geometry": "The target's frame can't be resolved.",
  "invalid-source-geometry": "The current mount's frame can't be resolved.",
  "empty-selection": "Nothing mountable is selected.",
  "commit-refused": "The page refused the mount change.",
  "unavailable": "Mounting needs the multi-object channel."
};
var KIND_FIELD_KEYS = {
  pole: [["height", "height_inches"], ["embed", "embedment_inches"], ["x", "x_inches"], ["z", "z_inches"]],
  wall: [["height", "height_inches"], ["thickness", "thickness_inches"]],
  "wall-segment": [["length", "length_inches"]],
  "wall-cap": [["profile", "profile"], ["width", "width_inches"]],
  cabinet: [["mount", "mount"], ["w", "width_inches"], ["h", "height_inches"], ["d", "depth_inches"]]
};
var nodeSummaryFields = (resolved) => (KIND_FIELD_KEYS[resolved?.node] || []).filter(([, key]) => resolved.row?.[key] !== void 0 && resolved.row?.[key] !== null).map(([label, key]) => [label, resolved.row[key]]);
var COLL_LAYER = { items: "items", poles: "poles", walls: "walls", wall_caps: "caps", signage_cabinets: "cabinets" };
var KIND_LAYER = { item: "items", pole: "poles", wall: "walls", "wall-segment": "walls", "wall-cap": "caps", cabinet: "cabinets" };
var LAYER_ROWS = [
  ["items", "Foundations"],
  ["poles", "Poles"],
  ["walls", "Walls"],
  ["caps", "Wall caps"],
  ["cabinets", "Cabinets"]
];
var ELEV_DEPTH_IN = 96;
var ElevationStrip = ({ items, poles, cabinets = [], selIds, widthIn, onSelect }) => {
  const [view, setView] = useState2("side");
  const hx = (o) => Number(view === "front" ? o?.z_inches : o?.x_inches) || 0;
  const hw = (o) => Number(view === "front" ? o?.width_inches : o?.length_inches ?? o?.diameter) || 0;
  const itemsDrawn = (items || []).map((item, i) => ({
    item,
    i,
    key: layoutItemKey(item, i),
    x: hx(item),
    w: hw(item),
    depth: Number(item.depth_inches) || 0,
    off: Number(item.grade_offset_inches) || 0
  })).filter((d) => d.w > 0 || d.depth > 0);
  const polesDrawn = (poles || []).map((pole, i) => ({
    pole,
    i,
    key: layoutItemKey(pole, i),
    x: hx(pole),
    h: Number(pole.height_inches) || 0,
    embed: Number(pole.embedment_inches ?? pole.y_offset_inches) || 0
  }));
  const itemById = new Map((items || []).map((it, i) => [it?.component_id, { it, i }]));
  const poleById = new Map((poles || []).map((p, i) => [p?.component_id, { p, i }]));
  const cabsDrawn = (cabinets || []).map((cab, i) => {
    let x = null;
    if (cab?.mount === "pole") {
      const rec = poleById.get(cab?.pole_component_id);
      if (rec) x = hx(rec.p);
    } else if (cab?.mount === "foundation") {
      const rec = itemById.get(cab?.foundation_component_id);
      if (rec) x = hx(rec.it) + hw(rec.it) / 2;
    }
    if (x === null) return null;
    return {
      cab,
      i,
      x,
      mh: Number(cab.mount_height_inches) || 0,
      w: Number(cab.width_inches) || 0,
      h: Number(cab.height_inches) || 0,
      key: layoutItemKey(cab, i)
    };
  }).filter((d) => d && d.w > 0 && d.h > 0);
  const signsDrawn = [];
  (poles || []).forEach((pole, i) => {
    const x = hx(pole);
    (pole.signs || []).forEach((s, si) => {
      const w = Number(s?.width_inches), h2 = Number(s?.height_inches), mh = Number(s?.mount_height_inches) || 0;
      if (!(w > 0) || !(h2 > 0)) return;
      signsDrawn.push({ s, si, poleIndex: i, x, mh, w, h: h2, key: `${layoutItemKey(pole, i)}-sign-${si}` });
    });
  });
  if (!itemsDrawn.length && !polesDrawn.length && !cabsDrawn.length && !signsDrawn.length) return null;
  const maxDepth = Math.max(24, ...itemsDrawn.map((d) => d.depth - Math.min(0, d.off)), ...polesDrawn.map((p) => p.embed));
  const maxUp = Math.max(24, ...polesDrawn.map((p) => p.h + Math.max(0, 0)), ...itemsDrawn.map((d) => Math.max(0, d.off)), ...cabsDrawn.map((c) => c.mh + c.h), ...signsDrawn.map((s) => s.mh + s.h));
  const H = ELEV_DEPTH_IN;
  const gradeY = maxUp / (maxUp + maxDepth) * H;
  const scaleY = H / (maxUp + maxDepth);
  const scaleX = (v) => v / (widthIn || 480) * 100;
  return /* @__PURE__ */ jsxs("div", { "data-elevation-view": view, children: [
    /* @__PURE__ */ jsx2("div", { className: "mt-1 flex gap-1", children: ["side", "front"].map((v) => /* @__PURE__ */ jsx2(
      "button",
      {
        type: "button",
        onClick: () => setView(v),
        className: `h-4 px-1.5 rounded-sm text-[9px] ${view === v ? "bg-violet-600 text-white" : "border border-gray-300 text-gray-500"}`,
        children: v === "side" ? "Side (x)" : "Front (z)"
      },
      v
    )) }),
    /* @__PURE__ */ jsxs("svg", { viewBox: `0 0 100 ${H}`, preserveAspectRatio: "none", className: "mt-0.5 h-16 w-full rounded-sm border border-gray-200 bg-gray-50", "data-elevation-strip": "true", children: [
      /* @__PURE__ */ jsx2("line", { x1: "0", y1: gradeY, x2: "100", y2: gradeY, stroke: "#94a3b8", strokeWidth: "1", strokeDasharray: "3 2", vectorEffect: "non-scaling-stroke" }),
      itemsDrawn.map((d) => /* @__PURE__ */ jsx2(
        "rect",
        {
          "data-elev-item": d.key,
          x: scaleX(d.x),
          y: gradeY - d.off * scaleY,
          width: Math.max(0.5, scaleX(d.w)),
          height: d.depth * scaleY,
          fill: selIds.has(`item:component:${d.item.component_id}`) || selIds.has(`item:${d.key}`) ? "rgba(2,132,199,0.35)" : "rgba(245,158,11,0.25)",
          stroke: selIds.has(`item:component:${d.item.component_id}`) || selIds.has(`item:${d.key}`) ? "#0284c7" : "#f59e0b",
          strokeWidth: "1",
          vectorEffect: "non-scaling-stroke",
          onClick: () => onSelect?.(`item:component:${d.item.component_id}`),
          style: { cursor: onSelect ? "pointer" : "default" }
        },
        d.key
      )),
      polesDrawn.map((p) => /* @__PURE__ */ jsx2(
        "line",
        {
          "data-elev-pole": p.key,
          x1: scaleX(p.x),
          y1: gradeY + p.embed * scaleY,
          x2: scaleX(p.x),
          y2: gradeY - p.h * scaleY,
          stroke: selIds.has(`pole:component:${p.pole.component_id}`) || selIds.has(`pole:${p.key}`) ? "#0284c7" : "#475569",
          strokeWidth: "2",
          vectorEffect: "non-scaling-stroke",
          onClick: () => onSelect?.(`pole:component:${p.pole.component_id}`),
          style: { cursor: onSelect ? "pointer" : "default" }
        },
        p.key
      )),
      cabsDrawn.map((d) => /* @__PURE__ */ jsx2(
        "rect",
        {
          "data-elev-cabinet": d.key,
          x: scaleX(d.x) - Math.max(0.3, scaleX(d.w)) / 2,
          y: gradeY - (d.mh + d.h) * scaleY,
          width: Math.max(0.3, scaleX(d.w)),
          height: d.h * scaleY,
          fill: selIds.has(`cabinet:component:${d.cab.component_id}`) ? "rgba(2,132,199,0.35)" : "rgba(71,85,105,0.3)",
          stroke: selIds.has(`cabinet:component:${d.cab.component_id}`) ? "#0284c7" : "#475569",
          strokeWidth: "1",
          vectorEffect: "non-scaling-stroke",
          onClick: () => onSelect?.(`cabinet:component:${d.cab.component_id}`),
          style: { cursor: onSelect ? "pointer" : "default" }
        },
        d.key
      )),
      signsDrawn.map((d) => /* @__PURE__ */ jsx2(
        "rect",
        {
          "data-elev-sign": d.key,
          x: scaleX(d.x) - Math.max(0.3, scaleX(d.w)) / 2,
          y: gradeY - (d.mh + d.h) * scaleY,
          width: Math.max(0.3, scaleX(d.w)),
          height: d.h * scaleY,
          fill: "rgba(59,130,246,0.3)",
          stroke: "#2563eb",
          strokeWidth: "1",
          vectorEffect: "non-scaling-stroke"
        },
        d.key
      ))
    ] })
  ] });
};
function FoundationLayoutCanvas({
  items = [],
  poles = [],
  walls = [],
  wallCaps = [],
  signageCabinets = [],
  onMoveItem,
  sceneHistory = null,
  sceneSelection = null,
  onDeleteSelection,
  onDuplicateSelection,
  onPatchScene,
  objectSnap = true,
  snapToleranceInches = DEFAULT_SNAP_TOLERANCE_INCHES,
  gridSnapInches = 0,
  landscape = null
}) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState2(1);
  const dragRef = useRef(null);
  const editDragRef = useRef(null);
  const [preview, setPreview] = useState2(null);
  const editable = typeof onMoveItem === "function";
  const multiChannel = typeof onPatchScene === "function";
  const scene = { items, poles, walls, wall_caps: wallCaps, signage_cabinets: signageCabinets, landscape };
  const internalHistoryRef = useRef(null);
  if (!internalHistoryRef.current) internalHistoryRef.current = createSceneHistory();
  const history = sceneHistory || internalHistoryRef.current;
  useEffect(() => {
    history.observe(sceneLayoutAnchor(scene));
  }, [history, items, poles, walls]);
  const internalSelectionRef = useRef(null);
  if (!internalSelectionRef.current) internalSelectionRef.current = createSceneSelection();
  const selection = sceneSelection || internalSelectionRef.current;
  useSyncExternalStore(selection.subscribe, () => selection.stateVersion);
  const selState = selection.getState();
  const selIds = new Set(selState.ids);
  const [reparentOpen, setReparentOpen] = useState2(false);
  const [reparentKeep, setReparentKeep] = useState2("world");
  const [reparentNote, setReparentNote] = useState2(null);
  useEffect(() => {
    setReparentOpen(false);
    setReparentNote(null);
  }, [selState.primaryId, selState.count]);
  const mountLinks = mountLinkDescriptors(scene);
  const reparentableIds = selState.ids.filter((id) => reparentChildSpec(parseSceneNodeId(id)?.kind));
  const reparentPrimaryId = reparentableIds.includes(selState.primaryId) ? selState.primaryId : reparentableIds[reparentableIds.length - 1] ?? null;
  const reparentLocalEligible = reparentableIds.some((id) => parseSceneNodeId(id)?.kind === "pole");
  const reparentTargets = reparentOpen && reparentPrimaryId ? reparentTargetsFor(scene, reparentPrimaryId) : null;
  const breadcrumb = selState.primaryId ? nodeBreadcrumb(scene, selState.primaryId) : [];
  const primaryResolved = selState.primaryId ? resolveSceneNode(scene, selState.primaryId) : null;
  const primaryProps = primaryResolved && (primaryResolved.node !== "item" || !editable) ? nodeSummaryFields(primaryResolved) : null;
  const [layersOpen, setLayersOpen] = useState2(false);
  const [layers, setLayers] = useState2({ items: true, poles: true, walls: true, caps: true, cabinets: true });
  const [lockedLayers, setLockedLayers] = useState2(() => /* @__PURE__ */ new Set());
  const [transparentConcrete, setTransparentConcrete] = useState2(false);
  const toggleLayer = (key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleLock = (key) => setLockedLayers((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const visibleMountLinks = mountLinks.filter((l) => layers[KIND_LAYER[l.childKind]] !== false);
  const [diagOpen, setDiagOpen] = useState2(false);
  const [diagView, setDiagView] = useState2("all");
  const diagnostics = diagOpen ? foundationSceneDiagnostics(scene) : null;
  const ELEVATION_KINDS = /* @__PURE__ */ new Set(["sign-fit", "sign-collision", "mounted-off-foundation", "unresolvable-mount", "legacy-mount", "impossible-fit"]);
  const PLAN_KINDS = /* @__PURE__ */ new Set(["out-of-bounds", "footprint-clash", "mount-candidate", "ambiguous-footprint", "unplaced", "unmounted-cap", "unmounted-cabinet", "mounted-off-foundation"]);
  const diagFiltered = (diagnostics || []).filter((f) => diagView === "all" || (diagView === "elevation" ? ELEVATION_KINDS.has(f.kind) : PLAN_KINDS.has(f.kind)));
  const diagClick = (finding) => {
    const id = diagnosticTarget(scene, finding);
    if (!id) return;
    selection.select(id);
    focusNode(id);
  };
  const [treeOpen, setTreeOpen] = useState2(false);
  const sceneTree = treeOpen ? buildSceneTree(scene) : null;
  const pickRef = useRef(null);
  const marqueeRef = useRef(null);
  useEffect(() => {
    selection.reconcile(scene);
  }, [selection, items, poles, walls, wallCaps, signageCabinets]);
  const pctW = (inches) => `${inches / FOUNDATION_LAYOUT_WIDTH_INCHES * 100}%`;
  const pctD = (inches) => `${inches / FOUNDATION_LAYOUT_DEPTH_INCHES * 100}%`;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      dragRef.current = null;
      editDragRef.current = null;
      pickRef.current = null;
      marqueeRef.current = null;
    };
  }, []);
  const cancelDrag = (e) => {
    if (e?.pointerId !== void 0) {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) dragRef.current = null;
      else if (editDragRef.current && e.pointerId === editDragRef.current.pointerId) editDragRef.current = null;
      else if (dragRef.current || editDragRef.current) return;
    } else {
      dragRef.current = null;
      editDragRef.current = null;
    }
    pickRef.current = null;
    marqueeRef.current = null;
    selection.cancelMarquee();
    setPreview(null);
  };
  const focusNode = (id) => {
    const el = boxRef.current?.querySelector?.(`[data-node-id="${String(id).replace(/"/g, '\\"')}"]`);
    if (el && typeof el.focus === "function") el.focus();
  };
  const snapOpts = () => ({
    tolInches: Number.isFinite(snapToleranceInches) ? snapToleranceInches : DEFAULT_SNAP_TOLERANCE_INCHES,
    gridStepInches: Number.isFinite(gridSnapInches) && gridSnapInches > 0 ? gridSnapInches : 0
  });
  const snapEnabled = (e) => (objectSnap !== false || snapOpts().gridStepInches > 0) && !(e && e.shiftKey);
  const candidatesExcept = (keys) => {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 1) return snapCandidatesForScene(scene, { excludeKey: list[0] });
    const moving = new Set(list);
    const keep = (rows) => Array.isArray(rows) ? rows.filter((r2, i) => !moving.has(layoutItemKey(r2, i))) : [];
    return snapCandidatesForScene({ items: keep(items), poles: keep(poles), walls: keep(walls) });
  };
  const anchorWith = (patches, side) => sceneLayoutAnchor(sceneWithOpPatches(scene, patches, { side }));
  const commitOpPatches = (op, method, patches, { label } = {}) => {
    if (!Array.isArray(patches) || !patches.length) return { status: "noop" };
    if (patches.some((p) => lockedLayers.has(COLL_LAYER[p?.collection]))) {
      setReparentNote("Layer is locked \u2014 unlock it in Layers \u25B8.");
      return { status: "locked", op };
    }
    if (patchesFitSingleItemChannel(patches) && editable) {
      const p = patches[0];
      const applied = onMoveItem(p.index, p.patch);
      if (applied === false) return { status: "commit-refused", op };
      const edit = editRecordForPatches(op, method, patches, { label });
      if (edit) {
        history.recordEdit({
          ...edit,
          coalesceKey: null,
          beforeAnchor: anchorWith(patches, "before"),
          afterAnchor: anchorWith(patches, "patch")
        });
      }
      return { status: "applied", channel: "single", op };
    }
    if (multiChannel) {
      const applied = onPatchScene(patches);
      if (applied === false) return { status: "commit-refused", op };
      const edit = editRecordForPatches(op, method, patches, { label });
      if (edit) {
        history.beginStroke({
          kind: edit.kind,
          method: edit.method,
          label: edit.label,
          target: edit.target,
          before: edit.before,
          beforeAnchor: anchorWith(patches, "before")
        });
        history.commitStroke({
          after: edit.after,
          label: edit.label,
          afterAnchor: anchorWith(patches, "patch")
        });
      }
      return { status: "applied", channel: "multi", op };
    }
    return { status: "unavailable", op };
  };
  const applySelectionKey = (e) => {
    const result = selection.applyKey(e, scene);
    if (!result) return false;
    e.preventDefault();
    if (result.status === "delete-request") {
      if (typeof onDeleteSelection === "function") onDeleteSelection(selection.entries());
    } else if (result.status === "cycled" && result.id) {
      focusNode(result.id);
    }
    return true;
  };
  const applyDuplicateKey = (e) => {
    if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
    if (e.key !== "d" && e.key !== "D") return false;
    e.preventDefault();
    if (typeof onDuplicateSelection === "function") {
      const plan = duplicateSelectionPlan(scene, selection.entries());
      if (plan.status === "ok") onDuplicateSelection(plan);
    }
    return true;
  };
  const onPointerDown = (e, item, index) => {
    if (!mountedRef.current || e.button !== 0) return;
    if (e.isPrimary === false || dragRef.current || editDragRef.current) return;
    const rect = boxRef.current?.getBoundingClientRect();
    const point = layoutPointInches(e.clientX, e.clientY, rect);
    if (!point) return;
    pickRef.current = beginClickCandidate({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      hit: hitTestPlanAll(scene, point)[0] ?? null,
      additive: e.ctrlKey || e.metaKey || e.shiftKey
    });
    if (!editable) {
      try {
        boxRef.current.setPointerCapture(e.pointerId);
      } catch {
      }
      return;
    }
    const fp = foundationLayoutFootprint(item);
    const pos = layoutPositionInches(item);
    if (!fp || !pos.valid) return;
    const key = layoutItemKey(item, index);
    const [kind] = key.split(":");
    const drag = beginSceneDrag({
      pointerId: e.pointerId,
      key,
      identityKind: kind,
      legacyIndex: index,
      count: items.length,
      corner: { x: pos.x_inches, z: pos.z_inches },
      grabPoint: point,
      fingerprint: layoutItemFingerprint(item)
    });
    drag._item = item;
    drag._multi = multiChannel && selIds.has(sceneNodeId.item(key)) && selState.count > 1;
    dragRef.current = drag;
    try {
      boxRef.current.setPointerCapture(e.pointerId);
    } catch {
      cancelDrag();
      return;
    }
    setPreview({ patches: { [key]: { x_inches: pos.x_inches, z_inches: pos.z_inches } }, guides: [] });
  };
  const onHandleDown = (e, item, index, mode, handle) => {
    e.stopPropagation();
    if (!mountedRef.current || !editable || e.button !== 0) return;
    if (e.isPrimary === false || dragRef.current || editDragRef.current) return;
    const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
    if (!point) return;
    const key = layoutItemKey(item, index);
    const [kind] = key.split(":");
    const session = mode === "resize" ? beginItemResize(item, handle, point) : beginItemRotate(item, point);
    if (!session) return;
    editDragRef.current = {
      mode,
      pointerId: e.pointerId,
      key,
      identityKind: kind,
      legacyIndex: index,
      count: items.length,
      fingerprint: layoutItemFingerprint(item),
      session,
      snapCandidates: snapEnabled(e) ? candidatesExcept(key) : null
    };
    try {
      boxRef.current.setPointerCapture(e.pointerId);
    } catch {
      editDragRef.current = null;
      return;
    }
    setPreview({ patches: {}, guides: [] });
  };
  const onPlanPointerDown = (e) => {
    if (!mountedRef.current || e.button !== 0) return;
    if (e.isPrimary === false) return;
    if (e.target !== e.currentTarget) return;
    const point = layoutPointInches(e.clientX, e.clientY, boxRef.current.getBoundingClientRect());
    if (!point) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const hit = hitTestPlanAll(scene, point)[0] ?? null;
    if (hit) {
      pickRef.current = beginClickCandidate({ pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, hit, additive });
      try {
        boxRef.current.setPointerCapture(e.pointerId);
      } catch {
      }
      return;
    }
    try {
      boxRef.current.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    marqueeRef.current = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    selection.beginMarquee({ point, additive });
  };
  const onPointerMove = (e) => {
    const ed = editDragRef.current;
    if (ed && e.pointerId === ed.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (!point) return;
      if (ed.mode === "resize") {
        const r2 = resizeItemFromHandle(ed.session, point, {
          snap: ed.snapCandidates ? { candidates: ed.snapCandidates, tolInches: snapOpts().tolInches } : null
        });
        if (r2?.patch) setPreview({ patches: { [ed.key]: r2.patch }, guides: r2.guides || [] });
      } else if (ed.mode === "rotate") {
        const r2 = rotateItemFromPointer(ed.session, point, { free: e.shiftKey });
        if (r2?.patch) setPreview({ patches: { [ed.key]: r2.patch }, guides: [] });
      }
      return;
    }
    const d = dragRef.current;
    if (d && e.pointerId === d.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (!point) return;
      d.moved = true;
      const raw = sceneDragCorner(d, point);
      if (!raw) return;
      d.last = raw;
      if (d._multi) {
        const delta = { dx: raw.x - d.corner.x, dz: raw.z - d.corner.z };
        const r2 = moveSelectionPatch(scene, selState.ids, delta, {
          snap: snapEnabled(e) ? { candidates: snapCandidatesOutside(scene, selState.ids), tolInches: snapOpts().tolInches } : null,
          gridStepInches: snapEnabled(e) ? snapOpts().gridStepInches : 0
        });
        if (r2.status === "ok") {
          const patches = {};
          for (const p of r2.patches) {
            if (p.collection === "items") patches[p.key] = p.patch;
          }
          setPreview({ patches, guides: r2.guides || [] });
        }
        return;
      }
      const adj = snapEnabled(e) && d._item ? snapDraggedItem(d._item, raw, candidatesExcept(d.key), snapOpts()) : null;
      const cx = raw.x + (adj?.dx ?? 0);
      const cz = raw.z + (adj?.dz ?? 0);
      d._guides = adj?.guides || [];
      setPreview({ patches: { [d.key]: { x_inches: cx, z_inches: cz } }, guides: d._guides });
      return;
    }
    const m = marqueeRef.current;
    if (m && e.pointerId === m.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (point) selection.updateMarquee(point);
    }
  };
  const commitDrag = (e) => {
    const ed = editDragRef.current;
    const d = dragRef.current;
    const pick = pickRef.current;
    const marquee2 = marqueeRef.current;
    if (marquee2 && e.pointerId === marquee2.pointerId) {
      marqueeRef.current = null;
      try {
        boxRef.current?.releasePointerCapture(e.pointerId);
      } catch {
      }
      if (!mountedRef.current) return;
      const point2 = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (point2) selection.updateMarquee(point2);
      selection.commitMarquee(scene, { empty: isClickRelease(marquee2, e) });
      pickRef.current = null;
      return;
    }
    if (ed && e.pointerId === ed.pointerId) {
      editDragRef.current = null;
      try {
        boxRef.current?.releasePointerCapture(e.pointerId);
      } catch {
      }
      setPreview(null);
      if (!mountedRef.current) return;
      const point2 = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (!point2) return;
      const target2 = resolveSceneDragTarget(ed, items);
      if (!target2) return;
      if (ed.mode === "resize") {
        const r2 = resizeItemFromHandle(ed.session, point2, {
          round: true,
          snap: ed.snapCandidates ? { candidates: ed.snapCandidates, tolInches: snapOpts().tolInches } : null
        });
        if (!r2?.patch) return;
        const patch2 = { collection: "items", index: target2.index, key: ed.key, before: beforeFieldsOf(target2.item, r2.patch), patch: r2.patch };
        if (JSON.stringify(patch2.before) === JSON.stringify(patch2.patch)) return;
        commitOpPatches("resize", "handle", [patch2], { label: `Resize Foundation ${target2.index + 1}` });
        return;
      }
      if (ed.mode === "rotate") {
        const r2 = rotateItemFromPointer(ed.session, point2, { free: e.shiftKey });
        if (!r2?.patch) return;
        const patch2 = { collection: "items", index: target2.index, key: ed.key, before: beforeFieldsOf(target2.item, r2.patch), patch: r2.patch };
        if (JSON.stringify(patch2.before) === JSON.stringify(patch2.patch)) return;
        commitOpPatches("rotate", "handle", [patch2], { label: `Rotate Foundation ${target2.index + 1}` });
        return;
      }
      return;
    }
    if (pick && e.pointerId === pick.pointerId && (!d || d.pointerId !== pick.pointerId)) {
      pickRef.current = null;
      try {
        boxRef.current?.releasePointerCapture(e.pointerId);
      } catch {
      }
      if (isClickRelease(pick, e)) selection.selectHit(pick.hit, { additive: pick.additive });
      return;
    }
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    pickRef.current = null;
    try {
      boxRef.current?.releasePointerCapture(e.pointerId);
    } catch {
    }
    setPreview(null);
    if (!mountedRef.current) return;
    const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
    if (!point) return;
    const releasePoint = (() => {
      if (!snapEnabled(e) || !d._item || d._multi) return point;
      const raw = sceneDragCorner(d, point);
      const adj = raw ? snapDraggedItem(d._item, raw, candidatesExcept(d.key), snapOpts()) : null;
      return adj ? { ...point, x_inches: point.x_inches + adj.dx, z_inches: point.z_inches + adj.dz } : point;
    })();
    const patch = commitSceneDrag(d, releasePoint);
    if (!patch) {
      if (pick && isClickRelease(pick, e)) {
        selection.selectHit(pick.hit, { additive: pick.additive });
      }
      return;
    }
    const target = resolveSceneDragTarget(d, items);
    if (!target) return;
    if (typeof onMoveItem !== "function") return;
    if (d._multi) {
      const raw = sceneDragCorner(d, point);
      const delta = raw ? { dx: raw.x - d.corner.x, dz: raw.z - d.corner.z } : null;
      const r2 = delta ? moveSelectionPatch(scene, selState.ids, delta, {
        round: true,
        snap: snapEnabled(e) ? { candidates: snapCandidatesOutside(scene, selState.ids), tolInches: snapOpts().tolInches } : null,
        gridStepInches: snapEnabled(e) ? snapOpts().gridStepInches : 0
      }) : null;
      if (r2?.status === "ok") {
        commitOpPatches("move", "drag", r2.patches, { label: `Move ${r2.patches.length} objects` });
        return;
      }
      if (pick && isClickRelease(pick, e)) {
        selection.selectHit(pick.hit, { additive: pick.additive });
      }
      return;
    }
    const edit = sceneEditFromDrag(d, patch);
    const applied = onMoveItem(target.index, patch);
    if (applied === false) return;
    if (edit) {
      const patchRow = { collection: "items", index: target.index, before: edit.before, patch };
      history.recordEdit({
        ...edit,
        target: { key: d.key, index: target.index },
        label: `Move Foundation ${target.index + 1}`,
        coalesceKey: sceneEditCoalesceKey(edit),
        beforeAnchor: anchorWith([patchRow], "before"),
        afterAnchor: anchorWith([patchRow], "patch")
      });
    }
  };
  const applyRotateKey = (e, item, index) => {
    if (!editable || !item) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key !== "[" && e.key !== "]") return false;
    const fp = foundationLayoutFootprint(item);
    const pos = layoutPositionInches(item);
    if (!fp || !pos.valid) return false;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? ROTATE_KEY_BIG_STEP_DEGREES : ROTATE_KEY_STEP_DEGREES;
    const r2 = rotateItemBy(item, e.key === "]" ? step : -step);
    if (!r2?.patch) return true;
    const key = layoutItemKey(item, index);
    const patchRow = { collection: "items", index, key, before: beforeFieldsOf(item, r2.patch), patch: r2.patch };
    if (JSON.stringify(patchRow.before) === JSON.stringify(patchRow.patch)) return true;
    const applied = onMoveItem(index, r2.patch);
    if (applied === false) return true;
    const edit = editRecordForPatches("rotate", "key", [patchRow], { label: `Rotate Foundation ${index + 1}` });
    if (edit) {
      history.recordEdit({
        ...edit,
        coalesceKey: `editop-rotate:${key}`,
        beforeAnchor: anchorWith([patchRow], "before"),
        afterAnchor: anchorWith([patchRow], "patch")
      });
    }
    return true;
  };
  const onKeyDown = (e, item, index) => {
    if (!mountedRef.current || !editable) return;
    if (applyDuplicateKey(e)) {
      e.stopPropagation();
      return;
    }
    if (applyRotateKey(e, item, index)) return;
    const delta = keyboardNudge(e);
    if (delta) {
      const fp = foundationLayoutFootprint(item);
      const pos = layoutPositionInches(item);
      if (!fp || !pos.valid) return;
      e.preventDefault();
      e.stopPropagation();
      const patch = nudgePatch(pos, delta);
      const applied = onMoveItem(index, patch);
      if (applied === false) return;
      const edit = sceneEditFromNudge(layoutItemKey(item, index), pos, patch);
      if (edit) {
        const patchRow = { collection: "items", index, before: edit.before, patch };
        history.recordEdit({
          ...edit,
          target: { key: layoutItemKey(item, index), index },
          label: `Move Foundation ${index + 1}`,
          coalesceKey: sceneEditCoalesceKey(edit),
          beforeAnchor: anchorWith([patchRow], "before"),
          afterAnchor: anchorWith([patchRow], "patch")
        });
      }
      return;
    }
    if (applySelectionKey(e)) e.stopPropagation();
  };
  const onPlanKeyDown = (e) => {
    if (!mountedRef.current) return;
    if (e.target !== e.currentTarget) return;
    if (applyDuplicateKey(e)) return;
    applySelectionKey(e);
  };
  const runOp = (fn, { label } = {}) => {
    const result = fn();
    if (result?.status === "ok") commitOpPatches(result.op, "toolbar", result.patches, { label });
    return result;
  };
  const opAlign = (edge) => runOp(
    () => alignSelectionPatch(scene, selState.ids, edge, { primaryId: selState.primaryId, round: true }),
    { label: `${ALIGN_LABELS[edge]} (${selState.count} sel)` }
  );
  const opDistribute = (axis) => runOp(
    () => distributeSelectionPatch(scene, selState.ids, axis, { round: true }),
    { label: `Distribute ${axis === "x" ? "horizontally" : "vertically"} (${selState.count} sel)` }
  );
  const opRotateStep = (deg) => {
    const ids = selState.ids.filter((id) => id.startsWith("item:"));
    const patches = [];
    ids.forEach((id) => {
      const res = items.findIndex((it, i) => layoutItemKey(it, i) === id.split(":").slice(1).join(":"));
      if (res < 0) return;
      const r2 = rotateItemBy(items[res], deg);
      if (r2?.patch) patches.push({ collection: "items", index: res, key: layoutItemKey(items[res], res), before: beforeFieldsOf(items[res], r2.patch), patch: r2.patch });
    });
    if (patches.length) commitOpPatches("rotate", "toolbar", patches, { label: `Rotate ${deg > 0 ? "+" : ""}${deg}\xB0` });
  };
  const opDelete = () => {
    const plan = deleteSelectionPlan(scene, selection.entries());
    if (plan.status === "ok" && typeof onDeleteSelection === "function") onDeleteSelection(selection.entries());
  };
  const opDuplicate = () => {
    const plan = duplicateSelectionPlan(scene, selection.entries());
    if (plan.status === "ok" && typeof onDuplicateSelection === "function") onDuplicateSelection(plan);
  };
  const opMirror = () => {
    const cx = PLAN_W;
    const patches = [];
    selState.ids.forEach((id) => {
      const [kind, ref] = [id.split(":")[0], id.split(":").slice(1).join(":")];
      if (kind === "item") {
        const res = items.findIndex((it, i) => layoutItemKey(it, i) === ref);
        if (res < 0) return;
        const fp = foundationLayoutFootprint(items[res]);
        const pos = layoutPositionInches(items[res]);
        if (!fp || !pos.valid) return;
        const patch = { x_inches: Math.round((cx - (pos.x_inches + fp.width)) * 100) / 100 };
        const rot = Number(items[res].rotation_degrees) || 0;
        if (rot) patch.rotation_degrees = Math.round((360 - rot) % 360 * 100) / 100;
        patches.push({ collection: "items", index: res, key: ref, before: beforeFieldsOf(items[res], patch), patch });
      } else if (kind === "pole") {
        const res = poles.findIndex((p, i) => layoutItemKey(p, i) === ref);
        if (res < 0) return;
        const x = Number(poles[res].x_inches);
        if (!Number.isFinite(x)) return;
        const patch = { x_inches: Math.round((cx - x) * 100) / 100 };
        patches.push({ collection: "poles", index: res, key: ref, before: beforeFieldsOf(poles[res], patch), patch });
      } else if (kind === "wall") {
        const res = walls.findIndex((w, i) => layoutItemKey(w, i) === ref);
        if (res < 0) return;
        const pts = walls[res]?.shape?.points;
        if (!Array.isArray(pts) || !pts.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z))) return;
        const patch = { shape: { ...walls[res].shape, points: [...pts].reverse().map((p) => ({ x: Math.round((cx - p.x) * 100) / 100, z: p.z })) } };
        patches.push({ collection: "walls", index: res, key: ref, before: beforeFieldsOf(walls[res], patch), patch });
      }
    });
    if (patches.length) commitOpPatches("mirror", "toolbar", patches, { label: `Mirror ${patches.length} object${patches.length === 1 ? "" : "s"}` });
  };
  const canMirrorSel = editable && selState.count > 0 && selState.ids.some((id) => /^(item|pole|wall):/.test(id));
  const exportPlan = () => {
    const svg = buildFoundationPlanSvg(scene, { width: FOUNDATION_LAYOUT_WIDTH_INCHES, depth: FOUNDATION_LAYOUT_DEPTH_INCHES });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `foundation-plan-${FOUNDATION_LAYOUT_WIDTH_INCHES}x${FOUNDATION_LAYOUT_DEPTH_INCHES}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const runReparent = (target) => {
    setReparentNote(null);
    const result = planReparentSelection(scene, selState.ids, target, { keep: reparentKeep });
    if (result.status === "noop") {
      setReparentOpen(false);
      return result;
    }
    if (result.status !== "ok") {
      setReparentNote(REPARENT_REASON_TEXT[result.reason] ?? `Can't mount there (${result.reason ?? "rejected"}).`);
      return result;
    }
    const applied = commitOpPatches("reparent", "picker", result.patches, { label: result.label });
    if (applied.status !== "applied") {
      setReparentNote(REPARENT_REASON_TEXT[applied.status] ?? `Mount not applied (${applied.status}).`);
      return applied;
    }
    if (result.skipped?.length) {
      const reasons = [...new Set(result.skipped.map((s) => REPARENT_REASON_TEXT[s.reason] ?? s.reason))].join(" ");
      setReparentNote(`${result.count} remounted; ${result.skipped.length} skipped \u2014 ${reasons}`);
    }
    setReparentOpen(false);
    return result;
  };
  const primaryEntry = selState.primary;
  const primaryItemRow = (() => {
    if (!primaryEntry?.id?.startsWith("item:")) return null;
    const key = primaryEntry.id.slice(5);
    const i = items.findIndex((it, j) => layoutItemKey(it, j) === key);
    return i >= 0 ? { item: items[i], index: i, key } : null;
  })();
  const typedCommitRef = useRef(null);
  const commitTypedField = (field, text, parse) => {
    if (!primaryItemRow) return;
    const parsed = parse(text);
    if (parsed === void 0) return;
    const last = typedCommitRef.current;
    if (last && last.field === field && last.value === parsed && Date.now() - last.at < 600) return;
    const r2 = typedItemPatch(primaryItemRow.item, { [field]: parsed });
    if (r2.status !== "ok") return;
    const patchRow = { collection: "items", index: primaryItemRow.index, key: primaryItemRow.key, before: r2.before, patch: r2.patch };
    if (JSON.stringify(patchRow.before) === JSON.stringify(patchRow.patch)) return;
    const applied = onMoveItem(primaryItemRow.index, r2.patch);
    if (applied === false) return;
    typedCommitRef.current = { field, value: parsed, at: Date.now() };
    const edit = editRecordForPatches("geometry", "typed", [patchRow], { label: `Edit Foundation ${primaryItemRow.index + 1} ${field}` });
    if (edit) {
      history.recordEdit({
        ...edit,
        coalesceKey: null,
        beforeAnchor: anchorWith([patchRow], "before"),
        afterAnchor: anchorWith([patchRow], "patch")
      });
    }
  };
  const dimParse = (text) => {
    const p = parseFoundationDimension(text);
    return p.ok ? p.inches : void 0;
  };
  const rotParse = (text) => {
    const t = String(text).trim();
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t) ? Number(t) : void 0;
  };
  const invalidNotes = items.map((item, index) => ({ item, index })).filter(({ item }) => !foundationLayoutFootprint(item) || !layoutPositionInches(item).valid);
  const marquee = selState.marquee;
  const marqueeRect = marquee ? {
    x: Math.min(marquee.start.x, marquee.current.x),
    z: Math.min(marquee.start.z, marquee.current.z),
    w: Math.abs(marquee.current.x - marquee.start.x),
    h: Math.abs(marquee.current.z - marquee.start.z)
  } : null;
  const guides = preview?.guides || [];
  const selectedItemCount = selState.ids.filter((id) => id.startsWith("item:")).length;
  const singleItemSel = selState.count === 1 && selectedItemCount === 1 && primaryItemRow;
  const alignNeedsMulti = selState.count > 1;
  const canAlign = editable && selState.count >= 1 && (!alignNeedsMulti || multiChannel);
  const canDistribute = editable && selState.count >= 3 && multiChannel;
  const canRotateSel = editable && selectedItemCount >= 1 && (selectedItemCount === 1 || multiChannel);
  const canDuplicate = typeof onDuplicateSelection === "function";
  const canDelete = typeof onDeleteSelection === "function" && selState.count >= 1;
  const canReparent = editable && multiChannel && reparentableIds.length >= 1;
  const typedField = (field, label, stored, parse, format) => /* @__PURE__ */ jsx2(
    "input",
    {
      type: "text",
      defaultValue: format ? format(stored) : String(stored ?? ""),
      "aria-label": label,
      title: label,
      "data-typed-field": field,
      className: "w-14 h-6 px-1 rounded-sm border border-gray-300 text-[11px] text-gray-800",
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitTypedField(field, e.currentTarget.value, parse);
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.value = format ? format(stored) : String(stored ?? "");
          e.currentTarget.blur();
        }
        e.stopPropagation();
      },
      onBlur: (e) => commitTypedField(field, e.currentTarget.value, parse),
      onPointerDown: (e) => e.stopPropagation()
    },
    `${primaryItemRow?.key}:${field}:${String(stored)}`
  );
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-sm border border-gray-200 p-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 mb-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx2("h3", { className: "text-[13px] font-bold text-gray-900", children: "Layout Canvas" }),
        /* @__PURE__ */ jsx2("p", { className: "text-[11px] text-gray-500", children: editable ? "Drag a foundation or use arrow keys (Shift for larger steps). Click selects, Ctrl/Shift-click adds, drag empty space to box-select, Tab/arrows cycle, Esc clears." : "Foundation positions (read-only). Click to select, drag empty space to box-select." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap text-[11px] text-gray-600", children: [
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsx2(Move, { className: "w-3 h-3", "aria-hidden": "true" }),
          " Move Foundation"
        ] }),
        /* @__PURE__ */ jsx2("span", { className: "text-gray-500", children: "40ft \xD7 26ft 8in" }),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2))),
            "aria-label": "Zoom layout out",
            className: "w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50",
            children: /* @__PURE__ */ jsx2(ZoomOut, { className: "w-3 h-3", "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ jsxs("span", { className: "w-10 text-center", children: [
          Math.round(zoom * 100),
          "%"
        ] }),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: () => setZoom((z) => Math.min(6, +(z + 0.25).toFixed(2))),
            "aria-label": "Zoom layout in",
            className: "w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50",
            children: /* @__PURE__ */ jsx2(ZoomIn, { className: "w-3 h-3", "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            "data-op": "fit-selection",
            disabled: !primaryItemRow,
            title: "Zoom so the selected foundation fills the plan",
            onClick: () => {
              const fp = primaryItemRow?.item && foundationLayoutFootprint(primaryItemRow.item);
              if (!fp) return;
              const frac = fp.width / FOUNDATION_LAYOUT_WIDTH_INCHES;
              if (frac > 0) setZoom(Math.min(6, Math.max(0.5, +(1 / frac).toFixed(2))));
            },
            className: `h-6 px-2 rounded-sm border text-[11px] ${primaryItemRow ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
            children: "Fit"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "overflow-auto rounded-sm border border-gray-300 bg-gray-50", children: /* @__PURE__ */ jsxs(
      "div",
      {
        ref: boxRef,
        tabIndex: 0,
        role: "group",
        "aria-label": "Foundation layout plan \u2014 Tab or arrows cycle selection",
        "data-scene-selection": "true",
        onPointerDown: onPlanPointerDown,
        onPointerMove,
        onPointerUp: commitDrag,
        onPointerCancel: cancelDrag,
        onLostPointerCapture: (e) => cancelDrag(e),
        onKeyDown: onPlanKeyDown,
        className: "relative aspect-[3/2] select-none",
        style: {
          width: `${zoom * 100}%`,
          backgroundImage: "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "8.333% 12.5%"
        },
        children: [
          /* @__PURE__ */ jsx2("div", { "aria-hidden": "true", "data-scale-ruler": "true", className: "absolute left-0 right-0 top-0 h-4", style: { pointerEvents: "none" }, children: [0, 120, 240, 360, 480].map((inches) => /* @__PURE__ */ jsxs(
            "span",
            {
              className: "absolute text-[9px] text-gray-500",
              style: { left: pctW(inches), transform: "translateX(-50%)" },
              children: [
                inches / 12,
                "'"
              ]
            },
            inches
          )) }),
          /* @__PURE__ */ jsx2(
            "svg",
            {
              "aria-hidden": "true",
              "data-mount-links": "true",
              className: "absolute inset-0",
              viewBox: `0 0 ${FOUNDATION_LAYOUT_WIDTH_INCHES} ${FOUNDATION_LAYOUT_DEPTH_INCHES}`,
              preserveAspectRatio: "none",
              style: { pointerEvents: "none", zIndex: 1 },
              children: visibleMountLinks.map((link) => {
                const sel = selIds.has(link.childId);
                const a = link.handlePoint;
                const b = link.parentPoint;
                const showLine = a && b && (a.x !== b.x || a.z !== b.z);
                return /* @__PURE__ */ jsxs("g", { "data-mount-link": link.childId, "data-mount-kind": link.childKind, children: [
                  showLine && /* @__PURE__ */ jsx2(
                    "line",
                    {
                      x1: a.x,
                      y1: a.z,
                      x2: b.x,
                      y2: b.z,
                      stroke: sel ? "#0369a1" : "#64748b",
                      strokeOpacity: sel ? 0.9 : 0.45,
                      strokeWidth: sel ? 2 : 1.25,
                      strokeDasharray: "4 3",
                      vectorEffect: "non-scaling-stroke"
                    }
                  ),
                  a && /* @__PURE__ */ jsx2(
                    "rect",
                    {
                      x: a.x - 2.5,
                      y: a.z - 2.5,
                      width: 5,
                      height: 5,
                      transform: `rotate(45 ${a.x} ${a.z})`,
                      fill: sel ? "#0284c7" : "#f8fafc",
                      stroke: sel ? "#075985" : "#64748b",
                      strokeWidth: 1,
                      vectorEffect: "non-scaling-stroke"
                    }
                  )
                ] }, link.childId);
              })
            }
          ),
          layers.items && items.map((item, index) => {
            const fp = foundationLayoutFootprint(item);
            const pos = layoutPositionInches(item);
            if (!fp || !pos.valid) return null;
            const key = layoutItemKey(item, index);
            const nodeId = sceneNodeId.item(key);
            const isSel = selIds.has(nodeId);
            const isPrimary = selState.primaryId === nodeId;
            const pv = preview?.patches?.[key];
            const shown = pv ? { x_inches: pv.x_inches ?? pos.x_inches, z_inches: pv.z_inches ?? pos.z_inches } : pos;
            const shownW = pv?.diameter ?? pv?.length_inches ?? fp.width;
            const shownD = pv?.diameter ?? pv?.width_inches ?? fp.depth;
            const shownRot = pv?.rotation_degrees ?? item.rotation_degrees ?? 0;
            return /* @__PURE__ */ jsxs(
              "div",
              {
                role: editable ? "button" : void 0,
                tabIndex: editable ? 0 : void 0,
                "aria-label": editable ? `Move Foundation ${index + 1}` : void 0,
                "aria-pressed": editable ? isSel : void 0,
                "data-node-id": nodeId,
                "data-selected": isSel ? "true" : void 0,
                "data-primary": isPrimary ? "true" : void 0,
                onPointerDown: (e) => onPointerDown(e, item, index),
                onKeyDown: editable ? (e) => onKeyDown(e, item, index) : void 0,
                className: `absolute flex items-center justify-center border-2 text-[10px] font-semibold ${isSel ? `border-solid border-sky-600 ${transparentConcrete ? "bg-sky-100/20" : "bg-sky-100/70"} text-sky-900 z-10` : `border-dashed border-amber-500 ${transparentConcrete ? "bg-amber-100/20" : "bg-amber-100/70"} text-amber-800`} ${editable ? "cursor-move" : ""} ${item.foundation_type === "pillar" ? "rounded-full" : "rounded-sm"}`,
                style: {
                  left: pctW(shown.x_inches),
                  top: pctD(shown.z_inches),
                  width: pctW(shownW),
                  height: pctD(shownD),
                  transform: `rotate(${shownRot}deg)`,
                  touchAction: editable ? "none" : void 0
                },
                title: `Foundation ${index + 1}`,
                children: [
                  /* @__PURE__ */ jsxs("span", { className: "flex flex-col items-center leading-tight", style: { pointerEvents: "none" }, children: [
                    /* @__PURE__ */ jsxs("span", { children: [
                      "Foundation ",
                      index + 1
                    ] }),
                    isSel && /* @__PURE__ */ jsx2("span", { "data-dim-chip": "true", className: "text-[9px] font-normal", children: item.foundation_type === "pillar" ? `\u2300 ${formatFoundationDimension(shownW)}` : `${formatFoundationDimension(shownW)} \xD7 ${formatFoundationDimension(shownD)}` })
                  ] }),
                  isPrimary && editable && ITEM_RESIZE_HANDLES.map((h2) => /* @__PURE__ */ jsx2(
                    "span",
                    {
                      "data-resize-handle": h2,
                      "aria-hidden": "true",
                      onPointerDown: (e) => onHandleDown(e, item, index, "resize", h2),
                      className: "absolute w-2 h-2 bg-white border border-sky-700 rounded-[2px]",
                      style: {
                        ...HANDLE_POSITION[h2],
                        cursor: HANDLE_CURSORS[h2],
                        pointerEvents: "auto"
                      }
                    },
                    h2
                  )),
                  isPrimary && editable && /* @__PURE__ */ jsx2(
                    "span",
                    {
                      "data-rotate-handle": "true",
                      "aria-hidden": "true",
                      onPointerDown: (e) => onHandleDown(e, item, index, "rotate", "n"),
                      className: "absolute w-2.5 h-2.5 bg-sky-500 border border-sky-800 rounded-full",
                      style: {
                        left: "calc(50% - 5px)",
                        top: "-18px",
                        cursor: "grab",
                        pointerEvents: "auto",
                        boxShadow: "0 0 0 1px rgba(255,255,255,0.8)"
                      }
                    }
                  )
                ]
              },
              key
            );
          }),
          preview && /* @__PURE__ */ jsx2("div", { className: "absolute left-1 top-1 z-10 rounded-sm bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800", style: { pointerEvents: "none" }, children: "Move preview - release to apply" }),
          guides.map((gd, i) => gd.axis === "x" ? /* @__PURE__ */ jsx2("div", { "data-snap-guide": "x", "aria-hidden": "true", className: "absolute top-0 bottom-0 border-l border-sky-500/70 z-20", style: { left: pctW(gd.value), pointerEvents: "none" } }, `gx-${i}`) : /* @__PURE__ */ jsx2("div", { "data-snap-guide": "z", "aria-hidden": "true", className: "absolute left-0 right-0 border-t border-sky-500/70 z-20", style: { top: pctD(gd.value), pointerEvents: "none" } }, `gz-${i}`)),
          marqueeRect && /* @__PURE__ */ jsx2(
            "div",
            {
              "data-marquee": "true",
              "aria-hidden": "true",
              className: "absolute border border-sky-500 bg-sky-300/20 z-20",
              style: {
                left: pctW(marqueeRect.x),
                top: pctD(marqueeRect.z),
                width: pctW(marqueeRect.w),
                height: pctD(marqueeRect.h),
                pointerEvents: "none"
              }
            }
          ),
          layers.poles && poles.map((pole, index) => {
            const nodeId = sceneNodeId.pole(layoutItemKey(pole, index));
            const isSel = selIds.has(nodeId);
            return /* @__PURE__ */ jsx2(
              "div",
              {
                "data-node-id": nodeId,
                "data-selected": isSel ? "true" : void 0,
                "data-primary": selState.primaryId === nodeId ? "true" : void 0,
                className: `absolute w-2.5 h-2.5 rounded-full border ${isSel ? "bg-sky-500 border-sky-800" : "bg-slate-700 border-white"}`,
                style: {
                  left: pctW(pole.x_inches || 0),
                  top: pctD(pole.z_inches || 0),
                  transform: "translate(-50%,-50%)",
                  pointerEvents: "none",
                  boxShadow: isSel ? "0 0 0 2px rgba(2,132,199,0.45)" : void 0
                },
                title: `Pole ${index + 1}`
              },
              layoutItemKey(pole, index)
            );
          }),
          (poles || []).map(
            (pole) => (pole.signs || []).flatMap((s, si) => {
              const w = Number(s?.width_inches), d = Number(s?.depth_inches);
              if (!(w > 0) || !(d > 0)) return [];
              const off = Number(s?.horizontal_offset_inches) || 0;
              const offs = s?.twin === true && off !== 0 ? [off, -off] : [off];
              return offs.map((o, oi) => /* @__PURE__ */ jsx2(
                "div",
                {
                  className: "absolute border border-blue-600 bg-blue-400/20",
                  style: {
                    left: pctW((Number(pole.x_inches) || 0) + o - w / 2),
                    top: pctD((Number(pole.z_inches) || 0) - d / 2),
                    width: pctW(w),
                    height: pctD(d),
                    pointerEvents: "none"
                  },
                  title: `Sign ${si + 1} on pole${s?.twin === true ? ` (${oi === 0 ? "near" : "far"} twin)` : ""}`
                },
                `sign-${pole.component_id || pole.x_inches}-${si}-${oi}`
              ));
            })
          )
        ]
      }
    ) }),
    /* @__PURE__ */ jsx2(
      ElevationStrip,
      {
        items,
        poles,
        cabinets: signageCabinets,
        selIds,
        widthIn: FOUNDATION_LAYOUT_WIDTH_INCHES,
        onSelect: (id) => selection.select(id)
      }
    ),
    breadcrumb.length > 0 && /* @__PURE__ */ jsx2("div", { "data-breadcrumb": "true", className: "mt-1.5 text-[10px] text-gray-500", "aria-label": "Selection path", children: breadcrumb.map((crumb, i) => /* @__PURE__ */ jsxs("span", { children: [
      i > 0 && /* @__PURE__ */ jsx2("span", { className: "mx-1 text-gray-300", "aria-hidden": "true", children: "\u203A" }),
      /* @__PURE__ */ jsx2("span", { className: crumb.id === selState.primaryId ? "font-semibold text-gray-700" : "", children: crumb.label ?? crumb.id })
    ] }, crumb.id)) }),
    primaryProps && primaryProps.length > 0 && /* @__PURE__ */ jsxs("div", { "data-selected-props": "true", className: "mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-500", children: [
      /* @__PURE__ */ jsxs("span", { className: "font-semibold text-gray-600", children: [
        primaryResolved.node,
        ":"
      ] }),
      primaryProps.map(([label, value]) => /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx2("span", { className: "text-gray-500", children: label }),
        " ",
        String(value)
      ] }, label)),
      /* @__PURE__ */ jsx2("span", { className: "text-gray-500 italic", children: "edit via its panel" })
    ] }),
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        "data-tree-toggle": "true",
        onClick: () => setTreeOpen((v) => !v),
        className: "mt-1.5 text-[10px] text-gray-500 hover:text-gray-600",
        children: [
          treeOpen ? "\u25BE" : "\u25B8",
          " Objects"
        ]
      }
    ),
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        "data-layers-toggle": "true",
        onClick: () => setLayersOpen((v) => !v),
        className: "mt-1.5 ml-3 text-[10px] text-gray-500 hover:text-gray-600",
        children: [
          layersOpen ? "\u25BE" : "\u25B8",
          " Layers"
        ]
      }
    ),
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        "data-diag-toggle": "true",
        onClick: () => setDiagOpen((v) => !v),
        className: "mt-1.5 ml-3 text-[10px] text-gray-500 hover:text-gray-600",
        children: [
          diagOpen ? "\u25BE" : "\u25B8",
          " Diagnostics"
        ]
      }
    ),
    diagOpen && /* @__PURE__ */ jsxs("div", { "data-diag-panel": "true", className: "mt-0.5 max-h-36 overflow-auto rounded-sm border border-gray-200 bg-gray-50 p-1 text-[10px]", children: [
      /* @__PURE__ */ jsx2("div", { className: "flex gap-1 mb-0.5", children: ["all", "plan", "elevation"].map((v) => /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          onClick: () => setDiagView(v),
          className: `h-4 px-1 rounded-sm text-[9px] ${diagView === v ? "bg-violet-600 text-white" : "border border-gray-300 text-gray-500"}`,
          children: v
        },
        v
      )) }),
      !diagFiltered.length && /* @__PURE__ */ jsx2("p", { className: "px-1 py-1 text-gray-500", children: "No conflicts detected." }),
      diagFiltered.map((f, i) => /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-diag-severity": f.severity,
          onClick: () => diagClick(f),
          title: diagnosticTarget(scene, f) ? "Click to select the object" : void 0,
          className: `block w-full rounded-sm px-1 py-0.5 text-left ${f.severity === "error" ? "text-red-700 hover:bg-red-50" : f.severity === "warning" ? "text-amber-700 hover:bg-amber-50" : "text-gray-600 hover:bg-gray-100"}`,
          children: f.message
        },
        i
      ))
    ] }),
    layersOpen && /* @__PURE__ */ jsxs("div", { "data-layers-panel": "true", className: "mt-0.5 rounded-sm border border-gray-200 bg-gray-50 p-1.5 text-[10px]", children: [
      LAYER_ROWS.map(([key, label]) => /* @__PURE__ */ jsxs("div", { "data-layer": key, className: "flex items-center gap-3 px-1 py-0.5", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex flex-1 items-center gap-1.5 text-gray-600 cursor-pointer", children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: layers[key] !== false, onChange: () => toggleLayer(key) }),
          label
        ] }),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            "data-layer-lock": key,
            title: lockedLayers.has(key) ? "Unlock layer" : "Lock layer (blocks edits)",
            onClick: () => toggleLock(key),
            className: lockedLayers.has(key) ? "text-amber-600 font-semibold" : "text-gray-300 hover:text-gray-500",
            children: lockedLayers.has(key) ? "\u{1F512}" : "\u{1F513}"
          }
        )
      ] }, key)),
      /* @__PURE__ */ jsxs("label", { className: "mt-1 flex items-center gap-1.5 border-t border-gray-200 px-1 pt-1 text-gray-600 cursor-pointer", children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: transparentConcrete, onChange: (e) => setTransparentConcrete(e.target.checked) }),
        "Transparent concrete"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-1 flex gap-1 border-t border-gray-200 px-1 pt-1", children: [
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            "data-layer-op": "isolate",
            disabled: selState.count < 1,
            title: "Show only the kinds in the current selection",
            onClick: () => setLayers(() => {
              const only = new Set(selState.ids.map((id) => KIND_LAYER[parseSceneNodeId(id)?.kind]).filter(Boolean));
              return { items: only.has("items"), poles: only.has("poles"), walls: only.has("walls"), caps: only.has("caps"), cabinets: only.has("cabinets") };
            }),
            className: `px-1.5 py-0.5 rounded-sm border ${selState.count >= 1 ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
            children: "Isolate sel"
          }
        ),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            "data-layer-op": "show-all",
            onClick: () => setLayers({ items: true, poles: true, walls: true, caps: true, cabinets: true }),
            className: "px-1.5 py-0.5 rounded-sm border border-gray-300 hover:bg-gray-50 text-gray-700",
            children: "Show all"
          }
        )
      ] })
    ] }),
    treeOpen && sceneTree && /* @__PURE__ */ jsx2("div", { "data-object-tree": "true", className: "mt-0.5 max-h-44 overflow-auto rounded-sm border border-gray-200 bg-gray-50 p-1 text-[10px]", children: sceneTree.order.map((id) => {
      const n2 = sceneTree.nodes.get(id);
      if (!n2) return null;
      const sel = selIds.has(id);
      return /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-tree-node": id,
          "data-selected": sel ? "true" : void 0,
          onClick: () => selection.select(id),
          className: `block w-full truncate rounded-sm px-1 py-0.5 text-left ${sel ? "bg-sky-100 text-sky-800 font-semibold" : "text-gray-600 hover:bg-gray-100"}`,
          style: { paddingLeft: `${4 + (n2.depth || 0) * 12}px` },
          title: n2.label ?? id,
          children: n2.label ?? id
        },
        id
      );
    }) }),
    selState.count >= 1 && editable && /* @__PURE__ */ jsxs("div", { "data-editops-toolbar": "true", className: "flex flex-wrap items-center gap-1 mt-2 text-[10px]", children: [
      /* @__PURE__ */ jsxs("span", { className: "text-gray-500 mr-1", children: [
        selState.count,
        " selected:"
      ] }),
      ALIGN_EDGES.map((edge) => /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": `align-${edge}`,
          disabled: !canAlign,
          title: canAlign ? `${ALIGN_LABELS[edge]}${selState.count > 1 ? " to primary" : " to plan"}` : "Requires multi-object page channel (O-035 mount)",
          onClick: () => opAlign(edge),
          className: `px-1.5 py-0.5 rounded-sm border ${canAlign ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
          children: ALIGN_TEXT[edge]
        },
        edge
      )),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": "distribute-x",
          disabled: !canDistribute,
          title: selState.count < 3 ? "Select 3+ objects to distribute" : multiChannel ? "Distribute horizontally" : "Requires multi-object page channel (O-035 mount)",
          onClick: () => opDistribute("x"),
          className: `px-1.5 py-0.5 rounded-sm border ${canDistribute ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
          children: "Dist X"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": "distribute-z",
          disabled: !canDistribute,
          title: selState.count < 3 ? "Select 3+ objects to distribute" : multiChannel ? "Distribute vertically" : "Requires multi-object page channel (O-035 mount)",
          onClick: () => opDistribute("z"),
          className: `px-1.5 py-0.5 rounded-sm border ${canDistribute ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
          children: "Dist Z"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": "rotate-ccw",
          disabled: !canRotateSel,
          title: canRotateSel ? "Rotate \u221215\xB0 ([ key)" : "Select an item to rotate",
          onClick: () => opRotateStep(-ROTATE_KEY_STEP_DEGREES),
          className: `px-1.5 py-0.5 rounded-sm border ${canRotateSel ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
          children: "\u27F215\xB0"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": "rotate-cw",
          disabled: !canRotateSel,
          title: canRotateSel ? "Rotate +15\xB0 (] key)" : "Select an item to rotate",
          onClick: () => opRotateStep(ROTATE_KEY_STEP_DEGREES),
          className: `px-1.5 py-0.5 rounded-sm border ${canRotateSel ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
          children: "\u27F315\xB0"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": "duplicate",
          disabled: !canDuplicate,
          title: canDuplicate ? "Duplicate selection (Ctrl+D)" : "Requires duplicate page channel (O-035 mount)",
          onClick: opDuplicate,
          className: `px-1.5 py-0.5 rounded-sm border ${canDuplicate ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
          children: "Duplicate"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": "mirror",
          disabled: !canMirrorSel,
          title: canMirrorSel ? "Mirror selection about the plan's vertical center" : "Select an item, pole or wall to mirror",
          onClick: opMirror,
          className: `px-1.5 py-0.5 rounded-sm border ${canMirrorSel ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
          children: "Mirror"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": "export-plan",
          title: "Download a labeled plan drawing (SVG)",
          onClick: exportPlan,
          className: "px-1.5 py-0.5 rounded-sm border border-gray-300 hover:bg-gray-50 text-gray-700",
          children: "Export"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "data-op": "delete",
          disabled: !canDelete,
          title: canDelete ? "Delete selection (Del)" : "Requires delete page channel",
          onClick: opDelete,
          className: `px-1.5 py-0.5 rounded-sm border ${canDelete ? "border-red-300 hover:bg-red-50 text-red-700" : "border-gray-200 text-gray-300"}`,
          children: "Delete"
        }
      ),
      reparentableIds.length >= 1 && /* @__PURE__ */ jsxs("span", { className: "relative inline-block", children: [
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            "data-op": "reparent",
            disabled: !canReparent,
            title: canReparent ? "Mount, remount, or detach the selected object" : "Requires multi-object page channel (O-035 mount)",
            onClick: () => {
              setReparentOpen((v) => !v);
              setReparentNote(null);
            },
            className: `px-1.5 py-0.5 rounded-sm border ${canReparent ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`,
            children: "Mount \u25BE"
          }
        ),
        reparentOpen && canReparent && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx2("div", { className: "fixed inset-0 z-30", onClick: () => setReparentOpen(false) }),
          /* @__PURE__ */ jsxs(
            "div",
            {
              "data-reparent-menu": "true",
              className: "absolute left-0 bottom-full mb-1 z-40 w-56 max-h-60 overflow-auto rounded-sm border border-gray-300 bg-white shadow-lg text-left",
              children: [
                reparentLocalEligible && /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-200 text-gray-600 cursor-pointer", children: [
                  /* @__PURE__ */ jsx2(
                    "input",
                    {
                      type: "checkbox",
                      checked: reparentKeep === "local",
                      onChange: (e) => setReparentKeep(e.target.checked ? "local" : "world")
                    }
                  ),
                  "Keep local offset (poles only)"
                ] }),
                (reparentTargets?.targets || []).map((t) => /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    "data-reparent-target": t.kind,
                    disabled: !!t.current,
                    onClick: () => runReparent(t),
                    className: `block w-full px-2 py-1 text-left ${t.current ? "text-sky-700 bg-sky-50" : "text-gray-700 hover:bg-gray-50"}`,
                    children: [
                      t.label,
                      t.current ? " \u2014 current" : ""
                    ]
                  },
                  `${t.kind}:${t.componentId}`
                )),
                reparentTargets?.detach && /* @__PURE__ */ jsx2(
                  "button",
                  {
                    type: "button",
                    "data-reparent-target": "standalone",
                    disabled: reparentTargets.detached,
                    onClick: () => runReparent("standalone"),
                    className: `block w-full px-2 py-1 text-left border-t border-gray-200 ${reparentTargets.detached ? "text-gray-300" : "text-red-700 hover:bg-red-50"}`,
                    children: "Detach (standalone)"
                  }
                )
              ]
            }
          )
        ] })
      ] })
    ] }),
    singleItemSel && editable && /* @__PURE__ */ jsxs("div", { "data-typed-bar": "true", className: "flex flex-wrap items-center gap-1 mt-2 text-[10px] text-gray-500", children: [
      /* @__PURE__ */ jsx2("span", { className: "mr-1", children: "Position/size (in):" }),
      typedField("x", "Plan X (inches, e.g. 96 or 8')", primaryItemRow.item.x_inches, dimParse, formatFoundationDimension),
      typedField("z", "Plan Z (inches)", primaryItemRow.item.z_inches, dimParse, formatFoundationDimension),
      primaryItemRow.item.foundation_type === "pillar" ? typedField("diameter", "Diameter (inches)", primaryItemRow.item.diameter, dimParse, formatFoundationDimension) : /* @__PURE__ */ jsxs(Fragment, { children: [
        typedField("length", "Length (inches)", primaryItemRow.item.length_inches, dimParse, formatFoundationDimension),
        typedField("width", "Width (inches)", primaryItemRow.item.width_inches, dimParse, formatFoundationDimension)
      ] }),
      typedField("rotation", "Rotation (degrees)", primaryItemRow.item.rotation_degrees ?? 0, rotParse, (v) => String(v ?? 0))
    ] }),
    reparentNote && /* @__PURE__ */ jsx2("p", { "data-reparent-note": "true", className: "mt-1 text-[11px] text-amber-700", children: reparentNote }),
    invalidNotes.map(({ index }) => /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[11px] text-amber-700", children: [
      "Foundation ",
      index + 1,
      " needs valid dimensions/coordinates before placement."
    ] }, index))
  ] });
}
export {
  FoundationLayoutCanvas as default
};
