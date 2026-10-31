// src/components/comms/emailTemplates.js
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

// src/components/comms/notificationTemplates.js
var NOTIFICATION_KINDS = [
  {
    key: "estimate_ready",
    label: "Estimate ready",
    statusGate: {
      entity: "estimate",
      description: 'Sendable while the estimate status is "sent" to the customer.',
      anyOf: [{ rules: [{ field: "status", in: ["sent"] }] }]
    },
    mergeFields: [
      "customer_name",
      "contact_name",
      "estimate_number",
      "total",
      "due_date",
      "salesperson_name",
      "portal_link",
      "company_name"
    ],
    defaultSubject: "Your estimate {{estimate_number}} is ready \u2014 {{company_name}}",
    defaultBody: "Hi {{contact_name}},\n\nYour signage estimate for {{customer_name}} is ready to review \u2014 estimate {{estimate_number}} for {{total}}.\n\nYou can review and approve it here: {{portal_link}}\n\nIf anything needs adjusting \u2014 sizes, options, budget \u2014 just reply and we will revise it right away.\n\nThank you,\n{{salesperson_name}}\n{{company_name}}"
  },
  {
    key: "proof_ready",
    label: "Proof ready",
    statusGate: {
      entity: "product",
      description: "Sendable while the product's proof is out for the customer (proof status Sent or Awaiting approval).",
      anyOf: [{ rules: [{ field: "proof_status", in: ["sent", "awaiting_approval"] }] }]
    },
    mergeFields: [
      "customer_name",
      "contact_name",
      "order_ref",
      "product_name",
      "salesperson_name",
      "portal_link",
      "company_name"
    ],
    defaultSubject: "Your proof is ready for review \u2014 {{order_ref}}",
    defaultBody: "Hi {{contact_name}},\n\nThe proof for {{customer_name}} order {{order_ref}} is ready for your review. Please take a look and approve it, or let us know what you would like changed.\n\nReview the proof here: {{portal_link}}\n\nProduction starts as soon as the proof is approved, so a quick response keeps your project on schedule.\n\nThank you,\n{{company_name}}"
  },
  {
    key: "order_built",
    label: "Order built",
    statusGate: {
      entity: "product",
      description: "Sendable once a product is built \u2014 in quality control, or awaiting pickup/install/shipping/delivery.",
      anyOf: [
        { rules: [{ field: "operational_status", in: ["quality_control"] }] },
        {
          rules: [
            {
              field: "fulfillment_state",
              in: ["awaiting_pickup", "awaiting_installation", "awaiting_shipping", "awaiting_delivery"]
            }
          ]
        }
      ]
    },
    mergeFields: [
      "customer_name",
      "contact_name",
      "order_ref",
      "product_name",
      "due_date",
      "salesperson_name",
      "company_name"
    ],
    defaultSubject: "Your order {{order_ref}} has been built \u2014 {{company_name}}",
    defaultBody: "Hi {{contact_name}},\n\nGood news \u2014 production on your order {{order_ref}} for {{customer_name}} is complete and it has moved to final quality checks.\n\nWe will be in touch shortly to schedule pickup, delivery, or installation \u2014 or reply here if you would like to coordinate timing now.\n\nThank you,\n{{company_name}}"
  },
  {
    key: "order_completed",
    label: "Order completed",
    statusGate: {
      entity: "workOrder",
      description: "Sendable when the work order is marked complete, or a product reached a terminal fulfillment state (picked up / installed / shipped / delivered).",
      anyOf: [
        { rules: [{ field: "completed", eq: true }] },
        {
          rules: [
            { field: "fulfillment_state", in: ["picked_up", "installed", "shipped", "delivered"] }
          ]
        }
      ]
    },
    mergeFields: [
      "customer_name",
      "contact_name",
      "order_ref",
      "balance",
      "salesperson_name",
      "company_name"
    ],
    defaultSubject: "Your order {{order_ref}} is complete \u2014 {{company_name}}",
    defaultBody: "Hi {{contact_name}},\n\nYour order {{order_ref}} for {{customer_name}} is complete. Thank you for choosing us \u2014 we hope the finished work is everything you pictured.\n\nIf anything is outstanding on the account it will show on your next statement, and we are always a reply away for questions or future projects.\n\nThank you,\n{{company_name}}"
  },
  {
    key: "payment_due",
    label: "Payment due",
    statusGate: {
      entity: "invoice",
      description: "Sendable while an issued invoice has an open balance (draft, paid and void invoices are excluded).",
      anyOf: [
        {
          rules: [
            { field: "balance_due", gt: 0 },
            { field: "status", notIn: ["draft", "paid", "void"] }
          ]
        }
      ]
    },
    mergeFields: [
      "customer_name",
      "contact_name",
      "invoice_number",
      "total",
      "balance",
      "due_date",
      "portal_link",
      "company_name"
    ],
    defaultSubject: "Payment due on invoice {{invoice_number}} \u2014 {{balance}}",
    defaultBody: "Hi {{contact_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{customer_name}} has an open balance of {{balance}} due {{due_date}}.\n\nIf payment is already on the way, thank you \u2014 please disregard this note. Otherwise we would appreciate payment at your earliest convenience.\n\nThank you,\n{{company_name}}"
  },
  {
    key: "monthly_statement",
    label: "Monthly statement",
    statusGate: {
      entity: "statement",
      description: "Sendable while the generated statement has activity (at least one invoice, one payment, or an open balance).",
      anyOf: [
        { rules: [{ field: "invoiceCount", gt: 0 }] },
        { rules: [{ field: "paymentCount", gt: 0 }] },
        { rules: [{ field: "balance", gt: 0 }] }
      ]
    },
    mergeFields: [
      "customer_name",
      "contact_name",
      "statement_date",
      "balance",
      "invoice_number",
      "portal_link",
      "company_name"
    ],
    defaultSubject: "Your {{company_name}} statement \u2014 {{statement_date}}",
    defaultBody: "Hi {{contact_name}},\n\nYour account statement for {{customer_name}} through {{statement_date}} is ready \u2014 the current open balance is {{balance}}.\n\nA copy of the ledger is attached to this email. If anything looks off, or payment is already on its way, just reply and let us know.\n\nThank you,\n{{company_name}}"
  }
];
var NOTIFICATION_KIND_KEYS = NOTIFICATION_KINDS.map((k) => k.key);
var NOTIFICATION_KIND_MAP = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.key, k]));

// src/components/comms/notifyModel.js
var clean = (v) => String(v ?? "").trim();
var norm = (v) => clean(v).toLowerCase();
var num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
var usd = (n) => `$${num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function evalGateRule(entity, rule) {
  if (!rule || typeof rule !== "object") return true;
  const value = entity?.[rule.field];
  if (Array.isArray(rule.in)) return rule.in.includes(norm(value));
  if (Array.isArray(rule.notIn)) return !rule.notIn.includes(norm(value));
  if (rule.eq !== void 0) return value === rule.eq;
  if (rule.gt !== void 0) return num(value, NaN) > rule.gt;
  if (rule.truthy) return Boolean(value);
  return true;
}
function statusGateAllows(kind, entity) {
  const entry = NOTIFICATION_KIND_MAP[clean(kind)];
  if (!entry) return false;
  const groups = entry.statusGate?.anyOf;
  if (!entity || typeof entity !== "object") return false;
  if (!Array.isArray(groups) || !groups.length) return true;
  return groups.some(
    (group) => (Array.isArray(group?.rules) ? group.rules : []).every((rule) => evalGateRule(entity, rule))
  );
}
var DAY_MS = 24 * 60 * 60 * 1e3;
var toMs = (v) => {
  const s = clean(v);
  if (!s) return NaN;
  const t = Date.parse(s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isFinite(t) ? t : NaN;
};
var isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
var estimateDueDate = (estimate) => {
  const explicit = clean(estimate?.quote_expiration_date);
  if (explicit) return explicit;
  const issueMs = toMs(estimate?.quote_issue_date || estimate?.sent_date || estimate?.sent_at);
  const validDays = Number(estimate?.quote_valid_days);
  if (Number.isFinite(issueMs) && Number.isFinite(validDays)) return isoDate(issueMs + validDays * DAY_MS);
  return "";
};
var contactNameOf = (customer) => {
  const full = [clean(customer?.contact_first_name), clean(customer?.contact_last_name)].filter(Boolean).join(" ");
  return full || clean(customer?.billing_contact_name) || clean(customer?.contact_name);
};
function buildNotifyContext({
  customer,
  estimate,
  workOrder,
  product,
  invoice,
  statement,
  company,
  portalLink
} = {}) {
  const customerName = clean(customer?.company_name) || clean(customer?.name) || clean(estimate?.client_name) || clean(workOrder?.client_name) || clean(invoice?.customer_display_name) || clean(invoice?.customer_name);
  const contactName = contactNameOf(customer) || clean(estimate?.contact_name) || clean(invoice?.contact_name) || customerName;
  const orderRef = clean(workOrder?.corbridge_invoice_number) || clean(workOrder?.title) || clean(estimate?.estimate_number) || clean(invoice?.invoice_number);
  const estimateNumber = clean(estimate?.estimate_number) || clean(workOrder?.corbridge_invoice_number);
  const invoiceNumber = clean(invoice?.invoice_number);
  const total = estimate?.quote_total ?? invoice?.total ?? workOrder?.total ?? statement?.totalBilled;
  const balance = invoice?.balance_due ?? statement?.balance ?? (Number.isFinite(Number(workOrder?.balance_due)) ? Number(workOrder.balance_due) : "");
  const dueDate = clean(invoice?.due_date) || estimateDueDate(estimate) || clean(statement?.asOf) || clean(workOrder?.project_install_date) || clean(product?.product_due_date);
  const salesperson = clean(workOrder?.sales_rep) || clean(workOrder?.estimator) || clean(estimate?.salesperson) || clean(customer?.salesperson);
  const link = clean(portalLink) || clean(company?.customer_portal_url) || clean(company?.portal_url) || clean(company?.company_website);
  return {
    customer_name: customerName,
    contact_name: contactName,
    order_ref: orderRef,
    estimate_number: estimateNumber,
    invoice_number: invoiceNumber,
    total: total === void 0 || total === null || total === "" ? "" : usd(total),
    balance: balance === "" ? "" : usd(balance),
    due_date: dueDate,
    statement_date: clean(statement?.asOf),
    company_name: clean(company?.company_name) || "CCS Signage",
    salesperson_name: salesperson,
    portal_link: link,
    product_name: clean(product?.description) || clean(product?.client_product_name)
  };
}
function resolveCustomerEmail(customer, fallback = "") {
  if (clean(fallback).includes("@")) return clean(fallback);
  const c = customer || {};
  const candidates = [
    c.contact_email,
    c.billing_contact_email,
    c.email,
    c.contact_office_email,
    c.billing_email,
    ...Array.isArray(c.contacts) ? c.contacts.map((ct) => ct?.email) : []
  ];
  return candidates.map((v) => clean(v).toLowerCase()).find((v) => v.includes("@")) || "";
}
var SAMPLE_NOTIFY_CONTEXT = {
  customer_name: "Acme Signs & Lighting",
  contact_name: "Amy Rivera",
  order_ref: "INV-01042",
  estimate_number: "EST-01042",
  invoice_number: "INV-01088",
  total: "$4,250.00",
  balance: "$1,875.50",
  due_date: "2026-03-15",
  statement_date: "2026-02-28",
  company_name: "CCS Signage",
  salesperson_name: "brett@ccssigns.com",
  portal_link: "https://portal.ccssigns.com/orders/INV-01042",
  product_name: "Illuminated channel letters"
};
export {
  SAMPLE_NOTIFY_CONTEXT,
  buildNotifyContext,
  resolveCustomerEmail,
  statusGateAllows
};
