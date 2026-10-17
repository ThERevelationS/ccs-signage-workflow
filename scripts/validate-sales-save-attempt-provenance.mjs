import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {trackedConditionalSave,prepareFieldAudit} from "../base44/shared/fieldAudit.ts";
import {projectPendingSalesAuditForAdmin} from "../base44/shared/salesAuditAdminReview.mjs";
import {verifyPendingSalesAuditReviewSnapshot} from "../base44/shared/salesAuditReviewSnapshot.mjs";
let checks=0;
function ok(value,label){assert.ok(value,label);checks++;}
function eq(value,expected,label){assert.deepEqual(value,expected,label);checks++;}
const initial={id:"syntheticSalesAttempt01",updated_date:"baseline-v1",sales_status:"lead",
  current_task_description:"Call customer",sales_last_follow_up_outcome:"",work_notes:"private notes"};
function fake(start=initial){
 let row={...start}, audits=[],writes=0,finalizeFails=false;
 const base44={asServiceRole:{entities:{
  WorkOrder:{
   async updateMany(query,update) {
    if(query.id!==row.id||query.updated_date!==row.updated_date)return {updated:0};
    writes++;row={...row,...update.$set,updated_date:"baseline-v"+(writes+1)};
    return {updated:1};
   },
   async get(){return {...row};},
  },
  Order:{async updateMany(){writes++;return {updated:1};},async get(){return {...row};}},
  FieldAudit:{
   async bulkCreate(events){const created=events.map((event,i)=>({...event,id:"synthetic-"+audits.length+"-"+i}));audits.push(...created);return created;},
   async bulkUpdate(events){if(finalizeFails)throw new Error("synthetic ack lost");
    for(const event of events){const found=audits.find(x=>x.id===event.id);if(found)found.status=event.status;}
   },
  },
 }}};
 return {base44,audits,get row(){return row;},get writes(){return writes;},
  forceConflict(){row={...row,updated_date:"changed-elsewhere"};},
  breakFinalization(){finalizeFails=true;}};
}
const operator={full_name:"Synthetic Staff",email:"staff@example.invalid"};
const local=fake();
const patch={sales_status:"follow_up",sales_last_follow_up_outcome:"Spoke with client",
 current_task_description:"Next call",work_notes:"updated private notes"};
const saved=await trackedConditionalSave(local.base44,"WorkOrder",initial,patch,operator);
eq(saved.sales_status,"follow_up","Sales save commits status.");
eq(local.writes,1,"Only one compare-and-set WorkOrder write.");
eq(local.audits.length,4,"All changed fields retain separate existing audit events.");
ok(local.audits.every(e=>e.status==="committed"),"Verified business write still finalizes every audit.");
const ids=new Set(local.audits.map(e=>e.save_attempt_id));
eq(ids.size,1,"All fields in one save share the same attempt ID.");
const attemptId=[...ids][0];
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId),
 "Attempt correlation uses opaque UUID.");
eq(local.audits[0].save_attempt_baseline_version,initial.updated_date,
 "Every event records the loaded pre-CAS WorkOrder version.");
ok(local.audits.every(e=>e.save_attempt_baseline_version===initial.updated_date),
 "Audit correlation is consistent across changed fields.");
eq(new Set(local.audits.map(e=>e.event_key)).size,4,
 "Existing per-field event keys remain independent.");
const previous=fake(saved);
await trackedConditionalSave(previous.base44,"WorkOrder",saved,
 {sales_last_follow_up_outcome:"Follow-up voicemail"},operator);
ok(previous.audits[0].save_attempt_id!==attemptId,"Distinct saves never reuse operation IDs.");
const stale=fake();
stale.forceConflict();
await assert.rejects(trackedConditionalSave(stale.base44,"WorkOrder",initial,patch,operator),e=>e.status===409);
checks++;
eq(stale.writes,0,"Stale compare-and-set does not write the WorkOrder.");
ok(stale.audits.every(e=>e.status==="aborted"),
 "CAS conflict leaves abort evidence, never fabricated committed events.");
const lostAck=fake();
lostAck.breakFinalization();
await assert.rejects(trackedConditionalSave(lostAck.base44,"WorkOrder",initial,patch,operator),/synthetic ack lost/);
checks++;
eq(lostAck.writes,1,"Lost audit-finalization acknowledgment does not trigger a second business write.");
ok(lostAck.audits.every(e=>e.status==="pending"),
 "Unfinalized rows remain pending and keep correlation metadata; never auto-promoted.");
const adminView=projectPendingSalesAuditForAdmin(lostAck.audits,lostAck.row);
eq(adminView.entries.length,3,"Admin view includes only whitelisted Sales fields.");
ok(adminView.entries.every(e=>e.save_attempt_id===lostAck.audits[0].save_attempt_id),
 "Admin can identify the same local save attempt without accessing private fields.");
ok(adminView.entries.every(e=>e.save_attempt_baseline_recorded),
 "Admin sees that pre-CAS baseline exists but not the raw version.");
ok(adminView.entries.every(e=>e.save_outcome==="unknown"&&e.operation_receipt==="unavailable"),
 "An operation ID is NOT presented as proof of successful WorkOrder write.");
ok(!JSON.stringify(adminView).includes("private notes")&&!JSON.stringify(adminView).includes("baseline-v1"),
 "Private notes and raw baseline version are not exposed in admin projection.");
const oldAttempt=projectPendingSalesAuditForAdmin([
 {...lostAck.audits[0],save_attempt_id:undefined,save_attempt_baseline_version:undefined}],lostAck.row);
eq(oldAttempt.entries[0].save_attempt_id,null,"Legacy audit entries without correlation remain supported.");
eq(oldAttempt.entries[0].save_attempt_baseline_recorded,false,
 "Missing baseline is explicitly distinguished from valid correlation.");
const mockedOrder=fake();
await prepareFieldAudit(mockedOrder.base44,"Order",initial,{sales_status:"lost"},operator);
eq(mockedOrder.audits[0].save_attempt_id,undefined,"Order audits remain unchanged.");
const smartsheet=fake();
await prepareFieldAudit(smartsheet.base44,"WorkOrder",initial,{sales_status:"quoted"},operator,"smartsheet");
eq(smartsheet.audits[0].save_attempt_id,undefined,"Smartsheet WorkOrder audits remain unchanged.");
const nonSales=fake();
await prepareFieldAudit(nonSales.base44,"WorkOrder",initial,{work_notes:"another note"},operator);
eq(nonSales.audits[0].save_attempt_id,undefined,"Unrelated WorkOrder-only audit saves remain unchanged.");
const concurrent=fake();
await prepareFieldAudit(concurrent.base44,"WorkOrder",initial,{sales_status:"quoted"},operator,"admin");
eq(concurrent.audits[0].save_attempt_id,undefined,"Existing admin-source audit path remains unchanged.");
const first={items:lostAck.audits.filter(x=>x.field_name!=="work_notes"),has_more:false};
const changed={items:first.items.map((x,i)=>i===0?{...x,save_attempt_id:"33333333-3333-4333-8333-333333333333"}:x),has_more:false};
assert.throws(()=>verifyPendingSalesAuditReviewSnapshot(first,changed,initial.id),e=>e.status===409);checks++;
const schema=readFileSync("base44/entities/FieldAudit.jsonc","utf8");
ok(schema.includes('"save_attempt_id"')&&schema.includes('"save_attempt_baseline_version"'),
 "Additive audit schema records both optional provenance fields.");
const ui=readFileSync("src/components/sales/SalesOpportunityDialog.jsx","utf8");
ok(ui.includes("Save outcome: unknown")&&ui.includes("correlation only")&&ui.includes("!entry.save_attempt_id"),
 "Admin UI distinguishes correlated modern attempts from unlinked legacy records.");
const writer=readFileSync("base44/shared/fieldAudit.ts","utf8");
ok(writer.includes("result?.updated !== 1")&&writer.includes("await finishFieldAudit(base44, events, 'committed')"),
 "CAS and finalization sequence is preserved.");
console.log("Sales Phase 6L optional WorkOrder save-attempt provenance: "+checks+"/"+checks+" PASS.");
