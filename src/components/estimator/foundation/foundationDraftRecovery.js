// Pure unsent browser-tab draft recovery for the foundation estimator.
// Owns sessionStorage envelope read/write/CAS-clear only — no page/router/auth logic.
export const FOUNDATION_DRAFT_FIELDS = [
  "project_name", "notes", "assembly_schema_version",
  "items", "walls", "poles", "wall_caps", "signage_cabinets", "selected_equipment", "landscape",
  "project_concrete_type", "project_concrete_admixtures", "excavation_method", "selected_concrete_id",
  "ai_engineering_recommendation", "ai_engineering_data",
  "concrete_cost_per_cy", "rebar_cost_per_ft",
  "forming_materials_cost_spread_foot", "forming_materials_cost_pillar",
  "min_excavation_time_hours",
  "hand_dig_excavation_cost_per_cy", "equipment_excavation_cost_per_cy",
  "forming_labor_rate", "pouring_labor_rate", "finishing_labor_rate",
  "hand_dig_labor_rate", "equipment_excavation_labor_rate",
];

const KEY_PREFIX = "ccs:foundation-draft:v1:";
const MAX_CHARS = 1_000_000;
const ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets", "selected_equipment"];

const validId = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 256;
const isPlain = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const keyFor = (ownerId, sourceId, estimateId) =>
  KEY_PREFIX + encodeURIComponent(JSON.stringify([ownerId, sourceId, estimateId ?? null]));

// Deep clone that REJECTS unsupported shapes; undefined props omitted (JSON semantics).
const cloneChecked = (value, seen = new Set(), inArray = false) => {
  if (value === undefined) { if (inArray) throw new Error("Undefined array entry in draft data."); return undefined; }
  if (value === null) return null;
  const t = typeof value;
  if (t === "number") { if (!Number.isFinite(value)) throw new Error("Non-finite number in draft data."); return value; }
  if (t === "string" || t === "boolean") return value;
  if (t !== "object") throw new Error(`Unsupported draft value type: ${t}`);
  if (seen.has(value)) throw new Error("Cycle in draft data.");
  if (Array.isArray(value)) {
    seen.add(value);
    const out = Array.from(value, v => cloneChecked(v, seen, true));
    seen.delete(value);
    return out;
  }
  if (!isPlain(value)) throw new Error("Non-plain object in draft data (Date/Map/class instance not supported).");
  seen.add(value);
  const entries = [];
  for (const [k, v] of Object.entries(value)) {
    const c = cloneChecked(v, seen, false);
    if (c !== undefined) entries.push([k, c]);
  }
  seen.delete(value);
  return Object.fromEntries(entries);
};

const checkAssembly = (data) => {
  for (const f of ASSEMBLY_ARRAYS) {
    if (f in data && !Array.isArray(data[f])) return `${f} must be an array.`;
    if (Array.isArray(data[f])) for (const r of data[f]) if (!isPlain(r)) return `${f} must contain plain records.`;
  }
  if (data.assembly_schema_version !== undefined && data.assembly_schema_version !== 1)
    return `Unsupported assembly_schema_version: ${data.assembly_schema_version}`;
  return null;
};

const pickDraft = (project) => {
  const entries = [];
  for (const field of FOUNDATION_DRAFT_FIELDS) {
    if (!Object.hasOwn(project, field)) continue; // own-property only — no inherited fields
    const v = cloneChecked(project[field]);
    if (v !== undefined) entries.push([field, v]);
  }
  return Object.fromEntries(entries);
};

const validEnvelope = (raw, ownerId, sourceId, estimateId) => {
  let env;
  try { env = JSON.parse(raw); } catch { return { ok: false, message: "Stored draft is not valid JSON." }; }
  if (!isPlain(env)) return { ok: false, message: "Stored draft is not a record." };
  if (env.version !== 1) return { ok: false, message: "Unsupported draft version." };
  if (env.ownerId !== ownerId || env.sourceId !== sourceId || (env.estimateId ?? null) !== (estimateId ?? null))
    return { ok: false, message: "Stored draft context does not match." };
  if (!validId(env.token)) return { ok: false, message: "Missing draft token." };
  if (!validId(env.baseUpdatedAt)) return { ok: false, message: "Missing base revision." };
  if (typeof env.savedAt !== "string" || !Number.isFinite(Date.parse(env.savedAt))) return { ok: false, message: "Invalid savedAt timestamp." };
  if (!isPlain(env.data)) return { ok: false, message: "Draft data missing." };
  const bad = checkAssembly(env.data);
  if (bad) return { ok: false, message: bad };
  let data;
  try { data = pickDraft(env.data); } catch (e) { return { ok: false, message: String(e.message || e) }; }
  return { ok: true, env, data };
};

export function createFoundationDraftStore({ getStorage, ownerId, sourceId, estimateId = null }) {
  const unavailable = (msg) => ({ status: "unavailable", message: msg });
  const noAccess = () => ({ read: () => unavailable("No valid draft identity for this owner/source."), write: () => unavailable("No valid draft identity for this owner/source."), clear: () => unavailable("No valid draft identity for this owner/source.") });
  if (typeof getStorage !== "function") return noAccess();
  if (!validId(ownerId) || !validId(sourceId) || (estimateId !== null && !validId(estimateId))) return noAccess();
  const key = keyFor(ownerId, sourceId, estimateId);
  const storage = () => {
    try {
      const s = getStorage();
      if (!s || typeof s.getItem !== "function" || typeof s.setItem !== "function" || typeof s.removeItem !== "function")
        return { __err: "Storage provider returned no session storage." };
      return s;
    } catch (e) {
      // O-004 (CMP-A04) -- storage death/eviction: a storage throw classifies
      // the death/eviction (a quota/SecurityError = eviction; a thrown access =
      // death) vs a generic `__err` -- the tombstone names the class, never a
      // silent empty.
      const msg = String(e.message || e);
      const cls = /quota|exceeded|full/i.test(msg) ? "eviction" : "death";
      return { __err: `storage_${cls}: ${msg}` };
    }
  };
  const getItem = (s) => { try { return { raw: s.getItem(key) }; } catch (e) { return { err: `Draft read failed: ${e.message || e}` }; } };

  const read = () => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    const got = getItem(s);
    if (got.err) return unavailable(got.err);
    if (got.raw === null || got.raw === undefined) return { status: "empty" };
    if (got.raw.length > MAX_CHARS) return { status: "invalid", revision: got.raw, message: "Stored draft exceeds size limit." };
    const v = validEnvelope(got.raw, ownerId, sourceId, estimateId);
    if (!v.ok) return { status: "invalid", revision: got.raw, message: v.message };
    return { status: "found", revision: got.raw, draft: v.data, savedAt: v.env.savedAt, baseUpdatedAt: v.env.baseUpdatedAt, token: v.env.token };
  };

  const write = ({ project, baseUpdatedAt, token, savedAt, expectedRevision }) => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    try {
      if (!isPlain(project)) return { status: "invalid", message: "Draft needs a plain project record." };
      if (project.id !== sourceId) return { status: "invalid", message: `Draft project.id must equal sourceId (${sourceId}).` };
      if (!validId(token)) return { status: "invalid", message: "Draft token must be a nonempty string." };
      if (!validId(baseUpdatedAt)) return { status: "invalid", message: "baseUpdatedAt must be a nonempty string." };
      if (typeof savedAt !== "string" || !Number.isFinite(Date.parse(savedAt))) return { status: "invalid", message: "savedAt must be a valid ISO timestamp string." };
      const data = pickDraft(project);
      const bad = checkAssembly(data);
      if (bad) return { status: "invalid", message: bad };
      const envelope = { version: 1, ownerId, sourceId, estimateId: estimateId ?? null, token, baseUpdatedAt, savedAt, data };
      const serialized = JSON.stringify(envelope);
      if (serialized.length > MAX_CHARS) return { status: "invalid", message: "Draft exceeds 1,000,000 character limit; previous draft retained." };
      const got = getItem(s);
      if (got.err) return unavailable(got.err);
      if ((got.raw ?? null) !== (expectedRevision ?? null))
        return { status: "conflict", revision: got.raw ?? undefined, message: "Draft changed since expected revision; existing draft retained." };
      try { s.setItem(key, serialized); } catch (e) { return unavailable(`Draft write failed: ${e.message || e}`); }
      return { status: "stored", revision: serialized, draft: data };
    } catch (e) { return { status: "invalid", message: String(e.message || e) }; }
  };

  const clear = (expectedRevision) => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    const got = getItem(s);
    if (got.err) return unavailable(got.err);
    if (got.raw === null || got.raw === undefined) return { status: "removed" };
    if (got.raw !== expectedRevision) return { status: "retained", message: "Draft changed since expected revision; retained." };
    try { s.removeItem(key); } catch (e) { return unavailable(`Draft clear failed: ${e.message || e}`); }
    return { status: "removed" };
  };

  return { read, write, clear };
}
