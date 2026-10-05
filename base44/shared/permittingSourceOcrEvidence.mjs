import { textSha256 } from './jurisdictionSourcePdfText.mjs';
const hash = text => textSha256(new TextEncoder().encode(text));
const equal = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fail = message => { throw Error(message); };
const sourceIdentity = s => JSON.stringify([s.id,s.archived_file_url,s.file_hash_sha256,s.file_bytes]);
const textIdentity = s => JSON.stringify([s.text_extraction_pinned,s.text_extraction_state,s.extracted_text,s.extracted_pages]);
export const OCR_MAX_RECORDS = 5, OCR_MAX_TEXT_CHARS = 30_000;
const requestValid = value => typeof value==='string' && /^[a-zA-Z0-9_-]{16,100}$/.test(value);
function archiveValid(s) {
  if (!s?.id || !s.archived_file_url || !/^[a-f0-9]{64}$/.test(s.file_hash_sha256 || '') ||
      !Number.isInteger(s.file_bytes) || s.file_bytes<5) fail('A verified retained archive is required.');
}
function records(s) {
  if (s.ocr_evidence != null && !Array.isArray(s.ocr_evidence)) fail('OCR evidence requires repair.');
  const rows=s.ocr_evidence || [];
  if(rows.length>OCR_MAX_RECORDS || new Set(rows.map(r=>r.record_key)).size!==rows.length ||
      new Set(rows.map(r=>r.request_id)).size!==rows.length) fail('OCR evidence has duplicate identities or exceeds its bound.');
  return rows;
}
const payloadFields = r => ({source_document_id:r.source_document_id,source_sha256:r.source_sha256,
  archived_file_url:r.archived_file_url,file_bytes:r.file_bytes,page:r.page,text:r.text,
  method:r.method,extracted_at:r.extracted_at});
const immutableFields = r => ({...payloadFields(r),record_key:r.record_key,request_id:r.request_id,
  payload_sha256:r.payload_sha256,text_sha256:r.text_sha256,retained_at:r.retained_at,
  requested_by:r.requested_by,review_status:r.review_status,input_kind:r.input_kind});
function gapPage(s,page) {
  const state=s.text_extraction_state;
  if (!Number.isInteger(page) || page<1 || !Number.isInteger(state?.total_pages) || page>state.total_pages ||
      state.source_sha256!==s.file_hash_sha256 || state.archived_file_url!==s.archived_file_url ||
      !Array.isArray(state.needs_ocr_pages) || !state.needs_ocr_pages.includes(page))
    fail('Select an identified physical PDF page with an OCR gap.');
  const p=(s.extracted_pages || []).find(p=>p.page===page);
  // Initial support is deliberately limited to catalog inline pages; segmented gaps require their own reader.
  if(!p || !p.needs_ocr_review || p.source_sha256!==s.file_hash_sha256 || p.source_document_id!==s.id || p.truncated)
    fail('Physical page provenance is missing or conflicting.');
  return p;
}
export async function validateOcrRecord(source,record) {
  archiveValid(source);
  if(sourceIdentity(source)!==JSON.stringify([record.source_document_id,record.archived_file_url,record.source_sha256,record.file_bytes]))
    fail('OCR evidence belongs to a different archive snapshot.');
  gapPage(source,record.page);
  if(!requestValid(record.request_id) || typeof record.text!=='string' || !record.text.trim() ||
      record.text.length>OCR_MAX_TEXT_CHARS || !record.method || record.method.length>160 ||
      !Number.isFinite(Date.parse(record.extracted_at)) || !Number.isFinite(Date.parse(record.retained_at)) ||
      !record.requested_by || record.review_status!=='unreviewed' || record.input_kind!=='administrator_supplied_ocr')
    fail('OCR evidence metadata requires review.');
  if(await hash(JSON.stringify([source.id,record.request_id]))!==record.record_key ||
      await hash(record.text)!==record.text_sha256 ||
      await hash(JSON.stringify(payloadFields(record)))!==record.payload_sha256 ||
      await hash(JSON.stringify(immutableFields(record)))!==record.record_sha256)
    fail('OCR evidence integrity differs from its retention receipt.');
  return record;
}
function result(record,reconciled=false) {
  return {success:true,status:'retained_unreviewed',record,reconciled,complete_document_text:false,
    authority_established:false,limitations:['Administrator-supplied OCR may misread diagram labels and dimensions.',
    'OCR retention does not resolve the PDF extraction gap or establish current authority.'],llm_calls:0};
}
export async function retainSourceOcrEvidence({entity,sourceDocumentId,body,actor,readAndExtract,now=()=>Date.now()}) {
  if(!actor || actor.role!=='admin' || !actor.email) fail('Admin access required.');
  if(!requestValid(body.request_id) || typeof body.text!=='string' || !body.text.trim() ||
      body.text.length>OCR_MAX_TEXT_CHARS || typeof body.method!=='string' || !body.method.trim() || body.method.length>160 ||
      typeof body.extracted_at!=='string' || !Number.isFinite(Date.parse(body.extracted_at)))
    fail('Select a stable request identity and bounded OCR text with method and extraction date.');
  const source=await entity.get(sourceDocumentId); archiveValid(source);
  if(source.text_extraction_pinned) fail('Staff-maintained text is protected.');
  if(body.source_sha256!==source.file_hash_sha256) fail('OCR source hash differs from the archive.');
  gapPage(source,body.page);
  const payload={source_document_id:source.id,source_sha256:source.file_hash_sha256,archived_file_url:source.archived_file_url,
    file_bytes:source.file_bytes,page:body.page,text:body.text,method:body.method,extracted_at:body.extracted_at};
  const payloadHash=await hash(JSON.stringify(payload));
  const oldRecords=records(source);
  const prior=oldRecords.find(r=>r.request_id===body.request_id);
  if(prior) {
    await validateOcrRecord(source,prior);
    if(prior.payload_sha256!==payloadHash || prior.requested_by!==actor.email) fail('Request identity is already bound to different OCR evidence or actor.');
    return result(prior,true);
  }
  if(oldRecords.length>=OCR_MAX_RECORDS) fail('Retained OCR evidence bound reached; review before adding more.');
  if(!source.updated_date || body.expected_updated_date!==source.updated_date) fail('Source changed since the OCR preview.');
  // Re-fetch and hash the archive, and parse this actual physical page before retaining supplied OCR.
  const parsed=await readAndExtract({source,startPage:body.page});
  const p=parsed?.pages?.[0];
  if(parsed?.total_pages!==source.text_extraction_state.total_pages || p?.page!==body.page ||
      p?.source_document_id!==source.id || p?.source_sha256!==source.file_hash_sha256 ||
      p?.needs_ocr_review!==true || p?.truncated) fail('Verified PDF page does not match the recorded OCR gap.');
  const latest=await entity.get(source.id);
  if(latest.text_extraction_pinned || sourceIdentity(latest)!==sourceIdentity(source) ||
      textIdentity(latest)!==textIdentity(source) || !equal(latest.ocr_evidence,source.ocr_evidence) ||
      latest.updated_date!==source.updated_date) fail('Source changed during OCR verification; newer work retained.');
  const record={...payload,request_id:body.request_id,record_key:await hash(JSON.stringify([source.id,body.request_id])),
    payload_sha256:payloadHash,text_sha256:await hash(body.text),retained_at:new Date(now()).toISOString(),
    requested_by:actor.email,review_status:'unreviewed',input_kind:'administrator_supplied_ocr'};
  record.record_sha256=await hash(JSON.stringify(immutableFields(record)));
  const next=[...oldRecords,record];
  // One conditional write: no create operation, no reservation, and no blind retry on unknown outcomes.
  let writeError;
  try {
    const saved=await entity.updateMany({id:source.id,updated_date:source.updated_date},{$set:{ocr_evidence:next}});
    if(saved?.updated!==1) writeError=Error(saved?.updated===0?'Conditional OCR retention conflicted.':'OCR retention outcome is unknown.');
  } catch(error) { writeError=error; }
  const after=await entity.get(source.id).catch(()=>null);
  if(after && !after.text_extraction_pinned && sourceIdentity(after)===sourceIdentity(source) &&
      textIdentity(after)===textIdentity(source)) {
    const saved=records(after).find(r=>r.record_key===record.record_key);
    if(saved && equal(saved,record)) { await validateOcrRecord(after,saved);return result(saved,Boolean(writeError)); }
  }
  throw writeError || Error('OCR retention could not be verified; read the same request before retrying.');
}
export async function readSourceOcrEvidence({source,requestId,recordKey,excerpt}) {
  const matches=records(source).filter(r=>requestId ? r.request_id===requestId : r.record_key===recordKey);
  if(matches.length!==1) fail('Select one retained OCR receipt.');
  const r=await validateOcrRecord(source,matches[0]);
  const out=result(r);
  if(excerpt!==undefined) {
    if(typeof excerpt!=='string' || !excerpt.trim() || excerpt.length>1000 || !r.text.includes(excerpt))
      fail('OCR citation must be an exact bounded excerpt.');
    out.citation={evidence_kind:'unreviewed_ocr',record_key:r.record_key,source_document_id:source.id,
      source_sha256:r.source_sha256,text_sha256:r.text_sha256,page:r.page,method:r.method,
      excerpt,review_status:'unreviewed',authority_established:false};
  }
  return out;
}
