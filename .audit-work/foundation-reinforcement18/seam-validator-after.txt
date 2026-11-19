import {
  foundationInputNumber as inputNumber,
  foundationPositiveWholeNumber as positiveWholeNumber,
  foundationGeometryValidation,
} from './foundationGeometryInputs';

export function foundationItemInputIssues(item, index = 0) {
  const record = item ?? {};
  const { issues, type, dimensions } = foundationGeometryValidation(record, index);
  const add = (field, code, message) => issues.push({
    kind: "foundation", index, componentId: record.component_id ?? null, field, code,
    message: `Foundation ${index + 1}: ${message}`,
  });
  if (record.include_rebar) {
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
  return issues;
}

export function foundationProjectInputIssues(project) {
  const items = project?.items ?? [];
  if (!Array.isArray(items)) throw new Error("Foundation items must be an array.");
  return items.flatMap((item, index) => foundationItemInputIssues(item, index));
}
