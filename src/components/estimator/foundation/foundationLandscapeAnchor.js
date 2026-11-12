// O-070 (CMP-F14): foundation↔landscape coordinate anchor. The landscape
// grid's own inch space (cells + object x/z_inches) has no intrinsic tie to
// the foundation plan's inch space (item x/z_inches + footprint dims). The
// authored `landscape.foundation_anchor` declares that tie: landscape point
// (0,0) sits at plan point (origin_x,origin_z), landscape +x rotated onto the
// plan by rotation_degrees (cardinal only). Diagnostics (footprint overlay,
// object-in-footprint, measured-vs-authored setbacks) run ONLY on a confirmed
// anchor — unconfirmed yields confirmed:false and empty results, never a
// computed-from-nothing guess.
import { foundationLayoutFootprint, layoutPositionInches } from "./foundationLayoutModel.js";

export const LANDSCAPE_ANCHOR_VERSION = 1;
const CARDINALS = [0, 90, 180, 270];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// Normalize the authored anchor. Rotation clamps to the nearest cardinal —
// anything else is malformed and unconfirms the anchor rather than inventing
// an orientation.
export function sanitizeLandscapeAnchor(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ox = num(raw.origin_x_inches);
  const oz = num(raw.origin_z_inches);
  const rot = num(raw.rotation_degrees);
  const rotation = rot === null ? 0
    : CARDINALS.reduce((a, b) => (Math.abs(b - (((rot % 360) + 360) % 360)) < Math.abs(a - (((rot % 360) + 360) % 360)) ? b : a), 0);
  return {
    version: LANDSCAPE_ANCHOR_VERSION,
    origin_x_inches: ox,
    origin_z_inches: oz,
    rotation_degrees: rotation,
    confirmed: raw.confirmed === true,
    confirmed_at: typeof raw.confirmed_at === "string" ? raw.confirmed_at : null,
  };
}

export function landscapeAnchorConfirmed(anchor) {
  const a = sanitizeLandscapeAnchor(anchor);
  return !!(a && a.confirmed === true && a.origin_x_inches !== null && a.origin_z_inches !== null);
}

// landscape-grid inches → plan inches (rotate then translate).
export function landscapePointToPlan(anchor, lx, lz) {
  const a = sanitizeLandscapeAnchor(anchor);
  if (!a || a.origin_x_inches === null || a.origin_z_inches === null) return null;
  const x = num(lx); const z = num(lz);
  if (x === null || z === null) return null;
  const r = a.rotation_degrees;
  const px = r === 0 ? x : r === 90 ? -z : r === 180 ? -x : z;
  const pz = r === 0 ? z : r === 90 ? x : r === 180 ? -z : -x;
  return { x: a.origin_x_inches + px, z: a.origin_z_inches + pz };
}

// plan inches → landscape-grid inches (translate then inverse-rotate).
export function planPointToLandscape(anchor, px, pz) {
  const a = sanitizeLandscapeAnchor(anchor);
  if (!a || a.origin_x_inches === null || a.origin_z_inches === null) return null;
  const x = num(px); const z = num(pz);
  if (x === null || z === null) return null;
  const dx = x - a.origin_x_inches; const dz = z - a.origin_z_inches;
  const r = a.rotation_degrees;
  return r === 0 ? { x: dx, z: dz }
    : r === 90 ? { x: dz, z: -dx }
    : r === 180 ? { x: -dx, z: -dz }
    : { x: -dz, z: dx };
}

// Plan-space axis-aligned footprint rects via the shared layout resolvers —
// the same geometry contract FoundationLayoutCanvas renders.
export function foundationFootprintRects(items) {
  const rects = [];
  const skipped = [];
  (Array.isArray(items) ? items : []).forEach((it, i) => {
    const fp = foundationLayoutFootprint(it);
    const pos = layoutPositionInches(it);
    if (!fp || !pos.valid) { skipped.push(i); return; }
    rects.push({
      item_index: i,
      foundation_type: it?.foundation_type || "item",
      x: pos.x_inches, z: pos.z_inches,
      w: fp.width, d: fp.depth,
    });
  });
  return { rects, skipped };
}

const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

// Distance from a plan point to a rect edge (0 when inside).
const distanceToRect = (px, pz, r) => {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dz = Math.max(r.z - pz, 0, pz - (r.z + r.d));
  return Math.hypot(dx, dz);
};

// The full diagnostic pass. `cellSizeInches` is the authored cell contract —
// non-finite/≤0 callers must pass null so area checks stay honest.
export function diagnoseLandscapeFoundation({ landscape, items, cellSizeInches, gridCols, gridRows }) {
  const anchor = sanitizeLandscapeAnchor(landscape?.foundation_anchor);
  if (!anchor || anchor.confirmed !== true || anchor.origin_x_inches === null || anchor.origin_z_inches === null) {
    return { confirmed: false, anchor: anchor || null, overlays: [], cells_in_footprints: [], objects: [], notes: [] };
  }
  const cs = Number.isFinite(Number(cellSizeInches)) && Number(cellSizeInches) > 0 ? Number(cellSizeInches) : null;
  const { rects, skipped } = foundationFootprintRects(items);
  const notes = [];
  if (skipped.length) notes.push(`${skipped.length} item${skipped.length === 1 ? "" : "s"} skipped — footprint or position unresolved`);
  const gridW = cs !== null ? gridCols * cs : null;
  const gridD = cs !== null ? gridRows * cs : null;

  // Footprints → landscape space (bounding rect of the mapped corners).
  const overlays = [];
  for (const r of rects) {
    const corners = [
      planPointToLandscape(anchor, r.x, r.z),
      planPointToLandscape(anchor, r.x + r.w, r.z),
      planPointToLandscape(anchor, r.x, r.z + r.d),
      planPointToLandscape(anchor, r.x + r.w, r.z + r.d),
    ].filter(Boolean);
    if (!corners.length) continue;
    const xs = corners.map((c) => c.x); const zs = corners.map((c) => c.z);
    const lo = { x: Math.min(...xs), z: Math.min(...zs) };
    const hi = { x: Math.max(...xs), z: Math.max(...zs) };
    const rect = { x: lo.x, z: lo.z, w: hi.x - lo.x, d: hi.z - lo.z };
    overlays.push({
      item_index: r.item_index, foundation_type: r.foundation_type,
      rect,
      inside_grid: gridW !== null
        ? rectsOverlap(rect, { x: 0, z: 0, w: gridW, d: gridD })
        : null,
    });
  }

  // Material cells intersecting a footprint (needs a finite cell size).
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
    notes.push("cell overlap unchecked — cell size not recorded");
  }

  // Object diagnostics: inside-footprint + measured setback vs authored.
  const objects = [];
  (Array.isArray(landscape?.objects) ? landscape.objects : []).forEach((o, i) => {
    const ox = num(o?.x_inches); const oz = num(o?.z_inches);
    if (ox === null || oz === null) { objects.push({ index: i, kind: "unplaced" }); return; }
    const plan = landscapePointToPlan(anchor, ox, oz);
    if (!plan) { objects.push({ index: i, kind: "anchor-unresolvable" }); return; }
    const inside = rects.find((r) => plan.x >= r.x && plan.x <= r.x + r.w && plan.z >= r.z && plan.z <= r.z + r.d);
    if (inside) {
      objects.push({ index: i, kind: "inside-footprint", item_index: inside.item_index, foundation_type: inside.foundation_type, plan });
      return;
    }
    const nearest = rects.length
      ? Math.min(...rects.map((r) => distanceToRect(plan.x, plan.z, r)))
      : null;
    const required = num(o?.setback_inches);
    objects.push({
      index: i,
      kind: required !== null && nearest !== null && nearest < required ? "setback-violation" : "placed",
      measured_inches: nearest,
      required_inches: required,
      plan,
    });
  });

  return { confirmed: true, anchor, overlays, cells_in_footprints: cellsInFootprints, objects, notes };
}
