import { assembledSourceText, PDF_TEXT_METHOD, PDF_TEXT_PAGE_BATCH, PDF_TEXT_MAX_TOTAL_CHARS } from './jurisdictionSourcePdfText.mjs';
const terminal = ['complete', 'needs_ocr', 'partial_limit', 'blocked'];
const equal = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const identity = row => JSON.stringify([row.archived_file_url,row.file_hash_sha256,row.file_bytes]);
const owned = row => row.text_extraction_state?.method === PDF_TEXT_METHOD &&
  row.text_extraction_state?.source_sha256 === row.file_hash_sha256 &&
  row.text_extraction_state?.archived_file_url === row.archived_file_url;
const hasExisting = row => Boolean(row.extracted_text || row.extracted_pages?.length);
export function sourceTextEligible(row, {automatic = true, now = Date.now()} = {}) {
  if (!row?.id || !row.archived_file_url || !/^[a-f0-9]{64}$/.test(row.file_hash_sha256 || '') || !(row.file_bytes > 0) || row.text_extraction_pinned) return false;
  if (automatic && !row.source_registration_key) return false; // legacy/manual evidence is opt-in only
  if (hasExisting(row) && (!owned(row) || row.extracted_text !== assembledSourceText(row,row.extracted_pages || []) ||
      row.text_extraction_state.pages_extracted !== (row.extracted_pages || []).length)) return false;
  const state = row.text_extraction_state || {};
  if (state.source_sha256 && !owned(row)) return false; // source replacement requires review, not overwrite
  if (['complete','needs_ocr','partial_limit'].includes(state.status)) return false;
  if (Date.parse(state.lease_expires_at || '') > now) return false;
  if (automatic && (terminal.includes(state.status) || state.failures >= 3 || Date.parse(state.retry_after || '') > now)) return false;
  return true;
}
export function sourceTextBacklogQuery(now = Date.now()) {
  return { source_registration_key: { $exists: true, $nin: [null,''] }, archived_file_url: { $exists:true, $nin:[null,''] },
    file_hash_sha256: { $regex:'^[a-f0-9]{64}$' }, file_bytes: { $gt:0 }, text_extraction_pinned: { $ne:true },
    'text_extraction_state.status': { $nin:terminal },
    $and:[
      { $or:[{'text_extraction_state.lease_expires_at':{$in:[null,'']}},{'text_extraction_state.lease_expires_at':{$lte:new Date(now).toISOString()}}] },
      { $or:[{'text_extraction_state.retry_after':{$in:[null,'']}},{'text_extraction_state.retry_after':{$lte:new Date(now).toISOString()}}] },
      { $or:[{extracted_text:{$in:[null,'']}},{'text_extraction_state.method':PDF_TEXT_METHOD}] },
    ] };
}

async function writeReceipt(entity, snapshot, expected, next, fields = {}) {
  for (let attempt=0; attempt<3; attempt++) {
    const current = await entity.get(snapshot.id);
    if (!current?.id || current.text_extraction_pinned || identity(current)!==identity(snapshot)) throw Error('Source archive changed or became protected.');
    const converged = equal(current.text_extraction_state,next) && Object.entries(fields).every(([key,value])=>equal(current[key],value));
    if (converged) return current;
    if (!equal(current.text_extraction_state,expected) || !equal(current.extracted_text,snapshot.extracted_text) ||
        !equal(current.extracted_pages,snapshot.extracted_pages)) throw Error('Source text was changed by another worker or reviewer.');
    if (!current.updated_date) throw Error('Source has no persistence version.');
    try {
      const result=await entity.updateMany({id:current.id,updated_date:current.updated_date},{$set:{text_extraction_state:next,...fields}});
      if (result?.updated===1) return await entity.get(current.id);
      if (result?.updated!==0) throw Error('Conditional text write outcome unknown.');
    } catch(error) {
      const after=await entity.get(snapshot.id).catch(()=>null);
      if (after && !after.text_extraction_pinned && identity(after)===identity(snapshot) &&
          equal(after.text_extraction_state,next) && Object.entries(fields).every(([key,value])=>equal(after[key],value))) return after;
      throw error;
    }
  }
  throw Error('Source text write repeatedly conflicted; newer work retained.');
}

export async function extractKnownSourceText({entity,sourceDocumentId,readAndExtract,automatic=true,token=crypto.randomUUID(),now=()=>Date.now()}) {
  const source=await entity.get(sourceDocumentId);
  if (!sourceTextEligible(source,{automatic,now:now()})) return {success:true,skipped:true,reason:'no_eligible_text_source'};
  const old=source.text_extraction_state || {};
  const prior=source.extracted_pages || [];
  // Stored page sequence is the durable cursor, not a caller-supplied page number.
  if (prior.some((p,i)=>p.page!==i+1 || p.source_sha256!==source.file_hash_sha256 || p.source_document_id!==source.id || p.method!==PDF_TEXT_METHOD)) throw Error('Stored page provenance or continuation conflicts.');
  const startPage=prior.length+1;
  const claimed={...old,status:'running',method:PDF_TEXT_METHOD,source_sha256:source.file_hash_sha256,archived_file_url:source.archived_file_url,
    claim_token:token,lease_expires_at:new Date(now()+90_000).toISOString(),last_attempt_at:new Date(now()).toISOString(),
    attempts:(Number(old.attempts)||0)+1,next_page:startPage,error:''};
  await writeReceipt(entity,source,old,claimed);
  try {
    const chunk=await readAndExtract({source,startPage});
    if (!Array.isArray(chunk.pages) || !chunk.pages.length || chunk.pages.length>PDF_TEXT_PAGE_BATCH ||
        !Number.isInteger(chunk.total_pages) || chunk.total_pages<startPage || chunk.next_page!==startPage+chunk.pages.length ||
        chunk.next_page>chunk.total_pages+1 || chunk.pages.some((p,i)=>p.page!==startPage+i || p.source_document_id!==source.id ||
          p.source_sha256!==source.file_hash_sha256 || p.method!==PDF_TEXT_METHOD || typeof p.text!=='string') ||
        (old.total_pages && old.total_pages!==chunk.total_pages)) throw Object.assign(Error('Parser returned invalid or changed page provenance.'),{permanent:true});
    const pages=[...prior];
    let limit=false;
    for (const page of chunk.pages) {
      if (assembledSourceText(source,[...pages,page]).length>PDF_TEXT_MAX_TOTAL_CHARS) {limit=true;break;}
      pages.push(page);
      if (page.truncated) {limit=true;break;}
    }
    const nextPage=pages.length+1;
    const ocrPages=pages.filter(p=>p.needs_ocr_review).map(p=>p.page);
    const status=limit?'partial_limit':nextPage<=chunk.total_pages?'partial':ocrPages.length?'needs_ocr':'complete';
    const receipt={...claimed,status,lease_expires_at:'',retry_after:'',failures:0,total_pages:chunk.total_pages,next_page:nextPage,
      pages_extracted:pages.length,needs_ocr_pages:ocrPages,completed_at:new Date(now()).toISOString(),error:'',
      complete_document_text:status==='complete'};
    await writeReceipt(entity,source,claimed,receipt,{extracted_pages:pages,extracted_text:assembledSourceText(source,pages)});
    return {success:true,source_document_id:source.id,status,pages_processed:pages.length-prior.length,pages_extracted:pages.length,total_pages:chunk.total_pages,next_page:nextPage,llm_calls:0};
  } catch(error) {
    const failures=(Number(old.failures)||0)+1;
    const receipt={...claimed,status:error.permanent || failures>=3?'blocked':'failed',lease_expires_at:'',failures,
      retry_after:new Date(now()+failures*60*60_000).toISOString(),error:String(error.message||error).slice(0,500)};
    try {await writeReceipt(entity,source,claimed,receipt);}
    catch(persistError){return {success:false,status:'receipt_conflict',error:String(persistError.message||persistError),source_document_id:source.id};}
    return {success:false,status:receipt.status,error:receipt.error,source_document_id:source.id};
  }
}

export async function continueSourceTextBacklog(options) {
  const rows=await options.entity.filter(sourceTextBacklogQuery(),'updated_date',20,0);
  for (const row of rows) {
    if (!sourceTextEligible(row)) continue;
    try {return await extractKnownSourceText({...options,sourceDocumentId:row.id,automatic:true});}
    catch(error){return {success:false,status:'claim_conflict',error:String(error.message||error)};}
  }
  return {success:true,skipped:true,reason:'no_eligible_text_source',sources_checked:rows.length};
}
