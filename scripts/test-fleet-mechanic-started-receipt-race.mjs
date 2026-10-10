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
function setup({receipt=null,barrier=false,uploadBarrier=false}={}){
  const store={work:baseWork(),receipts:new Map(),uploads:[],updates:0,updateAttempts:0,revision:1,barrier,uploadBarrier,failUploads:0,
    waiting:[], uploadWaiting:[], release:null};
  if(receipt)store.receipts.set(receipt.id,clone(receipt));
  const grant={id:grantId,enabled:true,token_hash:sha(token),name:"Synthetic",
    allowed_actions:["bootstrap","start","save"],scope_mode:"all_active",expires_at:"2099-01-01T00:00:00.000Z"};
  let receiptSequence=0;
  const matches=(row,filter)=>Object.entries(filter||{}).every(([key,value])=>{
    const current=row[key];
    return value&&typeof value==="object"&&"$in" in value?value.$in.includes(current):current===value;
  });
  const receipts={
    async get(id){return clone(store.receipts.get(id)||null);},
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
      const found=[...store.receipts.values()].filter(row=>matches(row,filter));
      for(const row of found)store.receipts.set(row.id,{...row,...clone(operators.$set)});
      return {updated:found.length};
    },
    async delete(id){store.receipts.delete(id);}
  };
  const access={
    async list(){return [clone(grant)];},
    async filter(filter){return matches(grant,filter)?[clone(grant)]:[];},
    async get(id){return id===grantId?clone(grant):null;},
    async update(_id,patch){Object.assign(grant,patch);return clone(grant);}
  };
  const WorkOrder={
    async get(id){return id===workId?clone(store.work):null;},
  };
  const invoke=async (name,mutation)=>{
    assert.equal(name,"fleetWorkOrderAction");
    store.updateAttempts++;
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
  store.receipts.set(source.id,clone(source));
  store.receipts.set(retry.id,clone(retry));
  return {source,retry,body};
}

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
  console.log('admin-pair-debug',JSON.stringify({first:first.body,second:second.body,updates:store.updates}));
  assert.equal(first.body.status,"applied",JSON.stringify({first,second,updates:store.updates}));
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
