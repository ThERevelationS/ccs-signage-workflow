import test from 'node:test';
import assert from 'node:assert/strict';
import { extractKnownSourceText, continueSourceTextBacklog, sourceTextEligible, sourceTextBacklogQuery } from '../base44/shared/jurisdictionSourceTextContinuation.mjs';
import { PDF_TEXT_METHOD, PDF_TEXT_MAX_TOTAL_CHARS, assembledSourceText } from '../base44/shared/jurisdictionSourcePdfText.mjs';
const hash='a'.repeat(64);
const source={id:'s',jurisdiction_id:'j',title:'Application',source_registration_key:'key',archived_file_url:'https://storage.test/a.pdf',
 file_hash_sha256:hash,file_bytes:500,authority_classification:'application_form',content_status:'unknown',verification_status:'needs_verification',notes_gaps:'keep',reviewer:'Staff'};
function fixture({pages=7,fail=false,lostWrite=false,blank=false,row={}}={}) {
 let version=1,record={...source,...row,updated_date:'v1'},time=Date.parse('2026-10-04T14:00:00Z');const calls={parses:0,writes:0,scans:0,starts:[]};
 const entity={get:async()=>structuredClone(record),filter:async(q,s,l)=>{assert.equal(l,20);assert.equal(s,'updated_date');assert.ok(q.source_registration_key);calls.scans++;return[structuredClone(record)];},
 updateMany:async(q,p)=>{if(q.updated_date!==record.updated_date)return{updated:0};record={...record,...p.$set,updated_date:'v'+(++version)};calls.writes++;if(lostWrite){lostWrite=false;throw Error('lost acknowledgement');}return{updated:1};}};
 const api={entity,sourceDocumentId:'s',now:()=>time,readAndExtract:async({source,startPage})=>{
 calls.parses++;calls.starts.push(startPage);if(fail)throw Error('parse failure');
 const end=Math.min(pages,startPage+4);return{total_pages:pages,next_page:end+1,pages:Array.from({length:end-startPage+1},(_,i)=>({
 page:startPage+i,text:blank?'':'Document text page '+(startPage+i)+' from retained archive.',source_document_id:source.id,source_sha256:hash,method:PDF_TEXT_METHOD,text_sha256:'b'.repeat(64),truncated:false,needs_ocr_review:blank}))};}};
 return{api,calls,record:()=>record,patch:p=>{record={...record,...p,updated_date:'v'+(++version)};},advance:()=>{time+=4*60*60_000;},recover:()=>{fail=false;}};
}
test('extracts five pages, resumes remaining pages, preserves source and authority, and redelivery skips',async()=>{
 const f=fixture();assert.equal((await extractKnownSourceText(f.api)).status,'partial');assert.equal(f.record().extracted_pages.length,5);
 const r=await extractKnownSourceText(f.api);assert.equal(r.status,'complete');assert.equal(r.pages_processed,2);assert.deepEqual(f.calls.starts,[1,6]);
 assert.equal((await extractKnownSourceText(f.api)).skipped,true);assert.equal(f.calls.parses,2);
 for(const [k,v] of Object.entries(source))assert.deepEqual(f.record()[k],v);
 assert.match(f.record().extracted_text,/PDF page 7/);assert.equal(f.record().text_extraction_state.complete_document_text,true);
});
test('concurrent workers can claim only one extraction chunk',async()=>{
 const f=fixture();await Promise.allSettled([extractKnownSourceText({...f.api,token:'a'}),extractKnownSourceText({...f.api,token:'b'})]);assert.equal(f.calls.parses,1);
});
test('retry backoff stops automatic parse failures after three; explicit manual retry can recover',async()=>{
 const f=fixture({fail:true});
 for(let i=0;i<3;i++){await extractKnownSourceText(f.api);f.advance();}
 assert.equal(f.record().text_extraction_state.status,'blocked');assert.equal((await extractKnownSourceText(f.api)).skipped,true);
 f.recover();assert.equal((await extractKnownSourceText({...f.api,automatic:false})).status,'partial');assert.equal(f.calls.parses,4);
});
test('blank text pages retain archive, page provenance, and OCR gap instead of pretending complete',async()=>{
 const f=fixture({pages:2,blank:true});const r=await extractKnownSourceText(f.api);assert.equal(r.status,'needs_ocr');assert.deepEqual(f.record().text_extraction_state.needs_ocr_pages,[1,2]);
 assert.equal(f.record().archived_file_url,source.archived_file_url);assert.equal(f.record().text_extraction_state.complete_document_text,false);
 assert.equal((await extractKnownSourceText(f.api)).skipped,true);
});
test('existing unowned or pinned staff text is never replaced, even manually',async()=>{
 for(const row of [{extracted_text:'Manual text'},{extracted_pages:[{page:1,text:'Staff evidence'}]},{text_extraction_pinned:true}]){
  const f=fixture({row});assert.equal((await extractKnownSourceText({...f.api,automatic:false})).skipped,true);assert.equal(f.calls.parses,0);
 }
});
test('legacy sources require a selected manual target; existing Boone-like text remains protected',async()=>{
 const f=fixture({row:{source_registration_key:null}});assert.equal((await extractKnownSourceText(f.api)).skipped,true);
 assert.equal((await extractKnownSourceText({...f.api,automatic:false})).status,'partial');
 const b=fixture({row:{source_registration_key:null,extracted_text:'Adopted Boone section'}});assert.equal((await extractKnownSourceText({...b.api,automatic:false})).skipped,true);
});
test('authority notes arriving while parsing survive the conditional text write',async()=>{
 const f=fixture();const parse=f.api.readAndExtract;f.api.readAndExtract=async args=>{f.patch({notes_gaps:'concurrent review',reviewer:'Other Staff'});return parse(args);};
 assert.equal((await extractKnownSourceText(f.api)).status,'partial');assert.equal(f.record().notes_gaps,'concurrent review');assert.equal(f.record().reviewer,'Other Staff');
});
test('a manual text edit during parse prevents overwrite and later automatic continuation',async()=>{
 const f=fixture();const parse=f.api.readAndExtract;f.api.readAndExtract=async args=>{f.patch({extracted_text:'Staff override'});return parse(args);};
 assert.equal((await extractKnownSourceText(f.api)).status,'receipt_conflict');assert.equal(f.record().extracted_text,'Staff override');
 f.advance();assert.equal(sourceTextEligible(f.record(),{now:f.api.now()}),false);
});
test('archive replacement or pinning during parse prevents attachment of stale text',async()=>{
 for(const change of [{file_hash_sha256:'c'.repeat(64)},{text_extraction_pinned:true}]){
  const f=fixture();const parse=f.api.readAndExtract;f.api.readAndExtract=async args=>{f.patch(change);return parse(args);};
  assert.equal((await extractKnownSourceText(f.api)).status,'receipt_conflict');assert.equal(f.record().extracted_text,undefined);
 }
});
test('lost conditional write acknowledgement is recovered without another parse',async()=>{
 const f=fixture({pages:2,lostWrite:true});assert.equal((await extractKnownSourceText(f.api)).status,'complete');assert.equal(f.calls.parses,1);
});
test('expired lease safely resumes durable page cursor while active lease is skipped',async()=>{
 const f=fixture();await extractKnownSourceText(f.api);f.patch({text_extraction_state:{...f.record().text_extraction_state,status:'running',lease_expires_at:'2030-01-01T00:00:00Z'}});
 assert.equal((await extractKnownSourceText(f.api)).skipped,true);
 f.patch({text_extraction_state:{...f.record().text_extraction_state,lease_expires_at:'2020-01-01T00:00:00Z'}});
 assert.equal((await extractKnownSourceText(f.api)).status,'complete');assert.deepEqual(f.calls.starts,[1,6]);
});
test('invalid parser provenance is blocked and retained prior pages are not removed',async()=>{
 const f=fixture();await extractKnownSourceText(f.api);const before=structuredClone(f.record().extracted_pages);
 f.api.readAndExtract=async()=>({total_pages:7,next_page:7,pages:[{page:6,text:'wrong',method:PDF_TEXT_METHOD,source_sha256:'wrong',source_document_id:'s'}]});
 assert.equal((await extractKnownSourceText(f.api)).status,'blocked');assert.deepEqual(f.record().extracted_pages,before);
});
test('text storage/page truncation is explicit, retained, and excluded from automatic retry',async()=>{
 const f=fixture({pages:1});const parse=f.api.readAndExtract;f.api.readAndExtract=async args=>{const r=await parse(args);r.pages[0].truncated=true;return r;};
 assert.equal((await extractKnownSourceText(f.api)).status,'partial_limit');assert.equal(f.record().extracted_pages.length,1);
 const g=fixture({pages:1});g.api.readAndExtract=async({source})=>({total_pages:1,next_page:2,pages:[{page:1,text:'x'.repeat(PDF_TEXT_MAX_TOTAL_CHARS),method:PDF_TEXT_METHOD,source_sha256:hash,source_document_id:source.id}]});
 assert.equal((await extractKnownSourceText(g.api)).status,'partial_limit');assert.equal(g.record().text_extraction_state.next_page,1);
});
test('bounded backlog selects one source and has no research/whole-jurisdiction work',async()=>{
 const f=fixture();assert.equal((await continueSourceTextBacklog(f.api)).pages_processed,5);assert.equal(f.calls.scans,1);assert.equal(f.calls.parses,1);
 assert.ok(sourceTextBacklogQuery().file_hash_sha256);assert.ok(sourceTextBacklogQuery()['text_extraction_state.status'].$nin.includes('needs_ocr'));
});
test('reviewed edits to previously extracted text are preserved across continuation',async()=>{
 const f=fixture();await extractKnownSourceText(f.api);f.patch({extracted_text:'Reviewed text'});
 assert.equal((await extractKnownSourceText({...f.api,automatic:false})).skipped,true);assert.equal(f.calls.parses,1);
 assert.notEqual(f.record().extracted_text,assembledSourceText(f.record(),f.record().extracted_pages));
});

test('automatic guard skips protected profiles and checks exact retained archive/catalog identity',async()=>{
 const {automaticSourceTextGuard}=await import('../base44/shared/jurisdictionSourceTextContinuation.mjs');
 const row={...source,jurisdiction_profile_doc_id:'d'};
 const doc={id:'d',source:'ai_discovered',file_url:source.archived_file_url,source_sha256:hash,stored_sha256:hash,source_bytes:500,stored_bytes:500,archive_state:{status:'complete'},catalog_state:{status:'complete',source_document_id:'s'}};
 let profile={id:'j',documents:[doc]};
 const guard=automaticSourceTextGuard({get:async()=>profile});assert.equal(await guard(row),true);
 for(const patch of [{auto_refresh:false},{_manual_documents:true},{documents:[{...doc,pinned:true}]},{documents:[{...doc,stored_sha256:'wrong'}]},{documents:[{...doc,catalog_state:{status:'complete',source_document_id:'other'}}]}]){
  profile={id:'j',documents:[doc],...patch};assert.equal(await guard(row),false);
 }
});
test('profile opt-out before or during parse prevents automatic text attachment',async()=>{
 const f=fixture();assert.equal((await extractKnownSourceText({...f.api,canAutomaticallyExtract:async()=>false})).skipped,true);assert.equal(f.calls.parses,0);
 let checks=0;const g=fixture();const r=await extractKnownSourceText({...g.api,canAutomaticallyExtract:async()=>++checks===1});assert.equal(r.status,'failed');assert.equal(g.record().extracted_text,undefined);
});
