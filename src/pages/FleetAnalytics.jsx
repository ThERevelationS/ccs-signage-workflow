import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Loader2,
  Package,
  TimerReset,
  Truck,
  Wrench,
} from "lucide-react";

const ACTIVE_WO = new Set(["open", "assigned", "in_progress"]);
const DAY_MS = 86400000;
const EASTERN_TODAY = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const money = (value) => Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const finiteOrNull = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
function recordedLineCost(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + num(row?.cost), 0);
}

function recordedServiceCost(workOrder) {
  const explicit = finiteOrNull(workOrder?.total_cost);
  if (explicit !== null) return explicit;
  return recordedLineCost(workOrder?.parts_used) + recordedLineCost(workOrder?.fluids_used);
}

function dateSpanDays(startText, endText) {
  if (!startText || !endText) return null;
  const start = Date.parse(`${startText}T12:00:00`);
  const end = Date.parse(`${endText}T12:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

function isOverdueTask(task, today) {
  return task?.status === "overdue" || (task?.status === "pending" && !!task?.start_date && task.start_date < today);
}

export default function FleetAnalytics() {
  const [user, setUser] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const currentUser = await base44.auth.me().catch(() => null);
      setUser(currentUser);
      if (currentUser?.role !== "admin") return;
      const [equipmentRows, workOrderRows, taskRows] = await Promise.all([
        listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment analytics" }),
        listAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, "-created_date", { label: "Fleet maintenance work-order analytics" }),
        listAllFleetRows(base44.entities.FleetMaintenanceTask, "start_date", { label: "Fleet maintenance schedule analytics" }),
      ]);
      setEquipment(equipmentRows || []);
      setWorkOrders(workOrderRows || []);
      setTasks(taskRows || []);
    } catch (e) {
      setError(e?.message || "Unable to load Fleet analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const equipmentNames = useMemo(() => Object.fromEntries(equipment.map(row => [row.id, row.name])), [equipment]);
  const years = useMemo(() => {
    const found = new Set([String(new Date().getFullYear())]);
    workOrders.forEach(row => {
      const year = String(row.completed_date || row.started_date || row.created_date || "").slice(0, 4);
      if (/^\d{4}$/.test(year)) found.add(year);
    });
    return [...found].sort((a, b) => Number(b) - Number(a));
  }, [workOrders]);

  const analytics = useMemo(() => {
    const today = EASTERN_TODAY();
    const completed = workOrders.filter(row => row.status === "completed");
    const active = workOrders.filter(row => ACTIVE_WO.has(row.status));
    const selectedCompleted = completed.filter(row => String(row.completed_date || "").startsWith(`${selectedYear}-`));

    const partsCost = completed.reduce((sum, row) => sum + recordedLineCost(row.parts_used), 0);
    const fluidsCost = completed.reduce((sum, row) => sum + recordedLineCost(row.fluids_used), 0);
    const serviceCost = completed.reduce((sum, row) => sum + recordedServiceCost(row), 0);
    const laborHours = completed.reduce((sum, row) => sum + num(row.actual_hours), 0);
    const yearServiceCost = selectedCompleted.reduce((sum, row) => sum + recordedServiceCost(row), 0);

    const monthly = Array.from({ length: 12 }, (_, month) => ({
      month,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(2026, month, 1)),
      cost: 0,
      workOrders: 0,
      laborHours: 0,
    }));
    selectedCompleted.forEach(row => {
      const month = Number(String(row.completed_date || "").slice(5, 7)) - 1;
      if (month < 0 || month > 11) return;
      monthly[month].cost += recordedServiceCost(row);
      monthly[month].workOrders += 1;
      monthly[month].laborHours += num(row.actual_hours);
    });

    const byEquipment = equipment.map(eq => {
      const completedRows = completed.filter(row => row.equipment_id === eq.id);
      const activeRows = active.filter(row => row.equipment_id === eq.id);
      const eqTasks = tasks.filter(row => row.equipment_id === eq.id && row.status !== "completed");
      const taskIdsWithActiveWork = new Set(activeRows.map(row => row.maintenance_task_id).filter(Boolean));
      const overdueUncovered = eqTasks.filter(task => isOverdueTask(task, today) && !taskIdsWithActiveWork.has(task.id));
      const compliance = eqTasks.length ? Math.round(((eqTasks.length - overdueUncovered.length) / eqTasks.length) * 100) : null;
      const completedWithSpans = completedRows.map(row => ({ row, days: dateSpanDays(row.started_date, row.completed_date) })).filter(item => item.days !== null);
      const activeWithSpans = activeRows.map(row => ({ row, days: dateSpanDays(row.started_date, today) })).filter(item => item.days !== null);
      const longestActive = activeWithSpans.slice().sort((a, b) => b.days - a.days)[0] || null;
      return {
        eq,
        serviceCost: completedRows.reduce((sum, row) => sum + recordedServiceCost(row), 0),
        partsCost: completedRows.reduce((sum, row) => sum + recordedLineCost(row.parts_used), 0),
        fluidsCost: completedRows.reduce((sum, row) => sum + recordedLineCost(row.fluids_used), 0),
        laborHours: completedRows.reduce((sum, row) => sum + num(row.actual_hours), 0),
        completedCount: completedRows.length,
        activeCount: activeRows.length,
        activeScheduleCount: eqTasks.length,
        overdueUncovered: overdueUncovered.length,
        compliance,
        averageCycleDays: completedWithSpans.length ? completedWithSpans.reduce((sum, item) => sum + item.days, 0) / completedWithSpans.length : null,
        longestActiveCycle: longestActive,
      };
    });

    const activeSchedules = tasks.filter(row => row.status !== "completed");
    const activeTaskIds = new Set(active.map(row => row.maintenance_task_id).filter(Boolean));
    const uncoveredOverdue = activeSchedules.filter(task => isOverdueTask(task, today) && !activeTaskIds.has(task.id));
    const complianceScore = activeSchedules.length ? Math.round(((activeSchedules.length - uncoveredOverdue.length) / activeSchedules.length) * 100) : null;
    const downAssets = equipment.filter(row => row.status === "down");
    const maintenanceAssets = equipment.filter(row => row.status === "maintenance");
    const activeCycleRows = active.map(row => ({ row, days: dateSpanDays(row.started_date, today) })).filter(item => item.days !== null).sort((a, b) => b.days - a.days);
    const completedCycleRows = completed.map(row => ({ row, days: dateSpanDays(row.started_date, row.completed_date) })).filter(item => item.days !== null);

    return {
      completed,
      active,
      partsCost,
      fluidsCost,
      serviceCost,
      laborHours,
      yearServiceCost,
      selectedCompleted,
      monthly,
      byEquipment,
      activeSchedules,
      uncoveredOverdue,
      complianceScore,
      downAssets,
      maintenanceAssets,
      longestActiveCycle: activeCycleRows[0] || null,
      averageCompletedCycle: completedCycleRows.length ? completedCycleRows.reduce((sum, item) => sum + item.days, 0) / completedCycleRows.length : null,
    };
  }, [equipment, workOrders, tasks, selectedYear]);

  if (loading) return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="py-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div></div>;
  if (user?.role !== "admin") return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-3xl mx-auto p-6"><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><div className="font-semibold">Admin access required</div><p className="text-sm mt-1">Fleet cost and maintenance analytics are restricted to CCS administrators.</p></div></div></div>;

  const maxMonthCost = Math.max(...analytics.monthly.map(row => row.cost), 1);
  const rankedCost = analytics.byEquipment.slice().sort((a, b) => b.serviceCost - a.serviceCost);
  const complianceRows = analytics.byEquipment.slice().sort((a, b) => {
    if (a.compliance === null && b.compliance === null) return String(a.eq.name).localeCompare(String(b.eq.name));
    if (a.compliance === null) return 1;
    if (b.compliance === null) return -1;
    if (a.compliance !== b.compliance) return a.compliance - b.compliance;
    return b.overdueUncovered - a.overdueUncovered;
  });

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950">
    <FleetModuleNav />
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Analytics</h1><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Fleet maintenance cost, service-cycle, and schedule-compliance reporting. Completely separate from CCS estimating, pricing, and signage financial systems.</p></div>
        <div className="flex items-center gap-2"><label className="text-xs font-semibold text-gray-500 dark:text-slate-400" htmlFor="fleet-analytics-year">Cost year</label><select id="fleet-analytics-year" value={selectedYear} onChange={event => setSelectedYear(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">{years.map(year => <option key={year} value={year}>{year}</option>)}</select></div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric icon={CircleDollarSign} label="Recorded service cost" value={money(analytics.serviceCost)} sub={`${analytics.completed.length} completed WOs`} />
        <Metric icon={Package} label="Recorded parts + fluids" value={money(analytics.partsCost + analytics.fluidsCost)} sub={`${money(analytics.partsCost)} parts · ${money(analytics.fluidsCost)} fluids`} />
        <Metric icon={Clock3} label="Recorded labor hours" value={analytics.laborHours.toFixed(1)} sub="No Fleet labor rate is configured" />
        <Metric icon={CheckCircle2} label="Maintenance compliance" value={analytics.complianceScore === null ? "N/A" : `${analytics.complianceScore}%`} sub={`${analytics.uncoveredOverdue.length} overdue schedule${analytics.uncoveredOverdue.length === 1 ? "" : "s"} without active linked work`} attention={analytics.uncoveredOverdue.length > 0} />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Metric icon={Truck} label="Currently down" value={analytics.downAssets.length} sub={analytics.downAssets.map(row => row.name).join(", ") || "No assets marked down"} danger={analytics.downAssets.length > 0} />
        <Metric icon={Wrench} label="Currently in maintenance" value={analytics.maintenanceAssets.length} sub={analytics.maintenanceAssets.map(row => row.name).join(", ") || "No assets marked maintenance"} attention={analytics.maintenanceAssets.length > 0} />
        <Metric icon={TimerReset} label="Longest active maintenance cycle" value={analytics.longestActiveCycle ? `${analytics.longestActiveCycle.days} days` : "N/A"} sub={analytics.longestActiveCycle ? `${analytics.longestActiveCycle.row.work_order_number} · ${equipmentNames[analytics.longestActiveCycle.row.equipment_id] || "Unresolved equipment"}` : "No active WO has a start date"} />
      </div>

      <Methodology />

      <div className="grid xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Service Cost by Month · {selectedYear}</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Completed Fleet work orders only · {money(analytics.yearServiceCost)} recorded for the year.</p></div><BarChart3 className="w-5 h-5 text-indigo-500" /></div>
          <div className="p-4 overflow-x-auto"><div className="min-w-[720px] h-64 flex items-end gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">{analytics.monthly.map(row => <div key={row.month} className="flex-1 h-full flex flex-col justify-end items-center gap-1"><div className="text-[10px] text-gray-500 dark:text-slate-400 whitespace-nowrap">{row.cost > 0 ? money(row.cost) : ""}</div><div className="w-full rounded-t bg-indigo-500/80 min-h-[2px]" style={{ height: `${Math.max(2, (row.cost / maxMonthCost) * 170)}px` }} title={`${row.label}: ${money(row.cost)} · ${row.workOrders} completed work orders`} /><div className="text-xs font-semibold text-gray-600 dark:text-slate-300">{row.label}</div><div className="text-[10px] text-gray-400">{row.workOrders} WO{row.workOrders === 1 ? "" : "s"}</div></div>)}</div></div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800"><h2 className="font-semibold text-gray-900 dark:text-slate-100">Service-Cycle Snapshot</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Timing proxy, not true downtime.</p></div>
          <div className="p-4 space-y-4"><Info label="Average completed maintenance cycle" value={analytics.averageCompletedCycle === null ? "N/A" : `${analytics.averageCompletedCycle.toFixed(1)} days`} /><Info label="Active Fleet work orders" value={String(analytics.active.length)} /><Info label="Completed Fleet work orders" value={String(analytics.completed.length)} /><Info label="Active maintenance schedules" value={String(analytics.activeSchedules.length)} /><Info label="Overdue without linked active work" value={String(analytics.uncoveredOverdue.length)} attention={analytics.uncoveredOverdue.length > 0} /></div>
        </section>
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800"><h2 className="font-semibold text-gray-900 dark:text-slate-100">Most Expensive Assets</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Ranked by recorded completed-service cost across preserved Fleet history.</p></div>
          <div className="divide-y divide-gray-100 dark:divide-slate-800">{rankedCost.map((row, index) => <Link key={row.eq.id} to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(row.eq.id)}&tab=history`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/40"><div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-gray-500">{index + 1}</div><div className="min-w-0 flex-1"><div className="font-medium text-gray-900 dark:text-slate-100 truncate">{row.eq.name}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{row.completedCount} completed WOs · {row.laborHours.toFixed(1)} labor hrs</div></div><div className="text-right"><div className="font-semibold text-gray-900 dark:text-slate-100">{money(row.serviceCost)}</div><div className="text-[10px] text-gray-400">parts {money(row.partsCost)} · fluids {money(row.fluidsCost)}</div></div></Link>)}</div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800"><h2 className="font-semibold text-gray-900 dark:text-slate-100">Maintenance Compliance by Asset</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">An overdue schedule is considered covered when an active work order links to that exact schedule.</p></div>
          <div className="divide-y divide-gray-100 dark:divide-slate-800">{complianceRows.map(row => <Link key={row.eq.id} to={`${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(row.eq.id)}`} className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/40"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-medium text-gray-900 dark:text-slate-100 truncate">{row.eq.name}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{row.activeScheduleCount} active schedule{row.activeScheduleCount === 1 ? "" : "s"} · {row.activeCount} active WO{row.activeCount === 1 ? "" : "s"}</div></div><div className={`text-lg font-bold ${row.compliance === null ? "text-gray-400" : row.compliance < 100 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{row.compliance === null ? "N/A" : `${row.compliance}%`}</div></div>{row.overdueUncovered > 0 && <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300"><AlertTriangle className="w-3.5 h-3.5" />{row.overdueUncovered} overdue schedule{row.overdueUncovered === 1 ? "" : "s"} without linked active work</div>}</Link>)}</div>
        </section>
      </div>
    </div>
  </div>;
}

function Methodology() {
  return <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200"><div className="font-semibold">How these Fleet metrics are calculated</div><div className="mt-1 leading-relaxed">Recorded service cost uses a saved work-order total when one exists; otherwise it sums the already-extended part and fluid line costs stored on completed Fleet work orders. Labor is shown only as recorded hours because Fleet Settings has no authoritative labor rate. “Maintenance cycle” measures the span from a work order's started date to completion (or today for active work); it is a timing proxy and is <b>not</b> labeled as true vehicle downtime. Compliance counts active schedules and treats an overdue schedule as covered when an active Fleet work order links to that exact schedule.</div></div>;
}

function Metric({ icon: Icon, label, value, sub, attention = false, danger = false }) {
  const style = danger ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  const valueStyle = danger ? "text-red-700 dark:text-red-300" : attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100";
  return <div className={`rounded-xl border p-4 ${style}`}><div className="flex items-start justify-between gap-2"><div className="text-xs text-gray-500 dark:text-slate-400">{label}</div><Icon className="w-4 h-4 text-gray-400 shrink-0" /></div><div className={`text-2xl font-bold mt-1 ${valueStyle}`}>{value}</div><div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{sub}</div></div>;
}

function Info({ label, value, attention = false }) {
  return <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800"><div className="text-sm text-gray-600 dark:text-slate-300">{label}</div><div className={`text-sm font-semibold text-right ${attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"}`}>{value}</div></div>;
}
