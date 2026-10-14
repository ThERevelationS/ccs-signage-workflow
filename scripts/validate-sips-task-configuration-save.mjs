import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Synthetic-only verification of the protected SIPS checklist save branch.
const src = readFileSync(new URL("../base44/functions/fieldHistoryAction/entry.ts", import.meta.url), "utf8");
const frontend = readFileSync(new URL("../src/components/sips/ProductChecklistDialog.jsx", import.meta.url), "utf8");

let passed = 0;
async function check(title, fn) {
  await fn();
  console.log("PASS " + title);
  passed++;
}

const start = src.indexOf("async function verifyGuardedSipsTaskEligibility(");
const end = src.indexOf("async function fieldHistoryHandler(", start);
assert.ok(start >= 0 && end > start, "Guard helper is present in the backend action");
const verify = new Function(src.slice(start, end) + "\nreturn verifyGuardedSipsTaskEligibility;")();

let settingsRows = [{ setting_value: { items: [{ text: "SIPS meeting", wip: true }] } }];
const reads = [];
const server = {
  asServiceRole: { entities: { GlobalSettings: {
    filter: async (query, options) => {
      reads.push({ query, options });
      return { items: settingsRows };
    }
  } } }
};
const record = {
  id: "synthetic-sips-record", completed: false, is_rider: false,
  current_task_assigned_to: "Production", current_task_description: "SIPS meeting"
};

await check("WIP and SIPS-page settings authorize the same task as the SIPS board", async () => {
  await verify(server, record);
  assert.deepEqual(reads[0], {
    query: { setting_key: "salesTaskDescriptions" }, options: { limit: 2 }
  });
  settingsRows = [{ setting_value: { items: [{ text: "SIPS meeting", page: "SIPs" }] } }];
  await verify(server, record);
});

await check("Revoked configuration blocks an unchanged Work Order at server save time", async () => {
  settingsRows = [{ setting_value: { items: [{ text: "SIPS meeting", page: "Other", wip: false }] } }];
  await assert.rejects(() => verify(server, record), /no longer configured for SIPS or WIP/);
  settingsRows = [{ setting_value: { items: [{ text: "Unrelated", page: "SIPs" }] } }];
  await assert.rejects(() => verify(server, record), /no longer configured for SIPS or WIP/);
  settingsRows = [];
  await assert.rejects(() => verify(server, record), /no longer configured for SIPS or WIP/);
});

await check("Direct SIPS assignment remains eligible without configuration", async () => {
  record.current_task_assigned_to = "SIPs";
  const before = reads.length;
  await verify(server, record);
  assert.equal(reads.length, before);
  record.current_task_assigned_to = "Production";
});

await check("Malformed or ambiguous task settings reject guarded writes", async () => {
  settingsRows = [{ setting_value: { items: null } }];
  await assert.rejects(() => verify(server, record), /configuration could not be verified/);
  settingsRows = [{ setting_value: { items: [] } }, { setting_value: { items: [] } }];
  await assert.rejects(() => verify(server, record), /configuration could not be verified/);
  const filter = server.asServiceRole.entities.GlobalSettings.filter;
  server.asServiceRole.entities.GlobalSettings.filter = async () => ({ somethingElse: "invalid" });
  await assert.rejects(() => verify(server, record), /configuration could not be verified/);
  server.asServiceRole.entities.GlobalSettings.filter = filter;
});

await check("Completed or rider Work Orders reject guarded checklist saves", async () => {
  record.completed = true;
  await assert.rejects(() => verify(server, record), /no longer active for SIPS/);
  record.completed = false;
  record.is_rider = true;
  await assert.rejects(() => verify(server, record), /no longer active for SIPS/);
  record.is_rider = false;
});

await check("Only SIPS snapshot-guarded checklist saves trigger cross-entity checks", async () => {
  const gateStart = src.indexOf("      // Read SIPS/WIP settings at the last available pre-write boundary.");
  const gateEnd = src.indexOf("      const saved=await trackedConditionalSave(", gateStart);
  assert.ok(gateStart > 0 && gateEnd > gateStart);
  const gate = new Function(
    "type", "patch", "body", "base44", "record", "verifyGuardedSipsTaskEligibility",
    "return (async () => {\n" + src.slice(gateStart, gateEnd) + "\n})();"
  );
  let calls = 0;
  const count = async () => { calls++; };
  const fields = { current_task_assigned_to: "Production",
    current_task_description: "SIPS meeting", sip_completed: false };
  await gate("Order", { sip_checklist: [] }, { guard_fields: fields }, server, record, count);
  await gate("WorkOrder", { notes: "ordinary edit" }, { guard_fields: fields }, server, record, count);
  await gate("WorkOrder", { sip_checklist: [] }, { guard_fields: { sip_completed: false } }, server, record, count);
  assert.equal(calls, 0, "Unrelated saves remain on their original path");
  await gate("WorkOrder", { sip_checklist: [], sip_revisit_date: "2099-04-01" },
    { guard_fields: fields }, server, record, count);
  await gate("WorkOrder", { sip_checklist: [], sip_completed: true },
    { guard_fields: fields }, server, record, count);
  assert.equal(calls, 2, "Save & Revisit and completion trigger task verification");
  const eligibilityAt = src.indexOf("await verifyGuardedSipsTaskEligibility(base44,record);");
  const writeAt = src.indexOf("const saved=await trackedConditionalSave(");
  assert.ok(eligibilityAt > src.indexOf("validateSalesActivityTimestampPatch(record,patch,equivalent)") &&
    eligibilityAt < writeAt, "SIPS task eligibility must be checked after validators, immediately before persistence");
  assert.match(frontend, /guardFields: loadedWorkflowSnapshotRef\.current/);
});

await check("Revocation during synchronous validation is rejected before guarded write", async () => {
  const begin = src.indexOf("const optionalFields =");
  const finish = src.indexOf("export default async function", begin);
  assert.ok(begin >= 0 && finish > begin);
  const backend = src.slice(begin, finish);
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ||
    ((a == null || a === "") && (b == null || b === ""));
  let config = [{ setting_value: { items: [{ text: "SIPS meeting", wip: true }] } }];
  let writes = 0;
  let revoke = true;
  const wo = {
    id: "syntheticWO981", updated_date: "v1", deleted: false, completed: false,
    is_rider: false, current_task_assigned_to: "Production",
    current_task_description: "SIPS meeting", current_stage: "Production",
    sip_completed: false, sip_revisit_date: "", sip_checklist: [], products: []
  };
  const sdk = { asServiceRole: { entities: {
    WorkOrder: { get: async () => structuredClone(wo) },
    GlobalSettings: { filter: async () => ({ items: config }) }
  } } };
  const deps = {
    createClientFromRequest: () => sdk, measureSyncEntities: x => x,
    authenticateSignShopSession: async () => ({ role: "user" }),
    beginSyncTraceStorage: async () => {}, equivalent: same,
    validateNeutralSalesCloseout: () => {}, validateSalesStageTimestampPatch: () => {},
    validateSalesActivityTimestampPatch: () => {
      if (revoke) config = [{ setting_value: {
        items: [{ text: "SIPS meeting", page: "Other", wip: false }]
      } }];
    },
    trackedConditionalSave: async (_sdk, _type, row, patch) => {
      writes++;
      return { ...row, ...patch, updated_date: "v2" };
    },
    Response
  };
  const handler = new Function("deps",
    "with(deps) {\n" + backend + "\nreturn fieldHistoryHandler;\n}")(deps);
  const patch = { sip_checklist: [{ id: "synthetic-row", text: "Step" }], products: [] };
  const request = () => ({ json: async () => ({
    action: "save", session_token: "synthetic-only", entity_type: "WorkOrder",
    entity_id: wo.id, next_fields: patch,
    expected_fields: { sip_checklist: [], products: [] },
    guard_fields: {
      current_task_assigned_to: "Production", current_task_description: "SIPS meeting",
      current_stage: "Production", sip_completed: false, completed: false, is_rider: false
    }
  }) });
  let result = await handler(request());
  assert.equal(result.status, 409);
  assert.match((await result.json()).error, /no longer configured for SIPS or WIP/);
  assert.equal(writes, 0, "Final guard prevents the save after revocation");
  revoke = false;
  config = [{ setting_value: { items: [{ text: "SIPS meeting", wip: true }] } }];
  result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal(writes, 1, "Eligible checklist still saves normally");
});

console.log(passed + "/" + passed + " protected SIPS task configuration checks passed");
