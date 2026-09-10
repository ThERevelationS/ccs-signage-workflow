import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetInventoryDialog from "@/components/fleet/FleetInventoryDialog";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { Package, Search, Loader2, AlertTriangle, Plus, Pencil, PackageCheck, ShoppingCart } from "lucide-react";

export default function FleetParts() {
  const [parts, setParts] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [p,e,u] = await Promise.all([listAllFleetRows(base44.entities.FleetPart,"part_name",{label:"Fleet parts"}), listAllFleetRows(base44.entities.FleetEquipment,"name",{label:"Fleet equipment"}), base44.auth.me().catch(()=>null)]);
      setParts(p||[]); setEquipment(e||[]); setUser(u||null);
    } catch(e) { setError(e?.message || "Unable to load Fleet parts."); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{load();},[load]);

  const isAdmin=user?.role==="admin";
  const isLow=(p)=>p.enable_low_stock_alerts!==false&&p.quantity_on_hand!=null&&p.minimum_stock!=null&&Number(p.quantity_on_hand)<=Number(p.minimum_stock);
  const metrics=useMemo(()=>({low:parts.filter(isLow).length,tracked:parts.filter(p=>p.quantity_on_hand!=null).length,zero:parts.filter(p=>Number(p.quantity_on_hand??0)===0).length}),[parts]);
  const rows=useMemo(()=>{const q=search.trim().toLowerCase();return parts.filter(p=>{if(stockFilter==="low"&&!isLow(p))return false;if(stockFilter==="zero"&&Number(p.quantity_on_hand??0)!==0)return false;return !q||[p.part_name,p.part_number,p.category,p.manufacturer,p.location].some(v=>String(v||"").toLowerCase().includes(q));});},[parts,search,stockFilter]);

  const save=async(payload)=>{setSaving(true);setError("");try{const body=dialog?.item?{action:"update",item_type:"part",id:dialog.item.id,item:payload}:{action:"create",item_type:"part",item:payload};const {data}=await base44.functions.invoke("fleetInventoryAction",body);if(data?.error)throw new Error(data.error);setDialog(null);await load();}catch(e){setError(e?.message||"Unable to save Fleet part.");}finally{setSaving(false);}};

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Parts</h1><p className="text-sm text-gray-500 dark:text-slate-400">Fleet-only inventory. It does not use CCS Master Inventory.</p></div><div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto"><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parts..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div><select value={stockFilter} onChange={e=>setStockFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All stock</option><option value="low">Low stock</option><option value="zero">Zero on hand</option></select>{isAdmin&&<button onClick={()=>setDialog({item:null})} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4"/>New Part</button>}</div></div>
    <div className="grid grid-cols-3 gap-3"><StockMetric icon={Package} label="Part records" value={parts.length}/><StockMetric icon={AlertTriangle} label="Low stock" value={metrics.low} attention={metrics.low>0}/><StockMetric icon={PackageCheck} label="Tracked quantity" value={`${metrics.tracked}/${parts.length}`}/></div>
    {error&&<div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
    {loading?<div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div>:<div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Part</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">On Hand</th><th className="px-4 py-3">Minimum</th><th className="px-4 py-3">Unit Cost</th><th className="px-4 py-3">Location</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-800">{rows.map(p=>{const low=isLow(p);const equipmentId=p.compatible_equipment_ids?.length===1?p.compatible_equipment_ids[0]:"";const requestUrl=`${createPageUrl("FleetRequests")}?new=1&type=part&inventoryItem=${encodeURIComponent(p.id)}&name=${encodeURIComponent(p.part_name||"")}&partNumber=${encodeURIComponent(p.part_number||"")}&brand=${encodeURIComponent(p.manufacturer||"")}${equipmentId?`&equipment=${encodeURIComponent(equipmentId)}`:""}&reason=${encodeURIComponent(low?"Reorder Fleet stock at or below minimum level.":"Fleet inventory replenishment request.")}`;return <tr key={p.id}><td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-slate-100 flex items-center gap-2"><Package className="w-4 h-4 text-indigo-500"/>{p.part_name}</div><div className="text-xs text-gray-500 mt-1">{p.part_number||"No part number"}{p.manufacturer?` · ${p.manufacturer}`:""}</div><div className="text-xs text-gray-400 mt-1">{p.compatible_equipment_ids?.length?`${p.compatible_equipment_ids.length} compatible asset(s)`:"All equipment"}</div></td><td className="px-4 py-3">{p.category||"—"}</td><td className="px-4 py-3 font-semibold"><span className={low?"text-red-600":""}>{p.quantity_on_hand??"—"}</span>{low&&<AlertTriangle className="inline w-4 h-4 ml-1 text-red-500"/>}</td><td className="px-4 py-3">{p.minimum_stock??"—"}</td><td className="px-4 py-3">{p.unit_cost!=null?`$${Number(p.unit_cost).toFixed(2)}`:"—"}</td><td className="px-4 py-3">{p.location||"—"}</td><td className="px-4 py-3 text-right"><div className="inline-flex items-center gap-3"><Link to={requestUrl} className={`inline-flex items-center gap-1 ${low?"text-amber-700 dark:text-amber-300":"text-gray-600 dark:text-slate-300"}`}><ShoppingCart className="w-4 h-4"/>{low?"Reorder":"Request"}</Link>{isAdmin&&<button onClick={()=>setDialog({item:p})} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><Pencil className="w-4 h-4"/>Edit</button>}</div></td></tr>})}{rows.length===0&&<tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No parts found.</td></tr>}</tbody></table></div></div>}
  </div><FleetInventoryDialog open={!!dialog} itemType="part" item={dialog?.item||null} equipment={equipment} onClose={()=>!saving&&setDialog(null)} onSave={save} saving={saving}/></div>;
}
function StockMetric({icon:Icon,label,value,attention=false}){return <div className={`rounded-xl border p-3 ${attention?"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20":"border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}><div className="flex items-center justify-between gap-2"><div className="text-xs text-gray-400">{label}</div><Icon className="w-4 h-4 text-gray-400"/></div><div className={`text-xl sm:text-2xl font-bold mt-1 ${attention?"text-amber-700 dark:text-amber-300":"text-gray-900 dark:text-slate-100"}`}>{value}</div></div>}