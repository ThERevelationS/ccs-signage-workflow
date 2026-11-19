// Pure model for the TYPED CRM event queue (masterplan G-05).
//
// Rows live on OpportunityActivity records. Typed events carry
// `event_type_id` (FK -> CrmEventType) + due_at/assigned_to/completed_at/
// completed_by/status; legacy queue rows only carry the string `event_type`
// taxonomy value (see crmEventsModel.js) and resolve to a type by
// channel+label alias where possible. Audit rows (created, stage_changed,
// ...) share the entity but are never queue events.
//
// Dependency-free (only imports the sibling pure model via a relative path
// so it bundles cleanly under esbuild for Node tests).

import { CRM_EVENT_TYPES } from "./crmEventsModel";

// Canonical label for the auto follow-up suggestion type (A-12 seed taxonomy
// carries it as "Estimate Follow Up"; G-05/G-06 reference EstimateFollowUp).
export const FOLLOW_UP_TYPE_LABEL = "EstimateFollowUp";

// Queue grouping, in display order. `completed` is appended by
// groupQueueRows only when closed rows are present.
export const QUEUE_GROUP_ORDER = ["overdue", "today", "upcoming", "nodate"];
export const QUEUE_GROUPS = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  nodate: "No date",
  completed: "Completed",
};

const DAY_MS = 86400000;

const str = (v) => String(v || "").trim();
const norm = (v) => str(v).toLowerCase();
// Label comparison that ignores case, spaces and punctuation so
// "Estimate Follow Up" === "EstimateFollowUp".
const normLabel = (v) => norm(v).replace(/[^a-z0-9]+/g, "");

const parseStamp = (v) => {
  const raw = str(v);
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
};

const sameLocalDay = (aMs, bMs) => {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const nowMs = (now) => {
  const t = now instanceof Date ? now.getTime() : parseStamp(now);
  return Number.isFinite(t) ? t : Date.now();
};

// ---------------------------------------------------------------------------
// Event-type registry
// ---------------------------------------------------------------------------

// Legacy string taxonomy -> {channel,label} aliases aligned with the A-12
// CrmEventType seed (11 condensed types vs 19 legacy strings). A legacy row
// resolves to a typed id whenever a type with the aliased channel+label
// (or label alone) exists; otherwise it stays a queue event with type_id "".
const LEGACY_TYPE_ALIAS = {
  "Call: Accounts Receivable": { channel: "call", label: "AR/Collections" },
  "Call: Collections": { channel: "call", label: "AR/Collections" },
  "Call: Estimate Follow Up": { channel: "call", label: "Estimate Follow Up" },
  "Call: Install Scheduling": { channel: "call", label: "Install Scheduling" },
  "Call: Post delivery follow up": { channel: "call", label: "Post Delivery Follow Up" },
  "Call: Proof": { channel: "call", label: "Proof" },
  "Call: Prospecting": { channel: "call", label: "Prospecting" },
  "Call: Sales Follow Up": { channel: "call", label: "Sales Follow Up" },
  "Consultation": { channel: "consultation", label: "General" },
  "E-Mail: Estimate": { channel: "email", label: "Estimate" },
  "E-Mail: Follow Up": { channel: "email", label: "Follow Up" },
  "E-Mail: Information Request": { channel: "email", label: "Information Request" },
  "ReDo Work": { channel: "redo", label: "Redo" },
  "Visit: Installation": { channel: "visit", label: "Installation" },
  "Visit: Networking/Marketing": { channel: "visit", label: "Networking/Marketing" },
  "Visit: Sales Appointment": { channel: "visit", label: "Sales" },
  "Visit: Sales Cold Call": { channel: "visit", label: "Cold Call" },
  "Visit: Sales Relationship": { channel: "visit", label: "Relationship" },
  "Visit: Site Survey": { channel: "visit", label: "Site Survey" },
};

const LEGACY_TYPE_SET = new Set(CRM_EVENT_TYPES);

// OpportunityActivity.event_type enum values that are audit-trail rows, not
// queue events. Anything outside this set + the legacy CRM strings can only
// be a type label written as event_type — still a queue event.
const AUDIT_EVENT_TYPES = new Set([
  "created", "updated", "stage_changed", "linked_work_order",
  "estimate_requested", "estimate_attached", "estimate_status_changed",
  "estimator_assigned", "reconciled", "note",
]);

// "Call: Estimate Follow Up" -> channel "call"; "E-Mail:" -> "email".
const CHANNEL_PREFIXES = { call: "call", "e-mail": "email", email: "email", visit: "visit" };
function channelOfEventType(eventType) {
  const t = str(eventType);
  if (!t) return "";
  const alias = LEGACY_TYPE_ALIAS[t];
  if (alias) return alias.channel;
  const idx = t.indexOf(":");
  if (idx > 0) {
    const prefix = CHANNEL_PREFIXES[norm(t.slice(0, idx))];
    if (prefix) return prefix;
  }
  if (norm(t) === "consultation") return "consultation";
  if (norm(t) === "redo work" || norm(t) === "redo") return "redo";
  return "";
}

// Index CrmEventType rows three ways: by id, by normalized label, and by
// normalized channel|label. Archived types stay in the index so existing
// rows still render their label; eventTypeOptions() filters them for pickers.
export function indexEventTypes(eventTypes) {
  const byId = new Map();
  const byLabel = new Map();
  const byChannelLabel = new Map();
  for (const t of Array.isArray(eventTypes) ? eventTypes : []) {
    const id = str(t?.id);
    const label = str(t?.label);
    const channel = norm(t?.channel);
    if (!id && !label) continue;
    const entry = { id, label, channel, sort: Number(t?.sort) || 0, is_custom: t?.is_custom === true, status: norm(t?.status) || "active" };
    if (id) byId.set(id, entry);
    const nl = normLabel(label);
    if (nl && !byLabel.has(nl)) byLabel.set(nl, entry);
    const key = `${channel}|${nl}`;
    if (nl && !byChannelLabel.has(key)) byChannelLabel.set(key, entry);
  }
  return { byId, byLabel, byChannelLabel };
}

// Active types in picker order (sort asc, then label) for selects/forms.
export function eventTypeOptions(eventTypes) {
  const idx = indexEventTypes(eventTypes);
  const out = [];
  const seen = new Set();
  for (const t of idx.byId.values()) {
    if (t.status !== "active") continue;
    if (seen.has(t.id || t.label)) continue;
    seen.add(t.id || t.label);
    out.push({ id: t.id, label: t.label, channel: t.channel, sort: t.sort, is_custom: t.is_custom });
  }
  return out.sort((a, b) => (a.sort - b.sort) || a.label.localeCompare(b.label));
}

// Resolve one raw activity to its typed identity, or null when the row is
// not a CRM queue event (audit rows, blank types).
function resolveEventType(activity, idx) {
  const typeId = str(activity?.event_type_id);
  if (typeId) {
    const t = idx.byId.get(typeId);
    // Unknown/deleted type: fall back to the raw event_type, but never
    // surface an audit value ("note") as the type label.
    const rawType = str(activity?.event_type);
    const fallback = rawType && !AUDIT_EVENT_TYPES.has(norm(rawType)) ? rawType : "Event";
    return {
      type_id: typeId,
      type_label: t?.label || fallback,
      channel: t?.channel || channelOfEventType(activity?.event_type),
    };
  }
  const raw = str(activity?.event_type);
  if (!raw) return null;
  // Direct label hit — covers custom types written with label-valued
  // event_type strings and the compact "EstimateFollowUp" form.
  const byLabel = idx.byLabel.get(normLabel(raw));
  if (byLabel) return { type_id: byLabel.id, type_label: byLabel.label, channel: byLabel.channel };
  // Legacy taxonomy string -> alias channel+label -> type lookup.
  const alias = LEGACY_TYPE_ALIAS[raw];
  if (alias) {
    const key = `${alias.channel}|${normLabel(alias.label)}`;
    const t = idx.byChannelLabel.get(key) || idx.byLabel.get(normLabel(alias.label));
    if (t) return { type_id: t.id, type_label: t.label, channel: t.channel };
    return { type_id: "", type_label: alias.label, channel: alias.channel };
  }
  if (LEGACY_TYPE_SET.has(raw)) {
    return { type_id: "", type_label: raw, channel: channelOfEventType(raw) };
  }
  // Any other non-audit event_type can only be a type label written without
  // a registry hit — still a queue event.
  if (!AUDIT_EVENT_TYPES.has(norm(raw))) {
    return { type_id: "", type_label: raw, channel: channelOfEventType(raw) };
  }
  return null;
}

// True when a raw OpportunityActivity row belongs in the typed queue:
// carries a type FK, a type label, or a legacy CRM taxonomy event_type.
export function isQueueEvent(activity, eventTypes) {
  return resolveEventType(activity, indexEventTypes(eventTypes)) !== null;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

// Closed = completed_by or completed_at stamped, status "completed", or a
// terminal outcome (completed/cancelled — mirrors legacy isClosedEvent).
export function isEventComplete(row) {
  if (!row) return false;
  if (str(row.completed_by)) return true;
  if (str(row.completed_at)) return true;
  if (norm(row.status) === "completed") return true;
  const outcome = norm(row.outcome || row?.details?.outcome);
  return outcome === "completed" || outcome === "cancelled";
}

// $set payload a Complete action writes (G-05 contract):
// {completed_at: ISO, completed_by, status: 'completed'} — plus outcome when
// the caller supplies one. `now` is injectable for tests.
export function completeEventPayload({ row, userEmail, now, outcome } = {}) {
  const stamp = now instanceof Date ? now : (parseStamp(now) ? new Date(now) : new Date());
  const payload = {
    completed_at: stamp.toISOString(),
    completed_by: str(userEmail),
    status: "completed",
  };
  const clean = norm(outcome);
  if (clean) payload.outcome = clean;
  return payload;
}

// ---------------------------------------------------------------------------
// Row normalization
// ---------------------------------------------------------------------------

// Display name for an assignee: match User rows by email -> full_name.
export function resolveAssigneeName(assignee, users) {
  const raw = str(assignee);
  if (!raw) return "";
  for (const u of Array.isArray(users) ? users : []) {
    if (norm(u?.email) === norm(raw)) return str(u?.full_name) || raw;
    if (norm(u?.full_name) === norm(raw)) return str(u?.full_name) || raw;
  }
  return raw;
}

/**
 * Normalize raw OpportunityActivity rows into queue rows:
 *   {id, type_id, type_label, channel, title, customer_name, contact_name,
 *    customer_id, opportunity_id, work_order_id, estimate_id, due_at,
 *    assignee, assignee_name, overdue, open, status, outcome, notes,
 *    created_at, completed_at, completed_by, source, suggestion, raw}
 * By default only OPEN events are returned; pass includeCompleted to keep
 * closed rows for the "show completed" view.
 */
export function queueRows(activities, { eventTypes = [], users = [], now, includeCompleted = false } = {}) {
  const idx = indexEventTypes(eventTypes);
  const at = nowMs(now);
  const out = [];
  for (const a of Array.isArray(activities) ? activities : []) {
    const type = resolveEventType(a, idx);
    if (!type) continue;
    const complete = isEventComplete(a);
    if (complete && !includeCompleted) continue;
    const dueMs = parseStamp(a?.due_at);
    const assignee = str(a?.assigned_to);
    const typeLabel = type.type_label || "Event";
    const estimateId = str(a?.estimate_id || a?.details?.estimate_id);
    out.push({
      id: str(a?.id),
      type_id: type.type_id,
      type_label: typeLabel,
      channel: type.channel,
      title: str(a?.subject) || typeLabel,
      customer_name: str(a?.company_name) || str(a?.contact_name),
      contact_name: str(a?.contact_name),
      customer_id: str(a?.customer_id),
      opportunity_id: str(a?.opportunity_id),
      work_order_id: str(a?.work_order_id),
      estimate_id: estimateId,
      due_at: str(a?.due_at),
      assignee,
      assignee_name: resolveAssigneeName(assignee, users),
      overdue: !complete && dueMs !== null && dueMs < at,
      open: !complete,
      status: str(a?.status) || (complete ? "completed" : "open"),
      outcome: str(a?.outcome || a?.details?.outcome),
      notes: str(a?.notes),
      created_at: str(a?.created_date || a?.created_at),
      completed_at: str(a?.completed_at),
      completed_by: str(a?.completed_by),
      source: str(a?.source) || "manual",
      suggestion: false,
      raw: a,
    });
  }
  return out;
}

// Distinct assignee values across queue rows for the salesperson filter.
export function distinctQueueAssignees(rows) {
  const set = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    const v = str(r?.assignee ?? r?.assigned_to);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Filter / sort / group
// ---------------------------------------------------------------------------

/**
 *   filters.salesperson — assignee (or resolved name), case-insensitive
 *   filters.typeId      — matches row.type_id OR row.type_label so both
 *                         typed ids and label-valued filters work
 *   filters.overdueOnly — keep only open rows past due_at
 *   filters.openOnly    — drop completed rows
 * Order is preserved; callers wanting queue order chain sortQueue().
 */
export function filterQueue(rows, { salesperson, typeId, overdueOnly = false, openOnly = false, now } = {}) {
  const who = norm(salesperson);
  const typeKey = normLabel(typeId);
  const at = nowMs(now);
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    if (!r) return false;
    if (openOnly && isEventComplete(r)) return false;
    if (who && norm(r.assignee ?? r.assigned_to) !== who && norm(r.assignee_name) !== who) return false;
    if (typeKey && normLabel(r.type_id) !== typeKey && normLabel(r.type_label) !== typeKey) return false;
    if (overdueOnly) {
      const od = typeof r.overdue === "boolean"
        ? r.overdue
        : !isEventComplete(r) && parseStamp(r.due_at) !== null && parseStamp(r.due_at) < at;
      if (!od) return false;
    }
    return true;
  });
}

// Queue order: overdue first (earliest due first), then due_at ascending,
// undated rows last; ties fall back to created_at then title. Non-mutating.
export function sortQueue(rows, { now } = {}) {
  const at = nowMs(now);
  const rank = (r) => {
    const due = parseStamp(r?.due_at);
    const od = typeof r?.overdue === "boolean"
      ? r.overdue
      : !isEventComplete(r) && due !== null && due < at;
    return od ? 0 : 1;
  };
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = parseStamp(a?.due_at);
    const tb = parseStamp(b?.due_at);
    if (ta === null && tb !== null) return 1;
    if (ta !== null && tb === null) return -1;
    if (ta !== null && tb !== null && ta !== tb) return ta - tb;
    const ca = parseStamp(a?.created_at) ?? parseStamp(a?.created_date) ?? 0;
    const cb = parseStamp(b?.created_at) ?? parseStamp(b?.created_date) ?? 0;
    if (ca !== cb) return ca - cb;
    return str(a?.title).localeCompare(str(b?.title));
  });
}

// Bucket rows into the display groups: Overdue / Today / Upcoming / No date,
// plus a trailing Completed bucket when closed rows are present.
export function groupQueueRows(rows, { now } = {}) {
  const at = nowMs(now);
  const groups = { overdue: [], today: [], upcoming: [], nodate: [], completed: [] };
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    if (isEventComplete(r)) {
      groups.completed.push(r);
      continue;
    }
    const due = parseStamp(r.due_at);
    if (due === null) {
      groups.nodate.push(r);
    } else if (due < at) {
      groups.overdue.push(r);
    } else if (sameLocalDay(due, at)) {
      groups.today.push(r);
    } else {
      groups.upcoming.push(r);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Create + suggestion payloads
// ---------------------------------------------------------------------------

// Reverse-map a {channel,label} back to its legacy enum-safe event_type
// string ("call"+"Estimate Follow Up" -> "Call: Estimate Follow Up").
// OpportunityActivity.event_type is a required enum, so typed events whose
// type has no legacy counterpart fall back to "note" — the real typing rides
// on event_type_id.
export function legacyEventTypeFor(channel, label) {
  const ch = norm(channel);
  const nl = normLabel(label);
  for (const [eventType, alias] of Object.entries(LEGACY_TYPE_ALIAS)) {
    if (alias.channel === ch && normLabel(alias.label) === nl) return eventType;
  }
  return "";
}

/**
 * Entity field payload for a new typed queue event (what onCreate consumers
 * persist through staffEntityWrite). title falls back to the type label;
 * summary mirrors the visible name for audit consumers.
 */
export function buildCreateEventFields({ typeId, typeLabel, channel, title, dueAt, assignee, actor, customerId, customerName, contactName, estimateId, opportunityId, workOrderId, notes, source } = {}) {
  const label = str(typeLabel) || "Event";
  const name = str(title) || label;
  const ch = norm(channel);
  const fields = {
    event_type_id: str(typeId),
    event_type: legacyEventTypeFor(ch, label) || "note",
    subject: str(title),
    summary: name,
    notes: str(notes),
    company_name: str(customerName),
    contact_name: str(contactName),
    customer_id: str(customerId),
    opportunity_id: str(opportunityId),
    work_order_id: str(workOrderId),
    assigned_to: str(assignee),
    due_at: str(dueAt),
    completed_at: "",
    completed_by: "",
    outcome: "",
    status: "open",
    source: str(source) || "manual",
    actor: str(actor),
  };
  if (str(estimateId)) fields.details = { estimate_id: str(estimateId) };
  return fields;
}

// ---------------------------------------------------------------------------
// Follow-up suggestions (G-05/G-06)
// ---------------------------------------------------------------------------

// True for labels like "Estimate Follow Up" / "EstimateFollowUp" /
// "Call: Estimate Follow Up" — needs both words, so plain "Follow Up"
// and "E-Mail: Estimate" do not qualify.
export function isEstimateFollowUpLabel(label) {
  const nl = normLabel(label);
  return nl.includes("estimate") && nl.includes("follow");
}

// The CrmEventType row backing follow-up suggestions (lowest sort wins).
export function followUpEventType(eventTypes) {
  const matches = eventTypeOptions(eventTypes).filter((t) => isEstimateFollowUpLabel(t.label));
  return matches[0] || null;
}

function isFollowUpEvent(ev, idx) {
  if (!ev) return false;
  if (isEstimateFollowUpLabel(ev?.type_label)) return true;
  if (isEstimateFollowUpLabel(ev?.event_type)) return true;
  if (isEstimateFollowUpLabel(ev?.subject) && !str(ev?.event_type)) return true;
  const tid = str(ev?.type_id || ev?.event_type_id);
  const t = tid ? idx?.byId.get(tid) : null;
  return !!(t && isEstimateFollowUpLabel(t.label));
}

// Does this event reference the given estimate? Links checked in order:
// explicit estimate_id (top-level or details), shared opportunity_id,
// shared work_order_id, then estimate-number text match as a last resort.
function eventTouchesEstimate(ev, est) {
  const estId = str(est?.id);
  if (estId && str(ev?.estimate_id || ev?.details?.estimate_id) === estId) return true;
  const evOpp = str(ev?.opportunity_id);
  const estOpp = str(est?.opportunity_id);
  if (evOpp && estOpp && evOpp === estOpp) return true;
  const evWo = str(ev?.work_order_id);
  const estWo = str(est?.work_order_id);
  if (evWo && estWo && evWo === estWo) return true;
  const num = norm(est?.estimate_number);
  if (num) {
    const hay = norm([ev?.subject, ev?.title, ev?.summary, ev?.notes].filter(Boolean).join(" "));
    if (hay.includes(num)) return true;
  }
  return false;
}

// Best-effort "when was it sent" — estimates stamp sent_at at quote-send;
// fall back to updated_date then created_date.
function sentStamp(est) {
  return (
    parseStamp(est?.sent_at) ??
    parseStamp(est?.sent_date) ??
    parseStamp(est?.quote_sent_at) ??
    parseStamp(est?.updated_date) ??
    parseStamp(est?.created_date) ??
    null
  );
}

/**
 * Suggestion rows for sent estimates that have sat `staleDays` without an
 * OPEN follow-up event touching them. A completed follow-up does NOT
 * suppress re-suggestion — the estimate may still be waiting.
 *
 *   suggestFollowUpEvents(estimates, {now, staleDays=7, existingEvents, eventTypes, users})
 *
 * Suggestion rows mirror queueRows shape with suggestion:true,
 * type_label "EstimateFollowUp", source "auto_followup", due_at = now
 * (actionable today), plus estimate_id/estimate_number/stale_days so a
 * confirm action can materialize a real event via buildCreateEventFields.
 */
export function suggestFollowUpEvents(estimates, { now, staleDays = 7, existingEvents = [], eventTypes = [], users = [] } = {}) {
  const at = nowMs(now);
  const idx = indexEventTypes(eventTypes);
  const followType = followUpEventType(eventTypes);
  const existing = Array.isArray(existingEvents) ? existingEvents : [];
  const seen = new Set();
  const out = [];

  for (const est of Array.isArray(estimates) ? estimates : []) {
    if (!est || norm(est.status) !== "sent") continue;
    const estId = str(est.id);
    if (!estId || seen.has(estId)) continue;
    seen.add(estId);

    const sent = sentStamp(est);
    if (sent === null) continue;
    const ageMs = at - sent;
    if (!(ageMs > staleDays * DAY_MS)) continue;

    const covered = existing.some(
      (ev) => isFollowUpEvent(ev, idx) && !isEventComplete(ev) && eventTouchesEstimate(ev, est),
    );
    if (covered) continue;

    const staleDaysActual = Math.floor(ageMs / DAY_MS);
    const customer = str(est.client_name) || str(est.customer_name) || str(est.contact_name);
    const num = str(est.estimate_number);
    const assignee = str(est.salesperson);
    out.push({
      id: `suggest:${estId}`,
      suggestion: true,
      type_id: followType?.id || "",
      type_label: FOLLOW_UP_TYPE_LABEL,
      channel: followType?.channel || "call",
      title: `Estimate follow up${num ? ` — ${num}` : ""}`,
      customer_name: customer,
      contact_name: str(est.contact_name),
      customer_id: str(est.customer_id),
      opportunity_id: str(est.opportunity_id),
      work_order_id: str(est.work_order_id),
      estimate_id: estId,
      estimate_number: num,
      due_at: new Date(at).toISOString(),
      assignee,
      assignee_name: resolveAssigneeName(assignee, users),
      overdue: false,
      open: true,
      status: "suggested",
      outcome: "",
      notes: `Sent ${staleDaysActual} day${staleDaysActual === 1 ? "" : "s"} ago with no open follow-up event.`,
      created_at: new Date(sent).toISOString(),
      completed_at: "",
      completed_by: "",
      source: "auto_followup",
      sent_at: new Date(sent).toISOString(),
      stale_days: staleDaysActual,
      raw: est,
    });
  }

  // Most-stale first so the longest-neglected quotes surface at the top.
  return out.sort((a, b) => b.stale_days - a.stale_days);
}
