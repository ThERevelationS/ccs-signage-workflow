import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Box, Router, Zap, Paintbrush, Calculator, AlertCircle, Sparkles, Link as LinkIcon, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { DimensionalLetterMaterial, Settings as SettingsEntity } from "@/entities/all";
import { getActiveRates, getPaintRates, lookupCutSpeed, lookupCutMultiplier, materialCostPerSqin, PAINT_SIDES_LABELS, CUTTING_METHOD_LABELS } from "./dimensionalFabCalculator";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;
const num = (v, fb = 0) => { const n = parseFloat(v); return isNaN(n) ? fb : n; };

// Default config for a brand-new backer fab
export const emptyBackerFabConfig = () => ({
  material_id: null,
  material_name: "",
  material_thickness_inches: 0.5,
  material_cost_per_sqin: 0,
  sheet_yield_factor: 0.7,
  width_inches: 48,
  height_inches: 24,
  cut_length_override_inches: 0, // 0 = use 2*(W+H) perimeter
  cutting_method: "cnc",
  cut_speed_ipm: 50,
  setup_minutes: 15,
  cut_multiplier: 1.0,
  paint_letters: true, // applies to backer face
  paint_sides: "front_and_edges",
  num_paint_colors: 1,
  unit_material_cost: 0,
  unit_cut_cost: 0,
  unit_paint_cost: 0,
  unit_total_cost: 0,
});

// Compute one backer panel's cost
export const calcBackerUnitCost = (fab, qty, settings) => {
  const safe = { ...emptyBackerFabConfig(), ...fab };
  const panelQty = Math.max(1, num(qty, 1));

  // Material — area in sqin
  const faceAreaSqin = num(safe.width_inches) * num(safe.height_inches);
  const unit_material_cost = faceAreaSqin * num(safe.material_cost_per_sqin);

  // Cut length — override or perimeter
  const cutLengthIn = num(safe.cut_length_override_inches) > 0
    ? num(safe.cut_length_override_inches)
    : 2 * (num(safe.width_inches) + num(safe.height_inches));

  const rates = getActiveRates(safe.cutting_method, settings);
  const cutSpeed = Math.max(1, num(safe.cut_speed_ipm, 50));
  const cutMultiplier = Math.max(0.01, num(safe.cut_multiplier, 1));
  const cutMinutes = (cutLengthIn / cutSpeed) * cutMultiplier;
  const setupMinutesPerPanel = num(safe.setup_minutes, 0) / panelQty;
  const cutHours = (cutMinutes + setupMinutesPerPanel) / 60;
  const unit_cut_cost = cutHours * (rates.machine_rate + rates.labor_rate);

  // Paint (optional)
  let unit_paint_cost = 0;
  if (safe.paint_letters && safe.paint_sides !== "none") {
    const paint = getPaintRates(settings);
    const perSqftCost = paint.supplies_per_sqft + paint.liquid_paint_per_sqft;
    const faceSqft = faceAreaSqin / 144;
    const thickness = num(safe.material_thickness_inches, 0.5);
    const edgeSqft = (cutLengthIn * thickness) / 144;

    let paintedSqft = 0;
    if (safe.paint_sides === "front") paintedSqft = faceSqft;
    else if (safe.paint_sides === "front_and_edges") paintedSqft = faceSqft + edgeSqft;
    else if (safe.paint_sides === "all") paintedSqft = faceSqft * 2 + edgeSqft;

    const colorMultiplier = 1 + Math.max(0, num(safe.num_paint_colors, 1) - 1) * 0.15;
    const paintMaterialsCost = paintedSqft * perSqftCost * colorMultiplier;
    const paintLaborHours = (paintedSqft * 3) / 60;
    const paintLaborCost = paintLaborHours * paint.labor_rate * colorMultiplier;
    unit_paint_cost = paintMaterialsCost + paintLaborCost;
  }

  const unit_total_cost = unit_material_cost + unit_cut_cost + unit_paint_cost;
  return {
    ...safe,
    face_area_sqin: faceAreaSqin,
    cut_length_inches: cutLengthIn,
    unit_material_cost,
    unit_cut_cost,
    unit_paint_cost,
    unit_total_cost,
  };
};

export default function BackerFabModal({ open, onOpenChange, purchase, onSave }) {
  const [materials, setMaterials] = useState([]);
  const [settings, setSettings] = useState({});
  const [fab, setFab] = useState(emptyBackerFabConfig());
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    const list = await SettingsEntity.list();
    const map = {};
    list.forEach(s => { map[s.setting_name] = s.setting_value; });
    setSettings(map);
    return map;
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const [mats] = await Promise.all([
          DimensionalLetterMaterial.filter({ is_active: true }, "sort_order"),
          loadSettings(),
        ]);
        setMaterials(mats);
        const seed = purchase?.backer_fab_config
          ? { ...emptyBackerFabConfig(), ...purchase.backer_fab_config }
          : emptyBackerFabConfig();
        // Pre-fill dimensions from purchase if present
        if (!purchase?.backer_fab_config) {
          if (purchase?.backer_width_inches) seed.width_inches = purchase.backer_width_inches;
          if (purchase?.backer_height_inches) seed.height_inches = purchase.backer_height_inches;
        }
        setFab(seed);
      } catch (e) {
        console.error("Failed to load backer fab inputs:", e);
      }
      setLoading(false);
    })();
  }, [open, purchase, loadSettings]);

  const update = (patch) => setFab(prev => ({ ...prev, ...patch }));

  const selectMaterial = (id) => {
    const m = materials.find(x => x.id === id);
    if (!m) return;
    const matType = m.material_type || "";
    const speedFromSettings = lookupCutSpeed(fab.cutting_method, m.thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(fab.cutting_method, matType, settings);
    setFab(prev => ({
      ...prev,
      material_id: m.id,
      material_name: m.material_name,
      material_type: matType,
      material_thickness_inches: m.thickness_inches,
      material_cost_per_sqin: materialCostPerSqin(m),
      sheet_yield_factor: m.yield_factor,
      paint_letters: !!m.needs_painting,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings,
    }));
  };

  const setCuttingMethod = (method) => {
    const speedFromSettings = lookupCutSpeed(method, fab.material_thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(method, fab.material_type, settings);
    setFab(prev => ({
      ...prev,
      cutting_method: method,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings,
    }));
  };

  const computed = useMemo(() => calcBackerUnitCost(fab, purchase?.qty || 1, settings), [fab, purchase?.qty, settings]);
  const activeRates = useMemo(() => getActiveRates(fab.cutting_method, settings), [fab.cutting_method, settings]);
  const paintR = useMemo(() => getPaintRates(settings), [settings]);

  const handleSave = () => {
    const final = calcBackerUnitCost(fab, purchase?.qty || 1, settings);
    onSave({
      backer_fab_config: {
        material_id: final.material_id,
        material_name: final.material_name,
        material_type: final.material_type,
        material_thickness_inches: final.material_thickness_inches,
        material_cost_per_sqin: final.material_cost_per_sqin,
        sheet_yield_factor: final.sheet_yield_factor,
        width_inches: final.width_inches,
        height_inches: final.height_inches,
        cut_length_override_inches: final.cut_length_override_inches,
        cutting_method: final.cutting_method,
        cut_speed_ipm: final.cut_speed_ipm,
        setup_minutes: final.setup_minutes,
        cut_multiplier: final.cut_multiplier,
        paint_letters: final.paint_letters,
        paint_sides: final.paint_sides,
        num_paint_colors: final.num_paint_colors,
        unit_material_cost: final.unit_material_cost,
        unit_cut_cost: final.unit_cut_cost,
        unit_paint_cost: final.unit_paint_cost,
        unit_total_cost: final.unit_total_cost,
      },
      backer_material_id: final.material_id,
      backer_width_inches: final.width_inches,
      backer_height_inches: final.height_inches,
    });
    onOpenChange(false);
  };

  const isLaser = fab.cutting_method === "laser";
  const cutSettingsPage = isLaser ? "LaserSettings" : "CNCSettings";
  const cutIcon = isLaser ? Zap : Router;
  const cutColor = isLaser ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-600" />
            Backer Panel Fabrication
          </DialogTitle>
          <p className="text-xs text-slate-500">
            Material + cutting + optional paint for the backer panel. One panel per letter (qty × per-panel cost).
          </p>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading…</div>
        ) : (
          <div className="space-y-4">
            {/* QTY (mirrors main row) */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center gap-3">
              <span className="text-xs font-semibold text-orange-900 uppercase tracking-wider">Quantity</span>
              <Badge className="bg-white text-orange-700 border-orange-300 text-base px-3 py-1">{purchase?.qty || 0} backer{(purchase?.qty || 0) === 1 ? "" : "s"}</Badge>
              <span className="text-[11px] text-slate-500 ml-auto">Mirrors "# of Letters" on the main row.</span>
            </div>

            {/* MATERIAL */}
            <Section icon={Box} title="1. Backer Material" color="bg-blue-50 text-blue-700">
              {materials.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-amber-800">
                    <p className="font-medium mb-1">No sheet materials in your library yet.</p>
                    <Link to={createPageUrl("ChannelLetterInstallInventory")} className="inline-flex items-center gap-1 underline">
                      <LinkIcon className="w-3 h-3" /> Open Inventory → Dimensional Sheets tab
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <Label className="text-xs">Sheet Material</Label>
                    <Select value={fab.material_id || ""} onValueChange={selectMaterial}>
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue placeholder="Select material..." />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.material_name} ({m.thickness_inches}")
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Thickness (in)</Label>
                    <Input
                      type="number" step="0.0625" min="0"
                      value={fab.material_thickness_inches}
                      onChange={(e) => update({ material_thickness_inches: parseFloat(e.target.value) || 0 })}
                      className="h-9 mt-1 tabular-nums"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Width (in)</Label>
                  <Input type="number" min="0" step="0.5" value={fab.width_inches}
                    onChange={(e) => update({ width_inches: parseFloat(e.target.value) || 0 })}
                    className="h-9 mt-1 tabular-nums" />
                </div>
                <div>
                  <Label className="text-xs">Height (in)</Label>
                  <Input type="number" min="0" step="0.5" value={fab.height_inches}
                    onChange={(e) => update({ height_inches: parseFloat(e.target.value) || 0 })}
                    className="h-9 mt-1 tabular-nums" />
                </div>
                <div>
                  <Label className="text-xs">Cut Length Override (in)</Label>
                  <Input type="number" min="0" step="1" value={fab.cut_length_override_inches}
                    onChange={(e) => update({ cut_length_override_inches: parseFloat(e.target.value) || 0 })}
                    placeholder="Auto (perimeter)" className="h-9 mt-1 tabular-nums" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Area: <strong>{((fab.width_inches * fab.height_inches) / 144).toFixed(2)} sqft</strong>
                {fab.material_id && (<> · ≈ {fmt(fab.material_cost_per_sqin * 144)}/sqft after {Math.round(fab.sheet_yield_factor * 100)}% yield</>)}
              </p>
            </Section>

            {/* CUTTING */}
            <Section icon={cutIcon} title="2. Cutting" color={cutColor}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Method</Label>
                  <Select value={fab.cutting_method} onValueChange={setCuttingMethod}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cnc"><span className="inline-flex items-center gap-2"><Router className="w-3.5 h-3.5 text-green-600" /> {CUTTING_METHOD_LABELS.cnc}</span></SelectItem>
                      <SelectItem value="laser"><span className="inline-flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-red-600" /> {CUTTING_METHOD_LABELS.laser}</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Cut Speed (in/min)</Label>
                  <Input type="number" min="1" step="1" value={fab.cut_speed_ipm}
                    onChange={(e) => update({ cut_speed_ipm: parseFloat(e.target.value) || 50 })}
                    className="h-9 mt-1 tabular-nums" />
                </div>
                <div>
                  <Label className="text-xs">Setup Time (min, total)</Label>
                  <Input type="number" min="0" step="1" value={fab.setup_minutes}
                    onChange={(e) => update({ setup_minutes: parseFloat(e.target.value) || 0 })}
                    className="h-9 mt-1 tabular-nums" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Material Cut Multiplier</Label>
                <Input type="number" min="0.01" step="0.1" value={fab.cut_multiplier}
                  onChange={(e) => update({ cut_multiplier: parseFloat(e.target.value) || 1 })}
                  className="h-9 mt-1 tabular-nums max-w-[140px]" />
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-md px-2 py-1.5">
                <span>Machine: <strong>${activeRates.machine_rate.toFixed(0)}/hr</strong> · Operator: <strong>${activeRates.labor_rate.toFixed(0)}/hr</strong></span>
                <span className="flex items-center gap-2">
                  <Link to={createPageUrl(cutSettingsPage)} className="underline">Edit {isLaser ? "Laser" : "CNC"} settings</Link>
                  <button type="button" onClick={loadSettings} title="Refresh rates" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </span>
              </div>
            </Section>

            {/* PAINT (optional) */}
            <Section icon={Paintbrush} title="3. Paint (Optional)" color="bg-purple-50 text-purple-700">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={!!fab.paint_letters} onCheckedChange={(c) => update({ paint_letters: !!c })} />
                <span className="font-medium">Paint this backer</span>
                <span className="text-[11px] text-slate-500 ml-2">Uncheck to skip paint entirely.</span>
              </label>
              {fab.paint_letters && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Sides</Label>
                    <Select value={fab.paint_sides} onValueChange={(v) => update({ paint_sides: v })}>
                      <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAINT_SIDES_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs"># of Paint Colors</Label>
                    <Input type="number" min="1" step="1" value={fab.num_paint_colors}
                      onChange={(e) => update({ num_paint_colors: parseInt(e.target.value, 10) || 1 })}
                      className="h-9 mt-1 tabular-nums" />
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                Labor: ${paintR.labor_rate.toFixed(0)}/hr · Supplies: ${paintR.supplies_per_sqft.toFixed(2)}/sqft · Liquid: ${paintR.liquid_paint_per_sqft.toFixed(2)}/sqft
                <Link to={createPageUrl("PaintSettings")} className="underline ml-1">Edit Paint settings</Link>
              </p>
            </Section>

            {/* PREVIEW */}
            <div className="bg-gradient-to-r from-orange-900 to-orange-700 text-white rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Calculator className="w-4 h-4" />
                <span className="font-semibold">Per-Backer Cost Breakdown</span>
                <Badge className="ml-auto bg-white/10 text-white border-0">qty: {purchase?.qty || 1}</Badge>
              </div>
              <PreviewRow label="Material" value={computed.unit_material_cost} subtitle={`${(computed.face_area_sqin || 0).toFixed(0)} sqin`} />
              <PreviewRow label={CUTTING_METHOD_LABELS[fab.cutting_method] || "Cutting"} value={computed.unit_cut_cost} subtitle={`${(computed.cut_length_inches || 0).toFixed(0)}" cut`} />
              {fab.paint_letters
                ? <PreviewRow label="Paint" value={computed.unit_paint_cost} subtitle={PAINT_SIDES_LABELS[fab.paint_sides]} />
                : <PreviewRow label="Paint" value={0} subtitle="Excluded" />
              }
              <div className="border-t border-white/20 pt-2 flex justify-between items-center">
                <span className="text-sm text-orange-100">Per Backer</span>
                <span className="text-xl font-bold tabular-nums">{fmt(computed.unit_total_cost)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-orange-100">Total ({purchase?.qty || 1} backers)</span>
                <span className="text-2xl font-bold tabular-nums">{fmt(computed.unit_total_cost * (parseFloat(purchase?.qty) || 1))}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Sparkles className="w-4 h-4 mr-1" /> Apply Backer Fab Cost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Section = ({ icon: Icon, title, color, children }) => (
  <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-white">
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="font-semibold text-slate-800 text-sm">{title}</span>
    </div>
    {children}
  </div>
);

const PreviewRow = ({ label, value, subtitle }) => (
  <div className="flex justify-between items-center text-sm">
    <div>
      <span className="text-orange-100">{label}</span>
      {subtitle && <span className="ml-2 text-[10px] text-orange-300/80">{subtitle}</span>}
    </div>
    <span className="tabular-nums font-medium">{fmt(value)}</span>
  </div>
);