import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {PDF_TEXT_METHOD,assembledSourceText,textSha256} from '../base44/shared/jurisdictionSourcePdfText.mjs';
const built=await build({entryPoints:['base44/functions/getPermittingSourceTextPages/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',
 plugins:[{name:'auth-boundary',setup(b){b.onResolve({filter:/^npm:@base44\\/sdk/},()=>({path:'sdk',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.pageFixture;',loader:'js'}));}}]});
let handler;globalThis.Deno={serve:fn=>{handler=fn;}};
await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const hash='a'.repeat(64);
async function setup(role='user') {
 const text='Official evidence page retained for review.';
 const source={id:'s',archived_file_url:'https://storage.test/a.pdf',file_hash_sha256:hash,file_bytes:1000,
  authority_classification:'unknown_review_required',content_status:'unknown',verification_status:'needs_verification',
  extracted_pages:[{page:1,text,source_document_id:'s',source_sha256:hash,text_sha256:await textSha256(new TextEncoder().encode(text)),
  method:PDF_TEXT_METHOD,truncated:false,needs_ocr_review:false}],
  text_extraction_state:{status:'complete',method:PDF_TEXT_METHOD,source_sha256:hash,archived_file_url:'https://storage.test/a.pdf',
   total_pages:1,pages_extracted:1,next_page:2,complete_document_text:true}};
 source.extracted_text=assembledSourceText(source,source.extracted_pages);
 const calls={reads:0,segments:0};
 globalThis.pageFixture={auth:{me:async()=>role?{role}:null},entities:{
  PermittingSourceDocument:{get:async()=>{calls.reads++;return structuredClone(source);}},
  PermittingSourceTextSegment:{filter:async()=>{calls.segments++;throw Error('Unexpected segment scan');}}}};
 return{source,calls};
}
const invoke=async body=>{const r=await handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}));return{status:r.status,data:await r.json()};};
test('page endpoint denies anonymous/unknown roles before evidence reads',async()=>{
 for(const role of [null,'external']){const f=await setup(role);assert.equal((await invoke({source_document_id:'s'})).status,403);assert.equal(f.calls.reads,0);}
});
test('staff page endpoint uses caller RLS and returns exact snapshot without authority promotion',async()=>{
 const f=await setup();const r=await invoke({source_document_id:'s',start_page:1,page_count:1});
 assert.equal(r.status,200);assert.equal(r.data.pages[0].source_sha256,hash);assert.equal(r.data.authority_classification,'unknown_review_required');
 assert.equal(r.data.content_status,'unknown');assert.equal(r.data.verification_status,'needs_verification');assert.equal(r.data.llm_calls,0);
 assert.equal(f.calls.reads,2);assert.equal(f.calls.segments,0);assert.equal(globalThis.pageFixture.asServiceRole,undefined);
});
test('endpoint rejects broad/invalid page ranges and requires source identity',async()=>{
 const f=await setup();for(const body of [{},{source_document_id:'s',page_count:6},{source_document_id:'s',start_page:0},{source_document_id:'s',start_page:'1'}])
 assert.equal((await invoke(body)).status,400);assert.equal(f.calls.reads,0);
});
test('concurrent source snapshot replacement returns conflict instead of stale evidence',async()=>{
 const f=await setup();globalThis.pageFixture.entities.PermittingSourceDocument.get=async()=>{
  const row=structuredClone(f.source);if(++f.calls.reads>1)row.file_hash_sha256='b'.repeat(64);return row;};
 assert.equal((await invoke({source_document_id:'s'})).status,409);
});
test('legacy rule extraction explicitly skips partial text and segmented previews',async()=>{
 const code=await readFile('base44/functions/permittingRuleExtraction/entry.ts','utf8');
 assert.match(code,/"text_extraction_state"/);assert.match(code,/textState.preview_only \|\| textState.storage_mode \|\| textState.complete_document_text !== true/);
});
