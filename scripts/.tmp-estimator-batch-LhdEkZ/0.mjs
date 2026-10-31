// synthetic:@/api/base44Client
var base44 = { entities: {}, functions: { invoke: (...args) => globalThis.__estimatorBatchInvoke(...args) } };

// synthetic:@/functions/sendGmail
var sendGmail = () => {
  throw new Error("No real email in unit tests");
};

// src/components/estimator/quoteLifecycle.js
var whole = (value, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};
function localDateStamp(value = /* @__PURE__ */ new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function quoteIssueKey(estimateId, quoteVersion) {
  const id = String(estimateId || "").trim();
  const version = Math.max(0, whole(quoteVersion));
  return id && version > 0 ? `estimate:${id}:quote:v${version}` : "";
}
function quoteExpirationDate(issueDate, validDays = 30, fallbackDate = /* @__PURE__ */ new Date()) {
  const baseText = String(issueDate || localDateStamp(fallbackDate)).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseText);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() + Math.max(0, whole(validDays, 30)));
  return localDateStamp(date);
}

// src/components/estimator/quoteDeliveryService.js
var escapeHtml = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
function interpolateEmailTemplate(template, estimate = {}) {
  const values = {
    estimate_number: String(estimate.estimate_number || "").trim(),
    project_name: String(estimate.project_name || "").trim(),
    client_name: String(estimate.client_name || "").trim(),
    contact_name: String(estimate.order_contact || estimate.contact_name || "").trim(),
    company_name: String(estimate.company_name || "Cincinnati Custom Signs").trim(),
    quote_total: `$${(Number.isFinite(Number(estimate.quote_total)) ? Number(estimate.quote_total) : 0).toFixed(2)}`,
    quote_valid_until: String(estimate.quote_valid_until || estimate.quote_expiration_date || "").trim()
  };
  return String(template || "").replace(
    /\{(\w+)\}/g,
    (match, key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}
function defaultQuoteEmailSubject(estimate = {}) {
  const subjectTemplate = String(estimate.email_subject_template || "").trim();
  if (subjectTemplate) {
    const out = interpolateEmailTemplate(subjectTemplate, estimate).trim();
    if (out) return out.replace(/[\r\n]+/g, " ");
  }
  const number = String(estimate.estimate_number || "").replace(/[\r\n]+/g, " ").trim();
  const project = String(estimate.project_name || "").replace(/[\r\n]+/g, " ").trim();
  return [number ? `Estimate #${number}` : "Project Estimate", project].filter(Boolean).join(" \u2014 ");
}
function defaultQuoteEmailMessage(estimate = {}) {
  const messageTemplate = String(estimate.email_message_template || "").trim();
  if (messageTemplate) {
    const out = interpolateEmailTemplate(messageTemplate, estimate).trim();
    if (out) return out;
  }
  const contact = String(estimate.order_contact || estimate.contact_name || "").trim();
  const greeting = contact ? `Good afternoon ${contact},` : "Good afternoon,";
  const company = String(estimate.company_name || "Cincinnati Custom Signs").trim();
  return `${greeting}

Please find the attached estimate for ${estimate.project_name || "your project"}. Please let us know if you have any questions or if there is anything you would like us to review.

Thank you,
${company}`;
}
function quoteEmailBodyHtml(message, signature = "") {
  const sig = String(signature || "").trim();
  const sigHtml = sig ? `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.55;color:#555;white-space:pre-line;border-top:1px solid #ddd;margin-top:16px;padding-top:12px;">${escapeHtml(sig)}</div>` : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;white-space:pre-line;">${escapeHtml(message)}</div>${sigHtml}`;
}
function base64AttachmentBytes(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot verify the quote PDF fingerprint.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
async function archiveQuoteAttachment(attachment) {
  if (!attachment?.base64 || !attachment?.filename) throw new Error("Quote PDF attachment is incomplete.");
  const bytes = base64AttachmentBytes(attachment.base64);
  const file = new File([bytes], attachment.filename, { type: attachment.mimeType || "application/pdf" });
  const [sha256, upload] = await Promise.all([
    sha256Hex(bytes),
    base44.integrations.Core.UploadFile({ file })
  ]);
  const fileUrl = upload?.file_url || upload?.url || "";
  if (!fileUrl) throw new Error("Quote PDF archive upload did not return a file URL.");
  return { fileUrl, sha256, sizeBytes: bytes.byteLength };
}
async function ensureQuoteDeliveryAudit(data = {}, sessionToken = "") {
  const response = await base44.functions.invoke("recordEstimateQuoteDelivery", {
    session_token: sessionToken,
    delivery: data
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.delivery?.id) {
    throw new Error("Quote delivery audit could not be verified after the email was sent.");
  }
  return result.delivery;
}
async function authorizeEstimateQuoteSend({ estimateId, quoteTotal, sessionToken }) {
  const estimateKey = String(estimateId || "").trim();
  if (!estimateKey) throw new Error("The estimate must be saved before its quote can be emailed.");
  let response;
  try {
    response = await base44.functions.invoke("recordEstimateQuoteDelivery", {
      session_token: sessionToken,
      action: "authorize_send",
      estimate_id: estimateKey,
      quote_total: Number(quoteTotal || 0)
    });
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.data?.error || error?.message || "Quote send authorization could not be verified.");
  }
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (result?.allowed !== true) throw new Error("This quote is not approved for sending.");
  return result;
}
async function approveEstimateQuote({ estimateId, quoteTotal, sessionToken }) {
  const estimateKey = String(estimateId || "").trim();
  if (!estimateKey) throw new Error("The estimate must be saved before its quote can be approved.");
  let response;
  try {
    response = await base44.functions.invoke("recordEstimateQuoteDelivery", {
      session_token: sessionToken,
      action: "approve_quote",
      estimate_id: estimateKey,
      quote_total: Number(quoteTotal || 0)
    });
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.data?.error || error?.message || "Quote approval could not be recorded.");
  }
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.success || !result?.internal_approval?.approved_at) {
    throw new Error("Quote approval could not be verified.");
  }
  return result;
}
async function deliverEstimateQuote({
  estimate,
  recipientEmail,
  ccEmails = "",
  bccEmails = "",
  subject,
  message,
  emailSignature = "",
  attachment,
  quoteVersion,
  quoteIssueDate,
  quoteValidDays = 30,
  quoteTotal,
  sourceStatus,
  isResend,
  sessionToken
}) {
  await authorizeEstimateQuoteSend({ estimateId: estimate?.id, quoteTotal, sessionToken });
  const archive = await archiveQuoteAttachment(attachment);
  const response = await sendGmail({
    to: recipientEmail,
    cc: ccEmails || "",
    bcc: bccEmails || "",
    subject,
    body: quoteEmailBodyHtml(message, emailSignature),
    attachments: [attachment]
  });
  const payload = response?.data || response || {};
  if (payload.error || payload.success === false) {
    throw new Error(payload.error || "Quote email could not be sent.");
  }
  const messageId = payload.messageId || "";
  const sentAt = (/* @__PURE__ */ new Date()).toISOString();
  const normalizedQuoteVersion = Math.max(0, Math.floor(Number(quoteVersion || 0)));
  let deliveryLogWarning = "";
  let delivery = null;
  const deliveryData = {
    estimate_id: estimate.id,
    work_order_id: estimate.work_order_id || "",
    quote_issue_key: quoteIssueKey(estimate.id, normalizedQuoteVersion),
    quote_version: normalizedQuoteVersion,
    quote_issue_date: quoteIssueDate || "",
    quote_valid_days: Math.max(0, Math.floor(Number(quoteValidDays || 0))),
    quote_expiration_date: quoteExpirationDate(quoteIssueDate, quoteValidDays),
    quote_total: Number(quoteTotal || 0),
    recipient_email: recipientEmail,
    cc_emails: String(ccEmails || ""),
    bcc_emails: String(bccEmails || ""),
    subject,
    delivery_method: "email",
    delivery_status: "sent",
    sent_at: sentAt,
    gmail_message_id: messageId,
    attachment_filename: attachment.filename,
    attachment_file_url: archive.fileUrl,
    attachment_sha256: archive.sha256,
    attachment_size_bytes: archive.sizeBytes,
    is_resend: !!isResend,
    source_status: sourceStatus || estimate.status || ""
  };
  try {
    delivery = await ensureQuoteDeliveryAudit(deliveryData, sessionToken);
  } catch (error) {
    deliveryLogWarning = `Email sent, but the delivery audit record could not be saved: ${error?.message || "unknown error"}`;
  }
  return { messageId, sentAt, deliveryId: delivery?.id || "", delivery, archive, deliveryLogWarning };
}
export {
  approveEstimateQuote,
  archiveQuoteAttachment,
  authorizeEstimateQuoteSend,
  base64AttachmentBytes,
  defaultQuoteEmailMessage,
  defaultQuoteEmailSubject,
  deliverEstimateQuote,
  ensureQuoteDeliveryAudit,
  quoteEmailBodyHtml,
  sha256Hex
};
