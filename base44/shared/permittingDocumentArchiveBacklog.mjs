import {continueJurisdictionArchiveBacklog,archiveDocumentEligible,archiveBacklogQuery} from './jurisdictionArchiveContinuation.mjs';
import {archiveExternalJurisdictionReferral} from './jurisdictionExternalReferralArchive.mjs';
// Keep the one-original-file budget. Only previously selected external documents
// may resume automatically, and only on explicitly enabled profiles.
export async function continuePermittingDocumentArchiveBacklog(options){
 const regular=await continueJurisdictionArchiveBacklog(options);
 if(!regular.skipped)return regular;
 let checked=0;
 for(const state of ['OH','KY']){
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
   }catch(error){return {success:false,status:'external_resume_requires_review',error:String(error.message || error),external_profiles_checked:checked};}
  }
 }
 return {...regular,external_profiles_checked:checked};
}
