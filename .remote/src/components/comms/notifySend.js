// Send-side helpers for the customer notification templates — the impure
// counterpart of notifyModel/notificationTemplates. Centralizes three things
// so each send point stays a few lines:
//
//   1. invokeStaffEmail — the session-authed sendStaffEmail bridge to the
//      sendGmail function ({session_token, to, subject, body, cc?, kind?} →
//      {ok:true} | {error,status}). It degrades gracefully while the bridge
//      is not yet deployed: a function-missing response surfaces as a normal
//      "could not send" error, never a crash.
//   2. sendCustomerNotification — resolves the saved template overrides
//      (falling back to defaults when the setting is unreadable), renders,
//      sends, then writes the OpportunityActivity audit/dedupe row through
//      the same ensureIdempotentEntityCreate convention FollowupQueue uses:
//      event_type 'E-Mail: Follow Up', source 'auto_followup' (the entity
//      enum), details.notify_* markers carrying the finer origin.
//   3. loadCompanyDefaults — QuoteDefaults for {{company_name}} merges.

import { base44 } from "@/api/base44Client";
import { Customer, GlobalSettings, OpportunityActivity } from "@/api/gatedEntities";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { loadQuoteDefaults } from "@/components/estimator/quoteDefaults";
import {
  CUSTOMER_NOTIFICATION_TEMPLATES_KEY,
  NOTIFICATION_KIND_MAP,
  normalizeNotificationTemplateOverrides,
  renderNotification,
} from "./notificationTemplates";

const clean = (v) => String(v ?? "").trim();

// Send-side of the sendStaffEmail contract. Resolves the axios-style {data}
// envelope the SDK returns and treats {ok:true} as the only success —
// {error,status} payloads and transport failures both throw a plain Error.
export async function invokeStaffEmail({ sessionToken, to, subject, body, cc, kind } = {}) {
  const res = await base44.functions.invoke("sendStaffEmail", {
    session_token: sessionToken,
    to: clean(to),
    subject: clean(subject),
    body: clean(body),
    ...(clean(cc) ? { cc: clean(cc) } : {}),
    ...(clean(kind) ? { kind: clean(kind) } : {}),
  });
  const data = res?.data || res;
  if (data?.ok === true) return data;
  throw new Error(clean(data?.error) || "The notification email could not be sent.");
}

// A dedupe/audit row — identical convention to FollowupQueue.writeLog so the
// follow-up model's marker dedupe and the CRM activity stream both read it.
// The entity `source` enum only allows manual/auto_followup/system, so the
// exact origin (customer_notification) lives in details.notify_source.
export async function writeNotificationLog({
  kind,
  subject,
  body,
  to,
  actor,
  customerId,
  customerName,
  contactName,
  workOrderId,
  opportunityId,
  targetId,
  targetRef,
  disposition = "sent",
} = {}) {
  const entry = NOTIFICATION_KIND_MAP[clean(kind)];
  return ensureIdempotentEntityCreate({
    entity: OpportunityActivity,
    keyField: "creation_request_key",
    key: newCreationRequestKey("notify"),
    label: "Customer notification log",
    data: {
      event_type: "E-Mail: Follow Up",
      summary: clean(subject) || entry?.label || "Customer notification",
      subject: clean(subject),
      notes: clean(body),
      contact_name: clean(contactName),
      contact_id: "",
      company_name: clean(customerName),
      customer_id: clean(customerId),
      opportunity_id: clean(opportunityId),
      work_order_id: clean(workOrderId),
      assigned_to: clean(actor),
      due_at: "",
      completed_at: new Date().toISOString(),
      outcome: "completed",
      source: "auto_followup",
      actor: clean(actor),
      details: {
        notify_kind: clean(kind),
        notify_target_id: clean(targetId),
        notify_target_ref: clean(targetRef),
        notify_disposition: clean(disposition),
        notify_source: "customer_notification",
        sent_to: clean(to),
      },
    },
  });
}

// QuoteDefaults (company_name, portal/website for {{portal_link}}). A failed
// read degrades to null — company_name then falls back to "CCS Signage" in
// buildNotifyContext.
export async function loadCompanyDefaults() {
  try {
    return await loadQuoteDefaults();
  } catch {
    return null;
  }
}

// Saved template overrides; an unreadable setting (duplicate rows, transient
// error) falls back to defaults rather than blocking a send.
export async function loadSavedNotificationOverrides() {
  try {
    const record = await loadSingleGlobalSetting({
      entity: GlobalSettings,
      settingKey: CUSTOMER_NOTIFICATION_TEMPLATES_KEY,
      label: "Customer notification templates",
    });
    return normalizeNotificationTemplateOverrides(record?.setting_value);
  } catch {
    return {};
  }
}

// Lazily resolve a Customer row by id — used when the sending surface has a
// customer_id but not the full record (e.g. a work order in the queue).
export async function loadCustomerById(customerId) {
  const id = clean(customerId);
  if (!id) return null;
  try {
    const rows = await Customer.filter({ id });
    return Array.isArray(rows) ? rows.find((r) => clean(r?.id) === id) || rows[0] || null : null;
  } catch {
    return null;
  }
}

/**
 * Render + send + log a customer notification.
 *   kind         — NOTIFICATION_KINDS key (proof_ready, monthly_statement, …)
 *   ctx          — buildNotifyContext output (merge fields)
 *   to           — recipient email (must contain "@"; caller resolves)
 *   cc           — optional CC address (billing, salesperson)
 *   sessionToken — staff session token for the sendStaffEmail bridge
 *   actor        — staff email stamped on the audit row
 *   log          — {targetId, targetRef, customerId, customerName,
 *                   contactName, workOrderId, opportunityId}
 *   overrides    — optional pre-loaded override map (skips the settings read)
 * Returns {subject, body, logRow}. Throws when the send fails; the audit row
 * is written only after a confirmed send so it always reflects real sends.
 */
export async function sendCustomerNotification({
  kind,
  ctx,
  to,
  cc,
  sessionToken,
  actor,
  log = {},
  overrides,
} = {}) {
  const recipient = clean(to);
  if (!recipient.includes("@")) {
    throw new Error("Add a recipient email address first.");
  }
  const templates = overrides ?? (await loadSavedNotificationOverrides());
  const { subject, body } = renderNotification(kind, ctx, templates);

  await invokeStaffEmail({ sessionToken, to: recipient, subject, body, cc, kind });

  // The email is out — a log failure is reported but never un-sends it.
  let logRow = null;
  let logError = "";
  try {
    logRow = await writeNotificationLog({
      kind,
      subject,
      body,
      to: recipient,
      actor,
      ...log,
    });
  } catch (e) {
    logError = e?.message || "unknown error";
  }
  return { subject, body, logRow, logError };
}
