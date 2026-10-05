import {useEffect, useRef, useState} from "react";
import {base44} from "@/api/base44Client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";

const message=e=>e?.response?.data?.error || e?.message || String(e);
const key=name=>"ccs-html-evidence:"+name;
function pendingFor(name){try{const p=JSON.parse(sessionStorage.getItem(key(name)) || "null");return p?.jurisdiction_name===name && p.body?.request_id?p:null;}catch{return null;}}
async function invoke(body){const r=await base44.functions.invoke("permittingHtmlEvidence",body);const d=r?.data || r;if(!d.success)throw Error(d.error || "HTML evidence request failed.");return d;}

export default function PermittingHtmlEvidencePanel({jurisdictionName,disabled,onBusy}){
 const saved=pendingFor(jurisdictionName);
 const [profiles,setProfiles]=useState([]),[profileId,setProfileId]=useState(saved?.body.jurisdiction_id || "");
 const [url,setUrl]=useState(saved?.body.official_url || ""),[title,setTitle]=useState(saved?.body.title || ""),[confirmed,setConfirmed]=useState(false);
 const [preview,setPreview]=useState(null),[pending,setPending]=useState(saved),[result,setResult]=useState(null);
 const [items,setItems]=useState([]),[cursor,setCursor]=useState(null),[evidenceId,setEvidenceId]=useState("");
 const [view,setView]=useState(null),[quote,setQuote]=useState(""),[quoteBlock,setQuoteBlock]=useState(1),[citation,setCitation]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const mounted=useRef(true),flight=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const locked=Boolean(disabled || busy),frozen=Boolean(pending);
 const profile=profiles.find(p=>p.id===profileId);
 function clearPending(){try{sessionStorage.removeItem(key(jurisdictionName));}catch{/* Durable server receipt remains. */}setPending(null);setPreview(null);}
 function chooseProfile(id){
  setProfileId(id);setUrl(profiles.find(p=>p.id===id)?.permitting_url || profiles.find(p=>p.id===id)?.website_url || "");
  setTitle("");setConfirmed(false);setPreview(null);setItems([]);setCursor(null);setEvidenceId("");setView(null);setCitation(null);setQuote("");
 }
 async function act(action){
  if(locked || flight.current)return;
  flight.current=true;setBusy(true);onBusy(true);setError("");
  try{
   if(action==="context"){
    const d=await invoke({action:"context",jurisdiction_name:jurisdictionName.trim()});
    if(!mounted.current)return;
    setProfiles(d.profiles);
    if(d.has_more)setError("More than 20 canonical matches exist. Resolve the profile ambiguity before capture.");
    if(!profileId && d.profiles.length===1){const p=d.profiles[0];setProfileId(p.id);setUrl(p.permitting_url || p.website_url || "");}
    return;
   }
   if(action==="list" || action==="more"){
    const d=await invoke({action:"list",jurisdiction_id:profileId,...(action==="more"?{cursor}:{})});
    if(!mounted.current)return;
    setItems(previous=>action==="more"?[...new Map([...previous,...d.items].map(p=>[p.id,p])).values()]:d.items);setCursor(d.next_cursor);return;
   }
   if(action==="preview"){
    const d=await invoke({action:"preview",jurisdiction_id:profileId,official_url:url});
    if(mounted.current){setPreview(d);setResult(null);}return;
   }
   if(action==="capture" || action==="resume"){
    let request=pending;
    if(action==="capture"){
     if(!preview || !confirmed || !title.trim())return;
     request={jurisdiction_name:jurisdictionName,body:{action:"capture",jurisdiction_id:profileId,official_url:url,title:title.trim(),
      request_id:crypto.randomUUID(),expected_updated_date:preview.expected_updated_date,expected_text_sha256:preview.text_sha256,official_source_confirmed:true}};
     // Persist the exact request before a non-idempotent save. A storage failure stops submission.
     sessionStorage.setItem(key(jurisdictionName),JSON.stringify(request));setPending(request);
    }
    if(!request)throw Error("Check the saved request before another capture.");
    const r=await base44.functions.invoke("permittingHtmlEvidence",request.body),d=r?.data || r;
    if(!mounted.current)return;
    setResult(d);
    if(d.success && d.status==="retained"){clearPending();setEvidenceId(d.evidence.id);setConfirmed(false);}
    else { if(d.retry_safe===true)clearPending(); setError(d.error || "Capture outcome is uncertain. Check or resume this same saved request."); }
    return;
   }
   if(action==="check"){
    const d=await invoke({action:"get_request",jurisdiction_id:pending.body.jurisdiction_id,request_id:pending.body.request_id});
    if(!mounted.current)return;
    setResult({...d,status:d.committed?"retained":"save_uncertain"});
    if(d.committed){clearPending();setEvidenceId(d.evidence.id);}return;
   }
   if(action==="read" || action==="next"){
    const d=await invoke({action:"read",html_evidence_id:evidenceId,start_block:action==="next"?view.next_block:1,block_count:5});
    if(mounted.current){setView(d);setQuoteBlock(d.blocks[0]?.block || 1);setQuote("");setCitation(null);}return;
   }
   if(action==="cite"){
    const d=await invoke({action:"cite",html_evidence_id:evidenceId,block:Number(quoteBlock),excerpt:quote});
    if(mounted.current)setCitation(d.citation);return;
   }
   if(action==="download"){
    const d=await invoke({action:"raw",html_evidence_id:evidenceId});
    if(!mounted.current)return;
    const bytes=Uint8Array.from(atob(d.raw_html_base64),c=>c.charCodeAt(0));
    const objectUrl=URL.createObjectURL(new Blob([bytes],{type:"text/plain"})),a=document.createElement("a");
    a.href=objectUrl;a.download="official-html-"+d.evidence.id+".html.txt";a.click();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
   }
  }catch(e){if(mounted.current)setError(message(e));}
  finally{flight.current=false;if(mounted.current){setBusy(false);onBusy(false);}}
 }
 return <details className="border rounded p-3 text-sm space-y-3">
  <summary className="cursor-pointer font-medium">Retain official website evidence</summary>
  <p className="mt-3 text-gray-600">Preserve the original HTML response and cite its static text. Captures remain unreviewed. They do not establish office responsibility, covered areas or adopted sign rules. Manual capture uses no AI research calls.</p>
  <Button size="sm" variant="outline" disabled={locked} onClick={()=>act("context")}>Load canonical jurisdiction options</Button>
  <fieldset disabled={locked || frozen} className="space-y-2">
   <div><Label htmlFor="html-profile">Canonical jurisdiction</Label><select id="html-profile" className="w-full border rounded p-2" value={profileId} onChange={e=>chooseProfile(e.target.value)}>
    <option value="">Select a canonical profile</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}, {p.state} — {p.type}</option>)}</select></div>
   <div><Label htmlFor="html-url">Official page URL</Label><Input id="html-url" value={url} onChange={e=>{setUrl(e.target.value);setPreview(null);}} /></div>
   <div><Label htmlFor="html-title">Evidence title</Label><Input id="html-title" maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} /></div>
   <label className="flex gap-2 items-start"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />I checked that this is an official page for the selected profile.</label>
   <div className="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" disabled={locked || !profile || !url} onClick={()=>act("preview")}>Preview website text</Button>
    <Button size="sm" disabled={locked || !preview || !confirmed || !title.trim()} onClick={()=>act("capture")}>Retain this response</Button>
   </div>
  </fieldset>
  {preview && <details><summary>Website text preview — {preview.total_blocks} blocks</summary><pre className="whitespace-pre-wrap max-h-64 overflow-auto text-xs">{preview.blocks.map(b=>"Block "+b.block+"\n"+b.text).join("\n\n")}</pre></details>}
  {pending && <div className="space-y-2 text-amber-800"><p>A saved capture needs confirmation. Keep this exact request until its outcome is reconciled.</p><div className="flex flex-wrap gap-2">
   <Button size="sm" variant="outline" disabled={locked} onClick={()=>act("check")}>Check saved capture</Button>
   <Button size="sm" variant="outline" disabled={locked} onClick={()=>act("resume")}>Resume saved capture</Button></div><p className="break-all text-xs">{pending.body.request_id}</p></div>}
  {result && <p role="status">Capture status: {result.status}. {result.evidence && "Evidence retained for review: "+result.evidence.id}</p>}
  <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={locked || !profileId} onClick={()=>act("list")}>Load retained website evidence</Button>
   {cursor && <Button size="sm" variant="outline" disabled={locked} onClick={()=>act("more")}>Load more evidence</Button>}</div>
  <div><Label htmlFor="html-evidence">Retained response</Label><select id="html-evidence" className="w-full border rounded p-2" disabled={locked} value={evidenceId} onChange={e=>{setEvidenceId(e.target.value);setView(null);setCitation(null);setQuote("");}}>
   <option value="">Select retained evidence</option>{result?.evidence && !items.some(i=>i.id===result.evidence.id) && <option value={result.evidence.id}>{result.evidence.title}</option>}
   {items.map(i=><option key={i.id} value={i.id}>{i.title} — {i.retrieved_at}</option>)}</select></div>
  <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={locked || !evidenceId} onClick={()=>act("read")}>Read retained text</Button>
   <Button size="sm" variant="outline" disabled={locked || !evidenceId} onClick={()=>act("download")}>Download original response as text</Button></div>
  {view && <div className="space-y-2">
   <p className="break-all text-xs">Original response: {view.evidence.file_bytes} bytes · SHA-256 {view.evidence.file_hash_sha256}</p>
   {view.blocks.map(b=><div key={b.block}><strong>HTML text block {b.block}</strong><pre className="whitespace-pre-wrap text-xs max-h-64 overflow-auto">{b.text}</pre></div>)}
   {view.next_block && <Button size="sm" variant="outline" disabled={locked} onClick={()=>act("next")}>Next text blocks</Button>}
   <fieldset disabled={locked} className="space-y-2"><div><Label htmlFor="html-quote-block">Cited text block</Label><select id="html-quote-block" className="w-full border rounded p-2" value={quoteBlock} onChange={e=>{setQuoteBlock(Number(e.target.value));setCitation(null);}}>
    {view.blocks.map(b=><option key={b.block} value={b.block}>HTML text block {b.block}</option>)}</select></div>
    <div><Label htmlFor="html-quote">Exact quote</Label><Textarea id="html-quote" maxLength={1000} value={quote} onChange={e=>{setQuote(e.target.value);setCitation(null);}} /></div>
    <Button size="sm" variant="outline" disabled={locked || quote.trim().length<10} onClick={()=>act("cite")}>Validate literal citation</Button></fieldset>
   {citation && <pre className="whitespace-pre-wrap break-all max-h-64 overflow-auto text-xs">{JSON.stringify(citation,null,2)}</pre>}
   <p className="text-xs text-gray-600">{view.limitations.join(" ")}</p>
  </div>}
  {busy && <p role="status">Working…</p>}{error && <p className="text-red-700" role="alert">{error}</p>}
 </details>;
}
