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
var PLAN_EXTENT = Object.freeze({
  width: FOUNDATION_LAYOUT_WIDTH_INCHES,
  depth: FOUNDATION_LAYOUT_DEPTH_INCHES
});
var DEFAULT_HIT_TOLERANCES = Object.freeze({
  edgeInches: 3,
  vertexInches: 4,
  poleInches: 4
});
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

// src/components/estimator/foundation/foundationReparentModel.js
var isId = (v) => typeof v === "string" && v.length > 0;
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var has = (row, field) => Object.prototype.hasOwnProperty.call(row ?? {}, field);
var isReservedRef = (v) => typeof v === "string" && v.startsWith("unresolved:");
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
  if (!isRecord(row)) return null;
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
function reparentParentOf(scene, kind, row) {
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

// src/components/estimator/foundation/foundationSceneDiagnostics.js
var PLAN_W = 480;
var PLAN_D = 320;
var itemRowName = (item, index) => typeof item?.description === "string" && item.description.trim() || `Foundation ${index + 1}`;
var rectOverlap = (a, b) => {
  const verts = (r) => {
    const c = Math.cos(r.rot * Math.PI / 180), s = Math.sin(r.rot * Math.PI / 180);
    const hw = r.w / 2, hd = r.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [r.cx + x * c - z * s, r.cz + x * s + z * c]);
  };
  const va = verts(a), vb = verts(b);
  const axes = [
    [Math.cos(a.rot * Math.PI / 180), Math.sin(a.rot * Math.PI / 180)],
    [-Math.sin(a.rot * Math.PI / 180), Math.cos(a.rot * Math.PI / 180)],
    [Math.cos(b.rot * Math.PI / 180), Math.sin(b.rot * Math.PI / 180)],
    [-Math.sin(b.rot * Math.PI / 180), Math.cos(b.rot * Math.PI / 180)]
  ];
  for (const [ax, az] of axes) {
    const pr = (vs) => vs.map(([x, z]) => x * ax + z * az);
    const pa = pr(va), pb = pr(vb);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
};
var itemRect = (item, index) => {
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  if (!fp || !pos.valid) return null;
  return {
    cx: pos.x_inches + fp.width / 2,
    cz: pos.z_inches + fp.depth / 2,
    w: fp.width,
    d: fp.depth,
    rot: Number(item.rotation_degrees) || 0
  };
};
var pointInRect = (px, pz, r) => {
  const c = Math.cos(r.rot * Math.PI / 180), s = Math.sin(r.rot * Math.PI / 180);
  const dx = px - r.cx, dz = pz - r.cz;
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  return Math.abs(lx) <= r.w / 2 && Math.abs(lz) <= r.d / 2;
};
function foundationSceneDiagnostics(scene) {
  const findings = [];
  const push = (severity, kind, message, nodeIds) => findings.push({ severity, kind, message, nodeIds: nodeIds.filter(Boolean) });
  const items = scene?.items || [], poles = scene?.poles || [];
  const walls = scene?.walls || [], caps = scene?.wall_caps || [], cabinets = scene?.signage_cabinets || [];
  const rects = items.map((item, i) => ({ item, index: i, rect: itemRect(item, i) }));
  rects.forEach(({ item, index, rect }) => {
    const id = sceneNodeId.item(layoutItemKey(item, index));
    if (!rect) {
      push("warning", "unplaced", `${itemRowName(item, index)} has no valid plan placement \u2014 fix its dimensions or position.`, [id]);
      return;
    }
    const out = rect.cx - rect.w / 2 < -0.5 || rect.cx + rect.w / 2 > PLAN_W + 0.5 || rect.cz - rect.d / 2 < -0.5 || rect.cz + rect.d / 2 > PLAN_D + 0.5;
    if (out) push("warning", "out-of-bounds", `${itemRowName(item, index)} sits partly outside the plan area.`, [id]);
  });
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i], b = rects[j];
      if (!a.rect || !b.rect) continue;
      if (rectOverlap(a.rect, b.rect)) {
        push(
          "error",
          "clash",
          `${itemRowName(a.item, a.index)} and ${itemRowName(b.item, b.index)} footprints overlap.`,
          [sceneNodeId.item(layoutItemKey(a.item, a.index)), sceneNodeId.item(layoutItemKey(b.item, b.index))]
        );
      }
    }
  }
  poles.forEach((pole, i) => {
    const poleId = sceneNodeId.pole(layoutItemKey(pole, i));
    const parent = reparentParentOf(scene, "pole", pole);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Pole ${i + 1} is mounted to a foundation that no longer exists \u2014 remount or detach it.`, [poleId]);
      return;
    }
    if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Pole ${i + 1}'s mount is stored in legacy form \u2014 save once to normalize it.`, [poleId]);
    }
    const px = Number(pole.x_inches), pz = Number(pole.z_inches);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
    const inside = rects.filter(({ rect }) => rect && pointInRect(px, pz, rect));
    if (!parent?.componentId && inside.length > 0) {
      push(
        "info",
        "mount-candidate",
        `Pole ${i + 1} stands unmounted inside ${itemRowName(inside[0].item, inside[0].index)} \u2014 select it and Mount to attach.`,
        [poleId, sceneNodeId.item(layoutItemKey(inside[0].item, inside[0].index))]
      );
    }
    if (inside.length > 1 && !parent?.componentId) {
      push(
        "warning",
        "ambiguous-footprint",
        `Pole ${i + 1} sits inside ${inside.length} overlapping foundations \u2014 mount it to pick one.`,
        [poleId, ...inside.map((r) => sceneNodeId.item(layoutItemKey(r.item, r.index)))]
      );
    }
  });
  caps.forEach((cap, i) => {
    const capId = sceneNodeId.wallCap(layoutItemKey(cap, i));
    const parent = reparentParentOf(scene, "wall-cap", cap);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Wall cap ${i + 1} is bound to a wall that no longer exists \u2014 remount it.`, [capId]);
    } else if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Wall cap ${i + 1}'s mount is stored in legacy form \u2014 save once to normalize it.`, [capId]);
    } else if (!parent?.componentId) {
      push("error", "unmounted-cap", `Wall cap ${i + 1} isn't bound to a wall or wall segment \u2014 it won't be billed to any wall.`, [capId]);
    }
  });
  cabinets.forEach((cab, i) => {
    const cabId = sceneNodeId.cabinet(layoutItemKey(cab, i));
    const parent = reparentParentOf(scene, "cabinet", cab);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Cabinet ${i + 1} is mounted to an object that no longer exists \u2014 remount it.`, [cabId]);
    } else if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Cabinet ${i + 1}'s mount is stored in legacy form \u2014 save once to normalize it.`, [cabId]);
    } else if (!parent?.componentId) {
      push("error", "unmounted-cabinet", `Cabinet ${i + 1} isn't mounted to a pole or foundation \u2014 remount it.`, [cabId]);
    }
  });
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}
function diagnosticTarget(scene, finding) {
  const id = finding?.nodeIds?.[0];
  if (!id || !parseSceneNodeId(id)) return null;
  return resolveSceneNode(scene, id) ? id : null;
}
export {
  diagnosticTarget,
  foundationSceneDiagnostics
};
