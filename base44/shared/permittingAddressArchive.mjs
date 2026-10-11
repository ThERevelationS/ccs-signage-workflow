import {createScanReporter,silentScanReporter} from './permittingScanReporter.mjs';
import {archiveDocumentEligible,archiveBacklogQuery} from './jurisdictionArchiveContinuation.mjs';
import {archiveKnownJurisdictionSource} from './jurisdictionArchiveContinuation.mjs';
import {isDownloadableResearchDocument,permittingResourcePriority} from './jurisdictionPermittingLinkDiscovery.mjs';
function scopedArchiveFetch(entity,id,seed,fetchSource){
 return async(url,init)=>{
  const row=await entity.get(id);
  const isStored=(row.documents || []).some(doc=>doc.archive_state?.file_url===url&&/^[a-f0-9]{64}$/.test(doc.archive_state?.source_sha256 || ''));
  const root=new URL(seed),target=new URL(url);
  if(!isStored&&(target.protocol!=='https:'||target.username||target.password||target.hostname.replace(/^www\./,'')!==root.hostname.replace(/^www\./,'')||target.port!==root.port))throw Error('Research original redirected outside the saved source host.');
  return fetchSource(url,init,isStored?null:root.hostname.replace(/^www\./,''));
 };
}
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
   const allowed=docs.filter(doc=>{try{const u=new URL(doc.url);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.replace(/^www\./,'')===root.hostname.replace(/^www\./,'')&&u.port===root.port;}catch{return false;}});
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
   if(started<archiveLimit){started++;archive=await archiveKnownJurisdictionSource({entity:workerEntity,jurisdictionId:collection.id,fetchSource:scopedArchiveFetch(workerEntity,collection.id,seed,fetchSource),uploadFile,onProgress,manual:false});}
   const current=await workerEntity.get(collection.id);
   collections.push({id:current.id,target:scan.target,documents:current.documents,archive,reference_only:true,authority_established:false});
   await onProgress({kind:'address_file_collection',collection_id:current.id,resources:current.documents.filter(d=>d.archive_state?.status==='complete').map(d=>({url:d.file_url,title:'Saved original: '+(d.title || d.url),doc_type:'saved_original'})),detail:`Retained ${current.documents.filter(d=>d.archive_state?.status==='complete').length} originals for ${scan.target.name}; ${current.documents.filter(d=>d.archive_state?.status!=='complete').length} files still need download or verification. Research only; no authority approved.`});
  }catch(error){collections.push({target:scan.target,error:String(error.message || error),reference_only:true,authority_established:false});await onProgress({kind:'address_archive_failed',detail:String(error.message || error)});}
 }
 return {status:collections.some(c=>c.error||c.archive?.success===false)?'needs_review':'retained',collections,reference_only:true,authority_established:false,automatic_archive_limit:archiveLimit};
}

export async function archiveOwnedAddressResearchFile({entity,collectionId,documentId,actor,fetchSource,uploadFile,onProgress,automatic=false,automaticState,now}){
 const current=await entity.get(collectionId);
 const own=row=>row?.owner_id===actor.id&&row.owner_email===String(actor.email).toLowerCase()&&row.reference_only===true&&row.authority_established===false&&row.scan_run_id===current.scan_run_id&&row.permitting_url===current.permitting_url;
 if(!own(current))throw Object.assign(Error('This research collection is not available to your account.'),{status:403});
 if(automatic&&automaticState&&current.state!==automaticState)return {success:true,skipped:true,reason:'state_changed'};
 if(automatic&&current.auto_refresh!==true)return {success:true,skipped:true,reason:'auto_refresh_disabled'};
 if(!(current.documents || []).some(doc=>doc.id===documentId))throw Object.assign(Error('Select a saved research file.'),{status:400});
 const rows=await entity.filter({collection_key:current.collection_key},'created_date',2);
 if(rows.length!==1||rows[0].id!==current.id)throw Object.assign(Error('Duplicate research collection requires review.'),{status:409});
 const seed=new URL(current.permitting_url);
 const source=current.documents.find(doc=>doc.id===documentId),url=new URL(source.url);
 if(seed.protocol!=='https:'||url.protocol!=='https:'||url.username||url.password||url.hostname.replace(/^www\./,'')!==seed.hostname.replace(/^www\./,'')||url.port!==seed.port)throw Object.assign(Error('Research source is outside the saved host.'),{status:400});
 const adapter={get:async id=>{const row=await entity.get(id);if(!own(row)||(automatic&&(row.auto_refresh!==true||row.state!==current.state)))throw Error('Research collection owner, automatic setting or scope changed.');return row;},updateMany:(query,patch)=>entity.updateMany({...query,...(automatic?{auto_refresh:true,state:current.state}:{}),owner_id:actor.id,owner_email:String(actor.email).toLowerCase(),scan_run_id:current.scan_run_id,reference_only:true,authority_established:false,permitting_url:current.permitting_url},patch)};
 const result=await archiveKnownJurisdictionSource({entity:adapter,jurisdictionId:collectionId,documentId,manual:!automatic,now,fetchSource:scopedArchiveFetch(adapter,collectionId,current.permitting_url,fetchSource),uploadFile,onProgress});
 return {...result,collection:await adapter.get(collectionId)};
}

export async function continueAddressResearchArchives({entity,scanEntity,state,fetchSource,uploadFile,now=()=>Date.now()}){
 if(!entity?.filter||!scanEntity?.get)return {success:true,skipped:true,reason:'address_archive_unavailable'};
 const query=archiveBacklogQuery(now());query.state=state;query.auto_refresh=true;
 Object.assign(query,{reference_only:true,authority_established:false,owner_id:{$nin:[null,'']},owner_email:{$nin:[null,'']},scan_run_id:{$nin:[null,'']}});
 const candidates=await entity.filter(query,'updated_date',20,0),review=[];
 for(const listed of candidates){
  let reporter=silentScanReporter,attempted=false;
  try{
   const collection=await entity.get(listed.id);
   if(collection.state!==state||collection.auto_refresh!==true||collection.reference_only!==true||collection.authority_established!==false)continue;
   const run=await scanEntity.get(collection.scan_run_id);
   if(!run||run.action_kind!=='address'||!['complete','completed_with_errors'].includes(run.status)||run.owner_id!==collection.owner_id||run.owner_email!==collection.owner_email||!(collection.collection_key || '').startsWith(run.id+':')||!/^\d+$/.test((collection.collection_key || '').slice(run.id.length+1)))throw Error('Address collection origin or owner requires review.');
   const document=(collection.documents || []).find(doc=>archiveDocumentEligible(doc,{now:now()}));
   if(!document)continue;
   const actor={id:collection.owner_id,email:collection.owner_email};
   reporter=await createScanReporter({entity:scanEntity,token:crypto.randomUUID(),user:actor,targetId:collection.id,targetName:collection.name,kind:'address_archive',label:'Automatic original download — '+(document.title || collection.name)});
   attempted=true;
   const result=await archiveOwnedAddressResearchFile({entity,collectionId:collection.id,documentId:document.id,actor,automatic:true,automaticState:state,now,fetchSource,uploadFile,onProgress:event=>reporter.emit(event,event.progress || {})});
   if(result.skipped){await reporter.finish('complete',result.reason);continue;}
   const saved=result.collection?.documents?.find(doc=>doc.id===document.id);
   if(saved?.archive_state?.status==='complete')await reporter.emit({kind:'saved_original',resources:[{url:saved.file_url,title:'Saved original: '+(saved.title || saved.url),doc_type:'saved_original'}],detail:'Source and stored byte counts and SHA-256 matched.'});
   await reporter.finish(result.success===false?'completed_with_errors':'complete',result.error || '');
   const {collection:privateCollection,jurisdiction,...publicResult}=result;
   return {...publicResult,archive_queue:'address',collection_id:collection.id,document_id:document.id,collections_checked:candidates.length};
  }catch(error){await reporter.finish('failed','Automatic research download could not finish safely.');review.push({collection_id:listed.id,error:String(error.message || error).slice(0,300)});if(attempted)return {success:false,status:'address_archive_conflict',archive_queue:'address',error:'Automatic research download requires review.',review};}
 }
 return {success:true,skipped:true,reason:'no_eligible_address_file',collections_checked:candidates.length,review};
}
