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
  ClipboardCheck,
  CalendarClock,
  CalendarDays,
  Package,
  Droplets,
  ShoppingCart,
  Navigation,
  ShieldCheck,
  DollarSign,
  AlertTriangle,
  Loader2,
  ArrowRight,
  UserRoundX,
  Wrench,
  Clock3,
  Activity,
  CheckCircle2,
  XCircle,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  RotateCcw,
  X,
} from "lucide-react";

const DEFAULT_DASHBOARD_ORDER = ["summary", "today", "system_health", "attention", "operations"];
const DASHBOARD_WIDGETS = [
  { id: "summary", label: "Fleet Snapshot", description: "Health, availability, tracking, work, stock and upcoming maintenance." },
  { id: "today", label: "Today", description: "The immediate operational picture for the day." },
  { id: "system_health", label: "System Health", description: "Bouncie and Fleet automation health signals." },
  { id: "attention", label: "Needs Attention", description: "Maintenance, inventory, assignment and system exceptions." },
  { id: "operations", label: "Operations", description: "Active work orders, upcoming maintenance and workflow shortcuts." },
];
const defaultDashboardPreference = () => ({ widget_order: [...DEFAULT_DASHBOARD_ORDER], hidden_widgets: [], density: "comfortable", layout_version: 1 });
const normalizeDashboardPreference = source => {
  const supplied = Array.isArray(source?.widget_order) ? source.widget_order.filter(id => DEFAULT_DASHBOARD_ORDER.includes(id)) : [];
  const order = [...new Set(supplied)];
  for (const id of DEFAULT_DASHBOARD_ORDER) if (!order.includes(id)) order.push(id);
  return { widget_order: order, hidden_widgets: [...new Set((Array.isArray(source?.hidden_widgets) ? source.hidden_widgets : []).filter(id => DEFAULT_DASHBOARD_ORDER.includes(id)))], density: source?.density === "compact" ? "compact" : "comfortable", layout_version: 1 };
};

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
  const [dashboardPreference, setDashboardPreference] = useState(defaultDashboardPreference);
  const [dashboardPreferenceRecord, setDashboardPreferenceRecord] = useState(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [savingDashboard, setSavingDashboard] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = await base44.auth.me().catch(() => null);
        if (mounted) setIsAdmin(user?.role === "admin");
        const [equipment, tasks, workOrders, inspectionRows, parts, partIdentificationRows, fluids, requests, reservationResult, warrantyResult, lifecycleResult, repairEstimates, dashboardPreferenceResult, liveState, bouncieWarningRows, bouncieCriticalRows, bouncieVehiclesResult] = await Promise.all([
          listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet equipment" }),
          listAllFleetRows(base44.entities.FleetMaintenanceTask, "start_date", { label: "Fleet maintenance schedules" }),
          listAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, "-created_date", { label: "Fleet work-order history" }),
          filterAllFleetRows(base44.entities.FleetInspection, { status: { $in: ["failed", "needs_attention"] } }, "-created_date", { label: "Fleet inspection attention" }).catch(() => []),
          listAllFleetRows(base44.entities.FleetPart, "part_name", { label: "Fleet parts" }),
          filterAllFleetRows(base44.entities.FleetPartIdentification, { status: { $in: ["draft", "analyzed", "needs_review"] } }, "-created_date", { label: "Fleet part identification review inbox" }).catch(() => []),
          listAllFleetRows(base44.entities.FleetFluid, "fluid_name", { label: "Fleet fluids" }),
          listAllFleetRows(base44.entities.FleetPartFluidRequest, "-created_date", { label: "Fleet requests" }),
          base44.functions.invoke("fleetReservationAction", { action: "list" }).catch(() => null),
          base44.functions.invoke("fleetWarrantyAction", { action: "portfolio" }).catch(() => null),
          user?.role === "admin" ? base44.functions.invoke("fleetLifecycleAction", { action: "portfolio" }).catch(() => null) : Promise.resolve(null),
          user?.role === "admin" ? listAllFleetRows(base44.entities.FleetRepairEstimate, "-updated_date", { label: "Fleet repair-estimate approvals" }).catch(() => []) : Promise.resolve([]),
          base44.functions.invoke("fleetDashboardPreferenceAction", { action: "get" }).catch(() => null),
          listAllFleetRows(base44.entities.BouncieVehicleLiveState, "-last_seen_at", { label: "Bouncie live vehicle state" }),
          filterAllFleetRows(base44.entities.BouncieNotification, { is_read: false, severity: "warning" }, "-timestamp", { label: "Unread Bouncie warnings" }),
          filterAllFleetRows(base44.entities.BouncieNotification, { is_read: false, severity: "critical" }, "-timestamp", { label: "Unread critical Bouncie alerts" }),
          base44.functions.invoke("bouncieApi", { method: "GET", path: "/v1/vehicles", query: {} }).catch(() => null),
        ]);
        if (mounted) {
          setData({ equipment, tasks, workOrders, inspections: inspectionRows || [], parts, partIdentificationRows: partIdentificationRows || [], fluids, requests, reservations: reservationResult?.data?.reservations || [], warranties: warrantyResult?.data?.rows || [], lifecycleRows: lifecycleResult?.data?.rows || [], repairEstimates: repairEstimates || [], liveState, bouncieFaults: [...(bouncieCriticalRows || []), ...(bouncieWarningRows || [])], bouncieVehicles: bouncieVehiclesResult?.data?.data || [] });
          setDashboardPreference(normalizeDashboardPreference(dashboardPreferenceResult?.data?.preference || {}));
          setDashboardPreferenceRecord(dashboardPreferenceResult?.data?.record || null);
        }
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
    const nowMs = Date.now();
    const currentAssignments = (data.reservations || []).filter(row => row.status === "checked_out" || (row.status === "reserved" && (Date.parse(row.start_at || "") || 0) <= nowMs && (Date.parse(row.end_at || "") || 0) >= nowMs));
    const pastDueAssignments = (data.reservations || []).filter(row => row.status === "reserved" && (Date.parse(row.end_at || "") || 0) > 0 && Date.parse(row.end_at || "") < nowMs);
    const currentlyAssignedIds = new Set(currentAssignments.map(row => row.equipment_id));
    const availableEquipment = activeEquipment.filter(item => item.status === "operational" && !currentlyAssignedIds.has(item.id));
    const inspectionCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const inspectionAttention = (data.inspections || []).filter(row => row.status === "needs_attention" || (row.status === "failed" && (Date.parse(row.completed_at || row.updated_date || row.created_date || "") || 0) >= inspectionCutoff));
    const warrantyAttention = (data.warranties || []).filter(row => ["expired", "orphaned", "expiring_soon"].includes(row.effective_status));
    const lifecycleAttention = isAdmin ? (data.lifecycleRows || []).filter(row => {
      if (row.equipment?.status === "retired") return false;
      const replacementStatus = String(row.profile?.replacement_status || "monitor");
      const targetDays = row.metrics?.target_replacement_days;
      return ["replace_soon", "approved"].includes(replacementStatus) || row.priority?.label === "High" || (targetDays != null && Number(targetDays) <= 365);
    }) : [];
    const pendingRepairApprovals = isAdmin ? (data.repairEstimates || []).filter(row => row.status === "submitted") : [];
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
      partIdentificationReview: data.partIdentificationRows || [],
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
      currentAssignments,
      pastDueAssignments,
      inspectionAttention,
      warrantyAttention,
      lifecycleAttention,
      pendingRepairApprovals,
      bouncieFaults: data.bouncieFaults || [],
    };
  }, [data, isAdmin]);

  const attentionSignals = metrics ? metrics.highPriorityOrders.length + metrics.unassignedOrders.length + metrics.staleOrders.length + metrics.pastProjectedOrders.length + metrics.overdueTasks.length + metrics.upcomingTasks.length + metrics.inspectionAttention.length + metrics.lowStock + metrics.partIdentificationReview.length + metrics.pendingRequests.length + metrics.pastDueAssignments.length + metrics.warrantyAttention.length + metrics.bouncieIdentityConflicts.length + metrics.bouncieFaults.length + (isAdmin ? metrics.lifecycleAttention.length + metrics.pendingRepairApprovals.length + (adminHealth?.unresolved || 0) + (adminHealth && !adminHealth.bouncieHealthy ? 1 : 0) : 0) : 0;
  const widgetVisible = id => !dashboardPreference.hidden_widgets.includes(id);
  const widgetOrder = id => {
    const index = dashboardPreference.widget_order.indexOf(id);
    return index < 0 ? DEFAULT_DASHBOARD_ORDER.indexOf(id) : index;
  };
  const saveDashboardPreference = async preference => {
    setSavingDashboard(true); setError("");
    try {
      const { data: result } = await base44.functions.invoke("fleetDashboardPreferenceAction", { action: "save", expected_updated_date: dashboardPreferenceRecord?.updated_date || "", preference });
      if (result?.error) throw new Error(result.error);
      setDashboardPreference(normalizeDashboardPreference(result?.preference || preference));
      setDashboardPreferenceRecord(result?.record || null);
      setCustomizeOpen(false);
    } catch (e) { setError(e?.message || "Unable to save Fleet dashboard layout."); }
    finally { setSavingDashboard(false); }
  };
  const resetDashboardPreference = async () => {
    setSavingDashboard(true); setError("");
    try {
      const { data: result } = await base44.functions.invoke("fleetDashboardPreferenceAction", { action: "reset", expected_updated_date: dashboardPreferenceRecord?.updated_date || "" });
      if (result?.error) throw new Error(result.error);
      setDashboardPreference(normalizeDashboardPreference(result?.preference || defaultDashboardPreference()));
      setDashboardPreferenceRecord(result?.record || null);
      setCustomizeOpen(false);
    } catch (e) { setError(e?.message || "Unable to reset Fleet dashboard layout."); }
    finally { setSavingDashboard(false); }
  };

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
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="min-w-0"><h1 className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900 dark:text-slate-100">Fleet Overview</h1><p className="text-sm leading-relaxed text-gray-500 dark:text-slate-400 mt-1">Bouncie tracking and CCS maintenance data in one Fleet area.</p></div>
          <button type="button" onClick={() => setCustomizeOpen(true)} className="min-h-11 w-full sm:w-auto px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-700"><SlidersHorizontal className="w-4 h-4 shrink-0" />Customize Dashboard</button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3">{error}</div>}

        {data && metrics && (
          <div className={`flex flex-col ${dashboardPreference.density === "compact" ? "gap-3" : "gap-6"}`}>
            {widgetVisible("summary") && <div style={{ order: widgetOrder("summary") }}>
            <div className={`grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 ${dashboardPreference.density === "compact" ? "gap-2" : "gap-3 sm:gap-4"}`}> 
              <MetricCard icon={Activity} label="Fleet Health" value={metrics.averageHealth == null ? "—" : `${metrics.averageHealth}%`} sub={`${metrics.needsHealthAttention} asset${metrics.needsHealthAttention === 1 ? "" : "s"} below 75`} />
              <MetricCard icon={Truck} label="Available Now" value={metrics.availableEquipment.length} sub={`${metrics.currentAssignments.length} currently assigned · ${metrics.retiredEquipment.length} retired`} />
              <MetricCard icon={Navigation} label="Tracked" value={metrics.uniqueTracked} sub="Current active VINs" />
              <MetricCard icon={ClipboardList} label="Open Work Orders" value={metrics.activeOrders.length} sub={`${data.workOrders.length} total history`} />
              <MetricCard icon={AlertTriangle} label="High / Critical" value={metrics.highPriorityOrders.length} sub="Active work orders" />
              <MetricCard icon={Package} label="Low Stock" value={metrics.lowStock} sub={`${metrics.lowParts.length} parts · ${metrics.lowFluids.length} fluids`} />
              <MetricCard icon={CalendarClock} label="Due in 14 Days" value={metrics.upcomingTasks.length} sub={`${metrics.overdueTasks.length} overdue schedule${metrics.overdueTasks.length === 1 ? "" : "s"}`} />
            </div>
            </div>}

            {widgetVisible("today") && <div style={{ order: widgetOrder("today") }}><section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800"><h2 className="font-semibold text-gray-900 dark:text-slate-100">Today</h2><p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1">The operational picture to act on first.</p></div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-slate-800">
                <TodayCell label="Ready / available" value={`${metrics.availableEquipment.length} of ${metrics.activeEquipment.length}`} detail={`${metrics.currentAssignments.length} currently reserved / checked out`} attention={metrics.pastDueAssignments.length > 0} />
                <TodayCell label="Maintenance due today" value={metrics.dueToday.length} detail={`${metrics.overdueTasks.length} already overdue`} attention={metrics.dueToday.length > 0 || metrics.overdueTasks.length > 0} />
                <TodayCell label="Priority repairs" value={metrics.highPriorityOrders.length} detail={`${metrics.unassignedOrders.length} active work order${metrics.unassignedOrders.length === 1 ? "" : "s"} unassigned`} attention={metrics.highPriorityOrders.length > 0} />
                <TodayCell label="Inventory / requests" value={metrics.lowStock + metrics.pendingRequests.length} detail={`${metrics.lowStock} low-stock · ${metrics.pendingRequests.length} requested`} attention={metrics.lowStock + metrics.pendingRequests.length > 0} />
              </div>
            </section></div>}

            {widgetVisible("system_health") && <div style={{ order: widgetOrder("system_health") }}><div className={`rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm ${dashboardPreference.density === "compact" ? "p-3" : "p-4"}`}>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${!isAdmin || adminHealth?.bouncieHealthy ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-amber-50 dark:bg-amber-950/40"}`}>
                    <Activity className={`w-5 h-5 ${!isAdmin || adminHealth?.bouncieHealthy ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900 dark:text-slate-100">Fleet System Health</h2>
                    <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap gap-x-4 gap-y-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                      {!isAdmin && <span className="inline-flex items-start gap-1"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" /> <span className="break-words">{metrics.uniqueTracked} tracked VIN{metrics.uniqueTracked === 1 ? "" : "s"} available</span></span>}
                      {isAdmin && <span className="inline-flex items-start gap-1">{adminHealth?.bouncieHealthy ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />} <span className="break-words">Bouncie: {adminHealth?.bouncieHealthy ? "healthy" : "needs attention"}{adminHealth?.bouncieFreshMinutes != null ? ` · activity ${adminHealth.bouncieFreshMinutes}m ago` : ""}</span></span>}
                      {isAdmin && <span className="inline-flex items-start gap-1">{(adminHealth?.unresolved || 0) === 0 ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />} <span className="break-words">Automation issues: {adminHealth?.unresolved ?? "…"}</span></span>}
                      {isAdmin && <span className="break-words">{adminHealth?.logs?.length || 0}/4 core automation heartbeats recorded</span>}
                    </div>
                  </div>
                </div>
                {isAdmin && <Link to={createPageUrl("FleetSettings")} className="min-h-11 w-full sm:w-auto px-3 rounded-lg text-sm font-semibold text-indigo-600 hover:bg-gray-50 dark:text-indigo-300 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1">Operations health <ArrowRight className="w-4 h-4 shrink-0" /></Link>}
              </div>
            </div></div>}

            {widgetVisible("attention") && <div style={{ order: widgetOrder("attention") }}><section className={`rounded-xl border shadow-sm ${attentionSignals > 0 ? "border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10" : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/10"}`}> 
              <div className="px-4 py-3 border-b border-gray-200/70 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0"><div className="flex items-center gap-2"><AlertTriangle className={`w-5 h-5 shrink-0 ${attentionSignals > 0 ? "text-amber-500" : "text-emerald-500"}`} /><h2 className="font-semibold text-gray-900 dark:text-slate-100">Needs Attention</h2></div><p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1">One operational queue for maintenance, work orders, inventory, requests, Bouncie, and Fleet automation.</p></div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"><div className={`text-sm font-bold ${attentionSignals > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{attentionSignals} attention signal{attentionSignals === 1 ? "" : "s"}</div><Link to={createPageUrl("FleetNotifications")} className="min-h-11 px-3 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-white/70 dark:text-indigo-300 dark:hover:bg-slate-900/60 inline-flex items-center justify-center gap-1">Notification Center <ArrowRight className="w-3.5 h-3.5" /></Link></div>
              </div>
              <div className="p-4 grid md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1">
                <AttentionRow icon={AlertTriangle} label="High / critical work orders" value={metrics.highPriorityOrders.length} page="FleetWorkOrders" query="attention=high_priority" />
                <AttentionRow icon={UserRoundX} label="Unassigned active work" value={metrics.unassignedOrders.length} page="FleetWorkOrders" query="attention=unassigned" />
                <AttentionRow icon={Clock3} label="Stale active work (30+ days)" value={metrics.staleOrders.length} page="FleetWorkOrders" query="attention=stale30" />
                <AttentionRow icon={AlertTriangle} label="Past projected completion" value={metrics.pastProjectedOrders.length} page="FleetWorkOrders" query="attention=past_projected" />
                <AttentionRow icon={CalendarClock} label="Overdue maintenance schedules" value={metrics.overdueTasks.length} page="FleetMaintenance" query="status=overdue" />
                <AttentionRow icon={Clock3} label="Maintenance due in 14 days" value={metrics.upcomingTasks.length} page="FleetMaintenance" query="status=pending" />
                <AttentionRow icon={ClipboardCheck} label="Inspection attention / recent failures" value={metrics.inspectionAttention.length} page="FleetNotifications" query="group=inspections" />
                <AttentionRow icon={Package} label="Low-stock parts" value={metrics.lowParts.length} page="FleetParts" query="stock=low" />
                <AttentionRow icon={Package} label="Part identification review inbox" value={metrics.partIdentificationReview.length} page="FleetParts" query="queue=review" />
                <AttentionRow icon={Droplets} label="Low-stock fluids" value={metrics.lowFluids.length} page="FleetFluids" query="stock=low" />
                <AttentionRow icon={ShoppingCart} label="Pending / ordered requests" value={metrics.pendingRequests.length} page="FleetRequests" query="status=active" />
                <AttentionRow icon={CalendarDays} label="Past-due reservations" value={metrics.pastDueAssignments.length} page="FleetReservations" query="view=attention" />
                <AttentionRow icon={ShieldCheck} label="Warranty coverage attention" value={metrics.warrantyAttention.length} page="FleetWarranties" query="status=attention" />
                {isAdmin && <AttentionRow icon={Truck} label="Replacement planning attention" value={metrics.lifecycleAttention.length} page="FleetNotifications" query="group=lifecycle" />}
                {isAdmin && <AttentionRow icon={DollarSign} label="Repair estimates awaiting approval" value={metrics.pendingRepairApprovals.length} page="FleetNotifications" query="group=approvals" />}
                <AttentionRow icon={Navigation} label="Bouncie identity conflicts" value={metrics.bouncieIdentityConflicts.length} page="FleetEquipment" query="view=tracking_issues" />
                <AttentionRow icon={AlertTriangle} label="Unread Bouncie warnings / critical" value={metrics.bouncieFaults.length} page="FleetTracking" />
                {isAdmin && <AttentionRow icon={Activity} label="Fleet automation queue / receipts" value={adminHealth?.unresolved || 0} page="FleetSettings" />}
                {isAdmin && <AttentionRow icon={Navigation} label="Bouncie connection / webhook health" value={adminHealth?.bouncieHealthy ? 0 : 1} page="FleetSettings" />}
              </div>
            </section></div>}

            {widgetVisible("operations") && <div style={{ order: widgetOrder("operations") }}><div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900 dark:text-slate-100">Active Fleet Work Orders</h2>
                    <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1">Fleet maintenance only — never signage production jobs.</p>
                  </div>
                  <Link to={createPageUrl("FleetWorkOrders")} className="min-h-11 px-3 rounded-lg text-sm font-semibold text-indigo-600 hover:bg-gray-50 dark:text-indigo-300 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1">View all <ArrowRight className="w-4 h-4" /></Link>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {metrics.activeOrders.slice(0, 8).map(wo => {
                    const eq = data.equipment.find(e => e.id === wo.equipment_id);
                    return (
                      <Link key={wo.id} to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(wo.id)}${wo.equipment_id ? `&equipment=${encodeURIComponent(wo.equipment_id)}` : ""}`} className="min-h-11 px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
                        <div className="min-w-0">
                          <div className="font-medium leading-snug text-gray-900 dark:text-slate-100 break-words">{wo.work_order_number} · {wo.title}</div>
                          <div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1 break-words">{eq?.name || (wo.source_equipment_id ? "Unresolved equipment" : "No equipment")} · {wo.priority || "medium"} priority</div>
                        </div>
                        <span className={`self-start shrink-0 text-xs px-2 py-1 rounded-full whitespace-nowrap ${statusClass(wo.status)}`}>{(wo.status || "open").replaceAll("_", " ")}</span>
                      </Link>
                    );
                  })}
                  {metrics.activeOrders.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">No active Fleet work orders.</div>}
                </div>
              </div>

              <div className="space-y-4">
                {metrics.upcomingTasks.length > 0 && <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm"><div className="flex items-center justify-between gap-2 mb-3"><h2 className="font-semibold text-gray-900 dark:text-slate-100">Upcoming Maintenance</h2><CalendarClock className="w-5 h-5 shrink-0 text-indigo-500" /></div><div className="space-y-2">{metrics.upcomingTasks.slice(0, 5).map(task => { const eq = data.equipment.find(item => item.id === task.equipment_id); return <Link key={task.id} to={`${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(task.equipment_id || "")}&tab=schedule`} className="min-h-11 block rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><div className="text-xs font-semibold leading-snug text-gray-900 dark:text-slate-100 break-words">{task.start_date} · {task.title}</div><div className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-400 mt-0.5 break-words">{eq?.name || "Unresolved equipment"}</div></Link>; })}</div></div>}
                <QuickLink icon={Navigation} title="Bouncie Tracking" text="Live vehicles, trips, alerts and telemetry" page="FleetTracking" />
                <QuickLink icon={ShoppingCart} title="Requests" text={`${metrics.pendingRequests.length} pending or ordered`} page="FleetRequests" />
                <QuickLink icon={Wrench} title="New Fleet Work Order" text="Start maintenance or repair work" page="FleetWorkOrders?new=1" rawPage />
                <div className="grid grid-cols-2 gap-3"><QuickLink icon={Package} title="Parts" text={`${data.parts.length} records`} page="FleetParts" /><QuickLink icon={Droplets} title="Fluids" text={`${data.fluids.length} records`} page="FleetFluids" /></div>
              </div>
            </div></div>}
          </div>
        )}
        {customizeOpen && <DashboardCustomizer preference={dashboardPreference} saving={savingDashboard} onClose={() => !savingDashboard && setCustomizeOpen(false)} onSave={saveDashboardPreference} onReset={resetDashboardPreference} />}
      </div>
    </div>
  );
}

function DashboardCustomizer({ preference, saving, onClose, onSave, onReset }) {
  const [draft, setDraft] = useState(() => normalizeDashboardPreference(preference));
  const move = (id, direction) => setDraft(current => {
    const order = [...current.widget_order];
    const index = order.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    return { ...current, widget_order: order };
  });
  const toggle = id => setDraft(current => ({ ...current, hidden_widgets: current.hidden_widgets.includes(id) ? current.hidden_widgets.filter(item => item !== id) : [...current.hidden_widgets, id] }));
  const orderedWidgets = draft.widget_order.map(id => DASHBOARD_WIDGETS.find(widget => widget.id === id)).filter(Boolean);
  return <div className="fixed inset-0 z-[180] bg-black/55 flex items-end sm:items-center sm:justify-end" onMouseDown={event => event.target === event.currentTarget && !saving && onClose()}>
    <div role="dialog" aria-modal="true" aria-label="Customize Fleet dashboard" className="w-full sm:w-[460px] h-[92dvh] sm:h-full bg-white dark:bg-slate-900 border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-slate-700 shadow-2xl flex flex-col">
      <div className="px-4 py-4 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Customize Dashboard</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Your layout is private to your CCS account and does not change Fleet data.</p></div><button type="button" onClick={onClose} disabled={saving} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Close dashboard customizer"><X className="w-5 h-5 mx-auto" /></button></div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section><div className="text-xs font-bold uppercase tracking-wide text-gray-400">Density</div><div className="mt-2 grid grid-cols-2 rounded-xl border border-gray-200 dark:border-slate-700 p-1">{[["comfortable","Comfortable"],["compact","Compact"]].map(([value,label]) => <button key={value} type="button" onClick={() => setDraft(current => ({ ...current, density: value }))} className={`min-h-11 rounded-lg text-sm font-semibold ${draft.density === value ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{label}</button>)}</div></section>
        <section><div className="flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-gray-400">Sections</div><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Move important sections higher or hide the ones you do not use.</p></div><span className="text-[11px] text-gray-400">{DASHBOARD_WIDGETS.length - draft.hidden_widgets.length}/{DASHBOARD_WIDGETS.length} visible</span></div><div className="mt-3 space-y-2">{orderedWidgets.map((widget,index) => { const hidden = draft.hidden_widgets.includes(widget.id); return <div key={widget.id} className={`rounded-xl border p-3 ${hidden ? "border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-950/40 opacity-70" : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}><div className="flex items-start gap-3"><button type="button" onClick={() => toggle(widget.id)} className={`mt-0.5 min-h-10 min-w-10 rounded-lg border inline-flex items-center justify-center ${hidden ? "border-gray-300 text-gray-500 dark:border-slate-700" : "border-indigo-200 text-indigo-600 dark:border-indigo-900 dark:text-indigo-300"}`} aria-label={hidden ? `Show ${widget.label}` : `Hide ${widget.label}`}>{hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button><div className="min-w-0 flex-1"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{widget.label}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{widget.description}</div></div><div className="flex gap-1"><button type="button" onClick={() => move(widget.id,-1)} disabled={index===0} className="min-h-10 min-w-10 rounded-lg border border-gray-200 dark:border-slate-700 disabled:opacity-30" aria-label={`Move ${widget.label} up`}><ChevronUp className="w-4 h-4 mx-auto" /></button><button type="button" onClick={() => move(widget.id,1)} disabled={index===orderedWidgets.length-1} className="min-h-10 min-w-10 rounded-lg border border-gray-200 dark:border-slate-700 disabled:opacity-30" aria-label={`Move ${widget.label} down`}><ChevronDown className="w-4 h-4 mx-auto" /></button></div></div></div>; })}</div></section>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">Hiding a section only changes this Overview page for you. Alerts, work orders, reservations, inventory and other Fleet records remain unchanged and accessible from Fleet navigation.</div>
      </div>
      <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900"><div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2"><button type="button" onClick={onReset} disabled={saving} className="min-h-11 px-3 rounded-lg border border-gray-300 dark:border-slate-700 text-sm font-semibold inline-flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" />Reset Default</button><div className="flex gap-2"><button type="button" onClick={onClose} disabled={saving} className="min-h-11 px-4 rounded-lg border border-gray-300 dark:border-slate-700 font-semibold">Cancel</button><button type="button" onClick={() => onSave(draft)} disabled={saving} className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Save Layout</button></div></div></div>
    </div>
  </div>;
}

function TodayCell({ label, value, detail, attention = false }) {
  return <div className="p-3 sm:p-4 min-w-0"><div className="text-xs font-semibold uppercase tracking-wide text-gray-400 break-words">{label}</div><div className={`mt-1 text-2xl font-bold leading-tight ${attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100"}`}>{value}</div><div className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400 break-words">{detail}</div></div>;
}

function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-3 sm:p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs sm:text-sm leading-snug text-gray-500 dark:text-slate-400 break-words">{label}</div>
        <Icon className="w-5 h-5 shrink-0 text-indigo-500" />
      </div>
      <div className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900 dark:text-slate-100 mt-2 break-words">{value}</div>
      <div className="text-xs leading-relaxed text-gray-500 dark:text-slate-500 mt-1 break-words">{sub}</div>
    </div>
  );
}

function QuickLink({ icon: Icon, title, text, page, rawPage = false }) {
  const to = rawPage ? `/${page}` : createPageUrl(page);
  return (
    <Link to={to} className="min-h-11 block rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-300" /></div>
        <div className="min-w-0">
          <div className="font-semibold leading-snug text-gray-900 dark:text-slate-100 break-words">{title}</div>
          <div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-0.5 break-words">{text}</div>
        </div>
      </div>
    </Link>
  );
}

function AttentionRow({ icon: Icon, label, value, page, query = "" }) {
  const to = query ? `${createPageUrl(page)}?${query}` : createPageUrl(page);
  return (
    <Link to={to} className="min-h-11 flex items-center justify-between gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      <span className="min-w-0 inline-flex items-center gap-2 text-sm leading-snug text-gray-600 dark:text-slate-300"><Icon className="w-4 h-4 shrink-0 text-gray-400" /><span className="break-words">{label}</span></span>
      <span className={`shrink-0 text-sm font-bold ${value > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{value}</span>
    </Link>
  );
}
