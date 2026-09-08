import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { ShoppingCart, Search, Loader2, ExternalLink, ShieldCheck } from "lucide-react";

export default function FleetRequests() {
  const [requests, setRequests] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { try { const [r,e]=await Promise.all([base44.entities.FleetPartFluidRequest.list("-created_date",500),base44.entities.FleetEquipment.list("name",500)]); setRequests(r||[]); setEquipment(e||[]); } finally { setLoading(false); } })(); }, []);
  const names=useMemo(()=>Object.fromEntries(equipment.map(e=>[e.id,e.name])),[equipment]);
  const rows=useMemo(()=>{const q=search.trim().toLowerCase(); return requests.filter(r => (status==="all"||r.status===status) && (!q || [r.item_name,r.part_number,r.manufacturer_brand,r.requested_by_person,r.justification,names[r.equipment_id]].some(v=>String(v||"").toLowerCase().includes(q))));},[requests,search,status,names]);

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
    <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Requests</h1><p className="text-sm text-gray-500 dark:text-slate-400">Parts/fluids requests are Fleet-only. Migrated received records are protected from being received twice.</p></div>
    <div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search requests..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div><select value={status} onChange={e=>setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All statuses</option><option value="pending">Pending</option><option value="ordered">Ordered</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select></div>
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : <div className="space-y-3">{rows.map(r=><div key={r.id} className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm"><div className="flex items-start gap-3"><ShoppingCart className="w-5 h-5 mt-0.5 text-indigo-500 shrink-0"/><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-gray-900 dark:text-slate-100">{r.item_name}</h2><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 capitalize">{r.status}</span>{r.receipt_applied_at&&<span className="text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5"/>receipt applied</span>}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{r.item_type} · qty {r.quantity_needed} · {names[r.equipment_id] || "No equipment"}</div><div className="grid sm:grid-cols-3 gap-3 mt-3 text-sm"><Info label="Requested by" value={r.requested_by_person||r.requester_email||"—"}/><Info label="Brand / Part #" value={[r.manufacturer_brand,r.part_number].filter(Boolean).join(" · ")||"—"}/><Info label="Est. delivery" value={r.estimated_delivery_date||"—"}/></div>{r.justification&&<div className="mt-3 text-sm text-gray-600 dark:text-slate-300 whitespace-pre-wrap">{r.justification}</div>}{r.vendor_link&&<a href={r.vendor_link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-300">Vendor link <ExternalLink className="w-3.5 h-3.5"/></a>}</div></div></div>)}{rows.length===0&&<div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-12 text-center text-gray-500">No requests found.</div>}</div>}
  </div></div>;
}
function Info({label,value}){return <div><div className="text-xs text-gray-400">{label}</div><div className="text-gray-800 dark:text-slate-200 mt-0.5">{value}</div></div>}
