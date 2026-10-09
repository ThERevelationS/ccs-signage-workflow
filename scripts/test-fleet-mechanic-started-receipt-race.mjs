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
function setup({receipt=null,barrier=false}={}){
  const store={work:baseWork(),receipts:new Map(),uploads:[],updates:0,updateAttempts:0,revision:1,barrier,
    waiting:[], release:null};
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
test("concurrent distinct new request ids cannot apply same started receipt twice",async()=>{
  const old=makeReceipt(payload("request-original-123456"));
  const {store,client}=setup({receipt:old,barrier:true});
  const next=payload("request-new-abc-123456",{mechanic_note:"Different note"});
  const other=payload("request-new-def-789012",{mechanic_note:"Another new note"});
  const results=await Promise.all([call(next,client),call(other,client)]);
  assert.ok(store.updateAttempts>=2,"Both requests must reach backend CAS recovery: "+JSON.stringify(results));
  assert.equal(store.updates,1,"Only one CAS recovery may write the work order");
  assert.deepEqual(results.map(row=>row.code).sort(),[409,409]);
  assert.equal(store.receipts.size,1,"Race must not create a replacement mutation");
  assert.equal(store.receipts.get(old.id).status,"applied","Race loser must not downgrade already applied receipt");
  assert.equal((store.work.notes.match(/Synthetic note/g)||[]).length,1);
});
