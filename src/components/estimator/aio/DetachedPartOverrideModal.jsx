import React, { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/estimator/aioPricing";
import { typeDetails } from "@/components/estimator/parts/partCatalog";

export default function DetachedPartOverrideModal({ open, part, onClose, onSave, mode = "detached" }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !part) return;
    setForm({
      part_name: part.part_name || "Part",
      client_label: part.client_label || "",
      quantity: Number(part.quantity || 1),
      unit: part.unit || "",
      frozen_unit_cost: Number(part.frozen_unit_cost || 0),
      notes: part.notes || "",
    });
    setSaving(false);
    setError("");
  }, [open, part?.id]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const extended = Number(form.quantity || 0) * Number(form.frozen_unit_cost || 0);
  const details = typeDetails(part?.inventory_entity, part?.frozen_inventory_snapshot || {});
  const isManual = mode === "manual";

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave?.(form);
    } catch (err) {
      setError(err?.message || "The Part override could not be saved.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border border-gray-300 shadow-xl">
        <div className="bg-[#444] border-b-4 border-amber-300 px-5 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-[16px]">
              <LockKeyhole className="w-5 h-5 text-amber-300" /> {isManual ? "Edit Custom Part" : "Detached Part Override"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-gray-200 mt-1">{isManual ? "This Part belongs directly to the Product and keeps its Master Inventory snapshot and frozen quote cost." : "This Part is frozen independently and will not be overwritten when the Builder is saved."}</p>
        </div>
        <form onSubmit={submit} className="p-5 bg-white space-y-4">
          {details.length > 0 && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">TYPE-SPECIFIC INVENTORY DETAILS</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 text-[10px]">
                {details.map((detail) => (
                  <div key={detail.field} className="flex justify-between gap-3 border-b border-gray-100 pb-1">
                    <span className="text-gray-500">{detail.label}</span>
                    <strong className="text-right text-gray-800">{Array.isArray(detail.value) ? detail.value.join(", ") : String(detail.value).replace(/_/g, " ")}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">PART NAME<input value={form.part_name || ""} onChange={(e) => set("part_name", e.target.value)} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">CLIENT LABEL<input value={form.client_label || ""} onChange={(e) => set("client_label", e.target.value)} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">QUANTITY<input type="number" step="any" min="0" value={form.quantity ?? 0} onChange={(e) => set("quantity", Number(e.target.value))} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">UNIT<input value={form.unit || ""} onChange={(e) => set("unit", e.target.value)} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">FROZEN UNIT COST<input type="number" step="any" value={form.frozen_unit_cost ?? 0} onChange={(e) => set("frozen_unit_cost", Number(e.target.value))} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2"><div className="text-[9px] font-bold tracking-wide text-gray-400">NEW FROZEN EXTENDED</div><div className="text-[15px] font-bold text-gray-900 mt-1">{money(extended)}</div></div>
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">PART NOTES<textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} className="mt-1 w-full border border-gray-300 rounded px-2 py-2 text-[12px]" /></label>
          </div>
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">{isManual ? "This is an explicit Product Part edit. Its frozen cost changes immediately; future Master Inventory changes remain separate until Update Price is accepted." : "Saving this override changes the Product frozen total by only this Part's cost difference. It does not update or recalculate the Builder."}</div>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[12px] font-semibold text-gray-700">Cancel</button>
            <button type="submit" disabled={saving} className="h-[32px] px-4 rounded border border-amber-400 bg-amber-200 text-[12px] font-bold text-gray-900 hover:bg-amber-300 disabled:opacity-50">{saving ? "Saving…" : isManual ? "Save Part" : "Save Detached Override"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
