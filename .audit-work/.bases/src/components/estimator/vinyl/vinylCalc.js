// Vinyl & Graphics cost engine.
// Each item: width_inches, height_inches, quantity, vinyl_id, laminate_id, apply_print,
// labor_hours_each. Material is priced from the roll: pieces are nested across the roll
// width, so the billed material is (linear feet of roll used) x (roll cost per linear foot).

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function rollCostPerSqft(vinyl) {
  if (!vinyl) return 0;
  if (vinyl.pricing_mode === "per_sqft") return num(vinyl.cost_per_sqft);
  const widthFt = num(vinyl.roll_width_inches, 24) / 12;
  if (vinyl.pricing_mode === "per_linear_foot") {
    return widthFt > 0 ? num(vinyl.cost_per_linear_foot) / widthFt : 0;
  }
  const lengthFt = num(vinyl.roll_length_yards, 50) * 3;
  const area = widthFt * lengthFt;
  return area > 0 ? num(vinyl.cost_per_roll) / area : 0;
}

function materialForItem(item, vinyl) {
  const w = num(item.width_inches);
  const h = num(item.height_inches);
  const qty = num(item.quantity, 1);
  if (!w || !h || !qty) return { sqft: 0, cost: 0 };

  const rollWidth = num(vinyl?.roll_width_inches, 48);
  // Best orientation: how many fit across the roll width.
  const acrossA = Math.floor(rollWidth / w) || 0;
  const acrossB = Math.floor(rollWidth / h) || 0;
  const optionA = acrossA ? Math.ceil(qty / acrossA) * h : Infinity;
  const optionB = acrossB ? Math.ceil(qty / acrossB) * w : Infinity;
  const runInches = Math.min(optionA, optionB);

  const waste = 1 + num(vinyl?.waste_factor_percent, 15) / 100;
  const usedSqft = Number.isFinite(runInches)
    ? (runInches * rollWidth) / 144
    : ((w * h * qty) / 144) * 1.3;
  const sqft = usedSqft * waste;
  return { sqft, cost: sqft * rollCostPerSqft(vinyl) };
}

export function calcVinylProject(project, inventory) {
  const byId = new Map((inventory || []).map((v) => [v.id, v]));
  const printRate = num(project.print_cost_per_sqft, 1.5);
  const laborRate = num(project.labor_rate_per_hour, 65);

  const items = (project.items || []).map((raw) => {
    const item = { ...raw };
    const vinyl = byId.get(item.vinyl_id);
    const laminate = item.laminate_id ? byId.get(item.laminate_id) : null;

    const vinylPart = materialForItem(item, vinyl);
    const lamPart = laminate ? materialForItem(item, laminate) : { sqft: 0, cost: 0 };

    item.vinyl_sqft = vinylPart.sqft;
    item.vinyl_cost = vinylPart.cost;
    item.laminate_sqft = lamPart.sqft;
    item.laminate_cost = lamPart.cost;
    item.print_sqft = item.apply_print ? vinylPart.sqft : 0;
    item.print_cost = item.print_sqft * printRate;
    item.labor_hours = num(item.labor_hours_each) * num(item.quantity, 1);
    item.labor_cost = item.labor_hours * laborRate;
    item.item_total_cost =
      item.vinyl_cost + item.laminate_cost + item.print_cost + item.labor_cost + num(item.extra_cost);
    return item;
  });

  const sum = (fn) => items.reduce((a, i) => a + num(fn(i)), 0);

  const total_vinyl_cost = sum((i) => i.vinyl_cost);
  const total_laminate_cost = sum((i) => i.laminate_cost);
  const total_ink_cost = sum((i) => i.print_cost);
  const labor_cost = sum((i) => i.labor_cost);
  const materials = total_vinyl_cost + total_laminate_cost;
  const total_supplies_cost = (materials * num(project.supplies_percent_of_materials, 5)) / 100;

  const subtotal =
    materials + total_ink_cost + labor_cost + total_supplies_cost + num(project.extra_supplies_cost);
  const markup_amount = (subtotal * num(project.markup_percent)) / 100;

  return {
    items,
    totals: {
      total_vinyl_sqft: sum((i) => i.vinyl_sqft),
      total_laminate_sqft: sum((i) => i.laminate_sqft),
      total_print_sqft: sum((i) => i.print_sqft),
      total_vinyl_cost,
      total_laminate_cost,
      total_ink_cost,
      total_supplies_cost,
      labor_hours: sum((i) => i.labor_hours),
      labor_cost,
      subtotal,
      markup_amount,
      total_cost: subtotal + markup_amount,
    },
  };
}