import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetEquipmentDialog from "@/components/fleet/FleetEquipmentDialog";
import { Search, Truck, Link2, Loader2, AlertTriangle, Plus, Pencil, ArrowRight, Wrench, CircleOff } from "lucide-react";

export default function FleetEquipment() {
  const [equipment, setEquipment] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [e, w, t, u] = await Promise.all([
        base44.entities.FleetEquipment.list("name", 500),
        base44.entities.FleetMaintenanceWorkOrder.list("-created_date", 500),
        base44.entities.FleetMaintenanceTask.list("start_date", 500),
        base44.auth.me().catch(() => null),
      ]);
      setEquipment(e || []);
      setWorkOrders(w || []);
      setTasks(t || []);
      setCurrentUser(u || null);
    } catch (e) {
      setError(e?.message || "Failed to load Fleet equipment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const isAdmin = currentUser?.role === "admin";
  const metrics = useMemo(() => ({
    operational: equipment.filter(e => e.status === "operational").length,
    maintenance: equipment.filter(e => e.status === "maintenance").length,
    down: equipment.filter(e => e.status === "down").length,
    trackingIssues: equipment.filter(e => e.bouncie_link_status === "ambiguous").length,
  }), [equipment]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return equipment.filter(e => {
      if (viewFilter === "tracking_issues" && e.bouncie_link_status !== "ambiguous") return false;
      if (!["all", "tracking_issues"].includes(viewFilter) && e.status !== viewFilter) return false;
      if (!q) return true;
      return [e.name, e.make, e.model, e.serial_number, e.vin, e.license_plate, e.type, e.location].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [equipment, query, viewFilter]);

  const saveEquipment = async ({ equipment: payload, tracking_applicable }) => {
    setSaving(true);
    setError("");
    try {
      const body = dialog?.equipment
        ? { action: "update", id: dialog.equipment.id, equipment: payload, tracking_applicable }
        : { action: "create", equipment: payload, tracking_applicable };
      const { data } = await base44.functions.invoke("fleetEquipmentAction", body);
      if (data?.error) throw new Error(data.error);
      setDialog(null);
      await loadData();
    } catch (e) {
      setError(e?.message || "Failed to save Fleet equipment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Equipment</h1><p className="text-sm text-gray-500 dark:text-slate-400">Road vehicles and non-road assets. Bouncie linkage is evaluated only from exact existing VIN/IMEI evidence.</p></div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto"><div className="relative w-full sm:w-72"><Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search equipment..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div><select value={viewFilter} onChange={e => setViewFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All equipment</option><option value="operational">Operational</option><option value="maintenance">Maintenance</option><option value="down">Down</option><option value="retired">Retired</option><option value="tracking_issues">Bouncie link conflicts</option></select>{isAdmin && <button onClick={() => setDialog({ equipment: null })} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4" />New Equipment</button>}</div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><EquipmentMetric icon={Truck} label="Operational" value={metrics.operational}/><EquipmentMetric icon={Wrench} label="Maintenance" value={metrics.maintenance} attention={metrics.maintenance>0}/><EquipmentMetric icon={CircleOff} label="Down" value={metrics.down} danger={metrics.down>0}/><EquipmentMetric icon={Link2} label="Bouncie link conflicts" value={metrics.trackingIssues} attention={metrics.trackingIssues>0}/></div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(eq => {
              const active = workOrders.filter(w => w.equipment_id === eq.id && !["completed","cancelled"].includes(w.status));
              const scheduled = tasks.filter(t => t.equipment_id === eq.id);
              return (
                <div key={eq.id} className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
                  <Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(eq.id)}`} className="block h-40 bg-gray-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                    {eq.photo_url ? <img src={eq.photo_url} alt={eq.name} className="w-full h-full object-cover" /> : <Truck className="w-12 h-12 text-gray-300" />}
                  </Link>
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3"><div><Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(eq.id)}`} className="font-semibold text-gray-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-300">{eq.name}</Link><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{[eq.year, eq.make, eq.model].filter(Boolean).join(" ") || eq.type}</p></div><span className={`text-xs px-2 py-1 rounded-full ${eq.status === "operational" ? "bg-emerald-100 text-emerald-800" : eq.status === "down" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{eq.status}</span></div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-slate-300"><div><span className="text-gray-400">VIN/Serial</span><div className="truncate">{eq.vin || eq.serial_number || "—"}</div></div><div><span className="text-gray-400">Plate</span><div>{eq.license_plate || "—"}</div></div><div><span className="text-gray-400">Open WOs</span><div className="font-semibold">{active.length}</div></div><div><span className="text-gray-400">Schedules</span><div className="font-semibold">{scheduled.length}</div></div></div>
                    <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"><span className={`inline-flex items-center gap-1 ${eq.bouncie_link_status === "matched" ? "text-emerald-700 dark:text-emerald-300" : eq.bouncie_link_status === "ambiguous" ? "text-amber-700 dark:text-amber-300" : "text-gray-500"}`}><Link2 className="w-3.5 h-3.5" />Bouncie: {eq.bouncie_link_status?.replaceAll("_", " ") || "unlinked"}</span>{active.some(w => w.priority === "critical") && <span className="text-red-600 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Critical</span>}</div>
                    <div className="pt-1 flex items-center justify-between gap-2"><Link to={`${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(eq.id)}`} className="text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1">Open detail <ArrowRight className="w-4 h-4" /></Link>{isAdmin && <button onClick={() => setDialog({ equipment: eq })} className="text-sm text-gray-600 dark:text-slate-300 inline-flex items-center gap-1"><Pencil className="w-4 h-4" />Edit</button>}</div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-12 text-center text-gray-500">No Fleet equipment found.</div>}
          </div>
        )}
      </div>

      <FleetEquipmentDialog open={!!dialog} equipment={dialog?.equipment || null} onClose={() => !saving && setDialog(null)} onSave={saveEquipment} saving={saving} />
    </div>
  );
}

function EquipmentMetric({ icon: Icon, label, value, attention = false, danger = false }) {
  const style = danger ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  const valueStyle = danger ? "text-red-700 dark:text-red-300" : attention ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-slate-100";
  return <div className={`rounded-xl border p-3 ${style}`}><div className="flex items-center justify-between gap-2"><div className="text-xs text-gray-400">{label}</div><Icon className="w-4 h-4 text-gray-400" /></div><div className={`text-2xl font-bold mt-1 ${valueStyle}`}>{value}</div></div>;
}
