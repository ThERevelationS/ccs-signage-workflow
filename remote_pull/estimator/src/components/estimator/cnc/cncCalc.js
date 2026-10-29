const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Hold-Down Advisor — decides whether the item needs enhanced workholding.
export function holdDownAdvice(item) {
  const reasons = [];
  const detail = num(item.smallest_detail_in);
  const cutter = num(item.cutter_diameter_in);
  const loose = item.item_type === "lettering" || item.creates_loose_pieces;
  const base = item.workholding_method || "none";

  if (loose) reasons.push("Cut releases loose pieces at cut-through");
  if (detail > 0 && cutter > 0 && detail < cutter * 2)
    reasons.push(`Fine detail (${detail}") is under 2× cutter diameter`);
  if (["none", "clamps", "screws"].includes(base) && loose)
    reasons.push(`Base workholding (${base.replace("_", " ")}) will not retain small pieces`);
  if (base === "vacuum_full" && detail > 0 && detail < 0.5)
    reasons.push("Vacuum alone loses grip on narrow strokes");

  const needed = item.force_enhanced || reasons.length > 0;
  return {
    needed,
    reasons,
    recommendation: needed
      ? loose
        ? "Add tape-and-glue or onion-skin tabs over the vacuum, and plan a manual release pass."
        : "Add supplemental tape/glue or zoned vacuum before the finish pass."
      : "Base workholding is sufficient.",
    extra_hours: needed ? 0.25 * num(item.quantity, 1) : 0,
  };
}

export function calcCNCProject(project) {
  const machineRate = num(project.machine_rate_per_hour, 75);
  const laborRate = num(project.labor_rate, 45);
  const setupPct = num(project.setup_time_percentage, 20);

  const items = (project.items || []).map((raw) => {
    const item = { ...raw };
    const qty = num(item.quantity, 1);

    let cutHours = 0;
    if (item.item_type === "3d_carving") {
      const rate = num(item.carve_speed_sqipm, 10);
      const passes = Math.max(1, Math.ceil(num(item.carve_depth) / 0.25));
      cutHours = rate > 0 ? (num(item.carve_area_sqin) * passes) / rate / 60 : 0;
    } else {
      const speed = num(item.cut_speed_ipm, 50);
      const perimeter =
        num(item.total_cut_length_inches) ||
        (item.item_type === "lettering"
          ? num(item.num_letters) * num(item.letter_height) * 4
          : (num(item.length) + num(item.width)) * 2);
      cutHours = speed > 0 ? perimeter / speed / 60 : 0;
    }

    const advice = holdDownAdvice(item);
    item.hold_down = advice;
    item.machine_time_hours = cutHours * qty;
    item.setup_time_hours = (item.machine_time_hours * setupPct) / 100 + advice.extra_hours;
    item.machine_cost = item.machine_time_hours * machineRate;
    item.labor_cost = item.setup_time_hours * laborRate;
    item.item_total_cost = item.machine_cost + item.labor_cost;
    return item;
  });

  const total_machine_hours = items.reduce((s, i) => s + i.machine_time_hours, 0);
  const total_machine_cost = items.reduce((s, i) => s + i.machine_cost, 0);
  const fixed_setup_cost = num(project.fixed_setup_hours) * laborRate;
  const total_labor_cost = items.reduce((s, i) => s + i.labor_cost, 0) + fixed_setup_cost;
  const total_setup_hours =
    items.reduce((s, i) => s + i.setup_time_hours, 0) + num(project.fixed_setup_hours);

  return {
    items,
    totals: {
      total_machine_hours,
      total_setup_hours,
      total_machine_cost,
      fixed_setup_cost,
      total_labor_cost,
      total_cost: total_machine_cost + total_labor_cost,
    },
  };
}