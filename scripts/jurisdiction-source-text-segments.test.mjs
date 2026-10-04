import test from 'node:test';
import assert from 'node:assert/strict';
import { extractKnownSourceText, sourceTextEligible, sourceTextBacklogQuery } from '../base44/shared/jurisdictionSourceTextContinuation.mjs';
import { readSourceEvidencePages, validateTextSegment } from '../base44/shared/jurisdictionSourceTextSegments.mjs';
import { PDF_TEXT_METHOD, assembledSourceText, textSha256 } from '../base44/shared/jurisdictionSourcePdfText.mjs';

const hash='a'.repeat(64);
const base={id:'s',title:'Retained code',jurisdiction_name:'County',source_registration_key:'key',
  archived_file_url:'https://storage.test/code.pdf',file_hash_sha256:hash,file_bytes:1000,
  authority_classification:'unknown_review_required',content_status:'unknown',verification_status:'needs_verification',reviewer:'Staff',notes_gaps:'keep'};
async function page(number,text='Evidence page '+number+' from retained archive.') {
  return {page:number,text,source_document_id:'s',source_sha256:hash,method:PDF_TEXT_METHOD,
    text_sha256:await textSha256(new TextEncoder().encode(text)),extracted_at:'2026-10-04T15:00:00Z',truncated:false,needs_ocr_review:false};
}
async function fixture({total=17,large=false,createMode='ok'}={}) {
  const inline=await Promise.all(Array.from({length:5},(_,i)=>page(i+1)));
  let version=1,time=Date.parse('2026-10-04T15:00:00Z'),row={...base,updated_date:'v1',extracted_pages:inline};
  row.extracted_text=assembledSourceText(row,inline);
  row.text_extraction_state={status:'partial',method:PDF_TEXT_METHOD,source_sha256:hash,archived_file_url:base.archived_file_url,
    pages_extracted:5,next_page:6,total_pages:total,complete_document_text:false};
  const rows=[],calls={parses:0,creates:0,scans:0,writes:0,starts:[]};
  let pendingData,loseFinal=false;
  const api={sourceDocumentId:'s',now:()=>time,entity:{
    get:async()=>structuredClone(row),
    updateMany:async(q,p)=>{
      if(q.updated_date!==row.updated_date)return{updated:0};
      row={...row,...p.$set,updated_date:'v'+(++version)};calls.writes++;
      if(loseFinal && p.$set.text_extraction_state.status==='partial'){loseFinal=false;throw Error('lost final acknowledgement');}
      return{updated:1};
    }},
    segmentEntity:{
      filter:async(q,s,l,skip)=>{
        calls.scans++;assert.ok(l<=6);assert.equal(skip,0);
        return structuredClone(rows.filter(r=>q.registration_key?r.registration_key===q.registration_key:
          r.source_document_id===q.source_document_id && r.source_sha256===q.source_sha256 &&
          r.page_start<=q.page_start.$lte && r.page_end>=q.page_end.$gte).slice(0,l));
      },
      create:async data=>{
        calls.creates++;pendingData=structuredClone(data);
        if(createMode==='missing')throw Error('unknown create outcome');
        const saved={...structuredClone(data),id:'seg'+(rows.length+1)};rows.push(saved);
        if(createMode==='lost')throw Error('lost create acknowledgement');
        return structuredClone(saved);
      }},
    readAndExtract:async({startPage})=>{
      calls.parses++;calls.starts.push(startPage);
      const end=Math.min(total,startPage+4);
      return {total_pages:total,next_page:end+1,pages:await Promise.all(Array.from({length:end-startPage+1},(_,i)=>
        page(startPage+i,large?'x'.repeat(49_000):'Evidence page '+(startPage+i)+' from retained archive.')))};
    }};
  return {api,calls,rows,row:()=>row,patch:p=>{row={...row,...p,updated_date:'v'+(++version)};},
    advance:()=>{time+=4*60*60_000;},lateCreate:()=>{rows.push({...pendingData,id:'late'});},loseFinal:()=>{loseFinal=true;}};
}

test('long document uses separate batches beyond 500k without growing or replacing its preview',async()=>{
  const f=await fixture({large:true});const before=structuredClone(f.row());
  for(const status of ['partial','partial','complete'])assert.equal((await extractKnownSourceText(f.api)).status,status);
  assert.deepEqual(f.calls.starts,[6,11,16]);assert.equal(f.rows.length,3);assert.ok(f.rows.reduce((n,r)=>n+r.pages.reduce((n,p)=>n+p.text.length,0),0)>500_000);
  assert.equal(f.row().extracted_text,before.extracted_text);assert.deepEqual(f.row().extracted_pages,before.extracted_pages);
  assert.equal(f.row().text_extraction_state.pages_extracted,17);assert.equal(f.row().text_extraction_state.next_page,18);
  assert.equal(f.row().text_extraction_state.preview_only,true);assert.equal(f.row().text_extraction_state.complete_document_text,true);
  for(const [key,value] of Object.entries(base))assert.deepEqual(f.row()[key],value);
  assert.equal((await extractKnownSourceText(f.api)).skipped,true);assert.equal(f.calls.creates,3);
});

test('lost create acknowledgement is reconciled once, without duplicate or extra parse',async()=>{
  const f=await fixture({createMode:'lost'});
  assert.equal((await extractKnownSourceText(f.api)).status,'partial');assert.equal(f.calls.creates,1);assert.equal(f.calls.parses,1);
  assert.equal(f.row().text_extraction_state.pending_segment,null);
});

test('uncertain missing create is quarantined and manual recovery never creates or parses again',async()=>{
  const f=await fixture({createMode:'missing'});
  assert.equal((await extractKnownSourceText(f.api)).status,'segment_uncertain');assert.equal(f.row().text_extraction_state.pages_extracted,5);
  assert.ok(f.row().text_extraction_state.pending_segment);assert.equal(sourceTextEligible(f.row()),false);
  assert.ok(sourceTextBacklogQuery()['text_extraction_state.status'].$nin.includes('segment_uncertain'));
  f.advance();assert.equal((await extractKnownSourceText({...f.api,automatic:false})).status,'segment_uncertain');
  assert.equal(f.calls.creates,1);assert.equal(f.calls.parses,1);assert.equal(f.rows.length,0);
});

test('a delayed create can be attached by explicit reconciliation with its original provenance',async()=>{
  const f=await fixture({createMode:'missing'});await extractKnownSourceText(f.api);f.lateCreate();f.advance();
  const result=await extractKnownSourceText({...f.api,automatic:false});
  assert.equal(result.reconciled,true);assert.equal(result.pages_extracted,10);assert.equal(f.calls.creates,1);assert.equal(f.calls.parses,1);
});

test('lost final receipt acknowledgement converges on the exact saved source state',async()=>{
  const f=await fixture();f.loseFinal();
  assert.equal((await extractKnownSourceText(f.api)).status,'partial');
  assert.equal(f.row().text_extraction_state.pages_extracted,10);assert.equal(f.rows.length,1);
});

test('simultaneous workers claim only one segment batch',async()=>{
  const f=await fixture();await Promise.allSettled([extractKnownSourceText({...f.api,token:'one'}),extractKnownSourceText({...f.api,token:'two'})]);
  assert.equal(f.calls.parses,1);assert.equal(f.calls.creates,1);
});

test('staff edits during parsing stop creation and preserve reviewed inline text',async()=>{
  const f=await fixture();const parse=f.api.readAndExtract;
  f.api.readAndExtract=async args=>{const r=await parse(args);f.patch({extracted_text:'Staff-maintained text'});return r;};
  assert.equal((await extractKnownSourceText(f.api)).status,'receipt_conflict');
  assert.equal(f.calls.creates,0);assert.equal(f.row().extracted_text,'Staff-maintained text');
});

test('pin/archive changes during create preserve orphan evidence and prohibit stale attachment',async()=>{
  for(const patch of [{text_extraction_pinned:true},{file_hash_sha256:'b'.repeat(64)}]) {
    const f=await fixture();const create=f.api.segmentEntity.create;
    f.api.segmentEntity.create=async data=>{const saved=await create(data);f.patch(patch);return saved;};
    assert.equal((await extractKnownSourceText(f.api)).status,'receipt_conflict');assert.equal(f.rows.length,1);
    assert.equal(f.row().text_extraction_state.pages_extracted,5);
  }
});

test('unrelated concurrent reviewer notes survive source receipt writes',async()=>{
  const f=await fixture();const parse=f.api.readAndExtract;
  f.api.readAndExtract=async args=>{f.patch({notes_gaps:'new staff notes'});return parse(args);};
  assert.equal((await extractKnownSourceText(f.api)).status,'partial');assert.equal(f.row().notes_gaps,'new staff notes');
});

test('invalid new page hashes/ranges are blocked before segment creation',async()=>{
  for(const change of [{text_sha256:'b'.repeat(64)},{page:9},{source_sha256:'b'.repeat(64)},{text:'changed without hash'}]) {
    const f=await fixture();const parse=f.api.readAndExtract;
    f.api.readAndExtract=async args=>{const r=await parse(args);Object.assign(r.pages[0],change);return r;};
    assert.equal((await extractKnownSourceText(f.api)).status,'blocked');assert.equal(f.calls.creates,0);
    assert.equal(f.row().text_extraction_state.pages_extracted,5);
  }
});

test('duplicate or changed committed segment prevents another parse and leaves all evidence intact',async()=>{
  for(const change of ['duplicate','text','identity']) {
    const f=await fixture();await extractKnownSourceText(f.api);
    if(change==='duplicate')f.rows.push({...structuredClone(f.rows[0]),id:'duplicate'});
    else if(change==='text')f.rows[0].pages[0].text='tampered';
    else f.rows[0].archived_file_url='https://different.test/a.pdf';
    await assert.rejects(extractKnownSourceText(f.api),/Segment|Evidence/);
    assert.equal(f.calls.parses,1);assert.equal(f.row().text_extraction_state.pages_extracted,10);
  }
});

test('stored JSON key order does not change the canonical segment hash',async()=>{
  const f=await fixture();await extractKnownSourceText(f.api);
  const reorder=x=>Array.isArray(x)?x.map(reorder):x && typeof x==='object'?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reorder(v)])):x;
  f.rows[0]=reorder(f.rows[0]);await validateTextSegment(f.row(),f.rows[0],f.row().text_extraction_state.last_segment);
});

test('OCR/truncation gaps remain explicit while subsequent physical pages continue',async()=>{
  const f=await fixture({total:12});const parse=f.api.readAndExtract;
  f.api.readAndExtract=async args=>{const r=await parse(args);if(args.startPage===6){r.pages[0].truncated=true;r.pages[1].needs_ocr_review=true;}return r;};
  assert.equal((await extractKnownSourceText(f.api)).status,'partial');
  assert.equal((await extractKnownSourceText(f.api)).status,'partial_limit');
  assert.equal(f.row().text_extraction_state.pages_extracted,12);
  assert.equal(f.row().text_extraction_state.needs_ocr_page_count,1);assert.equal(f.row().text_extraction_state.truncated_page_count,1);
  assert.equal(f.row().text_extraction_state.complete_document_text,false);
});

test('evidence reader spans preview and batches with exact page/hash identity and bounded reads',async()=>{
  const f=await fixture();await extractKnownSourceText(f.api);await extractKnownSourceText(f.api);
  const r=await readSourceEvidencePages({source:f.row(),segmentEntity:f.api.segmentEntity,startPage:4,pageCount:5});
  assert.deepEqual(r.pages.map(p=>p.page),[4,5,6,7,8]);assert.equal(r.next_page,9);assert.equal(r.complete_document_text,false);
  const next=await readSourceEvidencePages({source:f.row(),segmentEntity:f.api.segmentEntity,startPage:9,pageCount:5});
  assert.deepEqual(next.pages.map(p=>p.page),[9,10,11,12,13]);
  await assert.rejects(readSourceEvidencePages({source:f.row(),segmentEntity:f.api.segmentEntity,pageCount:6}),/one to five/);
  assert.deepEqual((await readSourceEvidencePages({source:f.row(),segmentEntity:f.api.segmentEntity,startPage:16})).pages,[]);
});

test('evidence reader rejects missing/duplicate segments, tampered preview, and archive replacement',async()=>{
  for(const change of ['missing','duplicate','preview','archive']) {
    const f=await fixture();await extractKnownSourceText(f.api);
    if(change==='missing')f.rows.splice(0,1);
    if(change==='duplicate')f.rows.push({...structuredClone(f.rows[0]),id:'duplicate'});
    if(change==='preview')f.patch({extracted_text:'Staff text'});
    if(change==='archive')f.patch({file_hash_sha256:'b'.repeat(64)});
    await assert.rejects(readSourceEvidencePages({source:f.row(),segmentEntity:f.api.segmentEntity,startPage:6}),/missing|overlap|identity|cursor/);
  }
});

test('pending uncommitted segment is unavailable to source/page readers',async()=>{
  const f=await fixture({createMode:'missing'});await extractKnownSourceText(f.api);f.lateCreate();
  const r=await readSourceEvidencePages({source:f.row(),segmentEntity:f.api.segmentEntity,startPage:6});
  assert.deepEqual(r.pages,[]);assert.equal(r.available_through,5);
});

test('profile opt-out after parsing or before attachment preserves cursor and any saved orphan',async()=>{
  const f=await fixture();let checks=0;
  const r=await extractKnownSourceText({...f.api,canAutomaticallyExtract:async()=>++checks!==2});
  assert.equal(r.status,'segment_uncertain');assert.equal(f.calls.creates,0);assert.equal(f.row().text_extraction_state.pages_extracted,5);
  const g=await fixture();checks=0;
  const result=await extractKnownSourceText({...g.api,canAutomaticallyExtract:async()=>++checks!==3});
  assert.equal(result.status,'segment_uncertain');assert.equal(g.rows.length,1);assert.equal(g.row().text_extraction_state.pages_extracted,5);
});
