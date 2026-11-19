// frozen:/app/src/components/vinylInventory/vinylConstants.jsx
var WEEDING_LABOR_MINUTES_PER_PART = {
  very_easy: 0.1,
  easy: 0.3,
  moderate: 0.6,
  hard: 1.2,
  very_hard: 2.5
};
var inkCostPerSqIn = (printer, quality = "high_quality") => {
  if (!printer) return 0;
  const map = {
    draft: parseFloat(printer.print_cost_per_sqin_draft),
    production: parseFloat(printer.print_cost_per_sqin_production),
    high_quality: parseFloat(printer.print_cost_per_sqin_high_quality)
  };
  const tiered = map[quality];
  if (Number.isFinite(tiered) && tiered > 0) return tiered;
  return parseFloat(printer.print_cost_per_sqin) || 0;
};

// frozen:/app/src/components/vinylEstimator/vinylNestingCalculator.jsx
var num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var sqInToSqFt = (sqIn) => sqIn / 144;
var computeRollSqFtCost = (vinyl) => {
  if (!vinyl) return 0;
  const widthFt = num(vinyl.roll_width_inches) / 12;
  const lenFt = num(vinyl.roll_length_yards) * 3;
  const rollSqFt = widthFt * lenFt;
  if (vinyl.pricing_mode === "per_sqft") return num(vinyl.cost_per_sqft);
  if (vinyl.pricing_mode === "per_linear_foot") return num(vinyl.cost_per_linear_foot) / Math.max(widthFt, 0.01);
  return rollSqFt > 0 ? num(vinyl.cost_per_roll) / rollSqFt : 0;
};
function calculateVinylProject({
  items = [],
  printer = null,
  cutter = null,
  laminator = null,
  vinyl = null,
  laminate = null,
  transferTape = null,
  operatorHourlyRate = 45,
  applyPrint = true,
  applyCut = true,
  applyLaminate = false,
  applyTransferTape = false,
  overrideGutterH,
  overrideGutterV,
  printQuality = "high_quality",
  weedingDifficulty = "moderate",
  weedingMinutesPerPartOverride,
  installMinutesPerPart = 0,
  personnel = [],
  spoilageBufferPercent = 0,
  setupFeeFloor = 0
} = {}) {
  const leadingMachine = applyPrint && printer || applyCut && cutter || applyLaminate && laminator || printer || cutter || laminator;
  const rollWidth = num(vinyl?.roll_width_inches, 54);
  const leftMargin = num(leadingMachine?.left_margin_inches, 0.5);
  const rightMargin = num(leadingMachine?.right_margin_inches, 0.5);
  const leadingEdge = num(leadingMachine?.leading_edge_inches, 4);
  const trailingEdge = num(leadingMachine?.trailing_edge_inches, 2);
  const machineWidthCap = Math.min(
    applyPrint && printer ? num(printer.max_media_width_inches, 999) : 999,
    applyCut && cutter ? num(cutter.max_media_width_inches, 999) : 999,
    applyLaminate && laminator ? num(laminator.max_media_width_inches, 999) : 999
  );
  const effectiveRollWidth = Math.min(rollWidth, machineWidthCap);
  const usableWidth = Math.max(0, effectiveRollWidth - leftMargin - rightMargin);
  const gutterH = overrideGutterH ?? num(leadingMachine?.default_gutter_horizontal_inches, 0.25);
  const gutterV = overrideGutterV ?? num(leadingMachine?.default_gutter_vertical_inches, 0.25);
  const spoilMult = 1 + Math.max(0, num(spoilageBufferPercent, 0)) / 100;
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
        w: w0,
        h: h0,
        partW,
        partH,
        bleed: baseBleed,
        allow_rotation: it.allow_rotation === true,
        rotated: false
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
  const contentLengthIn = shelves.length === 0 ? 0 : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height;
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
  const vinylSqFtRate = computeRollSqFtCost(vinyl);
  const vinylWasteMult = 1 + num(vinyl?.waste_factor_percent, 0) / 100;
  const vinylCost = totalRollSqFtPulled * vinylSqFtRate * vinylWasteMult;
  let laminateSqFt = 0, laminateCost = 0, laminateMinutes = 0;
  if (applyLaminate && laminate) {
    const lamWidth = Math.min(num(laminate.roll_width_inches, effectiveRollWidth), effectiveRollWidth);
    const lamLengthIn = lengthConsumedIn + num(laminator?.leading_edge_inches, 0) + num(laminator?.trailing_edge_inches, 0);
    laminateSqFt = sqInToSqFt(lamLengthIn * lamWidth);
    const lamSqFtRate = computeRollSqFtCost(laminate);
    const lamWasteMult = 1 + num(laminate.waste_factor_percent, 0) / 100;
    laminateCost = laminateSqFt * lamSqFtRate * lamWasteMult;
    const ipm = Math.max(1, num(laminator?.laminator_speed_inches_per_minute, 100));
    laminateMinutes = lamLengthIn / ipm + num(laminator?.laminator_setup_minutes_per_job, 0);
  }
  let inkCost = 0, printMinutes = 0, printMachineCost = 0;
  const inkRatePerSqIn = applyPrint && printer ? inkCostPerSqIn(printer, printQuality) : 0;
  if (applyPrint && printer) {
    inkCost = usedSqFt * 144 * inkRatePerSqIn;
    const sph = Math.max(1, num(printer.print_speed_sqft_per_hour, 100));
    printMinutes = usedSqFt / sph * 60 + num(printer.warmup_minutes, 0) + num(printer.media_load_minutes, 0) + num(printer.calibration_minutes_per_job, 0);
    printMachineCost = printMinutes / 60 * num(printer.machine_hourly_rate, 0);
  }
  let cutDistanceIn = 0, cutMinutes = 0, cutMachineCost = 0, bladeCost = 0;
  if (applyCut && cutter) {
    cutDistanceIn = shelves.reduce((s, sh) => s + sh.items.reduce((ss, it) => {
      const pw = it.partW ?? it.w;
      const ph = it.partH ?? it.h;
      return ss + 2 * (pw + ph);
    }, 0), 0);
    const ips = Math.max(0.1, num(cutter.cut_speed_inches_per_second, 30));
    cutMinutes = cutDistanceIn / ips / 60 + num(cutter.cut_setup_minutes_per_job, 0);
    cutMachineCost = cutMinutes / 60 * num(cutter.machine_hourly_rate, 0);
    const bladeLife = Math.max(1, num(cutter.cut_blade_life_minutes, 6e3));
    bladeCost = cutMinutes / bladeLife * num(cutter.cut_blade_cost, 0);
  }
  const laminateMachineCost = applyLaminate && laminator ? laminateMinutes / 60 * num(laminator.laminator_hourly_rate, 0) : 0;
  let transferTapeSqFt = 0, transferTapeCost = 0;
  if (applyTransferTape && transferTape) {
    const ttWidth = Math.min(num(transferTape.roll_width_inches, effectiveRollWidth), effectiveRollWidth);
    transferTapeSqFt = sqInToSqFt(lengthConsumedIn * ttWidth);
    const ttSqFtRate = computeRollSqFtCost(transferTape);
    const ttWasteMult = 1 + num(transferTape.waste_factor_percent, 0) / 100;
    transferTapeCost = transferTapeSqFt * ttSqFtRate * ttWasteMult;
  }
  const machineCost = printMachineCost + cutMachineCost + laminateMachineCost;
  const machineRunMinutes = (applyPrint ? printMinutes : 0) + (applyCut ? cutMinutes : 0) + (applyLaminate ? laminateMinutes : 0);
  const weedMinPerPart = Number.isFinite(parseFloat(weedingMinutesPerPartOverride)) ? parseFloat(weedingMinutesPerPartOverride) : WEEDING_LABOR_MINUTES_PER_PART[weedingDifficulty] ?? WEEDING_LABOR_MINUTES_PER_PART.moderate;
  const weedingMinutes = applyCut ? weedMinPerPart * partsPlaced : 0;
  const installMinPerPart = Math.max(0, num(installMinutesPerPart, 0));
  const installMinutes = installMinPerPart * partsPlaced;
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
  const fallbackLaborCost = fallbackLaborMinutes / 60 * num(operatorHourlyRate, 45);
  const laborMinutes = perPersonnelMinutes > 0 ? perPersonnelMinutes : fallbackLaborMinutes;
  const laborHours = laborMinutes / 60;
  const laborCost = perPersonnelCost > 0 ? perPersonnelCost : fallbackLaborCost;
  const materialCost = vinylCost + laminateCost + transferTapeCost + inkCost + bladeCost;
  const preFloorTotal = materialCost + machineCost + laborCost;
  const floor = Math.max(0, num(setupFeeFloor, 0));
  const setupFeeApplied = preFloorTotal < floor ? floor - preFloorTotal : 0;
  const totalCost = preFloorTotal + setupFeeApplied;
  return {
    // geometry
    usableWidth,
    effectiveRollWidth,
    leadingEdge,
    trailingEdge,
    gutterH,
    gutterV,
    shelves,
    partsPlaced,
    partsRequested,
    partsUnplaced,
    totalLengthIn,
    lengthConsumedIn,
    lengthConsumedFt,
    usedSqFt,
    totalRollSqFtPulled,
    wastedSqFt,
    // cost breakdown
    vinylCost,
    laminateCost,
    laminateSqFt,
    transferTapeCost,
    transferTapeSqFt,
    inkCost,
    inkRatePerSqIn,
    printQuality,
    printMinutes,
    printMachineCost,
    cutDistanceIn,
    cutMinutes,
    cutMachineCost,
    bladeCost,
    laminateMinutes,
    laminateMachineCost,
    machineCost,
    // labor split
    machineRunMinutes,
    weedingMinutes,
    installMinutes,
    weedMinPerPart,
    installMinPerPart,
    perPersonnelCost,
    perPersonnelMinutes,
    laborMinutes,
    laborHours,
    laborCost,
    // floor
    preFloorTotal,
    setupFeeApplied,
    materialCost,
    totalCost
  };
}

// frozen:/app/src/components/vinylEstimator/vinylPricingAvailability.js
var vinylNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
var vinylNonNegativeNumber = (v) => {
  const n = vinylNumber(v);
  return n !== null && n >= 0 ? n : null;
};
var vinylPositiveNumber = (v) => {
  const n = vinylNumber(v);
  return n !== null && n > 0 ? n : null;
};
var vinylPositiveInteger = (v) => {
  const n = vinylNumber(v);
  return n !== null && n > 0 && Math.floor(n) === n ? n : null;
};
var recorded = (v) => v !== void 0 && v !== null && v !== "";
var hasVinylCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var vinylDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};
var issue = (kind, { index = null, itemIndex = null, inventoryId = null, field, code, message, hold = "layout" }) => ({
  kind,
  index,
  itemIndex,
  inventoryId,
  field,
  code,
  message,
  hold
});
var HOLD_FIELDS = {
  // Layout problems make every derived number untrustworthy (geometry is wrong).
  layout: [
    "vinylCost",
    "laminateCost",
    "transferTapeCost",
    "inkCost",
    "bladeCost",
    "printMachineCost",
    "cutMachineCost",
    "laminateMachineCost",
    "perPersonnelCost",
    "laborCost",
    "laborHours",
    "laborMinutes",
    "perPersonnelMinutes",
    "inkRatePerSqIn",
    "usedSqFt",
    "totalRollSqFtPulled",
    "wastedSqFt",
    "laminateSqFt",
    "transferTapeSqFt",
    "lengthConsumedIn",
    "lengthConsumedFt",
    "totalLengthIn",
    "cutDistanceIn",
    "printMinutes",
    "cutMinutes",
    "laminateMinutes",
    "machineRunMinutes",
    "weedingMinutes",
    "installMinutes",
    "weedMinPerPart",
    "installMinPerPart"
  ],
  vinylPrice: ["vinylCost"],
  laminatePrice: ["laminateCost", "laminateSqFt"],
  ttPrice: ["transferTapeCost", "transferTapeSqFt"],
  inkPrice: ["inkCost", "inkRatePerSqIn"],
  printerMachine: ["printMachineCost"],
  cutterMachine: ["cutMachineCost", "bladeCost"],
  laminatorMachine: ["laminateMachineCost"],
  labor: [
    "perPersonnelCost",
    "perPersonnelMinutes",
    "laborCost",
    "laborMinutes",
    "laborHours",
    "weedingMinutes",
    "installMinutes",
    "weedMinPerPart",
    "installMinPerPart"
  ],
  floor: ["setupFeeApplied"]
};
var MATERIAL_LABEL = { vinyl: "Vinyl", laminate: "Laminate", transfer_tape: "Transfer tape" };
var MATERIAL_PRICE_HOLD = { vinyl: "vinylPrice", laminate: "laminatePrice", transfer_tape: "ttPrice" };
var vinylMaterialIssues = (row, role, wfIdx, wfId) => {
  const issues = [];
  const label = MATERIAL_LABEL[role] || "Material";
  const priceHold = MATERIAL_PRICE_HOLD[role] || "layout";
  const invId = row?.id ?? null;
  const add = (field, code, message, hold) => issues.push(issue("vinyl_catalog", { index: wfIdx, componentId: wfId, inventoryId: invId, field, code, message, hold }));
  if (vinylPositiveNumber(row?.roll_width_inches) === null) {
    add(
      "roll_width_inches",
      `vinyl_${role}_roll_width_unavailable`,
      `record a positive, finite ${label} roll width (inches) in Vinyl Inventory before repricing`,
      role === "vinyl" ? "layout" : priceHold
    );
  }
  const mode = recorded(row?.pricing_mode) ? row.pricing_mode : "per_roll";
  if (!["per_roll", "per_sqft", "per_linear_foot"].includes(mode)) {
    add(
      "pricing_mode",
      `vinyl_${role}_pricing_mode_unavailable`,
      `set a supported ${label} pricing mode (per_roll / per_sqft / per_linear_foot) in Vinyl Inventory before repricing`,
      priceHold
    );
  } else if (mode === "per_sqft") {
    if (vinylNonNegativeNumber(row?.cost_per_sqft) === null) {
      add(
        "cost_per_sqft",
        `vinyl_${role}_price_unavailable`,
        `record a finite, nonnegative ${label} cost per sq ft \u2014 a missing price is not free`,
        priceHold
      );
    }
  } else if (mode === "per_linear_foot") {
    if (vinylNonNegativeNumber(row?.cost_per_linear_foot) === null) {
      add(
        "cost_per_linear_foot",
        `vinyl_${role}_price_unavailable`,
        `record a finite, nonnegative ${label} cost per linear foot \u2014 a missing price is not free`,
        priceHold
      );
    }
  } else {
    if (vinylNonNegativeNumber(row?.cost_per_roll) === null) {
      add(
        "cost_per_roll",
        `vinyl_${role}_price_unavailable`,
        `record a finite, nonnegative ${label} cost per roll \u2014 a missing price is not free`,
        priceHold
      );
    }
    if (vinylPositiveNumber(row?.roll_length_yards) === null) {
      add(
        "roll_length_yards",
        `vinyl_${role}_roll_length_unavailable`,
        `record a positive, finite ${label} roll length (yards) in Vinyl Inventory before repricing`,
        role === "vinyl" ? "layout" : priceHold
      );
    }
  }
  if (recorded(row?.waste_factor_percent) && vinylNonNegativeNumber(row.waste_factor_percent) === null) {
    add(
      "waste_factor_percent",
      `vinyl_${role}_waste_factor_unavailable`,
      `record a finite, nonnegative ${label} waste factor % or clear it in Vinyl Inventory`,
      priceHold
    );
  }
  return issues;
};
var machineAdd = (issues, wfIdx, machine, field, code, message, hold) => issues.push(issue("vinyl_catalog", { index: wfIdx, inventoryId: machine?.id ?? null, field, code, message, hold }));
var leadingMachineIssues = (issues, wfIdx, machine, label, overrides) => {
  const { gutterHOverridden, gutterVOverridden } = overrides;
  for (const [field, human] of [
    ["left_margin_inches", "left margin (inches)"],
    ["right_margin_inches", "right margin (inches)"],
    ["leading_edge_inches", "leading edge (inches)"],
    ["trailing_edge_inches", "trailing edge (inches)"]
  ]) {
    if (recorded(machine?.[field]) && vinylNonNegativeNumber(machine[field]) === null) {
      machineAdd(
        issues,
        wfIdx,
        machine,
        field,
        "vinyl_machine_margin_unavailable",
        `record a finite, nonnegative ${label} ${human} in Vinyl Settings before repricing`,
        "layout"
      );
    }
  }
  if (!gutterHOverridden && recorded(machine?.default_gutter_horizontal_inches) && vinylNonNegativeNumber(machine.default_gutter_horizontal_inches) === null) {
    machineAdd(
      issues,
      wfIdx,
      machine,
      "default_gutter_horizontal_inches",
      "vinyl_machine_gutter_unavailable",
      `record a finite, nonnegative ${label} default horizontal gutter in Vinyl Settings or set a workflow override`,
      "layout"
    );
  }
  if (!gutterVOverridden && recorded(machine?.default_gutter_vertical_inches) && vinylNonNegativeNumber(machine.default_gutter_vertical_inches) === null) {
    machineAdd(
      issues,
      wfIdx,
      machine,
      "default_gutter_vertical_inches",
      "vinyl_machine_gutter_unavailable",
      `record a finite, nonnegative ${label} default vertical gutter in Vinyl Settings or set a workflow override`,
      "layout"
    );
  }
  if (recorded(machine?.default_bleed_inches) && vinylNonNegativeNumber(machine.default_bleed_inches) === null) {
    machineAdd(
      issues,
      wfIdx,
      machine,
      "default_bleed_inches",
      "vinyl_machine_bleed_unavailable",
      `record a finite, nonnegative ${label} default bleed (inches) in Vinyl Settings`,
      "layout"
    );
  }
  if (recorded(machine?.max_media_width_inches) && vinylPositiveNumber(machine.max_media_width_inches) === null) {
    machineAdd(
      issues,
      wfIdx,
      machine,
      "max_media_width_inches",
      "vinyl_machine_max_width_unavailable",
      `record a positive, finite ${label} max media width in Vinyl Settings before repricing`,
      "layout"
    );
  }
};
var printerIssues = (issues, wfIdx, printer) => {
  if (vinylNonNegativeNumber(printer?.machine_hourly_rate) === null) {
    machineAdd(
      issues,
      wfIdx,
      printer,
      "machine_hourly_rate",
      "vinyl_machine_rate_unavailable",
      "record a finite, nonnegative printer machine hourly rate in Vinyl Settings \u2014 a missing rate is not free",
      "printerMachine"
    );
  }
  if (recorded(printer?.print_speed_sqft_per_hour) && vinylPositiveNumber(printer.print_speed_sqft_per_hour) === null) {
    machineAdd(
      issues,
      wfIdx,
      printer,
      "print_speed_sqft_per_hour",
      "vinyl_machine_speed_unavailable",
      "record a positive, finite printer speed (sq ft/hour) in Vinyl Settings before repricing",
      "printerMachine"
    );
  }
  for (const field of ["warmup_minutes", "media_load_minutes", "calibration_minutes_per_job"]) {
    if (recorded(printer?.[field]) && vinylNonNegativeNumber(printer[field]) === null) {
      machineAdd(
        issues,
        wfIdx,
        printer,
        field,
        "vinyl_machine_minutes_unavailable",
        `record a finite, nonnegative printer ${field.replace(/_/g, " ")} in Vinyl Settings before repricing`,
        "printerMachine"
      );
    }
  }
};
var cutterIssues = (issues, wfIdx, cutter) => {
  if (vinylNonNegativeNumber(cutter?.machine_hourly_rate) === null) {
    machineAdd(
      issues,
      wfIdx,
      cutter,
      "machine_hourly_rate",
      "vinyl_machine_rate_unavailable",
      "record a finite, nonnegative cutter machine hourly rate in Vinyl Settings \u2014 a missing rate is not free",
      "cutterMachine"
    );
  }
  if (vinylNonNegativeNumber(cutter?.cut_blade_cost) === null) {
    machineAdd(
      issues,
      wfIdx,
      cutter,
      "cut_blade_cost",
      "vinyl_machine_blade_unavailable",
      "record a finite, nonnegative cutter blade cost in Vinyl Settings \u2014 a missing blade cost is not free",
      "cutterMachine"
    );
  }
  if (recorded(cutter?.cut_speed_inches_per_second) && vinylPositiveNumber(cutter.cut_speed_inches_per_second) === null) {
    machineAdd(
      issues,
      wfIdx,
      cutter,
      "cut_speed_inches_per_second",
      "vinyl_machine_speed_unavailable",
      "record a positive, finite cut speed (inches/second) in Vinyl Settings before repricing",
      "cutterMachine"
    );
  }
  if (recorded(cutter?.cut_setup_minutes_per_job) && vinylNonNegativeNumber(cutter.cut_setup_minutes_per_job) === null) {
    machineAdd(
      issues,
      wfIdx,
      cutter,
      "cut_setup_minutes_per_job",
      "vinyl_machine_minutes_unavailable",
      "record a finite, nonnegative cut setup minutes in Vinyl Settings before repricing",
      "cutterMachine"
    );
  }
  if (recorded(cutter?.cut_blade_life_minutes) && vinylPositiveNumber(cutter.cut_blade_life_minutes) === null) {
    machineAdd(
      issues,
      wfIdx,
      cutter,
      "cut_blade_life_minutes",
      "vinyl_machine_blade_unavailable",
      "record a positive, finite blade life (minutes) in Vinyl Settings before repricing",
      "cutterMachine"
    );
  }
  if (recorded(cutter?.cut_pull_off_inches_per_job) && vinylNonNegativeNumber(cutter.cut_pull_off_inches_per_job) === null) {
    machineAdd(
      issues,
      wfIdx,
      cutter,
      "cut_pull_off_inches_per_job",
      "vinyl_machine_pull_off_unavailable",
      "record a finite, nonnegative cut pull-off (inches/job) in Vinyl Settings before repricing",
      "layout"
    );
  }
};
var laminatorIssues = (issues, wfIdx, laminator, isLeading) => {
  if (vinylNonNegativeNumber(laminator?.laminator_hourly_rate) === null) {
    machineAdd(
      issues,
      wfIdx,
      laminator,
      "laminator_hourly_rate",
      "vinyl_machine_rate_unavailable",
      "record a finite, nonnegative laminator hourly rate in Vinyl Settings \u2014 a missing rate is not free",
      "laminatorMachine"
    );
  }
  if (recorded(laminator?.laminator_speed_inches_per_minute) && vinylPositiveNumber(laminator.laminator_speed_inches_per_minute) === null) {
    machineAdd(
      issues,
      wfIdx,
      laminator,
      "laminator_speed_inches_per_minute",
      "vinyl_machine_speed_unavailable",
      "record a positive, finite laminator speed (inches/minute) in Vinyl Settings before repricing",
      "laminatorMachine"
    );
  }
  if (recorded(laminator?.laminator_setup_minutes_per_job) && vinylNonNegativeNumber(laminator.laminator_setup_minutes_per_job) === null) {
    machineAdd(
      issues,
      wfIdx,
      laminator,
      "laminator_setup_minutes_per_job",
      "vinyl_machine_minutes_unavailable",
      "record a finite, nonnegative laminator setup minutes in Vinyl Settings before repricing",
      "laminatorMachine"
    );
  }
  if (!isLeading) {
    for (const field of ["leading_edge_inches", "trailing_edge_inches"]) {
      if (recorded(laminator?.[field]) && vinylNonNegativeNumber(laminator[field]) === null) {
        machineAdd(
          issues,
          wfIdx,
          laminator,
          field,
          "vinyl_machine_edge_unavailable",
          `record a finite, nonnegative laminator ${field.replace(/_/g, " ")} in Vinyl Settings before repricing`,
          "laminatePrice"
        );
      }
    }
  }
};
var vinylWorkflowIssues = (workflow, resolved, index = 0) => {
  const issues = [];
  const wfId = workflow?.id ?? null;
  const items = workflow?.items || [];
  const hasItems = items.length > 0;
  const applyPrint = !!workflow?.apply_print;
  const applyCut = !!workflow?.apply_cut;
  const applyLaminate = !!workflow?.apply_laminate;
  const applyTT = !!workflow?.apply_transfer_tape;
  const { vinyl, laminate, transferTape, printer, cutter, laminator } = resolved;
  const add = (field, code, message, hold, itemIndex = null) => issues.push(issue("vinyl", { index, itemIndex, field, code, message, hold }));
  if (hasItems) {
    if (!recorded(workflow?.vinyl_id)) {
      add(
        "vinyl_id",
        "vinyl_material_unassigned",
        `Workflow ${index + 1}: select a base vinyl before repricing \u2014 an unselected material prices as $0`,
        "layout"
      );
    } else if (!vinyl) {
      issues.push(issue("vinyl", {
        index,
        inventoryId: workflow.vinyl_id,
        field: "vinyl_id",
        code: "vinyl_material_unavailable",
        hold: "layout",
        message: `Workflow ${index + 1}: the selected vinyl record is no longer available \u2014 reselect it`
      }));
    }
    if (applyLaminate) {
      if (!recorded(workflow?.laminate_id)) {
        add(
          "laminate_id",
          "vinyl_laminate_unassigned",
          `Workflow ${index + 1}: laminate is applied but no laminate roll is selected`,
          "laminatePrice"
        );
      } else if (!laminate) {
        issues.push(issue("vinyl", {
          index,
          inventoryId: workflow.laminate_id,
          field: "laminate_id",
          code: "vinyl_laminate_unavailable",
          hold: "laminatePrice",
          message: `Workflow ${index + 1}: the selected laminate record is no longer available \u2014 reselect it`
        }));
      }
    }
    if (applyTT) {
      if (!recorded(workflow?.transfer_tape_id)) {
        add(
          "transfer_tape_id",
          "vinyl_transfer_tape_unassigned",
          `Workflow ${index + 1}: transfer tape is applied but no tape roll is selected`,
          "ttPrice"
        );
      } else if (!transferTape) {
        issues.push(issue("vinyl", {
          index,
          inventoryId: workflow.transfer_tape_id,
          field: "transfer_tape_id",
          code: "vinyl_transfer_tape_unavailable",
          hold: "ttPrice",
          message: `Workflow ${index + 1}: the selected transfer tape record is no longer available \u2014 reselect it`
        }));
      }
    }
    for (const [flag, id, row, label] of [
      [applyPrint, workflow?.printer_id, printer, "printer"],
      [applyCut, workflow?.cutter_id, cutter, "cutter"],
      [applyLaminate, workflow?.laminator_id, laminator, "laminator"]
    ]) {
      if (!flag) continue;
      const field = `${label}_id`;
      if (!recorded(id)) {
        add(
          field,
          "vinyl_machine_unassigned",
          `Workflow ${index + 1}: ${label} is applied but no ${label} is selected \u2014 machine time would price as $0`,
          "layout"
        );
      } else if (!row) {
        issues.push(issue("vinyl", {
          index,
          inventoryId: id,
          field,
          code: "vinyl_machine_unavailable",
          hold: "layout",
          message: `Workflow ${index + 1}: the selected ${label} record is no longer available \u2014 reselect it`
        }));
      }
    }
  }
  items.forEach((it, itemIndex) => {
    const where = `Part ${itemIndex + 1}${it?.description ? ` "${it.description}"` : ""} (workflow ${index + 1})`;
    for (const [field, human] of [["width_inches", "width"], ["height_inches", "height"]]) {
      if (vinylPositiveNumber(it?.[field]) === null) {
        add(
          field,
          "vinyl_part_dimension_unavailable",
          `${where}: record a positive, finite ${human} (inches) \u2014 a blank or zero dimension drops the part silently`,
          "layout",
          itemIndex
        );
      }
    }
    if (recorded(it?.quantity) && vinylPositiveInteger(it.quantity) === null) {
      add(
        "quantity",
        "vinyl_part_quantity_unavailable",
        `${where}: record a positive whole-number quantity`,
        "layout",
        itemIndex
      );
    }
    if (recorded(it?.bleed_inches) && vinylNonNegativeNumber(it.bleed_inches) === null) {
      add(
        "bleed_inches",
        "vinyl_part_bleed_unavailable",
        `${where}: record a finite, nonnegative bleed (inches) or clear it`,
        "layout",
        itemIndex
      );
    }
  });
  if (vinyl && hasItems) {
    vinylMaterialIssues(vinyl, "vinyl", index, wfId).forEach((i) => issues.push(i));
  }
  if (laminate && applyLaminate && hasItems) {
    vinylMaterialIssues(laminate, "laminate", index, wfId).forEach((i) => issues.push(i));
  }
  if (transferTape && applyTT && hasItems) {
    vinylMaterialIssues(transferTape, "transfer_tape", index, wfId).forEach((i) => issues.push(i));
  }
  const leadingMachine = applyPrint && printer || applyCut && cutter || applyLaminate && laminator || printer || cutter || laminator;
  if (leadingMachine && hasItems) {
    const label = leadingMachine.machine_name || "machine";
    leadingMachineIssues(issues, index, leadingMachine, label, {
      gutterHOverridden: recorded(workflow?.gutter_h_override),
      gutterVOverridden: recorded(workflow?.gutter_v_override)
    });
  }
  if (applyPrint && printer) printerIssues(issues, index, printer);
  if (applyCut && cutter) cutterIssues(issues, index, cutter);
  if (applyLaminate && laminator) {
    laminatorIssues(issues, index, laminator, leadingMachine === laminator);
  }
  if (applyPrint && printer && hasItems) {
    const quality = workflow?.print_quality || printer?.default_print_quality || "high_quality";
    if (!["draft", "production", "high_quality"].includes(quality)) {
      const srcField = recorded(workflow?.print_quality) ? "print_quality" : "default_print_quality";
      if (srcField === "print_quality") {
        add(
          "print_quality",
          "vinyl_print_quality_unavailable",
          `Workflow ${index + 1}: set a supported print quality (draft / production / high_quality)`,
          "inkPrice"
        );
      } else {
        machineAdd(
          issues,
          index,
          printer,
          "default_print_quality",
          "vinyl_print_quality_unavailable",
          "set a supported default print quality on the printer in Vinyl Settings",
          "inkPrice"
        );
      }
    }
    const tierField = { draft: "print_cost_per_sqin_draft", production: "print_cost_per_sqin_production", high_quality: "print_cost_per_sqin_high_quality" }[quality];
    const tiered = vinylNonNegativeNumber(printer?.[tierField]);
    if (!(tiered !== null && tiered > 0)) {
      if (vinylNonNegativeNumber(printer?.print_cost_per_sqin) === null) {
        machineAdd(
          issues,
          index,
          printer,
          recorded(printer?.[tierField]) ? tierField : "print_cost_per_sqin",
          "vinyl_ink_rate_unavailable",
          `record a finite, nonnegative printer ink cost per sq in (${quality.replace(/_/g, " ")} tier or the flat rate) in Vinyl Settings \u2014 a missing ink rate is not free`,
          "inkPrice"
        );
      }
    }
  }
  for (const [field, human] of [["gutter_h_override", "horizontal gutter"], ["gutter_v_override", "vertical gutter"]]) {
    if (hasItems && recorded(workflow?.[field]) && vinylNonNegativeNumber(workflow[field]) === null) {
      add(
        field,
        "vinyl_gutter_override_unavailable",
        `Workflow ${index + 1}: record a finite, nonnegative ${human} override (inches) or clear it`,
        "layout"
      );
    }
  }
  if (hasItems && recorded(workflow?.spoilage_buffer_percent) && vinylNonNegativeNumber(workflow.spoilage_buffer_percent) === null) {
    add(
      "spoilage_buffer_percent",
      "vinyl_spoilage_unavailable",
      `Workflow ${index + 1}: record a finite, nonnegative spoilage buffer % or clear it`,
      "layout"
    );
  }
  if (recorded(workflow?.setup_fee_floor) && vinylNonNegativeNumber(workflow.setup_fee_floor) === null) {
    add(
      "setup_fee_floor",
      "vinyl_setup_fee_unavailable",
      `Workflow ${index + 1}: record a finite, nonnegative setup-fee floor ($) or clear it`,
      "floor"
    );
  }
  if (applyCut && hasItems) {
    const wd = workflow?.weeding_difficulty;
    if (recorded(wd) && !(wd in WEEDING_LABOR_MINUTES_PER_PART)) {
      add(
        "weeding_difficulty",
        "vinyl_weeding_difficulty_unavailable",
        `Workflow ${index + 1}: choose a supported weeding difficulty`,
        "labor"
      );
    }
    if (recorded(workflow?.weeding_minutes_per_part_override) && vinylNonNegativeNumber(workflow.weeding_minutes_per_part_override) === null) {
      add(
        "weeding_minutes_per_part_override",
        "vinyl_weeding_override_unavailable",
        `Workflow ${index + 1}: record a finite, nonnegative weeding minutes/part override or clear it`,
        "labor"
      );
    }
  }
  if (hasItems && recorded(workflow?.install_minutes_per_part) && vinylNonNegativeNumber(workflow.install_minutes_per_part) === null) {
    add(
      "install_minutes_per_part",
      "vinyl_install_minutes_unavailable",
      `Workflow ${index + 1}: record a finite, nonnegative application minutes/part or clear it`,
      "labor"
    );
  }
  (workflow?.personnel || []).forEach((p, itemIndex) => {
    const hrs = recorded(p?.hours) ? vinylNumber(p.hours) : null;
    const rate = recorded(p?.hourly_rate) ? vinylNumber(p.hourly_rate) : null;
    const role = p?.role || `role ${itemIndex + 1}`;
    const hasHours = hrs !== null && hrs > 0;
    if (recorded(p?.hours) && (hrs === null || hrs < 0)) {
      add(
        "hours",
        "vinyl_personnel_hours_unavailable",
        `Role "${role}" (workflow ${index + 1}): record a finite, nonnegative hours value or clear it`,
        "labor",
        itemIndex
      );
    }
    if (recorded(p?.hourly_rate) && (rate === null || rate < 0)) {
      add(
        "hourly_rate",
        "vinyl_personnel_rate_unavailable",
        `Role "${role}" (workflow ${index + 1}): record a finite, nonnegative hourly rate`,
        "labor",
        itemIndex
      );
    }
    if (hasHours && (rate === null || rate <= 0)) {
      add(
        "hourly_rate",
        "vinyl_personnel_rate_unavailable",
        `Role "${role}" (workflow ${index + 1}): record a positive hourly rate or clear the hours \u2014 ${hrs} hr would bill $0`,
        "labor",
        itemIndex
      );
    }
  });
  const usablePersonnel = (workflow?.personnel || []).some(
    (p) => vinylPositiveNumber(p?.hours) !== null && vinylPositiveNumber(p?.hourly_rate) !== null
  );
  if (hasItems && !usablePersonnel) {
    const resolved2 = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate;
    const resolvedFrom = printer?.operator_hourly_rate != null ? printer : cutter?.operator_hourly_rate != null ? cutter : laminator?.operator_hourly_rate != null ? laminator : null;
    if (resolved2 != null && vinylNonNegativeNumber(resolved2) === null && resolvedFrom) {
      machineAdd(
        issues,
        index,
        resolvedFrom,
        "operator_hourly_rate",
        "vinyl_operator_rate_unavailable",
        `record a finite, nonnegative operator hourly rate on ${resolvedFrom.machine_name || "the leading machine"} in Vinyl Settings, or add workflow personnel`,
        "labor"
      );
    }
  }
  return issues;
};
var num2 = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
var calcVinylWorkflow = ({ workflow, vinyls = [], machines = [], index = 0 }) => {
  const printer = machines.find((m) => m.id === workflow?.printer_id) || null;
  const cutter = machines.find((m) => m.id === workflow?.cutter_id) || null;
  const laminator = machines.find((m) => m.id === workflow?.laminator_id) || null;
  const vinyl = vinyls.find((v) => v.id === workflow?.vinyl_id) || null;
  const laminate = vinyls.find((v) => v.id === workflow?.laminate_id) || null;
  const transferTape = vinyls.find((v) => v.id === workflow?.transfer_tape_id) || null;
  const resolved = { vinyl, laminate, transferTape, printer, cutter, laminator };
  const issues = vinylWorkflowIssues(workflow, resolved, index);
  const operatorRate = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate ?? 45;
  const calc = calculateVinylProject({
    items: workflow?.items || [],
    printer,
    cutter,
    laminator,
    vinyl,
    laminate,
    transferTape,
    operatorHourlyRate: operatorRate,
    applyPrint: !!workflow?.apply_print,
    applyCut: !!workflow?.apply_cut,
    applyLaminate: !!workflow?.apply_laminate,
    applyTransferTape: !!workflow?.apply_transfer_tape,
    overrideGutterH: workflow?.gutter_h_override === "" || workflow?.gutter_h_override == null ? void 0 : num2(workflow.gutter_h_override),
    overrideGutterV: workflow?.gutter_v_override === "" || workflow?.gutter_v_override == null ? void 0 : num2(workflow.gutter_v_override),
    printQuality: workflow?.print_quality || printer?.default_print_quality || "high_quality",
    weedingDifficulty: workflow?.weeding_difficulty || "moderate",
    weedingMinutesPerPartOverride: workflow?.weeding_minutes_per_part_override,
    installMinutesPerPart: workflow?.install_minutes_per_part,
    personnel: workflow?.personnel || [],
    spoilageBufferPercent: num2(workflow?.spoilage_buffer_percent),
    setupFeeFloor: num2(workflow?.setup_fee_floor)
  });
  if (calc.partsUnplaced > 0) {
    issues.push(issue("vinyl", {
      index,
      field: "items",
      code: "vinyl_parts_unplaced",
      hold: "layout",
      message: `Workflow ${index + 1}: ${calc.partsUnplaced} part(s) do not fit on the usable roll width \u2014 rotate, split, or choose a wider roll`
    }));
  }
  const held = issues.length > 0;
  if (!held) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held, resolved };
  }
  const out = { ...calc };
  const poisoned = /* @__PURE__ */ new Set();
  issues.forEach((i) => (HOLD_FIELDS[i.hold] || HOLD_FIELDS.layout).forEach((f) => poisoned.add(f)));
  for (const f of poisoned) out[f] = null;
  const sumOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
  out.materialCost = sumOrNull(out.vinylCost, out.laminateCost, out.transferTapeCost, out.inkCost, out.bladeCost);
  out.machineCost = sumOrNull(out.printMachineCost, out.cutMachineCost, out.laminateMachineCost);
  out.preFloorTotal = sumOrNull(out.materialCost, out.machineCost, out.laborCost);
  out.setupFeeApplied = poisoned.has("setupFeeApplied") || !Number.isFinite(out.preFloorTotal) ? null : calc.setupFeeApplied;
  out.totalCost = Number.isFinite(out.preFloorTotal) && Number.isFinite(out.setupFeeApplied) ? out.preFloorTotal + out.setupFeeApplied : null;
  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held, resolved };
};
var vinylProjectInputIssues = (project, { settings = {}, equipmentInventory = [] } = {}) => {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("vinyl", { field, code, message, hold: "project" }));
  const addCat = (field, code, message, inventoryId = null) => issues.push(issue("vinyl_catalog", { field, code, message, hold: "project", inventoryId }));
  (project?.selected_equipment || []).forEach((e, itemIndex) => {
    const name = e?.equipment_name || `row ${itemIndex + 1}`;
    if (recorded(e?.equipment_id) && !equipmentInventory.some((inv) => inv.id === e.equipment_id)) {
      addCat(
        "selected_equipment",
        "vinyl_equipment_unavailable",
        `Equipment "${name}": the selected equipment record is no longer available \u2014 reselect it`,
        e.equipment_id
      );
    }
    if (vinylNonNegativeNumber(e?.total_cost) === null) {
      add(
        "total_cost",
        "vinyl_equipment_cost_unavailable",
        `Equipment "${name}": record a finite, nonnegative total cost \u2014 a missing cost is not free`
      );
    }
  });
  (project?.personnel || []).forEach((p, itemIndex) => {
    const role = p?.role || p?.name || `row ${itemIndex + 1}`;
    if (vinylNonNegativeNumber(p?.total_cost) === null) {
      add(
        "total_cost",
        "vinyl_personnel_cost_unavailable",
        `Crew "${role}": record a finite, nonnegative total cost \u2014 a missing cost is not free`
      );
    }
  });
  if ((project?.personnel || []).length > 0) {
    const roleMap = {
      "Crew Lead": "install_crew_lead_rate",
      "Installer": "install_installer_rate",
      "Helper": "install_helper_rate"
    };
    const rolesPresent = new Set((project.personnel || []).map((p) => p?.role).filter((r) => r in roleMap));
    rolesPresent.forEach((role) => {
      const field = roleMap[role];
      if (vinylPositiveNumber(settings?.[field]) === null) {
        addCat(
          field,
          "vinyl_install_rate_unavailable",
          `Setting ${field}: record a positive, finite ${role} rate in Installation Settings \u2014 crew pricing is unavailable`
        );
      }
    });
  }
  const miles = project?.travel_miles_round_trip;
  const milesNum = recorded(miles) && miles !== 0 ? vinylNonNegativeNumber(miles) : 0;
  if (recorded(miles) && miles !== "" && vinylNonNegativeNumber(miles) === null) {
    add(
      "travel_miles_round_trip",
      "vinyl_travel_miles_unavailable",
      "record a finite, nonnegative round-trip mileage \u2014 travel pricing is unavailable"
    );
  }
  if (recorded(project?.total_travel_cost) && project.total_travel_cost !== "" && vinylNonNegativeNumber(project.total_travel_cost) === null) {
    add(
      "total_travel_cost",
      "vinyl_travel_cost_unavailable",
      "recorded travel cost is not a finite, nonnegative number \u2014 recalculate travel before repricing"
    );
  }
  if (milesNum !== null && milesNum > 0) {
    for (const [field, human] of [
      ["install_gasoline_price_per_gallon", "gasoline price per gallon"],
      ["install_diesel_price_per_gallon", "diesel price per gallon"],
      ["install_travel_labor_rate", "travel labor rate"],
      ["install_travel_avg_speed_mph", "travel average speed (mph)"]
    ]) {
      if (vinylPositiveNumber(settings?.[field]) === null) {
        addCat(
          field,
          "vinyl_travel_setting_unavailable",
          `Setting ${field}: record a positive, finite ${human} in Installation Settings \u2014 travel pricing is unavailable`
        );
      }
    }
    for (const [field, human] of [
      ["install_travel_overhead_per_mile", "travel overhead per mile"],
      ["install_min_travel_charge", "minimum travel charge"]
    ]) {
      if (recorded(settings?.[field]) && vinylNonNegativeNumber(settings[field]) === null) {
        addCat(
          field,
          "vinyl_travel_setting_unavailable",
          `Setting ${field}: record a finite, nonnegative ${human} in Installation Settings \u2014 travel pricing is unavailable`
        );
      }
    }
    (project?.selected_equipment || []).forEach((e) => {
      if (!recorded(e?.equipment_id)) return;
      const inv = equipmentInventory.find((r) => r.id === e.equipment_id);
      if (!inv) return;
      const owned = inv.ownership === "owned" || inv.pricing_mode === "owned_flat";
      const isVehicle = ["van", "truck", "vehicle", "suv", "car"].includes(String(inv.equipment_type || "").toLowerCase());
      if (owned && isVehicle && vinylPositiveNumber(inv.mpg) === null) {
        addCat(
          "mpg",
          "vinyl_vehicle_mpg_unavailable",
          `Equipment "${inv.equipment_name || e.equipment_name}": record a positive, finite MPG in inventory \u2014 travel fuel pricing is unavailable`,
          inv.id
        );
      }
    });
  }
  if (recorded(project?.supplies_percent_of_materials) && vinylNonNegativeNumber(project.supplies_percent_of_materials) === null) {
    add(
      "supplies_percent_of_materials",
      "vinyl_supplies_percent_unavailable",
      "record a finite, nonnegative supplies % of materials or clear it"
    );
  }
  if (recorded(project?.extra_supplies_cost) && vinylNonNegativeNumber(project.extra_supplies_cost) === null) {
    add(
      "extra_supplies_cost",
      "vinyl_extra_supplies_unavailable",
      "record a finite, nonnegative extra supplies cost ($) or clear it"
    );
  }
  if (recorded(project?.markup_percent) && vinylNonNegativeNumber(project.markup_percent) === null) {
    add(
      "markup_percent",
      "vinyl_markup_unavailable",
      "record a finite, nonnegative markup % or clear it"
    );
  }
  return issues;
};
var issuesForField = (issues = [], field, itemIndex = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
var hasIssueFor = (issues = [], field, itemIndex = null) => issuesForField(issues, field, itemIndex).length > 0;

// frozen:/app/src/components/vinylEstimator/vinylProjectHelpers.jsx
var blankWorkflow = (index = 0) => ({
  id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: `Workflow ${index + 1}`,
  vinyl_id: "",
  laminate_id: "",
  transfer_tape_id: "",
  printer_id: "",
  cutter_id: "",
  laminator_id: "",
  apply_print: true,
  apply_cut: true,
  apply_laminate: false,
  apply_transfer_tape: false,
  // Leave blank so the selected printer's VinylMachine.default_print_quality
  // controls new workflows. The calculator still falls back to high_quality
  // when a machine has no explicit default.
  print_quality: "",
  weeding_difficulty: "moderate",
  // #5 — "Normal" default
  weeding_minutes_per_part_override: "",
  install_minutes_per_part: "",
  // #6
  personnel: [],
  // #7
  spoilage_buffer_percent: "",
  // #4
  setup_fee_floor: "",
  // #3
  items: [],
  gutter_h_override: "",
  gutter_v_override: ""
});
var blankVinylProject = () => ({
  project_name: "",
  client_name: "",
  estimate_number: "",
  hyperlink: "",
  site_address: "",
  install_environment: "exterior",
  status: "draft",
  // NEW: multi-workflow model. Legacy projects (single vinyl_id at the top)
  // get auto-migrated into a single workflow at load time.
  workflows: [blankWorkflow(0)],
  items: [],
  // legacy — kept blank to satisfy the entity schema
  // Installation
  selected_equipment: [],
  personnel: [],
  travel_miles_round_trip: 0,
  total_travel_cost: 0,
  // Project-level cost knobs
  supplies_percent_of_materials: 5,
  extra_supplies_cost: 0,
  markup_percent: 0,
  notes: ""
});
var migrateProject = (saved) => {
  const merged = { ...blankVinylProject(), ...saved };
  if (!Array.isArray(merged.workflows) || merged.workflows.length === 0) {
    const wf = blankWorkflow(0);
    wf.vinyl_id = saved?.default_vinyl_id || "";
    wf.laminate_id = saved?.default_laminate_id || "";
    wf.printer_id = saved?.printer_id || "";
    wf.cutter_id = saved?.cutter_id || "";
    wf.laminator_id = saved?.laminator_id || "";
    wf.apply_laminate = !!saved?.default_laminate_id;
    wf.items = Array.isArray(saved?.items) ? saved.items : [];
    merged.workflows = [wf];
  }
  return merged;
};
var sumWorkflowField = (workflows, field) => {
  let total = 0;
  for (const wf of workflows || []) {
    const calc = wf?._calc;
    if (calc == null) continue;
    const v = calc[field];
    if (v === void 0) continue;
    if (!Number.isFinite(v)) return null;
    total += v;
  }
  return Number.isFinite(total) ? total : null;
};
var addOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
var mulOrNull = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? a * b : null;
var sumRowField = (rows, field) => {
  let total = 0;
  for (const r of rows || []) {
    const v = vinylNumber(r?.[field]);
    if (v === null) return null;
    total += v;
  }
  return total;
};
var SAVED_KEYS = {
  vinylCost: "total_vinyl_cost",
  laminateCost: "total_laminate_cost",
  inkCost: "total_ink_cost",
  bladeCost: "total_blade_cost",
  machineCost: "total_machine_cost",
  laborCost: "labor_cost",
  laborHours: "labor_hours",
  usedSqFt: "total_print_sqft",
  totalRollSqFt: "total_vinyl_sqft",
  laminateSqFt: "total_laminate_sqft",
  equipmentCost: "total_equipment_cost",
  personnelCost: "total_personnel_cost",
  travelCost: "total_travel_cost",
  baseSupplies: "base_supplies_cost",
  supplies: "total_supplies_cost",
  subtotal: "subtotal",
  markupAmount: "markup_amount",
  totalCost: "total_cost",
  materialCost: null,
  setupFeeApplied: null
};
var rollupVinylProject = (project, { savedProject = project } = {}) => {
  const wfs = project.workflows || [];
  const optionalNonNeg = (v) => v === void 0 || v === null || v === "" ? 0 : vinylNonNegativeNumber(v);
  const cat = (key, current) => Number.isFinite(current) ? current : SAVED_KEYS[key] && hasVinylCostSnapshot(savedProject?.[SAVED_KEYS[key]]) ? savedProject[SAVED_KEYS[key]] : null;
  const materialCost = cat("materialCost", sumWorkflowField(wfs, "materialCost"));
  const machineCost = cat("machineCost", sumWorkflowField(wfs, "machineCost"));
  const laborCost = cat("laborCost", sumWorkflowField(wfs, "laborCost"));
  const laborHours = cat("laborHours", sumWorkflowField(wfs, "laborHours"));
  const vinylCost = cat("vinylCost", sumWorkflowField(wfs, "vinylCost"));
  const laminateCost = cat("laminateCost", sumWorkflowField(wfs, "laminateCost"));
  const inkCost = cat("inkCost", sumWorkflowField(wfs, "inkCost"));
  const bladeCost = cat("bladeCost", sumWorkflowField(wfs, "bladeCost"));
  const usedSqFt = cat("usedSqFt", sumWorkflowField(wfs, "usedSqFt"));
  const totalRollSqFt = cat("totalRollSqFt", sumWorkflowField(wfs, "totalRollSqFtPulled"));
  const laminateSqFt = cat("laminateSqFt", sumWorkflowField(wfs, "laminateSqFt"));
  const equipmentCost = cat("equipmentCost", sumRowField(project.selected_equipment, "total_cost"));
  const personnelCost = cat("personnelCost", sumRowField(project.personnel, "total_cost"));
  const travelCost = cat("travelCost", optionalNonNeg(project.total_travel_cost));
  const suppliesPct = optionalNonNeg(project.supplies_percent_of_materials);
  const baseSupplies = cat("baseSupplies", suppliesPct === null ? null : mulOrNull(materialCost, suppliesPct / 100));
  const supplies = cat("supplies", addOrNull(baseSupplies, optionalNonNeg(project.extra_supplies_cost)));
  const subtotal = cat("subtotal", addOrNull(materialCost, machineCost, laborCost, equipmentCost, personnelCost, travelCost, supplies));
  const markupPct = optionalNonNeg(project.markup_percent);
  const markupAmount = cat("markupAmount", markupPct === null ? null : mulOrNull(subtotal, markupPct / 100));
  const totalCost = cat("totalCost", addOrNull(subtotal, markupAmount));
  const setupFeeApplied = cat("setupFeeApplied", sumWorkflowField(wfs, "setupFeeApplied"));
  return {
    materialCost,
    machineCost,
    laborCost,
    laborHours,
    vinylCost,
    laminateCost,
    inkCost,
    bladeCost,
    usedSqFt,
    totalRollSqFt,
    laminateSqFt,
    equipmentCost,
    personnelCost,
    travelCost,
    baseSupplies,
    supplies,
    setupFeeApplied,
    subtotal,
    markupAmount,
    totalCost
  };
};

// frozen:/app/src/components/vinylEstimator/vinylCostHelpers.jsx
var num3 = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var computePerPartCosts = (calc, items) => {
  const byPartIdx = {};
  if (!calc || !calc.shelves || !(calc.usedSqFt > 0)) return byPartIdx;
  const totalUsedSqIn = calc.shelves.reduce(
    (s, sh) => s + sh.items.reduce((ss, it) => ss + it.w * it.h, 0),
    0
  );
  if (totalUsedSqIn <= 0) return byPartIdx;
  calc.shelves.forEach((sh) => sh.items.forEach((it) => {
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
    p.vinylCost = (calc.vinylCost || 0) * areaShare;
    p.laminateCost = (calc.laminateCost || 0) * areaShare;
    p.inkCost = (calc.inkCost || 0) * areaShare;
    p.cutCost = (calc.cutMachineCost || 0) * perimShare + (calc.bladeCost || 0) * perimShare;
    p.machineCost = (calc.printMachineCost || 0) * areaShare + (calc.laminateMachineCost || 0) * areaShare;
    p.laborCost = (calc.laborCost || 0) * areaShare;
    p.totalCost = p.vinylCost + p.laminateCost + p.inkCost + p.cutCost + p.machineCost + p.laborCost;
    p.costEach = p.partsPlaced > 0 ? p.totalCost / p.partsPlaced : 0;
    const sourceItem = items?.[parseInt(k)];
    p.description = sourceItem?.description || `Item ${parseInt(k) + 1}`;
  });
  return byPartIdx;
};
var computeWorkflowMetrics = (calc) => {
  const used = num3(calc?.usedSqFt);
  const pulled = num3(calc?.totalRollSqFtPulled);
  const totalCost = calc?.totalCost;
  const materialCost = calc?.materialCost;
  return {
    sqFtUsed: used,
    sqFtPulled: pulled,
    yieldPercent: pulled > 0 ? used / pulled * 100 : 0,
    wastePercent: pulled > 0 ? Math.max(0, (1 - used / pulled) * 100) : 0,
    costPerSqFt: used > 0 && Number.isFinite(totalCost) ? totalCost / used : null,
    materialPercent: Number.isFinite(totalCost) && totalCost > 0 && Number.isFinite(materialCost) ? materialCost / totalCost * 100 : null
  };
};
var computeStockUsage = (calc, vinyl) => {
  if (!calc || !vinyl) return null;
  const rollLengthIn = num3(vinyl.roll_length_yards) * 36;
  if (rollLengthIn <= 0) return null;
  if (!Number.isFinite(calc.lengthConsumedIn)) return null;
  const consumedIn = calc.lengthConsumedIn;
  const rollsNeeded = consumedIn / rollLengthIn;
  return {
    rollLengthIn,
    consumedIn,
    rollsNeeded,
    exceedsOneRoll: rollsNeeded > 1,
    fullRollsNeeded: Math.ceil(rollsNeeded),
    percentOfRoll: rollsNeeded * 100
  };
};
export {
  blankVinylProject,
  blankWorkflow,
  calcVinylWorkflow,
  calculateVinylProject,
  computePerPartCosts,
  computeStockUsage,
  computeWorkflowMetrics,
  hasIssueFor,
  hasVinylCostSnapshot,
  issuesForField,
  migrateProject,
  rollupVinylProject,
  sumWorkflowField,
  vinylDraftValue,
  vinylMaterialIssues,
  vinylNonNegativeNumber,
  vinylNumber,
  vinylPositiveNumber,
  vinylProjectInputIssues,
  vinylWorkflowIssues
};
