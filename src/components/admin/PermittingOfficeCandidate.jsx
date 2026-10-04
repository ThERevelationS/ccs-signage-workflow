import {useEffect,useRef,useState} from "react";
import {base44} from "@/api/base44Client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";

const storageKey=id=>"ccs-office-candidate:"+id;
const readPending=id=>{try{const p=JSON.parse(sessionStorage.getItem(storageKey(id)) || "null");return p?.candidate?.source_document_id===id?p:null;}catch{return null;}};
async function invoke(body){const r=await base44.functions.invoke("permittingOfficeCandidate",body);return r?.data || r;}
export default function PermittingOfficeCandidate({source,disabled,onBusy}){
 const [form,setForm]=useState({office_name:source.authority_review?.publisher_name || source.issuing_office || "",
  physical_page:source.authority_review?.proofs?.find(p=>p.role==="publisher")?.physical_page || 1,
  publisher_quote:source.authority_review?.proofs?.find(p=>p.role==="publisher")?.excerpt || ""});
 const [preview,setPreview]=useState(null),[pending,setPending]=useState(()=>readPending(source.id));
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null);
 const mounted=useRef(true),inFlight=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const locked=Boolean(disabled || busy || pending);
 function change(field,value){setForm(p=>({...p,[field]:value}));setPreview(null);setResult(null);}
 function clearPending(){sessionStorage.removeItem(storageKey(source.id));setPending(null);setPreview(null);}
 async function act(action){
  if(disabled || inFlight.current || (pending && action!=="check"))return;
  inFlight.current=true;setBusy(true);onBusy(true);setError("");
  try{
   let body;
   if(action==="preview")body={action,candidate:{...form,physical_page:Number(form.physical_page),source_document_id:source.id}};
   else if(action==="check")body={action:"get_request",office_id:pending.office_id,registration_key:pending.registration_key};
   else{
    if(!preview || preview.existing_office)return;
    body={action:"register",candidate:preview.input,expected_catalog_updated_date:preview.expected_catalog_updated_date,
     expected_evidence_digest:preview.expected_evidence_digest,office_id:preview.proposal.id,
     registration_key:preview.proposal.office_candidate_registration.registration_key};
    // Save the exact selection before submission. An uncertain outcome cannot start a new decision.
    sessionStorage.setItem(storageKey(source.id),JSON.stringify(body));setPending(body);
   }
   const data=await invoke(body);
   if(!mounted.current)return;
   if(action==="preview"){
    if(!data.success)throw Error(data.error || "Candidate preview failed.");
    setPreview({...data,input:body.candidate});setResult(null);return;
   }
   setResult(data);
   if(data.success && ["registered","existing_office"].includes(data.status)){clearPending();return;}
   setError(data.error || "Candidate is not confirmed. Check the saved registration before another submission.");
  }catch(e){
   if(mounted.current){
    setError(e?.response?.data?.error || e.message || "Candidate registration could not be confirmed.");
    // This handler returns conflicts only before a write, or after a zero-match conditional update.
    if(action==="register" && e?.response?.status===409)clearPending();
   }
  }finally{inFlight.current=false;if(mounted.current){setBusy(false);onBusy(false);}}
 }
 return <details className="border rounded p-3 text-sm space-y-3">
  <summary className="cursor-pointer font-medium">Register a missing publisher office</summary>
  <p className="mt-3 text-gray-600">Use the jurisdiction-specific office name exactly as printed on a retained PDF page. Registration preserves the quote and creates an office candidate awaiting identity review. Contacts, responsibilities and covered areas need separate review.</p>
  <fieldset disabled={locked} className="space-y-2">
   <div><Label htmlFor={"candidate-name-"+source.id}>Printed office name</Label><Input id={"candidate-name-"+source.id} value={form.office_name} onChange={e=>change("office_name",e.target.value)}/></div>
   <div><Label htmlFor={"candidate-page-"+source.id}>Physical PDF page</Label><Input id={"candidate-page-"+source.id} type="number" min="1" value={form.physical_page} onChange={e=>change("physical_page",e.target.value)}/></div>
   <div><Label htmlFor={"candidate-quote-"+source.id}>Exact publisher quote</Label><Textarea id={"candidate-quote-"+source.id} rows={3} value={form.publisher_quote} onChange={e=>change("publisher_quote",e.target.value)}/></div>
   <Button size="sm" variant="outline" onClick={()=>act("preview")}>Preview office candidate</Button>
  </fieldset>
  {preview && !pending && <div className="border rounded p-2 space-y-2">
   {preview.existing_office?<p>An existing office matches this printed name. Review its identity before linking it: <span className="break-all">{preview.existing_office.government_office_id || preview.existing_office.id}</span></p>:
    <><p>{preview.proposal.name} · needs verification</p><blockquote className="whitespace-pre-wrap text-gray-600">{preview.proposal.office_candidate_registration.snapshot.proof.excerpt}</blockquote>
     <Button size="sm" disabled={Boolean(disabled || busy)} onClick={()=>act("register")}>Register candidate for review</Button></>}
  </div>}
  {pending && <div className="bg-amber-50 p-2 space-y-2"><p>A saved registration must be checked before another decision.</p>
   <Button size="sm" variant="outline" disabled={Boolean(disabled || busy)} onClick={()=>act("check")}>Check saved office candidate</Button></div>}
  {busy && <p role="status">Checking retained evidence and office registration…</p>}
  {error && <p role="alert" className="text-red-700">{error}</p>}
  {result?.office && <p>Office candidate: {result.office.name}. Review its identity in Permitting Settings → Office Catalog before using authority relationships. No AI credits used.</p>}
 </details>;
}
