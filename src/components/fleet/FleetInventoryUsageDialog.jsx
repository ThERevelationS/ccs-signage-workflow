import { useEffect, useMemo, useState } from "react";
import { Loader2, PackageMinus, X } from "lucide-react";

const FLUID_UNITS = ["ounces", "pints", "quarts", "gallons"];

export default function FleetInventoryUsageDialog({ open, item, itemType, equipment = [], busy = false, error = "", onClose, onConfirm }) {
  const [equipmentId, setEquipmentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("quarts");
  const [notes, setNotes] = useState("");
  const [operationKey, setOperationKey] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    setEquipmentId("");
    setQuantity("");
    setUnit(itemType === "fluid" ? (item.unit || "quarts") : "units");
    setNotes("");
    setOperationKey(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setLocalError("");
  }, [open, item, itemType]);

  const compatibleEquipment = useMemo(() => {
    if (!item?.compatible_equipment_ids?.length) return equipment;
    const allowed = new Set(item.compatible_equipment_ids);
    return equipment.filter(eq => allowed.has(eq.id));
  }, [equipment, item]);

  if (!open || !item) return null;
  const itemName = itemType === "part" ? item.part_name : item.fluid_name;
  const stockQuantity = itemType === "part" ? item.quantity_on_hand : item.quantity;
  const stockUnit = itemType === "part" ? "units" : (item.unit || "");

  const submit = async (event) => {
    event.preventDefault();
    setLocalError("");
    const qty = Number(quantity);
    if (!equipmentId) return setLocalError("Select the Fleet equipment where this item was used.");
    if (!Number.isFinite(qty) || qty <= 0) return setLocalError("Enter a usage quantity greater than zero.");
    if (itemType === "part" && !Number.isInteger(qty)) return setLocalError("Part usage must be entered in whole units.");
    await onConfirm({ equipment_id: equipmentId, quantity: qty, unit: itemType === "fluid" ? unit : "units", notes: notes.trim(), operation_key: operationKey });
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-slate-800">
          <div><h2 className="font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2"><PackageMinus className="w-5 h-5 text-indigo-500"/>Record Fleet Usage</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Deducts Fleet-only stock and writes equipment usage history. This does not touch signage inventory.</p></div>
          <button type="button" onClick={onClose} disabled={busy} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-slate-800/60"><div className="font-semibold text-gray-900 dark:text-slate-100">{itemName}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Available: {stockQuantity ?? "—"} {stockUnit}</div></div>
          <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Used on *</span><select value={equipmentId} onChange={e=>setEquipmentId(e.target.value)} className="usage-field"><option value="">Select equipment</option>{compatibleEquipment.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}</select></label>
          <div className={itemType === "fluid" ? "grid grid-cols-[1fr_150px] gap-3" : ""}>
            <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Quantity used *</span><input type="number" min={itemType === "part" ? "1" : "0.01"} step={itemType === "part" ? "1" : "0.01"} value={quantity} onChange={e=>setQuantity(e.target.value)} className="usage-field"/></label>
            {itemType === "fluid" && <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Entered unit</span><select value={unit} onChange={e=>setUnit(e.target.value)} className="usage-field">{FLUID_UNITS.map(value=><option key={value} value={value}>{value}</option>)}</select></label>}
          </div>
          {itemType === "fluid" && unit !== stockUnit && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">The server will convert {unit} to the inventory stock unit ({stockUnit}) before deducting quantity.</div>}
          <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 mb-1 dark:text-slate-400">Notes</span><textarea rows="3" value={notes} onChange={e=>setNotes(e.target.value)} className="usage-field" placeholder="Optional context, e.g. emergency top-off or shop repair"/></label>
          {(localError || error) && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{localError || error}</div>}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Usage is retry-safe. Insufficient stock or incompatible equipment is rejected instead of silently reducing inventory below zero.</div>
          <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50 dark:border-slate-700">Cancel</button><button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">{busy&&<Loader2 className="w-4 h-4 animate-spin"/>}Record Usage</button></div>
        </form>
      </div>
      <style>{`.usage-field{width:100%;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.55rem .7rem;background:white;color:inherit}.dark .usage-field{background:rgb(15 23 42);border-color:rgb(51 65 85)}`}</style>
    </div>
  );
}