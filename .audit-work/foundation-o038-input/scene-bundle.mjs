var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// staging-src/components/estimator/foundation/foundationSceneTransforms.js
var foundationSceneTransforms_exports = {};
__export(foundationSceneTransforms_exports, {
  DEFAULT_PLAN_EXTENT: () => DEFAULT_PLAN_EXTENT,
  DEFAULT_ZOOM_RANGE: () => DEFAULT_ZOOM_RANGE,
  INCHES_PER_FOOT: () => INCHES_PER_FOOT,
  PLAN_TO_WORLD_SCALE: () => PLAN_TO_WORLD_SCALE,
  SCENE_PLAN_UNITS: () => SCENE_PLAN_UNITS,
  SCENE_SCREEN_UNITS: () => SCENE_SCREEN_UNITS,
  SCENE_WORLD_UNITS: () => SCENE_WORLD_UNITS,
  clampPlanPoint: () => clampPlanPoint,
  clampZoomValue: () => clampZoomValue,
  extentPercentToPlan: () => extentPercentToPlan,
  frameLocalToPlan: () => frameLocalToPlan,
  framePlanCorners: () => framePlanCorners,
  panPlanView: () => panPlanView,
  planFrameForRect: () => planFrameForRect,
  planPointOf: () => planPointOf,
  planRotationToWorldRadians: () => planRotationToWorldRadians,
  planToExtentPercent: () => planToExtentPercent,
  planToFrameLocal: () => planToFrameLocal,
  planToScreen: () => planToScreen,
  planToWorld: () => planToWorld,
  planViewForBounds: () => planViewForBounds,
  planViewForViewport: () => planViewForViewport,
  planViewFromElementRect: () => planViewFromElementRect,
  pointInPlan: () => pointInPlan,
  rotatePlanPointAbout: () => rotatePlanPointAbout,
  screenToPlan: () => screenToPlan,
  worldToPlan: () => worldToPlan,
  zoomPlanViewAt: () => zoomPlanViewAt
});
var SCENE_PLAN_UNITS = "inches";
var SCENE_SCREEN_UNITS = "css-px";
var SCENE_WORLD_UNITS = "feet";
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
function planViewForViewport({ viewport, extent = DEFAULT_PLAN_EXTENT, zoom = 1, panX = 0, panY = 0, padding = 0 } = {}) {
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
    pan: { x: px, y: py }
  };
}
function planViewForBounds(bounds, viewport, { padding = 0, zoom = 1, panX = 0, panY = 0 } = {}) {
  if (!bounds || !fin(bounds.minX) || !fin(bounds.minZ) || !fin(bounds.maxX) || !fin(bounds.maxZ)) return null;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  if (w < 0 || d < 0) return null;
  const ex = { width: Math.max(w, 1), depth: Math.max(d, 1) };
  const cx = bounds.minX + w / 2;
  const cz = bounds.minZ + d / 2;
  const view = planViewForViewport({ viewport, extent: ex, zoom, panX, panY, padding });
  if (!view) return null;
  const centerX = ex.width / 2;
  const centerZ = ex.depth / 2;
  return {
    ...view,
    originX: view.originX + (centerX - cx) * view.scaleX,
    originY: view.originY + (centerZ - cz) * view.scaleY,
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
function planToScreen(view, xInches, zInches) {
  if (!fin(xInches) || !fin(zInches)) return null;
  if (!validView(view)) return null;
  return {
    x: xInches * view.scaleX + view.originX,
    y: zInches * view.scaleY + view.originY
  };
}
function planToExtentPercent(xInches, zInches, extent = DEFAULT_PLAN_EXTENT) {
  const ex = resolveExtent(extent);
  if (!fin(xInches) || !fin(zInches) || !validExtent(ex)) return null;
  return { leftPct: xInches / ex.width * 100, topPct: zInches / ex.depth * 100 };
}
function extentPercentToPlan(leftPct, topPct, extent = DEFAULT_PLAN_EXTENT) {
  const ex = resolveExtent(extent);
  if (!fin(leftPct) || !fin(topPct) || !validExtent(ex)) return null;
  return { x_inches: leftPct / 100 * ex.width, z_inches: topPct / 100 * ex.depth };
}
function clampZoomValue(zoom, { min = DEFAULT_ZOOM_RANGE.min, max = DEFAULT_ZOOM_RANGE.max } = {}) {
  if (!fin(zoom)) return null;
  const lo = fin(min) ? min : -Infinity;
  const hi = fin(max) ? max : Infinity;
  return Math.min(hi, Math.max(lo, zoom));
}
function zoomPlanViewAt(view, factor, anchor, zoomRange) {
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
    originY: anchor.y - (anchor.y - view.originY) * f
  };
  if (fin(view.zoom)) next.zoom = view.zoom * f;
  return next;
}
function panPlanView(view, dxScreen, dyScreen) {
  if (!validView(view) || !fin(dxScreen) || !fin(dyScreen)) return null;
  const next = { ...view, originX: view.originX + dxScreen, originY: view.originY + dyScreen };
  if (view.pan && fin(view.pan.x) && fin(view.pan.y)) next.pan = { x: view.pan.x + dxScreen, y: view.pan.y + dyScreen };
  return next;
}
function pointInPlan(point, extent = DEFAULT_PLAN_EXTENT) {
  const p = planPointOf(point);
  const ex = resolveExtent(extent);
  return !!p && validExtent(ex) && p.x >= 0 && p.x <= ex.width && p.z >= 0 && p.z <= ex.depth;
}
function clampPlanPoint(point, extent = DEFAULT_PLAN_EXTENT) {
  const p = planPointOf(point);
  const ex = resolveExtent(extent);
  if (!p || !validExtent(ex)) return null;
  return { x: Math.min(ex.width, Math.max(0, p.x)), z: Math.min(ex.depth, Math.max(0, p.z)) };
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
function rotatePlanPointAbout(point, center, degrees) {
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
function planToWorld(point, { elevationInches = 0 } = {}) {
  const p = planPointOf(point);
  if (!p) return null;
  const el = fin(elevationInches) ? elevationInches : 0;
  return { x: p.x * PLAN_TO_WORLD_SCALE, y: el * PLAN_TO_WORLD_SCALE, z: p.z * PLAN_TO_WORLD_SCALE };
}
function worldToPlan(world) {
  if (!world || !fin(world.x) || !fin(world.z)) return null;
  return {
    x_inches: world.x * INCHES_PER_FOOT,
    z_inches: world.z * INCHES_PER_FOOT,
    elevation_inches: fin(world.y) ? world.y * INCHES_PER_FOOT : 0
  };
}
function planRotationToWorldRadians(degrees) {
  return fin(degrees) ? degrees * DEG_TO_RAD : 0;
}

// staging-src/components/estimator/foundation/foundationSceneInput.js
var foundationSceneInput_exports = {};
__export(foundationSceneInput_exports, {
  DEFAULT_HIT_TOLERANCES: () => DEFAULT_HIT_TOLERANCES,
  SCENE_KEYBOARD_BIG_STEP_INCHES: () => SCENE_KEYBOARD_BIG_STEP_INCHES,
  SCENE_KEYBOARD_STEP_INCHES: () => SCENE_KEYBOARD_STEP_INCHES,
  beginSceneDrag: () => beginSceneDrag,
  classifyPlanPoint: () => classifyPlanPoint,
  commitSceneDrag: () => commitSceneDrag,
  hitLabel: () => hitLabel,
  hitTestPlan: () => hitTestPlan,
  hitTestPlanAll: () => hitTestPlanAll,
  isPrimaryScenePress: () => isPrimaryScenePress,
  itemPlanGeometry: () => itemPlanGeometry,
  keyboardNudge: () => keyboardNudge,
  normalizeScenePointer: () => normalizeScenePointer,
  nudgePatch: () => nudgePatch,
  positionPatch: () => positionPatch,
  resolveSceneDragTarget: () => resolveSceneDragTarget,
  sceneDragCorner: () => sceneDragCorner,
  sceneObjectLabel: () => sceneObjectLabel,
  scenePointerToPlan: () => scenePointerToPlan,
  snapCandidatesForScene: () => snapCandidatesForScene,
  snapPlanPoint: () => snapPlanPoint,
  snapToCandidates: () => snapToCandidates,
  snapValue: () => snapValue,
  wallPlanGeometry: () => wallPlanGeometry
});

// staging-src/components/estimator/foundation/foundationLayoutModel.js
var foundationLayoutModel_exports = {};
__export(foundationLayoutModel_exports, {
  FOUNDATION_LAYOUT_DEPTH_INCHES: () => FOUNDATION_LAYOUT_DEPTH_INCHES,
  FOUNDATION_LAYOUT_WIDTH_INCHES: () => FOUNDATION_LAYOUT_WIDTH_INCHES,
  foundationLayoutFootprint: () => foundationLayoutFootprint,
  layoutItemFingerprint: () => layoutItemFingerprint,
  layoutItemKey: () => layoutItemKey,
  layoutPointInches: () => layoutPointInches,
  layoutPositionInches: () => layoutPositionInches
});
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

// staging-src/components/estimator/foundation/foundationSceneInput.js
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
function normalizeScenePointer(event) {
  if (!event || typeof event !== "object") return null;
  let clientX = event.clientX;
  let clientY = event.clientY;
  if (!fin2(clientX) || !fin2(clientY)) {
    const lists = [event.touches, event.changedTouches, event.targetTouches];
    for (const list of lists) {
      const t = list && list.length > 0 ? list[0] : null;
      if (t && fin2(t.clientX) && fin2(t.clientY)) {
        clientX = t.clientX;
        clientY = t.clientY;
        break;
      }
    }
  }
  if (!fin2(clientX) || !fin2(clientY)) return null;
  const type = typeof event.pointerType === "string" && event.pointerType ? event.pointerType : typeof event.type === "string" && event.type.startsWith("touch") ? "touch" : "mouse";
  return {
    pointerId: event.pointerId === void 0 ? null : event.pointerId,
    pointerType: type,
    clientX,
    clientY,
    button: fin2(event.button) ? event.button : 0,
    buttons: fin2(event.buttons) ? event.buttons : 0,
    isPrimary: event.isPrimary !== false,
    shiftKey: event.shiftKey === true,
    ctrlKey: event.ctrlKey === true,
    metaKey: event.metaKey === true,
    altKey: event.altKey === true
  };
}
function isPrimaryScenePress(pointer) {
  const p = pointer && pointer.clientX !== void 0 ? pointer : normalizeScenePointer(pointer);
  if (!p) return false;
  return p.button === 0 && p.isPrimary !== false;
}
function scenePointerToPlan(event, rect, extent = PLAN_EXTENT) {
  const pointer = normalizeScenePointer(event);
  if (!pointer) return null;
  const view = planViewFromElementRect(rect, extent);
  const point = screenToPlan(view, pointer.clientX, pointer.clientY);
  if (!point) return null;
  return { pointer, point };
}
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
function hitTestPlan(scene, point, opts = {}) {
  const hits = hitTestPlanAll(scene, point, opts);
  return hits.length ? hits[0] : null;
}
function classifyPlanPoint(point, extent = PLAN_EXTENT) {
  const p = planPointOf(point);
  if (!p) return "invalid";
  const w = fin2(extent?.width) ? extent.width : DEFAULT_PLAN_EXTENT.width;
  const d = fin2(extent?.depth) ? extent.depth : DEFAULT_PLAN_EXTENT.depth;
  return p.x >= 0 && p.x <= w && p.z >= 0 && p.z <= d ? "inside" : "outside";
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
function positionPatch(point, { round = false } = {}) {
  const p = planPointOf(point);
  if (!p) return null;
  const x = round ? Math.round(p.x) : p.x;
  const z = round ? Math.round(p.z) : p.z;
  if (!fin2(x) || !fin2(z)) return null;
  return { x_inches: x, z_inches: z };
}
function snapValue(v, step) {
  if (!fin2(v) || !fin2(step) || step <= 0) return v;
  return Math.round(v / step) * step;
}
function snapPlanPoint(point, step) {
  const p = planPointOf(point);
  if (!p || !fin2(step) || step <= 0) return null;
  return { x: snapValue(p.x, step), z: snapValue(p.z, step) };
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
export {
  foundationSceneInput_exports as input,
  foundationLayoutModel_exports as model,
  foundationSceneTransforms_exports as transforms
};
