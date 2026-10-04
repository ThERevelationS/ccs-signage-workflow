import {readSourceEvidencePages} from './jurisdictionSourceTextSegments.mjs';
import {evidenceDigest,evidenceEqual,evidenceError} from './permittingRuleEvidence.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from './jurisdictionPersistence.mjs';
import {sourceIdentity,sourceRuleKind,SOURCE_SCOPE_REVIEW_METHOD,safeAuthorityUrl,assertSourceScopeReviewEvidence} from './permittingSourceAuthorityPolicy.mjs';
const clean=(v,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
const profileIdentity=p=>Object.fromEntries(['id','name','state','type'].map(k=>[k,p[k]]));
const reviewFields=['authority_review','issuing_office','jurisdiction_scope','content_status','verification_status','authority_confidence','reviewer'];
const metadata=s=>Object.fromEntries(reviewFields.map(k=>[k,s[k] ?? null]));
async function write(sourceEntity,source,nextFields,guards){
 try{return await replaceJurisdictionFieldsIfUnchanged({entity:sourceEntity,jurisdiction:source,nextFields,guardFields:guards,label:'Source authority review'});}
 catch(error){throw evidenceError(error.message);}
}
async function buildReview({source,profile,segmentEntity,settingsEntity,input,requestId,actor,now}){
 if(sourceRuleKind(source)!=='administrative_instruction')throw evidenceError('This review route covers forms, checklists, fee schedules and administrative guidance. Adopted-code review remains separate.',400);
 if(source.jurisdiction_name!==profile.name || !['OH','KY'].includes(profile.state))throw evidenceError('Source and canonical Ohio/Kentucky jurisdiction must match.');
 const publisher=clean(input.publisher_name,200),label=clean(input.scope_label,500),kind=String(input.scope_kind || '');
 const areas=Array.isArray(input.named_areas)?[...new Set(input.named_areas.map(a=>clean(a,120)))]:[];
 if(!publisher || !label || !['unincorporated','named_jurisdiction','listed_areas'].includes(kind) || !areas.length || areas.length>20 || areas.some(a=>!a))
  throw evidenceError('Select a publisher and explicit bounded scope/covered areas.',400);
 if(profile.type==='county' && kind==='named_jurisdiction')throw evidenceError('County coverage must explicitly identify unincorporated or listed areas; the county name alone does not establish authority over cities.',400);
 const evidenceUrl=safeAuthorityUrl(input.current_evidence_url),reference=clean(input.current_evidence_reference,500),notes=clean(input.review_notes,2000);
 if(input.current_source_confirmed!==true || !evidenceUrl || !reference || !notes)throw evidenceError('Staff confirmation of current source, official evidence/reference and review notes is required.',400);
 const proofs=[];
 for(const role of ['publisher','scope']){
  const raw=input[role+'_proof'],pageNumber=raw?.physical_page;
  if(!Number.isInteger(pageNumber) || pageNumber<1 || typeof raw.excerpt!=='string' || raw.excerpt.trim().length<10 || raw.excerpt.length>1000)
   throw evidenceError('Publisher and scope each require a literal retained physical-page quote.',400);
  const evidence=await readSourceEvidencePages({source,segmentEntity,startPage:pageNumber,pageCount:1}),page=evidence.pages[0];
  if(!page || page.truncated || page.needs_ocr_review || !page.text.includes(raw.excerpt))throw evidenceError('Publisher/scope quote is not exact retained page evidence.');
  proofs.push({role,physical_page:pageNumber,text_sha256:page.text_sha256,excerpt:raw.excerpt});
 }
 let officeReference=null;
 if(input.government_office_id){
  const rows=await settingsEntity.filter({setting_key:'permitOfficeCatalog'},'id',2,0);
  if(rows.length!==1 || !Array.isArray(rows[0].setting_value?.items))throw evidenceError('Shared office catalog is missing or ambiguous.');
  const matches=rows[0].setting_value.items.filter(o=>(o.government_office_id || o.id)===input.government_office_id);
  if(matches.length!==1 || matches[0].government_office?.verification_status!=='staff_verified' ||
     (matches[0].government_office.name || matches[0].name)!==publisher)
   throw evidenceError('Canonical publisher office identity must be uniquely staff verified and match the literal publisher.');
  officeReference={government_office_id:input.government_office_id,catalog_office_id:matches[0].id,
   source_url:matches[0].government_office.source_url,identity_status:'staff_verified',
   locality_authority_established:false};
 }
 const review={method:SOURCE_SCOPE_REVIEW_METHOD,status:'active',review_id:requestId,source:sourceIdentity(source),
  profile:profileIdentity(profile),publisher_name:publisher,scope_label:label,scope_kind:kind,named_areas:areas,
  proofs,current_evidence_url:evidenceUrl,current_evidence_reference:reference,review_notes:notes,office_reference:officeReference,
  reviewed_by:actor,reviewed_at:new Date(now()).toISOString(),destination_authority_resolved:false};
 const proposal={...source,authority_review:review,issuing_office:publisher,jurisdiction_scope:label,
  content_status:'current',verification_status:'verified',authority_confidence:'high',reviewer:actor};
 await assertSourceScopeReviewEvidence(proposal,{segmentEntity,profileEntity:{get:async()=>profile}});
 return {authority_review:review,issuing_office:publisher,jurisdiction_scope:label,content_status:'current',
  verification_status:'verified',authority_confidence:'high',reviewer:actor};
}
export async function reviewSourceAuthority({sourceEntity,profileEntity,segmentEntity,settingsEntity,auditEntity,
 sourceDocumentId,input={},action='verify',requestId,expectedUpdatedDate,dryRun=false,actor,now=()=>Date.now()}){
 if(!actor || !sourceDocumentId || !['verify','revoke'].includes(action))throw evidenceError('A selected source and authenticated reviewer are required.',400);
 if(!dryRun && !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId || ''))throw evidenceError('A stable manual review request id is required.',400);
 let source=await sourceEntity.get(sourceDocumentId),profile=await profileEntity.get(source.jurisdiction_id);
 const payloadDigest=await evidenceDigest({source_document_id:sourceDocumentId,action,input});
 const key='source-authority-review:'+requestId,oldState=source.authority_review_state || {};
 let audit;
 if(!dryRun){
  const rows=await auditEntity.filter({request_key:key},'created_date',2,0);
  if(rows.length>1)throw evidenceError('Review request identity is ambiguous.');
  audit=rows[0];
  if(audit && (audit.payload_sha256!==payloadDigest || audit.source_document_id!==sourceDocumentId || audit.requested_by!==actor))
   throw evidenceError('This review request belongs to another source, reviewer or decision.');
  if(audit && Object.entries(audit.next_fields).every(([k,v])=>evidenceEqual(source[k],v))){
   if(!evidenceEqual(sourceIdentity(source),audit.source_identity))throw evidenceError('Applied review archive identity changed.');
   return {success:true,status:'applied',replayed:true,review:source.authority_review,llm_calls:0};
  }
  if(!audit && (!expectedUpdatedDate || source.updated_date!==expectedUpdatedDate))throw evidenceError('Source changed; preview current evidence before reviewing.');
  if(['creating','uncertain'].includes(oldState.status) && oldState.request_key!==key)throw evidenceError('Reconcile the prior uncertain source review before another decision.');
 }
 if(audit){
  if(!evidenceEqual(sourceIdentity(source),audit.source_identity) || !evidenceEqual(profileIdentity(profile),audit.profile) ||
     !evidenceEqual(metadata(source),audit.before_fields))throw evidenceError('Source or authority identity changed before review application.');
 }else{
  let nextFields;
  if(action==='verify')nextFields=await buildReview({source,profile,segmentEntity,settingsEntity,input,requestId:requestId || 'preview',actor,now});
  else{
   if(!source.authority_review)throw evidenceError('There is no structured source review to revoke.',400);
   nextFields={authority_review:{...source.authority_review,status:'revoked',review_id:requestId || 'preview',
     revoked_review_id:source.authority_review.review_id,revoked_by:actor,revoked_at:new Date(now()).toISOString()},
     verification_status:'needs_verification',authority_confidence:'unverified',reviewer:actor};
  }
  if(dryRun)return{success:true,dry_run:true,expected_updated_date:source.updated_date,source_document_id:source.id,
   proposal:nextFields,profile:profileIdentity(profile),llm_calls:0};
  audit={request_key:key,source_document_id:source.id,source_identity:sourceIdentity(source),profile:profileIdentity(profile),
   payload_sha256:payloadDigest,before_fields:metadata(source),next_fields:nextFields,action,requested_by:actor,requested_at:new Date(now()).toISOString()};
 }
 const creating={request_key:key,payload_sha256:payloadDigest,status:'creating'};
 source=await write(sourceEntity,source,{authority_review_state:creating},{...audit.source_identity,authority_review_state:oldState});
 if(!audit.id){
  if(oldState.request_key===key && ['creating','uncertain'].includes(oldState.status)){
   await write(sourceEntity,source,{authority_review_state:{...creating,status:'uncertain'}},{...audit.source_identity,authority_review_state:creating});
   return{success:false,status:'review_uncertain',llm_calls:0,error:'No prior audit is visible; the uncertain create was not repeated.'};
  }
  try{await auditEntity.create(audit);}catch{/* Exact readback only; never repeat an uncertain audit create. */}
  const found=await auditEntity.filter({request_key:key},'created_date',2,0);
  if(found.length>1)throw evidenceError('Review audit identity became ambiguous.');
  audit=found[0];
  if(!audit){
   await write(sourceEntity,source,{authority_review_state:{...creating,status:'uncertain'}},{...sourceIdentity(source),authority_review_state:creating});
   return{success:false,status:'review_uncertain',llm_calls:0,error:'Review audit create could not be confirmed; no authority fields were changed.'};
  }
 }
 if(audit.payload_sha256!==payloadDigest || !evidenceEqual(sourceIdentity(source),audit.source_identity) ||
    !evidenceEqual(metadata(source),audit.before_fields))throw evidenceError('Saved review intent conflicts with current source evidence.');
 profile=await profileEntity.get(source.jurisdiction_id);
 if(!evidenceEqual(profileIdentity(profile),audit.profile))throw evidenceError('Canonical jurisdiction changed during review.');
 if(action==='verify')await assertSourceScopeReviewEvidence({...source,...audit.next_fields},{segmentEntity,profileEntity});
 const fields={...audit.next_fields,authority_review_state:{...creating,status:'complete',audit_id:audit.id}};
 source=await write(sourceEntity,{...source,...audit.before_fields},fields,{...audit.source_identity,authority_review_state:creating});
 return{success:true,status:'applied',review:source.authority_review,audit_id:audit.id,llm_calls:0};
}
