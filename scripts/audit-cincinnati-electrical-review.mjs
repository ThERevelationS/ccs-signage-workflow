import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {reviewedAdministrativeSource} from '../base44/shared/permittingSourceAuthorityPolicy.mjs';
import {officeRoleProofMatches} from '../base44/shared/permittingOfficeAuthority.mjs';
export function auditCincinnatiElectricalReview(snapshot){
 const {profile,document:doc,source,office}=snapshot;
 const hash='a535c6728b536e98d2a5cf36e3611fd977da18dd53cebb842b78667c940615fb';
 const pages=source.extracted_pages||[],page=pages.find(p=>p.page===2);
 const identity=profile.id==='6ac1a123edda6d8dd942690b' && profile.name==='Cincinnati' && profile.state==='OH' &&
  profile.type==='city' && source.jurisdiction_id===profile.id && source.jurisdiction_name===profile.name;
 const archive=identity && source.jurisdiction_profile_doc_id===doc.id && doc.url===source.official_url &&
  doc.file_url===source.archived_file_url && Boolean(doc.file_url) &&
  [doc.source_sha256,doc.stored_sha256,source.file_hash_sha256].every(h=>h===hash) &&
  [doc.source_bytes,doc.stored_bytes,source.file_bytes].every(n=>n===282256) &&
  doc.catalog_state?.status==='complete' && doc.catalog_state.source_document_id===source.id;
 const extraction=source.text_extraction_state?.status==='complete' &&
  source.text_extraction_state.source_sha256===hash && source.text_extraction_state.total_pages===3 &&
  source.text_extraction_state.complete_document_text===true && pages.length===3 &&
  new Set(pages.map(p=>p.page)).size===3 &&
  pages.every(p=>p.source_document_id===source.id && p.source_sha256===hash &&
   !p.truncated && !p.needs_ocr_review && createHash('sha256').update(p.text).digest('hex')===p.text_sha256);
 const snippets={electrical_permit:'A separate electrical permit is required',
  electrical_inspection:'Electrical Inspection - If the sign is illuminated or wired for electricity, contact IBI at 381-6080.'};
 const roles=Object.fromEntries(Object.entries(snippets).map(([role,excerpt])=>[role,{
  source_document_id:source.id,physical_page:2,text_sha256:page?.text_sha256,
  retained_quote_matches:Boolean(page?.text.includes(excerpt)),
  existing_role_gate_accepts:officeRoleProofMatches(role,excerpt),
  ready_for_approval:false,
  followup:role==='electrical_permit'?'Obtain explicit current permit issuer responsibility evidence.':'Support city-to-IBI delegation separately from source publisher; confirm current inspection scope.'
 }]));
 return {observed_at:snapshot.observed_at,jurisdiction_id:profile.id,
  existing_source_document_id:source.id,archive_registered:archive,extraction_integrity_verified:extraction,
  duplicate_upload_needed:false,source_scope_review_passes:reviewedAdministrativeSource(source),
  office_identity_status:office.government_office?.verification_status||'missing',roles,
  publisher_responsible_office_separation_required:true,
  source_review_needed:true,staff_approved:false,authority_verified:false,
  implementation_gap:'PDF responsibility review currently requires target office to match source publisher. HTML delegation path is zoning-only. Do not rename City publisher to IBI or weaken current review gates.',
  next_steps:['Review current City administrative source publisher/scope',
   'Verify IBI canonical office identity independently','Implement explicit municipal PDF delegation evidence with separate publisher and responsible office',
   'Review inspection and permit issuance separately; a contact instruction does not prove issuer responsibility']};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/sign-scope/';
 const audit=auditCincinnatiElectricalReview(JSON.parse(readFileSync(root+'electrical-review-readiness-snapshot.json','utf8')));
 writeFileSync(root+'electrical-review-readiness.json',JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify(audit,null,2));
}
