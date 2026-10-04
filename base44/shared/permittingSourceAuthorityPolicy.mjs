import {readSourceEvidencePages} from './jurisdictionSourceTextSegments.mjs';
export const SOURCE_SCOPE_REVIEW_METHOD='source-office-scope-v1';
export const ADMIN_SOURCE_CATEGORIES={
 application_form:['submittal_requirement','fee_timing','procedure'],
 checklist:['submittal_requirement','procedure'],
 fee_schedule:['fee_timing','procedure'],
 administrative_guidance:['submittal_requirement','fee_timing','procedure']
};
export const sourceRuleKind=source=>Object.hasOwn(ADMIN_SOURCE_CATEGORIES,source?.authority_classification || '')?'administrative_instruction':'regulatory_rule';
export const ruleKind=rule=>rule?.rule_kind || 'regulatory_rule';
export function sourceIdentity(source){
 return Object.fromEntries(['id','jurisdiction_id','jurisdiction_name','official_url','archived_file_url','file_hash_sha256','file_bytes','authority_classification'].map(k=>[k,source?.[k] ?? null]));
}
export function reviewedAdministrativeSource(source){
 const review=source?.authority_review;
 return sourceRuleKind(source)==='administrative_instruction' && source.content_status==='current' &&
  source.verification_status==='verified' && /^[a-f0-9]{64}$/.test(source.file_hash_sha256 || '') &&
  review?.method===SOURCE_SCOPE_REVIEW_METHOD && review.status==='active' && review.review_id &&
  review.reviewed_by && Number.isFinite(Date.parse(review.reviewed_at)) &&
  review.source?.id===source.id && review.source.jurisdiction_id===source.jurisdiction_id &&
  review.source.file_hash_sha256===source.file_hash_sha256 && review.source.archived_file_url===source.archived_file_url &&
  review.source.official_url===source.official_url && review.source.file_bytes===source.file_bytes &&
  review.source.authority_classification===source.authority_classification &&
  review.profile?.id===source.jurisdiction_id && review.profile.name===source.jurisdiction_name &&
  ['OH','KY'].includes(review.profile.state) && review.publisher_name===source.issuing_office &&
  review.scope_label===source.jurisdiction_scope && ['unincorporated','named_jurisdiction','listed_areas'].includes(review.scope_kind) &&
  Array.isArray(review.named_areas) && review.named_areas.length>0 &&
  Array.isArray(review.proofs) && review.proofs.length===2 && review.current_evidence_url && review.current_evidence_reference;
}
export function sourceSupportsRule(source,rule){
 if(ruleKind(rule)!=='administrative_instruction')return source?.authority_classification==='current_adopted' &&
  source.content_status==='current' && source.verification_status==='verified' && /^[a-f0-9]{64}$/.test(source.file_hash_sha256 || '');
 return Boolean(reviewedAdministrativeSource(source) && ADMIN_SOURCE_CATEGORIES[source.authority_classification]?.includes(rule.rule_category) &&
  (!rule.unit || ['dollars','days','working days','business days'].includes(rule.unit.toLowerCase())));
}
export function safeAuthorityUrl(value){
 try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !/[\u0000-\u001f\u007f]/.test(value)?u.href:'';}catch{return '';}
}

export async function assertSourceScopeReviewEvidence(source,{segmentEntity,profileEntity}){
 const fail=message=>{throw Object.assign(Error(message),{status:409});};
 if(!reviewedAdministrativeSource(source))fail('A current reviewed administrative source and office scope are required.');
 const review=source.authority_review;
 if(!profileEntity?.get)fail('Canonical profile verification is required.');
 const profile=await profileEntity.get(source.jurisdiction_id);
 if(['id','name','state','type'].some(k=>profile[k]!==review.profile[k]))fail('Canonical jurisdiction identity changed after source review.');
 if(profile.type==='county' && review.scope_kind==='named_jurisdiction')fail('County scope must explicitly name its covered areas.');
 for(const role of ['publisher','scope']){
  const proof=review.proofs.find(p=>p.role===role);
  if(!proof || !Number.isInteger(proof.physical_page) || !proof.excerpt || proof.excerpt.length>1000)fail('Office/scope evidence is incomplete.');
  const pages=await readSourceEvidencePages({source,segmentEntity,startPage:proof.physical_page,pageCount:1});
  const page=pages.pages[0];
  if(!page || page.truncated || page.needs_ocr_review || proof.text_sha256!==page.text_sha256 || !page.text.includes(proof.excerpt))
   fail('Office or scope quote/page evidence changed.');
  if(role==='publisher' && !proof.excerpt.includes(review.publisher_name))fail('Publisher identity is not literal in its cited evidence.');
  if(role==='scope' && !review.named_areas.every(area=>typeof area==='string' && area && proof.excerpt.includes(area)))fail('Covered areas are not literal in scope evidence.');
  if(role==='scope' && review.scope_kind==='unincorporated' && (!/unincorporated/i.test(proof.excerpt) || !proof.excerpt.includes(profile.name)))
   fail('Unincorporated scope is not supported by its evidence.');
 }
 return review;
}
