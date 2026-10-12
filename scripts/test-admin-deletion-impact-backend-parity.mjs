// Read-only execution parity of the actual legacy and current Base44 deletion
// impact backends. All SDK calls and entity reads are synthetic and isolated.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";
import { runDeletionImpactChecks } from "../base44/shared/deletionImpactBoundedChecks.mjs";
import { validateDeletionImpactReport } from "../src/components/admin/deletionImpactValidation.js";

const previousRevision = "572cf56a439217132e09b0b8128a8f26b89bd4eb";
const sourcePath = "base44/functions/manageAuthorizedUsers/entry.ts";
const historicSource = execFileSync("git", ["show", previousRevision + ":" + sourcePath], { encoding: "utf8" });
const currentSource = readFileSync(sourcePath, "utf8");
assert.match(historicSource, /Promise\.all\(DELETION_HISTORY_ENTITIES\.map/);
assert.match(currentSource, /runDeletionImpactChecks\(checks, 5\)/);

function actualBackend(source, loadAllEntityRows) {
  // Compile only inside the test process; imports are replaced by synthetic
  // adapters and Deno.serve is intercepted rather than starting a server.
  const exposed = source + "\nexport const __syntheticImpact = deletionImpactReport;\n";
  const compiled = transformSync(exposed, { loader: "ts", format: "cjs", target: "es2022" }).code;
  const module = { exports: {} };
  const syntheticModules = {
    "npm:@base44/sdk@0.8.25": { createClientFromRequest: () => { throw Error("No real SDK available"); } },
    "../../shared/signShopSession.ts": { authenticateSignShopSession: () => { throw Error("No real auth available"); } },
    "../../shared/authorizedEmailCredentialPersistence.mjs": {
      replaceAuthorizedEmailCredentialFieldsIfUnchanged: () => { throw Error("No real writes allowed"); },
    },
    "../../shared/pagedEntityRows.ts": { loadAllEntityRows },
    "../../shared/deletionImpactBoundedChecks.mjs": { runDeletionImpactChecks },
  };
  runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (!Object.hasOwn(syntheticModules, name)) throw Error("Unexpected backend module: " + name);
      return syntheticModules[name];
    },
    Deno: { serve(callback) {
      assert.equal(typeof callback, "function");
    } },
    TextEncoder, Response, console,
  }, { timeout: 5000 });
  assert.equal(typeof module.exports.__syntheticImpact, "function");
  return module.exports.__syntheticImpact;
}

const history = [
  "TimeEntry", "TimeClockAudit", "TimeOffRequest", "TimeClockBreak",
  "TimeClockWorkPause", "TimeClockCorrectionRequest", "TimeClockLaborSegment", "ImportJob",
];
const account = [
  "TimeClockEmployeeState", "TimeClockBadge", "UserPTOBalance",
  "UserCalendarSettings", "UserCapacity", "UserCredential", "FleetDashboardPreference",
];
const ownership = [
  "AllInOneEstimate", "BuilderProduct", "BuilderPart", "BuilderPartGroup",
  "QuickProduct", "PartTemplate", "ProjectTemplate", "EstimateClipboardItem",
  "CustomerSummary", "FoundationProject", "ChannelLetterInstallation",
  "VinylProject", "CNCProject", "LaserProject", "MetalProject",
  "MaintenanceProject", "Project", "BrickStoneProject", "Report", "SaveColor",
];
const allNames = [...history, ...account, ...ownership, "WorkOrder", "GeneralTask", "CalendarEvent"];
const normalized = value => JSON.parse(JSON.stringify(value));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function makeFixture({
  requestId = "synthetic-request-1",
  address = "employee@example.invalid",
  fullName = "Synthetic Team",
  authorized = true,
  userIds = ["synthetic-user-1"],
  many = false,
  empty = false,
  failEntity = null,
  delay = false,
} = {}) {
  const request = {
    id: requestId, user_email: address, user_name: fullName,
    authorized_email_id: "authorized-" + requestId,
    status: "pending", updated_date: "2026-10-11T12:00:00Z", requested_at: "2026-10-11T11:00:00Z",
  };
  const records = Object.fromEntries(allNames.map(name => [name, []]));
  if (!empty) {
    for (const [index, name] of history.entries()) {
      records[name] = Array.from({ length: many ? (index % 4) + 1 : index % 2 }, (_, n) =>
        ({ id: name + n, user_email: address }));
      records[name].push({ id: name + "-unrelated", user_email: "unrelated@example.invalid" });
    }
    for (const [index, name] of account.entries()) {
      records[name] = index % 3 === 0
        ? [{ id: name + "-state", user_email: address }]
        : [];
    }
    for (const [index, name] of ownership.entries()) {
      records[name] = [
        ...(userIds.length && index % 5 === 0
          ? [{ id: name + "-own", created_by_id: userIds[0] }]
          : []),
        { id: name + "-unrelated", created_by_id: "outsider-id" },
      ];
    }
    records.WorkOrder = [
      { id: "wo1", assigned_to: [address] },
      { id: "wo2", details: { metadata: { designer: fullName } } },
      { id: "wo3", assigned_to: "outsider@example.invalid" },
      { id: "wo4", notes: address }, // not a known identity field
    ];
    records.GeneralTask = [
      { id: "task1", assigned_to: { primary: fullName.toLowerCase() } },
      { id: "task2", created_by_name: "outsider" },
    ];
    records.CalendarEvent = [
      { id: "calendar1", notes: "Someone else's calendar" },
      { id: "calendar2", created_by: address },
    ];
  }
  let active = 0;
  let peak = 0;
  const reads = [];
  const attempts = [];
  const entities = Object.fromEntries(allNames.map(name => [name, { name }]));
  entities.AuthorizedEmail = {
    get: async id => id === request.authorized_email_id
      ? { id, email: authorized ? address : "mismatch@example.invalid", full_name: fullName }
      : null,
  };
  entities.User = {
    filter: async query => {
      assert.equal(query.email, address);
      return userIds.map((id, index) => ({ id, email: address, name: fullName, index }));
    },
  };
  const Request = {
    get: async id => id === request.id ? { ...request } : null,
  };
  async function loadAllEntityRows({ entity, query, sort, label }) {
    assert.equal(sort, null);
    assert.equal(typeof label, "string");
    assert.ok(allNames.includes(entity?.name), "Only synthetic known entities may be scanned");
    const name = entity.name;
    attempts.push(name);
    active += 1;
    peak = Math.max(peak, active);
    try {
      if (delay) await sleep(1 + name.length % 3);
      if (name === failEntity) throw Error("Synthetic read failure at " + name);
      const source = records[name];
      let rows = source;
      if (query?.user_email) rows = rows.filter(row => row.user_email === query.user_email);
      if (query?.created_by_id?.$in) {
        rows = rows.filter(row => query.created_by_id.$in.includes(row.created_by_id));
      }
      if (!query) assert.ok(["WorkOrder", "GeneralTask", "CalendarEvent"].includes(name));
      const result = rows.map(row => ({ ...row }));
      reads.push({ name, query: normalized(query ?? {}), count: result.length });
      return result;
    } finally {
      active -= 1;
    }
  }
  const base44 = { asServiceRole: { entities } };
  return {
    request, Request, base44, reads, attempts,
    get peak() { return peak; },
    get active() { return active; },
    legacy: actualBackend(historicSource, loadAllEntityRows),
    bounded: actualBackend(currentSource, loadAllEntityRows),
  };
}

function describeReads(reads) {
  return reads.map(row => JSON.stringify(row)).sort();
}

async function compare(options) {
  const oldFixture = makeFixture(options);
  const currentFixture = makeFixture(options);
  const oldReport = normalized(await oldFixture.legacy(oldFixture.base44, oldFixture.Request, oldFixture.request.id));
  const currentReport = normalized(await currentFixture.bounded(currentFixture.base44, currentFixture.Request, currentFixture.request.id));
  // The Admin request view now exposes an optional decision-provenance field;
  // compare the legacy scan contract without dropping any counts or blockers.
  const { resolution_source_updated_date, ...legacyCompatibleRequest } = currentReport.request;
  assert.equal(resolution_source_updated_date, null);
  assert.deepEqual({ ...currentReport, request: legacyCompatibleRequest }, oldReport,
    "Complete counts, blockers, identities and scan sections must match legacy backend");
  assert.deepEqual(describeReads(currentFixture.reads), describeReads(oldFixture.reads),
    "Actual entity/read query scopes and result counts must match baseline");
  assert.equal(currentFixture.active, 0);
  assert.ok(currentFixture.peak <= 5, "Bounded scan exceeded five simultaneous entity reads");
  assert.equal(validateDeletionImpactReport(currentReport, currentFixture.request), currentReport);
  return { oldFixture, currentFixture, report: currentReport };
}

test("Backend parity: historical payroll, estimator ownership, assignments and blockers", async () => {
  const { report, currentFixture } = await compare({});
  assert.ok(report.blockers.some(row => row.includes("Payroll/timekeeping history")));
  assert.ok(report.blockers.some(row => row.includes("estimator records")));
  assert.ok(report.blockers.some(row => row.includes("workflow/task/calendar")));
  assert.equal(report.assignments.WorkOrder, 2);
  assert.equal(report.assignments.GeneralTask, 1);
  assert.equal(report.assignments.CalendarEvent, 1);
  assert.equal(currentFixture.reads.length, allNames.length);
});

test("Backend parity: missing authorized match and duplicate Base44 identities", async () => {
  const { report } = await compare({ authorized: false, userIds: ["synthetic-user-1", "synthetic-user-2"] });
  assert.equal(report.target.authorized_email_exists, false);
  assert.equal(report.target.base44_user_count, 2);
  assert.ok(report.blockers.some(row => row.includes("AuthorizedEmail record")));
  assert.ok(report.blockers.some(row => row.includes("Multiple Base44 User records")));
});

test("Backend parity: no Base44 identities skips ownership reads, retaining zero rows", async () => {
  const { report, currentFixture, oldFixture } = await compare({ userIds: [] });
  assert.ok(report.ownership.every(row => row.count === 0));
  assert.ok(!currentFixture.reads.some(row => ownership.includes(row.name)));
  assert.equal(currentFixture.reads.length, history.length + account.length + 3);
  assert.equal(oldFixture.reads.length, currentFixture.reads.length);
});

test("Backend parity: truly empty data has no blockers and never invents records", async () => {
  const { report } = await compare({ empty: true, userIds: [] });
  assert.deepEqual(report.blockers, []);
  assert.equal(report.assignments.WorkOrder, 0);
  assert.ok(report.history.every(row => row.count === 0));
});

test("Backend parity: many synthetic records and varying read completion order", async () => {
  const { currentFixture, oldFixture } = await compare({ many: true, delay: true });
  assert.equal(currentFixture.reads.length, allNames.length);
  assert.equal(oldFixture.reads.length, currentFixture.reads.length);
  assert.ok(currentFixture.peak > 1);
});

test("Backend parity: partial entity read failures cannot produce a report", async () => {
  for (const name of ["TimeClockAudit", "UserCredential", "BuilderProduct", "GeneralTask"]) {
    const legacy = makeFixture({ failEntity: name, delay: true });
    const bounded = makeFixture({ failEntity: name, delay: true });
    await assert.rejects(
      legacy.legacy(legacy.base44, legacy.Request, legacy.request.id),
      /Synthetic read failure/,
    );
    await assert.rejects(
      bounded.bounded(bounded.base44, bounded.Request, bounded.request.id),
      /Synthetic read failure/,
    );
    // In-flight read-only checks may finish, but no result escapes on failure.
    await sleep(15);
    assert.equal(bounded.active, 0);
    assert.ok(bounded.peak <= 5);
    assert.ok(bounded.attempts.length <= allNames.length);
  }
});

test("Backend parity: overlapping isolated scans never mix identities or blockers", async () => {
  const optionsA = { requestId: "synthetic-A", address: "alpha@example.invalid", fullName: "Alpha Person", delay: true };
  const optionsB = { requestId: "synthetic-B", address: "beta@example.invalid", fullName: "Beta Person", userIds: [], empty: true, delay: true };
  const [alpha, beta] = await Promise.all([compare(optionsA), compare(optionsB)]);
  assert.equal(alpha.report.request.id, optionsA.requestId);
  assert.equal(beta.report.request.id, optionsB.requestId);
  assert.equal(alpha.report.target.email, optionsA.address);
  assert.equal(beta.report.target.email, optionsB.address);
  assert.ok(alpha.report.blockers.length > 0);
  assert.deepEqual(beta.report.blockers, []);
  assert.ok(alpha.currentFixture.peak <= 5);
  assert.ok(beta.currentFixture.peak <= 5);
});
