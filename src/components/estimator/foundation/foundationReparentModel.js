// O-036 (CMP-C05) — foundation assembly reparent (attach / detach /
// move-between-assemblies).
//
// Pure, deterministic, DOM-free reparent planning over the scene selection:
// given a mounted (or mountable) child row and a new parent — or STANDALONE
// for detach — compute the patch list that relinks it, with the
// world/local position choice the masterplan calls for. Nothing here
// mutates the scene and nothing commits business data: every plan returns
// the O-035 patch-row contract ({ collection, index, key, before, patch })
// the consumer routes through its own commit channel (the canvas's
// commitOpPatches / the page's patchScene), and reparentEditRecord shapes
// ONE history command per plan so a reparent is ONE undoable stroke.
//
// PARENT-LINK CONTRACT (owned by foundationAssemblyModel.js — imported
// read-only via scene resolution):
//   * poles mount an ITEM through foundation_component_id (legacy mirror
//     foundation_idx); "" or absent canon = standalone. Standalone poles
//     are priced and flagged by NO issue row — detach is a first-class
//     state, not a defect.
//   * wall_caps mount a WALL through wall_component_id (mirror wall_index)
//     plus an optional wall SEGMENT through segment_component_id (mirror
//     segment_index); a component-less segment is not canon-addressable
//     (the canon field always outranks the index mirror under
//     normalization), so only segments carrying component_id are valid
//     targets.
//   * signage_cabinets mount a POLE (mount:"pole" + pole_component_id /
//     pole_index) or an ITEM (mount:"foundation" + foundation_component_id
//     / foundation_index); the unused ref pair is cleared on every write
//     (panel convention) and a detached cabinet keeps its authored mount
//     flavor with both refs empty — the issues list reports missing-mount
//     ("stays priced until assigned"), the honest detached state.
//   * items, walls, wall-segments and pole signs are NOT reparentable
//     children: they carry no parent ref field in assembly_schema_version
//     1 (items and walls are assembly roots; segments and signs are
//     sub-objects whose mount semantics belong to the owning row). Asking
//     for one is a structured refusal, never a fabricated link field.
//
// POSITION CHOICES (world/local):
//   * keep:"world" (default) — the child's stored plan geometry is
//     untouched. Children store plan-ABSOLUTE coordinates (the parent link
//     is a mount reference, not a coordinate frame), so identical stored
//     values = identical world pose before and after the relink.
//   * keep:"local" — the child's local offset inside the OLD parent's
//     rotation frame is preserved inside the NEW parent's frame:
//       newPlan = frameLocalToPlan(newFrame, planToFrameLocal(oldFrame, plan))
//     Only poles carry plan geometry, so this is the only transform that
//     exists. A standalone/dangling old parent contributes the identity
//     (plan) frame — its local IS the plan point. The new parent's frame
//     must resolve (itemPlanGeometry) or the plan refuses
//     "invalid-target-geometry"; a mounted old parent whose frame cannot
//     resolve refuses "invalid-source-geometry" rather than inventing an
//     offset. Caps/cabinets carry no plan coordinates — world and local
//     are the same operation (reported keep:"world" resolved).
//   * Detach always resolves keep:"world" — a standalone object's frame
//     is the plan itself, so world and local coincide. The requested mode
//     is reported in keepRequested for honest UI feedback.
//
// REFUSAL CONTRACT (structured, no mutation — mirrors the O-035 op
// contract): { status:"rejected", op:"reparent", reason, ... } for
//   read-only | unresolved | locked | kind-not-reparentable |
//   legacy-parent-unresolved (the row's effective parent lives ONLY in a
//   legacy *_idx mirror — its canon field is absent; a spread-merge undo
//   cannot restore absentness, so undo would detach the row. Normalize
//   first.) |
//   target-not-found | target-not-addressable (target row/segment has no
//   component_id — a canon mount cannot reference it) |
//   invalid-target-type | segment-not-on-wall | cycle (the child itself
//   appears in the target's ancestor chain — covers self-parenting and
//   malformed data loops; visited-guarded) |
//   invalid-geometry | invalid-target-geometry | invalid-source-geometry.
//   { status:"noop" } when the computed change is empty (already mounted
//   there). Per-child failures inside planReparentSelection land in
//   `skipped`; a STRUCTURALLY invalid target (missing / unaddressable /
//   unparseable) rejects the WHOLE op before any child is considered —
//   never a partial application.
//
// SELECTION: reparented rows keep their component_id and their collection
// index — scene node ids are stable across the op, so the mounted
// selection store's reconcile() retains the child's selection (and
// primary) automatically. Results echo preserveIds for consumers that
// reassert selection explicitly.
//
// MOUNT HANDLES: mountLinkDescriptors(scene) emits the pure geometry a
// handle/link render needs (child anchor point + parent anchor point per
// live mount) — canvas chrome consumes it; nothing visual is assumed here.

import {
  layoutItemKey,
} from "./foundationLayoutModel";
import {
  planPointOf,
  planToFrameLocal,
  frameLocalToPlan,
} from "./foundationSceneTransforms";
import {
  itemPlanGeometry,
  wallPlanGeometry,
} from "./foundationSceneInput";
import {
  parseSceneNodeId,
  resolveSceneNode,
  sceneCollections,
  sceneNodeId,
} from "./foundationSceneSelection";
import {
  beforeFieldsOf,
  editRecordForPatches,
} from "./foundationSceneEditOps";

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const isId = (v) => typeof v === "string" && v.length > 0;
const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const has = (row, field) => Object.prototype.hasOwnProperty.call(row ?? {}, field);
const isReservedRef = (v) => typeof v === "string" && v.startsWith("unresolved:");
const mirrorLive = (v) => v !== undefined && v !== null && v !== -1;

// ---------------------------------------------------------------------------
// The reparent matrix — what may move, and what may receive it.
// ---------------------------------------------------------------------------

export const REPARENT_CHILD_KINDS = Object.freeze(["pole", "wall-cap", "cabinet"]);
export const REPARENT_PARENT_KINDS = Object.freeze(["item", "pole", "wall", "wall-segment", "standalone"]);
export const REPARENT_KEEP_MODES = Object.freeze(["world", "local"]);

const CHILD_SPEC = Object.freeze({
  pole: { collection: "poles", parents: ["item"], nodeId: sceneNodeId.pole },
  "wall-cap": { collection: "wall_caps", parents: ["wall", "wall-segment"], nodeId: sceneNodeId.wallCap },
  cabinet: { collection: "signage_cabinets", parents: ["pole", "item"], nodeId: sceneNodeId.cabinet },
});

const COLLECTION_TO_KIND = Object.freeze({
  poles: "pole",
  wall_caps: "wall-cap",
  signage_cabinets: "cabinet",
});

export function reparentChildSpec(kind) {
  const spec = CHILD_SPEC[kind] ?? null;
  return spec ? { kind, collection: spec.collection, parents: [...spec.parents] } : null;
}

const defaultIsLocked = (row) => row?.locked === true || row?.locked === 1;

// ---------------------------------------------------------------------------
// Parent resolution — the live mount of any child row.
// ---------------------------------------------------------------------------

const ROW_OF_KIND = Object.freeze({
  item: "items",
  pole: "poles",
  wall: "walls",
  "wall-cap": "wall_caps",
  cabinet: "signage_cabinets",
});

const byComponentId = (rows, id) => {
  if (!isId(id)) return null;
  const i = (rows || []).findIndex((r) => r?.component_id === id);
  return i >= 0 ? { row: rows[i], index: i } : null;
};

const legacyIndex = (v, count) => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : v;
  if (!Number.isInteger(n) || n < 0 || n >= count) return null;
  return n;
};

const nodeIdOf = (kind, row, index) => {
  if (kind === "item") return sceneNodeId.item(layoutItemKey(row, index));
  if (kind === "wall") return sceneNodeId.wall(layoutItemKey(row, index));
  const make = CHILD_SPEC[kind]?.nodeId;
  return make ? make(layoutItemKey(row, index)) : null;
};

// One upward link for the ancestor walk: { kind, componentId, index?, via }
// or null. Present canon wins; an absent canon falls back to the legacy
// mirror (same precedence the assembly model applies); dangling canon ids
// are followed as ids (a malformed chain must still close its loop).
const parentLinkOf = (cols, kind, row) => {
  if (!isRecord(row)) return null;
  const link = (parentKind, canonField, mirrorField, parentRows) => {
    if (has(row, canonField)) {
      const v = row[canonField];
      return isId(v) ? { kind: parentKind, componentId: v, via: "canon" } : null;
    }
    const i = legacyIndex(row?.[mirrorField], parentRows.length);
    return i !== null
      ? { kind: parentKind, componentId: parentRows[i]?.component_id ?? null, index: i, via: "legacy" }
      : null;
  };
  if (kind === "pole") return link("item", "foundation_component_id", "foundation_idx", cols.items);
  if (kind === "cabinet") {
    if (row.mount === "pole") return link("pole", "pole_component_id", "pole_index", cols.poles);
    if (row.mount === "foundation") return link("item", "foundation_component_id", "foundation_index", cols.items);
    return null;
  }
  if (kind === "wall-cap") return link("wall", "wall_component_id", "wall_index", cols.walls);
  // items / walls are roots; segments and signs resolve through owners.
  return null;
};

// Component ids reachable by walking UP the parent chain from (kind,row) —
// i.e. every ancestor. A reparent target whose own ancestor chain contains
// the child would close a cycle. Follows live, dangling and malformed
// links alike, visited-guarded so existing cyclic data stops, not hangs.
export function ancestorComponentIds(scene, kind, row) {
  const cols = sceneCollections(scene);
  const seen = new Set();
  let cur = { kind, row };
  let guard = 0;
  while (cur && guard < 64) {
    guard += 1;
    const link = parentLinkOf(cols, cur.kind, cur.row);
    if (!link || !isId(link.componentId) || isReservedRef(link.componentId)) break;
    if (seen.has(link.componentId)) break; // existing cycle — stop
    seen.add(link.componentId);
    const coll = ROW_OF_KIND[link.kind];
    const found = coll ? byComponentId(cols[coll], link.componentId) : null;
    cur = found ? { kind: link.kind, row: found.row } : null;
  }
  return seen;
}

// The live mount of a child row, as a descriptor:
//   { kind:"item"|"pole"|"wall", componentId, index, nodeId, via }
//   { kind:"wall-segment", componentId, index, wallComponentId, wallIndex, nodeId, via }
//   { kind:"standalone" } — mounted nowhere ("" or absent ref).
//   { kind:"dangling", componentId } — ref names a missing row.
//   { kind:"unresolved", componentId } — reserved "unresolved:" token.
//   { kind:"unsupported", mount } — a cabinet mount flavor the model
//     cannot parent (priced + visible until reassigned, per the issues list).
// Cap descriptors at "wall" level also carry `segment: {...}` when an
// authored segment ref exists but is dangling/unresolved on that wall.
export function reparentParentOf(scene, kind, row) {
  const cols = sceneCollections(scene);
  if (!CHILD_SPEC[kind] || !isRecord(row)) return null;

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
      via: link.via ?? "canon",
    };
  };

  if (kind === "pole") return resolve(parentLinkOf(cols, kind, row));

  if (kind === "cabinet") {
    const out = resolve(parentLinkOf(cols, kind, row));
    out.mount = row.mount ?? null;
    return out;
  }

  // wall-cap — deepest live mount wins: a segment of the resolved wall,
  // else the wall itself (with the authored segment claim reported).
  const wallLink = parentLinkOf(cols, kind, row);
  if (!wallLink) return { kind: "standalone" };
  if (isReservedRef(wallLink.componentId)) return { kind: "unresolved", componentId: wallLink.componentId };
  const wall = byComponentId(cols.walls, wallLink.componentId);
  if (!wall) return { kind: "dangling", componentId: wallLink.componentId };
  const wallNodeId = sceneNodeId.wall(layoutItemKey(wall.row, wall.index));
  const base = { componentId: wallLink.componentId, index: wall.index, nodeId: wallNodeId, via: wallLink.via ?? "canon" };
  const segs = Array.isArray(wall.row?.shape?.segments) ? wall.row.shape.segments : [];
  const segRef = row.segment_component_id;
  if (!isId(segRef)) {
    // Legacy mirror fallback — segment_index into the resolved wall's
    // segments. Only a canon-id'd segment is a live sub-mount; a
    // component-less row resolves to wall level honestly (normalization
    // mints the canon on the next commit).
    const si = legacyIndex(row.segment_index, segs.length);
    const segRow = si !== null ? segs[si] : null;
    if (segRow && isId(segRow.component_id) && !isReservedRef(segRow.component_id)) {
      return {
        kind: "wall-segment",
        componentId: segRow.component_id,
        index: si,
        wallComponentId: wallLink.componentId,
        wallIndex: wall.index,
        nodeId: sceneNodeId.wallSegment(layoutItemKey(wall.row, wall.index), `component:${segRow.component_id}`),
        via: "legacy",
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
    via: "canon",
  };
}

// ---------------------------------------------------------------------------
// Child + target resolution
// ---------------------------------------------------------------------------

// Accepts a scene node id ("pole:component:X") or { collection, index }.
// Returns { id, kind, collection, index, key, row, componentId } or null.
const resolveChild = (scene, ref) => {
  const cols = sceneCollections(scene);
  if (typeof ref === "string") {
    const parsed = parseSceneNodeId(ref);
    if (!parsed || !CHILD_SPEC[parsed.kind]) return null;
    const res = resolveSceneNode(scene, ref);
    if (!res || !isRecord(res.row)) return null;
    return {
      id: ref, kind: parsed.kind, collection: res.collection,
      index: res.index, key: parsed.key, row: res.row,
      componentId: res.row?.component_id ?? null,
    };
  }
  if (isRecord(ref) && typeof ref.collection === "string" && Number.isInteger(ref.index)) {
    const kind = COLLECTION_TO_KIND[ref.collection];
    const spec = kind ? CHILD_SPEC[kind] : null;
    if (!spec) return null;
    const row = cols[spec.collection]?.[ref.index];
    if (!isRecord(row)) return null;
    const key = layoutItemKey(row, ref.index);
    return {
      id: spec.nodeId(key), kind, collection: spec.collection,
      index: ref.index, key, row, componentId: row?.component_id ?? null,
    };
  }
  return null;
};

// Structural target resolution — WHERE/WHAT the target is, independent of
// which child asks. Returns { target } or { reason, detail }:
//   { kind:"standalone" }
//   { kind:"item"|"pole"|"wall", componentId, index, row, nodeId }
//   { kind:"wall-segment", componentId, index, wallComponentId, wallIndex, wall, nodeId }
// A caller-supplied wall bound (wallComponentId) whose segment lives on a
// different wall reports "segment-not-on-wall".
export function resolveReparentTargetNode(scene, target) {
  const cols = sceneCollections(scene);
  if (target === null || target === undefined || target === "standalone"
    || target?.detach === true || target?.kind === "standalone") {
    return { target: { kind: "standalone" } };
  }

  const finishRow = (kind, found, nodeId) => {
    const componentId = found.row?.component_id ?? null;
    if (!isId(componentId) || isReservedRef(componentId)) {
      return { reason: "target-not-addressable", detail: componentId };
    }
    return {
      target: { kind, componentId, index: found.index, row: found.row, nodeId: nodeId ?? nodeIdOf(kind, found.row, found.index) },
    };
  };

  const finishSegment = (wall, wallIndex, segmentIndex, segRow, nodeId) => {
    const segId = segRow?.component_id ?? null;
    const wallId = wall?.component_id ?? null;
    if (!isId(wallId) || isReservedRef(wallId)) return { reason: "target-not-addressable", detail: "segment-wall" };
    if (!isId(segId) || isReservedRef(segId)) return { reason: "target-not-addressable", detail: segId };
    return {
      target: {
        kind: "wall-segment", componentId: segId, index: segmentIndex,
        wallComponentId: wallId, wallIndex, wall,
        nodeId: nodeId ?? sceneNodeId.wallSegment(layoutItemKey(wall, wallIndex), `component:${segId}`),
      },
    };
  };

  const locateSegment = (segId, wallComponentId) => {
    const pool = isId(wallComponentId)
      ? [byComponentId(cols.walls, wallComponentId)].filter(Boolean)
      : cols.walls.map((row, index) => ({ row, index }));
    for (const w of pool) {
      const segs = Array.isArray(w.row?.shape?.segments) ? w.row.shape.segments : [];
      const si = segs.findIndex((s) => s?.component_id === segId);
      if (si >= 0) return { wall: w.row, wallIndex: w.index, segmentIndex: si, segRow: segs[si] };
    }
    // Explicit wall bound + segment mounted on ANOTHER wall is a distinct,
    // more honest failure than a missing target.
    if (isId(wallComponentId)) {
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
      const res = resolveSceneNode(scene, target);
      if (!res) return { reason: "target-not-found", detail: target };
      const segRow = res.segment ?? null;
      if (!segRow) return { reason: "target-not-addressable", detail: parsed.ref ?? null };
      return finishSegment(res.row, res.wallIndex, res.segmentIndex, segRow, target);
    }
    const res = resolveSceneNode(scene, target);
    if (!res || !isRecord(res.row)) return { reason: "target-not-found", detail: target };
    return finishRow(parsed.kind, { row: res.row, index: res.index }, target);
  }

  if (isRecord(target)) {
    const spec = { ...target };
    const segId = spec.segmentComponentId ?? (spec.kind === "wall-segment" ? spec.componentId : null);
    if (spec.kind === "wall-segment" || (spec.kind === "wall" && isId(segId))) {
      // The wall bound: an explicit wallComponentId, or — for the
      // {kind:"wall", componentId, segmentComponentId} shorthand — the
      // wall's own component id. A bare wall-segment target binds nothing
      // (its componentId IS the segment's, never a bound).
      const bound = spec.kind === "wall"
        ? (spec.wallComponentId ?? spec.componentId)
        : spec.wallComponentId;
      const found = isId(segId) ? locateSegment(segId, bound) : null;
      if (found?.reason) return { reason: found.reason, detail: found };
      if (!found) return { reason: "target-not-found", detail: segId };
      // For {kind:"wall", componentId, segmentComponentId} the wall bound IS
      // componentId — locateSegment already enforced ownership.
      return finishSegment(found.wall, found.wallIndex, found.segmentIndex, found.segRow, spec.nodeId);
    }
    const coll = ROW_OF_KIND[spec.kind];
    const found = coll ? byComponentId(cols[coll], spec.componentId) : null;
    if (!found) return { reason: "target-not-found", detail: spec.componentId ?? null };
    return finishRow(spec.kind, found, spec.nodeId);
  }

  return { reason: "target-not-found", detail: target ?? null };
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

const reject = (reason, extra = {}) => ({ status: "rejected", op: "reparent", reason, ...extra });

// A row whose EFFECTIVE parent lives only in a legacy index mirror (canon
// field absent) cannot round-trip undo: the reparent patch writes the
// canon, undo reverts it to present-undefined, and a present canon —
// even undefined — outranks the mirror under normalization. The row
// would silently detach instead of restoring. Refuse until the row is
// normalized (commit materializes canon ids).
const legacyParentGuard = (child) => {
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
    // A segment sub-mount rides segment_index only when the wall link is
    // real — a segment mirror on an unmounted cap is dead weight.
    const wallLink = has(row, "wall_component_id")
      ? isId(row.wall_component_id)
      : live("wall_index");
    if (wallLink && !has(row, "segment_component_id") && live("segment_index")) return "legacy-parent-unresolved";
    return null;
  }
  return null;
};

const polePointOf = (row) => planPointOf({ x: row?.x_inches, z: row?.z_inches });

// keep:"local" transform for a pole — the only child with plan geometry.
// Returns { fields, resolved } or a reject record.
const localPolePatch = (cols, child, from, to) => {
  const point = polePointOf(child.row);
  if (!point) return reject("invalid-geometry", { detail: "pole-point" });
  // Old local coords: inside the live old item's frame, else the identity
  // (plan) frame — a standalone/dangling/unresolved parent has no frame to
  // contribute, and the stored plan point IS the world truth.
  let oldLocal = point;
  if (from?.kind === "item" && isId(from.componentId)) {
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
  if (!next || !fin(next.x) || !fin(next.z)) return reject("invalid-geometry", { detail: "pole-plan" });
  return { fields: { x_inches: next.x, z_inches: next.z }, resolved: "local", local: oldLocal };
};

const patchForChild = (child, to) => {
  if (child.kind === "pole") {
    const target = to.kind === "standalone" ? null : to;
    return {
      foundation_component_id: target ? target.componentId : "",
      foundation_idx: target ? target.index : undefined,
    };
  }
  if (child.kind === "cabinet") {
    if (to.kind === "standalone") {
      return {
        mount: child.row?.mount,
        pole_component_id: "",
        pole_index: undefined,
        foundation_component_id: "",
        foundation_index: undefined,
      };
    }
    if (to.kind === "pole") {
      return {
        mount: "pole",
        pole_component_id: to.componentId,
        pole_index: to.index,
        foundation_component_id: "",
        foundation_index: undefined,
      };
    }
    return {
      mount: "foundation",
      foundation_component_id: to.componentId,
      foundation_index: to.index,
      pole_component_id: "",
      pole_index: undefined,
    };
  }
  // wall-cap
  if (to.kind === "standalone") {
    return {
      wall_component_id: "",
      wall_index: undefined,
      segment_component_id: "",
      segment_index: undefined,
    };
  }
  if (to.kind === "wall") {
    return {
      wall_component_id: to.componentId,
      wall_index: to.index,
      segment_component_id: "",
      segment_index: undefined,
    };
  }
  return {
    wall_component_id: to.wallComponentId,
    wall_index: to.wallIndex,
    segment_component_id: to.componentId,
    segment_index: to.index,
  };
};

const childShort = (child) => `${child.kind} ${child.index + 1}`;
const parentShort = (to) =>
  to.kind === "standalone" ? "standalone"
    : to.kind === "wall-segment" ? `wall ${to.wallIndex + 1} segment ${to.index + 1}`
      : `${to.kind} ${to.index + 1}`;

// Plan reparenting ONE child. `childRef` = scene node id or
// { collection, index }; `target` = null/"standalone"/{detach:true} /
// a resolved target descriptor / a parent ({kind,componentId} | node id |
// {kind:"wall",componentId,segmentComponentId} | wall-segment forms).
// opts.keep = "world" (default) | "local"; opts.readOnly / opts.isLocked
// match the O-035 discipline.
export function planReparent(scene, childRef, target, opts = {}) {
  const op = "reparent";
  if (opts.readOnly === true) return reject("read-only");
  const cols = sceneCollections(scene);
  const child = resolveChild(scene, childRef);
  if (!child) {
    const ANY_KIND_OF_COLLECTION = { items: "item", walls: "wall", ...COLLECTION_TO_KIND };
    const kind = typeof childRef === "string"
      ? parseSceneNodeId(childRef)?.kind
      : ANY_KIND_OF_COLLECTION[childRef?.collection];
    return reject(kind && !CHILD_SPEC[kind] ? "kind-not-reparentable" : "unresolved", { kind: kind ?? null });
  }
  const isLocked = typeof opts.isLocked === "function" ? opts.isLocked : defaultIsLocked;
  if (isLocked(child.row)) return reject("locked", { child: child.id });
  const legacy = legacyParentGuard(child);
  if (legacy) return reject(legacy, { child: child.id });

  const resolved = resolveReparentTargetNode(scene, target);
  if (resolved.reason) return reject(resolved.reason, { detail: resolved.detail, child: child.id });
  const to = resolved.target;
  if (to.kind !== "standalone" && !CHILD_SPEC[child.kind].parents.includes(to.kind)) {
    return reject("invalid-target-type", { child: child.id, detail: { childKind: child.kind, targetKind: to.kind } });
  }

  // Cycle: the child inside the target's own ancestor chain closes a loop
  // — covers self-parenting (same component id) and malformed link loops.
  if (to.kind !== "standalone" && isId(child.componentId)) {
    if (child.componentId === to.componentId
      || (to.kind === "wall-segment" && child.componentId === to.wallComponentId)) {
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
    collection: child.collection, index: child.index, key: child.key,
    before, patch,
  };
  return {
    status: "ok", op, patches: [patchRow], skipped: [],
    child: { id: child.id, kind: child.kind, collection: child.collection, index: child.index, componentId: child.componentId },
    from, to, keep, keepRequested,
    preserveIds: [child.id],
    label: to.kind === "standalone"
      ? `Detach ${childShort(child)}`
      : `Reparent ${childShort(child)} to ${parentShort(to)}`,
  };
}

// Multi-selection variant — the canvas's selection seam shape. The target
// resolves ONCE structurally up front: a missing/unaddressable target
// rejects the whole op before any child is considered. Per-child failures
// (kind mismatch, locked, cycle, legacy-parent) land in skipped; children
// already mounted there count as noop. One ok result = one history
// command (patches ride the multi channel end to end).
export function planReparentSelection(scene, ids, target, opts = {}) {
  const op = "reparent";
  if (opts.readOnly === true) return reject("read-only");
  const list = (Array.isArray(ids) ? ids : [])
    .map((e) => (typeof e === "string" ? e : e?.id))
    .filter(isId);
  if (!list.length) return reject("empty-selection");

  // Structural probe — shared across every child (kind checks stay per
  // child: a pole-only target legitimately skips a selected cabinet).
  const probe = resolveReparentTargetNode(scene, target);
  if (probe.reason) return reject(probe.reason, { detail: probe.detail });

  const patches = [];
  const skipped = [];
  const children = [];
  let keep = "world";
  const keepRequested = opts.keep === "local" ? "local" : "world";

  for (const id of list) {
    const r = planReparent(scene, id, target, opts);
    if (r.status === "ok") {
      patches.push(...r.patches);
      children.push(r.child);
      if (r.keep === "local") keep = "local";
    } else if (r.status === "noop") {
      skipped.push({ id, reason: "already-mounted" });
    } else {
      skipped.push({ id, reason: r.reason ?? "rejected", detail: r.detail ?? null });
    }
  }

  if (!children.length) {
    if (skipped.length && skipped.every((s) => s.reason === "already-mounted")) {
      return { status: "noop", op, skipped };
    }
    return { status: "rejected", op, reason: "empty-selection", skipped };
  }
  return {
    status: "ok", op, patches, skipped,
    children, count: children.length,
    keep, keepRequested,
    preserveIds: children.map((c) => c.id),
    label: children.length === 1
      ? `Reparent ${childShort(children[0])}`
      : `Reparent ${children.length} objects`,
  };
}

// What the picker shows — every valid parent for this child, the detach
// affordance, and the current mount. Pure data; rendering is a consumer
// concern. targets: [{kind, componentId, nodeId, index, label, current}]
// with wall-segment entries also carrying wallComponentId/wallIndex.
export function reparentTargetsFor(scene, childRef) {
  const child = resolveChild(scene, childRef);
  if (!child) return { status: "rejected", reason: "unresolved", targets: [], detach: false };
  const cols = sceneCollections(scene);
  const from = reparentParentOf(scene, child.kind, child.row);
  const parents = CHILD_SPEC[child.kind].parents;
  const targets = [];

  const push = (kind, row, index, extra = {}) => {
    const componentId = row?.component_id ?? null;
    if (!isId(componentId) || isReservedRef(componentId)) return;
    targets.push({
      kind, componentId, index,
      nodeId: nodeIdOf(kind, row, index),
      label: `${kind} ${index + 1}`,
      current: from?.kind === kind && from?.componentId === componentId,
      ...extra,
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
          if (!isId(segId) || isReservedRef(segId)) return;
          targets.push({
            kind: "wall-segment", componentId: segId, index: si,
            wallComponentId: w.component_id, wallIndex: i,
            nodeId: sceneNodeId.wallSegment(key, `component:${segId}`),
            label: `wall ${i + 1} segment ${si + 1}`,
            current: from?.kind === "wall-segment" && from?.componentId === segId,
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
    targets,
  };
}

// ---------------------------------------------------------------------------
// Mount-link descriptors — the "visible mount handles" data seam.
// ---------------------------------------------------------------------------

// One descriptor per live mount (pole→item, cap→wall/segment,
// cabinet→pole|item): where the child's handle badge sits and where its
// link line ends. Points are plan inches; null when no honest anchor
// exists (a cap on an outline-less wall). Detached/dangling/unresolved
// mounts emit nothing — there is no mount to show.
export function mountLinkDescriptors(scene) {
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
      childId: sceneNodeId.pole(layoutItemKey(p, i)), childKind: "pole",
      collection: "poles", index: i, componentId: p?.component_id ?? null,
      parentId: from.nodeId ?? null, parentKind: "item", parentComponentId: from.componentId,
      handlePoint: polePointOf(p),
      parentPoint: itemCenter(from.componentId),
    });
  });

  cols.wall_caps.forEach((c, i) => {
    const from = reparentParentOf(scene, "wall-cap", c);
    if (!from || (from.kind !== "wall" && from.kind !== "wall-segment")) return;
    const wallId = from.kind === "wall-segment" ? from.wallComponentId : from.componentId;
    const wall = byComponentId(cols.walls, wallId)?.row;
    out.push({
      childId: sceneNodeId.wallCap(layoutItemKey(c, i)), childKind: "wall-cap",
      collection: "wall_caps", index: i, componentId: c?.component_id ?? null,
      parentId: from.nodeId ?? null, parentKind: from.kind,
      parentComponentId: from.kind === "wall-segment" ? from.componentId : wallId,
      handlePoint: from.kind === "wall-segment" ? segAnchor(wall, from.index) : wallAnchor(wallId),
      parentPoint: wallAnchor(wallId),
      segmentIndex: from.kind === "wall-segment" ? from.index : null,
    });
  });

  cols.signage_cabinets.forEach((c, i) => {
    const from = reparentParentOf(scene, "cabinet", c);
    if (!from || (from.kind !== "pole" && from.kind !== "item")) return;
    const anchor = from.kind === "pole" ? polePoint(from.componentId) : itemCenter(from.componentId);
    out.push({
      childId: sceneNodeId.cabinet(layoutItemKey(c, i)), childKind: "cabinet",
      collection: "signage_cabinets", index: i, componentId: c?.component_id ?? null,
      parentId: from.nodeId ?? null, parentKind: from.kind, parentComponentId: from.componentId,
      mount: c?.mount ?? null,
      // A cabinet carries no plan point of its own — the handle sits on the
      // mount itself (the pole's point or the item's center).
      handlePoint: anchor,
      parentPoint: anchor,
    });
  });

  return out;
}

// ---------------------------------------------------------------------------
// History record (one reparent = one undo command)
// ---------------------------------------------------------------------------

// The scene-history record for an ok plan — delegates to the O-035 record
// builder, so reparent payloads are the same { multi:[{collection,index,
// fields}] } shape the mounted page's multi-branch undo apply consumes
// (kind "scene-multi", target:null honesty guard — reparent patches never
// fit the single-items channel). Record AFTER the commit lands, anchored
// exactly like commitOpPatches does.
export function reparentEditRecord(result, { method = "plan", label } = {}) {
  if (!result || result.status !== "ok") return null;
  return editRecordForPatches("reparent", method, result.patches, {
    label: label ?? result.label ?? null,
  });
}
