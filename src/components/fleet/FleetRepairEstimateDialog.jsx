import { useEffect, useMemo, useRef, useState } from "react";
import { attemptEstimateChangeRefresh } from "@/components/fleet/fleetWorkOrderRefresh";
import { AlertTriangle, CheckCircle2, DollarSign, Loader2, Plus, Send, ThumbsDown, Trash2, X } from "lucide-react";
import { invokeFleet } from "@/components/fleet/fleetInvoke";

const EMPTY = {
  estimated_labor_hours: "",
  labor_rate: "",
  misc_total: "",
  estimated_completion_date: "",
  parts_estimate: [],
  fluids_estimate: [],
  notes: "",
};
const money = value => `$${Number(value || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const pretty = value => String(value || "—").replaceAll("_"," ");

export default function FleetRepairEstimateDialog({ open, workOrder, equipmentName = "", parts = [], fluids = [], onClose, onChanged }) {
  const [estimate, setEstimate] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [decisionUncertain, setDecisionUncertain] = useState(null);
  const [loadedWorkOrderId, setLoadedWorkOrderId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const resultRef = useRef(null);
  const warningRef = useRef(null);
  const retryLoadRef = useRef(null);
  const retrySucceededFocusRef = useRef(false);
  const recheckRef = useRef(null);
  const loadEpochRef = useRef(0);
  const focusResultOnSettle = useRef(false);
  const previousFocus = useRef(null);
  const closeCallback = useRef(onClose);
  const busyState = useRef(busy);
  closeCallback.current = onClose;
  busyState.current = busy;
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const handleKey = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyState.current) closeCallback.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')].filter(el => el.getClientRects().length);
      if (!controls.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current.contains(active) || active === dialogRef.current || active === resultRef.current || active === warningRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || busy || loading || !focusResultOnSettle.current) return;
    const target = refreshWarning ? warningRef.current : message ? resultRef.current : null;
    if (target) { target.focus(); focusResultOnSettle.current = false; }
  }, [open, busy, loading, refreshWarning, message]);

  // A failed GET must never expose blank/stale fields for mutation. Discard
  // responses from a prior dialog session or an older verification request.
  const load = async (recheckSubmission = false) => {
    if (!workOrder?.id) return;
    const epoch = ++loadEpochRef.current;
    setLoading(true); setError(""); setRefreshWarning("");
    if (!recheckSubmission) { setLoadedWorkOrderId(""); setLoadFailed(false); setMessage(""); }
    try {
      const { data } = await invokeFleet("fleetRepairEstimateAction", { action: "get", work_order_id: workOrder.id });
      if (epoch !== loadEpochRef.current) return;
      if (data?.error) throw new Error(data.error);
      if (!data || !Object.prototype.hasOwnProperty.call(data, "estimate")) throw new Error("The server did not return an estimate status.");
      const row = data.estimate || null;
      // A transport failure during submit can mean the server committed it.
      // Confirm the precise draft version before unlocking a retry.
      if (recheckSubmission && (!row || row.id !== estimate?.id ||
          (row.status === "draft" && row.updated_date !== estimate?.updated_date))) {
        throw new Error("The saved estimate cannot be reconciled with the current server version. Close and reopen to review it.");
      }
      setEstimate(row);
      setDecisionNotes(row?.decision_notes || "");
      setForm(row ? {
        estimated_labor_hours: row.estimated_labor_hours ?? "",
        labor_rate: row.labor_rate ?? "",
        misc_total: row.misc_total ?? "",
        estimated_completion_date: row.estimated_completion_date || "",
        parts_estimate: Array.isArray(row.parts_estimate) ? row.parts_estimate.map(line => ({...line})) : [],
        fluids_estimate: Array.isArray(row.fluids_estimate) ? row.fluids_estimate.map(line => ({...line})) : [],
        notes: row.notes || "",
      } : EMPTY);
      setLoadedWorkOrderId(workOrder.id);
      setLoadFailed(false);
      if (recheckSubmission) {
        setSubmissionUncertain(false);
        setMessage(row.status === "draft"
          ? "Server confirms this estimate remains a draft. Review it before submitting again."
          : `Server confirms this estimate is ${pretty(row.status)}. No submission was repeated.`);
        focusResultOnSettle.current = true;
        await reportChanged(row, "Estimate status confirmed");
      }
    } catch (err) {
      if (epoch !== loadEpochRef.current) return;
      setError(recheckSubmission
        ? `${err?.message || "Unable to check submission status."} Submission remains unconfirmed; do not repeat it.`
        : `${err?.message || "Unable to load the Fleet repair estimate."} Retry loading before making changes.`);
      if (!recheckSubmission) setLoadFailed(true);
    } finally { if (epoch === loadEpochRef.current) setLoading(false); }
  };

  useEffect(() => {
    if (open) {
      setEstimate(null); setForm(EMPTY); setDecisionNotes("");
      focusResultOnSettle.current = false;
      retrySucceededFocusRef.current = false;
      setSubmissionUncertain(false); setDecisionUncertain(null); setLoadFailed(false);
      load();
    }
    return () => { loadEpochRef.current += 1; };
  }, [open, workOrder?.id]);
  useEffect(() => {
    if (open && loadFailed && !loading) retryLoadRef.current?.focus();
  }, [open, loadFailed, loading]);
  useEffect(() => {
    if (open && (submissionUncertain || decisionUncertain) && error && !loading) recheckRef.current?.focus();
  }, [open, submissionUncertain, decisionUncertain, error, loading]);
  useEffect(() => {
    if (!open || loading || loadFailed || !retrySucceededFocusRef.current || loadedWorkOrderId !== workOrder?.id) return;
    closeRef.current?.focus();
    retrySucceededFocusRef.current = false;
  }, [open, loading, loadFailed, loadedWorkOrderId, workOrder?.id]);
  const preview = useMemo(() => {
    const labor = Number(form.estimated_labor_hours || 0) * Number(form.labor_rate || 0);
    const partsTotal = (form.parts_estimate || []).reduce((sum,line)=>sum + Number(line.quantity||0)*Number(line.estimated_cost||0),0);
    const fluidsTotal = (form.fluids_estimate || []).reduce((sum,line)=>sum + Number(line.quantity||0)*Number(line.estimated_cost||0),0);
    const misc = Number(form.misc_total || 0);
    return { labor, partsTotal, fluidsTotal, misc, total:labor+partsTotal+fluidsTotal+misc };
  },[form]);
  if (!open) return null;
  const locked = ["submitted","approved","rejected"].includes(estimate?.status);
  const verified = loadedWorkOrderId === workOrder?.id;
  const decisionBlocked = loading || loadFailed || !verified || submissionUncertain || !!decisionUncertain || !!busy;
  const editBlocked = locked || decisionBlocked;
  const set = (key,value) => { setMessage(""); setForm(prev=>({...prev,[key]:value})); };
  const setLine = (kind,index,key,value) => setForm(prev=>({...prev,[kind]:prev[kind].map((line,i)=>i===index?{...line,[key]:value}:line)}));
  const removeLine = (kind,index) => setForm(prev=>({...prev,[kind]:prev[kind].filter((_,i)=>i!==index)}));
  const addPart = () => set("parts_estimate",[...form.parts_estimate,{description:"",quantity:1,estimated_cost:0}]);
  const addFluid = () => set("fluids_estimate",[...form.fluids_estimate,{description:"",quantity:1,unit:"quarts",estimated_cost:0}]);
  // A list refresh is not part of the server mutation. Never tell an admin to
  // repeat an acknowledged save or approval just because the list is stale.
  const reportChanged = async (row, verb) => {
    const refreshed = await attemptEstimateChangeRefresh(onChanged, row);
    if (!refreshed) {
      setRefreshWarning(`${verb}, but the Fleet work-order list could not refresh. Close this estimate and use Retry refresh; do not repeat the operation.`);
    }
    return refreshed;
  };
  const save = async submitAfter => {
    if (editBlocked) return;
    setBusy(submitAfter ? "submit" : "save"); setError(""); setMessage(""); setRefreshWarning("");
    try {
      const { data } = await invokeFleet("fleetRepairEstimateAction", { action:"save", work_order_id:workOrder.id, expected_updated_date:estimate?.updated_date || "", estimate:form });
      if (data?.error) throw new Error(data.error);
      let row = data?.estimate;
      if (!row) throw new Error("The save response did not include an estimate. Refresh before attempting another save.");
      // Record the acknowledged draft immediately: submit can fail independently.
      setEstimate(row);
      if (submitAfter) {
        try {
          const response = await invokeFleet("fleetRepairEstimateAction", { action:"submit", work_order_id:workOrder.id, expected_updated_date:row.updated_date || "" });
          if (response?.data?.error) throw new Error(response.data.error);
          if (!response?.data?.estimate) throw new Error("Submission response did not include the updated estimate.");
          row = response.data.estimate;
          setEstimate(row);
          setMessage(response.data.auto_approved ? "Estimate saved and automatically approved by the Fleet approval policy." : "Estimate submitted for approval.");
        } catch {
          setSubmissionUncertain(true);
          setMessage("Repair estimate draft saved; submission could not be confirmed. Check current server status before attempting any further changes.");
          focusResultOnSettle.current = true;
          if (!(await reportChanged(row, "Draft saved"))) focusResultOnSettle.current = true;
          return;
        }
      } else setMessage("Repair estimate draft saved.");
      if (submitAfter) focusResultOnSettle.current = true;
      if (!(await reportChanged(row, submitAfter ? "Estimate submitted" : "Draft saved"))) focusResultOnSettle.current = true;
    } catch (err) { setError(err?.message || "Unable to save the Fleet repair estimate."); }
    finally { setBusy(""); }
  };
  const recheckDecision = async () => {
    if (!decisionUncertain || !workOrder?.id || loading || busy) return;
    const epoch = ++loadEpochRef.current;
    setLoading(true); setError(""); setRefreshWarning("");
    try {
      const { data } = await invokeFleet("fleetRepairEstimateAction", { action:"get", work_order_id:workOrder.id });
      if (epoch !== loadEpochRef.current) return;
      if (data?.error) throw new Error(data.error);
      if (!data || !Object.prototype.hasOwnProperty.call(data, "estimate")) throw new Error("The server did not return an estimate status.");
      const row = data.estimate || null;
      if (!row || row.id !== estimate?.id) throw new Error("The current estimate cannot be reconciled with the unconfirmed decision.");
      const committed = row.status === decisionUncertain.decision;
      const definitelyNotCommitted = row.status === "submitted" && row.updated_date === decisionUncertain.expected_updated_date;
      if (!committed && !definitelyNotCommitted) throw new Error("The estimate changed while the approval response was uncertain. Close and reopen to review the current server record.");
      setEstimate(row);
      setDecisionNotes(row?.decision_notes || "");
      setLoadedWorkOrderId(workOrder.id);
      setDecisionUncertain(null);
      setMessage(committed
        ? `Server confirms the estimate is ${pretty(row.status)}. The decision was not repeated.`
        : "Server confirms the approval decision was not recorded. Review it before trying again.");
      focusResultOnSettle.current = true;
      if (committed && !(await reportChanged(row, `Estimate ${pretty(row.status)}`))) focusResultOnSettle.current = true;
    } catch (err) {
      if (epoch !== loadEpochRef.current) return;
      setError(`${err?.message || "Unable to check approval status."} The decision remains unconfirmed; do not repeat it.`);
    } finally { if (epoch === loadEpochRef.current) setLoading(false); }
  };
  const decide = async decision => {
    if (decisionBlocked) return;
    const expectedUpdatedDate = estimate?.updated_date || "";
    setBusy(decision); setError(""); setMessage(""); setRefreshWarning("");
    try {
      const {data}=await invokeFleet("fleetRepairEstimateAction",{action:"decide",work_order_id:workOrder.id,expected_updated_date:expectedUpdatedDate,decision,decision_notes:decisionNotes});
      if(data?.error)throw new Error(data.error);
      if (!data?.estimate) throw new Error("The approval response did not include an estimate. Refresh before retrying.");
      setEstimate(data.estimate);
      setMessage(`Estimate ${pretty(decision)}.`);
      focusResultOnSettle.current = true;
      if (!(await reportChanged(data.estimate, `Estimate ${pretty(decision)}`))) focusResultOnSettle.current = true;
    } catch(err){
      setDecisionUncertain({ decision, expected_updated_date: expectedUpdatedDate });
      setError(`${err?.message || "Unable to confirm the approval decision."} Check current server status before attempting another decision.`);
    }
    finally{setBusy("");}
  };

  return <div className="fixed inset-0 z-[120] bg-black/60 p-2 sm:p-4 overflow-y-auto">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fleet-repair-estimate-title" aria-describedby="fleet-repair-estimate-description" tabIndex={-1} className="mx-auto w-full max-w-5xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl overflow-x-hidden overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-200 dark:border-slate-800 px-4 sm:px-5 py-4 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-indigo-600"/><h2 id="fleet-repair-estimate-title" className="text-lg font-bold">Repair Estimate & Approval</h2></div><p id="fleet-repair-estimate-description" className="text-xs text-gray-500 dark:text-slate-400 mt-1">{workOrder?.work_order_number} · {equipmentName || "Fleet equipment"} · Fleet-only financial planning</p></div><button type="button" ref={closeRef} type="button" onClick={onClose} disabled={!!busy} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Close repair estimate"><X className="w-5 h-5 mx-auto"/></button></div>
      <div className="p-4 sm:p-5 space-y-5">
        {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {message&&<div ref={resultRef} tabIndex={-1} role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 focus-visible:outline-2 focus-visible:outline-indigo-500">{message}</div>}
        {refreshWarning&&<div ref={warningRef} tabIndex={-1} role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 focus-visible:outline-2 focus-visible:outline-indigo-500">{refreshWarning}</div>}
        {loading || (!verified && !loadFailed) ? <div role="status" aria-label="Loading repair estimate" className="py-16 flex justify-center"><Loader2 aria-hidden="true" className="w-7 h-7 animate-spin text-gray-400"/></div> : loadFailed ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"><p className="mb-3 text-sm text-amber-900 dark:text-amber-200">Estimate data is unavailable. Editing and approval are disabled until the current server record loads.</p><button type="button" ref={retryLoadRef} type="button" onClick={() => { retrySucceededFocusRef.current = true; load(); }} className="min-h-11 px-4 rounded-lg border border-amber-500 font-semibold focus-visible:outline-2 focus-visible:outline-indigo-500">Retry loading estimate</button></div> : <>
          {submissionUncertain && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"><p className="mb-3 text-sm font-semibold text-amber-900 dark:text-amber-200">Submission status is unconfirmed. Changes and approval are paused until the server is checked.</p><button type="button" ref={recheckRef} type="button" onClick={() => load(true)} className="min-h-11 px-4 rounded-lg border border-amber-500 font-semibold focus-visible:outline-2 focus-visible:outline-indigo-500">Check current server status</button></div>}
          {decisionUncertain && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"><p className="mb-3 text-sm font-semibold text-amber-900 dark:text-amber-200">The {pretty(decisionUncertain.decision)} decision is unconfirmed. Approval actions are paused until the current server record is checked.</p><button type="button" ref={recheckRef} type="button" onClick={recheckDecision} className="min-h-11 px-4 rounded-lg border border-amber-500 font-semibold focus-visible:outline-2 focus-visible:outline-indigo-500">Check approval decision status</button></div>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><Stat label="Estimate status" value={pretty(estimate?.status||"draft")} /><Stat label="Approval tier" value={estimate?.approval_tier||"No matching tier"}/><Stat label="Approval required" value={estimate?.approval_required?"Yes":"No"} attention={estimate?.approval_required&&estimate?.status!=="approved"}/><Stat label="Estimated total" value={money(estimate?.estimated_total ?? preview.total)} /></div>
          {estimate?.approval_required&&estimate.status!=="approved"&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300 flex items-start gap-2"><AlertTriangle className="w-5 h-5 shrink-0"/><div><b>Approval gate active.</b> This work order cannot be started or completed until this estimate is approved.</div></div>}
          <section className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-4"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><Field label="Labor hours"><input type="number" min="0" step="0.1" value={form.estimated_labor_hours} disabled={editBlocked} onChange={e=>set("estimated_labor_hours",e.target.value)} className="field"/></Field><Field label="Labor rate"><input type="number" min="0" step="0.01" value={form.labor_rate} disabled={editBlocked} onChange={e=>set("labor_rate",e.target.value)} className="field"/></Field><Field label="Miscellaneous"><input type="number" min="0" step="0.01" value={form.misc_total} disabled={editBlocked} onChange={e=>set("misc_total",e.target.value)} className="field"/></Field><Field label="Estimated completion"><input type="date" value={form.estimated_completion_date} disabled={editBlocked} onChange={e=>set("estimated_completion_date",e.target.value)} className="field"/></Field></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><MoneyMini label="Labor" value={preview.labor}/><MoneyMini label="Parts" value={preview.partsTotal}/><MoneyMini label="Fluids" value={preview.fluidsTotal}/><MoneyMini label="Total" value={preview.total} strong/></div></section>
          <EstimateLines title="Parts estimate" rows={form.parts_estimate} kind="parts_estimate" disabled={editBlocked} suggestions={parts.map(p=>[p.part_name,p.part_number,p.manufacturer].filter(Boolean).join(" · "))} onAdd={addPart} onSet={setLine} onRemove={removeLine}/>
          <EstimateLines title="Fluids estimate" rows={form.fluids_estimate} kind="fluids_estimate" fluid disabled={editBlocked} suggestions={fluids.map(f=>[f.fluid_name,f.brand,f.viscosity].filter(Boolean).join(" · "))} onAdd={addFluid} onSet={setLine} onRemove={removeLine}/>
          <Field label="Estimate notes"><textarea rows={4} value={form.notes} disabled={editBlocked} onChange={e=>set("notes",e.target.value)} className="field" placeholder="Scope assumptions, vendor quote references, exclusions, expected turnaround…"/></Field>
          {estimate?.submitted_at&&<div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 text-xs text-gray-500 dark:text-slate-400">Submitted {new Date(estimate.submitted_at).toLocaleString()} by {estimate.submitted_by_email||"—"}{estimate.decision_at?` · Decision ${new Date(estimate.decision_at).toLocaleString()} by ${estimate.decision_by_email||"—"}`:""}{estimate.decision_notes?<div className="mt-2 text-sm text-gray-700 dark:text-slate-200">{estimate.decision_notes}</div>:null}</div>}
          {estimate?.status==="submitted"&&<section className="rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/20 p-4"><label htmlFor="fleet-estimate-decision-notes" className="block font-bold text-indigo-900 dark:text-indigo-100">Approval decision notes (optional)</label><textarea id="fleet-estimate-decision-notes" rows={3} value={decisionNotes} onChange={e=>setDecisionNotes(e.target.value)} className="field mt-2" placeholder="Optional approval/rejection notes"/><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>decide("approved")} disabled={decisionBlocked} className="min-h-11 px-4 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/>Approve</button><button type="button" onClick={()=>decide("changes_requested")} disabled={decisionBlocked} className="min-h-11 px-4 rounded-lg border border-amber-300 text-amber-700 dark:text-amber-300 font-semibold">Request Changes</button><button type="button" onClick={()=>decide("rejected")} disabled={decisionBlocked} className="min-h-11 px-4 rounded-lg border border-red-300 text-red-700 dark:text-red-300 font-semibold inline-flex items-center gap-2"><ThumbsDown className="w-4 h-4"/>Reject</button></div></section>}
          {estimate?.status==="changes_requested"&&<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">Changes were requested. Edit the estimate values, save the draft, then submit it again.</div>}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{!locked && !submissionUncertain ? <><button type="button" onClick={()=>save(false)} disabled={editBlocked} className="min-h-11 px-4 rounded-lg border border-gray-300 dark:border-slate-700 font-semibold">{busy==="save"?"Saving…":"Save Draft"}</button><button type="button" onClick={()=>save(true)} disabled={editBlocked} className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2">{busy==="submit"?<Loader2 className="w-4 h-4 animate-spin"/>:<Send className="w-4 h-4"/>}Save & Submit</button></>:null}</div>
        </>}
      </div>
      <style>{`.field{width:100%;min-height:44px;border:1px solid rgb(209 213 219);border-radius:.6rem;padding:.6rem .72rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}.field:focus-visible{outline:2px solid rgb(79 70 229);outline-offset:2px}button:focus-visible{outline:2px solid rgb(79 70 229);outline-offset:2px}.field:disabled{opacity:.65;background:rgb(249 250 251)}.dark .field:disabled{background:rgb(30 41 59)}`}</style>
    </div>
  </div>;
}

function EstimateLines({title,rows,kind,fluid=false,disabled=false,suggestions=[],onAdd,onSet,onRemove}){const listId=`${kind}-suggestions`;return <section className="rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div className="flex items-center justify-between gap-3"><div className="font-bold text-gray-900 dark:text-slate-100">{title}</div>{!disabled&&<button type="button" onClick={onAdd} className="min-h-11 px-3 rounded-lg text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><Plus className="w-4 h-4"/>Add line</button>}</div><datalist id={listId}>{suggestions.map(value=><option key={value} value={value}/>)}</datalist><div className="mt-3 space-y-2">{rows.map((line,index)=><div key={index} className={`grid gap-2 items-end ${fluid?"sm:grid-cols-[minmax(0,1fr)_90px_100px_130px_44px]":"sm:grid-cols-[minmax(0,1fr)_90px_130px_44px]"}`}><Field label="Description"><input list={listId} value={line.description||""} disabled={disabled} onChange={e=>onSet(kind,index,"description",e.target.value)} className="field"/></Field><Field label="Qty"><input type="number" min="0" step="0.01" value={line.quantity??0} disabled={disabled} onChange={e=>onSet(kind,index,"quantity",e.target.value)} className="field"/></Field>{fluid&&<Field label="Unit"><input value={line.unit||""} disabled={disabled} onChange={e=>onSet(kind,index,"unit",e.target.value)} className="field"/></Field>}<Field label="Unit cost"><input type="number" min="0" step="0.01" value={line.estimated_cost??0} disabled={disabled} onChange={e=>onSet(kind,index,"estimated_cost",e.target.value)} className="field"/></Field>{!disabled&&<button type="button" onClick={()=>onRemove(kind,index)} aria-label={`Remove ${title} line ${index + 1}`} className="min-h-11 min-w-11 rounded-lg border border-gray-200 dark:border-slate-700 text-red-500 flex items-center justify-center"><Trash2 className="w-4 h-4"/></button>}</div>)}{rows.length===0&&<div className="text-xs text-gray-400 py-3">No line items.</div>}</div></section>}
function Field({label,children}){return <label className="block"><span className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>}
function Stat({label,value,attention=false}){return <div className={`rounded-xl border p-3 ${attention?"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20":"border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/40"}`}><div className="text-[10px] uppercase font-bold text-gray-400">{label}</div><div className={`mt-1 font-bold capitalize ${attention?"text-amber-700 dark:text-amber-300":"text-gray-900 dark:text-slate-100"}`}>{value}</div></div>}
function MoneyMini({label,value,strong=false}){return <div className={`rounded-lg p-2 ${strong?"bg-indigo-50 dark:bg-indigo-950/30":"bg-gray-50 dark:bg-slate-800/50"}`}><div className="text-[10px] uppercase font-bold text-gray-400">{label}</div><div className={`mt-1 font-bold ${strong?"text-indigo-700 dark:text-indigo-300":"text-gray-900 dark:text-slate-100"}`}>{money(value)}</div></div>}
