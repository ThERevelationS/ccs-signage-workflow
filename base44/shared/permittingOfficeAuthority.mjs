import {verifyPdfOfficeDelegation} from './permittingPdfOfficeDelegation.mjs';
import {evidenceDigest,evidenceEqual,evidenceError,sourceAuthoritySnapshot} from './permittingRuleEvidence.mjs';
import {assertSourceScopeReviewEvidence,safeAuthorityUrl} from './permittingSourceAuthorityPolicy.mjs';
import {readSourceEvidencePages} from './jurisdictionSourceTextSegments.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from './jurisdictionPersistence.mjs';

import {verifyHtmlOfficeDelegation} from './permittingHtmlOfficeDelegation.mjs';
const evidenceFields=['profile_snapshot','office_snapshot','source_snapshot','source_review_id','role_proof','coverage_area',
 'evidence_kind','html_evidence_id','publisher_snapshot','office_link_proof','role','role_label','coverage_kind','coverage_basis','source_profile_id'];

export const OFFICE_AUTHORITY_METHOD='office-authority-v1';
export const OFFICE_AUTHORITY_ROLES=['sign_permit','zoning','building','electrical','electrical_permit','electrical_inspection','right_of_way','historic_review','planning','transportation','other'];
const profileIdentity=p=>Object.fromEntries(['id','name','state','type'].map(k=>[k,p[k] ?? null]));
const clean=(value,max=1000)=>{if(typeof value!=='string')return '';const v=value.trim();if(v.length>max)throw evidenceError('Review field exceeds its processing bound.',400);return v;};
const requestKey=(profile,id)=>'office-authority:'+profile+':'+id;
const validRequest=id=>/^[a-zA-Z0-9_-]{16,100}$/.test(id || '');
const roleSignals={sign_permit:/sign[\s-]*(?:permit|application)|(?:permit|application)[\s-]*sign/i,
 zoning:/zoning/i,building:/building/i,electrical:/electric(?:al)?/i,right_of_way:/right[ -]of[ -]way|public works/i,
 historic_review:/historic|design review/i,planning:/planning/i,transportation:/transportation|department of transportation/i};
// Separate electrical responsibilities require their own explicit affirmative quote.
// These lexical gates supplement retained-page, canonical-office and staff scope review.
export function officeRoleProofMatches(role,excerpt,label='') {
 if(typeof excerpt!=='string')return false;
 if(role==='other')return Boolean(label && excerpt.includes(label));
 if(['electrical_permit','electrical_inspection'].includes(role)){
  if(/\b(?:not|never|no|cannot|can't|doesn't|don't|without)\b/i.test(excerpt))return false;
  if(!/\belectric(?:al)?\b/i.test(excerpt))return false;
  if(role==='electrical_permit')return /\bpermits?\b/i.test(excerpt) && /\b(?:issu(?:e|es|ed|ing)|permitting|process(?:es|ed|ing)?|handl(?:e|es|ed|ing))\b/i.test(excerpt);
  return /\binspections?\b/i.test(excerpt) && /\b(?:perform(?:s|ed|ing)?|conduct(?:s|ed|ing)?|provid(?:e|es|ed|ing)|inspect(?:s|ed|ing)|responsib(?:le|ility))\b/i.test(excerpt);
 }
 return Boolean(roleSignals[role]?.test(excerpt));
}
export async function canonicalAuthorityOffice(settingsEntity,id,publisher,state){
 const rows=await settingsEntity.filter({setting_key:'permitOfficeCatalog'},'id',2,0);
 if(!Array.isArray(rows) || rows.length!==1 || !Array.isArray(rows[0].setting_value?.items))throw evidenceError('Shared office catalog is missing or ambiguous.');
 const catalog=rows[0].setting_value.items,matches=catalog.filter(o=>(o.government_office_id || o.id)===id);
 const office=matches[0],meta=office?.government_office;
 if(matches.length!==1 || catalog.filter(o=>o.id===office?.id).length!==1 || !office?.id ||
  meta?.verification_status!=='staff_verified' || !meta.verified_by || !Number.isFinite(Date.parse(meta.verified_at)) ||
  (publisher!==undefined && (meta.name || office.name)!==publisher) || (state!==undefined && meta.state!==state) || !safeAuthorityUrl(meta.source_url))
  throw evidenceError('Select a unique, current staff-verified canonical publisher office. A copied name/type does not establish identity.');
 return {government_office_id:id,catalog_office_id:office.id,name:meta.name || office.name,
  phone:meta.phone ?? office.contact_phone ?? '',email:meta.email ?? office.contact_email ?? '',
  website:meta.website ?? office.contact_website ?? '',address:meta.address ?? office.contact_address ?? '',
  source_url:meta.source_url,verified_by:meta.verified_by,verified_at:meta.verified_at,verification_status:meta.verification_status};
}
async function verifyEvidence(deps,profile,input){
 if(input.evidence_kind && !['official_html','pdf','pdf_delegation'].includes(input.evidence_kind))throw evidenceError('Unknown relationship evidence kind.',400);
 if(input.evidence_kind==='pdf_delegation')return verifyPdfOfficeDelegation(deps,profile,input,canonicalAuthorityOffice);
 if(input.evidence_kind==='official_html')return verifyHtmlOfficeDelegation(deps,profile,input,canonicalAuthorityOffice);
 if(input.html_evidence_id)throw evidenceError('HTML evidence requires an explicit native evidence kind.',400);
 const {sourceEntity,segmentEntity,profileEntity,settingsEntity}=deps;
 if(!profile?.id || !['OH','KY'].includes(profile.state))throw evidenceError('Select a canonical Ohio/Kentucky jurisdiction.',400);
 const sourceId=clean(input.source_document_id,100),officeId=clean(input.government_office_id,200);
 const role=clean(input.role,60),area=clean(input.coverage_area,200),notes=clean(input.review_notes,2000),label=clean(input.role_label,120);
 if(!sourceId || !officeId || !OFFICE_AUTHORITY_ROLES.includes(role) || !area || !notes || input.responsibility_confirmed!==true)
  throw evidenceError('Source, canonical office, role, explicit covered area, review notes and staff responsibility confirmation are required.',400);
 const source=await sourceEntity.get(sourceId);
 const scope=await assertSourceScopeReviewEvidence(source,{segmentEntity,profileEntity,settingsEntity});
 if(scope.profile.state!==profile.state || !scope.named_areas.includes(area))throw evidenceError('Coverage must be explicitly quoted in a current source review for the same state.');
 if(profile.type==='county'){
  if(!/unincorporated/i.test(area) || !area.includes(profile.name))throw evidenceError('County relationships must be limited to the quoted unincorporated area; cities are reviewed separately.');
 }else if(!['city','village','municipality','township'].includes(profile.type) || area!==profile.name)
  throw evidenceError('The quoted named service area must exactly match the target canonical jurisdiction.');
 const office=await canonicalAuthorityOffice(settingsEntity,officeId,scope.publisher_name);
 if(scope.office_reference && scope.office_reference.government_office_id!==officeId)throw evidenceError('The source publisher references another canonical office.');
 const raw=input.role_proof;
 if(!Number.isInteger(raw?.physical_page) || raw.physical_page<1 || typeof raw.excerpt!=='string' ||
  raw.excerpt.trim().length<10 || raw.excerpt.length>1000)throw evidenceError('Role evidence requires an exact retained physical-page quote.',400);
 const pages=await readSourceEvidencePages({source,segmentEntity,startPage:raw.physical_page,pageCount:1}),page=pages.pages[0];
 if(!page || page.truncated || page.needs_ocr_review || !page.text.includes(raw.excerpt))throw evidenceError('Role quote is not exact retained page evidence.');
 if(!officeRoleProofMatches(role,raw.excerpt,label))
  throw evidenceError('The quote must explicitly identify the selected role; an unrelated form attachment does not automatically establish office responsibility.');
 return {profile_snapshot:profileIdentity(profile),office_snapshot:office,source_document_id:source.id,
  source_snapshot:sourceAuthoritySnapshot(source),source_review_id:scope.review_id,role,role_label:label || role,
  coverage_area:area,coverage_kind:profile.type==='county'?'unincorporated':'named_jurisdiction',
  coverage_basis:source.jurisdiction_id===profile.id?'same_profile_scope':'explicit_named_service_area',
  source_profile_id:source.jurisdiction_id,role_proof:{physical_page:page.page,text_sha256:page.text_sha256,excerpt:raw.excerpt},
  review_notes:notes,responsibility_confirmed:true,address_authority_resolved:false};
}
async function writeLedger(profileEntity,profile,next,expected){
 try{return await replaceJurisdictionFieldsIfUnchanged({entity:profileEntity,jurisdiction:profile,
  nextFields:{office_authority_review_state:next},guardFields:{...profileIdentity(profile),office_authority_review_state:expected},
  label:'Office authority review',maxAttempts:1});}
 catch(error){
  const after=await profileEntity.get(profile.id).catch(()=>null);
  if(after && evidenceEqual(after.office_authority_review_state,next) && evidenceEqual(profileIdentity(after),profileIdentity(profile)))return after;
  throw evidenceError(error.message);
 }
}
const findRequest=async(entity,key)=>{
 const rows=await entity.filter({request_key:key},'created_date',2,0);
 if(!Array.isArray(rows) || rows.length>1)throw evidenceError('Office review request identity is ambiguous.');
 return rows[0] || null;
};
async function finalizeReceipt(deps,event){
 const profile=await deps.profileEntity.get(event.jurisdiction_id),old=profile.office_authority_review_state || {};
 if(Number(old.committed_sequence || 0)>=event.sequence)return profile;
 if(old.request_key!==event.request_key || old.payload_sha256!==event.payload_sha256 || old.sequence!==event.sequence ||
  old.requested_by!==event.requested_by || !evidenceEqual(profileIdentity(profile),event.profile_snapshot))
  throw evidenceError('Saved office review requires reconciliation against its original reservation.');
 return writeLedger(deps.profileEntity,profile,{...old,status:'complete',committed_sequence:event.sequence,review_id:event.id},old);
}
export async function reviewOfficeAuthority(deps,{jurisdictionId,input={},action='verify',requestId,expectedUpdatedDate,dryRun=false,actor,now=()=>Date.now()}){
 if(!actor || !jurisdictionId || !['verify','revoke'].includes(action) || (!dryRun && !validRequest(requestId)))
  throw evidenceError('Select a jurisdiction, authenticated reviewer and stable review request.',400);
 let profile=await deps.profileEntity.get(jurisdictionId);
 if(profile.id!==jurisdictionId)throw evidenceError('Canonical target identity differs.');
 const key=requestKey(jurisdictionId,requestId),digest=await evidenceDigest({jurisdiction_id:jurisdictionId,action,input});
 const oldRaw=profile.office_authority_review_state,old=oldRaw || {};
 const saved=dryRun?null:await findRequest(deps.reviewEntity,key);
 if(saved){
  if(saved.payload_sha256!==digest || saved.requested_by!==actor || saved.jurisdiction_id!==jurisdictionId)throw evidenceError('Saved request belongs to another decision or reviewer.');
  await finalizeReceipt(deps,saved);
  return{success:true,status:'recorded',replayed:true,review:saved,llm_calls:0};
 }
 if(!dryRun && old.request_key===key){
  if(old.payload_sha256!==digest || old.requested_by!==actor)throw evidenceError('Reserved request belongs to another decision or reviewer.');
  if(['creating','uncertain'].includes(old.status))return{success:false,status:'review_uncertain',error:'No prior review is visible. Its uncertain create was not repeated.',llm_calls:0};
 }
 if(['creating','uncertain'].includes(old.status))throw evidenceError('Reconcile the pending office review before another decision.');
 if(!dryRun && (!expectedUpdatedDate || profile.updated_date!==expectedUpdatedDate))throw evidenceError('Jurisdiction changed; preview current evidence before saving.');
 const committed=Number(old.committed_sequence || 0);
 if(!Number.isSafeInteger(committed) || committed<0)throw evidenceError('Office review sequence requires reconciliation.');
 let fields;
 if(action==='verify'){
  try{fields=await verifyEvidence(deps,profile,input);}
  catch(error){
   if(!dryRun && input.evidence_kind==='official_html')return{success:false,status:'not_recorded',retry_safe:true,error:error.message,llm_calls:0};
   throw error;
  }
  fields.relation_key=await evidenceDigest({jurisdiction_id:jurisdictionId,government_office_id:fields.office_snapshot.government_office_id,
   role:fields.role,coverage_area:fields.coverage_area});
 }else{
  const previous=await deps.reviewEntity.get(clean(input.revoke_review_id,100));
  const notes=clean(input.review_notes,2000);
  if(!notes || previous.jurisdiction_id!==jurisdictionId || previous.sequence>committed)throw evidenceError('Select a committed review for this jurisdiction and enter revocation notes.',400);
  const latest=await deps.reviewEntity.filter({jurisdiction_id:jurisdictionId,relation_key:previous.relation_key,sequence:{$lte:committed}},'-sequence',2,0);
  if(latest[0]?.id!==previous.id || previous.action!=='verify')throw evidenceError('The selected review is no longer the current relationship.');
  fields={...previous,review_notes:notes,replaces_review_id:previous.id};
  for(const k of ['id','created_date','updated_date','created_by','created_by_id','is_sample'])delete fields[k];
 }
 const event={...fields,request_key:key,payload_sha256:digest,jurisdiction_id:jurisdictionId,profile_snapshot:profileIdentity(profile),
  method:OFFICE_AUTHORITY_METHOD,action,sequence:committed+1,requested_by:actor,requested_at:new Date(now()).toISOString(),review_input:input};
 if(dryRun)return{success:true,dry_run:true,proposal:event,expected_updated_date:profile.updated_date,llm_calls:0};
 const reservation={request_key:key,payload_sha256:digest,sequence:event.sequence,committed_sequence:committed,
  requested_by:actor,status:'creating',operation_id:crypto.randomUUID()};
 profile=await writeLedger(deps.profileEntity,profile,reservation,oldRaw);
 if(action==='verify'){
  try{
   const freshProfile=await deps.profileEntity.get(jurisdictionId),fresh=await verifyEvidence(deps,freshProfile,input);
   for(const k of evidenceFields)
    if(!evidenceEqual(fresh[k],event[k]))throw evidenceError('Source, profile or office evidence changed before recording this review.');
  }catch(error){
   // No create has been attempted: releasing this exact reservation is safe.
   const current=await deps.profileEntity.get(jurisdictionId);
   await writeLedger(deps.profileEntity,current,{...reservation,status:'not_recorded',sequence:committed},reservation);
   return{success:false,status:'not_recorded',retry_safe:true,error:error.message,llm_calls:0};
  }
 }
 try{await deps.reviewEntity.create(event);}catch{/* Only exact readback: never retry an uncertain event create. */}
 const found=await findRequest(deps.reviewEntity,key);
 if(!found){
  const current=await deps.profileEntity.get(jurisdictionId);
  await writeLedger(deps.profileEntity,current,{...reservation,status:'uncertain'},reservation);
  return{success:false,status:'review_uncertain',error:'Review create could not be confirmed. Resume the same saved decision.',llm_calls:0};
 }
 if(found.payload_sha256!==digest || found.requested_by!==actor || found.sequence!==event.sequence)throw evidenceError('Recorded review conflicts with its reservation.');
 await finalizeReceipt(deps,found);
 return{success:true,status:'recorded',review:found,llm_calls:0};
}
export async function assessOfficeAuthorityReview(deps,event,profile){
 if(event.action==='revoke')return{verified:false,state:'revoked',reason:'Staff revoked this relationship.'};
 if(event.method!==OFFICE_AUTHORITY_METHOD || event.action!=='verify' || !event.requested_by || !Number.isFinite(Date.parse(event.requested_at)) ||
  !event.review_input || typeof event.review_input!=='object' || !event.source_snapshot || !event.office_snapshot || !event.profile_snapshot)
  return{verified:false,state:'needs_review',reason:'Incomplete relationship review history.'};
 try{
  const fresh=await verifyEvidence(deps,profile,event.review_input);
  for(const k of evidenceFields)
   if(!evidenceEqual(fresh[k],event[k]))throw evidenceError('Relationship identity or supporting source evidence changed.');
  return{verified:true,state:'staff_verified',reason:'Current office, role and explicit covered-area evidence.'};
 }catch(error){
  const status=error.status || error.response?.status;
  return{verified:false,state:[400,404,409].includes(status)?'needs_review':'verification_unavailable',reason:error.message};
 }
}
export async function listOfficeAuthorityReviews(deps,{jurisdictionId,cursor}){
 const profile=await deps.profileEntity.get(jurisdictionId),committed=Number(profile.office_authority_review_state?.committed_sequence || 0);
 if(!Number.isSafeInteger(committed) || committed<0)throw evidenceError('Office review sequence requires reconciliation.');
 const query={jurisdiction_id:jurisdictionId,sequence:{$lte:committed}};
 if(cursor!==undefined && cursor!==null && cursor!==''){
  const value=Number(cursor);if(!Number.isSafeInteger(value) || value<1)throw evidenceError('Invalid office review cursor.',400);
  query.sequence.$lt=value;
 }
 const rows=await deps.reviewEntity.filter(query,'-sequence',6,0),items=[];
 if(!Array.isArray(rows))throw Error('Office review list did not return an array.');
 for(const event of rows.slice(0,5)){
  const latest=await deps.reviewEntity.filter({jurisdiction_id:jurisdictionId,relation_key:event.relation_key,sequence:{$lte:committed}},'-sequence',2,0);
  const ambiguous=latest.length>1 && latest[0].sequence===latest[1].sequence;
  const current=!ambiguous && latest[0]?.id===event.id;
  const assessment=current?await assessOfficeAuthorityReview(deps,event,profile):{verified:false,state:ambiguous?'needs_review':'historical',reason:ambiguous?'Ambiguous review ordering.':'A newer review exists for this role and covered area.'};
  items.push({...event,...assessment,is_current_review:current});
 }
 return{success:true,items,has_more:rows.length>5,next_cursor:rows.length>5?String(rows[4].sequence):null,
  jurisdiction_id:jurisdictionId,address_authority_resolved:false,llm_calls:0};
}
export async function getOfficeAuthorityRequest(deps,{jurisdictionId,requestId}){
 if(!validRequest(requestId))throw evidenceError('Stable review request id required.',400);
 const event=await findRequest(deps.reviewEntity,requestKey(jurisdictionId,requestId)),profile=await deps.profileEntity.get(jurisdictionId);
 return{success:true,review:event,committed:Boolean(event && event.sequence<=Number(profile.office_authority_review_state?.committed_sequence || 0)),
  receipt:profile.office_authority_review_state || null,llm_calls:0};
}
