import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { EQUIPMENT_DURATION_FIELD } from "./channelConstants";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function ChannelEquipmentPanel({ project, selections, catalog, onChange }) {
  const setRow = (idx, patch) =>
    onChange({
      selected_equipment: (project.selected_equipment || []).map((e, i) =>
        i === idx ? { ...e, ...patch } : e
      ),
    });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-900">Install Equipment</h2>

      {selections.map((sel, idx) => {
        const mode = EQUIPMENT_DURATION_FIELD[sel.pricing_mode] || EQUIPMENT_DURATION_FIELD.per_day;
        return (
          <div key={idx} className="rounded-lg border border-gray-200 p-3 space-y-2 bg-slate-50">
            <div className="flex items-center gap-2">
              <select
                value={sel.equipment_id || ""}
                onChange={(e) => setRow(idx, { equipment_id: e.target.value })}
                className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-white px-2 text-sm"
              >
                <option value="">— select equipment —</option>
                {catalog.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.equipment_name}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  onChange({ selected_equipment: project.selected_equipment.filter((_, i) => i !== idx) })
                }
                className="text-gray-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-gray-500">
                {mode.label}
                <Input
                  type="number"
                  disabled={!mode.scales}
                  value={sel.duration ?? 1}
                  onChange={(e) => setRow(idx, { duration: parseFloat(e.target.value) || 0 })}
                />
              </label>
              <label className="text-xs text-gray-500">
                Idle hours
                <Input
                  type="number"
                  value={sel.idle_hours ?? 0}
                  onChange={(e) => setRow(idx, { idle_hours: parseFloat(e.target.value) || 0 })}
                />
              </label>
              <label className="flex items-end gap-1.5 text-xs text-gray-600 pb-2">
                <input
                  type="checkbox"
                  checked={!!sel.include_delivery}
                  onChange={(e) => setRow(idx, { include_delivery: e.target.checked })}
                />
                Delivery
              </label>
            </div>

            <div className="text-right text-xs text-gray-500">
              idle {money(sel.idle_cost)} ·{" "}
              <span className="font-semibold text-gray-900">{money(sel.total_cost)}</span>
            </div>
          </div>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({
            selected_equipment: [
              ...(project.selected_equipment || []),
              { duration: 1, idle_hours: 0, include_delivery: false },
            ],
          })
        }
      >
        <Plus className="w-4 h-4" /> Add Equipment
      </Button>
    </div>
  );
}