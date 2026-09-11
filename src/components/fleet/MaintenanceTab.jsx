import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowRight, CalendarClock, ClipboardList, History, Loader2, Plus, Wrench } from "lucide-react";

const ACTIVE = new Set(["open", "assigned", "in_progress"]);
const pretty = (value) => String(value || "—").replaceAll("_", " ");

export default function MaintenanceTab({ equipment, openWorkOrders = [], tasks = [], logs = [], loading = false }) {
  if (!equipment) {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4">
          <div className="font-semibold text-sm text-amber-900 dark:text-amber-100">No CCS Fleet maintenance link</div>
          <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">This Bouncie vehicle does not have a safe FleetEquipment maintenance link. Tracking remains available, but maintenance history is not joined unless VIN or a unique trusted IMEI proves the identity.</div>
          <Link to={createPageUrl("FleetEquipment")} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:underline">Review Fleet equipment <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
      </div>
    );
  }

  const detailUrl = `${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(equipment.id)}`;
  const workOrdersUrl = `${createPageUrl("FleetWorkOrders")}?equipment=${encodeURIComponent(equipment.id)}`;
  const newWorkOrderUrl = `${createPageUrl("FleetWorkOrders")}?new=1&equipment=${encodeURIComponent(equipment.id)}`;
  const activeOrders = openWorkOrders.filter((row) => ACTIVE.has(row.status));
  const scheduleRows = tasks
    .filter((row) => row.status !== "completed")
    .slice()
    .sort((a, b) => String(a.start_date || "9999-12-31").localeCompare(String(b.start_date || "9999-12-31")));
  const recentLogs = logs.slice().sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Open WOs" value={activeOrders.length} />
        <Metric label="Schedules" value={tasks.length} />
        <Metric label="Usage logs" value={logs.length} />
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <Section title="Open Work Orders" icon={ClipboardList}>
            {activeOrders.length ? activeOrders.slice(0, 4).map((order) => (
              <Link key={order.id} to={`${createPageUrl("FleetWorkOrders")}?workOrder=${encodeURIComponent(order.id)}&equipment=${encodeURIComponent(equipment.id)}`} className="block rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 hover:border-indigo-300 dark:hover:border-indigo-700">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{order.work_order_number} · {order.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1 capitalize">{pretty(order.status)} · {pretty(order.priority)} priority</div></div>
                  {["critical", "high"].includes(order.priority) && <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">{pretty(order.priority)}</span>}
                </div>
              </Link>
            )) : <Empty>No active Fleet maintenance work orders.</Empty>}
            {activeOrders.length > 4 && <Link to={workOrdersUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">View all {activeOrders.length} open work orders <ArrowRight className="w-3.5 h-3.5" /></Link>}
          </Section>

          <Section title="Scheduled Maintenance" icon={CalendarClock}>
            {scheduleRows.length ? scheduleRows.slice(0, 4).map((task) => {
              const overdue = task.status === "overdue" || (task.status === "pending" && task.start_date && task.start_date < today);
              return <div key={task.id} className={`rounded-lg border p-2.5 ${overdue ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 dark:border-slate-700"}`}><div className="text-sm font-medium text-gray-900 dark:text-slate-100">{task.title}</div><div className={`text-xs mt-1 capitalize ${overdue ? "text-amber-700 dark:text-amber-300" : "text-gray-500 dark:text-slate-400"}`}>{task.type === "one_off" ? "One-time" : pretty(task.frequency)} · due {task.start_date || "—"} · {overdue ? "overdue" : pretty(task.status)}</div></div>;
            }) : <Empty>No active maintenance schedules.</Empty>}
          </Section>

          <Section title="Recent Parts & Fluid Usage" icon={History}>
            {recentLogs.length ? recentLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="py-2 border-b border-gray-100 dark:border-slate-800 last:border-0">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-sm text-gray-800 dark:text-slate-200 truncate">{log.item_name || "Fleet usage"}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{log.quantity_used ?? "—"} {log.unit || ""} · {pretty(log.item_type)}</div></div><span className="text-[10px] text-gray-400 whitespace-nowrap">{log.created_date ? new Date(log.created_date).toLocaleDateString() : "—"}</span></div>
                {log.notes && <div className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{log.notes}</div>}
              </div>
            )) : <Empty>No parts or fluid usage history yet.</Empty>}
          </Section>
        </>
      )}

      <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
        <Link to={detailUrl} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300"><Wrench className="w-3.5 h-3.5" />Full maintenance record</Link>
        <Link to={newWorkOrderUrl} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"><Plus className="w-3.5 h-3.5" />New work order</Link>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-950/40 px-2.5 py-2"><div className="text-[10px] text-gray-400">{label}</div><div className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-0.5">{value}</div></div>;
}

function Section({ title, icon: Icon, children }) {
  return <section className="space-y-2"><div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400"><Icon className="w-3.5 h-3.5" />{title}</div>{children}</section>;
}

function Empty({ children }) {
  return <div className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-4 text-xs text-gray-400 text-center">{children}</div>;
}