import { writeFileSync } from "node:fs";

const entryEdits = [
  {
    old_text:
      "import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';\n" +
      "import { authenticateSignShopSession } from '../../shared/signShopSession.ts';",
    new_text:
      "import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';\n" +
      "import { authenticateSignShopSession } from '../../shared/signShopSession.ts';\n" +
      "import { sendSmtp } from '../../shared/smtpClient.ts';",
  },
  {
    old_text:
      "// invokes sendGmail internally with the same service-capability pass-through\n" +
      "// invoicingAction uses. The raw capability never leaves the backend.",
    new_text:
      "// invokes sendGmail internally with the same service-capability pass-through\n" +
      "// invoicingAction uses. The raw capability never leaves the backend.\n" +
      "//\n" +
      "// Provider switch: when SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM are all\n" +
      "// set the message goes out through the shared STARTTLS client (the Ionos\n" +
      "// noreply mailbox) and Gmail stays as the not-configured fallback.\n" +
      "// Credentials come from Deno.env only — never logged, never echoed.",
  },
  {
    old_text: "const MAX_KIND_LEN = 64;",
    new_text: "const MAX_KIND_LEN = 64;\nconst MAX_REPLY_TO_LEN = 254;",
  },
  {
    old_text:
      "    const recipients = [\n" +
      "      ...checkRecipientField(to, 'to'),\n" +
      "      ...(cc ? checkRecipientField(cc, 'cc') : []),\n" +
      "    ];\n" +
      "    if (recipients.length > MAX_RECIPIENTS) {\n" +
      "      throw bad(`Too many recipients — ${MAX_RECIPIENTS} maximum per send.`);\n" +
      "    }",
    new_text:
      "    const toList = checkRecipientField(to, 'to');\n" +
      "    const ccList = cc ? checkRecipientField(cc, 'cc') : [];\n" +
      "    const recipients = [...toList, ...ccList];\n" +
      "    if (recipients.length > MAX_RECIPIENTS) {\n" +
      "      throw bad(`Too many recipients — ${MAX_RECIPIENTS} maximum per send.`);\n" +
      "    }\n" +
      "\n" +
      "    // Optional Reply-To override — a single bare address. The request field\n" +
      "    // wins over the SMTP_REPLY_TO env default; ignored on the Gmail fallback.\n" +
      "    const replyTo = clean(body?.reply_to);\n" +
      "    if (replyTo && (replyTo.length > MAX_REPLY_TO_LEN || HEADER_BAD.test(replyTo) || !EMAIL_SHAPE.test(replyTo))) {\n" +
      "      throw bad('reply_to is not a valid email address.');\n" +
      "    }",
  },
  {
    old_text:
      "    // Internal service invocation — identical mechanism to invoicingAction:\n" +
      "    // sendGmail authenticates this call by the workflow capability token, not\n" +
      "    // by user session.\n" +
      "    const sent = await base44.asServiceRole.functions\n" +
      "      .invoke('sendGmail', {\n" +
      "        to,\n" +
      "        cc,\n" +
      "        subject,\n" +
      "        body: htmlBody,\n" +
      "        _workflow_capability: 'ccs-sendGmail-internal-svc-cap-791d5baab4d78cfc',\n" +
      "      })\n" +
      "      .catch((e: any) => ({ data: { error: e?.message || String(e) } }));\n" +
      "    const sendResult = sent?.data || sent;\n" +
      "    if (sendResult?.error || sendResult?.success === false) {\n" +
      "      throw bad(`Email could not be sent: ${sendResult?.error || 'sendGmail failed'}`, 502);\n" +
      "    }",
    new_text:
      "    // SMTP config — all four keys must be present for the Ionos path to\n" +
      "    // engage; anything missing keeps the Gmail connector as the fallback.\n" +
      "    const smtpPort = Number(clean(Deno.env.get('SMTP_PORT')) || 587);\n" +
      "    const smtp = {\n" +
      "      host: clean(Deno.env.get('SMTP_HOST')),\n" +
      "      port: Number.isInteger(smtpPort) && smtpPort >= 1 && smtpPort <= 65535 ? smtpPort : 587,\n" +
      "      user: clean(Deno.env.get('SMTP_USER')),\n" +
      "      pass: String(Deno.env.get('SMTP_PASS') || ''),\n" +
      "      from: clean(Deno.env.get('SMTP_FROM')),\n" +
      "      replyTo: clean(Deno.env.get('SMTP_REPLY_TO')),\n" +
      "    };\n" +
      "    const smtpConfigured = Boolean(smtp.host && smtp.user && smtp.pass && smtp.from);\n" +
      "\n" +
      "    let provider = 'gmail';\n" +
      "    if (smtpConfigured) {\n" +
      "      provider = 'smtp';\n" +
      "      try {\n" +
      "        await sendSmtp({\n" +
      "          host: smtp.host,\n" +
      "          port: smtp.port,\n" +
      "          user: smtp.user,\n" +
      "          pass: smtp.pass,\n" +
      "          from: smtp.from,\n" +
      "          to: toList,\n" +
      "          cc: ccList,\n" +
      "          replyTo: replyTo || smtp.replyTo || undefined,\n" +
      "          subject,\n" +
      "          text,\n" +
      "          html: htmlBody,\n" +
      "        });\n" +
      "      } catch (e: any) {\n" +
      "        // SmtpError messages carry the failure class and server code only —\n" +
      "        // never credentials or env values. A configured-but-failing SMTP does\n" +
      "        // not silently reroute through Gmail mid-request; the operator sees a\n" +
      "        // send failure and can retry once the mailbox config is fixed.\n" +
      "        throw bad(`Email could not be sent: ${clean(e?.message) || 'SMTP send failed'}`, 502);\n" +
      "      }\n" +
      "    } else {\n" +
      "      // Internal service invocation — identical mechanism to invoicingAction:\n" +
      "      // sendGmail authenticates this call by the workflow capability token,\n" +
      "      // not by user session. sendGmail has no Reply-To support — on this\n" +
      "      // fallback replies land on the connected Gmail account, as before.\n" +
      "      const sent = await base44.asServiceRole.functions\n" +
      "        .invoke('sendGmail', {\n" +
      "          to,\n" +
      "          cc,\n" +
      "          subject,\n" +
      "          body: htmlBody,\n" +
      "          _workflow_capability: 'ccs-sendGmail-internal-svc-cap-791d5baab4d78cfc',\n" +
      "        })\n" +
      "        .catch((e: any) => ({ data: { error: e?.message || String(e) } }));\n" +
      "      const sendResult = sent?.data || sent;\n" +
      "      if (sendResult?.error || sendResult?.success === false) {\n" +
      "        throw bad(`Email could not be sent: ${sendResult?.error || 'sendGmail failed'}`, 502);\n" +
      "      }\n" +
      "    }",
  },
  {
    old_text:
      "    console.log(`sendStaffEmail: ${actor} -> ${recipients.length} recipient(s) kind=${kind || 'untagged'}`);",
    new_text:
      "    console.log(`sendStaffEmail: ${actor} -> ${recipients.length} recipient(s) kind=${kind || 'untagged'} via=${provider}`);",
  },
];

const helperEdits = [
  {
    old_text:
      "// Staff email bridge client. `sendStaffEmail` is the session-authed backend\n" +
      "// gateway that validates a small plain-text envelope and hands it to sendGmail\n" +
      "// internally — staff sessions cannot call sendGmail directly (it only trusts a\n" +
      "// platform session or the backend workflow capability).",
    new_text:
      "// Staff email bridge client. `sendStaffEmail` is the session-authed backend\n" +
      "// gateway that validates a small plain-text envelope and sends it through\n" +
      "// the configured provider — the Ionos SMTP mailbox when SMTP_* env is set,\n" +
      "// else the internal sendGmail hand-off (staff sessions cannot call sendGmail\n" +
      "// directly; it only trusts a platform session or the workflow capability).\n" +
      "// `replyTo` (optional) sets the SMTP Reply-To header — ignored on Gmail.",
  },
  {
    old_text:
      "export async function sendStaffEmail({ to, subject, body, cc, kind, sessionToken } = {}) {\n" +
      "  const token = String(sessionToken || \"\").trim() || getSessionToken();\n" +
      "  let response;\n" +
      "  try {\n" +
      "    response = await base44.functions.invoke(\"sendStaffEmail\", {\n" +
      "      session_token: token,\n" +
      "      to,\n" +
      "      cc,\n" +
      "      subject,\n" +
      "      body,\n" +
      "      kind,\n" +
      "    });",
    new_text:
      "export async function sendStaffEmail({ to, subject, body, cc, kind, sessionToken, replyTo } = {}) {\n" +
      "  const token = String(sessionToken || \"\").trim() || getSessionToken();\n" +
      "  const replyToClean = String(replyTo || \"\").trim();\n" +
      "  let response;\n" +
      "  try {\n" +
      "    response = await base44.functions.invoke(\"sendStaffEmail\", {\n" +
      "      session_token: token,\n" +
      "      to,\n" +
      "      cc,\n" +
      "      subject,\n" +
      "      body,\n" +
      "      kind,\n" +
      "      ...(replyToClean ? { reply_to: replyToClean } : {}),\n" +
      "    });",
  },
];

const notifyEdits = [
  {
    old_text:
      "export async function invokeStaffEmail({ sessionToken, to, subject, body, cc, kind } = {}) {",
    new_text:
      "export async function invokeStaffEmail({ sessionToken, to, subject, body, cc, kind, replyTo } = {}) {",
  },
  {
    old_text:
      "    ...(clean(kind) ? { kind: clean(kind) } : {}),\n" +
      "  });",
    new_text:
      "    ...(clean(kind) ? { kind: clean(kind) } : {}),\n" +
      "    ...(clean(replyTo) ? { reply_to: clean(replyTo) } : {}),\n" +
      "  });",
  },
  {
    old_text:
      "  sessionToken,\n" +
      "  actor,\n" +
      "  log = {},\n" +
      "  overrides,\n" +
      "} = {}) {",
    new_text:
      "  sessionToken,\n" +
      "  actor,\n" +
      "  log = {},\n" +
      "  overrides,\n" +
      "  replyTo,\n" +
      "} = {}) {",
  },
  {
    old_text:
      "  await invokeStaffEmail({ sessionToken, to: recipient, subject, body, cc, kind });",
    new_text:
      "  await invokeStaffEmail({ sessionToken, to: recipient, subject, body, cc, kind, replyTo });",
  },
];

const queueEdits = [
  {
    old_text:
      "      await sendStaffEmail({\n" +
      "        sessionToken,\n" +
      "        to,\n" +
      "        subject: clean(value.subject),\n" +
      "        body: clean(value.body),\n" +
      "        kind: `followup:${item.kind}`,\n" +
      "      });",
    new_text:
      "      await sendStaffEmail({\n" +
      "        sessionToken,\n" +
      "        to,\n" +
      "        subject: clean(value.subject),\n" +
      "        body: clean(value.body),\n" +
      "        kind: `followup:${item.kind}`,\n" +
      "        // Replies route to the staff member working the queue (actor is their\n" +
      "        // email); a non-email actor falls back to the SMTP_REPLY_TO default.\n" +
      "        replyTo: clean(actor).includes(\"@\") ? clean(actor) : undefined,\n" +
      "      });",
  },
];

const panelEdits = [
  {
    old_text:
      "      await sendStaffEmail({\n" +
      "        sessionToken,\n" +
      "        to: vendorEmail,\n" +
      "        subject: `PO ${poNumber} — receipt/backorder notice`,\n" +
      "        body: receivingSummaryText(po, receipt),\n" +
      "        kind: \"po_vendor_notify\",\n" +
      "      });",
    new_text:
      "      await sendStaffEmail({\n" +
      "        sessionToken,\n" +
      "        to: vendorEmail,\n" +
      "        subject: `PO ${poNumber} — receipt/backorder notice`,\n" +
      "        body: receivingSummaryText(po, receipt),\n" +
      "        kind: \"po_vendor_notify\",\n" +
      "        // Vendor replies route to the buyer on record (po.created_by holds the\n" +
      "        // creator's staff email); a non-email value falls back to the default.\n" +
      "        replyTo: clean(po?.created_by).includes(\"@\") ? clean(po?.created_by) : undefined,\n" +
      "      });",
  },
];

writeFileSync("entry-edits.json", JSON.stringify(entryEdits));
writeFileSync("helper-edits.json", JSON.stringify(helperEdits));
writeFileSync("notify-edits.json", JSON.stringify(notifyEdits));
writeFileSync("queue-edits.json", JSON.stringify(queueEdits));
writeFileSync("panel-edits.json", JSON.stringify(panelEdits));
console.log("edit JSONs written");
