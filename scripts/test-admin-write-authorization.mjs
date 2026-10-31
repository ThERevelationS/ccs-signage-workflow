import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// Security contract: every Admin write path must carry a server-verified
// credential, and direct entity writes may only target entities whose RLS
// blocks non-admin (or all client) writes. This encodes the 2026-10 audit:
// capability paths read fresh at dispatch, session-token paths are verified
// server-side, and entity-SDK writes are gated by admin RLS. A regression in
// any arm should fail here instead of silently shipping an unverified write.

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
const entity = (name) => JSON.parse(stripComments(readFileSync(`base44/entities/${name}.jsonc`, "utf8")));

const CAPABILITY_HELPERS = [
  "src/components/admin/automationRulePersistence.js",
  "src/components/admin/emailGroupPersistence.js",
  "src/components/timeclock/ptoPersistence.js",
  "src/components/calendar/calendarEventPersistence.js",
];
const SESSION_TOKEN_HELPERS = [
  "src/components/admin/authorizedUserAdminPersistence.js",
  "src/components/admin/smartsheetSyncPersistence.js",
  "src/components/admin/corebridgeApiPersistence.js",
];

test("Every persistence helper payload carries a server-verified credential", () => {
  for (const [file, key] of [
    ...CAPABILITY_HELPERS.map(f => [f, "admin_capability"]),
    ...SESSION_TOKEN_HELPERS.map(f => [f, "session_token"]),
  ]) {
    const source = readFileSync(file, "utf8");
    // Two payload shapes are valid: the auth key inline at functions.invoke,
    // or inside every argument object handed to the invoke wrapper.
    const inlineAuthed = (source.match(new RegExp(`functions\\.invoke\\("[^"]+",\\s*\\{[\\s\\S]{0,400}?${key}\\s*:`, "g")) || []).length;
    const wrapperCalls = source.match(/\binvoke\w*\(\s*\{/g) || [];
    const authedWrapperCalls = (source.match(new RegExp(`\\binvoke\\w*\\(\\s*\\{[\\s\\S]{0,400}?${key}\\s*:`, "g")) || []).length;
    assert.ok(inlineAuthed + wrapperCalls.length > 0, `${file} must build invoke payloads`);
    assert.equal(inlineAuthed + authedWrapperCalls, inlineAuthed + wrapperCalls.length,
      `${file} has ${wrapperCalls.length - authedWrapperCalls} invoke payload(s) without ${key}`);
    assert.match(source, /functions\.invoke\("/, `${file} must dispatch through base44 functions`);
  }
});

test("Entities written through the SDK by Admin paths are server-gated", () => {
  // Entity-SDK writes rely on row-level security as the only authorization —
  // every write operation an Admin path can reach must be admin-gated.
  const adminGated = {
    AuthorizedEmail: ["create", "update", "delete"],
    GlobalSettings: ["create", "update", "delete"],
    // Admin trash paths only delete; create/update stay open for the app.
    WorkOrder: ["delete"],
  };
  for (const [name, ops] of Object.entries(adminGated)) {
    const rls = entity(name).rls || {};
    for (const op of ops) {
      const rule = rls[op];
      assert.ok(rule && typeof rule === "object" && rule.user_condition,
        `${name}.${op} must carry a user_condition rule — an open rule would let any user mutate it`);
    }
  }
  // Backend-only or admin-gated entities: every write op must carry a
  // user_condition role (sentinel __*_only__ roles block all SDK writes;
  // "admin" permits only admin sessions). An absent rule would be open.
  for (const name of ["EmailGroup", "PTOPolicy", "CalendarEvent", "UserPTOBalance", "AutomationRule"]) {
    const rls = entity(name).rls || {};
    for (const op of ["create", "update", "delete"]) {
      const role = rls[op]?.user_condition?.role;
      assert.equal(typeof role, "string",
        `${name}.${op} must carry a user_condition role rule — an absent rule is an open write`);
      assert.ok(role.length > 0, `${name}.${op} must name a required role`);
    }
  }
});

test("CalendarEvent reads are backend-only (staff read via staffDataRead)", () => {
  const role = entity("CalendarEvent").rls?.read?.user_condition?.role;
  assert.equal(role, "__calendar_event_backend_only__",
    "CalendarEvent.read must stay backend-only — an open read exposes staff emails, job sites and personal events");
});

test("Only the audited helpers perform direct entity writes inside admin components", () => {
  const allowed = new Set([
    "authorizedEmailPersistence.js",   // entity.create — AuthorizedEmail is admin-RLS
    "projectTrashPersistence.js",      // entity.deleteMany — WorkOrder delete is admin-RLS
  ]);
  const writers = [];
  for (const file of readdirSync("src/components/admin")) {
    if (!/\.(jsx?|mjs)$/.test(file)) continue;
    const source = readFileSync(`src/components/admin/${file}`, "utf8");
    if (/\bentities\.\w+\.(create|update|delete|bulkUpdate|deleteMany)\(|\bentity\?\.\s*(create|update|delete|bulkUpdate|deleteMany)\(|\bentity\.(create|update|delete|bulkUpdate|deleteMany)\(/.test(source)) {
      writers.push(file);
    }
  }
  assert.deepEqual(writers.sort(), [...allowed].sort(),
    "a new direct entity write inside admin components must be audited for RLS before shipping");
});

test("Inline function invokes inside admin components are credentialed or platform-audited", () => {
  // Every inline invoke("name", {...}) in admin components must either carry a
  // request credential or target a function verified to authenticate via
  // createClientFromRequest(req).auth.me() + admin role server-side (the
  // platform ambient session). A new function invoke lands here as a test
  // failure until its backend auth is audited — this is the tripwire that
  // would have caught SyncAlertSettings' uncredentialed smartsheetSyncAction
  // calls, which silently 403'd until the 2026-10 fix.
  const CREDENTIAL = /session_token|admin_capability|sessionToken|writeCapability|requireSessionToken/;
  const PLATFORM_AUTHED = new Set([
    "auditJurisdictionAccuracy",          // auth.me() + role==='admin'
    "opportunityBridgeSimulation",        // auth.me() + role==='admin'
    "permittingHtmlEvidence",             // auth.me() + role==='admin' on mutating actions
    "permittingOfficeAuthorityReview",    // auth.me() + role==='admin' on mutating actions
    "permittingOfficeCandidate",          // auth.me() + role==='admin'
    "permittingResearchBacklogDispatch",  // auth.me() + role==='admin'
    "permittingSourceAuthorityReview",    // auth.me() + role==='admin'
    "updateJurisdictionRewriteAuthority", // auth.me() + role==='admin'
  ]);
  // Variable-name and variable-payload invokes (invoke(name, body),
  // invokePermittingReview, queueSmartsheetSync) are not inline literals and
  // are covered by the helper-payload test or the caller's own contract.
  for (const file of readdirSync("src/components/admin")) {
    if (!/\.(jsx?|mjs)$/.test(file)) continue;
    const source = readFileSync(`src/components/admin/${file}`, "utf8");
    for (const match of source.matchAll(/functions\.invoke\(["']([\w]+)["'],\s*\{/g)) {
      const fn = match[1];
      const payload = source.slice(match.index, match.index + 1500);
      if (CREDENTIAL.test(payload)) continue;
      assert.ok(PLATFORM_AUTHED.has(fn),
        `${file} invokes ${fn} without a credential and ${fn} is not on the audited platform-auth allowlist`);
    }
  }
});

test("UserManagement fences in-flight writes against session-token changes", () => {
  const source = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
  assert.match(source, /activeSessionToken\.current = sessionToken/);
  assert.match(source, /activeSessionToken\.current !== sessionToken/);
  assert.match(source, /activeSessionToken\.current === sessionToken/);
});
