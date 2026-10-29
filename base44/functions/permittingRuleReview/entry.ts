import { listOfficeAuthorityReviews } from '../../shared/permittingOfficeAuthority.mjs';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import {retrieveApprovedEvidence} from '../../shared/permittingApprovedEvidence.mjs';
import {ruleKind} from '../../shared/permittingSourceAuthorityPolicy.mjs';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { importEvidenceCandidate } from '../../shared/permittingRuleEvidenceRun.mjs';
import { verifyRuleForApproval, ruleApplicabilityEvidence, assertApprovalSourcesCurrent, evidenceEqual, evidenceError, evidenceDigest, RULE_EVIDENCE_METHOD } from '../../shared/permittingRuleEvidence.mjs';

async function commitRule(entity:any,rule:any,fields:any,action:string,reviewer:any) {
  if (!rule.updated_date) throw evidenceError('Rule has no persistence version.');
  const context=rule.evidence_context || {};
  const history=context.review_history ?? [];
  if (!Array.isArray(history)) throw evidenceError('Existing review history requires reconciliation.');
  const operationId=crypto.randomUUID();
  const snapshot=(value:any)=>Object.fromEntries([
    'version','status','conflict_state','is_operational','is_workflow_instruction',
    'reviewer','reviewer_email','reviewed_at','requirement','trigger','exceptions',
    'zoning_district_applicability','numeric_value','numeric_literal','unit','sign_type',
    'sign_type_normalized','rule_category','notes','citations'
  ].filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
  const next={...rule,...fields,version:rule.version+1};
  const event={operation_id:operationId,action,...reviewer,
    changed_fields:Object.keys(fields).filter(key=>key!=='evidence_context' && !evidenceEqual(rule[key],fields[key])),
    before:snapshot(rule),after:snapshot(next),
    previous_approved_sources:context.approved_sources ?? null,
    approved_sources:(fields.evidence_context || context).approved_sources ?? null};
  // History and the decision share one version-conditional write; no separate
  // append can lose attribution or duplicate an event after a lost response.
  const patch={...fields,version:next.version,review_operation_id:operationId,
    evidence_context:{...context,...(fields.evidence_context || {}),review_history:[...history,event]}};

  try {
    const result=await entity.updateMany({id:rule.id,updated_date:rule.updated_date,version:rule.version},{$set:patch});
    if (result?.updated!==1) throw evidenceError('Another reviewer changed this rule; refresh before saving.');
    return await entity.get(rule.id);
  } catch(error) {
    const after=await entity.get(rule.id).catch(()=>null);
    if (after && Object.entries(patch).every(([key,value])=>evidenceEqual(after[key],value))) return after;
    throw error;
  }
}
Deno.serve(async req => {
  try {
    const base44=withEntityRateLimitRetry(createClientFromRequest(req)),body=await req.json().catch(()=>({}));
    // A supplied app session must verify successfully; never fall back after an invalid session.
    const user=body.session_token
      ? await authenticateSignShopSession(base44,body.session_token)
      : await base44.auth.me().catch(()=>null);
    if (!user || user.role!=='admin') return Response.json({error:'Admin access required'},{status:403});
    const entities=base44.asServiceRole.entities,Rules=entities.PermittingRule;
    const action=String(body.action || '');
    if (action==='retrieve_office_authority') {
      const jurisdictionId=body.jurisdiction_id;
      if (typeof jurisdictionId!=='string' || !jurisdictionId.trim() || jurisdictionId.length>200)
        throw evidenceError('Select a canonical jurisdiction.',400);
      const profile=await entities.JurisdictionProfile.get(jurisdictionId);
      if (!profile.updated_date) throw evidenceError('Jurisdiction persistence version is unavailable.');
      if (body.expected_profile_updated_date && body.expected_profile_updated_date!==profile.updated_date)
        throw evidenceError('Jurisdiction review history changed; refresh office evidence.');
      const data=await listOfficeAuthorityReviews({profileEntity:entities.JurisdictionProfile,
        sourceEntity:entities.PermittingSourceDocument,settingsEntity:entities.GlobalSettings,
        segmentEntity:entities.PermittingSourceTextSegment,reviewEntity:entities.PermittingOfficeAuthorityReview,
        htmlEntity:entities.PermittingHtmlEvidence},{jurisdictionId,cursor:body.cursor});
      const after=await entities.JurisdictionProfile.get(jurisdictionId);
      if (after.updated_date!==profile.updated_date) throw evidenceError('Jurisdiction changed during verification; refresh office evidence.');
      const fields=['id','relation_key','sequence','action','role','role_label','coverage_area','coverage_kind',
        'office_snapshot','source_document_id','html_evidence_id','role_proof','requested_by','requested_at',
        'verified','state','reason','is_current_review'];
      return Response.json({...data,items:data.items.map(item=>({...Object.fromEntries(fields.filter(key=>Object.hasOwn(item,key)).map(key=>[key,item[key]])),
          official_url:item.source_snapshot?.official_url || null,archived_file_url:item.source_snapshot?.archived_file_url || null})),
        profile_updated_date:after.updated_date,checked_at:new Date().toISOString(),rules_created:0});
    }
    if (action==='retrieve_evidence') {
      return Response.json(await retrieveApprovedEvidence({entities,jurisdictionId:body.jurisdiction_id,
        limit:body.limit===undefined?25:Number(body.limit),cursor:body.cursor===undefined?null:body.cursor}));
    }
    if (action==='list') {
      const query:any={};
      for (const key of ['jurisdiction_id','jurisdiction_name','rule_category','status','confidence','conflict_state','sign_type_normalized'])
        if (body[key]) query[key]=String(body[key]);
      const limit=Math.min(200,Math.max(1,Number(body.limit) || 50)),skip=Number(body.cursor || 0);
      if (!Number.isInteger(limit) || !Number.isSafeInteger(skip) || skip<0) throw evidenceError('Invalid review page range.',400);
      const sort=['id','-id','created_date','-created_date','updated_date','-updated_date'].includes(body.sort)?body.sort:'-created_date';
      const rows=await Rules.filter(query,sort,limit+1,skip);
      if (!Array.isArray(rows)) throw Error('Rule list did not return an array.');
      return Response.json({success:true,rules:rows.slice(0,limit),has_more:rows.length>limit,next_cursor:rows.length>limit?String(skip+limit):null});
    }
    if (action==='counts') {
      const query=body.jurisdiction_id?{jurisdiction_id:String(body.jurisdiction_id)}:body.jurisdiction_name?{jurisdiction_name:String(body.jurisdiction_name)}:{};
      const [total,status,category,operational,needsReview,draft,instructions]=await Promise.all([
        Rules.count(query),Rules.aggregate({query,groupBy:'status',count:true}),Rules.aggregate({query,groupBy:'rule_category',count:true}),
        Rules.count({...query,is_operational:true}),Rules.count({...query,status:'needs_review'}),Rules.count({...query,draft_context:true}),Rules.count({...query,is_workflow_instruction:true,status:'staff_approved'})]);
      return Response.json({success:true,total,operational,needs_review:needsReview,draft_context:draft,reviewed_instructions:instructions,by_status:status.rows,by_category:category.rows});
    }
    if (action==='candidate_handoff') {
      const run=await entities.PermittingRuleExtractionRun.get(String(body.run_id || ''));
      if (run?.status!=='complete' || run.method!==RULE_EVIDENCE_METHOD ||
          run.candidates_sha256!==await evidenceDigest(run.candidates || []))
        throw evidenceError('A completed unchanged extraction run is required.');
      const candidates=[];
      for (const [index,candidate] of (run.candidates || []).entries()) {
        let blocker='';
        try {
          const snapshots=await verifyRuleForApproval(candidate,{sourceEntity:entities.PermittingSourceDocument,
            segmentEntity:entities.PermittingSourceTextSegment,profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings});
          await assertApprovalSourcesCurrent(snapshots,entities.PermittingSourceDocument,{segmentEntity:entities.PermittingSourceTextSegment,
            profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings});
        } catch(error) {blocker=String(error?.message || 'Current evidence requires review.').slice(0,500);}
        candidates.push({candidate_index:index,extraction_key:candidate.extraction_key,rule_kind:ruleKind(candidate),
          evidence_ready:!blocker,blocker,applicability:candidate.evidence_context?.applicability || null,
          jurisdiction_scope:candidate.evidence_context?.jurisdiction_scope || null,imported_rule_id:run.import_receipts?.[index]?.rule_id || null});
      }
      return Response.json({success:true,run_id:run.id,candidates,checked_at:new Date().toISOString(),
        staff_approval_required:true,rules_created:0,llm_calls:0});
    }
    if (action==='import_candidate') {
      return Response.json(await importEvidenceCandidate({sourceEntity:entities.PermittingSourceDocument,segmentEntity:entities.PermittingSourceTextSegment,
        runEntity:entities.PermittingRuleExtractionRun,ruleEntity:Rules,runId:String(body.run_id || ''),candidateIndex:body.candidate_index}));
    }
    if (action==='supersede') return Response.json({error:'Supersession requires a reviewed replacement and durable reconciliation. No rule was changed.'},{status:409});
    const id=String(body.rule_id || '');
    if (!id) throw evidenceError('Select a rule.',400);
    const rule=await Rules.get(id);
    if (action==='get') return Response.json({success:true,rule});
    if (!['approve','reject','edit','resolve_conflict'].includes(action)) throw evidenceError('Unknown review action.',400);
    const expected=Number(body.expected_version);
    if (!Number.isInteger(expected) || expected<1 || rule.version!==expected) throw evidenceError('Another reviewer changed this rule; refresh before saving.');
    const reviewer={reviewer:user.full_name || user.email,reviewer_email:user.email,reviewed_at:new Date().toISOString()};
    let fields:any=action==='edit'?{}:{...reviewer};
    if (action==='resolve_conflict') {
      if (rule.conflict_state!=='conflicting_sources') throw evidenceError('This rule has no unresolved source conflict.');
      const rationale=String(body.rationale || '').trim();
      if (rationale.length<30 || rationale.length>2000 || body.reviewed_all_citations!==true)
        throw evidenceError('Review every citation and provide a resolution rationale of 30 to 2000 characters.',400);
      // This explicit staff action alone may clear the conflict flag. Every
      // retained citation must pass current authority and literal evidence gates.
      const snapshots=await verifyRuleForApproval({...rule,conflict_state:'under_review'},
        {sourceEntity:entities.PermittingSourceDocument,segmentEntity:entities.PermittingSourceTextSegment,
        profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings});
      await assertApprovalSourcesCurrent(snapshots,entities.PermittingSourceDocument,{segmentEntity:entities.PermittingSourceTextSegment,
        profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings});
      const prior=rule.evidence_context?.conflict_resolutions || [];
      if (!Array.isArray(prior)) throw evidenceError('Existing conflict history requires reconciliation.');
      fields={...fields,status:'needs_review',conflict_state:'under_review',is_operational:false,is_workflow_instruction:false,
        evidence_context:{...(rule.evidence_context || {}),conflict_resolutions:[...prior,{...reviewer,rationale,
          rule_version:rule.version,previous_conflict_state:rule.conflict_state,citations:rule.citations,
          checked_sources:snapshots.map(s=>({id:s.id,snapshot:s.snapshot}))}]}};
    } else if (action==='approve') {
      const snapshots=await verifyRuleForApproval(rule,{sourceEntity:entities.PermittingSourceDocument,segmentEntity:entities.PermittingSourceTextSegment,
        profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings});
      await assertApprovalSourcesCurrent(snapshots,entities.PermittingSourceDocument,{segmentEntity:entities.PermittingSourceTextSegment,
        profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings});
      const administrative=ruleKind(rule)==='administrative_instruction';
      fields={...fields,status:'staff_approved',rule_kind:ruleKind(rule),is_operational:!administrative,is_workflow_instruction:administrative,conflict_state:'none',
        evidence_context:{...(rule.evidence_context || {}),approved_sources:snapshots.map(s=>({id:s.id,snapshot:s.snapshot}))},
        citations:rule.citations.map(c=>({...c,verification_status:'verified'}))};
    } else if (action==='reject') {
      if (rule.status==='superseded') throw evidenceError('Superseded history is preserved.');
      fields={...fields,status:'staff_rejected',is_operational:false,is_workflow_instruction:false,
        notes:String(rule.notes || '')+(body.reason?'\n\nRejection reason: '+String(body.reason).slice(0,2000):'')};
    } else {
      if (rule.status==='superseded') throw evidenceError('Superseded history is preserved.');
      const edits=body.edits || {},allowed=['requirement','trigger','exceptions','zoning_district_applicability','numeric_value','numeric_literal',
        'unit','sign_type','sign_type_normalized','rule_category','notes','citations'];
      for (const key of allowed) if (Object.hasOwn(edits,key)) fields[key]=edits[key];
      const material=allowed.some(key=>key!=='notes' && Object.hasOwn(edits,key) && !evidenceEqual(edits[key],rule[key]));
      if (material) fields={...fields,status:rule.status==='historical'?'historical':'needs_review',is_operational:false,is_workflow_instruction:false,
        conflict_state:rule.conflict_state==='conflicting_sources'?'conflicting_sources':'under_review',
        evidence_context:{...(rule.evidence_context || {}),applicability:ruleApplicabilityEvidence({...rule,...fields})}};
    }
    return Response.json({success:true,rule:await commitRule(Rules,rule,fields,action,reviewer)});
  } catch(error) {
    console.error('permittingRuleReview:',error?.message || error);
    return Response.json({error:error?.message || 'Rule review could not complete safely.'},{status:error?.status || 500});
  }
});
