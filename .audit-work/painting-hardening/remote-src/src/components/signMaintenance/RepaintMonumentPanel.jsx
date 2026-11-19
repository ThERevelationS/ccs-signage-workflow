// Specialized inline estimator for the Repaint action on Monument Signs.
// Lives inside ServiceItemRow and writes its config back onto the item's
// `repaint_config` object (and `paint_condition` lives there too).
//
// Inputs are persisted unchanged; the maintenanceCalculator reads them.

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Paintbrush2, Ruler, Gauge } from "lucide-react";
import {
  REPAINT_FEATURES, PAINT_CONDITION_LABELS, RETAINER_WIDTHS_IN,
  MONUMENT_LENGTH_RANGE_FT, MONUMENT_HEIGHT_RANGE_FT, MONUMENT_RETURN_DEPTH_RANGE_IN,
} from "./repaintDefaults";
import {
  defaultMonumentRepaintConfig, computeMonumentRepaint,
} from "./repaintCalculator";
import DimLetterPaintSubPanel from "./DimLetterPaintSubPanel";

// A "slider + typed input" pair that stay in sync. Range params expected: {min,max,step}.
function SliderWithInput({ value, onChange, range, unit, label, accent = "cyan" }) {
  const handleNumber = (v) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return onChange(range.min);
    onChange(Math.min(range.max, Math.max(range.min, n)));
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-[11px] uppercase tracking-wide text-slate-500">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={range.min}
            max={range.max}
            step={range.step}
            value={value}
            onChange={(e) => handleNumber(e.target.value)}
            className="h-7 w-20 text-xs tabular-nums text-right"
          />
          <span className="text-[11px] text-slate-500 font-medium w-5">{unit}</span>
        </div>
      </div>
      <Slider
        min={range.min}
        max={range.max}
        step={range.step}
        value={[Math.min(range.max, Math.max(range.min, value))]}
        onValueChange={(v) => onChange(v[0])}
        className={`[&_[role=slider]]:bg-${accent}-600 [&_[role=slider]]:border-${accent}-600`}
      />
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{range.min}{unit}</span>
        <span>{range.max}{unit}</span>
      </div>
    </div>
  );
}

export default function RepaintMonumentPanel({ item, onChange, settings }) {
  const cfg = item.repaint_config || defaultMonumentRepaintConfig();
  const setCfg = (patch) => onChange({ repaint_config: { ...cfg, ...patch } });

  const calc = computeMonumentRepaint({ ...item, repaint_config: cfg }, settings) || {};

  const toggleFeature = (id) => {
    const cur = new Set(cfg.features || []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setCfg({ features: Array.from(cur) });
  };

  return (
    <Card className="bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30 border border-amber-200 shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
            <Paintbrush2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">Repaint — Monument Sign</div>
            <div className="text-[11px] text-slate-500">Specialized inputs for monument cabinet repainting.</div>
          </div>
        </div>

        {/* Dimensions */}
        <div className="grid md:grid-cols-3 gap-4">
          <SliderWithInput
            label="Cabinet Length"
            unit="ft"
            range={MONUMENT_LENGTH_RANGE_FT}
            value={cfg.length_ft ?? 8}
            onChange={(v) => setCfg({ length_ft: v })}
            accent="amber"
          />
          <SliderWithInput
            label="Cabinet Height"
            unit="ft"
            range={MONUMENT_HEIGHT_RANGE_FT}
            value={cfg.height_ft ?? 4}
            onChange={(v) => setCfg({ height_ft: v })}
            accent="amber"
          />
          <SliderWithInput
            label="Return Depth"
            unit='"'
            range={MONUMENT_RETURN_DEPTH_RANGE_IN}
            value={cfg.return_depth_in ?? 6}
            onChange={(v) => setCfg({ return_depth_in: v })}
            accent="amber"
          />
        </div>

        {/* Mode: entire panel vs returns only */}
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Paint Scope</Label>
            <Select value={cfg.paint_mode || "entire_panel"} onValueChange={(v) => setCfg({ paint_mode: v })}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entire_panel">Entire Panel (face + returns)</SelectItem>
                <SelectItem value="returns_only">Returns / Retainers Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`paint_both_sides_${item.id || "new"}`}
                checked={cfg.paint_both_sides !== false}
                onCheckedChange={(v) => setCfg({ paint_both_sides: !!v })}
              />
              <Label htmlFor={`paint_both_sides_${item.id || "new"}`} className="text-sm cursor-pointer">
                Paint both sides
              </Label>
            </div>
          </div>
        </div>

        {/* Conditional sub-section */}
        {cfg.paint_mode === "returns_only" ? (
          <div className="bg-white border border-amber-200 rounded-lg p-3">
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Retainer Width</Label>
            <Select
              value={String(cfg.retainer_width_in ?? 2)}
              onValueChange={(v) => setCfg({ retainer_width_in: parseFloat(v) })}
            >
              <SelectTrigger className="h-9 mt-1 text-sm max-w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RETAINER_WIDTHS_IN.map(w => (
                  <SelectItem key={w} value={String(w)}>{w}" wide retainer</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="bg-white border border-amber-200 rounded-lg p-3 space-y-3">
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Face Features (affects time & paint)</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {REPAINT_FEATURES.map(f => {
                const checked = (cfg.features || []).includes(f.id);
                return (
                  <label
                    key={f.id}
                    className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all ${
                      checked ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleFeature(f.id)} />
                    <span className="text-sm">{f.label}</span>
                  </label>
                );
              })}
            </div>

            {/* When "Dimensional Letters" is a face feature, expose the
                "paint them too?" sub-panel which uses Paint Estimator rates. */}
            {(cfg.features || []).includes("dimensional_letters") && (
              <DimLetterPaintSubPanel cfg={cfg} settings={settings} onChange={setCfg} />
            )}
          </div>
        )}

        {/* Paint condition — 10-position slider */}
        <div className="bg-white border border-amber-200 rounded-lg p-3">
          <div className="flex items-baseline justify-between mb-1">
            <Label className="text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
              <Gauge className="w-3 h-3" /> Current Paint Condition
            </Label>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
              Level {cfg.paint_condition || 1} — {PAINT_CONDITION_LABELS[(cfg.paint_condition || 1) - 1]}
            </Badge>
          </div>
          <Slider
            min={1}
            max={10}
            step={1}
            value={[cfg.paint_condition || 1]}
            onValueChange={(v) => setCfg({ paint_condition: v[0] })}
            className="[&_[role=slider]]:bg-amber-600 [&_[role=slider]]:border-amber-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-0.5">
            <span>1 · Like New</span>
            <span>10 · Severe</span>
          </div>
        </div>

        {/* Calc readout */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-amber-200">
          <Stat label="Face SqFt"     value={calc.face_sqft?.toFixed(1) || "0"} icon={<Ruler className="w-3 h-3" />} />
          <Stat label="Returns SqFt"  value={calc.returns_sqft?.toFixed(1) || "0"} />
          <Stat label="Total SqFt"    value={calc.total_sqft?.toFixed(1) || "0"} accent />
          <Stat label="Paint (gal)"   value={calc.gallons?.toFixed(2) || "0"} accent />
          <Stat label="Paint Cost"    value={`$${(calc.paint_material_cost || 0).toFixed(2)}`} />
          <Stat label="Coats"         value={`${calc.primerCoats || 0}+${calc.finishCoats || 0}`} />
          <Stat label="Feature ×"     value={(calc.feature_multiplier || 1).toFixed(2)} />
          <Stat label="Condition ×"   value={(calc.condition_multiplier || 1).toFixed(2)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent, icon }) {
  return (
    <div className={`rounded-md px-2 py-1.5 border ${accent ? "bg-amber-100 border-amber-300" : "bg-white border-slate-200"}`}>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 flex items-center gap-1">{icon}{label}</div>
      <div className={`text-sm font-bold tabular-nums ${accent ? "text-amber-800" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}