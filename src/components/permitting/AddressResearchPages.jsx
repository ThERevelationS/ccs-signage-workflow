import {useState,useRef,useEffect} from 'react';
import {useResearchProgress} from './ResearchProgressContext';
import {runAddressPageScan} from './addressPageScan.mjs';
function PageLink({url,label}){
 let href;try{const u=new URL(url);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)href=u.href;}catch{}
 return href?<a href={href} target="_blank" rel="noopener noreferrer" className="underline text-blue-700 break-all">{label || href}</a>:<span>Link unavailable</span>;
}
export default function AddressResearchPages({collection,review,disabled,onUpdate,onBusyChange}){
 const {runAction,actions}=useResearchProgress(),[pass,setPass]=useState(null),[error,setError]=useState(''),control=useRef(null);
 useEffect(()=>()=>{if(control.current)control.current.stop=true;onBusyChange(collection.id,false);},[collection.id]); // Stop future pages when this research view leaves.
 const discovery=collection.discovery;
 const currentSource=Object.values(actions).filter(action=>action.target_id===collection.id&&action.action_kind==='address_discovery'&&action.status==='running'&&action.current_url).at(-1)?.current_url;
 if(!discovery)return null;
 async function scan(retryPageUrl=null){
  if(control.current||disabled)return;
  const request={stop:false};control.current=request;onBusyChange(collection.id,true);setError('');setPass({running:true,retry:retryPageUrl!==null,checked:0,failed:0});
  try{
   const result=retryPageUrl!==null?await retryPage(retryPageUrl):await runAddressPageScan({collection,stopped:()=>request.stop,onProgress:progress=>setPass(previous=>({...previous,...progress})),
    scanPage:async current=>{const response=await runAction('continueAddressResearchDiscovery',{collection_id:current.id},'Scan research page — '+(current.target?.name || current.name || 'address research'));if(response.data?.collection)onUpdate(response.data.collection);return response.data;}});
   setPass({...result,retry:retryPageUrl!==null,running:false});
  }catch(e){setError(e.response?.data?.error || e.message || 'Page result could not be confirmed. Check saved research before retrying.');setPass(previous=>({...previous,running:false,halted:true}));}
  finally{control.current=null;onBusyChange(collection.id,false);}
 }
 async function retryPage(url){
  const response=await runAction('continueAddressResearchDiscovery',{collection_id:collection.id,retry_page_url:url},'Retry research page — '+(collection.target?.name || collection.name || 'address research'));
  const result=response.data;if(!result?.collection)throw Error('Page retry result could not be confirmed. Refresh saved research before retrying.');
  onUpdate(result.collection);
  if(result.success===false)throw Error(result.error || 'Saved page progress needs review.');
  return {checked:result.attempted_pages || 0,failed:(result.pages || []).filter(page=>page.status==='failed').length,stopped:false};
 }
 return <details className="border rounded p-2 space-y-2"><summary className="min-h-11 cursor-pointer">Website pages for {collection.target?.name || collection.name || 'this address'}: {discovery.pending_pages.length} waiting · {discovery.gaps.length} problems</summary>
  <p>This continues saved pages on the source website. Each page has its own action progress and findings. New originals appear in the file list; use Save all remaining originals to download them.</p>
  {discovery.blocked&&<p className="text-amber-800">Saved page progress needs review: {discovery.block_reason || 'The source or progress changed.'}</p>}
  {!review&&<button type="button" className="min-h-11 border rounded px-3" disabled={disabled||pass?.running||discovery.blocked||!discovery.pending_pages.length} onClick={()=>scan()}>Scan remaining pages</button>}
  {pass&&<div role="status"><p>{pass.running?(pass.retry?'Retrying failed page':'Scanning saved pages'):pass.halted?'Scan stopped after a request error':pass.stopped?'Stopped after this page':pass.retry?'Page retry finished':'Remaining-page scan finished'}: {pass.checked} checked · {pass.failed} failed.</p>{pass.running&&<p className="break-all">{currentSource?'Checking: '+currentSource:'Waiting for page activity…'}</p>}{pass.running&&<button type="button" className="min-h-11 border rounded px-3" disabled={pass.stopRequested} onClick={()=>{if(control.current)control.current.stop=true;setPass(previous=>({...previous,stopRequested:true}));}}>{pass.stopRequested?'Stopping after this page…':'Stop after this page'}</button>}</div>}
  {error&&<p role="alert" className="text-amber-800">{error}</p>}
  <p>Keep this window open. This is source research; it does not approve an office, assign a jurisdiction or establish complete coverage. Failed and depth-limited pages remain for review.</p>
  {!!discovery.pending_pages.length&&<details><summary className="min-h-11 cursor-pointer">Waiting page URLs ({discovery.pending_pages.length})</summary><ul>{discovery.pending_pages.map((page,index)=><li key={page.url+index}><PageLink url={page.url}/></li>)}</ul></details>}
  {!!discovery.last_pages.length&&<details><summary className="min-h-11 cursor-pointer">Latest page checked</summary>{discovery.last_pages.map((page,index)=><div key={index}><PageLink url={page.final_url || page.url}/><p>{page.status==='failed'?'Could not read this page: '+page.error:page.status==='classified_pdf'?'PDF identified; full original still needs saving.':page.status==='redirect_duplicate'?'Redirect reached an already checked page.':'Page scanned.'}</p></div>)}</details>}
  {!!discovery.last_resources.length&&<details><summary className="min-h-11 cursor-pointer">Latest links found ({discovery.last_resources.length})</summary><ul>{discovery.last_resources.map((resource,index)=><li key={index}><PageLink url={resource.url} label={resource.title}/></li>)}</ul></details>}
  {!!discovery.gaps.length&&<details><summary className="min-h-11 cursor-pointer">Saved page problems ({discovery.gaps.length})</summary>{discovery.gaps.map((gap,index)=><div key={index}><PageLink url={gap.url}/><p>{gap.reason==='page_fetch_failed'?'Page could not be read':gap.reason==='depth_frontier'?'Page lies beyond this scan’s saved depth':gap.reason==='page_link_limit'?'More links need review on this page':'Page needs review'}{gap.detail?': '+gap.detail:''}</p>{!review&&gap.reason==='page_fetch_failed'&&<button type="button" className="min-h-11 border rounded px-3" disabled={disabled||pass?.running||discovery.blocked} onClick={()=>scan(gap.url)}>Retry this page</button>}</div>)}</details>}
  {!!discovery.outside_links?.length&&<details><summary className="min-h-11 cursor-pointer">Outside sites found ({discovery.outside_links.length})</summary><p>These outside websites have not been scanned or approved.</p><ul>{discovery.outside_links.map((link,index)=><li key={index}><PageLink url={link.url} label={link.title}/></li>)}</ul></details>}
 </details>;
}
