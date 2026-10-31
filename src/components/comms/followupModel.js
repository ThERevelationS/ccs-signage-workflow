// Pure rules engine for CoreBridge-style two-stage follow-ups on sent
// estimates/quotes and overdue invoices. Mirrors the conventions of
// src/components/crm/crmEventsModel.js — dependency-free (besides the
// colocated email template renderer) so it bundles cleanly under esbuild for
// scripts/test-followups.mjs. No I/O: callers load entities and pass plain
// rows in.
//
// Stage plan (all day thresholds injectable via `rules`):
//   quote_followup_1   — quote1 days after quote_issue_date while status=sent
//   quote_followup_2   — quote2 days after quote_issue_date while status=sent
//   invoice_overdue_1  — inv1 days past invoice due_date while balance_due>0
//   invoice_overdue_2  — inv2 days past invoice due_date while balance_due>0
//
// Stages are independent schedules: a quote untouched for quote2+ days can be
// due for BOTH stages at once (the queue groups them into separate sections).
// Dedupe: a follow-up kind is never suggested for a target once an
// OpportunityActivity log row exists for that same kind+target — the queue
// writes one on send, skip, and mark-done (see FollowupQueue.jsx).

import { FOLLOWUP_TEMPLATES, renderTemplate } from "./emailTemplates";

export const FOLLOWUP_KINDS = [
  "quote_followup_1",
  "quote_followup_2",
  "invoice_overdue_1",
  "invoice_overdue_2",
];

const KIND_SET = new Set(FOLLOWUP_KINDS);

// Stage/section metadata the queue UI groups on.
export const FOLLOWUP_KIND_META = {
  quote_followup_1: { target: "quote", stage: 1, section: "quote_1", label: "Quote follow-up — 1st" },
  quote_followup_2: { target: "quote", stage: 2, section: "quote_2", label: "Quote follow-up — 2nd" },
  invoice_overdue_1: { target: "invoice", stage: 1, section: "invoice_1", label: "Invoice overdue — 1st" },
  invoice_overdue_2: { target: "invoice", stage: 2, section: "invoice_2", label: "Invoice overdue — 2nd" },
};

export const FOLLOWUP_SECTIONS = ["quote_1", "quote_2", "invoice_1", "invoice_2"];

// Defaults match the CoreBridge cadence: nudge an unanswered quote at 3 then
// 7 days; chase an open invoice 1 day and 14 days past due.
export const DEFAULT_FOLLOWUP_RULES = { quote1: 3, quote2: 7, inv1: 1, inv2: 14 };

// Where the automation markers live on an OpportunityActivity log row.
// `source` stays inside the entity enum ('auto_followup'); the finer-grained
// origin the workflow spec uses (followup_automation / followup_skip /
// followup_manual_done) is mirrored here in `details`.
export const FOLLOWUP_ACTIVITY_SOURCE = "auto_followup";
export const FOLLOWUP_LOG_SOURCES = [
  "followup_automation",
  "followup_skip",
  "followup_manual_done",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const clean = (v) => String(v ?? "").trim();
const num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const usd = (n) =>
  `$${num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 'YYYY-MM-DD' parses as UTC midnight so thresholds are whole-day stable
// regardless of the reviewer's timezone; full ISO strings parse as-is.
const toMs = (v) => {
  if (v instanceof Date) return v.getTime();
  const s = clean(v);
  if (!s) return NaN;
  const t = Date.parse(s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isFinite(t) ? t : NaN;
};
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const wholeDays = (ms) => Math.max(0, Math.floor(ms / DAY_MS));

// Coerce every threshold to a non-negative whole-day count. Anything missing
// or invalid falls back to the default for that stage — a rules panel can
// never produce a negative or NaN gate.
export function normalizeFollowupRules(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = { ...DEFAULT_FOLLOWUP_RULES };
  for (const key of Object.keys(DEFAULT_FOLLOWUP_RULES)) {
    const n = Math.floor(Number(src[key]));
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

// --- Eligibility ------------------------------------------------------------

// A quote needs follow-up only while it is customer-facing and unanswered:
// status 'sent' with no recorded acceptance. Draft/calculated quotes were
// never sent; approved/archived/cancelled need no nudge.
export function isQuoteEligible(estimate) {
  return clean(estimate?.status) === "sent" && !clean(estimate?.accepted_at);
}

// quote_issue_date is stamped when the estimate transitions into 'sent'.
// sent_date/sent_at are tolerated fallbacks; a sent estimate with no stamp at
// all is skipped rather than guessed at (historical rows are not backfilled).
export function quoteSentMs(estimate) {
  return toMs(estimate?.quote_issue_date || estimate?.sent_date || estimate?.sent_at);
}

// Open AR = positive balance on an issued invoice. paid/void/draft rows and
// zero-balance rows are never chased.
export function isInvoiceEligible(invoice) {
  const status = clean(invoice?.status).toLowerCase();
  if (["draft", "paid", "void"].includes(status)) return false;
  return num(invoice?.balance_due) > 0;
}

// --- Log-row dedupe ----------------------------------------------------------

// The (kind, targetId) an activity row logs a follow-up for, or null when the
// row is not a follow-up-automation record. Markers live in `details` so both
// enum-safe rows (source 'auto_followup') and any literal followup_* source
// rows dedupe identically.
export function followupLogMarker(activity) {
  const details = activity?.details;
  if (!details || typeof details !== "object") return null;
  const kind = clean(details.followup_kind);
  const targetId = clean(details.followup_target_id);
  if (!KIND_SET.has(kind) || !targetId) return null;
  return { kind, targetId };
}

export function hasFollowupLog(activities, kind, targetId) {
  const wantedKind = clean(kind);
  const wantedTarget = clean(targetId);
  if (!wantedKind || !wantedTarget) return false;
  for (const a of Array.isArray(activities) ? activities : []) {
    const marker = followupLogMarker(a);
    if (marker && marker.kind === wantedKind && marker.targetId === wantedTarget) return true;
  }
  return false;
}

// --- Template contexts --------------------------------------------------------

const quoteContext = (estimate, daysSinceSent) => {
  const issueMs = quoteSentMs(estimate);
  const explicitExpiry = clean(estimate?.quote_expiration_date);
  const computedExpiry = Number.isFinite(issueMs) && Number.isFinite(Number(estimate?.quote_valid_days))
    ? isoDate(issueMs + Number(estimate.quote_valid_days) * DAY_MS)
    : "";
  return {
    customer_name: clean(estimate?.client_name),
    contact_name: clean(estimate?.contact_name || estimate?.client_name),
    estimate_number: clean(estimate?.estimate_number),
    invoice_number: "",
    total: usd(estimate?.quote_total),
    balance: "",
    due_date: explicitExpiry || computedExpiry,
    company_name: clean(estimate?.company_name) || "CCS Signage",
    days_since_sent: String(daysSinceSent),
    days_past_due: "",
  };
};

const invoiceContext = (invoice, daysPastDue) => ({
  customer_name: clean(invoice?.customer_display_name || invoice?.customer_name),
  contact_name: clean(invoice?.contact_name || invoice?.customer_display_name || invoice?.customer_name),
  estimate_number: "",
  invoice_number: clean(invoice?.invoice_number),
  total: usd(invoice?.total),
  balance: usd(invoice?.balance_due),
  due_date: clean(invoice?.due_date),
  company_name: clean(invoice?.company_name) || "CCS Signage",
  days_since_sent: "",
  days_past_due: String(daysPastDue),
});

const suggest = (kind, ctx) => ({
  suggestedSubject: renderTemplate(FOLLOWUP_TEMPLATES[kind]?.subject, ctx),
  suggestedBody: renderTemplate(FOLLOWUP_TEMPLATES[kind]?.body, ctx),
});

// --- Queue view --------------------------------------------------------------

/**
 * Every follow-up currently due, sorted most-overdue first.
 *   estimates — AllInOneEstimate rows (status/quote_issue_date drive quotes)
 *   invoices  — invoicingAction list_invoices snapshots (balance_due/due_date)
 *   activities — OpportunityActivity rows used for kind+target dedupe
 *   rules     — {quote1, quote2, inv1, inv2} day thresholds (all injectable)
 *   now       — Date/ISO/ms the schedule is evaluated against
 */
export function findDueFollowups({ estimates, invoices, activities, rules, now } = {}) {
  const r = normalizeFollowupRules(rules);
  const nowMs = Number.isFinite(toMs(now)) ? toMs(now) : Date.now();
  const acts = Array.isArray(activities) ? activities : [];
  const logged = new Set();
  for (const a of acts) {
    const marker = followupLogMarker(a);
    if (marker) logged.add(`${marker.kind}|${marker.targetId}`);
  }
  const isLogged = (kind, targetId) => logged.has(`${kind}|${clean(targetId)}`);
  const out = [];

  const push = (kind, baseMs, thresholdDays, fields) => {
    if (!Number.isFinite(baseMs)) return;
    const dueMs = baseMs + thresholdDays * DAY_MS;
    if (nowMs < dueMs) return; // not due yet
    if (isLogged(kind, fields.targetId)) return; // already sent/skipped/done
    out.push({
      kind,
      stage: FOLLOWUP_KIND_META[kind].stage,
      target: FOLLOWUP_KIND_META[kind].target,
      section: FOLLOWUP_KIND_META[kind].section,
      dueDate: isoDate(dueMs),
      daysOverdue: wholeDays(nowMs - dueMs),
      ...fields,
    });
  };

  for (const estimate of Array.isArray(estimates) ? estimates : []) {
    if (!isQuoteEligible(estimate)) continue;
    const sentMs = quoteSentMs(estimate);
    const targetId = clean(estimate?.id);
    if (!Number.isFinite(sentMs) || !targetId) continue;
    const daysSinceSent = wholeDays(nowMs - sentMs);
    const ctx = quoteContext(estimate, daysSinceSent);
    const fields = {
      targetId,
      targetRef: clean(estimate?.estimate_number) || targetId,
      customerId: clean(estimate?.customer_id),
      customerName: clean(estimate?.client_name),
      contactName: clean(estimate?.contact_name),
      contactEmail: clean(estimate?.contact_email),
      opportunityId: clean(estimate?.opportunity_id),
      workOrderId: clean(estimate?.work_order_id),
      daysSinceSent,
      total: num(estimate?.quote_total),
      ...suggest("quote_followup_1", ctx),
    };
    // Both stages share the row context; only the template differs per kind.
    push("quote_followup_1", sentMs, r.quote1, fields);
    push("quote_followup_2", sentMs, r.quote2, {
      ...fields,
      ...suggest("quote_followup_2", ctx),
    });
  }

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    if (!isInvoiceEligible(invoice)) continue;
    const dueMs = toMs(invoice?.due_date);
    const targetId = clean(invoice?.id);
    if (!Number.isFinite(dueMs) || !targetId) continue;
    const daysPastDue = wholeDays(nowMs - dueMs);
    const ctx = invoiceContext(invoice, daysPastDue);
    const fields = {
      targetId,
      targetRef: clean(invoice?.invoice_number) || targetId,
      customerId: clean(invoice?.customer_id),
      customerName: clean(invoice?.customer_display_name || invoice?.customer_name),
      contactName: clean(invoice?.contact_name),
      contactEmail: clean(invoice?.contact_email || invoice?.customer_email),
      opportunityId: clean(invoice?.opportunity_id),
      workOrderId: clean(invoice?.work_order_id),
      daysPastDue,
      balance: num(invoice?.balance_due),
      ...suggest("invoice_overdue_1", ctx),
    };
    push("invoice_overdue_1", dueMs, r.inv1, fields);
    push("invoice_overdue_2", dueMs, r.inv2, {
      ...fields,
      ...suggest("invoice_overdue_2", ctx),
    });
  }

  // Most-overdue first; ties fall to earlier due dates then kind/target for a
  // fully deterministic order.
  return out.sort((a, b) =>
    (b.daysOverdue - a.daysOverdue)
    || a.dueDate.localeCompare(b.dueDate)
    || a.kind.localeCompare(b.kind)
    || String(a.targetId).localeCompare(String(b.targetId))
  );
}

// Convenience bucketing for the queue UI's four sections.
export function groupDueFollowups(items) {
  const groups = { quote_1: [], quote_2: [], invoice_1: [], invoice_2: [] };
  for (const item of Array.isArray(items) ? items : []) {
    const section = FOLLOWUP_KIND_META[item?.kind]?.section;
    if (section) groups[section].push(item);
  }
  return groups;
}
