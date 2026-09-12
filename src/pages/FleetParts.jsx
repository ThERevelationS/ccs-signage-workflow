import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetInventoryDialog from "@/components/fleet/FleetInventoryDialog";
import FleetInventoryUsageDialog from "@/components/fleet/FleetInventoryUsageDialog";
import FleetPartLookupDialog from "@/components/fleet/FleetPartLookupDialog";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import {
  AlertTriangle,
  Boxes,
  Camera,
  CheckCircle2,
  Grid2X2,
  Image as ImageIcon,
  List,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  PackageMinus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Tags,
  Truck,
  WandSparkles,
} from "lucide-react";

const completeness = part => {
  const checks = [
    !!part.part_name,
    !!part.category,
    !!(part.part_number || part.barcode_value),
    !!part.manufacturer,
    !!(part.primary_photo_url || part.photo_urls?.length),
    !!(part.storage_bin || part.storage_shelf || part.location),
    !!part.compatible_equipment_ids?.length,
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
};

const locationText = part => [part.storage_zone, part.storage_cabinet, part.storage_shelf, part.storage_bin].filter(Boolean).join(" · ") || part.location || "Unlocated";
const identityTone = status => status === "verified" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : status === "review_needed" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300";

export default function FleetParts() {
  const [parts, setParts] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [identifications, setIdentifications] = useState([]);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState("all");
  const [viewMode, setViewMode] = useState("cards");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [lookup, setLookup] = useState(null);
  const [saving, setSaving] = useState(false);
  const [usageItem, setUsageItem] = useState(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [p,e,i,u] = await Promise.all([
        listAllFleetRows(base44.entities.FleetPart,"part_name",{label:"Fleet parts"}),
        listAllFleetRows(base44.entities.FleetEquipment,"name",{label:"Fleet equipment"}),
        listAllFleetRows(base44.entities.FleetPartIdentification,"-created_date",{label:"Fleet part identification inbox"}).catch(() => []),
        base44.auth.me().catch(()=>null),
      ]);
      setParts(p||[]); setEquipment(e||[]); setIdentifications(i||[]); setUser(u||null);
    } catch(e) { setError(e?.message || "Unable to load Fleet parts."); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const stock=params.get("stock")||"";
    const requestedSearch=params.get("search")||"";
    const requestedQueue=params.get("queue")||"";
    if(stock==="low")setQueue("low"); else if(stock==="zero")setQueue("zero");
    if(["all","low","zero","review","unassigned","unlocated","incomplete"].includes(requestedQueue))setQueue(requestedQueue);
    if(requestedSearch)setSearch(requestedSearch);
    if(params.get("identify")==="1")setLookup({organizeMode:false});
    if(params.get("organize")==="1")setLookup({organizeMode:true});
  },[]);

  const isAdmin=user?.role==="admin";
  const equipmentNames=useMemo(()=>Object.fromEntries(equipment.map(item=>[item.id,item.name])),[equipment]);
  const isLow=p=>p.enable_low_stock_alerts!==false&&p.quantity_on_hand!=null&&p.minimum_stock!=null&&Number(p.quantity_on_hand)<=Number(p.minimum_stock);
  const openInbox=useMemo(()=>identifications.filter(row=>!["promoted","matched_existing","dismissed"].includes(row.status)),[identifications]);
  const metrics=useMemo(()=>({
    low:parts.filter(isLow).length,
    zero:parts.filter(p=>Number(p.quantity_on_hand??0)===0).length,
    verified:parts.filter(p=>p.identity_status==="verified").length,
    review:parts.filter(p=>p.identity_status==="review_needed"||p.identity_status==="unverified"||!p.identity_status).length,
    unassigned:parts.filter(p=>!p.compatible_equipment_ids?.length).length,
    unlocated:parts.filter(p=>!p.storage_bin&&!p.storage_shelf&&!p.location).length,
    incomplete:parts.filter(p=>completeness(p)<70).length,
    inbox:openInbox.length,
    value:parts.reduce((sum,p)=>sum+(Number(p.quantity_on_hand||0)*Number(p.unit_cost||0)),0),
  }),[parts,openInbox]);

  const rows=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return parts.filter(p=>{
      if(queue==="low"&&!isLow(p))return false;
      if(queue==="zero"&&Number(p.quantity_on_hand??0)!==0)return false;
      if(queue==="review"&&!(p.identity_status==="review_needed"||p.identity_status==="unverified"||!p.identity_status))return false;
      if(queue==="unassigned"&&p.compatible_equipment_ids?.length)return false;
      if(queue==="unlocated"&&(p.storage_bin||p.storage_shelf||p.location))return false;
      if(queue==="incomplete"&&completeness(p)>=70)return false;
      return !q||[
        p.part_name,p.part_number,p.barcode_value,p.category,p.subcategory,p.manufacturer,p.location,p.storage_zone,p.storage_cabinet,p.storage_shelf,p.storage_bin,p.preferred_vendor,p.vendor_sku,...(p.alternate_part_numbers||[]),...(p.tags||[])
      ].some(v=>String(v||"").toLowerCase().includes(q));
    });
  },[parts,search,queue]);

  const save=async(payload)=>{setSaving(true);setError("");try{const body=dialog?.item?{action:"update",item_type:"part",id:dialog.item.id,expected_updated_date:dialog.item.updated_date||"",item:payload}:{action:"create",item_type:"part",creation_key:dialog?.createKey||"",item:payload};const {data}=await base44.functions.invoke("fleetInventoryAction",body);if(data?.error)throw new Error(data.error);setDialog(null);await load();}catch(e){setError(e?.message||"Unable to save Fleet part.");}finally{setSaving(false);}};
  const recordUsage=async(payload)=>{if(!usageItem)return;setUsageBusy(true);setUsageError("");try{const {data}=await base44.functions.invoke("fleetInventoryAction",{action:"record_usage",item_type:"part",id:usageItem.id,...payload});if(data?.error)throw new Error(data.error);await load();setUsageItem(null);}catch(e){setUsageError(e?.message||"Unable to record Fleet part usage.");}finally{setUsageBusy(false);}};

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
      <div><div className="flex items-center gap-2"><Package className="w-6 h-6 text-indigo-600"/><h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100">Fleet Parts Command Center</h1></div><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Identify the pile, organize the shelves, connect parts to equipment, then keep stock useful. Fleet-only—never CCS Master Inventory.</p></div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={()=>setLookup({organizeMode:false})} className="min-h-11 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2"><WandSparkles className="w-4 h-4"/>Identify a Part</button>
        <button onClick={()=>setLookup({organizeMode:true})} className="min-h-11 px-4 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200 font-semibold inline-flex items-center justify-center gap-2"><Camera className="w-4 h-4"/>Organize Parts</button>
        {isAdmin&&<button onClick={()=>setDialog({item:null,createKey:crypto.randomUUID()})} className="min-h-11 px-4 py-2 rounded-xl border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700 font-semibold inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4"/>Manual Add</button>}
      </div>
    </div>

    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 sm:p-5 dark:border-indigo-900 dark:from-indigo-950/30 dark:to-slate-900">
      <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-5 items-center"><div><div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300"><Sparkles className="w-4 h-4"/>Parts-room cleanup workflow</div><h2 className="mt-2 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100">Photo → identify → verify → assign → bin → next part.</h2><p className="mt-2 text-sm text-gray-600 dark:text-slate-300 max-w-3xl">Use your phone while standing in the parts room. Uncertain AI results stay in the review inbox instead of polluting the clean inventory catalog.</p></div><div className="grid grid-cols-2 gap-2"><HeroStat label="Review inbox" value={metrics.inbox} attention={metrics.inbox>0}/><HeroStat label="Needs cleanup" value={metrics.incomplete} attention={metrics.incomplete>0}/><HeroStat label="Assigned" value={`${parts.length-metrics.unassigned}/${parts.length}`}/><HeroStat label="Located" value={`${parts.length-metrics.unlocated}/${parts.length}`}/></div></div>
    </section>

    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
      <QueueCard icon={Package} label="All Parts" value={parts.length} active={queue==="all"} onClick={()=>setQueue("all")}/>
      <QueueCard icon={AlertTriangle} label="Low Stock" value={metrics.low} attention active={queue==="low"} onClick={()=>setQueue("low")}/>
      <QueueCard icon={PackageMinus} label="Zero Stock" value={metrics.zero} attention active={queue==="zero"} onClick={()=>setQueue("zero")}/>
      <QueueCard icon={Sparkles} label="Identity Review" value={metrics.review} attention={metrics.review>0} active={queue==="review"} onClick={()=>setQueue("review")}/>
      <QueueCard icon={Truck} label="Unassigned" value={metrics.unassigned} attention={metrics.unassigned>0} active={queue==="unassigned"} onClick={()=>setQueue("unassigned")}/>
      <QueueCard icon={MapPin} label="Unlocated" value={metrics.unlocated} attention={metrics.unlocated>0} active={queue==="unlocated"} onClick={()=>setQueue("unlocated")}/>
      <QueueCard icon={Tags} label="Incomplete" value={metrics.incomplete} attention={metrics.incomplete>0} active={queue==="incomplete"} onClick={()=>setQueue("incomplete")}/>
      <QueueCard icon={CheckCircle2} label="Verified" value={metrics.verified}/>
    </div>

    {openInbox.length>0&&<section className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20 overflow-hidden"><div className="px-4 py-3 border-b border-amber-200/70 dark:border-amber-900 flex items-center justify-between gap-3"><div><h2 className="font-bold text-amber-900 dark:text-amber-100">Identification Review Inbox</h2><p className="text-xs text-amber-800 dark:text-amber-300 mt-1">Scans stay here until they are matched, verified and promoted, or dismissed.</p></div><span className="text-sm font-bold text-amber-800 dark:text-amber-200">{openInbox.length}</span></div><div className="p-3 grid md:grid-cols-2 xl:grid-cols-3 gap-2">{openInbox.slice(0,9).map(row=><InboxCard key={row.id} row={row} parts={parts}/>)}</div></section>}

    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
      <div className="relative w-full lg:max-w-xl"><Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, number, barcode, manufacturer, bin, vendor..." className="w-full min-h-11 pl-9 pr-3 rounded-xl border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"/></div>
      <div className="flex items-center gap-2"><div className="text-xs text-gray-500 dark:text-slate-400 mr-2">Showing {rows.length} of {parts.length}</div><button onClick={()=>setViewMode("cards")} className={`min-h-11 px-3 rounded-lg border inline-flex items-center gap-1 ${viewMode==="cards"?"bg-indigo-600 text-white border-indigo-600":"border-gray-300 dark:border-slate-700"}`}><Grid2X2 className="w-4 h-4"/>Cards</button><button onClick={()=>setViewMode("table")} className={`min-h-11 px-3 rounded-lg border inline-flex items-center gap-1 ${viewMode==="table"?"bg-indigo-600 text-white border-indigo-600":"border-gray-300 dark:border-slate-700"}`}><List className="w-4 h-4"/>Table</button></div>
    </div>

    {error&&<div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
    {loading?<div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div>:viewMode==="cards"?<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{rows.map(part=><PartCard key={part.id} part={part} equipmentNames={equipmentNames} low={isLow(part)} isAdmin={isAdmin} onUse={()=>{setUsageItem(part);setUsageError("");}} onEdit={()=>setDialog({item:part})}/>) }{rows.length===0&&<EmptyState/>}</div>:<PartTable rows={rows} equipmentNames={equipmentNames} isLow={isLow} isAdmin={isAdmin} onUse={part=>{setUsageItem(part);setUsageError("");}} onEdit={part=>setDialog({item:part})}/>} 

    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:bg-slate-900 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="text-xs uppercase font-semibold text-gray-400">Inventory value</div><div className="text-2xl font-bold text-gray-900 dark:text-slate-100">${metrics.value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div><div className="text-xs text-gray-500 dark:text-slate-400">Based only on current Fleet quantity × stored unit cost. Missing costs are treated as $0.</div></div>
  </div>

  <FleetPartLookupDialog open={!!lookup} equipment={equipment} parts={parts} isAdmin={isAdmin} organizeMode={lookup?.organizeMode===true} initialEquipmentId={lookup?.equipmentId||""} onClose={()=>setLookup(null)} onChanged={load}/>
  <FleetInventoryDialog open={!!dialog} itemType="part" item={dialog?.item||null} equipment={equipment} onClose={()=>!saving&&setDialog(null)} onSave={save} saving={saving}/>
  <FleetInventoryUsageDialog open={!!usageItem} item={usageItem} itemType="part" equipment={equipment} busy={usageBusy} error={usageError} onClose={()=>{if(!usageBusy){setUsageItem(null);setUsageError("");}}} onConfirm={recordUsage}/>
  </div>;
}

function PartCard({part,equipmentNames,low,isAdmin,onUse,onEdit}){
  const photo=part.primary_photo_url||part.photo_urls?.[0];
  const assigned=(part.compatible_equipment_ids||[]).map(id=>equipmentNames[id]).filter(Boolean);
  const requestUrl=`${createPageUrl("FleetRequests")}?new=1&type=part&inventoryItem=${encodeURIComponent(part.id)}&name=${encodeURIComponent(part.part_name||"")}&partNumber=${encodeURIComponent(part.part_number||"")}&brand=${encodeURIComponent(part.manufacturer||"")}&reason=${encodeURIComponent(low?"Reorder Fleet stock at or below minimum level.":"Fleet inventory replenishment request.")}`;
  return <article className={`rounded-2xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${low?"border-amber-300 dark:border-amber-900":"border-gray-200 dark:border-slate-800"}`}><div className="h-40 bg-gray-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">{photo?<img src={photo} alt={part.part_name} className="w-full h-full object-cover"/>:<Package className="w-12 h-12 text-gray-300"/>}</div><div className="p-4 space-y-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-bold text-gray-900 dark:text-slate-100 line-clamp-1">{part.part_name}</div><div className="text-xs text-gray-500 mt-1 truncate">{part.manufacturer||"Unknown manufacturer"}{part.part_number?` · ${part.part_number}`:""}</div></div><span className={`text-[10px] rounded-full px-2 py-1 font-bold capitalize ${identityTone(part.identity_status)}`}>{part.identity_status||"legacy"}</span></div><div className="grid grid-cols-3 gap-2"><Mini label="On hand" value={part.quantity_on_hand??0} attention={low}/><Mini label="Fitment" value={assigned.length||"—"}/><Mini label="Complete" value={`${completeness(part)}%`} attention={completeness(part)<70}/></div><div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 space-y-1"><div className="text-[10px] uppercase font-bold text-gray-400">Physical location</div><div className={`text-sm font-semibold ${locationText(part)==="Unlocated"?"text-amber-700 dark:text-amber-300":"text-gray-800 dark:text-slate-200"}`}>{locationText(part)}</div></div><div className="flex flex-wrap gap-1.5">{assigned.slice(0,3).map(name=><span key={name} className="text-[10px] rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 px-2 py-1">{name}</span>)}{assigned.length>3&&<span className="text-[10px] px-2 py-1 text-gray-500">+{assigned.length-3} more</span>}{!assigned.length&&<span className="text-[10px] rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 px-2 py-1">Needs equipment assignment</span>}</div>{part.description&&<p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">{part.description}</p>}<div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex flex-wrap gap-2"><Link to={requestUrl} className="min-h-9 px-3 rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center gap-1 text-xs font-semibold"><ShoppingCart className="w-3.5 h-3.5"/>{low?"Reorder":"Request"}</Link>{isAdmin&&<button onClick={onUse} className="min-h-9 px-3 rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center gap-1 text-xs font-semibold"><PackageMinus className="w-3.5 h-3.5"/>Use</button>}{isAdmin&&<button onClick={onEdit} className="min-h-9 px-3 rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center gap-1 text-xs font-semibold"><Pencil className="w-3.5 h-3.5"/>Edit</button>}</div></div></article>;
}

function PartTable({rows,equipmentNames,isLow,isAdmin,onUse,onEdit}){return <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left bg-gray-50 dark:bg-slate-800/70"><th className="px-4 py-3">Part</th><th className="px-4 py-3">Identity</th><th className="px-4 py-3">On Hand</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Equipment</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-800">{rows.map(part=>{const low=isLow(part);const assigned=(part.compatible_equipment_ids||[]).map(id=>equipmentNames[id]).filter(Boolean);return <tr key={part.id}><td className="px-4 py-3"><div className="font-semibold text-gray-900 dark:text-slate-100">{part.part_name}</div><div className="text-xs text-gray-500 mt-1">{part.manufacturer||"—"} · {part.part_number||"No part #"}</div></td><td className="px-4 py-3"><span className={`text-[10px] rounded-full px-2 py-1 font-bold capitalize ${identityTone(part.identity_status)}`}>{part.identity_status||"legacy"}</span><div className="text-[10px] text-gray-400 mt-1">{completeness(part)}% complete</div></td><td className={`px-4 py-3 font-bold ${low?"text-red-600":""}`}>{part.quantity_on_hand??0}{low&&<AlertTriangle className="inline w-4 h-4 ml-1"/>}</td><td className="px-4 py-3 text-xs">{locationText(part)}</td><td className="px-4 py-3 text-xs">{assigned.length?assigned.slice(0,2).join(", ")+(assigned.length>2?` +${assigned.length-2}`:""):"Unassigned"}</td><td className="px-4 py-3 text-right"><div className="inline-flex gap-3">{isAdmin&&<button onClick={()=>onUse(part)} className="text-indigo-600 dark:text-indigo-300">Use</button>}{isAdmin&&<button onClick={()=>onEdit(part)} className="text-indigo-600 dark:text-indigo-300">Edit</button>}</div></td></tr>})}{rows.length===0&&<tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No parts match this queue.</td></tr>}</tbody></table></div></div>}

function InboxCard({row,parts}){const duplicates=(row.duplicate_part_ids||[]).map(id=>parts.find(part=>part.id===id)).filter(Boolean);return <div className="rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-900"><div className="flex gap-3"><div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">{row.uploaded_photo_urls?.[0]?<img src={row.uploaded_photo_urls[0]} alt="Candidate" className="w-full h-full object-cover"/>:<ImageIcon className="w-5 h-5 text-gray-300"/>}</div><div className="min-w-0"><div className="font-semibold text-gray-900 dark:text-slate-100 truncate">{row.candidate_part_name||row.query_text||"Unidentified part"}</div><div className="text-xs text-gray-500 mt-1 truncate">{row.candidate_manufacturer||"—"}{row.candidate_part_number?` · ${row.candidate_part_number}`:""}</div><div className="mt-1 flex gap-1"><span className={`text-[10px] rounded-full px-2 py-0.5 ${confidenceStyle(row.confidence)}`}>{row.confidence||"unknown"}</span>{duplicates.length>0&&<span className="text-[10px] rounded-full bg-red-100 text-red-700 px-2 py-0.5">{duplicates.length} duplicate?</span>}</div></div></div></div>}
function confidenceStyle(value){return value==="high"?"bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300":value==="medium"?"bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300":"bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300"}
function QueueCard({icon:Icon,label,value,attention=false,active=false,onClick}){const C=onClick?"button":"div";return <C type={onClick?"button":undefined} onClick={onClick} className={`rounded-xl border p-3 text-left ${active?"border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30":attention?"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20":"border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-gray-500 dark:text-slate-400">{label}</span><Icon className="w-4 h-4 text-gray-400"/></div><div className={`text-2xl font-bold mt-1 ${attention?"text-amber-700 dark:text-amber-300":"text-gray-900 dark:text-slate-100"}`}>{value}</div></C>}
function HeroStat({label,value,attention=false}){return <div className="rounded-xl border border-white/80 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70"><div className="text-[10px] uppercase font-bold tracking-wide text-gray-400">{label}</div><div className={`text-xl font-bold mt-1 ${attention?"text-amber-700 dark:text-amber-300":"text-gray-900 dark:text-slate-100"}`}>{value}</div></div>}
function Mini({label,value,attention=false}){return <div className="rounded-lg bg-gray-50 dark:bg-slate-800/60 p-2 text-center"><div className={`font-bold ${attention?"text-amber-700 dark:text-amber-300":"text-gray-900 dark:text-slate-100"}`}>{value}</div><div className="text-[9px] text-gray-400 mt-0.5">{label}</div></div>}
function EmptyState(){return <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center dark:bg-slate-900 dark:border-slate-700"><Boxes className="w-10 h-10 mx-auto text-gray-300"/><div className="mt-3 font-semibold text-gray-700 dark:text-slate-200">Nothing in this queue</div><div className="text-xs text-gray-400 mt-1">That is a good thing—or change the filter/search.</div></div>}
