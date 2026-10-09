import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isIdenticalLastAppliedMechanicSave } from "../base44/shared/fleetMechanicLastSaveGuard.ts";

const grantId="mechanic-1";
const jobId="fleet-work-1";
const fingerprint="a-durable-payload-fingerprint";
const operationKey=`mechanic:${grantId}:${jobId}:save:request-original`;
const work=()=>({
  id:jobId,updated_date:"revision-2",
  mechanic_operation_key:operationKey,mechanic_operation_fingerprint:fingerprint,
});
const receipt=()=>({
  id:"receipt-1",status:"applied",operation_type:"mechanic_progress_save",
  target_entity:"FleetMaintenanceWorkOrder",target_id:jobId,
  operation_key:operationKey,payload_fingerprint:fingerprint,
  result_summary:{grant_id:grantId,work_order_updated_date:"revision-2"},
});
const guard=(wo=work(),row=receipt(),grant=grantId,target=jobId,hash=fingerprint) =>
  isIdenticalLastAppliedMechanicSave(wo,row,grant,target,hash);

test("reopened tab with new request id recognizes latest unchanged applied Save",()=>{
  assert.equal(guard(),true);
});
test("different work content remains a distinct Save",()=>{
  assert.equal(guard(work(),receipt(),grantId,jobId,"different-payload"),false);
});
test("stale marker after intervening work-order update never blocks new Save",()=>{
  assert.equal(guard({...work(),updated_date:"revision-3"}),false);
});
test("unfinished or failed receipts cannot be described as applied",()=>{
  assert.equal(guard(work(),{...receipt(),status:"started"}),false);
  assert.equal(guard(work(),{...receipt(),status:"failed"}),false);
});
test("missing and conflicting receipt marker data fail closed",()=>{
  assert.equal(guard(work(),null),false);
  assert.equal(guard({...work(),mechanic_operation_key:""}),false);
  assert.equal(guard(work(),{...receipt(),operation_key:"different"}),false);
  assert.equal(guard(work(),{...receipt(),payload_fingerprint:"different"}),false);
});
test("mechanic grant or equipment work-order crossovers never deduplicate",()=>{
  assert.equal(guard(work(),receipt(),"another-grant"),false);
  assert.equal(guard(work(),receipt(),grantId,"other-work-order"),false);
  assert.equal(guard(work(),{...receipt(),result_summary:{...receipt().result_summary,grant_id:"another-grant"}}),false);
});
test("Start Work and non-Fleet receipts cannot masquerade as saved progress",()=>{
  assert.equal(guard({...work(),mechanic_operation_key:`mechanic:${grantId}:${jobId}:start:request-original`}),false);
  assert.equal(guard(work(),{...receipt(),operation_type:"mechanic_start"}),false);
  assert.equal(guard(work(),{...receipt(),target_entity:"WorkOrder"}),false);
});
test("work order version is required and must equal durable receipt version",()=>{
  assert.equal(guard({...work(),updated_date:""}),false);
  assert.equal(guard(work(),{...receipt(),result_summary:{...receipt().result_summary,work_order_updated_date:"revision-1"}}),false);
});
test("backend rechecks live grant before reading matching receipt and checks integrity",()=>{
  const source=readFileSync(new URL("../base44/functions/fleetMechanicPortal/entry.ts",import.meta.url),"utf8");
  const begin=source.indexOf("// A closed tab can lose its original request id.");
  const stop=source.indexOf("if (action === 'estimate_save'",begin);
  assert.ok(begin>0 && stop>begin);
  const block=source.slice(begin,stop);
  const auth=block.indexOf("await requireCurrentMechanicGrant(");
  const read=block.indexOf("await Receipt.filter(");
  const guardCall=block.indexOf("isIdenticalLastAppliedMechanicSave(");
  assert.ok(auth>=0 && read>auth && guardCall>read);
  assert.match(block,/priorRows\.length|\(priorRows \|\| \[\]\)\.length > 1/);
  assert.match(block,/mechanicWorkOrderResponse\([\s\S]*already_applied:true/);
});
