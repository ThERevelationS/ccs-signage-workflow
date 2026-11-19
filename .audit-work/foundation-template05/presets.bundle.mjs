// src/components/estimator/foundation/wallCalculator.js
var wallRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var wallPoint = (point) => wallRecord(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.z === "number" && Number.isFinite(point.z);
function foundationWallSegments(points, closed = false) {
  if (!Array.isArray(points) || !points.every(wallPoint) || typeof closed !== "boolean") return null;
  const segments = [];
  const add = (a, b) => segments.push({ length: Math.hypot(b.x - a.x, b.z - a.z) });
  for (let i = 0; i < points.length - 1; i++) add(points[i], points[i + 1]);
  if (closed && points.length > 2) add(points[points.length - 1], points[0]);
  return segments.every((segment) => Number.isFinite(segment.length)) ? segments : null;
}

// src/components/estimator/foundation/foundationAssemblyModel.js
var ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var ID_MAX = 200;
var MAX_COLLISIONS = 8;
var UNRESOLVED_PREFIX = "unresolved:";
var UNRESOLVED = {
  foundation: `${UNRESOLVED_PREFIX}legacy-foundation`,
  pole: `${UNRESOLVED_PREFIX}legacy-pole`,
  wall: `${UNRESOLVED_PREFIX}legacy-wall`,
  segment: `${UNRESOLVED_PREFIX}legacy-segment`
};
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var isId = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= ID_MAX;
var isReserved = (v) => typeof v === "string" && v.startsWith(UNRESOLVED_PREFIX);
var isUnresolvedToken = (v) => Object.values(UNRESOLVED).includes(v);
var deepClone = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var cloneRawValue = (v) => {
  try {
    return deepClone(v);
  } catch {
    return v;
  }
};
var cloneNode = (n) => isRecord(n) ? { ...n } : n;
var fin = (v) => typeof v === "number" && Number.isFinite(v);
var segEndpoints = (shape, i) => {
  const pts = shape?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const closed = shape?.closed === true && pts.length >= 3;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  if (i >= pts.length || !closed && i >= pts.length - 1) return null;
  if (!fin(a?.x) || !fin(a?.z) || !fin(b?.x) || !fin(b?.z)) return null;
  return `${a.x},${a.z}->${b.x},${b.z}`;
};
var legacyIndexOf = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v === null || v === void 0) continue;
    if (v === -1) return { explicit: true };
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return { index: v };
    if (typeof v === "string" && /^\d+$/.test(v)) return { index: parseInt(v, 10) };
    return { invalid: v };
  }
  return { absent: true };
};
var collectIds = (project) => {
  const ids = /* @__PURE__ */ new Set();
  const walk = (rows) => (rows || []).forEach((r) => {
    if (isId(r?.component_id)) ids.add(r.component_id);
  });
  ARRAYS.forEach((k) => walk(project?.[k]));
  (project?.walls || []).forEach((w) => walk(w?.shape?.segments));
  (project?.poles || []).forEach((p) => walk(p?.signs));
  return ids;
};
var collectRefs = (project) => {
  const refs = /* @__PURE__ */ new Set();
  const add = (v) => {
    if (isId(v)) refs.add(v);
  };
  (project?.poles || []).forEach((p) => add(p?.foundation_component_id));
  (project?.wall_caps || []).forEach((c) => {
    add(c?.wall_component_id);
    add(c?.segment_component_id);
  });
  (project?.signage_cabinets || []).forEach((c) => {
    add(c?.foundation_component_id);
    add(c?.pole_component_id);
  });
  return refs;
};
var freshId = (createId, kind, used) => {
  for (let i = 0; i < MAX_COLLISIONS; i += 1) {
    const id = createId(kind);
    if (isId(id) && !isReserved(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`foundation assembly: could not mint a unique component id for ${kind}`);
};
var validateRef = (v, kind) => {
  if (v === void 0 || v === null) return;
  if (typeof v !== "string" || v !== "" && !isId(v) && !isUnresolvedToken(v)) {
    throw new Error(`foundation assembly: invalid ${kind} reference value`);
  }
};
var ensureNodeId = (row, createId, kind, used, seen) => {
  if (!isRecord(row)) throw new Error(`foundation assembly: ${kind} row must be a record`);
  const n = cloneNode(row);
  const existing = n.component_id;
  if (existing !== void 0 && existing !== null) {
    if (!isId(existing) || isReserved(existing)) throw new Error(`foundation assembly: invalid component_id on ${kind} row`);
    if (seen.has(existing)) throw new Error(`foundation assembly: duplicate component_id "${existing}"`);
    seen.add(existing);
    used.add(existing);
  } else {
    const id = freshId(createId, kind, used);
    n.component_id = id;
    seen.add(id);
  }
  return n;
};
var reserve = (project, previous, used) => {
  const check = (v) => {
    if (typeof v === "string" && v.length > 0) used.add(v);
  };
  for (const src of [previous || {}, project || {}]) {
    collectIds(src).forEach((id) => used.add(id));
    collectRefs(src).forEach((id) => used.add(id));
    const kinds = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
    for (const k of kinds) for (const r of src?.[k] || []) {
      if (!isRecord(r)) throw new Error(`foundation assembly: ${k} row must be a record`);
      for (const [f, kind] of [["foundation_component_id", "foundation"], ["pole_component_id", "pole"], ["wall_component_id", "wall"], ["segment_component_id", "segment"]]) validateRef(r[f], kind);
    }
    for (const w of src?.walls || []) for (const s of w?.shape?.segments || []) check(s?.component_id);
    for (const p of src?.poles || []) for (const s of p?.signs || []) check(s?.component_id);
  }
};
var rebuildIndex = (canon, parents) => {
  if (canon === "" || canon === void 0 || isUnresolvedToken(canon)) return void 0;
  const i = (parents || []).findIndex((p) => p?.component_id === canon);
  return i >= 0 ? i : void 0;
};
var resolveParent = (canonValue, hasCanon, legacy, incoming, prev, unresolvedToken) => {
  if (hasCanon) {
    if (canonValue === void 0 || canonValue === null) return { canon: "", index: void 0 };
    if (canonValue === "") return { canon: "", index: void 0 };
    if (isUnresolvedToken(canonValue)) return { canon: canonValue, index: void 0, dangling: true, token: true };
    const found = (incoming || []).some((p) => p?.component_id === canonValue);
    return { canon: canonValue, index: found ? rebuildIndex(canonValue, incoming) : void 0, dangling: !found };
  }
  if (legacy.index !== void 0) {
    let canon;
    if (prev) canon = prev[legacy.index]?.component_id;
    else canon = incoming?.[legacy.index]?.component_id;
    if (isId(canon) && (incoming || []).some((p) => p?.component_id === canon)) {
      return { canon, index: rebuildIndex(canon, incoming) };
    }
    if (isId(canon)) return { canon: unresolvedToken, index: void 0, dangling: true, token: true };
    return { canon: unresolvedToken, index: void 0, dangling: true, token: true, outOfRange: true };
  }
  if (legacy.invalid !== void 0) return { canon: unresolvedToken, index: void 0, dangling: true, token: true, invalid: legacy.invalid };
  if (legacy.explicit) return { canon: "", index: void 0 };
  return { canon: void 0, index: void 0 };
};
var normalizeWalls = (walls, prevWalls, items, prevItems, createId, used, seen) => {
  const prevSegIds = /* @__PURE__ */ new Map();
  (prevWalls || []).forEach((w) => {
    const segs = w?.shape?.segments || [];
    segs.forEach((s, i) => {
      const key = segEndpoints(w?.shape, i);
      if (!isId(s?.component_id) || !key) return;
      const k = `${w.component_id}|${key}`;
      if (prevSegIds.has(k)) prevSegIds.set(k, null);
      else prevSegIds.set(k, s.component_id);
    });
  });
  const out = [];
  for (const w of walls || []) {
    const n = ensureNodeId(w, createId, "wall", used, seen);
    const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(n, "foundation_component_id"), legacyIndexOf(n, ["foundation_index"]), items, prevItems, UNRESOLVED.foundation);
    n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
    n.foundation_index = res.index;
    const shape = isRecord(n.shape) ? { ...n.shape } : n.shape;
    const segs = shape?.segments;
    if (segs !== void 0 && !Array.isArray(segs)) throw new Error("foundation assembly: wall shape segments must be an array");
    if (Array.isArray(segs)) {
      for (const s of segs) if (!isRecord(s)) throw new Error("foundation assembly: wall shape segments must be records");
      const incomingCount = /* @__PURE__ */ new Map();
      segs.forEach((s, i) => {
        const key = segEndpoints(shape, i);
        if (key) incomingCount.set(key, (incomingCount.get(key) || 0) + 1);
      });
      const priorCount = /* @__PURE__ */ new Map();
      (prevWalls || []).forEach((w2) => {
        (w2?.shape?.segments || []).forEach((s2, i) => {
          const key = segEndpoints(w2?.shape, i);
          if (w2?.component_id === n.component_id && key) priorCount.set(key, (priorCount.get(key) || 0) + 1);
        });
      });
      shape.segments = segs.map((s, i) => {
        const prior = s.component_id;
        if (prior !== void 0 && prior !== null) return ensureNodeId(s, createId, "wall_segment", used, seen);
        const key = segEndpoints(shape, i);
        const kept = key && incomingCount.get(key) === 1 && priorCount.get(key) === 1 ? prevSegIds.get(`${n.component_id}|${key}`) : void 0;
        if (kept && !seen.has(kept)) {
          const sn = cloneNode(s);
          sn.component_id = kept;
          seen.add(kept);
          used.add(kept);
          return sn;
        }
        return ensureNodeId(s, createId, "wall_segment", used, seen);
      });
    }
    n.shape = shape;
    out.push(n);
  }
  return out;
};
var normalizePoles = (poles, items, prevItems, createId, used, seen) => (poles || []).map((p) => {
  const n = ensureNodeId(p, createId, "pole", used, seen);
  const legacy = legacyIndexOf(p, ["foundation_idx"]);
  const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(p, "foundation_component_id"), legacy, items, prevItems, UNRESOLVED.foundation);
  n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
  n.foundation_idx = res.index;
  const signs = p?.signs;
  if (signs !== void 0 && !Array.isArray(signs)) throw new Error("foundation assembly: pole signs must be an array");
  if (Array.isArray(signs)) n.signs = signs.map((s) => ensureNodeId(s, createId, "pole_sign", used, seen));
  return n;
});
var normalizeCaps = (caps, walls, prevWalls, createId, used, seen) => (caps || []).map((c) => {
  const n = ensureNodeId(c, createId, "wall_cap", used, seen);
  const wRes = resolveParent(n.wall_component_id, Object.prototype.hasOwnProperty.call(c, "wall_component_id"), legacyIndexOf(c, ["wall_index"]), walls, prevWalls, UNRESOLVED.wall);
  n.wall_component_id = wRes.canon === void 0 ? "" : wRes.canon;
  n.wall_index = wRes.index;
  const wall = (walls || []).find((w) => w?.component_id === n.wall_component_id);
  const segs = wall?.shape?.segments || [];
  const prevSegs = prevWalls ? prevWalls.find((w) => w?.component_id === n.wall_component_id)?.shape?.segments || [] : null;
  const sRes = resolveParent(n.segment_component_id, Object.prototype.hasOwnProperty.call(c, "segment_component_id"), legacyIndexOf(c, ["segment_index"]), segs, prevSegs, UNRESOLVED.segment);
  n.segment_component_id = sRes.canon === void 0 ? "" : sRes.canon;
  n.segment_index = sRes.index;
  return n;
});
var normalizeCabinets = (cabinets, items, poles, prevItems, prevPoles, createId, used, seen) => (cabinets || []).map((c) => {
  const n = ensureNodeId(c, createId, "signage_cabinet", used, seen);
  const mount = c?.mount;
  if (mount === "pole") {
    const res = resolveParent(n.pole_component_id, Object.prototype.hasOwnProperty.call(c, "pole_component_id"), legacyIndexOf(c, ["pole_index"]), poles, prevPoles, UNRESOLVED.pole);
    n.pole_component_id = res.canon === void 0 ? "" : res.canon;
    n.pole_index = res.index;
    n.foundation_component_id = n.foundation_component_id ?? "";
    n.foundation_index = void 0;
  } else if (mount === "foundation") {
    const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(c, "foundation_component_id"), legacyIndexOf(c, ["foundation_index"]), items, prevItems, UNRESOLVED.foundation);
    n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
    n.foundation_index = res.index;
    n.pole_component_id = n.pole_component_id ?? "";
    n.pole_index = void 0;
  } else {
    n.mount = mount;
    if (n.foundation_component_id === void 0) n.foundation_component_id = "";
    if (n.pole_component_id === void 0) n.pole_component_id = "";
    n.foundation_index = void 0;
    n.pole_index = void 0;
  }
  return n;
});
function normalizeFoundationAssembly(project, { previous = null, createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord(project)) throw new Error("foundation assembly: project must be a record");
  const ver = project.assembly_schema_version;
  if (ver !== void 0 && ver !== 1) throw new Error(`foundation assembly: unsupported assembly_schema_version ${String(ver)}`);
  const used = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  for (const k of ARRAYS) {
    if (project[k] !== void 0 && !Array.isArray(project[k])) throw new Error(`foundation assembly: ${k} must be an array`);
  }
  reserve(project, previous, used);
  const next = { ...project, assembly_schema_version: 1 };
  next.items = (project.items || []).map((it) => ensureNodeId(it, createId, "item", used, seen));
  next.walls = normalizeWalls(project.walls, previous?.walls, next.items, previous?.items, createId, used, seen);
  next.poles = normalizePoles(project.poles, next.items, previous?.items, createId, used, seen);
  next.wall_caps = normalizeCaps(project.wall_caps, next.walls, previous?.walls, createId, used, seen);
  next.signage_cabinets = normalizeCabinets(project.signage_cabinets, next.items, next.poles, previous?.items, previous?.poles, createId, used, seen);
  return { project: next, issues: foundationAssemblyIssues(next) };
}
function foundationAssemblyIssues(project) {
  const issues = [];
  if (!isRecord(project)) return issues;
  const items = project.items || [];
  const walls = project.walls || [];
  const poles = project.poles || [];
  const byId = (arr, id) => isId(id) && (arr || []).some((p) => p?.component_id === id);
  for (const p of poles) {
    const canon = p?.foundation_component_id;
    if (canon === "" || canon === void 0 || canon === null) continue;
    if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole legacy foundation index could not be resolved; left unresolved until reassigned." });
    else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole references a foundation that is not present; it stays priced until reassigned." });
  }
  for (const w of project.walls || []) {
    const fId = w?.foundation_component_id;
    if (fId === "" || fId === void 0 || fId === null) continue;
    if (isReserved(fId)) issues.push({ code: "unresolved-parent", kind: "wall", componentId: w?.component_id, parentId: fId, message: "Wall legacy foundation index could not be resolved; left unresolved until reassigned." });
    else if (!byId(items, fId)) issues.push({ code: "dangling-parent", kind: "wall", componentId: w?.component_id, parentId: fId, message: "Wall references a foundation that is not present; it stays priced until reassigned." });
  }
  for (const c of project.wall_caps || []) {
    const wId = c?.wall_component_id;
    if (wId === "" || wId === void 0 || wId === null) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall assigned; it stays priced until assigned." });
    else if (isReserved(wId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap wall could not be resolved; left unresolved until reassigned." });
    else if (!byId(walls, wId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap references a wall that is not present; it stays priced until reassigned." });
    const wall = walls.find((w) => w?.component_id === wId);
    const segs = wall?.shape?.segments || [];
    const sId = c?.segment_component_id;
    if (sId === "" || sId === void 0 || sId === null) {
      if (wall) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall segment assigned; it stays priced until assigned." });
    } else if (isReserved(sId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap segment could not be resolved; left unresolved until reassigned." });
    else if (!byId(segs, sId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap references a wall segment that is not present; it stays priced until reassigned." });
  }
  for (const c of project.signage_cabinets || []) {
    if (c?.mount === "pole") {
      const canon = c?.pole_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet pole could not be resolved; left unresolved until reassigned." });
      else if (!byId(poles, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a pole that is not present; it stays priced until reassigned." });
    } else if (c?.mount === "foundation") {
      const canon = c?.foundation_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet foundation could not be resolved; left unresolved until reassigned." });
      else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a foundation that is not present; it stays priced until reassigned." });
    } else {
      issues.push({ code: "unsupported-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet mount is not supported; it stays priced and visible until reassigned." });
    }
  }
  return issues;
}
function cloneFoundationComponents(project, { createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord(project)) throw new Error("foundation assembly: project must be a record");
  const rawWallSegments = /* @__PURE__ */ new Map();
  const wallsForNormalize = (Array.isArray(project.walls) ? project.walls : []).map((w, i) => {
    if (!isRecord(w) || !isRecord(w.shape)) return w;
    const segs = w.shape.segments;
    if (segs === void 0 || Array.isArray(segs)) return w;
    rawWallSegments.set(i, segs);
    const shape = { ...w.shape };
    delete shape.segments;
    return { ...w, shape };
  });
  const { project: normalized } = normalizeFoundationAssembly(
    rawWallSegments.size ? { ...project, walls: wallsForNormalize } : project,
    { createId }
  );
  const used = /* @__PURE__ */ new Set([...collectIds(normalized), ...collectRefs(normalized)]);
  const idMap = /* @__PURE__ */ new Map();
  const remap = (oldId, kind) => {
    if (!isId(oldId) || isReserved(oldId)) return oldId;
    if (idMap.has(oldId)) return idMap.get(oldId);
    const id = freshId(createId, kind, used);
    idMap.set(oldId, id);
    return id;
  };
  const components = { assembly_schema_version: 1 };
  const copyRows = (rows, kind) => (rows || []).map((r) => {
    const n = deepClone(r);
    n.component_id = remap(n.component_id, kind);
    return n;
  });
  if (project.items !== void 0) components.items = copyRows(normalized.items, "item");
  if (project.walls !== void 0) {
    components.walls = copyRows(normalized.walls, "wall").map((w, i) => ({
      ...w,
      shape: isRecord(w.shape) ? {
        ...w.shape,
        segments: rawWallSegments.has(i) ? cloneRawValue(rawWallSegments.get(i)) : Array.isArray(w.shape.segments) ? w.shape.segments.map((s) => ({ ...s, component_id: remap(s.component_id, "wall_segment") })) : w.shape.segments || []
      } : w.shape
    }));
  }
  if (project.poles !== void 0) {
    components.poles = copyRows(normalized.poles, "pole").map((p) => ({
      ...p,
      foundation_component_id: isId(p.foundation_component_id) && idMap.has(p.foundation_component_id) ? idMap.get(p.foundation_component_id) : p.foundation_component_id,
      signs: (p.signs || []).map((s) => ({ ...s, component_id: remap(s.component_id, "pole_sign") }))
    }));
  }
  if (project.wall_caps !== void 0) {
    components.wall_caps = copyRows(normalized.wall_caps, "wall_cap").map((c) => ({
      ...c,
      wall_component_id: isId(c.wall_component_id) && idMap.has(c.wall_component_id) ? idMap.get(c.wall_component_id) : c.wall_component_id,
      segment_component_id: isId(c.segment_component_id) && idMap.has(c.segment_component_id) ? idMap.get(c.segment_component_id) : c.segment_component_id
    }));
  }
  if (project.signage_cabinets !== void 0) {
    components.signage_cabinets = copyRows(normalized.signage_cabinets, "signage_cabinet").map((c) => ({
      ...c,
      foundation_component_id: isId(c.foundation_component_id) && idMap.has(c.foundation_component_id) ? idMap.get(c.foundation_component_id) : c.foundation_component_id,
      pole_component_id: isId(c.pole_component_id) && idMap.has(c.pole_component_id) ? idMap.get(c.pole_component_id) : c.pole_component_id
    }));
  }
  const parents = components.items || [];
  const wallRows = components.walls || [];
  const poleRows = components.poles || [];
  (components.poles || []).forEach((p) => {
    p.foundation_idx = rebuildIndex(p.foundation_component_id, parents);
  });
  (components.wall_caps || []).forEach((c) => {
    c.wall_index = rebuildIndex(c.wall_component_id, wallRows);
    const rawSegs = wallRows.find((w) => w?.component_id === c.wall_component_id)?.shape?.segments;
    const segs = Array.isArray(rawSegs) ? rawSegs : [];
    c.segment_index = rebuildIndex(c.segment_component_id, segs);
  });
  (components.signage_cabinets || []).forEach((c) => {
    if (c.mount === "pole") {
      c.pole_index = rebuildIndex(c.pole_component_id, poleRows);
      c.foundation_index = void 0;
    } else {
      c.foundation_index = rebuildIndex(c.foundation_component_id, parents);
      c.pole_index = void 0;
    }
  });
  return { components, idMap };
}

// src/components/estimator/foundation/foundationPreliminaryNotice.js
import { createElement, useState } from "react";
var PRELIMINARY_NOTICE_TEXT = "Preliminary estimating only - final engineering required";
function hasPreliminaryNotice(text) {
  return typeof text === "string" && text.includes(PRELIMINARY_NOTICE_TEXT);
}
function ensurePreliminaryNotice(notes) {
  if (notes === null || notes === void 0) return PRELIMINARY_NOTICE_TEXT;
  if (typeof notes !== "string") {
    throw new Error("Preliminary notice can only be applied to string notes.");
  }
  if (notes.trim() === "") return PRELIMINARY_NOTICE_TEXT;
  if (hasPreliminaryNotice(notes)) return notes;
  return `${PRELIMINARY_NOTICE_TEXT}

${notes}`;
}

// src/components/estimator/foundation/foundationTemplateModel.js
var FOUNDATION_TEMPLATE_FIELDS = [
  "items",
  "walls",
  "poles",
  "wall_caps",
  "signage_cabinets",
  "selected_equipment",
  "project_concrete_type",
  "project_concrete_admixtures",
  "excavation_method",
  "selected_concrete_id",
  "landscape",
  "ai_engineering_recommendation",
  "ai_engineering_data",
  "notes",
  "hyperlink",
  "beautify_data_url",
  "customer_markup_percent",
  "customer_price_override",
  "customer_pricing",
  "concrete_cost_per_cy",
  "rebar_cost_per_ft",
  "forming_materials_cost_spread_foot",
  "forming_materials_cost_pillar",
  "min_excavation_time_hours",
  "hand_dig_excavation_cost_per_cy",
  "equipment_excavation_cost_per_cy",
  "forming_labor_rate",
  "pouring_labor_rate",
  "finishing_labor_rate",
  "hand_dig_labor_rate",
  "equipment_excavation_labor_rate"
];
var ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var isRecord2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var deepClone2 = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
var checkTemplateRecord = (data, noun) => {
  if (!isRecord2(data)) throw new Error(`Foundation template ${noun} must be a record.`);
  if (data.assembly_schema_version !== void 0 && data.assembly_schema_version !== 1) {
    throw new Error("Template uses an unsupported assembly version and was not applied.");
  }
};
var sanitizeTemplateCustomerPricing = (v) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (!isRecord2(v)) throw new Error("Foundation template customer_pricing must be a record.");
  if (v.applied !== true) return deepClone2(v);
  return { applied: true, tier_number: v.tier_number };
};
var stampTemplateAppliedAiData = (v, { appliedAt } = {}) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (!isRecord2(v)) throw new Error("Foundation template ai_engineering_data must be a record.");
  const out = deepClone2(v);
  if (out.origin_source_key === void 0) {
    out.origin_source_key = typeof out.source_key === "string" && out.source_key ? out.source_key : null;
  }
  out.template_applied = true;
  out.template_applied_at = typeof appliedAt === "string" && Number.isFinite(Date.parse(appliedAt)) ? appliedAt : (/* @__PURE__ */ new Date()).toISOString();
  return out;
};
var stampTemplateNotesNotice = (v) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (typeof v !== "string") throw new Error("Foundation template notes must be a string.");
  return ensurePreliminaryNotice(v);
};
function prepareFoundationTemplatePatch(data, { createId, appliedAt } = {}) {
  checkTemplateRecord(data, "data");
  if (typeof createId !== "function") throw new Error("Foundation template apply requires a createId factory.");
  const provided = {};
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (data[k] !== void 0) provided[k] = deepClone2(data[k]);
  }
  if (provided.customer_pricing !== void 0) {
    provided.customer_pricing = sanitizeTemplateCustomerPricing(provided.customer_pricing);
  }
  if (provided.ai_engineering_data !== void 0) {
    provided.ai_engineering_data = stampTemplateAppliedAiData(provided.ai_engineering_data, { appliedAt });
  }
  if (provided.notes !== void 0) {
    provided.notes = stampTemplateNotesNotice(provided.notes);
  }
  const arrays = {};
  for (const k of ASSEMBLY_ARRAYS) if (provided[k] !== void 0) arrays[k] = provided[k];
  const cloned = Object.keys(arrays).length ? cloneFoundationComponents(arrays, { createId }).components : {};
  return { ...provided, ...cloned };
}

// src/components/estimator/foundation/foundationSceneTransforms.js
var INCHES_PER_FOOT = 12;
var PLAN_TO_WORLD_SCALE = 1 / INCHES_PER_FOOT;
var DEFAULT_PLAN_EXTENT = Object.freeze({ width: 480, depth: 320 });
var DEFAULT_ZOOM_RANGE = Object.freeze({ min: 0.5, max: 2 });
var DEG_TO_RAD = Math.PI / 180;

// src/components/estimator/foundation/foundationDuplicateMirror.js
var ASSEMBLY_ARRAYS2 = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var ID_RETRY_MAX = 8;
var isRecord3 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var isId2 = (v) => typeof v === "string" && v.length > 0;
var deepClone3 = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var cloneRow = (r) => {
  try {
    return deepClone3(r);
  } catch {
    return isRecord3(r) ? { ...r } : r;
  }
};
var rebuildIndex2 = (id, parents) => {
  if (!isId2(id)) return void 0;
  const i = (parents || []).findIndex((p) => p?.component_id === id);
  return i >= 0 ? i : void 0;
};
var collectUsedComponentIds = (project) => {
  const ids = /* @__PURE__ */ new Set();
  const push = (v) => {
    if (isId2(v)) ids.add(v);
  };
  for (const k of ASSEMBLY_ARRAYS2) {
    for (const r of project?.[k] || []) {
      if (!isRecord3(r)) continue;
      push(r.component_id);
      push(r.foundation_component_id);
      push(r.pole_component_id);
      push(r.wall_component_id);
      push(r.segment_component_id);
      push(r.source_item_component_id);
    }
  }
  for (const w of project?.walls || []) for (const s of w?.shape?.segments || []) push(s?.component_id);
  for (const p of project?.poles || []) for (const s of p?.signs || []) push(s?.component_id);
  return ids;
};
var collisionFreeId = (createId, used, kind) => {
  for (let i = 0; i < ID_RETRY_MAX; i += 1) {
    const id = createId(kind);
    if (isId2(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`foundation duplicate/mirror: could not mint a collision-free ${kind} id`);
};
function appendClonedFoundationAssemblies(project, assemblyData, { createId, transformClone } = {}) {
  if (!isRecord3(project)) throw new Error("foundation duplicate/mirror: project must be a record");
  if (!isRecord3(assemblyData)) throw new Error("foundation duplicate/mirror: assembly data must be a record");
  if (typeof createId !== "function") throw new Error("foundation duplicate/mirror: createId(kind) factory is required");
  const used = collectUsedComponentIds(project);
  const guarded = (kind) => collisionFreeId(createId, used, kind);
  const { components, idMap } = cloneFoundationComponents(assemblyData, { createId: guarded });
  if (typeof transformClone === "function") {
    for (const k of ASSEMBLY_ARRAYS2) for (const r of components[k] || []) transformClone(r, k);
  }
  for (const p of components.poles || []) {
    if (isId2(p?.source_item_component_id) && idMap.has(p.source_item_component_id)) {
      p.source_item_component_id = idMap.get(p.source_item_component_id);
    }
  }
  const items = [...(project.items || []).map(cloneRow), ...components.items || []];
  const walls = [...(project.walls || []).map(cloneRow), ...components.walls || []];
  const poles = [...(project.poles || []).map(cloneRow), ...components.poles || []];
  const wallCaps = [...(project.wall_caps || []).map(cloneRow), ...components.wall_caps || []];
  const cabinets = [...(project.signage_cabinets || []).map(cloneRow), ...components.signage_cabinets || []];
  for (const p of components.poles || []) {
    p.foundation_idx = rebuildIndex2(p.foundation_component_id, items);
  }
  for (const c of components.wall_caps || []) {
    c.wall_index = rebuildIndex2(c.wall_component_id, walls);
    const wall = walls.find((w) => w?.component_id === c.wall_component_id);
    const segs = Array.isArray(wall?.shape?.segments) ? wall.shape.segments : [];
    c.segment_index = rebuildIndex2(c.segment_component_id, segs);
  }
  for (const c of components.signage_cabinets || []) {
    if (c.mount === "pole") {
      c.pole_index = rebuildIndex2(c.pole_component_id, poles);
      c.foundation_index = void 0;
    } else {
      c.foundation_index = rebuildIndex2(c.foundation_component_id, items);
      c.pole_index = void 0;
    }
  }
  const patch = {};
  const clonedCounts = {};
  const pairs = [["items", items], ["walls", walls], ["poles", poles], ["wall_caps", wallCaps], ["signage_cabinets", cabinets]];
  for (const [k, arr] of pairs) {
    const n = (components[k] || []).length;
    clonedCounts[k] = n;
    if (n > 0) patch[k] = arr;
  }
  return { patch, components, idMap, clonedCounts };
}

// src/components/estimator/foundation/foundationAssemblyPresets.js
var isRecord4 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var deepClone4 = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var wallSegments = (prefix, points, closed) => (foundationWallSegments(points, closed) || []).map((s, i) => ({
  component_id: `${prefix}_seg_${i + 1}`,
  ...s
}));
var monumentPoints = [
  { x: 132, z: 148 },
  { x: 348, z: 148 },
  { x: 348, z: 172 },
  { x: 132, z: 172 }
];
var monumentSegments = wallSegments("preset_monument_wall_1", monumentPoints, true);
var lWallPoints = [
  { x: 156, z: 156 },
  { x: 336, z: 156 },
  { x: 336, z: 232 }
];
var lWallSegments = wallSegments("preset_lwall_wall_1", lWallPoints, false);
var PRESET_ROWS = [
  {
    preset_key: "single-spread-footing",
    name: "Single spread footing",
    summary: `One 8' x 5'4" spread footing, centered on the plan.`,
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_ssf_item_1",
          foundation_type: "spread_foot",
          description: "Spread footing",
          quantity: 1,
          length_inches: 96,
          width_inches: 64,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 192,
          z_inches: 128,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [],
      poles: [],
      wall_caps: [],
      signage_cabinets: []
    }
  },
  {
    preset_key: "single-pillar-pier",
    name: "Single pillar pier",
    summary: 'One 24" diameter drilled pier, centered on the plan.',
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_pier_item_1",
          foundation_type: "pillar",
          description: "Pier footing",
          quantity: 1,
          diameter: 24,
          depth_inches: 36,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 228,
          z_inches: 148,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [],
      poles: [],
      wall_caps: [],
      signage_cabinets: []
    }
  },
  {
    preset_key: "pylon-pole-on-pier",
    name: "Pylon pole on pier",
    summary: `30" pier footing with a 20' pole anchored to it.`,
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_pylon_item_1",
          foundation_type: "pillar",
          description: "Pylon pier",
          quantity: 1,
          diameter: 30,
          depth_inches: 42,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 225,
          z_inches: 145,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [],
      poles: [
        {
          component_id: "preset_pylon_pole_1",
          pole_id: "",
          height_inches: 240,
          embedment_inches: 48,
          include_pole_painting: false,
          foundation_component_id: "preset_pylon_item_1",
          foundation_idx: 0,
          x_inches: 240,
          z_inches: 160,
          signs: []
        }
      ],
      wall_caps: [],
      signage_cabinets: []
    }
  },
  {
    preset_key: "twin-pole-monument",
    name: "Twin pole monument",
    summary: "Two 4' spread footings, two 15' poles, and a mounted cabinet on each pole.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_tpm_item_1",
          foundation_type: "spread_foot",
          description: "Left footing",
          quantity: 1,
          length_inches: 48,
          width_inches: 48,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 144,
          z_inches: 136,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        },
        {
          component_id: "preset_tpm_item_2",
          foundation_type: "spread_foot",
          description: "Right footing",
          quantity: 1,
          length_inches: 48,
          width_inches: 48,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 288,
          z_inches: 136,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [],
      poles: [
        {
          component_id: "preset_tpm_pole_1",
          pole_id: "",
          height_inches: 180,
          embedment_inches: 36,
          include_pole_painting: false,
          foundation_component_id: "preset_tpm_item_1",
          foundation_idx: 0,
          x_inches: 168,
          z_inches: 160,
          signs: []
        },
        {
          component_id: "preset_tpm_pole_2",
          pole_id: "",
          height_inches: 180,
          embedment_inches: 36,
          include_pole_painting: false,
          foundation_component_id: "preset_tpm_item_2",
          foundation_idx: 1,
          x_inches: 312,
          z_inches: 160,
          signs: []
        }
      ],
      wall_caps: [],
      signage_cabinets: [
        {
          component_id: "preset_tpm_cabinet_1",
          description: "",
          mount: "pole",
          pole_component_id: "preset_tpm_pole_1",
          pole_index: 0,
          foundation_component_id: "",
          foundation_index: void 0,
          width_inches: 72,
          height_inches: 48,
          depth_inches: 10,
          mount_height_inches: 84,
          quantity: 1,
          unit_cost: 0
        },
        {
          component_id: "preset_tpm_cabinet_2",
          description: "",
          mount: "pole",
          pole_component_id: "preset_tpm_pole_2",
          pole_index: 1,
          foundation_component_id: "",
          foundation_index: void 0,
          width_inches: 72,
          height_inches: 48,
          depth_inches: 10,
          mount_height_inches: 84,
          quantity: 1,
          unit_cost: 0
        }
      ]
    }
  },
  {
    preset_key: "monument-base-wall-cap",
    name: "Monument base with wall cap",
    summary: "20' x 3' footing with a closed perimeter base wall and a cap on every segment.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_monument_item_1",
          foundation_type: "spread_foot",
          description: "Monument footing",
          quantity: 1,
          length_inches: 240,
          width_inches: 36,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 120,
          z_inches: 142,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [
        {
          component_id: "preset_monument_wall_1",
          name: "Base wall",
          heightInches: 18,
          mortarGapInches: 0.375,
          materialId: "",
          internalMaterialId: "",
          shape: { points: monumentPoints, closed: true, segments: monumentSegments }
        }
      ],
      poles: [],
      wall_caps: monumentSegments.map((s, i) => ({
        component_id: `preset_monument_cap_${i + 1}`,
        cap_inventory_id: "",
        wall_component_id: "preset_monument_wall_1",
        wall_index: 0,
        segment_component_id: s.component_id,
        segment_index: i
      })),
      signage_cabinets: []
    }
  },
  {
    preset_key: "open-l-wall-run",
    name: "Open L wall on footing",
    summary: "15' x 8' footing with an open two-segment L wall and caps.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_lwall_item_1",
          foundation_type: "spread_foot",
          description: "Wall footing",
          quantity: 1,
          length_inches: 180,
          width_inches: 96,
          depth_inches: 18,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 150,
          z_inches: 148,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [
        {
          component_id: "preset_lwall_wall_1",
          name: "L wall",
          heightInches: 24,
          mortarGapInches: 0.375,
          materialId: "",
          internalMaterialId: "",
          shape: { points: lWallPoints, closed: false, segments: lWallSegments }
        }
      ],
      poles: [],
      wall_caps: lWallSegments.map((s, i) => ({
        component_id: `preset_lwall_cap_${i + 1}`,
        cap_inventory_id: "",
        wall_component_id: "preset_lwall_wall_1",
        wall_index: 0,
        segment_component_id: s.component_id,
        segment_index: i
      })),
      signage_cabinets: []
    }
  }
];
var freezeDeep = (v) => {
  if (isRecord4(v) || Array.isArray(v)) {
    for (const k of Object.keys(v)) freezeDeep(v[k]);
    Object.freeze(v);
  }
  return v;
};
var FOUNDATION_ASSEMBLY_PRESETS = freezeDeep(PRESET_ROWS.map((p) => ({ ...p })));
var findPreset = (presetOrKey) => {
  const key = typeof presetOrKey === "string" ? presetOrKey : presetOrKey?.preset_key;
  const hit = FOUNDATION_ASSEMBLY_PRESETS.find((p) => p.preset_key === key);
  if (!hit) throw new Error(`foundation assembly preset: unknown preset ${JSON.stringify(key)}`);
  return hit;
};
function foundationAssemblyPresetTemplateData(presetOrKey) {
  const preset = findPreset(presetOrKey);
  return deepClone4({ ...preset.project_data, assembly_schema_version: 1 });
}
var COUNT_LABELS = [
  ["items", "foundation", "foundations"],
  ["walls", "wall", "walls"],
  ["poles", "pole", "poles"],
  ["wall_caps", "cap", "caps"],
  ["signage_cabinets", "cabinet", "cabinets"]
];
function describeFoundationAssemblyPreset(presetOrKey) {
  const preset = findPreset(presetOrKey);
  const data = preset.project_data || {};
  const counts = {};
  const parts = [];
  for (const [k, one, many] of COUNT_LABELS) {
    const n = Array.isArray(data[k]) ? data[k].length : 0;
    counts[k] = n;
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  }
  return {
    preset_key: preset.preset_key,
    name: preset.name,
    summary: preset.summary,
    counts,
    counts_label: parts.length ? parts.join(" \xB7 ") : "empty preset",
    total_components: Object.values(counts).reduce((a, n) => a + n, 0)
  };
}
function applyFoundationAssemblyPreset(project, presetOrKey, {
  createId,
  appliedAt,
  mode = "replace"
} = {}) {
  if (!isRecord4(project)) throw new Error("foundation assembly preset: project must be a record");
  const preset = findPreset(presetOrKey);
  const data = foundationAssemblyPresetTemplateData(preset);
  if (mode === "append") {
    const { patch, idMap, clonedCounts } = appendClonedFoundationAssemblies(project, data, { createId });
    return {
      patch,
      summary: {
        operation: "preset",
        mode: "append",
        preset_key: preset.preset_key,
        appended: clonedCounts,
        rows_added: Object.values(clonedCounts).reduce((a, n) => a + n, 0),
        id_map: Object.fromEntries(idMap)
      }
    };
  }
  if (mode !== "replace") throw new Error('foundation assembly preset: mode must be "replace" or "append"');
  return {
    patch: prepareFoundationTemplatePatch(data, { createId, appliedAt }),
    summary: { operation: "preset", mode: "replace", preset_key: preset.preset_key }
  };
}
export {
  FOUNDATION_ASSEMBLY_PRESETS,
  applyFoundationAssemblyPreset,
  describeFoundationAssemblyPreset,
  foundationAssemblyPresetTemplateData
};
