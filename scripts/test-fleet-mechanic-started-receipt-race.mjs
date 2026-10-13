// Real fleetMechanicPortal handler with synthetic in-memory Base44 entities.
// Never invokes Base44 production entities, secrets, URLs, or uploads.
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import path from "node:path";
import {createHash} from "node:crypto";

const root=process.cwd();
let source=readFileSync(path.join(root,"base44/functions/fleetMechanicPortal/entry.ts"),"utf8");
source=source.replace("import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';",
  "const createClientFromRequest = () => globalThis.__fleetReceiptRaceClient;");
source=source.replace(/from '([^']+\.ts)';/g,(_whole,spec)=>`from '${pathToFileURL(path.resolve(root,"base44/functions/fleetMechanicPortal",spec)).href}';`);
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
let handler;
globalThis.Deno={serve:fn=>{handler=fn;}};
await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
assert.equal(typeof handler,"function");
const clone=value=>structuredClone(value);
const sha=value=>createHash("sha256").update(value).digest("hex");
const token="synthetic-race-mechanic-token-abcdefghijklmnopqrstuvwxyz0123456789";
const grantId="grant-race";
const workId="work-race";
const photoPayload={type:"image/jpeg",data:Buffer.from([255,216,255,219,4,7,9,2]).toString("base64")};
const baseWork=()=>({id:workId,updated_date:"version-1",status:"in_progress",equipment_id:"eq-race",
  notes:"",after_photos:[],actual_hours:1,corrective_action:""});
const payload=(requestId,overrides={})=>({
  action:"save",token,work_order_id:workId,request_id:requestId,expected_updated_date:"version-1",
  actual_hours:"2.5",corrective_action:"Synthetic repair",mechanic_note:"Synthetic note",photos:[],...overrides,
});
const fp=body=>sha(JSON.stringify({
  action:body.action,actual_hours:String(body.actual_hours??"").trim(),
  corrective_action:String(body.corrective_action||"").trim().slice(0,5000),
  mechanic_note:String(body.mechanic_note||"").trim().slice(0,2000),
  photos:(body.photos||[]).map(row=>({type:row.type,sha256:sha(row.data)})),
}));
function makeReceipt(body,{status="started",photos=[],count=0}={}){
  return {
    id:"old-receipt",operation_key:`mechanic:${grantId}:${workId}:save:request-original-123456`,
    operation_type:"mechanic_progress_save",target_entity:"FleetMaintenanceWorkOrder",target_id:workId,
    actor_user_id:grantId,payload_fingerprint:fp(body),status,created_date:"2026-10-09T00:00:00.000Z",
    result_summary:{grant_id:grantId,action:"save",request_id:"request-original-123456",
      expected_updated_date:"version-1",photo_count:count,uploaded_photo_urls:photos,
      mutation_plan:{actual_hours:2.5,corrective_action:"Synthetic repair",appended_note:"[Mechanic – Synthetic]\\nSynthetic note"}},
  };
}
function setup({receipt=null,barrier=false,uploadBarrier=false,holdUpdates=false}={}){
  const store={work:baseWork(),receipts:new Map(),uploads:[],updates:0,updateAttempts:0,revision:1,barrier,uploadBarrier,holdUpdates,failUploads:0,
    waiting:[], uploadWaiting:[], pendingUpdates:[], pendingGrantChecks:[],pendingCancelWrites:[],pauseGrantCheck:false,pauseCancelWrite:false,
    pauseWorkRead:false,pendingWorkReads:[],pauseAppliedWrite:false,pendingAppliedWrites:[],
    pauseFailureWrite:false,pendingFailureWrites:[],loseFailureAckOnce:false,loseCancelAckOnce:false,
    sourceReadNumber:0,pauseSourceReadAt:0,pendingSourceReads:[],
    pauseReleaseWrite:false,pendingReleaseWrites:[],pausePhotoEvidenceWrite:false,pendingPhotoEvidenceWrites:[],
    pauseFinalReceiptReadAt:0,receiptReadNumbers:new Map(),pendingFinalReceiptReads:[],
    grantRevision:1,pauseGrantMutationWrite:false,pendingGrantMutationWrites:[],release:null};
  if(receipt)store.receipts.set(receipt.id,clone(receipt));
  const grant={id:grantId,enabled:true,token_hash:sha(token),name:"Synthetic",updated_date:"grant-version-1",
    allowed_actions:["bootstrap","start","save"],scope_mode:"all_active",expires_at:"2099-01-01T00:00:00.000Z"};
  let receiptSequence=0;
  const matches=(row,filter)=>Object.entries(filter||{}).every(([key,value])=>{
    const current=key.split('.').reduce((item,part)=>item?.[part],row);
    if(value&&typeof value==="object"&&"$in" in value) return value.$in.includes(current);
    return Array.isArray(value) ? JSON.stringify(current)===JSON.stringify(value) : current===value;
  });
  const receipts={
    async get(id){
      if(id.startsWith('new-receipt-')){
        const count=(store.receiptReadNumbers.get(id)||0)+1;
        store.receiptReadNumbers.set(id,count);
        if(count===store.pauseFinalReceiptReadAt){
          await new Promise(resolve=>store.pendingFinalReceiptReads.push(resolve));
        }
      }
      const record=clone(store.receipts.get(id)||null);
      if(id==='old-receipt' && ++store.sourceReadNumber===store.pauseSourceReadAt){
        await new Promise(resolve=>store.pendingSourceReads.push(resolve));
      }
      return record;
    },
    async filter(filter){return [...store.receipts.values()].filter(row=>matches(row,filter)).map(clone);},
    async create(row){
      const record={...clone(row),id:"new-receipt-"+(++receiptSequence),created_date:new Date().toISOString()};
      store.receipts.set(record.id,record);return clone(record);
    },
    async update(id,patch){
      const prior=store.receipts.get(id);assert.ok(prior,"receipt must exist");
      const next={...prior,...clone(patch)};store.receipts.set(id,next);return clone(next);
    },
    async updateMany(filter,operators){
      if(operators?.$set?.status==='applied' && store.pauseAppliedWrite){
        store.pauseAppliedWrite=false;
        await new Promise(resolve=>store.pendingAppliedWrites.push(resolve));
      }
      if(operators?.$set?.status==='failed' && store.pauseFailureWrite){
        store.pauseFailureWrite=false;
        await new Promise(resolve=>store.pendingFailureWrites.push(resolve));
      }
      if(operators?.$set?.status==='cancelled' && store.pauseCancelWrite){
        store.pauseCancelWrite=false;
        await new Promise(resolve=>store.pendingCancelWrites.push(resolve));
      }
      if(operators?.$set?.['result_summary.retry_reservation_released_at'] && store.pauseReleaseWrite){
        store.pauseReleaseWrite=false;
        await new Promise(resolve=>store.pendingReleaseWrites.push(resolve));
      }
      if(operators?.$set?.['result_summary.uploaded_photo_urls'] && store.pausePhotoEvidenceWrite){
        store.pausePhotoEvidenceWrite=false;
        await new Promise(resolve=>store.pendingPhotoEvidenceWrites.push(resolve));
      }
      const found=[...store.receipts.values()].filter(row=>matches(row,filter));
      for(const row of found){
        const next=clone(row);
        for(const [key,value] of Object.entries(operators.$set||{})){
          const parts=key.split('.');
          let target=next;
          for(const part of parts.slice(0,-1))target=target[part]??=( {} );
          target[parts.at(-1)]=clone(value);
        }
        store.receipts.set(row.id,next);
      }
      if(operators?.$set?.status==='failed' && store.loseFailureAckOnce){
        store.loseFailureAckOnce=false;
        throw new Error('Synthetic failure CAS response lost after commit');
      }
      if(operators?.$set?.status==='cancelled' && store.loseCancelAckOnce){
        store.loseCancelAckOnce=false;
        throw new Error('Synthetic admin cancellation CAS response lost after commit');
      }
      return {updated:found.length};
    },
    async delete(id){store.receipts.delete(id);}
  };
  const access={
    async list(){return [clone(grant)];},
    async filter(filter){return matches(grant,filter)?[clone(grant)]:[];},
    async get(id){
      const snapshot=id===grantId?clone(grant):null;
      if(store.pauseGrantCheck){
        store.pauseGrantCheck=false;
        await new Promise(resolve=>store.pendingGrantChecks.push(resolve));
      }
      return snapshot;
    },
    async update(_id,patch){Object.assign(grant,clone(patch),{updated_date:"grant-version-"+(++store.grantRevision)});return clone(grant);},
    async updateMany(filter,operators){
      if(store.pauseGrantMutationWrite){
        store.pauseGrantMutationWrite=false;
        await new Promise(resolve=>store.pendingGrantMutationWrites.push(resolve));
      }
      if(!matches(grant,filter))return {updated:0};
      Object.assign(grant,clone(operators.$set||{}),{updated_date:"grant-version-"+(++store.grantRevision)});
      return {updated:1};
    }
  };
  const WorkOrder={
    async get(id){
      const record=id===workId?clone(store.work):null;
      if(store.pauseWorkRead){
        store.pauseWorkRead=false;
        await new Promise(resolve=>store.pendingWorkReads.push(resolve));
      }
      return record;
    },
  };
  const invoke=async (name,mutation)=>{
    assert.equal(name,"fleetWorkOrderAction");
    store.updateAttempts++;
    if(store.holdUpdates)await new Promise(resolve=>store.pendingUpdates.push(resolve));
    if(store.barrier){
      await new Promise(resolve=>{
        store.waiting.push(resolve);
        if(store.waiting.length===2){
          for(const release of store.waiting.splice(0))release();
        } else {
          setTimeout(()=>{
            for(const release of store.waiting.splice(0))release();
          },500);
        }
      });
    }
    if(mutation.expected_updated_date!==store.work.updated_date) {
      return {data:{error:"This Fleet work order changed since it was opened. Refresh before saving."}};
    }
    store.work={...store.work,...clone(mutation.work_order),updated_date:"version-"+(++store.revision)};
    store.updates++;
    return {data:{work_order:clone(store.work)}};
  };
  const client={asServiceRole:{
    entities:{FleetMechanicAccess:access,FleetSystemLog:{async create(){}},
      FleetEquipment:{async list(){return [{id:"eq-race",name:"Synthetic Fleet Equipment"}];}},
      FleetMaintenanceWorkOrder:WorkOrder,FleetOperationReceipt:receipts},
    functions:{invoke},
    integrations:{Core:{UploadFile:async()=> {
      if(store.failUploads>0){store.failUploads--;const error=new Error("Synthetic upload disconnected");error.stack="Synthetic upload disconnected";throw error;}
      if(store.uploadBarrier)await new Promise(resolve=>{
        store.uploadWaiting.push(resolve);
        if(store.uploadWaiting.length===2) {
          for(const release of store.uploadWaiting.splice(0))release();
        } else setTimeout(()=>{for(const release of store.uploadWaiting.splice(0))release();},350);
      });
      const url=`https://files.example/new-${store.uploads.length+1}.jpg`;
      store.uploads.push(url);
      return {file_url:url};
    }}},
  }};
  globalThis.__fleetReceiptRaceClient=client;
  return {store,receipts,access,grant,client};
}
async function until(label,predicate){
  const deadline=Date.now()+3000;
  while(!predicate()){
    assert.ok(Date.now()<deadline,`Timed out waiting for synthetic ${label}`);
    await new Promise(resolve=>setTimeout(resolve,5));
  }
}
async function call(body,client){
  globalThis.__fleetReceiptRaceClient=client;
  const response=await handler(new Request("http://synthetic.local",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
  }));
  return {code:response.status,body:await response.json()};
}
function strandReservedPhotoRetry(store,{status="started",urls=["https://files.example/old-a.jpg"],owner="request-owner-lost-987654"}={}) {
  const body=payload(owner,{photos:[photoPayload,photoPayload]});
  const source=makeReceipt(body,{status:"started",photos:["https://files.example/old-a.jpg"],count:2});
  source.result_summary.retry_reserved_by_request_id=owner;
  const retry=makeReceipt(body,{status,photos:urls,count:2});
  retry.id="owner-retry-receipt";
  retry.operation_key=`mechanic:${grantId}:${workId}:save:${owner}`;
  retry.result_summary.request_id=owner;
  retry.result_summary.reused_upload_receipt_id=source.id;
  retry.result_summary.retry_reservation_required=true;
  if(status==="applied"){
    // Synthetic prior work-order commit whose current marker may be superseded.
    retry.applied_at="2026-10-12T12:00:00.000Z";
    retry.result_summary.work_order_updated_date="version-2";
    retry.result_summary.work_order_status="in_progress";
    retry.result_summary.recovered_from_work_order_marker=true;
  }
  store.receipts.set(source.id,clone(source));
  store.receipts.set(retry.id,clone(retry));
  return {source,retry,body};
}

test("admin scope and estimate permission edits preserve existing mechanic link identity",async()=>{
  const {client,grant}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const scope=await call({action:"admin_update_scope",id:grantId,scope_mode:"selected_equipment",
    allowed_equipment_ids:["eq-race"]},client);
  assert.equal(scope.code,200);
  assert.equal(grant.scope_mode,"selected_equipment");
  assert.deepEqual(grant.allowed_equipment_ids,["eq-race"]);
  const estimate=await call({action:"admin_update_estimate_permission",id:grantId,allow_estimates:true},client);
  assert.equal(estimate.code,200);
  assert.ok(grant.allowed_actions.includes("estimate_save"));
  assert.ok(grant.allowed_actions.includes("estimate_submit"));
  assert.equal(grant.token_hash,sha(token),"Existing bearer-link token must remain unchanged");
  assert.equal(grant.enabled,true);
  assert.equal(grant.updated_date,"grant-version-3");
});
test("revocation wins against a delayed scope change without restoring access",async()=>{
  const {store,client,grant}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseGrantMutationWrite=true;
  const pending=call({action:"admin_update_scope",id:grantId,scope_mode:"selected_equipment",
    allowed_equipment_ids:["eq-race"]},client);
  await until("scope edit conditional write",()=>store.pendingGrantMutationWrites.length===1);
  const revoked=await call({action:"admin_revoke_link",id:grantId},client);
  assert.equal(revoked.code,200);
  assert.equal(grant.enabled,false);
  store.pendingGrantMutationWrites.shift()();
  const result=await pending;
  assert.equal(result.code,409);
  assert.match(result.body.error,/changed while its permissions were being edited/i);
  assert.equal(grant.scope_mode,"all_active");
  assert.equal(grant.enabled,false);
  assert.equal(grant.token_hash,sha(token));
});
test("concurrent admin edits cannot replace an already-saved scope with stale permissions",async()=>{
  const {store,client,grant}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseGrantMutationWrite=true;
  const delayed=call({action:"admin_update_estimate_permission",id:grantId,allow_estimates:true},client);
  await until("stale estimate permission edit",()=>store.pendingGrantMutationWrites.length===1);
  const changed=await call({action:"admin_update_scope",id:grantId,scope_mode:"selected_equipment",
    allowed_equipment_ids:["eq-race"]},client);
  assert.equal(changed.code,200);
  store.pendingGrantMutationWrites.shift()();
  const result=await delayed;
  assert.equal(result.code,409);
  assert.equal(grant.scope_mode,"selected_equipment");
  assert.deepEqual(grant.allowed_equipment_ids,["eq-race"]);
  assert.ok(!grant.allowed_actions.includes("estimate_save"),"The stale admin edit did not apply");
  assert.equal(grant.token_hash,sha(token));
});
test("revoked or unversioned mechanic grants fail closed on permission editing",async()=>{
  for(const variant of ["revoked","unversioned"]){
    const {client,grant}=setup();
    client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
    if(variant==="revoked")grant.enabled=false;
    else delete grant.updated_date;
    for(const action of [
      {action:"admin_update_estimate_permission",id:grantId,allow_estimates:true},
      {action:"admin_update_scope",id:grantId,scope_mode:"all_active"},
    ]){
      const result=await call(action,client);
      assert.equal(result.code,409,variant);
      assert.match(result.body.error,/revoked or its version is unavailable/i);
    }
    assert.equal(grant.token_hash,sha(token));
  }
});

test("revocation after durable photo upload but before final receipt verification blocks Save",async()=>{
  const {store,client}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseFinalReceiptReadAt=2;
  const saving=call(payload("request-photo-revoked-final-123456",{photos:[photoPayload]}),client);
  await until("final photo receipt verification",()=>store.pendingFinalReceiptReads.length===1);
  const receipt=[...store.receipts.values()][0];
  assert.equal(receipt.status,"started");
  assert.equal(receipt.result_summary.uploaded_photo_urls.length,1);
  const revoke=await call({action:"admin_revoke_link",id:grantId},client);
  assert.equal(revoke.code,200);
  assert.equal(revoke.body.reconciled_cancelled,1);
  store.pendingFinalReceiptReads.shift()();
  const result=await saving;
  assert.equal(result.code,409);
  assert.match(result.body.error,/receipt or photo evidence changed/i);
  assert.equal(store.receipts.get(receipt.id).status,"cancelled");
  assert.deepEqual(store.receipts.get(receipt.id).result_summary.uploaded_photo_urls,store.uploads);
  assert.equal(store.updates,0);
  assert.equal(store.updateAttempts,0);
});
test("scope narrowing during final evidence verification prevents the work-order update",async()=>{
  const {store,client,grant}=setup();
  store.pauseFinalReceiptReadAt=2;
  const saving=call(payload("request-final-scope-change-123456",{photos:[photoPayload]}),client);
  await until("final receipt read before grant recheck",()=>store.pendingFinalReceiptReads.length===1);
  grant.scope_mode="selected_equipment";
  grant.allowed_equipment_ids=["eq-other"];
  store.pendingFinalReceiptReads.shift()();
  const result=await saving;
  assert.equal(result.code,403);
  assert.match(result.body.error,/no longer includes this Fleet equipment/i);
  const receipt=[...store.receipts.values()][0];
  assert.equal(receipt.status,"started");
  assert.deepEqual(receipt.result_summary.uploaded_photo_urls,store.uploads);
  assert.equal(store.updateAttempts,0);
  assert.equal(store.updates,0);
});
test("final evidence verification rejects a changed photo URL after upload",async()=>{
  const {store,client,receipts}=setup();
  store.pauseFinalReceiptReadAt=2;
  const saving=call(payload("request-final-photo-change-123456",{photos:[photoPayload]}),client);
  await until("final receipt evidence read",()=>store.pendingFinalReceiptReads.length===1);
  const receipt=[...store.receipts.values()][0];
  await receipts.update(receipt.id,{result_summary:{...receipt.result_summary,
    uploaded_photo_urls:["https://files.example/other-evidence.jpg"],
    admin_review_note:"Different evidence was recorded",
  }});
  store.pendingFinalReceiptReads.shift()();
  const result=await saving;
  assert.equal(result.code,409);
  assert.match(result.body.error,/receipt or photo evidence changed/i);
  const final=store.receipts.get(receipt.id);
  assert.equal(final.status,"failed");
  assert.deepEqual(final.result_summary.uploaded_photo_urls,["https://files.example/other-evidence.jpg"]);
  assert.equal(final.result_summary.admin_review_note,"Different evidence was recorded");
  assert.equal(store.updateAttempts,0);
  assert.equal(store.updates,0);
});
test("final evidence check rejects a photo retry whose source reservation changed",async()=>{
  const attempted=payload("request-final-retry-owner-123456",{photos:[photoPayload,photoPayload]});
  const previous=makeReceipt(attempted,{status:"failed",count:2,photos:["https://files.example/old-a.jpg"]});
  const {store,client,receipts}=setup({receipt:previous});
  store.pauseFinalReceiptReadAt=2;
  const saving=call(attempted,client);
  await until("final reused-photo evidence read",()=>store.pendingFinalReceiptReads.length===1);
  const source=store.receipts.get(previous.id);
  const retry=[...store.receipts.values()].find(row=>row.id!==previous.id);
  assert.equal(source.status,"started");
  assert.deepEqual(retry.result_summary.uploaded_photo_urls,["https://files.example/old-a.jpg","https://files.example/new-1.jpg"]);
  await receipts.update(previous.id,{result_summary:{
    ...source.result_summary,retry_reserved_by_request_id:"request-other-owner-987654",
  }});
  store.pendingFinalReceiptReads.shift()();
  const result=await saving;
  assert.equal(result.code,409);
  assert.match(result.body.error,/reused-photo reservation changed/i);
  assert.equal(store.receipts.get(retry.id).status,"failed");
  assert.equal(store.receipts.get(previous.id).status,"started");
  assert.equal(store.receipts.get(previous.id).result_summary.retry_reserved_by_request_id,"request-other-owner-987654");
  assert.equal(store.uploads.length,1);
  assert.equal(store.updateAttempts,0);
  assert.equal(store.updates,0);
});

test("incremental upload retains newer admin provenance instead of replacing the receipt summary",async()=>{
  const {store,client,receipts}=setup();
  store.pausePhotoEvidenceWrite=true;
  const saving=call(payload("request-upload-preserve-123456",{photos:[photoPayload]}),client);
  await until("uploaded image evidence write",()=>store.pendingPhotoEvidenceWrites.length===1);
  const receipt=[...store.receipts.values()][0];
  assert.equal(receipt.status,"started");
  await receipts.update(receipt.id,{result_summary:{
    ...receipt.result_summary,admin_review_note:"Verified original mechanic scope",
    admin_reviewed_at:"2026-10-10T14:00:00.000Z",
  }});
  store.pendingPhotoEvidenceWrites.shift()();
  const response=await saving;
  assert.equal(response.code,200);
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,1);
  const completed=store.receipts.get(receipt.id);
  assert.equal(completed.status,"applied");
  assert.equal(completed.result_summary.admin_review_note,"Verified original mechanic scope");
  assert.equal(completed.result_summary.admin_reviewed_at,"2026-10-10T14:00:00.000Z");
  assert.deepEqual(completed.result_summary.uploaded_photo_urls,store.uploads);
  assert.deepEqual(store.work.after_photos,store.uploads);
});
test("delayed upload cannot replace a different durable photo URL prefix",async()=>{
  const {store,client,receipts}=setup();
  store.pausePhotoEvidenceWrite=true;
  const saving=call(payload("request-photo-cas-conflict-123456",{photos:[photoPayload]}),client);
  await until("photo prefix CAS",()=>store.pendingPhotoEvidenceWrites.length===1);
  const receipt=[...store.receipts.values()][0];
  await receipts.update(receipt.id,{result_summary:{
    ...receipt.result_summary,
    uploaded_photo_urls:["https://files.example/other-concurrent.jpg"],
    admin_review_note:"Other evidence is already on file",
  }});
  store.pendingPhotoEvidenceWrites.shift()();
  const response=await saving;
  assert.equal(response.code,409);
  assert.match(response.body.error,/photo evidence changed during upload/i);
  const latest=store.receipts.get(receipt.id);
  assert.equal(latest.status,"failed");
  assert.deepEqual(latest.result_summary.uploaded_photo_urls,["https://files.example/other-concurrent.jpg"]);
  assert.equal(latest.result_summary.admin_review_note,"Other evidence is already on file");
  assert.equal(store.uploads.length,1);
  assert.equal(store.updates,0);
});
test("upload evidence survives a terminal admin receipt state without replaying work",async()=>{
  for(const terminal of ["cancelled","failed"]){
    const {store,client,receipts}=setup();
    store.pausePhotoEvidenceWrite=true;
    const saving=call(payload("request-photo-terminal-123456",{photos:[photoPayload,photoPayload]}),client);
    await until("terminal transition before first photo evidence",()=>store.pendingPhotoEvidenceWrites.length===1);
    const receipt=[...store.receipts.values()][0];
    await receipts.update(receipt.id,{status:terminal,result_summary:{
      ...receipt.result_summary,admin_review_note:`Reviewed as ${terminal}`,
      admin_reconciled_by:"admin@example.test",
    }});
    store.pendingPhotoEvidenceWrites.shift()();
    const response=await saving;
    assert.equal(response.code,409,terminal);
    assert.match(response.body.error,/request was resolved while its photo was uploading/i);
    const latest=store.receipts.get(receipt.id);
    assert.equal(latest.status,terminal);
    assert.equal(latest.result_summary.admin_review_note,`Reviewed as ${terminal}`);
    assert.equal(latest.result_summary.admin_reconciled_by,"admin@example.test");
    assert.deepEqual(latest.result_summary.uploaded_photo_urls,["https://files.example/new-1.jpg"]);
    assert.equal(store.uploads.length,1,"No second upload after terminal decision");
    assert.equal(store.updates,0);
  }
});
test("upload evidence is not written to a receipt whose immutable operation identity changed",async()=>{
  const {store,client,receipts}=setup();
  store.pausePhotoEvidenceWrite=true;
  const saving=call(payload("request-photo-identity-race-123456",{photos:[photoPayload]}),client);
  await until("operation identity guard",()=>store.pendingPhotoEvidenceWrites.length===1);
  const receipt=[...store.receipts.values()][0];
  await receipts.update(receipt.id,{payload_fingerprint:"different-operation-fingerprint",
    result_summary:{...receipt.result_summary,admin_review_note:"Operation identity conflict"}});
  store.pendingPhotoEvidenceWrites.shift()();
  const response=await saving;
  assert.equal(response.code,409);
  assert.match(response.body.error,/photo evidence changed during upload/i);
  const latest=store.receipts.get(receipt.id);
  assert.equal(latest.status,"started","A newer operation identity must not inherit the old failure decision");
  assert.equal(latest.payload_fingerprint,"different-operation-fingerprint");
  assert.equal(latest.result_summary.admin_review_note,"Operation identity conflict");
  assert.deepEqual(latest.result_summary.uploaded_photo_urls,[]);
  assert.equal(store.updates,0);
});

test("admin marker recovery preserves photo evidence and cancellation provenance added after its receipt read",async()=>{
  const original=makeReceipt(payload("request-original-123456",{photos:[photoPayload]}),{count:1});
  const {store,client,receipts}=setup({receipt:original});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.work.mechanic_operation_key=original.operation_key;
  store.work.mechanic_operation_fingerprint=original.payload_fingerprint;
  store.pauseWorkRead=true;
  const reconciliation=call({action:"admin_reconcile_mechanic_mutation",receipt_id:original.id},client);
  await until("admin work-order marker read",()=>store.pendingWorkReads.length===1);
  const live=store.receipts.get(original.id);
  await receipts.update(original.id,{status:"cancelled",result_summary:{
    ...live.result_summary,uploaded_photo_urls:["https://files.example/durable-just-uploaded.jpg"],
    upload_evidence_updated_at:"2026-10-10T12:00:00.000Z",
    admin_reconciled_not_applied:true,admin_reconciled_by:"other-admin@example.test",
  }});
  store.pendingWorkReads.shift()();
  const result=await reconciliation;
  assert.equal(result.code,200);
  assert.equal(result.body.status,"applied");
  const final=store.receipts.get(original.id);
  assert.equal(final.status,"applied");
  assert.deepEqual(final.result_summary.uploaded_photo_urls,["https://files.example/durable-just-uploaded.jpg"]);
  assert.equal(final.result_summary.admin_reconciled_by,"other-admin@example.test");
  assert.equal(final.result_summary.admin_reconciled_not_applied,true);
  assert.equal(final.result_summary.recovered_from_work_order_marker,true);
  assert.equal(store.updates,0);
});
test("work-order marker reconciliation rejects receipt identity switched before applied CAS",async()=>{
  const mutations=[
    row=>{row.actor_user_id="different-mechanic";},
    row=>{row.target_id="different-fleet-work";},
    row=>{row.payload_fingerprint="different-fingerprint";},
    row=>{row.result_summary.grant_id="different-mechanic";},
    row=>{row.result_summary.request_id="different-request-123456";},
    row=>{row.result_summary.expected_updated_date="different-version";},
  ];
  for(const mutate of mutations){
    const original=makeReceipt(payload("request-original-123456"));
    const {store,client,receipts}=setup({receipt:original});
    client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
    store.work.mechanic_operation_key=original.operation_key;
    store.work.mechanic_operation_fingerprint=original.payload_fingerprint;
    store.pauseAppliedWrite=true;
    const reconciling=call({action:"admin_reconcile_mechanic_mutation",receipt_id:original.id},client);
    await until("applied receipt identity check",()=>store.pendingAppliedWrites.length===1);
    const changed=clone(store.receipts.get(original.id));
    mutate(changed);
    changed.result_summary.forensic_review_note="Identity conflict preserved";
    await receipts.update(original.id,changed);
    store.pendingAppliedWrites.shift()();
    const result=await reconciling;
    assert.equal(result.code,409,"Mismatched source must not be marked applied");
    assert.match(result.body.error,/identity or status changed/i);
    const saved=store.receipts.get(original.id);
    assert.equal(saved.status,"started");
    assert.equal(saved.result_summary.forensic_review_note,"Identity conflict preserved");
    assert.equal(saved.result_summary.work_order_updated_date,undefined);
    assert.equal(store.updates,0);
  }
});

test("applied receipt marker CAS preserves concurrently added audit evidence",async()=>{
  const original=makeReceipt(payload("request-original-123456"));
  const {store,client,receipts}=setup({receipt:original});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.work.mechanic_operation_key=original.operation_key;
  store.work.mechanic_operation_fingerprint=original.payload_fingerprint;
  store.pauseAppliedWrite=true;
  const reconciling=call({action:"admin_reconcile_mechanic_mutation",receipt_id:original.id},client);
  await until("applied receipt forensic CAS",()=>store.pendingAppliedWrites.length===1);
  const changed=store.receipts.get(original.id);
  await receipts.update(original.id,{result_summary:{...changed.result_summary,
    admin_review_note:"Preserve newer evidence on committed marker"}});
  store.pendingAppliedWrites.shift()();
  const result=await reconciling;
  assert.equal(result.code,200);
  assert.equal(result.body.status,"applied");
  const saved=store.receipts.get(original.id);
  assert.equal(saved.status,"applied");
  assert.equal(saved.result_summary.admin_review_note,"Preserve newer evidence on committed marker");
  assert.equal(store.updates,0);
});

test("mechanic status and admin reconciliation reject forged applied receipt identity",async()=>{
  for(const status of ["applied","started"]){
    const original=makeReceipt(payload("request-original-123456"),{status});
    original.actor_user_id="another-grant";
    const {store,client}=setup({receipt:original});
    client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
    store.work.mechanic_operation_key=original.operation_key;
    store.work.mechanic_operation_fingerprint=original.payload_fingerprint;
    const statusResult=await call({action:"mutation_status",token,work_order_id:workId,
      mutation_action:"save",request_id:"request-original-123456"},client);
    assert.equal(statusResult.code,409);
    assert.match(statusResult.body.error,/identity is inconsistent/i);
    const admin=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:original.id},client);
    assert.equal(admin.code,409);
    assert.match(admin.body.error,/conflicting operation identity/i);
    assert.equal(store.receipts.get(original.id).status,status);
    assert.equal(store.updates,0);
  }
});

test("reused photo receipt resolution preserves newer forensic evidence despite stale source read",async()=>{
  const {store,client,receipts}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{status:"applied",urls:[
    "https://files.example/old-a.jpg","https://files.example/complete-b.jpg",
  ]});
  store.pauseSourceReadAt=2;
  const reconciliation=call({action:"admin_reconcile_mechanic_mutation",receipt_id:source.id},client);
  await until("source read before retry resolution",()=>store.pendingSourceReads.length===1);
  const live=store.receipts.get(source.id);
  await receipts.update(source.id,{result_summary:{...live.result_summary,
    forensic_review_note:"The late photo is being verified",
    upload_evidence_updated_at:"2026-10-10T12:01:00.000Z",
  }});
  store.pendingSourceReads.shift()();
  const result=await reconciliation;
  assert.equal(result.code,200);
  assert.equal(result.body.status,"applied");
  const final=store.receipts.get(source.id);
  assert.equal(final.status,"applied");
  assert.equal(final.result_summary.forensic_review_note,"The late photo is being verified");
  assert.equal(final.result_summary.upload_evidence_updated_at,"2026-10-10T12:01:00.000Z");
  assert.deepEqual(final.result_summary.uploaded_photo_urls,["https://files.example/old-a.jpg"]);
  assert.equal(final.result_summary.resolved_by_operation_key,retry.operation_key);
  assert.equal(final.result_summary.resolved_by_retry,true);
  assert.equal(store.updates,0);
});
test("reservation release cannot clear a different retry owner after a racing reassignment",async()=>{
  const {store,client,receipts}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{status:"failed"});
  store.pauseReleaseWrite=true;
  const reconciliation=call({action:"admin_reconcile_mechanic_mutation",receipt_id:retry.id},client);
  await until("old photo reservation release",()=>store.pendingReleaseWrites.length===1);
  const live=store.receipts.get(source.id);
  await receipts.update(source.id,{result_summary:{...live.result_summary,
    retry_reserved_by_request_id:"request-other-owner-456789",forensic_review_note:"Reservation reassigned",
  }});
  store.pendingReleaseWrites.shift()();
  const result=await reconciliation;
  assert.equal(result.code,200);
  assert.equal(result.body.status,"blocked");
  const final=store.receipts.get(source.id);
  assert.equal(final.status,"started");
  assert.equal(final.result_summary.retry_reserved_by_request_id,"request-other-owner-456789");
  assert.equal(final.result_summary.forensic_review_note,"Reservation reassigned");
  assert.equal(final.result_summary.retry_reservation_released_at,undefined);
  assert.equal(store.updates,0);
});
test("photo reservation release fails closed if source work-order identity changes during CAS",async()=>{
  const {store,client,receipts}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{status:"failed"});
  store.pauseReleaseWrite=true;
  const reconciling=call({action:"admin_reconcile_mechanic_mutation",receipt_id:retry.id},client);
  await until("photo source identity CAS",()=>store.pendingReleaseWrites.length===1);
  const live=store.receipts.get(source.id);
  await receipts.update(source.id,{target_id:"unrelated-fleet-work",result_summary:{
    ...live.result_summary,forensic_review_note:"Source identity changed during release",
  }});
  store.pendingReleaseWrites.shift()();
  const result=await reconciling;
  assert.equal(result.body.status,"blocked");
  const final=store.receipts.get(source.id);
  assert.equal(final.status,"started");
  assert.equal(final.target_id,"unrelated-fleet-work");
  assert.equal(final.result_summary.retry_reserved_by_request_id,retry.result_summary.request_id);
  assert.equal(final.result_summary.retry_reservation_released_at,undefined);
  assert.equal(store.updates,0);
});

test("proven retry marker does not resolve a different work-order photo source",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store);
  store.work.mechanic_operation_key=retry.operation_key;
  store.work.mechanic_operation_fingerprint=retry.payload_fingerprint;
  store.receipts.get(source.id).target_id="unrelated-fleet-work";
  const result=await call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:retry.result_summary.request_id},client);
  assert.equal(result.body.status,"applied");
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.receipts.get(source.id).status,"started",
    "A proven retry cannot mark a source for another work order applied");
  assert.equal(store.updates,0);
});

test("admin refuses mismatched photo source actor and preserves the paired receipts",async()=>{
  const {store,client}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/second.jpg",
  ]});
  store.receipts.get(source.id).actor_user_id="different-grant";
  const response=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:retry.id},client);
  assert.equal(response.body.status,"blocked");
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"started");
  assert.equal(store.updates,0);
});

test("successful reservation release preserves forensic metadata added while it was pending",async()=>{
  const {store,client,receipts}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{status:"failed"});
  store.pauseReleaseWrite=true;
  const reconciliation=call({action:"admin_reconcile_mechanic_mutation",receipt_id:retry.id},client);
  await until("reservation metadata release",()=>store.pendingReleaseWrites.length===1);
  const live=store.receipts.get(source.id);
  await receipts.update(source.id,{result_summary:{...live.result_summary,forensic_review_note:"Photo retained for audit"}});
  store.pendingReleaseWrites.shift()();
  await reconciliation;
  const final=store.receipts.get(source.id);
  assert.equal(final.status,"failed");
  assert.equal(final.result_summary.retry_reserved_by_request_id,"");
  assert.equal(final.result_summary.forensic_review_note,"Photo retained for audit");
  assert.deepEqual(final.result_summary.uploaded_photo_urls,["https://files.example/old-a.jpg"]);
  assert.ok(final.result_summary.retry_reservation_released_at);
  assert.equal(store.updates,0);
});

test("late applied mechanic receipt cannot be downgraded by stale admin revocation cancellation",async()=>{
  const previous=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:previous,holdUpdates:true});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const mechanic=call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:"request-original-123456"},client);
  await until("mechanic recovery dispatched",()=>store.pendingUpdates.length===1);
  store.pauseCancelWrite=true;
  const revoke=call({action:"admin_revoke_link",id:grantId},client);
  await until("admin cancellation CAS paused",()=>store.pendingCancelWrites.length===1);
  assert.equal(store.receipts.get(previous.id).status,"started");
  store.pendingUpdates.shift()();
  await until("mechanic receipt applied after commit",()=>store.receipts.get(previous.id).status==="applied");
  store.pendingCancelWrites.shift()();
  const result=await revoke;
  const late=await mechanic;
  assert.equal(result.code,200);
  assert.equal(result.body.reconciled_applied,1,"Admin must report the newer durable outcome");
  assert.equal(result.body.reconciled_cancelled,0);
  assert.equal(late.code,403);
  assert.equal(store.receipts.get(previous.id).status,"applied","Stale admin cancellation must not replace durable applied evidence");
  assert.equal(store.receipts.get(previous.id).result_summary.admin_reconciled_not_applied,undefined);
  assert.equal(store.updates,1);
});
test("admin cancellation retains photo URLs recorded after its initial receipt snapshot",async()=>{
  const interrupted=makeReceipt(payload("request-original-123456",{photos:[photoPayload]}),{
    status:"started",count:1,photos:[],
  });
  const {store,client,receipts}=setup({receipt:interrupted});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseGrantCheck=true;
  const admin=call({action:"admin_revoke_link",id:grantId},client);
  await until("stale admin grant verification",()=>store.pendingGrantChecks.length===1);
  const fresh=store.receipts.get(interrupted.id);
  await receipts.update(interrupted.id,{
    result_summary:{...fresh.result_summary,uploaded_photo_urls:["https://files.example/photo-uploaded-during-revocation.jpg"]},
  });
  store.pendingGrantChecks.shift()();
  const result=await admin;
  assert.equal(result.body.reconciled_cancelled,1);
  const saved=store.receipts.get(interrupted.id);
  assert.equal(saved.status,"cancelled");
  assert.deepEqual(saved.result_summary.uploaded_photo_urls,["https://files.example/photo-uploaded-during-revocation.jpg"]);
  assert.equal(saved.result_summary.admin_reconciled_not_applied,true);
  assert.equal(store.updates,0);
});

test("revocation during a dispatched mechanic photo retry preserves the receipt pair until late commit",async()=>{
  const original=payload("request-original-123456",{photos:[photoPayload,photoPayload]});
  const previous=makeReceipt(original,{status:"failed",photos:["https://files.example/old-a.jpg"],count:2});
  const {store,client,grant}=setup({receipt:previous,holdUpdates:true});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const mechanic=call(payload("request-late-mechanic-234567",{photos:[photoPayload,photoPayload]}),client);
  await until("mechanic work-order update dispatch",()=>store.pendingUpdates.length===1);
  const pending=[...store.receipts.values()].find(row=>row.id!==previous.id);
  assert.ok(pending);
  assert.equal(store.receipts.get(previous.id).status,"started");
  assert.equal(pending.status,"started");
  assert.equal(pending.result_summary.uploaded_photo_urls.length,2);
  const revocation=await call({action:"admin_revoke_link",id:grantId},client);
  assert.equal(revocation.code,200);
  assert.equal(revocation.body.reconciled_blocked,2);
  assert.equal(store.receipts.get(previous.id).status,"started");
  assert.equal(store.receipts.get(pending.id).status,"started");
  assert.equal(grant.enabled,false);
  assert.equal(store.updates,0);
  store.pendingUpdates.shift()();
  const late=await mechanic;
  assert.equal(late.code,403,"Revoked bearer link cannot return the committed work-order details");
  assert.equal(store.updates,1,"In-flight, previously authorized work commits at most once");
  assert.equal(store.receipts.get(previous.id).status,"applied");
  assert.equal(store.receipts.get(pending.id).status,"applied");
  assert.equal(store.uploads.length,1,"Only the missing image was uploaded");
  assert.equal((store.work.notes.match(/Synthetic note/g)||[]).length,1);
});
test("two admin photo reconciliations racing revocation cannot commit twice",async()=>{
  const {store,client,grant}=setup({holdUpdates:true});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/second.jpg",
  ]});
  const first=call({action:"admin_reconcile_mechanic_mutation",receipt_id:source.id},client);
  const second=call({action:"admin_reconcile_mechanic_mutation",receipt_id:retry.id},client);
  await until("both admin recovery dispatches",()=>store.pendingUpdates.length===2);
  const revoked=await call({action:"admin_revoke_link",id:grantId},client);
  assert.equal(revoked.code,200);
  assert.equal(grant.enabled,false);
  assert.equal(revoked.body.reconciled_blocked,2);
  assert.equal(store.updates,0);
  for(const release of store.pendingUpdates.splice(0))release();
  const results=await Promise.all([first,second]);
  assert.deepEqual(results.map(row=>row.body.status),["applied","applied"]);
  assert.equal(store.updates,1);
  assert.equal(store.receipts.get(source.id).status,"applied");
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.uploads.length,0);
});
test("admin cannot dispatch reserved photo reconciliation after revoked scope while mechanic commit is pending",async()=>{
  const {store,client,grant}=setup({holdUpdates:true});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/second.jpg",
  ]});
  const pending=call({action:"admin_reconcile_mechanic_mutation",receipt_id:retry.id},client);
  await until("authorized admin recovery dispatch",()=>store.pendingUpdates.length===1);
  grant.scope_mode="selected_equipment";
  grant.allowed_equipment_ids=["some-other-equipment"];
  const rejected=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:source.id},client);
  assert.equal(rejected.body.status,"blocked");
  assert.match(rejected.body.error_message,/outside_scope/);
  assert.equal(store.updateAttempts,1,"No second update after the scope narrowed");
  store.pendingUpdates.shift()();
  const result=await pending;
  assert.equal(result.body.status,"applied","Already dispatched operation has durable proof");
  assert.equal(store.updates,1);
  assert.equal(store.receipts.get(source.id).status,"applied");
  assert.equal(store.receipts.get(retry.id).status,"applied");
});

test("admin preserves both reserved photo receipts when grant is revoked, expired, or loses equipment scope",async()=>{
  for (const [reason,change] of [
    ["revoked",grant=>{grant.enabled=false;}],
    ["expired",grant=>{grant.expires_at="2020-01-01T00:00:00.000Z";}],
    ["outside_scope",grant=>{grant.scope_mode="selected_equipment";grant.allowed_equipment_ids=["eq-other"];}],
  ]) {
    const {store,client,grant}=setup();
    client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
    const {source,retry}=strandReservedPhotoRetry(store,{urls:[
      "https://files.example/old-a.jpg","https://files.example/new-b.jpg",
    ]});
    change(grant);
    for (const receipt of [source,retry]) {
      const result=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:receipt.id},client);
      assert.equal(result.code,200,reason);
      assert.equal(result.body.status,"blocked",reason);
      assert.match(result.body.error_message,new RegExp(reason.replace("_","."),"i"));
      assert.equal(store.receipts.get(source.id).status,"started",reason);
      assert.equal(store.receipts.get(retry.id).status,"started",reason);
    }
    assert.equal(store.updates,0,reason);
    assert.equal(store.uploads.length,0,reason);
  }
});
test("admin recovers a committed photo retry marker even after grant revocation",async()=>{
  const {store,client,grant}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/new-b.jpg",
  ]});
  store.work.mechanic_operation_key=retry.operation_key;
  store.work.mechanic_operation_fingerprint=retry.payload_fingerprint;
  store.work.after_photos=["https://files.example/old-a.jpg","https://files.example/new-b.jpg"];
  grant.enabled=false;
  const result=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:source.id},client);
  assert.equal(result.code,200);
  assert.equal(result.body.status,"applied");
  assert.equal(store.receipts.get(source.id).status,"applied");
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.updates,0,"Existing work-order evidence is enough; no replay");
});
test("admin applies complete reserved photo evidence once while grant is authorized",async()=>{
  const {store,client}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/new-b.jpg",
  ]});
  const first=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:retry.id},client);
  const second=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:source.id},client);
  assert.equal(first.body.status,"applied");
  assert.equal(second.body.status,"applied");
  assert.equal(store.receipts.get(source.id).status,"applied");
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,0);
});
test("admin blocks mismatched photo retry provenance without modifying either receipt",async()=>{
  const {store,client}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/new-b.jpg",
  ]});
  store.receipts.get(retry.id).payload_fingerprint="substituted-payload";
  for (const receipt of [source,retry]) {
    const response=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:receipt.id},client);
    assert.equal(response.body.status,"blocked");
    assert.match(response.body.error_message,/conflicting or missing evidence/i);
  }
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"started");
  assert.equal(store.updates,0);
});
test("admin releases a confirmed failed retry without cancelling or replaying its reserved source",async()=>{
  const {store,client,grant}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{status:"failed"});
  grant.enabled=false;
  const result=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:retry.id},client);
  assert.equal(result.code,200);
  assert.equal(result.body.status,"blocked");
  assert.equal(store.receipts.get(retry.id).status,"failed");
  assert.equal(store.receipts.get(source.id).status,"failed");
  assert.equal(store.receipts.get(source.id).result_summary.retry_reserved_by_request_id,"");
  assert.deepEqual(store.receipts.get(source.id).result_summary.uploaded_photo_urls,["https://files.example/old-a.jpg"]);
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});
test("admin leaves an incomplete reserved photo retry intact after revocation",async()=>{
  const {store,client,grant}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store);
  grant.enabled=false;
  const result=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:source.id},client);
  assert.equal(result.body.status,"blocked");
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"started");
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});

test("admin link revocation reports blocked reserved source and retry rather than cancelling either",async()=>{
  const {store,client}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store);
  const response=await call({action:"admin_revoke_link",id:grantId},client);
  assert.equal(response.code,200);
  assert.equal(response.body.reconciled_blocked,2);
  assert.equal(response.body.reconciled_cancelled,0);
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"started");
  assert.equal(store.updates,0);
});

test("complete stranded photo retry reconciles from durable URLs without another upload",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/owner-b.jpg",
  ]});
  const incoming=payload("request-new-def-789012",{mechanic_note:"Later new task"});
  const result=await call(incoming,client);
  assert.equal(result.code,409);
  assert.equal(result.body.recovered_previous,true);
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,0);
  assert.deepEqual(store.work.after_photos,["https://files.example/old-a.jpg","https://files.example/owner-b.jpg"]);
  assert.equal((store.work.notes.match(/Synthetic note/g)||[]).length,1);
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.receipts.get(source.id).status,"applied");
  assert.equal(store.receipts.size,2,"No new mutation receipt was created");
});
test("owner receipt status check reconciles complete stranded photos with no replay",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/owner-b.jpg",
  ]});
  const status=await call({action:"mutation_status",token,work_order_id:workId,mutation_action:"save",
    request_id:retry.result_summary.request_id},client);
  assert.equal(status.code,200);
  assert.equal(status.body.status,"applied");
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,0);
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.receipts.get(source.id).status,"applied");
});
test("durably failed reserved retry releases source and requires a fresh deliberate Save",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{status:"failed"});
  const result=await call(payload("request-new-def-789012"),client);
  assert.equal(result.code,409);
  assert.match(result.body.error,/confirmed failed.*reservation released/i);
  assert.equal(store.receipts.get(source.id).status,"failed");
  assert.equal(store.receipts.get(retry.id).status,"failed");
  assert.equal(store.uploads.length,0);
  assert.equal(store.updates,0);
});
test("incomplete stranded retry stays locked with no speculative upload or work update",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store);
  const result=await call(payload("request-new-def-789012"),client);
  assert.equal(result.code,409);
  assert.match(result.body.error,/still being verified/i);
  const status=await call({action:"mutation_status",token,work_order_id:workId,mutation_action:"save",
    request_id:retry.result_summary.request_id},client);
  assert.equal(status.code,200);
  assert.equal(status.body.status,"started");
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"started");
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});
test("unrelated retry provenance cannot unlock a reserved photo receipt",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/owner-b.jpg",
  ]});
  store.receipts.get(retry.id).payload_fingerprint="unrelated-photo-payload";
  const result=await call(payload("request-new-def-789012"),client);
  assert.equal(result.code,409);
  assert.match(result.body.error,/still being verified/i);
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});

test("stranded retry with substituted photo prefix stays blocked",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/substituted.jpg","https://files.example/owner-b.jpg",
  ]});
  const result=await call(payload("request-new-def-789012"),client);
  assert.equal(result.code,409);
  assert.match(result.body.error,/still being verified/i);
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"started");
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});
test("stranded retry cannot overwrite a changed Fleet work-order version",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{urls:[
    "https://files.example/old-a.jpg","https://files.example/owner-b.jpg",
  ]});
  store.work.updated_date="version-7";
  const result=await call(payload("request-new-def-789012",{expected_updated_date:"version-7"}),client);
  assert.equal(result.code,409);
  assert.match(result.body.error,/still being verified/i);
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"started");
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});
test("previously applied owner receipt releases stranded source without updating work again",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{status:"applied",urls:[
    "https://files.example/old-a.jpg","https://files.example/owner-b.jpg",
  ]});
  const result=await call(payload("request-new-def-789012"),client);
  assert.equal(result.code,409);
  assert.equal(result.body.recovered_previous,true);
  assert.equal(store.receipts.get(source.id).status,"applied");
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});

test("fresh new-id Save first recovers fully uploaded started receipt, never applies new work",async()=>{
  const original=payload("request-original-123456",{photos:[photoPayload,photoPayload]});
  const old=makeReceipt(original,{photos:["https://files.example/old-a.jpg","https://files.example/old-b.jpg"],count:2});
  const {store,client}=setup({receipt:old});
  const result=await call(payload("request-new-abc-123456",{mechanic_note:"New note not yet approved"}),client);
  assert.equal(result.code,409);
  assert.equal(result.body.recovered_previous,true);
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,0);
  assert.equal(store.receipts.get(old.id).status,"applied");
  assert.match(store.work.notes,/Synthetic note/);
  assert.doesNotMatch(store.work.notes,/New note not yet approved/);
  assert.deepEqual(store.work.after_photos,["https://files.example/old-a.jpg","https://files.example/old-b.jpg"]);
  assert.equal(store.receipts.size,1,"No new mutation receipt should be claimed after recovery");
});
test("fresh new-id Save with incomplete original photo evidence reuses prefix for identical retry",async()=>{
  const retry=payload("request-new-abc-123456",{photos:[photoPayload,photoPayload]});
  const original=makeReceipt(retry,{photos:["https://files.example/old-a.jpg"],count:2});
  const {store,client}=setup({receipt:original});
  const result=await call(retry,client);
  assert.equal(result.code,200);
  assert.equal(result.body.success,true);
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,1,"Only the missing photo uploads; the completed prefix is reused");
  assert.deepEqual(store.work.after_photos,["https://files.example/old-a.jpg","https://files.example/new-1.jpg"]);
  assert.equal((store.work.notes.match(/Synthetic note/g)||[]).length,1);
  assert.equal(store.receipts.get(original.id).status,"applied");
  assert.equal(store.receipts.get(original.id).result_summary.resolved_by_retry,true);
  assert.equal([...store.receipts.values()].filter(row=>row.status==="applied").length,2);
});
test("photo retry reservation preserves audit details recorded after selecting a failed source",async()=>{
  const retry=payload("request-new-abc-123456",{photos:[photoPayload,photoPayload]});
  const previous=makeReceipt(retry,{status:"failed",photos:["https://files.example/old-a.jpg"],count:2});
  const {store,client,receipts}=setup({receipt:previous});
  store.pauseGrantCheck=true;
  const saving=call(retry,client);
  await until("photo reservation authorization",()=>store.pendingGrantChecks.length===1);
  const source=store.receipts.get(previous.id);
  await receipts.update(previous.id,{result_summary:{...source.result_summary,
    forensic_review_note:"Added while retry authorization was paused"}});
  store.pendingGrantChecks.shift()();
  const result=await saving;
  assert.equal(result.code,200);
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,1);
  const saved=store.receipts.get(previous.id);
  assert.equal(saved.status,"applied");
  assert.equal(saved.result_summary.forensic_review_note,"Added while retry authorization was paused");
  assert.deepEqual(saved.result_summary.uploaded_photo_urls,["https://files.example/old-a.jpg"]);
});

test("failed photo evidence from a different grant actor is never reused",async()=>{
  const retry=payload("request-new-abc-123456",{photos:[photoPayload,photoPayload]});
  const previous=makeReceipt(retry,{status:"failed",photos:["https://files.example/old-a.jpg"],count:2});
  previous.actor_user_id="different-grant";
  const {store,client}=setup({receipt:previous});
  const result=await call(retry,client);
  assert.equal(result.code,200);
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,2,"Cross-actor evidence must not avoid an upload");
  assert.equal(store.receipts.get(previous.id).status,"failed");
  assert.equal(store.receipts.get(previous.id).result_summary.retry_reserved_by_request_id,undefined);
});

test("simultaneous identical partial-photo retries upload the missing photo at most once",async()=>{
  const retry=payload("request-new-abc-123456",{photos:[photoPayload,photoPayload]});
  const original=makeReceipt(retry,{photos:["https://files.example/old-a.jpg"],count:2});
  const {store,client}=setup({receipt:original,uploadBarrier:true});
  const results=await Promise.all([
    call(retry,client),
    call({...retry,request_id:"request-new-def-789012"},client),
  ]);
  assert.equal(store.uploads.length,1,"Concurrent retries must not upload the same missing photo twice");
  assert.equal(store.updates,1,"Only one progress update is allowed");
  assert.deepEqual(results.map(row=>row.code).sort(),[200,409]);
  assert.equal((store.work.notes.match(/Synthetic note/g)||[]).length,1);
  assert.equal(store.work.after_photos.length,2);
});
test("failed reserved photo retry releases the old evidence so an identical later retry can finish",async()=>{
  const retry=payload("request-new-abc-123456",{photos:[photoPayload,photoPayload]});
  const original=makeReceipt(retry,{photos:["https://files.example/old-a.jpg"],count:2});
  const {store,client}=setup({receipt:original});
  store.failUploads=1;
  const failed=await call(retry,client);
  assert.notEqual(failed.body.success,true);
  assert.equal(store.receipts.get(original.id).status,"failed","Source reservation must be released after a confirmed failed retry");
  assert.equal(store.uploads.length,0);
  const successful=await call({...retry,request_id:"request-new-def-789012"},client);
  assert.equal(successful.code,200);
  assert.equal(store.updates,1);
  assert.equal(store.uploads.length,1,"Only the missing photo is retried");
  assert.equal([...store.receipts.values()].filter(row=>row.result_summary?.resolved_by_retry===true).length,1,
    "The best matching failed upload-prefix receipt must be resolved by the successful retry");
  assert.deepEqual(store.work.after_photos,["https://files.example/old-a.jpg","https://files.example/new-1.jpg"]);
  assert.equal((store.work.notes.match(/Synthetic note/g)||[]).length,1);
});
test("stranded in-flight photo reservation fails closed without uploading or changing evidence",async()=>{
  const retry=payload("request-new-abc-123456",{photos:[photoPayload,photoPayload]});
  const source=makeReceipt(retry,{status:"started",photos:["https://files.example/old-a.jpg"],count:2});
  source.result_summary.retry_reserved_by_request_id="request-owner-lost-987654";
  const {store,client}=setup({receipt:source});
  const result=await call(retry,client);
  assert.equal(result.code,409);
  assert.match(result.body.error,/still being verified/i);
  assert.equal(store.uploads.length,0);
  assert.equal(store.updates,0);
  assert.equal(store.receipts.get(source.id).status,"started","Uncertain upload evidence must remain pending for CCS");
});
test("status reconciliation racing another status check reports the same applied receipt",async()=>{
  const old=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:old,barrier:true});
  const status={action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:"request-original-123456"};
  const results=await Promise.all([call(status,client),call(status,client)]);
  assert.deepEqual(results.map(row=>row.code),[200,200]);
  assert.ok(results.every(row=>row.body.status==="applied" && row.body.request_id===status.request_id));
  assert.equal(store.updates,1);
  assert.equal(store.receipts.get(old.id).status,"applied");
  assert.equal(store.receipts.size,1);
});
function strandedStartReceipt(){
  const requestId="request-start-crashed-123456";
  const note="Start saved before dispatch";
  return {
    id:"stranded-start-receipt",
    operation_key:`mechanic:${grantId}:${workId}:start:${requestId}`,
    operation_type:"mechanic_start",target_entity:"FleetMaintenanceWorkOrder",target_id:workId,
    actor_user_id:grantId,payload_fingerprint:sha(JSON.stringify({action:"start",note})),
    status:"started",created_date:"2026-10-11T00:00:00.000Z",
    result_summary:{grant_id:grantId,action:"start",request_id:requestId,
      expected_updated_date:"version-1",mutation_plan:{started_date:"2026-10-11",
        appended_note:"[Mechanic – Synthetic]\\nStart saved before dispatch"}},
  };
}

test("stranded Start receipt with no prior dispatch can recover after an interrupted request",async()=>{
  const prior=strandedStartReceipt();
  const {store,client}=setup({receipt:prior});
  assert.equal(store.updateAttempts,0);
  const input={action:"mutation_status",token,work_order_id:workId,mutation_action:"start",
    request_id:prior.result_summary.request_id};
  const recovered=await call(input,client);
  assert.equal(recovered.code,200);
  assert.equal(recovered.body.status,"applied");
  assert.equal(store.updates,1);
  assert.equal(store.work.mechanic_operation_key,prior.operation_key);
  assert.equal(store.receipts.get(prior.id).status,"applied");
  const repeated=await call(input,client);
  assert.equal(repeated.body.status,"applied");
  assert.equal(store.updates,1,"Recovery stays idempotent after proving the marker");
});

test("stranded Start admin and status redispatch race commits once, then narrowed scope withholds mechanic data",async()=>{
  const prior=strandedStartReceipt();
  const {store,client,grant}=setup({receipt:prior,holdUpdates:true});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const status=call({action:"mutation_status",token,work_order_id:workId,mutation_action:"start",
    request_id:prior.result_summary.request_id},client);
  const admin=call({action:"admin_reconcile_mechanic_mutation",receipt_id:prior.id},client);
  await until("simultaneous Start recovery dispatches",()=>store.pendingUpdates.length===2);
  grant.scope_mode="selected_equipment";
  grant.allowed_equipment_ids=["eq-other"];
  for(const release of store.pendingUpdates.splice(0))release();
  const [mechanicResult,adminResult]=await Promise.all([status,admin]);
  assert.equal(store.updates,1,"Fleet work-order version CAS limits racing dispatches to one write");
  assert.equal(store.receipts.get(prior.id).status,"applied");
  assert.equal(adminResult.body.status,"applied");
  assert.equal(mechanicResult.code,403,"Current scope must block mechanic's committed response");
  assert.ok(!mechanicResult.body.work_order,"No work-order data escapes after scope is narrowed");
});

test("revoked interrupted Start without a work-order marker cannot be redispatched",async()=>{
  const prior=strandedStartReceipt();
  const {store,client,grant}=setup({receipt:prior});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const revoked=await call({action:"admin_revoke_link",id:grantId},client);
  assert.equal(revoked.code,200);
  assert.equal(revoked.body.reconciled_cancelled,1);
  assert.equal(grant.enabled,false);
  assert.equal(store.receipts.get(prior.id).status,"cancelled");
  const status=await call({action:"mutation_status",token,work_order_id:workId,mutation_action:"start",
    request_id:prior.result_summary.request_id},client);
  assert.equal(status.code,403);
  assert.equal(store.updateAttempts,0);
  assert.equal(store.updates,0);
});

test("concurrent distinct new request ids cannot apply same started receipt twice",async()=>{
  const old=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:old,barrier:true});
  const next=payload("request-new-abc-123456",{mechanic_note:"Different note"});
  const other=payload("request-new-def-789012",{mechanic_note:"Another new note"});
  const results=await Promise.all([call(next,client),call(other,client)]);
  assert.ok(store.updateAttempts>=2,"Both requests must reach backend CAS recovery: "+JSON.stringify(results));
  assert.equal(store.updates,1,"Only one CAS recovery may write the work order");
  assert.deepEqual(results.map(row=>row.code).sort(),[409,409]);
  assert.ok([...store.receipts.values()].every(row=>row.id===old.id || row.status!=="applied"),"No competing new mutation may be applied");
  assert.equal(store.receipts.get(old.id).status,"applied","Race loser must not downgrade already applied receipt");
  assert.equal((store.work.notes.match(/Synthetic note/g)||[]).length,1);
});


// Receipt terminalization races: synthetic entities only; no production writes.
test("failure CAS rejects operation identity changed during a stale status check",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client,receipts}=setup({receipt:prior});
  store.work.status="completed";
  store.pauseFailureWrite=true;
  const pending=call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:prior.result_summary.request_id},client);
  await until("failure identity conditional write",()=>store.pendingFailureWrites.length===1);
  const live=store.receipts.get(prior.id);
  await receipts.update(prior.id,{target_id:"different-work-order",
    result_summary:{...live.result_summary,forensic_review_note:"Preserve conflicting target"}});
  store.pendingFailureWrites.shift()();
  const result=await pending;
  assert.equal(result.code,409);
  assert.match(result.body.error,/receipt changed while failure was being recorded/i);
  assert.equal(store.receipts.get(prior.id).status,"started");
  assert.equal(store.receipts.get(prior.id).target_id,"different-work-order");
  assert.equal(store.receipts.get(prior.id).result_summary.forensic_review_note,"Preserve conflicting target");
  assert.equal(store.updates,0);
});

test("failure CAS losing to an applied receipt cannot claim failed",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client,receipts}=setup({receipt:prior});
  store.work.status="completed";
  store.pauseFailureWrite=true;
  const pending=call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:prior.result_summary.request_id},client);
  await until("failure versus applied CAS",()=>store.pendingFailureWrites.length===1);
  await receipts.update(prior.id,{status:"applied"});
  store.work.mechanic_operation_key=prior.operation_key;
  store.work.mechanic_operation_fingerprint=prior.payload_fingerprint;
  store.pendingFailureWrites.shift()();
  const result=await pending;
  assert.equal(result.code,409);
  assert.notEqual(result.body.status,"failed");
  assert.equal(store.receipts.get(prior.id).status,"applied");
  assert.equal(store.updates,0);
});

test("admin cancellation CAS refuses a concurrently reidentified receipt",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client,receipts}=setup({receipt:prior});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseCancelWrite=true;
  const revocation=call({action:"admin_revoke_link",id:grantId},client);
  await until("admin cancellation identity conditional write",()=>store.pendingCancelWrites.length===1);
  const live=store.receipts.get(prior.id);
  await receipts.update(prior.id,{payload_fingerprint:"different-operation-payload",
    result_summary:{...live.result_summary,forensic_review_note:"Keep changed operation"}});
  store.pendingCancelWrites.shift()();
  const result=await revocation;
  assert.equal(result.code,200);
  assert.equal(result.body.reconciled_blocked,1);
  assert.equal(result.body.reconciled_cancelled,0);
  assert.equal(store.receipts.get(prior.id).status,"started");
  assert.equal(store.receipts.get(prior.id).result_summary.admin_reconciled_not_applied,undefined);
  assert.equal(store.receipts.get(prior.id).result_summary.forensic_review_note,"Keep changed operation");
  assert.equal(store.updates,0);
});

test("admin cancellation CAS does not report applied without a work-order marker",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client,receipts}=setup({receipt:prior});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseCancelWrite=true;
  const revocation=call({action:"admin_revoke_link",id:grantId},client);
  await until("admin cancellation versus unproven applied state",()=>store.pendingCancelWrites.length===1);
  await receipts.update(prior.id,{status:"applied"});
  store.pendingCancelWrites.shift()();
  const result=await revocation;
  assert.equal(result.body.reconciled_applied,0);
  assert.equal(result.body.reconciled_cancelled,0);
  assert.equal(result.body.reconciled_blocked,1);
  assert.equal(store.receipts.get(prior.id).status,"applied");
  assert.equal(store.work.mechanic_operation_key,undefined);
  assert.equal(store.updates,0);
});

test("lost terminalization acknowledgments are reconciled from matching durable receipt identity",async()=>{
  const failed=makeReceipt(payload("request-original-123456"));
  const first=setup({receipt:failed});
  first.store.work.status="completed";
  first.store.loseFailureAckOnce=true;
  const failure=await call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:failed.result_summary.request_id},first.client);
  assert.equal(failure.code,200);
  assert.equal(failure.body.status,"failed");
  assert.equal(first.store.receipts.get(failed.id).status,"failed");
  assert.equal(first.store.updates,0);

  const prior=makeReceipt(payload("request-original-123456"));
  const second=setup({receipt:prior});
  second.client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  second.store.loseCancelAckOnce=true;
  const revoked=await call({action:"admin_revoke_link",id:grantId},second.client);
  assert.equal(revoked.code,200);
  assert.equal(revoked.body.reconciled_cancelled,1);
  assert.equal(second.store.receipts.get(prior.id).status,"cancelled");
  assert.equal(second.store.receipts.get(prior.id).result_summary.admin_reconciled_not_applied,true);
  assert.equal(second.store.updates,0);
});


test("bare applied receipt status does not certify a Fleet work-order commit",async()=>{
  const requestId="request-original-123456";
  const previous=makeReceipt(payload(requestId),{status:"applied"});
  const {store,client}=setup({receipt:previous});
  const status=await call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:requestId},client);
  assert.equal(status.code,409);
  assert.match(status.body.error,/lacks verifiable work-order commit evidence/i);
  const replay=await call(payload(requestId),client);
  assert.equal(replay.code,409);
  assert.match(replay.body.error,/lacks verified Fleet work-order commit evidence/i);
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const admin=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:previous.id},client);
  assert.equal(admin.code,200);
  assert.equal(admin.body.status,"blocked");
  assert.match(admin.body.error_message,/lacks verifiable work-order commit evidence/i);
  assert.equal(store.receipts.get(previous.id).status,"applied","Do not erase ambiguous evidence");
  assert.equal(store.updates,0);
});

test("superseded work-order marker still accepts a genuinely recorded prior applied receipt",async()=>{
  const requestId="request-original-123456";
  const previous=makeReceipt(payload(requestId),{status:"applied"});
  previous.applied_at="2026-10-12T12:00:00.000Z";
  previous.result_summary.work_order_updated_date="version-2";
  previous.result_summary.work_order_status="in_progress";
  previous.result_summary.recovered_from_work_order_marker=false;
  const {store,client}=setup({receipt:previous});
  store.work.updated_date="version-3";
  store.work.mechanic_operation_key="mechanic:other:unrelated:save:request-overwritten-123456";
  store.work.mechanic_operation_fingerprint="unrelated";
  const status=await call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:requestId},client);
  assert.equal(status.code,200);
  assert.equal(status.body.status,"applied");
  const retry=await call(payload(requestId),client);
  assert.equal(retry.code,200);
  assert.equal(retry.body.reused,true);
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const admin=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:previous.id},client);
  assert.equal(admin.body.status,"applied");
  assert.equal(store.updates,0);
});

test("resolved photo source requires exact applied retry identity and recorded commit evidence",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{status:"applied",urls:[
    "https://files.example/old-a.jpg","https://files.example/completed-b.jpg",
  ]});
  const sourceReceipt=store.receipts.get(source.id);
  sourceReceipt.status="applied";
  sourceReceipt.applied_at="2026-10-12T12:10:00.000Z";
  sourceReceipt.result_summary.resolved_by_retry=true;
  sourceReceipt.result_summary.resolved_by_operation_key=retry.operation_key;
  let status=await call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:source.result_summary.request_id},client);
  assert.equal(status.code,200);
  assert.equal(status.body.status,"applied");
  const retryReceipt=store.receipts.get(retry.id);
  delete retryReceipt.result_summary.work_order_updated_date;
  status=await call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:source.result_summary.request_id},client);
  assert.equal(status.code,409);
  assert.match(status.body.error,/lacks verifiable work-order commit evidence/i);
  assert.equal(store.receipts.get(source.id).status,"applied");
  assert.equal(store.updates,0);
});

test("admin will not release pending photo source based solely on unverified applied retry",async()=>{
  const {store,client}=setup();
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  const {source,retry}=strandReservedPhotoRetry(store,{status:"applied",urls:[
    "https://files.example/old-a.jpg","https://files.example/completed-b.jpg",
  ]});
  delete store.receipts.get(retry.id).result_summary.work_order_updated_date;
  const result=await call({action:"admin_reconcile_mechanic_mutation",receipt_id:source.id},client);
  assert.equal(result.body.status,"blocked");
  assert.match(result.body.error_message,/lacks verifiable Fleet work-order commit evidence/i);
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.updates,0);
});


test("status reconciliation does not certify an unverified applied owner retry or release its source",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{status:"applied",urls:[
    "https://files.example/old-a.jpg","https://files.example/owner-b.jpg",
  ]});
  delete store.receipts.get(retry.id).result_summary.work_order_updated_date;
  const status=await call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:source.result_summary.request_id},client);
  assert.equal(status.code,200);
  assert.equal(status.body.status,"started");
  assert.match(status.body.error_message,/still being verified/i);
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.receipts.get(retry.id).status,"applied");
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});

test("new Save request cannot resolve unverified applied photo owner as prior success",async()=>{
  const {store,client}=setup();
  const {source,retry}=strandReservedPhotoRetry(store,{status:"applied",urls:[
    "https://files.example/old-a.jpg","https://files.example/owner-b.jpg",
  ]});
  delete store.receipts.get(retry.id).result_summary.work_order_updated_date;
  const result=await call(payload("request-new-def-789012"),client);
  assert.equal(result.code,409);
  assert.match(result.body.error,/still being verified/i);
  assert.equal(result.body.recovered_previous,undefined);
  assert.equal(store.receipts.get(source.id).status,"started");
  assert.equal(store.updates,0);
  assert.equal(store.uploads.length,0);
});


test("admin revocation detects a work-order commit that lands before its receipt cancellation CAS",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:prior});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseCancelWrite=true;
  const pending=call({action:"admin_revoke_link",id:grantId},client);
  await until("admin cancellation about to commit after Fleet update",()=>store.pendingCancelWrites.length===1);
  // A dispatched mechanic action committed its original operation marker;
  // receipt terminalization has not yet run.
  store.work.mechanic_operation_key=prior.operation_key;
  store.work.mechanic_operation_fingerprint=prior.payload_fingerprint;
  store.work.updated_date="version-2";
  store.work.corrective_action="Mechanic commit landed during CCS cancellation";
  store.pendingCancelWrites.shift()();
  const outcome=await pending;
  assert.equal(outcome.code,200);
  assert.equal(outcome.body.reconciled_applied,1);
  assert.equal(outcome.body.reconciled_cancelled,0);
  assert.equal(outcome.body.reconciled_blocked,0);
  const current=store.receipts.get(prior.id);
  assert.equal(current.status,"applied");
  assert.ok(current.applied_at);
  assert.equal(current.result_summary.work_order_updated_date,"version-2");
  assert.equal(current.result_summary.recovered_from_work_order_marker,true);
  assert.equal(current.result_summary.admin_reconciled_not_applied,true,
    "Retain the historical cancellation decision as forensic provenance");
  assert.equal(store.updates,0,"Admin reconciliation must not reapply Fleet maintenance");
});

test("admin cancellation never reports applied if the late marker belongs to another receipt",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:prior});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseCancelWrite=true;
  const pending=call({action:"admin_revoke_link",id:grantId},client);
  await until("admin cancellation while an unrelated Fleet update commits",()=>store.pendingCancelWrites.length===1);
  store.work.mechanic_operation_key="mechanic:another-grant:another-work:save:another-valid-request-123456";
  store.work.mechanic_operation_fingerprint=prior.payload_fingerprint;
  store.work.updated_date="version-2";
  store.pendingCancelWrites.shift()();
  const outcome=await pending;
  assert.equal(outcome.code,200);
  assert.equal(outcome.body.reconciled_cancelled,1);
  assert.equal(outcome.body.reconciled_applied,0);
  assert.equal(store.receipts.get(prior.id).status,"cancelled");
  assert.equal(store.updates,0);
});

test("uncertain cancellation acknowledgment reconciles a concurrent committed Fleet marker",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:prior});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseCancelWrite=true;
  store.loseCancelAckOnce=true;
  const pending=call({action:"admin_revoke_link",id:grantId},client);
  await until("lost cancellation acknowledgment versus committed Fleet marker",()=>store.pendingCancelWrites.length===1);
  store.work.mechanic_operation_key=prior.operation_key;
  store.work.mechanic_operation_fingerprint=prior.payload_fingerprint;
  store.work.updated_date="version-2";
  store.pendingCancelWrites.shift()();
  const outcome=await pending;
  assert.equal(outcome.code,200);
  assert.equal(outcome.body.reconciled_applied,1);
  assert.equal(outcome.body.reconciled_cancelled,0);
  assert.equal(store.receipts.get(prior.id).status,"applied");
  assert.equal(store.updates,0);
});

test("admin cancellation post-commit reconciliation blocks a racing receipt identity replacement",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client,receipts}=setup({receipt:prior});
  client.auth={me:async()=>({email:"admin@example.test",role:"admin"})};
  store.pauseCancelWrite=true;
  store.pauseAppliedWrite=true;
  const pending=call({action:"admin_revoke_link",id:grantId},client);
  await until("admin cancellation CAS paused for late commit",()=>store.pendingCancelWrites.length===1);
  store.work.mechanic_operation_key=prior.operation_key;
  store.work.mechanic_operation_fingerprint=prior.payload_fingerprint;
  store.work.updated_date="version-2";
  store.pendingCancelWrites.shift()();
  await until("post-cancellation reconciliation applied CAS",()=>store.pendingAppliedWrites.length===1);
  const live=store.receipts.get(prior.id);
  await receipts.update(prior.id,{payload_fingerprint:"reidentified-payload",
    result_summary:{...live.result_summary,forensic_review_note:"Keep identity-conflict audit note"}});
  store.pendingAppliedWrites.shift()();
  const outcome=await pending;
  assert.equal(outcome.code,200);
  assert.equal(outcome.body.reconciled_applied,0);
  assert.equal(outcome.body.reconciled_cancelled,0);
  assert.equal(outcome.body.reconciled_blocked,1);
  assert.equal(store.receipts.get(prior.id).status,"cancelled");
  assert.equal(store.receipts.get(prior.id).result_summary.forensic_review_note,"Keep identity-conflict audit note");
  assert.equal(store.updates,0);
});

test("late Fleet commit between failure snapshot and CAS cannot be reported failed",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:prior});
  store.work.status="completed";
  store.pauseFailureWrite=true;
  const pending=call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:prior.result_summary.request_id},client);
  await until("failure CAS paused before late Fleet commit",()=>store.pendingFailureWrites.length===1);
  store.work.mechanic_operation_key=prior.operation_key;
  store.work.mechanic_operation_fingerprint=prior.payload_fingerprint;
  store.work.updated_date="version-2";
  store.work.corrective_action="Mechanic work committed after old status snapshot";
  store.pendingFailureWrites.shift()();
  const response=await pending;
  assert.equal(response.code,409);
  assert.notEqual(response.body.status,"failed");
  assert.match(response.body.error,/committed during failure reconciliation/i);
  const latest=store.receipts.get(prior.id);
  assert.equal(latest.status,"applied");
  assert.equal(latest.result_summary.work_order_updated_date,"version-2");
  assert.equal(latest.result_summary.recovered_from_work_order_marker,true);
  assert.equal(store.updates,0,"Failure reconciliation must never replay maintenance");
});

test("failure path still reports failed with an unrelated later work-order marker",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:prior});
  store.work.status="completed";
  store.pauseFailureWrite=true;
  const pending=call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:prior.result_summary.request_id},client);
  await until("failure CAS paused for unrelated Fleet change",()=>store.pendingFailureWrites.length===1);
  store.work.mechanic_operation_key="mechanic:another-grant:unrelated-work:save:another-valid-request-123456";
  store.work.mechanic_operation_fingerprint=prior.payload_fingerprint;
  store.work.updated_date="version-2";
  store.pendingFailureWrites.shift()();
  const response=await pending;
  assert.equal(response.code,200);
  assert.equal(response.body.status,"failed");
  assert.equal(store.receipts.get(prior.id).status,"failed");
  assert.equal(store.updates,0);
});

test("lost failure acknowledgment with late committed marker is recovered as applied",async()=>{
  const prior=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:prior});
  store.work.status="completed";
  store.pauseFailureWrite=true;
  store.loseFailureAckOnce=true;
  const pending=call({action:"mutation_status",token,work_order_id:workId,
    mutation_action:"save",request_id:prior.result_summary.request_id},client);
  await until("failure acknowledgment lost after late Fleet commit",()=>store.pendingFailureWrites.length===1);
  store.work.mechanic_operation_key=prior.operation_key;
  store.work.mechanic_operation_fingerprint=prior.payload_fingerprint;
  store.work.updated_date="version-2";
  store.pendingFailureWrites.shift()();
  const response=await pending;
  assert.equal(response.code,409);
  assert.match(response.body.error,/committed during failure reconciliation/i);
  assert.equal(store.receipts.get(prior.id).status,"applied");
  assert.equal(store.updates,0);
});
