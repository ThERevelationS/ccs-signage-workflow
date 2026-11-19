// src/components/channelLetterInstall/channelInterviewModel.js
var CHANNEL_INTERVIEW_VERSION = 1;
var CHANNEL_INSTALL_TYPES = [
  "flush_mount",
  "halo_lit",
  "raceway",
  "dimensional_lettering",
  "dimensional_lettering_with_backer"
];
var CHANNEL_LETTER_PURCHASE_TYPES = [
  "raceway",
  "channel_raceway_mounted",
  "channel_flush_mounted",
  "channel_halo_lit",
  "capsule_logo_pillbox",
  "dimensional_letters"
];
var CHANNEL_ILLUMINATION_TYPES = [
  "front_lit",
  "halo_lit",
  "front_and_halo",
  "unlit",
  "unknown"
];
var CHANNEL_ENVIRONMENTS = ["interior", "exterior"];
var CHANNEL_MOUNTING_SUBSTRATES = [
  "eifs",
  "brick",
  "concrete",
  "metal_panel",
  "wood",
  "stucco",
  "glass",
  "unknown"
];
var CHANNEL_ELECTRICAL_ACCESS = [
  "verified",
  "accessible_unverified",
  "poor",
  "none",
  "unknown"
];
var CHANNEL_UNVERIFIED_ASSUMPTION_KEYS = /* @__PURE__ */ new Set([
  "mounting_substrate",
  "wall_construction",
  "electrical_access",
  "electrical_scope",
  "structural_backing",
  "parapet_routing"
]);
var CHANNEL_INTERVIEW_FIELDS = [
  // — sign set content —
  { key: "letter_text", section: "sign_set", label: "Lettering text / copy", kind: "text", required: true },
  { key: "font_name", section: "sign_set", label: "Font / typeface", kind: "text" },
  { key: "artwork_ref", section: "sign_set", label: "Artwork / logo reference", kind: "text" },
  { key: "letter_count", section: "sign_set", label: "Letter count", kind: "integer", required: true, map: "item:qty_letters" },
  { key: "letter_height_inches", section: "sign_set", label: "Letter height (in)", kind: "number", required: true, map: "item:letter_height_inches" },
  { key: "letter_depth_inches", section: "sign_set", label: "Letter depth (in)", kind: "number" },
  { key: "letter_type", section: "sign_set", label: "Letter type", kind: "enum", options: CHANNEL_LETTER_PURCHASE_TYPES, required: true },
  { key: "faces_included", section: "sign_set", label: "Faces included", kind: "boolean" },
  { key: "returns_included", section: "sign_set", label: "Returns included", kind: "boolean" },
  { key: "backs_included", section: "sign_set", label: "Backs included", kind: "boolean" },
  { key: "illumination", section: "sign_set", label: "Illumination", kind: "enum", options: CHANNEL_ILLUMINATION_TYPES, required: true },
  { key: "finish_color", section: "sign_set", label: "Finish / color", kind: "text" },
  // — mounting —
  { key: "installation_type", section: "mounting", label: "Installation type", kind: "enum", options: CHANNEL_INSTALL_TYPES, required: true, map: "item:installation_type" },
  { key: "mounting_substrate", section: "mounting", label: "Mounting substrate / wall material", kind: "enum", options: CHANNEL_MOUNTING_SUBSTRATES, required: true, map: "item:wall_material" },
  { key: "wall_construction", section: "mounting", label: "Wall construction (thick/hollow)", kind: "boolean", map: "item:thick_hollow_walls" },
  { key: "structural_backing", section: "mounting", label: "Structural backing verified", kind: "boolean" },
  { key: "raceway_length_feet", section: "mounting", label: "Raceway length (ft)", kind: "number", map: "item:raceway_length_feet" },
  { key: "backer_panel", section: "mounting", label: "Backer panel", kind: "boolean" },
  // — electrical —
  { key: "illumination_powered", section: "electrical", label: "Electrical scope needed", kind: "boolean" },
  { key: "electrical_access", section: "electrical", label: "Electrical access", kind: "enum", options: CHANNEL_ELECTRICAL_ACCESS, required: true },
  { key: "electrical_scope", section: "electrical", label: "Electrical scope notes", kind: "text" },
  { key: "parapet_routing", section: "electrical", label: "Parapet electrical routing", kind: "enum", options: ["roof", "through_wall", "conduit", "none", "unknown"], map: "item:parapet_electrical_routing" },
  // — site / access —
  { key: "install_environment", section: "site", label: "Interior / exterior", kind: "enum", options: CHANNEL_ENVIRONMENTS, required: true, map: "project:install_environment" },
  { key: "site_address", section: "site", label: "Site address", kind: "text", map: "project:site_address" },
  { key: "installation_height_feet", section: "site", label: "Install height (ft)", kind: "number", required: true, map: "item:installation_height_feet" },
  { key: "poor_site_access", section: "site", label: "Restricted site access", kind: "boolean", map: "item:poor_site_access" },
  { key: "after_hours", section: "site", label: "After-hours / weekend work", kind: "boolean", map: "item:after_hours_weekend" }
];
var FIELD_BY_KEY = new Map(CHANNEL_INTERVIEW_FIELDS.map((f) => [f.key, f]));
var coerce = (f, v) => {
  if (v === void 0 || v === null || v === "") return null;
  if (f.kind === "number") {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (f.kind === "integer") {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && Number.isInteger(n) ? n : null;
  }
  if (f.kind === "boolean") return v === true || v === "true" ? true : v === false || v === "false" ? false : null;
  if (f.kind === "enum") return f.options.includes(String(v)) ? String(v) : null;
  const s = String(v).trim();
  return s ? s : null;
};
function sanitizeChannelInterview(raw) {
  const answers = {};
  for (const f of CHANNEL_INTERVIEW_FIELDS) answers[f.key] = coerce(f, raw?.[f.key]);
  return { version: CHANNEL_INTERVIEW_VERSION, answers };
}
function channelInterviewIssues(answers = {}) {
  const issues = [];
  for (const f of CHANNEL_INTERVIEW_FIELDS) {
    if (f.required && answers[f.key] === null) {
      issues.push({ kind: "missing", field: f.key, message: `${f.label} is required.` });
    }
  }
  if (answers.letter_count !== null && answers.letter_text && answers.letter_count !== answers.letter_text.trim().length) {
    issues.push({ kind: "conflict", field: "letter_count", message: `Letter count ${answers.letter_count} does not match the entered text (${answers.letter_text.trim().length} characters). Confirm which is authoritative.` });
  }
  const wantsRaceway = answers.installation_type === "raceway" || answers.letter_type === "raceway" || answers.letter_type === "channel_raceway_mounted";
  const racewayLen = Number(answers.raceway_length_feet);
  const hasRacewayLen = Number.isFinite(racewayLen) && racewayLen > 0;
  if (wantsRaceway && !hasRacewayLen) {
    issues.push({ kind: "conflict", field: "raceway_length_feet", message: "A raceway installation needs a raceway length." });
  }
  if (!wantsRaceway && hasRacewayLen) {
    issues.push({ kind: "conflict", field: "raceway_length_feet", message: "Raceway length is set on a non-raceway installation." });
  }
  const lit = ["front_lit", "halo_lit", "front_and_halo"].includes(answers.illumination) || answers.installation_type === "halo_lit" || answers.letter_type === "channel_halo_lit";
  if (lit && answers.electrical_access === "none") {
    issues.push({ kind: "conflict", field: "electrical_access", message: "An illuminated sign cannot have no electrical access \u2014 resolve the power plan." });
  }
  if (answers.illumination === "unlit" && ["channel_halo_lit", "halo_lit"].includes(answers.letter_type) || answers.illumination === "unlit" && answers.installation_type === "halo_lit") {
    issues.push({ kind: "conflict", field: "illumination", message: "Unlit selection conflicts with a halo-lit letter/install type." });
  }
  for (const key of CHANNEL_UNVERIFIED_ASSUMPTION_KEYS) {
    const f = FIELD_BY_KEY.get(key);
    if (f && answers[key] !== null && answers[key] !== "verified" && answers[key] !== "unknown") {
      issues.push({ kind: "unverified_assumption", field: key, message: `${f.label}: "${answers[key]}" is assumed \u2014 confirm on site.` });
    }
  }
  if (answers.electrical_access === "unknown") {
    issues.push({ kind: "unverified_assumption", field: "electrical_access", message: "Electrical access is unknown \u2014 the proposal must carry an explicit electrical allowance." });
  }
  return issues;
}
function channelInterviewToProjectDraft(answers = {}) {
  const project = {};
  const item = {};
  for (const f of CHANNEL_INTERVIEW_FIELDS) {
    const v = answers[f.key];
    if (v === null || v === void 0 || !f.map) continue;
    const [scope, field] = f.map.split(":");
    if (scope === "project") project[field] = v;
    else item[field] = v;
  }
  const descBits = [answers.letter_text, answers.font_name, answers.artwork_ref].filter(Boolean);
  if (descBits.length) item.description = descBits.join(" \u2014 ");
  if (answers.illumination && answers.illumination !== "unknown") item.illumination = answers.illumination;
  if (answers.letter_type) item.letter_type = answers.letter_type;
  if (answers.letter_depth_inches !== null) item.letter_depth_inches = answers.letter_depth_inches;
  if (answers.finish_color) item.finish_color = answers.finish_color;
  for (const k of ["faces_included", "returns_included", "backs_included", "backer_panel", "structural_backing", "illumination_powered"]) {
    if (answers[k] !== null) item[k] = answers[k];
  }
  if (answers.electrical_access && answers.electrical_access !== "unknown") item.poor_electrical_access = answers.electrical_access === "poor" || answers.electrical_access === "none";
  if (answers.electrical_scope) item.electrical_scope_notes = answers.electrical_scope;
  const assumptions = channelInterviewIssues(answers).filter((i) => i.kind === "unverified_assumption").map((i) => i.field);
  const draft = {
    interview_version: CHANNEL_INTERVIEW_VERSION,
    items: Object.keys(item).length ? [item] : []
  };
  for (const [k, v] of Object.entries(project)) draft[k] = v;
  if (assumptions.length) draft.unverified_assumptions = assumptions;
  return draft;
}
export {
  CHANNEL_ELECTRICAL_ACCESS,
  CHANNEL_ENVIRONMENTS,
  CHANNEL_ILLUMINATION_TYPES,
  CHANNEL_INSTALL_TYPES,
  CHANNEL_INTERVIEW_FIELDS,
  CHANNEL_INTERVIEW_VERSION,
  CHANNEL_LETTER_PURCHASE_TYPES,
  CHANNEL_MOUNTING_SUBSTRATES,
  CHANNEL_UNVERIFIED_ASSUMPTION_KEYS,
  channelInterviewIssues,
  channelInterviewToProjectDraft,
  sanitizeChannelInterview
};
