import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { CalendarClock, Search, Loader2 } from "lucide-react";

const pretty = (v) => String(v || "—").replaceAll("_", " ");

export default function FleetMaintenance() {
  const [tasks, setTasks] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, e] = await Promise.all([
          base44.entities.FleetMaintenanceTask.list("start_date", 500),
          base44.entities.FleetEquipment.list("name", 500),
        ]);
        setTasks(t || []); setEquipment(e || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const names = useMemo(() => Object.fromEntries(equipment.map(e => [e.id, e.name])), [equipment]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => !q || [t.title, t.description, t.assigned_to, names[t.equipment_id], t.frequency].some(v => String(v || "").toLowerCase().includes(q)));
  }, [tasks, search, names]);

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Maintenance Schedules</h1><p className="text-sm text-gray-500 dark:text-slate-400">Migrated schedules are visible; CCS generation remains disabled during validation.</p></div>
          <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search maintenance..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div>
        </div>

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : (
          <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Task</th><th className="px-4 py-3">Equipment</th><th className="px-4 py-3">Frequency</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {rows.map(t => <tr key={t.id} className="align-top"><td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-slate-100 flex gap-2"><CalendarClock className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />{t.title}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-md">{t.description || "—"}</div></td><td className="px-4 py-3">{names[t.equipment_id] || "Unresolved"}</td><td className="px-4 py-3 capitalize">{pretty(t.frequency)}{t.frequency === "custom" && t.custom_frequency_value ? ` (${t.custom_frequency_value} ${t.custom_frequency_unit || ""})` : ""}</td><td className="px-4 py-3 whitespace-nowrap">{t.start_date || "—"}</td><td className="px-4 py-3 capitalize">{pretty(t.priority)}</td><td className="px-4 py-3">{t.assigned_to || "—"}</td><td className="px-4 py-3 capitalize">{pretty(t.status)}</td></tr>)}
                  {rows.length === 0 && <tr><td colSpan="7" className="px-4 py-10 text-center text-gray-500">No maintenance schedules found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
