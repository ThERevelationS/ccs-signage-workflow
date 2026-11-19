// Sign Maintenance pricing-availability layer.
// ---------------------------------------------------------------------------
// A single structured-issue scanner + held-result wrapper around the existing
// maintenanceCalculator / repaintCalculator / dimLetterPaintCalculator math.
// The formulas themselves are NOT reimplemented — every consumed input is
// validated first; anything unavailable produces a structured issue and the
// affected item/total is HELD at null instead of silently priced at $0.
//
// Issue shape (mirrors the painting/foundation convention):
//   { kind, index, itemIndex, materialIndex, field, code, message, hold,
//     componentId, inventoryId }
//   kind  — "maintenance" (authored input) | "maintenance_catalog" (settings /
//           rate-matrix / catalog rows that admins maintain)
//   hold  — "item" | "project"
// ---------------------------------------------------------------------------

import { sizeAxisFor, ACTIONS_BY_ID, SIGN_TYPES_BY_ID } from "./constants";
import { SIZE_FIELD } from "./defaults";
import { isMonumentRepaint } from "./repaintCalculator";
import { REPAINT_FEATURES } from "./repaintDefaults";
import { calcServiceItem, calcProjectTotals } from "./maintenanceCalculator";

// ---------- strict parsers ----------
// Decimal-only number parse: rejects blank strings, malformed strings, hex /
// scientific-edge junk, objects, arrays, booleans, NaN and Infinity. Numbers
// and numeric strings pass through; everything else is `null` (unavailable).
const STRICT_NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
export const maintenanceStrictNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !STRICT_NUM_RE.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};
export const maintenanceNonNegativeNumber = (value) => {
  const n = maintenanceStrictNumber(value);
  return n === null || n < 0 ? null : n;
};
export const maintenancePositiveNumber = (value) => {
  const n = maintenanceStrictNumber(value);
  return n === null || n <= 0 ? null : n;
};
// "Recorded" for SETTINGS semantics — a blank setting row is treated as absent
// (the module then applies its documented default, by design — mirror painting).
export const maintenanceSettingRecorded = (value) =>
  value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
// "Present" for authored FIELD semantics — a blank input is a recorded-bad
// value, not an absent one (mirrors the vinyl/painting present() split).
export const maintenancePresent = (value) => value !== undefined && value !== null;

// ---------- issue factory ----------
const maintenanceIssue = (kind, spec) => ({
  kind,
  index: spec.index ?? null,
  itemIndex: spec.itemIndex ?? null,
  materialIndex: spec.materialIndex ?? null,
  field: spec.field,
  code: spec.code,
  message: spec.message,
  hold: spec.hold,
  componentId: spec.componentId ?? null,
  inventoryId: spec.inventoryId ?? null,
});

const INPUT = "maintenance";
const CATALOG = "maintenance_catalog";

// ---------- shared lookups (mirror the calculators exactly) ----------
const USAGE_BASES = ["per_letter", "per_cabinet", "per_linear_foot", "per_sqft", "per_service_item"];
const DETACHED_PRICING_MODES = [
  "per_letter_flat", "per_letter_by_size", "per_cabinet_flat",
  "per_cabinet_by_size", "per_linear_foot", "per_sqft", "per_project_flat",
];
// Cost field consumed per detached pricing_mode (mirrors materialFromInventory).
const detachedCostField = (mode, size) => {
  if (mode === "per_letter_flat") return "cost_per_letter";
  if (mode === "per_letter_by_size" || mode === "per_cabinet_by_size") return `cost_${size}`;
  if (mode === "per_cabinet_flat") return "cost_per_cabinet";
  if (mode === "per_linear_foot") return "cost_per_foot";
  if (mode === "per_sqft") return "cost_per_sqft";
  if (mode === "per_project_flat") return "cost_flat";
  return null;
};
// Item field consumed per detached pricing_mode / linked usage_basis for quantity.
const basisItemField = (basis) => {
  if (basis === "per_letter" || basis === "per_letter_flat" || basis === "per_letter_by_size") return "qty";
  if (basis === "per_cabinet" || basis === "per_cabinet_flat" || basis === "per_cabinet_by_size") return "qty";
  if (basis === "per_linear_foot") return "linear_feet";
  if (basis === "per_sqft") return "face_sqft";
  return null; // per_service_item / per_project_flat → constant 1
};
const PAINT_MODES = ["entire_panel", "returns_only"];
const SECOND_COLOR_MASKS = ["none", "paint_mask"];
const LIOUID_UNITS = ["oz", "pint", "quart", "liter", "gallon"];
const DIM_BANDS = [
  { max: 4, key: "lettering_extra_small_prep_multiplier" },
  { max: 8, key: "lettering_small_prep_multiplier" },
  { max: 12, key: "lettering_normal_prep_multiplier" },
  { max: 20, key: "lettering_medium_prep_multiplier" },
  { max: 30, key: "lettering_large_prep_multiplier" },
  { max: Infinity, key: "lettering_extra_large_prep_multiplier" },
];
const dimBandKey = (heightIn) => (DIM_BANDS.find(b => heightIn <= b.max) || DIM_BANDS[DIM_BANDS.length - 1]).key;
const ROLE_RATE_SETTING = {
  "Crew Lead": "maintenance_crew_lead_rate",
  "Installer": "maintenance_tech_rate",
  "Helper": "maintenance_helper_rate",
};
// TravelCostCard consumes install_* keys; the page maps maintenance_* over
// them via `maintenance_X ?? install_X` — so a recorded maintenance value
// wins, an absent one falls through to the shared install_* row. Whichever
// recorded value is consumed must be usable (the card's ||defaults launder
// bad recorded values silently).
const TRAVEL_SETTING_CHECKS = [
  { mKey: "maintenance_gasoline_price_per_gallon", iKey: "install_gasoline_price_per_gallon", positive: true, label: "gasoline price/gal" },
  { mKey: "maintenance_diesel_price_per_gallon", iKey: "install_diesel_price_per_gallon", positive: true, label: "diesel price/gal" },
  { mKey: "maintenance_travel_labor_rate", iKey: "install_travel_labor_rate", positive: true, label: "travel labor rate" },
  { mKey: "maintenance_travel_avg_speed_mph", iKey: "install_travel_avg_speed_mph", positive: true, label: "travel avg speed" },
  { mKey: "maintenance_travel_overhead_per_mile", iKey: "install_travel_overhead_per_mile", positive: false, label: "travel overhead/mile" },
  { mKey: "maintenance_min_travel_charge", iKey: "install_min_travel_charge", positive: false, label: "minimum travel charge" },
];
// Repaint settings consumed by computeMonumentRepaint (always consumed for a
// monument repaint item). `positive` marks keys the remote double-launders
// with `|| fallback` (recorded 0 must flag, not silently revive).
const REPAINT_SETTING_CHECKS = [
  { key: "maintenance_repaint_coverage_sqft_per_gallon", positive: true },
  { key: "maintenance_repaint_paint_cost_per_gallon", positive: false },
  { key: "maintenance_repaint_primer_coats", positive: false },
  { key: "maintenance_repaint_finish_coats", positive: false },
  { key: "maintenance_repaint_sqft_per_hour", positive: true },
  { key: "maintenance_repaint_condition_step_pct", positive: false },
];
// Dim-letter paint settings consumed only while a dim-letter repaint is enabled.
const DIM_SETTING_CHECKS = [
  { key: "letter_perimeter_factor", positive: true },
  { key: "paint_waste_multiplier", positive: true },
  { key: "mixed_paint_coverage_sqft_per_gallon", positive: true },
  { key: "base_labor_hours_per_sqft", positive: false },
  { key: "paint_mix_ratio", positive: true },
  { key: "hardener_mix_ratio", positive: false },
  { key: "reducer_mix_ratio", positive: false },
  { key: "paint_cost_per_unit", positive: false },
  { key: "hardener_cost_per_unit", positive: false },
  { key: "reducer_cost_per_unit", positive: false },
];
// Mask pricing uses bare num() — absent rates price $0, so they must flag.
// default_labor_rate has a designed 60 fallback — only recorded-bad flags.
const DIM_MASK_CHECKS = [
  { key: "paint_mask_rate_per_sqft", absentFlags: true },
  { key: "paint_mask_machine_cutting_rate_per_sqft", absentFlags: true },
  { key: "paint_mask_cutting_labor_rate_per_sqft", absentFlags: true },
  { key: "paint_mask_application_labor_rate_per_sqft", absentFlags: true },
  { key: "default_labor_rate", absentFlags: false, positive: true },
];

// ---------- per-item scanner ----------
// Validates every value the service-item calc consumes for ONE item and
// collects the context the settings scan needs (features used, dim-letter
// state, mask usage). Returns { issues, context }.
export const maintenanceItemIssues = (item, index, { rates = [], inventory = [] } = {}) => {
  const issues = [];
  const context = {
    hasItems: true,
    hasRepaint: false,
    featuresUsed: new Set(),
    dimEnabled: false,
    dimBandsUsed: new Set(),
    dimMaskUsed: false,
    neededItemFields: new Set(),
  };
  const emit = (kind, spec) => issues.push(maintenanceIssue(kind, { itemIndex: index, ...spec }));
  const itemName = item?.description || item?.sign_type || `item ${index + 1}`;
  const isRepaint = isMonumentRepaint(item);
  if (isRepaint) context.hasRepaint = true;

  // ---- actions → rate-matrix rows ----
  if (maintenancePresent(item?.actions) && !Array.isArray(item.actions)) {
    emit(INPUT, { field: "actions", code: "maintenance_actions_unavailable", hold: "item",
      message: `Service item "${itemName}" has an unreadable action list — pricing is held.` });
  } else {
    for (const actionId of (item?.actions || [])) {
      if (actionId === "repaint" && isRepaint) continue; // specialized estimator handles it
      const actionLabel = ACTIONS_BY_ID[actionId]?.label || actionId;
      const rate = (rates || []).find(r => r.sign_type === item?.sign_type && r.action === actionId);
      if (!rate) {
        emit(CATALOG, { field: "actions", code: "maintenance_rate_unavailable", hold: "item",
          inventoryId: `${item?.sign_type}/${actionId}`,
          message: `No MaintenanceActionRate row exists for "${SIGN_TYPES_BY_ID[item?.sign_type]?.label || item?.sign_type} × ${actionLabel}" — labor is held instead of charging $0. Add the row in Sign Maintenance Settings.` });
        continue;
      }
      if (rate.is_enabled === false) {
        emit(CATALOG, { field: "actions", code: "maintenance_rate_disabled", hold: "item",
          inventoryId: rate.id,
          message: `The "${actionLabel}" rate is disabled in Settings but still selected on "${itemName}" — remove the action or re-enable the rate.` });
        continue;
      }
      const field = SIZE_FIELD[item?.size] || "base_minutes_flat";
      const minutes = maintenanceStrictNumber(rate[field]);
      if (minutes === null || minutes <= 0) {
        emit(CATALOG, { field: "actions", code: "maintenance_rate_unavailable", hold: "item",
          inventoryId: rate.id,
          message: `The "${actionLabel}" rate has no usable minutes for size "${item?.size || "flat"}" (field ${field}) — labor is held instead of charging $0.` });
      }
    }
  }

  // ---- qty (labor multiplier; also feeds per_letter / per_cabinet materials) ----
  const axis = sizeAxisFor(item?.sign_type);
  const q = maintenanceStrictNumber(item?.qty);
  if (q === null || (axis === "cabinet" ? q < 1 : q <= 0)) {
    emit(INPUT, { field: "qty", code: "maintenance_quantity_unavailable", hold: "item",
      message: `Service item "${itemName}" needs a positive ${axis === "cabinet" ? "cabinet count" : "letter count"} — pricing is held.` });
  }

  // ---- materials ----
  if (maintenancePresent(item?.materials) && !Array.isArray(item.materials)) {
    emit(INPUT, { field: "materials", code: "maintenance_materials_unavailable", hold: "item",
      message: `Service item "${itemName}" has an unreadable materials list — pricing is held.` });
  } else {
    (item?.materials || []).forEach((m, materialIndex) => {
      const matEmit = (kind, spec) => emit(kind, { materialIndex, ...spec });
      const mName = m?.item_name || `material ${materialIndex + 1}`;
      const ruleId = m?.maintenance_rule_id || m?.inventory_item_id || "";
      const rule = ruleId ? (inventory || []).find(i => i.id === ruleId) : null;

      if (!rule) {
        // Detached / dangling material — the calc falls back to the stored
        // unit_cost × quantity snapshot. That snapshot must itself be usable.
        if (ruleId) {
          matEmit(INPUT, { field: "materials", code: "maintenance_material_rule_unavailable", hold: "item",
            inventoryId: ruleId,
            message: `Material "${mName}" references a maintenance rule that no longer exists — its stored price is held.` });
        } else {
          // Fully manual snapshot row: validate the stored numbers it prices from.
          if (maintenanceNonNegativeNumber(m?.unit_cost) === null) {
            matEmit(INPUT, { field: "materials", code: "maintenance_material_price_unavailable", hold: "item",
              message: `Material "${mName}" has no usable stored unit cost — held instead of $0.` });
          }
          if (maintenanceNonNegativeNumber(m?.quantity) === null) {
            matEmit(INPUT, { field: "materials", code: "maintenance_material_quantity_unavailable", hold: "item",
              message: `Material "${mName}" has no usable stored quantity — held.` });
          }
        }
        return;
      }

      if (rule.is_active === false) {
        matEmit(CATALOG, { field: "materials", code: "maintenance_material_rule_unavailable", hold: "item",
          inventoryId: rule.id,
          message: `Material "${mName}" uses an inactive material rule — held.` });
        return;
      }

      // Link integrity — enforced, not just displayed.
      const linked = !!(rule.inventory_entity && rule.inventory_item_id);
      if (rule._master_missing === true || m?.link_missing === true) {
        matEmit(CATALOG, { field: "materials", code: "maintenance_material_link_unavailable", hold: "item",
          inventoryId: rule.id, componentId: rule.inventory_item_id,
          message: `Material "${mName}" is linked to a Master Inventory row that no longer exists — relink it in Maintenance Settings or remove the material.` });
        return;
      }

      if (linked) {
        const basis = rule.usage_basis || "per_service_item";
        if (!USAGE_BASES.includes(basis)) {
          matEmit(CATALOG, { field: "materials", code: "maintenance_material_usage_unavailable", hold: "item",
            inventoryId: rule.id,
            message: `Material "${mName}" has an unknown usage basis "${basis}" — held.` });
        }
        const multiplier = maintenanceStrictNumber(rule.usage_multiplier);
        if (multiplier === null || multiplier <= 0) {
          matEmit(CATALOG, { field: "materials", code: "maintenance_material_usage_unavailable", hold: "item",
            inventoryId: rule.id,
            message: `Material "${mName}" has no positive usage multiplier — held instead of consuming 0.` });
        }
        // materialFromInventory consumes _master_unit_cost when finite, else
        // falls back to the stored unit_cost — validate whichever is consumed.
        const masterCost = maintenanceStrictNumber(rule._master_unit_cost);
        if (masterCost !== null) {
          if (masterCost < 0) {
            matEmit(CATALOG, { field: "materials", code: "maintenance_material_price_unavailable", hold: "item",
              inventoryId: rule.id, componentId: rule.inventory_item_id,
              message: `Material "${mName}" resolved a negative Master Inventory cost — held.` });
          }
        } else if (maintenanceNonNegativeNumber(m?.unit_cost) === null) {
          matEmit(INPUT, { field: "materials", code: "maintenance_material_price_unavailable", hold: "item",
            inventoryId: rule.id, componentId: rule.inventory_item_id,
            message: `Material "${mName}" resolved no Master Inventory price and has no usable stored unit cost — held instead of $0.` });
        }
        const needed = basisItemField(basis);
        if (needed) context.neededItemFields.add(needed);
      } else {
        // Legacy detached rule — priced straight off the rule's cost_* fields.
        const mode = rule.pricing_mode;
        if (!DETACHED_PRICING_MODES.includes(mode)) {
          matEmit(CATALOG, { field: "materials", code: "maintenance_material_pricing_mode_unavailable", hold: "item",
            inventoryId: rule.id,
            message: `Material "${mName}" has an unknown pricing mode "${mode || "unset"}" — held.` });
        } else {
          const costField = detachedCostField(mode, item?.size);
          const cost = maintenanceStrictNumber(rule[costField]);
          if (cost === null || cost < 0) {
            matEmit(CATALOG, { field: "materials", code: "maintenance_material_price_unavailable", hold: "item",
              inventoryId: rule.id,
              message: `Material "${mName}" has no usable ${costField} price for size "${item?.size}" — held instead of $0.` });
          }
          const needed = basisItemField(mode);
          if (needed) context.neededItemFields.add(needed);
        }
      }
      // Manual quantity override — validated whenever the override is on.
      if (m?.quantity_override === true && maintenanceNonNegativeNumber(m?.quantity) === null) {
        matEmit(INPUT, { field: "quantity", code: "maintenance_material_quantity_unavailable", hold: "item",
          inventoryId: rule.id,
          message: `Material "${mName}" has an overridden quantity that is not a usable number — held.` });
      }
    });
  }

  // Item fields consumed by attached materials (face_sqft / linear_feet).
  for (const field of context.neededItemFields) {
    const v = maintenanceStrictNumber(item?.[field]);
    if (v === null || v <= 0) {
      emit(INPUT, { field, code: "maintenance_item_field_unavailable", hold: "item",
        message: `Service item "${itemName}" needs a positive ${field === "face_sqft" ? "face/work area (sq ft)" : "linear feet"} for its materials — pricing is held.` });
    }
  }

  // ---- monument repaint config ----
  if (isRepaint) {
    if (maintenancePresent(item?.repaint_config)
      && (typeof item.repaint_config !== "object" || item.repaint_config === null || Array.isArray(item.repaint_config))) {
      emit(INPUT, { field: "repaint_config", code: "maintenance_repaint_config_unavailable", hold: "item",
        message: `Service item "${itemName}" has an unreadable repaint configuration — pricing is held.` });
    } else {
      const cfg = item?.repaint_config || {};
      const repEmit = ({ field, ...rest }) => emit(INPUT, { field: `repaint_config.${field}`, ...rest });
      const L = maintenanceStrictNumber(cfg.length_ft);
      if (L === null || L <= 0) repEmit({ field: "length_ft", code: "maintenance_repaint_dimension_unavailable", hold: "item",
        message: `Repaint on "${itemName}" needs a positive cabinet length.` });
      const H = maintenanceStrictNumber(cfg.height_ft);
      if (H === null || H <= 0) repEmit({ field: "height_ft", code: "maintenance_repaint_dimension_unavailable", hold: "item",
        message: `Repaint on "${itemName}" needs a positive cabinet height.` });
      if (maintenancePresent(cfg.paint_mode) && !PAINT_MODES.includes(cfg.paint_mode)) {
        repEmit({ field: "paint_mode", code: "maintenance_repaint_mode_unavailable", hold: "item",
          message: `Repaint on "${itemName}" has an unknown paint scope "${cfg.paint_mode}".` });
      }
      // computeRepaintSqft: "returns_only" reads retainer_width_in only; every
      // other mode (incl. absent) takes the entire-panel path and reads
      // return_depth_in. featureMultiplier/dl consume only the literal
      // "entire_panel" mode.
      const returnsOnly = cfg.paint_mode === "returns_only";
      const literalEntirePanel = cfg.paint_mode === "entire_panel";
      if (!returnsOnly) {
        if (maintenancePresent(cfg.return_depth_in)) {
          const rd = maintenanceStrictNumber(cfg.return_depth_in);
          if (rd === null || rd < 0) repEmit({ field: "return_depth_in", code: "maintenance_repaint_dimension_unavailable", hold: "item",
            message: `Repaint on "${itemName}" has an unusable return depth.` });
        }
      } else {
        const rw = maintenanceStrictNumber(cfg.retainer_width_in);
        if (rw === null || rw <= 0) repEmit({ field: "retainer_width_in", code: "maintenance_repaint_dimension_unavailable", hold: "item",
          message: `Returns-only repaint on "${itemName}" needs a positive retainer width.` });
      }
      if (maintenancePresent(cfg.features) && !Array.isArray(cfg.features)) {
        repEmit({ field: "features", code: "maintenance_repaint_features_unavailable", hold: "item",
          message: `Repaint on "${itemName}" has an unreadable feature list.` });
      }
      if (maintenancePresent(cfg.paint_condition)) {
        const pc = maintenanceStrictNumber(cfg.paint_condition);
        if (pc === null || pc < 1 || pc > 10) repEmit({ field: "paint_condition", code: "maintenance_repaint_condition_unavailable", hold: "item",
          message: `Repaint on "${itemName}" needs a paint condition between 1 and 10.` });
      }
      if (literalEntirePanel && Array.isArray(cfg.features)) {
        for (const f of cfg.features) {
          if (REPAINT_FEATURES.some(rf => rf.id === f)) context.featuresUsed.add(f);
        }
      }
      // Dimensional-letter sub-config — only consumed for literal entire_panel
      // + dimensional_letters feature (mirrors computeMonumentRepaint).
      const dl = cfg.dim_letter_paint;
      if (maintenancePresent(dl) && (typeof dl !== "object" || dl === null || Array.isArray(dl))) {
        repEmit({ field: "dim_letter_paint", code: "maintenance_dim_letter_config_unavailable", hold: "item",
          message: `Repaint on "${itemName}" has an unreadable dimensional-letter paint config.` });
      } else if (literalEntirePanel && (cfg.features || []).includes("dimensional_letters") && dl?.enabled) {
        context.dimEnabled = true;
        const dlEmit = ({ field, ...rest }) => emit(INPUT, { field: `dim_letter_paint.${field}`, ...rest });
        const dq = maintenanceStrictNumber(dl.qty);
        if (dq === null || dq <= 0) dlEmit({ field: "qty", code: "maintenance_dim_letter_input_unavailable", hold: "item",
          message: `Dimensional-letter paint on "${itemName}" needs a positive letter count — otherwise it is silently skipped.` });
        const dh = maintenanceStrictNumber(dl.avg_height_in);
        if (dh === null || dh <= 0) dlEmit({ field: "avg_height_in", code: "maintenance_dim_letter_input_unavailable", hold: "item",
          message: `Dimensional-letter paint on "${itemName}" needs a positive average height.` });
        else context.dimBandsUsed.add(dimBandKey(dh));
        const dt = maintenanceStrictNumber(dl.thickness_in);
        if (dt === null || dt < 0) dlEmit({ field: "thickness_in", code: "maintenance_dim_letter_input_unavailable", hold: "item",
          message: `Dimensional-letter paint on "${itemName}" has an unusable thickness.` });
        if (maintenancePresent(dl.second_color_mask) && !SECOND_COLOR_MASKS.includes(dl.second_color_mask)) {
          dlEmit({ field: "second_color_mask", code: "maintenance_dim_letter_input_unavailable", hold: "item",
            message: `Dimensional-letter paint on "${itemName}" has an unknown second-color mask "${dl.second_color_mask}".` });
        }
        if (dl.second_color_mask === "paint_mask") context.dimMaskUsed = true;
      }
    }
  }

  return { issues, context };
};

// ---------- settings scanner ----------
// context: collected from the item + project scans — only settings actually
// consumed by THIS project are validated.
export const maintenanceSettingIssues = (settings, context = {}) => {
  const issues = [];
  const emitted = new Set();
  const emit = (key, code, label, extra = {}) => {
    if (emitted.has(key + code)) return;
    emitted.add(key + code);
    issues.push(maintenanceIssue(CATALOG, { field: key, code, hold: "project",
      message: `${label} ("${key}") is missing or unusable — update it in Sign Maintenance Settings before saving.`,
      ...extra }));
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

  // Labor rate — consumed for every priced item.
  if (context.hasItems) {
    check("maintenance_tech_rate", { positive: true, code: "maintenance_labor_rate_unavailable", label: "Maintenance tech rate" });
  }
  // Crew rates — consumed only for roles actually on the project.
  for (const role of (context.rolesPresent || [])) {
    const key = ROLE_RATE_SETTING[role];
    if (key) check(key, { positive: true, code: "maintenance_crew_rate_unavailable", label: `${role} rate` });
  }
  // Repaint settings — only while a monument repaint item exists.
  if (context.hasRepaint) {
    for (const { key, positive } of REPAINT_SETTING_CHECKS) {
      check(key, { positive, code: "maintenance_repaint_setting_unavailable", label: "Repaint setting" });
    }
    for (const featureId of (context.featuresUsed || [])) {
      const feature = REPAINT_FEATURES.find(f => f.id === featureId);
      if (feature) check(feature.setting, { code: "maintenance_repaint_setting_unavailable", label: `Repaint "${feature.label}" multiplier` });
    }
  }
  // Dim-letter paint settings — only while enabled; shared Paint Estimator keys.
  if (context.dimEnabled) {
    for (const { key, positive } of DIM_SETTING_CHECKS) {
      check(key, { positive, code: "maintenance_dim_letter_setting_unavailable", label: "Paint Estimator setting" });
    }
    // mixedPaintCostPerSqft: parts<=0 → liquid cost collapses to $0 silently.
    // Flag when no positive mix ratio exists at all (each component flagged
    // separately only when recorded-bad).
    const parts = ["paint_mix_ratio", "hardener_mix_ratio", "reducer_mix_ratio"]
      .reduce((s, k) => s + (maintenanceNonNegativeNumber(settings?.[k]) ?? 0), 0);
    if (parts <= 0) {
      emit("paint_mix_ratio", "maintenance_dim_letter_setting_unavailable",
        "Paint Estimator mix ratios (all zero — paint cost would be $0)");
    }
    for (const bandKey of (context.dimBandsUsed || [])) {
      check(bandKey, { code: "maintenance_dim_letter_setting_unavailable", label: "Letter prep multiplier" });
    }
    // Liquid units — recorded-bad flagged; priced-liquid-without-unit flagged
    // (costPerGallon falls back to factor 1 → silently treated as gallons).
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
  // Travel — only while round-trip miles are a positive number.
  if (context.milesPositive) {
    for (const { mKey, iKey, positive, label } of TRAVEL_SETTING_CHECKS) {
      // Resolved consumption: recorded maintenance_* wins, else recorded
      // install_*; both absent → TravelCostCard's designed internal defaults.
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

// ---------- project-level scanner ----------
export const maintenanceProjectInputIssues = (project, { equipmentInventory = [] } = {}) => {
  const issues = [];
  const context = { rolesPresent: new Set(), milesPositive: false, ownedVehiclesUsed: [] };
  const emit = (spec) => issues.push(maintenanceIssue(INPUT, spec));

  if (maintenancePresent(project?.items) && !Array.isArray(project.items)) {
    emit({ field: "items", code: "maintenance_items_unavailable", hold: "project",
      message: "The service-item list is unreadable — the entire estimate is held." });
  }
  // Consumed project-level numbers — recorded-but-unusable values are held;
  // absent values keep their documented defaults.
  const pctChecks = [
    ["supplies_percent_of_materials", "maintenance_supplies_rate_unavailable", "Supplies % of materials"],
    ["extra_supplies_cost", "maintenance_extra_supplies_unavailable", "Extra supplies cost"],
    ["markup_percent", "maintenance_markup_unavailable", "Markup %"],
    ["total_travel_cost", "maintenance_travel_unavailable", "Travel cost"],
  ];
  for (const [field, code, label] of pctChecks) {
    const v = project?.[field];
    if (maintenancePresent(v) && maintenanceNonNegativeNumber(v) === null) {
      emit({ field, code, hold: "project",
        message: `${label} is recorded but not a usable non-negative number — the estimate is held instead of silently substituting a default.` });
    }
  }
  const miles = project?.travel_miles_round_trip;
  if (maintenancePresent(miles) && maintenanceNonNegativeNumber(miles) === null) {
    emit({ field: "travel_miles_round_trip", code: "maintenance_travel_unavailable", hold: "project",
      message: "Round-trip miles is recorded but not a usable non-negative number." });
  }
  context.milesPositive = (maintenanceNonNegativeNumber(miles) || 0) > 0;

  // Equipment rows — the totals sum each row's stored total_cost; a selected
  // row with no usable cost is "a missing price, not free". When miles>0 an
  // owned vehicle without a positive MPG is silently dropped from fuel cost.
  const OWNED_VEHICLE_TYPES = new Set(["truck", "van", "flatbed", "car", "boom_truck"]);
  if (maintenancePresent(project?.selected_equipment) && !Array.isArray(project.selected_equipment)) {
    emit({ field: "selected_equipment", code: "maintenance_equipment_unavailable", hold: "project",
      message: "The equipment selection is unreadable — the estimate is held." });
  } else {
    (project?.selected_equipment || []).forEach((e, index) => {
      const name = e?.equipment_name || e?.name || `equipment ${index + 1}`;
      const inv = e?.equipment_id ? (equipmentInventory || []).find(i => i.id === e.equipment_id) : null;
      if (e?.equipment_id && !inv) {
        emit({ field: "selected_equipment", index, code: "maintenance_equipment_unavailable", hold: "project",
          inventoryId: e.equipment_id,
          message: `Selected equipment "${name}" no longer exists in the inventory — the estimate is held.` });
      }
      if (maintenanceNonNegativeNumber(e?.total_cost) === null) {
        emit({ field: "selected_equipment", index, code: "maintenance_equipment_cost_unavailable", hold: "project",
          inventoryId: e?.equipment_id ?? null,
          message: `Selected equipment "${name}" has no usable total cost — a missing price is not free.` });
      }
      if (context.milesPositive && inv && inv.ownership === "owned" && OWNED_VEHICLE_TYPES.has(inv.equipment_type)) {
        const mpg = maintenancePositiveNumber(inv.mpg);
        if (mpg === null) {
          issues.push(maintenanceIssue(CATALOG, { field: "selected_equipment", index,
            code: "maintenance_vehicle_mpg_unavailable", hold: "project", inventoryId: inv.id,
            message: `Selected owned vehicle "${inv.equipment_name || name}" has no positive MPG — travel fuel cost is silently skipping it.` }));
        }
      }
    });
  }

  // Personnel rows — role rates feed the per-row totals PersonnelSelector writes.
  if (maintenancePresent(project?.personnel) && !Array.isArray(project.personnel)) {
    emit({ field: "personnel", code: "maintenance_personnel_unavailable", hold: "project",
      message: "The personnel list is unreadable — the estimate is held." });
  } else {
    (project?.personnel || []).forEach((p, index) => {
      if (p?.role && ROLE_RATE_SETTING[p.role]) context.rolesPresent.add(p.role);
      if (maintenanceNonNegativeNumber(p?.total_cost) === null) {
        emit({ field: "personnel", index, code: "maintenance_personnel_cost_unavailable", hold: "project",
          message: `Personnel row ${index + 1} ("${p?.role || "crew"}") has no usable total cost — a missing price is not free.` });
      }
    });
  }

  return { issues, context };
};

// ---------- held-result helpers ----------
const ITEM_DERIVED = ["labor_hours", "labor_cost", "materials_cost", "item_total_cost"];
const TOTAL_FIELDS = [
  "labor_hours", "labor_cost", "total_materials_cost", "total_supplies_cost",
  "total_equipment_cost", "total_personnel_cost", "total_travel_cost",
  "subtotal", "markup_amount", "total_cost",
];
const nullTotals = () => Object.fromEntries(TOTAL_FIELDS.map(f => [f, null]));

const heldItem = (item, heldMaterialIndexes) => {
  const materials = (item.materials || []).map((m, i) =>
    heldMaterialIndexes.has(i) ? { ...m, total_cost: null } : m);
  const out = { ...item, materials, repaint_calc: undefined };
  for (const f of ITEM_DERIVED) out[f] = null;
  return out;
};

// ---------- the wrapper ----------
// Runs the real calculators, then applies holds. On a clean project the
// returned items/totals are byte-identical to calcServiceItem/calcProjectTotals.
export const calcMaintenanceProject = (project = {}, { settings = {}, rates = [], inventory = [], equipmentInventory = [] } = {}) => {
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
    hasRepaint: itemContexts.some(c => c.hasRepaint),
    featuresUsed: new Set(itemContexts.flatMap(c => [...c.featuresUsed])),
    dimEnabled: itemContexts.some(c => c.dimEnabled),
    dimBandsUsed: new Set(itemContexts.flatMap(c => [...c.dimBandsUsed])),
    dimMaskUsed: itemContexts.some(c => c.dimMaskUsed),
    rolesPresent: proj.context.rolesPresent,
    milesPositive: proj.context.milesPositive,
  };
  issues.push(...maintenanceSettingIssues(settings, merged));

  // Real calc — the valid path is untouched.
  const calcItems = rawItems.map(it => calcServiceItem(it, settings, rates, inventory));
  const calcTotals = calcProjectTotals({ ...project, items: calcItems });

  const held = issues.length > 0;
  const hasProjectHold = issues.some(i => i.hold === "project");
  const itemHolds = new Set();
  const materialHolds = new Map(); // itemIndex -> Set(materialIndex)
  for (const i of issues) {
    if (i.hold === "item" && i.itemIndex !== null) itemHolds.add(i.itemIndex);
    if (i.hold === "item" && i.itemIndex !== null && i.materialIndex !== null) {
      if (!materialHolds.has(i.itemIndex)) materialHolds.set(i.itemIndex, new Set());
      materialHolds.get(i.itemIndex).add(i.materialIndex);
    }
  }

  const items = calcItems.map((it, index) => {
    if (hasProjectHold || itemHolds.has(index)) {
      return heldItem(it, materialHolds.get(index) || new Set());
    }
    return it;
  });
  const totals = held ? nullTotals() : calcTotals;

  const calc = {
    items,
    totals,
    __held: held,
    pricingUnavailable: held,
    issues,
  };
  return {
    calc,
    issues,
    catalogIssues: issues.filter(i => i.kind === CATALOG),
    inputIssues: issues.filter(i => i.kind === INPUT),
    held,
  };
};

// ---------- UI helpers ----------
// Acknowledged saved snapshot: a real finite number already persisted on the
// record — safe to DISPLAY as "Saved amounts", never as current pricing.
export const hasMaintenanceCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
// Blank-preserving draft value: "" stays "", valid numbers parse, anything
// else stays raw so the scanner (not a silent 0) reports it.
export const maintenanceDraftValue = (raw) => {
  if (raw === "") return "";
  const n = maintenanceStrictNumber(raw);
  return n === null ? raw : n;
};
export const issuesForField = (issues, field, itemIndex = null, materialIndex = null) =>
  (issues || []).filter(i => i.field === field
    && (itemIndex === null || i.itemIndex === itemIndex)
    && (materialIndex === null || i.materialIndex === materialIndex));
export const hasIssueFor = (issues, field, itemIndex = null, materialIndex = null) =>
  issuesForField(issues, field, itemIndex, materialIndex).length > 0;
export const maintenanceItemIssueList = (issues, itemIndex) =>
  (issues || []).filter(i => i.itemIndex === itemIndex);
