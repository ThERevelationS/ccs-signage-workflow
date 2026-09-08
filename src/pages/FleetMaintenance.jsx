import { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetMaintenanceDialog from "@/components/fleet/FleetMaintenanceDialog";
import { CalendarClock, Search, Loader2, Plus, Pencil, ShieldCheck, AlertTriangle } from "lucide-react";

const pretty = (v) => String(v || "—").replaceAll("_", " ");

export default function FleetMaintenance() {
  const [tasks, setTasks] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
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
      setError(e?.message || "Failed to load maintenance schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const isAdmin = currentUser?.role === "admin";
  const names = useMemo(() => Object.fromEntries(equipment.map(e => [e.id, e.name])), [equipment]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      return [t.title, t.description, t.assigned_to, names[t.equipment_id], t.frequency, t.status]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [tasks, search, status, names]);

  const counts = useMemo(() => ({
    pending: tasks.filter(t => t.status === "pending").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    completed: tasks.filter(t => t.status === "completed").length,
    overdue: tasks.filter(t => t.status === "overdue").length,
  }), [tasks]);

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
      setError(e?.message || "Failed to save maintenance schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Maintenance Schedules</h1>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><ShieldCheck className="w-3.5 h-3.5" />Fleet-only</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Create and maintain Fleet schedules. Automatic CCS work-order generation remains intentionally disabled during migration validation.</p>
          </div>
          {isAdmin && <button onClick={() => setDialog({ task: null })} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium"><Plus className="w-4 h-4" />New Schedule</button>}
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>FleetMaster is still the live schedule generator. This CCS screen has no button or workflow that can execute the new generator yet.</span>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Pending" value={counts.pending} />
          <Stat label="In progress" value={counts.in_progress} />
          <Stat label="Overdue" value={counts.overdue} />
          <Stat label="Completed" value={counts.completed} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search maintenance..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div>
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All statuses</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select>
        </div>

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : (
          <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Task</th><th className="px-4 py-3">Equipment</th><th className="px-4 py-3">Frequency</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned</th><th className="px-4 py-3">Status</th>{isAdmin && <th className="px-4 py-3 w-20">Action</th>}</tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {rows.map(t => <tr key={t.id} className="align-top hover:bg-gray-50/70 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-slate-100 flex gap-2"><CalendarClock className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />{t.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-md">{t.description || "—"}</div>{(t.parts_needed?.length || t.fluids_needed?.length) ? <div className="text-xs text-gray-400 mt-1">{t.parts_needed?.length || 0} planned part{(t.parts_needed?.length || 0) === 1 ? "" : "s"} · {t.fluids_needed?.length || 0} planned fluid{(t.fluids_needed?.length || 0) === 1 ? "" : "s"}</div> : null}</td>
                    <td className="px-4 py-3">{names[t.equipment_id] || "Unresolved"}</td>
                    <td className="px-4 py-3 capitalize">{t.type === "one_off" ? "One-time" : pretty(t.frequency)}{t.frequency === "custom" && t.custom_frequency_value ? ` (${t.custom_frequency_value} ${t.custom_frequency_unit || ""})` : ""}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{t.start_date || "—"}</td>
                    <td className="px-4 py-3 capitalize">{pretty(t.priority)}</td>
                    <td className="px-4 py-3">{t.assigned_to || "—"}</td>
                    <td className="px-4 py-3 capitalize">{pretty(t.status)}</td>
                    {isAdmin && <td className="px-4 py-3"><button onClick={() => setDialog({ task: t })} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300 hover:underline"><Pencil className="w-3.5 h-3.5" />Edit</button></td>}
                  </tr>)}
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

function Stat({ label, value }) { return <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4"><div className="text-xs text-gray-400">{label}</div><div className="text-2xl font-bold text-gray-900 dark:text-slate-100 mt-1">{value}</div></div>; }
