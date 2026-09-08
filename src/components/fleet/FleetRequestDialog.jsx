import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

export default function FleetRequestDialog({ open, mode, request, equipment, onClose, onSubmit }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (mode === "order") {
      setForm({ estimated_delivery_date: request?.estimated_delivery_date || "", unit_cost: request?.unit_cost ?? "" });
    } else if (mode === "receive") {
      setForm({
        quantity_received: request?.quantity_needed ?? 1,
        location: "",
        category: "other",
        minimum_stock: 1,
        fluid_type: "",
        unit: "quarts",
        minimum_stock_unit: "quarts",
        notes: "",
      });
    } else {
      setForm({
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
    setError("");
  }, [open, mode, request]);

  if (!open) return null;
  const title = mode === "create" ? "New Fleet Request" : mode === "edit" ? "Edit Fleet Request" : mode === "order" ? `Order ${request?.item_name || "Item"}` : `Receive ${request?.item_name || "Item"}`;
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

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
    if (mode === "receive" && !window.confirm("Receive this item into Fleet inventory? This action is protected by a durable idempotency receipt and cannot be applied twice.")) return;
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err?.message || "Fleet request operation failed.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[100] bg-black/50 p-3 sm:p-6 overflow-y-auto"><div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700">
    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-800"><div><div className="font-semibold text-gray-900 dark:text-slate-100">{title}</div><div className="text-xs text-gray-500">Fleet inventory only — never Master Inventory.</div></div><button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5"/></button></div>
    <form onSubmit={submit} className="p-4 sm:p-6 space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 px-3 py-2 text-sm">{error}</div>}
      {(mode === "create" || mode === "edit") && <>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Item Type"><select className="fleet-request-input" value={form.item_type || "part"} onChange={(e)=>set("item_type",e.target.value)}><option value="part">Part</option><option value="fluid">Fluid</option></select></Field>
          <Field label="Quantity"><input className="fleet-request-input" type="number" min="0.01" step="0.01" value={form.quantity_needed ?? 1} onChange={(e)=>set("quantity_needed",e.target.value)}/></Field>
          <Field label="Item Name"><input className="fleet-request-input" value={form.item_name || ""} onChange={(e)=>set("item_name",e.target.value)}/></Field>
          <Field label={form.item_type === "part" ? "Part Number" : "Reference / Part Number"}><input className="fleet-request-input" value={form.part_number || ""} onChange={(e)=>set("part_number",e.target.value)}/></Field>
          <Field label="Manufacturer / Brand"><input className="fleet-request-input" value={form.manufacturer_brand || ""} onChange={(e)=>set("manufacturer_brand",e.target.value)}/></Field>
          <Field label="Equipment"><select className="fleet-request-input" value={form.equipment_id || ""} onChange={(e)=>set("equipment_id",e.target.value)}><option value="">No equipment</option>{equipment.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Requested By"><input className="fleet-request-input" value={form.requested_by_person || ""} onChange={(e)=>set("requested_by_person",e.target.value)} placeholder="Defaults to signed-in user"/></Field>
          <Field label="Vendor Link"><input className="fleet-request-input" value={form.vendor_link || ""} onChange={(e)=>set("vendor_link",e.target.value)} placeholder="https://..."/></Field>
        </div>
        <Field label="Justification"><textarea className="fleet-request-input" rows={4} value={form.justification || ""} onChange={(e)=>set("justification",e.target.value)}/></Field>
        <Field label="Notes"><textarea className="fleet-request-input" rows={3} value={form.notes || ""} onChange={(e)=>set("notes",e.target.value)}/></Field>
      </>}

      {mode === "order" && <div className="grid sm:grid-cols-2 gap-4"><Field label="Estimated Delivery"><input className="fleet-request-input" type="date" value={form.estimated_delivery_date || ""} onChange={(e)=>set("estimated_delivery_date",e.target.value)}/></Field><Field label="Unit Cost"><input className="fleet-request-input" type="number" min="0" step="0.01" value={form.unit_cost ?? ""} onChange={(e)=>set("unit_cost",e.target.value)}/></Field></div>}

      {mode === "receive" && <>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Quantity Received"><input className="fleet-request-input" type="number" min="0.01" step="0.01" value={form.quantity_received ?? 1} onChange={(e)=>set("quantity_received",e.target.value)}/></Field>
          <Field label="Storage Location"><input className="fleet-request-input" value={form.location || ""} onChange={(e)=>set("location",e.target.value)}/></Field>
          {request?.item_type === "part" ? <>
            <Field label="Category (used only if a new Fleet Part must be created)"><input className="fleet-request-input" value={form.category || "other"} onChange={(e)=>set("category",e.target.value)}/></Field>
            <Field label="Minimum Stock"><input className="fleet-request-input" type="number" min="0" step="1" value={form.minimum_stock ?? 1} onChange={(e)=>set("minimum_stock",e.target.value)}/></Field>
          </> : <>
            <Field label="Fluid Type (used only if new)"><input className="fleet-request-input" value={form.fluid_type || ""} onChange={(e)=>set("fluid_type",e.target.value)}/></Field>
            <Field label="Stock Unit"><select className="fleet-request-input" value={form.unit || "quarts"} onChange={(e)=>{set("unit",e.target.value);set("minimum_stock_unit",e.target.value)}}>{["quarts","gallons","pints","ounces"].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
            <Field label="Minimum Stock"><input className="fleet-request-input" type="number" min="0" step="0.01" value={form.minimum_stock ?? 0} onChange={(e)=>set("minimum_stock",e.target.value)}/></Field>
            <Field label="Minimum Stock Unit"><select className="fleet-request-input" value={form.minimum_stock_unit || form.unit || "quarts"} onChange={(e)=>set("minimum_stock_unit",e.target.value)}>{["quarts","gallons","pints","ounces"].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
          </>}
        </div>
        <Field label="Inventory Notes"><textarea className="fleet-request-input" rows={3} value={form.notes || ""} onChange={(e)=>set("notes",e.target.value)}/></Field>
        <div className="rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 px-3 py-2 text-xs">Exact matching follows FleetMaster rules: Part by exact part number; Fluid by exact name + brand. Ambiguous duplicate matches fail closed instead of choosing one arbitrarily.</div>
      </>}

      <div className="rounded-lg bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200 px-3 py-2 text-xs">Fleet request emails remain disabled during migration validation.</div>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium flex items-center gap-2 disabled:opacity-50">{saving&&<Loader2 className="w-4 h-4 animate-spin"/>}{mode === "create" ? "Submit Request" : mode === "edit" ? "Save Request" : mode === "order" ? "Save Order Details" : "Receive Into Fleet Inventory"}</button></div>
    </form>
  </div><style>{`.fleet-request-input{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.55rem .7rem;background:white}.dark .fleet-request-input{background:rgb(15 23 42);border-color:rgb(51 65 85);color:rgb(226 232 240)}`}</style></div>;
}
function Field({label,children}){return <label className="block space-y-1.5"><span className="text-xs font-medium text-gray-600 dark:text-slate-300">{label}</span>{children}</label>}
