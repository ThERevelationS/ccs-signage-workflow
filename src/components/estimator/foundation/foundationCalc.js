// Cost engine for the Concrete | Masonry | Poles estimator.
// Concrete / rebar / forming / finishing / pouring / excavation math comes straight
// from SignEstimate Pro (legacyFoundationCalc.js) — do not re-derive it here.
// This file only adds the pole / wall / fill / equipment extras on top.

import { calcItemCost as legacyCalcItemCost, calcConcreteDelivery } from "./legacyFoundationCalc";
import { calcWalls } from "./wallCalculator";

const CF_PER_CY = 27;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const REBAR_LB_PER_FT = { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502, "#7": 2.044, "#8": 2.67 };

export function calcItem(item, project, inventory, settings = {}) {
  const qty = Math.max(1, num(item.quantity, 1));
  const isPillar = item.foundation_type === "pillar";
  const depth = num(item.depth_inches);
  const L = num(item.length_inches);
  const W = num(item.width_inches);
  const dia = num(item.diameter);

  // ── Legacy SignEstimate Pro math (already quantity-aware) ──
  const legacy = legacyCalcItemCost(item, inventory, settings);
  const concreteVolumeCy = legacy.volumeCY;
  const excavationVolumeCy = concreteVolumeCy * 1.25;
  const rebarFeet = legacy.rebarFt;
  const rebarSize = (isPillar ? item.pillar_rebar_size : item.rebar_size) || "#4";
  const rebarWeightLbs = rebarFeet * (REBAR_LB_PER_FT[rebarSize] || 0.668);

  // ── Pole ──
  let poleCost = 0;
  let polePaintingCost = 0;
  const poleRow = inventory.find((i) => i.id === item.selected_pole_id);
  if (poleRow) {
    const poleFt = num(item.pole_total_height_inches) / 12;
    if (poleRow.pole_pricing_mode === "stock_price") {
      const stockFt = num(poleRow.pole_stock_length_ft, 20) || 20;
      poleCost = Math.ceil(poleFt / stockFt) * num(poleRow.pole_stock_price);
    } else {
      poleCost = poleFt * num(poleRow.cost_per_unit);
    }
    if (item.include_pole_painting) {
      polePaintingCost = poleFt * num(poleRow.paint_rate_per_linear_ft);
    }
  }

  // ── Wall / brick material ──
  let brickCount = 0;
  let brickCost = 0;
  const brickRow = inventory.find((i) => i.id === item.selected_brick_id);
  if (item.include_wall_material && brickRow) {
    const gap = num(item.mortar_gap_inches, 0.375);
    const bl = num(brickRow.brick_length_inches, num(brickRow.wall_unit_length_inches, 8));
    const bh = num(brickRow.brick_height_inches, num(brickRow.wall_unit_height_inches, 4));
    const bw = num(brickRow.brick_width_inches, num(brickRow.wall_unit_width_inches, 4));
    const perCourse = Math.ceil(num(item.wall_length_inches) / (bl + gap));
    const courses = Math.ceil(num(item.wall_height_inches) / (bh + gap));
    const wythes = Math.max(1, Math.round(num(item.wall_width_inches, bw) / (bw || 1)));
    brickCount = Math.max(0, perCourse * courses * wythes);
    brickCost = brickCount * num(brickRow.cost_per_unit);
  }

  // ── Fill material ──
  let fillVolumeCy = 0;
  let fillCost = 0;
  const fillRow = inventory.find((i) => i.id === item.selected_fill_material_id);
  if (item.include_fill_material && fillRow) {
    fillVolumeCy =
      (num(item.wall_length_inches) * num(item.wall_width_inches) * num(item.wall_height_inches)) /
      1728 /
      CF_PER_CY;
    fillCost = fillVolumeCy * num(fillRow.cost_per_unit);
  }

  const extras = (poleCost + polePaintingCost + brickCost + fillCost) * qty;

  return {
    quantity: qty,
    concrete_volume_cy: concreteVolumeCy,
    excavation_volume_cy: excavationVolumeCy,
    concrete_bags: legacy.concreteBags,
    rebar_feet: rebarFeet,
    rebar_weight_lbs: rebarWeightLbs,
    concrete_cost: legacy.concreteCost,
    concrete_rate: legacy.concreteRate,
    rebar_cost: legacy.rebarCost,
    rebar_rate: legacy.rebarRate,
    excavation_cost: legacy.excavationCost,
    excavation_hours: legacy.excavationHours,
    forming_cost: legacy.formingCost,
    forming_qty: legacy.formingQty,
    forming_materials_cost: 0,
    pouring_cost: legacy.pouringCost,
    finishing_cost: legacy.finishingCost,
    finishing_hours: legacy.finishingHours,
    pole_cost: poleCost * qty,
    pole_painting_cost: polePaintingCost * qty,
    brick_count: brickCount * qty,
    brick_cost: brickCost * qty,
    fill_volume_cy: fillVolumeCy * qty,
    fill_cost: fillCost * qty,
    item_total_cost: legacy.total + extras,
  };
}

export function calcEquipment(selected, inventory) {
  return (selected || []).map((sel) => {
    const row = inventory.find((i) => i.id === sel.equipment_id);
    const duration = Math.max(1, num(sel.rental_duration, 1));
    const rate =
      sel.rental_period === "month"
        ? num(row?.cost_per_month)
        : sel.rental_period === "week"
        ? num(row?.cost_per_week)
        : num(row?.cost_per_day);
    const delivery = sel.include_delivery ? num(row?.pickup_delivery_cost) : 0;
    return { ...sel, equipment_cost: rate * duration + delivery };
  });
}

export function calcProject(project, inventory, settings = {}) {
  const items = (project.items || []).map((item) => ({ ...item, ...calcItem(item, project, inventory, settings) }));
  const equipment = calcEquipment(project.selected_equipment, inventory);
  const delivery = calcConcreteDelivery({ ...project, settings }, project.items || [], inventory);
  const walls = calcWalls(project, inventory, settings);

  const sum = (key) => items.reduce((s, i) => s + num(i[key]), 0);
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
    total_pole_cost: sum("pole_cost"),
    total_pole_painting_cost: sum("pole_painting_cost"),
    total_brick_cost: sum("brick_cost"),
    total_fill_cost: sum("fill_cost"),
    total_equipment_cost: equipment.reduce((s, e) => s + num(e.equipment_cost), 0),
    total_wall_cost: walls.reduce((s, w) => s + num(w.calculatedCosts?.totalCost), 0),
    total_concrete_volume_cy: sum("concrete_volume_cy"),
    total_excavation_volume_cy: sum("excavation_volume_cy"),
    total_labor_hours: sum("finishing_hours") + sum("excavation_hours"),
  };
  totals.grand_total =
    sum("item_total_cost") + totals.total_equipment_cost + delivery.concreteTotal + totals.total_wall_cost;

  return { items, equipment, walls, totals, delivery };
}

export const money = (n) =>
  `$${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;