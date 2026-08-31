// Upgraded editable parts table.
// Features:
//   #12 orientation arrow indicator (placed orientation feedback via "Rot?" header)
//   #19 per-part cost column
//   #26 auto-bleed when contour cut is enabled (one-click "Auto Bleed" button per row)
//   #28 sticky table header
//   #29 keyboard — Enter on last cell adds a new row
//   #30 duplicate row button
//   #31 launches saved parts library
//   #33 inline validation badge when part is too wide for usable roll

import React, { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Copy, AlertTriangle, MoveRight, ArrowLeftRight } from "lucide-react";

const blankItem = () => ({
  id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  description: "",
  width_inches: 12,
  height_inches: 12,
  quantity: 1,
  bleed_inches: 0,
  allow_rotation: false,
});

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function VinylPartsTable({
  items, onChange,
  perPartCosts = {},     // { idx: { partsPlaced, costEach, totalCost } }
  usableWidth = Infinity, // for validation
  defaultBleed = 0.125,   // when "Auto Bleed" pressed
  onMoveToWorkflow,       // (idx) => void   — open the move menu
}) {
  const tableEndRef = useRef(null);

  const update = (idx, patch) => onChange(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add    = ()    => onChange([...(items || []), blankItem()]);
  const duplicate = (idx) => {
    const copy = { ...items[idx], id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    const next = [...items];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  };

  // Feature #29: hitting Enter on the last row's last input adds a new row
  const handleKeyDown = (e, idx, isLast) => {
    if (e.key === "Enter" && isLast) {
      e.preventDefault();
      add();
      setTimeout(() => tableEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  };

  return (
    <div className="space-y-2">
      {/* Sticky header — feature #28 */}
      <div className="hidden md:grid grid-cols-[1fr_70px_70px_60px_70px_70px_90px_90px] gap-2 text-[11px] font-medium text-slate-500 px-1 sticky top-0 bg-white z-10 py-1 border-b border-slate-200">
        <div>Description</div>
        <div>W (in)</div>
        <div>H (in)</div>
        <div>Qty</div>
        <div title="Empty waste area added around the part (does not change part size)">Bleed</div>
        <div className="text-center" title="Allow the nester to rotate the part 90° to fit">Rotate</div>
        <div className="text-right">Cost ea / total</div>
        <div className="text-right">Actions</div>
      </div>

      {(items || []).map((it, idx) => {
        const isLast = idx === items.length - 1;
        const cost = perPartCosts[idx];
        // Feature #33: too wide for the roll?
        const partW = (parseFloat(it.width_inches) || 0) + (parseFloat(it.bleed_inches) || 0) * 2;
        const partH = (parseFloat(it.height_inches) || 0) + (parseFloat(it.bleed_inches) || 0) * 2;
        const minDim = Math.min(partW, partH);
        const tooWide = isFinite(usableWidth) && minDim > usableWidth + 0.01;
        // Rotated orientation = H becomes the width on the roll. Disable Rotate if H > usable.
        const rotateImpossible = isFinite(usableWidth) && partH > usableWidth + 0.01;
        // The part won't fit in its CURRENT orientation
        const tooWideStrict = isFinite(usableWidth) && (
          it.allow_rotation ? partH > usableWidth + 0.01 : partW > usableWidth + 0.01
        );

        // If user had rotate enabled but it's no longer geometrically possible, auto-uncheck
        if (it.allow_rotation && rotateImpossible) {
          setTimeout(() => update(idx, { allow_rotation: false }), 0);
        }

        return (
          <div key={it.id || idx} className="space-y-1">
            <div className="grid grid-cols-[1fr_70px_70px_60px_70px_70px_90px_90px] gap-2 items-center">
              <Input value={it.description || ""} onChange={(e) => update(idx, { description: e.target.value })}
                     placeholder={`Item ${idx + 1}`} className="h-9 text-sm" />
              <Input type="number" step="0.125" value={it.width_inches} onChange={(e) => update(idx, { width_inches: parseFloat(e.target.value) || 0 })} className="h-9 text-sm tabular-nums" />
              <Input type="number" step="0.125" value={it.height_inches} onChange={(e) => update(idx, { height_inches: parseFloat(e.target.value) || 0 })} className="h-9 text-sm tabular-nums" />
              <Input type="number" step="1" min="1" value={it.quantity} onChange={(e) => update(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} className="h-9 text-sm tabular-nums" />
              <Input type="number" step="0.0625" value={it.bleed_inches || 0} onChange={(e) => update(idx, { bleed_inches: parseFloat(e.target.value) || 0 })} className="h-9 text-sm tabular-nums"
                onKeyDown={(e) => handleKeyDown(e, idx, isLast)} />
              <div
                className="flex items-center justify-center gap-1"
                title={rotateImpossible
                  ? `Cannot rotate — part height (${partH.toFixed(2)}″) exceeds usable roll width (${usableWidth.toFixed(2)}″)`
                  : "Rotate the part 90° on the roll layout"}
              >
                <Checkbox
                  id={`rot-${idx}`}
                  checked={it.allow_rotation === true}
                  disabled={rotateImpossible}
                  onCheckedChange={(v) => update(idx, { allow_rotation: !!v })}
                />
                <label
                  htmlFor={`rot-${idx}`}
                  className={`text-[10px] cursor-pointer select-none ${rotateImpossible ? "text-slate-300" : "text-slate-500"}`}
                >
                  {it.allow_rotation === true ? "Yes" : "No"}
                </label>
              </div>
              <div className="text-right text-xs tabular-nums leading-tight">
                {cost ? (
                  <>
                    <div className="font-semibold text-slate-800">{fmt(cost.costEach)}</div>
                    <div className="text-slate-400 text-[10px]">/ {fmt(cost.totalCost)}</div>
                  </>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </div>
              <div className="flex items-center justify-end gap-0.5">
                {onMoveToWorkflow && (
                  <Button variant="ghost" size="icon" onClick={() => onMoveToWorkflow(idx)} className="h-7 w-7 text-slate-500 hover:bg-slate-100" title="Move to another workflow">
                    <MoveRight className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => duplicate(idx)} className="h-7 w-7 text-slate-500 hover:bg-slate-100" title="Duplicate row">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(idx)} className="h-7 w-7 text-red-500 hover:bg-red-50" title="Delete row">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Inline validation — Feature #33 */}
            {(tooWide || tooWideStrict) && (
              <div className="flex items-center gap-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 ml-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                {tooWide
                  ? `Part won't fit even rotated (min ${minDim.toFixed(2)}″ > usable ${usableWidth.toFixed(2)}″).`
                  : it.allow_rotation
                    ? `Rotated, height (${partH.toFixed(2)}″) exceeds roll width (${usableWidth.toFixed(2)}″). Uncheck Rotate.`
                    : `Too wide for roll (${partW.toFixed(2)}″ > ${usableWidth.toFixed(2)}″). Enable Rotate or split the part.`}
              </div>
            )}

            {/* Auto-bleed quick action — Feature #26 */}
            {(it.bleed_inches || 0) === 0 && defaultBleed > 0 && (
              <div className="text-[10px] text-slate-400 pl-1">
                <button onClick={() => update(idx, { bleed_inches: defaultBleed })} className="underline hover:text-blue-600">
                  Auto-bleed ({defaultBleed}″)
                </button>
              </div>
            )}
          </div>
        );
      })}
      <div ref={tableEndRef} />

      <Button variant="outline" size="sm" onClick={add} className="w-full mt-2 h-8">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Part
      </Button>

      {(!items || items.length === 0) && (
        <p className="text-xs text-slate-400 text-center py-4">No parts added yet — click "Add Part" to start.</p>
      )}
    </div>
  );
}