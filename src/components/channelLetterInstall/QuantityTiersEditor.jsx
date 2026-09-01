import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Layers } from "lucide-react";

// Optional volume-discount tier table. Empty tiers means: use the standard headline price.
export default function QuantityTiersEditor({ tiers, onChange, disabled }) {
  const list = Array.isArray(tiers) ? tiers : [];

  const addTier = () => {
    const last = list[list.length - 1];
    const nextMin = last ? (parseFloat(last.max_qty) || 0) + 1 : 1;
    onChange([...list, { min_qty: nextMin, max_qty: nextMin + 9, unit_cost: 0 }]);
  };

  const updateTier = (idx, patch) => {
    const next = list.map((t, i) => i === idx ? { ...t, ...patch } : t);
    onChange(next);
  };

  const removeTier = (idx) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          Volume Discount Tiers
          <span className="text-[10px] text-slate-400 font-normal">(optional)</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={addTier}
          disabled={disabled}
          className="h-6 px-2 text-xs"
        >
          <Plus className="w-3 h-3 mr-1" /> Add Tier
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">
          No tiers set. Standard pricing applies for all quantities.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-1">
            <div className="col-span-4">Min Qty</div>
            <div className="col-span-4">Max Qty</div>
            <div className="col-span-3">Unit $</div>
            <div className="col-span-1"></div>
          </div>
          {list.map((t, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <Input
                type="number" value={t.min_qty ?? ""}
                onFocus={e => e.target.select()}
                onChange={(e) => updateTier(idx, { min_qty: parseFloat(e.target.value) || 0 })}
                disabled={disabled}
                className="h-8 text-xs col-span-4"
              />
              <Input
                type="number" value={t.max_qty ?? ""}
                onFocus={e => e.target.select()}
                onChange={(e) => updateTier(idx, { max_qty: parseFloat(e.target.value) || 0 })}
                disabled={disabled}
                className="h-8 text-xs col-span-4"
              />
              <Input
                type="number" step="0.01" value={t.unit_cost ?? ""}
                onFocus={e => e.target.select()}
                onChange={(e) => updateTier(idx, { unit_cost: parseFloat(e.target.value) || 0 })}
                disabled={disabled}
                className="h-8 text-xs col-span-3"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeTier(idx)}
                disabled={disabled}
                className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 col-span-1"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}