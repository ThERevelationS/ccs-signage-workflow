var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// frozen:/app/src/components/signMaintenance/maintenancePricingAvailability.js
var maintenancePricingAvailability_exports = {};
__export(maintenancePricingAvailability_exports, {
  calcMaintenanceProject: () => calcMaintenanceProject,
  hasIssueFor: () => hasIssueFor,
  hasMaintenanceCostSnapshot: () => hasMaintenanceCostSnapshot,
  issuesForField: () => issuesForField,
  maintenanceDraftValue: () => maintenanceDraftValue,
  maintenanceItemIssueList: () => maintenanceItemIssueList,
  maintenanceItemIssues: () => maintenanceItemIssues,
  maintenanceNonNegativeNumber: () => maintenanceNonNegativeNumber,
  maintenancePositiveNumber: () => maintenancePositiveNumber,
  maintenancePresent: () => maintenancePresent,
  maintenanceProjectInputIssues: () => maintenanceProjectInputIssues,
  maintenanceSettingIssues: () => maintenanceSettingIssues,
  maintenanceSettingRecorded: () => maintenanceSettingRecorded,
  maintenanceStrictNumber: () => maintenanceStrictNumber
});

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

// frozen:/app/src/components/signMaintenance/maintenanceCalculator.jsx
var maintenanceCalculator_exports = {};
__export(maintenanceCalculator_exports, {
  calcProjectTotals: () => calcProjectTotals,
  calcServiceItem: () => calcServiceItem,
  defaultMaterialsForItem: () => defaultMaterialsForItem,
  emptyServiceItem: () => emptyServiceItem,
  materialFromInventory: () => materialFromInventory
});
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
export {
  maintenancePricingAvailability_exports as avail,
  computeDimLetterPaint,
  computeMonumentRepaint,
  maintenanceCalculator_exports as remote
};
