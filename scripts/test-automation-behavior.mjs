import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Runs production functions against in-memory entities only. No SDK request,
// integration call, credential, or production record is used.
const root = path.resolve(process.env.AUTOMATION_SOURCE_ROOT || ".");
const file = relative => {
  const staged = path.join(root, relative);
  return existsSync(staged) ? staged : path.resolve(relative);
};
const require = createRequire(pathToFileURL(path.resolve("package.json")));
const ts = require("typescript");
const policy = await import(pathToFileURL(file("base44/shared/automationRecordPolicy.mjs")));
const persistence = await import(pathToFileURL(file("base44/shared/workOrderFieldPersistence.mjs")));
const model = await import(pathToFileURL(file("src/components/admin/automationBuilderModel.mjs")));
const evidence = await import(pathToFileURL(file("base44/shared/clientWorkflowEventEvidence.mjs")));

function load(relative, dependencies = {}, serve = () => {}) {
  const source = readFileSync(file(relative), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const resolve = specifier => {
    if (specifier.endsWith("automationRecordPolicy.mjs")) return policy;
    if (specifier.endsWith("workOrderFieldPersistence.mjs")) return persistence;
    if (specifier.endsWith("pagedEntityRows.ts")) return load("base44/shared/pagedEntityRows.ts");
    if (specifier.endsWith("clientWorkflowEventEvidence.mjs")) return evidence;
    if (specifier in dependencies) return dependencies[specifier];
    throw new Error(`Unexpected test dependency: ${specifier}`);
  };
  new Function("require", "module", "exports", "Deno", output)(resolve, module, module.exports, { serve });
  return module.exports;
}

const { processWorkflowTriggerEvent: processEvent } = load("base44/shared/workflowTriggerEngine.ts");
const clone = value => structuredClone(value);
const report = { id: "report1", updated_date: "source-v1", title: "<script>bad</script>", type: "bug", status: "open", priority: "high" };
const trigger = (type = "feature_report_submitted", condition = {}, logic = "or") =>
  ({ trigger_type: type, trigger_condition: condition, logic });
const action = (type = "add_task", config = {}) => ({
  action_type: type, action_config: { task: "Review report", target_work_order_id: "wo1", ...config },
});
const rule = (changes = {}) => ({
  id: "rule1", updated_date: "rule-v1", name: "Review", enabled: true, priority: 0,
  triggers: [trigger()], actions: [action()], ...changes,
});

function fixture(rules = [rule()]) {
  const rows = new Map([["wo1", { id: "wo1", updated_date: "wo-v1", notes: [], work_notes: [], deleted: false }]]);
  const state = { writes: 0, sent: [], reads: [], source: clone(report), conflict: false };
  const WorkOrder = {
    get: async id => { state.reads.push(id); return clone(rows.get(id)); },
    updateMany: async (query, update) => {
      const current = rows.get(query.id);
      if (state.conflict || current.updated_date !== query.updated_date) return { updated: 0 };
      state.writes++;
      rows.set(query.id, { ...current, ...clone(update.$set), updated_date: `wo-v${state.writes + 1}` });
      return { updated: 1 };
    },
  };
  const base44 = {
    asServiceRole: { entities: {
      WorkOrder, FeatureReport: { get: async () => clone(state.source) },
      AutomationRule: { filter: async () => clone(rules) },
    } },
    integrations: { Core: { SendEmail: async message => state.sent.push(message) } },
  };
  const fire = (payload = {}) => processEvent({
    base44, changedByOverride: "Synthetic actor",
    payload: { event_type: "feature_report_submitted", record: { id: "report1" }, ...payload },
  });
  return { state, rows, base44, fire };
}

test("record actions use verified source filters and explicit destinations", async () => {
  const f = fixture([rule({ triggers: [trigger(undefined, { record_type: "bug", record_priority: "high" })] })]);
  assert.equal((await f.fire({ record: { ...report, type: "feature" } })).actions[0].result.task_added, "Review report");
  assert.equal(f.rows.get("wo1").notes.length, 1);
  f.state.source.type = "feature";
  assert.equal((await f.fire({ record: { ...report, type: "bug" } })).triggered_count, 0);
});

test("replayed record task and note events do not append duplicates", async () => {
  const f = fixture([rule({ actions: [action(), action("add_note", { note: "Review details" })] })]);
  await f.fire();
  await f.fire();
  assert.equal(f.rows.get("wo1").notes.length, 1);
  assert.equal(f.rows.get("wo1").work_notes.length, 1);
  assert.equal(f.state.writes, 2);
  f.state.source.updated_date = "source-v2";
  await f.fire();
  assert.equal(f.rows.get("wo1").notes.length, 2);
});

test("missing, trashed, and unspecified targets never write", async () => {
  for (const config of [{ target_work_order_id: "" }, { target_work_order_id: "missing" }]) {
    const f = fixture([rule({ actions: [action("add_task", config)] })]);
    const result = await f.fire();
    assert.equal(f.state.writes, 0);
    assert.ok(result.actions[0].error || result.actions[0].result.skipped);
  }
  const f = fixture();
  f.rows.get("wo1").deleted = true;
  assert.match((await f.fire()).actions[0].error, /Trash/);
  assert.equal(f.state.writes, 0);
});

test("conditional-write conflicts preserve other work and surface an action error", async () => {
  const f = fixture();
  f.state.conflict = true;
  assert.ok((await f.fire()).actions[0].error);
  assert.deepEqual(f.rows.get("wo1").notes, []);
});

test("disabled/malformed rules skip, AND/OR filters work, lower priorities run first", async () => {
  const f = fixture([
    rule({ id: "later", priority: 10, actions: [action("add_task", { task: "Later" })] }),
    rule({ enabled: false }), null, rule({ triggers: {} }),
    rule({ id: "first", priority: -1, actions: [action("add_task", { task: "First" })] }),
    rule({ id: "never", triggers: [trigger(), trigger("feature_report_completed", {}, "and")] }),
  ]);
  await f.fire();
  assert.deepEqual(f.rows.get("wo1").notes.map(t => t.text), ["First", "Later"]);
  const or = fixture([rule({ triggers: [trigger("feature_report_completed"), trigger(undefined, {}, "or")] })]);
  assert.equal((await or.fire()).triggered_count, 1);
});

test("action failure is contained and template variables are HTML-escaped", async () => {
  const f = fixture([rule({ actions: [action("add_task", { target_work_order_id: "missing" }),
    action("send_email", { recipients: [{ type: "email", value: "synthetic@example.invalid" }], body: "{{record_title}}" })] })]);
  const result = await f.fire();
  assert.ok(result.actions[0].error);
  assert.equal(f.state.sent.length, 1);
  assert.ok(f.state.sent[0].body.includes("&lt;script&gt;"));
  assert.ok(!f.state.sent[0].body.includes("<script>"));
});

test("presets start disabled, remain independent, and draft validation explains omissions", () => {
  const a = model.draftFromPreset(model.AUTOMATION_PRESETS[2]);
  const b = model.draftFromPreset(model.AUTOMATION_PRESETS[2]);
  assert.equal(a.formData.enabled, false);
  a.triggers[0].trigger_condition.record_type = "feature";
  assert.equal(b.triggers[0].trigger_condition.record_type, "bug");
  assert.deepEqual(model.draftProblems(b.triggers, b.actions), []);
  assert.ok(model.draftProblems([trigger()], [action("add_task", { target_work_order_id: "" })], true).length);
  assert.equal(model.destinationWorkOrderId("https://example.invalid/MainWorkflow?wo=wo1"), "wo1");
  assert.equal(model.destinationWorkOrderId("javascript:alert(1)"), "");
});

test("record policy excludes Time Clock and scheduled reminders", () => {
  assert.ok(policy.supportsRecordDestination("feature_report_submitted"));
  for (const type of ["time_off_approved", "time_clock_in", "order_overdue", "sales_follow_up_date_passed"]) {
    assert.equal(policy.supportsRecordDestination(type), false);
  }
  assert.throws(() => policy.assertAutomationStructure({ triggers: [], actions: [] }), /Choose/);
  assert.throws(() => policy.assertAutomationStructure({ triggers: [null], actions: [action()] }), /event/);
});

function request(body) {
  return new Request("https://synthetic.invalid", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

test("public endpoint rejects manufactured backend/account events before record access", async () => {
  let engineCalls = 0;
  let handler;
  let actor = { role: "employee", email: "synthetic@example.invalid" };
  const claims = [];
  load("base44/functions/processWorkflowTriggers/entry.ts", {
    "npm:@base44/sdk@0.8.23": { createClientFromRequest: () => ({ asServiceRole: { entities: {
      AuthorizedEmail: { get: async id => ({ id, updated_date: new Date().toISOString(), face_descriptors: [[0.1]] }) },
      WorkflowEventClaim: { filter: async () => claims.slice(), create: async data => { claims.push({ ...data, id: "claim1" }); return claims[0]; } },
    } } }) },
    "../../shared/entityRateLimitRetry.ts": { withEntityRateLimitRetry: client => client },
    "../../shared/workflowTriggerEngine.ts": { processWorkflowTriggerEvent: async () => { engineCalls++; return { success: true }; } },
    "../../shared/signShopSession.ts": { authenticateSignShopSession: async () => actor },
  }, value => { handler = value; });
  for (const event_type of ["user_registered", "user_password_reset", "feature_report_submitted", "user_role_changed", "user_face_enrolled"]) {
    assert.equal((await handler(request({ event_type, record: { id: "somebody-else" } }))).status, 403);
  }
  assert.equal(engineCalls, 0);
  actor = { role: "admin", email: "admin@example.invalid" };
  assert.equal((await handler(request({ event_type: "user_face_enrolled", record: { id: "user1" } }))).status, 200);
  assert.equal(engineCalls, 1);
});

function configFixture(initial = []) {
  const rows = clone(initial);
  const state = { writes: 0, lostReceipt: false };
  const Rule = {
    list: async () => clone(rows),
    get: async id => clone(rows.find(row => row.id === id)),
    create: async data => {
      state.writes++;
      const saved = { ...clone(data), id: "created", updated_date: "v1" };
      rows.push(saved);
      if (state.lostReceipt) throw new Error("synthetic lost receipt");
      return clone(saved);
    },
    updateMany: async (query, update) => {
      const row = rows.find(row => row.id === query.id && row.updated_date === query.updated_date);
      if (!row) return { updated: 0 };
      state.writes++;
      Object.assign(row, clone(update.$set), { updated_date: "v2" });
      return { updated: 1 };
    },
  };
  let handler;
  const base44 = { asServiceRole: { entities: {
    AutomationRule: Rule, EmailGroup: Rule,
    WorkOrder: { get: async id => id === "wo1" ? { id, deleted: false } : null },
  } } };
  load("base44/functions/manageAutomationConfig/entry.ts", {
    "npm:@base44/sdk@0.8.25": { createClientFromRequest: () => base44 },
    "../../shared/adminSettingsCapability.ts": { verifyAdminSettingsCapability: async (_, cap) => {
      if (cap !== "synthetic-capability") throw Object.assign(new Error("Admin authorization required"), { status: 403 });
    } },
  }, value => { handler = value; });
  return { state, rows, call: body => handler(request({ admin_capability: "synthetic-capability", ...body })) };
}

test("Admin rule creation rejects mismatched same-name records, but recovers exact lost receipts", async () => {
  const original = rule();
  const f = configFixture([original]);
  const response = await f.call({ action: "automation_create", data: { ...original, priority: 9 } });
  assert.equal(response.status, 409);
  assert.equal(f.state.writes, 0);
  const identical = await f.call({ action: "automation_create", data: original });
  assert.equal((await identical.json()).status, "existing");
  const recovered = configFixture();
  recovered.state.lostReceipt = true;
  const outcome = await recovered.call({ action: "automation_create", data: original });
  assert.equal((await outcome.json()).status, "recovered");
  assert.equal(recovered.rows.length, 1);
});

test("Admin authentication, malformed drafts, stale versions and missing destinations fail closed", async () => {
  const f = configFixture([rule()]);
  assert.equal((await f.call({ action: "automation_create", admin_capability: "", data: rule() })).status, 403);
  assert.equal((await f.call({ action: "automation_create", data: rule({ triggers: [] }) })).status, 400);
  assert.equal((await f.call({ action: "automation_create", data: rule({ actions: [action("add_task", { target_work_order_id: "missing" })] }) })).status, 400);
  assert.equal((await f.call({ action: "automation_update", id: "rule1", expected_updated_date: "stale", next_fields: { name: "Changed" } })).status, 409);
  assert.equal(f.state.writes, 0);
});

test("Admin email-group same-name saves cannot acknowledge different recipients", async () => {
  const f = configFixture([{ id: "group1", name: "Managers", description: "", emails: ["one@example.invalid"] }]);
  assert.equal((await f.call({ action: "email_group_create", data: {
    name: "Managers", emails: ["other@example.invalid"],
  } })).status, 409);
  assert.equal(f.state.writes, 0);
});

test("due-date actions honor zero-day and before/after choices", async () => {
  for (const [days, direction] of [[0, "after"], [3, "before"], [2, "after"]]) {
    const f = fixture([rule({ triggers: [trigger("work_order_updated")], actions: [action("set_due_date", { days, direction })] })]);
    const expected = new Date();
    expected.setDate(expected.getDate() + (direction === "before" ? -days : days));
    await f.fire({ event_type: "work_order_updated", record: undefined, work_order: { id: "wo1" } });
    assert.equal(f.rows.get("wo1").due_date, expected.toISOString().split("T")[0]);
  }
});
