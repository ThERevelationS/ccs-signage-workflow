import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function FoundationWallCapsPanel({ caps = [], walls = [], options = [], onChange }) {
  const patchCap = (index, changes) =>
    onChange(caps.map((c, i) => (i === index ? { ...c, ...changes } : c)));

  const removeCap = (index) => onChange(caps.filter((_, i) => i !== index));

  const addCap = () => {
    const inv = options[0];
    onChange([
      ...caps,
      {
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cap_inventory_id: inv?.id || "",
        wall_index: 0,
        segment_index: 0,
        position_along_segment_inches: 0,
        length_inches: num(inv?.cap_stock_length_inches) || 48,
        rotation_offset_degrees: 0,
        lateral_offset_inches: 0,
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Wall Caps</h2>
          <p className="text-xs text-gray-500">Full stock price is charged per cut piece.</p>
        </div>
        <Button variant="outline" size="sm" onClick={addCap} disabled={options.length === 0}>
          <Plus className="w-4 h-4" /> Cap
        </Button>
      </div>

      {options.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No wall caps in the catalog yet — add them under Catalog → Wall Cap.
        </div>
      ) : caps.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No caps on this section.
        </div>
      ) : (
        caps.map((cap, index) => (
          <div key={cap.id || index} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <label className="text-xs text-gray-500 md:col-span-2">
                Cap material
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={cap.cap_inventory_id || ""}
                  onChange={(e) => {
                    const inv = options.find((o) => o.id === e.target.value);
                    patchCap(index, {
                      cap_inventory_id: e.target.value,
                      length_inches: num(inv?.cap_stock_length_inches) || cap.length_inches,
                    });
                  }}
                >
                  <option value="">Select cap…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.material_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Wall
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={cap.wall_index ?? 0}
                  onChange={(e) => patchCap(index, { wall_index: Number(e.target.value) })}
                >
                  {walls.map((w, i) => (
                    <option key={i} value={i}>
                      {w.name || `Wall ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Cut length (in)
                <Input
                  type="number"
                  value={cap.length_inches ?? 48}
                  onChange={(e) => patchCap(index, { length_inches: Math.max(1, num(e.target.value)) })}
                />
              </label>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
              <span>
                Stock length: <span className="font-semibold text-gray-900">{cap.stock_length_inches || 0}"</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-900">{money(cap.cost)}</span>
                <Button variant="ghost" size="icon" onClick={() => removeCap(index)}>
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