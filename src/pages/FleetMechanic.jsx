import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, AlertTriangle, Camera, CheckCircle2, Clock3, Loader2, RefreshCw, Save, Truck, Wrench, X } from "lucide-react";

const pretty = value => String(value || "—").replaceAll("_", " ");
const fmtDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString() : "—";

function initialToken() {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.replace(/^#/, "").trim();
  if (hash) {
    sessionStorage.setItem("ccs_fleet_mechanic_token", hash);
    window.history.replaceState(null, "", window.location.pathname);
    return hash;
  }
  return sessionStorage.getItem("ccs_fleet_mechanic_token") || "";
}

async function fileToJpegPayload(file) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  let quality = 0.82;
  let blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
  while (blob && blob.size > 1_150_000 && quality > 0.42) {
    quality -= 0.1;
    blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
  }
  if (!blob || blob.size > 1_200_000) throw new Error(`${file.name} could not be reduced below 1.2 MB.`);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Photo could not be read."));
    reader.readAsDataURL(blob);
  });
  return { type: "image/jpeg", data: dataUrl.split(",")[1] || "", preview: URL.createObjectURL(blob), name: file.name };
}

export default function FleetMechanic() {
  const [token] = useState(initialToken);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("active");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ actual_hours: "", corrective_action: "", mechanic_note: "" });
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const load = async (quiet = false) => {
    if (!token) { setError("This mechanic link is missing its access key. Ask CCS for a new link."); setLoading(false); return; }
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const { data: result } = await base44.functions.invoke("fleetMechanicPortal", { action: "bootstrap", token });
      if (result?.error) throw new Error(result.error);
      setData(result || null);
      setError("");
      if (selected) {
        const all = [...(result?.active_work_orders || []), ...(result?.recent_completed || [])];
        const fresh = all.find(row => row.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (e) {
      setError(e?.message || "The Fleet mechanic portal could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const equipmentById = useMemo(() => Object.fromEntries((data?.equipment || []).map(row => [row.id, row])), [data]);
  const taskById = useMemo(() => Object.fromEntries((data?.tasks || []).map(row => [row.id, row])), [data]);
  const rows = tab === "active" ? (data?.active_work_orders || []) : (data?.recent_completed || []);

  const openJob = workOrder => {
    setSelected(workOrder);
    setForm({ actual_hours: workOrder.actual_hours ?? "", corrective_action: workOrder.corrective_action || "", mechanic_note: "" });
    photos.forEach(row => URL.revokeObjectURL(row.preview));
    setPhotos([]);
    setActionError("");
    setSavedMessage("");
  };

  const closeJob = () => {
    photos.forEach(row => URL.revokeObjectURL(row.preview));
    setPhotos([]);
    setSelected(null);
  };

  const addPhotos = async event => {
    const files = Array.from(event.target.files || []).slice(0, Math.max(0, 3 - photos.length));
    event.target.value = "";
    if (!files.length) return;
    setActionError("");
    try {
      const prepared = [];
      for (const file of files) prepared.push(await fileToJpegPayload(file));
      setPhotos(prev => [...prev, ...prepared].slice(0, 3));
    } catch (e) {
      setActionError(e?.message || "One of the photos could not be prepared.");
    }
  };

  const startJob = async () => {
    if (!selected) return;
    setBusy("start"); setActionError(""); setSavedMessage("");
    try {
      const { data: result } = await base44.functions.invoke("fleetMechanicPortal", {
        action: "start", token, work_order_id: selected.id, expected_updated_date: selected.updated_date,
      });
      if (result?.error) throw new Error(result.error);
      setSavedMessage("Work started. CCS Fleet has been updated.");
      await load(true);
    } catch (e) { setActionError(e?.message || "Work order could not be started."); }
    finally { setBusy(""); }
  };

  const saveProgress = async () => {
    if (!selected) return;
    setBusy("save"); setActionError(""); setSavedMessage("");
    try {
      const { data: result } = await base44.functions.invoke("fleetMechanicPortal", {
        action: "save", token, work_order_id: selected.id, expected_updated_date: selected.updated_date,
        actual_hours: form.actual_hours, corrective_action: form.corrective_action, mechanic_note: form.mechanic_note,
        photos: photos.map(({type, data}) => ({type, data})),
      });
      if (result?.error) throw new Error(result.error);
      setSavedMessage("Progress saved to CCS Fleet.");
      photos.forEach(row => URL.revokeObjectURL(row.preview));
      setPhotos([]);
      setForm(prev => ({...prev, mechanic_note:""}));
      await load(true);
    } catch (e) { setActionError(e?.message || "Progress could not be saved."); }
    finally { setBusy(""); }
  };

  if (loading) return <Standalone><div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div></Standalone>;
  if (error) return <Standalone><div className="max-w-lg mx-auto px-4 py-16"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800"><AlertTriangle className="w-8 h-8 mb-3"/><h1 className="text-xl font-bold">Mechanic link unavailable</h1><p className="text-sm mt-2">{error}</p></div></div></Standalone>;

  return <Standalone portalName={data?.portal?.name}>
    <main className="max-w-5xl mx-auto px-4 pb-12">
      <div className="py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-950">Fleet Maintenance</h1><p className="text-sm text-slate-500 mt-1">Standalone mechanic portal · active CCS Fleet maintenance only</p></div>
        <button onClick={()=>load(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-50">{refreshing?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Refresh</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Summary label="Active Jobs" value={data?.active_work_orders?.length || 0} icon={Wrench}/>
        <Summary label="Recent Completed" value={data?.recent_completed?.length || 0} icon={CheckCircle2}/>
      </div>

      <div className="flex gap-2 mb-4">
        <Tab active={tab==="active"} onClick={()=>setTab("active")}>Active Work</Tab>
        <Tab active={tab==="completed"} onClick={()=>setTab("completed")}>Recent Completed</Tab>
      </div>

      <div className="space-y-3">
        {rows.length ? rows.map(workOrder => {
          const equipment = equipmentById[workOrder.equipment_id];
          return <button key={workOrder.id} onClick={()=>openJob(workOrder)} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400 transition">
            <div className="flex items-start gap-3"><div className="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">{equipment?.photo_url?<img src={equipment.photo_url} alt="" className="w-full h-full object-cover"/>:<Truck className="w-5 h-5 text-slate-400"/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 items-center"><span className="font-semibold text-slate-950">{workOrder.work_order_number}</span><Pill>{pretty(workOrder.status)}</Pill>{["high","critical"].includes(workOrder.priority)&&<Pill attention>{pretty(workOrder.priority)}</Pill>}</div><div className="text-base text-slate-800 mt-1">{workOrder.title}</div><div className="text-sm text-slate-500 mt-1">{equipment?.name || "Unlinked equipment"}{workOrder.projected_completion_date?` · Target ${fmtDate(workOrder.projected_completion_date)}`:""}</div></div></div>
          </button>;
        }) : <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">{tab==="active"?"No active Fleet maintenance jobs right now.":"No recently completed Fleet jobs."}</div>}
      </div>
    </main>

    {selected && <JobModal workOrder={selected} equipment={equipmentById[selected.equipment_id]} task={taskById[selected.maintenance_task_id]} form={form} setForm={setForm} photos={photos} setPhotos={setPhotos} onAddPhotos={addPhotos} onClose={closeJob} onStart={startJob} onSave={saveProgress} busy={busy} error={actionError} saved={savedMessage}/>} 
  </Standalone>;
}

function Standalone({children, portalName}) {
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="bg-slate-950 text-white"><div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><Wrench className="w-5 h-5"/></div><div><div className="font-bold leading-tight">CCS Fleet</div><div className="text-xs text-slate-300">{portalName || "Mechanic Portal"}</div></div></div></header>{children}<footer className="border-t border-slate-200 bg-white"><div className="max-w-5xl mx-auto px-4 py-4 text-xs text-slate-400 text-center">Standalone external mechanic portal · No access to CCS Signage Workflow navigation or administration</div></footer></div>;
}

function JobModal({workOrder,equipment,task,form,setForm,photos,setPhotos,onAddPhotos,onClose,onStart,onSave,busy,error,saved}) {
  const completed = workOrder.status === "completed";
  return <div className="fixed inset-0 z-[100] bg-black/60 p-3 sm:p-6 overflow-y-auto"><div className="max-w-3xl mx-auto rounded-2xl bg-white shadow-2xl overflow-hidden">
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-3"><div><div className="text-xs font-semibold text-slate-400">{workOrder.work_order_number}</div><h2 className="text-xl font-bold text-slate-950">{workOrder.title}</h2><div className="text-sm text-slate-500 mt-0.5">{equipment?.name || "Unlinked equipment"}</div></div><button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5"/></button></div>
    <div className="p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap gap-2"><Pill>{pretty(workOrder.status)}</Pill><Pill>{pretty(workOrder.type)}</Pill><Pill attention={["high","critical"].includes(workOrder.priority)}>{pretty(workOrder.priority)} priority</Pill></div>
      {workOrder.description && <Section title="Work Requested"><p className="text-sm whitespace-pre-wrap text-slate-700">{workOrder.description}</p></Section>}
      <div className="grid sm:grid-cols-2 gap-3"><Info label="Started" value={workOrder.started_date?fmtDate(workOrder.started_date):"Not started"}/><Info label="Target" value={fmtDate(workOrder.projected_completion_date)}/><Info label="Assigned" value={workOrder.assigned_to || "Unassigned"}/><Info label="Equipment status" value={pretty(equipment?.status)}/></div>
      {equipment && <Section title="Equipment"><div className="grid sm:grid-cols-2 gap-3"><Info label="Vehicle / asset" value={[equipment.year,equipment.make,equipment.model].filter(Boolean).join(" ") || pretty(equipment.type)}/><Info label="VIN / Serial" value={equipment.vin || equipment.serial_number || "—"}/><Info label="Location" value={equipment.location || "—"}/><Info label="Mileage / hours" value={equipment.mileage_hours ?? "—"}/></div>{equipment.engine_details&&<p className="text-sm text-slate-600 mt-3">{equipment.engine_details}</p>}</Section>}
      {task && <Section title="Maintenance Schedule"><div className="text-sm text-slate-700">{task.description || task.title}</div>{(task.parts_needed?.length||task.fluids_needed?.length)?<div className="grid sm:grid-cols-2 gap-3 mt-3"><Needed title="Parts needed" rows={(task.parts_needed||[]).map(row=>`${row.quantity ?? ""} ${row.part_name || "Part"}`)}/><Needed title="Fluids needed" rows={(task.fluids_needed||[]).map(row=>`${row.quantity ?? ""} ${row.unit || ""} ${row.fluid_type || "Fluid"}`)}/></div>:null}</Section>}
      {(workOrder.problem_photos?.length||workOrder.before_photos?.length||workOrder.after_photos?.length) ? <Section title="Job Photos"><PhotoGrid urls={[...(workOrder.problem_photos||[]),...(workOrder.before_photos||[]),...(workOrder.after_photos||[])]}/></Section> : null}
      {(workOrder.parts_used?.length||workOrder.fluids_used?.length) ? <Section title="Recorded Usage"><div className="grid sm:grid-cols-2 gap-3"><Needed title="Parts" rows={(workOrder.parts_used||[]).map(row=>`${row.quantity ?? ""} ${row.part_name || "Part"}`)}/><Needed title="Fluids" rows={(workOrder.fluids_used||[]).map(row=>`${row.quantity ?? ""} ${row.unit || ""} ${row.fluid_name || "Fluid"}`)}/></div></Section> : null}
      {workOrder.notes && <Section title="Existing Notes"><p className="text-sm whitespace-pre-wrap text-slate-600 max-h-48 overflow-auto">{workOrder.notes}</p></Section>}

      {!completed && <Section title="Mechanic Progress">
        {error&&<div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}{saved&&<div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saved}</div>}
        {workOrder.status!=="in_progress"&&<button onClick={onStart} disabled={!!busy} className="mb-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy==="start"?<Loader2 className="w-4 h-4 animate-spin"/>:<Activity className="w-4 h-4"/>}Mark Work Started</button>}
        <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm"><span className="block text-xs font-semibold text-slate-500 mb-1">Labor hours</span><input type="number" min="0" step="0.25" value={form.actual_hours} onChange={e=>setForm(prev=>({...prev,actual_hours:e.target.value}))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5"/></label><div className="text-xs text-slate-500 flex items-end pb-2"><Clock3 className="w-4 h-4 mr-1.5"/>CCS staff performs final completion and inventory posting.</div></div>
        <label className="block text-sm mt-4"><span className="block text-xs font-semibold text-slate-500 mb-1">Corrective action / work performed</span><textarea rows="5" value={form.corrective_action} onChange={e=>setForm(prev=>({...prev,corrective_action:e.target.value}))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Describe the repair or service performed…"/></label>
        <label className="block text-sm mt-4"><span className="block text-xs font-semibold text-slate-500 mb-1">Add mechanic note</span><textarea rows="3" value={form.mechanic_note} onChange={e=>setForm(prev=>({...prev,mechanic_note:e.target.value}))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="This note is appended with your portal name and timestamp."/></label>
        <div className="mt-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-500">After photos</span><label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 cursor-pointer"><Camera className="w-4 h-4"/>Add photos<input type="file" accept="image/*" multiple className="hidden" onChange={onAddPhotos}/></label></div>{photos.length>0&&<div className="grid grid-cols-3 gap-2 mt-2">{photos.map((photo,index)=><div key={`${photo.name}-${index}`} className="relative aspect-square"><img src={photo.preview} alt="" className="w-full h-full object-cover rounded-xl"/><button onClick={()=>{URL.revokeObjectURL(photo.preview);setPhotos(prev=>prev.filter((_,i)=>i!==index));}} className="absolute top-1 right-1 rounded-full bg-black/70 text-white p-1"><X className="w-3.5 h-3.5"/></button></div>)}</div>}</div>
        <button onClick={onSave} disabled={!!busy} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy==="save"?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>}Save Progress</button>
      </Section>}
      {completed&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Completed {workOrder.completed_date?fmtDate(workOrder.completed_date):""}. This record is read-only in the mechanic portal.</div>}
    </div>
  </div></div>;
}

function Summary({label,value,icon:Icon}) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="w-5 h-5 text-slate-400"/><div className="text-2xl font-bold mt-2">{value}</div><div className="text-xs text-slate-500 mt-0.5">{label}</div></div>; }
function Tab({active,onClick,children}) { return <button onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-semibold ${active?"bg-slate-950 text-white":"bg-white border border-slate-300 text-slate-700"}`}>{children}</button>; }
function Pill({children,attention=false}) { return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${attention?"bg-red-100 text-red-700":"bg-slate-100 text-slate-600"}`}>{children}</span>; }
function Section({title,children}) { return <section className="rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-950 mb-3">{title}</h3>{children}</section>; }
function Info({label,value}) { return <div><div className="text-xs text-slate-400">{label}</div><div className="text-sm font-medium text-slate-800 mt-0.5 capitalize">{value}</div></div>; }
function Needed({title,rows}) { return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-500">{title}</div>{rows.length?<ul className="mt-2 space-y-1 text-sm text-slate-700">{rows.map((row,i)=><li key={i}>• {row}</li>)}</ul>:<div className="text-sm text-slate-400 mt-2">None recorded</div>}</div>; }
function PhotoGrid({urls}) { return <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{urls.map((url,i)=><a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer" className="aspect-square block"><img src={url} alt="Job" className="w-full h-full object-cover rounded-xl border border-slate-200"/></a>)}</div>; }
