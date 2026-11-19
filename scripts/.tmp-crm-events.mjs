// src/components/crm/crmEventsModel.js
var CRM_EVENT_TYPES = [
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
  "Visit: Site Survey"
];
var CRM_TYPE_SET = new Set(CRM_EVENT_TYPES);
var CRM_EVENT_OUTCOMES = [
  "completed",
  "no_answer",
  "left_message",
  "rescheduled",
  "cancelled"
];
var OUTCOME_LABELS = {
  completed: "Completed",
  cancelled: "Cancelled",
  no_answer: "No answer",
  left_message: "Left message",
  rescheduled: "Rescheduled"
};
var norm = (v) => String(v || "").trim().toLowerCase();
function eventLabel(type) {
  const t = String(type || "").trim();
  return CRM_TYPE_SET.has(t) ? t : t || "Event";
}
function outcomeLabel(outcome) {
  return OUTCOME_LABELS[norm(outcome)] || String(outcome || "").trim() || "\u2014";
}
function isCrmEvent(activity) {
  return CRM_TYPE_SET.has(String(activity?.event_type || "").trim());
}
function isClosedEvent(activity) {
  if (!isCrmEvent(activity)) return false;
  if (String(activity?.completed_at || "").trim()) return true;
  const outcome = norm(activity?.outcome);
  return outcome === "completed" || outcome === "cancelled";
}
function isOpenEvent(activity) {
  return isCrmEvent(activity) && !isClosedEvent(activity);
}
function eventName(activity) {
  return String(activity?.subject || "").trim() || eventLabel(activity?.event_type);
}
var dueStamp = (activity) => {
  const raw = String(activity?.due_at || "").trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
};
function isOverdue(activity, now = /* @__PURE__ */ new Date()) {
  const t = dueStamp(activity);
  return isOpenEvent(activity) && t !== null && t < now.getTime();
}
function eventsForQueue(activities, filters = {}) {
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
        a?.contact_name,
        a?.company_name,
        a?.subject,
        a?.notes,
        a?.event_type
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
function distinctAssignees(activities) {
  const set = /* @__PURE__ */ new Set();
  for (const a of Array.isArray(activities) ? activities : []) {
    if (!isCrmEvent(a)) continue;
    const v = String(a?.assigned_to || "").trim();
    if (v) set.add(v);
  }
  return [...set].sort((x, y) => x.localeCompare(y));
}
function markEventCompletePatch(outcome = "completed", now = /* @__PURE__ */ new Date()) {
  const clean = norm(outcome) || "completed";
  return {
    completed_at: now.toISOString(),
    outcome: clean
  };
}
function newCrmEventFields({ eventType, subject, contactName, contactId, companyName, customerId, opportunityId, workOrderId, assignedTo, dueAt, notes, source, actor } = {}) {
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
    actor: String(actor || "").trim()
  };
}
export {
  CRM_EVENT_OUTCOMES,
  CRM_EVENT_TYPES,
  distinctAssignees,
  eventLabel,
  eventName,
  eventsForQueue,
  isClosedEvent,
  isCrmEvent,
  isOpenEvent,
  isOverdue,
  markEventCompletePatch,
  newCrmEventFields,
  outcomeLabel
};
