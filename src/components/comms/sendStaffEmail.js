import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";

// Staff email bridge client. `sendStaffEmail` is the session-authed backend
// gateway that validates a small plain-text envelope and sends it through
// the configured provider — the Ionos SMTP mailbox when SMTP_* env is set,
// else the internal sendGmail hand-off (staff sessions cannot call sendGmail
// directly; it only trusts a platform session or the workflow capability).
// `replyTo` (optional) sets the SMTP Reply-To header — ignored on Gmail.
//
// Throws Error with a user-safe message on failure; the thrown error carries
// `.status` when the backend returned an HTTP status. A 404 / missing-function
// response means the bridge has not been deployed yet.
export async function sendStaffEmail({ to, subject, body, cc, kind, sessionToken, replyTo } = {}) {
  const token = String(sessionToken || "").trim() || getSessionToken();
  const replyToClean = String(replyTo || "").trim();
  let response;
  try {
    response = await base44.functions.invoke("sendStaffEmail", {
      session_token: token,
      to,
      cc,
      subject,
      body,
      kind,
      ...(replyToClean ? { reply_to: replyToClean } : {}),
    });
  } catch (error) {
    const status = Number(error?.response?.status ?? error?.status);
    const apiError = error?.response?.data?.error || error?.message;
    const err = new Error(
      status === 404 || /not found|does not exist|no such function|unknown function/i.test(String(apiError))
        ? "Email bridge is not deployed yet."
        : apiError || "Email could not be sent.",
    );
    err.status = status;
    throw err;
  }
  const data = response?.data || response;
  if (data?.error || data?.success === false || data?.ok === false) {
    throw new Error(data?.error || "Email could not be sent.");
  }
  return data;
}

// The staff bridge is plain-text only — it escapes markup, so an HTML body
// would reach the recipient as literal tags. Collapse simple email HTML
// (paragraphs, breaks, divs/headings) into readable text before sending.
export function emailBodyToPlainText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}