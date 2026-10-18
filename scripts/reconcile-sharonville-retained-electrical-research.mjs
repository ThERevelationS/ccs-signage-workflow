import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {normalizeOfficeResearch} from '../base44/shared/permittingOfficeResearch.mjs';
import {readSourceEvidencePages} from '../base44/shared/jurisdictionSourceTextSegments.mjs';

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath)throw Error('Provide a fresh read-only snapshot input and candidate output path; this script never writes live records.');
const input=JSON.parse(readFileSync(inputPath)),{profile,source,segments}=input;
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(profile.id,'6ac19f0e23bd8a65822f6d51');
assert.deepEqual([profile.name,profile.state,profile.type],['Sharonville','OH','city']);
assert.ok(!profile.office_research,'Do not replace existing office research');
const document=profile.documents.find(d=>d.id==='19bc3643-d404-4bcf-8cde-92c91897fd21');
assert.ok(document);
assert.equal(source.id,'6aced7f49bda8d3e61944a9d');
assert.equal(source.jurisdiction_id,profile.id);
assert.equal(source.jurisdiction_profile_doc_id,document.id);
assert.equal(source.official_url,document.url);
assert.equal(source.archived_file_url,document.file_url);
assert.equal(source.file_hash_sha256,document.stored_sha256);
assert.equal(source.file_bytes,document.stored_bytes);
assert.equal(document.catalog_state.source_document_id,source.id);
assert.equal(source.authority_classification,'administrative_guidance');
assert.equal(source.verification_status,'needs_verification');
const archive=readFileSync('docs/official-evidence/ohio-sharonville-2026-10-07/residential-guide-2026.pdf');
assert.equal(archive.length,source.file_bytes);
assert.equal(hash(archive),source.file_hash_sha256);
assert.equal(segments.length,1);
const pages=await readSourceEvidencePages({source,segmentEntity:{filter:async()=>segments},startPage:7,pageCount:2});
assert.equal(pages.pages.length,2);
const [p7,p8]=pages.pages;
for(const page of [p7,p8]){
 assert.equal(page.text_sha256,hash(page.text));
 assert.ok(!page.truncated&&!page.needs_ocr_review);
}
const issuer='Electric permits are\nissued by the City of\nSharonville.';
const inspector='All electrical inspections are handled directly by NIC.';
const delegation='In early 2020, the City of Sharonville partnered with National\nInspection Corporation (NIC) to perform electric plan review,\napprovals and inspections in an effort to improve the convenience to\nresidents and businesses.';
const intake='All electric permits and plans can be emailed or dropped off at the\nCity of Sharonville Community Development Department Office to\nstart the electric permit approval process.';
assert.ok(p8.text.includes(issuer));
for(const quote of [inspector,delegation,intake])assert.ok(p7.text.includes(quote));
const scope='Sharonville, Ohio, as named in the retained residential guide; commercial-sign and exact-site coverage remain unconfirmed.';
const caveat='Retained residential administrative guidance only. No current contract/delegation, canonical office ID, commercial-sign applicability, address authority or staff approval is established. Confirm before using for a project.';
const research=normalizeOfficeResearch({roles:[
 {role:'electrical_permit',office_name:'City of Sharonville',official_source_url:source.official_url,applicability:'unknown',
  service_area:scope,responsibility_quote:issuer,delegation_quote:null,contact_info:{},
  research_fields:{official_role_evidence:issuer,explicit_service_area:scope,
   permit_application:'Physical page 7 describes email/drop-off intake at City of Sharonville Community Development. Intake is distinct from the named issuer on page 8; current application and submission route need confirmation.',
   source_date_and_version:'Reconciled from the retained 2026-titled guide; no effective date or currentness verified.',
   document_archives_or_online_form_links:source.archived_file_url},
  notes:'Physical PDF page 8 (printed page 6) names the City as issuer. Exact issuing department/canonical office identity remains unknown. Page 7 describes intake and payment without a fee amount. '+caveat},
 {role:'electrical_inspection',office_name:'National Inspection Corporation (NIC)',official_source_url:source.official_url,applicability:'unknown',
  service_area:scope,responsibility_quote:inspector,delegation_quote:delegation,contact_info:{phone:'888-433-4642'},
  research_fields:{official_role_evidence:inspector,explicit_service_area:scope,
   inspection_provider:'National Inspection Corporation (NIC), named on physical PDF pages 7 and 8; unverified candidate.',
   delegation_or_contract_provider:delegation,
   phone_email_address:'Guide page 7 lists 888-433-4642 for specific electric permitting questions. This is not confirmed as an inspection-booking line.',
   source_date_and_version:'Reconciled from the retained 2026-titled guide; the described partnership began in early 2020, not a verified current contract.',
   document_archives_or_online_form_links:source.archived_file_url},
  notes:'Physical PDF page 7 (printed page 5) names NIC and says electrical inspections are handled directly by NIC; page 8 repeats the plan-review/inspection provider. Scheduling, stages, lead time, fees and utility release remain unknown. '+caveat}
]}, {jurisdiction:profile,now:()=>input.observed_at});
research.reconciliation={method:'retained-electrical-office-reconciliation-v1',reconciled_at:input.observed_at,
 performed_by:'Codex — authorized permitting development',research_attempts:0,llm_calls:0,
 source_document_id:source.id,profile_document_id:document.id,official_url:source.official_url,
 archived_file_url:source.archived_file_url,source_sha256:source.file_hash_sha256,file_bytes:source.file_bytes,
 source_retrieved_at:source.retrieval_timestamp,source_updated_date:source.updated_date,
 authority_classification:source.authority_classification,
 pages:[p7,p8].map(p=>({physical_page:p.page,text_sha256:p.text_sha256,method:p.method})),
 authority_approved:false,address_authority_resolved:false,commercial_sign_applicability:'unknown',
 untouched_roles:research.roles.filter(r=>!r.role.startsWith('electrical_')).map(r=>r.role)};
for(const role of research.roles){
 assert.equal(role.verification_status,'needs_verification');
 assert.equal(role.applicability,'unknown');
 assert.ok(!role.government_office_id);
 if(!role.role.startsWith('electrical_'))assert.equal(role.office_name,null);
}
const artifact={method:'retained-electrical-office-reconciliation-v1',profile_identity:{id:profile.id,name:profile.name,state:profile.state,type:profile.type},
 expected_profile_version:profile.updated_date,queue_observation:input.queue_observation,
 office_research:research,validation:{archive_hash_and_bytes:true,committed_segment_validation:true,exact_quotes_and_page_hashes:true,
 existing_office_research_absent:true,roles_separate:true,unapproved_and_unknown_scope:true},
 writes_allowed:['JurisdictionProfile.office_research'],write_performed:false};
writeFileSync(outputPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:'candidate_validated',profile_id:profile.id,roles:['electrical_permit','electrical_inspection'],physical_pages:[7,8],archive_sha256:source.file_hash_sha256,live_writes:0}));
