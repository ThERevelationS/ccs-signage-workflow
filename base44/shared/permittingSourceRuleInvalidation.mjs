import {sourceSupportsRule,assertSourceScopeReviewEvidence} from './permittingSourceAuthorityPolicy.mjs';
import {evidenceEqual,sourceAuthoritySnapshot,evidenceError} from './permittingRuleEvidence.mjs';
export async function invalidateSourceRules({sourceEntity,ruleEntity,segmentEntity,profileEntity,settingsEntity,sourceDocumentId,newHash,cursor=''}){
 const flaggedIds=[];let checked=0,conflicts=0,lastCompleted='';
 try{
  if(!sourceDocumentId)throw evidenceError('Select a source document.',400);
  const source=await sourceEntity.get(sourceDocumentId);
  if(newHash && newHash!==source.file_hash_sha256)throw evidenceError('The supplied hash differs from the current source catalog; review the source first.');
  const query={citations:{$elemMatch:{source_document_id:sourceDocumentId}},status:{$in:['staff_approved','extracted','needs_review']}};
  if(cursor)query.id={$gt:cursor};
  const rows=await ruleEntity.filter(query,'id',51,0);
  if(!Array.isArray(rows))throw Error('Rule lookup did not return an array.');
  let administrativeReviewCurrent=true;
  if(rows.slice(0,50).some(r=>r.rule_kind==='administrative_instruction')){
   try{await assertSourceScopeReviewEvidence(source,{segmentEntity,profileEntity,settingsEntity});}
   catch(error){const status=error.status || error.response?.status;if(status===409 || status===404)administrativeReviewCurrent=false;else throw error;}
  }
  for(const rule of rows.slice(0,50)){
   checked++;
   const changed=(rule.citations || []).filter(c=>c.source_document_id===sourceDocumentId)
    .some(c=>(c.source_sha256 || rule.source_snapshot_sha256 || '')!==source.file_hash_sha256);
   const approved=rule.evidence_context?.approved_sources?.find(s=>s.id===sourceDocumentId)?.snapshot;
   const scopeChanged=rule.evidence_validation==='literal-page-v1' && (rule.jurisdiction_id!==source.jurisdiction_id ||
    rule.jurisdiction_name!==source.jurisdiction_name || !evidenceEqual(rule.evidence_context?.jurisdiction_scope,source.jurisdiction_scope || null));
   const needsReview=changed || scopeChanged || !sourceSupportsRule(source,rule) ||
    (rule.rule_kind==='administrative_instruction' && !administrativeReviewCurrent) ||
    (approved && !evidenceEqual(approved,sourceAuthoritySnapshot(source)));
   if(!needsReview || (rule.conflict_state==='under_review' && !rule.is_operational && !rule.is_workflow_instruction && rule.status!=='staff_approved')){
    lastCompleted=rule.id;continue;
   }
   const current=await sourceEntity.get(sourceDocumentId);
   if(!evidenceEqual(sourceAuthoritySnapshot(current),sourceAuthoritySnapshot(source)))throw evidenceError('Source review changed during invalidation; resume against current evidence.');
   if(!rule.updated_date || !Number.isInteger(rule.version)){conflicts++;lastCompleted=rule.id;continue;}
   const patch={status:rule.status==='staff_approved'?'needs_review':rule.status,is_operational:false,is_workflow_instruction:false,
    conflict_state:'under_review',version:rule.version+1,review_operation_id:crypto.randomUUID()};
   let committed=false;
   try{
    const result=await ruleEntity.updateMany({id:rule.id,updated_date:rule.updated_date,version:rule.version},{$set:patch});
    committed=result?.updated===1;if(result?.updated!==0 && !committed)throw Error('Rule invalidation outcome is uncertain.');
   }catch(error){
    const after=await ruleEntity.get(rule.id).catch(()=>null);
    if(after && Object.entries(patch).every(([k,v])=>evidenceEqual(after[k],v)))committed=true;else throw error;
   }
   if(committed)flaggedIds.push(rule.id);else conflicts++;
   lastCompleted=rule.id;
  }
  return{success:true,source_document_id:sourceDocumentId,current_hash:source.file_hash_sha256 || '',rules_checked:checked,
   rules_flagged:flaggedIds.length,flagged_rule_ids:flaggedIds,conflicts,has_more:rows.length>50,
   next_cursor:rows.length>50?lastCompleted:null,llm_calls:0};
 }catch(error){
  error.progress={rules_checked:checked,rules_flagged:flaggedIds.length,flagged_rule_ids:flaggedIds,conflicts,resume_after:lastCompleted};
  throw error;
 }
}
