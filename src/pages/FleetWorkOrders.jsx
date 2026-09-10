import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetWorkOrderDialog from "@/components/fleet/FleetWorkOrderDialog";
import FleetConfirmDialog from "@/components/fleet/FleetConfirmDialog";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { ClipboardList, Loader2, Search, Image as ImageIcon, ChevronDown, ChevronUp, Plus, Pencil, CheckCircle2, RotateCcw } from "lucide-react";

const pretty = (v) => String(v || "—").replaceAll("_", " ");
const easternTodayText = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const workOrderAnchorDate = (w) => w.started_date || String(w.migration_source_created_date || w.created_date || "").slice(0, 10);
const workOrderAgeDays = (w, todayText = easternTodayText()) => {
  const anchor = workOrderAnchorDate(w);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor || "")) return null;
  const diff = Math.floor((Date.parse(`${todayText}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86400000);
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
};
const isProjectedLate = (w, todayText = easternTodayText()) => !["completed", "cancelled"].includes(w.status) && !!w.projected_completion_date && w.projected_completion_date < todayText;

export default function FleetWorkOrders() {
  const [orders, setOrders] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [parts, setParts] = useState([]);
  const [fluids, setFluids] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("all");
  const [attention, setAttention] = useState("all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [actionError, setActionError] = useState("");
  const [reopeningId, setReopeningId] = useState("");
  const [confirmReopen, setConfirmReopen] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [w, e, t, p, f] = await Promise.all([
        listAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, "-created_date", { label: "Fleet work-order history" }),
        listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment" }),
        listAllFleetRows(base44.entities.FleetMaintenanceTask, "start_date", { label: "Fleet maintenance schedules" }),
        listAllFleetRows(base44.entities.FleetPart, "part_name", { label: "Fleet parts" }),
        listAllFleetRows(base44.entities.FleetFluid, "fluid_name", { label: "Fleet fluids" }),
      ]);
      setOrders(w || []);
      setEquipment(e || []);
      setTasks(t || []);
      setParts(p || []);
      setFluids(f || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const equipmentId = params.get("equipment") || "";
    const workOrderId = params.get("workOrder") || "";
    const attentionFilter = params.get("attention") || "";
    if (equipmentId) setEquipmentFilter(equipmentId);
    if (["stale30", "past_projected", "unassigned"].includes(attentionFilter)) setAttention(attentionFilter);
    if (workOrderId) {
      setStatus("all");
      setExpanded(workOrderId);
    }
    if (params.get("new") === "1") {
      setDialog({ mode: "create", workOrder: equipmentId ? { equipment_id: equipmentId } : null });
    }
  }, []);

  const equipmentNames = useMemo(() => Object.fromEntries(equipment.map(e => [e.id, e.name])), [equipment]);
  const summary = useMemo(() => {
    const todayText = easternTodayText();
    const activeRows = orders.filter(w => !["completed", "cancelled"].includes(w.status));
    return {
      active: activeRows.length,
      highCritical: activeRows.filter(w => ["high", "critical"].includes(w.priority)).length,
      unassigned: activeRows.filter(w => !String(w.assigned_to || "").trim()).length,
      stale30: activeRows.filter(w => (workOrderAgeDays(w, todayText) ?? -1) >= 30).length,
      pastProjected: activeRows.filter(w => isProjectedLate(w, todayText)).length,
      completed: orders.filter(w => w.status === "completed").length,
    };
  }, [orders]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const todayText = easternTodayText();
    return orders.filter(w => {
      const active = !["completed", "cancelled"].includes(w.status);
      if (status === "active" && !active) return false;
      if (status === "completed" && w.status !== "completed") return false;
      if (status === "cancelled" && w.status !== "cancelled") return false;
      if (priority !== "all" && w.priority !== priority) return false;
      if (attention === "stale30" && (!active || (workOrderAgeDays(w, todayText) ?? -1) < 30)) return false;
      if (attention === "past_projected" && !isProjectedLate(w, todayText)) return false;
      if (attention === "unassigned" && (!active || String(w.assigned_to || "").trim())) return false;
      if (equipmentFilter !== "all" && w.equipment_id !== equipmentFilter) return false;
      if (!q) return true;
      return [w.work_order_number, w.title, w.description, w.assigned_to, equipmentNames[w.equipment_id], w.corrective_action].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [orders, search, status, priority, attention, equipmentFilter, equipmentNames]);

  const submitDialog = async (workOrderData, equipmentStatus) => {
    if (!dialog) return;
    const action = dialog.mode === "create" ? "create" : dialog.mode === "complete" ? "complete" : "update";
    const payload = action === "create"
      ? { action, work_order: workOrderData }
      : { action, id: dialog.workOrder.id, work_order: workOrderData, ...(action === "complete" ? { equipment_status: equipmentStatus } : {}) };
    const response = await base44.functions.invoke("fleetWorkOrderAction", payload);
    if (response?.data?.error) throw new Error(response.data.error);
    await loadData();
    setDialog(null);
    setActionError("");
  };

  const reopen = async (workOrder) => {
    if (!workOrder) return;
    setReopeningId(workOrder.id);
    setActionError("");
    try {
      const response = await base44.functions.invoke("fleetWorkOrderAction", { action: "reopen", id: workOrder.id });
      if (response?.data?.error) throw new Error(response.data.error);
      await loadData();
    } catch (error) {
      setActionError(error?.message || "Failed to reopen Fleet work order.");
    } finally {
      setReopeningId("");
      setConfirmReopen(null);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Work Orders</h1><p className="text-sm text-gray-500 dark:text-slate-400">Fleet maintenance only. These records are separate from customer/signage WorkOrders.</p></div>
          <button onClick={() => setDialog({ mode: "create", workOrder: null })} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium flex items-center justify-center gap-2"><Plus className="w-4 h-4" />New Fleet Work Order</button>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200 px-3 py-2 text-xs">Fleet maintenance is live in CCS. Creates/completions use Fleet-only server actions, durable idempotency receipts, inventory/history updates, recurring schedule advancement, and queued notifications.</div>
        {actionError && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 px-3 py-2 text-sm">{actionError}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Summary label="Active" value={summary.active} />
          <Summary label="High / Critical" value={summary.highCritical} attention={summary.highCritical > 0} />
          <Summary label="Unassigned" value={summary.unassigned} attention={summary.unassigned > 0} />
          <Summary label="Stale 30+ Days" value={summary.stale30} attention={summary.stale30 > 0} />
          <Summary label="Past Projected" value={summary.pastProjected} attention={summary.pastProjected > 0} />
          <Summary label="Completed" value={summary.completed} />
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_150px_180px_240px] gap-3">
          <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search work orders..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div>
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="active">Active</option><option value="all">All statuses</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
          <select value={priority} onChange={e => setPriority(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <select value={attention} onChange={e => setAttention(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All attention states</option><option value="stale30">Stale 30+ days</option><option value="past_projected">Past projected completion</option><option value="unassigned">Unassigned active</option></select>
          <select value={equipmentFilter} onChange={e => setEquipmentFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All equipment</option>{equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        </div>

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : (
          <div className="space-y-3">
            {rows.map(w => {
              const photos = [...(w.before_photos || []), ...(w.problem_photos || []), ...(w.after_photos || [])];
              const isOpen = expanded === w.id;
              const ageDays = !["completed", "cancelled"].includes(w.status) ? workOrderAgeDays(w) : null;
              const projectedLate = isProjectedLate(w);
              return <div key={w.id} className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : w.id)} className="w-full text-left p-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/40">
                  <ClipboardList className="w-5 h-5 mt-0.5 text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-gray-900 dark:text-slate-100">{w.work_order_number}</span><span className="text-gray-600 dark:text-slate-300">{w.title}</span><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 capitalize">{pretty(w.status)}</span><span className={`text-xs capitalize ${["critical","high"].includes(w.priority) ? "font-semibold text-red-600 dark:text-red-300" : "text-gray-500"}`}>{pretty(w.priority)} priority</span>{ageDays != null && <span className={`text-xs ${ageDays >= 30 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-gray-500"}`}>{ageDays} day{ageDays === 1 ? "" : "s"} open</span>}{projectedLate && <span className="text-xs font-semibold text-red-600 dark:text-red-300">Past projected completion</span></div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{equipmentNames[w.equipment_id] || (w.source_equipment_id ? "Unresolved equipment" : "No equipment")} · {w.assigned_to || "Unassigned"}{photos.length ? ` · ${photos.length} photo${photos.length === 1 ? "" : "s"}` : ""}</div></div>
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {isOpen && <div className="border-t border-gray-100 dark:border-slate-800 p-4 space-y-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {!["completed", "cancelled"].includes(w.status) && <button onClick={() => setDialog({ mode: "edit", workOrder: w })} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-700 flex items-center gap-1.5"><Pencil className="w-4 h-4" />Edit</button>}
                    {!["completed", "cancelled"].includes(w.status) && <button onClick={() => setDialog({ mode: "complete", workOrder: w })} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Complete</button>}
                    {w.status === "completed" && <button onClick={() => setConfirmReopen(w)} disabled={reopeningId === w.id} className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 dark:text-amber-300 flex items-center gap-1.5 disabled:opacity-50">{reopeningId === w.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}Reopen</button>}
                    {w.status === "cancelled" && <button onClick={() => setDialog({ mode: "edit", workOrder: w })} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-700 flex items-center gap-1.5"><Pencil className="w-4 h-4" />Edit / Reactivate</button>}
                  </div>
                  {w.equipment_id && <Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(w.equipment_id)}`} className="inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-300 hover:underline">Open {equipmentNames[w.equipment_id] || "equipment"} detail</Link>}
                  <div className="grid md:grid-cols-3 gap-4"><Info label="Type" value={pretty(w.type)} /><Info label="Started" value={w.started_date || "—"} /><Info label="Open age" value={ageDays != null ? `${ageDays} day${ageDays === 1 ? "" : "s"}` : "—"} /><Info label="Completed" value={w.completed_date || "—"} /><Info label="Actual hours" value={w.actual_hours ?? "—"} /><Info label="Total cost" value={w.total_cost != null ? `$${Number(w.total_cost).toFixed(2)}` : "—"} /><Info label="Projected completion" value={w.projected_completion_date || "—"} /></div>
                  {w.description && <Section title="Description" text={w.description} />}
                  {w.corrective_action && <Section title="Corrective Action" text={w.corrective_action} />}
                  {w.notes && <Section title="Notes" text={w.notes} />}
                  {(w.parts_used?.length || w.fluids_used?.length) ? <div className="grid md:grid-cols-2 gap-4"><Usage title="Parts Used" rows={(w.parts_used || []).map(p => `${p.part_name || "Part"} × ${p.quantity ?? "—"}`)} /><Usage title="Fluids Used" rows={(w.fluids_used || []).map(f => `${f.fluid_name || "Fluid"} × ${f.quantity ?? f.quantity_quarts ?? "—"} ${f.unit || ""}`)} /></div> : null}
                  {photos.length > 0 && <div><div className="font-medium text-gray-900 dark:text-slate-100 mb-2 flex items-center gap-1.5"><ImageIcon className="w-4 h-4" />Photos</div><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">{photos.map((src, i) => <a key={`${src}-${i}`} href={src} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden bg-gray-100"><img src={src} alt="Work order" className="w-full h-full object-cover" /></a>)}</div></div>}
                </div>}
              </div>;
            })}
            {rows.length === 0 && <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-12 text-center text-gray-500">No Fleet work orders found.</div>}
          </div>
        )}
      </div>

      <FleetWorkOrderDialog
        open={!!dialog}
        mode={dialog?.mode}
        workOrder={dialog?.workOrder}
        equipment={equipment}
        tasks={tasks}
        parts={parts}
        fluids={fluids}
        onClose={() => setDialog(null)}
        onSubmit={submitDialog}
      />
      <FleetConfirmDialog
        open={!!confirmReopen}
        title={`Reopen ${confirmReopen?.work_order_number || "Fleet work order"}?`}
        description="This returns the work order to In Progress. Inventory consumed by the prior completion is not restored, matching the preserved Fleet workflow."
        confirmLabel="Reopen Work Order"
        tone="warning"
        busy={!!reopeningId}
        onCancel={() => setConfirmReopen(null)}
        onConfirm={() => reopen(confirmReopen)}
      />
    </div>
  );
}

function Summary({ label, value, attention = false }) { return <div className={`rounded-xl border p-3 ${attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}><div className="text-xs text-gray-400">{label}</div><div className={`text-2xl font-bold mt-1 ${attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"}`}>{value}</div></div>; }
function Info({ label, value }) { return <div><div className="text-xs text-gray-400">{label}</div><div className="text-gray-800 dark:text-slate-200 mt-0.5 capitalize">{value}</div></div>; }
function Section({ title, text }) { return <div><div className="font-medium text-gray-900 dark:text-slate-100 mb-1">{title}</div><div className="text-gray-600 dark:text-slate-300 whitespace-pre-wrap">{text}</div></div>; }
function Usage({ title, rows }) { return <div><div className="font-medium text-gray-900 dark:text-slate-100 mb-1">{title}</div><ul className="text-gray-600 dark:text-slate-300 space-y-1">{rows.map((r,i) => <li key={i}>• {r}</li>)}</ul></div>; }
