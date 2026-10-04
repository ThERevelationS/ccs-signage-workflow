import {loadRuleEvidence,evidenceDigest,evidenceEqual,evidenceError} from './permittingRuleEvidence.mjs';
import {safeAuthorityUrl} from './permittingSourceAuthorityPolicy.mjs';

export const OFFICE_CANDIDATE_METHOD='retained-office-candidate-v1';
const key='permitOfficeCatalog';
const clean=(v,max)=>{if(typeof v!=='string' || !v.trim() || v.length>max)throw evidenceError('Office name and exact publisher quote are required within the field bounds.',400);return v.trim();};
const normalized=v=>String(v || '').trim().replace(/\s+/g,' ').toLowerCase();
const profileIdentity=p=>Object.fromEntries(['id','name','state','type'].map(k=>[k,p[k] ?? null]));
async function catalog(entity){
 const rows=await entity.filter({setting_key:key},'id',2,0);
 if(!Array.isArray(rows) || rows.length!==1 || !rows[0].id || !rows[0].updated_date || !Array.isArray(rows[0].setting_value?.items))
  throw evidenceError('The existing office catalog is missing, ambiguous, or unversioned. No setting is created automatically.');
 const ids=new Set(),canonical=new Set();
 for(const office of rows[0].setting_value.items){
  if(!office?.id || ids.has(office.id) || canonical.has(office.government_office_id || office.id))throw evidenceError('Duplicate office IDs require review before registration.');
  ids.add(office.id);canonical.add(office.government_office_id || office.id);
 }
 return rows[0];
}
async function evidence(deps,input){
 const name=clean(input.office_name,200),quote=clean(input.publisher_quote,1000),page=input.physical_page;
 if(!Number.isInteger(page) || page<1 || !quote.includes(name))throw evidenceError('Office name must be literal in its retained physical-page quote.',400);
 const unit=await loadRuleEvidence({...deps,sourceDocumentId:clean(input.source_document_id,100),startPage:page,pageCount:1});
 const source=unit.source,profile=await deps.profileEntity.get(source.jurisdiction_id);
 if(!['OH','KY'].includes(profile.state) || profile.name!==source.jurisdiction_name || profile.id!==source.jurisdiction_id)
  throw evidenceError('Canonical Ohio/Kentucky source jurisdiction identity requires review.');
 if(!normalized(name).includes(normalized(profile.name)))throw evidenceError('This candidate path requires a jurisdiction-specific printed office name. A generic board or department needs separate identity evidence.');
 if(!unit.evidence.pages[0].text.includes(quote))throw evidenceError('Publisher quote is not exact retained page evidence.');
 const links=(profile.documents || []).filter(d=>d.id===source.jurisdiction_profile_doc_id);
 const doc=links[0];
 if(links.length!==1 || !safeAuthorityUrl(source.official_url) || !safeAuthorityUrl(source.archived_file_url) ||
  doc.url!==source.official_url || doc.file_url!==source.archived_file_url ||
  doc.source_sha256!==source.file_hash_sha256 || doc.stored_sha256!==source.file_hash_sha256 ||
  !Number.isSafeInteger(source.file_bytes) || source.file_bytes<1 || doc.stored_bytes!==source.file_bytes ||
  doc.source_bytes!==source.file_bytes)
  throw evidenceError('Publisher evidence must match the retained byte-verified profile archive. No download or authority promotion is performed.');
 const proof={physical_page:page,text_sha256:unit.evidence.pages[0].text_sha256,excerpt:quote};
 const snapshot={source:unit.snapshot.source,profile:profileIdentity(profile),proof,archive_document_id:doc.id};
 const registrationKey=await evidenceDigest({method:OFFICE_CANDIDATE_METHOD,office_name:name,snapshot});
 const id='office-candidate-'+await evidenceDigest({state:profile.state,name:normalized(name)});
 return {id,government_office_id:id,name,office_type:'',office_types:[],workflow_steps:[],
  contact_phone:'',contact_email:'',contact_website:'',contact_address:'',contact_notes:'',
  government_office:{name,phone:'',email:'',website:'',address:'',notes:'',state:profile.state,
   verification_status:'needs_verification',verified_at:'',verified_by:'',source_url:source.official_url,
   verification_notes:'Candidate from a retained publisher quote. Current office identity, contacts, roles and coverage require separate review.'},
  office_candidate_registration:{method:OFFICE_CANDIDATE_METHOD,registration_key:registrationKey,snapshot}};
}
function matchCandidate(row,proposal){
 const matches=row.setting_value.items.filter(o=>normalized(o.government_office?.name || o.name)===normalized(proposal.name) ||
  o.id===proposal.id || (o.government_office_id || o.id)===proposal.id);
 if(matches.length>1)throw evidenceError('Several offices match this candidate; resolve identity ambiguity before registering.');
 const found=matches[0];
 if(found && (normalized(found.government_office?.name || found.name)!==normalized(proposal.name) ||
  (found.government_office?.state && found.government_office.state!==proposal.government_office.state)))
  throw evidenceError('Existing office identity conflicts with this candidate. Existing data was preserved.');
 return found || null;
}
const result=(office,status)=>({success:true,status,office,authority_verified:false,address_authority_resolved:false,llm_calls:0});
export async function getOfficeCandidate(deps,{officeId,registrationKey}){
 const row=await catalog(deps.settingsEntity),matches=row.setting_value.items.filter(o=>o.id===officeId);
 const found=matches.length===1?matches[0]:null;
 return result(found?.office_candidate_registration?.registration_key===registrationKey?found:null,
  found?.office_candidate_registration?.registration_key===registrationKey?'registered':'not_found');
}
export async function registerOfficeCandidate(deps,{input,dryRun=false,expectedCatalogVersion,expectedEvidenceDigest,actor,now=()=>new Date().toISOString()}){
 const proposal=await evidence(deps,input),row=await catalog(deps.settingsEntity),found=matchCandidate(row,proposal);
 const digest=proposal.office_candidate_registration.registration_key;
 if(dryRun)return {success:true,dry_run:true,proposal,existing_office:found,expected_catalog_updated_date:row.updated_date,
  expected_evidence_digest:digest,authority_verified:false,address_authority_resolved:false,llm_calls:0};
 if(found)return result(found,found.office_candidate_registration?.registration_key===digest?'registered':'existing_office');
 if(!actor || expectedCatalogVersion!==row.updated_date || expectedEvidenceDigest!==digest)
  throw evidenceError('Catalog or selected evidence changed after preview. Preview again before registering.');
 // A second read catches source/page/profile replacements before the catalog write.
 const fresh=await evidence(deps,input);
 if(!evidenceEqual(fresh,proposal))throw evidenceError('Publisher evidence changed before registration.');
 const office={...proposal,office_candidate_registration:{...proposal.office_candidate_registration,
  registered_by:actor,registered_at:now()}};
 const value={...row.setting_value,items:[...row.setting_value.items,office]};
 let update;
 try{update=await deps.settingsEntity.updateMany({id:row.id,setting_key:key,updated_date:row.updated_date},{$set:{setting_value:value}});}
 catch(error){
  const saved=await getOfficeCandidate(deps,{officeId:office.id,registrationKey:digest}).catch(()=>null);
  if(saved?.office)return {...saved,reconciled:true};
  return {success:false,status:'registration_uncertain',office_id:office.id,registration_key:digest,
   error:'Registration response is uncertain. Check this saved candidate before another submission.',llm_calls:0};
 }
 const saved=await getOfficeCandidate(deps,{officeId:office.id,registrationKey:digest}).catch(()=>null);
 if(saved?.office)return saved;
 if(update?.updated===0)throw evidenceError('Office catalog changed concurrently. No existing office was overwritten; preview again.');
 return {success:false,status:'registration_uncertain',office_id:office.id,registration_key:digest,
  error:'Saved candidate could not be confirmed. Check the same registration before resubmitting.',llm_calls:0};
}
