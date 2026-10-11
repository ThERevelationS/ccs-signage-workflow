import {scanOfficialPermittingPages} from './permittingDiscoveryScan.mjs';
import {isDownloadableResearchDocument} from './jurisdictionPermittingLinkDiscovery.mjs';
import {mergeJurisdictionResearchDocuments} from './jurisdictionResearchDocumentMerge.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from './jurisdictionPersistence.mjs';

export function isAddressDirectOriginalReferral(ref){
 try{const url=new URL(ref.url),source=new URL(ref.source_page_url);return ref.referral_kind==='downloadable_document'&&url.protocol==='https:'&&source.protocol==='https:'&&!url.username&&!url.password&&!source.username&&!source.password;}catch{return false;}
}

export function addressDiscoveryCursor(cursor,documents){
 return {...cursor,external_initial_collection_drained:!(cursor.external_referrals || []).some(ref=>isAddressDirectOriginalReferral(ref)&&!(documents || []).some(doc=>doc.url===ref.url))};
}

export function addressResearchCollection(row){
 const cursor=row.discovery_scan_state;
 return {id:row.id,target:row.location_target,name:row.name,documents:row.documents || [],
  external_referrals:(cursor?.external_referrals || []).filter(isAddressDirectOriginalReferral),
  auto_refresh:row.auto_refresh,reference_only:true,authority_established:false,
  ...(cursor?{discovery:{pending_pages:cursor.pending_pages || [],gaps:cursor.gaps || [],blocked:cursor.blocked===true,block_reason:cursor.block_reason,visited_count:cursor.visited_urls?.length || 0,last_pages:row.discovery_last_scan?.pages || [],last_resources:row.discovery_last_scan?.resources || [],outside_links:(cursor.external_referrals || []).filter(ref=>!isAddressDirectOriginalReferral(ref))}}:{})};
}

// One durable page per request; the staff-controlled UI may continue without an overall page cap.
export async function continueOwnedAddressDiscovery({entity,scanEntity,collectionId,actor,fetchPage,onProgress=async()=>{}}){
 const original=await entity.get(collectionId);
 const own=row=>Boolean(row&&row.owner_id===actor.id&&row.owner_email===String(actor.email).toLowerCase()&&row.reference_only===true&&row.authority_established===false&&row.collection_key===original?.collection_key&&row.scan_run_id===original?.scan_run_id&&row.permitting_url===original?.permitting_url);
 const reject=()=>Object.assign(Error('This research collection is not available to your account.'),{status:403});
 async function checked(id){
  const row=await entity.get(id);if(!own(row))throw reject();
  const origin=await scanEntity.get(row.scan_run_id);
  if(!origin||origin.action_kind!=='address'||origin.owner_id!==actor.id||origin.owner_email!==String(actor.email).toLowerCase()||!['complete','completed_with_errors'].includes(origin.status))throw Object.assign(Error('The originating address scan needs review before continuing.'),{status:409});
  return row;
 }
 const row=await checked(collectionId),cursor=row.discovery_scan_state;
 const duplicates=await entity.filter({collection_key:row.collection_key},'created_date',2);
 if(duplicates.length!==1||duplicates[0].id!==row.id)throw Object.assign(Error('Duplicate research collection requires review.'),{status:409});
 if(!cursor||cursor.blocked||!cursor.pending_pages?.length)return {success:true,skipped:true,reason:cursor?.blocked?'frontier_requires_review':'no_pending_pages',collection:addressResearchCollection(row),attempted_pages:0};
 const seed=new URL(row.permitting_url);
 if(seed.protocol!=='https:'||seed.username||seed.password)throw Object.assign(Error('Saved research source must use HTTPS.'),{status:400});
 const host=seed.hostname.toLowerCase().replace(/^www\./,'');
 const adapter={get:checked,updateMany:(query,patch)=>entity.updateMany({...query,owner_id:actor.id,owner_email:String(actor.email).toLowerCase(),scan_run_id:original.scan_run_id,collection_key:original.collection_key,reference_only:true,authority_established:false,permitting_url:original.permitting_url},patch)};
 const guards=Object.fromEntries(['owner_id','owner_email','collection_key','scan_run_id','reference_only','authority_established','permitting_url','website_url','name','state','type','location_target','location_verified'].map(key=>[key,row[key]]));
 let scan;
 try{
  scan=await scanOfficialPermittingPages({seedUrl:row.permitting_url,resume:cursor,existingDocuments:row.documents || [],maxPages:1,maxDepth:2,onProgress,
   fetchPage:async url=>{await checked(collectionId);const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password||target.hostname.toLowerCase().replace(/^www\./,'')!==host||target.port!==seed.port)throw Error('Saved research page is outside the HTTPS source host.');return fetchPage(url,host,seed.port);}
  });
 }catch(error){
  if(!error.frontier_review_required)throw error;
  await replaceJurisdictionFieldsIfUnchanged({entity:adapter,jurisdiction:row,guardFields:guards,nextFields:{discovery_scan_state:{...cursor,blocked:true,block_reason:String(error.message).slice(0,300)}},label:'Address discovery review block'});
  return {success:false,error:'Saved page progress needs review: '+error.message,collection:addressResearchCollection(await checked(collectionId))};
 }
 const docs=scan.documents.filter(isDownloadableResearchDocument).filter(doc=>{const u=new URL(doc.url);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.toLowerCase().replace(/^www\./,'')===host&&u.port===seed.port;}).map(doc=>({...doc,id:doc.id || crypto.randomUUID()}));
 const merged=mergeJurisdictionResearchDocuments(row.documents,docs);
 await replaceJurisdictionFieldsIfUnchanged({entity:adapter,jurisdiction:row,guardFields:guards,
  nextFields:{documents:merged,discovery_scan_state:addressDiscoveryCursor(scan.continuation_state,merged),discovery_last_scan:{pages:scan.pages,resources:scan.documents,checked_at:new Date().toISOString()}},label:'Address discovery continuation'});
 const saved=await checked(collectionId);
 return {success:true,attempted_pages:scan.attempted_pages,pages:scan.pages,discovered_resources:scan.documents.length,pending_pages:scan.pending_pages.length,unresolved_gaps:scan.gaps.length,collection:addressResearchCollection(saved),authority_established:false,jurisdiction_coverage_complete:false,llm_calls:0,uploads:0};
}
