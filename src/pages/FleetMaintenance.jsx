import { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetMaintenanceDialog from "@/components/fleet/FleetMaintenanceDialog";
import { CalendarClock, Search, Loader2, Plus, Pencil, ShieldCheck } from "lucide-react";

const pretty = (v) => String(v || "—").replaceAll("_", " ");

export default function FleetMaintenance() {
  const [tasks, setTasks] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [t, e, u] = await Promise.all([
        base44.entities.FleetMaintenanceTask.list("start_date", 500),
        base44.entities.FleetEquipment.list("name", 500),
        base44.auth.me().catch(() => null),
      ]);
      setTasks(t || []);
      setEquipment(e || []);
      setCurrentUser(u || null);
    } catch (e) {
      setError(e?.message || "Unable to load Fleet maintenance schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const isAdmin = currentUser?.role === "admin";
  const names = useMemo(() => Object.fromEntries(equipment.map(e => [e.id, e.name])), [equipment]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => !q || [t.title, t.description, t.assigned_to, names[t.equipment_id], t.frequency, t.status].some(v => String(v || "").toLowerCase().includes(q)));
  }, [tasks, search, names]);

  const saveTask = async (payload) => {
    setSaving(true);
    setError("");
    try {
      const body = dialog?.task
        ? { action: "update", id: dialog.task.id, task: payload }
        : { action: "create", task: payload };
      const { data } = await base44.functions.invoke("fleetMaintenanceAction", body);
      if (data?.error) throw new Error(data.error);
      setDialog(null);
      await loadData();
    } catch (e) {
      setError(e?.message || "Unable to save Fleet maintenance schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Maintenance Schedules</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">Create and maintain Fleet schedules. CCS automatic work-order generation remains disabled until cutover.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search maintenance..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div>
            {isAdmin && <button onClick={() => setDialog({ task: null })} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4" />New Schedule</button>}
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span><strong>Cutover guard active:</strong> the CCS due-maintenance generator exists only as a dormant server function. There is no scheduled workflow and no execute button on this page, so FleetMaster remains the only live generator.</span>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : (
          <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Task</th><th className="px-4 py-3">Equipment</th><th className="px-4 py-3">Frequency</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned</th><th className="px-4 py-3">Status</th>{isAdmin && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {rows.map(t => <tr key={t.id} className="align-top"><td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-slate-100 flex gap-2"><CalendarClock className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />{t.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-md">{t.description || "—"}</div>{(t.parts_needed?.length || t.fluids_needed?.length) ? <div className="text-xs text-gray-400 mt-1">{t.parts_needed?.length || 0} planned part item(s) · {t.fluids_needed?.length || 0} planned fluid item(s)</div> : null}</td><td className="px-4 py-3">{names[t.equipment_id] || "Unresolved"}</td><td className="px-4 py-3 capitalize">{t.type === "one_off" ? "One-time" : pretty(t.frequency)}{t.frequency === "custom" && t.custom_frequency_value ? ` (${t.custom_frequency_value} ${t.custom_frequency_unit || ""})` : ""}</td><td className="px-4 py-3 whitespace-nowrap">{t.start_date || "—"}</td><td className="px-4 py-3 capitalize">{pretty(t.priority)}</td><td className="px-4 py-3">{t.assigned_to || "—"}</td><td className="px-4 py-3 capitalize">{pretty(t.status)}</td>{isAdmin && <td className="px-4 py-3 text-right"><button onClick={() => setDialog({ task: t })} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><Pencil className="w-4 h-4" />Edit</button></td>}</tr>)}
                  {rows.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-gray-500">No maintenance schedules found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <FleetMaintenanceDialog open={!!dialog} task={dialog?.task || null} equipment={equipment} onClose={() => !saving && setDialog(null)} onSave={saveTask} saving={saving} />
    </div>
  );
}