import {validateExternalPermittingReferral,referralWebUrl} from './permittingExternalReferrals.mjs';
import {discoverOfficialPermittingReferrals,permittingDocumentType} from './jurisdictionPermittingLinkDiscovery.mjs';
import {readPermittingResourceResponse} from './permittingResourceResponse.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from './jurisdictionPersistence.mjs';
import {archiveKnownJurisdictionSource} from './jurisdictionArchiveContinuation.mjs';
import {RESEARCH_FETCH_TIMEOUT_MS,withResearchArchiveTimeout} from './jurisdictionResearchArchiveBudget.mjs';
const host=url=>new URL(url).hostname.toLowerCase().replace(/^www\./,'');
const fail=message=>{throw Object.assign(Error(message),{status:409});};
const fields=['url','title','source_page_url','linked_href','resolution_base_url','referral_kind','discovery_element'];
export async function archiveExternalJurisdictionReferral(options){
 const {entity,jurisdictionId,selection,fetchScopedSource,invalidateProfile}=options;
 if(!options.manual || typeof fetchScopedSource!=='function' || typeof invalidateProfile!=='function')
  fail('External archival requires selected manual collection and guarded source fetching.');
 const profile=await entity.get(jurisdictionId),cursor=profile?.discovery_scan_state;
 if(!profile?.id || !['OH','KY'].includes(profile.state) || profile._manual_documents)
  fail('Jurisdiction is missing, outside collection scope or manually protected.');
 if(!cursor || cursor.blocked || cursor.seed_url!==profile.permitting_url)
  fail('Official discovery source changed or requires review.');
 const rows=(cursor.external_referrals || []).filter(r=>r.url===selection?.url && r.source_page_url===selection?.source_page_url);
 if(rows.length!==1)fail('Selected external referral is missing or ambiguous.');
 const referral=rows[0];validateExternalPermittingReferral(referral,cursor.seed_url);
 if(referral.referral_kind!=='downloadable_document')fail('Only directly linked document files can enter this archive path.');
 if(!cursor.visited_urls?.includes(referral.source_page_url))fail('Referral source page has no saved discovery visit.');
 const matches=(profile.documents || []).filter(d=>d.url===referral.url);
 if(matches.length>1)fail('Document URL has duplicate identities.');
 let document=matches[0],linkChecked=false;
 if(document && (document.source==='manual' || document.pinned || document.archive_pinned ||
    !document.external_referral_provenance || !fields.every(k=>document.external_referral_provenance[k]===referral[k])))
  fail('Existing document has different or protected provenance; reconcile separately.');
 async function recheckLink(){
  const response=await withResearchArchiveTimeout(fetchScopedSource(referral.source_page_url,{
   signal:AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS),headers:{'User-Agent':'Mozilla/5.0'}},
   host(referral.source_page_url)),RESEARCH_FETCH_TIMEOUT_MS,'Referral source recheck');
  const final=referralWebUrl(response.url || referral.source_page_url);
  if(!final || final.href!==referral.source_page_url)fail('Official source page redirected; refresh discovery before collection.');
  const resource=await withResearchArchiveTimeout(readPermittingResourceResponse(response),RESEARCH_FETCH_TIMEOUT_MS,'Referral source read');
  if(typeof resource.html!=='string')fail('Official referral source is no longer an HTML page.');
  const fresh=discoverOfficialPermittingReferrals(resource.html,final.href).find(r=>fields.every(k=>r[k]===referral[k]));
  if(!fresh)fail('Official source no longer contains the exact selected document link.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(resource.html)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  linkChecked=true;return {...fresh,source_page_sha256:hash};
 }
 if(!document){
  const fresh=await recheckLink();
  document={id:crypto.randomUUID(),url:referral.url,title:referral.title,source:'official_page_harvest',
   doc_type:permittingDocumentType(referral),verification_notes:'Direct external document link rechecked; authority and applicability remain unapproved.',
   external_referral_provenance:{...fresh,discovered_page_sha256:referral.source_page_sha256,
    collection_method:'official-direct-document-link-v1',rechecked_at:new Date().toISOString(),
    jurisdiction_id:profile.id,jurisdiction_name:profile.name,jurisdiction_state:profile.state,jurisdiction_type:profile.type,
    seed_url:profile.permitting_url}};
  const next=invalidateProfile(profile,{documents:[...(profile.documents || []),document]});
  await replaceJurisdictionFieldsIfUnchanged({entity,jurisdiction:profile,nextFields:next,
   guardFields:{_manual_documents:profile._manual_documents,discovery_scan_state:cursor,
    name:profile.name,state:profile.state,type:profile.type,permitting_url:profile.permitting_url},
   label:'External document source staging'});
 }
 const result=await archiveKnownJurisdictionSource({...options,documentId:document.id,knownPdf:null,
  fetchSource:async(url,init)=>{
   if(url!==document.url)return options.fetchSource(url,init);
   if(!linkChecked)await recheckLink();
   return fetchScopedSource(url,init,host(document.url));
  }});
 return {...result,external_referral:true,document_id:document.id};
}
