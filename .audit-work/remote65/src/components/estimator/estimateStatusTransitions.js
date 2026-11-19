// Estimate status state machine. The status dropdown used to offer every
// status from every state, so a draft could jump straight to "approved"
// without ever being sent — skipping quote issuance, delivery evidence, and
// the lifecycle revision record. Transitions are now explicit:
//
//   draft/calculated → sent (quote issued) → approved (accepted)
//   anything active  → archived / cancelled
//   archived         → draft (unarchive)
//   approved         → sent (reopen)
//   cancelled        → terminal
//
// Non-status saves are unaffected — the check only runs when status changes.
const ALLOWED_TRANSITIONS = {
  draft: ["calculated", "sent", "archived", "cancelled"],
  calculated: ["draft", "sent", "archived", "cancelled"],
  sent: ["approved", "archived", "cancelled"],
  approved: ["sent"],
  archived: ["draft"],
  cancelled: [],
};

const normalize = (status) => String(status || "draft").trim().toLowerCase() || "draft";

// Custom statuses (#493): QuoteDefaults carries `custom_statuses` (JSON list
// of extra status slugs) and `status_transitions` (JSON {from:[to,...]}).
// They merge over the baked enum so shops can add e.g. "on_hold" /
// "awaiting_permit" / "in_production" with their own allowed moves.
export function statusTransitionMap(customStatuses = [], statusTransitions = null) {
  const map = {};
  for (const key of Object.keys(ALLOWED_TRANSITIONS)) map[key] = [...ALLOWED_TRANSITIONS[key]];
  const extras = Array.isArray(customStatuses) ? customStatuses : [];
  for (const raw of extras) {
    const s = normalize(raw);
    if (s && !map[s]) map[s] = []; // custom status starts with no outgoing edges until configured
  }
  const overrides = statusTransitions && typeof statusTransitions === "object" ? statusTransitions : {};
  for (const [fromKey, toList] of Object.entries(overrides)) {
    const f = normalize(fromKey);
    if (!f) continue;
    map[f] = (Array.isArray(toList) ? toList : []).map(normalize).filter(Boolean);
    for (const t of map[f]) if (t && !map[t]) map[t] = [];
  }
  return map;
}

export function allEstimateStatuses(customStatuses = []) {
  const base = Object.keys(ALLOWED_TRANSITIONS);
  const extras = (Array.isArray(customStatuses) ? customStatuses : []).map(normalize).filter((s) => s && !base.includes(s));
  return [...base, ...extras];
}

export function isEstimateStatusTransitionAllowed(fromStatus, toStatus, transitions = null) {
  const from = normalize(fromStatus);
  const to = normalize(toStatus);
  if (from === to) return true;
  const map = transitions && typeof transitions === "object" ? transitions : ALLOWED_TRANSITIONS;
  const allowed = map[from];
  // Unknown legacy statuses stay permissive rather than bricking old rows.
  if (!allowed) return true;
  return allowed.includes(to);
}

export function allowedEstimateStatusTransitions(fromStatus, transitions = null) {
  const from = normalize(fromStatus);
  const map = transitions && typeof transitions === "object" ? transitions : ALLOWED_TRANSITIONS;
  return map[from] || [];
}

export function describeEstimateStatusTransition(fromStatus, toStatus) {
  return `${normalize(fromStatus)} → ${normalize(toStatus)}`;
}
