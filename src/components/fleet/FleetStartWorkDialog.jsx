import { useEffect, useRef, useState } from "react";
import { easternTodayText } from "@/components/fleet/fleetHelpers";
import { Loader2, Play, X } from "lucide-react";
import { CcsDateField } from "@/components/ui/ccs-date-field";

function addDaysText(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultProjected(priority) {
  const today = easternTodayText();
  if (priority === "critical") return addDaysText(today, 1);
  if (priority === "high") return addDaysText(today, 3);
  if (priority === "low") return addDaysText(today, 14);
  return addDaysText(today, 7);
}

export default function FleetStartWorkDialog({ open, workOrder, busy, error, onClose, onConfirm }) {
  const [projectedDate, setProjectedDate] = useState("");
  const [planningNotes, setPlanningNotes] = useState("");
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const openerRef = useRef(null);
  const closeCallbackRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeCallbackRef.current = onClose;
  busyRef.current = busy;
  const visible = Boolean(open && workOrder);

  useEffect(() => {
    if (!visible) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeCallbackRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
        .filter(element => element instanceof HTMLElement && element.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current.contains(active) || active === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [visible]);

  useEffect(() => {
    if (!open || !workOrder) return;
    setProjectedDate(workOrder.projected_completion_date || defaultProjected(workOrder.priority));
    setPlanningNotes("");
  }, [open, workOrder]);

  if (!open || !workOrder) return null;
  const today = easternTodayText();
  const quick = [
    ["Today", today],
    ["Tomorrow", addDaysText(today, 1)],
    ["3 Days", addDaysText(today, 3)],
    ["1 Week", addDaysText(today, 7)],
    ["2 Weeks", addDaysText(today, 14)],
  ];

  return (
    <div ref={dialogRef} className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-labelledby="fleet-start-work-title" aria-describedby="fleet-start-work-description" tabIndex={-1}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-slate-800">
          <div>
            <h2 id="fleet-start-work-title" className="flex items-center gap-2 font-bold text-gray-900 dark:text-slate-100"><Play className="h-5 w-5 text-indigo-500"/>Start Work</h2>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">{workOrder.work_order_number} · {workOrder.title}</div>
          </div>
          <button type="button" ref={closeButtonRef} type="button" onClick={onClose} disabled={busy} aria-label="Close Start Work dialog" className="min-h-11 min-w-11 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"><X className="h-5 w-5"/></button>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
          <div id="fleet-start-work-description" className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">Starting work moves this Fleet maintenance work order to <b>In Progress</b> and stamps the Eastern start date. It does not consume inventory or complete the job.</div>
          <div>
            <div className="mb-2 text-xs font-medium text-gray-600 dark:text-slate-300">Quick projected completion</div>
            <div className="flex flex-wrap gap-2">{quick.map(([label,date])=><button type="button" key={label} aria-pressed={projectedDate===date} onClick={()=>setProjectedDate(date)} className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${projectedDate===date?"border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200":"border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{label}</button>)}</div>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Projected completion date *</span><CcsDateField min={today} value={projectedDate} onChange={e=>setProjectedDate(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"/></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Scheduling / planning notes</span><textarea rows={4} value={planningNotes} onChange={e=>setPlanningNotes(e.target.value)} placeholder="Waiting for parts, scheduled downtime, vendor timing, etc." className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"/></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 p-4 dark:border-slate-800"><button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium dark:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">Cancel</button><button type="button" onClick={()=>onConfirm?.({ projected_completion_date: projectedDate, planning_notes: planningNotes.trim() })} disabled={busy || !projectedDate} className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Play className="h-4 w-4"/>}{busy?"Starting…":"Start Work"}</button></div>
      </div>
    </div>
  );
}
