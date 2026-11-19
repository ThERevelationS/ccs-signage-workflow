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
export {
  calcProjectTotals,
  calcServiceItem,
  computeDimLetterPaint,
  computeMonumentRepaint
};
