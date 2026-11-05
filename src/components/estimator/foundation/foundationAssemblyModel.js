const ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
const ID_MAX = 200;
const MAX_COLLISIONS = 8;
const UNRESOLVED_PREFIX = "unresolved:";
const UNRESOLVED = {
  foundation: `${UNRESOLVED_PREFIX}legacy-foundation`,
  pole: `${UNRESOLVED_PREFIX}legacy-pole`,
  wall: `${UNRESOLVED_PREFIX}legacy-wall`,
  segment: `${UNRESOLVED_PREFIX}legacy-segment`,
};

const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= ID_MAX;
const isReserved = (v) => typeof v === "string" && v.startsWith(UNRESOLVED_PREFIX);
const isUnresolvedToken = (v) => Object.values(UNRESOLVED).includes(v);
const deepClone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const cloneNode = (n) => (isRecord(n) ? { ...n } : n);

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const segEndpoints = (shape, i) => {
  const pts = shape?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const closed = shape?.closed === true && pts.length >= 3;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  if (i >= pts.length || (!closed && i >= pts.length - 1)) return null;
  if (!fin(a?.x) || !fin(a?.z) || !fin(b?.x) || !fin(b?.z)) return null;
  return `${a.x},${a.z}->${b.x},${b.z}`;
};

const legacyIndexOf = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v === null || v === undefined) continue;
    if (v === -1) return { explicit: true };
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return { index: v };
    if (typeof v === "string" && /^\d+$/.test(v)) return { index: parseInt(v, 10) };
    return { invalid: v };
  }
  return { absent: true };
};

const collectIds = (project) => {
  const ids = new Set();
  const walk = (rows) => (rows || []).forEach((r) => {
    if (isId(r?.component_id)) ids.add(r.component_id);
  });
  ARRAYS.forEach((k) => walk(project?.[k]));
  (project?.walls || []).forEach((w) => walk(w?.shape?.segments));
  (project?.poles || []).forEach((p) => walk(p?.signs));
  return ids;
};

const collectRefs = (project) => {
  const refs = new Set();
  const add = (v) => { if (isId(v)) refs.add(v); };
  (project?.poles || []).forEach((p) => add(p?.foundation_component_id));
  (project?.wall_caps || []).forEach((c) => { add(c?.wall_component_id); add(c?.segment_component_id); });
  (project?.signage_cabinets || []).forEach((c) => { add(c?.foundation_component_id); add(c?.pole_component_id); });
  return refs;
};

const freshId = (createId, kind, used) => {
  for (let i = 0; i < MAX_COLLISIONS; i += 1) {
    const id = createId(kind);
    if (isId(id) && !isReserved(id) && !used.has(id)) { used.add(id); return id; }
  }
  throw new Error(`foundation assembly: could not mint a unique component id for ${kind}`);
};

const validateRef = (v, kind) => {
  if (v === undefined || v === null) return;
  if (typeof v !== "string" || (v !== "" && !isId(v) && !isUnresolvedToken(v))) {
    throw new Error(`foundation assembly: invalid ${kind} reference value`);
  }
};

const ensureNodeId = (row, createId, kind, used, seen) => {
  if (!isRecord(row)) throw new Error(`foundation assembly: ${kind} row must be a record`);
  const n = cloneNode(row);
  const existing = n.component_id;
  if (existing !== undefined && existing !== null) {
    if (!isId(existing) || isReserved(existing)) throw new Error(`foundation assembly: invalid component_id on ${kind} row`);
    if (seen.has(existing)) throw new Error(`foundation assembly: duplicate component_id "${existing}"`);
    seen.add(existing); used.add(existing);
  } else {
    const id = freshId(createId, kind, used);
    n.component_id = id;
    seen.add(id);
  }
  return n;
};

const reserve = (project, previous, used) => {
  const check = (v) => { if (typeof v === "string" && v.length > 0) used.add(v); };
  for (const src of [previous || {}, project || {}]) {
    collectIds(src).forEach((id) => used.add(id));
    collectRefs(src).forEach((id) => used.add(id));
    const kinds = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
    for (const k of kinds) for (const r of src?.[k] || []) {
      if (!isRecord(r)) throw new Error(`foundation assembly: ${k} row must be a record`);
      for (const [f, kind] of [["foundation_component_id","foundation"],["pole_component_id","pole"],["wall_component_id","wall"],["segment_component_id","segment"]]) validateRef(r[f], kind);
    }
    for (const w of src?.walls || []) for (const s of w?.shape?.segments || []) check(s?.component_id);
    for (const p of src?.poles || []) for (const s of p?.signs || []) check(s?.component_id);
  }
};

const rebuildIndex = (canon, parents) => {
  if (canon === "" || canon === undefined || isUnresolvedToken(canon)) return undefined;
  const i = (parents || []).findIndex((p) => p?.component_id === canon);
  return i >= 0 ? i : undefined;
};

const resolveParent = (canonValue, hasCanon, legacy, incoming, prev, unresolvedToken) => {
  if (hasCanon) {
    if (canonValue === undefined || canonValue === null) return { canon: "", index: undefined };
    if (canonValue === "") return { canon: "", index: undefined };
    if (isUnresolvedToken(canonValue)) return { canon: canonValue, index: undefined, dangling: true, token: true };
    const found = (incoming || []).some((p) => p?.component_id === canonValue);
    return { canon: canonValue, index: found ? rebuildIndex(canonValue, incoming) : undefined, dangling: !found };
  }
  if (legacy.index !== undefined) {
    let canon;
    if (prev) canon = prev[legacy.index]?.component_id;
    else canon = incoming?.[legacy.index]?.component_id;
    if (isId(canon) && (incoming || []).some((p) => p?.component_id === canon)) {
      return { canon, index: rebuildIndex(canon, incoming) };
    }
    if (isId(canon)) return { canon: unresolvedToken, index: undefined, dangling: true, token: true };
    return { canon: unresolvedToken, index: undefined, dangling: true, token: true, outOfRange: true };
  }
  if (legacy.invalid !== undefined) return { canon: unresolvedToken, index: undefined, dangling: true, token: true, invalid: legacy.invalid };
  if (legacy.explicit) return { canon: "", index: undefined };
  return { canon: undefined, index: undefined };
};

const normalizeWalls = (walls, prevWalls, createId, used, seen) => {
  const prevSegIds = new Map();
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
    if (segs !== undefined && !Array.isArray(segs)) throw new Error("foundation assembly: wall shape segments must be an array");
    if (Array.isArray(segs)) {
      for (const s of segs) if (!isRecord(s)) throw new Error("foundation assembly: wall shape segments must be records");
      const incomingCount = new Map();
      segs.forEach((s, i) => {
        const key = segEndpoints(shape, i);
        if (key) incomingCount.set(key, (incomingCount.get(key) || 0) + 1);
      });
      const priorCount = new Map();
      (prevWalls || []).forEach((w2) => {
        (w2?.shape?.segments || []).forEach((s2, i) => {
          const key = segEndpoints(w2?.shape, i);
          if (w2?.component_id === n.component_id && key) priorCount.set(key, (priorCount.get(key) || 0) + 1);
        });
      });
      shape.segments = segs.map((s, i) => {
        const prior = s.component_id;
        if (prior !== undefined && prior !== null) return ensureNodeId(s, createId, "wall_segment", used, seen);
        const key = segEndpoints(shape, i);
        const kept = key && incomingCount.get(key) === 1 && priorCount.get(key) === 1 ? prevSegIds.get(`${n.component_id}|${key}`) : undefined;
        if (kept && !seen.has(kept)) {
          const sn = cloneNode(s);
          sn.component_id = kept;
          seen.add(kept); used.add(kept);
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

const normalizePoles = (poles, items, prevItems, createId, used, seen) =>
  (poles || []).map((p) => {
    const n = ensureNodeId(p, createId, "pole", used, seen);
    const legacy = legacyIndexOf(p, ["foundation_idx"]);
    const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(p, "foundation_component_id"), legacy, items, prevItems, UNRESOLVED.foundation);
    n.foundation_component_id = res.canon === undefined ? "" : res.canon;
    n.foundation_idx = res.index;
    const signs = p?.signs;
    if (signs !== undefined && !Array.isArray(signs)) throw new Error("foundation assembly: pole signs must be an array");
    if (Array.isArray(signs)) n.signs = signs.map((s) => ensureNodeId(s, createId, "pole_sign", used, seen));
    return n;
  });

const normalizeCaps = (caps, walls, prevWalls, createId, used, seen) =>
  (caps || []).map((c) => {
    const n = ensureNodeId(c, createId, "wall_cap", used, seen);
    const wRes = resolveParent(n.wall_component_id, Object.prototype.hasOwnProperty.call(c, "wall_component_id"), legacyIndexOf(c, ["wall_index"]), walls, prevWalls, UNRESOLVED.wall);
    n.wall_component_id = wRes.canon === undefined ? "" : wRes.canon;
    n.wall_index = wRes.index;
    const wall = (walls || []).find((w) => w?.component_id === n.wall_component_id);
    const segs = wall?.shape?.segments || [];
    const prevSegs = prevWalls ? ((prevWalls.find((w) => w?.component_id === n.wall_component_id)?.shape?.segments) || []) : null;
    const sRes = resolveParent(n.segment_component_id, Object.prototype.hasOwnProperty.call(c, "segment_component_id"), legacyIndexOf(c, ["segment_index"]), segs, prevSegs, UNRESOLVED.segment);
    n.segment_component_id = sRes.canon === undefined ? "" : sRes.canon;
    n.segment_index = sRes.index;
    return n;
  });

const normalizeCabinets = (cabinets, items, poles, prevItems, prevPoles, createId, used, seen) =>
  (cabinets || []).map((c) => {
    const n = ensureNodeId(c, createId, "signage_cabinet", used, seen);
    const mount = c?.mount;
    if (mount === "pole") {
      const res = resolveParent(n.pole_component_id, Object.prototype.hasOwnProperty.call(c, "pole_component_id"), legacyIndexOf(c, ["pole_index"]), poles, prevPoles, UNRESOLVED.pole);
      n.pole_component_id = res.canon === undefined ? "" : res.canon;
      n.pole_index = res.index;
      n.foundation_component_id = n.foundation_component_id ?? "";
      n.foundation_index = undefined;
    } else if (mount === "foundation") {
      const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(c, "foundation_component_id"), legacyIndexOf(c, ["foundation_index"]), items, prevItems, UNRESOLVED.foundation);
      n.foundation_component_id = res.canon === undefined ? "" : res.canon;
      n.foundation_index = res.index;
      n.pole_component_id = n.pole_component_id ?? "";
      n.pole_index = undefined;
    } else {
      n.mount = mount;
      if (n.foundation_component_id === undefined) n.foundation_component_id = "";
      if (n.pole_component_id === undefined) n.pole_component_id = "";
      n.foundation_index = undefined;
      n.pole_index = undefined;
    }
    return n;
  });

export function normalizeFoundationAssembly(project, { previous = null, createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord(project)) throw new Error("foundation assembly: project must be a record");
  const ver = project.assembly_schema_version;
  if (ver !== undefined && ver !== 1) throw new Error(`foundation assembly: unsupported assembly_schema_version ${String(ver)}`);
  const used = new Set();
  const seen = new Set();
  for (const k of ARRAYS) {
    if (project[k] !== undefined && !Array.isArray(project[k])) throw new Error(`foundation assembly: ${k} must be an array`);
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

export function foundationAssemblyIssues(project) {
  const issues = [];
  if (!isRecord(project)) return issues;
  const items = project.items || [];
  const walls = project.walls || [];
  const poles = project.poles || [];
  const byId = (arr, id) => isId(id) && (arr || []).some((p) => p?.component_id === id);
  for (const p of poles) {
    const canon = p?.foundation_component_id;
    if (canon === "" || canon === undefined || canon === null) continue;
    if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole legacy foundation index could not be resolved; left unresolved until reassigned." });
    else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole references a foundation that is not present; it stays priced until reassigned." });
  }
  for (const c of project.wall_caps || []) {
    const wId = c?.wall_component_id;
    if (wId === "" || wId === undefined || wId === null) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: undefined, message: "Wall cap has no wall assigned; it stays priced until assigned." });
    else if (isReserved(wId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap wall could not be resolved; left unresolved until reassigned." });
    else if (!byId(walls, wId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap references a wall that is not present; it stays priced until reassigned." });
    const wall = walls.find((w) => w?.component_id === wId);
    const segs = wall?.shape?.segments || [];
    const sId = c?.segment_component_id;
    if (sId === "" || sId === undefined || sId === null) { if (wall) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: undefined, message: "Wall cap has no wall segment assigned; it stays priced until assigned." }); }
    else if (isReserved(sId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap segment could not be resolved; left unresolved until reassigned." });
    else if (!byId(segs, sId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap references a wall segment that is not present; it stays priced until reassigned." });
  }
  for (const c of project.signage_cabinets || []) {
    if (c?.mount === "pole") {
      const canon = c?.pole_component_id;
      if (canon === "" || canon === undefined || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: undefined, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet pole could not be resolved; left unresolved until reassigned." });
      else if (!byId(poles, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a pole that is not present; it stays priced until reassigned." });
    } else if (c?.mount === "foundation") {
      const canon = c?.foundation_component_id;
      if (canon === "" || canon === undefined || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: undefined, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet foundation could not be resolved; left unresolved until reassigned." });
      else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a foundation that is not present; it stays priced until reassigned." });
    } else {
      issues.push({ code: "unsupported-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: undefined, message: "Cabinet mount is not supported; it stays priced and visible until reassigned." });
    }
  }
  return issues;
}

export function cloneFoundationComponents(project, { createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord(project)) throw new Error("foundation assembly: project must be a record");
  const { project: normalized } = normalizeFoundationAssembly(project, { createId });
  const used = new Set([...collectIds(normalized), ...collectRefs(normalized)]);
  const idMap = new Map();
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
  if (project.items !== undefined) components.items = copyRows(normalized.items, "item");
  if (project.walls !== undefined) {
    components.walls = copyRows(normalized.walls, "wall").map((w) => ({
      ...w,
      shape: isRecord(w.shape) ? { ...w.shape, segments: (w.shape.segments || []).map((s) => ({ ...s, component_id: remap(s.component_id, "wall_segment") })) } : w.shape,
    }));
  }
  if (project.poles !== undefined) {
    components.poles = copyRows(normalized.poles, "pole").map((p) => ({
      ...p,
      foundation_component_id: isId(p.foundation_component_id) && idMap.has(p.foundation_component_id) ? idMap.get(p.foundation_component_id) : p.foundation_component_id,
      signs: (p.signs || []).map((s) => ({ ...s, component_id: remap(s.component_id, "pole_sign") })),
    }));
  }
  if (project.wall_caps !== undefined) {
    components.wall_caps = copyRows(normalized.wall_caps, "wall_cap").map((c) => ({
      ...c,
      wall_component_id: isId(c.wall_component_id) && idMap.has(c.wall_component_id) ? idMap.get(c.wall_component_id) : c.wall_component_id,
      segment_component_id: isId(c.segment_component_id) && idMap.has(c.segment_component_id) ? idMap.get(c.segment_component_id) : c.segment_component_id,
    }));
  }
  if (project.signage_cabinets !== undefined) {
    components.signage_cabinets = copyRows(normalized.signage_cabinets, "signage_cabinet").map((c) => ({
      ...c,
      foundation_component_id: isId(c.foundation_component_id) && idMap.has(c.foundation_component_id) ? idMap.get(c.foundation_component_id) : c.foundation_component_id,
      pole_component_id: isId(c.pole_component_id) && idMap.has(c.pole_component_id) ? idMap.get(c.pole_component_id) : c.pole_component_id,
    }));
  }
  const parents = components.items || [];
  const wallRows = components.walls || [];
  const poleRows = components.poles || [];
  (components.poles || []).forEach((p) => { p.foundation_idx = rebuildIndex(p.foundation_component_id, parents); });
  (components.wall_caps || []).forEach((c) => {
    c.wall_index = rebuildIndex(c.wall_component_id, wallRows);
    const segs = wallRows.find((w) => w?.component_id === c.wall_component_id)?.shape?.segments || [];
    c.segment_index = rebuildIndex(c.segment_component_id, segs);
  });
  (components.signage_cabinets || []).forEach((c) => {
    if (c.mount === "pole") { c.pole_index = rebuildIndex(c.pole_component_id, poleRows); c.foundation_index = undefined; }
    else { c.foundation_index = rebuildIndex(c.foundation_component_id, parents); c.pole_index = undefined; }
  });
  return { components, idMap };
}
