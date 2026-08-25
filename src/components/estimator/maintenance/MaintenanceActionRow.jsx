import React from "react";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { ACTIONS, actionLabel } from "./maintenanceConstants";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function MaintenanceActionRow({ action, materials, onChange, onRemove }) {
  const set = (patch) => onChange(patch);

  const setMaterial = (idx, patch) =>
    set({ materials: (action.materials || []).map((m, i) => (i === idx ? { ...m, ...patch } : m)) });

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2 bg-slate-50">
      <div className="flex items-center gap-2">
        <select
          value={action.action || ""}
          onChange={(e) => set({ action: e.target.value })}
          className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-white px-2 text-sm"
        >
          <option value="">— select action —</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {actionLabel(a)}
            </option>
          ))}
        </select>
        {action.rate_basis === "per_unit" && (
          <Input
            type="number"
            className="w-20 h-9"
            placeholder="units"
            value={action.unit_count ?? ""}
            onChange={(e) => set({ unit_count: parseFloat(e.target.value) || 0 })}
          />
        )}
        <button onClick={onRemove} className="text-gray-400 hover:text-red-600 p-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {(action.materials || []).map((m, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <select
            value={m.inventory_id || ""}
            onChange={(e) => setMaterial(idx, { inventory_id: e.target.value })}
            className="flex h-8 flex-1 min-w-0 rounded-md border border-input bg-white px-2 text-xs"
          >
            <option value="">— material —</option>
            {materials.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.item_name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            className="w-16 h-8 text-xs"
            value={m.quantity ?? 1}
            onChange={(e) => setMaterial(idx, { quantity: parseFloat(e.target.value) || 0 })}
          />
          <button
            onClick={() => set({ materials: action.materials.filter((_, i) => i !== idx) })}
            className="text-gray-400 hover:text-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between text-xs">
        <button
          onClick={() => set({ materials: [...(action.materials || []), { quantity: 1 }] })}
          className="flex items-center gap-1 text-gray-500 hover:text-red-600"
        >
          <Plus className="w-3.5 h-3.5" /> Material
        </button>
        <span className="text-gray-500">
          {Number(action.labor_hours || 0).toFixed(2)} hr · mat {money(action.materials_cost)} ·{" "}
          <span className="font-semibold text-gray-900">{money(action.action_total_cost)}</span>
        </span>
      </div>
    </div>
  );
}