// frozen:/app/src/pages/VinylEstimator.jsx
import { useEffect as useEffect4, useMemo as useMemo8, useState as useState7, useCallback as useCallback2, useRef as useRef4 } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

// s:s://@/api/gatedEntities
var VinylInventory = globalThis.__entVinyl ||= { __ent: "vinyl" };
var VinylMachine = globalThis.__entMachine ||= { __ent: "machine" };
var Settings = globalThis.__entSettings ||= { __ent: "settings" };
var ChannelLetterInstallEquipment = globalThis.__entEquip ||= { __ent: "equip" };
var VinylProject = {
  get: async (id) => {
    globalThis.__spies.push(["projectGet", id]);
    return globalThis.__project ?? null;
  }
};

// s:s://@/components/ui/card
import { jsx } from "react/jsx-runtime";
var Card = (p) => /* @__PURE__ */ jsx("div", { ...p, children: p.children });
var CardContent = (p) => /* @__PURE__ */ jsx("div", { ...p, children: p.children });
var CardHeader = (p) => /* @__PURE__ */ jsx("div", { ...p, children: p.children });
var CardTitle = (p) => /* @__PURE__ */ jsx("div", { ...p, children: p.children });

// s:s://@/components/ui/input
import { jsx as jsx2 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx2("input", { ...p });

// s:s://@/components/ui/label
import { jsx as jsx3 } from "react/jsx-runtime";
var Label = (p) => /* @__PURE__ */ jsx3("label", { ...p, children: p.children });

// s:s://@/components/ui/textarea
import { jsx as jsx4 } from "react/jsx-runtime";
var Textarea = (p) => /* @__PURE__ */ jsx4("textarea", { ...p });

// s:s://@/components/ui/button
import { jsx as jsx5 } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx5("button", { type: "button", ...p, children: p.children });

// s:s://@/components/ui/tabs
import { jsx as jsx6 } from "react/jsx-runtime";
var Tabs = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var TabsContent = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var TabsList = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var TabsTrigger = (p) => /* @__PURE__ */ jsx6("button", { type: "button", onClick: p.onClick, children: p.children });

// s:s://lucide-react
var ArrowLeft = () => null;
var Droplets = () => null;
var Loader2 = () => null;
var FileText = () => null;
var Layers = () => null;
var HardHat = () => null;
var Calculator = () => null;
var Plus = () => null;
var MapPin = () => null;
var Settings2 = () => null;
var ChevronsUpDown = () => null;
var ChevronsDownUp = () => null;
var BookmarkPlus = () => null;
var ClipboardPaste = () => null;
var UploadCloud = () => null;
var AlertTriangle = () => null;
var TrendingUp = () => null;
var ZoomIn = () => null;
var ZoomOut = () => null;
var RotateCcw = () => null;
var ArrowDown = () => null;
var Move = () => null;
var CheckCircle2 = () => null;
var TrendingDown = () => null;
var Sparkles = () => null;
var Search = () => null;
var Check = () => null;
var ArrowUpDown = () => null;
var Bookmark = () => null;
var Trash2 = () => null;
var Sliders = () => null;
var ChevronDown = () => null;
var ChevronRight = () => null;
var Copy = () => null;
var Pencil = () => null;
var X = () => null;
var Palette = () => null;
var MoveRight = () => null;
var Scissors = () => null;
var Users = () => null;
var Printer = () => null;
var Lightbulb = () => null;
var ArrowRight = () => null;
var Save = () => null;

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx7 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx7("div", { "data-stub": "CustomerPricingTab" });

// frozen:/app/src/components/markup/projectCategorizer.jsx
var num = (v) => Number(v) || 0;
var _catCache = /* @__PURE__ */ new WeakMap();
var _catMemo = (p, compute) => {
  if (!p || typeof p !== "object") return compute(p);
  let byFn = _catCache.get(p);
  if (byFn && byFn.has(compute)) return byFn.get(compute);
  const out = compute(p);
  if (!byFn) {
    byFn = /* @__PURE__ */ new Map();
    _catCache.set(p, byFn);
  }
  byFn.set(compute, out);
  return out;
};
function _impl_categorizeVinylProject(p) {
  if (!p) return [];
  const lines = [];
  const materials = num(p.total_vinyl_cost) + num(p.total_laminate_cost) + num(p.total_ink_cost) + num(p.total_blade_cost) + num(p.total_supplies_cost);
  if (materials > 0) lines.push({ module: "vinyl", label: "Vinyl, Laminate, Tape, Ink & Supplies", cost: materials, category_key: "substrates" });
  const machine = num(p.total_machine_cost);
  if (machine > 0) lines.push({ module: "vinyl", label: "Printer / Cutter / Laminator Time", cost: machine, category_key: "machine_time" });
  const labor = num(p.labor_cost) + num(p.total_personnel_cost);
  if (labor > 0) lines.push({ module: "vinyl", label: "Production & Install Labor", cost: labor, category_key: "inhouse_labor" });
  const equip = num(p.total_equipment_cost);
  if (equip > 0) lines.push({ module: "vinyl", label: "Install Equipment", cost: equip, category_key: "outsourced_services" });
  const travel = num(p.total_travel_cost);
  if (travel > 0) lines.push({ module: "vinyl", label: "Travel", cost: travel, category_key: "outsourced_services" });
  return lines;
}
var categorizeVinylProject = (p) => _catMemo(p, _impl_categorizeVinylProject);

// s:s://@/components/markup/savedCustomerPricing
async function calculateSavedCustomerPricing(a) {
  globalThis.__spies.push(["pricing", a]);
  return null;
}

// s:s://@/components/estimator/builder/builderService
var recordBuilderSave = async (a) => {
  globalThis.__spies.push(["recordBuilderSave", a]);
  return { ok: true };
};

// s:s://@/components/estimator/loadAllEntityRows
async function loadAllEntityRows(a) {
  globalThis.__catalogReads.push(a.label);
  if (a.entity === globalThis.__entVinyl) return globalThis.__vinylRows || [];
  if (a.entity === globalThis.__entMachine) return globalThis.__machineRows || [];
  if (a.entity === globalThis.__entSettings) return globalThis.__settingRows || [];
  if (a.entity === globalThis.__entEquip) return globalThis.__equipRows || [];
  if (a.entity === globalThis.__entLabor) return globalThis.__laborRows || [];
  return [];
}

// s:s://@/components/estimator/builder/sourceProjectPersistence
var updateBuilderSourceProject = async (a) => {
  globalThis.__spies.push(["saveSource", a]);
  return { ...a.data, id: a.sourceId, updated_date: "v2" };
};
var preflightBuilderSourceMutation = async (a) => {
  globalThis.__spies.push(["preflight", a]);
};

// s:s://@/components/estimator/idempotentEntityCreate
var ensureIdempotentEntityCreate = async (a) => {
  globalThis.__spies.push(["ensureIdempotent", a]);
  return { ...a.data, id: "new-1", updated_date: "v1" };
};
var newCreationRequestKey = (k) => "key-" + k + "-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);

// s:s://@/components/estimator/moduleShared/ModuleActionBar
import { jsx as jsx8 } from "react/jsx-runtime";
var ModuleActionBar_default = (p) => /* @__PURE__ */ jsx8("button", { type: "button", "data-stub": "copy", onClick: p.onSaveAsCopy, children: "copy" });

// s:s://@/components/estimator/moduleShared/ModuleTemplateDialog
var ModuleTemplateDialog_default = () => null;

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var saveModuleProjectCopy = async (a) => {
  globalThis.__spies.push(["saveCopy", a]);
  return { id: "copy-1" };
};

// s:s://@/components/channelLetterInstall/AddressAutocomplete
import { jsx as jsx9 } from "react/jsx-runtime";
var AddressAutocomplete_default = (p) => /* @__PURE__ */ jsx9("input", { value: p.value || "", onChange: (e) => p.onChange?.(e.target.value) });

// s:s://@/components/channelLetterInstall/EquipmentSelector
import { jsx as jsx10 } from "react/jsx-runtime";
var EquipmentSelector_default = () => /* @__PURE__ */ jsx10("div", { "data-stub": "EquipmentSelector" });

// s:s://@/components/channelLetterInstall/PersonnelSelector
import { jsx as jsx11 } from "react/jsx-runtime";
var PersonnelSelector_default = () => /* @__PURE__ */ jsx11("div", { "data-stub": "PersonnelSelector" });

// s:s://@/components/channelLetterInstall/TravelCostCard
import { jsx as jsx12 } from "react/jsx-runtime";
var TravelCostCard_default = () => /* @__PURE__ */ jsx12("div", { "data-stub": "TravelCostCard" });

// frozen:/app/src/components/vinylEstimator/VinylWorkflowCard.jsx
import { useState as useState6, useMemo as useMemo7, useEffect as useEffect3 } from "react";

// frozen:/app/src/components/vinylEstimator/VinylMaterialPicker.jsx
import { useMemo as useMemo2, useState as useState2 } from "react";

// s:s://@/components/ui/switch
import { jsx as jsx13 } from "react/jsx-runtime";
var Switch = (p) => /* @__PURE__ */ jsx13("input", { type: "checkbox", checked: p.checked, onChange: (e) => p.onCheckedChange?.(e.target.checked) });

// s:s://@/components/ui/badge
import { jsx as jsx14 } from "react/jsx-runtime";
var Badge = (p) => /* @__PURE__ */ jsx14("span", { ...p, children: p.children });

// frozen:/app/src/components/vinylEstimator/vinylCostHelpers.jsx
var num2 = (v, d = 0) => {
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
  const used = num2(calc?.usedSqFt);
  const pulled = num2(calc?.totalRollSqFtPulled);
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
  const rollLengthIn = num2(vinyl.roll_length_yards) * 36;
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
var computeAlternativeVinylCost = (calc, altVinyl) => {
  if (!calc || !altVinyl) return null;
  const widthFt = num2(altVinyl.roll_width_inches) / 12;
  const lenFt = num2(altVinyl.roll_length_yards) * 3;
  const rollSqFt = widthFt * lenFt;
  let altRate = 0;
  if (altVinyl.pricing_mode === "per_sqft") altRate = num2(altVinyl.cost_per_sqft);
  else if (altVinyl.pricing_mode === "per_linear_foot") altRate = num2(altVinyl.cost_per_linear_foot) / Math.max(widthFt, 0.01);
  else altRate = rollSqFt > 0 ? num2(altVinyl.cost_per_roll) / rollSqFt : 0;
  const altWasteMult = 1 + num2(altVinyl.waste_factor_percent, 0) / 100;
  return num2(calc.totalRollSqFtPulled) * altRate * altWasteMult;
};
var computeLifetimeWarning = (vinyl, environment) => {
  if (!vinyl || environment !== "exterior") return null;
  const yrs = num2(vinyl.expected_life_years_outdoor);
  if (yrs > 0 && yrs < 3) {
    return { severity: "high", message: `Outdoor life only ${yrs} years \u2014 consider a longer-life vinyl for exterior installs.` };
  }
  if (vinyl.indoor_outdoor === "indoor_only") {
    return { severity: "high", message: "This vinyl is marked indoor-only but the project is exterior." };
  }
  return null;
};

// frozen:/app/src/components/vinylInventory/vinylConstants.jsx
var WEEDING_DIFFICULTY_LABELS = {
  very_easy: "Very Easy",
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  very_hard: "Very Hard"
};
var WEEDING_DIFFICULTY = ["very_easy", "easy", "moderate", "hard", "very_hard"];
var WEEDING_LABOR_MINUTES_PER_PART = {
  very_easy: 0.1,
  easy: 0.3,
  moderate: 0.6,
  hard: 1.2,
  very_hard: 2.5
};
var PRINT_QUALITY_TIERS = [
  { id: "draft", label: "Draft" },
  { id: "production", label: "Production" },
  { id: "high_quality", label: "High Quality" }
];
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
var num3 = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
var sqInToSqFt = (sqIn) => sqIn / 144;
var computeRollSqFtCost = (vinyl) => {
  if (!vinyl) return 0;
  const widthFt = num3(vinyl.roll_width_inches) / 12;
  const lenFt = num3(vinyl.roll_length_yards) * 3;
  const rollSqFt = widthFt * lenFt;
  if (vinyl.pricing_mode === "per_sqft") return num3(vinyl.cost_per_sqft);
  if (vinyl.pricing_mode === "per_linear_foot") return num3(vinyl.cost_per_linear_foot) / Math.max(widthFt, 0.01);
  return rollSqFt > 0 ? num3(vinyl.cost_per_roll) / rollSqFt : 0;
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
  const rollWidth = num3(vinyl?.roll_width_inches, 54);
  const leftMargin = num3(leadingMachine?.left_margin_inches, 0.5);
  const rightMargin = num3(leadingMachine?.right_margin_inches, 0.5);
  const leadingEdge = num3(leadingMachine?.leading_edge_inches, 4);
  const trailingEdge = num3(leadingMachine?.trailing_edge_inches, 2);
  const machineWidthCap = Math.min(
    applyPrint && printer ? num3(printer.max_media_width_inches, 999) : 999,
    applyCut && cutter ? num3(cutter.max_media_width_inches, 999) : 999,
    applyLaminate && laminator ? num3(laminator.max_media_width_inches, 999) : 999
  );
  const effectiveRollWidth = Math.min(rollWidth, machineWidthCap);
  const usableWidth = Math.max(0, effectiveRollWidth - leftMargin - rightMargin);
  const gutterH = overrideGutterH ?? num3(leadingMachine?.default_gutter_horizontal_inches, 0.25);
  const gutterV = overrideGutterV ?? num3(leadingMachine?.default_gutter_vertical_inches, 0.25);
  const spoilMult = 1 + Math.max(0, num3(spoilageBufferPercent, 0)) / 100;
  const rects = [];
  items.forEach((it, itemIdx) => {
    const baseBleed = num3(it.bleed_inches, num3(leadingMachine?.default_bleed_inches, 0));
    const partW = num3(it.width_inches);
    const partH = num3(it.height_inches);
    const w0 = partW + baseBleed * 2;
    const h0 = partH + baseBleed * 2;
    const rawQty = Math.max(1, Math.floor(num3(it.quantity, 1)));
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
  const cutPullOff = applyCut && cutter ? num3(cutter.cut_pull_off_inches_per_job, 0) : 0;
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
  const vinylWasteMult = 1 + num3(vinyl?.waste_factor_percent, 0) / 100;
  const vinylCost = totalRollSqFtPulled * vinylSqFtRate * vinylWasteMult;
  let laminateSqFt = 0, laminateCost = 0, laminateMinutes = 0;
  if (applyLaminate && laminate) {
    const lamWidth = Math.min(num3(laminate.roll_width_inches, effectiveRollWidth), effectiveRollWidth);
    const lamLengthIn = lengthConsumedIn + num3(laminator?.leading_edge_inches, 0) + num3(laminator?.trailing_edge_inches, 0);
    laminateSqFt = sqInToSqFt(lamLengthIn * lamWidth);
    const lamSqFtRate = computeRollSqFtCost(laminate);
    const lamWasteMult = 1 + num3(laminate.waste_factor_percent, 0) / 100;
    laminateCost = laminateSqFt * lamSqFtRate * lamWasteMult;
    const ipm = Math.max(1, num3(laminator?.laminator_speed_inches_per_minute, 100));
    laminateMinutes = lamLengthIn / ipm + num3(laminator?.laminator_setup_minutes_per_job, 0);
  }
  let inkCost = 0, printMinutes = 0, printMachineCost = 0;
  const inkRatePerSqIn = applyPrint && printer ? inkCostPerSqIn(printer, printQuality) : 0;
  if (applyPrint && printer) {
    inkCost = usedSqFt * 144 * inkRatePerSqIn;
    const sph = Math.max(1, num3(printer.print_speed_sqft_per_hour, 100));
    printMinutes = usedSqFt / sph * 60 + num3(printer.warmup_minutes, 0) + num3(printer.media_load_minutes, 0) + num3(printer.calibration_minutes_per_job, 0);
    printMachineCost = printMinutes / 60 * num3(printer.machine_hourly_rate, 0);
  }
  let cutDistanceIn = 0, cutMinutes = 0, cutMachineCost = 0, bladeCost = 0;
  if (applyCut && cutter) {
    cutDistanceIn = shelves.reduce((s, sh) => s + sh.items.reduce((ss, it) => {
      const pw = it.partW ?? it.w;
      const ph = it.partH ?? it.h;
      return ss + 2 * (pw + ph);
    }, 0), 0);
    const ips = Math.max(0.1, num3(cutter.cut_speed_inches_per_second, 30));
    cutMinutes = cutDistanceIn / ips / 60 + num3(cutter.cut_setup_minutes_per_job, 0);
    cutMachineCost = cutMinutes / 60 * num3(cutter.machine_hourly_rate, 0);
    const bladeLife = Math.max(1, num3(cutter.cut_blade_life_minutes, 6e3));
    bladeCost = cutMinutes / bladeLife * num3(cutter.cut_blade_cost, 0);
  }
  const laminateMachineCost = applyLaminate && laminator ? laminateMinutes / 60 * num3(laminator.laminator_hourly_rate, 0) : 0;
  let transferTapeSqFt = 0, transferTapeCost = 0;
  if (applyTransferTape && transferTape) {
    const ttWidth = Math.min(num3(transferTape.roll_width_inches, effectiveRollWidth), effectiveRollWidth);
    transferTapeSqFt = sqInToSqFt(lengthConsumedIn * ttWidth);
    const ttSqFtRate = computeRollSqFtCost(transferTape);
    const ttWasteMult = 1 + num3(transferTape.waste_factor_percent, 0) / 100;
    transferTapeCost = transferTapeSqFt * ttSqFtRate * ttWasteMult;
  }
  const machineCost = printMachineCost + cutMachineCost + laminateMachineCost;
  const machineRunMinutes = (applyPrint ? printMinutes : 0) + (applyCut ? cutMinutes : 0) + (applyLaminate ? laminateMinutes : 0);
  const weedMinPerPart = Number.isFinite(parseFloat(weedingMinutesPerPartOverride)) ? parseFloat(weedingMinutesPerPartOverride) : WEEDING_LABOR_MINUTES_PER_PART[weedingDifficulty] ?? WEEDING_LABOR_MINUTES_PER_PART.moderate;
  const weedingMinutes = applyCut ? weedMinPerPart * partsPlaced : 0;
  const installMinPerPart = Math.max(0, num3(installMinutesPerPart, 0));
  const installMinutes = installMinPerPart * partsPlaced;
  let perPersonnelCost = 0;
  let perPersonnelMinutes = 0;
  (personnel || []).forEach((p) => {
    const hrs = num3(p?.hours, 0);
    const rate = num3(p?.hourly_rate, 0);
    if (hrs > 0 && rate > 0) {
      perPersonnelCost += hrs * rate;
      perPersonnelMinutes += hrs * 60;
    }
  });
  const fallbackLaborMinutes = machineRunMinutes + weedingMinutes + installMinutes;
  const fallbackLaborCost = fallbackLaborMinutes / 60 * num3(operatorHourlyRate, 45);
  const laborMinutes = perPersonnelMinutes > 0 ? perPersonnelMinutes : fallbackLaborMinutes;
  const laborHours = laborMinutes / 60;
  const laborCost = perPersonnelCost > 0 ? perPersonnelCost : fallbackLaborCost;
  const materialCost = vinylCost + laminateCost + transferTapeCost + inkCost + bladeCost;
  const preFloorTotal = materialCost + machineCost + laborCost;
  const floor = Math.max(0, num3(setupFeeFloor, 0));
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
var num4 = (v) => {
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
    overrideGutterH: workflow?.gutter_h_override === "" || workflow?.gutter_h_override == null ? void 0 : num4(workflow.gutter_h_override),
    overrideGutterV: workflow?.gutter_v_override === "" || workflow?.gutter_v_override == null ? void 0 : num4(workflow.gutter_v_override),
    printQuality: workflow?.print_quality || printer?.default_print_quality || "high_quality",
    weedingDifficulty: workflow?.weeding_difficulty || "moderate",
    weedingMinutesPerPartOverride: workflow?.weeding_minutes_per_part_override,
    installMinutesPerPart: workflow?.install_minutes_per_part,
    personnel: workflow?.personnel || [],
    spoilageBufferPercent: num4(workflow?.spoilage_buffer_percent),
    setupFeeFloor: num4(workflow?.setup_fee_floor)
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
  const sumOrNull2 = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
  out.materialCost = sumOrNull2(out.vinylCost, out.laminateCost, out.transferTapeCost, out.inkCost, out.bladeCost);
  out.machineCost = sumOrNull2(out.printMachineCost, out.cutMachineCost, out.laminateMachineCost);
  out.preFloorTotal = sumOrNull2(out.materialCost, out.machineCost, out.laborCost);
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

// frozen:/app/src/components/vinylEstimator/VinylSearchPickerDialog.jsx
import React, { useMemo, useState } from "react";

// s:s://@/components/ui/dialog
import { jsx as jsx15 } from "react/jsx-runtime";
var Dialog = (p) => p.open ? /* @__PURE__ */ jsx15("div", { children: p.children }) : null;
var DialogContent = (p) => /* @__PURE__ */ jsx15("div", { children: p.children });
var DialogHeader = (p) => /* @__PURE__ */ jsx15("div", { children: p.children });
var DialogTitle = (p) => /* @__PURE__ */ jsx15("div", { children: p.children });
var DialogFooter = (p) => /* @__PURE__ */ jsx15("div", { children: p.children });

// s:s://@/components/ui/select
import { jsx as jsx16 } from "react/jsx-runtime";
var Select = (p) => /* @__PURE__ */ jsx16("div", { children: p.children });
var SelectTrigger = (p) => /* @__PURE__ */ jsx16("div", { children: p.children });
var SelectValue = () => /* @__PURE__ */ jsx16("span", {});
var SelectContent = (p) => /* @__PURE__ */ jsx16("div", { children: p.children });
var SelectItem = (p) => /* @__PURE__ */ jsx16("div", { children: p.children });

// frozen:/app/src/components/vinylEstimator/VinylSearchPickerDialog.jsx
import { jsx as jsx17, jsxs } from "react/jsx-runtime";
var SORTS = {
  name: { label: "Name", fn: (a, b) => (a.vinyl_name || "").localeCompare(b.vinyl_name || "") },
  manufacturer: { label: "Manufacturer", fn: (a, b) => (a.manufacturer || "").localeCompare(b.manufacturer || "") },
  category: { label: "Category", fn: (a, b) => (a.vinyl_category || "").localeCompare(b.vinyl_category || "") },
  width: { label: "Roll Width", fn: (a, b) => (a.roll_width_inches || 0) - (b.roll_width_inches || 0) }
};
var matchesQuery = (v, q) => {
  if (!q) return true;
  const hay = [
    v.vinyl_name,
    v.manufacturer,
    v.product_series,
    v.color_name,
    v.vinyl_category,
    v.finish,
    v.vinyl_use_case
  ].filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((term) => hay.includes(term));
};
function VinylSearchPickerDialog({
  open,
  onOpenChange,
  options,
  selectedId,
  onSelect,
  title = "Select Vinyl",
  allowNone = false
}) {
  const [query, setQuery] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("q") || "";
    } catch {
      return "";
    }
  });
  const [sortKey, setSortKey] = useState("name");
  const filtered = useMemo(() => {
    const list = options.filter((v) => matchesQuery(v, query));
    return [...list].sort(SORTS[sortKey].fn);
  }, [options, query, sortKey]);
  const handlePick = (id) => {
    onSelect(id);
    onOpenChange(false);
    setQuery("");
  };
  return /* @__PURE__ */ jsx17(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(DialogContent, { className: "max-w-2xl max-h-[85vh] flex flex-col", children: [
    /* @__PURE__ */ jsx17(DialogHeader, { children: /* @__PURE__ */ jsx17(DialogTitle, { children: title }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative flex-1", children: [
        /* @__PURE__ */ jsx17(Search, { className: "absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }),
        /* @__PURE__ */ jsx17(
          Input,
          {
            autoFocus: true,
            value: query,
            onChange: (e) => setQuery(e.target.value),
            placeholder: "Search name, color, manufacturer, category\u2026",
            className: "pl-8 h-9"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs(Select, { value: sortKey, onValueChange: setSortKey, children: [
        /* @__PURE__ */ jsxs(SelectTrigger, { className: "h-9 w-44", children: [
          /* @__PURE__ */ jsx17(ArrowUpDown, { className: "w-3.5 h-3.5 mr-1 text-slate-400" }),
          /* @__PURE__ */ jsx17(SelectValue, {})
        ] }),
        /* @__PURE__ */ jsx17(SelectContent, { children: Object.entries(SORTS).map(([k, s]) => /* @__PURE__ */ jsxs(SelectItem, { value: k, children: [
          "Sort: ",
          s.label
        ] }, k)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-slate-500 px-1", children: [
      filtered.length,
      " of ",
      options.length,
      " shown"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto -mx-1 px-1 space-y-1", children: [
      allowNone && /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => handlePick(""),
          className: `w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between ${!selectedId ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`,
          children: [
            /* @__PURE__ */ jsx17("span", { className: "text-sm text-slate-600 italic", children: "None" }),
            !selectedId && /* @__PURE__ */ jsx17(Check, { className: "w-4 h-4 text-blue-600" })
          ]
        }
      ),
      filtered.map((v) => {
        const isSel = v.id === selectedId;
        return /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => handlePick(v.id),
            className: `w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between gap-3 ${isSel ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`,
            children: [
              /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsxs("div", { className: "text-sm font-medium text-slate-900 truncate", children: [
                  v.vinyl_name,
                  v.roll_width_inches ? ` \xB7 ${v.roll_width_inches}\u2033` : ""
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-1 mt-1", children: [
                  v.manufacturer && /* @__PURE__ */ jsx17(Badge, { variant: "outline", className: "text-[10px]", children: v.manufacturer }),
                  v.vinyl_category && /* @__PURE__ */ jsx17(Badge, { variant: "outline", className: "text-[10px]", children: v.vinyl_category }),
                  v.finish && /* @__PURE__ */ jsx17(Badge, { variant: "outline", className: "text-[10px]", children: v.finish }),
                  v.color_name && /* @__PURE__ */ jsx17(Badge, { variant: "outline", className: "text-[10px]", children: v.color_name })
                ] })
              ] }),
              isSel && /* @__PURE__ */ jsx17(Check, { className: "w-4 h-4 text-blue-600 flex-shrink-0" })
            ]
          },
          v.id
        );
      }),
      filtered.length === 0 && /* @__PURE__ */ jsxs("div", { className: "text-center text-sm text-slate-400 py-10", children: [
        "No matches for \u201C",
        query,
        "\u201D."
      ] })
    ] }),
    /* @__PURE__ */ jsx17("div", { className: "flex justify-end pt-2 border-t", children: /* @__PURE__ */ jsx17(Button, { variant: "outline", size: "sm", onClick: () => onOpenChange(false), children: "Cancel" }) })
  ] }) });
}

// frozen:/app/src/components/vinylEstimator/VinylMaterialPicker.jsx
import { jsx as jsx18, jsxs as jsxs2 } from "react/jsx-runtime";
var PRESET_CATEGORY_HINT = {
  wrap: ["cast", "wrap_film"],
  print_only: ["calendered", "intermediate", "print_media"],
  print_and_cut: ["calendered", "intermediate", "cast", "print_media"],
  cut_only: ["calendered", "intermediate", "cast", "reflective", "translucent", "fluorescent", "metallic"],
  laminated_decal: ["cast", "calendered", "intermediate"]
};
function VinylMaterialPicker({
  vinyls,
  vinylId,
  laminateId,
  applyLaminate,
  onChange,
  presetKey,
  // current workflow preset, used for #25 recommendations
  installEnvironment,
  // "interior" | "exterior" → drives lifetime warning
  recommendOnly = false,
  issues = [],
  // pricing-availability issues for this workflow
  issuesId
  // aria-describedby target listing the issues
}) {
  const recommendedCategories = presetKey ? PRESET_CATEGORY_HINT[presetKey] : null;
  const baseOptions = useMemo2(() => {
    const base = vinyls.filter((v) => v.is_active !== false && !v.is_laminate && v.show_in_vinyl_estimator !== false);
    if (!recommendOnly || !recommendedCategories) return base;
    return base.filter((v) => recommendedCategories.includes(v.vinyl_category));
  }, [vinyls, recommendOnly, recommendedCategories]);
  const lamOptions = useMemo2(
    () => vinyls.filter((v) => v.is_active !== false && v.is_laminate && v.show_in_vinyl_estimator !== false),
    [vinyls]
  );
  const selectedVinyl = vinyls.find((v) => v.id === vinylId) || null;
  const selectedLaminate = vinyls.find((v) => v.id === laminateId) || null;
  const lifetimeWarning = computeLifetimeWarning(selectedVinyl, installEnvironment);
  const [vinylPickerOpen, setVinylPickerOpen] = useState2(false);
  const [lamPickerOpen, setLamPickerOpen] = useState2(false);
  const handleVinylChange = (newId) => {
    const v = vinyls.find((x) => x.id === newId);
    const nextLam = v?.default_laminate_id || laminateId || "";
    const nextApply = !!(v?.requires_lamination || applyLaminate && nextLam);
    onChange({ vinylId: newId, laminateId: nextLam, applyLaminate: nextApply });
  };
  return /* @__PURE__ */ jsxs2(Card, { children: [
    /* @__PURE__ */ jsx18(CardHeader, { className: "pb-2", children: /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs2(CardTitle, { className: "text-base flex items-center gap-2", children: [
        /* @__PURE__ */ jsx18(Layers, { className: "w-4 h-4 text-blue-600" }),
        " Vinyl & Laminate"
      ] }),
      recommendedCategories && /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2 text-[11px]", children: [
        /* @__PURE__ */ jsx18("span", { className: "text-slate-500", children: "Recommend only" }),
        /* @__PURE__ */ jsx18(Switch, { checked: recommendOnly, onCheckedChange: (v) => onChange({ vinylId, laminateId, applyLaminate, recommendOnly: !!v }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs2(CardContent, { className: "grid md:grid-cols-2 gap-4", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx18(Label, { className: "text-xs", children: "Base Vinyl" }),
        /* @__PURE__ */ jsxs2(
          "button",
          {
            type: "button",
            onClick: () => setVinylPickerOpen(true),
            "aria-invalid": hasIssueFor(issues, "vinyl_id") || vinylId && issues.some((i) => i.inventoryId === vinylId) || void 0,
            "aria-describedby": hasIssueFor(issues, "vinyl_id") || vinylId && issues.some((i) => i.inventoryId === vinylId) ? issuesId : void 0,
            className: "h-9 mt-1 w-full flex items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-slate-50 transition-colors",
            children: [
              /* @__PURE__ */ jsx18("span", { className: `truncate ${selectedVinyl ? "text-slate-900" : "text-muted-foreground"}`, children: selectedVinyl ? `${selectedVinyl.vinyl_name}${selectedVinyl.roll_width_inches ? ` \xB7 ${selectedVinyl.roll_width_inches}\u2033` : ""}` : "Choose vinyl\u2026" }),
              /* @__PURE__ */ jsx18(ChevronDown, { className: "w-4 h-4 text-slate-400 flex-shrink-0 ml-2" })
            ]
          }
        ),
        /* @__PURE__ */ jsx18(
          VinylSearchPickerDialog,
          {
            open: vinylPickerOpen,
            onOpenChange: setVinylPickerOpen,
            options: baseOptions,
            selectedId: vinylId || "",
            onSelect: handleVinylChange,
            title: "Select Base Vinyl"
          }
        ),
        selectedVinyl && /* @__PURE__ */ jsxs2("div", { className: "mt-2 flex flex-wrap gap-1", children: [
          selectedVinyl.vinyl_category && /* @__PURE__ */ jsx18(Badge, { variant: "outline", className: "text-[10px]", children: selectedVinyl.vinyl_category }),
          selectedVinyl.finish && /* @__PURE__ */ jsx18(Badge, { variant: "outline", className: "text-[10px]", children: selectedVinyl.finish }),
          selectedVinyl.expected_life_years_outdoor && /* @__PURE__ */ jsxs2(Badge, { variant: "outline", className: "text-[10px]", children: [
            selectedVinyl.expected_life_years_outdoor,
            "y outdoor"
          ] }),
          selectedVinyl.requires_lamination && /* @__PURE__ */ jsx18(Badge, { variant: "outline", className: "text-[10px] bg-purple-50 text-purple-700", children: "recommends laminate" })
        ] }),
        lifetimeWarning && /* @__PURE__ */ jsxs2("div", { className: "mt-2 flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1", children: [
          /* @__PURE__ */ jsx18(AlertTriangle, { className: "w-3 h-3 mt-0.5 flex-shrink-0" }),
          /* @__PURE__ */ jsx18("span", { children: lifetimeWarning.message })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx18(Label, { className: "text-xs", children: "Laminate" }),
          /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx18("span", { className: "text-[11px] text-slate-500", children: "Apply" }),
            /* @__PURE__ */ jsx18(Switch, { checked: !!applyLaminate, onCheckedChange: (v) => onChange({ vinylId, laminateId, applyLaminate: !!v }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2(
          "button",
          {
            type: "button",
            disabled: !applyLaminate,
            onClick: () => setLamPickerOpen(true),
            "aria-invalid": hasIssueFor(issues, "laminate_id") || laminateId && issues.some((i) => i.inventoryId === laminateId) || void 0,
            "aria-describedby": hasIssueFor(issues, "laminate_id") || laminateId && issues.some((i) => i.inventoryId === laminateId) ? issuesId : void 0,
            className: "h-9 mt-1 w-full flex items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
            children: [
              /* @__PURE__ */ jsx18("span", { className: `truncate ${selectedLaminate ? "text-slate-900" : "text-muted-foreground"}`, children: selectedLaminate ? selectedLaminate.vinyl_name : "None" }),
              /* @__PURE__ */ jsx18(ChevronDown, { className: "w-4 h-4 text-slate-400 flex-shrink-0 ml-2" })
            ]
          }
        ),
        /* @__PURE__ */ jsx18(
          VinylSearchPickerDialog,
          {
            open: lamPickerOpen,
            onOpenChange: setLamPickerOpen,
            options: lamOptions,
            selectedId: laminateId || "",
            onSelect: (id) => onChange({ vinylId, laminateId: id, applyLaminate: !!applyLaminate }),
            title: "Select Laminate",
            allowNone: true
          }
        ),
        applyLaminate && lamOptions.length === 0 && /* @__PURE__ */ jsx18("p", { className: "text-[11px] text-amber-600 mt-1", children: "No laminate rolls tagged yet. Tag one in Master Inventory \u2192 Vinyl." })
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylMachinePicker.jsx
import { jsx as jsx19, jsxs as jsxs3 } from "react/jsx-runtime";
var MachineRow = ({ icon: RowIcon, label, machines, value, onValueChange, apply, onApplyChange, disabled, accent, children, issues = [], issuesId, field }) => {
  const flagged = hasIssueFor(issues, field) || value && issues.some((i) => i.inventoryId === value);
  return /* @__PURE__ */ jsxs3("div", { className: `p-3 rounded-lg border ${apply ? accent : "bg-slate-50 border-slate-200 opacity-70"}`, children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between mb-2", children: [
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2 text-sm font-medium text-slate-800", children: [
        /* @__PURE__ */ jsx19(RowIcon, { className: "w-4 h-4" }),
        " ",
        label
      ] }),
      /* @__PURE__ */ jsx19(Switch, { checked: apply, onCheckedChange: onApplyChange, disabled })
    ] }),
    /* @__PURE__ */ jsxs3(Select, { value: value || "", onValueChange, disabled: !apply, children: [
      /* @__PURE__ */ jsx19(
        SelectTrigger,
        {
          className: "h-9",
          "aria-invalid": flagged || void 0,
          "aria-describedby": flagged ? issuesId : void 0,
          children: /* @__PURE__ */ jsx19(SelectValue, { placeholder: "Choose machine\u2026" })
        }
      ),
      /* @__PURE__ */ jsx19(SelectContent, { children: machines.map((m) => /* @__PURE__ */ jsx19(SelectItem, { value: m.id, children: m.machine_name }, m.id)) })
    ] }),
    apply && machines.length === 0 && /* @__PURE__ */ jsx19("p", { className: "text-[11px] text-amber-600 mt-1", children: "No machines configured. Add one in Vinyl Settings." }),
    children
  ] });
};
function VinylMachinePicker({ machines, value, onChange, issues = [], issuesId }) {
  const printers = machines.filter((m) => m.is_active !== false && (m.machine_type === "printer" || m.machine_type === "print_and_cut"));
  const cutters = machines.filter((m) => m.is_active !== false && (m.machine_type === "cutter" || m.machine_type === "print_and_cut"));
  const laminators = machines.filter((m) => m.is_active !== false && m.machine_type === "laminator");
  const printer = printers.find((m) => m.id === value.printer_id);
  const quality = value.printQuality || "high_quality";
  return /* @__PURE__ */ jsxs3(Card, { children: [
    /* @__PURE__ */ jsx19(CardHeader, { className: "pb-2", children: /* @__PURE__ */ jsx19(CardTitle, { className: "text-base", children: "Production Machines" }) }),
    /* @__PURE__ */ jsxs3(CardContent, { className: "grid md:grid-cols-3 gap-3", children: [
      /* @__PURE__ */ jsx19(
        MachineRow,
        {
          icon: Printer,
          label: "Printer",
          machines: printers,
          value: value.printer_id,
          onValueChange: (id) => onChange({ printer_id: id }),
          apply: value.applyPrint,
          onApplyChange: (v) => onChange({ applyPrint: v }),
          accent: "bg-emerald-50 border-emerald-200",
          issues,
          issuesId,
          field: "printer_id",
          children: value.applyPrint && /* @__PURE__ */ jsxs3("div", { className: "mt-2", children: [
            /* @__PURE__ */ jsx19(Label, { className: "text-[10px] uppercase tracking-wider text-emerald-800", children: "Print Quality" }),
            /* @__PURE__ */ jsxs3(Select, { value: quality, onValueChange: (q) => onChange({ printQuality: q }), children: [
              /* @__PURE__ */ jsx19(
                SelectTrigger,
                {
                  className: "h-8 text-xs mt-1",
                  "aria-invalid": hasIssueFor(issues, "print_quality") || void 0,
                  "aria-describedby": hasIssueFor(issues, "print_quality") ? issuesId : void 0,
                  children: /* @__PURE__ */ jsx19(SelectValue, {})
                }
              ),
              /* @__PURE__ */ jsx19(SelectContent, { children: PRINT_QUALITY_TIERS.map((t) => /* @__PURE__ */ jsxs3(SelectItem, { value: t.id, children: [
                t.label,
                " \xB7 $",
                inkCostPerSqIn(printer, t.id).toFixed(3),
                "/sqin"
              ] }, t.id)) })
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ jsx19(
        MachineRow,
        {
          icon: Scissors,
          label: "Cutter",
          machines: cutters,
          value: value.cutter_id,
          onValueChange: (id) => onChange({ cutter_id: id }),
          apply: value.applyCut,
          onApplyChange: (v) => onChange({ applyCut: v }),
          accent: "bg-rose-50 border-rose-200",
          issues,
          issuesId,
          field: "cutter_id"
        }
      ),
      /* @__PURE__ */ jsx19(
        MachineRow,
        {
          icon: Layers,
          label: "Laminator",
          machines: laminators,
          value: value.laminator_id,
          onValueChange: (id) => onChange({ laminator_id: id }),
          apply: value.applyLaminate,
          onApplyChange: (v) => onChange({ applyLaminate: v }),
          accent: "bg-purple-50 border-purple-200",
          issues,
          issuesId,
          field: "laminator_id"
        }
      )
    ] })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylPartsTable.jsx
import { useRef } from "react";

// s:s://@/components/ui/checkbox
import { jsx as jsx20 } from "react/jsx-runtime";
var Checkbox = (p) => /* @__PURE__ */ jsx20("input", { type: "checkbox", checked: p.checked, onChange: (e) => p.onCheckedChange?.(e.target.checked) });

// frozen:/app/src/components/vinylEstimator/VinylPartsTable.jsx
import { Fragment, jsx as jsx21, jsxs as jsxs4 } from "react/jsx-runtime";
var blankItem = () => ({
  id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  description: "",
  width_inches: 12,
  height_inches: 12,
  quantity: 1,
  bleed_inches: 0,
  allow_rotation: false
});
var fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
function VinylPartsTable({
  items,
  onChange,
  perPartCosts = {},
  // { idx: { partsPlaced, costEach, totalCost } }
  usableWidth = Infinity,
  // for validation
  defaultBleed = 0.125,
  // when "Auto Bleed" pressed
  onMoveToWorkflow,
  // (idx) => void   — open the move menu
  issues = [],
  // pricing-availability issues for this workflow
  issuesId
  // aria-describedby target listing the issues
}) {
  const tableEndRef = useRef(null);
  const update = (idx, patch) => onChange(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const remove = (idx) => {
    const it = items[idx];
    if (!confirm(`Remove "${it?.description || `part ${idx + 1}`}" from this workflow?`)) return;
    onChange(items.filter((_, i) => i !== idx));
  };
  const add = () => onChange([...items || [], blankItem()]);
  const duplicate = (idx) => {
    const copy = { ...items[idx], id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    const next = [...items];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  };
  const handleKeyDown = (e, idx, isLast) => {
    if (e.key === "Enter" && isLast) {
      e.preventDefault();
      add();
      setTimeout(() => tableEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxs4("div", { className: "hidden md:grid grid-cols-[1fr_70px_70px_60px_70px_70px_90px_90px] gap-2 text-[11px] font-medium text-slate-500 px-1 sticky top-0 bg-white z-10 py-1 border-b border-slate-200", children: [
      /* @__PURE__ */ jsx21("div", { children: "Description" }),
      /* @__PURE__ */ jsx21("div", { children: "W (in)" }),
      /* @__PURE__ */ jsx21("div", { children: "H (in)" }),
      /* @__PURE__ */ jsx21("div", { children: "Qty" }),
      /* @__PURE__ */ jsx21("div", { title: "Empty waste area added around the part (does not change part size)", children: "Bleed" }),
      /* @__PURE__ */ jsx21("div", { className: "text-center", title: "Allow the nester to rotate the part 90\xB0 to fit", children: "Rotate" }),
      /* @__PURE__ */ jsx21("div", { className: "text-right", children: "Cost ea / total" }),
      /* @__PURE__ */ jsx21("div", { className: "text-right", children: "Actions" })
    ] }),
    (items || []).map((it, idx) => {
      const isLast = idx === items.length - 1;
      const cost = perPartCosts[idx];
      const partW = (parseFloat(it.width_inches) || 0) + (parseFloat(it.bleed_inches) || 0) * 2;
      const partH = (parseFloat(it.height_inches) || 0) + (parseFloat(it.bleed_inches) || 0) * 2;
      const minDim = Math.min(partW, partH);
      const tooWide = isFinite(usableWidth) && minDim > usableWidth + 0.01;
      const rotateImpossible = isFinite(usableWidth) && partH > usableWidth + 0.01;
      const tooWideStrict = isFinite(usableWidth) && (it.allow_rotation ? partH > usableWidth + 0.01 : partW > usableWidth + 0.01);
      if (it.allow_rotation && rotateImpossible) {
        setTimeout(() => update(idx, { allow_rotation: false }), 0);
      }
      const rowIssues = issues.filter((i) => i.itemIndex === idx);
      const rowIssuesId = `${issuesId || `vinyl-wf-issues`}-part-${idx}`;
      return /* @__PURE__ */ jsxs4("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-[1fr_70px_70px_60px_70px_70px_90px_90px] gap-2 items-center", children: [
          /* @__PURE__ */ jsx21(
            Input,
            {
              value: it.description || "",
              onChange: (e) => update(idx, { description: e.target.value }),
              placeholder: `Item ${idx + 1}`,
              className: "h-9 text-sm"
            }
          ),
          /* @__PURE__ */ jsx21(
            Input,
            {
              type: "number",
              step: "0.125",
              value: it.width_inches ?? "",
              onChange: (e) => update(idx, { width_inches: vinylDraftValue(e.target.value) }),
              "aria-invalid": hasIssueFor(issues, "width_inches", idx) || void 0,
              "aria-describedby": hasIssueFor(issues, "width_inches", idx) ? rowIssuesId : void 0,
              className: "h-9 text-sm tabular-nums"
            }
          ),
          /* @__PURE__ */ jsx21(
            Input,
            {
              type: "number",
              step: "0.125",
              value: it.height_inches ?? "",
              onChange: (e) => update(idx, { height_inches: vinylDraftValue(e.target.value) }),
              "aria-invalid": hasIssueFor(issues, "height_inches", idx) || void 0,
              "aria-describedby": hasIssueFor(issues, "height_inches", idx) ? rowIssuesId : void 0,
              className: "h-9 text-sm tabular-nums"
            }
          ),
          /* @__PURE__ */ jsx21(
            Input,
            {
              type: "number",
              step: "1",
              min: "1",
              value: it.quantity ?? "",
              onChange: (e) => update(idx, { quantity: vinylDraftValue(e.target.value) }),
              "aria-invalid": hasIssueFor(issues, "quantity", idx) || void 0,
              "aria-describedby": hasIssueFor(issues, "quantity", idx) ? rowIssuesId : void 0,
              className: "h-9 text-sm tabular-nums"
            }
          ),
          /* @__PURE__ */ jsx21(
            Input,
            {
              type: "number",
              step: "0.0625",
              value: it.bleed_inches ?? "",
              onChange: (e) => update(idx, { bleed_inches: vinylDraftValue(e.target.value) }),
              "aria-invalid": hasIssueFor(issues, "bleed_inches", idx) || void 0,
              "aria-describedby": hasIssueFor(issues, "bleed_inches", idx) ? rowIssuesId : void 0,
              className: "h-9 text-sm tabular-nums",
              onKeyDown: (e) => handleKeyDown(e, idx, isLast)
            }
          ),
          /* @__PURE__ */ jsxs4(
            "div",
            {
              className: "flex items-center justify-center gap-1",
              title: rotateImpossible ? `Cannot rotate \u2014 part height (${partH.toFixed(2)}\u2033) exceeds usable roll width (${usableWidth.toFixed(2)}\u2033)` : "Rotate the part 90\xB0 on the roll layout",
              children: [
                /* @__PURE__ */ jsx21(
                  Checkbox,
                  {
                    id: `rot-${idx}`,
                    checked: it.allow_rotation === true,
                    disabled: rotateImpossible,
                    onCheckedChange: (v) => update(idx, { allow_rotation: !!v })
                  }
                ),
                /* @__PURE__ */ jsx21(
                  "label",
                  {
                    htmlFor: `rot-${idx}`,
                    className: `text-[10px] cursor-pointer select-none ${rotateImpossible ? "text-slate-300" : "text-slate-500"}`,
                    children: it.allow_rotation === true ? "Yes" : "No"
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ jsx21("div", { className: "text-right text-xs tabular-nums leading-tight", children: cost ? /* @__PURE__ */ jsxs4(Fragment, { children: [
            /* @__PURE__ */ jsx21("div", { className: "font-semibold text-slate-800", children: fmt(cost.costEach) }),
            /* @__PURE__ */ jsxs4("div", { className: "text-slate-400 text-[10px]", children: [
              "/ ",
              fmt(cost.totalCost)
            ] })
          ] }) : /* @__PURE__ */ jsx21("span", { className: "text-slate-300", children: "\u2014" }) }),
          /* @__PURE__ */ jsxs4("div", { className: "flex items-center justify-end gap-0.5", children: [
            onMoveToWorkflow && /* @__PURE__ */ jsx21(Button, { variant: "ghost", size: "icon", onClick: () => onMoveToWorkflow(idx), className: "h-7 w-7 text-slate-500 hover:bg-slate-100", title: "Move to another workflow", children: /* @__PURE__ */ jsx21(MoveRight, { className: "w-3.5 h-3.5" }) }),
            /* @__PURE__ */ jsx21(Button, { variant: "ghost", size: "icon", onClick: () => duplicate(idx), className: "h-7 w-7 text-slate-500 hover:bg-slate-100", title: "Duplicate row", children: /* @__PURE__ */ jsx21(Copy, { className: "w-3.5 h-3.5" }) }),
            /* @__PURE__ */ jsx21(Button, { variant: "ghost", size: "icon", onClick: () => remove(idx), className: "h-7 w-7 text-red-500 hover:bg-red-50", title: "Delete row", children: /* @__PURE__ */ jsx21(Trash2, { className: "w-3.5 h-3.5" }) })
          ] })
        ] }),
        (tooWide || tooWideStrict) && /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 ml-1", children: [
          /* @__PURE__ */ jsx21(AlertTriangle, { className: "w-3 h-3 flex-shrink-0" }),
          tooWide ? `Part won't fit even rotated (min ${minDim.toFixed(2)}\u2033 > usable ${usableWidth.toFixed(2)}\u2033).` : it.allow_rotation ? `Rotated, height (${partH.toFixed(2)}\u2033) exceeds roll width (${usableWidth.toFixed(2)}\u2033). Uncheck Rotate.` : `Too wide for roll (${partW.toFixed(2)}\u2033 > ${usableWidth.toFixed(2)}\u2033). Enable Rotate or split the part.`
        ] }),
        rowIssues.length > 0 && /* @__PURE__ */ jsxs4(
          "div",
          {
            role: "status",
            id: rowIssuesId,
            className: "flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 ml-1",
            children: [
              /* @__PURE__ */ jsx21(AlertTriangle, { className: "w-3 h-3 mt-0.5 flex-shrink-0" }),
              /* @__PURE__ */ jsx21("div", { className: "space-y-0.5", children: rowIssues.map((it2, i2) => /* @__PURE__ */ jsx21("div", { children: it2.message }, i2)) })
            ]
          }
        ),
        (it.bleed_inches || 0) === 0 && defaultBleed > 0 && /* @__PURE__ */ jsx21("div", { className: "text-[10px] text-slate-400 pl-1", children: /* @__PURE__ */ jsxs4("button", { type: "button", onClick: () => update(idx, { bleed_inches: defaultBleed }), className: "underline hover:text-blue-600", children: [
          "Auto-bleed (",
          defaultBleed,
          "\u2033)"
        ] }) })
      ] }, it.id || idx);
    }),
    /* @__PURE__ */ jsx21("div", { ref: tableEndRef }),
    /* @__PURE__ */ jsxs4(Button, { variant: "outline", size: "sm", onClick: add, className: "w-full mt-2 h-8", children: [
      /* @__PURE__ */ jsx21(Plus, { className: "w-3.5 h-3.5 mr-1" }),
      " Add Part"
    ] }),
    (!items || items.length === 0) && /* @__PURE__ */ jsx21("p", { className: "text-xs text-slate-400 text-center py-4", children: 'No parts added yet \u2014 click "Add Part" to start.' })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylRollVisualizer.jsx
import React2, { useMemo as useMemo3, useState as useState3, useRef as useRef2, useCallback } from "react";
import { jsx as jsx22, jsxs as jsxs5 } from "react/jsx-runtime";
var PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16"
];
var fmt2 = (n) => Number(n || 0).toFixed(2);
var computeWasteRects = (shelves, usableWidth, gutterV) => {
  const wastes = [];
  shelves.forEach((sh, sIdx) => {
    if (sh.items.length === 0) return;
    const last = sh.items[sh.items.length - 1];
    const rightEdge = last.x + last.w;
    if (rightEdge < usableWidth - 0.01) {
      wastes.push({ x: rightEdge, y: sh.y, w: usableWidth - rightEdge, h: sh.height });
    }
    const next = shelves[sIdx + 1];
    if (next && next.y > sh.y + sh.height) {
      wastes.push({ x: 0, y: sh.y + sh.height, w: usableWidth, h: next.y - sh.y - sh.height });
    }
  });
  return wastes;
};
function VinylRollVisualizer({
  calc,
  showRegistrationMarks = false,
  onItemMove
  // optional: (newPos) => void  — { shelfIdx, itemIdx, x }
}) {
  const {
    shelves,
    usableWidth,
    effectiveRollWidth,
    leadingEdge,
    trailingEdge,
    lengthConsumedIn,
    totalLengthIn,
    partsPlaced,
    partsUnplaced,
    wastedSqFt,
    usedSqFt,
    gutterV,
    gutterH
  } = calc;
  const [zoom, setZoom] = useState3(1);
  const svgRef = useRef2(null);
  const [dragOverrides, setDragOverrides] = useState3({});
  const [dragging, setDragging] = useState3(null);
  const colorFor = useMemo3(() => {
    const map = {};
    let i = 0;
    shelves.forEach((sh) => sh.items.forEach((it) => {
      if (!(it.itemIdx in map)) {
        map[it.itemIdx] = PALETTE[i % PALETTE.length];
        i++;
      }
    }));
    return map;
  }, [shelves]);
  const wasteRects = useMemo3(() => computeWasteRects(shelves, usableWidth, gutterV), [shelves, usableWidth, gutterV]);
  const drawWidth = Math.max(1, effectiveRollWidth);
  const drawHeight = Math.max(12, lengthConsumedIn);
  const targetW = 520;
  const baseScale = targetW / drawWidth;
  const svgW = drawWidth * baseScale * zoom;
  const cappedH = Math.min(900, drawHeight * baseScale);
  const svgH = cappedH * zoom;
  const viewBox = `0 0 ${drawWidth} ${drawHeight}`;
  const usableX = (effectiveRollWidth - usableWidth) / 2;
  const clientToSvg = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);
  const handleMouseDown = (e, shelfIdx, itemIdx, item) => {
    if (!onItemMove) return;
    e.stopPropagation();
    e.preventDefault();
    const { x: svgX } = clientToSvg(e.clientX, e.clientY);
    setDragging({ shelfIdx, itemIdx, startSvgX: svgX, startX: item.x });
  };
  const handleMouseMove = (e) => {
    if (!dragging) return;
    const { x: svgX } = clientToSvg(e.clientX, e.clientY);
    const sh = shelves[dragging.shelfIdx];
    const it = sh.items[dragging.itemIdx];
    let newX = dragging.startX + (svgX - dragging.startSvgX);
    const minX = (() => {
      const prev = sh.items[dragging.itemIdx - 1];
      return prev ? prev.x + prev.w + gutterH : 0;
    })();
    const maxX = (() => {
      const next = sh.items[dragging.itemIdx + 1];
      const rightLimit = next ? next.x - gutterH - it.w : usableWidth - it.w;
      return Math.max(minX, rightLimit);
    })();
    newX = Math.max(minX, Math.min(maxX, newX));
    setDragOverrides((prev) => ({ ...prev, [`${dragging.shelfIdx}-${dragging.itemIdx}`]: newX }));
  };
  const handleMouseUp = () => {
    if (!dragging) return;
    const key = `${dragging.shelfIdx}-${dragging.itemIdx}`;
    const newX = dragOverrides[key];
    if (newX !== void 0 && onItemMove) {
      onItemMove({ shelfIdx: dragging.shelfIdx, itemIdx: dragging.itemIdx, x: newX });
    }
    setDragging(null);
    setTimeout(() => setDragOverrides({}), 0);
  };
  const regMarks = useMemo3(() => {
    if (!showRegistrationMarks) return [];
    const marks = [];
    const spacing = 12;
    const startY = leadingEdge + 0.5;
    const endY = drawHeight - trailingEdge - 0.5;
    for (let y = startY; y < endY; y += spacing) {
      marks.push({ x: usableX + 0.3, y });
      marks.push({ x: usableX + usableWidth - 0.3, y });
    }
    return marks;
  }, [showRegistrationMarks, leadingEdge, trailingEdge, drawHeight, usableX, usableWidth]);
  return /* @__PURE__ */ jsxs5("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs5("div", { className: "flex flex-wrap gap-3 text-xs text-slate-600 items-center", children: [
      /* @__PURE__ */ jsx22(Stat, { label: "Roll Width", value: `${fmt2(effectiveRollWidth)}\u2033` }),
      /* @__PURE__ */ jsx22(Stat, { label: "Usable Width", value: `${fmt2(usableWidth)}\u2033` }),
      /* @__PURE__ */ jsx22(Stat, { label: "Content Length", value: `${fmt2(totalLengthIn)}\u2033` }),
      /* @__PURE__ */ jsx22(Stat, { label: "Roll Consumed", value: `${fmt2(lengthConsumedIn / 12)} ft` }),
      /* @__PURE__ */ jsx22(Stat, { label: "Parts Placed", value: partsPlaced }),
      partsUnplaced > 0 && /* @__PURE__ */ jsx22(Stat, { label: "Unplaced", value: partsUnplaced, tone: "bad" }),
      /* @__PURE__ */ jsx22(Stat, { label: "Used", value: `${fmt2(usedSqFt)} sqft` }),
      /* @__PURE__ */ jsx22(Stat, { label: "Waste", value: `${fmt2(wastedSqFt)} sqft`, tone: "warn" }),
      /* @__PURE__ */ jsxs5("div", { className: "ml-auto flex items-center gap-1", children: [
        onItemMove && /* @__PURE__ */ jsxs5("span", { className: "text-[10px] text-slate-500 mr-2 inline-flex items-center gap-1", children: [
          /* @__PURE__ */ jsx22(Move, { className: "w-3 h-3" }),
          " Drag parts to reposition"
        ] }),
        /* @__PURE__ */ jsx22(Button, { size: "icon", variant: "ghost", className: "h-7 w-7", onClick: () => setZoom((z) => Math.max(0.5, z - 0.25)), title: "Zoom out", children: /* @__PURE__ */ jsx22(ZoomOut, { className: "w-3.5 h-3.5" }) }),
        /* @__PURE__ */ jsxs5("span", { className: "text-[11px] tabular-nums w-10 text-center", children: [
          Math.round(zoom * 100),
          "%"
        ] }),
        /* @__PURE__ */ jsx22(Button, { size: "icon", variant: "ghost", className: "h-7 w-7", onClick: () => setZoom((z) => Math.min(4, z + 0.25)), title: "Zoom in", children: /* @__PURE__ */ jsx22(ZoomIn, { className: "w-3.5 h-3.5" }) }),
        /* @__PURE__ */ jsx22(Button, { size: "icon", variant: "ghost", className: "h-7 w-7", onClick: () => setZoom(1), title: "Reset zoom", children: /* @__PURE__ */ jsx22(RotateCcw, { className: "w-3.5 h-3.5" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "bg-slate-100 rounded-lg border border-slate-200 overflow-hidden", children: [
      /* @__PURE__ */ jsx22("div", { className: "overflow-auto p-3", style: { maxHeight: 600 }, children: /* @__PURE__ */ jsxs5(
        "svg",
        {
          ref: svgRef,
          width: svgW,
          height: svgH,
          viewBox,
          preserveAspectRatio: "xMidYMin meet",
          style: { background: "#e2e8f0", display: "block", userSelect: "none" },
          onMouseMove: handleMouseMove,
          onMouseUp: handleMouseUp,
          onMouseLeave: handleMouseUp,
          children: [
            /* @__PURE__ */ jsxs5("defs", { children: [
              /* @__PURE__ */ jsxs5("pattern", { id: "wasteHatch", patternUnits: "userSpaceOnUse", width: "1.4", height: "1.4", patternTransform: "rotate(45)", children: [
                /* @__PURE__ */ jsx22("rect", { width: "1.4", height: "1.4", fill: "#fecaca", fillOpacity: "0.4" }),
                /* @__PURE__ */ jsx22("line", { x1: "0", y1: "0", x2: "0", y2: "1.4", stroke: "#dc2626", strokeWidth: "0.18", strokeOpacity: "0.6" })
              ] }),
              /* @__PURE__ */ jsxs5("pattern", { id: "bleedHatch", patternUnits: "userSpaceOnUse", width: "1.0", height: "1.0", patternTransform: "rotate(45)", children: [
                /* @__PURE__ */ jsx22("rect", { width: "1.0", height: "1.0", fill: "#fed7aa", fillOpacity: "0.5" }),
                /* @__PURE__ */ jsx22("line", { x1: "0", y1: "0", x2: "0", y2: "1.0", stroke: "#ea580c", strokeWidth: "0.12", strokeOpacity: "0.6" })
              ] }),
              /* @__PURE__ */ jsx22("marker", { id: "arrow", viewBox: "0 0 10 10", refX: "5", refY: "5", markerWidth: "3", markerHeight: "3", orient: "auto", children: /* @__PURE__ */ jsx22("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "white", fillOpacity: "0.6" }) })
            ] }),
            /* @__PURE__ */ jsx22("rect", { x: 0, y: 0, width: drawWidth, height: drawHeight, fill: "#f1f5f9" }),
            /* @__PURE__ */ jsx22("rect", { x: usableX, y: leadingEdge, width: usableWidth, height: Math.max(0, drawHeight - leadingEdge - trailingEdge), fill: "#ffffff" }),
            wasteRects.map((w, i) => /* @__PURE__ */ jsx22("rect", { x: usableX + w.x, y: leadingEdge + w.y, width: w.w, height: w.h, fill: "url(#wasteHatch)" }, `w-${i}`)),
            /* @__PURE__ */ jsx22("rect", { x: 0, y: 0, width: drawWidth, height: leadingEdge, fill: "#fef3c7" }),
            /* @__PURE__ */ jsx22("rect", { x: 0, y: drawHeight - trailingEdge, width: drawWidth, height: trailingEdge, fill: "#fef3c7" }),
            /* @__PURE__ */ jsx22("rect", { x: 0, y: 0, width: usableX, height: drawHeight, fill: "#fde68a", fillOpacity: "0.55" }),
            /* @__PURE__ */ jsx22("rect", { x: usableX + usableWidth, y: 0, width: drawWidth - usableX - usableWidth, height: drawHeight, fill: "#fde68a", fillOpacity: "0.55" }),
            regMarks.map((m, i) => /* @__PURE__ */ jsxs5("g", { stroke: "#0f172a", strokeWidth: 0.07, fill: "none", children: [
              /* @__PURE__ */ jsx22("line", { x1: m.x - 0.4, y1: m.y, x2: m.x + 0.4, y2: m.y }),
              /* @__PURE__ */ jsx22("line", { x1: m.x, y1: m.y - 0.4, x2: m.x, y2: m.y + 0.4 }),
              /* @__PURE__ */ jsx22("circle", { cx: m.x, cy: m.y, r: "0.25" })
            ] }, `reg-${i}`)),
            shelves.map(
              (sh, sIdx) => sh.items.map((it, iIdx) => {
                const fill = colorFor[it.itemIdx] || "#3b82f6";
                const dragKey = `${sIdx}-${iIdx}`;
                const xOverride = dragOverrides[dragKey];
                const itemX = xOverride !== void 0 ? xOverride : it.x;
                const bleed = it.bleed || 0;
                const partW = it.partW ?? it.w;
                const partH = it.partH ?? it.h;
                const isDragging = dragging && dragging.shelfIdx === sIdx && dragging.itemIdx === iIdx;
                return /* @__PURE__ */ jsxs5(
                  "g",
                  {
                    onMouseDown: (e) => handleMouseDown(e, sIdx, iIdx, it),
                    style: { cursor: onItemMove ? isDragging ? "grabbing" : "grab" : "default" },
                    children: [
                      bleed > 0 && /* @__PURE__ */ jsx22(
                        "rect",
                        {
                          x: usableX + itemX,
                          y: leadingEdge + it.y,
                          width: it.w,
                          height: it.h,
                          fill: "url(#bleedHatch)",
                          stroke: "#ea580c",
                          strokeWidth: 0.04,
                          strokeDasharray: "0.3,0.2"
                        }
                      ),
                      /* @__PURE__ */ jsx22(
                        "rect",
                        {
                          x: usableX + itemX + bleed,
                          y: leadingEdge + it.y + bleed,
                          width: partW,
                          height: partH,
                          fill,
                          fillOpacity: isDragging ? 0.6 : 0.85,
                          stroke: "#0f172a",
                          strokeWidth: 0.05
                        }
                      ),
                      partW > 6 && partH > 6 && /* @__PURE__ */ jsx22(
                        "path",
                        {
                          d: `M ${usableX + itemX + bleed + partW / 2} ${leadingEdge + it.y + bleed + 0.5}
                          L ${usableX + itemX + bleed + partW / 2} ${leadingEdge + it.y + bleed + Math.min(partH - 1, 2.2)}`,
                          stroke: "white",
                          strokeWidth: 0.18,
                          strokeOpacity: "0.6",
                          markerEnd: "url(#arrow)",
                          pointerEvents: "none"
                        }
                      ),
                      partW > 6 && partH > 4 && /* @__PURE__ */ jsxs5(
                        "text",
                        {
                          x: usableX + itemX + bleed + partW / 2,
                          y: leadingEdge + it.y + bleed + partH / 2,
                          textAnchor: "middle",
                          dominantBaseline: "middle",
                          fontSize: Math.min(partW / 7, partH / 3, 2.2),
                          fill: "white",
                          style: { pointerEvents: "none", fontWeight: 600 },
                          children: [
                            partW.toFixed(1),
                            "\xD7",
                            partH.toFixed(1),
                            it.rotated ? " \u21BB" : ""
                          ]
                        }
                      )
                    ]
                  },
                  `${sIdx}-${iIdx}`
                );
              })
            ),
            /* @__PURE__ */ jsx22("rect", { x: 0, y: 0, width: drawWidth, height: drawHeight, fill: "none", stroke: "#0f172a", strokeWidth: 0.1, pointerEvents: "none" })
          ]
        }
      ) }),
      /* @__PURE__ */ jsxs5("div", { className: "border-t border-slate-300 bg-slate-50 px-3 py-2 space-y-1", children: [
        /* @__PURE__ */ jsxs5("div", { className: "flex items-center justify-center gap-1 text-[10px] text-slate-500", children: [
          /* @__PURE__ */ jsx22(ArrowDown, { className: "w-3 h-3" }),
          " Print feed direction (top \u2192 bottom)"
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "flex flex-wrap gap-3 text-[11px]", children: [
          /* @__PURE__ */ jsx22(LegendChip, { color: "#fde68a", label: "Margin (unprintable)" }),
          /* @__PURE__ */ jsx22(LegendChip, { color: "#fef3c7", label: "Leading/trailing edge waste" }),
          /* @__PURE__ */ jsx22(LegendSwatchHatch, { label: "Waste in usable area", patternId: "legendHatchWaste", baseFill: "#fecaca", stroke: "#dc2626" }),
          /* @__PURE__ */ jsx22(LegendSwatchHatch, { label: "Bleed halo (waste around part)", patternId: "legendHatchBleed", baseFill: "#fed7aa", stroke: "#ea580c" }),
          showRegistrationMarks && /* @__PURE__ */ jsx22(LegendChip, { color: "#0f172a", label: "Registration marks" }),
          /* @__PURE__ */ jsx22(LegendChip, { color: "#ffffff", label: "Usable", border: true }),
          Object.entries(colorFor).map(([idx, c]) => /* @__PURE__ */ jsx22(LegendChip, { color: c, label: `Item ${parseInt(idx) + 1}` }, idx))
        ] })
      ] })
    ] })
  ] });
}
var Stat = ({ label, value, tone }) => {
  const toneClass = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-slate-800";
  return /* @__PURE__ */ jsxs5("div", { className: "flex items-baseline gap-1", children: [
    /* @__PURE__ */ jsxs5("span", { className: "text-slate-500", children: [
      label,
      ":"
    ] }),
    /* @__PURE__ */ jsx22("span", { className: `font-semibold tabular-nums ${toneClass}`, children: value })
  ] });
};
var LegendChip = ({ color, label, border }) => /* @__PURE__ */ jsxs5("span", { className: "inline-flex items-center gap-1", children: [
  /* @__PURE__ */ jsx22("span", { className: "inline-block w-3 h-3 rounded-sm", style: { background: color, border: border ? "1px solid #94a3b8" : "none" } }),
  /* @__PURE__ */ jsx22("span", { className: "text-slate-600", children: label })
] });
var LegendSwatchHatch = ({ label, patternId, baseFill, stroke }) => /* @__PURE__ */ jsxs5("span", { className: "inline-flex items-center gap-1", children: [
  /* @__PURE__ */ jsxs5("svg", { width: "12", height: "12", className: "inline-block", children: [
    /* @__PURE__ */ jsx22("defs", { children: /* @__PURE__ */ jsxs5("pattern", { id: patternId, patternUnits: "userSpaceOnUse", width: "4", height: "4", patternTransform: "rotate(45)", children: [
      /* @__PURE__ */ jsx22("rect", { width: "4", height: "4", fill: baseFill, fillOpacity: "0.6" }),
      /* @__PURE__ */ jsx22("line", { x1: "0", y1: "0", x2: "0", y2: "4", stroke, strokeWidth: "1" })
    ] }) }),
    /* @__PURE__ */ jsx22("rect", { width: "12", height: "12", fill: `url(#${patternId})`, stroke: "#94a3b8", strokeWidth: "0.5" })
  ] }),
  /* @__PURE__ */ jsx22("span", { className: "text-slate-600", children: label })
] });

// frozen:/app/src/components/vinylEstimator/VinylPresetBar.jsx
import React3 from "react";

// frozen:/app/src/components/vinylEstimator/vinylWorkflowPresets.jsx
var WORKFLOW_PRESETS = [
  {
    key: "cut_only",
    label: "Cut Only",
    description: "Solid color cut vinyl (e.g. one-color logos, vehicle lettering).",
    apply_print: false,
    apply_cut: true,
    apply_laminate: false,
    bleed_inches: 0
  },
  {
    key: "print_only",
    label: "Print Only",
    description: "Printed graphics trimmed by hand or guillotine (banners, posters).",
    apply_print: true,
    apply_cut: false,
    apply_laminate: false,
    bleed_inches: 0.125
  },
  {
    key: "print_and_cut",
    label: "Print + Contour Cut",
    description: "Printed + contour-cut decals.",
    apply_print: true,
    apply_cut: true,
    apply_laminate: false,
    bleed_inches: 0.125
  },
  {
    key: "wrap",
    label: "Vehicle / Wall Wrap",
    description: "Printed + laminated wrap film (cast vinyl).",
    apply_print: true,
    apply_cut: false,
    apply_laminate: true,
    bleed_inches: 0.25
  },
  {
    key: "laminated_decal",
    label: "Laminated Decal",
    description: "Print + cut + overlam \u2014 outdoor stickers, badges.",
    apply_print: true,
    apply_cut: true,
    apply_laminate: true,
    bleed_inches: 0.125
  }
];
var applyPresetToWorkflow = (preset) => ({
  apply_print: preset.apply_print,
  apply_cut: preset.apply_cut,
  apply_laminate: preset.apply_laminate,
  preset_key: preset.key
});

// frozen:/app/src/components/vinylEstimator/VinylPresetBar.jsx
import { jsx as jsx23, jsxs as jsxs6 } from "react/jsx-runtime";
function VinylPresetBar({ activePresetKey, onApply }) {
  return /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-2 flex-wrap p-2 rounded-lg bg-blue-50/50 border border-blue-100", children: [
    /* @__PURE__ */ jsxs6("span", { className: "text-[11px] font-medium text-blue-900 flex items-center gap-1", children: [
      /* @__PURE__ */ jsx23(Sparkles, { className: "w-3.5 h-3.5" }),
      " Workflow Preset:"
    ] }),
    WORKFLOW_PRESETS.map((p) => {
      const active = activePresetKey === p.key;
      return /* @__PURE__ */ jsx23(
        Button,
        {
          size: "sm",
          variant: active ? "default" : "outline",
          onClick: () => onApply(p),
          className: `h-7 text-[11px] ${active ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-white"}`,
          title: p.description,
          children: p.label
        },
        p.key
      );
    })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylStockWarning.jsx
import React4 from "react";
import { jsx as jsx24, jsxs as jsxs7 } from "react/jsx-runtime";
function VinylStockWarning({ stockUsage, vinyl }) {
  if (!stockUsage || !vinyl) return null;
  const { rollsNeeded, percentOfRoll, fullRollsNeeded, exceedsOneRoll } = stockUsage;
  if (!exceedsOneRoll && percentOfRoll < 90) {
    return /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5", children: [
      /* @__PURE__ */ jsx24(CheckCircle2, { className: "w-3.5 h-3.5 flex-shrink-0" }),
      "Uses ",
      /* @__PURE__ */ jsxs7("b", { className: "tabular-nums", children: [
        percentOfRoll.toFixed(1),
        "%"
      ] }),
      " of one roll."
    ] });
  }
  if (!exceedsOneRoll) {
    return /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: [
      /* @__PURE__ */ jsx24(AlertTriangle, { className: "w-3.5 h-3.5 flex-shrink-0" }),
      "Uses ",
      /* @__PURE__ */ jsxs7("b", { className: "tabular-nums", children: [
        percentOfRoll.toFixed(1),
        "%"
      ] }),
      " of a single roll \u2014 very close to the end."
    ] });
  }
  return /* @__PURE__ */ jsxs7("div", { className: "flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1.5", children: [
    /* @__PURE__ */ jsx24(Layers, { className: "w-3.5 h-3.5 flex-shrink-0 mt-0.5" }),
    /* @__PURE__ */ jsxs7("div", { children: [
      /* @__PURE__ */ jsx24("div", { className: "font-semibold", children: "Multi-roll job" }),
      /* @__PURE__ */ jsxs7("div", { children: [
        "Needs ",
        /* @__PURE__ */ jsx24("b", { className: "tabular-nums", children: rollsNeeded.toFixed(2) }),
        " rolls",
        " ",
        "(",
        /* @__PURE__ */ jsx24("b", { children: fullRollsNeeded }),
        " full rolls of ",
        vinyl.vinyl_name,
        "). Each roll has its own leading/trailing edge waste \u2014 costs are estimated based on total pulled length."
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylAlternativeCompare.jsx
import React5, { useMemo as useMemo4 } from "react";
import { jsx as jsx25, jsxs as jsxs8 } from "react/jsx-runtime";
var fmt3 = (n) => `$${Number(n || 0).toFixed(2)}`;
function VinylAlternativeCompare({ calc, currentVinyl, vinyls }) {
  const options = useMemo4(() => {
    if (!calc || !currentVinyl) return [];
    return vinyls.filter((v) => v.is_active !== false && !v.is_laminate && v.show_in_vinyl_estimator !== false && v.id !== currentVinyl.id).map((v) => ({
      vinyl: v,
      cost: computeAlternativeVinylCost(calc, v),
      delta: computeAlternativeVinylCost(calc, v) - (calc.vinylCost || 0)
    })).sort((a, b) => a.cost - b.cost).slice(0, 6);
  }, [calc, currentVinyl, vinyls]);
  if (options.length === 0 || !calc?.vinylCost) return null;
  return /* @__PURE__ */ jsxs8("div", { className: "text-xs space-y-1", children: [
    /* @__PURE__ */ jsx25("div", { className: "font-semibold text-slate-700", children: "Compare to other vinyls (same area):" }),
    /* @__PURE__ */ jsx25("div", { className: "border border-slate-200 rounded overflow-hidden bg-white", children: /* @__PURE__ */ jsx25("table", { className: "w-full text-xs", children: /* @__PURE__ */ jsxs8("tbody", { children: [
      /* @__PURE__ */ jsxs8("tr", { className: "bg-slate-50 border-b border-slate-200", children: [
        /* @__PURE__ */ jsxs8("td", { className: "px-2 py-1.5 font-medium", children: [
          currentVinyl.vinyl_name,
          " ",
          /* @__PURE__ */ jsx25("span", { className: "text-[10px] text-slate-500", children: "(current)" })
        ] }),
        /* @__PURE__ */ jsx25("td", { className: "px-2 py-1.5 text-right tabular-nums font-semibold", children: fmt3(calc.vinylCost) }),
        /* @__PURE__ */ jsx25("td", { className: "px-2 py-1.5 text-right text-slate-400", children: "\u2014" })
      ] }),
      options.map(({ vinyl, cost, delta }) => {
        const cheaper = delta < 0;
        return /* @__PURE__ */ jsxs8("tr", { className: "border-b border-slate-100 last:border-b-0", children: [
          /* @__PURE__ */ jsx25("td", { className: "px-2 py-1.5 truncate", children: vinyl.vinyl_name }),
          /* @__PURE__ */ jsx25("td", { className: "px-2 py-1.5 text-right tabular-nums", children: fmt3(cost) }),
          /* @__PURE__ */ jsxs8("td", { className: `px-2 py-1.5 text-right tabular-nums flex items-center justify-end gap-1 ${cheaper ? "text-emerald-700" : "text-red-600"}`, children: [
            cheaper ? /* @__PURE__ */ jsx25(TrendingDown, { className: "w-3 h-3" }) : /* @__PURE__ */ jsx25(TrendingUp, { className: "w-3 h-3" }),
            cheaper ? "\u2212" : "+",
            fmt3(Math.abs(delta))
          ] })
        ] }, vinyl.id);
      })
    ] }) }) })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylWorkflowTemplatesDialog.jsx
import { useEffect, useState as useState4 } from "react";

// s:s://@/entities/all
var VinylWorkflowTemplate = { __ent: "vwft" };

// s:s://@/components/estimator/builder/builderEntityPersistence
var deleteEntityIfUnchanged = async () => ({ deleted: 0 });

// frozen:/app/src/components/vinylEstimator/vinylTemplatePersistence.js
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  const leftEmpty = a === null || a === void 0 || a === "";
  const rightEmpty = b === null || b === void 0 || b === "";
  if (leftEmpty && rightEmpty) return true;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function payloadMatches(record, payload) {
  return Boolean(record?.id) && Object.entries(payload || {}).every(([field, value]) => sameValue(record?.[field], value));
}
async function createVinylTemplateWithRecovery({ entity: entity2, data, label = "Vinyl template", settleMs = 50 } = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const name = String(payload?.name || "").trim();
  if (!payload || !name || typeof entity2?.create !== "function" || typeof entity2?.filter !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const before = await entity2.filter({ name });
  if (!Array.isArray(before)) throw new Error(`${label} preflight did not return a template list.`);
  const beforeIds = new Set(before.filter((row) => payloadMatches(row, payload)).map((row) => row.id));
  let created = null;
  let createError = null;
  try {
    created = await entity2.create({ ...payload, name });
  } catch (error) {
    createError = error;
  }
  if (created?.id) {
    const verified = typeof entity2.get === "function" ? await entity2.get(created.id).catch(() => null) : null;
    return { record: verified?.id ? verified : created, status: "created" };
  }
  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
  let after;
  try {
    after = await entity2.filter({ name });
  } catch (verificationError) {
    throw new Error(
      `${label} create response was unavailable and its recovery lookup also failed. ` + `Do not retry blindly; reload the template library first. ${verificationError?.message || ""}`.trim()
    );
  }
  if (!Array.isArray(after)) throw new Error(`${label} recovery did not return a template list.`);
  const newMatches = after.filter((row) => payloadMatches(row, payload) && !beforeIds.has(row.id));
  if (newMatches.length === 1) return { record: newMatches[0], status: "recovered" };
  if (newMatches.length > 1) {
    throw new Error(`${label} may have been created more than once while its create response was unavailable. No template was deleted automatically; reload and review before retrying.`);
  }
  if (createError) {
    throw new Error(`${createError?.message || `${label} could not be created.`} No matching new template was visible after recovery. Reload before retrying.`);
  }
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}
async function deleteVinylTemplateIfUnchanged({ entity: entity2, template, label = "Vinyl template deletion" } = {}) {
  if (!template?.id) throw new Error(`${label} could not find its loaded template. Reload before deleting.`);
  return deleteEntityIfUnchanged({
    entity: entity2,
    record: template,
    guardFields: { name: template.name },
    label
  });
}

// frozen:/app/src/components/vinylEstimator/VinylWorkflowTemplatesDialog.jsx
import { jsx as jsx26, jsxs as jsxs9 } from "react/jsx-runtime";
function VinylWorkflowTemplatesDialog({
  open,
  onClose,
  mode = "apply",
  currentWorkflow,
  onApply
}) {
  const [templates, setTemplates] = useState4([]);
  const [newName, setNewName] = useState4("");
  const [isMutating, setIsMutating] = useState4(false);
  const [mutationError, setMutationError] = useState4("");
  const load = async () => setTemplates(await loadAllEntityRows({ entity: VinylWorkflowTemplate, sort: "sort_order", label: "Vinyl workflow templates" }));
  useEffect(() => {
    if (open) load();
  }, [open]);
  const handleSave = async () => {
    if (!newName.trim() || isMutating) return;
    setIsMutating(true);
    setMutationError("");
    try {
      await createVinylTemplateWithRecovery({
        entity: VinylWorkflowTemplate,
        data: {
          name: newName.trim(),
          vinyl_id: currentWorkflow.vinyl_id || "",
          laminate_id: currentWorkflow.laminate_id || "",
          printer_id: currentWorkflow.printer_id || "",
          cutter_id: currentWorkflow.cutter_id || "",
          laminator_id: currentWorkflow.laminator_id || "",
          apply_print: currentWorkflow.apply_print,
          apply_cut: currentWorkflow.apply_cut,
          apply_laminate: currentWorkflow.apply_laminate,
          preset_key: currentWorkflow.preset_key || "",
          color_tag: currentWorkflow.color_tag || ""
        },
        label: "Vinyl workflow template"
      });
      setNewName("");
      await load();
    } catch (error) {
      console.error("Vinyl workflow template create blocked:", error);
      setMutationError(error?.message || "The workflow template could not be created. Reload before retrying.");
    } finally {
      setIsMutating(false);
    }
  };
  const handleDelete = async (template) => {
    if (!template?.id || isMutating || !confirm("Delete this template?")) return;
    setIsMutating(true);
    setMutationError("");
    try {
      await deleteVinylTemplateIfUnchanged({
        entity: VinylWorkflowTemplate,
        template,
        label: `Vinyl workflow template ${template.name || template.id} deletion`
      });
      await load();
    } catch (error) {
      console.error("Vinyl workflow template deletion blocked:", error);
      setMutationError(error?.message || "This workflow template changed in another session. Reload before deleting it.");
    } finally {
      setIsMutating(false);
    }
  };
  const handleApply = (t) => {
    onApply({
      vinyl_id: t.vinyl_id || "",
      laminate_id: t.laminate_id || "",
      printer_id: t.printer_id || "",
      cutter_id: t.cutter_id || "",
      laminator_id: t.laminator_id || "",
      apply_print: !!t.apply_print,
      apply_cut: !!t.apply_cut,
      apply_laminate: !!t.apply_laminate,
      preset_key: t.preset_key || "",
      color_tag: t.color_tag || ""
    });
    onClose();
  };
  return /* @__PURE__ */ jsx26(Dialog, { open, onOpenChange: (v) => !v && onClose(), children: /* @__PURE__ */ jsxs9(DialogContent, { className: "max-w-md", children: [
    /* @__PURE__ */ jsx26(DialogHeader, { children: /* @__PURE__ */ jsxs9(DialogTitle, { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsx26(Bookmark, { className: "w-5 h-5 text-blue-600" }),
      " Workflow Templates"
    ] }) }),
    /* @__PURE__ */ jsxs9("div", { className: "space-y-3", children: [
      templates.length === 0 ? /* @__PURE__ */ jsx26("div", { className: "text-xs text-slate-400 text-center py-4", children: "No templates saved yet." }) : /* @__PURE__ */ jsx26("div", { className: "border border-slate-200 rounded divide-y divide-slate-100 max-h-64 overflow-auto", children: templates.map((t) => /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-2 p-2 hover:bg-slate-50", children: [
        t.color_tag && /* @__PURE__ */ jsx26("span", { className: "w-3 h-3 rounded-full", style: { background: t.color_tag } }),
        /* @__PURE__ */ jsxs9("button", { type: "button", onClick: () => handleApply(t), className: "flex-1 text-left text-sm", children: [
          /* @__PURE__ */ jsx26("div", { className: "font-medium", children: t.name }),
          /* @__PURE__ */ jsxs9("div", { className: "text-[10px] text-slate-500", children: [
            t.preset_key || "custom",
            " \xB7 ",
            [t.apply_print && "print", t.apply_cut && "cut", t.apply_laminate && "lam"].filter(Boolean).join(" + ")
          ] })
        ] }),
        /* @__PURE__ */ jsx26(Button, { size: "icon", variant: "ghost", onClick: () => handleApply(t), className: "h-7 w-7 text-blue-600", title: "Apply", children: /* @__PURE__ */ jsx26(Plus, { className: "w-3.5 h-3.5" }) }),
        /* @__PURE__ */ jsx26(Button, { size: "icon", variant: "ghost", onClick: () => handleDelete(t), className: "h-7 w-7 text-red-500", children: /* @__PURE__ */ jsx26(Trash2, { className: "w-3.5 h-3.5" }) })
      ] }, t.id)) }),
      mutationError && /* @__PURE__ */ jsx26("div", { className: "text-xs text-red-600", children: mutationError }),
      mode === "save" && currentWorkflow && /* @__PURE__ */ jsxs9("div", { className: "border-t border-slate-200 pt-3 space-y-2", children: [
        /* @__PURE__ */ jsx26(Label, { className: "text-xs", children: "Save current workflow as template" }),
        /* @__PURE__ */ jsxs9("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx26(Input, { value: newName, onChange: (e) => setNewName(e.target.value), placeholder: "e.g. 3M IJ180 + 8508 on HP360", className: "h-8 text-sm" }),
          /* @__PURE__ */ jsx26(Button, { size: "sm", onClick: handleSave, disabled: !newName.trim() || isMutating, className: "h-8", children: "Save" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx26(DialogFooter, { children: /* @__PURE__ */ jsx26(Button, { variant: "outline", onClick: onClose, children: "Close" }) })
  ] }) });
}

// frozen:/app/src/components/vinylEstimator/VinylWorkflowCardHeader.jsx
import { useState as useState5, useRef as useRef3, useEffect as useEffect2 } from "react";

// frozen:/app/src/components/vinylEstimator/VinylWorkflowMetricsBadge.jsx
import { jsx as jsx27, jsxs as jsxs10 } from "react/jsx-runtime";
function VinylWorkflowMetricsBadge({ metrics }) {
  if (!metrics || metrics.sqFtPulled <= 0) return null;
  const yieldPct = metrics.yieldPercent;
  const tone = yieldPct >= 75 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : yieldPct >= 50 ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-red-100 text-red-800 border-red-200";
  return /* @__PURE__ */ jsxs10("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsxs10("div", { className: `flex items-center gap-2 text-[10px] px-2 py-0.5 rounded border ${tone}`, children: [
      /* @__PURE__ */ jsxs10("span", { children: [
        "Yield: ",
        /* @__PURE__ */ jsxs10("b", { className: "tabular-nums", children: [
          yieldPct.toFixed(0),
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsx27("span", { className: "text-slate-500", children: "\xB7" }),
      /* @__PURE__ */ jsx27("span", { children: Number.isFinite(metrics.costPerSqFt) ? `$${metrics.costPerSqFt.toFixed(2)}/sqft` : "\u2014/sqft" })
    ] }),
    /* @__PURE__ */ jsx27("div", { className: "w-32 h-1 rounded-full overflow-hidden bg-slate-200", title: `${yieldPct.toFixed(1)}% used, ${metrics.wastePercent.toFixed(1)}% waste`, children: /* @__PURE__ */ jsx27(
      "div",
      {
        className: `h-full transition-all ${yieldPct >= 75 ? "bg-emerald-500" : yieldPct >= 50 ? "bg-amber-500" : "bg-red-500"}`,
        style: { width: `${Math.min(100, yieldPct)}%` }
      }
    ) })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylWorkflowCardHeader.jsx
import { Fragment as Fragment2, jsx as jsx28, jsxs as jsxs11 } from "react/jsx-runtime";
var fmt4 = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;
var COLOR_SWATCHES = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#0ea5e9"
];
function NameEditor({ value, placeholder, onSave }) {
  const [editing, setEditing] = useState5(false);
  const [draft, setDraft] = useState5(value || "");
  const inputRef = useRef3(null);
  useEffect2(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  useEffect2(() => {
    setDraft(value || "");
  }, [value]);
  const commit = () => {
    onSave(draft.trim());
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value || "");
    setEditing(false);
  };
  if (!editing) {
    return /* @__PURE__ */ jsxs11(
      "button",
      {
        type: "button",
        onClick: (e) => {
          e.stopPropagation();
          setEditing(true);
        },
        className: "group flex items-center gap-1.5 min-w-0 max-w-full text-left rounded px-1.5 py-0.5 hover:bg-slate-100 transition-colors",
        title: "Click to rename",
        children: [
          /* @__PURE__ */ jsx28(CardTitle, { className: "text-base truncate", children: value || /* @__PURE__ */ jsx28("span", { className: "text-slate-400 font-normal", children: placeholder }) }),
          /* @__PURE__ */ jsx28(Pencil, { className: "w-3 h-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0" })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-1 min-w-0", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsx28(
      "input",
      {
        ref: inputRef,
        value: draft,
        onChange: (e) => setDraft(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        },
        onBlur: commit,
        placeholder,
        className: "h-7 text-base font-semibold px-1.5 rounded border border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 min-w-0 flex-1"
      }
    ),
    /* @__PURE__ */ jsx28(Button, { size: "icon", variant: "ghost", className: "h-6 w-6", onMouseDown: (e) => {
      e.preventDefault();
      commit();
    }, children: /* @__PURE__ */ jsx28(Check, { className: "w-3.5 h-3.5 text-green-600" }) }),
    /* @__PURE__ */ jsx28(Button, { size: "icon", variant: "ghost", className: "h-6 w-6", onMouseDown: (e) => {
      e.preventDefault();
      cancel();
    }, children: /* @__PURE__ */ jsx28(X, { className: "w-3.5 h-3.5 text-slate-500" }) })
  ] });
}
function ColorTagPicker({ value, onChange }) {
  const [open, setOpen] = useState5(false);
  return /* @__PURE__ */ jsxs11("div", { className: "relative", children: [
    /* @__PURE__ */ jsx28(
      "button",
      {
        type: "button",
        onClick: (e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        },
        className: "w-5 h-5 rounded-full ring-2 ring-white shadow border border-slate-200 hover:scale-110 transition-transform flex-shrink-0",
        style: { background: value },
        title: "Change color tag"
      }
    ),
    open && /* @__PURE__ */ jsxs11(Fragment2, { children: [
      /* @__PURE__ */ jsx28("div", { className: "fixed inset-0 z-40", onClick: () => setOpen(false) }),
      /* @__PURE__ */ jsxs11(
        "div",
        {
          className: "absolute top-7 left-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2",
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-1 mb-1.5 text-[10px] text-slate-500 font-medium", children: [
              /* @__PURE__ */ jsx28(Palette, { className: "w-3 h-3" }),
              " COLOR TAG"
            ] }),
            /* @__PURE__ */ jsx28("div", { className: "grid grid-cols-4 gap-1.5", children: COLOR_SWATCHES.map((c) => /* @__PURE__ */ jsx28(
              "button",
              {
                type: "button",
                onClick: () => {
                  onChange(c);
                  setOpen(false);
                },
                className: `w-6 h-6 rounded-full transition-all ${value === c ? "ring-2 ring-slate-900 ring-offset-1" : "hover:scale-110"}`,
                style: { background: c },
                "aria-label": `Set color ${c}`
              },
              c
            )) })
          ]
        }
      )
    ] })
  ] });
}
function VinylWorkflowCardHeader({
  workflow,
  index,
  vinyl,
  calc,
  metrics,
  colorTag,
  open,
  onToggleOpen,
  onChange,
  onSaveTemplate,
  onDuplicate,
  onRemove
}) {
  const partCount = (workflow.items || []).length;
  const placeholderName = `Workflow ${index + 1}`;
  return /* @__PURE__ */ jsxs11(CardHeader, { className: "pb-2.5 pt-3", children: [
    /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-2 min-w-0", children: [
      /* @__PURE__ */ jsx28(
        "button",
        {
          type: "button",
          onClick: onToggleOpen,
          className: "flex items-center justify-center w-6 h-6 rounded hover:bg-slate-100 flex-shrink-0 text-slate-500",
          title: open ? "Collapse" : "Expand",
          children: open ? /* @__PURE__ */ jsx28(ChevronDown, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx28(ChevronRight, { className: "w-4 h-4" })
        }
      ),
      /* @__PURE__ */ jsx28(
        ColorTagPicker,
        {
          value: colorTag,
          onChange: (c) => onChange({ color_tag: c })
        }
      ),
      /* @__PURE__ */ jsx28("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ jsx28(
        NameEditor,
        {
          value: workflow.name,
          placeholder: placeholderName,
          onSave: (v) => onChange({ name: v })
        }
      ) }),
      /* @__PURE__ */ jsxs11("div", { className: "flex-shrink-0 text-right", children: [
        /* @__PURE__ */ jsx28("div", { className: "text-[10px] uppercase tracking-wide text-slate-400 leading-none", children: "Total" }),
        calc.__held ? /* @__PURE__ */ jsx28("div", { className: "text-sm font-semibold text-amber-700 leading-tight", title: "Pricing unavailable \u2014 fix the flagged inputs", children: "Not saved" }) : /* @__PURE__ */ jsx28("div", { className: "text-base font-bold tabular-nums text-slate-900 leading-tight", children: fmt4(calc.totalCost) })
      ] }),
      /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-0.5 flex-shrink-0 pl-1 border-l border-slate-200 ml-1", children: [
        /* @__PURE__ */ jsx28(
          Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: onSaveTemplate,
            className: "h-7 w-7 text-slate-500 hover:text-blue-600",
            title: "Save / apply template",
            children: /* @__PURE__ */ jsx28(Bookmark, { className: "w-3.5 h-3.5" })
          }
        ),
        /* @__PURE__ */ jsx28(
          Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: onDuplicate,
            className: "h-7 w-7 text-slate-500 hover:text-blue-600",
            title: "Duplicate workflow",
            children: /* @__PURE__ */ jsx28(Copy, { className: "w-3.5 h-3.5" })
          }
        ),
        /* @__PURE__ */ jsx28(
          Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: onRemove,
            className: "h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50",
            title: "Delete workflow",
            children: /* @__PURE__ */ jsx28(Trash2, { className: "w-3.5 h-3.5" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-1.5 flex-wrap pl-8 mt-1.5", children: [
      /* @__PURE__ */ jsxs11(Badge, { variant: "outline", className: "text-[10px] font-normal h-5", children: [
        partCount,
        " ",
        partCount === 1 ? "part" : "parts"
      ] }),
      vinyl ? /* @__PURE__ */ jsx28(Badge, { variant: "outline", className: "text-[10px] font-normal h-5 max-w-[200px] truncate", title: vinyl.vinyl_name, children: vinyl.vinyl_name }) : /* @__PURE__ */ jsxs11(Badge, { className: "text-[10px] font-normal h-5 bg-amber-50 text-amber-800 border-amber-200", children: [
        /* @__PURE__ */ jsx28(AlertTriangle, { className: "w-2.5 h-2.5 mr-0.5" }),
        " No vinyl selected"
      ] }),
      calc.partsUnplaced > 0 && /* @__PURE__ */ jsxs11(Badge, { className: "text-[10px] font-normal h-5 bg-red-100 text-red-800 border-red-200", children: [
        /* @__PURE__ */ jsx28(AlertTriangle, { className: "w-2.5 h-2.5 mr-0.5" }),
        " ",
        calc.partsUnplaced,
        " unplaced"
      ] }),
      calc.__held && (calc.issues || []).length > 0 && /* @__PURE__ */ jsxs11(Badge, { className: "text-[10px] font-normal h-5 bg-amber-50 text-amber-800 border-amber-200", children: [
        /* @__PURE__ */ jsx28(AlertTriangle, { className: "w-2.5 h-2.5 mr-0.5" }),
        " ",
        calc.issues.length,
        " pricing ",
        calc.issues.length === 1 ? "issue" : "issues"
      ] }),
      /* @__PURE__ */ jsx28(VinylWorkflowMetricsBadge, { metrics })
    ] })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylCuttingExtrasCard.jsx
import { useMemo as useMemo5 } from "react";
import { jsx as jsx29, jsxs as jsxs12 } from "react/jsx-runtime";
function VinylCuttingExtrasCard({
  vinyls,
  transferTapeId,
  applyTransferTape,
  weedingDifficulty,
  weedingMinutesPerPartOverride,
  installMinutesPerPart,
  partsPlaced = 0,
  onChange,
  issues = [],
  issuesId
}) {
  const ttOptions = useMemo5(
    () => vinyls.filter(
      (v) => v.is_active !== false && v.show_in_vinyl_estimator !== false && (v.vinyl_category === "transfer_tape" || v.vinyl_category === "application_tape")
    ),
    [vinyls]
  );
  const wd = weedingDifficulty || "moderate";
  const weedMinDefault = WEEDING_LABOR_MINUTES_PER_PART[wd] ?? 0.6;
  const weedMin = Number.isFinite(parseFloat(weedingMinutesPerPartOverride)) ? parseFloat(weedingMinutesPerPartOverride) : weedMinDefault;
  const installMin = Math.max(0, parseFloat(installMinutesPerPart) || 0);
  const totalWeedMin = weedMin * partsPlaced || 0;
  const totalInstallMin = installMin * partsPlaced || 0;
  return /* @__PURE__ */ jsxs12(Card, { children: [
    /* @__PURE__ */ jsx29(CardHeader, { className: "pb-2", children: /* @__PURE__ */ jsxs12(CardTitle, { className: "text-base flex items-center gap-2", children: [
      /* @__PURE__ */ jsx29(Scissors, { className: "w-4 h-4 text-rose-600" }),
      " Cutting Extras"
    ] }) }),
    /* @__PURE__ */ jsxs12(CardContent, { className: "grid md:grid-cols-2 gap-4", children: [
      /* @__PURE__ */ jsxs12("div", { children: [
        /* @__PURE__ */ jsxs12("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx29(Label, { className: "text-xs", children: "Transfer Tape" }),
          /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx29("span", { className: "text-[11px] text-slate-500", children: "Apply" }),
            /* @__PURE__ */ jsx29(
              Switch,
              {
                checked: !!applyTransferTape,
                onCheckedChange: (v) => onChange({ applyTransferTape: !!v })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs12(
          Select,
          {
            value: transferTapeId || "__none__",
            onValueChange: (id) => onChange({ transferTapeId: id === "__none__" ? "" : id }),
            disabled: !applyTransferTape,
            children: [
              /* @__PURE__ */ jsx29(
                SelectTrigger,
                {
                  className: "h-9 mt-1",
                  "aria-invalid": hasIssueFor(issues, "transfer_tape_id") || void 0,
                  "aria-describedby": hasIssueFor(issues, "transfer_tape_id") ? issuesId : void 0,
                  children: /* @__PURE__ */ jsx29(SelectValue, { placeholder: "Choose transfer tape\u2026" })
                }
              ),
              /* @__PURE__ */ jsxs12(SelectContent, { children: [
                /* @__PURE__ */ jsx29(SelectItem, { value: "__none__", children: "None" }),
                ttOptions.map((v) => /* @__PURE__ */ jsxs12(SelectItem, { value: v.id, children: [
                  v.vinyl_name,
                  v.roll_width_inches ? ` \xB7 ${v.roll_width_inches}\u2033` : ""
                ] }, v.id))
              ] })
            ]
          }
        ),
        applyTransferTape && ttOptions.length === 0 && /* @__PURE__ */ jsx29("p", { className: "text-[11px] text-amber-600 mt-1", children: 'No transfer tape rolls yet. Add one in Vinyl Inventory with category "Transfer / Application Tape".' })
      ] }),
      /* @__PURE__ */ jsxs12("div", { children: [
        /* @__PURE__ */ jsx29(Label, { className: "text-xs", children: "Weeding Difficulty" }),
        /* @__PURE__ */ jsxs12(
          Select,
          {
            value: wd,
            onValueChange: (v) => onChange({ weedingDifficulty: v, weedingMinutesPerPartOverride: "" }),
            children: [
              /* @__PURE__ */ jsx29(
                SelectTrigger,
                {
                  className: "h-9 mt-1",
                  "aria-invalid": hasIssueFor(issues, "weeding_difficulty") || void 0,
                  "aria-describedby": hasIssueFor(issues, "weeding_difficulty") ? issuesId : void 0,
                  children: /* @__PURE__ */ jsx29(SelectValue, {})
                }
              ),
              /* @__PURE__ */ jsx29(SelectContent, { children: WEEDING_DIFFICULTY.map((w) => /* @__PURE__ */ jsxs12(SelectItem, { value: w, children: [
                WEEDING_DIFFICULTY_LABELS[w] || w,
                " \xB7 ",
                WEEDING_LABOR_MINUTES_PER_PART[w],
                " min/part"
              ] }, w)) })
            ]
          }
        ),
        /* @__PURE__ */ jsxs12("div", { className: "mt-2 grid grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxs12("div", { children: [
            /* @__PURE__ */ jsx29(Label, { className: "text-[10px] uppercase tracking-wider text-slate-500", children: "Override (min/part)" }),
            /* @__PURE__ */ jsx29(
              Input,
              {
                type: "number",
                step: "0.1",
                placeholder: String(weedMinDefault),
                value: weedingMinutesPerPartOverride ?? "",
                onChange: (e) => onChange({ weedingMinutesPerPartOverride: e.target.value }),
                "aria-invalid": hasIssueFor(issues, "weeding_minutes_per_part_override") || void 0,
                "aria-describedby": hasIssueFor(issues, "weeding_minutes_per_part_override") ? issuesId : void 0,
                className: "h-8 text-xs tabular-nums"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs12("div", { children: [
            /* @__PURE__ */ jsx29(Label, { className: "text-[10px] uppercase tracking-wider text-slate-500", children: "Weeding labor" }),
            /* @__PURE__ */ jsxs12("div", { className: "h-8 flex items-center text-xs tabular-nums text-slate-700", children: [
              totalWeedMin.toFixed(1),
              " min \xB7 ",
              partsPlaced,
              " parts"
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs12("div", { className: "md:col-span-2 grid grid-cols-2 gap-3 pt-1 border-t border-slate-100", children: [
        /* @__PURE__ */ jsxs12("div", { children: [
          /* @__PURE__ */ jsx29(Label, { className: "text-xs", children: "Application / Install Labor" }),
          /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-2 mt-1", children: [
            /* @__PURE__ */ jsx29(
              Input,
              {
                type: "number",
                step: "0.1",
                value: installMinutesPerPart ?? "",
                placeholder: "0",
                onChange: (e) => onChange({ installMinutesPerPart: e.target.value }),
                "aria-invalid": hasIssueFor(issues, "install_minutes_per_part") || void 0,
                "aria-describedby": hasIssueFor(issues, "install_minutes_per_part") ? issuesId : void 0,
                className: "h-8 text-xs tabular-nums w-24"
              }
            ),
            /* @__PURE__ */ jsx29("span", { className: "text-xs text-slate-500", children: "min / part on-site" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs12("div", { children: [
          /* @__PURE__ */ jsx29(Label, { className: "text-[10px] uppercase tracking-wider text-slate-500", children: "Total install labor" }),
          /* @__PURE__ */ jsxs12("div", { className: "h-8 flex items-center text-xs tabular-nums text-slate-700", children: [
            totalInstallMin.toFixed(1),
            " min \xB7 ",
            partsPlaced,
            " parts"
          ] })
        ] })
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylWorkflowPersonnel.jsx
import { Fragment as Fragment3, jsx as jsx30, jsxs as jsxs13 } from "react/jsx-runtime";
var num5 = (v) => parseFloat(v) || 0;
function VinylWorkflowPersonnel({ personnel = [], onChange, suggestedHours = 0, roleOptions = [], issues = [], issuesId }) {
  const update = (idx, patch) => {
    const next = [...personnel];
    next[idx] = { ...next[idx], ...patch, _auto: false };
    const r = vinylNumber(next[idx].hourly_rate);
    const h = vinylNumber(next[idx].hours);
    next[idx].total_cost = r !== null && h !== null ? r * h : null;
    onChange(next);
  };
  const remove = (idx) => {
    if (!confirm(`Remove role "${personnel[idx]?.role || "this role"}" from this workflow?`)) return;
    onChange(personnel.filter((_, i) => i !== idx));
  };
  const add = (role) => {
    const preset = roleOptions.find((r) => r.role === role) || { role, hourly_rate: 50 };
    onChange([...personnel || [], {
      role: preset.role,
      hourly_rate: preset.hourly_rate,
      hours: 0,
      total_cost: 0
    }]);
  };
  const totalCost = personnel.reduce((s, p) => s + num5(p.total_cost), 0);
  const totalHours = personnel.reduce((s, p) => s + num5(p.hours), 0);
  return /* @__PURE__ */ jsxs13(Card, { children: [
    /* @__PURE__ */ jsx30(CardHeader, { className: "pb-2", children: /* @__PURE__ */ jsxs13("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs13(CardTitle, { className: "text-base flex items-center gap-2", children: [
        /* @__PURE__ */ jsx30(Users, { className: "w-4 h-4 text-indigo-600" }),
        " Workflow Personnel"
      ] }),
      /* @__PURE__ */ jsx30("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxs13(Select, { value: "", onValueChange: (v) => v && add(v), children: [
        /* @__PURE__ */ jsx30(SelectTrigger, { className: "h-8 w-52 text-xs", children: /* @__PURE__ */ jsx30(SelectValue, { placeholder: "+ Add role\u2026" }) }),
        /* @__PURE__ */ jsx30(SelectContent, { children: roleOptions.map((r) => /* @__PURE__ */ jsxs13(SelectItem, { value: r.role, children: [
          r.role,
          " \xB7 $",
          r.hourly_rate,
          "/hr"
        ] }, r.role)) })
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsxs13(CardContent, { className: "space-y-2", children: [
      personnel.length === 0 ? /* @__PURE__ */ jsxs13("div", { className: "text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-3", children: [
        "No per-role personnel set. Labor is being calculated at the printer's operator rate (",
        suggestedHours.toFixed(2),
        " hr machine + weeding + install). Add roles above for granular Designer / Printer Operator / Application costing."
      ] }) : /* @__PURE__ */ jsxs13(Fragment3, { children: [
        /* @__PURE__ */ jsxs13("div", { className: "grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-slate-500", children: [
          /* @__PURE__ */ jsx30("div", { className: "col-span-5", children: "Role" }),
          /* @__PURE__ */ jsx30("div", { className: "col-span-3 text-right", children: "$/hr" }),
          /* @__PURE__ */ jsx30("div", { className: "col-span-2 text-right", children: "Hours" }),
          /* @__PURE__ */ jsx30("div", { className: "col-span-2 text-right", children: "Total" })
        ] }),
        personnel.map((p, idx) => {
          const rowIssues = issues.filter((i) => i.itemIndex === idx);
          return /* @__PURE__ */ jsxs13("div", { children: [
            /* @__PURE__ */ jsxs13("div", { className: "grid grid-cols-12 gap-2 items-center", children: [
              /* @__PURE__ */ jsx30("div", { className: "col-span-5", children: /* @__PURE__ */ jsx30(Input, { value: p.role || "", onChange: (e) => update(idx, { role: e.target.value }), className: "h-8 text-sm" }) }),
              /* @__PURE__ */ jsx30("div", { className: "col-span-3", children: /* @__PURE__ */ jsx30(
                Input,
                {
                  type: "number",
                  step: "0.5",
                  value: p.hourly_rate ?? "",
                  onChange: (e) => update(idx, { hourly_rate: vinylDraftValue(e.target.value) }),
                  "aria-invalid": hasIssueFor(issues, "hourly_rate", idx) || void 0,
                  "aria-describedby": hasIssueFor(issues, "hourly_rate", idx) ? `${issuesId || "vinyl-wf-issues"}-role-${idx}` : void 0,
                  className: "h-8 text-sm text-right tabular-nums"
                }
              ) }),
              /* @__PURE__ */ jsx30("div", { className: "col-span-2", children: /* @__PURE__ */ jsx30(
                Input,
                {
                  type: "number",
                  step: "0.25",
                  value: p.hours ?? "",
                  onChange: (e) => update(idx, { hours: vinylDraftValue(e.target.value) }),
                  "aria-invalid": hasIssueFor(issues, "hours", idx) || void 0,
                  "aria-describedby": hasIssueFor(issues, "hours", idx) ? `${issuesId || "vinyl-wf-issues"}-role-${idx}` : void 0,
                  className: "h-8 text-sm text-right tabular-nums"
                }
              ) }),
              /* @__PURE__ */ jsx30("div", { className: "col-span-1 text-right text-sm tabular-nums", children: vinylNumber(p.total_cost) !== null ? `$${num5(p.total_cost).toFixed(2)}` : "\u2014" }),
              /* @__PURE__ */ jsx30("div", { className: "col-span-1 text-right", children: /* @__PURE__ */ jsx30(Button, { size: "icon", variant: "ghost", className: "h-7 w-7", onClick: () => remove(idx), children: /* @__PURE__ */ jsx30(X, { className: "w-3.5 h-3.5 text-red-600" }) }) })
            ] }),
            rowIssues.length > 0 && /* @__PURE__ */ jsxs13(
              "div",
              {
                role: "status",
                id: `${issuesId || "vinyl-wf-issues"}-role-${idx}`,
                className: "flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1",
                children: [
                  /* @__PURE__ */ jsx30(AlertTriangle, { className: "w-3 h-3 mt-0.5 flex-shrink-0" }),
                  /* @__PURE__ */ jsx30("div", { className: "space-y-0.5", children: rowIssues.map((it, i2) => /* @__PURE__ */ jsx30("div", { children: it.message }, i2)) })
                ]
              }
            )
          ] }, idx);
        }),
        /* @__PURE__ */ jsxs13("div", { className: "flex justify-between text-xs pt-2 border-t border-slate-100", children: [
          /* @__PURE__ */ jsxs13("span", { className: "text-slate-500", children: [
            totalHours.toFixed(2),
            " hr total"
          ] }),
          /* @__PURE__ */ jsxs13("span", { className: "font-semibold tabular-nums", children: [
            "$",
            totalCost.toFixed(2)
          ] })
        ] })
      ] }),
      personnel.length === 0 && roleOptions.length > 0 && /* @__PURE__ */ jsxs13("div", { className: "flex flex-wrap gap-1 pt-1", children: [
        /* @__PURE__ */ jsx30("span", { className: "text-[10px] text-slate-500 mr-1", children: "Quick add:" }),
        ["Designer", "Printer Operator", "Application Technician"].map((role) => roleOptions.some((r) => r.role === role) && /* @__PURE__ */ jsxs13(Button, { size: "sm", variant: "outline", className: "h-6 text-xs", onClick: () => add(role), children: [
          /* @__PURE__ */ jsx30(Plus, { className: "w-3 h-3 mr-1" }),
          " ",
          role
        ] }, role))
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/vinylEstimator/VinylRollWidthRecommender.jsx
import { useMemo as useMemo6 } from "react";
import { jsx as jsx31, jsxs as jsxs14 } from "react/jsx-runtime";
var fmt5 = (n) => `$${(Number(n) || 0).toFixed(2)}`;
var groupCandidates = (vinyl, allVinyls) => {
  if (!vinyl) return [];
  const base = allVinyls.filter(
    (v) => v.id !== vinyl.id && v.is_active !== false && v.show_in_vinyl_estimator !== false && !v.is_laminate
  );
  if (vinyl.product_group_key) {
    return base.filter((v) => v.product_group_key === vinyl.product_group_key);
  }
  return base.filter(
    (v) => (v.vinyl_name || "").trim() === (vinyl.vinyl_name || "").trim() && (v.manufacturer || "") === (vinyl.manufacturer || "") && (v.product_series || "") === (vinyl.product_series || "")
  );
};
function VinylRollWidthRecommender({
  workflow,
  vinyl,
  vinyls,
  printer,
  cutter,
  laminator,
  transferTape,
  laminate,
  operatorRate,
  currentCalc,
  onPick
}) {
  const candidates = useMemo6(() => groupCandidates(vinyl, vinyls), [vinyl, vinyls]);
  const evaluated = useMemo6(() => {
    if (!vinyl || candidates.length === 0 || !currentCalc || currentCalc.__held) return [];
    const baseArgs = {
      items: workflow.items || [],
      printer,
      cutter,
      laminator,
      laminate,
      transferTape,
      operatorHourlyRate: operatorRate,
      applyPrint: !!workflow.apply_print,
      applyCut: !!workflow.apply_cut,
      applyLaminate: !!workflow.apply_laminate,
      applyTransferTape: !!workflow.apply_transfer_tape,
      printQuality: workflow.print_quality || printer?.default_print_quality || "high_quality",
      weedingDifficulty: workflow.weeding_difficulty || "moderate",
      installMinutesPerPart: workflow.install_minutes_per_part,
      personnel: workflow.personnel || [],
      spoilageBufferPercent: workflow.spoilage_buffer_percent || 0,
      setupFeeFloor: workflow.setup_fee_floor || 0
    };
    return candidates.filter((c) => vinylMaterialIssues(c, "vinyl", 0, c.id).length === 0).map((c) => {
      const calc = calculateVinylProject({ ...baseArgs, vinyl: c });
      return {
        vinyl: c,
        totalCost: calc.totalCost,
        partsUnplaced: calc.partsUnplaced,
        totalRollSqFtPulled: calc.totalRollSqFtPulled
      };
    }).filter((r) => r.partsUnplaced === 0).sort((a, b) => a.totalCost - b.totalCost);
  }, [candidates, workflow, printer, cutter, laminator, laminate, transferTape, vinyl, operatorRate, currentCalc]);
  if (!vinyl || candidates.length === 0 || !currentCalc || currentCalc.__held) return null;
  const currentTotal = currentCalc.totalCost || 0;
  const best = evaluated[0];
  const savings = best ? currentTotal - best.totalCost : 0;
  const showSuggestion = best && savings > 1 && savings / Math.max(currentTotal, 1) > 0.02;
  return /* @__PURE__ */ jsx31(Card, { className: showSuggestion ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50", children: /* @__PURE__ */ jsxs14(CardContent, { className: "p-3 text-xs space-y-2", children: [
    /* @__PURE__ */ jsxs14("div", { className: "flex items-center gap-2 font-medium text-slate-800", children: [
      /* @__PURE__ */ jsx31(Lightbulb, { className: `w-3.5 h-3.5 ${showSuggestion ? "text-amber-600" : "text-slate-500"}` }),
      "Roll-Width Options",
      /* @__PURE__ */ jsxs14("span", { className: "text-[10px] text-slate-500", children: [
        "(",
        candidates.length,
        " alternates in this product group)"
      ] })
    ] }),
    showSuggestion ? /* @__PURE__ */ jsxs14("div", { className: "flex items-center justify-between gap-2 bg-white border border-amber-200 rounded p-2", children: [
      /* @__PURE__ */ jsxs14("div", { children: [
        /* @__PURE__ */ jsxs14("div", { className: "font-semibold text-amber-900", children: [
          "Switch to ",
          best.vinyl.roll_width_inches,
          "\u2033 width"
        ] }),
        /* @__PURE__ */ jsxs14("div", { className: "text-[11px] text-slate-600", children: [
          "Current ",
          vinyl.roll_width_inches,
          "\u2033 = ",
          fmt5(currentTotal),
          " \u2192 ",
          best.vinyl.roll_width_inches,
          "\u2033 = ",
          fmt5(best.totalCost),
          /* @__PURE__ */ jsxs14("span", { className: "ml-1 text-emerald-700 font-medium", children: [
            "save ",
            fmt5(savings)
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs14(Button, { size: "sm", className: "h-7 bg-amber-600 hover:bg-amber-700 text-white", onClick: () => onPick(best.vinyl.id), children: [
        "Use this ",
        /* @__PURE__ */ jsx31(ArrowRight, { className: "w-3 h-3 ml-1" })
      ] })
    ] }) : /* @__PURE__ */ jsxs14("div", { className: "text-[11px] text-slate-600", children: [
      "Current ",
      vinyl.roll_width_inches,
      "\u2033 width is already the most cost-effective for this part set."
    ] }),
    evaluated.length > 1 && /* @__PURE__ */ jsx31("div", { className: "flex flex-wrap gap-1 pt-1", children: evaluated.map((opt) => /* @__PURE__ */ jsxs14(
      "button",
      {
        type: "button",
        onClick: () => onPick(opt.vinyl.id),
        className: "text-[10px] px-2 py-0.5 rounded border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 tabular-nums",
        title: `${opt.vinyl.vinyl_name} ${opt.vinyl.roll_width_inches}\u2033`,
        children: [
          opt.vinyl.roll_width_inches,
          "\u2033 \xB7 ",
          fmt5(opt.totalCost)
        ]
      },
      opt.vinyl.id
    )) })
  ] }) });
}

// s:s://@/api/base44Client
var fail = () => {
  globalThis.__unexpectedSdk++;
  throw Error("Unexpected SDK access in the vinyl page proof");
};
var entity = new Proxy({}, { get: () => fail });
var base44 = { functions: { invoke: fail }, entities: new Proxy({}, { get: () => entity }) };

// s:s://@/components/staff/staffEntities
var staffEntities = {
  LaborServiceInventory: globalThis.__entLabor ||= { __ent: "labor" },
  AllInOneEstimate: { get: async (id) => globalThis.__estimate ?? null }
};

// frozen:/app/src/components/vinylEstimator/vinylLaborRoles.jsx
var VINYL_ROLE_NAMES = [
  "Designer",
  "Pre-Press",
  "Printer Operator",
  "Cutter Operator",
  "Laminator Operator",
  "Weeder",
  "Application Technician",
  "Helper"
];
var DEFAULT_ROLE_RATE = {
  "Designer": 65,
  "Pre-Press": 55,
  "Printer Operator": 55,
  "Cutter Operator": 50,
  "Laminator Operator": 45,
  "Weeder": 38,
  "Application Technician": 45,
  "Helper": 32
};
var num6 = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
async function loadVinylLaborRoles() {
  const rows = await loadAllEntityRows({
    entity: staffEntities.LaborServiceInventory,
    query: { service_category: "shop_labor" },
    sort: "service_name",
    label: "Vinyl labor roles"
  });
  const byName = {};
  rows.forEach((r) => {
    if (VINYL_ROLE_NAMES.includes(r.service_name)) {
      byName[r.service_name] = num6(r.shop_rate_per_hour, num6(r.default_rate, DEFAULT_ROLE_RATE[r.service_name] || 0));
    }
  });
  return VINYL_ROLE_NAMES.map((role) => ({
    role,
    hourly_rate: byName[role] ?? DEFAULT_ROLE_RATE[role] ?? 0
  }));
}
var MACHINE_AUTO_ROLES = {
  printer: ["Printer Operator"],
  laminator: ["Laminator Operator"],
  cutter: ["Printer Operator", "Weeder"]
};
function suggestedHoursForRole(role, calc) {
  if (!calc) return 0;
  const min = (v) => Number.isFinite(v) ? v : 0;
  switch (role) {
    case "Printer Operator":
      return min(calc.printMinutes) / 60;
    case "Cutter Operator":
      return min(calc.cutMinutes) / 60;
    case "Laminator Operator":
      return min(calc.laminateMinutes) / 60;
    case "Weeder":
      return min(calc.weedingMinutes) / 60;
    case "Application Technician":
      return min(calc.installMinutes) / 60;
    default:
      return 0;
  }
}

// frozen:/app/src/components/vinylEstimator/VinylWorkflowCard.jsx
import { jsx as jsx32, jsxs as jsxs15 } from "react/jsx-runtime";
var num7 = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
function VinylWorkflowCard({
  workflow,
  index,
  vinyls,
  machines,
  onChange,
  onRemove,
  onDuplicate,
  onMovePartToWorkflow,
  installEnvironment = "exterior",
  defaultOpen = true,
  pricing: pricingProp
  // optional shared { calc, issues, held, resolved }
}) {
  const [open, setOpen] = useState6(defaultOpen);
  const [templatesOpen, setTemplatesOpen] = useState6(false);
  const [templatesMode, setTemplatesMode] = useState6("apply");
  const [recommendOnly, setRecommendOnly] = useState6(false);
  const [showCompare, setShowCompare] = useState6(false);
  const [roleOptions, setRoleOptions] = useState6([]);
  useEffect3(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);
  useEffect3(() => {
    loadVinylLaborRoles().then(setRoleOptions).catch((e) => console.error("Vinyl labor roles failed to load:", e));
  }, []);
  const set = (patch) => onChange({ ...workflow, ...patch });
  const pricing = useMemo7(
    () => pricingProp ?? calcVinylWorkflow({ workflow, vinyls, machines, index }),
    [pricingProp, workflow, vinyls, machines, index]
  );
  const calc = pricing.calc;
  const pricingIssues = pricing.issues || [];
  const held = !!pricing.held;
  const { printer, cutter, laminator, vinyl, laminate, transferTape } = pricing.resolved;
  const operatorRate = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate ?? 45;
  const calcWithManualPositions = useMemo7(() => {
    if (!workflow.manual_positions) return calc;
    const shelves = calc.shelves.map((sh, sIdx) => ({
      ...sh,
      items: sh.items.map((it, iIdx) => {
        const key = `${sIdx}-${iIdx}`;
        const override = workflow.manual_positions[key];
        return override !== void 0 ? { ...it, x: override } : it;
      })
    }));
    return { ...calc, shelves };
  }, [calc, workflow.manual_positions]);
  const handleItemMove = ({ shelfIdx, itemIdx, x }) => {
    const key = `${shelfIdx}-${itemIdx}`;
    set({
      manual_positions: { ...workflow.manual_positions || {}, [key]: x }
    });
  };
  const perPartCosts = useMemo7(
    () => held ? {} : computePerPartCosts(calc, workflow.items || []),
    [held, calc, workflow.items]
  );
  const metrics = useMemo7(() => computeWorkflowMetrics(calc), [calc]);
  const stockUsage = useMemo7(() => computeStockUsage(calc, vinyl), [calc, vinyl]);
  useEffect3(() => {
    const hasIssues = pricingIssues.length > 0 || calc.partsUnplaced > 0 || !workflow.vinyl_id;
    if (workflow._calc?.totalCost !== calc.totalCost || workflow._calc?.materialCost !== calc.materialCost || workflow._hasIssues !== hasIssues) {
      onChange({ ...workflow, _calc: calc, _hasIssues: hasIssues });
    }
  }, [calc.totalCost, calc.materialCost, calc.machineCost, calc.laborCost, calc.partsUnplaced, workflow.vinyl_id, pricingIssues.length]);
  useEffect3(() => {
    if (roleOptions.length === 0) return;
    const wanted = /* @__PURE__ */ new Set();
    if (workflow.apply_print && workflow.printer_id) MACHINE_AUTO_ROLES.printer.forEach((r) => wanted.add(r));
    if (workflow.apply_cut && workflow.cutter_id) MACHINE_AUTO_ROLES.cutter.forEach((r) => wanted.add(r));
    if (workflow.apply_laminate && workflow.laminator_id) MACHINE_AUTO_ROLES.laminator.forEach((r) => wanted.add(r));
    if (wanted.size === 0) return;
    const current = workflow.personnel || [];
    let changed = false;
    const next = [...current];
    wanted.forEach((role) => {
      const opt = roleOptions.find((r) => r.role === role);
      if (!opt) return;
      const existing = next.find((p) => p.role === role);
      const hrs = suggestedHoursForRole(role, calc);
      if (!existing) {
        next.push({ role, hourly_rate: opt.hourly_rate, hours: hrs, total_cost: opt.hourly_rate * hrs, _auto: true });
        changed = true;
      } else if (existing._auto && Math.abs(num7(existing.hours) - hrs) > 1e-3) {
        existing.hours = hrs;
        existing.total_cost = num7(existing.hourly_rate) * hrs;
        changed = true;
      }
    });
    if (changed) set({ personnel: next });
  }, [
    roleOptions,
    workflow.apply_print,
    workflow.apply_cut,
    workflow.apply_laminate,
    workflow.printer_id,
    workflow.cutter_id,
    workflow.laminator_id,
    calc.printMinutes,
    calc.cutMinutes,
    calc.laminateMinutes,
    calc.weedingMinutes,
    calc.installMinutes
  ]);
  const colorTag = workflow.color_tag || COLOR_SWATCHES[index % COLOR_SWATCHES.length];
  return /* @__PURE__ */ jsxs15(
    Card,
    {
      className: "bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden",
      style: { borderLeft: `4px solid ${colorTag}` },
      children: [
        /* @__PURE__ */ jsx32(
          VinylWorkflowCardHeader,
          {
            workflow,
            index,
            vinyl,
            calc,
            metrics,
            colorTag,
            open,
            onToggleOpen: () => setOpen(!open),
            onChange: set,
            onSaveTemplate: () => {
              setTemplatesMode("save");
              setTemplatesOpen(true);
            },
            onDuplicate,
            onRemove
          }
        ),
        open && /* @__PURE__ */ jsxs15(CardContent, { className: "space-y-4 pt-2 border-t border-slate-100", children: [
          pricingIssues.length > 0 && /* @__PURE__ */ jsxs15(
            "div",
            {
              role: "status",
              id: `vinyl-wf-${index}-issues`,
              className: "flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2",
              children: [
                /* @__PURE__ */ jsx32(AlertTriangle, { className: "w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" }),
                /* @__PURE__ */ jsxs15("div", { children: [
                  /* @__PURE__ */ jsxs15("div", { className: "font-semibold", children: [
                    "Pricing unavailable \u2014 ",
                    pricingIssues.length,
                    " value",
                    pricingIssues.length === 1 ? "" : "s",
                    " need attention"
                  ] }),
                  /* @__PURE__ */ jsxs15("ul", { className: "mt-1 space-y-0.5 list-disc list-inside", children: [
                    pricingIssues.slice(0, 6).map((it, i) => /* @__PURE__ */ jsx32("li", { children: it.message }, i)),
                    pricingIssues.length > 6 && /* @__PURE__ */ jsxs15("li", { children: [
                      "\u2026and ",
                      pricingIssues.length - 6,
                      " more"
                    ] })
                  ] })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsx32(
            VinylPresetBar,
            {
              activePresetKey: workflow.preset_key,
              onApply: (preset) => set({ ...applyPresetToWorkflow(preset) })
            }
          ),
          /* @__PURE__ */ jsx32(
            VinylMaterialPicker,
            {
              vinyls,
              vinylId: workflow.vinyl_id,
              laminateId: workflow.laminate_id,
              applyLaminate: !!workflow.apply_laminate,
              presetKey: workflow.preset_key,
              installEnvironment,
              recommendOnly,
              issues: pricingIssues,
              issuesId: `vinyl-wf-${index}-issues`,
              onChange: ({ vinylId, laminateId, applyLaminate, recommendOnly: ro }) => {
                if (ro !== void 0) setRecommendOnly(ro);
                if (vinylId !== void 0 || laminateId !== void 0 || applyLaminate !== void 0) {
                  set({
                    vinyl_id: vinylId,
                    laminate_id: laminateId || "",
                    apply_laminate: !!applyLaminate
                  });
                }
              }
            }
          ),
          stockUsage && /* @__PURE__ */ jsx32(VinylStockWarning, { stockUsage, vinyl }),
          vinyl && calc.vinylCost > 0 && /* @__PURE__ */ jsxs15("div", { children: [
            /* @__PURE__ */ jsxs15("button", { type: "button", onClick: () => setShowCompare((s) => !s), className: "text-[11px] underline text-blue-600", children: [
              showCompare ? "Hide" : "Show",
              " cost comparison vs other vinyls"
            ] }),
            showCompare && /* @__PURE__ */ jsx32("div", { className: "mt-2", children: /* @__PURE__ */ jsx32(VinylAlternativeCompare, { calc, currentVinyl: vinyl, vinyls }) })
          ] }),
          /* @__PURE__ */ jsx32(
            VinylRollWidthRecommender,
            {
              workflow,
              vinyl,
              vinyls,
              printer,
              cutter,
              laminator,
              laminate,
              transferTape,
              operatorRate,
              currentCalc: calc,
              onPick: (id) => set({ vinyl_id: id })
            }
          ),
          /* @__PURE__ */ jsx32(
            VinylMachinePicker,
            {
              machines,
              issues: pricingIssues,
              issuesId: `vinyl-wf-${index}-issues`,
              value: {
                printer_id: workflow.printer_id,
                cutter_id: workflow.cutter_id,
                laminator_id: workflow.laminator_id,
                applyPrint: !!workflow.apply_print,
                applyCut: !!workflow.apply_cut,
                applyLaminate: !!workflow.apply_laminate,
                printQuality: workflow.print_quality || printer?.default_print_quality || "high_quality"
              },
              onChange: (v) => {
                const patch = {};
                if (v.printer_id !== void 0) patch.printer_id = v.printer_id;
                if (v.cutter_id !== void 0) patch.cutter_id = v.cutter_id;
                if (v.laminator_id !== void 0) patch.laminator_id = v.laminator_id;
                if (v.applyPrint !== void 0) patch.apply_print = v.applyPrint;
                if (v.applyCut !== void 0) patch.apply_cut = v.applyCut;
                if (v.applyLaminate !== void 0) patch.apply_laminate = v.applyLaminate;
                if (v.printQuality !== void 0) patch.print_quality = v.printQuality;
                set(patch);
              }
            }
          ),
          /* @__PURE__ */ jsxs15(Card, { children: [
            /* @__PURE__ */ jsx32(CardHeader, { className: "pb-2", children: /* @__PURE__ */ jsx32(CardTitle, { className: "text-sm", children: "Workflow Cost Controls" }) }),
            /* @__PURE__ */ jsxs15(CardContent, { className: "grid md:grid-cols-2 gap-4 text-xs", children: [
              /* @__PURE__ */ jsxs15("div", { children: [
                /* @__PURE__ */ jsx32("label", { className: "text-[10px] uppercase tracking-wider text-slate-500", children: "Spoilage / Reprint Buffer (%)" }),
                /* @__PURE__ */ jsx32(
                  Input,
                  {
                    type: "number",
                    step: "1",
                    min: "0",
                    value: workflow.spoilage_buffer_percent ?? "",
                    placeholder: "0",
                    onChange: (e) => set({ spoilage_buffer_percent: e.target.value }),
                    "aria-invalid": hasIssueFor(pricingIssues, "spoilage_buffer_percent") || void 0,
                    "aria-describedby": hasIssueFor(pricingIssues, "spoilage_buffer_percent") ? `vinyl-wf-${index}-issues` : void 0,
                    className: "h-8 tabular-nums"
                  }
                ),
                /* @__PURE__ */ jsx32("p", { className: "text-[10px] text-slate-500 mt-1", children: "Adds N% extra qty to every part before nesting." })
              ] }),
              /* @__PURE__ */ jsxs15("div", { children: [
                /* @__PURE__ */ jsx32("label", { className: "text-[10px] uppercase tracking-wider text-slate-500", children: "Setup-Fee Floor ($)" }),
                /* @__PURE__ */ jsx32(
                  Input,
                  {
                    type: "number",
                    step: "1",
                    min: "0",
                    value: workflow.setup_fee_floor ?? "",
                    placeholder: "0",
                    onChange: (e) => set({ setup_fee_floor: e.target.value }),
                    "aria-invalid": hasIssueFor(pricingIssues, "setup_fee_floor") || void 0,
                    "aria-describedby": hasIssueFor(pricingIssues, "setup_fee_floor") ? `vinyl-wf-${index}-issues` : void 0,
                    className: "h-8 tabular-nums"
                  }
                ),
                /* @__PURE__ */ jsx32("p", { className: "text-[10px] text-slate-500 mt-1", children: (calc.setupFeeApplied ?? 0) > 0 ? /* @__PURE__ */ jsxs15("span", { className: "text-amber-700 font-medium", children: [
                  "Floor adding $",
                  calc.setupFeeApplied.toFixed(2),
                  " to this workflow."
                ] }) : "Workflow minimum charge." })
              ] })
            ] })
          ] }),
          workflow.apply_cut && /* @__PURE__ */ jsx32(
            VinylCuttingExtrasCard,
            {
              vinyls,
              transferTapeId: workflow.transfer_tape_id,
              applyTransferTape: !!workflow.apply_transfer_tape,
              weedingDifficulty: workflow.weeding_difficulty,
              weedingMinutesPerPartOverride: workflow.weeding_minutes_per_part_override,
              installMinutesPerPart: workflow.install_minutes_per_part,
              partsPlaced: calc.partsPlaced ?? 0,
              issues: pricingIssues,
              issuesId: `vinyl-wf-${index}-issues`,
              onChange: (p) => {
                const patch = {};
                if (p.transferTapeId !== void 0) patch.transfer_tape_id = p.transferTapeId;
                if (p.applyTransferTape !== void 0) patch.apply_transfer_tape = p.applyTransferTape;
                if (p.weedingDifficulty !== void 0) patch.weeding_difficulty = p.weedingDifficulty;
                if (p.weedingMinutesPerPartOverride !== void 0) patch.weeding_minutes_per_part_override = p.weedingMinutesPerPartOverride;
                if (p.installMinutesPerPart !== void 0) patch.install_minutes_per_part = p.installMinutesPerPart;
                set(patch);
              }
            }
          ),
          /* @__PURE__ */ jsx32(
            VinylWorkflowPersonnel,
            {
              personnel: workflow.personnel || [],
              roleOptions,
              onChange: (personnel) => set({ personnel }),
              issues: pricingIssues,
              issuesId: `vinyl-wf-${index}-issues`,
              suggestedHours: held ? 0 : (calc.machineRunMinutes + calc.weedingMinutes + calc.installMinutes) / 60
            }
          ),
          /* @__PURE__ */ jsxs15(Card, { children: [
            /* @__PURE__ */ jsx32(CardHeader, { className: "pb-2", children: /* @__PURE__ */ jsx32(CardTitle, { className: "text-sm", children: "Parts in this workflow" }) }),
            /* @__PURE__ */ jsx32(CardContent, { children: /* @__PURE__ */ jsx32(
              VinylPartsTable,
              {
                items: workflow.items || [],
                onChange: (items) => set({ items, manual_positions: {} }),
                perPartCosts,
                issues: pricingIssues,
                issuesId: `vinyl-wf-${index}-issues`,
                usableWidth: calc.usableWidth,
                defaultBleed: workflow.apply_cut ? 0 : 0.125,
                onMoveToWorkflow: onMovePartToWorkflow ? (partIdx) => onMovePartToWorkflow(partIdx) : null
              }
            ) })
          ] }),
          /* @__PURE__ */ jsxs15(Card, { children: [
            /* @__PURE__ */ jsx32(CardHeader, { className: "pb-2", children: /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between flex-wrap gap-2", children: [
              /* @__PURE__ */ jsx32(CardTitle, { className: "text-sm", children: "Roll Layout" }),
              /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-2 text-xs", children: [
                /* @__PURE__ */ jsx32(Sliders, { className: "w-3.5 h-3.5 text-slate-400" }),
                /* @__PURE__ */ jsx32("span", { className: "text-slate-500", children: "Gutter H" }),
                /* @__PURE__ */ jsx32(
                  Input,
                  {
                    type: "number",
                    step: "0.0625",
                    placeholder: String(calc.gutterH),
                    value: workflow.gutter_h_override ?? "",
                    onChange: (e) => set({ gutter_h_override: e.target.value }),
                    "aria-invalid": hasIssueFor(pricingIssues, "gutter_h_override") || void 0,
                    "aria-describedby": hasIssueFor(pricingIssues, "gutter_h_override") ? `vinyl-wf-${index}-issues` : void 0,
                    className: "h-7 w-16 text-xs tabular-nums"
                  }
                ),
                /* @__PURE__ */ jsx32("span", { className: "text-slate-500", children: "V" }),
                /* @__PURE__ */ jsx32(
                  Input,
                  {
                    type: "number",
                    step: "0.0625",
                    placeholder: String(calc.gutterV),
                    value: workflow.gutter_v_override ?? "",
                    onChange: (e) => set({ gutter_v_override: e.target.value }),
                    "aria-invalid": hasIssueFor(pricingIssues, "gutter_v_override") || void 0,
                    "aria-describedby": hasIssueFor(pricingIssues, "gutter_v_override") ? `vinyl-wf-${index}-issues` : void 0,
                    className: "h-7 w-16 text-xs tabular-nums"
                  }
                ),
                (workflow.gutter_h_override || workflow.gutter_v_override || workflow.manual_positions) && /* @__PURE__ */ jsx32(Button, { size: "sm", variant: "ghost", className: "h-7 text-xs", onClick: () => set({ gutter_h_override: "", gutter_v_override: "", manual_positions: {} }), children: "Reset" })
              ] })
            ] }) }),
            /* @__PURE__ */ jsx32(CardContent, { children: /* @__PURE__ */ jsx32(
              VinylRollVisualizer,
              {
                calc: calcWithManualPositions,
                showRegistrationMarks: workflow.apply_print && workflow.apply_cut,
                onItemMove: handleItemMove
              }
            ) })
          ] })
        ] }),
        /* @__PURE__ */ jsx32(
          VinylWorkflowTemplatesDialog,
          {
            open: templatesOpen,
            onClose: () => setTemplatesOpen(false),
            mode: templatesMode,
            currentWorkflow: workflow,
            onApply: (patch) => set(patch)
          }
        )
      ]
    }
  );
}

// frozen:/app/src/components/vinylEstimator/VinylProjectSummaryCard.jsx
import { jsx as jsx33, jsxs as jsxs16 } from "react/jsx-runtime";
var fmt6 = (n) => `$${Number(n || 0).toFixed(2)}`;
var money = (v) => hasVinylCostSnapshot(v) ? fmt6(v) : /* @__PURE__ */ jsx33("span", { className: "text-amber-700 font-medium", children: "Not saved" });
var Line = ({ label, value, muted }) => /* @__PURE__ */ jsxs16("div", { className: `flex justify-between text-sm ${muted ? "text-slate-500" : "text-slate-800"}`, children: [
  /* @__PURE__ */ jsx33("span", { className: "truncate pr-2", children: label }),
  /* @__PURE__ */ jsx33("span", { className: "tabular-nums shrink-0", children: value })
] });
function VinylProjectSummaryCard({
  rollup,
  project,
  onUpdateProject,
  onSave,
  isSaving,
  pricingUnavailable = false,
  pricingBlocked = false,
  issues = [],
  issuesId = "vinyl-pricing-issues"
}) {
  const laborLabel = hasVinylCostSnapshot(rollup.laborHours) ? `Labor \xB7 ${rollup.laborHours.toFixed(2)} hr` : "Labor";
  return /* @__PURE__ */ jsxs16(Card, { className: "sticky top-4 bg-white border-0 shadow-sm", children: [
    /* @__PURE__ */ jsx33(CardHeader, { className: "pb-2", children: /* @__PURE__ */ jsx33(CardTitle, { className: "text-base", children: "Estimate Summary" }) }),
    /* @__PURE__ */ jsxs16(CardContent, { className: "space-y-3 text-sm", children: [
      pricingUnavailable && /* @__PURE__ */ jsxs16("div", { className: "flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: [
        /* @__PURE__ */ jsx33(AlertTriangle, { className: "w-3 h-3 mt-0.5 flex-shrink-0" }),
        /* @__PURE__ */ jsxs16("span", { children: [
          /* @__PURE__ */ jsx33("b", { children: "Saved amounts (not current pricing)" }),
          " \u2014 current pricing is unavailable. Fix the flagged values to reprice",
          pricingBlocked ? "; saving is paused until then" : "",
          "."
        ] })
      ] }),
      /* @__PURE__ */ jsxs16("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsx33(Line, { label: "Vinyl", value: money(rollup.vinylCost) }),
        /* @__PURE__ */ jsx33(Line, { label: "Laminate", value: money(rollup.laminateCost), muted: true }),
        /* @__PURE__ */ jsx33(Line, { label: "Ink", value: money(rollup.inkCost), muted: true }),
        /* @__PURE__ */ jsx33(Line, { label: "Blade", value: money(rollup.bladeCost), muted: true })
      ] }),
      /* @__PURE__ */ jsxs16("div", { className: "border-t pt-2 space-y-1", children: [
        /* @__PURE__ */ jsx33(Line, { label: "Machine Time", value: money(rollup.machineCost) }),
        /* @__PURE__ */ jsx33(Line, { label: laborLabel, value: money(rollup.laborCost) })
      ] }),
      (rollup.equipmentCost > 0 || rollup.personnelCost > 0 || rollup.travelCost > 0 || rollup.equipmentCost === null || rollup.personnelCost === null || rollup.travelCost === null) && /* @__PURE__ */ jsxs16("div", { className: "border-t pt-2 space-y-1", children: [
        (rollup.equipmentCost === null || rollup.equipmentCost > 0) && /* @__PURE__ */ jsx33(Line, { label: "Equipment", value: money(rollup.equipmentCost) }),
        (rollup.personnelCost === null || rollup.personnelCost > 0) && /* @__PURE__ */ jsx33(Line, { label: "Personnel", value: money(rollup.personnelCost) }),
        (rollup.travelCost === null || rollup.travelCost > 0) && /* @__PURE__ */ jsx33(Line, { label: "Travel", value: money(rollup.travelCost) })
      ] }),
      /* @__PURE__ */ jsxs16("div", { className: "border-t pt-3 space-y-2", children: [
        /* @__PURE__ */ jsxs16("div", { className: "grid grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxs16("div", { children: [
            /* @__PURE__ */ jsx33(Label, { className: "text-[11px]", children: "Supplies %" }),
            /* @__PURE__ */ jsx33(
              Input,
              {
                type: "number",
                step: "0.5",
                value: project.supplies_percent_of_materials ?? "",
                onChange: (e) => onUpdateProject({ supplies_percent_of_materials: vinylDraftValue(e.target.value) }),
                "aria-invalid": hasIssueFor(issues, "supplies_percent_of_materials") || void 0,
                "aria-describedby": hasIssueFor(issues, "supplies_percent_of_materials") ? issuesId : void 0,
                className: "h-8 text-sm tabular-nums"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs16("div", { children: [
            /* @__PURE__ */ jsx33(Label, { className: "text-[11px]", children: "Extra Supplies $" }),
            /* @__PURE__ */ jsx33(
              Input,
              {
                type: "number",
                step: "1",
                value: project.extra_supplies_cost ?? "",
                onChange: (e) => onUpdateProject({ extra_supplies_cost: vinylDraftValue(e.target.value) }),
                "aria-invalid": hasIssueFor(issues, "extra_supplies_cost") || void 0,
                "aria-describedby": hasIssueFor(issues, "extra_supplies_cost") ? issuesId : void 0,
                className: "h-8 text-sm tabular-nums"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx33(Line, { label: "Supplies Total", value: money(rollup.supplies), muted: true })
      ] }),
      /* @__PURE__ */ jsxs16("div", { className: "border-t pt-3 space-y-2", children: [
        /* @__PURE__ */ jsxs16("div", { children: [
          /* @__PURE__ */ jsx33(Label, { className: "text-[11px]", children: "Markup %" }),
          /* @__PURE__ */ jsx33(
            Input,
            {
              type: "number",
              step: "0.5",
              value: project.markup_percent ?? "",
              onChange: (e) => onUpdateProject({ markup_percent: vinylDraftValue(e.target.value) }),
              "aria-invalid": hasIssueFor(issues, "markup_percent") || void 0,
              "aria-describedby": hasIssueFor(issues, "markup_percent") ? issuesId : void 0,
              className: "h-8 text-sm tabular-nums"
            }
          )
        ] }),
        /* @__PURE__ */ jsx33(Line, { label: "Subtotal", value: money(rollup.subtotal), muted: true }),
        /* @__PURE__ */ jsx33(Line, { label: "Markup", value: money(rollup.markupAmount), muted: true })
      ] }),
      /* @__PURE__ */ jsx33("div", { className: "border-t pt-3 bg-slate-900 text-white -mx-6 -mb-6 px-6 py-4 rounded-b-xl", children: /* @__PURE__ */ jsxs16("div", { className: "flex justify-between font-bold text-lg", children: [
        /* @__PURE__ */ jsx33("span", { children: "Total" }),
        /* @__PURE__ */ jsx33("span", { className: "tabular-nums", children: hasVinylCostSnapshot(rollup.totalCost) ? fmt6(rollup.totalCost) : /* @__PURE__ */ jsx33("span", { className: "text-amber-300", children: "Not saved" }) })
      ] }) }),
      project?.updated_date && /* @__PURE__ */ jsxs16("div", { className: "mt-1 text-[10px] text-gray-400", children: [
        "Last saved ",
        new Date(project.updated_date).toLocaleString()
      ] }),
      /* @__PURE__ */ jsxs16(
        Button,
        {
          onClick: onSave,
          disabled: isSaving || pricingBlocked,
          className: "w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-3 disabled:opacity-60",
          children: [
            isSaving ? /* @__PURE__ */ jsx33(Loader2, { className: "w-4 h-4 mr-1 animate-spin" }) : /* @__PURE__ */ jsx33(Save, { className: "w-4 h-4 mr-1" }),
            "Save Estimate"
          ]
        }
      ),
      pricingBlocked && /* @__PURE__ */ jsx33("p", { className: "text-[11px] text-amber-800 text-center", children: "Fix the flagged pricing values to save \u2014 unavailable pricing is never written as $0." })
    ] })
  ] });
}

// s:s://@/components/vinylEstimator/VinylBulkImportDialog
var VinylBulkImportDialog_default = () => null;

// s:s://@/components/vinylEstimator/VinylPartsLibraryDialog
var VinylPartsLibraryDialog_default = () => null;

// s:s://@/components/vinylEstimator/VinylArtworkUploadDialog
var VinylArtworkUploadDialog_default = () => null;

// s:s://@/components/vinylEstimator/VinylMoveToWorkflowMenu
var VinylMoveToWorkflowMenu_default = () => null;

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

// frozen:/app/src/pages/VinylEstimator.jsx
import { Fragment as Fragment4, jsx as jsx34, jsxs as jsxs17 } from "react/jsx-runtime";
var fmt7 = (n) => `$${Number(n || 0).toFixed(2)}`;
var sumOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
function VinylEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const [search] = useSearchParams();
  const projectId = embeddedProjectId || search.get("id") || search.get("edit");
  const estimateId = embeddedEstimateId || search.get("estimateId");
  const navigate = useNavigate();
  const [project, setProject] = useState7(blankVinylProject());
  const [vinyls, setVinyls] = useState7([]);
  const [machines, setMachines] = useState7([]);
  const [settings, setSettings] = useState7({});
  const [equipmentInventory, setEquipmentInventory] = useState7([]);
  const [estimateContext, setEstimateContext] = useState7(null);
  const [loading, setLoading] = useState7(true);
  const [loadError, setLoadError] = useState7("");
  const [saving, setSaving] = useState7(false);
  const [activeTab, setActiveTab] = useState7("project");
  const persistedProjectIdRef = useRef4(projectId || "");
  const createAttemptRef = useRef4({ signature: "", key: "" });
  const copyAttemptRef = useRef4({ signature: "", key: "" });
  const [templateMode, setTemplateMode] = useState7(null);
  useEffect4(() => {
    persistedProjectIdRef.current = projectId || "";
    createAttemptRef.current = { signature: "", key: "" };
    copyAttemptRef.current = { signature: "", key: "" };
  }, [projectId]);
  const [allOpen, setAllOpen] = useState7(true);
  const [targetWorkflowIdx, setTargetWorkflowIdx] = useState7(null);
  const [bulkOpen, setBulkOpen] = useState7(false);
  const [libraryOpen, setLibraryOpen] = useState7(false);
  const [artworkOpen, setArtworkOpen] = useState7(false);
  const [moveContext, setMoveContext] = useState7(null);
  useEffect4(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [vList, mList, sList, eList, p, estimate] = await Promise.all([
          loadAllEntityRows({ entity: VinylInventory, sort: "sort_order", label: "Vinyl inventory" }),
          loadAllEntityRows({ entity: VinylMachine, sort: "sort_order", label: "Vinyl machines" }),
          loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" }),
          loadAllEntityRows({ entity: ChannelLetterInstallEquipment, sort: "sort_order", label: "Installation equipment" }),
          projectId ? VinylProject.get(projectId) : Promise.resolve(null),
          estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
        ]);
        setVinyls(vList || []);
        setMachines(mList || []);
        setEquipmentInventory(eList || []);
        setEstimateContext(estimate || null);
        const settingsObj = {};
        sList.forEach((s) => {
          settingsObj[s.setting_name] = s.setting_value;
        });
        setSettings(settingsObj);
        if (p) {
          const migrated = migrateProject(p);
          const firstWorkflow = migrated.workflows?.[0] || blankWorkflow(0);
          const isBlankEmbeddedWorkflow = (migrated.workflows || []).length === 1 && !(firstWorkflow.items || []).length && !firstWorkflow.vinyl_id && !firstWorkflow.printer_id && !firstWorkflow.cutter_id && !firstWorkflow.laminator_id;
          const defaultPrinter = mList.find((m) => m.is_default_for_type && (m.machine_type === "printer" || m.machine_type === "print_and_cut")) || mList.find((m) => m.machine_type === "printer" || m.machine_type === "print_and_cut");
          const defaultCutter = mList.find((m) => m.is_default_for_type && (m.machine_type === "cutter" || m.machine_type === "print_and_cut")) || mList.find((m) => m.machine_type === "cutter" || m.machine_type === "print_and_cut");
          const defaultLaminator = mList.find((m) => m.is_default_for_type && m.machine_type === "laminator") || mList.find((m) => m.machine_type === "laminator");
          const defaultVinyl = vList.find((v) => v.is_active !== false && !v.is_laminate && v.show_in_vinyl_estimator !== false);
          const workflows = isBlankEmbeddedWorkflow ? [{
            ...firstWorkflow,
            vinyl_id: defaultVinyl?.id || "",
            laminate_id: defaultVinyl?.default_laminate_id || "",
            apply_laminate: !!defaultVinyl?.requires_lamination,
            printer_id: defaultPrinter?.id || "",
            cutter_id: defaultCutter?.id || "",
            laminator_id: defaultLaminator?.id || ""
          }] : migrated.workflows;
          setProject({
            ...migrated,
            workflows,
            client_name: estimate?.client_name || migrated.client_name,
            customer_id: estimate?.customer_id || migrated.customer_id,
            estimate_number: estimate?.estimate_number || migrated.estimate_number,
            site_address: migrated.site_address || estimate?.site_address || ""
          });
        } else {
          const defaultPrinter = mList.find((m) => m.is_default_for_type && (m.machine_type === "printer" || m.machine_type === "print_and_cut")) || mList.find((m) => m.machine_type === "printer" || m.machine_type === "print_and_cut");
          const defaultCutter = mList.find((m) => m.is_default_for_type && (m.machine_type === "cutter" || m.machine_type === "print_and_cut")) || mList.find((m) => m.machine_type === "cutter" || m.machine_type === "print_and_cut");
          const defaultLaminator = mList.find((m) => m.is_default_for_type && m.machine_type === "laminator") || mList.find((m) => m.machine_type === "laminator");
          const defaultVinyl = vList.find((v) => v.is_active !== false && !v.is_laminate && v.show_in_vinyl_estimator !== false);
          setProject((prev) => ({
            ...prev,
            workflows: [{
              ...prev.workflows[0],
              vinyl_id: defaultVinyl?.id || "",
              laminate_id: defaultVinyl?.default_laminate_id || "",
              apply_laminate: !!defaultVinyl?.requires_lamination,
              printer_id: defaultPrinter?.id || "",
              cutter_id: defaultCutter?.id || "",
              laminator_id: defaultLaminator?.id || ""
            }]
          }));
        }
      } catch (e) {
        console.error(e);
        setLoadError(e?.message || "Vinyl Builder prerequisites could not be verified.");
      }
      setLoading(false);
    };
    load();
  }, [projectId, estimateId]);
  const updateProject = useCallback2((patch) => setProject((prev) => ({ ...prev, ...patch })), []);
  const updateWorkflow = (idx, next) => {
    setProject((prev) => {
      const wfs = [...prev.workflows];
      wfs[idx] = next;
      return { ...prev, workflows: wfs };
    });
  };
  const addWorkflow = () => {
    setProject((prev) => ({
      ...prev,
      workflows: [...prev.workflows, blankWorkflow(prev.workflows.length)]
    }));
  };
  const removeWorkflow = (idx) => {
    if (project.workflows.length === 1) {
      alert("A project must have at least one vinyl workflow.");
      return;
    }
    if (!confirm("Delete this workflow and all its parts?")) return;
    setProject((prev) => ({
      ...prev,
      workflows: prev.workflows.filter((_, i) => i !== idx)
    }));
  };
  const duplicateWorkflow = (idx) => {
    setProject((prev) => {
      const copy = JSON.parse(JSON.stringify(prev.workflows[idx]));
      copy.id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      copy.name = `${copy.name || `Workflow ${idx + 1}`} (copy)`;
      copy._calc = void 0;
      const next = [...prev.workflows];
      next.splice(idx + 1, 0, copy);
      return { ...prev, workflows: next };
    });
  };
  const workflowPricing = useMemo8(
    () => (project.workflows || []).map((wf, idx) => calcVinylWorkflow({ workflow: wf, vinyls, machines, index: idx })),
    [project.workflows, vinyls, machines]
  );
  const projectIssues = useMemo8(
    () => vinylProjectInputIssues(project, { settings, equipmentInventory }),
    [project, settings, equipmentInventory]
  );
  const allIssues = useMemo8(
    () => [...workflowPricing.flatMap((p) => p.issues), ...projectIssues],
    [workflowPricing, projectIssues]
  );
  const catalogBlocked = allIssues.some((i) => i.kind === "vinyl_catalog");
  const pricingBlocked = allIssues.length > 0;
  const pricingUnavailable = pricingBlocked || (project.workflows || []).some((wf) => wf?._calc?.pricingUnavailable);
  const travelIssue = projectIssues.some((i) => ["total_travel_cost", "travel_miles_round_trip", "mpg"].includes(i.field) || String(i.code).startsWith("vinyl_travel") || String(i.code).startsWith("vinyl_vehicle"));
  const installIssue = projectIssues.some((i) => ["selected_equipment", "personnel", "total_cost"].includes(i.field) || String(i.code).startsWith("vinyl_equipment") || String(i.code).startsWith("vinyl_personnel_cost") || String(i.code).startsWith("vinyl_install_rate"));
  const summaryIssue = projectIssues.some((i) => ["supplies_percent_of_materials", "extra_supplies_cost", "markup_percent"].includes(i.field));
  const rollup = useMemo8(() => rollupVinylProject(project), [project]);
  const totalLaborHours = rollup.laborHours ?? 0;
  const workflowsHaveIssues = useMemo8(
    () => (project.workflows || []).some((wf) => wf._hasIssues),
    [project.workflows]
  );
  const addPartToWorkflow = (workflowIdx, part) => {
    if (workflowIdx == null || workflowIdx < 0 || workflowIdx >= project.workflows.length) return;
    const wf = project.workflows[workflowIdx];
    updateWorkflow(workflowIdx, { ...wf, items: [...wf.items || [], part] });
  };
  const importPartsToWorkflow = (workflowIdx, parts) => {
    if (workflowIdx == null) return;
    const wf = project.workflows[workflowIdx];
    updateWorkflow(workflowIdx, { ...wf, items: [...wf.items || [], ...parts] });
  };
  const movePart = (fromIdx, partIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const fromWf = project.workflows[fromIdx];
    const toWf = project.workflows[toIdx];
    const part = fromWf.items[partIdx];
    if (!part) return;
    setProject((prev) => {
      const wfs = [...prev.workflows];
      wfs[fromIdx] = { ...fromWf, items: fromWf.items.filter((_, i) => i !== partIdx) };
      wfs[toIdx] = { ...toWf, items: [...toWf.items || [], part] };
      return { ...prev, workflows: wfs };
    });
  };
  useEffect4(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);
  useEffect4(() => {
    if (!saving) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  const save = async () => {
    if (pricingBlocked) {
      const first = allIssues[0];
      const field = first?.field || "";
      const code = String(first?.code || "");
      const tab = first?.index != null ? "workflows" : ["supplies_percent_of_materials", "extra_supplies_cost", "markup_percent"].includes(field) ? "summary" : ["total_travel_cost", "travel_miles_round_trip", "mpg"].includes(field) || code.startsWith("vinyl_travel") || code.startsWith("vinyl_vehicle") ? "travel" : "install";
      setActiveTab(tab);
      alert(catalogBlocked ? "Save paused: a selected vinyl, machine, or equipment record is unavailable or missing required pricing \u2014 update it in Vinyl Inventory / Settings, then save." : "Save paused: fix the flagged pricing values before saving \u2014 unavailable pricing is never written as $0.");
      return;
    }
    if (!project.project_name || !(estimateContext?.client_name || project.client_name)) {
      alert("Please fill in Project Name and Client Name.");
      setActiveTab("project");
      return;
    }
    setSaving(true);
    try {
      const cleanWorkflows = project.workflows.map(({ _calc, ...rest }) => rest);
      const flatItems = cleanWorkflows.flatMap(
        (wf) => (wf.items || []).map((it) => ({ ...it, workflow_id: wf.id, workflow_name: wf.name }))
      );
      const pricingProject = {
        ...project,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        total_vinyl_cost: rollup.vinylCost,
        total_laminate_cost: rollup.laminateCost,
        total_ink_cost: rollup.inkCost,
        total_blade_cost: rollup.bladeCost,
        total_machine_cost: rollup.machineCost,
        total_supplies_cost: rollup.supplies,
        labor_cost: rollup.laborCost,
        total_personnel_cost: rollup.personnelCost,
        total_equipment_cost: rollup.equipmentCost,
        total_travel_cost: rollup.travelCost
      };
      const customerPricing = await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizeVinylProject,
        tierNumber: project.customer_pricing?.tier_number
      });
      const payload = {
        ...project,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        site_address: project.site_address || estimateContext?.site_address || "",
        workflows: cleanWorkflows,
        items: flatItems,
        customer_pricing: customerPricing || project.customer_pricing,
        status: "calculated",
        // Snapshot first workflow's vinyl/machines into the top-level fields for backward compat
        default_vinyl_id: cleanWorkflows[0]?.vinyl_id || "",
        default_laminate_id: cleanWorkflows[0]?.laminate_id || "",
        printer_id: cleanWorkflows[0]?.printer_id || "",
        cutter_id: cleanWorkflows[0]?.cutter_id || "",
        laminator_id: cleanWorkflows[0]?.laminator_id || "",
        // Roll up totals
        total_print_sqft: rollup.usedSqFt,
        total_vinyl_sqft: rollup.totalRollSqFt,
        total_laminate_sqft: rollup.laminateSqFt,
        total_vinyl_cost: rollup.vinylCost,
        total_laminate_cost: rollup.laminateCost,
        total_ink_cost: rollup.inkCost,
        total_blade_cost: rollup.bladeCost,
        total_machine_cost: rollup.machineCost,
        total_personnel_cost: rollup.personnelCost,
        total_supplies_cost: rollup.supplies,
        total_equipment_cost: rollup.equipmentCost,
        base_supplies_cost: rollup.baseSupplies,
        labor_hours: rollup.laborHours,
        labor_cost: rollup.laborCost,
        subtotal: rollup.subtotal,
        markup_amount: rollup.markupAmount,
        total_cost: rollup.totalCost
      };
      let saved;
      const activeProjectId = persistedProjectIdRef.current || projectId || "";
      if (activeProjectId) {
        saved = await updateBuilderSourceProject({
          entity: VinylProject,
          sourceId: activeProjectId,
          expectedUpdatedAt: project.updated_date,
          data: payload,
          estimateId,
          label: "Vinyl project"
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(payload);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("vinyl_project")
          };
        }
        saved = await ensureIdempotentEntityCreate({
          entity: VinylProject,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: payload,
          label: "Vinyl project"
        });
        if (!saved?.id) throw new Error("Vinyl project create could not be verified.");
        persistedProjectIdRef.current = saved.id;
        if (!embedded) navigate(`/VinylEstimator?id=${saved.id}`, { replace: true });
      }
      if (estimateId && saved?.id) {
        const refreshed = await VinylProject.get(saved.id).catch(() => saved);
        const builderWorkflows = (project.workflows || []).map(({ _hasIssues, ...workflow }) => workflow);
        await recordBuilderSave({
          estimateId,
          line: { project_id: saved.id, module_key: "vinyl" },
          sourceProject: { ...refreshed, workflows: builderWorkflows },
          liveTotal: rollup.totalCost
        });
      }
      setProject(migrateProject(saved));
      onSaved?.();
      if (!embedded) alert("Estimate saved.");
    } catch (e) {
      console.error(e);
      alert("Save failed: " + e.message);
    }
    setSaving(false);
  };
  const handleSaveAsCopy = async () => {
    if (pricingBlocked) {
      alert("Save paused: fix the flagged pricing values before saving a copy \u2014 unavailable pricing is never written as $0.");
      return;
    }
    setSaving(true);
    try {
      const cleanWorkflows = (project.workflows || []).map(({ _calc, ...rest }) => rest);
      const flatItems = cleanWorkflows.flatMap(
        (wf) => (wf.items || []).map((it) => ({ ...it, workflow_id: wf.id, workflow_name: wf.name }))
      );
      const copy = await saveModuleProjectCopy({
        entity: VinylProject,
        payload: {
          ...project,
          client_name: estimateContext?.client_name || project.client_name,
          customer_id: estimateContext?.customer_id || project.customer_id,
          estimate_number: estimateContext?.estimate_number || project.estimate_number,
          site_address: project.site_address || estimateContext?.site_address || "",
          workflows: cleanWorkflows,
          items: flatItems,
          customer_pricing: project.customer_pricing,
          status: "calculated",
          default_vinyl_id: cleanWorkflows[0]?.vinyl_id || "",
          default_laminate_id: cleanWorkflows[0]?.laminate_id || "",
          printer_id: cleanWorkflows[0]?.printer_id || "",
          cutter_id: cleanWorkflows[0]?.cutter_id || "",
          laminator_id: cleanWorkflows[0]?.laminator_id || "",
          total_print_sqft: rollup.usedSqFt,
          total_vinyl_sqft: rollup.totalRollSqFt,
          total_laminate_sqft: rollup.laminateSqFt,
          total_vinyl_cost: rollup.vinylCost,
          total_laminate_cost: rollup.laminateCost,
          total_ink_cost: rollup.inkCost,
          total_blade_cost: rollup.bladeCost,
          total_machine_cost: rollup.machineCost,
          total_personnel_cost: rollup.personnelCost,
          total_supplies_cost: rollup.supplies,
          base_supplies_cost: rollup.baseSupplies,
          labor_hours: rollup.laborHours,
          labor_cost: rollup.laborCost,
          subtotal: rollup.subtotal,
          markup_amount: rollup.markupAmount,
          total_cost: rollup.totalCost
        },
        attemptRef: copyAttemptRef,
        keyPrefix: "vinyl_project_copy",
        baseName: project.project_name || "Vinyl",
        label: "Vinyl project copy"
      });
      if (embedded) onSaved?.();
      else navigate(`/VinylEstimator?id=${copy.id}`);
    } catch (e) {
      console.error(e);
      alert("Save copy failed: " + e.message);
    }
    setSaving(false);
  };
  const buildVinylTemplateData = (p) => ({
    workflows: (p.workflows || []).map(({ _calc, ...rest }) => rest),
    markup_percent: p.markup_percent,
    supplies_percent_of_materials: p.supplies_percent_of_materials,
    extra_supplies_cost: p.extra_supplies_cost,
    travel_miles_round_trip: p.travel_miles_round_trip,
    notes: p.notes
  });
  if (loading) {
    return /* @__PURE__ */ jsxs17("div", { className: "p-12 text-center text-slate-500", children: [
      /* @__PURE__ */ jsx34(Loader2, { className: "w-5 h-5 animate-spin inline mr-2" }),
      " Loading\u2026"
    ] });
  }
  if (loadError) {
    return /* @__PURE__ */ jsx34("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: /* @__PURE__ */ jsxs17("div", { className: "max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800", children: [
      /* @__PURE__ */ jsx34("div", { className: "font-bold", children: "Vinyl Builder unavailable" }),
      /* @__PURE__ */ jsx34("div", { className: "mt-1 text-sm", children: "Required vinyl inventory, machine settings, installation equipment, project data, or estimate context could not be verified. Fallback configuration was not used." }),
      /* @__PURE__ */ jsx34("div", { className: "mt-2 text-xs break-words", children: loadError }),
      /* @__PURE__ */ jsxs17(Button, { variant: "outline", className: "mt-4", onClick: () => embedded ? onClose?.() : navigate(estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator"), children: [
        /* @__PURE__ */ jsx34(ArrowLeft, { className: "w-4 h-4 mr-2" }),
        " Back"
      ] })
    ] }) });
  }
  const TabBtn = ({ value, icon: Icon, label, amount, warn }) => /* @__PURE__ */ jsxs17(TabsTrigger, { value, className: "flex items-center gap-1.5 text-xs md:text-sm py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white relative", children: [
    /* @__PURE__ */ jsx34(Icon, { className: "w-4 h-4" }),
    " ",
    /* @__PURE__ */ jsx34("span", { className: "truncate", children: label }),
    Number.isFinite(amount) && /* @__PURE__ */ jsx34("span", { className: "ml-1 text-[10px] tabular-nums opacity-80", children: fmt7(amount) }),
    amount === null && /* @__PURE__ */ jsx34("span", { className: "ml-1 text-[10px] text-amber-500", title: "Pricing unavailable", children: "\u2014" }),
    warn && /* @__PURE__ */ jsx34("span", { className: "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white", title: "Workflow has issues" })
  ] });
  return /* @__PURE__ */ jsxs17("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: [
    /* @__PURE__ */ jsxs17("div", { className: "max-w-7xl mx-auto", children: [
      /* @__PURE__ */ jsxs17("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3", children: [
        /* @__PURE__ */ jsxs17("div", { children: [
          embedded ? /* @__PURE__ */ jsxs17("button", { type: "button", onClick: onClose, className: "text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1", children: [
            /* @__PURE__ */ jsx34(ArrowLeft, { className: "w-4 h-4" }),
            " Back to products"
          ] }) : /* @__PURE__ */ jsxs17(Link, { to: estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator", className: "text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1", children: [
            /* @__PURE__ */ jsx34(ArrowLeft, { className: "w-4 h-4" }),
            " Back to estimator"
          ] }),
          /* @__PURE__ */ jsxs17("h1", { className: "text-3xl font-bold text-slate-900 flex items-center gap-3 mt-1", children: [
            /* @__PURE__ */ jsx34(Droplets, { className: "w-8 h-8 text-blue-600" }),
            projectId ? "Edit" : "New",
            " Vinyl Estimate"
          ] })
        ] }),
        /* @__PURE__ */ jsxs17("div", { className: "flex gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsx34(Link, { to: "/VinylInventory", children: /* @__PURE__ */ jsxs17(Button, { variant: "outline", children: [
            /* @__PURE__ */ jsx34(Settings2, { className: "w-4 h-4 mr-1" }),
            " Vinyl Inventory"
          ] }) }),
          /* @__PURE__ */ jsx34(Link, { to: "/VinylSettings", children: /* @__PURE__ */ jsxs17(Button, { variant: "outline", children: [
            /* @__PURE__ */ jsx34(Settings2, { className: "w-4 h-4 mr-1" }),
            " Machine Settings"
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs17("div", { className: "grid lg:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsx34("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs17(Tabs, { value: activeTab, onValueChange: setActiveTab, className: "w-full", children: [
          /* @__PURE__ */ jsx34("div", { className: "sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60", children: /* @__PURE__ */ jsxs17(TabsList, { className: "grid w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1", style: { gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }, children: [
            /* @__PURE__ */ jsx34(TabBtn, { value: "project", icon: FileText, label: "Project" }),
            /* @__PURE__ */ jsx34(TabBtn, { value: "workflows", icon: Layers, label: "Vinyl Workflows", amount: sumOrNull(rollup.materialCost, rollup.machineCost, rollup.laborCost), warn: workflowsHaveIssues || workflowPricing.some((p) => p.issues.length > 0) }),
            /* @__PURE__ */ jsx34(TabBtn, { value: "install", icon: HardHat, label: "Installation", amount: sumOrNull(rollup.equipmentCost, rollup.personnelCost), warn: installIssue }),
            /* @__PURE__ */ jsx34(TabBtn, { value: "travel", icon: MapPin, label: "Travel", amount: rollup.travelCost, warn: travelIssue }),
            /* @__PURE__ */ jsx34(TabBtn, { value: "summary", icon: Calculator, label: "Summary", amount: rollup.totalCost, warn: summaryIssue }),
            /* @__PURE__ */ jsx34(TabBtn, { value: "pricing", icon: TrendingUp, label: "Customer Pricing" })
          ] }) }),
          allIssues.length > 0 && /* @__PURE__ */ jsxs17(
            "div",
            {
              role: "status",
              id: "vinyl-pricing-issues",
              className: "mt-3 flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded px-3 py-2",
              children: [
                /* @__PURE__ */ jsx34(AlertTriangle, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" }),
                /* @__PURE__ */ jsxs17("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsxs17("div", { className: "font-semibold", children: [
                    "Pricing unavailable \u2014 ",
                    allIssues.length,
                    " value",
                    allIssues.length === 1 ? "" : "s",
                    " need attention before this estimate can be priced or saved."
                  ] }),
                  /* @__PURE__ */ jsxs17("ul", { className: "mt-1 space-y-0.5 list-disc list-inside", children: [
                    allIssues.slice(0, 5).map((it, i) => /* @__PURE__ */ jsx34("li", { children: it.message }, i)),
                    allIssues.length > 5 && /* @__PURE__ */ jsxs17("li", { children: [
                      "\u2026and ",
                      allIssues.length - 5,
                      " more"
                    ] })
                  ] })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxs17(TabsContent, { value: "project", className: "mt-4 space-y-4", children: [
            /* @__PURE__ */ jsxs17(Card, { className: "bg-white border-0 shadow-sm", children: [
              /* @__PURE__ */ jsx34(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx34(CardTitle, { className: "text-lg", children: "Project Information" }) }),
              /* @__PURE__ */ jsxs17(CardContent, { className: "space-y-4", children: [
                /* @__PURE__ */ jsxs17("div", { className: "grid md:grid-cols-2 gap-4", children: [
                  /* @__PURE__ */ jsxs17("div", { children: [
                    /* @__PURE__ */ jsx34(Label, { children: "Client Name *" }),
                    /* @__PURE__ */ jsx34(
                      Input,
                      {
                        value: estimateContext?.client_name || project.client_name || "",
                        onChange: (e) => !embedded && updateProject({ client_name: e.target.value }),
                        readOnly: embedded,
                        className: "mt-1",
                        placeholder: "Enter client name"
                      }
                    ),
                    embedded && /* @__PURE__ */ jsx34("p", { className: "text-[10px] text-slate-400 mt-1", children: "Inherited from the All-In-One estimate." })
                  ] }),
                  /* @__PURE__ */ jsxs17("div", { children: [
                    /* @__PURE__ */ jsx34(Label, { children: "Project Name *" }),
                    /* @__PURE__ */ jsx34(Input, { value: project.project_name, onChange: (e) => updateProject({ project_name: e.target.value }), className: "mt-1" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs17("div", { className: "grid md:grid-cols-2 gap-4", children: [
                  /* @__PURE__ */ jsxs17("div", { children: [
                    /* @__PURE__ */ jsx34(Label, { children: "Estimate Number" }),
                    /* @__PURE__ */ jsx34(Input, { value: estimateContext?.estimate_number || project.estimate_number || "", onChange: (e) => !embedded && updateProject({ estimate_number: e.target.value }), readOnly: embedded, placeholder: "e.g., VIN-2024-001", className: "mt-1" })
                  ] }),
                  /* @__PURE__ */ jsxs17("div", { children: [
                    /* @__PURE__ */ jsxs17(Label, { children: [
                      "Project Link ",
                      /* @__PURE__ */ jsx34("span", { className: "text-xs font-normal text-slate-400", children: "(optional)" })
                    ] }),
                    /* @__PURE__ */ jsx34(Input, { value: project.hyperlink, onChange: (e) => updateProject({ hyperlink: e.target.value }), placeholder: "https://...", className: "mt-1" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs17("div", { children: [
                  /* @__PURE__ */ jsx34(Label, { className: "text-sm font-semibold text-slate-900", children: "Installation Environment" }),
                  /* @__PURE__ */ jsx34("p", { className: "text-xs text-slate-500 mt-1 mb-2", children: "Where is this vinyl going to live? Drives default site conditions for the install tab." }),
                  /* @__PURE__ */ jsx34("div", { className: "grid grid-cols-2 gap-2 max-w-md", children: [
                    { value: "exterior", label: "Exterior", desc: "Outdoor wall, vehicle, storefront", color: "blue" },
                    { value: "interior", label: "Interior", desc: "Lobby, indoor wall, office", color: "amber" }
                  ].map((opt) => {
                    const active = (project.install_environment || "exterior") === opt.value;
                    const ringClass = opt.color === "blue" ? active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300" : active ? "border-amber-500 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300";
                    return /* @__PURE__ */ jsxs17(
                      "button",
                      {
                        type: "button",
                        onClick: () => updateProject({ install_environment: opt.value }),
                        className: `text-left p-3 rounded-lg border-2 transition-all ${ringClass}`,
                        children: [
                          /* @__PURE__ */ jsx34("div", { className: "text-sm font-semibold text-slate-800", children: opt.label }),
                          /* @__PURE__ */ jsx34("div", { className: "text-[11px] text-slate-500 mt-0.5 leading-tight", children: opt.desc })
                        ]
                      },
                      opt.value
                    );
                  }) })
                ] }),
                /* @__PURE__ */ jsxs17("div", { children: [
                  /* @__PURE__ */ jsxs17(Label, { className: "flex items-center gap-1.5", children: [
                    /* @__PURE__ */ jsx34(MapPin, { className: "w-3.5 h-3.5 text-blue-600" }),
                    "Site Address",
                    /* @__PURE__ */ jsx34("span", { className: "text-xs font-normal text-slate-500", children: "(used for travel mileage)" })
                  ] }),
                  /* @__PURE__ */ jsx34(
                    AddressAutocomplete_default,
                    {
                      value: project.site_address || "",
                      onChange: (val) => updateProject({ site_address: val }),
                      placeholder: "e.g., 123 Main St, Cincinnati, OH 45202",
                      className: "mt-1"
                    }
                  )
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs17(Card, { className: "bg-white border-0 shadow-sm", children: [
              /* @__PURE__ */ jsx34(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx34(CardTitle, { className: "text-lg", children: "Notes" }) }),
              /* @__PURE__ */ jsx34(CardContent, { children: /* @__PURE__ */ jsx34(Textarea, { value: project.notes || "", onChange: (e) => updateProject({ notes: e.target.value }), className: "h-32" }) })
            ] }),
            /* @__PURE__ */ jsx34("div", { className: "flex justify-end", children: /* @__PURE__ */ jsx34(Button, { onClick: () => setActiveTab("workflows"), className: "bg-blue-600 hover:bg-blue-700 text-white", children: "Continue to Vinyl Workflows \u2192" }) })
          ] }),
          /* @__PURE__ */ jsxs17(TabsContent, { value: "workflows", className: "mt-4 space-y-4", children: [
            /* @__PURE__ */ jsxs17("div", { className: "flex items-center justify-between bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm flex-wrap gap-2", children: [
              /* @__PURE__ */ jsx34("div", { className: "text-sm text-slate-600", children: "Add one workflow per vinyl type. Each workflow lays out on its own roll." }),
              /* @__PURE__ */ jsxs17("div", { className: "flex items-center gap-1 flex-wrap", children: [
                project.workflows.length > 1 && /* @__PURE__ */ jsx34(Button, { size: "sm", variant: "outline", onClick: () => setAllOpen((o) => !o), className: "h-8", children: allOpen ? /* @__PURE__ */ jsxs17(Fragment4, { children: [
                  /* @__PURE__ */ jsx34(ChevronsDownUp, { className: "w-3.5 h-3.5 mr-1" }),
                  " Collapse All"
                ] }) : /* @__PURE__ */ jsxs17(Fragment4, { children: [
                  /* @__PURE__ */ jsx34(ChevronsUpDown, { className: "w-3.5 h-3.5 mr-1" }),
                  " Expand All"
                ] }) }),
                /* @__PURE__ */ jsxs17(Button, { size: "sm", variant: "outline", onClick: () => {
                  setTargetWorkflowIdx(0);
                  setLibraryOpen(true);
                }, className: "h-8", children: [
                  /* @__PURE__ */ jsx34(BookmarkPlus, { className: "w-3.5 h-3.5 mr-1" }),
                  " Library"
                ] }),
                /* @__PURE__ */ jsxs17(Button, { size: "sm", variant: "outline", onClick: () => {
                  setTargetWorkflowIdx(0);
                  setBulkOpen(true);
                }, className: "h-8", children: [
                  /* @__PURE__ */ jsx34(ClipboardPaste, { className: "w-3.5 h-3.5 mr-1" }),
                  " Bulk Paste"
                ] }),
                /* @__PURE__ */ jsxs17(Button, { size: "sm", variant: "outline", onClick: () => {
                  setTargetWorkflowIdx(0);
                  setArtworkOpen(true);
                }, className: "h-8", children: [
                  /* @__PURE__ */ jsx34(UploadCloud, { className: "w-3.5 h-3.5 mr-1" }),
                  " Artwork"
                ] }),
                /* @__PURE__ */ jsxs17(Button, { size: "sm", onClick: addWorkflow, className: "bg-blue-600 hover:bg-blue-700 text-white h-8", children: [
                  /* @__PURE__ */ jsx34(Plus, { className: "w-4 h-4 mr-1" }),
                  " Workflow"
                ] })
              ] })
            ] }),
            workflowsHaveIssues && /* @__PURE__ */ jsxs17("div", { className: "flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2", children: [
              /* @__PURE__ */ jsx34(AlertTriangle, { className: "w-3.5 h-3.5" }),
              "One or more workflows have unplaced parts or missing vinyl selections \u2014 see the red badges below."
            ] }),
            vinyls.length === 0 && /* @__PURE__ */ jsx34(Card, { className: "bg-amber-50 border-amber-200", children: /* @__PURE__ */ jsxs17(CardContent, { className: "p-3 text-xs text-amber-900", children: [
              "Your vinyl inventory is empty.",
              " ",
              /* @__PURE__ */ jsx34(Link, { to: "/VinylInventory", className: "underline font-medium", children: "Add vinyl in Vinyl Inventory" }),
              " ",
              "to enable selection."
            ] }) }),
            project.workflows.map((wf, idx) => /* @__PURE__ */ jsx34(
              VinylWorkflowCard,
              {
                workflow: wf,
                index: idx,
                vinyls,
                machines,
                pricing: workflowPricing[idx],
                installEnvironment: project.install_environment,
                onChange: (next) => updateWorkflow(idx, next),
                onRemove: () => removeWorkflow(idx),
                onDuplicate: () => duplicateWorkflow(idx),
                onMovePartToWorkflow: project.workflows.length > 1 ? (partIdx) => setMoveContext({ workflowIdx: idx, partIdx }) : null,
                defaultOpen: allOpen
              },
              wf.id
            ))
          ] }),
          /* @__PURE__ */ jsxs17(TabsContent, { value: "install", className: "mt-4 space-y-3", children: [
            /* @__PURE__ */ jsx34(
              EquipmentSelector_default,
              {
                selectedEquipment: project.selected_equipment || [],
                onChange: (next) => updateProject({ selected_equipment: next }),
                equipmentInventory,
                items: [],
                projectLaborHours: totalLaborHours
              }
            ),
            /* @__PURE__ */ jsx34(
              PersonnelSelector_default,
              {
                personnel: project.personnel || [],
                onChange: (next) => updateProject({ personnel: next }),
                projectLaborHours: totalLaborHours,
                roleRates: {
                  "Crew Lead": parseFloat(settings.install_crew_lead_rate) || 75,
                  "Installer": parseFloat(settings.install_installer_rate) || 65,
                  "Helper": parseFloat(settings.install_helper_rate) || 35
                },
                items: []
              }
            ),
            equipmentInventory.length === 0 && /* @__PURE__ */ jsx34(Card, { className: "bg-amber-50 border-amber-200", children: /* @__PURE__ */ jsxs17(CardContent, { className: "p-3 text-xs text-amber-900", children: [
              "Your equipment inventory is empty.",
              " ",
              /* @__PURE__ */ jsx34(Link, { to: "/MasterInventory", className: "underline font-medium", children: "Add equipment in Master Inventory" }),
              " ",
              "to enable selection."
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs17(TabsContent, { value: "travel", className: "mt-4 space-y-3", children: [
            /* @__PURE__ */ jsx34(
              TravelCostCard_default,
              {
                shopAddress: settings.install_shop_address || "",
                siteAddress: project.site_address || "",
                selectedEquipment: project.selected_equipment || [],
                equipmentInventory,
                personnel: project.personnel || [],
                settings,
                travelMiles: project.travel_miles_round_trip || 0,
                onMilesChange: (miles) => updateProject({ travel_miles_round_trip: miles }),
                onTotalChange: (total) => {
                  if ((project.total_travel_cost || 0) !== total) updateProject({ total_travel_cost: total });
                },
                autoTriggerKey: activeTab === "travel" ? "travel" : null
              }
            ),
            /* @__PURE__ */ jsx34(Card, { className: "bg-slate-50 border-slate-200", children: /* @__PURE__ */ jsxs17(CardContent, { className: "p-3 text-xs text-slate-600", children: [
              "Travel rates (shop address, fuel prices, labor rate, overhead, minimum charge) are shared with the Channel Letter Install module \u2014",
              " ",
              /* @__PURE__ */ jsx34(Link, { to: "/InstallationSettings", className: "underline font-medium", children: "review Installation Settings" }),
              "."
            ] }) })
          ] }),
          /* @__PURE__ */ jsx34(TabsContent, { value: "summary", className: "mt-4 space-y-3", children: /* @__PURE__ */ jsxs17(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx34(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx34(CardTitle, { className: "text-lg", children: "Cost Breakdown" }) }),
            /* @__PURE__ */ jsx34(CardContent, { className: "text-sm space-y-3", children: /* @__PURE__ */ jsx34(BreakdownTable, { rollup, project, pricingUnavailable }) })
          ] }) }),
          /* @__PURE__ */ jsx34(TabsContent, { value: "pricing", className: "mt-4 space-y-3", children: /* @__PURE__ */ jsx34(
            CustomerPricingTab_default,
            {
              project: {
                ...project,
                // Feed live rollup totals so categorizer sees current numbers.
                // Held values surface as 0 here — this tab is advisory only;
                // the blocked save keeps them from reaching the record.
                total_vinyl_cost: rollup.vinylCost ?? 0,
                total_laminate_cost: rollup.laminateCost ?? 0,
                total_ink_cost: rollup.inkCost ?? 0,
                total_blade_cost: rollup.bladeCost ?? 0,
                total_machine_cost: rollup.machineCost ?? 0,
                total_supplies_cost: rollup.supplies ?? 0,
                labor_cost: rollup.laborCost ?? 0,
                total_personnel_cost: rollup.personnelCost ?? 0,
                total_equipment_cost: rollup.equipmentCost ?? 0,
                total_travel_cost: rollup.travelCost ?? 0
              },
              categorize: categorizeVinylProject,
              accentColor: "blue",
              onTierChange: (tier) => setProject((prev) => ({
                ...prev,
                customer_pricing: { ...prev.customer_pricing || {}, tier_number: tier }
              }))
            }
          ) })
        ] }) }),
        /* @__PURE__ */ jsxs17("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsx34(
            VinylProjectSummaryCard,
            {
              rollup,
              project,
              onUpdateProject: updateProject,
              onSave: save,
              isSaving: saving,
              pricingUnavailable,
              pricingBlocked,
              issues: allIssues,
              issuesId: "vinyl-pricing-issues"
            }
          ),
          /* @__PURE__ */ jsx34("div", { className: "flex flex-wrap gap-2", children: /* @__PURE__ */ jsx34(
            ModuleActionBar_default,
            {
              onTemplates: () => setTemplateMode("load"),
              onSaveAsTemplate: () => setTemplateMode("save"),
              onSaveAsCopy: handleSaveAsCopy,
              estimateId,
              saving
            }
          ) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx34(
      VinylBulkImportDialog_default,
      {
        open: bulkOpen,
        onClose: () => setBulkOpen(false),
        onImport: (parts) => importPartsToWorkflow(targetWorkflowIdx, parts)
      }
    ),
    /* @__PURE__ */ jsx34(
      VinylPartsLibraryDialog_default,
      {
        open: libraryOpen,
        onClose: () => setLibraryOpen(false),
        onPick: (part) => addPartToWorkflow(targetWorkflowIdx, part)
      }
    ),
    /* @__PURE__ */ jsx34(
      VinylArtworkUploadDialog_default,
      {
        open: artworkOpen,
        onClose: () => setArtworkOpen(false),
        onAdd: (part) => addPartToWorkflow(targetWorkflowIdx, part)
      }
    ),
    /* @__PURE__ */ jsx34(
      VinylMoveToWorkflowMenu_default,
      {
        open: !!moveContext,
        onClose: () => setMoveContext(null),
        workflows: project.workflows,
        currentWorkflowIdx: moveContext?.workflowIdx ?? -1,
        onMove: (toIdx) => {
          movePart(moveContext.workflowIdx, moveContext.partIdx, toIdx);
          setMoveContext(null);
        }
      }
    ),
    /* @__PURE__ */ jsx34(
      ModuleTemplateDialog_default,
      {
        open: !!templateMode,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => updateProject(data),
        moduleKey: "vinyl",
        title: "Vinyl",
        buildTemplateData: buildVinylTemplateData,
        describeTemplate: (t) => `${(t.project_data?.workflows || []).length} workflows`
      }
    )
  ] });
}
var moneyCell = (v) => hasVinylCostSnapshot(v) ? fmt7(v) : /* @__PURE__ */ jsx34("span", { className: "text-amber-700 font-medium", children: "Not saved" });
function BreakdownTable({ rollup, project, pricingUnavailable = false }) {
  const rows = [
    ["Vinyl", rollup.vinylCost],
    ["Laminate", rollup.laminateCost],
    ["Ink", rollup.inkCost],
    ["Blade Wear", rollup.bladeCost],
    ["Machine Time", rollup.machineCost],
    ["Labor", rollup.laborCost],
    ["Equipment", rollup.equipmentCost],
    ["Personnel", rollup.personnelCost],
    ["Travel", rollup.travelCost],
    ["Supplies", rollup.supplies]
  ];
  return /* @__PURE__ */ jsxs17("div", { children: [
    pricingUnavailable && /* @__PURE__ */ jsx34("p", { className: "text-[11px] text-amber-800 mb-2", children: "Saved amounts (not current pricing) \u2014 fix the flagged values to reprice." }),
    /* @__PURE__ */ jsx34("table", { className: "w-full", children: /* @__PURE__ */ jsxs17("tbody", { children: [
      rows.map(([label, value]) => /* @__PURE__ */ jsxs17("tr", { className: "border-t border-slate-100", children: [
        /* @__PURE__ */ jsx34("td", { className: "py-1.5 text-slate-600", children: label }),
        /* @__PURE__ */ jsx34("td", { className: "py-1.5 text-right tabular-nums", children: moneyCell(value) })
      ] }, label)),
      /* @__PURE__ */ jsxs17("tr", { className: "border-t border-slate-200", children: [
        /* @__PURE__ */ jsx34("td", { className: "py-1.5 font-semibold", children: "Subtotal" }),
        /* @__PURE__ */ jsx34("td", { className: "py-1.5 text-right tabular-nums font-semibold", children: moneyCell(rollup.subtotal) })
      ] }),
      /* @__PURE__ */ jsxs17("tr", { children: [
        /* @__PURE__ */ jsxs17("td", { className: "py-1.5 text-slate-600", children: [
          "Markup (",
          project.markup_percent || 0,
          "%)"
        ] }),
        /* @__PURE__ */ jsx34("td", { className: "py-1.5 text-right tabular-nums", children: moneyCell(rollup.markupAmount) })
      ] }),
      /* @__PURE__ */ jsxs17("tr", { className: "border-t-2 border-slate-300", children: [
        /* @__PURE__ */ jsx34("td", { className: "py-2 font-bold text-base", children: "Total" }),
        /* @__PURE__ */ jsx34("td", { className: "py-2 text-right tabular-nums font-bold text-base", children: moneyCell(rollup.totalCost) })
      ] })
    ] }) })
  ] });
}
export {
  VinylEstimator as Page
};
