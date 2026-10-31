// Contract checks for sign-in brute-force hardening:
//   - AuthorizedEmail carries admin-readable lockout state fields.
//   - verifyLogin refuses locked accounts with 429, preserves bcrypt timing,
//     counts failures with a CAS-guarded write, locks at threshold, and
//     resets the counters on success.
//   - Credential-changing flows (setPassword, onboarding save_credentials)
//     clear the lockout so a new password works immediately.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const verifyLogin = read("base44/functions/verifyLogin/entry.ts");
const setPassword = read("base44/functions/setPassword/entry.ts");
const onboarding = read("base44/functions/onboardingAccountAction/entry.ts");
const entity = read("base44/entities/AuthorizedEmail.jsonc");

test("AuthorizedEmail carries admin-read lockout state", () => {
  assert.match(entity, /"failed_login_count"[\s\S]*?"type": "integer"/);
  assert.match(entity, /"login_locked_until"[\s\S]*?"format": "date-time"/);
  // lockout state must not be staff-readable like the password hash
  const failedIdx = entity.indexOf('"failed_login_count"');
  const lockedIdx = entity.indexOf('"login_locked_until"');
  for (const idx of [failedIdx, lockedIdx]) {
    const window = entity.slice(idx, idx + 500);
    assert.match(window, /"role": "admin"/, "lockout fields must be admin-readable only");
  }
});

test("verifyLogin refuses locked accounts before checking the password", () => {
  const lockCheck = verifyLogin.indexOf("login_locked_until");
  const compare = verifyLogin.indexOf("bcrypt.compare(password, stored)");
  assert.ok(lockCheck > 0 && lockCheck < compare, "lockout check must precede the real password comparison");
  assert.match(verifyLogin, /status: 429/);
  assert.match(verifyLogin, /Too many failed sign-in attempts/);
  // timing must stay uniform — locked accounts still run a bcrypt compare
  assert.match(verifyLogin, /lockedUntil > Date\.now\(\)[\s\S]*?bcrypt\.compare\(String\(password\), DUMMY_PASSWORD_HASH\)/);
});

test("verifyLogin counts failures with a CAS-guarded write and locks at threshold", () => {
  assert.match(verifyLogin, /const MAX_FAILED_LOGINS = 10/);
  assert.match(verifyLogin, /const LOCKOUT_MINUTES = 15/);
  assert.match(verifyLogin, /failed_login_count: failures/);
  assert.match(verifyLogin, /failures >= MAX_FAILED_LOGINS[\s\S]*?login_locked_until/);
  assert.match(verifyLogin, /replaceAuthorizedEmailCredentialFieldsIfUnchanged/);
  // bookkeeping failures must never crash sign-in
  assert.match(verifyLogin, /persistLoginSecurityFields[\s\S]*?catch \(error\)[\s\S]*?console\.error/);
});

test("verifyLogin resets the counter on successful sign-in", () => {
  const reset = verifyLogin.indexOf("failed_login_count = 0");
  const sign = verifyLogin.indexOf("signShopSessionPayload(payload)");
  assert.ok(reset > 0 && reset < sign, "the counter reset must run before the session token is issued");
  assert.match(verifyLogin, /login_locked_until = null/);
});

test("credential changes clear the lockout", () => {
  assert.match(setPassword, /failed_login_count: 0/);
  assert.match(setPassword, /login_locked_until: null/);
  assert.match(onboarding, /failed_login_count: 0/);
  assert.match(onboarding, /login_locked_until: null/);
});

test("existing hardening stays in place", () => {
  assert.match(verifyLogin, /DUMMY_PASSWORD_HASH/, "unknown usernames keep bcrypt-timing parity");
  assert.match(verifyLogin, /username\.length > 128 \|\| password\.length > 1024/, "input bounds stay enforced");
  assert.match(setPassword, /session_not_before: new Date\(\)\.toISOString\(\)/, "credential change still revokes older sessions");
});
