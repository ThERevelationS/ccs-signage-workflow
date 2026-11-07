// Cost engine for the Concrete | Masonry | Poles estimator.
//
// All math is ported from SignEstimate Pro and must stay identical to it:
//  - per-item concrete / rebar / forming / finishing / pouring / excavation → legacyFoundationCalc.js
//  - project concrete delivery (trucks, fees, stops)                        → legacyFoundationCalc.js
//  - masonry walls (outer + internal fill wall)                            → wallCalculator.js
//  - poles + pole painting                                                  → poleCalculator.js
//  - wall caps (full stock charged per cut piece)                           → wallCapCalculator.js
//
// Rollup (verbatim from SignEstimate Pro `totals`):
//   grand = itemsTotal(+concrete delivery) + wallTotal + polesTotal + equipmentTotal + wallCapTotal
// Poles, walls, caps and fill are PROJECT-level — they are never charged on a foundation item.

import { calcItemCost as legacyCalcItemCost, calcConcreteDelivery } from "./legacyFoundationCalc";
import { calcWalls } from "./wallCalculator";
import { calcPoles } from "./poleCalculator";
import { calcWallCaps } from "./wallCapCalculator";
import { foundationAssemblyCatalogIssues, foundationItemCatalogIssues, hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { resolveFoundationEquipment } from "./foundationEquipmentBindings";
import { foundationItemInputIssues, foundationProjectInputIssues, signageCabinetInputIssues } from "./foundationInputValidation";
import { landscapeSummary } from "./landscapeMaterials";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const REBAR_LB_PER_FT = { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502, "#7": 2.044, "#8": 2.67 };

const ITEM_SNAPSHOT_FIELDS = [
  "concrete_volume_cy", "excavation_volume_cy", "concrete_bags", "rebar_feet", "rebar_weight_lbs",
  "concrete_cost", "concrete_rate", "rebar_cost", "rebar_rate", "excavation_cost", "excavation_hours",
  "forming_cost", "forming_qty", "pouring_cost", "finishing_cost", "finishing_hours", "item_total_cost",
];

export function calcItem(item, project, inventory, settings = {}, savedItem = item) {
  const inputIssues = foundationItemInputIssues(item);
  if (inputIssues.length || foundationItemCatalogIssues(item, inventory).length) {
    return {
      quantity: inputIssues.length ? item.quantity : Math.max(1, num(item.quantity, 1)),
      ...Object.fromEntries(ITEM_SNAPSHOT_FIELDS.map(key => [
        key, hasFoundationCostSnapshot(savedItem?.[key]) ? savedItem[key] : undefined,
      ])),
    };
  }
  // Items without their own excavation method fall back to the project default.
  const legacy = legacyCalcItemCost(
    { ...item, excavation_method: item.excavation_method || project?.excavation_method },
    inventory,
    settings
  );
  const isPillar = item.foundation_type === "pillar";
  const rebarSize = (isPillar ? item.pillar_rebar_size : item.rebar_size) || "#4";

  return {
    quantity: Math.max(1, num(item.quantity, 1)),
    concrete_volume_cy: legacy.volumeCY,
    excavation_volume_cy: legacy.volumeCY * 1.25,
    concrete_bags: legacy.concreteBags,
    rebar_feet: legacy.rebarFt,
    rebar_weight_lbs: legacy.rebarFt * (REBAR_LB_PER_FT[rebarSize] || 0.668),
    concrete_cost: legacy.concreteCost,
    concrete_rate: legacy.concreteRate,
    rebar_cost: legacy.rebarCost,
    rebar_rate: legacy.rebarRate,
    excavation_cost: legacy.excavationCost,
    excavation_hours: legacy.excavationHours,
    forming_cost: legacy.formingCost,
    forming_qty: legacy.formingQty,
    pouring_cost: legacy.pouringCost,
    finishing_cost: legacy.finishingCost,
    finishing_hours: legacy.finishingHours,
    item_total_cost: legacy.total,
  };
}

// Equipment rental — ported from SignEstimate Pro `equipmentTotal`.
//
// Availability hardening: a missing catalog rental price, unrecognized rental
// period, malformed duration/quantity override, or bad attachment quantity is
// not a free or crashed rental — the row is held with its acknowledged
// equipment_cost and reported instead of silently repricing to $0 (the ported
// `num()`/`|| 1` picks laundered missing and malformed values into guessed
// amounts, and an unpriced row could throw or persist NaN). Only values the
// ported math actually consumes are validated — an inactive override or a
// zero-count legacy attachment row bills nothing and is ignored.
const RENTAL_PERIODS = ["day", "week", "month"];

const equipmentAssignedId = value => (typeof value === "string" && value.trim() !== "")
  || (typeof value === "number" && Number.isFinite(value));

const equipmentComponentId = (entry) => {
  const id = entry?.component_id ?? entry?._id;
  return equipmentAssignedId(id) ? id : null;
};

// Catalog/customer price basis: finite, nonnegative — an explicit 0 is a
// legitimate free rental or delivery rate.
const equipmentPriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string"
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

// Rental duration, custom quantity, and attachment counts multiply a period
// rate — they must be finite positive. A recorded 0 is not a legitimate
// duration: it bills nothing, and the ported `|| 1` silently repriced it to a
// single period, so the draft is held for review instead of guessed.
const equipmentPositiveNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string"
    || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

// Resolves every value the ported rental math consumes on a normalized
// calculation copy — authored entries and inventory rows are never mutated.
function equipmentPricing(entry, bindings, index) {
  const issues = [...bindings.issues];
  const eq = bindings.equipment;
  const add = (kind, field, inventoryId, code, message) => issues.push({
    kind, index, componentId: entry?.component_id ?? entry?._id ?? null,
    field, inventoryId: inventoryId ?? null, code,
    message: `Equipment ${index + 1}: ${message}.`,
  });
  const customQtyOn = entry?.custom_qty !== undefined && entry?.custom_qty !== null;
  const customRateOn = entry?.custom_rate !== undefined && entry?.custom_rate !== null;
  // Zero-count legacy keys may point at removed records and are not rented.
  const rentedRows = (rows) => (rows || []).filter((row) => row.inventory && row.quantity !== 0);
  // The rental period picks which catalog rate is read; an explicit custom rate
  // covers the base item, so the period is only consumed when it still prices
  // the base or at least one rented attachment row.
  const periodDriven = !customRateOn
    || rentedRows(bindings.attachmentRows).length > 0
    || rentedRows(bindings.subAttachmentRows).length > 0;
  const rentalPeriod = entry?.rental_period || "day";
  const periodField = RENTAL_PERIODS.includes(rentalPeriod) ? `cost_per_${rentalPeriod}` : null;
  if (periodDriven && periodField === null) {
    add("equipment", "rental_period", eq?.id ?? null, "equipment_period_unavailable",
      "select a daily, weekly, or monthly rental period before repricing");
  }

  // Duration basis: a custom quantity override wins over the recorded duration;
  // blank/absent duration keeps the ported one-period default.
  let duration = null;
  if (customQtyOn) {
    duration = equipmentPositiveNumber(entry.custom_qty);
    if (duration === null) {
      add("equipment", "custom_qty", eq?.id ?? null, "custom_qty_unavailable",
        "record a finite, positive custom quantity or clear the override before repricing");
    }
  } else {
    duration = entry?.rental_duration === undefined || entry?.rental_duration === null || entry?.rental_duration === ""
      ? 1
      : equipmentPositiveNumber(entry.rental_duration);
    if (duration === null) {
      add("equipment", "rental_duration", eq?.id ?? null, "equipment_duration_unavailable",
        "record a finite, positive rental duration or clear it before repricing");
    }
  }

  // Rate basis: an explicit custom rate wins over the catalog period price; an
  // explicit 0 rate is a legitimate free rental.
  let rate = null;
  if (customRateOn) {
    rate = equipmentPriceNumber(entry.custom_rate);
    if (rate === null) {
      add("equipment", "custom_rate", eq?.id ?? null, "custom_rate_unavailable",
        "record a finite, nonnegative custom rate or clear the override before repricing");
    }
  } else if (eq && periodField !== null) {
    rate = equipmentPriceNumber(eq[periodField]);
    if (rate === null) {
      add("equipment", periodField, eq.id ?? null, "equipment_price_unavailable",
        `record a finite, nonnegative catalog ${rentalPeriod} rental price before repricing`);
    }
  }

  // Delivery charge is only consumed when the entry includes delivery.
  let deliveryCharge = null;
  if (entry?.include_delivery) {
    const customDeliveryOn = entry?.custom_delivery_charge !== undefined && entry?.custom_delivery_charge !== null;
    if (customDeliveryOn) {
      deliveryCharge = equipmentPriceNumber(entry.custom_delivery_charge);
      if (deliveryCharge === null) {
        add("equipment", "custom_delivery_charge", eq?.id ?? null, "custom_delivery_charge_unavailable",
          "record a finite, nonnegative custom delivery charge or clear the override before repricing");
      }
    } else if (eq) {
      deliveryCharge = equipmentPriceNumber(eq.pickup_delivery_cost);
      if (deliveryCharge === null) {
        add("equipment", "pickup_delivery_cost", eq.id ?? null, "equipment_delivery_price_unavailable",
          "record a finite, nonnegative catalog delivery charge before repricing");
      }
    }
  }

  // Rented attachment rows consume the same period rate and duration. A row
  // without a resolved catalog row is already reported by the bindings scan.
  // Legacy count maps pass through the bindings num() fallback, which launders
  // malformed entries to 0 — read the authored count for validation instead.
  const rawQuantity = (row) =>
    (row.field === "attachment_counts" || row.field === "sub_attachment_counts")
      ? entry?.[row.field]?.[row.id]
      : row.quantity;
  const priceRows = (rows, kind) => (rows || []).map((row) => {
    const quantity = !row.inventory ? 0 : rawQuantity(row);
    if (!row.inventory || Number(quantity) === 0) return { row, skipped: true };
    const parsedQuantity = equipmentPositiveNumber(quantity);
    if (parsedQuantity === null) {
      add(kind, row.field, row.id ?? null, "equipment_attachment_qty_unavailable",
        `record a finite, positive ${kind.replaceAll("_", " ")} quantity or clear it before repricing`);
      return { row, quantity: null, rate: null };
    }
    const rowRate = periodField === null ? null : equipmentPriceNumber(row.inventory[periodField]);
    if (periodField !== null && rowRate === null) {
      add(kind, periodField, row.id ?? null, "equipment_price_unavailable",
        `record a finite, nonnegative catalog ${rentalPeriod} price for the selected ${kind.replaceAll("_", " ")} before repricing`);
    }
    return { row, quantity: parsedQuantity, rate: rowRate };
  });

  return {
    issues, equipment: eq, rentalPeriod, duration, rate, deliveryCharge,
    attachmentLines: priceRows(bindings.attachmentRows, "attachment"),
    subAttachmentLines: priceRows(bindings.subAttachmentRows, "sub_attachment"),
  };
}

export function calcEquipmentPricing(selected, inventory = [], options = {}) {
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedEquipment");
  const savedEquipment = Array.isArray(options?.savedEquipment) ? options.savedEquipment : [];
  const counts = rows => {
    const out = new Map();
    for (const row of rows || []) {
      const id = equipmentComponentId(row);
      if (id !== null) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(selected), savedCounts = counts(savedEquipment);
  const savedById = new Map(savedEquipment.filter(row => equipmentComponentId(row) !== null)
    .map(row => [equipmentComponentId(row), row]));
  // Preserve the last saved amount, not a fabricated free rental. The project
  // availability gate prevents these historical values becoming a new quote.
  const held = entry => {
    const result = { ...entry };
    if (!explicitSnapshot) return result;
    const id = equipmentComponentId(entry);
    const saved = id !== null && currentCounts.get(id) === 1 && savedCounts.get(id) === 1
      ? savedById.get(id) : null;
    if (saved && Object.prototype.hasOwnProperty.call(saved, "equipment_cost")) result.equipment_cost = saved.equipment_cost;
    else delete result.equipment_cost;
    return result;
  };
  return (selected || []).map((storedEntry, index) => {
    const entry = storedEntry || {};
    const bindings = resolveFoundationEquipment(entry, inventory, index);
    const check = equipmentPricing(entry, bindings, index);
    const context = { ...bindings, issues: check.issues, rentalPeriod: check.rentalPeriod, duration: check.duration };
    if (check.issues.length) {
      const pricedEntry = held(entry);
      return {
        ...context, pricedEntry, baseCost: null, deliveryCost: null,
        totalCost: hasFoundationCostSnapshot(pricedEntry.equipment_cost) ? pricedEntry.equipment_cost : null,
        attachmentRows: bindings.attachmentRows.map(row => ({ ...row, cost: null })),
        subAttachmentRows: bindings.subAttachmentRows.map(row => ({ ...row, cost: null })),
      };
    }

    const baseCost = check.rate * check.duration;
    let entryTotal = baseCost;
    if (entry.include_delivery) entryTotal += check.deliveryCharge;

    const pricedLines = lines => lines.map(line => {
      if (line.skipped) return { ...line.row, cost: 0 };
      const cost = line.rate * check.duration * line.quantity;
      entryTotal += cost;
      return { ...line.row, cost };
    });
    const attachmentRows = pricedLines(check.attachmentLines);
    const subAttachmentRows = pricedLines(check.subAttachmentLines);
    return {
      ...context, pricedEntry: { ...entry, equipment_cost: entryTotal },
      baseCost, deliveryCost: entry.include_delivery ? check.deliveryCharge : 0,
      attachmentRows, subAttachmentRows, totalCost: entryTotal,
    };
  });
}

export function calcEquipment(selected, inventory = [], options = {}) {
  return calcEquipmentPricing(selected, inventory, options).map(row => row.pricedEntry);
}

// A missing snapshot is not evidence of a free rental: any row without a
// finite equipment_cost withholds the total instead of laundered to $0.
export function equipmentCostTotal(pricedEntries = []) {
  let total = 0;
  for (const entry of pricedEntries || []) {
    if (!hasFoundationCostSnapshot(entry?.equipment_cost)) return null;
    total += entry.equipment_cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}

// Signage cabinets — availability-hardened rollup of the ported page math
// (`unit_cost * quantity` per row). Only values the ported formula consumes are
// validated by signageCabinetInputIssues: an absent quantity keeps the ported
// single-cabinet default, an explicit 0 unit cost is a legitimate free cabinet,
// and a recorded 0 quantity — which billed nothing while `|| 1` silently
// repriced it to one — is unavailable, not guessed.
export function calcSignageCabinetPricing(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : []).map((cabinet, index) => {
    const issues = signageCabinetInputIssues(cabinet, index);
    const entry = { ...(cabinet ?? {}) };
    if (issues.length) return { available: false, issues, cost: null, pricedEntry: entry };
    const quantity = entry.quantity === undefined || entry.quantity === null || entry.quantity === ""
      ? 1
      : Number(entry.quantity);
    const cost = Number(entry.unit_cost) * quantity;
    return { available: true, issues, cost, pricedEntry: entry };
  });
}

// A held row is not a $0 line: any row without a finite cost withholds the
// cabinet subtotal instead of laundering it to $0.
export function signageCabinetCostTotal(pricedRows = []) {
  let total = 0;
  for (const row of pricedRows || []) {
    if (!hasFoundationCostSnapshot(row?.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}

export function captureConcreteDeliverySnapshot(delivery) {
  return {
    version: 1, concrete_total: delivery.concreteTotal, rounded_yards: delivery.roundedYards,
    rate_per_yard: delivery.ratePerYard, additional_stops_cost: delivery.additionalStopsCost,
    trucks: delivery.trucksList.map(truck => ({
      yards: truck.yards, rounded_yards: truck.roundedYards, cost: truck.cost,
      small_order_fee: truck.smallOrderFee, fuel_fee: truck.fuelFee,
    })),
  };
}

function savedConcreteDelivery(project) {
  const snapshot = project?.concrete_delivery_snapshot?.version === 1 ? project.concrete_delivery_snapshot : null;
  const value = (record, key) => hasFoundationCostSnapshot(record?.[key]) ? record[key] : undefined;
  return {
    pricingUnavailable: true,
    concreteTotal: value(snapshot, "concrete_total"), roundedYards: value(snapshot, "rounded_yards"),
    ratePerYard: value(snapshot, "rate_per_yard"), additionalStopsCost: value(snapshot, "additional_stops_cost"),
    trucksList: (Array.isArray(snapshot?.trucks) ? snapshot.trucks : []).map(truck => ({
      yards: value(truck, "yards"), roundedYards: value(truck, "rounded_yards"), cost: value(truck, "cost"),
      smallOrderFee: value(truck, "small_order_fee"), fuelFee: value(truck, "fuel_fee"),
    })),
    availableMixes: [], availableAdmixes: [],
  };
}

export function calcProject(project, inventory, settings = {}, options = {}) {
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options, "savedProject");
  const savedProject = !explicitSnapshot ? project
    : project.id !== undefined && project.id !== null && project.id !== "" && options.savedProject?.id === project.id
      ? options.savedProject : null;
  const sourceItems = project.items || [];
  const savedItems = new Map();
  const currentIds = new Map();
  for (const item of savedProject?.items || []) {
    if (item.component_id) savedItems.set(item.component_id, savedItems.has(item.component_id) ? null : item);
  }
  for (const item of sourceItems) currentIds.set(item.component_id, (currentIds.get(item.component_id) || 0) + 1);
  // Pole and wall availability issues come from their pricing checks; the
  // assembly integrity scan keeps its guards for other callers but both kinds
  // are filtered here so each issue is reported once from a single source.
  const poleCalc = calcPoles(project.poles, inventory, settings,
    explicitSnapshot ? { savedPoles: savedProject?.poles ?? [] } : {});
  const wallCalc = calcWalls(project, inventory, settings,
    explicitSnapshot ? { savedWalls: savedProject?.walls ?? [] } : {});
  const equipmentCalc = calcEquipmentPricing(project.selected_equipment, inventory,
    explicitSnapshot ? { savedEquipment: savedProject?.selected_equipment ?? [] } : {});
  const equipmentPricing = equipmentCalc.map((row) => ({ available: row.issues.length === 0, issues: row.issues }));
  const catalogIssues = [
    ...poleCalc.polePricing.flatMap((entry) => entry.issues),
    ...wallCalc.wallPricing.flatMap((entry) => entry.issues),
    ...equipmentPricing.flatMap((entry) => entry.issues),
    ...foundationAssemblyCatalogIssues(project, inventory)
      .filter((issue) => !["pole", "wall", "internal_wall", "equipment", "attachment", "sub_attachment"].includes(issue.kind)),
  ];
  const inputIssues = foundationProjectInputIssues(project);
  const cabinetCalc = calcSignageCabinetPricing(project.signage_cabinets);
  const signageCabinetPricing = cabinetCalc.map((row) => ({ available: row.available, issues: row.issues }));
  const landscapeCalc = landscapeSummary(project.landscape);
  const landscapeIssues = inputIssues.filter((issue) => issue.kind === "landscape");
  const landscapePricing = { available: landscapeIssues.length === 0, issues: landscapeIssues };
  const itemPricing = sourceItems.map((item, index) => {
    const issues = [
      ...catalogIssues.filter(issue => issue.kind === "foundation" && issue.index === index),
      ...inputIssues.filter(issue => issue.kind === "foundation" && issue.index === index),
    ];
    return { available: issues.length === 0, issues };
  });
  const items = sourceItems.map((item) => {
    const savedItem = !explicitSnapshot ? item
      : item.component_id && currentIds.get(item.component_id) === 1 ? savedItems.get(item.component_id) || null : null;
    return { ...item, ...calcItem(item, project, inventory, settings, savedItem) };
  });
  const equipment = equipmentCalc.map(row => row.pricedEntry);
  // An incomplete item has saved quantities, so its coupled order must not be
  // repriced. The same acknowledged-snapshot hold applies when the concrete
  // supplier's catalog prices are unavailable — the ported `??` defaults
  // guessed retail numbers instead of refusing to price.
  const deliveryCheck = itemPricing.some(item => !item.available) ? null : calcConcreteDelivery(
    { ...project, settings },
    (project.items || []).map((i) => ({
      ...i,
      excavation_method: i.excavation_method || project.excavation_method,
    })),
    inventory
  );
  const delivery = deliveryCheck === null || deliveryCheck.pricingUnavailable === true
    ? savedConcreteDelivery(savedProject)
    : deliveryCheck;
  if (deliveryCheck?.issues?.length) catalogIssues.push(...deliveryCheck.issues);
  const walls = wallCalc.walls;
  const poles = poleCalc.poles;
  const wallCaps = calcWallCaps(project.wall_caps, inventory,
    explicitSnapshot ? { savedCaps: savedProject?.wall_caps ?? [] } : {});

  const sum = (key) => items.some((item, index) => !itemPricing[index].available && !hasFoundationCostSnapshot(item[key]))
    ? null : items.reduce((s, i) => s + num(i[key]), 0);
  const addKnown = (a, b) => hasFoundationCostSnapshot(a) && hasFoundationCostSnapshot(b) ? a + b : null;
  const category = (key, value) => value !== null ? value
    : hasFoundationCostSnapshot(savedProject?.[key]) ? savedProject[key] : null;

  const itemsTotal = addKnown(sum("item_total_cost"), delivery.concreteTotal);
  const sumWall = key => {
    let total = 0;
    for (const wall of walls) {
      const value = wall.calculatedCosts?.[key];
      if (!hasFoundationCostSnapshot(value)) return null;
      total += value;
      if (!Number.isFinite(total)) return null;
    }
    return total;
  };
  const wallTotal = sumWall("totalCost");
  const sumPole = key => {
    let total = 0;
    for (const pole of poles) {
      const value = pole?.[key];
      if (!hasFoundationCostSnapshot(value)) return null;
      total += value;
      if (!Number.isFinite(total)) return null;
    }
    return total;
  };
  const polesTotal = sumPole("total_cost");
  const equipmentTotal = equipmentCostTotal(equipment);

  const totals = {
    // Bagged concrete is priced per item; ready-mix is priced per delivered truck.
    total_concrete_cost: category("total_concrete_cost", addKnown(sum("concrete_cost"), delivery.concreteTotal)),
    concrete_delivery_cost: delivery.concreteTotal,
    concrete_delivered_yards: delivery.roundedYards,
    concrete_rate_per_yard: delivery.ratePerYard,
    concrete_trucks: delivery.trucksList,
    additional_stops_cost: delivery.additionalStopsCost,
    total_rebar_cost: category("total_rebar_cost", sum("rebar_cost")),
    total_excavation_cost: category("total_excavation_cost", sum("excavation_cost")),
    total_forming_materials_cost: category("total_forming_materials_cost", sum("forming_cost")),
    total_labor_cost: category("total_labor_cost", addKnown(sum("pouring_cost"), sum("finishing_cost"))),
    total_pole_cost: category("total_pole_cost", sumPole("pole_cost")),
    total_pole_painting_cost: category("total_pole_painting_cost", sumPole("pole_painting_cost")),
    total_brick_cost: sumWall("materialCost"),
    total_fill_cost: sumWall("internalMaterialCost"),
    total_equipment_cost: category("total_equipment_cost", equipmentTotal),
    total_wall_cost: wallTotal,
    total_wall_cap_cost: wallCaps.total,
    wall_caps_by_material: wallCaps.byInventory,
    total_concrete_volume_cy: sum("concrete_volume_cy"),
    total_excavation_volume_cy: sum("excavation_volume_cy"),
    total_labor_hours: addKnown(sum("finishing_hours"), sum("excavation_hours")),
    // Page-level extras: held at the acknowledged project totals when the
    // recorded rows cannot be repriced — a null here is "unavailable", never $0.
    total_signage_cabinet_cost: category("total_signage_cabinet_cost", signageCabinetCostTotal(cabinetCalc)),
    total_landscape_cost: category("total_landscape_cost", landscapeIssues.length ? null : landscapeCalc.total),
  };

  totals.grand_total = itemsTotal === null || wallTotal === null || polesTotal === null || equipmentTotal === null || wallCaps.total === null ? null : itemsTotal + wallTotal + polesTotal + equipmentTotal + wallCaps.total;

  return {
    items, equipment, walls, poles, wallCaps: wallCaps.caps, totals, delivery, itemPricing, polePricing: poleCalc.polePricing, wallPricing: wallCalc.wallPricing, equipmentPricing, signageCabinetPricing, landscapePricing, catalogIssues, inputIssues,
  };
}

export const money = (n) =>
  `$${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
