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

// src/components/estimator/foundation/foundationLayoutModel.js
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
export {
  FOUNDATION_LAYOUT_DEPTH_INCHES,
  FOUNDATION_LAYOUT_WIDTH_INCHES,
  foundationLayoutFootprint,
  layoutItemFingerprint,
  layoutItemKey,
  layoutPointInches,
  layoutPositionInches
};
