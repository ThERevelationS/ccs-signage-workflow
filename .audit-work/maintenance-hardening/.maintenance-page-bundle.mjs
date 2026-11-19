// frozen:/app/src/pages/MaintenanceEstimator.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// s:s://@/api/gatedEntities
var MaintenanceProject = {
  get: async (id) => {
    globalThis.__spies.push(["projectGet", id]);
    return globalThis.__project ?? null;
  }
};
var MaintenanceActionRate = globalThis.__entRates ||= { __ent: "rates" };
var Settings = globalThis.__entSettings ||= { __ent: "settings" };
var MaintenanceInventory = globalThis.__entMaintInv ||= { __ent: "maintInv" };

// frozen:/app/src/pages/MaintenanceEstimator.jsx
import { useSearchParams, Link } from "react-router-dom";

// s:s://@/components/ui/button
import { jsx } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx("button", { type: "button", ...p, children: p.children });

// s:s://@/components/ui/card
import { jsx as jsx2 } from "react/jsx-runtime";
var Card = (p) => /* @__PURE__ */ jsx2("div", { ...p });
var CardContent = (p) => /* @__PURE__ */ jsx2("div", { ...p });
var CardHeader = (p) => /* @__PURE__ */ jsx2("div", { ...p });
var CardTitle = (p) => /* @__PURE__ */ jsx2("div", { ...p });

// s:s://@/components/ui/input
import { jsx as jsx3 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx3("input", { ...p });

// s:s://@/components/ui/label
import { jsx as jsx4 } from "react/jsx-runtime";
var Label = (p) => /* @__PURE__ */ jsx4("label", { ...p, children: p.children });

// s:s://@/components/ui/textarea
import { jsx as jsx5 } from "react/jsx-runtime";
var Textarea = (p) => /* @__PURE__ */ jsx5("textarea", { ...p });

// s:s://@/components/ui/select
import { jsx as jsx6 } from "react/jsx-runtime";
var Select = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var SelectTrigger = (p) => /* @__PURE__ */ jsx6("div", { "data-trigger": true, ...p, children: p.children });
var SelectValue = () => /* @__PURE__ */ jsx6("span", {});
var SelectContent = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var SelectItem = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });

// s:s://@/components/ui/tabs
import { jsx as jsx7 } from "react/jsx-runtime";
var Tabs = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });
var TabsList = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });
var TabsTrigger = (p) => /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => p.onClick?.(), children: p.children });
var TabsContent = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });

// s:s://lucide-react
var AlertTriangle = () => null;
var Copy = () => null;
var PackagePlus = () => null;
var RotateCcw = () => null;
var Trash2 = () => null;
var Paintbrush2 = () => null;
var Ruler = () => null;
var Gauge = () => null;
var Type = () => null;
var Palette = () => null;
var Scissors = () => null;
var Plus = () => null;
var ArrowLeft = () => null;
var Wrench = () => null;
var FileText = () => null;
var ListChecks = () => null;
var HardHat = () => null;
var Calculator = () => null;
var MapPin = () => null;
var Package = () => null;
var ClipboardCheck = () => null;
var TrendingUp = () => null;

// frozen:/app/src/components/signMaintenance/ServiceItemRow.jsx
import React3 from "react";

// s:s://./SignTypePicker
import { jsx as jsx8 } from "react/jsx-runtime";
var SignTypePicker_default = (p) => /* @__PURE__ */ jsx8("div", { "data-stub": "SignTypePicker" });

// s:s://./ActionPicker
import { jsx as jsx9 } from "react/jsx-runtime";
var ActionPicker_default = (p) => /* @__PURE__ */ jsx9("div", { "data-stub": "ActionPicker" });

// frozen:/app/src/components/signMaintenance/RepaintMonumentPanel.jsx
import React2 from "react";

// s:s://@/components/ui/checkbox
import { jsx as jsx10 } from "react/jsx-runtime";
var Checkbox = (p) => /* @__PURE__ */ jsx10("input", { type: "checkbox", ...p });

// s:s://@/components/ui/slider
import { jsx as jsx11 } from "react/jsx-runtime";
var Slider = (p) => /* @__PURE__ */ jsx11("div", { "data-stub": "slider", role: "slider", ...p });

// s:s://@/components/ui/badge
import { jsx as jsx12 } from "react/jsx-runtime";
var Badge = (p) => /* @__PURE__ */ jsx12("span", { ...p, children: p.children });

// frozen:/app/src/components/signMaintenance/repaintDefaults.jsx
var REPAINT_FEATURES = [
  { id: "dimensional_letters", label: "Dimensional Letters", setting: "maintenance_repaint_feat_dimensional_letters" },
  { id: "painted_letters", label: "Painted Letters", setting: "maintenance_repaint_feat_painted_letters" },
  { id: "applied_vinyl", label: "Applied Vinyl", setting: "maintenance_repaint_feat_applied_vinyl" },
  { id: "complex_layering", label: "Complex Layering/Shapes", setting: "maintenance_repaint_feat_complex_layering" }
];
var PAINT_CONDITION_LABELS = [
  "Like New",
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Worn",
  "Faded",
  "Heavily Faded",
  "Chalking",
  "Severely Degraded"
];
var RETAINER_WIDTHS_IN = [1, 1.5, 2, 2.5, 3, 4, 5, 6];
var MONUMENT_LENGTH_RANGE_FT = { min: 1, max: 50, step: 0.5 };
var MONUMENT_HEIGHT_RANGE_FT = { min: 1, max: 50, step: 0.5 };
var MONUMENT_RETURN_DEPTH_RANGE_IN = { min: 1, max: 48, step: 0.5 };

// frozen:/app/src/components/signMaintenance/dimLetterPaintCalculator.jsx
var num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var UNIT_FACTORS = { oz: 1 / 128, pint: 1 / 8, quart: 1 / 4, liter: 1 / 3.78541, gallon: 1 };
var costPerGallon = (cost, unit) => {
  const c = num(cost);
  const f = UNIT_FACTORS[unit] || 1;
  if (!f) return 0;
  return c / f;
};
var mixedPaintCostPerSqft = (s) => {
  const paintG = costPerGallon(s.paint_cost_per_unit, s.paint_unit);
  const hardG = costPerGallon(s.hardener_cost_per_unit, s.hardener_unit);
  const redG = costPerGallon(s.reducer_cost_per_unit, s.reducer_unit);
  const pR = num(s.paint_mix_ratio), hR = num(s.hardener_mix_ratio), rR = num(s.reducer_mix_ratio);
  const parts = pR + hR + rR;
  if (!parts) return 0;
  const costPerGalMixed = (paintG * pR + hardG * hR + redG * rR) / parts;
  const coverage = num(s.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
  return costPerGalMixed / coverage;
};
var computeDimLetterPaint = (cfg, settings) => {
  const dl = cfg?.dim_letter_paint;
  if (!dl?.enabled) return null;
  const qty = Math.max(0, num(dl.qty));
  if (qty <= 0) return null;
  const hIn = Math.max(0, num(dl.avg_height_in));
  const tIn = Math.max(0, num(dl.thickness_in));
  if (hIn <= 0) return null;
  const perimFactor = num(settings.letter_perimeter_factor, 3.5) || 3.5;
  const FACE_FACTOR = 0.55;
  const facePerLetterIn2 = hIn * hIn * FACE_FACTOR;
  const returnsPerLetterIn2 = hIn * perimFactor * tIn;
  const SQIN_PER_SQFT = 144;
  const letters_face_sqft = facePerLetterIn2 * qty / SQIN_PER_SQFT;
  const letters_returns_sqft = returnsPerLetterIn2 * qty / SQIN_PER_SQFT;
  const letters_total_sqft = letters_face_sqft + letters_returns_sqft;
  const liquid$PerSqft = mixedPaintCostPerSqft(settings);
  const wasteMult = num(settings.paint_waste_multiplier, 1.25) || 1.25;
  const letters_paint_cost = letters_total_sqft * liquid$PerSqft * wasteMult;
  const coverage = num(settings.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
  const letters_gallons = letters_total_sqft * wasteMult / coverage;
  const basePerSqft = num(settings.base_labor_hours_per_sqft, 0.05);
  let prepMult = num(settings.lettering_normal_prep_multiplier, 1) || 1;
  if (hIn <= 4) prepMult = num(settings.lettering_extra_small_prep_multiplier, 1.5);
  else if (hIn <= 8) prepMult = num(settings.lettering_small_prep_multiplier, 1.3);
  else if (hIn <= 12) prepMult = num(settings.lettering_normal_prep_multiplier, 1);
  else if (hIn <= 20) prepMult = num(settings.lettering_medium_prep_multiplier, 0.9);
  else if (hIn <= 30) prepMult = num(settings.lettering_large_prep_multiplier, 0.8);
  else prepMult = num(settings.lettering_extra_large_prep_multiplier, 0.7);
  const letters_labor_hours = letters_total_sqft * basePerSqft * prepMult;
  const usingMask = dl.second_color_mask === "paint_mask";
  let mask_sqft = 0, mask_material_cost = 0, mask_machine_cost = 0;
  let mask_weed_labor_cost = 0, mask_apply_labor_cost = 0, mask_labor_hours = 0;
  if (usingMask) {
    mask_sqft = letters_face_sqft;
    const matRate = num(settings.paint_mask_rate_per_sqft);
    const machineRate = num(settings.paint_mask_machine_cutting_rate_per_sqft);
    const weedRate = num(settings.paint_mask_cutting_labor_rate_per_sqft);
    const applyRate = num(settings.paint_mask_application_labor_rate_per_sqft);
    const laborRate = num(settings.default_labor_rate, 60) || 60;
    mask_material_cost = mask_sqft * matRate;
    mask_machine_cost = mask_sqft * machineRate;
    mask_weed_labor_cost = mask_sqft * weedRate;
    mask_apply_labor_cost = mask_sqft * applyRate;
    const mask_labor_cost = mask_weed_labor_cost + mask_apply_labor_cost;
    mask_labor_hours = laborRate > 0 ? mask_labor_cost / laborRate : 0;
    const secondColorExtraPaint = letters_face_sqft * liquid$PerSqft * wasteMult;
    return finalize({
      letters_face_sqft,
      letters_returns_sqft,
      letters_total_sqft,
      letters_gallons: letters_gallons + letters_face_sqft * wasteMult / coverage,
      letters_paint_cost: letters_paint_cost + secondColorExtraPaint,
      mask_sqft,
      mask_material_cost,
      mask_machine_cost,
      mask_weed_labor_cost,
      mask_apply_labor_cost,
      mask_labor_hours,
      letters_labor_hours
    });
  }
  return finalize({
    letters_face_sqft,
    letters_returns_sqft,
    letters_total_sqft,
    letters_gallons,
    letters_paint_cost,
    mask_sqft: 0,
    mask_material_cost: 0,
    mask_machine_cost: 0,
    mask_weed_labor_cost: 0,
    mask_apply_labor_cost: 0,
    mask_labor_hours: 0,
    letters_labor_hours
  });
};
var finalize = (r) => {
  const mask_total_cost = r.mask_material_cost + r.mask_machine_cost + r.mask_weed_labor_cost + r.mask_apply_labor_cost;
  const letters_total_added_cost = r.letters_paint_cost + mask_total_cost;
  return { ...r, mask_total_cost, letters_total_added_cost };
};

// frozen:/app/src/components/signMaintenance/repaintCalculator.jsx
var num2 = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var SETTING_FALLBACKS = {
  maintenance_repaint_coverage_sqft_per_gallon: 350,
  maintenance_repaint_paint_cost_per_gallon: 55,
  maintenance_repaint_primer_coats: 1,
  maintenance_repaint_finish_coats: 2,
  maintenance_repaint_sqft_per_hour: 60,
  maintenance_repaint_feat_dimensional_letters: 1.35,
  maintenance_repaint_feat_painted_letters: 1.25,
  maintenance_repaint_feat_applied_vinyl: 1.15,
  maintenance_repaint_feat_complex_layering: 1.4,
  maintenance_repaint_condition_step_pct: 8
};
var settingNum = (settings, key) => num2(settings?.[key], SETTING_FALLBACKS[key]);
var isMonumentRepaint = (item) => {
  if (!item) return false;
  if (item.sign_type !== "monument_sign") return false;
  return (item.actions || []).includes("repaint");
};
var defaultMonumentRepaintConfig = () => ({
  length_ft: 8,
  height_ft: 4,
  return_depth_in: 6,
  paint_mode: "entire_panel",
  // "entire_panel" | "returns_only"
  features: [],
  // ids from REPAINT_FEATURES (only used when entire_panel)
  retainer_width_in: 2,
  // only used when returns_only
  paint_condition: 3,
  // 1-10
  paint_both_sides: true,
  // monument typically has 2 painted faces
  // Dimensional-letter painting — only relevant when "dimensional_letters" feature is on
  dim_letter_paint: {
    enabled: false,
    qty: 6,
    avg_height_in: 12,
    thickness_in: 1,
    second_color_mask: "none"
    // "none" | "paint_mask"
  }
});
var computeRepaintSqft = (cfg) => {
  if (!cfg) return { face_sqft: 0, returns_sqft: 0, total_sqft: 0, perimeter_ft: 0 };
  const L = Math.max(0, num2(cfg.length_ft));
  const H = Math.max(0, num2(cfg.height_ft));
  const perimeter_ft = 2 * (L + H);
  const sides = cfg.paint_both_sides ? 2 : 1;
  if (cfg.paint_mode === "returns_only") {
    const retainerFt = Math.max(0, num2(cfg.retainer_width_in)) / 12;
    const returns_sqft2 = perimeter_ft * retainerFt;
    return { face_sqft: 0, returns_sqft: returns_sqft2, total_sqft: returns_sqft2, perimeter_ft };
  }
  const face_sqft = L * H * sides;
  const returnDepthFt = Math.max(0, num2(cfg.return_depth_in)) / 12;
  const returns_sqft = perimeter_ft * returnDepthFt;
  return { face_sqft, returns_sqft, total_sqft: face_sqft + returns_sqft, perimeter_ft };
};
var featureMultiplier = (cfg, settings) => {
  if (!cfg || cfg.paint_mode !== "entire_panel") return 1;
  const selected = new Set(cfg.features || []);
  let mult = 1;
  REPAINT_FEATURES.forEach((f) => {
    if (selected.has(f.id)) mult *= settingNum(settings, f.setting);
  });
  return mult;
};
var conditionMultiplier = (cfg, settings) => {
  const level = Math.min(10, Math.max(1, Math.round(num2(cfg?.paint_condition, 1))));
  const stepPct = settingNum(settings, "maintenance_repaint_condition_step_pct");
  return 1 + stepPct / 100 * (level - 1);
};
var computeMonumentRepaint = (item, settings) => {
  if (!isMonumentRepaint(item)) return null;
  const cfg = item.repaint_config || defaultMonumentRepaintConfig();
  const { face_sqft, returns_sqft, total_sqft, perimeter_ft } = computeRepaintSqft(cfg);
  const coverage = settingNum(settings, "maintenance_repaint_coverage_sqft_per_gallon") || 350;
  const pricePerGal = settingNum(settings, "maintenance_repaint_paint_cost_per_gallon");
  const primerCoats = Math.max(0, settingNum(settings, "maintenance_repaint_primer_coats"));
  const finishCoats = Math.max(0, settingNum(settings, "maintenance_repaint_finish_coats"));
  const sqftPerHour = settingNum(settings, "maintenance_repaint_sqft_per_hour") || 60;
  const totalCoats = primerCoats + finishCoats;
  const paintedSqft = total_sqft * totalCoats;
  const gallons = paintedSqft / coverage;
  const paintMaterialCost = gallons * pricePerGal;
  const featMult = featureMultiplier(cfg, settings);
  const condMult = conditionMultiplier(cfg, settings);
  let labor_hours = total_sqft / sqftPerHour * featMult * condMult;
  const featureSet = new Set(cfg.features || []);
  const dl = featureSet.has("dimensional_letters") && cfg.paint_mode === "entire_panel" ? computeDimLetterPaint(cfg, settings) : null;
  let dimLetterCost = 0;
  if (dl) {
    dimLetterCost = dl.letters_total_added_cost;
    labor_hours += (dl.letters_labor_hours || 0) + (dl.mask_labor_hours || 0);
  }
  return {
    cfg,
    face_sqft,
    returns_sqft,
    total_sqft,
    perimeter_ft,
    coverage,
    pricePerGal,
    primerCoats,
    finishCoats,
    totalCoats,
    gallons,
    paint_material_cost: paintMaterialCost + dimLetterCost,
    feature_multiplier: featMult,
    condition_multiplier: condMult,
    paint_condition_label: PAINT_CONDITION_LABELS[Math.min(9, Math.max(0, (cfg.paint_condition || 1) - 1))],
    labor_hours,
    dim_letter_paint: dl
  };
};

// frozen:/app/src/components/signMaintenance/DimLetterPaintSubPanel.jsx
import React from "react";

// frozen:/app/src/components/signMaintenance/constants.jsx
var SIGN_TYPES = [
  // Channel-letter family — these use letter sizing
  { id: "flush_channel", label: "Flush Channel", family: "letter", color: "blue", description: "Channel letters mounted flat to wall" },
  { id: "halo_channel", label: "Halo Channel", family: "letter", color: "amber", description: "Reverse-lit channel letters" },
  { id: "raceway_channel", label: "Raceway Channel", family: "letter", color: "purple", description: "Letters mounted on a power-feed bar" },
  { id: "capsule_logo", label: "Capsule / Logo", family: "letter", color: "teal", description: "Capsule, pillbox, or logo elements" },
  { id: "dimensional_letters", label: "Dimensional Letters", family: "letter", color: "indigo", description: "Non-illuminated fabricated letters" },
  // Cabinet family — these use cabinet sizing
  { id: "monument_sign", label: "Monument Sign", family: "cabinet", color: "stone", description: "Ground-level monument cabinet" },
  { id: "pylon_sign", label: "Pylon Sign", family: "cabinet", color: "slate", description: "Tall pole-mounted cabinet" },
  { id: "post_and_panel", label: "Post & Panel", family: "cabinet", color: "emerald", description: "Panel mounted between posts" }
];
var SIGN_TYPES_BY_ID = SIGN_TYPES.reduce((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {});
var LETTER_SIZES = [
  { id: "extra_small", label: "XS", range: '2"\u20138"' },
  { id: "small", label: "Small", range: '8"\u201312"' },
  { id: "medium", label: "Medium", range: '12"\u201324"' },
  { id: "large", label: "Large", range: '24"\u201348"' },
  { id: "extra_large", label: "XL", range: '48"\u201360"' },
  { id: "extra_extra_large", label: "XXL", range: '60"+' }
];
var CABINET_SIZES = [
  { id: "cab_small", label: "Small Cabinet", range: "\u2264 16 sqft   (e.g. 4\xD74)" },
  { id: "cab_medium", label: "Medium Cabinet", range: "16\u201348 sqft  (e.g. 4\xD78 \u2013 6\xD78)" },
  { id: "cab_large", label: "Large Cabinet", range: "48\u2013100 sqft (e.g. 8\xD710)" },
  { id: "cab_extra_large", label: "XL Cabinet", range: "100+ sqft   (large pylons)" }
];
var ACTIONS = [
  // Cosmetic
  { id: "clean", label: "Clean", group: "Cosmetic" },
  { id: "repaint", label: "Repaint", group: "Cosmetic" },
  { id: "vinyl_replacement", label: "Vinyl Replacement", group: "Cosmetic" },
  { id: "reseal", label: "Reseal / Caulk", group: "Cosmetic" },
  // LED / Lamp
  { id: "led_retrofit", label: "LED Retrofit", group: "LED / Lamp" },
  { id: "replace_leds", label: "Replace LEDs", group: "LED / Lamp" },
  { id: "replace_fluorescent_tubes", label: "Replace Fluorescent Tubes", group: "LED / Lamp" },
  { id: "replace_ballast", label: "Replace Ballast", group: "LED / Lamp" },
  // Electrical
  { id: "replace_power_supplies", label: "Replace Power Supplies", group: "Electrical" },
  { id: "replace_transformer", label: "Replace Transformer", group: "Electrical" },
  { id: "fix_electrical", label: "Fix Electrical Issues", group: "Electrical" },
  { id: "rewire", label: "Rewire", group: "Electrical" },
  { id: "replace_breaker", label: "Replace Breaker", group: "Electrical" },
  { id: "replace_photocell", label: "Replace Photocell", group: "Electrical" },
  { id: "replace_timer", label: "Replace Timer", group: "Electrical" },
  { id: "replace_disconnect", label: "Replace Disconnect", group: "Electrical" },
  { id: "troubleshoot", label: "Troubleshoot", group: "Electrical" },
  // Structural / Component replacement
  { id: "replace_face", label: "Replace Face", group: "Component" },
  { id: "replace_returns", label: "Replace Returns", group: "Component" },
  { id: "replace_trim_cap", label: "Replace Trim Cap", group: "Component" }
];
var ACTIONS_BY_ID = ACTIONS.reduce((acc, a) => {
  acc[a.id] = a;
  return acc;
}, {});
var ACTION_GROUPS = Array.from(new Set(ACTIONS.map((a) => a.group)));
var ACTIONS_FOR_SIGN_TYPE = {
  flush_channel: ACTIONS.map((a) => a.id),
  halo_channel: ACTIONS.map((a) => a.id),
  raceway_channel: ACTIONS.map((a) => a.id),
  capsule_logo: ACTIONS.map((a) => a.id).filter((id) => !["replace_returns", "replace_trim_cap"].includes(id)),
  dimensional_letters: ["clean", "repaint", "vinyl_replacement", "reseal"],
  // no electrical
  monument_sign: ACTIONS.map((a) => a.id).filter((id) => !["replace_returns", "replace_trim_cap"].includes(id)),
  pylon_sign: ACTIONS.map((a) => a.id).filter((id) => !["replace_returns", "replace_trim_cap"].includes(id)),
  post_and_panel: ["clean", "repaint", "vinyl_replacement", "reseal", "replace_face"]
};
var sizeAxisFor = (signTypeId) => {
  const st = SIGN_TYPES_BY_ID[signTypeId];
  return st?.family === "cabinet" ? "cabinet" : "letter";
};

// frozen:/app/src/components/signMaintenance/defaults.jsx
var letterRow = (xs, s, m, l, xl, xxl) => ({
  extra_small: xs,
  small: s,
  medium: m,
  large: l,
  extra_large: xl,
  extra_extra_large: xxl
});
var cabinetRow = (s, m, l, xl) => ({
  cab_small: s,
  cab_medium: m,
  cab_large: l,
  cab_extra_large: xl
});
var flat = (mins) => ({ base_minutes_flat: mins });
var flush_channel = {
  // Cosmetic
  clean: { basis: "per_letter", row: letterRow(2, 3, 4, 6, 8, 12) },
  repaint: { basis: "per_letter", row: letterRow(8, 12, 18, 28, 42, 60) },
  vinyl_replacement: { basis: "per_letter", row: letterRow(6, 10, 15, 25, 38, 55) },
  reseal: { basis: "per_letter", row: letterRow(3, 5, 8, 12, 18, 25) },
  // LED / Lamp
  led_retrofit: { basis: "per_letter", row: letterRow(15, 22, 35, 55, 80, 110) },
  replace_leds: { basis: "per_letter", row: letterRow(8, 12, 20, 30, 45, 65) },
  replace_fluorescent_tubes: { basis: "per_letter", row: letterRow(6, 10, 15, 22, 32, 45) },
  replace_ballast: { basis: "per_letter", row: letterRow(10, 12, 15, 18, 22, 28) },
  // Electrical (per-letter where touching each letter, flat for diagnostic)
  replace_power_supplies: { basis: "flat", row: flat(45) },
  replace_transformer: { basis: "flat", row: flat(60) },
  fix_electrical: { basis: "flat", row: flat(60) },
  rewire: { basis: "per_letter", row: letterRow(8, 12, 18, 28, 40, 55) },
  replace_breaker: { basis: "flat", row: flat(45) },
  replace_photocell: { basis: "flat", row: flat(30) },
  replace_timer: { basis: "flat", row: flat(45) },
  replace_disconnect: { basis: "flat", row: flat(60) },
  troubleshoot: { basis: "flat", row: flat(60) },
  // Component
  replace_face: { basis: "per_letter", row: letterRow(12, 18, 28, 42, 60, 85) },
  replace_returns: { basis: "per_letter", row: letterRow(20, 30, 45, 70, 100, 140) },
  replace_trim_cap: { basis: "per_letter", row: letterRow(10, 15, 25, 38, 55, 78) }
};
var HALO_MULT = 1.35;
var scaleLetter = (src, mult) => {
  const out = {};
  Object.entries(src).forEach(([action, def]) => {
    if (def.basis === "flat") {
      out[action] = { basis: "flat", row: flat(Math.round(def.row.base_minutes_flat * mult)) };
    } else {
      const r = def.row;
      out[action] = { basis: "per_letter", row: letterRow(
        Math.round(r.extra_small * mult),
        Math.round(r.small * mult),
        Math.round(r.medium * mult),
        Math.round(r.large * mult),
        Math.round(r.extra_large * mult),
        Math.round(r.extra_extra_large * mult)
      ) };
    }
  });
  return out;
};
var halo_channel = scaleLetter(flush_channel, HALO_MULT);
var raceway_channel = scaleLetter(flush_channel, 1.15);
var capsule_logo = scaleLetter(flush_channel, 1.4);
var DIM_MULT = 0.7;
var dimensional_letters = {};
ACTIONS_FOR_SIGN_TYPE.dimensional_letters.forEach((actionId) => {
  const src = flush_channel[actionId];
  if (!src) return;
  if (src.basis === "flat") {
    dimensional_letters[actionId] = { basis: "flat", row: flat(Math.round(src.row.base_minutes_flat * DIM_MULT)) };
  } else {
    const r = src.row;
    dimensional_letters[actionId] = { basis: "per_letter", row: letterRow(
      Math.round(r.extra_small * DIM_MULT),
      Math.round(r.small * DIM_MULT),
      Math.round(r.medium * DIM_MULT),
      Math.round(r.large * DIM_MULT),
      Math.round(r.extra_large * DIM_MULT),
      Math.round(r.extra_extra_large * DIM_MULT)
    ) };
  }
});
var monument_sign = {
  clean: { basis: "per_cabinet", row: cabinetRow(30, 60, 120, 240) },
  repaint: { basis: "per_cabinet", row: cabinetRow(120, 240, 420, 720) },
  vinyl_replacement: { basis: "per_cabinet", row: cabinetRow(90, 180, 360, 600) },
  reseal: { basis: "per_cabinet", row: cabinetRow(45, 90, 150, 240) },
  led_retrofit: { basis: "per_cabinet", row: cabinetRow(240, 420, 720, 1200) },
  replace_leds: { basis: "per_cabinet", row: cabinetRow(120, 240, 420, 720) },
  replace_fluorescent_tubes: { basis: "per_cabinet", row: cabinetRow(90, 180, 300, 480) },
  replace_ballast: { basis: "per_cabinet", row: cabinetRow(45, 60, 90, 120) },
  replace_power_supplies: { basis: "per_cabinet", row: cabinetRow(60, 90, 120, 180) },
  replace_transformer: { basis: "per_cabinet", row: cabinetRow(90, 120, 150, 240) },
  fix_electrical: { basis: "flat", row: flat(90) },
  rewire: { basis: "per_cabinet", row: cabinetRow(120, 180, 300, 480) },
  replace_breaker: { basis: "flat", row: flat(60) },
  replace_photocell: { basis: "flat", row: flat(45) },
  replace_timer: { basis: "flat", row: flat(60) },
  replace_disconnect: { basis: "flat", row: flat(75) },
  troubleshoot: { basis: "flat", row: flat(75) },
  replace_face: { basis: "per_cabinet", row: cabinetRow(180, 360, 600, 960) }
};
var PYLON_MULT = 1.25;
var scaleCabinet = (src, mult) => {
  const out = {};
  Object.entries(src).forEach(([action, def]) => {
    if (def.basis === "flat") {
      out[action] = { basis: "flat", row: flat(Math.round(def.row.base_minutes_flat * mult)) };
    } else {
      const r = def.row;
      out[action] = { basis: "per_cabinet", row: cabinetRow(
        Math.round(r.cab_small * mult),
        Math.round(r.cab_medium * mult),
        Math.round(r.cab_large * mult),
        Math.round(r.cab_extra_large * mult)
      ) };
    }
  });
  return out;
};
var pylon_sign = scaleCabinet(monument_sign, PYLON_MULT);
var PNP_MULT = 0.6;
var post_and_panel = {};
ACTIONS_FOR_SIGN_TYPE.post_and_panel.forEach((actionId) => {
  const src = monument_sign[actionId];
  if (!src) return;
  if (src.basis === "flat") {
    post_and_panel[actionId] = { basis: "flat", row: flat(Math.round(src.row.base_minutes_flat * PNP_MULT)) };
  } else {
    const r = src.row;
    post_and_panel[actionId] = { basis: "per_cabinet", row: cabinetRow(
      Math.round(r.cab_small * PNP_MULT),
      Math.round(r.cab_medium * PNP_MULT),
      Math.round(r.cab_large * PNP_MULT),
      Math.round(r.cab_extra_large * PNP_MULT)
    ) };
  }
});
var SIZE_FIELD = {
  extra_small: "base_minutes_xs",
  small: "base_minutes_s",
  medium: "base_minutes_m",
  large: "base_minutes_l",
  extra_large: "base_minutes_xl",
  extra_extra_large: "base_minutes_xxl",
  cab_small: "base_minutes_cab_s",
  cab_medium: "base_minutes_cab_m",
  cab_large: "base_minutes_cab_l",
  cab_extra_large: "base_minutes_cab_xl"
};

// frozen:/app/src/components/signMaintenance/maintenanceCalculator.jsx
var MIN_TO_HR = 1 / 60;
var SIZE_TO_FIELD = {
  extra_small: "base_minutes_xs",
  small: "base_minutes_s",
  medium: "base_minutes_m",
  large: "base_minutes_l",
  extra_large: "base_minutes_xl",
  extra_extra_large: "base_minutes_xxl",
  cab_small: "base_minutes_cab_s",
  cab_medium: "base_minutes_cab_m",
  cab_large: "base_minutes_cab_l",
  cab_extra_large: "base_minutes_cab_xl"
};
var emptyServiceItem = () => ({
  description: "",
  sign_type: "flush_channel",
  size: "medium",
  qty: 10,
  installation_height_feet: 12,
  actions: [],
  // array of action ids
  materials: []
  // array of {inventory_item_id, item_name, quantity, unit_cost, total_cost}
});
var minutesForActionOnSize = (rates, signType, action, size) => {
  const rate = (rates || []).find((r) => r.sign_type === signType && r.action === action);
  if (!rate) return 0;
  if (rate.is_enabled === false) return 0;
  const field = SIZE_TO_FIELD[size];
  if (!field) return parseFloat(rate.base_minutes_flat) || 0;
  return parseFloat(rate[field]) || 0;
};
var calcServiceItem = (item, settings, rates, inventory) => {
  const techRate = parseFloat(settings.maintenance_tech_rate) || 65;
  const axis = sizeAxisFor(item.sign_type);
  const qty = parseFloat(item.qty) || 0;
  let totalMinutes = 0;
  (item.actions || []).forEach((actionId) => {
    if (actionId === "repaint" && isMonumentRepaint(item)) return;
    const perUnit = minutesForActionOnSize(rates, item.sign_type, actionId, item.size);
    totalMinutes += perUnit * (axis === "cabinet" ? Math.max(qty, 1) : qty);
  });
  let laborHours = totalMinutes * MIN_TO_HR;
  let repaintPaintCost = 0;
  const repaint = computeMonumentRepaint(item, settings);
  if (repaint) {
    laborHours += repaint.labor_hours;
    repaintPaintCost = repaint.paint_material_cost;
  }
  const laborCost = laborHours * techRate;
  const materials = (item.materials || []).map((m) => {
    const inv = (inventory || []).find((i) => i.id === (m.maintenance_rule_id || m.inventory_item_id));
    if (!inv) return { ...m, total_cost: (parseFloat(m.unit_cost) || 0) * (parseFloat(m.quantity) || 0) };
    return materialFromInventory(inv, item, m);
  });
  const materialsCost = materials.reduce((s, m) => s + (parseFloat(m.total_cost) || 0), 0) + repaintPaintCost;
  return {
    ...item,
    materials,
    labor_hours: laborHours,
    labor_cost: laborCost,
    materials_cost: materialsCost,
    repaint_calc: repaint || void 0,
    item_total_cost: laborCost + materialsCost
  };
};
var usageBasisQuantity = (item, basis) => {
  if (basis === "per_letter") return parseFloat(item.qty) || 0;
  if (basis === "per_cabinet") return Math.max(parseFloat(item.qty) || 0, 1);
  if (basis === "per_linear_foot") return parseFloat(item.linear_feet) || 0;
  if (basis === "per_sqft") return parseFloat(item.face_sqft) || 0;
  return 1;
};
var materialFromInventory = (inv, item, existing = null) => {
  const linked = !!(inv.inventory_entity && inv.inventory_item_id);
  if (linked) {
    const basis = inv.usage_basis || "per_service_item";
    const multiplier = Math.max(0, parseFloat(inv.usage_multiplier) || 0);
    const rawQuantity = usageBasisQuantity(item, basis) * multiplier;
    const autoQuantity = inv.usage_rounding === "ceil_whole" ? Math.ceil(rawQuantity) : rawQuantity;
    const quantity = existing?.quantity_override ? Math.max(0, parseFloat(existing.quantity) || 0) : autoQuantity;
    const unitCost = Number.isFinite(Number(inv._master_unit_cost)) ? Number(inv._master_unit_cost) : parseFloat(existing?.unit_cost) || 0;
    return {
      ...existing || {},
      maintenance_rule_id: inv.id,
      inventory_entity: inv.inventory_entity,
      inventory_item_id: inv.inventory_item_id,
      inventory_item_name: inv.inventory_item_name || inv._display_name || inv.item_name,
      item_name: inv._display_name || inv.inventory_item_name || inv.item_name,
      pricing_mode: inv._master_pricing_mode || existing?.pricing_mode || inv.pricing_mode,
      usage_basis: basis,
      usage_multiplier: multiplier,
      usage_rounding: inv.usage_rounding || "none",
      unit: inv._master_unit || existing?.unit || inv.unit || "unit",
      unit_cost: unitCost,
      auto_quantity: autoQuantity,
      quantity,
      quantity_override: !!existing?.quantity_override,
      link_missing: !!inv._master_missing,
      total_cost: unitCost * quantity
    };
  }
  const m = {
    ...existing || {},
    maintenance_rule_id: inv.id,
    inventory_item_id: inv.id,
    item_name: inv.item_name,
    pricing_mode: inv.pricing_mode,
    unit: inv.unit || inv.pricing_mode || "unit",
    unit_cost: 0,
    quantity: 0,
    total_cost: 0
  };
  const sizeKey = `cost_${item.size}`;
  if (inv.pricing_mode === "per_letter_flat") {
    m.unit_cost = parseFloat(inv.cost_per_letter) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_letter_by_size" || inv.pricing_mode === "per_cabinet_by_size") {
    m.unit_cost = parseFloat(inv[sizeKey]) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_cabinet_flat") {
    m.unit_cost = parseFloat(inv.cost_per_cabinet) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_linear_foot") {
    m.unit_cost = parseFloat(inv.cost_per_foot) || 0;
    m.quantity = parseFloat(item.linear_feet) || 0;
  } else if (inv.pricing_mode === "per_sqft") {
    m.unit_cost = parseFloat(inv.cost_per_sqft) || 0;
    m.quantity = parseFloat(item.face_sqft) || 0;
  } else if (inv.pricing_mode === "per_project_flat") {
    m.unit_cost = parseFloat(inv.cost_flat) || 0;
    m.quantity = 1;
  }
  if (existing?.quantity_override) m.quantity = Math.max(0, parseFloat(existing.quantity) || 0);
  m.quantity_override = !!existing?.quantity_override;
  m.auto_quantity = m.quantity;
  m.total_cost = m.unit_cost * m.quantity;
  return m;
};
var defaultMaterialsForItem = (item, inventory) => {
  return (inventory || []).filter((inv) => {
    if (inv.is_active === false || !inv.is_default || inv._master_missing) return false;
    const types = inv.applies_to_item_types || [];
    const sizes = inv.applies_to_sizes || [];
    const actions = inv.applies_to_actions || [];
    if (types.length > 0 && !types.includes(item.sign_type)) return false;
    if (sizes.length > 0 && !sizes.includes(item.size)) return false;
    if (actions.length > 0) {
      const itemActions = item.actions || [];
      if (!actions.some((a) => itemActions.includes(a))) return false;
    }
    return true;
  }).map((inv) => materialFromInventory(inv, item));
};
var calcProjectTotals = (project) => {
  const items = project.items || [];
  const total_materials_cost = items.reduce((s, it) => s + (parseFloat(it.materials_cost) || 0), 0);
  const labor_cost = items.reduce((s, it) => s + (parseFloat(it.labor_cost) || 0), 0);
  const labor_hours = items.reduce((s, it) => s + (parseFloat(it.labor_hours) || 0), 0);
  const total_equipment_cost = (project.selected_equipment || []).reduce((s, e) => s + (parseFloat(e.total_cost) || 0), 0);
  const total_personnel_cost = (project.personnel || []).reduce((s, p) => s + (parseFloat(p.total_cost) || 0), 0);
  const pct = parseFloat(project.supplies_percent_of_materials);
  const suppliesPct = isNaN(pct) ? 10 : pct;
  const extra = parseFloat(project.extra_supplies_cost) || 0;
  const total_supplies_cost = total_materials_cost * (suppliesPct / 100) + extra;
  const total_travel_cost = parseFloat(project.total_travel_cost) || 0;
  const subtotal = labor_cost + total_materials_cost + total_supplies_cost + total_equipment_cost + total_personnel_cost + total_travel_cost;
  const markupPct = parseFloat(project.markup_percent) || 0;
  const markup_amount = subtotal * (markupPct / 100);
  const total_cost = subtotal + markup_amount;
  return {
    labor_hours,
    labor_cost,
    total_materials_cost,
    total_supplies_cost,
    total_equipment_cost,
    total_personnel_cost,
    total_travel_cost,
    subtotal,
    markup_amount,
    total_cost
  };
};

// frozen:/app/src/components/signMaintenance/maintenancePricingAvailability.js
var STRICT_NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
var maintenanceStrictNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !STRICT_NUM_RE.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};
var maintenanceNonNegativeNumber = (value) => {
  const n = maintenanceStrictNumber(value);
  return n === null || n < 0 ? null : n;
};
var maintenancePositiveNumber = (value) => {
  const n = maintenanceStrictNumber(value);
  return n === null || n <= 0 ? null : n;
};
var maintenanceSettingRecorded = (value) => value !== void 0 && value !== null && !(typeof value === "string" && value.trim() === "");
var maintenancePresent = (value) => value !== void 0 && value !== null;
var maintenanceIssue = (kind, spec) => ({
  kind,
  index: spec.index ?? null,
  itemIndex: spec.itemIndex ?? null,
  materialIndex: spec.materialIndex ?? null,
  field: spec.field,
  code: spec.code,
  message: spec.message,
  hold: spec.hold,
  componentId: spec.componentId ?? null,
  inventoryId: spec.inventoryId ?? null
});
var INPUT = "maintenance";
var CATALOG = "maintenance_catalog";
var USAGE_BASES = ["per_letter", "per_cabinet", "per_linear_foot", "per_sqft", "per_service_item"];
var DETACHED_PRICING_MODES = [
  "per_letter_flat",
  "per_letter_by_size",
  "per_cabinet_flat",
  "per_cabinet_by_size",
  "per_linear_foot",
  "per_sqft",
  "per_project_flat"
];
var detachedCostField = (mode, size) => {
  if (mode === "per_letter_flat") return "cost_per_letter";
  if (mode === "per_letter_by_size" || mode === "per_cabinet_by_size") return `cost_${size}`;
  if (mode === "per_cabinet_flat") return "cost_per_cabinet";
  if (mode === "per_linear_foot") return "cost_per_foot";
  if (mode === "per_sqft") return "cost_per_sqft";
  if (mode === "per_project_flat") return "cost_flat";
  return null;
};
var basisItemField = (basis) => {
  if (basis === "per_letter" || basis === "per_letter_flat" || basis === "per_letter_by_size") return "qty";
  if (basis === "per_cabinet" || basis === "per_cabinet_flat" || basis === "per_cabinet_by_size") return "qty";
  if (basis === "per_linear_foot") return "linear_feet";
  if (basis === "per_sqft") return "face_sqft";
  return null;
};
var PAINT_MODES = ["entire_panel", "returns_only"];
var SECOND_COLOR_MASKS = ["none", "paint_mask"];
var LIOUID_UNITS = ["oz", "pint", "quart", "liter", "gallon"];
var DIM_BANDS = [
  { max: 4, key: "lettering_extra_small_prep_multiplier" },
  { max: 8, key: "lettering_small_prep_multiplier" },
  { max: 12, key: "lettering_normal_prep_multiplier" },
  { max: 20, key: "lettering_medium_prep_multiplier" },
  { max: 30, key: "lettering_large_prep_multiplier" },
  { max: Infinity, key: "lettering_extra_large_prep_multiplier" }
];
var dimBandKey = (heightIn) => (DIM_BANDS.find((b) => heightIn <= b.max) || DIM_BANDS[DIM_BANDS.length - 1]).key;
var ROLE_RATE_SETTING = {
  "Crew Lead": "maintenance_crew_lead_rate",
  "Installer": "maintenance_tech_rate",
  "Helper": "maintenance_helper_rate"
};
var TRAVEL_SETTING_CHECKS = [
  { mKey: "maintenance_gasoline_price_per_gallon", iKey: "install_gasoline_price_per_gallon", positive: true, label: "gasoline price/gal" },
  { mKey: "maintenance_diesel_price_per_gallon", iKey: "install_diesel_price_per_gallon", positive: true, label: "diesel price/gal" },
  { mKey: "maintenance_travel_labor_rate", iKey: "install_travel_labor_rate", positive: true, label: "travel labor rate" },
  { mKey: "maintenance_travel_avg_speed_mph", iKey: "install_travel_avg_speed_mph", positive: true, label: "travel avg speed" },
  { mKey: "maintenance_travel_overhead_per_mile", iKey: "install_travel_overhead_per_mile", positive: false, label: "travel overhead/mile" },
  { mKey: "maintenance_min_travel_charge", iKey: "install_min_travel_charge", positive: false, label: "minimum travel charge" }
];
var REPAINT_SETTING_CHECKS = [
  { key: "maintenance_repaint_coverage_sqft_per_gallon", positive: true },
  { key: "maintenance_repaint_paint_cost_per_gallon", positive: false },
  { key: "maintenance_repaint_primer_coats", positive: false },
  { key: "maintenance_repaint_finish_coats", positive: false },
  { key: "maintenance_repaint_sqft_per_hour", positive: true },
  { key: "maintenance_repaint_condition_step_pct", positive: false }
];
var DIM_SETTING_CHECKS = [
  { key: "letter_perimeter_factor", positive: true },
  { key: "paint_waste_multiplier", positive: true },
  { key: "mixed_paint_coverage_sqft_per_gallon", positive: true },
  { key: "base_labor_hours_per_sqft", positive: false },
  { key: "paint_mix_ratio", positive: true },
  { key: "hardener_mix_ratio", positive: false },
  { key: "reducer_mix_ratio", positive: false },
  { key: "paint_cost_per_unit", positive: false },
  { key: "hardener_cost_per_unit", positive: false },
  { key: "reducer_cost_per_unit", positive: false }
];
var DIM_MASK_CHECKS = [
  { key: "paint_mask_rate_per_sqft", absentFlags: true },
  { key: "paint_mask_machine_cutting_rate_per_sqft", absentFlags: true },
  { key: "paint_mask_cutting_labor_rate_per_sqft", absentFlags: true },
  { key: "paint_mask_application_labor_rate_per_sqft", absentFlags: true },
  { key: "default_labor_rate", absentFlags: false, positive: true }
];
var maintenanceItemIssues = (item, index, { rates = [], inventory = [] } = {}) => {
  const issues = [];
  const context = {
    hasItems: true,
    hasRepaint: false,
    featuresUsed: /* @__PURE__ */ new Set(),
    dimEnabled: false,
    dimBandsUsed: /* @__PURE__ */ new Set(),
    dimMaskUsed: false,
    neededItemFields: /* @__PURE__ */ new Set()
  };
  const emit = (kind, spec) => issues.push(maintenanceIssue(kind, { itemIndex: index, ...spec }));
  const itemName = item?.description || item?.sign_type || `item ${index + 1}`;
  const isRepaint = isMonumentRepaint(item);
  if (isRepaint) context.hasRepaint = true;
  if (maintenancePresent(item?.actions) && !Array.isArray(item.actions)) {
    emit(INPUT, {
      field: "actions",
      code: "maintenance_actions_unavailable",
      hold: "item",
      message: `Service item "${itemName}" has an unreadable action list \u2014 pricing is held.`
    });
  } else {
    for (const actionId of item?.actions || []) {
      if (actionId === "repaint" && isRepaint) continue;
      const actionLabel = ACTIONS_BY_ID[actionId]?.label || actionId;
      const rate = (rates || []).find((r) => r.sign_type === item?.sign_type && r.action === actionId);
      if (!rate) {
        emit(CATALOG, {
          field: "actions",
          code: "maintenance_rate_unavailable",
          hold: "item",
          inventoryId: `${item?.sign_type}/${actionId}`,
          message: `No MaintenanceActionRate row exists for "${SIGN_TYPES_BY_ID[item?.sign_type]?.label || item?.sign_type} \xD7 ${actionLabel}" \u2014 labor is held instead of charging $0. Add the row in Sign Maintenance Settings.`
        });
        continue;
      }
      if (rate.is_enabled === false) {
        emit(CATALOG, {
          field: "actions",
          code: "maintenance_rate_disabled",
          hold: "item",
          inventoryId: rate.id,
          message: `The "${actionLabel}" rate is disabled in Settings but still selected on "${itemName}" \u2014 remove the action or re-enable the rate.`
        });
        continue;
      }
      const field = SIZE_FIELD[item?.size] || "base_minutes_flat";
      const minutes = maintenanceStrictNumber(rate[field]);
      if (minutes === null || minutes <= 0) {
        emit(CATALOG, {
          field: "actions",
          code: "maintenance_rate_unavailable",
          hold: "item",
          inventoryId: rate.id,
          message: `The "${actionLabel}" rate has no usable minutes for size "${item?.size || "flat"}" (field ${field}) \u2014 labor is held instead of charging $0.`
        });
      }
    }
  }
  const axis = sizeAxisFor(item?.sign_type);
  const q = maintenanceStrictNumber(item?.qty);
  if (q === null || (axis === "cabinet" ? q < 1 : q <= 0)) {
    emit(INPUT, {
      field: "qty",
      code: "maintenance_quantity_unavailable",
      hold: "item",
      message: `Service item "${itemName}" needs a positive ${axis === "cabinet" ? "cabinet count" : "letter count"} \u2014 pricing is held.`
    });
  }
  if (maintenancePresent(item?.materials) && !Array.isArray(item.materials)) {
    emit(INPUT, {
      field: "materials",
      code: "maintenance_materials_unavailable",
      hold: "item",
      message: `Service item "${itemName}" has an unreadable materials list \u2014 pricing is held.`
    });
  } else {
    (item?.materials || []).forEach((m, materialIndex) => {
      const matEmit = (kind, spec) => emit(kind, { materialIndex, ...spec });
      const mName = m?.item_name || `material ${materialIndex + 1}`;
      const ruleId = m?.maintenance_rule_id || m?.inventory_item_id || "";
      const rule = ruleId ? (inventory || []).find((i) => i.id === ruleId) : null;
      if (!rule) {
        if (ruleId) {
          matEmit(INPUT, {
            field: "materials",
            code: "maintenance_material_rule_unavailable",
            hold: "item",
            inventoryId: ruleId,
            message: `Material "${mName}" references a maintenance rule that no longer exists \u2014 its stored price is held.`
          });
        } else {
          if (maintenanceNonNegativeNumber(m?.unit_cost) === null) {
            matEmit(INPUT, {
              field: "materials",
              code: "maintenance_material_price_unavailable",
              hold: "item",
              message: `Material "${mName}" has no usable stored unit cost \u2014 held instead of $0.`
            });
          }
          if (maintenanceNonNegativeNumber(m?.quantity) === null) {
            matEmit(INPUT, {
              field: "materials",
              code: "maintenance_material_quantity_unavailable",
              hold: "item",
              message: `Material "${mName}" has no usable stored quantity \u2014 held.`
            });
          }
        }
        return;
      }
      if (rule.is_active === false) {
        matEmit(CATALOG, {
          field: "materials",
          code: "maintenance_material_rule_unavailable",
          hold: "item",
          inventoryId: rule.id,
          message: `Material "${mName}" uses an inactive material rule \u2014 held.`
        });
        return;
      }
      const linked = !!(rule.inventory_entity && rule.inventory_item_id);
      if (rule._master_missing === true || m?.link_missing === true) {
        matEmit(CATALOG, {
          field: "materials",
          code: "maintenance_material_link_unavailable",
          hold: "item",
          inventoryId: rule.id,
          componentId: rule.inventory_item_id,
          message: `Material "${mName}" is linked to a Master Inventory row that no longer exists \u2014 relink it in Maintenance Settings or remove the material.`
        });
        return;
      }
      if (linked) {
        const basis = rule.usage_basis || "per_service_item";
        if (!USAGE_BASES.includes(basis)) {
          matEmit(CATALOG, {
            field: "materials",
            code: "maintenance_material_usage_unavailable",
            hold: "item",
            inventoryId: rule.id,
            message: `Material "${mName}" has an unknown usage basis "${basis}" \u2014 held.`
          });
        }
        const multiplier = maintenanceStrictNumber(rule.usage_multiplier);
        if (multiplier === null || multiplier <= 0) {
          matEmit(CATALOG, {
            field: "materials",
            code: "maintenance_material_usage_unavailable",
            hold: "item",
            inventoryId: rule.id,
            message: `Material "${mName}" has no positive usage multiplier \u2014 held instead of consuming 0.`
          });
        }
        const masterCost = maintenanceStrictNumber(rule._master_unit_cost);
        if (masterCost !== null) {
          if (masterCost < 0) {
            matEmit(CATALOG, {
              field: "materials",
              code: "maintenance_material_price_unavailable",
              hold: "item",
              inventoryId: rule.id,
              componentId: rule.inventory_item_id,
              message: `Material "${mName}" resolved a negative Master Inventory cost \u2014 held.`
            });
          }
        } else if (maintenanceNonNegativeNumber(m?.unit_cost) === null) {
          matEmit(INPUT, {
            field: "materials",
            code: "maintenance_material_price_unavailable",
            hold: "item",
            inventoryId: rule.id,
            componentId: rule.inventory_item_id,
            message: `Material "${mName}" resolved no Master Inventory price and has no usable stored unit cost \u2014 held instead of $0.`
          });
        }
        const needed = basisItemField(basis);
        if (needed) context.neededItemFields.add(needed);
      } else {
        const mode = rule.pricing_mode;
        if (!DETACHED_PRICING_MODES.includes(mode)) {
          matEmit(CATALOG, {
            field: "materials",
            code: "maintenance_material_pricing_mode_unavailable",
            hold: "item",
            inventoryId: rule.id,
            message: `Material "${mName}" has an unknown pricing mode "${mode || "unset"}" \u2014 held.`
          });
        } else {
          const costField = detachedCostField(mode, item?.size);
          const cost = maintenanceStrictNumber(rule[costField]);
          if (cost === null || cost < 0) {
            matEmit(CATALOG, {
              field: "materials",
              code: "maintenance_material_price_unavailable",
              hold: "item",
              inventoryId: rule.id,
              message: `Material "${mName}" has no usable ${costField} price for size "${item?.size}" \u2014 held instead of $0.`
            });
          }
          const needed = basisItemField(mode);
          if (needed) context.neededItemFields.add(needed);
        }
      }
      if (m?.quantity_override === true && maintenanceNonNegativeNumber(m?.quantity) === null) {
        matEmit(INPUT, {
          field: "quantity",
          code: "maintenance_material_quantity_unavailable",
          hold: "item",
          inventoryId: rule.id,
          message: `Material "${mName}" has an overridden quantity that is not a usable number \u2014 held.`
        });
      }
    });
  }
  for (const field of context.neededItemFields) {
    const v = maintenanceStrictNumber(item?.[field]);
    if (v === null || v <= 0) {
      emit(INPUT, {
        field,
        code: "maintenance_item_field_unavailable",
        hold: "item",
        message: `Service item "${itemName}" needs a positive ${field === "face_sqft" ? "face/work area (sq ft)" : "linear feet"} for its materials \u2014 pricing is held.`
      });
    }
  }
  if (isRepaint) {
    if (maintenancePresent(item?.repaint_config) && (typeof item.repaint_config !== "object" || item.repaint_config === null || Array.isArray(item.repaint_config))) {
      emit(INPUT, {
        field: "repaint_config",
        code: "maintenance_repaint_config_unavailable",
        hold: "item",
        message: `Service item "${itemName}" has an unreadable repaint configuration \u2014 pricing is held.`
      });
    } else {
      const cfg = item?.repaint_config || {};
      const repEmit = ({ field, ...rest }) => emit(INPUT, { field: `repaint_config.${field}`, ...rest });
      const L = maintenanceStrictNumber(cfg.length_ft);
      if (L === null || L <= 0) repEmit({
        field: "length_ft",
        code: "maintenance_repaint_dimension_unavailable",
        hold: "item",
        message: `Repaint on "${itemName}" needs a positive cabinet length.`
      });
      const H = maintenanceStrictNumber(cfg.height_ft);
      if (H === null || H <= 0) repEmit({
        field: "height_ft",
        code: "maintenance_repaint_dimension_unavailable",
        hold: "item",
        message: `Repaint on "${itemName}" needs a positive cabinet height.`
      });
      if (maintenancePresent(cfg.paint_mode) && !PAINT_MODES.includes(cfg.paint_mode)) {
        repEmit({
          field: "paint_mode",
          code: "maintenance_repaint_mode_unavailable",
          hold: "item",
          message: `Repaint on "${itemName}" has an unknown paint scope "${cfg.paint_mode}".`
        });
      }
      const returnsOnly = cfg.paint_mode === "returns_only";
      const literalEntirePanel = cfg.paint_mode === "entire_panel";
      if (!returnsOnly) {
        if (maintenancePresent(cfg.return_depth_in)) {
          const rd = maintenanceStrictNumber(cfg.return_depth_in);
          if (rd === null || rd < 0) repEmit({
            field: "return_depth_in",
            code: "maintenance_repaint_dimension_unavailable",
            hold: "item",
            message: `Repaint on "${itemName}" has an unusable return depth.`
          });
        }
      } else {
        const rw = maintenanceStrictNumber(cfg.retainer_width_in);
        if (rw === null || rw <= 0) repEmit({
          field: "retainer_width_in",
          code: "maintenance_repaint_dimension_unavailable",
          hold: "item",
          message: `Returns-only repaint on "${itemName}" needs a positive retainer width.`
        });
      }
      if (maintenancePresent(cfg.features) && !Array.isArray(cfg.features)) {
        repEmit({
          field: "features",
          code: "maintenance_repaint_features_unavailable",
          hold: "item",
          message: `Repaint on "${itemName}" has an unreadable feature list.`
        });
      }
      if (maintenancePresent(cfg.paint_condition)) {
        const pc = maintenanceStrictNumber(cfg.paint_condition);
        if (pc === null || pc < 1 || pc > 10) repEmit({
          field: "paint_condition",
          code: "maintenance_repaint_condition_unavailable",
          hold: "item",
          message: `Repaint on "${itemName}" needs a paint condition between 1 and 10.`
        });
      }
      if (literalEntirePanel && Array.isArray(cfg.features)) {
        for (const f of cfg.features) {
          if (REPAINT_FEATURES.some((rf) => rf.id === f)) context.featuresUsed.add(f);
        }
      }
      const dl = cfg.dim_letter_paint;
      if (maintenancePresent(dl) && (typeof dl !== "object" || dl === null || Array.isArray(dl))) {
        repEmit({
          field: "dim_letter_paint",
          code: "maintenance_dim_letter_config_unavailable",
          hold: "item",
          message: `Repaint on "${itemName}" has an unreadable dimensional-letter paint config.`
        });
      } else if (literalEntirePanel && (cfg.features || []).includes("dimensional_letters") && dl?.enabled) {
        context.dimEnabled = true;
        const dlEmit = ({ field, ...rest }) => emit(INPUT, { field: `dim_letter_paint.${field}`, ...rest });
        const dq = maintenanceStrictNumber(dl.qty);
        if (dq === null || dq <= 0) dlEmit({
          field: "qty",
          code: "maintenance_dim_letter_input_unavailable",
          hold: "item",
          message: `Dimensional-letter paint on "${itemName}" needs a positive letter count \u2014 otherwise it is silently skipped.`
        });
        const dh = maintenanceStrictNumber(dl.avg_height_in);
        if (dh === null || dh <= 0) dlEmit({
          field: "avg_height_in",
          code: "maintenance_dim_letter_input_unavailable",
          hold: "item",
          message: `Dimensional-letter paint on "${itemName}" needs a positive average height.`
        });
        else context.dimBandsUsed.add(dimBandKey(dh));
        const dt = maintenanceStrictNumber(dl.thickness_in);
        if (dt === null || dt < 0) dlEmit({
          field: "thickness_in",
          code: "maintenance_dim_letter_input_unavailable",
          hold: "item",
          message: `Dimensional-letter paint on "${itemName}" has an unusable thickness.`
        });
        if (maintenancePresent(dl.second_color_mask) && !SECOND_COLOR_MASKS.includes(dl.second_color_mask)) {
          dlEmit({
            field: "second_color_mask",
            code: "maintenance_dim_letter_input_unavailable",
            hold: "item",
            message: `Dimensional-letter paint on "${itemName}" has an unknown second-color mask "${dl.second_color_mask}".`
          });
        }
        if (dl.second_color_mask === "paint_mask") context.dimMaskUsed = true;
      }
    }
  }
  return { issues, context };
};
var maintenanceSettingIssues = (settings, context = {}) => {
  const issues = [];
  const emitted = /* @__PURE__ */ new Set();
  const emit = (key, code, label, extra = {}) => {
    if (emitted.has(key + code)) return;
    emitted.add(key + code);
    issues.push(maintenanceIssue(CATALOG, {
      field: key,
      code,
      hold: "project",
      message: `${label} ("${key}") is missing or unusable \u2014 update it in Sign Maintenance Settings before saving.`,
      ...extra
    }));
  };
  const check = (key, { positive = false, code = "maintenance_setting_unavailable", label = "A Settings value", absentFlags = false } = {}) => {
    const v = settings?.[key];
    if (!maintenanceSettingRecorded(v)) {
      if (absentFlags) emit(key, code, label);
      return;
    }
    const n = maintenanceStrictNumber(v);
    if (n === null || (positive ? n <= 0 : n < 0)) emit(key, code, label);
  };
  if (context.hasItems) {
    check("maintenance_tech_rate", { positive: true, code: "maintenance_labor_rate_unavailable", label: "Maintenance tech rate" });
  }
  for (const role of context.rolesPresent || []) {
    const key = ROLE_RATE_SETTING[role];
    if (key) check(key, { positive: true, code: "maintenance_crew_rate_unavailable", label: `${role} rate` });
  }
  if (context.hasRepaint) {
    for (const { key, positive } of REPAINT_SETTING_CHECKS) {
      check(key, { positive, code: "maintenance_repaint_setting_unavailable", label: "Repaint setting" });
    }
    for (const featureId of context.featuresUsed || []) {
      const feature = REPAINT_FEATURES.find((f) => f.id === featureId);
      if (feature) check(feature.setting, { code: "maintenance_repaint_setting_unavailable", label: `Repaint "${feature.label}" multiplier` });
    }
  }
  if (context.dimEnabled) {
    for (const { key, positive } of DIM_SETTING_CHECKS) {
      check(key, { positive, code: "maintenance_dim_letter_setting_unavailable", label: "Paint Estimator setting" });
    }
    const parts = ["paint_mix_ratio", "hardener_mix_ratio", "reducer_mix_ratio"].reduce((s, k) => s + (maintenanceNonNegativeNumber(settings?.[k]) ?? 0), 0);
    if (parts <= 0) {
      emit(
        "paint_mix_ratio",
        "maintenance_dim_letter_setting_unavailable",
        "Paint Estimator mix ratios (all zero \u2014 paint cost would be $0)"
      );
    }
    for (const bandKey of context.dimBandsUsed || []) {
      check(bandKey, { code: "maintenance_dim_letter_setting_unavailable", label: "Letter prep multiplier" });
    }
    for (const [costKey, unitKey] of [["paint_cost_per_unit", "paint_unit"], ["hardener_cost_per_unit", "hardener_unit"], ["reducer_cost_per_unit", "reducer_unit"]]) {
      const unit = settings?.[unitKey];
      const unitOk = LIOUID_UNITS.includes(unit);
      if (maintenanceSettingRecorded(unit) && !unitOk) {
        emit(unitKey, "maintenance_dim_letter_setting_unavailable", "Paint Estimator liquid unit");
      } else if (!unitOk && (maintenanceNonNegativeNumber(settings?.[costKey]) || 0) > 0) {
        emit(unitKey, "maintenance_dim_letter_setting_unavailable", "Paint Estimator liquid unit");
      }
    }
    if (context.dimMaskUsed) {
      for (const { key, positive } of DIM_MASK_CHECKS) {
        check(key, { positive: !!positive, absentFlags: true, code: "maintenance_dim_letter_setting_unavailable", label: "Paint Estimator mask setting" });
      }
    }
  }
  if (context.milesPositive) {
    for (const { mKey, iKey, positive, label } of TRAVEL_SETTING_CHECKS) {
      const mv = settings?.[mKey];
      const iv = settings?.[iKey];
      if (maintenanceSettingRecorded(mv)) {
        const n = maintenanceStrictNumber(mv);
        if (n === null || (positive ? n <= 0 : n < 0)) {
          emit(mKey, "maintenance_travel_setting_unavailable", `Travel ${label}`);
        }
      } else if (maintenanceSettingRecorded(iv)) {
        const n = maintenanceStrictNumber(iv);
        if (n === null || (positive ? n <= 0 : n < 0)) {
          emit(iKey, "maintenance_travel_setting_unavailable", `Travel ${label}`);
        }
      }
    }
  }
  return issues;
};
var maintenanceProjectInputIssues = (project, { equipmentInventory = [] } = {}) => {
  const issues = [];
  const context = { rolesPresent: /* @__PURE__ */ new Set(), milesPositive: false, ownedVehiclesUsed: [] };
  const emit = (spec) => issues.push(maintenanceIssue(INPUT, spec));
  if (maintenancePresent(project?.items) && !Array.isArray(project.items)) {
    emit({
      field: "items",
      code: "maintenance_items_unavailable",
      hold: "project",
      message: "The service-item list is unreadable \u2014 the entire estimate is held."
    });
  }
  const pctChecks = [
    ["supplies_percent_of_materials", "maintenance_supplies_rate_unavailable", "Supplies % of materials"],
    ["extra_supplies_cost", "maintenance_extra_supplies_unavailable", "Extra supplies cost"],
    ["markup_percent", "maintenance_markup_unavailable", "Markup %"],
    ["total_travel_cost", "maintenance_travel_unavailable", "Travel cost"]
  ];
  for (const [field, code, label] of pctChecks) {
    const v = project?.[field];
    if (maintenancePresent(v) && maintenanceNonNegativeNumber(v) === null) {
      emit({
        field,
        code,
        hold: "project",
        message: `${label} is recorded but not a usable non-negative number \u2014 the estimate is held instead of silently substituting a default.`
      });
    }
  }
  const miles = project?.travel_miles_round_trip;
  if (maintenancePresent(miles) && maintenanceNonNegativeNumber(miles) === null) {
    emit({
      field: "travel_miles_round_trip",
      code: "maintenance_travel_unavailable",
      hold: "project",
      message: "Round-trip miles is recorded but not a usable non-negative number."
    });
  }
  context.milesPositive = (maintenanceNonNegativeNumber(miles) || 0) > 0;
  const OWNED_VEHICLE_TYPES = /* @__PURE__ */ new Set(["truck", "van", "flatbed", "car", "boom_truck"]);
  if (maintenancePresent(project?.selected_equipment) && !Array.isArray(project.selected_equipment)) {
    emit({
      field: "selected_equipment",
      code: "maintenance_equipment_unavailable",
      hold: "project",
      message: "The equipment selection is unreadable \u2014 the estimate is held."
    });
  } else {
    (project?.selected_equipment || []).forEach((e, index) => {
      const name = e?.equipment_name || e?.name || `equipment ${index + 1}`;
      const inv = e?.equipment_id ? (equipmentInventory || []).find((i) => i.id === e.equipment_id) : null;
      if (e?.equipment_id && !inv) {
        emit({
          field: "selected_equipment",
          index,
          code: "maintenance_equipment_unavailable",
          hold: "project",
          inventoryId: e.equipment_id,
          message: `Selected equipment "${name}" no longer exists in the inventory \u2014 the estimate is held.`
        });
      }
      if (maintenanceNonNegativeNumber(e?.total_cost) === null) {
        emit({
          field: "selected_equipment",
          index,
          code: "maintenance_equipment_cost_unavailable",
          hold: "project",
          inventoryId: e?.equipment_id ?? null,
          message: `Selected equipment "${name}" has no usable total cost \u2014 a missing price is not free.`
        });
      }
      if (context.milesPositive && inv && inv.ownership === "owned" && OWNED_VEHICLE_TYPES.has(inv.equipment_type)) {
        const mpg = maintenancePositiveNumber(inv.mpg);
        if (mpg === null) {
          issues.push(maintenanceIssue(CATALOG, {
            field: "selected_equipment",
            index,
            code: "maintenance_vehicle_mpg_unavailable",
            hold: "project",
            inventoryId: inv.id,
            message: `Selected owned vehicle "${inv.equipment_name || name}" has no positive MPG \u2014 travel fuel cost is silently skipping it.`
          }));
        }
      }
    });
  }
  if (maintenancePresent(project?.personnel) && !Array.isArray(project.personnel)) {
    emit({
      field: "personnel",
      code: "maintenance_personnel_unavailable",
      hold: "project",
      message: "The personnel list is unreadable \u2014 the estimate is held."
    });
  } else {
    (project?.personnel || []).forEach((p, index) => {
      if (p?.role && ROLE_RATE_SETTING[p.role]) context.rolesPresent.add(p.role);
      if (maintenanceNonNegativeNumber(p?.total_cost) === null) {
        emit({
          field: "personnel",
          index,
          code: "maintenance_personnel_cost_unavailable",
          hold: "project",
          message: `Personnel row ${index + 1} ("${p?.role || "crew"}") has no usable total cost \u2014 a missing price is not free.`
        });
      }
    });
  }
  return { issues, context };
};
var ITEM_DERIVED = ["labor_hours", "labor_cost", "materials_cost", "item_total_cost"];
var TOTAL_FIELDS = [
  "labor_hours",
  "labor_cost",
  "total_materials_cost",
  "total_supplies_cost",
  "total_equipment_cost",
  "total_personnel_cost",
  "total_travel_cost",
  "subtotal",
  "markup_amount",
  "total_cost"
];
var nullTotals = () => Object.fromEntries(TOTAL_FIELDS.map((f) => [f, null]));
var heldItem = (item, heldMaterialIndexes) => {
  const materials = (item.materials || []).map((m, i) => heldMaterialIndexes.has(i) ? { ...m, total_cost: null } : m);
  const out = { ...item, materials, repaint_calc: void 0 };
  for (const f of ITEM_DERIVED) out[f] = null;
  return out;
};
var calcMaintenanceProject = (project = {}, { settings = {}, rates = [], inventory = [], equipmentInventory = [] } = {}) => {
  const issues = [];
  const itemContexts = [];
  const itemScan = [];
  const rawItems = Array.isArray(project?.items) ? project.items : [];
  rawItems.forEach((item, index) => {
    const r = maintenanceItemIssues(item, index, { rates, inventory });
    itemScan.push(r);
    issues.push(...r.issues);
    itemContexts.push(r.context);
  });
  const proj = maintenanceProjectInputIssues(project, { equipmentInventory });
  issues.push(...proj.issues);
  const merged = {
    hasItems: rawItems.length > 0,
    hasRepaint: itemContexts.some((c) => c.hasRepaint),
    featuresUsed: new Set(itemContexts.flatMap((c) => [...c.featuresUsed])),
    dimEnabled: itemContexts.some((c) => c.dimEnabled),
    dimBandsUsed: new Set(itemContexts.flatMap((c) => [...c.dimBandsUsed])),
    dimMaskUsed: itemContexts.some((c) => c.dimMaskUsed),
    rolesPresent: proj.context.rolesPresent,
    milesPositive: proj.context.milesPositive
  };
  issues.push(...maintenanceSettingIssues(settings, merged));
  const calcItems = rawItems.map((it) => calcServiceItem(it, settings, rates, inventory));
  const calcTotals = calcProjectTotals({ ...project, items: calcItems });
  const held = issues.length > 0;
  const hasProjectHold = issues.some((i) => i.hold === "project");
  const itemHolds = /* @__PURE__ */ new Set();
  const materialHolds = /* @__PURE__ */ new Map();
  for (const i of issues) {
    if (i.hold === "item" && i.itemIndex !== null) itemHolds.add(i.itemIndex);
    if (i.hold === "item" && i.itemIndex !== null && i.materialIndex !== null) {
      if (!materialHolds.has(i.itemIndex)) materialHolds.set(i.itemIndex, /* @__PURE__ */ new Set());
      materialHolds.get(i.itemIndex).add(i.materialIndex);
    }
  }
  const items = calcItems.map((it, index) => {
    if (hasProjectHold || itemHolds.has(index)) {
      return heldItem(it, materialHolds.get(index) || /* @__PURE__ */ new Set());
    }
    return it;
  });
  const totals = held ? nullTotals() : calcTotals;
  const calc = {
    items,
    totals,
    __held: held,
    pricingUnavailable: held,
    issues
  };
  return {
    calc,
    issues,
    catalogIssues: issues.filter((i) => i.kind === CATALOG),
    inputIssues: issues.filter((i) => i.kind === INPUT),
    held
  };
};
var hasMaintenanceCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var maintenanceDraftValue = (raw) => {
  if (raw === "") return "";
  const n = maintenanceStrictNumber(raw);
  return n === null ? raw : n;
};
var issuesForField = (issues, field, itemIndex = null, materialIndex = null) => (issues || []).filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex) && (materialIndex === null || i.materialIndex === materialIndex));
var hasIssueFor = (issues, field, itemIndex = null, materialIndex = null) => issuesForField(issues, field, itemIndex, materialIndex).length > 0;
var maintenanceItemIssueList = (issues, itemIndex) => (issues || []).filter((i) => i.itemIndex === itemIndex);

// frozen:/app/src/components/signMaintenance/DimLetterPaintSubPanel.jsx
import { Fragment, jsx as jsx13, jsxs } from "react/jsx-runtime";
var DEFAULT_DL = {
  enabled: false,
  qty: 6,
  avg_height_in: 12,
  thickness_in: 1,
  second_color_mask: "none"
};
function DimLetterPaintSubPanel({ cfg, settings, onChange, issues = [], issueBoxId }) {
  const dl = { ...DEFAULT_DL, ...cfg.dim_letter_paint || {} };
  const setDL = (patch) => onChange({ dim_letter_paint: { ...dl, ...patch } });
  const invalid = (field) => hasIssueFor(issues, `dim_letter_paint.${field}`) ? { "aria-invalid": "true", "aria-describedby": issueBoxId } : {};
  const dimHeld = (issues || []).some((i) => typeof i.field === "string" && (i.field === "dim_letter_paint" || i.field.startsWith("dim_letter_paint.")));
  const calc = dl.enabled ? computeDimLetterPaint({ ...cfg, dim_letter_paint: dl }, settings) : null;
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-blue-200 rounded-lg p-3 space-y-3", children: [
    /* @__PURE__ */ jsxs("label", { className: `flex items-center gap-2 cursor-pointer rounded-md p-2 transition-colors ${dl.enabled ? "bg-blue-50" : "hover:bg-slate-50"}`, children: [
      /* @__PURE__ */ jsx13(
        Checkbox,
        {
          checked: dl.enabled,
          onCheckedChange: (v) => setDL({ enabled: !!v })
        }
      ),
      /* @__PURE__ */ jsx13(Type, { className: "w-4 h-4 text-blue-600" }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsx13("div", { className: "text-sm font-semibold text-slate-800", children: "Paint the Dimensional Letters too?" }),
        /* @__PURE__ */ jsx13("div", { className: "text-[11px] text-slate-500", children: "Uses Paint Estimator rates (mix, coverage, mask, labor)." })
      ] })
    ] }),
    dl.enabled && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx13(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "# of Letters" }),
          /* @__PURE__ */ jsx13(
            Input,
            {
              type: "number",
              min: "0",
              step: "1",
              value: dl.qty ?? "",
              onChange: (e) => setDL({ qty: maintenanceDraftValue(e.target.value) }),
              className: "h-8 mt-1 text-sm tabular-nums",
              ...invalid("qty")
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx13(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "Avg Height (in)" }),
          /* @__PURE__ */ jsx13(
            Input,
            {
              type: "number",
              min: "1",
              step: "0.5",
              value: dl.avg_height_in ?? "",
              onChange: (e) => setDL({ avg_height_in: maintenanceDraftValue(e.target.value) }),
              className: "h-8 mt-1 text-sm tabular-nums",
              ...invalid("avg_height_in")
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx13(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "Thickness (in)" }),
          /* @__PURE__ */ jsx13(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.25",
              value: dl.thickness_in ?? "",
              onChange: (e) => setDL({ thickness_in: maintenanceDraftValue(e.target.value) }),
              className: "h-8 mt-1 text-sm tabular-nums",
              ...invalid("thickness_in")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1", children: [
          /* @__PURE__ */ jsx13(Palette, { className: "w-3 h-3" }),
          " Second Color / Accent"
        ] }),
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: dl.second_color_mask || "none",
            onValueChange: (v) => setDL({ second_color_mask: v }),
            children: [
              /* @__PURE__ */ jsx13(SelectTrigger, { className: "h-9 mt-1 text-sm", ...invalid("second_color_mask"), children: /* @__PURE__ */ jsx13(SelectValue, {}) }),
              /* @__PURE__ */ jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsx13(SelectItem, { value: "none", children: "Single Color \u2014 No Mask Needed" }),
                /* @__PURE__ */ jsx13(SelectItem, { value: "paint_mask", children: "Second Color \u2014 Requires Paint Mask" })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsx13("div", { className: "text-[11px] text-slate-500 mt-1", children: "Paint Mask uses your Paint Estimator's mask rates (material + plotter + weed + apply labor)." })
      ] }),
      calc && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-blue-100", children: [
        /* @__PURE__ */ jsx13(Stat, { label: "Letter Face SqFt", value: dimHeld ? "\u2014" : calc.letters_face_sqft.toFixed(2) }),
        /* @__PURE__ */ jsx13(Stat, { label: "Letter Return SqFt", value: dimHeld ? "\u2014" : calc.letters_returns_sqft.toFixed(2) }),
        /* @__PURE__ */ jsx13(Stat, { label: "Letter Paint Cost", value: dimHeld ? "\u2014" : `$${calc.letters_paint_cost.toFixed(2)}`, accent: true }),
        /* @__PURE__ */ jsx13(Stat, { label: "Letter Labor", value: dimHeld ? "\u2014" : `${calc.letters_labor_hours.toFixed(2)} hr` }),
        dl.second_color_mask === "paint_mask" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx13(Stat, { label: "Mask SqFt", value: dimHeld ? "\u2014" : calc.mask_sqft.toFixed(2), icon: /* @__PURE__ */ jsx13(Scissors, { className: "w-3 h-3" }) }),
          /* @__PURE__ */ jsx13(Stat, { label: "Mask Material", value: dimHeld ? "\u2014" : `$${calc.mask_material_cost.toFixed(2)}` }),
          /* @__PURE__ */ jsx13(Stat, { label: "Mask Labor", value: dimHeld ? "\u2014" : `$${(calc.mask_weed_labor_cost + calc.mask_apply_labor_cost).toFixed(2)}` }),
          /* @__PURE__ */ jsx13(Stat, { label: "Mask Total", value: dimHeld ? "\u2014" : `$${calc.mask_total_cost.toFixed(2)}`, accent: true })
        ] })
      ] })
    ] })
  ] });
}
function Stat({ label, value, accent, icon }) {
  return /* @__PURE__ */ jsxs("div", { className: `rounded-md px-2 py-1.5 border ${accent ? "bg-blue-100 border-blue-300" : "bg-slate-50 border-slate-200"}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "text-[9px] uppercase tracking-wider text-slate-500 flex items-center gap-1", children: [
      icon,
      label
    ] }),
    /* @__PURE__ */ jsx13("div", { className: `text-sm font-bold tabular-nums ${accent ? "text-blue-800" : "text-slate-800"}`, children: value })
  ] });
}

// frozen:/app/src/components/signMaintenance/RepaintMonumentPanel.jsx
import { jsx as jsx14, jsxs as jsxs2 } from "react/jsx-runtime";
function SliderWithInput({ value, onChange, range, unit, label, accent = "cyan", invalid = {} }) {
  const handleNumber = (v) => onChange(maintenanceDraftValue(v));
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
  const sliderValue = numeric === null ? range.min : Math.min(range.max, Math.max(range.min, numeric));
  return /* @__PURE__ */ jsxs2("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-baseline justify-between", children: [
      /* @__PURE__ */ jsx14(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: label }),
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx14(
          Input,
          {
            type: "number",
            min: range.min,
            max: range.max,
            step: range.step,
            value: value ?? "",
            onChange: (e) => handleNumber(e.target.value),
            className: "h-7 w-20 text-xs tabular-nums text-right",
            ...invalid
          }
        ),
        /* @__PURE__ */ jsx14("span", { className: "text-[11px] text-slate-500 font-medium w-5", children: unit })
      ] })
    ] }),
    /* @__PURE__ */ jsx14(
      Slider,
      {
        min: range.min,
        max: range.max,
        step: range.step,
        value: [sliderValue],
        onValueChange: (v) => onChange(v[0]),
        className: `[&_[role=slider]]:bg-${accent}-600 [&_[role=slider]]:border-${accent}-600`
      }
    ),
    /* @__PURE__ */ jsxs2("div", { className: "flex justify-between text-[10px] text-slate-400", children: [
      /* @__PURE__ */ jsxs2("span", { children: [
        range.min,
        unit
      ] }),
      /* @__PURE__ */ jsxs2("span", { children: [
        range.max,
        unit
      ] })
    ] })
  ] });
}
function RepaintMonumentPanel({ item, onChange, settings, issues = [], issueBoxId }) {
  const cfg = item.repaint_config || defaultMonumentRepaintConfig();
  const setCfg = (patch) => onChange({ repaint_config: { ...cfg, ...patch } });
  const invalid = (field) => hasIssueFor(issues, `repaint_config.${field}`) ? { "aria-invalid": "true", "aria-describedby": issueBoxId } : {};
  const repaintHeld = (issues || []).some((i) => i.field === "repaint_config" || typeof i.field === "string" && (i.field.startsWith("repaint_config.") || i.field.startsWith("dim_letter_paint.")));
  const stat = (v, suffix = "") => repaintHeld ? "\u2014" : `${v}${suffix}`;
  const calc = computeMonumentRepaint({ ...item, repaint_config: cfg }, settings) || {};
  const toggleFeature = (id) => {
    const cur = new Set(cfg.features || []);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    setCfg({ features: Array.from(cur) });
  };
  return /* @__PURE__ */ jsx14(Card, { className: "bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30 border border-amber-200 shadow-sm", children: /* @__PURE__ */ jsxs2(CardContent, { className: "p-4 space-y-4", children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsx14("div", { className: "w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm", children: /* @__PURE__ */ jsx14(Paintbrush2, { className: "w-4 h-4 text-white" }) }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx14("div", { className: "text-sm font-bold text-slate-800", children: "Repaint \u2014 Monument Sign" }),
        /* @__PURE__ */ jsx14("div", { className: "text-[11px] text-slate-500", children: "Specialized inputs for monument cabinet repainting." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-3 gap-4", children: [
      /* @__PURE__ */ jsx14(
        SliderWithInput,
        {
          label: "Cabinet Length",
          unit: "ft",
          range: MONUMENT_LENGTH_RANGE_FT,
          value: cfg.length_ft ?? 8,
          onChange: (v) => setCfg({ length_ft: v }),
          accent: "amber",
          invalid: invalid("length_ft")
        }
      ),
      /* @__PURE__ */ jsx14(
        SliderWithInput,
        {
          label: "Cabinet Height",
          unit: "ft",
          range: MONUMENT_HEIGHT_RANGE_FT,
          value: cfg.height_ft ?? 4,
          onChange: (v) => setCfg({ height_ft: v }),
          accent: "amber",
          invalid: invalid("height_ft")
        }
      ),
      /* @__PURE__ */ jsx14(
        SliderWithInput,
        {
          label: "Return Depth",
          unit: '"',
          range: MONUMENT_RETURN_DEPTH_RANGE_IN,
          value: cfg.return_depth_in ?? 6,
          onChange: (v) => setCfg({ return_depth_in: v }),
          accent: "amber",
          invalid: invalid("return_depth_in")
        }
      )
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx14(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "Paint Scope" }),
        /* @__PURE__ */ jsxs2(Select, { value: cfg.paint_mode || "entire_panel", onValueChange: (v) => setCfg({ paint_mode: v }), children: [
          /* @__PURE__ */ jsx14(SelectTrigger, { className: "h-9 mt-1 text-sm", ...invalid("paint_mode"), children: /* @__PURE__ */ jsx14(SelectValue, {}) }),
          /* @__PURE__ */ jsxs2(SelectContent, { children: [
            /* @__PURE__ */ jsx14(SelectItem, { value: "entire_panel", children: "Entire Panel (face + returns)" }),
            /* @__PURE__ */ jsx14(SelectItem, { value: "returns_only", children: "Returns / Retainers Only" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx14("div", { className: "flex items-end gap-3", children: /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx14(
          Checkbox,
          {
            id: `paint_both_sides_${item.id || "new"}`,
            checked: cfg.paint_both_sides !== false,
            onCheckedChange: (v) => setCfg({ paint_both_sides: !!v })
          }
        ),
        /* @__PURE__ */ jsx14(Label, { htmlFor: `paint_both_sides_${item.id || "new"}`, className: "text-sm cursor-pointer", children: "Paint both sides" })
      ] }) })
    ] }),
    cfg.paint_mode === "returns_only" ? /* @__PURE__ */ jsxs2("div", { className: "bg-white border border-amber-200 rounded-lg p-3", children: [
      /* @__PURE__ */ jsx14(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "Retainer Width" }),
      /* @__PURE__ */ jsxs2(
        Select,
        {
          value: String(cfg.retainer_width_in ?? 2),
          onValueChange: (v) => setCfg({ retainer_width_in: parseFloat(v) }),
          children: [
            /* @__PURE__ */ jsx14(SelectTrigger, { className: "h-9 mt-1 text-sm max-w-[200px]", ...invalid("retainer_width_in"), children: /* @__PURE__ */ jsx14(SelectValue, {}) }),
            /* @__PURE__ */ jsx14(SelectContent, { children: RETAINER_WIDTHS_IN.map((w) => /* @__PURE__ */ jsxs2(SelectItem, { value: String(w), children: [
              w,
              '" wide retainer'
            ] }, w)) })
          ]
        }
      )
    ] }) : /* @__PURE__ */ jsxs2("div", { className: "bg-white border border-amber-200 rounded-lg p-3 space-y-3", children: [
      /* @__PURE__ */ jsx14(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "Face Features (affects time & paint)" }),
      /* @__PURE__ */ jsx14("div", { className: "grid sm:grid-cols-2 gap-2", children: REPAINT_FEATURES.map((f) => {
        const checked = (cfg.features || []).includes(f.id);
        return /* @__PURE__ */ jsxs2(
          "label",
          {
            className: `flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all ${checked ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:border-slate-300 bg-white"}`,
            children: [
              /* @__PURE__ */ jsx14(Checkbox, { checked, onCheckedChange: () => toggleFeature(f.id) }),
              /* @__PURE__ */ jsx14("span", { className: "text-sm", children: f.label })
            ]
          },
          f.id
        );
      }) }),
      (cfg.features || []).includes("dimensional_letters") && /* @__PURE__ */ jsx14(DimLetterPaintSubPanel, { cfg, settings, onChange: setCfg, issues, issueBoxId })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "bg-white border border-amber-200 rounded-lg p-3", children: [
      /* @__PURE__ */ jsxs2("div", { className: "flex items-baseline justify-between mb-1", children: [
        /* @__PURE__ */ jsxs2(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1", children: [
          /* @__PURE__ */ jsx14(Gauge, { className: "w-3 h-3" }),
          " Current Paint Condition"
        ] }),
        /* @__PURE__ */ jsxs2(Badge, { variant: "outline", className: "bg-amber-50 text-amber-700 border-amber-200 text-[10px]", children: [
          "Level ",
          cfg.paint_condition || 1,
          " \u2014 ",
          PAINT_CONDITION_LABELS[(cfg.paint_condition || 1) - 1]
        ] })
      ] }),
      /* @__PURE__ */ jsx14(
        Slider,
        {
          min: 1,
          max: 10,
          step: 1,
          value: [cfg.paint_condition || 1],
          onValueChange: (v) => setCfg({ paint_condition: v[0] }),
          className: "[&_[role=slider]]:bg-amber-600 [&_[role=slider]]:border-amber-600",
          ...invalid("paint_condition")
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "flex justify-between text-[10px] text-slate-400 mt-1 px-0.5", children: [
        /* @__PURE__ */ jsx14("span", { children: "1 \xB7 Like New" }),
        /* @__PURE__ */ jsx14("span", { children: "10 \xB7 Severe" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-amber-200", children: [
      /* @__PURE__ */ jsx14(Stat2, { label: "Face SqFt", value: stat(calc.face_sqft?.toFixed(1) || "0"), icon: /* @__PURE__ */ jsx14(Ruler, { className: "w-3 h-3" }) }),
      /* @__PURE__ */ jsx14(Stat2, { label: "Returns SqFt", value: stat(calc.returns_sqft?.toFixed(1) || "0") }),
      /* @__PURE__ */ jsx14(Stat2, { label: "Total SqFt", value: stat(calc.total_sqft?.toFixed(1) || "0"), accent: true }),
      /* @__PURE__ */ jsx14(Stat2, { label: "Paint (gal)", value: stat(calc.gallons?.toFixed(2) || "0"), accent: true }),
      /* @__PURE__ */ jsx14(Stat2, { label: "Paint Cost", value: repaintHeld ? "\u2014" : `$${(calc.paint_material_cost || 0).toFixed(2)}` }),
      /* @__PURE__ */ jsx14(Stat2, { label: "Coats", value: repaintHeld ? "\u2014" : `${calc.primerCoats || 0}+${calc.finishCoats || 0}` }),
      /* @__PURE__ */ jsx14(Stat2, { label: "Feature \xD7", value: repaintHeld ? "\u2014" : (calc.feature_multiplier || 1).toFixed(2) }),
      /* @__PURE__ */ jsx14(Stat2, { label: "Condition \xD7", value: repaintHeld ? "\u2014" : (calc.condition_multiplier || 1).toFixed(2) })
    ] })
  ] }) });
}
function Stat2({ label, value, accent, icon }) {
  return /* @__PURE__ */ jsxs2("div", { className: `rounded-md px-2 py-1.5 border ${accent ? "bg-amber-100 border-amber-300" : "bg-white border-slate-200"}`, children: [
    /* @__PURE__ */ jsxs2("div", { className: "text-[9px] uppercase tracking-wider text-slate-500 flex items-center gap-1", children: [
      icon,
      label
    ] }),
    /* @__PURE__ */ jsx14("div", { className: `text-sm font-bold tabular-nums ${accent ? "text-amber-800" : "text-slate-800"}`, children: value })
  ] });
}

// frozen:/app/src/components/signMaintenance/ServiceItemRow.jsx
import { jsx as jsx15, jsxs as jsxs3 } from "react/jsx-runtime";
var moneyOrHeld = (v) => typeof v === "number" && Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
function ServiceItemRow({ item, index, onUpdate, onRemove, onDuplicate, settings = {}, rates = [], materialRules = [], issues = [] }) {
  const update = (patch) => onUpdate(index, { ...item, ...patch });
  const issueBoxId = `maintenance-item-${index}-issues`;
  const invalid = (field, materialIndex = null) => hasIssueFor(issues, field, index, materialIndex) ? { "aria-invalid": "true", "aria-describedby": issueBoxId } : {};
  const applicableMaterialRules = React3.useMemo(() => (materialRules || []).filter((rule) => {
    if (rule.is_active === false || rule._master_missing) return false;
    const types = rule.applies_to_item_types || [];
    const sizes2 = rule.applies_to_sizes || [];
    const actions = rule.applies_to_actions || [];
    if (types.length && !types.includes(item.sign_type)) return false;
    if (sizes2.length && !sizes2.includes(item.size)) return false;
    if (actions.length && !actions.some((action) => (item.actions || []).includes(action))) return false;
    return true;
  }), [materialRules, item.sign_type, item.size, item.actions]);
  const selectedRuleIds = new Set((item.materials || []).map((material) => material.maintenance_rule_id || "").filter(Boolean));
  const addableMaterialRules = applicableMaterialRules.filter((rule) => !selectedRuleIds.has(rule.id));
  const needsSqft = (item.materials || []).some((material) => material.usage_basis === "per_sqft");
  const needsLinearFeet = (item.materials || []).some((material) => material.usage_basis === "per_linear_foot");
  const updateMaterial = (materialIndex, patch) => update({
    materials: (item.materials || []).map((material, idx) => idx === materialIndex ? { ...material, ...patch } : material)
  });
  const addMaterial = (ruleId) => {
    const rule = (materialRules || []).find((candidate) => candidate.id === ruleId);
    if (!rule) return;
    update({ materials: [...item.materials || [], materialFromInventory(rule, item)] });
  };
  const enabledActionsForSign = React3.useMemo(() => {
    if (!item.sign_type) return [];
    return ACTIONS.map((a) => a.id).filter((actionId) => {
      const r = rates.find((x) => x.sign_type === item.sign_type && x.action === actionId);
      return !r || r.is_enabled !== false;
    });
  }, [item.sign_type, rates]);
  const handleSignTypeChange = (id) => {
    const allowed = ACTIONS.map((a) => a.id).filter((actionId) => {
      const r = rates.find((x) => x.sign_type === id && x.action === actionId);
      return !r || r.is_enabled !== false;
    });
    const filteredActions = (item.actions || []).filter((a) => allowed.includes(a));
    const axis2 = sizeAxisFor(id);
    const defaultSize = axis2 === "cabinet" ? "cab_medium" : "medium";
    update({ sign_type: id, actions: filteredActions, size: defaultSize });
  };
  const toggleAction = (actionId) => {
    const cur = item.actions || [];
    const next = cur.includes(actionId) ? cur.filter((a) => a !== actionId) : [...cur, actionId];
    const patch = { actions: next };
    if (actionId === "repaint" && next.includes("repaint") && item.sign_type === "monument_sign" && !item.repaint_config) {
      patch.repaint_config = defaultMonumentRepaintConfig();
    }
    update(patch);
  };
  const isMonumentRepaint2 = item.sign_type === "monument_sign" && (item.actions || []).includes("repaint");
  const axis = sizeAxisFor(item.sign_type);
  const sizes = axis === "cabinet" ? CABINET_SIZES : LETTER_SIZES;
  const sizeLabel = axis === "cabinet" ? "Cabinet Size" : "Letter Size";
  const qtyLabel = axis === "cabinet" ? "# of Cabinets" : "# of Letters";
  const meta = SIGN_TYPES_BY_ID[item.sign_type];
  return /* @__PURE__ */ jsx15(Card, { className: "bg-white border-0 shadow-sm", children: /* @__PURE__ */ jsxs3(CardContent, { className: "p-4 space-y-4", children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-start justify-between gap-2", children: [
      /* @__PURE__ */ jsxs3("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsx15(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "Description (optional)" }),
        /* @__PURE__ */ jsx15(
          Input,
          {
            value: item.description || "",
            onChange: (e) => update({ description: e.target.value }),
            placeholder: meta ? `e.g. Front ${meta.label} \u2014 north elevation` : "e.g. Front Channel Letters \u2014 north elevation",
            className: "h-9 text-sm mt-1"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex gap-1 pt-5", children: [
        /* @__PURE__ */ jsx15(Button, { size: "icon", variant: "ghost", onClick: () => onDuplicate(index), title: "Duplicate", children: /* @__PURE__ */ jsx15(Copy, { className: "w-4 h-4" }) }),
        /* @__PURE__ */ jsx15(Button, { size: "icon", variant: "ghost", className: "text-red-600 hover:bg-red-50", onClick: () => onRemove(index), title: "Remove", children: /* @__PURE__ */ jsx15(Trash2, { className: "w-4 h-4" }) })
      ] })
    ] }),
    issues.length > 0 && /* @__PURE__ */ jsxs3("div", { id: issueBoxId, role: "status", className: "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1", children: [
      /* @__PURE__ */ jsxs3("div", { className: "font-semibold flex items-center gap-1", children: [
        /* @__PURE__ */ jsx15(AlertTriangle, { className: "w-3 h-3" }),
        " Pricing unavailable \u2014 fix before saving"
      ] }),
      issues.slice(0, 4).map((iss, i) => /* @__PURE__ */ jsx15("div", { children: iss.message }, i)),
      issues.length > 4 && /* @__PURE__ */ jsxs3("div", { children: [
        "\u2026and ",
        issues.length - 4,
        " more"
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx15(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500 block mb-1.5", children: "Sign Type" }),
      /* @__PURE__ */ jsx15(SignTypePicker_default, { value: item.sign_type, onChange: handleSignTypeChange })
    ] }),
    item.sign_type && /* @__PURE__ */ jsxs3("div", { className: "grid sm:grid-cols-3 gap-3", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx15(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: sizeLabel }),
        /* @__PURE__ */ jsx15(
          "select",
          {
            className: "h-9 w-full rounded-md border border-slate-200 text-sm bg-white px-2 mt-1",
            value: item.size || sizes[1].id,
            onChange: (e) => update({ size: e.target.value }),
            children: sizes.map((s) => /* @__PURE__ */ jsxs3("option", { value: s.id, children: [
              s.label,
              " ",
              s.range ? `\u2014 ${s.range}` : ""
            ] }, s.id))
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx15(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: qtyLabel }),
        /* @__PURE__ */ jsx15(
          Input,
          {
            type: "number",
            min: "0",
            step: "1",
            value: item.qty ?? (axis === "cabinet" ? 1 : 10),
            onChange: (e) => update({ qty: maintenanceDraftValue(e.target.value) }),
            className: "h-9 text-sm tabular-nums mt-1",
            ...invalid("qty")
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx15(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "Install Height (ft)" }),
        /* @__PURE__ */ jsx15(
          Input,
          {
            type: "number",
            min: "0",
            step: "1",
            value: item.installation_height_feet ?? 12,
            onChange: (e) => update({ installation_height_feet: parseFloat(e.target.value) || 0 }),
            className: "h-9 text-sm tabular-nums mt-1"
          }
        )
      ] })
    ] }),
    item.sign_type && /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx15(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500 block mb-1.5", children: "Work to be Performed" }),
      /* @__PURE__ */ jsx15(
        ActionPicker_default,
        {
          signType: item.sign_type,
          selected: item.actions || [],
          onToggle: toggleAction,
          enabledActions: enabledActionsForSign
        }
      )
    ] }),
    item.sign_type && /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3", children: [
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx15(Label, { className: "text-[11px] uppercase tracking-wide text-slate-500", children: "Materials" }),
          /* @__PURE__ */ jsx15("div", { className: "text-[10px] text-slate-400 mt-0.5", children: "Master Inventory cost \xD7 usage rule. Quantities can be overridden for this service item." })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "text-right", children: [
          /* @__PURE__ */ jsx15("div", { className: "text-[9px] text-slate-400", children: "MATERIAL TOTAL" }),
          /* @__PURE__ */ jsx15("div", { className: "text-sm font-bold tabular-nums", children: moneyOrHeld(item.materials_cost) })
        ] })
      ] }),
      (needsSqft || needsLinearFeet) && /* @__PURE__ */ jsxs3("div", { className: "grid sm:grid-cols-2 gap-2 rounded border border-slate-200 bg-white p-2.5", children: [
        needsSqft && /* @__PURE__ */ jsxs3("label", { className: "text-[10px] font-semibold text-slate-500", children: [
          "FACE / WORK AREA (SQ FT)",
          /* @__PURE__ */ jsx15(Input, { type: "number", min: "0", step: "0.01", value: item.face_sqft ?? "", onChange: (e) => update({ face_sqft: maintenanceDraftValue(e.target.value) }), className: "h-8 mt-1 text-xs", ...invalid("face_sqft") })
        ] }),
        needsLinearFeet && /* @__PURE__ */ jsxs3("label", { className: "text-[10px] font-semibold text-slate-500", children: [
          "LINEAR FEET",
          /* @__PURE__ */ jsx15(Input, { type: "number", min: "0", step: "0.01", value: item.linear_feet ?? "", onChange: (e) => update({ linear_feet: maintenanceDraftValue(e.target.value) }), className: "h-8 mt-1 text-xs", ...invalid("linear_feet") })
        ] })
      ] }),
      (item.materials || []).length === 0 ? /* @__PURE__ */ jsx15("div", { className: "rounded border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-[10px] text-slate-400", children: "No materials are currently attached to this service item." }) : /* @__PURE__ */ jsx15("div", { className: "space-y-1.5", children: (item.materials || []).map((material, materialIndex) => /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-[minmax(0,1fr)_90px_85px_85px_28px] gap-2 items-center rounded border border-slate-200 bg-white px-2.5 py-2", children: [
        /* @__PURE__ */ jsxs3("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxs3("div", { className: "text-[10px] font-bold text-slate-800 truncate flex items-center gap-1", children: [
            material.item_name || "Material",
            material.link_missing && /* @__PURE__ */ jsx15(AlertTriangle, { className: "w-3 h-3 text-amber-600 flex-shrink-0" })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "text-[8px] text-slate-400 truncate", children: [
            material.inventory_entity ? `${material.inventory_entity} \xB7 ` : "",
            "$",
            material.usage_basis ? String(material.usage_basis).replaceAll("_", " ") : material.pricing_mode || "manual"
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "text-right", children: [
          /* @__PURE__ */ jsx15("div", { className: "text-[8px] text-slate-400", children: "UNIT COST" }),
          /* @__PURE__ */ jsxs3("div", { className: "text-[10px] font-semibold", children: [
            moneyOrHeld(material.unit_cost),
            " / ",
            material.unit || "unit"
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx15("div", { className: "text-[8px] text-slate-400", children: "QUANTITY" }),
          /* @__PURE__ */ jsx15(Input, { type: "number", min: "0", step: "any", value: material.quantity ?? "", onChange: (e) => updateMaterial(materialIndex, { quantity: maintenanceDraftValue(e.target.value), quantity_override: true }), className: "h-7 mt-0.5 px-1.5 text-[10px]", ...invalid("quantity", materialIndex) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "text-right", children: [
          /* @__PURE__ */ jsx15("div", { className: "text-[8px] text-slate-400", children: "TOTAL" }),
          /* @__PURE__ */ jsx15("div", { className: "text-[11px] font-bold", children: moneyOrHeld(material.total_cost) }),
          material.quantity_override && /* @__PURE__ */ jsxs3("button", { type: "button", onClick: () => updateMaterial(materialIndex, { quantity_override: false, quantity: material.auto_quantity ?? material.quantity }), className: "text-[8px] text-cyan-700 inline-flex items-center gap-0.5", children: [
            /* @__PURE__ */ jsx15(RotateCcw, { className: "w-2.5 h-2.5" }),
            " Auto"
          ] })
        ] }),
        /* @__PURE__ */ jsx15("button", { type: "button", onClick: () => {
          if (!confirm(`Remove "${material.item_name || "this material"}" from this service item?`)) return;
          update({ materials: (item.materials || []).filter((_, idx) => idx !== materialIndex) });
        }, className: "w-7 h-7 rounded hover:bg-red-50 text-slate-400 hover:text-red-600", title: "Remove material", children: /* @__PURE__ */ jsx15(Trash2, { className: "w-3.5 h-3.5 mx-auto" }) })
      ] }, `${material.maintenance_rule_id || material.inventory_item_id || materialIndex}-${materialIndex}`)) }),
      addableMaterialRules.length > 0 ? /* @__PURE__ */ jsx15("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxs3("label", { className: "relative", children: [
        /* @__PURE__ */ jsx15(PackagePlus, { className: "w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-700 pointer-events-none" }),
        /* @__PURE__ */ jsxs3("select", { value: "", onChange: (e) => {
          if (e.target.value) addMaterial(e.target.value);
        }, className: "h-8 pl-8 pr-8 rounded border border-cyan-300 bg-cyan-50 text-[10px] font-semibold text-cyan-800", children: [
          /* @__PURE__ */ jsx15("option", { value: "", children: "Add configured material\u2026" }),
          addableMaterialRules.map((rule) => /* @__PURE__ */ jsx15("option", { value: rule.id, children: rule._display_name || rule.item_name }, rule.id))
        ] })
      ] }) }) : materialRules.length === 0 ? /* @__PURE__ */ jsx15("div", { className: "text-[9px] text-slate-400", children: "No Maintenance material rules are configured yet. Add them under Maintenance Settings \u2192 Material Rules." }) : null
    ] }),
    isMonumentRepaint2 && /* @__PURE__ */ jsx15(RepaintMonumentPanel, { item, settings, onChange: update, issues, issueBoxId })
  ] }) });
}

// s:s://@/components/channelLetterInstall/EquipmentSelector
import { jsx as jsx16 } from "react/jsx-runtime";
var EquipmentSelector_default = () => /* @__PURE__ */ jsx16("div", { "data-stub": "EquipmentSelector" });

// s:s://@/components/channelLetterInstall/LadderSelector
import { jsx as jsx17 } from "react/jsx-runtime";
var LadderSelector_default = () => /* @__PURE__ */ jsx17("div", { "data-stub": "LadderSelector" });

// s:s://@/components/channelLetterInstall/PersonnelSelector
import { jsx as jsx18 } from "react/jsx-runtime";
var PersonnelSelector_default = () => /* @__PURE__ */ jsx18("div", { "data-stub": "PersonnelSelector" });

// s:s://@/components/channelLetterInstall/TravelCostCard
import { jsx as jsx19 } from "react/jsx-runtime";
var TravelCostCard_default = () => /* @__PURE__ */ jsx19("div", { "data-stub": "TravelCostCard" });

// s:s://@/components/channelLetterInstall/AddressAutocomplete
import { jsx as jsx20 } from "react/jsx-runtime";
var AddressAutocomplete_default = (p) => /* @__PURE__ */ jsx20("input", { value: p.value || "", onChange: (e) => p.onChange?.(e.target.value), "data-stub": "AddressAutocomplete" });

// s:s://@/components/estimator/parts/partCatalog
var loadMasterPartCatalog = async () => globalThis.__masterCatalog || [];

// s:s://@/components/estimator/loadAllEntityRows
async function loadAllEntityRows(a) {
  globalThis.__catalogReads.push(a.label);
  if (a.entity === globalThis.__entSettings) return globalThis.__settingRows || [];
  if (a.entity === globalThis.__entRates) return globalThis.__rateRows || [];
  if (a.entity === globalThis.__entEquip) return globalThis.__equipRows || [];
  if (a.entity === globalThis.__entMaintInv) return globalThis.__materialRuleRows || [];
  return [];
}

// frozen:/app/src/components/signMaintenance/maintenanceMaterialRules.js
function isMaintenanceMaterialCatalogItem(item) {
  if (!item?.entity || !item?.row) return false;
  const row = item.row;
  if (item.entity === "DimensionalLetterMaterial") {
    return row.is_active !== false && (row.show_in_vinyl_replacement === true || row.show_in_replace_returns === true || row.show_in_replace_face === true);
  }
  if (item.entity === "ChannelLetterInstallInventory") return row.show_in_maintenance_materials === true;
  if (["VinylInventory", "SignLightingInventory", "SignHardwareInventory", "SignPartsSuppliesInventory"].includes(item.entity)) {
    return row.is_active !== false && row.show_in_sign_maintenance !== false && row.show_in_master_only !== true;
  }
  if (item.entity === "FoundationInventory") {
    return row.show_in_sign_maintenance === true && !["excavation_equipment", "attachment", "sub_attachment"].includes(row.material_type);
  }
  return false;
}
function enrichMaintenanceRule(rule, catalogByKey) {
  const key = rule?.inventory_entity && rule?.inventory_item_id ? `${rule.inventory_entity}:${rule.inventory_item_id}` : "";
  const master = key ? catalogByKey.get(key) || null : null;
  return {
    ...rule,
    _master_item: master,
    _master_missing: !!key && !master,
    _master_unit_cost: master?.unitCost,
    _master_unit: master?.unit,
    _master_pricing_mode: master?.pricingMode,
    _master_category_label: master?.categoryLabel,
    _display_name: master?.name || rule?.inventory_item_name || rule?.item_name || "Maintenance Material"
  };
}
async function loadMaintenanceMaterialRules({ includeInactive = false } = {}) {
  const [rules, catalog] = await Promise.all([
    loadAllEntityRows({ entity: MaintenanceInventory, sort: "sort_order", label: "Maintenance material rules" }),
    loadMasterPartCatalog()
  ]);
  const maintenanceCatalog = (catalog || []).filter(isMaintenanceMaterialCatalogItem);
  const catalogByKey = new Map(maintenanceCatalog.map((item) => [`${item.entity}:${item.inventoryId}`, item]));
  return {
    rules: (rules || []).filter((rule) => includeInactive || rule.is_active !== false).map((rule) => enrichMaintenanceRule(rule, catalogByKey)),
    catalog: maintenanceCatalog
  };
}

// s:s://@/components/estimator/builder/builderService
var recordBuilderSave = async (a) => {
  globalThis.__spies.push(["recordBuilderSave", a]);
  return { ok: true };
};

// s:s://@/components/estimator/builder/sourceProjectPersistence
var updateBuilderSourceProject = async (a) => {
  globalThis.__spies.push(["saveSource", a]);
  return { ...a.data, id: a.sourceId, updated_date: "v2" };
};
var preflightBuilderSourceMutation = async (a) => {
  globalThis.__spies.push(["preflight", a]);
};

// s:s://@/components/estimator/idempotentEntityCreate
var ensureIdempotentEntityCreate = async (a) => {
  globalThis.__spies.push(["ensureIdempotent", a]);
  return { ...a.data, id: "new-1", updated_date: "v1" };
};
var newCreationRequestKey = (k) => "key-" + k + "-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);

// s:s://@/components/estimator/moduleShared/ModuleActionBar
import { jsx as jsx21 } from "react/jsx-runtime";
var ModuleActionBar_default = (p) => /* @__PURE__ */ jsx21("button", { type: "button", "data-stub": "copy", onClick: p.onSaveAsCopy, children: "copy" });

// s:s://@/components/estimator/moduleShared/ModuleTemplateDialog
var ModuleTemplateDialog_default = () => null;

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var saveModuleProjectCopy = async (a) => {
  globalThis.__spies.push(["saveCopy", a]);
  return { id: "copy-1" };
};

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx22 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx22("div", { "data-stub": "CustomerPricingTab" });

// s:s://@/components/markup/projectCategorizer
var categorizeMaintenanceProject = () => ({ categories: [] });

// s:s://@/components/markup/savedCustomerPricing
async function calculateSavedCustomerPricing(a) {
  globalThis.__spies.push(["pricing", a]);
  return null;
}

// s:s://@/components/staff/staffEntities
var staffEntities = {
  AllInOneEstimate: { get: async (id) => {
    globalThis.__spies.push(["estimateGet", id]);
    return globalThis.__estimate ?? null;
  } },
  ChannelLetterInstallEquipment: globalThis.__entEquip ||= { __ent: "equip" }
};

// frozen:/app/src/pages/MaintenanceEstimator.jsx
import { Fragment as Fragment2, jsx as jsx23, jsxs as jsxs4 } from "react/jsx-runtime";
var fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;
var moneyCell = (v) => hasMaintenanceCostSnapshot(v) ? /* @__PURE__ */ jsx23("span", { className: "tabular-nums", children: fmt(v) }) : /* @__PURE__ */ jsx23("span", { className: "text-amber-700 font-medium", children: "Not saved" });
var liveOrSaved = (live, saved) => hasMaintenanceCostSnapshot(live) ? live : saved;
var hoursCell = (v) => hasMaintenanceCostSnapshot(v) ? v.toFixed(1) : "\u2014";
var blankProject = () => ({
  project_name: "",
  client_name: "",
  estimate_number: "",
  hyperlink: "",
  site_address: "",
  install_environment: "exterior",
  items: [],
  selected_equipment: [],
  personnel: [],
  travel_miles_round_trip: 0,
  total_travel_cost: 0,
  supplies_percent_of_materials: 10,
  extra_supplies_cost: 0,
  markup_percent: 0,
  notes: ""
});
function MaintenanceEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const [searchParams] = useSearchParams();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [isEditing, setIsEditing] = useState(false);
  const [project, setProject] = useState(blankProject());
  const [settings, setSettings] = useState({});
  const [inventory, setInventory] = useState([]);
  const [equipmentInventory, setEquipmentInventory] = useState([]);
  const [rates, setRates] = useState([]);
  const [estimateContext, setEstimateContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState(embedded ? "items" : "project");
  const persistedProjectIdRef = useRef(editId || "");
  const createAttemptRef = useRef({ signature: "", key: "" });
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const [templateMode, setTemplateMode] = useState(null);
  useEffect(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
    copyAttemptRef.current = { signature: "", key: "" };
  }, [editId]);
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [s, inv, equipInv, r, existing, estimate] = await Promise.all([
        loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" }),
        loadMaintenanceMaterialRules({ includeInactive: true }).then((data) => data.rules),
        loadAllEntityRows({ entity: staffEntities.ChannelLetterInstallEquipment, sort: "sort_order", label: "Maintenance equipment" }),
        loadAllEntityRows({ entity: MaintenanceActionRate, sort: "created_date", label: "Maintenance action rates" }),
        editId ? MaintenanceProject.get(editId) : Promise.resolve(null),
        estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
      ]);
      const sObj = {};
      (s || []).forEach((x) => {
        sObj[x.setting_name] = x.setting_value;
      });
      setSettings(sObj);
      setInventory(inv || []);
      setEquipmentInventory((equipInv || []).filter((row) => row.is_active !== false && row.show_in_sign_maintenance !== false).map((row) => ({ ...row, _inventory_entity: "ChannelLetterInstallEquipment" })));
      setRates(r || []);
      setEstimateContext(estimate || null);
      if (existing) {
        setProject({
          ...blankProject(),
          ...existing,
          client_name: estimate?.client_name || existing.client_name,
          customer_id: estimate?.customer_id || existing.customer_id,
          estimate_number: estimate?.estimate_number || existing.estimate_number,
          site_address: existing.site_address || estimate?.site_address || "",
          items: existing.items || []
        });
        setIsEditing(true);
      } else {
        setProject((prev) => ({
          ...prev,
          client_name: estimate?.client_name || prev.client_name,
          customer_id: estimate?.customer_id,
          estimate_number: estimate?.estimate_number || prev.estimate_number,
          site_address: estimate?.site_address || prev.site_address
        }));
        setIsEditing(false);
      }
    } catch (e) {
      console.error("Load error:", e);
      setLoadError(e?.message || "Maintenance Builder prerequisites could not be verified.");
    } finally {
      setLoading(false);
    }
  }, [editId, estimateId]);
  useEffect(() => {
    loadAll();
  }, [loadAll]);
  const priced = useMemo(() => {
    if (!settings || Object.keys(settings).length === 0) return null;
    return calcMaintenanceProject(project, { settings, rates, inventory, equipmentInventory });
  }, [project, settings, rates, inventory, equipmentInventory]);
  const recalculated = useMemo(() => {
    if (!priced) return project;
    return { ...project, items: priced.calc.items, ...priced.calc.totals };
  }, [project, priced]);
  const allIssues = priced?.issues || [];
  const catalogIssues = priced?.catalogIssues || [];
  const pricingBlocked = allIssues.length > 0;
  const pricingUnavailable = !!priced?.calc?.pricingUnavailable;
  const itemIssues = (index) => maintenanceItemIssueList(allIssues, index);
  const updateProject = (patch) => setProject((prev) => ({ ...prev, ...patch }));
  const updateItem = (idx, updated) => {
    const next = [...project.items];
    next[idx] = updated;
    if (updated.sign_type !== project.items[idx]?.sign_type || JSON.stringify(updated.actions) !== JSON.stringify(project.items[idx]?.actions) || updated.size !== project.items[idx]?.size) {
      updated.materials = defaultMaterialsForItem(updated, inventory);
      next[idx] = updated;
    }
    setProject((prev) => ({ ...prev, items: next }));
  };
  const addItem = () => {
    const it = emptyServiceItem();
    it.materials = defaultMaterialsForItem(it, inventory);
    setProject((prev) => ({ ...prev, items: [...prev.items, it] }));
    setActiveTab("items");
  };
  const removeItem = (idx) => {
    if (!confirm("Remove this service item and all its materials?")) return;
    const next = [...project.items];
    next.splice(idx, 1);
    setProject((prev) => ({ ...prev, items: next }));
  };
  const duplicateItem = (idx) => {
    const copy = JSON.parse(JSON.stringify(project.items[idx]));
    const next = [...project.items];
    next.splice(idx + 1, 0, copy);
    setProject((prev) => ({ ...prev, items: next }));
  };
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) saveProject();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);
  useEffect(() => {
    if (!saving) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  const saveProject = async () => {
    if (!project.project_name || !(estimateContext?.client_name || project.client_name)) {
      alert("Please fill in Project Name and Client Name.");
      setActiveTab("project");
      return;
    }
    if (pricingBlocked) {
      setSaveError(catalogIssues.length ? "Save paused: a Maintenance Settings or catalog value is missing or unusable \u2014 update it in Sign Maintenance Settings, then save." : "Save paused: fix the flagged pricing values before saving \u2014 unavailable pricing is never written as $0.");
      return;
    }
    setSaveError("");
    setSaving(true);
    try {
      const pricingProject = {
        ...recalculated,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        site_address: project.site_address || estimateContext?.site_address || ""
      };
      const customerPricing = project.customer_pricing?.applied === true ? await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizeMaintenanceProject,
        tierNumber: project.customer_pricing?.tier_number
      }) : project.customer_pricing;
      const dataToSave = {
        ...pricingProject,
        customer_pricing: customerPricing,
        status: "calculated"
      };
      let saved;
      const activeProjectId = persistedProjectIdRef.current || editId || "";
      if (activeProjectId) {
        saved = await updateBuilderSourceProject({
          entity: MaintenanceProject,
          sourceId: activeProjectId,
          expectedUpdatedAt: project.updated_date,
          data: dataToSave,
          estimateId,
          label: "Maintenance project"
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(dataToSave);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("maintenance_project")
          };
        }
        saved = await ensureIdempotentEntityCreate({
          entity: MaintenanceProject,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: dataToSave,
          label: "Maintenance project"
        });
        if (!saved?.id) throw new Error("Maintenance project create could not be verified.");
        persistedProjectIdRef.current = saved.id;
        setIsEditing(true);
      }
      const savedId = saved?.id || activeProjectId;
      if (estimateId && savedId) {
        const refreshed = await MaintenanceProject.get(savedId).catch(() => ({ ...dataToSave, id: savedId }));
        await recordBuilderSave({
          estimateId,
          line: { project_id: savedId, module_key: "maintenance" },
          sourceProject: refreshed,
          liveTotal: recalculated.total_cost
        });
      }
      setProject((prev) => ({
        ...prev,
        ...dataToSave,
        id: savedId || prev.id,
        updated_date: saved?.updated_date || prev.updated_date
      }));
      onSaved?.();
      if (!embedded) alert(isEditing ? "Estimate updated." : "Estimate saved.");
    } catch (e) {
      console.error(e);
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAsCopy = async () => {
    if (pricingBlocked) {
      setSaveError("Save-as-copy paused: fix the flagged pricing values first \u2014 a copy is never written with unavailable pricing.");
      return;
    }
    setSaveError("");
    setSaving(true);
    try {
      const copy = await saveModuleProjectCopy({
        entity: MaintenanceProject,
        payload: {
          ...recalculated,
          client_name: estimateContext?.client_name || project.client_name,
          customer_id: estimateContext?.customer_id || project.customer_id,
          estimate_number: estimateContext?.estimate_number || project.estimate_number,
          site_address: project.site_address || estimateContext?.site_address || "",
          customer_pricing: project.customer_pricing,
          status: "calculated"
        },
        attemptRef: copyAttemptRef,
        keyPrefix: "maintenance_project_copy",
        baseName: project.project_name || "Maintenance",
        label: "Maintenance project copy"
      });
      if (embedded) onSaved?.();
      else window.location.href = `/MaintenanceEstimator?edit=${copy.id}`;
    } catch (e) {
      console.error(e);
      alert("Save copy failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const buildMaintenanceTemplateData = (p) => ({
    items: p.items || [],
    selected_equipment: p.selected_equipment || [],
    personnel: p.personnel || [],
    travel_miles_round_trip: p.travel_miles_round_trip,
    supplies_percent_of_materials: p.supplies_percent_of_materials,
    extra_supplies_cost: p.extra_supplies_cost,
    markup_percent: p.markup_percent,
    install_environment: p.install_environment,
    notes: p.notes
  });
  if (loading) {
    return /* @__PURE__ */ jsx23("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen flex items-center justify-center", children: /* @__PURE__ */ jsx23("p", { className: "text-slate-600", children: "Loading\u2026" }) });
  }
  if (loadError) {
    return /* @__PURE__ */ jsx23("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: /* @__PURE__ */ jsxs4("div", { className: "max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800", children: [
      /* @__PURE__ */ jsx23("div", { className: "font-bold", children: "Maintenance Builder unavailable" }),
      /* @__PURE__ */ jsx23("div", { className: "mt-1 text-sm", children: "Required Settings, maintenance material rules, equipment, labor rates, project data, or estimate context could not be verified. Fallback configuration was not used." }),
      /* @__PURE__ */ jsx23("div", { className: "mt-2 text-xs break-words", children: loadError }),
      /* @__PURE__ */ jsxs4(Button, { variant: "outline", className: "mt-4", onClick: () => embedded ? onClose?.() : window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator", children: [
        /* @__PURE__ */ jsx23(ArrowLeft, { className: "w-4 h-4 mr-2" }),
        " Back"
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxs4("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: [
    /* @__PURE__ */ jsxs4("div", { className: "max-w-7xl mx-auto", children: [
      /* @__PURE__ */ jsxs4("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3", children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsxs4("h1", { className: "text-3xl font-bold text-slate-900 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx23(Wrench, { className: "w-8 h-8 text-cyan-600" }),
            isEditing ? "Edit" : "New",
            " Sign Maintenance Estimate"
          ] }),
          /* @__PURE__ */ jsx23("p", { className: "text-slate-600", children: "Cleaning, repaints, LED retrofits, electrical, and more." })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "flex gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsx23(Link, { to: "/MasterInventory", children: /* @__PURE__ */ jsxs4(Button, { variant: "outline", className: "bg-white", children: [
            /* @__PURE__ */ jsx23(Package, { className: "w-4 h-4 mr-2" }),
            " Master Inventory"
          ] }) }),
          /* @__PURE__ */ jsxs4(Button, { variant: "outline", onClick: () => embedded ? onClose?.() : window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator", children: [
            /* @__PURE__ */ jsx23(ArrowLeft, { className: "w-4 h-4 mr-2" }),
            " ",
            embedded ? "Back to Products" : "Back to Estimator"
          ] })
        ] })
      ] }),
      pricingBlocked && /* @__PURE__ */ jsxs4("div", { id: "maintenance-pricing-issues", role: "status", className: "mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900", children: [
        /* @__PURE__ */ jsx23("div", { className: "font-semibold", children: "Pricing unavailable \u2014 save is paused" }),
        /* @__PURE__ */ jsxs4("div", { className: "mt-1 text-xs", children: [
          "This estimate has ",
          allIssues.length,
          " unavailable ",
          allIssues.length === 1 ? "value" : "values",
          ".",
          " ",
          allIssues.slice(0, 3).map((issue, i) => /* @__PURE__ */ jsxs4("div", { className: "mt-0.5", children: [
            "\u2022 ",
            issue.message
          ] }, i)),
          allIssues.length > 3 && /* @__PURE__ */ jsxs4("div", { className: "mt-0.5", children: [
            "\u2022 \u2026and ",
            allIssues.length - 3,
            " more"
          ] })
        ] }),
        catalogIssues.length > 0 && /* @__PURE__ */ jsxs4("div", { className: "mt-1 text-xs", children: [
          "Fix catalog or rate-matrix values in ",
          /* @__PURE__ */ jsx23(Link, { to: "/MaintenanceSettings", className: "underline font-medium", children: "Sign Maintenance Settings" }),
          ", then save."
        ] })
      ] }),
      saveError && /* @__PURE__ */ jsx23("div", { role: "alert", className: "mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800", children: saveError }),
      /* @__PURE__ */ jsxs4("div", { className: "grid lg:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsx23("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs4(Tabs, { value: activeTab, onValueChange: setActiveTab, className: "w-full", children: [
          /* @__PURE__ */ jsx23("div", { className: "sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60", children: /* @__PURE__ */ jsxs4(TabsList, { className: "grid w-full grid-cols-5 bg-white shadow-md border border-slate-200 h-auto p-1 gap-1", children: [
            /* @__PURE__ */ jsxs4(TabsTrigger, { value: "project", className: "py-2 text-xs", children: [
              /* @__PURE__ */ jsx23(FileText, { className: "w-3.5 h-3.5 mr-1" }),
              embedded ? "Options" : "Project"
            ] }),
            /* @__PURE__ */ jsxs4(TabsTrigger, { value: "items", className: "py-2 text-xs", children: [
              /* @__PURE__ */ jsx23(ListChecks, { className: "w-3.5 h-3.5 mr-1" }),
              "Service Items",
              recalculated.items?.length > 0 && /* @__PURE__ */ jsx23("span", { className: "ml-1 text-[10px] bg-slate-100 px-1.5 rounded-full", children: recalculated.items.length })
            ] }),
            /* @__PURE__ */ jsxs4(TabsTrigger, { value: "labor", className: "py-2 text-xs", children: [
              /* @__PURE__ */ jsx23(HardHat, { className: "w-3.5 h-3.5 mr-1" }),
              "Labor"
            ] }),
            /* @__PURE__ */ jsxs4(TabsTrigger, { value: "summary", className: "py-2 text-xs", children: [
              /* @__PURE__ */ jsx23(Calculator, { className: "w-3.5 h-3.5 mr-1" }),
              "Summary"
            ] }),
            /* @__PURE__ */ jsxs4(TabsTrigger, { value: "pricing", className: "py-2 text-xs", children: [
              /* @__PURE__ */ jsx23(TrendingUp, { className: "w-3.5 h-3.5 mr-1" }),
              "Pricing"
            ] })
          ] }) }),
          /* @__PURE__ */ jsxs4(TabsContent, { value: "project", className: "mt-4 space-y-4", children: [
            /* @__PURE__ */ jsxs4(Card, { className: "bg-white border-0 shadow-sm", children: [
              /* @__PURE__ */ jsx23(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx23(CardTitle, { className: "text-lg", children: embedded ? "Section Options" : "Project Information" }) }),
              /* @__PURE__ */ jsxs4(CardContent, { className: "space-y-4", children: [
                !embedded && /* @__PURE__ */ jsxs4(Fragment2, { children: [
                  /* @__PURE__ */ jsxs4("div", { className: "grid md:grid-cols-2 gap-4", children: [
                    /* @__PURE__ */ jsxs4("div", { children: [
                      /* @__PURE__ */ jsx23(Label, { children: "Client Name *" }),
                      /* @__PURE__ */ jsx23(
                        Input,
                        {
                          value: project.client_name || "",
                          onChange: (e) => updateProject({ client_name: e.target.value }),
                          className: "mt-1",
                          placeholder: "Enter client name"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs4("div", { children: [
                      /* @__PURE__ */ jsx23(Label, { children: "Project Name *" }),
                      /* @__PURE__ */ jsx23(Input, { value: project.project_name, onChange: (e) => updateProject({ project_name: e.target.value }), placeholder: "e.g. Main St Sign \u2014 Annual Service", className: "mt-1" })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs4("div", { className: "grid md:grid-cols-2 gap-4", children: [
                    /* @__PURE__ */ jsxs4("div", { children: [
                      /* @__PURE__ */ jsx23(Label, { children: "Estimate Number *" }),
                      /* @__PURE__ */ jsx23(Input, { value: project.estimate_number, onChange: (e) => updateProject({ estimate_number: e.target.value }), placeholder: "e.g. SVC-2026-001", className: "mt-1" })
                    ] }),
                    /* @__PURE__ */ jsxs4("div", { children: [
                      /* @__PURE__ */ jsxs4(Label, { children: [
                        "Project Link ",
                        /* @__PURE__ */ jsx23("span", { className: "text-xs font-normal text-slate-400", children: "(optional)" })
                      ] }),
                      /* @__PURE__ */ jsx23(Input, { value: project.hyperlink, onChange: (e) => updateProject({ hyperlink: e.target.value }), placeholder: "https://\u2026", className: "mt-1" })
                    ] }),
                    /* @__PURE__ */ jsxs4("div", { children: [
                      /* @__PURE__ */ jsx23(Label, { children: "Service interval" }),
                      /* @__PURE__ */ jsxs4(Select, { value: String(project.service_interval_months ?? 0), onValueChange: (v) => updateProject({ service_interval_months: Number(v) }), children: [
                        /* @__PURE__ */ jsx23(SelectTrigger, { className: "mt-1", children: /* @__PURE__ */ jsx23(SelectValue, {}) }),
                        /* @__PURE__ */ jsxs4(SelectContent, { children: [
                          /* @__PURE__ */ jsx23(SelectItem, { value: "0", children: "One-time service" }),
                          /* @__PURE__ */ jsx23(SelectItem, { value: "3", children: "Repeat every 3 months" }),
                          /* @__PURE__ */ jsx23(SelectItem, { value: "6", children: "Repeat every 6 months" }),
                          /* @__PURE__ */ jsx23(SelectItem, { value: "12", children: "Repeat every 12 months" }),
                          /* @__PURE__ */ jsx23(SelectItem, { value: "24", children: "Repeat every 24 months" })
                        ] })
                      ] })
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs4("div", { children: [
                  /* @__PURE__ */ jsx23(Label, { className: "text-sm font-semibold text-slate-900", children: "Service Environment" }),
                  /* @__PURE__ */ jsx23("p", { className: "text-xs text-slate-500 mt-1 mb-2", children: "Interior or exterior service call \u2014 drives some labor multipliers." }),
                  /* @__PURE__ */ jsx23("div", { className: "grid grid-cols-2 gap-2 max-w-md", children: [
                    { value: "exterior", label: "Exterior", desc: "Outdoor signs, monuments, pylons", color: "blue" },
                    { value: "interior", label: "Interior", desc: "Lobby signs, indoor wall signs", color: "amber" }
                  ].map((opt) => {
                    const active = (project.install_environment || "exterior") === opt.value;
                    const ring = opt.color === "blue" ? active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300" : active ? "border-amber-500 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300";
                    return /* @__PURE__ */ jsxs4(
                      "button",
                      {
                        type: "button",
                        onClick: () => updateProject({ install_environment: opt.value }),
                        className: `text-left p-3 rounded-lg border-2 transition-all ${ring}`,
                        children: [
                          /* @__PURE__ */ jsx23("div", { className: "text-sm font-semibold text-slate-800", children: opt.label }),
                          /* @__PURE__ */ jsx23("div", { className: "text-[11px] text-slate-500 mt-0.5 leading-tight", children: opt.desc })
                        ]
                      },
                      opt.value
                    );
                  }) })
                ] }),
                /* @__PURE__ */ jsxs4("div", { children: [
                  /* @__PURE__ */ jsxs4(Label, { className: "flex items-center gap-1.5", children: [
                    /* @__PURE__ */ jsx23(MapPin, { className: "w-3.5 h-3.5 text-cyan-600" }),
                    "Site Address",
                    /* @__PURE__ */ jsx23("span", { className: "text-xs font-normal text-slate-500", children: "(used for travel mileage)" })
                  ] }),
                  /* @__PURE__ */ jsx23(AddressAutocomplete_default, { value: project.site_address || "", onChange: (v) => updateProject({ site_address: v }), placeholder: "e.g., 123 Main St, Cincinnati, OH 45202", className: "mt-1" })
                ] })
              ] })
            ] }),
            !embedded && /* @__PURE__ */ jsxs4(Card, { className: "bg-white border-0 shadow-sm", children: [
              /* @__PURE__ */ jsx23(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx23(CardTitle, { className: "text-lg", children: "Notes" }) }),
              /* @__PURE__ */ jsx23(CardContent, { children: /* @__PURE__ */ jsx23(Textarea, { value: project.notes, onChange: (e) => updateProject({ notes: e.target.value }), placeholder: "Service notes, customer history, special considerations\u2026", className: "h-32" }) })
            ] }),
            /* @__PURE__ */ jsx23("div", { className: "flex justify-end", children: /* @__PURE__ */ jsx23(Button, { onClick: () => setActiveTab("items"), className: "bg-cyan-600 hover:bg-cyan-700 text-white", children: "Continue to Service Items \u2192" }) })
          ] }),
          /* @__PURE__ */ jsxs4(TabsContent, { value: "items", className: "mt-4 space-y-3", children: [
            /* @__PURE__ */ jsx23("div", { className: "flex items-center justify-end gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm", children: /* @__PURE__ */ jsxs4(Button, { onClick: addItem, size: "sm", className: "bg-cyan-600 hover:bg-cyan-700 text-white", children: [
              /* @__PURE__ */ jsx23(Plus, { className: "w-4 h-4 mr-1" }),
              " Add Service Item"
            ] }) }),
            recalculated.items.length === 0 ? /* @__PURE__ */ jsx23(Card, { className: "border-2 border-dashed border-slate-300 bg-white/50", children: /* @__PURE__ */ jsxs4(CardContent, { className: "p-12 text-center text-slate-500", children: [
              /* @__PURE__ */ jsx23(ClipboardCheck, { className: "w-12 h-12 mx-auto mb-3 text-slate-300" }),
              /* @__PURE__ */ jsx23("p", { className: "mb-3 font-medium", children: "No service items yet" }),
              /* @__PURE__ */ jsx23("p", { className: "text-xs mb-4", children: "Add a sign that needs maintenance to get started." }),
              /* @__PURE__ */ jsxs4(Button, { onClick: addItem, className: "bg-cyan-600 hover:bg-cyan-700 text-white", children: [
                /* @__PURE__ */ jsx23(Plus, { className: "w-4 h-4 mr-2" }),
                " Add Service Item"
              ] })
            ] }) }) : /* @__PURE__ */ jsx23("div", { className: "space-y-3", children: recalculated.items.map((it, idx) => /* @__PURE__ */ jsx23(
              ServiceItemRow,
              {
                item: it,
                index: idx,
                settings,
                rates,
                materialRules: inventory,
                onUpdate: updateItem,
                onRemove: removeItem,
                onDuplicate: duplicateItem,
                issues: itemIssues(idx)
              },
              idx
            )) })
          ] }),
          /* @__PURE__ */ jsxs4(TabsContent, { value: "labor", className: "mt-4 space-y-3", children: [
            /* @__PURE__ */ jsx23(
              EquipmentSelector_default,
              {
                selectedEquipment: recalculated.selected_equipment || [],
                onChange: (next) => updateProject({ selected_equipment: next }),
                equipmentInventory,
                items: recalculated.items,
                projectLaborHours: recalculated.labor_hours || 0
              }
            ),
            /* @__PURE__ */ jsx23(
              LadderSelector_default,
              {
                selectedEquipment: recalculated.selected_equipment || [],
                onChange: (next) => updateProject({ selected_equipment: next }),
                equipmentInventory,
                projectLaborHours: recalculated.labor_hours || 0,
                crewSize: (recalculated.personnel || []).length
              }
            ),
            /* @__PURE__ */ jsx23(
              PersonnelSelector_default,
              {
                personnel: recalculated.personnel || [],
                onChange: (next) => updateProject({ personnel: next }),
                projectLaborHours: recalculated.labor_hours || 0,
                roleRates: {
                  "Crew Lead": parseFloat(settings.maintenance_crew_lead_rate) || 75,
                  "Installer": parseFloat(settings.maintenance_tech_rate) || 65,
                  "Helper": parseFloat(settings.maintenance_helper_rate) || 35
                },
                items: recalculated.items
              }
            ),
            /* @__PURE__ */ jsx23(
              TravelCostCard_default,
              {
                shopAddress: settings.maintenance_shop_address || settings.install_shop_address || "",
                siteAddress: project.site_address || "",
                selectedEquipment: recalculated.selected_equipment || [],
                equipmentInventory,
                personnel: recalculated.personnel || [],
                settings: {
                  ...settings,
                  install_gasoline_price_per_gallon: settings.maintenance_gasoline_price_per_gallon ?? settings.install_gasoline_price_per_gallon,
                  install_diesel_price_per_gallon: settings.maintenance_diesel_price_per_gallon ?? settings.install_diesel_price_per_gallon,
                  install_travel_labor_rate: settings.maintenance_travel_labor_rate ?? settings.install_travel_labor_rate,
                  install_travel_avg_speed_mph: settings.maintenance_travel_avg_speed_mph ?? settings.install_travel_avg_speed_mph,
                  install_travel_overhead_per_mile: settings.maintenance_travel_overhead_per_mile ?? settings.install_travel_overhead_per_mile,
                  install_min_travel_charge: settings.maintenance_min_travel_charge ?? settings.install_min_travel_charge
                },
                travelMiles: project.travel_miles_round_trip || 0,
                onMilesChange: (m) => updateProject({ travel_miles_round_trip: m }),
                onTotalChange: (t) => {
                  if ((project.total_travel_cost || 0) !== t) updateProject({ total_travel_cost: t });
                },
                autoTriggerKey: activeTab === "labor" ? "labor" : null
              }
            ),
            equipmentInventory.length === 0 && /* @__PURE__ */ jsx23(Card, { className: "bg-amber-50 border-amber-200", children: /* @__PURE__ */ jsxs4(CardContent, { className: "p-3 text-xs text-amber-900", children: [
              "Your equipment inventory is empty.",
              " ",
              /* @__PURE__ */ jsx23(Link, { to: "/MasterInventory", className: "underline font-medium", children: "Add equipment in Master Inventory" }),
              " ",
              "to enable selection."
            ] }) })
          ] }),
          /* @__PURE__ */ jsx23(TabsContent, { value: "summary", className: "mt-4 space-y-3", children: /* @__PURE__ */ jsxs4(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx23(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx23(CardTitle, { className: "text-lg", children: "Cost Breakdown" }) }),
            /* @__PURE__ */ jsxs4(CardContent, { children: [
              pricingUnavailable && /* @__PURE__ */ jsx23("div", { className: "mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800", children: "Saved amounts shown \u2014 current pricing unavailable (not $0)." }),
              /* @__PURE__ */ jsxs4("div", { className: "space-y-2 text-sm", children: [
                /* @__PURE__ */ jsx23(Row, { label: "Labor", value: liveOrSaved(recalculated.labor_cost, project.labor_cost) }),
                /* @__PURE__ */ jsx23(Row, { label: "Materials", value: liveOrSaved(recalculated.total_materials_cost, project.total_materials_cost) }),
                /* @__PURE__ */ jsx23(Row, { label: "Supplies", value: liveOrSaved(recalculated.total_supplies_cost, project.total_supplies_cost) }),
                /* @__PURE__ */ jsx23(Row, { label: "Equipment", value: liveOrSaved(recalculated.total_equipment_cost, project.total_equipment_cost) }),
                /* @__PURE__ */ jsx23(Row, { label: "Personnel", value: liveOrSaved(recalculated.total_personnel_cost, project.total_personnel_cost) }),
                /* @__PURE__ */ jsx23(Row, { label: "Travel", value: liveOrSaved(recalculated.total_travel_cost, project.total_travel_cost) }),
                /* @__PURE__ */ jsxs4("div", { className: "border-t border-slate-200 pt-2 mt-2 flex justify-between font-semibold", children: [
                  /* @__PURE__ */ jsx23("span", { children: "Subtotal" }),
                  /* @__PURE__ */ jsx23("span", { className: "tabular-nums", children: moneyCell(liveOrSaved(recalculated.subtotal, project.subtotal)) })
                ] }),
                /* @__PURE__ */ jsx23(Row, { label: `Markup (${project.markup_percent || 0}%)`, value: liveOrSaved(recalculated.markup_amount, project.markup_amount) }),
                /* @__PURE__ */ jsxs4("div", { className: "border-t-2 border-slate-300 pt-2 mt-2 flex justify-between text-base font-bold text-cyan-700", children: [
                  /* @__PURE__ */ jsx23("span", { children: "Total" }),
                  /* @__PURE__ */ jsx23("span", { className: "tabular-nums", children: moneyCell(liveOrSaved(recalculated.total_cost, project.total_cost)) })
                ] })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx23(TabsContent, { value: "pricing", className: "mt-4 space-y-3", children: /* @__PURE__ */ jsx23(
            CustomerPricingTab_default,
            {
              project: recalculated,
              categorize: categorizeMaintenanceProject,
              accentColor: "cyan",
              onApplyTier: (tier) => updateProject({
                customer_pricing: { ...project.customer_pricing || {}, applied: true, tier_number: tier }
              })
            }
          ) })
        ] }) }),
        /* @__PURE__ */ jsx23("div", { className: "space-y-3", children: /* @__PURE__ */ jsxs4(Card, { className: "bg-white border-0 shadow-md sticky top-24", children: [
          /* @__PURE__ */ jsx23(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx23(CardTitle, { className: "text-base", children: "Estimate Summary" }) }),
          /* @__PURE__ */ jsxs4(CardContent, { className: "space-y-2 text-sm", children: [
            pricingUnavailable && /* @__PURE__ */ jsx23("div", { className: "rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800", children: "Saved amounts (not current pricing)" }),
            /* @__PURE__ */ jsx23(Row, { label: "Items", value: recalculated.items?.length || 0, isMoney: false }),
            /* @__PURE__ */ jsx23(Row, { label: "Labor hours", value: hoursCell(liveOrSaved(recalculated.labor_hours, project.labor_hours)), isMoney: false }),
            /* @__PURE__ */ jsx23(Row, { label: "Labor", value: liveOrSaved(recalculated.labor_cost, project.labor_cost) }),
            /* @__PURE__ */ jsx23(Row, { label: "Materials", value: liveOrSaved(recalculated.total_materials_cost, project.total_materials_cost) }),
            /* @__PURE__ */ jsx23(Row, { label: "Equipment", value: liveOrSaved(recalculated.total_equipment_cost, project.total_equipment_cost) }),
            /* @__PURE__ */ jsx23(Row, { label: "Travel", value: liveOrSaved(recalculated.total_travel_cost, project.total_travel_cost) }),
            /* @__PURE__ */ jsxs4("div", { className: "border-t pt-2 mt-2", children: [
              /* @__PURE__ */ jsx23(Label, { className: "text-xs", children: "Markup %" }),
              /* @__PURE__ */ jsx23(
                Input,
                {
                  type: "number",
                  step: "1",
                  value: project.markup_percent ?? "",
                  onChange: (e) => updateProject({
                    markup_percent: maintenanceDraftValue(e.target.value),
                    customer_pricing: { ...project.customer_pricing || {}, applied: false }
                  }),
                  className: "h-8 text-sm tabular-nums",
                  "aria-describedby": hasIssueFor(allIssues, "markup_percent") ? "maintenance-pricing-issues" : void 0,
                  "aria-invalid": hasIssueFor(allIssues, "markup_percent") || void 0
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "border-t-2 border-cyan-200 pt-2 mt-2 flex justify-between text-lg font-bold text-cyan-700", children: [
              /* @__PURE__ */ jsx23("span", { children: "Total" }),
              /* @__PURE__ */ jsx23("span", { className: "tabular-nums", children: moneyCell(liveOrSaved(recalculated.total_cost, project.total_cost)) })
            ] }),
            project?.updated_date && /* @__PURE__ */ jsxs4("div", { className: "mt-1 text-[10px] text-gray-400", children: [
              "Last saved ",
              new Date(project.updated_date).toLocaleString()
            ] }),
            /* @__PURE__ */ jsx23(Button, { onClick: saveProject, disabled: saving, className: "w-full bg-cyan-600 hover:bg-cyan-700 text-white mt-2", children: saving ? "Saving\u2026" : isEditing ? "Save Changes" : "Save Estimate" }),
            /* @__PURE__ */ jsx23("div", { className: "flex flex-wrap gap-2 mt-2", children: /* @__PURE__ */ jsx23(
              ModuleActionBar_default,
              {
                onTemplates: () => setTemplateMode("load"),
                onSaveAsTemplate: () => setTemplateMode("save"),
                onSaveAsCopy: handleSaveAsCopy,
                estimateId,
                saving
              }
            ) })
          ] })
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ jsx23(
      ModuleTemplateDialog_default,
      {
        open: !!templateMode,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => setProject((prev) => ({ ...prev, ...data })),
        moduleKey: "maintenance",
        title: "Maintenance",
        buildTemplateData: buildMaintenanceTemplateData,
        describeTemplate: (t) => `${(t.project_data?.items || []).length} items`
      }
    )
  ] });
}
function Row({ label, value, isMoney = true }) {
  const display = isMoney ? moneyCell(value) : String(value ?? 0);
  return /* @__PURE__ */ jsxs4("div", { className: "flex justify-between", children: [
    /* @__PURE__ */ jsx23("span", { className: "text-slate-600", children: label }),
    /* @__PURE__ */ jsx23("span", { className: "tabular-nums", children: display })
  ] });
}
export {
  MaintenanceEstimator as Page
};
