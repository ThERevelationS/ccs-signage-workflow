import { isCabinetType, sizeMeta } from "./maintenanceConstants";

// Sign Maintenance cost engine.
// Each service item = one sign: { sign_type, size, qty_letters, face_sqft, quantity,
//   actions: [{ action, unit_count, materials: [{ inventory_id, quantity }] }] }
// Labor minutes come from the MaintenanceActionRate matrix (sign_type × action),
// picked by rate_basis and the item's size tier.

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function actionMinutes(rate, item) {
  if (!rate) return 0;
  const meta = sizeMeta(item.size);
  const sized = num(rate[meta.minutesKey]);
  switch (rate.rate_basis) {
    case "per_letter":
      return sized * num(item.qty_letters, 1);
    case "per_cabinet":
      return sized || num(rate.base_minutes_flat);
    case "per_sqft":
      return sized * num(item.face_sqft);
    case "per_unit":
      return num(rate.base_minutes_flat);
    case "flat":
    default:
      return num(rate.base_minutes_flat) || sized;
  }
}

export function materialCost(mat, item, quantity) {
  if (!mat) return 0;
  const meta = sizeMeta(item.size);
  const qty = num(quantity, 1);
  switch (mat.pricing_mode) {
    case "per_letter_flat":
      return num(mat.cost_per_letter) * num(item.qty_letters, 1);
    case "per_letter_by_size":
      return num(mat[meta.costKey]) * num(item.qty_letters, 1);
    case "per_cabinet_flat":
      return num(mat.cost_per_cabinet);
    case "per_cabinet_by_size":
      return num(mat[meta.costKey]);
    case "per_linear_foot":
      return num(mat.cost_per_foot) * qty;
    case "per_sqft":
      return num(mat.cost_per_sqft) * num(item.face_sqft);
    case "per_project_flat":
    default:
      return num(mat.cost_flat) * qty;
  }
}

export function calcMaintenanceProject(project, rates, inventory) {
  const rateKey = (t, a) => `${t}::${a}`;
  const rateMap = new Map((rates || []).map((r) => [rateKey(r.sign_type, r.action), r]));
  const invMap = new Map((inventory || []).map((m) => [m.id, m]));
  const laborRate = num(project.labor_rate_per_hour, 85);

  const items = (project.items || []).map((raw) => {
    const item = { ...raw };
    const signQty = num(item.quantity, 1);

    const actions = (item.actions || []).map((rawAction) => {
      const a = { ...rawAction };
      const rate = rateMap.get(rateKey(item.sign_type, a.action));
      const unitScale = rate?.rate_basis === "per_unit" ? num(a.unit_count, 1) : 1;
      a.minutes = actionMinutes(rate, item) * unitScale;
      a.labor_hours = (a.minutes / 60) * signQty;
      a.labor_cost = a.labor_hours * laborRate;
      a.materials_cost =
        (a.materials || []).reduce(
          (sum, m) => sum + materialCost(invMap.get(m.inventory_id), item, m.quantity),
          0
        ) * signQty;
      a.action_total_cost = a.labor_cost + a.materials_cost;
      a.rate_basis = rate?.rate_basis || null;
      return a;
    });

    item.actions = actions;
    item.labor_hours = actions.reduce((s, a) => s + a.labor_hours, 0);
    item.labor_cost = actions.reduce((s, a) => s + a.labor_cost, 0);
    item.materials_cost = actions.reduce((s, a) => s + a.materials_cost, 0);
    item.item_total_cost = item.labor_cost + item.materials_cost;
    return item;
  });

  const labor_hours = items.reduce((s, i) => s + i.labor_hours, 0);
  const labor_cost = items.reduce((s, i) => s + i.labor_cost, 0);
  const total_materials_cost = items.reduce((s, i) => s + i.materials_cost, 0);
  const total_supplies_cost =
    (total_materials_cost * num(project.supplies_percent_of_materials, 10)) / 100 +
    num(project.extra_supplies_cost);
  const total_equipment_cost = (project.selected_equipment || []).reduce(
    (s, e) => s + num(e.equipment_cost),
    0
  );
  const total_travel_cost = num(project.travel_miles_round_trip) * num(project.travel_cost_per_mile, 1.25);

  const subtotal =
    labor_cost + total_materials_cost + total_supplies_cost + total_equipment_cost + total_travel_cost;
  const markup_amount = (subtotal * num(project.markup_percent)) / 100;

  return {
    items,
    totals: {
      labor_hours,
      labor_cost,
      total_materials_cost,
      total_supplies_cost,
      total_equipment_cost,
      total_travel_cost,
      subtotal,
      markup_amount,
      total_cost: subtotal + markup_amount,
    },
  };
}