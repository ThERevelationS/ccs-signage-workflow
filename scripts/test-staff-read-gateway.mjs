// Contract checks for the generic staff read gateway:
//   - staffDataRead authenticates EmailGate sessions, whitelists entities,
//     enforces admin tier, bounds inputs, and redacts credential fields.
//   - No staff-facing file reads a role-gated entity directly.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

// Load the gateway's field guards (FIELD_DENYLIST..cleanQuery) as a module via
// Node's TypeScript stripping, without the Deno entrypoint.
async function loadGuards() {
  const start = gateway.indexOf("const FIELD_DENYLIST");
  const end = gateway.indexOf("function cleanLimit");
  assert.ok(start >= 0 && end > start, "gateway guard section not found");
  const dir = mkdtempSync(join(tmpdir(), "staff-read-guards-"));
  const file = join(dir, "guards.ts");
  writeFileSync(file, gateway.slice(start, end) + "\nexport { cleanQuery, cleanSort, projectItem };\n");
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("per-admin denied_fields cannot be probed through filters or sorts", async () => {
  const { cleanQuery, cleanSort, projectItem } = await loadGuards();
  const admin = { role: "admin", admin_permissions: { denied_fields: { TimeEntry: ["pay_rate"] } } };
  const rejects400 = (fn) => assert.throws(fn, (e) => e.status === 400);

  rejects400(() => cleanQuery({ pay_rate: { $regex: "^9" } }, "TimeEntry", admin));
  rejects400(() => cleanQuery({ pay_rate: { $gt: 90 } }, "TimeEntry", admin));
  rejects400(() => cleanQuery({ pay_rate: 95 }, "TimeEntry", admin));
  rejects400(() => cleanQuery({ "pay_rate.amount": 95 }, "TimeEntry", admin));
  rejects400(() => cleanSort("-pay_rate", "TimeEntry", admin));
  rejects400(() => cleanSort("user_email, pay_rate.amount", "TimeEntry", admin));
  assert.equal(projectItem("TimeEntry", { id: "1", pay_rate: 95 }, admin).pay_rate, undefined);

  // Unrestricted fields and callers are unaffected.
  assert.deepEqual(cleanQuery({ user_email: { $regex: "a" } }, "TimeEntry", admin), { user_email: { $regex: "a" } });
  assert.equal(cleanSort("-created_date", "TimeEntry", admin), "-created_date");
  assert.deepEqual(cleanQuery({ pay_rate: { $gt: 90 } }, "TimeEntry", { role: "admin" }), { pay_rate: { $gt: 90 } });
  assert.equal(cleanSort("pay_rate", "TimeEntry", { role: "admin" }), "pay_rate");
});

test("global denylisted fields cannot be filtered or sorted on", async () => {
  const { cleanQuery, cleanSort } = await loadGuards();
  const admin = { role: "admin" };
  for (const q of [{ password_hash: "x" }, { password_hash: { $regex: "^a" } }, { "face_descriptors.0": 1 }]) {
    assert.throws(() => cleanQuery(q, "AuthorizedEmail", admin), (e) => e.status === 400);
  }
  assert.throws(() => cleanSort("-login_locked_until", "AuthorizedEmail", admin), (e) => e.status === 400);
  assert.deepEqual(cleanQuery({ email: "a@b.c" }, "AuthorizedEmail", admin), { email: "a@b.c" });
});
