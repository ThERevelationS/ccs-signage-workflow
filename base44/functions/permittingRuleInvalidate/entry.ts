import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { reviewedAdoptedSource, evidenceEqual, sourceAuthoritySnapshot, evidenceError } from '../../shared/permittingRuleEvidence.mjs';

// Explicit, bounded re-review linkage. Known citations remain intact.
Deno.serve(async req => {
  let flaggedIds:string[]=[],checked=0,conflicts=0,lastId='';
  try {
    const base44=createClientFromRequest(req),user=await base44.auth.me().catch(()=>null);
    if (!user || user.role!=='admin') return Response.json({error:'Admin access required'},{status:403});
    const body=await req.json().catch(()=>({})),id=String(body.source_document_id || '');
    if (!id) throw evidenceError('Select a source document.',400);
    const entities=base44.asServiceRole.entities,source=await entities.PermittingSourceDocument.get(id);
    if (body.new_hash && body.new_hash!==source.file_hash_sha256)
      throw evidenceError('The supplied hash differs from the current source catalog; review the source first.');
    const cursor=String(body.cursor || '');
    const query:any={citations:{$elemMatch:{source_document_id:id}},status:{$in:['staff_approved','extracted','needs_review']}};
    if (cursor) query.id={$gt:cursor};
    const rows=await entities.PermittingRule.filter(query,'id',51,0);
    if (!Array.isArray(rows)) throw Error('Rule lookup did not return an array.');
    for (const rule of rows.slice(0,50)) {
      lastId=rule.id;checked++;
      const changed=(rule.citations || []).filter(c=>c.source_document_id===id)
        .some(c=>(c.source_sha256 || rule.source_snapshot_sha256 || '')!==source.file_hash_sha256);
      const needsReview=changed || !reviewedAdoptedSource(source);
      if (!needsReview || (rule.conflict_state==='under_review' && !rule.is_operational && rule.status!=='staff_approved')) continue;
      const current=await entities.PermittingSourceDocument.get(id);
      if (!evidenceEqual(sourceAuthoritySnapshot(current),sourceAuthoritySnapshot(source)))
        throw evidenceError('Source review changed during invalidation; resume against current evidence.');
      if (!rule.updated_date || !Number.isInteger(rule.version)) { conflicts++;continue; }
      const patch={status:rule.status==='staff_approved'?'needs_review':rule.status,is_operational:false,
        conflict_state:'under_review',version:rule.version+1,review_operation_id:crypto.randomUUID()};
      let committed=false;
      try {
        const result=await entities.PermittingRule.updateMany({id:rule.id,updated_date:rule.updated_date,version:rule.version},{$set:patch});
        committed=result?.updated===1;
        if (result?.updated!==0 && !committed) throw Error('Rule invalidation outcome is uncertain.');
      } catch(error) {
        const after=await entities.PermittingRule.get(rule.id).catch(()=>null);
        if (after && Object.entries(patch).every(([key,value])=>evidenceEqual(after[key],value))) committed=true;
        else throw error;
      }
      if (committed) flaggedIds.push(rule.id);else conflicts++;
    }
    return Response.json({success:true,source_document_id:id,current_hash:source.file_hash_sha256 || '',
      rules_checked:checked,rules_flagged:flaggedIds.length,flagged_rule_ids:flaggedIds,conflicts,
      has_more:rows.length>50,next_cursor:rows.length>50?lastId:null,llm_calls:0});
  } catch(error) {
    return Response.json({success:false,error:error?.message || 'Rule invalidation could not finish safely.',
      rules_checked:checked,rules_flagged:flaggedIds.length,flagged_rule_ids:flaggedIds,conflicts,
      resume_after:lastId,llm_calls:0},{status:error?.status || 500});
  }
});
