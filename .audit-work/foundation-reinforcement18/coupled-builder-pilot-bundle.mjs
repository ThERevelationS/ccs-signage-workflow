// synthetic:@/api/base44Client
var entities = new Proxy({}, { get(_, key) {
  return globalThis.__coupledBuilder.entity(key);
} });
var base44 = {
  entities,
  functions: { invoke: (...args) => globalThis.__coupledBuilder.invoke(...args) },
  auth: { me: async () => ({ id: "synthetic-owner" }) }
};

// src/components/estimator/moduleRegistry.js
var ESTIMATOR_MODULES = [
  { key: "foundation", label: "Concrete | Masonry | Poles", entity: "FoundationProject", page: "FoundationEstimator" },
  { key: "channel_letters", label: "Channel & Dimensional Letters", entity: "ChannelLetterInstallation", page: "ChannelLetterEstimator" },
  { key: "vinyl", label: "Vinyl & Graphics", entity: "VinylProject", page: "VinylEstimator" },
  { key: "cnc", label: "CNC Router", entity: "CNCProject", page: "CNCEstimator" },
  { key: "laser", label: "Laser", entity: "LaserProject", page: "LaserEstimator" },
  { key: "metal", label: "Metal Fabrication", entity: "MetalProject", page: "MetalEstimator" },
  { key: "brick_stone", label: "Brick & Stone", entity: "BrickStoneProject", page: "BrickStoneEstimator" },
  { key: "maintenance", label: "Sign Maintenance", entity: "MaintenanceProject", page: "MaintenanceEstimator" },
  { key: "painting", label: "Painting", entity: "Project", page: "PaintingEstimator" },
  { key: "custom_items", label: "Custom line items", entity: "CustomItemsProject", page: "CustomItemsEstimator" }
];
var MODULE_TOTAL_FIELD = {
  channel_letters: "total_cost",
  vinyl: "total_cost",
  cnc: "total_cost",
  laser: "total_cost",
  metal: "total_cost",
  brick_stone: "total_cost",
  maintenance: "total_cost",
  custom_items: "total_cost"
};
var LEGACY_MODULES = {};
var getModule = (key) => ESTIMATOR_MODULES.find((m) => m.key === key) || LEGACY_MODULES[key];
var getModuleLabel = (key) => getModule(key)?.label || key;

// src/lib/loadAllEntityRows.js
var DEFAULT_PAGE_SIZE = 500;
var DEFAULT_MAX_ROWS = 5e4;
var RATE_LIMIT_MAX_RETRIES = 3;
var RATE_LIMIT_BASE_DELAY_MS = 1200;
function rowIdentity(row, index) {
  const id = String(row?.id || "").trim();
  return id || `__row_${index}`;
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isRateLimitError(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  const message = String(
    error?.message || error?.response?.data?.error || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests");
}
async function withRateLimitRetry(fn) {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (typeof error?.ccsGovernorRetried === "number") throw error;
      if (attempt < RATE_LIMIT_MAX_RETRIES && isRateLimitError(error)) {
        await sleep(RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
}
var readCache = /* @__PURE__ */ new WeakMap();
var CACHE_MAX_AGE_MS = 3e4;
var inFlightReads = /* @__PURE__ */ new WeakMap();
var readCacheBucket = (entity) => {
  let bucket = readCache.get(entity);
  if (!bucket) {
    bucket = /* @__PURE__ */ new Map();
    readCache.set(entity, bucket);
  }
  return bucket;
};
async function loadAllEntityRows({
  entity,
  query = null,
  sort = "created_date",
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  label = "Estimator prerequisite catalog",
  cacheTtlMs = 0,
  // (#403) `limit` bounds the total rows returned for callers that only need a
  // window (e.g. "the 50 newest"), not a verified-complete catalog. Reaching
  // the bound is a normal truncation — unlike `maxRows`, which stays a
  // runaway-scan safety net and still throws when a full scan would pass it.
  limit = null
} = {}) {
  const parsedLimit = limit == null ? null : Math.floor(Number(limit));
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  const canShare = entity !== null && (typeof entity === "object" || typeof entity === "function");
  const cacheKey = cacheTtlMs > 0 && canShare ? JSON.stringify([query, sort, pageSize, safeLimit ?? maxRows]) : null;
  if (cacheKey) {
    const hit = readCache.get(entity)?.get(cacheKey);
    if (hit && Date.now() - hit.at < Math.min(cacheTtlMs, CACHE_MAX_AGE_MS)) return [...hit.rows];
  }
  const hasFilter = query && typeof query === "object";
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== "function") {
    throw new Error(`${label} could not initialize its paged read.`);
  }
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const safeMaxRows = safeLimit ?? Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);
  const flightKey = JSON.stringify([hasFilter ? "filter" : "list", query ?? null, sort ?? null, safePageSize, safeMaxRows]);
  if (canShare) {
    const existing = inFlightReads.get(entity)?.get(flightKey);
    if (existing) return existing.then((rows) => [...rows]);
  }
  const readPromise = (async () => {
    const collected = [];
    const seen = /* @__PURE__ */ new Set();
    let skip = 0;
    while (skip < safeMaxRows) {
      const pageLimit = Math.min(safePageSize, safeMaxRows - skip);
      const page = await withRateLimitRetry(
        () => hasFilter ? entity.filter(query, sort || void 0, pageLimit, skip) : entity.list(sort || void 0, pageLimit, skip)
      );
      if (!Array.isArray(page)) {
        throw new Error(`${label} could not be verified completely. Estimating was blocked rather than using a partial catalog.`);
      }
      for (let index = 0; index < page.length; index += 1) {
        const row = page[index];
        const key = rowIdentity(row, skip + index);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(row);
      }
      if (page.length < pageLimit) {
        if (cacheKey) readCacheBucket(entity).set(cacheKey, { at: Date.now(), rows: collected });
        return collected;
      }
      skip += pageLimit;
    }
    if (safeLimit != null) {
      if (cacheKey) readCacheBucket(entity).set(cacheKey, { at: Date.now(), rows: collected });
      return collected;
    }
    throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record estimator safety limit.`);
  })();
  if (!canShare) return readPromise;
  let flightBucket = inFlightReads.get(entity);
  if (!flightBucket) {
    flightBucket = /* @__PURE__ */ new Map();
    inFlightReads.set(entity, flightBucket);
  }
  flightBucket.set(flightKey, readPromise);
  try {
    const rows = await readPromise;
    return [...rows];
  } finally {
    if (flightBucket.get(flightKey) === readPromise) flightBucket.delete(flightKey);
  }
}

// src/components/vinylInventory/vinylConstants.jsx
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

// src/components/vinylEstimator/vinylNestingCalculator.jsx
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

// src/components/estimator/brick/brickCalc.js
var num2 = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
function calcBrickStoneProject(project, material) {
  const gap = num2(project.mortar_gap, 0.375);
  const layers = Math.max(1, num2(project.layers, 1));
  const courses = num2(project.courses_high, 0);
  const alongLength = num2(project.bricks_along_length, 0);
  const alongWidth = num2(project.bricks_along_width, 0);
  const waste = num2(project.waste_factor, 1.1);
  const b = {
    length: num2(material?.length),
    width: num2(material?.width),
    height: num2(material?.height)
  };
  const bricksPerCourse = (alongLength + alongWidth) * 2;
  const rawBricks = bricksPerCourse * courses * layers;
  const calculated_bricks = Math.ceil(rawBricks * waste);
  const derived_length = alongLength * (b.length + gap);
  const derived_width = alongWidth * (b.length + gap);
  const derived_height = courses * (b.height + gap);
  const perimeterInches = (derived_length + derived_width) * 2;
  const calculated_surface_area = perimeterInches * derived_height / 144;
  const mortarVolumeCuIn = rawBricks * (b.length * b.width * gap + b.height * b.width * gap);
  const mortar_bags_needed = Math.ceil(mortarVolumeCuIn / 1728 / 0.6) || 0;
  const material_cost = calculated_bricks * num2(material?.cost_per_unit);
  const mortar_cost = mortar_bags_needed * num2(project.mortar_bag_cost, 12);
  const labor_hours = calculated_bricks / Math.max(1, num2(project.bricks_per_hour, 40));
  const labor_cost = labor_hours * num2(project.labor_rate_per_hour, 55);
  const subtotal = material_cost + mortar_cost + labor_cost;
  const markup_amount = subtotal * num2(project.markup_percent) / 100;
  return {
    calculated_bricks,
    bricks_per_course: bricksPerCourse,
    derived_length,
    derived_width,
    derived_height,
    calculated_surface_area,
    mortar_bags_needed,
    material_cost,
    mortar_cost,
    labor_hours,
    labor_cost,
    subtotal,
    markup_amount,
    total_cost: subtotal + markup_amount
  };
}

// src/components/signMaintenance/constants.jsx
var SIGN_TYPES = [
  // Channel-letter family — these use letter sizing
  { id: "flush_channel", label: "Flush Channel", family: "letter", color: "blue", description: "Channel letters mounted flat to wall" },
  { id: "halo_channel", label: "Halo Channel", family: "letter", color: "amber", description: "Reverse-lit channel letters" },
  { id: "raceway_channel", label: "Raceway Channel", family: "letter", color: "purple", description: "Letters mounted on a power-feed bar" },
  { id: "capsule_logo", label: "Capsule / Logo", family: "letter", color: "teal", description: "Capsule, pillbox, or logo elements" },
  { id: "dimensional_letters", label: "Dimensional Letters", family: "letter", color: "indigo", description: "Non-illuminated fabricated letters" },
  // Cabinet family — these use cabinet sizing
  { id: "monument_sign", label: "Monument Sign", family: "cabinet", color: "stone", description: "Ground-level monument cabinet" },
  { id: "pylon_sign", label: "Pylon Sign", family: "cabinet", color: "slate", description: "Tall pole-mounted cabinet" },
  { id: "post_and_panel", label: "Post & Panel", family: "cabinet", color: "emerald", description: "Panel mounted between posts" }
];
var SIGN_TYPES_BY_ID = SIGN_TYPES.reduce((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {});
var ACTIONS = [
  // Cosmetic
  { id: "clean", label: "Clean", group: "Cosmetic" },
  { id: "repaint", label: "Repaint", group: "Cosmetic" },
  { id: "vinyl_replacement", label: "Vinyl Replacement", group: "Cosmetic" },
  { id: "reseal", label: "Reseal / Caulk", group: "Cosmetic" },
  // LED / Lamp
  { id: "led_retrofit", label: "LED Retrofit", group: "LED / Lamp" },
  { id: "replace_leds", label: "Replace LEDs", group: "LED / Lamp" },
  { id: "replace_fluorescent_tubes", label: "Replace Fluorescent Tubes", group: "LED / Lamp" },
  { id: "replace_ballast", label: "Replace Ballast", group: "LED / Lamp" },
  // Electrical
  { id: "replace_power_supplies", label: "Replace Power Supplies", group: "Electrical" },
  { id: "replace_transformer", label: "Replace Transformer", group: "Electrical" },
  { id: "fix_electrical", label: "Fix Electrical Issues", group: "Electrical" },
  { id: "rewire", label: "Rewire", group: "Electrical" },
  { id: "replace_breaker", label: "Replace Breaker", group: "Electrical" },
  { id: "replace_photocell", label: "Replace Photocell", group: "Electrical" },
  { id: "replace_timer", label: "Replace Timer", group: "Electrical" },
  { id: "replace_disconnect", label: "Replace Disconnect", group: "Electrical" },
  { id: "troubleshoot", label: "Troubleshoot", group: "Electrical" },
  // Structural / Component replacement
  { id: "replace_face", label: "Replace Face", group: "Component" },
  { id: "replace_returns", label: "Replace Returns", group: "Component" },
  { id: "replace_trim_cap", label: "Replace Trim Cap", group: "Component" }
];
var ACTIONS_BY_ID = ACTIONS.reduce((acc, a) => {
  acc[a.id] = a;
  return acc;
}, {});
var ACTION_GROUPS = Array.from(new Set(ACTIONS.map((a) => a.group)));
var ACTIONS_FOR_SIGN_TYPE = {
  flush_channel: ACTIONS.map((a) => a.id),
  halo_channel: ACTIONS.map((a) => a.id),
  raceway_channel: ACTIONS.map((a) => a.id),
  capsule_logo: ACTIONS.map((a) => a.id).filter((id) => !["replace_returns", "replace_trim_cap"].includes(id)),
  dimensional_letters: ["clean", "repaint", "vinyl_replacement", "reseal"],
  // no electrical
  monument_sign: ACTIONS.map((a) => a.id).filter((id) => !["replace_returns", "replace_trim_cap"].includes(id)),
  pylon_sign: ACTIONS.map((a) => a.id).filter((id) => !["replace_returns", "replace_trim_cap"].includes(id)),
  post_and_panel: ["clean", "repaint", "vinyl_replacement", "reseal", "replace_face"]
};
var sizeAxisFor = (signTypeId) => {
  const st = SIGN_TYPES_BY_ID[signTypeId];
  return st?.family === "cabinet" ? "cabinet" : "letter";
};

// src/components/signMaintenance/repaintDefaults.jsx
var REPAINT_FEATURES = [
  { id: "dimensional_letters", label: "Dimensional Letters", setting: "maintenance_repaint_feat_dimensional_letters" },
  { id: "painted_letters", label: "Painted Letters", setting: "maintenance_repaint_feat_painted_letters" },
  { id: "applied_vinyl", label: "Applied Vinyl", setting: "maintenance_repaint_feat_applied_vinyl" },
  { id: "complex_layering", label: "Complex Layering/Shapes", setting: "maintenance_repaint_feat_complex_layering" }
];
var PAINT_CONDITION_LABELS = [
  "Like New",
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Worn",
  "Faded",
  "Heavily Faded",
  "Chalking",
  "Severely Degraded"
];

// src/components/signMaintenance/dimLetterPaintCalculator.jsx
var num3 = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var UNIT_FACTORS = { oz: 1 / 128, pint: 1 / 8, quart: 1 / 4, liter: 1 / 3.78541, gallon: 1 };
var costPerGallon = (cost, unit) => {
  const c = num3(cost);
  const f = UNIT_FACTORS[unit] || 1;
  if (!f) return 0;
  return c / f;
};
var mixedPaintCostPerSqft = (s) => {
  const paintG = costPerGallon(s.paint_cost_per_unit, s.paint_unit);
  const hardG = costPerGallon(s.hardener_cost_per_unit, s.hardener_unit);
  const redG = costPerGallon(s.reducer_cost_per_unit, s.reducer_unit);
  const pR = num3(s.paint_mix_ratio), hR = num3(s.hardener_mix_ratio), rR = num3(s.reducer_mix_ratio);
  const parts = pR + hR + rR;
  if (!parts) return 0;
  const costPerGalMixed = (paintG * pR + hardG * hR + redG * rR) / parts;
  const coverage = num3(s.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
  return costPerGalMixed / coverage;
};
var computeDimLetterPaint = (cfg, settings) => {
  const dl = cfg?.dim_letter_paint;
  if (!dl?.enabled) return null;
  const qty = Math.max(0, num3(dl.qty));
  if (qty <= 0) return null;
  const hIn = Math.max(0, num3(dl.avg_height_in));
  const tIn = Math.max(0, num3(dl.thickness_in));
  if (hIn <= 0) return null;
  const perimFactor = num3(settings.letter_perimeter_factor, 3.5) || 3.5;
  const FACE_FACTOR = 0.55;
  const facePerLetterIn2 = hIn * hIn * FACE_FACTOR;
  const returnsPerLetterIn2 = hIn * perimFactor * tIn;
  const SQIN_PER_SQFT = 144;
  const letters_face_sqft = facePerLetterIn2 * qty / SQIN_PER_SQFT;
  const letters_returns_sqft = returnsPerLetterIn2 * qty / SQIN_PER_SQFT;
  const letters_total_sqft = letters_face_sqft + letters_returns_sqft;
  const liquid$PerSqft = mixedPaintCostPerSqft(settings);
  const wasteMult = num3(settings.paint_waste_multiplier, 1.25) || 1.25;
  const letters_paint_cost = letters_total_sqft * liquid$PerSqft * wasteMult;
  const coverage = num3(settings.mixed_paint_coverage_sqft_per_gallon, 350) || 350;
  const letters_gallons = letters_total_sqft * wasteMult / coverage;
  const basePerSqft = num3(settings.base_labor_hours_per_sqft, 0.05);
  let prepMult = num3(settings.lettering_normal_prep_multiplier, 1) || 1;
  if (hIn <= 4) prepMult = num3(settings.lettering_extra_small_prep_multiplier, 1.5);
  else if (hIn <= 8) prepMult = num3(settings.lettering_small_prep_multiplier, 1.3);
  else if (hIn <= 12) prepMult = num3(settings.lettering_normal_prep_multiplier, 1);
  else if (hIn <= 20) prepMult = num3(settings.lettering_medium_prep_multiplier, 0.9);
  else if (hIn <= 30) prepMult = num3(settings.lettering_large_prep_multiplier, 0.8);
  else prepMult = num3(settings.lettering_extra_large_prep_multiplier, 0.7);
  const letters_labor_hours = letters_total_sqft * basePerSqft * prepMult;
  const usingMask = dl.second_color_mask === "paint_mask";
  let mask_sqft = 0, mask_material_cost = 0, mask_machine_cost = 0;
  let mask_weed_labor_cost = 0, mask_apply_labor_cost = 0, mask_labor_hours = 0;
  if (usingMask) {
    mask_sqft = letters_face_sqft;
    const matRate = num3(settings.paint_mask_rate_per_sqft);
    const machineRate = num3(settings.paint_mask_machine_cutting_rate_per_sqft);
    const weedRate = num3(settings.paint_mask_cutting_labor_rate_per_sqft);
    const applyRate = num3(settings.paint_mask_application_labor_rate_per_sqft);
    const laborRate = num3(settings.default_labor_rate, 60) || 60;
    mask_material_cost = mask_sqft * matRate;
    mask_machine_cost = mask_sqft * machineRate;
    mask_weed_labor_cost = mask_sqft * weedRate;
    mask_apply_labor_cost = mask_sqft * applyRate;
    const mask_labor_cost = mask_weed_labor_cost + mask_apply_labor_cost;
    mask_labor_hours = laborRate > 0 ? mask_labor_cost / laborRate : 0;
    const secondColorExtraPaint = letters_face_sqft * liquid$PerSqft * wasteMult;
    return finalize({
      letters_face_sqft,
      letters_returns_sqft,
      letters_total_sqft,
      letters_gallons: letters_gallons + letters_face_sqft * wasteMult / coverage,
      letters_paint_cost: letters_paint_cost + secondColorExtraPaint,
      mask_sqft,
      mask_material_cost,
      mask_machine_cost,
      mask_weed_labor_cost,
      mask_apply_labor_cost,
      mask_labor_hours,
      letters_labor_hours
    });
  }
  return finalize({
    letters_face_sqft,
    letters_returns_sqft,
    letters_total_sqft,
    letters_gallons,
    letters_paint_cost,
    mask_sqft: 0,
    mask_material_cost: 0,
    mask_machine_cost: 0,
    mask_weed_labor_cost: 0,
    mask_apply_labor_cost: 0,
    mask_labor_hours: 0,
    letters_labor_hours
  });
};
var finalize = (r) => {
  const mask_total_cost = r.mask_material_cost + r.mask_machine_cost + r.mask_weed_labor_cost + r.mask_apply_labor_cost;
  const letters_total_added_cost = r.letters_paint_cost + mask_total_cost;
  return { ...r, mask_total_cost, letters_total_added_cost };
};

// src/components/signMaintenance/repaintCalculator.jsx
var num4 = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var SETTING_FALLBACKS = {
  maintenance_repaint_coverage_sqft_per_gallon: 350,
  maintenance_repaint_paint_cost_per_gallon: 55,
  maintenance_repaint_primer_coats: 1,
  maintenance_repaint_finish_coats: 2,
  maintenance_repaint_sqft_per_hour: 60,
  maintenance_repaint_feat_dimensional_letters: 1.35,
  maintenance_repaint_feat_painted_letters: 1.25,
  maintenance_repaint_feat_applied_vinyl: 1.15,
  maintenance_repaint_feat_complex_layering: 1.4,
  maintenance_repaint_condition_step_pct: 8
};
var settingNum = (settings, key) => num4(settings?.[key], SETTING_FALLBACKS[key]);
var isMonumentRepaint = (item) => {
  if (!item) return false;
  if (item.sign_type !== "monument_sign") return false;
  return (item.actions || []).includes("repaint");
};
var defaultMonumentRepaintConfig = () => ({
  length_ft: 8,
  height_ft: 4,
  return_depth_in: 6,
  paint_mode: "entire_panel",
  // "entire_panel" | "returns_only"
  features: [],
  // ids from REPAINT_FEATURES (only used when entire_panel)
  retainer_width_in: 2,
  // only used when returns_only
  paint_condition: 3,
  // 1-10
  paint_both_sides: true,
  // monument typically has 2 painted faces
  // Dimensional-letter painting — only relevant when "dimensional_letters" feature is on
  dim_letter_paint: {
    enabled: false,
    qty: 6,
    avg_height_in: 12,
    thickness_in: 1,
    second_color_mask: "none"
    // "none" | "paint_mask"
  }
});
var computeRepaintSqft = (cfg) => {
  if (!cfg) return { face_sqft: 0, returns_sqft: 0, total_sqft: 0, perimeter_ft: 0 };
  const L = Math.max(0, num4(cfg.length_ft));
  const H = Math.max(0, num4(cfg.height_ft));
  const perimeter_ft = 2 * (L + H);
  const sides = cfg.paint_both_sides ? 2 : 1;
  if (cfg.paint_mode === "returns_only") {
    const retainerFt = Math.max(0, num4(cfg.retainer_width_in)) / 12;
    const returns_sqft2 = perimeter_ft * retainerFt;
    return { face_sqft: 0, returns_sqft: returns_sqft2, total_sqft: returns_sqft2, perimeter_ft };
  }
  const face_sqft = L * H * sides;
  const returnDepthFt = Math.max(0, num4(cfg.return_depth_in)) / 12;
  const returns_sqft = perimeter_ft * returnDepthFt;
  return { face_sqft, returns_sqft, total_sqft: face_sqft + returns_sqft, perimeter_ft };
};
var featureMultiplier = (cfg, settings) => {
  if (!cfg || cfg.paint_mode !== "entire_panel") return 1;
  const selected = new Set(cfg.features || []);
  let mult = 1;
  REPAINT_FEATURES.forEach((f) => {
    if (selected.has(f.id)) mult *= settingNum(settings, f.setting);
  });
  return mult;
};
var conditionMultiplier = (cfg, settings) => {
  const level = Math.min(10, Math.max(1, Math.round(num4(cfg?.paint_condition, 1))));
  const stepPct = settingNum(settings, "maintenance_repaint_condition_step_pct");
  return 1 + stepPct / 100 * (level - 1);
};
var computeMonumentRepaint = (item, settings) => {
  if (!isMonumentRepaint(item)) return null;
  const cfg = item.repaint_config || defaultMonumentRepaintConfig();
  const { face_sqft, returns_sqft, total_sqft, perimeter_ft } = computeRepaintSqft(cfg);
  const coverage = settingNum(settings, "maintenance_repaint_coverage_sqft_per_gallon") || 350;
  const pricePerGal = settingNum(settings, "maintenance_repaint_paint_cost_per_gallon");
  const primerCoats = Math.max(0, settingNum(settings, "maintenance_repaint_primer_coats"));
  const finishCoats = Math.max(0, settingNum(settings, "maintenance_repaint_finish_coats"));
  const sqftPerHour = settingNum(settings, "maintenance_repaint_sqft_per_hour") || 60;
  const totalCoats = primerCoats + finishCoats;
  const paintedSqft = total_sqft * totalCoats;
  const gallons = paintedSqft / coverage;
  const paintMaterialCost = gallons * pricePerGal;
  const featMult = featureMultiplier(cfg, settings);
  const condMult = conditionMultiplier(cfg, settings);
  let labor_hours = total_sqft / sqftPerHour * featMult * condMult;
  const featureSet = new Set(cfg.features || []);
  const dl = featureSet.has("dimensional_letters") && cfg.paint_mode === "entire_panel" ? computeDimLetterPaint(cfg, settings) : null;
  let dimLetterCost = 0;
  if (dl) {
    dimLetterCost = dl.letters_total_added_cost;
    labor_hours += (dl.letters_labor_hours || 0) + (dl.mask_labor_hours || 0);
  }
  return {
    cfg,
    face_sqft,
    returns_sqft,
    total_sqft,
    perimeter_ft,
    coverage,
    pricePerGal,
    primerCoats,
    finishCoats,
    totalCoats,
    gallons,
    paint_material_cost: paintMaterialCost + dimLetterCost,
    feature_multiplier: featMult,
    condition_multiplier: condMult,
    paint_condition_label: PAINT_CONDITION_LABELS[Math.min(9, Math.max(0, (cfg.paint_condition || 1) - 1))],
    labor_hours,
    dim_letter_paint: dl
  };
};

// src/components/signMaintenance/maintenanceCalculator.jsx
var MIN_TO_HR = 1 / 60;
var SIZE_TO_FIELD = {
  extra_small: "base_minutes_xs",
  small: "base_minutes_s",
  medium: "base_minutes_m",
  large: "base_minutes_l",
  extra_large: "base_minutes_xl",
  extra_extra_large: "base_minutes_xxl",
  cab_small: "base_minutes_cab_s",
  cab_medium: "base_minutes_cab_m",
  cab_large: "base_minutes_cab_l",
  cab_extra_large: "base_minutes_cab_xl"
};
var minutesForActionOnSize = (rates, signType, action, size) => {
  const rate = (rates || []).find((r) => r.sign_type === signType && r.action === action);
  if (!rate) return 0;
  if (rate.is_enabled === false) return 0;
  const field = SIZE_TO_FIELD[size];
  if (!field) return parseFloat(rate.base_minutes_flat) || 0;
  return parseFloat(rate[field]) || 0;
};
var calcServiceItem = (item, settings, rates, inventory) => {
  const techRate = parseFloat(settings.maintenance_tech_rate) || 65;
  const axis = sizeAxisFor(item.sign_type);
  const qty = parseFloat(item.qty) || 0;
  let totalMinutes = 0;
  (item.actions || []).forEach((actionId) => {
    if (actionId === "repaint" && isMonumentRepaint(item)) return;
    const perUnit = minutesForActionOnSize(rates, item.sign_type, actionId, item.size);
    totalMinutes += perUnit * (axis === "cabinet" ? Math.max(qty, 1) : qty);
  });
  let laborHours = totalMinutes * MIN_TO_HR;
  let repaintPaintCost = 0;
  const repaint = computeMonumentRepaint(item, settings);
  if (repaint) {
    laborHours += repaint.labor_hours;
    repaintPaintCost = repaint.paint_material_cost;
  }
  const laborCost = laborHours * techRate;
  const materials = (item.materials || []).map((m) => {
    const inv = (inventory || []).find((i) => i.id === (m.maintenance_rule_id || m.inventory_item_id));
    if (!inv) return { ...m, total_cost: (parseFloat(m.unit_cost) || 0) * (parseFloat(m.quantity) || 0) };
    return materialFromInventory(inv, item, m);
  });
  const materialsCost = materials.reduce((s, m) => s + (parseFloat(m.total_cost) || 0), 0) + repaintPaintCost;
  return {
    ...item,
    materials,
    labor_hours: laborHours,
    labor_cost: laborCost,
    materials_cost: materialsCost,
    repaint_calc: repaint || void 0,
    item_total_cost: laborCost + materialsCost
  };
};
var usageBasisQuantity = (item, basis) => {
  if (basis === "per_letter") return parseFloat(item.qty) || 0;
  if (basis === "per_cabinet") return Math.max(parseFloat(item.qty) || 0, 1);
  if (basis === "per_linear_foot") return parseFloat(item.linear_feet) || 0;
  if (basis === "per_sqft") return parseFloat(item.face_sqft) || 0;
  return 1;
};
var materialFromInventory = (inv, item, existing = null) => {
  const linked = !!(inv.inventory_entity && inv.inventory_item_id);
  if (linked) {
    const basis = inv.usage_basis || "per_service_item";
    const multiplier = Math.max(0, parseFloat(inv.usage_multiplier) || 0);
    const rawQuantity = usageBasisQuantity(item, basis) * multiplier;
    const autoQuantity = inv.usage_rounding === "ceil_whole" ? Math.ceil(rawQuantity) : rawQuantity;
    const quantity = existing?.quantity_override ? Math.max(0, parseFloat(existing.quantity) || 0) : autoQuantity;
    const unitCost = Number.isFinite(Number(inv._master_unit_cost)) ? Number(inv._master_unit_cost) : parseFloat(existing?.unit_cost) || 0;
    return {
      ...existing || {},
      maintenance_rule_id: inv.id,
      inventory_entity: inv.inventory_entity,
      inventory_item_id: inv.inventory_item_id,
      inventory_item_name: inv.inventory_item_name || inv._display_name || inv.item_name,
      item_name: inv._display_name || inv.inventory_item_name || inv.item_name,
      pricing_mode: inv._master_pricing_mode || existing?.pricing_mode || inv.pricing_mode,
      usage_basis: basis,
      usage_multiplier: multiplier,
      usage_rounding: inv.usage_rounding || "none",
      unit: inv._master_unit || existing?.unit || inv.unit || "unit",
      unit_cost: unitCost,
      auto_quantity: autoQuantity,
      quantity,
      quantity_override: !!existing?.quantity_override,
      link_missing: !!inv._master_missing,
      total_cost: unitCost * quantity
    };
  }
  const m = {
    ...existing || {},
    maintenance_rule_id: inv.id,
    inventory_item_id: inv.id,
    item_name: inv.item_name,
    pricing_mode: inv.pricing_mode,
    unit: inv.unit || inv.pricing_mode || "unit",
    unit_cost: 0,
    quantity: 0,
    total_cost: 0
  };
  const sizeKey = `cost_${item.size}`;
  if (inv.pricing_mode === "per_letter_flat") {
    m.unit_cost = parseFloat(inv.cost_per_letter) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_letter_by_size" || inv.pricing_mode === "per_cabinet_by_size") {
    m.unit_cost = parseFloat(inv[sizeKey]) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_cabinet_flat") {
    m.unit_cost = parseFloat(inv.cost_per_cabinet) || 0;
    m.quantity = parseFloat(item.qty) || 0;
  } else if (inv.pricing_mode === "per_linear_foot") {
    m.unit_cost = parseFloat(inv.cost_per_foot) || 0;
    m.quantity = parseFloat(item.linear_feet) || 0;
  } else if (inv.pricing_mode === "per_sqft") {
    m.unit_cost = parseFloat(inv.cost_per_sqft) || 0;
    m.quantity = parseFloat(item.face_sqft) || 0;
  } else if (inv.pricing_mode === "per_project_flat") {
    m.unit_cost = parseFloat(inv.cost_flat) || 0;
    m.quantity = 1;
  }
  if (existing?.quantity_override) m.quantity = Math.max(0, parseFloat(existing.quantity) || 0);
  m.quantity_override = !!existing?.quantity_override;
  m.auto_quantity = m.quantity;
  m.total_cost = m.unit_cost * m.quantity;
  return m;
};
var calcProjectTotals = (project) => {
  const items = project.items || [];
  const total_materials_cost = items.reduce((s, it) => s + (parseFloat(it.materials_cost) || 0), 0);
  const labor_cost = items.reduce((s, it) => s + (parseFloat(it.labor_cost) || 0), 0);
  const labor_hours = items.reduce((s, it) => s + (parseFloat(it.labor_hours) || 0), 0);
  const total_equipment_cost = (project.selected_equipment || []).reduce((s, e) => s + (parseFloat(e.total_cost) || 0), 0);
  const total_personnel_cost = (project.personnel || []).reduce((s, p) => s + (parseFloat(p.total_cost) || 0), 0);
  const pct = parseFloat(project.supplies_percent_of_materials);
  const suppliesPct = isNaN(pct) ? 10 : pct;
  const extra = parseFloat(project.extra_supplies_cost) || 0;
  const total_supplies_cost = total_materials_cost * (suppliesPct / 100) + extra;
  const total_travel_cost = parseFloat(project.total_travel_cost) || 0;
  const subtotal = labor_cost + total_materials_cost + total_supplies_cost + total_equipment_cost + total_personnel_cost + total_travel_cost;
  const markupPct = parseFloat(project.markup_percent) || 0;
  const markup_amount = subtotal * (markupPct / 100);
  const total_cost = subtotal + markup_amount;
  return {
    labor_hours,
    labor_cost,
    total_materials_cost,
    total_supplies_cost,
    total_equipment_cost,
    total_personnel_cost,
    total_travel_cost,
    subtotal,
    markup_amount,
    total_cost
  };
};

// base44/shared/pricingEngine.ts
var num5 = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
var normStr = (v) => String(v ?? "").trim().toLowerCase();
var round2 = (n) => Math.round((num5(n) + Number.EPSILON) * 100) / 100;
var round4 = (n) => Math.round((num5(n) + Number.EPSILON) * 1e4) / 1e4;
var TIER_PRECEDENCE = Object.freeze([
  "global_default",
  "customer_tier",
  "part_tier",
  "part_fixed",
  "machine_override"
]);
var PRICING_MODES = Object.freeze({
  MARKUP: "markup",
  COST_PLUS: "cost_plus",
  MARKET: "market",
  // F-05 activation vocabulary: 'market_based' is the entity/admin spelling of
  // the same retail-minus-discount chart family the engine rows call 'market'
  // (PricingTemplate.market_based, GlobalPricingTier.rules[].market_based).
  // 'fixed' is a pinned unit sell price (part.fixed_price family).
  MARKET_BASED: "market_based",
  FIXED: "fixed"
});
var DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
var toTime = (v, { endOfDay = false } = {}) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const t2 = v.getTime();
    return Number.isFinite(t2) ? t2 : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return endOfDay && DATE_ONLY.test(s) ? t + 86399999 : t;
};
var rowIsActive = (row) => normStr(row?.status ?? "active") !== "inactive";
function rowIsEffective(row, now = /* @__PURE__ */ new Date()) {
  const t = now instanceof Date ? now.getTime() : toTime(now);
  const at = Number.isFinite(t) ? t : Date.now();
  const from = toTime(row?.effective_from);
  const to = toTime(row?.effective_to, { endOfDay: true });
  if (from != null && at < from) return false;
  if (to != null && at > to) return false;
  return true;
}
var tierKeySet = (customerTier) => {
  const keys = /* @__PURE__ */ new Set();
  const add = (v) => {
    const k = normStr(v);
    if (k) keys.add(k);
  };
  if (customerTier && typeof customerTier === "object") {
    const t = customerTier;
    add(t.tier_name);
    add(t.tier_number);
    add(t.id);
    add(t.name);
  } else {
    add(customerTier);
  }
  return keys;
};
var rowPinsTier = (row, tierKeys) => !!normStr(row?.customer_tier) && tierKeys.has(normStr(row?.customer_tier));
var rowFitsCategory = (row, category) => !normStr(row?.category) || normStr(row?.category) === normStr(category);
var newerRow = (a, b) => {
  if (!b) return a;
  const aFrom = toTime(a?.effective_from) ?? -Infinity;
  const bFrom = toTime(b?.effective_from) ?? -Infinity;
  if (aFrom !== bFrom) return aFrom > bFrom ? a : b;
  const aUp = toTime(a?.updated_date) ?? -Infinity;
  const bUp = toTime(b?.updated_date) ?? -Infinity;
  if (aUp !== bUp) return aUp > bUp ? a : b;
  return String(a?.id || "") <= String(b?.id || "") ? a : b;
};
function pickUnitBreak(breaks, qty, opts = {}) {
  const q = num5(qty);
  if (!Array.isArray(breaks) || q <= 0) return null;
  if (opts && opts.interpolate === true) return interpolateUnitBreak(breaks, q);
  let pick = null;
  for (const b of breaks) {
    const bq = num5(b?.qty, NaN);
    if (!Number.isFinite(bq) || bq <= 0 || bq > q) continue;
    if (!Number.isFinite(Number(b?.unit_price))) continue;
    if (!pick || bq > num5(pick.qty)) pick = b;
  }
  return pick;
}
var sortedUnitBreaks = (breaks) => {
  const list = [];
  for (const b of Array.isArray(breaks) ? breaks : []) {
    const bq = num5(b?.qty, NaN);
    if (!Number.isFinite(bq) || bq <= 0) continue;
    if (!Number.isFinite(Number(b?.unit_price))) continue;
    list.push(b);
  }
  list.sort((a, b) => num5(a.qty) - num5(b.qty));
  return list.filter((b, i) => i === 0 || num5(b.qty) !== num5(list[i - 1].qty));
};
function interpolateUnitBreak(breaks, qty) {
  const q = num5(qty);
  const list = sortedUnitBreaks(breaks);
  if (!list.length || q <= 0 || q < num5(list[0].qty)) return null;
  const last = list[list.length - 1];
  if (q >= num5(last.qty)) return last;
  let lower = list[0];
  let upper = last;
  for (let i = 0; i < list.length - 1; i += 1) {
    if (q < num5(list[i + 1].qty)) {
      lower = list[i];
      upper = list[i + 1];
      break;
    }
  }
  if (q === num5(lower.qty)) return lower;
  const loQ = num5(lower.qty);
  const hiQ = num5(upper.qty);
  const loP = num5(lower.unit_price);
  const hiP = num5(upper.unit_price);
  const t = (q - loQ) / (hiQ - loQ);
  return {
    qty: loQ,
    unit_price: round4(loP + (hiP - loP) * t),
    interpolated: true,
    at_qty: q,
    between: [lower, upper]
  };
}
function applyFormulaModifiers(unitPrice, modifiers) {
  let price = num5(unitPrice);
  const applied = [];
  for (const m of Array.isArray(modifiers) ? modifiers : []) {
    const type = normStr(m?.type);
    const value = Number(m?.value);
    if (!Number.isFinite(value)) continue;
    const before = price;
    if (type === "add_pct") price = price * (1 + value / 100);
    else if (type === "mul") price = price * value;
    else if (type === "add_flat") price = price + value;
    else if (type === "min") price = Math.max(price, value);
    else if (type === "max") price = Math.min(price, value);
    else continue;
    price = Math.max(0, price);
    applied.push({ type, value, before: round4(before), after: round4(price) });
  }
  return { unitPrice: round4(price), applied };
}
var marketKind = (row) => {
  const pm = normStr(row?.pricing_mode);
  return (pm === PRICING_MODES.MARKET || pm === PRICING_MODES.MARKET_BASED) && Number.isFinite(Number(row?.market_retail)) && Number(row?.market_retail) > 0;
};
var wantsInterpolatedBreaks = (src) => {
  if (!src || typeof src !== "object") return false;
  if (normStr(src.break_interpolation) === "linear") return true;
  for (const f of ["interpolate_breaks", "interpolateBreaks", "interpolate"]) {
    const v = src[f];
    if (v === true || normStr(v) === "true" || normStr(v) === "linear") return true;
  }
  return false;
};
function ruleFromChartRow(row) {
  return {
    kind: marketKind(row) ? "market" : "markup",
    markupPct: num5(row?.markup_pct),
    marketRetail: marketKind(row) ? num5(row?.market_retail) : void 0,
    marketDiscountPct: marketKind(row) ? num5(row?.market_discount_pct) : void 0,
    unitBreaks: Array.isArray(row?.per_unit_breaks) ? row.per_unit_breaks : void 0,
    interpolateBreaks: wantsInterpolatedBreaks(row) || void 0,
    minimumCharge: Number.isFinite(Number(row?.minimum_charge)) ? num5(row.minimum_charge) : void 0,
    formulaModifiers: Array.isArray(row?.formula_modifiers) ? row.formula_modifiers : void 0,
    ref: row
  };
}
var firstFinite = (...vals) => {
  for (const v of vals) if (Number.isFinite(Number(v))) return Number(v);
  return null;
};
var markupField = (src) => firstFinite(src?.markup_pct, src?.markup, src?.markup_percent);
function overrideRule(source, tierRules) {
  if (!source || typeof source !== "object") return null;
  const fixed = firstFinite(source.fixed_price, source.price_override, source.override_price);
  if (fixed != null && fixed > 0) {
    return {
      kind: "fixed",
      fixedPrice: fixed,
      minimumCharge: firstFinite(source.minimum_charge) ?? void 0,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : void 0,
      ref: source
    };
  }
  const tierRef = source.tier_ref ?? source.tier ?? source.tier_name;
  if (tierRef != null && normStr(tierRef)) {
    const wanted = normStr(typeof tierRef === "object" ? tierRef.name ?? tierRef.id : tierRef);
    const row = (Array.isArray(tierRules) ? tierRules : []).find(
      (r) => r && rowIsActive(r) && (normStr(r.name) === wanted || normStr(r.id) === wanted)
    );
    if (row) return ruleFromChartRow(row);
    return { kind: "markup", markupPct: 0, ref: source, danglingTierRef: String(wanted) };
  }
  const breaks = Array.isArray(source.per_unit_breaks) ? source.per_unit_breaks : Array.isArray(source.unit_breaks) ? source.unit_breaks : null;
  if (breaks && breaks.length) {
    return {
      kind: "breaks",
      unitBreaks: breaks,
      interpolateBreaks: wantsInterpolatedBreaks(source) || void 0,
      markupPct: markupField(source) ?? void 0,
      minimumCharge: firstFinite(source.minimum_charge) ?? void 0,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : void 0,
      ref: source
    };
  }
  if (marketKind(source)) {
    return {
      kind: "market",
      marketRetail: num5(source.market_retail),
      marketDiscountPct: num5(source.market_discount_pct),
      unitBreaks: Array.isArray(source.per_unit_breaks) ? source.per_unit_breaks : void 0,
      interpolateBreaks: wantsInterpolatedBreaks(source) || void 0,
      minimumCharge: firstFinite(source.minimum_charge) ?? void 0,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : void 0,
      ref: source
    };
  }
  const markup = markupField(source);
  if (markup != null) {
    return {
      kind: "markup",
      markupPct: markup,
      interpolateBreaks: wantsInterpolatedBreaks(source) || void 0,
      minimumCharge: firstFinite(source.minimum_charge) ?? void 0,
      formulaModifiers: Array.isArray(source.formula_modifiers) ? source.formula_modifiers : void 0,
      ref: source
    };
  }
  return null;
}
function resolveTier({
  customerTier = null,
  category = "",
  tierRules = [],
  part = null,
  machine = null,
  defaultMarkupPct = 0,
  now = void 0
} = {}) {
  const rules = Array.isArray(tierRules) ? tierRules : [];
  const tierKeys = tierKeySet(customerTier);
  const eligible = rules.filter((r) => r && rowIsActive(r) && rowIsEffective(r, now) && rowFitsCategory(r, category));
  let tierRow = null;
  let tierRowScoped = false;
  for (const row of eligible) {
    if (!rowPinsTier(row, tierKeys)) continue;
    const scoped = !!normStr(row.category);
    if (!tierRow || scoped && !tierRowScoped || scoped === tierRowScoped) {
      if (!tierRow || scoped && !tierRowScoped) {
        tierRow = row;
        tierRowScoped = scoped;
      } else tierRow = newerRow(row, tierRow);
    }
  }
  let catRow = null;
  let blankRow = null;
  for (const row of eligible) {
    if (normStr(row.customer_tier)) continue;
    if (normStr(row.category)) catRow = newerRow(row, catRow);
    else blankRow = newerRow(row, blankRow);
  }
  const partRule = overrideRule(part, rules);
  const partSource = partRule?.kind === "fixed" ? "part_fixed" : "part_tier";
  const machineRule = overrideRule(machine, rules);
  const defaultRule = catRow || blankRow ? ruleFromChartRow(catRow || blankRow) : { kind: "markup", markupPct: num5(defaultMarkupPct), ref: null, implicit: true };
  const ladder = [
    {
      layer: "global_default",
      source: "global_default",
      rule: defaultRule,
      hit: true,
      detail: catRow ? "category_row" : blankRow ? "blank_row" : "default_markup_pct"
    },
    {
      layer: "customer_tier",
      source: "customer_tier",
      rule: tierRow ? ruleFromChartRow(tierRow) : null,
      hit: !!tierRow,
      detail: tierRow ? tierRowScoped ? "category+tier" : "tier" : "no tier row"
    },
    {
      layer: "part",
      source: partSource,
      rule: partRule,
      hit: !!partRule,
      detail: partRule ? partRule.kind : "no part override"
    },
    {
      layer: "machine",
      source: "machine_override",
      rule: machineRule,
      hit: !!machineRule,
      detail: machineRule ? machineRule.kind : "no machine override"
    }
  ];
  const tierRowSpec = tierRow ? tierRowScoped ? 3 : 1 : -1;
  const defaultRowSpec = catRow ? 2 : blankRow ? 0 : -1;
  let winner = tierRowSpec > defaultRowSpec ? ladder[1] : ladder[0];
  for (const step of ladder.slice(2)) if (step.hit && step.rule) winner = step;
  return {
    source: winner.source,
    layer: winner.layer,
    rule: winner.rule,
    matchedRow: winner.rule?.ref ?? null,
    trace: ladder.map((step) => ({
      layer: step.layer,
      source: step.source,
      hit: step.hit,
      won: step === winner,
      detail: step.detail
    }))
  };
}
function pricePart(input = {}) {
  const qty = num5(input.qty ?? input.quantity, 0);
  const unitCost = num5(input.unitCost ?? input.cost ?? input.costBase);
  const tier = resolveTier(input);
  const rule = tier.rule || { kind: "markup", markupPct: 0 };
  let unitPrice = 0;
  let priceSource = "cost_passthrough";
  let breakApplied = null;
  let market = null;
  const breaks = Array.isArray(rule.unitBreaks) ? rule.unitBreaks : null;
  const brk = breaks ? pickUnitBreak(breaks, qty, { interpolate: rule.interpolateBreaks === true }) : null;
  if (rule.kind === "fixed") {
    unitPrice = num5(rule.fixedPrice);
    priceSource = "fixed_price";
  } else if (rule.kind === "market") {
    const retail = num5(rule.marketRetail);
    const discountPct = num5(rule.marketDiscountPct);
    const marketUnit2 = Math.max(0, retail * (1 - discountPct / 100));
    if (brk && num5(brk.unit_price) < marketUnit2) {
      unitPrice = num5(brk.unit_price);
      priceSource = "qty_break";
      breakApplied = brk;
    } else {
      unitPrice = marketUnit2;
      priceSource = "market";
    }
    market = { marketRetail: retail, marketDiscountPct: discountPct, marketUnit: round4(marketUnit2) };
  } else if (rule.kind === "breaks") {
    if (brk) {
      unitPrice = num5(brk.unit_price);
      priceSource = "qty_break";
      breakApplied = brk;
    } else {
      unitPrice = unitCost * (1 + num5(rule.markupPct) / 100);
      priceSource = Number.isFinite(Number(rule.markupPct)) ? "markup" : "cost_passthrough";
    }
  } else {
    if (brk) {
      unitPrice = num5(brk.unit_price);
      priceSource = "qty_break";
      breakApplied = brk;
    } else {
      unitPrice = unitCost * (1 + num5(rule.markupPct) / 100);
      priceSource = "markup";
    }
  }
  const baseUnitPrice = unitPrice;
  const ruleMods = Array.isArray(rule.formulaModifiers) ? rule.formulaModifiers : [];
  const ruleModKeys = new Set(ruleMods.map((m) => `${normStr(m?.type)}|${Number(m?.value)}`));
  const callerMods = (Array.isArray(input.modifiers) ? input.modifiers : []).filter((m) => !ruleModKeys.has(`${normStr(m?.type)}|${Number(m?.value)}`));
  const modResult = applyFormulaModifiers(unitPrice, [...ruleMods, ...callerMods]);
  unitPrice = modResult.unitPrice;
  const extension = round2(unitPrice * qty);
  const ruleMin = num5(rule.minimumCharge);
  const callerMin = num5(input.minimumCharge);
  const minimumCharge = Math.max(ruleMin, callerMin);
  const minimumApplied = minimumCharge > 0 && extension > 0 && extension < minimumCharge;
  const extended = minimumApplied ? round2(minimumCharge) : extension;
  const setupFee = Math.max(0, num5(input.setupFee ?? input.setup_fee));
  const subtotal = round2(extended + setupFee);
  const taxable = input.taxable !== false;
  const taxPercent = Math.max(0, num5(input.taxPercent ?? input.tax_percent));
  const tax = taxable ? round2(subtotal * (taxPercent / 100)) : 0;
  const total = round2(subtotal + tax);
  return {
    label: String(input.label ?? ""),
    category: String(input.category ?? ""),
    pricingUnit: String(input.pricingUnit ?? input.pricing_unit ?? "each"),
    qty,
    unitCost,
    tier,
    rule,
    baseUnitPrice: round4(baseUnitPrice),
    unitPrice: round4(unitPrice),
    priceSource,
    breakApplied,
    market,
    modifiersApplied: modResult.applied,
    extension,
    minimumCharge: minimumCharge > 0 ? minimumCharge : 0,
    minimumApplied,
    extended,
    setupFee,
    subtotal,
    taxable,
    taxPercent,
    tax,
    total,
    danglingTierRef: rule.danglingTierRef || null
  };
}
function matrixRowToRule(row, opts = {}) {
  if (!row || typeof row !== "object") return null;
  const out = { ...row };
  out.status = normStr(row.status) === "inactive" ? "inactive" : "active";
  const rawBreaks = Array.isArray(row.per_unit_breaks) ? row.per_unit_breaks : Array.isArray(row.unit_breaks) ? row.unit_breaks : Array.isArray(row.qty_breaks) ? row.qty_breaks : null;
  if (rawBreaks) {
    const clean = rawBreaks.map((b) => ({
      qty: num5(b?.qty ?? b?.min_qty ?? b?.quantity, NaN),
      unit_price: num5(b?.unit_price ?? b?.price, NaN)
    })).filter((b) => Number.isFinite(b.qty) && b.qty > 0 && Number.isFinite(b.unit_price));
    if (clean.length) out.per_unit_breaks = clean;
    else delete out.per_unit_breaks;
  }
  if (normStr(out.pricing_mode) === "market-based") out.pricing_mode = "market_based";
  const retail = firstFinite(row.market_retail, row.retail_price, row.retail);
  if (retail != null) out.market_retail = retail;
  const discount = firstFinite(row.market_discount_pct, row.discount_pct);
  if (discount != null) out.market_discount_pct = discount;
  if (wantsInterpolatedBreaks(row) || opts.interpolateBreaks === true) {
    out.interpolate_breaks = true;
  }
  return out;
}
function matrixRowsToRules(rows, opts = {}) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const list = Array.isArray(rows) ? rows : Array.isArray(rows?.rows) ? rows.rows : [];
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    if (!rowIsActive(row)) continue;
    if (!rowIsEffective(row, now)) continue;
    out.push(matrixRowToRule(row, opts));
  }
  return out;
}
var MODE_TOKENS = {
  fixed: PRICING_MODES.FIXED,
  fixed_price: PRICING_MODES.FIXED,
  flat: PRICING_MODES.FIXED,
  market: PRICING_MODES.MARKET_BASED,
  market_based: PRICING_MODES.MARKET_BASED,
  "market-based": PRICING_MODES.MARKET_BASED,
  retail: PRICING_MODES.MARKET_BASED,
  retail_minus_discount: PRICING_MODES.MARKET_BASED,
  cost_plus: PRICING_MODES.COST_PLUS,
  "cost-plus": PRICING_MODES.COST_PLUS,
  costplus: PRICING_MODES.COST_PLUS,
  markup: PRICING_MODES.COST_PLUS,
  tier: PRICING_MODES.COST_PLUS,
  tier_markup: PRICING_MODES.COST_PLUS,
  tiered: PRICING_MODES.COST_PLUS
};

// base44/shared/pricingTemplateModel.ts
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString = (v) => v === null || v === void 0 ? "" : String(v).trim();
var toFiniteNumber = (v) => {
  if (v === null || v === void 0 || v === "" || typeof v === "object" || typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num6 = (v, fallback = 0) => toFiniteNumber(v) ?? fallback;
var lc = (v) => asString(v).toLowerCase();
var round22 = (n) => Math.round((num6(n) + Number.EPSILON) * 100) / 100;
var round42 = (n) => Math.round((num6(n) + Number.EPSILON) * 1e4) / 1e4;
var firstField = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite2 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    const n = toFiniteNumber(rec[f]);
    if (n !== null) return n;
  }
  return null;
};
var scopedFinite = (part, fields) => {
  if (!part) return null;
  return firstFinite2(part, fields) ?? firstFinite2(isRecord(part.detail_overrides) ? part.detail_overrides : null, fields) ?? firstFinite2(isRecord(part.pricing_basis_snapshot) ? part.pricing_basis_snapshot : null, fields);
};
var BREAK_QTY_FIELDS = [
  "qty",
  "min_qty",
  "qty_from",
  "from_qty",
  "min_quantity",
  "quantity",
  "break_qty",
  "threshold"
];
var TIER_MAP_FIELDS = [
  "tier_markups",
  "tierMarkups",
  "tier_margins",
  "tierMargins",
  "tiers"
];
var UNIT_PRICE_FIELDS = ["unit_price", "price", "sell_price", "rate"];
var MARKUP_FIELDS = ["markup_pct", "markup", "markup_percent"];
var DISCOUNT_FIELDS = ["discount_pct", "discount", "discount_percent", "pct_off"];
var RETAIL_FIELDS = ["market_retail", "retail", "retail_price", "list_price"];
var RETAIL_DISCOUNT_FIELDS = ["market_discount_pct", "retail_discount_pct"];
var MIN_CHARGE_FIELDS = ["minimum_charge", "min_charge", "minimum"];
var CHART_FIELDS = ["breaks", "rows", "margin_rows", "brackets", "chart"];
var PART_TEMPLATE_ID_FIELDS = [
  "pricing_template_id",
  "template_id",
  "margin_template_id"
];
var PART_TEMPLATE_NAME_FIELDS = [
  "pricing_template_name",
  "template_name"
];
var PART_TEMPLATE_EMBED_FIELDS = ["pricing_template", "template"];
var PART_TIER_SET_FIELDS = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id"
];
var PART_TIER_SET_NAME_FIELDS = [
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var PART_FIXED_FIELDS = [
  "fixed_price",
  "price_override",
  "override_price",
  "flat_price"
];
var PART_BREAK_FIELDS = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var PART_MARKET_RETAIL_FIELDS = RETAIL_FIELDS;
var PART_MARKET_DISCOUNT_FIELDS = ["market_discount_pct", "retail_discount_pct", "discount_pct"];
var PART_MARKUP_FIELDS = ["markup_pct", "markup", "markup_percent"];
var PART_MIN_CHARGE_FIELDS = ["min_charge", "minimum_charge", "minimum"];
var PART_UNIT_FIELDS = [
  "unit",
  "pricing_unit",
  "pricingUnit",
  "unit_category",
  "uom",
  "unit_of_measure"
];
var TEMPLATE_MODE_FIELDS = ["pricing_mode", "price_mode", "mode"];
var MARKET_MODE_TOKENS = /* @__PURE__ */ new Set(["market", "market_based", "market-based", "retail", "retail_minus_discount"]);
var normalizeTierKey = (v) => {
  if (v === null || v === void 0) return "";
  if (typeof v === "object") return "";
  const s = lc(v);
  if (!s) return "";
  const n = Number(s);
  if (Number.isFinite(n) && /^[-+]?\d+(\.\d+)?$/.test(s)) return String(n);
  return s;
};
var tierKeysOf = (tier) => {
  const keys = /* @__PURE__ */ new Set();
  const add = (v) => {
    const k = normalizeTierKey(v);
    if (k) keys.add(k);
  };
  if (isRecord(tier)) {
    for (const f of ["tier_number", "tier_name", "name", "id", "tier", "key"]) add(tier[f]);
  } else {
    add(tier);
  }
  return keys;
};
var chartRows = (raw) => {
  for (const f of CHART_FIELDS) {
    if (Array.isArray(raw[f])) return raw[f];
  }
  return [];
};
var normalizeTierMarkups = (raw, warnings, rowIdx) => {
  const src = firstField(raw, TIER_MAP_FIELDS);
  const out = {};
  if (src === void 0) return out;
  if (!isRecord(src)) {
    warnings.push(`break ${rowIdx + 1}: tier_markups is not an object \u2014 ignored`);
    return out;
  }
  for (const [k, v] of Object.entries(src)) {
    const n = toFiniteNumber(v);
    if (n === null) {
      warnings.push(`break ${rowIdx + 1}: tier_markups["${k}"] is not a number \u2014 dropped`);
      continue;
    }
    out[k] = n;
  }
  return out;
};
var normalizeBreak = (raw, index, warnings) => {
  if (!isRecord(raw)) {
    warnings.push(`break ${index + 1}: non-object row rejected`);
    return null;
  }
  const qtyField = BREAK_QTY_FIELDS.find((f) => raw[f] !== void 0 && raw[f] !== null && raw[f] !== "");
  if (qtyField !== void 0) {
    const q = toFiniteNumber(raw[qtyField]);
    if (q === null || q < 0) {
      warnings.push(`break ${index + 1}: ${qtyField} '${asString(raw[qtyField])}' is not a non-negative number \u2014 row rejected`);
      return null;
    }
  }
  const qty = qtyField !== void 0 ? num6(raw[qtyField]) : 0;
  const tier_markups = normalizeTierMarkups(raw, warnings, index);
  const unit_price = firstFinite2(raw, UNIT_PRICE_FIELDS);
  const markup_pct = firstFinite2(raw, MARKUP_FIELDS);
  const discount_pct = firstFinite2(raw, DISCOUNT_FIELDS);
  const market_retail = firstFinite2(raw, RETAIL_FIELDS);
  const market_discount_pct = firstFinite2(raw, RETAIL_DISCOUNT_FIELDS);
  const minimum_charge = firstFinite2(raw, MIN_CHARGE_FIELDS);
  const hasContent = Object.keys(tier_markups).length > 0 || unit_price !== null || markup_pct !== null || discount_pct !== null || market_retail !== null;
  if (!hasContent) {
    warnings.push(`break ${index + 1}: no usable pricing content \u2014 row rejected`);
    return null;
  }
  return {
    qty,
    tier_markups,
    unit_price,
    markup_pct,
    discount_pct,
    market_retail,
    market_discount_pct,
    minimum_charge,
    index,
    raw
  };
};
var templateIsMarketBased = (raw) => {
  if (raw.market_based === true || lc(raw.market_based) === "true") return true;
  for (const f of TEMPLATE_MODE_FIELDS) {
    if (MARKET_MODE_TOKENS.has(lc(raw[f]))) return true;
  }
  return false;
};
function normalizePricingTemplate(raw) {
  if (!isRecord(raw)) return null;
  const warnings = [];
  const rows = chartRows(raw);
  const breaks = [];
  let rejected = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const b = normalizeBreak(rows[i], i, warnings);
    if (b === null) rejected += 1;
    else breaks.push(b);
  }
  breaks.sort((a, b) => a.qty - b.qty || a.index - b.index);
  const status = asString(raw.status) || "active";
  return {
    id: asString(raw.id ?? raw.template_id),
    name: asString(raw.name),
    unit_category: asString(raw.unit_category ?? raw.unitCategory),
    breaks,
    market_based: templateIsMarketBased(raw),
    status,
    active: lc(status) !== "inactive",
    sort: num6(raw.sort ?? raw.sort_order),
    description: asString(raw.description),
    unit_price: firstFinite2(raw, UNIT_PRICE_FIELDS),
    markup_pct: firstFinite2(raw, MARKUP_FIELDS),
    discount_pct: firstFinite2(raw, DISCOUNT_FIELDS),
    market_retail: firstFinite2(raw, RETAIL_FIELDS),
    market_discount_pct: firstFinite2(raw, RETAIL_DISCOUNT_FIELDS),
    minimum_charge: firstFinite2(raw, MIN_CHARGE_FIELDS),
    rejected_breaks: rejected,
    warnings,
    raw
  };
}
var recordLooksLikeTemplate = (v) => isRecord(v) && (Array.isArray(v.breaks) || Array.isArray(v.rows) || Array.isArray(v.margin_rows) || Array.isArray(v.brackets) || Array.isArray(v.chart));
function templateRefForPart(part) {
  const p = isRecord(part) ? part : null;
  if (!p) return null;
  let embedded = null;
  for (const f of PART_TEMPLATE_EMBED_FIELDS) {
    if (recordLooksLikeTemplate(p[f])) {
      embedded = p[f];
      break;
    }
  }
  for (const f of PART_TEMPLATE_ID_FIELDS) {
    const v = asString(p[f]);
    if (v) return { ref: v, via: f, embedded };
  }
  for (const f of PART_TEMPLATE_NAME_FIELDS) {
    const v = asString(p[f]);
    if (v) return { ref: v, via: f, embedded };
  }
  for (const f of PART_TEMPLATE_EMBED_FIELDS) {
    const v = p[f];
    if (isRecord(v)) {
      const inner = asString(v.id ?? v.name ?? v.template_id);
      if (inner) return { ref: inner, via: `${f}.id`, embedded: embedded ?? v };
    } else {
      const s = asString(v);
      if (s) return { ref: s, via: f, embedded };
    }
  }
  if (embedded) return { ref: asString(embedded.id ?? embedded.name), via: "embedded", embedded };
  return null;
}
var templateIds = (t) => {
  const keys = /* @__PURE__ */ new Set();
  for (const k of [t.id, t.template_id]) {
    const s = lc(k);
    if (s) keys.add(s);
  }
  return keys;
};
function templateForPart(part, templates = []) {
  const ref = templateRefForPart(part);
  if (!ref) return null;
  const list = Array.isArray(templates) ? templates.filter(isRecord) : isRecord(templates) && Array.isArray(templates.rows) ? templates.rows.filter(isRecord) : isRecord(templates) && Array.isArray(templates.templates) ? templates.templates.filter(isRecord) : isRecord(templates) ? [templates] : [];
  const wanted = lc(ref.ref);
  if (wanted) {
    const idHit = list.find((t) => templateIds(t).has(wanted));
    if (idHit) return idHit;
    const nameHits = list.filter((t) => lc(t.name) === wanted);
    if (nameHits.length) {
      nameHits.sort((a, b) => {
        const aAct = lc(a.status ?? "active") !== "inactive" ? 0 : 1;
        const bAct = lc(b.status ?? "active") !== "inactive" ? 0 : 1;
        return aAct - bAct || num6(a.sort) - num6(b.sort) || String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });
      return nameHits[0];
    }
  }
  return ref.embedded ?? null;
}
var tierMarkupsHit = (map, tierKeys) => {
  for (const [k, v] of Object.entries(map)) {
    if (tierKeys.has(lc(k)) && Number.isFinite(Number(v))) {
      return { key: k, value: Number(v), match: "exact" };
    }
  }
  for (const fallback of ["default", "*"]) {
    for (const [k, v] of Object.entries(map)) {
      if (lc(k) === fallback && Number.isFinite(Number(v))) {
        return { key: k, value: Number(v), match: "default" };
      }
    }
  }
  const entries = Object.entries(map);
  if (entries.length === 1 && Number.isFinite(Number(entries[0][1]))) {
    return { key: entries[0][0], value: Number(entries[0][1]), match: "lone" };
  }
  return null;
};
var marketUnit = (retail, discountPct) => Math.max(0, retail * (1 - num6(discountPct) / 100));
var bracketPrice = (b, tmpl, tierKeys, base) => {
  const tierHit = tierMarkupsHit(b.tier_markups, tierKeys);
  const pct_source = tierHit ? tierHit.match === "exact" ? "tier_markups" : tierHit.match === "default" ? "tier_markups_default" : "tier_markups_lone" : null;
  const matched_tier = tierHit ? { key: tierHit.key, value: tierHit.value } : null;
  if (tmpl.market_based) {
    if (tierHit && tierHit.value > 0) {
      const disc = b.market_discount_pct ?? b.discount_pct ?? tmpl.market_discount_pct;
      return {
        unit: marketUnit(tierHit.value, disc),
        pct_source,
        pricing_mode: "market_based",
        markup_pct: null,
        discount_pct: disc ?? 0,
        market_retail: tierHit.value,
        market_discount_pct: num6(disc),
        matched_tier,
        detail: `tier retail ${tierHit.key}`
      };
    }
    const rowRetail = b.market_retail !== null && b.market_retail > 0 ? b.market_retail : null;
    const tmplRetail = tmpl.market_retail !== null && tmpl.market_retail > 0 ? tmpl.market_retail : null;
    const retail = rowRetail ?? tmplRetail;
    if (retail !== null) {
      const disc = b.market_discount_pct ?? b.discount_pct ?? tmpl.market_discount_pct;
      return {
        unit: marketUnit(retail, disc),
        pct_source: "market_retail",
        pricing_mode: "market_based",
        markup_pct: null,
        discount_pct: disc ?? 0,
        market_retail: retail,
        market_discount_pct: num6(disc),
        matched_tier,
        detail: rowRetail !== null ? "row market_retail" : "template market_retail"
      };
    }
    if (b.markup_pct !== null) {
      return {
        unit: base * (1 + b.markup_pct / 100),
        pct_source: "markup_pct",
        pricing_mode: "markup",
        markup_pct: b.markup_pct,
        discount_pct: null,
        market_retail: null,
        market_discount_pct: null,
        matched_tier,
        detail: "market chart markup fallback"
      };
    }
    if (b.unit_price !== null) {
      return {
        unit: b.unit_price,
        pct_source: "unit_price",
        pricing_mode: "fixed",
        markup_pct: null,
        discount_pct: null,
        market_retail: null,
        market_discount_pct: null,
        matched_tier,
        detail: "bracket unit_price"
      };
    }
    if (b.discount_pct !== null) {
      return {
        unit: Math.max(0, base * (1 - b.discount_pct / 100)),
        pct_source: "discount_pct",
        pricing_mode: "market_based",
        markup_pct: null,
        discount_pct: b.discount_pct,
        market_retail: null,
        market_discount_pct: b.discount_pct,
        matched_tier,
        detail: "market chart discount off base"
      };
    }
    return null;
  }
  if (tierHit) {
    return {
      unit: base * (1 + tierHit.value / 100),
      pct_source,
      pricing_mode: "markup",
      markup_pct: tierHit.value,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: `tier markup ${tierHit.key}=${tierHit.value}`
    };
  }
  if (b.unit_price !== null) {
    return {
      unit: b.unit_price,
      pct_source: "unit_price",
      pricing_mode: "fixed",
      markup_pct: null,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: "bracket unit_price"
    };
  }
  if (b.markup_pct !== null) {
    return {
      unit: base * (1 + b.markup_pct / 100),
      pct_source: "markup_pct",
      pricing_mode: "markup",
      markup_pct: b.markup_pct,
      discount_pct: null,
      market_retail: null,
      market_discount_pct: null,
      matched_tier,
      detail: "bracket markup_pct"
    };
  }
  if (b.discount_pct !== null) {
    return {
      unit: Math.max(0, base * (1 - b.discount_pct / 100)),
      pct_source: "discount_pct",
      pricing_mode: "markup",
      markup_pct: null,
      discount_pct: b.discount_pct,
      market_retail: null,
      market_discount_pct: b.discount_pct,
      matched_tier,
      detail: "bracket discount off base"
    };
  }
  return null;
};
var pickTemplateBreak = (tmpl, qty, tierKeys, base) => {
  let pick = null;
  for (const b of tmpl.breaks) {
    if (b.qty > qty) continue;
    const price = bracketPrice(b, tmpl, tierKeys, base);
    if (price === null) continue;
    if (!pick || b.qty > pick.bracket.qty) pick = { bracket: b, price };
  }
  return pick;
};
var isRuleSet = (v) => isRecord(v) && Array.isArray(v.rules);
var ruleSetIds = (set) => {
  const keys = /* @__PURE__ */ new Set();
  for (const k of [set.id, set.name]) {
    const s = lc(k);
    if (s) keys.add(s);
  }
  return keys;
};
var partTierSetRefs = (part) => {
  const refs = [];
  for (const f of [...PART_TIER_SET_FIELDS, ...PART_TIER_SET_NAME_FIELDS]) {
    const v = asString(part[f]);
    if (v) refs.push(v);
  }
  return refs;
};
var tierRuleSetHit = (part, ruleSets, tierKeys, base) => {
  const refs = partTierSetRefs(part).map(lc);
  if (!refs.length) return null;
  for (const wanted of refs) {
    for (const set of ruleSets) {
      if (lc(set.status ?? "active") === "inactive") continue;
      if (!ruleSetIds(set).has(wanted)) continue;
      for (const rule of Array.isArray(set.rules) ? set.rules : []) {
        if (!isRecord(rule)) continue;
        const pin = lc(rule.tier ?? rule.customer_tier);
        const pinned = pin && (tierKeys.has(pin) || pin === "*" || pin === "default");
        if (!pinned) continue;
        const pct = toFiniteNumber(rule.markup_pct);
        if (pct === null) continue;
        return {
          unit: base * (1 + pct / 100),
          markup_pct: pct,
          set,
          rule
        };
      }
    }
  }
  return null;
};
var partChartBreaks = (part) => {
  for (const f of PART_BREAK_FIELDS) {
    if (Array.isArray(part[f])) return part[f];
  }
  return [];
};
var pickPartUnitBreak = (breaks, qty) => {
  let pick = null;
  for (const b of breaks) {
    if (!isRecord(b)) continue;
    const bq = num6(b.qty ?? b.min_qty ?? b.quantity, NaN);
    if (!Number.isFinite(bq) || bq <= 0 || bq > qty) continue;
    if (!Number.isFinite(Number(b.unit_price ?? b.price))) continue;
    if (!pick || bq > num6(pick.qty ?? pick.min_qty ?? pick.quantity)) pick = b;
  }
  return pick;
};
function resolveTemplatePrice(input = {}) {
  const args = isRecord(input) ? input : {};
  const part = isRecord(args.part) ? args.part : {};
  const qty = num6(args.qty ?? args.quantity);
  const base = num6(firstField(args, ["base_price", "basePrice", "unit_cost", "unitCost", "cost", "costBase", "cost_base"]) ?? 0);
  const warnings = [];
  const tierValue = firstField(args, ["tier", "customer_tier", "customerTier"]);
  const tiersArg = args.tiers;
  const tierCatalog = Array.isArray(tiersArg) ? tiersArg : [];
  const bareTier = tierValue ?? (!Array.isArray(tiersArg) && !isRecord(tiersArg) ? tiersArg : null);
  const tierKeys = tierKeysOf(
    bareTier !== null && bareTier !== void 0 ? bareTier : isRecord(tiersArg) ? tiersArg : null
  );
  for (const row of tierCatalog) {
    if (!isRecord(row) || isRuleSet(row)) continue;
    const rowKeys = tierKeysOf(row);
    let shared = false;
    for (const k of rowKeys) if (tierKeys.has(k)) {
      shared = true;
      break;
    }
    if (shared) for (const k of rowKeys) tierKeys.add(k);
  }
  const ruleSets = tierCatalog.filter(isRuleSet);
  const ref = templateRefForPart(part);
  const templatePool = Array.isArray(args.templates) ? args.templates : isRecord(args.templates) && Array.isArray(args.templates.rows) ? args.templates.rows : isRecord(args.templates) && Array.isArray(args.templates.templates) ? args.templates.templates : isRecord(args.templates) ? [args.templates] : [];
  let rawTemplate = null;
  let templateVia = "";
  if (isRecord(args.template)) {
    rawTemplate = args.template;
    templateVia = "opts.template";
  } else if (args.template !== void 0 && args.template !== null && asString(args.template)) {
    const wanted = lc(args.template);
    rawTemplate = templatePool.filter(isRecord).find(
      (t) => templateIds(t).has(wanted) || lc(t.name) === wanted
    ) ?? null;
    templateVia = "opts.template";
  } else if (ref) {
    rawTemplate = templateForPart(part, templatePool);
    templateVia = ref.via;
  }
  const tmpl = rawTemplate ? normalizePricingTemplate(rawTemplate) : null;
  if (tmpl) warnings.push(...tmpl.warnings);
  const templateId = tmpl ? tmpl.id || asString(rawTemplate?.name) || asString(ref?.ref) : null;
  const partUnit = lc(firstField(part, PART_UNIT_FIELDS));
  const unitCategory = tmpl ? lc(tmpl.unit_category) : "";
  const unitMismatch = !!tmpl && !!unitCategory && !!partUnit && partUnit !== unitCategory;
  const unitUnverified = !!tmpl && !!unitCategory && !partUnit;
  const chain = [];
  let won = false;
  const record = (layer, hit, detail) => chain.push({ layer, hit, won: false, detail });
  const markWon = () => {
    chain[chain.length - 1].won = true;
    won = true;
  };
  const take = (fn) => {
    if (!won) fn();
  };
  let unit = null;
  let source = "cost_passthrough";
  let pctSource = null;
  let pricingMode = "cost_passthrough";
  let tierRow = null;
  let matchedTier = null;
  let markupPct = null;
  let discountPct = null;
  let marketRetail = null;
  let marketDiscountPct = null;
  let reason = null;
  let breakMinCharge = null;
  let applied = false;
  const fixed = scopedFinite(part, PART_FIXED_FIELDS);
  if (fixed !== null && fixed > 0) {
    record("part_fixed", true, `fixed_price ${fixed}`);
    take(() => {
      markWon();
      unit = fixed;
      source = "part_fixed";
      pctSource = "fixed_price";
      pricingMode = "fixed";
      reason = "fixed_price";
    });
  } else {
    record("part_fixed", false, fixed !== null ? "fixed_price not positive" : "no fixed price");
  }
  {
    let layerReason = null;
    if (!ref && !rawTemplate) layerReason = "no_template_ref";
    else if (!tmpl) layerReason = "template_not_found";
    else if (!tmpl.active) layerReason = "template_inactive";
    else if (unitMismatch) layerReason = "unit_category_mismatch";
    else if (qty <= 0) layerReason = "qty_not_positive";
    if (layerReason) {
      record("template", false, layerReason);
      reason = reason ?? layerReason;
    } else {
      const pick = pickTemplateBreak(tmpl, qty, tierKeys, base);
      if (pick) {
        record(
          "template",
          true,
          `bracket qty>=${pick.bracket.qty} via ${pick.price.pct_source}${templateVia ? ` [${templateVia}]` : ""}`
        );
        take(() => {
          markWon();
          applied = true;
          source = "template";
          pctSource = pick.price.pct_source;
          pricingMode = pick.price.pricing_mode === "fixed" ? "fixed" : pick.price.pricing_mode === "market_based" ? "market_based" : "markup";
          unit = pick.price.unit;
          tierRow = pick.bracket;
          matchedTier = pick.price.matched_tier;
          markupPct = pick.price.markup_pct;
          discountPct = pick.price.discount_pct;
          marketRetail = pick.price.market_retail;
          marketDiscountPct = pick.price.market_discount_pct;
          breakMinCharge = pick.bracket.minimum_charge;
        });
      } else {
        const t = tmpl;
        const flat = bracketPrice(
          {
            qty: 0,
            tier_markups: {},
            unit_price: t.unit_price,
            markup_pct: t.markup_pct,
            discount_pct: t.discount_pct,
            market_retail: t.market_retail,
            market_discount_pct: t.market_discount_pct,
            minimum_charge: null,
            index: -1,
            raw: t.raw
          },
          t,
          tierKeys,
          base
        );
        if (flat) {
          record("template", true, `template_default ${flat.pct_source}${templateVia ? ` [${templateVia}]` : ""}`);
          take(() => {
            markWon();
            applied = true;
            source = "template";
            pctSource = "template_default";
            pricingMode = flat.pricing_mode === "fixed" ? "fixed" : flat.pricing_mode === "market_based" ? "market_based" : "markup";
            unit = flat.unit;
            matchedTier = flat.matched_tier;
            markupPct = flat.markup_pct;
            discountPct = flat.discount_pct;
            marketRetail = flat.market_retail;
            marketDiscountPct = flat.market_discount_pct;
          });
        } else {
          record("template", false, "no_qualifying_break");
          reason = reason ?? "no_qualifying_break";
        }
      }
    }
  }
  {
    const hit = tierRuleSetHit(part, ruleSets, tierKeys, base);
    if (hit) {
      record("tier_rule_set", true, `rule tier ${asString(hit.rule.tier ?? hit.rule.customer_tier)} -> ${hit.markup_pct}%`);
      take(() => {
        markWon();
        source = "tier_rule_set";
        pctSource = "tier_rule_set";
        pricingMode = "markup";
        unit = hit.unit;
        markupPct = hit.markup_pct;
      });
    } else {
      record("tier_rule_set", false, partTierSetRefs(part).length ? "no matching rule" : "no linked rule set");
    }
  }
  {
    const brk = pickPartUnitBreak(partChartBreaks(part), qty);
    if (brk) {
      const price = num6(brk.unit_price ?? brk.price);
      record("part_chart", true, `per_unit_breaks qty>=${num6(brk.qty ?? brk.min_qty ?? brk.quantity)} -> ${price}`);
      take(() => {
        markWon();
        source = "part_chart";
        pctSource = "part_chart";
        pricingMode = "fixed";
        unit = price;
      });
    } else {
      record("part_chart", false, "no qualifying part break");
    }
  }
  {
    const retail = scopedFinite(part, PART_MARKET_RETAIL_FIELDS);
    if (retail !== null && retail > 0) {
      const disc = scopedFinite(part, PART_MARKET_DISCOUNT_FIELDS) ?? 0;
      record("part_market", true, `market_retail ${retail} - ${disc}%`);
      take(() => {
        markWon();
        source = "part_market";
        pctSource = "market_retail";
        pricingMode = "market_based";
        unit = marketUnit(retail, disc);
        marketRetail = retail;
        marketDiscountPct = disc;
        discountPct = disc;
      });
    } else {
      record("part_market", false, "no positive market_retail");
    }
  }
  {
    const partMarkup = scopedFinite(part, PART_MARKUP_FIELDS);
    const shopDefault = toFiniteNumber(args.default_markup_pct ?? args.defaultMarkupPct);
    if (partMarkup !== null && partMarkup !== 0) {
      record("default_markup", true, `part.markup_pct ${partMarkup}`);
      take(() => {
        markWon();
        source = "default_markup";
        pctSource = "markup_pct";
        pricingMode = "markup";
        unit = base * (1 + partMarkup / 100);
        markupPct = partMarkup;
      });
    } else if (shopDefault !== null) {
      record("default_markup", true, `default_markup_pct ${shopDefault}`);
      take(() => {
        markWon();
        source = "default_markup";
        pctSource = "fallback";
        pricingMode = "default_markup";
        unit = base * (1 + shopDefault / 100);
        markupPct = shopDefault;
      });
    } else {
      record("default_markup", false, "no finite fallback percent");
    }
  }
  {
    record("cost_passthrough", true, "unit = base_price");
    take(() => {
      markWon();
      source = "cost_passthrough";
      pricingMode = "cost_passthrough";
      unit = base;
    });
  }
  const unitPrice = num6(unit);
  const extension = round22(unitPrice * qty);
  const minCandidates = [
    breakMinCharge,
    tmpl?.minimum_charge ?? null,
    scopedFinite(part, PART_MIN_CHARGE_FIELDS),
    toFiniteNumber(args.minimum_charge ?? args.minimumCharge)
  ];
  let minimumCharge = 0;
  for (const c of minCandidates) {
    if (c !== null && c > minimumCharge) minimumCharge = c;
  }
  const minimumApplied = minimumCharge > 0 && extension > 0 && extension < minimumCharge;
  const extended = minimumApplied ? round22(minimumCharge) : extension;
  return {
    applied,
    template_id: templateId,
    template_name: tmpl?.name ?? "",
    template: tmpl,
    source,
    pct_source: pctSource,
    pricing_mode: pricingMode,
    qty,
    base_price: base,
    unit_price: round42(unitPrice),
    extended,
    tier_row: tierRow,
    bracket_min_qty: tierRow ? tierRow.qty : null,
    matched_tier: matchedTier,
    markup_pct: markupPct,
    discount_pct: discountPct,
    market_retail: marketRetail,
    market_discount_pct: marketDiscountPct,
    minimum_charge: minimumCharge,
    minimum_applied: minimumApplied,
    reason,
    chain,
    unit_unverified: unitUnverified,
    warnings
  };
}
var TEMPLATE_SUPERSEDED_FIELDS = [
  "tier_ref",
  "tier",
  "tier_name",
  "per_unit_breaks",
  "unit_breaks",
  "qty_breaks",
  "market_retail",
  "retail",
  "retail_price",
  "list_price",
  "market_discount_pct",
  "market_based",
  "pricing_mode",
  "price_mode",
  "markup_pct",
  "markup",
  "markup_percent",
  "discount_pct"
];
function templatePartDescriptor(part, resolution) {
  const p = isRecord(part) ? { ...part } : {};
  if (!resolution || !resolution.applied) return part;
  for (const f of TEMPLATE_SUPERSEDED_FIELDS) delete p[f];
  const pinUnit = () => {
    p.per_unit_breaks = [{ qty: resolution.qty || 1, unit_price: resolution.unit_price }];
  };
  switch (resolution.pricing_mode) {
    case "market_based":
      if (resolution.pct_source === "discount_pct" && resolution.market_retail === null) {
        if (resolution.discount_pct !== null && resolution.discount_pct !== 0) {
          p.markup_pct = -resolution.discount_pct;
        } else {
          pinUnit();
        }
      } else {
        p.pricing_mode = "market_based";
        p.market_retail = resolution.market_retail ?? resolution.unit_price;
        p.market_discount_pct = resolution.market_discount_pct ?? resolution.discount_pct ?? 0;
      }
      break;
    case "fixed":
      pinUnit();
      break;
    case "markup":
    default:
      if (resolution.pct_source === "discount_pct" && resolution.discount_pct !== null) {
        if (resolution.discount_pct !== 0) p.markup_pct = -resolution.discount_pct;
        else pinUnit();
      } else if (resolution.markup_pct !== null && resolution.markup_pct !== 0) {
        p.markup_pct = resolution.markup_pct;
      } else {
        pinUnit();
      }
      break;
  }
  return p;
}

// base44/shared/channelPricingWire.ts
var isRecord2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var num7 = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
var normStr2 = (v) => String(v ?? "").trim().toLowerCase();
var round23 = (n) => Math.round((num7(n) + Number.EPSILON) * 100) / 100;
var round43 = (n) => Math.round((num7(n) + Number.EPSILON) * 1e4) / 1e4;
var firstField2 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite3 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};
var firstNonBlank = (rec, fields) => firstField2(rec, fields);
var CHANNEL_MODULE_KEYS = Object.freeze([
  "channel_letters",
  "channel_letter",
  "channel_letter_installation"
]);
var CHANNEL_ENGINE_CONTEXT_FIELDS = Object.freeze([
  "pricing_engine",
  "engine_pricing",
  "pricing_tier_config",
  "pricing_context"
]);
var CHANNEL_NESTED_CONTEXT_FIELDS = Object.freeze([
  "engine_context",
  "pricing_engine"
]);
var CHANNEL_LINE_PART_FIELDS = Object.freeze([
  "part",
  "pricing",
  "price_config",
  "tier_config",
  "sell_pricing"
]);
var CHANNEL_LINE_MACHINE_FIELDS = Object.freeze([
  "machine",
  "machine_override",
  "machine_pricing",
  "equipment_pricing"
]);
var CHANNEL_LINE_TEMPLATE_FIELDS = Object.freeze([
  "pricing_template",
  "price_template",
  "template"
]);
var CHANNEL_LINE_TEMPLATE_ID_FIELDS = Object.freeze([
  "pricing_template_id",
  "template_id",
  "margin_template_id"
]);
var CHANNEL_LINE_TEMPLATE_NAME_FIELDS = Object.freeze([
  "pricing_template_name",
  "template_name"
]);
var ENGINE_MODE_TOKENS = /* @__PURE__ */ new Set([
  "fixed",
  "fixed_price",
  "flat",
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "cost_plus",
  "cost-plus",
  "costplus",
  "markup",
  "tier",
  "tier_markup",
  "tiered"
]);
var FIXED_PRICE_FIELDS = ["fixed_price", "price_override", "override_price"];
var BREAK_FIELDS = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var MARKUP_FIELDS2 = ["markup_pct", "markup", "markup_percent"];
var MARKET_RETAIL_FIELDS = ["market_retail", "retail_price", "retail"];
var TIER_REF_FIELDS = ["tier_ref"];
var MODIFIER_FIELDS = ["formula_modifiers", "modifiers"];
var MIN_CHARGE_FIELDS2 = ["minimum_charge", "min_charge"];
var TIER_RULES_FIELDS = ["tier_rules", "tierRules", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var CUSTOMER_TIER_FIELDS = ["customer_tier", "customerTier"];
var SETUP_FEE_FIELDS = ["setup_fee", "setupFee"];
var TAX_PCT_FIELDS = ["tax_percent", "taxPercent"];
var MODE_FIELDS = ["pricing_mode", "price_mode", "mode", "active_mode"];
var TEMPLATE_REGISTRY_FIELDS = ["templates", "pricing_templates"];
var TIER_CATALOG_FIELDS = ["tiers", "markup_tiers"];
var DEFAULT_MARKUP_FIELDS = ["default_markup_pct", "defaultMarkupPct", "default_markup"];
var nonBlank = (v) => normStr2(v) !== "";
var hasBreakChart = (src) => BREAK_FIELDS.some((f) => Array.isArray(src?.[f]) && src[f].length > 0);
var hasTemplateEmbed = (src) => CHANNEL_LINE_TEMPLATE_FIELDS.some((f) => isRecord2(src?.[f]));
var templateRefValue = (src) => {
  for (const f of CHANNEL_LINE_TEMPLATE_ID_FIELDS) {
    if (nonBlank(src?.[f])) return { ref: src[f], via: f };
  }
  for (const f of CHANNEL_LINE_TEMPLATE_NAME_FIELDS) {
    if (nonBlank(src?.[f])) return { ref: src[f], via: f };
  }
  for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
    const v = src?.[f];
    if (v !== void 0 && v !== null && !isRecord2(v) && nonBlank(v)) return { ref: v, via: f };
  }
  return null;
};
function descriptorConfigured(src) {
  const via = [];
  if (!isRecord2(src)) return { configured: false, via };
  const fixed = firstFinite3(src, FIXED_PRICE_FIELDS);
  if (fixed !== null && fixed > 0) via.push("fixed_price");
  for (const f of TIER_REF_FIELDS) if (nonBlank(src[f])) via.push(f);
  for (const f of ["tier", "tier_name"]) if (nonBlank(src[f])) via.push(f);
  if (hasBreakChart(src)) via.push("per_unit_breaks");
  const retail = firstFinite3(src, MARKET_RETAIL_FIELDS);
  if (retail !== null && retail > 0) via.push("market_retail");
  const mode = firstField2(src, MODE_FIELDS);
  if (mode !== void 0 && ENGINE_MODE_TOKENS.has(normStr2(mode))) via.push("pricing_mode");
  const markup = firstFinite3(src, MARKUP_FIELDS2);
  if (markup !== null) via.push("markup_pct");
  for (const f of MODIFIER_FIELDS) {
    if (Array.isArray(src[f]) && src[f].length > 0) {
      via.push("formula_modifiers");
      break;
    }
  }
  const minCharge = firstFinite3(src, MIN_CHARGE_FIELDS2);
  if (minCharge !== null && minCharge > 0) via.push("minimum_charge");
  const setupFee = firstFinite3(src, SETUP_FEE_FIELDS);
  if (setupFee !== null && setupFee > 0) via.push("setup_fee");
  for (const f of TIER_RULES_FIELDS) {
    if (Array.isArray(src[f]) && src[f].length > 0) {
      via.push("tier_rules");
      break;
    }
  }
  for (const f of CUSTOMER_TIER_FIELDS) {
    if (nonBlank(src[f])) {
      via.push("customer_tier");
      break;
    }
  }
  if (templateRefValue(src) || hasTemplateEmbed(src)) via.push("pricing_template");
  return { configured: via.length > 0, via };
}
function channelEngineContext(source) {
  if (source && source.__channelPricingContext === true) return source;
  if (!isRecord2(source)) return null;
  let block = null;
  let field = "";
  for (const f of CHANNEL_ENGINE_CONTEXT_FIELDS) {
    if (isRecord2(source[f])) {
      block = source[f];
      field = f;
      break;
    }
  }
  if (!block && isRecord2(source.customer_pricing)) {
    for (const f of CHANNEL_NESTED_CONTEXT_FIELDS) {
      if (isRecord2(source.customer_pricing[f])) {
        block = source.customer_pricing[f];
        field = `customer_pricing.${f}`;
        break;
      }
    }
  }
  if (!block) return null;
  const firstArr = (src, fields) => {
    for (const f of fields) if (Array.isArray(src?.[f]) && src[f].length > 0) return src[f];
    return [];
  };
  const cp = isRecord2(source.customer_pricing) ? source.customer_pricing : null;
  const customerTier = firstNonBlank(block, [...CUSTOMER_TIER_FIELDS, "tier"]) ?? firstNonBlank(source, [...CUSTOMER_TIER_FIELDS, "pricing_tier"]) ?? (cp ? cp.tier_number ?? cp.tier_name ?? void 0 : void 0) ?? null;
  const defaultMarkup = firstFinite3(block, DEFAULT_MARKUP_FIELDS) ?? firstFinite3(block, MARKUP_FIELDS2) ?? (Number.isFinite(Number(source.markup_percent)) ? num7(source.markup_percent) : 0);
  return {
    __channelPricingContext: true,
    field,
    customerTier,
    tierRules: firstArr(block, TIER_RULES_FIELDS),
    template: firstField2(block, ["template", "pricing_template"]),
    templates: firstArr(block, TEMPLATE_REGISTRY_FIELDS),
    tiers: firstArr(block, TIER_CATALOG_FIELDS),
    machine: firstField2(block, ["machine", "machine_override"]),
    defaultMarkupPct: num7(defaultMarkup),
    taxable: typeof block.taxable === "boolean" ? block.taxable : normStr2(block.taxable) === "false" ? false : normStr2(block.taxable) === "true" ? true : void 0,
    taxPercent: num7(firstFinite3(block, TAX_PCT_FIELDS)),
    setupFee: num7(firstFinite3(block, SETUP_FEE_FIELDS)),
    minimumCharge: num7(firstFinite3(block, MIN_CHARGE_FIELDS2)),
    modifiers: Array.isArray(block.modifiers) ? block.modifiers : Array.isArray(block.formula_modifiers) ? block.formula_modifiers : void 0,
    raw: block
  };
}
function channelLinePricingConfig(line) {
  const src = isRecord2(line?.line) && !isRecord2(line?.part) ? line.line : line;
  const via = [];
  let part = null;
  for (const f of CHANNEL_LINE_PART_FIELDS) {
    const d = src?.[f];
    if (!isRecord2(d)) continue;
    const probe = descriptorConfigured(d);
    via.push(...probe.via.map((v) => `${f}.${v}`));
    if (probe.configured && !part) part = { ...d, __via: f };
  }
  const inline = descriptorConfigured(src);
  if (inline.configured) {
    via.push(...inline.via);
    const merged = {};
    for (const f of [
      ...FIXED_PRICE_FIELDS,
      ...TIER_REF_FIELDS,
      "tier",
      "tier_name",
      ...BREAK_FIELDS,
      ...MARKET_RETAIL_FIELDS,
      "market_discount_pct",
      ...MODE_FIELDS,
      ...MARKUP_FIELDS2,
      ...MODIFIER_FIELDS,
      ...MIN_CHARGE_FIELDS2,
      ...SETUP_FEE_FIELDS
    ]) {
      if (src[f] !== void 0 && src[f] !== null && src[f] !== "") merged[f] = src[f];
    }
    part = part ? { ...merged, ...part } : merged;
  }
  let machine = null;
  for (const f of CHANNEL_LINE_MACHINE_FIELDS) {
    if (isRecord2(src?.[f])) {
      machine = src[f];
      via.push(f);
      break;
    }
  }
  let template = null;
  const tref = templateRefValue(src);
  if (tref) {
    template = tref.ref;
    via.push(tref.via);
  } else {
    for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
      if (isRecord2(src?.[f])) {
        template = src[f];
        via.push(f);
        break;
      }
    }
  }
  if (!template && isRecord2(part)) {
    const ptref = templateRefValue(part);
    if (ptref) {
      template = ptref.ref;
      via.push(`part.${ptref.via}`);
    } else {
      for (const f of CHANNEL_LINE_TEMPLATE_FIELDS) {
        if (isRecord2(part[f])) {
          template = part[f];
          via.push(`part.${f}`);
          break;
        }
      }
    }
  }
  return { configured: via.length > 0, part, machine, template, via };
}
var labelOr = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};
function channelCostLines(record) {
  if (!isRecord2(record)) return [];
  const lines = [];
  const push = (l) => {
    const cost = num7(l.cost);
    const qty = num7(l.qty, 0) > 0 ? num7(l.qty) : 1;
    const unitCost = Number.isFinite(Number(l.unitCost)) ? num7(l.unitCost) : num7(l.qty, 0) > 0 ? cost / num7(l.qty) : cost;
    lines.push({ ...l, cost, qty, unitCost });
  };
  const purchases = Array.isArray(record.letter_purchases) ? record.letter_purchases : [];
  purchases.forEach((lp, i) => {
    const total = num7(lp?.total_cost, num7(lp?.line_total, num7(lp?.qty, 0) * num7(lp?.unit_cost)));
    if (total <= 0) return;
    const desc = labelOr(lp?.description, lp?.letter_type, `Purchase ${i + 1}`);
    const qty = num7(lp?.qty, 0);
    const isDimensional = lp?.letter_type === "dimensional_letters";
    if (isDimensional && isRecord2(lp?.fab_config)) {
      const matCost = num7(lp.fab_config.material_cost) + num7(lp.fab_config.paint_material_cost);
      const laborCost = num7(lp.fab_config.cnc_labor_cost) + num7(lp.fab_config.paint_labor_cost);
      if (matCost > 0) {
        push({
          key: `purchase:${i}:material`,
          label: `Dimensional Letter Material \u2014 ${desc}`,
          cost: matCost,
          qty,
          category: "substrates",
          family: "letter_purchase",
          line: lp
        });
      }
      if (laborCost > 0) {
        push({
          key: `purchase:${i}:labor`,
          label: `Dimensional Letter Fab Labor \u2014 ${desc}`,
          cost: laborCost,
          qty,
          category: "inhouse_labor",
          family: "letter_purchase",
          line: lp
        });
      }
      const remainder = total - matCost - laborCost;
      if (remainder > 0.01) {
        push({
          key: `purchase:${i}:other`,
          label: `Dimensional Letter (other) \u2014 ${desc}`,
          cost: remainder,
          qty,
          category: "substrates",
          family: "letter_purchase",
          line: lp
        });
      }
    } else {
      push({
        key: `purchase:${i}`,
        label: isDimensional ? `Dimensional Letters \u2014 ${desc}` : `Letter Purchase \u2014 ${desc}`,
        cost: total,
        qty,
        category: isDimensional ? "substrates" : "outsourced_fab",
        family: "letter_purchase",
        line: lp
      });
    }
  });
  const onlyDimensional = purchases.length > 0 && purchases.every((lp) => lp?.letter_type === "dimensional_letters");
  const letterFees = (onlyDimensional ? 0 : num7(record.letters_delivery_fee)) + num7(record.letters_design_fee) + num7(record.letters_install_supplies_fee) + num7(record.letters_permitting_fee) + num7(record.letters_other_fee);
  if (letterFees > 0) {
    push({
      key: "letter_fees",
      label: "Letter Fees (delivery/design/permit/etc.)",
      cost: letterFees,
      qty: 1,
      category: "outsourced_fab",
      family: "letter_fees",
      line: null
    });
  }
  const laborViaPersonnel = record.labor_priced_via_personnel !== void 0 ? !!record.labor_priced_via_personnel : num7(record.total_personnel_cost) > 0;
  const items = Array.isArray(record.items) ? record.items : [];
  items.forEach((it, i) => {
    const desc = labelOr(it?.description, it?.installation_type, `Item ${i + 1}`);
    const laborCost = num7(it?.labor_cost);
    const materialsCost = num7(it?.materials_cost);
    if (!laborViaPersonnel && laborCost > 0) {
      push({
        key: `item:${i}:labor`,
        label: `Install Labor \u2014 ${desc}`,
        cost: laborCost,
        qty: num7(it?.qty_letters, 0) || 1,
        category: "inhouse_labor",
        family: "install_item",
        line: it
      });
    }
    if (materialsCost > 0) {
      push({
        key: `item:${i}:materials`,
        label: `Install Materials \u2014 ${desc}`,
        cost: materialsCost,
        qty: num7(it?.qty_letters, 0) || 1,
        category: "outsourced_fab",
        family: "install_item",
        line: it
      });
    }
    if (!laborViaPersonnel && laborCost <= 0 && materialsCost <= 0 && num7(it?.item_total_cost) > 0) {
      push({
        key: `item:${i}`,
        label: `Install Item \u2014 ${desc}`,
        cost: num7(it.item_total_cost),
        qty: num7(it?.qty_letters, 0) || 1,
        category: "outsourced_fab",
        family: "install_item",
        line: it
      });
    }
    if (laborViaPersonnel && materialsCost <= 0 && laborCost <= 0 && num7(it?.item_total_cost) > 0) {
      const matShare = num7(it.item_total_cost) - laborCost;
      if (matShare > 0) {
        push({
          key: `item:${i}`,
          label: `Install Materials \u2014 ${desc}`,
          cost: matShare,
          qty: num7(it?.qty_letters, 0) || 1,
          category: "outsourced_fab",
          family: "install_item",
          line: it
        });
      }
    }
  });
  (Array.isArray(record.selected_equipment) ? record.selected_equipment : []).forEach((sel, i) => {
    const cost = num7(sel?.total_cost);
    if (cost <= 0) return;
    push({
      key: `equipment:${i}`,
      label: `Equipment \u2014 ${labelOr(sel?.equipment_name, sel?.equipment_id, `Row ${i + 1}`)}`,
      cost,
      qty: 1,
      category: "outsourced_services",
      family: "equipment",
      line: sel
    });
  });
  (Array.isArray(record.personnel) ? record.personnel : []).forEach((p, i) => {
    const cost = num7(p?.total_cost, num7(p?.hourly_rate) * num7(p?.hours));
    if (cost <= 0) return;
    push({
      key: `personnel:${i}`,
      label: `Crew \u2014 ${labelOr(p?.name, p?.role, p?.title, `Row ${i + 1}`)}`,
      cost,
      qty: num7(p?.hours, 0) || 1,
      category: "inhouse_labor",
      family: "personnel",
      line: p
    });
  });
  const supplies = num7(record.total_supplies_cost);
  if (supplies > 0) {
    push({
      key: "supplies",
      label: "Supplies",
      cost: supplies,
      qty: 1,
      category: "outsourced_fab",
      family: "supplies",
      line: null
    });
  }
  const travel = num7(record.total_travel_cost);
  if (travel > 0) {
    push({
      key: "travel",
      label: "Travel & Fuel",
      cost: travel,
      qty: 1,
      category: "outsourced_services",
      family: "travel",
      line: null
    });
  }
  return lines;
}
var enginePricer = (engine) => typeof engine === "function" ? engine : typeof engine?.pricePart === "function" ? engine.pricePart : null;
function wireChannelLineSell(input = {}) {
  const line = isRecord2(input.line) ? input.line : isRecord2(input) && input.cost !== void 0 && !input.line ? input : input.line;
  const src = isRecord2(line) ? line : {};
  const chain = [];
  const cost = num7(input.cost ?? input.lineCost ?? src.total_cost ?? src.cost);
  const rawQty = num7(input.qty ?? src.qty ?? src.qty_letters ?? src.quantity, 0);
  const qty = rawQty > 0 ? rawQty : 1;
  const unitCost = Number.isFinite(Number(input.unitCost ?? input.unit_cost)) ? num7(input.unitCost ?? input.unit_cost) : rawQty > 0 ? cost / rawQty : cost;
  const label = String(input.label ?? src.label ?? src.description ?? src.item_name ?? "");
  const category = String(input.category ?? src.category ?? src.category_key ?? "");
  const key = String(input.key ?? src.key ?? label ?? "line");
  const context = channelEngineContext(input.context);
  const ctxPresent = !!context;
  chain.push({ step: "context", detail: ctxPresent ? `context via ${context.field || "input"}` : "no_context" });
  const config = channelLinePricingConfig(src);
  chain.push({
    step: "detect",
    detail: config.configured ? `configured via ${config.via.join(",")}` : "no line config"
  });
  const out = (r) => ({
    priced: false,
    passthrough: false,
    reason: null,
    sellPrice: cost,
    key,
    label,
    cost,
    qty,
    unitCost,
    category,
    via: config.via,
    chain,
    ...r
  });
  if (!config.configured && !ctxPresent) {
    chain.push({ step: "passthrough", detail: "no tier/template config anywhere \u2014 cost echoed verbatim" });
    return out({ passthrough: true, reason: "no_tier_config" });
  }
  const pricer = enginePricer(input.engine);
  if (!pricer) {
    chain.push({ step: "passthrough", detail: "engine not supplied \u2014 cost echoed verbatim" });
    return out({ passthrough: true, reason: "engine_unavailable" });
  }
  let part = config.part;
  if (config.template !== null && config.template !== void 0) {
    const resolver = typeof input.engine?.resolveTemplatePrice === "function" ? input.engine.resolveTemplatePrice : null;
    if (resolver) {
      const templatePart = isRecord2(part) ? { ...part } : { ...isRecord2(src) ? src : {} };
      if (isRecord2(config.template)) templatePart.pricing_template = config.template;
      else templatePart.pricing_template_id = config.template;
      const res = resolver({
        part: templatePart,
        qty,
        base_price: unitCost,
        templates: input.templates ?? context?.templates,
        tiers: input.tiers ?? context?.tiers ?? input.customerTier ?? context?.customerTier,
        customer_tier: input.customerTier ?? context?.customerTier,
        template: isRecord2(input.template) ? input.template : isRecord2(context?.template) ? context?.template : void 0,
        default_markup_pct: context?.defaultMarkupPct,
        minimum_charge: src.minimum_charge ?? context?.minimumCharge
      });
      chain.push({
        step: "template",
        detail: res?.applied === true ? `template priced (${res.source}:${res.pct_source ?? "n/a"} -> unit ${round43(res.unit_price)})` : `template not applied (${res?.reason ?? "unresolved"}) \u2014 engine chain prices`
      });
      if (res?.applied === true) {
        const fold = typeof input.engine?.templatePartDescriptor === "function" ? input.engine.templatePartDescriptor : (p) => p;
        part = fold(part ?? {}, res);
      }
    } else {
      chain.push({ step: "template", detail: "resolveTemplatePrice not supplied \u2014 ref left to engine chain" });
    }
  }
  const customerTier = src.customer_tier ?? src.customerTier ?? (isRecord2(part) ? firstField2(part, CUSTOMER_TIER_FIELDS) : void 0) ?? input.customerTier ?? context?.customerTier ?? null;
  const lineRules = TIER_RULES_FIELDS.reduce((acc, f) => {
    const v = src[f] ?? (isRecord2(part) ? part[f] : void 0);
    return Array.isArray(v) && v.length ? acc.concat(v) : acc;
  }, []);
  const tierRules = lineRules.length ? [...lineRules, ...Array.isArray(input.tierRules) ? input.tierRules : [], ...context?.tierRules ?? []] : [...Array.isArray(input.tierRules) ? input.tierRules : [], ...context?.tierRules ?? []];
  const priced = pricer({
    label,
    category,
    qty,
    unitCost,
    customerTier,
    tierRules,
    part,
    machine: config.machine ?? context?.machine,
    defaultMarkupPct: context?.defaultMarkupPct ?? 0,
    setupFee: firstFinite3(src, SETUP_FEE_FIELDS) ?? context?.setupFee,
    minimumCharge: firstFinite3(src, MIN_CHARGE_FIELDS2) ?? context?.minimumCharge,
    taxable: typeof src.taxable === "boolean" ? src.taxable : context?.taxable,
    taxPercent: firstFinite3(src, TAX_PCT_FIELDS) ?? context?.taxPercent,
    // Line-level formula_modifiers already ride inside `part` (rule
    // modifiers). Passing them as caller `modifiers` too would double-apply
    // (engine runs rule modifiers THEN caller modifiers). Only caller/context
    // modifiers belong here.
    modifiers: input.modifiers ?? context?.modifiers,
    now: input.now
  });
  chain.push({
    step: "engine",
    detail: `pricePart -> ${priced?.priceSource ?? "unknown"} via ${priced?.tier?.source ?? "n/a"} (unit ${priced?.unitPrice ?? "n/a"}, total ${priced?.total ?? "n/a"})`
  });
  return out({
    priced: true,
    sellPrice: num7(priced?.total, cost),
    unitPrice: priced?.unitPrice,
    extension: priced?.extended ?? priced?.extension,
    priceSource: priced?.priceSource,
    tierSource: priced?.tier?.source,
    engine: priced
  });
}
function wireChannelProjectSell(input = {}) {
  const list = Array.isArray(input.lines) ? input.lines : [];
  const context = channelEngineContext(input.context);
  const chain = [{
    step: "context",
    detail: context ? `context via ${context.field || "input"}` : "no_context"
  }];
  const lines = list.map((l, i) => wireChannelLineSell({
    key: l?.key ?? `line:${i}`,
    line: isRecord2(l?.line) ? l.line : l,
    cost: l?.cost ?? l?.total_cost,
    qty: l?.qty,
    unitCost: l?.unitCost,
    label: l?.label,
    category: l?.category ?? l?.category_key,
    context,
    engine: input.engine,
    templates: input.templates,
    tiers: input.tiers,
    customerTier: input.customerTier,
    tierRules: input.tierRules,
    template: input.template,
    now: input.now
  }));
  const pricedCount = lines.filter((l) => l.priced).length;
  const passthroughCount = lines.length - pricedCount;
  const allPassthrough = pricedCount === 0;
  const costTotal = lines.reduce((s, l) => s + l.cost, 0);
  const sellTotal = allPassthrough ? lines.reduce((s, l) => s + l.sellPrice, 0) : round23(lines.reduce((s, l) => s + l.sellPrice, 0));
  chain.push({
    step: "rollup",
    detail: allPassthrough ? `all ${lines.length} lines passthrough \u2014 sellTotal is verbatim cost sum` : `${pricedCount} priced / ${passthroughCount} passthrough -> sellTotal ${sellTotal}`
  });
  return {
    priced: pricedCount > 0,
    allPassthrough,
    sellTotal,
    costTotal,
    lines,
    pricedCount,
    passthroughCount,
    context,
    chain
  };
}
function channelEngineEconomics(input = {}) {
  const record = input.record;
  const chain = [];
  const done = (r) => ({
    wired: false,
    passthrough: false,
    reason: null,
    internalCost: num7(input.internalCost),
    customerPrice: num7(input.customerPrice),
    sell: null,
    lines: [],
    context: null,
    chain,
    ...r
  });
  if (!isRecord2(record)) {
    chain.push({ step: "passthrough", detail: "no record" });
    return done({ passthrough: true, reason: "no_record" });
  }
  const context = channelEngineContext(input.context ?? record);
  const lines = Array.isArray(input.lines) && input.lines.length ? input.lines : channelCostLines(record);
  if (!lines.length) {
    chain.push({ step: "passthrough", detail: "record produced no cost lines" });
    return done({ passthrough: true, reason: "no_cost_lines", context });
  }
  const anyLineConfig = lines.some((l) => channelLinePricingConfig(isRecord2(l?.line) ? l.line : l).configured);
  chain.push({
    step: "detect",
    detail: `${lines.length} cost lines; context ${context ? `via ${context.field}` : "absent"}; line config ${anyLineConfig ? "present" : "absent"}`
  });
  if (!context && !anyLineConfig) {
    chain.push({ step: "passthrough", detail: "no engine config anywhere \u2014 byte-identical" });
    return done({ passthrough: true, reason: "no_tier_config", lines, context });
  }
  const sell = wireChannelProjectSell({
    lines,
    context,
    engine: input.engine,
    templates: input.templates ?? context?.templates,
    tiers: input.tiers ?? context?.tiers,
    customerTier: input.customerTier ?? context?.customerTier,
    tierRules: input.tierRules,
    now: input.now
  });
  chain.push(...sell.chain);
  if (!sell.priced) {
    return done({ passthrough: true, reason: "no_priced_lines", sell, lines, context });
  }
  chain.push({
    step: "wired",
    detail: `engine customerPrice ${sell.sellTotal} over internalCost ${num7(input.internalCost)} (${sell.pricedCount}/${lines.length} priced)`
  });
  return done({
    wired: true,
    customerPrice: sell.sellTotal,
    sell,
    lines,
    context
  });
}

// src/components/estimator/channel/channelSellPricing.js
var ENGINE = { pricePart, resolveTemplatePrice, templatePartDescriptor };
function channelSellEconomics(record, economics) {
  const wired = channelEngineEconomics({
    record,
    internalCost: economics?.internalCost,
    customerPrice: economics?.customerPrice,
    engine: ENGINE
  });
  return wired?.wired === true ? wired : null;
}

// base44/shared/vinylPricingWire.ts
var isRecord3 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString2 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc2 = (v) => asString2(v).toLowerCase();
var toFiniteNumber2 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num8 = (v, fallback = 0) => toFiniteNumber2(v) ?? fallback;
var firstField3 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite4 = (rec, fields) => {
  const v = firstField3(rec, fields);
  const n = toFiniteNumber2(v);
  return n === null ? null : n;
};
var firstArray = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord3(rec[f])) return rec[f];
  }
  return null;
};
var round24 = (n) => Math.round((num8(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_QTY_FIELDS = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS = ["label", "description", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS = ["id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS = ["category_key", "category", "part_category", "pricing_category"];
var ENGINE_BLOCK_FIELDS = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS2 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS2 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS2 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS3 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS = ["formula_modifiers"];
var MODE_FIELDS2 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS = ["tiers", "tier_catalog"];
var VINYL_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS,
  ...TIER_REF_FIELDS2,
  ...BREAK_FIELDS2,
  ...TEMPLATE_REF_FIELDS,
  ...TIER_SET_FIELDS,
  ...MARKET_FIELDS,
  ...MARKET_DISCOUNT_FIELDS,
  ...MARKUP_FIELDS3,
  ...MIN_FIELDS,
  ...SETUP_FIELDS,
  ...FORMULA_FIELDS,
  ...MODE_FIELDS2,
  ...MACHINE_FIELDS,
  ...TIER_CONTEXT_FIELDS,
  ...EMBEDDED_RULE_FIELDS,
  ...EMBEDDED_TEMPLATE_FIELDS,
  ...EMBEDDED_TIER_CATALOG_FIELDS,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);
var isEngineModeToken = (v) => ENGINE_MODE_TOKENS2.has(lc2(v));
var nonEmptyArrayField = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField = (rec, fields) => fields.some((f) => firstFinite4(rec, [f]) !== null);
var anyPositiveField = (rec, fields) => fields.some((f) => {
  const v = firstFinite4(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig = (v) => {
  if (!isRecord3(v)) return false;
  return anyPositiveField(v, [...FIXED_FIELDS, ...MARKET_FIELDS, ...MIN_FIELDS]) || anyFiniteField(v, MARKUP_FIELDS3) || nonEmptyArrayField(v, [...BREAK_FIELDS2, ...FORMULA_FIELDS]) || MODE_FIELDS2.some((f) => isEngineModeToken(v[f])) || TIER_REF_FIELDS2.some((f) => asString2(v[f]) !== "");
};
function descriptorHasPricingContent(d) {
  if (!isRecord3(d)) return false;
  if (anyPositiveField(d, [...FIXED_FIELDS, ...MARKET_FIELDS, ...MARKET_DISCOUNT_FIELDS, ...MIN_FIELDS, ...SETUP_FIELDS]) || anyFiniteField(d, MARKUP_FIELDS3)) return true;
  if (nonEmptyArrayField(d, [...BREAK_FIELDS2, ...FORMULA_FIELDS, ...EMBEDDED_RULE_FIELDS, ...EMBEDDED_TEMPLATE_FIELDS, ...EMBEDDED_TIER_CATALOG_FIELDS])) return true;
  if (MODE_FIELDS2.some((f) => isEngineModeToken(d[f]))) return true;
  if (TIER_REF_FIELDS2.some((f) => asString2(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS.some((f) => {
    const v = d[f];
    return isRecord3(v) ? true : asString2(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS.some((f) => asString2(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS.some((f) => firstField3(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS.some((f) => machineHasConfig(d[f]))) return true;
  return false;
}
var lineKey = (item, index, workflowId = "", position) => {
  const explicit = firstField3(item, LINE_KEY_FIELDS);
  if (explicit !== void 0 && asString2(explicit) !== "") return asString2(explicit);
  if (!workflowId) return `idx-${position ?? index}`;
  return `${workflowId}:${index}`;
};
function vinylRecordLines(record) {
  if (!isRecord3(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord3) : [];
  const source = flat.length ? flat.map((item, index) => ({ item, index, workflowId: asString2(item.workflow_id) })) : (Array.isArray(record.workflows) ? record.workflows : []).flatMap((wf) => {
    if (!isRecord3(wf)) return [];
    const wfId = asString2(wf.id ?? wf.workflow_id ?? wf.name);
    return (Array.isArray(wf.items) ? wf.items : []).filter(isRecord3).map((item, index) => ({ item, index, workflowId: wfId }));
  });
  const origin = flat.length ? "items" : "workflows";
  return source.map(({ item, index, workflowId }, position) => ({
    key: lineKey(item, index, workflowId, position),
    index: position,
    label: asString2(firstField3(item, LINE_LABEL_FIELDS)) || `Item ${position + 1}`,
    qty: num8(firstField3(item, LINE_QTY_FIELDS), 1),
    cost: firstFinite4(item, LINE_COST_FIELDS),
    category_key: asString2(firstField3(item, LINE_CATEGORY_FIELDS)),
    item,
    origin,
    workflow_id: workflowId
  }));
}
var engineBlockOf = (record) => firstRecord(record, ENGINE_BLOCK_FIELDS) ?? {};
function vinylPricingContextOf(record, callerContext = null) {
  const rec = isRecord3(record) ? record : {};
  const block = engineBlockOf(rec);
  const caller = isRecord3(callerContext) ? callerContext : {};
  const cp = isRecord3(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField3(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField3(block, TIER_CONTEXT_FIELDS.concat("tier")) ?? firstField3(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray(block, EMBEDDED_RULE_FIELDS) ?? [];
  const templates = firstArray(caller, ["templates", "pricing_templates"]) ?? firstArray(block, EMBEDDED_TEMPLATE_FIELDS) ?? [];
  const tiers = firstArray(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray(block, EMBEDDED_TIER_CATALOG_FIELDS.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite4(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite4(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite4(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function vinylLineDescriptor(line, record = null) {
  const item = isRecord3(line?.item) ? line.item : isRecord3(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of VINYL_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf(record);
  const lineMap = firstRecord(block, ENGINE_LINE_MAP_FIELDS);
  const mapEntry = lineMap ? isRecord3(lineMap[line?.key]) ? lineMap[line.key] : isRecord3(lineMap[asString2(line?.index)]) ? lineMap[asString2(line?.index)] : null : null;
  const nested = firstRecord(item, NESTED_CONFIG_FIELDS);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function vinylConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : vinylRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = vinylLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveVinylSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord3(input.record) ? input.record : null;
  const baselineSell = num8(input.baselineSell ?? input.baseline_sell);
  const internalCost = num8(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite4(rec, ["subtotal"]);
  const markupPct = firstFinite4(input, ["markupPercent", "markup_percent"]) ?? firstFinite4(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num8(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = vinylPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString2(
      isRecord3(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num8(context.defaultMarkupPct)
  };
  const engine = isRecord3(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : vinylRecordLines(rec);
  const scan = vinylConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord3(line?.item) ? line.item : isRecord3(line) ? line : {};
    const descriptor = vinylLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent(descriptor);
    const cost = line.cost !== void 0 ? line.cost : firstFinite4(rawItem, LINE_COST_FIELDS);
    const qty = num8(line.qty ?? firstField3(rawItem, LINE_QTY_FIELDS), 1) || 0;
    const base = {
      key: line.key || lineKey(rawItem, position),
      label: line.label || asString2(firstField3(rawItem, LINE_LABEL_FIELDS)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField3(partDescriptor, FORMULA_FIELDS);
    for (const f of FORMULA_FIELDS) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField3(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord3(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString2(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString2(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString2(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField3(partDescriptor, TIER_CONTEXT_FIELDS) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField(partDescriptor, EMBEDDED_RULE_FIELDS) ? EMBEDDED_RULE_FIELDS.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField3(partDescriptor, MACHINE_FIELDS) ?? null;
    const setupFee = firstFinite4(partDescriptor, SETUP_FIELDS) ?? void 0;
    const minimumCharge = firstFinite4(partDescriptor, MIN_FIELDS) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString2(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString2(firstField3(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString2(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord3(priced) ? priced : {};
    const lineSubtotal = firstFinite4(pricedRecord, ["subtotal"]) ?? num8(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num8(pricedRecord.unitPrice),
      extended: num8(pricedRecord.extended),
      setup_fee: num8(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num8(pricedRecord.total),
      price_source: asString2(pricedRecord.priceSource),
      tier_source: asString2(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString2(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round24(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round24(configuredBaseline)}) exceeds project sell \u2014 remainder ${round24(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round24(baselineSell)} - configured baseline ${round24(configuredBaseline)} = remainder ${round24(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round24(remainder)} + engine ${round24(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/vinyl/vinylEnginePricing.js
var ENGINE2 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveVinylEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = vinylPricingContextOf(record, caller);
    return resolveVinylSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE2, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function vinylEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveVinylEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/brickPricingWire.ts
var isRecord4 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString3 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc3 = (v) => asString3(v).toLowerCase();
var toFiniteNumber3 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num9 = (v, fallback = 0) => toFiniteNumber3(v) ?? fallback;
var firstField4 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite5 = (rec, fields) => {
  const v = firstField4(rec, fields);
  const n = toFiniteNumber3(v);
  return n === null ? null : n;
};
var firstArray2 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord2 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord4(rec[f])) return rec[f];
  }
  return null;
};
var round25 = (n) => Math.round((num9(n) + Number.EPSILON) * 100) / 100;
var BRICK_MODULE_KEYS = Object.freeze([
  "brick_stone",
  "brick",
  "brickstone",
  "brick_stone_project",
  "masonry"
]);
var BRICK_COMPONENTS = [
  {
    key: "material",
    label: "Brick / Stone Material",
    costFields: ["material_cost", "materials_cost"],
    qtyFields: ["calculated_bricks", "brick_count"],
    category_key: "outsourced_fab"
  },
  {
    key: "mortar",
    label: "Mortar",
    costFields: ["mortar_cost"],
    qtyFields: ["mortar_bags_needed", "mortar_bags"],
    category_key: "outsourced_fab"
  },
  {
    key: "labor",
    label: "Masonry Labor",
    costFields: ["labor_cost"],
    qtyFields: ["labor_hours"],
    category_key: "outsourced_services"
  }
];
var BRICK_COMPONENT_KEYS = Object.freeze(
  BRICK_COMPONENTS.map((c) => c.key)
);
var CONTEXT_BLOCK_FIELDS = [
  "pricing_engine",
  "engine_pricing",
  "pricing_tier_config",
  "pricing_context",
  "engine_context"
];
var NESTED_CONTEXT_FIELDS = ["engine_context", "pricing_engine"];
var ENGINE_LINE_MAP_FIELDS2 = ["items", "lines", "line_config", "item_config"];
var COMPONENT_BLOCK_SUFFIXES = [
  "pricing",
  "price_config",
  "engine_pricing",
  "pricing_config",
  "engine_price",
  "tier_config",
  "sell_pricing"
];
var ENGINE_MODE_TOKENS3 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat",
  "cost_plus",
  "cost-plus",
  "costplus",
  "markup",
  "tier",
  "tier_markup",
  "tiered"
]);
var FIXED_FIELDS2 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS3 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS3 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS2 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS2 = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS2 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS2 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS4 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS2 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS2 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS2 = ["formula_modifiers", "modifiers"];
var MODE_FIELDS3 = ["pricing_mode", "price_mode", "mode", "active_mode"];
var MACHINE_FIELDS2 = ["machine", "machine_override", "machine_pricing", "equipment_pricing"];
var TIER_CONTEXT_FIELDS2 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS2 = ["tier_rules", "tierRules", "tier_matrix", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var EMBEDDED_TEMPLATE_FIELDS2 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS2 = ["tiers", "tier_catalog", "markup_tiers"];
var UNIT_FIELDS = ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"];
var TAX_PCT_FIELDS2 = ["tax_percent", "taxPercent"];
var INTERPOLATE_FIELDS = ["interpolate_breaks", "interpolateBreaks", "interpolate", "break_interpolation"];
var DEFAULT_MARKUP_FIELDS2 = ["default_markup_pct", "defaultMarkupPct", "default_markup"];
var BRICK_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS2,
  ...TIER_REF_FIELDS3,
  ...BREAK_FIELDS3,
  ...TEMPLATE_REF_FIELDS2,
  ...TIER_SET_FIELDS2,
  ...MARKET_FIELDS2,
  ...MARKET_DISCOUNT_FIELDS2,
  ...MARKUP_FIELDS4,
  ...MIN_FIELDS2,
  ...SETUP_FIELDS2,
  ...FORMULA_FIELDS2,
  ...MODE_FIELDS3,
  ...MACHINE_FIELDS2,
  ...TIER_CONTEXT_FIELDS2,
  ...EMBEDDED_RULE_FIELDS2,
  ...EMBEDDED_TEMPLATE_FIELDS2,
  ...EMBEDDED_TIER_CATALOG_FIELDS2,
  ...UNIT_FIELDS,
  ...TAX_PCT_FIELDS2,
  ...INTERPOLATE_FIELDS,
  "taxable"
]);
var isEngineModeToken2 = (v) => ENGINE_MODE_TOKENS3.has(lc3(v));
var nonEmptyArrayField2 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var machineHasConfig2 = (v) => {
  if (!isRecord4(v)) return false;
  const fixed = firstFinite5(v, FIXED_FIELDS2);
  const retail = firstFinite5(v, MARKET_FIELDS2);
  const markup = firstFinite5(v, MARKUP_FIELDS4);
  return fixed !== null && fixed > 0 || retail !== null && retail > 0 || markup !== null || firstFinite5(v, MIN_FIELDS2) !== null || nonEmptyArrayField2(v, [...BREAK_FIELDS3, ...FORMULA_FIELDS2]) || MODE_FIELDS3.some((f) => isEngineModeToken2(v[f])) || TIER_REF_FIELDS3.some((f) => asString3(v[f]) !== "");
};
function descriptorHasPricingContent2(d) {
  if (!isRecord4(d)) return false;
  const fixed = firstFinite5(d, FIXED_FIELDS2);
  if (fixed !== null && fixed > 0) return true;
  if (TIER_REF_FIELDS3.some((f) => asString3(d[f]) !== "")) return true;
  if (nonEmptyArrayField2(d, BREAK_FIELDS3)) return true;
  const retail = firstFinite5(d, MARKET_FIELDS2);
  if (retail !== null && retail > 0) return true;
  const discount = firstFinite5(d, MARKET_DISCOUNT_FIELDS2);
  if (discount !== null && discount !== 0) return true;
  if (MODE_FIELDS3.some((f) => isEngineModeToken2(d[f]))) return true;
  const markup = firstFinite5(d, MARKUP_FIELDS4);
  if (markup !== null) return true;
  if (nonEmptyArrayField2(d, FORMULA_FIELDS2)) return true;
  if (firstFinite5(d, MIN_FIELDS2) !== null) return true;
  if (firstFinite5(d, SETUP_FIELDS2) !== null) return true;
  if (TEMPLATE_REF_FIELDS2.some((f) => {
    const v = d[f];
    return isRecord4(v) ? true : asString3(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS2.some((f) => asString3(d[f]) !== "")) return true;
  if (nonEmptyArrayField2(d, [...EMBEDDED_RULE_FIELDS2, ...EMBEDDED_TEMPLATE_FIELDS2, ...EMBEDDED_TIER_CATALOG_FIELDS2])) return true;
  if (TIER_CONTEXT_FIELDS2.some((f) => asString3(firstField4(d, [f])) !== "")) return true;
  if (MACHINE_FIELDS2.some((f) => machineHasConfig2(d[f]))) return true;
  return false;
}
var componentOf = (key) => BRICK_COMPONENTS.find((c) => c.key === lc3(key)) ?? null;
function brickCostLines(record) {
  if (!isRecord4(record)) return [];
  const lines = [];
  BRICK_COMPONENTS.forEach((comp) => {
    const cost = firstFinite5(record, comp.costFields);
    if (cost === null) return;
    const qty = firstFinite5(record, comp.qtyFields) ?? 1;
    lines.push({
      key: comp.key,
      index: lines.length,
      label: comp.label,
      qty,
      cost,
      category_key: comp.category_key,
      item: record,
      origin: "components"
    });
  });
  return lines;
}
var contextBlockOf = (record) => {
  const rec = isRecord4(record) ? record : {};
  for (const f of CONTEXT_BLOCK_FIELDS) {
    if (isRecord4(rec[f])) return { block: rec[f], field: f };
  }
  const cp = isRecord4(rec.customer_pricing) ? rec.customer_pricing : null;
  if (cp) {
    for (const f of NESTED_CONTEXT_FIELDS) {
      if (isRecord4(cp[f])) return { block: cp[f], field: `customer_pricing.${f}` };
    }
  }
  return { block: null, field: "" };
};
function brickPricingContextOf(record, callerContext = null) {
  const rec = isRecord4(record) ? record : {};
  const caller = isRecord4(callerContext) ? callerContext : {};
  if (callerContext?.__brickPricingContext === true) {
    return callerContext;
  }
  const { block, field } = contextBlockOf(rec);
  const blk = block ?? {};
  const cp = isRecord4(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField4(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField4(blk, [...TIER_CONTEXT_FIELDS2, "tier"]) ?? firstField4(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray2(caller, EMBEDDED_RULE_FIELDS2) ?? firstArray2(blk, EMBEDDED_RULE_FIELDS2) ?? [];
  const templates = firstArray2(caller, EMBEDDED_TEMPLATE_FIELDS2) ?? firstArray2(blk, EMBEDDED_TEMPLATE_FIELDS2) ?? [];
  const tiers = firstArray2(caller, EMBEDDED_TIER_CATALOG_FIELDS2) ?? firstArray2(blk, EMBEDDED_TIER_CATALOG_FIELDS2) ?? [];
  const defaultMarkupPct = firstFinite5(caller, DEFAULT_MARKUP_FIELDS2.concat("markup_pct")) ?? firstFinite5(blk, DEFAULT_MARKUP_FIELDS2.concat(MARKUP_FIELDS4)) ?? firstFinite5(rec, ["markup_percent"]) ?? 0;
  const taxable = typeof caller.taxable === "boolean" ? caller.taxable : typeof blk.taxable === "boolean" ? blk.taxable : lc3(blk.taxable) === "true" ? true : lc3(blk.taxable) === "false" ? false : void 0;
  const callerModifiers = firstArray2(caller, FORMULA_FIELDS2);
  const blockModifiers = firstArray2(blk, FORMULA_FIELDS2);
  return {
    __brickPricingContext: true,
    hasContextBlock: block !== null,
    field,
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct: num9(defaultMarkupPct),
    machine: firstField4(blk, MACHINE_FIELDS2) ?? firstField4(caller, MACHINE_FIELDS2) ?? null,
    taxable,
    taxPercent: num9(firstFinite5(caller, TAX_PCT_FIELDS2) ?? firstFinite5(blk, TAX_PCT_FIELDS2)),
    setupFee: num9(firstFinite5(caller, SETUP_FIELDS2) ?? firstFinite5(blk, SETUP_FIELDS2)),
    minimumCharge: num9(firstFinite5(caller, MIN_FIELDS2) ?? firstFinite5(blk, MIN_FIELDS2)),
    modifiers: callerModifiers ?? blockModifiers ?? void 0,
    lineMap: firstRecord2(blk, ENGINE_LINE_MAP_FIELDS2),
    now: caller.now ?? blk.now,
    raw: block
  };
}
var componentNestedBlock = (record, key) => {
  const rec = isRecord4(record) ? record : {};
  for (const suffix of COMPONENT_BLOCK_SUFFIXES) {
    const f = `${key}_${suffix}`;
    if (isRecord4(rec[f])) return rec[f];
  }
  return null;
};
var engineFieldsFrom = (src, prefix = "") => {
  const out = {};
  if (!isRecord4(src)) return out;
  for (const f of BRICK_ENGINE_LINE_FIELDS) {
    const k = prefix ? `${prefix}_${f}` : f;
    if (src[k] !== void 0 && src[k] !== null && src[k] !== "") out[f] = src[k];
  }
  return out;
};
function brickLineDescriptor(line, record = null) {
  const key = lc3(line?.key);
  if (!componentOf(key)) return null;
  const rec = isRecord4(record) ? record : {};
  const flat = engineFieldsFrom(rec, key);
  const rawLine = isRecord4(line) ? line : {};
  const ownInline = engineFieldsFrom(rawLine);
  const ownNested = firstRecord2(rawLine, ["descriptor", "pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"]);
  const { block } = contextBlockOf(rec);
  const lineMap = block ? firstRecord2(block, ENGINE_LINE_MAP_FIELDS2) : null;
  const mapEntry = lineMap ? isRecord4(lineMap[key]) ? lineMap[key] : isRecord4(lineMap[asString3(line?.index)]) ? lineMap[asString3(line?.index)] : null : null;
  const nested = componentNestedBlock(rec, key);
  const merged = {
    ...flat,
    ...ownInline,
    ...ownNested ?? {},
    ...mapEntry ?? {},
    ...nested ?? {}
  };
  if (!Object.keys(merged).length && !nested && !mapEntry && !ownNested) return null;
  return merged;
}
function brickConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : brickCostLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = brickLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent2(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult2 = (reason, baselineSell, internalCost, markupPct, contextEngaged, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  context_engaged: contextEngaged,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveBrickSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord4(input.record) ? input.record : null;
  const baselineSell = num9(input.baselineSell ?? input.baseline_sell);
  const internalCost = num9(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite5(rec, ["subtotal"]);
  const markupPct = firstFinite5(input, ["markupPercent", "markup_percent"]) ?? firstFinite5(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num9(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = brickPricingContextOf(rec, input.context);
  const contextUsed = {
    context_block: context.field || "",
    customer_tier: asString3(
      isRecord4(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num9(context.defaultMarkupPct)
  };
  const engine = isRecord4(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines.map((l, position) => ({
    key: asString3(l?.key) || `line-${position}`,
    index: position,
    label: asString3(l?.label) || componentOf(l?.key)?.label || `Component ${position + 1}`,
    qty: l?.qty !== void 0 ? num9(l.qty, 1) : componentOf(l?.key) ? firstFinite5(rec, componentOf(l?.key).qtyFields) ?? 1 : 1,
    cost: l?.cost !== void 0 ? toFiniteNumber3(l.cost) : componentOf(l?.key) ? firstFinite5(rec, componentOf(l?.key).costFields) : toFiniteNumber3(l?.item_total_cost ?? l?.line_total_cost ?? l?.total_cost ?? l?.cost),
    category_key: asString3(l?.category_key) || componentOf(l?.key)?.category_key || "",
    item: isRecord4(l?.item) ? l.item : rec,
    descriptor: isRecord4(l) ? l : null,
    origin: "caller"
  })) : brickCostLines(rec);
  const scan = brickConfigScan(rec, wireLines);
  const engaged = context.hasContextBlock || scan.configured;
  chain.push({
    layer: "config_scan",
    hit: engaged,
    won: false,
    detail: context.hasContextBlock ? `context block via ${context.field}${scan.configured ? ` + ${scan.configuredCount} configured component(s)` : ""}` : scan.configured ? `${scan.configuredCount} of ${scan.lineCount} components carry pricing config` : `no pricing config on ${scan.lineCount} components`
  });
  if (!record) return passthroughResult2("no_record", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult2("no_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  if (!engaged) return passthroughResult2("no_config", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult2("no_engine", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const descriptor = brickLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent2(descriptor);
    const enginePrices = configured || context.hasContextBlock;
    const cost = line.cost !== void 0 ? line.cost : null;
    const qty = num9(line.qty, 1);
    const base = {
      key: line.key || `line-${position}`,
      label: line.label || `Component ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      priced_via: null,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!enginePrices) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`component '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor ?? {} };
    const lineModifiers = firstField4(partDescriptor, FORMULA_FIELDS2);
    for (const f of FORMULA_FIELDS2) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS2.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField4(partDescriptor, TIER_CONTEXT_FIELDS2) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord4(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString3(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `component '${base.label}': ${asString3(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`component '${base.label}': template resolution failed (${asString3(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField4(partDescriptor, TIER_CONTEXT_FIELDS2) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField2(partDescriptor, EMBEDDED_RULE_FIELDS2) ? EMBEDDED_RULE_FIELDS2.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField4(partDescriptor, MACHINE_FIELDS2) ?? context.machine;
    const setupFee = firstFinite5(partDescriptor, SETUP_FIELDS2) ?? (context.setupFee || void 0);
    const minimumCharge = firstFinite5(partDescriptor, MIN_FIELDS2) ?? (context.minimumCharge || void 0);
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : context.modifiers;
    const taxable = typeof partDescriptor.taxable === "boolean" ? partDescriptor.taxable : context.taxable;
    const taxPercent = firstFinite5(partDescriptor, TAX_PCT_FIELDS2) ?? (context.taxPercent || void 0);
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString3(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString3(firstField4(partDescriptor, UNIT_FIELDS)) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        taxable,
        taxPercent,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`component '${base.label}': engine pricing failed (${asString3(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord4(priced) ? priced : {};
    const lineSubtotal = firstFinite5(pricedRecord, ["subtotal"]) ?? num9(pricedRecord.extended);
    base.priced = true;
    base.priced_via = configured ? "descriptor" : "context";
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num9(pricedRecord.unitPrice),
      extended: num9(pricedRecord.extended),
      setup_fee: num9(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num9(pricedRecord.total),
      price_source: asString3(pricedRecord.priceSource),
      tier_source: asString3(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString3(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`component '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult2("no_priced_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round25(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`priced components' baseline (${round25(configuredBaseline)}) exceeds project sell \u2014 remainder ${round25(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round25(baselineSell)} - priced baseline ${round25(configuredBaseline)} = remainder ${round25(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round25(remainder)} + engine ${round25(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    context_engaged: context.hasContextBlock,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/brick/brickSellPricing.js
var ENGINE3 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveBrickEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = brickPricingContextOf(record, caller);
    return resolveBrickSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE3, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function brickEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveBrickEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/cncPricingWire.ts
var isRecord5 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString4 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc4 = (v) => asString4(v).toLowerCase();
var toFiniteNumber4 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num10 = (v, fallback = 0) => toFiniteNumber4(v) ?? fallback;
var firstField5 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite6 = (rec, fields) => {
  const v = firstField5(rec, fields);
  const n = toFiniteNumber4(v);
  return n === null ? null : n;
};
var firstArray3 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord3 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord5(rec[f])) return rec[f];
  }
  return null;
};
var round26 = (n) => Math.round((num10(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS2 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_QTY_FIELDS2 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS2 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS2 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS2 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS2 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS2 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS3 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS4 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS3 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS4 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS4 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS3 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS3 = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS3 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS3 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS5 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS3 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS3 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS3 = ["formula_modifiers"];
var MODE_FIELDS4 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS3 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS3 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS3 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS3 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS3 = ["tiers", "tier_catalog"];
var CNC_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS3,
  ...TIER_REF_FIELDS4,
  ...BREAK_FIELDS4,
  ...TEMPLATE_REF_FIELDS3,
  ...TIER_SET_FIELDS3,
  ...MARKET_FIELDS3,
  ...MARKET_DISCOUNT_FIELDS3,
  ...MARKUP_FIELDS5,
  ...MIN_FIELDS3,
  ...SETUP_FIELDS3,
  ...FORMULA_FIELDS3,
  ...MODE_FIELDS4,
  ...MACHINE_FIELDS3,
  ...TIER_CONTEXT_FIELDS3,
  ...EMBEDDED_RULE_FIELDS3,
  ...EMBEDDED_TEMPLATE_FIELDS3,
  ...EMBEDDED_TIER_CATALOG_FIELDS3,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);
var isEngineModeToken3 = (v) => ENGINE_MODE_TOKENS4.has(lc4(v));
var nonEmptyArrayField3 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField2 = (rec, fields) => fields.some((f) => firstFinite6(rec, [f]) !== null);
var anyPositiveField2 = (rec, fields) => fields.some((f) => {
  const v = firstFinite6(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig3 = (v) => {
  if (!isRecord5(v)) return false;
  return anyPositiveField2(v, [...FIXED_FIELDS3, ...MARKET_FIELDS3, ...MIN_FIELDS3]) || anyFiniteField2(v, MARKUP_FIELDS5) || nonEmptyArrayField3(v, [...BREAK_FIELDS4, ...FORMULA_FIELDS3]) || MODE_FIELDS4.some((f) => isEngineModeToken3(v[f])) || TIER_REF_FIELDS4.some((f) => asString4(v[f]) !== "");
};
function descriptorHasPricingContent3(d) {
  if (!isRecord5(d)) return false;
  if (anyPositiveField2(d, [...FIXED_FIELDS3, ...MARKET_FIELDS3, ...MARKET_DISCOUNT_FIELDS3, ...MIN_FIELDS3, ...SETUP_FIELDS3]) || anyFiniteField2(d, MARKUP_FIELDS5)) return true;
  if (nonEmptyArrayField3(d, [...BREAK_FIELDS4, ...FORMULA_FIELDS3, ...EMBEDDED_RULE_FIELDS3, ...EMBEDDED_TEMPLATE_FIELDS3, ...EMBEDDED_TIER_CATALOG_FIELDS3])) return true;
  if (MODE_FIELDS4.some((f) => isEngineModeToken3(d[f]))) return true;
  if (TIER_REF_FIELDS4.some((f) => asString4(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS3.some((f) => {
    const v = d[f];
    return isRecord5(v) ? true : asString4(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS3.some((f) => asString4(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS3.some((f) => firstField5(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS3.some((f) => machineHasConfig3(d[f]))) return true;
  return false;
}
var lineKey2 = (item, index) => {
  const explicit = firstField5(item, LINE_KEY_FIELDS2);
  if (explicit !== void 0 && asString4(explicit) !== "") return asString4(explicit);
  return `idx-${index}`;
};
var lineCostOf = (item) => {
  const direct = firstFinite6(item, LINE_COST_FIELDS2);
  if (direct !== null) return direct;
  const machine = toFiniteNumber4(item.machine_cost);
  const labor = toFiniteNumber4(item.labor_cost);
  if (machine === null && labor === null) return null;
  return num10(machine) + num10(labor);
};
function cncRecordLines(record) {
  if (!isRecord5(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord5) : [];
  return flat.map((item, index) => ({
    key: lineKey2(item, index),
    index,
    label: asString4(firstField5(item, LINE_LABEL_FIELDS2)) || `Item ${index + 1}`,
    qty: num10(firstField5(item, LINE_QTY_FIELDS2), 1),
    cost: lineCostOf(item),
    category_key: asString4(firstField5(item, LINE_CATEGORY_FIELDS2)),
    item,
    origin: "items"
  }));
}
var engineBlockOf2 = (record) => firstRecord3(record, ENGINE_BLOCK_FIELDS2) ?? {};
function cncPricingContextOf(record, callerContext = null) {
  const rec = isRecord5(record) ? record : {};
  const block = engineBlockOf2(rec);
  const caller = isRecord5(callerContext) ? callerContext : {};
  const cp = isRecord5(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField5(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField5(block, TIER_CONTEXT_FIELDS3.concat("tier")) ?? firstField5(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray3(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray3(block, EMBEDDED_RULE_FIELDS3) ?? [];
  const templates = firstArray3(caller, ["templates", "pricing_templates"]) ?? firstArray3(block, EMBEDDED_TEMPLATE_FIELDS3) ?? [];
  const tiers = firstArray3(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray3(block, EMBEDDED_TIER_CATALOG_FIELDS3.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite6(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite6(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite6(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function cncLineDescriptor(line, record = null) {
  const item = isRecord5(line?.item) ? line.item : isRecord5(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of CNC_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf2(record);
  const lineMap = firstRecord3(block, ENGINE_LINE_MAP_FIELDS3);
  const mapEntry = lineMap ? isRecord5(lineMap[line?.key]) ? lineMap[line.key] : isRecord5(lineMap[asString4(line?.index)]) ? lineMap[asString4(line?.index)] : null : null;
  const nested = firstRecord3(item, NESTED_CONFIG_FIELDS2);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function cncConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : cncRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = cncLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent3(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult3 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveCncSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord5(input.record) ? input.record : null;
  const baselineSell = num10(input.baselineSell ?? input.baseline_sell);
  const internalCost = num10(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite6(rec, ["subtotal"]);
  const markupPct = firstFinite6(input, ["markupPercent", "markup_percent"]) ?? firstFinite6(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num10(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = cncPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString4(
      isRecord5(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num10(context.defaultMarkupPct)
  };
  const engine = isRecord5(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : cncRecordLines(rec);
  const scan = cncConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult3("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult3("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult3("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult3("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord5(line?.item) ? line.item : isRecord5(line) ? line : {};
    const descriptor = cncLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent3(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf(rawItem);
    const qty = num10(line.qty ?? firstField5(rawItem, LINE_QTY_FIELDS2), 1) || 0;
    const base = {
      key: line.key || lineKey2(rawItem, position),
      label: line.label || asString4(firstField5(rawItem, LINE_LABEL_FIELDS2)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField5(partDescriptor, FORMULA_FIELDS3);
    for (const f of FORMULA_FIELDS3) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS3.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField5(partDescriptor, TIER_CONTEXT_FIELDS3) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord5(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString4(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString4(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString4(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField5(partDescriptor, TIER_CONTEXT_FIELDS3) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField3(partDescriptor, EMBEDDED_RULE_FIELDS3) ? EMBEDDED_RULE_FIELDS3.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField5(partDescriptor, MACHINE_FIELDS3) ?? null;
    const setupFee = firstFinite6(partDescriptor, SETUP_FIELDS3) ?? void 0;
    const minimumCharge = firstFinite6(partDescriptor, MIN_FIELDS3) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString4(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString4(firstField5(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString4(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord5(priced) ? priced : {};
    const lineSubtotal = firstFinite6(pricedRecord, ["subtotal"]) ?? num10(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num10(pricedRecord.unitPrice),
      extended: num10(pricedRecord.extended),
      setup_fee: num10(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num10(pricedRecord.total),
      price_source: asString4(pricedRecord.priceSource),
      tier_source: asString4(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString4(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult3("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round26(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round26(configuredBaseline)}) exceeds project sell \u2014 remainder ${round26(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round26(baselineSell)} - configured baseline ${round26(configuredBaseline)} = remainder ${round26(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round26(remainder)} + engine ${round26(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/cnc/cncSellPricing.js
var ENGINE4 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveCncEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = cncPricingContextOf(record, caller);
    return resolveCncSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE4, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function cncEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveCncEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/metalPricingWire.ts
var isRecord6 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString5 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc5 = (v) => asString5(v).toLowerCase();
var toFiniteNumber5 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num11 = (v, fallback = 0) => toFiniteNumber5(v) ?? fallback;
var firstField6 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite7 = (rec, fields) => {
  const v = firstField6(rec, fields);
  const n = toFiniteNumber5(v);
  return n === null ? null : n;
};
var firstArray4 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord4 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord6(rec[f])) return rec[f];
  }
  return null;
};
var round27 = (n) => Math.round((num11(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS3 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_COMPONENT_FIELDS = [
  "material_cost",
  "supplies_cost",
  "fabrication_cost",
  "welding_cost",
  "finishing_cost"
];
var RECORD_COMPONENT_TOTAL_FIELDS = [
  "total_material_cost",
  "total_supplies_cost",
  "total_fabrication_cost",
  "total_welding_cost",
  "total_finishing_cost"
];
var ENRICHED_MATERIAL_FIELDS = ["materials_cost"];
var ENRICHED_LABOR_FIELDS = ["labor_cost"];
var LINE_QTY_FIELDS3 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS3 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS3 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS3 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS3 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS3 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS4 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS5 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS4 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS5 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS5 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS4 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS4 = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS4 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS4 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS6 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS4 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS4 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS4 = ["formula_modifiers"];
var MODE_FIELDS5 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS4 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS4 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS4 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS4 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS4 = ["tiers", "tier_catalog"];
var METAL_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS4,
  ...TIER_REF_FIELDS5,
  ...BREAK_FIELDS5,
  ...TEMPLATE_REF_FIELDS4,
  ...TIER_SET_FIELDS4,
  ...MARKET_FIELDS4,
  ...MARKET_DISCOUNT_FIELDS4,
  ...MARKUP_FIELDS6,
  ...MIN_FIELDS4,
  ...SETUP_FIELDS4,
  ...FORMULA_FIELDS4,
  ...MODE_FIELDS5,
  ...MACHINE_FIELDS4,
  ...TIER_CONTEXT_FIELDS4,
  ...EMBEDDED_RULE_FIELDS4,
  ...EMBEDDED_TEMPLATE_FIELDS4,
  ...EMBEDDED_TIER_CATALOG_FIELDS4,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);
var isEngineModeToken4 = (v) => ENGINE_MODE_TOKENS5.has(lc5(v));
var nonEmptyArrayField4 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField3 = (rec, fields) => fields.some((f) => firstFinite7(rec, [f]) !== null);
var anyPositiveField3 = (rec, fields) => fields.some((f) => {
  const v = firstFinite7(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig4 = (v) => {
  if (!isRecord6(v)) return false;
  return anyPositiveField3(v, [...FIXED_FIELDS4, ...MARKET_FIELDS4, ...MIN_FIELDS4]) || anyFiniteField3(v, MARKUP_FIELDS6) || nonEmptyArrayField4(v, [...BREAK_FIELDS5, ...FORMULA_FIELDS4]) || MODE_FIELDS5.some((f) => isEngineModeToken4(v[f])) || TIER_REF_FIELDS5.some((f) => asString5(v[f]) !== "");
};
function descriptorHasPricingContent4(d) {
  if (!isRecord6(d)) return false;
  if (anyPositiveField3(d, [...FIXED_FIELDS4, ...MARKET_FIELDS4, ...MARKET_DISCOUNT_FIELDS4, ...MIN_FIELDS4, ...SETUP_FIELDS4]) || anyFiniteField3(d, MARKUP_FIELDS6)) return true;
  if (nonEmptyArrayField4(d, [...BREAK_FIELDS5, ...FORMULA_FIELDS4, ...EMBEDDED_RULE_FIELDS4, ...EMBEDDED_TEMPLATE_FIELDS4, ...EMBEDDED_TIER_CATALOG_FIELDS4])) return true;
  if (MODE_FIELDS5.some((f) => isEngineModeToken4(d[f]))) return true;
  if (TIER_REF_FIELDS5.some((f) => asString5(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS4.some((f) => {
    const v = d[f];
    return isRecord6(v) ? true : asString5(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS4.some((f) => asString5(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS4.some((f) => firstField6(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS4.some((f) => machineHasConfig4(d[f]))) return true;
  return false;
}
var lineKey3 = (item, index) => {
  const explicit = firstField6(item, LINE_KEY_FIELDS3);
  if (explicit !== void 0 && asString5(explicit) !== "") return asString5(explicit);
  return `idx-${index}`;
};
var qtyMultiplier = (item) => num11(firstField6(item, LINE_QTY_FIELDS3), 1) || 1;
var hasEnrichedCost = (item) => firstFinite7(item, ENRICHED_MATERIAL_FIELDS) !== null || firstFinite7(item, ENRICHED_LABOR_FIELDS) !== null;
var isComponentCostItem = (item) => firstFinite7(item, LINE_COST_FIELDS3) === null && !hasEnrichedCost(item) && LINE_COMPONENT_FIELDS.some((f) => toFiniteNumber5(item[f]) !== null);
function metalComponentsAreExtended(record, items) {
  const rec = isRecord6(record) ? record : {};
  const list = Array.isArray(items) ? items : Array.isArray(rec.items) ? rec.items.filter(isRecord6) : [];
  const componentItems = list.filter(isComponentCostItem);
  if (!componentItems.length) return false;
  let errExtended = 0;
  let errPerUnit = 0;
  let compared = 0;
  LINE_COMPONENT_FIELDS.forEach((comp, i) => {
    const recorded = toFiniteNumber5(rec[RECORD_COMPONENT_TOTAL_FIELDS[i]]);
    if (recorded === null) return;
    let sumExtended = 0;
    let sumPerUnit = 0;
    let any = false;
    for (const item of componentItems) {
      const v = toFiniteNumber5(item[comp]);
      if (v === null) continue;
      any = true;
      sumExtended += v;
      sumPerUnit += v * qtyMultiplier(item);
    }
    if (!any) return;
    errExtended += Math.abs(sumExtended - recorded);
    errPerUnit += Math.abs(sumPerUnit - recorded);
    compared += 1;
  });
  if (!compared) {
    const basis = firstFinite7(rec, ["subtotal"]) ?? (toFiniteNumber5(rec.total_cost) !== null ? num11(rec.total_cost) - num11(rec.markup_amount) : null);
    if (basis === null) return false;
    let sumExtended = 0;
    let sumPerUnit = 0;
    for (const item of list) {
      if (isComponentCostItem(item)) {
        const comps = LINE_COMPONENT_FIELDS.reduce((s, f) => s + num11(item[f]), 0);
        sumExtended += comps;
        sumPerUnit += comps * qtyMultiplier(item);
      } else {
        const other = lineCostOf2(item, false);
        if (other === null) continue;
        sumExtended += other;
        sumPerUnit += other;
      }
    }
    errExtended = Math.abs(sumExtended - basis);
    errPerUnit = Math.abs(sumPerUnit - basis);
  }
  return errExtended < errPerUnit;
}
var lineCostOf2 = (item, componentsExtended = false) => {
  const direct = firstFinite7(item, LINE_COST_FIELDS3);
  if (direct !== null) return direct;
  if (hasEnrichedCost(item)) {
    return num11(firstFinite7(item, ENRICHED_MATERIAL_FIELDS)) + num11(item.supplies_cost) + num11(firstFinite7(item, ENRICHED_LABOR_FIELDS));
  }
  const hasComponent = LINE_COMPONENT_FIELDS.some((f) => toFiniteNumber5(item[f]) !== null);
  if (!hasComponent) return null;
  const compSum = LINE_COMPONENT_FIELDS.reduce((s, f) => s + num11(item[f]), 0);
  return componentsExtended ? compSum : compSum * qtyMultiplier(item);
};
function metalRecordLines(record) {
  if (!isRecord6(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord6) : [];
  const componentsExtended = metalComponentsAreExtended(record, flat);
  return flat.map((item, index) => ({
    key: lineKey3(item, index),
    index,
    label: asString5(firstField6(item, LINE_LABEL_FIELDS3)) || `Item ${index + 1}`,
    qty: num11(firstField6(item, LINE_QTY_FIELDS3), 1),
    cost: lineCostOf2(item, componentsExtended),
    category_key: asString5(firstField6(item, LINE_CATEGORY_FIELDS3)),
    item,
    origin: "items"
  }));
}
var engineBlockOf3 = (record) => firstRecord4(record, ENGINE_BLOCK_FIELDS3) ?? {};
function metalPricingContextOf(record, callerContext = null) {
  const rec = isRecord6(record) ? record : {};
  const block = engineBlockOf3(rec);
  const caller = isRecord6(callerContext) ? callerContext : {};
  const cp = isRecord6(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField6(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField6(block, TIER_CONTEXT_FIELDS4.concat("tier")) ?? firstField6(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray4(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray4(block, EMBEDDED_RULE_FIELDS4) ?? [];
  const templates = firstArray4(caller, ["templates", "pricing_templates"]) ?? firstArray4(block, EMBEDDED_TEMPLATE_FIELDS4) ?? [];
  const tiers = firstArray4(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray4(block, EMBEDDED_TIER_CATALOG_FIELDS4.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite7(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite7(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite7(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function metalLineDescriptor(line, record = null) {
  const item = isRecord6(line?.item) ? line.item : isRecord6(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of METAL_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf3(record);
  const lineMap = firstRecord4(block, ENGINE_LINE_MAP_FIELDS4);
  const mapEntry = lineMap ? isRecord6(lineMap[line?.key]) ? lineMap[line.key] : isRecord6(lineMap[asString5(line?.index)]) ? lineMap[asString5(line?.index)] : null : null;
  const nested = firstRecord4(item, NESTED_CONFIG_FIELDS3);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function metalConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : metalRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = metalLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent4(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult4 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveMetalSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord6(input.record) ? input.record : null;
  const baselineSell = num11(input.baselineSell ?? input.baseline_sell);
  const internalCost = num11(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite7(rec, ["subtotal"]);
  const markupPct = firstFinite7(input, ["markupPercent", "markup_percent"]) ?? firstFinite7(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num11(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = metalPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString5(
      isRecord6(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num11(context.defaultMarkupPct)
  };
  const engine = isRecord6(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : metalRecordLines(rec);
  const scan = metalConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult4("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult4("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult4("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult4("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  const componentsExtended = metalComponentsAreExtended(rec);
  wireLines.forEach((line, position) => {
    const rawItem = isRecord6(line?.item) ? line.item : isRecord6(line) ? line : {};
    const descriptor = metalLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent4(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf2(rawItem, componentsExtended);
    const qty = num11(line.qty ?? firstField6(rawItem, LINE_QTY_FIELDS3), 1) || 0;
    const base = {
      key: line.key || lineKey3(rawItem, position),
      label: line.label || asString5(firstField6(rawItem, LINE_LABEL_FIELDS3)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField6(partDescriptor, FORMULA_FIELDS4);
    for (const f of FORMULA_FIELDS4) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS4.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField6(partDescriptor, TIER_CONTEXT_FIELDS4) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord6(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString5(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString5(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString5(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField6(partDescriptor, TIER_CONTEXT_FIELDS4) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField4(partDescriptor, EMBEDDED_RULE_FIELDS4) ? EMBEDDED_RULE_FIELDS4.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField6(partDescriptor, MACHINE_FIELDS4) ?? null;
    const setupFee = firstFinite7(partDescriptor, SETUP_FIELDS4) ?? void 0;
    const minimumCharge = firstFinite7(partDescriptor, MIN_FIELDS4) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString5(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString5(firstField6(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString5(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord6(priced) ? priced : {};
    const lineSubtotal = firstFinite7(pricedRecord, ["subtotal"]) ?? num11(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num11(pricedRecord.unitPrice),
      extended: num11(pricedRecord.extended),
      setup_fee: num11(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num11(pricedRecord.total),
      price_source: asString5(pricedRecord.priceSource),
      tier_source: asString5(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString5(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult4("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round27(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round27(configuredBaseline)}) exceeds project sell \u2014 remainder ${round27(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round27(baselineSell)} - configured baseline ${round27(configuredBaseline)} = remainder ${round27(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round27(remainder)} + engine ${round27(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/metal/metalSellPricing.js
var ENGINE5 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveMetalEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = metalPricingContextOf(record, caller);
    return resolveMetalSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE5, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function metalEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveMetalEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/laserPricingWire.ts
var isRecord7 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString6 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc6 = (v) => asString6(v).toLowerCase();
var toFiniteNumber6 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num12 = (v, fallback = 0) => toFiniteNumber6(v) ?? fallback;
var firstField7 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite8 = (rec, fields) => {
  const v = firstField7(rec, fields);
  const n = toFiniteNumber6(v);
  return n === null ? null : n;
};
var firstArray5 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord5 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord7(rec[f])) return rec[f];
  }
  return null;
};
var round28 = (n) => Math.round((num12(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS4 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_QTY_FIELDS4 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS4 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS4 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS4 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS4 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS4 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS5 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS6 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS5 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS6 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS6 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS5 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS5 = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS5 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS5 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS7 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS5 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS5 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS5 = ["formula_modifiers"];
var MODE_FIELDS6 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS5 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS5 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS5 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS5 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS5 = ["tiers", "tier_catalog"];
var LASER_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS5,
  ...TIER_REF_FIELDS6,
  ...BREAK_FIELDS6,
  ...TEMPLATE_REF_FIELDS5,
  ...TIER_SET_FIELDS5,
  ...MARKET_FIELDS5,
  ...MARKET_DISCOUNT_FIELDS5,
  ...MARKUP_FIELDS7,
  ...MIN_FIELDS5,
  ...SETUP_FIELDS5,
  ...FORMULA_FIELDS5,
  ...MODE_FIELDS6,
  ...MACHINE_FIELDS5,
  ...TIER_CONTEXT_FIELDS5,
  ...EMBEDDED_RULE_FIELDS5,
  ...EMBEDDED_TEMPLATE_FIELDS5,
  ...EMBEDDED_TIER_CATALOG_FIELDS5,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);
var isEngineModeToken5 = (v) => ENGINE_MODE_TOKENS6.has(lc6(v));
var nonEmptyArrayField5 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField4 = (rec, fields) => fields.some((f) => firstFinite8(rec, [f]) !== null);
var anyPositiveField4 = (rec, fields) => fields.some((f) => {
  const v = firstFinite8(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig5 = (v) => {
  if (!isRecord7(v)) return false;
  return anyPositiveField4(v, [...FIXED_FIELDS5, ...MARKET_FIELDS5, ...MIN_FIELDS5]) || anyFiniteField4(v, MARKUP_FIELDS7) || nonEmptyArrayField5(v, [...BREAK_FIELDS6, ...FORMULA_FIELDS5]) || MODE_FIELDS6.some((f) => isEngineModeToken5(v[f])) || TIER_REF_FIELDS6.some((f) => asString6(v[f]) !== "");
};
function descriptorHasPricingContent5(d) {
  if (!isRecord7(d)) return false;
  if (anyPositiveField4(d, [...FIXED_FIELDS5, ...MARKET_FIELDS5, ...MARKET_DISCOUNT_FIELDS5, ...MIN_FIELDS5, ...SETUP_FIELDS5]) || anyFiniteField4(d, MARKUP_FIELDS7)) return true;
  if (nonEmptyArrayField5(d, [...BREAK_FIELDS6, ...FORMULA_FIELDS5, ...EMBEDDED_RULE_FIELDS5, ...EMBEDDED_TEMPLATE_FIELDS5, ...EMBEDDED_TIER_CATALOG_FIELDS5])) return true;
  if (MODE_FIELDS6.some((f) => isEngineModeToken5(d[f]))) return true;
  if (TIER_REF_FIELDS6.some((f) => asString6(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS5.some((f) => {
    const v = d[f];
    return isRecord7(v) ? true : asString6(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS5.some((f) => asString6(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS5.some((f) => firstField7(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS5.some((f) => machineHasConfig5(d[f]))) return true;
  return false;
}
var lineKey4 = (item, index) => {
  const explicit = firstField7(item, LINE_KEY_FIELDS4);
  if (explicit !== void 0 && asString6(explicit) !== "") return asString6(explicit);
  return `idx-${index}`;
};
var lineCostOf3 = (item) => {
  const direct = firstFinite8(item, LINE_COST_FIELDS4);
  if (direct !== null) return direct;
  const machine = toFiniteNumber6(item.machine_cost);
  const labor = toFiniteNumber6(item.labor_cost);
  if (machine === null && labor === null) return null;
  return num12(machine) + num12(labor);
};
function laserRecordLines(record) {
  if (!isRecord7(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord7) : [];
  return flat.map((item, index) => ({
    key: lineKey4(item, index),
    index,
    label: asString6(firstField7(item, LINE_LABEL_FIELDS4)) || `Item ${index + 1}`,
    qty: num12(firstField7(item, LINE_QTY_FIELDS4), 1),
    cost: lineCostOf3(item),
    category_key: asString6(firstField7(item, LINE_CATEGORY_FIELDS4)),
    item,
    origin: "items"
  }));
}
var engineBlockOf4 = (record) => firstRecord5(record, ENGINE_BLOCK_FIELDS4) ?? {};
function laserPricingContextOf(record, callerContext = null) {
  const rec = isRecord7(record) ? record : {};
  const block = engineBlockOf4(rec);
  const caller = isRecord7(callerContext) ? callerContext : {};
  const cp = isRecord7(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField7(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField7(block, TIER_CONTEXT_FIELDS5.concat("tier")) ?? firstField7(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray5(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray5(block, EMBEDDED_RULE_FIELDS5) ?? [];
  const templates = firstArray5(caller, ["templates", "pricing_templates"]) ?? firstArray5(block, EMBEDDED_TEMPLATE_FIELDS5) ?? [];
  const tiers = firstArray5(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray5(block, EMBEDDED_TIER_CATALOG_FIELDS5.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite8(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite8(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite8(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function laserLineDescriptor(line, record = null) {
  const item = isRecord7(line?.item) ? line.item : isRecord7(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of LASER_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf4(record);
  const lineMap = firstRecord5(block, ENGINE_LINE_MAP_FIELDS5);
  const mapEntry = lineMap ? isRecord7(lineMap[line?.key]) ? lineMap[line.key] : isRecord7(lineMap[asString6(line?.index)]) ? lineMap[asString6(line?.index)] : null : null;
  const nested = firstRecord5(item, NESTED_CONFIG_FIELDS4);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function laserConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : laserRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = laserLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent5(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult5 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveLaserSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord7(input.record) ? input.record : null;
  const baselineSell = num12(input.baselineSell ?? input.baseline_sell);
  const internalCost = num12(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite8(rec, ["subtotal"]);
  const markupPct = firstFinite8(input, ["markupPercent", "markup_percent"]) ?? firstFinite8(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num12(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = laserPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString6(
      isRecord7(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num12(context.defaultMarkupPct)
  };
  const engine = isRecord7(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : laserRecordLines(rec);
  const scan = laserConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult5("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult5("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult5("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult5("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord7(line?.item) ? line.item : isRecord7(line) ? line : {};
    const descriptor = laserLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent5(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf3(rawItem);
    const qty = num12(line.qty ?? firstField7(rawItem, LINE_QTY_FIELDS4), 1) || 0;
    const base = {
      key: line.key || lineKey4(rawItem, position),
      label: line.label || asString6(firstField7(rawItem, LINE_LABEL_FIELDS4)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField7(partDescriptor, FORMULA_FIELDS5);
    for (const f of FORMULA_FIELDS5) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS5.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField7(partDescriptor, TIER_CONTEXT_FIELDS5) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord7(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString6(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString6(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString6(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField7(partDescriptor, TIER_CONTEXT_FIELDS5) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField5(partDescriptor, EMBEDDED_RULE_FIELDS5) ? EMBEDDED_RULE_FIELDS5.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField7(partDescriptor, MACHINE_FIELDS5) ?? null;
    const setupFee = firstFinite8(partDescriptor, SETUP_FIELDS5) ?? void 0;
    const minimumCharge = firstFinite8(partDescriptor, MIN_FIELDS5) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString6(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString6(firstField7(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString6(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord7(priced) ? priced : {};
    const lineSubtotal = firstFinite8(pricedRecord, ["subtotal"]) ?? num12(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num12(pricedRecord.unitPrice),
      extended: num12(pricedRecord.extended),
      setup_fee: num12(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num12(pricedRecord.total),
      price_source: asString6(pricedRecord.priceSource),
      tier_source: asString6(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString6(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult5("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round28(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round28(configuredBaseline)}) exceeds project sell \u2014 remainder ${round28(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round28(baselineSell)} - configured baseline ${round28(configuredBaseline)} = remainder ${round28(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round28(remainder)} + engine ${round28(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/laser/laserSellPricing.js
var ENGINE6 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveLaserEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = laserPricingContextOf(record, caller);
    return resolveLaserSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE6, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function laserEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveLaserEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/paintPricingWire.ts
var isRecord8 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString7 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc7 = (v) => asString7(v).toLowerCase();
var toFiniteNumber7 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num13 = (v, fallback = 0) => toFiniteNumber7(v) ?? fallback;
var firstField8 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite9 = (rec, fields) => {
  const v = firstField8(rec, fields);
  const n = toFiniteNumber7(v);
  return n === null ? null : n;
};
var firstArray6 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord6 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord8(rec[f])) return rec[f];
  }
  return null;
};
var round29 = (n) => Math.round((num13(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS5 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_COMPONENT_FIELDS2 = ["supplies_cost", "paint_cost", "labor_cost"];
var LINE_QTY_FIELDS5 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS5 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS5 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS5 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS5 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS5 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS6 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS7 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS6 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS7 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS7 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS6 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS6 = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS6 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS6 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS8 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS6 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS6 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS6 = ["formula_modifiers"];
var MODE_FIELDS7 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS6 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS6 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS6 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS6 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS6 = ["tiers", "tier_catalog"];
var PAINT_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS6,
  ...TIER_REF_FIELDS7,
  ...BREAK_FIELDS7,
  ...TEMPLATE_REF_FIELDS6,
  ...TIER_SET_FIELDS6,
  ...MARKET_FIELDS6,
  ...MARKET_DISCOUNT_FIELDS6,
  ...MARKUP_FIELDS8,
  ...MIN_FIELDS6,
  ...SETUP_FIELDS6,
  ...FORMULA_FIELDS6,
  ...MODE_FIELDS7,
  ...MACHINE_FIELDS6,
  ...TIER_CONTEXT_FIELDS6,
  ...EMBEDDED_RULE_FIELDS6,
  ...EMBEDDED_TEMPLATE_FIELDS6,
  ...EMBEDDED_TIER_CATALOG_FIELDS6,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);
var isEngineModeToken6 = (v) => ENGINE_MODE_TOKENS7.has(lc7(v));
var nonEmptyArrayField6 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField5 = (rec, fields) => fields.some((f) => firstFinite9(rec, [f]) !== null);
var anyPositiveField5 = (rec, fields) => fields.some((f) => {
  const v = firstFinite9(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig6 = (v) => {
  if (!isRecord8(v)) return false;
  return anyPositiveField5(v, [...FIXED_FIELDS6, ...MARKET_FIELDS6, ...MIN_FIELDS6]) || anyFiniteField5(v, MARKUP_FIELDS8) || nonEmptyArrayField6(v, [...BREAK_FIELDS7, ...FORMULA_FIELDS6]) || MODE_FIELDS7.some((f) => isEngineModeToken6(v[f])) || TIER_REF_FIELDS7.some((f) => asString7(v[f]) !== "");
};
function descriptorHasPricingContent6(d) {
  if (!isRecord8(d)) return false;
  if (anyPositiveField5(d, [...FIXED_FIELDS6, ...MARKET_FIELDS6, ...MARKET_DISCOUNT_FIELDS6, ...MIN_FIELDS6, ...SETUP_FIELDS6]) || anyFiniteField5(d, MARKUP_FIELDS8)) return true;
  if (nonEmptyArrayField6(d, [...BREAK_FIELDS7, ...FORMULA_FIELDS6, ...EMBEDDED_RULE_FIELDS6, ...EMBEDDED_TEMPLATE_FIELDS6, ...EMBEDDED_TIER_CATALOG_FIELDS6])) return true;
  if (MODE_FIELDS7.some((f) => isEngineModeToken6(d[f]))) return true;
  if (TIER_REF_FIELDS7.some((f) => asString7(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS6.some((f) => {
    const v = d[f];
    return isRecord8(v) ? true : asString7(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS6.some((f) => asString7(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS6.some((f) => firstField8(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS6.some((f) => machineHasConfig6(d[f]))) return true;
  return false;
}
var lineKey5 = (item, index) => {
  const explicit = firstField8(item, LINE_KEY_FIELDS5);
  if (explicit !== void 0 && asString7(explicit) !== "") return asString7(explicit);
  return `idx-${index}`;
};
var qtyMultiplier2 = (item) => Math.max(num13(firstField8(item, LINE_QTY_FIELDS5), 1) || 1, 1);
var isComponentCostItem2 = (item) => firstFinite9(item, LINE_COST_FIELDS5) === null && LINE_COMPONENT_FIELDS2.some((f) => toFiniteNumber7(item[f]) !== null);
function paintComponentsAreExtended(record, items) {
  const rec = isRecord8(record) ? record : {};
  const list = Array.isArray(items) ? items : Array.isArray(rec.items) ? rec.items.filter(isRecord8) : [];
  const componentItems = list.filter(isComponentCostItem2);
  if (!componentItems.length) return true;
  const recordedMask = toFiniteNumber7(rec.total_paint_mask_cost);
  if (recordedMask === null) return true;
  let any = false;
  let sumExtended = 0;
  let sumPerUnit = 0;
  for (const item of componentItems) {
    const v = toFiniteNumber7(item.supplies_cost);
    if (v === null) continue;
    any = true;
    sumExtended += v;
    sumPerUnit += v * qtyMultiplier2(item);
  }
  if (!any || Math.abs(sumExtended - sumPerUnit) <= 5e-3) return true;
  return Math.abs(sumExtended - recordedMask) <= Math.abs(sumPerUnit - recordedMask);
}
var lineCostOf4 = (item, componentsExtended = true) => {
  const direct = firstFinite9(item, LINE_COST_FIELDS5);
  if (direct !== null) return direct;
  const hasComponent = LINE_COMPONENT_FIELDS2.some((f) => toFiniteNumber7(item[f]) !== null);
  if (!hasComponent) return null;
  const compSum = LINE_COMPONENT_FIELDS2.reduce((s, f) => s + num13(item[f]), 0);
  return componentsExtended ? compSum : compSum * qtyMultiplier2(item);
};
function paintRecordLines(record) {
  if (!isRecord8(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord8) : [];
  const componentsExtended = paintComponentsAreExtended(record, flat);
  return flat.map((item, index) => ({
    key: lineKey5(item, index),
    index,
    label: asString7(firstField8(item, LINE_LABEL_FIELDS5)) || `Item ${index + 1}`,
    qty: num13(firstField8(item, LINE_QTY_FIELDS5), 1),
    cost: lineCostOf4(item, componentsExtended),
    category_key: asString7(firstField8(item, LINE_CATEGORY_FIELDS5)),
    item,
    origin: "items"
  }));
}
var engineBlockOf5 = (record) => firstRecord6(record, ENGINE_BLOCK_FIELDS5) ?? {};
function paintPricingContextOf(record, callerContext = null) {
  const rec = isRecord8(record) ? record : {};
  const block = engineBlockOf5(rec);
  const caller = isRecord8(callerContext) ? callerContext : {};
  const cp = isRecord8(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField8(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField8(block, TIER_CONTEXT_FIELDS6.concat("tier")) ?? firstField8(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray6(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray6(block, EMBEDDED_RULE_FIELDS6) ?? [];
  const templates = firstArray6(caller, ["templates", "pricing_templates"]) ?? firstArray6(block, EMBEDDED_TEMPLATE_FIELDS6) ?? [];
  const tiers = firstArray6(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray6(block, EMBEDDED_TIER_CATALOG_FIELDS6.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite9(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite9(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite9(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function paintLineDescriptor(line, record = null) {
  const item = isRecord8(line?.item) ? line.item : isRecord8(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of PAINT_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf5(record);
  const lineMap = firstRecord6(block, ENGINE_LINE_MAP_FIELDS6);
  const mapEntry = lineMap ? isRecord8(lineMap[line?.key]) ? lineMap[line.key] : isRecord8(lineMap[asString7(line?.index)]) ? lineMap[asString7(line?.index)] : null : null;
  const nested = firstRecord6(item, NESTED_CONFIG_FIELDS5);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function paintConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : paintRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = paintLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent6(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult6 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolvePaintSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord8(input.record) ? input.record : null;
  const baselineSell = num13(input.baselineSell ?? input.baseline_sell);
  const internalCost = num13(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite9(rec, ["subtotal"]);
  const markupPct = firstFinite9(input, ["markupPercent", "markup_percent"]) ?? firstFinite9(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num13(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = paintPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString7(
      isRecord8(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num13(context.defaultMarkupPct)
  };
  const engine = isRecord8(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : paintRecordLines(rec);
  const scan = paintConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult6("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult6("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult6("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult6("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord8(line?.item) ? line.item : isRecord8(line) ? line : {};
    const descriptor = paintLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent6(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf4(rawItem);
    const qty = num13(line.qty ?? firstField8(rawItem, LINE_QTY_FIELDS5), 1) || 0;
    const base = {
      key: line.key || lineKey5(rawItem, position),
      label: line.label || asString7(firstField8(rawItem, LINE_LABEL_FIELDS5)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField8(partDescriptor, FORMULA_FIELDS6);
    for (const f of FORMULA_FIELDS6) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS6.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField8(partDescriptor, TIER_CONTEXT_FIELDS6) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord8(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString7(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString7(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString7(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField8(partDescriptor, TIER_CONTEXT_FIELDS6) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField6(partDescriptor, EMBEDDED_RULE_FIELDS6) ? EMBEDDED_RULE_FIELDS6.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField8(partDescriptor, MACHINE_FIELDS6) ?? null;
    const setupFee = firstFinite9(partDescriptor, SETUP_FIELDS6) ?? void 0;
    const minimumCharge = firstFinite9(partDescriptor, MIN_FIELDS6) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString7(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString7(firstField8(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString7(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord8(priced) ? priced : {};
    const lineSubtotal = firstFinite9(pricedRecord, ["subtotal"]) ?? num13(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num13(pricedRecord.unitPrice),
      extended: num13(pricedRecord.extended),
      setup_fee: num13(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num13(pricedRecord.total),
      price_source: asString7(pricedRecord.priceSource),
      tier_source: asString7(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString7(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult6("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round29(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round29(configuredBaseline)}) exceeds project sell \u2014 remainder ${round29(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round29(baselineSell)} - configured baseline ${round29(configuredBaseline)} = remainder ${round29(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round29(remainder)} + engine ${round29(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/paint/paintSellPricing.js
var ENGINE7 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolvePaintEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = paintPricingContextOf(record, caller);
    return resolvePaintSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE7, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function paintEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolvePaintEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/foundationPricingWire.ts
var isRecord9 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString8 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc8 = (v) => asString8(v).toLowerCase();
var toFiniteNumber8 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num14 = (v, fallback = 0) => toFiniteNumber8(v) ?? fallback;
var firstField9 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite10 = (rec, fields) => {
  const v = firstField9(rec, fields);
  const n = toFiniteNumber8(v);
  return n === null ? null : n;
};
var firstArray7 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord7 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord9(rec[f])) return rec[f];
  }
  return null;
};
var round210 = (n) => Math.round((num14(n) + Number.EPSILON) * 100) / 100;
var sumRows = (rows, field) => {
  if (!Array.isArray(rows)) return null;
  let hit = false;
  let total = 0;
  for (const r of rows) {
    const n = toFiniteNumber8(isRecord9(r) ? r[field] : null);
    if (n === null) continue;
    hit = true;
    total += n;
  }
  return hit ? total : null;
};
var FOUNDATION_MODULE_KEYS = Object.freeze([
  "foundation",
  "foundation_project",
  "concrete",
  "masonry",
  "concrete_masonry_poles",
  "poles"
]);
var itemSum = (field) => (rec) => sumRows(rec.items, field);
var itemSum2 = (a, b) => (rec) => {
  const x = sumRows(rec.items, a);
  const y = sumRows(rec.items, b);
  if (x === null && y === null) return null;
  return (x ?? 0) + (y ?? 0);
};
var rowCount = (field) => (rec) => Array.isArray(rec[field]) ? rec[field].length : null;
var FOUNDATION_COMPONENTS = [
  {
    key: "concrete",
    label: "Concrete & Delivery",
    costFields: ["total_concrete_cost"],
    qtyFields: ["concrete_delivered_yards", "total_concrete_volume_cy"],
    qtyFrom: itemSum("concrete_volume_cy"),
    category_key: "outsourced_fab"
  },
  {
    key: "rebar",
    label: "Rebar",
    costFields: ["total_rebar_cost"],
    qtyFields: ["total_rebar_feet", "rebar_feet"],
    qtyFrom: itemSum("rebar_feet"),
    category_key: "outsourced_fab"
  },
  {
    key: "excavation",
    label: "Excavation",
    costFields: ["total_excavation_cost"],
    qtyFields: ["total_excavation_volume_cy"],
    qtyFrom: itemSum("excavation_volume_cy"),
    category_key: "inhouse_labor"
  },
  {
    key: "forming",
    label: "Forming Materials",
    costFields: ["total_forming_materials_cost"],
    qtyFields: ["total_forming_qty"],
    qtyFrom: itemSum("forming_qty"),
    category_key: "outsourced_fab"
  },
  {
    key: "labor",
    label: "Pouring & Finishing Labor",
    costFields: ["total_labor_cost"],
    qtyFields: ["total_labor_hours"],
    qtyFrom: itemSum2("pouring_hours", "finishing_hours"),
    category_key: "inhouse_labor"
  },
  {
    // Breakdown line — walls[].calculatedCosts material+mortar+internal
    // material+internal mortar (categorizeFoundationProject 'Brick / Wall /
    // Mortar Materials'). Emitted only when a walls[] row carries a
    // calculatedCosts record; the 'walls' aggregate fills the slot otherwise.
    key: "wall_materials",
    label: "Brick / Wall / Mortar Materials",
    costFields: [],
    category_key: "outsourced_fab",
    aliases: ["walls", "wall"]
  },
  {
    // Breakdown line — walls[].calculatedCosts labor+internal labor
    // (categorizer 'Masonry Labor').
    key: "wall_labor",
    label: "Masonry Labor",
    costFields: [],
    category_key: "outsourced_services",
    aliases: ["walls", "wall"]
  },
  {
    // Aggregate fallback — persisted total_wall_cost when no walls[]
    // calculatedCosts breakdown exists (legacy/manual totals).
    key: "walls",
    label: "Masonry Walls",
    costFields: ["total_wall_cost"],
    qtyFrom: rowCount("walls"),
    category_key: "outsourced_fab",
    aliases: ["wall"]
  },
  {
    key: "poles",
    label: "Poles",
    costFields: ["total_pole_cost"],
    qtyFrom: rowCount("poles"),
    category_key: "outsourced_fab"
  },
  {
    key: "pole_painting",
    label: "Pole Painting",
    costFields: ["total_pole_painting_cost"],
    qtyFrom: (rec) => {
      const rows = rec.poles;
      if (!Array.isArray(rows)) return null;
      const n = rows.filter(
        (p) => isRecord9(p) && (p.paint === true || num14(p.pole_painting_cost) > 0)
      ).length;
      return n || (rows.length ? 0 : null);
    },
    category_key: "outsourced_fab"
  },
  {
    key: "equipment",
    label: "Equipment Rental",
    costFields: ["total_equipment_cost"],
    qtyFrom: rowCount("selected_equipment"),
    category_key: "outsourced_services"
  },
  {
    key: "wall_caps",
    label: "Wall Caps",
    costFields: ["total_wall_cap_cost"],
    qtyFrom: rowCount("wall_caps"),
    category_key: "outsourced_fab"
  },
  {
    key: "signage",
    label: "Signage Cabinets",
    costFields: ["total_signage_cabinet_cost"],
    qtyFrom: (rec) => {
      const rows = rec.signage_cabinets;
      if (!Array.isArray(rows)) return null;
      let hit = false;
      let total = 0;
      for (const c of rows) {
        if (!isRecord9(c)) continue;
        hit = true;
        total += num14(c.quantity, 1);
      }
      return hit ? total : rows.length ? 0 : null;
    },
    category_key: "outsourced_fab"
  },
  {
    key: "landscape",
    label: "Landscape / Site Materials",
    costFields: ["total_landscape_cost"],
    qtyFrom: (rec) => {
      const cells = isRecord9(rec.landscape) && isRecord9(rec.landscape.cells) ? Object.keys(rec.landscape.cells).length : null;
      return cells === null ? null : cells;
    },
    category_key: "outsourced_fab"
  }
];
var FOUNDATION_COMPONENT_KEYS = Object.freeze(
  FOUNDATION_COMPONENTS.map((c) => c.key)
);
var wallCostBreakdown = (rec) => {
  const rows = rec.walls;
  if (!Array.isArray(rows)) return null;
  let hit = false;
  let materials = 0;
  let labor = 0;
  let matQty = 0;
  let labQty = 0;
  for (const w of rows) {
    const costs = isRecord9(w) && isRecord9(w.calculatedCosts) ? w.calculatedCosts : null;
    if (!costs) continue;
    hit = true;
    materials += num14(costs.materialCost) + num14(costs.mortarCost) + num14(costs.internalMaterialCost) + num14(costs.internalMortarCost);
    labor += num14(costs.laborCost) + num14(costs.internalLaborCost);
    matQty += num14(costs.totalBricks) + num14(costs.internalTotalBricks);
    labQty += num14(costs.laborHours) + num14(costs.internalLaborHours);
  }
  return hit ? { materials, labor, matQty, labQty } : null;
};
var CONTEXT_BLOCK_FIELDS2 = [
  "pricing_engine",
  "engine_pricing",
  "pricing_tier_config",
  "pricing_context",
  "engine_context"
];
var NESTED_CONTEXT_FIELDS2 = ["engine_context", "pricing_engine"];
var ENGINE_LINE_MAP_FIELDS7 = ["items", "lines", "line_config", "item_config"];
var COMPONENT_BLOCK_SUFFIXES2 = [
  "pricing",
  "price_config",
  "engine_pricing",
  "pricing_config",
  "engine_price",
  "tier_config",
  "sell_pricing"
];
var ENGINE_MODE_TOKENS8 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat",
  "cost_plus",
  "cost-plus",
  "costplus",
  "markup",
  "tier",
  "tier_markup",
  "tiered"
]);
var FIXED_FIELDS7 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS8 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS8 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS7 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS7 = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS7 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS7 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS9 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS7 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS7 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS7 = ["formula_modifiers", "modifiers"];
var MODE_FIELDS8 = ["pricing_mode", "price_mode", "mode", "active_mode"];
var MACHINE_FIELDS7 = ["machine", "machine_override", "machine_pricing", "equipment_pricing"];
var TIER_CONTEXT_FIELDS7 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS7 = ["tier_rules", "tierRules", "tier_matrix", "rules", "matrix", "matrix_rows", "rows", "pricing_matrix"];
var EMBEDDED_TEMPLATE_FIELDS7 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS7 = ["tiers", "tier_catalog", "markup_tiers"];
var UNIT_FIELDS2 = ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"];
var TAX_PCT_FIELDS3 = ["tax_percent", "taxPercent"];
var INTERPOLATE_FIELDS2 = ["interpolate_breaks", "interpolateBreaks", "interpolate", "break_interpolation"];
var DEFAULT_MARKUP_FIELDS3 = ["default_markup_pct", "defaultMarkupPct", "default_markup"];
var FOUNDATION_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS7,
  ...TIER_REF_FIELDS8,
  ...BREAK_FIELDS8,
  ...TEMPLATE_REF_FIELDS7,
  ...TIER_SET_FIELDS7,
  ...MARKET_FIELDS7,
  ...MARKET_DISCOUNT_FIELDS7,
  ...MARKUP_FIELDS9,
  ...MIN_FIELDS7,
  ...SETUP_FIELDS7,
  ...FORMULA_FIELDS7,
  ...MODE_FIELDS8,
  ...MACHINE_FIELDS7,
  ...TIER_CONTEXT_FIELDS7,
  ...EMBEDDED_RULE_FIELDS7,
  ...EMBEDDED_TEMPLATE_FIELDS7,
  ...EMBEDDED_TIER_CATALOG_FIELDS7,
  ...UNIT_FIELDS2,
  ...TAX_PCT_FIELDS3,
  ...INTERPOLATE_FIELDS2,
  "taxable"
]);
var isEngineModeToken7 = (v) => ENGINE_MODE_TOKENS8.has(lc8(v));
var nonEmptyArrayField7 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var machineHasConfig7 = (v) => {
  if (!isRecord9(v)) return false;
  const fixed = firstFinite10(v, FIXED_FIELDS7);
  const retail = firstFinite10(v, MARKET_FIELDS7);
  const markup = firstFinite10(v, MARKUP_FIELDS9);
  return fixed !== null && fixed > 0 || retail !== null && retail > 0 || markup !== null || firstFinite10(v, MIN_FIELDS7) !== null || nonEmptyArrayField7(v, [...BREAK_FIELDS8, ...FORMULA_FIELDS7]) || MODE_FIELDS8.some((f) => isEngineModeToken7(v[f])) || TIER_REF_FIELDS8.some((f) => asString8(v[f]) !== "");
};
function descriptorHasPricingContent7(d) {
  if (!isRecord9(d)) return false;
  const fixed = firstFinite10(d, FIXED_FIELDS7);
  if (fixed !== null && fixed > 0) return true;
  if (TIER_REF_FIELDS8.some((f) => asString8(d[f]) !== "")) return true;
  if (nonEmptyArrayField7(d, BREAK_FIELDS8)) return true;
  const retail = firstFinite10(d, MARKET_FIELDS7);
  if (retail !== null && retail > 0) return true;
  const discount = firstFinite10(d, MARKET_DISCOUNT_FIELDS7);
  if (discount !== null && discount !== 0) return true;
  if (MODE_FIELDS8.some((f) => isEngineModeToken7(d[f]))) return true;
  const markup = firstFinite10(d, MARKUP_FIELDS9);
  if (markup !== null) return true;
  if (nonEmptyArrayField7(d, FORMULA_FIELDS7)) return true;
  if (firstFinite10(d, MIN_FIELDS7) !== null) return true;
  if (firstFinite10(d, SETUP_FIELDS7) !== null) return true;
  if (TEMPLATE_REF_FIELDS7.some((f) => {
    const v = d[f];
    return isRecord9(v) ? true : asString8(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS7.some((f) => asString8(d[f]) !== "")) return true;
  if (nonEmptyArrayField7(d, [...EMBEDDED_RULE_FIELDS7, ...EMBEDDED_TEMPLATE_FIELDS7, ...EMBEDDED_TIER_CATALOG_FIELDS7])) return true;
  if (TIER_CONTEXT_FIELDS7.some((f) => asString8(firstField9(d, [f])) !== "")) return true;
  if (MACHINE_FIELDS7.some((f) => machineHasConfig7(d[f]))) return true;
  return false;
}
var componentOf2 = (key) => {
  const k = lc8(key);
  return FOUNDATION_COMPONENTS.find((c) => c.key === k) ?? null;
};
var carrierKeys = (spec) => [
  ...spec.aliases ?? [],
  spec.key
];
function foundationCostLines(record) {
  if (!isRecord9(record)) return [];
  const lines = [];
  const walls = wallCostBreakdown(record);
  FOUNDATION_COMPONENTS.forEach((comp) => {
    if (comp.key === "wall_materials" || comp.key === "wall_labor") {
      if (!walls) return;
      const isMat = comp.key === "wall_materials";
      lines.push({
        key: comp.key,
        index: lines.length,
        label: comp.label,
        qty: isMat ? walls.matQty : walls.labQty,
        cost: isMat ? walls.materials : walls.labor,
        category_key: comp.category_key,
        item: record,
        origin: "components"
      });
      return;
    }
    if (comp.key === "walls" && walls) return;
    const cost = firstFinite10(record, comp.costFields);
    if (cost === null) return;
    const qty = firstFinite10(record, comp.qtyFields ?? []) ?? comp.qtyFrom?.(record) ?? 1;
    lines.push({
      key: comp.key,
      index: lines.length,
      label: comp.label,
      qty,
      cost,
      category_key: comp.category_key,
      item: record,
      origin: "components"
    });
  });
  return lines;
}
var contextBlockOf2 = (record) => {
  const rec = isRecord9(record) ? record : {};
  for (const f of CONTEXT_BLOCK_FIELDS2) {
    if (isRecord9(rec[f])) return { block: rec[f], field: f };
  }
  const cp = isRecord9(rec.customer_pricing) ? rec.customer_pricing : null;
  if (cp) {
    for (const f of NESTED_CONTEXT_FIELDS2) {
      if (isRecord9(cp[f])) return { block: cp[f], field: `customer_pricing.${f}` };
    }
  }
  return { block: null, field: "" };
};
function foundationPricingContextOf(record, callerContext = null) {
  const rec = isRecord9(record) ? record : {};
  const caller = isRecord9(callerContext) ? callerContext : {};
  if (callerContext?.__foundationPricingContext === true) {
    return callerContext;
  }
  const { block, field } = contextBlockOf2(rec);
  const blk = block ?? {};
  const cp = isRecord9(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField9(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField9(blk, [...TIER_CONTEXT_FIELDS7, "tier"]) ?? firstField9(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray7(caller, EMBEDDED_RULE_FIELDS7) ?? firstArray7(blk, EMBEDDED_RULE_FIELDS7) ?? [];
  const templates = firstArray7(caller, EMBEDDED_TEMPLATE_FIELDS7) ?? firstArray7(blk, EMBEDDED_TEMPLATE_FIELDS7) ?? [];
  const tiers = firstArray7(caller, EMBEDDED_TIER_CATALOG_FIELDS7) ?? firstArray7(blk, EMBEDDED_TIER_CATALOG_FIELDS7) ?? [];
  const defaultMarkupPct = firstFinite10(caller, DEFAULT_MARKUP_FIELDS3.concat("markup_pct")) ?? firstFinite10(blk, DEFAULT_MARKUP_FIELDS3.concat(MARKUP_FIELDS9)) ?? firstFinite10(rec, ["customer_markup_percent"]) ?? 0;
  const taxable = typeof caller.taxable === "boolean" ? caller.taxable : typeof blk.taxable === "boolean" ? blk.taxable : lc8(blk.taxable) === "true" ? true : lc8(blk.taxable) === "false" ? false : void 0;
  const callerModifiers = firstArray7(caller, FORMULA_FIELDS7);
  const blockModifiers = firstArray7(blk, FORMULA_FIELDS7);
  return {
    __foundationPricingContext: true,
    hasContextBlock: block !== null,
    field,
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct: num14(defaultMarkupPct),
    machine: firstField9(blk, MACHINE_FIELDS7) ?? firstField9(caller, MACHINE_FIELDS7) ?? null,
    taxable,
    taxPercent: num14(firstFinite10(caller, TAX_PCT_FIELDS3) ?? firstFinite10(blk, TAX_PCT_FIELDS3)),
    setupFee: num14(firstFinite10(caller, SETUP_FIELDS7) ?? firstFinite10(blk, SETUP_FIELDS7)),
    minimumCharge: num14(firstFinite10(caller, MIN_FIELDS7) ?? firstFinite10(blk, MIN_FIELDS7)),
    modifiers: callerModifiers ?? blockModifiers ?? void 0,
    lineMap: firstRecord7(blk, ENGINE_LINE_MAP_FIELDS7),
    now: caller.now ?? blk.now,
    raw: block
  };
}
var componentNestedBlock2 = (record, spec) => {
  const rec = isRecord9(record) ? record : {};
  let merged = null;
  for (const carrier of carrierKeys(spec)) {
    for (const suffix of COMPONENT_BLOCK_SUFFIXES2) {
      const f = `${carrier}_${suffix}`;
      if (isRecord9(rec[f])) merged = { ...merged ?? {}, ...rec[f] };
    }
  }
  return merged;
};
var engineFieldsFrom2 = (src, prefix = "") => {
  const out = {};
  if (!isRecord9(src)) return out;
  for (const f of FOUNDATION_ENGINE_LINE_FIELDS) {
    const k = prefix ? `${prefix}_${f}` : f;
    if (src[k] !== void 0 && src[k] !== null && src[k] !== "") out[f] = src[k];
  }
  return out;
};
function foundationLineDescriptor(line, record = null) {
  const spec = componentOf2(line?.key);
  if (!spec) return null;
  const rec = isRecord9(record) ? record : {};
  const carriers = carrierKeys(spec);
  const flat = carriers.reduce(
    (acc, carrier) => ({ ...acc, ...engineFieldsFrom2(rec, carrier) }),
    {}
  );
  const rawLine = isRecord9(line) ? line : {};
  const ownInline = engineFieldsFrom2(rawLine);
  const ownNested = firstRecord7(rawLine, ["descriptor", "pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"]);
  const { block } = contextBlockOf2(rec);
  const lineMap = block ? firstRecord7(block, ENGINE_LINE_MAP_FIELDS7) : null;
  const mapEntry = lineMap ? carriers.reduce((acc, carrier) => {
    const v = lineMap[carrier];
    return isRecord9(v) ? { ...acc ?? {}, ...v } : acc;
  }, null) ?? (isRecord9(lineMap[asString8(line?.index)]) ? lineMap[asString8(line?.index)] : null) : null;
  const nested = componentNestedBlock2(rec, spec);
  const merged = {
    ...flat,
    ...ownInline,
    ...ownNested ?? {},
    ...mapEntry ?? {},
    ...nested ?? {}
  };
  if (!Object.keys(merged).length && !nested && !mapEntry && !ownNested) return null;
  return merged;
}
function foundationConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : foundationCostLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = foundationLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent7(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult7 = (reason, baselineSell, internalCost, markupPct, contextEngaged, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  context_engaged: contextEngaged,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveFoundationSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord9(input.record) ? input.record : null;
  const baselineSell = num14(input.baselineSell ?? input.baseline_sell);
  const internalCost = num14(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const markupPct = firstFinite10(input, ["markupPercent", "markup_percent"]) ?? firstFinite10(rec, ["customer_markup_percent"]) ?? 0;
  const context = foundationPricingContextOf(rec, input.context);
  const contextUsed = {
    context_block: context.field || "",
    customer_tier: asString8(
      isRecord9(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num14(context.defaultMarkupPct)
  };
  const engine = isRecord9(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines.map((l, position) => {
    const spec = componentOf2(l?.key);
    return {
      key: asString8(l?.key) || `line-${position}`,
      index: position,
      label: asString8(l?.label) || spec?.label || `Component ${position + 1}`,
      qty: l?.qty !== void 0 ? num14(l.qty, 1) : spec ? firstFinite10(rec, spec.qtyFields ?? []) ?? spec.qtyFrom?.(rec) ?? 1 : 1,
      cost: l?.cost !== void 0 ? toFiniteNumber8(l.cost) : spec && spec.costFields.length ? firstFinite10(rec, spec.costFields) : toFiniteNumber8(l?.item_total_cost ?? l?.line_total_cost ?? l?.total_cost ?? l?.cost),
      category_key: asString8(l?.category_key) || spec?.category_key || "",
      item: isRecord9(l?.item) ? l.item : rec,
      descriptor: isRecord9(l) ? l : null,
      origin: "caller"
    };
  }) : foundationCostLines(rec);
  const scan = foundationConfigScan(rec, wireLines);
  const engaged = context.hasContextBlock || scan.configured;
  chain.push({
    layer: "config_scan",
    hit: engaged,
    won: false,
    detail: context.hasContextBlock ? `context block via ${context.field}${scan.configured ? ` + ${scan.configuredCount} configured component(s)` : ""}` : scan.configured ? `${scan.configuredCount} of ${scan.lineCount} components carry pricing config` : `no pricing config on ${scan.lineCount} components`
  });
  if (!record) return passthroughResult7("no_record", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult7("no_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  if (!engaged) return passthroughResult7("no_config", baselineSell, internalCost, markupPct, false, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult7("no_engine", baselineSell, internalCost, markupPct, context.hasContextBlock, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const descriptor = foundationLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent7(descriptor);
    const enginePrices = configured || context.hasContextBlock;
    const cost = line.cost !== void 0 ? line.cost : null;
    const qty = num14(line.qty, 1);
    const base = {
      key: line.key || `line-${position}`,
      label: line.label || `Component ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      priced_via: null,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!enginePrices) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`component '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor ?? {} };
    const lineModifiers = firstField9(partDescriptor, FORMULA_FIELDS7);
    for (const f of FORMULA_FIELDS7) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS7.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField9(partDescriptor, TIER_CONTEXT_FIELDS7) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord9(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString8(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `component '${base.label}': ${asString8(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`component '${base.label}': template resolution failed (${asString8(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField9(partDescriptor, TIER_CONTEXT_FIELDS7) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField7(partDescriptor, EMBEDDED_RULE_FIELDS7) ? EMBEDDED_RULE_FIELDS7.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField9(partDescriptor, MACHINE_FIELDS7) ?? context.machine;
    const setupFee = firstFinite10(partDescriptor, SETUP_FIELDS7) ?? (context.setupFee || void 0);
    const minimumCharge = firstFinite10(partDescriptor, MIN_FIELDS7) ?? (context.minimumCharge || void 0);
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : context.modifiers;
    const taxable = typeof partDescriptor.taxable === "boolean" ? partDescriptor.taxable : context.taxable;
    const taxPercent = firstFinite10(partDescriptor, TAX_PCT_FIELDS3) ?? (context.taxPercent || void 0);
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString8(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString8(firstField9(partDescriptor, UNIT_FIELDS2)) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        taxable,
        taxPercent,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`component '${base.label}': engine pricing failed (${asString8(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord9(priced) ? priced : {};
    const lineSubtotal = firstFinite10(pricedRecord, ["subtotal"]) ?? num14(pricedRecord.extended);
    base.priced = true;
    base.priced_via = configured ? "descriptor" : "context";
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num14(pricedRecord.unitPrice),
      extended: num14(pricedRecord.extended),
      setup_fee: num14(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num14(pricedRecord.total),
      price_source: asString8(pricedRecord.priceSource),
      tier_source: asString8(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString8(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`component '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult7("no_priced_lines", baselineSell, internalCost, markupPct, context.hasContextBlock, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round210(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`priced components' baseline (${round210(configuredBaseline)}) exceeds project sell \u2014 remainder ${round210(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round210(baselineSell)} - priced baseline ${round210(configuredBaseline)} = remainder ${round210(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round210(remainder)} + engine ${round210(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    context_engaged: context.hasContextBlock,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/foundation/foundationSellPricing.js
var ENGINE8 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = foundationPricingContextOf(record, caller);
    return resolveFoundationSellPricing({ record, baselineSell, internalCost, markupPercent, context, engine: ENGINE8, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function foundationEngineEconomics(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  const res = resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/customItemsPricingWire.ts
var isRecord10 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString9 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc9 = (v) => asString9(v).toLowerCase();
var toFiniteNumber9 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num15 = (v, fallback = 0) => toFiniteNumber9(v) ?? fallback;
var firstField10 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite11 = (rec, fields) => {
  const v = firstField10(rec, fields);
  const n = toFiniteNumber9(v);
  return n === null ? null : n;
};
var firstArray8 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord8 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord10(rec[f])) return rec[f];
  }
  return null;
};
var round211 = (n) => Math.round((num15(n) + Number.EPSILON) * 100) / 100;
var LINE_COST_FIELDS6 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_QTY_FIELDS6 = ["quantity", "qty", "count"];
var LINE_LABEL_FIELDS6 = ["description", "label", "name", "item_name", "part_name"];
var LINE_KEY_FIELDS6 = ["builder_item_id", "id", "item_id", "part_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS6 = ["category_key", "category", "part_category", "pricing_category", "item_type"];
var ENGINE_BLOCK_FIELDS6 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS6 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS8 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS9 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS8 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS9 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS9 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS8 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS8 = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS8 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS8 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS10 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS8 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS8 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS8 = ["formula_modifiers"];
var MODE_FIELDS9 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS8 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS8 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS8 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS8 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS8 = ["tiers", "tier_catalog"];
var CUSTOM_ITEMS_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS8,
  ...TIER_REF_FIELDS9,
  ...BREAK_FIELDS9,
  ...TEMPLATE_REF_FIELDS8,
  ...TIER_SET_FIELDS8,
  ...MARKET_FIELDS8,
  ...MARKET_DISCOUNT_FIELDS8,
  ...MARKUP_FIELDS10,
  ...MIN_FIELDS8,
  ...SETUP_FIELDS8,
  ...FORMULA_FIELDS8,
  ...MODE_FIELDS9,
  ...MACHINE_FIELDS8,
  ...TIER_CONTEXT_FIELDS8,
  ...EMBEDDED_RULE_FIELDS8,
  ...EMBEDDED_TEMPLATE_FIELDS8,
  ...EMBEDDED_TIER_CATALOG_FIELDS8,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);
var isEngineModeToken8 = (v) => ENGINE_MODE_TOKENS9.has(lc9(v));
var nonEmptyArrayField8 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField6 = (rec, fields) => fields.some((f) => firstFinite11(rec, [f]) !== null);
var anyPositiveField6 = (rec, fields) => fields.some((f) => {
  const v = firstFinite11(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig8 = (v) => {
  if (!isRecord10(v)) return false;
  return anyPositiveField6(v, [...FIXED_FIELDS8, ...MARKET_FIELDS8, ...MIN_FIELDS8]) || anyFiniteField6(v, MARKUP_FIELDS10) || nonEmptyArrayField8(v, [...BREAK_FIELDS9, ...FORMULA_FIELDS8]) || MODE_FIELDS9.some((f) => isEngineModeToken8(v[f])) || TIER_REF_FIELDS9.some((f) => asString9(v[f]) !== "");
};
function descriptorHasPricingContent8(d) {
  if (!isRecord10(d)) return false;
  if (anyPositiveField6(d, [...FIXED_FIELDS8, ...MARKET_FIELDS8, ...MARKET_DISCOUNT_FIELDS8, ...MIN_FIELDS8, ...SETUP_FIELDS8]) || anyFiniteField6(d, MARKUP_FIELDS10)) return true;
  if (nonEmptyArrayField8(d, [...BREAK_FIELDS9, ...FORMULA_FIELDS8, ...EMBEDDED_RULE_FIELDS8, ...EMBEDDED_TEMPLATE_FIELDS8, ...EMBEDDED_TIER_CATALOG_FIELDS8])) return true;
  if (MODE_FIELDS9.some((f) => isEngineModeToken8(d[f]))) return true;
  if (TIER_REF_FIELDS9.some((f) => asString9(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS8.some((f) => {
    const v = d[f];
    return isRecord10(v) ? true : asString9(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS8.some((f) => asString9(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS8.some((f) => firstField10(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS8.some((f) => machineHasConfig8(d[f]))) return true;
  return false;
}
var lineKey6 = (item, index) => {
  const explicit = firstField10(item, LINE_KEY_FIELDS6);
  if (explicit !== void 0 && asString9(explicit) !== "") return asString9(explicit);
  return `idx-${index}`;
};
var lineCostOf5 = (item) => {
  const direct = firstFinite11(item, LINE_COST_FIELDS6);
  if (direct !== null) return direct;
  const machine = toFiniteNumber9(item.machine_cost);
  const labor = toFiniteNumber9(item.labor_cost);
  if (machine === null && labor === null) return null;
  return num15(machine) + num15(labor);
};
function customItemsRecordLines(record) {
  if (!isRecord10(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord10) : [];
  return flat.map((item, index) => ({
    key: lineKey6(item, index),
    index,
    label: asString9(firstField10(item, LINE_LABEL_FIELDS6)) || `Item ${index + 1}`,
    qty: num15(firstField10(item, LINE_QTY_FIELDS6), 1),
    cost: lineCostOf5(item),
    category_key: asString9(firstField10(item, LINE_CATEGORY_FIELDS6)),
    item,
    origin: "items"
  }));
}
var engineBlockOf6 = (record) => firstRecord8(record, ENGINE_BLOCK_FIELDS6) ?? {};
function customItemsPricingContextOf(record, callerContext = null) {
  const rec = isRecord10(record) ? record : {};
  const block = engineBlockOf6(rec);
  const caller = isRecord10(callerContext) ? callerContext : {};
  const cp = isRecord10(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField10(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField10(block, TIER_CONTEXT_FIELDS8.concat("tier")) ?? firstField10(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray8(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray8(block, EMBEDDED_RULE_FIELDS8) ?? [];
  const templates = firstArray8(caller, ["templates", "pricing_templates"]) ?? firstArray8(block, EMBEDDED_TEMPLATE_FIELDS8) ?? [];
  const tiers = firstArray8(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray8(block, EMBEDDED_TIER_CATALOG_FIELDS8.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite11(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite11(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite11(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function customItemsLineDescriptor(line, record = null) {
  const item = isRecord10(line?.item) ? line.item : isRecord10(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of CUSTOM_ITEMS_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf6(record);
  const lineMap = firstRecord8(block, ENGINE_LINE_MAP_FIELDS8);
  const mapEntry = lineMap ? isRecord10(lineMap[line?.key]) ? lineMap[line.key] : isRecord10(lineMap[asString9(line?.index)]) ? lineMap[asString9(line?.index)] : null : null;
  const nested = firstRecord8(item, NESTED_CONFIG_FIELDS6);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function customItemsConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : customItemsRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = customItemsLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent8(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult8 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveCustomItemsSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord10(input.record) ? input.record : null;
  const baselineSell = num15(input.baselineSell ?? input.baseline_sell);
  const internalCost = num15(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite11(rec, ["subtotal"]);
  const markupPct = firstFinite11(input, ["markupPercent", "markup_percent"]) ?? firstFinite11(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num15(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = customItemsPricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString9(
      isRecord10(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num15(context.defaultMarkupPct)
  };
  const engine = isRecord10(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : customItemsRecordLines(rec);
  const scan = customItemsConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult8("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult8("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult8("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult8("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord10(line?.item) ? line.item : isRecord10(line) ? line : {};
    const descriptor = customItemsLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent8(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf5(rawItem);
    const qty = num15(line.qty ?? firstField10(rawItem, LINE_QTY_FIELDS6), 1) || 0;
    const base = {
      key: line.key || lineKey6(rawItem, position),
      label: line.label || asString9(firstField10(rawItem, LINE_LABEL_FIELDS6)) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField10(partDescriptor, FORMULA_FIELDS8);
    for (const f of FORMULA_FIELDS8) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS8.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField10(partDescriptor, TIER_CONTEXT_FIELDS8) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord10(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString9(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString9(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString9(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField10(partDescriptor, TIER_CONTEXT_FIELDS8) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField8(partDescriptor, EMBEDDED_RULE_FIELDS8) ? EMBEDDED_RULE_FIELDS8.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField10(partDescriptor, MACHINE_FIELDS8) ?? null;
    const setupFee = firstFinite11(partDescriptor, SETUP_FIELDS8) ?? void 0;
    const minimumCharge = firstFinite11(partDescriptor, MIN_FIELDS8) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString9(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString9(firstField10(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString9(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord10(priced) ? priced : {};
    const lineSubtotal = firstFinite11(pricedRecord, ["subtotal"]) ?? num15(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num15(pricedRecord.unitPrice),
      extended: num15(pricedRecord.extended),
      setup_fee: num15(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num15(pricedRecord.total),
      price_source: asString9(pricedRecord.priceSource),
      tier_source: asString9(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString9(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult8("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round211(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round211(configuredBaseline)}) exceeds project sell \u2014 remainder ${round211(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round211(baselineSell)} - configured baseline ${round211(configuredBaseline)} = remainder ${round211(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round211(remainder)} + engine ${round211(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/customItems/customItemsSellPricing.js
var ENGINE9 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveCustomItemsEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = customItemsPricingContextOf(record, caller);
    return resolveCustomItemsSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE9, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function customItemsEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveCustomItemsEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// base44/shared/maintenancePricingWire.ts
var isRecord11 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var asString10 = (v) => (v === null || v === void 0 ? "" : String(v)).trim();
var lc10 = (v) => asString10(v).toLowerCase();
var toFiniteNumber10 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var num16 = (v, fallback = 0) => toFiniteNumber10(v) ?? fallback;
var firstField11 = (rec, fields) => {
  if (!rec) return void 0;
  for (const f of fields) {
    const v = rec[f];
    if (v !== void 0 && v !== null && v !== "") return v;
  }
  return void 0;
};
var firstFinite12 = (rec, fields) => {
  const v = firstField11(rec, fields);
  const n = toFiniteNumber10(v);
  return n === null ? null : n;
};
var firstArray9 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (Array.isArray(rec[f])) return rec[f];
  }
  return null;
};
var firstRecord9 = (rec, fields) => {
  if (!rec) return null;
  for (const f of fields) {
    if (isRecord11(rec[f])) return rec[f];
  }
  return null;
};
var round212 = (n) => Math.round((num16(n) + Number.EPSILON) * 100) / 100;
var MAINTENANCE_MODULE_KEYS = Object.freeze([
  "maintenance",
  "sign_maintenance",
  "maintenance_project",
  "sign_maintenance_project",
  "service",
  "maintenance_service"
]);
var LINE_COST_FIELDS7 = [
  "item_total_cost",
  "line_total_cost",
  "total_cost",
  "extended_cost",
  "line_cost",
  "item_cost",
  "cost",
  "computed_cost"
];
var LINE_COMPONENT_FIELDS3 = ["labor_cost", "materials_cost"];
var LINE_QTY_FIELDS7 = ["qty", "quantity", "count"];
var LINE_LABEL_FIELDS7 = ["description", "label", "name", "item_name", "part_name", "service_name"];
var LINE_KEY_FIELDS7 = ["builder_item_id", "id", "item_id", "service_item_id", "key", "line_id"];
var LINE_CATEGORY_FIELDS7 = ["category_key", "category", "part_category", "pricing_category", "service_category", "sign_type"];
var ENGINE_BLOCK_FIELDS7 = ["engine_pricing", "pricing_context", "engine_context", "pricing_engine"];
var NESTED_CONFIG_FIELDS7 = ["pricing", "price_config", "engine_pricing", "pricing_config", "engine_price"];
var ENGINE_LINE_MAP_FIELDS9 = ["items", "lines", "line_config", "item_config"];
var ENGINE_MODE_TOKENS10 = /* @__PURE__ */ new Set([
  "market",
  "market_based",
  "market-based",
  "retail",
  "retail_minus_discount",
  "fixed",
  "fixed_price",
  "flat"
]);
var FIXED_FIELDS9 = ["fixed_price", "price_override", "override_price", "flat_price"];
var TIER_REF_FIELDS10 = ["tier_ref", "tier_ref_id", "pricing_tier_ref", "bound_tier", "tier", "tier_name"];
var BREAK_FIELDS10 = ["per_unit_breaks", "unit_breaks", "qty_breaks"];
var TEMPLATE_REF_FIELDS9 = [
  "pricing_template_id",
  "template_id",
  "margin_template_id",
  "pricing_template_name",
  "template_name",
  "pricing_template",
  "template"
];
var TIER_SET_FIELDS9 = [
  "global_pricing_tier_id",
  "pricing_tier_id",
  "tier_set_id",
  "pricing_tier_set_id",
  "pricing_rule_set_id",
  "global_tier_id",
  "global_pricing_tier_name",
  "pricing_tier_name",
  "tier_set_name"
];
var MARKET_FIELDS9 = ["market_retail", "retail", "retail_price", "list_price"];
var MARKET_DISCOUNT_FIELDS9 = ["market_discount_pct", "retail_discount_pct"];
var MARKUP_FIELDS11 = ["markup_pct", "markup", "markup_percent"];
var MIN_FIELDS9 = ["minimum_charge", "min_charge", "minimum", "setup_fee_floor"];
var SETUP_FIELDS9 = ["setup_fee", "setupFee", "setup_fee_flat"];
var FORMULA_FIELDS9 = ["formula_modifiers"];
var MODE_FIELDS10 = ["pricing_mode", "price_mode", "mode"];
var MACHINE_FIELDS9 = ["machine", "machine_override"];
var TIER_CONTEXT_FIELDS9 = ["customer_tier", "customerTier"];
var EMBEDDED_RULE_FIELDS9 = ["tier_rules", "tierRules", "tier_matrix"];
var EMBEDDED_TEMPLATE_FIELDS9 = ["templates", "pricing_templates"];
var EMBEDDED_TIER_CATALOG_FIELDS9 = ["tiers", "tier_catalog"];
var MAINTENANCE_ENGINE_LINE_FIELDS = Object.freeze([
  ...FIXED_FIELDS9,
  ...TIER_REF_FIELDS10,
  ...BREAK_FIELDS10,
  ...TEMPLATE_REF_FIELDS9,
  ...TIER_SET_FIELDS9,
  ...MARKET_FIELDS9,
  ...MARKET_DISCOUNT_FIELDS9,
  ...MARKUP_FIELDS11,
  ...MIN_FIELDS9,
  ...SETUP_FIELDS9,
  ...FORMULA_FIELDS9,
  ...MODE_FIELDS10,
  ...MACHINE_FIELDS9,
  ...TIER_CONTEXT_FIELDS9,
  ...EMBEDDED_RULE_FIELDS9,
  ...EMBEDDED_TEMPLATE_FIELDS9,
  ...EMBEDDED_TIER_CATALOG_FIELDS9,
  "unit",
  "pricing_unit",
  "pricingUnit",
  "uom",
  "unit_of_measure",
  "unit_category"
]);
var isEngineModeToken9 = (v) => ENGINE_MODE_TOKENS10.has(lc10(v));
var nonEmptyArrayField9 = (rec, fields) => fields.some((f) => Array.isArray(rec[f]) && rec[f].length > 0);
var anyFiniteField7 = (rec, fields) => fields.some((f) => firstFinite12(rec, [f]) !== null);
var anyPositiveField7 = (rec, fields) => fields.some((f) => {
  const v = firstFinite12(rec, [f]);
  return v !== null && v > 0;
});
var machineHasConfig9 = (v) => {
  if (!isRecord11(v)) return false;
  return anyPositiveField7(v, [...FIXED_FIELDS9, ...MARKET_FIELDS9, ...MIN_FIELDS9]) || anyFiniteField7(v, MARKUP_FIELDS11) || nonEmptyArrayField9(v, [...BREAK_FIELDS10, ...FORMULA_FIELDS9]) || MODE_FIELDS10.some((f) => isEngineModeToken9(v[f])) || TIER_REF_FIELDS10.some((f) => asString10(v[f]) !== "");
};
function descriptorHasPricingContent9(d) {
  if (!isRecord11(d)) return false;
  if (anyPositiveField7(d, [...FIXED_FIELDS9, ...MARKET_FIELDS9, ...MARKET_DISCOUNT_FIELDS9, ...MIN_FIELDS9, ...SETUP_FIELDS9]) || anyFiniteField7(d, MARKUP_FIELDS11)) return true;
  if (nonEmptyArrayField9(d, [...BREAK_FIELDS10, ...FORMULA_FIELDS9, ...EMBEDDED_RULE_FIELDS9, ...EMBEDDED_TEMPLATE_FIELDS9, ...EMBEDDED_TIER_CATALOG_FIELDS9])) return true;
  if (MODE_FIELDS10.some((f) => isEngineModeToken9(d[f]))) return true;
  if (TIER_REF_FIELDS10.some((f) => asString10(d[f]) !== "")) return true;
  if (TEMPLATE_REF_FIELDS9.some((f) => {
    const v = d[f];
    return isRecord11(v) ? true : asString10(v) !== "";
  })) return true;
  if (TIER_SET_FIELDS9.some((f) => asString10(d[f]) !== "")) return true;
  if (TIER_CONTEXT_FIELDS9.some((f) => firstField11(d, [f]) !== void 0)) return true;
  if (MACHINE_FIELDS9.some((f) => machineHasConfig9(d[f]))) return true;
  return false;
}
var lineKey7 = (item, index) => {
  const explicit = firstField11(item, LINE_KEY_FIELDS7);
  if (explicit !== void 0 && asString10(explicit) !== "") return asString10(explicit);
  return `idx-${index}`;
};
var lineCostOf6 = (item) => {
  const direct = firstFinite12(item, LINE_COST_FIELDS7);
  if (direct !== null) return direct;
  const hasComponent = LINE_COMPONENT_FIELDS3.some((f) => toFiniteNumber10(item[f]) !== null);
  if (!hasComponent) return null;
  return LINE_COMPONENT_FIELDS3.reduce((s, f) => s + num16(item[f]), 0);
};
function maintenanceRecordLines(record) {
  if (!isRecord11(record)) return [];
  const flat = Array.isArray(record.items) ? record.items.filter(isRecord11) : [];
  return flat.map((item, index) => ({
    key: lineKey7(item, index),
    index,
    label: asString10(firstField11(item, LINE_LABEL_FIELDS7)) || asString10(item.sign_type) || `Item ${index + 1}`,
    qty: num16(firstField11(item, LINE_QTY_FIELDS7), 1),
    cost: lineCostOf6(item),
    category_key: asString10(firstField11(item, LINE_CATEGORY_FIELDS7)),
    item,
    origin: "items"
  }));
}
var engineBlockOf7 = (record) => firstRecord9(record, ENGINE_BLOCK_FIELDS7) ?? {};
function maintenancePricingContextOf(record, callerContext = null) {
  const rec = isRecord11(record) ? record : {};
  const block = engineBlockOf7(rec);
  const caller = isRecord11(callerContext) ? callerContext : {};
  const cp = isRecord11(rec.customer_pricing) ? rec.customer_pricing : {};
  const customerTier = firstField11(caller, ["customerTier", "customer_tier", "tier"]) ?? firstField11(block, TIER_CONTEXT_FIELDS9.concat("tier")) ?? firstField11(cp, ["tier_number", "tier", "tier_name"]) ?? null;
  const tierRules = firstArray9(caller, ["tierRules", "tier_rules", "tier_matrix"]) ?? firstArray9(block, EMBEDDED_RULE_FIELDS9) ?? [];
  const templates = firstArray9(caller, ["templates", "pricing_templates"]) ?? firstArray9(block, EMBEDDED_TEMPLATE_FIELDS9) ?? [];
  const tiers = firstArray9(caller, ["tiers", "tier_catalog", "markup_tiers"]) ?? firstArray9(block, EMBEDDED_TIER_CATALOG_FIELDS9.concat("markup_tiers")) ?? [];
  const defaultMarkupPct = firstFinite12(caller, ["defaultMarkupPct", "default_markup_pct"]) ?? firstFinite12(block, ["default_markup_pct", "defaultMarkupPct"]) ?? firstFinite12(rec, ["markup_percent"]) ?? 0;
  return {
    customerTier,
    tierRules,
    templates,
    tiers,
    defaultMarkupPct,
    now: caller.now ?? block.now
  };
}
function maintenanceLineDescriptor(line, record = null) {
  const item = isRecord11(line?.item) ? line.item : isRecord11(line) ? line : null;
  if (!item) return null;
  const flat = {};
  for (const f of MAINTENANCE_ENGINE_LINE_FIELDS) {
    if (item[f] !== void 0) flat[f] = item[f];
  }
  const block = engineBlockOf7(record);
  const lineMap = firstRecord9(block, ENGINE_LINE_MAP_FIELDS9);
  const mapEntry = lineMap ? isRecord11(lineMap[line?.key]) ? lineMap[line.key] : isRecord11(lineMap[asString10(line?.index)]) ? lineMap[asString10(line?.index)] : null : null;
  const nested = firstRecord9(item, NESTED_CONFIG_FIELDS7);
  const merged = { ...flat, ...mapEntry ?? {}, ...nested ?? {} };
  if (!Object.keys(merged).length && !nested && !mapEntry) return null;
  return merged;
}
function maintenanceConfigScan(record, lines) {
  const wireLines = Array.isArray(lines) ? lines : maintenanceRecordLines(record);
  const detail = wireLines.map((line) => {
    const descriptor = maintenanceLineDescriptor(line, record);
    return {
      key: line.key,
      label: line.label,
      configured: descriptorHasPricingContent9(descriptor),
      hasCost: line.cost !== null && Number.isFinite(line.cost)
    };
  });
  const configuredCount = detail.filter((d) => d.configured).length;
  return {
    configured: configuredCount > 0,
    configuredCount,
    lineCount: wireLines.length,
    lines: detail
  };
}
var passthroughResult9 = (reason, baselineSell, internalCost, markupPct, lines, chain, warnings, contextUsed) => ({
  applied: false,
  passthrough: true,
  reason,
  customer_price: baselineSell,
  baseline_sell: baselineSell,
  internal_cost: internalCost,
  markup_pct: markupPct,
  configured_baseline: 0,
  remainder_sell: baselineSell,
  engine_priced_total: 0,
  lines,
  chain,
  warnings,
  context_used: contextUsed
});
function resolveMaintenanceSellPricing(input = {}) {
  const warnings = [];
  const chain = [];
  const record = isRecord11(input.record) ? input.record : null;
  const baselineSell = num16(input.baselineSell ?? input.baseline_sell);
  const internalCost = num16(input.internalCost ?? input.internal_cost);
  const rec = record ?? {};
  const subtotalBase = firstFinite12(rec, ["subtotal"]);
  const markupPct = firstFinite12(input, ["markupPercent", "markup_percent"]) ?? firstFinite12(rec, ["markup_percent"]) ?? (subtotalBase && subtotalBase > 0 ? num16(rec.markup_amount) / subtotalBase * 100 : 0);
  const context = maintenancePricingContextOf(rec, input.context);
  const contextUsed = {
    customer_tier: asString10(
      isRecord11(context.customerTier) ? context.customerTier.tier_name ?? context.customerTier.tier_number ?? context.customerTier.id : context.customerTier
    ),
    tier_rule_count: context.tierRules.length,
    template_count: context.templates.length,
    tier_count: context.tiers.length,
    default_markup_pct: num16(context.defaultMarkupPct)
  };
  const engine = isRecord11(input.engine) ? input.engine : {};
  const pricePart2 = typeof engine.pricePart === "function" ? engine.pricePart : null;
  const wireLines = Array.isArray(input.lines) && input.lines.length ? input.lines : maintenanceRecordLines(rec);
  const scan = maintenanceConfigScan(rec, wireLines);
  chain.push({
    layer: "config_scan",
    hit: scan.configured,
    won: false,
    detail: scan.configured ? `${scan.configuredCount} of ${scan.lineCount} lines carry pricing config` : `no pricing config on ${scan.lineCount} lines`
  });
  if (!record) return passthroughResult9("no_record", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!wireLines.length) return passthroughResult9("no_lines", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!scan.configured) return passthroughResult9("no_config", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  if (!pricePart2) {
    warnings.push("pricing engine not injected \u2014 lines left at baseline sell");
    return passthroughResult9("no_engine", baselineSell, internalCost, markupPct, [], chain, warnings, contextUsed);
  }
  const markupFactor = 1 + markupPct / 100;
  const results = [];
  let configuredCostSum = 0;
  let engineSubtotalSum = 0;
  let pricedCount = 0;
  let skippedCount = 0;
  wireLines.forEach((line, position) => {
    const rawItem = isRecord11(line?.item) ? line.item : isRecord11(line) ? line : {};
    const descriptor = maintenanceLineDescriptor(line, rec);
    const configured = descriptorHasPricingContent9(descriptor);
    const cost = line.cost !== void 0 ? line.cost : lineCostOf6(rawItem);
    const qty = num16(line.qty ?? firstField11(rawItem, LINE_QTY_FIELDS7), 1) || 0;
    const base = {
      key: line.key || lineKey7(rawItem, position),
      label: line.label || asString10(firstField11(rawItem, LINE_LABEL_FIELDS7)) || asString10(rawItem.sign_type) || `Item ${position + 1}`,
      index: position,
      qty,
      cost: cost ?? 0,
      unit_cost: cost !== null ? qty > 0 ? cost / qty : cost : 0,
      baseline_sell: cost !== null ? cost * markupFactor : 0,
      configured,
      priced: false,
      skipped: null,
      engine: null
    };
    results.push(base);
    if (!configured) return;
    if (cost === null || !Number.isFinite(cost)) {
      base.skipped = "skipped_no_cost";
      skippedCount += 1;
      warnings.push(`line '${base.label}' carries pricing config but has no cost base \u2014 left at baseline sell`);
      return;
    }
    let partDescriptor = { ...descriptor };
    const lineModifiers = firstField11(partDescriptor, FORMULA_FIELDS9);
    for (const f of FORMULA_FIELDS9) delete partDescriptor[f];
    const embeddedTemplates = EMBEDDED_TEMPLATE_FIELDS9.reduce(
      (acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []),
      []
    );
    let templateApplied = false;
    let templateReason = null;
    if (typeof engine.resolveTemplatePrice === "function") {
      try {
        const resolution = engine.resolveTemplatePrice({
          part: partDescriptor,
          qty,
          base_price: base.unit_cost,
          templates: [...embeddedTemplates, ...context.templates],
          tiers: context.tiers,
          tier: firstField11(partDescriptor, TIER_CONTEXT_FIELDS9) ?? context.customerTier,
          default_markup_pct: contextUsed.default_markup_pct
        });
        if (resolution && isRecord11(resolution)) {
          templateApplied = resolution.applied === true;
          templateReason = asString10(resolution.reason) || null;
          if (Array.isArray(resolution.warnings)) warnings.push(...resolution.warnings.map((w) => `line '${base.label}': ${asString10(w)}`));
          if (typeof engine.templatePartDescriptor === "function") {
            partDescriptor = engine.templatePartDescriptor(partDescriptor, resolution);
          }
        }
      } catch (e) {
        warnings.push(`line '${base.label}': template resolution failed (${asString10(e?.message)}) \u2014 part fields priced directly`);
      }
    }
    const customerTier = firstField11(partDescriptor, TIER_CONTEXT_FIELDS9) ?? context.customerTier;
    const tierRules = [
      ...nonEmptyArrayField9(partDescriptor, EMBEDDED_RULE_FIELDS9) ? EMBEDDED_RULE_FIELDS9.reduce((acc, f) => acc.concat(Array.isArray(partDescriptor[f]) ? partDescriptor[f] : []), []) : [],
      ...context.tierRules
    ];
    const machine = firstField11(partDescriptor, MACHINE_FIELDS9) ?? null;
    const setupFee = firstFinite12(partDescriptor, SETUP_FIELDS9) ?? void 0;
    const minimumCharge = firstFinite12(partDescriptor, MIN_FIELDS9) ?? void 0;
    const modifiers = Array.isArray(lineModifiers) ? lineModifiers : void 0;
    let priced = null;
    try {
      priced = pricePart2({
        label: base.label,
        category: line.category_key || asString10(partDescriptor.category_key ?? partDescriptor.category),
        qty,
        unitCost: base.unit_cost,
        pricingUnit: asString10(firstField11(partDescriptor, ["unit", "pricing_unit", "pricingUnit", "uom", "unit_of_measure", "unit_category"])) || "each",
        customerTier,
        tierRules,
        part: partDescriptor,
        machine,
        defaultMarkupPct: contextUsed.default_markup_pct,
        setupFee,
        minimumCharge,
        modifiers,
        now: input.now ?? context.now
      });
    } catch (e) {
      base.skipped = "engine_error";
      skippedCount += 1;
      warnings.push(`line '${base.label}': engine pricing failed (${asString10(e?.message)}) \u2014 left at baseline sell`);
      return;
    }
    const pricedRecord = isRecord11(priced) ? priced : {};
    const lineSubtotal = firstFinite12(pricedRecord, ["subtotal"]) ?? num16(pricedRecord.extended);
    base.priced = true;
    pricedCount += 1;
    configuredCostSum += cost;
    engineSubtotalSum += lineSubtotal;
    base.engine = {
      unit_price: num16(pricedRecord.unitPrice),
      extended: num16(pricedRecord.extended),
      setup_fee: num16(pricedRecord.setupFee),
      subtotal: lineSubtotal,
      total: num16(pricedRecord.total),
      price_source: asString10(pricedRecord.priceSource),
      tier_source: asString10(pricedRecord?.tier?.source),
      minimum_applied: pricedRecord.minimumApplied === true,
      dangling_tier_ref: asString10(pricedRecord.danglingTierRef) || null,
      template_applied: templateApplied,
      template_reason: templateReason,
      trace: Array.isArray(pricedRecord?.tier?.trace) ? pricedRecord.tier.trace : []
    };
    if (base.engine?.dangling_tier_ref) {
      warnings.push(`line '${base.label}': tier ref '${base.engine.dangling_tier_ref}' did not resolve \u2014 priced via remaining layers`);
    }
  });
  chain.push({
    layer: "engine_pricing",
    hit: pricedCount > 0,
    won: false,
    detail: skippedCount ? `${pricedCount} engine-priced, ${skippedCount} skipped (kept at baseline)` : `${pricedCount} engine-priced`
  });
  if (!pricedCount) {
    return passthroughResult9("no_priced_lines", baselineSell, internalCost, markupPct, results, chain, warnings, contextUsed);
  }
  const configuredBaseline = configuredCostSum * markupFactor;
  const remainder = baselineSell - configuredBaseline;
  const engineTotal = engineSubtotalSum;
  const customerPrice = round212(remainder + engineTotal);
  if (remainder < 0) {
    warnings.push(`configured lines' baseline (${round212(configuredBaseline)}) exceeds project sell \u2014 remainder ${round212(remainder)}`);
  }
  chain.push({
    layer: "remainder",
    hit: true,
    won: false,
    detail: `baseline ${round212(baselineSell)} - configured baseline ${round212(configuredBaseline)} = remainder ${round212(remainder)}`
  });
  chain.push({
    layer: "customer_price",
    hit: true,
    won: true,
    detail: `remainder ${round212(remainder)} + engine ${round212(engineTotal)} = ${customerPrice}`
  });
  return {
    applied: true,
    passthrough: false,
    reason: "priced",
    customer_price: customerPrice,
    baseline_sell: baselineSell,
    internal_cost: internalCost,
    markup_pct: markupPct,
    configured_baseline: configuredBaseline,
    remainder_sell: remainder,
    engine_priced_total: engineTotal,
    lines: results,
    chain,
    warnings,
    context_used: contextUsed
  };
}

// src/components/estimator/maintenance/maintenanceSellPricing.js
var ENGINE10 = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });
function resolveMaintenanceEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = maintenancePricingContextOf(record, caller);
    return resolveMaintenanceSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE10, now });
  } catch {
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}
function maintenanceEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveMaintenanceEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? { internalCost, customerPrice: res.customer_price, resolution: res } : null;
}

// src/components/estimator/customerPricing.js
var num17 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hasNumericValue(value) {
  return value !== void 0 && value !== null && value !== "" && Number.isFinite(Number(value));
}
function acceptedCustomerUnitPrice(line) {
  return hasNumericValue(line?.customer_price_snapshot) ? Number(line.customer_price_snapshot) : num17(line?.total_snapshot);
}
function liveCustomerUnitPrice(line) {
  if (hasNumericValue(line?.live_customer_price_snapshot)) return Number(line.live_customer_price_snapshot);
  if (hasNumericValue(line?.customer_price_snapshot)) return Number(line.customer_price_snapshot);
  return num17(line?.live_total_snapshot, num17(line?.total_snapshot));
}
function manualCustomerPriceState({ detached = false, recalcRequired = false } = {}) {
  if (detached) return "detached_parts";
  if (recalcRequired) return "changed";
  return "manual";
}
function sourceProjectEconomics(moduleKey, record, fallbackTotal = 0, pricingContext = null) {
  const fallback = num17(fallbackTotal);
  if (!record) return { internalCost: fallback, customerPrice: fallback };
  const total = num17(record.total_cost, fallback);
  const savedTierCustomerPrice = record?.customer_pricing?.applied === true && hasNumericValue(record?.customer_pricing?.total) ? num17(record.customer_pricing.total) : null;
  const withSavedTier = (economics) => savedTierCustomerPrice === null ? economics : { ...economics, customerPrice: savedTierCustomerPrice };
  if (moduleKey === "foundation") {
    const cost = fallback;
    const markupPercent = num17(record.customer_markup_percent);
    const override = num17(record.customer_price_override);
    const baselineSell = override > 0 ? override : cost * (1 + markupPercent / 100);
    const wired = foundationEngineEconomics(record, { baselineSell, internalCost: cost, markupPercent, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: cost, customerPrice: baselineSell });
  }
  if (["vinyl", "brick_stone", "maintenance"].includes(moduleKey)) {
    const internalCost = hasNumericValue(record.subtotal) ? num17(record.subtotal) : total - num17(record.markup_amount);
    const wired = moduleKey === "vinyl" ? vinylEngineEconomics(record, { baselineSell: total, internalCost, pricingContext }) : moduleKey === "brick_stone" ? brickEngineEconomics(record, { baselineSell: total, internalCost, pricingContext }) : moduleKey === "maintenance" ? maintenanceEngineEconomics(record, { baselineSell: total, internalCost, pricingContext }) : null;
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }
  if (moduleKey === "channel_letters") {
    const letterMarkup = num17(record.total_letters_cost) - num17(record.letters_subtotal);
    const projectSubtotal = hasNumericValue(record.subtotal) ? num17(record.subtotal) : total - num17(record.markup_amount);
    const internalCost = projectSubtotal - letterMarkup;
    const wired = channelSellEconomics(record, { internalCost, customerPrice: total });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }
  if (moduleKey === "cnc") {
    const wired = cncEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }
  if (moduleKey === "laser") {
    const wired = laserEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }
  if (moduleKey === "metal") {
    const internalCost = hasNumericValue(record.subtotal) ? num17(record.subtotal) : total - num17(record.markup_amount);
    const wired = metalEngineEconomics(record, { baselineSell: total, internalCost, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }
  if (moduleKey === "painting") {
    const wired = paintEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }
  if (moduleKey === "custom_items") {
    const wired = customItemsEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution
      };
    }
    return withSavedTier({ internalCost: fallback, customerPrice: fallback });
  }
  return withSavedTier({ internalCost: fallback, customerPrice: fallback });
}

// src/components/estimator/estimateLifecycle.js
var PROTECTED_STATUSES = /* @__PURE__ */ new Set(["sent", "approved", "archived", "cancelled"]);
function isEstimateProtected(status) {
  return PROTECTED_STATUSES.has(String(status || ""));
}

// src/components/estimator/estimatePersistence.js
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function expectedEstimateFields(record = {}, nextFields = {}) {
  const expected = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  if (!Object.prototype.hasOwnProperty.call(expected, "deleted") && Object.prototype.hasOwnProperty.call(record || {}, "deleted")) {
    expected.deleted = record?.deleted;
  }
  return expected;
}
async function replaceEstimateFieldsIfUnchanged({
  entity,
  estimateId,
  expectedFields,
  guardFields = {},
  nextFields,
  label = "Estimate fields",
  maxAttempts = 3
} = {}) {
  const id = String(estimateId || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
  const guardNames = Object.keys(guards);
  if (!id || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not verify its Estimate before saving.`);
    if ((current.deleted === true || expected.deleted === true) && !Object.prototype.hasOwnProperty.call(desired, "deleted")) {
      throw new Error(`${label} was blocked because this Estimate is in Trash. Restore it before saving. No Estimate fields were overwritten.`);
    }
    for (const fieldName of guardNames) {
      if (!sameValue(current[fieldName], guards[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue(currentValue, expected[fieldName]) && !sameValue(currentValue, desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its current Estimate version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: expectedUpdatedAt },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) {
        return afterError;
      }
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      if (!saved) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }
  throw new Error(`${label} Estimate changed repeatedly while saving. Reload and try again.`);
}

// src/components/estimator/estimateRevisionService.js
async function getOpenEstimateRevision(estimateId) {
  if (!estimateId) return null;
  const rows = await loadAllEntityRows({
    entity: base44.entities.EstimateRevision,
    query: { estimate_id: estimateId, revision_status: "open" },
    sort: "-revision_number",
    limit: 50,
    label: "Open estimate revision"
  }).catch(() => null);
  return (rows || [])[0] || null;
}

// src/components/estimator/estimateMutationGuard.js
var PENDING_TTL_MS = 24 * 60 * 60 * 1e3;
function getPendingEstimatePriceAcceptance(estimate) {
  const line = (estimate?.line_items || []).find((item) => {
    const pending = item?.price_acceptance_pending;
    if (!String(pending?.key || "").trim()) return false;
    const startedAt = Date.parse(pending?.started_at || "");
    if (Number.isFinite(startedAt) && Date.now() - startedAt > PENDING_TTL_MS) return false;
    return true;
  });
  return line ? { line, pending: line.price_acceptance_pending } : null;
}
async function assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt = "", allowPriceAcceptanceKey = "" } = {}) {
  if (!estimate?.id) throw new Error("Estimate could not be verified for this change.");
  const expected = String(expectedUpdatedAt || "").trim();
  const current = String(estimate.updated_date || "").trim();
  if (expected && current !== expected) {
    throw new Error("This estimate changed in another session. Reload it before changing Products or Parts.");
  }
  const allowedKey = String(allowPriceAcceptanceKey || "").trim();
  const pendingEntry = getPendingEstimatePriceAcceptance(estimate);
  const pendingKey = String(pendingEntry?.pending?.key || "").trim();
  if (pendingKey && pendingKey !== allowedKey) {
    throw new Error("A Builder mutation is still being recovered for this Product. Resume that operation before changing Products or Parts.");
  }
  if (estimate.deleted === true) {
    throw new Error("This estimate is in Trash. Restore it before changing Products or Parts.");
  }
  const status = String(estimate.status || "draft");
  if (status === "cancelled") {
    throw new Error("This estimate is cancelled and permanently locked. Product or Part changes cannot be added.");
  }
  if (status === "archived") {
    throw new Error("This estimate is archived and locked. Restore it to an active status before changing Products or Parts.");
  }
  if (!isEstimateProtected(status)) return null;
  const revision = await getOpenEstimateRevision(estimate.id);
  if (!revision) {
    throw new Error(`This estimate is ${status} and protected. Start an Estimate Revision before adding Products or Parts.`);
  }
  return revision;
}

// src/components/estimator/builder/builderEntityPersistence.js
function normalize2(value) {
  if (Array.isArray(value)) return value.map(normalize2);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize2(value[key]);
    return out;
  }, {});
}
function sameValue2(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize2(a)) === JSON.stringify(normalize2(b));
}
function isEntityNotFoundError(error) {
  const status = Number(error?.status || error?.response?.status || error?.response?.statusCode || error?.data?.status || 0);
  if (status === 404) return true;
  const message = String(
    error?.message || error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("not found") || message.includes("does not exist");
}
function expectedBuilderEntityFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}
async function replaceBuilderEntityFieldsIfUnchanged({
  entity,
  id,
  expectedUpdatedAt = "",
  expectedFields,
  nextFields,
  guardFields = {},
  label = "Builder record",
  maxAttempts = 3
} = {}) {
  const recordId = String(id || "").trim();
  const expectedVersion = String(expectedUpdatedAt || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const fieldNames = desired ? Object.keys(desired) : [];
  if (!recordId || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(recordId);
    if (!current?.id) throw new Error(`${label} could not be re-read before saving.`);
    for (const [fieldName, value] of Object.entries(guards)) {
      if (!sameValue2(current[fieldName], value)) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue2(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    if (expectedVersion && String(current.updated_date || "") !== expectedVersion) {
      throw new Error(`${label} changed in another session. Reload before saving.`);
    }
    for (const fieldName of fieldNames) {
      if (!sameValue2(current[fieldName], expected[fieldName]) && !sameValue2(current[fieldName], desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const currentVersion = String(current.updated_date || "").trim();
    if (!currentVersion) throw new Error(`${label} is missing its current version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id: recordId, updated_date: currentVersion },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(recordId).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue2(afterError[fieldName], desired[fieldName]))) return afterError;
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional-update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(recordId).catch(() => null);
      if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
      return saved;
    }
  }
  throw new Error(`${label} changed repeatedly while saving. Reload and try again.`);
}
async function deleteBuilderEntityIfUnchanged({
  entity,
  record,
  guardFields = {},
  label = "Builder record"
} = {}) {
  const id = String(record?.id || "").trim();
  const updatedDate = String(record?.updated_date || "").trim();
  if (!id || !updatedDate || typeof entity?.deleteMany !== "function" || typeof entity?.get !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe delete.`);
  }
  const query = { ...guardFields, id, updated_date: updatedDate };
  let result;
  try {
    result = await entity.deleteMany(query);
  } catch (error) {
    let current2;
    try {
      current2 = await entity.get(id);
    } catch (verificationError) {
      if (isEntityNotFoundError(verificationError)) {
        return { deleted: true, convergedAfterResponseLoss: true };
      }
      throw new Error(
        `${label} delete returned an error and its outcome could not be verified. ` + `Do not retry blindly; reload before continuing. ${verificationError?.message || ""}`.trim()
      );
    }
    if (!current2) return { deleted: true, convergedAfterResponseLoss: true };
    throw error;
  }
  if (!result || typeof result.deleted !== "number") {
    throw new Error(`${label} conditional-delete result could not be verified.`);
  }
  if (result.deleted === 1) return { deleted: true };
  if (result.deleted > 1) {
    throw new Error(`${label} returned an impossible multi-record delete count.`);
  }
  let current;
  try {
    current = await entity.get(id);
  } catch (verificationError) {
    if (isEntityNotFoundError(verificationError)) {
      return { deleted: true, alreadyDeleted: true };
    }
    throw new Error(
      `${label} deletion matched no current version and the record could not be re-read. ` + `Do not retry blindly; reload before continuing. ${verificationError?.message || ""}`.trim()
    );
  }
  if (!current) return { deleted: true, alreadyDeleted: true };
  throw new Error(`${label} changed in another session. It was not deleted.`);
}
var expectedEntityFields = expectedBuilderEntityFields;
var replaceEntityFieldsIfUnchanged = replaceBuilderEntityFieldsIfUnchanged;

// src/components/estimator/builder/builderPartGroupPersistence.js
var cleanString = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = comparable(value[key]);
    return result;
  }, {});
}
function sameValue3(a, b) {
  const emptyA = a === void 0 || a === null || a === "";
  const emptyB = b === void 0 || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString(a) === cleanString(b);
  }
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}
function matchesPayload(row, data) {
  return !!row && Object.entries(data || {}).every(([field, value]) => sameValue3(row[field], value));
}
async function createBuilderPartGroupWithRecovery({
  entity,
  data,
  label = "Builder Part Group"
} = {}) {
  const builderProductId = String(data?.builder_product_id || "").trim();
  const groupKey = String(data?.group_key || "").trim();
  if (!builderProductId || !groupKey || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const loadMatches = async () => {
    const rows = await entity.filter({ builder_product_id: builderProductId, group_key: groupKey });
    if (!Array.isArray(rows)) throw new Error(`${label} identity lookup did not return a record list.`);
    return rows.filter(
      (row) => String(row?.builder_product_id || "") === builderProductId && String(row?.group_key || "") === groupKey
    );
  };
  const before = await loadMatches();
  if (before.length > 1) {
    throw new Error(`${label} has multiple stored rows with the same Product/Group key. No row was changed; reload and review the duplicate Part Groups.`);
  }
  if (before.length === 1) {
    if (!matchesPayload(before[0], data)) {
      throw new Error(`${label} appeared concurrently with different data. The existing Part Group was not overwritten.`);
    }
    return { record: before[0], status: "existing" };
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }
  let after;
  try {
    after = await loadMatches();
  } catch (verifyError) {
    if (created?.id && matchesPayload(created, data)) return { record: created, status: "created_unverified_lookup" };
    throw new Error(`${label} create outcome could not be verified. Reload before retrying. ${verifyError?.message || "Recovery lookup failed."}`);
  }
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently more than once for the same Product/Group key. No uncertain Part Group was deleted; reload and review the duplicate groups.`);
  }
  if (after.length === 1) {
    if (!matchesPayload(after[0], data)) {
      throw new Error(`${label} identity exists but its live data does not match this create. No Part Group was overwritten or deleted.`);
    }
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered"
    };
  }
  if (created?.id && matchesPayload(created, data)) return { record: created, status: "created" };
  if (createError) throw new Error(`${label} could not be created and no matching Part Group was visible on recovery read. Reload before retrying. ${createError?.message || ""}`.trim());
  throw new Error(`${label} create response could not be verified. Reload before retrying.`);
}

// synthetic:@/components/staff/staffEntities
var staffEntities = new Proxy({}, { get(_, key) {
  return globalThis.__coupledBuilder.entity(key);
} });

// src/components/estimator/builder/builderMutationRecovery.js
var num18 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().filter((key) => !["created_by", "created_by_id"].includes(key)).map((key) => [key, stableValue(value[key])])
  );
}
function sameSubstantiveValue(a, b) {
  const bothPresent = a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "";
  if (bothPresent && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(num18(a) - num18(b)) <= 5e-3;
  }
  return JSON.stringify(stableValue(a ?? null)) === JSON.stringify(stableValue(b ?? null));
}
function recoveryPatchDiffers(record, patch) {
  return Object.entries(patch || {}).some(([key, value]) => !sameSubstantiveValue(record?.[key], value));
}
function pendingBuilderMutation(line) {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && String(pending.key || "").trim() ? pending : null;
}
var STALE_PENDING_BUILDER_MUTATION_MS = 24 * 60 * 60 * 1e3;
function validatePendingBuilderMutation(pending, { estimateId, builder, line }) {
  if (!pending || !String(pending.kind || "").startsWith("builder_")) {
    throw new Error("The pending Builder recovery marker is invalid. No pricing or Part change was continued.");
  }
  if (String(pending.estimate_id || "") !== String(estimateId || "") || String(pending.builder_product_id || "") !== String(builder?.id || "") || pending.estimate_line_id && line?.line_id && pending.estimate_line_id !== line.line_id) {
    throw new Error("The pending Builder recovery marker no longer matches this Estimate Product.");
  }
}
function currentSignShopSessionToken() {
  try {
    if (typeof window === "undefined") return "";
    return String(window.localStorage?.getItem("sss_session_token") || "").trim();
  } catch {
    return "";
  }
}
async function ensureBuilderPriceRevision(idempotencyKey, revision) {
  const sessionToken = currentSignShopSessionToken();
  if (!sessionToken) {
    throw new Error("Your signed sign-shop session is no longer available. Sign in again before changing Builder pricing.");
  }
  const response = await base44.functions.invoke("ensureBuilderPriceRevision", {
    idempotency_key: idempotencyKey,
    revision,
    session_token: sessionToken
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Builder price revision could not be verified after recording.");
  return result.revision;
}
async function applyPendingSourcePatch(pending) {
  const sourceEntity = String(pending?.source_entity || "").trim();
  const sourceProjectId = String(pending?.source_project_id || "").trim();
  const sourcePatch = pending?.source_patch && typeof pending.source_patch === "object" ? pending.source_patch : null;
  if (!sourceEntity || !sourceProjectId || !sourcePatch || Object.keys(sourcePatch).length === 0) return null;
  const entity = staffEntities[sourceEntity];
  if (!entity?.get || !entity?.updateMany) throw new Error("The Builder source entity needed for recovery is unavailable.");
  const current = await entity.get(sourceProjectId);
  if (!current) throw new Error("The Builder source project could not be verified while recovering the pending mutation.");
  if (!recoveryPatchDiffers(current, sourcePatch)) return current;
  const expected = String(pending?.source_updated_date_before || "").trim();
  const actual = String(current?.updated_date || "").trim();
  if (expected && actual && expected !== actual) {
    throw new Error("The Builder source project changed while reattachment was pending. The recovery marker was retained and no unrelated source edit was overwritten.");
  }
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: sourceProjectId,
    expectedUpdatedAt: current.updated_date || "",
    expectedFields: expectedEntityFields(current, sourcePatch),
    nextFields: sourcePatch,
    label: "Builder source recovery"
  });
}
async function applyPendingGroupCreatePlan(pending, builderProductId) {
  const plan = pending?.group_create_plan;
  const groups = Array.isArray(plan?.groups) ? plan.groups : [];
  if (!groups.length) return /* @__PURE__ */ new Map();
  const currentGroups = await loadAllEntityRows({ entity: staffEntities.BuilderPartGroup, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder recovery Part Groups" });
  if (!Array.isArray(currentGroups) || currentGroups.some((group) => String(group?.builder_product_id || "") !== String(builderProductId || ""))) {
    throw new Error("Part Groups could not be verified while recovering the pending Builder mutation.");
  }
  const byKey = new Map(currentGroups.map((group) => [group.group_key, group]));
  const resolvedIds = /* @__PURE__ */ new Map();
  for (const step of groups) {
    const groupKey = String(step?.group_key || step?.data?.group_key || "").trim();
    const data = step?.data && typeof step.data === "object" ? step.data : null;
    if (!groupKey || !data) throw new Error("A stored Part Group create step is invalid. Recovery was stopped before creating anything else.");
    const { record: resolved } = await createBuilderPartGroupWithRecovery({
      entity: staffEntities.BuilderPartGroup,
      data,
      label: `Builder Part Group \u201C${data.group_name || groupKey}\u201D recovery create`
    });
    if (!resolved?.id) throw new Error("A Part Group could not be verified after creation while recovering the Builder mutation.");
    byKey.set(groupKey, resolved);
    resolvedIds.set(groupKey, resolved.id);
  }
  return resolvedIds;
}
function resolvePendingPartGroupRefs(plan, groupIds) {
  if (!Array.isArray(plan?.part_updates) || !groupIds?.size) return plan;
  return {
    ...plan,
    part_updates: plan.part_updates.map((step) => {
      const groupKey = String(step?.part_group_key_ref || "").trim();
      if (!groupKey) return step;
      const groupId = groupIds.get(groupKey);
      if (!groupId) throw new Error("A stored Part could not resolve its pending Part Group during recovery.");
      return {
        ...step,
        data: step?.data ? { ...step.data, part_group_id: groupId } : step.data,
        patch: step?.patch ? { ...step.patch, part_group_id: groupId } : step.patch
      };
    })
  };
}
async function verifyPendingPreconditions(pending, builderProductId) {
  const plan = pending?.precondition_plan;
  if (!plan || typeof plan !== "object") return;
  const createGroups = Array.isArray(pending?.group_create_plan?.groups) ? pending.group_create_plan.groups : [];
  let createdGroupsByKey = /* @__PURE__ */ new Map();
  if (createGroups.length) {
    const currentGroups = await loadAllEntityRows({ entity: staffEntities.BuilderPartGroup, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder recovery Part Groups" });
    if (!Array.isArray(currentGroups)) throw new Error("Part Groups could not be verified while checking Builder mutation preconditions.");
    createdGroupsByKey = new Map(currentGroups.map((group) => [group.group_key, group]));
  }
  for (const step of plan.groups || []) {
    const group = await staffEntities.BuilderPartGroup.get(step.id);
    if (!group) {
      if (step.allow_missing_if_applied) continue;
      throw new Error("A source Part Group disappeared while the Builder mutation was pending.");
    }
    if (String(group.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A source Part Group changed ownership while the Builder mutation was pending.");
    }
    const sourceMatches = (!step.expected_patch || !recoveryPatchDiffers(group, step.expected_patch)) && (!step.expected_updated_date || !group.updated_date || String(step.expected_updated_date) === String(group.updated_date));
    if (sourceMatches) continue;
    if (step.target_patch && !recoveryPatchDiffers(group, step.target_patch)) continue;
    throw new Error(`Part Group \u201C${group.group_name || "Part Group"}\u201D changed while the Builder mutation was pending. No unrelated Group edit was overwritten.`);
  }
  for (const step of plan.parts || []) {
    const part = await staffEntities.BuilderPart.get(step.id);
    if (!part || String(part.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A source Part changed ownership or disappeared while the Builder mutation was pending.");
    }
    const sourceMatches = (!step.expected_patch || !recoveryPatchDiffers(part, step.expected_patch)) && (!step.expected_updated_date || !part.updated_date || String(step.expected_updated_date) === String(part.updated_date));
    if (sourceMatches) continue;
    if (step.target_patch && !recoveryPatchDiffers(part, step.target_patch)) continue;
    if (step.target_group_key_ref) {
      const targetGroup = createdGroupsByKey.get(step.target_group_key_ref);
      if (targetGroup?.id && String(part.part_group_id || "") === String(targetGroup.id)) continue;
    }
    throw new Error(`Part \u201C${part.part_name || "Part"}\u201D changed while the Builder mutation was pending. No unrelated Part edit was overwritten.`);
  }
}
async function applyPendingDeletePlan(pending, builderProductId) {
  const plan = pending?.delete_plan;
  if (!plan || typeof plan !== "object") return { partDeletes: 0, groupDeletes: 0 };
  const verifiedParts = [];
  const verifiedGroups = [];
  for (const step of plan.parts || []) {
    const part = await staffEntities.BuilderPart.get(step.id);
    if (!part) continue;
    if (String(part.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A Part scheduled for deletion changed ownership while the Builder mutation was pending.");
    }
    const expected = String(step.expected_updated_date || "").trim();
    const current = String(part.updated_date || "").trim();
    if (expected && current && expected !== current) {
      throw new Error(`Part \u201C${part.part_name || "Part"}\u201D changed while removal was pending. No unrelated Part edit was deleted.`);
    }
    verifiedParts.push(part);
  }
  for (const step of plan.groups || []) {
    const group = await staffEntities.BuilderPartGroup.get(step.id);
    if (!group) continue;
    if (String(group.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A Part Group scheduled for deletion changed ownership while the Builder mutation was pending.");
    }
    const expected = String(step.expected_updated_date || "").trim();
    const current = String(group.updated_date || "").trim();
    if (expected && current && expected !== current) {
      throw new Error(`Part Group \u201C${group.group_name || "Part Group"}\u201D changed while removal was pending. No unrelated group edit was deleted.`);
    }
    verifiedGroups.push(group);
  }
  let partDeletes = 0;
  let groupDeletes = 0;
  for (const part of verifiedParts) {
    await deleteBuilderEntityIfUnchanged({
      entity: staffEntities.BuilderPart,
      record: part,
      guardFields: { builder_product_id: builderProductId },
      label: `Builder Part \u201C${part.part_name || "Part"}\u201D`
    });
    partDeletes += 1;
  }
  for (const group of verifiedGroups) {
    await deleteBuilderEntityIfUnchanged({
      entity: staffEntities.BuilderPartGroup,
      record: group,
      guardFields: { builder_product_id: builderProductId },
      label: `Builder Part Group \u201C${group.group_name || "Part Group"}\u201D`
    });
    groupDeletes += 1;
  }
  return { partDeletes, groupDeletes };
}
async function resumeBuilderMutation({
  estimateId,
  estimate,
  builder,
  parts,
  line,
  pending,
  applyPartPlan
}) {
  validatePendingBuilderMutation(pending, { estimateId, builder, line });
  if (pending.kind === "builder_part_group_move") {
    throw new Error("This pending Part Group move must be resumed with its two-Product recovery action.");
  }
  if (pending.kind === "builder_product_remove") {
    throw new Error("This pending Product removal must be resumed with Resume Product Remove.");
  }
  if (typeof applyPartPlan !== "function") throw new Error("Builder recovery could not apply its stored Part plan.");
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  if (!Array.isArray(parts) || parts.some((part) => part?.builder_product_id !== builder.id)) {
    throw new Error("Builder Parts could not be verified while recovering the pending Builder mutation.");
  }
  const plan = pending.part_acceptance_plan || {};
  const builderPatch = pending.builder_patch || {};
  const preflightBuilder = await staffEntities.BuilderProduct.get(builder.id);
  if (!preflightBuilder?.id) throw new Error("Builder Product could not be verified before recovering the pending mutation.");
  if (recoveryPatchDiffers(preflightBuilder, builderPatch)) {
    const expectedBuilderUpdatedAt = String(pending.builder_updated_date_before || "").trim();
    const currentBuilderUpdatedAt = String(preflightBuilder.updated_date || "").trim();
    if (expectedBuilderUpdatedAt && currentBuilderUpdatedAt && expectedBuilderUpdatedAt !== currentBuilderUpdatedAt) {
      throw new Error("This Builder Product changed while a Builder mutation was pending. Recovery stopped before applying any stored Part/Group writes.");
    }
  }
  await verifyPendingPreconditions(pending, builder.id);
  await applyPendingSourcePatch(pending);
  await applyPendingDeletePlan(pending, builder.id);
  const groupIds = await applyPendingGroupCreatePlan(pending, builder.id);
  const resolvedPlan = resolvePendingPartGroupRefs(plan, groupIds);
  await applyPartPlan(builder.id, resolvedPlan);
  if (pending.post_part_delete_plan) {
    await applyPendingDeletePlan({ delete_plan: pending.post_part_delete_plan }, builder.id);
  }
  let revision = pending.revision || {};
  const changedParts = Array.isArray(revision.changed_parts) ? revision.changed_parts : [];
  if (changedParts.some((part) => part?.part_key_ref || part?.new_group_key_ref)) {
    const currentParts = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder recovery Parts" });
    if (!Array.isArray(currentParts)) throw new Error("Created Parts could not be verified before recording the Builder revision.");
    const partsByKey = new Map(currentParts.map((part) => [part.part_key, part]));
    revision = {
      ...revision,
      changed_parts: changedParts.map((part) => {
        const hydrated = { ...part };
        if (hydrated.part_key_ref) {
          const createdPart = partsByKey.get(hydrated.part_key_ref);
          if (!createdPart?.id) throw new Error("A created Part could not be resolved for the Builder revision audit.");
          hydrated.part_id = createdPart.id;
          hydrated.part_key = createdPart.part_key;
          delete hydrated.part_key_ref;
        }
        if (hydrated.new_group_key_ref) {
          const createdGroupId = groupIds.get(hydrated.new_group_key_ref);
          if (!createdGroupId) throw new Error("A created Part Group could not be resolved for the Builder revision audit.");
          hydrated.new_group_id = createdGroupId;
          delete hydrated.new_group_key_ref;
        }
        return hydrated;
      })
    };
  }
  if (!pending.skip_revision) {
    await ensureBuilderPriceRevision(pending.key, revision);
  }
  const currentBuilder = await staffEntities.BuilderProduct.get(builder.id);
  if (!currentBuilder?.id) throw new Error("Builder Product could not be verified while completing the pending mutation.");
  if (recoveryPatchDiffers(currentBuilder, builderPatch)) {
    const expectedBuilderUpdatedAt = String(pending.builder_updated_date_before || "").trim();
    const currentBuilderUpdatedAt = String(currentBuilder.updated_date || "").trim();
    if (expectedBuilderUpdatedAt && currentBuilderUpdatedAt && expectedBuilderUpdatedAt !== currentBuilderUpdatedAt) {
      throw new Error("This Builder Product changed while a Builder mutation was pending. The recovery marker was retained and no unrelated Builder edit was overwritten.");
    }
    await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderProduct,
      id: builder.id,
      expectedUpdatedAt: currentBuilder.updated_date || "",
      expectedFields: expectedBuilderEntityFields(currentBuilder, builderPatch),
      nextFields: builderPatch,
      guardFields: { estimate_id: currentBuilder.estimate_id },
      label: "Builder Product recovery completion"
    });
  }
  const latestEstimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (!latestEstimate) throw new Error("Estimate could not be verified while completing the pending Builder mutation.");
  const latestLine = (latestEstimate.line_items || []).find((item) => item.builder_product_id === builder.id);
  if (!latestLine) throw new Error("This Product is no longer part of the estimate. The pending Builder recovery marker could not be completed.");
  const latestPending = pendingBuilderMutation(latestLine);
  const linePatch = pending.line_patch || {};
  if (!latestPending) {
    if (!recoveryPatchDiffers(latestLine, linePatch)) {
      return {
        blocked: false,
        recovered: true,
        alreadyCompleted: true,
        changedParts: resolvedPlan.changed_parts || [],
        line: latestLine
      };
    }
    throw new Error("The Builder recovery marker disappeared before the accepted Estimate line was verified. Reload before continuing.");
  }
  if (latestPending.key !== pending.key) {
    throw new Error("A different Builder recovery operation is now active for this Product. Reload before continuing.");
  }
  await assertEstimateProductMutationAllowed(latestEstimate, { allowPriceAcceptanceKey: pending.key });
  const lineItems = (latestEstimate.line_items || []).map(
    (item) => item.builder_product_id === builder.id ? { ...item, ...linePatch, price_acceptance_pending: {} } : item
  );
  const updateResult = await replaceEstimateFieldsIfUnchanged({
    entity: staffEntities.AllInOneEstimate,
    estimateId,
    expectedFields: expectedEstimateFields(latestEstimate, { line_items: lineItems }),
    nextFields: { line_items: lineItems },
    label: "Builder mutation recovery completion"
  });
  const completedLine = (updateResult?.line_items || lineItems).find((item) => item.builder_product_id === builder.id) || null;
  return {
    blocked: false,
    recovered: true,
    changedParts: resolvedPlan.changed_parts || [],
    line: completedLine
  };
}

// src/components/estimator/builder/builderPartPersistence.js
var cleanString2 = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function comparable2(value) {
  if (Array.isArray(value)) return value.map(comparable2);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = comparable2(value[key]);
    return result;
  }, {});
}
function sameValue4(a, b) {
  const emptyA = a === void 0 || a === null || a === "";
  const emptyB = b === void 0 || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString2(a) === cleanString2(b);
  }
  return JSON.stringify(comparable2(a)) === JSON.stringify(comparable2(b));
}
function matchesPayload2(row, data) {
  return !!row && Object.entries(data || {}).every(([field, value]) => sameValue4(row[field], value));
}
async function createBuilderPartWithRecovery({
  entity,
  data,
  label = "Builder Part"
} = {}) {
  const builderProductId = String(data?.builder_product_id || "").trim();
  const partKey = String(data?.part_key || "").trim();
  if (!builderProductId || !partKey || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const loadMatches = async () => {
    const rows = await entity.filter({ builder_product_id: builderProductId, part_key: partKey });
    if (!Array.isArray(rows)) throw new Error(`${label} identity lookup did not return a record list.`);
    return rows.filter(
      (row) => String(row?.builder_product_id || "") === builderProductId && String(row?.part_key || "") === partKey
    );
  };
  const before = await loadMatches();
  if (before.length > 1) {
    throw new Error(`${label} has multiple stored rows with the same Product/Part key. No row was changed; reload and review the duplicate Parts.`);
  }
  if (before.length === 1) {
    if (!matchesPayload2(before[0], data)) {
      throw new Error(`${label} appeared concurrently with different data. The existing Part was not overwritten.`);
    }
    return { record: before[0], status: "existing" };
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }
  let after;
  try {
    after = await loadMatches();
  } catch (verifyError) {
    if (created?.id && matchesPayload2(created, data)) return { record: created, status: "created_unverified_lookup" };
    throw new Error(`${label} create outcome could not be verified. Reload before retrying. ${verifyError?.message || "Recovery lookup failed."}`);
  }
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently more than once for the same Product/Part key. No uncertain Part was deleted; reload and review the duplicate Parts.`);
  }
  if (after.length === 1) {
    if (!matchesPayload2(after[0], data)) {
      throw new Error(`${label} identity exists but its live data does not match this create. No Part was overwritten or deleted.`);
    }
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered"
    };
  }
  if (created?.id && matchesPayload2(created, data)) return { record: created, status: "created" };
  if (createError) throw new Error(`${label} could not be created and no matching Part was visible on recovery read. Reload before retrying. ${createError?.message || ""}`.trim());
  throw new Error(`${label} create response could not be verified. Reload before retrying.`);
}

// src/components/estimator/foundation/foundationReinforcementPartDescriptors.js
var INVALID = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
var fail = (message) => {
  const error = new Error(message);
  error.code = INVALID;
  throw error;
};
var plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
var finite = (v) => typeof v === "number" && Number.isFinite(v);
var nonnegative = (v) => finite(v) && v >= 0;
var positive = (v) => finite(v) && v > 0;
var nonemptyStr = (v) => typeof v === "string" && v.trim().length > 0;
var safeInt = (v) => Number.isSafeInteger(v);
var clone = (v) => structuredClone(v);
function foundationReinforcementPartDescriptors({ item, itemIndex } = {}) {
  if (!plain(item)) fail("item must be a plain record.");
  if (!safeInt(itemIndex) || itemIndex < 0) fail("itemIndex must be a non-negative safe integer.");
  if (item.reinforcement_calculation_version !== 2) fail("reinforcement_calculation_version must be 2.");
  const include = item.include_rebar;
  if (include === false || include === null || include === void 0) return [];
  if (typeof include !== "boolean") fail("include_rebar must be a boolean.");
  if (!nonemptyStr(item.component_id)) fail("component_id must be a non-empty string.");
  const design = item.reinforcement_design;
  const material = item.reinforcement_material;
  const snapshot = item.reinforcement_cost_snapshot;
  if (!plain(design) || design.version !== 2) fail("reinforcement_design.version must be 2.");
  if (!plain(material)) fail("reinforcement_material must be a record.");
  if (!plain(snapshot) || snapshot.version !== 1 || snapshot.calculation_version !== 2 || snapshot.engineering_approved !== false) {
    fail("reinforcement_cost_snapshot must be version 1 / calculation_version 2 / unapproved.");
  }
  if (!plain(snapshot.amounts) || !plain(snapshot.material) || !plain(snapshot.basis) || !Array.isArray(snapshot.rate_sources)) {
    fail("reinforcement_cost_snapshot requires amounts/material/basis/rate_sources.");
  }
  const numerics = {
    rebar_feet: nonnegative,
    rebar_rate: nonnegative,
    rebar_material_cost: nonnegative,
    rebar_labor_cost: nonnegative,
    rebar_labor_hours: nonnegative,
    rebar_cost: nonnegative,
    rebar_geometry_feet: positive,
    rebar_geometry_weight_lbs: positive,
    rebar_connection_count: (v) => safeInt(v) && v >= 0
  };
  for (const [field, check] of Object.entries(numerics)) {
    if (!check(item[field])) fail(`${field} must be a finite numeric in range.`);
  }
  const A = snapshot.amounts;
  const mapping = {
    rebar_feet: "priced_feet",
    rebar_geometry_feet: "geometry_feet",
    rebar_weight_lbs: "priced_weight_lbs",
    rebar_geometry_weight_lbs: "geometry_weight_lbs",
    rebar_material_cost: "material_cost",
    rebar_labor_cost: "labor_cost",
    rebar_labor_hours: "labor_hours",
    rebar_connection_count: "connection_count",
    rebar_cost: "steel_cost"
  };
  if (!nonnegative(item.rebar_weight_lbs)) fail("rebar_weight_lbs must be finite numeric non-negative.");
  for (const [itemField, snapField] of Object.entries(mapping)) {
    if (!nonnegative(A[snapField]) || item[itemField] !== A[snapField]) fail(`${itemField} must strictly equal snapshot.amounts.${snapField}.`);
  }
  const M = snapshot.material;
  const B = snapshot.basis;
  if (!nonnegative(B.labor_rate_per_hour)) fail("labor_rate_per_hour must be finite numeric >= 0.");
  if (A.material_cost + A.labor_cost !== A.steel_cost) fail("amounts must sum to steel_cost.");
  const productMatches = (a, b, expected) => {
    const value = a * b;
    return Number.isFinite(value) && !(a > 0 && b > 0 && value === 0) && value === expected;
  };
  if (!productMatches(item.rebar_feet, item.rebar_rate, A.material_cost)) fail("feet*rate must equal material_cost.");
  if (!productMatches(item.rebar_labor_hours, B.labor_rate_per_hour, A.labor_cost)) fail("hours*labor_rate must equal labor_cost.");
  if (M.pricing_unit !== "ft" || B.unit !== "ft") fail("pricing/basis units must be ft.");
  if (M.cost_per_ft !== item.rebar_rate || B.cost_per_ft !== item.rebar_rate) fail("rate must match snapshot material and basis.");
  if (M.kind !== material.kind) fail("snapshot material kind must match authored kind.");
  if (material.kind === "catalog") {
    if (!nonemptyStr(material.inventory_id)) fail("catalog material requires inventory_id.");
    if (M.inventory_id !== material.inventory_id) fail("catalog inventory_id mismatch. Recalculate and save Foundation with the selected reinforcement material before Builder handoff; frozen prices remain unchanged until Update Price.");
    if (item.rebar_rate === 0) {
      if (item.custom_rebar_cost_per_ft !== 0 || M.rate_source !== "custom_rebar_cost_per_ft") {
        fail("explicit catalog rate 0 requires authored zero override provenance.");
      }
    }
  } else if (material.kind === "manual") {
    if (!nonemptyStr(material.reason) || !nonemptyStr(M.reason) || M.reason.trim() !== material.reason.trim()) fail("manual material reason must match snapshot.");
    if (M.inventory_id !== null && M.inventory_id !== void 0 && M.inventory_id !== "") fail("manual material must not carry an inventory id.");
  } else {
    fail("reinforcement_material.kind must be catalog or manual.");
  }
  const S = snapshot.supports;
  const supportFields = [
    "support_count",
    "support_purchased_units",
    "support_packs",
    "support_material_cost",
    "support_labor_cost",
    "support_labor_hours",
    "support_cost"
  ];
  const supportDataPresent = supportFields.some((f) => item[f] !== void 0 && item[f] !== null);
  let supportParts = [];
  if (S != null || supportDataPresent) {
    if (!plain(S) || !plain(S.amounts) || S.status !== "resolved") {
      fail("reinforcement_cost_snapshot.supports must be a resolved support resolution when support data is present.");
    }
    const SA = S.amounts;
    for (const f of supportFields) {
      if (!nonnegative(item[f])) fail(`${f} must be a finite numeric >= 0.`);
    }
    const supportMapping = {
      support_count: "support_count",
      support_purchased_units: "support_purchased_units",
      support_packs: "support_packs",
      support_material_cost: "support_material_cost",
      support_labor_cost: "support_labor_cost",
      support_labor_hours: "support_labor_hours",
      support_cost: "support_cost"
    };
    for (const [itemField, snapField] of Object.entries(supportMapping)) {
      if (!nonnegative(SA[snapField]) || item[itemField] !== SA[snapField]) {
        fail(`${itemField} must strictly equal snapshot.supports.amounts.${snapField}.`);
      }
    }
    if (SA.support_material_cost + SA.support_labor_cost !== SA.support_cost) {
      fail("support amounts must sum to support_cost.");
    }
    if (SA.support_count > 0) {
      const selections = Array.isArray(S.selections) ? S.selections : fail("resolved supports require selections.");
      if (!productMatches(SA.support_labor_hours, B.labor_rate_per_hour, SA.support_labor_cost)) {
        fail("support labor hours*rate must equal support_labor_cost.");
      }
      let purchasedSum = 0, packsSum = 0, materialSum = 0;
      for (const sel of selections) {
        if (!plain(sel) || !nonemptyStr(sel.name) || !safeInt(sel.units_purchased) || sel.units_purchased <= 0 || !safeInt(sel.units_required) || sel.units_required <= 0 || sel.units_purchased < sel.units_required || !safeInt(sel.pack_size) || sel.pack_size <= 0 || !safeInt(sel.packs) || sel.packs <= 0 || sel.packs * sel.pack_size !== sel.units_purchased || !nonnegative(sel.material_cost) || !nonnegative(sel.unit_cost)) {
          fail("each support selection needs a named pick with consistent pack/unit/cost math.");
        }
        if (!productMatches(sel.units_purchased, sel.unit_cost, sel.material_cost)) {
          fail("support selection units*unit_cost must equal material_cost.");
        }
        purchasedSum += sel.units_purchased;
        packsSum += sel.packs;
        materialSum += sel.material_cost;
      }
      if (purchasedSum !== SA.support_purchased_units || packsSum !== SA.support_packs || materialSum !== SA.support_material_cost) {
        fail("support selections must reconcile to support amounts.");
      }
    } else if (SA.support_purchased_units || SA.support_packs || SA.support_cost) {
      fail("zero required supports cannot carry purchased units or cost.");
    }
  }
  const builder = () => {
    const active = { ...item };
    delete active.reinforcement_proposal;
    return structuredClone(active);
  };
  const basisSnap = () => ({
    pricing_mode: "foundation_reinforcement_v2",
    reinforcement: {
      version: 1,
      calculation_version: 2,
      component_id: item.component_id,
      // O-011 (CMP-A11) -- accepted-design v2 part model: the part's
      // `accepted_design_version` records the accepted design's version so a
      // v2 part model's consumer reads the version, never a fabricated v1.
      accepted_design_version: 2,
      physical_quantity_ft: item.rebar_geometry_feet,
      priced_quantity_ft: item.rebar_feet,
      geometry_weight_lbs: item.rebar_geometry_weight_lbs,
      priced_weight_lbs: item.rebar_weight_lbs,
      connection_count: item.rebar_connection_count,
      engineering_approved: false,
      procurement_ready: false,
      material: clone(M),
      amounts: clone(A),
      supports: clone(S ?? null)
    }
  });
  const name = nonemptyStr(M.name) ? M.name : "Reinforcing steel";
  const i = itemIndex;
  if (S != null && S.amounts.support_count > 0) {
    supportParts = S.selections.map((sel, s) => ({
      part_key: `foundation:item:${i}:support:${s}`,
      part_type: "material",
      part_subtype: "rebar_support",
      part_name: sel.name,
      source_path: `items[${i}].reinforcement_cost_snapshot.supports.selections[${s}]`,
      inventory_entity: nonemptyStr(sel.inventory_id) ? "FoundationInventory" : "",
      inventory_item_id: nonemptyStr(sel.inventory_id) ? sel.inventory_id : "",
      quantity: sel.units_purchased,
      unit: "ea",
      unit_cost: sel.unit_cost,
      extended_cost: sel.material_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    }));
    supportParts.push({
      part_key: `foundation:item:${i}:support-labor`,
      part_type: "labor",
      part_subtype: "rebar_support_labor",
      part_name: "Support install labor",
      source_path: `items[${i}].reinforcement_cost_snapshot.supports`,
      inventory_entity: "",
      inventory_item_id: "",
      quantity: item.support_labor_hours,
      unit: "hr",
      unit_cost: B.labor_rate_per_hour,
      extended_cost: item.support_labor_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    });
  }
  return [
    {
      part_key: `foundation:item:${i}:rebar`,
      part_type: "material",
      part_subtype: "rebar",
      part_name: name,
      source_path: `items[${i}].reinforcement_material.inventory_id`,
      inventory_entity: material.kind === "catalog" ? "FoundationInventory" : "",
      inventory_item_id: material.kind === "catalog" ? M.inventory_id : "",
      quantity: item.rebar_feet,
      unit: "ft",
      unit_cost: item.rebar_rate,
      extended_cost: item.rebar_material_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    },
    {
      part_key: `foundation:item:${i}:rebar-labor`,
      part_type: "labor",
      part_subtype: "rebar_labor",
      part_name: "Reinforcement labor",
      source_path: `items[${i}].reinforcement_design`,
      inventory_entity: "",
      inventory_item_id: "",
      quantity: item.rebar_labor_hours,
      unit: "hr",
      unit_cost: B.labor_rate_per_hour,
      extended_cost: item.rebar_labor_cost,
      builder_data: builder(),
      calculation_snapshot: clone(snapshot),
      pricing_basis_snapshot: basisSnap()
    },
    ...supportParts
  ];
}

// src/components/estimator/foundation/foundationGeometryInputs.js
var foundationInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var FOUNDATION_DIMENSION_FIELDS = Object.freeze({
  // Foundation item card (spread footing / pillar)  -  -  -  consumed by the card-label
  // remainder; recorded here so card + panels share one label source.
  foundation: Object.freeze({
    length_inches: Object.freeze({
      label: "Length (in)",
      help: "Footing length  -  -  -  the long side of a rectangular spread footing.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    width_inches: Object.freeze({
      label: "Width (in)",
      help: "Footing width  -  -  -  the short side of a rectangular spread footing.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "Depth (in)",
      help: "Footing or pier depth below grade  -  -  -  must reach below the frost line for your area.",
      placeholder: `3' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    diameter: Object.freeze({
      label: "Diameter (in)",
      help: "Round pier diameter measured straight across the top.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    grade_offset_inches: Object.freeze({
      label: "Grade offset (in)",
      help: "How far the footing top sits above (+) or below (-) finished grade.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: true
    })
  }),
  // Project poles (FoundationPolesPanel).
  pole: Object.freeze({
    height_inches: Object.freeze({
      label: "Height above grade (in)",
      help: "Exposed pole length from finished grade up to the sign mount.",
      placeholder: `10' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    embedment_inches: Object.freeze({
      label: "Embedment below grade (in)",
      help: "Pole length buried in the footing  -  -  -  must satisfy frost depth and the pole supplier's embedment guidance.",
      placeholder: `3' 6"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    base_offset_inches: Object.freeze({
      label: "Base offset above grade (in)",
      help: "Lifts the pole bottom above grade for wall or pier mounts  -  -  -  the gap still counts toward required stock length.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    total_length_inches: Object.freeze({
      label: "Total stock length (in)",
      help: "Billed pole length when a full stick is purchased  -  -  -  leave blank to price height above grade plus embedment.",
      placeholder: `20' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Masonry walls (FoundationWallsPanel)  -  -  -  camelCase wall record keys.
  wall: Object.freeze({
    heightInches: Object.freeze({
      label: "Wall height (in)",
      help: "Finished masonry height measured from the footing up.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mortarGapInches: Object.freeze({
      label: "Mortar joint (in)",
      help: 'Mortar thickness between masonry units  -  -  -  3/8" is typical.',
      placeholder: '3/8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    wasteFraction: Object.freeze({
      label: "Waste (0-1)",
      help: "Waste/cut factor on brick+mortar+labor quantities (0.1 = +10%).",
      placeholder: "0.1",
      unit: "fraction",
      ftIn: false,
      signed: false
    }),
    internalWallHeightInches: Object.freeze({
      label: "Fill wall height (in)",
      help: "Internal fill wall height  -  -  -  blank follows the outer wall height.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    internalMortarGapInches: Object.freeze({
      label: "Fill mortar joint (in)",
      help: "Mortar thickness for the internal fill wall.",
      placeholder: '3/8"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Wall caps (FoundationWallCapsPanel)  -  -  -  length_inches is the cap cut, not a
  // footing length; keep it in its own section.
  wallCap: Object.freeze({
    length_inches: Object.freeze({
      label: "Cut length (in)",
      help: "Cap stock cut for this piece  -  -  -  the full stock price is charged per cut piece.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    overhang_inches: Object.freeze({
      label: "Overhang (in)",
      help: "How far the cap projects past each wall face -- 0 is flush.",
      placeholder: '1"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "Cap thickness (in)",
      help: "Vertical thickness of the cap piece sitting on the wall.",
      placeholder: '3"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    // O-050 (CMP-D07) -- cap profile / width / elevation / joints / slope /
    // end-treatment metadata. Optional authored fields; blank = "not recorded",
    // never a silent default on the cap's geometry or finish.
    width_inches: Object.freeze({
      label: "Cap width (in)",
      help: "How wide the cap spans the wall top  -  0 is flush with the wall face.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    elevation_inches: Object.freeze({
      label: "Cap elevation (in)",
      help: "Height of the cap's top surface above the slab.",
      placeholder: '24"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    joint_spacing_inches: Object.freeze({
      label: "Joint spacing (in)",
      help: "Distance between cap joints along the wall run.",
      placeholder: '48"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    profile: Object.freeze({
      label: "Cap profile",
      help: "The cap's edge profile (flat, sloped, beveled, rounded).",
      placeholder: "flat",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    slope: Object.freeze({
      label: "Cap slope",
      help: "Whether the cap top sheds water (flat, single-slope, double-slope).",
      placeholder: "flat",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    end_treatment: Object.freeze({
      label: "End treatment",
      help: "How the cap terminates at wall ends (straight, mitered, returned).",
      placeholder: "straight",
      unit: "text",
      ftIn: false,
      signed: false
    })
  }),
  // Pole-mounted signs (FoundationPolesPanel sign sub-list).
  sign: Object.freeze({
    width_inches: Object.freeze({
      label: "W (in)",
      help: "Sign face width across the pole.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "H (in)",
      help: "Sign face height.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mount_height_inches: Object.freeze({
      label: "Mount ht (in)",
      help: "Height from grade up to the sign's mounting point.",
      placeholder: `8' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "D (in)",
      help: "Sign face depth (thickness) in plan view.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    horizontal_offset_inches: Object.freeze({
      label: "Offset (in)",
      help: "Horizontal offset from the pole center in plan view (+ = one side, - = other).",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: true
    }),
    // O-060 (CMP-E05) -- panel-shape/trim/body-color/envelope metadata.
    // Optional authored fields; blank = "not recorded", never a silent default.
    panel_shape: Object.freeze({
      label: "Panel shape",
      help: "Sign panel shape: cabinet / panel / letters.",
      placeholder: "cabinet",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    trim_color: Object.freeze({
      label: "Trim color",
      help: "Sign trim / frame color.",
      placeholder: "bronze",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    body_color: Object.freeze({
      label: "Body color",
      help: "Sign body / cabinet color.",
      placeholder: "white",
      unit: "text",
      ftIn: false,
      signed: false
    }),
    envelope: Object.freeze({
      label: "Envelope",
      help: "Physical envelope note (overall bounding box / projection).",
      placeholder: `e.g. 4'x2'x8"`,
      unit: "text",
      ftIn: false,
      signed: false
    }),
    orientation: Object.freeze({
      label: "Orient (deg)",
      help: "Sign face rotation on the pole (0 = facing the plan's +x direction).",
      placeholder: "0",
      unit: "degrees",
      ftIn: false,
      signed: true
    })
  }),
  // Signage cabinets (SignageCabinetsPanel).
  cabinet: Object.freeze({
    width_inches: Object.freeze({
      label: "Width (in)",
      help: "Cabinet face width  -  -  -  horizontal across the sign face.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    height_inches: Object.freeze({
      label: "Height (in)",
      help: "Cabinet face height  -  -  -  vertical on the sign face.",
      placeholder: `2' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    depth_inches: Object.freeze({
      label: "Depth (in)",
      help: "Cabinet depth front-to-back  -  -  -  affects wind load and mounting.",
      placeholder: '8"',
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    mount_height_inches: Object.freeze({
      label: "Mount height (in)",
      help: "Height from grade up to the cabinet's mounting point.",
      placeholder: '0"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Rectangle outline entry (WallShapeEditor)  -  -  -  local draft, applied on click.
  wallOutline: Object.freeze({
    rect_length: Object.freeze({
      label: "Rectangle length (in)",
      help: "Footprint length for a rectangular wall outline.",
      placeholder: `8' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    }),
    rect_width: Object.freeze({
      label: "Rectangle width (in)",
      help: "Footprint width for a rectangular wall outline.",
      placeholder: `4' 0"`,
      unit: "inches",
      ftIn: true,
      signed: false
    })
  }),
  // Landscape grid (LandscapeDesigner).
  landscape: Object.freeze({
    cell_size_inches: Object.freeze({
      label: "Cell size (in)",
      help: 'Edge length of one grid cell  -  -  -  12" makes each cell 1 sq ft.',
      placeholder: '12"',
      unit: "inches",
      ftIn: true,
      signed: false
    })
  })
});

// src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);
var finiteRate = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive2 = (value) => finiteRate(value) && value > 0;
var isRecord12 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var numeric = (value) => {
  const parsed = foundationInputNumber(value);
  if (parsed !== null) return parsed;
  return value === null || ["undefined", "number", "string", "boolean"].includes(typeof value) ? value : NaN;
};
var text = (value) => typeof value === "string" ? value.trim() : "";
function resolveFoundationReinforcementBasis({
  material,
  inventory = [],
  settings = {},
  quantityOverride = null,
  rateOverride = null
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const reference = isRecord12(material) ? material : {};
  let row = null, source = null, name = "", reason = "", inventoryId = null;
  if (reference.kind === "manual") {
    source = reference;
    name = text(reference.name) || "Manual rebar";
    reason = text(reference.reason);
    if (!reason || reason.length > 1e3) issue(
      "material.reason",
      "reinforcement_manual_basis_reason_required",
      "Explain the manual material/rate basis in 1 to 1000 characters; this is not an engineering approval."
    );
  } else if (reference.kind === "catalog") {
    const id = reference.inventory_id;
    if (typeof id !== "string" || !id || id.trim() !== id || id.length > 128) {
      issue("material.inventory_id", "reinforcement_material_id_required", "Select a stable rebar inventory ID.");
    } else if (!Array.isArray(inventory)) {
      issue("inventory", "reinforcement_inventory_unavailable", "The rebar catalog could not be read; do not assume the material was deleted.");
    } else {
      const matches = inventory.filter((candidate) => candidate?.id === id);
      row = matches.length === 1 ? matches[0] : null;
      if (matches.length > 1) issue("material.inventory_id", "reinforcement_material_id_ambiguous", "Multiple current records have the selected ID; refresh the catalog before pricing.");
      else if (!row) issue("material.inventory_id", "reinforcement_material_unavailable", "The selected rebar catalog record is unavailable.");
      else if (row.material_type !== "rebar") {
        issue("material.inventory_id", "reinforcement_material_type_invalid", "The selected catalog record is not rebar.");
        row = null;
      }
      if (row) {
        inventoryId = id;
        name = text(row.material_name) || "Catalog rebar";
        source = {
          unit: row.unit,
          cost_per_ft: row.cost_per_unit,
          bar_diameter_inches: row.rebar_diameter_inches,
          weight_lb_per_ft: row.rebar_weight_lb_per_ft
        };
      }
    }
  } else issue("material.kind", "reinforcement_material_source_required", "Choose an explicit manual basis or a stable catalog record.");
  const rawUnit = source?.unit;
  const unit = typeof rawUnit === "string" && FOOT_UNITS.includes(rawUnit.trim().toLowerCase()) ? "ft" : void 0;
  if (!unit) issue(
    "material.unit",
    "reinforcement_material_unit_unsupported",
    "Rebar needs a known per-foot pricing unit; each/stick/weight units are not silently converted."
  );
  const diameter = numeric(source?.bar_diameter_inches);
  if (!positive2(diameter)) issue(
    "material.bar_diameter_inches",
    "reinforcement_material_diameter_required",
    "Enter a known positive nominal bar diameter; a #size label alone is not diameter metadata."
  );
  const weight = source?.weight_lb_per_ft == null ? null : numeric(source.weight_lb_per_ft);
  if (weight === null) issue(
    "material.weight_lb_per_ft",
    "reinforcement_material_weight_unknown",
    "Material weight per foot is unknown, not zero.",
    "warning"
  );
  else if (!positive2(weight)) issue(
    "material.weight_lb_per_ft",
    "reinforcement_material_weight_invalid",
    "Known material weight per foot must be finite and positive."
  );
  const override = rateOverride !== null && rateOverride !== void 0;
  const rate = numeric(override ? rateOverride : source?.cost_per_ft);
  if (!finiteRate(rate)) issue(
    override ? "custom_rebar_cost_per_ft" : "material.cost_per_ft",
    "reinforcement_material_rate_invalid",
    "Use an explicit finite nonnegative per-foot rate; zero is allowed."
  );
  if (reference.kind === "catalog" && !override && rate === 0) {
    issue(
      "material.cost_per_ft",
      "reinforcement_zero_catalog_rate_unconfirmed",
      "A zero catalog price may be unpriced, not free. Use an explicit per-foot override to confirm a zero rate."
    );
  }
  const quantity = quantityOverride == null ? null : numeric(quantityOverride);
  if (quantity !== null && !finiteRate(quantity)) issue(
    "custom_rebar_qty",
    "reinforcement_quantity_override_invalid",
    "Use a finite nonnegative aggregate item quantity; zero is allowed."
  );
  const settingsValid = isRecord12(settings);
  if (!settingsValid) issue("settings", "reinforcement_settings_unavailable", "Labor settings are unavailable; do not infer defaults from a failed read.");
  const rateSources = [];
  const setting = (key, fallback) => {
    const missing = settingsValid && (!Object.prototype.hasOwnProperty.call(settings, key) || settings[key] === void 0);
    const value = !settingsValid ? void 0 : missing ? fallback : numeric(settings[key]);
    if (!finiteRate(value)) issue(
      `settings.${key}`,
      "reinforcement_labor_rate_invalid",
      `${key} must be a finite nonnegative number; an explicit malformed value does not use its default.`
    );
    rateSources.push({ key, source: missing ? "legacy_default" : "settings", value });
    return value;
  };
  const basis = {
    unit,
    bar_diameter_inches: diameter,
    weight_lb_per_ft: weight,
    cost_per_ft: rate,
    quantity_override_ft: quantity,
    labor_rate_per_hour: setting("foundation_main_labor_rate", 60),
    labor_hours_per_ft: setting("foundation_rebar_time_linear_ft", 0.02),
    labor_hours_per_connection: setting("foundation_rebar_time_cross_section", 0.05)
  };
  return {
    basis,
    issues,
    rateSources,
    materialSnapshot: {
      kind: reference.kind === "manual" ? "manual" : reference.kind === "catalog" ? "catalog" : null,
      inventory_id: inventoryId,
      inventory_updated_date: typeof row?.updated_date === "string" ? row.updated_date : null,
      name: name || "Unresolved rebar",
      reason: reference.kind === "manual" ? reason : null,
      pricing_unit: unit ?? null,
      original_unit: typeof rawUnit === "string" ? rawUnit : null,
      bar_diameter_inches: diameter,
      weight_lb_per_ft: weight,
      cost_per_ft: rate,
      rate_source: override ? "custom_rebar_cost_per_ft" : reference.kind === "catalog" ? "catalog" : "manual"
    }
  };
}

// src/components/estimator/foundation/foundationReinforcementFrozenPricing.js
var plain2 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var nonnegative2 = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive3 = (value) => nonnegative2(value) && value > 0;
var text2 = (value) => typeof value === "string" && value.trim().length > 0;
var product = (a, b, amount) => {
  const result = a * b;
  return Number.isFinite(result) && !(a > 0 && b > 0 && result === 0) && result === amount;
};
var fail2 = (message) => {
  const error = new Error(`Frozen reinforcement price basis is invalid: ${message}`);
  error.code = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
  throw error;
};
var supportSelectionIndex = (partKey, partSubtype) => {
  if (partSubtype !== "rebar_support" || typeof partKey !== "string") return null;
  const segments = partKey.split(":");
  if (segments.length === 5 && segments[0] === "foundation" && segments[1] === "item" && segments[3] === "support" && /^\d+$/.test(segments[4])) {
    return Number(segments[4]);
  }
  return null;
};
function validate(frame, unitCost, extendedCost) {
  if (!plain2(frame) || frame.version !== 1) fail2("unsupported record/version.");
  if (frame.state === "unrecorded") {
    if (Object.keys(frame).some((key) => key !== "version" && key !== "state")) fail2("unrecorded basis carries asserted values.");
    return;
  }
  if (frame.state !== "recorded") fail2("unsupported state.");
  const supportMaterial = frame.part_subtype === "rebar_support";
  const supportLabor = frame.part_type === "labor" && frame.part_subtype === "rebar_support_labor";
  const expectedUnit = supportMaterial ? "ea" : frame.part_type === "material" ? "ft" : "hr";
  if (!["material", "labor"].includes(frame.part_type) || frame.unit !== expectedUnit) fail2("role/unit mismatch.");
  if (supportMaterial && frame.part_type !== "material") fail2("support material must be a material part.");
  if (supportMaterial) {
    if (!Number.isSafeInteger(frame.support_selection_index) || frame.support_selection_index < 0) {
      fail2("invalid support selection index.");
    }
  } else if (frame.support_selection_index !== void 0 && frame.support_selection_index !== null) {
    fail2("a non-support part cannot carry a support selection index.");
  }
  for (const value of [frame.quantity, frame.unit_cost, frame.extended_cost, frame.labor_rate_per_hour]) {
    if (!nonnegative2(value)) fail2("quantity, rates and amounts must be finite nonnegative numbers.");
  }
  if (!product(frame.quantity, frame.unit_cost, frame.extended_cost)) fail2("quantity times rate does not match amount.");
  if (frame.unit_cost !== unitCost || frame.extended_cost !== extendedCost) fail2("stored amounts do not match frozen fields.");
  const r = frame.reinforcement_snapshot;
  if (!plain2(r) || r.version !== 1 || r.calculation_version !== 2 || !text2(r.component_id) || r.engineering_approved !== false || r.procurement_ready !== false) fail2("invalid preliminary provenance.");
  const a = r.amounts, m = r.material;
  if (!plain2(a) || !plain2(m)) fail2("missing amount/material snapshots.");
  if (!plain2(frame.pricing_basis) || frame.pricing_basis.unit !== "ft" || frame.pricing_basis.cost_per_ft !== m.cost_per_ft || frame.pricing_basis.labor_rate_per_hour !== frame.labor_rate_per_hour || !Array.isArray(frame.rate_sources) || frame.rate_sources.some((source) => !plain2(source) || !text2(source.key) || !text2(source.source) || !nonnegative2(source.value))) fail2("invalid rate provenance.");
  for (const key of [
    "geometry_feet",
    "priced_feet",
    "geometry_weight_lbs",
    "priced_weight_lbs",
    "material_cost",
    "labor_cost",
    "labor_hours",
    "steel_cost",
    "connection_count"
  ]) {
    if (!nonnegative2(a[key])) fail2(`invalid ${key}.`);
  }
  if (!positive3(a.geometry_feet) || !positive3(a.geometry_weight_lbs) || !Number.isSafeInteger(a.connection_count)) fail2("invalid geometry/connection quantities.");
  const mapping = {
    physical_quantity_ft: "geometry_feet",
    priced_quantity_ft: "priced_feet",
    geometry_weight_lbs: "geometry_weight_lbs",
    priced_weight_lbs: "priced_weight_lbs",
    connection_count: "connection_count"
  };
  for (const [key, amountKey] of Object.entries(mapping)) {
    if (r[key] !== a[amountKey]) fail2("quantity snapshots disagree.");
  }
  if (m.pricing_unit !== "ft" || !nonnegative2(m.cost_per_ft) || !positive3(m.bar_diameter_inches) || !positive3(m.weight_lb_per_ft)) fail2("unknown material metadata.");
  if (m.kind === "catalog") {
    if (!text2(m.inventory_id)) fail2("missing catalog identity.");
    if (m.cost_per_ft === 0 && (frame.zero_rate_authored !== true || m.rate_source !== "custom_rebar_cost_per_ft")) {
      fail2("catalog zero has no authored provenance.");
    }
  } else if (m.kind === "manual") {
    if (!text2(m.reason) || m.inventory_id !== null && m.inventory_id !== void 0 && m.inventory_id !== "") fail2("invalid manual basis.");
  } else fail2("unsupported material kind.");
  if (a.material_cost + a.labor_cost !== a.steel_cost || !product(a.priced_feet, m.cost_per_ft, a.material_cost) || !product(a.labor_hours, frame.labor_rate_per_hour, a.labor_cost)) fail2("snapshot costs do not reconcile.");
  const supportsSnap = r.supports;
  if (supportMaterial) {
    if (!plain2(supportsSnap) || !plain2(supportsSnap.amounts) || !Array.isArray(supportsSnap.selections)) {
      fail2("missing support snapshot.");
    }
    const sel = supportsSnap.selections[frame.support_selection_index];
    if (!plain2(sel) || frame.quantity !== sel.units_purchased || frame.unit_cost !== sel.unit_cost || frame.extended_cost !== sel.material_cost) fail2("support material amounts do not match the snapshot.");
  } else if (supportLabor) {
    if (!plain2(supportsSnap) || !plain2(supportsSnap.amounts)) fail2("missing support snapshot.");
    if (frame.quantity !== supportsSnap.amounts.support_labor_hours || frame.unit_cost !== frame.labor_rate_per_hour || frame.extended_cost !== supportsSnap.amounts.support_labor_cost) {
      fail2("support labor amounts do not match the snapshot.");
    }
  } else {
    const material = frame.part_type === "material";
    if (frame.quantity !== (material ? a.priced_feet : a.labor_hours) || frame.unit_cost !== (material ? m.cost_per_ft : frame.labor_rate_per_hour) || frame.extended_cost !== (material ? a.material_cost : a.labor_cost)) fail2("role amounts do not match the snapshot.");
  }
}
function captureFoundationReinforcementFrozenPricing(part) {
  if (!plain2(part)) fail2("part must be a plain record.");
  const frame = {
    version: 1,
    state: "recorded",
    part_type: part.part_type,
    part_subtype: typeof part.part_subtype === "string" ? part.part_subtype : null,
    support_selection_index: supportSelectionIndex(part.part_key, part.part_subtype),
    quantity: part.quantity,
    unit: part.unit,
    unit_cost: part.current_unit_cost,
    extended_cost: part.current_extended_cost,
    labor_rate_per_hour: part.calculation_snapshot?.basis?.labor_rate_per_hour,
    pricing_basis: structuredClone(part.calculation_snapshot?.basis),
    rate_sources: structuredClone(part.calculation_snapshot?.rate_sources),
    zero_rate_authored: part.builder_data?.custom_rebar_cost_per_ft === 0,
    reinforcement_snapshot: structuredClone(part.pricing_basis_snapshot?.reinforcement)
  };
  validate(frame, part.current_unit_cost, part.current_extended_cost);
  return frame;
}
function preserveFoundationReinforcementFrozenPricing(part) {
  if (!plain2(part)) fail2("part must be a plain record.");
  const frame = part.pricing_basis_snapshot?.reinforcement_frozen_pricing;
  if (frame === void 0 || frame === null) return { version: 1, state: "unrecorded" };
  validate(frame, part.frozen_unit_cost, part.frozen_extended_cost);
  if (frame.state === "recorded" && frame.part_type !== part.part_type) fail2("stored role does not match part.");
  return structuredClone(frame);
}

// src/components/estimator/builder/partSync.js
var num19 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
var norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
var DIRECT_LIVE_REPRICE_MODULES = /* @__PURE__ */ new Set(["brick_stone", "maintenance"]);
var PENDING_REMOVAL_KEY = "__builder_pending_removal";
var CATALOG_NAME_FIELDS = {
  FoundationInventory: ["material_name"],
  LaborServiceInventory: ["service_name", "vendor_name"],
  ChannelLetterInstallInventory: ["item_name"],
  ChannelLetterInstallEquipment: ["equipment_name"],
  DimensionalLetterMaterial: ["material_name"],
  VinylInventory: ["vinyl_name"],
  VinylMachine: ["machine_name"],
  Inventory: ["material_type", "product_type", "size"],
  BrickStoneInventory: ["material_name"],
  MaintenanceInventory: ["item_name"],
  MaintenanceEquipment: ["equipment_name"]
};
function rowName(entity, row) {
  if (!row) return "";
  const fields = CATALOG_NAME_FIELDS[entity] || ["name"];
  if (entity === "Inventory") {
    return fields.map((field) => row[field]).filter(Boolean).join(" ");
  }
  return fields.map((field) => row[field]).find(Boolean) || "";
}
function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().filter((key) => !["created_by", "created_by_id"].includes(key)).map((key) => [key, stableObject(value[key])])
  );
}
function same(a, b) {
  return JSON.stringify(stableObject(a ?? null)) === JSON.stringify(stableObject(b ?? null));
}
function patchDiffers(record, patch) {
  return Object.entries(patch || {}).some(([key, value]) => !same(record?.[key], value));
}
function pricingSnapshot(row) {
  if (!row || typeof row !== "object") return {};
  const out = {};
  Object.entries(row).forEach(([key, value]) => {
    if (["id", "created_date", "updated_date", "created_by", "created_by_id", "price_history"].includes(key)) return;
    if (/(cost|price|rate|fee|charge|markup|surcharge)/i.test(key) || [
      "pricing_mode",
      "pole_pricing_mode",
      "unit",
      "unit_type",
      "quantity_tiers",
      "minimum_order_yards",
      "minimum_order_quantity",
      "waste_factor_percent",
      "yield_factor"
    ].includes(key)) {
      out[key] = stableObject(value);
    }
  });
  return out;
}
function genericUnitCost(row) {
  if (!row) return 0;
  const preferred = [
    "cost_per_unit",
    "default_rate",
    "cost_per_letter",
    "cost_per_cabinet",
    "cost_per_foot",
    "cost_per_sqft",
    "cost_per_linear_foot",
    "cost_per_roll",
    "cost_per_sheet",
    "cost_per_hour",
    "cost_per_day",
    "cost_flat",
    "pole_stock_price",
    "cap_stock_price"
  ];
  for (const key of preferred) {
    if (Number.isFinite(Number(row[key])) && Number(row[key]) !== 0) return Number(row[key]);
  }
  return 0;
}
function independentPartUnitCost(part, row) {
  if (!row) return num19(part?.current_unit_cost, num19(part?.frozen_unit_cost));
  const entity = part?.inventory_entity || "";
  const mode = part?.pricing_basis_snapshot?.pricing_mode || row.pricing_mode || row.pole_pricing_mode || row.unit_type || "";
  if (entity === "DimensionalLetterMaterial") return num19(row.cost_per_sheet);
  if (entity === "VinylInventory") {
    if (mode === "per_sqft") return num19(row.cost_per_sqft);
    if (mode === "per_linear_foot") return num19(row.cost_per_linear_foot);
    return num19(row.cost_per_roll);
  }
  if (entity === "LaborServiceInventory") return num19(row.default_rate);
  if (entity === "ChannelLetterInstallInventory") {
    if (mode === "per_raceway_foot") return num19(row.cost_per_foot);
    if (mode === "per_project_flat") return num19(row.cost_flat);
    if (mode === "per_letter_by_size") {
      const size = part?.pricing_basis_snapshot?.letter_size || "medium";
      return num19(row[`cost_${size}`], num19(row.cost_medium || row.cost_per_letter));
    }
    return num19(row.cost_per_letter);
  }
  if (entity === "ChannelLetterInstallEquipment") {
    if (mode === "delivery_pickup") return num19(row.delivery_pickup_cost);
    if (mode === "idle_running") return num19(row.idle_running_cost_per_hour);
    if (mode === "per_hour") return num19(row.cost_per_hour);
    if (mode === "per_week") return num19(row.cost_per_week);
    if (mode === "per_month") return num19(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num19(row.cost_flat);
    return num19(row.cost_per_day);
  }
  if (entity === "MaintenanceInventory") {
    const size = part?.pricing_basis_snapshot?.size || "medium";
    if (mode === "per_letter_flat") return num19(row.cost_per_letter);
    if (mode === "per_letter_by_size" || mode === "per_cabinet_by_size") return num19(row[`cost_${size}`]);
    if (mode === "per_cabinet_flat") return num19(row.cost_per_cabinet);
    if (mode === "per_linear_foot") return num19(row.cost_per_foot);
    if (mode === "per_sqft") return num19(row.cost_per_sqft);
    return num19(row.cost_flat);
  }
  if (entity === "MaintenanceEquipment") {
    if (mode === "delivery_pickup") return num19(row.delivery_pickup_cost);
    if (mode === "idle_running") return num19(row.idle_running_cost_per_hour);
    if (mode === "per_hour") return num19(row.cost_per_hour);
    if (mode === "per_week") return num19(row.cost_per_week);
    if (mode === "per_month") return num19(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num19(row.cost_flat);
    return num19(row.cost_per_day);
  }
  if (entity === "FoundationInventory") {
    if (row.material_type === "pole" && mode === "stock_price") return num19(row.pole_stock_price);
    if (row.material_type === "wall_cap") return num19(row.cap_stock_price || row.cost_per_unit);
    if (["excavation_equipment", "attachment", "sub_attachment"].includes(row.material_type)) {
      if (mode === "pickup_delivery") return num19(row.pickup_delivery_cost);
      if (mode === "per_week") return num19(row.cost_per_week);
      if (mode === "per_month") return num19(row.cost_per_month);
      if (mode === "per_hour") return num19(row.cost_per_hour);
      return num19(row.cost_per_day || row.cost_per_unit);
    }
    return num19(row.cost_per_unit);
  }
  return num19(row.cost_per_unit ?? row.default_rate ?? row.cost_flat ?? row.cost_per_sheet, genericUnitCost(row));
}
async function loadCatalog(entity, sort = null, { strict = false } = {}) {
  try {
    return await loadAllEntityRows({
      entity: staffEntities[entity],
      sort: sort || "created_date",
      label: `${entity} catalog`
    });
  } catch (error) {
    if (strict) throw new Error(`${entity} catalog could not be verified: ${error?.message || "read failed"}`);
    return [];
  }
}
async function loadBuilderCatalogs(moduleKey, { strict = false } = {}) {
  const specs = {
    foundation: [
      ["FoundationInventory", "material_name"],
      ["LaborServiceInventory", "service_name"]
    ],
    channel_letters: [
      ["ChannelLetterInstallInventory", "sort_order"],
      ["ChannelLetterInstallEquipment", "sort_order"],
      ["DimensionalLetterMaterial", "sort_order"]
    ],
    vinyl: [
      ["VinylInventory", "vinyl_name"],
      ["VinylMachine", "sort_order"],
      ["LaborServiceInventory", "service_name"],
      ["ChannelLetterInstallEquipment", "sort_order"]
    ],
    metal: [["Inventory", "material_type"]],
    brick_stone: [
      ["FoundationInventory", "material_name"],
      ["BrickStoneInventory", "material_name"]
    ],
    maintenance: [
      ["MaintenanceInventory", "sort_order"],
      ["SignLightingInventory", "sort_order"],
      ["SignHardwareInventory", "sort_order"],
      ["SignPartsSuppliesInventory", "sort_order"],
      ["DimensionalLetterMaterial", "sort_order"],
      ["VinylInventory", "sort_order"],
      ["ChannelLetterInstallInventory", "sort_order"],
      ["FoundationInventory", "material_name"],
      ["ChannelLetterInstallEquipment", "sort_order"],
      // Legacy compatibility only. New Maintenance selections use the shared
      // Master Inventory equipment catalog above.
      ["MaintenanceEquipment", "sort_order"],
      ["MaintenanceActionRate", null],
      ["Settings", null]
    ]
  };
  const requested = specs[moduleKey] || [];
  const loaded = await Promise.all(
    requested.map(async ([entity, sort]) => [entity, await loadCatalog(entity, sort, { strict })])
  );
  const catalogs = {};
  loaded.forEach(([entity, rows]) => {
    const filtered = entity === "LaborServiceInventory" && moduleKey === "foundation" ? rows.filter((row) => row.service_category === "concrete_service") : rows;
    catalogs[entity] = {
      rows: filtered,
      byId: new Map(filtered.map((row) => [row.id, row]))
    };
  });
  return catalogs;
}
async function loadVerifiedBuilderPartSyncInputs({ builderProduct = null, moduleKey = "" } = {}) {
  const [catalogs, existingParts] = await Promise.all([
    loadBuilderCatalogs(moduleKey || builderProduct?.module_key || "", { strict: true }),
    builderProduct?.id ? loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProduct.id }, sort: "sort_order", label: "Builder Parts" }) : Promise.resolve([])
  ]);
  const inventoryRowsOverride = /* @__PURE__ */ new Map();
  for (const part of existingParts || []) {
    if (part.builder_sync_state !== "manual_addon" || !part.inventory_entity || !part.inventory_item_id || part.manual_cost_override) continue;
    let row;
    try {
      row = await staffEntities[part.inventory_entity].get(part.inventory_item_id);
    } catch (error) {
      throw new Error(`${part.inventory_entity} inventory could not be verified for Part \u201C${part.part_name || "Part"}\u201D: ${error?.message || "read failed"}`);
    }
    inventoryRowsOverride.set(`${part.inventory_entity}:${part.inventory_item_id}`, row || null);
  }
  return { catalogs, existingParts: existingParts || [], inventoryRowsOverride };
}
function findRow(catalogs, entity, id) {
  if (!id) return null;
  if (entity && catalogs[entity]?.byId.has(id)) return catalogs[entity].byId.get(id);
  for (const catalog of Object.values(catalogs)) {
    if (catalog.byId.has(id)) return catalog.byId.get(id);
  }
  return null;
}
function findEntity(catalogs, id, preferred = "") {
  if (!id) return preferred;
  if (preferred && catalogs[preferred]?.byId.has(id)) return preferred;
  return Object.entries(catalogs).find(([, catalog]) => catalog.byId.has(id))?.[0] || preferred;
}
function findNameCandidate(catalogs, entity, name) {
  const target = norm(name);
  if (!target || !catalogs[entity]) return null;
  return catalogs[entity].rows.find((row) => norm(rowName(entity, row)) === target) || null;
}
function makePart({
  key,
  name,
  type = "material",
  subtype = "",
  sourcePath = "",
  entity = "",
  inventoryId = "",
  quantity = 1,
  unit = "",
  unitCost = 0,
  extendedCost = 0,
  builderData = {},
  calculation = {},
  pricingBasis = {}
}) {
  return {
    part_key: key,
    part_name: name || type || "Part",
    part_type: type,
    part_subtype: subtype,
    source_path: sourcePath,
    inventory_entity: entity,
    inventory_item_id: inventoryId || "",
    quantity: num19(quantity, 1),
    unit,
    unit_cost: num19(unitCost),
    extended_cost: num19(extendedCost),
    builder_data: builderData || {},
    calculation_snapshot: calculation || {},
    pricing_basis_snapshot: pricingBasis || {}
  };
}
function extractChannel(project) {
  const parts = [];
  const hasNumber = (value) => value !== null && value !== void 0 && Number.isFinite(Number(value));
  const itemLabel = (item, fallback) => item?.description?.trim() || fallback;
  (project.items || []).forEach((item, itemIndex) => {
    (item.materials || []).forEach((mat, matIndex) => {
      const id = mat.inventory_item_id || mat.inventory_id || "";
      parts.push(makePart({
        key: `channel:item:${itemIndex}:material:${matIndex}`,
        name: mat.item_name || "Install material",
        type: "material",
        subtype: mat.pricing_mode || "install_material",
        sourcePath: mat.inventory_item_id ? `items[${itemIndex}].materials[${matIndex}].inventory_item_id` : `items[${itemIndex}].materials[${matIndex}].inventory_id`,
        entity: "ChannelLetterInstallInventory",
        inventoryId: id,
        quantity: mat.quantity,
        unit: mat.pricing_mode || "",
        unitCost: mat.unit_cost,
        extendedCost: mat.total_cost,
        builderData: { parent_item: item.description, installation_type: item.installation_type, letter_size: item.letter_size, qty_letters: item.qty_letters },
        calculation: mat,
        pricingBasis: { pricing_mode: mat.pricing_mode, letter_size: item.letter_size, installation_type: item.installation_type }
      }));
    });
  });
  const personnelRowsTotal = (project.personnel || []).reduce(
    (sum, person) => sum + num19(person.total_cost, num19(person.hourly_rate) * num19(person.hours)),
    0
  );
  const personnelTotal = hasNumber(project.total_personnel_cost) ? num19(project.total_personnel_cost) : personnelRowsTotal;
  const installLaborInSubtotal = hasNumber(project.labor_cost_in_subtotal) ? num19(project.labor_cost_in_subtotal) : personnelTotal > 5e-3 ? 0 : num19(project.labor_cost, (project.items || []).reduce((sum, item) => sum + num19(item.labor_cost), 0));
  if (Math.abs(installLaborInSubtotal) > 5e-3) {
    let representedLabor = 0;
    (project.items || []).forEach((item, index) => {
      const cost = num19(item.labor_cost);
      if (Math.abs(cost) <= 5e-3) return;
      representedLabor += cost;
      parts.push(manualCostPart({
        key: `channel:item:${index}:labor`,
        name: `${itemLabel(item, `Install Item ${index + 1}`)} \u2014 Installation Labor`,
        type: "labor",
        subtype: "installation_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: item,
        calculation: { labor_hours: item.labor_hours, labor_cost: item.labor_cost, installation_type: item.installation_type }
      }));
    });
    const laborResidual = installLaborInSubtotal - representedLabor;
    if (Math.abs(laborResidual) > 5e-3) {
      parts.push(manualCostPart({
        key: "channel:install-labor:reconciliation",
        name: "Installation Labor \u2014 Saved Cost Adjustment",
        type: "labor",
        subtype: "installation_labor_adjustment",
        sourcePath: "labor_cost_in_subtotal",
        cost: laborResidual,
        calculation: { authoritative_total: installLaborInSubtotal, represented_total: representedLabor }
      }));
    }
  }
  (project.selected_equipment || []).forEach((eq, index) => {
    const duration = Math.max(num19(eq.duration, 1), 0);
    const baseCost = num19(eq.unit_cost) * duration;
    const owned = eq.ownership === "owned" || eq.pricing_mode === "owned_flat";
    const deliveryCost = !owned && eq.include_delivery ? num19(eq.delivery_pickup_cost) : 0;
    const idleCost = hasNumber(eq.idle_cost) ? num19(eq.idle_cost) : num19(eq.idle_hours) * num19(eq.idle_running_cost_per_hour);
    const total = num19(eq.total_cost, baseCost + deliveryCost + idleCost);
    let represented = 0;
    if (Math.abs(baseCost) > 5e-3 || eq.equipment_id) {
      parts.push(makePart({
        key: `channel:equipment:${index}:base`,
        name: eq.equipment_name || "Install equipment",
        type: "equipment",
        subtype: eq.equipment_type || eq.pricing_mode || "equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: "ChannelLetterInstallEquipment",
        inventoryId: eq.equipment_id,
        quantity: duration || 1,
        unit: eq.pricing_mode || "unit",
        unitCost: eq.unit_cost,
        extendedCost: baseCost,
        builderData: eq,
        calculation: { duration, unit_cost: eq.unit_cost, base_cost: baseCost },
        pricingBasis: { pricing_mode: eq.pricing_mode }
      }));
      represented += baseCost;
    }
    if (Math.abs(deliveryCost) > 5e-3) {
      parts.push(makePart({
        key: `channel:equipment:${index}:delivery`,
        name: `${eq.equipment_name || "Install Equipment"} \u2014 Delivery / Pickup`,
        type: "service",
        subtype: "equipment_delivery",
        sourcePath: `selected_equipment[${index}].include_delivery`,
        entity: "ChannelLetterInstallEquipment",
        inventoryId: eq.equipment_id,
        quantity: 1,
        unit: "delivery",
        unitCost: deliveryCost,
        extendedCost: deliveryCost,
        builderData: eq,
        calculation: { include_delivery: eq.include_delivery, delivery_pickup_cost: deliveryCost },
        pricingBasis: { pricing_mode: "delivery_pickup" }
      }));
      represented += deliveryCost;
    }
    if (Math.abs(idleCost) > 5e-3) {
      parts.push(makePart({
        key: `channel:equipment:${index}:idle`,
        name: `${eq.equipment_name || "Install Equipment"} \u2014 Idle Running`,
        type: "equipment",
        subtype: "idle_running",
        sourcePath: `selected_equipment[${index}].idle_hours`,
        entity: "ChannelLetterInstallEquipment",
        inventoryId: eq.equipment_id,
        quantity: eq.idle_hours || 1,
        unit: "hour",
        unitCost: eq.idle_running_cost_per_hour,
        extendedCost: idleCost,
        builderData: eq,
        calculation: { idle_hours: eq.idle_hours, idle_running_cost_per_hour: eq.idle_running_cost_per_hour, idle_cost: idleCost },
        pricingBasis: { pricing_mode: "idle_running" }
      }));
      represented += idleCost;
    }
    const residual = total - represented;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: `channel:equipment:${index}:saved-adjustment`,
        name: `${eq.equipment_name || "Install Equipment"} \u2014 Saved Cost Adjustment`,
        type: "equipment",
        subtype: "equipment_adjustment",
        sourcePath: `selected_equipment[${index}].total_cost`,
        cost: residual,
        builderData: eq,
        calculation: { authoritative_total: total, represented_total: represented }
      }));
    }
  });
  if (personnelTotal > 5e-3 || (project.personnel || []).some((person) => num19(person.total_cost) > 5e-3)) {
    let representedPersonnel = 0;
    (project.personnel || []).forEach((person, index) => {
      const cost = num19(person.total_cost, num19(person.hourly_rate) * num19(person.hours));
      if (Math.abs(cost) <= 5e-3) return;
      representedPersonnel += cost;
      parts.push(manualCostPart({
        key: `channel:personnel:${index}`,
        name: person.name?.trim() || person.role || `Installer ${index + 1}`,
        type: "labor",
        subtype: person.role || "personnel",
        sourcePath: `personnel[${index}]`,
        cost,
        quantity: person.hours || 1,
        unit: person.hours ? "hour" : "job",
        builderData: person,
        calculation: person
      }));
    });
    const residual = personnelTotal - representedPersonnel;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: "channel:personnel:reconciliation",
        name: "Crew Labor \u2014 Saved Cost Adjustment",
        type: "labor",
        subtype: "personnel_adjustment",
        sourcePath: "total_personnel_cost",
        cost: residual,
        calculation: { authoritative_total: personnelTotal, represented_total: representedPersonnel }
      }));
    }
  }
  const pushFabBreakdown = ({ purchase, index, fab, total, prefix, label, materialSourcePath }) => {
    if (!fab) return 0;
    const qty = Math.max(num19(purchase.qty, 1), 0);
    const materialCost = num19(fab.unit_material_cost) * qty;
    const cutCost = num19(fab.unit_cut_cost) * qty;
    const paintCost = num19(fab.unit_paint_cost) * qty;
    let represented = 0;
    if (Math.abs(materialCost) > 5e-3 || fab.material_id) {
      const materialRate = num19(fab.material_cost_per_sqin);
      const materialSqinPerUnit = materialRate > 0 ? num19(fab.unit_material_cost) / materialRate : num19(purchase.size_value) * 144;
      const materialQty = materialSqinPerUnit > 0 ? materialSqinPerUnit * qty : qty || 1;
      parts.push(makePart({
        key: `${prefix}:material`,
        name: `${label} \u2014 ${fab.material_name || "Material"}`,
        type: "material",
        subtype: "dimensional_material",
        sourcePath: materialSourcePath,
        entity: "DimensionalLetterMaterial",
        inventoryId: fab.material_id || "",
        quantity: materialQty,
        unit: materialSqinPerUnit > 0 ? "sqin" : "unit",
        unitCost: materialSqinPerUnit > 0 ? materialRate : num19(fab.unit_material_cost),
        extendedCost: materialCost,
        builderData: purchase,
        calculation: fab,
        pricingBasis: {
          pricing_mode: "sheet_yield",
          material_cost_per_sqin: fab.material_cost_per_sqin,
          sheet_yield_factor: fab.sheet_yield_factor,
          material_thickness_inches: fab.material_thickness_inches
        }
      }));
      represented += materialCost;
    }
    if (Math.abs(cutCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:cutting`,
        name: `${label} \u2014 ${fab.cutting_method === "laser" ? "Laser" : "CNC"} Cutting`,
        type: "fabrication",
        subtype: fab.cutting_method === "laser" ? "laser_cutting" : "cnc_cutting",
        sourcePath: `${prefix.includes("backer") ? `letter_purchases[${index}].backer_fab_config` : `letter_purchases[${index}].fab_config`}.unit_cut_cost`,
        cost: cutCost,
        quantity: qty || 1,
        unit: "unit",
        builderData: purchase,
        calculation: fab
      }));
      represented += cutCost;
    }
    if (Math.abs(paintCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:paint`,
        name: `${label} \u2014 Paint`,
        type: "finishing",
        subtype: "paint",
        sourcePath: `${prefix.includes("backer") ? `letter_purchases[${index}].backer_fab_config` : `letter_purchases[${index}].fab_config`}.unit_paint_cost`,
        cost: paintCost,
        quantity: qty || 1,
        unit: "unit",
        builderData: purchase,
        calculation: fab
      }));
      represented += paintCost;
    }
    const residual = num19(total) - represented;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:adjustment`,
        name: `${label} \u2014 Price Override / Saved Adjustment`,
        type: "pricing",
        subtype: "fab_price_adjustment",
        sourcePath: prefix.includes("backer") ? `letter_purchases[${index}].backer_total` : `letter_purchases[${index}].letters_total`,
        cost: residual,
        builderData: purchase,
        calculation: { authoritative_total: total, represented_total: represented, unit_cost_override: purchase.unit_cost_override }
      }));
      represented += residual;
    }
    return represented;
  };
  (project.letter_purchases || []).forEach((purchase, index) => {
    const qty = Math.max(num19(purchase.qty, 1), 0);
    const purchaseTotal = hasNumber(purchase.total_cost) ? num19(purchase.total_cost) : num19(purchase.line_total);
    const racewayTotal = num19(purchase.raceway_total);
    const backerTotal = num19(purchase.backer_total);
    const lettersTotal = hasNumber(purchase.letters_total) ? num19(purchase.letters_total) : purchaseTotal - racewayTotal - backerTotal;
    const prefix = `channel:letters:${purchase.id || index}`;
    const label = purchase.description?.trim() || purchase.letter_type || `Letter Purchase ${index + 1}`;
    let representedPurchase = 0;
    if (purchase.letter_type === "dimensional_letters" && purchase.fab_config) {
      representedPurchase += pushFabBreakdown({
        purchase,
        index,
        fab: purchase.fab_config,
        total: lettersTotal,
        prefix: `${prefix}:fab`,
        label,
        materialSourcePath: `letter_purchases[${index}].fab_config.material_id`
      });
    } else if (Math.abs(lettersTotal) > 5e-3) {
      const size = Math.max(num19(purchase.size_value), 0);
      const effectiveQty = size > 0 ? size * Math.max(qty, 1) : Math.max(qty, 1);
      const unit = purchase.letter_type === "raceway" ? "ft" : purchase.letter_type === "capsule_logo_pillbox" ? "sqft" : purchase.letter_type?.startsWith("channel_") ? "letter-inch" : "unit";
      parts.push(manualCostPart({
        key: `${prefix}:letters`,
        name: label,
        type: "material",
        subtype: purchase.letter_type || "letter_purchase",
        sourcePath: `letter_purchases[${index}].letters_total`,
        cost: lettersTotal,
        quantity: effectiveQty,
        unit,
        builderData: purchase,
        calculation: { unit_cost: purchase.unit_cost, size_value: purchase.size_value, qty: purchase.qty, letters_total: lettersTotal }
      }));
      representedPurchase += lettersTotal;
    }
    if (Math.abs(racewayTotal) > 5e-3) {
      const racewayQty = Math.max(num19(purchase.raceway_qty, 1), 1);
      const racewayLength = Math.max(num19(purchase.raceway_length_feet), 0);
      const effectiveQty = racewayLength > 0 ? racewayLength * racewayQty : racewayQty;
      parts.push(manualCostPart({
        key: `${prefix}:raceway`,
        name: `${label} \u2014 Raceway`,
        type: "material",
        subtype: "raceway_purchase",
        sourcePath: `letter_purchases[${index}].raceway_total`,
        cost: racewayTotal,
        quantity: effectiveQty,
        unit: racewayLength > 0 ? "ft" : "unit",
        builderData: purchase,
        calculation: { raceway_length_feet: purchase.raceway_length_feet, raceway_qty: purchase.raceway_qty, raceway_unit_cost: purchase.raceway_unit_cost, raceway_total: racewayTotal }
      }));
      representedPurchase += racewayTotal;
    }
    if (Math.abs(backerTotal) > 5e-3) {
      if (purchase.backer_fab_config) {
        representedPurchase += pushFabBreakdown({
          purchase,
          index,
          fab: purchase.backer_fab_config,
          total: backerTotal,
          prefix: `${prefix}:backer`,
          label: `${label} \u2014 Backer`,
          materialSourcePath: `letter_purchases[${index}].backer_fab_config.material_id`
        });
      } else {
        parts.push(manualCostPart({
          key: `${prefix}:backer`,
          name: `${label} \u2014 Backer`,
          type: "fabrication",
          subtype: "backer",
          sourcePath: `letter_purchases[${index}].backer_total`,
          cost: backerTotal,
          quantity: qty || 1,
          unit: "unit",
          builderData: purchase,
          calculation: { backer_total: backerTotal }
        }));
        representedPurchase += backerTotal;
      }
    }
    const purchaseResidual = purchaseTotal - representedPurchase;
    if (Math.abs(purchaseResidual) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:reconciliation`,
        name: `${label} \u2014 Saved Cost Adjustment`,
        type: "pricing",
        subtype: "letter_purchase_adjustment",
        sourcePath: `letter_purchases[${index}].total_cost`,
        cost: purchaseResidual,
        builderData: purchase,
        calculation: { authoritative_total: purchaseTotal, represented_total: representedPurchase }
      }));
    }
  });
  const purchases = project.letter_purchases || [];
  const onlyDimensional = purchases.length > 0 && purchases.every((purchase) => purchase.letter_type === "dimensional_letters");
  const letterFees = [
    ["delivery", "Letter Delivery / Freight", onlyDimensional ? 0 : project.letters_delivery_fee],
    ["design", "Letter Design", project.letters_design_fee],
    ["install-supplies", "Letter Install Supplies", project.letters_install_supplies_fee],
    ["permitting", "Letter Permitting", project.letters_permitting_fee],
    ["other", "Other Letter Cost", project.letters_other_fee]
  ];
  letterFees.forEach(([key, name, cost]) => {
    if (Math.abs(num19(cost)) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `channel:letter-fee:${key}`,
      name,
      type: key === "permitting" ? "permit" : "service",
      subtype: `letter_${key}`,
      sourcePath: `letters_${key.replaceAll("-", "_")}_fee`,
      cost
    }));
  });
  const letterMarkup = num19(project.total_letters_cost) - num19(project.letters_subtotal);
  if (Math.abs(letterMarkup) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:letters-markup",
      name: "Letter Purchase Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "letters_markup_percent",
      cost: letterMarkup,
      calculation: { markup_percent: project.letters_markup_percent, markup_amount: letterMarkup }
    }));
  }
  if (Math.abs(num19(project.total_supplies_cost)) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:install-supplies",
      name: "Installation Consumables / Supplies",
      type: "consumable",
      subtype: "installation_supplies",
      sourcePath: "total_supplies_cost",
      cost: project.total_supplies_cost,
      calculation: { supplies_percent: project.supplies_percent_of_materials, extra_supplies_cost: project.extra_supplies_cost }
    }));
  }
  if (Math.abs(num19(project.total_travel_cost)) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:travel",
      name: "Travel / Fuel / Travel Labor",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: project.total_travel_cost,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "round_trip_mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, accepted_total: project.total_travel_cost }
    }));
  }
  if (Math.abs(num19(project.markup_amount)) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:project-markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: project.markup_amount,
      calculation: { markup_percent: project.markup_percent, markup_amount: project.markup_amount }
    }));
  }
  const authoritativeTotal = num19(project.total_cost);
  const representedTotal = parts.reduce((sum, part) => sum + num19(part.extended_cost), 0);
  const finalResidual = authoritativeTotal - representedTotal;
  if (Math.abs(finalResidual) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:saved-total-reconciliation",
      name: "Channel / Dimensional \u2014 Saved Total Adjustment",
      type: "pricing",
      subtype: "saved_total_adjustment",
      sourcePath: "total_cost",
      cost: finalResidual,
      calculation: { authoritative_total: authoritativeTotal, represented_total: representedTotal }
    }));
  }
  return parts;
}
function extractVinylLegacy(project) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    if (item.vinyl_id) {
      parts.push(makePart({
        key: `vinyl:item:${index}:vinyl`,
        name: item.description ? `${item.description} \u2014 Vinyl` : "Vinyl",
        type: "material",
        subtype: "vinyl",
        sourcePath: `items[${index}].vinyl_id`,
        entity: "VinylInventory",
        inventoryId: item.vinyl_id,
        quantity: item.vinyl_sqft || item.quantity || 1,
        unit: "sqft",
        unitCost: item.vinyl_sqft ? num19(item.vinyl_cost) / num19(item.vinyl_sqft, 1) : 0,
        extendedCost: item.vinyl_cost,
        builderData: item,
        calculation: { sqft: item.vinyl_sqft, cost: item.vinyl_cost }
      }));
    }
    if (item.laminate_id) {
      parts.push(makePart({
        key: `vinyl:item:${index}:laminate`,
        name: item.description ? `${item.description} \u2014 Laminate` : "Laminate",
        type: "material",
        subtype: "laminate",
        sourcePath: `items[${index}].laminate_id`,
        entity: "VinylInventory",
        inventoryId: item.laminate_id,
        quantity: item.laminate_sqft || item.quantity || 1,
        unit: "sqft",
        unitCost: item.laminate_sqft ? num19(item.laminate_cost) / num19(item.laminate_sqft, 1) : 0,
        extendedCost: item.laminate_cost,
        builderData: item,
        calculation: { sqft: item.laminate_sqft, cost: item.laminate_cost }
      }));
    }
  });
  [
    ["printer_id", "Printer"],
    ["cutter_id", "Cutter"],
    ["laminator_id", "Laminator"]
  ].forEach(([field, label]) => {
    if (!project[field]) return;
    parts.push(makePart({
      key: `vinyl:machine:${field}`,
      name: label,
      type: "equipment",
      subtype: field.replace("_id", ""),
      sourcePath: field,
      entity: "VinylMachine",
      inventoryId: project[field],
      quantity: 1,
      builderData: { machine_id: project[field] }
    }));
  });
  (project.items || []).forEach((item, index) => {
    if (num19(item.print_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `vinyl:item:${index}:print`,
        name: item.description ? `${item.description} \u2014 Printing / Ink` : "Printing / Ink",
        type: "consumable",
        subtype: "printing",
        sourcePath: `items[${index}].print_cost`,
        cost: item.print_cost,
        quantity: item.print_sqft || 1,
        unit: item.print_sqft ? "sqft" : "job",
        builderData: item,
        calculation: { print_sqft: item.print_sqft, print_cost: item.print_cost, rate: project.print_cost_per_sqft }
      }));
    }
    if (num19(item.labor_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `vinyl:item:${index}:labor`,
        name: item.description ? `${item.description} \u2014 Production Labor` : "Vinyl Production Labor",
        type: "labor",
        subtype: "production_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: item,
        calculation: { labor_hours: item.labor_hours, labor_cost: item.labor_cost, rate: project.labor_rate_per_hour }
      }));
    }
  });
  if (num19(project.total_supplies_cost) > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:supplies",
      name: "Vinyl Production Supplies",
      type: "consumable",
      subtype: "production_supplies",
      sourcePath: "total_supplies_cost",
      cost: project.total_supplies_cost,
      calculation: { supplies_percent: project.supplies_percent_of_materials }
    }));
  }
  if (num19(project.markup_amount) > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: project.markup_amount,
      calculation: { markup_percent: project.markup_percent, markup_amount: project.markup_amount }
    }));
  }
  return parts;
}
function extractVinyl(project, catalogs = {}, options = {}) {
  const workflows = Array.isArray(project.workflows) ? project.workflows : [];
  if (!workflows.length) return extractVinylLegacy(project);
  const parts = [];
  let workflowMaterialTotal = 0;
  let workflowMachineTotal = 0;
  let workflowLaborTotal = 0;
  const addLinkedCost = ({
    key,
    name,
    type = "material",
    subtype = "",
    sourcePath = "",
    entity = "",
    inventoryId = "",
    quantity = 1,
    unit = "job",
    cost = 0,
    builderData = {},
    calculation = {},
    pricingBasis = {},
    includeZero = false
  }) => {
    const extended = num19(cost);
    if (!includeZero && Math.abs(extended) <= 5e-3) return;
    const qty = Math.max(num19(quantity, 1), 1e-6);
    parts.push(makePart({
      key,
      name,
      type,
      subtype,
      sourcePath,
      entity,
      inventoryId,
      quantity: qty,
      unit,
      unitCost: extended / qty,
      extendedCost: extended,
      builderData,
      calculation,
      pricingBasis
    }));
  };
  const laborInventoryFor = (row = {}) => {
    const savedId = row.inventory_id || row.labor_service_id || "";
    if (savedId) {
      const saved = findRow(catalogs, "LaborServiceInventory", savedId);
      if (saved) return saved;
    }
    return findNameCandidate(catalogs, "LaborServiceInventory", row.role || row.name || "");
  };
  workflows.forEach((workflow, workflowIndex) => {
    const prefix = `vinyl:workflow:${workflowIndex}`;
    const workflowName = workflow.name || `Workflow ${workflowIndex + 1}`;
    const printer = findRow(catalogs, "VinylMachine", workflow.printer_id);
    const cutter = findRow(catalogs, "VinylMachine", workflow.cutter_id);
    const laminator = findRow(catalogs, "VinylMachine", workflow.laminator_id);
    const vinyl = findRow(catalogs, "VinylInventory", workflow.vinyl_id);
    const laminate = findRow(catalogs, "VinylInventory", workflow.laminate_id);
    const transferTape = findRow(catalogs, "VinylInventory", workflow.transfer_tape_id);
    const operatorRate = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate ?? 45;
    const calc = workflow._calc && Number.isFinite(Number(workflow._calc.totalCost)) ? workflow._calc : calculateVinylProject({
      items: workflow.items || [],
      printer,
      cutter,
      laminator,
      vinyl,
      laminate,
      transferTape,
      operatorHourlyRate: operatorRate,
      applyPrint: !!workflow.apply_print,
      applyCut: !!workflow.apply_cut,
      applyLaminate: !!workflow.apply_laminate,
      applyTransferTape: !!workflow.apply_transfer_tape,
      overrideGutterH: workflow.gutter_h_override === "" || workflow.gutter_h_override == null ? void 0 : num19(workflow.gutter_h_override),
      overrideGutterV: workflow.gutter_v_override === "" || workflow.gutter_v_override == null ? void 0 : num19(workflow.gutter_v_override),
      printQuality: workflow.print_quality || printer?.default_print_quality || "high_quality",
      weedingDifficulty: workflow.weeding_difficulty || "moderate",
      weedingMinutesPerPartOverride: workflow.weeding_minutes_per_part_override,
      installMinutesPerPart: workflow.install_minutes_per_part,
      personnel: workflow.personnel || [],
      spoilageBufferPercent: num19(workflow.spoilage_buffer_percent),
      setupFeeFloor: num19(workflow.setup_fee_floor)
    });
    workflowMaterialTotal += num19(calc.materialCost);
    workflowMachineTotal += num19(calc.machineCost);
    workflowLaborTotal += num19(calc.laborCost);
    if (workflow.vinyl_id) {
      addLinkedCost({
        key: `${prefix}:vinyl`,
        name: `${workflowName} \u2014 Vinyl`,
        type: "material",
        subtype: "vinyl",
        sourcePath: `workflows[${workflowIndex}].vinyl_id`,
        entity: "VinylInventory",
        inventoryId: workflow.vinyl_id,
        quantity: calc.totalRollSqFtPulled || 1,
        unit: "sqft",
        cost: calc.vinylCost,
        includeZero: true,
        builderData: workflow,
        calculation: { total_roll_sqft_pulled: calc.totalRollSqFtPulled, used_sqft: calc.usedSqFt, wasted_sqft: calc.wastedSqFt, vinyl_cost: calc.vinylCost }
      });
    }
    if (workflow.apply_laminate && workflow.laminate_id) {
      addLinkedCost({
        key: `${prefix}:laminate`,
        name: `${workflowName} \u2014 Laminate`,
        type: "material",
        subtype: "laminate",
        sourcePath: `workflows[${workflowIndex}].laminate_id`,
        entity: "VinylInventory",
        inventoryId: workflow.laminate_id,
        quantity: calc.laminateSqFt || 1,
        unit: "sqft",
        cost: calc.laminateCost,
        includeZero: true,
        builderData: workflow,
        calculation: { laminate_sqft: calc.laminateSqFt, laminate_cost: calc.laminateCost }
      });
    }
    if (workflow.apply_transfer_tape && workflow.transfer_tape_id) {
      addLinkedCost({
        key: `${prefix}:transfer-tape`,
        name: `${workflowName} \u2014 Transfer Tape`,
        type: "material",
        subtype: "transfer_tape",
        sourcePath: `workflows[${workflowIndex}].transfer_tape_id`,
        entity: "VinylInventory",
        inventoryId: workflow.transfer_tape_id,
        quantity: calc.transferTapeSqFt || 1,
        unit: "sqft",
        cost: calc.transferTapeCost,
        includeZero: true,
        builderData: workflow,
        calculation: { transfer_tape_sqft: calc.transferTapeSqFt, transfer_tape_cost: calc.transferTapeCost }
      });
    }
    if (workflow.apply_print && workflow.printer_id) {
      addLinkedCost({
        key: `${prefix}:ink`,
        name: `${workflowName} \u2014 Ink`,
        type: "consumable",
        subtype: "ink",
        sourcePath: `workflows[${workflowIndex}].printer_id`,
        entity: "VinylMachine",
        inventoryId: workflow.printer_id,
        quantity: calc.usedSqFt || 1,
        unit: "sqft",
        cost: calc.inkCost,
        builderData: workflow,
        calculation: { used_sqft: calc.usedSqFt, ink_rate_per_sqin: calc.inkRatePerSqIn, print_quality: calc.printQuality, ink_cost: calc.inkCost }
      });
      addLinkedCost({
        key: `${prefix}:printer-machine`,
        name: `${workflowName} \u2014 Printer Time`,
        type: "equipment",
        subtype: "printer",
        sourcePath: `workflows[${workflowIndex}].printer_id`,
        entity: "VinylMachine",
        inventoryId: workflow.printer_id,
        quantity: num19(calc.printMinutes) / 60 || 1,
        unit: num19(calc.printMinutes) > 0 ? "hour" : "job",
        cost: calc.printMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { print_minutes: calc.printMinutes, print_machine_cost: calc.printMachineCost }
      });
    }
    if (workflow.apply_cut && workflow.cutter_id) {
      addLinkedCost({
        key: `${prefix}:blade`,
        name: `${workflowName} \u2014 Blade Wear`,
        type: "consumable",
        subtype: "blade_wear",
        sourcePath: `workflows[${workflowIndex}].cutter_id`,
        entity: "VinylMachine",
        inventoryId: workflow.cutter_id,
        quantity: num19(calc.cutMinutes) || 1,
        unit: num19(calc.cutMinutes) > 0 ? "minute" : "job",
        cost: calc.bladeCost,
        builderData: workflow,
        calculation: { cut_minutes: calc.cutMinutes, cut_distance_inches: calc.cutDistanceIn, blade_cost: calc.bladeCost }
      });
      addLinkedCost({
        key: `${prefix}:cutter-machine`,
        name: `${workflowName} \u2014 Cutter Time`,
        type: "equipment",
        subtype: "cutter",
        sourcePath: `workflows[${workflowIndex}].cutter_id`,
        entity: "VinylMachine",
        inventoryId: workflow.cutter_id,
        quantity: num19(calc.cutMinutes) / 60 || 1,
        unit: num19(calc.cutMinutes) > 0 ? "hour" : "job",
        cost: calc.cutMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { cut_minutes: calc.cutMinutes, cut_machine_cost: calc.cutMachineCost }
      });
    }
    if (workflow.apply_laminate && workflow.laminator_id) {
      addLinkedCost({
        key: `${prefix}:laminator-machine`,
        name: `${workflowName} \u2014 Laminator Time`,
        type: "equipment",
        subtype: "laminator",
        sourcePath: `workflows[${workflowIndex}].laminator_id`,
        entity: "VinylMachine",
        inventoryId: workflow.laminator_id,
        quantity: num19(calc.laminateMinutes) / 60 || 1,
        unit: num19(calc.laminateMinutes) > 0 ? "hour" : "job",
        cost: calc.laminateMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { laminate_minutes: calc.laminateMinutes, laminate_machine_cost: calc.laminateMachineCost }
      });
    }
    let workflowPersonnelTotal = 0;
    (workflow.personnel || []).forEach((person, personIndex) => {
      const personCost = num19(person.total_cost, num19(person.hourly_rate) * num19(person.hours));
      if (Math.abs(personCost) <= 5e-3) return;
      workflowPersonnelTotal += personCost;
      const inventoryRow = laborInventoryFor(person);
      addLinkedCost({
        key: `${prefix}:personnel:${personIndex}`,
        name: `${workflowName} \u2014 ${person.role || person.name || "Production Labor"}`,
        type: "labor",
        subtype: "workflow_personnel",
        sourcePath: `workflows[${workflowIndex}].personnel[${personIndex}].inventory_id`,
        entity: inventoryRow ? "LaborServiceInventory" : "",
        inventoryId: person.inventory_id || inventoryRow?.id || "",
        quantity: person.hours || 1,
        unit: person.hours ? "hour" : "job",
        cost: personCost,
        builderData: person,
        calculation: { role: person.role, hourly_rate: person.hourly_rate, hours: person.hours, total_cost: personCost }
      });
    });
    const laborResidual = num19(calc.laborCost) - workflowPersonnelTotal;
    if (laborResidual > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:labor`,
        name: `${workflowName} \u2014 Production Labor`,
        type: "labor",
        subtype: "production_labor",
        sourcePath: `workflows[${workflowIndex}]`,
        cost: laborResidual,
        quantity: calc.laborHours || 1,
        unit: calc.laborHours ? "hour" : "job",
        builderData: workflow,
        calculation: { labor_hours: calc.laborHours, labor_cost: calc.laborCost, residual_cost: laborResidual }
      }));
    }
    if (num19(calc.setupFeeApplied) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:setup-floor`,
        name: `${workflowName} \u2014 Setup Fee Floor (Not Billed by Source)`,
        type: "service",
        subtype: "setup_fee_floor_source_metric",
        sourcePath: `workflows[${workflowIndex}].setup_fee_floor`,
        cost: 0,
        builderData: workflow,
        calculation: { setup_fee_floor: workflow.setup_fee_floor, pre_floor_total: calc.preFloorTotal, setup_fee_applied: calc.setupFeeApplied, source_rollup_billed: false }
      }));
    }
  });
  const baseSupplies = workflowMaterialTotal * (num19(project.supplies_percent_of_materials) / 100);
  if (baseSupplies > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:base-supplies",
      name: "Vinyl Production Supplies",
      type: "consumable",
      subtype: "production_supplies",
      sourcePath: "supplies_percent_of_materials",
      cost: baseSupplies,
      calculation: { supplies_percent: project.supplies_percent_of_materials, workflow_material_total: workflowMaterialTotal, base_supplies_cost: baseSupplies }
    }));
  }
  if (num19(project.extra_supplies_cost) > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:extra-supplies",
      name: "Additional Vinyl Supplies",
      type: "consumable",
      subtype: "extra_supplies",
      sourcePath: "extra_supplies_cost",
      cost: project.extra_supplies_cost
    }));
  }
  let equipmentTotal = 0;
  (project.selected_equipment || []).forEach((entry, index) => {
    const cost = num19(entry.total_cost);
    equipmentTotal += cost;
    const inventoryId = entry.equipment_id || "";
    addLinkedCost({
      key: `vinyl:equipment:${index}`,
      name: entry.equipment_name || rowName("ChannelLetterInstallEquipment", findRow(catalogs, "ChannelLetterInstallEquipment", inventoryId)) || `Installation Equipment ${index + 1}`,
      type: "equipment",
      subtype: entry.equipment_type || "installation_equipment",
      sourcePath: `selected_equipment[${index}].equipment_id`,
      entity: "ChannelLetterInstallEquipment",
      inventoryId,
      quantity: entry.duration || 1,
      unit: entry.pricing_mode === "per_hour" ? "hour" : entry.pricing_mode === "per_week" ? "week" : entry.pricing_mode === "per_month" ? "month" : entry.pricing_mode === "per_day" ? "day" : "job",
      cost,
      includeZero: !!inventoryId,
      builderData: entry,
      calculation: entry
    });
  });
  let projectPersonnelTotal = 0;
  (project.personnel || []).forEach((person, index) => {
    const cost = num19(person.total_cost, num19(person.hourly_rate) * num19(person.hours));
    if (Math.abs(cost) <= 5e-3) return;
    projectPersonnelTotal += cost;
    const inventoryRow = laborInventoryFor(person);
    addLinkedCost({
      key: `vinyl:installation-personnel:${index}`,
      name: person.name ? `${person.name} \u2014 ${person.role || "Installation Labor"}` : person.role || "Installation Labor",
      type: "labor",
      subtype: "installation_personnel",
      sourcePath: `personnel[${index}].inventory_id`,
      entity: inventoryRow ? "LaborServiceInventory" : "",
      inventoryId: person.inventory_id || inventoryRow?.id || "",
      quantity: person.hours || 1,
      unit: person.hours ? "hour" : "job",
      cost,
      builderData: person,
      calculation: { role: person.role, hourly_rate: person.hourly_rate, hours: person.hours, total_cost: cost }
    });
  });
  const travelTotal = num19(project.total_travel_cost);
  if (travelTotal > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:travel",
      name: "Travel / Fuel",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: travelTotal,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, total_travel_cost: travelTotal }
    }));
  }
  const suppliesTotal = baseSupplies + num19(project.extra_supplies_cost);
  const subtotal = workflowMaterialTotal + workflowMachineTotal + workflowLaborTotal + equipmentTotal + projectPersonnelTotal + travelTotal + suppliesTotal;
  const markup = subtotal * (num19(project.markup_percent) / 100);
  if (markup > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_percent",
      cost: markup,
      calculation: { markup_percent: project.markup_percent, subtotal, markup_amount: markup }
    }));
  }
  if (options.legacyMode && project.total_cost !== null && project.total_cost !== void 0) {
    const authoritativeTotal = num19(project.total_cost);
    const representedTotal = parts.reduce((sum, part) => sum + num19(part.extended_cost), 0);
    const residual = authoritativeTotal - representedTotal;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: "vinyl:saved-total-reconciliation",
        name: "Vinyl \u2014 Saved Total Adjustment",
        type: "pricing",
        subtype: "saved_total_adjustment",
        sourcePath: "total_cost",
        cost: residual,
        calculation: { authoritative_total: authoritativeTotal, represented_total: representedTotal }
      }));
    }
  }
  return parts;
}
function extractMetal(project) {
  const parts = [];
  const represented = {
    material: 0,
    supplies: 0,
    fabrication: 0,
    welding: 0,
    finishing: 0
  };
  (project.items || []).forEach((item, index) => {
    const itemQty = Math.max(num19(item.quantity, 1), 1e-6);
    const lengthPerUnit = num19(item.material_length_ft);
    const materialExtended = num19(item.material_cost) * itemQty;
    represented.material += materialExtended;
    if (Math.abs(materialExtended) > 5e-3 || item.inventory_item_id) {
      const linkedUsageQty = lengthPerUnit > 0 ? lengthPerUnit * itemQty : itemQty;
      const frozenMaterialUnitCost = lengthPerUnit > 0 ? num19(item.material_cost) / Math.max(lengthPerUnit, 1e-6) : num19(item.material_cost);
      parts.push(makePart({
        key: `metal:item:${index}:material`,
        name: item.description ? `${item.description} \u2014 Metal Material` : item.item_type || "Metal Material",
        type: "material",
        subtype: item.item_type || "metal",
        sourcePath: `items[${index}].inventory_item_id`,
        entity: item.inventory_item_id ? "Inventory" : "",
        inventoryId: item.inventory_item_id || "",
        quantity: linkedUsageQty,
        unit: lengthPerUnit > 0 ? "source_unit" : "item",
        unitCost: frozenMaterialUnitCost,
        extendedCost: materialExtended,
        builderData: item,
        calculation: {
          item_quantity: itemQty,
          material_length_per_unit: lengthPerUnit,
          material_cost_per_item: item.material_cost,
          total_material_cost: materialExtended
        },
        pricingBasis: {
          pricing_mode: "legacy_cost_per_unit",
          material_length_ft_per_item: lengthPerUnit,
          item_quantity: itemQty
        }
      }));
    }
    const suppliesExtended = num19(item.supplies_cost) * itemQty;
    represented.supplies += suppliesExtended;
    if (Math.abs(suppliesExtended) > 5e-3) {
      parts.push(manualCostPart({
        key: `metal:item:${index}:supplies`,
        name: item.description ? `${item.description} \u2014 Fabrication Consumables` : "Fabrication Consumables",
        type: "consumable",
        subtype: "supplies",
        sourcePath: `items[${index}].supplies_cost`,
        cost: suppliesExtended,
        quantity: itemQty,
        unit: "item",
        builderData: item,
        calculation: { item_quantity: itemQty, supplies_cost_per_item: item.supplies_cost, total_supplies_cost: suppliesExtended }
      }));
    }
    [
      ["fabrication", "Fabrication Labor", item.fabrication_cost, item.fabrication_hours],
      ["welding", "Welding Labor", item.welding_cost, item.welding_hours],
      ["finishing", "Finishing Labor", item.finishing_cost, item.finishing_hours]
    ].forEach(([key, label, perItemCost, hoursPerItem]) => {
      const extended = num19(perItemCost) * itemQty;
      represented[key] += extended;
      if (Math.abs(extended) <= 5e-3) return;
      const totalHours = num19(hoursPerItem) * itemQty;
      parts.push(manualCostPart({
        key: `metal:item:${index}:${key}`,
        name: item.description ? `${item.description} \u2014 ${label}` : label,
        type: "labor",
        subtype: key,
        sourcePath: `items[${index}].${key}_cost`,
        cost: extended,
        quantity: totalHours || itemQty,
        unit: totalHours ? "hour" : "item",
        builderData: item,
        calculation: {
          item_quantity: itemQty,
          hours_per_item: hoursPerItem,
          cost_per_item: perItemCost,
          total_cost: extended
        }
      }));
    });
  });
  const authoritative = {
    material: project.total_material_cost == null ? represented.material : num19(project.total_material_cost),
    supplies: project.total_supplies_cost == null ? represented.supplies : num19(project.total_supplies_cost),
    fabrication: project.total_fabrication_cost == null ? represented.fabrication : num19(project.total_fabrication_cost),
    welding: project.total_welding_cost == null ? represented.welding : num19(project.total_welding_cost),
    finishing: project.total_finishing_cost == null ? represented.finishing : num19(project.total_finishing_cost)
  };
  const labels = {
    material: ["Metal Material Adjustment", "material"],
    supplies: ["Metal Supplies Adjustment", "consumable"],
    fabrication: ["Fabrication Labor Adjustment", "labor"],
    welding: ["Welding Labor Adjustment", "labor"],
    finishing: ["Finishing Labor Adjustment", "labor"]
  };
  Object.keys(authoritative).forEach((key) => {
    const adjustment = authoritative[key] - represented[key];
    if (Math.abs(adjustment) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `metal:${key}-adjustment`,
      name: labels[key][0],
      type: labels[key][1],
      subtype: `${key}_adjustment`,
      sourcePath: `total_${key}_cost`,
      cost: adjustment,
      calculation: {
        authoritative_total: authoritative[key],
        represented_total: represented[key],
        adjustment
      }
    }));
  });
  return parts;
}
function brickMaterialForCalc(row) {
  if (!row) return null;
  if (row.material_type === "wall_material") {
    return {
      ...row,
      length: row.wall_unit_length_inches,
      width: row.wall_unit_width_inches,
      height: row.wall_unit_height_inches
    };
  }
  if (row.material_type === "brick_stone") {
    return {
      ...row,
      length: row.brick_length_inches,
      width: row.brick_width_inches,
      height: row.brick_height_inches
    };
  }
  return row;
}
function extractBrick(project, catalogs = {}, options = {}) {
  const parts = [];
  const selectedId = project.selected_material_id || "";
  const foundationRow = selectedId ? catalogs.FoundationInventory?.byId.get(selectedId) : null;
  const legacyRow = selectedId ? catalogs.BrickStoneInventory?.byId.get(selectedId) : null;
  const liveRow = foundationRow || legacyRow || null;
  const entity = foundationRow ? "FoundationInventory" : legacyRow ? "BrickStoneInventory" : "FoundationInventory";
  const liveCalc = !options.legacyMode && liveRow ? calcBrickStoneProject(project, brickMaterialForCalc(liveRow)) : null;
  const calculatedBricks = liveCalc ? liveCalc.calculated_bricks : num19(project.calculated_bricks);
  const materialCost = liveCalc ? liveCalc.material_cost : num19(project.material_cost);
  const mortarBags = liveCalc ? liveCalc.mortar_bags_needed : num19(project.mortar_bags_needed);
  const mortarCost = liveCalc ? liveCalc.mortar_cost : num19(project.mortar_cost);
  const laborHours = liveCalc ? liveCalc.labor_hours : num19(project.labor_hours);
  const laborCost = liveCalc ? liveCalc.labor_cost : num19(project.labor_cost);
  const markupAmount = liveCalc ? liveCalc.markup_amount : num19(project.markup_amount);
  if (selectedId) {
    const qty = Math.max(calculatedBricks, 1);
    parts.push(makePart({
      key: "brick:primary-material",
      name: project.material_name || liveRow?.material_name || "Brick / Stone Material",
      type: "material",
      subtype: liveRow?.wall_material_subtype || liveRow?.material_type || "brick_stone",
      sourcePath: "selected_material_id",
      entity,
      inventoryId: selectedId,
      quantity: qty,
      unit: "unit",
      unitCost: qty ? materialCost / qty : 0,
      extendedCost: materialCost,
      builderData: {
        material_dimensions: project.material_dimensions,
        bricks_along_length: project.bricks_along_length,
        bricks_along_width: project.bricks_along_width,
        courses_high: project.courses_high,
        layers: project.layers
      },
      calculation: {
        calculated_bricks: calculatedBricks,
        material_cost: materialCost,
        material_inventory_entity: entity
      },
      pricingBasis: { pricing_mode: "per_unit" }
    }));
  }
  if (Math.abs(mortarCost) > 5e-3) {
    parts.push(manualCostPart({
      key: "brick:mortar",
      name: "Mortar",
      type: "consumable",
      subtype: "mortar",
      sourcePath: "mortar_cost",
      cost: mortarCost,
      quantity: mortarBags || 1,
      unit: mortarBags ? "bag" : "job",
      calculation: { mortar_bags_needed: mortarBags, mortar_bag_cost: project.mortar_bag_cost }
    }));
  }
  if (Math.abs(laborCost) > 5e-3) {
    parts.push(manualCostPart({
      key: "brick:labor",
      name: "Masonry Labor",
      type: "labor",
      subtype: "masonry_labor",
      sourcePath: "labor_cost",
      cost: laborCost,
      quantity: laborHours || 1,
      unit: laborHours ? "hour" : "job",
      calculation: { labor_hours: laborHours, labor_rate_per_hour: project.labor_rate_per_hour }
    }));
  }
  if (Math.abs(markupAmount) > 5e-3) {
    parts.push(manualCostPart({
      key: "brick:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: markupAmount,
      calculation: { markup_percent: project.markup_percent, markup_amount: markupAmount }
    }));
  }
  if (options.legacyMode && project.total_cost !== null && project.total_cost !== void 0) {
    const represented = parts.reduce((sum, part) => sum + num19(part.extended_cost), 0);
    const residual = num19(project.total_cost) - represented;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: "brick:saved-total-reconciliation",
        name: "Brick & Stone \u2014 Saved Total Adjustment",
        type: "pricing",
        subtype: "saved_total_adjustment",
        sourcePath: "total_cost",
        cost: residual,
        calculation: { authoritative_total: project.total_cost, represented_total: represented, adjustment: residual }
      }));
    }
  }
  return parts;
}
function maintenanceEquipmentSource(entry, catalogs) {
  const id = entry?.equipment_id || entry?.inventory_item_id || "";
  if (!id) return { entity: "", row: null };
  const requested = entry?.inventory_entity || "";
  if (requested && catalogs[requested]?.byId?.has(id)) {
    return { entity: requested, row: catalogs[requested].byId.get(id) };
  }
  const shared = catalogs.ChannelLetterInstallEquipment?.byId?.get(id);
  if (shared) return { entity: "ChannelLetterInstallEquipment", row: shared };
  const legacy = catalogs.MaintenanceEquipment?.byId?.get(id);
  if (legacy) return { entity: "MaintenanceEquipment", row: legacy };
  return { entity: requested, row: null };
}
function recalcMaintenanceEquipmentRow(entry, catalogs) {
  const { entity, row } = maintenanceEquipmentSource(entry, catalogs);
  if (!row) return entry;
  const pricingMode = entry.pricing_mode || row.pricing_mode || "per_day";
  const duration = Math.max(num19(entry.duration, 1), 0);
  const unitCost = independentPartUnitCost({
    inventory_entity: entity,
    pricing_basis_snapshot: { pricing_mode: pricingMode }
  }, row);
  const owned = row.ownership === "owned" || ["owned_flat", "per_project_flat"].includes(pricingMode);
  const delivery = !owned && entry.include_delivery ? num19(row.delivery_pickup_cost) : 0;
  const idleRate = num19(row.idle_running_cost_per_hour);
  const idleHours = num19(entry.idle_hours);
  const idleCost = idleRate * idleHours;
  return {
    ...entry,
    inventory_entity: entity,
    equipment_name: row.equipment_name || entry.equipment_name,
    equipment_type: row.equipment_type || entry.equipment_type,
    pricing_mode: pricingMode,
    ownership: row.ownership || entry.ownership,
    unit_cost: unitCost,
    delivery_pickup_cost: num19(row.delivery_pickup_cost),
    idle_running_cost_per_hour: idleRate,
    idle_cost: idleCost,
    total_cost: unitCost * duration + delivery + idleCost
  };
}
function liveMaintenanceProject(project, catalogs) {
  const settings = {};
  (catalogs.Settings?.rows || []).forEach((row) => {
    if (row.setting_name) settings[row.setting_name] = row.setting_value;
  });
  const rates = catalogs.MaintenanceActionRate?.rows || [];
  const inventory = (catalogs.MaintenanceInventory?.rows || []).map((rule) => {
    if (!rule.inventory_entity || !rule.inventory_item_id) return rule;
    const masterRow = catalogs[rule.inventory_entity]?.byId?.get(rule.inventory_item_id) || null;
    const pricingMode = masterRow?.pricing_mode || masterRow?.pole_pricing_mode || masterRow?.unit_type || (rule.inventory_entity === "DimensionalLetterMaterial" ? "per_sheet" : "per_unit");
    return {
      ...rule,
      _master_missing: !masterRow,
      _master_unit_cost: masterRow ? independentPartUnitCost({ inventory_entity: rule.inventory_entity, pricing_basis_snapshot: { pricing_mode: pricingMode } }, masterRow) : void 0,
      _master_pricing_mode: pricingMode,
      _display_name: masterRow ? rowName(rule.inventory_entity, masterRow) : rule.inventory_item_name || rule.item_name
    };
  });
  const items = (project.items || []).map((item) => calcServiceItem(item, settings, rates, inventory));
  const selectedEquipment = (project.selected_equipment || []).map((entry) => recalcMaintenanceEquipmentRow(entry, catalogs));
  const current = { ...project, items, selected_equipment: selectedEquipment };
  return { ...current, ...calcProjectTotals(current) };
}
function extractMaintenance(project, catalogs = {}, options = {}) {
  if (!options.legacyMode && (catalogs.Settings?.rows || []).length) {
    project = liveMaintenanceProject(project, catalogs);
  }
  const parts = [];
  const represented = { labor: 0, materials: 0, equipment: 0, personnel: 0, supplies: 0, travel: 0, markup: 0 };
  (project.items || []).forEach((item, itemIndex) => {
    let itemMaterialParts = 0;
    (item.materials || []).forEach((mat, matIndex) => {
      const ruleId = mat.maintenance_rule_id || (!mat.inventory_entity ? mat.inventory_item_id || mat.inventory_id || "" : "");
      const rule = ruleId ? catalogs.MaintenanceInventory?.byId.get(ruleId) : null;
      const linkedEntity = mat.inventory_entity || rule?.inventory_entity || "";
      const linkedId = linkedEntity ? mat.inventory_item_id || rule?.inventory_item_id || "" : "";
      const inventoryEntity = linkedEntity || (ruleId ? "MaintenanceInventory" : "");
      const inventoryId = linkedEntity ? linkedId : ruleId;
      const row = linkedEntity ? catalogs[linkedEntity]?.byId?.get(linkedId) : rule;
      const quantity = num19(mat.quantity, 0);
      const unitCost = num19(mat.unit_cost);
      const extendedCost = mat.total_cost == null ? quantity * unitCost : num19(mat.total_cost);
      itemMaterialParts += extendedCost;
      represented.materials += extendedCost;
      if (Math.abs(extendedCost) <= 5e-3 && !inventoryId) return;
      parts.push(makePart({
        key: `maintenance:item:${itemIndex}:material:${matIndex}`,
        name: mat.item_name || (linkedEntity && row ? rowName(linkedEntity, row) : rule?.item_name) || "Maintenance Material",
        type: "material",
        subtype: mat.pricing_mode || row?.pricing_mode || rule?.pricing_mode || "maintenance_material",
        sourcePath: linkedEntity ? `items[${itemIndex}].materials[${matIndex}].inventory_item_id` : ruleId ? `items[${itemIndex}].materials[${matIndex}].maintenance_rule_id` : `items[${itemIndex}].materials[${matIndex}]`,
        entity: inventoryId ? inventoryEntity : "",
        inventoryId,
        quantity: quantity || 1,
        unit: mat.unit || row?.unit || rule?.unit || mat.pricing_mode || row?.pricing_mode || rule?.pricing_mode || "unit",
        unitCost,
        extendedCost,
        builderData: { sign: item.description, sign_type: item.sign_type, size: item.size, actions: item.actions || [], maintenance_rule_id: ruleId, maintenance_rule: rule || null, material: mat },
        calculation: { ...mat, maintenance_rule_id: ruleId, saved_total_cost: extendedCost },
        pricingBasis: { pricing_mode: mat.pricing_mode || row?.pricing_mode || row?.pole_pricing_mode || row?.unit_type || rule?.pricing_mode || "", size: item.size, sign_type: item.sign_type, actions: item.actions || [], usage_basis: mat.usage_basis || rule?.usage_basis || "", usage_multiplier: mat.usage_multiplier ?? rule?.usage_multiplier }
      }));
    });
    const authoritativeItemMaterials = item.materials_cost == null ? itemMaterialParts : num19(item.materials_cost);
    const itemMaterialAdjustment = authoritativeItemMaterials - itemMaterialParts;
    if (Math.abs(itemMaterialAdjustment) > 5e-3) {
      const isRepaint = !!item.repaint_calc;
      parts.push(manualCostPart({
        key: `maintenance:item:${itemIndex}:material-adjustment`,
        name: isRepaint ? `${item.description || "Monument"} \u2014 Repaint Paint Material` : `${item.description || `Service Item ${itemIndex + 1}`} \u2014 Material Adjustment`,
        type: "material",
        subtype: isRepaint ? "monument_repaint_paint" : "material_adjustment",
        sourcePath: `items[${itemIndex}].materials_cost`,
        cost: itemMaterialAdjustment,
        builderData: item,
        calculation: { authoritative_item_materials: authoritativeItemMaterials, inventory_materials: itemMaterialParts, repaint_calc: item.repaint_calc, adjustment: itemMaterialAdjustment }
      }));
      represented.materials += itemMaterialAdjustment;
    }
    const laborCost = num19(item.labor_cost);
    represented.labor += laborCost;
    if (Math.abs(laborCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `maintenance:item:${itemIndex}:labor`,
        name: `${item.description || `Service Item ${itemIndex + 1}`} \u2014 Maintenance Labor`,
        type: "labor",
        subtype: "maintenance_labor",
        sourcePath: `items[${itemIndex}].labor_cost`,
        cost: laborCost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: { sign_type: item.sign_type, size: item.size, qty: item.qty, actions: item.actions || [], repaint_calc: item.repaint_calc },
        calculation: { labor_hours: item.labor_hours, labor_cost: laborCost, actions: item.actions || [] }
      }));
    }
  });
  (project.selected_equipment || []).forEach((eq, index) => {
    const id = eq.equipment_id || eq.inventory_item_id || "";
    const equipmentSource = maintenanceEquipmentSource(eq, catalogs);
    const equipmentEntity = equipmentSource.entity || eq.inventory_entity || (id ? "MaintenanceEquipment" : "");
    const duration = num19(eq.duration, 1);
    const baseCost = num19(eq.unit_cost) * duration;
    const deliveryCost = eq.include_delivery ? num19(eq.delivery_pickup_cost) : 0;
    const idleCost = eq.idle_cost == null ? num19(eq.idle_running_cost_per_hour) * num19(eq.idle_hours) : num19(eq.idle_cost);
    const reconstructed = baseCost + deliveryCost + idleCost;
    const authoritativeEquipment = eq.total_cost == null ? reconstructed : num19(eq.total_cost);
    if (Math.abs(baseCost) > 5e-3 || id) {
      parts.push(makePart({
        key: `maintenance:equipment:${index}:base`,
        name: eq.equipment_name || "Maintenance Equipment",
        type: "equipment",
        subtype: eq.equipment_type || "maintenance_equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: id ? equipmentEntity : "",
        inventoryId: id,
        quantity: duration || 1,
        unit: eq.pricing_mode || "unit",
        unitCost: eq.unit_cost,
        extendedCost: baseCost,
        builderData: eq,
        calculation: { duration, unit_cost: eq.unit_cost, base_cost: baseCost },
        pricingBasis: { pricing_mode: eq.pricing_mode || "" }
      }));
    }
    if (Math.abs(deliveryCost) > 5e-3) {
      parts.push(makePart({
        key: `maintenance:equipment:${index}:delivery`,
        name: `${eq.equipment_name || "Equipment"} \u2014 Delivery / Pickup`,
        type: "service",
        subtype: "equipment_delivery",
        sourcePath: `selected_equipment[${index}].delivery_pickup_cost`,
        entity: id ? equipmentEntity : "",
        inventoryId: id,
        quantity: 1,
        unit: "delivery",
        unitCost: deliveryCost,
        extendedCost: deliveryCost,
        builderData: eq,
        calculation: { include_delivery: eq.include_delivery, delivery_pickup_cost: deliveryCost },
        pricingBasis: { pricing_mode: "delivery_pickup" }
      }));
    }
    if (Math.abs(idleCost) > 5e-3) {
      const idleHours = num19(eq.idle_hours, 1);
      parts.push(makePart({
        key: `maintenance:equipment:${index}:idle`,
        name: `${eq.equipment_name || "Equipment"} \u2014 Idle Running`,
        type: "equipment",
        subtype: "idle_running",
        sourcePath: `selected_equipment[${index}].idle_running_cost_per_hour`,
        entity: id ? equipmentEntity : "",
        inventoryId: id,
        quantity: idleHours || 1,
        unit: "hour",
        unitCost: idleHours ? idleCost / idleHours : idleCost,
        extendedCost: idleCost,
        builderData: eq,
        calculation: { idle_hours: eq.idle_hours, idle_running_cost_per_hour: eq.idle_running_cost_per_hour, idle_cost: idleCost },
        pricingBasis: { pricing_mode: "idle_running" }
      }));
    }
    const equipmentAdjustment = authoritativeEquipment - reconstructed;
    if (Math.abs(equipmentAdjustment) > 5e-3) {
      parts.push(manualCostPart({
        key: `maintenance:equipment:${index}:adjustment`,
        name: `${eq.equipment_name || "Equipment"} \u2014 Saved Cost Adjustment`,
        type: "equipment",
        subtype: "equipment_adjustment",
        sourcePath: `selected_equipment[${index}].total_cost`,
        cost: equipmentAdjustment,
        builderData: eq,
        calculation: { authoritative_total: authoritativeEquipment, reconstructed_total: reconstructed, adjustment: equipmentAdjustment }
      }));
    }
    represented.equipment += authoritativeEquipment;
  });
  (project.personnel || []).forEach((person, index) => {
    const cost = person.total_cost == null ? num19(person.hourly_rate) * num19(person.hours) : num19(person.total_cost);
    represented.personnel += cost;
    if (Math.abs(cost) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `maintenance:personnel:${index}`,
      name: `${person.name || person.role || `Crew Member ${index + 1}`} \u2014 Personnel`,
      type: "labor",
      subtype: (person.role || "personnel").toLowerCase().replace(/\s+/g, "_"),
      sourcePath: `personnel[${index}].total_cost`,
      cost,
      quantity: person.hours || 1,
      unit: person.hours ? "hour" : "job",
      builderData: person,
      calculation: { hourly_rate: person.hourly_rate, hours: person.hours, total_cost: cost }
    }));
  });
  const totalSupplies = num19(project.total_supplies_cost);
  represented.supplies = totalSupplies;
  if (Math.abs(totalSupplies) > 5e-3) {
    parts.push(manualCostPart({
      key: "maintenance:supplies",
      name: "Maintenance Consumables / Supplies",
      type: "consumable",
      subtype: "maintenance_supplies",
      sourcePath: "total_supplies_cost",
      cost: totalSupplies,
      calculation: { supplies_percent_of_materials: project.supplies_percent_of_materials, extra_supplies_cost: project.extra_supplies_cost, total_materials_cost: project.total_materials_cost, total_supplies_cost: totalSupplies }
    }));
  }
  const totalTravel = num19(project.total_travel_cost);
  represented.travel = totalTravel;
  if (Math.abs(totalTravel) > 5e-3) {
    parts.push(manualCostPart({
      key: "maintenance:travel",
      name: "Travel / Mileage",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: totalTravel,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, total_travel_cost: totalTravel, site_address: project.site_address }
    }));
  }
  const totalMarkup = num19(project.markup_amount);
  represented.markup = totalMarkup;
  if (Math.abs(totalMarkup) > 5e-3) {
    parts.push(manualCostPart({
      key: "maintenance:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: totalMarkup,
      calculation: { markup_percent: project.markup_percent, subtotal: project.subtotal, markup_amount: totalMarkup }
    }));
  }
  const authoritativeCategories = {
    labor: project.labor_cost == null ? represented.labor : num19(project.labor_cost),
    materials: project.total_materials_cost == null ? represented.materials : num19(project.total_materials_cost),
    equipment: project.total_equipment_cost == null ? represented.equipment : num19(project.total_equipment_cost),
    personnel: project.total_personnel_cost == null ? represented.personnel : num19(project.total_personnel_cost)
  };
  const categoryMeta = { labor: ["Labor", "labor"], materials: ["Materials", "material"], equipment: ["Equipment", "equipment"], personnel: ["Personnel", "labor"] };
  Object.keys(authoritativeCategories).forEach((key) => {
    const adjustment = authoritativeCategories[key] - represented[key];
    if (Math.abs(adjustment) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `maintenance:${key}-adjustment`,
      name: `Maintenance ${categoryMeta[key][0]} Adjustment`,
      type: categoryMeta[key][1],
      subtype: `${key}_adjustment`,
      sourcePath: key === "labor" ? "labor_cost" : `total_${key}_cost`,
      cost: adjustment,
      calculation: { authoritative_total: authoritativeCategories[key], represented_total: represented[key], adjustment }
    }));
    represented[key] = authoritativeCategories[key];
  });
  const reconstructedTotal = Object.values(represented).reduce((sum, value) => sum + num19(value), 0);
  if (project.total_cost != null) {
    const finalAdjustment = num19(project.total_cost) - reconstructedTotal;
    if (Math.abs(finalAdjustment) > 5e-3) {
      parts.push(manualCostPart({
        key: "maintenance:project-total-adjustment",
        name: "Maintenance Saved Total Adjustment",
        type: "pricing",
        subtype: "project_total_adjustment",
        sourcePath: "total_cost",
        cost: finalAdjustment,
        calculation: { authoritative_total: project.total_cost, reconstructed_total: reconstructedTotal, adjustment: finalAdjustment }
      }));
    }
  }
  return parts;
}
function manualCostPart({ key, name, type = "labor", subtype = "", sourcePath = "", cost = 0, quantity = 1, unit = "job", builderData = {}, calculation = {} }) {
  const extended = num19(cost);
  const qty = Math.max(num19(quantity, 1), 1e-6);
  return makePart({
    key,
    name,
    type,
    subtype,
    sourcePath,
    quantity: qty,
    unit,
    unitCost: extended / qty,
    extendedCost: extended,
    builderData,
    calculation
  });
}
function foundationEquipmentBreakdown(entry, catalogs) {
  const equipmentRow = catalogs.FoundationInventory?.byId.get(entry.equipment_id);
  if (!equipmentRow) return { baseRental: num19(entry.equipment_cost), delivery: 0, attachmentCosts: [], subAttachmentCosts: [], total: num19(entry.equipment_cost) };
  const rentalPeriod = entry.rental_period || "day";
  const duration = entry.custom_qty !== void 0 && entry.custom_qty !== null ? num19(entry.custom_qty, 1) : num19(entry.rental_duration, 1);
  const rateFor = (row, override = void 0) => {
    if (override !== void 0 && override !== null) return num19(override) * duration;
    if (rentalPeriod === "day") return num19(row?.cost_per_day) * duration;
    if (rentalPeriod === "week") return num19(row?.cost_per_week) * duration;
    if (rentalPeriod === "month") return num19(row?.cost_per_month) * duration;
    return 0;
  };
  const attachmentQty = /* @__PURE__ */ new Map();
  if (entry.attachments?.length) {
    entry.attachments.forEach((attachment) => {
      const id = attachment.id || attachment.inventory_id || "";
      if (id) attachmentQty.set(id, num19(attachment.qty, 1));
    });
  } else if (entry.attachment_counts) {
    Object.entries(entry.attachment_counts).forEach(([id, qty]) => attachmentQty.set(id, num19(qty, 0)));
  } else if (entry.attachment_ids?.length) {
    entry.attachment_ids.forEach((id) => attachmentQty.set(id, 1));
  }
  const attachmentCosts = [...attachmentQty.entries()].map(([id, quantity]) => {
    const row = catalogs.FoundationInventory?.byId.get(id);
    return { id, row, quantity, cost: rateFor(row) * quantity, attachment: { id, qty: quantity } };
  }).filter((entry2) => entry2.quantity > 0);
  const subAttachmentCosts = Object.entries(entry.sub_attachment_counts || {}).map(([id, qty]) => {
    const quantity = num19(qty, 0);
    const row = catalogs.FoundationInventory?.byId.get(id);
    return { id, row, quantity, cost: rateFor(row) * quantity, attachment: { id, qty: quantity } };
  }).filter((entry2) => entry2.quantity > 0);
  const baseRental = rateFor(equipmentRow, entry.custom_rate);
  const delivery = entry.include_delivery ? entry.custom_delivery_charge !== void 0 && entry.custom_delivery_charge !== null ? num19(entry.custom_delivery_charge) : num19(equipmentRow.pickup_delivery_cost) : 0;
  const total = baseRental + delivery + attachmentCosts.reduce((sum, item) => sum + item.cost, 0) + subAttachmentCosts.reduce((sum, item) => sum + item.cost, 0);
  return { baseRental, delivery, attachmentCosts, subAttachmentCosts, total };
}
function extractFoundation(project, catalogs) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    const concreteId = item.selected_concrete_id || project.selected_concrete_id || "";
    if (concreteId) {
      const entity = findEntity(catalogs, concreteId, "FoundationInventory");
      const concreteRow = findRow(catalogs, entity, concreteId);
      if (concreteRow?.material_type === "bagged_concrete" || num19(item.concrete_cost) > 0) {
        const qty = item.concrete_bags || item.concrete_volume_cy || item.quantity || 1;
        parts.push(makePart({
          key: `foundation:item:${index}:concrete`,
          name: item.description ? `${item.description} \u2014 Concrete` : "Concrete",
          type: "material",
          subtype: concreteRow?.material_type || "concrete",
          sourcePath: `items[${index}].selected_concrete_id`,
          entity,
          inventoryId: concreteId,
          quantity: qty,
          unit: concreteRow?.material_type === "bagged_concrete" ? "bag" : "cy",
          unitCost: item.concrete_rate ?? item.custom_concrete_cost_per_cy,
          extendedCost: item.concrete_cost,
          builderData: item,
          calculation: { concrete_bags: item.concrete_bags, concrete_volume_cy: item.concrete_volume_cy, concrete_cost: item.concrete_cost },
          pricingBasis: { project_concrete_type: project.project_concrete_type, admixtures: project.project_concrete_admixtures }
        }));
      }
    }
    if (item.include_rebar) {
      if (item.reinforcement_calculation_version === 2) {
        parts.push(...foundationReinforcementPartDescriptors({ item, itemIndex: index }));
      } else {
        const selector = item.reinforcement_calculation_version;
        if (selector !== void 0 && selector !== null && selector !== 1) {
          const err = new Error("Foundation reinforcement version is unsupported.");
          err.code = "FOUNDATION_REINFORCEMENT_VERSION_UNSUPPORTED";
          throw err;
        }
        const size = item.foundation_type === "pillar" ? item.pillar_rebar_size || "#4" : item.rebar_size || "#4";
        const rebarRow = catalogs.FoundationInventory?.rows.find(
          (row) => row.material_type === "rebar" && row.rebar_size === size
        );
        const rebarRate = num19(item.rebar_rate, num19(item.custom_rebar_cost_per_ft, genericUnitCost(rebarRow)));
        const rebarFeet = num19(item.rebar_feet);
        const totalRebarCost = num19(item.rebar_cost);
        const rebarMaterialCost = rebarFeet > 0 && rebarRate > 0 ? Math.min(totalRebarCost, rebarFeet * rebarRate) : totalRebarCost;
        const rebarLaborCost = Math.max(0, totalRebarCost - rebarMaterialCost);
        parts.push(makePart({
          key: `foundation:item:${index}:rebar`,
          name: `${size} Rebar`,
          type: "material",
          subtype: "rebar",
          sourcePath: `items[${index}].${item.foundation_type === "pillar" ? "pillar_rebar_size" : "rebar_size"}`,
          entity: "FoundationInventory",
          inventoryId: rebarRow?.id || "",
          quantity: rebarFeet || 1,
          unit: "ft",
          unitCost: rebarRate,
          extendedCost: rebarMaterialCost,
          builderData: item,
          calculation: { rebar_cost: totalRebarCost, rebar_material_cost: rebarMaterialCost, rebar_labor_cost: rebarLaborCost, rebar_feet: rebarFeet }
        }));
        if (rebarLaborCost > 5e-3) {
          parts.push(manualCostPart({
            key: `foundation:item:${index}:rebar-labor`,
            name: item.description ? `${item.description} \u2014 Rebar Labor` : "Rebar Labor",
            type: "labor",
            subtype: "rebar_labor",
            sourcePath: `items[${index}].rebar_cost`,
            cost: rebarLaborCost,
            builderData: item,
            calculation: { total_rebar_cost: totalRebarCost, material_cost: rebarMaterialCost, labor_cost: rebarLaborCost }
          }));
        }
      }
    }
    if (item.include_forming) {
      const formingRow = item.selected_forming_id ? catalogs.FoundationInventory?.byId.get(item.selected_forming_id) : null;
      const formingQty = num19(item.forming_qty, 1);
      const formingRate = num19(item.forming_rate, num19(item.custom_forming_rate, genericUnitCost(formingRow)));
      const totalFormingCost = num19(item.forming_cost);
      const formingMaterialCost = item.selected_forming_id ? Math.min(totalFormingCost, formingQty * formingRate) : 0;
      const formingLaborCost = Math.max(0, totalFormingCost - formingMaterialCost);
      if (item.selected_forming_id) {
        parts.push(makePart({
          key: `foundation:item:${index}:forming`,
          name: item.description ? `${item.description} \u2014 Forming Material` : "Forming Material",
          type: "material",
          subtype: "forming",
          sourcePath: `items[${index}].selected_forming_id`,
          entity: "FoundationInventory",
          inventoryId: item.selected_forming_id,
          quantity: formingQty,
          unit: "piece",
          unitCost: formingRate,
          extendedCost: formingMaterialCost,
          builderData: item,
          calculation: { forming_cost: totalFormingCost, material_cost: formingMaterialCost, forming_qty: formingQty }
        }));
      }
      if (formingLaborCost > 5e-3) {
        parts.push(manualCostPart({
          key: `foundation:item:${index}:forming-labor`,
          name: item.description ? `${item.description} \u2014 Forming Labor / Allowance` : "Forming Labor / Allowance",
          type: "labor",
          subtype: "forming_labor",
          sourcePath: `items[${index}].forming_cost`,
          cost: formingLaborCost,
          builderData: item,
          calculation: { total_forming_cost: totalFormingCost, material_cost: formingMaterialCost, labor_allowance_cost: formingLaborCost }
        }));
      }
    }
    if (num19(item.excavation_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:excavation`,
        name: item.description ? `${item.description} \u2014 Excavation` : "Excavation Labor",
        type: "labor",
        subtype: item.excavation_method || "excavation",
        sourcePath: `items[${index}].excavation_cost`,
        cost: item.excavation_cost,
        quantity: item.excavation_hours || 1,
        unit: item.excavation_hours ? "hour" : "job",
        builderData: item,
        calculation: { hours: item.excavation_hours, rate: item.excavation_rate, cost: item.excavation_cost }
      }));
    }
    if (num19(item.pouring_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:pouring`,
        name: item.description ? `${item.description} \u2014 Concrete Pour Labor` : "Concrete Pour Labor",
        type: "labor",
        subtype: "concrete_pouring",
        sourcePath: `items[${index}].pouring_cost`,
        cost: item.pouring_cost,
        quantity: item.concrete_volume_cy || 1,
        unit: "cy",
        builderData: item,
        calculation: { concrete_volume_cy: item.concrete_volume_cy, cost: item.pouring_cost }
      }));
    }
    if (num19(item.finishing_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:finishing`,
        name: item.description ? `${item.description} \u2014 Concrete Finishing` : "Concrete Finishing Labor",
        type: "labor",
        subtype: "concrete_finishing",
        sourcePath: `items[${index}].finishing_cost`,
        cost: item.finishing_cost,
        quantity: item.finishing_hours || 1,
        unit: item.finishing_hours ? "hour" : "job",
        builderData: item,
        calculation: { hours: item.finishing_hours, rate: item.finishing_rate, cost: item.finishing_cost }
      }));
    }
  });
  const delivery = project.builder_calculation?.delivery || {};
  const itemConcreteCost = (project.items || []).reduce((sum, item) => sum + num19(item.concrete_cost), 0);
  const fallbackDeliveryCost = Math.max(0, num19(project.total_concrete_cost) - itemConcreteCost);
  const deliveryCost = num19(delivery.concreteTotal, fallbackDeliveryCost);
  if (deliveryCost > 5e-3) {
    const concreteServiceItem = (project.items || []).find((item) => {
      const id = item.selected_concrete_id || project.selected_concrete_id || "";
      const row = findRow(catalogs, findEntity(catalogs, id, "LaborServiceInventory"), id);
      return row?.material_type === "concrete_service" || row?.service_category === "concrete_service";
    });
    const concreteId = concreteServiceItem?.selected_concrete_id || project.selected_concrete_id || "";
    const entity = findEntity(catalogs, concreteId, "LaborServiceInventory");
    const hasDetailedDelivery = Array.isArray(delivery.trucksList) && delivery.trucksList.length > 0;
    if (hasDetailedDelivery) {
      const roundedYards = num19(delivery.roundedYards, 0);
      const selectedMix = (delivery.availableMixes || []).find((mix) => mix.id === project.project_concrete_type) || (delivery.availableMixes || []).find((mix) => mix.id === "4000_ae");
      const mixPrice = num19(selectedMix?.price, num19(delivery.ratePerYard));
      const mixCost = roundedYards * mixPrice;
      let representedDelivery = 0;
      if (mixCost > 5e-3) {
        parts.push(makePart({
          key: "foundation:concrete-delivery:mix",
          name: `Ready-Mix Concrete \u2014 ${selectedMix?.name || project.project_concrete_type || "Mix"}`,
          type: "material",
          subtype: "ready_mix_concrete",
          sourcePath: "builder_calculation.delivery.availableMixes",
          entity,
          inventoryId: concreteId,
          quantity: roundedYards,
          unit: "cy",
          unitCost: mixPrice,
          extendedCost: mixCost,
          builderData: { project_concrete_type: project.project_concrete_type },
          calculation: { rounded_yards: roundedYards, mix_price: mixPrice, mix_cost: mixCost },
          pricingBasis: { pricing_mode: "concrete_mix", mix: project.project_concrete_type }
        }));
        representedDelivery += mixCost;
      }
      (project.project_concrete_admixtures || []).forEach((admixId) => {
        const admix = (delivery.availableAdmixes || []).find((candidate) => candidate.id === admixId);
        const rate = num19(admix?.price);
        const cost = roundedYards * rate;
        if (cost <= 5e-3) return;
        parts.push(makePart({
          key: `foundation:concrete-delivery:admix:${admixId}`,
          name: `Concrete Admixture \u2014 ${admix?.name || admixId}`,
          type: "material",
          subtype: "concrete_admixture",
          sourcePath: "project_concrete_admixtures",
          entity,
          inventoryId: concreteId,
          quantity: roundedYards,
          unit: "cy",
          unitCost: rate,
          extendedCost: cost,
          builderData: { admixture_id: admixId },
          calculation: { rounded_yards: roundedYards, rate, cost },
          pricingBasis: { pricing_mode: "concrete_admixture", admixture: admixId }
        }));
        representedDelivery += cost;
      });
      (delivery.trucksList || []).forEach((truck, truckIndex) => {
        const smallLoadFee = num19(truck.smallOrderFee);
        if (smallLoadFee > 5e-3) {
          parts.push(makePart({
            key: `foundation:concrete-delivery:truck:${truckIndex}:small-load`,
            name: `Concrete Truck ${truckIndex + 1} \u2014 Small Load Fee`,
            type: "service",
            subtype: "concrete_small_load_fee",
            sourcePath: `builder_calculation.delivery.trucksList[${truckIndex}].smallOrderFee`,
            entity,
            inventoryId: concreteId,
            quantity: 1,
            unit: "truck",
            unitCost: smallLoadFee,
            extendedCost: smallLoadFee,
            builderData: truck,
            calculation: truck,
            pricingBasis: { pricing_mode: "small_load_fee", rounded_yards: truck.roundedYards }
          }));
          representedDelivery += smallLoadFee;
        }
        const fuelFee = num19(truck.fuelFee);
        if (fuelFee > 5e-3) {
          parts.push(makePart({
            key: `foundation:concrete-delivery:truck:${truckIndex}:fuel`,
            name: `Concrete Truck ${truckIndex + 1} \u2014 Fuel Surcharge`,
            type: "service",
            subtype: "concrete_fuel_surcharge",
            sourcePath: `builder_calculation.delivery.trucksList[${truckIndex}].fuelFee`,
            entity,
            inventoryId: concreteId,
            quantity: 1,
            unit: "truck",
            unitCost: fuelFee,
            extendedCost: fuelFee,
            builderData: truck,
            calculation: truck,
            pricingBasis: { pricing_mode: "fuel_surcharge" }
          }));
          representedDelivery += fuelFee;
        }
      });
      const additionalStopsCost = num19(delivery.additionalStopsCost);
      if (additionalStopsCost > 5e-3) {
        const stopCount = Math.max(1, Math.round(additionalStopsCost / 100));
        parts.push(manualCostPart({
          key: "foundation:concrete-delivery:additional-stops",
          name: "Additional Sign Locations / Concrete Stops",
          type: "service",
          subtype: "additional_concrete_stop",
          sourcePath: "builder_calculation.delivery.additionalStopsCost",
          cost: additionalStopsCost,
          quantity: stopCount,
          unit: "stop",
          builderData: { stop_count: stopCount },
          calculation: { additional_stops_cost: additionalStopsCost, stop_count: stopCount }
        }));
        representedDelivery += additionalStopsCost;
      }
      const deliveryResidual = deliveryCost - representedDelivery;
      if (Math.abs(deliveryResidual) > 5e-3) {
        parts.push(manualCostPart({
          key: "foundation:concrete-delivery:reconciliation",
          name: "Ready-Mix Delivery Reconciliation",
          type: "service",
          subtype: "delivery_reconciliation",
          sourcePath: "builder_calculation.delivery.concreteTotal",
          cost: deliveryResidual,
          builderData: { project_concrete_type: project.project_concrete_type, admixtures: project.project_concrete_admixtures || [] },
          calculation: { authoritative_total: deliveryCost, represented_total: representedDelivery }
        }));
      }
    } else {
      parts.push(makePart({
        key: "foundation:concrete-delivery",
        name: "Ready-Mix Concrete Delivery",
        type: "material",
        subtype: "ready_mix_concrete",
        sourcePath: "total_concrete_cost",
        entity,
        inventoryId: concreteId,
        quantity: delivery.roundedYards || 1,
        unit: "cy",
        unitCost: delivery.ratePerYard,
        extendedCost: deliveryCost,
        builderData: { project_concrete_type: project.project_concrete_type, admixtures: project.project_concrete_admixtures || [] },
        calculation: delivery,
        pricingBasis: { pricing_mode: "legacy_delivery_aggregate", mix: project.project_concrete_type, admixtures: project.project_concrete_admixtures || [] }
      }));
    }
  }
  (project.walls || []).forEach((wall, index) => {
    if (wall.materialId) {
      parts.push(makePart({
        key: `foundation:wall:${index}:outer`,
        name: wall.name ? `${wall.name} \u2014 Outer wall` : "Wall material",
        type: "material",
        subtype: "wall_material",
        sourcePath: `walls[${index}].materialId`,
        entity: "FoundationInventory",
        inventoryId: wall.materialId,
        quantity: wall.calculatedCosts?.totalBricks || 1,
        unit: "unit",
        extendedCost: wall.calculatedCosts?.materialCost,
        builderData: wall,
        calculation: wall.calculatedCosts || {}
      }));
    }
    if (wall.internalMaterialId) {
      parts.push(makePart({
        key: `foundation:wall:${index}:internal`,
        name: wall.name ? `${wall.name} \u2014 Internal wall` : "Internal wall material",
        type: "material",
        subtype: "wall_fill",
        sourcePath: `walls[${index}].internalMaterialId`,
        entity: "FoundationInventory",
        inventoryId: wall.internalMaterialId,
        quantity: wall.calculatedCosts?.internalTotalBricks || 1,
        unit: "unit",
        extendedCost: wall.calculatedCosts?.internalMaterialCost,
        builderData: wall,
        calculation: wall.calculatedCosts || {}
      }));
    }
    if (num19(wall.calculatedCosts?.mortarCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:mortar`,
        name: wall.name ? `${wall.name} \u2014 Mortar` : "Wall Mortar",
        type: "consumable",
        subtype: "mortar",
        sourcePath: `walls[${index}].calculatedCosts.mortarCost`,
        cost: wall.calculatedCosts.mortarCost,
        builderData: wall,
        calculation: wall.calculatedCosts
      }));
    }
    if (num19(wall.calculatedCosts?.laborCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:labor`,
        name: wall.name ? `${wall.name} \u2014 Masonry Labor` : "Masonry Labor",
        type: "labor",
        subtype: "masonry_labor",
        sourcePath: `walls[${index}].calculatedCosts.laborCost`,
        cost: wall.calculatedCosts.laborCost,
        quantity: wall.calculatedCosts.laborHours || 1,
        unit: wall.calculatedCosts.laborHours ? "hour" : "job",
        builderData: wall,
        calculation: wall.calculatedCosts
      }));
    }
    if (num19(wall.calculatedCosts?.internalMortarCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:internal-mortar`,
        name: wall.name ? `${wall.name} \u2014 Internal Mortar` : "Internal Wall Mortar",
        type: "consumable",
        subtype: "mortar",
        sourcePath: `walls[${index}].calculatedCosts.internalMortarCost`,
        cost: wall.calculatedCosts.internalMortarCost,
        builderData: wall,
        calculation: wall.calculatedCosts
      }));
    }
    if (num19(wall.calculatedCosts?.internalLaborCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:internal-labor`,
        name: wall.name ? `${wall.name} \u2014 Internal Masonry Labor` : "Internal Masonry Labor",
        type: "labor",
        subtype: "masonry_labor",
        sourcePath: `walls[${index}].calculatedCosts.internalLaborCost`,
        cost: wall.calculatedCosts.internalLaborCost,
        quantity: wall.calculatedCosts.internalLaborHours || 1,
        unit: wall.calculatedCosts.internalLaborHours ? "hour" : "job",
        builderData: wall,
        calculation: wall.calculatedCosts
      }));
    }
  });
  (project.poles || []).forEach((pole, index) => {
    if (!pole.pole_id) return;
    const row = catalogs.FoundationInventory?.byId.get(pole.pole_id);
    const totalPoleInches = num19(pole.height_inches) + num19(pole.y_offset_inches);
    const poleQtyFt = totalPoleInches / 12 || 1;
    const isStock = row?.pole_pricing_mode === "stock_price";
    const stockLengthFt = num19(row?.pole_stock_length_ft, 20);
    const stockPieces = isStock ? Math.max(1, Math.ceil(totalPoleInches / Math.max(stockLengthFt * 12, 1))) : null;
    const partQty = isStock ? stockPieces : poleQtyFt;
    const partUnitCost = isStock ? num19(pole.custom_cost_per_unit, num19(row?.pole_stock_price)) : num19(pole.custom_cost_per_unit, num19(row?.cost_per_unit));
    parts.push(makePart({
      key: `foundation:pole:${index}`,
      name: pole.pole_name || row?.material_name || "Sign Pole",
      type: "material",
      subtype: "pole",
      sourcePath: `poles[${index}].pole_id`,
      entity: "FoundationInventory",
      inventoryId: pole.pole_id,
      quantity: partQty,
      unit: isStock ? "stock_piece" : "ft",
      unitCost: partUnitCost,
      extendedCost: pole.pole_cost,
      builderData: pole,
      calculation: { ...pole, stock_pieces: stockPieces, total_pole_inches: totalPoleInches },
      pricingBasis: { pricing_mode: isStock ? "stock_price" : "per_foot", stock_length_ft: stockLengthFt }
    }));
    if (num19(pole.pole_painting_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:pole:${index}:painting`,
        name: `${pole.pole_name || row?.material_name || "Sign Pole"} \u2014 Painting`,
        type: "labor",
        subtype: "pole_painting",
        sourcePath: `poles[${index}].pole_painting_cost`,
        cost: pole.pole_painting_cost,
        quantity: poleQtyFt,
        unit: "ft",
        builderData: pole,
        calculation: pole
      }));
    }
  });
  (project.wall_caps || []).forEach((cap, index) => {
    if (!cap.cap_inventory_id) return;
    parts.push(makePart({
      key: `foundation:cap:${cap.id || index}`,
      name: "Wall cap",
      type: "material",
      subtype: "wall_cap",
      sourcePath: `wall_caps[${index}].cap_inventory_id`,
      entity: "FoundationInventory",
      inventoryId: cap.cap_inventory_id,
      quantity: 1,
      unit: "stock_piece",
      unitCost: cap.cost,
      extendedCost: cap.cost,
      builderData: cap,
      calculation: cap
    }));
  });
  (project.selected_equipment || []).forEach((eq, index) => {
    const breakdown = foundationEquipmentBreakdown(eq, catalogs);
    const equipmentRow = eq.equipment_id ? catalogs.FoundationInventory?.byId.get(eq.equipment_id) : null;
    const qty = eq.custom_qty ?? eq.rental_duration ?? 1;
    if (eq.equipment_id) {
      parts.push(makePart({
        key: `foundation:equipment:${index}`,
        name: equipmentRow?.material_name || "Foundation Equipment",
        type: "equipment",
        subtype: "excavation_equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: "FoundationInventory",
        inventoryId: eq.equipment_id,
        quantity: qty,
        unit: eq.rental_period || "day",
        unitCost: num19(breakdown.baseRental) / Math.max(num19(qty, 1), 1),
        extendedCost: breakdown.baseRental,
        builderData: eq,
        calculation: { ...eq, equipment_total_with_attachments: eq.equipment_cost, base_equipment_cost: breakdown.baseRental },
        pricingBasis: { pricing_mode: `per_${eq.rental_period || "day"}` }
      }));
    }
    if (eq.equipment_id && Math.abs(num19(breakdown.delivery)) > 5e-3) {
      parts.push(makePart({
        key: `foundation:equipment:${index}:delivery`,
        name: `${equipmentRow?.material_name || "Foundation Equipment"} \u2014 Delivery / Pickup`,
        type: "service",
        subtype: "equipment_delivery",
        sourcePath: `selected_equipment[${index}].include_delivery`,
        entity: "FoundationInventory",
        inventoryId: eq.equipment_id,
        quantity: 1,
        unit: "delivery",
        unitCost: breakdown.delivery,
        extendedCost: breakdown.delivery,
        builderData: eq,
        calculation: { include_delivery: eq.include_delivery, delivery_cost: breakdown.delivery },
        pricingBasis: { pricing_mode: "pickup_delivery" }
      }));
    }
    breakdown.attachmentCosts.forEach((entry) => {
      if (!entry.id) return;
      parts.push(makePart({
        key: `foundation:equipment:${index}:attachment:${entry.id}`,
        name: entry.row?.material_name || "Equipment Attachment",
        type: "equipment",
        subtype: entry.row?.material_type || "attachment",
        sourcePath: `selected_equipment[${index}].attachment_counts.${entry.id}`,
        entity: "FoundationInventory",
        inventoryId: entry.id,
        quantity: entry.quantity * Math.max(num19(qty, 1), 1),
        unit: eq.rental_period || "day",
        unitCost: entry.quantity * Math.max(num19(qty, 1), 1) ? entry.cost / (entry.quantity * Math.max(num19(qty, 1), 1)) : entry.cost,
        extendedCost: entry.cost,
        builderData: entry.attachment,
        calculation: { rental_period: eq.rental_period, rental_duration: eq.rental_duration, attachment_quantity: entry.quantity, total_cost: entry.cost },
        pricingBasis: { pricing_mode: `per_${eq.rental_period || "day"}` }
      }));
    });
    breakdown.subAttachmentCosts.forEach((entry) => {
      if (!entry.id) return;
      parts.push(makePart({
        key: `foundation:equipment:${index}:sub-attachment:${entry.id}`,
        name: entry.row?.material_name || "Equipment Sub-Attachment",
        type: "equipment",
        subtype: entry.row?.material_type || "sub_attachment",
        sourcePath: `selected_equipment[${index}].sub_attachment_counts.${entry.id}`,
        entity: "FoundationInventory",
        inventoryId: entry.id,
        quantity: entry.quantity * Math.max(num19(qty, 1), 1),
        unit: eq.rental_period || "day",
        unitCost: entry.quantity * Math.max(num19(qty, 1), 1) ? entry.cost / (entry.quantity * Math.max(num19(qty, 1), 1)) : entry.cost,
        extendedCost: entry.cost,
        builderData: entry.attachment,
        calculation: { rental_period: eq.rental_period, rental_duration: eq.rental_duration, attachment_quantity: entry.quantity, total_cost: entry.cost },
        pricingBasis: { pricing_mode: `per_${eq.rental_period || "day"}` }
      }));
    });
    const representedEquipment = num19(breakdown.total);
    if (eq.equipment_cost != null && Math.abs(num19(eq.equipment_cost) - representedEquipment) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:equipment:${index}:saved-adjustment`,
        name: `${equipmentRow?.material_name || "Foundation Equipment"} \u2014 Saved Cost Adjustment`,
        type: "equipment",
        subtype: "equipment_adjustment",
        sourcePath: `selected_equipment[${index}].equipment_cost`,
        cost: num19(eq.equipment_cost) - representedEquipment,
        builderData: eq,
        calculation: { authoritative_total: eq.equipment_cost, reconstructed_total: representedEquipment }
      }));
    }
  });
  (project.signage_cabinets || []).forEach((cabinet, index) => {
    parts.push(makePart({
      key: `foundation:cabinet:${cabinet.id || index}`,
      name: cabinet.description || "Signage Cabinet",
      type: "fabrication",
      subtype: "signage_cabinet",
      sourcePath: `signage_cabinets[${index}]`,
      quantity: cabinet.quantity || 1,
      unit: "each",
      unitCost: cabinet.unit_cost,
      extendedCost: num19(cabinet.unit_cost) * num19(cabinet.quantity, 1),
      builderData: cabinet,
      calculation: cabinet
    }));
  });
  if (num19(project.builder_calculation?.landscape_cost) > 5e-3) {
    parts.push(manualCostPart({
      key: "foundation:landscape",
      name: "Landscape Materials",
      type: "material",
      subtype: "landscape",
      sourcePath: "builder_calculation.landscape_cost",
      cost: project.builder_calculation.landscape_cost,
      builderData: project.landscape || {},
      calculation: { total_cost: project.builder_calculation.landscape_cost }
    }));
  }
  return parts;
}
function extractPainting(project) {
  const parts = [];
  let itemMaskTotal = 0;
  let itemPaintTotal = 0;
  let itemLaborTotal = 0;
  (project.items || []).forEach((item, index) => {
    const label = item.description || (item.item_type === "lettering" ? "Painted Lettering" : item.item_type === "complex_shapes" ? "Painted Complex Shape" : "Painted Panel");
    const quantity = item.item_type === "lettering" ? 1 : item.quantity || 1;
    const maskCost = num19(item.supplies_cost);
    const paintCost = num19(item.paint_cost);
    const laborCost = num19(item.labor_cost);
    itemMaskTotal += maskCost;
    itemPaintTotal += paintCost;
    itemLaborTotal += laborCost;
    if (Math.abs(maskCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `painting:item:${index}:mask`,
        name: `${label} \u2014 Paint Mask`,
        type: "consumable",
        subtype: "paint_mask",
        sourcePath: `items[${index}].supplies_cost`,
        cost: maskCost,
        quantity,
        unit: quantity > 1 ? "each" : "job",
        builderData: item,
        calculation: { paint_mask_sqft: item.paint_mask_sqft, paint_colors: item.paint_colors, supplies_cost: maskCost }
      }));
    }
    if (Math.abs(paintCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `painting:item:${index}:paint`,
        name: `${label} \u2014 Paint & Supplies`,
        type: "material",
        subtype: "liquid_paint_supplies",
        sourcePath: `items[${index}].paint_cost`,
        cost: paintCost,
        quantity,
        unit: quantity > 1 ? "each" : "job",
        builderData: item,
        calculation: { paintable_sqft: item.paintable_sqft, paint_gallons: item.paint_gallons, paint_colors: item.paint_colors, paint_cost: paintCost }
      }));
    }
    if (Math.abs(laborCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `painting:item:${index}:labor`,
        name: `${label} \u2014 Painting Labor`,
        type: "labor",
        subtype: "painting_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: laborCost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: item,
        calculation: { labor_hours: item.labor_hours, labor_cost: laborCost }
      }));
    }
  });
  const authoritativeMaterialTotal = num19(project.total_paint_mask_cost) + num19(project.total_liquid_paint_and_supplies_cost);
  const materialAdjustment = authoritativeMaterialTotal - itemMaskTotal - itemPaintTotal;
  if (Math.abs(materialAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "painting:material-adjustment",
      name: materialAdjustment > 0 ? "Painting Minimum / Fixed Materials" : "Painting Materials Adjustment",
      type: "material",
      subtype: "paint_material_adjustment",
      sourcePath: "total_liquid_paint_and_supplies_cost",
      cost: materialAdjustment,
      calculation: {
        authoritative_material_total: authoritativeMaterialTotal,
        item_mask_total: itemMaskTotal,
        item_paint_total: itemPaintTotal,
        adjustment: materialAdjustment
      }
    }));
  }
  const authoritativeLaborTotal = num19(project.total_labor_cost);
  const laborAdjustment = authoritativeLaborTotal - itemLaborTotal;
  if (Math.abs(laborAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "painting:fixed-labor-adjustment",
      name: laborAdjustment > 0 ? "Painting Setup / Mixing / Minimum Labor" : "Painting Labor Adjustment",
      type: "labor",
      subtype: "painting_fixed_labor",
      sourcePath: "total_labor_cost",
      cost: laborAdjustment,
      calculation: {
        authoritative_labor_total: authoritativeLaborTotal,
        item_labor_total: itemLaborTotal,
        adjustment: laborAdjustment
      }
    }));
  }
  return parts;
}
function extractCNC(project) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    if (num19(item.machine_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `cnc:item:${index}:machine`,
        name: item.description ? `${item.description} \u2014 CNC Machine Time` : "CNC Machine Time",
        type: "equipment",
        subtype: "cnc_machine_time",
        sourcePath: `items[${index}].machine_cost`,
        cost: item.machine_cost,
        quantity: item.machine_time_hours || 1,
        unit: item.machine_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { machine_time_hours: item.machine_time_hours, machine_cost: item.machine_cost, rate: project.machine_rate_per_hour }
      }));
    }
    if (num19(item.labor_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `cnc:item:${index}:labor`,
        name: item.description ? `${item.description} \u2014 CNC Setup / Handling Labor` : "CNC Setup / Handling Labor",
        type: "labor",
        subtype: "cnc_setup_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.setup_time_hours || 1,
        unit: item.setup_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { setup_time_hours: item.setup_time_hours, labor_cost: item.labor_cost, rate: project.labor_rate, hold_down: item.hold_down }
      }));
    }
  });
  const dynamicItemLabor = (project.items || []).reduce((sum, item) => sum + num19(item.labor_cost), 0);
  const fixedSetupCost = num19(
    project.builder_calculation?.totals?.fixed_setup_cost,
    num19(project.fixed_setup_hours) * num19(project.labor_rate)
  );
  if (fixedSetupCost > 5e-3) {
    parts.push(manualCostPart({
      key: "cnc:fixed-setup",
      name: "CNC Fixed Setup Labor",
      type: "labor",
      subtype: "fixed_setup",
      sourcePath: "fixed_setup_hours",
      cost: fixedSetupCost,
      quantity: project.fixed_setup_hours || 1,
      unit: project.fixed_setup_hours ? "hour" : "job",
      calculation: { fixed_setup_hours: project.fixed_setup_hours, labor_rate: project.labor_rate, cost: fixedSetupCost }
    }));
  }
  const authoritativeLaborTotal = num19(
    project.total_labor_cost,
    num19(project.builder_calculation?.totals?.total_labor_cost, dynamicItemLabor + fixedSetupCost)
  );
  const minimumLaborAdjustment = authoritativeLaborTotal - dynamicItemLabor - fixedSetupCost;
  if (Math.abs(minimumLaborAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "cnc:minimum-dynamic-labor-adjustment",
      name: minimumLaborAdjustment > 0 ? "CNC Minimum Dynamic Labor" : "CNC Labor Adjustment",
      type: "labor",
      subtype: "minimum_dynamic_labor",
      sourcePath: "total_labor_cost",
      cost: minimumLaborAdjustment,
      quantity: 1,
      unit: "job",
      calculation: {
        total_labor_cost: authoritativeLaborTotal,
        item_labor_cost: dynamicItemLabor,
        fixed_setup_cost: fixedSetupCost,
        minimum_dynamic_labor_adjustment: minimumLaborAdjustment
      }
    }));
  }
  return parts;
}
function extractLaser(project) {
  const parts = [];
  let itemMachineTotal = 0;
  let itemLaborTotal = 0;
  (project.items || []).forEach((item, index) => {
    itemMachineTotal += num19(item.machine_cost);
    itemLaborTotal += num19(item.labor_cost);
    if (num19(item.machine_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `laser:item:${index}:machine`,
        name: item.description ? `${item.description} \u2014 Laser Machine Time` : "Laser Machine Time",
        type: "equipment",
        subtype: "laser_machine_time",
        sourcePath: `items[${index}].machine_cost`,
        cost: item.machine_cost,
        quantity: item.machine_time_hours || 1,
        unit: item.machine_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { engrave_hours: item.engrave_hours, cut_hours: item.cut_hours, machine_time_hours: item.machine_time_hours, machine_cost: item.machine_cost }
      }));
    }
    if (num19(item.labor_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `laser:item:${index}:labor`,
        name: item.description ? `${item.description} \u2014 Laser Handling Labor` : "Laser Handling Labor",
        type: "labor",
        subtype: "laser_handling_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.handling_time_hours || 1,
        unit: item.handling_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { handling_time_hours: item.handling_time_hours, labor_cost: item.labor_cost }
      }));
    }
  });
  const fixedSetupCost = num19(
    project.builder_calculation?.totals?.fixed_setup_cost,
    num19(project.fixed_setup_hours) * num19(project.labor_rate)
  );
  if (fixedSetupCost > 5e-3) {
    parts.push(manualCostPart({
      key: "laser:fixed-setup",
      name: "Laser Fixed Setup Labor",
      type: "labor",
      subtype: "fixed_setup",
      sourcePath: "fixed_setup_hours",
      cost: fixedSetupCost,
      quantity: project.fixed_setup_hours || 1,
      unit: project.fixed_setup_hours ? "hour" : "job",
      calculation: { fixed_setup_hours: project.fixed_setup_hours, labor_rate: project.labor_rate, cost: fixedSetupCost }
    }));
  }
  const authoritativeMachineTotal = num19(
    project.total_machine_cost,
    num19(project.builder_calculation?.totals?.total_machine_cost, itemMachineTotal)
  );
  const machineAdjustment = authoritativeMachineTotal - itemMachineTotal;
  if (Math.abs(machineAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "laser:machine-adjustment",
      name: "Laser Machine Cost Adjustment",
      type: "equipment",
      subtype: "machine_adjustment",
      sourcePath: "total_machine_cost",
      cost: machineAdjustment,
      calculation: { total_machine_cost: authoritativeMachineTotal, item_machine_cost: itemMachineTotal, adjustment: machineAdjustment }
    }));
  }
  const authoritativeLaborTotal = num19(
    project.total_labor_cost,
    num19(project.builder_calculation?.totals?.total_labor_cost, itemLaborTotal + fixedSetupCost)
  );
  const laborAdjustment = authoritativeLaborTotal - itemLaborTotal - fixedSetupCost;
  if (Math.abs(laborAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "laser:labor-adjustment",
      name: "Laser Labor Adjustment",
      type: "labor",
      subtype: "labor_adjustment",
      sourcePath: "total_labor_cost",
      cost: laborAdjustment,
      calculation: { total_labor_cost: authoritativeLaborTotal, item_labor_cost: itemLaborTotal, fixed_setup_cost: fixedSetupCost, adjustment: laborAdjustment }
    }));
  }
  const authoritativeSupplies = num19(
    project.total_supplies_cost,
    num19(project.fixed_material_setup_cost, project.builder_calculation?.totals?.total_supplies_cost)
  );
  if (Math.abs(authoritativeSupplies) > 5e-3) {
    parts.push(manualCostPart({
      key: "laser:fixed-material-setup",
      name: "Laser Material Setup / Consumables",
      type: "consumable",
      subtype: "material_setup",
      sourcePath: "total_supplies_cost",
      cost: authoritativeSupplies,
      calculation: { fixed_material_setup_cost: project.fixed_material_setup_cost, total_supplies_cost: authoritativeSupplies }
    }));
  }
  return parts;
}
function extractManualItems(project, moduleKey) {
  return (project.items || []).map((item, index) => makePart({
    key: `${moduleKey}:item:${index}`,
    name: item.description || `${moduleKey.toUpperCase()} item ${index + 1}`,
    type: "fabrication",
    subtype: item.item_type || moduleKey,
    sourcePath: `items[${index}]`,
    quantity: item.quantity || 1,
    unit: "item",
    unitCost: item.quantity ? num19(item.item_total_cost) / num19(item.quantity, 1) : 0,
    extendedCost: item.item_total_cost,
    builderData: item,
    calculation: item
  }));
}
var _extractCache = /* @__PURE__ */ new WeakMap();
function extractBuilderParts(moduleKey, project, catalogs = {}, options = {}) {
  if (!project) return [];
  if (typeof project !== "object") return _extractBuilderPartsComputed(moduleKey, project, catalogs, options);
  const key = `${moduleKey}|${options?.legacyMode ? 1 : 0}`;
  let byKey = _extractCache.get(project);
  const hit = byKey?.get(key);
  if (hit && hit.catalogs === catalogs) return hit.out;
  const out = _extractBuilderPartsComputed(moduleKey, project, catalogs, options);
  if (!byKey) {
    byKey = /* @__PURE__ */ new Map();
    _extractCache.set(project, byKey);
  }
  byKey.set(key, { catalogs, out });
  return out;
}
function _extractBuilderPartsComputed(moduleKey, project, catalogs = {}, options = {}) {
  switch (moduleKey) {
    case "foundation":
      return extractFoundation(project, catalogs);
    case "channel_letters":
      return extractChannel(project, catalogs);
    case "vinyl":
      return extractVinyl(project, catalogs, options);
    case "metal":
      return extractMetal(project);
    case "brick_stone":
      return extractBrick(project, catalogs, options);
    case "maintenance":
      return extractMaintenance(project, catalogs, options);
    case "painting":
      return extractPainting(project);
    case "cnc":
      return extractCNC(project);
    case "laser":
      return extractLaser(project);
    default:
      return extractManualItems(project, moduleKey || "legacy");
  }
}
var FOUNDATION_REINFORCEMENT_FROZEN_UNKNOWN = { version: 1, state: "unrecorded" };
var isPendingFoundationReinforcementRemoval = (part) => isFoundationReinforcementV2Descriptor(part) && part.builder_sync_state === "linked" && part.builder_data?.[PENDING_REMOVAL_KEY] === true && part.current_unit_cost === 0 && part.current_extended_cost === 0;
var isFoundationReinforcementV2Descriptor = (d) => d?.pricing_basis_snapshot?.pricing_mode === "foundation_reinforcement_v2" && d?.pricing_basis_snapshot?.reinforcement?.version === 1 && d?.pricing_basis_snapshot?.reinforcement?.calculation_version === 2;
function foundationReinforcementCatalogBasisIsCurrent(descriptor, row) {
  const saved = descriptor.pricing_basis_snapshot?.reinforcement?.material;
  if (!saved || saved.kind !== "catalog" || typeof saved.inventory_updated_date !== "string" || !saved.inventory_updated_date.trim() || !row || row.id !== descriptor.inventory_item_id) return false;
  const resolution = resolveFoundationReinforcementBasis({
    material: descriptor.builder_data?.reinforcement_material,
    inventory: [row],
    settings: {},
    quantityOverride: descriptor.builder_data?.custom_rebar_qty ?? null,
    rateOverride: descriptor.builder_data?.custom_rebar_cost_per_ft ?? null
  });
  if (resolution.issues.length) return false;
  const current = resolution.materialSnapshot;
  return [
    "kind",
    "inventory_id",
    "inventory_updated_date",
    "pricing_unit",
    "original_unit",
    "bar_diameter_inches",
    "weight_lb_per_ft",
    "cost_per_ft",
    "rate_source"
  ].every((field) => saved[field] === current[field]);
}
function effectiveCurrentUnitCost(descriptor, row) {
  if (isFoundationReinforcementV2Descriptor(descriptor)) {
    const value = descriptor.unit_cost;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      const err = new Error("Reinforcement v2 unit cost must be a finite non-negative number.");
      err.code = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
      throw err;
    }
    return value;
  }
  if (Number.isFinite(Number(descriptor.unit_cost)) && Number(descriptor.unit_cost) !== 0) {
    return Number(descriptor.unit_cost);
  }
  return genericUnitCost(row);
}
async function syncBuilderParts({ builderProduct, sourceProject, acceptPrices = false, legacyMode = false, builderRecalculated = false, catalogsOverride = null, strictCatalogs = false, existingPartsOverride = null, inventoryRowsOverride = null, skipUnchangedWrites = false, planOnly = false, planTimestamp = "" }) {
  if (!builderProduct?.id || !sourceProject) {
    return {
      partCount: 0,
      detachedCount: 0,
      changedCount: 0,
      newPartCount: 0,
      removedPartCount: 0,
      writesPerformed: 0,
      recalcRequired: false,
      recalcReason: "",
      usesDirectLiveReprice: false,
      currentPartsTotal: 0,
      frozenPartsTotal: 0,
      currentMarkupTotal: 0,
      frozenMarkupTotal: 0,
      manualAddonFrozenTotal: 0,
      manualAddonCurrentTotal: 0,
      parts: [],
      partWritePlan: []
    };
  }
  const catalogs = catalogsOverride || await loadBuilderCatalogs(builderProduct.module_key, { strict: strictCatalogs });
  const descriptors = extractBuilderParts(builderProduct.module_key, sourceProject, catalogs, { legacyMode });
  const existing = existingPartsOverride || await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProduct.id }, sort: "sort_order", label: "Builder Parts" });
  const byKey = new Map((existing || []).map((part) => [part.part_key, part]));
  const seen = /* @__PURE__ */ new Set();
  const synced = [];
  let detachedCount = 0;
  let changedCount = 0;
  let newPartCount = 0;
  let removedPartCount = 0;
  let writesPerformed = 0;
  let recalcRequired = false;
  let staleV2CatalogSeen = false;
  const recalcPartNames = [];
  const partWritePlan = [];
  const syncNow = () => planTimestamp || nowIso();
  const directLiveReprice = DIRECT_LIVE_REPRICE_MODULES.has(builderProduct.module_key);
  const writePartUpdate = async (old, patch) => {
    const step = {
      operation: "update",
      part_id: old.id,
      part_key: old.part_key,
      expected_updated_date: old.updated_date || "",
      patch
    };
    partWritePlan.push(step);
    if (planOnly) return { ...old, ...patch };
    const saved = await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderPart,
      id: old.id,
      expectedUpdatedAt: old.updated_date || "",
      expectedFields: expectedBuilderEntityFields(old, patch),
      nextFields: patch,
      guardFields: { builder_product_id: old.builder_product_id },
      label: `Builder Part \u201C${old.part_name || "Part"}\u201D synchronization`
    });
    writesPerformed += 1;
    return saved;
  };
  const writePartCreate = async (data) => {
    const step = {
      operation: "create",
      part_key: data.part_key,
      data
    };
    partWritePlan.push(step);
    if (planOnly) return { ...data, id: `planned:${data.part_key}`, updated_date: "" };
    const { record: created, status } = await createBuilderPartWithRecovery({
      entity: staffEntities.BuilderPart,
      data,
      label: `Builder Part \u201C${data.part_name || data.part_key || "Part"}\u201D synchronization`
    });
    if (status !== "existing") writesPerformed += 1;
    return created;
  };
  const WRITE_CONCURRENCY = 4;
  const writeJobs = [];
  const queueWrite = (work) => {
    const slot = synced.length;
    synced.push(null);
    writeJobs.push(async () => {
      synced[slot] = await work();
    });
  };
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    seen.add(descriptor.part_key);
    const isV2 = isFoundationReinforcementV2Descriptor(descriptor);
    const old = byKey.get(descriptor.part_key);
    const resolvedEntity = findEntity(catalogs, descriptor.inventory_item_id, descriptor.inventory_entity);
    if (old?.builder_sync_state === "detached_override") {
      const currentRow2 = findRow(catalogs, old.inventory_entity || resolvedEntity, old.inventory_item_id || descriptor.inventory_item_id);
      const candidateId = descriptor.inventory_item_id || old.inventory_item_id || old.original_inventory_item_id || "";
      const candidateEntity = findEntity(catalogs, candidateId, old.inventory_entity || resolvedEntity);
      const candidateRow = findRow(catalogs, candidateEntity, candidateId);
      const corePatch = {
        inventory_link_state: currentRow2 ? "attached" : old.inventory_link_state,
        current_inventory_snapshot: currentRow2 || old.current_inventory_snapshot || {},
        reattach_candidate_id: candidateId,
        reattach_candidate_name: rowName(candidateEntity, candidateRow) || old.inventory_item_name || descriptor.part_name,
        price_state: "detached",
        is_active: true
      };
      if (!skipUnchangedWrites || patchDiffers(old, corePatch)) {
        const patch2 = { ...corePatch, last_price_check_at: syncNow() };
        queueWrite(() => writePartUpdate(old, patch2));
      } else {
        synced.push(old);
      }
      detachedCount += 1;
      continue;
    }
    const currentRow = findRow(catalogs, resolvedEntity, descriptor.inventory_item_id);
    const currentName = rowName(resolvedEntity, currentRow) || descriptor.part_name;
    const oldFrozenName = old?.inventory_item_name || rowName(old?.inventory_entity, old?.frozen_inventory_snapshot) || descriptor.part_name;
    const candidate = isV2 && !descriptor.inventory_item_id ? null : !currentRow && oldFrozenName ? findNameCandidate(catalogs, old?.inventory_entity || resolvedEntity, oldFrozenName) : null;
    const hasInventoryLink = isV2 ? !!descriptor.inventory_item_id : !!descriptor.inventory_item_id || !!old?.inventory_item_id || !!old?.original_inventory_item_id;
    const detached = hasInventoryLink && !currentRow;
    const currentPricing = pricingSnapshot(currentRow);
    const frozenPricing = pricingSnapshot(old?.frozen_inventory_snapshot);
    const linkChanged = isV2 ? !!old && (descriptor.inventory_item_id !== (old.inventory_item_id || "") || descriptor.inventory_entity !== (old.inventory_entity || "")) : !!old && !!descriptor.inventory_item_id && descriptor.inventory_item_id !== (old.inventory_item_id || old.original_inventory_item_id);
    const catalogBasisCurrent = isV2 ? !hasInventoryLink || !!currentRow && foundationReinforcementCatalogBasisIsCurrent(descriptor, currentRow) : null;
    const staleV2Catalog = isV2 && hasInventoryLink && !!currentRow && !catalogBasisCurrent;
    const pricingChanged = !!old && !!currentRow && !same(currentPricing, frozenPricing);
    const changed = linkChanged || pricingChanged;
    const currentUnitCost = effectiveCurrentUnitCost(descriptor, currentRow);
    const currentExtended = num19(descriptor.extended_cost);
    const timestamp = syncNow();
    if (staleV2Catalog && (acceptPrices || builderProduct.price_state === "unchecked")) {
      const err = new Error("Current reinforcement catalog basis could not be verified. Reopen and save Foundation before accepting Update Price.");
      err.code = "FOUNDATION_REINFORCEMENT_RECALC_REQUIRED";
      throw err;
    }
    const lastBuilderCalculatedPricing = old?.pricing_basis_snapshot?.builder_calculated_inventory_pricing || {};
    const builderAlreadyCalculatedCurrentPricing = !!old && same(currentPricing, lastBuilderCalculatedPricing);
    if (isV2) {
      if (staleV2Catalog) {
        recalcRequired = true;
        staleV2CatalogSeen = true;
        recalcPartNames.push(currentName || descriptor.part_name);
      }
    } else if (pricingChanged && !legacyMode && builderProduct.price_state !== "unchecked" && !directLiveReprice && !builderRecalculated && !builderAlreadyCalculatedCurrentPricing) {
      recalcRequired = true;
      recalcPartNames.push(currentName || descriptor.part_name);
    }
    let linkState = "manual";
    if (hasInventoryLink) {
      if (currentRow) linkState = "attached";
      else if (candidate) linkState = "reattach_available";
      else linkState = "detached";
    }
    if (detached) detachedCount += 1;
    if (changed) changedCount += 1;
    if (!old) {
      const establishBaseline = legacyMode || builderProduct.price_state === "unchecked" || acceptPrices;
      const initialFrozenUnit = establishBaseline ? descriptor.unit_cost || currentUnitCost : 0;
      const initialFrozenExtended = establishBaseline ? num19(descriptor.extended_cost) : 0;
      if (!establishBaseline) {
        changedCount += 1;
        newPartCount += 1;
      }
      queueWrite(() => writePartCreate({
        builder_product_id: builderProduct.id,
        part_key: descriptor.part_key,
        sort_order: index,
        part_name: descriptor.part_name,
        part_type: descriptor.part_type,
        part_subtype: descriptor.part_subtype,
        source_module_key: builderProduct.module_key,
        source_path: descriptor.source_path,
        builder_sync_state: "linked",
        inventory_entity: resolvedEntity,
        inventory_item_id: descriptor.inventory_item_id,
        original_inventory_item_id: descriptor.inventory_item_id,
        inventory_item_name: currentName,
        inventory_link_state: linkState,
        reattach_candidate_id: candidate?.id || "",
        reattach_candidate_name: candidate ? rowName(old?.inventory_entity || resolvedEntity, candidate) : "",
        frozen_inventory_snapshot: establishBaseline ? currentRow || {} : {},
        current_inventory_snapshot: currentRow || {},
        builder_data: descriptor.builder_data,
        calculation_snapshot: descriptor.calculation_snapshot,
        pricing_basis_snapshot: {
          ...descriptor.pricing_basis_snapshot,
          inventory_pricing: currentPricing,
          ...isV2 ? {
            reinforcement_catalog_basis_current: catalogBasisCurrent,
            builder_calculated_inventory_pricing: catalogBasisCurrent ? currentPricing : {},
            reinforcement_frozen_pricing: acceptPrices || establishBaseline && !legacyMode ? captureFoundationReinforcementFrozenPricing({ ...descriptor, current_unit_cost: currentUnitCost, current_extended_cost: currentExtended }) : { ...FOUNDATION_REINFORCEMENT_FROZEN_UNKNOWN }
          } : builderRecalculated ? { builder_calculated_inventory_pricing: currentPricing } : {}
        },
        quantity: descriptor.quantity,
        unit: descriptor.unit,
        frozen_unit_cost: initialFrozenUnit,
        frozen_extended_cost: initialFrozenExtended,
        current_unit_cost: currentUnitCost,
        current_extended_cost: currentExtended,
        price_state: legacyMode ? "legacy_frozen" : detached ? "detached" : establishBaseline ? "current" : "changed",
        price_delta: currentExtended - initialFrozenExtended,
        price_delta_percent: initialFrozenExtended ? (currentExtended - initialFrozenExtended) / initialFrozenExtended * 100 : 0,
        inventory_updated_date_snapshot: establishBaseline ? currentRow?.updated_date || "" : "",
        last_price_check_at: timestamp,
        last_price_update_at: acceptPrices ? timestamp : "",
        manual_cost_override: !hasInventoryLink,
        manual_cost: !hasInventoryLink ? isV2 ? descriptor.unit_cost : descriptor.extended_cost : void 0,
        is_active: true,
        notes: legacyMode ? "Backfilled from an existing Builder Product. Saved estimator costs remain authoritative; catalog snapshot is compatibility context." : establishBaseline ? "" : "New Builder Part added after the Product price was frozen. Frozen cost remains $0 until Update Price is explicitly accepted."
      }));
      continue;
    }
    const shouldAccept = acceptPrices && !detached;
    const frozenUnit = shouldAccept ? currentUnitCost : num19(old.frozen_unit_cost, descriptor.unit_cost || currentUnitCost);
    const frozenExtended = shouldAccept ? currentExtended : num19(old.frozen_extended_cost, descriptor.extended_cost);
    const state = detached ? "detached" : legacyMode || old.price_state === "legacy_frozen" ? "legacy_frozen" : changed || Math.abs(currentExtended - frozenExtended) > 5e-3 ? "changed" : "current";
    const patch = {
      sort_order: index,
      part_name: descriptor.part_name,
      part_type: descriptor.part_type,
      part_subtype: descriptor.part_subtype,
      source_module_key: builderProduct.module_key,
      source_path: descriptor.source_path,
      inventory_entity: isV2 ? descriptor.inventory_entity : resolvedEntity || old.inventory_entity,
      inventory_item_id: descriptor.inventory_item_id,
      inventory_item_name: currentName || old.inventory_item_name,
      inventory_link_state: linkState,
      reattach_candidate_id: candidate?.id || "",
      reattach_candidate_name: candidate ? rowName(old.inventory_entity || resolvedEntity, candidate) : "",
      current_inventory_snapshot: currentRow || {},
      builder_data: descriptor.builder_data,
      calculation_snapshot: descriptor.calculation_snapshot,
      pricing_basis_snapshot: {
        ...descriptor.pricing_basis_snapshot,
        inventory_pricing: currentPricing,
        ...isV2 ? {
          reinforcement_catalog_basis_current: catalogBasisCurrent,
          builder_calculated_inventory_pricing: catalogBasisCurrent ? currentPricing : {},
          reinforcement_frozen_pricing: shouldAccept ? captureFoundationReinforcementFrozenPricing({ ...descriptor, current_unit_cost: currentUnitCost, current_extended_cost: currentExtended }) : preserveFoundationReinforcementFrozenPricing(old)
        } : { builder_calculated_inventory_pricing: builderRecalculated ? currentPricing : old.pricing_basis_snapshot?.builder_calculated_inventory_pricing || {} }
      },
      quantity: descriptor.quantity,
      unit: descriptor.unit,
      current_unit_cost: currentUnitCost,
      current_extended_cost: currentExtended,
      price_state: shouldAccept ? "current" : state,
      price_delta: currentExtended - frozenExtended,
      price_delta_percent: frozenExtended ? (currentExtended - frozenExtended) / frozenExtended * 100 : 0,
      is_active: true,
      ...isV2 ? { manual_cost_override: !hasInventoryLink, ...!hasInventoryLink ? { manual_cost: descriptor.unit_cost } : {} } : {}
    };
    if (shouldAccept) {
      patch.frozen_inventory_snapshot = isV2 && !hasInventoryLink ? {} : currentRow || old.frozen_inventory_snapshot || {};
      patch.frozen_unit_cost = frozenUnit;
      patch.frozen_extended_cost = frozenExtended;
      patch.inventory_updated_date_snapshot = isV2 && !hasInventoryLink ? "" : currentRow?.updated_date || old.inventory_updated_date_snapshot || "";
      patch.last_price_update_at = timestamp;
    }
    if (!skipUnchangedWrites || patchDiffers(old, patch)) {
      const writePatch = { ...patch, last_price_check_at: timestamp };
      queueWrite(() => writePartUpdate(old, writePatch));
    } else {
      synced.push(old);
    }
  }
  const addonRowKeys = /* @__PURE__ */ new Map();
  for (const old of existing || []) {
    if (seen.has(old.part_key) || old.is_active === false) continue;
    if (old.builder_sync_state !== "manual_addon") continue;
    if (!old.inventory_entity || !old.inventory_item_id || old.manual_cost_override) continue;
    const key = `${old.inventory_entity}:${old.inventory_item_id}`;
    if (!inventoryRowsOverride?.has(key) && !addonRowKeys.has(key)) addonRowKeys.set(key, old);
  }
  const addonRows = /* @__PURE__ */ new Map();
  const addonKeys = [...addonRowKeys.keys()];
  for (let i = 0; i < addonKeys.length; i += WRITE_CONCURRENCY) {
    await Promise.all(addonKeys.slice(i, i + WRITE_CONCURRENCY).map(async (key) => {
      const part = addonRowKeys.get(key);
      try {
        addonRows.set(key, await staffEntities[part.inventory_entity].get(part.inventory_item_id));
      } catch (error) {
        if (strictCatalogs) {
          throw new Error(`${part.inventory_entity} inventory could not be verified for Part \u201C${part.part_name || "Part"}\u201D: ${error?.message || "read failed"}`);
        }
      }
    }));
  }
  for (const old of existing || []) {
    if (seen.has(old.part_key) || old.is_active === false) continue;
    if (old.builder_sync_state === "detached_override") {
      detachedCount += 1;
      synced.push(old);
      continue;
    }
    if (old.builder_sync_state === "manual_addon") {
      const syncedSlot = synced.length;
      synced.push(old);
      if (old.inventory_entity && old.inventory_item_id && !old.manual_cost_override) {
        let currentRow = null;
        const inventoryKey = `${old.inventory_entity}:${old.inventory_item_id}`;
        if (inventoryRowsOverride?.has(inventoryKey)) {
          currentRow = inventoryRowsOverride.get(inventoryKey);
        } else {
          currentRow = addonRows.get(inventoryKey) || null;
        }
        if (currentRow) {
          const currentUnit = independentPartUnitCost(old, currentRow);
          const currentExtended = currentUnit * num19(old.quantity, 1);
          const changed = Math.abs(currentExtended - num19(old.frozen_extended_cost)) > 5e-3 || !same(pricingSnapshot(currentRow), pricingSnapshot(old.frozen_inventory_snapshot));
          const patch = {
            current_inventory_snapshot: currentRow,
            current_unit_cost: currentUnit,
            current_extended_cost: currentExtended,
            inventory_link_state: "attached",
            price_state: changed ? "changed" : "current",
            price_delta: currentExtended - num19(old.frozen_extended_cost),
            price_delta_percent: num19(old.frozen_extended_cost) ? (currentExtended - num19(old.frozen_extended_cost)) / num19(old.frozen_extended_cost) * 100 : 0,
            is_active: true
          };
          if (changed) changedCount += 1;
          if (!skipUnchangedWrites || patchDiffers(old, patch)) {
            const writePatch = { ...patch, last_price_check_at: syncNow() };
            writeJobs.push(async () => {
              synced[syncedSlot] = await writePartUpdate(old, writePatch);
            });
          }
        } else {
          const patch = {
            inventory_link_state: "detached",
            price_state: "detached",
            is_active: true
          };
          if (!skipUnchangedWrites || patchDiffers(old, patch)) {
            const writePatch = { ...patch, last_price_check_at: syncNow() };
            writeJobs.push(async () => {
              synced[syncedSlot] = await writePartUpdate(old, writePatch);
            });
          }
        }
      }
      continue;
    }
    const frozenRemovedCost = num19(old.frozen_extended_cost);
    if (Math.abs(frozenRemovedCost) <= 5e-3) {
      writeJobs.push(() => writePartUpdate(old, {
        is_active: false,
        current_unit_cost: 0,
        current_extended_cost: 0,
        price_state: "current",
        price_delta: 0,
        price_delta_percent: 0,
        last_price_check_at: syncNow(),
        notes: `${old.notes ? `${old.notes}
` : ""}Part removed from Builder before it carried a frozen cost; historical row retained inactive.`
      }));
      continue;
    }
    const alreadyPendingRemoval = !!old.builder_data?.[PENDING_REMOVAL_KEY];
    const removalNote = "Part no longer exists in the current Builder. Frozen cost is retained until Update Price accepts its removal.";
    const pendingRemoval = {
      current_unit_cost: 0,
      current_extended_cost: 0,
      price_state: "changed",
      price_delta: -frozenRemovedCost,
      price_delta_percent: -100,
      builder_data: { ...old.builder_data || {}, [PENDING_REMOVAL_KEY]: true },
      is_active: true,
      notes: alreadyPendingRemoval ? old.notes || removalNote : `${old.notes ? `${old.notes}
` : ""}${removalNote}`
    };
    if (!skipUnchangedWrites || patchDiffers(old, pendingRemoval)) {
      const writePatch = { ...pendingRemoval, last_price_check_at: syncNow() };
      queueWrite(() => writePartUpdate(old, writePatch));
    } else {
      synced.push(old);
    }
    changedCount += 1;
    removedPartCount += 1;
  }
  for (let i = 0; i < writeJobs.length; i += WRITE_CONCURRENCY) {
    await Promise.all(writeJobs.slice(i, i + WRITE_CONCURRENCY).map((run) => run()));
  }
  const activeEconomicParts = synced.filter((part) => part.is_active !== false);
  const currentPartsTotal = activeEconomicParts.reduce(
    (sum, part) => sum + num19(part.current_extended_cost, num19(part.frozen_extended_cost)),
    0
  );
  const frozenPartsTotal = activeEconomicParts.reduce(
    (sum, part) => sum + num19(part.frozen_extended_cost),
    0
  );
  const markupParts = activeEconomicParts.filter((part) => part.part_subtype === "markup");
  const currentMarkupTotal = markupParts.reduce(
    (sum, part) => sum + num19(part.current_extended_cost, num19(part.frozen_extended_cost)),
    0
  );
  const frozenMarkupTotal = markupParts.reduce((sum, part) => sum + num19(part.frozen_extended_cost), 0);
  const manualAddons = activeEconomicParts.filter((part) => part.builder_sync_state === "manual_addon");
  const manualAddonFrozenTotal = manualAddons.reduce((sum, part) => sum + num19(part.frozen_extended_cost), 0);
  const manualAddonCurrentTotal = manualAddons.reduce((sum, part) => sum + num19(part.current_extended_cost, num19(part.frozen_extended_cost)), 0);
  const uniqueRecalcNames = [...new Set(recalcPartNames.filter(Boolean))];
  return {
    partCount: activeEconomicParts.length,
    detachedCount,
    changedCount,
    newPartCount,
    removedPartCount,
    writesPerformed,
    recalcRequired,
    recalcReason: recalcRequired ? staleV2CatalogSeen ? "Current reinforcement catalog basis could not be verified. Reopen and save Foundation before accepting Update Price." : `Master Inventory changed after this ${builderProduct.builder_name || "Builder"} was last calculated${uniqueRecalcNames.length ? `: ${uniqueRecalcNames.slice(0, 4).join(", ")}${uniqueRecalcNames.length > 4 ? "\u2026" : ""}` : ""}. Reopen and save the Builder before accepting Update Price.` : "",
    usesDirectLiveReprice: directLiveReprice && !legacyMode,
    currentPartsTotal,
    frozenPartsTotal,
    currentMarkupTotal,
    frozenMarkupTotal,
    manualAddonFrozenTotal,
    manualAddonCurrentTotal,
    parts: synced,
    partWritePlan
  };
}
function assertUniqueBuilderPartKeys(parts, builderProductId, label = "Builder Parts") {
  if (!Array.isArray(parts)) throw new Error(`${label} could not be verified while recovering a Builder mutation.`);
  const seen = /* @__PURE__ */ new Map();
  for (const part of parts) {
    if (String(part?.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error(`${label} contains a Part owned by a different Builder Product. Recovery stopped before continuing.`);
    }
    const key = String(part?.part_key || "").trim();
    if (!key) continue;
    if (seen.has(key)) {
      throw new Error(`${label} contains multiple Parts with key \u201C${key}\u201D for the same Builder Product. Recovery stopped without choosing between duplicate Parts.`);
    }
    seen.set(key, part.id || "");
  }
  return true;
}
async function applyBuilderPartPriceAcceptancePlan(builderProductId, plan, { partsOverride = void 0 } = {}) {
  const parts = partsOverride !== void 0 ? partsOverride : await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Parts" });
  assertUniqueBuilderPartKeys(parts, builderProductId);
  const byId = new Map(parts.map((part) => [part.id, part]));
  const byKey = new Map(parts.map((part) => [part.part_key, part]));
  let writesPerformed = 0;
  let createdAny = false;
  for (const step of plan?.part_updates || []) {
    if (step.operation === "create") {
      const data = step.data || {};
      const existing = byKey.get(step.part_key || data.part_key);
      if (existing) {
        if (existing.builder_product_id !== builderProductId) {
          throw new Error("A planned Builder Part key is now owned by a different Product. Reload before continuing.");
        }
        if (patchDiffers(existing, data)) {
          throw new Error(`Part \u201C${existing.part_name || "Part"}\u201D appeared while the Builder mutation was pending with different data. No unrelated Part was overwritten.`);
        }
        continue;
      }
      const { record: created, status } = await createBuilderPartWithRecovery({
        entity: staffEntities.BuilderPart,
        data,
        label: `Builder Part \u201C${data.part_name || data.part_key || "Part"}\u201D recovery create`
      });
      if (status !== "existing") {
        writesPerformed += 1;
        createdAny = true;
      }
      if (created?.id) byId.set(created.id, created);
      if (created?.part_key) byKey.set(created.part_key, created);
      continue;
    }
    const part = byId.get(step.part_id);
    if (!part || part.builder_product_id !== builderProductId) {
      throw new Error("A Builder Part changed ownership while a Builder mutation was pending. Reload before continuing.");
    }
    const targetPatch = step.patch || {};
    if (!patchDiffers(part, targetPatch)) continue;
    const expected = String(step.expected_updated_date || "").trim();
    const current = String(part.updated_date || "").trim();
    if (expected && current && current !== expected) {
      throw new Error(`Part \u201C${part.part_name || "Part"}\u201D changed while a Builder mutation was pending. No unrelated Part edit was overwritten.`);
    }
    await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderPart,
      id: part.id,
      expectedUpdatedAt: part.updated_date || "",
      expectedFields: expectedBuilderEntityFields(part, targetPatch),
      nextFields: targetPatch,
      guardFields: { builder_product_id: builderProductId },
      label: `Builder Part \u201C${part.part_name || "Part"}\u201D recovery update`
    });
    writesPerformed += 1;
  }
  if (createdAny) {
    const verifiedParts = await loadAllEntityRows({
      entity: staffEntities.BuilderPart,
      query: { builder_product_id: builderProductId },
      sort: "sort_order",
      label: "Builder Parts post-create verification"
    });
    assertUniqueBuilderPartKeys(verifiedParts, builderProductId, "Builder Parts post-create verification");
  }
  return { writesPerformed };
}
async function acceptBuilderPartPrices(builderProductId, {
  builderOverride = void 0,
  partsOverride = void 0,
  apply = true,
  timestamp = nowIso()
} = {}) {
  const [parts, builder] = await Promise.all([
    partsOverride !== void 0 ? Promise.resolve(partsOverride) : loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Parts" }),
    builderOverride !== void 0 ? Promise.resolve(builderOverride) : staffEntities.BuilderProduct.get(builderProductId)
  ]);
  if (!builder?.id || builder.id !== builderProductId) {
    throw new Error("Builder Product could not be verified before accepting Part prices.");
  }
  if (!Array.isArray(parts)) {
    throw new Error("Builder Parts could not be verified before accepting pricing.");
  }
  if (parts.some((part) => part?.builder_product_id !== builderProductId)) {
    throw new Error("Builder Part ownership changed before pricing could be accepted. Reload the estimate and try again.");
  }
  const activeParts = parts.filter((row) => row.is_active !== false);
  const detachedParts = activeParts.filter(
    (part) => !isPendingFoundationReinforcementRemoval(part) && (part.builder_sync_state === "detached_override" || ["detached", "reattach_available"].includes(part.inventory_link_state))
  );
  if (detachedParts.length > 0) {
    return {
      changedParts: [],
      detachedCount: detachedParts.length,
      detachedParts: detachedParts.map((part) => ({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        inventory_item_name: part.inventory_item_name,
        reattach_candidate_id: part.reattach_candidate_id || "",
        reattach_candidate_name: part.reattach_candidate_name || ""
      }))
    };
  }
  const staleCatalogParts = !builder || DIRECT_LIVE_REPRICE_MODULES.has(builder.module_key) ? [] : activeParts.filter((part) => {
    if (["manual", "manual_addon", "detached_override"].includes(part.builder_sync_state)) return false;
    if (isPendingFoundationReinforcementRemoval(part)) return false;
    if (isFoundationReinforcementV2Descriptor(part) && part.inventory_item_id && part.pricing_basis_snapshot?.reinforcement_catalog_basis_current !== true) return true;
    if (builder.price_state === "unchecked") return false;
    const currentPricing = pricingSnapshot(part.current_inventory_snapshot);
    const frozenPricing = pricingSnapshot(part.frozen_inventory_snapshot);
    if (same(currentPricing, frozenPricing)) return false;
    const builderCalculatedPricing = part.pricing_basis_snapshot?.builder_calculated_inventory_pricing || {};
    return !same(currentPricing, builderCalculatedPricing);
  });
  if (builder?.price_recalc_required || staleCatalogParts.length > 0) {
    return {
      changedParts: [],
      detachedCount: 0,
      detachedParts: [],
      recalcRequired: true,
      recalcParts: staleCatalogParts.map((part) => ({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        inventory_item_name: part.inventory_item_name
      })),
      recalcReason: builder?.price_recalc_reason || "Master Inventory changed after this Builder was last calculated. Reopen and save the Builder before accepting Update Price."
    };
  }
  const changedParts = [];
  const partUpdates = [];
  let activePartCount = 0;
  for (const part of activeParts) {
    const pendingRemoval = !!part.builder_data?.[PENDING_REMOVAL_KEY];
    const linkedV2 = isFoundationReinforcementV2Descriptor(part) && part.builder_sync_state === "linked";
    const nextV2Context = linkedV2 ? pendingRemoval ? { ...FOUNDATION_REINFORCEMENT_FROZEN_UNKNOWN } : captureFoundationReinforcementFrozenPricing(part) : null;
    const contextChanged = linkedV2 && !same(part.pricing_basis_snapshot?.reinforcement_frozen_pricing ?? { ...FOUNDATION_REINFORCEMENT_FROZEN_UNKNOWN }, nextV2Context);
    const wasChanged = part.price_state === "changed" || contextChanged || Math.abs(num19(part.current_extended_cost) - num19(part.frozen_extended_cost)) > 5e-3 || !same(pricingSnapshot(part.current_inventory_snapshot), pricingSnapshot(part.frozen_inventory_snapshot));
    if (wasChanged) {
      changedParts.push({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        previous_inventory_item_id: part.original_inventory_item_id || part.inventory_item_id,
        current_inventory_item_id: part.inventory_item_id,
        previous_unit_cost: num19(part.frozen_unit_cost),
        new_unit_cost: num19(part.current_unit_cost),
        previous_extended_cost: num19(part.frozen_extended_cost),
        new_extended_cost: num19(part.current_extended_cost),
        previous_inventory_snapshot: part.frozen_inventory_snapshot || {},
        new_inventory_snapshot: part.current_inventory_snapshot || {},
        ...linkedV2 ? {
          previous_reinforcement_frozen_pricing: structuredClone(part.pricing_basis_snapshot?.reinforcement_frozen_pricing ?? { ...FOUNDATION_REINFORCEMENT_FROZEN_UNKNOWN }),
          new_reinforcement_frozen_pricing: structuredClone(nextV2Context)
        } : {},
        action: pendingRemoval ? "remove" : Math.abs(num19(part.frozen_extended_cost)) <= 5e-3 && Math.abs(num19(part.current_extended_cost)) > 5e-3 ? "add" : "price_update"
      });
    }
    const acceptedBuilderData = { ...part.builder_data || {} };
    delete acceptedBuilderData[PENDING_REMOVAL_KEY];
    partUpdates.push({
      part_id: part.id,
      expected_updated_date: part.updated_date || "",
      patch: {
        frozen_inventory_snapshot: part.current_inventory_snapshot || part.frozen_inventory_snapshot || {},
        frozen_unit_cost: num19(part.current_unit_cost, num19(part.frozen_unit_cost)),
        frozen_extended_cost: num19(part.current_extended_cost, num19(part.frozen_extended_cost)),
        inventory_updated_date_snapshot: part.current_inventory_snapshot?.updated_date || part.inventory_updated_date_snapshot || "",
        price_state: "current",
        price_delta: 0,
        price_delta_percent: 0,
        builder_data: acceptedBuilderData,
        is_active: !pendingRemoval,
        last_price_update_at: timestamp,
        ...linkedV2 ? { pricing_basis_snapshot: { ...part.pricing_basis_snapshot || {}, reinforcement_frozen_pricing: nextV2Context } } : {}
      }
    });
    if (!pendingRemoval) activePartCount += 1;
  }
  const acceptancePlan = {
    timestamp,
    part_updates: partUpdates,
    changed_parts: changedParts,
    active_part_count: activePartCount
  };
  if (apply) {
    await applyBuilderPartPriceAcceptancePlan(builderProductId, acceptancePlan, { partsOverride: parts });
  }
  return {
    changedParts,
    detachedCount: 0,
    detachedParts: [],
    recalcRequired: false,
    recalcParts: [],
    recalcReason: "",
    activePartCount,
    acceptancePlan
  };
}

// src/components/estimator/builder/builderProductPersistence.js
var cleanString3 = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function normalize3(value) {
  if (Array.isArray(value)) return value.map(normalize3);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize3(value[key]);
    return out;
  }, {});
}
function sameValue5(a, b) {
  const leftEmpty = a === null || a === void 0 || a === "";
  const rightEmpty = b === null || b === void 0 || b === "";
  if (leftEmpty && rightEmpty) return true;
  if (!leftEmpty && !rightEmpty && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString3(a) === cleanString3(b);
  }
  return JSON.stringify(normalize3(a)) === JSON.stringify(normalize3(b));
}
function payloadMatches(record, payload) {
  return Boolean(record?.id) && Object.entries(payload || {}).every(([field, value]) => sameValue5(record?.[field], value));
}
async function createBuilderProductWithRecovery({
  entity,
  data,
  label = "Builder Product",
  settleMs = 50
} = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const estimateId = String(payload?.estimate_id || "").trim();
  const lineId = String(payload?.estimate_line_id || "").trim();
  if (!payload || !estimateId || !lineId || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const readIdentity = async (phase) => {
    const rows = await entity.filter({ estimate_id: estimateId, estimate_line_id: lineId });
    if (!Array.isArray(rows)) throw new Error(`${label} ${phase} did not return a Builder Product list.`);
    return rows;
  };
  const before = await readIdentity("preflight");
  if (before.length > 1) {
    throw new Error(`${label} found multiple Products for the same Estimate line. No Product was changed; reload and review the duplicate Builder Products.`);
  }
  if (before.length === 1) {
    throw new Error(`${label} appeared in another session while this create was starting. Reload the Estimate before continuing so the existing Product is reconciled normally.`);
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }
  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
  let after;
  try {
    after = await readIdentity("recovery");
  } catch (verificationError) {
    if (created?.id) return { record: created, status: "created_unverified_identity" };
    throw new Error(
      `${label} create response was unavailable and its recovery lookup also failed. ` + `Do not retry blindly; reload the Estimate first. ${verificationError?.message || ""}`.trim()
    );
  }
  if (after.length > 1) {
    throw new Error(
      `${label} may have been created more than once by simultaneous Estimate activity. No Builder Product was deleted automatically; reload and review the duplicate Estimate-line Products before continuing.`
    );
  }
  if (after.length === 1) {
    const only = after[0];
    if (created?.id) {
      if (String(only.id) === String(created.id)) return { record: only, status: "created" };
      throw new Error(`${label} returned a create receipt, but a different Product owns the Estimate-line identity. No Product was deleted; reload before continuing.`);
    }
    if (payloadMatches(only, payload)) return { record: only, status: "recovered" };
    throw new Error(
      `${label} create response was unavailable and a different Product now owns the Estimate-line identity. Reload the Estimate so that Product can be reconciled without overwriting it.`
    );
  }
  if (created?.id) return { record: created, status: "created_unverified_identity" };
  if (createError) {
    throw new Error(
      `${createError?.message || `${label} could not be created.`} No matching Builder Product was visible after recovery. Reload the Estimate before retrying.`
    );
  }
  throw new Error(`${label} could not verify whether the Builder Product was created. Reload the Estimate before retrying.`);
}

// src/components/estimator/builder/builderService.js
var num20 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
var nowIso2 = () => (/* @__PURE__ */ new Date()).toISOString();
var makeStableId = (prefix = "id") => {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
};
function stripSystemFields(value) {
  if (Array.isArray(value)) return value.map(stripSystemFields);
  if (!value || typeof value !== "object") return value;
  const result = {};
  Object.keys(value).sort().forEach((key) => {
    if (["created_by", "created_by_id"].includes(key)) return;
    result[key] = stripSystemFields(value[key]);
  });
  return result;
}
function stableStringify(value) {
  return JSON.stringify(stripSystemFields(value ?? null));
}
function snapshotHash(value) {
  const text3 = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text3.length; i += 1) {
    hash ^= text3.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
async function getSourceProject(line) {
  const mod = getModule(line?.module_key);
  if (!mod || !line?.project_id) return null;
  return staffEntities[mod.entity].get(line.project_id).catch(() => null);
}
function sourceProjectTotal(line, record) {
  if (!record) return num20(line?.live_total_snapshot, num20(line?.total_snapshot));
  const totalField = MODULE_TOTAL_FIELD[line?.module_key];
  if (totalField) return num20(record[totalField]);
  if (line?.module_key === "painting") {
    return num20(record.total_paint_mask_cost) + num20(record.total_liquid_paint_and_supplies_cost) + num20(record.total_labor_cost);
  }
  if (line?.module_key === "foundation") {
    const direct = num20(record.grand_total, NaN);
    if (Number.isFinite(direct)) return direct;
    const known = [
      "total_concrete_cost",
      "total_rebar_cost",
      "total_excavation_cost",
      "total_forming_materials_cost",
      "total_labor_cost",
      "total_wall_cost",
      "total_pole_cost",
      "total_pole_painting_cost",
      "total_equipment_cost",
      "total_wall_cap_cost",
      "total_signage_cabinet_cost",
      "total_landscape_cost"
    ];
    return known.reduce((sum, key) => sum + num20(record[key]), 0);
  }
  return num20(record.total_cost, num20(line?.total_snapshot));
}
async function findBuilderProduct(line, estimateId) {
  if (line?.builder_product_id) {
    const direct = await staffEntities.BuilderProduct.get(line.builder_product_id).catch(() => null);
    if (direct) return direct;
  }
  if (line?.project_id) {
    const bySource = await staffEntities.BuilderProduct.filter({
      estimate_id: estimateId,
      source_project_id: line.project_id
    });
    if (bySource?.[0]) return bySource[0];
  }
  if (line?.line_id) {
    const byLine = await staffEntities.BuilderProduct.filter({
      estimate_id: estimateId,
      estimate_line_id: line.line_id
    });
    if (byLine?.[0]) return byLine[0];
  }
  return null;
}
function productIdentity(line) {
  const builderName = line?.builder_name || getModuleLabel(line?.module_key) || line?.project_name || "Product";
  const clientName = line?.client_product_name || line?.project_name || builderName;
  return { builderName, clientName };
}
var sameText = (a, b) => String(a ?? "") === String(b ?? "");
var sameNumber = (a, b) => Math.abs(num20(a) - num20(b)) <= 5e-3;
function sameSubstantiveValue2(a, b) {
  const bothPresent = a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "";
  if (bothPresent && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return sameNumber(a, b);
  }
  return stableStringify(a) === stableStringify(b);
}
function patchDiffers2(record, patch) {
  return Object.entries(patch || {}).some(([key, value]) => !sameSubstantiveValue2(record?.[key], value));
}
function canReuseReconciledLegacyBuilder({
  line,
  builderProduct,
  source,
  lineId,
  sourceEntity,
  builderName,
  clientName
}) {
  if (!line?.builder_product_id || !builderProduct?.id || line.builder_product_id !== builderProduct.id || builderProduct.price_state !== "legacy_frozen" || builderProduct.legacy_bom_reconciled !== true) return false;
  const sourceStamp = String(source?.updated_date || "").trim();
  const recordedSourceStamp = String(
    line.updated_date_snapshot || builderProduct.builder_snapshot_source_updated_date || ""
  ).trim();
  if (sourceStamp && sourceStamp !== recordedSourceStamp) return false;
  const expectedCategory = line.product_category || builderProduct.product_category || "";
  const expectedProductionType = line.production_product_type ?? builderProduct.production_product_type ?? "";
  const expectedNotes = line.product_notes ?? builderProduct.product_notes ?? "";
  const expectedStatus = line.section_status === "complete" ? "complete" : "in_progress";
  return sameText(builderProduct.estimate_line_id, lineId) && sameText(builderProduct.module_key, line.module_key) && sameText(builderProduct.source_entity, sourceEntity) && sameText(builderProduct.source_project_id, line.project_id) && sameText(builderProduct.builder_name, builderName) && sameText(builderProduct.client_product_name, clientName) && sameText(builderProduct.client_description, line.customer_description) && sameText(builderProduct.product_category, expectedCategory) && sameText(builderProduct.production_product_type, expectedProductionType) && sameText(builderProduct.product_notes, expectedNotes) && sameNumber(builderProduct.quantity, line.customer_quantity ?? 1) && sameText(builderProduct.status, expectedStatus) && sameNumber(line.total_snapshot, builderProduct.frozen_cost) && sameNumber(line.live_total_snapshot, builderProduct.current_recalculated_cost) && sameText(line.price_state, builderProduct.price_state) && sameNumber(line.detached_part_count, builderProduct.detached_part_count) && !!line.needs_reattach_review === !!builderProduct.needs_reattach_review;
}
async function ensureBuilderProductForLine({ estimate, line, isNew = false, deferPartSync = false, strictPartSync = false, skipUnchangedWrites = false, sourceProjectOverride = void 0 }) {
  const estimateId = estimate?.id;
  if (!estimateId || !line) return { line, builderProduct: null, changed: false };
  if (line?.price_acceptance_pending?.key) {
    if (line.price_acceptance_pending.kind === "builder_product_remove") {
      const pendingBuilder = line.builder_product_id ? await staffEntities.BuilderProduct.get(line.builder_product_id).catch(() => null) : null;
      if (pendingBuilder?.estimate_id && pendingBuilder.estimate_id !== estimateId) {
        throw new Error("A pending Product removal found a Builder Product owned by another estimate. The saved recovery marker was retained.");
      }
      return { line, builderProduct: pendingBuilder, changed: false, partSyncInputs: null };
    }
    if (!line.builder_product_id && ["builder_quick_product_insert", "builder_blank_product_insert"].includes(line.price_acceptance_pending.kind)) {
      return { line, builderProduct: null, changed: false, partSyncInputs: null };
    }
    if (line.builder_product_id) {
      const pendingBuilder = await staffEntities.BuilderProduct.get(line.builder_product_id);
      if (!pendingBuilder?.id || pendingBuilder.estimate_id && pendingBuilder.estimate_id !== estimateId) {
        throw new Error("A pending Builder mutation could not verify its Builder Product. The saved recovery marker was retained.");
      }
      return { line, builderProduct: pendingBuilder, changed: false, partSyncInputs: null };
    }
  }
  const lineId = line.line_id || makeStableId("line");
  const source = sourceProjectOverride !== void 0 ? sourceProjectOverride : await getSourceProject(line);
  const sourceTotal = sourceProjectTotal(line, source);
  const acceptedTotal = num20(line.total_snapshot);
  const acceptedCustomerPrice = acceptedCustomerUnitPrice(line);
  const { builderName, clientName } = productIdentity(line);
  const sourceEntity = getModule(line.module_key)?.entity || "";
  const timestamp = nowIso2();
  let builderProduct = await findBuilderProduct(line, estimateId);
  if (!isNew && canReuseReconciledLegacyBuilder({
    line,
    builderProduct,
    source,
    lineId,
    sourceEntity,
    builderName,
    clientName
  })) {
    const partSyncInputs2 = deferPartSync && source ? await loadVerifiedBuilderPartSyncInputs({ builderProduct, moduleKey: line.module_key }) : null;
    return { line, builderProduct, changed: false, partSyncInputs: partSyncInputs2 };
  }
  const preserveLegacyEconomics = !isNew && (!builderProduct || builderProduct.price_state === "legacy_frozen");
  const economics = preserveLegacyEconomics ? { internalCost: sourceTotal, customerPrice: liveCustomerUnitPrice(line) } : sourceProjectEconomics(line.module_key, source, sourceTotal);
  const liveTotal = economics.internalCost;
  const liveCustomerPrice = economics.customerPrice;
  const partSyncInputs = (deferPartSync || strictPartSync) && source ? await loadVerifiedBuilderPartSyncInputs({ builderProduct, moduleKey: line.module_key }) : null;
  if (!builderProduct) {
    const builderProductData = {
      estimate_id: estimateId,
      estimate_line_id: lineId,
      module_key: line.module_key,
      source_entity: sourceEntity,
      source_project_id: line.project_id || "",
      builder_name: builderName,
      client_product_name: clientName,
      client_description: line.customer_description || "",
      product_category: line.product_category || "",
      production_product_type: line.production_product_type || "",
      product_notes: line.product_notes || "",
      quantity: num20(line.customer_quantity, 1),
      status: line.section_status === "complete" ? "complete" : "in_progress",
      builder_version: 1,
      builder_snapshot: source || {},
      builder_snapshot_at: timestamp,
      builder_snapshot_source_updated_date: source?.updated_date || line.updated_date_snapshot || "",
      builder_snapshot_hash: snapshotHash(source || {}),
      frozen_cost: isNew ? 0 : acceptedTotal,
      frozen_customer_price: isNew ? 0 : acceptedCustomerPrice,
      current_recalculated_cost: liveTotal,
      price_state: isNew ? "unchecked" : "legacy_frozen",
      price_delta: isNew ? liveTotal : liveTotal - acceptedTotal,
      price_delta_percent: !isNew && acceptedTotal ? (liveTotal - acceptedTotal) / acceptedTotal * 100 : 0,
      price_recalc_required: false,
      price_recalc_reason: "",
      last_price_check_at: timestamp,
      part_count: 0,
      group_count: 0,
      detached_part_count: 0,
      needs_reattach_review: false,
      is_active: true,
      notes: isNew ? "Builder Product created with estimate product. First priced save creates the initial frozen revision." : "Backfilled from an existing estimate line. Existing total_snapshot remains the authoritative legacy frozen price."
    };
    const createResult = await createBuilderProductWithRecovery({
      entity: staffEntities.BuilderProduct,
      data: builderProductData,
      label: `Builder Product \u201C${clientName || builderName || lineId}\u201D`
    });
    builderProduct = createResult.record;
  } else {
    const frozen = num20(builderProduct.frozen_cost, acceptedTotal);
    const frozenCustomer = hasNumericValue(builderProduct.frozen_customer_price) ? num20(builderProduct.frozen_customer_price) : acceptedCustomerPrice;
    const awaitingInitialFreeze = builderProduct.price_state === "unchecked" && frozen === 0;
    const nextState = builderProduct.price_state === "legacy_frozen" ? "legacy_frozen" : awaitingInitialFreeze ? "unchecked" : builderProduct.price_state === "manual" ? manualCustomerPriceState({
      detached: !!builderProduct.needs_reattach_review,
      recalcRequired: !!builderProduct.price_recalc_required
    }) : Math.abs(liveTotal - frozen) > 5e-3 || Math.abs(liveCustomerPrice - frozenCustomer) > 5e-3 ? "changed" : "current";
    const identityPatch = {
      estimate_line_id: lineId,
      module_key: line.module_key,
      source_entity: sourceEntity,
      source_project_id: line.project_id || "",
      builder_name: builderName,
      client_product_name: clientName,
      client_description: line.customer_description || "",
      product_category: line.product_category || builderProduct.product_category || "",
      production_product_type: line.production_product_type ?? builderProduct.production_product_type ?? "",
      product_notes: line.product_notes ?? builderProduct.product_notes ?? "",
      quantity: num20(line.customer_quantity, 1),
      status: line.section_status === "complete" ? "complete" : "in_progress"
    };
    const pricingPatch = {
      current_recalculated_cost: liveTotal,
      price_state: nextState,
      price_delta: liveTotal - frozen,
      price_delta_percent: frozen ? (liveTotal - frozen) / frozen * 100 : 0,
      price_recalc_required: builderProduct.price_recalc_required || false,
      price_recalc_reason: builderProduct.price_recalc_reason || ""
    };
    const willRunPartSync = !!source && !deferPartSync && !(builderProduct.price_state === "legacy_frozen" && builderProduct.legacy_bom_reconciled === true);
    const productPatch = skipUnchangedWrites && willRunPartSync ? identityPatch : { ...identityPatch, ...pricingPatch };
    if (!skipUnchangedWrites || patchDiffers2(builderProduct, productPatch)) {
      const writePatch = { ...productPatch, last_price_check_at: timestamp };
      builderProduct = await replaceBuilderEntityFieldsIfUnchanged({
        entity: staffEntities.BuilderProduct,
        id: builderProduct.id,
        expectedUpdatedAt: builderProduct.updated_date || "",
        expectedFields: expectedBuilderEntityFields(builderProduct, writePatch),
        nextFields: writePatch,
        guardFields: { estimate_id: builderProduct.estimate_id },
        label: "Builder Product synchronization"
      });
    }
  }
  let partSummary = {
    partCount: num20(builderProduct.part_count),
    detachedCount: num20(builderProduct.detached_part_count),
    changedCount: 0,
    newPartCount: 0,
    removedPartCount: 0,
    writesPerformed: 0,
    recalcRequired: !!builderProduct.price_recalc_required,
    recalcReason: builderProduct.price_recalc_reason || "",
    usesDirectLiveReprice: false,
    currentPartsTotal: 0,
    frozenPartsTotal: 0,
    currentMarkupTotal: 0,
    frozenMarkupTotal: 0,
    manualAddonFrozenTotal: 0,
    manualAddonCurrentTotal: 0
  };
  let effectiveLiveTotal = liveTotal;
  let effectiveLiveCustomerPrice = preserveLegacyEconomics ? liveCustomerPrice : economics.customerPrice;
  const preserveReconciledLegacyBom = builderProduct?.price_state === "legacy_frozen" && builderProduct?.legacy_bom_reconciled === true;
  if (source && builderProduct?.id && !preserveReconciledLegacyBom && !deferPartSync) {
    partSummary = await syncBuilderParts({
      builderProduct,
      sourceProject: source,
      acceptPrices: false,
      legacyMode: builderProduct.price_state === "legacy_frozen",
      strictCatalogs: strictPartSync,
      catalogsOverride: strictPartSync ? partSyncInputs?.catalogs || null : null,
      existingPartsOverride: strictPartSync ? partSyncInputs?.existingParts || [] : null,
      inventoryRowsOverride: strictPartSync ? partSyncInputs?.inventoryRowsOverride || /* @__PURE__ */ new Map() : null,
      skipUnchangedWrites
    });
    if (partSummary.usesDirectLiveReprice) {
      const manualAddonCurrent = num20(partSummary.manualAddonCurrentTotal);
      const liveInternalFromParts = num20(partSummary.currentPartsTotal) - num20(partSummary.currentMarkupTotal);
      const liveBuilderCoreCost = liveInternalFromParts - manualAddonCurrent;
      const markupPercent = num20(source?.markup_percent);
      effectiveLiveTotal = liveInternalFromParts;
      effectiveLiveCustomerPrice = liveBuilderCoreCost * (1 + markupPercent / 100) + manualAddonCurrent;
    } else {
      effectiveLiveTotal = liveTotal + num20(partSummary.manualAddonCurrentTotal);
      effectiveLiveCustomerPrice = preserveLegacyEconomics ? liveCustomerPrice : economics.customerPrice + num20(partSummary.manualAddonCurrentTotal);
    }
    const frozenAfterSync = num20(builderProduct.frozen_cost, acceptedTotal);
    const frozenCustomerAfterSync = hasNumericValue(builderProduct.frozen_customer_price) ? num20(builderProduct.frozen_customer_price) : acceptedCustomerPrice;
    const productPriceState = partSummary.detachedCount > 0 ? "detached_parts" : partSummary.recalcRequired ? "changed" : builderProduct.price_state === "legacy_frozen" ? "legacy_frozen" : builderProduct.price_state === "manual" ? "manual" : partSummary.changedCount > 0 || Math.abs(effectiveLiveTotal - frozenAfterSync) > 5e-3 || Math.abs(effectiveLiveCustomerPrice - frozenCustomerAfterSync) > 5e-3 ? "changed" : "current";
    const partProductPatch = {
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      current_recalculated_cost: effectiveLiveTotal,
      price_state: productPriceState,
      price_delta: effectiveLiveTotal - frozenAfterSync,
      price_delta_percent: frozenAfterSync ? (effectiveLiveTotal - frozenAfterSync) / frozenAfterSync * 100 : 0,
      price_recalc_required: !!partSummary.recalcRequired,
      price_recalc_reason: partSummary.recalcReason || ""
    };
    if (!skipUnchangedWrites || patchDiffers2(builderProduct, partProductPatch)) {
      const writePatch = skipUnchangedWrites ? { ...partProductPatch, last_price_check_at: timestamp } : partProductPatch;
      builderProduct = await replaceBuilderEntityFieldsIfUnchanged({
        entity: staffEntities.BuilderProduct,
        id: builderProduct.id,
        expectedUpdatedAt: builderProduct.updated_date || "",
        expectedFields: expectedBuilderEntityFields(builderProduct, writePatch),
        nextFields: writePatch,
        guardFields: { estimate_id: builderProduct.estimate_id },
        label: "Builder Product synchronization"
      });
    }
  }
  const frozenCost = isNew ? num20(builderProduct.frozen_cost) : acceptedTotal;
  const frozenCustomerPrice = hasNumericValue(builderProduct.frozen_customer_price) ? num20(builderProduct.frozen_customer_price) : acceptedCustomerPrice;
  const linePatch = {
    line_id: lineId,
    builder_product_id: builderProduct.id,
    builder_name: builderName,
    client_product_name: clientName,
    product_category: line.product_category || builderProduct.product_category || "",
    production_product_type: line.production_product_type ?? builderProduct.production_product_type ?? "",
    product_notes: line.product_notes ?? builderProduct.product_notes ?? "",
    total_snapshot: frozenCost,
    live_total_snapshot: effectiveLiveTotal,
    customer_price_snapshot: frozenCustomerPrice,
    live_customer_price_snapshot: effectiveLiveCustomerPrice,
    price_state: builderProduct.price_state || (isNew ? "unchecked" : "legacy_frozen"),
    price_recalc_required: !!builderProduct.price_recalc_required,
    price_recalc_reason: builderProduct.price_recalc_reason || "",
    detached_part_count: num20(builderProduct.detached_part_count),
    needs_reattach_review: !!builderProduct.needs_reattach_review
  };
  const lineChanged = patchDiffers2(line, linePatch);
  const nextLine = skipUnchangedWrites && !lineChanged ? line : {
    ...line,
    ...linePatch,
    last_price_check_at: timestamp,
    updated_date_snapshot: source?.updated_date || line.updated_date_snapshot
  };
  return {
    line: nextLine,
    builderProduct,
    changed: skipUnchangedWrites ? lineChanged : stableStringify(nextLine) !== stableStringify(line),
    partSyncInputs
  };
}
async function ensureEstimateBuilderProducts(estimate, { strictReconciliation = false, onWarning = null } = {}) {
  if (!estimate?.id) return estimate;
  const original = estimate.line_items || [];
  const lineItems = [];
  let changed = false;
  for (const line of original) {
    try {
      if (line?.price_acceptance_pending?.kind === "builder_product_remove") {
        lineItems.push(line);
        continue;
      }
      let sourceProjectOverride;
      if (strictReconciliation) {
        const mod = getModule(line?.module_key);
        if (mod && line?.project_id) {
          try {
            sourceProjectOverride = await staffEntities[mod.entity].get(line.project_id);
          } catch (error) {
            throw new Error(`${getModuleLabel(line.module_key) || "Builder"} source could not be verified: ${error?.message || "read failed"}`);
          }
          if (!sourceProjectOverride) {
            throw new Error(`${getModuleLabel(line.module_key) || "Builder"} source could not be verified. The saved Product snapshot was retained.`);
          }
        }
      }
      const result = await ensureBuilderProductForLine({
        estimate,
        line,
        isNew: false,
        strictPartSync: strictReconciliation,
        skipUnchangedWrites: strictReconciliation,
        sourceProjectOverride
      });
      lineItems.push(result.line);
      changed = changed || result.changed;
    } catch (error) {
      if (!strictReconciliation) throw error;
      const warning = {
        line_id: line.line_id || "",
        builder_product_id: line.builder_product_id || "",
        product_name: line.client_product_name || line.project_name || getModuleLabel(line.module_key) || "Product",
        message: error?.message || "This Product could not be verified against its Builder catalogs. The saved Product snapshot was retained."
      };
      onWarning?.(warning);
      lineItems.push(line);
    }
  }
  if (changed) {
    const savedEstimate = await replaceEstimateFieldsIfUnchanged({
      entity: staffEntities.AllInOneEstimate,
      estimateId: estimate.id,
      expectedFields: expectedEstimateFields(estimate, { line_items: lineItems }),
      nextFields: { line_items: lineItems },
      label: "Builder estimate line synchronization"
    });
    return { ...estimate, ...savedEstimate, line_items: savedEstimate.line_items || lineItems };
  }
  return { ...estimate, line_items: lineItems };
}
async function recordBuilderSave({ estimateId, line, sourceProject, liveTotal, internalCost, customerPrice, expectedPendingKey }) {
  if (!estimateId || !line) return line;
  if (!sourceProject || typeof sourceProject !== "object") {
    throw new Error("The saved Builder source could not be verified. Product pricing and Parts were not synchronized.");
  }
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be verified before synchronizing this Builder save.");
  const currentLine = (estimate.line_items || []).find(
    (item) => item.module_key === line.module_key && (line.builder_product_id && item.builder_product_id === line.builder_product_id || line.project_id && item.project_id === line.project_id)
  ) || line;
  const existingPending = pendingBuilderMutation(currentLine);
  if (expectedPendingKey !== void 0 && existingPending?.key !== expectedPendingKey) {
    throw new Error("The pending Builder operation changed before recovery. Reload the estimate before continuing.");
  }
  if (existingPending) {
    if (existingPending.kind === "builder_product_remove") {
      throw new Error("This Product is being removed. Use Resume Product Remove before opening or saving its Builder again.");
    }
    const pendingBuilderId = currentLine.builder_product_id || existingPending.builder_product_id || "";
    const [pendingBuilder, pendingParts] = await Promise.all([
      pendingBuilderId ? staffEntities.BuilderProduct.get(pendingBuilderId) : Promise.resolve(null),
      pendingBuilderId ? loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: pendingBuilderId }, sort: "sort_order", label: "Builder Parts" }) : Promise.resolve([])
    ]);
    if (!pendingBuilder?.id || !Array.isArray(pendingParts)) {
      throw new Error("The pending initial price acceptance could not verify its Builder Product or Parts. The recovery marker was retained.");
    }
    const recovered = await resumeBuilderMutation({
      estimateId,
      estimate,
      builder: pendingBuilder,
      parts: pendingParts,
      line: currentLine,
      pending: existingPending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan
    });
    return recovered?.line || currentLine;
  }
  await assertEstimateProductMutationAllowed(estimate);
  const ensured = await ensureBuilderProductForLine({
    estimate,
    line: currentLine,
    isNew: !currentLine.builder_product_id,
    deferPartSync: true,
    sourceProjectOverride: sourceProject ?? void 0
  });
  const builder = ensured.builderProduct;
  const matchesCurrentLine = (item) => item.module_key === currentLine.module_key && (builder?.id && item.builder_product_id === builder.id || currentLine.project_id && item.project_id === currentLine.project_id);
  if (builder && !ensured.partSyncInputs) {
    throw new Error("Builder catalogs could not be preverified. Product pricing and Parts were not synchronized.");
  }
  const timestamp = nowIso2();
  const sourceTotal = num20(liveTotal, sourceProjectTotal(currentLine, sourceProject));
  const economics = sourceProjectEconomics(currentLine.module_key, sourceProject, sourceTotal);
  const nextLiveTotal = hasNumericValue(internalCost) ? num20(internalCost) : economics.internalCost;
  const nextLiveCustomerPrice = hasNumericValue(customerPrice) ? num20(customerPrice) : economics.customerPrice;
  const previousFrozenTotal = num20(builder?.frozen_cost, num20(currentLine.total_snapshot));
  const previousFrozenCustomerPrice = hasNumericValue(builder?.frozen_customer_price) ? num20(builder.frozen_customer_price) : acceptedCustomerUnitPrice(currentLine);
  const wantsInitialFreeze = builder?.price_state === "unchecked" && previousFrozenTotal === 0;
  let partSummary = {
    partCount: num20(builder?.part_count),
    detachedCount: num20(builder?.detached_part_count),
    changedCount: 0,
    newPartCount: 0,
    removedPartCount: 0,
    recalcRequired: false,
    recalcReason: "",
    usesDirectLiveReprice: false,
    currentPartsTotal: 0,
    frozenPartsTotal: 0,
    currentMarkupTotal: 0,
    frozenMarkupTotal: 0,
    manualAddonFrozenTotal: 0,
    manualAddonCurrentTotal: 0
  };
  if (builder) {
    partSummary = await syncBuilderParts({
      builderProduct: builder,
      sourceProject: sourceProject || {},
      acceptPrices: false,
      legacyMode: builder.price_state === "legacy_frozen",
      // This path runs only after the authoritative Builder calculator has
      // produced and saved sourceProject/liveTotal. Mark the current inventory
      // pricing used by that calculation so Update Price can safely accept it.
      builderRecalculated: true,
      strictCatalogs: true,
      catalogsOverride: ensured.partSyncInputs.catalogs,
      existingPartsOverride: ensured.partSyncInputs.existingParts,
      inventoryRowsOverride: ensured.partSyncInputs.inventoryRowsOverride
    });
  }
  const effectiveLiveTotal = nextLiveTotal + num20(partSummary.manualAddonCurrentTotal);
  const effectiveLiveCustomerPrice = nextLiveCustomerPrice + num20(partSummary.manualAddonCurrentTotal);
  const canInitialFreeze = wantsInitialFreeze && partSummary.detachedCount === 0;
  const acceptedTotal = canInitialFreeze ? effectiveLiveTotal : previousFrozenTotal;
  const calculatedState = canInitialFreeze ? "current" : partSummary.changedCount > 0 || Math.abs(effectiveLiveTotal - acceptedTotal) > 5e-3 || Math.abs(effectiveLiveCustomerPrice - previousFrozenCustomerPrice) > 5e-3 ? "changed" : "current";
  const productState = partSummary.detachedCount > 0 ? "detached_parts" : builder?.price_state === "legacy_frozen" ? "legacy_frozen" : calculatedState;
  if (builder && canInitialFreeze) {
    const partAcceptance = await acceptBuilderPartPrices(builder.id, {
      builderOverride: builder,
      partsOverride: partSummary.parts || [],
      apply: false,
      timestamp
    });
    if (partAcceptance.detachedCount > 0) {
      partSummary.detachedCount = partAcceptance.detachedCount;
    } else {
      const initialAcceptedTotal = effectiveLiveTotal;
      const initialAcceptedCustomerPrice = effectiveLiveCustomerPrice;
      const operationKey = `builder_initial_freeze:${builder.id}:${num20(builder.builder_version, 1)}:${snapshotHash({
        estimate_updated_date: estimate.updated_date || "",
        estimate_line_id: currentLine.line_id || ensured.line.line_id || "",
        source_updated_date: sourceProject?.updated_date || "",
        source_hash: snapshotHash(sourceProject || {}),
        total: initialAcceptedTotal,
        customer_price: initialAcceptedCustomerPrice,
        part_updates: partAcceptance.acceptancePlan?.part_updates || []
      })}`;
      const builderPatch = {
        builder_snapshot: sourceProject || {},
        builder_snapshot_at: timestamp,
        builder_snapshot_source_updated_date: sourceProject?.updated_date || timestamp,
        builder_snapshot_hash: snapshotHash(sourceProject || {}),
        frozen_cost: initialAcceptedTotal,
        frozen_customer_price: initialAcceptedCustomerPrice,
        current_recalculated_cost: effectiveLiveTotal,
        price_state: "current",
        price_delta: 0,
        price_delta_percent: 0,
        price_recalc_required: false,
        price_recalc_reason: "",
        last_price_check_at: timestamp,
        last_price_update_at: timestamp,
        builder_version: num20(builder.builder_version, 1) + 1,
        part_count: partSummary.partCount,
        detached_part_count: 0,
        needs_reattach_review: false
      };
      const linePatch = {
        line_id: currentLine.line_id || ensured.line.line_id,
        builder_product_id: builder.id,
        builder_name: currentLine.builder_name || ensured.line.builder_name,
        client_product_name: currentLine.client_product_name || ensured.line.client_product_name,
        total_snapshot: initialAcceptedTotal,
        live_total_snapshot: effectiveLiveTotal,
        customer_price_snapshot: initialAcceptedCustomerPrice,
        live_customer_price_snapshot: effectiveLiveCustomerPrice,
        price_state: "current",
        price_recalc_required: false,
        price_recalc_reason: "",
        detached_part_count: 0,
        needs_reattach_review: false,
        last_price_check_at: timestamp,
        last_price_update_at: timestamp,
        updated_date_snapshot: sourceProject?.updated_date || timestamp
      };
      const revision = {
        builder_product_id: builder.id,
        estimate_id: estimateId,
        reason: "initial_freeze",
        previous_total_cost: 0,
        new_total_cost: initialAcceptedTotal,
        previous_customer_price: 0,
        new_customer_price: initialAcceptedCustomerPrice,
        changed_parts: partAcceptance.changedParts || [],
        builder_snapshot_before: builder.builder_snapshot || {},
        builder_snapshot_after: sourceProject || {},
        price_snapshot_before: { total: 0, customer_price: 0 },
        price_snapshot_after: { total: initialAcceptedTotal, customer_price: initialAcceptedCustomerPrice },
        notes: "Initial accepted/frozen product price."
      };
      const pending = {
        key: operationKey,
        kind: "builder_initial_freeze",
        started_at: timestamp,
        estimate_id: estimateId,
        estimate_line_id: linePatch.line_id || builder.estimate_line_id || "",
        builder_product_id: builder.id,
        builder_updated_date_before: builder.updated_date || "",
        builder_version_before: num20(builder.builder_version, 1),
        part_acceptance_plan: partAcceptance.acceptancePlan || {},
        builder_patch: builderPatch,
        line_patch: linePatch,
        revision
      };
      const preMarkerEstimate = await staffEntities.AllInOneEstimate.get(estimateId);
      if (!preMarkerEstimate) throw new Error("Estimate could not be verified before starting the initial price freeze.");
      if (estimate.updated_date && preMarkerEstimate.updated_date && estimate.updated_date !== preMarkerEstimate.updated_date) {
        throw new Error("This estimate changed in another session while the Builder was being saved. Initial pricing was not frozen; reload the Estimate before retrying.");
      }
      const preMarkerLine = (preMarkerEstimate.line_items || []).find(matchesCurrentLine);
      if (!preMarkerLine) {
        throw new Error("This Product is no longer part of the estimate. Initial pricing was not frozen.");
      }
      const markedLines = (preMarkerEstimate.line_items || []).map(
        (item) => item === preMarkerLine ? {
          ...item,
          line_id: linePatch.line_id,
          builder_product_id: builder.id,
          builder_name: linePatch.builder_name,
          client_product_name: linePatch.client_product_name,
          price_acceptance_pending: pending
        } : item
      );
      await replaceEstimateFieldsIfUnchanged({
        entity: staffEntities.AllInOneEstimate,
        estimateId,
        expectedFields: expectedEstimateFields(preMarkerEstimate, { line_items: markedLines }),
        nextFields: { line_items: markedLines },
        label: "Builder initial price-freeze recovery marker"
      });
      const [markedEstimate, currentBuilder, currentParts] = await Promise.all([
        staffEntities.AllInOneEstimate.get(estimateId),
        staffEntities.BuilderProduct.get(builder.id),
        loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder Parts" })
      ]);
      const markedLine = (markedEstimate?.line_items || []).find(matchesCurrentLine);
      const canonicalPending = pendingBuilderMutation(markedLine);
      if (!canonicalPending || canonicalPending.key !== operationKey) {
        throw new Error("Another Builder price-acceptance operation won the recovery marker race. Reload before continuing.");
      }
      const recovered = await resumeBuilderMutation({
        estimateId,
        estimate: markedEstimate,
        builder: currentBuilder,
        parts: currentParts,
        line: markedLine,
        pending: canonicalPending,
        applyPartPlan: applyBuilderPartPriceAcceptancePlan
      });
      return recovered?.line || markedLine || currentLine;
    }
  }
  const initialFreezeCompleted = false;
  const finalAcceptedTotal = initialFreezeCompleted ? effectiveLiveTotal : previousFrozenTotal;
  const finalAcceptedCustomerPrice = initialFreezeCompleted ? effectiveLiveCustomerPrice : previousFrozenCustomerPrice;
  const finalProductState = partSummary.detachedCount > 0 ? "detached_parts" : initialFreezeCompleted ? "current" : productState;
  if (builder) {
    const nextRevision = num20(builder.builder_version, 1) + (initialFreezeCompleted ? 1 : 0);
    const builderSavePatch = {
      builder_snapshot: sourceProject || {},
      builder_snapshot_at: timestamp,
      builder_snapshot_source_updated_date: sourceProject?.updated_date || timestamp,
      builder_snapshot_hash: snapshotHash(sourceProject || {}),
      frozen_cost: finalAcceptedTotal,
      frozen_customer_price: finalAcceptedCustomerPrice,
      current_recalculated_cost: effectiveLiveTotal,
      price_state: finalProductState,
      price_delta: effectiveLiveTotal - finalAcceptedTotal,
      price_delta_percent: finalAcceptedTotal ? (effectiveLiveTotal - finalAcceptedTotal) / finalAcceptedTotal * 100 : 0,
      // The authoritative Builder calculator just ran, so any earlier stale-catalog
      // block is now resolved even if the user has not accepted the new price yet.
      price_recalc_required: false,
      price_recalc_reason: "",
      last_price_check_at: timestamp,
      last_price_update_at: initialFreezeCompleted ? timestamp : builder.last_price_update_at,
      builder_version: nextRevision,
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0
    };
    await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderProduct,
      id: builder.id,
      expectedUpdatedAt: builder.updated_date || "",
      expectedFields: expectedBuilderEntityFields(builder, builderSavePatch),
      nextFields: builderSavePatch,
      guardFields: { estimate_id: estimateId },
      label: "Builder Product save"
    });
  }
  const nextLines = (estimate.line_items || []).map((item) => {
    if (!matchesCurrentLine(item)) return item;
    return {
      ...item,
      line_id: item.line_id || ensured.line.line_id,
      builder_product_id: builder?.id || item.builder_product_id,
      builder_name: item.builder_name || ensured.line.builder_name,
      client_product_name: item.client_product_name || ensured.line.client_product_name,
      total_snapshot: finalAcceptedTotal,
      live_total_snapshot: effectiveLiveTotal,
      customer_price_snapshot: finalAcceptedCustomerPrice,
      live_customer_price_snapshot: effectiveLiveCustomerPrice,
      price_state: finalProductState,
      price_recalc_required: false,
      price_recalc_reason: "",
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      last_price_check_at: timestamp,
      last_price_update_at: initialFreezeCompleted ? timestamp : item.last_price_update_at,
      updated_date_snapshot: sourceProject?.updated_date || timestamp
    };
  });
  const savedEstimate = await replaceEstimateFieldsIfUnchanged({
    entity: staffEntities.AllInOneEstimate,
    estimateId,
    expectedFields: expectedEstimateFields(estimate, { line_items: nextLines }),
    nextFields: { line_items: nextLines },
    label: "Builder save Estimate line synchronization"
  });
  const savedLines = savedEstimate.line_items || nextLines;
  return savedLines.find(matchesCurrentLine) || currentLine;
}
async function deleteBuilderProductCascade(builderProductId) {
  if (!builderProductId) return { deleted: false, reason: "missing_builder_product_id" };
  const builder = await staffEntities.BuilderProduct.get(builderProductId);
  if (!builder?.id) return { deleted: true, alreadyDeleted: true };
  const [parts, groups, revisions] = await Promise.all([
    loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Parts" }),
    loadAllEntityRows({ entity: staffEntities.BuilderPartGroup, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Part Groups" }),
    loadAllEntityRows({ entity: base44.entities.BuilderPriceRevision, query: { builder_product_id: builderProductId }, sort: "revision_number", label: "Builder price revisions" })
  ]);
  if (!Array.isArray(parts) || !Array.isArray(groups) || !Array.isArray(revisions)) {
    throw new Error("Builder Product cascade could not verify all owned records before deletion.");
  }
  let partDeletes = 0;
  let groupDeletes = 0;
  let revisionDeletes = 0;
  for (const row of parts) {
    await deleteBuilderEntityIfUnchanged({
      entity: staffEntities.BuilderPart,
      record: row,
      guardFields: { builder_product_id: builderProductId },
      label: `Builder Part \u201C${row.part_name || "Part"}\u201D cascade delete`
    });
    partDeletes += 1;
  }
  for (const row of groups) {
    await deleteBuilderEntityIfUnchanged({
      entity: staffEntities.BuilderPartGroup,
      record: row,
      guardFields: { builder_product_id: builderProductId },
      label: `Builder Part Group \u201C${row.group_name || "Part Group"}\u201D cascade delete`
    });
    groupDeletes += 1;
  }
  for (const row of revisions) {
    await deleteBuilderEntityIfUnchanged({
      entity: base44.entities.BuilderPriceRevision,
      record: row,
      guardFields: { builder_product_id: builderProductId },
      label: "Builder price revision cascade delete"
    });
    revisionDeletes += 1;
  }
  await deleteBuilderEntityIfUnchanged({
    entity: staffEntities.BuilderProduct,
    record: builder,
    label: "Builder Product cascade delete"
  });
  return { deleted: true, partDeletes, groupDeletes, revisionDeletes };
}
async function acceptBuilderPrice({ estimateId, line, note = "Price updated from current builder calculation.", expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !line?.builder_product_id) return null;
  const [estimate, builder, parts] = await Promise.all([
    staffEntities.AllInOneEstimate.get(estimateId),
    staffEntities.BuilderProduct.get(line.builder_product_id),
    loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: line.builder_product_id }, sort: "sort_order", label: "Builder Parts" })
  ]);
  if (!estimate || !builder) throw new Error("Estimate pricing could not be verified. Reload before updating this Product price.");
  if (!Array.isArray(parts)) throw new Error("Builder Parts could not be verified. No price was accepted.");
  if (builder.estimate_id && builder.estimate_id !== estimateId) {
    throw new Error("This Builder Product no longer belongs to the current estimate. Reload before updating its price.");
  }
  const verifiedEstimateLine = (estimate.line_items || []).find((item) => item.builder_product_id === builder.id);
  if (!verifiedEstimateLine) throw new Error("This Product is no longer part of the estimate. Reload before updating its price.");
  if (builder.estimate_line_id && verifiedEstimateLine.line_id && builder.estimate_line_id !== verifiedEstimateLine.line_id) {
    throw new Error("This Product line changed since its Builder was linked. Reload before updating its price.");
  }
  if (parts.some((part) => part?.builder_product_id !== builder.id)) {
    throw new Error("One or more Builder Parts no longer belong to this Product. Reload before updating its price.");
  }
  const existingPending = pendingBuilderMutation(verifiedEstimateLine);
  if (existingPending) {
    return resumeBuilderMutation({
      estimateId,
      estimate,
      builder,
      parts,
      line: verifiedEstimateLine,
      pending: existingPending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan
    });
  }
  const serverAlreadyCurrent = builder.price_state === "current" && verifiedEstimateLine.price_state === "current" && sameNumber(builder.frozen_cost, builder.current_recalculated_cost) && sameNumber(verifiedEstimateLine.total_snapshot, verifiedEstimateLine.live_total_snapshot) && sameNumber(acceptedCustomerUnitPrice(verifiedEstimateLine), liveCustomerUnitPrice(verifiedEstimateLine));
  if (serverAlreadyCurrent) {
    return { blocked: false, alreadyCompleted: true, changedParts: [], line: verifiedEstimateLine };
  }
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const timestamp = nowIso2();
  const partAcceptance = await acceptBuilderPartPrices(builder.id, {
    builderOverride: builder,
    partsOverride: parts,
    apply: false,
    timestamp
  });
  if (partAcceptance.detachedCount > 0) {
    const blockedTimestamp = nowIso2();
    const detachedBuilderPatch = {
      price_state: "detached_parts",
      detached_part_count: partAcceptance.detachedCount,
      needs_reattach_review: true,
      last_price_check_at: blockedTimestamp
    };
    await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderProduct,
      id: builder.id,
      expectedUpdatedAt: builder.updated_date || "",
      expectedFields: expectedBuilderEntityFields(builder, detachedBuilderPatch),
      nextFields: detachedBuilderPatch,
      guardFields: { estimate_id: estimateId },
      label: "Builder detached-parts status"
    });
    const blockedLines = (estimate.line_items || []).map(
      (item) => item.builder_product_id === builder.id ? {
        ...item,
        price_state: "detached_parts",
        detached_part_count: partAcceptance.detachedCount,
        needs_reattach_review: true,
        last_price_check_at: blockedTimestamp
      } : item
    );
    const savedEstimate = await replaceEstimateFieldsIfUnchanged({
      entity: staffEntities.AllInOneEstimate,
      estimateId,
      expectedFields: expectedEstimateFields(estimate, { line_items: blockedLines }),
      nextFields: { line_items: blockedLines },
      label: "Builder detached-parts Estimate state"
    });
    const savedLines = savedEstimate.line_items || blockedLines;
    return {
      blocked: true,
      reason: "detached_parts",
      detachedCount: partAcceptance.detachedCount,
      detachedParts: partAcceptance.detachedParts || [],
      line: savedLines.find((item) => item.builder_product_id === builder.id) || line
    };
  }
  if (partAcceptance.recalcRequired) {
    const blockedTimestamp = nowIso2();
    const reason = partAcceptance.recalcReason || "Master Inventory changed after this Builder was last calculated. Reopen and save the Builder before accepting Update Price.";
    const recalcBuilderPatch = {
      price_state: "changed",
      price_recalc_required: true,
      price_recalc_reason: reason,
      last_price_check_at: blockedTimestamp
    };
    await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderProduct,
      id: builder.id,
      expectedUpdatedAt: builder.updated_date || "",
      expectedFields: expectedBuilderEntityFields(builder, recalcBuilderPatch),
      nextFields: recalcBuilderPatch,
      guardFields: { estimate_id: estimateId },
      label: "Builder recalc-required status"
    });
    const blockedLines = (estimate.line_items || []).map(
      (item) => item.builder_product_id === builder.id ? {
        ...item,
        price_state: "changed",
        price_recalc_required: true,
        price_recalc_reason: reason,
        last_price_check_at: blockedTimestamp
      } : item
    );
    const savedEstimate = await replaceEstimateFieldsIfUnchanged({
      entity: staffEntities.AllInOneEstimate,
      estimateId,
      expectedFields: expectedEstimateFields(estimate, { line_items: blockedLines }),
      nextFields: { line_items: blockedLines },
      label: "Builder recalc-required Estimate state"
    });
    const savedLines = savedEstimate.line_items || blockedLines;
    return {
      blocked: true,
      reason: "recalc_required",
      recalcReason: reason,
      recalcParts: partAcceptance.recalcParts || [],
      line: savedLines.find((item) => item.builder_product_id === builder.id) || line
    };
  }
  const currentEstimateLine = verifiedEstimateLine;
  const previousTotal = num20(builder.frozen_cost, num20(currentEstimateLine.total_snapshot));
  const nextTotal = num20(builder.current_recalculated_cost, num20(currentEstimateLine.live_total_snapshot, previousTotal));
  const previousCustomerPrice = hasNumericValue(builder.frozen_customer_price) ? num20(builder.frozen_customer_price) : acceptedCustomerUnitPrice(currentEstimateLine);
  const nextCustomerPrice = liveCustomerUnitPrice(currentEstimateLine);
  const noServerChange = sameNumber(previousTotal, nextTotal) && sameNumber(previousCustomerPrice, nextCustomerPrice) && (partAcceptance.changedParts || []).length === 0 && builder.price_state === "current" && currentEstimateLine.price_state === "current";
  if (noServerChange) {
    return { blocked: false, alreadyCompleted: true, changedParts: [], line: currentEstimateLine };
  }
  const operationKey = `builder_update_price:${builder.id}:${num20(builder.builder_version, 1)}:${snapshotHash({
    estimate_updated_date: estimate.updated_date || "",
    estimate_line_id: currentEstimateLine.line_id || "",
    previous_total: previousTotal,
    next_total: nextTotal,
    previous_customer_price: previousCustomerPrice,
    next_customer_price: nextCustomerPrice,
    part_updates: partAcceptance.acceptancePlan?.part_updates || []
  })}`;
  const builderPatch = {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    price_recalc_required: false,
    price_recalc_reason: "",
    detached_part_count: 0,
    needs_reattach_review: false,
    part_count: partAcceptance.activePartCount ?? builder.part_count,
    last_price_update_at: timestamp,
    last_price_update_note: note,
    last_price_check_at: timestamp,
    builder_version: num20(builder.builder_version, 1) + 1
  };
  const linePatch = {
    total_snapshot: nextTotal,
    live_total_snapshot: nextTotal,
    customer_price_snapshot: nextCustomerPrice,
    live_customer_price_snapshot: nextCustomerPrice,
    price_state: "current",
    price_recalc_required: false,
    price_recalc_reason: "",
    detached_part_count: 0,
    needs_reattach_review: false,
    last_price_update_at: timestamp,
    last_price_check_at: timestamp
  };
  const revision = {
    builder_product_id: builder.id,
    estimate_id: estimateId,
    reason: "update_price",
    previous_total_cost: previousTotal,
    new_total_cost: nextTotal,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: partAcceptance.changedParts || [],
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousTotal, customer_price: previousCustomerPrice },
    price_snapshot_after: { total: nextTotal, customer_price: nextCustomerPrice },
    notes: note
  };
  const pending = {
    key: operationKey,
    kind: "builder_update_price",
    started_at: timestamp,
    estimate_id: estimateId,
    estimate_line_id: currentEstimateLine.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num20(builder.builder_version, 1),
    part_acceptance_plan: partAcceptance.acceptancePlan || {},
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision
  };
  const markedLines = (estimate.line_items || []).map(
    (item) => item.builder_product_id === builder.id ? { ...item, price_acceptance_pending: pending } : item
  );
  await replaceEstimateFieldsIfUnchanged({
    entity: staffEntities.AllInOneEstimate,
    estimateId,
    expectedFields: expectedEstimateFields(estimate, { line_items: markedLines }),
    nextFields: { line_items: markedLines },
    label: "Builder price-acceptance recovery marker"
  });
  const [markedEstimate, currentBuilder, currentParts] = await Promise.all([
    staffEntities.AllInOneEstimate.get(estimateId),
    staffEntities.BuilderProduct.get(builder.id),
    loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder Parts" })
  ]);
  const markedLine = (markedEstimate?.line_items || []).find((item) => item.builder_product_id === builder.id);
  const canonicalPending = pendingBuilderMutation(markedLine);
  if (!canonicalPending || canonicalPending.key !== operationKey) {
    throw new Error("Another Update Price operation won the recovery marker race. Reload before continuing.");
  }
  return resumeBuilderMutation({
    estimateId,
    estimate: markedEstimate,
    builder: currentBuilder,
    parts: currentParts,
    line: markedLine,
    pending: canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan
  });
}
export {
  acceptBuilderPrice,
  canReuseReconciledLegacyBuilder,
  deleteBuilderProductCascade,
  ensureBuilderProductForLine,
  ensureEstimateBuilderProducts,
  getSourceProject,
  makeStableId,
  recordBuilderSave,
  snapshotHash,
  sourceProjectTotal,
  stableStringify
};
