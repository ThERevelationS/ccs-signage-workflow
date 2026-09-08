import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { Package, Search, Loader2, AlertTriangle } from "lucide-react";

export default function FleetParts() {
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { try { setParts(await base44.entities.FleetPart.list("part_name", 500) || []); } finally { setLoading(false); } })(); }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter(p => !q || [p.part_name,p.part_number,p.category,p.manufacturer,p.location].some(v => String(v || "").toLowerCase().includes(q)));
  }, [parts, search]);

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Parts</h1><p className="text-sm text-gray-500 dark:text-slate-400">Fleet-only inventory. It does not use CCS Master Inventory.</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parts..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div></div>
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Part</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">On Hand</th><th className="px-4 py-3">Minimum</th><th className="px-4 py-3">Unit Cost</th><th className="px-4 py-3">Location</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-800">{rows.map(p => { const low=p.enable_low_stock_alerts!==false && Number(p.quantity_on_hand??0)<=Number(p.minimum_stock??0); return <tr key={p.id}><td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-slate-100 flex items-center gap-2"><Package className="w-4 h-4 text-indigo-500" />{p.part_name}</div><div className="text-xs text-gray-500 mt-1">{p.part_number || "No part number"}{p.manufacturer ? ` · ${p.manufacturer}` : ""}</div></td><td className="px-4 py-3">{p.category || "—"}</td><td className="px-4 py-3 font-semibold"><span className={low?"text-red-600":""}>{p.quantity_on_hand ?? "—"}</span>{low && <AlertTriangle className="inline w-4 h-4 ml-1 text-red-500" />}</td><td className="px-4 py-3">{p.minimum_stock ?? "—"}</td><td className="px-4 py-3">{p.unit_cost!=null?`$${Number(p.unit_cost).toFixed(2)}`:"—"}</td><td className="px-4 py-3">{p.location || "—"}</td></tr>; })}{rows.length===0&&<tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">No parts found.</td></tr>}</tbody></table></div></div>}
  </div></div>;
}
