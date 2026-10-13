import {useEffect,useRef,useState} from 'react';
import {base44} from '@/api/base44Client';
import {readSavedSourceOfficeReviewReferences,describeSourceOfficeReview} from './selectorSourceOfficeReviewReferences.mjs';

export default function SelectorSourceOfficeReviewLookup({profile,document,api=base44,read=readSavedSourceOfficeReviewReferences}){
 const [state,setState]=useState(null),[busy,setBusy]=useState(false);
 const request=useRef(0),pending=useRef(false);
 const identity=JSON.stringify([profile?.id,profile?.state,document?.id,document?.url,
   document?.file_url,document?.source_sha256,document?.stored_sha256,document?.source_bytes,document?.stored_bytes]);
 useEffect(()=>{request.current++;pending.current=false;setState(null);setBusy(false);
   return()=>{request.current++;pending.current=false;};},[identity]);
 if(!document?.id||!document?.url)return <p className="text-amber-800">Exact saved document ID or original URL missing. Staff must repair its source identity before looking up office reviews.</p>;
 async function check(){
   if(pending.current)return;
   pending.current=true;setBusy(true);setState(null);
   const sequence=++request.current,isCurrent=()=>request.current===sequence;
   try{
     const response=await read(api,profile,document,isCurrent);
     if(isCurrent())setState({result:response});
   }catch(error){if(isCurrent())setState({error:error?.message||'Exact source review lookup could not be completed'});}
   finally{if(isCurrent()){pending.current=false;setBusy(false);}}
 }
 return <div className="mt-2">
   <button type="button" className="min-h-11 rounded border px-2 underline disabled:opacity-60"
     disabled={busy} onClick={check} aria-label={'Check exact office review records for '+document.id}>
     {busy?'Reading exact office review records…':'Check exact electrical office review IDs'}
   </button>
   {state?.error&&<p role="alert" className="mt-1 text-amber-900">Relationship lookup incomplete: {state.error} Do not infer that any role was approved or that no review exists.</p>}
   {state?.result&&<div role="status" className="mt-2 space-y-2 rounded border p-2 break-words" aria-live="polite">
     <p><strong>Read-only historical relationship check</strong> — saved document ID: {state.result.document_id}; catalog source ID: {state.result.source_id||'unavailable'}.</p>
     <p>{state.result.notice}</p>
     {state.result.status==='recorded_history_read'&&!state.result.items.length&&<p>No electrical relationship reviews were visible for this exact catalog source. This does not prove none exist outside read permissions.</p>}
     {state.result.items.map((row,i)=><div key={row.review_id+'-'+i} className="border-t pt-2">
       <strong>{row.role==='electrical_permit'?'Electrical permit issuer':'Electrical inspection provider'}</strong>
       <p>Source-linked review ID: {row.review_id}. Latest committed related event ID: {row.latest_review_id||'not established'}.</p>
       <p>Canonical office ID: {row.office_id||'not recorded'}. Physical PDF page: {row.physical_page||'not recorded'}.</p>
       <p><strong>{describeSourceOfficeReview(row).label}</strong>. Latest review source ID: {row.latest_source_id||'not recorded'}.</p>
       <p>Next staff action: {describeSourceOfficeReview(row).action}</p>
       <p className="text-xs">Evidence check: {row.status.replaceAll('_',' ')}. An older record does not establish current authority. If the latest event cannot be established, do not treat the source-linked review as the latest decision.</p>
       {row.review_ids.length>1&&<p>Recorded relationship event IDs: {row.review_ids.join(' · ')}. Later events may revoke or supersede the original source relationship.</p>}
     </div>)}
     <p>Even a recorded source reference is not current electrical office approval. Ask authorized staff to examine source, office and covered-area evidence before making an official responsibility decision.</p>
   </div>}
 </div>;
}
