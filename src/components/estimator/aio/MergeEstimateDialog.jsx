import React, { useState, useEffect, useMemo } from "react";
import { X, Loader2 } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
import { estimateLineSelectionKey } from "@/components/estimator/estimateCreationService";

const lineLabel = (line, index) =>
  line?.client_product_name || line?.product_name || line?.name || `Section ${index + 1}`;

const lineTotal = (line) => {
  const total = Number(line?.total_snapshot ?? line?.quote_total ?? line?.total ?? 0);
  return Number.isFinite(total) && total > 0 ? `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
};

export default function MergeEstimateDialog({ open, currentEstimateId, onClose, onMerge }) {
  const [candidates, setCandidates] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [secondary, setSecondary] = useState(null);
  const [loadingSecondary, setLoadingSecondary] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSecondary(null);
    setSelectedKeys(new Set());
    setListError("");
    setLoadingList(true);
    (async () => {
      try {
        const rows = await staffEntities.AllInOneEstimate.filter(
          { deleted: { $ne: true } },
          "-updated_date",
          200
        );
        const list = (Array.isArray(rows) ? rows : []).filter(
          (e) => e?.id && e.id !== currentEstimateId && ["draft", "calculated"].includes(String(e.status || "draft"))
        );
        setCandidates(list);
      } catch (e) {
        setListError(e?.message || "Other estimates could not be loaded.");
      } finally {
        setLoadingList(false);
      }
    })();
  }, [open, currentEstimateId]);

  const secondaryLines = useMemo(
    () => (Array.isArray(secondary?.line_items) ? secondary.line_items : []),
    [secondary]
  );

  const pickSecondary = async (id) => {
    setLoadingSecondary(true);
    setSelectedKeys(new Set());
    try {
      const row = await staffEntities.AllInOneEstimate.get(id);
      setSecondary(row || null);
    } catch {
      setSecondary(null);
    } finally {
      setLoadingSecondary(false);
    }
  };

  const toggleLine = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const canSubmit = secondary?.id && selectedKeys.size > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onMerge({ secondary, lineItemIds: [...selectedKeys] });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white rounded-md shadow-2xl border border-gray-300 w-full max-w-lg max-h-[85vh] flex flex-col"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold tracking-wide" style={{ color: "#7a9a4b" }}>
            MERGE AN ESTIMATE INTO THIS ONE
          </h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 p-1" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto">
          <p className="text-xs text-gray-600 mb-3">
            Pick another draft estimate, choose the sections to move here. The other estimate is archived afterward with a note pointing back to this one.
          </p>

          {loadingList && <p className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading drafts…</p>}
          {listError && <p className="text-xs text-red-600">{listError}</p>}
          {!loadingList && !listError && candidates.length === 0 && (
            <p className="text-xs text-gray-500">No other draft or calculated estimates to merge.</p>
          )}

          {candidates.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded p-1 mb-3">
              {candidates.map((e) => (
                <button type="button"
                  key={e.id}
                  type="button"
                  onClick={() => pickSecondary(e.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between gap-2 ${secondary?.id === e.id ? "bg-emerald-50 border border-emerald-300" : "hover:bg-gray-50 border border-transparent"}`}
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{e.estimate_number ? `#${e.estimate_number} ` : ""}{e.project_name || "Untitled estimate"}</span>
                    <span className="block text-[10px] text-gray-500 truncate">{e.client_name || "No client"} · {e.status || "draft"}</span>
                  </span>
                  {Number(e.quote_total || 0) > 0 && <span className="text-[10px] font-semibold text-gray-600">${Number(e.quote_total).toLocaleString()}</span>}
                </button>
              ))}
            </div>
          )}

          {loadingSecondary && <p className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading sections…</p>}

          {secondary && !loadingSecondary && (
            <div className="border border-gray-200 rounded p-2">
              <p className="text-[11px] font-semibold text-gray-700 mb-1">Sections to move ({selectedKeys.size} of {secondaryLines.length} selected):</p>
              {secondaryLines.length === 0 && <p className="text-xs text-gray-500">That estimate has no sections.</p>}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {secondaryLines.map((line, index) => {
                  const key = estimateLineSelectionKey(line, index);
                  return (
                    <label key={key} className="flex items-center gap-2 text-xs px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key)}
                        onChange={() => toggleLine(key)}
                        className="w-3.5 h-3.5 accent-emerald-600"
                      />
                      <span className="flex-1 min-w-0 truncate">{lineLabel(line, index)}</span>
                      <span className="text-[10px] text-gray-500">{lineTotal(line)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-4">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="h-9 px-4 rounded bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-50"
          >
            {submitting ? "Merging…" : `Merge ${selectedKeys.size || ""} section${selectedKeys.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
