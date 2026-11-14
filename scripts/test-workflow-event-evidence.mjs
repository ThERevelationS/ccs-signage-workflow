import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Client-reported automation events must prove a fresh matching write and fire
// once per record version. In-memory entities only; no SDK or production data.
const require = createRequire(pathToFileURL(path.resolve("package.json")));
const ts = require("typescript");
const evidence = await import(pathToFileURL(path.resolve("base44/shared/clientWorkflowEventEvidence.mjs")));
const { verifyClientWorkflowEvent, claimClientWorkflowEvent } = evidence;

const now = Date.parse("2026-10-31T12:00:00Z");
const fresh = "2026-10-31T11:58:00.000000";
const stale = "2026-10-30T11:58:00.000000";
const wo = (fields = {}) => ({ id: "wo1", updated_date: fresh, created_date: stale, current_stage: "design", notes: [{ text: "Order vinyl", completed: true }], ...fields });
const verify = (eventType, record, extras = {}, entityType = "WorkOrder") => verifyClientWorkflowEvent({ eventType, entityType, record, extras, now });

test("events without a recent durable write on the record are rejected", () => {
  assert.throws(() => verify("work_order_updated", wo({ updated_date: stale })), e => e.status === 409);
  assert.throws(() => verify("work_order_updated", wo({ updated_date: "" })), e => e.status === 409);
  assert.deepEqual(verify("work_order_updated", wo()), {});
});

test("claimed transitions must match the re-read record", () => {
  assert.throws(() => verify("work_order_completed", wo({ completed: false })), e => e.status === 409);
  verify("work_order_completed", wo({ completed: true }));
  assert.throws(() => verify("stage_installation_entered", wo(), { previousStage: "design", newStage: "installation" }), e => e.status === 409);
  assert.throws(() => verify("stage_changed", wo(), { previousStage: "sales", newStage: "installation" }), e => e.status === 409);
  assert.throws(() => verify("stage_changed", wo(), {}), e => e.status === 409);
  assert.deepEqual(verify("stage_design_entered", wo(), { previousStage: "sales", newStage: "design" }), { previousStage: "sales", newStage: "design" });
  assert.throws(() => verify("work_order_created", wo()), e => e.status === 409);
  verify("work_order_created", wo({ created_date: fresh }));
  assert.throws(() => verify("permit_approved", wo()), e => e.status === 409);
  assert.throws(() => verify("rider_completed", wo({ completed: true })), e => e.status === 409);
  assert.throws(() => verify("asap_toggled_on", wo()), e => e.status === 409);
  assert.throws(() => verify("assigned_to_changed", wo({ assigned_to: "Bob" }), { newAssignee: "Eve" }), e => e.status === 409);
  assert.throws(() => verify("order_received", { id: "o1", updated_date: fresh, status: "ordered" }, {}, "Order"), e => e.status === 409);
  assert.throws(() => verify("order_ordered", { id: "o1", updated_date: fresh, status: "ordered", deleted: true }, {}, "Order"), e => e.status === 409);
});

test("only record-backed extras reach the engine", () => {
  const out = verify("task_completed", wo(), { taskText: "Order vinyl", noteText: "<b>Refund approved</b>", noteType: "x", changedBy: "CEO", eventDescription: "forged", previousStage: "sales" });
  assert.deepEqual(out, { taskText: "Order vinyl" });
  assert.deepEqual(verify("note_added", wo({ work_notes: [{ text: "Call client" }] }), { noteText: "Call client", noteType: "general" }), { noteText: "Call client", noteType: "general" });
});

function claimStore() {
  const rows = [];
  let seq = 0;
  return { rows, entity: {
    filter: async q => rows.filter(r => r.claim_key === q.claim_key).map(r => ({ ...r })),
    create: async data => { const row = { ...data, id: `c${++seq}`, created_date: `2026-10-31T12:00:0${seq}` }; rows.push(row); return { ...row }; },
  } };
}

test("each event fires once per record version", async () => {
  const store = claimStore();
  const args = { entity: store.entity, eventType: "task_completed", entityType: "WorkOrder", record: wo() };
  await claimClientWorkflowEvent(args);
  await assert.rejects(claimClientWorkflowEvent(args), e => e.status === 409);
  await claimClientWorkflowEvent({ ...args, eventType: "work_order_updated" });
  await claimClientWorkflowEvent({ ...args, record: wo({ updated_date: "2026-10-31T11:59:00.000000" }) });
  assert.equal(store.rows.length, 3);
  await assert.rejects(claimClientWorkflowEvent({ ...args, entity: {} }), e => e.status === 503);
});

function loadEntry(dependencies) {
  const source = readFileSync("base44/functions/processWorkflowTriggers/entry.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let handler;
  const module = { exports: {} };
  const resolve = specifier => {
    if (specifier.endsWith("clientWorkflowEventEvidence.mjs")) return evidence;
    if (specifier in dependencies) return dependencies[specifier];
    throw new Error(`Unexpected test dependency: ${specifier}`);
  };
  new Function("require", "module", "exports", "Deno", output)(resolve, module, module.exports, { serve: h => { handler = h; } });
  return handler;
}

const request = body => new Request("https://synthetic.invalid", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

test("endpoint rejects fabricated events and forwards only verified context", async () => {
  const calls = [];
  const store = claimStore();
  const records = { WorkOrder: { wo1: wo({ updated_date: new Date().toISOString(), completed: false }) } };
  const base44 = { asServiceRole: { entities: {
    WorkOrder: { get: async id => records.WorkOrder[id] ?? null },
    WorkflowEventClaim: store.entity,
  } } };
  const handler = loadEntry({
    "npm:@base44/sdk@0.8.23": { createClientFromRequest: () => base44 },
    "../../shared/entityRateLimitRetry.ts": { withEntityRateLimitRetry: client => client },
    "../../shared/workflowTriggerEngine.ts": { processWorkflowTriggerEvent: async args => { calls.push(args.payload); return { success: true, triggered_count: 1, actions: [{ result: { recipients: ["secret@example.invalid"] } }] }; } },
    "../../shared/signShopSession.ts": { authenticateSignShopSession: async () => ({ role: "user", email: "staff@example.invalid" }) },
  });
  const fire = body => handler(request({ session_token: "t", work_order: { id: "wo1" }, ...body }));

  assert.equal((await fire({ event_type: "work_order_completed" })).status, 409);
  assert.equal((await fire({ event_type: "time_off_approved", record: { id: "pto1" } })).status, 403);
  assert.equal(calls.length, 0);

  const ok = await fire({ event_type: "task_completed", extras: { taskText: "Order vinyl", noteText: "forged" }, old_data: { completed: true } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { success: true, paused: false, triggered_count: 1 });
  assert.deepEqual(calls[0].extras, { taskText: "Order vinyl" });
  assert.deepEqual(calls[0].old_data, {});
  assert.equal((await fire({ event_type: "task_completed", extras: { taskText: "Order vinyl" } })).status, 409);
  assert.equal(calls.length, 1);
});
