// Contract checks for the generic staff read gateway:
//   - staffDataRead authenticates EmailGate sessions, whitelists entities,
//     enforces admin tier, bounds inputs, and redacts credential fields.
//   - No staff-facing file reads a role-gated entity directly.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(p, "utf8");
const gateway = read("base44/functions/staffDataRead/entry.ts");
const shim = read("src/components/staff/staffEntities.js");

const STAFF_ENTITIES = [
  "AuthorizedEmail",
  "ActivityLog","EstimateClipboardItem","ImportJob","LegacyMigrationMap","PartTemplate",
  "PermittingOfficeAuthorityReview","PermittingRule","PermittingSourceDocument",
  "PermittingSourceTextSegment","PermittingWorkflowDraft","QuickProduct",
  "SourceCollectionQueue","SourceMonitorState","TimeClockAudit","TimeClockBreak",
  "TimeClockCorrectionRequest","TimeClockLaborSegment","TimeClockPayPeriod",
  "TimeClockWorkPause","TimeEntry","TimeOffRequest","UserPTOBalance",
];

test("staffDataRead authenticates the EmailGate session before entity access", () => {
  assert.match(gateway, /resolveFleetStaffUser\(base44, body\?\.session_token\)/);
  assert.match(gateway, /!user\?\.email[\s\S]*?status: 401/);
  assert.match(gateway, /base44\.asServiceRole\.entities\[entityName\]/);
});

test("staffDataRead whitelists every staff-facing gated entity", () => {
  for (const e of STAFF_ENTITIES) {
    assert.ok(gateway.includes(`'${e}'`), `gateway must whitelist ${e}`);
  }
  assert.match(gateway, /'AuthorizedEmail',/, "AuthorizedEmail must be staff-tier with field redaction");
  assert.match(gateway, /ADMIN_READABLE\.has\(entityName\) && user\.role !== 'admin'/);
});

test("staffDataRead redacts credential and session fields", () => {
  for (const field of ["password_hash","password_reset_token_hash","onboarding_token_hash","session_not_before","face_descriptors","failed_login_count","login_locked_until"]) {
    assert.ok(gateway.includes(`'${field}'`), `denylist must include ${field}`);
  }
  assert.match(gateway, /projectItem\(entityName/);
});

test("staffDataRead bounds all inputs", () => {
  assert.match(gateway, /MAX_LIMIT = 500/);
  assert.match(gateway, /key\.startsWith\('\$'\)/);
  assert.match(gateway, /SORT_PATTERN/);
  assert.match(gateway, /MAX_QUERY_BYTES/);
});

test("the shim exposes only read methods and attaches the session", () => {
  assert.match(shim, /invokeFleet\("staffDataRead"/);
  assert.match(shim, /filter: \(entity/);
  assert.match(shim, /list: \(entity/);
  assert.match(shim, /get: \(entity/);
  assert.match(shim, /not available to staff reads/);
});

test("no staff-facing file reads a role-gated entity directly", () => {
  const scanDirs = ["src/pages", "src/components"];
  const re = new RegExp("base44\\.entities\\.(" + STAFF_ENTITIES.join("|") + ")\\b");
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() && !/^fleet$/i.test(d.name) ? walk(`${dir}/${d.name}`) :
    d.isFile() && /\.(jsx?|tsx?)$/.test(d.name) ? [`${dir}/${d.name}`] : []);
  const offenders = scanDirs.flatMap(walk).filter((f) => re.test(read(f)));
  assert.deepEqual(offenders, [], `direct gated reads remain: ${offenders.join(", ")}`);
});

test("staffDataRead keeps UserCapacity.hourly_cost_rate admin-only", () => {
  assert.match(gateway, /ADMIN_ONLY_FIELDS[\s\S]*?UserCapacity: \['hourly_cost_rate'\]/);
  assert.match(gateway, /user\?\.role === 'admin' \? \[\] : \(ADMIN_ONLY_FIELDS\[entityName\]/);
  assert.match(gateway, /cleanQuery\(body\?\.query, entityName, user\)/);
  assert.match(gateway, /cleanSort\(body\?\.sort, entityName, user\)/);
  assert.match(gateway, /depth === 0 && deniedFields\.has\(key\)/);
  const entity = JSON.parse(read("base44/entities/UserCapacity.jsonc"));
  assert.equal(entity.rls?.read?.user_condition?.role, "__resource_capacity_backend_only__",
    "UserCapacity must not be directly readable from the browser");
});
