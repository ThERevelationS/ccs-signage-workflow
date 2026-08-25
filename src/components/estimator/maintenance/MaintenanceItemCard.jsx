import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import MaintenanceActionRow from "./MaintenanceActionRow";
import { SIGN_TYPES, sizesFor, isCabinetType } from "./maintenanceConstants";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function MaintenanceItemCard({ item, index, materials, onChange, onRemove }) {
  const set = (patch) => onChange(index, patch);
  const cabinet = isCabinetType(item.sign_type);

  const setAction = (aIdx, patch) =>
    set({ actions: (item.actions || []).map((a, i) => (i === aIdx ? { ...a, ...patch } : a)) });

  const materialOptions = materials.filter(
    (m) => !m.applies_to_item_types?.length || m.applies_to_item_types.includes(item.sign_type)
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Input
          value={item.description || ""}
          placeholder="Sign description (e.g. front elevation letters)"
          onChange={(e) => set({ description: e.target.value })}
        />
        <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-600 p-2">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">
          Sign type
          <select
            value={item.sign_type || ""}
            onChange={(e) => set({ sign_type: e.target.value, size: "" })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">— select —</option>
            {SIGN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-500">
          {cabinet ? "Cabinet size" : "Letter size"}
          <select
            value={item.size || ""}
            onChange={(e) => set({ size: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">— select —</option>
            {sizesFor(item.sign_type).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {!cabinet && (
          <label className="text-xs text-gray-500">
            # Letters
            <Input
              type="number"
              value={item.qty_letters ?? 1}
              onChange={(e) => set({ qty_letters: parseFloat(e.target.value) || 0 })}
            />
          </label>
        )}
        {cabinet && (
          <label className="text-xs text-gray-500">
            Face sqft
            <Input
              type="number"
              value={item.face_sqft ?? 0}
              onChange={(e) => set({ face_sqft: parseFloat(e.target.value) || 0 })}
            />
          </label>
        )}
        <label className="text-xs text-gray-500">
          # of signs
          <Input
            type="number"
            value={item.quantity ?? 1}
            onChange={(e) => set({ quantity: parseFloat(e.target.value) || 0 })}
          />
        </label>
      </div>

      <div className="space-y-2">
        {(item.actions || []).map((a, aIdx) => (
          <MaintenanceActionRow
            key={aIdx}
            action={a}
            materials={materialOptions}
            onChange={(patch) => setAction(aIdx, patch)}
            onRemove={() => set({ actions: item.actions.filter((_, i) => i !== aIdx) })}
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => set({ actions: [...(item.actions || []), { materials: [] }] })}
        >
          <Plus className="w-4 h-4" /> Add Action
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-4 text-xs text-gray-500 border-t border-gray-100 pt-2">
        <span>Labor {Number(item.labor_hours || 0).toFixed(2)} hr · {money(item.labor_cost)}</span>
        <span>Materials {money(item.materials_cost)}</span>
        <span className="font-semibold text-gray-900 ml-auto">{money(item.item_total_cost)}</span>
      </div>
    </div>
  );
}