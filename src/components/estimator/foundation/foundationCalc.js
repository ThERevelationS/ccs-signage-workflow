// Cost engine for the Concrete | Masonry | Poles estimator.
// All linear inputs are inches. Volumes are cubic yards.

const CF_PER_CY = 27;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const REBAR_LB_PER_FT = { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502, "#7": 2.044, "#8": 2.67 };

export function calcItem(item, project, inventory) {
  const qty = Math.max(1, num(item.quantity, 1));
  const isPillar = item.foundation_type === "pillar";
  const depth = num(item.depth_inches);
  const L = num(item.length_inches);
  const W = num(item.width_inches);
  const dia = num(item.diameter);
  const radius = dia / 2;

  // ── Geometry ──
  const topAreaSqIn = isPillar ? Math.PI * radius * radius : L * W;
  const perimeterIn = isPillar ? Math.PI * dia : 2 * (L + W);
  const volumeCf = (topAreaSqIn * depth) / 1728;
  const concreteVolumeCy = volumeCf / CF_PER_CY;
  const excavationVolumeCy =
    ((topAreaSqIn * (depth + num(item.grade_offset_inches))) / 1728 / CF_PER_CY) * 1.15;

  // ── Concrete ──
  const concreteRow = inventory.find((i) => i.id === item.selected_concrete_id);
  const concreteRate =
    num(item.custom_concrete_cost_per_cy) ||
    num(concreteRow?.cost_per_unit) ||
    num(project.concrete_cost_per_cy, 135);
  const concreteCost = concreteVolumeCy * concreteRate;

  // ── Excavation ──
  const method = item.excavation_method || project.excavation_method || "hand_dig";
  const isHandDig = method === "hand_dig";
  const excavationMaterialRate = isHandDig
    ? num(project.hand_dig_excavation_cost_per_cy, 10)
    : num(project.equipment_excavation_cost_per_cy, 15);
  const excavationLaborRate = isHandDig
    ? num(project.hand_dig_labor_rate, 45)
    : num(project.equipment_excavation_labor_rate, 35);
  const excavationHours = Math.max(
    num(project.min_excavation_time_hours, 1),
    excavationVolumeCy * (isHandDig ? 3 : 0.75)
  );
  const excavationCost =
    excavationVolumeCy * excavationMaterialRate + excavationHours * excavationLaborRate;

  // ── Rebar ──
  let rebarFeet = 0;
  if (item.include_rebar) {
    if (isPillar) {
      const hoopDia = num(item.pillar_rebar_hoop_diameter, Math.max(dia - 6, 6));
      const hoops = Math.max(1, Math.floor(depth / num(item.pillar_rebar_layer_separation_inches, 12)) + 1);
      rebarFeet += (Math.PI * hoopDia * hoops) / 12;
      rebarFeet += (num(item.pillar_vertical_rebar_count, 4) * depth) / 12;
    } else {
      const spacingL = num(item.rebar_spacing_length, 12) || 12;
      const spacingW = num(item.rebar_spacing_width, 12) || 12;
      const layers = Math.max(1, num(item.rebar_layers, 1));
      const barsAlongL = Math.floor(W / spacingW) + 1;
      const barsAlongW = Math.floor(L / spacingL) + 1;
      rebarFeet += ((barsAlongL * L + barsAlongW * W) / 12) * layers;
    }
  }
  const rebarSize = (isPillar ? item.pillar_rebar_size : item.rebar_size) || "#4";
  const rebarRow = inventory.find((i) => i.material_type === "rebar" && i.rebar_size === rebarSize);
  const rebarRate =
    num(item.custom_rebar_cost_per_ft) ||
    num(rebarRow?.cost_per_unit) ||
    num(project.rebar_cost_per_ft, 0.75);
  const rebarCost = rebarFeet * rebarRate;
  const rebarWeightLbs = rebarFeet * (REBAR_LB_PER_FT[rebarSize] || 0.668);

  // ── Forming ──
  const formAreaSqft = (perimeterIn * depth) / 144;
  const formingHours = item.include_forming ? formAreaSqft * 0.1 : 0;
  const formingCost = formingHours * num(project.forming_labor_rate, 55);
  const formingMaterialRate = isPillar
    ? num(project.forming_materials_cost_pillar, 0.75)
    : num(project.forming_materials_cost_spread_foot, 0.5);
  const formingMaterialsCost = item.include_forming ? formAreaSqft * formingMaterialRate : 0;

  // ── Pouring & finishing ──
  const pouringHours = Math.max(0.5, concreteVolumeCy * 0.5);
  const pouringCost = pouringHours * num(project.pouring_labor_rate, 60);
  const topAreaSqft = topAreaSqIn / 144;
  const finishingHours = item.include_finishing ? topAreaSqft * 0.05 : 0;
  const finishingCost = finishingHours * num(project.finishing_labor_rate, 50);

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

  const perUnit =
    concreteCost +
    rebarCost +
    excavationCost +
    formingCost +
    formingMaterialsCost +
    pouringCost +
    finishingCost +
    poleCost +
    polePaintingCost +
    brickCost +
    fillCost;

  return {
    quantity: qty,
    concrete_volume_cy: concreteVolumeCy * qty,
    excavation_volume_cy: excavationVolumeCy * qty,
    rebar_feet: rebarFeet * qty,
    rebar_weight_lbs: rebarWeightLbs * qty,
    concrete_cost: concreteCost * qty,
    rebar_cost: rebarCost * qty,
    excavation_cost: excavationCost * qty,
    excavation_hours: excavationHours * qty,
    forming_hours: formingHours * qty,
    forming_cost: formingCost * qty,
    forming_materials_cost: formingMaterialsCost * qty,
    pouring_hours: pouringHours * qty,
    pouring_cost: pouringCost * qty,
    finishing_hours: finishingHours * qty,
    finishing_cost: finishingCost * qty,
    pole_cost: poleCost * qty,
    pole_painting_cost: polePaintingCost * qty,
    brick_count: brickCount * qty,
    brick_cost: brickCost * qty,
    fill_volume_cy: fillVolumeCy * qty,
    fill_cost: fillCost * qty,
    item_total_cost: perUnit * qty,
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

export function calcProject(project, inventory) {
  const items = (project.items || []).map((item) => ({ ...item, ...calcItem(item, project, inventory) }));
  const equipment = calcEquipment(project.selected_equipment, inventory);

  const sum = (key) => items.reduce((s, i) => s + num(i[key]), 0);
  const totals = {
    total_concrete_cost: sum("concrete_cost"),
    total_rebar_cost: sum("rebar_cost"),
    total_excavation_cost: sum("excavation_cost"),
    total_forming_materials_cost: sum("forming_materials_cost"),
    total_labor_cost: sum("forming_cost") + sum("pouring_cost") + sum("finishing_cost"),
    total_pole_cost: sum("pole_cost"),
    total_pole_painting_cost: sum("pole_painting_cost"),
    total_brick_cost: sum("brick_cost"),
    total_fill_cost: sum("fill_cost"),
    total_equipment_cost: equipment.reduce((s, e) => s + num(e.equipment_cost), 0),
    total_concrete_volume_cy: sum("concrete_volume_cy"),
    total_excavation_volume_cy: sum("excavation_volume_cy"),
    total_labor_hours:
      sum("forming_hours") + sum("pouring_hours") + sum("finishing_hours") + sum("excavation_hours"),
  };
  totals.grand_total = sum("item_total_cost") + totals.total_equipment_cost;

  return { items, equipment, totals };
}

export const money = (n) =>
  `$${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;