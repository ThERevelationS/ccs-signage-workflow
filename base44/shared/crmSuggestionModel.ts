// CRM follow-up SUGGESTION model — pure TS, zero entity/io imports. Safe to
// import from Deno functions (base44/functions/*) and frontend modules.
// (ESTIMATOR_MASTERPLAN G-06; complements the transient G-05 suggester in
// src/components/crm/crmEventQueueModel.js with a PERSISTED two-write
// confirm/dismiss contract.)
//
// Model:
//   - Sent-status estimates age past three escalation thresholds and surface
//     a "suggested" CRM event of type EstimateFollowUp. A human confirms → a
//     real OpportunityActivity row materializes; or dismisses → the stage
//     never re-suggests.
//   - HOST ENTITY: suggestions persist on a dedicated `CrmSuggestion` entity
//     (SPEC — see SUGGESTION_ENTITY_SPEC below). OpportunityActivity stays
//     pure events: its `status` vocabulary is the event lifecycle
//     (open/completed) and the G-05 queue renders any non-complete typed row
//     as a real event, so suggestion lifecycle states can't ride on it
//     without corrupting the queue. CrmSuggestion carries `status`
//     pending|confirmed|dismissed + an indexed `suggestion_key` for dedupe.
//   - Thresholds (SUGGESTION_THRESHOLDS_DAYS) mirror followUpMachine.ts's
//     drip schedule so the human nudge brackets the automated one:
//       first  3d — early human heads-up BEFORE the FU1 auto-send
//                 (fu1_delay_days = 7)
//       second 7d — coincides with FU1's scheduled send
//                 (fu1_delay_days = 7)
//       stale 14d — the FU2 absolute deadline; automated sequence exhausted
//                 (fu2_delay_days = 14) → escalate to a person
//     RECENT_EVENT_DAYS (7) mirrors fu2_after_fu1_days — a logged follow-up
//     covers the estimate for one machine-spacing window.
//   - Sent-age math reuses followUpMachine's anchor convention: a persisted
//     follow_up_state.anchor_at wins, else the first parseable of
//     SENT_ANCHOR_FIELDS (sent_at / quote_issue_date / sent_date /
//     quote_sent_at / issued_at / follow_up_anchor_at / updated_date /
//     created_date). Date-only strings parse as LOCAL MIDNIGHT (repo
//     convention, same as followUpMachine/dueDateEngine); outputs are ISO.
//     Threshold boundaries are INCLUSIVE — due AT anchor + delay.
//   - Dedupe (suggestFollowUps):
//       * any PENDING suggestion for the estimate → suppress (one open ask
//         per estimate — no stacked stages)
//       * any suggestion row carrying the same suggestion_key
//         (sug:<est>:<stage>) regardless of status → suppress that stage
//         (dismissed stages never re-nag; confirmed is belt-and-suspenders
//         since the materialized event also suppresses)
//       * an OPEN EstimateFollowUp event touching the estimate → suppress
//         (same rule as the G-05 queue)
//       * an EstimateFollowUp event touching the estimate with activity
//         (completed_at → due_at → created/updated stamp) inside
//         RECENT_EVENT_DAYS → suppress
//       * estimates whose follow_up_state.stage is 'answered' or 'closed'
//         (terminal machine states) → suppress. 'fu2_sent' still suggests —
//         the automated drip is done and nobody answered; a stale row is
//         exactly the human takeover point.
//   - Event linkage (eventTouchesEstimate): estimate_id (top-level or
//     details.estimate_id), shared opportunity_id, shared work_order_id,
//     then estimate-number text match in subject/summary/notes — same chain
//     as crmEventQueueModel.js.
//   - Two-write contract: confirmSuggestion() returns {event,
//     suggestion_patch} — the caller writes the OpportunityActivity event
//     AND patches the CrmSuggestion row; dismissSuggestion() returns
//     {suggestion_patch}. Neither function performs io.
//
// SUGGESTION_ENTITY_SPEC — CrmSuggestion.jsonc (backend-only RLS, mirror
// OpportunityActivity.rls; written via staffEntityWrite / service role):
//   { kind: 'estimate_follow_up_suggestion',      // SUGGESTION_KIND — extensible
//     suggestion_key: 'sug:<estimate_id>:<stage>',// unique dedupe key
//     status: 'pending'|'confirmed'|'dismissed',  // suggestion lifecycle
//     estimate_id, estimate_number,
//     customer_id, customer_name, contact_name,
//     opportunity_id, work_order_id,
//     due_stage: 'first'|'second'|'stale',
//     days_since_sent: number, sent_at: ISO, due_at: ISO,
//     deep_link: '/EstimateDetail?id=…',
//     assignee: '<estimate.salesperson>',
//     reason: '<human why>',
//     actor: '<creating actor — system/agent>',
//     suggested_at: ISO,
//     event_type_id: '<CrmEventType id when resolved>',
//     confirmed_by, confirmed_at, confirmed_event_id,
//     dismissed_by, dismissed_at, dismiss_reason }

export const SUGGESTION_KIND = "estimate_follow_up_suggestion";

export const SUGGESTION_STAGES = ["first", "second", "stale"] as const;
export type SuggestionStage = (typeof SUGGESTION_STAGES)[number];

// Aligned to followUpMachine FOLLOW_UP_DEFAULTS — see header.
export const SUGGESTION_THRESHOLDS_DAYS: Record<SuggestionStage, number> = {
  first: 3,
  second: 7,
  stale: 14,
};

// A logged EstimateFollowUp event covers the estimate for this many days —
// mirrors followUpMachine fu2_after_fu1_days spacing.
export const RECENT_EVENT_DAYS = 7;

export const SUGGESTION_STATUS = ["pending", "confirmed", "dismissed"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUS)[number];

// Canonical label for the follow-up CRM event type (A-12 seed: "Estimate
// Follow Up"; G-05/G-06 compact form). FOLLOW_UP_EVENT_TYPE is the
// OpportunityActivity.event_type ENUM-SAFE write value.
export const FOLLOW_UP_TYPE_LABEL = "EstimateFollowUp";
export const FOLLOW_UP_EVENT_TYPE = "Call: Estimate Follow Up";

// Sent-age anchor fallback chain — estimate-relevant subset of
// followUpMachine.FOLLOW_UP_ANCHOR_FIELDS (proof fields dropped; they never
// carry a customer-quote send stamp but remain valid cfg inputs upstream).
export const SENT_ANCHOR_FIELDS = [
  "sent_at",
  "quote_issue_date",
  "sent_date",
  "quote_sent_at",
  "issued_at",
  "follow_up_anchor_at",
  "updated_date",
  "created_date",
];

// follow_up_state stages where the drip sequence is permanently over.
const TERMINAL_FU_STAGES = new Set(["answered", "closed"]);

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// primitives (same conventions as followUpMachine.ts)
// ---------------------------------------------------------------------------

const toInstant = (value: any): number | null => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
};

const toIso = (t: number): string => new Date(t).toISOString();

const str = (v: any): string => String(v ?? "").trim();
const norm = (v: any): string => str(v).toLowerCase();
// Punctuation-insensitive label compare: "Estimate Follow Up" ===
// "EstimateFollowUp" === "estimate_follow_up".
const normLabel = (v: any): string => norm(v).replace(/[^a-z0-9]+/g, "");

export function suggestionKey(estimateId: any, stage: any): string {
  return `sug:${str(estimateId)}:${str(stage)}`;
}

// Resolve "when the estimate was sent". follow_up_state.anchor_at wins;
// then SENT_ANCHOR_FIELDS in order. Returns {at (ISO|null), ms, field}.
export function sentAnchor(estimate: any = {}) {
  const stateAnchor = toInstant(estimate?.follow_up_state?.anchor_at);
  if (stateAnchor !== null) {
    return { at: toIso(stateAnchor), ms: stateAnchor, field: "follow_up_state.anchor_at" };
  }
  for (const field of SENT_ANCHOR_FIELDS) {
    const ms = toInstant(estimate?.[field]);
    if (ms !== null) return { at: toIso(ms), ms, field };
  }
  return { at: null, ms: null, field: "" };
}

// Whole days the estimate has been sent (floored; 0 when the anchor is in
// the future relative to now).
export function daysSinceSent(estimate: any, now: any): number | null {
  const anchor = sentAnchor(estimate);
  const nowMs = toInstant(now);
  if (anchor.ms === null || nowMs === null) return null;
  return Math.max(0, Math.floor((nowMs - anchor.ms) / DAY_MS));
}

// Highest escalation stage reached for a day count; null below 'first'.
export function stageForDays(days: number, thresholds: any = SUGGESTION_THRESHOLDS_DAYS): SuggestionStage | null {
  const t = { ...SUGGESTION_THRESHOLDS_DAYS, ...(thresholds || {}) };
  if (days >= t.stale) return "stale";
  if (days >= t.second) return "second";
  if (days >= t.first) return "first";
  return null;
}

// ---------------------------------------------------------------------------
// EstimateFollowUp event detection + estimate linkage
// (re-implemented lightweight — zero imports by contract; mirrors
//  crmEventQueueModel.js isEstimateFollowUpLabel / eventTouchesEstimate)
// ---------------------------------------------------------------------------

// True for "Estimate Follow Up" / "EstimateFollowUp" / "Call: Estimate
// Follow Up" / kind 'estimate_follow_up' — needs both words so plain
// "Follow Up" and "E-Mail: Estimate" do not qualify.
export function isEstimateFollowUpLabel(label: any): boolean {
  const nl = normLabel(label);
  return nl.includes("estimate") && nl.includes("follow");
}

function isFollowUpEvent(ev: any): boolean {
  if (!ev) return false;
  if (isEstimateFollowUpLabel(ev?.event_type)) return true;
  if (isEstimateFollowUpLabel(ev?.type_label)) return true;
  if (isEstimateFollowUpLabel(ev?.details?.type_label)) return true;
  if (isEstimateFollowUpLabel(ev?.details?.kind)) return true;
  if (isEstimateFollowUpLabel(ev?.subject) && !str(ev?.event_type)) return true;
  return false;
}

// Closed = completed_by/at stamped, status 'completed', or a terminal
// outcome (same test as crmEventQueueModel.isEventComplete).
function isEventComplete(ev: any): boolean {
  if (!ev) return false;
  if (str(ev.completed_by)) return true;
  if (str(ev.completed_at)) return true;
  if (norm(ev.status) === "completed") return true;
  const outcome = norm(ev.outcome || ev?.details?.outcome);
  return outcome === "completed" || outcome === "cancelled";
}

// Best instant an event "happened" — completion wins, then due, then
// created/updated bookkeeping stamps.
function eventActivityMs(ev: any): number | null {
  return (
    toInstant(ev?.completed_at) ??
    toInstant(ev?.due_at) ??
    toInstant(ev?.created_date) ??
    toInstant(ev?.created_at) ??
    toInstant(ev?.updated_date) ??
    null
  );
}

// Does this event reference the estimate? estimate_id (top-level or
// details) → shared opportunity_id → shared work_order_id → estimate-number
// text match.
function eventTouchesEstimate(ev: any, est: any): boolean {
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
    const hay = norm([ev?.subject, ev?.summary, ev?.notes, ev?.title].filter(Boolean).join(" "));
    if (hay.includes(num)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// suggestion rows
// ---------------------------------------------------------------------------

const isSuggestionRow = (row: any): boolean =>
  norm(row?.kind) === SUGGESTION_KIND || str(row?.suggestion_key).startsWith("sug:");

const suggestionStatus = (row: any): string => {
  const s = norm(row?.status);
  return (SUGGESTION_STATUS as readonly string[]).includes(s) ? s : "pending";
};

const rowEstimateId = (row: any): string =>
  str(row?.estimate_id || row?.details?.estimate_id);

// Human-readable why for a stage.
function stageReason(stage: SuggestionStage, days: number, num: string): string {
  const d = `${days} day${days === 1 ? "" : "s"}`;
  const what = num ? `Estimate ${num}` : "Estimate";
  if (stage === "first") return `${what} sent ${d} ago — first follow-up check-in due (before the 7-day auto drip).`;
  if (stage === "second") return `${what} sent ${d} ago — auto FU1 window reached with no logged follow-up.`;
  return `${what} sent ${d} ago — automated follow-up window exhausted; escalate to a direct call.`;
}

const STAFF_ESTIMATE_LINK = (estimateId: string) => `/EstimateDetail?id=${estimateId}`;

/**
 * Scan sent estimates and emit suggestion objects (not yet persisted — feed
 * them to suggestionRow for the entity write).
 *
 *   suggestFollowUps(estimates, {now, existing_events, existing_suggestions,
 *                                thresholds, recent_event_days})
 *
 * → [{estimate_id, customer_id, suggestion_key, due_stage, reason,
 *     deep_link, estimate_number, customer_name, days_since_sent,
 *     contact_name, opportunity_id, work_order_id, assignee, sent_at,
 *     due_at, kind}] — at most ONE per estimate (highest stage due),
 * sorted most-stale first.
 */
export function suggestFollowUps(
  estimates: any[],
  {
    now,
    existing_events = [],
    existing_suggestions = [],
    thresholds,
    recent_event_days = RECENT_EVENT_DAYS,
  }: any = {},
): any[] {
  const nowMs = toInstant(now);
  if (nowMs === null) return [];
  const t = { ...SUGGESTION_THRESHOLDS_DAYS, ...(thresholds || {}) };
  const recentMs = Math.max(0, Number(recent_event_days) || 0) * DAY_MS;
  const events = Array.isArray(existing_events) ? existing_events : [];
  const suggestions = Array.isArray(existing_suggestions) ? existing_suggestions : [];

  // Index existing suggestion rows: pending-by-estimate and any-by-key.
  const pendingEstIds = new Set<string>();
  const usedKeys = new Set<string>();
  for (const s of suggestions) {
    if (!isSuggestionRow(s)) continue;
    const key = str(s?.suggestion_key);
    if (key) usedKeys.add(key);
    if (suggestionStatus(s) === "pending") {
      const eid = rowEstimateId(s);
      if (eid) pendingEstIds.add(eid);
    }
  }

  const seen = new Set<string>();
  const out: any[] = [];

  for (const est of Array.isArray(estimates) ? estimates : []) {
    if (!est || norm(est.status) !== "sent") continue;
    const estId = str(est.id);
    if (!estId || seen.has(estId)) continue;
    seen.add(estId);

    // Terminal machine state — drip is over for a real reason.
    if (TERMINAL_FU_STAGES.has(norm(est?.follow_up_state?.stage))) continue;

    const anchor = sentAnchor(est);
    if (anchor.ms === null) continue;
    const days = Math.max(0, Math.floor((nowMs - anchor.ms) / DAY_MS));
    const stage = stageForDays(days, t);
    if (!stage) continue;

    // Dedupe: an open suggestion already asks for this estimate.
    if (pendingEstIds.has(estId)) continue;
    const key = suggestionKey(estId, stage);
    if (usedKeys.has(key)) continue;

    // Dedupe: EstimateFollowUp event coverage — open event covers
    // outright; a recent one covers for one spacing window.
    const covered = events.some((ev: any) => {
      if (!isFollowUpEvent(ev) || !eventTouchesEstimate(ev, est)) return false;
      if (!isEventComplete(ev)) return true;
      const actMs = eventActivityMs(ev);
      return actMs !== null && actMs <= nowMs && nowMs - actMs <= recentMs;
    });
    if (covered) continue;

    const num = str(est.estimate_number);
    const customer = str(est.client_name) || str(est.customer_name) || str(est.contact_name);
    out.push({
      kind: SUGGESTION_KIND,
      estimate_id: estId,
      estimate_number: num,
      customer_id: str(est.customer_id),
      customer_name: customer,
      contact_name: str(est.contact_name),
      opportunity_id: str(est.opportunity_id),
      work_order_id: str(est.work_order_id),
      assignee: str(est.salesperson),
      suggestion_key: key,
      due_stage: stage,
      days_since_sent: days,
      sent_at: anchor.at,
      due_at: toIso(anchor.ms + t[stage] * DAY_MS),
      reason: stageReason(stage, days, num),
      deep_link: STAFF_ESTIMATE_LINK(estId),
      event_type_id: str(est.follow_up_event_type_id),
    });
  }

  // Most-stale first, matching the G-05 queue ordering.
  return out.sort((a, b) => b.days_since_sent - a.days_since_sent);
}

/**
 * Entity-shaped CrmSuggestion row for one suggestion — what the caller
 * persists through staffEntityWrite / service role. status starts
 * 'pending'; suggested_at/actor stamped from the injected clock.
 */
export function suggestionRow(suggestion: any = {}, { actor_id, now }: any = {}) {
  const nowMs = toInstant(now);
  const nowIso = nowMs === null ? "" : toIso(nowMs);
  return {
    kind: SUGGESTION_KIND,
    suggestion_key: str(suggestion.suggestion_key),
    status: "pending",
    estimate_id: str(suggestion.estimate_id),
    estimate_number: str(suggestion.estimate_number),
    customer_id: str(suggestion.customer_id),
    customer_name: str(suggestion.customer_name),
    contact_name: str(suggestion.contact_name),
    opportunity_id: str(suggestion.opportunity_id),
    work_order_id: str(suggestion.work_order_id),
    due_stage: str(suggestion.due_stage),
    days_since_sent: Math.max(0, Number(suggestion.days_since_sent) || 0),
    sent_at: str(suggestion.sent_at),
    due_at: str(suggestion.due_at),
    deep_link: str(suggestion.deep_link),
    assignee: str(suggestion.assignee),
    reason: str(suggestion.reason),
    event_type_id: str(suggestion.event_type_id),
    actor: str(actor_id),
    suggested_at: str(suggestion.suggested_at) || nowIso,
    confirmed_by: "",
    confirmed_at: "",
    confirmed_event_id: "",
    dismissed_by: "",
    dismissed_at: "",
    dismiss_reason: "",
  };
}

/**
 * Confirm a suggestion → the TWO-WRITE contract:
 *   { event, suggestion_patch }
 * `event` is an OpportunityActivity-shaped create payload for a real
 * EstimateFollowUp CRM event (source 'auto_followup', status 'open',
 * due_at = now). `suggestion_patch` marks the CrmSuggestion row confirmed.
 * The caller writes BOTH — then backfills patch.confirmed_event_id with the
 * created event's id when it wants the audit link.
 */
export function confirmSuggestion(suggestion: any = {}, { actor_id, now }: any = {}) {
  const nowMs = toInstant(now);
  const nowIso = nowMs === null ? "" : toIso(nowMs);
  const num = str(suggestion.estimate_number);
  const days = Math.max(0, Number(suggestion.days_since_sent) || 0);
  const stage = str(suggestion.due_stage);
  const title = `Estimate follow up${num ? ` — ${num}` : ""}`;
  const event = {
    event_type: FOLLOW_UP_EVENT_TYPE, // entity enum-safe; label is EstimateFollowUp
    event_type_id: str(suggestion.event_type_id),
    subject: title,
    summary: title,
    notes:
      str(suggestion.notes) ||
      `Confirmed from auto-suggestion (${stage}): estimate sent ${days} day${days === 1 ? "" : "s"} ago.`,
    company_name: str(suggestion.customer_name),
    contact_name: str(suggestion.contact_name),
    customer_id: str(suggestion.customer_id),
    opportunity_id: str(suggestion.opportunity_id),
    work_order_id: str(suggestion.work_order_id),
    assigned_to: str(suggestion.assignee) || str(actor_id),
    due_at: nowIso,
    completed_at: "",
    completed_by: "",
    outcome: "",
    status: "open",
    source: "auto_followup",
    actor: str(actor_id),
    details: {
      estimate_id: str(suggestion.estimate_id),
      suggestion_key: str(suggestion.suggestion_key),
      type_label: FOLLOW_UP_TYPE_LABEL,
      due_stage: stage,
      days_since_sent: days,
    },
  };
  const suggestion_patch = {
    status: "confirmed",
    confirmed_by: str(actor_id),
    confirmed_at: nowIso,
    confirmed_event_id: "",
  };
  return { event, suggestion_patch };
}

/**
 * Dismiss a suggestion → { suggestion_patch } marking the row dismissed.
 * The dismissed stage's suggestion_key stays used, so that stage never
 * re-suggests; a later escalation stage may still fire.
 */
export function dismissSuggestion(suggestion: any = {}, { actor_id, now, reason }: any = {}) {
  const nowMs = toInstant(now);
  const nowIso = nowMs === null ? "" : toIso(nowMs);
  return {
    suggestion_patch: {
      status: "dismissed",
      dismissed_by: str(actor_id),
      dismissed_at: nowIso,
      dismiss_reason: str(reason),
    },
  };
}

/**
 * Open (pending) suggestions from CrmSuggestion rows, most-stale first
 * (days_since_sent desc, then oldest suggested_at). `user_email` filters to
 * rows whose assignee matches (case-insensitive email or display-name
 * spelling — same leniency as the queue's salesperson filter).
 */
export function pendingSuggestions(suggestion_rows: any[], { user_email }: any = {}): any[] {
  const who = norm(user_email);
  const rows = (Array.isArray(suggestion_rows) ? suggestion_rows : []).filter((r: any) => {
    if (!isSuggestionRow(r)) return false;
    if (suggestionStatus(r) !== "pending") return false;
    if (who && norm(r?.assignee ?? r?.assigned_to) !== who) return false;
    return true;
  });
  return rows.sort((a: any, b: any) => {
    const dd = (Number(b?.days_since_sent) || 0) - (Number(a?.days_since_sent) || 0);
    if (dd !== 0) return dd;
    const sa = toInstant(a?.suggested_at ?? a?.created_date) ?? 0;
    const sb = toInstant(b?.suggested_at ?? b?.created_date) ?? 0;
    if (sa !== sb) return sa - sb;
    return str(a?.suggestion_key).localeCompare(str(b?.suggestion_key));
  });
}
