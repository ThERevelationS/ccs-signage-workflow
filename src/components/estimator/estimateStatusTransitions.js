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

export function isEstimateStatusTransitionAllowed(fromStatus, toStatus) {
  const from = normalize(fromStatus);
  const to = normalize(toStatus);
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  // Unknown legacy statuses stay permissive rather than bricking old rows.
  if (!allowed) return true;
  return allowed.includes(to);
}

export function allowedEstimateStatusTransitions(fromStatus) {
  const from = normalize(fromStatus);
  return ALLOWED_TRANSITIONS[from] || [];
}

export function describeEstimateStatusTransition(fromStatus, toStatus) {
  return `${normalize(fromStatus)} → ${normalize(toStatus)}`;
}
