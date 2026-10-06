import {ruleKind} from './permittingSourceAuthorityPolicy.mjs';
import {verifyRuleForApproval,assertApprovalSourcesCurrent,evidenceEqual,evidenceError} from './permittingRuleEvidence.mjs';

// A read-only page, not an answer or an address applicability decision.
// The caller can continue paging; there is no total catalog record cap.
export async function retrieveApprovedEvidence({entities,jurisdictionId,limit=25,cursor=0}) {
  if(typeof jurisdictionId!=='string' || !jurisdictionId.trim() || jurisdictionId.length>200)
    throw evidenceError('Select one jurisdiction for evidence retrieval.',400);
  if(!Number.isInteger(limit) || limit<1 || limit>100 || !Number.isSafeInteger(cursor) || cursor<0)
    throw evidenceError('Invalid evidence page range.',400);
  const rows=await entities.PermittingRule.filter({jurisdiction_id:jurisdictionId,status:'staff_approved'},'id',limit+1,cursor);
  if(!Array.isArray(rows))throw Error('Evidence page could not be read.');
  const evidence=[],blocked=[];
  for(const rule of rows.slice(0,limit)) {
    try {
      const kind=ruleKind(rule);
      if(rule.conflict_state!=='none' ||
        (kind==='regulatory_rule' && (rule.is_operational!==true || rule.is_workflow_instruction===true)) ||
        (kind==='administrative_instruction' && (rule.is_workflow_instruction!==true || rule.is_operational===true)))
        throw evidenceError('Rule is not enabled for its approved evidence purpose.');
      const snapshots=await verifyRuleForApproval(rule,{sourceEntity:entities.PermittingSourceDocument,
        segmentEntity:entities.PermittingSourceTextSegment,profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings});
      const approved=rule.evidence_context?.approved_sources;
      if(!Array.isArray(approved) || approved.length!==snapshots.length ||
        !evidenceEqual(approved,snapshots.map(s=>({id:s.id,snapshot:s.snapshot}))))
        throw evidenceError('Current source context differs from the recorded staff approval.');
      await assertApprovalSourcesCurrent(snapshots,entities.PermittingSourceDocument,{
        segmentEntity:entities.PermittingSourceTextSegment,profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings});
      const latest=await entities.PermittingRule.get(rule.id);
      if(latest.version!==rule.version || latest.updated_date!==rule.updated_date || !evidenceEqual(latest,rule))
        throw evidenceError('Rule changed during retrieval; refresh evidence.');
      evidence.push({rule_id:rule.id,rule_version:rule.version,jurisdiction_id:rule.jurisdiction_id,
        jurisdiction_name:rule.jurisdiction_name,rule_kind:kind,rule_category:rule.rule_category,
        requirement:rule.requirement,trigger:rule.trigger || '',exceptions:rule.exceptions || '',
        sign_type:rule.sign_type || '',zoning_district_applicability:rule.zoning_district_applicability || '',
        numeric_value:rule.numeric_value ?? null,unit:rule.unit || '',citations:rule.citations,
        reviewer:rule.reviewer,reviewed_at:rule.reviewed_at,
        jurisdiction_scope:rule.evidence_context?.jurisdiction_scope ?? null,
        address_applicability:'requires_review'});
    } catch(error) {
      if(!error?.status)throw error;
      blocked.push({rule_id:rule.id,blocker:String(error.message).slice(0,500)});
    }
  }
  return {success:true,evidence,blocked,has_more:rows.length>limit,
    next_cursor:rows.length>limit?String(cursor+limit):null,checked_at:new Date().toISOString(),
    address_applicability:'requires_review',llm_calls:0,rules_created:0};
}
