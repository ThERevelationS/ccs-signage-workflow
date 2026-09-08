import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { Droplets, Search, Loader2, AlertTriangle } from "lucide-react";

export default function FleetFluids() {
  const [fluids, setFluids] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { try { setFluids(await base44.entities.FleetFluid.list("fluid_name", 500) || []); } finally { setLoading(false); } })(); }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fluids.filter(f => !q || [f.fluid_name,f.fluid_type,f.brand,f.viscosity,f.location].some(v => String(v || "").toLowerCase().includes(q)));
  }, [fluids, search]);

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Fluids</h1><p className="text-sm text-gray-500 dark:text-slate-400">Fleet-only fluid inventory with source units preserved.</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search fluids..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div></div>
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Fluid</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Minimum</th><th className="px-4 py-3">Cost / Unit</th><th className="px-4 py-3">Location</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-800">{rows.map(f => { const low=f.enable_low_stock_alerts!==false && f.quantity!=null && f.minimum_stock!=null && Number(f.quantity)<=Number(f.minimum_stock); return <tr key={f.id}><td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-slate-100 flex items-center gap-2"><Droplets className="w-4 h-4 text-blue-500" />{f.fluid_name}</div><div className="text-xs text-gray-500 mt-1">{[f.brand,f.viscosity].filter(Boolean).join(" · ") || "—"}</div></td><td className="px-4 py-3">{f.fluid_type || <span className="text-amber-600">Legacy blank</span>}</td><td className="px-4 py-3 font-semibold"><span className={low?"text-red-600":""}>{f.quantity ?? "—"} {f.unit || ""}</span>{low&&<AlertTriangle className="inline w-4 h-4 ml-1 text-red-500" />}</td><td className="px-4 py-3">{f.minimum_stock ?? "—"} {f.minimum_stock_unit || ""}</td><td className="px-4 py-3">{f.cost_per_unit!=null?`$${Number(f.cost_per_unit).toFixed(2)}`:"—"}</td><td className="px-4 py-3">{f.location || "—"}</td></tr>; })}{rows.length===0&&<tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">No fluids found.</td></tr>}</tbody></table></div></div>}
  </div></div>;
}
