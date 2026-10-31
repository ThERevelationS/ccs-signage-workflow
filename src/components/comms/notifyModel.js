// Pure context/gating model for the customer notification templates
// (src/components/comms/notificationTemplates.js). No I/O — callers load
// entities and pass plain rows in, so the module bundles cleanly under
// esbuild for scripts/test-notifications.mjs.
//
//   buildNotifyContext({customer, estimate, workOrder, invoice, company, …})
//     assembles the merge context renderNotification consumes.
//   statusGateAllows(kind, entity)
//     evaluates the registry's declarative statusGate against one entity.

import { NOTIFICATION_KIND_MAP } from "./notificationTemplates";

const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();
const num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const usd = (n) =>
  `$${num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// --- Status gates ------------------------------------------------------------

// A single rule against an entity field. Supported ops mirror the registry
// spec: in/notIn compare case-insensitively on strings, eq is strict-equal,
// gt is numeric, truthy is a plain boolean check.
function evalGateRule(entity, rule) {
  if (!rule || typeof rule !== "object") return true;
  const value = entity?.[rule.field];
  if (Array.isArray(rule.in)) return rule.in.includes(norm(value));
  if (Array.isArray(rule.notIn)) return !rule.notIn.includes(norm(value));
  if (rule.eq !== undefined) return value === rule.eq;
  if (rule.gt !== undefined) return num(value, NaN) > rule.gt;
  if (rule.truthy) return Boolean(value);
  return true;
}

/**
 * Does the entity satisfy the notification kind's send gate?
 *   kind   — a NOTIFICATION_KINDS key (proof_ready, monthly_statement, …)
 *   entity — the gated row: an AllInOneEstimate, a work-order product, a
 *            WorkOrder, an invoicingAction invoice snapshot, or a built
 *            statement — whichever the kind's statusGate.entity targets.
 * An unknown kind fails closed; a kind with no groups requires a truthy
 * entity only.
 */
export function statusGateAllows(kind, entity) {
  const entry = NOTIFICATION_KIND_MAP[clean(kind)];
  if (!entry) return false;
  const groups = entry.statusGate?.anyOf;
  if (!entity || typeof entity !== "object") return false;
  if (!Array.isArray(groups) || !groups.length) return true;
  return groups.some((group) =>
    (Array.isArray(group?.rules) ? group.rules : []).every((rule) => evalGateRule(entity, rule)),
  );
}

// --- Merge context -------------------------------------------------------------

// Estimate expiry mirrors followupModel.quoteContext: explicit
// quote_expiration_date first, else issue date + quote_valid_days.
const DAY_MS = 24 * 60 * 60 * 1000;
const toMs = (v) => {
  const s = clean(v);
  if (!s) return NaN;
  const t = Date.parse(s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isFinite(t) ? t : NaN;
};
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

const estimateDueDate = (estimate) => {
  const explicit = clean(estimate?.quote_expiration_date);
  if (explicit) return explicit;
  const issueMs = toMs(estimate?.quote_issue_date || estimate?.sent_date || estimate?.sent_at);
  const validDays = Number(estimate?.quote_valid_days);
  if (Number.isFinite(issueMs) && Number.isFinite(validDays)) return isoDate(issueMs + validDays * DAY_MS);
  return "";
};

const contactNameOf = (customer) => {
  const full = [clean(customer?.contact_first_name), clean(customer?.contact_last_name)]
    .filter(Boolean)
    .join(" ");
  return full || clean(customer?.billing_contact_name) || clean(customer?.contact_name);
};

/**
 * Assemble the merge context for renderNotification. Every parameter is
 * optional — whatever is missing renders as an empty merge field, which is
 * exactly the send-safe behavior the templates rely on.
 *   customer  — Customer entity row (company_name, contacts, emails)
 *   estimate  — AllInOneEstimate row (estimate_number, quote_total, dates)
 *   workOrder — WorkOrder row (corbridge_invoice_number/title, sales_rep)
 *   product   — work-order products[] row (description, proof_status)
 *   invoice   — invoicingAction snapshot (invoice_number, total, balance_due)
 *   statement — buildStatement result (asOf, balance, totals)
 *   company   — QuoteDefaults row (company_name, company_website, portal urls)
 *   portalLink — explicit override for {{portal_link}} when the caller knows it
 */
export function buildNotifyContext({
  customer,
  estimate,
  workOrder,
  product,
  invoice,
  statement,
  company,
  portalLink,
} = {}) {
  const customerName =
    clean(customer?.company_name) ||
    clean(customer?.name) ||
    clean(estimate?.client_name) ||
    clean(workOrder?.client_name) ||
    clean(invoice?.customer_display_name) ||
    clean(invoice?.customer_name);

  const contactName =
    contactNameOf(customer) ||
    clean(estimate?.contact_name) ||
    clean(invoice?.contact_name) ||
    customerName;

  const orderRef =
    clean(workOrder?.corbridge_invoice_number) ||
    clean(workOrder?.title) ||
    clean(estimate?.estimate_number) ||
    clean(invoice?.invoice_number);

  const estimateNumber = clean(estimate?.estimate_number) || clean(workOrder?.corbridge_invoice_number);
  const invoiceNumber = clean(invoice?.invoice_number);

  const total =
    estimate?.quote_total ??
    invoice?.total ??
    workOrder?.total ??
    statement?.totalBilled;

  const balance =
    invoice?.balance_due ??
    statement?.balance ??
    (Number.isFinite(Number(workOrder?.balance_due)) ? Number(workOrder.balance_due) : "");

  const dueDate =
    clean(invoice?.due_date) ||
    estimateDueDate(estimate) ||
    clean(statement?.asOf) ||
    clean(workOrder?.project_install_date) ||
    clean(product?.product_due_date);

  const salesperson =
    clean(workOrder?.sales_rep) ||
    clean(workOrder?.estimator) ||
    clean(estimate?.salesperson) ||
    clean(customer?.salesperson);

  // portal_link is a placeholder — no customer portal exists yet, so the
  // field resolves from the customer-portal url in company settings (or an
  // explicit caller override) and renders empty until one is configured.
  const link =
    clean(portalLink) ||
    clean(company?.customer_portal_url) ||
    clean(company?.portal_url) ||
    clean(company?.company_website);

  return {
    customer_name: customerName,
    contact_name: contactName,
    order_ref: orderRef,
    estimate_number: estimateNumber,
    invoice_number: invoiceNumber,
    total: total === undefined || total === null || total === "" ? "" : usd(total),
    balance: balance === "" ? "" : usd(balance),
    due_date: dueDate,
    statement_date: clean(statement?.asOf),
    company_name: clean(company?.company_name) || "CCS Signage",
    salesperson_name: salesperson,
    portal_link: link,
    product_name: clean(product?.description) || clean(product?.client_product_name),
  };
}

// Recipient resolution mirrors FollowupQueue/invoicingAction.email_invoice:
// contact email first, then the customer record's known addresses.
export function resolveCustomerEmail(customer, fallback = "") {
  if (clean(fallback).includes("@")) return clean(fallback);
  const c = customer || {};
  const candidates = [
    c.contact_email, c.billing_contact_email, c.email,
    c.contact_office_email, c.billing_email,
    ...(Array.isArray(c.contacts) ? c.contacts.map((ct) => ct?.email) : []),
  ];
  return candidates.map((v) => clean(v).toLowerCase()).find((v) => v.includes("@")) || "";
}

// Sample context for the template editor's live preview — representative of a
// real send so staff see fully merged output, not placeholders.
export const SAMPLE_NOTIFY_CONTEXT = {
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
  product_name: "Illuminated channel letters",
};
