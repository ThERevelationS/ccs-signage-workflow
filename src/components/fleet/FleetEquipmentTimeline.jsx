import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  Droplets,
  History,
  Package,
  ShoppingCart,
  Truck,
  Wrench,
} from "lucide-react";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "maintenance", label: "Maintenance" },
  { key: "usage", label: "Parts & Fluids" },
  { key: "alerts", label: "Alerts" },
  { key: "requests", label: "Requests" },
  { key: "equipment", label: "Equipment" },
];

const dateValue = value => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateOnlyValue = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? `${value}T12:00:00` : value;
const formatWhen = value => {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const pretty = value => String(value || "—").replaceAll("_", " ");
const shortText = (value, max = 180) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};

function buildEvents({ equipment, workOrders, logs, notifications, requests }) {
  const events = [];

  for (const workOrder of workOrders || []) {
    const createdAt = workOrder.created_date || workOrder.migration_source_created_date;
    if (createdAt) events.push({
      id: `wo-created-${workOrder.id}`,
      category: "maintenance",
      kind: "work_order",
      timestamp: createdAt,
      title: `${workOrder.work_order_number} opened`,
      detail: [workOrder.title, `${pretty(workOrder.priority)} priority`, workOrder.assigned_to || "Unassigned"].filter(Boolean).join(" · "),
      href: `${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(workOrder.id)}${equipment?.id ? `&equipment=${encodeURIComponent(equipment.id)}` : ""}`,
    });

    if (workOrder.completed_date) events.push({
      id: `wo-completed-${workOrder.id}`,
      category: "maintenance",
      kind: "completion",
      timestamp: dateOnlyValue(workOrder.completed_date),
      title: `${workOrder.work_order_number} completed`,
      detail: shortText(workOrder.corrective_action || workOrder.notes || workOrder.title),
      href: `${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(workOrder.id)}${equipment?.id ? `&equipment=${encodeURIComponent(equipment.id)}` : ""}`,
    });

    if (!["completed", "cancelled"].includes(workOrder.status) && workOrder.updated_date && workOrder.updated_date !== createdAt) events.push({
      id: `wo-state-${workOrder.id}`,
      category: "maintenance",
      kind: "work_order",
      timestamp: workOrder.updated_date,
      title: `${workOrder.work_order_number} · ${pretty(workOrder.status)}`,
      detail: shortText(workOrder.notes || workOrder.title),
      href: `${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(workOrder.id)}${equipment?.id ? `&equipment=${encodeURIComponent(equipment.id)}` : ""}`,
    });
  }

  for (const log of logs || []) {
    const timestamp = log.created_date || log.migration_source_created_date;
    if (!timestamp) continue;
    events.push({
      id: `usage-${log.id}`,
      category: "usage",
      kind: log.item_type === "fluid" ? "fluid" : "part",
      timestamp,
      title: `${log.item_name} used`,
      detail: `${log.quantity_used ?? "—"} ${log.unit || ""}${log.recorded_by ? ` · ${log.recorded_by}` : ""}${log.notes ? ` · ${shortText(log.notes, 110)}` : ""}`.trim(),
      href: log.work_order_id ? `${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(log.work_order_id)}${equipment?.id ? `&equipment=${encodeURIComponent(equipment.id)}` : ""}` : "",
    });
  }

  for (const request of requests || []) {
    const createdAt = request.created_date || request.migration_source_created_date;
    if (createdAt) events.push({
      id: `request-${request.id}`,
      category: "requests",
      kind: "request",
      timestamp: createdAt,
      title: `${request.item_name} requested`,
      detail: `${pretty(request.item_type)} · qty ${request.quantity_needed ?? "—"} · ${pretty(request.status)}${request.justification ? ` · ${shortText(request.justification, 110)}` : ""}`,
      href: `${createPageUrl("FleetRequests")}?status=all`,
    });
    if (request.received_at) events.push({
      id: `request-received-${request.id}`,
      category: "requests",
      kind: "request_received",
      timestamp: request.received_at,
      title: `${request.item_name} received`,
      detail: `${request.quantity_received ?? request.quantity_needed ?? "—"} ${request.received_unit || ""}${request.received_by ? ` · ${request.received_by}` : ""}`.trim(),
      href: `${createPageUrl("FleetRequests")}?status=received`,
    });
  }

  for (const notification of notifications || []) {
    if (!notification.timestamp) continue;
    events.push({
      id: `alert-${notification.id}`,
      category: "alerts",
      kind: "alert",
      timestamp: notification.timestamp,
      title: notification.title || pretty(notification.event_type),
      detail: shortText(notification.description || `${pretty(notification.severity)} Bouncie notification`),
      href: equipment?.vin ? `${createPageUrl("FleetTracking")}?vin=${encodeURIComponent(equipment.vin)}${equipment.bouncie_imei ? `&imei=${encodeURIComponent(equipment.bouncie_imei)}` : ""}` : createPageUrl("FleetTracking"),
      severity: notification.severity,
    });
  }

  const equipmentUpdatedAt = equipment?.updated_date || equipment?.migration_source_updated_date;
  if (equipmentUpdatedAt) events.push({
    id: `equipment-updated-${equipment.id}`,
    category: "equipment",
    kind: "equipment",
    timestamp: equipmentUpdatedAt,
    title: "Equipment record updated",
    detail: shortText(equipment.notes || `Current status: ${pretty(equipment.status)}`),
    href: "",
  });

  return events.sort((a, b) => dateValue(b.timestamp) - dateValue(a.timestamp));
}

export default function FleetEquipmentTimeline({ equipment, workOrders = [], logs = [], notifications = [], requests = [] }) {
  const [filter, setFilter] = useState("all");
  const events = useMemo(() => buildEvents({ equipment, workOrders, logs, notifications, requests }), [equipment, workOrders, logs, notifications, requests]);
  const visible = filter === "all" ? events : events.filter(event => event.category === filter);

  return <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
    <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
      <div><h2 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2"><History className="w-4 h-4 text-indigo-500" />Equipment Activity Timeline</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Built from preserved Fleet and Bouncie records; no historical records are rewritten.</p></div>
      <div className="flex gap-1 overflow-x-auto pb-1 lg:pb-0">{FILTERS.map(option => <button key={option.key} onClick={() => setFilter(option.key)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === option.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300"}`}>{option.label}</button>)}</div>
    </div>
    <div className="p-4">
      {visible.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No activity exists for this filter.</div> : <div className="relative">
        <div className="absolute left-[18px] top-4 bottom-4 w-px bg-gray-200 dark:bg-slate-700" />
        <div className="space-y-1">{visible.map(event => <TimelineEvent key={event.id} event={event} />)}</div>
      </div>}
    </div>
  </section>;
}

function TimelineEvent({ event }) {
  const meta = eventMeta(event);
  const Icon = meta.icon;
  const content = <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50 p-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{event.title}</div><div className="text-[11px] text-gray-400 whitespace-nowrap">{formatWhen(event.timestamp)}</div></div>
    {event.detail && <div className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 whitespace-pre-wrap">{event.detail}</div>}
  </div>;
  return <div className="relative flex items-start gap-3 py-1.5">
    <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-white dark:border-slate-900 ${meta.tone}`}><Icon className="w-4 h-4" /></div>
    {event.href ? <Link to={event.href} className="min-w-0 flex-1">{content}</Link> : content}
  </div>;
}

function eventMeta(event) {
  if (event.kind === "completion") return { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
  if (event.kind === "part") return { icon: Package, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" };
  if (event.kind === "fluid") return { icon: Droplets, tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300" };
  if (event.kind === "request" || event.kind === "request_received") return { icon: ShoppingCart, tone: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" };
  if (event.kind === "alert") return { icon: Bell, tone: event.severity === "critical" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
  if (event.kind === "equipment") return { icon: Truck, tone: "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-200" };
  if (event.kind === "work_order") return { icon: ClipboardList, tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" };
  return { icon: Wrench, tone: "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300" };
}
