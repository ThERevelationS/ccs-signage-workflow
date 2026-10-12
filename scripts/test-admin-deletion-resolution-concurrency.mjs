import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";

const backend = readFileSync("base44/functions/manageAuthorizedUsers/entry.ts", "utf8");
function loadResolver() {
  const code = transformSync(backend + "\nexport const __resolveSynthetic = resolveDeletionRequest;\n",
    { loader: "ts", format: "cjs", target: "es2022" }).code;
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports, console, Date, TextEncoder, Response,
    Deno: { serve: () => undefined },
    require(name) {
      const modules = {
        "npm:@base44/sdk@0.8.25": { createClientFromRequest: () => { throw Error("Live SDK blocked"); } },
        "../../shared/signShopSession.ts": { authenticateSignShopSession: () => { throw Error("Live sessions blocked"); } },
        "../../shared/authorizedEmailCredentialPersistence.mjs": { replaceAuthorizedEmailCredentialFieldsIfUnchanged: () => { throw Error("Writes blocked"); } },
        "../../shared/pagedEntityRows.ts": { loadAllEntityRows: () => { throw Error("Reads blocked"); } },
        "../../shared/deletionImpactBoundedChecks.mjs": { runDeletionImpactChecks: () => { throw Error("Impact scan blocked"); } },
      };
      if (!Object.hasOwn(modules, name)) throw Error("Unexpected module " + name);
      return modules[name];
    },
  });
  return module.exports.__resolveSynthetic;
}
const resolve = loadResolver();
const initial = () => ({
  id: "synthetic-deletion-1",
  authorized_email_id: "synthetic-authorized-1",
  user_email: "employee@example.invalid",
  status: "pending",
  updated_date: "2026-10-12T09:00:00Z",
  admin_notes: "",
});
function fixture(options = {}) {
  let record = { ...initial(), ...options.record };
  let writes = 0;
  let candidates = 0;
  let forceVersionChange = false;
  const operations = [];
  const Request = {
    async get(id) {
      return record?.id === id ? structuredClone(record) : null;
    },
    async updateMany(filter, mutation) {
      candidates++;
      assert.equal(filter.id, initial().id);
      assert.equal(filter.authorized_email_id, initial().authorized_email_id);
      assert.equal(filter.user_email, initial().user_email);
      assert.equal(filter.status, "pending");
      assert.equal(filter.updated_date, initial().updated_date);
      if (forceVersionChange) {
        record.updated_date = "2026-10-12T09:01:00Z";
        forceVersionChange = false;
      }
      if (!record || Object.entries(filter).some(([key, value]) => record[key] !== value)) {
        return { updated: 0 };
      }
      writes++;
      record = { ...record, ...mutation.$set, updated_date: "2026-10-12T09:02:00Z" };
      operations.push(structuredClone(mutation.$set));
      if (options.dropAck) throw Error("Synthetic acknowledgement lost");
      return { updated: 1 };
    },
  };
  const actor = email => ({ email, role: "admin" });
  const body = (resolution = "processed", overrides = {}) => ({
    request_id: initial().id,
    expected_updated_date: initial().updated_date,
    expected_user_email: initial().user_email,
    expected_authorized_email_id: initial().authorized_email_id,
    resolution,
    admin_notes: "",
    ...overrides,
  });
  return {
    Request, actor, body,
    async apply(adminEmail, resolution = "processed", overrides = {}) {
      return resolve(Request, actor(adminEmail), body(resolution, overrides));
    },
    mutate(changes) { record = { ...record, ...changes }; },
    driftDuringCas() { forceVersionChange = true; },
    get record() { return structuredClone(record); },
    get writes() { return writes; },
    get attempts() { return candidates; },
    get operations() { return operations; },
  };
}
async function rejectedWith(promise, expectedStatus, pattern) {
  await assert.rejects(promise, error => {
    assert.equal(error.status, expectedStatus);
    assert.match(error.message, pattern);
    return true;
  });
}

test("Competing administrator resolutions produce exactly one version-guarded decision", async () => {
  const app = fixture();
  const [a, b] = await Promise.allSettled([
    app.apply("admin-a@example.invalid", "processed"),
    app.apply("admin-b@example.invalid", "cancelled"),
  ]);
  assert.equal(app.writes, 1);
  assert.equal(app.attempts, 2);
  assert.equal([a, b].filter(item => item.status === "fulfilled").length, 1);
  const rejected = [a, b].find(item => item.status === "rejected");
  assert.equal(rejected.reason.status, 409);
  assert.equal(app.record.resolution_source_updated_date, initial().updated_date);
  assert.equal(app.record.updated_date, "2026-10-12T09:02:00Z");
  assert.ok(["processed", "cancelled"].includes(app.record.status));
  assert.ok(["admin-a@example.invalid", "admin-b@example.invalid"].includes(app.record.processed_by));
});

test("Identical concurrent submissions reuse the same exact CAS outcome", async () => {
  const app = fixture();
  const decisions = await Promise.all([
    app.apply("admin-a@example.invalid"),
    app.apply("admin-a@example.invalid"),
    app.apply("admin-a@example.invalid"),
  ]);
  assert.equal(app.writes, 1);
  assert.ok(decisions.some(item => item.reused === false));
  assert.ok(decisions.some(item => item.reused === true));
  assert.ok(decisions.every(item => item.record.resolution_source_updated_date === initial().updated_date));
  assert.equal((await app.apply("admin-a@example.invalid")).reused, true);
  assert.equal(app.writes, 1);
});

test("Different admins or different decisions cannot claim an existing resolution", async () => {
  const app = fixture();
  await app.apply("admin-a@example.invalid", "processed");
  await rejectedWith(app.apply("admin-b@example.invalid", "processed"), 409, /already resolved/);
  await rejectedWith(app.apply("admin-a@example.invalid", "cancelled"), 409, /already resolved/);
  await rejectedWith(app.apply("admin-a@example.invalid", "processed", { admin_notes: "Different" }), 409, /already resolved/);
  await rejectedWith(app.apply("admin-a@example.invalid", "processed", {
    expected_updated_date: "2026-10-12T09:01:00Z",
  }), 409, /already resolved/);
  assert.equal(app.writes, 1);
});

test("Reused outcome cannot be claimed from a legacy row without source version", async () => {
  const app = fixture({
    record: {
      status: "processed", processed_by: "admin-a@example.invalid", processed_at: "2026-10-12T09:02:00Z",
      updated_date: "2026-10-12T09:02:00Z",
    },
  });
  await rejectedWith(app.apply("admin-a@example.invalid"), 409, /already resolved/);
  assert.equal(app.writes, 0);
});

test("Identity drift and stale record versions fail closed before mutation", async () => {
  const drift = fixture({ record: { user_email: "different@example.invalid" } });
  await rejectedWith(drift.apply("admin-a@example.invalid"), 409, /identity changed/);
  assert.equal(drift.writes, 0);
  const stale = fixture({ record: { updated_date: "2026-10-12T09:01:00Z" } });
  await rejectedWith(stale.apply("admin-a@example.invalid"), 409, /changed in another session/);
  assert.equal(stale.writes, 0);
  const intervening = fixture();
  intervening.driftDuringCas();
  await rejectedWith(intervening.apply("admin-a@example.invalid"), 409, /changed while it was being resolved/);
  assert.equal(intervening.writes, 0);
});

test("Incomplete identities, invalid resolutions, and missing admin identity are refused", async () => {
  const app = fixture();
  await rejectedWith(app.apply("admin-a@example.invalid", "processed", { expected_authorized_email_id: "" }), 400, /identity and version/);
  await rejectedWith(app.apply("admin-a@example.invalid", "destroy"), 400, /invalid/);
  await rejectedWith(app.apply("", "processed"), 403, /Administrator identity/);
  assert.equal(app.writes, 0);
});

test("Lost acknowledgement is recoverable only with the same original version and actor", async () => {
  const app = fixture({ dropAck: true });
  await assert.rejects(app.apply("admin-a@example.invalid"), /acknowledgement lost/);
  assert.equal(app.writes, 1);
  const result = await app.apply("admin-a@example.invalid");
  assert.equal(result.reused, true);
  assert.equal(result.record.resolution_source_updated_date, initial().updated_date);
  await rejectedWith(app.apply("admin-b@example.invalid"), 409, /already resolved/);
  assert.equal(app.writes, 1);
});

test("Schema, persistence proxy and UI retain identity/version and no account-delete mutations", () => {
  const schema = JSON.parse(readFileSync("base44/entities/AccountDeletionRequest.jsonc", "utf8"));
  assert.equal(schema.properties.resolution_source_updated_date.type, "string");
  const proxy = readFileSync("src/components/admin/authorizedUserAdminPersistence.js", "utf8");
  assert.match(proxy, /expected_user_email: request\.user_email/);
  assert.match(proxy, /expected_authorized_email_id: request\.authorized_email_id/);
  assert.match(proxy, /result\.record\.resolution_source_updated_date/);
  const ui = readFileSync("src/components/admin/UserManagement.jsx", "utf8");
  assert.match(ui, /deletionResolutionInFlight\.current = true/);
  assert.match(ui, /deletionResolutionInFlight\.current = false/);
  assert.match(ui, /item\.authorized_email_id === request\?\.authorized_email_id/);
  assert.match(backend, /Request\.updateMany\(/);
  assert.doesNotMatch(backend.slice(backend.indexOf("async function resolveDeletionRequest"), backend.indexOf("async function createUser")), /\.delete\(/);
});
