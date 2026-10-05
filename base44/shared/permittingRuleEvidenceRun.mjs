import { loadRuleEvidence, assertEvidenceCurrent, validateRuleCandidates, extractionPrompt, EXTRACTION_RESPONSE_SCHEMA,
  RULE_EVIDENCE_METHOD, evidenceDigest, evidenceEqual, evidenceError } from './permittingRuleEvidence.mjs';

const archiveIdentity=row=>JSON.stringify([row.id,row.archived_file_url,row.file_hash_sha256,row.file_bytes,row.jurisdiction_id]);
const summarize=run=>({success:run.status==='complete',run_id:run.id,status:run.status,source_document_id:run.source_document_id,
  candidates:run.candidates || [],candidates_staged:(run.candidates || []).length,rejected:run.rejected || [],error:run.error || '',
  rules_created:0,docs_processed:1,llm_attempts:run.llm_attempts || 0});

async function writeSourceLedger(entity,snapshot,expected,next,field='rule_extraction_state') {
  for (let attempt=0;attempt<3;attempt++) {
    const current=await entity.get(snapshot.id);
    if (archiveIdentity(current)!==archiveIdentity(snapshot)) throw evidenceError('Source archive or authority link changed.');
    if (evidenceEqual(current[field],next)) return current;
    if (!evidenceEqual(current[field] || {},expected || {}) || !current.updated_date)
      throw evidenceError('Source extraction reservation changed concurrently.');
    try {
      const result=await entity.updateMany({id:current.id,updated_date:current.updated_date},{$set:{[field]:next}});
      if (result?.updated===1) return await entity.get(current.id);
      if (result?.updated!==0) throw evidenceError('Source reservation outcome unknown.');
    } catch(error) {
      const after=await entity.get(snapshot.id).catch(()=>null);
      if (after && archiveIdentity(after)===archiveIdentity(snapshot) && evidenceEqual(after[field],next)) return after;
      throw error;
    }
  }
  throw evidenceError('Source extraction reservation repeatedly conflicted.');
}
export async function writeExtractionRun(entity,snapshot,fields) {
  try {
    const result=await entity.updateMany({id:snapshot.id,updated_date:snapshot.updated_date},{$set:fields});
    if (result?.updated!==1) throw evidenceError('Extraction run changed concurrently.');
    return await entity.get(snapshot.id);
  } catch(error) {
    const after=await entity.get(snapshot.id).catch(()=>null);
    if (after && Object.entries(fields).every(([key,value])=>evidenceEqual(after[key],value))) return after;
    throw error;
  }
}
async function findRun(entity,key,unit) {
  const rows=await entity.filter({request_key:key},'created_date',2,0);
  if (!Array.isArray(rows) || rows.length>1) throw evidenceError('Extraction request identity is ambiguous.');
  const run=rows[0];
  if (run && (run.source_document_id!==unit.source.id || run.snapshot_sha256!==unit.snapshot_sha256 ||
      run.start_page!==unit.start_page || run.page_count!==unit.page_count || !evidenceEqual(run.snapshot,unit.snapshot) ||
      run.method!==RULE_EVIDENCE_METHOD)) throw evidenceError('Request id already belongs to different source/page evidence.');
  if (run?.status==='complete' && run.candidates_sha256!==await evidenceDigest(run.candidates || []))
    throw evidenceError('Staged candidate evidence changed and requires review.');
  return run;
}
async function boundedLlm(invoke,args) {
  let timer;
  try {return await Promise.race([invoke(args),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Object.assign(Error('Manual extraction LLM outcome is uncertain after its time budget.'),{uncertain:true})),60_000);
  })]);} finally {clearTimeout(timer);}
}

export async function extractEvidenceUnit({sourceEntity,segmentEntity,runEntity,invokeLlm,sourceDocumentId,startPage=1,pageCount=1,
    requestId,dryRun=false,requestedBy,normalizeSignType,token=crypto.randomUUID(),now=()=>Date.now()}) {
  if (!dryRun && !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId || '')) throw evidenceError('A stable manual request id is required.',400);
  const options={sourceEntity,segmentEntity,sourceDocumentId,startPage,pageCount};
  const unit=await loadRuleEvidence(options);
  if (dryRun) return {success:true,dry_run:true,source_document_id:unit.source.id,start_page:startPage,page_count:pageCount,
    snapshot:unit.snapshot,snapshot_sha256:unit.snapshot_sha256,evidence:unit.evidence.pages,context_characters:unit.text.length,llm_calls:0,rules_created:0};
  const key='manual-rule-evidence:'+requestId;
  let run=await findRun(runEntity,key,unit);
  const old=unit.source.rule_extraction_state || {};
  if (run && run.status!=='reserved') {
    if (run.status==='complete' && old.request_key===key && old.status!=='complete') {
      await writeSourceLedger(sourceEntity,unit.source,old,{...old,status:'complete',run_id:run.id,lease_expires_at:''});
    }
    return {...summarize(run),replayed:true,llm_calls:0};
  }
  if (Date.parse(old.lease_expires_at || '')>now()) throw evidenceError('Another extraction request is active for this source.');
  if (['run_creating','run_uncertain','running','llm_uncertain'].includes(old.status) && old.request_key!==key)
    throw evidenceError('Reconcile the previous uncertain source extraction request before starting another.');
  let ledger={request_key:key,request_id:requestId,snapshot_sha256:unit.snapshot_sha256,status:'run_creating',claim_token:token,
    lease_expires_at:new Date(now()+180_000).toISOString(),requested_at:new Date(now()).toISOString()};
  await writeSourceLedger(sourceEntity,unit.source,old,ledger);
  try {
    if (!run) {
      if (old.request_key===key && ['run_creating','run_uncertain'].includes(old.status)) {
        // The earlier create intent survives a lost acknowledgement/crash.
        const uncertain={...ledger,status:'run_uncertain',lease_expires_at:''};
        await writeSourceLedger(sourceEntity,unit.source,ledger,uncertain);
        return {success:false,status:'run_uncertain',request_id:requestId,llm_calls:0,error:'No matching run is visible; the prior create is not repeated.'};
      }
      const data={request_key:key,request_id:requestId,source_document_id:unit.source.id,jurisdiction_id:unit.source.jurisdiction_id,
        start_page:startPage,page_count:pageCount,method:RULE_EVIDENCE_METHOD,snapshot:unit.snapshot,snapshot_sha256:unit.snapshot_sha256,
        status:'reserved',claim_token:token,lease_expires_at:ledger.lease_expires_at,llm_attempts:0,requested_by:requestedBy || '',candidates:[],rejected:[]};
      try {await runEntity.create(data);} catch { /* Inspect exact identity once; never repeat create. */ }
      run=await findRun(runEntity,key,unit);
      if (!run) {
        const uncertain={...ledger,status:'run_uncertain',lease_expires_at:''};
        await writeSourceLedger(sourceEntity,unit.source,ledger,uncertain);
        return {success:false,status:'run_uncertain',request_id:requestId,llm_calls:0,error:'Extraction run create could not be confirmed.'};
      }
    }
    await assertEvidenceCurrent(options,unit);
    const running={...ledger,status:'running',run_id:run.id};
    await writeSourceLedger(sourceEntity,unit.source,ledger,running);ledger=running;
    if (run.status!=='reserved' || run.llm_attempts!==0) throw evidenceError('This request already reserved an LLM attempt.');
    run=await writeExtractionRun(runEntity,run,{status:'llm_started',claim_token:token,llm_attempts:1,llm_started_at:new Date(now()).toISOString()});
    let response;
    try {response=await boundedLlm(invokeLlm,{prompt:extractionPrompt(unit),response_json_schema:EXTRACTION_RESPONSE_SCHEMA,add_context_from_internet:false});}
    catch(error) {
      run=await writeExtractionRun(runEntity,run,{status:error.uncertain?'llm_uncertain':'failed',error:String(error.message || error).slice(0,500),lease_expires_at:''});
      await writeSourceLedger(sourceEntity,unit.source,ledger,{...ledger,status:run.status,lease_expires_at:''});
      return {...summarize(run),llm_calls:1};
    }
    const validated=await validateRuleCandidates(unit,response,{extractionDate:new Date(now()).toISOString(),normalizeSignType});
    await assertEvidenceCurrent(options,unit);
    run=await writeExtractionRun(runEntity,run,{status:'complete',...validated,candidates_sha256:await evidenceDigest(validated.candidates),
      error:'',completed_at:new Date(now()).toISOString(),lease_expires_at:''});
    await writeSourceLedger(sourceEntity,unit.source,ledger,{...ledger,status:'complete',lease_expires_at:''});
    return {...summarize(run),llm_calls:1};
  } catch(error) {
    // Never replay an already-started attempt, even if the final receipt fails.
    const status=run?.status==='complete'?'complete':run?'failed':'run_uncertain';
    if (run && run.status!=='complete') {
      try {run=await writeExtractionRun(runEntity,run,{status:'failed',error:String(error.message || error).slice(0,500),lease_expires_at:''});}
      catch { /* Preserve the prior run for explicit reconciliation. */ }
    }
    try {await writeSourceLedger(sourceEntity,unit.source,ledger,{...ledger,status,lease_expires_at:'',error:String(error.message || error).slice(0,500)});} catch {}
    throw error;
  }
}

function candidateComparable(row) {
  return {applicability:row.evidence_context?.applicability ?? null,...Object.fromEntries(['jurisdiction_id','jurisdiction_name','rule_kind','rule_category','requirement','numeric_literal','numeric_value','unit',
    'sign_type','sign_type_normalized','zoning_district_applicability','trigger','exceptions','source_snapshot_sha256','extraction_key',
    'evidence_validation'].map(key=>[key,row[key] ?? null]))};
}
export async function importEvidenceCandidate({sourceEntity,segmentEntity,runEntity,ruleEntity,runId,candidateIndex,token=crypto.randomUUID(),now=()=>Date.now()}) {
  let run=await runEntity.get(runId);
  if (run?.status!=='complete' || run.method!==RULE_EVIDENCE_METHOD || run.candidates_sha256!==await evidenceDigest(run.candidates || []))
    throw evidenceError('A completed unchanged candidate run is required.');
  if (!Number.isInteger(candidateIndex) || candidateIndex<0 || candidateIndex>=run.candidates.length) throw evidenceError('Select one staged candidate.',400);
  const candidate=run.candidates[candidateIndex];
  const unit=await loadRuleEvidence({sourceEntity,segmentEntity,sourceDocumentId:run.source_document_id,startPage:run.start_page,pageCount:run.page_count});
  // Authority review may advance after extraction. Archive/page/scope identity must stay exact.
  const stable=row=>Object.fromEntries(['id','jurisdiction_id','jurisdiction_name','jurisdiction_scope','official_url','archived_file_url','file_hash_sha256','file_bytes'].map(k=>[k,row[k] ?? null]));
  if (!evidenceEqual(stable(unit.snapshot.source),stable(run.snapshot.source)) || !evidenceEqual(unit.snapshot.pages,run.snapshot.pages))
    throw evidenceError('Staged candidate source or page evidence was replaced.');
  const citation=candidate.citations?.[0],page=unit.evidence.pages.find(p=>p.page===citation?.physical_page);
  if (!page || candidate.evidence_validation!==RULE_EVIDENCE_METHOD || citation.source_sha256!==unit.source.file_hash_sha256 ||
      citation.text_sha256!==page.text_sha256 || !page.text.includes(citation.excerpt) || !citation.excerpt.includes(candidate.requirement))
    throw evidenceError('Candidate literal page evidence requires review.');
  const receipt=run.import_receipts?.[candidateIndex],old=run.import_state || {};
  if (Date.parse(old.lease_expires_at || '')>now()) throw evidenceError('Another candidate import is active.');
  if (old.status==='creating' || old.status==='uncertain') {
    if (old.candidate_index!==candidateIndex || old.extraction_key!==candidate.extraction_key)
      throw evidenceError('Reconcile the prior candidate import before starting another.');
  }
  const globalOld=unit.source.rule_import_state || {};
  if (Date.parse(globalOld.lease_expires_at || '')>now()) throw evidenceError('Another import is active for this source.');
  if (['creating','uncertain'].includes(globalOld.status) && globalOld.extraction_key!==candidate.extraction_key)
    throw evidenceError('Reconcile the prior source-wide candidate import before importing other evidence.');
  const rows=await ruleEntity.filter({extraction_key:candidate.extraction_key},'created_date',2,0);
  if (!Array.isArray(rows) || rows.length>1) throw evidenceError('Imported rule identity is ambiguous.');
  let existing=rows[0],createdThisCall=false;
  if (existing && !evidenceEqual(candidateComparable(existing),candidateComparable(candidate)))
    throw evidenceError('An existing rule has staff edits or conflicting evidence; it is preserved.');
  if (receipt && (!existing || existing.id!==receipt.rule_id)) throw evidenceError('Previously imported rule requires reconciliation.');
  const creating={status:'creating',candidate_index:candidateIndex,extraction_key:candidate.extraction_key,claim_token:token,
    lease_expires_at:new Date(now()+90_000).toISOString()};
  const globalCreating={...creating,run_id:run.id};
  await writeSourceLedger(sourceEntity,unit.source,globalOld,globalCreating,'rule_import_state');
  run=await writeExtractionRun(runEntity,run,{import_state:creating});
  const globalPriorIntent=['creating','uncertain'].includes(globalOld.status) ||
    (globalOld.status==='complete' && globalOld.extraction_key===candidate.extraction_key && globalOld.rule_id);
  if (!existing && !['creating','uncertain'].includes(old.status) && !globalPriorIntent && !receipt) {
    await assertEvidenceCurrent({sourceEntity,segmentEntity,sourceDocumentId:unit.source.id},unit);
    try {await ruleEntity.create({...candidate,extraction_run_id:run.id,status:candidate.status==='historical'?'historical':'needs_review',is_operational:false});createdThisCall=true;}
    catch { /* Reconcile once; no duplicate create after an unknown result. */ }
    const after=await ruleEntity.filter({extraction_key:candidate.extraction_key},'created_date',2,0);
    if (after.length>1) throw evidenceError('Candidate import identity became ambiguous.');
    existing=after[0];
  }
  if (!existing || !evidenceEqual(candidateComparable(existing),candidateComparable(candidate))) {
    await writeExtractionRun(runEntity,run,{import_state:{...creating,status:'uncertain',lease_expires_at:''}});
    await writeSourceLedger(sourceEntity,unit.source,globalCreating,{...globalCreating,status:'uncertain',lease_expires_at:''},'rule_import_state');
    return {success:false,status:'import_uncertain',rules_created:0,error:'Candidate create cannot be confirmed; prior intent retained.'};
  }
  await writeExtractionRun(runEntity,run,{import_state:{...creating,status:'complete',lease_expires_at:'',rule_id:existing.id},
    import_receipts:{...(run.import_receipts || {}),[candidateIndex]:{rule_id:existing.id,extraction_key:candidate.extraction_key}}});
  await writeSourceLedger(sourceEntity,unit.source,globalCreating,{...globalCreating,status:'complete',lease_expires_at:'',rule_id:existing.id},'rule_import_state');
  return {success:true,rule:existing,rules_created:createdThisCall?1:0,llm_calls:0};
}
