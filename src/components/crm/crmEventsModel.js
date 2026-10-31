// Pure model for the typed CRM event queue (CoreBridge "CRM Events"
// equivalent). Rows live on OpportunityActivity records whose event_type is
// one of the CRM taxonomy values below — audit-trail rows (created,
// stage_changed, ...) share the entity but are never CRM events.
// Dependency-free so it bundles cleanly under esbuild for tests.

// CoreBridge contact-event taxonomy, in the order its event-type list shows.
export const CRM_EVENT_TYPES = [
  "Call: Accounts Receivable",
  "Call: Collections",
  "Call: Estimate Follow Up",
  "Call: Install Scheduling",
  "Call: Post delivery follow up",
  "Call: Proof",
  "Call: Prospecting",
  "Call: Sales Follow Up",
  "Consultation",
  "E-Mail: Estimate",
  "E-Mail: Follow Up",
  "E-Mail: Information Request",
  "ReDo Work",
  "Visit: Installation",
  "Visit: Networking/Marketing",
  "Visit: Sales Appointment",
  "Visit: Sales Cold Call",
  "Visit: Sales Relationship",
  "Visit: Site Survey",
];

const CRM_TYPE_SET = new Set(CRM_EVENT_TYPES);

// Close-out results offered when marking an event complete. "cancelled" is a
// close without contact; the rest mirror CoreBridge call dispositions.
export const CRM_EVENT_OUTCOMES = [
  "completed",
  "no_answer",
  "left_message",
  "rescheduled",
  "cancelled",
];

const OUTCOME_LABELS = {
  completed: "Completed",
  cancelled: "Cancelled",
  no_answer: "No answer",
  left_message: "Left message",
  rescheduled: "Rescheduled",
};

const norm = (v) => String(v || "").trim().toLowerCase();

export function eventLabel(type) {
  const t = String(type || "").trim();
  return CRM_TYPE_SET.has(t) ? t : t || "Event";
}

export function outcomeLabel(outcome) {
  return OUTCOME_LABELS[norm(outcome)] || String(outcome || "").trim() || "—";
}

// True only for rows carrying a CRM taxonomy event_type — audit rows on the
// same entity never count as queue events.
export function isCrmEvent(activity) {
  return CRM_TYPE_SET.has(String(activity?.event_type || "").trim());
}

// Closed = explicitly completed/cancelled. A row with a completed_at stamp is
// closed regardless of outcome text; a "cancelled" outcome closes even if the
// stamp never landed.
export function isClosedEvent(activity) {
  if (!isCrmEvent(activity)) return false;
  if (String(activity?.completed_at || "").trim()) return true;
  const outcome = norm(activity?.outcome);
  return outcome === "completed" || outcome === "cancelled";
}

export function isOpenEvent(activity) {
  return isCrmEvent(activity) && !isClosedEvent(activity);
}

// Display name for the queue's Event column: explicit subject wins, else the
// typed label (CoreBridge "Event Name").
export function eventName(activity) {
  return String(activity?.subject || "").trim() || eventLabel(activity?.event_type);
}

const dueStamp = (activity) => {
  const raw = String(activity?.due_at || "").trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
};

// Overdue = open event whose due date already passed.
export function isOverdue(activity, now = new Date()) {
  const t = dueStamp(activity);
  return isOpenEvent(activity) && t !== null && t < now.getTime();
}

/**
 * Queue view over loaded activity rows.
 *   filters.type          — exact taxonomy value or "all"
 *   filters.assignedTo    — exact assigned_to value or "all"
 *   filters.search        — substring over contact/company/subject/notes/type
 *   filters.includeCompleted — when false (default), closed rows are hidden
 * Sort: due_at ascending, so overdue items float to the top; rows without a
 * due date always sort last.
 */
export function eventsForQueue(activities, filters = {}) {
  const rows = (Array.isArray(activities) ? activities : []).filter(isCrmEvent);
  const type = String(filters.type || "all").trim();
  const assignedTo = String(filters.assignedTo || "all").trim();
  const search = norm(filters.search);
  const includeCompleted = filters.includeCompleted === true;

  const filtered = rows.filter((a) => {
    if (!includeCompleted && isClosedEvent(a)) return false;
    if (type !== "all" && String(a?.event_type || "").trim() !== type) return false;
    if (assignedTo !== "all" && String(a?.assigned_to || "").trim() !== assignedTo) return false;
    if (search) {
      const hay = [
        a?.contact_name, a?.company_name, a?.subject, a?.notes, a?.event_type,
      ].map(norm).join("\n");
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    const ta = dueStamp(a);
    const tb = dueStamp(b);
    if (ta === null && tb === null) return String(a?.created_date || "").localeCompare(String(b?.created_date || ""));
    if (ta === null) return 1;
    if (tb === null) return -1;
    if (ta !== tb) return ta - tb;
    return String(a?.created_date || "").localeCompare(String(b?.created_date || ""));
  });
}

// Distinct assigned_to values across CRM events, for the salesperson filter.
export function distinctAssignees(activities) {
  const set = new Set();
  for (const a of Array.isArray(activities) ? activities : []) {
    if (!isCrmEvent(a)) continue;
    const v = String(a?.assigned_to || "").trim();
    if (v) set.add(v);
  }
  return [...set].sort((x, y) => x.localeCompare(y));
}

// The $set patch a Complete action writes. Closed rows get a stamp and a
// business-readable outcome; callers merge this into the conditional
// updateMany({id, updated_date}) write.
export function markEventCompletePatch(outcome = "completed", now = new Date()) {
  const clean = norm(outcome) || "completed";
  return {
    completed_at: now.toISOString(),
    outcome: clean,
  };
}

// Field payload for a new queue event. opportunity_id stays optional — a
// prospecting call predates any pursuit. summary mirrors the visible event
// name so audit consumers keep a human-readable line.
export function newCrmEventFields({ eventType, subject, contactName, contactId, companyName, customerId, opportunityId, workOrderId, assignedTo, dueAt, notes, source, actor } = {}) {
  const type = String(eventType || "").trim();
  if (!CRM_TYPE_SET.has(type)) {
    throw new Error(`Unknown CRM event type "${type || ""}".`);
  }
  const name = String(subject || "").trim() || eventLabel(type);
  return {
    event_type: type,
    subject: String(subject || "").trim(),
    summary: name,
    notes: String(notes || "").trim(),
    contact_name: String(contactName || "").trim(),
    contact_id: String(contactId || "").trim(),
    company_name: String(companyName || "").trim(),
    customer_id: String(customerId || "").trim(),
    opportunity_id: String(opportunityId || "").trim(),
    work_order_id: String(workOrderId || "").trim(),
    assigned_to: String(assignedTo || "").trim(),
    due_at: String(dueAt || "").trim(),
    completed_at: "",
    outcome: "",
    source: String(source || "manual").trim() || "manual",
    actor: String(actor || "").trim(),
  };
}
