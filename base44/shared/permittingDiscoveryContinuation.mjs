import {scanOfficialPermittingPages,applyDiscoveryFetchTimestamp} from './permittingDiscoveryScan.mjs';
import {mergeJurisdictionResearchDocuments} from './jurisdictionResearchDocumentMerge.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from './jurisdictionPersistence.mjs';

export function discoveryBacklogQuery() {
 return {state:{$in:['OH','KY']},auto_refresh:{$ne:false},_manual_documents:{$ne:true},
  'discovery_scan_state.method':'official-page-frontier-v1','discovery_scan_state.blocked':{$ne:true},
  'discovery_scan_state.pending_pages.0':{$exists:true}};
}
export async function continueKnownDiscovery({entity,jurisdictionId,fetchPage,invalidateProfile,maxPages=1}) {
 const profile=await entity.get(jurisdictionId),cursor=profile?.discovery_scan_state;
 if(!profile?.id || !['OH','KY'].includes(profile.state) || profile.auto_refresh===false || profile._manual_documents ||
    cursor?.blocked || !cursor?.pending_pages?.length)return{success:true,skipped:true,reason:'no_eligible_discovery_frontier',llm_calls:0};
 if(typeof invalidateProfile!=='function')throw Error('Discovery continuation requires the existing verification invalidation gate.');
 const guards={_manual_documents:profile._manual_documents,auto_refresh:profile.auto_refresh,
  permitting_url:profile.permitting_url,website_url:profile.website_url};
 let scan;
 try{scan=await scanOfficialPermittingPages({seedUrl:profile.permitting_url,resume:cursor,
  existingDocuments:profile.documents || [],maxPages,fetchPage});}
 catch(error){
  if(error.frontier_review_required){
   await replaceJurisdictionFieldsIfUnchanged({entity,jurisdiction:profile,guardFields:guards,
    nextFields:{discovery_scan_state:{...cursor,blocked:true,block_reason:String(error.message).slice(0,300)}},label:'Discovery frontier review block'});
   return{success:false,status:'frontier_review_required',jurisdiction_id:profile.id,llm_calls:0};
  }
  throw error;
 }
 const docs=scan.documents.map(d=>({...d,id:d.id || crypto.randomUUID(),source:'official_page_harvest'}));
 const documents=applyDiscoveryFetchTimestamp(mergeJurisdictionResearchDocuments(profile.documents,docs),scan,new Date().toISOString());
 const nextFields=invalidateProfile(profile,{documents,discovery_scan_state:scan.continuation_state});
 await replaceJurisdictionFieldsIfUnchanged({entity,jurisdiction:profile,nextFields,guardFields:guards,label:'Discovery continuation'});
 return{success:true,jurisdiction_id:profile.id,attempted_pages:scan.attempted_pages,pending_pages:scan.pending_pages.length,
  external_referrals:scan.external_referrals.length,external_referrals_require_review:scan.external_referrals.length>0,external_requests_scheduled:0,
  unresolved_gaps:scan.gaps.length,discovered_resources:scan.documents.length,traversal_complete:scan.traversal_complete,
  jurisdiction_coverage_complete:false,authority_established:false,llm_calls:0};
}
export async function continueDiscoveryBacklog(options){
 const profiles=await options.entity.filter(discoveryBacklogQuery(),'updated_date',20,0);
 for(const profile of profiles){
  try{const result=await continueKnownDiscovery({...options,jurisdictionId:profile.id,maxPages:1});if(!result.skipped)return result;}
  catch(error){return{success:false,status:'discovery_continuation_conflict',error:String(error.message).slice(0,300),llm_calls:0};}
 }
 return{success:true,skipped:true,reason:'no_eligible_discovery_frontier',profiles_checked:profiles.length,llm_calls:0};
}
