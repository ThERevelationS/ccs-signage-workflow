import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";

const PART_EMPTY = {
  part_name: "", part_number: "", alternate_part_numbers: [], barcode_value: "", category: "other", subcategory: "", manufacturer: "",
  description: "", specification: "", quantity_on_hand: "", minimum_stock: "", unit_cost: "", location: "",
  storage_zone: "", storage_cabinet: "", storage_shelf: "", storage_bin: "", preferred_vendor: "", vendor_sku: "", vendor_url: "",
  primary_photo_url: "", photo_urls: [], tags: [], identity_status: "unverified", identification_confidence: "", identification_method: "manual",
  identification_notes: "", compatibility_notes: "", notes: "", enable_low_stock_alerts: true, compatible_equipment_ids: [],
};
const FLUID_EMPTY = {
  fluid_name: "", fluid_type: "", viscosity: "", brand: "",
  quantity: "", unit: "quarts", minimum_stock: "", minimum_stock_unit: "quarts",
  cost_per_unit: "", location: "", notes: "", enable_low_stock_alerts: true,
  compatible_equipment_ids: [],
};

export default function FleetInventoryDialog({ open, itemType, item, equipment, onClose, onSave, saving }) {
  const [form, setForm] = useState(itemType === "part" ? PART_EMPTY : FLUID_EMPTY);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const busy = saving || localBusy;

  useEffect(() => {
    if (!open) return;
    const empty = itemType === "part" ? PART_EMPTY : FLUID_EMPTY;
    setForm(item ? { ...empty, ...item } : empty);
    setPhotoFile(null);
    setPhotoPreview("");
  }, [open, itemType, item]);

  if (!open) return null;
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const toggleEquipment = (id) => set("compatible_equipment_ids", (form.compatible_equipment_ids || []).includes(id)
    ? (form.compatible_equipment_ids || []).filter(x => x !== id)
    : [...(form.compatible_equipment_ids || []), id]);

  const submit = async (e) => {
    e.preventDefault();
    if (itemType === "part") {
      setLocalBusy(true);
      try {
        let primaryPhotoUrl = String(form.primary_photo_url || "").trim();
        let photos = Array.isArray(form.photo_urls) ? [...form.photo_urls] : [];
        if (photoFile) {
          const upload = await base44.integrations.Core.UploadFile({ file: photoFile });
          if (!upload?.file_url) throw new Error("Part photo upload failed.");
          primaryPhotoUrl = upload.file_url;
          photos = [...new Set([upload.file_url, ...photos].filter(Boolean))];
        }
        await onSave({
        part_name: String(form.part_name || "").trim(),
        part_number: String(form.part_number || "").trim(),
        alternate_part_numbers: Array.isArray(form.alternate_part_numbers) ? form.alternate_part_numbers : String(form.alternate_part_numbers || "").split(/[,\n]/).map(value => value.trim()).filter(Boolean),
        barcode_value: String(form.barcode_value || "").trim(),
        category: String(form.category || "").trim(),
        subcategory: String(form.subcategory || "").trim(),
        manufacturer: String(form.manufacturer || "").trim(),
        description: String(form.description || "").trim(),
        specification: String(form.specification || "").trim(),
        quantity_on_hand: form.quantity_on_hand === "" ? undefined : Number(form.quantity_on_hand),
        minimum_stock: form.minimum_stock === "" ? undefined : Number(form.minimum_stock),
        unit_cost: form.unit_cost === "" ? undefined : Number(form.unit_cost),
        location: String(form.location || "").trim(),
        storage_zone: String(form.storage_zone || "").trim(),
        storage_cabinet: String(form.storage_cabinet || "").trim(),
        storage_shelf: String(form.storage_shelf || "").trim(),
        storage_bin: String(form.storage_bin || "").trim(),
        preferred_vendor: String(form.preferred_vendor || "").trim(),
        vendor_sku: String(form.vendor_sku || "").trim(),
        vendor_url: String(form.vendor_url || "").trim(),
        primary_photo_url: primaryPhotoUrl,
        photo_urls: photos,
        tags: Array.isArray(form.tags) ? form.tags : String(form.tags || "").split(/[,\n]/).map(value => value.trim()).filter(Boolean),
        identity_status: form.identity_status || "unverified",
        identification_confidence: form.identification_confidence || undefined,
        identification_method: form.identification_method || "manual",
        identification_notes: String(form.identification_notes || "").trim(),
        compatibility_notes: String(form.compatibility_notes || "").trim(),
        notes: String(form.notes || "").trim(),
        enable_low_stock_alerts: !!form.enable_low_stock_alerts,
        compatible_equipment_ids: form.compatible_equipment_ids || [],
      });
      } finally { setLocalBusy(false); }
    } else {
    } else {
      onSave({
        fluid_name: String(form.fluid_name || "").trim(),
        fluid_type: String(form.fluid_type || "").trim(),
        viscosity: String(form.viscosity || "").trim(),
        brand: String(form.brand || "").trim(),
        quantity: form.quantity === "" ? undefined : Number(form.quantity),
        unit: form.unit || undefined,
        minimum_stock: form.minimum_stock === "" ? undefined : Number(form.minimum_stock),
        minimum_stock_unit: form.minimum_stock_unit || undefined,
        cost_per_unit: form.cost_per_unit === "" ? undefined : Number(form.cost_per_unit),
        location: String(form.location || "").trim(),
        notes: String(form.notes || "").trim(),
        enable_low_stock_alerts: !!form.enable_low_stock_alerts,
        compatible_equipment_ids: form.compatible_equipment_ids || [],
      });
    }
  };

  const title = itemType === "part" ? (item ? "Edit Fleet Part" : "New Fleet Part") : (item ? "Edit Fleet Fluid" : "New Fleet Fluid");

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="fleet-inventory-dialog-title" className="w-full max-w-3xl max-h-[94dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div><h2 id="fleet-inventory-dialog-title" className="text-lg font-bold text-gray-900 dark:text-slate-100">{title}</h2><p className="text-xs text-gray-500 dark:text-slate-400">Fleet inventory only. This never writes to CCS Master Inventory or Sign Maintenance inventory.</p></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close Fleet inventory dialog" className="min-h-11 min-w-11 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><X className="w-5 h-5 mx-auto" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-5">
          {itemType === "part" ? <div className="grid md:grid-cols-2 gap-4">
            <Field label="Part Name *"><input required value={form.part_name || ""} onChange={e => set("part_name", e.target.value)} className="field" /></Field>
            <Field label="Part Number"><input value={form.part_number || ""} onChange={e => set("part_number", e.target.value)} className="field" /></Field>
            <Field label="Alternate / Cross-reference Numbers"><textarea rows={2} value={Array.isArray(form.alternate_part_numbers) ? form.alternate_part_numbers.join(", ") : (form.alternate_part_numbers || "")} onChange={e => set("alternate_part_numbers", e.target.value)} className="field" placeholder="Comma separated" /></Field>
            <Field label="Barcode / UPC"><input value={form.barcode_value || ""} onChange={e => set("barcode_value", e.target.value)} className="field" /></Field>
            <Field label="Category *"><input required value={form.category || ""} onChange={e => set("category", e.target.value)} className="field" placeholder="Filters, belts, electrical, engine…" /></Field>
            <Field label="Subcategory"><input value={form.subcategory || ""} onChange={e => set("subcategory", e.target.value)} className="field" /></Field>
            <Field label="Manufacturer"><input value={form.manufacturer || ""} onChange={e => set("manufacturer", e.target.value)} className="field" /></Field>
            <Field label="Identity Status"><select value={form.identity_status || "unverified"} onChange={e => set("identity_status", e.target.value)} className="field"><option value="unverified">Unverified</option><option value="review_needed">Needs review</option><option value="verified">Verified</option></select></Field>
            <Field label="Quantity on Hand"><input type="number" min="0" step="1" value={form.quantity_on_hand ?? ""} onChange={e => set("quantity_on_hand", e.target.value)} className="field" /></Field>
            <Field label="Minimum Stock"><input type="number" min="0" step="1" value={form.minimum_stock ?? ""} onChange={e => set("minimum_stock", e.target.value)} className="field" /></Field>
            <Field label="Unit Cost"><input type="number" min="0" step="0.01" value={form.unit_cost ?? ""} onChange={e => set("unit_cost", e.target.value)} className="field" /></Field>
            <Field label="Legacy / General Location"><input value={form.location || ""} onChange={e => set("location", e.target.value)} className="field" /></Field>
          </div> : <div className="grid md:grid-cols-2 gap-4">
            <Field label="Fluid Name *"><input required value={form.fluid_name || ""} onChange={e => set("fluid_name", e.target.value)} className="field" /></Field>
            <Field label="Fluid Type"><input value={form.fluid_type || ""} onChange={e => set("fluid_type", e.target.value)} className="field" placeholder="Oil, coolant, hydraulic, etc." /></Field>
            <Field label="Brand"><input value={form.brand || ""} onChange={e => set("brand", e.target.value)} className="field" /></Field>
            <Field label="Viscosity"><input value={form.viscosity || ""} onChange={e => set("viscosity", e.target.value)} className="field" /></Field>
            <Field label="Quantity"><div className="grid grid-cols-[1fr_130px] gap-2"><input type="number" min="0" step="0.01" value={form.quantity ?? ""} onChange={e => set("quantity", e.target.value)} className="field" /><UnitSelect value={form.unit || "quarts"} onChange={v => set("unit", v)} /></div></Field>
            <Field label="Minimum Stock"><div className="grid grid-cols-[1fr_130px] gap-2"><input type="number" min="0" step="0.01" value={form.minimum_stock ?? ""} onChange={e => set("minimum_stock", e.target.value)} className="field" /><UnitSelect value={form.minimum_stock_unit || "quarts"} onChange={v => set("minimum_stock_unit", v)} /></div></Field>
            <Field label="Cost per Unit"><input type="number" min="0" step="0.01" value={form.cost_per_unit ?? ""} onChange={e => set("cost_per_unit", e.target.value)} className="field" /></Field>
            <Field label="Location"><input value={form.location || ""} onChange={e => set("location", e.target.value)} className="field" /></Field>
          </div>}

          {itemType === "part" && <>
            <div className="grid md:grid-cols-2 gap-4"><Field label="Description"><textarea rows={3} value={form.description || ""} onChange={e => set("description", e.target.value)} className="field" /></Field><Field label="Specification / Dimensions"><textarea rows={3} value={form.specification || ""} onChange={e => set("specification", e.target.value)} className="field" /></Field></div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-3">Physical Organization</div><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Field label="Zone"><input value={form.storage_zone || ""} onChange={e => set("storage_zone", e.target.value)} className="field" placeholder="Parts room" /></Field><Field label="Cabinet"><input value={form.storage_cabinet || ""} onChange={e => set("storage_cabinet", e.target.value)} className="field" placeholder="Cabinet A" /></Field><Field label="Shelf"><input value={form.storage_shelf || ""} onChange={e => set("storage_shelf", e.target.value)} className="field" placeholder="Shelf 2" /></Field><Field label="Bin"><input value={form.storage_bin || ""} onChange={e => set("storage_bin", e.target.value)} className="field" placeholder="Bin B14" /></Field></div></div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-3">Vendor & Procurement</div><div className="grid md:grid-cols-3 gap-3"><Field label="Preferred Vendor"><input value={form.preferred_vendor || ""} onChange={e => set("preferred_vendor", e.target.value)} className="field" /></Field><Field label="Vendor SKU"><input value={form.vendor_sku || ""} onChange={e => set("vendor_sku", e.target.value)} className="field" /></Field><Field label="Vendor URL"><input type="url" value={form.vendor_url || ""} onChange={e => set("vendor_url", e.target.value)} className="field" /></Field></div></div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div className="flex items-center gap-2 font-semibold text-sm text-gray-900 dark:text-slate-100"><ImagePlus className="w-4 h-4 text-indigo-500" />Part Photo</div><div className="mt-3 grid sm:grid-cols-[96px_1fr] gap-3 items-center"><div className="w-24 h-24 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">{photoPreview || form.primary_photo_url ? <img src={photoPreview || form.primary_photo_url} alt="Part preview" className="w-full h-full object-cover" /> : <ImagePlus className="w-7 h-7 text-gray-300" />}</div><label className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-2 cursor-pointer text-sm font-semibold"><Upload className="w-4 h-4" />Choose photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const file=e.target.files?.[0]||null; setPhotoFile(file); if(photoPreview) URL.revokeObjectURL(photoPreview); setPhotoPreview(file?URL.createObjectURL(file):""); }} /></label></div></div>
            <div className="grid md:grid-cols-2 gap-4"><Field label="Tags"><input value={Array.isArray(form.tags) ? form.tags.join(", ") : (form.tags || "")} onChange={e => set("tags", e.target.value)} className="field" placeholder="filter, engine, spare…" /></Field><Field label="Identification Notes"><input value={form.identification_notes || ""} onChange={e => set("identification_notes", e.target.value)} className="field" placeholder="How identity was verified / what still needs checking" /></Field></div>
          </>}

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enable_low_stock_alerts !== false} onChange={e => set("enable_low_stock_alerts", e.target.checked)} />Enable low-stock alerts for this item</label>

          <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-2">Compatible Equipment</div>
            <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">{equipment.map(eq => <label key={eq.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(form.compatible_equipment_ids || []).includes(eq.id)} onChange={() => toggleEquipment(eq.id)} /><span>{eq.name}</span></label>)}</div>
            <div className="text-xs text-gray-400 mt-2">No selections means unrestricted compatibility.</div>
            {itemType === "part" && <div className="mt-3"><Field label="Compatibility Notes"><textarea rows={2} value={form.compatibility_notes || ""} onChange={e => set("compatibility_notes", e.target.value)} className="field" placeholder="Engine/configuration limits, verified fitment notes, or universal-use guidance" /></Field></div>}
          </div>

          <Field label="Notes"><textarea rows={4} value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="field" /></Field>
          <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 disabled:opacity-50">Cancel</button><button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{item ? "Save" : "Create"}</button></div>
        </form>
      </div>
      <style>{`.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.5rem .65rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}`}</style>
    </div>
  );
}

function Field({ label, children }) { return <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>; }
function UnitSelect({ value, onChange }) { return <select value={value} onChange={e => onChange(e.target.value)} className="field"><option value="quarts">Quarts</option><option value="gallons">Gallons</option><option value="pints">Pints</option><option value="ounces">Ounces</option></select>; }