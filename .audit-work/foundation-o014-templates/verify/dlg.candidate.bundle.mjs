// .audit-work/foundation-o014-templates/candidates/src/components/estimator/foundation/FoundationTemplateDialog.jsx
import { useEffect, useRef, useState } from "react";

// stub:@/api/base44Client
var base44 = { entities: { ProjectTemplate: { get: (id) => globalThis.__tplGet(id) } } };

// stub:@/components/ui/dialog
var Dialog = (p) => p?.children ?? null;
var DialogContent = (p) => p?.children ?? null;
var DialogHeader = (p) => p?.children ?? null;
var DialogTitle = (p) => p?.children ?? null;

// stub:lucide-react
var Trash2 = () => null;

// stub:@/components/estimator/products/reusableSaveIdempotency
var ensureReusableRecord = (a) => (globalThis.__tplSave || ((x) => ({ id: "t1", ...x.data })))(a);

// stub:@/components/estimator/builder/builderEntityPersistence
var deleteEntityIfUnchanged = async (a) => {
  globalThis.__deletes.push(a);
  return true;
};

// .audit-work/foundation-o014-templates/candidates/src/components/estimator/foundation/foundationTemplateService.js
async function saveFoundationTemplate({ idempotencyKey, data }) {
  return ensureReusableRecord({
    entity: base44.entities.ProjectTemplate,
    idempotencyKey,
    data,
    label: "Foundation template"
  });
}
var isNotFound = (e) => {
  const status = Number(e?.status || e?.response?.status || e?.response?.statusCode || e?.data?.status || 0);
  if (status === 404) return true;
  const message = [
    e?.message,
    e?.response?.data?.message,
    e?.response?.data?.error,
    e?.data?.message,
    e?.data?.error
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  return message.includes("not found") || message.includes("does not exist");
};
async function deleteFoundationTemplate(templateId) {
  const id = String(templateId || "").trim();
  if (!id) throw new Error("Foundation template id is required.");
  let current;
  try {
    current = await base44.entities.ProjectTemplate.get(id);
  } catch (e) {
    if (isNotFound(e)) return true;
    throw e;
  }
  if (current === null || current === void 0 || typeof current !== "object" || Array.isArray(current) || current.id !== id) {
    throw new Error("Foundation template record could not be verified; delete aborted.");
  }
  await deleteEntityIfUnchanged({
    entity: base44.entities.ProjectTemplate,
    record: current,
    label: "Foundation template"
  });
  return true;
}

// .audit-work/foundation-o014-templates/baseline/foundationAssemblyModel.js
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

// .audit-work/foundation-o014-templates/baseline/foundationTemplateModel.js
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
  "notes"
];
var ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var isRecord2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var deepClone = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
var checkTemplateRecord = (data, noun) => {
  if (!isRecord2(data)) throw new Error(`Foundation template ${noun} must be a record.`);
  if (data.assembly_schema_version !== void 0 && data.assembly_schema_version !== 1) {
    throw new Error("Template uses an unsupported assembly version and was not applied.");
  }
};
function createFoundationTemplateSnapshot(project, { createId } = {}) {
  checkTemplateRecord(project, "source");
  const out = { assembly_schema_version: 1 };
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (project[k] !== void 0) out[k] = deepClone(project[k]);
  }
  const supplied = {};
  let hasAssembly = false;
  for (const k of ASSEMBLY_ARRAYS) {
    if (out[k] !== void 0) {
      supplied[k] = out[k];
      hasAssembly = true;
    }
  }
  if (hasAssembly) {
    let n = 0;
    const f = typeof createId === "function" ? createId : (kind) => `tmpl_${kind}_${n++}`;
    normalizeFoundationAssembly(supplied, { createId: f });
  }
  return out;
}

// stub:@/components/estimator/loadAllEntityRows
var loadAllEntityRows = async () => {
  if (globalThis.__tplLoad) return globalThis.__tplLoad();
  if (globalThis.__tplLoadErr) throw globalThis.__tplLoadErr;
  return globalThis.__tplRows || [];
};

// stub:@/components/estimator/idempotentEntityCreate
var __n = 0;
var newCreationRequestKey = (k) => "k-" + (k || "x") + "-" + ++__n;

// .audit-work/foundation-o014-templates/candidates/src/components/estimator/foundation/FoundationTemplateDialog.jsx
import { jsx, jsxs } from "react/jsx-runtime";
function FoundationTemplateDialog({ open, mode, onClose, project, onApply, saveDisabled = false, saveDisabledReason = "" }) {
  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const saveAttemptRef = useRef({ signature: "", key: "" });
  const saveFlightRef = useRef(null);
  const contextRef = useRef({ open: false, mode: null, projectId: null, identity: "", generation: 0, project: null });
  const generationRef = useRef(0);
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const draftRef = useRef(null);
  draftRef.current = { project, name };
  const identity = `${open ? 1 : 0}|${mode}|${project?.id ?? ""}`;
  if (contextRef.current.identity !== identity) {
    generationRef.current += 1;
    contextRef.current = {
      open,
      mode,
      projectId: project?.id ?? null,
      project,
      identity,
      generation: generationRef.current
    };
  } else {
    contextRef.current.open = open;
    contextRef.current.project = project;
  }
  const saveContext = { ...contextRef.current };
  const sameContext = (c) => mountedRef.current && c.open && contextRef.current.open && contextRef.current.identity === c.identity && contextRef.current.generation === c.generation;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const loadRows = (gen) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    loadAllEntityRows({
      entity: base44.entities.ProjectTemplate,
      query: { module_key: "foundation" },
      sort: "created_date",
      label: "Foundation templates"
    }).then((rows) => {
      const c = contextRef.current;
      if (!mountedRef.current || !c.open || c.mode !== "load" || generationRef.current !== gen || loadSeqRef.current !== seq) return;
      setTemplates(rows || []);
      setError(null);
    }).catch((e) => {
      const c = contextRef.current;
      if (!mountedRef.current || !c.open || c.mode !== "load" || generationRef.current !== gen || loadSeqRef.current !== seq) return;
      setTemplates([]);
      setLoadFailed(true);
      setError(e?.message || "Templates could not be loaded.");
    }).finally(() => {
      if (mountedRef.current && loadSeqRef.current === seq) setLoading(false);
    });
  };
  useEffect(() => {
    if (!open) return;
    saveAttemptRef.current = { signature: "", key: "" };
    setTemplates([]);
    setError(null);
    setLoadFailed(false);
    if (mode !== "load") return;
    loadRows(generationRef.current);
  }, [open, mode, project?.id]);
  const save = () => {
    const sc = saveContext;
    if (saveFlightRef.current) return saveFlightRef.current;
    if (saveDisabled) return null;
    const trimmed = name.trim();
    if (!trimmed || !sameContext(sc) || sc.mode !== "save" || draftRef.current.project !== project || draftRef.current.name !== name) return null;
    let snapshot;
    try {
      snapshot = createFoundationTemplateSnapshot(project, {
        createId: (kind) => newCreationRequestKey(`template_${kind}`)
      });
    } catch (e) {
      setError(e?.message || "Template snapshot could not be prepared.");
      return null;
    }
    const data = { template_name: trimmed, module_key: "foundation", project_data: snapshot };
    const signature = JSON.stringify(data);
    if (saveAttemptRef.current.signature !== signature) {
      saveAttemptRef.current = {
        signature,
        key: `foundation_template_save:${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
        data
      };
    }
    const attempt = saveAttemptRef.current;
    const run = Promise.resolve().then(async () => {
      if (!sameContext(sc)) return;
      setBusy(true);
      try {
        await saveFoundationTemplate({ idempotencyKey: attempt.key, data: attempt.data });
        if (!sameContext(sc)) return;
        if (draftRef.current.project !== project || draftRef.current.name !== name) {
          setError("The earlier template snapshot was saved. Current changes have not been saved as a template.");
          return;
        }
        setName("");
        saveAttemptRef.current = { signature: "", key: "" };
        setError(null);
        onClose();
      } catch (e) {
        if (sameContext(sc)) setError(e?.message || "Template could not be saved.");
      }
    }).finally(() => {
      if (saveFlightRef.current !== run) return;
      saveFlightRef.current = null;
      if (mountedRef.current) setBusy(false);
    });
    saveFlightRef.current = run;
    return run;
  };
  const apply = (t) => {
    const sc = saveContext;
    if (!sameContext(sc)) return;
    let ok = false;
    try {
      ok = onApply(t.project_data || {}) === true;
    } catch (e) {
      if (sameContext(sc)) setError(e?.message || "Template could not be applied.");
      return;
    }
    if (!sameContext(sc)) return;
    if (ok) {
      setError(null);
      onClose();
    } else {
      setError("Template was not applied; the current project was left unchanged.");
    }
  };
  const remove = async (t) => {
    const sc = saveContext;
    if (!sameContext(sc)) return;
    if (!window.confirm(`Delete template "${t.template_name || "Untitled"}"?`)) return;
    try {
      await deleteFoundationTemplate(t.id);
      if (!sameContext(sc)) return;
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      setError(null);
    } catch (e) {
      if (sameContext(sc)) setError(e?.message || "Template could not be deleted.");
    }
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange: (v) => !v && onClose(), children: /* @__PURE__ */ jsxs(DialogContent, { className: "max-w-[520px]", children: [
    /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { className: "text-[15px]", children: mode === "save" ? "Save as Template" : "Foundation Templates" }) }),
    error ? /* @__PURE__ */ jsx("div", { role: "alert", className: "text-[12px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5", children: error }) : null,
    mode === "save" ? /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
        "Template name",
        /* @__PURE__ */ jsx(
          "input",
          {
            value: name,
            onChange: (e) => setName(e.target.value),
            placeholder: "e.g. Standard 8ft Pylon Foundation",
            className: "w-full h-[30px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400"
          }
        )
      ] }),
      saveDisabled ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: saveDisabledReason || "Saving a template is not available right now." }) : null,
      /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx("button", { type: "button", onClick: onClose, className: "h-[30px] px-3 border border-gray-300 rounded-sm text-[12px]", children: "Cancel" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: save,
            disabled: busy || saveDisabled,
            className: "h-[30px] px-4 rounded-sm bg-lime-300 border border-lime-400 text-[12px] font-bold text-gray-800 disabled:opacity-60",
            children: "Save Template"
          }
        )
      ] })
    ] }) : loading ? /* @__PURE__ */ jsx("p", { className: "text-[12px] text-gray-500 py-4", children: "Loading\u2026" }) : loadFailed ? /* @__PURE__ */ jsxs("div", { className: "py-4 space-y-2", children: [
      /* @__PURE__ */ jsx("p", { className: "text-[12px] text-gray-500", children: "Templates could not be loaded." }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => {
            const c = saveContext;
            if (sameContext(c)) loadRows(generationRef.current);
          },
          className: "h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700",
          children: "Retry"
        }
      )
    ] }) : templates.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-[12px] text-gray-500 py-4", children: "No foundation templates saved yet." }) : /* @__PURE__ */ jsx("div", { className: "divide-y divide-gray-200 max-h-[320px] overflow-y-auto", children: templates.map((t) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 py-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsx("div", { className: "text-[12px] font-semibold text-gray-800", children: t.template_name }),
        /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-gray-500", children: [
          (t.project_data?.items || []).length,
          " foundations"
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => apply(t),
          className: "h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700",
          children: "Apply"
        }
      ),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => remove(t), className: "text-gray-400 hover:text-red-600", children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4", "aria-hidden": "true" }) })
    ] }, t.id)) })
  ] }) });
}
export {
  FoundationTemplateDialog as default
};
