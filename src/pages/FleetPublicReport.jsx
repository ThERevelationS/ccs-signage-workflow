import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Send, Wrench, X } from "lucide-react";

const newToken = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const EMPTY = { equipment_id:"", title:"", description:"", priority:"high", reporter_name:"", reporter_contact:"", company_website:"" };
const MAX_PHOTOS = 3;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 1_200_000;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.onerror = () => reject(new Error("A selected photo could not be read."));
  reader.readAsDataURL(blob);
});
const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("A selected photo could not be decoded."));
  image.src = url;
});
const canvasJpeg = (image, maxDimension, quality) => new Promise((resolve, reject) => {
  const naturalWidth = Number(image.naturalWidth || image.width || 0);
  const naturalHeight = Number(image.naturalHeight || image.height || 0);
  if (!naturalWidth || !naturalHeight) return reject(new Error("A selected photo has invalid dimensions."));
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return reject(new Error("This browser cannot prepare the selected photo."));
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("A selected photo could not be compressed.")), "image/jpeg", quality);
});
async function preparePublicPhoto(file, index) {
  if (!ACCEPTED_PHOTO_TYPES.has(file?.type)) throw new Error(`${file?.name || "Photo"} must be JPG, PNG, or WebP.`);
  if (!file?.size || file.size > MAX_SOURCE_BYTES) throw new Error(`${file?.name || "Photo"} must be 10 MB or smaller.`);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const dimensions = [1600, 1400, 1200, 1000, 800];
    const qualities = [0.82, 0.72, 0.62];
    for (const dimension of dimensions) {
      for (const quality of qualities) {
        const blob = await canvasJpeg(image, dimension, quality);
        if (blob.size <= MAX_UPLOAD_BYTES) {
          return { name:`fleet-issue-${index + 1}.jpg`, type:"image/jpeg", size:blob.size, data:await blobToBase64(blob) };
        }
      }
    }
    throw new Error(`${file.name} could not be reduced enough for secure upload. Try a smaller photo.`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function FleetPublicReport() {
  const [equipment,setEquipment]=useState([]);
  const [disabled,setDisabled]=useState(false);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(EMPTY);
  const [token,setToken]=useState(newToken);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [submitted,setSubmitted]=useState(null);
  const [photos,setPhotos]=useState([]);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        const {data}=await base44.functions.invoke("fleetPublicIssueReport",{action:"list"});
        if(!mounted)return;
        setDisabled(!!data?.disabled);
        const safeEquipment=data?.equipment||[];
        setEquipment(safeEquipment);
        const requestedEquipment=new URLSearchParams(window.location.search).get("equipment")||"";
        if(requestedEquipment&&safeEquipment.some(item=>item.id===requestedEquipment))setForm(prev=>({...prev,equipment_id:requestedEquipment}));
      }catch(e){if(mounted)setError(e?.message||"Unable to load Fleet equipment.");}
      finally{if(mounted)setLoading(false);}
    })();
    return()=>{mounted=false;};
  },[]);

  const set=(key,value)=>setForm(prev=>({...prev,[key]:value}));
  const addPhotos=(event)=>{
    const selected=Array.from(event.target.files||[]);
    event.target.value="";
    if(!selected.length)return;
    if(photos.length+selected.length>MAX_PHOTOS){setError(`Attach no more than ${MAX_PHOTOS} photos.`);return;}
    const invalid=selected.find(file=>!ACCEPTED_PHOTO_TYPES.has(file.type)||!file.size||file.size>MAX_SOURCE_BYTES);
    if(invalid){setError(`${invalid.name||"Photo"} must be JPG, PNG, or WebP and 10 MB or smaller.`);return;}
    setPhotos(prev=>[...prev,...selected.map(file=>({file,preview:URL.createObjectURL(file)}))]);
    setError("");
  };
  const removePhoto=(index)=>setPhotos(prev=>{
    const target=prev[index];
    if(target?.preview)URL.revokeObjectURL(target.preview);
    return prev.filter((_,i)=>i!==index);
  });
  const clearPhotos=()=>setPhotos(prev=>{prev.forEach(photo=>{if(photo?.preview)URL.revokeObjectURL(photo.preview);});return[];});
  const submit=async(e)=>{
    e.preventDefault();
    if(!form.equipment_id||!form.title.trim()){setError("Select equipment and enter an issue title.");return;}
    setSubmitting(true);setError("");
    try{
      const preparedPhotos=[];
      for(let i=0;i<photos.length;i++)preparedPhotos.push(await preparePublicPhoto(photos[i].file,i));
      const {data}=await base44.functions.invoke("fleetPublicIssueReport",{action:"submit",submission_token:token,...form,title:form.title.trim(),description:form.description.trim(),reporter_name:form.reporter_name.trim(),reporter_contact:form.reporter_contact.trim(),photos:preparedPhotos});
      if(data?.error)throw new Error(data.error);
      setSubmitted({work_order_number:data?.work_order_number||"",photo_warning:data?.photo_warning||""});
    }catch(e2){setError(e2?.message||"Issue report could not be submitted.");}
    finally{setSubmitting(false);}
  };
  const reset=()=>{clearPhotos();setSubmitted(null);setForm(EMPTY);setToken(newToken());setError("");};

  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"><div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center"><Wrench className="w-5 h-5"/></div><div><h1 className="font-bold text-lg">Cincinnati Custom Signs</h1><p className="text-xs text-slate-500 dark:text-slate-400">Fleet Maintenance Issue Report</p></div></div></header>
    <main className="max-w-2xl mx-auto px-4 py-8">
      {loading?<div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-slate-400"/></div>:disabled?<div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-6"><div className="flex gap-3"><AlertTriangle className="w-6 h-6 text-amber-600 shrink-0"/><div><h2 className="font-bold text-amber-900 dark:text-amber-100">Public reporting is unavailable</h2><p className="text-sm text-amber-800 dark:text-amber-200 mt-2">Public Fleet issue reporting is currently unavailable. Please contact CCS directly or try again after an administrator restores the public-reporting service.</p></div></div></div>:submitted?<div className="rounded-2xl border border-emerald-200 bg-white dark:bg-slate-900 dark:border-emerald-900 p-8 text-center shadow-sm"><div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-emerald-600"/></div><h2 className="text-xl font-bold mt-4">Report Submitted</h2><p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Your Fleet maintenance issue has been logged.</p>{submitted.work_order_number&&<p className="font-mono text-sm mt-3">{submitted.work_order_number}</p>}{submitted.photo_warning&&<div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm text-amber-800 dark:text-amber-200">{submitted.photo_warning}</div>}<button onClick={reset} className="mt-6 px-4 py-2 rounded-lg bg-indigo-600 text-white">Submit Another Report</button></div>:<div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-5 sm:p-6 shadow-sm"><div className="flex gap-3"><AlertTriangle className="w-5 h-5 text-indigo-600 mt-1 shrink-0"/><div><h2 className="text-xl font-bold">Report a Maintenance Issue</h2><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">No account is required. Only the minimum Fleet equipment information needed for this report is exposed.</p></div></div>{error&&<div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}<form onSubmit={submit} className="space-y-4 mt-6">
        <Field label="Equipment *"><select required value={form.equipment_id} onChange={e=>set("equipment_id",e.target.value)} className="field"><option value="">Select equipment</option>{equipment.map(eq=><option key={eq.id} value={eq.id}>{eq.name}{eq.type?` (${String(eq.type).replaceAll("_"," ")})`:""}</option>)}</select></Field>
        <Field label="Issue Title *"><input required maxLength={120} value={form.title} onChange={e=>set("title",e.target.value)} className="field" placeholder="Brief summary of the issue"/></Field>
        <Field label="Description"><textarea maxLength={2000} rows={5} value={form.description} onChange={e=>set("description",e.target.value)} className="field" placeholder="Describe the problem and anything the Fleet team should know."/></Field>
        <div><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Problem Photos (optional)</span><span className="text-xs text-slate-400">{photos.length}/{MAX_PHOTOS}</span></div><label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-4 text-sm font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20"><ImagePlus className="w-4 h-4"/>Add Photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={addPhotos} disabled={photos.length>=MAX_PHOTOS}/></label><p className="text-xs text-slate-400 mt-1.5">Up to 3 JPG, PNG, or WebP images. Photos are reduced before secure upload and attached only to this Fleet work order.</p>{photos.length>0&&<div className="grid grid-cols-3 gap-2 mt-3">{photos.map((photo,index)=><div key={`${photo.file.name}-${photo.file.size}-${index}`} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800"><img src={photo.preview} alt={`Selected problem photo ${index+1}`} className="w-full h-full object-cover"/><button type="button" onClick={()=>removePhoto(index)} className="absolute top-1 right-1 p-1.5 rounded-full bg-black/70 text-white" aria-label={`Remove photo ${index+1}`}><X className="w-3.5 h-3.5"/></button></div>)}</div>}</div>
        <Field label="Priority"><select value={form.priority} onChange={e=>set("priority",e.target.value)} className="field"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
        <div className="grid sm:grid-cols-2 gap-4"><Field label="Your Name (optional)"><input maxLength={120} value={form.reporter_name} onChange={e=>set("reporter_name",e.target.value)} className="field"/></Field><Field label="Contact (optional)"><input maxLength={200} value={form.reporter_contact} onChange={e=>set("reporter_contact",e.target.value)} className="field" placeholder="Phone or email"/></Field></div>
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.company_website} onChange={e=>set("company_website",e.target.value)} className="absolute left-[-10000px] w-px h-px overflow-hidden" />
        <button type="submit" disabled={submitting||equipment.length===0} className="w-full px-4 py-3 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">{submitting?<Loader2 className="w-4 h-4 animate-spin"/>:<Send className="w-4 h-4"/>}{submitting?"Submitting...":"Submit Report"}</button>
      </form></div>}
      <p className="text-center text-xs text-slate-400 mt-5">This form can only create a Fleet maintenance issue report.</p>
    </main>
    <style>{`.field{width:100%;border:1px solid rgb(203 213 225);border-radius:.5rem;padding:.65rem .75rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}`}</style>
  </div>;
}
function Field({label,children}){return <label className="block"><span className="block text-sm font-medium mb-1.5">{label}</span>{children}</label>;}