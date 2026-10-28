import { useEffect, useRef, useState } from "react";
import { estimateLineSelectionKey } from "@/components/estimator/estimateCreationService";
import { Search } from "lucide-react";
import ProductRow from "./ProductRow";
import { ESTIMATOR_MODULES, getModuleLabel } from "@/components/estimator/moduleRegistry";
import { acceptedCustomerUnitPrice } from "@/components/estimator/customerPricing";
import { money } from "@/components/estimator/aioPricing";
import { loadProductionProductTypes } from "@/components/estimator/productionProductTypes";

export default function EstimateProductsList({ lines = [], rawTotal = 0, onChange, onRemove, onEdit, onUpdatePrice, onProductRefresh, onClone, onSaveNotes, onCreateQuickProduct, onPersistSettings, onSplit, readOnly = false }) {
  const [query, setQuery] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitIds, setSplitIds] = useState(() => new Set());
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState("");
  const splittingRef = useRef(false);
  const selectionSnapshot = JSON.stringify(lines);
  useEffect(() => {
    setSplitIds(new Set());
    setSplitError("");
  }, [selectionSnapshot, readOnly]);

  const submitSplit = async () => {
    if (splittingRef.current || readOnly || !splitIds.size) return;
    splittingRef.current = true;
    setSplitting(true);
    setSplitError("");
    try {
      const success = await onSplit([...splitIds]);
      if (success === false) return;
      setSplitMode(false);
      setSplitIds(new Set());
    } catch (error) {
      setSplitError(error?.message || "The selected products could not be copied. Try again.");
    } finally {
      splittingRef.current = false;
      setSplitting(false);
    }
  };
  const toggleSplitId = (id) => setSplitIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const [moduleFilter, setModuleFilter] = useState("all");
  const [productionProductTypes, setProductionProductTypes] = useState([]);

  useEffect(() => {
    let active = true;
    loadProductionProductTypes().then((items) => active && setProductionProductTypes(items));
    return () => { active = false; };
  }, []);

  const complete = lines.filter((l) => l.section_status === "complete").length;

  const visible = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      if (moduleFilter !== "all" && line.module_key !== moduleFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (line.project_name || "").toLowerCase().includes(q) ||
        (line.client_product_name || "").toLowerCase().includes(q) ||
        (line.builder_name || "").toLowerCase().includes(q) ||
        (line.product_category || "").toLowerCase().includes(q) ||
        (line.production_product_type || "").toLowerCase().includes(q) ||
        getModuleLabel(line.module_key).toLowerCase().includes(q)
      );
    });

  const visibleSubtotal = visible.reduce((sum, { line }) => {
    const quantity = Math.max(0, Number(line.customer_quantity ?? 1) || 0);
    return sum + acceptedCustomerUnitPrice(line) * quantity * (1 + Number(line.adjustment_percent || 0) / 100);
  }, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-md">
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold tracking-wider text-red-600">
          ESTIMATE PRODUCTS ({lines.length})
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">
          ⇄ Live-synced with source estimators
        </span>
      </div>

      <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-gray-100">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full h-[30px] pl-7 pr-2 border border-gray-200 rounded text-[12px]"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="h-[30px] px-2 border border-gray-200 rounded text-[12px] text-gray-600 bg-white"
        >
          <option value="all">All product types</option>
          <option value="custom">Custom Products</option>
          {ESTIMATOR_MODULES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">
          {complete}/{lines.length} products complete
        </span>
        {typeof onSplit === "function" && !readOnly && (
          splitMode ? (
            <span className="flex items-center gap-1.5">
              <button type="button" onClick={submitSplit} disabled={splitting || splitIds.size === 0} aria-busy={splitting} className="h-[30px] px-2 rounded bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-40">{splitting ? "Creating draft..." : `Copy ${splitIds.size || ""} to new draft`}</button>
              <button type="button" disabled={splitting} onClick={() => { setSplitMode(false); setSplitIds(new Set()); setSplitError(""); }} className="h-[30px] px-2 rounded border border-gray-300 bg-white text-[11px] text-gray-600">Cancel</button>
            </span>
          ) : (
            <button type="button" onClick={() => setSplitMode(true)} className="h-[30px] px-2 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:border-indigo-300">Split…</button>
          )
        )}
      </div>

      {splitMode && !readOnly && (
        <p className="px-4 py-2 text-[11px] text-gray-600" role="status">
          Select products to copy into a new draft. This estimate stays unchanged.
        </p>
      )}
      {splitError && <p className="px-4 py-2 text-[12px] text-red-700" role="alert">{splitError}</p>}
      {visible.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-gray-400">
          {lines.length === 0
            ? "No products yet — add one above to start pricing this estimate."
            : "No products match this search or filter."}
        </div>
      ) : (
        <div className="p-2 space-y-2 bg-gray-50">
          {visible.map(({ line, index }) => {
            const lineId = estimateLineSelectionKey(line, index);
            return (
            <div key={lineId} className="relative">
              {splitMode && !readOnly && (
                <label className="absolute left-1 top-1 z-10 flex items-center justify-center w-5 h-5 rounded border border-indigo-300 bg-white cursor-pointer">
                  <input type="checkbox" disabled={splitting} checked={splitIds.has(lineId)} onChange={() => toggleSplitId(lineId)} className="w-3.5 h-3.5 accent-indigo-600" aria-label={`Select ${line.client_product_name || line.project_name || line.description || `product ${index + 1}`} to split`} />
                </label>
              )}
            <ProductRow
              key={lineId}
              line={line}
              index={index}
              percentOfTotal={rawTotal > 0 ? ((acceptedCustomerUnitPrice(line) * Math.max(0, Number(line.customer_quantity ?? 1) || 0)) / rawTotal) * 100 : null}
              onChange={onChange}
              onRemove={onRemove}
              onEdit={onEdit}
              onUpdatePrice={onUpdatePrice}
              onProductRefresh={onProductRefresh}
              onClone={onClone}
              onSaveNotes={onSaveNotes}
              onCreateQuickProduct={onCreateQuickProduct}
              onPersistSettings={onPersistSettings}
              productionProductTypes={productionProductTypes}
              readOnly={readOnly}
              allLines={lines}
            />
            </div>
            );
          })}
        </div>
      )}

      {visible.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {visible.length === lines.length ? `${visible.length} products` : `${visible.length} of ${lines.length} products shown`}
          </span>
          <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">
            Sections subtotal: <span className="font-bold text-gray-900 tabular-nums">{money(visibleSubtotal)}</span>
          </span>
        </div>
      )}
    </div>
  );
}