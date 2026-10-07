import {readSourceEvidencePages} from './jurisdictionSourceTextSegments.mjs';

// Candidate evidence only. This does not approve a publisher, source, or office role.
export const PUBLISHER_ALIAS_METHOD='literal-pdf-publisher-alias-candidate-v1';
const fail=message=>{throw Object.assign(Error(message),{status:409});};
const https=value=>{try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password?u:null;}catch{return null;}};
export async function verifyPublisherAliasCandidate({sourceEntity,segmentEntity,getOffice},profile,input){
 if(!sourceEntity?.get || typeof getOffice!=='function')fail('Live source and office identity readers are required.');
 const alias=input?.printed_name;
 if(typeof alias!=='string' || alias!==alias.trim() || alias.length<2 || alias.length>200 || /[\r\n\u0000-\u001f]/.test(alias))fail('An exact printed publisher name is required.');
 const office=await getOffice(input.government_office_id),meta=office?.government_office;
 const canonical=meta?.name || office?.name;
 if(!profile?.id || !['OH','KY'].includes(profile.state) || !canonical ||
  (office.government_office_id || office.id)!==input.government_office_id ||
  meta?.verification_status!=='staff_verified' || meta.state!==profile.state || !https(meta.source_url))fail('A verified same-state canonical office is required.');
 if(alias===canonical)fail('The printed name already matches the canonical office.');
 const source=await sourceEntity.get(input.source_document_id);
 const official=https(source?.official_url);
 const hosts=[profile.website_url,profile.permitting_url].map(https).filter(Boolean).map(u=>u.hostname);
 if(source?.jurisdiction_id!==profile.id || source.jurisdiction_name!==profile.name || !official || !hosts.includes(official.hostname))fail('Alias evidence must belong to the canonical jurisdiction and its official host.');
 if(!https(source.archived_file_url) || !/^[a-f0-9]{64}$/.test(source.file_hash_sha256 || '') || !Number.isSafeInteger(source.file_bytes) || source.file_bytes<=0)fail('A retained PDF identity is required.');
 if(!Number.isInteger(input.physical_page) || input.physical_page<1)fail('A physical PDF page is required.');
 const evidence=await readSourceEvidencePages({source,segmentEntity,startPage:input.physical_page,pageCount:1});
 const page=evidence.pages[0];
 const sentence=canonical+' is also known as '+alias+'.';
 if(!page || page.truncated || page.needs_ocr_review || page.text_sha256!==input.text_sha256 || input.excerpt!==sentence || !page.text.split(/\r?\n/).some(line=>line.trim()===sentence))fail('An exact standalone identity-mapping sentence on a retained clear page is required.');
 return {method:PUBLISHER_ALIAS_METHOD,status:'candidate_only',canonical_name:canonical,printed_name:alias,
  government_office_id:input.government_office_id,catalog_office_id:office.id,
  office_identity:{name:canonical,state:meta.state,verification_status:meta.verification_status,source_url:meta.source_url},
  profile:{id:profile.id,name:profile.name,state:profile.state,type:profile.type},
  source:{id:source.id,official_url:source.official_url,archived_file_url:source.archived_file_url,file_hash_sha256:source.file_hash_sha256,file_bytes:source.file_bytes},
  proof:{physical_page:input.physical_page,text_sha256:page.text_sha256,excerpt:sentence},
  publisher_approved:false,source_currentness_established:false,locality_authority_established:false};
}
