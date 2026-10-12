import {useState,useRef,useEffect} from 'react';
import {base44} from '@/api/base44Client';
import {useAuth} from '@/components/auth/EmailGate';
import {useResearchProgress} from './ResearchProgressContext';
export default function AddressDocumentLink({collection,document}){
 const {sessionToken,currentUser}=useAuth();
 if(currentUser?.role!=='admin')return null;
 if(collection.location_verified!==true)return <p className="mt-2 text-amber-800">Verify the collection’s jurisdiction before linking this original.</p>;
 const scope=JSON.stringify([currentUser.id || currentUser.email,currentUser.role,sessionToken,collection,document]);
 return <DocumentLinkSession key={scope} collection={collection} document={document} sessionToken={sessionToken} />;
}
function DocumentLinkSession({collection,document,sessionToken}){
 const {runAction}=useResearchProgress(),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function act(save=false){
  if(!mounted.current||pending.current||(save&&!preview))return;
  pending.current=true;setBusy(true);setMessage('');
  const reviewed=preview;setPreview(null);
  try{
   const input={collection_id:collection.id,document_id:document.id,...(save?{confirmed:true,expected_evidence_digest:reviewed.expected_evidence_digest,expected_updated_date:reviewed.expected_updated_date}:{dry_run:true})};
   const response=save?await runAction('linkAddressResearchDocument',input,'Link reviewed original — '+document.title):await base44.functions.invoke('linkAddressResearchDocument',{...input,session_token:sessionToken});
   if(!mounted.current)return;
   if(response.data?.status==='linked'||response.data?.status==='already_linked')setMessage('Original linked to the jurisdiction repository. Rules and office authority still need their own review.');
   else if(!save&&response.data?.dry_run===true&&/^[a-f0-9]{64}$/.test(response.data.expected_evidence_digest || '')&&typeof response.data.expected_updated_date==='string'&&response.data.expected_updated_date)setPreview(response.data);
   else throw Error(response.data?.error || 'Link could not be checked. Preview again before retrying.');
  }catch(e){if(mounted.current){setPreview(null);setMessage(e.response?.data?.error || e.message || 'Preview again before retrying.');}}
  finally{if(mounted.current){pending.current=false;setBusy(false);}}
 }
 return <div className="mt-2 space-y-2"><button type="button" className="min-h-11 border rounded px-3" disabled={busy} onClick={()=>act()}>{busy?'Checking…':'Preview jurisdiction link'}</button>{preview&&<div className="rounded border bg-blue-50 p-2"><p>Link {preview.document_title} to {preview.jurisdiction_name}, {preview.state}?</p><p>Confirm you reviewed the original and its source for this jurisdiction. This adds a pinned document and protects the jurisdiction’s document list from automatic replacement.</p><button type="button" className="min-h-11 border rounded px-3" disabled={busy} onClick={()=>act(true)}>I reviewed it — link original</button><button type="button" className="min-h-11 px-3" disabled={busy} onClick={()=>setPreview(null)}>Cancel</button></div>}{message&&<p role="status">{message}</p>}</div>;
}
