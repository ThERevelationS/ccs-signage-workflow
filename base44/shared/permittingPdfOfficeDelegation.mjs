import {evidenceError,sourceAuthoritySnapshot} from './permittingRuleEvidence.mjs';
import {assertSourceScopeReviewEvidence,safeAuthorityUrl} from './permittingSourceAuthorityPolicy.mjs';
import {readSourceEvidencePages} from './jurisdictionSourceTextSegments.mjs';
const identity=p=>Object.fromEntries(['id','name','state','type'].map(k=>[k,p[k] ?? null]));
export function explicitElectricalDelegation(role,excerpt,officeName){
 if(typeof excerpt!=='string' || typeof officeName!=='string' || !officeName) return false;
 const prefix=role==='electrical_permit'?'Electrical permits are issued by ':
  role==='electrical_inspection'?'Electrical inspections are performed by ':null;
 return Boolean(prefix && excerpt===prefix+officeName+(officeName.endsWith('.')?'':'.') &&
  !/\b(?:not|never|no|cannot|without)\b/i.test(excerpt));
}
export async function verifyPdfOfficeDelegation(deps,profile,input,getOffice){
 if(!['city','village','municipality'].includes(profile?.type) || !['OH','KY'].includes(profile.state) ||
  !['electrical_permit','electrical_inspection'].includes(input.role) || input.coverage_area!==profile.name ||
  input.responsibility_confirmed!==true || input.html_evidence_id)
  throw evidenceError('PDF delegation requires a municipality, exact coverage and one separate electrical role.',400);
 for(const field of ['source_document_id','government_office_id','review_notes']){
  const max=field==='review_notes'?2000:200;
  if(typeof input[field]!=='string' || !input[field].trim() || input[field].length>max)
   throw evidenceError('Bounded source, responsible office and review notes are required.',400);
 }
 if(input.role_label && input.role_label!==input.role)throw evidenceError('PDF delegation uses the selected electrical role label.',400);
 const source=await deps.sourceEntity.get(input.source_document_id);
 const scope=await assertSourceScopeReviewEvidence(source,deps);
 if(source.jurisdiction_id!==profile.id || scope.profile.id!==profile.id ||
  scope.scope_kind!=='named_jurisdiction' || scope.named_areas.length!==1 || scope.named_areas[0]!==profile.name ||
  !scope.office_reference?.government_office_id)
  throw evidenceError('A current same-municipality source with reviewed canonical publisher and exact named scope is required.');
 const official=safeAuthorityUrl(source.official_url);
 const hosts=[profile.website_url,profile.permitting_url].map(safeAuthorityUrl).filter(Boolean).map(u=>new URL(u).hostname);
 if(!official || !hosts.includes(new URL(official).hostname))throw evidenceError('Delegation source must be on the publishing municipality official host.');
 const docs=(profile.documents || []).filter(d=>d.id===source.jurisdiction_profile_doc_id),doc=docs[0];
 if(docs.length!==1 || doc.url!==source.official_url || doc.file_url!==source.archived_file_url ||
  !safeAuthorityUrl(doc.file_url) || !/^[a-f0-9]{64}$/.test(source.file_hash_sha256 || '') ||
  doc.source_sha256!==source.file_hash_sha256 || doc.stored_sha256!==source.file_hash_sha256 ||
  !Number.isSafeInteger(source.file_bytes) || source.file_bytes<1 ||
  doc.source_bytes!==source.file_bytes || doc.stored_bytes!==source.file_bytes)
  throw evidenceError('Municipal delegation requires an exact byte-verified profile archive link.');
 const publisher=await getOffice(deps.settingsEntity,scope.office_reference.government_office_id,scope.publisher_name,profile.state);
 const office=await getOffice(deps.settingsEntity,input.government_office_id,undefined,profile.state);
 if(publisher.government_office_id===office.government_office_id)throw evidenceError('Use the existing publisher role path for the same office.');
 const raw=input.role_proof;
 if(!Number.isInteger(raw?.physical_page) || raw.physical_page<1 || typeof raw.excerpt!=='string' || raw.excerpt.length>1000)
  throw evidenceError('An exact retained physical-page delegation sentence is required.',400);
 const evidence=await readSourceEvidencePages({source,segmentEntity:deps.segmentEntity,startPage:raw.physical_page,pageCount:1});
 const page=evidence.pages[0];
 if(!page || page.truncated || page.needs_ocr_review || !page.text.includes(raw.excerpt) ||
  !explicitElectricalDelegation(input.role,raw.excerpt,office.name))
  throw evidenceError('Quote explicit electrical permit issuance or inspection performance by the exact verified responsible office. Contact instructions do not qualify.');
 return {evidence_kind:'pdf_delegation',profile_snapshot:identity(profile),publisher_snapshot:publisher,
  office_snapshot:office,source_document_id:source.id,source_snapshot:sourceAuthoritySnapshot(source),
  source_review_id:scope.review_id,role:input.role,role_label:input.role,coverage_area:profile.name,
  coverage_kind:'named_jurisdiction',coverage_basis:'explicit_municipal_pdf_delegation',source_profile_id:profile.id,
  role_proof:{physical_page:page.page,text_sha256:page.text_sha256,excerpt:raw.excerpt},
  review_notes:input.review_notes.trim(),responsibility_confirmed:true,address_authority_resolved:false,
  regulatory_authority_established:false};
}
