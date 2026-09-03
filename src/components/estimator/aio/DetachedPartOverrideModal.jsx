import { useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/estimator/aioPricing";
import { typeEditFields } from "@/components/estimator/parts/partCatalog";

const displayValue = (value) => {
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === undefined || value === null || value === "") return "—";
  return String(value).replace(/_/g, " ");
};

const inputValue = (field) => {
  if (field.kind === "list") return Array.isArray(field.value) ? field.value.join(", ") : (field.value || "");
  if (field.kind === "boolean") return field.value === true ? "true" : field.value === false ? "false" : "";
  return field.value ?? "";
};

export default function DetachedPartOverrideModal({ open, part, onClose, onSave, mode = "detached" }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saveRef = useRef(false);

  useEffect(() => {
    if (!open || !part) return;
    setForm({
      part_name: part.part_name || "Part",
      client_label: part.client_label || "",
      quantity: Number(part.quantity || 1),
      unit: part.unit || "",
      frozen_unit_cost: Number(part.frozen_unit_cost || 0),
      notes: part.notes || "",
      detail_overrides: { ...(part.detail_overrides || {}) },
    });
    setSaving(false);
    setError("");
    saveRef.current = false;
  }, [open, part?.id]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const detailFields = useMemo(
    () => typeEditFields(part?.inventory_entity, part?.frozen_inventory_snapshot || {}, form.detail_overrides || {}),
    [part?.inventory_entity, part?.frozen_inventory_snapshot, form.detail_overrides]
  );
  const extended = Number(form.quantity || 0) * Number(form.frozen_unit_cost || 0);
  const isManual = mode === "manual";
  const overrideCount = Object.keys(form.detail_overrides || {}).length;

  const setDetail = (field, rawValue, kind) => {
    let value = rawValue;
    if (kind === "number") value = rawValue === "" ? "" : Number(rawValue);
    if (kind === "boolean") value = rawValue === "" ? "" : rawValue === "true";
    if (kind === "list") {
      value = String(rawValue || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    setForm((current) => ({
      ...current,
      detail_overrides: { ...(current.detail_overrides || {}), [field]: value },
    }));
  };

  const resetDetail = (field) => {
    setForm((current) => {
      const next = { ...(current.detail_overrides || {}) };
      delete next[field];
      return { ...current, detail_overrides: next };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saveRef.current) return;
    saveRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave?.(form);
    } catch (err) {
      setError(err?.message || "The Part override could not be saved.");
      saveRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="sm:max-w-[980px] p-0 overflow-hidden border border-gray-300 shadow-xl">
        <div className="bg-[#444] border-b-4 border-amber-300 px-5 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-[16px]">
              <LockKeyhole className="w-5 h-5 text-amber-300" /> {isManual ? "Edit Independent Product Part" : "Detached Part Override"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-gray-200 mt-1">
            {isManual
              ? "Edit the estimate-specific Part while retaining its frozen Master Inventory source and quote pricing history."
              : "This Part is frozen independently and will not be overwritten when the Builder is saved."}
          </p>
        </div>

        <form onSubmit={submit} className="p-5 bg-white space-y-4 max-h-[78vh] overflow-y-auto">
          <section className="rounded border border-gray-200 bg-white p-4">
            <div className="text-[9px] font-extrabold tracking-widest text-gray-500 mb-3">PART INFORMATION</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">PART NAME<input value={form.part_name || ""} onChange={(e) => set("part_name", e.target.value)} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
              <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">CLIENT LABEL<input value={form.client_label || ""} onChange={(e) => set("client_label", e.target.value)} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
              <label className="text-[10px] font-bold tracking-wide text-gray-500">QUANTITY<input type="number" step="any" min="0" value={form.quantity ?? 0} onChange={(e) => set("quantity", Number(e.target.value))} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
              <label className="text-[10px] font-bold tracking-wide text-gray-500">UNIT<input value={form.unit || ""} onChange={(e) => set("unit", e.target.value)} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
              <label className="text-[10px] font-bold tracking-wide text-gray-500">FROZEN UNIT COST<input type="number" step="any" value={form.frozen_unit_cost ?? 0} onChange={(e) => set("frozen_unit_cost", Number(e.target.value))} className="mt-1 h-[32px] w-full border border-gray-300 rounded px-2 text-[12px]" /></label>
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2"><div className="text-[9px] font-bold tracking-wide text-gray-400">NEW FROZEN EXTENDED</div><div className="text-[15px] font-bold text-gray-900 mt-1">{money(extended)}</div></div>
            </div>
          </section>

          {detailFields.length > 0 && (
            <section className="rounded border border-amber-200 bg-amber-50/30 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[9px] font-extrabold tracking-widest text-gray-600">TYPE-SPECIFIC PART DETAILS</div>
                  <div className="text-[10px] text-gray-500 mt-1">These values override this estimate Part only. The frozen Master Inventory snapshot is never rewritten.</div>
                </div>
                <button
                  type="button"
                  disabled={overrideCount === 0}
                  onClick={() => set("detail_overrides", {})}
                  className="h-[28px] px-3 rounded border border-gray-300 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 inline-flex items-center gap-1"
                ><RotateCcw className="w-3 h-3" /> Reset All ({overrideCount})</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {detailFields.map((field) => (
                  <div key={field.field} className={`rounded border p-3 ${field.overridden ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-[10px] font-bold tracking-wide text-gray-600">{field.label}</label>
                      {field.overridden && (
                        <button type="button" onClick={() => resetDetail(field.field)} className="text-[9px] font-semibold text-amber-700 hover:underline">Reset</button>
                      )}
                    </div>
                    {field.kind === "boolean" ? (
                      <select value={inputValue(field)} onChange={(e) => setDetail(field.field, e.target.value, field.kind)} className="h-[32px] w-full border border-gray-300 rounded px-2 text-[11px] bg-white">
                        <option value="">Use Master Inventory value</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        type={field.kind === "number" ? "number" : "text"}
                        step={field.kind === "number" ? "any" : undefined}
                        value={inputValue(field)}
                        onChange={(e) => setDetail(field.field, e.target.value, field.kind)}
                        className="h-[32px] w-full border border-gray-300 rounded px-2 text-[11px] bg-white"
                        placeholder={field.kind === "list" ? "Comma-separated values" : ""}
                      />
                    )}
                    <div className="mt-1.5 text-[9px] text-gray-400">Master Inventory: <span className="font-medium text-gray-500">{displayValue(field.inherited)}</span></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded border border-gray-200 bg-white p-4">
            <label className="text-[10px] font-bold tracking-wide text-gray-500 block">PART NOTES<textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} className="mt-1 w-full border border-gray-300 rounded px-2 py-2 text-[12px]" /></label>
          </section>

          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
            {isManual
              ? "This is an explicit Product Part edit. Frozen cost changes are audited immediately; type-specific overrides remain estimate-only; future Master Inventory pricing remains separate until Update Price is accepted."
              : "Saving this override changes the Product frozen total only by this Part's cost difference. It does not update or recalculate the Builder. Type-specific overrides remain estimate-only until the Part is reattached."}
          </div>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 sticky bottom-0 bg-white pt-2 border-t border-gray-100">
            <button type="button" disabled={saving} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[12px] font-semibold text-gray-700">Cancel</button>
            <button type="submit" disabled={saving} className="h-[32px] px-4 rounded border border-amber-400 bg-amber-200 text-[12px] font-bold text-gray-900 hover:bg-amber-300 disabled:opacity-50">{saving ? "Saving…" : isManual ? "Save Part" : "Save Detached Override"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
