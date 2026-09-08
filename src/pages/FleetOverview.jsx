import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [equipment, tasks, workOrders, parts, fluids, requests, liveState] = await Promise.all([
          base44.entities.FleetEquipment.list("name", 500),
          base44.entities.FleetMaintenanceTask.list("start_date", 500),
          base44.entities.FleetMaintenanceWorkOrder.list("-created_date", 500),
          base44.entities.FleetPart.list("part_name", 500),
          base44.entities.FleetFluid.list("fluid_name", 500),
          base44.entities.FleetPartFluidRequest.list("-created_date", 500),
          base44.entities.BouncieVehicleLiveState.list("-last_seen_at", 500),
        ]);
        if (mounted) setData({ equipment, tasks, workOrders, parts, fluids, requests, liveState });
      } catch (e) {
        if (mounted) setError(e?.message || "Unable to load Fleet overview.");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const metrics = useMemo(() => {
    if (!data) return null;
    const activeOrders = data.workOrders.filter(w => !["completed", "cancelled"].includes(w.status));
    const lowParts = data.parts.filter(p => p.enable_low_stock_alerts !== false && Number(p.quantity_on_hand ?? 0) <= Number(p.minimum_stock ?? 0));
    const lowFluids = data.fluids.filter(f => f.enable_low_stock_alerts !== false && f.quantity != null && f.minimum_stock != null && Number(f.quantity) <= Number(f.minimum_stock));
    const pendingRequests = data.requests.filter(r => ["pending", "ordered"].includes(r.status));
    const uniqueTracked = new Set(data.liveState.map(v => v.vehicle_vin).filter(Boolean)).size;
    return { activeOrders, lowStock: lowParts.length + lowFluids.length, pendingRequests, uniqueTracked };
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <MetricCard icon={Truck} label="Equipment" value={data.equipment.length} sub={`${metrics.uniqueTracked} tracked VIN${metrics.uniqueTracked === 1 ? "" : "s"}`} />
              <MetricCard icon={ClipboardList} label="Open Work Orders" value={metrics.activeOrders.length} sub={`${data.workOrders.length} total history`} />
              <MetricCard icon={CalendarClock} label="Maintenance Schedules" value={data.tasks.length} sub="Recurring + one-off" />
              <MetricCard icon={AlertTriangle} label="Low Stock" value={metrics.lowStock} sub={`${data.parts.length} parts · ${data.fluids.length} fluids`} />
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
                <QuickLink icon={Navigation} title="Bouncie Tracking" text="Live vehicles, trips, alerts and telemetry" page="FleetTracking" />
                <QuickLink icon={ShoppingCart} title="Requests" text={`${metrics.pendingRequests.length} pending or ordered`} page="FleetRequests" />
                <QuickLink icon={Package} title="Parts" text={`${data.parts.length} Fleet-specific part records`} page="FleetParts" />
                <QuickLink icon={Droplets} title="Fluids" text={`${data.fluids.length} Fleet-specific fluid records`} page="FleetFluids" />
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

function QuickLink({ icon: Icon, title, text, page }) {
  return (
    <Link to={createPageUrl(page)} className="block rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
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
