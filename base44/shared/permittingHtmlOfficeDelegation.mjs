import {evidenceEqual,evidenceError} from './permittingRuleEvidence.mjs';
import {authorizedHtmlUrl,readHtmlEvidence,fetchHtmlSnapshot,projectHtmlText,htmlEvidenceSummary} from './permittingHtmlEvidence.mjs';
const identity=p=>Object.fromEntries(['id','name','state','type','website_url','permitting_url'].map(k=>[k,p[k] ?? null]));
const escaped=s=>s.replace(/[.*+?^${()|[\]\\]/g,'\\$&');
const rawText=row=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Uint8Array.from(atob(row.raw_html_base64),c=>c.charCodeAt(0)));
const destination=value=>{const u=new URL(value);u.hash='';return u.href;};
// This first native HTML path is deliberately confined to an explicit municipal zoning-department delegation.
// The responsible office and publishing jurisdiction are separate identities. It never establishes adopted law.
export async function verifyHtmlOfficeDelegation(deps,profile,input,getOffice){
 if(input.source_document_id || input.role!=='zoning' || !['city','municipality'].includes(profile.type) ||
  !['OH','KY'].includes(profile.state) || input.coverage_area!==profile.name || input.responsibility_confirmed!==true)
  throw evidenceError('HTML delegation requires the publishing city, its exact named coverage and the zoning role.',400);
 if(typeof input.review_notes!=='string' || !input.review_notes.trim() || input.review_notes.length>2000 ||
  typeof input.office_alias!=='string' || input.office_alias.trim().length<10 || input.office_alias.length>200 ||
  typeof input.government_office_id!=='string' || input.government_office_id.length>200 ||
  input.role_proof?.physical_page!==undefined || input.role_label && (typeof input.role_label!=='string' || input.role_label.length>120))
  throw evidenceError('Enter bounded review notes, the literal responsible-office name and a native HTML block.',400);
 const row=await deps.htmlEntity.get(String(input.html_evidence_id || ''));
 const citation=(await readHtmlEvidence(row,{block:input.role_proof?.block,excerpt:input.role_proof?.excerpt})).citation;
 if(row.jurisdiction_id!==profile.id || !evidenceEqual(row.profile_snapshot,identity(profile)))
  throw evidenceError('The retained page publisher must match the current canonical city identity and official hosts.');
 authorizedHtmlUrl(profile,row.official_url);authorizedHtmlUrl(profile,row.final_url);
 const alias=input.office_alias.trim(),quote=citation.excerpt;
 // Role appears before the delegating "by", so incidental roles in the recipient department name cannot qualify.
 const clause=new RegExp('(?:The )?City of '+escaped(profile.name)+' Zoning Department is (?:now )?being managed and reviewed by '+escaped(alias)+'(?:[.]|$)');
 if(!clause.test(quote))throw evidenceError('Quote an explicit city zoning-department management and review delegation to the named office.');
 const office=await getOffice(deps.settingsEntity,input.government_office_id,undefined,profile.state);
 const url=destination(office.source_url),projection=projectHtmlText(rawText(row),{includeLinks:true});
 const matches=projection.links.filter(l=>l.block===citation.block && destination(l.url)===url && quote.includes(l.text));
 if(matches.length!==1)throw evidenceError('The cited delegation block must contain one direct link to the selected verified office identity URL.');
 const link=matches[0];
 const receipt=profile.html_evidence_state;
 if(receipt?.official_url===row.official_url && (receipt.status!=='complete' || receipt.html_evidence_id!==row.id))
  throw evidenceError('A newer or uncertain retained version of this official page requires reconciliation and review.');
 // One bounded GET, no crawler, LLM, upload or queue charge. Current text AND the identity destination must match.
 const current=await fetchHtmlSnapshot({profile,officialUrl:row.official_url,fetchImpl:deps.fetchImpl});
 const currentLinks=projectHtmlText(rawText(current),{includeLinks:true}).links.filter(l=>l.block===citation.block && destination(l.url)===url && quote.includes(l.text));
 if(current.text_sha256!==row.text_sha256 || current.final_url!==row.final_url || !evidenceEqual(currentLinks,[link]))
  throw evidenceError('Official page text or delegated office link changed; retain the current response and review again.');
 return {evidence_kind:'official_html',html_evidence_id:row.id,profile_snapshot:Object.fromEntries(['id','name','state','type'].map(k=>[k,profile[k] ?? null])),
  publisher_snapshot:identity(profile),office_snapshot:office,source_snapshot:{...htmlEvidenceSummary(row),profile_snapshot:row.profile_snapshot},
  role:'zoning',role_label:input.role_label?.trim() || 'Zoning department management and review',coverage_area:profile.name,
  coverage_kind:'named_jurisdiction',coverage_basis:'explicit_municipal_delegation',source_profile_id:row.jurisdiction_id,
  role_proof:citation,office_link_proof:{...link,office_alias:alias},review_notes:input.review_notes.trim(),
  responsibility_confirmed:true,address_authority_resolved:false,regulatory_authority_established:false};
}
export async function htmlOfficeDelegationContext(deps,id){
 const row=await deps.htmlEntity.get(id);
 await readHtmlEvidence(row);
 const profile=await deps.profileEntity.get(row.jurisdiction_id);
 const settings=await deps.settingsEntity.filter({setting_key:'permitOfficeCatalog'},'id',2,0);
 const catalog=settings.length===1?settings[0].setting_value?.items:null;
 if(!Array.isArray(catalog) || catalog.length>300)throw evidenceError('Office catalog missing, ambiguous or beyond its processing bound.');
 const offices=catalog.filter(o=>o.government_office?.verification_status==='staff_verified' && o.government_office?.state===profile.state).map(o=>({
  id:o.government_office_id || o.id,catalog_id:o.id,name:o.government_office.name || o.name,source_url:o.government_office.source_url,verification_status:'staff_verified'}));
 return {success:true,evidence_kind:'official_html',source_review:{status:'native_html_review',named_areas:[profile.name]},
  publisher:{id:profile.id,name:profile.name,state:profile.state,type:profile.type},offices,
  targets:[{id:profile.id,name:profile.name,state:profile.state,type:profile.type}],has_more:false,next_cursor:null,llm_calls:0};
}
