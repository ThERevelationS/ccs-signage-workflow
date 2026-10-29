import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { filterAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  Fuel,
  History,
  Package,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Wrench,
} from "lucide-react";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "maintenance", label: "Maintenance" },
  { key: "inspections", label: "Inspections" },
  { key: "usage", label: "Parts & Fluids" },
  { key: "fuel", label: "Fuel" },
  { key: "assignments", label: "Assignments" },
  { key: "coverage", label: "Warranties" },
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

function buildEvents({ equipment, workOrders, logs, notifications, requests, inspections, fuelEntries, warranties, reservations }) {
  const events = [];

  for (const workOrder of workOrders || []) {
    const createdAt = workOrder.created_date || workOrder.migration_source_created_date;
    if (createdAt) events.push({
      id: `wo-created-${workOrder.id}`,
      category: "maintenance",
      kind: "work_order",
      timestamp: createdAt,
      title: `${workOrder.work_order_number} opened`,
      detail: [workOrder.title, `${pretty(workOrder.priority)} priority`, workOrder.public_submission_key ? `Public report${workOrder.public_reporter_name ? ` · ${workOrder.public_reporter_name}` : ""}` : "", workOrder.assigned_to || "Unassigned"].filter(Boolean).join(" · "),
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

  for (const inspection of inspections || []) {
    const startedAt = inspection.started_at || inspection.created_date;
    if (startedAt) events.push({
      id: `inspection-start-${inspection.id}`,
      category: "inspections",
      kind: "inspection",
      timestamp: startedAt,
      title: `${inspection.template_name || "Fleet inspection"} started`,
      detail: [inspection.inspector_name || inspection.inspector_email, pretty(inspection.inspection_type), pretty(inspection.status)].filter(Boolean).join(" · "),
      href: `${createPageUrl("FleetInspections")}?equipment=${encodeURIComponent(equipment?.id || "")}`,
    });
    if (inspection.completed_at) events.push({
      id: `inspection-complete-${inspection.id}`,
      category: "inspections",
      kind: inspection.status === "failed" || inspection.status === "needs_attention" ? "inspection_attention" : "inspection_complete",
      timestamp: inspection.completed_at,
      title: `${inspection.template_name || "Fleet inspection"} · ${pretty(inspection.status)}`,
      detail: [inspection.failed_item_count ? `${inspection.failed_item_count} failed item${inspection.failed_item_count === 1 ? "" : "s"}` : "No failed items", inspection.generated_work_order_ids?.length ? `${inspection.generated_work_order_ids.length} Fleet WO follow-up${inspection.generated_work_order_ids.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "),
      href: `${createPageUrl("FleetInspections")}?equipment=${encodeURIComponent(equipment?.id || "")}`,
    });
  }

  for (const entry of fuelEntries || []) {
    const timestamp = entry.fueled_at || entry.created_date;
    if (!timestamp) continue;
    events.push({
      id: `fuel-${entry.id}`,
      category: "fuel",
      kind: "fuel",
      timestamp,
      title: entry.vendor ? `Fuel · ${entry.vendor}` : "Fuel recorded",
      detail: [entry.gallons != null ? `${Number(entry.gallons).toLocaleString(undefined, { maximumFractionDigits: 3 })} gal` : "", entry.total_cost != null ? `$${Number(entry.total_cost).toFixed(2)}` : "", entry.odometer != null ? `${Number(entry.odometer).toLocaleString()} mi` : ""].filter(Boolean).join(" · "),
      href: `${createPageUrl("FleetFuel")}?equipment=${encodeURIComponent(equipment?.id || "")}`,
    });
  }

  for (const warranty of warranties || []) {
    const timestamp = warranty.created_date || warranty.start_date;
    if (!timestamp) continue;
    events.push({
      id: `warranty-${warranty.id}`,
      category: "coverage",
      kind: "warranty",
      timestamp: dateOnlyValue(timestamp),
      title: `${warranty.name || "Warranty"} added`,
      detail: [warranty.provider, pretty(warranty.category), warranty.reference_number ? `Ref ${warranty.reference_number}` : "", warranty.end_date ? `ends ${warranty.end_date}` : ""].filter(Boolean).join(" · "),
      href: `${createPageUrl("FleetWarranties")}?equipment=${encodeURIComponent(equipment?.id || "")}`,
    });
  }

  for (const reservation of reservations || []) {
    const createdAt = reservation.created_date;
    if (createdAt) events.push({
      id: `reservation-${reservation.id}`,
      category: "assignments",
      kind: "assignment",
      timestamp: createdAt,
      title: `Reserved for ${reservation.reserved_by_name || reservation.reserved_by_email || "Fleet user"}`,
      detail: [reservation.assignment_label, reservation.job_site, reservation.start_at ? `starts ${formatWhen(reservation.start_at)}` : ""].filter(Boolean).join(" · "),
      href: `${createPageUrl("FleetReservations")}?equipment=${encodeURIComponent(equipment?.id || "")}`,
    });
    if (reservation.checked_out_at) events.push({
      id: `reservation-checkout-${reservation.id}`,
      category: "assignments",
      kind: "assignment_checkout",
      timestamp: reservation.checked_out_at,
      title: `Checked out to ${reservation.reserved_by_name || reservation.reserved_by_email || "Fleet user"}`,
      detail: [reservation.assignment_label, reservation.job_site, reservation.pickup_meter != null ? `pickup meter ${Number(reservation.pickup_meter).toLocaleString()}` : ""].filter(Boolean).join(" · "),
      href: `${createPageUrl("FleetReservations")}?equipment=${encodeURIComponent(equipment?.id || "")}`,
    });
    if (reservation.returned_at) events.push({
      id: `reservation-return-${reservation.id}`,
      category: "assignments",
      kind: "assignment_return",
      timestamp: reservation.returned_at,
      title: "Equipment returned",
      detail: [reservation.reserved_by_name || reservation.reserved_by_email, reservation.return_meter != null ? `return meter ${Number(reservation.return_meter).toLocaleString()}` : ""].filter(Boolean).join(" · "),
      href: `${createPageUrl("FleetReservations")}?equipment=${encodeURIComponent(equipment?.id || "")}`,
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

export default function FleetEquipmentTimeline({ equipment, workOrders = [], logs = [], notifications = [], requests = [], inspections = [] }) {
  const [filter, setFilter] = useState("all");
  const [extraActivity, setExtraActivity] = useState({ fuelEntries: [], warranties: [], reservations: [] });
  const [extraLoading, setExtraLoading] = useState(true);
  const [extraError, setExtraError] = useState("");

  useEffect(() => {
    let mounted = true;
    setExtraLoading(true);
    setExtraError("");
    Promise.all([
      filterAllFleetRows("FleetFuelEntry", { equipment_id: equipment?.id || "" }, "-fueled_at", { label: `${equipment?.name || "Fleet equipment"} fuel timeline` }).catch(() => []),
      filterAllFleetRows("FleetWarranty", { equipment_id: equipment?.id || "" }, "-created_date", { label: `${equipment?.name || "Fleet equipment"} warranty timeline` }).catch(() => []),
      filterAllFleetRows("FleetReservation", { equipment_id: equipment?.id || "" }, "-created_date", { label: `${equipment?.name || "Fleet equipment"} assignment timeline` }).catch(() => []),
    ]).then(([fuelEntries, warranties, reservations]) => {
      if (!mounted) return;
      setExtraActivity({ fuelEntries: fuelEntries || [], warranties: warranties || [], reservations: reservations || [] });
    }).catch(error => {
      if (mounted) setExtraError(error?.message || "Some newer Fleet activity could not be loaded.");
    }).finally(() => {
      if (mounted) setExtraLoading(false);
    });
    return () => { mounted = false; };
  }, [equipment?.id, equipment?.name]);

  const events = useMemo(() => buildEvents({ equipment, workOrders, logs, notifications, requests, inspections, ...extraActivity }), [equipment, workOrders, logs, notifications, requests, inspections, extraActivity]);
  const visible = filter === "all" ? events : events.filter(event => event.category === filter);

  return <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
    <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 space-y-3">
      <div><h2 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2"><History className="w-4 h-4 text-indigo-500" />Equipment Activity Timeline</h2><p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1">Built from preserved Fleet and Bouncie records; no historical records are rewritten.</p><div className="mt-1 text-[11px] text-gray-400">Showing {visible.length} of {events.length} event{events.length === 1 ? "" : "s"}.</div>{extraLoading && <div className="text-[11px] text-indigo-600 dark:text-indigo-300 mt-1">Loading fuel, warranty and assignment activity…</div>}{extraError && <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">{extraError}</div>}</div>
      <label className="flex sm:hidden items-center gap-2"><span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-slate-400">Show</span><select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filter equipment activity timeline" className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">{FILTERS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <div className="hidden sm:flex flex-wrap gap-1.5">{FILTERS.map(option => <button type="button" key={option.key} aria-pressed={filter === option.key} onClick={() => setFilter(option.key)} className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${filter === option.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}>{option.label}</button>)}</div>
    </div>
    <div className="p-3 sm:p-4">
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
  const content = <div className="min-w-0 min-h-11 flex-1 rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50 p-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5"><div className="font-semibold text-sm leading-snug text-gray-900 dark:text-slate-100 break-words">{event.title}</div><div className="text-[11px] text-gray-400 sm:whitespace-nowrap">{formatWhen(event.timestamp)}</div></div>
    {event.detail && <div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1.5 whitespace-pre-wrap break-words">{event.detail}</div>}
  </div>;
  return <div className="relative flex items-start gap-2.5 sm:gap-3 py-1.5">
    <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-white dark:border-slate-900 ${meta.tone}`}><Icon className="w-4 h-4" /></div>
    {event.href ? <Link to={event.href} className="min-w-0 flex-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{content}</Link> : content}
  </div>;
}

function eventMeta(event) {
  if (event.kind === "completion" || event.kind === "inspection_complete") return { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
  if (event.kind === "inspection") return { icon: ClipboardCheck, tone: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" };
  if (event.kind === "inspection_attention") return { icon: ClipboardCheck, tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
  if (event.kind === "fuel") return { icon: Fuel, tone: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" };
  if (event.kind === "warranty") return { icon: ShieldCheck, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" };
  if (["assignment", "assignment_checkout", "assignment_return"].includes(event.kind)) return { icon: CalendarDays, tone: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" };
  if (event.kind === "part") return { icon: Package, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" };
  if (event.kind === "fluid") return { icon: Droplets, tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300" };
  if (event.kind === "request" || event.kind === "request_received") return { icon: ShoppingCart, tone: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" };
  if (event.kind === "alert") return { icon: Bell, tone: event.severity === "critical" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
  if (event.kind === "equipment") return { icon: Truck, tone: "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-200" };
  if (event.kind === "work_order") return { icon: ClipboardList, tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" };
  return { icon: Wrench, tone: "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300" };
}
