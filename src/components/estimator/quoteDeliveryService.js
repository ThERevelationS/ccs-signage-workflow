import { base44 } from "@/api/base44Client";
import { sendGmail } from "@/functions/sendGmail";
import { quoteExpirationDate, quoteIssueKey } from "./quoteLifecycle";

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

export function defaultQuoteEmailSubject(estimate = {}) {
  const number = String(estimate.estimate_number || "").trim();
  const project = String(estimate.project_name || "").trim();
  return [number ? `Estimate #${number}` : "Project Estimate", project].filter(Boolean).join(" — ");
}

export function defaultQuoteEmailMessage(estimate = {}) {
  const contact = String(estimate.order_contact || estimate.contact_name || "").trim();
  const greeting = contact ? `Good afternoon ${contact},` : "Good afternoon,";
  const company = String(estimate.company_name || "Cincinnati Custom Signs").trim();
  return `${greeting}\n\nPlease find the attached estimate for ${estimate.project_name || "your project"}. Please let us know if you have any questions or if there is anything you would like us to review.\n\nThank you,\n${company}`;
}

export function quoteEmailBodyHtml(message) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;white-space:pre-line;">${escapeHtml(message)}</div>`;
}

export async function deliverEstimateQuote({
  estimate,
  recipientEmail,
  subject,
  message,
  attachment,
  quoteVersion,
  quoteIssueDate,
  quoteValidDays = 30,
  quoteTotal,
  sourceStatus,
  isResend,
}) {
  const response = await sendGmail({
    to: recipientEmail,
    subject,
    body: quoteEmailBodyHtml(message),
    attachments: [attachment],
  });
  const payload = response?.data || response || {};
  if (payload.error || payload.success === false) {
    throw new Error(payload.error || "Quote email could not be sent.");
  }

  const messageId = payload.messageId || "";
  const normalizedQuoteVersion = Math.max(0, Math.floor(Number(quoteVersion || 0)));
  let deliveryLogWarning = "";
  let delivery = null;
  try {
    delivery = await base44.entities.EstimateQuoteDelivery.create({
      estimate_id: estimate.id,
      work_order_id: estimate.work_order_id || "",
      quote_issue_key: quoteIssueKey(estimate.id, normalizedQuoteVersion),
      quote_version: normalizedQuoteVersion,
      quote_issue_date: quoteIssueDate || "",
      quote_valid_days: Math.max(0, Math.floor(Number(quoteValidDays || 0))),
      quote_expiration_date: quoteExpirationDate(quoteIssueDate, quoteValidDays),
      quote_total: Number(quoteTotal || 0),
      recipient_email: recipientEmail,
      subject,
      delivery_method: "email",
      delivery_status: "sent",
      sent_at: new Date().toISOString(),
      gmail_message_id: messageId,
      attachment_filename: attachment.filename,
      is_resend: !!isResend,
      source_status: sourceStatus || estimate.status || "",
    });
  } catch (error) {
    deliveryLogWarning = `Email sent, but the delivery audit record could not be saved: ${error?.message || "unknown error"}`;
  }

  return { messageId, deliveryId: delivery?.id || "", delivery, deliveryLogWarning };
}
