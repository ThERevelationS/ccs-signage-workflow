import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { filterAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import FleetMeterRuleDialog from "@/components/fleet/FleetMeterRuleDialog";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Droplets,
  Gauge,
  History,
  Loader2,
  Package,
  Pencil,
  Plus,
  Truck,
  Wrench,
} from "lucide-react";
import { invokeFleet } from "@/components/fleet/fleetInvoke";

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
  const [meterRows, setMeterRows] = useState([]);
  const [meterDialog, setMeterDialog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setTab(initialTab);
    setLoading(true);
    setError("");
    Promise.all([
      filterAllFleetRows("FleetMaintenanceWorkOrder", { equipment_id: equipment.id }, "-created_date", { label: `${equipment.name} Fleet work-order history` }),
      filterAllFleetRows("FleetEquipmentLog", { equipment_id: equipment.id }, "-created_date", { label: `${equipment.name} Fleet equipment usage history` }),
      invokeFleet("fleetMeterMaintenanceAction", { action: "status", equipment_id: equipment.id }),
    ]).then(([woRows, logRows, meterResponse]) => {
      if (!mounted) return;
      setWorkOrders(woRows || []);
      setLogs(logRows || []);
      if (meterResponse?.data?.error) throw new Error(meterResponse.data.error);
      setMeterRows(meterResponse?.data?.rows || []);
    }).catch(err => {
      if (mounted) setError(err?.message || "Unable to load this equipment maintenance workspace.");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [equipment.id, equipment.name, initialTab]);

  const refreshMeterStatus = async () => {
    try {
      const { data } = await invokeFleet("fleetMeterMaintenanceAction", { action: "status", equipment_id: equipment.id });
      if (data?.error) throw new Error(data.error);
      setMeterRows(data?.rows || []);
    } catch (err) {
      setError(err?.message || "Unable to refresh meter maintenance status.");
    }
  };

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
    ["meter", "Mileage / Hours"],
    ["active", "Active Work"],
    ["timeline", "Timeline"],
    ["history", "History"],
    ["usage", "Parts & Fluids"],
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <button type="button" onClick={onBack} className="mt-1 min-h-11 min-w-11 shrink-0 p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900" aria-label="Back to maintenance equipment"><ArrowLeft className="w-4 h-4" /></button>
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">{equipment.photo_url ? <img src={equipment.photo_url} alt="" className="w-full h-full object-cover" /> : <Truck className="w-7 h-7 text-gray-400" />}</div>
            <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Maintenance Workspace</div><h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 truncate">{equipment.name}</h2><p className="text-sm text-gray-500 dark:text-slate-400 truncate">{[equipment.year, equipment.make, equipment.model].filter(Boolean).join(" ") || pretty(equipment.type)}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(equipment.id)}`} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 text-sm inline-flex items-center gap-2"><Truck className="w-4 h-4" />Vehicle Hub</Link>
            {!retired && <Link to={`${createPageUrl("FleetWorkOrders")}?equipment=${encodeURIComponent(equipment.id)}&new=1`} className="min-h-11 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 text-sm font-medium inline-flex items-center gap-2"><Plus className="w-4 h-4" />New Work Order</Link>}
            {isAdmin && !retired && <button type="button" onClick={onNewSchedule} className="min-h-11 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"><CalendarClock className="w-4 h-4" />New Schedule</button>}
          </div>
        </div>
        <div className="px-3 sm:px-5 border-t border-gray-100 dark:border-slate-800 overflow-x-auto overscroll-x-contain"><div role="tablist" aria-label={`${equipment.name} maintenance sections`} className="flex min-w-max">{tabs.map(([key, label]) => <button type="button" key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 px-3 sm:px-4 py-3 text-sm font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${tab === key ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"}`}>{label}</button>)}</div></div>
      </div>

      {retired && <div className="rounded-lg border border-gray-200 bg-gray-50 dark:bg-slate-900 dark:border-slate-700 px-4 py-3 text-sm text-gray-700 dark:text-slate-300"><b>Retired archive:</b> maintenance history and schedules remain available for review, but new schedules and new work orders are disabled until this equipment is reactivated.</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
      {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-gray-400" /></div> : <>
        {tab === "overview" && <Overview equipment={equipment} tasks={tasks} activeOrders={activeOrders} overdueSchedules={overdueSchedules} nextMaintenance={nextMaintenance} historicalOrders={historicalOrders} onOpenSchedule={() => setTab("schedule")} onOpenActive={() => setTab("active")} />}
        {tab === "schedule" && <ScheduleTab tasks={tasks} meterRows={meterRows} isAdmin={isAdmin} retired={retired} onEditSchedule={onEditSchedule} onNewSchedule={onNewSchedule} />}
        {tab === "meter" && <MeterTab equipment={equipment} tasks={tasks} rows={meterRows} isAdmin={isAdmin} retired={retired} onAdd={() => setMeterDialog({ rule: null })} onEdit={rule => setMeterDialog({ rule })} />}
        {tab === "active" && <WorkOrdersTab equipment={equipment} rows={activeOrders} active />}
        {tab === "timeline" && <MaintenanceTimeline equipment={equipment} tasks={tasks} workOrders={workOrders} logs={logs} meterRows={meterRows} />}
        {tab === "history" && <HistoryTab equipment={equipment} workOrders={historicalOrders} logs={logs} />}
        {tab === "usage" && <UsageTab plannedParts={plannedParts} plannedFluids={plannedFluids} partLogs={partLogs} fluidLogs={fluidLogs} />}
      </>}
      <FleetMeterRuleDialog open={!!meterDialog} equipment={equipment} tasks={tasks} rule={meterDialog?.rule || null} onClose={() => setMeterDialog(null)} onSaved={refreshMeterStatus} />
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
      <Panel title="Next Maintenance" icon={Clock3} action={<button type="button" onClick={onOpenSchedule} className="min-h-11 px-2 text-xs text-indigo-600 dark:text-indigo-300 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-md">View schedule</button>}>
        {nextMaintenance ? <div><div className={`font-semibold ${isOverdue(nextMaintenance) ? "text-red-700 dark:text-red-300" : "text-gray-900 dark:text-slate-100"}`}>{nextMaintenance.title}</div><div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{isOverdue(nextMaintenance) ? "Overdue since" : "Due"} {formatDate(nextMaintenance.start_date)}</div><div className="text-xs text-gray-400 mt-1">{nextMaintenance.type === "one_off" ? "One-time" : pretty(nextMaintenance.frequency)} · {pretty(nextMaintenance.priority)} priority</div></div> : <Empty>No pending maintenance schedule for {equipment.name}.</Empty>}
      </Panel>
      <Panel title="Active Work" icon={ClipboardList} action={<button type="button" onClick={onOpenActive} className="min-h-11 px-2 text-xs text-indigo-600 dark:text-indigo-300 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-md">View active work</button>}>
        <div className="space-y-2">{activeOrders.slice(0, 4).map(row => <WorkOrderCompact key={row.id} equipment={equipment} row={row} />)}{activeOrders.length === 0 && <Empty>No active Fleet work orders.</Empty>}</div>
      </Panel>
    </div>
    {overdueSchedules.length > 0 && <Panel title="Needs Attention" icon={AlertTriangle}><div className="space-y-2">{overdueSchedules.map(task => <div key={task.id} className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 p-3"><div className="font-medium text-red-800 dark:text-red-200">{task.title}</div><div className="text-xs text-red-600 dark:text-red-300 mt-1">Due {formatDate(task.start_date)} · {pretty(task.priority)} priority</div></div>)}</div></Panel>}
  </div>;
}

function ScheduleTab({ tasks, meterRows = [], isAdmin, retired = false, onEditSchedule, onNewSchedule }) {
  const meterByTask = Object.fromEntries(meterRows.map(row => [row.rule?.maintenance_task_id, row]));
  return <Panel title="Maintenance Schedule" icon={CalendarClock} action={isAdmin && !retired ? <button type="button" onClick={onNewSchedule} className="min-h-11 px-2 text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-md"><Plus className="w-4 h-4" />New Schedule</button> : null}>
    <div className="space-y-3">{tasks.map(task => { const meter = meterByTask[task.id]; return <div key={task.id} className={`rounded-xl border p-3 sm:p-4 ${isOverdue(task) || meter?.state?.state === "due" ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20" : "border-gray-200 dark:border-slate-700"}`}><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><div className="font-semibold text-gray-900 dark:text-slate-100">{task.title}</div>{isOverdue(task) && <span className="text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 px-2 py-0.5">Date overdue</span>}{meter?.state?.state === "due" && <span className="text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 px-2 py-0.5">Meter due</span>}{meter?.state?.state === "due_soon" && <span className="text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 px-2 py-0.5">Meter due soon</span>}<span className="text-xs rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 capitalize">{pretty(task.status)}</span></div><div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{task.type === "one_off" ? "One-time" : pretty(task.frequency)} · due {formatDate(task.start_date)} · {pretty(task.priority)} priority</div>{meter && <div className="text-xs text-indigo-600 dark:text-indigo-300 mt-1">{meter.rule.trigger_mode === "meter_only" ? "Meter only" : "Date or meter"} · next {Number(meter.rule.next_due_value ?? 0).toLocaleString()} {meter.reading?.unit || "units"}{meter.reading?.available ? ` · current ${Number(meter.reading.value).toLocaleString()}` : " · current reading unavailable"}</div>}{task.description && <div className="text-sm text-gray-600 dark:text-slate-300 mt-2 whitespace-pre-wrap">{task.description}</div>}<div className="text-xs text-gray-400 mt-2">{task.parts_needed?.length || 0} planned part item(s) · {task.fluids_needed?.length || 0} planned fluid item(s){task.assigned_to ? ` · assigned ${task.assigned_to}` : ""}</div></div>{isAdmin && !retired && <button type="button" onClick={() => onEditSchedule(task)} className="min-h-11 px-2 shrink-0 text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-md"><Pencil className="w-4 h-4" />Edit</button>}</div></div>; })}{tasks.length === 0 && <Empty>No maintenance schedules are configured for this equipment.</Empty>}</div>
  </Panel>;
}

function MeterTab({ equipment, tasks, rows, isAdmin, retired = false, onAdd, onEdit }) {
  const recurringTasks = tasks.filter(task => task.type === "recurring");
  const configuredTaskIds = new Set(rows.map(row => row.rule?.maintenance_task_id).filter(Boolean));
  const canAdd = recurringTasks.some(task => !configuredTaskIds.has(task.id));
  const stateStyle = state => state === "due" ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : state === "due_soon" ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : state === "unavailable" ? "border-gray-300 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/40" : "border-emerald-200 bg-white dark:border-emerald-900/60 dark:bg-slate-900";
  const stateLabel = state => state === "due" ? "Due now" : state === "due_soon" ? "Due soon" : state === "unavailable" ? "Reading unavailable" : state === "disabled" ? "Disabled" : "On track";
  return <div className="space-y-4">
    <Panel title="Mileage / Hours Maintenance" icon={Gauge} action={isAdmin && !retired && canAdd ? <button type="button" onClick={onAdd} className="min-h-11 px-2 text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-md"><Plus className="w-4 h-4" />Add Meter Rule</button> : null}>
      <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-300">Meter rules extend the existing recurring schedule. For tracked vehicles, Bouncie odometer data can be authoritative; non-Bouncie equipment uses its manual Fleet meter. Completing the linked work order advances both the date schedule and meter threshold.</div>
      <div className="space-y-3">{rows.map(row => { const state = row.state?.state || "unavailable"; const reading = row.reading || {}; const unit = reading.unit || (row.rule?.meter_type === "engine_hours" ? "hours" : "miles"); return <div key={row.rule.id} className={`rounded-xl border p-4 ${stateStyle(state)}`}><div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="font-bold text-gray-900 dark:text-slate-100">{row.task_title || "Maintenance schedule"}</div><span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${state === "due" ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" : state === "due_soon" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : state === "unavailable" ? "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>{stateLabel(state)}</span><span className="text-xs rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5">{row.rule.trigger_mode === "meter_only" ? "Meter only" : "Date or meter"}</span></div><div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2"><MeterStat label="Current" value={reading.available ? `${Number(reading.value).toLocaleString()} ${unit}` : "Unavailable"} /><MeterStat label="Next Due" value={`${Number(row.rule.next_due_value ?? 0).toLocaleString()} ${unit}`} /><MeterStat label="Interval" value={`${Number(row.rule.interval_value ?? 0).toLocaleString()} ${unit}`} /><MeterStat label="Remaining" value={row.state?.remaining == null ? "—" : `${Math.max(0, Number(row.state.remaining)).toLocaleString()} ${unit}`} attention={state === "due" || state === "due_soon"} /></div><div className="mt-3 text-xs text-gray-500 dark:text-slate-400">Source: {row.rule.source === "bouncie" ? "Bouncie odometer" : "Fleet manual meter"}{reading.recorded_at ? ` · reading ${new Date(reading.recorded_at).toLocaleString()}` : ""}{reading.reason ? ` · ${pretty(reading.reason)}` : ""}</div>{row.rule.notes && <div className="mt-2 text-xs text-gray-500 dark:text-slate-400">{row.rule.notes}</div>}</div>{isAdmin && !retired && <button type="button" onClick={() => onEdit(row.rule)} className="min-h-11 px-2 shrink-0 text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-md"><Pencil className="w-4 h-4" />Edit</button>}</div></div>; })}{rows.length === 0 && <Empty>No mileage/hour rules are configured for {equipment.name}. Add one to a recurring schedule if this asset should be serviced by usage as well as date.</Empty>}</div>
    </Panel>
  </div>;
}

function MeterStat({ label, value, attention = false }) { return <div className="rounded-lg bg-white/70 dark:bg-slate-950/40 p-2"><div className="text-[10px] uppercase font-bold text-gray-400">{label}</div><div className={`mt-1 text-sm font-bold ${attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"}`}>{value}</div></div>; }

function WorkOrdersTab({ equipment, rows, active = false }) {
  return <Panel title={active ? "Active Work" : "Work Orders"} icon={Wrench} action={<Link to={`${createPageUrl("FleetWorkOrders")}?equipment=${encodeURIComponent(equipment.id)}`} className="min-h-11 px-2 text-xs text-indigo-600 dark:text-indigo-300 inline-flex items-center">Open full Work Orders</Link>}><div className="space-y-2">{rows.map(row => <WorkOrderCompact key={row.id} equipment={equipment} row={row} detailed />)}{rows.length === 0 && <Empty>{active ? "No active Fleet work orders." : "No Fleet work orders."}</Empty>}</div></Panel>;
}

function MaintenanceTimeline({ equipment, tasks, workOrders, logs, meterRows = [] }) {
  const meterByTask = Object.fromEntries(meterRows.map(row => [row.rule?.maintenance_task_id, row]));
  const scheduleRows = tasks
    .filter(task => task.start_date && task.status !== "completed")
    .slice()
    .sort((a,b) => String(a.start_date).localeCompare(String(b.start_date)));
  const historyRows = [];
  for (const order of workOrders) {
    const date = order.completed_date || order.started_date || String(order.created_date || "").slice(0,10);
    if (!date) continue;
    historyRows.push({
      key:`wo:${order.id}`,
      date,
      timestamp:Date.parse(order.completed_date || order.updated_date || order.created_date || date) || 0,
      kind:"work_order",
      title:`${order.work_order_number || "Fleet WO"} · ${order.title || "Maintenance work"}`,
      detail:order.status === "completed" ? `Completed${order.actual_hours != null ? ` · ${order.actual_hours} hr` : ""}${order.total_cost != null ? ` · $${Number(order.total_cost).toFixed(2)}` : ""}` : `${pretty(order.status)} · ${pretty(order.priority)} priority`,
      href:`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(order.id)}&equipment=${encodeURIComponent(equipment.id)}`,
    });
  }
  for (const log of logs) {
    const raw = log.created_date || log.updated_date || "";
    if (!raw) continue;
    historyRows.push({
      key:`log:${log.id}`,
      date:String(raw).slice(0,10),
      timestamp:Date.parse(raw) || 0,
      kind:log.item_type === "fluid" ? "fluid" : "part",
      title:`${log.item_name || "Fleet item"} used`,
      detail:`${log.quantity_used ?? "—"} ${log.unit || ""}${log.recorded_by ? ` · ${log.recorded_by}` : ""}`,
    });
  }
  historyRows.sort((a,b) => b.timestamp - a.timestamp);
  return <div className="space-y-4">
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-300">This timeline is assembled from preserved Fleet schedules, work orders, and usage logs. It is read-only and does not rewrite maintenance history.</div>
    <div className="grid xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.4fr)] gap-4">
      <Panel title="Upcoming & Due" icon={CalendarClock}>
        <div className="space-y-2">{scheduleRows.map(task => { const meter = meterByTask[task.id]; const meterState = meter?.state?.state || ""; const danger = isOverdue(task) || meterState === "due"; return <Link key={task.id} to={`${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(equipment.id)}&tab=schedule`} className={`block rounded-xl border p-3 ${danger ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20" : meterState === "due_soon" ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/15" : "border-gray-200 dark:border-slate-700"}`}><div className="flex items-start gap-3"><div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${danger ? "bg-red-500" : meterState === "due_soon" ? "bg-amber-500" : "bg-indigo-500"}`} /><div className="min-w-0 flex-1"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{task.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Due {formatDate(task.start_date)} · {pretty(task.priority)} priority</div>{meter && <div className="text-[11px] text-indigo-600 dark:text-indigo-300 mt-1">Meter: {meterState === "due" ? "due now" : meterState === "due_soon" ? "due soon" : meter?.reading?.available ? `${Number(meter.reading.value).toLocaleString()} ${meter.reading.unit || "units"} current · next ${Number(meter.rule?.next_due_value || 0).toLocaleString()}` : "reading unavailable"}</div>}</div></div></Link>; })}{scheduleRows.length === 0 && <Empty>No pending maintenance schedule events.</Empty>}</div>
      </Panel>
      <Panel title="Maintenance History" icon={History}>
        <div className="relative pl-5">{historyRows.map((event,index) => <div key={event.key} className="relative pb-4 last:pb-0"><span className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-500 z-10" />{index < historyRows.length - 1 && <span className="absolute -left-[15px] top-4 bottom-0 w-px bg-gray-200 dark:bg-slate-700" />} {event.href ? <Link to={event.href} className="block rounded-lg px-2 py-1.5 -mx-2 hover:bg-gray-50 dark:hover:bg-slate-800/50"><TimelineBody event={event} /></Link> : <div className="rounded-lg px-2 py-1.5 -mx-2"><TimelineBody event={event} /></div>}</div>)}{historyRows.length === 0 && <Empty>No maintenance work or usage history recorded yet.</Empty>}</div>
      </Panel>
    </div>
  </div>;
}

function TimelineBody({ event }) {
  const Icon = event.kind === "work_order" ? ClipboardList : event.kind === "fluid" ? Droplets : Package;
  return <div className="flex items-start gap-2"><Icon className="w-4 h-4 mt-0.5 text-gray-400 shrink-0"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium text-gray-900 dark:text-slate-100">{event.title}</div><div className="text-[11px] text-gray-400 whitespace-nowrap">{formatDate(event.date)}</div></div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{event.detail}</div></div></div>;
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
