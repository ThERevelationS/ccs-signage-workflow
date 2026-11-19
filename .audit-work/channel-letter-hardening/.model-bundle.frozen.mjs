// frozen:/app/src/components/channelLetterInstall/lettersCalculator.jsx
var DEFAULTS = {
  letters_raceway_1st_per_ft: 22.53,
  letters_raceway_2nd_per_ft: 23.53,
  letters_raceway_3rd_per_ft: 24.53,
  letters_raceway_4th_per_ft: 25.53,
  letters_channel_raceway_per_inch: 7.1,
  letters_channel_flush_per_inch: 9.03,
  letters_channel_halo_per_inch: 11.75,
  // ~30% premium over flush
  letters_capsule_logo_per_sqft: 45.37,
  letters_dimensional_per_sqft: 65,
  // placeholder — in-house fab
  letters_default_delivery_fee: 90,
  letters_default_design_fee: 150,
  letters_default_install_supplies_fee: 100,
  letters_default_permitting_fee: 750,
  letters_default_markup_percent: 86.2
  // tier 1 markup from the Excel
};
var num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};
var emptyLetterPurchase = (type = "channel_flush_mounted") => ({
  id: `lp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  letter_type: type,
  description: "",
  raceway_index: 1,
  // Dimensional letters: nothing prefilled — user MUST configure via Build Fab Cost modal
  qty: type === "dimensional_letters" ? 0 : type === "raceway" ? 1 : 5,
  size_value: type === "dimensional_letters" ? 0 : type === "raceway" ? 8 : type.startsWith("channel_") ? 24 : 6,
  // For combined raceway-mounted rows: track the raceway hardware alongside the letters
  raceway_length_feet: type === "channel_raceway_mounted" ? 8 : 0,
  raceway_qty: type === "channel_raceway_mounted" ? 1 : 0,
  unit_cost: 0,
  unit_cost_override: false,
  total_cost: 0,
  create_install_item: type !== "raceway",
  // raceway is purchase-only by default
  install_height_feet: 12,
  wall_material: "eifs",
  // Backer (dimensional letters only) — disabled by default
  backer_enabled: false,
  backer_material_id: null,
  backer_width_inches: 0,
  backer_height_inches: 0,
  backer_standoff_inventory_id: null,
  backer_standoff_qty: 0,
  backer_fab_config: null
});
var resolveUnitCost = (purchase, settings) => {
  if (purchase.unit_cost_override) return num(purchase.unit_cost);
  switch (purchase.letter_type) {
    case "raceway": {
      const qty = Math.max(1, Math.min(4, Math.floor(num(purchase.qty, 1))));
      let sum = 0;
      for (let i = 0; i < qty; i++) {
        const k = ["letters_raceway_1st_per_ft", "letters_raceway_2nd_per_ft", "letters_raceway_3rd_per_ft", "letters_raceway_4th_per_ft"][i];
        sum += num(settings[k], DEFAULTS[k]);
      }
      return sum / qty;
    }
    case "channel_raceway_mounted":
      return num(settings.letters_channel_raceway_per_inch, DEFAULTS.letters_channel_raceway_per_inch);
    case "channel_flush_mounted":
      return num(settings.letters_channel_flush_per_inch, DEFAULTS.letters_channel_flush_per_inch);
    case "channel_halo_lit":
      return num(settings.letters_channel_halo_per_inch, DEFAULTS.letters_channel_halo_per_inch);
    case "capsule_logo_pillbox":
      return num(settings.letters_capsule_logo_per_sqft, DEFAULTS.letters_capsule_logo_per_sqft);
    case "dimensional_letters":
      return num(settings.letters_dimensional_per_sqft, DEFAULTS.letters_dimensional_per_sqft);
    default:
      return 0;
  }
};
var racewayTierKeys = [
  "letters_raceway_1st_per_ft",
  "letters_raceway_2nd_per_ft",
  "letters_raceway_3rd_per_ft",
  "letters_raceway_4th_per_ft"
];
var resolveRacewayAvgPerFt = (racewayQty, settings) => {
  const q = Math.max(1, Math.min(4, Math.floor(num(racewayQty, 1))));
  let sum = 0;
  for (let i = 0; i < q; i++) {
    sum += num(settings[racewayTierKeys[i]], DEFAULTS[racewayTierKeys[i]]);
  }
  return sum / q;
};
var calcLetterPurchase = (purchase, settings) => {
  const qty = num(purchase.qty);
  const size = num(purchase.size_value);
  const isDimensional = purchase.letter_type === "dimensional_letters";
  const isCombinedRaceway = purchase.letter_type === "channel_raceway_mounted";
  let unit_cost;
  let letters_total;
  if (isDimensional) {
    const fabUnit = num(purchase.fab_config?.unit_total_cost);
    const perLetter = purchase.unit_cost_override ? num(purchase.unit_cost) : fabUnit;
    letters_total = perLetter * qty;
    unit_cost = perLetter;
  } else {
    const autoUnit = resolveUnitCost({ ...purchase, unit_cost_override: false }, settings);
    if (purchase.letters_total_override) {
      letters_total = num(purchase.letters_total);
      unit_cost = size > 0 && qty > 0 ? letters_total / (size * qty) : 0;
    } else {
      unit_cost = purchase.unit_cost_override ? num(purchase.unit_cost) : autoUnit;
      letters_total = unit_cost * size * qty;
    }
  }
  let raceway_total = 0;
  let raceway_unit_cost = 0;
  if (isCombinedRaceway) {
    const rwLen = num(purchase.raceway_length_feet);
    const rwQty = num(purchase.raceway_qty, 1);
    const avgPerFt = resolveRacewayAvgPerFt(rwQty, settings);
    if (purchase.raceway_total_override) {
      raceway_total = num(purchase.raceway_total);
      raceway_unit_cost = rwLen > 0 && rwQty > 0 ? raceway_total / (rwLen * rwQty) : 0;
    } else if (purchase.raceway_unit_cost_override) {
      raceway_unit_cost = num(purchase.raceway_unit_cost);
      raceway_total = raceway_unit_cost * rwLen * rwQty;
    } else {
      raceway_unit_cost = avgPerFt;
      raceway_total = avgPerFt * rwLen * rwQty;
    }
  }
  let backer_total = 0;
  if (isDimensional && purchase.backer_enabled && purchase.backer_fab_config?.unit_total_cost) {
    backer_total = num(purchase.backer_fab_config.unit_total_cost) * qty;
  }
  const total_cost = letters_total + raceway_total + backer_total;
  return {
    ...purchase,
    unit_cost,
    letters_total,
    raceway_total,
    backer_total,
    raceway_unit_cost,
    total_cost
  };
};
var calcLettersTotals = (project, settings) => {
  const purchases = (project.letter_purchases || []).map((p) => calcLetterPurchase(p, settings));
  const purchasesTotal = purchases.reduce((s, p) => s + num(p.total_cost), 0);
  const onlyDimensional = purchases.length > 0 && purchases.every((p) => p.letter_type === "dimensional_letters");
  const delivery = onlyDimensional ? 0 : num(project.letters_delivery_fee);
  const design = num(project.letters_design_fee);
  const supplies = num(project.letters_install_supplies_fee);
  const permitting = num(project.letters_permitting_fee);
  const other = num(project.letters_other_fee);
  const letters_subtotal = purchasesTotal + delivery + design + supplies + permitting + other;
  const markupPct = num(project.letters_markup_percent);
  const total_letters_cost = letters_subtotal * (1 + markupPct / 100);
  return {
    letter_purchases: purchases,
    letters_subtotal,
    total_letters_cost
  };
};

// frozen:/app/src/components/channelLetterInstall/wallMaterials.jsx
var WALL_MATERIALS = [
  { id: "eifs", label: "EIFS / Stucco Synthetic", description: "Synthetic stucco over foam", settingKey: "install_wall_eifs_multiplier", default: 1 },
  { id: "brick", label: "Brick Veneer", description: "Standard brick facade", settingKey: "install_wall_brick_multiplier", default: 1.2 },
  { id: "cmu", label: "CMU / Cinder Block", description: "Concrete masonry units", settingKey: "install_wall_cmu_multiplier", default: 1.15 },
  { id: "poured_concrete", label: "Concrete", description: "Solid concrete wall / tilt-up", settingKey: "install_wall_concrete_multiplier", default: 1.3 },
  { id: "metal_panel", label: "Metal Panel", description: "Insulated or single-skin metal", settingKey: "install_wall_metal_panel_multiplier", default: 1 },
  { id: "acm", label: "ACM / Composite Panel", description: "Aluminum composite cladding", settingKey: "install_wall_acm_multiplier", default: 1.05 },
  { id: "wood_siding", label: "Wood Siding", description: "Lap, shake, or board siding", settingKey: "install_wall_wood_multiplier", default: 0.95 },
  { id: "vinyl_siding", label: "Vinyl Siding", description: "PVC lap siding", settingKey: "install_wall_vinyl_multiplier", default: 0.95 },
  { id: "stone_veneer", label: "Stone Veneer", description: "Natural or manufactured stone", settingKey: "install_wall_stone_multiplier", default: 1.3 },
  { id: "drywall_interior", label: "Drywall (Interior)", description: "Interior gypsum board", settingKey: "install_wall_drywall_multiplier", default: 0.9 },
  { id: "plywood_substrate", label: "Plywood / OSB", description: "Wood sheathing substrate", settingKey: "install_wall_plywood_multiplier", default: 0.95 },
  { id: "other", label: "Other / Unknown", description: "Custom or unspecified surface", settingKey: "install_wall_other_multiplier", default: 1.1 }
];
var WALL_MATERIAL_MAP = WALL_MATERIALS.reduce((acc, m) => {
  acc[m.id] = m;
  return acc;
}, {});
var getWallMaterialMultiplier = (wallMaterialId, settings) => {
  if (!wallMaterialId) return 1;
  const def = WALL_MATERIAL_MAP[wallMaterialId];
  if (!def) return 1;
  const v = parseFloat(settings?.[def.settingKey]);
  return isNaN(v) ? def.default : v;
};

// frozen:/app/src/components/channelLetterInstall/installSizeRates.jsx
var heightBucketFor = (heightFt) => {
  const h = parseFloat(heightFt) || 0;
  if (h <= 12) return "h0_12";
  if (h <= 20) return "h12_20";
  if (h <= 30) return "h20_30";
  return "h30plus";
};
var normalizeEnv = (env) => env === "interior" ? "interior" : "exterior";
var TYPE_PREFIXES = {
  flush_mount: { drill: "install_drill_rate_", prep: "install_prep_rate_", elec: "install_electrical_rate_" },
  halo_lit: { drill: "install_halo_drill_rate_", prep: "install_halo_prep_rate_", elec: "install_halo_electrical_rate_" },
  dimensional_lettering: { drill: "install_dimensional_drill_rate_", prep: "install_dimensional_prep_rate_", elec: null }
};
var qualifiedKey = (prefix, size, env, heightBucket) => `${prefix}${size}__${normalizeEnv(env)}__${heightBucket}`;
var resolveRateMinutes = (settings, prefix, size, env, heightBucket, fallbackDefault = 0) => {
  if (!prefix) return 0;
  const qk = qualifiedKey(prefix, size, env, heightBucket);
  const qv = parseFloat(settings[qk]);
  if (!isNaN(qv)) return qv;
  const legacy = parseFloat(settings[`${prefix}${size}`]);
  if (!isNaN(legacy)) return legacy;
  return fallbackDefault;
};

// frozen:/app/src/components/channelLetterInstall/installCalculator.jsx
var emptyLineItem = () => ({
  description: "",
  installation_type: "flush_mount",
  qty_letters: 10,
  letter_size: "medium",
  letter_height_inches: 24,
  installation_height_feet: 12,
  raceway_length_feet: 0,
  wall_material: "eifs",
  thick_hollow_walls: false,
  parapet: false,
  parapet_electrical_routing: "roof",
  poor_electrical_access: false,
  poor_electrical_severity: 1,
  escort_required: false,
  badging_checkin: false,
  after_hours_weekend: false,
  set_hours_installation: false,
  poor_site_access: false,
  poor_site_access_severity: 1,
  materials: []
});
var materialFromInventory = (inv, item) => {
  const m = {
    inventory_item_id: inv.id,
    item_name: inv.item_name,
    pricing_mode: inv.pricing_mode,
    unit_cost: 0,
    quantity: 0,
    total_cost: 0
  };
  if (inv.pricing_mode === "per_letter_flat") {
    m.unit_cost = parseFloat(inv.cost_per_letter) || 0;
    m.quantity = parseFloat(item.qty_letters) || 0;
  } else if (inv.pricing_mode === "per_letter_by_size") {
    const sizeKey = `cost_${item.letter_size}`;
    m.unit_cost = parseFloat(inv[sizeKey]) || 0;
    m.quantity = parseFloat(item.qty_letters) || 0;
  } else if (inv.pricing_mode === "per_raceway_foot") {
    m.unit_cost = parseFloat(inv.cost_per_foot) || 0;
    m.quantity = parseFloat(item.raceway_length_feet) || 0;
  } else if (inv.pricing_mode === "per_project_flat") {
    m.unit_cost = parseFloat(inv.cost_flat) || 0;
    m.quantity = 1;
  }
  m.total_cost = m.unit_cost * m.quantity;
  return m;
};
var calcLineItem = (item, settings, inventory) => {
  const laborRate = parseFloat(settings.install_labor_rate) || 65;
  const MIN_TO_HR = 1 / 60;
  const TYPE_DEFAULTS = {
    flush_mount: {
      extra_small: [15, 30, 5],
      small: [30, 60, 10],
      medium: [50, 100, 15],
      large: [80, 160, 20],
      extra_large: [120, 240, 25],
      extra_extra_large: [170, 340, 30]
    },
    halo_lit: {
      extra_small: [15, 30, 5],
      small: [30, 60, 10],
      medium: [50, 100, 15],
      large: [80, 160, 20],
      extra_large: [120, 240, 25],
      extra_extra_large: [170, 340, 30]
    },
    dimensional_lettering: {
      extra_small: [10, 20, 0],
      small: [20, 45, 0],
      medium: [40, 80, 0],
      large: [65, 130, 0],
      extra_large: [100, 200, 0],
      extra_extra_large: [140, 280, 0]
    }
  };
  const env = normalizeEnv(item.install_environment || settings._project_install_environment || "exterior");
  const heightBucket = heightBucketFor(item.installation_height_feet);
  const sizeMinutesForType = (type, size) => {
    const prefixes = TYPE_PREFIXES[type];
    const defs = TYPE_DEFAULTS[type]?.[size] || [50, 100, 15];
    if (!prefixes) return defs[0] + defs[1] + defs[2];
    const d = resolveRateMinutes(settings, prefixes.drill, size, env, heightBucket, defs[0]);
    const p = resolveRateMinutes(settings, prefixes.prep, size, env, heightBucket, defs[1]);
    const e = prefixes.elec ? resolveRateMinutes(settings, prefixes.elec, size, env, heightBucket, defs[2]) : 0;
    return d + p + e;
  };
  const rateType = item.installation_type === "dimensional_lettering_with_backer" ? "dimensional_lettering" : item.installation_type;
  let baseHours = 0;
  if (rateType === "raceway") {
    const basePerFt = (parseFloat(settings.install_raceway_base_minutes_per_foot) || 30) * MIN_TO_HR;
    const extraPerFt = (parseFloat(settings.install_raceway_extra_minutes_per_foot) || 0) * MIN_TO_HR;
    const racewayHoursPerFoot = basePerFt + extraPerFt;
    baseHours = (parseFloat(item.raceway_length_feet) || 0) * racewayHoursPerFoot;
    const letterMountingHours = (parseFloat(settings.install_raceway_letter_mounting_rate) || 18) * MIN_TO_HR;
    baseHours += (parseFloat(item.qty_letters) || 0) * letterMountingHours;
    const racewayElecHours = (parseFloat(settings.install_raceway_electrical_hookup_minutes) || 30) * MIN_TO_HR;
    baseHours += racewayElecHours;
  } else {
    const minutesPerLetter = sizeMinutesForType(rateType, item.letter_size);
    baseHours = (parseFloat(item.qty_letters) || 0) * minutesPerLetter * MIN_TO_HR;
  }
  if (item.thick_hollow_walls) {
    const extraPerLetterMin = parseFloat(settings.install_thick_walls_extra_per_letter);
    const extraPerRacewayMin = parseFloat(settings.install_thick_walls_extra_per_raceway);
    const perLetter = isNaN(extraPerLetterMin) ? 8 : extraPerLetterMin;
    const perRaceway = isNaN(extraPerRacewayMin) ? 30 : extraPerRacewayMin;
    baseHours += (parseFloat(item.qty_letters) || 0) * perLetter * MIN_TO_HR;
    if (item.installation_type === "raceway") {
      baseHours += perRaceway * MIN_TO_HR;
    }
  }
  if (item.parapet) {
    const routing = item.parapet_electrical_routing === "drop" ? "drop" : "roof";
    const perLetterKey = routing === "drop" ? "install_parapet_drop_extra_per_letter" : "install_parapet_roof_extra_per_letter";
    const perRacewayKey = routing === "drop" ? "install_parapet_drop_extra_per_raceway" : "install_parapet_roof_extra_per_raceway";
    const perLetterDefault = routing === "drop" ? 18 : 10;
    const perRacewayDefault = routing === "drop" ? 65 : 40;
    const extraPerLetterMin = parseFloat(settings[perLetterKey]);
    const extraPerRacewayMin = parseFloat(settings[perRacewayKey]);
    const perLetter = isNaN(extraPerLetterMin) ? perLetterDefault : extraPerLetterMin;
    const perRaceway = isNaN(extraPerRacewayMin) ? perRacewayDefault : extraPerRacewayMin;
    baseHours += (parseFloat(item.qty_letters) || 0) * perLetter * MIN_TO_HR;
    if (item.installation_type === "raceway") {
      baseHours += perRaceway * MIN_TO_HR;
    }
  }
  baseHours *= getWallMaterialMultiplier(item.wall_material, settings);
  if (item.escort_required) baseHours *= parseFloat(settings.install_escort_multiplier) || 1.15;
  if (item.badging_checkin) baseHours *= parseFloat(settings.install_badging_multiplier) || 1.1;
  if (item.after_hours_weekend) baseHours *= parseFloat(settings.install_after_hours_multiplier) || 1.5;
  if (item.set_hours_installation) baseHours *= parseFloat(settings.install_set_hours_multiplier) || 1.15;
  if (item.poor_site_access) {
    const level = Math.max(1, Math.min(10, parseInt(item.poor_site_access_severity) || 1));
    const severityDefaults = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 20, 6: 28, 7: 38, 8: 50, 9: 65, 10: 90 };
    const bonusMin = parseFloat(settings[`install_site_access_level_${level}`]);
    const bonus = isNaN(bonusMin) ? severityDefaults[level] : bonusMin;
    baseHours += (parseFloat(item.qty_letters) || 0) * bonus * MIN_TO_HR;
  }
  if (item.poor_electrical_access && rateType !== "raceway" && rateType !== "dimensional_lettering") {
    const level = Math.max(1, Math.min(10, parseInt(item.poor_electrical_severity) || 1));
    const severityDefaults = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 20, 6: 28, 7: 38, 8: 50, 9: 65, 10: 90 };
    const bonusMin = parseFloat(settings[`install_poor_electrical_level_${level}`]);
    const bonus = isNaN(bonusMin) ? severityDefaults[level] : bonusMin;
    baseHours += (parseFloat(item.qty_letters) || 0) * bonus * MIN_TO_HR;
  }
  const materials = (item.materials || []).filter((mat) => mat.pricing_mode !== "per_raceway_foot").map((mat) => {
    const inv = (inventory || []).find((i) => i.id === mat.inventory_item_id);
    if (!inv) {
      return { ...mat, total_cost: (parseFloat(mat.unit_cost) || 0) * (parseFloat(mat.quantity) || 0) };
    }
    if (inv.pricing_mode === "per_raceway_foot") return null;
    return materialFromInventory(inv, item);
  }).filter(Boolean);
  const materialsCost = materials.reduce((sum, m) => sum + (parseFloat(m.total_cost) || 0), 0);
  const laborCost = baseHours * laborRate;
  const itemTotalCost = laborCost + materialsCost;
  return {
    ...item,
    materials,
    labor_hours: baseHours,
    labor_cost: laborCost,
    materials_cost: materialsCost,
    item_total_cost: itemTotalCost
  };
};
var calcProjectTotals = (project) => {
  const items = project.items || [];
  const total_materials_cost = items.reduce((s, it) => s + (parseFloat(it.materials_cost) || 0), 0);
  const labor_cost = items.reduce((s, it) => s + (parseFloat(it.labor_cost) || 0), 0);
  const labor_hours = items.reduce((s, it) => s + (parseFloat(it.labor_hours) || 0), 0);
  const total_equipment_cost = (project.selected_equipment || []).reduce(
    (s, e) => s + (parseFloat(e.total_cost) || 0),
    0
  );
  const total_personnel_cost = (project.personnel || []).reduce(
    (s, p) => s + (parseFloat(p.total_cost) || 0),
    0
  );
  const labor_priced_via_personnel = total_personnel_cost > 0;
  const labor_cost_in_subtotal = labor_priced_via_personnel ? 0 : labor_cost;
  const total_letters_cost = parseFloat(project.total_letters_cost) || 0;
  const pct = parseFloat(project.supplies_percent_of_materials);
  const suppliesPct = isNaN(pct) ? 10 : pct;
  const extra = parseFloat(project.extra_supplies_cost) || 0;
  const supplies_from_materials = total_materials_cost * (suppliesPct / 100);
  const total_supplies_cost = supplies_from_materials + extra;
  const total_travel_cost = parseFloat(project.total_travel_cost) || 0;
  const subtotal = labor_cost_in_subtotal + total_materials_cost + total_supplies_cost + total_equipment_cost + total_personnel_cost + total_travel_cost + total_letters_cost;
  const markupPct = parseFloat(project.markup_percent) || 0;
  const markup_amount = subtotal * (markupPct / 100);
  const total_cost = subtotal + markup_amount;
  return {
    labor_hours,
    labor_cost,
    labor_cost_in_subtotal,
    labor_priced_via_personnel,
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
  calcLetterPurchase,
  calcLettersTotals,
  calcLineItem,
  calcProjectTotals,
  emptyLetterPurchase,
  emptyLineItem
};
