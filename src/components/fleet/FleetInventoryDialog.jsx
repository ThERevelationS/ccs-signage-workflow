import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

const PART_EMPTY = {
  part_name: "", part_number: "", category: "other", manufacturer: "",
  quantity_on_hand: "", minimum_stock: "", unit_cost: "", location: "", notes: "",
  enable_low_stock_alerts: true, compatible_equipment_ids: [],
};
const FLUID_EMPTY = {
  fluid_name: "", fluid_type: "", viscosity: "", brand: "",
  quantity: "", unit: "quarts", minimum_stock: "", minimum_stock_unit: "quarts",
  cost_per_unit: "", location: "", notes: "", enable_low_stock_alerts: true,
  compatible_equipment_ids: [],
};

export default function FleetInventoryDialog({ open, itemType, item, equipment, onClose, onSave, saving }) {
  const [form, setForm] = useState(itemType === "part" ? PART_EMPTY : FLUID_EMPTY);

  useEffect(() => {
    if (!open) return;
    const empty = itemType === "part" ? PART_EMPTY : FLUID_EMPTY;
    setForm(item ? { ...empty, ...item } : empty);
  }, [open, itemType, item]);

  if (!open) return null;
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const toggleEquipment = (id) => set("compatible_equipment_ids", (form.compatible_equipment_ids || []).includes(id)
    ? (form.compatible_equipment_ids || []).filter(x => x !== id)
    : [...(form.compatible_equipment_ids || []), id]);

  const submit = (e) => {
    e.preventDefault();
    if (itemType === "part") {
      onSave({
        part_name: String(form.part_name || "").trim(),
        part_number: String(form.part_number || "").trim(),
        category: String(form.category || "").trim(),
        manufacturer: String(form.manufacturer || "").trim(),
        quantity_on_hand: form.quantity_on_hand === "" ? undefined : Number(form.quantity_on_hand),
        minimum_stock: form.minimum_stock === "" ? undefined : Number(form.minimum_stock),
        unit_cost: form.unit_cost === "" ? undefined : Number(form.unit_cost),
        location: String(form.location || "").trim(),
        notes: String(form.notes || "").trim(),
        enable_low_stock_alerts: !!form.enable_low_stock_alerts,
        compatible_equipment_ids: form.compatible_equipment_ids || [],
      });
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
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div><h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">{title}</h2><p className="text-xs text-gray-500 dark:text-slate-400">Fleet inventory only. This never writes to CCS Master Inventory or Sign Maintenance inventory.</p></div>
          <button onClick={onClose} disabled={saving} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-5">
          {itemType === "part" ? <div className="grid md:grid-cols-2 gap-4">
            <Field label="Part Name *"><input required value={form.part_name || ""} onChange={e => set("part_name", e.target.value)} className="field" /></Field>
            <Field label="Part Number"><input value={form.part_number || ""} onChange={e => set("part_number", e.target.value)} className="field" /></Field>
            <Field label="Category *"><input required value={form.category || ""} onChange={e => set("category", e.target.value)} className="field" placeholder="Historical/custom categories allowed" /></Field>
            <Field label="Manufacturer"><input value={form.manufacturer || ""} onChange={e => set("manufacturer", e.target.value)} className="field" /></Field>
            <Field label="Quantity on Hand"><input type="number" min="0" step="1" value={form.quantity_on_hand ?? ""} onChange={e => set("quantity_on_hand", e.target.value)} className="field" /></Field>
            <Field label="Minimum Stock"><input type="number" min="0" step="1" value={form.minimum_stock ?? ""} onChange={e => set("minimum_stock", e.target.value)} className="field" /></Field>
            <Field label="Unit Cost"><input type="number" min="0" step="0.01" value={form.unit_cost ?? ""} onChange={e => set("unit_cost", e.target.value)} className="field" /></Field>
            <Field label="Location"><input value={form.location || ""} onChange={e => set("location", e.target.value)} className="field" /></Field>
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

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enable_low_stock_alerts !== false} onChange={e => set("enable_low_stock_alerts", e.target.checked)} />Enable low-stock alerts for this item</label>

          <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-2">Compatible Equipment</div>
            <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">{equipment.map(eq => <label key={eq.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(form.compatible_equipment_ids || []).includes(eq.id)} onChange={() => toggleEquipment(eq.id)} /><span>{eq.name}</span></label>)}</div>
            <div className="text-xs text-gray-400 mt-2">No selections means unrestricted compatibility.</div>
          </div>

          <Field label="Notes"><textarea rows={4} value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="field" /></Field>
          <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 disabled:opacity-50">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{item ? "Save" : "Create"}</button></div>
        </form>
      </div>
      <style>{`.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.5rem .65rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}`}</style>
    </div>
  );
}

function Field({ label, children }) { return <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>; }
function UnitSelect({ value, onChange }) { return <select value={value} onChange={e => onChange(e.target.value)} className="field"><option value="quarts">Quarts</option><option value="gallons">Gallons</option><option value="pints">Pints</option><option value="ounces">Ounces</option></select>; }