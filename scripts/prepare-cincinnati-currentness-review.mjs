import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectHtmlText} from '../base44/shared/permittingHtmlEvidence.mjs';
const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/';
const folder=root+'currentness-review/';
const manifest=JSON.parse(readFileSync(folder+'manifest.json'));
const snapshot=JSON.parse(readFileSync(root+'sign-scope/electrical-review-readiness-snapshot.json'));
const hash=value=>createHash('sha256').update(value).digest('hex');
for(const source of manifest.sources){
 if(source.status!=='archived')throw Error('Missing retained currentness evidence: '+source.title);
 const bytes=readFileSync(source.retained_path);
 if(hash(bytes)!==source.retrieved_sha256 || bytes.length!==source.retrieved_bytes)throw Error('Retained currentness evidence changed: '+source.title);
 if(source.file.endsWith('.pdf') && source.matches_live_archive_identity!==true)throw Error('Existing archive differs from retrieved form: '+source.title);
}
const html=manifest.sources.find(s=>s.file==='electronic-submission.html');
const projection=projectHtmlText(readFileSync(html.retained_path,'utf8'));
writeFileSync(folder+'electronic-submission.txt',projection.text+'\n');
const excerpt='Email application to CCPBPERMITCENTER@Cincinnati-oh.gov.';
const block=projection.blocks.find(b=>b.text.includes(excerpt));
if(!block)throw Error('Official email submission proof is missing.');
const page=snapshot.source.extracted_pages.find(p=>p.page===1);
const paper='Complete an application for a permit and submit three copies of plans for review to the Permit Center';
if(!page || page.truncated || page.needs_ocr_review || hash(page.text)!==page.text_sha256 || !page.text.includes(paper))throw Error('Retained paper submission proof changed.');
const packet={method:'cincinnati-currentness-review-preparation-v1',status:'review_pending',
 jurisdiction_id:snapshot.profile.id,source_document_id:snapshot.source.id,
 source_archive_sha256:snapshot.source.file_hash_sha256,
 publisher_name:'Cincinnati Buildings & Inspections',canonical_office_reference:null,
 document_revision:'May 2017',publication_index_verified:true,
 fresh_form_checks:manifest.sources.filter(s=>s.file.endsWith('.pdf')).map(s=>({title:s.title,source_document_id:s.source_document_id,official_url:s.url,archive_url:s.file_url,sha256:s.retrieved_sha256,bytes:s.retrieved_bytes,retrieved_at:s.retrieved_at,matches_existing_archive:true})),
 evidence:{printed_submission:{physical_page:1,text_sha256:page.text_sha256,excerpt:paper},
  electronic_submission:{official_url:html.url,retained_path:html.retained_path,raw_html_sha256:html.retrieved_sha256,normalized_text_sha256:hash(projection.text),block:block.block,excerpt}},
 findings:['Official forms remain linked and newly downloaded bytes match all three existing live archives.',
  'The printed handout describes paper copies while the separately published City page describes email intake and digital uploads. Neither source by itself establishes which route applies to a particular sign project.',
  'The handout remains listed, but current listing does not verify every exemption, fee, workflow or legal requirement.',
  'A Cincinnati address or publisher logo alone does not independently establish geographic authority over a job site.',
  'City building/sign submission guidance is separate from IBI electrical submission and scheduling.'],
 approval_blockers:['Confirm applicable sign submission route and reconcile the dated paper instructions.',
  'Establish explicit geographic applicability from current official coverage evidence.',
  'Review exemptions and repair scope against current adopted sign regulations.',
  'Verify electrical-office identity and responsibility independently.'],
 source_currentness_approved:false,coverage_approved:false,electrical_roles_approved:false,
 production_review_applied:false,automated_workflow_ready:false};
writeFileSync(folder+'currentness-review-packet.json',JSON.stringify(packet,null,2)+'\n');
console.log(JSON.stringify({status:packet.status,forms_verified:packet.fresh_form_checks.length,submission_discrepancy_retained:true,production_review_applied:false}));
