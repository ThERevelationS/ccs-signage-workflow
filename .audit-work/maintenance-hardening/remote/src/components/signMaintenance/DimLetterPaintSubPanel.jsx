// Sub-panel rendered inside RepaintMonumentPanel ONLY when the
// "Dimensional Letters" face-feature is checked. Lets the user opt-in to
// painting the dimensional letters, with optional 2nd-color paint mask.
//
// All rates come from the existing Paint Estimator settings — no new settings
// are introduced here. See dimLetterPaintCalculator.js for the math.

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Type, Palette, Scissors } from "lucide-react";
import { computeDimLetterPaint } from "./dimLetterPaintCalculator";

const DEFAULT_DL = {
  enabled: false,
  qty: 6,
  avg_height_in: 12,
  thickness_in: 1,
  second_color_mask: "none",
};

export default function DimLetterPaintSubPanel({ cfg, settings, onChange }) {
  const dl = { ...DEFAULT_DL, ...(cfg.dim_letter_paint || {}) };
  const setDL = (patch) => onChange({ dim_letter_paint: { ...dl, ...patch } });

  const calc = dl.enabled ? computeDimLetterPaint({ ...cfg, dim_letter_paint: dl }, settings) : null;

  return (
    <div className="bg-white border border-blue-200 rounded-lg p-3 space-y-3">
      <label className={`flex items-center gap-2 cursor-pointer rounded-md p-2 transition-colors ${dl.enabled ? "bg-blue-50" : "hover:bg-slate-50"}`}>
        <Checkbox
          checked={dl.enabled}
          onCheckedChange={(v) => setDL({ enabled: !!v })}
        />
        <Type className="w-4 h-4 text-blue-600" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-800">Paint the Dimensional Letters too?</div>
          <div className="text-[11px] text-slate-500">Uses Paint Estimator rates (mix, coverage, mask, labor).</div>
        </div>
      </label>

      {dl.enabled && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500"># of Letters</Label>
              <Input
                type="number" min="0" step="1"
                value={dl.qty}
                onChange={(e) => setDL({ qty: parseFloat(e.target.value) || 0 })}
                className="h-8 mt-1 text-sm tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">Avg Height (in)</Label>
              <Input
                type="number" min="1" step="0.5"
                value={dl.avg_height_in}
                onChange={(e) => setDL({ avg_height_in: parseFloat(e.target.value) || 0 })}
                className="h-8 mt-1 text-sm tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">Thickness (in)</Label>
              <Input
                type="number" min="0" step="0.25"
                value={dl.thickness_in}
                onChange={(e) => setDL({ thickness_in: parseFloat(e.target.value) || 0 })}
                className="h-8 mt-1 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
              <Palette className="w-3 h-3" /> Second Color / Accent
            </Label>
            <Select
              value={dl.second_color_mask || "none"}
              onValueChange={(v) => setDL({ second_color_mask: v })}
            >
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Single Color — No Mask Needed</SelectItem>
                <SelectItem value="paint_mask">Second Color — Requires Paint Mask</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-[11px] text-slate-500 mt-1">
              Paint Mask uses your Paint Estimator's mask rates (material + plotter + weed + apply labor).
            </div>
          </div>

          {calc && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-blue-100">
              <Stat label="Letter Face SqFt"  value={calc.letters_face_sqft.toFixed(2)} />
              <Stat label="Letter Return SqFt" value={calc.letters_returns_sqft.toFixed(2)} />
              <Stat label="Letter Paint Cost"  value={`$${calc.letters_paint_cost.toFixed(2)}`} accent />
              <Stat label="Letter Labor"       value={`${calc.letters_labor_hours.toFixed(2)} hr`} />
              {dl.second_color_mask === "paint_mask" && (
                <>
                  <Stat label="Mask SqFt"      value={calc.mask_sqft.toFixed(2)} icon={<Scissors className="w-3 h-3" />} />
                  <Stat label="Mask Material"  value={`$${calc.mask_material_cost.toFixed(2)}`} />
                  <Stat label="Mask Labor"     value={`$${(calc.mask_weed_labor_cost + calc.mask_apply_labor_cost).toFixed(2)}`} />
                  <Stat label="Mask Total"     value={`$${calc.mask_total_cost.toFixed(2)}`} accent />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent, icon }) {
  return (
    <div className={`rounded-md px-2 py-1.5 border ${accent ? "bg-blue-100 border-blue-300" : "bg-slate-50 border-slate-200"}`}>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 flex items-center gap-1">{icon}{label}</div>
      <div className={`text-sm font-bold tabular-nums ${accent ? "text-blue-800" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}