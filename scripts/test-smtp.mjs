import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-contract test for the Ionos SMTP provider switch on the staff email
// bridge: sendStaffEmail gains an env-configured raw-STARTTLS path while the
// Gmail connector stays as the not-configured fallback. Deno code cannot run
// under Node, so this asserts on the shipped source — the same pattern as
// test-sendstaffemail.mjs.

const client = readFileSync(new URL("../base44/shared/smtpClient.ts", import.meta.url), "utf8");
const entry = readFileSync(new URL("../base44/functions/sendStaffEmail/entry.ts", import.meta.url), "utf8");
const helper = readFileSync(new URL("../src/components/comms/sendStaffEmail.js", import.meta.url), "utf8");
const notify = readFileSync(new URL("../src/components/comms/notifySend.js", import.meta.url), "utf8");
const queue = readFileSync(new URL("../src/components/comms/FollowupQueue.jsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/procurement/ReceivePanel.jsx", import.meta.url), "utf8");

// --- smtpClient.ts structure: raw socket, STARTTLS ordering, response checks ---
assert.match(client, /export async function sendSmtp\(/, "exports sendSmtp");
assert.match(client, /export class SmtpError extends Error/, "SmtpError failure-class error type");
assert.match(client, /Deno\.connect\(\{ hostname: host, port \}\)/, "plain TCP connect via Deno.connect");
assert.match(client, /connectTls\(\{ hostname: host, port \}\)/, "implicit-TLS connect option (port 465)");
assert.match(client, /startTls|connectTls\(conn, \{ hostname \}\)/, "STARTTLS upgrade on the existing socket");
assert.match(client, /typeof deno\.startTls === 'function'/, "Deno 1.x startTls feature-detect");
for (const [cmd, label] of [
  ["EHLO", "EHLO greeting"],
  ["STARTTLS", "STARTTLS before auth"],
  ["AUTH LOGIN", "AUTH LOGIN"],
  ["MAIL FROM:<", "MAIL FROM envelope sender"],
  ["RCPT TO:<", "RCPT TO per recipient"],
  ["DATA", "DATA phase"],
  ["QUIT", "QUIT"],
]) {
  assert.ok(client.includes(cmd), `issues ${label}`);
}
// Strict protocol order: EHLO → STARTTLS → EHLO → AUTH → MAIL → RCPT → DATA → message → QUIT.
const pos = (needle, from = 0) => {
  const i = client.indexOf(needle, from);
  assert.ok(i >= 0, `found ${needle}`);
  return i;
};
const iEhlo = pos("`EHLO ${ehloName}`");
const iStarttls = pos("'STARTTLS'", iEhlo);
const iEhloTls = pos("`EHLO ${ehloName}`", iStarttls);
const iAuth = pos("'AUTH LOGIN'", iEhloTls);
const iMail = pos("`MAIL FROM:<${from}>`", iAuth);
const iRcpt = pos("`RCPT TO:<${rcpt}>`", iMail);
const iData = pos("'DATA'", iRcpt);
const iQuit = pos("'QUIT'", iData);
assert.ok(iEhlo < iStarttls && iStarttls < iEhloTls && iEhloTls < iAuth, "EHLO→STARTTLS→EHLO→AUTH order");
assert.ok(iAuth < iMail && iMail < iRcpt && iRcpt < iData && iData < iQuit, "AUTH→MAIL→RCPT→DATA→QUIT order");
// Response-code checks per stage.
assert.match(client, /'AUTH LOGIN', \[334\]/, "AUTH LOGIN expects a 334 prompt");
assert.match(client, /utf8ToBase64\(user\), \[334\]/, "username base64 expects the 334 password prompt");
assert.match(client, /utf8ToBase64\(pass\), \[235\]/, "password base64 expects 235 auth success");
assert.match(client, /`MAIL FROM:<\$\{from\}>`, \[250\]/, "MAIL FROM expects 250");
assert.match(client, /`RCPT TO:<\$\{rcpt\}>`, \[250, 251\]/, "RCPT TO expects 250/251");
assert.match(client, /'DATA', \[354\]/, "DATA expects 354 go-ahead");
assert.match(client, /`\$\{dotStuff\(message\)\}\\r\\n\.`/, "DATA ends with the CRLF.CRLF terminator");
assert.match(client, /dotStuff/, "dot-stuffs content lines for RFC 5321 transparency");
// Timeouts on network operations.
assert.match(client, /withTimeout/, "timeout wrapper applied");
assert.match(client, /Promise\.race/, "timeout via Promise.race");
assert.match(client, /setTimeout/, "timeout via setTimeout");
assert.match(client, /DEFAULT_TIMEOUT_MS\s*=\s*20_?000/, "~20s per-operation timeout default");
// Failure classes: auth vs connect vs relay reject.
assert.match(client, /SmtpError\('connect'/, "connect failure class");
assert.match(client, /SmtpError\('tls'/, "tls failure class");
assert.match(client, /SmtpError\('auth'/, "auth failure class");
assert.match(client, /SmtpError\('recipient'/, "recipient/relay-reject failure class");
assert.match(client, /SmtpError\('sender'/, "sender-reject failure class");
assert.match(client, /SmtpError\('timeout'/, "timeout failure class");
// MIME message: Reply-To + multipart alternative + UTF-8 subject.
assert.match(client, /`Reply-To: \$\{o\.replyTo\}`/, "Reply-To header emitted when set");
assert.match(client, /multipart\/alternative/, "multipart/alternative when text+html");
assert.match(client, /Content-Transfer-Encoding: base64/, "base64 bodies");
assert.match(client, /=\?UTF-8\?B\?/, "RFC 2047 UTF-8 subject fallback");
assert.match(client, /Message-ID:/, "Message-ID header");
assert.match(client, /`Date: \$\{new Date\(\)\.toUTCString\(\)\}`/, "Date header");
// Credentials never logged and never embedded in errors.
assert.doesNotMatch(client, /console\.(log|info|warn|error|debug)/, "client has zero console calls");
assert.doesNotMatch(client, /\$\{[^}]*\bpass\b/i, "password never interpolated into strings");
// CRLF header-injection guard on addresses.
assert.match(client, /HEADER_BAD\s*=\s*\/\[\\r\\n\]\//, "address CRLF guard");
assert.match(client, /HEADER_BAD\.test\(addr\)/, "all envelope/header addresses CRLF-checked");

// --- entry.ts: provider switch, env config, reply_to, preserved guards ---
assert.match(entry, /import \{ sendSmtp \} from ['"]\.\.\/\.\.\/shared\/smtpClient\.ts['"]/, "imports the shared smtp client");
for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_REPLY_TO"]) {
  assert.ok(entry.includes(`Deno.env.get('${key}')`), `reads env ${key}`);
}
assert.match(entry, /smtpConfigured|smtpReady/, "SMTP-configured gate exists");
assert.match(entry, /if \(smtpConfigured\)/, "SMTP path engages only when fully configured");
assert.match(entry, /await sendSmtp\(\{/, "sends via smtpClient when configured");
assert.match(entry, /\.invoke\('sendGmail'/, "Gmail connector fallback preserved");
assert.match(entry, /_workflow_capability:\s*'ccs-sendGmail-internal-svc-cap-791d5baab4d78cfc'/, "capability pass-through unchanged");
assert.ok(entry.indexOf("sendSmtp({") < entry.indexOf("'sendGmail'"), "SMTP branch precedes the Gmail fallback");
assert.match(entry, /else \{[\s\S]{0,200}sendGmail authenticates this call/, "Gmail path sits on the else branch");
// reply_to request field: validated, request wins over env default.
assert.match(entry, /body\?\.reply_to/, "accepts request reply_to field");
assert.match(entry, /EMAIL_SHAPE\.test\(replyTo\)/, "reply_to validated as an email");
assert.match(entry, /HEADER_BAD\.test\(replyTo\)/, "reply_to scanned for header injection");
assert.match(entry, /MAX_REPLY_TO_LEN\s*=\s*254/, "reply_to length cap");
assert.match(entry, /replyTo:\s*replyTo \|\| smtp\.replyTo \|\| undefined/, "request reply_to overrides SMTP_REPLY_TO env");
assert.match(entry, /via=\$\{provider\}/, "send log records the provider");
// Existing guards all still present.
assert.match(entry, /authenticateSignShopSession\(base44,\s*body\?\.session_token\)/, "session auth preserved");
assert.match(entry, /MAX_RECIPIENTS\s*=\s*5/, "recipient cap preserved");
assert.match(entry, /recipients\.length > MAX_RECIPIENTS/, "recipient cap enforced");
assert.match(entry, /HEADER_BAD\.test\(subject\)/, "subject header-injection check preserved");
assert.match(entry, /checkRecipientField\(to, 'to'\)/, "to validation preserved");
assert.match(entry, /checkRecipientField\(cc, 'cc'\)/, "cc validation preserved");
assert.match(entry, /MAX_BODY_LEN\s*=\s*50_?000/, "body cap preserved");
assert.match(entry, /htmlEscape/, "HTML escaping preserved");
assert.match(entry, /Response\.json\(\{ ok: true, success: true \}\)/, "ok envelope preserved");
// No credential or env values echoed.
assert.doesNotMatch(entry, /Response\.json\([^;]*SMTP_(HOST|PORT|USER|PASS|FROM|REPLY_TO)/, "env values never returned to the caller");
assert.doesNotMatch(entry, /console\.(log|error)[^;]*smtp\.(pass|user|host)/, "env values never logged");

// --- Caller plumbing ---
assert.match(helper, /replyTo\s*\}?=\s*\{\}\)|replyTo \}/, "helper accepts a replyTo option");
assert.match(helper, /\{ reply_to: replyToClean \}/, "helper forwards reply_to to the backend");
assert.match(notify, /\.\.\.\(clean\(replyTo\) \? \{ reply_to: clean\(replyTo\) \} : \{\}\)/, "notifySend.invokeStaffEmail forwards reply_to");
assert.match(notify, /replyTo,\s*\n\s*\} = \{\}\)/, "sendCustomerNotification accepts replyTo");
assert.match(notify, /invokeStaffEmail\(\{ sessionToken, to: recipient, subject, body, cc, kind, replyTo \}\)/, "sendCustomerNotification forwards replyTo");
assert.match(queue, /replyTo: clean\(actor\)\.includes\("@"\) \? clean\(actor\) : undefined/, "follow-up replies route to the sending staff member");
assert.match(panel, /replyTo: clean\(po\?\.created_by\)\.includes\("@"\) \? clean\(po\?\.created_by\) : undefined/, "vendor notify replies route to the PO buyer");

console.log("PASS smtp (84 assertions)");
