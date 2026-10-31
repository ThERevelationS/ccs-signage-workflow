import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_EMAIL_SUBJECT_LENGTH, sanitizeEmailSubject } from "../base44/shared/emailSubject.mjs";

const source = readFileSync("base44/functions/checkDeadlineReminders/entry.ts", "utf8");

test("CR/LF and control characters cannot inject headers into the subject", () => {
  const out = sanitizeEmailSubject("⚠️ OVERDUE: Roof sign\r\nBcc: mallory@evil.example\n\tX-Test: 1\u2028Cc: a@b.example");
  assert.equal(out, "⚠️ OVERDUE: Roof sign Bcc: mallory@evil.example X-Test: 1 Cc: a@b.example");
  assert.doesNotMatch(out, /[\r\n\u0000-\u001f\u007f\u2028\u2029]/);
});

test("Subject is length-capped and preserves normal text", () => {
  assert.equal(sanitizeEmailSubject("📅 Deadline Approaching: Main St Pylon"), "📅 Deadline Approaching: Main St Pylon");
  assert.equal(sanitizeEmailSubject(null), "");
  const long = sanitizeEmailSubject("x".repeat(5000));
  assert.equal(long.length, MAX_EMAIL_SUBJECT_LENGTH);
  assert.equal(Array.from(sanitizeEmailSubject("😀".repeat(500))).length, MAX_EMAIL_SUBJECT_LENGTH);
});

test("Every reminder sender sanitizes the final subject before SendEmail", () => {
  const senders = source.split(/async function send\w*Email\(/).slice(1);
  assert.equal(senders.length, 3);
  for (const fn of senders) {
    const sanitizeAt = fn.indexOf("subject = sanitizeEmailSubject(subject);");
    const lastSubjectWrite = fn.lastIndexOf("subject = subject.replace(");
    const sendAt = fn.indexOf("SendEmail({ to, subject, body })");
    assert.ok(sanitizeAt > lastSubjectWrite && lastSubjectWrite > 0, "sanitize after placeholder substitution");
    assert.ok(sendAt > sanitizeAt, "sanitize before send");
  }
});
