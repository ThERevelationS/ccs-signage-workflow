import {textSha256} from './jurisdictionSourcePdfText.mjs';
import {validateOcrRecord} from './permittingSourceOcrEvidence.mjs';
const sha=s=>textSha256(new TextEncoder().encode(s));
const eq=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const fail=m=>{throw Error(m);};
const validRequest=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(s);
const hashValid=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const identity=s=>JSON.stringify([s.id,s.file_hash_sha256,s.archived_file_url,s.file_bytes,
 s.text_extraction_pinned,s.text_extraction_state,s.extracted_text,s.extracted_pages,s.ocr_evidence]);
function rows(source){
 const r=source.ocr_transcriptions??[];
 if(!Array.isArray(r)||r.length>5||new Set(r.map(x=>x.record_key)).size!==r.length||new Set(r.map(x=>x.request_id)).size!==r.length)
  fail('Visual transcription receipts are duplicated or out of bounds.');
 return r;
}
function normalizeSpans(spans){
 if(!Array.isArray(spans)||spans.length<1||spans.length>5)fail('Select one to five instruction excerpts or example labels.');
 return spans.map(s=>{
  const r=s.region;
  if(typeof s.text!=='string'||!s.text.trim()||s.text.length>1000||
    typeof s.region_label!=='string'||!s.region_label.trim()||s.region_label.length>200||
    !['instruction_excerpt','example_label'].includes(s.kind)||
    !Array.isArray(r)||r.length!==4||r.some(n=>typeof n!=='number'||!Number.isFinite(n))||
    r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>1||r[1]+r[3]>1)
   fail('Each excerpt requires bounded literal text and a normalized top-left page region.');
  return {text:s.text,kind:s.kind,region_label:s.region_label,region:[...r]};
 });
}
function renderMetadata(r){
 if(!r||!hashValid(r.sha256)||typeof r.method!=='string'||!r.method.trim()||r.method.length>160||
  !Number.isInteger(r.width)||!Number.isInteger(r.height)||r.width<1||r.height<1||r.width>20000||r.height>20000)
  fail('A bounded declared page-render receipt is required.');
 return {sha256:r.sha256,method:r.method,width:r.width,height:r.height};
}
const payloadFields=r=>({source_document_id:r.source_document_id,source_sha256:r.source_sha256,
 archived_file_url:r.archived_file_url,file_bytes:r.file_bytes,page:r.page,ocr_record_key:r.ocr_record_key,
 ocr_record_sha256:r.ocr_record_sha256,render:r.render,spans:r.spans,observation_kind:r.observation_kind,coverage:r.coverage});
const receiptFields=r=>({...payloadFields(r),request_id:r.request_id,record_key:r.record_key,payload_sha256:r.payload_sha256,
 submitted_by:r.submitted_by,retained_at:r.retained_at,review_status:r.review_status});
async function anchor(source,key){
 if(!hashValid(key))fail('Select a retained OCR record key.');
 const matches=(source.ocr_evidence||[]).filter(r=>r.record_key===key);
 if(matches.length!==1)fail('OCR anchor is missing or duplicated.');
 return validateOcrRecord(source,matches[0]);
}
export async function validateVisualTranscription(source,r){
 const o=await anchor(source,r.ocr_record_key);
 if(r.source_document_id!==source.id||r.source_sha256!==source.file_hash_sha256||
  r.archived_file_url!==source.archived_file_url||r.file_bytes!==source.file_bytes||
  r.page!==o.page||r.ocr_record_sha256!==o.record_sha256)fail('Visual transcription belongs to different OCR or archive evidence.');
 if(!validRequest(r.request_id)||!eq(normalizeSpans(r.spans),r.spans)||!eq(renderMetadata(r.render),r.render)||
  r.observation_kind!=='agent_visual_transcription'||r.coverage!=='selected_excerpts_only'||
  r.review_status!=='pending_staff_review'||typeof r.submitted_by!=='string'||!r.submitted_by||
  !Number.isFinite(Date.parse(r.retained_at)))fail('Visual transcription metadata requires review.');
 if(await sha(JSON.stringify([source.id,'visual-transcription',r.request_id]))!==r.record_key||
  await sha(JSON.stringify(payloadFields(r)))!==r.payload_sha256||
  await sha(JSON.stringify(receiptFields(r)))!==r.record_sha256)fail('Visual transcription integrity differs from its receipt.');
 return r;
}
function result(r,reconciled=false){
 return {success:true,status:'pending_staff_review',record:r,reconciled,complete_document_text:false,authority_established:false,llm_calls:0,
  limitations:['Selected excerpts only; the diagram and other OCR errors are not reviewed.',
  'Page-render metadata is supplied provenance; the backend validates the PDF archive/page, not the image rendering.',
  'Agent visual transcription is a candidate, not staff approval or a regulatory decision.']};
}
export async function retainVisualTranscription({entity,sourceDocumentId,body,actor,readAndExtract,now=()=>Date.now()}){
 if(actor?.role!=='admin'||!actor.email)fail('Admin access required.');
 if(!validRequest(body.request_id))fail('A stable transcription request identity is required.');
 const spans=normalizeSpans(body.spans),render=renderMetadata(body.render);
 const source=await entity.get(sourceDocumentId);
 if(source.text_extraction_pinned)fail('Staff-maintained text is protected.');
 if(body.source_sha256!==source.file_hash_sha256)fail('Archive snapshot differs from the selected evidence.');
 const o=await anchor(source,body.ocr_record_key),old=rows(source);
 const payload={source_document_id:source.id,source_sha256:source.file_hash_sha256,archived_file_url:source.archived_file_url,
  file_bytes:source.file_bytes,page:o.page,ocr_record_key:o.record_key,ocr_record_sha256:o.record_sha256,render,spans,
  observation_kind:'agent_visual_transcription',coverage:'selected_excerpts_only'};
 const payloadHash=await sha(JSON.stringify(payload)),prior=old.find(r=>r.request_id===body.request_id);
 if(prior){await validateVisualTranscription(source,prior);
  if(prior.payload_sha256!==payloadHash||prior.submitted_by!==actor.email)fail('Request is bound to different transcription evidence or actor.');
  return result(prior,true);
 }
 if(old.length>=5)fail('Visual transcription receipt bound reached; review before extending.');
 if(!source.updated_date||body.expected_updated_date!==source.updated_date)fail('Source changed since transcription preview.');
 const parsed=await readAndExtract({source,startPage:o.page}),p=parsed?.pages?.[0];
 if(parsed?.total_pages!==source.text_extraction_state.total_pages||p?.page!==o.page||
   p?.source_document_id!==source.id||p?.source_sha256!==source.file_hash_sha256||
   p?.needs_ocr_review!==true||p?.truncated)fail('Verified physical PDF page conflicts with OCR provenance.');
 const latest=await entity.get(source.id);
 if(identity(latest)!==identity(source)||!eq(latest.ocr_transcriptions,source.ocr_transcriptions)||latest.updated_date!==source.updated_date)
  fail('Source changed during transcription verification; newer work retained.');
 const r={...payload,request_id:body.request_id,record_key:await sha(JSON.stringify([source.id,'visual-transcription',body.request_id])),
  payload_sha256:payloadHash,submitted_by:actor.email,retained_at:new Date(now()).toISOString(),review_status:'pending_staff_review'};
 r.record_sha256=await sha(JSON.stringify(receiptFields(r)));
 let writeError;
 try{const saved=await entity.updateMany({id:source.id,updated_date:source.updated_date},{$set:{ocr_transcriptions:[...old,r]}});
  if(saved?.updated!==1)writeError=Error(saved?.updated===0?'Conditional transcription write conflicted.':'Transcription write outcome is unknown.');
 }catch(error){writeError=error;}
 const after=await entity.get(source.id).catch(()=>null);
 if(after&&identity(after)===identity(source)){
  const saved=rows(after).find(x=>x.record_key===r.record_key);
  if(saved&&eq(saved,r)){await validateVisualTranscription(after,saved);return result(saved,Boolean(writeError));}
 }
 throw writeError||Error('Transcription receipt could not be verified; read this request before retrying.');
}
export async function readVisualTranscription({source,recordKey,requestId,spanIndex,excerpt}){
 const matches=rows(source).filter(r=>requestId?r.request_id===requestId:r.record_key===recordKey);
 if(matches.length!==1)fail('Select one visual transcription receipt.');
 const r=await validateVisualTranscription(source,matches[0]),out=result(r);
 if(spanIndex!==undefined||excerpt!==undefined){
  if(!Number.isInteger(spanIndex)||spanIndex<1||spanIndex>r.spans.length||typeof excerpt!=='string'||!excerpt.trim()||
   excerpt.length>1000||!r.spans[spanIndex-1].text.includes(excerpt))fail('Select an exact excerpt from one retained transcription span.');
  const span=r.spans[spanIndex-1];
  out.citation={evidence_kind:'visual_transcription_candidate',record_key:r.record_key,source_document_id:source.id,
   source_sha256:r.source_sha256,ocr_record_key:r.ocr_record_key,ocr_record_sha256:r.ocr_record_sha256,
   page:r.page,span:spanIndex,region:span.region,region_label:span.region_label,kind:span.kind,render_sha256:r.render.sha256,
   excerpt,review_status:'pending_staff_review',authority_established:false};
 }
 return out;
}
