import {ResearchProgressContext} from "./ResearchProgressContext";
import { useEffect, useRef, useState,useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { staffEntities } from "@/components/staff/staffEntities";
const labels={downloadable_document:'Document',online_form:'Online form',code_publisher:'Code publisher',department_reference:'Department',other_permitting_resource:'Other resource'};
function webLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export default function ExternalPermittingReferrals({jurisdiction,isAdmin,onUpdate,disabled=false}){
 const activity=useContext(ResearchProgressContext);
 const [busy,setBusy]=useState(null),[message,setMessage]=useState(''),[page,setPage]=useState(0);
 const lock=useRef(false),alive=useRef(true),identity=useRef(jurisdiction.id);identity.current=jurisdiction.id;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const rows=jurisdiction.discovery_scan_state?.external_referrals || [];
 const pages=Math.max(1,Math.ceil(rows.length/20)),shownPage=Math.min(page,pages-1);
 const blocked=jurisdiction._manual_documents || jurisdiction.discovery_scan_state?.blocked || jurisdiction.discovery_scan_state?.seed_url!==jurisdiction.permitting_url || !['OH','KY'].includes(jurisdiction.state);
 async function collect(row){
  if(lock.current||disabled||blocked||!isAdmin)return;
  const id=jurisdiction.id;lock.current=true;setBusy(row.url);setMessage('Rechecking the official link and collecting the selected file…');
  let result,error;
  try{result=(await (activity?.runAction || base44.functions.invoke.bind(base44.functions))('continueJurisdictionArchives',{jurisdiction_id:id,external_referral:{url:row.url,source_page_url:row.source_page_url}},`Collect ${row.title || row.url} — ${jurisdiction.name}`)).data;}catch(e){error=e?.response?.data?.error || e?.message || 'Collection could not complete.';}
  // Refresh durable receipts even when the request acknowledgement was lost.
  let latest;try{latest=await staffEntities.JurisdictionProfile.get(id);}catch{error=error || 'Could not reload the saved document status. Refresh this locality before retrying.';}
  if(alive.current&&identity.current===id){
   if(latest?.id===id)onUpdate(latest);
   const doc=latest?.documents?.find(d=>d.url===row.url);
   setMessage(error || (result?.archived===1?'File archived and stored bytes verified. Authority and applicability still require review.':doc?.archive_state?.status==='complete'?'This file is already archived.':result?.skipped?'No new collection was performed. Check the saved document status before retrying.':result?.error || 'Collection is incomplete. Check the saved document status before retrying.'));
   setBusy(null);
  }
  lock.current=false;
 }
 if(!rows.length)return null;
 return <section aria-label="External permitting resources" className="min-w-0 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
  <h3 className="text-sm font-semibold text-blue-900">External resources found ({rows.length})</h3>
  <p className="text-xs text-gray-700">These links were found on official pages. Collecting a document retains and verifies its bytes; its authority and applicability still need review. Online forms and code publishers open for separate review.</p>
  {blocked&&<p className="text-xs text-amber-800">Collection is unavailable while documents are protected or the official discovery source needs review.</p>}
  {message&&<p role="status" aria-live="polite" className="text-sm break-words">{message}</p>}
  <ul className="space-y-2">{rows.slice(shownPage*20,shownPage*20+20).map((row,index)=>{
   const target=webLink(row.url),source=webLink(row.source_page_url),doc=jurisdiction.documents?.find(d=>d.url===row.url),complete=doc?.archive_state?.status==='complete';
   const uncertain=['uploading','upload_uncertain'].includes(doc?.archive_state?.status);
   return <li key={`${row.source_page_url}:${row.url}:${index}`} className="min-w-0 rounded border bg-white p-3 space-y-2">
    <div className="text-xs text-gray-500">{labels[row.referral_kind] || 'Resource'}{doc?.archive_state?.status?` · ${doc.archive_state.status.replaceAll('_',' ')}`:''}</div>
    <div className="font-medium text-sm break-words">{row.title || 'External resource'}</div>
    {target&&<a href={target} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-blue-700 underline break-all">Open resource</a>}
    {source&&<div className="text-xs break-all">Found on: <a href={source} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{source}</a></div>}
    {isAdmin&&row.referral_kind==='downloadable_document'&&<button type="button" disabled={Boolean(busy)||disabled||blocked||!target||!source||complete||uncertain} onClick={()=>collect(row)} className="min-h-11 rounded border border-blue-300 px-3 text-sm text-blue-800 disabled:opacity-50">{busy===row.url?'Collecting…':complete?'Archived':uncertain?'Receipt needs reconciliation':doc?'Retry collection':'Collect document'}</button>}
   </li>;
  })}</ul>
  {pages>1&&<div className="flex items-center gap-3 text-sm"><button type="button" disabled={shownPage===0} onClick={()=>setPage(shownPage-1)} className="min-h-11 px-2">Previous</button><span>Page {shownPage+1} of {pages}</span><button type="button" disabled={shownPage===pages-1} onClick={()=>setPage(shownPage+1)} className="min-h-11 px-2">Next</button></div>}
 </section>;
}