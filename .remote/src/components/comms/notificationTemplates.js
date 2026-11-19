// Customer notification templates — the CoreBridge-style templated
// notification set (estimate ready, proof ready, order built, order
// completed, payment due, monthly statement). Pure + dependency-free besides
// the colocated merge renderer and the shared GlobalSettings persistence
// helpers, so the file bundles cleanly under esbuild for
// scripts/test-notifications.mjs.
//
// Merge fields use the same {{key}} semantics as emailTemplates.renderTemplate
// — unknown/blank keys render as an empty string, so a template can never
// throw or leak a raw placeholder into an outgoing email.
//
// Overrides persist to the GlobalSettings row keyed
// `customerNotificationTemplates` through the same
// loadSingleGlobalSetting / saveGlobalSettingValueIfUnchanged convention
// CommsFollowups.jsx uses for followupAutomationRules — the saved value is a
// bare {kind: {subject, body}} map; kinds or fields absent from it fall back
// to the defaults below.

import { renderTemplate } from "./emailTemplates";
import {
  loadSingleGlobalSetting,
  saveGlobalSettingValueIfUnchanged,
} from "../shared/globalSettingsPersistence";

export const CUSTOMER_NOTIFICATION_TEMPLATES_KEY = "customerNotificationTemplates";

// Canonical merge keys assembled by notifyModel.buildNotifyContext.
export const NOTIFY_MERGE_FIELDS = [
  "customer_name",
  "contact_name",
  "order_ref",
  "estimate_number",
  "invoice_number",
  "total",
  "balance",
  "due_date",
  "statement_date",
  "company_name",
  "salesperson_name",
  "portal_link",
  "product_name",
];

// statusGate is a declarative spec evaluated by notifyModel.statusGateAllows:
// the entity passes when ANY group passes, and a group passes when ALL its
// rules pass. Rule ops: {field, in:[…]}, {field, notIn:[…]}, {field, eq:v},
// {field, gt:n}, {field, truthy:true}. `description` is shown in the template
// editor so staff can see when a send button is offered.
export const NOTIFICATION_KINDS = [
  {
    key: "estimate_ready",
    label: "Estimate ready",
    statusGate: {
      entity: "estimate",
      description: "Sendable while the estimate status is \"sent\" to the customer.",
      anyOf: [{ rules: [{ field: "status", in: ["sent"] }] }],
    },
    mergeFields: [
      "customer_name", "contact_name", "estimate_number", "total",
      "due_date", "salesperson_name", "portal_link", "company_name",
    ],
    defaultSubject: "Your estimate {{estimate_number}} is ready — {{company_name}}",
    defaultBody:
      "Hi {{contact_name}},\n\n" +
      "Your signage estimate for {{customer_name}} is ready to review — estimate " +
      "{{estimate_number}} for {{total}}.\n\n" +
      "You can review and approve it here: {{portal_link}}\n\n" +
      "If anything needs adjusting — sizes, options, budget — just reply and we will " +
      "revise it right away.\n\n" +
      "Thank you,\n{{salesperson_name}}\n{{company_name}}",
  },
  {
    key: "proof_ready",
    label: "Proof ready",
    statusGate: {
      entity: "product",
      description: "Sendable while the product's proof is out for the customer (proof status Sent or Awaiting approval).",
      anyOf: [{ rules: [{ field: "proof_status", in: ["sent", "awaiting_approval"] }] }],
    },
    mergeFields: [
      "customer_name", "contact_name", "order_ref", "product_name",
      "salesperson_name", "portal_link", "company_name",
    ],
    defaultSubject: "Your proof is ready for review — {{order_ref}}",
    defaultBody:
      "Hi {{contact_name}},\n\n" +
      "The proof for {{customer_name}} order {{order_ref}} is ready for your review. " +
      "Please take a look and approve it, or let us know what you would like changed.\n\n" +
      "Review the proof here: {{portal_link}}\n\n" +
      "Production starts as soon as the proof is approved, so a quick response keeps " +
      "your project on schedule.\n\n" +
      "Thank you,\n{{company_name}}",
  },
  {
    key: "order_built",
    label: "Order built",
    statusGate: {
      entity: "product",
      description: "Sendable once a product is built — in quality control, or awaiting pickup/install/shipping/delivery.",
      anyOf: [
        { rules: [{ field: "operational_status", in: ["quality_control"] }] },
        {
          rules: [
            {
              field: "fulfillment_state",
              in: ["awaiting_pickup", "awaiting_installation", "awaiting_shipping", "awaiting_delivery"],
            },
          ],
        },
      ],
    },
    mergeFields: [
      "customer_name", "contact_name", "order_ref", "product_name",
      "due_date", "salesperson_name", "company_name",
    ],
    defaultSubject: "Your order {{order_ref}} has been built — {{company_name}}",
    defaultBody:
      "Hi {{contact_name}},\n\n" +
      "Good news — production on your order {{order_ref}} for {{customer_name}} is " +
      "complete and it has moved to final quality checks.\n\n" +
      "We will be in touch shortly to schedule pickup, delivery, or installation — " +
      "or reply here if you would like to coordinate timing now.\n\n" +
      "Thank you,\n{{company_name}}",
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
            { field: "fulfillment_state", in: ["picked_up", "installed", "shipped", "delivered"] },
          ],
        },
      ],
    },
    mergeFields: [
      "customer_name", "contact_name", "order_ref", "balance",
      "salesperson_name", "company_name",
    ],
    defaultSubject: "Your order {{order_ref}} is complete — {{company_name}}",
    defaultBody:
      "Hi {{contact_name}},\n\n" +
      "Your order {{order_ref}} for {{customer_name}} is complete. Thank you for " +
      "choosing us — we hope the finished work is everything you pictured.\n\n" +
      "If anything is outstanding on the account it will show on your next statement, " +
      "and we are always a reply away for questions or future projects.\n\n" +
      "Thank you,\n{{company_name}}",
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
            { field: "status", notIn: ["draft", "paid", "void"] },
          ],
        },
      ],
    },
    mergeFields: [
      "customer_name", "contact_name", "invoice_number", "total",
      "balance", "due_date", "portal_link", "company_name",
    ],
    defaultSubject: "Payment due on invoice {{invoice_number}} — {{balance}}",
    defaultBody:
      "Hi {{contact_name}},\n\n" +
      "This is a friendly reminder that invoice {{invoice_number}} for " +
      "{{customer_name}} has an open balance of {{balance}} due {{due_date}}.\n\n" +
      "If payment is already on the way, thank you — please disregard this note. " +
      "Otherwise we would appreciate payment at your earliest convenience.\n\n" +
      "Thank you,\n{{company_name}}",
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
        { rules: [{ field: "balance", gt: 0 }] },
      ],
    },
    mergeFields: [
      "customer_name", "contact_name", "statement_date", "balance",
      "invoice_number", "portal_link", "company_name",
    ],
    defaultSubject: "Your {{company_name}} statement — {{statement_date}}",
    defaultBody:
      "Hi {{contact_name}},\n\n" +
      "Your account statement for {{customer_name}} through {{statement_date}} is " +
      "ready — the current open balance is {{balance}}.\n\n" +
      "A copy of the ledger is attached to this email. If anything looks off, or " +
      "payment is already on its way, just reply and let us know.\n\n" +
      "Thank you,\n{{company_name}}",
  },
];

export const NOTIFICATION_KIND_KEYS = NOTIFICATION_KINDS.map((k) => k.key);
export const NOTIFICATION_KIND_MAP = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.key, k]));

const isNonBlank = (v) => typeof v === "string" && v.trim() !== "";

// Bare-map normalizer: only known kinds, only non-blank subject/body strings
// survive — anything else means "use the default" on render. Pass null to
// renderNotification and you get pure defaults; pass a malformed value and it
// degrades to defaults rather than throwing.
export function normalizeNotificationTemplateOverrides(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const kind of NOTIFICATION_KIND_KEYS) {
    const entry = src[kind];
    if (!entry || typeof entry !== "object") continue;
    const cleaned = {};
    if (isNonBlank(entry.subject)) cleaned.subject = entry.subject;
    if (isNonBlank(entry.body)) cleaned.body = entry.body;
    if (Object.keys(cleaned).length) out[kind] = cleaned;
  }
  return out;
}

// The effective {subject, body} template text (unrendered) for a kind —
// override where present, default otherwise. The editor seeds its form from
// this so a reset-to-default is just `effective` vs `default` comparison.
export function notificationTemplateFor(kind, overrides) {
  const entry = NOTIFICATION_KIND_MAP[kind];
  if (!entry) return { subject: "", body: "" };
  const ov = overrides?.[kind];
  return {
    subject: isNonBlank(ov?.subject) ? ov.subject : entry.defaultSubject,
    body: isNonBlank(ov?.body) ? ov.body : entry.defaultBody,
  };
}

// Render a kind's subject+body against a merge context. `overrides` is the
// normalized saved map (or null for defaults). Unknown kinds return blanks —
// callers gate sends on statusGateAllows + a resolvable recipient, so an
// unknown kind can never send anyway.
export function renderNotification(kind, ctx, overrides) {
  const tpl = notificationTemplateFor(kind, overrides);
  return {
    subject: renderTemplate(tpl.subject, ctx || {}),
    body: renderTemplate(tpl.body, ctx || {}),
  };
}

// Effective template text for every kind — the editor's form state.
export function effectiveNotificationTemplates(overrides) {
  return Object.fromEntries(
    NOTIFICATION_KIND_KEYS.map((kind) => [kind, notificationTemplateFor(kind, overrides)]),
  );
}

// Load the saved override map + the GlobalSettings row it came from (the row
// is needed as `loadedRecord` for the concurrency-safe save). Returns
// {record, templates}; a missing row is {record:null, templates:{}}.
export async function loadNotificationTemplates({
  entity,
  settingKey = CUSTOMER_NOTIFICATION_TEMPLATES_KEY,
  label = "Customer notification templates",
} = {}) {
  const record = await loadSingleGlobalSetting({ entity, settingKey, label });
  return { record, templates: normalizeNotificationTemplateOverrides(record?.setting_value) };
}

// Persist the override map through the same concurrency-safe write path as
// the follow-up rules panel (CAS on the loaded row, verify-after-create when
// inserting). `nextTemplates` is normalized before save so callers can hand
// over raw form state.
export async function saveNotificationTemplates({
  entity,
  loadedRecord,
  settingKey = CUSTOMER_NOTIFICATION_TEMPLATES_KEY,
  nextTemplates,
  label = "Customer notification templates",
} = {}) {
  return saveGlobalSettingValueIfUnchanged({
    entity,
    loadedRecord,
    settingKey,
    nextValue: normalizeNotificationTemplateOverrides(nextTemplates),
    label,
  });
}
