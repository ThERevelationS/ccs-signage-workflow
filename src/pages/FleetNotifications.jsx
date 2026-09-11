import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { filterAllFleetRows, listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { easternTodayText, isFluidLowStock, isWorkOrderPastProjected, workOrderAgeDays } from "@/components/fleet/fleetHelpers";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  ClipboardList,
  Droplets,
  Loader2,
  Navigation,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  UserRoundX,
} from "lucide-react";

const normalizeVin = (value) => String(value || "").trim().toUpperCase();
const normalizeImei = (value) => String(value || "").trim();

function hasRuntimeBouncieIdentityConflict(equipment, bouncieVehicles) {
  const vin = normalizeVin(equipment?.vin);
  const imei = normalizeImei(equipment?.bouncie_imei);
  if (!vin || !imei || !["matched", "manual"].includes(equipment?.bouncie_link_status) || !bouncieVehicles.length) return false;
  if (bouncieVehicles.some(vehicle => normalizeVin(vehicle?.vin) === vin && normalizeImei(vehicle?.imei) === imei)) return false;
  return bouncieVehicles.some(vehicle => normalizeImei(vehicle?.imei) === imei && normalizeVin(vehicle?.vin) && normalizeVin(vehicle?.vin) !== vin);
}

const groupConfig = {
  maintenance: { label: "Maintenance", icon: CalendarClock },
  work_orders: { label: "Work Orders", icon: ClipboardList },
  inventory: { label: "Inventory", icon: Package },
  requests: { label: "Requests", icon: ShoppingCart },
  bouncie: { label: "Bouncie", icon: Navigation },
  system: { label: "System", icon: Activity },
};

export default function FleetNotifications() {
  const [data, setData] = useState(null);
  const [adminHealth, setAdminHealth] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = await base44.auth.me().catch(() => null);
        const admin = user?.role === "admin";
        if (mounted) setIsAdmin(admin);
        const [equipment, tasks, workOrders, parts, fluids, requests, bouncieWarnings, bouncieCritical, bouncieVehiclesResult] = await Promise.all([
          listAllFleetRows(base44.entities.FleetEquipment, "name", { label: "Fleet notification equipment" }),
          filterAllFleetRows(base44.entities.FleetMaintenanceTask, { status: { $in: ["pending", "overdue"] } }, "start_date", { label: "Active Fleet maintenance notifications" }),
          filterAllFleetRows(base44.entities.FleetMaintenanceWorkOrder, { status: { $in: ["open", "assigned", "in_progress"] } }, "-created_date", { label: "Active Fleet work-order notifications" }),
          listAllFleetRows(base44.entities.FleetPart, "part_name", { label: "Fleet part stock notifications" }),
          listAllFleetRows(base44.entities.FleetFluid, "fluid_name", { label: "Fleet fluid stock notifications" }),
          filterAllFleetRows(base44.entities.FleetPartFluidRequest, { status: { $in: ["pending", "ordered"] } }, "-created_date", { label: "Active Fleet request notifications" }),
          filterAllFleetRows(base44.entities.BouncieNotification, { is_read: false, severity: "warning" }, "-timestamp", { label: "Unread Bouncie warning notifications" }),
          filterAllFleetRows(base44.entities.BouncieNotification, { is_read: false, severity: "critical" }, "-timestamp", { label: "Unread critical Bouncie notifications" }),
          base44.functions.invoke("bouncieApi", { method: "GET", path: "/v1/vehicles", query: {} }).catch(() => null),
        ]);
        if (mounted) setData({
          equipment: equipment || [],
          tasks: tasks || [],
          workOrders: workOrders || [],
          parts: parts || [],
          fluids: fluids || [],
          requests: requests || [],
          bouncieAlerts: [...(bouncieCritical || []), ...(bouncieWarnings || [])],
          bouncieVehicles: bouncieVehiclesResult?.data?.data || [],
        });

        if (admin) {
          const [pendingQueue, sendingQueue, failedQueue, startedReceipts, failedReceipts, bouncieStatusResult] = await Promise.all([
            filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "pending" }, "-created_date", { label: "Pending Fleet notification queue" }),
            filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "sending" }, "-created_date", { label: "Sending Fleet notification queue" }),
            filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "failed" }, "-created_date", { label: "Failed Fleet notification queue" }),
            filterAllFleetRows(base44.entities.FleetOperationReceipt, { status: "started" }, "-created_date", { label: "Started Fleet operation receipts" }),
            filterAllFleetRows(base44.entities.FleetOperationReceipt, { status: "failed" }, "-created_date", { label: "Failed Fleet operation receipts" }),
            base44.functions.invoke("bouncieStatus", {}).catch(() => null),
          ]);
          const bouncieStatus = bouncieStatusResult?.data || null;
          if (mounted) setAdminHealth({
            pendingQueue: pendingQueue || [],
            sendingQueue: sendingQueue || [],
            failedQueue: failedQueue || [],
            startedReceipts: startedReceipts || [],
            failedReceipts: failedReceipts || [],
            bouncieStatus,
          });
        }
      } catch (loadError) {
        if (mounted) setError(loadError?.message || "Unable to load Fleet notifications.");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const notifications = useMemo(() => {
    if (!data) return [];
    const names = Object.fromEntries(data.equipment.map(item => [item.id, item.name]));
    const today = easternTodayText();
    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 14);
    const horizonText = horizon.toISOString().slice(0, 10);
    const rows = [];

    for (const task of data.tasks) {
      const overdue = task.status === "overdue" || (!!task.start_date && String(task.start_date) < today);
      const dueSoon = !!task.start_date && String(task.start_date) >= today && String(task.start_date) <= horizonText;
      if (!overdue && !dueSoon) continue;
      rows.push({
        key: `maintenance-${task.id}`,
        group: "maintenance",
        severity: overdue ? "critical" : "warning",
        title: overdue ? `Overdue maintenance: ${task.title}` : `Maintenance due soon: ${task.title}`,
        detail: `${names[task.equipment_id] || "Unresolved equipment"}${task.start_date ? ` · due ${task.start_date}` : ""}`,
        to: task.equipment_id ? `${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(task.equipment_id)}&tab=schedule` : `${createPageUrl("FleetMaintenance")}?status=${overdue ? "overdue" : "pending"}`,
        timestamp: task.start_date || "",
      });
    }

    for (const workOrder of data.workOrders) {
      const age = workOrderAgeDays(workOrder, today);
      const high = ["critical", "high"].includes(workOrder.priority);
      const unassigned = !String(workOrder.assigned_to || "").trim();
      const stale = (age ?? -1) >= 30;
      const pastProjected = isWorkOrderPastProjected(workOrder, today);
      const issues = [high ? `${workOrder.priority} priority` : "", unassigned ? "unassigned" : "", stale ? `${age} days open` : "", pastProjected ? "past projected completion" : ""].filter(Boolean);
      if (!issues.length) continue;
      rows.push({
        key: `work-order-${workOrder.id}`,
        group: "work_orders",
        severity: workOrder.priority === "critical" ? "critical" : "warning",
        title: `${workOrder.work_order_number} · ${workOrder.title}`,
        detail: `${names[workOrder.equipment_id] || "Unresolved equipment"} · ${issues.join(" · ")}`,
        to: `${createPageUrl("FleetWorkOrders")}?status=all&workOrder=${encodeURIComponent(workOrder.id)}${workOrder.equipment_id ? `&equipment=${encodeURIComponent(workOrder.equipment_id)}` : ""}`,
        timestamp: workOrder.started_date || workOrder.created_date || "",
      });
    }

    for (const part of data.parts) {
      const low = part.enable_low_stock_alerts !== false && part.quantity_on_hand != null && part.minimum_stock != null && Number(part.quantity_on_hand) <= Number(part.minimum_stock);
      if (!low) continue;
      rows.push({ key: `part-${part.id}`, group: "inventory", severity: Number(part.quantity_on_hand || 0) <= 0 ? "critical" : "warning", title: `Low-stock part: ${part.part_name}`, detail: `${part.quantity_on_hand ?? "—"} on hand · minimum ${part.minimum_stock ?? "—"}${part.location ? ` · ${part.location}` : ""}`, to: `${createPageUrl("FleetParts")}?stock=low&search=${encodeURIComponent(part.part_name || "")}`, timestamp: part.updated_date || "" });
    }
    for (const fluid of data.fluids) {
      if (!isFluidLowStock(fluid)) continue;
      rows.push({ key: `fluid-${fluid.id}`, group: "inventory", severity: Number(fluid.quantity || 0) <= 0 ? "critical" : "warning", title: `Low-stock fluid: ${fluid.fluid_name}`, detail: `${fluid.quantity ?? "—"} ${fluid.unit || ""} on hand · minimum ${fluid.minimum_stock ?? "—"} ${fluid.minimum_stock_unit || fluid.unit || ""}`, to: `${createPageUrl("FleetFluids")}?stock=low&search=${encodeURIComponent(fluid.fluid_name || "")}`, timestamp: fluid.updated_date || "" });
    }

    for (const request of data.requests) {
      rows.push({ key: `request-${request.id}`, group: "requests", severity: request.status === "pending" ? "warning" : "info", title: `${request.status === "ordered" ? "Ordered" : "Pending"} request: ${request.item_name}`, detail: `${request.item_type || "item"} · qty ${request.quantity_needed ?? "—"}${names[request.equipment_id] ? ` · ${names[request.equipment_id]}` : ""}`, to: `${createPageUrl("FleetRequests")}?status=${request.status}&search=${encodeURIComponent(request.item_name || "")}`, timestamp: request.updated_date || request.created_date || "" });
    }

    for (const equipment of data.equipment) {
      if (equipment.bouncie_link_status !== "ambiguous" && !hasRuntimeBouncieIdentityConflict(equipment, data.bouncieVehicles || [])) continue;
      rows.push({ key: `identity-${equipment.id}`, group: "bouncie", severity: "critical", title: `Bouncie identity conflict: ${equipment.name}`, detail: [equipment.vin ? `VIN ${equipment.vin}` : "", equipment.bouncie_imei ? `IMEI ${equipment.bouncie_imei}` : ""].filter(Boolean).join(" · "), to: createPageUrl("FleetEquipment"), timestamp: equipment.updated_date || "" });
    }
    for (const alert of data.bouncieAlerts) {
      rows.push({ key: `bouncie-${alert.id}`, group: "bouncie", severity: alert.severity === "critical" ? "critical" : "warning", title: alert.title || "Bouncie alert", detail: `${alert.vehicle_nickname || alert.vehicle_vin || "Vehicle"}${alert.description ? ` · ${alert.description}` : ""}`, to: `${createPageUrl("FleetTracking")}?vin=${encodeURIComponent(alert.vehicle_vin || "")}`, timestamp: alert.timestamp || alert.created_date || "" });
    }

    if (isAdmin && adminHealth) {
      const queueRows = [...adminHealth.failedQueue, ...adminHealth.sendingQueue, ...adminHealth.pendingQueue];
      for (const row of queueRows) {
        rows.push({ key: `queue-${row.id}`, group: "system", severity: row.status === "failed" ? "critical" : "warning", title: `Fleet notification ${row.status}: ${row.event_type || "event"}`, detail: `${row.recipient_email || "recipient unavailable"}${row.last_error ? ` · ${row.last_error}` : ""}`, to: createPageUrl("FleetSettings"), timestamp: row.last_attempt_at || row.created_date || "" });
      }
      const receiptRows = [...adminHealth.failedReceipts, ...adminHealth.startedReceipts];
      for (const row of receiptRows) {
        rows.push({ key: `receipt-${row.id}`, group: "system", severity: row.status === "failed" ? "critical" : "warning", title: `Fleet operation ${row.status}: ${row.operation_type || "operation"}`, detail: `${row.target_entity || "target"}${row.target_id ? ` · ${row.target_id}` : ""}${row.error_message ? ` · ${row.error_message}` : ""}`, to: createPageUrl("FleetSettings"), timestamp: row.failed_at || row.started_at || row.created_date || "" });
      }
      const status = adminHealth.bouncieStatus;
      const unhealthy = !status?.connected || status?.needsReconnect || status?.lastError || status?.webhookError || status?.webhookActive !== true;
      if (unhealthy) rows.push({ key: "system-bouncie-health", group: "system", severity: "critical", title: "Bouncie connection or webhook needs attention", detail: status?.lastError || status?.webhookError || "Review Fleet Bouncie connection health.", to: createPageUrl("FleetSettings"), timestamp: status?.lastSyncAt || status?.lastWebhookAt || "" });
    }

    const severityRank = { critical: 0, warning: 1, info: 2 };
    return rows.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || (Date.parse(b.timestamp || "") || 0) - (Date.parse(a.timestamp || "") || 0));
  }, [data, adminHealth, isAdmin]);

  const counts = useMemo(() => {
    const result = { all: notifications.length };
    for (const key of Object.keys(groupConfig)) result[key] = notifications.filter(row => row.group === key).length;
    return result;
  }, [notifications]);
  const visible = filter === "all" ? notifications : notifications.filter(row => row.group === filter);

  if (!data && !error) return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="py-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div></div>;

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950">
    <FleetModuleNav />
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Notification Center</h1><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">One operational attention queue for maintenance, work orders, inventory, requests, Bouncie, and Fleet system health.</p></div><div className="text-sm font-semibold text-gray-700 dark:text-slate-200">{notifications.length} active signal{notifications.length === 1 ? "" : "s"}</div></div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">This page reads operational state and links to the owning workflow. It does not alter Fleet email queue/retry state. Bouncie alerts can still be marked read from Tracking.</div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <div className="overflow-x-auto -mx-1 px-1"><div className="inline-flex min-w-max rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")} icon={Bell} label="All" count={counts.all || 0} />
        {Object.entries(groupConfig).map(([key, config]) => <FilterButton key={key} active={filter === key} onClick={() => setFilter(key)} icon={config.icon} label={config.label} count={counts[key] || 0} />)}
      </div></div>

      {visible.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 py-12 px-5 text-center dark:border-emerald-900 dark:bg-emerald-950/20"><Bell className="w-8 h-8 mx-auto text-emerald-500" /><div className="mt-3 font-semibold text-emerald-800 dark:text-emerald-200">No active signals in this view</div><p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-300/80">Nothing currently needs attention for this category.</p></div> : <div className="space-y-3">{visible.map(item => <NotificationCard key={item.key} item={item} />)}</div>}
    </div>
  </div>;
}

function FilterButton({ active, onClick, icon: Icon, label, count }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><Icon className="w-4 h-4" />{label}<span className={`min-w-[20px] h-5 px-1 rounded-full text-[10px] inline-flex items-center justify-center ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-200"}`}>{count}</span></button>;
}

function NotificationCard({ item }) {
  const config = groupConfig[item.group] || { label: "Fleet", icon: Bell };
  const Icon = item.group === "inventory" && item.title.includes("fluid") ? Droplets : item.group === "work_orders" && item.detail.includes("unassigned") ? UserRoundX : item.group === "bouncie" && item.title.includes("identity") ? Truck : config.icon;
  const critical = item.severity === "critical";
  const info = item.severity === "info";
  return <Link to={item.to} className={`block rounded-xl border bg-white p-4 shadow-sm transition hover:border-indigo-300 dark:bg-slate-900 dark:hover:border-indigo-700 ${critical ? "border-red-200 dark:border-red-900" : info ? "border-gray-200 dark:border-slate-800" : "border-amber-200 dark:border-amber-900"}`}>
    <div className="flex items-start gap-3"><div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${critical ? "bg-red-50 dark:bg-red-950/40" : info ? "bg-gray-100 dark:bg-slate-800" : "bg-amber-50 dark:bg-amber-950/40"}`}><Icon className={`w-5 h-5 ${critical ? "text-red-600 dark:text-red-300" : info ? "text-gray-500 dark:text-slate-300" : "text-amber-600 dark:text-amber-300"}`} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="font-semibold text-gray-900 dark:text-slate-100">{item.title}</div><span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${critical ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" : info ? "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}>{item.severity}</span></div><div className="text-sm text-gray-500 dark:text-slate-400 mt-1 break-words">{item.detail}</div><div className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">Open {config.label}</div></div></div>
  </Link>;
}
