// .audit-work/foundation-o094-presets/baseline/foundationAssemblyModel.js
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
var normalizeWalls = (walls, prevWalls, createId, used, seen) => {
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
  next.walls = normalizeWalls(project.walls, previous?.walls, createId, used, seen);
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

// .audit-work/foundation-o094-presets/baseline/foundationLayoutModel.js
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

// .audit-work/foundation-o094-presets/candidates/src/components/estimator/foundation/foundationDuplicateMirror.js
var ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var ID_RETRY_MAX = 8;
var DEFAULT_OFFSET_INCHES = { x: 12, z: 12 };
var isRecord2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var fin2 = (v) => typeof v === "number" && Number.isFinite(v);
var isId2 = (v) => typeof v === "string" && v.length > 0;
var deepClone2 = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var cloneRow = (r) => {
  try {
    return deepClone2(r);
  } catch {
    return isRecord2(r) ? { ...r } : r;
  }
};
var normDeg = (v) => (v % 360 + 360) % 360;
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
  for (const k of ASSEMBLY_ARRAYS) {
    for (const r of project?.[k] || []) {
      if (!isRecord2(r)) continue;
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
var selectRows = (project, componentIds, includeDependents) => {
  const selected = {};
  for (const k of ASSEMBLY_ARRAYS) selected[k] = /* @__PURE__ */ new Set();
  if (componentIds !== void 0 && componentIds !== null && !Array.isArray(componentIds)) {
    throw new Error("foundation duplicate/mirror: component_ids must be an array");
  }
  if (componentIds === void 0 || componentIds === null) {
    for (const k of ASSEMBLY_ARRAYS) for (const r of project?.[k] || []) selected[k].add(r);
  } else {
    const lookup = /* @__PURE__ */ new Map();
    for (const k of ASSEMBLY_ARRAYS) {
      for (const r of project?.[k] || []) {
        if (isId2(r?.component_id) && !lookup.has(r.component_id)) lookup.set(r.component_id, { kind: k, row: r });
      }
    }
    const unmatched = componentIds.filter((id) => !lookup.has(id));
    if (unmatched.length) {
      throw new Error(`foundation duplicate/mirror: unknown component id(s): ${unmatched.join(", ")}`);
    }
    for (const id of componentIds) {
      const hit = lookup.get(id);
      selected[hit.kind].add(hit.row);
    }
  }
  if (includeDependents) {
    const itemIds = () => new Set([...selected.items].map((r) => r?.component_id).filter(isId2));
    const wallIds = () => new Set([...selected.walls].map((r) => r?.component_id).filter(isId2));
    const poleIds = () => new Set([...selected.poles].map((r) => r?.component_id).filter(isId2));
    let grew = true;
    while (grew) {
      grew = false;
      const items = itemIds();
      for (const p of project?.poles || []) {
        if (!selected.poles.has(p) && items.has(p?.foundation_component_id)) {
          selected.poles.add(p);
          grew = true;
        }
      }
      const walls = wallIds();
      for (const c of project?.wall_caps || []) {
        if (!selected.wall_caps.has(c) && walls.has(c?.wall_component_id)) {
          selected.wall_caps.add(c);
          grew = true;
        }
      }
      const poles = poleIds();
      for (const c of project?.signage_cabinets || []) {
        if (selected.signage_cabinets.has(c)) continue;
        const pool = c?.mount === "pole" ? poles : items;
        const parent = c?.mount === "pole" ? c?.pole_component_id : c?.foundation_component_id;
        if (pool.has(parent)) {
          selected.signage_cabinets.add(c);
          grew = true;
        }
      }
    }
  }
  return selected;
};
var subsetOf = (project, selected) => {
  const out = {};
  for (const k of ASSEMBLY_ARRAYS) out[k] = (project?.[k] || []).filter((r) => selected[k].has(r));
  return out;
};
function appendClonedFoundationAssemblies(project, assemblyData, { createId, transformClone } = {}) {
  if (!isRecord2(project)) throw new Error("foundation duplicate/mirror: project must be a record");
  if (!isRecord2(assemblyData)) throw new Error("foundation duplicate/mirror: assembly data must be a record");
  if (typeof createId !== "function") throw new Error("foundation duplicate/mirror: createId(kind) factory is required");
  const used = collectUsedComponentIds(project);
  const guarded = (kind) => collisionFreeId(createId, used, kind);
  const { components, idMap } = cloneFoundationComponents(assemblyData, { createId: guarded });
  if (typeof transformClone === "function") {
    for (const k of ASSEMBLY_ARRAYS) for (const r of components[k] || []) transformClone(r, k);
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
var normalizeOffset = (v) => {
  if (v === void 0 || v === null) return { ...DEFAULT_OFFSET_INCHES };
  if (fin2(v)) return { x: v, z: v };
  if (isRecord2(v)) {
    const x = v.x !== void 0 ? v.x : v.x_inches;
    const z = v.z !== void 0 ? v.z : v.z_inches;
    if ((x === void 0 || fin2(x)) && (z === void 0 || fin2(z))) {
      return { x: x ?? DEFAULT_OFFSET_INCHES.x, z: z ?? DEFAULT_OFFSET_INCHES.z };
    }
  }
  throw new Error("foundation duplicate: offset_inches must be a finite number or {x, z} inches");
};
var translateRow = (row, kind, off) => {
  if (kind === "items" || kind === "poles") {
    if (fin2(row.x_inches)) row.x_inches += off.x;
    if (fin2(row.z_inches)) row.z_inches += off.z;
  } else if (kind === "walls") {
    const pts = row?.shape?.points;
    if (Array.isArray(pts)) {
      for (const p of pts) {
        if (fin2(p?.x)) p.x += off.x;
        if (fin2(p?.z)) p.z += off.z;
      }
    }
  }
};
function duplicateFoundationAssembly(project, {
  component_ids,
  include_dependents = true,
  offset_inches,
  createId
} = {}) {
  if (!isRecord2(project)) throw new Error("foundation duplicate: project must be a record");
  if (typeof createId !== "function") throw new Error("foundation duplicate: createId(kind) factory is required");
  const off = normalizeOffset(offset_inches);
  const selected = selectRows(project, component_ids, include_dependents !== false);
  const subset = subsetOf(project, selected);
  const { patch, idMap, clonedCounts } = appendClonedFoundationAssemblies(project, subset, {
    createId,
    transformClone: (row, kind) => translateRow(row, kind, off)
  });
  return {
    patch,
    summary: {
      operation: "duplicate",
      offset_inches: off,
      duplicated: clonedCounts,
      rows_added: Object.values(clonedCounts).reduce((a, n) => a + n, 0),
      id_map: Object.fromEntries(idMap)
    }
  };
}
var EDGE_ALIASES = {
  min_x: { axis: "x", at: (item, fp) => item.x_inches },
  left: { axis: "x", at: (item, fp) => item.x_inches },
  max_x: { axis: "x", at: (item, fp) => item.x_inches + fp.width },
  right: { axis: "x", at: (item, fp) => item.x_inches + fp.width },
  min_z: { axis: "z", at: (item, fp) => item.z_inches },
  top: { axis: "z", at: (item, fp) => item.z_inches },
  max_z: { axis: "z", at: (item, fp) => item.z_inches + fp.depth },
  bottom: { axis: "z", at: (item, fp) => item.z_inches + fp.depth }
};
var resolveMirrorLine = (project, { axis, at, edge_of, edge } = {}) => {
  if (edge_of !== void 0 && edge_of !== null) {
    const item = (project.items || []).find((r) => r?.component_id === edge_of);
    if (!item) throw new Error("foundation mirror: edge_of must name a foundation item component_id");
    const fp = foundationLayoutFootprint(item);
    if (!fp || !fin2(item.x_inches) || !fin2(item.z_inches)) {
      throw new Error("foundation mirror: edge_of item needs a finite plan position and footprint");
    }
    const spec = EDGE_ALIASES[edge ?? "max_x"];
    if (!spec) throw new Error(`foundation mirror: unknown edge "${String(edge)}" (min_x|max_x|min_z|max_z or left|right|top|bottom)`);
    return { axis: spec.axis, at: spec.at(item, fp) };
  }
  const ax = axis === void 0 || axis === null ? "x" : axis;
  if (ax !== "x" && ax !== "z") throw new Error('foundation mirror: axis must be "x" or "z"');
  const v = at === void 0 || at === null ? ax === "x" ? FOUNDATION_LAYOUT_WIDTH_INCHES / 2 : FOUNDATION_LAYOUT_DEPTH_INCHES / 2 : at;
  if (!fin2(v)) throw new Error("foundation mirror: the mirror line (at) must be a finite inches value");
  return { axis: ax, at: v };
};
var reflectRow = (row, kind, { axis, at }) => {
  const rc = (v) => 2 * at - v;
  let changed = false;
  if (kind === "items") {
    const fp = foundationLayoutFootprint(row);
    if (axis === "x") {
      if (fin2(row.x_inches)) {
        row.x_inches = fp ? rc(row.x_inches) - fp.width : rc(row.x_inches);
        changed = true;
      }
    } else {
      if (fin2(row.z_inches)) {
        row.z_inches = fp ? rc(row.z_inches) - fp.depth : rc(row.z_inches);
        changed = true;
      }
    }
    if (fin2(row.rotation_degrees)) {
      row.rotation_degrees = normDeg(-row.rotation_degrees);
      changed = true;
    }
  } else if (kind === "poles") {
    if (axis === "x" && fin2(row.x_inches)) {
      row.x_inches = rc(row.x_inches);
      changed = true;
    }
    if (axis === "z" && fin2(row.z_inches)) {
      row.z_inches = rc(row.z_inches);
      changed = true;
    }
  } else if (kind === "walls") {
    const pts = row?.shape?.points;
    if (Array.isArray(pts)) {
      for (const p of pts) {
        if (axis === "x" && fin2(p?.x)) {
          p.x = rc(p.x);
          changed = true;
        }
        if (axis === "z" && fin2(p?.z)) {
          p.z = rc(p.z);
          changed = true;
        }
      }
    }
  }
  return changed;
};
function mirrorFoundationAssembly(project, {
  component_ids,
  include_dependents = true,
  axis,
  at,
  edge_of,
  edge,
  mode = "copy",
  createId
} = {}) {
  if (!isRecord2(project)) throw new Error("foundation mirror: project must be a record");
  const line = resolveMirrorLine(project, { axis, at, edge_of, edge });
  if (mode === "reflect" || mode === "in_place") {
    const selected2 = selectRows(project, component_ids, include_dependents !== false);
    const patch2 = {};
    const mirrored = {};
    let total = 0;
    for (const k of ASSEMBLY_ARRAYS) {
      let changed = 0;
      const next = (project[k] || []).map((r) => {
        const copy = cloneRow(r);
        if (selected2[k].has(r) && isRecord2(copy) && reflectRow(copy, k, line)) changed += 1;
        return copy;
      });
      if (changed > 0) {
        patch2[k] = next;
        mirrored[k] = changed;
        total += changed;
      }
    }
    return {
      patch: patch2,
      summary: { operation: "mirror", mode: "in_place", axis: line.axis, at: line.at, mirrored, rows_mirrored: total }
    };
  }
  if (mode !== "copy") throw new Error('foundation mirror: mode must be "copy" or "reflect"');
  if (typeof createId !== "function") throw new Error("foundation mirror: copy mode requires a createId(kind) factory");
  const selected = selectRows(project, component_ids, include_dependents !== false);
  const subset = subsetOf(project, selected);
  const { patch, idMap, clonedCounts } = appendClonedFoundationAssemblies(project, subset, {
    createId,
    transformClone: (row, kind) => reflectRow(row, kind, line)
  });
  return {
    patch,
    summary: {
      operation: "mirror",
      mode: "copy",
      axis: line.axis,
      at: line.at,
      mirrored: clonedCounts,
      rows_added: Object.values(clonedCounts).reduce((a, n) => a + n, 0),
      id_map: Object.fromEntries(idMap)
    }
  };
}
export {
  appendClonedFoundationAssemblies,
  duplicateFoundationAssembly,
  mirrorFoundationAssembly
};
