import { useEffect, useState } from "react";
import { History, ArrowRight, PackageSearch } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/estimator/aioPricing";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const REASON_LABELS = {
  initial_freeze: "Initial freeze",
  update_price: "Update price",
  reattach: "Part reattach",
  manual_adjustment: "Manual adjustment",
  migration: "Migration",
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export default function ProductPriceHistoryModal({ open, line, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !line?.builder_product_id) return;
    let active = true;
    setLoading(true);
    setError("");
    loadAllEntityRows({
      entity: base44.entities.BuilderPriceRevision,
      query: { builder_product_id: line.builder_product_id },
      sort: "revision_number",
      label: "Product price history",
    })
      .then((result) => {
        if (!active) return;
        setRows((result || []).slice().sort((a, b) => num(b.revision_number) - num(a.revision_number)));
      })
      .catch((err) => active && setError(err?.message || "Price history could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [open, line?.builder_product_id]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose?.()}>
      <DialogContent className="sm:max-w-[820px] p-0 overflow-hidden border-gray-300 shadow-2xl">
        <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-lime-300">
          <DialogTitle className="text-white text-[16px] flex items-center gap-2">
            <History className="w-5 h-5 text-lime-300" /> Product Price History
          </DialogTitle>
          <p className="text-[11px] text-gray-300 mt-1">
            Immutable accepted-pricing revisions. Internal cost and customer selling price are shown separately.
          </p>
        </DialogHeader>

        <div className="p-4 bg-white">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold tracking-wide text-gray-400">PRODUCT</div>
              <div className="text-[13px] font-semibold text-gray-900">{line?.client_product_name || line?.project_name || "Product"}</div>
            </div>
            <div className="text-right text-[10px] text-gray-500">
              <div>Accepted internal cost <strong className="text-gray-800">{money(line?.total_snapshot || 0)}</strong></div>
              <div>Accepted customer price <strong className="text-gray-800">{money(line?.customer_price_snapshot ?? line?.total_snapshot ?? 0)}</strong></div>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-[12px] text-gray-400">Loading pricing history…</div>
          ) : error ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-3 text-[11px] text-red-700">{error}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <PackageSearch className="w-7 h-7 mx-auto mb-2 text-gray-300" />
              <div className="text-[12px]">No accepted pricing revisions have been recorded for this Product yet.</div>
            </div>
          ) : (
            <div className="border border-gray-200 rounded overflow-hidden">
              <div className="grid grid-cols-[58px_130px_1fr_1fr_110px] gap-0 bg-gray-100 border-b border-gray-200 text-[9px] font-bold tracking-wider text-gray-500">
                <div className="px-2 py-2">REV</div>
                <div className="px-2 py-2">ACTION</div>
                <div className="px-2 py-2">INTERNAL COST</div>
                <div className="px-2 py-2">CUSTOMER PRICE</div>
                <div className="px-2 py-2">PARTS</div>
              </div>
              {rows.map((row) => {
                const changedParts = Array.isArray(row.changed_parts) ? row.changed_parts.length : 0;
                return (
                  <div key={row.id} className="border-b border-gray-100 last:border-b-0">
                    <div className="grid grid-cols-[58px_130px_1fr_1fr_110px] gap-0 items-center text-[11px] text-gray-700">
                      <div className="px-2 py-2.5 font-bold text-gray-900">#{num(row.revision_number, 1)}</div>
                      <div className="px-2 py-2.5">
                        <div className="font-semibold text-gray-800">{REASON_LABELS[row.reason] || row.reason || "Revision"}</div>
                        <div className="text-[9px] text-gray-400 mt-0.5">{formatDate(row.created_date)}</div>
                      </div>
                      <div className="px-2 py-2.5 flex items-center gap-1.5 whitespace-nowrap">
                        <span>{money(row.previous_total_cost || 0)}</span>
                        <ArrowRight className="w-3 h-3 text-gray-300" />
                        <strong className="text-gray-900">{money(row.new_total_cost || 0)}</strong>
                      </div>
                      <div className="px-2 py-2.5 flex items-center gap-1.5 whitespace-nowrap">
                        <span>{money(row.previous_customer_price || 0)}</span>
                        <ArrowRight className="w-3 h-3 text-gray-300" />
                        <strong className="text-gray-900">{money(row.new_customer_price || 0)}</strong>
                      </div>
                      <div className="px-2 py-2.5">{changedParts} changed</div>
                    </div>
                    {row.notes && (
                      <div className="px-2 pb-2.5 pl-[188px] text-[10px] text-gray-500 leading-4">{row.notes}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-50">Close</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
