import {continueAddressResearchArchives} from './permittingAddressArchive.mjs';
import {continueJurisdictionArchiveBacklog,archiveDocumentEligible,archiveBacklogQuery} from './jurisdictionArchiveContinuation.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from './jurisdictionPersistence.mjs';
import {archiveExternalJurisdictionReferral} from './jurisdictionExternalReferralArchive.mjs';
// Keep the one-original-file budget. Retained selections and new direct-document
// referrals require explicitly enabled profiles.
export async function continuePermittingDocumentArchiveBacklog(options){
 let regular,checked=0;const review=[];
 for(const state of ['OH','KY']){
  const address=()=>continueAddressResearchArchives({entity:options.addressEntity,scanEntity:options.scanEntity,state,fetchSource:options.fetchAddressSource,uploadFile:options.uploadFile,now:options.now});
  if(options.preferAddressArchives!==false){const result=await address();if(!result.skipped)return result;}
  regular=await continueJurisdictionArchiveBacklog({...options,state});
  if(!regular.skipped)return {...regular,archive_queue:'jurisdiction'};
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
    if(!result.skipped)return {...result,archive_queue:'jurisdiction',external_profiles_checked:checked};
   }catch(error){review.push({jurisdiction_id:profile.id,error:String(error.message || error).slice(0,500)});}
  }
  const freshProfiles=await options.entity.filter({state,auto_refresh:true,_manual_documents:{$ne:true},
   'discovery_scan_state.blocked':{$ne:true},'discovery_scan_state.external_initial_collection_drained':{$ne:true},
   'discovery_scan_state.external_referrals':{$elemMatch:{referral_kind:'downloadable_document'}}},'updated_date',20,0);
  for(const listed of freshProfiles){
   checked++;
   try{
    const profile=await options.entity.get(listed.id),cursor=profile?.discovery_scan_state;
    if(!profile?.id || profile.state!==state || profile.auto_refresh!==true || profile._manual_documents || !cursor || cursor.blocked || cursor.seed_url!==profile.permitting_url)continue;
    const referral=(cursor.external_referrals || []).find(row=>row.referral_kind==='downloadable_document' && !(profile.documents || []).some(doc=>doc.url===row.url));
    if(!referral){
     await replaceJurisdictionFieldsIfUnchanged({entity:options.entity,jurisdiction:profile,
      nextFields:{discovery_scan_state:{...cursor,external_initial_collection_drained:true}},
      guardFields:{documents:profile.documents,auto_refresh:true,_manual_documents:profile._manual_documents,permitting_url:profile.permitting_url},label:'External initial collection frontier drained'});
     continue;
    }
    return {...await archiveExternalJurisdictionReferral({...options,jurisdictionId:profile.id,manual:false,
     automaticScopedResume:true,automaticInitialCollection:true,selection:{url:referral.url,source_page_url:referral.source_page_url}}),archive_queue:'jurisdiction',external_profiles_checked:checked};
   }catch(error){review.push({jurisdiction_id:listed.id,error:String(error.message || error).slice(0,500)});}
  }
  if(options.preferAddressArchives===false){const result=await address();if(!result.skipped)return result;}

 }
 return {...regular,external_profiles_checked:checked,external_review_gaps:review};
}
