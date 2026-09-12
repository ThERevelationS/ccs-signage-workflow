import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { filterAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Droplets,
  History,
  Loader2,
  Package,
  Pencil,
  Plus,
  Truck,
  Wrench,
} from "lucide-react";

const ACTIVE = new Set(["open", "assigned", "in_progress"]);
const pretty = value => String(value || "—").replaceAll("_", " ");
const todayText = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const isOverdue = task => task?.status === "overdue" || (task?.status === "pending" && !!task?.start_date && task.start_date < todayText());
const formatDate = value => {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

export default function FleetMaintenanceWorkspace({ equipment, tasks = [], isAdmin, initialTab = "overview", onBack, onEditSchedule, onNewSchedule }) {
  const retired = equipment?.status === "retired";
  const [tab, setTab] = useState(initialTab);
  const [workOrders, setWorkOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setTab(initialTab);
    setLoading(true);
    setError("");
    Promise.all([
      filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { equipment_id: equipment.id }, "-created_date", { label: `${equipment.name} Fleet work-order history` }),
      filterAllFleetRows(base44.entities.FleetEquipmentLog, { equipment_id: equipment.id }, "-created_date", { label: `${equipment.name} Fleet equipment usage history` }),
    ]).then(([woRows, logRows]) => {
      if (!mounted) return;
      setWorkOrders(woRows || []);
      setLogs(logRows || []);
    }).catch(err => {
      if (mounted) setError(err?.message || "Unable to load this equipment maintenance workspace.");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [equipment.id, equipment.name, initialTab]);

  const activeOrders = useMemo(() => workOrders.filter(row => ACTIVE.has(row.status)), [workOrders]);
  const historicalOrders = useMemo(() => workOrders.filter(row => !ACTIVE.has(row.status)), [workOrders]);
  const pendingSchedules = useMemo(() => tasks.filter(task => ["pending", "overdue"].includes(task.status)), [tasks]);
  const overdueSchedules = useMemo(() => pendingSchedules.filter(isOverdue), [pendingSchedules]);
  const nextMaintenance = useMemo(() => pendingSchedules.filter(task => task.start_date).slice().sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] || null, [pendingSchedules]);
  const plannedParts = useMemo(() => tasks.flatMap(task => (task.parts_needed || []).map(row => ({ ...row, taskTitle: task.title }))), [tasks]);
  const plannedFluids = useMemo(() => tasks.flatMap(task => (task.fluids_needed || []).map(row => ({ ...row, taskTitle: task.title }))), [tasks]);
  const partLogs = useMemo(() => logs.filter(log => log.item_type === "part"), [logs]);
  const fluidLogs = useMemo(() => logs.filter(log => log.item_type === "fluid"), [logs]);

  const tabs = [
    ["overview", "Overview"],
    ["schedule", "Schedule"],
    ["active", "Active Work"],
    ["history", "History"],
    ["usage", "Parts & Fluids"],
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <button onClick={onBack} className="mt-1 shrink-0 p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800" aria-label="Back to maintenance equipment"><ArrowLeft className="w-4 h-4" /></button>
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">{equipment.photo_url ? <img src={equipment.photo_url} alt="" className="w-full h-full object-cover" /> : <Truck className="w-7 h-7 text-gray-400" />}</div>
            <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Maintenance Workspace</div><h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 truncate">{equipment.name}</h2><p className="text-sm text-gray-500 dark:text-slate-400 truncate">{[equipment.year, equipment.make, equipment.model].filter(Boolean).join(" ") || pretty(equipment.type)}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(equipment.id)}`} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 text-sm inline-flex items-center gap-2"><Truck className="w-4 h-4" />Vehicle Hub</Link>
            {!retired && <Link to={`${createPageUrl("FleetWorkOrders")}?equipment=${encodeURIComponent(equipment.id)}&new=1`} className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 text-sm font-medium inline-flex items-center gap-2"><Plus className="w-4 h-4" />New Work Order</Link>}
            {isAdmin && !retired && <button onClick={onNewSchedule} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" />New Schedule</button>}
          </div>
        </div>
        <div className="px-3 sm:px-5 border-t border-gray-100 dark:border-slate-800 overflow-x-auto overscroll-x-contain"><div role="tablist" aria-label={`${equipment.name} maintenance sections`} className="flex min-w-max">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 px-3 sm:px-4 py-3 text-sm font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${tab === key ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"}`}>{label}</button>)}</div></div>
      </div>

      {retired && <div className="rounded-lg border border-gray-200 bg-gray-50 dark:bg-slate-900 dark:border-slate-700 px-4 py-3 text-sm text-gray-700 dark:text-slate-300"><b>Retired archive:</b> maintenance history and schedules remain available for review, but new schedules and new work orders are disabled until this equipment is reactivated.</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
      {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-gray-400" /></div> : <>
        {tab === "overview" && <Overview equipment={equipment} tasks={tasks} activeOrders={activeOrders} overdueSchedules={overdueSchedules} nextMaintenance={nextMaintenance} historicalOrders={historicalOrders} onOpenSchedule={() => setTab("schedule")} onOpenActive={() => setTab("active")} />}
        {tab === "schedule" && <ScheduleTab tasks={tasks} isAdmin={isAdmin} retired={retired} onEditSchedule={onEditSchedule} onNewSchedule={onNewSchedule} />}
        {tab === "active" && <WorkOrdersTab equipment={equipment} rows={activeOrders} active />}
        {tab === "history" && <HistoryTab equipment={equipment} workOrders={historicalOrders} logs={logs} />}
        {tab === "usage" && <UsageTab plannedParts={plannedParts} plannedFluids={plannedFluids} partLogs={partLogs} fluidLogs={fluidLogs} />}
      </>}
    </div>
  );
}

function Overview({ equipment, tasks, activeOrders, overdueSchedules, nextMaintenance, historicalOrders, onOpenSchedule, onOpenActive }) {
  const completed = historicalOrders.filter(row => row.status === "completed");
  return <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Summary icon={AlertTriangle} label="Overdue" value={overdueSchedules.length} danger={overdueSchedules.length > 0} />
      <Summary icon={CalendarClock} label="Schedules" value={tasks.filter(task => task.status !== "completed").length} />
      <Summary icon={Wrench} label="Active Work" value={activeOrders.length} attention={activeOrders.length > 0} />
      <Summary icon={CheckCircle2} label="Completed WOs" value={completed.length} />
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Next Maintenance" icon={Clock3} action={<button onClick={onOpenSchedule} className="text-xs text-indigo-600 dark:text-indigo-300">View schedule</button>}>
        {nextMaintenance ? <div><div className={`font-semibold ${isOverdue(nextMaintenance) ? "text-red-700 dark:text-red-300" : "text-gray-900 dark:text-slate-100"}`}>{nextMaintenance.title}</div><div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{isOverdue(nextMaintenance) ? "Overdue since" : "Due"} {formatDate(nextMaintenance.start_date)}</div><div className="text-xs text-gray-400 mt-1">{nextMaintenance.type === "one_off" ? "One-time" : pretty(nextMaintenance.frequency)} · {pretty(nextMaintenance.priority)} priority</div></div> : <Empty>No pending maintenance schedule for {equipment.name}.</Empty>}
      </Panel>
      <Panel title="Active Work" icon={ClipboardList} action={<button onClick={onOpenActive} className="text-xs text-indigo-600 dark:text-indigo-300">View active work</button>}>
        <div className="space-y-2">{activeOrders.slice(0, 4).map(row => <WorkOrderCompact key={row.id} equipment={equipment} row={row} />)}{activeOrders.length === 0 && <Empty>No active Fleet work orders.</Empty>}</div>
      </Panel>
    </div>
    {overdueSchedules.length > 0 && <Panel title="Needs Attention" icon={AlertTriangle}><div className="space-y-2">{overdueSchedules.map(task => <div key={task.id} className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 p-3"><div className="font-medium text-red-800 dark:text-red-200">{task.title}</div><div className="text-xs text-red-600 dark:text-red-300 mt-1">Due {formatDate(task.start_date)} · {pretty(task.priority)} priority</div></div>)}</div></Panel>}
  </div>;
}

function ScheduleTab({ tasks, isAdmin, retired = false, onEditSchedule, onNewSchedule }) {
  return <Panel title="Maintenance Schedule" icon={CalendarClock} action={isAdmin && !retired ? <button onClick={onNewSchedule} className="text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><Plus className="w-4 h-4" />New Schedule</button> : null}>
    <div className="space-y-3">{tasks.map(task => <div key={task.id} className={`rounded-xl border p-3 sm:p-4 ${isOverdue(task) ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20" : "border-gray-200 dark:border-slate-700"}`}><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><div className="font-semibold text-gray-900 dark:text-slate-100">{task.title}</div>{isOverdue(task) && <span className="text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 px-2 py-0.5">Overdue</span>}<span className="text-xs rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 capitalize">{pretty(task.status)}</span></div><div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{task.type === "one_off" ? "One-time" : pretty(task.frequency)} · due {formatDate(task.start_date)} · {pretty(task.priority)} priority</div>{task.description && <div className="text-sm text-gray-600 dark:text-slate-300 mt-2 whitespace-pre-wrap">{task.description}</div>}<div className="text-xs text-gray-400 mt-2">{task.parts_needed?.length || 0} planned part item(s) · {task.fluids_needed?.length || 0} planned fluid item(s){task.assigned_to ? ` · assigned ${task.assigned_to}` : ""}</div></div>{isAdmin && !retired && <button onClick={() => onEditSchedule(task)} className="shrink-0 text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><Pencil className="w-4 h-4" />Edit</button>}</div></div>)}{tasks.length === 0 && <Empty>No maintenance schedules are configured for this equipment.</Empty>}</div>
  </Panel>;
}

function WorkOrdersTab({ equipment, rows, active = false }) {
  return <Panel title={active ? "Active Work" : "Work Orders"} icon={Wrench} action={<Link to={`${createPageUrl("FleetWorkOrders")}?equipment=${encodeURIComponent(equipment.id)}`} className="text-xs text-indigo-600 dark:text-indigo-300">Open full Work Orders</Link>}><div className="space-y-2">{rows.map(row => <WorkOrderCompact key={row.id} equipment={equipment} row={row} detailed />)}{rows.length === 0 && <Empty>{active ? "No active Fleet work orders." : "No Fleet work orders."}</Empty>}</div></Panel>;
}

function HistoryTab({ equipment, workOrders, logs }) {
  return <div className="grid xl:grid-cols-2 gap-4">
    <Panel title="Completed / Closed Work" icon={History}><div className="space-y-2">{workOrders.map(row => <WorkOrderCompact key={row.id} equipment={equipment} row={row} detailed />)}{workOrders.length === 0 && <Empty>No completed or cancelled work orders.</Empty>}</div></Panel>
    <Panel title="Usage History" icon={Package}><div className="space-y-2">{logs.map(log => <div key={log.id} className="py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-gray-800 dark:text-slate-200">{log.item_name}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 capitalize">{pretty(log.item_type)} · {log.quantity_used} {log.unit || ""}{log.recorded_by ? ` · ${log.recorded_by}` : ""}</div>{log.notes && <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{log.notes}</div>}</div><span className="text-xs text-gray-400 whitespace-nowrap">{log.created_date ? new Date(log.created_date).toLocaleDateString() : "—"}</span></div></div>)}{logs.length === 0 && <Empty>No part or fluid usage history.</Empty>}</div></Panel>
  </div>;
}

function UsageTab({ plannedParts, plannedFluids, partLogs, fluidLogs }) {
  return <div className="grid xl:grid-cols-2 gap-4">
    <div className="space-y-4"><Panel title="Planned Parts" icon={Package}><UsageRows rows={plannedParts} nameKey="part_name" /></Panel><Panel title="Part Usage History" icon={History}><LogRows rows={partLogs} /></Panel></div>
    <div className="space-y-4"><Panel title="Planned Fluids" icon={Droplets}><UsageRows rows={plannedFluids} nameKey="fluid_type" /></Panel><Panel title="Fluid Usage History" icon={History}><LogRows rows={fluidLogs} /></Panel></div>
  </div>;
}

function WorkOrderCompact({ equipment, row, detailed = false }) {
  return <Link to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(row.id)}&equipment=${encodeURIComponent(equipment.id)}`} className="block rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-indigo-300 dark:hover:border-indigo-700"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium text-gray-900 dark:text-slate-100">{row.work_order_number} · {row.title}</div><span className={`text-xs rounded-full px-2 py-0.5 capitalize ${["critical", "high"].includes(row.priority) ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-gray-100 dark:bg-slate-800"}`}>{pretty(row.status)}</span></div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{pretty(row.priority)} priority · {row.assigned_to || "Unassigned"}{row.completed_date ? ` · completed ${formatDate(row.completed_date)}` : ""}</div>{detailed && row.description && <div className="text-xs text-gray-500 dark:text-slate-400 mt-2 line-clamp-2">{row.description}</div>}</Link>;
}

function UsageRows({ rows, nameKey }) {
  if (!rows.length) return <Empty>Nothing currently planned.</Empty>;
  return <div className="space-y-2">{rows.map((row, index) => <div key={`${row.taskTitle}-${row[nameKey]}-${index}`} className="py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="text-sm font-medium text-gray-800 dark:text-slate-200">{row[nameKey] || "Unnamed item"}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{row.quantity ?? "—"}{row.unit ? ` ${row.unit}` : ""} · {row.taskTitle}</div>{row.notes && <div className="text-xs text-gray-400 mt-1">{row.notes}</div>}</div>)}</div>;
}
function LogRows({ rows }) { if (!rows.length) return <Empty>No usage recorded.</Empty>; return <div className="space-y-2">{rows.map(row => <div key={row.id} className="py-2 border-b border-gray-100 dark:border-slate-800 last:border-0"><div className="text-sm font-medium text-gray-800 dark:text-slate-200">{row.item_name}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{row.quantity_used} {row.unit || ""}{row.created_date ? ` · ${new Date(row.created_date).toLocaleDateString()}` : ""}</div></div>)}</div>; }
function Panel({ title, icon: Icon, action = null, children }) { return <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm"><div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3"><h3 className="font-semibold text-gray-900 dark:text-slate-100 inline-flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-500" />{title}</h3>{action}</div><div className="p-4">{children}</div></section>; }
function Summary({ icon: Icon, label, value, attention = false, danger = false }) { const style = danger ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"; const valueStyle = danger ? "text-red-700 dark:text-red-300" : attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"; return <div className={`rounded-xl border p-3 ${style}`}><div className="flex items-center justify-between gap-2"><span className="text-xs text-gray-400">{label}</span><Icon className="w-4 h-4 text-gray-400" /></div><div className={`text-2xl font-bold mt-1 ${valueStyle}`}>{value}</div></div>; }
function Empty({ children }) { return <div className="text-sm text-gray-400 py-3">{children}</div>; }
