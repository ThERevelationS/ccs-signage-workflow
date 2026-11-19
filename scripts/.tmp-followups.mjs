// src/components/comms/emailTemplates.js
function renderTemplate(template, context = {}) {
  const ctx = context && typeof context === "object" ? context : {};
  return String(template ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const value = ctx[key];
    if (value === void 0 || value === null) return "";
    return String(value);
  });
}
var FOLLOWUP_TEMPLATES = {
  quote_followup_1: {
    subject: "Following up on quote {{estimate_number}} \u2014 {{company_name}}",
    body: "Hi {{contact_name}},\n\nI wanted to follow up on the signage quote we sent over for {{customer_name}} \u2014 quote {{estimate_number}} for {{total}}. It has been {{days_since_sent}} days since we issued it, and I wanted to make sure it reached the right hands.\n\nHappy to answer any questions, adjust options, or walk through the details whenever is convenient.\n\nThank you,\n{{company_name}}"
  },
  quote_followup_2: {
    subject: "Still interested? Quote {{estimate_number}} \u2014 {{company_name}}",
    body: "Hi {{contact_name}},\n\nI'm circling back one more time on quote {{estimate_number}} for {{customer_name}} ({{total}}), sent {{days_since_sent}} days ago. We would love to earn this project \u2014 if priorities or budgets have shifted, just let me know and I can revise or close it out.\n\nIf everything looks good, you can approve it and we will get production moving.\n\nThank you,\n{{company_name}}"
  },
  invoice_overdue_1: {
    subject: "Payment reminder: {{invoice_number}} ({{days_past_due}} days past due) \u2014 {{company_name}}",
    body: "Hi {{contact_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{customer_name}} was due on {{due_date}} and shows an open balance of {{balance}}.\n\nIf payment is already on the way, thank you \u2014 please disregard this note. Otherwise we would appreciate payment at your earliest convenience, or a quick reply so we know the status.\n\nThank you,\n{{company_name}}"
  },
  invoice_overdue_2: {
    subject: "Second notice: {{invoice_number}} is {{days_past_due}} days past due \u2014 {{company_name}}",
    body: "Hi {{contact_name}},\n\nInvoice {{invoice_number}} for {{customer_name}} remains open with a balance of {{balance}}. It was due {{due_date}} and is now {{days_past_due}} days past due.\n\nPlease arrange payment as soon as possible, or contact us right away if there is an issue holding it up \u2014 we are glad to work through it with you.\n\nThank you,\n{{company_name}}"
  }
};
var FOLLOWUP_TEMPLATE_KEYS = Object.keys(FOLLOWUP_TEMPLATES);

// src/components/comms/followupModel.js
var FOLLOWUP_KINDS = [
  "quote_followup_1",
  "quote_followup_2",
  "invoice_overdue_1",
  "invoice_overdue_2"
];
var KIND_SET = new Set(FOLLOWUP_KINDS);
var FOLLOWUP_KIND_META = {
  quote_followup_1: { target: "quote", stage: 1, section: "quote_1", label: "Quote follow-up \u2014 1st" },
  quote_followup_2: { target: "quote", stage: 2, section: "quote_2", label: "Quote follow-up \u2014 2nd" },
  invoice_overdue_1: { target: "invoice", stage: 1, section: "invoice_1", label: "Invoice overdue \u2014 1st" },
  invoice_overdue_2: { target: "invoice", stage: 2, section: "invoice_2", label: "Invoice overdue \u2014 2nd" }
};
var FOLLOWUP_SECTIONS = ["quote_1", "quote_2", "invoice_1", "invoice_2"];
var DEFAULT_FOLLOWUP_RULES = { quote1: 3, quote2: 7, inv1: 1, inv2: 14 };
var FOLLOWUP_ACTIVITY_SOURCE = "auto_followup";
var FOLLOWUP_LOG_SOURCES = [
  "followup_automation",
  "followup_skip",
  "followup_manual_done"
];
var DAY_MS = 24 * 60 * 60 * 1e3;
var clean = (v) => String(v ?? "").trim();
var num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
var usd = (n) => `$${num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
var toMs = (v) => {
  if (v instanceof Date) return v.getTime();
  const s = clean(v);
  if (!s) return NaN;
  const t = Date.parse(s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isFinite(t) ? t : NaN;
};
var isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
var wholeDays = (ms) => Math.max(0, Math.floor(ms / DAY_MS));
function normalizeFollowupRules(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = { ...DEFAULT_FOLLOWUP_RULES };
  for (const key of Object.keys(DEFAULT_FOLLOWUP_RULES)) {
    const n = Math.floor(Number(src[key]));
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}
function isQuoteEligible(estimate) {
  return clean(estimate?.status) === "sent" && !clean(estimate?.accepted_at);
}
function quoteSentMs(estimate) {
  return toMs(estimate?.quote_issue_date || estimate?.sent_date || estimate?.sent_at);
}
function isInvoiceEligible(invoice) {
  const status = clean(invoice?.status).toLowerCase();
  if (["draft", "paid", "void"].includes(status)) return false;
  return num(invoice?.balance_due) > 0;
}
function followupLogMarker(activity) {
  const details = activity?.details;
  if (!details || typeof details !== "object") return null;
  const kind = clean(details.followup_kind);
  const targetId = clean(details.followup_target_id);
  if (!KIND_SET.has(kind) || !targetId) return null;
  return { kind, targetId };
}
function hasFollowupLog(activities, kind, targetId) {
  const wantedKind = clean(kind);
  const wantedTarget = clean(targetId);
  if (!wantedKind || !wantedTarget) return false;
  for (const a of Array.isArray(activities) ? activities : []) {
    const marker = followupLogMarker(a);
    if (marker && marker.kind === wantedKind && marker.targetId === wantedTarget) return true;
  }
  return false;
}
var quoteContext = (estimate, daysSinceSent) => {
  const issueMs = quoteSentMs(estimate);
  const explicitExpiry = clean(estimate?.quote_expiration_date);
  const computedExpiry = Number.isFinite(issueMs) && Number.isFinite(Number(estimate?.quote_valid_days)) ? isoDate(issueMs + Number(estimate.quote_valid_days) * DAY_MS) : "";
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
    days_past_due: ""
  };
};
var invoiceContext = (invoice, daysPastDue) => ({
  customer_name: clean(invoice?.customer_display_name || invoice?.customer_name),
  contact_name: clean(invoice?.contact_name || invoice?.customer_display_name || invoice?.customer_name),
  estimate_number: "",
  invoice_number: clean(invoice?.invoice_number),
  total: usd(invoice?.total),
  balance: usd(invoice?.balance_due),
  due_date: clean(invoice?.due_date),
  company_name: clean(invoice?.company_name) || "CCS Signage",
  days_since_sent: "",
  days_past_due: String(daysPastDue)
});
var suggest = (kind, ctx) => ({
  suggestedSubject: renderTemplate(FOLLOWUP_TEMPLATES[kind]?.subject, ctx),
  suggestedBody: renderTemplate(FOLLOWUP_TEMPLATES[kind]?.body, ctx)
});
function findDueFollowups({ estimates, invoices, activities, rules, now } = {}) {
  const r = normalizeFollowupRules(rules);
  const nowMs = Number.isFinite(toMs(now)) ? toMs(now) : Date.now();
  const acts = Array.isArray(activities) ? activities : [];
  const logged = /* @__PURE__ */ new Set();
  for (const a of acts) {
    const marker = followupLogMarker(a);
    if (marker) logged.add(`${marker.kind}|${marker.targetId}`);
  }
  const isLogged = (kind, targetId) => logged.has(`${kind}|${clean(targetId)}`);
  const out = [];
  const push = (kind, baseMs, thresholdDays, fields) => {
    if (!Number.isFinite(baseMs)) return;
    const dueMs = baseMs + thresholdDays * DAY_MS;
    if (nowMs < dueMs) return;
    if (isLogged(kind, fields.targetId)) return;
    out.push({
      kind,
      stage: FOLLOWUP_KIND_META[kind].stage,
      target: FOLLOWUP_KIND_META[kind].target,
      section: FOLLOWUP_KIND_META[kind].section,
      dueDate: isoDate(dueMs),
      daysOverdue: wholeDays(nowMs - dueMs),
      ...fields
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
      ...suggest("quote_followup_1", ctx)
    };
    push("quote_followup_1", sentMs, r.quote1, fields);
    push("quote_followup_2", sentMs, r.quote2, {
      ...fields,
      ...suggest("quote_followup_2", ctx)
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
      ...suggest("invoice_overdue_1", ctx)
    };
    push("invoice_overdue_1", dueMs, r.inv1, fields);
    push("invoice_overdue_2", dueMs, r.inv2, {
      ...fields,
      ...suggest("invoice_overdue_2", ctx)
    });
  }
  return out.sort(
    (a, b) => b.daysOverdue - a.daysOverdue || a.dueDate.localeCompare(b.dueDate) || a.kind.localeCompare(b.kind) || String(a.targetId).localeCompare(String(b.targetId))
  );
}
function groupDueFollowups(items) {
  const groups = { quote_1: [], quote_2: [], invoice_1: [], invoice_2: [] };
  for (const item of Array.isArray(items) ? items : []) {
    const section = FOLLOWUP_KIND_META[item?.kind]?.section;
    if (section) groups[section].push(item);
  }
  return groups;
}
export {
  DEFAULT_FOLLOWUP_RULES,
  FOLLOWUP_ACTIVITY_SOURCE,
  FOLLOWUP_KINDS,
  FOLLOWUP_KIND_META,
  FOLLOWUP_LOG_SOURCES,
  FOLLOWUP_SECTIONS,
  findDueFollowups,
  followupLogMarker,
  groupDueFollowups,
  hasFollowupLog,
  isInvoiceEligible,
  isQuoteEligible,
  normalizeFollowupRules,
  quoteSentMs
};
