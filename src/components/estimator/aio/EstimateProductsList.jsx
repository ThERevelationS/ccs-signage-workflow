import React, { useState } from "react";
import { Search } from "lucide-react";
import ProductRow from "./ProductRow";
import { ESTIMATOR_MODULES, getModuleLabel } from "@/components/estimator/moduleRegistry";
import { acceptedCustomerUnitPrice } from "@/components/estimator/customerPricing";

export default function EstimateProductsList({ lines = [], rawTotal = 0, onChange, onRemove, onEdit, onUpdatePrice, onProductRefresh, onClone, onSaveNotes, onCreateQuickProduct, onPersistSettings }) {
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");

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
        getModuleLabel(line.module_key).toLowerCase().includes(q)
      );
    });

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

      <div className="px-4 py-2 flex items-center gap-2 border-b border-gray-100">
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
      </div>

      {visible.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-gray-400">
          No products yet — add one above to start pricing this estimate.
        </div>
      ) : (
        <div className="p-2 space-y-2 bg-gray-50">
          {visible.map(({ line, index }) => (
            <ProductRow
              key={line.line_id || line.builder_product_id || line.project_id || index}
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
              allLines={lines}
            />
          ))}
        </div>
      )}
    </div>
  );
}