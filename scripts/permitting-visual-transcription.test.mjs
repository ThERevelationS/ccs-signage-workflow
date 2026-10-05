import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {retainSourceOcrEvidence} from '../base44/shared/permittingSourceOcrEvidence.mjs';
import {retainVisualTranscription,readVisualTranscription} from '../base44/shared/permittingVisualTranscription.mjs';
const clone=x=>structuredClone(x),sha='a'.repeat(64),actor={role:'admin',email:'admin@example.com'};
async function setup(){
 let row={id:'s',updated_date:'v1',archived_file_url:'https://files.example/scan.pdf',file_hash_sha256:sha,file_bytes:123,
  extracted_text:'No embedded text',extracted_pages:[{page:1,text:'',source_document_id:'s',source_sha256:sha,needs_ocr_review:true,truncated:false}],
  text_extraction_state:{status:'needs_ocr',source_sha256:sha,archived_file_url:'https://files.example/scan.pdf',total_pages:1,needs_ocr_pages:[1],complete_document_text:false},
  authority_review:{unchanged:true},derived_facts:{unchanged:true},content_status:'draft',verification_status:'needs_verification'};
 const page=clone(row.extracted_pages);let writes=0,parses=0;
 const e={entity:{get:async()=>clone(row),updateMany:async(q,u)=>{writes++;if(q.updated_date!==row.updated_date)return {updated:0};row={...row,...clone(u.$set),updated_date:'v'+(writes+1)};return {updated:1};}},
  sourceDocumentId:'s',actor,readAndExtract:async()=>{parses++;return {total_pages:1,pages:clone(page)};},
  now:()=>Date.parse('2026-10-05T14:00:00Z'),get row(){return clone(row)},set row(s){row=clone(s)},get writes(){return writes},get parses(){return parses}};
 const o=await retainSourceOcrEvidence({...e,body:{request_id:'original-ocr-request-001',source_sha256:sha,expected_updated_date:'v1',page:1,
  text:'Please illustrate all buildings, 1 & structures',method:'tesseract',extracted_at:'2026-10-05T13:00:00Z'}});
 e.body={request_id:'visual-transcription-001',source_sha256:sha,expected_updated_date:e.row.updated_date,ocr_record_key:o.record.record_key,
  render:{sha256:'b'.repeat(64),method:'pdftoppm-200dpi-png',width:1700,height:2200},
  spans:[{text:'Please illustrate all buildings, structures, streets and alleys on the lot.',kind:'instruction_excerpt',
   region_label:'bottom left instruction',region:[0.12,0.78,0.34,0.09]}]};
 return e;
}
const retain=e=>retainVisualTranscription(e);
test('corrected visual text is retained separately with pending review, preserving original noisy OCR',async()=>{
 const e=await setup(),before=e.row,r=await retain(e);assert.equal(r.status,'pending_staff_review');
 assert.equal(r.authority_established,false);assert.equal(r.complete_document_text,false);assert.equal(r.record.coverage,'selected_excerpts_only');
 const after=e.row;delete after.updated_date;delete after.ocr_transcriptions;delete before.updated_date;assert.deepEqual(after,before);
 assert.equal(e.row.ocr_evidence[0].text,'Please illustrate all buildings, 1 & structures');assert.equal(e.parses,2);
});
test('same candidate request reconciles without another write or PDF read',async()=>{const e=await setup(),r=await retain(e);const again=await retain(e);assert.equal(again.reconciled,true);assert.deepEqual(again.record,r.record);assert.equal(e.writes,2);assert.equal(e.parses,2);});
test('edited transcription cannot reuse the request identity',async()=>{const e=await setup();await retain(e);e.body.spans[0].text+=' edited';await assert.rejects(retain(e),/different transcription/);assert.equal(e.writes,2);});
test('different submitting actor cannot reuse the request identity',async()=>{const e=await setup();await retain(e);e.actor={role:'admin',email:'other@example.com'};await assert.rejects(retain(e),/different transcription/);});
for(const [name,edit,pattern] of [
 ['staff retention',e=>{e.actor={role:'user',email:'staff@example.com'};},/Admin/],
 ['missing OCR anchor',e=>{e.body.ocr_record_key='c'.repeat(64);},/missing/],
 ['wrong source hash',e=>{e.body.source_sha256='d'.repeat(64);},/snapshot/],
 ['stale version',e=>{e.body.expected_updated_date='old';},/changed since/],
 ['pinned text',e=>{const r=e.row;r.text_extraction_pinned=true;e.row=r;},/protected/],
 ['empty excerpt',e=>{e.body.spans[0].text=' ';},/excerpt/],
 ['oversized excerpt',e=>{e.body.spans[0].text='x'.repeat(1001);},/excerpt/],
 ['empty regions',e=>{e.body.spans=[];},/one to five/],
 ['excess regions',e=>{e.body.spans=Array(6).fill(e.body.spans[0]);},/one to five/],
 ['negative region',e=>{e.body.spans[0].region=[-0.1,0,0.1,0.1];},/normalized/],
 ['region beyond page',e=>{e.body.spans[0].region=[0.9,0.9,0.2,0.2];},/normalized/],
 ['zero-width region',e=>{e.body.spans[0].region=[0,0,0,0.1];},/normalized/],
 ['unbounded region',e=>{e.body.spans[0].region=[0,0,Infinity,0.1];},/normalized/],
 ['unsupported regulatory limit kind',e=>{e.body.spans[0].kind='adopted_setback';},/excerpt/],
 ['missing render hash',e=>{e.body.render.sha256='invalid';},/render receipt/],
 ['unbounded render size',e=>{e.body.render.width=20001;},/render receipt/],
])test(name+' refuses candidate without new writes',async()=>{const e=await setup();edit(e);await assert.rejects(retain(e),pattern);assert.equal(e.writes,1);assert.equal(e.parses,1);});
test('caller cannot promote a candidate by passing approval or full-page flags',async()=>{const e=await setup();e.body.review_status='approved';e.body.coverage='complete_document';e.body.observation_kind='staff_approved';const r=await retain(e);assert.equal(r.record.review_status,'pending_staff_review');assert.equal(r.record.coverage,'selected_excerpts_only');assert.equal(r.record.observation_kind,'agent_visual_transcription');});
for(const [name,edit] of [
 ['archive',r=>{r.file_hash_sha256='c'.repeat(64);}],
 ['original OCR',r=>{r.ocr_evidence[0].text+='staff change';}],
 ['pin',r=>{r.text_extraction_pinned=true;}],
 ['text extraction state',r=>{r.text_extraction_state.status='newer';}],
 ['another candidate',r=>{r.ocr_transcriptions=[];}],
 ['source version',r=>{r.updated_date='newer';}],
])test('concurrent '+name+' change during PDF verification is preserved',async()=>{const e=await setup(),parse=e.readAndExtract;e.readAndExtract=async a=>{const p=await parse(a),r=e.row;edit(r);e.row=r;return p;};await assert.rejects(retain(e),/changed during/);assert.equal(e.writes,1);});
test('fresh PDF page identity mismatch does not retain transcription',async()=>{const e=await setup();e.readAndExtract=async()=>({total_pages:1,pages:[{page:2}]});await assert.rejects(retain(e),/physical PDF/);assert.equal(e.writes,1);});
test('conditional loser does not retry writes or claim success',async()=>{const e=await setup();let n=0;e.entity.updateMany=async()=>{n++;return {updated:0};};await assert.rejects(retain(e),/conflicted/);assert.equal(n,1);});
test('lost write acknowledgment reconciles exact candidate receipt',async()=>{const e=await setup(),write=e.entity.updateMany;e.entity.updateMany=async(q,u)=>{await write(q,u);throw Error('lost response');};const r=await retain(e);assert.equal(r.reconciled,true);assert.equal(e.writes,2);});
test('unknown write outcome without saved evidence cannot report success',async()=>{const e=await setup();e.entity.updateMany=async()=>({});await assert.rejects(retain(e),/unknown/);});
test('exact citation can use corrected text without pretending it was original OCR',async()=>{const e=await setup(),r=await retain(e);const out=await readVisualTranscription({source:e.row,recordKey:r.record.record_key,spanIndex:1,excerpt:'structures, streets and alleys'});assert.equal(out.citation.evidence_kind,'visual_transcription_candidate');assert.equal(out.citation.page,1);assert.equal(out.citation.review_status,'pending_staff_review');assert.equal(out.citation.authority_established,false);assert.deepEqual(out.citation.region,e.body.spans[0].region);});
test('fabricated text, cross-span text and out-of-range spans are rejected',async()=>{const e=await setup(),r=await retain(e);for(const x of [{spanIndex:0,excerpt:'Please'},{spanIndex:2,excerpt:'Please'},{spanIndex:1,excerpt:'invented'}])await assert.rejects(readVisualTranscription({source:e.row,recordKey:r.record.record_key,...x}),/exact excerpt/);});
test('request readback needs no write',async()=>{const e=await setup();await retain(e);const r=await readVisualTranscription({source:e.row,requestId:e.body.request_id});assert.equal(r.record.request_id,e.body.request_id);assert.equal(e.writes,2);});
for(const field of ['spans','render','review_status','ocr_record_sha256','submitted_by'])test('tampered '+field+' refuses evidence reading',async()=>{const e=await setup(),r=await retain(e),s=e.row;const p=s.ocr_transcriptions[0];if(field==='spans')p.spans[0].text+='edited';else if(field==='render')p.render.width++;else p[field]+='changed';await assert.rejects(readVisualTranscription({source:s,recordKey:r.record.record_key}),/integrity|metadata|different OCR/);});
test('changed OCR anchor cannot validate an older transcription',async()=>{const e=await setup(),r=await retain(e),s=e.row;s.ocr_evidence[0].text+='changed';await assert.rejects(readVisualTranscription({source:s,recordKey:r.record.record_key}),/OCR evidence integrity/);});
test('receipt bound preserves all earlier candidates',async()=>{const e=await setup();for(let i=0;i<5;i++){e.body.request_id='visual-transcription-'+i;e.body.expected_updated_date=e.row.updated_date;await retain(e);}assert.equal(e.row.ocr_transcriptions.length,5);e.body.request_id='visual-transcription-extra';e.body.expected_updated_date=e.row.updated_date;await assert.rejects(retain(e),/bound reached/);assert.equal(e.writes,6);});
test('schema keeps transcription pending and original OCR unreviewed with existing RLS',async()=>{const s=JSON.parse(await readFile('base44/entities/PermittingSourceDocument.jsonc','utf8'));assert.deepEqual(s.properties.ocr_transcriptions.items.properties.review_status.enum,['pending_staff_review']);assert.deepEqual(s.properties.ocr_evidence.items.properties.review_status.enum,['unreviewed']);assert.deepEqual(s.rls.update,{user_condition:{role:'admin'}});});
