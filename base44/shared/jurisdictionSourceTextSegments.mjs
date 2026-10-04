import { PDF_TEXT_METHOD, PDF_TEXT_PAGE_BATCH, PDF_TEXT_MAX_PAGE_CHARS, textSha256, assembledSourceText } from './jurisdictionSourcePdfText.mjs';

export const SOURCE_TEXT_SEGMENT_MODE = 'pdf-page-segments-v1';
const permanent = message => Object.assign(Error(message),{permanent:true});
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const digest = value => textSha256(new TextEncoder().encode(JSON.stringify(canonical(value))));
const segmentKey = (source,start) => [SOURCE_TEXT_SEGMENT_MODE,source.id,source.file_hash_sha256,PDF_TEXT_METHOD,start].join(':');

export function segmentedProgressOwned(source) {
  const state=source.text_extraction_state || {}, inline=(source.extracted_pages || []).length;
  return state.storage_mode===SOURCE_TEXT_SEGMENT_MODE && state.inline_page_count===inline &&
    Number.isInteger(state.pages_extracted) && state.pages_extracted>=inline &&
    state.next_page===state.pages_extracted+1 && Number.isInteger(state.segment_count) && state.segment_count>=0 &&
    (state.pages_extracted===inline || (state.last_segment?.page_end===state.pages_extracted && state.last_segment?.page_start>inline));
}

function segmentData(row) {
  // Explicit canonical fields exclude server ids/version metadata.
  return {registration_key:row.registration_key,source_document_id:row.source_document_id,source_sha256:row.source_sha256,
    archived_file_url:row.archived_file_url,file_bytes:row.file_bytes,method:row.method,
    page_start:row.page_start,page_end:row.page_end,total_pages:row.total_pages,pages:row.pages};
}

export async function validateSourcePages(source,pages,start,{maxPages=PDF_TEXT_PAGE_BATCH}={}) {
  if (!Array.isArray(pages) || !pages.length || pages.length>maxPages) throw permanent('Invalid evidence page batch.');
  for (let i=0;i<pages.length;i++) {
    const page=pages[i];
    if (page.page!==start+i || page.source_document_id!==source.id || page.source_sha256!==source.file_hash_sha256 ||
        page.method!==PDF_TEXT_METHOD || typeof page.text!=='string' || page.text.length>PDF_TEXT_MAX_PAGE_CHARS ||
        typeof page.truncated!=='boolean' || typeof page.needs_ocr_review!=='boolean' ||
        !/^[a-f0-9]{64}$/.test(page.text_sha256 || '') ||
        page.text_sha256!==await textSha256(new TextEncoder().encode(page.text))) throw permanent('Evidence page provenance or text hash differs.');
  }
}

export async function validateTextSegment(source,row,expected) {
  if (!row?.id || row.source_document_id!==source.id || row.source_sha256!==source.file_hash_sha256 ||
      row.archived_file_url!==source.archived_file_url || row.file_bytes!==source.file_bytes || row.method!==PDF_TEXT_METHOD ||
      !Number.isInteger(row.page_start) || row.page_start<1 || !Number.isInteger(row.page_end) ||
      !Number.isInteger(row.total_pages) || row.page_end>row.total_pages || row.page_end!==row.page_start+row.pages?.length-1 ||
      row.registration_key!==segmentKey(source,row.page_start)) throw permanent('Segment archive identity or page range differs.');
  await validateSourcePages(source,row.pages,row.page_start);
  if (row.payload_sha256!==await digest(segmentData(row))) throw permanent('Segment payload hash differs.');
  if (expected && ((expected.id && row.id!==expected.id) || row.registration_key!==expected.registration_key || row.payload_sha256!==expected.payload_sha256 ||
      row.page_start!==expected.page_start || row.page_end!==expected.page_end || row.total_pages!==expected.total_pages))
    throw permanent('Segment differs from its durable pending receipt.');
  return row;
}

async function findSegment(entity,source,expected) {
  const rows=await entity.filter({registration_key:expected.registration_key},'created_date',2,0);
  if (!Array.isArray(rows) || rows.length>1) throw permanent('Segment identity is ambiguous; evidence retained for review.');
  return rows.length ? validateTextSegment(source,rows[0],expected) : null;
}

// Called only after the source worker has checked protection and ownership.
// Persist a create intent before the non-idempotent create. Recovery only reconciles;
// it never recreates a missing/uncertain segment automatically or manually.
export async function extractSegmentedSourceText({entity,segmentEntity,source,readAndExtract,canAutomaticallyExtract,
    automatic,token,now,writeReceipt}) {
  const old=source.text_extraction_state || {}, inline=source.extracted_pages || [];
  const progress=old.storage_mode===SOURCE_TEXT_SEGMENT_MODE ? old.pages_extracted : inline.length;
  if (old.storage_mode && !segmentedProgressOwned(source)) throw permanent('Segment cursor conflicts with retained inline evidence.');
  if (old.last_segment) {
    const last=await findSegment(segmentEntity,source,old.last_segment);
    if (!last || last.page_end!==progress) throw permanent('Previous committed segment is missing or changed.');
  }
  const startPage=progress+1;
  const claimed={...old,status:'running',storage_mode:SOURCE_TEXT_SEGMENT_MODE,inline_page_count:inline.length,
    preview_only:progress>inline.length,pages_extracted:progress,segment_count:old.segment_count || 0,
    method:PDF_TEXT_METHOD,source_sha256:source.file_hash_sha256,archived_file_url:source.archived_file_url,
    claim_token:token,lease_expires_at:new Date(now()+90_000).toISOString(),last_attempt_at:new Date(now()).toISOString(),
    attempts:(Number(old.attempts)||0)+1,next_page:startPage,error:''};
  await writeReceipt(entity,source,old,claimed);
  let expected=claimed;
  try {
    let saved;
    if (old.pending_segment) {
      saved=await findSegment(segmentEntity,source,old.pending_segment);
      if (!saved) throw Object.assign(Error('Pending segment create remains uncertain; reconcile evidence before retrying.'),{uncertain:true});
    } else {
      const chunk=await readAndExtract({source,startPage});
      await validateSourcePages(source,chunk.pages,startPage);
      if (!Number.isInteger(chunk.total_pages) || chunk.total_pages<startPage ||
          chunk.next_page!==startPage+chunk.pages.length || chunk.next_page>chunk.total_pages+1 ||
          (old.total_pages && old.total_pages!==chunk.total_pages)) throw permanent('Parser changed document page count or continuation.');
      const data={registration_key:segmentKey(source,startPage),source_document_id:source.id,source_sha256:source.file_hash_sha256,
        archived_file_url:source.archived_file_url,file_bytes:source.file_bytes,method:PDF_TEXT_METHOD,
        page_start:startPage,page_end:chunk.next_page-1,total_pages:chunk.total_pages,pages:chunk.pages};
      data.payload_sha256=await digest(segmentData(data));
      const pending={registration_key:data.registration_key,payload_sha256:data.payload_sha256,page_start:data.page_start,
        page_end:data.page_end,total_pages:data.total_pages};
      // An existing same-key record must match. It can be an orphan from a
      // previous known attempt; preserve conflicts rather than overwriting.
      const existing=await findSegment(segmentEntity,source,pending);
      expected={...claimed,status:'segment_pending',pending_segment:pending};
      await writeReceipt(entity,source,claimed,expected);
      if (existing) saved=existing;
      else {
        if (automatic && canAutomaticallyExtract && !await canAutomaticallyExtract(source)) throw Error('Profile became protected before segment creation.');
        // Verify the lease and text snapshot again immediately before creation.
        await writeReceipt(entity,source,expected,expected);
        try { await segmentEntity.create(data); }
        catch { /* Create may have succeeded: inspect once, never blindly retry. */ }
        saved=await findSegment(segmentEntity,source,pending);
        if (!saved) throw Object.assign(Error('Segment create outcome uncertain; pending evidence identity retained.'),{uncertain:true});
      }
    }
    if (saved.page_start!==startPage || (old.total_pages && saved.total_pages!==old.total_pages))
      throw permanent('Pending segment does not continue the durable source cursor.');
    if (automatic && canAutomaticallyExtract && !await canAutomaticallyExtract(source)) throw Error('Profile became protected before segment attachment.');
    const newOcr=saved.pages.filter(p=>p.needs_ocr_review).map(p=>p.page);
    const newTruncated=saved.pages.filter(p=>p.truncated).map(p=>p.page);
    const ocrCount=(old.needs_ocr_page_count ?? (old.needs_ocr_pages || []).length)+newOcr.length;
    const truncatedCount=(old.truncated_page_count || 0)+newTruncated.length;
    const nextPage=saved.page_end+1;
    const status=nextPage<=saved.total_pages?'partial':truncatedCount?'partial_limit':ocrCount?'needs_ocr':'complete';
    const last={id:saved.id,registration_key:saved.registration_key,payload_sha256:saved.payload_sha256,
      page_start:saved.page_start,page_end:saved.page_end,total_pages:saved.total_pages};
    const receipt={...expected,status,lease_expires_at:'',retry_after:'',failures:0,error:'',pending_segment:null,
      last_segment:last,segment_count:(old.segment_count || 0)+1,total_pages:saved.total_pages,
      pages_extracted:saved.page_end,next_page:nextPage,preview_only:true,
      needs_ocr_page_count:ocrCount,needs_ocr_pages:[...(old.needs_ocr_pages || []),...newOcr].slice(0,100),
      truncated_page_count:truncatedCount,truncated_pages:[...(old.truncated_pages || []),...newTruncated].slice(0,100),
      last_chunk_completed_at:new Date(now()).toISOString(),completed_at:status==='complete'?new Date(now()).toISOString():'',
      complete_document_text:status==='complete',extracted_text_scope:'inline_preview'};
    // Only the fixed-size receipt changes; original inline pages/text stay intact.
    await writeReceipt(entity,source,expected,receipt);
    return {success:true,source_document_id:source.id,status,pages_processed:saved.pages.length,pages_extracted:saved.page_end,
      total_pages:saved.total_pages,next_page:nextPage,segment_id:saved.id,reconciled:Boolean(old.pending_segment),llm_calls:0};
  } catch(error) {
    const uncertain=Boolean(expected.pending_segment);
    const failures=(Number(old.failures)||0)+1;
    const receipt={...expected,status:uncertain?'segment_uncertain':error.permanent || failures>=3?'blocked':'failed',
      lease_expires_at:'',failures,retry_after:new Date(now()+failures*60*60_000).toISOString(),
      error:String(error.message || error).slice(0,500),complete_document_text:false};
    try {await writeReceipt(entity,source,expected,receipt);}
    catch(persistError) {return {success:false,status:'receipt_conflict',source_document_id:source.id,error:String(persistError.message || persistError)};}
    return {success:false,status:receipt.status,source_document_id:source.id,error:receipt.error,llm_calls:0};
  }
}

// Bounded read for future source/page citations. Uncommitted orphan segments are
// excluded by the source cursor; duplicate/overlapping evidence is rejected.
export async function readSourceEvidencePages({source,segmentEntity,startPage=1,pageCount=PDF_TEXT_PAGE_BATCH}) {
  if (!Number.isInteger(startPage) || startPage<1 || !Number.isInteger(pageCount) || pageCount<1 || pageCount>PDF_TEXT_PAGE_BATCH)
    throw Error('Evidence reads require one to five physical PDF pages.');
  const state=source.text_extraction_state || {}, inline=source.extracted_pages || [];
  if (state.method!==PDF_TEXT_METHOD || state.source_sha256!==source.file_hash_sha256 || state.archived_file_url!==source.archived_file_url ||
      source.extracted_text!==assembledSourceText(source,inline) ||
      (state.storage_mode && !segmentedProgressOwned(source))) throw Error('Source text identity or cursor requires review.');
  const committed=state.pages_extracted || 0;
  if (startPage>committed) return {pages:[],next_page:startPage,available_through:committed,total_pages:state.total_pages,complete_document_text:false};
  const end=Math.min(committed,startPage+pageCount-1),pages=inline.filter(p=>p.page>=startPage && p.page<=end);
  if (end>inline.length) {
    if (!segmentEntity || state.storage_mode!==SOURCE_TEXT_SEGMENT_MODE) throw Error('Segment evidence storage is unavailable.');
    const rows=await segmentEntity.filter({source_document_id:source.id,source_sha256:source.file_hash_sha256,method:PDF_TEXT_METHOD,
      page_start:{$lte:end},page_end:{$gte:Math.max(startPage,inline.length+1)}},'page_start',6,0);
    if (!Array.isArray(rows) || rows.length>5) throw Error('Evidence range is ambiguous.');
    for (const row of rows) {
      await validateTextSegment(source,row);
      if (row.page_start<=inline.length || row.page_end>committed || row.total_pages!==state.total_pages) throw Error('Segment is uncommitted or overlaps preserved preview.');
      pages.push(...row.pages.filter(p=>p.page>=startPage && p.page<=end));
    }
  }
  pages.sort((a,b)=>a.page-b.page);
  if (pages.length!==end-startPage+1) throw Error('Evidence pages are missing or overlap.');
  await validateSourcePages(source,pages,startPage);
  return {pages,next_page:end+1,available_through:committed,total_pages:state.total_pages,
    complete_document_text:state.complete_document_text===true,preview_only:state.preview_only===true,
    has_text_gaps:pages.some(p=>p.truncated || p.needs_ocr_review)};
}
