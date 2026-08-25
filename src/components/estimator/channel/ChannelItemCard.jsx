import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { INSTALL_TYPES, LETTER_SIZES, DIFFICULTY_FACTORS } from "./channelConstants";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function ChannelItemCard({ item, index, materials, onChange, onRemove }) {
  const set = (patch) => onChange(index, patch);
  const options = materials.filter(
    (m) => !m.applies_to_list?.length || m.applies_to_list.includes(item.install_type)
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Input
          value={item.description || ""}
          placeholder="Sign / elevation description"
          onChange={(e) => set({ description: e.target.value })}
        />
        <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-600 p-2">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">
          Install type
          <select
            value={item.install_type || ""}
            onChange={(e) => set({ install_type: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {INSTALL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Letter size
          <select
            value={item.letter_size || ""}
            onChange={(e) => set({ letter_size: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {LETTER_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-xs text-gray-500">
          # Letters
          <Input
            type="number"
            value={item.qty_letters ?? 1}
            onChange={(e) => set({ qty_letters: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Install height (ft)
          <Input
            type="number"
            value={item.install_height_feet ?? 0}
            onChange={(e) => set({ install_height_feet: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Raceway (ft)
          <Input
            type="number"
            value={item.raceway_length_feet ?? 0}
            onChange={(e) => set({ raceway_length_feet: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Min/letter override
          <Input
            type="number"
            placeholder="auto"
            value={item.minutes_per_letter_override ?? ""}
            onChange={(e) => set({ minutes_per_letter_override: parseFloat(e.target.value) || 0 })}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        {DIFFICULTY_FACTORS.map((d) => (
          <label key={d.key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={!!item[d.key]}
              onChange={(e) => set({ [d.key]: e.target.checked })}
            />
            {d.label}
          </label>
        ))}
      </div>

      <div className="space-y-2">
        {(item.materials || []).map((m, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select
              value={m.inventory_id || ""}
              onChange={(e) =>
                set({
                  materials: item.materials.map((x, i) =>
                    i === idx ? { ...x, inventory_id: e.target.value } : x
                  ),
                })
              }
              className="flex h-8 flex-1 min-w-0 rounded-md border border-input bg-white px-2 text-xs"
            >
              <option value="">— install material —</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.item_name}
                </option>
              ))}
            </select>
            <button
              onClick={() => set({ materials: item.materials.filter((_, i) => i !== idx) })}
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => set({ materials: [...(item.materials || []), {}] })}
        >
          <Plus className="w-4 h-4" /> Material
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-4 text-xs text-gray-500 border-t border-gray-100 pt-2">
        <span>
          Labor {Number(item.labor_hours || 0).toFixed(2)} hr · {money(item.labor_cost)}
        </span>
        <span>Materials {money(item.materials_cost)}</span>
        <span className="font-semibold text-gray-900 ml-auto">{money(item.item_total_cost)}</span>
      </div>
    </div>
  );
}