import React from "react";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function VinylItemCard({ item, index, vinyls, laminates, onChange, onRemove }) {
  const set = (patch) => onChange(index, patch);

  const numField = (key, label, step = "any") => (
    <label className="text-xs text-gray-500">
      {label}
      <Input
        type="number"
        step={step}
        value={item[key] ?? ""}
        onChange={(e) => set({ [key]: parseFloat(e.target.value) || 0 })}
      />
    </label>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Input
          value={item.description || ""}
          placeholder="Graphic description"
          onChange={(e) => set({ description: e.target.value })}
        />
        <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-600 p-2">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {numField("width_inches", "Width (in)")}
        {numField("height_inches", "Height (in)")}
        {numField("quantity", "Qty", "1")}
        {numField("labor_hours_each", "Labor hrs each")}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">
          Vinyl
          <select
            value={item.vinyl_id || ""}
            onChange={(e) => set({ vinyl_id: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            <option value="">— select vinyl —</option>
            {vinyls.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vinyl_name} {v.roll_width_inches ? `(${v.roll_width_inches}")` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-500">
          Laminate
          <select
            value={item.laminate_id || ""}
            onChange={(e) => set({ laminate_id: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            <option value="">None</option>
            {laminates.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vinyl_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={!!item.apply_print}
            onChange={(e) => set({ apply_print: e.target.checked })}
          />
          Printed
        </label>
        <label className="text-xs text-gray-500 flex items-center gap-2">
          Extra cost
          <Input
            type="number"
            className="w-24 h-8"
            value={item.extra_cost ?? ""}
            onChange={(e) => set({ extra_cost: parseFloat(e.target.value) || 0 })}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 border-t border-gray-100 pt-2">
        <span>Vinyl {Number(item.vinyl_sqft || 0).toFixed(1)} sqft · {money(item.vinyl_cost)}</span>
        {item.laminate_cost > 0 && <span>Laminate {money(item.laminate_cost)}</span>}
        {item.print_cost > 0 && <span>Print {money(item.print_cost)}</span>}
        <span>Labor {Number(item.labor_hours || 0).toFixed(1)} hr · {money(item.labor_cost)}</span>
        <span className="font-semibold text-gray-900 ml-auto">{money(item.item_total_cost)}</span>
      </div>
    </div>
  );
}