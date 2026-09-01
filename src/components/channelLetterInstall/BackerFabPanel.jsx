import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Box, Paintbrush, Calculator, AlertCircle, Sparkles,
  Link as LinkIcon, RefreshCw, Router, Zap, Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { DimensionalLetterMaterial, Settings as SettingsEntity } from "@/entities/all";
import {
  getActiveRates, getPaintRates, lookupCutSpeed, lookupCutMultiplier,
  materialCostPerSqin, PAINT_SIDES_LABELS, CUTTING_METHOD_LABELS,
} from "./dimensionalFabCalculator";
import { emptyBackerFabConfig, calcBackerUnitCost } from "./BackerFabModal";
import CuttingMethodSlider from "./CuttingMethodSlider";
import PaintCoverageHelper from "./PaintCoverageHelper";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

/**
 * Inline replacement for BackerFabModal — same logic, no popup.
 * Removed: Thickness, Cut Length Override, Cut Speed, Setup Time, Material Cut Multiplier.
 * Thickness shown read-only inline with Sheet Material.
 * Cutting method = segmented slider. Paint mask helper appears in multi-color mode.
 */
export default function BackerFabPanel({ purchase, onUpdate }) {
  const [materials, setMaterials] = useState([]);
  const [settings, setSettings] = useState({});
  const [fab, setFab] = useState(() => ({ ...emptyBackerFabConfig(), ...(purchase?.backer_fab_config || {}) }));
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    const list = await SettingsEntity.list();
    const map = {};
    list.forEach((s) => { map[s.setting_name] = s.setting_value; });
    setSettings(map);
    return map;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [mats] = await Promise.all([
          DimensionalLetterMaterial.filter({ is_active: true }, "sort_order"),
          loadSettings(),
        ]);
        setMaterials(mats);
        const seed = { ...emptyBackerFabConfig(), ...(purchase?.backer_fab_config || {}) };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase?.id]);

  const update = (patch) => setFab((prev) => ({ ...prev, ...patch }));

  const selectMaterial = (id) => {
    const m = materials.find((x) => x.id === id);
    if (!m) return;
    const matType = m.material_type || "";
    const speedFromSettings = lookupCutSpeed(fab.cutting_method, m.thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(fab.cutting_method, matType, settings);
    setFab((prev) => ({
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
    setFab((prev) => ({
      ...prev,
      cutting_method: method,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings,
    }));
  };

  const computed = useMemo(() => calcBackerUnitCost(fab, purchase?.qty || 1, settings), [fab, purchase?.qty, settings]);
  const activeRates = useMemo(() => getActiveRates(fab.cutting_method, settings), [fab.cutting_method, settings]);
  const paintR = useMemo(() => getPaintRates(settings), [settings]);

  // Persist back to the purchase whenever fab/qty/settings change
  useEffect(() => {
    if (loading) return;
    const final = calcBackerUnitCost(fab, purchase?.qty || 1, settings);
    onUpdate({
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
        paint_colors: final.paint_colors || [],
        paint_mask_sqft: final.paint_mask_sqft || 0,
        approx_coverage_factor: final.approx_coverage_factor || "1/4",
        unit_material_cost: final.unit_material_cost,
        unit_cut_cost: final.unit_cut_cost,
        unit_paint_cost: final.unit_paint_cost,
        unit_total_cost: final.unit_total_cost,
      },
      backer_material_id: final.material_id,
      backer_width_inches: final.width_inches,
      backer_height_inches: final.height_inches,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fab, purchase?.qty, settings, loading]);

  const isLaser = fab.cutting_method === "laser";
  const cutSettingsPage = isLaser ? "LaserSettings" : "CNCSettings";
  const faceAreaSqft = (fab.width_inches * fab.height_inches) / 144;
  const paintColors = Array.isArray(fab.paint_colors) ? fab.paint_colors : [];
  const numColors = paintColors.length || fab.num_paint_colors || 1;

  const updateColor = (idx, val) => {
    const list = [...paintColors];
    list[idx] = val;
    update({ paint_colors: list, num_paint_colors: list.length });
  };
  const addColor = () => {
    const list = [...paintColors, ""];
    update({ paint_colors: list, num_paint_colors: list.length });
  };
  const removeColor = (idx) => {
    const list = paintColors.filter((_, i) => i !== idx);
    update({ paint_colors: list, num_paint_colors: Math.max(1, list.length) });
  };

  if (loading) {
    return <div className="bg-white border border-orange-200 rounded-lg p-3 text-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-600" />
          <span className="text-sm font-semibold text-orange-900">Backer Panel Fabrication</span>
        </div>
        <Badge variant="outline" className="bg-white text-orange-700 border-orange-300">
          {fmt(computed.unit_total_cost)} / backer
        </Badge>
      </div>

      {/* 1. Material */}
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
          <div>
            <Label className="text-xs">Sheet Material</Label>
            <Select value={fab.material_id || ""} onValueChange={selectMaterial}>
              <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue placeholder="Select material..." /></SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.material_name} — {m.thickness_inches}"</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fab.material_id && (
              <p className="text-[11px] text-slate-500 mt-1">
                Thickness: <strong>{fab.material_thickness_inches}"</strong> · ≈ {fmt(fab.material_cost_per_sqin * 144)}/sqft after {Math.round(fab.sheet_yield_factor * 100)}% yield
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Width (in)</Label>
            <Input type="number" min="0" step="0.5" value={fab.width_inches}
              onChange={(e) => update({ width_inches: parseFloat(e.target.value) || 0 })}
              className="h-9 mt-1 bg-white tabular-nums" />
          </div>
          <div>
            <Label className="text-xs">Height (in)</Label>
            <Input type="number" min="0" step="0.5" value={fab.height_inches}
              onChange={(e) => update({ height_inches: parseFloat(e.target.value) || 0 })}
              className="h-9 mt-1 bg-white tabular-nums" />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          Area: <strong>{faceAreaSqft.toFixed(2)} sqft</strong>
        </p>
      </Section>

      {/* 2. Cutting */}
      <Section icon={isLaser ? Zap : Router} title="2. Cutting" color={isLaser ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}>
        <CuttingMethodSlider value={fab.cutting_method} onChange={setCuttingMethod} />
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-md px-2 py-1.5">
          <span>
            Machine: <strong>${activeRates.machine_rate.toFixed(0)}/hr</strong> · Operator: <strong>${activeRates.labor_rate.toFixed(0)}/hr</strong>
            {fab.cut_speed_ipm ? <> · Speed: <strong>{Math.round(fab.cut_speed_ipm)} in/min</strong></> : null}
          </span>
          <span className="flex items-center gap-2">
            <Link to={createPageUrl(cutSettingsPage)} className="underline">Edit {isLaser ? "Laser" : "CNC"} settings</Link>
            <button type="button" onClick={loadSettings} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </span>
        </div>
      </Section>

      {/* 3. Paint */}
      <Section icon={Paintbrush} title="3. Paint (Optional)" color="bg-purple-50 text-purple-700">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox checked={!!fab.paint_letters} onCheckedChange={(c) => update({ paint_letters: !!c })} />
          <span className="font-medium">Paint this backer</span>
        </label>

        {fab.paint_letters && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Paint Sides</Label>
                <Select value={fab.paint_sides} onValueChange={(v) => update({ paint_sides: v })}>
                  <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAINT_SIDES_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Paint Colors</Label>
                <div className="space-y-1.5 mt-1">
                  {paintColors.length === 0 ? (
                    <Input
                      placeholder="e.g., PMS 186C, Black, White"
                      onChange={(e) => update({ paint_colors: [e.target.value], num_paint_colors: 1 })}
                      className="h-9 bg-white"
                    />
                  ) : (
                    paintColors.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input value={c} onChange={(e) => updateColor(i, e.target.value)} placeholder="e.g., PMS 186C" className="h-9 bg-white" />
                        {paintColors.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => removeColor(i)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addColor} className="h-7 text-xs">+ Add Color</Button>
                </div>
              </div>
            </div>

            {numColors > 1 && (
              <div className="bg-white border border-purple-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-purple-900 mb-2">Paint Mask (multi-color)</p>
                <PaintCoverageHelper
                  faceAreaSqft={faceAreaSqft}
                  bothSides={fab.paint_sides === "all"}
                  value={fab.paint_mask_sqft}
                  factor={fab.approx_coverage_factor || "1/4"}
                  onChange={(patch) => update(patch)}
                />
              </div>
            )}
          </>
        )}

        <p className="text-[11px] text-slate-500">
          Labor: ${paintR.labor_rate.toFixed(0)}/hr · Supplies: ${paintR.supplies_per_sqft.toFixed(2)}/sqft · Liquid: ${paintR.liquid_paint_per_sqft.toFixed(2)}/sqft
          <Link to={createPageUrl("PaintSettings")} className="underline ml-1">Edit Paint settings</Link>
        </p>
      </Section>

      {/* Preview */}
      <div className="bg-gradient-to-r from-orange-900 to-orange-700 text-white rounded-xl p-3 space-y-1.5">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-4 h-4" />
          <span className="font-semibold text-sm">Per-Backer Breakdown</span>
          <Badge className="ml-auto bg-white/10 text-white border-0">qty: {purchase?.qty || 1}</Badge>
        </div>
        <PreviewRow label="Material" value={computed.unit_material_cost} subtitle={`${(computed.face_area_sqin || 0).toFixed(0)} sqin`} />
        <PreviewRow label={CUTTING_METHOD_LABELS[fab.cutting_method] || "Cutting"} value={computed.unit_cut_cost} subtitle={`${(computed.cut_length_inches || 0).toFixed(0)}" cut`} />
        {fab.paint_letters
          ? <PreviewRow label="Paint" value={computed.unit_paint_cost} subtitle={PAINT_SIDES_LABELS[fab.paint_sides]} />
          : <PreviewRow label="Paint" value={0} subtitle="Excluded" />}
        <div className="border-t border-white/20 pt-2 flex justify-between items-center">
          <span className="text-sm text-orange-100">Total ({purchase?.qty || 1} backers)</span>
          <span className="text-xl font-bold tabular-nums">{fmt(computed.unit_total_cost * (parseFloat(purchase?.qty) || 1))}</span>
        </div>
      </div>
    </div>
  );
}

const Section = ({ icon: Icon, title, color, children }) => (
  <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-white">
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
    <span className="tabular-nums font-medium">{`$${(parseFloat(value) || 0).toFixed(2)}`}</span>
  </div>
);