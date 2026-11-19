// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/FoundationLayoutCanvas.jsx
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Move, ZoomIn, ZoomOut } from "lucide-react";

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationSceneTransforms.js
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

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationLayoutModel.js
var FOUNDATION_LAYOUT_WIDTH_INCHES = 480;
var FOUNDATION_LAYOUT_DEPTH_INCHES = 320;
var finiteNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
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

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationSceneInput.js
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
    const r = Math.min(g.size.width, g.size.depth) / 2;
    const d = hypot(p.x - g.center.x, p.z - g.center.z);
    if (Math.abs(d - r) <= tol.edgeInches) {
      return baseHit("item-edge", "items", index, item, p, {
        edge: "rim",
        distance: Math.abs(d - r)
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
    const r = distToSegment(p, a, b);
    if (r.degenerate) continue;
    if (r.d <= tol.edgeInches && (!best || r.d < best.distance)) {
      best = baseHit("wall-segment", "walls", index, wall, p, {
        segmentIndex: i,
        segmentComponentId: segs[i]?.component_id ?? null,
        t: r.t,
        projection: r.projection,
        distance: r.d
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
function beginSceneDrag({ pointerId, key, identityKind, legacyIndex, count, corner, grabPoint, fingerprint } = {}) {
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

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationSceneHistory.js
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
function rowsWithPatch(rows, index, patch) {
  if (!Array.isArray(rows)) return rows;
  if (typeof index !== "number" || index < 0 || index >= rows.length || !patch) return rows;
  return rows.map((r, i) => i === index ? { ...r, ...patch } : r);
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

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationSceneSelection.js
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
  const i = (rows || []).findIndex((r) => r?.component_id === ref);
  return i >= 0 ? `${kind}:${layoutItemKey(rows[i], i)}` : null;
};
var parentByIndex = (idx, rows, kind) => {
  const n = typeof idx === "string" && /^\d+$/.test(idx) ? parseInt(idx, 10) : idx;
  if (!Number.isInteger(n) || n < 0 || n >= (rows || []).length) return null;
  return `${kind}:${layoutItemKey(rows[n], n)}`;
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
    const n = nodes.get(id);
    if (n) n.depth = d;
    order.push(id);
    (childIds.get(id) || []).forEach((c) => visit(c, d + 1));
  };
  for (const id of itemIds) if (id) visit(id, 0);
  for (const id of wallIds) if (id) visit(id, 0);
  for (const id of poleIds) if (id && !nodes.get(id)?.parentId) visit(id, 0);
  for (const id of nodes.keys()) if (!depth.has(id)) visit(id, 0);
  for (const [id, n] of nodes) if (!n.parentId) roots.push(id);
  return { nodes, order, roots };
}
function resolveSceneNode(scene, nodeId) {
  const parsed = parseSceneNodeId(nodeId);
  if (!parsed) return null;
  const cols = sceneCollections(scene);
  const findRow = (rows, key) => {
    const i = (rows || []).findIndex((r, j) => layoutItemKey(r, j) === key);
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
        const n = parseInt(parsed.ref.slice(6), 10);
        si = Number.isInteger(n) && n >= 0 && n < Math.max(wallSegmentCount(found.row), segs.length) ? n : -1;
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
        const n = parseInt(parsed.ref.slice(6), 10);
        si = Number.isInteger(n) && n >= 0 && n < signs.length ? n : -1;
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
var regionIsUsable = (r) => !!r && fin4(r.minX) && fin4(r.minZ) && fin4(r.maxX) && fin4(r.maxZ) && r.minX <= r.maxX && r.minZ <= r.maxZ;
var pointInRegion = (r, p) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
var regionCorners = (r) => [
  { x: r.minX, z: r.minZ },
  { x: r.maxX, z: r.minZ },
  { x: r.maxX, z: r.maxZ },
  { x: r.minX, z: r.maxZ }
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
var segmentIntersectsRegion = (a, b, r) => {
  if (pointInRegion(r, a) || pointInRegion(r, b)) return true;
  const c = regionCorners(r);
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
var circleIntersectsRegion = (center, radius, r) => {
  const cx = Math.min(Math.max(center.x, r.minX), r.maxX);
  const cz = Math.min(Math.max(center.z, r.minZ), r.maxZ);
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
var itemInRegion = (item, r, mode) => {
  const g = itemPlanGeometry(item);
  if (!g) return false;
  if (g.circular) {
    const radius = Math.min(g.size.width, g.size.depth) / 2;
    if (mode === "contain") {
      return g.center.x - radius >= r.minX && g.center.x + radius <= r.maxX && g.center.z - radius >= r.minZ && g.center.z + radius <= r.maxZ;
    }
    return circleIntersectsRegion(g.center, radius, r);
  }
  const corners = framePlanCorners(g.frame, g.size);
  if (!corners) return false;
  const list = [corners.nw, corners.ne, corners.se, corners.sw];
  if (mode === "contain") return list.every((c) => pointInRegion(r, c));
  return rectsIntersect(list, regionCorners(r));
};
var wallInRegion = (wall, r, mode) => {
  const g = wallPlanGeometry(wall);
  if (!g || !g.points.length) return false;
  if (mode === "contain") {
    return g.points.every((p) => pointInRegion(r, p));
  }
  if (g.points.some((p) => pointInRegion(r, p))) return true;
  const segCount = g.closed ? g.points.length : g.points.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    if (segmentIntersectsRegion(g.points[i], g.points[(i + 1) % g.points.length], r)) return true;
  }
  if (g.closed && pointInPolygon2(regionCorners(r)[0], g.points)) return true;
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
  const has = (id) => ids.includes(id);
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
    if (has(id)) {
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
  const isSelected = (id) => has(id);
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
    const n = tree.nodes.get(next);
    describe(next, { id: next, kind: n?.kind }, n ? {
      collection: n.collection,
      index: n.index,
      key: n.key,
      componentId: n.componentId,
      label: n.label,
      parentId: n.parentId,
      segmentIndex: n.segmentIndex ?? null,
      signIndex: n.signIndex ?? null
    } : void 0);
    setState([next], next, { [next]: { type: "row" } }, descriptors);
    return { status: "cycled", id: next, label: n?.label ?? null };
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
        const n = tree2.nodes.get(id);
        nextDescriptors2[id] = descriptorFor(
          { id, kind: n?.kind },
          { collection: n?.collection, index: n?.index, key: n?.key, componentId: n?.componentId, label: n?.label, parentId: n?.parentId }
        );
      }
      const nextPrimary = picked.length ? picked[picked.length - 1] : primaryId;
      setState(nextIds, nextPrimary, nextParts2, nextDescriptors2);
      return { status: "marquee", ids: [...nextIds], picked, additive: true };
    }
    const tree = buildSceneTree(scene);
    const nextDescriptors = {};
    for (const id of picked) {
      const n = tree.nodes.get(id);
      nextDescriptors[id] = descriptorFor(
        { id, kind: n?.kind },
        { collection: n?.collection, index: n?.index, key: n?.key, componentId: n?.componentId, label: n?.label, parentId: n?.parentId }
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

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/FoundationLayoutCanvas.jsx
import { jsx, jsxs } from "react/jsx-runtime";
function FoundationLayoutCanvas({
  items = [],
  poles = [],
  walls = [],
  wallCaps = [],
  signageCabinets = [],
  onMoveItem,
  sceneHistory = null,
  sceneSelection = null,
  onDeleteSelection
}) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const editable = typeof onMoveItem === "function";
  const scene = { items, poles, walls, wall_caps: wallCaps, signage_cabinets: signageCabinets };
  const internalHistoryRef = useRef(null);
  if (!internalHistoryRef.current) internalHistoryRef.current = createSceneHistory();
  const history = sceneHistory || internalHistoryRef.current;
  useEffect(() => {
    history.observe(sceneLayoutAnchor(items));
  }, [history, items]);
  const internalSelectionRef = useRef(null);
  if (!internalSelectionRef.current) internalSelectionRef.current = createSceneSelection();
  const selection = sceneSelection || internalSelectionRef.current;
  useSyncExternalStore(selection.subscribe, () => selection.stateVersion);
  const selState = selection.getState();
  const selIds = new Set(selState.ids);
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
      pickRef.current = null;
      marqueeRef.current = null;
    };
  }, []);
  const cancelDrag = (e) => {
    if (e?.pointerId !== void 0 && dragRef.current && e.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    pickRef.current = null;
    marqueeRef.current = null;
    selection.cancelMarquee();
    setPreview(null);
  };
  const focusNode = (id) => {
    const el = boxRef.current?.querySelector?.(`[data-node-id="${String(id).replace(/"/g, '\\"')}"]`);
    if (el && typeof el.focus === "function") el.focus();
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
  const onPointerDown = (e, item, index) => {
    if (!mountedRef.current || e.button !== 0) return;
    if (e.isPrimary === false || dragRef.current) return;
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
    dragRef.current = beginSceneDrag({
      pointerId: e.pointerId,
      key,
      identityKind: kind,
      legacyIndex: index,
      count: items.length,
      corner: { x: pos.x_inches, z: pos.z_inches },
      grabPoint: point,
      fingerprint: layoutItemFingerprint(item)
    });
    try {
      boxRef.current.setPointerCapture(e.pointerId);
    } catch {
      cancelDrag();
      return;
    }
    setPreview({ key, x: pos.x_inches, z: pos.z_inches });
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
    const d = dragRef.current;
    if (d && e.pointerId === d.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (!point) return;
      d.moved = true;
      d.last = sceneDragCorner(d, point);
      setPreview({ key: d.key, x: d.last.x, z: d.last.z });
      return;
    }
    const m = marqueeRef.current;
    if (m && e.pointerId === m.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (point) selection.updateMarquee(point);
    }
  };
  const commitDrag = (e) => {
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
    const patch = commitSceneDrag(d, point);
    if (!patch) {
      if (pick && isClickRelease(pick, e)) {
        selection.selectHit(pick.hit, { additive: pick.additive });
      }
      return;
    }
    const target = resolveSceneDragTarget(d, items);
    if (!target) return;
    if (typeof onMoveItem !== "function") return;
    const edit = sceneEditFromDrag(d, patch);
    const applied = onMoveItem(target.index, patch);
    if (applied === false) return;
    if (edit) {
      history.recordEdit({
        ...edit,
        target: { key: d.key, index: target.index },
        label: `Move Foundation ${target.index + 1}`,
        coalesceKey: sceneEditCoalesceKey(edit),
        beforeAnchor: sceneLayoutAnchor(rowsWithPatch(items, target.index, edit.before)),
        afterAnchor: sceneLayoutAnchor(rowsWithPatch(items, target.index, patch))
      });
    }
  };
  const onKeyDown = (e, item, index) => {
    if (!mountedRef.current || !editable) return;
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
        history.recordEdit({
          ...edit,
          target: { key: layoutItemKey(item, index), index },
          label: `Move Foundation ${index + 1}`,
          coalesceKey: sceneEditCoalesceKey(edit),
          beforeAnchor: sceneLayoutAnchor(rowsWithPatch(items, index, edit.before)),
          afterAnchor: sceneLayoutAnchor(rowsWithPatch(items, index, patch))
        });
      }
      return;
    }
    if (applySelectionKey(e)) e.stopPropagation();
  };
  const onPlanKeyDown = (e) => {
    if (!mountedRef.current) return;
    if (e.target !== e.currentTarget) return;
    applySelectionKey(e);
  };
  const invalidNotes = items.map((item, index) => ({ item, index })).filter(({ item }) => !foundationLayoutFootprint(item) || !layoutPositionInches(item).valid);
  const marquee = selState.marquee;
  const marqueeRect = marquee ? {
    x: Math.min(marquee.start.x, marquee.current.x),
    z: Math.min(marquee.start.z, marquee.current.z),
    w: Math.abs(marquee.current.x - marquee.start.x),
    h: Math.abs(marquee.current.z - marquee.start.z)
  } : null;
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-sm border border-gray-200 p-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 mb-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "text-[13px] font-bold text-gray-900", children: "Layout Canvas" }),
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-400", children: editable ? "Drag a foundation or use arrow keys (Shift for larger steps). Click selects, Ctrl/Shift-click adds, drag empty space to box-select, Tab/arrows cycle, Esc clears." : "Foundation positions (read-only). Click to select, drag empty space to box-select." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap text-[11px] text-gray-600", children: [
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsx(Move, { className: "w-3 h-3", "aria-hidden": "true" }),
          " Move Foundation"
        ] }),
        /* @__PURE__ */ jsx("span", { className: "text-gray-400", children: "40ft \xD7 26ft 8in" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2))),
            "aria-label": "Zoom layout out",
            className: "w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50",
            children: /* @__PURE__ */ jsx(ZoomOut, { className: "w-3 h-3", "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ jsxs("span", { className: "w-10 text-center", children: [
          Math.round(zoom * 100),
          "%"
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2))),
            "aria-label": "Zoom layout in",
            className: "w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50",
            children: /* @__PURE__ */ jsx(ZoomIn, { className: "w-3 h-3", "aria-hidden": "true" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "overflow-auto rounded-sm border border-gray-300 bg-gray-50", children: /* @__PURE__ */ jsxs(
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
          items.map((item, index) => {
            const fp = foundationLayoutFootprint(item);
            const pos = layoutPositionInches(item);
            if (!fp || !pos.valid) return null;
            const key = layoutItemKey(item, index);
            const nodeId = sceneNodeId.item(key);
            const isSel = selIds.has(nodeId);
            const isPrimary = selState.primaryId === nodeId;
            const shown = preview && preview.key === key ? { x_inches: preview.x, z_inches: preview.z } : pos;
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
                className: `absolute flex items-center justify-center border-2 text-[10px] font-semibold ${isSel ? "border-solid border-sky-600 bg-sky-100/70 text-sky-900 z-10" : "border-dashed border-amber-500 bg-amber-100/70 text-amber-800"} ${editable ? "cursor-move" : ""} ${item.foundation_type === "pillar" ? "rounded-full" : "rounded-sm"}`,
                style: {
                  left: pctW(shown.x_inches),
                  top: pctD(shown.z_inches),
                  width: pctW(fp.width),
                  height: pctD(fp.depth),
                  transform: `rotate(${item.rotation_degrees || 0}deg)`,
                  touchAction: editable ? "none" : void 0
                },
                title: `Foundation ${index + 1}`,
                children: [
                  "Foundation ",
                  index + 1,
                  isPrimary && editable && [0, 1, 2, 3].map((h) => /* @__PURE__ */ jsx(
                    "span",
                    {
                      "data-selection-handle": "true",
                      "aria-hidden": "true",
                      className: "absolute w-2 h-2 bg-white border border-sky-700 rounded-[2px]",
                      style: {
                        left: h === 0 || h === 3 ? "-4px" : void 0,
                        right: h === 1 || h === 2 ? "-4px" : void 0,
                        top: h === 0 || h === 1 ? "-4px" : void 0,
                        bottom: h === 2 || h === 3 ? "-4px" : void 0,
                        pointerEvents: "none"
                      }
                    },
                    h
                  ))
                ]
              },
              key
            );
          }),
          preview && /* @__PURE__ */ jsx("div", { className: "absolute left-1 top-1 z-10 rounded-sm bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800", style: { pointerEvents: "none" }, children: "Move preview - release to apply" }),
          marqueeRect && /* @__PURE__ */ jsx(
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
          poles.map((pole, index) => {
            const nodeId = sceneNodeId.pole(layoutItemKey(pole, index));
            const isSel = selIds.has(nodeId);
            return /* @__PURE__ */ jsx(
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
          })
        ]
      }
    ) }),
    invalidNotes.map(({ index }) => /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[11px] text-amber-700", children: [
      "Foundation ",
      index + 1,
      " needs valid dimensions/coordinates before placement."
    ] }, index))
  ] });
}
export {
  FoundationLayoutCanvas
};
