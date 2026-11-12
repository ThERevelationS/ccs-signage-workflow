// src/components/estimator/foundation/foundationSceneTransforms.js
var INCHES_PER_FOOT = 12;
var PLAN_TO_WORLD_SCALE = 1 / INCHES_PER_FOOT;
var DEFAULT_PLAN_EXTENT = Object.freeze({ width: 480, depth: 320 });
var DEFAULT_ZOOM_RANGE = Object.freeze({ min: 0.5, max: 2 });
var DEG_TO_RAD = Math.PI / 180;

// src/components/estimator/foundation/foundationLayoutModel.js
var finiteNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
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

// src/components/estimator/foundation/foundationLandscapeAnchor.js
var LANDSCAPE_ANCHOR_VERSION = 1;
var CARDINALS = [0, 90, 180, 270];
var num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
function sanitizeLandscapeAnchor(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ox = num(raw.origin_x_inches);
  const oz = num(raw.origin_z_inches);
  const rot = num(raw.rotation_degrees);
  const rotation = rot === null ? 0 : CARDINALS.reduce((a, b) => Math.abs(b - (rot % 360 + 360) % 360) < Math.abs(a - (rot % 360 + 360) % 360) ? b : a, 0);
  return {
    version: LANDSCAPE_ANCHOR_VERSION,
    origin_x_inches: ox,
    origin_z_inches: oz,
    rotation_degrees: rotation,
    confirmed: raw.confirmed === true,
    confirmed_at: typeof raw.confirmed_at === "string" ? raw.confirmed_at : null
  };
}
function landscapeAnchorConfirmed(anchor) {
  const a = sanitizeLandscapeAnchor(anchor);
  return !!(a && a.confirmed === true && a.origin_x_inches !== null && a.origin_z_inches !== null);
}
function landscapePointToPlan(anchor, lx, lz) {
  const a = sanitizeLandscapeAnchor(anchor);
  if (!a || a.origin_x_inches === null || a.origin_z_inches === null) return null;
  const x = num(lx);
  const z = num(lz);
  if (x === null || z === null) return null;
  const r = a.rotation_degrees;
  const px = r === 0 ? x : r === 90 ? -z : r === 180 ? -x : z;
  const pz = r === 0 ? z : r === 90 ? x : r === 180 ? -z : -x;
  return { x: a.origin_x_inches + px, z: a.origin_z_inches + pz };
}
function planPointToLandscape(anchor, px, pz) {
  const a = sanitizeLandscapeAnchor(anchor);
  if (!a || a.origin_x_inches === null || a.origin_z_inches === null) return null;
  const x = num(px);
  const z = num(pz);
  if (x === null || z === null) return null;
  const dx = x - a.origin_x_inches;
  const dz = z - a.origin_z_inches;
  const r = a.rotation_degrees;
  return r === 0 ? { x: dx, z: dz } : r === 90 ? { x: dz, z: -dx } : r === 180 ? { x: -dx, z: -dz } : { x: -dz, z: dx };
}
function foundationFootprintRects(items) {
  const rects = [];
  const skipped = [];
  (Array.isArray(items) ? items : []).forEach((it, i) => {
    const fp = foundationLayoutFootprint(it);
    const pos = layoutPositionInches(it);
    if (!fp || !pos.valid) {
      skipped.push(i);
      return;
    }
    rects.push({
      item_index: i,
      foundation_type: it?.foundation_type || "item",
      x: pos.x_inches,
      z: pos.z_inches,
      w: fp.width,
      d: fp.depth
    });
  });
  return { rects, skipped };
}
var rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
var distanceToRect = (px, pz, r) => {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dz = Math.max(r.z - pz, 0, pz - (r.z + r.d));
  return Math.hypot(dx, dz);
};
function diagnoseLandscapeFoundation({ landscape, items, cellSizeInches, gridCols, gridRows }) {
  const anchor = sanitizeLandscapeAnchor(landscape?.foundation_anchor);
  if (!anchor || anchor.confirmed !== true || anchor.origin_x_inches === null || anchor.origin_z_inches === null) {
    return { confirmed: false, anchor: anchor || null, overlays: [], cells_in_footprints: [], objects: [], notes: [] };
  }
  const cs = Number.isFinite(Number(cellSizeInches)) && Number(cellSizeInches) > 0 ? Number(cellSizeInches) : null;
  const { rects, skipped } = foundationFootprintRects(items);
  const notes = [];
  if (skipped.length) notes.push(`${skipped.length} item${skipped.length === 1 ? "" : "s"} skipped \u2014 footprint or position unresolved`);
  const gridW = cs !== null ? gridCols * cs : null;
  const gridD = cs !== null ? gridRows * cs : null;
  const overlays = [];
  for (const r of rects) {
    const corners = [
      planPointToLandscape(anchor, r.x, r.z),
      planPointToLandscape(anchor, r.x + r.w, r.z),
      planPointToLandscape(anchor, r.x, r.z + r.d),
      planPointToLandscape(anchor, r.x + r.w, r.z + r.d)
    ].filter(Boolean);
    if (!corners.length) continue;
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    const lo = { x: Math.min(...xs), z: Math.min(...zs) };
    const hi = { x: Math.max(...xs), z: Math.max(...zs) };
    const rect = { x: lo.x, z: lo.z, w: hi.x - lo.x, d: hi.z - lo.z };
    overlays.push({
      item_index: r.item_index,
      foundation_type: r.foundation_type,
      rect,
      inside_grid: gridW !== null ? rectsOverlap(rect, { x: 0, z: 0, w: gridW, d: gridD }) : null
    });
  }
  const cellsInFootprints = [];
  if (cs !== null) {
    const cells = landscape?.cells && typeof landscape.cells === "object" ? landscape.cells : {};
    for (const ov of overlays) {
      for (const key of Object.keys(cells)) {
        const [cx, cy] = key.split(",").map(Number);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
        const cellRect = { x: cx * cs, z: cy * cs, w: cs, d: cs };
        if (rectsOverlap(cellRect, ov.rect)) {
          cellsInFootprints.push({ cell: key, material: cells[key] || "", item_index: ov.item_index, foundation_type: ov.foundation_type });
        }
      }
    }
  } else {
    notes.push("cell overlap unchecked \u2014 cell size not recorded");
  }
  const objects = [];
  (Array.isArray(landscape?.objects) ? landscape.objects : []).forEach((o, i) => {
    const ox = num(o?.x_inches);
    const oz = num(o?.z_inches);
    if (ox === null || oz === null) {
      objects.push({ index: i, kind: "unplaced" });
      return;
    }
    const plan = landscapePointToPlan(anchor, ox, oz);
    if (!plan) {
      objects.push({ index: i, kind: "anchor-unresolvable" });
      return;
    }
    const inside = rects.find((r) => plan.x >= r.x && plan.x <= r.x + r.w && plan.z >= r.z && plan.z <= r.z + r.d);
    if (inside) {
      objects.push({ index: i, kind: "inside-footprint", item_index: inside.item_index, foundation_type: inside.foundation_type, plan });
      return;
    }
    const nearest = rects.length ? Math.min(...rects.map((r) => distanceToRect(plan.x, plan.z, r))) : null;
    const required = num(o?.setback_inches);
    objects.push({
      index: i,
      kind: required !== null && nearest !== null && nearest < required ? "setback-violation" : "placed",
      measured_inches: nearest,
      required_inches: required,
      plan
    });
  });
  return { confirmed: true, anchor, overlays, cells_in_footprints: cellsInFootprints, objects, notes };
}
export {
  LANDSCAPE_ANCHOR_VERSION,
  diagnoseLandscapeFoundation,
  foundationFootprintRects,
  landscapeAnchorConfirmed,
  landscapePointToPlan,
  planPointToLandscape,
  sanitizeLandscapeAnchor
};
