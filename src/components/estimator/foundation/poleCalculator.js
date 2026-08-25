// Pole + pole-painting math — ported VERBATIM from SignEstimate Pro
// (NewFoundationEstimate.jsx: polesTotal / calcPolePaintingCost /
//  getPolePaintingSizeMultiplier). Poles are PROJECT-level, not per foundation item.

const setting = (settings, key, def) => parseFloat(settings?.[key] || def);

const getPolePaintingSizeMultiplier = (inv, settings) => {
  const w = inv?.pole_width_inches || 6;
  if (w >= 12) return setting(settings, "pole_paint_size_multiplier_12in", 2.0);
  if (w >= 10) return setting(settings, "pole_paint_size_multiplier_10in", 1.75);
  if (w >= 8) return setting(settings, "pole_paint_size_multiplier_8in", 1.5);
  if (w >= 6) return setting(settings, "pole_paint_size_multiplier_6in", 1.25);
  return setting(settings, "pole_paint_size_multiplier_4in", 1.0);
};

export const calcPolePaintingCost = (p, inv, settings) => {
  if (!p.include_pole_painting || !inv) return 0;
  // Total pole length = height above ground + depth in ground.
  const heightFt = ((p.height_inches || 0) + (p.y_offset_inches || 0)) / 12;
  const paintCostPerLf = setting(settings, "pole_paint_cost_per_lf", 3.5);
  const paintLaborPerLf = setting(settings, "pole_paint_labor_per_lf", 2.5);
  const sizeMult = getPolePaintingSizeMultiplier(inv, settings);
  return heightFt * (paintCostPerLf + paintLaborPerLf) * sizeMult;
};

export function calcPoles(poles = [], inventory = [], settings = {}) {
  return (poles || []).map((p) => {
    const inv = inventory.find((i) => i.id === p.pole_id);
    if (!inv) return { ...p, pole_cost: 0, pole_painting_cost: 0, total_cost: 0, pole_name: "" };

    const totalPoleInches = (p.height_inches || 0) + (p.y_offset_inches || 0);
    let poleCost;
    if (inv.pole_pricing_mode === "stock_price") {
      const stockLen = (inv.pole_stock_length_ft || 20) * 12;
      const pieces = Math.ceil(totalPoleInches / stockLen);
      const rate = typeof p.custom_cost_per_unit === "number" ? p.custom_cost_per_unit : inv.pole_stock_price || 0;
      poleCost = pieces * rate;
    } else {
      const rate = typeof p.custom_cost_per_unit === "number" ? p.custom_cost_per_unit : inv.cost_per_unit || 0;
      poleCost = (totalPoleInches / 12) * rate;
    }

    const paintingCost = calcPolePaintingCost(p, inv, settings);

    return {
      ...p,
      pole_name: inv.material_name || "",
      pole_cost: poleCost,
      pole_painting_cost: paintingCost,
      total_cost: poleCost + paintingCost,
    };
  });
}