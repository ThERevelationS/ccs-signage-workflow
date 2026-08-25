import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";

export default function FoundationEquipmentPanel({ equipment, options, onChange }) {
  const update = (index, patch) =>
    onChange(equipment.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const add = () =>
    onChange([
      ...equipment,
      { equipment_id: options[0]?.id || "", rental_period: "day", rental_duration: 1, include_delivery: false },
    ]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Equipment</h2>
        <Button variant="outline" size="sm" onClick={add} disabled={options.length === 0}>
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {options.length === 0 && (
        <p className="text-sm text-gray-500">No excavation equipment in the foundation catalog yet.</p>
      )}

      <div className="space-y-2">
        {equipment.map((row, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 items-center">
            <select
              value={row.equipment_id || ""}
              onChange={(e) => update(index, { equipment_id: e.target.value })}
              className="col-span-5 flex h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.material_name}
                </option>
              ))}
            </select>
            <select
              value={row.rental_period || "day"}
              onChange={(e) => update(index, { rental_period: e.target.value })}
              className="col-span-2 flex h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
            <Input
              type="number"
              className="col-span-2"
              value={row.rental_duration ?? 1}
              onChange={(e) => update(index, { rental_duration: parseFloat(e.target.value) || 1 })}
            />
            <label className="col-span-2 flex items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={!!row.include_delivery}
                onChange={(e) => update(index, { include_delivery: e.target.checked })}
              />
              Delivery
            </label>
            <button
              onClick={() => onChange(equipment.filter((_, i) => i !== index))}
              className="col-span-1 text-gray-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="col-span-12 text-right text-xs text-gray-500 -mt-1">
              {money(row.equipment_cost)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}