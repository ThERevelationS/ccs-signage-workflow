// P-08 (WS-P): purchased-versus-fabricated alternatives + separate optional
// scopes. One set spec fans out into selectable alternatives (exactly one
// fabrication mode) plus independently-toggleable optional scopes
// (delivery/design/permit/electrical/removal). Resolution enforces the XOR —
// a proposal can never carry both fabrication modes — and nothing optional is
// included unless explicitly selected.
import { channelSetTakeoff } from "./channelSetTakeoff.js";

export const CHANNEL_ALTERNATIVES_VERSION = 1;
export const FABRICATION_MODES = ["purchased", "fabricated"];
export const OPTIONAL_SCOPE_KINDS = ["delivery", "design", "permit", "electrical_rough_in", "removal"];

// Build the alternative set: one scope per fabrication mode, each carrying
// its own takeoff so pricing/bom can be compared side by side.
export const channelAlternatives = (spec = {}, product = {}) => {
  const alternatives = FABRICATION_MODES.map((mode) => ({
    key: mode,
    fabrication: mode,
    spec: { ...spec, fabrication: mode },
    takeoff: channelSetTakeoff({ ...spec, fabrication: mode }, product),
  }));
  const optional_scopes = OPTIONAL_SCOPE_KINDS.map((kind) => ({
    key: kind,
    included: spec[`include_${kind}`] === true,
    unit_price: spec[`${kind}_price`] ?? null,
    description: spec[`${kind}_description`] || `${kind.replace(/_/g, " ")}`,
  }));
  return { version: CHANNEL_ALTERNATIVES_VERSION, alternatives, optional_scopes };
};

// Resolve a selection: {mode: 'purchased'|'fabricated', include: [...kinds]}
// -> the chosen alternative + enabled optional scopes. Invalid/absent mode
// fails closed; scopes not in `include` are never emitted.
export const resolveChannelScope = (altSet, selection = {}) => {
  const issues = [];
  const mode = selection.mode;
  if (!FABRICATION_MODES.includes(mode)) {
    issues.push({ kind: "missing", field: "mode", message: "Select purchased or fabricated — no default is assumed." });
    return { version: CHANNEL_ALTERNATIVES_VERSION, resolvable: false, issues, scope: null };
  }
  const alt = (altSet?.alternatives || []).find((a) => a.key === mode);
  if (!alt) {
    issues.push({ kind: "missing", field: "mode", message: `No '${mode}' alternative in the set.` });
    return { version: CHANNEL_ALTERNATIVES_VERSION, resolvable: false, issues, scope: null };
  }
  const include = new Set(Array.isArray(selection.include) ? selection.include : []);
  const scopes = (altSet?.optional_scopes || []).filter((s) => include.has(s.key));
  const bad = [...include].filter((k) => !OPTIONAL_SCOPE_KINDS.includes(k));
  for (const k of bad) issues.push({ kind: "unknown_scope", field: k, message: `Unknown optional scope '${k}' ignored.` });
  return {
    version: CHANNEL_ALTERNATIVES_VERSION,
    resolvable: true,
    issues,
    scope: { mode, spec: alt.spec, takeoff: alt.takeoff, optional_scopes: scopes },
  };
};
