// Helpers for per-part costing + roll-stock comparisons.
// Feature #6 (stock check), #19 (per-part), #21 (yield), #22 (vinyl compare).

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// --- Per-part cost rollup. Allocates workflow cost down to each placed part
// by its share of total used area (so a 24x24 sticker gets ~4x the cost of a 12x12).
// Returns: { byPartIdx: { idx: { partsPlaced, sqFt, vinylCost, inkCost, cutCost, machineCost, laborCost, totalCost, costEach } } }
export const computePerPartCosts = (calc, items) => {
  const byPartIdx = {};
  if (!calc || !calc.shelves || calc.usedSqFt <= 0) return byPartIdx;

  const totalUsedSqIn = calc.shelves.reduce(
    (s, sh) => s + sh.items.reduce((ss, it) => ss + it.w * it.h, 0), 0
  );
  if (totalUsedSqIn <= 0) return byPartIdx;

  // Aggregate placed area + count per source item idx
  calc.shelves.forEach(sh => sh.items.forEach(it => {
    const k = it.itemIdx;
    if (!byPartIdx[k]) {
      byPartIdx[k] = { partsPlaced: 0, sqIn: 0, perimeterIn: 0 };
    }
    byPartIdx[k].partsPlaced += 1;
    byPartIdx[k].sqIn += it.w * it.h;
    byPartIdx[k].perimeterIn += 2 * (it.w + it.h);
  }));

  const totalPerimeter = Object.values(byPartIdx).reduce((s, p) => s + p.perimeterIn, 0);

  Object.entries(byPartIdx).forEach(([k, p]) => {
    const areaShare = p.sqIn / totalUsedSqIn;
    const perimShare = totalPerimeter > 0 ? p.perimeterIn / totalPerimeter : areaShare;
    p.sqFt = p.sqIn / 144;
    p.vinylCost    = (calc.vinylCost    || 0) * areaShare;
    p.laminateCost = (calc.laminateCost || 0) * areaShare;
    p.inkCost      = (calc.inkCost      || 0) * areaShare;
    // Cut-related cost is driven by perimeter, not area
    p.cutCost      = (calc.cutMachineCost || 0) * perimShare + (calc.bladeCost || 0) * perimShare;
    // Print machine cost is area-driven; laminator is length-driven (approximate by area share)
    p.machineCost  = (calc.printMachineCost || 0) * areaShare + (calc.laminateMachineCost || 0) * areaShare;
    p.laborCost    = (calc.laborCost   || 0) * areaShare;
    p.totalCost    = p.vinylCost + p.laminateCost + p.inkCost + p.cutCost + p.machineCost + p.laborCost;
    p.costEach     = p.partsPlaced > 0 ? p.totalCost / p.partsPlaced : 0;
    // Tie back to original item description for display
    const sourceItem = items?.[parseInt(k)];
    p.description = sourceItem?.description || `Item ${parseInt(k) + 1}`;
  });

  return byPartIdx;
};

// --- Workflow margin / yield metrics. Feature #20, #21.
export const computeWorkflowMetrics = (calc) => {
  const used = num(calc?.usedSqFt);
  const pulled = num(calc?.totalRollSqFtPulled);
  const totalCost = num(calc?.totalCost);
  const materialCost = num(calc?.materialCost);

  return {
    sqFtUsed: used,
    sqFtPulled: pulled,
    yieldPercent: pulled > 0 ? (used / pulled) * 100 : 0,
    wastePercent: pulled > 0 ? Math.max(0, (1 - used / pulled) * 100) : 0,
    costPerSqFt: used > 0 ? totalCost / used : 0,
    materialPercent: totalCost > 0 ? (materialCost / totalCost) * 100 : 0,
  };
};

// --- Stock check vs VinylInventory. Feature #6.
// One full roll = roll_width × (roll_length_yards × 36) inches.
export const computeStockUsage = (calc, vinyl) => {
  if (!calc || !vinyl) return null;
  const rollLengthIn = num(vinyl.roll_length_yards) * 36;
  if (rollLengthIn <= 0) return null;
  const consumedIn = num(calc.lengthConsumedIn);
  const rollsNeeded = consumedIn / rollLengthIn;
  return {
    rollLengthIn,
    consumedIn,
    rollsNeeded,
    exceedsOneRoll: rollsNeeded > 1.0,
    fullRollsNeeded: Math.ceil(rollsNeeded),
    percentOfRoll: rollsNeeded * 100,
  };
};

// --- "If you used vinyl B instead" comparison. Feature #22.
// Just recomputes vinylCost using vinyl B's $/sqft × actual pulled area × waste factor.
export const computeAlternativeVinylCost = (calc, altVinyl) => {
  if (!calc || !altVinyl) return null;
  const widthFt = num(altVinyl.roll_width_inches) / 12;
  const lenFt = num(altVinyl.roll_length_yards) * 3;
  const rollSqFt = widthFt * lenFt;
  let altRate = 0;
  if (altVinyl.pricing_mode === "per_sqft")        altRate = num(altVinyl.cost_per_sqft);
  else if (altVinyl.pricing_mode === "per_linear_foot") altRate = num(altVinyl.cost_per_linear_foot) / Math.max(widthFt, 0.01);
  else                                              altRate = rollSqFt > 0 ? num(altVinyl.cost_per_roll) / rollSqFt : 0;
  const altWasteMult = 1 + num(altVinyl.waste_factor_percent, 0) / 100;
  return num(calc.totalRollSqFtPulled) * altRate * altWasteMult;
};

// --- Lifetime / outdoor compatibility warning. Feature #27 (bundled).
export const computeLifetimeWarning = (vinyl, environment) => {
  if (!vinyl || environment !== "exterior") return null;
  const yrs = num(vinyl.expected_life_years_outdoor);
  if (yrs > 0 && yrs < 3) {
    return { severity: "high", message: `Outdoor life only ${yrs} years — consider a longer-life vinyl for exterior installs.` };
  }
  if (vinyl.indoor_outdoor === "indoor_only") {
    return { severity: "high", message: "This vinyl is marked indoor-only but the project is exterior." };
  }
  return null;
};