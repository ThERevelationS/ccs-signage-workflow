const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Engraving items run on the engraving laser; cutting items run on the parameter laser.
// engrave_and_cut splits: engrave portion on the engraving laser, cut portion on the parameter laser.
export function calcLaserProject(project) {
  const cutMachine = num(project.machine_rate_per_hour, 100);
  const cutLabor = num(project.labor_rate, 75);
  const engMachine = num(project.engraving_machine_rate_per_hour, 80);
  const engLabor = num(project.engraving_labor_rate, 40);
  const cutHandlingPct = num(project.parameter_handling_time_percentage, 15);
  const engHandlingPct = num(project.engraving_handling_time_percentage, 20);

  const items = (project.items || []).map((raw) => {
    const item = { ...raw };
    const qty = num(item.quantity, 1);
    const type = item.item_type || "panel";
    const doesEngrave = type === "engraving" || type === "engrave_and_cut";
    const doesCut = type !== "engraving";

    const engSpeed = num(item.engrave_speed_sqipm, 5);
    const engHours = doesEngrave && engSpeed > 0 ? (num(item.engrave_area_sqin) / engSpeed / 60) * qty : 0;

    const cutSpeed = num(item.cut_speed_ipm, 20);
    const perimeter =
      num(item.total_cut_length_inches) ||
      (type === "lettering"
        ? num(item.num_letters) * num(item.letter_height) * 4
        : (num(item.length) + num(item.width)) * 2);
    const cutHours = doesCut && cutSpeed > 0 ? (perimeter / cutSpeed / 60) * qty : 0;

    item.engrave_hours = engHours;
    item.cut_hours = cutHours;
    item.machine_time_hours = engHours + cutHours;
    item.handling_time_hours =
      (engHours * engHandlingPct) / 100 + (cutHours * cutHandlingPct) / 100;
    item.machine_cost = engHours * engMachine + cutHours * cutMachine;
    item.labor_cost =
      ((engHours * engHandlingPct) / 100) * engLabor + ((cutHours * cutHandlingPct) / 100) * cutLabor;
    item.item_total_cost = item.machine_cost + item.labor_cost;
    return item;
  });

  const total_machine_hours = items.reduce((s, i) => s + i.machine_time_hours, 0);
  const total_handling_hours =
    items.reduce((s, i) => s + i.handling_time_hours, 0) + num(project.fixed_setup_hours);
  const total_machine_cost = items.reduce((s, i) => s + i.machine_cost, 0);
  const fixed_setup_cost = num(project.fixed_setup_hours) * cutLabor;
  const total_labor_cost = items.reduce((s, i) => s + i.labor_cost, 0) + fixed_setup_cost;
  const total_supplies_cost = num(project.fixed_material_setup_cost);

  return {
    items,
    totals: {
      total_machine_hours,
      total_handling_hours,
      total_machine_cost,
      fixed_setup_cost,
      total_labor_cost,
      total_supplies_cost,
      total_cost: total_machine_cost + total_labor_cost + total_supplies_cost,
    },
  };
}