// src/components/estimator/foundation/foundationSceneTransforms.js
var INCHES_PER_FOOT = 12;
var PLAN_TO_WORLD_SCALE = 1 / INCHES_PER_FOOT;
var DEFAULT_PLAN_EXTENT = Object.freeze({ width: 480, depth: 320 });
var DEFAULT_ZOOM_RANGE = Object.freeze({ min: 0.5, max: 2 });
var fin = (v) => typeof v === "number" && Number.isFinite(v);
var DEG_TO_RAD = Math.PI / 180;
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

// src/components/estimator/foundation/foundationSceneInput.js
var fin2 = (v) => typeof v === "number" && Number.isFinite(v);
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
var SCENE_EDIT_ITEM_MOVE = "item-move";

// src/components/estimator/foundation/foundationSceneSelection.js
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

// src/components/estimator/foundation/foundationSceneEditOps.js
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
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
var beforeFieldsOf = (row, patch) => {
  const before = {};
  if (!isRecord(row) || !isRecord(patch)) return before;
  for (const k of Object.keys(patch)) before[k] = row[k];
  return before;
};
var patchesFitSingleItemChannel = (patches) => Array.isArray(patches) && patches.length === 1 && patches[0]?.collection === "items";
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
var fin3 = (v) => typeof v === "number" && Number.isFinite(v);
var isId = (v) => typeof v === "string" && v.length > 0;
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
var defaultIsLocked = (row) => row?.locked === true || row?.locked === 1;
var ROW_OF_KIND = Object.freeze({
  item: "items",
  pole: "poles",
  wall: "walls",
  "wall-cap": "wall_caps",
  cabinet: "signage_cabinets"
});
var byComponentId = (rows, id) => {
  if (!isId(id)) return null;
  const i = (rows || []).findIndex((r) => r?.component_id === id);
  return i >= 0 ? { row: rows[i], index: i } : null;
};
var legacyIndex = (v, count) => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : v;
  if (!Number.isInteger(n) || n < 0 || n >= count) return null;
  return n;
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
      return isId(v) ? { kind: parentKind, componentId: v, via: "canon" } : null;
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
    if (!link || !isId(link.componentId) || isReservedRef(link.componentId)) break;
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
  if (!isId(segRef)) {
    const si2 = legacyIndex(row.segment_index, segs.length);
    const segRow = si2 !== null ? segs[si2] : null;
    if (segRow && isId(segRow.component_id) && !isReservedRef(segRow.component_id)) {
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
    if (!isId(componentId) || isReservedRef(componentId)) {
      return { reason: "target-not-addressable", detail: componentId };
    }
    return {
      target: { kind, componentId, index: found.index, row: found.row, nodeId: nodeId ?? nodeIdOf(kind, found.row, found.index) }
    };
  };
  const finishSegment = (wall, wallIndex, segmentIndex, segRow, nodeId) => {
    const segId = segRow?.component_id ?? null;
    const wallId = wall?.component_id ?? null;
    if (!isId(wallId) || isReservedRef(wallId)) return { reason: "target-not-addressable", detail: "segment-wall" };
    if (!isId(segId) || isReservedRef(segId)) return { reason: "target-not-addressable", detail: segId };
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
    const pool = isId(wallComponentId) ? [byComponentId(cols.walls, wallComponentId)].filter(Boolean) : cols.walls.map((row, index) => ({ row, index }));
    for (const w of pool) {
      const segs = Array.isArray(w.row?.shape?.segments) ? w.row.shape.segments : [];
      const si = segs.findIndex((s) => s?.component_id === segId);
      if (si >= 0) return { wall: w.row, wallIndex: w.index, segmentIndex: si, segRow: segs[si] };
    }
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
    if (spec.kind === "wall-segment" || spec.kind === "wall" && isId(segId)) {
      const bound = spec.kind === "wall" ? spec.wallComponentId ?? spec.componentId : spec.wallComponentId;
      const found2 = isId(segId) ? locateSegment(segId, bound) : null;
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
    const wallLink = has(row, "wall_component_id") ? isId(row.wall_component_id) : live("wall_index");
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
  if (!next || !fin3(next.x) || !fin3(next.z)) return reject("invalid-geometry", { detail: "pole-plan" });
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
  if (to.kind !== "standalone" && isId(child.componentId)) {
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
  const list = (Array.isArray(ids) ? ids : []).map((e) => typeof e === "string" ? e : e?.id).filter(isId);
  if (!list.length) return reject("empty-selection");
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
    if (!isId(componentId) || isReservedRef(componentId)) return;
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
          if (!isId(segId) || isReservedRef(segId)) return;
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
function reparentEditRecord(result, { method = "plan", label } = {}) {
  if (!result || result.status !== "ok") return null;
  return editRecordForPatches("reparent", method, result.patches, {
    label: label ?? result.label ?? null
  });
}
export {
  REPARENT_CHILD_KINDS,
  REPARENT_KEEP_MODES,
  REPARENT_PARENT_KINDS,
  ancestorComponentIds,
  mountLinkDescriptors,
  planReparent,
  planReparentSelection,
  reparentChildSpec,
  reparentEditRecord,
  reparentParentOf,
  reparentTargetsFor,
  resolveReparentTargetNode
};
