import assert from "node:assert/strict";
import { trackedConditionalSave } from "../base44/shared/fieldAudit.ts";
import { buildNonterminalSalesPullPatch } from "../base44/shared/smartsheetSalesStageTransition.mjs";
import { planSalesFieldPull, guardSalesPulledTaskTransition } from "../base44/shared/smartsheetSalesPullPlan.ts";
import { readFileSync } from "node:fs";

const taskId = "4783818077955972";
const amtId = "5655853885876100";
const bindings = { current_task_description: taskId, estimate_amount: amtId };
const baseline = {
  id:"synthetic-cas-workorder",updated_date:"2026-10-09T12:00:00.000Z",
  in_pipeline:true, sales_status:"lead",
  current_task_description:"Complete Estimate for Review",estimate_amount:100,
  smartsheet_sync_snapshot:{ [taskId]:"Complete Estimate for Review", [amtId]:100 },
  smartsheet_last_synced_at:"2026-10-09T12:00:00.000Z",
};
const incoming = { current_task_description:"Estimate Sent to Customer", estimate_amount:150 };
const remote = { [taskId]:incoming.current_task_description,[amtId]:incoming.estimate_amount };
const plan = guardSalesPulledTaskTransition(baseline, incoming,
  planSalesFieldPull(baseline, incoming, remote, bindings), bindings);
const stamp = "2026-10-09T17:33:22.321Z";
const patch = buildNonterminalSalesPullPatch(baseline, plan.fields, plan.stageTransition, stamp);
let checks = 0;

function makeFake(initial) {
  let record = structuredClone(initial);
  const audit = [];
  let writes = 0;
  const base44 = { asServiceRole: { entities: {
    WorkOrder:{
      async updateMany(where, body){
        if (where.id !== record.id || where.updated_date !== record.updated_date) return {updated:0};
        writes++;
        record = {...record, ...body.$set, updated_date:"2026-10-09T17:33:22.999Z"};
        return {updated:1};
      },
      async get(id){return id === record.id ? structuredClone(record) : null;},
    },
    FieldAudit:{
      async bulkCreate(events){
        const created = events.map((e,i)=>({ ...e,id:"synthetic-audit-"+i }));
        audit.push(...created);
        return created;
      },
      async bulkUpdate(events){
        for(const e of events){const old=audit.find(x=>x.id===e.id);if(old)old.status=e.status;}
        return events;
      }
    },
  }}};
  return {base44,audit, get record(){return record;},get writes(){return writes;},
    simulateConcurrentEdit(){record={...record, current_task_description:"Conduct Site Survey",updated_date:"2026-10-09T17:32:00.000Z"};}};
}

const success = makeFake(baseline);
const saved = await trackedConditionalSave(success.base44,"WorkOrder",baseline,patch,
  {full_name:"Smartsheet Sales stage synchronization"},"smartsheet");
assert.equal(saved.sales_status,"quoted"); checks++;
assert.equal(saved.current_task_description,"Estimate Sent to Customer"); checks++;
assert.equal(saved.sales_stage_changed_at,stamp); checks++;
assert.equal(saved.estimate_amount,150); checks++;
assert.equal(success.writes,1); checks++;
for (const field of ["current_task_description","sales_status","sales_stage_changed_at","estimate_amount"]) {
  assert(success.audit.some((item)=>item.field_name===field && item.status==="committed" && item.source==="smartsheet"),
    "Committed stage sync must audit "+field);
  checks++;
}
assert.equal(saved.smartsheet_sync_snapshot[taskId],baseline.smartsheet_sync_snapshot[taskId],
  "CAS business write must not prematurely advance Smartsheet snapshot"); checks++;

const concurrent = makeFake(baseline);
concurrent.simulateConcurrentEdit();
await assert.rejects(
  trackedConditionalSave(concurrent.base44,"WorkOrder",baseline,patch,
    {full_name:"Smartsheet Sales stage synchronization"},"smartsheet"),
  (error)=>error.status===409,
);
checks++;
assert.equal(concurrent.writes,0,"Conflicted CAS must perform no business write"); checks++;
assert.equal(concurrent.record.sales_status,"lead","Conflicted CAS cannot move status"); checks++;
assert.equal(concurrent.record.current_task_description,"Conduct Site Survey","Concurrent task edit preserved"); checks++;
assert.equal(concurrent.record.sales_stage_changed_at,undefined,"No fabricated timestamp on failed CAS"); checks++;
assert(concurrent.audit.every(e=>e.status==="aborted"),"Failed CAS audit intents must be aborted");checks++;

const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts","utf8");
assert(backend.includes("const stageBatch = dataset === 'sales' ? batch.filter"),"Stage candidates bypass bulkUpdate");checks++;
assert(backend.includes("if (payload.length) await base44.asServiceRole.entities[entityName].bulkUpdate(payload)"),
  "Ordinary records retain existing bulk path without empty bulk calls"); checks++;
assert(backend.includes("trackedConditionalSave(base44, 'WorkOrder', _existing, patch") &&
  backend.includes("expectedStageChangedAt: stamp"),"Stage CAS retains timestamp for read-back");checks++;
assert(backend.includes("if (!businessFieldsVerified || !parentRowVerified || !stageVerified)"),
  "Stage verification must gate metadata advancement");checks++;
assert(!backend.includes("bulkUpdate(stageBatch)"),"Stage rows never use bulk updates");checks++;

console.log("Smartsheet nonterminal Sales stage CAS (synthetic): "+checks+"/"+checks+" PASS.");
