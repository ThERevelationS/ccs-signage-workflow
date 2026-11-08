// O-035 (CMP-C04) — foundation scene edit operations.
//
// Pure, deterministic, DOM-free edit operations over the scene selection:
// move (multi + snap-assisted drag), resize through handles, rotate, typed
// coordinates, align/distribute, delete/duplicate descriptors, and the
// history-ready edit records that make every one of them a single undoable
// command. Nothing here mutates the scene and nothing commits business
// data — every op returns a patch list the consumer routes through its own
// commit channel (the layout canvas's onMoveItem / future onPatchScene),
// plus before/after payloads shaped for foundationSceneHistory.recordEdit /
// beginStroke-commitStroke so ONE operation = ONE undo command.
//
// Geometry contract (owned by foundationLayoutModel.js /
// foundationAssemblyModel.js / foundationSceneInput.js — imported
// read-only):
//   * items carry a TOP-LEFT plan corner in inches (x_inches/z_inches), an
//     unrotated footprint (length_inches x width_inches; diameter x diameter
//     for pillars), and rotation_degrees about the footprint center
//     (CSS-clockwise in the z-down plan). The stored corner is always the
//     UNROTATED top-left — resize/rotate keep center semantics, never raw
//     rotated-corner writes.
//   * poles carry a plan POINT in inches (x_inches/z_inches).
//   * walls carry shape.points [{x,z}] plan inches + shape.closed —
//     translation rewrites every authored point (non-finite authored
//     vertices are preserved verbatim, never repaired silently).
//   * wall_caps / signage_cabinets / pole signs / wall segments carry no
//     independent plan geometry — they are skipped by geometry ops (they
//     ride with parents) and only appear in delete/duplicate descriptors.
//
// Op result contract:
//   { status: "ok", op, patches, skipped, ... } — patches is a list of
//     { collection, index, key, before: {field:prev}, patch: {field:next} }
//     rows. `before` holds exactly the fields `patch` sets, picked from the
//     live row, so a single patch doubles as the undo payload for the
//     single-item commit channel and the whole list is the multi payload.
//   { status: "noop", op } — the op computed zero real change.
//   { status: "rejected", op, reason, ... } — invalid input (non-finite,
//     degenerate, read-only, empty selection, unknown field). Callers show
//     the reason; nothing was computed.
//
// Read-only + lock discipline: every geometry op honors opts.readOnly (the
// consumer's editable gate) with an explicit "read-only" rejection, and
// skips locked rows via opts.isLocked(row) — default honors an authored
// `locked === true` flag (the O-037 layer-lock seam). Skipped rows are
// reported, never silently edited.
//
// Multi-row undo honesty: single-item patches round-trip through the
// canvas's existing patchItem undo apply; multi-row payloads (kind
// "scene-multi", target { multi: true }) CANNOT be applied by that
// single-row apply, so they are recorded with full-scene anchors
// (items+poles+walls). Under the current items-only observe domain they
// self-quarantine — traversal reports "stale", an honest refusal — instead
// of fake-applying a no-op patch. MOUNT-ANCHORS.md documents the two-line
// page change (full-domain observe + multi-aware undo apply) that turns
// them into real undo once the multi commit channel mounts.

import {
  layoutItemKey,
  layoutPositionInches,
} from "./foundationLayoutModel";
import {
  DEFAULT_PLAN_EXTENT,
  planPointOf,
  planToFrameLocal,
  frameLocalToPlan,
  framePlanCorners,
} from "./foundationSceneTransforms";
import {
  itemPlanGeometry,
  wallPlanGeometry,
  snapCandidatesForScene,
  snapToCandidates,
  SCENE_EDIT_ITEM_MOVE,
} from "./foundationSceneInput";
import { resolveSceneNode, parseSceneNodeId } from "./foundationSceneSelection";

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const isId = (v) => typeof v === "string" && v.length > 0;
const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const hypot = Math.hypot;
const normDeg = (v) => ((v % 360) + 360) % 360;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SCENE_OP_KINDS = Object.freeze({
  move: SCENE_EDIT_ITEM_MOVE,
  resize: "item-resize",
  rotate: "item-rotate",
  geometry: "item-geometry",
  multi: "scene-multi",
});

export const ITEM_RESIZE_HANDLES = Object.freeze([
  "nw", "n", "ne", "e", "se", "s", "sw", "w",
]);
export const ALIGN_EDGES = Object.freeze([
  "left", "centerX", "right", "top", "centerZ", "bottom",
]);
export const DISTRIBUTE_AXES = Object.freeze(["x", "z"]);

// Resize guard — a handle drag can never flatten an item; degenerate or
// sub-minimum geometry clamps to this, non-finite stays rejected.
export const MIN_ITEM_SIZE_INCHES = 1;
// Drag-rotate snaps to 15° unless the caller frees it (Shift) or overrides.
export const ROTATE_SNAP_DEGREES = 15;
// Keyboard rotate step; Shift multiplies to 45°.
export const ROTATE_KEY_STEP_DEGREES = 15;
export const ROTATE_KEY_BIG_STEP_DEGREES = 45;
// Snap tolerance in plan inches (matches the input seam's edge tolerance).
export const DEFAULT_SNAP_TOLERANCE_INCHES = 3;
// Duplicate descriptor's suggested offset (matches duplicateFoundationAssembly).
export const DEFAULT_DUPLICATE_OFFSET_INCHES = Object.freeze({ x: 12, z: 12 });

const WHOLE_ROW_KINDS = Object.freeze(["item", "pole", "wall", "wall-cap", "cabinet"]);
const PLANAR_KINDS = Object.freeze(["item", "pole", "wall"]);
const COLLECTION_OF_KIND = Object.freeze({
  item: "items", pole: "poles", wall: "walls",
  "wall-cap": "wall_caps", cabinet: "signage_cabinets",
});

const defaultIsLocked = (row) => row?.locked === true || row?.locked === 1;

// ---------------------------------------------------------------------------
// Scene + selection plumbing
// ---------------------------------------------------------------------------

// Accepts the canvas's prop shape or the assembly's snake_case shape.
const sceneCols = (scene) => {
  const s = isRecord(scene) ? scene : {};
  return {
    items: Array.isArray(s.items) ? s.items : [],
    walls: Array.isArray(s.walls) ? s.walls : [],
    poles: Array.isArray(s.poles) ? s.poles : [],
    wall_caps: Array.isArray(s.wall_caps) ? s.wall_caps : Array.isArray(s.wallCaps) ? s.wallCaps : [],
    signage_cabinets: Array.isArray(s.signage_cabinets)
      ? s.signage_cabinets
      : Array.isArray(s.signageCabinets) ? s.signageCabinets : [],
  };
};

const idOf = (entry) => (typeof entry === "string" ? entry : entry?.id);

// AABB of one resolved row in plan inches. Rotated items report the rotated
// footprint's true bounds (align/move land where the user SEES the edge);
// pillars report the bounding square; poles degenerate to a point; walls
// bound their authored outline. Null when the row has no usable geometry.
export function planBoundsOfItem(item) {
  const g = itemPlanGeometry(item);
  if (!g) return null;
  if (g.circular) {
    const r = Math.min(g.size.width, g.size.depth) / 2;
    return {
      minX: g.center.x - r, maxX: g.center.x + r,
      minZ: g.center.z - r, maxZ: g.center.z + r,
      cx: g.center.x, cz: g.center.z, width: 2 * r, depth: 2 * r,
    };
  }
  const corners = framePlanCorners(g.frame, g.size);
  if (!corners) return null;
  const xs = [corners.nw.x, corners.ne.x, corners.se.x, corners.sw.x];
  const zs = [corners.nw.z, corners.ne.z, corners.se.z, corners.sw.z];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return {
    minX, maxX, minZ, maxZ,
    cx: g.center.x, cz: g.center.z,
    width: maxX - minX, depth: maxZ - minZ,
  };
}

export function planBoundsOfPole(pole) {
  const q = planPointOf({ x: pole?.x_inches, z: pole?.z_inches });
  if (!q) return null;
  return { minX: q.x, maxX: q.x, minZ: q.z, maxZ: q.z, cx: q.x, cz: q.z, width: 0, depth: 0 };
}

export function planBoundsOfWall(wall) {
  const g = wallPlanGeometry(wall);
  if (!g || !g.points.length) return null;
  const xs = g.points.map((p) => p.x);
  const zs = g.points.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return {
    minX, maxX, minZ, maxZ,
    cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
    width: maxX - minX, depth: maxZ - minZ,
  };
}

const boundsOf = (kind, row) =>
  kind === "item" ? planBoundsOfItem(row)
    : kind === "pole" ? planBoundsOfPole(row)
      : kind === "wall" ? planBoundsOfWall(row)
        : null;

// Resolve selection ids/entries into live op targets. Only whole-row
// PLANAR objects move/align — sub-objects and reference-mounted rows are
// reported skipped. Locked rows skip with reason "locked" via opts.isLocked
// (default: authored `locked === true`). Unresolvable ids skip honestly.
export function resolveOpTargets(scene, ids, { isLocked = defaultIsLocked } = {}) {
  const list = Array.isArray(ids) ? ids : [];
  const targets = [];
  const skipped = [];
  const seen = new Set();
  for (const entry of list) {
    const id = idOf(entry);
    if (!isId(id) || seen.has(id)) continue;
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
      id, kind, collection: COLLECTION_OF_KIND[kind],
      index: res.index, key: parsed.key, row: res.row, bounds,
    });
  }
  return { targets, skipped };
}

// Union AABB of resolved targets — the selection box ops snap/align against.
export function targetsBounds(targets) {
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
  if (!fin(minX)) return null;
  return {
    minX, maxX, minZ, maxZ,
    cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
    width: maxX - minX, depth: maxZ - minZ,
  };
}

// ---------------------------------------------------------------------------
// Patch primitives
// ---------------------------------------------------------------------------

// The pre-image of a patch: every field the patch sets, valued from the
// live row (undefined-preserving — an absent authored field stays absent in
// the record and reverts to absent/undefined on undo, matching the position
// readers' absent==0 semantics).
export const beforeFieldsOf = (row, patch) => {
  const before = {};
  if (!isRecord(row) || !isRecord(patch)) return before;
  for (const k of Object.keys(patch)) before[k] = row[k];
  return before;
};

const pickNum = (v) => {
  if (fin(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return fin(n) ? n : null;
  }
  return null;
};

const maybeRound = (v, round) => (round ? Math.round(v) : v);

// Translate one resolved target by {dx,dz}; returns a patch row or null
// when the row has no translatable geometry. Non-finite authored points on
// walls are preserved verbatim (never NaN'd, never repaired).
export function translateTargetPatch(target, dx, dz, { round = false } = {}) {
  if (!target || !fin(dx) || !fin(dz)) return null;
  const { kind, row } = target;
  if (kind === "item") {
    const pos = layoutPositionInches(row);
    if (!pos.valid) return null;
    const patch = {
      x_inches: maybeRound(pos.x_inches + dx, round),
      z_inches: maybeRound(pos.z_inches + dz, round),
    };
    if (!fin(patch.x_inches) || !fin(patch.z_inches)) return null;
    return { collection: "items", index: target.index, key: target.key, before: beforeFieldsOf(row, patch), patch };
  }
  if (kind === "pole") {
    const q = planPointOf({ x: row?.x_inches, z: row?.z_inches });
    if (!q) return null;
    const patch = {
      x_inches: maybeRound(q.x + dx, round),
      z_inches: maybeRound(q.z + dz, round),
    };
    if (!fin(patch.x_inches) || !fin(patch.z_inches)) return null;
    return { collection: "poles", index: target.index, key: target.key, before: beforeFieldsOf(row, patch), patch };
  }
  if (kind === "wall") {
    const shape = isRecord(row?.shape) ? row.shape : {};
    const pts = Array.isArray(shape.points) ? shape.points : null;
    if (!pts || !pts.length) return null;
    const next = pts.map((p) => {
      const q = planPointOf(p);
      if (!q) return p; // verbatim — malformed authored vertices stay authored
      return { ...p, x: maybeRound(q.x + dx, round), z: maybeRound(q.z + dz, round) };
    });
    const patch = { shape: { ...shape, points: next } };
    return { collection: "walls", index: target.index, key: target.key, before: beforeFieldsOf(row, patch), patch };
  }
  return null;
}

// Apply patch rows to a scene record → NEW scene (source never mutated).
// Each patch spreads onto the addressed row — the same merge patchItem and
// every future multi-channel performs. Used for history anchors and tests.
export function sceneWithOpPatches(scene, patchRows, { side = "patch" } = {}) {
  const cols = sceneCols(scene);
  const list = Array.isArray(patchRows) ? patchRows : [];
  const field = side === "before" ? "before" : "patch";
  const apply = (rows, collection) =>
    (Array.isArray(rows) ? rows : []).map((row, i) => {
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
    walls: apply(cols.walls, "walls"),
  };
}

// Does this patch list fit the single-item commit channel (one `items` row)?
// Anything else needs the multi-row channel — the canvas gates on this so a
// partial application can never happen silently.
export const patchesFitSingleItemChannel = (patches) =>
  Array.isArray(patches) && patches.length === 1 && patches[0]?.collection === "items";

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

// Snap candidates for everything EXCEPT the moving rows — multi-move strips
// every selected key so the selection cannot snap to itself. Returns the
// input seam's { x: [{value,source}], z: [...] } shape.
export function snapCandidatesOutside(scene, movingIds, opts = {}) {
  const moving = new Set();
  const cols = sceneCols(scene);
  for (const entry of Array.isArray(movingIds) ? movingIds : []) {
    const id = idOf(entry);
    const parsed = isId(id) ? parseSceneNodeId(id) : null;
    if (parsed?.key) moving.add(parsed.key);
  }
  const keep = (rows) => (Array.isArray(rows) ? rows.filter((r, i) => !moving.has(layoutItemKey(r, i))) : []);
  return snapCandidatesForScene(
    { items: keep(cols.items), poles: keep(cols.poles), walls: keep(cols.walls) },
    opts,
  );
}

const pickGuide = (probes, candidates, tolInches) => {
  let best = null;
  for (const c of candidates || []) {
    if (!fin(c?.value)) continue;
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

// Axis adjustments that snap a translating bounds box onto snap candidates
// (object edges/centers/poles/wall vertices/plan bounds) or a uniform grid.
// Probes are the moving box's edges + centers; the smallest adjustment
// within tolerance wins per axis (deterministic: first probe, then first
// candidate). Grid applies only on axes no candidate snapped — object snap
// always outranks grid. Returns { dx, dz, guides } or null when nothing
// within reach.
export function snapBoundsDelta(bounds, candidates, { tolInches = DEFAULT_SNAP_TOLERANCE_INCHES, gridStepInches = 0 } = {}) {
  if (!bounds || !fin(bounds.minX) || !fin(bounds.minZ)) return null;
  const tol = fin(tolInches) && tolInches >= 0 ? tolInches : DEFAULT_SNAP_TOLERANCE_INCHES;
  const probesX = [bounds.minX, bounds.cx, bounds.maxX];
  const probesZ = [bounds.minZ, bounds.cz, bounds.maxZ];
  const gx = pickGuide(probesX, candidates?.x, tol);
  const gz = pickGuide(probesZ, candidates?.z, tol);
  const step = fin(gridStepInches) && gridStepInches > 0 ? gridStepInches : 0;
  let dx = null, dz = null;
  const guides = [];
  if (gx) { dx = gx.adj; guides.push({ axis: "x", value: gx.value, source: gx.source }); }
  else if (step) { dx = Math.round(bounds.minX / step) * step - bounds.minX; guides.push({ axis: "x", value: bounds.minX + dx, source: { kind: "grid" } }); }
  if (gz) { dz = gz.adj; guides.push({ axis: "z", value: gz.value, source: gz.source }); }
  else if (step) { dz = Math.round(bounds.minZ / step) * step - bounds.minZ; guides.push({ axis: "z", value: bounds.minZ + dz, source: { kind: "grid" } }); }
  if (dx === null && dz === null) return null;
  return { dx: dx ?? 0, dz: dz ?? 0, guides };
}

// Snap assist for a single dragged item corner (the canvas's move-drag
// path): bounds at the proposed corner, candidates excluding the dragged
// row, same probes/winner rule. Returns { dx, dz, guides } or null.
export function snapDraggedItem(item, proposedCorner, candidates, opts = {}) {
  const g = itemPlanGeometry(item);
  const c = planPointOf(proposedCorner);
  if (!g || !c) return null;
  const bounds = {
    minX: c.x, maxX: c.x + g.size.width, cx: c.x + g.size.width / 2,
    minZ: c.z, maxZ: c.z + g.size.depth, cz: c.z + g.size.depth / 2,
  };
  return snapBoundsDelta(bounds, candidates, opts);
}

// ---------------------------------------------------------------------------
// Move (multi-row + snap-assisted)
// ---------------------------------------------------------------------------

// Translate every resolved target by `delta`. `opts.snap` =
// { candidates, tolInches } adjusts the delta so the selection bounds land
// on guides; `opts.gridStepInches` snaps to a grid on unsnapped axes.
// Patches are UNROUNDED by default (preview); pass round:true at commit.
export function moveSelectionPatch(scene, ids, delta, opts = {}) {
  const op = "move";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  const dx = fin(delta?.dx) ? delta.dx : fin(delta?.x) ? delta.x : null;
  const dz = fin(delta?.dz) ? delta.dz : fin(delta?.z) ? delta.z : null;
  if (dx === null || dz === null) return { status: "rejected", op, reason: "invalid-delta" };
  const { targets, skipped } = resolveOpTargets(scene, ids, opts);
  if (!targets.length) {
    return { status: "rejected", op, reason: "empty-selection", skipped };
  }
  let ddx = dx, ddz = dz, guides = [];
  const snap = isRecord(opts.snap) ? opts.snap : null;
  const bounds = targetsBounds(targets);
  if (bounds && (snap || (fin(opts.gridStepInches) && opts.gridStepInches > 0))) {
    const moved = { ...bounds, minX: bounds.minX + dx, maxX: bounds.maxX + dx, cx: bounds.cx + dx, minZ: bounds.minZ + dz, maxZ: bounds.maxZ + dz, cz: bounds.cz + dz };
    const adj = snapBoundsDelta(moved, snap?.candidates, {
      tolInches: snap?.tolInches,
      gridStepInches: opts.gridStepInches,
    });
    if (adj) { ddx += adj.dx; ddz += adj.dz; guides = adj.guides; }
  }
  const patches = targets
    .map((t) => translateTargetPatch(t, ddx, ddz, { round: opts.round === true }))
    .filter(Boolean)
    .filter((p) => JSON.stringify(p.before) !== JSON.stringify(p.patch));
  if (!patches.length) return { status: "noop", op, skipped };
  return { status: "ok", op, delta: { dx: ddx, dz: ddz }, patches, skipped, guides };
}

// ---------------------------------------------------------------------------
// Resize (handle drags in the item-local rotated frame)
// ---------------------------------------------------------------------------

// Begin a handle resize. `handle` is one of ITEM_RESIZE_HANDLES ('nw'|'n'|
// 'ne'|'e'|'se'|'s'|'sw'|'w'); the opposite corner/edge anchors in the
// item's rotated frame so the drag resizes what the pointer is on — even
// under rotation. Pillars treat every handle as a diameter drag about the
// fixed center. Returns the session record resizeItemFromHandle consumes,
// or null on invalid geometry/handle/point.
export function beginItemResize(item, handle, grabPoint) {
  if (!ITEM_RESIZE_HANDLES.includes(handle)) return null;
  const g = itemPlanGeometry(item);
  const grab = planPointOf(grabPoint);
  if (!g || !grab) return null;
  const local = planToFrameLocal(g.frame, grab);
  if (!local) return null;
  const hw = g.size.width / 2;
  const hd = g.size.depth / 2;
  // Anchor = the fixed opposite feature in local coords.
  let anchorLocal = null;
  if (handle.includes("w")) anchorLocal = { ...(anchorLocal || {}), lx: hw };
  if (handle.includes("e")) anchorLocal = { ...(anchorLocal || {}), lx: -hw };
  if (handle.includes("n")) anchorLocal = { ...(anchorLocal || {}), lz: hd };
  if (handle.includes("s")) anchorLocal = { ...(anchorLocal || {}), lz: -hd };
  return {
    handle,
    frame: g.frame,
    center: g.center,
    size: { width: g.size.width, depth: g.size.depth },
    circular: g.circular === true,
    anchorLocal,
    grabLocal: local,
    corner: { ...g.corner },
  };
}

// Live resize patch for a dragged handle. opts:
//   minInches  — clamp floor per axis (default MIN_ITEM_SIZE_INCHES)
//   round      — whole-inch commit rounding (preview stays fractional)
//   snap       — { candidates, tolInches }: snap the dragged plan point
//                BEFORE frame-local conversion (guides ride the result)
// Returns { patch, guides } or null when the result would be non-finite.
export function resizeItemFromHandle(session, planPoint, opts = {}) {
  if (!session || !session.frame) return null;
  let p = planPointOf(planPoint);
  if (!p) return null;
  let guides = [];
  const snap = isRecord(opts.snap) ? opts.snap : null;
  if (snap?.candidates) {
    const s = snapToCandidates(p, snap.candidates, fin(snap.tolInches) ? snap.tolInches : DEFAULT_SNAP_TOLERANCE_INCHES);
    if (s) { p = { x: s.x, z: s.z }; guides = s.guides || []; }
  }
  const local = planToFrameLocal(session.frame, p);
  if (!local) return null;
  const min = fin(opts.minInches) && opts.minInches > 0 ? opts.minInches : MIN_ITEM_SIZE_INCHES;
  const round = opts.round === true;
  const h = session.handle;

  if (session.circular) {
    // Diameter = 2 x the larger local half-extent, center fixed.
    let d = 2 * Math.max(Math.abs(local.lx), Math.abs(local.lz));
    if (!fin(d)) return null;
    d = Math.max(min, d);
    if (round) d = Math.round(d);
    if (!fin(d) || d <= 0) return null;
    const corner = { x: session.center.x - d / 2, z: session.center.z - d / 2 };
    const patch = { x_inches: maybeRound(corner.x, round), z_inches: maybeRound(corner.z, round), diameter: d };
    return fin(patch.x_inches) && fin(patch.z_inches) ? { patch, guides } : null;
  }

  const a = session.anchorLocal || {};
  const sx = h.includes("w") ? -1 : 1; // dragged side in local coords
  const sz = h.includes("n") ? -1 : 1;
  let newW = session.size.width;
  let newD = session.size.depth;
  let cxLocal = 0;
  let czLocal = 0;

  if (fin(a.lx)) {
    newW = Math.abs(local.lx - a.lx);
    if (!fin(newW)) return null;
    if (newW < min) newW = min;
    const side = local.lx === a.lx ? sx : Math.sign(local.lx - a.lx);
    cxLocal = a.lx + side * (newW / 2);
  }
  if (fin(a.lz)) {
    newD = Math.abs(local.lz - a.lz);
    if (!fin(newD)) return null;
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
    width_inches: newD,
  };
  if (round) patch = { x_inches: Math.round(patch.x_inches), z_inches: Math.round(patch.z_inches), length_inches: Math.round(patch.length_inches), width_inches: Math.round(patch.width_inches) };
  if (!fin(patch.x_inches) || !fin(patch.z_inches) || !fin(patch.length_inches) || !fin(patch.width_inches)) return null;
  if (patch.length_inches <= 0 || patch.width_inches <= 0) return null;
  return { patch, guides };
}

// One-shot convenience: begin + evaluate. Same return as resizeItemFromHandle.
export function itemResizePatch(item, handle, planPoint, opts = {}) {
  const session = beginItemResize(item, handle, planPoint);
  if (!session) return null;
  const r = resizeItemFromHandle(session, planPoint, opts);
  return r ? { session, ...r } : null;
}

// ---------------------------------------------------------------------------
// Rotate (about the footprint center; the stored corner never moves)
// ---------------------------------------------------------------------------

// Begin a pointer rotate. The grabbed point tracks the pointer: rotation =
// pointer-angle - grab-offset. `grabPoint` is where the press landed (the
// rotate handle's plan position), so the offset bakes in automatically.
export function beginItemRotate(item, grabPoint) {
  const g = itemPlanGeometry(item);
  const grab = planPointOf(grabPoint);
  if (!g || !grab) return null;
  const dx = grab.x - g.center.x;
  const dz = grab.z - g.center.z;
  if (hypot(dx, dz) < 1e-6) return null; // grab on the pivot is meaningless
  const start = fin(item?.rotation_degrees) ? item.rotation_degrees : 0;
  return {
    center: { x: g.center.x, z: g.center.z },
    offsetDeg: (Math.atan2(dz, dx) * 180) / Math.PI - start,
    startDeg: start,
  };
}

// Pointer angle -> rotation patch. Snap: nearest snapDegrees multiple
// unless opts.free (Shift convention) or snapDegrees <= 0. A pointer on the
// pivot returns null — no phantom rotation.
export function rotateItemFromPointer(session, planPoint, opts = {}) {
  if (!session || !fin(session.center?.x) || !fin(session.center?.z)) return null;
  const p = planPointOf(planPoint);
  if (!p) return null;
  const dx = p.x - session.center.x;
  const dz = p.z - session.center.z;
  if (hypot(dx, dz) < 1e-6) return null;
  let deg = normDeg((Math.atan2(dz, dx) * 180) / Math.PI - session.offsetDeg);
  const step = fin(opts.snapDegrees) ? opts.snapDegrees : ROTATE_SNAP_DEGREES;
  if (opts.free !== true && step > 0) deg = normDeg(Math.round(deg / step) * step);
  return { patch: { rotation_degrees: deg } };
}

// Keyboard / toolbar rotation: delta about the center. `opts.snapTo`
// aligns the RESULT to a multiple (e.g. snap to cardinal after a nudge).
export function rotateItemBy(item, deltaDegrees, opts = {}) {
  const d = pickNum(deltaDegrees);
  if (d === null) return null;
  const cur = fin(item?.rotation_degrees) ? item.rotation_degrees : 0;
  let deg = normDeg(cur + d);
  const snapTo = fin(opts.snapTo) ? opts.snapTo : 0;
  if (snapTo > 0) deg = normDeg(Math.round(deg / snapTo) * snapTo);
  return { patch: { rotation_degrees: deg } };
}

// Typed/absolute rotation — normalized into [0,360), finite only.
export function rotateItemTo(item, degrees) {
  const d = pickNum(degrees);
  if (d === null) return null;
  return { patch: { rotation_degrees: normDeg(d) } };
}

// ---------------------------------------------------------------------------
// Align + distribute
// ---------------------------------------------------------------------------

// Align every resolved target's AABB edge/center to a line. `to`:
//   "primary" — the primary target's own edge/center is the line
//               (multi-select convention; primary = opts.primaryId's row,
//               default first target — the primary itself is not patched);
//   "plan"    — the plan extent's edge/center (single-selection default;
//               the "snap this footing to the plan left edge" case).
// Default: 1 target → "plan", >1 → "primary".
export function alignSelectionPatch(scene, ids, edge, opts = {}) {
  const op = "align";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  if (!ALIGN_EDGES.includes(edge)) return { status: "rejected", op, reason: "unknown-edge", edge };
  const { targets, skipped } = resolveOpTargets(scene, ids, opts);
  if (!targets.length) return { status: "rejected", op, reason: "empty-selection", skipped };

  const extent = opts.extent && fin(opts.extent.width) && fin(opts.extent.depth)
    ? opts.extent : DEFAULT_PLAN_EXTENT;
  const to = opts.to === "plan" || opts.to === "primary"
    ? opts.to
    : targets.length === 1 ? "plan" : "primary";

  let anchor;
  let primary = null;
  if (to === "plan") {
    anchor = {
      left: 0, centerX: extent.width / 2, right: extent.width,
      top: 0, centerZ: extent.depth / 2, bottom: extent.depth,
    };
  } else {
    const primaryId = idOf(opts.primaryId);
    primary = (primaryId && targets.find((t) => t.id === primaryId)) || targets[0];
    const b = primary.bounds;
    anchor = { left: b.minX, centerX: b.cx, right: b.maxX, top: b.minZ, centerZ: b.cz, bottom: b.maxZ };
  }
  const line = anchor[edge];
  if (!fin(line)) return { status: "rejected", op, reason: "no-anchor", edge };

  const onX = edge === "left" || edge === "centerX" || edge === "right";
  const probes = { left: (b) => b.minX, centerX: (b) => b.cx, right: (b) => b.maxX, top: (b) => b.minZ, centerZ: (b) => b.cz, bottom: (b) => b.maxZ };
  const probe = probes[edge];
  const patches = [];
  for (const t of targets) {
    if (to === "primary" && t === primary) continue;
    const delta = line - probe(t.bounds);
    if (Math.abs(delta) < 1e-9) continue; // already on the line — not a patch
    const p = translateTargetPatch(t, onX ? delta : 0, onX ? 0 : delta, { round: opts.round === true });
    if (p) patches.push(p);
  }
  if (!patches.length) return { status: "noop", op, edge, to, skipped };
  return { status: "ok", op, edge, to, line, patches, skipped };
}

// Distribute ≥3 targets along an axis with equal gaps between bounding
// edges; the outermost pair stay anchored. Sort order is (center, id) —
// deterministic on exact ties. `opts.round` whole-inch commits.
export function distributeSelectionPatch(scene, ids, axis, opts = {}) {
  const op = "distribute";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  if (!DISTRIBUTE_AXES.includes(axis)) return { status: "rejected", op, reason: "unknown-axis", axis };
  const { targets, skipped } = resolveOpTargets(scene, ids, opts);
  if (targets.length < 3) return { status: "rejected", op, reason: "needs-three", count: targets.length, skipped };
  const minE = axis === "x" ? "minX" : "minZ";
  const maxE = axis === "x" ? "maxX" : "maxZ";
  const ctr = axis === "x" ? "cx" : "cz";
  const size = axis === "x" ? "width" : "depth";
  const sorted = [...targets].sort((a, b) => (a.bounds[ctr] - b.bounds[ctr]) || (a.id < b.id ? -1 : 1));
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

// ---------------------------------------------------------------------------
// Typed coordinates + dimensions
// ---------------------------------------------------------------------------

const STRICT_NUM = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const typedNum = (v) => {
  if (fin(v)) return { ok: true, v };
  if (typeof v === "string" && STRICT_NUM.test(v.trim())) {
    const n = Number(v.trim());
    return fin(n) ? { ok: true, v: n } : { ok: false };
  }
  return { ok: false };
};

// Typed geometry commit for an ITEM row — the numeric fallback for users
// who type instead of drag. `fields` is a subset of
//   { x, z, length, width, diameter, rotation }
// with numbers or strict numeric strings (the canvas parses ft/in display
// text upstream via foundationFtInEntry — this layer sees inches only).
// Atomic: any invalid or inapplicable field rejects the WHOLE op — a
// half-typed form never lands a half-patch. Positive dims only; rotations
// normalize; coordinates accept any finite value (the plan has no clamp —
// off-plan placement is authored data, not a syntax error).
export function typedItemPatch(item, fields, opts = {}) {
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
    rotation: { field: "rotation_degrees", normalize: true },
  };
  const patch = {};
  for (const key of Object.keys(f)) {
    const s = spec[key];
    if (!s) return { status: "rejected", op, reason: "unknown-field", field: key };
    if (f[key] === undefined) continue;
    if (s.pillar === true && !pillar) return { status: "rejected", op, reason: "field-not-applicable", field: key };
    if (s.pillar === false && pillar) return { status: "rejected", op, reason: "field-not-applicable", field: key };
    const n = typedNum(f[key]);
    if (!n.ok) return { status: "rejected", op, reason: "invalid-field", field: key };
    if (s.exclusive && !(n.v > s.min)) return { status: "rejected", op, reason: "non-positive", field: key };
    patch[s.field] = s.normalize ? normDeg(n.v) : n.v;
  }
  if (!Object.keys(patch).length) return { status: "noop", op };
  return { status: "ok", op, patch, before: beforeFieldsOf(item, patch) };
}

// Typed position for a pole — same atomic rule, { x, z } only.
export function typedPolePatch(pole, fields, opts = {}) {
  const op = "typed";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  if (!isRecord(pole)) return { status: "rejected", op, reason: "no-pole" };
  const f = isRecord(fields) ? fields : {};
  const patch = {};
  for (const key of Object.keys(f)) {
    if (key !== "x" && key !== "z") return { status: "rejected", op, reason: "unknown-field", field: key };
    if (f[key] === undefined) continue;
    const n = typedNum(f[key]);
    if (!n.ok) return { status: "rejected", op, reason: "invalid-field", field: key };
    patch[key === "x" ? "x_inches" : "z_inches"] = n.v;
  }
  if (!Object.keys(patch).length) return { status: "noop", op };
  return { status: "ok", op, patch, before: beforeFieldsOf(pole, patch) };
}

// ---------------------------------------------------------------------------
// Delete + duplicate descriptors (never mutate — consumer hooks)
// ---------------------------------------------------------------------------

// What Delete/Backspace MEANS for this selection: the whole-row removals a
// consumer's confirm+commit path should apply, and the ids it must skip.
// Mirrors the page's deleteSceneSelection rules exactly — whole-row kinds
// route, sub-objects (wall-segment/pole-sign) and unresolvable ids skip.
export function deleteSelectionPlan(scene, idsOrEntries, opts = {}) {
  const op = "delete";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  const removals = [];
  const skipped = [];
  const seen = new Set();
  for (const entry of Array.isArray(idsOrEntries) ? idsOrEntries : []) {
    const id = idOf(entry);
    if (!isId(id) || seen.has(id)) continue;
    seen.add(id);
    const kind = (typeof entry === "object" && entry?.kind) || parseSceneNodeId(id)?.kind || null;
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
      id, kind, collection: COLLECTION_OF_KIND[kind] ?? res.collection,
      index: res.index, key: parseSceneNodeId(id)?.key ?? null,
      componentId: res.row?.component_id ?? null,
    });
  }
  if (!removals.length) return { status: "empty", op, removals, skipped };
  return { status: "ok", op, removals, skipped, requiresConfirm: true };
}

// What Duplicate MEANS: the resolvable whole-row sources (items/poles/
// walls/caps/cabinets) a consumer's clone+remap path duplicates, with the
// suggested plan offset. Sub-objects ride their parents (never cloned
// independently). The descriptor is consumed by an onDuplicateSelection
// hook — this module does not mint ids (foundationDuplicateMirror owns
// clone+remap+offset).
export function duplicateSelectionPlan(scene, idsOrEntries, opts = {}) {
  const op = "duplicate";
  if (opts.readOnly === true) return { status: "rejected", op, reason: "read-only" };
  const sources = [];
  const skipped = [];
  const seen = new Set();
  for (const entry of Array.isArray(idsOrEntries) ? idsOrEntries : []) {
    const id = idOf(entry);
    if (!isId(id) || seen.has(id)) continue;
    seen.add(id);
    const kind = (typeof entry === "object" && entry?.kind) || parseSceneNodeId(id)?.kind || null;
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
      id, kind, collection: COLLECTION_OF_KIND[kind] ?? res.collection,
      index: res.index, key: parseSceneNodeId(id)?.key ?? null,
      componentId: res.row?.component_id ?? null,
    });
  }
  if (!sources.length) return { status: "empty", op, sources, skipped };
  const off = isRecord(opts.offsetInches) && fin(opts.offsetInches.x) && fin(opts.offsetInches.z)
    ? { x: opts.offsetInches.x, z: opts.offsetInches.z }
    : { ...DEFAULT_DUPLICATE_OFFSET_INCHES };
  return { status: "ok", op, sources, skipped, offset_inches: off };
}

// ---------------------------------------------------------------------------
// History-ready edit records (one op = one undo command)
// ---------------------------------------------------------------------------

// The scene-history record for a computed patch list.
//   Single-item patches → the O-040 single-target record shape the page's
//     patchItem undo apply already round-trips (before/after are
//     item-field patches; target {key,index}).
//   Multi patches → kind "scene-multi", target NULL, before/after each a
//     { multi: [{collection,index,fields}] } payload. `target: null` is the
//     honesty guard: the current single-row undo apply reads
//     rev.target.index → TypeError → the store reports 'rejected' and
//     leaves the stacks untouched — an explicit refusal, never a silent
//     no-op "applied". The mounted multi apply never touches target: it
//     branches on entry.kind === "scene-multi" / rev.patch.multi (see
//     MOUNT-ANCHORS.md).
export function editRecordForPatches(op, method, patches, { label, key } = {}) {
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
      label: label ?? null,
    };
  }
  return {
    kind: SCENE_OP_KINDS.multi,
    method: method ?? "edit",
    key: null,
    identityKind: null,
    before: { multi: list.map((p) => ({ collection: p.collection, index: p.index, fields: p.before })) },
    after: { multi: list.map((p) => ({ collection: p.collection, index: p.index, fields: p.patch })) },
    target: null, // see the honesty-guard note above
    label: label ?? null,
  };
}

// Full-scene (items+poles+walls) anchor for multi-ops: the scene with the
// patch list applied (side "patch") or reverted (side "before").
// Deliberately a different domain than the canvas's items-only observe —
// multi entries never collide with the single-channel undo chain.
export { sceneWithOpPatches as opSceneWithPatches };
