import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function loadPublisherEvidence(){
 const reconciliation=JSON.parse(readFileSync(root+'publisher-review/publisher-reconciliation.json'));
 const manifest=JSON.parse(readFileSync(root+'publisher-review/manifest.json'));
 const snapshot=JSON.parse(readFileSync(root+'sign-scope/electrical-review-readiness-snapshot.json'));
 const identity=reconciliation.retained_identity_evidence;
 return {reconciliation,manifest,source:snapshot.source,
  index:readFileSync(root+'publisher-review/signs-index.html'),
  identityHtml:readFileSync(identity.archived_repo_path),identityText:readFileSync(identity.normalized_text_path),
  pdf:readFileSync(root+'sign-scope/cincinnati-signs-handout.pdf')};
}
export function auditPublisherProvenance({reconciliation:r,manifest,source,index,identityHtml,identityText,pdf}){
 const errors=[];const require=(condition,message)=>{if(!condition)errors.push(message);};
 const identity=r.retained_identity_evidence;
 const indexEntry=manifest.sources.find(s=>s.file==='signs-index.html');
 const pdfEntry=manifest.sources.find(s=>s.content_type?.startsWith('application/pdf'));
 require(indexEntry && index.length===indexEntry.bytes && sha(index)===indexEntry.sha256,'Official index archive identity differs.');
 require(identityHtml.length===identity.raw_html_bytes && sha(identityHtml)===identity.raw_html_sha256,'Office identity archive differs.');
 require(sha(identityText)===identity.normalized_text_sha256,'Office identity text differs.');
 require(pdfEntry && pdf.length===pdfEntry.bytes && sha(pdf)===pdfEntry.sha256 && source.file_hash_sha256===sha(pdf) && source.file_bytes===pdf.length,'Handout archive identity differs.');
 require(source.id===r.source_document_id && source.jurisdiction_id==='6ac1a123edda6d8dd942690b' && source.jurisdiction_name==='Cincinnati','Canonical handout identity differs.');
 const page=source.extracted_pages?.find(p=>p.page===r.source_publisher_quote.physical_page);
 require(page && !page.truncated && !page.needs_ocr_review && page.source_document_id===source.id && page.source_sha256===sha(pdf) && sha(page.text)===page.text_sha256 && page.text.includes(r.source_publisher_quote.excerpt),'Printed publisher proof differs.');
 const links=[...index.toString().matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)].map(m=>m[2].replace(/&amp;/g,'&'));
 require(links.includes(r.current_official_index_link),'Retained official index does not contain the exact recorded handout link.');
 let link,indexUrl,officeUrl,sourceUrl;
 try{link=new URL(r.current_official_index_link);indexUrl=new URL(indexEntry.source_url);officeUrl=new URL(r.source_url);sourceUrl=new URL(source.official_url);}catch{errors.push('Official publication URL is invalid.');}
 require([link,indexUrl,officeUrl,sourceUrl].every(u=>u?.hostname==='www.cincinnati-oh.gov' && u.pathname.startsWith('/buildings/')),'Publication evidence is outside the reviewed department host/path.');
 require(link?.pathname===sourceUrl?.pathname && !link?.search && !sourceUrl?.search,'Indexed link and retained source are different documents.');
 require(r.existing_identity_status==='staff_verified' && r.state==='OH' && r.government_office_id===r.catalog_office_id,'Reviewed office identity is inconsistent.');
 const printed=r.source_publisher_quote.excerpt;
 return {method:'retained-official-publisher-provenance-audit-v1',status:errors.length?'evidence_inconsistent':'publication_chain_supported',errors,
  evidence_observed_at:indexEntry?.retrieved_at,source_document_id:source.id,
  canonical_office:{government_office_id:r.government_office_id,name:r.name,source_url:r.source_url},
  printed_publisher:{name:printed,physical_page:page?.page,text_sha256:page?.text_sha256},
  publication_chain:{index_url:indexEntry?.source_url,index_sha256:sha(index),literal_link:r.current_official_index_link,
   retained_pdf_sha256:sha(pdf),office_identity_sha256:sha(identityHtml)},
  conclusions:{retained_publication_chain_verified:errors.length===0,canonical_name_literal_in_handout:Boolean(page?.text.includes(r.name)),
   exact_alias_mapping_established:false,source_currentness_approved:false,office_authority_approved:false,http_redirect_verified:false},
  review_route:{printed_publisher_review_available:true,canonical_office_reference_optional:true,
   canonical_office_link_requires_separate_evidence:true,
   instruction:'Review the literal printed publisher and explicit source scope using the existing administrative route without a canonical office link. This does not satisfy delegated-office review. Do not require or invent an alias sentence to collect the source evidence.'}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=auditPublisherProvenance(loadPublisherEvidence());
 if(report.errors.length){console.error(JSON.stringify(report));process.exitCode=1;}
 else{writeFileSync(root+'publisher-review/publication-provenance-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
}
