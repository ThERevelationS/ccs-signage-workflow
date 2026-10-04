import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {PDF_TEXT_METHOD,assembledSourceText,textSha256} from '../base44/shared/jurisdictionSourcePdfText.mjs';
const built=await build({entryPoints:['base44/functions/continuePermittingSourceText/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
 b.onResolve({filter:/jurisdictionSourceTextRuntime\.ts$/},()=>({path:'parser',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:path==='sdk'?'export const createClientFromRequest=()=>globalThis.textFixture;':'export const readAndExtractSourcePdf = args => globalThis.textParser(args);',loader:'js'}));
}}]});
let handler;globalThis.Deno={serve:fn=>{handler=fn;}};
await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const hash='a'.repeat(64);
function setup({role='admin',enabled=true}={}) {
 let row={id:'s',source_registration_key:'key',title:'Form',archived_file_url:'https://storage.test/a.pdf',file_hash_sha256:hash,file_bytes:500,updated_date:'v1',authority_classification:'application_form',verification_status:'needs_verification'},version=1;
 const calls={parses:0,scans:0,research:0};
 globalThis.textParser=async({source,startPage})=>{calls.parses++;return{total_pages:1,next_page:2,pages:[{page:startPage,text:'Official source page text retained.',source_document_id:source.id,source_sha256:hash,method:PDF_TEXT_METHOD,needs_ocr_review:false,truncated:false}]};};
 globalThis.textFixture={auth:{me:async()=>role?{role}:null},asServiceRole:{entities:{
  GlobalSettings:{filter:async()=>[{setting_value:{enabled}}]},
  JurisdictionProfile:{get:async()=>({auto_refresh:false})},
  PermittingSourceDocument:{get:async()=>structuredClone(row),filter:async(q,s,l)=>{calls.scans++;assert.equal(l,20);assert.equal(s,'updated_date');return[];},
   updateMany:async(q,p)=>{if(q.updated_date!==row.updated_date)return{updated:0};row={...row,...p.$set,updated_date:'v'+(++version)};return{updated:1};}},
 },integrations:{Core:{InvokeLLM:async()=>{calls.research++;throw Error('Unexpected LLM');}}}}};
 return calls;
}
test('compiled manual worker persists subsequent pages into segment evidence while automation is paused',async()=>{
 const c=setup({enabled:false});const makePage=async n=>{const text='Retained evidence page '+n;return{
  page:n,text,source_document_id:'s',source_sha256:hash,text_sha256:await textSha256(new TextEncoder().encode(text)),
  method:PDF_TEXT_METHOD,truncated:false,needs_ocr_review:false};};
 const inline=await Promise.all([1,2,3,4,5].map(makePage));let version=1;
 let row={id:'s',source_registration_key:'key',archived_file_url:'https://storage.test/a.pdf',file_hash_sha256:hash,file_bytes:500,
  updated_date:'v1',extracted_pages:inline,text_extraction_state:{status:'partial',method:PDF_TEXT_METHOD,source_sha256:hash,
  archived_file_url:'https://storage.test/a.pdf',pages_extracted:5,next_page:6,total_pages:10,complete_document_text:false}};
 row.extracted_text=assembledSourceText(row,inline);const preview=row.extracted_text,segments=[];
 globalThis.textFixture.asServiceRole.entities.PermittingSourceDocument={get:async()=>structuredClone(row),updateMany:async(q,p)=>{
  if(q.updated_date!==row.updated_date)return{updated:0};row={...row,...p.$set,updated_date:'v'+(++version)};return{updated:1};}};
 globalThis.textFixture.asServiceRole.entities.PermittingSourceTextSegment={
  filter:async q=>structuredClone(segments.filter(s=>s.registration_key===q.registration_key)),
  create:async data=>{const saved={...data,id:'segment'};segments.push(saved);return saved;}};
 globalThis.textParser=async({startPage})=>{c.parses++;assert.equal(startPage,6);return{total_pages:10,next_page:11,pages:await Promise.all([6,7,8,9,10].map(makePage))};};
 const r=await invoke({source_document_id:'s'});assert.equal(r.data.status,'complete');assert.equal(segments.length,1);
 assert.equal(row.extracted_text,preview);assert.equal(row.extracted_pages.length,5);assert.equal(row.text_extraction_state.pages_extracted,10);
 assert.equal(c.research,0);assert.equal((await invoke({source_document_id:'s'})).data.skipped,true);assert.equal(c.parses,1);
});

const invoke=async body=>{const r=await handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}));return{status:r.status,data:await r.json()};};
test('text worker rejects nonadmin callers before any scan or parsing',async()=>{
 for(const role of [null,'user']){const c=setup({role});assert.equal((await invoke({source_document_id:'s'})).status,403);assert.equal(c.parses,0);assert.equal(c.scans,0);}
});
test('automatic worker respects pause and refuses caller-selected targets',async()=>{
 const c=setup({enabled:false});assert.equal((await invoke({automatic:true})).data.reason,'disabled');
 assert.equal((await invoke({automatic:true,source_document_id:'s'})).status,400);assert.equal(c.scans,0);
});
test('manual selected text extraction works during automatic pause, preserves authority, and redelivery skips',async()=>{
 const c=setup({enabled:false});const r=await invoke({source_document_id:'s'});assert.equal(r.data.status,'complete');assert.equal(r.data.llm_calls,0);
 assert.equal((await invoke({source_document_id:'s'})).data.skipped,true);assert.equal(c.parses,1);assert.equal(c.research,0);
});
test('automatic scan is bounded, without LLM use; manual requests require stable source id',async()=>{
 const c=setup();assert.equal((await invoke({automatic:true})).data.sources_checked,0);assert.equal(c.scans,1);assert.equal(c.research,0);
 assert.equal((await invoke({})).status,400);
});
