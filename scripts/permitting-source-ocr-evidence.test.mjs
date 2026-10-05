import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {retainSourceOcrEvidence,readSourceOcrEvidence,OCR_MAX_RECORDS} from '../base44/shared/permittingSourceOcrEvidence.mjs';
const clone=x=>structuredClone(x), sha='a'.repeat(64), actor={role:'admin',email:'admin@example.com'};
function setup() {
 const source={id:'s',updated_date:'v1',archived_file_url:'https://files.example/scan.pdf',file_hash_sha256:sha,file_bytes:123,
  extracted_text:'[Page 1] no text',extracted_pages:[{page:1,source_document_id:'s',source_sha256:sha,text:'',needs_ocr_review:true,truncated:false}],
  text_extraction_state:{status:'needs_ocr',source_sha256:sha,archived_file_url:'https://files.example/scan.pdf',total_pages:1,needs_ocr_pages:[1],complete_document_text:false},
  content_status:'draft',verification_status:'needs_verification',authority_review:{preserve:true},derived_facts:{preserve:true}};
 let row=clone(source),writes=0,parses=0;
 const env={source,entity:{get:async()=>clone(row),updateMany:async(q,u)=>{
  writes++;if(q.updated_date!==row.updated_date)return {updated:0};
  row={...row,...clone(u.$set),updated_date:'v'+(writes+1)};return {updated:1};
 }},readAndExtract:async()=>{parses++;return {total_pages:1,pages:clone(source.extracted_pages)};},
 body:{request_id:'ocr-retention-request-001',source_sha256:sha,expected_updated_date:'v1',page:1,
  text:'SITE PLAN INFORMATION\nAll site plans must be drawn to scale!',method:'tesseract-5.3.4-eng-200dpi',extracted_at:'2026-10-05T13:00:00Z'},
 actor,now:()=>Date.parse('2026-10-05T14:00:00Z'),sourceDocumentId:'s',
 get row(){return clone(row)},set row(v){row=clone(v)},get writes(){return writes},get parses(){return parses}};
 return env;
}
const retain=e=>retainSourceOcrEvidence(e);
test('retention verifies physical archive page and changes only isolated OCR field',async()=>{
 const e=setup(),r=await retain(e);assert.equal(e.parses,1);assert.equal(e.writes,1);
 assert.equal(r.record.review_status,'unreviewed');assert.equal(r.authority_established,false);assert.equal(r.complete_document_text,false);
 const after=e.row;delete after.updated_date;delete after.ocr_evidence;const before=clone(e.source);delete before.updated_date;assert.deepEqual(after,before);
});
test('retry after successful retention reconciles same actor/payload despite stale expected version',async()=>{
 const e=setup();const first=await retain(e),second=await retain(e);assert.deepEqual(first.record,second.record);assert.equal(second.reconciled,true);assert.equal(e.writes,1);assert.equal(e.parses,1);
});
test('same request cannot retain edited text or a different actor',async()=>{
 const e=setup();await retain(e);e.body.text+=' edited';await assert.rejects(retain(e),/different OCR/);
 e.body.text=e.row.ocr_evidence[0].text;e.actor={role:'admin',email:'other@example.com'};await assert.rejects(retain(e),/different OCR/);assert.equal(e.writes,1);
});
test('non-admin actor cannot retain or trigger archive fetching',async()=>{
 const e=setup();e.actor={role:'user',email:'staff@example.com'};await assert.rejects(retain(e),/Admin/);assert.equal(e.parses,0);assert.equal(e.writes,0);
});
for(const [name,mutate,pattern] of [
 ['pinned text',e=>{const s=e.row;s.text_extraction_pinned=true;e.row=s;},/protected/],
 ['wrong snapshot hash',e=>{e.body.source_sha256='b'.repeat(64);},/hash differs/],
 ['stale preview',e=>{e.body.expected_updated_date='old';},/changed since/],
 ['page zero',e=>{e.body.page=0;},/physical PDF/],
 ['page beyond document',e=>{e.body.page=2;},/physical PDF/],
 ['page without OCR flag',e=>{const s=e.row;s.extracted_pages[0].needs_ocr_review=false;e.row=s;},/provenance/],
 ['state bound to prior archive',e=>{const s=e.row;s.text_extraction_state.source_sha256='b'.repeat(64);e.row=s;},/physical PDF/],
 ['invalid request',e=>{e.body.request_id='short';},/stable request/],
 ['empty OCR',e=>{e.body.text=' ';},/bounded OCR/],
 ['oversized OCR',e=>{e.body.text='x'.repeat(30001);},/bounded OCR/],
 ['missing method',e=>{e.body.method='';},/method/],
 ['invalid extraction date',e=>{e.body.extracted_at='not-a-date';},/extraction date/],
])test(name+' blocks retention without writes',async()=>{const e=setup();mutate(e);await assert.rejects(retain(e),pattern);assert.equal(e.writes,0);assert.equal(e.parses,0);});
test('archive verification failure never writes OCR',async()=>{const e=setup();e.readAndExtract=async()=>{throw Error('Hash mismatch');};await assert.rejects(retain(e),/Hash/);assert.equal(e.writes,0);});
for(const [name,edit] of [['page',p=>{p.pages[0].page=2;}],['hash',p=>{p.pages[0].source_sha256='b'.repeat(64);}],['page count',p=>{p.total_pages=2;}],['no gap',p=>{p.pages[0].needs_ocr_review=false;}],['truncated',p=>{p.pages[0].truncated=true;}]])
 test('fresh parser '+name+' conflict never writes',async()=>{const e=setup();e.readAndExtract=async()=>{const p={total_pages:1,pages:clone(e.source.extracted_pages)};edit(p);return p;};await assert.rejects(retain(e),/does not match/);assert.equal(e.writes,0);});
for(const [name,edit] of [['pin',r=>{r.text_extraction_pinned=true;}],['archive',r=>{r.file_hash_sha256='b'.repeat(64);}],['text',r=>{r.extracted_text='staff edit';}],['OCR',r=>{r.ocr_evidence=[];}],['unrelated version',r=>{r.updated_date='v-new';}]])
 test('concurrent '+name+' edit during verification is preserved',async()=>{const e=setup();e.readAndExtract=async()=>{const r=e.row;edit(r);e.row=r;return {total_pages:1,pages:clone(e.source.extracted_pages)};};await assert.rejects(retain(e),/changed during/);assert.equal(e.writes,0);});
test('conditional conflict does not blind-retry',async()=>{const e=setup();let n=0;e.entity.updateMany=async()=>{n++;return {updated:0};};await assert.rejects(retain(e),/conflicted/);assert.equal(n,1);});
test('unknown write result without a saved record does not report success',async()=>{const e=setup();e.entity.updateMany=async()=>({});await assert.rejects(retain(e),/unknown/);});
test('lost write response with exact saved OCR reconciles once',async()=>{
 const e=setup(),write=e.entity.updateMany;e.entity.updateMany=async(q,u)=>{await write(q,u);throw Error('lost response');};
 const r=await retain(e);assert.equal(r.reconciled,true);assert.equal(e.writes,1);
});
test('lost write response plus newer archive cannot report retained current evidence',async()=>{
 const e=setup(),write=e.entity.updateMany;e.entity.updateMany=async(q,u)=>{await write(q,u);const s=e.row;s.file_hash_sha256='b'.repeat(64);e.row=s;throw Error('lost response');};
 await assert.rejects(retain(e),/lost response/);assert.equal(e.writes,1);
});
test('exact unreviewed OCR citation exposes method and physical page without authority',async()=>{
 const e=setup(),r=await retain(e);const out=await readSourceOcrEvidence({source:e.row,recordKey:r.record.record_key,excerpt:'All site plans must be drawn to scale!'});
 assert.equal(out.citation.page,1);assert.equal(out.citation.evidence_kind,'unreviewed_ocr');assert.equal(out.citation.authority_established,false);
 await assert.rejects(readSourceOcrEvidence({source:e.row,recordKey:r.record.record_key,excerpt:'Invented text'}),/exact bounded/);
});
test('request receipt can be read without re-retaining',async()=>{const e=setup();await retain(e);const r=await readSourceOcrEvidence({source:e.row,requestId:e.body.request_id});assert.equal(r.record.request_id,e.body.request_id);assert.equal(e.writes,1);});
for(const field of ['text','method','requested_by','retained_at','review_status'])
 test('tampered '+field+' fails OCR evidence reading',async()=>{const e=setup(),r=await retain(e);const s=e.row;s.ocr_evidence[0][field]+='changed';await assert.rejects(readSourceOcrEvidence({source:s,recordKey:r.record.record_key}),/integrity|metadata/);});
test('stale archive refuses OCR reading',async()=>{const e=setup(),r=await retain(e),s=e.row;s.archived_file_url+='changed';await assert.rejects(readSourceOcrEvidence({source:s,recordKey:r.record.record_key}),/different archive/);});
test('duplicate stored receipt identities stop extension',async()=>{const e=setup();await retain(e);const s=e.row;s.ocr_evidence.push(clone(s.ocr_evidence[0]));e.row=s;e.body.request_id='ocr-retention-request-002';e.body.expected_updated_date=s.updated_date;await assert.rejects(retain(e),/duplicate identities/);assert.equal(e.writes,1);});
test('bounded retention preserves all five earlier receipts',async()=>{
 const e=setup();for(let i=0;i<OCR_MAX_RECORDS;i++){e.body.request_id='ocr-retention-request-'+String(i).padStart(3,'0');e.body.expected_updated_date=e.row.updated_date;await retain(e);}
 assert.equal(e.row.ocr_evidence.length,5);e.body.request_id='ocr-retention-request-999';e.body.expected_updated_date=e.row.updated_date;await assert.rejects(retain(e),/bound reached/);assert.equal(e.writes,5);
});
test('schema adds isolated OCR evidence without expanding RLS or authority status',async()=>{
 const schema=JSON.parse(await readFile('base44/entities/PermittingSourceDocument.jsonc','utf8'));
 assert.equal(schema.properties.ocr_evidence.maxItems,5);assert.deepEqual(schema.properties.ocr_evidence.items.properties.review_status.enum,['unreviewed']);
 assert.deepEqual(schema.rls.update,{user_condition:{role:'admin'}});assert.deepEqual(schema.rls.delete,{user_condition:{role:'admin'}});
});
test('backend entry bundles with staff RLS reads and admin-only mutations',async()=>{
 const entry=await readFile('base44/functions/permittingSourceOcrEvidence/entry.ts','utf8');
 assert.match(entry,/entity=base44.entities.PermittingSourceDocument/);assert.match(entry,/user.role!=='admin'/);
 const result=await build({entryPoints:['base44/functions/permittingSourceOcrEvidence/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',external:['npm:*']});
 assert.ok(result.outputFiles[0].text.includes('Deno.serve'));
});

test('HTTP handler blocks unauthenticated/admin-only actions and keeps staff reads under caller RLS',async()=>{
 let handler,activeClient;const previousDeno=globalThis.Deno,previousClient=globalThis.__ocrTestClient;
 globalThis.Deno={serve:fn=>{handler=fn;}};
 const b=await build({entryPoints:['base44/functions/permittingSourceOcrEvidence/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',plugins:[{name:'test-sdk',setup(b){
 b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'stub'}));
 b.onResolve({filter:/jurisdictionSourceTextRuntime\.ts$/},()=>({path:'runtime',namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='sdk'?'export const createClientFromRequest=()=>globalThis.__ocrTestClient;':'export const readAndExtractSourcePdf=async()=>{throw Error("Runtime should not execute for staff reads");};',loader:'js'}));
 }}]});
 try {
 await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
 const call=async(user,body)=>{
 globalThis.__ocrTestClient={auth:{me:async()=>user},entities:{PermittingSourceDocument:activeClient?.entity},
 asServiceRole:{get entities(){throw Error('Staff reached service role');}}};
 return handler(new Request('https://example.test/ocr',{method:'POST',body:JSON.stringify(body)}));
 };
 assert.equal((await call(null,{action:'read',source_document_id:'s'})).status,403);
 const user={role:'user',email:'staff@example.com'};
 for(const action of ['retain','preview'])assert.equal((await call(user,{action,source_document_id:'s'})).status,403);
 assert.equal((await call(user,{action:'approve',source_document_id:'s'})).status,400);
 activeClient=setup();const retained=await retain(activeClient);
 const response=await call(user,{action:'read',source_document_id:'s',record_key:retained.record.record_key});
 assert.equal(response.status,200);assert.equal((await response.json()).record.review_status,'unreviewed');
 const citation=await call(user,{action:'cite',source_document_id:'s',record_key:retained.record.record_key,excerpt:'invented'});
 assert.equal(citation.status,409);assert.equal(activeClient.writes,1);
 }finally{globalThis.Deno=previousDeno;globalThis.__ocrTestClient=previousClient;}
});
