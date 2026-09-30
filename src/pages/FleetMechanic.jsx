import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, AlertTriangle, Camera, CheckCircle2, CircleDollarSign, Clock3, Loader2, Plus, RefreshCw, Save, Trash2, Truck, Wrench, X } from "lucide-react";

const pretty = value => String(value || "—").replaceAll("_", " ");
const fmtDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString() : "—";
const blankEstimate = () => ({estimated_labor_hours:"",labor_rate:"",misc_total:"",estimated_completion_date:"",parts_estimate:[],fluids_estimate:[],notes:""});
const estimateSeed = row => row?.visibility === "mechanic" ? ({estimated_labor_hours:String(row.estimated_labor_hours??""),labor_rate:String(row.labor_rate??""),misc_total:String(row.misc_total??""),estimated_completion_date:row.estimated_completion_date||"",parts_estimate:(row.parts_estimate||[]).map(line=>({...line,quantity:String(line.quantity??""),estimated_cost:String(line.estimated_cost??"")})),fluids_estimate:(row.fluids_estimate||[]).map(line=>({...line,quantity:String(line.quantity??""),estimated_cost:String(line.estimated_cost??"")})),notes:row.notes||""}) : blankEstimate();
const estimateTotal = form => Number(form.estimated_labor_hours||0)*Number(form.labor_rate||0)+(form.parts_estimate||[]).reduce((sum,line)=>sum+Number(line.quantity||0)*Number(line.estimated_cost||0),0)+(form.fluids_estimate||[]).reduce((sum,line)=>sum+Number(line.quantity||0)*Number(line.estimated_cost||0),0)+Number(form.misc_total||0);
const ACTIVE_WORK_STATUSES = new Set(["open","assigned","in_progress"]);
const newMechanicRequestId = () => globalThis.crypto.randomUUID();

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
  const [estimateForm, setEstimateForm] = useState(blankEstimate);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [estimateRecovery, setEstimateRecovery] = useState(null);
  const [workRecovery, setWorkRecovery] = useState(null);
  const portalRequestRef = useRef(0);
  const selectedWorkOrderRef = useRef(null);

  const fetchPortalPayload = async () => {
    const { data: result } = await base44.functions.invoke("fleetMechanicPortal", { action: "bootstrap", token });
    if (result?.error) throw new Error(result.error);
    return result || null;
  };

  const applyPortalPayload = result => {
    setData(result || null);
    setError("");
    const all = [...(result?.active_work_orders || []), ...(result?.recent_completed || [])];
    setSelected(current => {
      if (!current) return current;
      return all.find(row => row.id === current.id) || current;
    });
  };

  const applyWorkOrderSnapshot = workOrder => {
    if (!workOrder?.id) return;
    setData(current => {
      if (!current) return current;
      const active = ACTIVE_WORK_STATUSES.has(workOrder.status);
      const replace = (rows, include) => {
        const next = (rows || []).filter(row => row.id !== workOrder.id);
        if (include) next.unshift(workOrder);
        return next;
      };
      return {...current,active_work_orders:replace(current.active_work_orders,active),recent_completed:replace(current.recent_completed,!active)};
    });
    setSelected(current => current?.id === workOrder.id ? workOrder : current);
  };

  const clearSavedProgressDraft = workOrder => {
    setPhotos(current => {
      current.forEach(row => URL.revokeObjectURL(row.preview));
      return [];
    });
    setForm(current => ({
      ...current,
      actual_hours:workOrder?.actual_hours ?? current.actual_hours,
      corrective_action:workOrder?.corrective_action ?? current.corrective_action,
      mechanic_note:"",
    }));
  };

  const load = async (quiet = false) => {
    if (!token) { setError("This mechanic link is missing its access key. Ask CCS for a new link."); setLoading(false); return; }
    const requestId = ++portalRequestRef.current;
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const result = await fetchPortalPayload();
      if (requestId !== portalRequestRef.current) return;
      applyPortalPayload(result);
    } catch (e) {
      if (requestId === portalRequestRef.current) setError(e?.message || "The Fleet mechanic portal could not be loaded.");
    } finally {
      if (requestId === portalRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => { load(); }, []);

  const equipmentById = useMemo(() => Object.fromEntries((data?.equipment || []).map(row => [row.id, row])), [data]);
  const taskById = useMemo(() => Object.fromEntries((data?.tasks || []).map(row => [row.id, row])), [data]);
  const estimateByWorkOrder = useMemo(() => Object.fromEntries((data?.repair_estimates || []).map(row => [row.work_order_id, row])), [data]);
  const rows = tab === "active" ? (data?.active_work_orders || []) : (data?.recent_completed || []);

  const openJob = workOrder => {
    selectedWorkOrderRef.current = workOrder.id;
    setSelected(workOrder);
    setForm({ actual_hours: workOrder.actual_hours ?? "", corrective_action: workOrder.corrective_action || "", mechanic_note: "" });
    setEstimateForm(estimateSeed(estimateByWorkOrder[workOrder.id]));
    photos.forEach(row => URL.revokeObjectURL(row.preview));
    setPhotos([]);
    setActionError("");
    setSavedMessage("");
  };

  const closeJob = () => {
    selectedWorkOrderRef.current = null;
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

  const recoverWorkMutation = async (recovery, reason = "") => {
    if (!recovery?.workOrderId || !recovery?.requestId || !recovery?.action) return false;
    const requestSequence = ++portalRequestRef.current;
    const recoveryReason = reason || recovery.reason || "The mechanic update could not be confirmed.";
    setWorkRecovery({...recovery,reason:recoveryReason});
    setBusy("work-recovery");
    setRefreshing(true);
    try {
      const {data:result} = await base44.functions.invoke("fleetMechanicPortal", {
        action:"mutation_status",token,work_order_id:recovery.workOrderId,mutation_action:recovery.action,request_id:recovery.requestId,
      });
      if (result?.error) throw new Error(result.error);
      if (requestSequence !== portalRequestRef.current) return false;
      const fresh = result?.work_order || null;
      if (fresh) applyWorkOrderSnapshot(fresh);
      const isSameOpenJob = selectedWorkOrderRef.current === recovery.workOrderId;
      if (result?.status === "applied") {
        setWorkRecovery(null);
        if (isSameOpenJob) {
          if (recovery.action === "save") clearSavedProgressDraft(fresh);
          setActionError("");
          setSavedMessage(recovery.action === "start" ? "Work started. CCS Fleet confirmed the interrupted request." : "Progress saved. CCS Fleet confirmed the interrupted request without replaying it.");
        }
        return true;
      }
      if (result?.status === "failed" || result?.status === "not_found") {
        setWorkRecovery(null);
        if (isSameOpenJob) {
          setSavedMessage("");
          setActionError(recovery.action === "start"
            ? `${recoveryReason} The server confirms this request was not applied. Current Fleet state was refreshed; review it before trying Start Work again.`
            : `${recoveryReason} The server confirms this request was not applied. Current Fleet state was refreshed and your unsaved progress was kept for review before another save.`);
        }
        return false;
      }
      setWorkRecovery({...recovery,reason:recoveryReason});
      if (isSameOpenJob) {
        setSavedMessage("");
        setActionError(`${recoveryReason} The server has not confirmed whether this request finished. Nothing was replayed. Use Check Current Server State before trying again.`);
      }
      return false;
    } catch (e) {
      if (requestSequence !== portalRequestRef.current) return false;
      setWorkRecovery({...recovery,reason:recoveryReason});
      if (selectedWorkOrderRef.current === recovery.workOrderId) {
        const detail = e?.message ? ` (${e.message})` : "";
        setSavedMessage("");
        setActionError(`${recoveryReason} Current server state could not be verified${detail}. Nothing was replayed. Use Check Current Server State before trying again.`);
      }
      return false;
    } finally {
      if (requestSequence === portalRequestRef.current) {
        setBusy("");
        setRefreshing(false);
      }
    }
  };

  const startJob = async () => {
    if (!selected) return;
    if (workRecovery?.workOrderId === selected.id) { setActionError("Check the current server state before trying another work-order update."); return; }
    const recovery = {workOrderId:selected.id,action:"start",requestId:newMechanicRequestId(),reason:"Work-start request could not be confirmed."};
    setBusy("start"); setActionError(""); setSavedMessage("");
    try {
      const { data: result } = await base44.functions.invoke("fleetMechanicPortal", {
        action: "start", token, work_order_id: selected.id, expected_updated_date: selected.updated_date, request_id:recovery.requestId,
      });
      if (result?.error) throw new Error(result.error);
      if (result?.work_order) applyWorkOrderSnapshot(result.work_order);
      setWorkRecovery(null);
      setSavedMessage("Work started. CCS Fleet has been updated.");
    } catch (e) {
      const detail = e?.message || "Work order could not be started.";
      await recoverWorkMutation({...recovery,reason:`Work-start request could not be confirmed: ${detail}.`});
    } finally { setBusy(""); }
  };

  const refreshEstimateState = async (workOrderId, reason = "", showRecoveredMessage = false) => {
    const recoveryReason = reason || "Current repair-estimate state must be verified.";
    const requestId = ++portalRequestRef.current;
    setEstimateRecovery({workOrderId, reason: recoveryReason});
    setBusy("estimate-refresh");
    setRefreshing(true);
    try {
      const result = await fetchPortalPayload();
      if (requestId !== portalRequestRef.current) return false;
      applyPortalPayload(result);
      const freshEstimate = (result?.repair_estimates || []).find(row => row.work_order_id === workOrderId) || null;
      const isSameOpenJob = selectedWorkOrderRef.current === workOrderId;
      if (freshEstimate && isSameOpenJob) setEstimateForm(estimateSeed(freshEstimate));
      setEstimateRecovery(null);
      if (isSameOpenJob) {
        if (showRecoveredMessage) {
          const serverMessage = !freshEstimate
            ? "Current server check confirms no repair estimate exists yet. Your draft was kept."
            : freshEstimate.visibility === "mechanic"
              ? `Current server estimate reloaded as ${pretty(freshEstimate.status || "draft")}. The server copy is now authoritative.`
              : freshEstimate.visibility === "conflict"
                ? "Current server state shows conflicting repair estimates. CCS must resolve them before this portal can continue."
                : freshEstimate.visibility === "other_mechanic"
                  ? "Current server state shows another mechanic portal owns this estimate."
                  : "Current server state shows CCS owns this estimate.";
          setActionError(`${recoveryReason} ${serverMessage} Nothing was resubmitted automatically.`);
        } else setActionError("");
      }
      return true;
    } catch (e) {
      if (requestId !== portalRequestRef.current) return false;
      const detail = e?.message ? ` (${e.message})` : "";
      setEstimateRecovery({workOrderId, reason: recoveryReason});
      if (selectedWorkOrderRef.current === workOrderId) setActionError(`${recoveryReason} Current server ownership could not be verified${detail}. Use Check Current Server State before saving or submitting again.`);
      return false;
    } finally {
      if (requestId === portalRequestRef.current) {
        setBusy("");
        setRefreshing(false);
      }
    }
  };

  const saveEstimate = async (submit = false) => {
    if (!selected || !data?.portal?.capabilities?.estimates) return;
    if (estimateRecovery?.workOrderId === selected.id) { setActionError("Current server ownership must be checked before another estimate save or submit."); return; }
    const currentEstimate = estimateByWorkOrder[selected.id] || null;
    if (currentEstimate && currentEstimate.visibility !== "mechanic") { setActionError("This estimate is managed by CCS or another mechanic and cannot be viewed or overwritten here."); return; }
    setBusy(submit ? "estimate-submit" : "estimate-save"); setActionError(""); setSavedMessage("");
    try {
      const payloadEstimate = {
        estimated_labor_hours:Number(estimateForm.estimated_labor_hours||0), labor_rate:Number(estimateForm.labor_rate||0), misc_total:Number(estimateForm.misc_total||0), estimated_completion_date:estimateForm.estimated_completion_date||"",
        parts_estimate:(estimateForm.parts_estimate||[]).map(line=>({description:line.description||"",quantity:Number(line.quantity||0),estimated_cost:Number(line.estimated_cost||0)})),
        fluids_estimate:(estimateForm.fluids_estimate||[]).map(line=>({description:line.description||"",quantity:Number(line.quantity||0),unit:line.unit||"",estimated_cost:Number(line.estimated_cost||0)})), notes:estimateForm.notes||"",
      };
      const saved = await base44.functions.invoke("fleetMechanicPortal", {action:"estimate_save",token,work_order_id:selected.id,expected_updated_date:selected.updated_date,estimate_expected_updated_date:currentEstimate?.updated_date||"",estimate:payloadEstimate});
      if (saved?.data?.error) throw new Error(saved.data.error);
      let finalEstimate = saved?.data?.estimate;
      let resultMessage = "Estimate draft saved.";
      if (submit) {
        const submitted = await base44.functions.invoke("fleetMechanicPortal", {action:"estimate_submit",token,work_order_id:selected.id,expected_updated_date:selected.updated_date,estimate_expected_updated_date:finalEstimate?.updated_date||""});
        if (submitted?.data?.error) throw new Error(submitted.data.error);
        finalEstimate = submitted?.data?.estimate;
        resultMessage = submitted?.data?.auto_approved ? "Estimate submitted and automatically approved by CCS Fleet policy." : "Estimate submitted to CCS for approval.";
      }
      setSavedMessage(resultMessage);
      setEstimateForm(estimateSeed({...finalEstimate,visibility:"mechanic"}));
      await refreshEstimateState(selected.id, `${resultMessage} Current server state could not be refreshed.`, false);
    } catch (e) {
      const reason = e?.message || "Repair estimate request could not be confirmed.";
      setSavedMessage("");
      await refreshEstimateState(selected.id, `Repair estimate request could not be confirmed: ${reason}.`, true);
    } finally { setBusy(""); }
  };

  const saveProgress = async () => {
    if (!selected) return;
    if (workRecovery?.workOrderId === selected.id) { setActionError("Check the current server state before saving progress again."); return; }
    const recovery = {workOrderId:selected.id,action:"save",requestId:newMechanicRequestId(),reason:"Progress-save request could not be confirmed."};
    setBusy("save"); setActionError(""); setSavedMessage("");
    try {
      const { data: result } = await base44.functions.invoke("fleetMechanicPortal", {
        action: "save", token, work_order_id: selected.id, expected_updated_date: selected.updated_date, request_id:recovery.requestId,
        actual_hours: form.actual_hours, corrective_action: form.corrective_action, mechanic_note: form.mechanic_note,
        photos: photos.map(({type, data}) => ({type, data})),
      });
      if (result?.error) throw new Error(result.error);
      if (result?.work_order) applyWorkOrderSnapshot(result.work_order);
      setWorkRecovery(null);
      setSavedMessage("Progress saved to CCS Fleet.");
      clearSavedProgressDraft(result?.work_order || selected);
    } catch (e) {
      const detail = e?.message || "Progress could not be saved.";
      await recoverWorkMutation({...recovery,reason:`Progress-save request could not be confirmed: ${detail}.`});
    } finally { setBusy(""); }
  };

  if (loading) return <Standalone><div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div></Standalone>;
  if (error) return <Standalone><div className="max-w-lg mx-auto px-4 py-16"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800"><AlertTriangle className="w-8 h-8 mb-3"/><h1 className="text-xl font-bold">Mechanic link unavailable</h1><p className="text-sm mt-2">{error}</p></div></div></Standalone>;

  return <Standalone portalName={data?.portal?.name}>
    <main className="max-w-5xl mx-auto px-4 pb-12">
      <div className="py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-950">Fleet Maintenance</h1><p className="text-sm text-slate-500 mt-1">Standalone mechanic portal · active CCS Fleet maintenance only</p></div>
        <button onClick={()=>load(true)} disabled={refreshing||!!busy} className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-50">{refreshing?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Refresh</button>
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
            <div className="flex items-start gap-3"><div className="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">{equipment?.photo_url?<img src={equipment.photo_url} alt="" className="w-full h-full object-cover"/>:<Truck className="w-5 h-5 text-slate-400"/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 items-center"><span className="font-semibold text-slate-950">{workOrder.work_order_number}</span><Pill>{pretty(workOrder.status)}</Pill>{["high","critical"].includes(workOrder.priority)&&<Pill attention>{pretty(workOrder.priority)}</Pill>}{workOrder.approval_block?.blocked&&<Pill attention>waiting approval</Pill>}</div><div className="text-base text-slate-800 mt-1">{workOrder.title}</div><div className="text-sm text-slate-500 mt-1">{equipment?.name || "Unlinked equipment"}{workOrder.projected_completion_date?` · Target ${fmtDate(workOrder.projected_completion_date)}`:""}</div></div></div>
          </button>;
        }) : <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">{tab==="active"?"No active Fleet maintenance jobs right now.":"No recently completed Fleet jobs."}</div>}
      </div>
    </main>

    {selected && <JobModal workOrder={selected} equipment={equipmentById[selected.equipment_id]} task={taskById[selected.maintenance_task_id]} form={form} setForm={setForm} photos={photos} setPhotos={setPhotos} onAddPhotos={addPhotos} onClose={closeJob} onStart={startJob} onSave={saveProgress} busy={busy} error={actionError} saved={savedMessage} workRecovery={workRecovery?.workOrderId===selected.id?workRecovery:null} onCheckWorkState={()=>recoverWorkMutation(workRecovery,workRecovery?.reason||"Previous mechanic work-order update was not confirmed.")} canEstimate={!!data?.portal?.capabilities?.estimates} estimate={estimateByWorkOrder[selected.id]||null} estimateForm={estimateForm} setEstimateForm={setEstimateForm} recoveryRequired={estimateRecovery?.workOrderId===selected.id} onSaveEstimate={()=>saveEstimate(false)} onSubmitEstimate={()=>saveEstimate(true)} onCheckEstimateState={()=>refreshEstimateState(selected.id,estimateRecovery?.reason||"Previous repair-estimate request was not confirmed.",true)}/>} 
  </Standalone>;
}

function Standalone({children, portalName = ""}) {
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="bg-slate-950 text-white"><div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><Wrench className="w-5 h-5"/></div><div><div className="font-bold leading-tight">CCS Fleet</div><div className="text-xs text-slate-300">{portalName || "Mechanic Portal"}</div></div></div></header>{children}<footer className="border-t border-slate-200 bg-white"><div className="max-w-5xl mx-auto px-4 py-4 text-xs text-slate-400 text-center">Standalone external mechanic portal · No access to CCS Signage Workflow navigation or administration</div></footer></div>;
}

function JobModal({workOrder,equipment,task,form,setForm,photos,setPhotos,onAddPhotos,onClose,onStart,onSave,busy,error,saved,workRecovery,onCheckWorkState,canEstimate,estimate,estimateForm,setEstimateForm,recoveryRequired,onSaveEstimate,onSubmitEstimate,onCheckEstimateState}) {
  const completed = workOrder.status === "completed";
  const approvalBlocked = !completed && workOrder.status !== "in_progress" && workOrder.approval_block?.blocked === true;
  const workRecoveryRequired = !!workRecovery;
  return <div className="fixed inset-0 z-[100] bg-black/60 p-3 sm:p-6 overflow-y-auto"><div className="max-w-3xl mx-auto rounded-2xl bg-white shadow-2xl overflow-hidden">
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-3"><div><div className="text-xs font-semibold text-slate-400">{workOrder.work_order_number}</div><h2 className="text-xl font-bold text-slate-950">{workOrder.title}</h2><div className="text-sm text-slate-500 mt-0.5">{equipment?.name || "Unlinked equipment"}</div></div><button onClick={onClose} disabled={!!busy||workRecoveryRequired} aria-label="Close work order" title={workRecoveryRequired?"Check current server state before closing this work order.":undefined} className="min-h-11 min-w-11 p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"><X className="w-5 h-5 mx-auto"/></button></div>
    <div className="p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap gap-2"><Pill>{pretty(workOrder.status)}</Pill><Pill>{pretty(workOrder.type)}</Pill><Pill attention={["high","critical"].includes(workOrder.priority)}>{pretty(workOrder.priority)} priority</Pill></div>
      {error&&<div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}{saved&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saved}</div>}
      {approvalBlocked&&<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"><div className="font-semibold inline-flex items-center gap-2"><Clock3 className="w-4 h-4"/>Waiting for CCS approval</div><div className="text-xs mt-1 text-amber-800">{workOrder.approval_block?.reason || "This job cannot start until CCS clears the repair estimate."}</div></div>}
      {workOrder.description && <Section title="Work Requested"><p className="text-sm whitespace-pre-wrap text-slate-700">{workOrder.description}</p></Section>}
      <div className="grid sm:grid-cols-2 gap-3"><Info label="Started" value={workOrder.started_date?fmtDate(workOrder.started_date):"Not started"}/><Info label="Target" value={fmtDate(workOrder.projected_completion_date)}/><Info label="Assigned" value={workOrder.assigned_to || "Unassigned"}/><Info label="Equipment status" value={pretty(equipment?.status)}/></div>
      {equipment && <Section title="Equipment"><div className="grid sm:grid-cols-2 gap-3"><Info label="Vehicle / asset" value={[equipment.year,equipment.make,equipment.model].filter(Boolean).join(" ") || pretty(equipment.type)}/><Info label="VIN / Serial" value={equipment.vin || equipment.serial_number || "—"}/><Info label="Location" value={equipment.location || "—"}/><Info label="Mileage / hours" value={equipment.mileage_hours ?? "—"}/></div>{equipment.engine_details&&<p className="text-sm text-slate-600 mt-3">{equipment.engine_details}</p>}</Section>}
      {task && <Section title="Maintenance Schedule"><div className="text-sm text-slate-700">{task.description || task.title}</div>{(task.parts_needed?.length||task.fluids_needed?.length)?<div className="grid sm:grid-cols-2 gap-3 mt-3"><Needed title="Parts needed" rows={(task.parts_needed||[]).map(row=>`${row.quantity ?? ""} ${row.part_name || "Part"}`)}/><Needed title="Fluids needed" rows={(task.fluids_needed||[]).map(row=>`${row.quantity ?? ""} ${row.unit || ""} ${row.fluid_type || "Fluid"}`)}/></div>:null}</Section>}
      {(workOrder.problem_photos?.length||workOrder.before_photos?.length||workOrder.after_photos?.length) ? <Section title="Job Photos"><PhotoGrid urls={[...(workOrder.problem_photos||[]),...(workOrder.before_photos||[]),...(workOrder.after_photos||[])]}/></Section> : null}
      {(workOrder.parts_used?.length||workOrder.fluids_used?.length) ? <Section title="Recorded Usage"><div className="grid sm:grid-cols-2 gap-3"><Needed title="Parts" rows={(workOrder.parts_used||[]).map(row=>`${row.quantity ?? ""} ${row.part_name || "Part"}`)}/><Needed title="Fluids" rows={(workOrder.fluids_used||[]).map(row=>`${row.quantity ?? ""} ${row.unit || ""} ${row.fluid_name || "Fluid"}`)}/></div></Section> : null}
      {workOrder.notes && <Section title="Existing Notes"><p className="text-sm whitespace-pre-wrap text-slate-600 max-h-48 overflow-auto">{workOrder.notes}</p></Section>}

      {canEstimate && <EstimateEditor estimate={estimate} form={estimateForm} setForm={setEstimateForm} completed={completed} busy={busy} recoveryRequired={recoveryRequired} onSave={onSaveEstimate} onSubmit={onSubmitEstimate} onCheckServerState={onCheckEstimateState}/>} 

      {!completed && <Section title="Mechanic Progress">
        {workRecoveryRequired&&<div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><div className="font-semibold">Current server state must be checked.</div><p className="mt-1 text-xs text-amber-800">Start Work, progress fields, notes, photos, and Save Progress are locked until CCS Fleet confirms whether the previous mechanic request was applied. Nothing will be replayed automatically.</p><button type="button" onClick={onCheckWorkState} disabled={busy==="work-recovery"} className="mt-3 min-h-11 w-full sm:w-auto px-4 rounded-xl border border-amber-500 bg-white font-semibold text-amber-900 inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==="work-recovery"?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Check Current Server State</button></div>}
        {workOrder.status!=="in_progress"&&<button onClick={onStart} disabled={!!busy||approvalBlocked||workRecoveryRequired} className="mb-4 w-full sm:w-auto min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy==="start"?<Loader2 className="w-4 h-4 animate-spin"/>:approvalBlocked?<Clock3 className="w-4 h-4"/>:<Activity className="w-4 h-4"/>}{approvalBlocked?"Waiting for CCS Approval":"Mark Work Started"}</button>}
        <fieldset disabled={approvalBlocked||workRecoveryRequired||!!busy} className="disabled:opacity-55">
          <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm"><span className="block text-xs font-semibold text-slate-500 mb-1">Labor hours</span><input type="number" min="0" step="0.25" value={form.actual_hours} onChange={e=>setForm(prev=>({...prev,actual_hours:e.target.value}))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5"/></label><div className="text-xs text-slate-500 flex items-end pb-2"><Clock3 className="w-4 h-4 mr-1.5"/>CCS staff performs final completion and inventory posting.</div></div>
          <label className="block text-sm mt-4"><span className="block text-xs font-semibold text-slate-500 mb-1">Corrective action / work performed</span><textarea rows={5} value={form.corrective_action} onChange={e=>setForm(prev=>({...prev,corrective_action:e.target.value}))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Describe the repair or service performed…"/></label>
          <label className="block text-sm mt-4"><span className="block text-xs font-semibold text-slate-500 mb-1">Add mechanic note</span><textarea rows={3} value={form.mechanic_note} onChange={e=>setForm(prev=>({...prev,mechanic_note:e.target.value}))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="This note is appended with your portal name and timestamp."/></label>
          <div className="mt-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-500">After photos</span><label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 cursor-pointer"><Camera className="w-4 h-4"/>Add photos<input type="file" accept="image/*" multiple className="hidden" onChange={onAddPhotos}/></label></div>{photos.length>0&&<div className="grid grid-cols-3 gap-2 mt-2">{photos.map((photo,index)=><div key={`${photo.name}-${index}`} className="relative aspect-square"><img src={photo.preview} alt="" className="w-full h-full object-cover rounded-xl"/><button onClick={()=>{URL.revokeObjectURL(photo.preview);setPhotos(prev=>prev.filter((_,i)=>i!==index));}} className="absolute top-1 right-1 rounded-full bg-black/70 text-white p-1"><X className="w-3.5 h-3.5"/></button></div>)}</div>}</div>
          <button onClick={onSave} disabled={!!busy||approvalBlocked} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy==="save"?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>}Save Progress</button>
        </fieldset>
      </Section>}
      {completed&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Completed {workOrder.completed_date?fmtDate(workOrder.completed_date):""}. This record is read-only in the mechanic portal.</div>}
    </div>
  </div></div>;
}

function EstimateEditor({estimate,form,setForm,completed,busy,recoveryRequired,onSave,onSubmit,onCheckServerState}) {
  if (estimate && estimate.visibility !== "mechanic") {
    const message = estimate.visibility === "conflict" ? "CCS has detected conflicting estimate records for this work order. Estimate entry is locked until CCS resolves them." : estimate.visibility === "other_mechanic" ? "Another mechanic portal already owns the repair estimate for this work order. Its pricing is intentionally hidden." : "CCS is managing an internal repair estimate for this work order. Internal pricing is intentionally hidden from the mechanic portal.";
    return <Section title="Repair Estimate"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{message}</div></Section>;
  }
  const status = estimate?.status || "draft";
  const editable = !completed && (!estimate || ["draft","changes_requested"].includes(status));
  const safeEditable = editable && !recoveryRequired;
  const total = estimateTotal(form);
  const set = (key,value) => setForm(current=>({...current,[key]:value}));
  const addLine = kind => setForm(current=>({...current,[kind]:[...(current[kind]||[]),kind==="fluids_estimate"?{description:"",quantity:"1",unit:"",estimated_cost:""}:{description:"",quantity:"1",estimated_cost:""}]}));
  const updateLine = (kind,index,key,value) => setForm(current=>({...current,[kind]:(current[kind]||[]).map((line,i)=>i===index?{...line,[key]:value}:line)}));
  const removeLine = (kind,index) => setForm(current=>({...current,[kind]:(current[kind]||[]).filter((_,i)=>i!==index)}));
  const statusTone = status === "approved" ? "bg-emerald-100 text-emerald-700" : status === "submitted" ? "bg-blue-100 text-blue-700" : status === "rejected" ? "bg-red-100 text-red-700" : status === "changes_requested" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
  return <Section title="Repair Estimate">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusTone}`}>{pretty(status)}</span>{estimate?.approval_tier&&<span className="text-xs text-slate-500">Approval tier: {estimate.approval_tier}</span>}</div><p className="text-xs text-slate-500 mt-2">This is your mechanic quote for this Fleet work order only. CCS approval rules are applied by the server when it is submitted.</p></div><div className="sm:text-right"><div className="text-xs text-slate-400">Estimated total</div><div className="text-2xl font-bold text-slate-950">{total.toLocaleString(undefined,{style:"currency",currency:"USD"})}</div></div></div>
    {estimate?.decision_notes&&["changes_requested","rejected"].includes(status)&&<div className={`mt-3 rounded-xl border p-3 text-sm ${status==="rejected"?"border-red-200 bg-red-50 text-red-800":"border-amber-200 bg-amber-50 text-amber-800"}`}><b>{status==="rejected"?"CCS decision":"Changes requested"}:</b> {estimate.decision_notes}</div>}
    {recoveryRequired&&<div role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><div className="font-semibold">Current server ownership must be checked.</div><p className="mt-1 text-xs text-amber-800">Estimate fields and submit actions are locked until CCS Fleet confirms who owns the current server record. Nothing will be resubmitted automatically.</p><button type="button" onClick={onCheckServerState} disabled={busy==="estimate-refresh"} className="mt-3 min-h-11 w-full sm:w-auto px-4 rounded-xl border border-amber-500 bg-white font-semibold text-amber-900 inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==="estimate-refresh"?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Check Current Server State</button></div>}
    <fieldset disabled={!safeEditable||!!busy} className="mt-4 space-y-4 disabled:opacity-70">
      <div className="grid sm:grid-cols-3 gap-3"><EstimateField label="Estimated labor hours"><input type="number" min="0" step="0.25" value={form.estimated_labor_hours} onChange={e=>set("estimated_labor_hours",e.target.value)} className="estimate-field"/></EstimateField><EstimateField label="Labor rate / hr"><input type="number" min="0" step="0.01" value={form.labor_rate} onChange={e=>set("labor_rate",e.target.value)} className="estimate-field"/></EstimateField><EstimateField label="Target completion"><input type="date" value={form.estimated_completion_date} onChange={e=>set("estimated_completion_date",e.target.value)} className="estimate-field"/></EstimateField></div>
      <EstimateLines title="Parts estimate" rows={form.parts_estimate||[]} kind="parts_estimate" editable={safeEditable} onAdd={()=>addLine("parts_estimate")} onUpdate={updateLine} onRemove={removeLine}/>
      <EstimateLines title="Fluids estimate" rows={form.fluids_estimate||[]} kind="fluids_estimate" fluid editable={safeEditable} onAdd={()=>addLine("fluids_estimate")} onUpdate={updateLine} onRemove={removeLine}/>
      <div className="grid sm:grid-cols-2 gap-3"><EstimateField label="Miscellaneous"><input type="number" min="0" step="0.01" value={form.misc_total} onChange={e=>set("misc_total",e.target.value)} className="estimate-field"/></EstimateField><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">Server recalculates all totals</div><div className="text-lg font-bold text-slate-900 mt-1">{total.toLocaleString(undefined,{style:"currency",currency:"USD"})}</div></div></div>
      <EstimateField label="Estimate notes"><textarea rows={3} value={form.notes} onChange={e=>set("notes",e.target.value)} className="estimate-field" placeholder="Scope assumptions, exclusions, lead times, etc."/></EstimateField>
    </fieldset>
    {safeEditable&&<div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end"><button type="button" onClick={onSave} disabled={!!busy} className="min-h-11 px-4 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==="estimate-save"?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>}Save Draft</button><button type="button" onClick={onSubmit} disabled={!!busy} className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy==="estimate-submit"?<Loader2 className="w-4 h-4 animate-spin"/>:<CircleDollarSign className="w-4 h-4"/>}Submit Estimate</button></div>}
    {!editable&&estimate?.visibility==="mechanic"&&<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{status==="submitted"?"Submitted to CCS and waiting for an approval decision.":status==="approved"?"CCS Fleet has approved this estimate.":status==="rejected"?"CCS Fleet rejected this estimate. Contact CCS before changing the quote.":"This estimate is read-only."}</div>}
    <style>{`.estimate-field{width:100%;min-height:44px;border:1px solid rgb(203 213 225);border-radius:.75rem;padding:.625rem .75rem;background:white}`}</style>
  </Section>;
}

function EstimateLines({title,rows,kind,fluid=false,editable,onAdd,onUpdate,onRemove}) { return <div><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold text-slate-500">{title}</div>{editable&&<button type="button" onClick={onAdd} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700"><Plus className="w-3.5 h-3.5"/>Add line</button>}</div><div className="mt-2 space-y-2">{rows.map((line,index)=><div key={`${kind}-${index}`} className="rounded-xl border border-slate-200 p-3"><div className={`grid gap-2 ${fluid?"sm:grid-cols-[minmax(0,1fr)_80px_100px_120px_auto]":"sm:grid-cols-[minmax(0,1fr)_90px_120px_auto]"}`}><input value={line.description||""} onChange={e=>onUpdate(kind,index,"description",e.target.value)} className="estimate-field" placeholder={fluid?"Fluid / material":"Part / material"}/><input type="number" min="0" step="0.01" value={line.quantity??""} onChange={e=>onUpdate(kind,index,"quantity",e.target.value)} className="estimate-field" placeholder="Qty"/>{fluid&&<input value={line.unit||""} onChange={e=>onUpdate(kind,index,"unit",e.target.value)} className="estimate-field" placeholder="Unit"/>}<input type="number" min="0" step="0.01" value={line.estimated_cost??""} onChange={e=>onUpdate(kind,index,"estimated_cost",e.target.value)} className="estimate-field" placeholder="Unit $"/>{editable&&<button type="button" onClick={()=>onRemove(kind,index)} className="min-h-11 min-w-11 rounded-xl border border-red-200 text-red-600" aria-label={`Remove ${title} line`}><Trash2 className="w-4 h-4 mx-auto"/></button>}</div><div className="text-right text-xs text-slate-500 mt-1">Line: {(Number(line.quantity||0)*Number(line.estimated_cost||0)).toLocaleString(undefined,{style:"currency",currency:"USD"})}</div></div>)}{!rows.length&&<div className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-400">No {fluid?"fluid":"part"} lines.</div>}</div></div>; }
function EstimateField({label,children}) { return <label className="block text-sm"><span className="block text-xs font-semibold text-slate-500 mb-1">{label}</span>{children}</label>; }

function Summary({label,value,icon:Icon}) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="w-5 h-5 text-slate-400"/><div className="text-2xl font-bold mt-2">{value}</div><div className="text-xs text-slate-500 mt-0.5">{label}</div></div>; }
function Tab({active,onClick,children}) { return <button onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-semibold ${active?"bg-slate-950 text-white":"bg-white border border-slate-300 text-slate-700"}`}>{children}</button>; }
function Pill({children,attention=false}) { return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${attention?"bg-red-100 text-red-700":"bg-slate-100 text-slate-600"}`}>{children}</span>; }
function Section({title,children}) { return <section className="rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-950 mb-3">{title}</h3>{children}</section>; }
function Info({label,value}) { return <div><div className="text-xs text-slate-400">{label}</div><div className="text-sm font-medium text-slate-800 mt-0.5 capitalize">{value}</div></div>; }
function Needed({title,rows}) { return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-500">{title}</div>{rows.length?<ul className="mt-2 space-y-1 text-sm text-slate-700">{rows.map((row,i)=><li key={i}>• {row}</li>)}</ul>:<div className="text-sm text-slate-400 mt-2">None recorded</div>}</div>; }
function PhotoGrid({urls}) { return <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{urls.map((url,i)=><a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer" className="aspect-square block"><img src={url} alt="Job" className="w-full h-full object-cover rounded-xl border border-slate-200"/></a>)}</div>; }
