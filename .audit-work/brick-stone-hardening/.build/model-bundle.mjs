var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .audit-work/brick-stone-hardening/remote-src/src/components/estimator/brick/brickCalc.js
var brickCalc_exports = {};
__export(brickCalc_exports, {
  calcBrickStoneProject: () => calcBrickStoneProject
});
var num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
function calcBrickStoneProject(project, material) {
  const gap = num(project.mortar_gap, 0.375);
  const layers = Math.max(1, num(project.layers, 1));
  const courses = num(project.courses_high, 0);
  const alongLength = num(project.bricks_along_length, 0);
  const alongWidth = num(project.bricks_along_width, 0);
  const waste = num(project.waste_factor, 1.1);
  const b = {
    length: num(material?.length),
    width: num(material?.width),
    height: num(material?.height)
  };
  const bricksPerCourse = (alongLength + alongWidth) * 2;
  const rawBricks = bricksPerCourse * courses * layers;
  const calculated_bricks = Math.ceil(rawBricks * waste);
  const derived_length = alongLength * (b.length + gap);
  const derived_width = alongWidth * (b.length + gap);
  const derived_height = courses * (b.height + gap);
  const perimeterInches = (derived_length + derived_width) * 2;
  const calculated_surface_area = perimeterInches * derived_height / 144;
  const mortarVolumeCuIn = rawBricks * (b.length * b.width * gap + b.height * b.width * gap);
  const mortar_bags_needed = Math.ceil(mortarVolumeCuIn / 1728 / 0.6) || 0;
  const material_cost = calculated_bricks * num(material?.cost_per_unit);
  const mortar_cost = mortar_bags_needed * num(project.mortar_bag_cost, 12);
  const labor_hours = calculated_bricks / Math.max(1, num(project.bricks_per_hour, 40));
  const labor_cost = labor_hours * num(project.labor_rate_per_hour, 55);
  const subtotal = material_cost + mortar_cost + labor_cost;
  const markup_amount = subtotal * num(project.markup_percent) / 100;
  return {
    calculated_bricks,
    bricks_per_course: bricksPerCourse,
    derived_length,
    derived_width,
    derived_height,
    calculated_surface_area,
    mortar_bags_needed,
    material_cost,
    mortar_cost,
    labor_hours,
    labor_cost,
    subtotal,
    markup_amount,
    total_cost: subtotal + markup_amount
  };
}

// .audit-work/brick-stone-hardening/frozen-src/components/estimator/brick/brickPricingAvailability.js
var brickPricingAvailability_exports = {};
__export(brickPricingAvailability_exports, {
  brickDraftValue: () => brickDraftValue,
  brickMaterialIssues: () => brickMaterialIssues,
  brickNonNegativeNumber: () => brickNonNegativeNumber,
  brickNumber: () => brickNumber,
  brickPositiveNumber: () => brickPositiveNumber,
  brickProjectInputIssues: () => brickProjectInputIssues,
  brickRecorded: () => brickRecorded,
  calcBrickStoneAvailability: () => calcBrickStoneAvailability,
  hasBrickCostSnapshot: () => hasBrickCostSnapshot,
  hasIssueFor: () => hasIssueFor,
  issuesForField: () => issuesForField
});

// .audit-work/brick-stone-hardening/frozen-src/components/estimator/brick/brickCalc.js
var num2 = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
function calcBrickStoneProject2(project, material) {
  const gap = num2(project.mortar_gap, 0.375);
  const layers = Math.max(1, num2(project.layers, 1));
  const courses = num2(project.courses_high, 0);
  const alongLength = num2(project.bricks_along_length, 0);
  const alongWidth = num2(project.bricks_along_width, 0);
  const waste = num2(project.waste_factor, 1.1);
  const b = {
    length: num2(material?.length),
    width: num2(material?.width),
    height: num2(material?.height)
  };
  const bricksPerCourse = (alongLength + alongWidth) * 2;
  const rawBricks = bricksPerCourse * courses * layers;
  const calculated_bricks = Math.ceil(rawBricks * waste);
  const derived_length = alongLength * (b.length + gap);
  const derived_width = alongWidth * (b.length + gap);
  const derived_height = courses * (b.height + gap);
  const perimeterInches = (derived_length + derived_width) * 2;
  const calculated_surface_area = perimeterInches * derived_height / 144;
  const mortarVolumeCuIn = rawBricks * (b.length * b.width * gap + b.height * b.width * gap);
  const mortar_bags_needed = Math.ceil(mortarVolumeCuIn / 1728 / 0.6) || 0;
  const material_cost = calculated_bricks * num2(material?.cost_per_unit);
  const mortar_cost = mortar_bags_needed * num2(project.mortar_bag_cost, 12);
  const labor_hours = calculated_bricks / Math.max(1, num2(project.bricks_per_hour, 40));
  const labor_cost = labor_hours * num2(project.labor_rate_per_hour, 55);
  const subtotal = material_cost + mortar_cost + labor_cost;
  const markup_amount = subtotal * num2(project.markup_percent) / 100;
  return {
    calculated_bricks,
    bricks_per_course: bricksPerCourse,
    derived_length,
    derived_width,
    derived_height,
    calculated_surface_area,
    mortar_bags_needed,
    material_cost,
    mortar_cost,
    labor_hours,
    labor_cost,
    subtotal,
    markup_amount,
    total_cost: subtotal + markup_amount
  };
}

// .audit-work/brick-stone-hardening/frozen-src/components/estimator/brick/brickPricingAvailability.js
var brickNumber = (v) => {
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
var brickNonNegativeNumber = (v) => {
  const n = brickNumber(v);
  return n !== null && n >= 0 ? n : null;
};
var brickPositiveNumber = (v) => {
  const n = brickNumber(v);
  return n !== null && n > 0 ? n : null;
};
var brickRecorded = (v) => v !== void 0 && v !== null;
var hasBrickCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var brickDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};
var issue = (kind, { index = null, itemIndex = null, inventoryId = null, field, code, message, hold = "project" }) => ({
  kind,
  index,
  itemIndex,
  inventoryId,
  field,
  code,
  message,
  hold
});
var brickMaterialIssues = (project = {}, material = null) => {
  const issues = [];
  const add = (field, code, message, inventoryId = null) => issues.push(issue("brick_catalog", { inventoryId, field, code, message, hold: "project" }));
  const selectedId = project?.selected_material_id;
  if (!selectedId) {
    add(
      "selected_material_id",
      "brick_material_unavailable",
      "select a brick or stone material \u2014 a wall priced without one silently bills $0 material"
    );
    return issues;
  }
  if (!material) {
    add(
      "selected_material_id",
      "brick_material_unavailable",
      "the selected material record is no longer available \u2014 reselect the brick or stone material",
      selectedId
    );
    return issues;
  }
  const label = material.material_name || "the selected material";
  for (const [field, human] of [
    ["length", "unit length (inches)"],
    ["width", "unit width (inches)"],
    ["height", "unit height (inches)"]
  ]) {
    if (brickPositiveNumber(material[field]) === null) {
      add(
        field,
        "brick_material_dimension_unavailable",
        `Material "${label}": record a positive, finite ${human} in the masonry catalog \u2014 a missing dimension silently prices as 0"`,
        material.id ?? null
      );
    }
  }
  if (brickNonNegativeNumber(material.cost_per_unit) === null) {
    add(
      "cost_per_unit",
      "brick_material_price_unavailable",
      `Material "${label}": record a finite, nonnegative cost per unit \u2014 a missing price is not free`,
      material.id ?? null
    );
  }
  return issues;
};
var brickProjectInputIssues = (project = {}) => {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("brick", { field, code, message, hold: "project" }));
  for (const [field, human] of [
    ["bricks_along_length", "brick count along the length"],
    ["bricks_along_width", "brick count along the width"]
  ]) {
    if (!brickRecorded(project?.[field])) {
      add(
        field,
        "brick_dimension_unavailable",
        `record the ${human} \u2014 the displayed hint is not stored, so an unset value silently prices as 0 (record 0 for a flat side)`
      );
      continue;
    }
    const n = brickNumber(project[field]);
    if (n === null || n < 0) {
      add(
        field,
        "brick_dimension_unavailable",
        `record a finite, nonnegative ${human} \u2014 the stored value cannot price the wall`
      );
    }
  }
  const alongLength = brickNumber(project?.bricks_along_length);
  const alongWidth = brickNumber(project?.bricks_along_width);
  if (alongLength !== null && alongWidth !== null && alongLength >= 0 && alongWidth >= 0 && alongLength + alongWidth <= 0) {
    add(
      "bricks_along_length",
      "brick_wall_extent_unavailable",
      "record bricks along the length or the width \u2014 a wall with no extent cannot be priced"
    );
  }
  if (!brickRecorded(project?.courses_high)) {
    add(
      "courses_high",
      "brick_courses_unavailable",
      "record the courses high \u2014 the displayed hint is not stored, so an unset value silently prices no wall"
    );
  } else if (brickPositiveNumber(project.courses_high) === null) {
    add(
      "courses_high",
      "brick_courses_unavailable",
      "record a positive, finite courses high \u2014 a zero or malformed count prices no wall"
    );
  }
  if (brickRecorded(project?.layers)) {
    const n = brickNumber(project.layers);
    if (n === null || n < 1) {
      add(
        "layers",
        "brick_layers_unavailable",
        "record a layer count of 1 or more \u2014 a lower or malformed value silently prices as 1 layer"
      );
    }
  }
  if (brickRecorded(project?.mortar_gap) && brickNonNegativeNumber(project.mortar_gap) === null) {
    add(
      "mortar_gap",
      "brick_mortar_gap_unavailable",
      "record a finite, nonnegative mortar gap in inches \u2014 the stored value cannot price mortar joints"
    );
  }
  if (brickRecorded(project?.waste_factor) && brickPositiveNumber(project.waste_factor) === null) {
    add(
      "waste_factor",
      "brick_waste_factor_unavailable",
      "record a positive, finite waste factor (1.0 = exact count) \u2014 a zero or negative factor silently prices $0 materials"
    );
  }
  if (brickRecorded(project?.mortar_bag_cost) && brickNonNegativeNumber(project.mortar_bag_cost) === null) {
    add(
      "mortar_bag_cost",
      "brick_mortar_cost_unavailable",
      "record a finite, nonnegative mortar bag cost \u2014 the stored value cannot price mortar"
    );
  }
  if (brickRecorded(project?.bricks_per_hour)) {
    const n = brickNumber(project.bricks_per_hour);
    if (n === null || n < 1) {
      add(
        "bricks_per_hour",
        "brick_lay_rate_unavailable",
        "record a laying rate of 1 brick/hour or more \u2014 a lower or malformed rate silently reprices labor at 1/hr"
      );
    }
  }
  if (brickRecorded(project?.labor_rate_per_hour) && brickNonNegativeNumber(project.labor_rate_per_hour) === null) {
    add(
      "labor_rate_per_hour",
      "brick_labor_rate_unavailable",
      "record a finite, nonnegative mason labor rate per hour \u2014 the stored value cannot price labor"
    );
  }
  if (brickRecorded(project?.markup_percent) && brickNonNegativeNumber(project.markup_percent) === null) {
    add(
      "markup_percent",
      "brick_markup_unavailable",
      "record a finite, nonnegative markup % or clear it \u2014 the stored value cannot price markup"
    );
  }
  return issues;
};
var calcBrickStoneAvailability = (project = {}, material = null) => {
  const issues = [
    ...brickMaterialIssues(project, material),
    ...brickProjectInputIssues(project)
  ];
  const calc = calcBrickStoneProject2(project, material);
  if (!issues.length) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held: false };
  }
  const out = { ...calc };
  for (const field of Object.keys(out)) {
    if (typeof out[field] === "number") out[field] = null;
  }
  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held: true };
};
var issuesForField = (issues = [], field, itemIndex = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
var hasIssueFor = (issues = [], field, itemIndex = null) => issuesForField(issues, field, itemIndex).length > 0;
export {
  brickPricingAvailability_exports as avail,
  brickCalc_exports as remote
};
