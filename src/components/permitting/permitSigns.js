// Sign model for the permit setup wizard's AI plan step.
// planForm.signs = [{ type, units: [unit, ...] }] — at most ONE entry per
// type; count = units.length. Unit numbering (#1..#n across all types, in
// order) is what plan steps reference. Pure helpers — no React/SDK imports.

export const SIGN_TYPES = [
  { key: "channel_letters", label: "Channel letters", extras: ["letter_height_in"] },
  { key: "cabinet", label: "Cabinet / box sign", extras: [] },
  { key: "monument", label: "Monument", extras: ["overall_height_in"] },
  { key: "pylon", label: "Pylon / pole", extras: ["overall_height_in", "clearance_in"] },
  { key: "blade", label: "Blade / projecting", extras: ["projection_in", "clearance_in"] },
  { key: "wall_panel", label: "Wall panel / dimensional", extras: [] },
  { key: "window", label: "Window graphics", extras: [] },
  { key: "awning", label: "Awning / canopy", extras: ["projection_in"] },
  { key: "emc", label: "EMC / digital", extras: [] },
  { key: "banner", label: "Temporary banner", extras: [] },
  { key: "post_panel", label: "Post & panel", extras: ["overall_height_in"] },
  { key: "a_frame", label: "A-frame / portable", extras: [] },
  { key: "plaque", label: "Plaque / address numerals", extras: [] },
  { key: "other", label: "Other", extras: [] },
];

export const SIGN_TYPE_MAP = Object.fromEntries(SIGN_TYPES.map(t => [t.key, t]));

export const FREESTANDING = new Set(["monument", "pylon", "post_panel", "a_frame"]);
export const TEMPORARY = new Set(["banner", "a_frame"]);

export const SIGN_SCOPES = [
  { key: "new", label: "New sign" },
  { key: "reface", label: "Reface (new faces)" },
  { key: "repair", label: "Repair / retrofit" },
  { key: "removal", label: "Removal" },
  { key: "relocate", label: "Relocate" },
];
const SCOPE_KEYS = new Set(SIGN_SCOPES.map(s => s.key));
export const SCOPE_LABELS = Object.fromEntries(SIGN_SCOPES.map(s => [s.key, s.label]));

export const EXTRA_LABELS = {
  letter_height_in: "Letter height",
  overall_height_in: "Overall height",
  clearance_in: "Clearance",
  projection_in: "Projection",
};

let unitSeq = 0;
const nextUnitId = () => `u${++unitSeq}`;

const hasSize = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

// New unit for `type`; with `from`, clones it minus id/source_line/notes.
export function newUnit(type, from) {
  if (from && typeof from === "object") {
    return { ...from, id: nextUnitId(), source_line: "", notes: "" };
  }
  return {
    id: nextUnitId(),
    scope: "new",
    illuminated: type === "emc",
    electrical: type === "emc",
    faces: 1,
    width_in: null,
    height_in: null,
    letter_height_in: null,
    overall_height_in: null,
    clearance_in: null,
    projection_in: null,
    notes: "",
    source_line: "",
  };
}

// Backfills ids on units from older saves so React keys/updates stay stable.
export function ensureUnitIds(signs) {
  return (Array.isArray(signs) ? signs : []).map(entry => ({
    ...entry,
    units: (Array.isArray(entry?.units) ? entry.units : []).map(u => (u && u.id ? u : { ...u, id: nextUnitId() })),
  }));
}

// Set how many units a type has (0 removes the type); growing clones the last unit.
export function setTypeCount(signs, type, n) {
  const count = Math.max(0, Math.min(50, Math.floor(Number(n)) || 0));
  const list = Array.isArray(signs) ? signs : [];
  const idx = list.findIndex(e => e?.type === type);
  if (count === 0) return idx < 0 ? list.slice() : list.filter((_, i) => i !== idx);
  if (idx < 0) {
    return [...list, { type, units: Array.from({ length: count }, () => newUnit(type)) }];
  }
  const entry = list[idx];
  const units = (Array.isArray(entry.units) ? entry.units : []).slice(0, count);
  while (units.length < count) units.push(newUnit(type, units[units.length - 1]));
  const next = list.slice();
  next[idx] = { ...entry, units };
  return next;
}

// width × height / 144, times faces — null when a size is missing.
export function unitAreaSqFt(unit) {
  const w = Number(unit?.width_in);
  const h = Number(unit?.height_in);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return (w * h / 144) * (Number(unit?.faces) === 2 ? 2 : 1);
}

export function totalUnitCount(signs) {
  return (Array.isArray(signs) ? signs : [])
    .reduce((sum, e) => sum + (Array.isArray(e?.units) ? e.units.length : 0), 0);
}

const sanitizeSize = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 2000 ? n : null;
};

// AI scan output → signs entries. Unknown types → 'other', bad scopes → 'new',
// count clamped 1..50, sizes must be finite 0<x<2000 else null, faces only
// 1|2. Same type merges into one entry, preserving first-seen order.
export function mergeScannedSigns(aiSigns) {
  const out = [];
  const byType = new Map();
  for (const raw of Array.isArray(aiSigns) ? aiSigns : []) {
    if (!raw || typeof raw !== "object") continue;
    const type = SIGN_TYPE_MAP[raw.type] ? raw.type : "other";
    const count = Math.max(1, Math.min(50, Math.floor(Number(raw.count)) || 1));
    const scope = SCOPE_KEYS.has(raw.scope) ? raw.scope : "new";
    let entry = byType.get(type);
    if (!entry) {
      entry = { type, units: [] };
      byType.set(type, entry);
      out.push(entry);
    }
    for (let i = 0; i < count; i++) {
      entry.units.push({
        id: nextUnitId(),
        scope,
        illuminated: raw.illuminated === true,
        electrical: raw.electrical === true,
        faces: Number(raw.faces) === 2 ? 2 : 1,
        width_in: sanitizeSize(raw.width_in),
        height_in: sanitizeSize(raw.height_in),
        letter_height_in: sanitizeSize(raw.letter_height_in),
        overall_height_in: sanitizeSize(raw.overall_height_in),
        clearance_in: sanitizeSize(raw.clearance_in),
        projection_in: sanitizeSize(raw.projection_in),
        notes: String(raw.notes || "").slice(0, 300),
        source_line: String(raw.source_line || "").slice(0, 200),
      });
    }
  }
  return out;
}

// Derive the legacy flat inputs so old drafts and PermitWorkflowDesigner keep working.
export function legacyInputsFromSigns(signs) {
  const list = Array.isArray(signs) ? signs : [];
  const units = list.flatMap(e => (Array.isArray(e?.units) ? e.units : []));
  const signTypes = list
    .filter(e => (e?.units || []).length > 0)
    .map(e => `${SIGN_TYPE_MAP[e.type]?.label || e.type}${e.units.length > 1 ? ` ×${e.units.length}` : ""}`)
    .join(", ");
  const dimensions = units
    .map(u => (hasSize(u?.width_in) && hasSize(u?.height_in) ? `${u.width_in}×${u.height_in} in` : ""))
    .filter(Boolean)
    .join(", ");
  const firstScope = units[0]?.scope;
  return {
    signTypes,
    dimensions,
    illuminated: units.some(u => u?.illuminated === true),
    electricalWork: units.some(u => u?.electrical === true),
    freestanding: list.some(e => FREESTANDING.has(e?.type) && (e?.units || []).length > 0),
    emcDigital: list.some(e => e?.type === "emc" && (e?.units || []).length > 0),
    newVsReplacement: firstScope === "reface" ? "Face replacement" : firstScope === "repair" ? "Repair" : "New sign",
    temporaryVsPermanent: list.length > 0 && list.every(e => TEMPORARY.has(e?.type)) ? "Temporary" : "Permanent",
  };
}

// One numbered line per UNIT (#1..#n across all types) — plan steps cite these.
export function describeSignsForPrompt(signs) {
  const lines = [];
  let n = 0;
  for (const entry of Array.isArray(signs) ? signs : []) {
    const label = SIGN_TYPE_MAP[entry?.type]?.label || entry?.type || "Sign";
    for (const unit of Array.isArray(entry?.units) ? entry.units : []) {
      n += 1;
      const parts = [`scope: ${SCOPE_LABELS[unit?.scope] || "New sign"}`];
      if (unit?.illuminated) parts.push("illuminated");
      if (unit?.electrical) parts.push("electrical");
      if (hasSize(unit?.width_in) && hasSize(unit?.height_in)) parts.push(`${unit.width_in}" W × ${unit.height_in}" H`);
      if (hasSize(unit?.letter_height_in)) parts.push(`letter height ${unit.letter_height_in}"`);
      if (hasSize(unit?.overall_height_in)) parts.push(`overall height ${unit.overall_height_in}"`);
      if (hasSize(unit?.clearance_in)) parts.push(`clearance ${unit.clearance_in}"`);
      if (hasSize(unit?.projection_in)) parts.push(`projection ${unit.projection_in}"`);
      const faces = Number(unit?.faces) === 2 ? 2 : 1;
      parts.push(`${faces} face${faces === 2 ? "s" : ""}`);
      const area = unitAreaSqFt(unit);
      if (area != null) parts.push(`area ${area.toFixed(1)} sq ft`);
      if (unit?.source_line) parts.push(`from "${unit.source_line}"`);
      if (unit?.notes) parts.push(`notes: ${unit.notes}`);
      lines.push(`#${n} ${label} — ${parts.join("; ")}`);
    }
  }
  return lines.join("\n");
}

// Workspace credit exhaustion shows up as 402/"credits" — one honest message
// for both the estimate scan and the plan build.
export const AI_CREDITS_MESSAGE = "AI is unavailable right now: the Base44 workspace is out of integration credits.";
export function mapAiError(error) {
  const text = `${error?.message || ""} ${error?.status || ""} ${error?.statusCode || ""} ${error?.code || ""}`;
  if (/402|credit/i.test(text)) return new Error(AI_CREDITS_MESSAGE);
  return error instanceof Error ? error : new Error(String(error || "AI request failed"));
}
