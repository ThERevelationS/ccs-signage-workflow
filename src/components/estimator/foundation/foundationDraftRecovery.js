// Pure unsent browser-tab draft recovery for the foundation estimator.
// Owns sessionStorage envelope read/write/CAS-clear only — no page/router/auth logic.
export const FOUNDATION_DRAFT_FIELDS = [
  "project_name", "notes", "assembly_schema_version",
  "items", "walls", "poles", "wall_caps", "signage_cabinets", "selected_equipment", "landscape",
  "project_concrete_type", "project_concrete_admixtures", "excavation_method", "selected_concrete_id",
  "ai_engineering_recommendation", "ai_engineering_data",
  // O-104/O-105 — design-basis + site/hazard capture blocks.
  "design_basis", "site_hazard",
  // Customer Pricing tab surface — markup %, manual price override, and the
  // applied-tier record (applied/tier_number). Persisted by payload(); restored
  // verbatim through the assembly normalizer's passthrough.
  "customer_markup_percent", "customer_price_override", "customer_pricing",
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
  if (data.customer_pricing !== undefined && !isPlain(data.customer_pricing))
    return "customer_pricing must be a record.";
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
  // A loss marker is a small tombstone written when a draft could not be
  // stored (quota/size). It carries no data; read() surfaces it as invalid so
  // the page warns and offers Discard instead of losing the draft silently.
  if (env.draftLost === true) return { ok: true, env, lost: true };
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
    if (v.lost) return { status: "invalid", revision: got.raw, savedAt: v.env.savedAt, baseUpdatedAt: v.env.baseUpdatedAt, message: `A browser draft (saved ${v.env.savedAt}) could not be kept — the browser's per-tab storage refused to store it. Nothing was restored; the saved project is unchanged.` };
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
      const got = getItem(s);
      if (got.err) return unavailable(got.err);
      // Graceful-loss marker: when nothing is stored and a write cannot land
      // (size cap or quota throw), leave a small tombstone so the next open
      // warns and offers Discard instead of losing the draft silently. Never
      // clobber an existing stored draft — it is always more valuable.
      const leaveLossMarker = (bytes) => {
        try {
          const cur = getItem(s);
          if (cur.err || (cur.raw !== null && cur.raw !== undefined)) return false;
          const marker = JSON.stringify({ version: 1, ownerId, sourceId, estimateId: estimateId ?? null, token, baseUpdatedAt, savedAt, draftLost: true, droppedBytes: bytes });
          if (marker.length > MAX_CHARS) return false;
          s.setItem(key, marker);
          return true;
        } catch { return false; }
      };
      if (serialized.length > MAX_CHARS) {
        const marked = leaveLossMarker(serialized.length);
        return { status: "invalid", message: got.raw !== null && got.raw !== undefined
          ? "Draft exceeds 1,000,000 character limit; previous draft retained."
          : `Draft exceeds 1,000,000 character limit.${marked ? " A loss marker was stored so reopening this tab warns." : ""}` };
      }
      if ((got.raw ?? null) !== (expectedRevision ?? null))
        return { status: "conflict", revision: got.raw ?? undefined, message: "Draft changed since expected revision; existing draft retained." };
      try { s.setItem(key, serialized); } catch (e) {
        const marked = leaveLossMarker(serialized.length);
        const suffix = marked ? " A loss marker was stored so reopening this tab warns."
          : (got.raw !== null && got.raw !== undefined ? " The previously stored draft was retained." : "");
        return unavailable(`Draft write failed: ${e.message || e}${suffix}`);
      }
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

// ---------------------------------------------------------------------------
// Draft ↔ saved-source merge-conflict model (CMP-A04 tail).
// Pure comparison/summary helpers only — no storage, page, router, or entity
// logic. The dialog renders what each side holds; the store keeps its
// write/CAS-clear contract so a resolution never silently drops either side.
//
// Semantics that shape the model:
//   * A draft envelope anchors to the saved revision it was written against
//     (env.baseUpdatedAt). When that anchor no longer equals the record's
//     current updated_date, a concurrent save moved underneath the draft —
//     that is the only divergent-base signal a browser tab can ever see.
//   * Draft restore is an OVERLAY through the page's commit path
//     ({...current, ...draft}): fields the draft never recorded keep the
//     current editor values, so "saved has it, draft lacks it" is a
//     keep-saved-by-omission field — displayed, never counted as a conflict.
//   * There is no true three-way merge: the envelope stores the base revision
//     STRING, not the base content, so "who changed" cannot be proven per
//     field. Resolution choices are therefore honest whole-draft choices:
//     keep-draft (draft fields win on overlay), keep-saved (discard draft),
//     keep-both (saved stays open; the draft is re-anchored as a fresh offer).
// ---------------------------------------------------------------------------

// Same normalize/compare discipline as sourcePatchMatches — key-sorted,
// whitespace-normalized strings, 1e-6 numeric tolerance.
const normalizeDraftValue = (value) => {
  if (Array.isArray(value)) return value.map(normalizeDraftValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalizeDraftValue(value[key]);
    return out;
  }, {});
};

export function sameFoundationDraftValue(a, b) {
  const emptyA = a === undefined || a === null || a === "";
  const emptyB = b === undefined || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 0.000001;
  }
  if (typeof a === "string" && typeof b === "string") {
    return String(a).trim().replace(/\s+/g, " ") === String(b).trim().replace(/\s+/g, " ");
  }
  return JSON.stringify(normalizeDraftValue(a ?? null)) === JSON.stringify(normalizeDraftValue(b ?? null));
}

const DRAFT_FIELD_LABELS = {
  project_name: "Section name",
  notes: "Notes",
  assembly_schema_version: "Assembly schema",
  items: "Foundation items",
  walls: "Masonry walls",
  poles: "Poles",
  wall_caps: "Wall caps",
  signage_cabinets: "Signage cabinets",
  selected_equipment: "Equipment",
  landscape: "Site landscape",
  project_concrete_type: "Concrete type",
  project_concrete_admixtures: "Concrete admixtures",
  excavation_method: "Excavation method",
  selected_concrete_id: "Concrete supplier",
  ai_engineering_recommendation: "AI recommendation",
  ai_engineering_data: "AI review note",
  design_basis: "Design basis",
  site_hazard: "Site / hazard notes",
  customer_markup_percent: "Customer markup %",
  customer_price_override: "Customer price override",
  customer_pricing: "Applied pricing tier",
  concrete_cost_per_cy: "Concrete $/CY",
  rebar_cost_per_ft: "Rebar $/ft",
  forming_materials_cost_spread_foot: "Forming materials $ (spread foot)",
  forming_materials_cost_pillar: "Forming materials $ (pillar)",
  min_excavation_time_hours: "Min excavation hours",
  hand_dig_excavation_cost_per_cy: "Hand-dig excavation $/CY",
  equipment_excavation_cost_per_cy: "Equipment excavation $/CY",
  forming_labor_rate: "Forming labor rate",
  pouring_labor_rate: "Pouring labor rate",
  finishing_labor_rate: "Finishing labor rate",
  hand_dig_labor_rate: "Hand-dig labor rate",
  equipment_excavation_labor_rate: "Equipment excavation labor rate",
};

export function foundationDraftFieldLabel(field) {
  return DRAFT_FIELD_LABELS[field] || field;
}

const clip = (text, max = 56) => {
  const t = String(text);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const rowCountLabel = (field, n) => {
  const labels = {
    items: ["foundation item", "foundation items"],
    walls: ["wall", "walls"],
    poles: ["pole", "poles"],
    wall_caps: ["wall cap", "wall caps"],
    signage_cabinets: ["signage cabinet", "signage cabinets"],
    selected_equipment: ["equipment row", "equipment rows"],
    project_concrete_admixtures: ["admixture", "admixtures"],
  };
  const [one, many] = labels[field] || ["row", "rows"];
  return `${n} ${n === 1 ? one : many}`;
};

// Display-safe one-line summary of one side's value for a draft field. Never
// claims equality (the diff row carries that) — this is a shape/size hint so a
// reviewer can tell "3 items" from "2 items" and an applied tier from markup.
export function summarizeFoundationDraftField(field, value) {
  if (value === undefined) return { kind: "absent", text: "—" };
  if (value === null) return { kind: "value", text: "null" };
  if (Array.isArray(value)) return { kind: "rows", count: value.length, text: rowCountLabel(field, value.length) };
  if (typeof value === "object") {
    if (field === "landscape") {
      const cells = value.cells && typeof value.cells === "object" ? Object.keys(value.cells).length : 0;
      return { kind: "record", text: `landscape grid — ${cells} filled ${cells === 1 ? "cell" : "cells"}` };
    }
    if (field === "customer_pricing") {
      if (value.applied === true) {
        const tier = Number.isFinite(Number(value.tier_number)) ? `tier ${value.tier_number}` : "a pricing tier";
        return { kind: "record", text: `Applied ${tier}` };
      }
      return { kind: "record", text: "No tier applied" };
    }
    if (field === "ai_engineering_data") return { kind: "record", text: "AI review note (recorded)" };
    const keys = Object.keys(value).length;
    return { kind: "record", text: `record (${keys} ${keys === 1 ? "field" : "fields"})` };
  }
  if (typeof value === "boolean") return { kind: "value", text: value ? "yes" : "no" };
  return { kind: "value", text: clip(value) };
}

// Per-field diff over FOUNDATION_DRAFT_FIELDS — the union of keys present on
// either side. Status vocabulary:
//   same        — both sides equal (or both absent)
//   diverged    — both present with different values (a real conflict row)
//   draft_only  — draft recorded a value the saved record does not carry
//   saved_only  — saved record carries a value the draft never recorded;
//                 a draft restore OVERLAYS draft fields, so this value is
//                 untouched by either restore choice — displayed for honesty,
//                 never counted toward the conflict
export function diffFoundationDraftFields({ draft, saved }) {
  const safeDraft = isPlain(draft) ? draft : {};
  const safeSaved = isPlain(saved) ? saved : {};
  const rows = [];
  for (const field of FOUNDATION_DRAFT_FIELDS) {
    const hasDraft = Object.hasOwn(safeDraft, field);
    const hasSaved = Object.hasOwn(safeSaved, field);
    if (!hasDraft && !hasSaved) continue;
    const dv = hasDraft ? safeDraft[field] : undefined;
    const sv = hasSaved ? safeSaved[field] : undefined;
    let status;
    if (hasDraft && hasSaved) status = sameFoundationDraftValue(dv, sv) ? "same" : "diverged";
    else status = hasDraft ? "draft_only" : "saved_only";
    rows.push({
      field,
      label: foundationDraftFieldLabel(field),
      status,
      draft: summarizeFoundationDraftField(field, dv),
      saved: summarizeFoundationDraftField(field, sv),
    });
  }
  return rows;
}

// Whole-conflict summary. `saved` is the persisted/acknowledged project record
// (the side a CAS conflict or a moved draft anchor is judged against);
// `baseUpdatedAt`/`draftSavedAt` come off the draft envelope.
// Statuses:
//   in_sync              — anchor matches AND no field differences (draft is the
//                          saved baseline verbatim; nothing to resolve)
//   edits_only           — anchor matches, fields differ (ordinary unsent
//                          edits; the normal offer flow, not a merge conflict)
//   base_moved_identical — anchor stale but content identical to saved; only
//                          the anchor needs rebasing
//   conflict             — anchor stale AND >=1 diverged/draft_only field
//   unverifiable         — a side could not be compared (non-record draft, or
//                          no saved record supplied); the dialog shows what it
//                          can and never diffs blind
export function summarizeFoundationDraftConflict({ draft, saved, baseUpdatedAt = null, draftSavedAt = null } = {}) {
  const savedUpdatedAt = isPlain(saved) && typeof saved.updated_date === "string" ? saved.updated_date : null;
  const baseMoved = !!baseUpdatedAt && !!savedUpdatedAt && baseUpdatedAt !== savedUpdatedAt;
  const base = {
    baseUpdatedAt: baseUpdatedAt ?? null,
    savedUpdatedAt,
    draftSavedAt: draftSavedAt ?? null,
    baseMoved,
  };
  if (!isPlain(draft)) {
    return { ...base, status: "unverifiable", reason: "draft_unreadable", fields: [], counts: { diverged: 0, draftOnly: 0, savedOnly: 0, same: 0 } };
  }
  if (!isPlain(saved)) {
    return { ...base, status: "unverifiable", reason: "saved_unreadable", fields: [], counts: { diverged: 0, draftOnly: 0, savedOnly: 0, same: 0 } };
  }
  const fields = diffFoundationDraftFields({ draft, saved });
  const counts = fields.reduce((acc, row) => {
    if (row.status === "diverged") acc.diverged += 1;
    else if (row.status === "draft_only") acc.draftOnly += 1;
    else if (row.status === "saved_only") acc.savedOnly += 1;
    else acc.same += 1;
    return acc;
  }, { diverged: 0, draftOnly: 0, savedOnly: 0, same: 0 });
  const differs = counts.diverged + counts.draftOnly;
  const status = differs > 0
    ? (baseMoved ? "conflict" : "edits_only")
    : (baseMoved ? "base_moved_identical" : "in_sync");
  return { ...base, status, fields, counts };
}

// True when a conflict summary is a state the user should actively resolve
// rather than pass through the ordinary restore/discard offer.
export function foundationDraftConflictNeedsReview(summary) {
  return ["conflict", "base_moved_identical", "unverifiable"].includes(summary?.status);
}

// Build the project-shaped payload for a "keep both" re-anchor: the draft's
// recorded fields verbatim over the store's required identity. Writing this
// through store.write() re-bases the same draft content onto the CURRENT saved
// revision (baseUpdatedAt = the acknowledged updated_date), converting a
// stale-anchored draft into a fresh draft the reviewer explicitly chose to
// keep — it remains an ordinary restorable offer afterwards.
export function foundationDraftRebaseProject({ draft, sourceId } = {}) {
  if (!isPlain(draft) || !validId(sourceId)) return null;
  return { id: sourceId, ...cloneChecked(draft) };
}