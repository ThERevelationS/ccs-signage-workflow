// Calculation logic for Channel Letter Installation estimates
// Pure functions — no React, no entity calls.

import { getWallMaterialMultiplier } from "./wallMaterials";
import { heightBucketFor, normalizeEnv, resolveRateMinutes, TYPE_PREFIXES } from "./installSizeRates";

export const TYPE_LABELS = {
  flush_mount: "Flush Mount",
  halo_lit: "Halo-Lit",
  raceway: "Raceway",
  dimensional_lettering: "Dimensional Lettering",
  dimensional_lettering_with_backer: "Dimensional Lettering + Backer",
};

export const SIZE_LABELS = {
  extra_small: 'XS (2"-8")',
  small: 'Small (8"-12")',
  medium: 'Medium (12"-24")',
  large: 'Large (24"-48")',
  extra_large: 'XL (48"-60")',
  extra_extra_large: 'XXL (60"+)',
};

export const emptyLineItem = () => ({
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
  materials: [],
});

// Decide which inventory items should auto-attach to a new line item.
// NOTE: Raceway hardware ("per_raceway_foot") is intentionally EXCLUDED here —
// raceway cost is priced exclusively on the Letters tab, never in install materials.
export const defaultMaterialsForItem = (item, inventory) => {
  return (inventory || [])
    .filter(inv => {
      if (!inv.is_default) return false;
      if (inv.pricing_mode === "per_raceway_foot") return false; // raceway priced on Letters tab only
      // Prefer the new multi-select field; fall back to legacy single-value field.
      const list = Array.isArray(inv.applies_to_list) ? inv.applies_to_list : [];
      if (list.length > 0) return list.includes(item.installation_type);
      if (!inv.applies_to || inv.applies_to === "all") return true;
      return inv.applies_to === item.installation_type;
    })
    .map(inv => materialFromInventory(inv, item));
};

// Build a material line from an inventory record + line item context
export const materialFromInventory = (inv, item) => {
  const m = {
    inventory_item_id: inv.id,
    item_name: inv.item_name,
    pricing_mode: inv.pricing_mode,
    unit_cost: 0,
    quantity: 0,
    total_cost: 0,
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

// Re-cost a single line item: labor hours, labor cost, materials, total
export const calcLineItem = (item, settings, inventory) => {
  const laborRate = parseFloat(settings.install_labor_rate) || 65;

  // Base rates are stored in MINUTES — convert to hours when reading.
  // Each installation type has its own set of size-based times.
  const MIN_TO_HR = 1 / 60;

  // Defaults by type and size: [drill, prep, electrical]
  const TYPE_DEFAULTS = {
    flush_mount: {
      extra_small: [15, 30, 5],
      small: [30, 60, 10],
      medium: [50, 100, 15],
      large: [80, 160, 20],
      extra_large: [120, 240, 25],
      extra_extra_large: [170, 340, 30],
    },
    halo_lit: {
      extra_small: [15, 30, 5],
      small: [30, 60, 10],
      medium: [50, 100, 15],
      large: [80, 160, 20],
      extra_large: [120, 240, 25],
      extra_extra_large: [170, 340, 30],
    },
    dimensional_lettering: {
      extra_small: [10, 20, 0],
      small: [20, 45, 0],
      medium: [40, 80, 0],
      large: [65, 130, 0],
      extra_large: [100, 200, 0],
      extra_extra_large: [140, 280, 0],
    },
  };

  // Resolve env + height bucket for this line item.
  // Per-item env wins; otherwise the project-level env is passed in via settings._project_install_environment.
  const env = normalizeEnv(item.install_environment || settings._project_install_environment || "exterior");
  const heightBucket = heightBucketFor(item.installation_height_feet);

  const sizeMinutesForType = (type, size) => {
    const prefixes = TYPE_PREFIXES[type];
    const defs = TYPE_DEFAULTS[type]?.[size] || [50, 100, 15];
    if (!prefixes) return defs[0] + defs[1] + defs[2];
    const d = resolveRateMinutes(settings, prefixes.drill, size, env, heightBucket, defs[0]);
    const p = resolveRateMinutes(settings, prefixes.prep,  size, env, heightBucket, defs[1]);
    const e = prefixes.elec ? resolveRateMinutes(settings, prefixes.elec, size, env, heightBucket, defs[2]) : 0;
    return d + p + e;
  };

  // The "+ backer" variant installs at the same per-size rates as plain
  // dimensional lettering (no electrical). Normalize for rate lookups —
  // previously it fell through to medium flush-mount defaults for every size.
  const rateType = item.installation_type === "dimensional_lettering_with_backer"
    ? "dimensional_lettering"
    : item.installation_type;

  let baseHours = 0;

  if (rateType === "raceway") {
    // Raceway: base + extra minutes per foot, plus per-letter mounting minutes, plus electrical hookup per raceway line item.
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

  // Thick / Hollow Walls — ADDITIVE minutes (per letter and per raceway).
  // Added to baseHours so it still scales with height & wall-material multipliers below.
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

  // Parapet — ADDITIVE minutes (per letter and per raceway). Two routing options:
  //   - "roof"  : electrical runs along the rooftop (easier)
  //   - "drop"  : electrical drops down inside the parapet cavity (harder — fishing power down)
  // Defaults to "roof" if not specified.
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

  // NOTE: A separate "height multiplier" used to be applied here. Heights are now
  // baked into each per-size rate set (size × height bucket × interior/exterior),
  // so no extra multiplier is needed.

  // Wall material multiplier
  baseHours *= getWallMaterialMultiplier(item.wall_material, settings);

  if (item.escort_required) baseHours *= parseFloat(settings.install_escort_multiplier) || 1.15;
  if (item.badging_checkin) baseHours *= parseFloat(settings.install_badging_multiplier) || 1.1;
  if (item.after_hours_weekend) baseHours *= parseFloat(settings.install_after_hours_multiplier) || 1.5;
  if (item.set_hours_installation) baseHours *= parseFloat(settings.install_set_hours_multiplier) || 1.15;

  // Poor Site Access — ADDITIVE: severity level adds minutes/letter on top of the base install time.
  if (item.poor_site_access) {
    const level = Math.max(1, Math.min(10, parseInt(item.poor_site_access_severity) || 1));
    const severityDefaults = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 20, 6: 28, 7: 38, 8: 50, 9: 65, 10: 90 };
    const bonusMin = parseFloat(settings[`install_site_access_level_${level}`]);
    const bonus = isNaN(bonusMin) ? severityDefaults[level] : bonusMin;
    baseHours += ((parseFloat(item.qty_letters) || 0) * bonus) * MIN_TO_HR;
  }

  // Poor Electrical Access — ADDITIVE: severity level adds minutes/letter on top of the size's electrical hookup baseline.
  // Note: the size's electrical hookup baseline is ALREADY included in baseHours via sizeMinutesForType() above.
  // Here we add only the SEVERITY bonus on top of that, scaled by qty_letters.
  // Excluded for raceway (uses its own per-raceway hookup) and dimensional (no electrical at all).
  if (item.poor_electrical_access && rateType !== "raceway" && rateType !== "dimensional_lettering") {
    const level = Math.max(1, Math.min(10, parseInt(item.poor_electrical_severity) || 1));
    const severityDefaults = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 20, 6: 28, 7: 38, 8: 50, 9: 65, 10: 90 };
    const bonusMin = parseFloat(settings[`install_poor_electrical_level_${level}`]);
    const bonus = isNaN(bonusMin) ? severityDefaults[level] : bonusMin;
    baseHours += ((parseFloat(item.qty_letters) || 0) * bonus) * MIN_TO_HR;
  }

  // Recompute material quantities based on current item state (qty/size/raceway changed).
  // Raceway hardware ("per_raceway_foot") is priced on the Letters tab only, so we
  // strip any such material that may linger on older saved estimates.
  const materials = (item.materials || [])
    .filter(mat => mat.pricing_mode !== "per_raceway_foot")
    .map(mat => {
      const inv = (inventory || []).find(i => i.id === mat.inventory_item_id);
      if (!inv) {
        // detached/manual material — leave as-is
        return { ...mat, total_cost: (parseFloat(mat.unit_cost) || 0) * (parseFloat(mat.quantity) || 0) };
      }
      if (inv.pricing_mode === "per_raceway_foot") return null;
      return materialFromInventory(inv, item);
    })
    .filter(Boolean);

  const materialsCost = materials.reduce((sum, m) => sum + (parseFloat(m.total_cost) || 0), 0);
  const laborCost = baseHours * laborRate;
  const itemTotalCost = laborCost + materialsCost;

  return {
    ...item,
    materials,
    labor_hours: baseHours,
    labor_cost: laborCost,
    materials_cost: materialsCost,
    item_total_cost: itemTotalCost,
  };
};

// Project-level rollup
export const calcProjectTotals = (project) => {
  const items = project.items || [];
  const total_materials_cost = items.reduce((s, it) => s + (parseFloat(it.materials_cost) || 0), 0);
  const labor_cost = items.reduce((s, it) => s + (parseFloat(it.labor_cost) || 0), 0);
  const labor_hours = items.reduce((s, it) => s + (parseFloat(it.labor_hours) || 0), 0);

  // Equipment rollup
  const total_equipment_cost = (project.selected_equipment || []).reduce(
    (s, e) => s + (parseFloat(e.total_cost) || 0), 0
  );

  // Personnel rollup
  const total_personnel_cost = (project.personnel || []).reduce(
    (s, p) => s + (parseFloat(p.total_cost) || 0), 0
  );

  // When a crew is assigned, the personnel rows ARE the priced version of the
  // calculated install hours (same hours split across the crew at role rates).
  // Counting both would bill the same labor twice — personnel pricing REPLACES
  // the flat-rate labor estimate in the subtotal.
  const labor_priced_via_personnel = total_personnel_cost > 0;
  const labor_cost_in_subtotal = labor_priced_via_personnel ? 0 : labor_cost;

  // Letters purchase rollup (calculated by lettersCalculator separately;
  // we just read the already-stored project.total_letters_cost here)
  const total_letters_cost = parseFloat(project.total_letters_cost) || 0;

  // Supplies are derived from materials cost (percent) + an optional manual extra amount
  const pct = parseFloat(project.supplies_percent_of_materials);
  const suppliesPct = isNaN(pct) ? 10 : pct; // default 10% of materials
  const extra = parseFloat(project.extra_supplies_cost) || 0;
  const supplies_from_materials = total_materials_cost * (suppliesPct / 100);
  const total_supplies_cost = supplies_from_materials + extra;

  // Travel cost — already computed in the UI and stored on the project. Just roll it in.
  const total_travel_cost = parseFloat(project.total_travel_cost) || 0;

  const subtotal =
    labor_cost_in_subtotal +
    total_materials_cost +
    total_supplies_cost +
    total_equipment_cost +
    total_personnel_cost +
    total_travel_cost +
    total_letters_cost;
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
    total_cost,
  };
};