// Channel Letter pricing-availability layer.
//
// Wraps the live calculators (lettersCalculator / installCalculator /
// calcProjectTotals) with strict finite-number input validation so a missing,
// malformed, or unavailable pricing input can no longer silently become $0,
// a hidden Excel-sheet default, or a dropped line item. Mirrors the Vinyl /
// Foundation hardening convention:
//   - strict parsers (channelNumber / channelNonNegativeNumber /
//     channelPositiveNumber); numeric strings accepted, "", "abc", Infinity,
//     NaN, null, undefined rejected.
//   - structured issue records { kind, index, itemIndex, inventoryId, field,
//     code, message, hold } split into authored-input issues (kind "channel")
//     and catalog issues (kind "channel_catalog": Settings + inventory +
//     equipment + dimensional-material records).
//   - per-row "holds" poison only the tainted purchase/install rows and their
//     derived aggregates; aggregates are re-derived null-propagating and fall
//     back to the saved acknowledged snapshot only when it is a real finite
//     number — never to a default.
//   - explicit 0 stays valid where the calculator treats it as a real
//     price/quantity (fees, markups, custom material costs, idle hours);
//     quantities, sizes, durations, and rates that silently cancel a price
//     must be positive.
//   - raw rows are never mutated — held rows are passed through as { ...row }
//     preserving their saved acknowledged fields.
//   - TravelCostCard is shared with Maintenance and Vinyl, so it stays
//     untouched: its settings/vehicle inputs are validated HERE at the
//     calculation boundary, exactly like vinylPricingAvailability does.
//
// Valid inputs take the exact same code path as before: the recalculated
// object the page receives for a clean project is field-identical to today's
// result (plus __held / pricingUnavailable / issues metadata).

import { calcLettersTotals } from "./lettersCalculator";
import { calcLineItem, calcProjectTotals } from "./installCalculator";
import { TYPE_PREFIXES } from "./installSizeRates";
import { qualifiedKey } from "./installSizeRates";
import { WALL_MATERIAL_MAP } from "./wallMaterials";

// ---------- strict parsers ----------
// Finite number or null. Accepts real numbers and trimmed numeric strings;
// rejects "", "abc", Infinity, NaN, null, undefined, objects.
export const channelNumber = (v) => {
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
export const channelNonNegativeNumber = (v) => {
  const n = channelNumber(v);
  return n !== null && n >= 0 ? n : null;
};
export const channelPositiveNumber = (v) => {
  const n = channelNumber(v);
  return n !== null && n > 0 ? n : null;
};

// A value that was actually recorded on the record (not absent/blank).
const recorded = (v) => v !== undefined && v !== null && v !== "";

// Saved acknowledged pricing snapshot — only a real finite number counts.
// This is the gate for "Saved amounts (not current pricing)" display.
export const hasChannelCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);

// Blank-preserving input helper for number fields (Foundation heightInput /
// Vinyl vinylDraftValue pattern): "" stays "" so the input does not fight the
// user mid-typing; parseable text becomes a number; anything else stays raw so
// validation can flag it instead of laundering it into 0.
export const channelDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

// ---------- issue records ----------
const issue = (kind, { index = null, itemIndex = null, componentId = null, inventoryId = null, field, code, message, hold = "project", letterTypes = undefined, itemIndexes = undefined }) => {
  const rec = { kind, index, itemIndex, componentId, inventoryId, field, code, message, hold };
  // letterTypes: array → the issue poisons purchase rows of those types;
  // null → aggregate-only hold (letters subtotal/total, not row fields).
  if (letterTypes !== undefined) rec.letterTypes = letterTypes;
  // itemIndexes: array → install item rows poisoned by this issue.
  if (itemIndexes !== undefined) rec.itemIndexes = itemIndexes;
  return rec;
};

// ---------- constants mirrored from the live calculators ----------
// These lists describe which Settings keys each calculator consumes; they are
// NOT new formulas — the formulas stay inside the calculators untouched.
const RACEWAY_TIER_KEYS = [
  "letters_raceway_1st_per_ft",
  "letters_raceway_2nd_per_ft",
  "letters_raceway_3rd_per_ft",
  "letters_raceway_4th_per_ft",
];

const LETTER_RATE_KEY_BY_TYPE = {
  channel_raceway_mounted: "letters_channel_raceway_per_inch",
  channel_flush_mounted: "letters_channel_flush_per_inch",
  channel_halo_lit: "letters_channel_halo_per_inch",
  capsule_logo_pillbox: "letters_capsule_logo_per_sqft",
};

const VALID_LETTER_TYPES = new Set([
  "raceway", "channel_raceway_mounted", "channel_flush_mounted",
  "channel_halo_lit", "capsule_logo_pillbox", "dimensional_letters",
]);

const VALID_INSTALL_TYPES = new Set([
  "flush_mount", "halo_lit", "raceway",
  "dimensional_lettering", "dimensional_lettering_with_backer",
]);

const VALID_SIZES = new Set([
  "extra_small", "small", "medium", "large", "extra_large", "extra_extra_large",
]);

const MINUTES_SETTINGS_BY_CONDITION = {
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
  set_hours_installation: () => ["install_set_hours_multiplier"],
};

const ROLE_RATE_KEY = {
  "Crew Lead": "install_crew_lead_rate",
  "Installer": "install_installer_rate",
  "Helper": "install_helper_rate",
};

const VEHICLE_TYPES = new Set(["truck", "van", "flatbed", "car", "boom_truck"]);
const OWNED_MODES = new Set(["owned_flat", "per_project_flat"]);
const EQUIPMENT_COST_FIELD = {
  per_hour: "cost_per_hour",
  per_day: "cost_per_day",
  per_week: "cost_per_week",
  per_month: "cost_per_month",
  owned_flat: "cost_flat",
  per_project_flat: "cost_flat",
};

const CNC_REQUIRED = ["cnc_machine_rate", "cnc_labor_rate", "cnc_setup_time_percentage", "cnc_letter_perimeter_factor"];
const CNC_OPTIONAL = ["min_cnc_setup_hours", "min_cnc_labor_hours"];
const LASER_REQUIRED = ["parameter_laser_machine_rate", "parameter_laser_labor_rate", "parameter_handling_time_percentage", "laser_letter_perimeter_factor"];
const LASER_OPTIONAL = ["min_laser_setup_hours", "min_laser_labor_hours"];
// Paint settings consumed whenever fab_config.paint_letters && sides !== "none".
// These all have silent defaults inside dimensionalFabCalculator — absent = issue.
const PAINT_REQUIRED_NONNEG = [
  "default_labor_rate", "default_paint_supplies_per_sqft", "paint_waste_multiplier",
  "base_labor_hours_per_sqft", "paint_mixing_labor_hours", "setup_time_labor_hours",
  "color_change_setup_hours", "paint_gun_cleaning_hours",
  "one_side_paint_multiplier", "both_sides_paint_multiplier",
  "complex_complexity_multiplier", "additional_color_multiplier",
];
const PAINT_REQUIRED_POSITIVE = ["mixed_paint_coverage_sqft_per_gallon"];
const PAINT_OPTIONAL = ["min_labor_hours", "min_paint_cost"];
// Mask rates — consumed only when numColors > 1 && paint_mask_sqft > 0.
const PAINT_MASK_REQUIRED = [
  "paint_mask_rate_per_sqft", "paint_mask_machine_cutting_rate_per_sqft",
  "paint_mask_application_labor_rate_per_sqft", "paint_mask_cutting_labor_rate_per_sqft",
];
const PAINT_UNIT_FIELDS = ["paint_unit", "hardener_unit", "reducer_unit"];
const PAINT_UNITS = new Set(["oz", "pint", "quart", "liter", "gallon"]);
const PAINT_COST_FIELDS = ["paint_cost_per_unit", "hardener_cost_per_unit", "reducer_cost_per_unit"];
const PAINT_RATIO_FIELDS = ["paint_mix_ratio", "hardener_mix_ratio", "reducer_mix_ratio"];

// Map a decimal thickness to the imperial setting-key suffixes the calculator
// tries (same table as dimensionalFabCalculator.decimalToImperialKeys).
const imperialThicknessKeys = (decimal) => {
  const map = {
    0.0625: ["1_16"], 0.125: ["1_8"], 0.1875: ["3_16"], 0.25: ["1_4"],
    0.375: ["3_8"], 0.5: ["1_2"], 0.625: ["5_8"], 0.75: ["3_4"],
    0.875: ["7_8"], 1: ["1"], 1.25: ["1_1_4"], 1.5: ["1_1_2"], 2: ["2"],
    2.5: ["2_1_2"], 3: ["3"], 3.5: ["3_1_2"], 4: ["4"],
  };
  const n = channelNumber(decimal);
  if (n === null) return [];
  const snap = Math.round(n * 16) / 16;
  return map[snap] || [];
};

// ---------- project-level issue scan ----------
// Covers everything calcLettersTotals / calcLineItem / calcProjectTotals /
// TravelCostCard / equipmentSuggester consume. Returns structured issues in
// stable order: letter purchases → install items → equipment → personnel →
// travel → project knobs, then merged catalog issues.
export const channelProjectIssues = (project, {
  settings = {},
  inventory = [],
  equipmentInventory = [],
  dimensionalMaterials = null, // null = entity not loaded → skip staleness checks
} = {}) => {
  const issues = [];
  // Dedupe sets keep repeat offenders (same field flagged on many rows) sane.
  const inSeen = new Set();
  const add = (field, code, message, { hold, index = null, itemIndex = null, componentId = null } = {}) => {
    const key = `${index}|${itemIndex}|${field}|${code}`;
    if (inSeen.has(key)) return;
    inSeen.add(key);
    issues.push(issue("channel", { index, itemIndex, componentId, field, code, message, hold }));
  };
  const catSeen = new Map();
  const addCat = (field, code, message, { hold = "project", itemIndexes = null, inventoryId = null, letterTypes = undefined, index = null, componentId = null } = {}) => {
    const key = `${code}|${field}|${inventoryId || ""}`;
    const existing = catSeen.get(key);
    if (existing) {
      if (Array.isArray(itemIndexes)) existing.itemIndexes = [...new Set([...(existing.itemIndexes || []), ...itemIndexes])];
      if (Array.isArray(letterTypes)) existing.letterTypes = [...new Set([...(existing.letterTypes || []), ...letterTypes])];
      return;
    }
    const rec = issue("channel_catalog", {
      index, componentId, inventoryId, field, code, message, hold,
      itemIndexes: Array.isArray(itemIndexes) ? itemIndexes : undefined,
      letterTypes,
    });
    catSeen.set(key, rec);
  };

  const scope = project?.project_scope || "full";
  const lettersActive = scope !== "install_only";
  const installActive = scope !== "letters_only";
  const items = project?.items || [];
  const purchases = project?.letter_purchases || [];
  const envOf = (item) => (item?.install_environment === "interior" ? "interior" : "exterior");
  const projectEnv = project?.install_environment === "interior" ? "interior" : "exterior";

  // Settings required when letters are priced at all: only the keys the
  // present letter types actually consume (mirrors resolveUnitCost /
  // resolveRacewayAvgPerFt consumption exactly).
  const racewayTiersFor = (qty) => Math.max(1, Math.min(4, Math.floor(channelPositiveNumber(qty) ?? 1)));

  if (lettersActive) {
    purchases.forEach((p, index) => {
      const type = p?.letter_type;
      const label = `Letter row ${index + 1}${p?.description ? ` "${p.description}"` : ""}`;

      if (!VALID_LETTER_TYPES.has(type)) {
        add("letter_type", "channel_letter_type_unavailable",
          `${label}: choose a supported letter type — "${type || "blank"}" prices as $0`, { hold: "purchase", index, componentId: p?.id ?? null });
        return;
      }

      // Qty is consumed multiplicatively for every type — 0/blank = silent $0.
      if (channelPositiveNumber(p?.qty) === null) {
        add("qty", "channel_qty_unavailable",
          `${label}: record a positive, finite quantity — a blank or zero quantity prices the row as $0`, { hold: "purchase", index, componentId: p?.id ?? null });
      }

      // Per-letter-type catalog settings + row inputs.
      if (type === "raceway") {
        const tiers = racewayTiersFor(p?.qty);
        for (let i = 0; i < tiers; i++) {
          const key = RACEWAY_TIER_KEYS[i];
          if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
            addCat(key, "channel_letter_rate_unavailable",
              `Setting ${key}: record a positive, finite raceway tier ${i + 1} $/ft rate — ${label} would price with a hidden default`, { hold: "letters", letterTypes: ["raceway"] });
          }
        }
        // Standalone raceway rows consume size_value as the raceway length
        // (ft): letters_total = $/ft × length × qty — blank/0 silently prices $0.
        if (channelPositiveNumber(p?.size_value) === null) {
          add("size_value", "channel_size_unavailable",
            `${label}: record a positive, finite raceway length (ft) — a blank or zero length prices the row as $0`, { hold: "purchase", index, componentId: p?.id ?? null });
        }
      } else if (type === "channel_raceway_mounted") {
        // Letter portion: per-inch rate + qty + size.
        const key = LETTER_RATE_KEY_BY_TYPE[type];
        if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
          addCat(key, "channel_letter_rate_unavailable",
            `Setting ${key}: record a positive, finite per-inch letter rate — ${label} would price with a hidden default`, { hold: "letters", letterTypes: [type] });
        }
        if (channelPositiveNumber(p?.size_value) === null) {
          add("size_value", "channel_size_unavailable",
            `${label}: record a positive, finite letter height (in) — a blank or zero size prices the letters as $0`, { hold: "purchase", index, componentId: p?.id ?? null });
        }
        // Raceway portion: qty + length + tier rates.
        if (channelPositiveNumber(p?.raceway_qty) === null) {
          add("raceway_qty", "channel_raceway_qty_unavailable",
            `${label}: record a positive, finite # of raceways`, { hold: "purchase", index, componentId: p?.id ?? null });
        }
        if (channelPositiveNumber(p?.raceway_length_feet) === null) {
          add("raceway_length_feet", "channel_raceway_length_unavailable",
            `${label}: record a positive, finite raceway length (ft) — raceway hardware would price as $0`, { hold: "purchase", index, componentId: p?.id ?? null });
        }
        const rwTiers = racewayTiersFor(p?.raceway_qty);
        for (let i = 0; i < rwTiers; i++) {
          const k = RACEWAY_TIER_KEYS[i];
          if (!recorded(settings?.[k]) || channelPositiveNumber(settings[k]) === null) {
            addCat(k, "channel_letter_rate_unavailable",
              `Setting ${k}: record a positive, finite raceway tier ${i + 1} $/ft rate — ${label} would price with a hidden default`, { hold: "letters", letterTypes: [type] });
          }
        }
        if (p?.raceway_unit_cost_override && channelNonNegativeNumber(p?.raceway_unit_cost) === null) {
          add("raceway_unit_cost", "channel_raceway_unit_cost_unavailable",
            `${label}: record a finite, nonnegative raceway $/ft override`, { hold: "purchase", index, componentId: p?.id ?? null });
        }
        if (p?.raceway_total_override && channelNonNegativeNumber(p?.raceway_total) === null) {
          add("raceway_total", "channel_raceway_total_unavailable",
            `${label}: record a finite, nonnegative raceway total override`, { hold: "purchase", index, componentId: p?.id ?? null });
        }
      } else if (type === "dimensional_letters") {
        // Dimensional rows price off fab_config.unit_total_cost × qty.
        const fab = p?.fab_config;
        if (!fab || !recorded(fab.material_id) || channelNonNegativeNumber(fab.unit_total_cost) === null) {
          add("fab_config", "dimensional_fab_unavailable",
            `${label}: complete "Build Fab Cost" — a dimensional row without a material + computed unit cost prices as $0`, { hold: "purchase", index, componentId: p?.id ?? null });
        } else {
          // Stored snapshot is complete; still flag catalog-side problems that
          // produced it so a stale/unpriced record stays visible.
          if (!["cnc", "laser"].includes(fab.cutting_method)) {
            add("cutting_method", "dimensional_fab_unavailable",
              `${label}: choose a supported cutting method (CNC / Laser)`, { hold: "purchase", index, componentId: p?.id ?? null });
          }
          // Letter dims drive face area / perimeter — a blank or zero height
          // under-prices material + cut + paint silently.
          if (channelPositiveNumber(fab.letter_height_inches) === null) {
            add("fab_config", "dimensional_fab_unavailable",
              `${label}: record a positive, finite letter height (in) in the fab builder`, { hold: "purchase", index, componentId: p?.id ?? null });
          }
          if (fab.width_override && channelPositiveNumber(fab.letter_width_inches) === null) {
            add("fab_config", "dimensional_fab_unavailable",
              `${label}: Oversize is on — record a positive, finite letter width (in) or turn Oversize off`, { hold: "purchase", index, componentId: p?.id ?? null });
          }
          dimensionalSettingIssues({ addCat, fab, settings, dimensionalMaterials, rowLabel: label });
        }
        if (p?.unit_cost_override && channelNonNegativeNumber(p?.unit_cost) === null) {
          add("unit_cost", "channel_unit_cost_unavailable",
            `${label}: record a finite, nonnegative per-letter cost override`, { hold: "purchase", index, componentId: p?.id ?? null });
        }
        // Backer panel — enabled rows consume backer_fab_config + standoffs.
        if (p?.backer_enabled) {
          const bf = p?.backer_fab_config;
          if (!bf || !recorded(bf.material_id) || channelNonNegativeNumber(bf.unit_total_cost) === null) {
            add("backer_fab_config", "dimensional_backer_unavailable",
              `${label}: complete the Backer Panel fab (material + size + computed cost) or remove the backer — it currently prices as $0`, { hold: "purchase", index, componentId: p?.id ?? null });
          } else {
            if (!["cnc", "laser"].includes(bf.cutting_method)) {
              add("cutting_method", "dimensional_backer_unavailable",
                `${label}: backer panel has an unsupported cutting method`, { hold: "purchase", index, componentId: p?.id ?? null });
            }
            if (channelPositiveNumber(bf.width_inches) === null || channelPositiveNumber(bf.height_inches) === null) {
              add("backer_fab_config", "dimensional_backer_unavailable",
                `${label}: record positive, finite backer panel width × height (in)`, { hold: "purchase", index, componentId: p?.id ?? null });
            }
          }
          if (recorded(p?.backer_standoff_qty) && channelNonNegativeNumber(p.backer_standoff_qty) === null) {
            add("backer_standoff_qty", "channel_standoff_unavailable",
              `${label}: record a finite, nonnegative standoff quantity or clear it`, { hold: "purchase", index, componentId: p?.id ?? null });
          }
          if (recorded(p?.backer_standoff_inventory_id)) {
            const standoff = inventory.find(i => i.id === p.backer_standoff_inventory_id);
            if (!standoff) {
              addCat("backer_standoff_inventory_id", "channel_material_unavailable",
                `${label}: the selected standoff record is no longer available — reselect it`, { hold: "purchase", inventoryId: p.backer_standoff_inventory_id, index });
            } else {
              // BackerSection consumes cost_per_letter ?? cost_flat.
              const cost = recorded(standoff.cost_per_letter) ? standoff.cost_per_letter : standoff.cost_flat;
              if (!recorded(cost) || channelNonNegativeNumber(cost) === null) {
                addCat(recorded(standoff.cost_per_letter) ? "cost_per_letter" : "cost_flat", "channel_material_price_unavailable",
                  `Inventory "${standoff.item_name || "standoff"}": record a finite, nonnegative standoff cost — a missing price is not free`, { hold: "purchase", inventoryId: standoff.id, index });
              }
            }
          }
          if (bf && recorded(bf.material_id)) {
            dimensionalMaterialIssues({ addCat, fab: bf, settings, dimensionalMaterials, rowLabel: `${label} (backer)` });
            dimensionalSettingIssues({ addCat, fab: bf, settings, dimensionalMaterials: null, rowLabel: `${label} (backer)` });
          }
        }
      } else {
        // flush / halo / capsule: per-type rate + size.
        const key = LETTER_RATE_KEY_BY_TYPE[type];
        if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
          addCat(key, "channel_letter_rate_unavailable",
            `Setting ${key}: record a positive, finite ${type.replace(/_/g, " ")} rate — ${label} would price with a hidden default`, { hold: "letters", letterTypes: [type] });
        }
        if (channelPositiveNumber(p?.size_value) === null) {
          add("size_value", "channel_size_unavailable",
            `${label}: record a positive, finite ${type === "capsule_logo_pillbox" ? "area (sq ft)" : "letter height (in)"} — a blank or zero size prices the row as $0`, { hold: "purchase", index, componentId: p?.id ?? null });
        }
      }

      // Shared override inputs (non-dimensional).
      if (type !== "dimensional_letters" && p?.unit_cost_override && channelNonNegativeNumber(p?.unit_cost) === null) {
        add("unit_cost", "channel_unit_cost_unavailable",
          `${label}: record a finite, nonnegative unit cost override`, { hold: "purchase", index, componentId: p?.id ?? null });
      }
      if (p?.letters_total_override && channelNonNegativeNumber(p?.letters_total) === null) {
        add("letters_total", "channel_letters_total_unavailable",
          `${label}: record a finite, nonnegative line total override`, { hold: "purchase", index, componentId: p?.id ?? null });
      }
      // install_height_feet feeds the synced install item's height bucket.
      if (recorded(p?.install_height_feet) && channelNonNegativeNumber(p.install_height_feet) === null) {
        add("install_height_feet", "channel_install_height_unavailable",
          `${label}: record a finite, nonnegative install height (ft) or clear it`, { hold: "purchase", index, componentId: p?.id ?? null });
      }
    });

    // Project-level letter fees — recorded must be finite, nonnegative.
    // Absent = dormant 0 (ported behavior).
    const onlyDimensional = purchases.length > 0 && purchases.every(p => p.letter_type === "dimensional_letters");
    for (const [field, human] of [
      ["letters_delivery_fee", "delivery / shipping fee"],
      ["letters_design_fee", "design fee"],
      ["letters_install_supplies_fee", "install supplies fee"],
      ["letters_permitting_fee", "permitting fee"],
      ["letters_other_fee", "other fee"],
    ]) {
      if (field === "letters_delivery_fee" && onlyDimensional) continue;
      if (recorded(project?.[field]) && channelNonNegativeNumber(project[field]) === null) {
        add(field, "channel_fee_unavailable",
          `record a finite, nonnegative ${human} or clear it — a malformed fee corrupts the letters subtotal`, { hold: "letters", });
      }
    }
    if (recorded(project?.letters_markup_percent) && channelNonNegativeNumber(project.letters_markup_percent) === null) {
      add("letters_markup_percent", "channel_letters_markup_unavailable",
        "record a finite, nonnegative letters markup % or clear it", { hold: "letters" });
    }
  }

  // ---------- install line items ----------
  if (installActive) {
    items.forEach((it, index) => {
      const label = `Install item ${index + 1}${it?.description ? ` "${it.description}"` : ""}`;
      const type = it?.installation_type;
      const rateType = type === "dimensional_lettering_with_backer" ? "dimensional_lettering" : type;
      const isRaceway = rateType === "raceway";
      const env = envOf(it) || projectEnv;

      if (!VALID_INSTALL_TYPES.has(type)) {
        add("installation_type", "channel_item_type_unavailable",
          `${label}: choose a supported installation type — "${type || "blank"}" silently prices at flush-mount defaults`, { hold: "install", index, itemIndex: index });
        return;
      }

      // qty_letters: raceway rows may legitimately mount 0 letters.
      const qtyCheck = isRaceway ? channelNonNegativeNumber : channelPositiveNumber;
      if (qtyCheck(it?.qty_letters) === null) {
        add("qty_letters", "channel_item_qty_unavailable",
          `${label}: record a ${isRaceway ? "finite, nonnegative" : "positive, finite"} letter quantity${isRaceway ? "" : " — 0 letters prices the row as $0"}`, { hold: "install", index, itemIndex: index });
      }
      if (!isRaceway && !VALID_SIZES.has(it?.letter_size)) {
        add("letter_size", "channel_item_size_unavailable",
          `${label}: choose a letter size — "${it?.letter_size || "blank"}" silently prices at medium-size defaults`, { hold: "install", index, itemIndex: index });
      }
      if (isRaceway && channelPositiveNumber(it?.raceway_length_feet) === null) {
        add("raceway_length_feet", "channel_raceway_length_unavailable",
          `${label}: record a positive, finite raceway length (ft)`, { hold: "install", index, itemIndex: index });
      }
      if (recorded(it?.installation_height_feet) && channelNonNegativeNumber(it.installation_height_feet) === null) {
        add("installation_height_feet", "channel_item_height_unavailable",
          `${label}: record a finite, nonnegative install height (ft) or clear it`, { hold: "install", index, itemIndex: index });
      }
      if (recorded(it?.install_environment) && !["interior", "exterior"].includes(it.install_environment)) {
        add("install_environment", "channel_item_env_unavailable",
          `${label}: choose Interior or Exterior — "${it.install_environment}" silently resolves as exterior`, { hold: "install", index, itemIndex: index });
      }

      // Settings this item consumes (catalog side).
      // Base labor rate — always consumed.
      if (!recorded(settings?.install_labor_rate) || channelPositiveNumber(settings.install_labor_rate) === null) {
        addCat("install_labor_rate", "channel_install_rate_unavailable",
          `Setting install_labor_rate: record a positive, finite install labor rate — ${label} would price with a hidden default`, { hold: "install", itemIndexes: [index] });
      }

      if (isRaceway) {
        for (const [key, human] of [
          ["install_raceway_base_minutes_per_foot", "raceway base minutes per foot"],
          ["install_raceway_letter_mounting_rate", "raceway letter mounting minutes"],
          ["install_raceway_electrical_hookup_minutes", "raceway electrical hookup minutes"],
        ]) {
          if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
            addCat(key, "channel_install_minutes_unavailable",
              `Setting ${key}: record a finite, nonnegative ${human} — ${label} would price with a hidden default`, { hold: "install", itemIndexes: [index] });
          }
        }
        if (recorded(settings?.install_raceway_extra_minutes_per_foot)
            && channelNonNegativeNumber(settings.install_raceway_extra_minutes_per_foot) === null) {
          addCat("install_raceway_extra_minutes_per_foot", "channel_install_minutes_unavailable",
            "Setting install_raceway_extra_minutes_per_foot is malformed — fix or clear it in Installation Settings", { hold: "install", itemIndexes: [index] });
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
          // Unknown type with no rate prefixes → falls through to hardcoded
          // [50,100,15] medium defaults inside the calculator.
          add("installation_type", "channel_item_type_unavailable",
            `${label}: "${type}" has no configured size-rate settings — it silently prices at hardcoded defaults`, { hold: "install", index, itemIndex: index });
        }
      }

      // Wall material multiplier — silent catalog default when setting absent.
      const wallDef = WALL_MATERIAL_MAP[it?.wall_material];
      if (it?.wall_material && !wallDef) {
        add("wall_material", "channel_wall_material_unavailable",
          `${label}: "${it.wall_material}" is not a configured wall material — it silently prices at a 1.0× multiplier`, { hold: "install", index, itemIndex: index });
      } else if (wallDef) {
        const v = settings?.[wallDef.settingKey];
        if (!recorded(v) || channelNumber(v) === null) {
          addCat(wallDef.settingKey, "channel_wall_multiplier_unavailable",
            `Setting ${wallDef.settingKey}: record a finite ${wallDef.label} time multiplier — ${label} would price with a hidden default`, { hold: "install", itemIndexes: [index] });
        }
      }

      // Condition-toggle settings — consumed only when the toggle is on.
      for (const [flag, keysFor] of Object.entries(MINUTES_SETTINGS_BY_CONDITION)) {
        if (!it?.[flag]) continue;
        for (const key of keysFor(it)) {
          const v = settings?.[key];
          if (!recorded(v) || channelPositiveNumber(v) === null) {
            addCat(key, "channel_condition_setting_unavailable",
              `Setting ${key}: record a positive, finite value — ${label} has ${flag.replace(/_/g, " ")} on and would price with a hidden default`, { hold: "install", itemIndexes: [index] });
          }
        }
      }
      // Severity-driven condition minutes.
      if (it?.poor_site_access) {
        const lvl = severityLevel(it.poor_site_access_severity, add, index, label, "poor_site_access_severity");
        const key = `install_site_access_level_${lvl}`;
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(key, "channel_condition_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative site-access level ${lvl} minutes — ${label} would price with a hidden default`, { hold: "install", itemIndexes: [index] });
        }
      }
      if (it?.poor_electrical_access && !isRaceway && rateType !== "dimensional_lettering") {
        const lvl = severityLevel(it.poor_electrical_severity, add, index, label, "poor_electrical_severity");
        const key = `install_poor_electrical_level_${lvl}`;
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(key, "channel_condition_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative poor-electrical level ${lvl} minutes — ${label} would price with a hidden default`, { hold: "install", itemIndexes: [index] });
        }
      }
      if (it?.poor_electrical_access && (isRaceway || rateType === "dimensional_lettering") && recorded(it?.poor_electrical_severity)) {
        severityLevel(it.poor_electrical_severity, add, index, label, "poor_electrical_severity");
      }

      // Materials attached to the item.
      (it?.materials || []).forEach((m, mi) => {
        materialIssues({ add, addCat, m, it, inventory, index, itemIndex: mi, label });
      });
    });

    if (recorded(project?.install_environment) && !["interior", "exterior"].includes(project.install_environment)) {
      add("install_environment", "channel_environment_unavailable",
        `Project installation environment "${project.install_environment}" is not supported — it silently resolves as exterior`, { hold: "install" });
    }
  }

  // ---------- selected equipment ----------
  if (installActive) {
    (project?.selected_equipment || []).forEach((e, index) => {
      const name = e?.equipment_name || `row ${index + 1}`;
      if (!recorded(e?.equipment_id)) {
        add("equipment_id", "channel_equipment_unassigned",
          `Equipment "${name}": select an equipment record — an unlinked row cannot be repriced`, { hold: "equipment", index });
      } else {
        const inv = equipmentInventory.find(r => r.id === e.equipment_id);
        if (!inv) {
          addCat("selected_equipment", "channel_equipment_unavailable",
            `Equipment "${name}": the selected equipment record is no longer available — reselect it`, { hold: "equipment", inventoryId: e.equipment_id, index });
        } else {
          const costField = EQUIPMENT_COST_FIELD[inv.pricing_mode];
          if (!costField) {
            addCat("pricing_mode", "channel_equipment_mode_unavailable",
              `Equipment "${inv.equipment_name || name}": pricing mode "${inv.pricing_mode || "blank"}" is not supported — it silently bills $0`, { hold: "equipment", inventoryId: inv.id, index });
          } else if (channelNonNegativeNumber(inv[costField]) === null) {
            addCat(costField, "channel_equipment_price_unavailable",
              `Equipment "${inv.equipment_name || name}": record a finite, nonnegative ${costField.replace(/_/g, " ")} in Equipment Inventory — a missing price is not free`, { hold: "equipment", inventoryId: inv.id, index });
          }
          if (e?.include_delivery && !isOwnedRow(e, inv) && channelNonNegativeNumber(inv.delivery_pickup_cost) === null
              && channelNonNegativeNumber(e.delivery_pickup_cost) === null) {
            addCat("delivery_pickup_cost", "channel_equipment_price_unavailable",
              `Equipment "${inv.equipment_name || name}": record a finite, nonnegative delivery/pickup cost in Equipment Inventory — a missing price is not free`, { hold: "equipment", inventoryId: inv.id, index });
          }
          // Owned vehicles with mileage set consume MPG for fuel cost.
          const milesNum = channelNonNegativeNumber(project?.travel_miles_round_trip);
          if (milesNum !== null && milesNum > 0
              && (inv.ownership === "owned" || OWNED_MODES.has(inv.pricing_mode))
              && VEHICLE_TYPES.has(inv.equipment_type)
              && channelPositiveNumber(inv.mpg) === null) {
            addCat("mpg", "channel_vehicle_mpg_unavailable",
              `Equipment "${inv.equipment_name || name}": record a positive, finite MPG in Equipment Inventory — travel fuel pricing is unavailable`, { hold: "travel", inventoryId: inv.id, index });
          }
        }
      }
      // Row-level authored values — present-but-unparseable (incl. blank text
      // left by the blank-preserving inputs) is flagged; a key entirely absent
      // stays dormant (same rule vinyl applies to row fields).
      const flatMode = OWNED_MODES.has(e?.pricing_mode);
      if (!flatMode && e?.duration !== undefined && channelPositiveNumber(e?.duration) === null) {
        add("duration", "channel_equipment_duration_unavailable",
          `Equipment "${name}": record a positive, finite rental duration — 0 ${e?.pricing_mode === "per_hour" ? "hours" : "periods"} bills as $0`, { hold: "equipment", index });
      }
      if (e?.unit_cost !== undefined && channelNonNegativeNumber(e?.unit_cost) === null) {
        add("unit_cost", "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative unit cost`, { hold: "equipment", index });
      }
      if (recorded(e?.delivery_pickup_cost) && channelNonNegativeNumber(e.delivery_pickup_cost) === null) {
        add("delivery_pickup_cost", "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative delivery/pickup cost`, { hold: "equipment", index });
      }
      if (recorded(e?.idle_hours) && channelNonNegativeNumber(e.idle_hours) === null) {
        add("idle_hours", "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative idle hours value or clear it`, { hold: "equipment", index });
      }
      if (recorded(e?.idle_running_cost_per_hour) && channelNonNegativeNumber(e.idle_running_cost_per_hour) === null) {
        add("idle_running_cost_per_hour", "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative idle $/hr or clear it`, { hold: "equipment", index });
      }
      if (channelNonNegativeNumber(e?.total_cost) === null) {
        add("total_cost", "channel_equipment_value_unavailable",
          `Equipment "${name}": recorded total cost is not a finite, nonnegative number — recalculate the row before repricing`, { hold: "equipment", index });
      }
    });
  }

  // ---------- personnel ----------
  if (installActive) {
    (project?.personnel || []).forEach((p, index) => {
      const role = p?.role || p?.name || `row ${index + 1}`;
      const hrs = channelNumber(p?.hours);
      const rate = channelNumber(p?.hourly_rate);
      if (p?.hours !== undefined && (hrs === null || hrs < 0)) {
        add("hours", "channel_personnel_hours_unavailable",
          `Crew "${role}": record a finite, nonnegative hours value`, { hold: "personnel", index });
      }
      if (p?.hourly_rate !== undefined && (rate === null || rate < 0)) {
        add("hourly_rate", "channel_personnel_rate_unavailable",
          `Crew "${role}": record a finite, nonnegative hourly rate`, { hold: "personnel", index });
      }
      // A row with hours but no usable rate silently bills $0.
      if (hrs !== null && hrs > 0 && (rate === null || rate <= 0)) {
        add("hourly_rate", "channel_personnel_rate_unavailable",
          `Crew "${role}": record a positive hourly rate or clear the hours — ${hrs} hr would bill $0`, { hold: "personnel", index });
      }
      if (channelNonNegativeNumber(p?.total_cost) === null) {
        add("total_cost", "channel_personnel_cost_unavailable",
          `Crew "${role}": recorded total cost is not a finite, nonnegative number — recalculate the row before repricing`, { hold: "personnel", index });
      }
    });
    // Role-rate settings are consumed when crew rows exist — a malformed one
    // silently reprices the next Auto-Suggest at the hidden default.
    const rolesPresent = new Set((project?.personnel || []).map(p => p?.role).filter(r => r in ROLE_RATE_KEY));
    rolesPresent.forEach((role) => {
      const field = ROLE_RATE_KEY[role];
      if (!recorded(settings?.[field]) || channelPositiveNumber(settings[field]) === null) {
        addCat(field, "channel_install_rate_unavailable",
          `Setting ${field}: record a positive, finite ${role} rate in Installation Settings — crew pricing is unavailable`, { hold: "personnel" });
      }
    });
  }

  // ---------- travel ----------
  if (installActive) {
    if (recorded(project?.travel_miles_round_trip) && channelNonNegativeNumber(project.travel_miles_round_trip) === null) {
      add("travel_miles_round_trip", "channel_travel_miles_unavailable",
        "record a finite, nonnegative round-trip mileage — travel pricing is unavailable", { hold: "travel" });
    }
    if (recorded(project?.total_travel_cost) && channelNonNegativeNumber(project.total_travel_cost) === null) {
      add("total_travel_cost", "channel_travel_cost_unavailable",
        "recorded travel cost is not a finite, nonnegative number — recalculate travel before repricing", { hold: "travel" });
    }
    const milesNum = channelNonNegativeNumber(project?.travel_miles_round_trip);
    if (milesNum !== null && milesNum > 0) {
      // TravelCostCard consumes these settings when mileage is set. The card is
      // shared with Maintenance + Vinyl and stays untouched — validation lives here.
      for (const [field, human] of [
        ["install_gasoline_price_per_gallon", "gasoline price per gallon"],
        ["install_diesel_price_per_gallon", "diesel price per gallon"],
        ["install_travel_labor_rate", "travel labor rate"],
        ["install_travel_avg_speed_mph", "travel average speed (mph)"],
      ]) {
        if (!recorded(settings?.[field]) || channelPositiveNumber(settings[field]) === null) {
          addCat(field, "channel_travel_setting_unavailable",
            `Setting ${field}: record a positive, finite ${human} in Installation Settings — travel pricing is unavailable`, { hold: "travel" });
        }
      }
      for (const [field, human] of [
        ["install_travel_overhead_per_mile", "travel overhead per mile"],
        ["install_min_travel_charge", "minimum travel charge"],
      ]) {
        if (recorded(settings?.[field]) && channelNonNegativeNumber(settings[field]) === null) {
          addCat(field, "channel_travel_setting_unavailable",
            `Setting ${field}: record a finite, nonnegative ${human} in Installation Settings`, { hold: "travel" });
        }
      }
    }
  }

  // ---------- project cost knobs ----------
  if (recorded(project?.supplies_percent_of_materials) && channelNonNegativeNumber(project.supplies_percent_of_materials) === null) {
    add("supplies_percent_of_materials", "channel_supplies_percent_unavailable",
      "record a finite, nonnegative supplies % of materials or clear it", { hold: "supplies" });
  }
  if (recorded(project?.extra_supplies_cost) && channelNonNegativeNumber(project.extra_supplies_cost) === null) {
    add("extra_supplies_cost", "channel_extra_supplies_unavailable",
      "record a finite, nonnegative extra supplies cost ($) or clear it", { hold: "supplies" });
  }
  if (recorded(project?.markup_percent) && channelNonNegativeNumber(project.markup_percent) === null) {
    add("markup_percent", "channel_markup_unavailable",
      "record a finite, nonnegative project markup % or clear it", { hold: "markup" });
  }

  return [...issues, ...catSeen.values()];
};

// ---------- helpers: settings + catalog checks ----------

const severityLevel = (v, add, index, label, field) => {
  const n = channelNumber(v);
  if (n === null || n < 1 || n > 10 || Math.floor(n) !== n) {
    add(field, "channel_item_severity_unavailable",
      `${label}: choose a whole-number severity 1–10`, { hold: "install", index, itemIndex: index });
    return 1;
  }
  return n;
};

// Size-rate minutes resolve qualified (__env__height) first, then the legacy
// size-only key, then a hardcoded default. Flag the resolved path.
const rateMinuteSettingIssue = ({ addCat, settings, prefix, size, env, heightBucket, phase, itemIndex, label }) => {
  const qk = qualifiedKey(prefix, size, env, heightBucket);
  const qv = settings?.[qk];
  if (recorded(qv)) {
    if (channelNonNegativeNumber(qv) === null) {
      addCat(qk, "channel_install_minutes_unavailable",
        `Setting ${qk}: fix the malformed ${phase} minutes — ${label} silently falls back to legacy rates`, { hold: "install", itemIndexes: [itemIndex] });
    }
    return;
  }
  const lk = `${prefix}${size}`;
  const lv = settings?.[lk];
  if (recorded(lv)) {
    if (channelNonNegativeNumber(lv) === null) {
      addCat(lk, "channel_install_minutes_unavailable",
        `Setting ${lk}: fix the malformed ${phase} minutes — ${label} silently falls back to hardcoded defaults`, { hold: "install", itemIndexes: [itemIndex] });
    }
    return;
  }
  addCat(qk, "channel_install_minutes_unavailable",
    `Setting ${qk} (or legacy ${lk}): record finite, nonnegative ${phase} minutes for ${size.replace(/_/g, " ")} / ${env} / ${heightBucket} — ${label} would price with a hidden default`, { hold: "install", itemIndexes: [itemIndex] });
};

const isOwnedRow = (row, inv) =>
  row?.ownership === "owned" || inv?.ownership === "owned"
  || OWNED_MODES.has(row?.pricing_mode) || OWNED_MODES.has(inv?.pricing_mode);

// Material rows attached to install items.
const materialIssues = ({ add, addCat, m, it, inventory, index, itemIndex, label }) => {
  const matLabel = `${label}, material "${m?.item_name || `#${itemIndex + 1}`}"`;
  if (recorded(m?.inventory_item_id)) {
    const inv = inventory.find(i => i.id === m.inventory_item_id);
    if (!inv) {
      // Detached material — stored unit_cost/quantity drive the price.
      addCat("inventory_item_id", "channel_material_unavailable",
        `${matLabel}: the linked inventory record is no longer available — reselect or reprice it`, { hold: "install", inventoryId: m.inventory_item_id, index, itemIndexes: [index] });
      detachedMaterialValues({ add, m, index, itemIndex, label: matLabel });
      return;
    }
    if (inv.pricing_mode === "per_raceway_foot") {
      // Silently stripped by calcLineItem — raceway is priced on Letters only.
      add("pricing_mode", "channel_material_mode_unavailable",
        `${matLabel}: raceway hardware is priced on the Letters tab — remove it from install materials`, { hold: "install", index, itemIndex });
      return;
    }
    const costField = { per_letter_flat: "cost_per_letter", per_letter_by_size: `cost_${it?.letter_size}`, per_project_flat: "cost_flat" }[inv.pricing_mode];
    if (!costField) {
      addCat("pricing_mode", "channel_material_mode_unavailable",
        `Inventory "${inv.item_name}": pricing mode "${inv.pricing_mode || "blank"}" is not supported on install items — it silently bills $0`, { hold: "install", inventoryId: inv.id, index, itemIndexes: [index] });
      return;
    }
    if (!recorded(inv[costField]) || channelNonNegativeNumber(inv[costField]) === null) {
      addCat(costField, "channel_material_price_unavailable",
        `Inventory "${inv.item_name}": record a finite, nonnegative ${costField.replace(/_/g, " ")} — a missing material price is not free`, { hold: "install", inventoryId: inv.id, index, itemIndexes: [index] });
    }
    return;
  }
  // Custom / detached material row — authored values are consumed directly.
  detachedMaterialValues({ add, m, index, itemIndex, label: matLabel });
};

const detachedMaterialValues = ({ add, m, index, itemIndex, label }) => {
  if (m?.unit_cost !== undefined && channelNonNegativeNumber(m.unit_cost) === null) {
    add("unit_cost", "channel_material_value_unavailable",
      `${label}: record a finite, nonnegative unit cost`, { hold: "install", index, itemIndex });
  }
  if (m?.quantity !== undefined && channelNonNegativeNumber(m.quantity) === null) {
    add("quantity", "channel_material_value_unavailable",
      `${label}: record a finite, nonnegative quantity`, { hold: "install", index, itemIndex });
  }
};

// Dimensional letter material catalog record checks. Skipped entirely when the
// material library was not loaded (dimensionalMaterials === null).
const dimensionalMaterialIssues = ({ addCat, fab, settings, dimensionalMaterials, rowLabel }) => {
  if (!recorded(fab?.material_id)) return;
  if (dimensionalMaterials === null) return;
  const mat = (dimensionalMaterials || []).find(m => m.id === fab.material_id);
  if (!mat) {
    addCat("material_id", "dimensional_material_unavailable",
      `${rowLabel}: the selected sheet material is no longer available — reselect it in the fab builder`, { hold: "letters", inventoryId: fab.material_id, letterTypes: ["dimensional_letters"] });
    return;
  }
  if (mat.is_active === false) {
    addCat("is_active", "dimensional_material_unavailable",
      `Dimensional material "${mat.material_name || mat.id}" is no longer active — reselect an active material in the fab builder`, { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] });
  }
  for (const [field, human] of [
    ["cost_per_sheet", "sheet cost"],
    ["sheet_length_inches", "sheet length (in)"],
    ["sheet_width_inches", "sheet width (in)"],
    ["thickness_inches", "thickness (in)"],
    ["yield_factor", "sheet yield factor"],
    ["material_type", "material type"],
  ]) {
    const v = mat[field];
    if (field === "material_type") {
      if (!recorded(v)) {
        addCat(field, "dimensional_material_setting_unavailable",
          `Dimensional material "${mat.material_name || mat.id}": record a ${human} — the cut multiplier cannot resolve and silently prices as 1.0×`, { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] });
      }
      continue;
    }
    if (field === "yield_factor") {
      const n = channelNumber(v);
      if (n === null || n <= 0 || n > 1) {
        addCat(field, "dimensional_material_setting_unavailable",
          `Dimensional material "${mat.material_name || mat.id}": record a ${human} between 0 and 1 — it silently prices at 70%`, { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] });
      }
      continue;
    }
    const check = field === "cost_per_sheet" ? channelNonNegativeNumber : channelPositiveNumber;
    if (check(v) === null) {
      addCat(field, "dimensional_material_setting_unavailable",
        `Dimensional material "${mat.material_name || mat.id}": record a ${field === "cost_per_sheet" ? "finite, nonnegative" : "positive, finite"} ${human} — the per-sqin material price is unavailable`, { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] });
    }
  }
};

// Settings consumed by calcDimensionalUnitCost / calcBackerUnitCost for a
// stored fab snapshot. All of these have silent defaults inside the calculator
// — absent-or-malformed must surface.
const dimensionalSettingIssues = ({ addCat, fab, settings, dimensionalMaterials, rowLabel }) => {
  dimensionalMaterialIssues({ addCat, fab, settings, dimensionalMaterials, rowLabel });

  const method = fab?.cutting_method === "laser" ? "laser" : "cnc";
  const required = method === "laser" ? LASER_REQUIRED : CNC_REQUIRED;
  const optional = method === "laser" ? LASER_OPTIONAL : CNC_OPTIONAL;
  for (const key of required) {
    if (!recorded(settings?.[key]) || channelNumber(settings[key]) === null) {
      addCat(key, "dimensional_setting_unavailable",
        `Setting ${key}: record a finite ${method === "laser" ? "laser" : "CNC"} ${key.replace(/_/g, " ")} — ${rowLabel} would price with a hidden default`, { hold: "letters", letterTypes: ["dimensional_letters"] });
    }
  }
  for (const key of optional) {
    if (recorded(settings?.[key]) && channelNonNegativeNumber(settings[key]) === null) {
      addCat(key, "dimensional_setting_unavailable",
        `Setting ${key}: fix the malformed value or clear it in ${method === "laser" ? "Laser" : "CNC"} Settings`, { hold: "letters", letterTypes: ["dimensional_letters"] });
    }
  }

  // Cut speed resolves per thickness via imperial keys — same candidates the
  // calculator tries. First recorded candidate must parse; none recorded means
  // the panel silently kept its 50 ipm placeholder.
  const thickness = fab?.material_thickness_inches;
  const prefix = method === "laser" ? "cut_speed_" : "cnc_cut_speed_";
  const candidates = imperialThicknessKeys(thickness);
  if (candidates.length > 0) {
    const firstRecorded = candidates.map(c => `${prefix}${c}`).find(k => recorded(settings?.[k]));
    if (firstRecorded) {
      if (channelPositiveNumber(settings[firstRecorded]) === null) {
        addCat(firstRecorded, "dimensional_setting_unavailable",
          `Setting ${firstRecorded}: record a positive, finite cut speed (in/min) — ${rowLabel} would price with a hidden default`, { hold: "letters", letterTypes: ["dimensional_letters"] });
      }
    } else {
      addCat(`${prefix}${candidates[0]}`, "dimensional_setting_unavailable",
        `No ${method} cut-speed setting exists for ${thickness}" material (looked for ${candidates.map(c => `${prefix}${c}`).join(", ")}) — ${rowLabel} would price with a hidden default`, { hold: "letters", letterTypes: ["dimensional_letters"] });
    }
  }
  // Cut multiplier — absent is a neutral 1.0× (dormant); recorded must parse.
  const matType = String(fab?.material_type || "").toLowerCase();
  if (matType) {
    const multKey = method === "laser" ? `${matType}_cut_multiplier` : `${matType}_cnc_cut_multiplier`;
    if (recorded(settings?.[multKey]) && channelPositiveNumber(settings[multKey]) === null) {
      addCat(multKey, "dimensional_setting_unavailable",
        `Setting ${multKey}: record a positive, finite cut multiplier or clear it`, { hold: "letters", letterTypes: ["dimensional_letters"] });
    }
  }

  // Paint settings — only when the snapshot paints.
  if (fab?.paint_letters && fab?.paint_sides !== "none") {
    for (const key of PAINT_REQUIRED_POSITIVE) {
      if (channelPositiveNumber(settings?.[key]) === null) {
        addCat(key, "dimensional_setting_unavailable",
          `Setting ${key}: record a positive, finite paint coverage (sqft/gal) — ${rowLabel} would price with a hidden default`, { hold: "letters", letterTypes: ["dimensional_letters"] });
      }
    }
    for (const key of PAINT_REQUIRED_NONNEG) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(key, "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative value in Paint Settings — ${rowLabel} would price with a hidden default`, { hold: "letters", letterTypes: ["dimensional_letters"] });
      }
    }
    for (const key of PAINT_OPTIONAL) {
      if (recorded(settings?.[key]) && channelNonNegativeNumber(settings[key]) === null) {
        addCat(key, "dimensional_setting_unavailable",
          `Setting ${key}: fix the malformed value or clear it in Paint Settings`, { hold: "letters", letterTypes: ["dimensional_letters"] });
      }
    }
    // Liquid paint mix: cost fields absent → $0 liquid paint silently.
    for (const key of PAINT_COST_FIELDS) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(key, "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative paint component cost — liquid paint would price as $0`, { hold: "letters", letterTypes: ["dimensional_letters"] });
      }
    }
    for (const key of PAINT_RATIO_FIELDS) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(key, "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative paint mix ratio`, { hold: "letters", letterTypes: ["dimensional_letters"] });
      }
    }
    for (const key of PAINT_UNIT_FIELDS) {
      if (recorded(settings?.[key]) && !PAINT_UNITS.has(settings[key])) {
        addCat(key, "dimensional_setting_unavailable",
          `Setting ${key}: "${settings[key]}" is not a supported paint unit (oz/pint/quart/liter/gallon)`, { hold: "letters", letterTypes: ["dimensional_letters"] });
      }
    }
    const colors = Array.isArray(fab?.paint_colors) ? fab.paint_colors.filter(c => c && String(c).trim() !== "") : [];
    const numColors = Math.max(1, colors.length || (channelPositiveNumber(fab?.num_paint_colors) ?? 1));
    if (numColors > 1 && channelPositiveNumber(fab?.paint_mask_sqft) !== null) {
      for (const key of PAINT_MASK_REQUIRED) {
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(key, "dimensional_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative paint-mask rate in Paint Settings`, { hold: "letters", letterTypes: ["dimensional_letters"] });
        }
      }
    }
  }
};

// ---------- calc wrapper ----------
// Replicates ChannelLetterEstimator's exact recalculated construction (scope
// zeroing, _project_install_environment injection, letters → items → totals).
// Clean projects get a field-identical result; projects with issues get a
// held result where tainted values become the saved acknowledged snapshot or
// null — never a silent $0/default.
const SAVED_TOTAL_KEYS = [
  "letters_subtotal", "total_letters_cost",
  "labor_hours", "labor_cost", "labor_cost_in_subtotal",
  "total_materials_cost", "total_supplies_cost",
  "total_equipment_cost", "total_personnel_cost", "total_travel_cost",
  "subtotal", "markup_amount", "total_cost",
];

const addOrNull = (...xs) => xs.every(v => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
const sumStrict = (rows, field) => {
  let total = 0;
  for (const r of rows || []) {
    const v = channelNumber(r?.[field]);
    if (v === null) return null;
    total += v;
  }
  return total;
};

export const calcChannelProject = ({ project, settings = {}, inventory = [], equipmentInventory = [], dimensionalMaterials = null, savedProject = null } = {}) => {
  const saved = savedProject || project || {};

  // Same early-out as the page: nothing to price against until settings land.
  if (!settings || Object.keys(settings).length === 0) {
    return { recalculated: { ...project, __held: false, pricingUnavailable: false, issues: [] }, issues: [], held: false };
  }

  const issues = channelProjectIssues(project, { settings, inventory, equipmentInventory, dimensionalMaterials });
  const scope = project?.project_scope || "full";
  const lettersActive = scope !== "install_only";
  const installActive = scope !== "letters_only";

  // Byte-identical construction to the page's useMemo.
  const settingsWithEnv = { ...settings, _project_install_environment: project?.install_environment || "exterior" };
  const lettersTotals = !lettersActive
    ? { letters_subtotal: 0, total_letters_cost: 0, letter_purchases: project?.letter_purchases || [] }
    : calcLettersTotals(project, settingsWithEnv);
  const recalcItems = !installActive
    ? []
    : (project?.items || []).map(it => calcLineItem(it, settingsWithEnv, inventory));
  const projectForTotals = !installActive
    ? { ...project, ...lettersTotals, items: recalcItems, selected_equipment: [], personnel: [] }
    : { ...project, ...lettersTotals, items: recalcItems };
  const totals = calcProjectTotals(projectForTotals);
  const live = { ...project, ...lettersTotals, items: recalcItems, ...totals };

  const held = issues.length > 0;
  if (!held) {
    return {
      recalculated: { ...live, __held: false, pricingUnavailable: false, issues: [] },
      issues: [],
      held: false,
    };
  }

  // --- held path: determine poisoned rows ---
  const rawPurchases = project?.letter_purchases || [];
  const rawItems = project?.items || [];
  const heldPurchaseIdx = new Set();
  const heldItemIdx = new Set();
  const holdSeen = new Set();
  issues.forEach((i) => {
    holdSeen.add(i.hold);
    if (i.hold === "purchase" && i.index != null) heldPurchaseIdx.add(i.index);
    if (i.hold === "letters" && Array.isArray(i.letterTypes)) {
      rawPurchases.forEach((p, idx) => { if (i.letterTypes.includes(p?.letter_type)) heldPurchaseIdx.add(idx); });
    }
    if (i.hold === "install") {
      if (Array.isArray(i.itemIndexes)) i.itemIndexes.forEach(x => heldItemIdx.add(x));
      else if (i.index != null) heldItemIdx.add(i.index);
      else rawItems.forEach((_, x) => heldItemIdx.add(x));
    }
  });

  // Held rows pass through raw (saved acknowledged fields preserved).
  const letter_purchases = (live.letter_purchases || []).map((p, idx) =>
    heldPurchaseIdx.has(idx) ? { ...rawPurchases[idx], __held: true } : p);
  const itemsHeld = (live.items || []).map((it, idx) =>
    heldItemIdx.has(idx) ? { ...rawItems[idx], __held: true } : it);

  // --- re-derive aggregates null-propagating, then saved-snapshot fallback ---
  const cat = (field, current) => Number.isFinite(current)
    ? current
    : (hasChannelCostSnapshot(saved?.[field]) ? saved[field] : null);

  // Letters
  const purchasesTotal = letter_purchases.length === 0 ? 0
    : letter_purchases.reduce((s, p) => {
        if (s === null || p.__held) return null;
        const v = channelNumber(p.total_cost);
        return v === null ? null : s + v;
      }, 0);
  const onlyDimensional = letter_purchases.length > 0 && letter_purchases.every(p => p.letter_type === "dimensional_letters");
  const feeOrNull = (field) => recorded(project?.[field]) ? channelNonNegativeNumber(project[field]) : 0;
  const delivery = onlyDimensional ? 0 : feeOrNull("letters_delivery_fee");
  const lettersSubtotal = addOrNull(purchasesTotal, delivery,
    feeOrNull("letters_design_fee"), feeOrNull("letters_install_supplies_fee"),
    feeOrNull("letters_permitting_fee"), feeOrNull("letters_other_fee"));
  const lettersMarkupPct = recorded(project?.letters_markup_percent)
    ? channelNonNegativeNumber(project.letters_markup_percent) : 0;
  const letters_subtotal = cat("letters_subtotal", lettersSubtotal);
  const totalLetters = lettersMarkupPct === null ? null
    : (Number.isFinite(letters_subtotal) ? letters_subtotal * (1 + lettersMarkupPct / 100) : null);
  const total_letters_cost = cat("total_letters_cost", totalLetters);

  // Install
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

  // Equipment / personnel — authored stored totals; a malformed one is flagged.
  const equipmentHeld = holdSeen.has("equipment");
  const personnelHeld = holdSeen.has("personnel");
  const total_equipment_cost = !installActive ? 0
    : cat("total_equipment_cost", equipmentHeld ? null : sumStrict(project?.selected_equipment, "total_cost"));
  const total_personnel_cost = !installActive ? 0
    : cat("total_personnel_cost", personnelHeld ? null : sumStrict(project?.personnel, "total_cost"));

  // Crew pricing replaces flat-rate labor in the subtotal (unchanged rule).
  const labor_priced_via_personnel = Number.isFinite(total_personnel_cost)
    ? total_personnel_cost > 0
    : hasChannelCostSnapshot(saved?.total_personnel_cost) ? saved.total_personnel_cost > 0 : !!saved?.labor_priced_via_personnel;
  const labor_cost_in_subtotal = labor_priced_via_personnel ? 0 : labor_cost;

  // Travel — stored value consumed as-is (validated above).
  const travelHeld = holdSeen.has("travel");
  const travelCurrent = travelHeld ? null
    : (recorded(project?.total_travel_cost) ? channelNonNegativeNumber(project.total_travel_cost) : 0);
  const total_travel_cost = !installActive ? 0 : cat("total_travel_cost", travelCurrent);

  // Supplies — absent percent keeps the ported 10% default; malformed → null.
  // Composes from the (possibly saved-snapshot) materials total, exactly like
  // vinyl's rollup composes baseSupplies from the cat'ed materialCost.
  const suppliesPct = recorded(project?.supplies_percent_of_materials)
    ? channelNonNegativeNumber(project.supplies_percent_of_materials) : 10;
  const extraSupplies = recorded(project?.extra_supplies_cost)
    ? channelNonNegativeNumber(project.extra_supplies_cost) : 0;
  const suppliesHeld = holdSeen.has("supplies");
  const suppliesCurrent = suppliesHeld || suppliesPct === null || extraSupplies === null || total_materials_cost === null
    ? null : total_materials_cost * (suppliesPct / 100) + extraSupplies;
  const total_supplies_cost = !installActive ? 0 : cat("total_supplies_cost", suppliesCurrent);

  // Project rollup — composes from the cat'ed component values so a held
  // group contributes its saved acknowledged snapshot (labeled "Saved
  // amounts (not current pricing)"), matching rollupVinylProject.
  const subtotalCurrent = addOrNull(
    labor_cost_in_subtotal,
    total_materials_cost, total_supplies_cost, total_equipment_cost,
    total_personnel_cost, total_travel_cost,
    lettersActive ? total_letters_cost : 0,
  );
  const subtotal = cat("subtotal", subtotalCurrent);
  const markupPct = recorded(project?.markup_percent)
    ? channelNonNegativeNumber(project.markup_percent) : 0;
  const markupCurrent = holdSeen.has("markup") || markupPct === null
    ? null : (Number.isFinite(subtotal) ? subtotal * (markupPct / 100) : null);
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
    issues,
  };
  return { recalculated, issues, held: true };
};

// ---------- UI helpers ----------
// All issues attached to a single field (optionally a single row).
export const issuesForField = (issues = [], field, itemIndex = null, index = null) =>
  issues.filter(i => i.field === field
    && (itemIndex === null || i.itemIndex === itemIndex)
    && (index === null || i.index === index));
export const hasIssueFor = (issues = [], field, itemIndex = null, index = null) =>
  issuesForField(issues, field, itemIndex, index).length > 0;
