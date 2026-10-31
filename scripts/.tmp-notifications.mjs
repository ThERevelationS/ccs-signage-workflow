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

// src/components/estimator/builder/builderEntityPersistence.js
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
async function replaceBuilderEntityFieldsIfUnchanged({
  entity,
  id,
  expectedUpdatedAt = "",
  expectedFields,
  nextFields,
  guardFields = {},
  label = "Builder record",
  maxAttempts = 3
} = {}) {
  const recordId = String(id || "").trim();
  const expectedVersion = String(expectedUpdatedAt || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const fieldNames = desired ? Object.keys(desired) : [];
  if (!recordId || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(recordId);
    if (!current?.id) throw new Error(`${label} could not be re-read before saving.`);
    for (const [fieldName, value] of Object.entries(guards)) {
      if (!sameValue(current[fieldName], value)) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    if (expectedVersion && String(current.updated_date || "") !== expectedVersion) {
      throw new Error(`${label} changed in another session. Reload before saving.`);
    }
    for (const fieldName of fieldNames) {
      if (!sameValue(current[fieldName], expected[fieldName]) && !sameValue(current[fieldName], desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const currentVersion = String(current.updated_date || "").trim();
    if (!currentVersion) throw new Error(`${label} is missing its current version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id: recordId, updated_date: currentVersion },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(recordId).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) return afterError;
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional-update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(recordId).catch(() => null);
      if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
      return saved;
    }
  }
  throw new Error(`${label} changed repeatedly while saving. Reload and try again.`);
}
var replaceEntityFieldsIfUnchanged = replaceBuilderEntityFieldsIfUnchanged;

// src/components/shared/globalSettingsPersistence.js
function normalize2(value) {
  if (Array.isArray(value)) return value.map(normalize2);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize2(value[key]);
    return out;
  }, {});
}
function sameValue2(a, b) {
  return JSON.stringify(normalize2(a)) === JSON.stringify(normalize2(b));
}
async function loadSingleGlobalSetting({ entity, settingKey, label = "Global setting" } = {}) {
  const key = String(settingKey || "").trim();
  if (!key || typeof entity?.filter !== "function") {
    throw new Error(`${label} could not load its saved setting.`);
  }
  const rows = await entity.filter({ setting_key: key });
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
  if (rows.length > 1) {
    throw new Error(`${label} has ${rows.length} records for setting key ${key}. No value was changed; review the duplicate settings first.`);
  }
  return rows[0] || null;
}
async function saveGlobalSettingValueIfUnchanged({
  entity,
  loadedRecord,
  settingKey,
  nextValue,
  label = "Global setting"
} = {}) {
  const key = String(settingKey || "").trim();
  if (!key || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe save.`);
  }
  if (loadedRecord?.id) {
    if (String(loadedRecord.setting_key || "") !== key) {
      throw new Error(`${label} loaded a different setting key. Reload before saving.`);
    }
    return replaceEntityFieldsIfUnchanged({
      entity,
      id: loadedRecord.id,
      expectedUpdatedAt: loadedRecord.updated_date || "",
      expectedFields: { setting_value: loadedRecord.setting_value },
      nextFields: { setting_value: nextValue },
      guardFields: { setting_key: key },
      label
    });
  }
  const before = await loadSingleGlobalSetting({ entity, settingKey: key, label });
  if (before?.id) {
    throw new Error(`${label} was created in another session after this dialog loaded. Reload settings before saving so the newer value is not overwritten.`);
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create({ setting_key: key, setting_value: nextValue });
  } catch (error) {
    createError = error;
  }
  let after;
  try {
    after = await entity.filter({ setting_key: key });
  } catch (verifyError) {
    if (createError) throw createError;
    throw verifyError;
  }
  if (!Array.isArray(after)) throw new Error(`${label} final verification did not return a record list.`);
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently in more than one session. No duplicate setting was deleted automatically; review the ${after.length} rows before saving again.`);
  }
  if (after.length === 1) {
    const saved = after[0];
    if (!sameValue2(saved.setting_value, nextValue)) {
      throw new Error(`${label} was created concurrently with a different value. Reload and review the saved setting.`);
    }
    return saved;
  }
  if (createError) throw createError;
  if (created?.id) {
    throw new Error(`${label} returned a create receipt but could not be verified. Do not retry blindly; reload settings first.`);
  }
  throw new Error(`${label} could not verify whether the setting was created.`);
}

// src/components/comms/notificationTemplates.js
var CUSTOMER_NOTIFICATION_TEMPLATES_KEY = "customerNotificationTemplates";
var NOTIFY_MERGE_FIELDS = [
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
  "product_name"
];
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
var isNonBlank = (v) => typeof v === "string" && v.trim() !== "";
function normalizeNotificationTemplateOverrides(raw) {
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
function notificationTemplateFor(kind, overrides) {
  const entry = NOTIFICATION_KIND_MAP[kind];
  if (!entry) return { subject: "", body: "" };
  const ov = overrides?.[kind];
  return {
    subject: isNonBlank(ov?.subject) ? ov.subject : entry.defaultSubject,
    body: isNonBlank(ov?.body) ? ov.body : entry.defaultBody
  };
}
function renderNotification(kind, ctx, overrides) {
  const tpl = notificationTemplateFor(kind, overrides);
  return {
    subject: renderTemplate(tpl.subject, ctx || {}),
    body: renderTemplate(tpl.body, ctx || {})
  };
}
function effectiveNotificationTemplates(overrides) {
  return Object.fromEntries(
    NOTIFICATION_KIND_KEYS.map((kind) => [kind, notificationTemplateFor(kind, overrides)])
  );
}
async function loadNotificationTemplates({
  entity,
  settingKey = CUSTOMER_NOTIFICATION_TEMPLATES_KEY,
  label = "Customer notification templates"
} = {}) {
  const record = await loadSingleGlobalSetting({ entity, settingKey, label });
  return { record, templates: normalizeNotificationTemplateOverrides(record?.setting_value) };
}
async function saveNotificationTemplates({
  entity,
  loadedRecord,
  settingKey = CUSTOMER_NOTIFICATION_TEMPLATES_KEY,
  nextTemplates,
  label = "Customer notification templates"
} = {}) {
  return saveGlobalSettingValueIfUnchanged({
    entity,
    loadedRecord,
    settingKey,
    nextValue: normalizeNotificationTemplateOverrides(nextTemplates),
    label
  });
}
export {
  CUSTOMER_NOTIFICATION_TEMPLATES_KEY,
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_KIND_MAP,
  NOTIFY_MERGE_FIELDS,
  effectiveNotificationTemplates,
  loadNotificationTemplates,
  normalizeNotificationTemplateOverrides,
  notificationTemplateFor,
  renderNotification,
  saveNotificationTemplates
};
