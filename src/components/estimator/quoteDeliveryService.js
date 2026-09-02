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


export function base64AttachmentBytes(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot verify the quote PDF fingerprint.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function archiveQuoteAttachment(attachment) {
  if (!attachment?.base64 || !attachment?.filename) throw new Error("Quote PDF attachment is incomplete.");
  const bytes = base64AttachmentBytes(attachment.base64);
  const file = new File([bytes], attachment.filename, { type: attachment.mimeType || "application/pdf" });
  const [sha256, upload] = await Promise.all([
    sha256Hex(bytes),
    base44.integrations.Core.UploadFile({ file }),
  ]);
  const fileUrl = upload?.file_url || upload?.url || "";
  if (!fileUrl) throw new Error("Quote PDF archive upload did not return a file URL.");
  return { fileUrl, sha256, sizeBytes: bytes.byteLength };
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
  // Archive the exact bytes before sending so every successful email has a
  // retrievable source artifact. If archival fails, Gmail is not called.
  const archive = await archiveQuoteAttachment(attachment);
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
      attachment_file_url: archive.fileUrl,
      attachment_sha256: archive.sha256,
      attachment_size_bytes: archive.sizeBytes,
      is_resend: !!isResend,
      source_status: sourceStatus || estimate.status || "",
    });
  } catch (error) {
    deliveryLogWarning = `Email sent, but the delivery audit record could not be saved: ${error?.message || "unknown error"}`;
  }

  return { messageId, deliveryId: delivery?.id || "", delivery, archive, deliveryLogWarning };
}
