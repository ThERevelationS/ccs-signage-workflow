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
var sumWorkflowField = (workflows, field) => (workflows || []).reduce((s, wf) => s + (parseFloat(wf?._calc?.[field]) || 0), 0);
var rollupVinylProject = (project) => {
  const wfs = project.workflows || [];
  const num3 = (v) => parseFloat(v) || 0;
  const materialCost = sumWorkflowField(wfs, "materialCost");
  const machineCost = sumWorkflowField(wfs, "machineCost");
  const laborCost = sumWorkflowField(wfs, "laborCost");
  const laborHours = sumWorkflowField(wfs, "laborHours");
  const vinylCost = sumWorkflowField(wfs, "vinylCost");
  const laminateCost = sumWorkflowField(wfs, "laminateCost");
  const inkCost = sumWorkflowField(wfs, "inkCost");
  const bladeCost = sumWorkflowField(wfs, "bladeCost");
  const usedSqFt = sumWorkflowField(wfs, "usedSqFt");
  const totalRollSqFt = sumWorkflowField(wfs, "totalRollSqFtPulled");
  const laminateSqFt = sumWorkflowField(wfs, "laminateSqFt");
  const equipmentCost = (project.selected_equipment || []).reduce((s, e) => s + num3(e.total_cost), 0);
  const personnelCost = (project.personnel || []).reduce((s, p) => s + num3(p.total_cost), 0);
  const travelCost = num3(project.total_travel_cost);
  const baseSupplies = materialCost * (num3(project.supplies_percent_of_materials) / 100);
  const supplies = baseSupplies + num3(project.extra_supplies_cost);
  const subtotal = materialCost + machineCost + laborCost + equipmentCost + personnelCost + travelCost + supplies;
  const markupAmount = subtotal * (num3(project.markup_percent) / 100);
  const totalCost = subtotal + markupAmount;
  const setupFeeApplied = sumWorkflowField(wfs, "setupFeeApplied");
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
var num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var computePerPartCosts = (calc, items) => {
  const byPartIdx = {};
  if (!calc || !calc.shelves || calc.usedSqFt <= 0) return byPartIdx;
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
  const used = num(calc?.usedSqFt);
  const pulled = num(calc?.totalRollSqFtPulled);
  const totalCost = num(calc?.totalCost);
  const materialCost = num(calc?.materialCost);
  return {
    sqFtUsed: used,
    sqFtPulled: pulled,
    yieldPercent: pulled > 0 ? used / pulled * 100 : 0,
    wastePercent: pulled > 0 ? Math.max(0, (1 - used / pulled) * 100) : 0,
    costPerSqFt: used > 0 ? totalCost / used : 0,
    materialPercent: totalCost > 0 ? materialCost / totalCost * 100 : 0
  };
};
var computeStockUsage = (calc, vinyl) => {
  if (!calc || !vinyl) return null;
  const rollLengthIn = num(vinyl.roll_length_yards) * 36;
  if (rollLengthIn <= 0) return null;
  const consumedIn = num(calc.lengthConsumedIn);
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
var num2 = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var sqInToSqFt = (sqIn) => sqIn / 144;
var computeRollSqFtCost = (vinyl) => {
  if (!vinyl) return 0;
  const widthFt = num2(vinyl.roll_width_inches) / 12;
  const lenFt = num2(vinyl.roll_length_yards) * 3;
  const rollSqFt = widthFt * lenFt;
  if (vinyl.pricing_mode === "per_sqft") return num2(vinyl.cost_per_sqft);
  if (vinyl.pricing_mode === "per_linear_foot") return num2(vinyl.cost_per_linear_foot) / Math.max(widthFt, 0.01);
  return rollSqFt > 0 ? num2(vinyl.cost_per_roll) / rollSqFt : 0;
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
  const rollWidth = num2(vinyl?.roll_width_inches, 54);
  const leftMargin = num2(leadingMachine?.left_margin_inches, 0.5);
  const rightMargin = num2(leadingMachine?.right_margin_inches, 0.5);
  const leadingEdge = num2(leadingMachine?.leading_edge_inches, 4);
  const trailingEdge = num2(leadingMachine?.trailing_edge_inches, 2);
  const machineWidthCap = Math.min(
    applyPrint && printer ? num2(printer.max_media_width_inches, 999) : 999,
    applyCut && cutter ? num2(cutter.max_media_width_inches, 999) : 999,
    applyLaminate && laminator ? num2(laminator.max_media_width_inches, 999) : 999
  );
  const effectiveRollWidth = Math.min(rollWidth, machineWidthCap);
  const usableWidth = Math.max(0, effectiveRollWidth - leftMargin - rightMargin);
  const gutterH = overrideGutterH ?? num2(leadingMachine?.default_gutter_horizontal_inches, 0.25);
  const gutterV = overrideGutterV ?? num2(leadingMachine?.default_gutter_vertical_inches, 0.25);
  const spoilMult = 1 + Math.max(0, num2(spoilageBufferPercent, 0)) / 100;
  const rects = [];
  items.forEach((it, itemIdx) => {
    const baseBleed = num2(it.bleed_inches, num2(leadingMachine?.default_bleed_inches, 0));
    const partW = num2(it.width_inches);
    const partH = num2(it.height_inches);
    const w0 = partW + baseBleed * 2;
    const h0 = partH + baseBleed * 2;
    const rawQty = Math.max(1, Math.floor(num2(it.quantity, 1)));
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
  const cutPullOff = applyCut && cutter ? num2(cutter.cut_pull_off_inches_per_job, 0) : 0;
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
  const vinylWasteMult = 1 + num2(vinyl?.waste_factor_percent, 0) / 100;
  const vinylCost = totalRollSqFtPulled * vinylSqFtRate * vinylWasteMult;
  let laminateSqFt = 0, laminateCost = 0, laminateMinutes = 0;
  if (applyLaminate && laminate) {
    const lamWidth = Math.min(num2(laminate.roll_width_inches, effectiveRollWidth), effectiveRollWidth);
    const lamLengthIn = lengthConsumedIn + num2(laminator?.leading_edge_inches, 0) + num2(laminator?.trailing_edge_inches, 0);
    laminateSqFt = sqInToSqFt(lamLengthIn * lamWidth);
    const lamSqFtRate = computeRollSqFtCost(laminate);
    const lamWasteMult = 1 + num2(laminate.waste_factor_percent, 0) / 100;
    laminateCost = laminateSqFt * lamSqFtRate * lamWasteMult;
    const ipm = Math.max(1, num2(laminator?.laminator_speed_inches_per_minute, 100));
    laminateMinutes = lamLengthIn / ipm + num2(laminator?.laminator_setup_minutes_per_job, 0);
  }
  let inkCost = 0, printMinutes = 0, printMachineCost = 0;
  const inkRatePerSqIn = applyPrint && printer ? inkCostPerSqIn(printer, printQuality) : 0;
  if (applyPrint && printer) {
    inkCost = usedSqFt * 144 * inkRatePerSqIn;
    const sph = Math.max(1, num2(printer.print_speed_sqft_per_hour, 100));
    printMinutes = usedSqFt / sph * 60 + num2(printer.warmup_minutes, 0) + num2(printer.media_load_minutes, 0) + num2(printer.calibration_minutes_per_job, 0);
    printMachineCost = printMinutes / 60 * num2(printer.machine_hourly_rate, 0);
  }
  let cutDistanceIn = 0, cutMinutes = 0, cutMachineCost = 0, bladeCost = 0;
  if (applyCut && cutter) {
    cutDistanceIn = shelves.reduce((s, sh) => s + sh.items.reduce((ss, it) => {
      const pw = it.partW ?? it.w;
      const ph = it.partH ?? it.h;
      return ss + 2 * (pw + ph);
    }, 0), 0);
    const ips = Math.max(0.1, num2(cutter.cut_speed_inches_per_second, 30));
    cutMinutes = cutDistanceIn / ips / 60 + num2(cutter.cut_setup_minutes_per_job, 0);
    cutMachineCost = cutMinutes / 60 * num2(cutter.machine_hourly_rate, 0);
    const bladeLife = Math.max(1, num2(cutter.cut_blade_life_minutes, 6e3));
    bladeCost = cutMinutes / bladeLife * num2(cutter.cut_blade_cost, 0);
  }
  const laminateMachineCost = applyLaminate && laminator ? laminateMinutes / 60 * num2(laminator.laminator_hourly_rate, 0) : 0;
  let transferTapeSqFt = 0, transferTapeCost = 0;
  if (applyTransferTape && transferTape) {
    const ttWidth = Math.min(num2(transferTape.roll_width_inches, effectiveRollWidth), effectiveRollWidth);
    transferTapeSqFt = sqInToSqFt(lengthConsumedIn * ttWidth);
    const ttSqFtRate = computeRollSqFtCost(transferTape);
    const ttWasteMult = 1 + num2(transferTape.waste_factor_percent, 0) / 100;
    transferTapeCost = transferTapeSqFt * ttSqFtRate * ttWasteMult;
  }
  const machineCost = printMachineCost + cutMachineCost + laminateMachineCost;
  const machineRunMinutes = (applyPrint ? printMinutes : 0) + (applyCut ? cutMinutes : 0) + (applyLaminate ? laminateMinutes : 0);
  const weedMinPerPart = Number.isFinite(parseFloat(weedingMinutesPerPartOverride)) ? parseFloat(weedingMinutesPerPartOverride) : WEEDING_LABOR_MINUTES_PER_PART[weedingDifficulty] ?? WEEDING_LABOR_MINUTES_PER_PART.moderate;
  const weedingMinutes = applyCut ? weedMinPerPart * partsPlaced : 0;
  const installMinPerPart = Math.max(0, num2(installMinutesPerPart, 0));
  const installMinutes = installMinPerPart * partsPlaced;
  let perPersonnelCost = 0;
  let perPersonnelMinutes = 0;
  (personnel || []).forEach((p) => {
    const hrs = num2(p?.hours, 0);
    const rate = num2(p?.hourly_rate, 0);
    if (hrs > 0 && rate > 0) {
      perPersonnelCost += hrs * rate;
      perPersonnelMinutes += hrs * 60;
    }
  });
  const fallbackLaborMinutes = machineRunMinutes + weedingMinutes + installMinutes;
  const fallbackLaborCost = fallbackLaborMinutes / 60 * num2(operatorHourlyRate, 45);
  const laborMinutes = perPersonnelMinutes > 0 ? perPersonnelMinutes : fallbackLaborMinutes;
  const laborHours = laborMinutes / 60;
  const laborCost = perPersonnelCost > 0 ? perPersonnelCost : fallbackLaborCost;
  const materialCost = vinylCost + laminateCost + transferTapeCost + inkCost + bladeCost;
  const preFloorTotal = materialCost + machineCost + laborCost;
  const floor = Math.max(0, num2(setupFeeFloor, 0));
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
export {
  blankVinylProject,
  blankWorkflow,
  calculateVinylProject,
  computePerPartCosts,
  computeStockUsage,
  computeWorkflowMetrics,
  migrateProject,
  rollupVinylProject,
  sumWorkflowField
};
