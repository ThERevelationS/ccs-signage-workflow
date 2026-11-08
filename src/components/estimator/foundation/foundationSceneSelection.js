// O-034 (CMP-C03) — foundation scene tree + selection model.
//
// Pure, deterministic, DOM-free scene-object addressing and selection state.
// One implementation answers every selection question the estimator asks:
// "what node is under this point" (hitTestPlanAll topmost wins — the canvas
// paint order), "what objects does this rubber-band rect cover" (plan-space
// region test), "what did this row resolve to" (all five assembly arrays +
// wall segments + pole signs), "what is selected" (ordered ids + primary +
// hit-part detail), "what is its breadcrumb" (parent chain through mounts),
// "is this gesture a click or a drag" (screen-px slop threshold), and "what
// survived this scene change" (identity reconciliation that never lets a
// stale selection address a different row).
//
// Consumed by the layout canvas at its existing pointer seam; consumed next
// by the object-tree/properties/highlight panels (deferred page wiring —
// the store is subscribe()/stateVersion-ready for useSyncExternalStore, the
// same mount shape as foundationSceneHistory).
//
// Geometry contract (owned by foundationLayoutModel.js /
// foundationAssemblyModel.js / foundationSceneInput.js — imported
// read-only):
//   * items carry a TOP-LEFT plan corner + unrotated footprint + rotation
//     about the footprint center; pillars are circles (diameter x diameter).
//   * poles carry a plan POINT.
//   * walls carry shape.points [{x,z}] + shape.closed; geometric segment i
//     runs points[i] -> points[(i+1) % n] (last wraps only when closed);
//     shape.segments[i] is the authored row for geometric segment i.
//   * wall_caps / signage_cabinets / pole signs carry NO plan coordinates —
//     they are reachable through the tree and the pointer (mounted parents)
//     but never hit-tested or region-selected.
//
// Node-id contract: `${kind}:${identity}` strings, deterministic functions
// of the scene — rebuild the scene and the same object gets the same id.
//   item / pole / wall / wall-cap / cabinet → `${kind}:${layoutItemKey}`
//   wall-segment → `wall-segment:${wallKey}|${segRef}`   segRef =
//     `component:${segment_component_id}` when the authored segment row
//     carries one, else `index:${segmentIndex}` (geometric position).
//   pole-sign → `pole-sign:${poleKey}|${signRef}` same ref rule.
// `|` is the sub-object delimiter; ids split on the LAST `|` so a parent
// key may itself contain `|` safely (only a component_id containing `|`
// inside the trailing ref could confuse a parse — malformed authored ids
// degrade, never crash; resolution is byId-driven, not parse-driven).
//
// Click-vs-drag contract: gestures resolve at RELEASE displacement, not
// intermediate travel — a press that returns within
// SELECTION_CLICK_THRESHOLD_PX of its down point is a click (selection
// applies); anything beyond it is a drag (selection untouched). This is the
// "drags don't deselect" rule: the canvas's own 1-inch commit wiggle guard
// is unrelated — this slop is measured in screen px on the pointer.
//
// Keyboard contract (selectionKeyAction / store.applyKey):
//   Tab / ArrowRight / ArrowDown → cycle forward through tree order;
//   Shift+Tab / ArrowLeft / ArrowUp → cycle backward;
//   Escape → clear; Delete/Backspace → 'delete-request' — the store NEVER
//   deletes; the action is a hook point the consumer's commit path serves.
//   ctrl/meta/alt modifiers bail (browser shortcuts pass through), except
//   Shift which is the additive/cycle-reverse modifier. On item elements
//   the canvas runs its nudge path FIRST, so arrows there stay nudges —
//   cycle only reaches arrows on the plan container.
//
// Reconcile contract: an exact-id match keeps the selection (positional
// `index:` ids auto-track the row now at that position — the same identity
// rule resolveSceneDragTarget uses: a positional id that vanished means the
// collection shrank and the selection is dropped, never re-pointed).
// Component/legacy ids survive reorders; `index:` segment/sign refs upgrade
// to `component:` ids when normalization mints them (reported in remapped).
// Part detail re-validates: an out-of-range vertexIndex/segmentIndex
// downgrades to {type:'row'} — the object stays selected, the stale
// sub-part claim is dropped.

import {
  layoutItemKey,
} from "./foundationLayoutModel";
import {
  planPointOf,
  framePlanCorners,
} from "./foundationSceneTransforms";
import {
  itemPlanGeometry,
  wallPlanGeometry,
  hitTestPlanAll,
  hitLabel,
  sceneObjectLabel,
} from "./foundationSceneInput";

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const isId = (v) => typeof v === "string" && v.length > 0;
const hypot = Math.hypot;

// Pointer travel below this is a click, not a drag (css-px on the pointer —
// matches the slop browsers apply before a press becomes a move).
export const SELECTION_CLICK_THRESHOLD_PX = 5;

// Region-select modes: 'intersect' = the rubber band touches the object
// (default, rubber-band convention); 'contain' = the object must lie fully
// inside the region (deliberate selection).
export const REGION_SELECT_MODES = Object.freeze(["intersect", "contain"]);

export const SCENE_NODE_KINDS = Object.freeze([
  "item", "wall", "wall-segment", "pole", "pole-sign", "wall-cap", "cabinet",
]);

const COLLECTION_OF_KIND = Object.freeze({
  item: "items",
  wall: "walls",
  "wall-segment": "walls",
  pole: "poles",
  "pole-sign": "poles",
  "wall-cap": "wall_caps",
  cabinet: "signage_cabinets",
});

// ---------------------------------------------------------------------------
// Scene normalization — accepts the assembly's snake_case arrays or the
// canvas's camelCase props interchangeably.
// ---------------------------------------------------------------------------

export function sceneCollections(scene) {
  const s = scene && typeof scene === "object" ? scene : {};
  return {
    items: Array.isArray(s.items) ? s.items : [],
    walls: Array.isArray(s.walls) ? s.walls : [],
    poles: Array.isArray(s.poles) ? s.poles : [],
    wall_caps: Array.isArray(s.wall_caps) ? s.wall_caps : Array.isArray(s.wallCaps) ? s.wallCaps : [],
    signage_cabinets: Array.isArray(s.signage_cabinets)
      ? s.signage_cabinets
      : Array.isArray(s.signageCabinets) ? s.signageCabinets : [],
  };
}

// ---------------------------------------------------------------------------
// Node ids + the object tree
// ---------------------------------------------------------------------------

const subRef = (componentId, index) =>
  isId(componentId) ? `component:${componentId}` : `index:${index}`;

export const sceneNodeId = Object.freeze({
  item: (key) => `item:${key}`,
  pole: (key) => `pole:${key}`,
  wall: (key) => `wall:${key}`,
  wallSegment: (wallKey, ref) => `wall-segment:${wallKey}|${ref}`,
  poleSign: (poleKey, ref) => `pole-sign:${poleKey}|${ref}`,
  wallCap: (key) => `wall-cap:${key}`,
  cabinet: (key) => `cabinet:${key}`,
});

// Parse a node id into { kind, key, parentKey, ref }. Longest prefixes
// first; sub-object ids split on the LAST '|'. Unknown shapes return null —
// callers treat unparseable ids as foreign and leave them alone.
export function parseSceneNodeId(id) {
  if (typeof id !== "string" || !id) return null;
  const prefixed = (prefix, kind, sub) => {
    if (!id.startsWith(prefix)) return null;
    const body = id.slice(prefix.length);
    if (!sub) return { kind, key: body, parentKey: null, ref: null };
    const cut = body.lastIndexOf("|");
    if (cut < 0) return { kind, key: body, parentKey: null, ref: null };
    return { kind, key: body.slice(0, cut), parentKey: body.slice(0, cut), ref: body.slice(cut + 1) };
  };
  return (
    prefixed("wall-segment:", "wall-segment", true) ||
    prefixed("pole-sign:", "pole-sign", true) ||
    prefixed("wall-cap:", "wall-cap") ||
    prefixed("item:", "item") ||
    prefixed("wall:", "wall") ||
    prefixed("pole:", "pole") ||
    prefixed("cabinet:", "cabinet") ||
    null
  );
}

// Geometric segment count for a wall — points.length with closed wrap.
const wallSegmentCount = (wall) => {
  const g = wallPlanGeometry(wall);
  if (!g || g.points.length < 2) return 0;
  return g.closed ? g.points.length : g.points.length - 1;
};

const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const segRow = (wall, i) => (Array.isArray(wall?.shape?.segments) ? wall.shape.segments[i] : undefined);

// Parent component-id resolution. Only a live component_id link counts —
// reserved "unresolved:" tokens and dangling refs resolve to null, matching
// the assembly model's parent semantics (a dangling parent is shown as
// unresolved, not silently re-pointed).
const parentItemId = (ref, rows, kind) => {
  if (!isId(ref) || ref.startsWith("unresolved:")) return null;
  const i = (rows || []).findIndex((r) => r?.component_id === ref);
  return i >= 0 ? `${kind}:${layoutItemKey(rows[i], i)}` : null;
};

// Legacy-index parent fallback — pre-normalize scenes may only carry the
// *_idx/*_index mirrors. Used ONLY when no component ref is present at all
// (a dangling component ref stays unresolved; the index mirror is not
// consulted for it — the assembly model treats them as the same link).
const parentByIndex = (idx, rows, kind) => {
  const n = typeof idx === "string" && /^\d+$/.test(idx) ? parseInt(idx, 10) : idx;
  if (!Number.isInteger(n) || n < 0 || n >= (rows || []).length) return null;
  return `${kind}:${layoutItemKey(rows[n], n)}`;
};

// A ref that is PRESENT (even "" or an "unresolved:" token) means the link
// was authored — the index mirror is only a migration path when no
// component ref exists at all.
const refPresent = (v) => v !== undefined && v !== null;

const parentForPole = (p, cols) => {
  if (refPresent(p?.foundation_component_id)) return parentItemId(p.foundation_component_id, cols.items, "item");
  return parentByIndex(p?.foundation_idx ?? p?.foundation_index, cols.items, "item");
};
const parentForCabinet = (c, cols) => {
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

// The object tree — one deterministic pass over all five assembly arrays
// plus wall segments and pole signs. Returns { nodes: Map, order: [ids]
// (DFS, parent before children), roots: [ids] }. Nodes are snapshots:
// { id, kind, collection, index, key, componentId, label, parentId,
//   childIds, depth, planar, selectable, segmentIndex?, vertex?... }.
export function buildSceneTree(scene) {
  const cols = sceneCollections(scene);
  const nodes = new Map();
  const childIds = new Map();
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

  // Parents first — mounted rows need their parents to already exist.
  const itemIds = cols.items.map((it, i) => define({
    id: sceneNodeId.item(layoutItemKey(it, i)),
    kind: "item", collection: "items", index: i,
    key: layoutItemKey(it, i), componentId: it?.component_id ?? null,
    label: sceneObjectLabel("items", i),
    parentId: null, depth: 0, planar: true, selectable: true,
  }));

  const wallIds = cols.walls.map((w, i) => define({
    id: sceneNodeId.wall(layoutItemKey(w, i)),
    kind: "wall", collection: "walls", index: i,
    key: layoutItemKey(w, i), componentId: w?.component_id ?? null,
    label: sceneObjectLabel("walls", i),
    parentId: null, depth: 0, planar: true, selectable: true,
  }));

  const poleIds = cols.poles.map((p, i) => {
    const parent = parentForPole(p, cols);
    return define({
      id: sceneNodeId.pole(layoutItemKey(p, i)),
      kind: "pole", collection: "poles", index: i,
      key: layoutItemKey(p, i), componentId: p?.component_id ?? null,
      label: sceneObjectLabel("poles", i),
      parentId: parent, planar: true, selectable: true,
      parentComponentId: isId(p?.foundation_component_id) ? p.foundation_component_id : null,
    });
  });

  // Children: wall segments (one node per GEOMETRIC segment — a wall with
  // no authored shape.segments still exposes its segments to selection;
  // the row's component_id rides when the authored row exists).
  cols.walls.forEach((w, i) => {
    const wallKey = layoutItemKey(w, i);
    const segs = Array.isArray(w?.shape?.segments) ? w.shape.segments : [];
    const count = Math.max(wallSegmentCount(w), segs.length);
    for (let s = 0; s < count; s += 1) {
      const ref = subRef(segs[s]?.component_id, s);
      define({
        id: sceneNodeId.wallSegment(wallKey, ref),
        kind: "wall-segment", collection: "walls", index: i,
        key: wallKey, componentId: segs[s]?.component_id ?? null,
        label: `Segment ${s + 1}`,
        parentId: wallIds[i], planar: true, selectable: true,
        segmentIndex: s, segmentComponentId: segs[s]?.component_id ?? null,
      });
    }
  });

  // Children: pole signs.
  cols.poles.forEach((p, i) => {
    const poleKey = layoutItemKey(p, i);
    const signs = Array.isArray(p?.signs) ? p.signs : [];
    signs.forEach((s, j) => {
      const ref = subRef(s?.component_id, j);
      define({
        id: sceneNodeId.poleSign(poleKey, ref),
        kind: "pole-sign", collection: "poles", index: i,
        key: poleKey, componentId: s?.component_id ?? null,
        label: `Sign ${j + 1}`,
        parentId: poleIds[i], planar: false, selectable: true,
        signIndex: j,
      });
    });
  });

  // Mounted rows: wall caps → segment node when the segment link resolves,
  // else the wall node, else root. Both refs must be live component ids;
  // the segment must belong to the resolved wall (a cross-wall ref dangles).
  cols.wall_caps.forEach((c, i) => {
    const key = layoutItemKey(c, i);
    const wallNodeId = refPresent(c?.wall_component_id)
      ? parentItemId(c.wall_component_id, cols.walls, "wall")
      : parentByIndex(c?.wall_index, cols.walls, "wall");
    let parentId = null;
    if (wallNodeId) {
      parentId = wallNodeId;
      if (isId(c?.segment_component_id) && !c.segment_component_id.startsWith("unresolved:")) {
        const wi = nodes.get(wallNodeId)?.index;
        const segs = wi !== undefined ? cols.walls[wi]?.shape?.segments : null;
        const si = Array.isArray(segs)
          ? segs.findIndex((s) => s?.component_id === c.segment_component_id)
          : -1;
        if (si >= 0) parentId = sceneNodeId.wallSegment(layoutItemKey(cols.walls[wi], wi), `component:${c.segment_component_id}`);
      }
    }
    define({
      id: sceneNodeId.wallCap(key),
      kind: "wall-cap", collection: "wall_caps", index: i,
      key, componentId: c?.component_id ?? null,
      label: `Cap ${i + 1}`,
      parentId, planar: false, selectable: true,
      parentComponentId: isId(c?.wall_component_id) ? c.wall_component_id : null,
    });
  });

  // Mounted rows: cabinets → pole node (mount 'pole') or item node
  // ('foundation'); unknown/absent mounts sit at root, same as the issues
  // list treats them (priced + visible until reassigned).
  cols.signage_cabinets.forEach((c, i) => {
    const key = layoutItemKey(c, i);
    const parentId = parentForCabinet(c, cols);
    const parentComponentId = c?.mount === "pole"
      ? (isId(c?.pole_component_id) ? c.pole_component_id : null)
      : c?.mount === "foundation"
        ? (isId(c?.foundation_component_id) ? c.foundation_component_id : null)
        : null;
    define({
      id: sceneNodeId.cabinet(key),
      kind: "cabinet", collection: "signage_cabinets", index: i,
      key, componentId: c?.component_id ?? null,
      label: `Cabinet ${i + 1}`,
      parentId, planar: false, selectable: true,
      parentComponentId,
    });
  });

  // DFS order: roots in collection order (items, walls, poles, caps,
  // cabinets — unmounted rows stay roots), children nested after parents.
  const order = [];
  const roots = [];
  const depth = new Map();
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
  // poles with parents are visited inside their item's subtree already —
  // any missed (defensive) nodes append in creation order.
  for (const id of nodes.keys()) if (!depth.has(id)) visit(id, 0);
  for (const [id, n] of nodes) if (!n.parentId) roots.push(id);

  return { nodes, order, roots };
};

// Resolve a node id to its live row(s). Returns { node, row, collection,
// index, wallIndex?, segmentIndex?, signIndex? } or null when the id no
// longer addresses anything. Parse-driven (no tree build needed).
export function resolveSceneNode(scene, nodeId) {
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
        node: parsed.kind, collection: COLLECTION_OF_KIND[parsed.kind],
        index: found.index, row: found.row, id: nodeId,
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
        node: "wall-segment", collection: "walls",
        index: found.index, row: found.row, wallIndex: found.index,
        segmentIndex: si, segment: segs[si] ?? null, id: nodeId,
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
        node: "pole-sign", collection: "poles",
        index: found.index, row: found.row, poleIndex: found.index,
        signIndex: si, sign: signs[si] ?? null, id: nodeId,
      };
    }
    default:
      return null;
  }
}

// Root → node breadcrumb (labels + ids) for the properties panel's parent
// trail: e.g. [Wall 1, Segment 2, Cap 1]. Builds the tree once.
export function nodeBreadcrumb(scene, nodeId) {
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

// ---------------------------------------------------------------------------
// Hits → nodes (paint-order z-top-wins via hitTestPlanAll order)
// ---------------------------------------------------------------------------

// Sub-part detail carried on a selection entry. Types: 'face' | 'edge' |
// 'vertex' | 'segment' | 'point' | 'row' (whole object — tree/marquee
// selects carry no finer claim).
export function hitPartFromHit(hit) {
  if (!hit || typeof hit !== "object") return { type: "row" };
  switch (hit.kind) {
    case "item-face": return { type: "face" };
    case "item-edge": return { type: "edge", edge: hit.edge ?? null };
    case "item-vertex": return { type: "vertex", corner: hit.corner ?? null };
    case "pole": return { type: "point" };
    case "wall-vertex": return { type: "vertex", vertexIndex: hit.vertexIndex ?? null };
    case "wall-segment":
      return {
        type: "segment",
        segmentIndex: hit.segmentIndex ?? null,
        segmentComponentId: hit.segmentComponentId ?? null,
        t: fin(hit.t) ? hit.t : null,
      };
    case "wall-face": return { type: "face" };
    default: return { type: "row" };
  }
}

// The node a hit selects + its part. Wall-segment hits address the SEGMENT
// node (a real tree child); wall vertex/face hits address the wall with the
// part recorded for future edit surfaces (O-035 handles read it).
export function nodeTargetForHit(hit) {
  if (!hit || typeof hit !== "object" || !isId(hit.collection)) return null;
  const part = hitPartFromHit(hit);
  if (hit.collection === "items") {
    return { id: sceneNodeId.item(hit.key), kind: "item", part, hit };
  }
  if (hit.collection === "poles") {
    return { id: sceneNodeId.pole(hit.key), kind: "pole", part, hit };
  }
  if (hit.collection === "walls") {
    if (hit.kind === "wall-segment" && fin(hit.segmentIndex)) {
      const ref = subRef(hit.segmentComponentId, hit.segmentIndex);
      return {
        id: sceneNodeId.wallSegment(hit.key, ref),
        kind: "wall-segment", part, hit,
      };
    }
    return { id: sceneNodeId.wall(hit.key), kind: "wall", part, hit };
  }
  return null;
}

// Descriptor extras the store snapshots from a live hit — what a properties
// panel renders without re-walking the scene (label uses the input seam's
// hitLabel so sub-part text matches every other surface).
const hitDescriptor = (hit) => ({
  collection: hit?.collection ?? null,
  index: hit?.index ?? null,
  key: hit?.key ?? null,
  componentId: hit?.componentId ?? null,
  label: hit ? hitLabel(hit) : null,
});

// ---------------------------------------------------------------------------
// Click-vs-drag disambiguation (screen-px slop at release)
// ---------------------------------------------------------------------------

// A press that MIGHT become a click. `hit` is the hitTestPlanAll topmost
// result at the down point (null for empty space — the canvas records the
// same record for marquee decisions).
export function beginClickCandidate({ pointerId, clientX, clientY, hit = null, additive = false } = {}) {
  if (!fin(clientX) || !fin(clientY)) return null;
  return {
    pointerId: pointerId === undefined ? null : pointerId,
    clientX, clientY,
    hit,
    additive: additive === true,
  };
}

// Screen-px travel from the recorded down point to a current/release point.
export function clickTravelPx(candidate, point) {
  if (!candidate || !fin(candidate.clientX) || !fin(candidate.clientY)) return null;
  const x = fin(point?.clientX) ? point.clientX : fin(point?.x) ? point.x : null;
  const y = fin(point?.clientY) ? point.clientY : fin(point?.y) ? point.y : null;
  if (x === null || y === null) return null;
  return hypot(x - candidate.clientX, y - candidate.clientY);
}

// True when the gesture resolves as a click: release travelled less than
// the slop threshold from its down point. Anything else — a real drag, or a
// drag that wandered out and wandered back — is not a click.
export function isClickRelease(candidate, releaseEvent, thresholdPx = SELECTION_CLICK_THRESHOLD_PX) {
  const d = clickTravelPx(candidate, releaseEvent);
  const t = fin(thresholdPx) && thresholdPx >= 0 ? thresholdPx : SELECTION_CLICK_THRESHOLD_PX;
  return d !== null && d < t;
}

// ---------------------------------------------------------------------------
// Keyboard (cycle / clear / delete hook)
// ---------------------------------------------------------------------------

// Map a keyboard event to a selection action, or null when the key is not
// the selection layer's business. Modifier rules mirror the input seam's
// keyboardNudge: ctrl/meta/alt bail (browser shortcuts); Shift is allowed
// (it is the additive + cycle-reverse modifier, and Shift+arrows at the
// container level cycle — on items they never reach here: nudge wins).
export function selectionKeyAction(event) {
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

// ---------------------------------------------------------------------------
// Region (marquee / rubber-band) geometry — plan inches
// ---------------------------------------------------------------------------

// Normalize two plan points into an axis-aligned region.
export function regionFromPoints(a, b) {
  const pa = planPointOf(a);
  const pb = planPointOf(b);
  if (!pa || !pb) return null;
  return {
    minX: Math.min(pa.x, pb.x),
    minZ: Math.min(pa.z, pb.z),
    maxX: Math.max(pa.x, pb.x),
    maxZ: Math.max(pa.z, pb.z),
  };
}

const regionIsUsable = (r) =>
  !!r && fin(r.minX) && fin(r.minZ) && fin(r.maxX) && fin(r.maxZ) && r.minX <= r.maxX && r.minZ <= r.maxZ;

const pointInRegion = (r, p) =>
  p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;

const regionCorners = (r) => [
  { x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ },
  { x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ },
];

// Segment-segment intersection, endpoints touching counts (a rubber band
// grazing an edge intersects it — rubber-band convention).
const segSegIntersect = (a, b, c, d) => {
  const cross = (o, p, q) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p, q, r0) =>
    Math.min(p.x, q.x) <= r0.x && r0.x <= Math.max(p.x, q.x) &&
    Math.min(p.z, q.z) <= r0.z && r0.z <= Math.max(p.z, q.z) &&
    Math.abs(cross(p, q, r0)) <= 1e-9;
  if (d1 === 0 && on(c, d, a)) return true;
  if (d2 === 0 && on(c, d, b)) return true;
  if (d3 === 0 && on(a, b, c)) return true;
  if (d4 === 0 && on(a, b, d)) return true;
  return false;
};

const segmentIntersectsRegion = (a, b, r) => {
  if (pointInRegion(r, a) || pointInRegion(r, b)) return true;
  const c = regionCorners(r);
  for (let i = 0; i < 4; i += 1) {
    if (segSegIntersect(a, b, c[i], c[(i + 1) % 4])) return true;
  }
  return false;
};

// Rect-rect intersection via the separating-axis test. `cornersA`/`cornersB`
// are the two rects' corner lists [{x,z} x4] — the item's may be rotated,
// the region's are axis-aligned. Exact (both are convex).
const rectsIntersect = (cornersA, cornersB) => {
  const axes = [];
  for (const corners of [cornersA, cornersB]) {
    for (let i = 0; i < 2; i += 1) {
      const e = { x: corners[(i + 1) % 4].x - corners[i].x, z: corners[(i + 1) % 4].z - corners[i].z };
      const len = hypot(e.x, e.z) || 1;
      axes.push({ x: -e.z / len, z: e.x / len }); // unit normal
    }
  }
  for (const axis of axes) {
    const proj = (c) => c.x * axis.x + c.z * axis.z;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const c of cornersA) { const p = proj(c); if (p < aMin) aMin = p; if (p > aMax) aMax = p; }
    for (const c of cornersB) { const p = proj(c); if (p < bMin) bMin = p; if (p > bMax) bMax = p; }
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
};

const circleIntersectsRegion = (center, radius, r) => {
  const cx = Math.min(Math.max(center.x, r.minX), r.maxX);
  const cz = Math.min(Math.max(center.z, r.minZ), r.maxZ);
  return hypot(center.x - cx, center.z - cz) <= radius;
};

// Even-odd point-in-polygon over finite plan points — same rule the input
// module's hit test applies (kept local: the region test consumes already-
// extracted vertices, and a zero-area/collinear outline honestly reports
// no interior).
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

const itemInRegion = (item, r, mode) => {
  const g = itemPlanGeometry(item);
  if (!g) return false;
  if (g.circular) {
    const radius = Math.min(g.size.width, g.size.depth) / 2;
    if (mode === "contain") {
      return (
        g.center.x - radius >= r.minX && g.center.x + radius <= r.maxX &&
        g.center.z - radius >= r.minZ && g.center.z + radius <= r.maxZ
      );
    }
    return circleIntersectsRegion(g.center, radius, r);
  }
  const corners = framePlanCorners(g.frame, g.size);
  if (!corners) return false;
  const list = [corners.nw, corners.ne, corners.se, corners.sw];
  if (mode === "contain") return list.every((c) => pointInRegion(r, c));
  return rectsIntersect(list, regionCorners(r));
};

const wallInRegion = (wall, r, mode) => {
  const g = wallPlanGeometry(wall);
  if (!g || !g.points.length) return false;
  if (mode === "contain") {
    // Region is convex: every vertex inside ⟺ the whole outline inside.
    return g.points.every((p) => pointInRegion(r, p));
  }
  if (g.points.some((p) => pointInRegion(r, p))) return true;
  const segCount = g.closed ? g.points.length : g.points.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    if (segmentIntersectsRegion(g.points[i], g.points[(i + 1) % g.points.length], r)) return true;
  }
  // Region wholly inside a closed outline — the wall surrounds the band.
  if (g.closed && pointInPolygon(regionCorners(r)[0], g.points)) return true;
  return false;
};

// Node ids of planar objects covered by a plan-space region, in tree DFS
// order. Only top-level planar objects qualify — items, poles, walls.
// Wall segments/pole signs are sub-object precision (click-only); caps and
// cabinets carry no plan geometry and are never region-selected.
export function sceneObjectsInRegion(scene, region, { mode = "intersect" } = {}) {
  if (!regionIsUsable(region)) return [];
  const m = REGION_SELECT_MODES.includes(mode) ? mode : "intersect";
  const cols = sceneCollections(scene);
  const picked = new Set();
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
  // Emit in tree order — the object tree's DFS sequence is the scene's
  // canonical ordering everywhere (cycle, marquee, tree panel).
  const tree = buildSceneTree(scene);
  return tree.order.filter((id) => picked.has(id));
}

// ---------------------------------------------------------------------------
// The selection store
// ---------------------------------------------------------------------------

// A subscribe()/stateVersion-ready store — the same mount shape as
// createSceneHistory (useSyncExternalStore at the page; the canvas keeps an
// internal one when unmounted). The store holds ONLY selection state —
// ordered ids, the primary (active) node, per-id part detail, and the
// transient marquee. The scene is passed per call; nothing here mutates it.
export function createSceneSelection() {
  let ids = [];
  let primaryId = null;
  let parts = {};
  let descriptors = {};
  let marquee = null;
  let version = 0;
  const listeners = new Set();

  const emit = () => {
    version += 1;
    for (const fn of [...listeners]) {
      try { fn(); } catch { /* listener faults never break the store */ }
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
    signIndex: extra.signIndex ?? null,
  });

  // Keep a descriptor snapshot; prefer fresh info when given. `target` may
  // be a bare id string — normalize so descriptorFor always sees an object.
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

  const setSelection = (entries, { primary } = {}) => {
    const list = Array.isArray(entries) ? entries : [];
    const seen = new Set();
    const nextIds = [];
    const nextParts = {};
    const nextDescriptors = {};
    for (const entry of list) {
      const id = typeof entry === "string" ? entry : entry?.id;
      if (!isId(id) || seen.has(id)) continue;
      seen.add(id);
      nextIds.push(id);
      nextParts[id] = typeof entry === "object" && entry?.part ? entry.part : { type: "row" };
      nextDescriptors[id] = typeof entry === "object" && entry?.descriptor
        ? entry.descriptor
        : { id, kind: parseSceneNodeId(id)?.kind ?? null, collection: null, index: null, key: null, componentId: null, label: null, parentId: null, segmentIndex: null, signIndex: null };
    }
    const nextPrimary = isId(primary) && seen.has(primary)
      ? primary
      : nextIds[nextIds.length - 1] ?? null;
    setState(nextIds, nextPrimary, nextParts, nextDescriptors);
    return { status: "set", ids: [...nextIds], primaryId: nextPrimary };
  };

  // Core select. `target` = { id, kind?, part?, descriptor? } or a bare id.
  // plain → replace; additive → toggle membership (ctrl/meta convention;
  // shift+click additive callers pass the same flag — clicking a selected
  // row with an additive modifier removes it and drops primary to the last
  // remaining, the uniform rule).
  const select = (target, { additive = false } = {}) => {
    const id = typeof target === "string" ? target : target?.id;
    if (!isId(id)) {
      // A null/foreign target is an empty-space click: plain clears,
      // additive keeps (nothing was added).
      if (!additive) {
        if (!ids.length && primaryId === null) return { status: "empty" };
        setState([], null, {}, {});
        return { status: "cleared" };
      }
      return { status: "kept", ids: [...ids] };
    }
    if (!additive) {
      const part = typeof target === "object" && target?.part ? target.part : { type: "row" };
      describe(id, target, target?.descriptor);
      setState([id], id, { [id]: part }, descriptors);
      return { status: "selected", id, primaryId: id };
    }
    if (has(id)) {
      const nextIds = ids.filter((x) => x !== id);
      const nextParts = { ...parts }; delete nextParts[id];
      const nextDescriptors = { ...descriptors }; delete nextDescriptors[id];
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

  const selectAtPoint = (scene, point, { additive = false, ...opts } = {}) =>
    selectHit(pickAtPoint(scene, point, opts).hit, { additive });

  const clear = () => {
    if (!ids.length && primaryId === null) return { status: "empty" };
    setState([], null, {}, {});
    return { status: "cleared" };
  };

  const isSelected = (id) => has(id);

  const entries = () =>
    ids.map((id) => ({
      ...(descriptors[id] || { id, kind: parseSceneNodeId(id)?.kind ?? null }),
      id,
      part: parts[id] || { type: "row" },
      primary: id === primaryId,
    }));

  // Tree-order cycling. dir ±1; with nothing selected +1 picks the first
  // node, -1 the last. Wraps. Returns the node id now primary/only.
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
      collection: n.collection, index: n.index, key: n.key,
      componentId: n.componentId, label: n.label, parentId: n.parentId,
      segmentIndex: n.segmentIndex ?? null, signIndex: n.signIndex ?? null,
    } : undefined);
    setState([next], next, { [next]: { type: "row" } }, descriptors);
    return { status: "cycled", id: next, label: n?.label ?? null };
  };

  // Keyboard seam — returns what it did so the consumer can preventDefault
  // and route the delete hook through its own commit path.
  const applyKey = (event, scene) => {
    const act = selectionKeyAction(event);
    if (!act) return null;
    if (act.action === "cycle") return cycle(scene, act.direction);
    if (act.action === "clear") { clear(); return { status: "cleared" }; }
    if (act.action === "delete-request") {
      return { status: "delete-request", entries: entries() };
    }
    return null;
  };

  // Reconcile the selection against a fresh scene: exact-id keeps (a
  // positional `index:` id still existing means the positional row still
  // exists — same-identity rule), component/legacy ids survive reorders,
  // index-refs upgrade to minted component ids, stale parts downgrade.
  const reconcile = (scene) => {
    const tree = buildSceneTree(scene);
    const nextIds = [];
    const nextParts = {};
    const nextDescriptors = {};
    const dropped = [];
    const remapped = {};
    const downgraded = [];
    const seen = new Set();

    const adopt = (oldId, newId, node, part) => {
      if (seen.has(newId)) { dropped.push(oldId); return; }
      seen.add(newId);
      nextIds.push(newId);
      nextParts[newId] = part;
      nextDescriptors[newId] = {
        id: newId, kind: node?.kind ?? null, collection: node?.collection ?? null,
        index: node?.index ?? null, key: node?.key ?? null,
        componentId: node?.componentId ?? null, label: node?.label ?? null,
        parentId: node?.parentId ?? null,
        segmentIndex: node?.segmentIndex ?? null, signIndex: node?.signIndex ?? null,
      };
      if (newId !== oldId) remapped[oldId] = newId;
    };

    const sanitizePart = (id, node, part) => {
      if (!part || part.type === "row") return { type: "row" };
      if (part.type === "vertex" && Number.isInteger(part.vertexIndex)) {
        // wall vertex — vertexIndex is an AUTHORED outline index, so
        // revalidate against the authored point count (not the filtered
        // valid-vertex count the geometry helpers report).
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
      // Upgrade path: `index:` sub-refs (segment/sign) whose row gained a
      // component id — same wall/pole + same position, minted id.
      const parsed = parseSceneNodeId(oldId);
      if (parsed && (parsed.kind === "wall-segment" || parsed.kind === "pole-sign") && parsed.ref?.startsWith("index:")) {
        const res = resolveSceneNode(scene, oldId);
        if (res) {
          const parentKey = parsed.key;
          const sub = parsed.kind === "wall-segment"
            ? res.segment?.component_id
            : res.sign?.component_id;
          const newId = parsed.kind === "wall-segment"
            ? sceneNodeId.wallSegment(parentKey, subRef(sub ?? res.segment?.component_id, res.segmentIndex))
            : sceneNodeId.poleSign(parentKey, subRef(sub ?? res.sign?.component_id, res.signIndex));
          if (tree.nodes.has(newId)) {
            adopt(oldId, newId, tree.nodes.get(newId), sanitizePart(newId, tree.nodes.get(newId), parts[oldId]));
            continue;
          }
        }
      }
      dropped.push(oldId);
    }

    const nextPrimary = primaryId && seen.has(primaryId)
      ? primaryId
      : primaryId && remapped[primaryId] && seen.has(remapped[primaryId])
        ? remapped[primaryId]
        : nextIds[nextIds.length - 1] ?? null;

    // Descriptor drift counts too — a reorder keeps component ids but
    // changes index/label snapshots the properties panel reads.
    const descChanged =
      nextIds.some((id) => JSON.stringify(nextDescriptors[id]) !== JSON.stringify(descriptors[id])) ||
      Object.keys(nextDescriptors).length !== Object.keys(descriptors).length;
    const changed =
      dropped.length > 0 || Object.keys(remapped).length > 0 ||
      nextIds.length !== ids.length || nextIds.some((id, i) => id !== ids[i]) ||
      nextPrimary !== primaryId || downgraded.length > 0 || descChanged;
    if (changed) {
      setState(nextIds, nextPrimary, nextParts, nextDescriptors);
      return { status: "reconciled", kept: [...nextIds], dropped, remapped, downgraded };
    }
    return { status: "unchanged", kept: [...nextIds], dropped: [], remapped: {}, downgraded: [] };
  };

  // ------------------------------------------------------------------
  // Marquee (rubber-band) — transient gesture state for the renderer,
  // committed against the live scene.
  // ------------------------------------------------------------------

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

  // Commit. `empty` is the caller's click verdict (release inside the slop
  // threshold): additive keeps the selection untouched, plain clears it —
  // the empty-space-click rule. A real region picks objectsInRegion and
  // either replaces or unions with the existing selection.
  const commitMarquee = (scene, { mode = "intersect", empty = false } = {}) => {
    if (!marquee) return { status: "no-marquee" };
    const m = marquee;
    marquee = null;
    if (empty) {
      emit();
      if (!m.additive) { clear(); return { status: "cleared" }; }
      return { status: "kept" };
    }
    const region = regionFromPoints(m.start, m.current);
    const picked = sceneObjectsInRegion(scene, region, { mode });
    if (m.additive) {
      const nextIds = [...ids];
      const nextParts = { ...parts };
      const nextDescriptors = { ...descriptors };
      const tree = buildSceneTree(scene);
      for (const id of picked) {
        if (nextIds.includes(id)) continue;
        nextIds.push(id);
        nextParts[id] = { type: "row" };
        const n = tree.nodes.get(id);
        nextDescriptors[id] = descriptorFor(
          { id, kind: n?.kind },
          { collection: n?.collection, index: n?.index, key: n?.key, componentId: n?.componentId, label: n?.label, parentId: n?.parentId },
        );
      }
      const nextPrimary = picked.length ? picked[picked.length - 1] : primaryId;
      setState(nextIds, nextPrimary, nextParts, nextDescriptors);
      return { status: "marquee", ids: [...nextIds], picked, additive: true };
    }
    const tree = buildSceneTree(scene);
    const nextDescriptors = {};
    for (const id of picked) {
      const n = tree.nodes.get(id);
      nextDescriptors[id] = descriptorFor(
        { id, kind: n?.kind },
        { collection: n?.collection, index: n?.index, key: n?.key, componentId: n?.componentId, label: n?.label, parentId: n?.parentId },
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
    primary: primaryId ? { ...(descriptors[primaryId] || { id: primaryId }), id: primaryId, part: parts[primaryId] || { type: "row" } } : null,
    marquee: marquee ? { ...marquee, start: { ...marquee.start }, current: { ...marquee.current } } : null,
  });

  const subscribe = (fn) => {
    if (typeof fn !== "function") return () => { };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  };

  return {
    // queries
    isSelected, entries, getState, subscribe,
    // mutation
    select, setSelection, selectHit, selectAtPoint, clear, cycle, applyKey,
    // scene-facing
    pickAtPoint, reconcile,
    // marquee
    beginMarquee, updateMarquee, commitMarquee, cancelMarquee,
    get stateVersion() { return version; },
    get primaryId() { return primaryId; },
  };
}
