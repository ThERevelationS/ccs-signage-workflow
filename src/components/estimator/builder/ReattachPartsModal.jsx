import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Link2, LockKeyhole, RefreshCw, Unlink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/estimator/aioPricing";

export default function ReattachPartsModal({
  open,
  parts = [],
  builderName = "Builder",
  onKeepDetached,
  onReattach,
}) {
  const selectableIds = useMemo(
    () => parts.filter((part) => part.can_reattach).map((part) => part.id),
    [parts]
  );
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const actionRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(selectableIds));
    setSaving(false);
    setError("");
    actionRef.current = false;
  }, [open, selectableIds.join("|")]);

  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(selectableIds));
  const selectNone = () => setSelected(new Set());

  const handleReattach = async () => {
    if (!selected.size || saving || actionRef.current) return;
    actionRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onReattach?.([...selected]);
    } catch (err) {
      actionRef.current = false;
      setError(err?.message || "The selected Parts could not be reattached.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onKeepDetached?.()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden p-0 border border-gray-300 shadow-2xl">
        <div className="bg-[#3f3f3f] px-5 py-4 text-white border-b-4 border-lime-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[17px] text-white">
              <AlertTriangle className="w-5 h-5 text-amber-300" />
              Detached Parts Found
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-gray-200 mt-1 max-w-2xl">
            {builderName} has {parts.length} detached Part{parts.length === 1 ? "" : "s"}. Choose which Parts should be reattached before the Builder opens.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto max-h-[62vh] bg-gray-50">
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5 mb-3 flex items-start gap-2">
            <LockKeyhole className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] leading-5 text-amber-900">
              <strong>Frozen pricing will not change here.</strong> Reattaching only reconnects the Builder to the selected Master Inventory Part. After the Builder recalculates, you can separately choose <strong>Update Price</strong> if you want to accept current inventory pricing.
            </div>
          </div>

          {selectableIds.length > 1 && (
            <div className="flex justify-end gap-2 mb-2">
              <button type="button" onClick={selectAll} className="text-[11px] font-semibold text-gray-600 hover:text-gray-900">
                Select all matches
              </button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={selectNone} className="text-[11px] font-semibold text-gray-600 hover:text-gray-900">
                Select none
              </button>
            </div>
          )}

          <div className="space-y-2">
            {parts.map((part) => {
              const enabled = !!part.can_reattach;
              const checked = selected.has(part.id);
              return (
                <label
                  key={part.id}
                  className={`block rounded border p-3 ${enabled ? "bg-white border-gray-200 cursor-pointer hover:border-lime-400" : "bg-gray-100 border-gray-200 cursor-not-allowed opacity-80"}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!enabled || saving}
                      onChange={() => toggle(part.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 accent-lime-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-[13px] text-gray-900 truncate">{part.part_name || part.inventory_item_name || "Part"}</div>
                        <div className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">
                          Frozen {money(Number(part.frozen_extended_cost || 0))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_24px_1fr] gap-1 sm:gap-2 items-center mt-2">
                        <div className="rounded bg-red-50 border border-red-100 px-2 py-1.5 min-w-0">
                          <div className="text-[9px] font-bold tracking-wide text-red-500 uppercase">Detached From</div>
                          <div className="text-[11px] text-red-800 truncate">{part.inventory_item_name || "Original inventory record removed"}</div>
                        </div>
                        <div className="hidden sm:flex justify-center">
                          {enabled ? <Link2 className="w-4 h-4 text-lime-600" /> : <Unlink className="w-4 h-4 text-gray-400" />}
                        </div>
                        <div className={`rounded border px-2 py-1.5 min-w-0 ${enabled ? "bg-lime-50 border-lime-200" : "bg-gray-50 border-gray-200"}`}>
                          <div className={`text-[9px] font-bold tracking-wide uppercase ${enabled ? "text-lime-700" : "text-gray-500"}`}>
                            {enabled ? "Suggested Reattach" : "No Exact Match Found"}
                          </div>
                          <div className="text-[11px] text-gray-800 truncate">
                            {part.reattach_candidate_name || "Keep detached and switch this Part manually later"}
                          </div>
                        </div>
                      </div>

                      {!enabled && (
                        <div className="text-[10px] text-gray-500 mt-1.5">
                          This Part cannot be automatically reattached because there is no exact-name Master Inventory replacement.
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {error && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-white border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onKeepDetached}
            className="h-[34px] px-4 rounded border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep Detached & Open Builder
          </button>
          <button
            type="button"
            disabled={saving || selected.size === 0}
            onClick={handleReattach}
            className="h-[34px] px-4 rounded border border-lime-400 bg-lime-200 text-[12px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
            {saving ? "Reattaching…" : `Reattach Selected (${selected.size}) & Open Builder`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
