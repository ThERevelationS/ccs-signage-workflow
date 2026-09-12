import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Edit3,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

const TYPE_OPTIONS = ["pre_trip","post_trip","daily","weekly","monthly","safety","custom"];
const RESPONSE_OPTIONS = ["pass_fail","checkbox","text","number"];
const SEVERITY_OPTIONS = ["low","medium","high","critical"];
/** @type {Array<{value:string,label:string,icon:any}>} */
const INSPECTION_RESULTS = [
  { value: "pass", label: "Pass", icon: CheckCircle2 },
  { value: "fail", label: "Fail", icon: AlertTriangle },
  { value: "na", label: "N/A", icon: X },
];
const pretty = value => String(value || "—").replaceAll("_", " ");
const emptyTemplate = () => ({
  name: "",
  description: "",
  inspection_type: "pre_trip",
  applicable_equipment_types: [],
  active: true,
  items: [
    { key: crypto.randomUUID(), label: "Visible damage / loose components", instructions: "Walk around the asset and note anything damaged, loose, missing, or unsafe.", response_type: "pass_fail", required: true, severity: "high", fail_creates_work_order: true },
    { key: crypto.randomUUID(), label: "Leaks / fluid concerns", instructions: "Check beneath and around the asset for visible leaks or fluid concerns.", response_type: "pass_fail", required: true, severity: "high", fail_creates_work_order: true },
    { key: crypto.randomUUID(), label: "Lights / warning indicators", instructions: "Verify required lights/indicators and note dashboard or equipment warnings.", response_type: "pass_fail", required: true, severity: "medium", fail_creates_work_order: true },
    { key: crypto.randomUUID(), label: "Safety equipment / general readiness", instructions: "Verify the asset appears ready and safe for its intended use.", response_type: "pass_fail", required: true, severity: "critical", fail_creates_work_order: true },
  ],
});

export default function FleetInspections() {
  const initialEquipmentId = useMemo(() => new URLSearchParams(window.location.search).get("equipment") || "", []);
  const [templates, setTemplates] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startDialog, setStartDialog] = useState(null);
  const [templateDialog, setTemplateDialog] = useState(null);
  const [runner, setRunner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [templateRows, inspectionRows, equipmentRows, me] = await Promise.all([
        listAllFleetRows(base44.entities.FleetInspectionTemplate, "name", { label: "Fleet inspection templates" }).catch(() => []),
        listAllFleetRows(base44.entities.FleetInspection, "-created_date", { label: "Fleet inspections" }).catch(() => []),
        listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment" }),
        base44.auth.me().catch(() => null),
      ]);
      setTemplates(templateRows || []);
      setInspections(inspectionRows || []);
      setEquipment(equipmentRows || []);
      setUser(me || null);
    } catch (err) {
      setError(err?.message || "Unable to load Fleet inspections.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!loading && initialEquipmentId && equipment.some(item => item.id === initialEquipmentId && item.status !== "retired")) {
      setStartDialog(current => current || { equipment_id: initialEquipmentId, template_id: "", creation_key: crypto.randomUUID() });
    }
  }, [loading, initialEquipmentId, equipment]);

  const isAdmin = user?.role === "admin";
  const activeEquipment = useMemo(() => equipment.filter(item => item.status !== "retired"), [equipment]);
  const names = useMemo(() => Object.fromEntries(equipment.map(item => [item.id, item.name])), [equipment]);
  const metrics = useMemo(() => ({
    total: inspections.length,
    passed: inspections.filter(item => item.status === "passed").length,
    failed: inspections.filter(item => item.status === "failed").length,
    drafts: inspections.filter(item => !item.completed_at && ["draft","needs_attention"].includes(item.status)).length,
    generated: inspections.reduce((sum, item) => sum + (item.generated_work_order_ids?.length || 0), 0),
  }), [inspections]);

  const compatibleTemplates = useMemo(() => {
    const eq = equipment.find(item => item.id === startDialog?.equipment_id);
    return templates.filter(template => template.active !== false && (!eq || !template.applicable_equipment_types?.length || template.applicable_equipment_types.includes(eq.type)));
  }, [templates, equipment, startDialog?.equipment_id]);

  const startInspection = async () => {
    if (!startDialog?.equipment_id || !startDialog?.template_id) return setError("Choose equipment and an inspection template.");
    setError("");
    try {
      const { data } = await base44.functions.invoke("fleetInspectionAction", {
        action: "inspection_start",
        creation_key: startDialog.creation_key,
        equipment_id: startDialog.equipment_id,
        template_id: startDialog.template_id,
      });
      if (data?.error) throw new Error(data.error);
      const template = data.template || templates.find(item => item.id === startDialog.template_id);
      setRunner({ inspection: data.inspection, template });
      setStartDialog(null);
      await load();
    } catch (err) { setError(err?.message || "Unable to start Fleet inspection."); }
  };

  const resumeInspection = inspection => {
    const template = templates.find(item => item.id === inspection.template_id);
    if (!template) return setError("The template for this inspection is missing, so it cannot be resumed safely.");
    setRunner({ inspection, template });
  };

  const saveTemplate = async ({ template, existing, creationKey }) => {
    setError("");
    try {
      const body = existing
        ? { action: "template_update", id: existing.id, expected_updated_date: existing.updated_date || "", template }
        : { action: "template_create", creation_key: creationKey, template };
      const { data } = await base44.functions.invoke("fleetInspectionAction", body);
      if (data?.error) throw new Error(data.error);
      setTemplateDialog(null);
      await load();
    } catch (err) { setError(err?.message || "Unable to save inspection template."); }
  };

  const openNewInspection = equipmentId => setStartDialog({ equipment_id: equipmentId || "", template_id: "", creation_key: crypto.randomUUID() });

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950">
    <FleetModuleNav />
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div><div className="flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-indigo-600"/><h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100">Fleet Inspections</h1></div><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Fast equipment checklists with evidence, meter readings, and guarded Fleet work-order follow-up.</p></div>
        <div className="flex flex-col sm:flex-row gap-2"><button onClick={() => openNewInspection("")} className="min-h-11 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2"><ClipboardCheck className="w-4 h-4"/>Start Inspection</button>{isAdmin && <button onClick={() => setTemplateDialog({ existing: null, creationKey: crypto.randomUUID() })} className="min-h-11 px-4 py-2 rounded-xl border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700 font-semibold inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4"/>New Template</button>}</div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20"><div className="flex items-start gap-3"><ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-300 shrink-0 mt-0.5"/><div><div className="font-semibold text-indigo-950 dark:text-indigo-100">Inspection failures stay inside Fleet.</div><div className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">Items configured for automatic follow-up create <b>FleetMaintenanceWorkOrder</b> records only. Completion is retry-safe; the same failed item cannot intentionally create a second follow-up on retry.</div></div></div></div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><Metric label="Inspections" value={metrics.total}/><Metric label="Passed" value={metrics.passed} good/><Metric label="Failed" value={metrics.failed} attention={metrics.failed>0}/><Metric label="Draft / Resume" value={metrics.drafts} attention={metrics.drafts>0}/><Metric label="Generated WOs" value={metrics.generated}/></div>

      <div className="grid xl:grid-cols-[.9fr_1.5fr] gap-5">
        <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900 dark:text-slate-100">Templates</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Reusable Fleet-only checklists.</p></div><span className="text-xs font-bold text-gray-400">{templates.filter(item => item.active !== false).length} active</span></div>
          <div className="p-3 space-y-2 max-h-[620px] overflow-y-auto">{templates.map(template => <div key={template.id} className={`rounded-xl border p-3 ${template.active === false ? "border-gray-200 opacity-60 dark:border-slate-700" : "border-gray-200 dark:border-slate-700"}`}><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-gray-900 dark:text-slate-100">{template.name}</div><div className="text-xs text-gray-500 mt-1 capitalize">{pretty(template.inspection_type)} · {template.items?.length || 0} items</div></div>{isAdmin && <button onClick={() => setTemplateDialog({ existing: template, creationKey: "" })} className="min-h-9 min-w-9 rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center justify-center" aria-label={`Edit ${template.name}`}><Edit3 className="w-4 h-4"/></button>}</div>{template.description && <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 line-clamp-2">{template.description}</p>}<div className="mt-2 flex flex-wrap gap-1">{(template.applicable_equipment_types || []).length ? template.applicable_equipment_types.slice(0,4).map(type => <span key={type} className="text-[10px] rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-1 capitalize">{pretty(type)}</span>) : <span className="text-[10px] rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 px-2 py-1">All equipment types</span>}</div></div>)}{!templates.length && <Empty text={isAdmin ? "No Fleet inspection templates yet. Create the first one above." : "No active Fleet inspection templates are configured yet."}/>}</div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800"><h2 className="font-bold text-gray-900 dark:text-slate-100">Inspection History</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Newest first. Drafts can be resumed.</p></div>
          {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-gray-400"/></div> : <div className="divide-y divide-gray-100 dark:divide-slate-800">{inspections.slice(0,100).map(inspection => <div key={inspection.id} className="p-4"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-gray-900 dark:text-slate-100">{inspection.template_name}</span><Status status={inspection.status}/>{inspection.failed_item_count>0 && <span className="text-xs font-semibold text-red-600 dark:text-red-300">{inspection.failed_item_count} failed</span>}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{names[inspection.equipment_id] || "Unknown equipment"} · {inspection.inspector_name || inspection.inspector_email || "Unknown inspector"}</div><div className="text-xs text-gray-400 mt-1">{inspection.completed_at ? new Date(inspection.completed_at).toLocaleString() : inspection.started_at ? `Started ${new Date(inspection.started_at).toLocaleString()}` : "—"}</div></div><div className="flex flex-wrap gap-2">{!inspection.completed_at && <button onClick={() => resumeInspection(inspection)} className="min-h-9 px-3 rounded-lg bg-indigo-600 text-white text-xs font-semibold">Resume</button>}<Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(inspection.equipment_id)}&tab=inspections`} className="min-h-9 px-3 rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center text-xs font-semibold">Equipment</Link>{inspection.generated_work_order_ids?.length>0 && <Link to={`${createPageUrl("FleetWorkOrders")}?equipment=${encodeURIComponent(inspection.equipment_id)}&status=active`} className="min-h-9 px-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300 inline-flex items-center gap-1 text-xs font-semibold"><ClipboardList className="w-3.5 h-3.5"/>{inspection.generated_work_order_ids.length} WO</Link>}</div></div></div>)}{!inspections.length && <Empty text="No Fleet inspections recorded yet."/>}</div>}
        </section>
      </div>
    </div>

    <StartInspectionDialog open={!!startDialog} state={startDialog} setState={setStartDialog} equipment={activeEquipment} templates={compatibleTemplates} onClose={() => setStartDialog(null)} onStart={startInspection}/>
    <TemplateDialog open={!!templateDialog} existing={templateDialog?.existing || null} creationKey={templateDialog?.creationKey || ""} equipmentTypes={[...new Set(activeEquipment.map(item => item.type).filter(Boolean))].sort()} onClose={() => setTemplateDialog(null)} onSave={saveTemplate}/>
    <InspectionRunner open={!!runner} inspection={runner?.inspection || null} template={runner?.template || null} equipment={equipment.find(item => item.id === runner?.inspection?.equipment_id) || null} onClose={() => setRunner(null)} onSaved={async inspection => { setRunner(current => current ? { ...current, inspection } : current); await load(); }} onCompleted={async () => { setRunner(null); await load(); }}/>
  </div>;
}

function StartInspectionDialog({open,state,setState,equipment,templates,onClose,onStart}) {
  if (!open) return null;
  const selectedEquipment = equipment.find(item => item.id === state?.equipment_id);
  return <div className="fixed inset-0 z-[100] bg-black/55 p-3 sm:p-6 flex items-center justify-center"><div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl"><div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between"><div><h2 className="font-bold text-lg">Start Fleet Inspection</h2><p className="text-xs text-gray-500 mt-1">Choose an asset and a compatible checklist.</p></div><button onClick={onClose} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5 mx-auto"/></button></div><div className="p-4 space-y-4"><Field label="Equipment"><select value={state?.equipment_id || ""} onChange={e => setState(prev => ({...prev,equipment_id:e.target.value,template_id:""}))} className="field"><option value="">Select equipment</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Inspection template"><select value={state?.template_id || ""} onChange={e => setState(prev => ({...prev,template_id:e.target.value}))} className="field" disabled={!selectedEquipment}><option value="">{selectedEquipment ? "Select template" : "Select equipment first"}</option>{templates.map(item => <option key={item.id} value={item.id}>{item.name} · {pretty(item.inspection_type)}</option>)}</select></Field>{selectedEquipment && templates.length===0 && <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300 p-3 text-xs">No active inspection template applies to {selectedEquipment.name}.</div>}<button onClick={onStart} disabled={!state?.equipment_id || !state?.template_id} className="w-full min-h-12 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"><ClipboardCheck className="w-5 h-5"/>Begin Inspection</button></div></div></div>;
}

function TemplateDialog({open,existing,creationKey,equipmentTypes,onClose,onSave}) {
  const [form,setForm] = useState(emptyTemplate());
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(() => { if(open){ setForm(existing ? { ...emptyTemplate(), ...existing, items:(existing.items||[]).map(item=>({...item})) } : emptyTemplate()); setError(""); } }, [open,existing]);
  if(!open)return null;
  const set=(key,value)=>setForm(prev=>({...prev,[key]:value}));
  const updateItem=(index,key,value)=>setForm(prev=>({...prev,items:prev.items.map((item,i)=>i===index?{...item,[key]:value}:item)}));
  const toggleType=type=>set("applicable_equipment_types",form.applicable_equipment_types.includes(type)?form.applicable_equipment_types.filter(value=>value!==type):[...form.applicable_equipment_types,type]);
  const submit=async e=>{e.preventDefault();if(!form.name.trim()||!form.items.some(item=>item.label.trim()))return setError("Template name and at least one checklist item are required.");setBusy(true);setError("");try{await onSave({template:{...form,name:form.name.trim(),description:form.description.trim(),items:form.items.map((item,index)=>({...item,key:item.key||`item-${index+1}`,label:item.label.trim(),instructions:item.instructions.trim()})).filter(item=>item.label)},existing,creationKey});}catch(err){setError(err?.message||"Unable to save template.");}finally{setBusy(false);}};
  return <div className="fixed inset-0 z-[105] bg-black/60 p-2 sm:p-5 overflow-y-auto"><div role="dialog" aria-modal="true" className="mx-auto max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl"><div className="sticky top-0 z-10 p-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between"><div><h2 className="font-bold text-lg">{existing?"Edit":"New"} Inspection Template</h2><p className="text-xs text-gray-500 mt-1">Fleet-only. Failed items may create Fleet maintenance work orders.</p></div><button onClick={onClose} disabled={busy} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5 mx-auto"/></button></div><form onSubmit={submit} className="p-4 sm:p-5 space-y-5">{error&&<div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm">{error}</div>}<div className="grid md:grid-cols-2 gap-4"><Field label="Template name"><input value={form.name} onChange={e=>set("name",e.target.value)} className="field"/></Field><Field label="Type"><select value={form.inspection_type} onChange={e=>set("inspection_type",e.target.value)} className="field">{TYPE_OPTIONS.map(value=><option key={value} value={value}>{pretty(value)}</option>)}</select></Field></div><Field label="Description"><textarea rows={3} value={form.description} onChange={e=>set("description",e.target.value)} className="field"/></Field><div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div className="font-semibold text-sm">Equipment types</div><p className="text-xs text-gray-500 mt-1">Leave all unchecked to allow this template on every active Fleet asset.</p><div className="mt-3 flex flex-wrap gap-2">{equipmentTypes.map(type=><button key={type} type="button" onClick={()=>toggleType(type)} className={`min-h-9 rounded-lg border px-3 text-xs font-semibold capitalize ${form.applicable_equipment_types.includes(type)?"border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200":"border-gray-200 dark:border-slate-700"}`}>{pretty(type)}</button>)}</div></div><div><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">Checklist Items</h3><p className="text-xs text-gray-500 mt-1">Auto-work-order only applies when that item is explicitly failed.</p></div><button type="button" onClick={()=>set("items",[...form.items,{key:crypto.randomUUID(),label:"",instructions:"",response_type:"pass_fail",required:true,severity:"medium",fail_creates_work_order:false}])} className="min-h-10 px-3 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1 text-sm font-semibold"><Plus className="w-4 h-4"/>Add Item</button></div><div className="mt-3 space-y-3">{form.items.map((item,index)=><div key={item.key||index} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3"><div className="grid md:grid-cols-[1fr_150px_130px_44px] gap-2 items-end"><Field label="Item"><input value={item.label||""} onChange={e=>updateItem(index,"label",e.target.value)} className="field" placeholder="Check condition"/></Field><Field label="Response"><select value={item.response_type||"pass_fail"} onChange={e=>updateItem(index,"response_type",e.target.value)} className="field">{RESPONSE_OPTIONS.map(value=><option key={value} value={value}>{pretty(value)}</option>)}</select></Field><Field label="Severity"><select value={item.severity||"medium"} onChange={e=>updateItem(index,"severity",e.target.value)} className="field">{SEVERITY_OPTIONS.map(value=><option key={value} value={value}>{value}</option>)}</select></Field><button type="button" onClick={()=>set("items",form.items.filter((_,i)=>i!==index))} className="min-h-11 rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center justify-center text-red-500"><Trash2 className="w-4 h-4"/></button></div><Field label="Instructions"><input value={item.instructions||""} onChange={e=>updateItem(index,"instructions",e.target.value)} className="field"/></Field><div className="mt-2 flex flex-wrap gap-4 text-xs"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={item.required!==false} onChange={e=>updateItem(index,"required",e.target.checked)}/>Required</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={item.fail_creates_work_order===true} onChange={e=>updateItem(index,"fail_creates_work_order",e.target.checked)}/>Create Fleet WO when failed</label></div></div>)}</div></div><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active!==false} onChange={e=>set("active",e.target.checked)}/>Template active</label><div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700">Cancel</button><button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50">{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>}Save Template</button></div></form></div><style>{fieldStyle}</style></div>;
}

function InspectionRunner({open,inspection,template,equipment,onClose,onSaved,onCompleted}) {
  const [responses,setResponses] = useState([]);
  const [notes,setNotes] = useState("");
  const [meterValue,setMeterValue] = useState("");
  const [meterUnit,setMeterUnit] = useState("miles");
  const [busy,setBusy] = useState(false);
  const [uploadingKey,setUploadingKey] = useState("");
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  useEffect(()=>{if(open&&inspection&&template){const byKey=new Map((inspection.responses||[]).map(row=>[row.item_key,row]));setResponses((template.items||[]).map(item=>({item_key:item.key,label:item.label,result:byKey.get(item.key)?.result||"",value:byKey.get(item.key)?.value||"",notes:byKey.get(item.key)?.notes||"",photo_urls:byKey.get(item.key)?.photo_urls||[]})));setNotes(inspection.notes||"");setMeterValue(inspection.meter_value??"");setMeterUnit(inspection.meter_unit||((equipment?.type||"").toLowerCase().includes("vehicle")?"miles":"hours"));setError("");setMessage("");}},[open,inspection,template,equipment]);
  if(!open||!inspection||!template)return null;
  const itemConfig=key=>(template.items||[]).find(item=>item.key===key)||{};
  const setResponse=(key,patch)=>setResponses(prev=>prev.map(row=>row.item_key===key?{...row,...patch}:row));
  const failed=responses.filter(row=>row.result==="fail");
  const autoWork=failed.filter(row=>itemConfig(row.item_key).fail_creates_work_order===true);
  const uploadPhoto=async(key,file)=>{if(!file)return;setUploadingKey(key);setError("");try{const result=await base44.integrations.Core.UploadFile({file});if(!result?.file_url)throw new Error("Inspection photo upload failed.");setResponse(key,{photo_urls:[...new Set([...(responses.find(row=>row.item_key===key)?.photo_urls||[]),result.file_url])]});}catch(err){setError(err?.message||"Unable to upload inspection photo.");}finally{setUploadingKey("");}};
  const persist=async complete=>{setBusy(true);setError("");setMessage("");try{const {data}=await base44.functions.invoke("fleetInspectionAction",{action:complete?"inspection_complete":"inspection_save",id:inspection.id,expected_updated_date:inspection.updated_date||"",responses,notes,meter_value:meterValue,meter_unit:meterValue!==""?meterUnit:undefined,photo_urls:inspection.photo_urls||[]});if(data?.error)throw new Error(data.error);if(complete){setMessage(data.generated_work_order_ids?.length?`Inspection completed. ${data.generated_work_order_ids.length} Fleet work order${data.generated_work_order_ids.length===1?"":"s"} created/reused from failed items.`:"Inspection completed with no automatic work orders.");await onCompleted?.(data.inspection);}else{setMessage("Draft saved.");await onSaved?.(data.inspection);}}catch(err){setError(err?.message||"Unable to save Fleet inspection.");}finally{setBusy(false);}};
  const progress=(template.items||[]).filter(item=>{const row=responses.find(value=>value.item_key===item.key);if(!row)return false;if(item.response_type==="text"||item.response_type==="number")return !!String(row.value||"").trim();return ["pass","fail","na"].includes(row.result);}).length;
  return <div className="fixed inset-0 z-[110] bg-black/65 p-2 sm:p-4 overflow-y-auto"><div role="dialog" aria-modal="true" className="mx-auto max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl overflow-hidden"><div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-200 dark:border-slate-800 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{pretty(template.inspection_type)} inspection</div><h2 className="text-xl font-bold mt-1">{equipment?.name || "Fleet equipment"} · {template.name}</h2><div className="text-xs text-gray-500 mt-1">{progress} of {template.items?.length||0} items answered</div></div><button onClick={onClose} disabled={busy} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5 mx-auto"/></button></div><div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{width:`${template.items?.length?Math.round(progress/template.items.length*100):0}%`}}/></div></div><div className="p-4 sm:p-5 space-y-4">{error&&<div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 p-3 text-sm">{error}</div>}{message&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 p-3 text-sm">{message}</div>}<div className="grid sm:grid-cols-2 gap-3"><Field label="Mileage / hours"><input type="number" min="0" step="0.1" value={meterValue} onChange={e=>setMeterValue(e.target.value)} className="field" placeholder="Optional"/></Field><Field label="Meter unit"><select value={meterUnit} onChange={e=>setMeterUnit(e.target.value)} className="field"><option value="miles">Miles</option><option value="hours">Hours</option></select></Field></div>{(template.items||[]).map((item,index)=>{const row=responses.find(value=>value.item_key===item.key)||{};const failing=row.result==="fail";return <section key={item.key} className={`rounded-2xl border p-4 ${failing?"border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/15":"border-gray-200 dark:border-slate-700"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800 text-xs font-bold">{index+1}</span><h3 className="font-bold text-gray-900 dark:text-slate-100">{item.label}</h3>{item.required!==false&&<span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-300">Required</span>}{item.fail_creates_work_order&&<span className="text-[10px] rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-1">Fail → Fleet WO</span>}</div>{item.instructions&&<p className="text-xs text-gray-500 dark:text-slate-400 mt-2">{item.instructions}</p>}</div><span className={`text-[10px] uppercase font-bold ${item.severity==="critical"?"text-red-600":item.severity==="high"?"text-orange-600":"text-gray-400"}`}>{item.severity}</span></div>{["pass_fail","checkbox"].includes(item.response_type)?<div className="grid grid-cols-3 gap-2 mt-4">{INSPECTION_RESULTS.map(({value,label,icon:Icon})=><button key={value} type="button" onClick={()=>setResponse(item.key,{result:value})} className={`min-h-12 rounded-xl border font-semibold inline-flex items-center justify-center gap-1.5 ${row.result===value?value==="pass"?"border-emerald-500 bg-emerald-600 text-white":value==="fail"?"border-red-500 bg-red-600 text-white":"border-gray-500 bg-gray-600 text-white":"border-gray-200 dark:border-slate-700"}`}><Icon className="w-4 h-4"/>{label}</button>)}</div>:<Field label={item.response_type==="number"?"Value":"Response"}><input type={item.response_type==="number"?"number":"text"} value={row.value||""} onChange={e=>setResponse(item.key,{value:e.target.value,result:"pass"})} className="field"/></Field>}<div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end mt-3"><Field label="Notes"><input value={row.notes||""} onChange={e=>setResponse(item.key,{notes:e.target.value})} className="field" placeholder="Optional detail"/></Field><label className="min-h-11 px-3 rounded-lg border border-gray-200 dark:border-slate-700 cursor-pointer inline-flex items-center justify-center gap-1.5 text-xs font-semibold">{uploadingKey===item.key?<Loader2 className="w-4 h-4 animate-spin"/>:<Camera className="w-4 h-4"/>}Photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>{uploadPhoto(item.key,e.target.files?.[0]);e.target.value="";}}/></label></div>{row.photo_urls?.length>0&&<div className="mt-2 flex gap-2 overflow-x-auto">{row.photo_urls.map((url,i)=><img key={`${url}-${i}`} src={url} alt={`${item.label} evidence`} className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-slate-700"/>)}</div>}</section>;})}<Field label="Inspection notes"><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} className="field" placeholder="Overall notes, conditions, or follow-up context"/></Field>{failed.length>0&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"><div className="font-bold">{failed.length} failed item{failed.length===1?"":"s"}</div><div className="text-xs mt-1">{autoWork.length} failure{autoWork.length===1?"":"s"} will create/reuse a Fleet maintenance work order when you complete this inspection.</div></div>}<div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 p-3 sm:p-4 border-t border-gray-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur flex flex-col sm:flex-row sm:justify-between gap-2"><button type="button" onClick={()=>persist(false)} disabled={busy||!!uploadingKey} className="min-h-11 px-4 rounded-lg border border-gray-300 dark:border-slate-700 font-semibold inline-flex items-center justify-center gap-2"><Save className="w-4 h-4"/>Save Draft</button><button type="button" onClick={()=>persist(true)} disabled={busy||!!uploadingKey} className={`min-h-11 px-4 rounded-lg text-white font-semibold inline-flex items-center justify-center gap-2 ${failed.length?"bg-red-600":"bg-emerald-600"}`}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Check className="w-4 h-4"/>}Complete Inspection</button></div></div></div><style>{fieldStyle}</style></div>;
}

function Metric({label,value,attention=false,good=false}){return <div className={`rounded-xl border p-3 ${attention?"border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20":good?"border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20":"border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}><div className="text-xs text-gray-400">{label}</div><div className={`text-2xl font-bold mt-1 ${attention?"text-red-700 dark:text-red-300":good?"text-emerald-700 dark:text-emerald-300":"text-gray-900 dark:text-slate-100"}`}>{value}</div></div>}
function Status({status}){const cls=status==="passed"?"bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300":status==="failed"?"bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300":status==="needs_attention"?"bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300":"bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300";return <span className={`text-[10px] px-2 py-1 rounded-full font-bold capitalize ${cls}`}>{pretty(status)}</span>}
function Empty({text}){return <div className="p-8 text-center text-sm text-gray-400">{text}</div>}
function Field({label,children}){return <label className="block mt-2"><span className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>}
const fieldStyle = `.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.6rem;padding:.6rem .72rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}.field:focus{outline:2px solid rgb(99 102 241 / .35);outline-offset:1px}`;
