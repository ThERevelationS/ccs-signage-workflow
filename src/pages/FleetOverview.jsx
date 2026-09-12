import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { easternTodayText, isFluidLowStock, isWorkOrderPastProjected, workOrderAgeDays } from "@/components/fleet/fleetHelpers";
import { filterAllFleetRows, listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { fleetHealthScore } from "@/components/fleet/fleetHealth";
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

const normalizeVin = value => String(value || "").trim().toUpperCase();
const normalizeImei = value => String(value || "").trim();

function hasRuntimeBouncieIdentityConflict(equipment, bouncieVehicles) {
  const vin = normalizeVin(equipment?.vin);
  const imei = normalizeImei(equipment?.bouncie_imei);
  if (!vin || !imei || !["matched", "manual"].includes(equipment?.bouncie_link_status) || !bouncieVehicles.length) return false;
  if (bouncieVehicles.some(vehicle => normalizeVin(vehicle?.vin) === vin && normalizeImei(vehicle?.imei) === imei)) return false;
  return bouncieVehicles.some(vehicle => normalizeImei(vehicle?.imei) === imei && normalizeVin(vehicle?.vin) && normalizeVin(vehicle?.vin) !== vin);
}

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
        const [equipment, tasks, workOrders, parts, fluids, requests, liveState, bouncieWarningRows, bouncieCriticalRows, bouncieVehiclesResult] = await Promise.all([
          listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment" }),
          listAllFleetRows(base44.entities.FleetMaintenanceTask, "start_date", { label: "Fleet maintenance schedules" }),
          listAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, "-created_date", { label: "Fleet work-order history" }),
          listAllFleetRows(base44.entities.FleetPart, "part_name", { label: "Fleet parts" }),
          listAllFleetRows(base44.entities.FleetFluid, "fluid_name", { label: "Fleet fluids" }),
          listAllFleetRows(base44.entities.FleetPartFluidRequest, "-created_date", { label: "Fleet requests" }),
          listAllFleetRows(base44.entities.BouncieVehicleLiveState, "-last_seen_at", { label: "Bouncie live vehicle state" }),
          filterAllFleetRows(base44.entities.BouncieNotification, { is_read: false, severity: "warning" }, "-timestamp", { label: "Unread Bouncie warnings" }),
          filterAllFleetRows(base44.entities.BouncieNotification, { is_read: false, severity: "critical" }, "-timestamp", { label: "Unread critical Bouncie alerts" }),
          base44.functions.invoke("bouncieApi", { method: "GET", path: "/v1/vehicles", query: {} }).catch(() => null),
        ]);
        if (mounted) setData({ equipment, tasks, workOrders, parts, fluids, requests, liveState, bouncieFaults: [...(bouncieCriticalRows || []), ...(bouncieWarningRows || [])], bouncieVehicles: bouncieVehiclesResult?.data?.data || [] });
        if (user?.role === "admin") {
          const [maintenanceLog, reminderLog, workerLog, bouncieLog, bouncieStatusResult, pendingQueue, sendingQueue, failedQueue, startedReceipts, failedReceipts] = await Promise.all([
            base44.entities.FleetSystemLog.filter({ source: "fleetScheduledMaintenanceGeneration" }, "-created_date", 1),
            base44.entities.FleetSystemLog.filter({ source: "fleetScheduledReminders" }, "-created_date", 1),
            base44.entities.FleetSystemLog.filter({ source: "fleetNotificationWorker" }, "-created_date", 1),
            base44.entities.FleetSystemLog.filter({ source: "bouncieSyncNotifications" }, "-created_date", 1),
            base44.functions.invoke("bouncieStatus", {}).catch(() => null),
            filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "pending" }, "-created_date", { label: "Pending Fleet notifications" }),
            filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "sending" }, "-created_date", { label: "Sending Fleet notifications" }),
            filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "failed" }, "-created_date", { label: "Failed Fleet notifications" }),
            filterAllFleetRows(base44.entities.FleetOperationReceipt, { status: "started" }, "-created_date", { label: "Started Fleet operation receipts" }),
            filterAllFleetRows(base44.entities.FleetOperationReceipt, { status: "failed" }, "-created_date", { label: "Failed Fleet operation receipts" }),
          ]);
          const bouncieStatus = bouncieStatusResult?.data || null;
          const connectionFreshMs = Math.max(Date.parse(bouncieStatus?.lastSyncAt || "") || 0, Date.parse(bouncieStatus?.lastWebhookAt || "") || 0);
          if (mounted) setAdminHealth({
            logs: [maintenanceLog?.[0], reminderLog?.[0], workerLog?.[0], bouncieLog?.[0]].filter(Boolean),
            unresolved: (pendingQueue?.length || 0) + (sendingQueue?.length || 0) + (failedQueue?.length || 0) + (startedReceipts?.length || 0) + (failedReceipts?.length || 0),
            bouncieHealthy: !!bouncieStatus?.connected && !bouncieStatus.needsReconnect && !bouncieStatus.lastError && !bouncieStatus.webhookError && bouncieStatus.webhookActive === true,
            bouncieFreshMinutes: connectionFreshMs ? Math.floor((Date.now() - connectionFreshMs) / 60000) : null,
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
    const activeEquipment = data.equipment.filter(e => e.status !== "retired");
    const retiredEquipment = data.equipment.filter(e => e.status === "retired");
    const activeEquipmentIds = new Set(activeEquipment.map(e => e.id));
    const activeVins = new Set(activeEquipment.map(e => normalizeVin(e.vin)).filter(Boolean));
    const activeOrders = data.workOrders
      .filter(w => !["completed", "cancelled"].includes(w.status))
      .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || String(a.work_order_number || "").localeCompare(String(b.work_order_number || "")));
    const highPriorityOrders = activeOrders.filter(w => ["critical", "high"].includes(w.priority));
    const unassignedOrders = activeOrders.filter(w => !String(w.assigned_to || "").trim());
    const todayText = easternTodayText();
    const staleOrders = activeOrders.filter(w => (workOrderAgeDays(w, todayText) ?? -1) >= 30);
    const pastProjectedOrders = activeOrders.filter(w => isWorkOrderPastProjected(w, todayText));
    const lowParts = data.parts.filter(p => p.enable_low_stock_alerts !== false && Number(p.quantity_on_hand ?? 0) <= Number(p.minimum_stock ?? 0));
    const lowFluids = data.fluids.filter(isFluidLowStock);
    const pendingRequests = data.requests.filter(r => ["pending", "ordered"].includes(r.status));
    const uniqueTracked = new Set(data.liveState.map(v => normalizeVin(v.vehicle_vin)).filter(vin => vin && activeVins.has(vin))).size;
    const bouncieIdentityConflicts = activeEquipment.filter(e => e.bouncie_link_status === "ambiguous" || hasRuntimeBouncieIdentityConflict(e, data.bouncieVehicles || []));
    const horizonDate = new Date(`${todayText}T00:00:00Z`);
    horizonDate.setUTCDate(horizonDate.getUTCDate() + 14);
    const horizonText = horizonDate.toISOString().slice(0, 10);
    const pendingTasks = data.tasks.filter(t => activeEquipmentIds.has(t.equipment_id) && ["pending", "overdue"].includes(t.status) && t.start_date);
    const overdueTasks = pendingTasks.filter(t => t.status === "overdue" || String(t.start_date) < todayText);
    const upcomingTasks = pendingTasks.filter(t => String(t.start_date) >= todayText && String(t.start_date) <= horizonText)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    const dueToday = pendingTasks.filter(t => String(t.start_date) === todayText);
    const equipmentHealth = activeEquipment.map(equipment => fleetHealthScore({
      equipment,
      tasks: data.tasks.filter(task => task.equipment_id === equipment.id),
      workOrders: data.workOrders.filter(order => order.equipment_id === equipment.id),
      identityConflict: equipment.bouncie_link_status === "ambiguous" || hasRuntimeBouncieIdentityConflict(equipment, data.bouncieVehicles || []),
      todayText,
    }));
    const scoredHealth = equipmentHealth.filter(item => item.score != null);
    const averageHealth = scoredHealth.length ? Math.round(scoredHealth.reduce((sum, item) => sum + item.score, 0) / scoredHealth.length) : null;
    const needsHealthAttention = scoredHealth.filter(item => item.score < 75).length;
    const availableEquipment = activeEquipment.filter(item => item.status === "operational");
    return {
      activeEquipment,
      retiredEquipment,
      activeOrders,
      highPriorityOrders,
      unassignedOrders,
      staleOrders,
      pastProjectedOrders,
      lowParts,
      lowFluids,
      lowStock: lowParts.length + lowFluids.length,
      pendingRequests,
      uniqueTracked,
      bouncieIdentityConflicts,
      overdueTasks,
      upcomingTasks,
      dueToday,
      averageHealth,
      needsHealthAttention,
      availableEquipment,
      bouncieFaults: data.bouncieFaults || [],
    };
  }, [data]);

  const attentionSignals = metrics ? metrics.highPriorityOrders.length + metrics.unassignedOrders.length + metrics.staleOrders.length + metrics.pastProjectedOrders.length + metrics.overdueTasks.length + metrics.upcomingTasks.length + metrics.lowStock + metrics.pendingRequests.length + metrics.bouncieIdentityConflicts.length + metrics.bouncieFaults.length + (isAdmin ? (adminHealth?.unresolved || 0) + (adminHealth && !adminHealth.bouncieHealthy ? 1 : 0) : 0) : 0;

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
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
              <MetricCard icon={Activity} label="Fleet Health" value={metrics.averageHealth == null ? "—" : `${metrics.averageHealth}%`} sub={`${metrics.needsHealthAttention} asset${metrics.needsHealthAttention === 1 ? "" : "s"} below 75`} />
              <MetricCard icon={Truck} label="Available Now" value={metrics.availableEquipment.length} sub={`${metrics.activeEquipment.length} active · ${metrics.retiredEquipment.length} retired`} />
              <MetricCard icon={Navigation} label="Tracked" value={metrics.uniqueTracked} sub="Current active VINs" />
              <MetricCard icon={ClipboardList} label="Open Work Orders" value={metrics.activeOrders.length} sub={`${data.workOrders.length} total history`} />
              <MetricCard icon={AlertTriangle} label="High / Critical" value={metrics.highPriorityOrders.length} sub="Active work orders" />
              <MetricCard icon={Package} label="Low Stock" value={metrics.lowStock} sub={`${metrics.lowParts.length} parts · ${metrics.lowFluids.length} fluids`} />
              <MetricCard icon={CalendarClock} label="Due in 14 Days" value={metrics.upcomingTasks.length} sub={`${metrics.overdueTasks.length} overdue schedule${metrics.overdueTasks.length === 1 ? "" : "s"}`} />
            </div>

            <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800"><h2 className="font-semibold text-gray-900 dark:text-slate-100">Today</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">The operational picture to act on first.</p></div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-slate-800">
                <TodayCell label="Ready / operational" value={`${metrics.availableEquipment.length} of ${metrics.activeEquipment.length}`} detail="Active assets currently marked operational" />
                <TodayCell label="Maintenance due today" value={metrics.dueToday.length} detail={`${metrics.overdueTasks.length} already overdue`} attention={metrics.dueToday.length > 0 || metrics.overdueTasks.length > 0} />
                <TodayCell label="Priority repairs" value={metrics.highPriorityOrders.length} detail={`${metrics.unassignedOrders.length} active work order${metrics.unassignedOrders.length === 1 ? "" : "s"} unassigned`} attention={metrics.highPriorityOrders.length > 0} />
                <TodayCell label="Inventory / requests" value={metrics.lowStock + metrics.pendingRequests.length} detail={`${metrics.lowStock} low-stock · ${metrics.pendingRequests.length} requested`} attention={metrics.lowStock + metrics.pendingRequests.length > 0} />
              </div>
            </section>

            <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${!isAdmin || adminHealth?.bouncieHealthy ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-amber-50 dark:bg-amber-950/40"}`}>
                    <Activity className={`w-5 h-5 ${!isAdmin || adminHealth?.bouncieHealthy ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-slate-100">Fleet System Health</h2>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                      {!isAdmin && <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {metrics.uniqueTracked} tracked VIN{metrics.uniqueTracked === 1 ? "" : "s"} available</span>}
                      {isAdmin && <span className="inline-flex items-center gap-1">{adminHealth?.bouncieHealthy ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-amber-600" />} Bouncie: {adminHealth?.bouncieHealthy ? "healthy" : "needs attention"}{adminHealth?.bouncieFreshMinutes != null ? ` · activity ${adminHealth.bouncieFreshMinutes}m ago` : ""}</span>}
                      {isAdmin && <span className="inline-flex items-center gap-1">{(adminHealth?.unresolved || 0) === 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />} Automation issues: {adminHealth?.unresolved ?? "…"}</span>}
                      {isAdmin && <span>{adminHealth?.logs?.length || 0}/4 core automation heartbeats recorded</span>}
                    </div>
                  </div>
                </div>
                {isAdmin && <Link to={createPageUrl("FleetSettings")} className="text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1">Operations health <ArrowRight className="w-4 h-4" /></Link>}
              </div>
            </div>

            <section className={`rounded-xl border shadow-sm ${attentionSignals > 0 ? "border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10" : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/10"}`}>
              <div className="px-4 py-3 border-b border-gray-200/70 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div><div className="flex items-center gap-2"><AlertTriangle className={`w-5 h-5 ${attentionSignals > 0 ? "text-amber-500" : "text-emerald-500"}`} /><h2 className="font-semibold text-gray-900 dark:text-slate-100">Needs Attention</h2></div><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">One operational queue for maintenance, work orders, inventory, requests, Bouncie, and Fleet automation.</p></div>
                <div className="flex items-center gap-3"><div className={`text-sm font-bold ${attentionSignals > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{attentionSignals} attention signal{attentionSignals === 1 ? "" : "s"}</div><Link to={createPageUrl("FleetNotifications")} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1">Notification Center <ArrowRight className="w-3.5 h-3.5" /></Link></div>
              </div>
              <div className="p-4 grid md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1">
                <AttentionRow icon={AlertTriangle} label="High / critical work orders" value={metrics.highPriorityOrders.length} page="FleetWorkOrders" query="attention=high_priority" />
                <AttentionRow icon={UserRoundX} label="Unassigned active work" value={metrics.unassignedOrders.length} page="FleetWorkOrders" query="attention=unassigned" />
                <AttentionRow icon={Clock3} label="Stale active work (30+ days)" value={metrics.staleOrders.length} page="FleetWorkOrders" query="attention=stale30" />
                <AttentionRow icon={AlertTriangle} label="Past projected completion" value={metrics.pastProjectedOrders.length} page="FleetWorkOrders" query="attention=past_projected" />
                <AttentionRow icon={CalendarClock} label="Overdue maintenance schedules" value={metrics.overdueTasks.length} page="FleetMaintenance" query="status=overdue" />
                <AttentionRow icon={Clock3} label="Maintenance due in 14 days" value={metrics.upcomingTasks.length} page="FleetMaintenance" query="status=pending" />
                <AttentionRow icon={Package} label="Low-stock parts" value={metrics.lowParts.length} page="FleetParts" query="stock=low" />
                <AttentionRow icon={Droplets} label="Low-stock fluids" value={metrics.lowFluids.length} page="FleetFluids" query="stock=low" />
                <AttentionRow icon={ShoppingCart} label="Pending / ordered requests" value={metrics.pendingRequests.length} page="FleetRequests" query="status=active" />
                <AttentionRow icon={Navigation} label="Bouncie identity conflicts" value={metrics.bouncieIdentityConflicts.length} page="FleetEquipment" query="view=tracking_issues" />
                <AttentionRow icon={AlertTriangle} label="Unread Bouncie warnings / critical" value={metrics.bouncieFaults.length} page="FleetTracking" />
                {isAdmin && <AttentionRow icon={Activity} label="Fleet automation queue / receipts" value={adminHealth?.unresolved || 0} page="FleetSettings" />}
                {isAdmin && <AttentionRow icon={Navigation} label="Bouncie connection / webhook health" value={adminHealth?.bouncieHealthy ? 0 : 1} page="FleetSettings" />}
              </div>
            </section>

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
                      <Link key={wo.id} to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(wo.id)}${wo.equipment_id ? `&equipment=${encodeURIComponent(wo.equipment_id)}` : ""}`} className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-slate-100 truncate">{wo.work_order_number} · {wo.title}</div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{eq?.name || (wo.source_equipment_id ? "Unresolved equipment" : "No equipment")} · {wo.priority || "medium"} priority</div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${statusClass(wo.status)}`}>{(wo.status || "open").replaceAll("_", " ")}</span>
                      </Link>
                    );
                  })}
                  {metrics.activeOrders.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">No active Fleet work orders.</div>}
                </div>
              </div>

              <div className="space-y-4">
                {metrics.upcomingTasks.length > 0 && <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm"><div className="flex items-center justify-between gap-2 mb-3"><h2 className="font-semibold text-gray-900 dark:text-slate-100">Upcoming Maintenance</h2><CalendarClock className="w-5 h-5 text-indigo-500" /></div><div className="space-y-2">{metrics.upcomingTasks.slice(0, 5).map(task => { const eq = data.equipment.find(item => item.id === task.equipment_id); return <Link key={task.id} to={`${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(task.equipment_id || "")}&tab=schedule`} className="block rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50 dark:hover:bg-slate-800/60"><div className="text-xs font-semibold text-gray-900 dark:text-slate-100">{task.start_date} · {task.title}</div><div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{eq?.name || "Unresolved equipment"}</div></Link>; })}</div></div>}
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

function TodayCell({ label, value, detail, attention = false }) {
  return <div className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div><div className={`mt-1 text-2xl font-bold ${attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"}`}>{value}</div><div className="mt-1 text-xs text-gray-500 dark:text-slate-400">{detail}</div></div>;
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

function AttentionRow({ icon: Icon, label, value, page, query = "" }) {
  const to = query ? `${createPageUrl(page)}?${query}` : createPageUrl(page);
  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors">
      <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300"><Icon className="w-4 h-4 text-gray-400" />{label}</span>
      <span className={`text-sm font-bold ${value > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{value}</span>
    </Link>
  );
}
