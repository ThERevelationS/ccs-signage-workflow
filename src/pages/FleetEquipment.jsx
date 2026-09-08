import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { Search, Truck, Link2, Loader2, AlertTriangle } from "lucide-react";

export default function FleetEquipment() {
  const [equipment, setEquipment] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [e, w, t] = await Promise.all([
          base44.entities.FleetEquipment.list("name", 500),
          base44.entities.FleetMaintenanceWorkOrder.list("-created_date", 500),
          base44.entities.FleetMaintenanceTask.list("start_date", 500),
        ]);
        setEquipment(e || []); setWorkOrders(w || []); setTasks(t || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter(e => [e.name, e.make, e.model, e.serial_number, e.license_plate, e.type].some(v => String(v || "").toLowerCase().includes(q)));
  }, [equipment, query]);

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Equipment</h1><p className="text-sm text-gray-500 dark:text-slate-400">Road vehicles and non-road assets. Bouncie is linked only where proven.</p></div>
          <div className="relative w-full sm:w-80"><Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search equipment..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div>
        </div>

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(eq => {
              const active = workOrders.filter(w => w.equipment_id === eq.id && !["completed","cancelled"].includes(w.status));
              const scheduled = tasks.filter(t => t.equipment_id === eq.id);
              return (
                <div key={eq.id} className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="h-40 bg-gray-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                    {eq.photo_url ? <img src={eq.photo_url} alt={eq.name} className="w-full h-full object-cover" /> : <Truck className="w-12 h-12 text-gray-300" />}
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900 dark:text-slate-100">{eq.name}</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{[eq.year, eq.make, eq.model].filter(Boolean).join(" ") || eq.type}</p></div><span className={`text-xs px-2 py-1 rounded-full ${eq.status === "operational" ? "bg-emerald-100 text-emerald-800" : eq.status === "down" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{eq.status}</span></div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-slate-300"><div><span className="text-gray-400">VIN/Serial</span><div className="truncate">{eq.serial_number || "—"}</div></div><div><span className="text-gray-400">Plate</span><div>{eq.license_plate || "—"}</div></div><div><span className="text-gray-400">Open WOs</span><div className="font-semibold">{active.length}</div></div><div><span className="text-gray-400">Schedules</span><div className="font-semibold">{scheduled.length}</div></div></div>
                    <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 ${eq.bouncie_link_status === "matched" ? "text-emerald-700 dark:text-emerald-300" : "text-gray-500"}`}><Link2 className="w-3.5 h-3.5" />Bouncie: {eq.bouncie_link_status?.replaceAll("_", " ") || "unlinked"}</span>
                      {active.some(w => w.priority === "critical") && <span className="text-red-600 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Critical</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
