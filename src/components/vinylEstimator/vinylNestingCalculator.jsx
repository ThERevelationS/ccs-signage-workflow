// Vinyl Estimator — shelf packing + cost engine.
//
// Algorithm: Next Fit Decreasing Height (NFDH).
//   1. Expand items into rectangles (one per qty), add bleed all around.
//      A project-level `spoilageBufferPercent` inflates qty BEFORE expansion.
//   2. Sort by height descending.
//   3. Greedily pack across shelves (rows) inside roll usable width.
//      Try rotated orientation if it fits and reduces shelf height.
//   4. Compute roll length consumed (incl. leading/trailing edges + cut pull-off).
//   5. Derive: vinyl, laminate, transfer-tape, ink, machine time, blade wear,
//      operator labor, weeding labor (per-part), install labor (per-part),
//      and per-personnel labor (designer/printer-op/installer).
//   6. Apply a per-workflow `setupFeeFloor` minimum.

import { WEEDING_LABOR_MINUTES_PER_PART, inkCostPerSqIn } from "@/components/vinylInventory/vinylConstants";

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

const sqInToSqFt = (sqIn) => sqIn / 144;

const computeRollSqFtCost = (vinyl) => {
  if (!vinyl) return 0;
  const widthFt = num(vinyl.roll_width_inches) / 12;
  const lenFt = num(vinyl.roll_length_yards) * 3;
  const rollSqFt = widthFt * lenFt;

  if (vinyl.pricing_mode === "per_sqft")        return num(vinyl.cost_per_sqft);
  if (vinyl.pricing_mode === "per_linear_foot") return num(vinyl.cost_per_linear_foot) / Math.max(widthFt, 0.01);
  return rollSqFt > 0 ? num(vinyl.cost_per_roll) / rollSqFt : 0; // per_roll
};

/**
 * @param {object} args
 * @param {Array}  args.items
 * @param {object} args.printer | args.cutter | args.laminator
 * @param {object} args.vinyl | args.laminate | args.transferTape
 * @param {number} args.operatorHourlyRate
 * @param {boolean} args.applyPrint | args.applyCut | args.applyLaminate | args.applyTransferTape
 * @param {number} args.overrideGutterH | args.overrideGutterV
 * @param {string} args.printQuality       — "draft" | "production" | "high_quality" (default)
 * @param {string} args.weedingDifficulty  — drives per-part weeding minutes
 * @param {number} args.weedingMinutesPerPartOverride
 * @param {number} args.installMinutesPerPart — application/install minutes per part
 * @param {Array}  args.personnel          — [{ role, hourly_rate, hours }]
 * @param {number} args.spoilageBufferPercent — N% extra qty for reprint waste (pre-nesting)
 * @param {number} args.setupFeeFloor      — workflow minimum charge
 */
export function calculateVinylProject({
  items = [],
  printer = null, cutter = null, laminator = null,
  vinyl = null, laminate = null, transferTape = null,
  operatorHourlyRate = 45,
  applyPrint = true, applyCut = true, applyLaminate = false, applyTransferTape = false,
  overrideGutterH, overrideGutterV,
  printQuality = "high_quality",
  weedingDifficulty = "moderate",
  weedingMinutesPerPartOverride,
  installMinutesPerPart = 0,
  personnel = [],
  spoilageBufferPercent = 0,
  setupFeeFloor = 0,
} = {}) {

  // --- Roll geometry — driven by the leading machine (printer > cutter > laminator).
  const leadingMachine = (applyPrint && printer) || (applyCut && cutter) || (applyLaminate && laminator) || printer || cutter || laminator;

  const rollWidth = num(vinyl?.roll_width_inches, 54);
  const leftMargin   = num(leadingMachine?.left_margin_inches, 0.5);
  const rightMargin  = num(leadingMachine?.right_margin_inches, 0.5);
  const leadingEdge  = num(leadingMachine?.leading_edge_inches, 4);
  const trailingEdge = num(leadingMachine?.trailing_edge_inches, 2);

  const machineWidthCap = Math.min(
    applyPrint && printer ? num(printer.max_media_width_inches, 999) : 999,
    applyCut && cutter ? num(cutter.max_media_width_inches, 999) : 999,
    applyLaminate && laminator ? num(laminator.max_media_width_inches, 999) : 999,
  );
  const effectiveRollWidth = Math.min(rollWidth, machineWidthCap);
  const usableWidth = Math.max(0, effectiveRollWidth - leftMargin - rightMargin);

  const gutterH = overrideGutterH ?? num(leadingMachine?.default_gutter_horizontal_inches, 0.25);
  const gutterV = overrideGutterV ?? num(leadingMachine?.default_gutter_vertical_inches, 0.25);

  // --- Spoilage buffer (#4): inflate qty by N% (rounded up) before expansion.
  const spoilMult = 1 + Math.max(0, num(spoilageBufferPercent, 0)) / 100;

  // --- Expand items into rectangles.
  const rects = [];
  items.forEach((it, itemIdx) => {
    const baseBleed = num(it.bleed_inches, num(leadingMachine?.default_bleed_inches, 0));
    const partW = num(it.width_inches);
    const partH = num(it.height_inches);
    const w0 = partW + baseBleed * 2;
    const h0 = partH + baseBleed * 2;
    const rawQty = Math.max(1, Math.floor(num(it.quantity, 1)));
    const qty = Math.max(rawQty, Math.ceil(rawQty * spoilMult));
    if (partW <= 0 || partH <= 0) return;

    for (let i = 0; i < qty; i++) {
      rects.push({
        id: `${it.id || itemIdx}-${i}`,
        itemId: it.id || `idx-${itemIdx}`,
        itemIdx,
        description: it.description || `Item ${itemIdx + 1}`,
        w: w0, h: h0,
        partW, partH,
        bleed: baseBleed,
        allow_rotation: it.allow_rotation === true,
        rotated: false,
      });
    }
  });

  rects.sort((a, b) => b.h - a.h);

  const shelves = [];
  let yCursor = 0;
  let currentShelf = null;

  const orientedDims = (r) => {
    if (r.allow_rotation) return { w: r.h, h: r.w, partW: r.partH, partH: r.partW, rotated: true };
    return { w: r.w, h: r.h, partW: r.partW, partH: r.partH, rotated: false };
  };

  const placeOnNewShelf = (r) => {
    const { w, h, partW: pw, partH: ph, rotated } = orientedDims(r);
    if (w > usableWidth) return false;
    currentShelf = { y: yCursor, height: h, items: [] };
    shelves.push(currentShelf);
    currentShelf.items.push({ ...r, x: 0, y: yCursor, w, h, partW: pw, partH: ph, rotated });
    yCursor += h + gutterV;
    return true;
  };

  for (const r of rects) {
    if (!currentShelf) {
      if (!placeOnNewShelf(r)) continue;
      continue;
    }
    const { w, h, partW: pw, partH: ph, rotated } = orientedDims(r);
    const lastItem = currentShelf.items[currentShelf.items.length - 1];
    const nextX = lastItem ? lastItem.x + lastItem.w + gutterH : 0;
    let placed = false;
    if (w <= usableWidth - nextX && h <= currentShelf.height) {
      currentShelf.items.push({ ...r, x: nextX, y: currentShelf.y, w, h, partW: pw, partH: ph, rotated });
      placed = true;
    }
    if (!placed) placeOnNewShelf(r);
  }

  // --- Layout metrics
  const contentLengthIn = shelves.length === 0
    ? 0
    : (shelves[shelves.length - 1].y + shelves[shelves.length - 1].height);
  const totalLengthIn = contentLengthIn;

  const cutPullOff = applyCut && cutter ? num(cutter.cut_pull_off_inches_per_job, 0) : 0;
  const lengthConsumedIn = leadingEdge + contentLengthIn + trailingEdge + cutPullOff;
  const lengthConsumedFt = lengthConsumedIn / 12;

  const usedSqIn = shelves.reduce((s, sh) => s + sh.items.reduce((ss, it) => {
    const pw = it.partW ?? it.w;
    const ph = it.partH ?? it.h;
    return ss + pw * ph;
  }, 0), 0);
  const usedSqFt = sqInToSqFt(usedSqIn);

  const totalRollSqFtPulled = sqInToSqFt(lengthConsumedIn * effectiveRollWidth);
  const wastedSqFt = Math.max(0, totalRollSqFtPulled - usedSqFt);

  const partsPlaced = shelves.reduce((s, sh) => s + sh.items.length, 0);
  const partsRequested = rects.length;
  const partsUnplaced = partsRequested - partsPlaced;

  // --- Vinyl cost
  const vinylSqFtRate = computeRollSqFtCost(vinyl);
  const vinylWasteMult = 1 + num(vinyl?.waste_factor_percent, 0) / 100;
  const vinylCost = totalRollSqFtPulled * vinylSqFtRate * vinylWasteMult;

  // --- Laminate
  let laminateSqFt = 0, laminateCost = 0, laminateMinutes = 0;
  if (applyLaminate && laminate) {
    const lamWidth = Math.min(num(laminate.roll_width_inches, effectiveRollWidth), effectiveRollWidth);
    const lamLengthIn = lengthConsumedIn + num(laminator?.leading_edge_inches, 0) + num(laminator?.trailing_edge_inches, 0);
    laminateSqFt = sqInToSqFt(lamLengthIn * lamWidth);
    const lamSqFtRate = computeRollSqFtCost(laminate);
    const lamWasteMult = 1 + num(laminate.waste_factor_percent, 0) / 100;
    laminateCost = laminateSqFt * lamSqFtRate * lamWasteMult;

    const ipm = Math.max(1, num(laminator?.laminator_speed_inches_per_minute, 100));
    laminateMinutes = (lamLengthIn / ipm) + num(laminator?.laminator_setup_minutes_per_job, 0);
  }

  // --- Print: ink uses TIERED $/sqin by print quality.
  let inkCost = 0, printMinutes = 0, printMachineCost = 0;
  const inkRatePerSqIn = applyPrint && printer ? inkCostPerSqIn(printer, printQuality) : 0;
  if (applyPrint && printer) {
    inkCost = (usedSqFt * 144) * inkRatePerSqIn;
    const sph = Math.max(1, num(printer.print_speed_sqft_per_hour, 100));
    printMinutes =
      (usedSqFt / sph) * 60 +
      num(printer.warmup_minutes, 0) +
      num(printer.media_load_minutes, 0) +
      num(printer.calibration_minutes_per_job, 0);
    printMachineCost = (printMinutes / 60) * num(printer.machine_hourly_rate, 0);
  }

  // --- Cut
  let cutDistanceIn = 0, cutMinutes = 0, cutMachineCost = 0, bladeCost = 0;
  if (applyCut && cutter) {
    cutDistanceIn = shelves.reduce((s, sh) => s + sh.items.reduce((ss, it) => {
      const pw = it.partW ?? it.w;
      const ph = it.partH ?? it.h;
      return ss + 2 * (pw + ph);
    }, 0), 0);
    const ips = Math.max(0.1, num(cutter.cut_speed_inches_per_second, 30));
    cutMinutes = (cutDistanceIn / ips) / 60 + num(cutter.cut_setup_minutes_per_job, 0);
    cutMachineCost = (cutMinutes / 60) * num(cutter.machine_hourly_rate, 0);
    const bladeLife = Math.max(1, num(cutter.cut_blade_life_minutes, 6000));
    bladeCost = (cutMinutes / bladeLife) * num(cutter.cut_blade_cost, 0);
  }

  const laminateMachineCost = applyLaminate && laminator
    ? (laminateMinutes / 60) * num(laminator.laminator_hourly_rate, 0)
    : 0;

  // --- Transfer Tape
  let transferTapeSqFt = 0, transferTapeCost = 0;
  if (applyTransferTape && transferTape) {
    const ttWidth = Math.min(num(transferTape.roll_width_inches, effectiveRollWidth), effectiveRollWidth);
    transferTapeSqFt = sqInToSqFt(lengthConsumedIn * ttWidth);
    const ttSqFtRate = computeRollSqFtCost(transferTape);
    const ttWasteMult = 1 + num(transferTape.waste_factor_percent, 0) / 100;
    transferTapeCost = transferTapeSqFt * ttSqFtRate * ttWasteMult;
  }

  const machineCost = printMachineCost + cutMachineCost + laminateMachineCost;

  // --- Machine-operator labor (running the printer/cutter/laminator)
  const machineRunMinutes = (applyPrint ? printMinutes : 0) + (applyCut ? cutMinutes : 0) + (applyLaminate ? laminateMinutes : 0);

  // --- Weeding labor (per placed part) — only meaningful when cutting
  const weedMinPerPart = Number.isFinite(parseFloat(weedingMinutesPerPartOverride))
    ? parseFloat(weedingMinutesPerPartOverride)
    : (WEEDING_LABOR_MINUTES_PER_PART[weedingDifficulty] ?? WEEDING_LABOR_MINUTES_PER_PART.moderate);
  const weedingMinutes = applyCut ? weedMinPerPart * partsPlaced : 0;

  // --- Install/application labor (per placed part)
  const installMinPerPart = Math.max(0, num(installMinutesPerPart, 0));
  const installMinutes = installMinPerPart * partsPlaced;

  // --- Per-personnel labor (designer / printer op / installer / ...)
  // If personnel rows are given, those drive the labor cost. Otherwise we fall
  // back to the operator rate × (machine + weeding + install) minutes.
  let perPersonnelCost = 0;
  let perPersonnelMinutes = 0;
  (personnel || []).forEach((p) => {
    const hrs = num(p?.hours, 0);
    const rate = num(p?.hourly_rate, 0);
    if (hrs > 0 && rate > 0) {
      perPersonnelCost += hrs * rate;
      perPersonnelMinutes += hrs * 60;
    }
  });

  const fallbackLaborMinutes = machineRunMinutes + weedingMinutes + installMinutes;
  const fallbackLaborCost    = (fallbackLaborMinutes / 60) * num(operatorHourlyRate, 45);

  const laborMinutes = perPersonnelMinutes > 0 ? perPersonnelMinutes : fallbackLaborMinutes;
  const laborHours   = laborMinutes / 60;
  const laborCost    = perPersonnelCost > 0 ? perPersonnelCost : fallbackLaborCost;

  const materialCost = vinylCost + laminateCost + transferTapeCost + inkCost + bladeCost;
  const preFloorTotal = materialCost + machineCost + laborCost;

  // --- Setup-fee floor (#3): workflow minimum
  const floor = Math.max(0, num(setupFeeFloor, 0));
  const setupFeeApplied = preFloorTotal < floor ? (floor - preFloorTotal) : 0;
  const totalCost = preFloorTotal + setupFeeApplied;

  return {
    // geometry
    usableWidth, effectiveRollWidth, leadingEdge, trailingEdge, gutterH, gutterV,
    shelves, partsPlaced, partsRequested, partsUnplaced,
    totalLengthIn, lengthConsumedIn, lengthConsumedFt,
    usedSqFt, totalRollSqFtPulled, wastedSqFt,
    // cost breakdown
    vinylCost, laminateCost, laminateSqFt,
    transferTapeCost, transferTapeSqFt,
    inkCost, inkRatePerSqIn, printQuality,
    printMinutes, printMachineCost,
    cutDistanceIn, cutMinutes, cutMachineCost, bladeCost,
    laminateMinutes, laminateMachineCost,
    machineCost,
    // labor split
    machineRunMinutes, weedingMinutes, installMinutes,
    weedMinPerPart, installMinPerPart,
    perPersonnelCost, perPersonnelMinutes,
    laborMinutes, laborHours, laborCost,
    // floor
    preFloorTotal, setupFeeApplied,
    materialCost, totalCost,
  };
}