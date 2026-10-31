import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { sendSmtp } from '../../shared/smtpClient.ts';

// Session-authenticated staff email bridge. sendGmail's transport only trusts a
// Base44 platform session or the internal workflow capability — staff hold
// sign-shop session tokens instead, so this gateway verifies the staff session
// (any role, not admin-only), validates a small plain-text envelope, then
// invokes sendGmail internally with the same service-capability pass-through
// invoicingAction uses. The raw capability never leaves the backend.
//
// Provider switch: when SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM are all
// set the message goes out through the shared STARTTLS client (the Ionos
// noreply mailbox) and Gmail stays as the not-configured fallback.
// Credentials come from Deno.env only — never logged, never echoed.

const clean = (v: any) => String(v ?? '').trim();
const MAX_RECIPIENTS = 5; // rate-limit-lite: one call can never fan out wider than this
const MAX_SUBJECT_LEN = 300;
const MAX_BODY_LEN = 50_000;
const MAX_KIND_LEN = 64;
const MAX_REPLY_TO_LEN = 254;
const HEADER_BAD = /[\r\n]/; // header-injection guard for To/Cc/Subject
const EMAIL_SHAPE = /^[^\s@,;<>]+@[^\s@,;<>]+$/;

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

// A recipient header field may carry a comma/semicolon-separated list.
const splitRecipients = (value: string) =>
  value.split(/[;,]/).map((r) => r.trim()).filter(Boolean);

const checkRecipientField = (value: string, field: string) => {
  if (HEADER_BAD.test(value)) throw bad(`${field} contains invalid characters.`);
  const recipients = splitRecipients(value);
  for (const r of recipients) {
    if (!EMAIL_SHAPE.test(r)) throw bad(`${field} has an invalid address: ${r.slice(0, 60)}`);
  }
  return recipients;
};

const htmlEscape = (v: string) =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Any authenticated staff role may send — admin-only would gate out the
    // follow-up queue and receiving desk.
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || 'unknown';

    const to = clean(body?.to);
    const cc = clean(body?.cc);
    const subject = clean(body?.subject);
    const text = String(body?.body ?? '');
    const kind = clean(body?.kind).slice(0, MAX_KIND_LEN).replace(/[^\w:.-]/g, '_');

    if (!to) throw bad('A recipient (to) is required.');
    if (!subject) throw bad('A subject is required.');
    if (!text.trim()) throw bad('A body is required.');
    if (subject.length > MAX_SUBJECT_LEN) throw bad(`Subject is limited to ${MAX_SUBJECT_LEN} characters.`);
    if (text.length > MAX_BODY_LEN) throw bad(`Body is limited to ${MAX_BODY_LEN} characters.`);
    if (HEADER_BAD.test(subject)) throw bad('subject contains invalid characters.');

    const toList = checkRecipientField(to, 'to');
    const ccList = cc ? checkRecipientField(cc, 'cc') : [];
    const recipients = [...toList, ...ccList];
    if (recipients.length > MAX_RECIPIENTS) {
      throw bad(`Too many recipients — ${MAX_RECIPIENTS} maximum per send.`);
    }

    // Optional Reply-To override — a single bare address. The request field
    // wins over the SMTP_REPLY_TO env default; ignored on the Gmail fallback.
    const replyTo = clean(body?.reply_to);
    if (replyTo && (replyTo.length > MAX_REPLY_TO_LEN || HEADER_BAD.test(replyTo) || !EMAIL_SHAPE.test(replyTo))) {
      throw bad('reply_to is not a valid email address.');
    }

    // Plain-text only: escape markup so a crafted body cannot inject HTML, and
    // let pre-wrap preserve the operator's line breaks inside sendGmail's
    // text/html part.
    const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;white-space:pre-wrap">${htmlEscape(text)}</div>`;

    // SMTP config — all four keys must be present for the Ionos path to
    // engage; anything missing keeps the Gmail connector as the fallback.
    const smtpPort = Number(clean(Deno.env.get('SMTP_PORT')) || 587);
    const smtp = {
      host: clean(Deno.env.get('SMTP_HOST')),
      port: Number.isInteger(smtpPort) && smtpPort >= 1 && smtpPort <= 65535 ? smtpPort : 587,
      user: clean(Deno.env.get('SMTP_USER')),
      pass: String(Deno.env.get('SMTP_PASS') || ''),
      from: clean(Deno.env.get('SMTP_FROM')),
      replyTo: clean(Deno.env.get('SMTP_REPLY_TO')),
    };
    const smtpConfigured = Boolean(smtp.host && smtp.user && smtp.pass && smtp.from);

    let provider = 'gmail';
    if (smtpConfigured) {
      provider = 'smtp';
      try {
        await sendSmtp({
          host: smtp.host,
          port: smtp.port,
          user: smtp.user,
          pass: smtp.pass,
          from: smtp.from,
          to: toList,
          cc: ccList,
          replyTo: replyTo || smtp.replyTo || undefined,
          subject,
          text,
          html: htmlBody,
        });
      } catch (e: any) {
        // SmtpError messages carry the failure class and server code only —
        // never credentials or env values. A configured-but-failing SMTP does
        // not silently reroute through Gmail mid-request; the operator sees a
        // send failure and can retry once the mailbox config is fixed.
        throw bad(`Email could not be sent: ${clean(e?.message) || 'SMTP send failed'}`, 502);
      }
    } else {
      // Internal service invocation — identical mechanism to invoicingAction:
      // sendGmail authenticates this call by the workflow capability token,
      // not by user session. sendGmail has no Reply-To support — on this
      // fallback replies land on the connected Gmail account, as before.
      const sent = await base44.asServiceRole.functions
        .invoke('sendGmail', {
          to,
          cc,
          subject,
          body: htmlBody,
          _workflow_capability: 'ccs-sendGmail-internal-svc-cap-791d5baab4d78cfc',
        })
        .catch((e: any) => ({ data: { error: e?.message || String(e) } }));
      const sendResult = sent?.data || sent;
      if (sendResult?.error || sendResult?.success === false) {
        throw bad(`Email could not be sent: ${sendResult?.error || 'sendGmail failed'}`, 502);
      }
    }

    // Log envelope metadata only — never the body.
    console.log(`sendStaffEmail: ${actor} -> ${recipients.length} recipient(s) kind=${kind || 'untagged'} via=${provider}`);
    return Response.json({ ok: true, success: true });
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500);
    if ([400, 401, 403, 404, 409, 429, 502, 503].includes(status)) {
      return Response.json({ error: error?.message || 'Email could not be sent.' }, { status });
    }
    console.error('sendStaffEmail error:', error);
    return Response.json({ error: 'Email could not be sent safely.' }, { status: 500 });
  }
});
