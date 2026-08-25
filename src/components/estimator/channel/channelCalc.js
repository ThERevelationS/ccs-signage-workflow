import { sizeMeta, DIFFICULTY_FACTORS, EQUIPMENT_DURATION_FIELD } from "./channelConstants";

// Channel & Dimensional Letters cost engine.
// items:  [{ install_type, letter_size, qty_letters, install_height_feet, raceway_length_feet,
//            minutes_per_letter_override, thick_hollow_walls, parapet, poor_electrical_access,
//            materials: [{ inventory_id, quantity }] }]
// letter_purchases: [{ description, vendor, qty, unit_cost }]

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function materialCost(mat, item) {
  if (!mat) return 0;
  const meta = sizeMeta(item.letter_size);
  switch (mat.pricing_mode) {
    case "per_letter_flat":
      return num(mat.cost_per_letter) * num(item.qty_letters, 1);
    case "per_letter_by_size":
      return num(mat[meta.costKey]) * num(item.qty_letters, 1);
    case "per_raceway_foot":
      return num(mat.cost_per_foot) * num(item.raceway_length_feet);
    case "per_project_flat":
    default:
      return num(mat.cost_flat);
  }
}

export function equipmentCost(equipment, selection) {
  if (!equipment) return { unit_cost: 0, idle_cost: 0, total_cost: 0 };
  const mode = EQUIPMENT_DURATION_FIELD[equipment.pricing_mode] || EQUIPMENT_DURATION_FIELD.per_day;
  const unit_cost = num(equipment[mode.costKey]);
  const base = mode.scales ? unit_cost * num(selection.duration, 1) : unit_cost;
  const idle_cost = num(selection.idle_hours) * num(equipment.idle_running_cost_per_hour);
  const delivery = selection.include_delivery ? num(equipment.delivery_pickup_cost) : 0;
  return { unit_cost, idle_cost, total_cost: base + idle_cost + delivery };
}

export function calcChannelProject(project, inventory, equipmentCatalog) {
  const invMap = new Map((inventory || []).map((m) => [m.id, m]));
  const eqMap = new Map((equipmentCatalog || []).map((e) => [e.id, e]));
  const laborRate = num(project.labor_rate_per_hour, 85);
  const scope = project.project_scope || "full";
  const includeInstall = scope !== "letters_only";
  const includeLetters = scope !== "install_only";

  const items = (project.items || []).map((raw) => {
    const item = { ...raw };
    const meta = sizeMeta(item.letter_size);
    const perLetter = num(item.minutes_per_letter_override, 0) || meta.minutes;
    const difficulty = DIFFICULTY_FACTORS.reduce((f, d) => f + (item[d.key] ? d.factor : 0), 0);
    const heightFactor = Math.max(0, (num(item.install_height_feet) - 12) / 100);

    const baseMinutes = perLetter * num(item.qty_letters, 1);
    const racewayMinutes = num(item.raceway_length_feet) * num(project.raceway_minutes_per_foot, 6);

    item.labor_hours = includeInstall
      ? ((baseMinutes + racewayMinutes) * (1 + difficulty + heightFactor)) / 60
      : 0;
    item.labor_cost = item.labor_hours * laborRate;
    item.materials_cost = includeInstall
      ? (item.materials || []).reduce((s, m) => s + materialCost(invMap.get(m.inventory_id), item), 0)
      : 0;
    item.item_total_cost = item.labor_cost + item.materials_cost;
    return item;
  });

  const selected_equipment = (project.selected_equipment || []).map((sel) => {
    const eq = eqMap.get(sel.equipment_id);
    const costs = equipmentCost(eq, sel);
    return {
      ...sel,
      equipment_name: eq?.equipment_name || sel.equipment_name,
      equipment_type: eq?.equipment_type,
      pricing_mode: eq?.pricing_mode,
      idle_running_cost_per_hour: num(eq?.idle_running_cost_per_hour),
      ...costs,
    };
  });

  const letter_purchases = (project.letter_purchases || []).map((p) => ({
    ...p,
    line_total: num(p.qty, 1) * num(p.unit_cost),
  }));

  const letterFees =
    num(project.letters_delivery_fee) +
    num(project.letters_design_fee) +
    num(project.letters_install_supplies_fee) +
    num(project.letters_permitting_fee) +
    num(project.letters_other_fee);
  const letters_subtotal = includeLetters
    ? letter_purchases.reduce((s, p) => s + p.line_total, 0) + letterFees
    : 0;
  const total_letters_cost =
    letters_subtotal + (letters_subtotal * num(project.letters_markup_percent)) / 100;

  const labor_hours = items.reduce((s, i) => s + i.labor_hours, 0);
  const labor_cost = items.reduce((s, i) => s + i.labor_cost, 0);
  const install_materials_cost = items.reduce((s, i) => s + i.materials_cost, 0);
  const total_materials_cost = install_materials_cost + total_letters_cost;
  const total_supplies_cost =
    (install_materials_cost * num(project.supplies_percent_of_materials, 10)) / 100 +
    num(project.extra_supplies_cost);
  const total_equipment_cost = selected_equipment.reduce((s, e) => s + num(e.total_cost), 0);
  const total_personnel_cost = (project.personnel || []).reduce(
    (s, p) => s + num(p.hourly_rate) * num(p.hours),
    0
  );
  const total_travel_cost =
    num(project.travel_miles_round_trip) * num(project.travel_cost_per_mile, 1.25);

  const subtotal =
    labor_cost +
    total_materials_cost +
    total_supplies_cost +
    total_equipment_cost +
    total_personnel_cost +
    total_travel_cost;
  const markup_amount = (subtotal * num(project.markup_percent)) / 100;

  return {
    items,
    selected_equipment,
    letter_purchases,
    totals: {
      labor_hours,
      labor_cost,
      install_materials_cost,
      letters_subtotal,
      total_letters_cost,
      total_materials_cost,
      total_supplies_cost,
      total_equipment_cost,
      total_personnel_cost,
      total_travel_cost,
      subtotal,
      markup_amount,
      total_cost: subtotal + markup_amount,
    },
  };
}