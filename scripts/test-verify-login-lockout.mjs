// Contract checks for sign-in brute-force hardening:
//   - AuthorizedEmail carries admin-readable lockout state fields.
//   - verifyLogin refuses locked accounts with 429, preserves bcrypt timing,
//     counts failures as append-only attempt rows reserved before the
//     password compare (so concurrent attempts cannot collapse into one
//     counter tick), locks at threshold, and resets the counters on success.
//   - Credential-changing flows (setPassword, onboarding save_credentials)
//     clear the lockout so a new password works immediately.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

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

test("verifyLogin counts failures atomically and locks at threshold", () => {
  assert.match(verifyLogin, /const MAX_FAILED_LOGINS = 10/);
  assert.match(verifyLogin, /const LOCKOUT_MINUTES = 15/);
  const reserve = verifyLogin.indexOf("reserveLoginAttempt({");
  const compare = verifyLogin.indexOf("bcrypt.compare(password, stored)");
  assert.ok(reserve > 0 && reserve < compare, "the attempt must be reserved before the real password comparison");
  assert.match(verifyLogin, /const failures = attempt\.count/);
  assert.doesNotMatch(verifyLogin, /failed_login_count\)\) : 0\) \+ 1/, "no read-modify-write counter from a stale snapshot");
  assert.match(verifyLogin, /failures >= MAX_FAILED_LOGINS[\s\S]*?login_locked_until/);
  assert.match(verifyLogin, /replaceAuthorizedEmailCredentialFieldsIfUnchanged/);
  // an attempt that cannot be recorded must fail closed instead of being compared
  assert.match(verifyLogin, /catch \(attemptError\)[\s\S]*?status: 503/);
});

test("verifyLogin resets the counter on successful sign-in", () => {
  const reset = verifyLogin.search(/failed_login_count(?::| =) 0/);
  const sign = verifyLogin.indexOf("signShopSessionPayload(payload)");
  assert.ok(reset > 0 && reset < sign, "the counter reset must run before the session token is issued");
  assert.match(verifyLogin, /login_locked_until(?::| =) null/);
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

// ---- Behavioral: concurrent wrong-password bursts against fake entities ----

const tick = () => new Promise(resolve => setTimeout(resolve, Math.random() * 3));

function fakeBackend({ password }) {
  let seq = 0;
  let clock = Date.parse("2026-10-31T00:00:00.000Z");
  const stamp = () => new Date(clock += 1).toISOString();
  const user = {
    id: "u1", email: "staff@example.test", username: "staff", role: "user",
    password_hash: `$2a$10$fake:${password}`, failed_login_count: 0, login_locked_until: null,
    last_login_at: null, session_not_before: null, updated_date: stamp(),
  };
  const rows = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const matches = (row, query) => Object.entries(query).every(([field, cond]) => {
    if (cond && typeof cond === "object") {
      if ("$in" in cond && !cond.$in.includes(row[field])) return false;
      if ("$gte" in cond && !(String(row[field] ?? "") >= cond.$gte)) return false;
      return true;
    }
    return row[field] === cond;
  });
  const AuthorizedEmail = {
    async filter(query) { await tick(); return matches(user, query) ? [clone(user)] : []; },
    async get(id) { await tick(); return id === user.id ? clone(user) : null; },
    async updateMany(query, { $set }) {
      await tick();
      if (!matches(user, query)) return { updated: 0 };
      Object.assign(user, $set, { updated_date: stamp() });
      return { updated: 1 };
    },
  };
  const FailedAdminAttempt = {
    async create(data) { await tick(); const row = { ...data, id: `a${++seq}` }; rows.set(row.id, row); return clone(row); },
    async filter(query, _sort, limit = 50) {
      await tick();
      return [...rows.values()].filter(row => matches(row, query))
        .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit).map(clone);
    },
    async update(id, data) { await tick(); Object.assign(rows.get(id), data); },
    async delete(id) { await tick(); rows.delete(id); },
  };
  return { user, rows, entities: { AuthorizedEmail, FailedAdminAttempt, UserSession: { async create() {} } } };
}

function transform(source) {
  return transformSync(source, { loader: "ts", format: "cjs", target: "es2022" }).code;
}

function loadVerifyLogin(backend, stats) {
  const cjs = code => {
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, console, Date });
    return module.exports;
  };
  const modules = {
    "npm:@base44/sdk@0.8.25": { createClientFromRequest: () => ({ asServiceRole: { entities: backend.entities } }) },
    "npm:bcryptjs@2.4.3": { __esModule: true, default: {
      async compare(candidate, hash) {
        await tick();
        if (!String(hash).startsWith("$2a$10$fake:")) return false;
        stats.realCompares += 1;
        return hash === `$2a$10$fake:${candidate}`;
      },
      async hash() { throw Error("hash not expected"); },
    } },
    "../../shared/authorizedEmailCredentialPersistence.mjs": cjs(transform(read("base44/shared/authorizedEmailCredentialPersistence.mjs"))),
    "../../shared/loginAttemptThrottle.mjs": cjs(transform(read("base44/shared/loginAttemptThrottle.mjs"))),
    "../../shared/signShopSession.ts": { signShopSessionPayload: async () => "signed-token" },
    "../../shared/employeeAccessReads.ts": { withEmployeeAccessReads: client => client },
  };
  let handler;
  const module = { exports: {} };
  runInNewContext(transform(verifyLogin), {
    module, exports: module.exports, Date, Response, TextEncoder, crypto, btoa,
    console: { ...console, error: process.env.DEBUG_LOGIN ? console.error : () => {} },
    Deno: { serve(fn) { handler = fn; } },
    require(name) {
      if (!Object.hasOwn(modules, name)) throw Error("Unexpected module " + name);
      return modules[name];
    },
  });
  return body => handler({ json: async () => body });
}

test("a concurrent wrong-password burst cannot exceed the lockout budget", async () => {
  const backend = fakeBackend({ password: "correct horse" });
  const stats = { realCompares: 0 };
  const signIn = loadVerifyLogin(backend, stats);
  const responses = await Promise.all(
    Array.from({ length: 40 }, (_, i) => signIn({ username: "staff", password: `guess-${i}` })),
  );
  const statuses = responses.map(r => r.status);
  assert.ok(stats.realCompares <= 10, `at most 10 guesses may reach the password check, saw ${stats.realCompares}`);
  assert.equal(statuses.filter(s => s === 401).length, stats.realCompares);
  assert.ok(statuses.filter(s => s === 429).length >= 30);
  assert.ok(backend.user.failed_login_count >= 10, `failed_login_count mirrors the burst, saw ${backend.user.failed_login_count}`);
  assert.ok(Date.parse(backend.user.login_locked_until) > Date.now(), "login_locked_until is set");

  // The right password is refused while locked.
  const locked = await signIn({ username: "staff", password: "correct horse" });
  assert.equal(locked.status, 429);
});

test("a successful sign-in releases its reservation and resets the counter", async () => {
  const backend = fakeBackend({ password: "correct horse" });
  const stats = { realCompares: 0 };
  const signIn = loadVerifyLogin(backend, stats);
  for (let i = 0; i < 3; i += 1) assert.equal((await signIn({ username: "staff", password: `bad-${i}` })).status, 401);
  assert.equal(backend.user.failed_login_count, 3);
  const ok = await signIn({ username: "staff", password: "correct horse" });
  assert.equal(ok.status, 200);
  assert.equal(backend.user.failed_login_count, 0);
  assert.ok(backend.user.last_login_at);
  assert.equal([...backend.rows.values()].filter(row => row.reason === "login_attempt_pending").length, 0);
  // Failures before the successful sign-in no longer count toward a lockout.
  for (let i = 0; i < 9; i += 1) assert.equal((await signIn({ username: "staff", password: `bad2-${i}` })).status, 401);
  assert.equal(backend.user.login_locked_until, null);
});

test("an attempt that cannot be recorded fails closed without a password check", async () => {
  const backend = fakeBackend({ password: "correct horse" });
  backend.entities.FailedAdminAttempt.create = async () => { throw Error("db down"); };
  const stats = { realCompares: 0 };
  const signIn = loadVerifyLogin(backend, stats);
  const response = await signIn({ username: "staff", password: "correct horse" });
  assert.equal(response.status, 503);
  assert.equal(stats.realCompares, 0);
});
