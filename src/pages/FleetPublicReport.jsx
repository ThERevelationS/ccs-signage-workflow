import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CheckCircle2, Loader2, Send, Wrench } from "lucide-react";

const newToken = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const EMPTY = { equipment_id:"", title:"", description:"", priority:"high", reporter_name:"", reporter_contact:"", company_website:"" };

export default function FleetPublicReport() {
  const [equipment,setEquipment]=useState([]);
  const [disabled,setDisabled]=useState(false);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(EMPTY);
  const [token,setToken]=useState(newToken);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [submitted,setSubmitted]=useState(null);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        const {data}=await base44.functions.invoke("fleetPublicIssueReport",{action:"list"});
        if(!mounted)return;
        setDisabled(!!data?.disabled);
        setEquipment(data?.equipment||[]);
      }catch(e){if(mounted)setError(e?.message||"Unable to load Fleet equipment.");}
      finally{if(mounted)setLoading(false);}
    })();
    return()=>{mounted=false;};
  },[]);

  const set=(key,value)=>setForm(prev=>({...prev,[key]:value}));
  const submit=async(e)=>{
    e.preventDefault();
    if(!form.equipment_id||!form.title.trim()){setError("Select equipment and enter an issue title.");return;}
    setSubmitting(true);setError("");
    try{
      const {data}=await base44.functions.invoke("fleetPublicIssueReport",{action:"submit",submission_token:token,...form,title:form.title.trim(),description:form.description.trim(),reporter_name:form.reporter_name.trim(),reporter_contact:form.reporter_contact.trim()});
      if(data?.error)throw new Error(data.error);
      setSubmitted({work_order_number:data?.work_order_number||""});
    }catch(e2){setError(e2?.message||"Issue report could not be submitted.");}
    finally{setSubmitting(false);}
  };
  const reset=()=>{setSubmitted(null);setForm(EMPTY);setToken(newToken());setError("");};

  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"><div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center"><Wrench className="w-5 h-5"/></div><div><h1 className="font-bold text-lg">Cincinnati Custom Signs</h1><p className="text-xs text-slate-500 dark:text-slate-400">Fleet Maintenance Issue Report</p></div></div></header>
    <main className="max-w-2xl mx-auto px-4 py-8">
      {loading?<div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-slate-400"/></div>:disabled?<div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-6"><div className="flex gap-3"><AlertTriangle className="w-6 h-6 text-amber-600 shrink-0"/><div><h2 className="font-bold text-amber-900 dark:text-amber-100">Public reporting is not enabled yet</h2><p className="text-sm text-amber-800 dark:text-amber-200 mt-2">Public Fleet issue reporting is currently unavailable. Please contact CCS directly or try again after an administrator restores the public-reporting service.</p></div></div></div>:submitted?<div className="rounded-2xl border border-emerald-200 bg-white dark:bg-slate-900 dark:border-emerald-900 p-8 text-center shadow-sm"><div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-emerald-600"/></div><h2 className="text-xl font-bold mt-4">Report Submitted</h2><p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Your Fleet maintenance issue has been logged.</p>{submitted.work_order_number&&<p className="font-mono text-sm mt-3">{submitted.work_order_number}</p>}<button onClick={reset} className="mt-6 px-4 py-2 rounded-lg bg-indigo-600 text-white">Submit Another Report</button></div>:<div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-5 sm:p-6 shadow-sm"><div className="flex gap-3"><AlertTriangle className="w-5 h-5 text-indigo-600 mt-1 shrink-0"/><div><h2 className="text-xl font-bold">Report a Maintenance Issue</h2><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">No account is required. Only the minimum Fleet equipment information needed for this report is exposed.</p></div></div>{error&&<div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}<form onSubmit={submit} className="space-y-4 mt-6">
        <Field label="Equipment *"><select required value={form.equipment_id} onChange={e=>set("equipment_id",e.target.value)} className="field"><option value="">Select equipment</option>{equipment.map(eq=><option key={eq.id} value={eq.id}>{eq.name}{eq.type?` (${String(eq.type).replaceAll("_"," ")})`:""}</option>)}</select></Field>
        <Field label="Issue Title *"><input required maxLength={120} value={form.title} onChange={e=>set("title",e.target.value)} className="field" placeholder="Brief summary of the issue"/></Field>
        <Field label="Description"><textarea maxLength={2000} rows="5" value={form.description} onChange={e=>set("description",e.target.value)} className="field" placeholder="Describe the problem and anything the Fleet team should know."/></Field>
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