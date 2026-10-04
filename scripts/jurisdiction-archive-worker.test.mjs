import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function compile(name) {
  const output=await build({entryPoints:['base44/functions/'+name+'/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',plugins:[{name:'mock-boundaries',setup(b){
    b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
    b.onResolve({filter:/jurisdictionSourceTextRuntime\.ts$/},()=>({path:'text-parser',namespace:'mock'}));
    b.onResolve({filter:/safeExternalFetch\.ts$/},()=>({path:'fetch',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:path==='text-parser'?'export const readAndExtractSourcePdf = async () => { throw new Error("Unexpected text parsing"); };':path==='sdk'?'export const createClientFromRequest = () => globalThis.workerFixture;':'export const safeExternalFetch = async () => { throw new Error("Unexpected network work"); };',loader:'js'}));
  }}]});
  let handler;globalThis.Deno={serve:fn=>{handler=fn;}};
  await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64')+'#'+name);
  return handler;
}
const worker=await compile('continueJurisdictionArchives');
const dispatcher=await compile('permittingResearchBacklogDispatch');
function setup({role='admin',enabled=true,atCap=false}={}) {
  const calls={scans:0,textScans:0,research:0,writes:0};
  const settings={filter:async query=>[{
    id:query.setting_key,updated_date:'v1',setting_key:query.setting_key,
    setting_value:query.setting_key.endsWith('config')?{enabled,interval_minutes:15,daily_dispatch_limit:40}:
      {daily_day_key:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()),dispatched_today:atCap?40:0,last_cycle_at:'2000-01-01T00:00:00Z'},
  }]};
  globalThis.workerFixture={auth:{me:async()=>role?{role}:null},asServiceRole:{
    entities:{PermittingSourceDocument:{filter:async(q,s,l)=>{assert.ok(q.source_registration_key);assert.equal(l,20);calls.textScans++;return[];},create:async()=>{throw Error('Unexpected catalog create');}},GlobalSettings:settings,JurisdictionProfile:{filter:async(query,sort,limit)=>{assert.equal(limit,20);assert.equal(sort,'updated_date');assert.ok(query.documents.$elemMatch);calls.scans++;return[];},
      get:async()=>({id:'j',documents:[],updated_date:'v1'}),updateMany:async()=>{calls.writes++;return{updated:1};}}},
    integrations:{Core:{UploadFile:async()=>{throw Error('Unexpected upload');}}},
    functions:{invoke:async()=>{calls.research++;throw Error('Unexpected research');}},
  }};
  return calls;
}
async function invoke(handler,body) {
  const r=await handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}));
  return {status:r.status,data:await r.json()};
}
test('worker rejects unauthenticated/nonadmin requests',async()=>{
  for(const role of [null,'user']){const calls=setup({role});assert.equal((await invoke(worker,{jurisdiction_id:'j'})).status,403);assert.equal(calls.scans,0);}
});
test('automatic worker honors pause and rejects caller-selected targets',async()=>{
  const calls=setup({enabled:false});assert.equal((await invoke(worker,{automatic:true})).data.reason,'disabled');
  assert.equal((await invoke(worker,{automatic:true,jurisdiction_id:'j'})).status,400);assert.equal(calls.scans,0);
});
test('manual targeted archive is available while automatic research is paused',async()=>{
  setup({enabled:false});const r=await invoke(worker,{jurisdiction_id:'j'});assert.equal(r.status,200);assert.equal(r.data.skipped,true);
});
test('automatic backlog scan is bounded and requires no research',async()=>{
  const calls=setup();assert.equal((await invoke(worker,{automatic:true})).data.profiles_checked,0);
  assert.equal(calls.scans,2);assert.equal(calls.research,0);
});
test('dispatcher at its daily LLM limit still runs archival and makes no research/state writes',async()=>{
  const calls=setup({atCap:true});
  const r=await invoke(dispatcher,{});
  assert.equal(r.data.reason,'daily_limit');assert.equal(r.data.dispatched_today,40);
  assert.equal(r.data.archive_continuation.reason,'no_eligible_file');
  assert.equal(r.data.text_continuation.reason,'no_eligible_text_source');assert.equal(calls.textScans,1);
  assert.equal(calls.scans,2);assert.equal(calls.research,0);assert.equal(calls.writes,0);
});

test('catalog route requires a stable manual target and denies automated caller-selected targets',async()=>{
  setup({enabled:false});
  assert.equal((await invoke(worker,{jurisdiction_id:'j',catalog_only:true})).status,400);
  assert.equal((await invoke(worker,{automatic:true,jurisdiction_id:'j',document_id:'d',catalog_only:true})).status,400);
});
test('compiled manual catalog route registers during automatic pause, with no network or research and safe redelivery',async()=>{
  const calls=setup({enabled:false});
  const hash='a'.repeat(64);let profile={id:'j',name:'County',state:'OH',updated_date:'v1',documents:[{id:'d',title:'Sign application',doc_type:'permit_application',source:'ai_discovered',url:'https://gov.test/a.pdf',file_url:'https://storage.test/a.pdf',source_sha256:hash,stored_sha256:hash,source_bytes:20,stored_bytes:20,archive_state:{status:'complete'},downloaded_at:'2026-10-04T08:00:00Z'}]};
  let version=1;const rows=[];
  globalThis.workerFixture.asServiceRole.entities.JurisdictionProfile={
    get:async()=>structuredClone(profile),updateMany:async(q,p)=>{if(q.updated_date!==profile.updated_date)return{updated:0};profile={...profile,...p.$set,updated_date:'v'+(++version)};return{updated:1};}};
  globalThis.workerFixture.asServiceRole.entities.PermittingSourceDocument={
    filter:async()=>structuredClone(rows),create:async data=>{const r={...data,id:'source'};rows.push(r);return r;}};
  const body={jurisdiction_id:'j',document_id:'d',catalog_only:true};
  const result=await invoke(worker,body);assert.equal(result.status,200);assert.equal(result.data.created,1);
  assert.equal(rows[0].content_status,'unknown');assert.equal(rows[0].authority_confidence,'unverified');
  assert.equal((await invoke(worker,body)).data.skipped,true);assert.equal(rows.length,1);assert.equal(calls.research,0);
});

test('text-parser failure is reported without interrupting credit-capped research dispatch',async()=>{
 const calls=setup({atCap:true});
 globalThis.workerFixture.asServiceRole.entities.PermittingSourceDocument.filter=async()=>{throw Error('Parser backlog unavailable');};
 const r=await invoke(dispatcher,{});
 assert.equal(r.status,200);assert.equal(r.data.reason,'daily_limit');assert.equal(r.data.text_continuation.status,'text_continuation_failed');
 assert.equal(calls.research,0);assert.equal(calls.writes,0);
});
