import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function FoundationPolesPanel({ poles = [], options = [], items = [], onChange }) {
  const patchPole = (index, changes) =>
    onChange(poles.map((p, i) => (i === index ? { ...p, ...changes } : p)));

  const removePole = (index) => onChange(poles.filter((_, i) => i !== index));

  const addPole = () =>
    onChange([
      ...poles,
      { pole_id: options[0]?.id || "", height_inches: 120, y_offset_inches: 42, include_pole_painting: false },
    ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Poles</h2>
          <p className="text-xs text-gray-500">
            Priced on total length — height above grade plus depth in the ground.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addPole} disabled={options.length === 0}>
          <Plus className="w-4 h-4" /> Pole
        </Button>
      </div>

      {options.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No poles in the catalog yet — add them under Catalog → Pole.
        </div>
      ) : poles.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No poles on this section.
        </div>
      ) : (
        poles.map((pole, index) => (
          <div key={index} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <label className="text-xs text-gray-500 md:col-span-2">
                Pole
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={pole.pole_id || ""}
                  onChange={(e) => patchPole(index, { pole_id: e.target.value })}
                >
                  <option value="">Select pole…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.material_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Height above grade (in)
                <Input
                  type="number"
                  value={pole.height_inches ?? 0}
                  onChange={(e) => patchPole(index, { height_inches: num(e.target.value) })}
                />
              </label>
              <label className="text-xs text-gray-500">
                Depth in ground (in)
                <Input
                  type="number"
                  value={pole.y_offset_inches ?? 0}
                  onChange={(e) => patchPole(index, { y_offset_inches: num(e.target.value) })}
                />
              </label>
              <label className="text-xs text-gray-500">
                Foundation
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={pole.foundation_idx ?? ""}
                  onChange={(e) =>
                    patchPole(index, {
                      foundation_idx: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {items.map((it, i) => (
                    <option key={i} value={i}>
                      {it.description || `Foundation ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={!!pole.include_pole_painting}
                  onChange={(e) => patchPole(index, { include_pole_painting: e.target.checked })}
                />
                Paint pole
              </label>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>Pole {money(pole.pole_cost)}</span>
                <span>Paint {money(pole.pole_painting_cost)}</span>
                <span className="font-bold text-gray-900 text-sm">{money(pole.total_cost)}</span>
                <Button variant="ghost" size="icon" onClick={() => removePole(index)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}