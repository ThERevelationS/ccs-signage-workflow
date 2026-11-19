var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationSceneSelection.js
var foundationSceneSelection_exports = {};
__export(foundationSceneSelection_exports, {
  REGION_SELECT_MODES: () => REGION_SELECT_MODES,
  SCENE_NODE_KINDS: () => SCENE_NODE_KINDS,
  SELECTION_CLICK_THRESHOLD_PX: () => SELECTION_CLICK_THRESHOLD_PX,
  beginClickCandidate: () => beginClickCandidate,
  buildSceneTree: () => buildSceneTree,
  clickTravelPx: () => clickTravelPx,
  createSceneSelection: () => createSceneSelection,
  hitPartFromHit: () => hitPartFromHit,
  isClickRelease: () => isClickRelease,
  nodeBreadcrumb: () => nodeBreadcrumb,
  nodeTargetForHit: () => nodeTargetForHit,
  parseSceneNodeId: () => parseSceneNodeId,
  regionFromPoints: () => regionFromPoints,
  resolveSceneNode: () => resolveSceneNode,
  sceneCollections: () => sceneCollections,
  sceneNodeId: () => sceneNodeId,
  sceneObjectsInRegion: () => sceneObjectsInRegion,
  selectionKeyAction: () => selectionKeyAction
});

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationLayoutModel.js
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

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationSceneTransforms.js
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
var foundationSceneInput_exports = {};
__export(foundationSceneInput_exports, {
  DEFAULT_HIT_TOLERANCES: () => DEFAULT_HIT_TOLERANCES,
  SCENE_EDIT_ITEM_MOVE: () => SCENE_EDIT_ITEM_MOVE,
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
  sceneEditCoalesceKey: () => sceneEditCoalesceKey,
  sceneEditFromDrag: () => sceneEditFromDrag,
  sceneEditFromNudge: () => sceneEditFromNudge,
  sceneObjectLabel: () => sceneObjectLabel,
  scenePointerToPlan: () => scenePointerToPlan,
  snapCandidatesForScene: () => snapCandidatesForScene,
  snapPlanPoint: () => snapPlanPoint,
  snapToCandidates: () => snapToCandidates,
  snapValue: () => snapValue,
  wallPlanGeometry: () => wallPlanGeometry
});
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

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationSceneSelection.js
var fin3 = (v) => typeof v === "number" && Number.isFinite(v);
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
        t: fin3(hit.t) ? hit.t : null
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
    if (hit.kind === "wall-segment" && fin3(hit.segmentIndex)) {
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
  if (!fin3(clientX) || !fin3(clientY)) return null;
  return {
    pointerId: pointerId === void 0 ? null : pointerId,
    clientX,
    clientY,
    hit,
    additive: additive === true
  };
}
function clickTravelPx(candidate, point) {
  if (!candidate || !fin3(candidate.clientX) || !fin3(candidate.clientY)) return null;
  const x = fin3(point?.clientX) ? point.clientX : fin3(point?.x) ? point.x : null;
  const y = fin3(point?.clientY) ? point.clientY : fin3(point?.y) ? point.y : null;
  if (x === null || y === null) return null;
  return hypot2(x - candidate.clientX, y - candidate.clientY);
}
function isClickRelease(candidate, releaseEvent, thresholdPx = SELECTION_CLICK_THRESHOLD_PX) {
  const d = clickTravelPx(candidate, releaseEvent);
  const t = fin3(thresholdPx) && thresholdPx >= 0 ? thresholdPx : SELECTION_CLICK_THRESHOLD_PX;
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
var regionIsUsable = (r) => !!r && fin3(r.minX) && fin3(r.minZ) && fin3(r.maxX) && fin3(r.maxZ) && r.minX <= r.maxX && r.minZ <= r.maxZ;
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

// .audit-work/foundation-o034-selection/staging-src/components/estimator/foundation/foundationSceneHistory.js
var foundationSceneHistory_exports = {};
__export(foundationSceneHistory_exports, {
  SCENE_HISTORY_CAPACITY: () => SCENE_HISTORY_CAPACITY,
  SCENE_HISTORY_COALESCE_WINDOW_MS: () => SCENE_HISTORY_COALESCE_WINDOW_MS,
  createSceneHistory: () => createSceneHistory,
  rowsWithPatch: () => rowsWithPatch,
  sceneLayoutAnchor: () => sceneLayoutAnchor
});
var fin4 = (v) => typeof v === "number" && Number.isFinite(v);
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
  const cap = fin4(capacity) && capacity >= 1 ? Math.floor(capacity) : SCENE_HISTORY_CAPACITY;
  const window_ = coalesceWindowMs === Infinity ? Infinity : fin4(coalesceWindowMs) && coalesceWindowMs >= 0 ? coalesceWindowMs : SCENE_HISTORY_COALESCE_WINDOW_MS;
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
    const at = fin4(edit.at) ? edit.at : clock();
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
    const at = fin4(opts.at) ? opts.at : clock();
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
    const t = fin4(at) ? at : clock();
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
    const t = fin4(at) ? at : clock();
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
export {
  foundationSceneHistory_exports as history,
  foundationSceneInput_exports as input,
  foundationLayoutModel_exports as model,
  foundationSceneSelection_exports as selection,
  foundationSceneTransforms_exports as transforms
};
