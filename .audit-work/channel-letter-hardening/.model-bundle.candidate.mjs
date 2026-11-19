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

// frozen:/app/src/components/channelLetterInstall/channelLetterPricingAvailability.js
var channelNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
var channelNonNegativeNumber = (v) => {
  const n = channelNumber(v);
  return n !== null && n >= 0 ? n : null;
};
var channelPositiveNumber = (v) => {
  const n = channelNumber(v);
  return n !== null && n > 0 ? n : null;
};
var recorded = (v) => v !== void 0 && v !== null && v !== "";
var hasChannelCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var channelDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};
var issue = (kind, { index = null, itemIndex = null, componentId = null, inventoryId = null, field, code, message, hold = "project", letterTypes = void 0, itemIndexes = void 0 }) => {
  const rec = { kind, index, itemIndex, componentId, inventoryId, field, code, message, hold };
  if (letterTypes !== void 0) rec.letterTypes = letterTypes;
  if (itemIndexes !== void 0) rec.itemIndexes = itemIndexes;
  return rec;
};
var RACEWAY_TIER_KEYS = [
  "letters_raceway_1st_per_ft",
  "letters_raceway_2nd_per_ft",
  "letters_raceway_3rd_per_ft",
  "letters_raceway_4th_per_ft"
];
var LETTER_RATE_KEY_BY_TYPE = {
  channel_raceway_mounted: "letters_channel_raceway_per_inch",
  channel_flush_mounted: "letters_channel_flush_per_inch",
  channel_halo_lit: "letters_channel_halo_per_inch",
  capsule_logo_pillbox: "letters_capsule_logo_per_sqft"
};
var VALID_LETTER_TYPES = /* @__PURE__ */ new Set([
  "raceway",
  "channel_raceway_mounted",
  "channel_flush_mounted",
  "channel_halo_lit",
  "capsule_logo_pillbox",
  "dimensional_letters"
]);
var VALID_INSTALL_TYPES = /* @__PURE__ */ new Set([
  "flush_mount",
  "halo_lit",
  "raceway",
  "dimensional_lettering",
  "dimensional_lettering_with_backer"
]);
var VALID_SIZES = /* @__PURE__ */ new Set([
  "extra_small",
  "small",
  "medium",
  "large",
  "extra_large",
  "extra_extra_large"
]);
var MINUTES_SETTINGS_BY_CONDITION = {
  thick_hollow_walls: (item) => {
    const keys = ["install_thick_walls_extra_per_letter"];
    if (item.installation_type === "raceway") keys.push("install_thick_walls_extra_per_raceway");
    return keys;
  },
  parapet: (item) => {
    const routing = item.parapet_electrical_routing === "drop" ? "drop" : "roof";
    const keys = [`install_parapet_${routing}_extra_per_letter`];
    if (item.installation_type === "raceway") keys.push(`install_parapet_${routing}_extra_per_raceway`);
    return keys;
  },
  escort_required: () => ["install_escort_multiplier"],
  badging_checkin: () => ["install_badging_multiplier"],
  after_hours_weekend: () => ["install_after_hours_multiplier"],
  set_hours_installation: () => ["install_set_hours_multiplier"]
};
var ROLE_RATE_KEY = {
  "Crew Lead": "install_crew_lead_rate",
  "Installer": "install_installer_rate",
  "Helper": "install_helper_rate"
};
var VEHICLE_TYPES = /* @__PURE__ */ new Set(["truck", "van", "flatbed", "car", "boom_truck"]);
var OWNED_MODES = /* @__PURE__ */ new Set(["owned_flat", "per_project_flat"]);
var EQUIPMENT_COST_FIELD = {
  per_hour: "cost_per_hour",
  per_day: "cost_per_day",
  per_week: "cost_per_week",
  per_month: "cost_per_month",
  owned_flat: "cost_flat",
  per_project_flat: "cost_flat"
};
var CNC_REQUIRED = ["cnc_machine_rate", "cnc_labor_rate", "cnc_setup_time_percentage", "cnc_letter_perimeter_factor"];
var CNC_OPTIONAL = ["min_cnc_setup_hours", "min_cnc_labor_hours"];
var LASER_REQUIRED = ["parameter_laser_machine_rate", "parameter_laser_labor_rate", "parameter_handling_time_percentage", "laser_letter_perimeter_factor"];
var LASER_OPTIONAL = ["min_laser_setup_hours", "min_laser_labor_hours"];
var PAINT_REQUIRED_NONNEG = [
  "default_labor_rate",
  "default_paint_supplies_per_sqft",
  "paint_waste_multiplier",
  "base_labor_hours_per_sqft",
  "paint_mixing_labor_hours",
  "setup_time_labor_hours",
  "color_change_setup_hours",
  "paint_gun_cleaning_hours",
  "one_side_paint_multiplier",
  "both_sides_paint_multiplier",
  "complex_complexity_multiplier",
  "additional_color_multiplier"
];
var PAINT_REQUIRED_POSITIVE = ["mixed_paint_coverage_sqft_per_gallon"];
var PAINT_OPTIONAL = ["min_labor_hours", "min_paint_cost"];
var PAINT_MASK_REQUIRED = [
  "paint_mask_rate_per_sqft",
  "paint_mask_machine_cutting_rate_per_sqft",
  "paint_mask_application_labor_rate_per_sqft",
  "paint_mask_cutting_labor_rate_per_sqft"
];
var PAINT_UNIT_FIELDS = ["paint_unit", "hardener_unit", "reducer_unit"];
var PAINT_UNITS = /* @__PURE__ */ new Set(["oz", "pint", "quart", "liter", "gallon"]);
var PAINT_COST_FIELDS = ["paint_cost_per_unit", "hardener_cost_per_unit", "reducer_cost_per_unit"];
var PAINT_RATIO_FIELDS = ["paint_mix_ratio", "hardener_mix_ratio", "reducer_mix_ratio"];
var imperialThicknessKeys = (decimal) => {
  const map = {
    0.0625: ["1_16"],
    0.125: ["1_8"],
    0.1875: ["3_16"],
    0.25: ["1_4"],
    0.375: ["3_8"],
    0.5: ["1_2"],
    0.625: ["5_8"],
    0.75: ["3_4"],
    0.875: ["7_8"],
    1: ["1"],
    1.25: ["1_1_4"],
    1.5: ["1_1_2"],
    2: ["2"],
    2.5: ["2_1_2"],
    3: ["3"],
    3.5: ["3_1_2"],
    4: ["4"]
  };
  const n = channelNumber(decimal);
  if (n === null) return [];
  const snap = Math.round(n * 16) / 16;
  return map[snap] || [];
};
var channelProjectIssues = (project, {
  settings = {},
  inventory = [],
  equipmentInventory = [],
  dimensionalMaterials = null
  // null = entity not loaded → skip staleness checks
} = {}) => {
  const issues = [];
  const inSeen = /* @__PURE__ */ new Set();
  const add = (field, code, message, { hold, index = null, itemIndex = null, componentId = null } = {}) => {
    const key = `${index}|${itemIndex}|${field}|${code}`;
    if (inSeen.has(key)) return;
    inSeen.add(key);
    issues.push(issue("channel", { index, itemIndex, componentId, field, code, message, hold }));
  };
  const catSeen = /* @__PURE__ */ new Map();
  const addCat = (field, code, message, { hold = "project", itemIndexes = null, inventoryId = null, letterTypes = void 0, index = null, componentId = null } = {}) => {
    const key = `${code}|${field}|${inventoryId || ""}`;
    const existing = catSeen.get(key);
    if (existing) {
      if (Array.isArray(itemIndexes)) existing.itemIndexes = [.../* @__PURE__ */ new Set([...existing.itemIndexes || [], ...itemIndexes])];
      if (Array.isArray(letterTypes)) existing.letterTypes = [.../* @__PURE__ */ new Set([...existing.letterTypes || [], ...letterTypes])];
      return;
    }
    const rec = issue("channel_catalog", {
      index,
      componentId,
      inventoryId,
      field,
      code,
      message,
      hold,
      itemIndexes: Array.isArray(itemIndexes) ? itemIndexes : void 0,
      letterTypes
    });
    catSeen.set(key, rec);
  };
  const scope = project?.project_scope || "full";
  const lettersActive = scope !== "install_only";
  const installActive = scope !== "letters_only";
  const items = project?.items || [];
  const purchases = project?.letter_purchases || [];
  const envOf = (item) => item?.install_environment === "interior" ? "interior" : "exterior";
  const projectEnv = project?.install_environment === "interior" ? "interior" : "exterior";
  const racewayTiersFor = (qty) => Math.max(1, Math.min(4, Math.floor(channelPositiveNumber(qty) ?? 1)));
  if (lettersActive) {
    purchases.forEach((p, index) => {
      const type = p?.letter_type;
      const label = `Letter row ${index + 1}${p?.description ? ` "${p.description}"` : ""}`;
      if (!VALID_LETTER_TYPES.has(type)) {
        add(
          "letter_type",
          "channel_letter_type_unavailable",
          `${label}: choose a supported letter type \u2014 "${type || "blank"}" prices as $0`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
        return;
      }
      if (channelPositiveNumber(p?.qty) === null) {
        add(
          "qty",
          "channel_qty_unavailable",
          `${label}: record a positive, finite quantity \u2014 a blank or zero quantity prices the row as $0`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
      }
      if (type === "raceway") {
        const tiers = racewayTiersFor(p?.qty);
        for (let i = 0; i < tiers; i++) {
          const key = RACEWAY_TIER_KEYS[i];
          if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
            addCat(
              key,
              "channel_letter_rate_unavailable",
              `Setting ${key}: record a positive, finite raceway tier ${i + 1} $/ft rate \u2014 ${label} would price with a hidden default`,
              { hold: "letters", letterTypes: ["raceway"] }
            );
          }
        }
        if (channelPositiveNumber(p?.size_value) === null) {
          add(
            "size_value",
            "channel_size_unavailable",
            `${label}: record a positive, finite raceway length (ft) \u2014 a blank or zero length prices the row as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
      } else if (type === "channel_raceway_mounted") {
        const key = LETTER_RATE_KEY_BY_TYPE[type];
        if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
          addCat(
            key,
            "channel_letter_rate_unavailable",
            `Setting ${key}: record a positive, finite per-inch letter rate \u2014 ${label} would price with a hidden default`,
            { hold: "letters", letterTypes: [type] }
          );
        }
        if (channelPositiveNumber(p?.size_value) === null) {
          add(
            "size_value",
            "channel_size_unavailable",
            `${label}: record a positive, finite letter height (in) \u2014 a blank or zero size prices the letters as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        if (channelPositiveNumber(p?.raceway_qty) === null) {
          add(
            "raceway_qty",
            "channel_raceway_qty_unavailable",
            `${label}: record a positive, finite # of raceways`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        if (channelPositiveNumber(p?.raceway_length_feet) === null) {
          add(
            "raceway_length_feet",
            "channel_raceway_length_unavailable",
            `${label}: record a positive, finite raceway length (ft) \u2014 raceway hardware would price as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        const rwTiers = racewayTiersFor(p?.raceway_qty);
        for (let i = 0; i < rwTiers; i++) {
          const k = RACEWAY_TIER_KEYS[i];
          if (!recorded(settings?.[k]) || channelPositiveNumber(settings[k]) === null) {
            addCat(
              k,
              "channel_letter_rate_unavailable",
              `Setting ${k}: record a positive, finite raceway tier ${i + 1} $/ft rate \u2014 ${label} would price with a hidden default`,
              { hold: "letters", letterTypes: [type] }
            );
          }
        }
        if (p?.raceway_unit_cost_override && channelNonNegativeNumber(p?.raceway_unit_cost) === null) {
          add(
            "raceway_unit_cost",
            "channel_raceway_unit_cost_unavailable",
            `${label}: record a finite, nonnegative raceway $/ft override`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        if (p?.raceway_total_override && channelNonNegativeNumber(p?.raceway_total) === null) {
          add(
            "raceway_total",
            "channel_raceway_total_unavailable",
            `${label}: record a finite, nonnegative raceway total override`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
      } else if (type === "dimensional_letters") {
        const fab = p?.fab_config;
        if (!fab || !recorded(fab.material_id) || channelNonNegativeNumber(fab.unit_total_cost) === null) {
          add(
            "fab_config",
            "dimensional_fab_unavailable",
            `${label}: complete "Build Fab Cost" \u2014 a dimensional row without a material + computed unit cost prices as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        } else {
          if (!["cnc", "laser"].includes(fab.cutting_method)) {
            add(
              "cutting_method",
              "dimensional_fab_unavailable",
              `${label}: choose a supported cutting method (CNC / Laser)`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          }
          if (channelPositiveNumber(fab.letter_height_inches) === null) {
            add(
              "fab_config",
              "dimensional_fab_unavailable",
              `${label}: record a positive, finite letter height (in) in the fab builder`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          }
          if (fab.width_override && channelPositiveNumber(fab.letter_width_inches) === null) {
            add(
              "fab_config",
              "dimensional_fab_unavailable",
              `${label}: Oversize is on \u2014 record a positive, finite letter width (in) or turn Oversize off`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          }
          dimensionalSettingIssues({ addCat, fab, settings, dimensionalMaterials, rowLabel: label });
        }
        if (p?.unit_cost_override && channelNonNegativeNumber(p?.unit_cost) === null) {
          add(
            "unit_cost",
            "channel_unit_cost_unavailable",
            `${label}: record a finite, nonnegative per-letter cost override`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        if (p?.backer_enabled) {
          const bf = p?.backer_fab_config;
          if (!bf || !recorded(bf.material_id) || channelNonNegativeNumber(bf.unit_total_cost) === null) {
            add(
              "backer_fab_config",
              "dimensional_backer_unavailable",
              `${label}: complete the Backer Panel fab (material + size + computed cost) or remove the backer \u2014 it currently prices as $0`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          } else {
            if (!["cnc", "laser"].includes(bf.cutting_method)) {
              add(
                "cutting_method",
                "dimensional_backer_unavailable",
                `${label}: backer panel has an unsupported cutting method`,
                { hold: "purchase", index, componentId: p?.id ?? null }
              );
            }
            if (channelPositiveNumber(bf.width_inches) === null || channelPositiveNumber(bf.height_inches) === null) {
              add(
                "backer_fab_config",
                "dimensional_backer_unavailable",
                `${label}: record positive, finite backer panel width \xD7 height (in)`,
                { hold: "purchase", index, componentId: p?.id ?? null }
              );
            }
          }
          if (recorded(p?.backer_standoff_qty) && channelNonNegativeNumber(p.backer_standoff_qty) === null) {
            add(
              "backer_standoff_qty",
              "channel_standoff_unavailable",
              `${label}: record a finite, nonnegative standoff quantity or clear it`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          }
          if (recorded(p?.backer_standoff_inventory_id)) {
            const standoff = inventory.find((i) => i.id === p.backer_standoff_inventory_id);
            if (!standoff) {
              addCat(
                "backer_standoff_inventory_id",
                "channel_material_unavailable",
                `${label}: the selected standoff record is no longer available \u2014 reselect it`,
                { hold: "purchase", inventoryId: p.backer_standoff_inventory_id, index }
              );
            } else {
              const cost = recorded(standoff.cost_per_letter) ? standoff.cost_per_letter : standoff.cost_flat;
              if (!recorded(cost) || channelNonNegativeNumber(cost) === null) {
                addCat(
                  recorded(standoff.cost_per_letter) ? "cost_per_letter" : "cost_flat",
                  "channel_material_price_unavailable",
                  `Inventory "${standoff.item_name || "standoff"}": record a finite, nonnegative standoff cost \u2014 a missing price is not free`,
                  { hold: "purchase", inventoryId: standoff.id, index }
                );
              }
            }
          }
          if (bf && recorded(bf.material_id)) {
            dimensionalMaterialIssues({ addCat, fab: bf, settings, dimensionalMaterials, rowLabel: `${label} (backer)` });
            dimensionalSettingIssues({ addCat, fab: bf, settings, dimensionalMaterials: null, rowLabel: `${label} (backer)` });
          }
        }
      } else {
        const key = LETTER_RATE_KEY_BY_TYPE[type];
        if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
          addCat(
            key,
            "channel_letter_rate_unavailable",
            `Setting ${key}: record a positive, finite ${type.replace(/_/g, " ")} rate \u2014 ${label} would price with a hidden default`,
            { hold: "letters", letterTypes: [type] }
          );
        }
        if (channelPositiveNumber(p?.size_value) === null) {
          add(
            "size_value",
            "channel_size_unavailable",
            `${label}: record a positive, finite ${type === "capsule_logo_pillbox" ? "area (sq ft)" : "letter height (in)"} \u2014 a blank or zero size prices the row as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
      }
      if (type !== "dimensional_letters" && p?.unit_cost_override && channelNonNegativeNumber(p?.unit_cost) === null) {
        add(
          "unit_cost",
          "channel_unit_cost_unavailable",
          `${label}: record a finite, nonnegative unit cost override`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
      }
      if (p?.letters_total_override && channelNonNegativeNumber(p?.letters_total) === null) {
        add(
          "letters_total",
          "channel_letters_total_unavailable",
          `${label}: record a finite, nonnegative line total override`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
      }
      if (recorded(p?.install_height_feet) && channelNonNegativeNumber(p.install_height_feet) === null) {
        add(
          "install_height_feet",
          "channel_install_height_unavailable",
          `${label}: record a finite, nonnegative install height (ft) or clear it`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
      }
    });
    const onlyDimensional = purchases.length > 0 && purchases.every((p) => p.letter_type === "dimensional_letters");
    for (const [field, human] of [
      ["letters_delivery_fee", "delivery / shipping fee"],
      ["letters_design_fee", "design fee"],
      ["letters_install_supplies_fee", "install supplies fee"],
      ["letters_permitting_fee", "permitting fee"],
      ["letters_other_fee", "other fee"]
    ]) {
      if (field === "letters_delivery_fee" && onlyDimensional) continue;
      if (recorded(project?.[field]) && channelNonNegativeNumber(project[field]) === null) {
        add(
          field,
          "channel_fee_unavailable",
          `record a finite, nonnegative ${human} or clear it \u2014 a malformed fee corrupts the letters subtotal`,
          { hold: "letters" }
        );
      }
    }
    if (recorded(project?.letters_markup_percent) && channelNonNegativeNumber(project.letters_markup_percent) === null) {
      add(
        "letters_markup_percent",
        "channel_letters_markup_unavailable",
        "record a finite, nonnegative letters markup % or clear it",
        { hold: "letters" }
      );
    }
  }
  if (installActive) {
    items.forEach((it, index) => {
      const label = `Install item ${index + 1}${it?.description ? ` "${it.description}"` : ""}`;
      const type = it?.installation_type;
      const rateType = type === "dimensional_lettering_with_backer" ? "dimensional_lettering" : type;
      const isRaceway = rateType === "raceway";
      const env = envOf(it) || projectEnv;
      if (!VALID_INSTALL_TYPES.has(type)) {
        add(
          "installation_type",
          "channel_item_type_unavailable",
          `${label}: choose a supported installation type \u2014 "${type || "blank"}" silently prices at flush-mount defaults`,
          { hold: "install", index, itemIndex: index }
        );
        return;
      }
      const qtyCheck = isRaceway ? channelNonNegativeNumber : channelPositiveNumber;
      if (qtyCheck(it?.qty_letters) === null) {
        add(
          "qty_letters",
          "channel_item_qty_unavailable",
          `${label}: record a ${isRaceway ? "finite, nonnegative" : "positive, finite"} letter quantity${isRaceway ? "" : " \u2014 0 letters prices the row as $0"}`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (!isRaceway && !VALID_SIZES.has(it?.letter_size)) {
        add(
          "letter_size",
          "channel_item_size_unavailable",
          `${label}: choose a letter size \u2014 "${it?.letter_size || "blank"}" silently prices at medium-size defaults`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (isRaceway && channelPositiveNumber(it?.raceway_length_feet) === null) {
        add(
          "raceway_length_feet",
          "channel_raceway_length_unavailable",
          `${label}: record a positive, finite raceway length (ft)`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (recorded(it?.installation_height_feet) && channelNonNegativeNumber(it.installation_height_feet) === null) {
        add(
          "installation_height_feet",
          "channel_item_height_unavailable",
          `${label}: record a finite, nonnegative install height (ft) or clear it`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (recorded(it?.install_environment) && !["interior", "exterior"].includes(it.install_environment)) {
        add(
          "install_environment",
          "channel_item_env_unavailable",
          `${label}: choose Interior or Exterior \u2014 "${it.install_environment}" silently resolves as exterior`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (!recorded(settings?.install_labor_rate) || channelPositiveNumber(settings.install_labor_rate) === null) {
        addCat(
          "install_labor_rate",
          "channel_install_rate_unavailable",
          `Setting install_labor_rate: record a positive, finite install labor rate \u2014 ${label} would price with a hidden default`,
          { hold: "install", itemIndexes: [index] }
        );
      }
      if (isRaceway) {
        for (const [key, human] of [
          ["install_raceway_base_minutes_per_foot", "raceway base minutes per foot"],
          ["install_raceway_letter_mounting_rate", "raceway letter mounting minutes"],
          ["install_raceway_electrical_hookup_minutes", "raceway electrical hookup minutes"]
        ]) {
          if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
            addCat(
              key,
              "channel_install_minutes_unavailable",
              `Setting ${key}: record a finite, nonnegative ${human} \u2014 ${label} would price with a hidden default`,
              { hold: "install", itemIndexes: [index] }
            );
          }
        }
        if (recorded(settings?.install_raceway_extra_minutes_per_foot) && channelNonNegativeNumber(settings.install_raceway_extra_minutes_per_foot) === null) {
          addCat(
            "install_raceway_extra_minutes_per_foot",
            "channel_install_minutes_unavailable",
            "Setting install_raceway_extra_minutes_per_foot is malformed \u2014 fix or clear it in Installation Settings",
            { hold: "install", itemIndexes: [index] }
          );
        }
      } else if (VALID_SIZES.has(it?.letter_size)) {
        const prefixes = TYPE_PREFIXES[rateType];
        const heightBucket = (() => {
          const h = channelNonNegativeNumber(it?.installation_height_feet) ?? 0;
          if (h <= 12) return "h0_12";
          if (h <= 20) return "h12_20";
          if (h <= 30) return "h20_30";
          return "h30plus";
        })();
        if (prefixes) {
          for (const [phase, prefix] of [["drill", prefixes.drill], ["prep", prefixes.prep], ["electrical", prefixes.elec]]) {
            if (!prefix) continue;
            rateMinuteSettingIssue({ addCat, settings, prefix, size: it.letter_size, env, heightBucket, phase, itemIndex: index, label });
          }
        } else {
          add(
            "installation_type",
            "channel_item_type_unavailable",
            `${label}: "${type}" has no configured size-rate settings \u2014 it silently prices at hardcoded defaults`,
            { hold: "install", index, itemIndex: index }
          );
        }
      }
      const wallDef = WALL_MATERIAL_MAP[it?.wall_material];
      if (it?.wall_material && !wallDef) {
        add(
          "wall_material",
          "channel_wall_material_unavailable",
          `${label}: "${it.wall_material}" is not a configured wall material \u2014 it silently prices at a 1.0\xD7 multiplier`,
          { hold: "install", index, itemIndex: index }
        );
      } else if (wallDef) {
        const v = settings?.[wallDef.settingKey];
        if (!recorded(v) || channelNumber(v) === null) {
          addCat(
            wallDef.settingKey,
            "channel_wall_multiplier_unavailable",
            `Setting ${wallDef.settingKey}: record a finite ${wallDef.label} time multiplier \u2014 ${label} would price with a hidden default`,
            { hold: "install", itemIndexes: [index] }
          );
        }
      }
      for (const [flag, keysFor] of Object.entries(MINUTES_SETTINGS_BY_CONDITION)) {
        if (!it?.[flag]) continue;
        for (const key of keysFor(it)) {
          const v = settings?.[key];
          if (!recorded(v) || channelPositiveNumber(v) === null) {
            addCat(
              key,
              "channel_condition_setting_unavailable",
              `Setting ${key}: record a positive, finite value \u2014 ${label} has ${flag.replace(/_/g, " ")} on and would price with a hidden default`,
              { hold: "install", itemIndexes: [index] }
            );
          }
        }
      }
      if (it?.poor_site_access) {
        const lvl = severityLevel(it.poor_site_access_severity, add, index, label, "poor_site_access_severity");
        const key = `install_site_access_level_${lvl}`;
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(
            key,
            "channel_condition_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative site-access level ${lvl} minutes \u2014 ${label} would price with a hidden default`,
            { hold: "install", itemIndexes: [index] }
          );
        }
      }
      if (it?.poor_electrical_access && !isRaceway && rateType !== "dimensional_lettering") {
        const lvl = severityLevel(it.poor_electrical_severity, add, index, label, "poor_electrical_severity");
        const key = `install_poor_electrical_level_${lvl}`;
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(
            key,
            "channel_condition_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative poor-electrical level ${lvl} minutes \u2014 ${label} would price with a hidden default`,
            { hold: "install", itemIndexes: [index] }
          );
        }
      }
      if (it?.poor_electrical_access && (isRaceway || rateType === "dimensional_lettering") && recorded(it?.poor_electrical_severity)) {
        severityLevel(it.poor_electrical_severity, add, index, label, "poor_electrical_severity");
      }
      (it?.materials || []).forEach((m, mi) => {
        materialIssues({ add, addCat, m, it, inventory, index, itemIndex: mi, label });
      });
    });
    if (recorded(project?.install_environment) && !["interior", "exterior"].includes(project.install_environment)) {
      add(
        "install_environment",
        "channel_environment_unavailable",
        `Project installation environment "${project.install_environment}" is not supported \u2014 it silently resolves as exterior`,
        { hold: "install" }
      );
    }
  }
  if (installActive) {
    (project?.selected_equipment || []).forEach((e, index) => {
      const name = e?.equipment_name || `row ${index + 1}`;
      if (!recorded(e?.equipment_id)) {
        add(
          "equipment_id",
          "channel_equipment_unassigned",
          `Equipment "${name}": select an equipment record \u2014 an unlinked row cannot be repriced`,
          { hold: "equipment", index }
        );
      } else {
        const inv = equipmentInventory.find((r) => r.id === e.equipment_id);
        if (!inv) {
          addCat(
            "selected_equipment",
            "channel_equipment_unavailable",
            `Equipment "${name}": the selected equipment record is no longer available \u2014 reselect it`,
            { hold: "equipment", inventoryId: e.equipment_id, index }
          );
        } else {
          const costField = EQUIPMENT_COST_FIELD[inv.pricing_mode];
          if (!costField) {
            addCat(
              "pricing_mode",
              "channel_equipment_mode_unavailable",
              `Equipment "${inv.equipment_name || name}": pricing mode "${inv.pricing_mode || "blank"}" is not supported \u2014 it silently bills $0`,
              { hold: "equipment", inventoryId: inv.id, index }
            );
          } else if (channelNonNegativeNumber(inv[costField]) === null) {
            addCat(
              costField,
              "channel_equipment_price_unavailable",
              `Equipment "${inv.equipment_name || name}": record a finite, nonnegative ${costField.replace(/_/g, " ")} in Equipment Inventory \u2014 a missing price is not free`,
              { hold: "equipment", inventoryId: inv.id, index }
            );
          }
          if (e?.include_delivery && !isOwnedRow(e, inv) && channelNonNegativeNumber(inv.delivery_pickup_cost) === null && channelNonNegativeNumber(e.delivery_pickup_cost) === null) {
            addCat(
              "delivery_pickup_cost",
              "channel_equipment_price_unavailable",
              `Equipment "${inv.equipment_name || name}": record a finite, nonnegative delivery/pickup cost in Equipment Inventory \u2014 a missing price is not free`,
              { hold: "equipment", inventoryId: inv.id, index }
            );
          }
          const milesNum = channelNonNegativeNumber(project?.travel_miles_round_trip);
          if (milesNum !== null && milesNum > 0 && (inv.ownership === "owned" || OWNED_MODES.has(inv.pricing_mode)) && VEHICLE_TYPES.has(inv.equipment_type) && channelPositiveNumber(inv.mpg) === null) {
            addCat(
              "mpg",
              "channel_vehicle_mpg_unavailable",
              `Equipment "${inv.equipment_name || name}": record a positive, finite MPG in Equipment Inventory \u2014 travel fuel pricing is unavailable`,
              { hold: "travel", inventoryId: inv.id, index }
            );
          }
        }
      }
      const flatMode = OWNED_MODES.has(e?.pricing_mode);
      if (!flatMode && e?.duration !== void 0 && channelPositiveNumber(e?.duration) === null) {
        add(
          "duration",
          "channel_equipment_duration_unavailable",
          `Equipment "${name}": record a positive, finite rental duration \u2014 0 ${e?.pricing_mode === "per_hour" ? "hours" : "periods"} bills as $0`,
          { hold: "equipment", index }
        );
      }
      if (e?.unit_cost !== void 0 && channelNonNegativeNumber(e?.unit_cost) === null) {
        add(
          "unit_cost",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative unit cost`,
          { hold: "equipment", index }
        );
      }
      if (recorded(e?.delivery_pickup_cost) && channelNonNegativeNumber(e.delivery_pickup_cost) === null) {
        add(
          "delivery_pickup_cost",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative delivery/pickup cost`,
          { hold: "equipment", index }
        );
      }
      if (recorded(e?.idle_hours) && channelNonNegativeNumber(e.idle_hours) === null) {
        add(
          "idle_hours",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative idle hours value or clear it`,
          { hold: "equipment", index }
        );
      }
      if (recorded(e?.idle_running_cost_per_hour) && channelNonNegativeNumber(e.idle_running_cost_per_hour) === null) {
        add(
          "idle_running_cost_per_hour",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative idle $/hr or clear it`,
          { hold: "equipment", index }
        );
      }
      if (channelNonNegativeNumber(e?.total_cost) === null) {
        add(
          "total_cost",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": recorded total cost is not a finite, nonnegative number \u2014 recalculate the row before repricing`,
          { hold: "equipment", index }
        );
      }
    });
  }
  if (installActive) {
    (project?.personnel || []).forEach((p, index) => {
      const role = p?.role || p?.name || `row ${index + 1}`;
      const hrs = channelNumber(p?.hours);
      const rate = channelNumber(p?.hourly_rate);
      if (p?.hours !== void 0 && (hrs === null || hrs < 0)) {
        add(
          "hours",
          "channel_personnel_hours_unavailable",
          `Crew "${role}": record a finite, nonnegative hours value`,
          { hold: "personnel", index }
        );
      }
      if (p?.hourly_rate !== void 0 && (rate === null || rate < 0)) {
        add(
          "hourly_rate",
          "channel_personnel_rate_unavailable",
          `Crew "${role}": record a finite, nonnegative hourly rate`,
          { hold: "personnel", index }
        );
      }
      if (hrs !== null && hrs > 0 && (rate === null || rate <= 0)) {
        add(
          "hourly_rate",
          "channel_personnel_rate_unavailable",
          `Crew "${role}": record a positive hourly rate or clear the hours \u2014 ${hrs} hr would bill $0`,
          { hold: "personnel", index }
        );
      }
      if (channelNonNegativeNumber(p?.total_cost) === null) {
        add(
          "total_cost",
          "channel_personnel_cost_unavailable",
          `Crew "${role}": recorded total cost is not a finite, nonnegative number \u2014 recalculate the row before repricing`,
          { hold: "personnel", index }
        );
      }
    });
    const rolesPresent = new Set((project?.personnel || []).map((p) => p?.role).filter((r) => r in ROLE_RATE_KEY));
    rolesPresent.forEach((role) => {
      const field = ROLE_RATE_KEY[role];
      if (!recorded(settings?.[field]) || channelPositiveNumber(settings[field]) === null) {
        addCat(
          field,
          "channel_install_rate_unavailable",
          `Setting ${field}: record a positive, finite ${role} rate in Installation Settings \u2014 crew pricing is unavailable`,
          { hold: "personnel" }
        );
      }
    });
  }
  if (installActive) {
    if (recorded(project?.travel_miles_round_trip) && channelNonNegativeNumber(project.travel_miles_round_trip) === null) {
      add(
        "travel_miles_round_trip",
        "channel_travel_miles_unavailable",
        "record a finite, nonnegative round-trip mileage \u2014 travel pricing is unavailable",
        { hold: "travel" }
      );
    }
    if (recorded(project?.total_travel_cost) && channelNonNegativeNumber(project.total_travel_cost) === null) {
      add(
        "total_travel_cost",
        "channel_travel_cost_unavailable",
        "recorded travel cost is not a finite, nonnegative number \u2014 recalculate travel before repricing",
        { hold: "travel" }
      );
    }
    const milesNum = channelNonNegativeNumber(project?.travel_miles_round_trip);
    if (milesNum !== null && milesNum > 0) {
      for (const [field, human] of [
        ["install_gasoline_price_per_gallon", "gasoline price per gallon"],
        ["install_diesel_price_per_gallon", "diesel price per gallon"],
        ["install_travel_labor_rate", "travel labor rate"],
        ["install_travel_avg_speed_mph", "travel average speed (mph)"]
      ]) {
        if (!recorded(settings?.[field]) || channelPositiveNumber(settings[field]) === null) {
          addCat(
            field,
            "channel_travel_setting_unavailable",
            `Setting ${field}: record a positive, finite ${human} in Installation Settings \u2014 travel pricing is unavailable`,
            { hold: "travel" }
          );
        }
      }
      for (const [field, human] of [
        ["install_travel_overhead_per_mile", "travel overhead per mile"],
        ["install_min_travel_charge", "minimum travel charge"]
      ]) {
        if (recorded(settings?.[field]) && channelNonNegativeNumber(settings[field]) === null) {
          addCat(
            field,
            "channel_travel_setting_unavailable",
            `Setting ${field}: record a finite, nonnegative ${human} in Installation Settings`,
            { hold: "travel" }
          );
        }
      }
    }
  }
  if (recorded(project?.supplies_percent_of_materials) && channelNonNegativeNumber(project.supplies_percent_of_materials) === null) {
    add(
      "supplies_percent_of_materials",
      "channel_supplies_percent_unavailable",
      "record a finite, nonnegative supplies % of materials or clear it",
      { hold: "supplies" }
    );
  }
  if (recorded(project?.extra_supplies_cost) && channelNonNegativeNumber(project.extra_supplies_cost) === null) {
    add(
      "extra_supplies_cost",
      "channel_extra_supplies_unavailable",
      "record a finite, nonnegative extra supplies cost ($) or clear it",
      { hold: "supplies" }
    );
  }
  if (recorded(project?.markup_percent) && channelNonNegativeNumber(project.markup_percent) === null) {
    add(
      "markup_percent",
      "channel_markup_unavailable",
      "record a finite, nonnegative project markup % or clear it",
      { hold: "markup" }
    );
  }
  return [...issues, ...catSeen.values()];
};
var severityLevel = (v, add, index, label, field) => {
  const n = channelNumber(v);
  if (n === null || n < 1 || n > 10 || Math.floor(n) !== n) {
    add(
      field,
      "channel_item_severity_unavailable",
      `${label}: choose a whole-number severity 1\u201310`,
      { hold: "install", index, itemIndex: index }
    );
    return 1;
  }
  return n;
};
var rateMinuteSettingIssue = ({ addCat, settings, prefix, size, env, heightBucket, phase, itemIndex, label }) => {
  const qk = qualifiedKey(prefix, size, env, heightBucket);
  const qv = settings?.[qk];
  if (recorded(qv)) {
    if (channelNonNegativeNumber(qv) === null) {
      addCat(
        qk,
        "channel_install_minutes_unavailable",
        `Setting ${qk}: fix the malformed ${phase} minutes \u2014 ${label} silently falls back to legacy rates`,
        { hold: "install", itemIndexes: [itemIndex] }
      );
    }
    return;
  }
  const lk = `${prefix}${size}`;
  const lv = settings?.[lk];
  if (recorded(lv)) {
    if (channelNonNegativeNumber(lv) === null) {
      addCat(
        lk,
        "channel_install_minutes_unavailable",
        `Setting ${lk}: fix the malformed ${phase} minutes \u2014 ${label} silently falls back to hardcoded defaults`,
        { hold: "install", itemIndexes: [itemIndex] }
      );
    }
    return;
  }
  addCat(
    qk,
    "channel_install_minutes_unavailable",
    `Setting ${qk} (or legacy ${lk}): record finite, nonnegative ${phase} minutes for ${size.replace(/_/g, " ")} / ${env} / ${heightBucket} \u2014 ${label} would price with a hidden default`,
    { hold: "install", itemIndexes: [itemIndex] }
  );
};
var isOwnedRow = (row, inv) => row?.ownership === "owned" || inv?.ownership === "owned" || OWNED_MODES.has(row?.pricing_mode) || OWNED_MODES.has(inv?.pricing_mode);
var materialIssues = ({ add, addCat, m, it, inventory, index, itemIndex, label }) => {
  const matLabel = `${label}, material "${m?.item_name || `#${itemIndex + 1}`}"`;
  if (recorded(m?.inventory_item_id)) {
    const inv = inventory.find((i) => i.id === m.inventory_item_id);
    if (!inv) {
      addCat(
        "inventory_item_id",
        "channel_material_unavailable",
        `${matLabel}: the linked inventory record is no longer available \u2014 reselect or reprice it`,
        { hold: "install", inventoryId: m.inventory_item_id, index, itemIndexes: [index] }
      );
      detachedMaterialValues({ add, m, index, itemIndex, label: matLabel });
      return;
    }
    if (inv.pricing_mode === "per_raceway_foot") {
      add(
        "pricing_mode",
        "channel_material_mode_unavailable",
        `${matLabel}: raceway hardware is priced on the Letters tab \u2014 remove it from install materials`,
        { hold: "install", index, itemIndex }
      );
      return;
    }
    const costField = { per_letter_flat: "cost_per_letter", per_letter_by_size: `cost_${it?.letter_size}`, per_project_flat: "cost_flat" }[inv.pricing_mode];
    if (!costField) {
      addCat(
        "pricing_mode",
        "channel_material_mode_unavailable",
        `Inventory "${inv.item_name}": pricing mode "${inv.pricing_mode || "blank"}" is not supported on install items \u2014 it silently bills $0`,
        { hold: "install", inventoryId: inv.id, index, itemIndexes: [index] }
      );
      return;
    }
    if (!recorded(inv[costField]) || channelNonNegativeNumber(inv[costField]) === null) {
      addCat(
        costField,
        "channel_material_price_unavailable",
        `Inventory "${inv.item_name}": record a finite, nonnegative ${costField.replace(/_/g, " ")} \u2014 a missing material price is not free`,
        { hold: "install", inventoryId: inv.id, index, itemIndexes: [index] }
      );
    }
    return;
  }
  detachedMaterialValues({ add, m, index, itemIndex, label: matLabel });
};
var detachedMaterialValues = ({ add, m, index, itemIndex, label }) => {
  if (m?.unit_cost !== void 0 && channelNonNegativeNumber(m.unit_cost) === null) {
    add(
      "unit_cost",
      "channel_material_value_unavailable",
      `${label}: record a finite, nonnegative unit cost`,
      { hold: "install", index, itemIndex }
    );
  }
  if (m?.quantity !== void 0 && channelNonNegativeNumber(m.quantity) === null) {
    add(
      "quantity",
      "channel_material_value_unavailable",
      `${label}: record a finite, nonnegative quantity`,
      { hold: "install", index, itemIndex }
    );
  }
};
var dimensionalMaterialIssues = ({ addCat, fab, settings, dimensionalMaterials, rowLabel }) => {
  if (!recorded(fab?.material_id)) return;
  if (dimensionalMaterials === null) return;
  const mat = (dimensionalMaterials || []).find((m) => m.id === fab.material_id);
  if (!mat) {
    addCat(
      "material_id",
      "dimensional_material_unavailable",
      `${rowLabel}: the selected sheet material is no longer available \u2014 reselect it in the fab builder`,
      { hold: "letters", inventoryId: fab.material_id, letterTypes: ["dimensional_letters"] }
    );
    return;
  }
  if (mat.is_active === false) {
    addCat(
      "is_active",
      "dimensional_material_unavailable",
      `Dimensional material "${mat.material_name || mat.id}" is no longer active \u2014 reselect an active material in the fab builder`,
      { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] }
    );
  }
  for (const [field, human] of [
    ["cost_per_sheet", "sheet cost"],
    ["sheet_length_inches", "sheet length (in)"],
    ["sheet_width_inches", "sheet width (in)"],
    ["thickness_inches", "thickness (in)"],
    ["yield_factor", "sheet yield factor"],
    ["material_type", "material type"]
  ]) {
    const v = mat[field];
    if (field === "material_type") {
      if (!recorded(v)) {
        addCat(
          field,
          "dimensional_material_setting_unavailable",
          `Dimensional material "${mat.material_name || mat.id}": record a ${human} \u2014 the cut multiplier cannot resolve and silently prices as 1.0\xD7`,
          { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] }
        );
      }
      continue;
    }
    if (field === "yield_factor") {
      const n = channelNumber(v);
      if (n === null || n <= 0 || n > 1) {
        addCat(
          field,
          "dimensional_material_setting_unavailable",
          `Dimensional material "${mat.material_name || mat.id}": record a ${human} between 0 and 1 \u2014 it silently prices at 70%`,
          { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] }
        );
      }
      continue;
    }
    const check = field === "cost_per_sheet" ? channelNonNegativeNumber : channelPositiveNumber;
    if (check(v) === null) {
      addCat(
        field,
        "dimensional_material_setting_unavailable",
        `Dimensional material "${mat.material_name || mat.id}": record a ${field === "cost_per_sheet" ? "finite, nonnegative" : "positive, finite"} ${human} \u2014 the per-sqin material price is unavailable`,
        { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] }
      );
    }
  }
};
var dimensionalSettingIssues = ({ addCat, fab, settings, dimensionalMaterials, rowLabel }) => {
  dimensionalMaterialIssues({ addCat, fab, settings, dimensionalMaterials, rowLabel });
  const method = fab?.cutting_method === "laser" ? "laser" : "cnc";
  const required = method === "laser" ? LASER_REQUIRED : CNC_REQUIRED;
  const optional = method === "laser" ? LASER_OPTIONAL : CNC_OPTIONAL;
  for (const key of required) {
    if (!recorded(settings?.[key]) || channelNumber(settings[key]) === null) {
      addCat(
        key,
        "dimensional_setting_unavailable",
        `Setting ${key}: record a finite ${method === "laser" ? "laser" : "CNC"} ${key.replace(/_/g, " ")} \u2014 ${rowLabel} would price with a hidden default`,
        { hold: "letters", letterTypes: ["dimensional_letters"] }
      );
    }
  }
  for (const key of optional) {
    if (recorded(settings?.[key]) && channelNonNegativeNumber(settings[key]) === null) {
      addCat(
        key,
        "dimensional_setting_unavailable",
        `Setting ${key}: fix the malformed value or clear it in ${method === "laser" ? "Laser" : "CNC"} Settings`,
        { hold: "letters", letterTypes: ["dimensional_letters"] }
      );
    }
  }
  const thickness = fab?.material_thickness_inches;
  const prefix = method === "laser" ? "cut_speed_" : "cnc_cut_speed_";
  const candidates = imperialThicknessKeys(thickness);
  if (candidates.length > 0) {
    const firstRecorded = candidates.map((c) => `${prefix}${c}`).find((k) => recorded(settings?.[k]));
    if (firstRecorded) {
      if (channelPositiveNumber(settings[firstRecorded]) === null) {
        addCat(
          firstRecorded,
          "dimensional_setting_unavailable",
          `Setting ${firstRecorded}: record a positive, finite cut speed (in/min) \u2014 ${rowLabel} would price with a hidden default`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    } else {
      addCat(
        `${prefix}${candidates[0]}`,
        "dimensional_setting_unavailable",
        `No ${method} cut-speed setting exists for ${thickness}" material (looked for ${candidates.map((c) => `${prefix}${c}`).join(", ")}) \u2014 ${rowLabel} would price with a hidden default`,
        { hold: "letters", letterTypes: ["dimensional_letters"] }
      );
    }
  }
  const matType = String(fab?.material_type || "").toLowerCase();
  if (matType) {
    const multKey = method === "laser" ? `${matType}_cut_multiplier` : `${matType}_cnc_cut_multiplier`;
    if (recorded(settings?.[multKey]) && channelPositiveNumber(settings[multKey]) === null) {
      addCat(
        multKey,
        "dimensional_setting_unavailable",
        `Setting ${multKey}: record a positive, finite cut multiplier or clear it`,
        { hold: "letters", letterTypes: ["dimensional_letters"] }
      );
    }
  }
  if (fab?.paint_letters && fab?.paint_sides !== "none") {
    for (const key of PAINT_REQUIRED_POSITIVE) {
      if (channelPositiveNumber(settings?.[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: record a positive, finite paint coverage (sqft/gal) \u2014 ${rowLabel} would price with a hidden default`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_REQUIRED_NONNEG) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative value in Paint Settings \u2014 ${rowLabel} would price with a hidden default`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_OPTIONAL) {
      if (recorded(settings?.[key]) && channelNonNegativeNumber(settings[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: fix the malformed value or clear it in Paint Settings`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_COST_FIELDS) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative paint component cost \u2014 liquid paint would price as $0`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_RATIO_FIELDS) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative paint mix ratio`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_UNIT_FIELDS) {
      if (recorded(settings?.[key]) && !PAINT_UNITS.has(settings[key])) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: "${settings[key]}" is not a supported paint unit (oz/pint/quart/liter/gallon)`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    const colors = Array.isArray(fab?.paint_colors) ? fab.paint_colors.filter((c) => c && String(c).trim() !== "") : [];
    const numColors = Math.max(1, colors.length || (channelPositiveNumber(fab?.num_paint_colors) ?? 1));
    if (numColors > 1 && channelPositiveNumber(fab?.paint_mask_sqft) !== null) {
      for (const key of PAINT_MASK_REQUIRED) {
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(
            key,
            "dimensional_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative paint-mask rate in Paint Settings`,
            { hold: "letters", letterTypes: ["dimensional_letters"] }
          );
        }
      }
    }
  }
};
var addOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
var sumStrict = (rows, field) => {
  let total = 0;
  for (const r of rows || []) {
    const v = channelNumber(r?.[field]);
    if (v === null) return null;
    total += v;
  }
  return total;
};
var calcChannelProject = ({ project, settings = {}, inventory = [], equipmentInventory = [], dimensionalMaterials = null, savedProject = null } = {}) => {
  const saved = savedProject || project || {};
  if (!settings || Object.keys(settings).length === 0) {
    return { recalculated: { ...project, __held: false, pricingUnavailable: false, issues: [] }, issues: [], held: false };
  }
  const issues = channelProjectIssues(project, { settings, inventory, equipmentInventory, dimensionalMaterials });
  const scope = project?.project_scope || "full";
  const lettersActive = scope !== "install_only";
  const installActive = scope !== "letters_only";
  const settingsWithEnv = { ...settings, _project_install_environment: project?.install_environment || "exterior" };
  const lettersTotals = !lettersActive ? { letters_subtotal: 0, total_letters_cost: 0, letter_purchases: project?.letter_purchases || [] } : calcLettersTotals(project, settingsWithEnv);
  const recalcItems = !installActive ? [] : (project?.items || []).map((it) => calcLineItem(it, settingsWithEnv, inventory));
  const projectForTotals = !installActive ? { ...project, ...lettersTotals, items: recalcItems, selected_equipment: [], personnel: [] } : { ...project, ...lettersTotals, items: recalcItems };
  const totals = calcProjectTotals(projectForTotals);
  const live = { ...project, ...lettersTotals, items: recalcItems, ...totals };
  const held = issues.length > 0;
  if (!held) {
    return {
      recalculated: { ...live, __held: false, pricingUnavailable: false, issues: [] },
      issues: [],
      held: false
    };
  }
  const rawPurchases = project?.letter_purchases || [];
  const rawItems = project?.items || [];
  const heldPurchaseIdx = /* @__PURE__ */ new Set();
  const heldItemIdx = /* @__PURE__ */ new Set();
  const holdSeen = /* @__PURE__ */ new Set();
  issues.forEach((i) => {
    holdSeen.add(i.hold);
    if (i.hold === "purchase" && i.index != null) heldPurchaseIdx.add(i.index);
    if (i.hold === "letters" && Array.isArray(i.letterTypes)) {
      rawPurchases.forEach((p, idx) => {
        if (i.letterTypes.includes(p?.letter_type)) heldPurchaseIdx.add(idx);
      });
    }
    if (i.hold === "install") {
      if (Array.isArray(i.itemIndexes)) i.itemIndexes.forEach((x) => heldItemIdx.add(x));
      else if (i.index != null) heldItemIdx.add(i.index);
      else rawItems.forEach((_, x) => heldItemIdx.add(x));
    }
  });
  const letter_purchases = (live.letter_purchases || []).map((p, idx) => heldPurchaseIdx.has(idx) ? { ...rawPurchases[idx], __held: true } : p);
  const itemsHeld = (live.items || []).map((it, idx) => heldItemIdx.has(idx) ? { ...rawItems[idx], __held: true } : it);
  const cat = (field, current) => Number.isFinite(current) ? current : hasChannelCostSnapshot(saved?.[field]) ? saved[field] : null;
  const purchasesTotal = letter_purchases.length === 0 ? 0 : letter_purchases.reduce((s, p) => {
    if (s === null || p.__held) return null;
    const v = channelNumber(p.total_cost);
    return v === null ? null : s + v;
  }, 0);
  const onlyDimensional = letter_purchases.length > 0 && letter_purchases.every((p) => p.letter_type === "dimensional_letters");
  const feeOrNull = (field) => recorded(project?.[field]) ? channelNonNegativeNumber(project[field]) : 0;
  const delivery = onlyDimensional ? 0 : feeOrNull("letters_delivery_fee");
  const lettersSubtotal = addOrNull(
    purchasesTotal,
    delivery,
    feeOrNull("letters_design_fee"),
    feeOrNull("letters_install_supplies_fee"),
    feeOrNull("letters_permitting_fee"),
    feeOrNull("letters_other_fee")
  );
  const lettersMarkupPct = recorded(project?.letters_markup_percent) ? channelNonNegativeNumber(project.letters_markup_percent) : 0;
  const letters_subtotal = cat("letters_subtotal", lettersSubtotal);
  const totalLetters = lettersMarkupPct === null ? null : Number.isFinite(letters_subtotal) ? letters_subtotal * (1 + lettersMarkupPct / 100) : null;
  const total_letters_cost = cat("total_letters_cost", totalLetters);
  const sumHeld = (rows, field) => {
    let total = 0;
    for (const r of rows || []) {
      if (r.__held) return null;
      const v = channelNumber(r[field]);
      if (v === null) return null;
      total += v;
    }
    return total;
  };
  const labor_hours = installActive ? cat("labor_hours", sumHeld(itemsHeld, "labor_hours")) : 0;
  const labor_cost = installActive ? cat("labor_cost", sumHeld(itemsHeld, "labor_cost")) : 0;
  const total_materials_cost = installActive ? cat("total_materials_cost", sumHeld(itemsHeld, "materials_cost")) : 0;
  const equipmentHeld = holdSeen.has("equipment");
  const personnelHeld = holdSeen.has("personnel");
  const total_equipment_cost = !installActive ? 0 : cat("total_equipment_cost", equipmentHeld ? null : sumStrict(project?.selected_equipment, "total_cost"));
  const total_personnel_cost = !installActive ? 0 : cat("total_personnel_cost", personnelHeld ? null : sumStrict(project?.personnel, "total_cost"));
  const labor_priced_via_personnel = Number.isFinite(total_personnel_cost) ? total_personnel_cost > 0 : hasChannelCostSnapshot(saved?.total_personnel_cost) ? saved.total_personnel_cost > 0 : !!saved?.labor_priced_via_personnel;
  const labor_cost_in_subtotal = labor_priced_via_personnel ? 0 : labor_cost;
  const travelHeld = holdSeen.has("travel");
  const travelCurrent = travelHeld ? null : recorded(project?.total_travel_cost) ? channelNonNegativeNumber(project.total_travel_cost) : 0;
  const total_travel_cost = !installActive ? 0 : cat("total_travel_cost", travelCurrent);
  const suppliesPct = recorded(project?.supplies_percent_of_materials) ? channelNonNegativeNumber(project.supplies_percent_of_materials) : 10;
  const extraSupplies = recorded(project?.extra_supplies_cost) ? channelNonNegativeNumber(project.extra_supplies_cost) : 0;
  const suppliesHeld = holdSeen.has("supplies");
  const suppliesCurrent = suppliesHeld || suppliesPct === null || extraSupplies === null || total_materials_cost === null ? null : total_materials_cost * (suppliesPct / 100) + extraSupplies;
  const total_supplies_cost = !installActive ? 0 : cat("total_supplies_cost", suppliesCurrent);
  const subtotalCurrent = addOrNull(
    labor_cost_in_subtotal,
    total_materials_cost,
    total_supplies_cost,
    total_equipment_cost,
    total_personnel_cost,
    total_travel_cost,
    lettersActive ? total_letters_cost : 0
  );
  const subtotal = cat("subtotal", subtotalCurrent);
  const markupPct = recorded(project?.markup_percent) ? channelNonNegativeNumber(project.markup_percent) : 0;
  const markupCurrent = holdSeen.has("markup") || markupPct === null ? null : Number.isFinite(subtotal) ? subtotal * (markupPct / 100) : null;
  const markup_amount = cat("markup_amount", markupCurrent);
  const total_cost = cat("total_cost", addOrNull(subtotal, markup_amount));
  const recalculated = {
    ...live,
    letter_purchases,
    items: itemsHeld,
    letters_subtotal,
    total_letters_cost,
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
    total_cost,
    __held: true,
    pricingUnavailable: true,
    issues
  };
  return { recalculated, issues, held: true };
};
var issuesForField = (issues = [], field, itemIndex = null, index = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex) && (index === null || i.index === index));
var hasIssueFor = (issues = [], field, itemIndex = null, index = null) => issuesForField(issues, field, itemIndex, index).length > 0;
export {
  calcChannelProject,
  calcLetterPurchase,
  calcLettersTotals,
  calcLineItem,
  calcProjectTotals,
  channelDraftValue,
  channelNonNegativeNumber,
  channelNumber,
  channelPositiveNumber,
  channelProjectIssues,
  emptyLetterPurchase,
  emptyLineItem,
  hasChannelCostSnapshot,
  hasIssueFor,
  issuesForField
};
