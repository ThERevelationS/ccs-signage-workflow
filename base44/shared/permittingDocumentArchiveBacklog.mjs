import {continueJurisdictionArchiveBacklog,archiveDocumentEligible,archiveBacklogQuery} from './jurisdictionArchiveContinuation.mjs';
import {archiveExternalJurisdictionReferral} from './jurisdictionExternalReferralArchive.mjs';
// Keep the one-original-file budget. Only previously selected external documents
// may resume automatically, and only on explicitly enabled profiles.
export async function continuePermittingDocumentArchiveBacklog(options){
 let regular,checked=0;const review=[];
 for(const state of ['OH','KY']){
  regular=await continueJurisdictionArchiveBacklog({...options,state});
  if(!regular.skipped)return regular;
  const query=archiveBacklogQuery(options.now?.() || Date.now());
  query.state=state;query.auto_refresh=true;
  query.documents.$elemMatch.external_referral_provenance={$ne:null};
  const profiles=await options.entity.filter(query,'updated_date',20,0);
  for(const profile of profiles){
   checked++;
   if(profile.auto_refresh!==true || profile._manual_documents || profile.discovery_scan_state?.blocked)continue;
   const doc=(profile.documents || []).find(d=>d.external_referral_provenance && archiveDocumentEligible(d,{scopedExternal:true,now:options.now?.() || Date.now()}));
   if(!doc)continue;
   try{
    const result=await archiveExternalJurisdictionReferral({...options,jurisdictionId:profile.id,manual:false,automaticScopedResume:true,
     selection:{url:doc.url,source_page_url:doc.external_referral_provenance.source_page_url}});
    if(!result.skipped)return {...result,external_profiles_checked:checked};
   }catch(error){review.push({jurisdiction_id:profile.id,error:String(error.message || error).slice(0,500)});}
  }
 }
 return {...regular,external_profiles_checked:checked,external_review_gaps:review};
}
