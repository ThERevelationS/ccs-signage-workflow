import React, { useState } from "react";
import { Percent, Trash2, Pencil } from "lucide-react";
import { getModuleLabel } from "@/components/estimator/moduleRegistry";
import { money } from "@/components/estimator/aioPricing";

const Field = ({ label, ...props }) => (
  <label className="text-[10px] font-semibold tracking-wide text-gray-400 block">
    {label}
    <input
      {...props}
      className="mt-0.5 w-full h-[28px] px-2 border border-gray-200 rounded text-[12px] text-gray-800 bg-white"
    />
  </label>
);

export default function ProductRow({ line, index, percentOfTotal, onChange, onRemove, onEdit }) {
  const [open, setOpen] = useState(false);
  const set = (patch) => onChange(index, patch);
  const amount = Number(line.total_snapshot || 0) * (1 + Number(line.adjustment_percent || 0) / 100);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-red-600 truncate">
              {line.project_name || getModuleLabel(line.module_key)}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
              {getModuleLabel(line.module_key)}
            </span>
            {line.owned && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                ⚡ Built here
              </span>
            )}
          </div>
          <div className="text-[10px] text-gray-400">
            {line.section_status === "complete" ? "complete" : "in progress"}
            {line.linked_date ? ` · added ${new Date(line.linked_date).toLocaleDateString()}` : ""}
          </div>
        </div>

        <div className="text-right w-[110px] flex-shrink-0">
          <div className="text-[13px] font-bold text-gray-800">{money(amount)}</div>
          {percentOfTotal != null && (
            <div className="text-[9px] text-gray-400">{percentOfTotal.toFixed(0)}% of total</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onEdit?.(line, index)}
          className="h-[28px] px-3 border border-gray-200 rounded flex items-center gap-1 text-[12px] text-gray-700 hover:bg-gray-100"
        >
          <Pencil className="w-3 h-3" /> Edit Product
        </button>
        <button
          onClick={() => setOpen(!open)}
          title="Adjust pricing"
          className={`w-[28px] h-[28px] border rounded flex items-center justify-center ${
            open ? "border-red-300 text-red-600 bg-red-50" : "border-gray-200 text-gray-500 hover:bg-gray-100"
          }`}
        >
          <Percent className="w-3 h-3" />
        </button>
        <button
          onClick={() => onRemove(index)}
          title="Remove product"
          className="w-[28px] h-[28px] border border-gray-200 rounded flex items-center justify-center text-red-500 hover:bg-red-50"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-3 pt-1 bg-gray-50 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field
            label="SECTION COST"
            type="number"
            value={line.total_snapshot ?? 0}
            onChange={(e) => set({ total_snapshot: parseFloat(e.target.value) || 0 })}
          />
          <Field
            label="ADJUSTMENT %"
            type="number"
            value={line.adjustment_percent ?? 0}
            onChange={(e) => set({ adjustment_percent: parseFloat(e.target.value) || 0 })}
          />
          <Field
            label="QUANTITY"
            type="number"
            value={line.customer_quantity ?? 1}
            onChange={(e) => set({ customer_quantity: parseFloat(e.target.value) || 1 })}
          />
          <label className="text-[10px] font-semibold tracking-wide text-gray-400 block">
            STATUS
            <select
              value={line.section_status || "in_progress"}
              onChange={(e) => set({ section_status: e.target.value })}
              className="mt-0.5 w-full h-[28px] px-2 border border-gray-200 rounded text-[12px] text-gray-800 bg-white"
            >
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>
          </label>
          <div className="col-span-2 sm:col-span-4">
            <Field
              label="CUSTOMER DESCRIPTION"
              value={line.customer_description || ""}
              onChange={(e) => set({ customer_description: e.target.value })}
              placeholder="Shown to the customer on the quote"
            />
          </div>
        </div>
      )}
    </div>
  );
}