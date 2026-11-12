// src/components/channelLetterInstall/channelInterviewModel.js
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

// src/components/channelLetterInstall/channelScopeBrief.js
var CHANNEL_BRIEF_VERSION = 1;
var FACT_MAP = {
  install_height_ft: { interview: "installation_height_feet", photo: "estimated_height_feet", scope: "installation_height_feet" },
  wall_material: { interview: "mounting_substrate", photo: "wall_material", scope: "wall_material" },
  installation_type: { interview: "installation_type", photo: "recommended_install_type", scope: "installation_type" },
  letter_height_in: { interview: "letter_height_inches", scope: "letter_height_inches" },
  qty_letters: { interview: "letter_count", scope: "qty_letters" },
  raceway_length_ft: { interview: "raceway_length_feet", scope: "raceway_length_feet" },
  poor_electrical: { scope: "poor_electrical_access", photoFlag: "poor_electrical_access" },
  thick_hollow_walls: { interview: "wall_construction", photoFlag: "thick_hollow_walls", scope: "thick_hollow_walls" },
  parapet: { photoFlag: "parapet", scope: "parapet" },
  poor_site_access: { interview: "poor_site_access", scope: "poor_site_access" }
};
var ASSUMPTION_FACTS = /* @__PURE__ */ new Set(["wall_material", "poor_electrical", "thick_hollow_walls", "parapet"]);
var num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
var eq = (a, b) => typeof a === "number" || typeof b === "number" ? num(a) !== null && num(b) !== null && Math.abs(num(a) - num(b)) < 1e-6 : String(a) === String(b);
function mergeChannelBriefSources({ interview, photo, scopeItems } = {}) {
  const answers = interview?.answers || interview || {};
  const items = Array.isArray(scopeItems) ? scopeItems : [];
  const facts = {};
  const put = (fact, value, origin, confidence) => {
    if (value === void 0 || value === null || value === "") return;
    (facts[fact] ||= { values: [] }).values.push({ origin, value, confidence: confidence || null });
  };
  for (const [fact, map] of Object.entries(FACT_MAP)) {
    if (map.interview) put(fact, answers[map.interview], "interview");
    if (map.photo && photo) {
      put(fact, photo[map.photo], "photo", photo.confidence || null);
    }
    if (map.photoFlag && photo?.site_conditions) {
      put(fact, photo.site_conditions[map.photoFlag], "photo", photo.confidence || null);
    }
    if (map.scope) {
      const seen = /* @__PURE__ */ new Set();
      items.forEach((it, i) => {
        const v = it?.[map.scope];
        const k = `${v}`;
        if (v === void 0 || v === null || seen.has(k)) return;
        seen.add(k);
        put(fact, v, `scope:${i}`);
      });
    }
  }
  const conflicts = [];
  for (const [fact, rec] of Object.entries(facts)) {
    const distinct = [];
    for (const v of rec.values) {
      if (!distinct.some((d) => eq(d.value, v.value))) distinct.push(v);
    }
    if (distinct.length > 1) {
      conflicts.push({ field: fact, values: distinct.map((d) => ({ origin: d.origin, value: d.value })) });
    }
  }
  return { version: CHANNEL_BRIEF_VERSION, facts, conflicts };
}
function calibrateChannelScale({ reference_object, reference_inches, measured_units } = {}) {
  const ri = num(reference_inches);
  const mu = num(measured_units);
  if (ri !== null && ri > 0 && mu !== null && mu > 0) {
    return { known: true, reference_object: reference_object || null, inches_per_unit: ri / mu };
  }
  return { known: false, reason: "no reference measurement recorded" };
}
function channelBriefProposal({ interview, photo, scopeItems, calibration, scale_unverified_accepted } = {}) {
  const merged = mergeChannelBriefSources({ interview, photo, scopeItems });
  const scale = calibrateChannelScale(calibration);
  const assumptions = [];
  for (const [fact, rec] of Object.entries(merged.facts)) {
    if (!ASSUMPTION_FACTS.has(fact)) continue;
    for (const v of rec.values) {
      assumptions.push({ field: fact, value: v.value, origin: v.origin, reason: "unverified on site" });
    }
  }
  const blocking = merged.conflicts.map((c) => c.field);
  if (!scale.known && scale_unverified_accepted !== true) blocking.push("scale");
  return {
    version: CHANNEL_BRIEF_VERSION,
    facts: merged.facts,
    conflicts: merged.conflicts,
    assumptions,
    scale,
    ready: blocking.length === 0,
    blocking
  };
}
export {
  CHANNEL_BRIEF_VERSION,
  CHANNEL_UNVERIFIED_ASSUMPTION_KEYS,
  calibrateChannelScale,
  channelBriefProposal,
  mergeChannelBriefSources
};
