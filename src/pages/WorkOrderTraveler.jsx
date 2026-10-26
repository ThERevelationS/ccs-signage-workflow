import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Printer } from "lucide-react";

const clean = (v) => String(v ?? "").trim();
const fmtDate = (v) => {
  const s = clean(v);
  if (!s) return "—";
  const d = s.length === 10 ? new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const STAGE_LABELS = {
  estimating: "Estimating", sales: "Sales", permitting: "Permitting", design: "Design",
  production: "Production", fabrication: "Fabrication", installation: "Installation", completed: "Completed",
};

function TaskRow({ task }) {
  return (
    <div className="border-b border-slate-200 py-1.5 last:border-0">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-sm border-2 ${task.completed ? "border-slate-800 bg-slate-800" : "border-slate-400"}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium leading-snug ${task.completed ? "text-slate-400 line-through" : "text-slate-900"}`}>
            {clean(task.text) || "Task"}
            {task.is_milestone ? <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[10px] font-bold uppercase text-violet-700">milestone</span> : null}
            {task.is_critical_path ? <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[10px] font-bold uppercase text-red-700">critical</span> : null}
          </p>
          <p className="text-[11px] text-slate-500">
            {[clean(task.assigned_to), clean(task.due_date) && `due ${fmtDate(task.due_date)}`, task.estimated_hours ? `est ${task.estimated_hours}h` : ""].filter(Boolean).join(" · ")}
          </p>
          {Array.isArray(task.sub_tasks) && task.sub_tasks.length > 0 && (
            <div className="ml-4 mt-1 space-y-0.5">
              {task.sub_tasks.map((st, i) => (
                <div key={st.id || i} className="flex items-start gap-1.5">
                  <span className={`mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm border ${st.completed ? "border-slate-600 bg-slate-600" : "border-slate-300"}`} />
                  <span className={`text-xs ${st.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>{clean(st.text)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="w-16 shrink-0 border-b border-dotted border-slate-300 pb-3 text-right text-[10px] text-slate-400">initials</div>
      </div>
    </div>
  );
}

export default function WorkOrderTraveler() {
  const [wo, setWo] = useState(null);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const woId = useMemo(() => new URLSearchParams(window.location.search).get("wo") || "", []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!woId) { setError("No work order specified."); setLoading(false); return; }
      try {
        const record = await base44.entities.WorkOrder.get(woId);
        if (cancelled) return;
        if (!record?.id) throw new Error("Work order not found.");
        setWo(record);
        document.title = `Traveler — ${clean(record.title) || woId}`;
        const kids = await base44.entities.WorkOrder.filter({ parent_work_order_id: woId }).catch(() => []);
        if (!cancelled) setRiders((Array.isArray(kids) ? kids : []).filter((r) => r?.id && !r.deleted));
      } catch (e) {
        if (!cancelled) setError(e?.message || "Could not load work order.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [woId]);

  const tasks = useMemo(() => (Array.isArray(wo?.notes) ? wo.notes : []), [wo]);
  const taskGroups = useMemo(() => {
    const groups = new Map();
    for (const t of tasks) {
      const key = clean(t.checklist_context) || "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return [...groups.entries()];
  }, [tasks]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>;
  }
  if (error || !wo) {
    return <div className="flex min-h-screen items-center justify-center p-8 text-center"><p className="text-red-600">{error || "Work order not found."}</p></div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl bg-white p-6 shadow print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <p className="text-xs text-slate-500">Print preview — use your browser's print dialog to paper or PDF.</p>
          <button type="button" onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>

        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Shop Traveler</p>
              <h1 className="text-2xl font-bold text-slate-900">{clean(wo.title) || "Work Order"}</h1>
              <p className="text-sm text-slate-600">{clean(wo.client_name) || "—"}</p>
            </div>
            <div className="text-right text-[11px] text-slate-600">
              <p className="font-mono">WO {clean(wo.id).slice(-8).toUpperCase()}</p>
              <p>Printed {new Date().toLocaleDateString()}</p>
              {wo.asap ? <p className="mt-1 inline-block rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">ASAP</p> : null}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
            {[
              ["Stage", STAGE_LABELS[clean(wo.current_stage)] || clean(wo.current_stage) || "—"],
              ["Start", fmtDate(wo.start_date)],
              ["Due", fmtDate(wo.due_date)],
              ["Assigned", clean(wo.assigned_to) || "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-slate-300 px-2 py-1.5">
                <p className="font-bold uppercase text-slate-400">{k}</p>
                <p className="font-semibold text-slate-800">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {clean(wo.description) && (
          <div className="mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Scope / Description</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{clean(wo.description)}</p>
          </div>
        )}

        {wo.image_url && (
          <div className="mt-4">
            <img src={wo.image_url} alt={clean(wo.title)} className="max-h-56 rounded border border-slate-200 object-contain" />
          </div>
        )}

        {/* Tasks */}
        <div className="mt-4">
          <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Production Checklist ({tasks.filter((t) => t.completed).length}/{tasks.length} done)
          </h2>
          {taskGroups.length === 0 ? (
            <p className="py-3 text-sm text-slate-400">No tasks on this work order.</p>
          ) : taskGroups.map(([group, items]) => (
            <div key={group} className="mt-2">
              {taskGroups.length > 1 && <p className="text-[11px] font-bold uppercase text-slate-400">{group}</p>}
              {items.map((t, i) => <TaskRow key={t.id || i} task={t} />)}
            </div>
          ))}
        </div>

        {/* Riders */}
        {riders.length > 0 && (
          <div className="mt-5 break-inside-avoid">
            <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Riders ({riders.length})
            </h2>
            {riders.map((r) => (
              <div key={r.id} className="mt-2 rounded border border-slate-300 p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{clean(r.title)}</p>
                  <p className="text-[11px] text-slate-500">{STAGE_LABELS[clean(r.rider_stage) || clean(r.current_stage)] || "—"} · due {fmtDate(r.due_date)}</p>
                </div>
                {clean(r.description) && <p className="mt-1 text-xs text-slate-600">{clean(r.description)}</p>}
                {Array.isArray(r.notes) && r.notes.length > 0 && (
                  <div className="mt-1.5">
                    {r.notes.map((t, i) => <TaskRow key={t.id || i} task={t} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Files */}
        {Array.isArray(wo.files) && wo.files.length > 0 && (
          <div className="mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Attached Files</h2>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
              {wo.files.map((f, i) => <li key={f.id || i}>{clean(f.name) || "file"}</li>)}
            </ul>
          </div>
        )}

        {/* Sign-off */}
        <div className="mt-8 grid grid-cols-3 gap-6 break-inside-avoid">
          {["Received by", "Completed by", "QC / Date"].map((label) => (
            <div key={label}>
              <div className="h-10 border-b border-slate-400" />
              <p className="mt-1 text-center text-[10px] font-bold uppercase text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
