import AddressResearchPages from './AddressResearchPages';
import AddressDocumentLink from './AddressDocumentLink';
import OriginalFileStatus,{OriginalCollectionStatus} from './OriginalFileStatus';
import {base44} from '@/api/base44Client';
import {useAuth} from '@/components/auth/EmailGate';
import {useState,useEffect,useRef,useMemo} from 'react';
import {verifiedOriginal,remainingOriginals,saveOriginalBatch,originalFileStatus} from './addressOriginalBatch.mjs';
import {useResearchProgress} from './ResearchProgressContext';
import {usePolling} from '@/lib/usePolling';
function webUrl(value){
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function SourceLink({url,label}){
 const href=webUrl(url);
 return href?<a className="underline text-blue-700 break-all" href={href} target="_blank" rel="noopener noreferrer">{label || href}</a>:<span>{label || 'Invalid source link'} — link unavailable</span>;
}
const TYPE_LABELS={permit_application:'Application or form',fee_schedule:'Fees',checklist:'Checklist',sign_ordinance:'Sign rules',zoning_code:'Zoning or code',other:'Reference'};
const GAP_LABELS={page_fetch_failed:'Page could not be read',depth_frontier:'More pages need scanning',page_link_limit:'More links remain on this page',oversized_resource_url:'Link needs review'};
export default function AutomaticAddressScanResults({scanResult,archives,savedOnly=false}){
 const {sessionToken,currentUser}=useAuth(),{runAction,trackAction}=useResearchProgress(),[collections,setCollections]=useState(archives?.collections || []),[busy,setBusy]=useState(new Set()),[error,setError]=useState(''),[checking,setChecking]=useState(false),[batch,setBatch]=useState(null),batchRef=useRef(null),[scanning,setScanning]=useState(new Set()),discoveryBusyRef=useRef(new Set()),refreshVersion=useRef(0);
 const refreshScope=JSON.stringify([currentUser?.id || currentUser?.email || '',currentUser?.role || '',sessionToken || '']);
 const refreshScopeRef=useRef(refreshScope),manualCheckRef=useRef(null);refreshScopeRef.current=refreshScope;
 useEffect(()=>{refreshVersion.current++;manualCheckRef.current=null;setChecking(false);},[refreshScope]);
 useEffect(()=>()=>{refreshVersion.current++;manualCheckRef.current=null;refreshScopeRef.current=null;},[]);
 const saveEpoch=useRef(0),saveRequests=useRef(new Map());
 useEffect(()=>{saveEpoch.current++;saveRequests.current.clear();if(batchRef.current)batchRef.current.stop=true;setBusy(new Set());setBatch(null);},[refreshScope,archives]);
 useEffect(()=>()=>{saveEpoch.current++;if(batchRef.current)batchRef.current.stop=true;},[]);
 const discoveryScope=useMemo(()=>({}),[refreshScope,archives]),discoveryScopeRef=useRef(discoveryScope);discoveryScopeRef.current=discoveryScope;
 useEffect(()=>{discoveryBusyRef.current=new Set();setScanning(new Set());},[discoveryScope]);
 useEffect(()=>()=>{discoveryScopeRef.current=null;},[]);
 function discoveryBusy(id,active){if(discoveryScopeRef.current!==discoveryScope)return;refreshVersion.current++;const next=new Set(discoveryBusyRef.current);if(active)next.add(id);else next.delete(id);discoveryBusyRef.current=next;setScanning(next);}
 function updateCollection(updated){if(discoveryScopeRef.current!==discoveryScope)return;refreshVersion.current++;setCollections(previous=>previous.map(row=>row.id===updated.id?{...row,...updated}:row));}
 useEffect(()=>()=>{if(batchRef.current)batchRef.current.stop=true;},[archives]);
 useEffect(()=>{refreshVersion.current++;setCollections(archives?.collections || []);},[archives]);
 async function checkFiles(){
  const ids=collections.map(row=>row.id).filter(Boolean);
  if(!ids.length||manualCheckRef.current||batchRef.current||discoveryBusyRef.current.size)return;
  const request={scope:refreshScope,version:++refreshVersion.current};manualCheckRef.current=request;
  const current=()=>manualCheckRef.current===request&&refreshScopeRef.current===request.scope&&refreshVersion.current===request.version;
  setChecking(true);setError('');
  try{
   const response=await base44.functions.invoke('getAddressResearchCollections',{collection_ids:ids,review:archives?.review_mode===true,session_token:sessionToken});
   if(current()){if(response.data?.collections)setCollections(response.data.collections);for(const run of response.data?.actions || [])trackAction(run);}
  }catch{if(current())setError('Saved file status could not update. Use Check saved files to try again.');}
  finally{if(manualCheckRef.current===request){manualCheckRef.current=null;if(refreshScopeRef.current===request.scope)setChecking(false);}}
 }

 usePolling(async()=>{
  const ids=(archives?.collections || []).map(row=>row.id).filter(Boolean);
  if(!ids.length||manualCheckRef.current||batchRef.current||discoveryBusyRef.current.size)return;
  const version=refreshVersion.current;
  const current=()=>refreshScopeRef.current===refreshScope&&version===refreshVersion.current&&!manualCheckRef.current&&!discoveryBusyRef.current.size;
  try{
   const response=await base44.functions.invoke('getAddressResearchCollections',{collection_ids:ids,review:archives?.review_mode===true,session_token:sessionToken});
   if(current()){if(response.data?.collections)setCollections(response.data.collections);for(const run of response.data?.actions || [])trackAction(run);}
  }catch{if(current())setError('Saved file status could not update. Use Check saved files to try again.');}
 },60000,{enabled:Boolean(sessionToken)&&(archives?.collections || []).some(row=>row.id),runOnMount:false});

 async function saveFile(collection,doc,forBatch=false){
  const key=collection.id+'|'+doc.id;
  if(!sessionToken||refreshScopeRef.current!==refreshScope||saveRequests.current.has(key))return false;
  const request={epoch:saveEpoch.current,scope:refreshScope};saveRequests.current.set(key,request);
  const current=()=>saveEpoch.current===request.epoch&&refreshScopeRef.current===request.scope&&saveRequests.current.get(key)===request;
  refreshVersion.current++;setBusy(previous=>new Set([...previous,doc.id]));setError('');
  try{
   const response=await runAction('archiveAddressResearchFile',{collection_id:collection.id,...(doc.referral?{referral_url:doc.url,source_page_url:doc.source_page_url}:{document_id:doc.id})},'Save original — '+(doc.title || 'research file'));
   if(!current())return false;
   if(response.data?.collection)setCollections(previous=>previous.map(row=>row.id===collection.id?{...row,documents:response.data.collection.documents}:row));
   if(response.data?.success===false)setError(response.data.error || 'The file still needs verification.');
   return Boolean(response.data?.collection?.documents?.some(file=>file.url===doc.url&&verifiedOriginal(file)));
  }catch(e){if(current()){setError(e.message);if(forBatch)throw e;}return false;}
  finally{if(current()){saveRequests.current.delete(key);setBusy(previous=>{const next=new Set(previous);next.delete(doc.id);return next;});}}
 }
 async function saveAll(collection){
  if(!sessionToken||refreshScopeRef.current!==refreshScope||batchRef.current||saveRequests.current.size||discoveryBusyRef.current.size)return;
  const control={stop:false,epoch:saveEpoch.current,scope:refreshScope},files=remainingOriginals(collection);batchRef.current=control;
  const current=()=>batchRef.current===control&&saveEpoch.current===control.epoch&&refreshScopeRef.current===control.scope;
  const initial={collectionId:collection.id,total:files.length,checked:0,saved:0,needsReview:0,running:true};
  setBatch(initial);
  try{
   const result=await saveOriginalBatch({files,save:doc=>saveFile(collection,doc,true),stopped:()=>control.stop||!current(),onProgress:progress=>{if(current())setBatch({...initial,...progress});}});
   if(current())setBatch({...initial,...result,running:false});
  }catch{if(current())setBatch(previous=>({...previous,running:false,halted:true}));}
  finally{if(batchRef.current===control)batchRef.current=null;}
 }

 if(!scanResult?.started)return null;
 return <section className="rounded-lg border bg-white p-3 space-y-2" aria-label="Automatic address scan results">
  <h4 className="font-semibold text-sm">{savedOnly?'Saved research files':'What we checked'}</h4>
  <p className="text-xs text-gray-700">Sources and saved files are research — not approved instructions. An admin has to check them.</p>
  {archives?.error&&<p role="alert" className="text-xs text-amber-800">{archives.error}</p>}
  {error&&<p role="alert" className="text-xs text-amber-800">{error}</p>}
  {collections.map(collection=><AddressResearchPages key={collection.id} collection={collection} review={archives?.review_mode} disabled={Boolean(batch?.running)||busy.size>0} onUpdate={updateCollection} onBusyChange={discoveryBusy}/>)}
  {!!collections.length&&<details className="border rounded p-2"><summary className="min-h-11 text-sm cursor-pointer">Original files ({collections.reduce((n,c)=>n+(c.documents?.length || 0)+(c.external_referrals || []).filter(ref=>!c.documents?.some(doc=>doc.url===ref.url)).length,0)})</summary><p className="text-xs">Files save separately from checked offices. One tries right away; the rest run on the scheduler. You can also tap "Save original now".</p><button type="button" className="min-h-11 border rounded px-3 text-xs" disabled={checking||batch?.running||scanning.size>0} onClick={checkFiles}>{checking?'Checking…':'Check saved files'}</button>{collections.map((collection,i)=><div key={collection.id || i} className="text-xs space-y-2 py-2"><h5 className="font-semibold">{collection.target?.name}</h5>{archives?.review_mode&&<p>Collected by: {collection.owner_email || 'Unknown'} · {collection.target?.state || 'State unknown'} · {collection.target?.county || 'County unknown'}<br/>{collection.location_verified?'Location was verified when collected — the rules still need checking.':"Location wasn't verified — which office it belongs to needs checking."}{collection.source_url&&<> Source: <SourceLink url={collection.source_url}/></>}</p>}{collection.error&&<p>{collection.error}</p>}<OriginalCollectionStatus collection={collection}/>{!archives?.review_mode&&<div className="space-y-2"><button type="button" className="min-h-11 border rounded px-3" disabled={Boolean(batch?.running)||scanning.size>0||busy.size>0||!remainingOriginals(collection).length} onClick={()=>saveAll(collection)}>Save the rest of the files</button><p>One file at a time — keep this open. Anything already saved or uncertain is skipped.</p>{batch?.collectionId===collection.id&&<div role="status" className="space-y-1"><p>{batch.running?'Saving files':batch.halted?'Stopped after an error — check the saved files before trying again':batch.stopped?'Stopped after the current file':'All done'}: {batch.checked} of {batch.total} checked · {batch.saved} saved · {batch.needsReview} need a look.</p>{batch.running&&<><progress aria-label="Save all originals" className="w-full" value={batch.checked} max={batch.total || 1}/><p>{batch.current}</p><button type="button" className="min-h-11 border rounded px-3" disabled={batch.stopRequested} onClick={()=>{if(batchRef.current)batchRef.current.stop=true;setBatch(previous=>({...previous,stopRequested:true}));}}>{batch.stopRequested?'Stopping after current file…':'Stop after current file'}</button></>}</div>}</div>}{(collection.documents || []).map(doc=><div key={doc.id} className="border-t py-2"><SourceLink url={doc.url} label={doc.title}/>{doc.external_referral_provenance&&<p>Linked from: <SourceLink url={doc.external_referral_provenance.source_page_url}/> · Direct file only; outside website not crawled.</p>}{verifiedOriginal(doc)?<><p>Saved original — source and stored bytes verified.</p><SourceLink url={doc.file_url} label="Open saved original"/>{archives?.review_mode&&<AddressDocumentLink key={JSON.stringify(doc)} collection={collection} document={doc}/>}</>:<><OriginalFileStatus document={doc}/>{doc.archive_state?.error&&<p className="text-amber-800">{doc.archive_state.error}</p>}{!archives?.review_mode&&<button type="button" className="min-h-11 border rounded px-3" disabled={Boolean(batch?.running)||scanning.size>0||busy.has(doc.id)||Date.parse(doc.archive_state?.lease_expires_at || '')>Date.now()||['uploading','upload_uncertain'].includes(doc.archive_state?.status)} onClick={()=>saveFile(collection,doc)}>{busy.has(doc.id)?'Saving…':originalFileStatus(doc).kind==='active'?'Working…':doc.archive_state?.file_url?'Verify saved file':'Save original'}</button>}</>}</div>)}{(collection.external_referrals || []).filter(ref=>!collection.documents?.some(doc=>doc.url===ref.url)).map(ref=><div key={ref.url+'|'+ref.source_page_url} className="border-t py-2"><SourceLink url={ref.url} label={ref.title}/><p>Outside-host original waiting. Found on: <SourceLink url={ref.source_page_url}/></p>{!archives?.review_mode&&<button type="button" className="min-h-11 border rounded px-3" disabled={Boolean(batch?.running)||scanning.size>0||busy.has('referral:'+ref.url)} onClick={()=>saveFile(collection,{...ref,id:'referral:'+ref.url,referral:true})}>{busy.has('referral:'+ref.url)?'Saving…':'Save linked original'}</button>}</div>)}</div>)}</details>}
  {(scanResult.scans || []).map((scan,index)=><details key={index} className="border rounded p-2">
   <summary className="min-h-11 text-sm cursor-pointer">{scan.target?.name || 'Address research'}: {scan.documents?.length || 0} source links; {scan.external_referrals?.length || 0} outside links</summary>
   {scan.error&&<p className="text-xs text-amber-800">{scan.error}</p>}
   <div className="space-y-3 text-xs">
    {!!scan.documents?.length&&<div><h5 className="font-semibold">Forms, rules, and links</h5><ul className="space-y-2 mt-2">{scan.documents.map((doc,i)=><li key={i}><SourceLink url={doc.url} label={doc.title}/><p>{TYPE_LABELS[doc.doc_type] || 'Reference'} — {collections.some(collection=>collection.documents?.some(file=>file.url===doc.url&&verifiedOriginal(file)))?'file saved under Original files':'not downloaded or saved'}</p>{doc.discovery_page_url&&<p>Found on: <SourceLink url={doc.discovery_page_url}/></p>}</li>)}</ul></div>}
    {!!scan.external_referrals?.length&&<div><h5 className="font-semibold">Outside filing sites and sources</h5><p>Linked from the source site. Outside sites weren't checked or approved. Downloadable files may be saved under Original files.</p><ul className="space-y-2 mt-2">{scan.external_referrals.map((ref,i)=><li key={i}><SourceLink url={ref.url} label={ref.title}/>{ref.source_page_url&&<p>Found on: <SourceLink url={ref.source_page_url}/></p>}</li>)}</ul></div>}
    {!!scan.pages?.length&&<details><summary className="min-h-11 cursor-pointer">Pages checked ({scan.pages.length})</summary><ul className="space-y-2">{scan.pages.map((page,i)=><li key={i}><SourceLink url={page.final_url || page.url}/><p>{page.status==='failed'?'Could not read this page':page.status==='classified_pdf'?'PDF signature checked; full download still needed':page.status==='redirect_duplicate'?'Redirected to a page already checked':'Page scanned'}{page.error?': '+page.error:''}</p></li>)}</ul></details>}
    {!!scan.pending_pages?.length&&<details><summary className="min-h-11 cursor-pointer">Pages still waiting ({scan.pending_pages.length})</summary><ul className="space-y-2">{scan.pending_pages.map((page,i)=><li key={i}><SourceLink url={page.url}/></li>)}</ul></details>}
    {!!scan.gaps?.length&&<details><summary className="min-h-11 cursor-pointer">Problems to review ({scan.gaps.length})</summary><ul className="space-y-2">{scan.gaps.map((gap,i)=><li key={i}><SourceLink url={gap.url}/><p>{GAP_LABELS[gap.reason] || gap.reason || 'Needs review'}{gap.detail?': '+gap.detail:''}</p></li>)}</ul></details>}
    <p className="text-amber-800">This first scan does not establish complete coverage. Findings need administrator review.</p>
   </div>
  </details>)}
 </section>;
}