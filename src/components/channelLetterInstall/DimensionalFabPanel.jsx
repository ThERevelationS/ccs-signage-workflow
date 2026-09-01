import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Box, Paintbrush, Calculator, AlertCircle,
  Link as LinkIcon, RefreshCw, Router, Zap, Trash2, Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { DimensionalLetterMaterial, Settings as SettingsEntity } from "@/entities/all";
import {
  calcDimensionalUnitCost,
  materialCostPerSqin,
  emptyFabConfig,
  getActiveRates,
  getPaintRates,
  lookupCutSpeed,
  lookupCutMultiplier,
  PAINT_SIDES_LABELS,
  CUTTING_METHOD_LABELS,
} from "./dimensionalFabCalculator";
import CuttingMethodSlider from "./CuttingMethodSlider";
import PaintCoverageHelper from "./PaintCoverageHelper";
import { estimateAverageLetterWidth } from "./letterWidthCalculator";
import DimensionalMaterialPickerDialog from "./DimensionalMaterialPickerDialog";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

/**
 * Inline replacement for DimensionalFabModal.
 * Renders all material + cutting + paint controls directly on the row.
 * Removed (per request): Thickness, Cut Length Override, Cut Speed, Setup Time, Material Cut Multiplier.
 * Thickness is shown in the Sheet Material picker (read-only inline display).
 * Cutting method is a segmented slider (CNC | Laser).
 * Paint mask + Approx Coverage Helper appear when multi-color is used.
 */
export default function DimensionalFabPanel({ purchase, onUpdate, onReset }) {
  const [materials, setMaterials] = useState([]);
  const [settings, setSettings] = useState({});
  const [fab, setFab] = useState(() => ({ ...emptyFabConfig(), ...(purchase?.fab_config || {}) }));
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

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

        const seed = { ...emptyFabConfig(), ...(purchase?.fab_config || {}) };
        // back-compat
        if (seed.cnc_cut_speed_ipm && !seed.cut_speed_ipm) seed.cut_speed_ipm = seed.cnc_cut_speed_ipm;
        // width_override defaults to false — width is auto-calculated unless toggled on
        if (seed.width_override === undefined) seed.width_override = false;
        setFab(seed);
      } catch (e) {
        console.error("Failed to load fab inputs:", e);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase?.id]);

  const update = (patch) => setFab((prev) => ({ ...prev, ...patch }));

  // Currently-selected material record (used to gate laser availability)
  const selectedMaterial = useMemo(
    () => materials.find((x) => x.id === fab.material_id) || null,
    [materials, fab.material_id]
  );
  const laserDisallowed = selectedMaterial ? selectedMaterial.allow_laser === false : false;

  // When material changes, refresh thickness + per-sqin cost + auto-cut params.
  // If the new material disallows laser and the current method is laser, force CNC.
  const selectMaterial = (id) => {
    const m = materials.find((x) => x.id === id);
    if (!m) return;
    const matType = m.material_type || "";
    const forceCnc = m.allow_laser === false && fab.cutting_method === "laser";
    const nextMethod = forceCnc ? "cnc" : fab.cutting_method;
    const speedFromSettings = lookupCutSpeed(nextMethod, m.thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(nextMethod, matType, settings);
    setFab((prev) => ({
      ...prev,
      material_id: m.id,
      material_name: m.material_name,
      material_type: matType,
      material_thickness_inches: m.thickness_inches,
      material_cost_per_sqin: materialCostPerSqin(m),
      sheet_yield_factor: m.yield_factor,
      paint_letters: !!m.needs_painting,
      cutting_method: nextMethod,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings,
    }));
  };

  const setCuttingMethod = (method) => {
    if (method === "laser" && laserDisallowed) return; // hard-gate

    const speedFromSettings = lookupCutSpeed(method, fab.material_thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(method, fab.material_type, settings);
    setFab((prev) => ({
      ...prev,
      cutting_method: method,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings,
    }));
  };

  const qty = parseFloat(purchase?.qty) || 1;
  const computed = useMemo(() => calcDimensionalUnitCost(fab, qty, settings), [fab, qty, settings]);
  const activeRates = useMemo(() => getActiveRates(fab.cutting_method, settings), [fab.cutting_method, settings]);
  const paintR = useMemo(() => getPaintRates(settings), [settings]);

  // Persist whenever fab changes (debounced via effect — only after first load).
  // We DO NOT touch unit_cost_override here — the user controls that via the
  // override checkbox on the Per-Letter Cost field. The dimensional pricing
  // path in lettersCalculator reads fab_config.unit_total_cost directly when
  // unit_cost_override is false.
  useEffect(() => {
    if (loading) return;
    const final = calcDimensionalUnitCost(fab, qty, settings);
    onUpdate({
      fab_config: {
        material_id: final.material_id,
        material_name: final.material_name,
        material_type: final.material_type,
        material_thickness_inches: final.material_thickness_inches,
        material_cost_per_sqin: final.material_cost_per_sqin,
        sheet_yield_factor: final.sheet_yield_factor,
        letter_height_inches: final.letter_height_inches,
        letter_width_inches: final.letter_width_inches,
        width_override: !!fab.width_override,
        letter_perimeter_inches: final.letter_perimeter_inches,
        cutting_method: final.cutting_method,
        cut_speed_ipm: final.cut_speed_ipm,
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
      size_value: (final.face_area_sqin || 1) / 144,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fab, qty, settings, loading]);

  const isLaser = fab.cutting_method === "laser";
  const cutSettingsPage = isLaser ? "LaserSettings" : "CNCSettings";

  // Face area in sqft for mask helper
  const faceAreaSqft = (computed.face_area_sqin || 0) / 144;
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

  // Auto-fill width from height unless oversize-override is on.
  // Reacts every render: if user changes height and width is not overridden, width is recalculated.
  const oversize = !!fab.width_override;
  useEffect(() => {
    if (loading) return;
    if (oversize) return;
    const h = parseFloat(fab.letter_height_inches) || 0;
    if (h <= 0) return;
    const autoW = estimateAverageLetterWidth(h);
    if (autoW !== fab.letter_width_inches) {
      setFab((prev) => ({ ...prev, letter_width_inches: autoW }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fab.letter_height_inches, oversize, loading]);

  if (loading) {
    return (
      <div className="rounded-xl p-4 text-center text-slate-500">
        Loading material library…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DimensionalMaterialPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        materials={materials}
        selectedId={fab.material_id}
        onSelect={selectMaterial}
      />
      {/* 1. Material — sheet, height, width all on ONE row */}
      <Section icon={Box} title="1. Material" color="bg-blue-50 text-blue-700">
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
          <>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6">
                <Label className="text-xs">Sheet Material</Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                  className="h-9 mt-1 w-full justify-between bg-white font-normal"
                >
                  <span className="truncate">
                    {fab.material_id
                      ? `${fab.material_name} — ${fab.material_thickness_inches}"`
                      : <span className="text-slate-400">Select material...</span>}
                  </span>
                  <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </Button>
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Letter Height (in)</Label>
                <Input
                  type="number" min="0" step="0.5"
                  value={fab.letter_height_inches}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => update({ letter_height_inches: parseFloat(e.target.value) || 0 })}
                  className="h-9 mt-1 bg-white tabular-nums"
                />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs flex items-center justify-between gap-1">
                  <span>Letter Width (avg, in)</span>
                  <label className="flex items-center gap-1 text-[10px] text-slate-500 font-normal cursor-pointer">
                    <Checkbox
                      checked={oversize}
                      onCheckedChange={(c) => update({ width_override: !!c })}
                      className="h-3 w-3"
                    />
                    Oversize
                  </label>
                </Label>
                <Input
                  type="number" min="0" step="0.5"
                  value={fab.letter_width_inches}
                  onFocus={(e) => e.target.select()}
                  disabled={!oversize}
                  onChange={(e) => update({ letter_width_inches: parseFloat(e.target.value) || 0 })}
                  className={`h-9 mt-1 tabular-nums ${oversize ? "bg-white" : "bg-slate-50 text-slate-600"}`}
                />
              </div>
            </div>
            {fab.material_id && (
              <p className="text-[11px] text-slate-500">
                Thickness: <strong>{fab.material_thickness_inches}"</strong> · ≈ {fmt(fab.material_cost_per_sqin * 144)}/sqft after {Math.round(fab.sheet_yield_factor * 100)}% yield
                {!oversize && (
                  <span className="ml-2 text-slate-400">· Width auto-calculated from height (avg of 10 fonts). Check <strong>Oversize</strong> to edit.</span>
                )}
              </p>
            )}
          </>
        )}
      </Section>

      {/* 2. Cutting */}
      <Section
        icon={isLaser ? Zap : Router}
        title="2. Cutting"
        color={isLaser ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}
      >
        <CuttingMethodSlider value={fab.cutting_method} onChange={setCuttingMethod} disableLaser={laserDisallowed} />
        {laserDisallowed && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 text-[11px] text-amber-800 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              <strong>{selectedMaterial?.material_name}</strong> is not laser-cuttable — CNC is being used. (Change in Inventory → Dimensional Sheets if this is wrong.)
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-md px-2 py-1.5">
          <span>
            Machine: <strong>${activeRates.machine_rate.toFixed(0)}/hr</strong> · Operator: <strong>${activeRates.labor_rate.toFixed(0)}/hr</strong>
            {fab.cut_speed_ipm ? <> · Speed: <strong>{Math.round(fab.cut_speed_ipm)} in/min</strong></> : null}
          </span>
          <span className="flex items-center gap-2">
            <Link to={createPageUrl(cutSettingsPage)} className="underline">Edit {isLaser ? "Laser" : "CNC"} settings</Link>
            <button
              type="button"
              onClick={loadSettings}
              title="Refresh rates from settings"
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </span>
        </div>
      </Section>

      {/* 3. Paint */}
      <Section icon={Paintbrush} title="3. Paint" color="bg-purple-50 text-purple-700">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox checked={!!fab.paint_letters} onCheckedChange={(c) => update({ paint_letters: !!c })} />
          <span className="font-medium">Paint these letters</span>
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
                        <Input
                          value={c}
                          onChange={(e) => updateColor(i, e.target.value)}
                          placeholder="e.g., PMS 186C, Black, White"
                          className="h-9 bg-white"
                        />
                        {paintColors.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => removeColor(i)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addColor} className="h-7 text-xs">
                    + Add Color
                  </Button>
                </div>
              </div>
            </div>

            {/* Paint mask helper only shown when there's more than one color */}
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
          {" "}<Link to={createPageUrl("PaintSettings")} className="underline ml-1">Edit Paint settings</Link>
        </p>
      </Section>

      {/* Live preview — uses the EXACT same calc as the stand-alone CNC + Paint estimators */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-3 space-y-1.5">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-4 h-4" />
          <span className="font-semibold text-sm">Per-Letter Breakdown</span>
          <Badge className="ml-auto bg-white/10 text-white border-0">{qty} letter{qty === 1 ? "" : "s"}</Badge>
        </div>
        <PreviewRow label="Material" value={computed.unit_material_cost} subtitle={`${(computed.face_area_sqin || 0).toFixed(1)} sqin/letter`} />
        <PreviewRow
          label={CUTTING_METHOD_LABELS[fab.cutting_method] || "Cutting"}
          value={computed.unit_cut_cost}
          subtitle={`${(computed.cut_length_inches || 0).toFixed(0)}" cut/letter`}
        />
        {fab.paint_letters && (
          <PreviewRow label="Paint" value={computed.unit_paint_cost} subtitle={PAINT_SIDES_LABELS[fab.paint_sides]} />
        )}
        <div className="border-t border-white/20 pt-2 space-y-1">
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Row totals (from {isLaser ? "Laser" : "CNC"} + Paint settings)</span>
            <span className="tabular-nums">
              Mat ${(computed.row_total_material_cost || 0).toFixed(2)} ·
              Cut ${(computed.row_total_cut_cost || 0).toFixed(2)}
              {fab.paint_letters && (
                <> · Paint ${((computed.row_total_paint_mask_cost || 0) + (computed.row_total_paint_supplies_cost || 0) + (computed.row_total_paint_labor_cost || 0)).toFixed(2)}</>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-300">Total ({qty} letter{qty === 1 ? "" : "s"})</span>
            <span className="text-xl font-bold tabular-nums">{fmt(computed.unit_total_cost * qty)}</span>
          </div>
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
      <span className="text-slate-300">{label}</span>
      {subtitle && <span className="ml-2 text-[10px] text-slate-500">{subtitle}</span>}
    </div>
    <span className="tabular-nums font-medium">{`$${(parseFloat(value) || 0).toFixed(2)}`}</span>
  </div>
);