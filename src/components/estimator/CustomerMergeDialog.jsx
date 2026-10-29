import React, { useMemo, useState } from "react";
import { X, Loader2, ArrowRight } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";

const name = (c) => c?.company_name || c?.display_name || c?.customer_name || c?.client_name || "Unnamed customer";
const norm = (v) => String(v || "").trim().toLowerCase();

// Merge two Customer records: linked estimates and work orders are relinked
// to the kept customer, then the losing record is marked merged + inactive
// (kept for audit — never hard-deleted from this dialog).
export default function CustomerMergeDialog({ open, customers = [], onClose, onMerged }) {
  const [keepId, setKeepId] = useState("");
  const [loseId, setLoseId] = useState("");
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = useMemo(
    () => customers.filter((c) => c?.id && !c.merged_into_customer_id && c.deleted !== true),
    [customers]
  );
  const keep = active.find((c) => c.id === keepId);
  const lose = active.find((c) => c.id === loseId);

  const duplicates = useMemo(() => {
    const byName = new Map();
    for (const c of active) {
      const key = norm(name(c));
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(c);
    }
    return [...byName.values()].filter((g) => g.length > 1);
  }, [active]);

  if (!open) return null;

  const scanLinks = async (loseCustomer) => {
    setScanning(true);
    setPreview(null);
    try {
      const [byId, byName] = await Promise.all([
        staffEntities.AllInOneEstimate.filter({ customer_id: loseCustomer.id }, null, 500).catch(() => []),
        staffEntities.AllInOneEstimate.filter({ client_name: name(loseCustomer) }, null, 500).catch(() => []),
      ]);
      const workOrders = await staffEntities.WorkOrder.filter({ customer_id: loseCustomer.id }, null, 500).catch(() => []);
      const ids = new Set();
      for (const e of [...(byId || []), ...(byName || [])]) if (e?.id) ids.add(e.id);
      setPreview({ estimates: ids.size, workOrders: (workOrders || []).length });
    } finally {
      setScanning(false);
    }
  };

  const confirmMerge = async () => {
    if (!keep?.id || !lose?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const keepName = name(keep);
      await staffEntities.AllInOneEstimate.updateMany(
        { customer_id: lose.id },
        { customer_id: keep.id, client_name: keepName }
      );
      await staffEntities.AllInOneEstimate.updateMany(
        { client_name: name(lose), customer_id: { $ne: keep.id } },
        { customer_id: keep.id, client_name: keepName }
      ).catch(() => null);
      await staffEntities.WorkOrder.updateMany(
        { customer_id: lose.id },
        { customer_id: keep.id }
      ).catch(() => null);
      await staffEntities.Customer.updateMany(
        { id: lose.id },
        { merged_into_customer_id: keep.id, customer_status: "inactive" }
      );
      onMerged?.({ keep, lose });
      onClose();
    } catch (e) {
      setError(e?.message || "The merge could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-md shadow-2xl border border-gray-300 w-full max-w-md" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold tracking-wide" style={{ color: "#7a9a4b" }}>MERGE CUSTOMERS</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 p-1" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 pb-4 space-y-3">
          <p className="text-xs text-gray-600">
            Pick which customer to keep. Linked estimates and work orders move to it; the other record is marked merged and inactive (kept for audit, not deleted).
          </p>
          {duplicates.length > 0 && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {duplicates.length} possible duplicate group{duplicates.length === 1 ? "" : "s"}: {duplicates.map((g) => name(g[0])).slice(0, 3).join(" · ")}
            </p>
          )}
          <label className="block text-[11px] font-bold text-gray-600">
            KEEP (records move here)
            <select value={keepId} onChange={(e) => { setKeepId(e.target.value); setPreview(null); }} className="mt-1 w-full h-9 px-2 border border-gray-300 rounded text-sm font-normal">
              <option value="">Select customer…</option>
              {active.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-bold text-gray-600">
            MERGE INTO IT (this record is retired)
            <select
              value={loseId}
              onChange={(e) => { setLoseId(e.target.value); setPreview(null); if (e.target.value) scanLinks(active.find((c) => c.id === e.target.value)); }}
              className="mt-1 w-full h-9 px-2 border border-gray-300 rounded text-sm font-normal"
            >
              <option value="">Select customer…</option>
              {active.filter((c) => c.id !== keepId).map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
            </select>
          </label>
          {keep && lose && (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700">
              <div className="flex items-center gap-2 font-semibold">
                <span className="truncate">{name(lose)}</span>
                <ArrowRight className="w-3 h-3 shrink-0 text-emerald-600" />
                <span className="truncate text-emerald-800">{name(keep)}</span>
              </div>
              {scanning && <p className="mt-1 flex items-center gap-1.5 text-gray-500"><Loader2 className="w-3 h-3 animate-spin" /> Checking linked records…</p>}
              {preview && <p className="mt-1">Will relink <strong>{preview.estimates}</strong> estimate{preview.estimates === 1 ? "" : "s"} and <strong>{preview.workOrders}</strong> work order{preview.workOrders === 1 ? "" : "s"}.</p>}
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={confirmMerge}
            disabled={!keep?.id || !lose?.id || busy || scanning}
            className="h-9 px-4 rounded bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? "Merging…" : "Merge customers"}
          </button>
        </div>
      </div>
    </div>
  );
}
