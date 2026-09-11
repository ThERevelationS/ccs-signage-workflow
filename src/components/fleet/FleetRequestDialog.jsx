import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetConfirmDialog from "@/components/fleet/FleetConfirmDialog";
import { Loader2, X, Upload, ImagePlus } from "lucide-react";

export default function FleetRequestDialog({ open, mode, request, equipment, parts = [], fluids = [], onClose, onSubmit }) {
  const [form, setForm] = useState(/** @type {any} */ ({}));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (mode === "order") {
      setForm({ estimated_delivery_date: request?.estimated_delivery_date || "", unit_cost: request?.unit_cost ?? "" });
    } else if (mode === "receive") {
      const linked = request?.inventory_item_id
        ? (request?.item_type === "part" ? parts.find(item => item.id === request.inventory_item_id) : fluids.find(item => item.id === request.inventory_item_id))
        : null;
      setForm({
        quantity_received: request?.quantity_needed ?? 1,
        location: linked?.location || "",
        category: linked?.category || "other",
        minimum_stock: linked?.minimum_stock ?? 1,
        fluid_type: linked?.fluid_type || "",
        unit: request?.item_type === "fluid" ? (linked?.unit || "quarts") : "units",
        minimum_stock_unit: request?.item_type === "fluid" ? (linked?.minimum_stock_unit || linked?.unit || "quarts") : "units",
        notes: "",
      });
    } else {
      setForm({
        inventory_item_id: request?.inventory_item_id || "",
        item_name: request?.item_name || "",
        item_type: request?.item_type || "part",
        part_number: request?.part_number || "",
        manufacturer_brand: request?.manufacturer_brand || "",
        quantity_needed: request?.quantity_needed ?? 1,
        equipment_id: request?.equipment_id || "",
        requested_by_person: request?.requested_by_person || "",
        justification: request?.justification || "",
        vendor_link: request?.vendor_link || "",
        notes: request?.notes || "",
        photo_urls: request?.photo_urls || [],
      });
    }
    setConfirmReceive(false);
    setPendingPhotos([]);
    setError("");
  }, [open, mode, request, parts, fluids]);

  if (!open) return null;
  const linkedInventory = request?.inventory_item_id
    ? (request?.item_type === "part" ? parts.find(item => item.id === request.inventory_item_id) : fluids.find(item => item.id === request.inventory_item_id))
    : null;
  const title = mode === "create" ? "New Fleet Request" : mode === "edit" ? "Edit Fleet Request" : mode === "order" ? `Order ${request?.item_name || "Item"}` : `Receive ${request?.item_name || "Item"}`;
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const addPhotos = (fileList) => {
    const files = Array.from(fileList || []).filter(file => file?.type?.startsWith("image/"));
    if (files.length) setPendingPhotos(prev => [...prev, ...files]);
  };
  const removeSavedPhoto = (index) => set("photo_urls", (form.photo_urls || []).filter((_, i) => i !== index));

  const performSubmit = async () => {
    setConfirmReceive(false);
    setSaving(true);
    try {
      let payload = form;
      if (mode === "create" || mode === "edit") {
        const uploaded = await Promise.all(pendingPhotos.map(async (file) => {
          const result = await base44.integrations.Core.UploadFile({ file });
          if (!result?.file_url) throw new Error(`Photo upload failed for ${file.name}.`);
          return result.file_url;
        }));
        payload = { ...form, photo_urls: [...(form.photo_urls || []), ...uploaded] };
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err?.message || "Fleet request operation failed.");
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if ((mode === "create" || mode === "edit") && (!form.item_name?.trim() || Number(form.quantity_needed) <= 0 || !form.justification?.trim())) {
      setError("Item name, quantity, and justification are required.");
      return;
    }
    if (mode === "receive" && Number(form.quantity_received) <= 0) {
      setError("Quantity received must be greater than zero.");
      return;
    }
    if (mode === "receive") {
      setConfirmReceive(true);
      return;
    }
    await performSubmit();
  };

  return <div className="fixed inset-0 z-[100] bg-black/50 p-3 sm:p-6 overflow-y-auto"><div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700">
    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-800"><div><div className="font-semibold text-gray-900 dark:text-slate-100">{title}</div><div className="text-xs text-gray-500">Fleet inventory only — never Master Inventory.</div></div><button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5"/></button></div>
    <form onSubmit={submit} className="p-4 sm:p-6 space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 px-3 py-2 text-sm">{error}</div>}
      {(mode === "create" || mode === "edit") && <>
        {form.inventory_item_id && <div className="rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-900 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-200">This request is linked to an exact Fleet inventory record. Item identity is locked so receiving updates the intended part/fluid instead of relying on name matching.</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Item Type"><select disabled={!!form.inventory_item_id} className="fleet-request-input disabled:opacity-60" value={form.item_type || "part"} onChange={(e)=>set("item_type",e.target.value)}><option value="part">Part</option><option value="fluid">Fluid</option></select></Field>
          <Field label="Quantity"><input className="fleet-request-input" type="number" min="0.01" step="0.01" value={form.quantity_needed ?? 1} onChange={(e)=>set("quantity_needed",e.target.value)}/></Field>
          <Field label="Item Name"><input disabled={!!form.inventory_item_id} className="fleet-request-input disabled:opacity-60" value={form.item_name || ""} onChange={(e)=>set("item_name",e.target.value)}/></Field>
          <Field label={form.item_type === "part" ? "Part Number" : "Reference / Part Number"}><input disabled={!!form.inventory_item_id} className="fleet-request-input disabled:opacity-60" value={form.part_number || ""} onChange={(e)=>set("part_number",e.target.value)}/></Field>
          <Field label="Manufacturer / Brand"><input disabled={!!form.inventory_item_id} className="fleet-request-input disabled:opacity-60" value={form.manufacturer_brand || ""} onChange={(e)=>set("manufacturer_brand",e.target.value)}/></Field>
          <Field label="Equipment"><select className="fleet-request-input" value={form.equipment_id || ""} onChange={(e)=>set("equipment_id",e.target.value)}><option value="">No equipment</option>{equipment.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Requested By"><input className="fleet-request-input" value={form.requested_by_person || ""} onChange={(e)=>set("requested_by_person",e.target.value)} placeholder="Defaults to signed-in user"/></Field>
          <Field label="Vendor Link"><input className="fleet-request-input" value={form.vendor_link || ""} onChange={(e)=>set("vendor_link",e.target.value)} placeholder="https://..."/></Field>
        </div>
        <Field label="Justification"><textarea className="fleet-request-input" rows={4} value={form.justification || ""} onChange={(e)=>set("justification",e.target.value)}/></Field>
        <Field label="Notes"><textarea className="fleet-request-input" rows={3} value={form.notes || ""} onChange={(e)=>set("notes",e.target.value)}/></Field>
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2"><div className="font-medium text-gray-900 dark:text-slate-100 inline-flex items-center gap-2"><ImagePlus className="w-4 h-4 text-indigo-500"/>Request Photos</div><label className="cursor-pointer inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-300"><Upload className="w-4 h-4"/>Add photos<input type="file" accept="image/*" multiple className="hidden" onChange={e=>{addPhotos(e.target.files);e.target.value="";}}/></label></div>
          {(form.photo_urls || []).length > 0 && <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{(form.photo_urls || []).map((url,index)=><div key={`${url}-${index}`} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-800"><img src={url} alt={`Request photo ${index+1}`} className="w-full h-full object-cover"/><button type="button" onClick={()=>removeSavedPhoto(index)} className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white"><X className="w-3 h-3"/></button></div>)}</div>}
          {pendingPhotos.length > 0 && <div className="space-y-1">{pendingPhotos.map((file,index)=><div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 px-2 py-1.5 text-xs"><span className="truncate text-indigo-800 dark:text-indigo-200">{file.name}</span><button type="button" onClick={()=>setPendingPhotos(prev=>prev.filter((_,i)=>i!==index))} className="text-indigo-500 hover:text-red-600"><X className="w-3.5 h-3.5"/></button></div>)}</div>}
          {!(form.photo_urls || []).length && !pendingPhotos.length && <div className="text-xs text-gray-400 border border-dashed border-gray-200 dark:border-slate-800 rounded-lg p-3 text-center">No request photos.</div>}
          <div className="text-xs text-gray-400">Photos upload when the request is submitted or saved.</div>
        </div>
      </>}

      {mode === "order" && <div className="grid sm:grid-cols-2 gap-4"><Field label="Estimated Delivery"><input className="fleet-request-input" type="date" value={form.estimated_delivery_date || ""} onChange={(e)=>set("estimated_delivery_date",e.target.value)}/></Field><Field label="Unit Cost"><input className="fleet-request-input" type="number" min="0" step="0.01" value={form.unit_cost ?? ""} onChange={(e)=>set("unit_cost",e.target.value)}/></Field></div>}

      {mode === "receive" && <>
        {linkedInventory && <div className="rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-900 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-200"><div className="font-semibold">Exact Fleet inventory item linked</div><div className="mt-1">Current stock: {request?.item_type === "part" ? linkedInventory.quantity_on_hand ?? "—" : `${linkedInventory.quantity ?? "—"} ${linkedInventory.unit || ""}`} · Location: {linkedInventory.location || "—"}. Receiving will update this exact record.</div></div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Quantity Received"><input className="fleet-request-input" type="number" min="0.01" step="0.01" value={form.quantity_received ?? 1} onChange={(e)=>set("quantity_received",e.target.value)}/></Field>
          <Field label="Storage Location"><input disabled={!!linkedInventory} className="fleet-request-input disabled:opacity-60" value={form.location || ""} onChange={(e)=>set("location",e.target.value)}/></Field>
          {request?.item_type === "part" ? <>
            {!linkedInventory && <><Field label="Category (used only if a new Fleet Part must be created)"><input className="fleet-request-input" value={form.category || "other"} onChange={(e)=>set("category",e.target.value)}/></Field><Field label="Minimum Stock"><input className="fleet-request-input" type="number" min="0" step="1" value={form.minimum_stock ?? 1} onChange={(e)=>set("minimum_stock",e.target.value)}/></Field></>}
          </> : <>
            {!linkedInventory && <Field label="Fluid Type (used only if new)"><input className="fleet-request-input" value={form.fluid_type || ""} onChange={(e)=>set("fluid_type",e.target.value)}/></Field>}
            <Field label="Stock Unit"><select disabled={!!linkedInventory} className="fleet-request-input disabled:opacity-60" value={form.unit || "quarts"} onChange={(e)=>{set("unit",e.target.value);set("minimum_stock_unit",e.target.value)}}>{["quarts","gallons","pints","ounces"].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
            {!linkedInventory && <><Field label="Minimum Stock"><input className="fleet-request-input" type="number" min="0" step="0.01" value={form.minimum_stock ?? 0} onChange={(e)=>set("minimum_stock",e.target.value)}/></Field><Field label="Minimum Stock Unit"><select className="fleet-request-input" value={form.minimum_stock_unit || form.unit || "quarts"} onChange={(e)=>set("minimum_stock_unit",e.target.value)}>{["quarts","gallons","pints","ounces"].map(v=><option key={v} value={v}>{v}</option>)}</select></Field></>}
          </>}
        </div>
        {!linkedInventory && <Field label="Inventory Notes"><textarea className="fleet-request-input" rows={3} value={form.notes || ""} onChange={(e)=>set("notes",e.target.value)}/></Field>}
        <div className="rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 px-3 py-2 text-xs">{linkedInventory ? "This request uses an exact Fleet inventory ID; no name-based matching is needed." : "Unlinked requests follow preserved FleetMaster matching rules: Part by exact part number; Fluid by exact name + brand. Ambiguous duplicate matches fail closed."}</div>
      </>}

      <div className="rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 px-3 py-2 text-xs">Fleet request notifications are live and queued durably. Receiving remains retry-safe and cannot increment inventory twice.</div>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium flex items-center gap-2 disabled:opacity-50">{saving&&<Loader2 className="w-4 h-4 animate-spin"/>}{mode === "create" ? "Submit Request" : mode === "edit" ? "Save Request" : mode === "order" ? "Save Order Details" : "Receive Into Fleet Inventory"}</button></div>
    </form>
  </div><FleetConfirmDialog open={confirmReceive} title={`Receive ${request?.item_name || "Fleet item"}?`} description={`This will add ${form.quantity_received || 0} ${form.unit || (request?.item_type === "part" ? "units" : "")} to Fleet inventory and mark the request received. A durable receipt prevents the inventory addition from being applied twice.`} confirmLabel="Receive Into Inventory" tone="success" busy={saving} onCancel={()=>setConfirmReceive(false)} onConfirm={performSubmit}/><style>{`.fleet-request-input{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.55rem .7rem;background:white}.dark .fleet-request-input{background:rgb(15 23 42);border-color:rgb(51 65 85);color:rgb(226 232 240)}`}</style></div>;
}
function Field({label,children}){return <label className="block space-y-1.5"><span className="text-xs font-medium text-gray-600 dark:text-slate-300">{label}</span>{children}</label>}
