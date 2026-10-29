const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function materialCostFor(inv, item) {
  if (!inv) return 0;
  const rate = num(inv.cost_per_unit);
  const lengthFt = num(item.material_length_ft);
  switch (inv.unit_type) {
    case "per_piece": {
      const stock = num(inv.standard_length, 0);
      const pieces = stock > 0 && lengthFt > 0 ? Math.ceil(lengthFt / stock) : 1;
      return rate * pieces;
    }
    case "per_pound":
    case "per_sqft":
      return rate * (lengthFt || 1);
    case "per_foot":
    default:
      return rate * lengthFt;
  }
}

export function calcMetalProject(project, inventoryById = {}) {
  const fabRate = num(project.fabrication_rate, 65);
  const weldRate = num(project.welding_rate, 75);
  const finRate = num(project.finishing_rate, 55);
  const suppliesPct = num(project.supplies_percent_of_materials, 8);

  const items = (project.items || []).map((raw) => {
    const item = { ...raw };
    const qty = num(item.quantity, 1);
    const inv = inventoryById[item.inventory_item_id];

    item.material_cost = materialCostFor(inv, item) * qty;
    item.supplies_cost = (item.material_cost * suppliesPct) / 100;
    item.fabrication_cost = num(item.fabrication_hours) * qty * fabRate;
    item.welding_cost = num(item.welding_hours) * qty * weldRate;
    item.finishing_cost = num(item.finishing_hours) * qty * finRate;
    item.item_total_cost =
      item.material_cost +
      item.supplies_cost +
      item.fabrication_cost +
      item.welding_cost +
      item.finishing_cost;
    return item;
  });

  const sum = (key) => items.reduce((s, i) => s + num(i[key]), 0);
  const total_material_cost = sum("material_cost");
  const total_supplies_cost = sum("supplies_cost") + num(project.extra_supplies_cost);
  const total_fabrication_cost = sum("fabrication_cost");
  const total_welding_cost = sum("welding_cost");
  const total_finishing_cost = sum("finishing_cost");

  const subtotal =
    total_material_cost +
    total_supplies_cost +
    total_fabrication_cost +
    total_welding_cost +
    total_finishing_cost;
  const markup_amount = (subtotal * num(project.markup_percent)) / 100;

  return {
    items,
    totals: {
      total_labor_hours: items.reduce(
        (s, i) =>
          s +
          (num(i.fabrication_hours) + num(i.welding_hours) + num(i.finishing_hours)) *
            num(i.quantity, 1),
        0
      ),
      total_material_cost,
      total_supplies_cost,
      total_fabrication_cost,
      total_welding_cost,
      total_finishing_cost,
      subtotal,
      markup_amount,
      total_cost: subtotal + markup_amount,
    },
  };
}