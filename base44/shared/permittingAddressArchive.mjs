import {archiveKnownJurisdictionSource} from './jurisdictionArchiveContinuation.mjs';
import {isDownloadableResearchDocument,permittingResourcePriority} from './jurisdictionPermittingLinkDiscovery.mjs';
// A separate owner-scoped collection retains originals without writing a
// JurisdictionProfile, approved authority, WorkOrder or shared source catalog.
export async function retainAddressResearchFiles({entity,scanRunId,actor,resolution,automatic,fetchSource,uploadFile,onProgress=async()=>{},archiveLimit=1}){
 if(!automatic?.started)return null;
 if(!scanRunId||!entity?.filter||!entity?.create)return {status:'unavailable',error:'Original-file retention is unavailable; source links remain available.',collections:[]};
 let started=0;const collections=[];
 for(let index=0;index<automatic.scans.length;index++){
  const scan=automatic.scans[index],seed=scan.continuation_state?.seed_url;
  const docs=(scan.documents || []).filter(isDownloadableResearchDocument).sort((a,b)=>permittingResourcePriority(b)-permittingResourcePriority(a));
  if(!seed||!docs.length)continue;
  try{
   const root=new URL(seed);
   if(root.protocol!=='https:'||root.username||root.password)throw Error('Original-file retention requires an HTTPS source.');
   const allowed=docs.filter(doc=>{try{const u=new URL(doc.url);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.replace(/^www\\./,'')===root.hostname.replace(/^www\\./,'')&&u.port===root.port;}catch{return false;}});
   if(!allowed.length)continue;
   const collectionKey=scanRunId+':'+index;
   const own=row=>row?.owner_id===actor.id&&row.owner_email===String(actor.email).toLowerCase()&&row.scan_run_id===scanRunId&&row.reference_only===true&&row.authority_established===false&&row.permitting_url===seed;
   let rows=await entity.filter({collection_key:collectionKey},'created_date',2);
   if(rows.length>1)throw Error('Duplicate research collection; review required.');
   if(!rows.length){
    try{await entity.create({collection_key:collectionKey,owner_id:actor.id,owner_email:String(actor.email).toLowerCase(),scan_run_id:scanRunId,name:scan.target.name,state:scan.target.state || resolution.state || '',type:scan.target.type || 'reference',permitting_url:seed,website_url:seed,auto_refresh:true,reference_only:true,authority_established:false,location_verified:resolution.status==='location_verified',location_target:scan.target,documents:allowed.map(doc=>({...doc,id:crypto.randomUUID()}))});}
    catch(error){rows=await entity.filter({collection_key:collectionKey},'created_date',2);if(rows.length!==1||!own(rows[0]))throw error;}
    rows=await entity.filter({collection_key:collectionKey},'created_date',2);
   }
   if(rows.length!==1||!own(rows[0]))throw Error('Research collection identity could not be verified.');
   const collection=rows[0];
   // A request-local bound controls automatic work, not the retained inventory.
   // Remaining originals are explicitly pending; no artificial coverage claim.
   const workerEntity={get:async id=>{const row=await entity.get(id);if(!own(row))throw Error('Research collection owner or scope changed.');return row;},updateMany:(query,patch)=>entity.updateMany({...query,owner_id:actor.id,owner_email:String(actor.email).toLowerCase(),scan_run_id:scanRunId,reference_only:true,authority_established:false,permitting_url:seed},patch)};
   let archive=null;
   if(started<archiveLimit){started++;archive=await archiveKnownJurisdictionSource({entity:workerEntity,jurisdictionId:collection.id,fetchSource,uploadFile,onProgress,manual:false});}
   const current=await workerEntity.get(collection.id);
   collections.push({id:current.id,target:scan.target,documents:current.documents,archive,reference_only:true,authority_established:false});
   await onProgress({kind:'address_file_collection',detail:`Retained ${current.documents.filter(d=>d.archive_state?.status==='complete').length} originals for ${scan.target.name}; ${current.documents.filter(d=>d.archive_state?.status!=='complete').length} files still need download or verification. Research only; no authority approved.`});
  }catch(error){collections.push({target:scan.target,error:String(error.message || error),reference_only:true,authority_established:false});await onProgress({kind:'address_archive_failed',detail:String(error.message || error)});}
 }
 return {status:collections.some(c=>c.error||c.archive?.success===false)?'needs_review':'retained',collections,reference_only:true,authority_established:false,automatic_archive_limit:archiveLimit};
}
