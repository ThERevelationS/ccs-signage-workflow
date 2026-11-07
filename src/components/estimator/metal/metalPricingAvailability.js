// Metal Fabrication pricing-availability layer.
//
// The Metal estimator's calculator lives inline in MetalEstimator.jsx — this
// module owns the exact same math as pure functions plus the strict
// finite-number input validation the page never had, so a missing, malformed,
// or unusable pricing input can no longer silently become $0, a hidden
// default, a NaN-derived total, or a stale dropped-inventory edge. Mirrors the
// landed Foundation/Vinyl/Painting hardening convention:
//   - strict parsers (metalStrictNumber — the calculator and the scanner
//     resolve identically)
//   - structured issue records { kind, index, itemIndex, field, code, message,
//     hold } — kind "metal_catalog" for shared-catalog surfaces (Metal
//     Settings seed rows, Master Inventory cost rows), kind "metal" for
//     record-authored values; hold "project" nulls every derived number,
//     hold "item" nulls that item's derived numbers and every aggregate
//   - explicit 0 stays valid where the calculator treats it as a real
//     free/zero amount (stored project rates, hours, lengths, supplies cost,
//     cost_per_unit); 0 is invalid where a stored value can never take effect
//     or a real magnitude is required (a recorded 0 on a Settings seed row is
//     silently resurrected to the module default by `parseFloat(x) || 65`;
//     quantity < 1 silently reprices as 1)
//   - raw rows are never mutated — the calculator reads the original records
//     exactly as MetalEstimator has always passed them
//
// Valid inputs take the exact same code path as before: the calc object the
// page receives for a clean project is bit-identical to today's result (plus
// __held / pricingUnavailable / issues metadata flags).

// ---------- strict priced-input resolution ----------
// Finite number or null. Accepts real numbers and trimmed numeric strings;
// rejects "", "abc", Infinity, NaN, hex/octal strings, null, undefined,
// objects. `Number()`/`parseFloat()` alone launder malformed text silently.
export const metalStrictNumber = (v) => {
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

// ---------- issue records ----------
const issue = (kind, { index = null, itemIndex = null, field, code, message, hold }) => ({
  kind, index, itemIndex, field, code, message, hold,
});

const PRESENT = (v) => v !== undefined && v !== null;

// ---------- the calculator (extracted verbatim from MetalEstimator.jsx) --
// These are the remote formulas, unchanged — the availability layer guards
// the boundary around them instead of rewriting them. Malformed inputs still
// resolve exactly as the remote math resolves them (possibly NaN); the
// scanner flags every such input so the totals are held to null before they
// can be displayed or persisted.

// Per-item derive run by updateItem on every field edit. `rates` is the
// project state object ({ fabrication_rate, welding_rate, finishing_rate }).
// material_cost only re-derives when the linked inventory row resolves —
// identical to the remote behavior.
export function deriveMetalItemCosts(item, rates = {}, inventory = []) {
  const out = { ...item };
  const inventoryItem = inventory.find((i) => i.id === item.inventory_item_id);
  if (inventoryItem) {
    out.material_cost = (item.material_length_ft || 0) * (inventoryItem.cost_per_unit || 0);
  }
  out.fabrication_cost = (item.fabrication_hours || 0) * rates.fabrication_rate;
  out.welding_cost = (item.welding_hours || 0) * rates.welding_rate;
  out.finishing_cost = (item.finishing_hours || 0) * rates.finishing_rate;
  return out;
}

// Totals + enriched items — the remote calculateTotals/getProjectCalculations
// pair verbatim. Consumes the stored per-item derived costs verbatim.
export function computeMetalCalculations(project = {}, inventory = []) {
  const totals = {
    material: 0,
    supplies: 0,
    fabrication: 0,
    welding: 0,
    finishing: 0,
  };
  (project.items || []).forEach(item => {
    totals.material += (item.material_cost || 0) * (item.quantity || 1);
    totals.supplies += (item.supplies_cost || 0) * (item.quantity || 1);
    totals.fabrication += (item.fabrication_cost || 0) * (item.quantity || 1);
    totals.welding += (item.welding_cost || 0) * (item.quantity || 1);
    totals.finishing += (item.finishing_cost || 0) * (item.quantity || 1);
  });

  const totalMaterialsCost = totals.material;
  const totalSuppliesCost = totals.supplies;
  const totalFabricationCost = totals.fabrication;
  const totalWeldingCost = totals.welding;
  const totalFinishingCost = totals.finishing;
  const totalLaborCost = totalFabricationCost + totalWeldingCost + totalFinishingCost;

  const enrichedItems = (project.items || []).map(item => {
    const inventoryItem = inventory.find(i => i.id === item.inventory_item_id);
    const materialType = inventoryItem ? inventoryItem.material_type : 'N/A';
    const itemTypeDisplay = item.item_type ? item.item_type.replace(/_/g, ' ') : 'N/A';

    let length = 'N/A', width = 'N/A', thickness = 'N/A';
    let dimensionsDisplay = 'N/A';
    if (inventoryItem && inventoryItem.size) {
      dimensionsDisplay = inventoryItem.size;
      const sizeString = inventoryItem.size.toLowerCase().replace(/['"inchesftt]/g, '').trim();
      const parts = sizeString.split(/[xÃ—]/).map(p => p.trim());
      if (parts.length >= 1) length = parts[0];
      if (parts.length >= 2) width = parts[1];
      if (parts.length >= 3) thickness = parts[2];
    }

    const laborHoursPerUnit = (item.fabrication_hours || 0) + (item.welding_hours || 0) + (item.finishing_hours || 0);
    const materialsCostTotal = (item.material_cost || 0) * (item.quantity || 1);
    const suppliesCostTotal = (item.supplies_cost || 0) * (item.quantity || 1);
    const laborCostTotal = ((item.fabrication_cost || 0) + (item.welding_cost || 0) + (item.finishing_cost || 0)) * (item.quantity || 1);

    return {
      ...item,
      item_type_display: itemTypeDisplay,
      material_type: materialType,
      dimensions_display: dimensionsDisplay,
      length: length,
      width: width,
      thickness: thickness,
      labor_hours: laborHoursPerUnit,
      materials_cost: materialsCostTotal,
      supplies_cost: suppliesCostTotal,
      labor_cost: laborCostTotal,
    };
  });

  return {
    totalMaterialsCost,
    totalSuppliesCost,
    totalFabricationCost,
    totalWeldingCost,
    totalFinishingCost,
    totalLaborCost,
    grandTotal: totalMaterialsCost + totalSuppliesCost + totalLaborCost,
    enrichedItems,
  };
}

// ---------- settings scan ----------
// The three Settings rows the estimator seeds a NEW project's rates from.
// [projectField, primaryKey, legacyAliasKey, human, moduleDefault]
const RATE_SEEDS = [
  ["fabrication_rate", "metal_fabrication_rate", "fabrication_rate", "fabrication rate ($/hr)", 65],
  ["welding_rate", "metal_welding_rate", "welding_rate", "welding rate ($/hr)", 75],
  ["finishing_rate", "metal_finishing_rate", "finishing_rate", "finishing rate ($/hr)", 55],
];

// Only the consumed row is scanned — `metal_x ?? x` means the metal_* row
// wins whenever it is recorded (a blank "" still shadows the alias — that is
// itself a flaggable recorded value). Absent rows seed the module default by
// design and are never an issue. A recorded 0 is flagged because the seed
// `parseFloat(x) || default` resurrects the fallback — an authored 0 rate can
// never take effect through this path.
export function metalSettingIssues(settings = {}) {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("metal_catalog", { field, code, message, hold: "project" }));

  for (const [, primary, alias, human, fallback] of RATE_SEEDS) {
    const consumed = settings?.[primary] !== undefined && settings?.[primary] !== null
      ? primary
      : (settings?.[alias] !== undefined && settings?.[alias] !== null ? alias : null);
    if (!consumed) continue;
    const n = metalStrictNumber(settings[consumed]);
    if (n === null || n <= 0) {
      add(consumed, "metal_setting_unavailable",
        `Setting ${consumed}: record a finite, positive ${human} in Metal Settings — the stored value cannot seed this estimate (the ${fallback} module default applies silently)`);
    }
  }
  return issues;
}

// ---------- project-level scan ----------
// Stored project rates price every labor line — they must exist and be finite
// nonnegative numbers. An explicit 0 stored rate IS honored verbatim by the
// derive (unlike the Settings seed path), so it stays legitimate.
export function metalRateIssues(project = {}) {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("metal", { field, code, message, hold: "project" }));

  for (const [field, human] of [
    ["fabrication_rate", "fabrication rate ($/hr)"],
    ["welding_rate", "welding rate ($/hr)"],
    ["finishing_rate", "finishing rate ($/hr)"],
  ]) {
    const raw = project?.[field];
    if (raw === undefined || raw === null) {
      add(field, "metal_rate_unavailable",
        `Project ${field}: no ${human} is stored — the rate is required to price labor on this estimate`);
      continue;
    }
    const n = metalStrictNumber(raw);
    if (n === null || n < 0) {
      add(field, "metal_rate_unavailable",
        `Project ${field}: record a finite, nonnegative ${human} — the stored value cannot price labor`);
    }
  }

  // items must be an array — the calc maps it verbatim.
  if (project?.items !== undefined && !Array.isArray(project.items)) {
    add("items", "metal_items_unavailable",
      "the stored fabrication items are malformed — the project cannot be repriced");
  }

  return issues;
}

// ---------- item-level scan ----------
// Consumed fields on each metal item. Issues hold the item's derived numbers
// (hold "item") — totals re-derive null because they sum held items. Every
// numeric field has a meaningful absent-default (0 length/hours/supplies,
// quantity 1), so only RECORDED values can be malformed.
export function metalItemIssues(rawItem = {}, index = 0, inventory = []) {
  const issues = [];
  const label = `Item ${index + 1}${rawItem?.description ? ` "${rawItem.description}"` : ""}`;
  const add = (field, code, message, kind = "metal") =>
    issues.push(issue(kind, { index, itemIndex: index, field, code, message: `${label}: ${message}`, hold: "item" }));

  // material_length_ft — recorded must be finite >= 0 (0 = no material draw).
  if (PRESENT(rawItem?.material_length_ft)) {
    const n = metalStrictNumber(rawItem.material_length_ft);
    if (n === null || n < 0) {
      add("material_length_ft", "metal_material_length_unavailable",
        "record a finite, nonnegative material length (ft) — the stored value cannot price material");
    }
  }

  // quantity — recorded must be finite >= 1; absent defaults to 1. The remote
  // `(item.quantity || 1)` laundered a recorded 0/blank/junk into a silent
  // quantity of one.
  if (PRESENT(rawItem?.quantity)) {
    const n = metalStrictNumber(rawItem.quantity);
    if (n === null || n < 1) {
      add("quantity", "metal_quantity_unavailable",
        "record a quantity of 1 or more — a blank or malformed value prices as 1 silently");
    }
  }

  // labor hours — recorded must be finite >= 0 (0 = none of that labor type).
  for (const [field, human] of [
    ["fabrication_hours", "fabrication hours"],
    ["welding_hours", "welding hours"],
    ["finishing_hours", "finishing hours"],
  ]) {
    if (!PRESENT(rawItem?.[field])) continue;
    const n = metalStrictNumber(rawItem[field]);
    if (n === null || n < 0) {
      add(field, "metal_hours_unavailable",
        `record finite, nonnegative ${human} — the stored value cannot price labor`);
    }
  }

  // supplies_cost — recorded must be finite >= 0.
  if (PRESENT(rawItem?.supplies_cost)) {
    const n = metalStrictNumber(rawItem.supplies_cost);
    if (n === null || n < 0) {
      add("supplies_cost", "metal_supplies_unavailable",
        "record a finite, nonnegative per-unit supplies cost — the stored value silently became $0");
    }
  }

  // Stored derived costs — the totals consume these verbatim. Only a recorded
  // unusable/negative value is an issue (absent fields fall back to $0 by
  // design). Negative can never arise from legitimate nonnegative inputs.
  for (const [field, human] of [
    ["material_cost", "material cost"],
    ["fabrication_cost", "fabrication cost"],
    ["welding_cost", "welding cost"],
    ["finishing_cost", "finishing cost"],
  ]) {
    if (!PRESENT(rawItem?.[field])) continue;
    const n = metalStrictNumber(rawItem[field]);
    if (n === null || n < 0) {
      add(field, "metal_derived_cost_unavailable",
        `the stored ${human} cannot be repriced — re-enter the item's inputs to re-derive it`);
    }
  }

  // Inventory resolution — the shared Master Inventory catalog link.
  const hasRef = PRESENT(rawItem?.inventory_item_id) && rawItem.inventory_item_id !== "";
  const inv = hasRef ? inventory.find((i) => i.id === rawItem.inventory_item_id) : null;
  const lengthN = metalStrictNumber(rawItem?.material_length_ft);
  const materialDraw = lengthN !== null && lengthN > 0;
  const storedMat = metalStrictNumber(rawItem?.material_cost);
  if (hasRef && !inv) {
    add("inventory_item_id", "metal_inventory_item_unavailable",
      "the linked Master Inventory row no longer exists — material pricing cannot resolve; re-select the material or clear the link", "metal_catalog");
  } else if (!hasRef && (materialDraw || (storedMat !== null && storedMat > 0))) {
    add("inventory_item_id", "metal_inventory_item_unavailable",
      "select a Master Inventory material or clear the material length — the stored material draw prices as $0 silently");
  } else if (inv && materialDraw) {
    const cpu = metalStrictNumber(inv.cost_per_unit);
    if (cpu === null || cpu < 0) {
      add("inventory_item_id", "metal_inventory_cost_unavailable",
        `the linked material ${`${inv.material_type || ""} ${inv.size || ""}`.trim() || "row"} has no usable cost_per_unit — update it in Master Inventory; the stored value prices material as $0`, "metal_catalog");
    }
  }

  return issues;
}

// ---------- calc wrapper ----------
// Returns { calc, issues, held }. The calc keeps the real result shape; when
// held, every derived number a flagged input could have tainted is null —
// saved acknowledged totals on the record are the display fallback, never an
// invented $0. Raw rows are untouched.
const TOTAL_FIELDS = [
  "totalMaterialsCost", "totalSuppliesCost", "totalFabricationCost",
  "totalWeldingCost", "totalFinishingCost", "totalLaborCost", "grandTotal",
];
const ITEM_HELD_FIELDS = [
  "material_cost", "fabrication_cost", "welding_cost", "finishing_cost",
  "supplies_cost", "materials_cost", "labor_cost", "labor_hours",
];

export function calcMetalProject(project = {}, { inventory = [], settings = {}, seeded = false } = {}) {
  const issues = [
    ...(seeded ? metalSettingIssues(settings) : []),
    ...metalRateIssues(project),
    ...((Array.isArray(project?.items) ? project.items : [])
      .flatMap((item, index) => metalItemIssues(item, index, inventory))),
    // metalRateIssues already covers a non-array items value; nothing else
    // project-level is priced.
  ];

  const calcable = Array.isArray(project?.items) ? project : { ...project, items: [] };
  const calc = computeMetalCalculations(calcable, inventory);
  const held = issues.length > 0;
  if (!held) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held };
  }

  const out = { ...calc };
  const hasProjectHold = issues.some((i) => i.hold === "project");
  const itemHolds = new Set(issues.filter((i) => i.hold === "item").map((i) => i.itemIndex));

  // Held items keep their raw row but lose every derived number — the totals
  // sum those numbers so every aggregate is untrustworthy too.
  out.enrichedItems = calc.enrichedItems.map((item, index) => {
    if (!hasProjectHold && !itemHolds.has(index)) return item;
    const heldItem = { ...item };
    for (const field of ITEM_HELD_FIELDS) heldItem[field] = null;
    return heldItem;
  });
  for (const field of TOTAL_FIELDS) out[field] = null;

  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held };
}

// ---------- UI helpers ----------
// Saved acknowledged pricing snapshot — only a real finite number counts.
// This is the gate for "Saved amounts (not current pricing)" display.
export const hasMetalCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);

// Blank-preserving input helper for number fields: "" stays "" so the input
// does not fight the user mid-typing; parseable text becomes a number;
// anything else stays raw so validation can flag it instead of laundering it
// into 0 (the page's parseFloat(...) || 0 silently read "" as 0 before).
export const metalDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

// Quantity variant — the remote input path truncated via parseInt, so a typed
// "2.7" stores 2 exactly as before; blanks stay blank; junk stays raw+flagged.
export const metalQuantityDraft = (raw) => {
  if (raw === "") return "";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : raw;
};

// All issues attached to a single field (optionally a single item row).
export const issuesForField = (issues = [], field, itemIndex = null) =>
  issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
export const hasIssueFor = (issues = [], field, itemIndex = null) =>
  issuesForField(issues, field, itemIndex).length > 0;
