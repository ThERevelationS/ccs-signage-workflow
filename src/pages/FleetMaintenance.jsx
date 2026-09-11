import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetMaintenanceDialog from "@/components/fleet/FleetMaintenanceDialog";
import FleetBulkMaintenanceDialog from "@/components/fleet/FleetBulkMaintenanceDialog";
import FleetMaintenanceCalendar from "@/components/fleet/FleetMaintenanceCalendar";
import FleetMaintenanceWorkspace from "@/components/fleet/FleetMaintenanceWorkspace";
import { filterAllFleetRows, listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clock3,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  Truck,
  Wrench,
} from "lucide-react";

const pretty = (v) => String(v || "—").replaceAll("_", " ");
const todayText = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const isOverdue = (task, today = todayText()) => task?.status === "overdue" || (task?.status === "pending" && !!task?.start_date && task.start_date < today);
const humanDate = (value) => {
  if (!value) return "No date set";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

export default function FleetMaintenance() {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedStatus = initialParams.get("status") || "";
  const requestedEquipment = initialParams.get("equipment") || "";
  const requestedView = initialParams.get("view") || "";
  const requestedTab = initialParams.get("tab") || "";
  const [tasks, setTasks] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [activeWorkOrders, setActiveWorkOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [fluids, setFluids] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState(requestedEquipment ? "workspace" : requestedStatus ? "all_schedules" : requestedView === "calendar" ? "calendar" : "equipment");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(requestedEquipment);
  const [workspaceInitialTab, setWorkspaceInitialTab] = useState(["overview", "schedule", "active", "history", "usage"].includes(requestedTab) ? requestedTab : "overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(["pending", "in_progress", "completed", "overdue"].includes(requestedStatus) ? requestedStatus : "all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [bulkPlannerOpen, setBulkPlannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [t, e, openWos, assignedWos, inProgressWos, p, f, u] = await Promise.all([
        listAllFleetRows(base44.entities.FleetMaintenanceTask, "start_date", { label: "Fleet maintenance schedules" }),
        listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment" }),
        filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { status: "open" }, "-created_date", { label: "Open Fleet maintenance work orders" }),
        filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { status: "assigned" }, "-created_date", { label: "Assigned Fleet maintenance work orders" }),
        filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { status: "in_progress" }, "-created_date", { label: "In-progress Fleet maintenance work orders" }),
        listAllFleetRows(base44.entities.FleetPart, "part_name", { label: "Fleet parts" }),
        listAllFleetRows(base44.entities.FleetFluid, "fluid_name", { label: "Fleet fluids" }),
        base44.auth.me().catch(() => null),
      ]);
      setTasks(t || []);
      setEquipment(e || []);
      setActiveWorkOrders([...(openWos || []), ...(assignedWos || []), ...(inProgressWos || [])]);
      setParts(p || []);
      setFluids(f || []);
      setCurrentUser(u || null);
    } catch (e) {
      setError(e?.message || "Unable to load Fleet maintenance schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreateDialog = useCallback((equipmentId = "") => setDialog({ task: null, equipmentId, createKey: crypto.randomUUID() }), []);
  const isAdmin = currentUser?.role === "admin";
  const names = useMemo(() => Object.fromEntries(equipment.map(e => [e.id, e.name])), [equipment]);
  const selectedEquipment = useMemo(() => equipment.find(item => item.id === selectedEquipmentId) || null, [equipment, selectedEquipmentId]);
  const selectedTasks = useMemo(() => tasks.filter(task => task.equipment_id === selectedEquipmentId), [tasks, selectedEquipmentId]);

  const metrics = useMemo(() => {
    const today = todayText();
    const start = new Date(`${today}T12:00:00`);
    const horizon = new Date(start);
    horizon.setDate(horizon.getDate() + 14);
    const pending = tasks.filter(t => ["pending", "overdue"].includes(t.status));
    const inProgress = tasks.filter(t => t.status === "in_progress");
    const completed = tasks.filter(t => t.status === "completed");
    const overdue = pending.filter(t => isOverdue(t, today));
    const dueSoon = pending.filter(t => {
      if (!t.start_date || isOverdue(t, today)) return false;
      const due = new Date(`${t.start_date}T12:00:00`);
      return due >= start && due <= horizon;
    });
    return { pending, inProgress, completed, overdue, dueSoon };
  }, [tasks]);

  const equipmentCards = useMemo(() => {
    const today = todayText();
    const start = new Date(`${today}T12:00:00`);
    const horizon = new Date(start);
    horizon.setDate(horizon.getDate() + 14);

    return equipment.map(eq => {
      const eqTasks = tasks.filter(task => task.equipment_id === eq.id);
      const pending = eqTasks.filter(task => ["pending", "overdue"].includes(task.status));
      const overdue = pending.filter(task => isOverdue(task, today));
      const dueSoon = pending.filter(task => {
        if (!task.start_date || isOverdue(task, today)) return false;
        const due = new Date(`${task.start_date}T12:00:00`);
        return due >= start && due <= horizon;
      });
      const scheduled = eqTasks.filter(task => task.status !== "completed");
      const workOrders = activeWorkOrders.filter(wo => wo.equipment_id === eq.id);
      const nextMaintenance = pending
        .filter(task => !!task.start_date)
        .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] || null;
      return { eq, tasks: eqTasks, overdue, dueSoon, scheduled, workOrders, nextMaintenance };
    }).sort((a, b) => {
      const attentionA = (a.overdue.length * 1000) + (a.dueSoon.length * 100) + (a.workOrders.length * 10) + a.scheduled.length;
      const attentionB = (b.overdue.length * 1000) + (b.dueSoon.length * 100) + (b.workOrders.length * 10) + b.scheduled.length;
      if (attentionA !== attentionB) return attentionB - attentionA;
      return String(a.eq.name || "").localeCompare(String(b.eq.name || ""));
    });
  }, [equipment, tasks, activeWorkOrders]);

  const visibleEquipmentCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return equipmentCards;
    return equipmentCards.filter(card => [
      card.eq.name,
      card.eq.type,
      card.eq.make,
      card.eq.model,
      card.eq.year,
      card.eq.vin,
      card.eq.serial_number,
      card.eq.license_plate,
      ...card.tasks.flatMap(task => [task.title, task.description, task.frequency, task.status]),
    ].some(value => String(value || "").toLowerCase().includes(q)));
  }, [equipmentCards, search]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayText();
    return tasks.filter(t => {
      const overdue = isOverdue(t, today);
      if (equipmentFilter !== "all" && t.equipment_id !== equipmentFilter) return false;
      if (statusFilter === "overdue" && !overdue) return false;
      if (statusFilter === "pending" && !["pending", "overdue"].includes(t.status)) return false;
      if (!["all", "overdue", "pending"].includes(statusFilter) && t.status !== statusFilter) return false;
      return !q || [t.title, t.description, t.assigned_to, names[t.equipment_id], t.frequency, t.status].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [tasks, search, statusFilter, equipmentFilter, names]);

  const openEquipmentMaintenance = (equipmentId, initialTab = "overview") => {
    setSelectedEquipmentId(equipmentId);
    setWorkspaceInitialTab(initialTab);
    setEquipmentFilter(equipmentId);
    setStatusFilter("all");
    setSearch("");
    setView("workspace");
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("equipment", equipmentId);
    if (initialTab !== "overview") url.searchParams.set("tab", initialTab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showEquipmentView = () => {
    setView("equipment");
    setSelectedEquipmentId("");
    setWorkspaceInitialTab("overview");
    setEquipmentFilter("all");
    setStatusFilter("all");
    setSearch("");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const showCalendar = () => {
    setView("calendar");
    setSelectedEquipmentId("");
    setWorkspaceInitialTab("overview");
    setSearch("");
    window.history.replaceState({}, "", `${window.location.pathname}?view=calendar`);
  };

  const showAllSchedules = () => {
    setView("all_schedules");
    setSelectedEquipmentId("");
    setWorkspaceInitialTab("overview");
    setSearch("");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const saveTask = async (payload) => {
    setSaving(true);
    setError("");
    try {
      const body = dialog?.task
        ? { action: "update", id: dialog.task.id, expected_updated_date: dialog.task.updated_date || "", task: payload }
        : { action: "create", creation_key: dialog?.createKey || "", task: payload };
      const { data } = await base44.functions.invoke("fleetMaintenanceAction", body);
      if (data?.error) throw new Error(data.error);
      setDialog(null);
      await loadData();
    } catch (e) {
      setError(e?.message || "Unable to save Fleet maintenance schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Maintenance</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">Manage maintenance by vehicle or equipment first. The full schedule table remains available when you need a global view.</p>
          </div>
          {view !== "workspace" && <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
            <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={view === "equipment" ? "Search equipment or maintenance..." : "Search schedules..."} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div>
            {view === "all_schedules" && <>
              <select value={equipmentFilter} onChange={e => setEquipmentFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All equipment</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All statuses</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="overdue">Overdue</option></select>
            </>}
            {isAdmin && <button onClick={() => setBulkPlannerOpen(true)} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300 font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap"><LayoutGrid className="w-4 h-4" />Bulk Plan</button>}
            {isAdmin && <button onClick={() => openCreateDialog()} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap"><Plus className="w-4 h-4" />New Schedule</button>}
          </div>}
        </div>

        {view !== "workspace" && <>
          <div className="inline-flex w-full sm:w-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900 overflow-x-auto">
            <button onClick={showEquipmentView} className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${view === "equipment" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><LayoutGrid className="w-4 h-4" />Equipment</button>
            <button onClick={showCalendar} className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${view === "calendar" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><CalendarClock className="w-4 h-4" />Calendar</button>
            <button onClick={showAllSchedules} className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${view === "all_schedules" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><List className="w-4 h-4" />All Schedules</button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Metric icon={Clock3} label="Pending" value={metrics.pending.length} />
            <Metric icon={Activity} label="In progress" value={metrics.inProgress.length} />
            <Metric icon={CalendarClock} label="Overdue" value={metrics.overdue.length} danger={metrics.overdue.length > 0} />
            <Metric icon={CalendarClock} label="Due in 14 days" value={metrics.dueSoon.length} attention={metrics.dueSoon.length > 0} />
            <Metric icon={Wrench} label="Active work orders" value={activeWorkOrders.length} />
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">Automatic generation is live and idempotent. This redesign changes how schedules are organized on screen; it does not change schedule generation, work-order completion, or inventory behavior.</div>
        </>}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : view === "workspace" ? (
          selectedEquipment ? <FleetMaintenanceWorkspace equipment={selectedEquipment} tasks={selectedTasks} isAdmin={isAdmin} initialTab={workspaceInitialTab} onBack={showEquipmentView} onEditSchedule={(task) => setDialog({ task })} onNewSchedule={() => openCreateDialog(selectedEquipment.id)} /> : <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-5 text-red-700 dark:text-red-300"><div className="font-semibold">Fleet equipment not found.</div><button onClick={showEquipmentView} className="mt-2 text-sm underline">Back to Maintenance</button></div>
        ) : view === "calendar" ? (
          <FleetMaintenanceCalendar tasks={tasks} equipment={equipment} search={search} onOpenSchedule={(task) => openEquipmentMaintenance(task.equipment_id, "schedule")} />
        ) : view === "equipment" ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Maintenance by Equipment</h2><p className="text-xs text-gray-500 dark:text-slate-400">Assets needing attention are shown first. Equipment with no schedule is kept visible so gaps are easy to spot.</p></div>
              <div className="text-xs text-gray-500 dark:text-slate-400">{visibleEquipmentCards.length} of {equipmentCards.length} assets</div>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleEquipmentCards.map(card => <MaintenanceEquipmentCard key={card.eq.id} card={card} isAdmin={isAdmin} onOpen={() => openEquipmentMaintenance(card.eq.id)} onNew={() => openCreateDialog(card.eq.id)} />)}
              {visibleEquipmentCards.length === 0 && <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-12 text-center text-gray-500">No Fleet equipment matches this search.</div>}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div><h2 className="font-semibold text-gray-900 dark:text-slate-100">All Maintenance Schedules</h2><p className="text-xs text-gray-500 dark:text-slate-400">Global schedule view for auditing, filtering, and editing across the whole Fleet.</p></div>
              {equipmentFilter !== "all" && <button onClick={() => setEquipmentFilter("all")} className="text-sm text-indigo-600 dark:text-indigo-300">Clear equipment filter</button>}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Task</th><th className="px-4 py-3">Equipment</th><th className="px-4 py-3">Frequency</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned</th><th className="px-4 py-3">Status</th>{isAdmin && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {rows.map(t => <tr key={t.id} className="align-top"><td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-slate-100 flex gap-2"><CalendarClock className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />{t.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-md">{t.description || "—"}</div>{(t.parts_needed?.length || t.fluids_needed?.length) ? <div className="text-xs text-gray-400 mt-1">{t.parts_needed?.length || 0} planned part item(s) · {t.fluids_needed?.length || 0} planned fluid item(s)</div> : null}</td><td className="px-4 py-3"><button type="button" onClick={() => setEquipmentFilter(t.equipment_id)} className="text-left hover:text-indigo-600 dark:hover:text-indigo-300">{names[t.equipment_id] || "Unresolved"}</button></td><td className="px-4 py-3 capitalize">{t.type === "one_off" ? "One-time" : pretty(t.frequency)}{t.frequency === "custom" && t.custom_frequency_value ? ` (${t.custom_frequency_value} ${t.custom_frequency_unit || ""})` : ""}</td><td className="px-4 py-3 whitespace-nowrap">{t.start_date || "—"}</td><td className="px-4 py-3 capitalize">{pretty(t.priority)}</td><td className="px-4 py-3">{t.assigned_to || "—"}</td><td className="px-4 py-3 capitalize">{isOverdue(t) ? <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300"><AlertTriangle className="w-3.5 h-3.5" />Overdue</span> : pretty(t.status)}</td>{isAdmin && <td className="px-4 py-3 text-right"><button onClick={() => setDialog({ task: t })} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><Pencil className="w-4 h-4" />Edit</button></td>}</tr>)}
                    {rows.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-gray-500">No maintenance schedules found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <FleetMaintenanceDialog open={!!dialog} task={dialog?.task || null} initialEquipmentId={dialog?.equipmentId || ""} equipment={equipment} parts={parts} fluids={fluids} onClose={() => !saving && setDialog(null)} onSave={saveTask} saving={saving} />
      <FleetBulkMaintenanceDialog open={bulkPlannerOpen} equipment={equipment} onClose={() => setBulkPlannerOpen(false)} onCompleted={loadData} />
    </div>
  );
}

function MaintenanceEquipmentCard({ card, isAdmin, onOpen, onNew }) {
  const { eq, overdue, dueSoon, scheduled, workOrders, nextMaintenance } = card;
  const hasOverdue = overdue.length > 0;
  const hasDueSoon = dueSoon.length > 0;
  const tone = hasOverdue
    ? "border-red-200 dark:border-red-900"
    : hasDueSoon
      ? "border-amber-200 dark:border-amber-900"
      : "border-gray-200 dark:border-slate-800";

  return (
    <div className={`rounded-xl border ${tone} bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col`}>
      <div className="p-4 space-y-4 flex-1">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">{eq.photo_url ? <img src={eq.photo_url} alt="" className="w-full h-full object-cover" /> : <Truck className="w-6 h-6 text-gray-400" />}</div>
          <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(eq.id)}`} className="font-semibold text-gray-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-300 line-clamp-1">{eq.name}</Link><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">{[eq.year, eq.make, eq.model].filter(Boolean).join(" ") || pretty(eq.type)}</div></div><span className={`shrink-0 text-[11px] px-2 py-1 rounded-full capitalize ${eq.status === "operational" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : eq.status === "down" ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"}`}>{pretty(eq.status)}</span></div></div>
        </div>

        <div className={`rounded-lg p-3 ${hasOverdue ? "bg-red-50 dark:bg-red-950/20" : hasDueSoon ? "bg-amber-50 dark:bg-amber-950/20" : "bg-gray-50 dark:bg-slate-800/50"}`}>
          <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">Next maintenance</div>
          {nextMaintenance ? <div className="mt-1"><div className={`font-semibold text-sm ${hasOverdue && isOverdue(nextMaintenance) ? "text-red-700 dark:text-red-300" : "text-gray-900 dark:text-slate-100"}`}>{nextMaintenance.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{humanDate(nextMaintenance.start_date)} · {nextMaintenance.type === "one_off" ? "One-time" : pretty(nextMaintenance.frequency)}</div></div> : <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">No pending maintenance schedule.</div>}
        </div>

        <div className="grid grid-cols-4 gap-2">
          <CardStat label="Overdue" value={overdue.length} danger={overdue.length > 0} />
          <CardStat label="Due soon" value={dueSoon.length} attention={dueSoon.length > 0} />
          <CardStat label="Schedules" value={scheduled.length} />
          <CardStat label="Active WOs" value={workOrders.length} />
        </div>

        {scheduled.length === 0 && <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-700 px-3 py-2 text-xs text-gray-500 dark:text-slate-400">No active maintenance schedule is configured for this asset.</div>}
      </div>
      <div className="border-t border-gray-100 dark:border-slate-800 p-3 flex flex-col sm:flex-row gap-2">
        <button onClick={onOpen} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 px-3 py-2 text-sm font-semibold"><Wrench className="w-4 h-4" />Open Maintenance</button>
        {isAdmin && <button onClick={onNew} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-200"><Plus className="w-4 h-4" />New Schedule</button>}
        <Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(eq.id)}`} aria-label={`Open ${eq.name} equipment detail`} className="inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-gray-500 dark:text-slate-400"><ArrowRight className="w-4 h-4" /></Link>
      </div>
    </div>
  );
}

function CardStat({ label, value, attention = false, danger = false }) {
  const valueClass = danger ? "text-red-700 dark:text-red-300" : attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100";
  return <div className="rounded-lg bg-gray-50 dark:bg-slate-800/60 px-2 py-2 text-center"><div className={`text-lg font-bold ${valueClass}`}>{value}</div><div className="text-[10px] leading-tight text-gray-400">{label}</div></div>;
}

function Metric({ icon: Icon, label, value, attention = false, danger = false }) {
  const style = danger ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  const valueStyle = danger ? "text-red-700 dark:text-red-300" : attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100";
  return <div className={`rounded-xl border p-3 ${style}`}><div className="flex items-center justify-between gap-2"><div className="text-xs text-gray-400">{label}</div><Icon className="w-4 h-4 text-gray-400" /></div><div className={`text-2xl font-bold mt-1 ${valueStyle}`}>{value}</div></div>;
}