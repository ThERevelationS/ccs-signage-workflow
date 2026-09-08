import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { ClipboardList, Loader2, Search, Image as ImageIcon, ChevronDown, ChevronUp } from "lucide-react";

const pretty = (v) => String(v || "—").replaceAll("_", " ");

export default function FleetWorkOrders() {
  const [orders, setOrders] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [w, e] = await Promise.all([
          base44.entities.FleetMaintenanceWorkOrder.list("-created_date", 500),
          base44.entities.FleetEquipment.list("name", 500),
        ]);
        setOrders(w || []); setEquipment(e || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const equipmentNames = useMemo(() => Object.fromEntries(equipment.map(e => [e.id, e.name])), [equipment]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(w => {
      const active = !["completed", "cancelled"].includes(w.status);
      if (status === "active" && !active) return false;
      if (status === "completed" && w.status !== "completed") return false;
      if (status === "cancelled" && w.status !== "cancelled") return false;
      if (!q) return true;
      return [w.work_order_number, w.title, w.description, w.assigned_to, equipmentNames[w.equipment_id], w.corrective_action].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [orders, search, status, equipmentNames]);

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950">
      <FleetModuleNav />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Work Orders</h1><p className="text-sm text-gray-500 dark:text-slate-400">Fleet maintenance only. These records are separate from customer/signage WorkOrders.</p></div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search work orders..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div>
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="active">Active</option><option value="all">All</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
        </div>

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : (
          <div className="space-y-3">
            {rows.map(w => {
              const photos = [...(w.before_photos || []), ...(w.problem_photos || []), ...(w.after_photos || [])];
              const isOpen = expanded === w.id;
              return <div key={w.id} className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : w.id)} className="w-full text-left p-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/40">
                  <ClipboardList className="w-5 h-5 mt-0.5 text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-gray-900 dark:text-slate-100">{w.work_order_number}</span><span className="text-gray-600 dark:text-slate-300">{w.title}</span><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 capitalize">{pretty(w.status)}</span><span className="text-xs text-gray-500 capitalize">{pretty(w.priority)} priority</span></div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{equipmentNames[w.equipment_id] || (w.source_equipment_id ? "Unresolved equipment" : "No equipment")} · {w.assigned_to || "Unassigned"}{photos.length ? ` · ${photos.length} photo${photos.length === 1 ? "" : "s"}` : ""}</div></div>
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {isOpen && <div className="border-t border-gray-100 dark:border-slate-800 p-4 space-y-4 text-sm">
                  <div className="grid md:grid-cols-3 gap-4"><Info label="Type" value={pretty(w.type)} /><Info label="Started" value={w.started_date || "—"} /><Info label="Completed" value={w.completed_date || "—"} /><Info label="Actual hours" value={w.actual_hours ?? "—"} /><Info label="Total cost" value={w.total_cost != null ? `$${Number(w.total_cost).toFixed(2)}` : "—"} /><Info label="Projected completion" value={w.projected_completion_date || "—"} /></div>
                  {w.description && <Section title="Description" text={w.description} />}
                  {w.corrective_action && <Section title="Corrective Action" text={w.corrective_action} />}
                  {w.notes && <Section title="Notes" text={w.notes} />}
                  {(w.parts_used?.length || w.fluids_used?.length) ? <div className="grid md:grid-cols-2 gap-4"><Usage title="Parts Used" rows={(w.parts_used || []).map(p => `${p.part_name || "Part"} × ${p.quantity ?? "—"}`)} /><Usage title="Fluids Used" rows={(w.fluids_used || []).map(f => `${f.fluid_name || "Fluid"} × ${f.quantity ?? f.quantity_quarts ?? "—"} ${f.unit || ""}`)} /></div> : null}
                  {photos.length > 0 && <div><div className="font-medium text-gray-900 dark:text-slate-100 mb-2 flex items-center gap-1.5"><ImageIcon className="w-4 h-4" />Photos</div><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">{photos.map((src, i) => <a key={`${src}-${i}`} href={src} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden bg-gray-100"><img src={src} alt="Work order" className="w-full h-full object-cover" /></a>)}</div></div>}
                </div>}
              </div>;
            })}
            {rows.length === 0 && <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-12 text-center text-gray-500">No Fleet work orders found.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }) { return <div><div className="text-xs text-gray-400">{label}</div><div className="text-gray-800 dark:text-slate-200 mt-0.5 capitalize">{value}</div></div>; }
function Section({ title, text }) { return <div><div className="font-medium text-gray-900 dark:text-slate-100 mb-1">{title}</div><div className="text-gray-600 dark:text-slate-300 whitespace-pre-wrap">{text}</div></div>; }
function Usage({ title, rows }) { return <div><div className="font-medium text-gray-900 dark:text-slate-100 mb-1">{title}</div><ul className="text-gray-600 dark:text-slate-300 space-y-1">{rows.map((r,i) => <li key={i}>• {r}</li>)}</ul></div>; }
