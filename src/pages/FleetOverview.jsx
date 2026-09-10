import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { isFluidLowStock } from "@/components/fleet/fleetHelpers";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import {
  Truck,
  ClipboardList,
  CalendarClock,
  Package,
  Droplets,
  ShoppingCart,
  Navigation,
  AlertTriangle,
  Loader2,
  ArrowRight,
  UserRoundX,
  Wrench,
  Clock3,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const statusClass = (status) => {
  const map = {
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
    assigned: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
    open: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
    cancelled: "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return map[status] || map.open;
};

export default function FleetOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminHealth, setAdminHealth] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = await base44.auth.me().catch(() => null);
        if (mounted) setIsAdmin(user?.role === "admin");
        const [equipment, tasks, workOrders, parts, fluids, requests, liveState] = await Promise.all([
          listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment" }),
          listAllFleetRows(base44.entities.FleetMaintenanceTask, "start_date", { label: "Fleet maintenance schedules" }),
          listAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, "-created_date", { label: "Fleet work-order history" }),
          listAllFleetRows(base44.entities.FleetPart, "part_name", { label: "Fleet parts" }),
          listAllFleetRows(base44.entities.FleetFluid, "fluid_name", { label: "Fleet fluids" }),
          listAllFleetRows(base44.entities.FleetPartFluidRequest, "-created_date", { label: "Fleet requests" }),
          listAllFleetRows(base44.entities.BouncieVehicleLiveState, "-last_seen_at", { label: "Bouncie live vehicle state" }),
        ]);
        if (mounted) setData({ equipment, tasks, workOrders, parts, fluids, requests, liveState });
        if (user?.role === "admin") {
          const [maintenanceLog, reminderLog, workerLog, bouncieLog, pendingQueue, failedQueue, startedReceipts, failedReceipts] = await Promise.all([
            base44.entities.FleetSystemLog.filter({ source: "fleetScheduledMaintenanceGeneration" }, "-created_date", 1),
            base44.entities.FleetSystemLog.filter({ source: "fleetScheduledReminders" }, "-created_date", 1),
            base44.entities.FleetSystemLog.filter({ source: "fleetNotificationWorker" }, "-created_date", 1),
            base44.entities.FleetSystemLog.filter({ source: "bouncieSyncNotifications" }, "-created_date", 1),
            base44.entities.FleetNotificationQueue.filter({ status: "pending" }, "-created_date", 100),
            base44.entities.FleetNotificationQueue.filter({ status: "failed" }, "-created_date", 100),
            base44.entities.FleetOperationReceipt.filter({ status: "started" }, "-created_date", 100),
            base44.entities.FleetOperationReceipt.filter({ status: "failed" }, "-created_date", 100),
          ]);
          if (mounted) setAdminHealth({
            logs: [maintenanceLog?.[0], reminderLog?.[0], workerLog?.[0], bouncieLog?.[0]].filter(Boolean),
            unresolved: (pendingQueue?.length || 0) + (failedQueue?.length || 0) + (startedReceipts?.length || 0) + (failedReceipts?.length || 0),
          });
        }
      } catch (e) {
        if (mounted) setError(e?.message || "Unable to load Fleet overview.");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const metrics = useMemo(() => {
    if (!data) return null;
    const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    const activeOrders = data.workOrders
      .filter(w => !["completed", "cancelled"].includes(w.status))
      .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || String(a.work_order_number || "").localeCompare(String(b.work_order_number || "")));
    const highPriorityOrders = activeOrders.filter(w => ["critical", "high"].includes(w.priority));
    const unassignedOrders = activeOrders.filter(w => !String(w.assigned_to || "").trim());
    const lowParts = data.parts.filter(p => p.enable_low_stock_alerts !== false && Number(p.quantity_on_hand ?? 0) <= Number(p.minimum_stock ?? 0));
    const lowFluids = data.fluids.filter(isFluidLowStock);
    const pendingRequests = data.requests.filter(r => ["pending", "ordered"].includes(r.status));
    const uniqueTracked = new Set(data.liveState.map(v => v.vehicle_vin).filter(Boolean)).size;
    const latestLiveStateMs = Math.max(0, ...data.liveState.map(v => Date.parse(v.last_seen_at || v.updated_date || "") || 0));
    const bouncieAgeMinutes = latestLiveStateMs ? Math.floor((Date.now() - latestLiveStateMs) / 60000) : null;
    const bouncieFresh = bouncieAgeMinutes != null && bouncieAgeMinutes <= 30;
    const todayText = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const today = new Date(`${todayText}T12:00:00`);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 14);
    const pendingTasks = data.tasks.filter(t => t.status === "pending" && t.start_date);
    const overdueTasks = pendingTasks.filter(t => new Date(`${t.start_date}T12:00:00`) < today);
    const upcomingTasks = pendingTasks.filter(t => {
      const due = new Date(`${t.start_date}T12:00:00`);
      return due >= today && due <= horizon;
    }).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    return {
      activeOrders,
      highPriorityOrders,
      unassignedOrders,
      lowParts,
      lowFluids,
      lowStock: lowParts.length + lowFluids.length,
      pendingRequests,
      uniqueTracked,
      bouncieAgeMinutes,
      bouncieFresh,
      overdueTasks,
      upcomingTasks,
    };
  }, [data]);

  if (!data && !error) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950">
        <FleetModuleNav />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100">Fleet Overview</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Bouncie tracking and CCS maintenance data in one Fleet area.</p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3">{error}</div>}

        {data && metrics && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <MetricCard icon={Truck} label="Equipment" value={data.equipment.length} sub={`${metrics.uniqueTracked} tracked VIN${metrics.uniqueTracked === 1 ? "" : "s"}`} />
              <MetricCard icon={ClipboardList} label="Open Work Orders" value={metrics.activeOrders.length} sub={`${data.workOrders.length} total history`} />
              <MetricCard icon={AlertTriangle} label="High / Critical" value={metrics.highPriorityOrders.length} sub="Active work orders" />
              <MetricCard icon={Package} label="Low Stock" value={metrics.lowStock} sub={`${metrics.lowParts.length} parts · ${metrics.lowFluids.length} fluids`} />
              <MetricCard icon={CalendarClock} label="Due in 14 Days" value={metrics.upcomingTasks.length} sub={`${metrics.overdueTasks.length} overdue schedule${metrics.overdueTasks.length === 1 ? "" : "s"}`} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${metrics.bouncieFresh ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-amber-50 dark:bg-amber-950/40"}`}>
                    <Activity className={`w-5 h-5 ${metrics.bouncieFresh ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-slate-100">Fleet System Health</h2>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">{metrics.bouncieFresh ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-amber-600" />} Bouncie live data: {metrics.bouncieAgeMinutes == null ? "no timestamp" : `${metrics.bouncieAgeMinutes}m ago`}</span>
                      {isAdmin && <span className="inline-flex items-center gap-1">{(adminHealth?.unresolved || 0) === 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />} Automation issues: {adminHealth?.unresolved ?? "…"}</span>}
                      {isAdmin && <span>{adminHealth?.logs?.length || 0}/4 core automation heartbeats recorded</span>}
                    </div>
                  </div>
                </div>
                {isAdmin && <Link to={createPageUrl("FleetSettings")} className="text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1">Operations health <ArrowRight className="w-4 h-4" /></Link>}
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-slate-100">Active Fleet Work Orders</h2>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Fleet maintenance only — never signage production jobs.</p>
                  </div>
                  <Link to={createPageUrl("FleetWorkOrders")} className="text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1">View all <ArrowRight className="w-4 h-4" /></Link>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {metrics.activeOrders.slice(0, 8).map(wo => {
                    const eq = data.equipment.find(e => e.id === wo.equipment_id);
                    return (
                      <div key={wo.id} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-slate-100 truncate">{wo.work_order_number} · {wo.title}</div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{eq?.name || (wo.source_equipment_id ? "Unresolved equipment" : "No equipment")} · {wo.priority || "medium"} priority</div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${statusClass(wo.status)}`}>{(wo.status || "open").replaceAll("_", " ")}</span>
                      </div>
                    );
                  })}
                  {metrics.activeOrders.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">No active Fleet work orders.</div>}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-3"><h2 className="font-semibold text-gray-900 dark:text-slate-100">Needs Attention</h2><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
                  <div className="space-y-2">
                    <AttentionRow icon={AlertTriangle} label="High / critical work orders" value={metrics.highPriorityOrders.length} page="FleetWorkOrders" />
                    <AttentionRow icon={UserRoundX} label="Unassigned active work" value={metrics.unassignedOrders.length} page="FleetWorkOrders" />
                    <AttentionRow icon={Package} label="Low-stock items" value={metrics.lowStock} page="FleetParts" />
                    <AttentionRow icon={Clock3} label="Maintenance due in 14 days" value={metrics.upcomingTasks.length} page="FleetMaintenance" />
                  </div>
                  {metrics.upcomingTasks.length > 0 && <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Next due</div>{metrics.upcomingTasks.slice(0, 3).map(task => <div key={task.id} className="text-xs text-gray-600 dark:text-slate-300 py-1"><span className="font-medium">{task.start_date}</span> · {task.title}</div>)}</div>}
                </div>
                <QuickLink icon={Navigation} title="Bouncie Tracking" text="Live vehicles, trips, alerts and telemetry" page="FleetTracking" />
                <QuickLink icon={ShoppingCart} title="Requests" text={`${metrics.pendingRequests.length} pending or ordered`} page="FleetRequests" />
                <QuickLink icon={Wrench} title="New Fleet Work Order" text="Start maintenance or repair work" page="FleetWorkOrders?new=1" rawPage />
                <div className="grid grid-cols-2 gap-3"><QuickLink icon={Package} title="Parts" text={`${data.parts.length} records`} page="FleetParts" /><QuickLink icon={Droplets} title="Fluids" text={`${data.fluids.length} records`} page="FleetFluids" /></div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-gray-500 dark:text-slate-400">{label}</div>
        <Icon className="w-5 h-5 text-indigo-500" />
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-slate-100 mt-2">{value}</div>
      <div className="text-xs text-gray-500 dark:text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function QuickLink({ icon: Icon, title, text, page, rawPage = false }) {
  const to = rawPage ? `/${page}` : createPageUrl(page);
  return (
    <Link to={to} className="block rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center"><Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-300" /></div>
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 dark:text-slate-100">{title}</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{text}</div>
        </div>
      </div>
    </Link>
  );
}

function AttentionRow({ icon: Icon, label, value, page }) {
  return (
    <Link to={createPageUrl(page)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors">
      <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300"><Icon className="w-4 h-4 text-gray-400" />{label}</span>
      <span className={`text-sm font-bold ${value > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{value}</span>
    </Link>
  );
}
