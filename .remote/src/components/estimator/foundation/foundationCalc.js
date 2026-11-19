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

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const REBAR_LB_PER_FT = { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502, "#7": 2.044, "#8": 2.67 };

export function calcItem(item, project, inventory, settings = {}) {
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
export function calcEquipment(selected, inventory) {
  return (selected || []).map((entry) => {
    const eq = inventory.find((i) => i.id === entry.equipment_id);
    if (!eq) return { ...entry, equipment_cost: 0 };

    const rentalPeriod = entry.rental_period || "day";
    const durationOverride =
      entry.custom_qty !== undefined && entry.custom_qty !== null ? entry.custom_qty : entry.rental_duration || 1;

    const getRentalCost = (item, rateOverride) => {
      if (rateOverride !== undefined && rateOverride !== null) return rateOverride * durationOverride;
      if (rentalPeriod === "day") return num(item.cost_per_day) * durationOverride;
      if (rentalPeriod === "week") return num(item.cost_per_week) * durationOverride;
      if (rentalPeriod === "month") return num(item.cost_per_month) * durationOverride;
      return 0;
    };

    let entryTotal = getRentalCost(eq, entry.custom_rate);
    const deliveryCharge =
      entry.custom_delivery_charge !== undefined && entry.custom_delivery_charge !== null
        ? entry.custom_delivery_charge
        : num(eq.pickup_delivery_cost);
    if (entry.include_delivery) entryTotal += deliveryCharge;

    // Current CCS rows may use normalized `attachments[]`; SignEstimate Pro
    // also persisted attachment_counts / attachment_ids / sub_attachment_counts.
    // Honor every source storage shape so reopening an older configuration does
    // not silently drop equipment costs.
    if (entry.attachments?.length) {
      entry.attachments.forEach((att) => {
        const id = att.id || att.inventory_id;
        const a = inventory.find((i) => i.id === id);
        if (a) entryTotal += getRentalCost(a) * (att.qty || 1);
      });
    } else if (entry.attachment_counts) {
      Object.entries(entry.attachment_counts).forEach(([id, qty]) => {
        const a = inventory.find((i) => i.id === id && i.material_type === "attachment");
        if (a) entryTotal += getRentalCost(a) * num(qty, 0);
      });
    } else if (entry.attachment_ids?.length) {
      entry.attachment_ids.forEach((id) => {
        const a = inventory.find((i) => i.id === id && i.material_type === "attachment");
        if (a) entryTotal += getRentalCost(a);
      });
    }

    if (entry.sub_attachment_counts) {
      Object.entries(entry.sub_attachment_counts).forEach(([id, qty]) => {
        const sub = inventory.find((i) => i.id === id && i.material_type === "sub_attachment");
        if (sub) entryTotal += getRentalCost(sub) * num(qty, 0);
      });
    }

    return { ...entry, equipment_cost: entryTotal };
  });
}

export function calcProject(project, inventory, settings = {}) {
  const items = (project.items || []).map((item) => ({ ...item, ...calcItem(item, project, inventory, settings) }));
  const equipment = calcEquipment(project.selected_equipment, inventory);
  const delivery = calcConcreteDelivery(
    { ...project, settings },
    (project.items || []).map((i) => ({
      ...i,
      excavation_method: i.excavation_method || project.excavation_method,
    })),
    inventory
  );
  const walls = calcWalls(project, inventory, settings);
  const poles = calcPoles(project.poles, inventory, settings);
  const wallCaps = calcWallCaps(project.wall_caps, inventory);

  const sum = (key) => items.reduce((s, i) => s + num(i[key]), 0);

  const itemsTotal = sum("item_total_cost") + delivery.concreteTotal;
  const wallTotal = walls.reduce((s, w) => s + num(w.calculatedCosts?.totalCost), 0);
  const polesTotal = poles.reduce((s, p) => s + num(p.total_cost), 0);
  const equipmentTotal = equipment.reduce((s, e) => s + num(e.equipment_cost), 0);

  const totals = {
    // Bagged concrete is priced per item; ready-mix is priced per delivered truck.
    total_concrete_cost: sum("concrete_cost") + delivery.concreteTotal,
    concrete_delivery_cost: delivery.concreteTotal,
    concrete_delivered_yards: delivery.roundedYards,
    concrete_rate_per_yard: delivery.ratePerYard,
    concrete_trucks: delivery.trucksList,
    additional_stops_cost: delivery.additionalStopsCost,
    total_rebar_cost: sum("rebar_cost"),
    total_excavation_cost: sum("excavation_cost"),
    total_forming_materials_cost: sum("forming_cost"),
    total_labor_cost: sum("pouring_cost") + sum("finishing_cost"),
    total_pole_cost: poles.reduce((s, p) => s + num(p.pole_cost), 0),
    total_pole_painting_cost: poles.reduce((s, p) => s + num(p.pole_painting_cost), 0),
    total_brick_cost: walls.reduce((s, w) => s + num(w.calculatedCosts?.materialCost), 0),
    total_fill_cost: walls.reduce((s, w) => s + num(w.calculatedCosts?.internalMaterialCost), 0),
    total_equipment_cost: equipmentTotal,
    total_wall_cost: wallTotal,
    total_wall_cap_cost: wallCaps.total,
    wall_caps_by_material: wallCaps.byInventory,
    total_concrete_volume_cy: sum("concrete_volume_cy"),
    total_excavation_volume_cy: sum("excavation_volume_cy"),
    total_labor_hours: sum("finishing_hours") + sum("excavation_hours"),
  };

  totals.grand_total = itemsTotal + wallTotal + polesTotal + equipmentTotal + wallCaps.total;

  return { items, equipment, walls, poles, wallCaps: wallCaps.caps, totals, delivery };
}

export const money = (n) =>
  `$${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;