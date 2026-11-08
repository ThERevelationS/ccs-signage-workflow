import { foundationInputNumber } from "./foundationGeometryInputs";

const isRecord = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const scalar = value => value === null || ["undefined", "string", "number", "boolean"].includes(typeof value) ? value : NaN;
const numeric = value => {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = foundationInputNumber(value);
  return parsed !== null ? parsed : scalar(value);
};

export function createFoundationReinforcementDraft(item = {}) {
  const accepted = item?.reinforcement_calculation_version === 2;
  const design = accepted && isRecord(item.reinforcement_design) ? structuredClone(item.reinforcement_design) : {
    version: 2, bar_diameter_inches: "",
    cover_inches: { side: "", top: "", bottom: "" },
    supports: { mode: "unconfigured", reason: "" },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } },
  };
  return {
    schema_version: 1, design,
    material: accepted && isRecord(item.reinforcement_material) ? structuredClone(item.reinforcement_material) : { kind: "" },
    overrides: { quantity_ft: item?.custom_rebar_qty ?? null, cost_per_ft: item?.custom_rebar_cost_per_ft ?? null },
  };
}

// Keep raw text in the draft; typed values exist only for fresh preview/acceptance.
export function prepareFoundationReinforcementDraft(draft) {
  const issues = [];
  const issue = (field, message) => issues.push({ field, code: "reinforcement_draft_invalid", severity: "error", message });
  if (!isRecord(draft) || draft.schema_version !== 1) {
    issue("schema_version", "A supported version-1 reinforcement proposal is required.");
    return { prepared: null, issues };
  }
  const raw = draft.design;
  if (!isRecord(raw)) {
    issue("design", "The proposal needs a reinforcement design object.");
    return { prepared: null, issues };
  }
  const numbers = (record, fields) => Object.fromEntries(fields.map(field => [field, numeric(record?.[field])]));
  const reference = value => typeof value === "string" ? value : scalar(value);
  const list = (value, field, maximum, map) => {
    if (value == null) return value;
    if (!Array.isArray(value) || value.length > maximum) {
      issue(field, `Use an explicit list of at most ${maximum} records.`);
      return null;
    }
    return value.map((record, index) => {
      if (!isRecord(record)) {
        issue(`${field}.${index}`, "Each proposal row must be an object.");
        return null;
      }
      return map(record);
    });
  };
  const design = {
    version: scalar(raw.version), bar_diameter_inches: numeric(raw.bar_diameter_inches),
    cover_inches: numbers(raw.cover_inches, ["side", "top", "bottom"]),
    supports: { mode: scalar(raw.supports?.mode), reason: scalar(raw.supports?.reason) },
    spread: {
      mats: list(raw.spread?.mats, "design.spread.mats", 256, record => ({
        id: reference(record.id), ...numbers(record, ["bearing_elevation_inches", "max_spacing_x_inches", "max_spacing_z_inches"]),
      })),
      inter_mat_ties: list(raw.spread?.inter_mat_ties, "design.spread.inter_mat_ties", 4096, record => ({
        id: reference(record.id), from_mat_id: reference(record.from_mat_id), to_mat_id: reference(record.to_mat_id),
        ...numbers(record, ["x_inches", "z_inches", "cut_length_inches"]),
      })),
    },
    pillar: {
      hoops: list(raw.pillar?.hoops, "design.pillar.hoops", 256, record => ({
        id: reference(record.id), ...numbers(record, ["center_y_inches", "centerline_diameter_inches", "cut_allowance_inches"]),
      })),
      longitudinal: numbers(raw.pillar?.longitudinal, ["count", "radius_inches", "bottom_end_inches", "top_end_inches"]),
    },
  };
  const source = isRecord(draft.material) ? draft.material : {};
  const material = {
    kind: scalar(source.kind), inventory_id: reference(source.inventory_id),
    name: scalar(source.name), reason: scalar(source.reason), unit: scalar(source.unit),
    ...numbers(source, ["bar_diameter_inches", "weight_lb_per_ft", "cost_per_ft"]),
  };
  const overrides = isRecord(draft.overrides) ? draft.overrides : {};
  if (draft.overrides != null && !isRecord(draft.overrides)) issue("overrides", "Proposal overrides must be an object.");
  return {
    prepared: {
      schema_version: 1, design, material,
      overrides: { quantity_ft: numeric(overrides.quantity_ft ?? null), cost_per_ft: numeric(overrides.cost_per_ft ?? null) },
    },
    issues,
  };
}
