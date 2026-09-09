import { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetRequestDialog from "@/components/fleet/FleetRequestDialog";
import FleetConfirmDialog from "@/components/fleet/FleetConfirmDialog";
import { ShoppingCart, Search, Loader2, ExternalLink, ShieldCheck, Plus, Pencil, PackageCheck, Truck, XCircle } from "lucide-react";

export default function FleetRequests() {
  const [requests, setRequests] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const user = await base44.auth.me().catch(() => null);
      const [r, e] = await Promise.all([
        base44.entities.FleetPartFluidRequest.list("-created_date", 500),
        base44.entities.FleetEquipment.list("name", 500),
      ]);
      let admin = user?.role === "admin";
      if (!admin && user?.email) {
        const authRows = await base44.entities.AuthorizedEmail.filter({ email: user.email }).catch(() => []);
        admin = authRows?.[0]?.role === "admin";
      }
      setCurrentUser(user);
      setIsAdmin(admin);
      setRequests(r || []);
      setEquipment(e || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const names = useMemo(() => Object.fromEntries(equipment.map(e => [e.id, e.name])), [equipment]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(r => (status === "all" || r.status === status) && (!q || [r.item_name, r.part_number, r.manufacturer_brand, r.requested_by_person, r.justification, names[r.equipment_id]].some(v => String(v || "").toLowerCase().includes(q))));
  }, [requests, search, status, names]);

  const owns = (request) => String(request.requester_email || "").toLowerCase() === String(currentUser?.email || "").toLowerCase();

  const submitDialog = async (form) => {
    if (!dialog) return;
    const action = dialog.mode;
    const payload = action === "create"
      ? { action: "create", request: form }
      : action === "edit"
        ? { action: "update", id: dialog.request.id, request: form }
        : { action, id: dialog.request.id, ...form };
    const response = await base44.functions.invoke("fleetRequestAction", payload);
    if (response?.data?.error) throw new Error(response.data.error);
    await loadData();
    setDialog(null);
    setActionError("");
  };

  const cancelRequest = async (request) => {
    if (!request) return;
    setBusyId(request.id);
    setActionError("");
    try {
      const response = await base44.functions.invoke("fleetRequestAction", { action: "cancel", id: request.id });
      if (response?.data?.error) throw new Error(response.data.error);
      await loadData();
    } catch (error) {
      setActionError(error?.message || "Failed to cancel Fleet request.");
    } finally {
      setBusyId("");
      setConfirmCancel(null);
    }
  };

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav /><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fleet Requests</h1><p className="text-sm text-gray-500 dark:text-slate-400">Parts/fluids requests are Fleet-only. Migrated received records are protected from being received twice.</p></div><button onClick={()=>setDialog({mode:"create",request:null})} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium flex items-center justify-center gap-2"><Plus className="w-4 h-4"/>New Request</button></div>
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200 px-3 py-2 text-xs">Fleet requests are live. Receiving uses a durable receipt and exact inventory matching, and request/received notifications are queued through the Fleet notification worker.</div>
    {actionError&&<div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 px-3 py-2 text-sm">{actionError}</div>}
    <div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search requests..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700" /></div><select value={status} onChange={e=>setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All statuses</option><option value="pending">Pending</option><option value="ordered">Ordered</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select></div>
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div> : <div className="space-y-3">{rows.map(r=>{
      const canEdit = r.status === "pending" && (isAdmin || owns(r));
      const canCancel = (isAdmin && ["pending","ordered"].includes(r.status)) || (!isAdmin && owns(r) && r.status === "pending");
      return <div key={r.id} className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm"><div className="flex items-start gap-3"><ShoppingCart className="w-5 h-5 mt-0.5 text-indigo-500 shrink-0"/><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-gray-900 dark:text-slate-100">{r.item_name}</h2><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 capitalize">{r.status}</span>{r.receipt_applied_at&&<span className="text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5"/>receipt applied</span>}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{r.item_type} · qty {r.quantity_needed} · {names[r.equipment_id] || "No equipment"}</div>
      <div className="flex flex-wrap gap-2 mt-3">{canEdit&&<button onClick={()=>setDialog({mode:"edit",request:r})} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-700 flex items-center gap-1.5 text-sm"><Pencil className="w-4 h-4"/>Edit</button>}{isAdmin&&r.status==="pending"&&<button onClick={()=>setDialog({mode:"order",request:r})} className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 dark:text-blue-300 flex items-center gap-1.5 text-sm"><Truck className="w-4 h-4"/>Mark Ordered</button>}{isAdmin&&r.status==="ordered"&&<><button onClick={()=>setDialog({mode:"order",request:r})} className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 dark:text-blue-300 flex items-center gap-1.5 text-sm"><Truck className="w-4 h-4"/>Order Details</button><button onClick={()=>setDialog({mode:"receive",request:r})} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white flex items-center gap-1.5 text-sm"><PackageCheck className="w-4 h-4"/>Receive</button></>}{canCancel&&<button onClick={()=>setConfirmCancel(r)} disabled={busyId===r.id} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 dark:text-red-300 flex items-center gap-1.5 text-sm disabled:opacity-50">{busyId===r.id?<Loader2 className="w-4 h-4 animate-spin"/>:<XCircle className="w-4 h-4"/>}Cancel</button>}</div>
      <div className="grid sm:grid-cols-3 gap-3 mt-3 text-sm"><Info label="Requested by" value={r.requested_by_person||r.requester_email||"—"}/><Info label="Brand / Part #" value={[r.manufacturer_brand,r.part_number].filter(Boolean).join(" · ")||"—"}/><Info label="Est. delivery" value={r.estimated_delivery_date||"—"}/></div>{r.justification&&<div className="mt-3 text-sm text-gray-600 dark:text-slate-300 whitespace-pre-wrap">{r.justification}</div>}{r.photo_urls?.length>0&&<div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">{r.photo_urls.map((url,index)=><a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-800"><img src={url} alt={`Request ${r.item_name} ${index+1}`} className="w-full h-full object-cover"/></a>)}</div>}{r.vendor_link&&<a href={r.vendor_link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-300">Vendor link <ExternalLink className="w-3.5 h-3.5"/></a>}{r.received_at&&<div className="mt-3 text-xs text-gray-500">Received {r.quantity_received ?? "—"} {r.received_unit || ""} on {String(r.received_at).slice(0,10)} · inventory link {r.inventory_item_id || "unresolved historical item"}</div>}</div></div></div>})}{rows.length===0&&<div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-12 text-center text-gray-500">No requests found.</div>}</div>}
  </div><FleetRequestDialog open={!!dialog} mode={dialog?.mode} request={dialog?.request} equipment={equipment} onClose={()=>setDialog(null)} onSubmit={submitDialog}/><FleetConfirmDialog open={!!confirmCancel} title="Cancel Fleet request?" description={`Cancel the request for ${confirmCancel?.item_name || "this item"}? No inventory will be changed.`} confirmLabel="Cancel Request" tone="danger" busy={!!busyId} onCancel={()=>setConfirmCancel(null)} onConfirm={()=>cancelRequest(confirmCancel)}/></div>;
}
function Info({label,value}){return <div><div className="text-xs text-gray-400">{label}</div><div className="text-gray-800 dark:text-slate-200 mt-0.5">{value}</div></div>}
