import { landscapeInputIssues } from "./landscapeMaterials";
import { calculateFoundationReinforcementModel } from "./foundationReinforcementModel";

// Inventory normalization boundary (CMP-A08): the canonical numeric kernels
// live in masterInventory/inventoryNormalization. inputNumber is the finite
// signed basis; positiveWholeNumber the positive-whole predicate;
// cabinetQuantityNumber the positive basis; cabinetPriceNumber the catalog
// price basis.
import {
  inventoryFiniteNumber as inputNumber,
  inventoryIsPositiveWhole as positiveWholeNumber,
  inventoryPositiveNumber as cabinetQuantityNumber,
  inventoryNonnegativeNumber as cabinetPriceNumber,
} from "@/components/masterInventory/inventoryNormalization";

const ITEM_CUSTOM_OVERRIDE_FIELDS = [
  ["custom_concrete_cost_per_cy", "concrete cost-per-unit override"],
  ["custom_concrete_qty", "concrete quantity override"],
  ["custom_rebar_cost_per_ft", "rebar cost-per-foot override"],
  ["custom_rebar_qty", "rebar quantity override"],
  ["custom_forming_rate", "forming rate override"],
  ["custom_forming_qty", "forming quantity override"],
  ["custom_finishing_rate", "finishing rate override"],
  ["custom_finishing_hours", "finishing hours override"],
  ["custom_excavation_hours", "excavation hours override"],
  ["custom_excavation_rate", "excavation rate override"],
];

export function foundationItemInputIssues(item, index = 0) {
  const record = item ?? {};
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "foundation", index, componentId: record.component_id ?? null, field, code,
    message: `Foundation ${index + 1}: ${message}`,
  });
  const type = record.foundation_type;
  if (type !== "spread_foot" && type !== "pillar") {
    add("foundation_type", "foundation_type_invalid", "select Spread Footing or Pillar / Caisson.");
  }
  // A recorded excavation method must name a real method — anything else the
  // ported math silently prices on the equipment branch.
  if (record.excavation_method !== undefined && record.excavation_method !== null && record.excavation_method !== ""
    && record.excavation_method !== "hand_dig" && record.excavation_method !== "equipment_excavation") {
    add("excavation_method", "foundation_excavation_method_invalid",
      "select a supported excavation method (Hand dig or Equipment).");
  }
  const count = record.quantity ?? 1;
  const quantity = inputNumber(count);
  if (!positiveWholeNumber(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot"
    ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]]
    : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = inputNumber(record[field]);
    dimensions[field] = value;
    if (value === null || value <= 0) {
      add(field, "foundation_dimension_invalid", `${label} (inches) must be a finite positive number.`);
    }
  }
  if (!issues.length) {
    const depth = dimensions.depth_inches / 12;
    const radius = dimensions.diameter / 24;
    const volume = type === "spread_foot"
      ? ((dimensions.length_inches / 12) * (dimensions.width_inches / 12) * depth) / 27 * quantity
      : (Math.PI * radius * radius * depth) / 27 * quantity;
    // This is numeric-range validation, not a structural design or engineering minimum.
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
  // Versioned reinforcement dispatch (CMP-B): items carrying
  // reinforcement_calculation_version are priced by the versioned model —
  // absent/1 keeps the legacy checks below untouched, an unsupported version
  // is held rather than silently recalculated as legacy, and version 2
  // reports its explicit design's own errors instead of the legacy rebar
  // fields it does not consume. Consumed overrides and the recorded
  // excavation method above still apply on every version.
  const version = record.reinforcement_calculation_version;
  if (version != null && version !== 1 && version !== 2) {
    add("reinforcement_calculation_version", "foundation_reinforcement_version_unsupported",
      "the active reinforcement calculation version is unsupported. Reload before changing prices.");
    return issues;
  }
  if (version === 2) {
    if (record.include_rebar != null && typeof record.include_rebar !== "boolean") {
      add("include_rebar", "foundation_reinforcement_enabled_invalid", "reinforcement must be explicitly enabled or disabled.");
      return issues;
    }
    if (!issues.length) {
      const model = calculateFoundationReinforcementModel(record, record.reinforcement_design, { geometryLimit: 0 });
      for (const issue of model.issues.filter(value => value.severity === "error")) {
        add(`reinforcement_design.${issue.field}`, issue.code, issue.message);
      }
    }
  } else if (record.include_rebar) {
    const optional = (field, code, label, valid) => {
      const value = record[field];
      if (value !== undefined && value !== null && !valid(value)) add(field, code, label);
    };
    const positive = value => {
      const number = inputNumber(value);
      return number !== null && number > 0;
    };
    const whole = (field, label) => optional(field, "foundation_rebar_count_invalid",
      `${label} must be a positive whole number within the supported range.`, positiveWholeNumber);
    if (type === "spread_foot") {
      for (const [field, label] of [["rebar_spacing_length", "length"], ["rebar_spacing_width", "width"]]) {
        optional(field, "foundation_rebar_spacing_invalid",
          `rebar spacing ${label} (inches) must be a finite positive number.`, positive);
      }
      whole("rebar_layers", "Rebar mat count");
    } else if (type === "pillar") {
      whole("pillar_rebar_layers", "Hoop count");
      whole("pillar_vertical_rebar_count", "Longitudinal bar count");
      optional("pillar_rebar_hoop_diameter", "foundation_rebar_diameter_invalid",
        "hoop diameter (inches) must be finite, positive and no greater than the foundation diameter.",
        value => positive(value) && (dimensions.diameter === null || dimensions.diameter <= 0 || inputNumber(value) <= dimensions.diameter));
    }
  }
  // Recorded overrides feed the ported cost math verbatim — a malformed or
  // negative override is not a free material. Absent/null means "no override"
  // and skips the check; explicit 0 is a legitimate override value.
  for (const [field, label] of ITEM_CUSTOM_OVERRIDE_FIELDS) {
    const raw = record[field];
    if (raw === undefined || raw === null) continue;
    const number = inputNumber(raw);
    if (number === null || number < 0) {
      add(field, "foundation_override_invalid",
        `${label} must be a finite, nonnegative number — clear it or record a valid value.`);
    }
  }
  return issues;
}

// Signage-cabinet availability — only the two values the ported line math
// (`unit_cost * quantity`) actually consumes are checked; dimensions are
// authored geometry and are never price-consuming.
//
// quantity: absent/blank keeps the ported single-cabinet default. A recorded
// quantity must be finite and positive — a stored 0 bills nothing and the
// ported `|| 1` silently repriced it to one cabinet, so it is held instead of
// guessed. (Fractional positive counts were already billing at face value, so
// they stay valid — never silently repriced.)
//
// unit_cost: must be present, finite and nonnegative. A missing or blank
// price laundered to a $0 "current" amount under `|| 0`; an explicit recorded
// 0 remains a legitimate free cabinet.
// cabinetQuantityNumber / cabinetPriceNumber are imported aliases of the
// boundary's positive and price bases (see the import block above).

export function signageCabinetInputIssues(cabinet, index = 0) {
  const issues = [];
  const record = cabinet ?? {};
  const add = (field, code, message) => issues.push({
    kind: "signage_cabinet", index,
    componentId: record.component_id ?? record.id ?? null,
    field, code,
    message: `Signage cabinet ${index + 1}: ${message}`,
  });
  const qty = record.quantity;
  if (qty !== undefined && qty !== null && qty !== "" && cabinetQuantityNumber(qty) === null) {
    add("quantity", "signage_cabinet_quantity_unavailable",
      "record a finite, positive quantity — a zero or malformed quantity cannot be repriced");
  }
  if (cabinetPriceNumber(record.unit_cost) === null) {
    add("unit_cost", "signage_cabinet_price_unavailable",
      "record a finite, nonnegative unit cost — a missing price is not a free cabinet");
  }
  return issues;
}

export function signageCabinetsInputIssues(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : [])
    .flatMap((cabinet, index) => signageCabinetInputIssues(cabinet, index));
}

export function foundationProjectInputIssues(project) {
  const items = project?.items ?? [];
  if (!Array.isArray(items)) throw new Error("Foundation items must be an array.");
  // The project default excavation method merges into every item without its
  // own — a recorded value outside the enum silently priced as equipment. The
  // project-level issue names the broken default, and every item inheriting
  // it is held like a recorded-invalid method (its effective method cannot
  // price a real branch).
  const projectIssues = [];
  const method = project?.excavation_method;
  const projectMethodInvalid = method !== undefined && method !== null && method !== ""
    && method !== "hand_dig" && method !== "equipment_excavation";
  if (projectMethodInvalid) {
    projectIssues.push({
      kind: "foundation", index: null, componentId: null,
      field: "excavation_method", code: "foundation_excavation_method_invalid",
      message: "Project: select a supported default excavation method (Hand dig or Equipment).",
    });
  }
  // A recorded landscape design that is not a record (string/number/array)
  // slid past the materials scan as a silent $0 and persisted verbatim — it
  // is unavailable, not free.
  const landscape = project?.landscape;
  const landscapeIssues = landscape !== undefined && landscape !== null
    && (typeof landscape !== "object" || Array.isArray(landscape))
    ? [{
        kind: "landscape", index: null, componentId: null, field: "landscape",
        code: "landscape_unavailable",
        message: "Landscape: the recorded site design is malformed — repair or clear it before repricing.",
      }]
    : landscapeInputIssues(landscape);
  return [
    ...items.flatMap((item, index) => {
      const itemIssues = foundationItemInputIssues(item, index);
      // An item that inherits an invalid project default cannot price a real
      // branch — hold it like a recorded-invalid method.
      if (projectMethodInvalid
        && (item?.excavation_method === undefined || item?.excavation_method === null || item?.excavation_method === "")) {
        itemIssues.push({
          kind: "foundation", index, componentId: item?.component_id ?? null,
          field: "excavation_method", code: "foundation_excavation_method_invalid",
          message: `Foundation ${index + 1}: inherits the invalid project default excavation method — fix the project default or pick a method on this item.`,
        });
      }
      return itemIssues;
    }),
    ...projectIssues,
    ...signageCabinetsInputIssues(project?.signage_cabinets || []),
    ...landscapeIssues,
  ];
}