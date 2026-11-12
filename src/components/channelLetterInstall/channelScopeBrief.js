// P-03 (WS-P): unified brief/proposal workflow — merges the interview
// contract (P-02), the photo-estimate extract, and the AI scope items into ONE
// provenance-tracked fact set. Cross-source disagreements are explicit
// conflicts to resolve (never auto-merged); photo-derived wall/electrical/
// structural facts are ALWAYS unverified assumptions regardless of declared
// confidence; scale is `known` only from an authored reference measurement —
// a photo guess is not a measurement. `ready` fails closed until conflicts
// are resolved and scale is either known or explicitly accepted-unverified.
import { CHANNEL_UNVERIFIED_ASSUMPTION_KEYS } from "./channelInterviewModel";

export const CHANNEL_BRIEF_VERSION = 1;

// Canonical brief facts and which field each source calls them.
const FACT_MAP = {
  install_height_ft: { interview: "installation_height_feet", photo: "estimated_height_feet", scope: "installation_height_feet" },
  wall_material: { interview: "mounting_substrate", photo: "wall_material", scope: "wall_material" },
  installation_type: { interview: "installation_type", photo: "recommended_install_type", scope: "installation_type" },
  letter_height_in: { interview: "letter_height_inches", scope: "letter_height_inches" },
  qty_letters: { interview: "letter_count", scope: "qty_letters" },
  raceway_length_ft: { interview: "raceway_length_feet", scope: "raceway_length_feet" },
  poor_electrical: { scope: "poor_electrical_access", photoFlag: "poor_electrical_access" },
  thick_hollow_walls: { interview: "wall_construction", photoFlag: "thick_hollow_walls", scope: "thick_hollow_walls" },
  parapet: { photoFlag: "parapet", scope: "parapet" },
  poor_site_access: { interview: "poor_site_access", scope: "poor_site_access" },
};

// Facts whose values are structural/wall/electrical — any source claiming them
// records an explicit assumption until an operator confirms on site.
const ASSUMPTION_FACTS = new Set(["wall_material", "poor_electrical", "thick_hollow_walls", "parapet"]);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const eq = (a, b) => (typeof a === "number" || typeof b === "number")
  ? num(a) !== null && num(b) !== null && Math.abs(num(a) - num(b)) < 1e-6
  : String(a) === String(b);

// Merge the three intake sources into provenance-tracked facts.
export function mergeChannelBriefSources({ interview, photo, scopeItems } = {}) {
  const answers = interview?.answers || interview || {};
  const items = Array.isArray(scopeItems) ? scopeItems : [];
  const facts = {};
  const put = (fact, value, origin, confidence) => {
    if (value === undefined || value === null || value === "") return;
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
      // Multiple scope items may agree or disagree — each contributes a source
      // entry so disagreement stays visible instead of collapsing silently.
      const seen = new Set();
      items.forEach((it, i) => {
        const v = it?.[map.scope];
        const k = `${v}`;
        if (v === undefined || v === null || seen.has(k)) return;
        seen.add(k);
        put(fact, v, `scope:${i}`);
      });
    }
  }
  // Facts with ≥2 DISTINCT values = unresolved conflicts.
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

// Known-scale calibration: a real reference measurement (an object of known
// real size measured in the photo/site units) marks scale known. No authored
// reference => scale stays unknown; it never derives from a photo estimate.
export function calibrateChannelScale({ reference_object, reference_inches, measured_units } = {}) {
  const ri = num(reference_inches); const mu = num(measured_units);
  if (ri !== null && ri > 0 && mu !== null && mu > 0) {
    return { known: true, reference_object: reference_object || null, inches_per_unit: ri / mu };
  }
  return { known: false, reason: "no reference measurement recorded" };
}

// The proposal envelope: merged facts + conflicts + assumptions + scale gate.
export function channelBriefProposal({ interview, photo, scopeItems, calibration, scale_unverified_accepted } = {}) {
  const merged = mergeChannelBriefSources({ interview, photo, scopeItems });
  const scale = calibrateChannelScale(calibration);
  const assumptions = [];
  for (const [fact, rec] of Object.entries(merged.facts)) {
    if (!ASSUMPTION_FACTS.has(fact)) continue;
    for (const v of rec.values) {
      // AI-sourced wall/electrical/structural facts are unverified by
      // definition; interview claims of these facts also carry the flag until
      // an operator confirms on site (P-03 explicit-assumption contract).
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
    blocking,
  };
}

export { CHANNEL_UNVERIFIED_ASSUMPTION_KEYS };
