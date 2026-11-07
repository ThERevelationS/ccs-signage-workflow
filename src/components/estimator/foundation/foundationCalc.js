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
import { foundationItemInputIssues, foundationProjectInputIssues } from "./foundationInputValidation";

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
export function calcEquipmentPricing(selected, inventory = []) {
  return (selected || []).map((storedEntry, index) => {
    const entry = storedEntry || {};
    const bindings = resolveFoundationEquipment(entry, inventory, index);
    const eq = bindings.equipment;
    const rentalPeriod = entry.rental_period || "day";
    const durationOverride =
      entry.custom_qty !== undefined && entry.custom_qty !== null ? entry.custom_qty : entry.rental_duration || 1;
    const context = { ...bindings, rentalPeriod, duration: durationOverride };
    if (bindings.issues.length) {
      return {
        ...context, pricedEntry: { ...entry }, baseCost: null, deliveryCost: null,
        totalCost: entry.equipment_cost,
        attachmentRows: bindings.attachmentRows.map(row => ({ ...row, cost: null })),
        subAttachmentRows: bindings.subAttachmentRows.map(row => ({ ...row, cost: null })),
      };
    }

    const getRentalCost = (item, rateOverride) => {
      if (rateOverride !== undefined && rateOverride !== null) return rateOverride * durationOverride;
      if (rentalPeriod === "day") return num(item.cost_per_day) * durationOverride;
      if (rentalPeriod === "week") return num(item.cost_per_week) * durationOverride;
      if (rentalPeriod === "month") return num(item.cost_per_month) * durationOverride;
      return 0;
    };

    const baseCost = getRentalCost(eq, entry.custom_rate);
    let entryTotal = baseCost;
    const deliveryCharge =
      entry.custom_delivery_charge !== undefined && entry.custom_delivery_charge !== null
        ? entry.custom_delivery_charge
        : num(eq.pickup_delivery_cost);
    if (entry.include_delivery) entryTotal += deliveryCharge;

    const pricedLines = rows => rows.map(row => {
      // Zero-count legacy keys may point at removed records and are not rented.
      if (!row.inventory) return { ...row, cost: 0 };
      const cost = getRentalCost(row.inventory) * row.quantity;
      entryTotal += cost;
      return { ...row, cost };
    });
    const attachmentRows = pricedLines(bindings.attachmentRows);
    const subAttachmentRows = pricedLines(bindings.subAttachmentRows);
    return {
      ...context, pricedEntry: { ...entry, equipment_cost: entryTotal },
      baseCost, deliveryCost: entry.include_delivery ? deliveryCost : 0,
      attachmentRows, subAttachmentRows, totalCost: entryTotal,
    };
  });
}

export function calcEquipment(selected, inventory = []) {
  return calcEquipmentPricing(selected, inventory).map(row => row.pricedEntry);
}

export function equipmentCostTotal(pricedEntries = []) {
  return pricedEntries.reduce((sum, entry) => sum + num(entry.equipment_cost), 0);
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
  const catalogIssues = [
    ...poleCalc.polePricing.flatMap((entry) => entry.issues),
    ...wallCalc.wallPricing.flatMap((entry) => entry.issues),
    ...foundationAssemblyCatalogIssues(project, inventory)
      .filter((issue) => issue.kind !== "pole" && issue.kind !== "wall" && issue.kind !== "internal_wall"),
  ];
  const inputIssues = foundationProjectInputIssues(project);
  const itemPricing = sourceItems.map((item, index) => {
    const issues = [
      ...catalogIssues.filter(issue => issue.kind === "foundation" && issue.index === index),
      ...inputIssues.filter(issue => issue.index === index),
    ];
    return { available: issues.length === 0, issues };
  });
  const items = sourceItems.map((item) => {
    const savedItem = !explicitSnapshot ? item
      : item.component_id && currentIds.get(item.component_id) === 1 ? savedItems.get(item.component_id) || null : null;
    return { ...item, ...calcItem(item, project, inventory, settings, savedItem) };
  });
  const equipment = calcEquipment(project.selected_equipment, inventory);
  // An incomplete item has saved quantities, so its coupled order must not be repriced.
  const delivery = itemPricing.some(item => !item.available) ? savedConcreteDelivery(savedProject) : calcConcreteDelivery(
    { ...project, settings },
    (project.items || []).map((i) => ({
      ...i,
      excavation_method: i.excavation_method || project.excavation_method,
    })),
    inventory
  );
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
    total_equipment_cost: equipmentTotal,
    total_wall_cost: wallTotal,
    total_wall_cap_cost: wallCaps.total,
    wall_caps_by_material: wallCaps.byInventory,
    total_concrete_volume_cy: sum("concrete_volume_cy"),
    total_excavation_volume_cy: sum("excavation_volume_cy"),
    total_labor_hours: addKnown(sum("finishing_hours"), sum("excavation_hours")),
  };

  totals.grand_total = itemsTotal === null || wallTotal === null || polesTotal === null || wallCaps.total === null ? null : itemsTotal + wallTotal + polesTotal + equipmentTotal + wallCaps.total;

  return {
    items, equipment, walls, poles, wallCaps: wallCaps.caps, totals, delivery, itemPricing, polePricing: poleCalc.polePricing, wallPricing: wallCalc.wallPricing, catalogIssues, inputIssues,
  };
}

export const money = (n) =>
  `$${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
