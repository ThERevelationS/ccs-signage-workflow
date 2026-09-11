import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetInventoryDialog from "@/components/fleet/FleetInventoryDialog";
import FleetInventoryUsageDialog from "@/components/fleet/FleetInventoryUsageDialog";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { isFluidLowStock } from "@/components/fleet/fleetHelpers";
import { Droplets, Search, Loader2, AlertTriangle, Plus, Pencil, PackageCheck, ShoppingCart, PackageMinus } from "lucide-react";

export default function FleetFluids() {
  const [fluids, setFluids] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [usageItem, setUsageItem] = useState(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [f,e,u] = await Promise.all([listAllFleetRows(base44.entities.FleetFluid,"fluid_name",{label:"Fleet fluids"}), listAllFleetRows(base44.entities.FleetEquipment,"name",{label:"Fleet equipment"}), base44.auth.me().catch(()=>null)]);
      setFluids(f||[]); setEquipment(e||[]); setUser(u||null);
    } catch(e) { setError(e?.message || "Unable to load Fleet fluids."); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);const requested=params.get("stock")||"";const requestedSearch=params.get("search")||"";if(["all","low","incomplete"].includes(requested))setStockFilter(requested);if(requestedSearch)setSearch(requestedSearch);},[]);

  const isAdmin=user?.role==="admin";
  const metrics=useMemo(()=>({low:fluids.filter(isFluidLowStock).length,tracked:fluids.filter(f=>f.quantity!=null&&f.unit).length,incomplete:fluids.filter(f=>f.quantity==null||!f.unit).length}),[fluids]);
  const rows=useMemo(()=>{const q=search.trim().toLowerCase();return fluids.filter(f=>{if(stockFilter==="low"&&!isFluidLowStock(f))return false;if(stockFilter==="incomplete"&&f.quantity!=null&&f.unit)return false;return !q||[f.fluid_name,f.fluid_type,f.brand,f.viscosity,f.location].some(v=>String(v||"").toLowerCase().includes(q));});},[fluids,search,stockFilter]);

  const save=async(payload)=>{setSaving(true);setError("");try{const body=dialog?.item?{action:"update",item_type:"fluid",id:dialog.item.id,expected_updated_date:dialog.item.updated_date||"",item:payload}:{action:"create",item_type:"fluid",creation_key:dialog?.createKey||"",item:payload};const {data}=await base44.functions.invoke("fleetInventoryAction",body);if(data?.error)throw new Error(data.error);setDialog(null);await load();}catch(e){setError(e?.message||"Unable to save Fleet fluid.");}finally{setSaving(false);}};
  const recordUsage=async(payload)=>{if(!usageItem)return;setUsageBusy(true);setUsageError("");try{const {data}=await base44.functions.invoke("fleetInventoryAction",{action:"record_usage",item_type:"fluid",id:usageItem.id,...payload});if(data?.error)throw new Error(data.error);await load();setUsageItem(null);}catch(e){setUsageError(e?.message||"Unable to record Fleet fluid usage.");}finally{setUsageBusy(false);}};

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Fluids</h1><p className="text-sm text-gray-500 dark:text-slate-400">Fleet-only fluid inventory with unit-aware low-stock thresholds. It never writes to signage inventory.</p></div><div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto"><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search fluids..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div><select value={stockFilter} onChange={e=>setStockFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All stock</option><option value="low">Low stock</option><option value="incomplete">Incomplete stock data</option></select>{isAdmin&&<button onClick={()=>setDialog({item:null,createKey:crypto.randomUUID()})} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4"/>New Fluid</button>}</div></div>
    <div className="grid grid-cols-3 gap-3"><StockMetric icon={Droplets} label="Fluid records" value={fluids.length}/><StockMetric icon={AlertTriangle} label="Low stock" value={metrics.low} attention={metrics.low>0}/><StockMetric icon={PackageCheck} label="Tracked quantity" value={`${metrics.tracked}/${fluids.length}`}/></div>
    {metrics.incomplete>0&&<div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">{metrics.incomplete} historical fluid record{metrics.incomplete===1?" is":"s are"} missing a stock quantity or unit. Low-stock evaluation fails closed for those records until the missing data is filled in.</div>}
    {error&&<div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
    {loading?<div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div>:<div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Fluid</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Minimum</th><th className="px-4 py-3">Cost / Unit</th><th className="px-4 py-3">Location</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-800">{rows.map(f=>{const low=isFluidLowStock(f);const equipmentId=f.compatible_equipment_ids?.length===1?f.compatible_equipment_ids[0]:"";const requestUrl=`${createPageUrl("FleetRequests")}?new=1&type=fluid&inventoryItem=${encodeURIComponent(f.id)}&name=${encodeURIComponent(f.fluid_name||"")}&brand=${encodeURIComponent(f.brand||"")}${equipmentId?`&equipment=${encodeURIComponent(equipmentId)}`:""}&reason=${encodeURIComponent(low?"Reorder Fleet fluid at or below minimum level.":"Fleet fluid replenishment request.")}`;return <tr key={f.id}><td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-slate-100 flex items-center gap-2"><Droplets className="w-4 h-4 text-blue-500"/>{f.fluid_name}</div><div className="text-xs text-gray-500 mt-1">{[f.brand,f.viscosity].filter(Boolean).join(" · ")||"—"}</div><div className="text-xs text-gray-400 mt-1">{f.compatible_equipment_ids?.length?`${f.compatible_equipment_ids.length} compatible asset(s)`:"All equipment"}</div></td><td className="px-4 py-3">{f.fluid_type||<span className="text-amber-600">Legacy blank</span>}</td><td className="px-4 py-3 font-semibold"><span className={low?"text-red-600":""}>{f.quantity??"—"} {f.unit||""}</span>{low&&<AlertTriangle className="inline w-4 h-4 ml-1 text-red-500"/>}</td><td className="px-4 py-3">{f.minimum_stock??"—"} {f.minimum_stock_unit||f.unit||""}</td><td className="px-4 py-3">{f.cost_per_unit!=null?`$${Number(f.cost_per_unit).toFixed(2)}`:"—"}</td><td className="px-4 py-3">{f.location||"—"}</td><td className="px-4 py-3 text-right"><div className="inline-flex items-center gap-3"><Link to={requestUrl} className={`inline-flex items-center gap-1 ${low?"text-amber-700 dark:text-amber-300":"text-gray-600 dark:text-slate-300"}`}><ShoppingCart className="w-4 h-4"/>{low?"Reorder":"Request"}</Link>{isAdmin&&<button onClick={()=>{setUsageItem(f);setUsageError("");}} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><PackageMinus className="w-4 h-4"/>Use</button>}{isAdmin&&<button onClick={()=>setDialog({item:f})} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300"><Pencil className="w-4 h-4"/>Edit</button>}</div></td></tr>})}{rows.length===0&&<tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No fluids found.</td></tr>}</tbody></table></div></div>}
  </div><FleetInventoryDialog open={!!dialog} itemType="fluid" item={dialog?.item||null} equipment={equipment} onClose={()=>!saving&&setDialog(null)} onSave={save} saving={saving}/><FleetInventoryUsageDialog open={!!usageItem} item={usageItem} itemType="fluid" equipment={equipment} busy={usageBusy} error={usageError} onClose={()=>{if(!usageBusy){setUsageItem(null);setUsageError("");}}} onConfirm={recordUsage}/></div>;
}
function StockMetric({icon:Icon,label,value,attention=false}){return <div className={`rounded-xl border p-3 ${attention?"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20":"border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}><div className="flex items-center justify-between gap-2"><div className="text-xs text-gray-400">{label}</div><Icon className="w-4 h-4 text-gray-400"/></div><div className={`text-xl sm:text-2xl font-bold mt-1 ${attention?"text-amber-700 dark:text-amber-300":"text-gray-900 dark:text-slate-100"}`}>{value}</div></div>}