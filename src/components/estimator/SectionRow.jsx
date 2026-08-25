import React from "react";
import { Input } from "@/components/ui/input";
import { Trash2, Layers } from "lucide-react";
import { getModuleLabel } from "./moduleRegistry";
import { money as fmt } from "./aioPricing";

export default function SectionRow({ line, index, onChange, onRemove }) {
  const set = (patch) => onChange(index, patch);

  return (
    <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-red-500 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-red-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate">{getModuleLabel(line.module_key)}</div>
            <div className="text-xs text-gray-400">{line.project_name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold text-gray-900">
            {fmt(Number(line.total_snapshot || 0) * (1 + Number(line.adjustment_percent || 0) / 100))}
          </div>
          <button
            onClick={() => onRemove(index)}
            className="mt-1 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
            title="Remove section"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-xs text-gray-500">
          Section cost
          <Input
            type="number"
            value={line.total_snapshot ?? 0}
            onChange={(e) => set({ total_snapshot: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Adjustment %
          <Input
            type="number"
            value={line.adjustment_percent ?? 0}
            onChange={(e) => set({ adjustment_percent: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Quantity
          <Input
            type="number"
            value={line.customer_quantity ?? 1}
            onChange={(e) => set({ customer_quantity: parseFloat(e.target.value) || 1 })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Status
          <select
            value={line.section_status || "in_progress"}
            onChange={(e) => set({ section_status: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            <option value="in_progress">In progress</option>
            <option value="complete">Complete</option>
          </select>
        </label>
      </div>

      <label className="block text-xs text-gray-500 mt-3">
        Customer description
        <Input
          value={line.customer_description || ""}
          onChange={(e) => set({ customer_description: e.target.value })}
          placeholder="Shown to the customer on the quote"
        />
      </label>
    </div>
  );
}