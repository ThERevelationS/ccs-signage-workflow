import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root='/app';
const clientEntry=path.join(root,'src/components/estimator/estimateRevisionService.js');
const clientOut=path.join(root,'.tmp-estimate-revision-client.mjs');
const virtual={
'@/api/base44Client':`export const base44=new Proxy({}, {get(_t,p){return globalThis.__clientBase44?.[p];}});`,
};
await esbuild.build({entryPoints:[clientEntry],outfile:clientOut,bundle:true,format:'esm',platform:'node',plugins:[{name:'alias',setup(build){build.onResolve({filter:/^@\//},args=>{if(virtual[args.path])return{path:args.path,namespace:'v'};const rel=args.path.slice(2);for(const p of [path.join(root,'src',rel),path.join(root,'src',rel+'.js'),path.join(root,'src',rel+'.jsx')])if(fs.existsSync(p))return{path:p};throw new Error('unresolved '+args.path)});build.onLoad({filter:/.*/,namespace:'v'},args=>({contents:virtual[args.path],loader:'js'}));}}]});
const client=await import(`${pathToFileURL(clientOut).href}?${Date.now()}`);
const clone=v=>v==null?v:structuredClone(v);
function makeRevisionEntity(rows){
  let created=null,updated=null;
  return {
    get created(){return created;}, get updated(){return updated;},
    async filter(q,sort,limit=50,skip=0){let out=rows.filter(r=>Object.entries(q||{}).every(([k,v])=>r[k]===v));out.sort((a,b)=>(a.revision_number||0)-(b.revision_number||0));return clone(out.slice(skip,skip+limit));},
    async create(data){created={id:'new',...clone(data)};rows.push(created);return clone(created);},
    async get(id){return clone(rows.find(r=>r.id===id)||null);},
    async update(id,patch){const i=rows.findIndex(r=>r.id===id);if(i>=0)rows[i]={...rows[i],...clone(patch)};updated={id,...clone(patch)};return clone(rows[i]||updated);}
  };
}
let pass=0;const ok=(c,l)=>{if(!c)throw new Error('FAIL '+l);console.log('PASS '+l);pass++;};
{
 const rows=Array.from({length:575},(_,i)=>({id:`r${i}`,estimate_id:'e1',revision_number:i+1,revision_status:'completed'}));
 const ent=makeRevisionEntity(rows);globalThis.__clientBase44={entities:{EstimateRevision:ent},functions:{invoke:async()=>({})}};
 const listed=await client.listEstimateRevisions('e1',{strict:true});
 ok(listed.length===575,'browser history loads all 575 revisions');
 ok(listed[0].revision_number===575,'browser history sorts latest revision first');
 const created=await client.recordEstimateLifecycleRevision({estimateBefore:{id:'e1',status:'draft'},estimateAfter:{id:'e1',status:'sent'},reason:'test'});
 ok(created.revision_number===576,'browser nextRevisionNumber uses page 2 and creates #576');
}
{
 const rows=Array.from({length:75},(_,i)=>({id:`o${i}`,estimate_id:'e2',revision_number:i+1,revision_status:'open'}));
 const ent=makeRevisionEntity(rows);globalThis.__clientBase44={entities:{EstimateRevision:ent},functions:{invoke:async()=>({})}};
 const open=await client.getOpenEstimateRevision('e2');
 ok(open.revision_number===75,'open revision lookup sees row 75');
}
{
 const rows=Array.from({length:75},(_,i)=>({id:`q${i}`,estimate_id:'e3',revision_number:i+1,revision_status:'completed',quote_issue_key:'e3:v5',quote_version:5,estimate_snapshot_before:{quote_version:i===74?4:5},estimate_snapshot_after:{quote_version:5},delivery_evidence:{}}));
 const ent=makeRevisionEntity(rows);globalThis.__clientBase44={entities:{EstimateRevision:ent},functions:{invoke:async()=>({})}};
 // real quoteIssueKey format is deterministic; pull it from source behavior by using quote version 5.
 const result=await client.attachQuoteDeliveryEvidenceToIssuanceRevision({estimateId:'e3',quoteVersion:5,evidence:{deliveryId:'d1',gmailMessageId:'m1'}});
 ok(result.revision?.id==='q74','issuance fallback finds valid revision after row 50');
}

// Bundle and invoke the actual backend Deno handler.
const backendEntry=path.join(root,'base44/functions/ensureEstimateLifecycleRevision/entry.ts');
const backendOut=path.join(root,'.tmp-estimate-revision-backend.mjs');
await esbuild.build({entryPoints:[backendEntry],outfile:backendOut,bundle:true,format:'esm',platform:'node',plugins:[{name:'npm-mock',setup(build){build.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'v'}));build.onLoad({filter:/.*/,namespace:'v'},()=>({contents:`export function createClientFromRequest(){return globalThis.__backendClient;}`,loader:'js'}));}}]});
globalThis.Deno={serve(fn){globalThis.__handler=fn;}};
await import(`${pathToFileURL(backendOut).href}?${Date.now()}`);
function backendClient(rows,{failSecondPage=false}={}){
 let createCalls=0;
 const svc={
   async filter(q,sort,limit=50,skip=0){if(failSecondPage&&skip>=500&&Object.keys(q||{}).length===1&&q.estimate_id==='e1')throw new Error('page 2 unavailable');let out=rows.filter(r=>Object.entries(q||{}).every(([k,v])=>r[k]===v));out.sort((a,b)=>(a.revision_number||0)-(b.revision_number||0));return clone(out.slice(skip,skip+limit));},
   async delete(id){const i=rows.findIndex(r=>r.id===id);if(i>=0)rows.splice(i,1);}
 };
 const userEnt={async create(data){createCalls++;const r={id:`new${createCalls}`,created_date:new Date().toISOString(),...clone(data)};rows.push(r);return clone(r);}};
 return {client:{auth:{me:async()=>({id:'u1'})},entities:{EstimateRevision:userEnt},asServiceRole:{entities:{EstimateRevision:svc}}},get createCalls(){return createCalls;}};
}
async function request(body){return{async json(){return body;}};}
{
 const rows=Array.from({length:575},(_,i)=>({id:`r${i}`,estimate_id:'e1',revision_number:i+1,revision_status:'completed',idempotency_key:`old${i}`,created_date:`2026-01-01T00:00:${String(i%60).padStart(2,'0')}Z`}));
 const wrap=backendClient(rows);globalThis.__backendClient=wrap.client;
 const res=await globalThis.__handler(await request({idempotency_key:'new-key',revision:{estimate_id:'e1',reason:'new lifecycle',revision_type:'status_transition'}}));
 const data=await res.json();
 ok(data.revision?.revision_number===576,'backend next revision uses all 575 rows and creates #576');
 ok(wrap.createCalls===1,'backend creates exactly one lifecycle revision');
}
{
 const rows=Array.from({length:575},(_,i)=>({id:`r${i}`,estimate_id:'e1',revision_number:i+1,revision_status:'completed',idempotency_key:`old${i}`}));
 const wrap=backendClient(rows,{failSecondPage:true});globalThis.__backendClient=wrap.client;
 const res=await globalThis.__handler(await request({idempotency_key:'new-key',revision:{estimate_id:'e1',reason:'new lifecycle',revision_type:'status_transition'}}));
 const data=await res.json();
 ok(res.status===500 && /page 2 unavailable|could not/i.test(String(data.error)),'backend fails closed when later revision page cannot be verified');
 ok(wrap.createCalls===0,'backend creates nothing after later-page verification failure');
}
console.log(`ESTIMATE REVISION PAGINATION: ${pass} passed`);
for(const f of [clientOut,backendOut,path.join(root,'.tmp-estimate-revision-pagination-test.mjs')])fs.rmSync(f,{force:true});
