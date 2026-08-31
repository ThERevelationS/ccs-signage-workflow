import React, { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function MovePartGroupModal({ open, group, sourceBuilderProductId, products = [], onClose, onMove }) {
  const targets = useMemo(
    () => (products || []).filter((line) => line.builder_product_id && line.builder_product_id !== sourceBuilderProductId),
    [products, sourceBuilderProductId]
  );
  const [targetId, setTargetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTargetId(targets[0]?.builder_product_id || "");
    setSaving(false);
    setError("");
  }, [open, targets.length]);

  const submit = async () => {
    if (!targetId) return;
    setSaving(true);
    setError("");
    try {
      await onMove?.(targetId);
    } catch (err) {
      setError(err?.message || "Part Group could not be moved.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden border border-gray-300 shadow-xl">
        <div className="bg-[#444] border-b-4 border-lime-300 px-5 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-[16px]"><ArrowRightLeft className="w-5 h-5 text-lime-300" /> Move Part Group</DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-gray-200 mt-1">Moves the entire group and all child Parts as one unit. Frozen/current pricing moves with it.</p>
        </div>
        <div className="p-5 bg-white space-y-4">
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-[9px] font-bold tracking-widest text-gray-400">GROUP</div>
            <div className="text-[13px] font-bold text-gray-900 mt-1">{group?.group_name || "Part Group"}</div>
          </div>
          <label className="block text-[10px] font-bold tracking-wide text-gray-500">
            MOVE TO PRODUCT
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="mt-1 h-[34px] w-full border border-gray-300 rounded bg-white px-2 text-[12px] text-gray-800">
              {targets.length === 0 && <option value="">No other Products available</option>}
              {targets.map((line) => (
                <option key={line.builder_product_id} value={line.builder_product_id}>{line.client_product_name || line.project_name || line.builder_name || "Product"}</option>
              ))}
            </select>
          </label>
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] text-blue-800">Direct Move is available only for groups made entirely from independent/manual Parts. Builder-owned Parts must use Clone or Copy so the source Builder stays internally consistent.</div>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[12px] font-semibold text-gray-700">Cancel</button>
            <button type="button" disabled={saving || !targetId} onClick={submit} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[12px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50">{saving ? "Moving…" : "Move Group"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
