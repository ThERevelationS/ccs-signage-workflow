// .audit-work/foundation-o029-cutschedule/candidate-tree-src/react-stub.js
var useMemo = (fn) => fn();
var useState = (v) => [v, () => {
}];
var useRef = (v) => ({ current: v });
var useEffect = () => {
};
var useCallback = (fn) => fn;
var useContext = () => ({});
var createContext = (v) => ({ Provider: "ContextProvider", Consumer: "ContextConsumer", _currentValue: v });
var Fragment = Symbol("Fragment");

// .audit-work/foundation-o029-cutschedule/verify/stubs/react-router-dom.js
var Link = (props) => ({ type: "link", props: props || {} });
var useNavigate = () => () => {
};

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/pages/FoundationEstimator.jsx
import { Input as Input3 } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// .audit-work/foundation-o029-cutschedule/verify/stubs/lucide-react.js
var icon = (name) => (props) => ({ type: "icon", props: { ...props || {}, icon: name } });
var Trash2 = icon("Trash2");
var Box = icon("Box");
var Copy = icon("Copy");
var Maximize2 = icon("Maximize2");
var RotateCcw = icon("RotateCcw");
var Eye = icon("Eye");
var EyeOff = icon("EyeOff");
var Plus = icon("Plus");
var Edit = icon("Edit");
var Package = icon("Package");
var Building2 = icon("Building2");
var Layers = icon("Layers");
var Wrench = icon("Wrench");
var Square = icon("Square");
var Loader2 = icon("Loader2");
var LogIn = icon("LogIn");
var AlertCircle = icon("AlertCircle");
var X = icon("X");
var CheckCircle = icon("CheckCircle");
var ChevronDown = icon("ChevronDown");
var Info = icon("Info");
var AlertTriangle = icon("AlertTriangle");
var Anchor = icon("Anchor");
var ArrowLeft = icon("ArrowLeft");
var ArrowLeftRight = icon("ArrowLeftRight");
var BookmarkPlus = icon("BookmarkPlus");
var ClipboardList = icon("ClipboardList");
var GitCompareArrows = icon("GitCompareArrows");
var HelpCircle = icon("HelpCircle");
var LayoutGrid = icon("LayoutGrid");
var LayoutTemplate = icon("LayoutTemplate");
var Link2 = icon("Link2");
var Redo2 = icon("Redo2");
var RefreshCw = icon("RefreshCw");
var Save = icon("Save");
var Tag = icon("Tag");
var Trees = icon("Trees");
var TrendingUp = icon("TrendingUp");
var Undo2 = icon("Undo2");

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationItemCard.jsx
import { Input } from "@/components/ui/input";

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/masterInventory/inventoryNormalization.js
var STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string" || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number3 = Number(value);
  return Number.isFinite(number3) ? number3 : null;
};
var inventoryFiniteNumber = (value) => strictNumber(value);
var inventoryNonnegativeNumber = (value) => {
  const number3 = strictNumber(value);
  return number3 !== null && number3 >= 0 ? number3 : null;
};
var inventoryPositiveNumber = (value) => {
  const number3 = strictNumber(value, { unsignedExponent: true });
  return number3 !== null && number3 > 0 ? number3 : null;
};
var inventoryNonnegativeMeasurement = (value) => {
  const number3 = strictNumber(value, { unsignedExponent: true });
  return number3 !== null && number3 >= 0 ? number3 : null;
};
var inventoryIsPositiveWhole = (value) => {
  const number3 = inventoryFiniteNumber(value);
  const whole3 = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole3 && Number.isSafeInteger(number3) && number3 > 0;
};
var inventorySettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
var inventorySettingNumber = (value, fallback) => inventoryNonnegativeNumber(inventorySettingValue(value, fallback));
var inventoryPositiveSettingNumber = (value, fallback) => inventoryPositiveNumber(inventorySettingValue(value, fallback));
var inventoryNumberInput = (value) => String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;
var FOUNDATION_MATERIAL_TYPE_ALIASES = {
  forming: "forming_material"
};
var FOUNDATION_FIELD_ALIASES = [
  ["wall_unit_length_inches", "brick_length_inches"],
  ["wall_unit_width_inches", "brick_width_inches"],
  ["wall_unit_height_inches", "brick_height_inches"]
];
var FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES = {
  brick: "brick",
  clay_brick: "brick",
  face_brick: "brick",
  veneer_brick: "brick",
  cinderblock: "cinderblock",
  cinder_block: "cinderblock",
  cmu: "cinderblock",
  concrete_block: "cinderblock",
  cement_block: "cinderblock",
  concrete_masonry_unit: "cinderblock",
  masonry_block: "cinderblock",
  block: "cinderblock",
  stone: "stone",
  natural_stone: "stone",
  cut_stone: "stone",
  stone_veneer: "stone",
  veneer_stone: "stone",
  limestone: "stone",
  sandstone: "stone",
  concrete: "concrete",
  poured_concrete: "concrete",
  poured: "concrete",
  poured_in_place: "concrete",
  cast_in_place: "concrete",
  cast_in_place_concrete: "concrete",
  monolithic_concrete: "concrete"
};
var wallMaterialSubtypeKey = (value) => typeof value === "string" ? value.trim().toLowerCase().replace(/[\s\-_]+/g, "_") : null;
var wallMaterialSubtypeRecorded = (value) => value !== void 0 && value !== null && (typeof value !== "string" || value.trim() !== "");
var canonicalWallMaterialSubtype = (value) => {
  if (!wallMaterialSubtypeRecorded(value)) return null;
  const key = wallMaterialSubtypeKey(value);
  return key ? FOUNDATION_WALL_MATERIAL_SUBTYPE_ALIASES[key] ?? null : null;
};
var INCHES_PER_FOOT = 12;
function normalizeFoundationInventoryRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out = { ...row };
  const canonicalType = FOUNDATION_MATERIAL_TYPE_ALIASES[out.material_type];
  if (canonicalType) out.material_type = canonicalType;
  for (const [canonical, legacy] of FOUNDATION_FIELD_ALIASES) {
    if (out[canonical] === void 0 && out[legacy] !== void 0) {
      out[canonical] = out[legacy];
    }
  }
  if (out.pole_stock_length_ft === void 0 && out.pole_stock_length_inches !== void 0) {
    const stockLengthInches = inventoryPositiveNumber(out.pole_stock_length_inches);
    if (stockLengthInches !== null) out.pole_stock_length_ft = stockLengthInches / INCHES_PER_FOOT;
  }
  const canonicalSubtype = canonicalWallMaterialSubtype(out.wall_material_subtype);
  if (canonicalSubtype !== null) out.wall_material_subtype = canonicalSubtype;
  if (out.supplier_key === void 0) {
    const key = inventorySupplierKey(out.supplier);
    if (key !== null) out.supplier_key = key;
  }
  return out;
}
var normalizeFoundationInventoryRows = (rows) => Array.isArray(rows) ? rows.map(normalizeFoundationInventoryRow) : rows;
var inventorySupplierKey = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s\-_.]+/g, "_");
  return key === "" ? null : key;
};
var normalizeConcreteSupplier = (row) => ({
  id: row.id,
  material_name: row.service_name,
  material_description: row.description || "",
  material_type: "concrete_service",
  supplier: row.vendor_name || row.service_name,
  // Canonical supplier-group key — the explicit grouping the catalog UX
  // renders and the delivery-side remainder can group on. Null when the row
  // carries no recorded vendor (the unassigned group).
  supplier_key: inventorySupplierKey(row.vendor_name || row.service_name),
  cost_per_unit: inventoryNonnegativeNumber(row.default_rate),
  unit: "cy",
  minimum_order_yards: inventoryNonnegativeNumber(row.minimum_order_yards),
  below_minimum_cost_per_cy: inventoryNonnegativeNumber(row.below_minimum_cost_per_cy),
  minimum_cost: inventoryNonnegativeNumber(row.minimum_charge),
  mix_3500_price: row.mix_3500_price ?? null,
  mix_4000_price: row.mix_4000_price ?? null,
  mix_4500_price: row.mix_4500_price ?? null,
  mix_5000_price: row.mix_5000_price ?? null,
  mix_fast_set_price: row.mix_fast_set_price ?? null,
  admix_calcium_chloride_price: row.admix_calcium_chloride_price ?? null,
  admix_set_retarding_price: row.admix_set_retarding_price ?? null,
  admix_water_reducing_price: row.admix_water_reducing_price ?? null,
  admix_fibers_price: row.admix_fibers_price ?? null,
  admix_winter_service_price: row.admix_winter_service_price ?? null,
  small_load_fee_1_1_75: row.small_load_fee_1_1_75 ?? null,
  small_load_fee_2_2_75: row.small_load_fee_2_2_75 ?? null,
  small_load_fee_3_3_75: row.small_load_fee_3_3_75 ?? null,
  small_load_fee_4_4_25: row.small_load_fee_4_4_25 ?? null,
  small_load_fee_4_5_4_75: row.small_load_fee_4_5_4_75 ?? null,
  fuel_surcharge: row.fuel_surcharge ?? null,
  show_in_foundation: row.show_in_foundation !== false,
  _source: "labor_services"
});

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/legacyFoundationCalc.js
var itemSettingConsumption = (item) => {
  const has = (v) => v !== void 0 && v !== null;
  const consumed = [["foundation_pouring_cost_per_cy", 15, "pouring labor cost per CY"]];
  const laborDivides = Boolean(item?.include_finishing) && !has(item?.custom_finishing_hours);
  if (!has(item?.custom_excavation_rate) || item?.include_rebar || item?.include_finishing && (!has(item?.custom_finishing_rate) || !has(item?.custom_finishing_hours))) {
    consumed.push(["foundation_main_labor_rate", 60, laborDivides ? "positive main labor rate" : "main labor rate", laborDivides]);
  }
  if (item?.include_rebar) {
    consumed.push(
      ["foundation_rebar_time_cross_section", 0.05, "rebar time per intersection"],
      ["foundation_rebar_time_linear_ft", 0.02, "rebar time per linear foot"]
    );
  }
  if (item?.include_forming) {
    consumed.push(
      ["foundation_forming_cost_per_sqft", 2.5, "forming labor cost per sq ft"],
      item?.foundation_type === "spread_foot" ? ["foundation_forming_materials_spread_foot", 0.5, "spread-foot forming materials multiplier"] : ["foundation_forming_materials_pillar", 0.75, "pillar forming materials multiplier"]
    );
  }
  if (item?.include_finishing && !has(item?.custom_finishing_hours)) {
    consumed.push(["foundation_finishing_cost_per_sqft", 1.25, "finishing labor cost per sq ft"]);
  }
  if (!has(item?.custom_excavation_hours)) {
    consumed.push(
      item?.excavation_method === "hand_dig" || !item?.excavation_method ? ["foundation_hand_dig_time_per_cy", 2, "hand excavation time per CY"] : ["foundation_equipment_excavation_time_per_cy", 0.5, "equipment excavation time per CY"]
    );
  }
  return consumed;
};
var foundationItemSettingIssues = (item, settings = {}, index = 0) => {
  const issues = [];
  for (const [key, fallback, label, positive6] of itemSettingConsumption(item)) {
    const number3 = inventorySettingNumber(settings?.[key], fallback);
    if (number3 === null || positive6 && number3 <= 0) {
      issues.push({
        kind: "foundation",
        index,
        componentId: item?.component_id ?? null,
        field: key,
        inventoryId: null,
        code: "foundation_setting_unavailable",
        message: `Foundation ${index + 1}: record a finite, ${positive6 ? "positive" : "nonnegative"} ${label.replace(/^positive /, "")} in Estimator Settings before repricing.`
      });
    }
  }
  return issues;
};
var getConcreteMixes = (invItem) => [
  { id: "3500_ae", name: "3500 AIR ENTRAINED (AE)", price: inventoryNonnegativeNumber(invItem?.mix_3500_price), field: "mix_3500_price", desc: "Often used for driveways, slabs, and moderate-load footings." },
  { id: "4000_ae", name: "4000 AIR ENTRAINED (AE)", price: inventoryNonnegativeNumber(invItem?.mix_4000_price), field: "mix_4000_price", desc: "STANDARD. Used for sign foundations, commercial flatwork, and structural footings requiring good durability." },
  { id: "4500_ae", name: "4500 AIR ENTRAINED (AE)", price: inventoryNonnegativeNumber(invItem?.mix_4500_price), field: "mix_4500_price", desc: "Used for heavy-duty commercial slabs and heavy traffic areas." },
  { id: "5000_ae", name: "5000 AIR ENTRAINED (AE)", price: inventoryNonnegativeNumber(invItem?.mix_5000_price), field: "mix_5000_price", desc: "High-strength mix for heavy structural columns, pillars, and extreme load conditions." },
  { id: "fast_set", name: "FAST SET", price: inventoryNonnegativeNumber(invItem?.mix_fast_set_price), field: "mix_fast_set_price", desc: "Quick-curing concrete used when rapid strength gain is needed to minimize downtime." }
];
var getConcreteAdmixtures = (invItem) => [
  { id: "calcium_chloride", name: "Calcium Chloride", price: inventoryNonnegativeNumber(invItem?.admix_calcium_chloride_price), field: "admix_calcium_chloride_price", desc: "Speeds up how fast the concrete dries. SELECT THIS when pouring in cold weather so it doesn't freeze before it sets. WARNING: Do NOT select this if using Rebar, as it causes rust!" },
  { id: "set_retarding", name: "Set-Retarding Admix (Type D)", price: inventoryNonnegativeNumber(invItem?.admix_set_retarding_price), field: "admix_set_retarding_price", desc: "Slows down how fast the concrete dries. SELECT THIS when pouring in very hot weather, or if the concrete truck has a very long drive to the site." },
  { id: "water_reducing", name: "Water-Reducing Admix (Type A)", price: inventoryNonnegativeNumber(invItem?.admix_water_reducing_price), field: "admix_water_reducing_price", desc: "Makes the concrete easier to pour without weakening it. SELECT THIS if you need the concrete to flow better into tight forms or around lots of rebar." },
  { id: "fibers", name: "Fibers", price: inventoryNonnegativeNumber(invItem?.admix_fibers_price), field: "admix_fibers_price", desc: "Tiny fibers mixed into the concrete to prevent small cracks. SELECT THIS for large flat slabs (like monument sign pads) or if the foundation will take physical abuse." },
  { id: "winter_service", name: "Winter Service", price: inventoryNonnegativeNumber(invItem?.admix_winter_service_price), field: "admix_winter_service_price", desc: "A fee the plant charges to use hot water so the mix doesn't freeze. SELECT THIS always during winter months when temperatures are freezing." }
];
var getSmallLoadFee = (yards, invItem) => {
  if (yards >= 5) return 0;
  if (yards >= 4.5) return inventoryNonnegativeNumber(invItem?.small_load_fee_4_5_4_75);
  if (yards >= 4) return inventoryNonnegativeNumber(invItem?.small_load_fee_4_4_25);
  if (yards >= 3) return inventoryNonnegativeNumber(invItem?.small_load_fee_3_3_75);
  if (yards >= 2) return inventoryNonnegativeNumber(invItem?.small_load_fee_2_2_75);
  if (yards >= 1) return inventoryNonnegativeNumber(invItem?.small_load_fee_1_1_75);
  return inventoryNonnegativeNumber(invItem?.small_load_fee_1_1_75);
};
var getFuelSurcharge = (invItem) => {
  return inventoryNonnegativeNumber(invItem?.fuel_surcharge);
};
var calcItemCost = (item, inventory = [], settings = {}) => {
  const getSetting = (key, def) => parseFloat(inventorySettingValue(settings[key], def));
  const selectedConcrete = inventory.find((c) => c.id === item.selected_concrete_id);
  const conc_cost = item.custom_concrete_cost_per_cy !== null && item.custom_concrete_cost_per_cy !== void 0 ? item.custom_concrete_cost_per_cy : selectedConcrete?.cost_per_unit || 0;
  const selectedRebar = inventory.find((r) => r.material_type === "rebar" && r.rebar_size === item.rebar_size);
  const pillarSelectedRebar = inventory.find((r) => r.material_type === "rebar" && r.rebar_size === (item.pillar_rebar_size || "#4"));
  const activeRebar = item.foundation_type === "spread_foot" ? selectedRebar : pillarSelectedRebar;
  const rebar_cost = item.custom_rebar_cost_per_ft !== null && item.custom_rebar_cost_per_ft !== void 0 ? item.custom_rebar_cost_per_ft : activeRebar?.cost_per_unit || 0;
  const main_labor_rate = getSetting("foundation_main_labor_rate", 60);
  const rebar_time_cross_section = getSetting("foundation_rebar_time_cross_section", 0.05);
  const rebar_time_linear_ft = getSetting("foundation_rebar_time_linear_ft", 0.02);
  const forming_cost_per_sqft = getSetting("foundation_forming_cost_per_sqft", 2.5);
  const pouring_cost_per_cy = getSetting("foundation_pouring_cost_per_cy", 15);
  const finishing_cost_per_sqft = getSetting("foundation_finishing_cost_per_sqft", 1.25);
  const forming_mult = item.foundation_type === "spread_foot" ? getSetting("foundation_forming_materials_spread_foot", 0.5) : getSetting("foundation_forming_materials_pillar", 0.75);
  let baseVolumeCY = 0;
  const lenIn = parseFloat(item.length_inches) || 0;
  const widIn = parseFloat(item.width_inches) || 0;
  const depIn = parseFloat(item.depth_inches) || 0;
  const diaIn = parseFloat(item.diameter) || 0;
  if (item.foundation_type === "spread_foot") {
    baseVolumeCY = lenIn / 12 * (widIn / 12) * (depIn / 12) / 27;
  } else {
    const r = diaIn / 2 / 12;
    baseVolumeCY = Math.PI * r * r * (depIn / 12) / 27;
  }
  baseVolumeCY = baseVolumeCY * (item.quantity || 1);
  const volumeCY = item.custom_concrete_qty !== null && item.custom_concrete_qty !== void 0 ? item.custom_concrete_qty : baseVolumeCY;
  let concreteCost = 0;
  let baseBags = null;
  let concreteBags = null;
  if (selectedConcrete?.material_type === "bagged_concrete") {
    baseBags = Math.ceil(baseVolumeCY * 45);
    concreteBags = item.custom_concrete_qty !== null && item.custom_concrete_qty !== void 0 ? item.custom_concrete_qty : baseBags;
    concreteCost = concreteBags * conc_cost;
  }
  let rebarCost = 0;
  let baseRebarFt = 0;
  let totalIntersections = 0;
  if (item.include_rebar && item.foundation_type === "spread_foot") {
    const nBarsL = Math.floor(widIn / (parseFloat(item.rebar_spacing_width) || 12)) + 1;
    const nBarsW = Math.floor(lenIn / (parseFloat(item.rebar_spacing_length) || 12)) + 1;
    const layers = parseInt(item.rebar_layers) || 1;
    const horizontalFt = (nBarsL * (lenIn / 12) + nBarsW * (widIn / 12)) * layers;
    const numIntersections = nBarsL * nBarsW * layers;
    const verticalLengthFt = Math.max(0, depIn - 6) / 12;
    const verticalFt = numIntersections * verticalLengthFt;
    baseRebarFt = (horizontalFt + verticalFt) * (parseInt(item.quantity) || 1);
    totalIntersections = numIntersections * (parseInt(item.quantity) || 1);
  } else if (item.include_rebar && item.foundation_type === "pillar") {
    const hoopDia = parseFloat(item.pillar_rebar_hoop_diameter) || Math.max(0, diaIn - 4);
    const safeHoopDia = Math.min(hoopDia, Math.max(0, diaIn - 4));
    const layers = parseInt(item.pillar_rebar_layers) || 1;
    const verticalCount = parseInt(item.pillar_vertical_rebar_count) || 4;
    const hoopLengthFt = Math.PI * safeHoopDia / 12;
    const totalHoopFt = hoopLengthFt * layers;
    const verticalLengthFt = Math.max(0, depIn - 6) / 12;
    const totalVerticalFt = verticalCount * verticalLengthFt;
    baseRebarFt = (totalHoopFt + totalVerticalFt) * (parseInt(item.quantity) || 1);
    totalIntersections = layers * verticalCount * (parseInt(item.quantity) || 1);
  }
  const rebarFt = item.custom_rebar_qty !== null && item.custom_rebar_qty !== void 0 ? item.custom_rebar_qty : baseRebarFt;
  if (item.include_rebar) {
    const materialCost = rebarFt * rebar_cost;
    const totalTimeHours = totalIntersections * rebar_time_cross_section + rebarFt * rebar_time_linear_ft;
    const laborCost = totalTimeHours * main_labor_rate;
    rebarCost = materialCost + laborCost;
  }
  let formingCost = 0;
  let baseFormingQty = 0;
  const selectedForming = inventory.find((i) => i.id === item.selected_forming_id);
  const forming_rate = item.custom_forming_rate !== null && item.custom_forming_rate !== void 0 ? item.custom_forming_rate : selectedForming?.cost_per_unit || 0;
  if (item.include_forming) {
    const perim = item.foundation_type === "spread_foot" ? 2 * (lenIn + widIn) / 12 : Math.PI * diaIn / 12;
    const formingAreaSqFt = perim * (depIn / 12);
    baseFormingQty = Math.ceil(perim / 16) * (parseInt(item.quantity) || 1);
    const formingQty = item.custom_forming_qty !== null && item.custom_forming_qty !== void 0 ? item.custom_forming_qty : baseFormingQty;
    const formingMaterialCost = formingQty * forming_rate;
    const laborCost = formingAreaSqFt * (parseInt(item.quantity) || 1) * forming_cost_per_sqft;
    formingCost = laborCost + formingMaterialCost + concreteCost * forming_mult;
  }
  let finishingCost = 0;
  let baseFinishingHours = 0;
  const finishing_rate = item.custom_finishing_rate !== null && item.custom_finishing_rate !== void 0 ? item.custom_finishing_rate : main_labor_rate;
  if (item.include_finishing) {
    const topArea = item.foundation_type === "spread_foot" ? lenIn * widIn / 144 : Math.PI * (diaIn / 2 / 12) ** 2;
    const defaultFinishingCost = topArea * (parseInt(item.quantity) || 1) * finishing_cost_per_sqft;
    baseFinishingHours = defaultFinishingCost / main_labor_rate;
    const finishingHours = item.custom_finishing_hours !== null && item.custom_finishing_hours !== void 0 ? item.custom_finishing_hours : baseFinishingHours;
    finishingCost = finishingHours * finishing_rate;
  }
  const pouringCost = volumeCY * pouring_cost_per_cy;
  let excavationCost = 0;
  let baseExcavationHours = 0;
  const excVol = volumeCY * 1.25;
  if (item.excavation_method === "hand_dig" || !item.excavation_method) {
    const timePerCy = getSetting("foundation_hand_dig_time_per_cy", 2);
    baseExcavationHours = excVol * timePerCy;
  } else {
    const timePerCy = getSetting("foundation_equipment_excavation_time_per_cy", 0.5);
    baseExcavationHours = excVol * timePerCy;
  }
  const excavationHours = item.custom_excavation_hours !== null && item.custom_excavation_hours !== void 0 ? item.custom_excavation_hours : baseExcavationHours;
  const excavation_rate = item.custom_excavation_rate !== null && item.custom_excavation_rate !== void 0 ? item.custom_excavation_rate : main_labor_rate;
  excavationCost = excavationHours * excavation_rate;
  return {
    concreteCost,
    concreteBags,
    volumeCY,
    baseVolumeCY,
    baseBags,
    rebarCost,
    rebarFt,
    baseRebarFt,
    formingCost,
    formingQty: item.custom_forming_qty !== null && item.custom_forming_qty !== void 0 ? item.custom_forming_qty : baseFormingQty,
    baseFormingQty,
    finishingCost,
    finishingHours: item.custom_finishing_hours !== null && item.custom_finishing_hours !== void 0 ? item.custom_finishing_hours : baseFinishingHours,
    baseFinishingHours,
    pouringCost,
    excavationCost,
    excavationHours,
    baseExcavationHours,
    concreteRate: conc_cost,
    rebarRate: rebar_cost,
    formingRate: forming_rate,
    finishingRate: finishing_rate,
    excavationRate: excavation_rate,
    selectedConcreteName: selectedConcrete?.material_name || "",
    selectedRebarName: activeRebar?.material_name || "",
    selectedFormingName: selectedForming?.material_name || "",
    total: concreteCost + rebarCost + formingCost + finishingCost + pouringCost + excavationCost
  };
};
var calcConcreteDelivery = (project, items = [], inventory = []) => {
  const concreteServiceItems = items.filter((item) => {
    const inv = inventory.find((i) => i.id === item.selected_concrete_id);
    return !inv || inv.material_type === "concrete_service";
  });
  const totalConcreteYards = concreteServiceItems.reduce((sum, item) => sum + calcItemCost(item, inventory, project.settings || {}).volumeCY, 0);
  const roundedYards = Math.ceil(totalConcreteYards * 4) / 4;
  const firstConcreteItem = concreteServiceItems.find((i) => inventory.find((inv) => inv.id === i.selected_concrete_id)?.material_type === "concrete_service");
  const firstConcreteInv = firstConcreteItem ? inventory.find((inv) => inv.id === firstConcreteItem.selected_concrete_id) : null;
  const availableMixes = getConcreteMixes(firstConcreteInv);
  const availableAdmixes = getConcreteAdmixtures(firstConcreteInv);
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "concrete_delivery",
    index: null,
    componentId: null,
    field,
    inventoryId: firstConcreteInv?.id ?? null,
    code,
    message: `Concrete delivery: ${message}.`
  });
  const mix = availableMixes.find((m) => m.id === project.project_concrete_type) || availableMixes.find((m) => m.id === "4000_ae");
  if (roundedYards > 0) {
    if (firstConcreteInv === null) {
      add(
        "selected_concrete_id",
        "supplier_unavailable",
        "no ready-mix concrete supplier is assigned \u2014 select a supplier with catalog prices before repricing"
      );
    } else {
      if (project.project_concrete_type && !availableMixes.some((m) => m.id === project.project_concrete_type)) {
        add(
          "project_concrete_type",
          "supplier_price_unavailable",
          "the saved mix selection is not in the supplier catalog \u2014 pick a listed mix before repricing"
        );
      }
      if (!mix || inventoryNonnegativeNumber(mix.price) === null) {
        add(
          mix?.field || "mix_price",
          "supplier_price_unavailable",
          `record a finite, nonnegative ${mix?.name || "selected mix"} price on the concrete supplier before repricing`
        );
      }
      for (const admixId of project.project_concrete_admixtures || []) {
        const admix = availableAdmixes.find((x) => x.id === admixId);
        if (!admix) {
          add(
            "project_concrete_admixtures",
            "supplier_price_unavailable",
            "the saved admixture selection is not in the supplier catalog \u2014 pick a listed admixture before repricing"
          );
        } else if (inventoryNonnegativeNumber(admix.price) === null) {
          add(
            admix.field || "admix_price",
            "supplier_price_unavailable",
            `record a finite, nonnegative ${admix.name} price on the concrete supplier before repricing`
          );
        }
      }
      if (inventoryNonnegativeNumber(firstConcreteInv.fuel_surcharge) === null) {
        add(
          "fuel_surcharge",
          "supplier_price_unavailable",
          "record a finite, nonnegative fuel surcharge on the concrete supplier before repricing"
        );
      }
      let scanYards = roundedYards;
      while (scanYards > 0) {
        const truckYards = Math.min(scanYards, 9);
        scanYards -= truckYards;
        const roundedTruckYards = Math.ceil(truckYards * 4) / 4;
        if (getSmallLoadFee(roundedTruckYards, firstConcreteInv) === null) {
          add(
            "small_load_fee",
            "supplier_price_unavailable",
            `record a finite, nonnegative small-load fee for the ${roundedTruckYards} CY truck bracket on the concrete supplier before repricing`
          );
          break;
        }
      }
    }
  }
  if (issues.length) {
    return {
      pricingUnavailable: true,
      issues,
      concreteTotal: null,
      roundedYards,
      ratePerYard: null,
      trucksList: [],
      additionalStopsCost: null,
      availableMixes,
      availableAdmixes
    };
  }
  const mixPrice = mix ? mix.price : 201;
  const admixPrice = (project.project_concrete_admixtures || []).reduce((sum, admixId) => {
    const a = availableAdmixes.find((x) => x.id === admixId);
    return sum + (a ? a.price : 0);
  }, 0);
  const ratePerYard = mixPrice + admixPrice;
  let concreteTotal = 0;
  let remainingYards = roundedYards;
  const trucksList = [];
  const fuelSurcharge = getFuelSurcharge(firstConcreteInv);
  while (remainingYards > 0) {
    const truckYards = Math.min(remainingYards, 9);
    remainingYards -= truckYards;
    const roundedTruckYards = Math.ceil(truckYards * 4) / 4;
    const smallOrderFee = getSmallLoadFee(roundedTruckYards, firstConcreteInv);
    const fuelFee = fuelSurcharge;
    const truckCost = roundedTruckYards * ratePerYard + smallOrderFee + fuelFee;
    trucksList.push({ yards: truckYards, roundedYards: roundedTruckYards, cost: truckCost, smallOrderFee, fuelFee });
    concreteTotal += truckCost;
  }
  const newSignLocationsCount = items.filter((i) => i.is_new_sign_location).length;
  const additionalStopsCost = newSignLocationsCount * 100;
  concreteTotal += additionalStopsCost;
  return { issues, concreteTotal, roundedYards, ratePerYard, trucksList, additionalStopsCost, availableMixes, availableAdmixes };
};

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationEquipmentBindings.js
var num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var assigned = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
function resolveFoundationEquipment(entry = {}, inventory = [], index = 0) {
  const source = entry || {};
  const equipment = inventory.find((row) => row.id === source.equipment_id);
  let attachmentMode = "none";
  let attachmentRows = [];
  if (source.attachments?.length) {
    attachmentMode = "normalized";
    attachmentRows = source.attachments.map((row, rowIndex) => {
      const id = row.id || row.inventory_id;
      return {
        id,
        quantity: row.qty ?? 1,
        sourceRecord: row,
        rowIndex,
        field: "attachments",
        inventory: inventory.find((item) => item.id === id)
      };
    });
  } else if (source.attachment_counts) {
    attachmentMode = "counts";
    attachmentRows = Object.entries(source.attachment_counts).map(([id, quantity3], rowIndex) => ({
      id,
      quantity: num(quantity3),
      rowIndex,
      field: "attachment_counts",
      inventory: inventory.find((item) => item.id === id && item.material_type === "attachment")
    }));
  } else if (source.attachment_ids?.length) {
    attachmentMode = "legacy_ids";
    attachmentRows = source.attachment_ids.map((id, rowIndex) => ({
      id,
      quantity: 1,
      rowIndex,
      field: "attachment_ids",
      inventory: inventory.find((item) => item.id === id && item.material_type === "attachment")
    }));
  }
  const subAttachmentRows = Object.entries(source.sub_attachment_counts || {}).map(([id, quantity3], rowIndex) => ({
    id,
    quantity: num(quantity3),
    rowIndex,
    field: "sub_attachment_counts",
    inventory: inventory.find((item) => item.id === id && item.material_type === "sub_attachment")
  }));
  const issues = [];
  const check = (id, record, kind, field) => {
    if (assigned(id) && record) {
      const availability = foundationCatalogRowAvailability(record);
      if (availability === "active") return;
      issues.push({
        kind,
        index,
        componentId: source.component_id ?? source._id ?? null,
        field,
        inventoryId: id,
        code: availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        message: `Equipment ${index + 1}: ${kind.replaceAll("_", " ")} ${String(id)} is ${availability === "deleted" ? "marked deleted \u2014 pick a replacement" : "inactive \u2014 reactivate it or pick a replacement"}.`
      });
      return;
    }
    const hasSelection = assigned(id);
    issues.push({
      kind,
      index,
      componentId: source.component_id ?? source._id ?? null,
      field,
      inventoryId: hasSelection ? id : null,
      code: hasSelection ? "catalog_item_unavailable" : "catalog_item_unassigned",
      message: `Equipment ${index + 1}: ${hasSelection ? `${kind.replaceAll("_", " ")} ${String(id)} is unavailable` : `select a catalog ${kind.replaceAll("_", " ")}`}.`
    });
  };
  check(source.equipment_id, equipment, "equipment", "equipment_id");
  for (const row of attachmentRows) {
    if (attachmentMode === "normalized" || row.quantity !== 0) {
      check(row.id, row.inventory, "attachment", row.field);
    }
  }
  for (const row of subAttachmentRows) {
    if (row.quantity !== 0) check(row.id, row.inventory, "sub_attachment", row.field);
  }
  return { equipment, attachmentMode, attachmentRows, subAttachmentRows, issues };
}
function foundationEquipmentCatalogIssues(entries = [], inventory = []) {
  return entries.flatMap((entry, index) => resolveFoundationEquipment(entry, inventory, index).issues);
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/wallCapCalculator.js
function wallCapCutLengthValue(cap) {
  if (!cap || typeof cap !== "object" || Array.isArray(cap)) return void 0;
  return Object.prototype.hasOwnProperty.call(cap, "length_inches") ? cap.length_inches : cap.cut_length_inches;
}
var known = (value) => typeof value === "number" && Number.isFinite(value);
var assigned2 = (id) => typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
var sumKnown = (rows) => {
  let total = 0;
  for (const row of rows) {
    if (!known(row.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
};
function calcWallCaps(wallCaps = [], inventory = [], options = {}) {
  const issues = [];
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedCaps");
  const currentIds = /* @__PURE__ */ new Map();
  const savedCaps = /* @__PURE__ */ new Map();
  const componentId = (cap) => typeof cap?.component_id === "string" && cap.component_id.trim() !== "" ? cap.component_id : null;
  if (explicitSnapshot) {
    for (const cap of wallCaps || []) {
      const id = componentId(cap);
      if (id !== null) currentIds.set(id, (currentIds.get(id) || 0) + 1);
    }
    for (const cap of Array.isArray(options.savedCaps) ? options.savedCaps : []) {
      const id = componentId(cap);
      if (id !== null) savedCaps.set(id, savedCaps.has(id) ? null : cap);
    }
  }
  const held = (cap) => {
    const result = { ...cap };
    if (!explicitSnapshot) return result;
    const id = componentId(cap);
    const saved = id !== null && currentIds.get(id) === 1 ? savedCaps.get(id) : null;
    for (const field of ["cost", "cap_name", "stock_length_inches"]) {
      if (saved && Object.prototype.hasOwnProperty.call(saved, field)) result[field] = saved[field];
      else delete result[field];
    }
    return result;
  };
  const caps = (wallCaps || []).map((cap, index) => {
    const id = cap.cap_inventory_id;
    const issue = (field, code, message) => issues.push({
      kind: "wall_cap",
      index,
      componentId: cap.component_id ?? cap.id ?? null,
      field,
      inventoryId: assigned2(id) ? id : null,
      code,
      message: `Wall cap ${index + 1}: ${message}`
    });
    const matches = assigned2(id) ? inventory.filter((row) => row?.id === id) : [];
    if (matches.length !== 1) {
      issue(
        "cap_inventory_id",
        !assigned2(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
        !assigned2(id) ? "select a catalog material." : matches.length > 1 ? "the selected catalog ID is ambiguous; refresh the catalog." : "selected catalog material is unavailable."
      );
      return held(cap);
    }
    const inv = matches[0];
    if (inv.material_type !== "wall_cap") {
      issue("cap_inventory_id", "catalog_item_type_mismatch", "the selected catalog material is not a wall cap.");
      return held(cap);
    }
    const availability = foundationCatalogRowAvailability(inv);
    if (availability !== "active") {
      issue(
        "cap_inventory_id",
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted" ? "the selected catalog material is marked deleted \u2014 pick a replacement." : "the selected catalog material is inactive \u2014 reactivate it or pick a replacement."
      );
      return held(cap);
    }
    const firstIssue = issues.length;
    const rate = inventoryFiniteNumber(inv.cap_stock_price);
    if (rate === null || rate < 0) {
      issue(
        "cap_stock_price",
        "wall_cap_stock_price_unavailable",
        "record a finite nonnegative full-stock price; a missing price is not zero. Saved amounts are retained."
      );
    }
    const stockLength = inventoryFiniteNumber(inv.cap_stock_length_inches);
    const cutLength = inventoryFiniteNumber(wallCapCutLengthValue(cap));
    if (stockLength === null || stockLength <= 0) {
      issue(
        "cap_stock_length_inches",
        "wall_cap_stock_length_unavailable",
        "the selected catalog stock length must be a recorded finite positive number. Saved dimensions are not a current stock specification."
      );
    }
    if (cutLength === null || cutLength <= 0) {
      issue(
        "length_inches",
        "wall_cap_cut_length_invalid",
        "enter a finite positive cut length in inches. An empty or invalid cut is not changed to a default size."
      );
    } else if (stockLength !== null && stockLength > 0 && cutLength > stockLength) {
      issue(
        "length_inches",
        "wall_cap_cut_exceeds_stock",
        `cut length (${cutLength} in) exceeds the selected stock length (${stockLength} in). Choose longer stock or separate pieces; no extra quantity is assumed.`
      );
    }
    if (issues.length !== firstIssue) return held(cap);
    return {
      ...cap,
      cap_name: inv.material_name || "",
      stock_length_inches: stockLength,
      cost: rate
    };
  });
  const groups = /* @__PURE__ */ new Map();
  for (const cap of caps) {
    if (!assigned2(cap.cap_inventory_id)) continue;
    if (!groups.has(cap.cap_inventory_id)) groups.set(cap.cap_inventory_id, []);
    groups.get(cap.cap_inventory_id).push(cap);
  }
  const byInventory = [...groups].map(([id, rows]) => ({
    id,
    name: rows[0].cap_name,
    qty: rows.length,
    cost: sumKnown(rows)
  }));
  const total = sumKnown(caps);
  if (total === null && caps.every((cap) => known(cap.cost))) {
    issues.push({
      kind: "wall_cap",
      index: 0,
      componentId: caps[0]?.component_id ?? caps[0]?.id ?? null,
      field: "cost",
      inventoryId: null,
      code: "wall_cap_cost_total_invalid",
      message: "Wall cap total is outside the supported numeric range; current pricing is unavailable."
    });
  }
  return { caps, byInventory, total, issues };
}
function foundationWallCapCatalogIssues(wallCaps = [], inventory = []) {
  return calcWallCaps(wallCaps, inventory).issues;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationCatalogIntegrity.js
var INACTIVE_STATUS_VALUES = /* @__PURE__ */ new Set([
  "inactive",
  "disabled",
  "archived",
  "discontinued",
  "retired",
  "deactivated"
]);
var DELETED_STATUS_VALUES = /* @__PURE__ */ new Set(["deleted", "removed", "purged"]);
function foundationCatalogRowAvailability(row) {
  if (!row || typeof row !== "object") return "deleted";
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (row.deleted === true || row.is_deleted === true || row.deleted_at != null || DELETED_STATUS_VALUES.has(status)) return "deleted";
  if (row.is_active === false || row.active === false || row.archived === true || row.is_archived === true || row.disabled === true || row.show_in_foundation === false || INACTIVE_STATUS_VALUES.has(status)) return "inactive";
  return "active";
}
function foundationCatalogPriceClass(value) {
  const number3 = inventoryNonnegativeNumber(value);
  if (number3 === null) return "unpriced";
  return number3 === 0 ? "free" : "priced";
}
var authoredOverride = (value) => value !== void 0 && value !== null;
function foundationItemCatalogIssues(item, inventory = [], index = 0) {
  const issues = [];
  const add = (field, id, code, message) => issues.push({
    kind: "foundation",
    index,
    componentId: item.component_id ?? null,
    field,
    inventoryId: id ?? null,
    code,
    message: `Foundation ${index + 1}: ${message}`
  });
  const selected = (id) => id !== void 0 && id !== null && id !== "";
  const check = (field, types, label, { unassigned = null, priceBasis = null } = {}) => {
    const id = item[field];
    if (!selected(id)) {
      if (unassigned) add(field, null, "catalog_item_unassigned", unassigned);
      return;
    }
    const row = inventory.find((record) => record.id === id);
    if (!row) {
      add(
        field,
        id,
        "catalog_item_unavailable",
        `${label} is unavailable \u2014 the catalog row may have been deleted or deactivated`
      );
      return;
    }
    if (!types.includes(row.material_type)) {
      add(field, id, "catalog_item_type_mismatch", `${label} is the wrong catalog type`);
      return;
    }
    const availability = foundationCatalogRowAvailability(row);
    if (availability !== "active") {
      add(
        field,
        id,
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted" ? `${label} is marked deleted in the catalog \u2014 pick a replacement` : `${label} is inactive in the catalog \u2014 reactivate it or pick a replacement`
      );
      return;
    }
    const basis = priceBasis?.(row);
    if (basis && foundationCatalogPriceClass(row[basis]) === "unpriced") {
      add(
        field,
        id,
        "catalog_item_unpriced",
        `${label} has no recorded ${basis} \u2014 a missing price is not a free material`
      );
    }
  };
  check("selected_concrete_id", ["bagged_concrete", "concrete_service"], "the selected concrete catalog material", {
    unassigned: "select a concrete catalog material \u2014 unassigned concrete rides the first supplier's delivery mix or prices at $0",
    // Item-level bag pricing consumes cost_per_unit; a service row's mixes
    // and fees are the delivery scan's own checks, never duplicated here.
    priceBasis: (row) => row.material_type === "bagged_concrete" && !authoredOverride(item.custom_concrete_cost_per_cy) ? "cost_per_unit" : null
  });
  if (item.include_forming) check("selected_forming_id", ["forming_material"], "the selected forming catalog material", {
    // An authored custom rate replaces the catalog basis entirely; the row
    // is then consumed for nothing and unassigned/unpriced stay silent.
    unassigned: !authoredOverride(item.custom_forming_rate) ? "select a forming catalog material or record a custom forming rate" : null,
    priceBasis: () => !authoredOverride(item.custom_forming_rate) ? "cost_per_unit" : null
  });
  if (item.reinforcement_calculation_version != null && item.reinforcement_calculation_version !== 1) {
    if (item.reinforcement_calculation_version === 2 && item.include_rebar && item.reinforcement_material?.kind === "catalog") {
      const id = item.reinforcement_material.inventory_id;
      const matches = selected(id) ? inventory.filter((row) => row.id === id) : [];
      if (matches.length !== 1 || matches[0].material_type !== "rebar") {
        add(
          "reinforcement_material.inventory_id",
          id,
          !selected(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
          !selected(id) ? "select a reinforcement catalog material" : matches.length > 1 ? "the selected reinforcement catalog ID is ambiguous; refresh the catalog" : "the selected reinforcement catalog material is unavailable \u2014 it may have been deleted or deactivated"
        );
      } else {
        const availability = foundationCatalogRowAvailability(matches[0]);
        if (availability !== "active") {
          add(
            "reinforcement_material.inventory_id",
            id,
            availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
            availability === "deleted" ? "the selected reinforcement catalog material is marked deleted \u2014 pick a replacement" : "the selected reinforcement catalog material is inactive \u2014 reactivate it or pick a replacement"
          );
        }
      }
    }
    return issues;
  }
  const manualRebar = hasFoundationCostSnapshot(item.custom_rebar_cost_per_ft) && item.custom_rebar_cost_per_ft >= 0;
  if (item.include_rebar && !manualRebar) {
    const field = item.foundation_type === "spread_foot" ? "rebar_size" : "pillar_rebar_size";
    const authoredSize = field === "rebar_size" ? item.rebar_size : item.pillar_rebar_size;
    const defaulted = field === "pillar_rebar_size" && !authoredSize;
    const size = defaulted ? "#4" : authoredSize;
    const row = size ? inventory.find((record) => record.material_type === "rebar" && record.rebar_size === size) : null;
    if (defaulted) {
      const rowState = row ? foundationCatalogRowAvailability(row) : null;
      add(field, row?.id ?? null, "catalog_item_unassigned_default", !row ? `no rebar size is selected and the catalog has no ${size} rebar default to consume \u2014 select a size` : rowState !== "active" ? `no rebar size is selected \u2014 the catalog ${size} default resolves to ${rowState === "inactive" ? "an inactive" : "a deleted"} row; pick a size explicitly` : `no rebar size is selected \u2014 the catalog ${size} default is consumed; pick a size explicitly`);
    } else if (!row) {
      add(
        field,
        null,
        size ? "catalog_item_unavailable" : "catalog_item_unassigned",
        size ? `rebar catalog size ${size} is unavailable \u2014 it may have been deleted or deactivated` : "select a rebar catalog size"
      );
    } else {
      const availability = foundationCatalogRowAvailability(row);
      if (availability !== "active") {
        add(
          field,
          row.id,
          availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
          availability === "deleted" ? `rebar catalog size ${size} is marked deleted \u2014 pick another size` : `rebar catalog size ${size} is inactive \u2014 reactivate it or pick another size`
        );
      } else if (!authoredOverride(item.custom_rebar_cost_per_ft) && foundationCatalogPriceClass(row.cost_per_unit) === "unpriced") {
        add(
          field,
          row.id,
          "catalog_item_unpriced",
          `rebar catalog size ${size} has no recorded cost_per_unit \u2014 a missing price is not a free material`
        );
      }
    }
  }
  return issues;
}
function foundationAssemblyCatalogIssues(project, inventory = []) {
  const issues = [];
  const check = (row, index, kind, field, label) => {
    const id = row[field];
    const assigned3 = typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
    if (!assigned3) {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: null,
        code: "catalog_item_unassigned",
        message: `${label} ${index + 1}: select a catalog material.`
      });
      return;
    }
    const match = inventory.find((record) => record.id === id);
    if (!match) {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: id,
        code: "catalog_item_unavailable",
        message: `${label} ${index + 1}: selected catalog material is unavailable \u2014 it may have been deleted or deactivated.`
      });
      return;
    }
    const availability = foundationCatalogRowAvailability(match);
    if (availability !== "active") {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: id,
        code: availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        message: availability === "deleted" ? `${label} ${index + 1}: selected catalog material is marked deleted \u2014 pick a replacement.` : `${label} ${index + 1}: selected catalog material is inactive \u2014 reactivate it or pick a replacement.`
      });
    }
  };
  for (const [index, pole] of (project?.poles || []).entries()) {
    check(pole, index, "pole", "pole_id", "Pole");
  }
  if (!project?.project_concrete_type) {
    const firstServiceItem = (project?.items || []).find((item) => {
      const row = inventory.find((record) => record?.id === item?.selected_concrete_id);
      return row?.material_type === "concrete_service";
    });
    if (firstServiceItem) {
      issues.push({
        kind: "concrete_delivery",
        index: null,
        componentId: null,
        field: "project_concrete_type",
        inventoryId: firstServiceItem.selected_concrete_id ?? null,
        code: "catalog_item_unassigned_default",
        message: "Concrete delivery: no concrete mix is selected \u2014 the supplier's catalog default mix is consumed when concrete ships. Pick a mix explicitly."
      });
    }
  }
  return [
    ...issues,
    ...foundationWallCatalogIssues(project?.walls || [], inventory),
    ...foundationWallCapCatalogIssues(project?.wall_caps || [], inventory),
    ...(project?.items || []).flatMap((item, index) => foundationItemCatalogIssues(item, inventory, index)),
    ...foundationEquipmentCatalogIssues(project?.selected_equipment || [], inventory)
  ];
}
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/wallCalculator.js
var CUBIC_INCHES_PER_CUBIC_YARD = 46656;
var POURED_CONCRETE_UNIT_BASIS = /* @__PURE__ */ new Set([
  "cy",
  "cyd",
  "cy_d",
  "yd",
  "yd3",
  "cu_yd",
  "cubic_yard",
  "cubic_yards",
  "yard",
  "yards"
]);
function calcWallCosts({ wall, wallShape, wallMaterial, internalMaterial, includeInternalWall, wallHeightInches, internalWallHeightInches, mortarGapInches, internalMortarGapInches, settings }) {
  if (!wallShape || !wallMaterial || !wallShape.segments) return null;
  const isConcrete = canonicalWallMaterialSubtype(wallMaterial.wall_material_subtype) === "concrete";
  const unitL = wallMaterial.wall_unit_length_inches || 8;
  const unitW = wallMaterial.wall_unit_width_inches || 4;
  const unitH = wallMaterial.wall_unit_height_inches || 2.25;
  const mortar = isConcrete ? 0 : mortarGapInches;
  const courseH = unitH + mortar;
  const numCourses = isConcrete ? 0 : wallHeightInches / courseH;
  const brickPitch = unitL + (isConcrete ? 0 : mortar);
  const totalLinearInches = wallShape.segments.reduce((s, seg) => s + seg.length, 0);
  let totalBricks = 0;
  if (isConcrete) {
    totalBricks = totalLinearInches * wallHeightInches * unitW / CUBIC_INCHES_PER_CUBIC_YARD;
  } else {
    const numCoursesRounded = Math.ceil(numCourses);
    wallShape.segments.forEach((seg) => {
      const bricksThisCourse = Math.ceil(seg.length / brickPitch);
      totalBricks += bricksThisCourse * numCoursesRounded;
    });
  }
  const finalBricks = wallMaterial.custom_outer_material_qty !== void 0 && wallMaterial.custom_outer_material_qty !== null ? wallMaterial.custom_outer_material_qty : totalBricks;
  const materialCost = finalBricks * (wallMaterial.custom_cost_per_unit !== void 0 && wallMaterial.custom_cost_per_unit !== null ? wallMaterial.custom_cost_per_unit : wallMaterial.cost_per_unit || 0);
  const surfaceAreaSqFtSingleSide = totalLinearInches * wallHeightInches / 144;
  let mortarCost = 0;
  let mortarBags = 0;
  if (!isConcrete) {
    const surfaceAreaSqFtMortar = surfaceAreaSqFtSingleSide * 2;
    mortarBags = Math.ceil(surfaceAreaSqFtMortar / 30);
    const finalMortarBags = wallMaterial.custom_outer_mortar_qty !== void 0 && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags;
    const mortarCostPerBag = parseFloat(inventorySettingValue(settings?.wall_mortar_cost_per_bag, 10));
    const finalMortarRate = wallMaterial.custom_outer_mortar_rate !== void 0 && wallMaterial.custom_outer_mortar_rate !== null ? wallMaterial.custom_outer_mortar_rate : mortarCostPerBag;
    mortarCost = finalMortarBags * finalMortarRate;
  }
  const laborRatePerSqFt = wallMaterial.custom_outer_labor_rate !== void 0 && wallMaterial.custom_outer_labor_rate !== null ? wallMaterial.custom_outer_labor_rate : parseFloat(inventorySettingValue(settings?.wall_labor_rate, 45));
  const minCharge = parseFloat(inventorySettingValue(settings?.wall_minimum_charge, 150));
  let laborCost = surfaceAreaSqFtSingleSide * laborRatePerSqFt;
  if (laborCost < minCharge) {
    laborCost = minCharge;
  }
  const laborHours = isConcrete ? 0 : finalBricks / parseFloat(inventorySettingValue(settings?.wall_labor_bricks_per_hour, 50));
  let internalTotalBricks = 0;
  let internalMaterialCost = 0;
  let internalMortarCost = 0;
  let internalLaborCost = 0;
  let internalLaborHours = 0;
  let internalTotalLinearInches = 0;
  let intIsConcrete = false;
  if (includeInternalWall && internalMaterial) {
    intIsConcrete = canonicalWallMaterialSubtype(internalMaterial.wall_material_subtype) === "concrete";
    const intUnitL = internalMaterial.wall_unit_length_inches || 8;
    const intUnitW = internalMaterial.wall_unit_width_inches || 4;
    const intUnitH = internalMaterial.wall_unit_height_inches || 2.25;
    const intMortar = intIsConcrete ? 0 : internalMortarGapInches ?? 0.375;
    const intCourseH = intUnitH + intMortar;
    const intNumCourses = Math.ceil(internalWallHeightInches / intCourseH);
    const intBrickPitch = intUnitL + intMortar;
    const isClosed = wallShape.closed !== false;
    const lengthReduction = isClosed ? unitW + intUnitW : 0;
    wallShape.segments.forEach((seg) => {
      const innerSegLength = Math.max(0, seg.length - lengthReduction);
      internalTotalLinearInches += innerSegLength;
      if (intIsConcrete) {
        internalTotalBricks += innerSegLength * internalWallHeightInches * intUnitW / CUBIC_INCHES_PER_CUBIC_YARD;
      } else {
        const bricksThisCourse = Math.ceil(innerSegLength / intBrickPitch);
        internalTotalBricks += bricksThisCourse * intNumCourses;
      }
    });
    const finalInternalBricks = wall.custom_internal_material_qty !== void 0 && wall.custom_internal_material_qty !== null ? wall.custom_internal_material_qty : internalTotalBricks;
    internalMaterialCost = finalInternalBricks * (wall.custom_internal_material_cost_per_unit !== void 0 && wall.custom_internal_material_cost_per_unit !== null ? wall.custom_internal_material_cost_per_unit : internalMaterial.cost_per_unit || 0);
    const intSurfaceAreaSqFtSingleSide = internalTotalLinearInches * internalWallHeightInches / 144;
    let internalMortarBags = 0;
    if (!intIsConcrete) {
      const intSurfaceAreaSqFtMortar = intSurfaceAreaSqFtSingleSide * 2;
      internalMortarBags = Math.ceil(intSurfaceAreaSqFtMortar / 30);
      const finalInternalMortarBags = wall.custom_internal_mortar_qty !== void 0 && wall.custom_internal_mortar_qty !== null ? wall.custom_internal_mortar_qty : internalMortarBags;
      const internalMortarCostPerBag = parseFloat(inventorySettingValue(settings?.wall_mortar_cost_per_bag, 10));
      const finalInternalMortarRate = wall.custom_internal_mortar_rate !== void 0 && wall.custom_internal_mortar_rate !== null ? wall.custom_internal_mortar_rate : internalMortarCostPerBag;
      internalMortarCost = finalInternalMortarBags * finalInternalMortarRate;
    }
    const internalLaborRatePerSqFt = wall.custom_internal_labor_rate !== void 0 && wall.custom_internal_labor_rate !== null ? wall.custom_internal_labor_rate : parseFloat(inventorySettingValue(settings?.wall_labor_rate, 45));
    internalLaborCost = intSurfaceAreaSqFtSingleSide * internalLaborRatePerSqFt;
    internalLaborHours = intIsConcrete ? 0 : finalInternalBricks / parseFloat(inventorySettingValue(settings?.wall_labor_bricks_per_hour, 50));
  }
  return {
    totalBricks,
    finalBricks,
    materialCost,
    mortarBags,
    finalMortarBags: !isConcrete ? wallMaterial.custom_outer_mortar_qty !== void 0 && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags : 0,
    mortarCost,
    laborHours,
    laborRatePerSqFt,
    laborCost,
    totalCost: materialCost + mortarCost + laborCost + internalMaterialCost + internalMortarCost + internalLaborCost,
    totalLinearInches,
    numCourses,
    internalTotalBricks,
    internalMaterialCost,
    internalMortarBags: includeInternalWall && internalMaterial && !intIsConcrete ? Math.ceil(internalTotalLinearInches * internalWallHeightInches / 144 * 2 / 30) : 0,
    internalMortarCost,
    internalLaborCost,
    internalLaborHours
  };
}
var assignedId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var WALL_MORTAR_GAP_DEFAULT = 0.375;
var wallMortarGapNumber = (value) => value === void 0 || value === null || value === "" ? WALL_MORTAR_GAP_DEFAULT : inventoryNonnegativeNumber(value);
var wallRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var wallPoint = (point) => wallRecord(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.z === "number" && Number.isFinite(point.z);
function foundationWallSegments(points, closed = false) {
  if (!Array.isArray(points) || !points.every(wallPoint) || typeof closed !== "boolean") return null;
  const segments = [];
  const add = (a, b) => segments.push({ length: Math.hypot(b.x - a.x, b.z - a.z) });
  for (let i = 0; i < points.length - 1; i++) add(points[i], points[i + 1]);
  if (closed && points.length > 2) add(points[points.length - 1], points[0]);
  return segments.every((segment) => Number.isFinite(segment.length)) ? segments : null;
}
function foundationWallOutlineBasis(shape) {
  const result = {
    shape: null,
    points: [],
    closed: shape?.closed === true,
    hasRecordedPoints: false,
    perimeterInches: null,
    issues: []
  };
  const add = (code, message) => result.issues.push({ code, message });
  const unavailable = () => add("wall_outline_unavailable", "draw an outline with positive segment lengths before repricing");
  if (!wallRecord(shape)) {
    unavailable();
    return result;
  }
  result.hasRecordedPoints = shape.points != null && (!Array.isArray(shape.points) || shape.points.length > 0);
  const validPoints = Array.isArray(shape.points) && shape.points.every(wallPoint);
  if (validPoints) result.points = shape.points.map((point) => ({ ...point }));
  if (result.hasRecordedPoints && !validPoints) {
    add("wall_outline_points_unavailable", "repair the recorded footprint coordinates before repricing");
  }
  if ((shape.closed != null || result.hasRecordedPoints) && typeof shape.closed !== "boolean") {
    add("wall_outline_closure_unavailable", "record whether the outline is open or closed before repricing");
  }
  let segments = null;
  if (!Array.isArray(shape.segments) || !shape.segments.length) {
    unavailable();
  } else {
    const lengths = shape.segments.map((segment) => wallRecord(segment) ? inventoryPositiveNumber(segment.length) : null);
    if (lengths.some((length) => length === null)) {
      add("wall_outline_segment_unavailable", "record positive, finite segment lengths in inches before repricing");
    } else {
      segments = shape.segments.map((segment, index) => ({ ...segment, length: lengths[index] }));
      if (!Number.isFinite(lengths.reduce((sum, length) => sum + length, 0))) {
        add("wall_outline_length_unavailable", "record a finite outline perimeter before repricing");
      }
    }
  }
  if (segments && result.hasRecordedPoints && validPoints && typeof shape.closed === "boolean") {
    const expected = foundationWallSegments(result.points, shape.closed);
    const same2 = result.points.length >= (shape.closed ? 3 : 2) && expected && expected.length === segments.length && expected.every((segment, index) => {
      const stored = segments[index].length;
      const tolerance = Number.EPSILON * 8 * Math.max(1, segment.length, stored);
      return segment.length > 0 && Math.abs(segment.length - stored) <= tolerance;
    });
    if (!same2) add("wall_outline_geometry_mismatch", "repair footprint points and segment lengths so they describe the same outline before repricing");
  }
  if (!result.issues.length) {
    result.shape = { ...shape, segments };
    if (validPoints) result.shape.points = result.points;
    result.perimeterInches = segments.reduce((sum, segment) => sum + segment.length, 0);
  }
  return result;
}
var WALL_SETTING_DEFAULTS = {
  wall_mortar_cost_per_bag: 10,
  wall_labor_rate: 45,
  wall_minimum_charge: 150,
  wall_labor_bricks_per_hour: 50
};
var WALL_OUTER_OVERRIDE_FIELDS = [
  ["custom_outer_material_qty", "material quantity"],
  ["custom_outer_labor_rate", "labor rate"]
];
var WALL_OUTER_MORTAR_OVERRIDE_FIELDS = [
  ["custom_outer_mortar_qty", "mortar quantity"],
  ["custom_outer_mortar_rate", "mortar rate"]
];
var WALL_INTERNAL_OVERRIDE_FIELDS = [
  ["custom_internal_material_qty", "material quantity"],
  ["custom_internal_labor_rate", "labor rate"]
];
var WALL_INTERNAL_MORTAR_OVERRIDE_FIELDS = [
  ["custom_internal_mortar_qty", "mortar quantity"],
  ["custom_internal_mortar_rate", "mortar rate"]
];
function wallPricing(wall, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const heightInches = inventoryPositiveNumber(wall?.heightInches);
  const internalWallHeightInches = wall?.includeInternalWall ? inventoryPositiveNumber(wall.internalWallHeightInches ?? wall.heightInches) : null;
  const heightIssue = (field, kind, label, code) => issues.push({
    kind,
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field,
    inventoryId: wall?.[kind === "wall" ? "materialId" : "internalMaterialId"] ?? null,
    code,
    message: `${label} ${index + 1}: record a positive, finite wall height in inches before repricing.`
  });
  if (heightInches === null) heightIssue("heightInches", "wall", "Wall", "wall_height_unavailable");
  if (wall?.includeInternalWall && internalWallHeightInches === null) {
    heightIssue("internalWallHeightInches", "internal_wall", "Internal wall", "internal_wall_height_unavailable");
  }
  const outline = foundationWallOutlineBasis(wall?.shape);
  issues.push(...outline.issues.map((issue) => ({
    ...issue,
    kind: "wall",
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field: "shape",
    inventoryId: wall?.materialId ?? null,
    message: `Wall ${index + 1}: ${issue.message}.`
  })));
  const check = (field, kind, label) => {
    const id = wall?.[field];
    const add2 = (code, message) => issues.push({
      kind,
      index,
      componentId: wall?.component_id ?? wall?.id ?? null,
      field,
      inventoryId: assignedId(id) ? id : null,
      code,
      message: `${label} ${index + 1}: ${message}.`
    });
    if (!assignedId(id)) {
      add2("catalog_item_unassigned", "select a catalog material");
      return null;
    }
    const matches = inventory.filter((row) => row?.id === id);
    if (!matches.length) {
      add2("catalog_item_unavailable", "selected catalog material is unavailable");
      return null;
    }
    if (matches.length !== 1) {
      add2("catalog_item_ambiguous", "selected catalog material is ambiguous");
      return null;
    }
    const material = matches[0];
    if (!["brick_stone", "wall_material"].includes(material.material_type)) {
      add2("catalog_item_type_mismatch", "selected catalog material is not a wall material");
      return null;
    }
    const availability = foundationCatalogRowAvailability(material);
    if (availability !== "active") {
      add2(
        availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted" ? "selected catalog material is marked deleted \u2014 pick a replacement" : "selected catalog material is inactive \u2014 reactivate it or pick a replacement"
      );
      return null;
    }
    const override = kind === "wall" ? material.custom_cost_per_unit : wall.custom_internal_material_cost_per_unit;
    const price = override !== void 0 && override !== null ? override : material.cost_per_unit;
    if (inventoryNonnegativeNumber(price) === null) {
      add2("wall_material_price_unavailable", "record a finite, nonnegative material unit price before repricing");
    }
    const subtype = canonicalWallMaterialSubtype(material.wall_material_subtype);
    if (wallMaterialSubtypeRecorded(material.wall_material_subtype) && subtype === null) {
      add2(
        "wall_material_subtype_unavailable",
        "record a supported wall material subtype (brick, cinderblock / CMU, stone, or poured concrete) before repricing"
      );
      return null;
    }
    const pouredConcrete = subtype === "concrete";
    if (pouredConcrete) {
      const recordedUnit = material.unit;
      const unitRecorded = recordedUnit !== void 0 && recordedUnit !== null && (typeof recordedUnit !== "string" || recordedUnit.trim() !== "");
      if (unitRecorded) {
        const unitKey = typeof recordedUnit === "string" ? recordedUnit.trim().toLowerCase().replace(/[\s\-_.]+/g, "_").replace(/^_+|_+$/g, "") : String(recordedUnit);
        if (!POURED_CONCRETE_UNIT_BASIS.has(unitKey)) {
          add2(
            "wall_material_unit_mismatch",
            "poured concrete is priced per cubic yard \u2014 record the unit as CY (or clear it) so the cost basis is unambiguous before repricing"
          );
        }
      }
    }
    const normalizedMaterial = { ...material };
    if (subtype !== null) normalizedMaterial.wall_material_subtype = subtype;
    for (const [key, label2] of pouredConcrete ? [["wall_unit_width_inches", "wall thickness"]] : [["wall_unit_length_inches", "unit length"], ["wall_unit_width_inches", "unit width"], ["wall_unit_height_inches", "unit height"]]) {
      const dimension = inventoryPositiveNumber(material[key]);
      if (dimension === null) {
        add2(key + "_unavailable", `record a positive, finite ${label2} in inches before repricing`);
      } else {
        normalizedMaterial[key] = dimension;
      }
    }
    return normalizedMaterial;
  };
  const wallMaterial = check("materialId", "wall", "Wall");
  const internalMaterial = wall?.includeInternalWall ? check("internalMaterialId", "internal_wall", "Internal wall") : null;
  const add = (kind, field, inventoryId, code, message) => issues.push({
    kind,
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field,
    inventoryId: inventoryId ?? null,
    code,
    message: `${kind === "internal_wall" ? "Internal wall" : "Wall"} ${index + 1}: ${message}.`
  });
  const overrideCheck = (source, fields, kind, inventoryId) => {
    for (const [field, label] of fields) {
      const raw = source?.[field];
      if (raw === void 0 || raw === null) continue;
      const value = inventoryNonnegativeNumber(raw);
      if (value === null) {
        add(
          kind,
          field,
          inventoryId,
          field + "_unavailable",
          `record a finite, nonnegative ${label} override or clear it before repricing`
        );
      } else {
        source[field] = value;
      }
    }
  };
  const settingCheck = (key, label, positive6) => {
    const value = positive6 ? inventoryPositiveSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]) : inventorySettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]);
    if (value === null) {
      add(
        "wall",
        key,
        wall?.materialId,
        "wall_setting_unavailable",
        `record a finite, ${positive6 ? "positive" : "nonnegative"} ${label} in Estimator Settings before repricing`
      );
    }
    return value;
  };
  const outerConcrete = wallMaterial?.wall_material_subtype === "concrete";
  const intConcrete = internalMaterial?.wall_material_subtype === "concrete";
  const calcWall = wall?.includeInternalWall && internalMaterial ? { ...wall } : wall;
  let mortarGapInches = WALL_MORTAR_GAP_DEFAULT;
  let internalMortarGapInches = WALL_MORTAR_GAP_DEFAULT;
  if (wallMaterial) {
    overrideCheck(wallMaterial, WALL_OUTER_OVERRIDE_FIELDS, "wall", wall?.materialId);
    settingCheck("wall_labor_rate", "wall labor rate");
    settingCheck("wall_minimum_charge", "wall minimum labor charge");
    if (!outerConcrete || internalMaterial && !intConcrete) {
      settingCheck("wall_labor_bricks_per_hour", "wall production rate", true);
    }
    if (!outerConcrete) {
      mortarGapInches = wallMortarGapNumber(wall?.mortarGapInches);
      if (mortarGapInches === null) {
        add(
          "wall",
          "mortarGapInches",
          wall?.materialId,
          "wall_mortar_gap_unavailable",
          "record a finite, nonnegative mortar gap in inches before repricing"
        );
      }
      overrideCheck(wallMaterial, WALL_OUTER_MORTAR_OVERRIDE_FIELDS, "wall", wall?.materialId);
    }
  }
  if (wall?.includeInternalWall && internalMaterial) {
    overrideCheck(calcWall, WALL_INTERNAL_OVERRIDE_FIELDS, "internal_wall", wall?.internalMaterialId);
    if (!intConcrete) {
      internalMortarGapInches = wallMortarGapNumber(wall?.internalMortarGapInches);
      if (internalMortarGapInches === null) {
        add(
          "internal_wall",
          "internalMortarGapInches",
          wall?.internalMaterialId,
          "internal_wall_mortar_gap_unavailable",
          "record a finite, nonnegative mortar gap in inches before repricing"
        );
      }
      overrideCheck(calcWall, WALL_INTERNAL_MORTAR_OVERRIDE_FIELDS, "internal_wall", wall?.internalMaterialId);
    }
  }
  if (wallMaterial && !outerConcrete || internalMaterial && !intConcrete) {
    settingCheck("wall_mortar_cost_per_bag", "mortar cost per bag");
  }
  return {
    issues,
    wallMaterial,
    internalMaterial,
    heightInches,
    internalWallHeightInches,
    wallShape: outline.shape,
    calcWall,
    mortarGapInches,
    internalMortarGapInches
  };
}
function foundationWallPricingIssues(wall, inventory = [], index = 0, settings = {}) {
  return wallPricing(wall, inventory, index, settings).issues;
}
function foundationWallCatalogIssues(walls = [], inventory = [], settings = {}) {
  return walls.flatMap((wall, index) => foundationWallPricingIssues(wall, inventory, index, settings));
}
function foundationWallBomRows(walls = [], inventory = [], wallPricing2) {
  const out = [];
  const known3 = (value) => typeof value === "number" && Number.isFinite(value);
  const quantity3 = (value, unit = "units") => known3(value) ? `${value.toLocaleString(void 0, { maximumFractionDigits: 2 })} ${unit}` : "Not saved";
  const amount2 = (value) => known3(value) ? value : "Not saved";
  const used = (qty2, cost) => known3(qty2) && qty2 > 0 || known3(cost) && cost !== 0;
  walls.forEach((wall, index) => {
    const costs = wall.calculatedCosts || {};
    const label = wall.name || `Wall ${index + 1}`;
    const saved = Array.isArray(wallPricing2) && wallPricing2[index] ? wallPricing2[index].available === false : foundationWallPricingIssues(wall, inventory, index).length > 0;
    const nameOf = (id) => inventory.find((row) => row.id === id)?.material_name || "Material";
    const add = (material, qty2, cost) => out.push({ material, quantity: qty2, cost: amount2(cost), saved });
    if (saved || used(costs.totalBricks, costs.materialCost)) {
      add(
        saved ? `${label} \u2014 saved outer material` : `${label} \u2014 ${nameOf(wall.materialId)}`,
        quantity3(costs.totalBricks, costs.materialQuantityUnit === "cy" ? "CY" : "units"),
        costs.materialCost
      );
    }
    if (known3(costs.mortarCost) && costs.mortarCost !== 0) {
      add(`${label} \u2014 ${saved ? "saved mortar" : "mortar"}`, "\u2014", costs.mortarCost);
    }
    const internalUsed = used(costs.internalTotalBricks, costs.internalMaterialCost);
    if (saved && wall.includeInternalWall || internalUsed) {
      add(
        saved ? `${label} \u2014 saved internal material` : `${label} \u2014 ${nameOf(wall.internalMaterialId)} (internal)`,
        quantity3(costs.internalTotalBricks, costs.internalMaterialQuantityUnit === "cy" ? "CY" : "units"),
        costs.internalMaterialCost
      );
    }
    if (known3(costs.internalMortarCost) && costs.internalMortarCost !== 0) {
      add(`${label} \u2014 ${saved ? "saved internal mortar" : "internal mortar"}`, "\u2014", costs.internalMortarCost);
    }
  });
  return out;
}
function calcWalls(project, inventory, settings = {}, options = {}) {
  const walls = project.walls || [];
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedWalls");
  const savedWalls = Array.isArray(options?.savedWalls) ? options.savedWalls : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(walls), savedCounts = counts(savedWalls);
  const savedById = new Map(savedWalls.filter((row) => assignedId(row?.component_id)).map((row) => [row.component_id, row]));
  const held = (wall) => {
    const id = wall?.component_id;
    const acknowledged = explicitSnapshot ? assignedId(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null : wall;
    const costs = acknowledged?.calculatedCosts;
    return {
      ...wall,
      calculatedCosts: costs && typeof costs === "object" && !Array.isArray(costs) ? { ...costs } : {}
    };
  };
  const results = walls.map((wall, index) => wallPricing(wall, inventory, index, settings));
  return {
    walls: results.map((check, index) => {
      const wall = walls[index];
      if (check.issues.length) return held(wall);
      const {
        wallMaterial,
        internalMaterial,
        heightInches,
        internalWallHeightInches,
        wallShape,
        calcWall,
        mortarGapInches,
        internalMortarGapInches
      } = check;
      const costs = calcWallCosts({
        wall: calcWall ?? wall,
        wallShape,
        wallMaterial,
        internalMaterial,
        includeInternalWall: wall.includeInternalWall,
        wallHeightInches: heightInches,
        internalWallHeightInches,
        mortarGapInches,
        internalMortarGapInches,
        settings
      }) || {};
      return {
        ...wall,
        calculatedCosts: {
          // ?? keeps an accidental NaN visible instead of laundering it to $0.
          totalBricks: costs.finalBricks ?? 0,
          materialCost: costs.materialCost ?? 0,
          mortarCost: costs.mortarCost ?? 0,
          laborHours: costs.laborHours ?? 0,
          laborCost: costs.laborCost ?? 0,
          totalCost: costs.totalCost ?? 0,
          totalLinearInches: costs.totalLinearInches ?? 0,
          numCourses: costs.numCourses ?? 0,
          internalTotalBricks: costs.internalTotalBricks ?? 0,
          internalMaterialCost: costs.internalMaterialCost ?? 0,
          internalMortarCost: costs.internalMortarCost ?? 0,
          internalLaborCost: costs.internalLaborCost ?? 0,
          internalLaborHours: costs.internalLaborHours ?? 0,
          // CMP-D03: poured-concrete walls carry the quantity basis on the
          // snapshot ("cy" placed volume, vs the unit-masonry count) so saved
          // rows, BOM and Builder parts can label the quantity honestly. Unit
          // masonry is untouched — no extra keys on unchanged paths.
          ...wallMaterial?.wall_material_subtype === "concrete" ? { materialQuantityUnit: "cy" } : {},
          ...wall.includeInternalWall && internalMaterial?.wall_material_subtype === "concrete" ? { internalMaterialQuantityUnit: "cy" } : {}
        }
      };
    }),
    wallPricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues }))
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/poleCalculator.js
var assignedId2 = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var setting = (settings, key, def) => parseFloat(inventorySettingValue(settings?.[key], def));
var POLE_PAINT_SETTING_DEFAULTS = {
  pole_paint_cost_per_lf: 3.5,
  pole_paint_labor_per_lf: 2.5,
  pole_paint_size_multiplier_12in: 2,
  pole_paint_size_multiplier_10in: 1.75,
  pole_paint_size_multiplier_8in: 1.5,
  pole_paint_size_multiplier_6in: 1.25,
  pole_paint_size_multiplier_4in: 1
};
var polePaintMultiplierKey = (widthInches) => {
  const w = widthInches === null ? 6 : widthInches;
  if (w >= 12) return "pole_paint_size_multiplier_12in";
  if (w >= 10) return "pole_paint_size_multiplier_10in";
  if (w >= 8) return "pole_paint_size_multiplier_8in";
  if (w >= 6) return "pole_paint_size_multiplier_6in";
  return "pole_paint_size_multiplier_4in";
};
var getPolePaintingSizeMultiplier = (inv, settings) => {
  const w = inv?.pole_width_inches || 6;
  if (w >= 12) return setting(settings, "pole_paint_size_multiplier_12in", 2);
  if (w >= 10) return setting(settings, "pole_paint_size_multiplier_10in", 1.75);
  if (w >= 8) return setting(settings, "pole_paint_size_multiplier_8in", 1.5);
  if (w >= 6) return setting(settings, "pole_paint_size_multiplier_6in", 1.25);
  return setting(settings, "pole_paint_size_multiplier_4in", 1);
};
var calcPolePaintingCost = (p, inv, settings) => {
  if (!p.include_pole_painting || !inv) return 0;
  const heightFt = ((p.height_inches || 0) + (p.y_offset_inches || 0)) / 12;
  const paintCostPerLf = setting(settings, "pole_paint_cost_per_lf", 3.5);
  const paintLaborPerLf = setting(settings, "pole_paint_labor_per_lf", 2.5);
  const sizeMult = getPolePaintingSizeMultiplier(inv, settings);
  return heightFt * (paintCostPerLf + paintLaborPerLf) * sizeMult;
};
var POLE_SHAPE_VALUES = ["round", "square", "rectangular", "elliptical", "other"];
var recorded = (v) => v !== void 0 && v !== null && v !== "";
function foundationPoleGeometry(pole, inv = null) {
  const p = pole ?? {};
  const problems = [];
  const add = (field, code, message) => problems.push({ field, code, message });
  const height = inventoryPositiveNumber(p.height_inches);
  const heightSource = height !== null ? "height_inches" : "unavailable";
  if (height === null) {
    add(
      "height_inches",
      "pole_height_unavailable",
      "record a positive, finite height above grade in inches before repricing"
    );
  }
  const canonEmbedRaw = p.embedment_inches;
  const legacyEmbedRaw = p.y_offset_inches;
  const canonEmbedPresent = recorded(canonEmbedRaw);
  const legacyEmbedPresent = recorded(legacyEmbedRaw);
  let embedment = null;
  let embedmentSource = "unavailable";
  if (canonEmbedPresent) {
    embedment = inventoryNonnegativeMeasurement(canonEmbedRaw);
    if (embedment === null) {
      add(
        "embedment_inches",
        "pole_embedment_unavailable",
        "record a finite, nonnegative embedment below grade in inches before repricing"
      );
    } else {
      embedmentSource = "embedment_inches";
    }
  }
  if (legacyEmbedPresent) {
    const legacy = inventoryNonnegativeMeasurement(legacyEmbedRaw);
    if (!canonEmbedPresent) {
      embedment = legacy;
      if (legacy === null) {
        add(
          "y_offset_inches",
          "pole_depth_unavailable",
          "record a finite, nonnegative depth in ground in inches before repricing"
        );
      } else {
        embedmentSource = "y_offset_inches";
      }
    } else if (embedment !== null && legacy !== null && legacy !== embedment) {
      add(
        "embedment_inches",
        "pole_embedment_conflict",
        "embedment and legacy depth-in-ground record different values \u2014 clear one before repricing"
      );
    }
  }
  if (!canonEmbedPresent && !legacyEmbedPresent) {
    add(
      "y_offset_inches",
      "pole_depth_unavailable",
      "record a finite, nonnegative depth in ground in inches before repricing"
    );
  }
  const baseRaw = p.base_offset_inches;
  let baseOffset = 0;
  let baseSource = "default";
  if (recorded(baseRaw)) {
    baseOffset = inventoryNonnegativeMeasurement(baseRaw);
    if (baseOffset === null) {
      add(
        "base_offset_inches",
        "pole_base_offset_unavailable",
        "record a finite, nonnegative base offset above grade in inches or clear it before repricing"
      );
    } else {
      baseSource = "base_offset_inches";
    }
  }
  const totalRaw = p.total_length_inches;
  let total = null;
  let totalSource = "derived";
  if (recorded(totalRaw)) {
    total = inventoryPositiveNumber(totalRaw);
    if (total === null) {
      add(
        "total_length_inches",
        "pole_total_length_unavailable",
        "record a positive, finite total stock length in inches or clear it before repricing"
      );
    } else {
      totalSource = "total_length_inches";
    }
  }
  let required = null;
  if (totalSource === "total_length_inches" && total !== null) {
    required = total;
    if (height !== null && embedment !== null && total < height + embedment) {
      add(
        "total_length_inches",
        "pole_total_length_conflict",
        "total stock length is shorter than height above grade plus embedment \u2014 lengthen it or clear it before repricing"
      );
    }
  } else if (height !== null && embedment !== null) {
    required = height + embedment;
  }
  const authoredShapePresent = recorded(p.pole_shape);
  const shapeRaw = authoredShapePresent ? p.pole_shape : inv?.pole_shape;
  let shape = null;
  let shapeSource = null;
  let shapeKnown = false;
  if (recorded(shapeRaw)) {
    if (typeof shapeRaw !== "string") {
      add(
        "pole_shape",
        "pole_shape_unavailable",
        "recorded pole shape must be a value like round or square \u2014 clear or correct it before repricing"
      );
    } else {
      shape = shapeRaw.trim().toLowerCase();
      shapeSource = authoredShapePresent ? "pole_shape" : "catalog";
      shapeKnown = POLE_SHAPE_VALUES.includes(shape);
    }
  }
  const cross_section = inv == null ? null : {
    shape,
    width_inches: inventoryNonnegativeMeasurement(inv.pole_width_inches),
    depth_inches: inventoryNonnegativeMeasurement(inv.pole_depth_inches),
    wall_thickness_inches: inventoryNonnegativeMeasurement(inv.pole_wall_thickness_inches)
  };
  const planOffset = {
    x_inches: inventoryFiniteNumber(p.x_inches) ?? 0,
    z_inches: inventoryFiniteNumber(p.z_inches) ?? 0
  };
  return {
    height_above_grade_inches: height,
    embedment_inches: embedment,
    base_offset_inches: baseOffset,
    plan_offset_inches: planOffset,
    total_length_inches: total,
    required_length_inches: required,
    pole_shape: shape,
    pole_shape_known: shapeKnown,
    cross_section,
    sources: {
      height_above_grade: heightSource,
      embedment: embedmentSource,
      base_offset: baseSource,
      total_length: totalSource,
      shape: shapeSource
    },
    problems
  };
}
var POLE_ORIGIN_LEGACY_ITEM = "legacy_item";
function polePricing(pole, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const id = pole?.pole_id;
  const paint = { costPerLf: null, laborPerLf: null, sizeMultiplier: null };
  const add = (field, code, message) => issues.push({
    kind: "pole",
    index,
    componentId: pole?.component_id ?? pole?.id ?? null,
    field,
    inventoryId: assignedId2(id) ? id : null,
    code,
    message: `Pole ${index + 1}: ${message}.`
  });
  if (pole?.pole_origin === POLE_ORIGIN_LEGACY_ITEM) {
    add(
      "pole_origin",
      "pole_legacy_representation",
      "legacy item-pole data cannot price here \u2014 migrate it into the Poles section or remove it"
    );
    return { issues, inv: null, geometry: null, painting: false, rate: null, stockLengthInches: null, widthInches: null, paint };
  }
  let inv = null;
  if (!assignedId2(id)) {
    add("pole_id", "catalog_item_unassigned", "select a catalog material");
  } else {
    const matches = inventory.filter((row) => row?.id === id);
    if (!matches.length) {
      add("pole_id", "catalog_item_unavailable", "selected catalog material is unavailable");
    } else if (matches.length !== 1) {
      add("pole_id", "catalog_item_ambiguous", "selected catalog material is ambiguous");
    } else if (matches[0].material_type !== "pole") {
      add("pole_id", "catalog_item_type_mismatch", "selected catalog material is not a pole");
    } else {
      const availability = foundationCatalogRowAvailability(matches[0]);
      if (availability !== "active") {
        add(
          "pole_id",
          availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
          availability === "deleted" ? "selected catalog material is marked deleted \u2014 pick a replacement" : "selected catalog material is inactive \u2014 reactivate it or pick a replacement"
        );
      } else {
        inv = matches[0];
      }
    }
  }
  const geometry = foundationPoleGeometry(pole, inv);
  for (const problem of geometry.problems) add(problem.field, problem.code, problem.message);
  const painting = pole?.include_pole_painting === true;
  let rate = null;
  let stockLengthInches = null;
  let widthInches = null;
  if (inv) {
    const override = pole?.custom_cost_per_unit;
    const hasOverride = override !== void 0 && override !== null;
    const stockMode = inv.pole_pricing_mode === "stock_price";
    rate = inventoryNonnegativeNumber(hasOverride ? override : stockMode ? inv.pole_stock_price : inv.cost_per_unit);
    if (rate === null) {
      add(
        hasOverride ? "custom_cost_per_unit" : stockMode ? "pole_stock_price" : "cost_per_unit",
        "pole_price_unavailable",
        "record a finite, nonnegative pole price before repricing"
      );
    }
    if (stockMode) {
      const stockLengthFt = inventoryPositiveSettingNumber(inv.pole_stock_length_ft, 20);
      if (stockLengthFt === null) {
        add(
          "pole_stock_length_ft",
          "pole_stock_length_unavailable",
          "the selected catalog stock length must be a recorded finite positive number"
        );
      } else {
        stockLengthInches = stockLengthFt * 12;
      }
    }
    if (painting) {
      widthInches = inventoryPositiveSettingNumber(inv.pole_width_inches, 6);
      if (widthInches === null) {
        add(
          "pole_width_inches",
          "pole_width_unavailable",
          "the selected catalog pole width must be a recorded finite positive number"
        );
      }
      const paintSetting = (key, label) => {
        const value = inventorySettingNumber(settings?.[key], POLE_PAINT_SETTING_DEFAULTS[key]);
        if (value === null) {
          add(
            key,
            "pole_paint_setting_unavailable",
            `record a finite, nonnegative ${label} before repricing`
          );
        }
        return value;
      };
      paint.costPerLf = paintSetting("pole_paint_cost_per_lf", "pole paint cost per LF");
      paint.laborPerLf = paintSetting("pole_paint_labor_per_lf", "pole paint labor per LF");
      paint.sizeMultiplier = paintSetting(polePaintMultiplierKey(widthInches), "pole paint size multiplier");
    }
  }
  return { issues, inv, geometry, painting, rate, stockLengthInches, widthInches, paint };
}
function calcPoles(poles = [], inventory = [], settings = {}, options = {}) {
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedPoles");
  const savedPoles = Array.isArray(options?.savedPoles) ? options.savedPoles : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId2(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(poles), savedCounts = counts(savedPoles);
  const savedById = new Map(savedPoles.filter((row) => assignedId2(row?.component_id)).map((row) => [row.component_id, row]));
  const held = (pole) => {
    const id = pole?.component_id;
    const acknowledged = explicitSnapshot ? assignedId2(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null : pole;
    const result = { ...pole };
    if (explicitSnapshot) {
      for (const field of [
        "pole_name",
        "pole_cost",
        "pole_painting_cost",
        "total_cost",
        "required_length_inches",
        "stock_pieces"
      ]) {
        if (acknowledged && Object.prototype.hasOwnProperty.call(acknowledged, field)) result[field] = acknowledged[field];
        else delete result[field];
      }
    }
    return result;
  };
  const results = (poles || []).map((pole, index) => polePricing(pole, inventory, index, settings));
  return {
    poles: results.map((check, index) => {
      const pole = poles[index];
      if (check.issues.length) return held(pole);
      const { inv, geometry, rate, stockLengthInches, widthInches, paint } = check;
      const requiredInches = geometry.required_length_inches;
      let poleCost;
      let stockPieces = null;
      if (inv.pole_pricing_mode === "stock_price") {
        stockPieces = Math.ceil(requiredInches / stockLengthInches);
        poleCost = stockPieces * rate;
      } else {
        poleCost = requiredInches / 12 * rate;
      }
      const paintingCost = check.painting ? calcPolePaintingCost(
        { include_pole_painting: true, height_inches: requiredInches, y_offset_inches: 0 },
        { ...inv, pole_width_inches: widthInches },
        {
          pole_paint_cost_per_lf: paint.costPerLf,
          pole_paint_labor_per_lf: paint.laborPerLf,
          [polePaintMultiplierKey(widthInches)]: paint.sizeMultiplier
        }
      ) : 0;
      return {
        ...pole,
        // Resolved-geometry snapshots (CMP-E02): the canonical embedment
        // materializes alongside the authored legacy spelling; required
        // length, stock pieces, base offset and resolved shape persist so the
        // BOM, preview and handoff read the same distinct quantities.
        embedment_inches: geometry.embedment_inches,
        base_offset_inches: geometry.base_offset_inches,
        required_length_inches: requiredInches,
        stock_pieces: stockPieces,
        ...geometry.pole_shape !== null ? { pole_shape: geometry.pole_shape } : {},
        pole_name: inv.material_name || "",
        pole_cost: poleCost,
        pole_painting_cost: paintingCost,
        total_cost: poleCost + paintingCost
      };
    }),
    polePricing: results.map((check) => ({
      available: check.issues.length === 0,
      issues: check.issues,
      // Resolved canonical geometry for display surfaces (never priced again).
      geometry: check.geometry
    }))
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/landscapeMaterials.js
var LANDSCAPE_MATERIALS = [
  { key: "dirt", label: "Dirt (Eraser)", color: "#a1866f", cost_per_sqft: 0 },
  { key: "grass", label: "Grass", color: "#4ade80", cost_per_sqft: 0.75 },
  { key: "concrete", label: "Concrete", color: "#cbd5e1", cost_per_sqft: 8 },
  { key: "asphalt", label: "Asphalt", color: "#475569", cost_per_sqft: 5 },
  { key: "gravel", label: "Gravel", color: "#94a3b8", cost_per_sqft: 2.25 },
  { key: "sand", label: "Sand", color: "#fcd34d", cost_per_sqft: 1.75 },
  { key: "mulch", label: "Mulch", color: "#92400e", cost_per_sqft: 1.25 },
  { key: "wood_decking", label: "Wood Decking", color: "#d97706", cost_per_sqft: 14 },
  { key: "water", label: "Water", color: "#38bdf8", cost_per_sqft: 6 }
];
var materialByKey = (key) => LANDSCAPE_MATERIALS.find((m) => m.key === key);
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function landscapeInputIssues(landscape) {
  const issues = [];
  if (landscape === void 0 || landscape === null) return issues;
  const add = (field, code, message) => issues.push({
    kind: "landscape",
    index: null,
    componentId: null,
    field,
    code,
    message: `Landscape: ${message}`
  });
  const rawCells = landscape.cells;
  const cells = isRecord(rawCells) ? rawCells : null;
  if (rawCells !== void 0 && rawCells !== null && cells === null) {
    add(
      "cells",
      "landscape_cells_unavailable",
      "the recorded site grid is malformed \u2014 repair or clear it before repricing"
    );
    return issues;
  }
  const painted = Object.entries(cells || {}).filter(([, key]) => key && key !== "dirt");
  if (!painted.length) return issues;
  if (inventoryPositiveNumber(landscape.cell_size_inches) === null) {
    add(
      "cell_size_inches",
      "landscape_cell_size_unavailable",
      "record a finite, positive cell size in inches before repricing site materials"
    );
  }
  const reported = /* @__PURE__ */ new Set();
  for (const [, key] of painted) {
    if (reported.has(key)) continue;
    reported.add(key);
    const mat2 = materialByKey(key);
    if (!mat2) {
      add(
        "cells",
        "landscape_material_unavailable",
        `site material ${JSON.stringify(key)} is not in the landscape catalog \u2014 pick a catalog material or erase it before repricing`
      );
    } else if (inventoryNonnegativeNumber(mat2.cost_per_sqft) === null) {
      add(
        "cost_per_sqft",
        "landscape_material_price_unavailable",
        `record a finite, nonnegative cost per sq ft for "${mat2.label}" before repricing`
      );
    }
  }
  return issues;
}
var landscapeSummary = (landscape) => {
  const cells = isRecord(landscape?.cells) ? landscape.cells : {};
  const cellSize = inventoryPositiveNumber(landscape?.cell_size_inches);
  const sqftPerCell = cellSize === null ? null : Math.pow(cellSize / 12, 2);
  const counts = {};
  const rows = {};
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt") return;
    counts[key] = (counts[key] || 0) + 1;
    if (sqftPerCell !== null) rows[key] = (rows[key] || 0) + sqftPerCell;
  });
  const lines = Object.entries(counts).map(([key, count]) => {
    const mat2 = materialByKey(key);
    const sqft = sqftPerCell === null ? null : rows[key];
    const rate = mat2 ? inventoryNonnegativeNumber(mat2.cost_per_sqft) : null;
    return {
      key,
      label: mat2?.label || key,
      color: mat2?.color || "#999",
      cells: count,
      sqft,
      cost: sqft === null || rate === null ? null : sqft * rate
    };
  });
  const total = lines.every((l) => l.cost !== null) ? lines.reduce((s, l) => s + l.cost, 0) : null;
  return { lines, total, issues: landscapeInputIssues(landscape) };
};

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationGeometryInputs.js
var foundationInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number3 = Number(value);
  return Number.isFinite(number3) ? number3 : null;
};
var foundationPositiveWholeNumber = (value) => {
  const number3 = foundationInputNumber(value);
  const whole3 = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole3 && Number.isSafeInteger(number3) && number3 > 0;
};
function foundationGeometryValidation(item, index = 0) {
  const record = item ?? {};
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "foundation",
    index,
    componentId: record.component_id ?? null,
    field,
    code,
    message: `Foundation ${index + 1}: ${message}`
  });
  const type = record.foundation_type;
  if (type !== "spread_foot" && type !== "pillar") {
    add("foundation_type", "foundation_type_invalid", "select Spread Footing or Pillar / Caisson.");
  }
  const count = record.quantity ?? 1;
  const quantity3 = foundationInputNumber(count);
  if (!foundationPositiveWholeNumber(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot" ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]] : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = foundationInputNumber(record[field]);
    dimensions[field] = value;
    if (value === null || value <= 0) {
      add(field, "foundation_dimension_invalid", `${label} (inches) must be a finite positive number.`);
    }
  }
  if (!issues.length) {
    const depth = dimensions.depth_inches / 12;
    const radius = dimensions.diameter / 24;
    const volume = type === "spread_foot" ? dimensions.length_inches / 12 * (dimensions.width_inches / 12) * depth / 27 * quantity3 : Math.PI * radius * radius * depth / 27 * quantity3;
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
  return { issues, type, quantity: quantity3, dimensions };
}
function foundationItemGeometryIssues(item, index = 0) {
  return foundationGeometryValidation(item, index).issues;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementModel.js
var MAX_GEOMETRY = 4096;
var MAX_SUPPORTS = 4096;
var SUPPORT_CAGE_TARGET = "cage";
var less = (a, b) => a < b - 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
var emptyQuantities = () => ({
  horizontal_count: 0,
  horizontal_length_inches: 0,
  longitudinal_count: 0,
  longitudinal_length_inches: 0,
  hoop_count: 0,
  hoop_length_inches: 0,
  inter_mat_tie_count: 0,
  inter_mat_tie_length_inches: 0,
  mat_crossings: 0,
  hoop_bar_crossings: 0,
  tie_ends: 0
});
function modelContext(item, design, geometryLimit) {
  const issues = [], groups = [], geometry = [], ids = /* @__PURE__ */ new Set();
  const counts = emptyQuantities();
  let missing = false;
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const required = (field, message) => {
    missing = true;
    issue(field, "reinforcement_input_required", message);
  };
  const number3 = (value, field, { zero = false, integer = false } = {}) => {
    if (value === void 0 || value === null) {
      required(field, "An explicit value is required.");
      return null;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || (zero ? value < 0 : value <= 0) || integer && !Number.isSafeInteger(value)) {
      issue(field, "reinforcement_number_invalid", `Use a finite ${zero ? "nonnegative" : "positive"}${integer ? " whole" : ""} number.`);
      return null;
    }
    return value;
  };
  const list2 = (value, field, limit, allowEmpty = true) => {
    if (value === void 0 || value === null) {
      required(field, "An explicit list is required.");
      return [];
    }
    if (!Array.isArray(value) || value.length > limit || !allowEmpty && !value.length) {
      issue(field, "reinforcement_list_invalid", `Use ${allowEmpty ? "up to" : "one to"} ${limit} records.`);
      return [];
    }
    return value;
  };
  const identity = (value, field) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value) || ids.has(value)) {
      issue(field, "reinforcement_id_invalid", "Use a unique stable identifier (letters, numbers, hyphen or underscore).");
      return null;
    }
    ids.add(value);
    return value;
  };
  const bounds = (value, min, max, field) => {
    if (value !== null && (less(value, min) || less(max, value))) {
      issue(field, "reinforcement_clearance_invalid", "The authored geometry does not fit the concrete and explicit clearances.");
      return false;
    }
    return value !== null;
  };
  const group = (id, role, count, length, makeGeometry) => {
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(length) || length <= 0) {
      issue(id, "reinforcement_numeric_range_invalid", "The steel quantity is outside the supported numeric range.");
      return;
    }
    if (!count) return;
    groups.push({ id, role, count, cut_length_inches: length, diameter_inches: design.bar_diameter_inches });
    counts[`${role}_count`] += count;
    counts[`${role}_length_inches`] += count * length;
    const generated = Math.min(count, geometryLimit - geometry.length);
    for (let i = 0; i < generated; i++) geometry.push({ id: `${id}/${i}`, groupId: id, role, ...makeGeometry(i) });
  };
  return {
    item,
    design,
    issues,
    groups,
    geometry,
    counts,
    issue,
    required,
    number: number3,
    list: list2,
    identity,
    bounds,
    group,
    supportContext: null,
    get missing() {
      return missing;
    }
  };
}
function spreadSteel(c, dimensions, covers, diameter) {
  const { design, number: number3, list: list2, identity, bounds, issue, group, counts } = c;
  const { length, width, depth } = dimensions;
  const radius = diameter / 2, edge = covers.side + radius;
  const xSpan = length - 2 * edge, zSpan = width - 2 * edge;
  if (less(xSpan, 0) || less(zSpan, 0)) {
    issue("cover_inches.side", "reinforcement_clearance_invalid", "Side cover and bar diameter leave no room for the mat.");
    return;
  }
  const mats = /* @__PURE__ */ new Map();
  const rawMats = list2(design.spread?.mats, "spread.mats", 256, false);
  rawMats.forEach((mat2, index) => {
    const field = `spread.mats.${index}`;
    const id = identity(mat2?.id, `${field}.id`);
    const bearing = number3(mat2?.bearing_elevation_inches, `${field}.bearing_elevation_inches`, { zero: true });
    const sx = number3(mat2?.max_spacing_x_inches, `${field}.max_spacing_x_inches`);
    const sz = number3(mat2?.max_spacing_z_inches, `${field}.max_spacing_z_inches`);
    if ([id, bearing, sx, sz].some((v) => v === null)) return;
    if (!bounds(bearing, covers.bottom, depth - covers.top - 2 * diameter, field)) return;
    const nx = xSpan <= 0 ? 1 : Math.ceil(xSpan / sx) + 1;
    const nz = zSpan <= 0 ? 1 : Math.ceil(zSpan / sz) + 1;
    const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
    group(`${id}/x`, "horizontal", nz, length - 2 * covers.side, (i) => ({
      kind: "segment",
      matId: id,
      diameter_inches: diameter,
      from: { x: covers.side, y: bearing + radius, z: at(nz, i, zSpan) },
      to: { x: length - covers.side, y: bearing + radius, z: at(nz, i, zSpan) }
    }));
    group(`${id}/z`, "horizontal", nx, width - 2 * covers.side, (i) => ({
      kind: "segment",
      matId: id,
      diameter_inches: diameter,
      from: { x: at(nx, i, xSpan), y: bearing + 3 * radius, z: covers.side },
      to: { x: at(nx, i, xSpan), y: bearing + 3 * radius, z: width - covers.side }
    }));
    counts.mat_crossings += nx * nz;
    mats.set(id, { id, bearing, field });
  });
  const sorted = [...mats.values()].sort((a, b) => a.bearing - b.bearing);
  sorted.forEach((mat2, index) => {
    if (index && less(mat2.bearing - sorted[index - 1].bearing, 2 * diameter)) {
      issue(mat2.field, "reinforcement_mat_overlap", "Mat tier envelopes overlap.");
    }
  });
  c.supportContext = { kind: "spread", edge, xSpan, zSpan, mats: sorted, diameter, covers, dimensions };
  list2(design.spread?.inter_mat_ties, "spread.inter_mat_ties", 2048).forEach((tie, index) => {
    const field = `spread.inter_mat_ties.${index}`;
    const id = identity(tie?.id, `${field}.id`);
    const from = mats.get(tie?.from_mat_id), to = mats.get(tie?.to_mat_id);
    const x = number3(tie?.x_inches, `${field}.x_inches`, { zero: true });
    const z = number3(tie?.z_inches, `${field}.z_inches`, { zero: true });
    const length2 = number3(tie?.cut_length_inches, `${field}.cut_length_inches`);
    if (!from || !to || from.id === to.id) {
      issue(field, "reinforcement_tie_parent_invalid", "Tie endpoints require two distinct existing mats.");
      return;
    }
    if ([id, x, z, length2].some((v) => v === null)) return;
    if (!bounds(x, edge, dimensions.length - edge, `${field}.x_inches`) || !bounds(z, edge, width - edge, `${field}.z_inches`)) return;
    const distance = Math.abs(to.bearing - from.bearing);
    if (less(length2, distance)) {
      issue(`${field}.cut_length_inches`, "reinforcement_tie_length_invalid", "Cut length is shorter than the mat-to-mat path.");
      return;
    }
    group(id, "inter_mat_tie", 1, length2, () => ({
      kind: "tie_reference",
      diameter_inches: diameter,
      from: { x, y: from.bearing + radius, z },
      to: { x, y: to.bearing + radius, z }
    }));
    counts.tie_ends += 2;
  });
  if (counts.inter_mat_tie_count) issue(
    "spread.inter_mat_ties",
    "reinforcement_tie_path_only",
    "Tie paths are references; authored cut lengths include any hook/bend allowance and require engineering/fabrication review.",
    "warning"
  );
}
function supportTargets(c) {
  const sc = c.supportContext;
  if (!sc) return [];
  if (sc.kind === "pillar") {
    if (!sc.cage) return [];
    return [{
      target_id: SUPPORT_CAGE_TARGET,
      mat_id: null,
      base: "concrete_bottom",
      base_elevation_inches: 0,
      required_height_inches: sc.cage.bottom_end_inches,
      footprint: { kind: "pillar", center_inches: sc.center }
    }];
  }
  return sc.mats.map((mat2, index) => {
    const lower = index ? sc.mats[index - 1] : null;
    const baseElevation = lower ? lower.bearing + 2 * sc.diameter : 0;
    return {
      target_id: mat2.id,
      mat_id: mat2.id,
      base: lower ? "mat_below" : "concrete_bottom",
      base_elevation_inches: baseElevation,
      required_height_inches: mat2.bearing - baseElevation,
      footprint: {
        kind: "spread",
        edge_inches: sc.edge,
        x_span_inches: sc.xSpan,
        z_span_inches: sc.zSpan,
        length_inches: sc.dimensions.length,
        width_inches: sc.dimensions.width
      }
    };
  });
}
function supportGridPositions(footprint, spacing) {
  const { edge_inches: edge, x_span_inches: xSpan, z_span_inches: zSpan } = footprint;
  const nx = Math.ceil(xSpan / spacing) + 1;
  const nz = Math.ceil(zSpan / spacing) + 1;
  const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
  const positions = [];
  for (let zi = 0; zi < nz; zi += 1) {
    for (let xi = 0; xi < nx; xi += 1) positions.push({ x: at(nx, xi, xSpan), z: at(nz, zi, zSpan) });
  }
  return positions;
}
function supportCountPositions(footprint, count) {
  const { edge_inches: edge, x_span_inches: xSpan, z_span_inches: zSpan } = footprint;
  const aspect = zSpan > 0 ? xSpan / zSpan : count;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  const rows = Math.ceil(count / cols);
  const at = (n, i, span) => edge + (n === 1 ? span / 2 : span * (i / (n - 1)));
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    positions.push({ x: at(cols, i % cols, xSpan), z: at(rows, Math.floor(i / cols), zSpan) });
  }
  return positions;
}
function supportsPlan(c) {
  const config = c.design.supports;
  const mode = config?.mode ?? "unconfigured";
  const result = {
    status: "unconfigured",
    mode,
    count: null,
    requirements: [],
    uncovered: [],
    placements: [],
    context: null
  };
  if (mode === "off") {
    if (typeof config.reason !== "string" || !config.reason.trim()) {
      c.required("supports.reason", "Explain how the steel is supported when support items are off.");
      return result;
    }
    c.issue("supports", "reinforcement_supports_off_explained", "Support items are off with an explicit explanation; this is not an engineering approval.", "warning");
    return { ...result, status: "off_explained", count: 0, reason: config.reason.trim() };
  }
  if (!["unconfigured", "manual", "auto"].includes(mode)) {
    c.issue("supports.mode", "reinforcement_support_mode_invalid", "Choose a supported support-selection mode.");
    return result;
  }
  if (mode === "unconfigured") {
    c.issue("supports", "reinforcement_supports_unconfigured", "Supports have not been modeled or priced; no zero quantity or build-ready status is inferred.", "warning");
    return result;
  }
  const sc = c.supportContext;
  const targets = supportTargets(c);
  if (!sc || !targets.length) {
    c.issue("supports", "reinforcement_supports_unconfigured", "No modeled steel accepts supports in this design; no zero quantity or build-ready status is inferred.", "warning");
    return result;
  }
  result.context = sc.kind === "pillar" ? { kind: "pillar", center_inches: sc.center, depth_inches: sc.dimensions.depth, diameter_inches: sc.diameter } : {
    kind: "spread",
    edge_inches: sc.edge,
    length_inches: sc.dimensions.length,
    width_inches: sc.dimensions.width,
    depth_inches: sc.dimensions.depth,
    diameter_inches: sc.diameter
  };
  const coverage = /* @__PURE__ */ new Map();
  const labelOf = (target) => target.mat_id ? `Mat ${target.mat_id}` : "The pillar cage";
  if (mode === "auto") {
    if (sc.kind === "pillar") {
      c.issue(
        "supports.mode",
        "reinforcement_support_mode_unavailable",
        "Auto support placement is unavailable for pillar cages; place manual supports or explain off."
      );
      return result;
    }
    const spacing = c.number(config?.spacing_inches, "supports.spacing_inches");
    if (spacing === null) return result;
    for (const target of targets) {
      coverage.set(target.target_id, { positions: supportGridPositions(target.footprint, spacing) });
    }
  } else {
    const optList = (value, field, limit) => {
      if (value === void 0 || value === null) return [];
      if (!Array.isArray(value) || value.length > limit) {
        c.issue(field, "reinforcement_list_invalid", `Use up to ${limit} records.`);
        return [];
      }
      return value;
    };
    const targetFor = (ref, field) => {
      const cageRef = ref === void 0 || ref === null || ref === "" || ref === SUPPORT_CAGE_TARGET;
      const target = cageRef ? sc.kind === "pillar" ? targets[0] : null : targets.find((record) => record.target_id === ref);
      if (!target) {
        c.issue(
          field,
          "reinforcement_support_target_invalid",
          "Support coverage requires an existing spread mat or the pillar cage."
        );
      }
      return target;
    };
    optList(config?.mats, "supports.mats", 256).forEach((entry, index) => {
      const field = `supports.mats.${index}`;
      const target = targetFor(entry?.mat_id, `${field}.mat_id`);
      const count = c.number(entry?.count, `${field}.count`, { zero: true, integer: true });
      if (!target || count === null) return;
      const cov = coverage.get(target.target_id) || {};
      if (cov.positions || cov.count !== void 0) {
        c.issue(
          field,
          "reinforcement_support_manual_ambiguous",
          "Cover each target once: an authored count or explicit placements, not both."
        );
        return;
      }
      coverage.set(target.target_id, { ...cov, count });
    });
    optList(config?.placements, "supports.placements", MAX_SUPPORTS).forEach((entry, index) => {
      const field = `supports.placements.${index}`;
      const target = targetFor(entry?.mat_id, `${field}.mat_id`);
      const x = c.number(entry?.x_inches, `${field}.x_inches`, { zero: true });
      const z = c.number(entry?.z_inches, `${field}.z_inches`, { zero: true });
      if (!target || x === null || z === null) return;
      if (sc.kind === "pillar") {
        if (Math.hypot(x - sc.center, z - sc.center) > sc.center) {
          c.issue(
            field,
            "reinforcement_support_placement_out_of_bounds",
            "Support position is outside the concrete footprint."
          );
          return;
        }
      } else {
        const footprint = target.footprint;
        if (less(x, footprint.edge_inches) || less(footprint.length_inches - footprint.edge_inches, x) || less(z, footprint.edge_inches) || less(footprint.width_inches - footprint.edge_inches, z)) {
          c.issue(
            field,
            "reinforcement_support_placement_out_of_bounds",
            "Support position is outside the supported mat footprint."
          );
          return;
        }
      }
      const cov = coverage.get(target.target_id) || {};
      if (cov.count !== void 0) {
        c.issue(
          field,
          "reinforcement_support_manual_ambiguous",
          "Cover each target once: an authored count or explicit placements, not both."
        );
        return;
      }
      (cov.positions ||= []).push({ x, z });
      coverage.set(target.target_id, cov);
    });
  }
  let total = 0;
  for (const target of targets) {
    const cov = coverage.get(target.target_id) || {};
    let positions = cov.positions;
    if (positions === void 0 && cov.count !== void 0) {
      positions = supportCountPositions(target.footprint, cov.count);
    }
    positions ||= [];
    const needed = target.required_height_inches > 0;
    if (!needed) {
      if (positions.length && mode === "manual") {
        c.issue(
          "supports",
          "reinforcement_support_height_infeasible",
          `${labelOf(target)} bears directly on its base plane; authored supports cannot fit under it.`
        );
      } else {
        c.issue(
          "supports",
          "reinforcement_support_unneeded",
          `${labelOf(target)} bears directly on its base plane; no support device is required for it.`,
          "warning"
        );
      }
      continue;
    }
    if (!positions.length) {
      c.issue(
        "supports",
        "reinforcement_support_mat_unsupported",
        `${labelOf(target)} has no modeled supports; verify how it is held before build.`,
        "warning"
      );
      result.uncovered.push({ target_id: target.target_id, mat_id: target.mat_id });
      continue;
    }
    total += positions.length;
    if (total > MAX_SUPPORTS) {
      c.issue(
        "supports",
        "reinforcement_numeric_range_invalid",
        "Modeled support positions exceed the supported numeric range."
      );
      return result;
    }
    result.requirements.push({ ...target, count: positions.length, positions });
    for (const position of positions) {
      result.placements.push({
        target_id: target.target_id,
        mat_id: target.mat_id,
        x: position.x,
        z: position.z,
        base: target.base,
        base_elevation_inches: target.base_elevation_inches,
        required_height_inches: target.required_height_inches
      });
    }
  }
  result.status = "modeled";
  result.count = total;
  return result;
}
function pillarSteel(c, dimensions, covers, diameter) {
  const { design, number: number3, list: list2, identity, bounds, issue, group, counts } = c;
  const radius = diameter / 2, center = dimensions.diameter / 2;
  const outer = center - covers.side;
  const longitudinal = design.pillar?.longitudinal;
  const n = number3(longitudinal?.count, "pillar.longitudinal.count", { zero: true, integer: true });
  let long = null;
  if (n > 0) {
    const r = number3(longitudinal.radius_inches, "pillar.longitudinal.radius_inches", { zero: true });
    const bottom = number3(longitudinal.bottom_end_inches, "pillar.longitudinal.bottom_end_inches", { zero: true });
    const top = number3(longitudinal.top_end_inches, "pillar.longitudinal.top_end_inches", { zero: true });
    if (![r, bottom, top].some((v) => v === null)) {
      bounds(r, 0, outer - radius, "pillar.longitudinal.radius_inches");
      bounds(bottom, covers.bottom, dimensions.depth - covers.top, "pillar.longitudinal.bottom_end_inches");
      bounds(top, covers.bottom, dimensions.depth - covers.top, "pillar.longitudinal.top_end_inches");
      if (top <= bottom) issue("pillar.longitudinal", "reinforcement_length_invalid", "Longitudinal bar ends require a positive cut length.");
      if (n > 1 && less(2 * r * Math.sin(Math.PI / n), diameter)) {
        issue("pillar.longitudinal", "reinforcement_bar_overlap", "Longitudinal bars overlap on the authored radius.");
      }
      group("pillar/longitudinal", "longitudinal", n, top - bottom, (i) => {
        const angle = i * 2 * Math.PI / n;
        const x = center + r * Math.cos(angle), z = center + r * Math.sin(angle);
        return { kind: "segment", diameter_inches: diameter, from: { x, y: bottom, z }, to: { x, y: top, z } };
      });
      long = { r, bottom, top };
    }
  }
  const hoops = [];
  list2(design.pillar?.hoops, "pillar.hoops", 256).forEach((hoop, index) => {
    const field = `pillar.hoops.${index}`;
    const id = identity(hoop?.id, `${field}.id`);
    const y = number3(hoop?.center_y_inches, `${field}.center_y_inches`, { zero: true });
    const d = number3(hoop?.centerline_diameter_inches, `${field}.centerline_diameter_inches`);
    const allowance = number3(hoop?.cut_allowance_inches, `${field}.cut_allowance_inches`, { zero: true });
    if ([id, y, d, allowance].some((v) => v === null)) return;
    const r = d / 2;
    if (less(d, diameter)) issue(
      `${field}.centerline_diameter_inches`,
      "reinforcement_hoop_self_overlap",
      "Hoop centerline diameter is smaller than the bar diameter."
    );
    bounds(y, covers.bottom + radius, dimensions.depth - covers.top - radius, `${field}.center_y_inches`);
    bounds(r, 0, outer - radius, `${field}.centerline_diameter_inches`);
    for (const other of hoops) {
      if (less(Math.hypot(other.y - y, other.r - r), diameter)) {
        issue(field, "reinforcement_hoop_overlap", "Hoop envelopes overlap.");
      }
    }
    hoops.push({ y, r });
    group(id, "hoop", 1, Math.PI * d + allowance, () => ({
      kind: "hoop",
      center: { x: center, y, z: center },
      centerline_radius_inches: r,
      diameter_inches: diameter,
      cut_allowance_inches: allowance
    }));
    if (long) {
      const radial = Math.abs(r - long.r);
      const outsideY = Math.max(long.bottom - y, y - long.top, 0);
      if (less(Math.hypot(radial, outsideY), diameter)) {
        issue(field, "reinforcement_bar_overlap", "Hoop and longitudinal bar envelopes overlap.");
      } else if (!outsideY && !less(diameter, radial)) counts.hoop_bar_crossings += n;
      else issue(field, "reinforcement_connection_unverified", "Hoop-to-longitudinal connections are not established by this geometry.", "warning");
    }
  });
  if (hoops.length) issue(
    "pillar.hoops",
    "reinforcement_hoop_allowance_authored",
    "Hoop cut allowance is authored explicitly; hooks, laps and structural adequacy require review.",
    "warning"
  );
  c.supportContext = {
    kind: "pillar",
    center,
    outer,
    diameter,
    covers,
    dimensions,
    cage: long ? { bottom_end_inches: long.bottom } : null
  };
}
function quantityTotals(counts, quantity3) {
  const totals = {};
  for (const [key, value] of Object.entries(counts)) {
    const length = key.endsWith("_length_inches");
    totals[length ? key.replace("_length_inches", "_feet") : key] = (length ? value / 12 : value) * quantity3;
  }
  totals.total_steel_feet = ["horizontal", "longitudinal", "hoop", "inter_mat_tie"].reduce((sum, role) => sum + totals[`${role}_feet`], 0);
  return totals;
}
function calculateFoundationReinforcementModel(item = {}, design, options = {}) {
  item = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const geometryLimit = options?.geometryLimit ?? MAX_GEOMETRY;
  const base2 = {
    version: 2,
    componentId: item.component_id ?? null,
    instanceCount: null,
    engineeringApproved: false,
    status: "invalid",
    issues: [],
    perInstance: null,
    totals: null,
    groups: [],
    geometry: [],
    omittedGeometryCount: 0,
    supports: { status: "unconfigured", mode: "unconfigured", count: null, requirements: [], uncovered: [], placements: [], context: null }
  };
  const foundationIssues = foundationItemGeometryIssues({ ...item, include_rebar: false });
  if (foundationIssues.length) return {
    ...base2,
    issues: foundationIssues.map(({ field, code, message }) => ({ field, code, message, severity: "error" }))
  };
  const quantity3 = Number(item.quantity ?? 1);
  base2.instanceCount = quantity3;
  if (!item.include_rebar) return {
    ...base2,
    status: "off",
    perInstance: emptyQuantities(),
    totals: quantityTotals(emptyQuantities(), quantity3),
    supports: { status: "not_required", mode: null, count: 0, requirements: [], uncovered: [], placements: [], context: null }
  };
  const c = modelContext(item, design ?? {}, geometryLimit);
  if (!Number.isSafeInteger(geometryLimit) || geometryLimit < 0 || geometryLimit > MAX_GEOMETRY) {
    c.issue("geometryLimit", "reinforcement_geometry_budget_invalid", `Geometry budget must be a whole number from zero to ${MAX_GEOMETRY}.`);
  }
  if (design?.version !== 2) {
    if (design?.version === void 0 || design?.version === null) c.required("version", "An explicit version-2 reinforcement design is required.");
    else c.issue("version", "reinforcement_version_invalid", "This model accepts only version 2.");
  }
  const diameter = c.number(design?.bar_diameter_inches, "bar_diameter_inches");
  const covers = Object.fromEntries(["side", "top", "bottom"].map((key) => [
    key,
    c.number(design?.cover_inches?.[key], `cover_inches.${key}`, { zero: true })
  ]));
  if (!c.issues.some((i) => i.severity === "error")) {
    const dimensions = {
      length: Number(item.length_inches),
      width: Number(item.width_inches),
      depth: Number(item.depth_inches),
      diameter: Number(item.diameter)
    };
    if (item.foundation_type === "spread_foot") spreadSteel(c, dimensions, covers, diameter);
    else pillarSteel(c, dimensions, covers, diameter);
  }
  const supports = supportsPlan(c);
  const totals = quantityTotals(c.counts, quantity3);
  const count = ["horizontal", "longitudinal", "hoop", "inter_mat_tie"].reduce((sum, role) => sum + c.counts[`${role}_count`], 0);
  if (!c.issues.some((i) => i.severity === "error") && !count) {
    c.issue("design", "reinforcement_empty_design", "Enabled reinforcement requires steel geometry; otherwise turn rebar off explicitly.");
  }
  const safeCounts = Object.entries(c.counts).filter(([key]) => !key.endsWith("_length_inches"));
  const safeTotals = Object.entries(totals).filter(([key]) => !key.endsWith("_feet"));
  if (!Number.isSafeInteger(count) || [...safeCounts, ...safeTotals].some(([, v]) => !Number.isSafeInteger(v)) || Object.values(totals).some((v) => !Number.isFinite(v))) {
    c.issue("quantities", "reinforcement_numeric_range_invalid", "Scaled reinforcement quantities exceed the supported numeric range.");
  }
  if (c.issues.some((i) => i.severity === "error")) return {
    ...base2,
    status: c.missing ? "incomplete" : "invalid",
    issues: c.issues
  };
  const omitted = count - c.geometry.length;
  if (omitted) c.issue(
    "geometry",
    "reinforcement_geometry_truncated",
    `${omitted} steel primitives are omitted from this per-instance preview; complete quantities remain reported.`,
    "warning"
  );
  return {
    ...base2,
    status: "valid",
    issues: c.issues,
    perInstance: c.counts,
    totals,
    groups: c.groups,
    geometry: c.geometry,
    omittedGeometryCount: omitted,
    supports
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationInputValidation.js
var ITEM_CUSTOM_OVERRIDE_FIELDS = [
  ["custom_concrete_cost_per_cy", "concrete cost-per-unit override"],
  ["custom_concrete_qty", "concrete quantity override"],
  ["custom_rebar_cost_per_ft", "rebar cost-per-foot override"],
  ["custom_rebar_qty", "rebar quantity override"],
  ["custom_forming_rate", "forming rate override"],
  ["custom_forming_qty", "forming quantity override"],
  ["custom_finishing_rate", "finishing rate override"],
  ["custom_finishing_hours", "finishing hours override"],
  ["custom_excavation_hours", "excavation hours override"],
  ["custom_excavation_rate", "excavation rate override"]
];
function foundationItemInputIssues(item, index = 0) {
  const record = item ?? {};
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "foundation",
    index,
    componentId: record.component_id ?? null,
    field,
    code,
    message: `Foundation ${index + 1}: ${message}`
  });
  const type = record.foundation_type;
  if (type !== "spread_foot" && type !== "pillar") {
    add("foundation_type", "foundation_type_invalid", "select Spread Footing or Pillar / Caisson.");
  }
  if (record.excavation_method !== void 0 && record.excavation_method !== null && record.excavation_method !== "" && record.excavation_method !== "hand_dig" && record.excavation_method !== "equipment_excavation") {
    add(
      "excavation_method",
      "foundation_excavation_method_invalid",
      "select a supported excavation method (Hand dig or Equipment)."
    );
  }
  const count = record.quantity ?? 1;
  const quantity3 = inventoryFiniteNumber(count);
  if (!inventoryIsPositiveWhole(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot" ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]] : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = inventoryFiniteNumber(record[field]);
    dimensions[field] = value;
    if (value === null || value <= 0) {
      add(field, "foundation_dimension_invalid", `${label} (inches) must be a finite positive number.`);
    }
  }
  if (!issues.length) {
    const depth = dimensions.depth_inches / 12;
    const radius = dimensions.diameter / 24;
    const volume = type === "spread_foot" ? dimensions.length_inches / 12 * (dimensions.width_inches / 12) * depth / 27 * quantity3 : Math.PI * radius * radius * depth / 27 * quantity3;
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
  const version2 = record.reinforcement_calculation_version;
  if (version2 != null && version2 !== 1 && version2 !== 2) {
    add(
      "reinforcement_calculation_version",
      "foundation_reinforcement_version_unsupported",
      "the active reinforcement calculation version is unsupported. Reload before changing prices."
    );
    return issues;
  }
  if (version2 === 2) {
    if (record.include_rebar != null && typeof record.include_rebar !== "boolean") {
      add("include_rebar", "foundation_reinforcement_enabled_invalid", "reinforcement must be explicitly enabled or disabled.");
      return issues;
    }
    if (!issues.length) {
      const model = calculateFoundationReinforcementModel(record, record.reinforcement_design, { geometryLimit: 0 });
      for (const issue of model.issues.filter((value) => value.severity === "error")) {
        add(`reinforcement_design.${issue.field}`, issue.code, issue.message);
      }
    }
  } else if (record.include_rebar) {
    const optional = (field, code, label, valid) => {
      const value = record[field];
      if (value !== void 0 && value !== null && !valid(value)) add(field, code, label);
    };
    const positive6 = (value) => {
      const number3 = inventoryFiniteNumber(value);
      return number3 !== null && number3 > 0;
    };
    const whole3 = (field, label) => optional(
      field,
      "foundation_rebar_count_invalid",
      `${label} must be a positive whole number within the supported range.`,
      inventoryIsPositiveWhole
    );
    if (type === "spread_foot") {
      for (const [field, label] of [["rebar_spacing_length", "length"], ["rebar_spacing_width", "width"]]) {
        optional(
          field,
          "foundation_rebar_spacing_invalid",
          `rebar spacing ${label} (inches) must be a finite positive number.`,
          positive6
        );
      }
      whole3("rebar_layers", "Rebar mat count");
    } else if (type === "pillar") {
      whole3("pillar_rebar_layers", "Hoop count");
      whole3("pillar_vertical_rebar_count", "Longitudinal bar count");
      optional(
        "pillar_rebar_hoop_diameter",
        "foundation_rebar_diameter_invalid",
        "hoop diameter (inches) must be finite, positive and no greater than the foundation diameter.",
        (value) => positive6(value) && (dimensions.diameter === null || dimensions.diameter <= 0 || inventoryFiniteNumber(value) <= dimensions.diameter)
      );
    }
  }
  for (const [field, label] of ITEM_CUSTOM_OVERRIDE_FIELDS) {
    const raw = record[field];
    if (raw === void 0 || raw === null) continue;
    const number3 = inventoryFiniteNumber(raw);
    if (number3 === null || number3 < 0) {
      add(
        field,
        "foundation_override_invalid",
        `${label} must be a finite, nonnegative number \u2014 clear it or record a valid value.`
      );
    }
  }
  return issues;
}
function signageCabinetInputIssues(cabinet, index = 0) {
  const issues = [];
  const record = cabinet ?? {};
  const add = (field, code, message) => issues.push({
    kind: "signage_cabinet",
    index,
    componentId: record.component_id ?? record.id ?? null,
    field,
    code,
    message: `Signage cabinet ${index + 1}: ${message}`
  });
  const qty2 = record.quantity;
  if (qty2 !== void 0 && qty2 !== null && qty2 !== "" && inventoryPositiveNumber(qty2) === null) {
    add(
      "quantity",
      "signage_cabinet_quantity_unavailable",
      "record a finite, positive quantity \u2014 a zero or malformed quantity cannot be repriced"
    );
  }
  if (inventoryNonnegativeNumber(record.unit_cost) === null) {
    add(
      "unit_cost",
      "signage_cabinet_price_unavailable",
      "record a finite, nonnegative unit cost \u2014 a missing price is not a free cabinet"
    );
  }
  return issues;
}
function signageCabinetsInputIssues(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : []).flatMap((cabinet, index) => signageCabinetInputIssues(cabinet, index));
}
function foundationProjectInputIssues(project) {
  const items = project?.items ?? [];
  if (!Array.isArray(items)) throw new Error("Foundation items must be an array.");
  const projectIssues = [];
  const method = project?.excavation_method;
  const projectMethodInvalid = method !== void 0 && method !== null && method !== "" && method !== "hand_dig" && method !== "equipment_excavation";
  if (projectMethodInvalid) {
    projectIssues.push({
      kind: "foundation",
      index: null,
      componentId: null,
      field: "excavation_method",
      code: "foundation_excavation_method_invalid",
      message: "Project: select a supported default excavation method (Hand dig or Equipment)."
    });
  }
  const landscape = project?.landscape;
  const landscapeIssues = landscape !== void 0 && landscape !== null && (typeof landscape !== "object" || Array.isArray(landscape)) ? [{
    kind: "landscape",
    index: null,
    componentId: null,
    field: "landscape",
    code: "landscape_unavailable",
    message: "Landscape: the recorded site design is malformed \u2014 repair or clear it before repricing."
  }] : landscapeInputIssues(landscape);
  return [
    ...items.flatMap((item, index) => {
      const itemIssues = foundationItemInputIssues(item, index);
      if (projectMethodInvalid && (item?.excavation_method === void 0 || item?.excavation_method === null || item?.excavation_method === "")) {
        itemIssues.push({
          kind: "foundation",
          index,
          componentId: item?.component_id ?? null,
          field: "excavation_method",
          code: "foundation_excavation_method_invalid",
          message: `Foundation ${index + 1}: inherits the invalid project default excavation method \u2014 fix the project default or pick a method on this item.`
        });
      }
      return itemIssues;
    }),
    ...projectIssues,
    ...signageCabinetsInputIssues(project?.signage_cabinets || []),
    ...landscapeIssues
  ];
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationConstructionChecks.js
var METHOD_LABELS = {
  hand_dig: "hand dig",
  equipment_excavation: "equipment"
};
var blank = (v) => v === void 0 || v === null || v === "";
var effectiveMethod = (item, project) => blank(item?.excavation_method) ? blank(project?.excavation_method) ? null : project.excavation_method : item.excavation_method;
var pricedMethod = (item, project) => effectiveMethod(item, project) || "hand_dig";
var list = (indexes) => indexes.map((i) => i + 1).join(", ");
var round2 = (n) => Math.round(n * 100) / 100;
var readyMixItem = (item, inventory) => {
  const inv = inventory.find((i) => i.id === item?.selected_concrete_id);
  return !inv || inv.material_type === "concrete_service";
};
function foundationConstructionWarnings(project, inventory = [], context = {}) {
  const warnings = [];
  const sourceItems = Array.isArray(project?.items) ? project.items : [];
  const pricedItems = Array.isArray(context.items) ? context.items : [];
  const deliveryCheck = context.deliveryCheck ?? null;
  const push = (kind, index, componentId, field, code, message) => warnings.push({
    kind,
    index,
    componentId,
    field,
    inventoryId: null,
    code,
    severity: "advisory",
    message
  });
  const spoilGroups = /* @__PURE__ */ new Map();
  pricedItems.forEach((item, index) => {
    const cy = item?.excavation_volume_cy;
    if (!Number.isFinite(cy) || cy <= 0) return;
    const method = pricedMethod(sourceItems[index] ?? item, project);
    const group = spoilGroups.get(method) || { indexes: [], cy: 0 };
    group.indexes.push(index);
    group.cy += cy;
    spoilGroups.set(method, group);
  });
  for (const [method, group] of spoilGroups) {
    const single = group.indexes.length === 1;
    push(
      "foundation",
      single ? group.indexes[0] : null,
      single ? sourceItems[group.indexes[0]]?.component_id ?? null : null,
      "excavation_method",
      "excavation_spoil_unaccounted",
      `Foundation${single ? "" : "s"} ${list(group.indexes)}: under ${METHOD_LABELS[method] || method} excavation the soil spoil is assumed at 125% of the priced concrete volume (\u2248${round2(group.cy)} CY across ${group.indexes.length} foundation${single ? "" : "s"}) \u2014 excavation is priced as labor only; haul-off, disposal, and backfill are not priced. Verify spoil handling.`
    );
  }
  const unspecified = [];
  sourceItems.forEach((item, index) => {
    if (blank(item?.excavation_method) && blank(project?.excavation_method)) unspecified.push(index);
  });
  if (unspecified.length) {
    push(
      "foundation",
      unspecified.length === 1 ? unspecified[0] : null,
      unspecified.length === 1 ? sourceItems[unspecified[0]]?.component_id ?? null : null,
      "excavation_method",
      "excavation_method_unspecified",
      `Foundation${unspecified.length === 1 ? "" : "s"} ${list(unspecified)}: no excavation method is recorded and the project has no default \u2014 priced assuming hand dig. Verify the excavation method.`
    );
  }
  const equipmentItems = [];
  sourceItems.forEach((item, index) => {
    if (effectiveMethod(item, project) === "equipment_excavation") equipmentItems.push(index);
  });
  if (equipmentItems.length && !(Array.isArray(project?.selected_equipment) && project.selected_equipment.length)) {
    push(
      "foundation",
      equipmentItems.length === 1 ? equipmentItems[0] : null,
      equipmentItems.length === 1 ? sourceItems[equipmentItems[0]]?.component_id ?? null : null,
      "excavation_method",
      "excavation_equipment_unpriced",
      `Foundation${equipmentItems.length === 1 ? "" : "s"} ${list(equipmentItems)}: equipment excavation is priced as crew hours at the equipment rate \u2014 no excavation equipment rental is attached to this project. Verify whether a rental is needed.`
    );
  }
  sourceItems.forEach((item, index) => {
    const componentId = item?.component_id ?? null;
    const forming = Boolean(item?.include_forming);
    const finishing = Boolean(item?.include_finishing);
    if (forming && !finishing) {
      push(
        "foundation",
        index,
        componentId,
        "include_finishing",
        "forming_without_finishing",
        `Foundation ${index + 1}: forming is priced but top finishing is not \u2014 a formed pour still exposes the top surface. Verify whether finishing is in scope.`
      );
    }
    if (finishing && !forming) {
      push(
        "foundation",
        index,
        componentId,
        "include_forming",
        "finishing_without_forming",
        `Foundation ${index + 1}: top finishing is priced but no forming \u2014 the priced model assumes the sides are formed another way (e.g. neat-cut excavation or existing formwork). Verify.`
      );
    }
    if (forming && item?.foundation_type === "pillar") {
      push(
        "foundation",
        index,
        componentId,
        "selected_forming_id",
        "pillar_forming_straight_stock",
        `Foundation ${index + 1}: pillar/caisson forming is priced as straight 16-ft forming stock \u2014 the priced material does not represent round formwork (e.g. sonotube). Verify the forming material choice.`
      );
    }
  });
  const readyMixIndexes = [];
  sourceItems.forEach((item, index) => {
    if (readyMixItem(item, inventory)) readyMixIndexes.push(index);
  });
  const deliveryActive = readyMixIndexes.length > 0 && (deliveryCheck === null || (Number(deliveryCheck.roundedYards) || 0) > 0);
  const admixtures = Array.isArray(project?.project_concrete_admixtures) ? project.project_concrete_admixtures : [];
  if (deliveryActive) {
    if (blank(project?.project_concrete_type)) {
      push(
        "concrete_delivery",
        null,
        null,
        "project_concrete_type",
        "concrete_mix_unspecified",
        "Concrete delivery: no mix strength is recorded \u2014 delivery is priced assuming 4000 AIR ENTRAINED (AE), the catalog fallback. Verify the mix."
      );
    }
    const has = (id) => admixtures.includes(id);
    const admixName = (id) => getConcreteAdmixtures().find((a) => a.id === id)?.name || id;
    if (has("calcium_chloride")) {
      const rebarIndexes = [];
      sourceItems.forEach((item, index) => {
        if (item?.include_rebar) rebarIndexes.push(index);
      });
      if (rebarIndexes.length) {
        push(
          "concrete_delivery",
          null,
          null,
          "project_concrete_admixtures",
          "admixture_rebar_corrosion",
          `Concrete delivery: ${admixName("calcium_chloride")} is selected while Foundation${rebarIndexes.length === 1 ? "" : "s"} ${list(rebarIndexes)} include${rebarIndexes.length === 1 ? "s" : ""} rebar \u2014 the supplier catalog warns calcium chloride corrodes rebar. Verify the admixture choice.`
        );
      }
      if (has("set_retarding")) {
        push(
          "concrete_delivery",
          null,
          null,
          "project_concrete_admixtures",
          "admixture_set_pace_conflict",
          `Concrete delivery: ${admixName("calcium_chloride")} (accelerating) and ${admixName("set_retarding")} (retarding) admixtures are selected together \u2014 verify the intended set behavior.`
        );
      }
    }
    if (has("set_retarding")) {
      if ((project?.project_concrete_type || "4000_ae") === "fast_set") {
        push(
          "concrete_delivery",
          null,
          null,
          "project_concrete_admixtures",
          "mix_admixture_pace_conflict",
          `Concrete delivery: FAST SET mix is selected with a ${admixName("set_retarding")} admixture \u2014 verify the intended set time.`
        );
      }
      if (has("winter_service")) {
        push(
          "concrete_delivery",
          null,
          null,
          "project_concrete_admixtures",
          "admixture_weather_conflict",
          `Concrete delivery: ${admixName("winter_service")} (freezing conditions) and ${admixName("set_retarding")} (hot-weather placement) are selected together \u2014 verify pour conditions.`
        );
      }
    }
  }
  if (admixtures.length && sourceItems.length && readyMixIndexes.length === 0) {
    push(
      "concrete_delivery",
      null,
      null,
      "project_concrete_admixtures",
      "admixtures_without_ready_mix",
      "Concrete delivery: selected admixtures apply to delivered ready-mix only \u2014 every foundation uses bagged concrete, so they price nothing here. Verify the admixture selection."
    );
  }
  return warnings;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);
var finiteRate = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive = (value) => finiteRate(value) && value > 0;
var isRecord2 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
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
  const reference = isRecord2(material) ? material : {};
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
  if (!positive(diameter)) issue(
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
  else if (!positive(weight)) issue(
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
  const quantity3 = quantityOverride == null ? null : numeric(quantityOverride);
  if (quantity3 !== null && !finiteRate(quantity3)) issue(
    "custom_rebar_qty",
    "reinforcement_quantity_override_invalid",
    "Use a finite nonnegative aggregate item quantity; zero is allowed."
  );
  const settingsValid = isRecord2(settings);
  if (!settingsValid) issue("settings", "reinforcement_settings_unavailable", "Labor settings are unavailable; do not infer defaults from a failed read.");
  const rateSources = [];
  const setting2 = (key, fallback) => {
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
    quantity_override_ft: quantity3,
    labor_rate_per_hour: setting2("foundation_main_labor_rate", 60),
    labor_hours_per_ft: setting2("foundation_rebar_time_linear_ft", 0.02),
    labor_hours_per_connection: setting2("foundation_rebar_time_cross_section", 0.05),
    labor_hours_per_support: setting2("foundation_rebar_support_time_each", 0.05)
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

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementCost.js
var close = (a, b) => Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
var nonnegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var whole = (value) => nonnegative(value) && Number.isSafeInteger(value);
var STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
function priceFoundationReinforcementModel(model, basis = {}, supportsResolution = null) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const unavailable = () => ({
    steelPriceAvailable: false,
    canApplyToEstimate: false,
    amounts: null,
    engineeringApproved: false,
    issues
  });
  if (model?.version !== 2 || !["valid", "off"].includes(model.status) || !model.totals || !Array.isArray(model.groups) || !whole(model.instanceCount) || !model.instanceCount || !Array.isArray(model.issues) || model.issues.some((i) => i?.severity !== "warning")) {
    issue("model", "reinforcement_model_unavailable", "Calculate a valid current version-2 model before pricing.");
    return unavailable();
  }
  const connections = ["mat_crossings", "hoop_bar_crossings", "tie_ends"];
  if (!connections.every((key) => whole(model.totals[key])) || !nonnegative(model.totals.total_steel_feet)) {
    issue("model.totals", "reinforcement_model_quantities_invalid", "Complete finite steel quantities and connection counts are required.");
    return unavailable();
  }
  const modelConnections = connections.reduce((sum, key) => sum + model.totals[key], 0);
  if (!Number.isSafeInteger(modelConnections)) {
    issue("model.totals", "reinforcement_connection_range_invalid", "Connection count is outside the supported numeric range.");
    return unavailable();
  }
  const feet = model.totals.total_steel_feet;
  if (model.status === "off") {
    if (feet || modelConnections || model.groups.length) {
      issue("model", "reinforcement_off_model_invalid", "A disabled steel model cannot contain priced steel.");
      return unavailable();
    }
    return {
      steelPriceAvailable: true,
      canApplyToEstimate: true,
      engineeringApproved: false,
      issues,
      amounts: {
        geometry_feet: 0,
        priced_feet: 0,
        connection_count: 0,
        material_cost: 0,
        labor_hours: 0,
        labor_cost: 0,
        steel_cost: 0,
        priced_weight_lbs: 0,
        geometry_weight_lbs: 0
      }
    };
  }
  basis = basis && typeof basis === "object" ? basis : {};
  if (basis.unit !== "ft") issue("unit", "reinforcement_cost_unit_invalid", "An explicit per-foot material pricing basis is required.");
  for (const key of ["cost_per_ft", "labor_rate_per_hour", "labor_hours_per_ft", "labor_hours_per_connection"]) {
    if (!nonnegative(basis[key])) issue(key, "reinforcement_cost_input_invalid", "Use an explicit finite nonnegative rate; zero is allowed.");
  }
  if (!nonnegative(basis.bar_diameter_inches) || !basis.bar_diameter_inches) {
    issue("bar_diameter_inches", "reinforcement_material_diameter_required", "The priced material needs a known positive nominal diameter.");
  }
  let scheduledFeet = 0;
  if (!model.groups.length || !feet) issue("model.groups", "reinforcement_cost_schedule_missing", "Enabled steel requires a nonempty cut-quantity schedule.");
  for (const group of model.groups) {
    if (!STEEL_ROLES.includes(group?.role) || !whole(group?.count) || !group.count || !nonnegative(group.cut_length_inches) || !group.cut_length_inches || !nonnegative(group.diameter_inches) || !group.diameter_inches) {
      issue("model.groups", "reinforcement_cost_schedule_invalid", "Each cut group needs finite positive quantity, length and diameter.");
      continue;
    }
    scheduledFeet += group.count * group.cut_length_inches / 12 * model.instanceCount;
    if (!close(group.diameter_inches, basis.bar_diameter_inches)) {
      issue("bar_diameter_inches", "reinforcement_material_diameter_mismatch", "The priced bar diameter does not match the geometry.");
    }
  }
  if (!Number.isFinite(scheduledFeet) || !close(scheduledFeet, feet)) {
    issue("model.groups", "reinforcement_cost_schedule_mismatch", "Current model totals and cut schedule do not reconcile.");
  }
  const override = basis.quantity_override_ft;
  if (override !== null && override !== void 0 && !nonnegative(override)) {
    issue("quantity_override_ft", "reinforcement_quantity_override_invalid", "An explicit aggregate quantity override must be finite and nonnegative.");
  }
  const weight = basis.weight_lb_per_ft;
  if (weight !== null && weight !== void 0 && (!nonnegative(weight) || !weight)) {
    issue("weight_lb_per_ft", "reinforcement_material_weight_invalid", "Known material weight per foot must be finite and positive.");
  }
  if (issues.some((i) => i.severity === "error")) return unavailable();
  const multiply = (a, b, field) => {
    const value = a * b;
    if (!Number.isFinite(value) || a > 0 && b > 0 && value === 0) {
      issue(field, "reinforcement_cost_numeric_range_invalid", "A positive cost/weight calculation overflowed or underflowed.");
    }
    return value;
  };
  const pricedFeet = override ?? feet;
  const material = multiply(pricedFeet, basis.cost_per_ft, "material_cost");
  const hours = multiply(pricedFeet, basis.labor_hours_per_ft, "linear_labor_hours") + multiply(modelConnections, basis.labor_hours_per_connection, "connection_labor_hours");
  const labor = multiply(hours, basis.labor_rate_per_hour, "labor_cost");
  const amounts = {
    geometry_feet: feet,
    priced_feet: pricedFeet,
    connection_count: modelConnections,
    material_cost: material,
    labor_hours: hours,
    labor_cost: labor,
    steel_cost: material + labor,
    priced_weight_lbs: weight == null ? null : multiply(pricedFeet, weight, "priced_weight_lbs"),
    geometry_weight_lbs: weight == null ? null : multiply(feet, weight, "geometry_weight_lbs")
  };
  if (issues.some((i) => i.severity === "error")) return unavailable();
  if (Object.values(amounts).some((value) => value !== null && !Number.isFinite(value))) {
    issue("amounts", "reinforcement_cost_numeric_range_invalid", "Steel cost or weight exceeds the supported numeric range.");
    return unavailable();
  }
  if (override != null && !close(pricedFeet, feet)) issue(
    "quantity_override_ft",
    "reinforcement_priced_quantity_differs",
    "The explicit aggregate priced quantity differs from geometric steel; it was not scaled again by foundation quantity.",
    "warning"
  );
  if (weight == null) issue("weight_lb_per_ft", "reinforcement_weight_unknown", "Steel weight is unknown, not zero; BOM/handoff compatibility still requires resolution.", "warning");
  const supportsReady = model.supports?.status === "not_required" || model.supports?.status === "off_explained" && model.supports.count === 0 && typeof model.supports.reason === "string" && Boolean(model.supports.reason.trim()) || model.supports?.status === "modeled" && supportsResolution?.status === "resolved";
  if (!supportsReady) issue("supports", "reinforcement_support_cost_unknown", "Support quantities/costs are unresolved; steel-only pricing cannot replace the estimate.", "warning");
  const connectionUnverified = model.issues?.some((i) => ["reinforcement_connection_unverified", "reinforcement_tie_path_only"].includes(i.code));
  if (connectionUnverified) issue(
    "connections",
    "reinforcement_connection_cost_unverified",
    "Connection/fabrication assumptions need review before this steel-only amount can replace current pricing.",
    "warning"
  );
  return {
    steelPriceAvailable: true,
    canApplyToEstimate: supportsReady && weight != null && !connectionUnverified,
    engineeringApproved: false,
    amounts,
    issues
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementSupport.js
var HEIGHT_TOLERANCE_INCHES = 0.0625;
var isRecord3 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var nonnegative2 = (value) => finite(value) && value >= 0;
var positive2 = (value) => finite(value) && value > 0;
var wholeNonnegative = (value) => nonnegative2(value) && Number.isSafeInteger(value);
var text2 = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
var number = (value) => value === null || value === void 0 || value === "" ? null : foundationInputNumber(value);
var close2 = (a, b) => Math.abs(a - b) <= HEIGHT_TOLERANCE_INCHES;
var zeroAmounts = () => ({
  support_count: 0,
  support_purchased_units: 0,
  support_packs: 0,
  support_material_cost: 0,
  support_labor_hours: 0,
  support_labor_cost: 0,
  support_cost: 0
});
var passthrough = (supports, issues = []) => ({
  version: 1,
  status: supports?.status ?? "unconfigured",
  mode: supports?.mode ?? null,
  count: supports?.count ?? null,
  per_instance_count: supports?.count ?? null,
  selections: [],
  amounts: zeroAmounts(),
  issues
});
function catalogSupport(row) {
  if (!isRecord3(row) || row.material_type !== "rebar_support") return null;
  const heightNominal = number(row.rebar_support_height_inches);
  const heightMin = number(row.rebar_support_height_min_inches);
  const heightMax = number(row.rebar_support_height_max_inches);
  const footprintLength = number(row.rebar_support_footprint_length_inches);
  const footprintWidth = number(row.rebar_support_footprint_width_inches);
  const packRaw = number(row.rebar_support_pack_size);
  const packMalformed = packRaw !== null && (!Number.isSafeInteger(packRaw) || packRaw <= 0);
  const costRaw = row.cost_per_unit;
  const cost = costRaw === null || costRaw === void 0 || costRaw === "" ? null : foundationInputNumber(costRaw);
  const barSizes = Array.isArray(row.rebar_support_compatible_bar_sizes) ? row.rebar_support_compatible_bar_sizes.map((size) => text2(size)).filter(Boolean) : null;
  return {
    id: typeof row.id === "string" ? row.id : null,
    name: text2(row.material_name) || "Rebar support",
    kind: text2(row.rebar_support_kind) || null,
    foundation_usage: text2(row.foundation_usage) || null,
    heightNominal,
    heightMin,
    heightMax,
    footprintLength,
    footprintWidth,
    packSize: packRaw === null ? 1 : packRaw,
    packMalformed,
    costPerUnit: nonnegative2(cost) ? cost : null,
    costMalformed: cost !== null && !nonnegative2(cost),
    barSizes,
    placementNotes: text2(row.rebar_support_placement_notes) || null,
    sortOrder: number(row.sort_order) ?? 0,
    updated_date: typeof row.updated_date === "string" ? row.updated_date : null
  };
}
function heightCheck(row, required) {
  if (positive2(row.heightNominal)) return close2(row.heightNominal, required) ? "fits" : "incompatible";
  if (positive2(row.heightMin) && positive2(row.heightMax) && row.heightMin <= row.heightMax) {
    return row.heightMin <= required && required <= row.heightMax ? "fits" : "incompatible";
  }
  return "unverified";
}
function footprintCheck(row, requirement) {
  const { footprint, positions } = requirement;
  const halfL = row.footprintLength === null ? null : row.footprintLength / 2;
  const halfW = row.footprintWidth === null ? null : row.footprintWidth / 2;
  if (footprint.kind === "pillar") {
    if (halfL === null || halfW === null) return "unverified";
    const radial = Math.hypot(halfL, halfW);
    const center = footprint.center_inches;
    const out = positions.some((position) => Math.hypot(position.x - center, position.z - center) + radial > center);
    return out ? "incompatible" : "fits";
  }
  const edge = footprint.edge_inches;
  if (halfL === null || halfW === null) return "unverified";
  if (halfL > edge || halfW > edge) return "incompatible";
  const xFit = positions.every((p) => p.x - halfL >= 0 && p.x + halfL <= footprint.length_inches);
  const zFit = positions.every((p) => p.z - halfW >= 0 && p.z + halfW <= footprint.width_inches);
  return xFit && zFit ? "fits" : "incompatible";
}
function barCheck(row, barSize) {
  if (barSize === null) return "unverified";
  if (Array.isArray(row.barSizes) && row.barSizes.length) {
    return row.barSizes.includes(barSize) ? "fits" : "incompatible";
  }
  return "unverified";
}
function usageCheck(row, requirement) {
  const usage = row.foundation_usage;
  if (!usage || usage === "general") return "unverified";
  const wants = requirement.footprint.kind === "pillar" ? "pillar" : "spread_foot";
  return usage === wants ? "fits" : "incompatible";
}
function checkRow(row, requirement, barSize) {
  const checks = {
    height: heightCheck(row, requirement.required_height_inches),
    footprint: footprintCheck(row, requirement),
    bar: barCheck(row, barSize),
    usage: usageCheck(row, requirement)
  };
  const incompatible = Object.values(checks).includes("incompatible");
  const proven = checks.height === "fits" && checks.footprint === "fits" && checks.bar === "fits" && checks.usage !== "incompatible";
  return { checks, incompatible, proven };
}
function provenBarSize(material, inventory) {
  if (material?.kind !== "catalog" || typeof material.inventory_id !== "string" || !material.inventory_id) return null;
  const matches = (Array.isArray(inventory) ? inventory : []).filter((row) => isRecord3(row) && row.id === material.inventory_id && row.material_type === "rebar");
  if (matches.length !== 1) return null;
  return text2(matches[0].rebar_size) || null;
}
var supportLabel = (requirement) => requirement.mat_id ? `Mat ${requirement.mat_id}` : "The pillar cage";
function resolveFoundationReinforcementSupports({
  item,
  design,
  model,
  material,
  inventory = [],
  basis = {}
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const supports = model?.supports;
  if (model?.version !== 2 || model.status !== "valid" || supports?.status !== "modeled") {
    return passthrough(supports);
  }
  const result = passthrough(supports);
  const mode = supports.mode;
  const config = isRecord3(design?.supports) ? design.supports : {};
  const rows = (Array.isArray(inventory) ? inventory : []).map(catalogSupport).filter(Boolean);
  const dupes = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (row.id !== null && seen.has(row.id)) dupes.add(row.id);
    if (row.id !== null) seen.add(row.id);
  }
  const barSize = provenBarSize(material, inventory);
  let pinned = null;
  if (config.catalog_id !== void 0 && config.catalog_id !== null && config.catalog_id !== "") {
    const id = config.catalog_id;
    if (typeof id !== "string" || !id.trim() || id.trim() !== id || id.length > 128) {
      issue(
        "supports.catalog_id",
        "reinforcement_support_catalog_id_invalid",
        "The pinned support catalog ID must be a stable trimmed identifier."
      );
      return { ...result, issues };
    }
    const matches = rows.filter((row) => row.id === id);
    if (!matches.length) {
      issue(
        "supports.catalog_id",
        "reinforcement_support_catalog_unavailable",
        "The pinned rebar support catalog record is unavailable; refresh the catalog before pricing."
      );
      return { ...result, issues };
    }
    if (matches.length > 1 || dupes.has(id)) {
      issue(
        "supports.catalog_id",
        "reinforcement_support_catalog_ambiguous",
        "Multiple current rebar support records have the pinned ID; refresh the catalog before pricing."
      );
      return { ...result, issues };
    }
    pinned = matches[0];
  }
  const laborRate = nonnegative2(basis?.labor_rate_per_hour) ? basis.labor_rate_per_hour : null;
  const laborEach = nonnegative2(basis?.labor_hours_per_support) ? basis.labor_hours_per_support : null;
  const instanceCount = wholeNonnegative(model.instanceCount) && model.instanceCount > 0 ? model.instanceCount : null;
  if (instanceCount === null) {
    issue(
      "model.instanceCount",
      "reinforcement_numeric_range_invalid",
      "Support quantities require a known positive foundation instance count."
    );
    return { ...result, issues };
  }
  const warnedPin = /* @__PURE__ */ new Set();
  let unresolvedCost = false, unverifiedPin = false;
  for (const requirement of supports.requirements || []) {
    const required = requirement.required_height_inches;
    const count = requirement.count;
    if (!Number.isSafeInteger(count) || count <= 0 || !positive2(required)) {
      issue(
        "supports",
        "reinforcement_support_requirement_invalid",
        `${supportLabel(requirement)} produced an invalid support requirement.`
      );
      continue;
    }
    let chosen = null, provenance = "verified";
    if (pinned) {
      const verdict = checkRow(pinned, requirement, barSize);
      if (verdict.incompatible) {
        issue(
          "supports.catalog_id",
          "reinforcement_support_pinned_incompatible",
          `${supportLabel(requirement)} cannot use the pinned catalog support: height, footprint, bar-size or usage is provably incompatible \u2014 pick a different row or clear the pin.`
        );
        continue;
      }
      if (!verdict.proven) unverifiedPin = true;
      if (!verdict.proven && !warnedPin.has("unverified")) {
        warnedPin.add("unverified");
        issue(
          "supports.catalog_id",
          "reinforcement_support_compatibility_unverified",
          "The pinned support cannot be proven compatible from catalog metadata (height, footprint or bar-size data is missing); the authored pick stands pending verification.",
          "warning"
        );
      }
      chosen = pinned;
      provenance = verdict.proven ? "verified" : "authored_unverified";
    } else {
      const candidates = rows.map((row) => ({ row, verdict: checkRow(row, requirement, barSize) })).filter((entry) => entry.verdict.proven);
      if (!candidates.length) {
        issue(
          "supports",
          "reinforcement_support_no_compatible",
          `${supportLabel(requirement)} needs a ${required}-in support; no catalog rebar_support row is proven compatible on height, footprint and bar size \u2014 catalog one, pin an explicit pick, or explain supports off.`
        );
        continue;
      }
      const priced = (entry) => entry.row.costPerUnit !== null ? 0 : 1;
      const heightRank = (entry) => entry.row.heightNominal !== null ? Math.abs(entry.row.heightNominal - required) : required - entry.row.heightMin;
      candidates.sort((a, b) => priced(a) - priced(b) || heightRank(a) - heightRank(b) || a.row.costPerUnit - b.row.costPerUnit || (a.row.sortOrder ?? 0) - (b.row.sortOrder ?? 0) || String(a.row.id).localeCompare(String(b.row.id)));
      chosen = candidates[0].row;
    }
    if (chosen.packMalformed) {
      issue(
        "supports",
        "reinforcement_support_pack_invalid",
        `${supportLabel(requirement)} selection "${chosen.name}" has a malformed pack size; units are priced individually and the catalog row needs repair.`,
        "warning"
      );
    }
    if (chosen.costMalformed || chosen.costPerUnit === null) unresolvedCost = true;
    const unitsRequired = count * instanceCount;
    const pack = chosen.packMalformed ? 1 : chosen.packSize;
    const packs = Math.ceil(unitsRequired / pack);
    const purchased = packs * pack;
    const materialCost = chosen.costPerUnit === null ? null : purchased * chosen.costPerUnit;
    const laborHours = laborEach !== null && laborRate !== null ? unitsRequired * laborEach : null;
    const laborCost = laborHours !== null ? laborHours * laborRate : null;
    if (materialCost === null || laborCost === null) unresolvedCost = true;
    const usedHeight = chosen.heightNominal ?? required;
    result.selections.push({
      target_id: requirement.target_id,
      mat_id: requirement.mat_id,
      base: requirement.base,
      required_height_inches: required,
      support_height_inches: usedHeight,
      inventory_id: chosen.id,
      name: chosen.name,
      kind: chosen.kind,
      compatibility: provenance,
      count_per_instance: count,
      units_required: unitsRequired,
      pack_size: pack,
      packs,
      units_purchased: purchased,
      unit_cost: chosen.costPerUnit,
      material_cost: materialCost,
      labor_hours: laborHours,
      labor_cost: laborCost,
      cost: materialCost !== null && laborCost !== null ? materialCost + laborCost : null,
      placement_notes: chosen.placementNotes
    });
  }
  const amounts = zeroAmounts();
  for (const selection of result.selections) {
    amounts.support_count += selection.units_required;
    amounts.support_purchased_units += selection.units_purchased;
    amounts.support_packs += selection.packs;
    amounts.support_material_cost += selection.material_cost ?? 0;
    amounts.support_labor_hours += selection.labor_hours ?? 0;
    amounts.support_labor_cost += selection.labor_cost ?? 0;
  }
  amounts.support_cost = amounts.support_material_cost + amounts.support_labor_cost;
  result.amounts = amounts;
  result.per_instance_count = supports.count ?? 0;
  result.count = amounts.support_count;
  result.pin = pinned ? { inventory_id: pinned.id, name: pinned.name } : null;
  if (unresolvedCost) {
    issue(
      "supports",
      "reinforcement_support_cost_unknown",
      "A selected support has no verifiable catalog unit price or install-labor basis; support quantities are known but support cost is unresolved \u2014 never a silent zero.",
      "warning"
    );
  }
  if (amounts.support_count > 0) {
    issue(
      "supports",
      "reinforcement_support_obstructions_unverified",
      "Embedded poles, sleeves, conduits and voids are not modeled; verify modeled support positions clear all obstructions before build.",
      "warning"
    );
  }
  const covered = supports.requirements?.length ?? 0;
  const selected = result.selections.length;
  result.status = issues.some((entry) => entry.severity === "error") ? "unresolved" : covered === selected && !unresolvedCost ? "resolved" : "unresolved";
  result.issues = issues;
  return result;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementCutSchedule.js
var MAX_STOCK_LENGTH_INCHES = 1200;
var MAX_PIECES = 65536;
var FIT_TOLERANCE = 1e-9;
var STEEL_ROLES2 = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
var ROLE_SHAPES = Object.freeze({
  horizontal: "straight",
  longitudinal: "straight",
  hoop: "hoop",
  inter_mat_tie: "as_authored"
});
var isRecord4 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finite2 = (value) => typeof value === "number" && Number.isFinite(value);
var positive3 = (value) => finite2(value) && value > 0;
var whole2 = (value) => finite2(value) && Number.isSafeInteger(value) && value >= 0;
var text3 = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
var number2 = (value) => value === null || value === void 0 || value === "" ? null : foundationInputNumber(value);
var base = (status) => ({
  version: 1,
  status,
  bar_size: null,
  bar_diameter_inches: null,
  instance_count: null,
  cut_lines: [],
  piece_count_total: 0,
  stock: null,
  elevation_summary: [],
  issues: []
});
function matRun(groupId) {
  if (typeof groupId !== "string") return null;
  if (groupId.endsWith("/x")) return { mat_id: groupId.slice(0, -2), direction: "x" };
  if (groupId.endsWith("/z")) return { mat_id: groupId.slice(0, -2), direction: "z" };
  return null;
}
function stockPool(material, inventory, issue) {
  const lengths = /* @__PURE__ */ new Set();
  let malformed = 0, row = null;
  if (material?.kind === "catalog" && typeof material.inventory_id === "string" && material.inventory_id) {
    const matches = (Array.isArray(inventory) ? inventory : []).filter((candidate) => isRecord4(candidate) && candidate.id === material.inventory_id && candidate.material_type === "rebar");
    row = matches.length === 1 ? matches[0] : null;
  }
  const add = (raw) => {
    const value = number2(raw);
    if (value === null) {
      if (raw !== null && raw !== void 0 && raw !== "") malformed += 1;
      return;
    }
    if (!positive3(value) || value > MAX_STOCK_LENGTH_INCHES) {
      malformed += 1;
      return;
    }
    lengths.add(value);
  };
  if (row) {
    add(row.rebar_stock_length_inches);
    const list2 = row.rebar_stock_lengths_inches;
    if (list2 !== null && list2 !== void 0 && list2 !== "") {
      if (Array.isArray(list2)) list2.forEach(add);
      else if (typeof list2 === "string") list2.split(",").forEach(add);
      else malformed += 1;
    }
  }
  if (malformed) {
    issue(
      "stock_lengths",
      "reinforcement_stock_length_invalid",
      `${malformed} rebar stock-length entr${malformed === 1 ? "y was" : "ies were"} malformed and ignored; repair the catalog row.`,
      "warning"
    );
  }
  return {
    row,
    lengths: [...lengths].sort((a, b) => a - b)
  };
}
function elevationSummary(design, model, groups) {
  const summary = [];
  const diameter = model?.groups?.[0]?.diameter_inches ?? design?.bar_diameter_inches;
  const radius = positive3(diameter) ? diameter / 2 : null;
  const mats = Array.isArray(design?.spread?.mats) ? design.spread.mats : [];
  const bearings = mats.map((mat2) => number2(mat2?.bearing_elevation_inches));
  const order = bearings.map((bearing, index) => ({ bearing, index })).sort((a, b) => (a.bearing ?? Infinity) - (b.bearing ?? Infinity));
  const tier = new Map(order.map((entry, rank) => [entry.index, rank]));
  mats.forEach((mat2, index) => {
    const id = text3(mat2?.id);
    if (!id) return;
    const xRun = groups.find((group) => group.id === `${id}/x`);
    const zRun = groups.find((group) => group.id === `${id}/z`);
    const bearing = bearings[index];
    summary.push({
      kind: "mat",
      index,
      tier: tier.get(index) ?? index,
      mat_id: id,
      bearing_elevation_inches: bearing,
      x_bars: xRun ? {
        count: xRun.count,
        cut_length_inches: xRun.cut_length_inches,
        elevation_inches: bearing !== null && radius !== null ? bearing + radius : null
      } : null,
      z_bars: zRun ? {
        count: zRun.count,
        cut_length_inches: zRun.cut_length_inches,
        elevation_inches: bearing !== null && radius !== null ? bearing + 3 * radius : null
      } : null,
      crossings: xRun && zRun ? xRun.count * zRun.count : null
    });
  });
  const longitudinal = design?.pillar?.longitudinal;
  const cageRun = groups.find((group) => group.id === "pillar/longitudinal");
  if (cageRun) {
    const bottom = number2(longitudinal?.bottom_end_inches);
    const top = number2(longitudinal?.top_end_inches);
    summary.push({
      kind: "pillar_cage",
      index: 0,
      bar_count: cageRun.count,
      cut_length_inches: cageRun.cut_length_inches,
      bottom_elevation_inches: bottom,
      top_elevation_inches: top,
      radius_inches: number2(longitudinal?.radius_inches)
    });
  }
  (Array.isArray(design?.pillar?.hoops) ? design.pillar.hoops : []).forEach((hoop, index) => {
    const run = groups.find((group) => group.id === hoop?.id && group.role === "hoop");
    if (!run) return;
    summary.push({
      kind: "pillar_hoop",
      index,
      hoop_id: text3(hoop?.id) || run.id,
      center_y_inches: number2(hoop?.center_y_inches),
      centerline_diameter_inches: number2(hoop?.centerline_diameter_inches),
      cut_length_inches: run.cut_length_inches
    });
  });
  return summary;
}
function packFirstFitDecreasing(pieces, lengths) {
  const bins = [];
  for (const piece of pieces) {
    let target = null;
    for (const bin of bins) {
      if (bin.remaining + FIT_TOLERANCE >= piece.cut_length_inches) {
        target = bin;
        break;
      }
    }
    if (!target) {
      const stock = lengths.find((length) => length + FIT_TOLERANCE >= piece.cut_length_inches);
      if (stock === void 0) return null;
      target = { stock_length_inches: stock, remaining: stock, cuts: /* @__PURE__ */ new Map() };
      bins.push(target);
    }
    target.remaining -= piece.cut_length_inches;
    if (target.remaining < 0 && target.remaining > -FIT_TOLERANCE) target.remaining = 0;
    target.cuts.set(piece.cut_length_inches, (target.cuts.get(piece.cut_length_inches) ?? 0) + 1);
  }
  return bins;
}
function calculateFoundationReinforcementCutSchedule({
  item,
  design,
  model,
  material,
  inventory = [],
  maxPieces = MAX_PIECES
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const result = base("unavailable");
  result.issues = issues;
  if (model?.version !== 2 || !["valid", "off"].includes(model.status)) return result;
  if (model.status === "off") {
    return { ...base("not_required"), instance_count: model.instanceCount ?? null, issues };
  }
  const instanceCount = whole2(model.instanceCount) && model.instanceCount > 0 ? model.instanceCount : null;
  if (instanceCount === null) {
    issue(
      "model.instanceCount",
      "reinforcement_numeric_range_invalid",
      "A cut schedule requires a known positive foundation instance count."
    );
    return { ...result, issues };
  }
  result.instance_count = instanceCount;
  const groups = Array.isArray(model.groups) ? model.groups : [];
  let malformedRuns = 0;
  for (const group of groups) {
    const run = isRecord4(group) && STEEL_ROLES2.includes(group.role) && whole2(group.count) && group.count > 0 && positive3(group.cut_length_inches) && positive3(group.diameter_inches) ? group : null;
    if (!run) {
      malformedRuns += 1;
      continue;
    }
    result.cut_lines.push({
      source_run_id: run.id,
      role: run.role,
      mat_id: matRun(run.id)?.mat_id ?? null,
      bar_size: null,
      bar_diameter_inches: run.diameter_inches,
      cut_length_inches: run.cut_length_inches,
      shape: ROLE_SHAPES[run.role],
      bend_code: null,
      quantity_per_instance: run.count,
      quantity_total: run.count * instanceCount
    });
  }
  if (malformedRuns) {
    issue(
      "model.groups",
      "reinforcement_cut_schedule_run_invalid",
      `${malformedRuns} modeled bar run${malformedRuns === 1 ? "" : "s"} could not be scheduled; the schedule is incomplete.`
    );
    return { ...result, issues };
  }
  result.piece_count_total = result.cut_lines.reduce((sum, line) => sum + line.quantity_total, 0);
  if (!result.cut_lines.length) return { ...result, status: "resolved", issues };
  const { row: stockRow, lengths } = stockPool(material, inventory, issue);
  const barSize = text3(stockRow?.rebar_size) || null;
  result.bar_size = barSize;
  result.bar_diameter_inches = result.cut_lines[0]?.bar_diameter_inches ?? null;
  for (const line of result.cut_lines) line.bar_size = barSize;
  result.elevation_summary = elevationSummary(design, model, groups);
  if (!lengths.length) {
    issue(
      "stock_lengths",
      "reinforcement_stock_length_unconfigured",
      material?.kind === "manual" ? "A manual rebar basis carries no catalog stock lengths; the cut lines stand but the stock/waste plan is unresolved \u2014 record stock lengths or pin a catalog row." : "The configured rebar catalog row declares no usable stock lengths; the cut lines stand but the stock/waste plan is unresolved \u2014 record rebar stock length metadata on the catalog row.",
      "warning"
    );
    return { ...result, status: "unresolved", issues };
  }
  if (result.piece_count_total > maxPieces) {
    issue(
      "model.groups",
      "reinforcement_cut_schedule_budget_exceeded",
      `${result.piece_count_total} total cut pieces exceed the ${maxPieces}-piece schedule budget; cut lines are reported but stock packing is skipped.`,
      "warning"
    );
    return { ...result, status: "unresolved", issues };
  }
  const byBar = /* @__PURE__ */ new Map();
  for (const line of result.cut_lines) {
    const key = `diameter:${line.bar_diameter_inches}`;
    if (!byBar.has(key)) byBar.set(key, { bar_group: key, bar_size: barSize, bar_diameter_inches: line.bar_diameter_inches, lines: [] });
    byBar.get(key).lines.push(line);
  }
  const stock = {
    source_inventory_id: typeof stockRow?.id === "string" ? stockRow.id : null,
    lengths_inches: lengths,
    groups: [],
    totals: {
      total_linear_inches_required: 0,
      stock_linear_inches_purchased: 0,
      stock_count_total: 0,
      waste_inches: 0,
      waste_pct: 0
    }
  };
  let infeasible = false;
  for (const bar of byBar.values()) {
    const pieces = bar.lines.flatMap((line, lineIndex) => Array.from(
      { length: line.quantity_total },
      () => ({ cut_length_inches: line.cut_length_inches, lineIndex })
    )).sort((a, b) => b.cut_length_inches - a.cut_length_inches || a.lineIndex - b.lineIndex);
    const packed = packFirstFitDecreasing(pieces, lengths);
    if (packed === null) {
      const longest = bar.lines.reduce((max, line) => Math.max(max, line.cut_length_inches), 0);
      issue(
        "stock_lengths",
        "reinforcement_cut_exceeds_stock",
        `A ${longest}-in ${bar.bar_size ?? `\u2300${bar.bar_diameter_inches}in`} cut exceeds the longest configured stock (${Math.max(...lengths)} in); the run cannot be fabricated from the configured stock \u2014 update the catalog stock lengths or split the authored run.`
      );
      infeasible = true;
      continue;
    }
    const bins = packed.map((bin, index) => ({
      index,
      stock_length_inches: bin.stock_length_inches,
      cuts: [...bin.cuts.entries()].sort((a, b) => b[0] - a[0]).map(([cut_length_inches, quantity3]) => ({ cut_length_inches, quantity: quantity3 })),
      offcut_inches: bin.remaining
    }));
    const byLength = /* @__PURE__ */ new Map();
    for (const bin of bins) {
      const entry = byLength.get(bin.stock_length_inches) ?? { stock_length_inches: bin.stock_length_inches, stock_count: 0, pieces_per_stock: [], offcut_inches: 0 };
      entry.stock_count += 1;
      entry.pieces_per_stock.push(bin.cuts.reduce((sum, cut) => sum + cut.quantity, 0));
      entry.offcut_inches += bin.offcut_inches;
      byLength.set(bin.stock_length_inches, entry);
    }
    const groupOut = {
      bar_group: bar.bar_group,
      bar_size: bar.bar_size,
      bar_diameter_inches: bar.bar_diameter_inches,
      bins,
      by_length: [...byLength.values()].sort((a, b) => a.stock_length_inches - b.stock_length_inches).map((entry) => ({
        ...entry,
        waste_pct: entry.stock_count * entry.stock_length_inches > 0 ? entry.offcut_inches / (entry.stock_count * entry.stock_length_inches) * 100 : 0
      })),
      totals: { pieces: pieces.length, linear_inches_required: 0, stock_linear_inches_purchased: 0, stock_count: bins.length, offcut_inches: 0, waste_pct: 0 }
    };
    for (const bin of bins) {
      groupOut.totals.stock_linear_inches_purchased += bin.stock_length_inches;
      groupOut.totals.offcut_inches += bin.offcut_inches;
    }
    groupOut.totals.linear_inches_required = bar.lines.reduce((sum, line) => sum + line.cut_length_inches * line.quantity_total, 0);
    groupOut.totals.waste_pct = groupOut.totals.stock_linear_inches_purchased > 0 ? groupOut.totals.offcut_inches / groupOut.totals.stock_linear_inches_purchased * 100 : 0;
    stock.groups.push(groupOut);
    stock.totals.total_linear_inches_required += groupOut.totals.linear_inches_required;
    stock.totals.stock_linear_inches_purchased += groupOut.totals.stock_linear_inches_purchased;
    stock.totals.stock_count_total += groupOut.totals.stock_count;
  }
  stock.totals.waste_inches = stock.totals.stock_linear_inches_purchased - stock.totals.total_linear_inches_required;
  stock.totals.waste_pct = stock.totals.stock_linear_inches_purchased > 0 ? stock.totals.waste_inches / stock.totals.stock_linear_inches_purchased * 100 : 0;
  result.stock = stock.groups.length ? stock : null;
  result.status = infeasible ? "unresolved" : "resolved";
  return result;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementProjection.js
function calculateFoundationReinforcementProjection({
  item,
  design,
  material,
  inventory = [],
  settings = {},
  quantityOverride = null,
  rateOverride = null,
  geometryLimit = 0
} = {}) {
  const record = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const model = calculateFoundationReinforcementModel(record, design, { geometryLimit });
  const resolution = model.status === "off" ? null : resolveFoundationReinforcementBasis({
    material,
    inventory,
    settings,
    quantityOverride,
    rateOverride
  });
  const supports = model.status === "valid" ? resolveFoundationReinforcementSupports({
    item: record,
    design,
    model,
    material: resolution?.materialSnapshot ?? null,
    inventory,
    basis: resolution?.basis ?? {}
  }) : null;
  const cutSchedule = ["valid", "off"].includes(model.status) ? calculateFoundationReinforcementCutSchedule({
    item: record,
    design,
    model,
    material: resolution?.materialSnapshot ?? null,
    inventory
  }) : null;
  const steel = priceFoundationReinforcementModel(model, resolution?.basis, supports);
  const issues = [
    ...model.issues.map((issue) => ({ ...issue, scope: "geometry" })),
    ...(resolution?.issues || []).map((issue) => ({ ...issue, scope: "basis" })),
    ...(supports?.issues || []).map((issue) => ({ ...issue, scope: "supports" })),
    ...(cutSchedule?.issues || []).map((issue) => ({ ...issue, scope: "cut_schedule" })),
    ...steel.issues.map((issue) => ({ ...issue, scope: "pricing" }))
  ];
  return {
    calculationVersion: 2,
    projectionVersion: 1,
    engineeringApproved: false,
    model,
    steel,
    issues,
    basis: resolution?.basis ?? null,
    supports,
    cutSchedule,
    materialSnapshot: resolution?.materialSnapshot ?? null,
    rateSources: resolution?.rateSources ?? [],
    canApplyToEstimate: steel.canApplyToEstimate && !issues.some((issue) => issue.severity === "error")
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementItemProjection.js
var isRecord5 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finiteNonnegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var COMMON_OVERRIDES = [
  "custom_concrete_qty",
  "custom_concrete_cost_per_cy",
  "custom_forming_qty",
  "custom_forming_rate",
  "custom_finishing_hours",
  "custom_finishing_rate",
  "custom_excavation_hours",
  "custom_excavation_rate"
];
function calculateFoundationReinforcementItemProjection({
  item,
  design,
  material,
  inventory = [],
  settings = {},
  excavationMethod,
  quantityOverride = null,
  rateOverride = null
} = {}) {
  const reinforcement = calculateFoundationReinforcementProjection({
    item,
    design,
    material,
    inventory,
    settings,
    quantityOverride,
    rateOverride
  });
  const issues = [...reinforcement.issues];
  const issue = (field, code, message) => issues.push({ field, code, message, scope: "common_cost", severity: "error" });
  const unavailable = () => ({
    calculationVersion: 2,
    engineeringApproved: false,
    reinforcement,
    commonCost: null,
    itemCost: null,
    issues,
    priceAvailable: false,
    canApplyToEstimate: false
  });
  if (!["valid", "off"].includes(reinforcement.model.status)) return unavailable();
  if (!isRecord5(item)) {
    issue("item", "reinforcement_common_item_invalid", "A current foundation record is required.");
    return unavailable();
  }
  if (!Array.isArray(inventory) || inventory.some((row) => !isRecord5(row))) {
    issue("inventory", "reinforcement_common_inventory_unavailable", "Current concrete and forming catalog records could not be verified.");
    return unavailable();
  }
  if (!isRecord5(settings)) {
    issue("settings", "reinforcement_common_settings_unavailable", "Current common-cost settings could not be verified.");
    return unavailable();
  }
  const commonItem = { ...item, include_rebar: false, excavation_method: item.excavation_method || excavationMethod };
  const bagged = inventory.some((row) => row.id === item.selected_concrete_id && row.material_type === "bagged_concrete");
  const commonSettings = { ...settings };
  const activeSettings = [
    "foundation_main_labor_rate",
    "foundation_pouring_cost_per_cy",
    commonItem.excavation_method === "hand_dig" || !commonItem.excavation_method ? "foundation_hand_dig_time_per_cy" : "foundation_equipment_excavation_time_per_cy",
    ...item.include_finishing ? ["foundation_finishing_cost_per_sqft"] : [],
    ...item.include_forming ? [
      "foundation_forming_cost_per_sqft",
      item.foundation_type === "spread_foot" ? "foundation_forming_materials_spread_foot" : "foundation_forming_materials_pillar"
    ] : []
  ];
  for (const key of activeSettings) {
    if (!Object.hasOwn(settings, key) || settings[key] === void 0) continue;
    const value = foundationInputNumber(settings[key]);
    if (value === null || value < 0) issue(
      `settings.${key}`,
      "reinforcement_common_setting_invalid",
      "An explicit active common-cost setting must be a finite nonnegative decimal; malformed values do not infer defaults."
    );
    else commonSettings[key] = value === 0 ? "0" : value;
  }
  for (const field of COMMON_OVERRIDES) {
    if (field.startsWith("custom_forming_") && !item.include_forming) continue;
    if (field.startsWith("custom_finishing_") && !item.include_finishing) continue;
    if (field === "custom_concrete_cost_per_cy" && !bagged) continue;
    if (item[field] == null) continue;
    const value = foundationInputNumber(item[field]);
    if (value === null || value < 0) issue(
      field,
      "reinforcement_common_override_invalid",
      "An active common-cost override must be a finite nonnegative decimal; clear it explicitly to use the current basis."
    );
    else commonItem[field] = value;
  }
  const catalogIssues = foundationItemCatalogIssues(commonItem, inventory);
  issues.push(...catalogIssues.map((value) => ({ ...value, severity: "error", scope: "common_cost" })));
  for (const field of ["selected_concrete_id", ...item.include_forming ? ["selected_forming_id"] : []]) {
    if (item[field] == null || item[field] === "") continue;
    if (inventory.filter((row) => row.id === item[field]).length > 1) issue(
      field,
      "reinforcement_common_catalog_ambiguous",
      "The selected common-cost catalog ID is duplicated; refresh the catalog before previewing a replacement price."
    );
  }
  if (issues.some((value) => value.scope === "common_cost" && value.severity === "error")) return unavailable();
  const common = calcItemCost(commonItem, inventory, commonSettings);
  const commonCost = {
    concrete: common.concreteCost,
    forming: common.formingCost,
    pouring: common.pouringCost,
    finishing: common.finishingCost,
    excavation: common.excavationCost,
    total: common.total
  };
  const commonValues = [
    ...Object.values(commonCost),
    common.volumeCY,
    common.baseVolumeCY,
    common.excavationHours,
    common.excavationRate,
    ...bagged ? [common.concreteRate] : [],
    ...item.include_forming ? [common.formingRate, common.formingQty] : [],
    ...item.include_finishing ? [common.finishingRate, common.finishingHours] : [],
    ...common.concreteBags === null ? [] : [common.concreteBags]
  ];
  if (common.rebarCost !== 0 || !commonValues.every(finiteNonnegative)) {
    issue(
      "common_cost",
      "reinforcement_common_result_invalid",
      "Common quantities, rates, hours or amounts are invalid. No replacement total is available; current saved pricing is unchanged."
    );
    return unavailable();
  }
  const steel = reinforcement.steel.amounts;
  if (!reinforcement.steel.steelPriceAvailable || !steel) return unavailable();
  const supports = reinforcement.supports;
  const supportsModeled = reinforcement.model.supports?.status === "modeled";
  if (supportsModeled && supports?.status !== "resolved") {
    issue(
      "supports",
      "reinforcement_support_cost_unknown",
      "Modeled support economics are unresolved; no replacement item total is available."
    );
    return unavailable();
  }
  const supportCost = supportsModeled ? supports.amounts.support_cost : 0;
  const total = commonCost.total + steel.steel_cost + supportCost, excavationVolume = common.volumeCY * 1.25;
  if (![total, excavationVolume].every(finiteNonnegative)) {
    issue("item_total_cost", "reinforcement_item_result_invalid", "The proposed item cost or excavation volume exceeds the supported numeric range.");
    return unavailable();
  }
  return {
    calculationVersion: 2,
    engineeringApproved: false,
    reinforcement,
    commonCost,
    issues,
    priceAvailable: true,
    canApplyToEstimate: reinforcement.canApplyToEstimate,
    itemCost: {
      quantity: reinforcement.model.instanceCount,
      concrete_volume_cy: common.volumeCY,
      excavation_volume_cy: excavationVolume,
      concrete_bags: common.concreteBags,
      concrete_cost: common.concreteCost,
      concrete_rate: finiteNonnegative(common.concreteRate) ? common.concreteRate : null,
      rebar_feet: steel.priced_feet,
      rebar_weight_lbs: steel.priced_weight_lbs,
      rebar_cost: steel.steel_cost,
      rebar_rate: reinforcement.basis?.cost_per_ft ?? 0,
      rebar_material_cost: steel.material_cost,
      rebar_labor_cost: steel.labor_cost,
      rebar_labor_hours: steel.labor_hours,
      rebar_geometry_feet: steel.geometry_feet,
      rebar_geometry_weight_lbs: steel.geometry_weight_lbs,
      rebar_connection_count: steel.connection_count,
      support_count: supports?.amounts?.support_count ?? 0,
      support_purchased_units: supports?.amounts?.support_purchased_units ?? 0,
      support_packs: supports?.amounts?.support_packs ?? 0,
      support_material_cost: supports?.amounts?.support_material_cost ?? 0,
      support_labor_cost: supports?.amounts?.support_labor_cost ?? 0,
      support_labor_hours: supports?.amounts?.support_labor_hours ?? 0,
      support_cost: supportCost,
      excavation_cost: common.excavationCost,
      excavation_hours: common.excavationHours,
      forming_cost: common.formingCost,
      forming_qty: item.include_forming ? common.formingQty : 0,
      pouring_cost: common.pouringCost,
      finishing_cost: common.finishingCost,
      finishing_hours: item.include_finishing ? common.finishingHours : 0,
      item_total_cost: total
    }
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationCalc.js
var num2 = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
var REBAR_LB_PER_FT = { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502, "#7": 2.044, "#8": 2.67 };
var ITEM_SNAPSHOT_FIELDS = [
  "concrete_volume_cy",
  "excavation_volume_cy",
  "concrete_bags",
  "rebar_feet",
  "rebar_weight_lbs",
  "concrete_cost",
  "concrete_rate",
  "rebar_cost",
  "rebar_rate",
  "excavation_cost",
  "excavation_hours",
  "forming_cost",
  "forming_qty",
  "pouring_cost",
  "finishing_cost",
  "finishing_hours",
  "item_total_cost"
];
var REINFORCEMENT_SNAPSHOT_FIELDS = [
  "rebar_material_cost",
  "rebar_labor_cost",
  "rebar_labor_hours",
  "rebar_geometry_feet",
  "rebar_geometry_weight_lbs",
  "rebar_connection_count",
  "support_count",
  "support_purchased_units",
  "support_packs",
  "support_material_cost",
  "support_labor_cost",
  "support_labor_hours",
  "support_cost"
];
function calculateVersionedItem(item, project, inventory, settings, savedItem) {
  const version2 = item.reinforcement_calculation_version;
  if (version2 == null || version2 === 1) return null;
  const effectiveItem = { ...item, excavation_method: item.excavation_method || project?.excavation_method };
  const inputIssues = foundationItemInputIssues(effectiveItem);
  const catalogIssues = foundationItemCatalogIssues(item, inventory);
  const settingIssues = foundationItemSettingIssues(effectiveItem, settings);
  const projection = inputIssues.length || catalogIssues.length || settingIssues.length ? null : calculateFoundationReinforcementItemProjection({
    item,
    design: item.reinforcement_design,
    material: item.reinforcement_material,
    inventory,
    settings,
    excavationMethod: project?.excavation_method,
    quantityOverride: item.custom_rebar_qty ?? null,
    rateOverride: item.custom_rebar_cost_per_ft ?? null
  });
  if (projection?.canApplyToEstimate && projection.itemCost) {
    const reinforcement = projection.reinforcement;
    return {
      cost: {
        ...projection.itemCost,
        reinforcement_cost_snapshot: item.include_rebar ? {
          version: 1,
          calculation_version: 2,
          engineering_approved: false,
          amounts: structuredClone(reinforcement.steel.amounts),
          material: structuredClone(reinforcement.materialSnapshot),
          basis: structuredClone(reinforcement.basis),
          rate_sources: structuredClone(reinforcement.rateSources),
          supports: structuredClone(reinforcement.supports),
          cut_schedule: structuredClone(reinforcement.cutSchedule)
        } : void 0
      },
      issues: []
    };
  }
  const blockers = projection?.issues.filter((issue) => issue.severity === "error") || [];
  if (projection && !blockers.length) blockers.push({
    field: "reinforcement_design",
    code: "foundation_reinforcement_not_ready",
    message: "Reinforcement support, weight, connection or pricing prerequisites remain unresolved; saved amounts are shown and saving is paused."
  });
  return {
    cost: {
      quantity: item.quantity,
      ...Object.fromEntries([...ITEM_SNAPSHOT_FIELDS, ...REINFORCEMENT_SNAPSHOT_FIELDS].map((key) => [
        key,
        hasFoundationCostSnapshot(savedItem?.[key]) ? savedItem[key] : void 0
      ])),
      reinforcement_cost_snapshot: savedItem?.reinforcement_cost_snapshot == null ? void 0 : structuredClone(savedItem.reinforcement_cost_snapshot)
    },
    issues: blockers
  };
}
function calcItem(item, project, inventory, settings = {}, savedItem = item) {
  const versioned = calculateVersionedItem(item, project, inventory, settings, savedItem);
  if (versioned) return versioned.cost;
  const effectiveItem = { ...item, excavation_method: item.excavation_method || project?.excavation_method };
  const inputIssues = foundationItemInputIssues(effectiveItem);
  const settingIssues = foundationItemSettingIssues(effectiveItem, settings);
  if (inputIssues.length || settingIssues.length || foundationItemCatalogIssues(item, inventory).length) {
    return {
      quantity: inputIssues.length ? item.quantity : Math.max(1, num2(item.quantity, 1)),
      ...Object.fromEntries(ITEM_SNAPSHOT_FIELDS.map((key) => [
        key,
        hasFoundationCostSnapshot(savedItem?.[key]) ? savedItem[key] : void 0
      ]))
    };
  }
  const legacy = calcItemCost(effectiveItem, inventory, settings);
  const isPillar = item.foundation_type === "pillar";
  const rebarSize = (isPillar ? item.pillar_rebar_size : item.rebar_size) || "#4";
  return {
    quantity: Math.max(1, num2(item.quantity, 1)),
    concrete_volume_cy: legacy.volumeCY,
    excavation_volume_cy: legacy.volumeCY * 1.25,
    concrete_bags: legacy.concreteBags,
    rebar_feet: legacy.rebarFt,
    rebar_weight_lbs: legacy.rebarFt * (REBAR_LB_PER_FT[rebarSize] || 0.668),
    concrete_cost: legacy.concreteCost,
    concrete_rate: legacy.concreteRate,
    rebar_cost: legacy.rebarCost,
    rebar_rate: legacy.rebarRate,
    excavation_cost: legacy.excavationCost,
    excavation_hours: legacy.excavationHours,
    forming_cost: legacy.formingCost,
    forming_qty: legacy.formingQty,
    pouring_cost: legacy.pouringCost,
    finishing_cost: legacy.finishingCost,
    finishing_hours: legacy.finishingHours,
    item_total_cost: legacy.total
  };
}
var RENTAL_PERIODS = ["day", "week", "month"];
var equipmentAssignedId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var equipmentComponentId = (entry) => {
  const id = entry?.component_id ?? entry?._id;
  return equipmentAssignedId(id) ? id : null;
};
function equipmentPricing(entry, bindings, index) {
  const issues = [...bindings.issues];
  const eq = bindings.equipment;
  const add = (kind, field, inventoryId, code, message) => issues.push({
    kind,
    index,
    componentId: entry?.component_id ?? entry?._id ?? null,
    field,
    inventoryId: inventoryId ?? null,
    code,
    message: `Equipment ${index + 1}: ${message}.`
  });
  const customQtyOn = entry?.custom_qty !== void 0 && entry?.custom_qty !== null;
  const customRateOn = entry?.custom_rate !== void 0 && entry?.custom_rate !== null;
  const rentedRows = (rows) => (rows || []).filter((row) => row.inventory && row.quantity !== 0);
  const periodDriven = !customRateOn || rentedRows(bindings.attachmentRows).length > 0 || rentedRows(bindings.subAttachmentRows).length > 0;
  const rentalPeriod = entry?.rental_period || "day";
  const periodField = RENTAL_PERIODS.includes(rentalPeriod) ? `cost_per_${rentalPeriod}` : null;
  if (periodDriven && periodField === null) {
    add(
      "equipment",
      "rental_period",
      eq?.id ?? null,
      "equipment_period_unavailable",
      "select a daily, weekly, or monthly rental period before repricing"
    );
  }
  let duration = null;
  if (customQtyOn) {
    duration = inventoryPositiveNumber(entry.custom_qty);
    if (duration === null) {
      add(
        "equipment",
        "custom_qty",
        eq?.id ?? null,
        "custom_qty_unavailable",
        "record a finite, positive custom quantity or clear the override before repricing"
      );
    }
  } else {
    duration = entry?.rental_duration === void 0 || entry?.rental_duration === null || entry?.rental_duration === "" ? 1 : inventoryPositiveNumber(entry.rental_duration);
    if (duration === null) {
      add(
        "equipment",
        "rental_duration",
        eq?.id ?? null,
        "equipment_duration_unavailable",
        "record a finite, positive rental duration or clear it before repricing"
      );
    }
  }
  let rate = null;
  if (customRateOn) {
    rate = inventoryNonnegativeNumber(entry.custom_rate);
    if (rate === null) {
      add(
        "equipment",
        "custom_rate",
        eq?.id ?? null,
        "custom_rate_unavailable",
        "record a finite, nonnegative custom rate or clear the override before repricing"
      );
    }
  } else if (eq && periodField !== null) {
    rate = inventoryNonnegativeNumber(eq[periodField]);
    if (rate === null) {
      add(
        "equipment",
        periodField,
        eq.id ?? null,
        "equipment_price_unavailable",
        `record a finite, nonnegative catalog ${rentalPeriod} rental price before repricing`
      );
    }
  }
  let deliveryCharge = null;
  if (entry?.include_delivery) {
    const customDeliveryOn = entry?.custom_delivery_charge !== void 0 && entry?.custom_delivery_charge !== null;
    if (customDeliveryOn) {
      deliveryCharge = inventoryNonnegativeNumber(entry.custom_delivery_charge);
      if (deliveryCharge === null) {
        add(
          "equipment",
          "custom_delivery_charge",
          eq?.id ?? null,
          "custom_delivery_charge_unavailable",
          "record a finite, nonnegative custom delivery charge or clear the override before repricing"
        );
      }
    } else if (eq) {
      deliveryCharge = inventoryNonnegativeNumber(eq.pickup_delivery_cost);
      if (deliveryCharge === null) {
        add(
          "equipment",
          "pickup_delivery_cost",
          eq.id ?? null,
          "equipment_delivery_price_unavailable",
          "record a finite, nonnegative catalog delivery charge before repricing"
        );
      }
    }
  }
  const rawQuantity = (row) => row.field === "attachment_counts" || row.field === "sub_attachment_counts" ? entry?.[row.field]?.[row.id] : row.quantity;
  const priceRows = (rows, kind) => (rows || []).map((row) => {
    const quantity3 = !row.inventory ? 0 : rawQuantity(row);
    if (!row.inventory || Number(quantity3) === 0) return { row, skipped: true };
    const parsedQuantity = inventoryPositiveNumber(quantity3);
    if (parsedQuantity === null) {
      add(
        kind,
        row.field,
        row.id ?? null,
        "equipment_attachment_qty_unavailable",
        `record a finite, positive ${kind.replaceAll("_", " ")} quantity or clear it before repricing`
      );
      return { row, quantity: null, rate: null };
    }
    const rowRate = periodField === null ? null : inventoryNonnegativeNumber(row.inventory[periodField]);
    if (periodField !== null && rowRate === null) {
      add(
        kind,
        periodField,
        row.id ?? null,
        "equipment_price_unavailable",
        `record a finite, nonnegative catalog ${rentalPeriod} price for the selected ${kind.replaceAll("_", " ")} before repricing`
      );
    }
    return { row, quantity: parsedQuantity, rate: rowRate };
  });
  return {
    issues,
    equipment: eq,
    rentalPeriod,
    duration,
    rate,
    deliveryCharge,
    attachmentLines: priceRows(bindings.attachmentRows, "attachment"),
    subAttachmentLines: priceRows(bindings.subAttachmentRows, "sub_attachment")
  };
}
function calcEquipmentPricing(selected, inventory = [], options = {}) {
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedEquipment");
  const savedEquipment = Array.isArray(options?.savedEquipment) ? options.savedEquipment : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows || []) {
      const id = equipmentComponentId(row);
      if (id !== null) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(selected), savedCounts = counts(savedEquipment);
  const savedById = new Map(savedEquipment.filter((row) => equipmentComponentId(row) !== null).map((row) => [equipmentComponentId(row), row]));
  const held = (entry) => {
    const result = { ...entry };
    if (!explicitSnapshot) return result;
    const id = equipmentComponentId(entry);
    const saved = id !== null && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null;
    if (saved && Object.prototype.hasOwnProperty.call(saved, "equipment_cost")) result.equipment_cost = saved.equipment_cost;
    else delete result.equipment_cost;
    return result;
  };
  return (selected || []).map((storedEntry, index) => {
    const entry = storedEntry || {};
    const bindings = resolveFoundationEquipment(entry, inventory, index);
    const check = equipmentPricing(entry, bindings, index);
    const context = { ...bindings, issues: check.issues, rentalPeriod: check.rentalPeriod, duration: check.duration };
    if (check.issues.length) {
      const pricedEntry = held(entry);
      return {
        ...context,
        pricedEntry,
        baseCost: null,
        deliveryCost: null,
        totalCost: hasFoundationCostSnapshot(pricedEntry.equipment_cost) ? pricedEntry.equipment_cost : null,
        attachmentRows: bindings.attachmentRows.map((row) => ({ ...row, cost: null })),
        subAttachmentRows: bindings.subAttachmentRows.map((row) => ({ ...row, cost: null }))
      };
    }
    const baseCost = check.rate * check.duration;
    let entryTotal = baseCost;
    if (entry.include_delivery) entryTotal += check.deliveryCharge;
    const pricedLines = (lines) => lines.map((line) => {
      if (line.skipped) return { ...line.row, cost: 0 };
      const cost = line.rate * check.duration * line.quantity;
      entryTotal += cost;
      return { ...line.row, cost };
    });
    const attachmentRows = pricedLines(check.attachmentLines);
    const subAttachmentRows = pricedLines(check.subAttachmentLines);
    return {
      ...context,
      pricedEntry: { ...entry, equipment_cost: entryTotal },
      baseCost,
      deliveryCost: entry.include_delivery ? check.deliveryCharge : 0,
      attachmentRows,
      subAttachmentRows,
      totalCost: entryTotal
    };
  });
}
function equipmentCostTotal(pricedEntries = []) {
  let total = 0;
  for (const entry of pricedEntries || []) {
    if (!hasFoundationCostSnapshot(entry?.equipment_cost)) return null;
    total += entry.equipment_cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}
function calcSignageCabinetPricing(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : []).map((cabinet, index) => {
    const issues = signageCabinetInputIssues(cabinet, index);
    const entry = { ...cabinet ?? {} };
    if (issues.length) return { available: false, issues, cost: null, pricedEntry: entry };
    const quantity3 = entry.quantity === void 0 || entry.quantity === null || entry.quantity === "" ? 1 : Number(entry.quantity);
    const cost = Number(entry.unit_cost) * quantity3;
    return { available: true, issues, cost, pricedEntry: entry };
  });
}
function signageCabinetCostTotal(pricedRows = []) {
  let total = 0;
  for (const row of pricedRows || []) {
    if (!hasFoundationCostSnapshot(row?.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}
function captureConcreteDeliverySnapshot(delivery) {
  return {
    version: 1,
    concrete_total: delivery.concreteTotal,
    rounded_yards: delivery.roundedYards,
    rate_per_yard: delivery.ratePerYard,
    additional_stops_cost: delivery.additionalStopsCost,
    trucks: delivery.trucksList.map((truck) => ({
      yards: truck.yards,
      rounded_yards: truck.roundedYards,
      cost: truck.cost,
      small_order_fee: truck.smallOrderFee,
      fuel_fee: truck.fuelFee
    }))
  };
}
function savedConcreteDelivery(project) {
  const snapshot = project?.concrete_delivery_snapshot?.version === 1 ? project.concrete_delivery_snapshot : null;
  const value = (record, key) => hasFoundationCostSnapshot(record?.[key]) ? record[key] : void 0;
  return {
    pricingUnavailable: true,
    concreteTotal: value(snapshot, "concrete_total"),
    roundedYards: value(snapshot, "rounded_yards"),
    ratePerYard: value(snapshot, "rate_per_yard"),
    additionalStopsCost: value(snapshot, "additional_stops_cost"),
    trucksList: (Array.isArray(snapshot?.trucks) ? snapshot.trucks : []).map((truck) => ({
      yards: value(truck, "yards"),
      roundedYards: value(truck, "rounded_yards"),
      cost: value(truck, "cost"),
      smallOrderFee: value(truck, "small_order_fee"),
      fuelFee: value(truck, "fuel_fee")
    })),
    availableMixes: [],
    availableAdmixes: []
  };
}
function calcProject(project, rawInventory, settings = {}, options = {}) {
  const inventory = normalizeFoundationInventoryRows(rawInventory);
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options, "savedProject");
  const savedProject = !explicitSnapshot ? project : project.id !== void 0 && project.id !== null && project.id !== "" && options.savedProject?.id === project.id ? options.savedProject : null;
  const sourceItems = project.items || [];
  const savedItems = /* @__PURE__ */ new Map();
  const currentIds = /* @__PURE__ */ new Map();
  for (const item of savedProject?.items || []) {
    if (item.component_id) savedItems.set(item.component_id, savedItems.has(item.component_id) ? null : item);
  }
  for (const item of sourceItems) currentIds.set(item.component_id, (currentIds.get(item.component_id) || 0) + 1);
  const poleCalc = calcPoles(
    project.poles,
    inventory,
    settings,
    explicitSnapshot ? { savedPoles: savedProject?.poles ?? [] } : {}
  );
  const wallCalc = calcWalls(
    project,
    inventory,
    settings,
    explicitSnapshot ? { savedWalls: savedProject?.walls ?? [] } : {}
  );
  const equipmentCalc = calcEquipmentPricing(
    project.selected_equipment,
    inventory,
    explicitSnapshot ? { savedEquipment: savedProject?.selected_equipment ?? [] } : {}
  );
  const equipmentPricing2 = equipmentCalc.map((row) => ({ available: row.issues.length === 0, issues: row.issues }));
  const catalogIssues = [
    ...poleCalc.polePricing.flatMap((entry) => entry.issues),
    ...wallCalc.wallPricing.flatMap((entry) => entry.issues),
    ...equipmentPricing2.flatMap((entry) => entry.issues),
    ...foundationAssemblyCatalogIssues(project, inventory).filter((issue) => !["pole", "wall", "internal_wall", "equipment", "attachment", "sub_attachment"].includes(issue.kind)),
    // Item-consumed Settings availability — kind "foundation" + item index so
    // each issue marks the card it belongs to (and gates the delivery scan).
    ...sourceItems.flatMap((item, index) => foundationItemSettingIssues(
      { ...item, excavation_method: item.excavation_method || project.excavation_method },
      settings,
      index
    ))
  ];
  const inputIssues = foundationProjectInputIssues(project);
  const versioned = sourceItems.map((item, index) => {
    const savedItem = !explicitSnapshot ? item : item.component_id && currentIds.get(item.component_id) === 1 ? savedItems.get(item.component_id) || null : null;
    const result = calculateVersionedItem(item, project, inventory, settings, savedItem);
    for (const issue of result?.issues || []) inputIssues.push({
      kind: "foundation",
      index,
      componentId: item.component_id ?? null,
      field: issue.field,
      code: issue.code,
      severity: "error",
      message: `Foundation ${index + 1}: ${issue.message}`
    });
    return result;
  });
  const cabinetCalc = calcSignageCabinetPricing(project.signage_cabinets);
  const signageCabinetPricing = cabinetCalc.map((row) => ({ available: row.available, issues: row.issues }));
  const landscapeCalc = landscapeSummary(project.landscape);
  const landscapeIssues = inputIssues.filter((issue) => issue.kind === "landscape");
  const landscapePricing = { available: landscapeIssues.length === 0, issues: landscapeIssues };
  const itemPricing = sourceItems.map((item, index) => {
    const issues = [
      ...catalogIssues.filter((issue) => issue.kind === "foundation" && issue.index === index),
      ...inputIssues.filter((issue) => issue.kind === "foundation" && issue.index === index)
    ];
    return { available: issues.length === 0, issues };
  });
  const items = sourceItems.map((item, index) => {
    const savedItem = !explicitSnapshot ? item : item.component_id && currentIds.get(item.component_id) === 1 ? savedItems.get(item.component_id) || null : null;
    return { ...item, ...versioned[index]?.cost || calcItem(item, project, inventory, settings, savedItem) };
  });
  const equipment = equipmentCalc.map((row) => row.pricedEntry);
  const deliveryCheck = itemPricing.some((item) => !item.available) ? null : calcConcreteDelivery(
    { ...project, settings },
    (project.items || []).map((i) => ({
      ...i,
      // Versioned items price steel outside the ported legacy formula — the
      // delivery volume scan must not read their rebar through that lens.
      ...i.reinforcement_calculation_version === 2 ? { include_rebar: false } : {},
      excavation_method: i.excavation_method || project.excavation_method
    })),
    inventory
  );
  const delivery = deliveryCheck === null || deliveryCheck.pricingUnavailable === true ? savedConcreteDelivery(savedProject) : deliveryCheck;
  if (deliveryCheck?.issues?.length) catalogIssues.push(...deliveryCheck.issues);
  const constructionWarnings = foundationConstructionWarnings(
    project,
    inventory,
    { items, deliveryCheck }
  );
  const walls = wallCalc.walls;
  const poles = poleCalc.poles;
  const wallCaps = calcWallCaps(
    project.wall_caps,
    inventory,
    explicitSnapshot ? { savedCaps: savedProject?.wall_caps ?? [] } : {}
  );
  const sum = (key) => items.some((item, index) => !itemPricing[index].available && !hasFoundationCostSnapshot(item[key])) ? null : items.reduce((s, i) => s + num2(i[key]), 0);
  const addKnown = (a, b) => hasFoundationCostSnapshot(a) && hasFoundationCostSnapshot(b) ? a + b : null;
  const category = (key, value) => value !== null ? value : hasFoundationCostSnapshot(savedProject?.[key]) ? savedProject[key] : null;
  const itemsTotal = addKnown(sum("item_total_cost"), delivery.concreteTotal);
  const sumWall = (key) => {
    let total = 0;
    for (const wall of walls) {
      const value = wall.calculatedCosts?.[key];
      if (!hasFoundationCostSnapshot(value)) return null;
      total += value;
      if (!Number.isFinite(total)) return null;
    }
    return total;
  };
  const wallTotal = sumWall("totalCost");
  const sumPole = (key) => {
    let total = 0;
    for (const pole of poles) {
      const value = pole?.[key];
      if (!hasFoundationCostSnapshot(value)) return null;
      total += value;
      if (!Number.isFinite(total)) return null;
    }
    return total;
  };
  const polesTotal = sumPole("total_cost");
  const equipmentTotal = equipmentCostTotal(equipment);
  const totals = {
    // Bagged concrete is priced per item; ready-mix is priced per delivered truck.
    total_concrete_cost: category("total_concrete_cost", addKnown(sum("concrete_cost"), delivery.concreteTotal)),
    concrete_delivery_cost: delivery.concreteTotal,
    concrete_delivered_yards: delivery.roundedYards,
    concrete_rate_per_yard: delivery.ratePerYard,
    concrete_trucks: delivery.trucksList,
    additional_stops_cost: delivery.additionalStopsCost,
    total_rebar_cost: category("total_rebar_cost", sum("rebar_cost")),
    total_excavation_cost: category("total_excavation_cost", sum("excavation_cost")),
    total_forming_materials_cost: category("total_forming_materials_cost", sum("forming_cost")),
    total_labor_cost: category("total_labor_cost", addKnown(sum("pouring_cost"), sum("finishing_cost"))),
    total_pole_cost: category("total_pole_cost", sumPole("pole_cost")),
    total_pole_painting_cost: category("total_pole_painting_cost", sumPole("pole_painting_cost")),
    total_brick_cost: sumWall("materialCost"),
    total_fill_cost: sumWall("internalMaterialCost"),
    total_equipment_cost: category("total_equipment_cost", equipmentTotal),
    total_wall_cost: wallTotal,
    total_wall_cap_cost: wallCaps.total,
    wall_caps_by_material: wallCaps.byInventory,
    total_concrete_volume_cy: sum("concrete_volume_cy"),
    total_excavation_volume_cy: sum("excavation_volume_cy"),
    total_labor_hours: addKnown(sum("finishing_hours"), sum("excavation_hours")),
    // Page-level extras: held at the acknowledged project totals when the
    // recorded rows cannot be repriced — a null here is "unavailable", never $0.
    total_signage_cabinet_cost: category("total_signage_cabinet_cost", signageCabinetCostTotal(cabinetCalc)),
    total_landscape_cost: category("total_landscape_cost", landscapeIssues.length ? null : landscapeCalc.total)
  };
  totals.grand_total = itemsTotal === null || wallTotal === null || polesTotal === null || equipmentTotal === null || wallCaps.total === null ? null : itemsTotal + wallTotal + polesTotal + equipmentTotal + wallCaps.total;
  return {
    items,
    equipment,
    walls,
    poles,
    wallCaps: wallCaps.caps,
    totals,
    delivery,
    itemPricing,
    polePricing: poleCalc.polePricing,
    wallPricing: wallCalc.wallPricing,
    equipmentPricing: equipmentPricing2,
    signageCabinetPricing,
    landscapePricing,
    catalogIssues,
    inputIssues,
    constructionWarnings
  };
}
var money = (n) => `$${num2(n).toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationItemCard.jsx
import { Fragment as Fragment2, jsx, jsxs } from "react/jsx-runtime";
var amt = (v) => hasFoundationCostSnapshot(v) ? money(v) : "Not saved";
var num22 = (v) => Number.isFinite(v) ? v.toFixed(2) : "Not saved";
var Field = ({ label, ...props }) => /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
  label,
  /* @__PURE__ */ jsx(Input, { ...props })
] });
var Check = ({ label, checked, onChange }) => /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-gray-700", children: [
  /* @__PURE__ */ jsx("input", { type: "checkbox", checked: !!checked, onChange: (e) => onChange(e.target.checked) }),
  label
] });
var Picker = ({ label, value, onChange, options, placeholder }) => {
  const missing = value && !options.some((o) => o.id === value);
  return /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
    label,
    /* @__PURE__ */ jsxs(
      "select",
      {
        value: value || "",
        onChange: (e) => onChange(e.target.value),
        className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm",
        children: [
          /* @__PURE__ */ jsx("option", { value: "", children: placeholder }),
          missing && /* @__PURE__ */ jsxs("option", { value, disabled: true, children: [
            "Catalog item unavailable (",
            value,
            ")"
          ] }),
          options.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.material_name }, o.id))
        ]
      }
    )
  ] });
};
function FoundationItemCard({ item, index, catalog, onChange, onRemove, onDuplicate, pricing }) {
  const set = (patch) => onChange(index, patch);
  const numSet = (key) => (e) => set({ [key]: parseFloat(e.target.value) || 0 });
  const nullSet = (key) => (e) => set({ [key]: inventoryNumberInput(e.target.value) });
  const isPillar = item.foundation_type === "pillar";
  const legacyReinforcement = item.reinforcement_calculation_version == null || item.reinforcement_calculation_version === 1;
  const unavailable = pricing?.available === false;
  const concreteRow = (catalog.concrete || []).find((c) => c.id === item.selected_concrete_id);
  const overrideLabel = !concreteRow ? "Concrete cost override (unknown unit)" : concreteRow.material_type === "bagged_concrete" ? "Concrete $/bag override" : "Concrete $/CY override";
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-sm border border-gray-200 border-l-4 border-l-amber-500 p-4", children: [
    unavailable && /* @__PURE__ */ jsxs("div", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1", id: `foundation-${index}-pricing`, children: [
      /* @__PURE__ */ jsx("p", { className: "text-[11px] font-semibold text-amber-800", children: "Saved amounts (not current pricing)" }),
      /* @__PURE__ */ jsx("p", { className: "text-[10px] text-amber-700", children: "Saved quantities may not reflect the current design." }),
      (pricing.issues || []).map((i, k) => /* @__PURE__ */ jsx("p", { className: "text-[10px] text-amber-700", children: i.message }, k))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3 mb-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Box, { className: "w-4 h-4 text-amber-500", "aria-hidden": "true" }),
        /* @__PURE__ */ jsxs("span", { className: "text-[12px] font-bold text-gray-700", children: [
          "Foundation #",
          index + 1
        ] }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: item.foundation_type || "",
            onChange: (e) => set({ foundation_type: e.target.value }),
            className: "h-8 rounded-md border border-input bg-transparent px-2 text-sm font-semibold",
            children: [
              item.foundation_type !== "spread_foot" && item.foundation_type !== "pillar" && /* @__PURE__ */ jsx("option", { value: item.foundation_type || "", disabled: true, children: item.foundation_type ? `Unsupported type: ${item.foundation_type}` : "Choose foundation type" }),
              /* @__PURE__ */ jsx("option", { value: "spread_foot", children: "Spread Footing" }),
              /* @__PURE__ */ jsx("option", { value: "pillar", children: "Pillar / Caisson" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
        /* @__PURE__ */ jsx("div", { className: "font-bold text-gray-900", children: amt(item.item_total_cost) }),
        /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-gray-400", children: [
          num22(item.concrete_volume_cy),
          " CY concrete"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        onDuplicate && /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onDuplicate(index), className: "text-gray-400 hover:text-blue-600", title: "Duplicate", children: /* @__PURE__ */ jsx(Copy, { className: "w-4 h-4", "aria-hidden": "true" }) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              if (!window.confirm(`Remove Foundation #${index + 1}?`)) return;
              onRemove(index);
            },
            className: "text-gray-400 hover:text-red-600",
            title: "Delete",
            children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4", "aria-hidden": "true" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      Field,
      {
        label: "Description",
        value: item.description || "",
        onChange: (e) => set({ description: e.target.value })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3", children: [
      /* @__PURE__ */ jsx(Field, { label: "Quantity", type: "number", value: item.quantity ?? 1, onChange: numSet("quantity") }),
      isPillar ? /* @__PURE__ */ jsx(Field, { label: "Diameter (in)", type: "number", value: item.diameter ?? 0, onChange: numSet("diameter") }) : /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(Field, { label: "Length (in)", type: "number", value: item.length_inches ?? 0, onChange: numSet("length_inches") }),
        /* @__PURE__ */ jsx(Field, { label: "Width (in)", type: "number", value: item.width_inches ?? 0, onChange: numSet("width_inches") })
      ] }),
      /* @__PURE__ */ jsx(Field, { label: "Depth (in)", type: "number", value: item.depth_inches ?? 0, onChange: numSet("depth_inches") }),
      /* @__PURE__ */ jsx(
        Field,
        {
          label: "Grade offset (in)",
          type: "number",
          value: item.grade_offset_inches ?? 0,
          onChange: numSet("grade_offset_inches")
        }
      ),
      /* @__PURE__ */ jsx(
        Field,
        {
          label: "Rotation (\xB0)",
          type: "number",
          value: item.rotation_degrees ?? 0,
          onChange: numSet("rotation_degrees")
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3", children: [
      /* @__PURE__ */ jsx(
        Picker,
        {
          label: "Concrete",
          value: item.selected_concrete_id,
          onChange: (v) => set({ selected_concrete_id: v }),
          options: catalog.concrete,
          placeholder: "Use project rate"
        }
      ),
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
        "Excavation method",
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: item.excavation_method || "",
            onChange: (e) => set({ excavation_method: e.target.value }),
            className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm",
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Project default" }),
              /* @__PURE__ */ jsx("option", { value: "hand_dig", children: "Hand dig" }),
              /* @__PURE__ */ jsx("option", { value: "equipment_excavation", children: "Equipment" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        Picker,
        {
          label: "Forming material",
          value: item.selected_forming_id,
          onChange: (v) => set({ selected_forming_id: v }),
          options: catalog.forming || [],
          placeholder: "None"
        }
      ),
      /* @__PURE__ */ jsx(
        Field,
        {
          label: overrideLabel,
          type: "number",
          step: "any",
          min: "0",
          value: item.custom_concrete_cost_per_cy ?? "",
          onChange: nullSet("custom_concrete_cost_per_cy"),
          "aria-label": overrideLabel,
          "aria-invalid": pricing?.issues?.some((i) => i.field === "custom_concrete_cost_per_cy") || void 0,
          "aria-describedby": pricing?.issues?.some((i) => i.field === "custom_concrete_cost_per_cy") ? `foundation-${index}-pricing` : void 0
        }
      ),
      item.custom_concrete_cost_per_cy !== null && item.custom_concrete_cost_per_cy !== void 0 && /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: "text-[10px] text-amber-700 hover:underline self-end",
          onClick: () => set({ custom_concrete_cost_per_cy: null }),
          children: "Clear override"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100", children: [
      /* @__PURE__ */ jsx(Check, { label: "Rebar", checked: item.include_rebar, onChange: (v) => set({ include_rebar: v }) }),
      /* @__PURE__ */ jsx(Check, { label: "Forming", checked: item.include_forming, onChange: (v) => set({ include_forming: v }) }),
      /* @__PURE__ */ jsx(Check, { label: "Finishing", checked: item.include_finishing, onChange: (v) => set({ include_finishing: v }) }),
      /* @__PURE__ */ jsx(
        Check,
        {
          label: "This is a new sign location",
          checked: item.is_new_sign_location,
          onChange: (v) => set({ is_new_sign_location: v })
        }
      )
    ] }),
    item.include_rebar && legacyReinforcement && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3", children: [
      isPillar ? /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(
          Field,
          {
            label: "Rebar size",
            value: item.pillar_rebar_size || "#4",
            onChange: (e) => set({ pillar_rebar_size: e.target.value })
          }
        ),
        /* @__PURE__ */ jsx(
          Field,
          {
            label: "Hoop dia (in)",
            type: "number",
            value: item.pillar_rebar_hoop_diameter ?? 0,
            onChange: numSet("pillar_rebar_hoop_diameter")
          }
        ),
        /* @__PURE__ */ jsx(
          Field,
          {
            label: "Hoops (layers)",
            type: "number",
            value: item.pillar_rebar_layers ?? 1,
            onChange: numSet("pillar_rebar_layers")
          }
        ),
        /* @__PURE__ */ jsx(
          Field,
          {
            label: "Vertical bars",
            type: "number",
            value: item.pillar_vertical_rebar_count ?? 4,
            onChange: numSet("pillar_vertical_rebar_count")
          }
        )
      ] }) : /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(
          Field,
          {
            label: "Rebar size",
            value: item.rebar_size ?? "",
            onChange: (e) => set({ rebar_size: e.target.value })
          }
        ),
        /* @__PURE__ */ jsx(
          Field,
          {
            label: "Spacing length (in)",
            type: "number",
            value: item.rebar_spacing_length ?? 12,
            onChange: numSet("rebar_spacing_length")
          }
        ),
        /* @__PURE__ */ jsx(
          Field,
          {
            label: "Spacing width (in)",
            type: "number",
            value: item.rebar_spacing_width ?? 12,
            onChange: numSet("rebar_spacing_width")
          }
        ),
        /* @__PURE__ */ jsx(Field, { label: "Layers", type: "number", value: item.rebar_layers ?? 1, onChange: numSet("rebar_layers") })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "col-span-2 sm:col-span-4 text-xs text-gray-500", children: [
        Number.isFinite(item.rebar_feet) ? item.rebar_feet.toFixed(1) : "Not saved",
        " ft \xB7",
        " ",
        Number.isFinite(item.rebar_weight_lbs) ? item.rebar_weight_lbs.toFixed(0) : "Not saved",
        " lbs \xB7",
        " ",
        amt(item.rebar_cost)
      ] })
    ] }),
    !legacyReinforcement && /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600", children: item.reinforcement_calculation_version === 2 ? /* @__PURE__ */ jsxs(Fragment2, { children: [
      "Version 2 reinforcement uses the accepted design. Edit geometry and pricing through the controlled proposal below.",
      " ",
      /* @__PURE__ */ jsxs("span", { className: "font-semibold text-gray-800", children: [
        "Physical ",
        num22(item.rebar_geometry_feet),
        " ft / priced ",
        num22(item.rebar_feet),
        " ft - ",
        amt(item.rebar_cost)
      ] }),
      Number.isFinite(item.support_count) && item.support_count > 0 && /* @__PURE__ */ jsxs(Fragment2, { children: [
        " \xB7 Supports: ",
        item.support_count,
        " required",
        Number.isFinite(item.support_purchased_units) && item.support_purchased_units !== item.support_count ? ` / ${item.support_purchased_units} purchased` : "",
        " - ",
        amt(item.support_cost)
      ] })
    ] }) : /* @__PURE__ */ jsx(Fragment2, { children: "Unsupported reinforcement version. Reload before changing reinforcement pricing." }) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] font-bold uppercase tracking-wide text-amber-700", children: "Excavation" }),
      /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-amber-900", children: [
        "Volume: ~",
        Number.isFinite(item.excavation_volume_cy) ? item.excavation_volume_cy.toFixed(2) : "Not saved",
        " CY \xB7 Cost: ",
        amt(item.excavation_cost)
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 rounded-sm border border-gray-200 bg-slate-50 p-2", children: [
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs", children: [
        ["Rebar", item.rebar_cost],
        ["Forming", item.forming_cost],
        ["Pouring", item.pouring_cost],
        ["Finishing", item.finishing_cost],
        ["Excavation", item.excavation_cost]
      ].map(([label, value]) => /* @__PURE__ */ jsxs("div", { className: "px-1", children: [
        /* @__PURE__ */ jsx("div", { className: "text-gray-400", children: label }),
        /* @__PURE__ */ jsx("div", { className: "font-semibold text-gray-800", children: amt(value) })
      ] }, label)) }),
      /* @__PURE__ */ jsx("div", { className: "mt-2 text-center text-[11px] italic text-amber-700", children: "Concrete material & truck costs are aggregated for the entire project." })
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/ReinforcementDraftField.jsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function ReinforcementDraftField({ label, value, onChange, disabled, inputMode = "decimal", maxLength, suffix, placeholder, rawInvalid = false }) {
  const invalid = rawInvalid || value != null && !["string", "number"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value);
  return /* @__PURE__ */ jsxs2("label", { className: "block min-w-0", children: [
    /* @__PURE__ */ jsx2("span", { className: "text-[12px] text-gray-600", children: label }),
    /* @__PURE__ */ jsxs2("span", { className: "mt-0.5 flex items-center gap-1", children: [
      /* @__PURE__ */ jsx2(
        "input",
        {
          type: "text",
          "aria-label": label,
          inputMode,
          value: invalid ? "" : value ?? "",
          maxLength,
          placeholder,
          disabled,
          onChange: (e) => onChange(e.target.value),
          className: "w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px] disabled:bg-gray-50 disabled:text-gray-400"
        }
      ),
      invalid && /* @__PURE__ */ jsx2("span", { className: "text-[10px] text-red-600", children: "Invalid" }),
      suffix && /* @__PURE__ */ jsx2("span", { className: "text-[12px] text-gray-500", children: suffix })
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/ReinforcementDraftList.jsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var PAGE = 20;
var uuidOk = () => typeof globalThis.crypto?.randomUUID === "function";
var newRowId = (prefix) => `${prefix}_${globalThis.crypto.randomUUID()}`;
var isValidRow = (r) => r && typeof r === "object" && !Array.isArray(r);
var strOrInvalid = (v) => v === null || v === void 0 || v === "" ? "" : typeof v === "string" ? v : "__invalid__";
function ReinforcementDraftList({ title, listKey, rows, fields, onReplaceList, onAdd, onDelete, onFieldChange, disabled, addLabel = "Add", maxRows }) {
  const [page, setPage] = useState(0);
  if (rows !== void 0 && !Array.isArray(rows)) {
    return /* @__PURE__ */ jsxs3("div", { "data-list": listKey, className: "rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: [
      title,
      " list malformed.",
      " ",
      /* @__PURE__ */ jsx3("button", { type: "button", disabled, onClick: onReplaceList, className: "underline disabled:text-gray-400", children: "Replace List" })
    ] });
  }
  const safe = Array.isArray(rows) ? rows : [];
  const pages = Math.max(1, Math.ceil(safe.length / PAGE));
  const pageIdx = Math.min(page, pages - 1);
  const shown = safe.slice(pageIdx * PAGE, pageIdx * PAGE + PAGE);
  const atCap = maxRows != null && safe.length >= maxRows;
  const canAdd = !disabled && !atCap && uuidOk();
  return /* @__PURE__ */ jsxs3("div", { "data-list": listKey, className: "rounded-sm border border-gray-200 min-w-0 max-w-full", children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1", children: [
      /* @__PURE__ */ jsx3("p", { className: "text-[12px] font-semibold text-gray-700 break-words min-w-0", children: title }),
      /* @__PURE__ */ jsx3("button", { type: "button", "data-add": listKey, disabled: !canAdd, onClick: onAdd, className: "shrink-0 text-[12px] text-amber-700 hover:underline disabled:text-gray-300", children: addLabel })
    ] }),
    !uuidOk() && /* @__PURE__ */ jsx3("p", { className: "px-2 py-1 text-[11px] text-amber-700", children: "Secure row IDs unavailable in this browser; rows cannot be added." }),
    atCap && /* @__PURE__ */ jsxs3("p", { className: "px-2 py-1 text-[11px] text-gray-500", children: [
      "Row limit reached (",
      maxRows,
      ")."
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "divide-y divide-gray-50", children: [
      shown.map((row, i) => {
        const idx = pageIdx * PAGE + i;
        const valid = isValidRow(row);
        const idStr = valid && typeof row.id === "string" ? row.id : null;
        if (!valid) {
          return /* @__PURE__ */ jsxs3("div", { "data-row": `${listKey}:${idx}`, className: "flex flex-wrap items-center gap-2 px-2 py-1.5 text-[12px] text-red-700", children: [
            /* @__PURE__ */ jsx3("span", { children: "Malformed row - delete to repair." }),
            /* @__PURE__ */ jsx3("button", { type: "button", "data-del": `${listKey}:${idx}`, disabled, onClick: () => onDelete(idx), className: "text-[12px] text-red-600 hover:underline disabled:text-gray-300", children: "Delete" })
          ] }, `bad-${idx}`);
        }
        return /* @__PURE__ */ jsxs3("div", { "data-row": `${listKey}:${idx}`, "data-row-id": idStr ?? void 0, className: "flex flex-wrap items-end gap-2 px-2 py-1.5", children: [
          idStr && /* @__PURE__ */ jsx3("span", { className: "w-full max-w-full break-words text-[10px] text-gray-400", children: idStr }),
          !idStr && /* @__PURE__ */ jsx3("span", { className: "w-full max-w-full break-words text-[10px] text-red-600", children: "Invalid or missing row id" }),
          fields.map(
            ({ key, label, options }) => options ? /* @__PURE__ */ jsxs3("label", { className: "block min-w-0", children: [
              /* @__PURE__ */ jsx3("span", { className: "text-[12px] text-gray-600", children: label }),
              /* @__PURE__ */ jsxs3(
                "select",
                {
                  value: strOrInvalid(row[key]),
                  disabled,
                  onChange: (e) => onFieldChange(idx, key, e.target.value),
                  className: "mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50",
                  children: [
                    options.map((o, oi) => /* @__PURE__ */ jsx3("option", { value: o.id ?? o, children: o.label ?? o }, `${o.id ?? o}-${oi}`)),
                    row[key] !== void 0 && row[key] !== null && typeof row[key] !== "string" && /* @__PURE__ */ jsx3("option", { value: "__invalid__", disabled: true, children: "Invalid value" }),
                    typeof row[key] === "string" && row[key] !== "" && !options.some((o) => (o.id ?? o) === row[key]) && /* @__PURE__ */ jsxs3("option", { value: row[key], disabled: true, children: [
                      "Missing: ",
                      row[key]
                    ] })
                  ]
                }
              )
            ] }, key) : /* @__PURE__ */ jsx3(ReinforcementDraftField, { label, value: row[key], disabled, onChange: (v) => onFieldChange(idx, key, v) }, key)
          ),
          /* @__PURE__ */ jsx3("button", { type: "button", "data-del": `${listKey}:${idx}`, disabled, onClick: () => onDelete(idx), className: "text-[12px] text-red-600 hover:underline disabled:text-gray-300", children: "Delete" })
        ] }, `${idStr ?? "invalid"}:${idx}`);
      }),
      !shown.length && /* @__PURE__ */ jsx3("p", { className: "px-2 py-2 text-[12px] text-gray-400", children: "None." })
    ] }),
    pages > 1 && /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between border-t border-gray-100 px-2 py-1 text-[12px] text-gray-500", children: [
      /* @__PURE__ */ jsx3("button", { type: "button", "data-page": "prev", disabled: disabled || pageIdx === 0, onClick: () => setPage(pageIdx - 1), className: "disabled:text-gray-300", children: "Prev" }),
      /* @__PURE__ */ jsxs3("span", { children: [
        "Page ",
        pageIdx + 1,
        " / ",
        pages
      ] }),
      /* @__PURE__ */ jsx3("button", { type: "button", "data-page": "next", disabled: disabled || pageIdx >= pages - 1, onClick: () => setPage(pageIdx + 1), className: "disabled:text-gray-300", children: "Next" })
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/ReinforcementDraftGeometry.jsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var SUPPORT_MODES = [
  { id: "unconfigured", label: "Unconfigured" },
  { id: "auto", label: "Auto" },
  { id: "manual", label: "Manual" },
  { id: "off", label: "Off" }
];
var asObj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : null;
var asList = (v) => Array.isArray(v) ? v : [];
function ReinforcementDraftGeometry({ draft, item, supportCatalog, disabled, onChange }) {
  const design = asObj(draft?.design);
  if (!design) {
    return /* @__PURE__ */ jsx4("div", { className: "rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: "Design draft malformed; repair required." });
  }
  const isPillar = item?.foundation_type === "pillar";
  const cover = asObj(design.cover_inches) ?? {};
  const supports = asObj(design.supports) ?? { mode: "unconfigured", reason: "" };
  const supportRows = asList(supportCatalog).filter((r) => r && typeof r === "object" && r.material_type === "rebar_support");
  const supportOptions = supportRows.filter((r) => typeof r.id === "string" && r.id).map((r) => ({ id: r.id, label: `${r.material_name || "Rebar support"}${r.rebar_support_height_inches != null ? ` (${r.rebar_support_height_inches} in)` : ""}` }));
  const spread = asObj(design.spread) ?? { mats: [], inter_mat_ties: [] };
  const pillar = asObj(design.pillar) ?? { hoops: [], longitudinal: {} };
  const lon = asObj(pillar.longitudinal) ?? {};
  const setCover = (k, v) => onChange({ ...design, cover_inches: { ...cover, [k]: v } });
  const setSupports = (p) => onChange({ ...design, supports: { ...supports, ...p } });
  const setSpread = (p) => onChange({ ...design, spread: { ...spread, ...p } });
  const setPillar = (p) => onChange({ ...design, pillar: { ...pillar, ...p } });
  const setLon = (k, v) => setPillar({ longitudinal: { ...lon, [k]: v } });
  const mats = Array.isArray(spread.mats) ? spread.mats : void 0;
  const ties = Array.isArray(spread.inter_mat_ties) ? spread.inter_mat_ties : void 0;
  const hoops = Array.isArray(pillar.hoops) ? pillar.hoops : void 0;
  const matOptions = (mats ?? []).filter((r) => r && typeof r === "object" && typeof r.id === "string").map((m) => ({ id: m.id, label: m.id }));
  const tieFromTo = () => [{ id: "", label: "-" }, ...matOptions];
  const replacements = [
    { key: "cover_inches", value: design.cover_inches, initial: { side: "", top: "", bottom: "" } },
    { key: "supports", value: design.supports, initial: { mode: "unconfigured", reason: "", spacing_inches: "", catalog_id: "", mats: [], placements: [] } },
    isPillar ? { key: "pillar", value: design.pillar, initial: { hoops: [], longitudinal: {} } } : { key: "spread", value: design.spread, initial: { mats: [], inter_mat_ties: [] } },
    ...isPillar && asObj(design.pillar) ? [{ key: "longitudinal", value: pillar.longitudinal, initial: {} }] : []
  ].filter((entry) => entry.value !== void 0 && !asObj(entry.value));
  if (replacements.length) return /* @__PURE__ */ jsx4("div", { className: "space-y-2", children: replacements.map(({ key, initial }) => /* @__PURE__ */ jsxs4("div", { className: "rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: [
    key,
    " draft malformed.",
    " ",
    /* @__PURE__ */ jsxs4("button", { type: "button", disabled, onClick: () => onChange(key === "longitudinal" ? { ...design, pillar: { ...pillar, longitudinal: initial } } : { ...design, [key]: initial }), className: "underline", children: [
      "Replace ",
      key
    ] })
  ] }, key)) });
  return /* @__PURE__ */ jsxs4("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx4(ReinforcementDraftField, { label: "Bar diameter (in)", value: design.bar_diameter_inches, disabled, onChange: (v) => onChange({ ...design, bar_diameter_inches: v }) }),
    /* @__PURE__ */ jsx4("div", { className: "grid grid-cols-3 gap-2", children: ["side", "top", "bottom"].map((k) => /* @__PURE__ */ jsx4(ReinforcementDraftField, { label: `Cover ${k} (in)`, value: cover[k], disabled, onChange: (v) => setCover(k, v) }, k)) }),
    /* @__PURE__ */ jsxs4("div", { children: [
      /* @__PURE__ */ jsxs4("label", { className: "block", children: [
        /* @__PURE__ */ jsx4("span", { className: "text-[12px] text-gray-600", children: "Supports" }),
        /* @__PURE__ */ jsxs4("select", { "aria-label": "Supports", value: typeof supports.mode === "string" && supports.mode !== "" ? supports.mode : "unconfigured", disabled, onChange: (e) => setSupports({ mode: e.target.value }), className: "mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50", children: [
          SUPPORT_MODES.map((m) => /* @__PURE__ */ jsx4("option", { value: m.id, children: m.label }, m.id)),
          typeof supports.mode === "string" && !SUPPORT_MODES.some((m) => m.id === supports.mode) && supports.mode && /* @__PURE__ */ jsxs4("option", { value: supports.mode, disabled: true, children: [
            "Reserved: ",
            supports.mode
          ] }),
          supports.mode !== void 0 && supports.mode !== null && typeof supports.mode !== "string" && /* @__PURE__ */ jsx4("option", { value: "unconfigured", disabled: true, children: "Invalid mode" })
        ] })
      ] }),
      supports.mode === "auto" && /* @__PURE__ */ jsx4("div", { className: "mt-1 space-y-1", children: isPillar ? /* @__PURE__ */ jsx4("p", { className: "text-[11px] text-amber-700", children: "Auto support placement is unavailable for pillar cages; use Manual or explain Off." }) : /* @__PURE__ */ jsx4(ReinforcementDraftField, { label: "Max support spacing (in)", value: supports.spacing_inches, inputMode: "decimal", disabled, onChange: (v) => setSupports({ spacing_inches: v }) }) }),
      (supports.mode === "auto" || supports.mode === "manual") && /* @__PURE__ */ jsxs4("div", { className: "mt-1", children: [
        /* @__PURE__ */ jsxs4("label", { className: "block", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-[12px] text-gray-600", children: "Support catalog pin (optional)" }),
          /* @__PURE__ */ jsxs4("select", { "aria-label": "Support catalog", value: typeof supports.catalog_id === "string" ? supports.catalog_id : "", disabled, onChange: (e) => setSupports({ catalog_id: e.target.value }), className: "mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50", children: [
            /* @__PURE__ */ jsx4("option", { value: "", children: "Auto-select (no pin)" }),
            supportOptions.map((o) => /* @__PURE__ */ jsx4("option", { value: o.id, children: o.label }, o.id))
          ] })
        ] }),
        supports.catalog_id && !supportRows.some((r) => r.id === supports.catalog_id) && /* @__PURE__ */ jsx4("p", { className: "mt-0.5 text-[11px] text-amber-700", children: "Pinned support ID is not in the current catalog \u2014 pricing will report it unresolved." }),
        !supportRows.length && /* @__PURE__ */ jsx4("p", { className: "mt-0.5 text-[11px] text-amber-700", children: "No rebar_support catalog rows loaded; compatible-pick pricing will stay unresolved." })
      ] }),
      supports.mode === "manual" && /* @__PURE__ */ jsxs4("div", { className: "mt-1 space-y-2", children: [
        /* @__PURE__ */ jsx4(
          ReinforcementDraftList,
          {
            title: "Support counts per mat",
            listKey: "support-mats",
            rows: supports.mats,
            maxRows: 256,
            disabled,
            onReplaceList: () => setSupports({ mats: [] }),
            fields: [
              { key: "mat_id", label: "Target", options: isPillar ? [{ id: "cage", label: "Pillar cage" }] : [{ id: "", label: "-" }, ...matOptions] },
              { key: "count", label: "Count", inputMode: "numeric" }
            ],
            onAdd: () => setSupports({ mats: [...asList(supports.mats), { mat_id: isPillar ? "cage" : "", count: "" }] }),
            onDelete: (i) => setSupports({ mats: asList(supports.mats).filter((_, j) => j !== i) }),
            onFieldChange: (i, k, v) => {
              const n = [...asList(supports.mats)];
              n[i] = { ...n[i], [k]: v };
              setSupports({ mats: n });
            }
          }
        ),
        /* @__PURE__ */ jsx4(
          ReinforcementDraftList,
          {
            title: "Explicit support placements",
            listKey: "support-placements",
            rows: supports.placements,
            maxRows: 4096,
            disabled,
            onReplaceList: () => setSupports({ placements: [] }),
            fields: [
              { key: "mat_id", label: "Target", options: isPillar ? [{ id: "cage", label: "Pillar cage" }] : [{ id: "", label: "-" }, ...matOptions] },
              { key: "x_inches", label: "X (in)" },
              { key: "z_inches", label: "Z (in)" }
            ],
            onAdd: () => setSupports({ placements: [...asList(supports.placements), { mat_id: isPillar ? "cage" : "", x_inches: "", z_inches: "" }] }),
            onDelete: (i) => setSupports({ placements: asList(supports.placements).filter((_, j) => j !== i) }),
            onFieldChange: (i, k, v) => {
              const n = [...asList(supports.placements)];
              n[i] = { ...n[i], [k]: v };
              setSupports({ placements: n });
            }
          }
        ),
        /* @__PURE__ */ jsx4("p", { className: "text-[11px] text-gray-500", children: "A mat may be covered by a count or by explicit placements, not both. Uncovered mats warn instead of guessing." })
      ] }),
      supports.mode === "off" && /* @__PURE__ */ jsx4(ReinforcementDraftField, { label: "Reason", value: supports.reason, inputMode: "text", disabled, onChange: (v) => setSupports({ reason: v }) })
    ] }),
    isPillar ? /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsx4(
        ReinforcementDraftList,
        {
          title: "Pillar hoops",
          listKey: "hoops",
          rows: pillar.hoops,
          maxRows: 256,
          disabled,
          onReplaceList: () => setPillar({ hoops: [] }),
          fields: [
            { key: "center_y_inches", label: "Center Y (in)" },
            { key: "centerline_diameter_inches", label: "Centerline dia (in)" },
            { key: "cut_allowance_inches", label: "Cut allowance (in)" }
          ],
          onAdd: () => setPillar({ hoops: [...hoops ?? [], { id: newRowId("hoop"), center_y_inches: "", centerline_diameter_inches: "", cut_allowance_inches: "" }] }),
          onDelete: (i) => setPillar({ hoops: hoops.filter((_, j) => j !== i) }),
          onFieldChange: (i, k, v) => {
            const n = [...hoops];
            n[i] = { ...n[i], [k]: v };
            setPillar({ hoops: n });
          }
        }
      ),
      /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsx4(ReinforcementDraftField, { label: "Longitudinal count", value: lon.count, inputMode: "numeric", disabled, onChange: (v) => setLon("count", v) }),
        /* @__PURE__ */ jsx4(ReinforcementDraftField, { label: "Longitudinal radius (in)", value: lon.radius_inches, disabled, onChange: (v) => setLon("radius_inches", v) }),
        /* @__PURE__ */ jsx4(ReinforcementDraftField, { label: "Bottom end (in)", value: lon.bottom_end_inches, disabled, onChange: (v) => setLon("bottom_end_inches", v) }),
        /* @__PURE__ */ jsx4(ReinforcementDraftField, { label: "Top end (in)", value: lon.top_end_inches, disabled, onChange: (v) => setLon("top_end_inches", v) })
      ] })
    ] }) : /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsx4(
        ReinforcementDraftList,
        {
          title: "Spread mats",
          listKey: "mats",
          rows: spread.mats,
          maxRows: 256,
          disabled,
          onReplaceList: () => setSpread({ mats: [] }),
          fields: [
            { key: "bearing_elevation_inches", label: "Bearing elevation (in)" },
            { key: "max_spacing_x_inches", label: "Max spacing X (in)" },
            { key: "max_spacing_z_inches", label: "Max spacing Z (in)" }
          ],
          onAdd: () => setSpread({ mats: [...mats ?? [], { id: newRowId("mat"), bearing_elevation_inches: "", max_spacing_x_inches: "", max_spacing_z_inches: "" }] }),
          onDelete: (i) => setSpread({ mats: mats.filter((_, j) => j !== i) }),
          onFieldChange: (i, k, v) => {
            const n = [...mats];
            n[i] = { ...n[i], [k]: v };
            setSpread({ mats: n });
          }
        }
      ),
      /* @__PURE__ */ jsx4(
        ReinforcementDraftList,
        {
          title: "Inter-mat ties",
          listKey: "ties",
          rows: spread.inter_mat_ties,
          maxRows: 4096,
          disabled,
          onReplaceList: () => setSpread({ inter_mat_ties: [] }),
          fields: [
            { key: "from_mat_id", label: "From mat", options: tieFromTo() },
            { key: "to_mat_id", label: "To mat", options: tieFromTo() },
            { key: "x_inches", label: "X (in)" },
            { key: "z_inches", label: "Z (in)" },
            { key: "cut_length_inches", label: "Cut length (in)" }
          ],
          onAdd: () => setSpread({ inter_mat_ties: [...ties ?? [], { id: newRowId("tie"), from_mat_id: "", to_mat_id: "", x_inches: "", z_inches: "", cut_length_inches: "" }] }),
          onDelete: (i) => setSpread({ inter_mat_ties: ties.filter((_, j) => j !== i) }),
          onFieldChange: (i, k, v) => {
            const n = [...ties];
            n[i] = { ...n[i], [k]: v };
            setSpread({ inter_mat_ties: n });
          }
        }
      ),
      /* @__PURE__ */ jsx4("p", { className: "text-[11px] text-gray-500", children: "Tie paths are preliminary and fabrication-review gated." })
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/ReinforcementDraftMaterial.jsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var asObj2 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : null;
var metaVal = (v) => typeof v === "string" && v.trim() || typeof v === "number" && Number.isFinite(v) ? v : "Unknown";
function ReinforcementDraftMaterial({ draft, catalog = [], disabled, onChange }) {
  const material = asObj2(draft?.material) ?? {};
  const overrides = asObj2(draft?.overrides) ?? {};
  const isManual = material.kind === "manual";
  const catalogRows = Array.isArray(catalog) ? catalog.filter((c) => c && typeof c === "object" && typeof c.id === "string") : [];
  const matches = catalogRows.filter((c) => c.id === material.inventory_id);
  const row = matches.length === 1 ? matches[0] : null;
  const meta = (k) => metaVal(row?.[k]);
  const setMaterial = (p) => onChange({ material: { ...material, ...p } });
  const setOverride = (k, v) => onChange({ overrides: { ...overrides, [k]: v === "" ? null : v } });
  const malformed = ["material", "overrides"].filter((key) => draft?.[key] !== void 0 && !asObj2(draft[key]));
  if (malformed.length) return /* @__PURE__ */ jsx5("div", { className: "space-y-2", children: malformed.map((key) => /* @__PURE__ */ jsxs5("div", { className: "rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: [
    key,
    " draft malformed.",
    " ",
    /* @__PURE__ */ jsxs5("button", { type: "button", disabled, onClick: () => onChange({
      [key]: key === "material" ? { kind: "" } : { quantity_ft: null, cost_per_ft: null }
    }), className: "underline", children: [
      "Replace ",
      key
    ] })
  ] }, key)) });
  return /* @__PURE__ */ jsxs5("div", { className: "space-y-3 min-w-0 max-w-full", children: [
    /* @__PURE__ */ jsxs5("div", { children: [
      /* @__PURE__ */ jsx5("span", { className: "text-[12px] text-gray-600", children: "Material basis" }),
      /* @__PURE__ */ jsx5("div", { className: "mt-1 flex flex-wrap gap-2", children: ["manual", "catalog"].map((k) => /* @__PURE__ */ jsx5(
        "button",
        {
          type: "button",
          disabled,
          onClick: () => setMaterial(k === "manual" ? { kind: "manual", ...Object.hasOwn(material, "unit") ? {} : { unit: "ft" } } : { kind: "catalog" }),
          className: `rounded-sm border px-2 py-1 text-[12px] ${material.kind === k ? "border-amber-500 bg-amber-50 text-amber-800" : "border-gray-300 text-gray-600"} disabled:text-gray-300`,
          children: k === "manual" ? "Manual" : "Catalog"
        },
        k
      )) })
    ] }),
    material.kind === "catalog" && /* @__PURE__ */ jsxs5("div", { children: [
      /* @__PURE__ */ jsxs5("label", { className: "block min-w-0", children: [
        /* @__PURE__ */ jsx5("span", { className: "text-[12px] text-gray-600", children: "Rebar item" }),
        /* @__PURE__ */ jsxs5("select", { "aria-label": "Rebar item", value: typeof material.inventory_id === "string" ? material.inventory_id : "", disabled, onChange: (e) => setMaterial({ inventory_id: e.target.value }), className: "mt-0.5 block w-full max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50", children: [
          /* @__PURE__ */ jsx5("option", { value: "", children: "Choose rebar" }),
          material.inventory_id !== void 0 && material.inventory_id !== null && typeof material.inventory_id !== "string" && /* @__PURE__ */ jsx5("option", { value: "", disabled: true, children: "Invalid selection" }),
          typeof material.inventory_id === "string" && material.inventory_id && !row && /* @__PURE__ */ jsxs5("option", { value: material.inventory_id, disabled: true, children: [
            "Unavailable: ",
            material.inventory_id
          ] }),
          catalogRows.map((c, index) => /* @__PURE__ */ jsx5("option", { value: c.id, children: typeof c.material_name === "string" ? c.material_name : c.id }, `${c.id}:${index}`))
        ] })
      ] }),
      !Array.isArray(catalog) && /* @__PURE__ */ jsx5("p", { className: "text-[11px] text-amber-700", children: "Catalog could not be read; no replacement metadata is inferred." }),
      matches.length > 1 && /* @__PURE__ */ jsx5("p", { className: "text-[11px] text-red-700", children: "Duplicate inventory ID; refresh the catalog before pricing." }),
      row && /* @__PURE__ */ jsxs5("div", { className: "mt-1 break-words rounded-sm border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-500", children: [
        "diameter ",
        meta("rebar_diameter_inches"),
        " - weight ",
        meta("rebar_weight_lb_per_ft"),
        " - ",
        meta("cost_per_unit"),
        "/",
        meta("unit")
      ] })
    ] }),
    isManual && /* @__PURE__ */ jsxs5("div", { className: "grid grid-cols-2 gap-2", children: [
      /* @__PURE__ */ jsx5(ReinforcementDraftField, { label: "Name", value: material.name, inputMode: "text", disabled, onChange: (v) => setMaterial({ name: v }) }),
      /* @__PURE__ */ jsx5(ReinforcementDraftField, { label: "Reason", value: material.reason, inputMode: "text", maxLength: 1e3, disabled, onChange: (v) => setMaterial({ reason: v }) }),
      /* @__PURE__ */ jsx5(ReinforcementDraftField, { label: "Nominal diameter (in)", value: material.bar_diameter_inches, disabled, onChange: (v) => setMaterial({ bar_diameter_inches: v }) }),
      /* @__PURE__ */ jsx5(ReinforcementDraftField, { label: "Weight (lb/ft)", value: material.weight_lb_per_ft, disabled, onChange: (v) => setMaterial({ weight_lb_per_ft: v }) }),
      /* @__PURE__ */ jsx5(ReinforcementDraftField, { label: "Cost /ft", value: material.cost_per_ft, disabled, onChange: (v) => setMaterial({ cost_per_ft: v }) }),
      /* @__PURE__ */ jsx5(ReinforcementDraftField, { label: "Unit", value: material.unit, inputMode: "text", disabled, onChange: (v) => setMaterial({ unit: v }) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "grid grid-cols-2 gap-2", children: [
      /* @__PURE__ */ jsx5(ReinforcementDraftField, { label: "Quantity override (ft)", value: overrides.quantity_ft ?? "", placeholder: "blank = no override", disabled, onChange: (v) => setOverride("quantity_ft", v) }),
      /* @__PURE__ */ jsx5(ReinforcementDraftField, { label: "Cost override ($/ft)", value: overrides.cost_per_ft ?? "", placeholder: "blank = no override", disabled, onChange: (v) => setOverride("cost_per_ft", v) })
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationReinforcementProposalPanel.jsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var verLabel = (v) => {
  if (v === null || v === void 0 || v === 1) return "Legacy";
  if (v === 2) return "Version 2";
  return "Unsupported";
};
function FoundationReinforcementProposalPanel({
  item,
  draft,
  catalog = [],
  supportCatalog = [],
  preview,
  disabled = false,
  busy = false,
  error,
  acknowledgments = null,
  onAcknowledgmentsChange,
  onStart,
  onDraftChange,
  onPreview,
  onAccept,
  onDiscard
}) {
  const label = verLabel(item?.reinforcement_calculation_version);
  const blocked = disabled || busy || label === "Unsupported";
  const ackProvided = acknowledgments !== null && acknowledgments !== void 0;
  const ack = acknowledgments !== null && typeof acknowledgments === "object" && !Array.isArray(acknowledgments) && (Object.getPrototypeOf(acknowledgments) === Object.prototype || Object.getPrototypeOf(acknowledgments) === null) ? acknowledgments : null;
  const ackEligible = !ackProvided || Boolean(
    ack?.preliminary === true && Array.isArray(preview?.warningCodes) && preview.warningCodes.every(
      (code) => typeof code === "string" && code.trim().length > 0 && (Array.isArray(ack?.warningCodes) ? ack.warningCodes : []).includes(code)
    )
  );
  const eligible = Boolean(
    typeof preview?.id === "string" && preview.id.trim().length > 0 && preview?.canAccept === true && preview?.stale !== true && !blocked && ackEligible
  );
  const guard = (fn) => (...a) => {
    if (!blocked) fn?.(...a);
  };
  const changeDraft = (patch) => {
    if (!blocked) onDraftChange?.({ ...draft, ...patch });
  };
  return /* @__PURE__ */ jsxs6("div", { className: "rounded-sm border border-gray-200 bg-white p-3 min-w-0 max-w-full", children: [
    /* @__PURE__ */ jsxs6("div", { className: "flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx6("p", { className: "text-[13px] font-semibold text-gray-800", children: "Reinforcement proposal" }),
      /* @__PURE__ */ jsx6("span", { className: "rounded-sm bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600", children: label })
    ] }),
    /* @__PURE__ */ jsx6("p", { className: "mt-1 text-[11px] text-amber-700", children: "Preliminary geometry and internal cost only. Not a structural design or engineering approval." }),
    /* @__PURE__ */ jsx6("p", { className: "text-[11px] text-gray-500", children: "Proposal edits do not change current prices until explicit acceptance; unknown supports/weights/units remain unknown." }),
    error && /* @__PURE__ */ jsx6("div", { role: "alert", className: "mt-1 rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-700", children: String(error) }),
    label === "Unsupported" && /* @__PURE__ */ jsx6("div", { className: "mt-1 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: "This reinforcement mode is unsupported; proposal edits are unavailable." }),
    !draft ? /* @__PURE__ */ jsxs6("div", { className: "mt-2", children: [
      /* @__PURE__ */ jsx6("p", { className: "text-[12px] text-gray-500", children: "No reinforcement draft yet. Start a controlled proposal to draft geometry and material." }),
      /* @__PURE__ */ jsx6("button", { type: "button", disabled: blocked, onClick: guard(onStart), className: "mt-1 rounded-sm border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] text-amber-800 disabled:text-gray-300", children: "Start Proposal" })
    ] }) : /* @__PURE__ */ jsxs6("fieldset", { disabled: blocked, className: "mt-2 space-y-3 min-w-0", children: [
      /* @__PURE__ */ jsx6(ReinforcementDraftGeometry, { draft, item, supportCatalog, disabled: blocked, onChange: (design) => changeDraft({ design }) }),
      /* @__PURE__ */ jsx6(ReinforcementDraftMaterial, { draft, catalog, disabled: blocked, onChange: (p) => {
        if (!blocked) onDraftChange?.({ ...draft, ...p });
      } }),
      preview && /* @__PURE__ */ jsxs6("div", { className: "break-words rounded-sm border border-gray-200 bg-gray-50 p-2 min-w-0 max-w-full", children: [
        /* @__PURE__ */ jsx6("p", { className: "text-[12px] font-semibold text-gray-700", children: "Preview" }),
        preview.stale && /* @__PURE__ */ jsx6("p", { className: "text-[11px] text-amber-700", children: "Preview is stale - refresh before accepting." }),
        preview.rateSourceLabel && /* @__PURE__ */ jsx6("p", { className: "text-[11px] text-gray-500", children: preview.rateSourceLabel }),
        /* @__PURE__ */ jsxs6("div", { className: "mt-1 space-y-0.5", children: [
          (preview.quantities || []).map((q, i) => /* @__PURE__ */ jsxs6("div", { className: "flex flex-wrap justify-between gap-1 text-[12px] text-gray-600", children: [
            /* @__PURE__ */ jsx6("span", { children: q.label }),
            /* @__PURE__ */ jsxs6("span", { children: [
              q.before,
              " - ",
              q.after
            ] })
          ] }, i)),
          (preview.costs || []).map((c, i) => /* @__PURE__ */ jsxs6("div", { className: "flex flex-wrap justify-between gap-1 text-[12px] text-gray-600", children: [
            /* @__PURE__ */ jsx6("span", { children: c.label }),
            /* @__PURE__ */ jsxs6("span", { children: [
              c.value,
              " ",
              /* @__PURE__ */ jsxs6("span", { className: "text-[10px] text-gray-400", children: [
                "(",
                c.provenance,
                ")"
              ] })
            ] })
          ] }, i))
        ] }),
        (preview.issues || []).map((i, k) => /* @__PURE__ */ jsx6("p", { className: `text-[11px] ${i.severity === "warning" ? "text-amber-700" : "text-red-700"}`, children: i.message }, k))
      ] }),
      ackProvided && (() => {
        const ackPreliminary = ack?.preliminary === true;
        const ackCodes = Array.isArray(ack?.warningCodes) ? ack.warningCodes.filter((c) => typeof c === "string") : [];
        const issues = Array.isArray(preview?.issues) ? preview.issues : [];
        const uniqueCodes = [];
        (Array.isArray(preview?.warningCodes) ? preview.warningCodes : []).forEach((code) => {
          if (typeof code === "string" && code.trim().length > 0 && !uniqueCodes.includes(code)) uniqueCodes.push(code);
        });
        const ackDisabled = blocked || typeof onAcknowledgmentsChange !== "function";
        const emit = (preliminary, codes) => {
          if (!ackDisabled) onAcknowledgmentsChange?.({ preliminary, warningCodes: [...codes] });
        };
        return /* @__PURE__ */ jsxs6("div", { className: "mt-1 space-y-1 text-[11px] text-gray-700", children: [
          /* @__PURE__ */ jsxs6("label", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx6(
              "input",
              {
                type: "checkbox",
                checked: ackPreliminary,
                disabled: ackDisabled,
                onChange: (event) => emit(event.target.checked, ackCodes),
                className: "h-3.5 w-3.5 rounded border-gray-300 flex-shrink-0"
              }
            ),
            /* @__PURE__ */ jsx6("span", { children: "I understand this is preliminary only, not engineering approval." })
          ] }),
          uniqueCodes.map((code) => {
            const issue = issues.find((entry) => entry && entry.severity === "warning" && entry.code === code);
            return /* @__PURE__ */ jsxs6("label", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx6(
                "input",
                {
                  type: "checkbox",
                  checked: ackCodes.includes(code),
                  disabled: ackDisabled,
                  onChange: (event) => emit(ackPreliminary, event.target.checked ? [.../* @__PURE__ */ new Set([...ackCodes, code])] : ackCodes.filter((c) => c !== code)),
                  className: "h-3.5 w-3.5 rounded border-gray-300 flex-shrink-0"
                }
              ),
              /* @__PURE__ */ jsx6("span", { children: `Acknowledge warning: ${issue?.message || code}` })
            ] }, code);
          })
        ] });
      })(),
      /* @__PURE__ */ jsxs6("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx6("button", { type: "button", disabled: blocked, onClick: guard(onPreview), className: "rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-700 disabled:text-gray-300", children: "Refresh Preview" }),
        /* @__PURE__ */ jsx6("button", { type: "button", disabled: !eligible, onClick: () => eligible && onAccept?.(preview.id), className: "rounded-sm border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] text-amber-800 disabled:text-gray-300", children: "Accept Proposal" }),
        /* @__PURE__ */ jsx6("button", { type: "button", disabled: blocked, onClick: guard(onDiscard), className: "rounded-sm border border-red-200 px-2 py-1 text-[12px] text-red-600 disabled:text-gray-300", children: "Discard" })
      ] })
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementDraft.js
var isRecord6 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var scalar = (value) => value === null || ["undefined", "string", "number", "boolean"].includes(typeof value) ? value : NaN;
var numeric2 = (value) => {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = foundationInputNumber(value);
  return parsed !== null ? parsed : scalar(value);
};
function createFoundationReinforcementDraft(item = {}) {
  const accepted = item?.reinforcement_calculation_version === 2;
  const design = accepted && isRecord6(item.reinforcement_design) ? structuredClone(item.reinforcement_design) : {
    version: 2,
    bar_diameter_inches: "",
    cover_inches: { side: "", top: "", bottom: "" },
    supports: {
      mode: "unconfigured",
      reason: "",
      spacing_inches: "",
      catalog_id: "",
      mats: [],
      placements: []
    },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } }
  };
  return {
    schema_version: 1,
    design,
    material: accepted && isRecord6(item.reinforcement_material) ? structuredClone(item.reinforcement_material) : { kind: "" },
    overrides: { quantity_ft: item?.custom_rebar_qty ?? null, cost_per_ft: item?.custom_rebar_cost_per_ft ?? null }
  };
}
function prepareFoundationReinforcementDraft(draft) {
  const issues = [];
  const issue = (field, message) => issues.push({ field, code: "reinforcement_draft_invalid", severity: "error", message });
  if (!isRecord6(draft) || draft.schema_version !== 1) {
    issue("schema_version", "A supported version-1 reinforcement proposal is required.");
    return { prepared: null, issues };
  }
  const raw = draft.design;
  if (!isRecord6(raw)) {
    issue("design", "The proposal needs a reinforcement design object.");
    return { prepared: null, issues };
  }
  const numbers = (record, fields) => Object.fromEntries(fields.map((field) => [field, numeric2(record?.[field])]));
  const reference = (value) => typeof value === "string" ? value : scalar(value);
  const list2 = (value, field, maximum, map) => {
    if (value == null) return value;
    if (!Array.isArray(value) || value.length > maximum) {
      issue(field, `Use an explicit list of at most ${maximum} records.`);
      return null;
    }
    return value.map((record, index) => {
      if (!isRecord6(record)) {
        issue(`${field}.${index}`, "Each proposal row must be an object.");
        return null;
      }
      return map(record);
    });
  };
  const design = {
    version: scalar(raw.version),
    bar_diameter_inches: numeric2(raw.bar_diameter_inches),
    cover_inches: numbers(raw.cover_inches, ["side", "top", "bottom"]),
    supports: {
      mode: scalar(raw.supports?.mode),
      reason: scalar(raw.supports?.reason),
      spacing_inches: numeric2(raw.supports?.spacing_inches),
      catalog_id: reference(raw.supports?.catalog_id),
      mats: list2(raw.supports?.mats, "design.supports.mats", 256, (record) => ({
        mat_id: reference(record.mat_id),
        count: numeric2(record.count)
      })),
      placements: list2(raw.supports?.placements, "design.supports.placements", 4096, (record) => ({
        mat_id: reference(record.mat_id),
        x_inches: numeric2(record.x_inches),
        z_inches: numeric2(record.z_inches)
      }))
    },
    spread: {
      mats: list2(raw.spread?.mats, "design.spread.mats", 256, (record) => ({
        id: reference(record.id),
        ...numbers(record, ["bearing_elevation_inches", "max_spacing_x_inches", "max_spacing_z_inches"])
      })),
      inter_mat_ties: list2(raw.spread?.inter_mat_ties, "design.spread.inter_mat_ties", 4096, (record) => ({
        id: reference(record.id),
        from_mat_id: reference(record.from_mat_id),
        to_mat_id: reference(record.to_mat_id),
        ...numbers(record, ["x_inches", "z_inches", "cut_length_inches"])
      }))
    },
    pillar: {
      hoops: list2(raw.pillar?.hoops, "design.pillar.hoops", 256, (record) => ({
        id: reference(record.id),
        ...numbers(record, ["center_y_inches", "centerline_diameter_inches", "cut_allowance_inches"])
      })),
      longitudinal: numbers(raw.pillar?.longitudinal, ["count", "radius_inches", "bottom_end_inches", "top_end_inches"])
    }
  };
  const source = isRecord6(draft.material) ? draft.material : {};
  const material = {
    kind: scalar(source.kind),
    inventory_id: reference(source.inventory_id),
    name: scalar(source.name),
    reason: scalar(source.reason),
    unit: scalar(source.unit),
    ...numbers(source, ["bar_diameter_inches", "weight_lb_per_ft", "cost_per_ft"])
  };
  const overrides = isRecord6(draft.overrides) ? draft.overrides : {};
  if (draft.overrides != null && !isRecord6(draft.overrides)) issue("overrides", "Proposal overrides must be an object.");
  return {
    prepared: {
      schema_version: 1,
      design,
      material,
      overrides: { quantity_ft: numeric2(overrides.quantity_ft ?? null), cost_per_ft: numeric2(overrides.cost_per_ft ?? null) }
    },
    issues
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementBasisKey.js
var MAX_DEPTH = 32;
var MAX_NODES = 1e6;
var MAX_CHARACTERS = 16e6;
function encodeFoundationReinforcementBasis(value) {
  const chunks = [], ancestors = /* @__PURE__ */ new Set();
  let nodes = 0, characters = 0;
  const append = (text6) => {
    characters += text6.length;
    if (characters > MAX_CHARACTERS) throw new RangeError("Reinforcement preview basis is too large.");
    chunks.push(text6);
  };
  const visit = (current, depth) => {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) throw new RangeError("Reinforcement preview basis exceeds the supported traversal limit.");
    if (current === null) {
      append("null;");
      return;
    }
    switch (typeof current) {
      case "undefined":
        append("undefined;");
        return;
      case "boolean":
        append(current ? "boolean:true;" : "boolean:false;");
        return;
      case "string":
        append(`string:${JSON.stringify(current)};`);
        return;
      case "number":
        if (!Number.isFinite(current)) throw new TypeError("Reinforcement preview basis contains a nonfinite number.");
        append(`number:${Object.is(current, -0) ? "-0" : current};`);
        return;
      case "object":
        break;
      default:
        throw new TypeError("Reinforcement preview basis contains an unsupported value.");
    }
    if (ancestors.has(current)) throw new TypeError("Reinforcement preview basis contains a cycle.");
    if (Object.getOwnPropertySymbols(current).length) throw new TypeError("Reinforcement preview basis cannot contain symbol keys.");
    const array = Array.isArray(current);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) {
      throw new TypeError("Reinforcement preview basis requires plain objects and arrays.");
    }
    const keys = Object.getOwnPropertyNames(current);
    const child = (key) => {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
        throw new TypeError("Reinforcement preview basis cannot contain hidden properties or accessors.");
      }
      visit(descriptor.value, depth + 1);
    };
    ancestors.add(current);
    if (array) {
      if (keys.length !== current.length + 1 || !keys.includes("length")) {
        throw new TypeError("Reinforcement preview basis requires dense arrays without extra properties.");
      }
      append(`array:${current.length}[`);
      for (let index = 0; index < current.length; index++) child(String(index));
      append("];");
    } else {
      keys.sort();
      append(`object:${keys.length}{`);
      for (const key of keys) {
        append(`${JSON.stringify(key)}:`);
        child(key);
      }
      append("};");
    }
    ancestors.delete(current);
  };
  visit(value, 0);
  return chunks.join("");
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementProposal.js
var isRecord7 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var identifier = (value) => typeof value === "string" && Boolean(value.trim()) && value.trim() === value && value.length <= 256;
var finite3 = (value) => typeof value === "number" && Number.isFinite(value);
var amount = (item, key) => finite3(item?.[key]) ? item[key] : null;
var version = (item) => item.reinforcement_calculation_version == null ? 1 : item.reinforcement_calculation_version;
var DERIVED_ITEM_FIELDS = /* @__PURE__ */ new Set([
  "concrete_volume_cy",
  "excavation_volume_cy",
  "concrete_bags",
  "rebar_feet",
  "rebar_weight_lbs",
  "concrete_cost",
  "concrete_rate",
  "rebar_cost",
  "rebar_rate",
  "excavation_cost",
  "excavation_hours",
  "forming_cost",
  "forming_qty",
  "pouring_cost",
  "finishing_cost",
  "finishing_hours",
  "item_total_cost",
  "rebar_material_cost",
  "rebar_labor_cost",
  "rebar_labor_hours",
  "rebar_geometry_feet",
  "rebar_geometry_weight_lbs",
  "rebar_connection_count",
  "reinforcement_cost_snapshot",
  "reinforcement_proposal",
  "support_count",
  "support_purchased_units",
  "support_packs",
  "support_material_cost",
  "support_labor_cost",
  "support_labor_hours",
  "support_cost"
]);
var DERIVED_PROJECT_FIELDS = /* @__PURE__ */ new Set([
  "grand_total",
  "total_concrete_cost",
  "total_rebar_cost",
  "total_excavation_cost",
  "total_labor_cost",
  "total_equipment_cost",
  "total_forming_materials_cost",
  "total_pole_cost",
  "total_pole_painting_cost",
  "total_brick_cost",
  "total_fill_cost",
  "total_wall_cost",
  "total_wall_cap_cost",
  "total_signage_cabinet_cost",
  "total_landscape_cost",
  "concrete_delivery_snapshot",
  "builder_calculation"
]);
var rawProject = (project) => Object.fromEntries(Object.entries(project).filter(([key]) => !DERIVED_PROJECT_FIELDS.has(key)).map(([key, value]) => [key, key === "items" ? value.map((item) => Object.fromEntries(Object.entries(item).filter(([field]) => !DERIVED_ITEM_FIELDS.has(field)))) : value]));
var compare = (before, proposed) => {
  const delta = before === null || proposed === null ? null : proposed - before;
  return { before, proposed, delta: finite3(delta) ? delta : null };
};
function createFoundationReinforcementProposal({
  project,
  savedProject,
  inventory = [],
  settings = {},
  context,
  componentId,
  rawDraft,
  proposalId,
  acknowledgments = {}
} = {}) {
  const issues = [];
  const issue = (code, message) => issues.push({ code, message, severity: "error", scope: "proposal" });
  const unavailable = () => ({
    version: 1,
    id: proposalId,
    componentId,
    basisKey: null,
    canAccept: false,
    engineeringApproved: false,
    issues,
    projection: null,
    comparisons: null
  });
  if (!isRecord7(project) || !Array.isArray(project.items) || project.items.some((item2) => !isRecord7(item2)) || !isRecord7(savedProject) || !Array.isArray(savedProject.items) || savedProject.items.some((item2) => !isRecord7(item2))) {
    issue("reinforcement_proposal_source_required", "Current raw design and acknowledged saved source are required.");
    return unavailable();
  }
  if (!isRecord7(context) || context.loaded !== true || !identifier(context.ownerId) || !identifier(context.sourceId) || context.sourceId !== project.id || savedProject.id !== project.id || !identifier(context.sourceUpdatedAt) || savedProject.updated_date !== context.sourceUpdatedAt || !Number.isSafeInteger(context.generation) || context.generation < 0 || !Number.isSafeInteger(context.editRevision) || context.editRevision < 0 || !(context.estimateId === null || identifier(context.estimateId)) || context.estimateId !== null && !identifier(context.estimateUpdatedAt)) {
    issue("reinforcement_proposal_context_unavailable", "Reload or resolve the current owner, source acknowledgment and linked estimate revision before previewing.");
    return unavailable();
  }
  if (!identifier(componentId) || !identifier(proposalId)) {
    issue("reinforcement_proposal_identity_required", "Stable component and opaque proposal identities are required.");
    return unavailable();
  }
  const matches = project.items.filter((item2) => item2.component_id === componentId);
  if (matches.length !== 1) {
    issue("reinforcement_proposal_component_ambiguous", "The target component is missing or has a duplicate ID.");
    return unavailable();
  }
  const item = matches[0], savedMatches = savedProject.items.filter((record) => record.component_id === componentId);
  const savedItem = savedMatches.length === 1 ? savedMatches[0] : null;
  if (![1, 2].includes(version(item))) {
    issue("reinforcement_proposal_version_unsupported", "An unsupported active calculation version cannot be silently replaced.");
    return unavailable();
  }
  const preparation = prepareFoundationReinforcementDraft(rawDraft);
  issues.push(...preparation.issues);
  if (!preparation.prepared || preparation.issues.some((value) => value.severity === "error")) return unavailable();
  const prepared = preparation.prepared;
  const calculate = (source, design, material, quantityOverride, rateOverride) => calculateFoundationReinforcementItemProjection({
    item: source,
    design,
    material,
    inventory,
    settings,
    excavationMethod: project.excavation_method,
    quantityOverride,
    rateOverride
  });
  const projection = calculate(item, prepared.design, prepared.material, prepared.overrides.quantity_ft, prepared.overrides.cost_per_ft);
  issues.push(...projection.issues);
  let current, currentProvenance;
  if (version(item) === 2) {
    const active = calculate(item, item.reinforcement_design, item.reinforcement_material, item.custom_rebar_qty, item.custom_rebar_cost_per_ft);
    current = active.canApplyToEstimate ? active.itemCost : null;
    currentProvenance = current ? "Current version-2 calculation" : "Acknowledged saved amount";
    current ??= savedItem;
  } else {
    const blocked = !isRecord7(settings) || !Array.isArray(inventory) || inventory.some((row) => !isRecord7(row)) || foundationItemInputIssues(item).length || foundationItemCatalogIssues(item, inventory).length;
    current = blocked ? savedItem : calcItem(item, project, inventory, settings, savedItem);
    currentProvenance = blocked ? "Acknowledged saved amount" : "Current legacy calculation";
  }
  const comparisons = {
    steel: compare(amount(current, "rebar_cost"), amount(projection.itemCost, "rebar_cost")),
    supports: compare(amount(current, "support_cost"), amount(projection.itemCost, "support_cost")),
    item: compare(amount(current, "item_total_cost"), amount(projection.itemCost, "item_total_cost")),
    savedSteel: amount(savedItem, "rebar_cost"),
    savedItem: amount(savedItem, "item_total_cost"),
    currentProvenance,
    savedProvenance: "Acknowledged saved source; not a customer selling price"
  };
  if (comparisons.steel.delta === null || comparisons.item.delta === null) {
    issue("reinforcement_proposal_delta_unavailable", "Both current steel and full item cost deltas must be known before replacement.");
  }
  const warningCodes = [...new Set(projection.issues.filter((value) => value.severity === "warning").map((value) => value.code))].sort();
  const warningAcknowledgments = Array.isArray(acknowledgments?.warningCodes) ? acknowledgments.warningCodes : [];
  if (acknowledgments?.preliminary !== true || warningCodes.some((code) => !warningAcknowledgments.includes(code))) {
    issue("reinforcement_proposal_acknowledgment_required", "Explicitly acknowledge the preliminary-only status and every current warning before acceptance.");
  }
  let basisKey;
  try {
    basisKey = encodeFoundationReinforcementBasis({
      protocolRevision: 1,
      calculationRevision: "foundation-v2-proposal-1",
      context,
      componentId,
      project: rawProject(project),
      savedProject,
      inventory,
      settings,
      rawDraft,
      prepared,
      acknowledgments,
      proposedItemCost: projection.itemCost,
      comparisons
    });
  } catch (error) {
    issue("reinforcement_proposal_basis_unavailable", error.message);
    basisKey = null;
  }
  return {
    version: 1,
    id: proposalId,
    componentId,
    basisKey,
    prepared,
    projection,
    comparisons,
    warningCodes,
    issues,
    engineeringApproved: false,
    canAccept: Boolean(basisKey && projection.canApplyToEstimate && !issues.some((value) => value.severity === "error"))
  };
}
function acceptFoundationReinforcementProposal({ proposal, requestedId, activeProposalId, acceptedAt, ...currentInputs } = {}) {
  const reject = (code, message) => ({ ok: false, code, message, project: null });
  if (proposal?.version !== 1 || proposal.canAccept !== true || !identifier(requestedId) || requestedId !== activeProposalId || requestedId !== proposal.id || !identifier(proposal.componentId) || typeof proposal.basisKey !== "string" || !proposal.basisKey) {
    return reject("reinforcement_proposal_not_acceptable", "Use the exact currently eligible proposal; no design or price was changed.");
  }
  if (typeof acceptedAt !== "string" || !Number.isFinite(Date.parse(acceptedAt))) {
    return reject("reinforcement_acceptance_time_required", "An explicit acceptance timestamp is required.");
  }
  const fresh = createFoundationReinforcementProposal({ ...currentInputs, componentId: proposal.componentId, proposalId: requestedId });
  if (!fresh.basisKey || fresh.basisKey !== proposal.basisKey) {
    return reject("reinforcement_proposal_stale", "Inputs, context, source, settings or catalog changed. Refresh and review the full delta again.");
  }
  if (!fresh.canAccept) return reject("reinforcement_proposal_not_ready", "The fresh calculation is not eligible for replacement.");
  const { prepared, projection } = fresh;
  const nextItems = currentInputs.project.items.map((item) => {
    if (item.component_id !== proposal.componentId) return item;
    const next = {
      ...item,
      ...projection.itemCost,
      reinforcement_calculation_version: 2,
      reinforcement_design: structuredClone(prepared.design),
      reinforcement_material: structuredClone(prepared.material),
      custom_rebar_qty: prepared.overrides.quantity_ft,
      custom_rebar_cost_per_ft: prepared.overrides.cost_per_ft,
      reinforcement_cost_snapshot: {
        version: 1,
        calculation_version: 2,
        engineering_approved: false,
        amounts: structuredClone(projection.reinforcement.steel.amounts),
        material: structuredClone(projection.reinforcement.materialSnapshot),
        basis: structuredClone(projection.reinforcement.basis),
        rate_sources: structuredClone(projection.reinforcement.rateSources),
        supports: structuredClone(projection.reinforcement.supports),
        cut_schedule: structuredClone(projection.reinforcement.cutSchedule)
      },
      reinforcement_acceptance: {
        version: 1,
        proposal_id: requestedId,
        accepted_at: acceptedAt,
        owner_id: currentInputs.context.ownerId,
        source_id: currentInputs.context.sourceId,
        component_id: proposal.componentId,
        source_updated_at: currentInputs.context.sourceUpdatedAt,
        acknowledged_warning_codes: [...fresh.warningCodes],
        engineering_approved: false
      }
    };
    delete next.reinforcement_proposal;
    return next;
  });
  return { ok: true, code: "reinforcement_proposal_accepted_locally", project: { ...currentInputs.project, items: nextItems }, proposal: fresh };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementEditorSession.js
var plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var finite4 = (value) => typeof value === "number" && Number.isFinite(value);
var money2 = (value) => finite4(value) ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Unavailable";
var quantity = (value) => finite4(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not recorded";
var emptyAcknowledgments = () => ({ preliminary: false, warningCodes: [] });
var sameAnchors = (before, after) => before && before.project === after.project && before.savedProject === after.savedProject && before.inventory === after.inventory && before.settings === after.settings && before.contextKey === JSON.stringify(after.context);
var anchors = (input) => ({ ...input, contextKey: JSON.stringify(input.context) });
function section(input, project) {
  const calculation = calcProject(project, input.inventory, input.settings, { savedProject: input.savedProject });
  const base2 = calculation.totals.grand_total;
  const cabinetCost = calculation.totals.total_signage_cabinet_cost;
  const landscapeCost = calculation.totals.total_landscape_cost;
  const total = finite4(base2) && finite4(cabinetCost) && finite4(landscapeCost) ? base2 + cabinetCost + landscapeCost : null;
  return { calculation, total };
}
function proposalView(proposal, input, componentId) {
  const issues = [...proposal.issues], comparisons = proposal.comparisons;
  const proposedCost = proposal.projection?.itemCost;
  let before, after, sectionDelta = null;
  if (proposal.prepared && proposedCost) {
    try {
      const prepared = proposal.prepared;
      const project = { ...input.project, items: input.project.items.map((item) => item.component_id === componentId ? {
        ...item,
        reinforcement_calculation_version: 2,
        reinforcement_design: prepared.design,
        reinforcement_material: prepared.material,
        custom_rebar_qty: prepared.overrides.quantity_ft,
        custom_rebar_cost_per_ft: prepared.overrides.cost_per_ft
      } : item) };
      before = section(input, input.project);
      after = section(input, project);
      if (finite4(before.total) && finite4(after.total)) sectionDelta = after.total - before.total;
      if (after.calculation.catalogIssues.length || after.calculation.inputIssues.length) sectionDelta = null;
    } catch {
      sectionDelta = null;
    }
  }
  if (!finite4(sectionDelta)) issues.push({
    code: "reinforcement_section_delta_unavailable",
    severity: "error",
    message: "The full Concrete section delta is unavailable. Resolve other design or catalog issues and refresh before accepting."
  });
  const currentItem = before?.calculation.items.find((item) => item.component_id === componentId);
  const currentProvenance = comparisons?.currentProvenance || "Current amount unavailable";
  const sectionProvenance = before?.calculation.catalogIssues.length || before?.calculation.inputIssues.length ? "Current section with acknowledged fallback amounts where unavailable" : "Current full Concrete section calculation";
  const row = (label, value, provenance) => ({ label, value: money2(value), provenance });
  return {
    id: proposal.id,
    canAccept: proposal.canAccept && finite4(sectionDelta),
    stale: false,
    warningCodes: [...proposal.warningCodes || []],
    issues,
    quantities: [
      { label: "Physical steel (ft)", before: quantity(currentItem?.rebar_geometry_feet), after: quantity(proposedCost?.rebar_geometry_feet) },
      { label: "Priced steel (ft)", before: quantity(currentItem?.rebar_feet), after: quantity(proposedCost?.rebar_feet) },
      { label: "Reinforcement labor (hr)", before: quantity(currentItem?.rebar_labor_hours), after: quantity(proposedCost?.rebar_labor_hours) },
      { label: "Supports (required)", before: quantity(currentItem?.support_count), after: quantity(proposedCost?.support_count) },
      { label: "Supports (purchased)", before: quantity(currentItem?.support_purchased_units), after: quantity(proposedCost?.support_purchased_units) }
    ],
    costs: [
      row("Current steel", comparisons?.steel.before, currentProvenance),
      row("Proposed steel", comparisons?.steel.proposed, "Fresh preliminary internal steel cost"),
      row("Steel delta", comparisons?.steel.delta, "Proposed minus current"),
      row("Current supports", comparisons?.supports?.before, currentProvenance),
      row("Proposed supports", comparisons?.supports?.proposed, "Fresh modeled support cost"),
      row("Support delta", comparisons?.supports?.delta, "Proposed minus current"),
      row("Current foundation", comparisons?.item.before, currentProvenance),
      row("Proposed foundation", comparisons?.item.proposed, "Fresh full foundation cost"),
      row("Foundation delta", comparisons?.item.delta, "Proposed minus current"),
      row("Current section", before?.total, sectionProvenance),
      row("Proposed section", after?.total, "Full Concrete section including signage and landscape"),
      row("Section delta", sectionDelta, "Proposed minus current; not a customer selling price"),
      row("Saved steel", comparisons?.savedSteel, "Acknowledged saved source"),
      row("Saved foundation", comparisons?.savedItem, "Acknowledged saved source")
    ]
  };
}
function createFoundationReinforcementEditorSession({ getCurrent, commit, createId, now, onChange = () => {
} }) {
  const entries = /* @__PURE__ */ new Map();
  let scope;
  const current = () => {
    const input = getCurrent();
    const nextScope = JSON.stringify([
      input.context?.ownerId,
      input.context?.sourceId,
      input.context?.estimateId,
      input.context?.generation
    ]);
    if (scope !== nextScope) {
      entries.clear();
      scope = nextScope;
    }
    return input;
  };
  const entryFor = (id) => {
    if (!entries.has(id)) entries.set(id, { acknowledgments: emptyAcknowledgments(), proposal: null, view: null, activeId: null, error: "" });
    return entries.get(id);
  };
  const findItem = (input, id) => {
    const matches = input.project?.items?.filter((item) => item.component_id === id) || [];
    return matches.length === 1 ? matches[0] : null;
  };
  const allowed = (input, id) => input.context?.loaded === true && !input.blocked && Boolean(findItem(input, id));
  const report = (entry, message) => {
    entry.error = message;
    onChange();
    return false;
  };
  const reset = (entry) => Object.assign(entry, { acknowledgments: emptyAcknowledgments(), proposal: null, view: null, activeId: null, error: "" });
  const edit = (id, update) => {
    const input = current(), entry = entryFor(id);
    if (!allowed(input, id)) return report(entry, "The editor context is unavailable or busy; no proposal was changed.");
    const item = findItem(input, id);
    const nextItem = update(item);
    const ok = commit((previous) => ({ items: previous.items.map((record) => record.component_id === id ? nextItem : record) }));
    if (ok !== true) return report(entry, "The proposal edit could not be committed in the current editor.");
    reset(entry);
    onChange();
    return true;
  };
  return {
    read(id) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      return {
        draft: item?.reinforcement_proposal ?? null,
        preview: entry.view ? { ...entry.view, stale: entry.activeId !== entry.proposal?.id || !sameAnchors(entry.anchors, input) } : null,
        acknowledgments: structuredClone(entry.acknowledgments),
        error: entry.error,
        disabled: !allowed(input, id)
      };
    },
    start(id) {
      return edit(id, (item) => ({ ...item, reinforcement_proposal: createFoundationReinforcementDraft(item) }));
    },
    changeDraft(id, draft) {
      if (!plain(draft)) return false;
      return edit(id, (item) => ({ ...item, reinforcement_proposal: structuredClone(draft) }));
    },
    discard(id) {
      return edit(id, (item) => {
        const next = { ...item };
        delete next.reinforcement_proposal;
        return next;
      });
    },
    acknowledge(id, value) {
      const input = current(), entry = entryFor(id);
      if (!allowed(input, id) || !plain(value) || typeof value.preliminary !== "boolean" || !Array.isArray(value.warningCodes) || value.warningCodes.some((code) => typeof code !== "string" || !code.trim())) return false;
      entry.acknowledgments = { preliminary: value.preliminary, warningCodes: [...new Set(value.warningCodes)] };
      entry.activeId = null;
      entry.error = "";
      onChange();
      return true;
    },
    preview(id) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      if (!allowed(input, id) || !item?.reinforcement_proposal) return report(entry, "Start a proposal in the current editor before previewing.");
      try {
        const proposal = createFoundationReinforcementProposal({
          ...input,
          rawDraft: item.reinforcement_proposal,
          componentId: id,
          proposalId: createId(),
          acknowledgments: entry.acknowledgments
        });
        entry.proposal = proposal;
        entry.view = proposalView(proposal, input, id);
        entry.activeId = proposal.id;
        entry.anchors = anchors(input);
        entry.error = "";
        onChange();
        return true;
      } catch (error) {
        entry.activeId = null;
        return report(entry, error.message || "The proposal could not be calculated.");
      }
    },
    accept(id, requestedId) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      if (!allowed(input, id) || !entry.view?.canAccept || !entry.activeId || requestedId !== entry.activeId || !sameAnchors(entry.anchors, input)) return report(entry, "Refresh and review the current proposal before accepting.");
      const activeProposalId = entry.activeId;
      entry.activeId = null;
      const result = acceptFoundationReinforcementProposal({
        ...input,
        rawDraft: item.reinforcement_proposal,
        acknowledgments: entry.acknowledgments,
        proposal: entry.proposal,
        requestedId,
        activeProposalId,
        acceptedAt: now()
      });
      if (!result.ok) return report(entry, result.message);
      if (commit(() => result.project) !== true) return report(entry, "Acceptance could not be committed; refresh the proposal.");
      reset(entry);
      onChange();
      return true;
    }
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/builderEntityPersistence.js
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
      if (!sameValue(current[fieldName], value)) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    if (expectedVersion && String(current.updated_date || "") !== expectedVersion) {
      throw new Error(`${label} changed in another session. Reload before saving.`);
    }
    for (const fieldName of fieldNames) {
      if (!sameValue(current[fieldName], expected[fieldName]) && !sameValue(current[fieldName], desired[fieldName])) {
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
      if (afterError && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) return afterError;
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional-update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(recordId).catch(() => null);
      if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
      if (!fieldNames.every((fieldName) => sameValue(saved[fieldName], desired[fieldName]))) {
        throw new Error(`${label} was updated but its stored values do not match this save. Reload and review the record before retrying.`);
      }
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
var deleteEntityIfUnchanged = deleteBuilderEntityIfUnchanged;

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/idempotentEntityCreate.js
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var VERIFY_RETRY_DELAY_MS = 700;
var canonicalRecord = (rows = []) => [...rows].sort((a, b) => {
  const aStamp = String(a?.created_date || "");
  const bStamp = String(b?.created_date || "");
  if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
  return String(a?.id || "").localeCompare(String(b?.id || ""));
})[0] || null;
function normalize2(value) {
  if (Array.isArray(value)) return value.map(normalize2);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize2(value[key]);
    return out;
  }, {});
}
function sameValue2(a, b) {
  const emptyA = a === void 0 || a === null || a === "";
  const emptyB = b === void 0 || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return JSON.stringify(normalize2(a)) === JSON.stringify(normalize2(b));
}
function matchesPayload(row, payload) {
  return !!row && Object.entries(payload || {}).every(([field, value]) => sameValue2(row[field], value));
}
function newCreationRequestKey(prefix = "create") {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${String(prefix || "create").trim()}:${token}`;
}
async function ensureIdempotentEntityCreate({
  entity,
  keyField = "idempotency_key",
  key,
  data,
  label = "Record"
} = {}) {
  const cleanField = String(keyField || "").trim();
  const cleanKey = String(key || "").trim();
  if (!entity?.filter || !entity?.create || !cleanField || !cleanKey) {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const payload = { ...data, [cleanField]: cleanKey };
  const load = async () => {
    const rows = await entity.filter({ [cleanField]: cleanKey });
    if (!Array.isArray(rows)) throw new Error(`${label} retry state could not be verified.`);
    return rows.filter((row) => String(row?.[cleanField] || "").trim() === cleanKey);
  };
  const existing = await load();
  if (existing.length > 1) {
    throw new Error(`${label} already has multiple records with this retry key. No row was deleted; reload and review the duplicates before continuing.`);
  }
  if (existing.length === 1) {
    if (!matchesPayload(existing[0], payload)) {
      throw new Error(`${label} retry key already belongs to a record with different data. No row was changed.`);
    }
    return existing[0];
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }
  let afterCreate = null;
  let verifyError = null;
  try {
    afterCreate = await load();
  } catch (error) {
    verifyError = error;
  }
  if ((!Array.isArray(afterCreate) || afterCreate.length === 0) && (createError || !created?.id)) {
    await sleep(VERIFY_RETRY_DELAY_MS);
    try {
      const retryRows = await load();
      if (Array.isArray(retryRows)) afterCreate = retryRows;
    } catch (error) {
      verifyError = verifyError || error;
    }
  }
  if (!Array.isArray(afterCreate)) {
    if (created?.id && matchesPayload(created, payload)) return created;
    throw new Error(`${label} create outcome could not be verified. Do not retry blindly; reload first. ${verifyError?.message || "Recovery lookup failed."}`);
  }
  if (afterCreate.length === 1) {
    if (created?.id && String(afterCreate[0].id) !== String(created.id)) {
      throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review records with this retry key.`);
    }
    if (!matchesPayload(afterCreate[0], payload)) {
      throw new Error(`${label} retry key exists but its live data does not match this create. No row was changed or deleted.`);
    }
    return afterCreate[0];
  }
  if (afterCreate.length > 1) {
    const keep = canonicalRecord(afterCreate);
    const ours = created?.id ? afterCreate.find((row) => row.id === created.id) : null;
    if (ours && ours.id !== keep?.id && matchesPayload(ours, payload)) {
      await deleteEntityIfUnchanged({
        entity,
        record: ours,
        guardFields: { [cleanField]: cleanKey },
        label: `${label} losing retry duplicate`
      });
      const finalRows = await load();
      if (finalRows.length === 1 && finalRows[0]?.id === keep?.id && matchesPayload(finalRows[0], payload)) {
        return finalRows[0];
      }
    }
    throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review records with this retry key.`);
  }
  if (created?.id && matchesPayload(created, payload)) return created;
  if (createError) {
    throw new Error(`${label} create failed and no matching record was visible on recovery read. Do not retry blindly; reload first. ${createError?.message || ""}`.trim());
  }
  throw new Error(`${label} create response could not be verified. Do not retry blindly; reload first.`);
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/useFoundationReinforcementEditor.js
function useFoundationReinforcementEditor({ getCurrent, commit }) {
  const [, setRevision] = useState(0);
  const callbacksRef = useRef({ getCurrent, commit });
  callbacksRef.current = { getCurrent, commit };
  const sessionRef = useRef(null);
  if (sessionRef.current === null) {
    sessionRef.current = createFoundationReinforcementEditorSession({
      getCurrent: () => callbacksRef.current.getCurrent(),
      commit: (updater) => callbacksRef.current.commit(updater),
      createId: () => newCreationRequestKey("foundation_reinforcement_proposal"),
      now: () => (/* @__PURE__ */ new Date()).toISOString(),
      onChange: () => setRevision((r) => r + 1)
    });
  }
  return sessionRef.current;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/pages/FoundationEstimator.jsx
import FoundationRatesPanel from "@/components/estimator/foundation/FoundationRatesPanel";
import FoundationEquipmentTab from "@/components/estimator/foundation/FoundationEquipmentTab";
import FoundationTotals from "@/components/estimator/foundation/FoundationTotals";
import ConcreteDeliveryPanel from "@/components/estimator/foundation/ConcreteDeliveryPanel";

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementBOMRows.js
var known2 = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var quantity2 = (value) => known2(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not saved";
var text4 = (value) => typeof value === "string" ? value.trim() : "";
function foundationReinforcementBOMRows(item, { saved = false } = {}) {
  if (item?.reinforcement_calculation_version !== 2) return null;
  const total = known2(item.rebar_cost) ? item.rebar_cost : null;
  if (!item.include_rebar && !(saved && total > 0)) return [];
  const label = text4(item.description) || `Foundation ${text4(item.component_id) || "?"}`;
  const name = text4(item.reinforcement_cost_snapshot?.material?.name) || "Reinforcing steel";
  const physical = quantity2(item.rebar_geometry_feet);
  const priced = quantity2(item.rebar_feet);
  const material = known2(item.rebar_material_cost) ? item.rebar_material_cost : null;
  const labor = known2(item.rebar_labor_cost) ? item.rebar_labor_cost : null;
  const quantities = `${physical} LF physical / ${priced} LF priced`;
  const provenance = saved ? "Acknowledged saved quantities and amounts; current pricing unavailable. " : "";
  const review = "Not a purchasing plan. Engineering and purchasing review required.";
  const weights = `Physical weight: ${quantity2(item.rebar_geometry_weight_lbs)} lb. Priced weight: ${quantity2(item.rebar_weight_lbs)} lb.`;
  const splitMissing = material === null || labor === null;
  const splitMismatch = !splitMissing && total !== null && material + labor !== total;
  if (total !== null && (splitMissing || splitMismatch)) return [{
    material: `${label} - reinforcement (combined saved amount)`,
    quantity: quantities,
    cost: total,
    saved: true,
    reinforcement: true,
    basisUnavailable: true,
    note: `${provenance}${splitMissing ? "Material/labor split: Not saved." : "Stored material/labor split does not reconcile."} Combined steel amount retained without an invented breakdown. ${weights} ${review}`
  }];
  const basisUnavailable = [
    item.rebar_geometry_feet,
    item.rebar_feet,
    item.rebar_geometry_weight_lbs,
    item.rebar_weight_lbs,
    item.rebar_labor_hours,
    material,
    labor
  ].some((value) => !known2(value));
  const rows = [{
    material: `${label} - ${name} (material)`,
    quantity: quantities,
    cost: material,
    saved,
    reinforcement: true,
    basisUnavailable,
    note: `${provenance}${weights} Internal material cost only. ${review}`
  }, {
    material: `${label} - reinforcement labor`,
    quantity: `${quantity2(item.rebar_labor_hours)} hr`,
    cost: labor,
    saved,
    reinforcement: true,
    basisUnavailable,
    note: `${provenance}Internal reinforcement labor cost, separate from steel material. ${review}`
  }];
  rows.push(...supportBOMRows(item, label, provenance, review, saved));
  rows.push(...stockBOMRows(item, label, provenance, review, saved));
  return rows;
}
function supportBOMRows(item, label, provenance, review, saved) {
  const snapshot = item.reinforcement_cost_snapshot?.supports;
  const required = known2(item.support_count) ? item.support_count : null;
  if (!snapshot && required === null) {
    return saved ? [{
      material: `${label} - supports (not recorded)`,
      quantity: "Not saved",
      cost: "Not saved",
      saved: true,
      reinforcement: true,
      basisUnavailable: true,
      note: `${provenance}This acknowledged item predates support modeling; support quantity and cost were not recorded. ${review}`
    }] : [];
  }
  if (required === 0) return [];
  const selections = Array.isArray(snapshot?.selections) ? snapshot.selections : [];
  const supportMaterial = known2(item.support_material_cost) ? item.support_material_cost : null;
  const supportLabor = known2(item.support_labor_cost) ? item.support_labor_cost : null;
  const supportLaborHours = known2(item.support_labor_hours) ? item.support_labor_hours : null;
  const supportTotal = known2(item.support_cost) ? item.support_cost : null;
  const unresolved = [required, supportMaterial, supportLabor, supportLaborHours, supportTotal].some((v) => v === null) || selections.some((s) => !known2(s?.material_cost) || !known2(s?.units_purchased));
  if (unresolved || !selections.length) {
    return [{
      material: `${label} - supports (${required === null ? "not recorded" : `${required} required`})`,
      quantity: required === null ? "Not saved" : `${required.toLocaleString("en-US")} required`,
      cost: supportTotal === null ? "Not saved" : supportTotal,
      saved: true,
      reinforcement: true,
      basisUnavailable: true,
      note: `${provenance}Modeled support economics are unresolved; the acknowledged amount is shown without an invented catalog breakdown. ${review}`
    }];
  }
  const rows = selections.map((s, index) => ({
    material: `${label} - ${text4(s.name) || "Rebar support"} (x${s.units_purchased} purchased${Number.isSafeInteger(s.pack_size) && s.pack_size > 1 ? `, packs of ${s.pack_size}` : ""})`,
    quantity: `${quantity2(s.units_purchased)} ea (${quantity2(s.units_required)} required)`,
    cost: s.material_cost,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    support: true,
    note: `${provenance}Bottom-resting support pick ${index + 1}${s.mat_id ? ` for mat ${s.mat_id}` : ""}; ${quantity2(s.support_height_inches)} in stand height. Internal material cost only. ${review}`
  }));
  rows.push({
    material: `${label} - support install labor`,
    quantity: `${quantity2(supportLaborHours)} hr`,
    cost: supportLabor,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    support: true,
    note: `${provenance}Internal support installation labor, separate from support material. ${review}`
  });
  return rows;
}
function stockBOMRows(item, label, provenance, review, saved) {
  if (item.include_rebar === false) return [];
  const schedule = item.reinforcement_cost_snapshot?.cut_schedule;
  if (!schedule) {
    return saved ? [{
      material: `${label} - rebar cut/stock schedule (not recorded)`,
      quantity: "Not recorded",
      cost: 0,
      saved: true,
      reinforcement: true,
      basisUnavailable: true,
      stock: true,
      note: `${provenance}This acknowledged item predates cut/stock scheduling; the plan was not recorded. Steel cost is unaffected. ${review}`
    }] : [];
  }
  if (schedule.status !== "resolved" || !schedule.stock) {
    const reason = schedule.status === "unresolved" ? "stock lengths are unconfigured or a cut exceeds the configured stock" : `status ${text4(schedule.status) || "unknown"}`;
    return [{
      material: `${label} - rebar stock (plan unresolved)`,
      quantity: `${quantity2(schedule.piece_count_total)} pieces scheduled`,
      cost: 0,
      saved,
      reinforcement: true,
      basisUnavailable: true,
      stock: true,
      note: `${provenance}Rebar stock plan is unresolved (${reason}); ${quantity2(schedule.cut_lines?.length)} authored cut lines stand. Steel cost is unaffected \u2014 verify stock lengths on the catalog row. ${review}`
    }];
  }
  const barSize = text4(schedule.bar_size);
  const barLabel = barSize ? ` ${barSize}` : "";
  const totals = schedule.stock.totals || {};
  const rows = (schedule.stock.groups || []).flatMap((group) => (group.by_length || []).map((entry) => ({
    material: `${label} - rebar stock${barLabel} ${entry.stock_length_inches} in (x${entry.stock_count})`,
    quantity: `${quantity2(entry.stock_count)} \xD7 ${quantity2(entry.stock_length_inches)} in stock`,
    cost: 0,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    stock: true,
    note: `${provenance}Cut plan: ${quantity2(entry.pieces_per_stock?.reduce((s, n) => s + n, 0))} pieces on ${entry.stock_count} \xD7 ${entry.stock_length_inches}-in stock, ${quantity2(entry.offcut_inches)} in offcut (${quantity2(entry.waste_pct)}%). ${review}`
  })));
  rows.push({
    material: `${label} - rebar cut/waste summary${barLabel}`,
    quantity: `${quantity2(totals.total_linear_inches_required / 12)} LF required / ${quantity2(totals.stock_linear_inches_purchased / 12)} LF stock`,
    cost: 0,
    saved,
    reinforcement: true,
    basisUnavailable: false,
    stock: true,
    note: `${provenance}${quantity2(schedule.piece_count_total)} pieces on ${quantity2(totals.stock_count_total)} stock pieces; ${quantity2(totals.waste_inches)} in offcut (${quantity2(totals.waste_pct)}% of purchased). First-fit-decreasing packing \u2014 not an optimized purchasing plan. ${review}`
  });
  return rows;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationBOM.jsx
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var num3 = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
var qty = (n, unit) => `${num3(n).toLocaleString(void 0, { maximumFractionDigits: 2 })} ${unit}`;
var EMPTY_ITEMS = [];
var EMPTY_POLES = [];
var EMPTY_WALLS = [];
var EMPTY_TOTALS = {};
var EMPTY_INVENTORY = [];
function FoundationBOM({
  items = EMPTY_ITEMS,
  poles = EMPTY_POLES,
  walls = EMPTY_WALLS,
  delivery,
  totals = EMPTY_TOTALS,
  inventory = EMPTY_INVENTORY,
  itemPricing = EMPTY_ITEMS,
  polePricing: polePricing2 = EMPTY_ITEMS,
  wallPricing: wallPricing2 = EMPTY_ITEMS,
  cabinets = EMPTY_ITEMS,
  landscape,
  landscapePricing,
  pricingUnavailable = false
}) {
  const cabinetRows = useMemo(() => calcSignageCabinetPricing(cabinets), [cabinets]);
  const rows = useMemo(() => {
    const out = [];
    const add = (material, displayQty, cost, rawQty = num3(displayQty)) => {
      if (num3(rawQty) <= 0 && !hasFoundationCostSnapshot(cost)) return;
      out.push({ material, quantity: displayQty, cost });
    };
    const nameOf = (id) => inventory.find((i) => i.id === id)?.material_name || "Material";
    const resolved = items.filter((_, i) => itemPricing[i]?.available !== false);
    const blocked = items.filter((_, i) => itemPricing[i]?.available === false);
    if (delivery?.pricingUnavailable) {
      out.push({
        material: "Concrete delivery/order (saved)",
        quantity: Number.isFinite(delivery.roundedYards) ? qty(delivery.roundedYards, "CY") : "Not saved",
        cost: hasFoundationCostSnapshot(delivery.concreteTotal) ? delivery.concreteTotal : "Not saved",
        saved: true
      });
    } else if (num3(delivery?.roundedYards) > 0) {
      add("Ready-mix concrete (delivered)", qty(delivery.roundedYards, "CY"), delivery.concreteTotal, delivery.roundedYards);
    }
    const bags = resolved.reduce((s, i) => s + num3(i.concrete_bags), 0);
    const baggedCost = resolved.reduce((s, i) => s + num3(i.concrete_cost), 0);
    if (bags > 0 || baggedCost > 0) add("Bagged concrete", qty(bags, "bags"), baggedCost, bags);
    const legacyRebar = resolved.filter((item) => item.reinforcement_calculation_version !== 2);
    const rebarFt = legacyRebar.reduce((s, i) => s + num3(i.rebar_feet), 0);
    const rebarLbs = legacyRebar.reduce((s, i) => s + num3(i.rebar_weight_lbs), 0);
    const rebarCost = legacyRebar.reduce((s, i) => s + num3(i.rebar_cost), 0);
    if (rebarFt > 0) {
      add(`Rebar (${qty(rebarLbs, "lbs")})`, qty(rebarFt, "LF"), rebarCost, rebarFt);
    }
    resolved.filter((item) => item.reinforcement_calculation_version === 2).forEach((item) => {
      out.push(...foundationReinforcementBOMRows(item));
    });
    const formingQty = resolved.reduce((s, i) => s + num3(i.forming_qty), 0);
    const formingCost = resolved.reduce((s, i) => s + num3(i.forming_cost), 0);
    if (formingQty > 0) add("Forming material", qty(formingQty, "units"), formingCost, formingQty);
    blocked.forEach((i) => {
      const label = `Foundation ${i.component_id ?? "?"} (saved)`;
      {
        out.push({
          material: `${label} \u2014 concrete`,
          quantity: Number.isFinite(i.concrete_bags) ? qty(i.concrete_bags, "bags") : "Not saved",
          cost: hasFoundationCostSnapshot(i.concrete_cost) ? i.concrete_cost : "Not saved",
          saved: true
        });
      }
      if (i.reinforcement_calculation_version === 2) {
        out.push(...foundationReinforcementBOMRows(i, { saved: true }));
      } else if (i.include_rebar) {
        out.push({
          material: `${label} \u2014 rebar`,
          quantity: Number.isFinite(i.rebar_feet) ? qty(i.rebar_feet, "LF") : "Not saved",
          cost: hasFoundationCostSnapshot(i.rebar_cost) ? i.rebar_cost : "Not saved",
          saved: true
        });
      }
      if (i.include_forming) {
        out.push({
          material: `${label} \u2014 forming`,
          quantity: Number.isFinite(i.forming_qty) ? qty(i.forming_qty, "units") : "Not saved",
          cost: hasFoundationCostSnapshot(i.forming_cost) ? i.forming_cost : "Not saved",
          saved: true
        });
      }
    });
    const poleGroups = {};
    poles.forEach((p, index) => {
      if (polePricing2[index]?.available === false) return;
      if (!p.pole_id) return;
      poleGroups[p.pole_id] = poleGroups[p.pole_id] || { ft: 0, cost: 0 };
      const billedInches = hasFoundationCostSnapshot(p.required_length_inches) ? p.required_length_inches : num3(p.height_inches) + num3(p.embedment_inches ?? p.y_offset_inches);
      poleGroups[p.pole_id].ft += billedInches / 12;
      poleGroups[p.pole_id].cost += num3(p.pole_cost);
    });
    Object.entries(poleGroups).forEach(([id, g]) => add(nameOf(id), qty(g.ft, "LF"), g.cost, g.ft));
    const polePainting = poles.reduce((s, p, index) => polePricing2[index]?.available === false ? s : s + num3(p.pole_painting_cost), 0);
    if (polePainting > 0) {
      add("Pole painting", "\u2014", polePainting);
    }
    const savedPoleFt = (p) => {
      const req = Number(p.required_length_inches);
      if (Number.isFinite(req) && req > 0) return req / 12;
      const h = Number(p.height_inches), d = Number(p.embedment_inches ?? p.y_offset_inches);
      return Number.isFinite(h) && h > 0 && Number.isFinite(d) && d >= 0 ? (h + d) / 12 : null;
    };
    poles.forEach((p, index) => {
      if (polePricing2[index]?.available !== false) return;
      const label = `Pole ${index + 1} (saved)`;
      const ft = savedPoleFt(p);
      out.push({
        material: `${label} \u2014 pole`,
        quantity: Number.isFinite(ft) ? qty(ft, "LF") : "Not saved",
        cost: hasFoundationCostSnapshot(p.pole_cost) ? p.pole_cost : "Not saved",
        saved: true
      });
      if (p.include_pole_painting || hasFoundationCostSnapshot(p.pole_painting_cost)) {
        out.push({
          material: `${label} \u2014 painting`,
          quantity: "\u2014",
          cost: hasFoundationCostSnapshot(p.pole_painting_cost) ? p.pole_painting_cost : "Not saved",
          saved: true
        });
      }
    });
    out.push(...foundationWallBomRows(walls, inventory, wallPricing2));
    (totals.wall_caps_by_material || []).forEach((g) => add(g.name || "Wall cap", qty(g.qty, "pcs"), g.cost, g.qty));
    cabinetRows.forEach((row, index) => {
      const cabinet = cabinets[index] || {};
      const label = cabinet.description || `Signage cabinet ${index + 1}`;
      if (row.available === false) {
        const recordedQty = Number(cabinet.quantity);
        out.push({
          material: `${label} (saved)`,
          quantity: Number.isFinite(recordedQty) ? qty(recordedQty, "pcs") : "Not saved",
          cost: "Not saved",
          saved: true
        });
        return;
      }
      const quantity3 = cabinet.quantity === void 0 || cabinet.quantity === null || cabinet.quantity === "" ? 1 : Number(cabinet.quantity);
      add(label, qty(quantity3, "pcs"), row.cost, quantity3);
    });
    if (landscapePricing && landscapePricing.available === false) {
      out.push({
        material: "Site landscaping (saved)",
        quantity: "\u2014",
        cost: hasFoundationCostSnapshot(totals.total_landscape_cost) ? totals.total_landscape_cost : "Not saved",
        saved: true
      });
    } else {
      landscapeSummary(landscape).lines.forEach((line) => {
        if (line.cost === null || line.sqft === null) {
          out.push({
            material: `Site \u2014 ${line.label} (saved)`,
            quantity: Number.isFinite(line.sqft) ? qty(line.sqft, "sq ft") : qty(line.cells, "cells"),
            cost: "Not saved",
            saved: true
          });
          return;
        }
        add(`Site \u2014 ${line.label}`, qty(line.sqft, "sq ft"), line.cost, line.sqft);
      });
    }
    return out;
  }, [items, poles, walls, delivery, totals, inventory, itemPricing, polePricing2, wallPricing2, cabinets, cabinetRows, landscape, landscapePricing]);
  const materialTotal = rows.every((r) => hasFoundationCostSnapshot(r.cost)) ? rows.reduce((sum, row) => sum + row.cost, 0) : null;
  const listedPricingUnavailable = pricingUnavailable || rows.some((row) => row.basisUnavailable);
  return /* @__PURE__ */ jsxs7("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [
    /* @__PURE__ */ jsx7("h3", { className: "font-semibold text-gray-900 mb-3", children: "Bill of Materials" }),
    listedPricingUnavailable && /* @__PURE__ */ jsxs7("div", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1", children: [
      /* @__PURE__ */ jsx7("p", { className: "text-[11px] font-semibold text-amber-800", children: "Pricing unavailable \u2014 saved quantities may be outdated." }),
      itemPricing.filter((p) => p && p.available === false).concat(polePricing2.filter((p) => p && p.available === false)).concat(cabinetRows.filter((p) => p && p.available === false)).concat(landscapePricing && landscapePricing.available === false ? [landscapePricing] : []).flatMap(
        (p, k) => (p.issues || []).map((i, j) => /* @__PURE__ */ jsx7("p", { className: "text-[10px] text-amber-700", children: i.message }, `${k}-${j}`))
      )
    ] }),
    rows.length === 0 ? /* @__PURE__ */ jsx7("p", { className: "text-sm text-gray-500", children: "No materials yet \u2014 add a foundation to build the list." }) : /* @__PURE__ */ jsxs7(Fragment3, { children: [
      /* @__PURE__ */ jsxs7("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx7("thead", { children: /* @__PURE__ */ jsxs7("tr", { className: "text-left text-xs text-gray-500 border-b border-gray-200", children: [
          /* @__PURE__ */ jsx7("th", { className: "py-1.5", children: "Material" }),
          /* @__PURE__ */ jsx7("th", { className: "py-1.5", children: "Quantity" }),
          /* @__PURE__ */ jsx7("th", { className: "py-1.5 text-right", children: "Cost" })
        ] }) }),
        /* @__PURE__ */ jsx7("tbody", { children: rows.map((r, i) => /* @__PURE__ */ jsxs7("tr", { className: "border-b border-gray-100 last:border-0", children: [
          /* @__PURE__ */ jsxs7("td", { className: `py-1.5 pr-3 text-gray-800${r.note ? " min-w-0 break-words" : ""}`, children: [
            r.material,
            r.note && /* @__PURE__ */ jsx7("p", { className: "mt-1 text-[11px] leading-snug text-gray-500 break-words", children: r.note })
          ] }),
          /* @__PURE__ */ jsx7("td", { className: "py-1.5 pr-3 whitespace-nowrap text-gray-600", children: r.quantity }),
          /* @__PURE__ */ jsx7("td", { className: "py-1.5 pl-3 whitespace-nowrap text-right text-gray-900", children: hasFoundationCostSnapshot(r.cost) ? money(r.cost) : "Not saved" })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "flex justify-between pt-3 mt-1 border-t border-gray-200 font-bold text-gray-900", children: [
        /* @__PURE__ */ jsx7("span", { children: "Listed cost subtotal" }),
        /* @__PURE__ */ jsx7("span", { children: listedPricingUnavailable ? /* @__PURE__ */ jsx7("span", { className: "text-amber-700", children: "Pricing unavailable" }) : hasFoundationCostSnapshot(materialTotal) ? money(materialTotal) : "Not saved" })
      ] })
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/pages/FoundationEstimator.jsx
import FoundationWallsPanel from "@/components/estimator/foundation/FoundationWallsPanel";
import FoundationWallCapsPanel from "@/components/estimator/foundation/FoundationWallCapsPanel";
import FoundationPolesPanel from "@/components/estimator/foundation/FoundationPolesPanel";

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationToolbar.jsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var Btn = ({ icon: Icon, label, onClick, disabled }) => /* @__PURE__ */ jsxs8(
  "button",
  {
    type: "button",
    onClick,
    disabled,
    className: "h-[28px] px-2.5 flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40",
    children: [
      /* @__PURE__ */ jsx8(Icon, { className: "w-3.5 h-3.5 text-gray-500" }),
      label
    ]
  }
);
function FoundationToolbar({
  title,
  subtitle,
  backTo,
  total,
  saving,
  dirty,
  lastSavedAt,
  autoSave,
  onToggleAutoSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onSaveAndExit,
  onSaveAsCopy,
  onSaveAsTemplate,
  onTemplates,
  onSwapToBrickStone,
  onShareLink,
  onHelp,
  onBack,
  pricingUnavailable = false
}) {
  return /* @__PURE__ */ jsxs8("div", { className: "bg-white border border-gray-200 rounded-sm p-3 mb-3", children: [
    /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-3 mb-2", children: [
      onBack ? /* @__PURE__ */ jsxs8(
        "button",
        {
          type: "button",
          onClick: onBack,
          className: "h-[28px] px-2.5 flex items-center gap-1 rounded-sm border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-gray-50",
          children: [
            /* @__PURE__ */ jsx8(ArrowLeft, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
            " Back"
          ]
        }
      ) : /* @__PURE__ */ jsxs8(
        Link,
        {
          to: backTo,
          className: "h-[28px] px-2.5 flex items-center gap-1 rounded-sm border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-gray-50",
          children: [
            /* @__PURE__ */ jsx8(ArrowLeft, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
            " Back"
          ]
        }
      ),
      /* @__PURE__ */ jsxs8("div", { children: [
        /* @__PURE__ */ jsx8("h1", { className: "text-[17px] font-bold text-gray-900 leading-tight", children: title }),
        /* @__PURE__ */ jsx8("p", { className: "text-[11px] text-gray-500", children: subtitle })
      ] })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-2 flex-wrap", children: [
      /* @__PURE__ */ jsxs8("span", { className: "text-[13px] font-bold text-gray-900 mr-1", children: [
        "Total: ",
        pricingUnavailable ? /* @__PURE__ */ jsx8("span", { className: "text-amber-700", children: "Pricing unavailable" }) : money(total)
      ] }),
      /* @__PURE__ */ jsx8(Btn, { icon: HelpCircle, label: "Help", onClick: onHelp }),
      /* @__PURE__ */ jsx8(Btn, { icon: Undo2, label: "Undo", onClick: onUndo, disabled: !canUndo }),
      /* @__PURE__ */ jsx8(Btn, { icon: Redo2, label: "Redo", onClick: onRedo, disabled: !canRedo }),
      /* @__PURE__ */ jsx8(Btn, { icon: LayoutTemplate, label: "Templates", onClick: onTemplates }),
      /* @__PURE__ */ jsx8(Btn, { icon: BookmarkPlus, label: "Save as Template", onClick: onSaveAsTemplate }),
      /* @__PURE__ */ jsx8(Btn, { icon: Copy, label: "Save As Copy", onClick: onSaveAsCopy }),
      onSwapToBrickStone ? /* @__PURE__ */ jsx8(Btn, { icon: ArrowLeftRight, label: "Swap to BrickStone", onClick: onSwapToBrickStone }) : null,
      onShareLink ? /* @__PURE__ */ jsx8(Btn, { icon: Link2, label: "Share Link", onClick: onShareLink }) : null,
      /* @__PURE__ */ jsxs8(
        "button",
        {
          type: "button",
          onClick: onSaveAndExit,
          disabled: saving,
          className: "h-[28px] px-3 flex items-center gap-1.5 rounded-sm bg-lime-300 border border-lime-400 text-[12px] font-bold text-gray-800 hover:bg-lime-200 disabled:opacity-60",
          children: [
            /* @__PURE__ */ jsx8(Save, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
            " ",
            saving ? "Saving\u2026" : "Save & Exit"
          ]
        }
      ),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          onClick: onToggleAutoSave,
          className: `ml-1 w-[38px] h-[20px] rounded-full transition-colors relative ${autoSave ? "bg-gray-800" : "bg-gray-300"}`,
          title: "Auto-save",
          children: /* @__PURE__ */ jsx8(
            "span",
            {
              className: `absolute top-[2px] w-[16px] h-[16px] bg-white rounded-full transition-all ${autoSave ? "left-[20px]" : "left-[2px]"}`
            }
          )
        }
      ),
      /* @__PURE__ */ jsx8("span", { className: "text-[10px] font-semibold text-gray-500 uppercase tracking-wide", children: "Auto-save" }),
      /* @__PURE__ */ jsxs8("span", { className: "text-[11px] text-gray-400", children: [
        saving ? "Saving\u2026" : dirty ? "Not yet saved" : "All changes saved",
        !saving && !dirty && lastSavedAt ? ` \xB7 Last saved ${new Date(lastSavedAt).toLocaleString()}` : ""
      ] }),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          onClick: onSave,
          disabled: saving || !dirty,
          className: "h-[28px] px-3 rounded-sm border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40",
          children: "Save"
        }
      )
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/pages/FoundationEstimator.jsx
import FoundationSectionBanner from "@/components/estimator/foundation/FoundationSectionBanner";
import AiEngineeringAssistant from "@/components/estimator/foundation/AiEngineeringAssistant";

// .audit-work/foundation-o029-cutschedule/verify/stubs/three.js
var Vector3 = class _Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  clone() {
    return new _Vector3(this.x, this.y, this.z);
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l;
    this.y /= l;
    this.z /= l;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setFromUnitVectors() {
    return this;
  }
};
var Object3D = class {
  constructor() {
    this.children = [];
    this.userData = {};
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.quaternion = new Vector3();
  }
  add(o) {
    this.children.push(o);
    return this;
  }
  traverse(fn) {
    fn(this);
    this.children.forEach((c) => c.traverse ? c.traverse(fn) : fn(c));
  }
};
var Group = class extends Object3D {
};
var Mesh = class extends Object3D {
  constructor(g, m) {
    super();
    this.geometry = g;
    this.material = m;
  }
};
var geo = class {
  constructor() {
  }
  dispose() {
  }
};
var mat = class {
  constructor(opts) {
    Object.assign(this, opts || {});
  }
  dispose() {
  }
};
var Scene = Group;
var CylinderGeometry = geo;
var BoxGeometry = geo;
var PlaneGeometry = geo;
var MeshStandardMaterial = mat;
var MeshBasicMaterial = mat;
var PerspectiveCamera = class extends Object3D {
  updateProjectionMatrix() {
  }
};
var WebGLRenderer = class {
  constructor() {
    this.domElement = { addEventListener() {
    }, removeEventListener() {
    }, style: {}, getRootNode: () => document };
  }
  render() {
  }
  setSize() {
  }
  dispose() {
  }
  setPixelRatio() {
  }
};
var DirectionalLight = Group;
var HemisphereLight = Group;
var Color = class {
  constructor(c) {
    this.c = c;
  }
  set() {
  }
};

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/Foundation3DPreview.jsx
import { Fragment as Fragment4, jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var IN = 1 / 12;
function buildScene(scene, project, solid, showGround) {
  const group = new Group();
  const concreteMat = solid ? new MeshStandardMaterial({ color: 10265519, roughness: 0.9 }) : new MeshBasicMaterial({ color: 3621201, wireframe: true });
  const poleMat = solid ? new MeshStandardMaterial({ color: 4937059, metalness: 0.4, roughness: 0.5 }) : new MeshBasicMaterial({ color: 2042167, wireframe: true });
  let cursorX = 0;
  const items = project.items || [];
  items.forEach((item) => {
    const qty2 = Math.max(1, Number(item.quantity) || 1);
    const depth = (Number(item.depth_inches) || 0) * IN;
    for (let i = 0; i < qty2; i++) {
      let mesh;
      let footprint;
      if (item.foundation_type === "pillar") {
        const r = (Number(item.diameter) || 0) / 2 * IN;
        footprint = r * 2;
        mesh = new Mesh(new CylinderGeometry(r, r, depth, 24), concreteMat);
      } else {
        const l = (Number(item.length_inches) || 0) * IN;
        const w = (Number(item.width_inches) || 0) * IN;
        footprint = Math.max(l, w);
        mesh = new Mesh(new BoxGeometry(l, depth, w), concreteMat);
      }
      const offset = (Number(item.grade_offset_inches) || 0) * IN;
      mesh.position.set(cursorX + footprint / 2, -depth / 2 + offset, 0);
      mesh.rotation.y = (Number(item.rotation_degrees) || 0) * Math.PI / 180;
      group.add(mesh);
      if (item.selected_pole_id || item.pole_total_height_inches) {
        const h = (Number(item.pole_total_height_inches) || 96) * IN;
        const pole = new Mesh(new CylinderGeometry(0.35, 0.35, h, 16), poleMat);
        pole.position.set(mesh.position.x, offset + h / 2, 0);
        group.add(pole);
      }
      cursorX += footprint + 2;
    }
  });
  (project.poles || []).forEach((p) => {
    const height = (Number(p.height_inches) || 96) * IN;
    const embed = (Number(p.embedment_inches ?? p.y_offset_inches) || 0) * IN;
    const base2 = (Number(p.base_offset_inches) || 0) * IN;
    const len = height + embed;
    const shape = typeof p.pole_shape === "string" ? p.pole_shape.toLowerCase() : "round";
    let pole;
    if (shape === "square" || shape === "rectangular") {
      pole = new Mesh(new BoxGeometry(0.7, len, shape === "rectangular" ? 0.45 : 0.7), poleMat);
    } else {
      pole = new Mesh(new CylinderGeometry(0.35, 0.35, len, 16), poleMat);
      if (shape === "elliptical") pole.scale.z = 0.55;
    }
    pole.position.set(
      (Number(p.x_inches) || 0) * IN,
      base2 + (height - embed) / 2,
      (Number(p.z_inches) || 0) * IN
    );
    group.add(pole);
  });
  if (showGround) {
    const grid = new (void 0)(60, 60, 13751771, 15067115);
    grid.position.y = 0.01;
    group.add(grid);
    const ground = new Mesh(
      new PlaneGeometry(60, 60),
      new MeshStandardMaterial({ color: 15987958, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
  }
  const box = new (void 0)().setFromObject(group);
  const center = box.getCenter(new Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
  scene.add(group);
  return group;
}
function Foundation3DPreview({ project }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const [solid, setSolid] = useState(true);
  const [showGround, setShowGround] = useState(true);
  const [visible, setVisible] = useState(true);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    if (!visible || !mountRef.current) return;
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const scene = new Scene();
    scene.background = new Color(16382715);
    const camera = new PerspectiveCamera(45, width / height, 0.1, 2e3);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);
    scene.add(new HemisphereLight(16777215, 10265519, 1.1));
    const dir = new DirectionalLight(16777215, 0.7);
    dir.position.set(20, 30, 20);
    scene.add(dir);
    const st = stateRef.current;
    st.theta = st.theta ?? Math.PI / 4;
    st.phi = st.phi ?? Math.PI / 3.2;
    st.radius = st.radius ?? 30;
    st.target = st.target || new Vector3(0, 0, 0);
    const applyCamera = () => {
      const r = st.radius;
      camera.position.set(
        st.target.x + r * Math.sin(st.phi) * Math.cos(st.theta),
        st.target.y + r * Math.cos(st.phi),
        st.target.z + r * Math.sin(st.phi) * Math.sin(st.theta)
      );
      camera.lookAt(st.target);
    };
    buildScene(scene, project, solid, showGround);
    applyCamera();
    let frame;
    const render = () => {
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    let dragging = null;
    let last = { x: 0, y: 0 };
    const onDown = (e) => {
      dragging = e.button === 2 ? "pan" : "orbit";
      last = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (dragging === "orbit") {
        st.theta += dx * 8e-3;
        st.phi = Math.min(Math.PI / 2.02, Math.max(0.15, st.phi - dy * 6e-3));
      } else {
        const panScale = st.radius * 15e-4;
        st.target.x -= dx * panScale * Math.cos(st.theta + Math.PI / 2);
        st.target.z -= dx * panScale * Math.sin(st.theta + Math.PI / 2);
        st.target.y += dy * panScale;
      }
      applyCamera();
    };
    const onUp = () => dragging = null;
    const onWheel = (e) => {
      e.preventDefault();
      st.radius = Math.min(200, Math.max(3, st.radius * (1 + e.deltaY * 1e-3)));
      setZoom(Math.round(30 / st.radius * 100));
      applyCamera();
    };
    const onContext = (e) => e.preventDefault();
    const el = renderer.domElement;
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    stateRef.current.setView = (view) => {
      if (view === "front") {
        st.theta = -Math.PI / 2;
        st.phi = Math.PI / 2.05;
      }
      if (view === "side") {
        st.theta = 0;
        st.phi = Math.PI / 2.05;
      }
      if (view === "top") {
        st.theta = -Math.PI / 2;
        st.phi = 0.16;
      }
      if (view === "reset") {
        st.theta = Math.PI / 4;
        st.phi = Math.PI / 3.2;
        st.radius = 30;
        st.target.set(0, 0, 0);
        setZoom(100);
      }
      applyCamera();
    };
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
  }, [project, solid, showGround, visible]);
  const setView = (v) => stateRef.current.setView?.(v);
  const ToolBtn = ({ children, onClick, active }) => /* @__PURE__ */ jsx9(
    "button",
    {
      type: "button",
      onClick,
      className: `h-[24px] px-2 rounded-sm border text-[11px] font-medium flex items-center gap-1 ${active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-700"}`,
      children
    }
  );
  return /* @__PURE__ */ jsxs9("div", { className: "bg-white border border-gray-200 rounded-sm p-2", children: [
    /* @__PURE__ */ jsxs9("div", { className: "flex items-center justify-between mb-2", children: [
      /* @__PURE__ */ jsxs9("div", { children: [
        /* @__PURE__ */ jsx9("span", { className: "text-[12px] font-bold text-gray-800", children: "3D Preview" }),
        /* @__PURE__ */ jsx9("span", { className: "text-[11px] text-gray-400 ml-2", children: "Updates live as you edit" })
      ] }),
      /* @__PURE__ */ jsxs9(
        "button",
        {
          type: "button",
          onClick: () => setVisible((v) => !v),
          className: "text-[11px] font-medium text-gray-600 hover:text-red-600 flex items-center gap-1",
          children: [
            visible ? /* @__PURE__ */ jsx9(EyeOff, { className: "w-3.5 h-3.5", "aria-hidden": "true" }) : /* @__PURE__ */ jsx9(Eye, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
            visible ? "Hide 3D View" : "Show 3D View"
          ]
        }
      )
    ] }),
    visible && /* @__PURE__ */ jsxs9(Fragment4, { children: [
      /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-1 flex-wrap mb-2", children: [
        /* @__PURE__ */ jsx9(ToolBtn, { onClick: () => setView("front"), children: "Front" }),
        /* @__PURE__ */ jsx9(ToolBtn, { onClick: () => setView("side"), children: "Side" }),
        /* @__PURE__ */ jsx9(ToolBtn, { onClick: () => setView("top"), children: "Top" }),
        /* @__PURE__ */ jsxs9(ToolBtn, { onClick: () => setView("reset"), children: [
          /* @__PURE__ */ jsx9(RotateCcw, { className: "w-3 h-3", "aria-hidden": "true" }),
          " Reset"
        ] }),
        /* @__PURE__ */ jsxs9("span", { className: "text-[11px] text-gray-500 px-1", children: [
          zoom,
          "%"
        ] }),
        /* @__PURE__ */ jsx9(ToolBtn, { onClick: () => setShowGround((v) => !v), active: !showGround, children: showGround ? "Hide Ground" : "Show Ground" }),
        /* @__PURE__ */ jsxs9(ToolBtn, { onClick: () => setSolid((v) => !v), active: solid, children: [
          /* @__PURE__ */ jsx9(Box, { className: "w-3 h-3", "aria-hidden": "true" }),
          " ",
          solid ? "Solid Mode" : "Wireframe"
        ] }),
        /* @__PURE__ */ jsxs9(ToolBtn, { onClick: () => mountRef.current?.requestFullscreen?.(), children: [
          /* @__PURE__ */ jsx9(Maximize2, { className: "w-3 h-3", "aria-hidden": "true" }),
          " Full Screen"
        ] })
      ] }),
      /* @__PURE__ */ jsx9("div", { ref: mountRef, className: "w-full h-[420px] rounded-sm overflow-hidden bg-gray-50" }),
      /* @__PURE__ */ jsxs9("div", { className: "flex items-center justify-between text-[10px] text-gray-500 mt-1 px-1", children: [
        /* @__PURE__ */ jsx9("span", { children: "Left Click + Drag: Orbit/Rotate" }),
        /* @__PURE__ */ jsx9("span", { children: "Right Click + Drag: Pan/Move" }),
        /* @__PURE__ */ jsx9("span", { children: "Scroll Wheel: Zoom in/out" })
      ] })
    ] })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/api/base44Client.js
var base44 = { entities: {}, functions: { invoke: async () => {
  throw new Error("stub");
} }, asServiceRole: { entities: {} } };

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationTemplateDialog.jsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationTemplateService.js
import { ensureReusableRecord } from "@/components/estimator/products/reusableSaveIdempotency";
async function saveFoundationTemplate({ idempotencyKey, data }) {
  return ensureReusableRecord({
    entity: base44.entities.ProjectTemplate,
    idempotencyKey,
    data,
    label: "Foundation template"
  });
}
var isNotFound = (e) => {
  const status = Number(e?.status || e?.response?.status || e?.response?.statusCode || e?.data?.status || 0);
  if (status === 404) return true;
  const message = [
    e?.message,
    e?.response?.data?.message,
    e?.response?.data?.error,
    e?.data?.message,
    e?.data?.error
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  return message.includes("not found") || message.includes("does not exist");
};
async function deleteFoundationTemplate(templateId) {
  const id = String(templateId || "").trim();
  if (!id) throw new Error("Foundation template id is required.");
  let current;
  try {
    current = await base44.entities.ProjectTemplate.get(id);
  } catch (e) {
    if (isNotFound(e)) return true;
    throw e;
  }
  if (current === null || current === void 0 || typeof current !== "object" || Array.isArray(current) || current.id !== id) {
    throw new Error("Foundation template record could not be verified; delete aborted.");
  }
  await deleteEntityIfUnchanged({
    entity: base44.entities.ProjectTemplate,
    record: current,
    label: "Foundation template"
  });
  return true;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationAssemblyModel.js
var ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var ID_MAX = 200;
var MAX_COLLISIONS = 8;
var UNRESOLVED_PREFIX = "unresolved:";
var UNRESOLVED = {
  foundation: `${UNRESOLVED_PREFIX}legacy-foundation`,
  pole: `${UNRESOLVED_PREFIX}legacy-pole`,
  wall: `${UNRESOLVED_PREFIX}legacy-wall`,
  segment: `${UNRESOLVED_PREFIX}legacy-segment`
};
var isRecord8 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var isId = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= ID_MAX;
var isReserved = (v) => typeof v === "string" && v.startsWith(UNRESOLVED_PREFIX);
var isUnresolvedToken = (v) => Object.values(UNRESOLVED).includes(v);
var deepClone = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var cloneRawValue = (v) => {
  try {
    return deepClone(v);
  } catch {
    return v;
  }
};
var cloneNode = (n) => isRecord8(n) ? { ...n } : n;
var fin = (v) => typeof v === "number" && Number.isFinite(v);
var segEndpoints = (shape, i) => {
  const pts = shape?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const closed = shape?.closed === true && pts.length >= 3;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  if (i >= pts.length || !closed && i >= pts.length - 1) return null;
  if (!fin(a?.x) || !fin(a?.z) || !fin(b?.x) || !fin(b?.z)) return null;
  return `${a.x},${a.z}->${b.x},${b.z}`;
};
var legacyIndexOf = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v === null || v === void 0) continue;
    if (v === -1) return { explicit: true };
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return { index: v };
    if (typeof v === "string" && /^\d+$/.test(v)) return { index: parseInt(v, 10) };
    return { invalid: v };
  }
  return { absent: true };
};
var collectIds = (project) => {
  const ids = /* @__PURE__ */ new Set();
  const walk = (rows) => (rows || []).forEach((r) => {
    if (isId(r?.component_id)) ids.add(r.component_id);
  });
  ARRAYS.forEach((k) => walk(project?.[k]));
  (project?.walls || []).forEach((w) => walk(w?.shape?.segments));
  (project?.poles || []).forEach((p) => walk(p?.signs));
  return ids;
};
var collectRefs = (project) => {
  const refs = /* @__PURE__ */ new Set();
  const add = (v) => {
    if (isId(v)) refs.add(v);
  };
  (project?.poles || []).forEach((p) => add(p?.foundation_component_id));
  (project?.wall_caps || []).forEach((c) => {
    add(c?.wall_component_id);
    add(c?.segment_component_id);
  });
  (project?.signage_cabinets || []).forEach((c) => {
    add(c?.foundation_component_id);
    add(c?.pole_component_id);
  });
  return refs;
};
var freshId = (createId, kind, used) => {
  for (let i = 0; i < MAX_COLLISIONS; i += 1) {
    const id = createId(kind);
    if (isId(id) && !isReserved(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`foundation assembly: could not mint a unique component id for ${kind}`);
};
var validateRef = (v, kind) => {
  if (v === void 0 || v === null) return;
  if (typeof v !== "string" || v !== "" && !isId(v) && !isUnresolvedToken(v)) {
    throw new Error(`foundation assembly: invalid ${kind} reference value`);
  }
};
var ensureNodeId = (row, createId, kind, used, seen) => {
  if (!isRecord8(row)) throw new Error(`foundation assembly: ${kind} row must be a record`);
  const n = cloneNode(row);
  const existing = n.component_id;
  if (existing !== void 0 && existing !== null) {
    if (!isId(existing) || isReserved(existing)) throw new Error(`foundation assembly: invalid component_id on ${kind} row`);
    if (seen.has(existing)) throw new Error(`foundation assembly: duplicate component_id "${existing}"`);
    seen.add(existing);
    used.add(existing);
  } else {
    const id = freshId(createId, kind, used);
    n.component_id = id;
    seen.add(id);
  }
  return n;
};
var reserve = (project, previous, used) => {
  const check = (v) => {
    if (typeof v === "string" && v.length > 0) used.add(v);
  };
  for (const src of [previous || {}, project || {}]) {
    collectIds(src).forEach((id) => used.add(id));
    collectRefs(src).forEach((id) => used.add(id));
    const kinds = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
    for (const k of kinds) for (const r of src?.[k] || []) {
      if (!isRecord8(r)) throw new Error(`foundation assembly: ${k} row must be a record`);
      for (const [f, kind] of [["foundation_component_id", "foundation"], ["pole_component_id", "pole"], ["wall_component_id", "wall"], ["segment_component_id", "segment"]]) validateRef(r[f], kind);
    }
    for (const w of src?.walls || []) for (const s of w?.shape?.segments || []) check(s?.component_id);
    for (const p of src?.poles || []) for (const s of p?.signs || []) check(s?.component_id);
  }
};
var rebuildIndex = (canon, parents) => {
  if (canon === "" || canon === void 0 || isUnresolvedToken(canon)) return void 0;
  const i = (parents || []).findIndex((p) => p?.component_id === canon);
  return i >= 0 ? i : void 0;
};
var resolveParent = (canonValue, hasCanon, legacy, incoming, prev, unresolvedToken) => {
  if (hasCanon) {
    if (canonValue === void 0 || canonValue === null) return { canon: "", index: void 0 };
    if (canonValue === "") return { canon: "", index: void 0 };
    if (isUnresolvedToken(canonValue)) return { canon: canonValue, index: void 0, dangling: true, token: true };
    const found = (incoming || []).some((p) => p?.component_id === canonValue);
    return { canon: canonValue, index: found ? rebuildIndex(canonValue, incoming) : void 0, dangling: !found };
  }
  if (legacy.index !== void 0) {
    let canon;
    if (prev) canon = prev[legacy.index]?.component_id;
    else canon = incoming?.[legacy.index]?.component_id;
    if (isId(canon) && (incoming || []).some((p) => p?.component_id === canon)) {
      return { canon, index: rebuildIndex(canon, incoming) };
    }
    if (isId(canon)) return { canon: unresolvedToken, index: void 0, dangling: true, token: true };
    return { canon: unresolvedToken, index: void 0, dangling: true, token: true, outOfRange: true };
  }
  if (legacy.invalid !== void 0) return { canon: unresolvedToken, index: void 0, dangling: true, token: true, invalid: legacy.invalid };
  if (legacy.explicit) return { canon: "", index: void 0 };
  return { canon: void 0, index: void 0 };
};
var normalizeWalls = (walls, prevWalls, createId, used, seen) => {
  const prevSegIds = /* @__PURE__ */ new Map();
  (prevWalls || []).forEach((w) => {
    const segs = w?.shape?.segments || [];
    segs.forEach((s, i) => {
      const key = segEndpoints(w?.shape, i);
      if (!isId(s?.component_id) || !key) return;
      const k = `${w.component_id}|${key}`;
      if (prevSegIds.has(k)) prevSegIds.set(k, null);
      else prevSegIds.set(k, s.component_id);
    });
  });
  const out = [];
  for (const w of walls || []) {
    const n = ensureNodeId(w, createId, "wall", used, seen);
    const shape = isRecord8(n.shape) ? { ...n.shape } : n.shape;
    const segs = shape?.segments;
    if (segs !== void 0 && !Array.isArray(segs)) throw new Error("foundation assembly: wall shape segments must be an array");
    if (Array.isArray(segs)) {
      for (const s of segs) if (!isRecord8(s)) throw new Error("foundation assembly: wall shape segments must be records");
      const incomingCount = /* @__PURE__ */ new Map();
      segs.forEach((s, i) => {
        const key = segEndpoints(shape, i);
        if (key) incomingCount.set(key, (incomingCount.get(key) || 0) + 1);
      });
      const priorCount = /* @__PURE__ */ new Map();
      (prevWalls || []).forEach((w2) => {
        (w2?.shape?.segments || []).forEach((s2, i) => {
          const key = segEndpoints(w2?.shape, i);
          if (w2?.component_id === n.component_id && key) priorCount.set(key, (priorCount.get(key) || 0) + 1);
        });
      });
      shape.segments = segs.map((s, i) => {
        const prior = s.component_id;
        if (prior !== void 0 && prior !== null) return ensureNodeId(s, createId, "wall_segment", used, seen);
        const key = segEndpoints(shape, i);
        const kept = key && incomingCount.get(key) === 1 && priorCount.get(key) === 1 ? prevSegIds.get(`${n.component_id}|${key}`) : void 0;
        if (kept && !seen.has(kept)) {
          const sn = cloneNode(s);
          sn.component_id = kept;
          seen.add(kept);
          used.add(kept);
          return sn;
        }
        return ensureNodeId(s, createId, "wall_segment", used, seen);
      });
    }
    n.shape = shape;
    out.push(n);
  }
  return out;
};
var normalizePoles = (poles, items, prevItems, createId, used, seen) => (poles || []).map((p) => {
  const n = ensureNodeId(p, createId, "pole", used, seen);
  const legacy = legacyIndexOf(p, ["foundation_idx"]);
  const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(p, "foundation_component_id"), legacy, items, prevItems, UNRESOLVED.foundation);
  n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
  n.foundation_idx = res.index;
  const signs = p?.signs;
  if (signs !== void 0 && !Array.isArray(signs)) throw new Error("foundation assembly: pole signs must be an array");
  if (Array.isArray(signs)) n.signs = signs.map((s) => ensureNodeId(s, createId, "pole_sign", used, seen));
  return n;
});
var normalizeCaps = (caps, walls, prevWalls, createId, used, seen) => (caps || []).map((c) => {
  const n = ensureNodeId(c, createId, "wall_cap", used, seen);
  const wRes = resolveParent(n.wall_component_id, Object.prototype.hasOwnProperty.call(c, "wall_component_id"), legacyIndexOf(c, ["wall_index"]), walls, prevWalls, UNRESOLVED.wall);
  n.wall_component_id = wRes.canon === void 0 ? "" : wRes.canon;
  n.wall_index = wRes.index;
  const wall = (walls || []).find((w) => w?.component_id === n.wall_component_id);
  const segs = wall?.shape?.segments || [];
  const prevSegs = prevWalls ? prevWalls.find((w) => w?.component_id === n.wall_component_id)?.shape?.segments || [] : null;
  const sRes = resolveParent(n.segment_component_id, Object.prototype.hasOwnProperty.call(c, "segment_component_id"), legacyIndexOf(c, ["segment_index"]), segs, prevSegs, UNRESOLVED.segment);
  n.segment_component_id = sRes.canon === void 0 ? "" : sRes.canon;
  n.segment_index = sRes.index;
  return n;
});
var normalizeCabinets = (cabinets, items, poles, prevItems, prevPoles, createId, used, seen) => (cabinets || []).map((c) => {
  const n = ensureNodeId(c, createId, "signage_cabinet", used, seen);
  const mount = c?.mount;
  if (mount === "pole") {
    const res = resolveParent(n.pole_component_id, Object.prototype.hasOwnProperty.call(c, "pole_component_id"), legacyIndexOf(c, ["pole_index"]), poles, prevPoles, UNRESOLVED.pole);
    n.pole_component_id = res.canon === void 0 ? "" : res.canon;
    n.pole_index = res.index;
    n.foundation_component_id = n.foundation_component_id ?? "";
    n.foundation_index = void 0;
  } else if (mount === "foundation") {
    const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(c, "foundation_component_id"), legacyIndexOf(c, ["foundation_index"]), items, prevItems, UNRESOLVED.foundation);
    n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
    n.foundation_index = res.index;
    n.pole_component_id = n.pole_component_id ?? "";
    n.pole_index = void 0;
  } else {
    n.mount = mount;
    if (n.foundation_component_id === void 0) n.foundation_component_id = "";
    if (n.pole_component_id === void 0) n.pole_component_id = "";
    n.foundation_index = void 0;
    n.pole_index = void 0;
  }
  return n;
});
function normalizeFoundationAssembly(project, { previous = null, createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord8(project)) throw new Error("foundation assembly: project must be a record");
  const ver = project.assembly_schema_version;
  if (ver !== void 0 && ver !== 1) throw new Error(`foundation assembly: unsupported assembly_schema_version ${String(ver)}`);
  const used = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  for (const k of ARRAYS) {
    if (project[k] !== void 0 && !Array.isArray(project[k])) throw new Error(`foundation assembly: ${k} must be an array`);
  }
  reserve(project, previous, used);
  const next = { ...project, assembly_schema_version: 1 };
  next.items = (project.items || []).map((it) => ensureNodeId(it, createId, "item", used, seen));
  next.walls = normalizeWalls(project.walls, previous?.walls, createId, used, seen);
  next.poles = normalizePoles(project.poles, next.items, previous?.items, createId, used, seen);
  next.wall_caps = normalizeCaps(project.wall_caps, next.walls, previous?.walls, createId, used, seen);
  next.signage_cabinets = normalizeCabinets(project.signage_cabinets, next.items, next.poles, previous?.items, previous?.poles, createId, used, seen);
  return { project: next, issues: foundationAssemblyIssues(next) };
}
function foundationAssemblyIssues(project) {
  const issues = [];
  if (!isRecord8(project)) return issues;
  const items = project.items || [];
  const walls = project.walls || [];
  const poles = project.poles || [];
  const byId = (arr, id) => isId(id) && (arr || []).some((p) => p?.component_id === id);
  for (const p of poles) {
    const canon = p?.foundation_component_id;
    if (canon === "" || canon === void 0 || canon === null) continue;
    if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole legacy foundation index could not be resolved; left unresolved until reassigned." });
    else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole references a foundation that is not present; it stays priced until reassigned." });
  }
  for (const c of project.wall_caps || []) {
    const wId = c?.wall_component_id;
    if (wId === "" || wId === void 0 || wId === null) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall assigned; it stays priced until assigned." });
    else if (isReserved(wId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap wall could not be resolved; left unresolved until reassigned." });
    else if (!byId(walls, wId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap references a wall that is not present; it stays priced until reassigned." });
    const wall = walls.find((w) => w?.component_id === wId);
    const segs = wall?.shape?.segments || [];
    const sId = c?.segment_component_id;
    if (sId === "" || sId === void 0 || sId === null) {
      if (wall) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall segment assigned; it stays priced until assigned." });
    } else if (isReserved(sId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap segment could not be resolved; left unresolved until reassigned." });
    else if (!byId(segs, sId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap references a wall segment that is not present; it stays priced until reassigned." });
  }
  for (const c of project.signage_cabinets || []) {
    if (c?.mount === "pole") {
      const canon = c?.pole_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet pole could not be resolved; left unresolved until reassigned." });
      else if (!byId(poles, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a pole that is not present; it stays priced until reassigned." });
    } else if (c?.mount === "foundation") {
      const canon = c?.foundation_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet foundation could not be resolved; left unresolved until reassigned." });
      else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a foundation that is not present; it stays priced until reassigned." });
    } else {
      issues.push({ code: "unsupported-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet mount is not supported; it stays priced and visible until reassigned." });
    }
  }
  return issues;
}
function cloneFoundationComponents(project, { createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord8(project)) throw new Error("foundation assembly: project must be a record");
  const rawWallSegments = /* @__PURE__ */ new Map();
  const wallsForNormalize = (Array.isArray(project.walls) ? project.walls : []).map((w, i) => {
    if (!isRecord8(w) || !isRecord8(w.shape)) return w;
    const segs = w.shape.segments;
    if (segs === void 0 || Array.isArray(segs)) return w;
    rawWallSegments.set(i, segs);
    const shape = { ...w.shape };
    delete shape.segments;
    return { ...w, shape };
  });
  const { project: normalized } = normalizeFoundationAssembly(
    rawWallSegments.size ? { ...project, walls: wallsForNormalize } : project,
    { createId }
  );
  const used = /* @__PURE__ */ new Set([...collectIds(normalized), ...collectRefs(normalized)]);
  const idMap = /* @__PURE__ */ new Map();
  const remap = (oldId, kind) => {
    if (!isId(oldId) || isReserved(oldId)) return oldId;
    if (idMap.has(oldId)) return idMap.get(oldId);
    const id = freshId(createId, kind, used);
    idMap.set(oldId, id);
    return id;
  };
  const components = { assembly_schema_version: 1 };
  const copyRows = (rows, kind) => (rows || []).map((r) => {
    const n = deepClone(r);
    n.component_id = remap(n.component_id, kind);
    return n;
  });
  if (project.items !== void 0) components.items = copyRows(normalized.items, "item");
  if (project.walls !== void 0) {
    components.walls = copyRows(normalized.walls, "wall").map((w, i) => ({
      ...w,
      shape: isRecord8(w.shape) ? {
        ...w.shape,
        segments: rawWallSegments.has(i) ? cloneRawValue(rawWallSegments.get(i)) : Array.isArray(w.shape.segments) ? w.shape.segments.map((s) => ({ ...s, component_id: remap(s.component_id, "wall_segment") })) : w.shape.segments || []
      } : w.shape
    }));
  }
  if (project.poles !== void 0) {
    components.poles = copyRows(normalized.poles, "pole").map((p) => ({
      ...p,
      foundation_component_id: isId(p.foundation_component_id) && idMap.has(p.foundation_component_id) ? idMap.get(p.foundation_component_id) : p.foundation_component_id,
      signs: (p.signs || []).map((s) => ({ ...s, component_id: remap(s.component_id, "pole_sign") }))
    }));
  }
  if (project.wall_caps !== void 0) {
    components.wall_caps = copyRows(normalized.wall_caps, "wall_cap").map((c) => ({
      ...c,
      wall_component_id: isId(c.wall_component_id) && idMap.has(c.wall_component_id) ? idMap.get(c.wall_component_id) : c.wall_component_id,
      segment_component_id: isId(c.segment_component_id) && idMap.has(c.segment_component_id) ? idMap.get(c.segment_component_id) : c.segment_component_id
    }));
  }
  if (project.signage_cabinets !== void 0) {
    components.signage_cabinets = copyRows(normalized.signage_cabinets, "signage_cabinet").map((c) => ({
      ...c,
      foundation_component_id: isId(c.foundation_component_id) && idMap.has(c.foundation_component_id) ? idMap.get(c.foundation_component_id) : c.foundation_component_id,
      pole_component_id: isId(c.pole_component_id) && idMap.has(c.pole_component_id) ? idMap.get(c.pole_component_id) : c.pole_component_id
    }));
  }
  const parents = components.items || [];
  const wallRows = components.walls || [];
  const poleRows = components.poles || [];
  (components.poles || []).forEach((p) => {
    p.foundation_idx = rebuildIndex(p.foundation_component_id, parents);
  });
  (components.wall_caps || []).forEach((c) => {
    c.wall_index = rebuildIndex(c.wall_component_id, wallRows);
    const rawSegs = wallRows.find((w) => w?.component_id === c.wall_component_id)?.shape?.segments;
    const segs = Array.isArray(rawSegs) ? rawSegs : [];
    c.segment_index = rebuildIndex(c.segment_component_id, segs);
  });
  (components.signage_cabinets || []).forEach((c) => {
    if (c.mount === "pole") {
      c.pole_index = rebuildIndex(c.pole_component_id, poleRows);
      c.foundation_index = void 0;
    } else {
      c.foundation_index = rebuildIndex(c.foundation_component_id, parents);
      c.pole_index = void 0;
    }
  });
  return { components, idMap };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationPreliminaryNotice.js
var PRELIMINARY_NOTICE_TEXT = "Preliminary estimating only - final engineering required";
function hasPreliminaryNotice(text6) {
  return typeof text6 === "string" && text6.includes(PRELIMINARY_NOTICE_TEXT);
}
function ensurePreliminaryNotice(notes) {
  if (notes === null || notes === void 0) return PRELIMINARY_NOTICE_TEXT;
  if (typeof notes !== "string") {
    throw new Error("Preliminary notice can only be applied to string notes.");
  }
  if (notes.trim() === "") return PRELIMINARY_NOTICE_TEXT;
  if (hasPreliminaryNotice(notes)) return notes;
  return `${PRELIMINARY_NOTICE_TEXT}

${notes}`;
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationTemplateModel.js
var FOUNDATION_TEMPLATE_FIELDS = [
  "items",
  "walls",
  "poles",
  "wall_caps",
  "signage_cabinets",
  "selected_equipment",
  "project_concrete_type",
  "project_concrete_admixtures",
  "excavation_method",
  "selected_concrete_id",
  "landscape",
  "ai_engineering_recommendation",
  "ai_engineering_data",
  "notes",
  "hyperlink",
  "beautify_data_url",
  "customer_markup_percent",
  "customer_price_override",
  "customer_pricing",
  "concrete_cost_per_cy",
  "rebar_cost_per_ft",
  "forming_materials_cost_spread_foot",
  "forming_materials_cost_pillar",
  "min_excavation_time_hours",
  "hand_dig_excavation_cost_per_cy",
  "equipment_excavation_cost_per_cy",
  "forming_labor_rate",
  "pouring_labor_rate",
  "finishing_labor_rate",
  "hand_dig_labor_rate",
  "equipment_excavation_labor_rate"
];
var ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var isRecord9 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var deepClone2 = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
var checkTemplateRecord = (data, noun) => {
  if (!isRecord9(data)) throw new Error(`Foundation template ${noun} must be a record.`);
  if (data.assembly_schema_version !== void 0 && data.assembly_schema_version !== 1) {
    throw new Error("Template uses an unsupported assembly version and was not applied.");
  }
};
var sanitizeTemplateCustomerPricing = (v) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (!isRecord9(v)) throw new Error("Foundation template customer_pricing must be a record.");
  if (v.applied !== true) return deepClone2(v);
  return { applied: true, tier_number: v.tier_number };
};
var stampTemplateAppliedAiData = (v, { appliedAt } = {}) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (!isRecord9(v)) throw new Error("Foundation template ai_engineering_data must be a record.");
  const out = deepClone2(v);
  if (out.origin_source_key === void 0) {
    out.origin_source_key = typeof out.source_key === "string" && out.source_key ? out.source_key : null;
  }
  out.template_applied = true;
  out.template_applied_at = typeof appliedAt === "string" && Number.isFinite(Date.parse(appliedAt)) ? appliedAt : (/* @__PURE__ */ new Date()).toISOString();
  return out;
};
var stampTemplateNotesNotice = (v) => {
  if (v === void 0) return v;
  if (v === null) return null;
  if (typeof v !== "string") throw new Error("Foundation template notes must be a string.");
  return ensurePreliminaryNotice(v);
};
function createFoundationTemplateSnapshot(project, { createId } = {}) {
  checkTemplateRecord(project, "source");
  const out = { assembly_schema_version: 1 };
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (project[k] !== void 0) out[k] = deepClone2(project[k]);
  }
  if (out.customer_pricing !== void 0) {
    out.customer_pricing = sanitizeTemplateCustomerPricing(out.customer_pricing);
  }
  if (out.notes !== void 0) {
    out.notes = stampTemplateNotesNotice(out.notes);
  }
  const supplied = {};
  let hasAssembly = false;
  for (const k of ASSEMBLY_ARRAYS) {
    if (out[k] !== void 0) {
      supplied[k] = out[k];
      hasAssembly = true;
    }
  }
  if (hasAssembly) {
    let n = 0;
    const f = typeof createId === "function" ? createId : (kind) => `tmpl_${kind}_${n++}`;
    normalizeFoundationAssembly(supplied, { createId: f });
  }
  return out;
}
function prepareFoundationTemplatePatch(data, { createId, appliedAt } = {}) {
  checkTemplateRecord(data, "data");
  if (typeof createId !== "function") throw new Error("Foundation template apply requires a createId factory.");
  const provided = {};
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (data[k] !== void 0) provided[k] = deepClone2(data[k]);
  }
  if (provided.customer_pricing !== void 0) {
    provided.customer_pricing = sanitizeTemplateCustomerPricing(provided.customer_pricing);
  }
  if (provided.ai_engineering_data !== void 0) {
    provided.ai_engineering_data = stampTemplateAppliedAiData(provided.ai_engineering_data, { appliedAt });
  }
  if (provided.notes !== void 0) {
    provided.notes = stampTemplateNotesNotice(provided.notes);
  }
  const arrays = {};
  for (const k of ASSEMBLY_ARRAYS) if (provided[k] !== void 0) arrays[k] = provided[k];
  const cloned = Object.keys(arrays).length ? cloneFoundationComponents(arrays, { createId }).components : {};
  return { ...provided, ...cloned };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationAssemblyPresets.js
var isRecord10 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var deepClone3 = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var wallSegments = (prefix, points, closed) => (foundationWallSegments(points, closed) || []).map((s, i) => ({
  component_id: `${prefix}_seg_${i + 1}`,
  ...s
}));
var monumentPoints = [
  { x: 132, z: 148 },
  { x: 348, z: 148 },
  { x: 348, z: 172 },
  { x: 132, z: 172 }
];
var monumentSegments = wallSegments("preset_monument_wall_1", monumentPoints, true);
var lWallPoints = [
  { x: 156, z: 156 },
  { x: 336, z: 156 },
  { x: 336, z: 232 }
];
var lWallSegments = wallSegments("preset_lwall_wall_1", lWallPoints, false);
var PRESET_ROWS = [
  {
    preset_key: "single-spread-footing",
    name: "Single spread footing",
    summary: `One 8' x 5'4" spread footing, centered on the plan.`,
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_ssf_item_1",
          foundation_type: "spread_foot",
          description: "Spread footing",
          quantity: 1,
          length_inches: 96,
          width_inches: 64,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 192,
          z_inches: 128,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [],
      poles: [],
      wall_caps: [],
      signage_cabinets: []
    }
  },
  {
    preset_key: "single-pillar-pier",
    name: "Single pillar pier",
    summary: 'One 24" diameter drilled pier, centered on the plan.',
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_pier_item_1",
          foundation_type: "pillar",
          description: "Pier footing",
          quantity: 1,
          diameter: 24,
          depth_inches: 36,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 228,
          z_inches: 148,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [],
      poles: [],
      wall_caps: [],
      signage_cabinets: []
    }
  },
  {
    preset_key: "pylon-pole-on-pier",
    name: "Pylon pole on pier",
    summary: `30" pier footing with a 20' pole anchored to it.`,
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_pylon_item_1",
          foundation_type: "pillar",
          description: "Pylon pier",
          quantity: 1,
          diameter: 30,
          depth_inches: 42,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 225,
          z_inches: 145,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [],
      poles: [
        {
          component_id: "preset_pylon_pole_1",
          pole_id: "",
          height_inches: 240,
          embedment_inches: 48,
          include_pole_painting: false,
          foundation_component_id: "preset_pylon_item_1",
          foundation_idx: 0,
          x_inches: 240,
          z_inches: 160,
          signs: []
        }
      ],
      wall_caps: [],
      signage_cabinets: []
    }
  },
  {
    preset_key: "twin-pole-monument",
    name: "Twin pole monument",
    summary: "Two 4' spread footings, two 15' poles, and a mounted cabinet on each pole.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_tpm_item_1",
          foundation_type: "spread_foot",
          description: "Left footing",
          quantity: 1,
          length_inches: 48,
          width_inches: 48,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 144,
          z_inches: 136,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        },
        {
          component_id: "preset_tpm_item_2",
          foundation_type: "spread_foot",
          description: "Right footing",
          quantity: 1,
          length_inches: 48,
          width_inches: 48,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 288,
          z_inches: 136,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [],
      poles: [
        {
          component_id: "preset_tpm_pole_1",
          pole_id: "",
          height_inches: 180,
          embedment_inches: 36,
          include_pole_painting: false,
          foundation_component_id: "preset_tpm_item_1",
          foundation_idx: 0,
          x_inches: 168,
          z_inches: 160,
          signs: []
        },
        {
          component_id: "preset_tpm_pole_2",
          pole_id: "",
          height_inches: 180,
          embedment_inches: 36,
          include_pole_painting: false,
          foundation_component_id: "preset_tpm_item_2",
          foundation_idx: 1,
          x_inches: 312,
          z_inches: 160,
          signs: []
        }
      ],
      wall_caps: [],
      signage_cabinets: [
        {
          component_id: "preset_tpm_cabinet_1",
          description: "",
          mount: "pole",
          pole_component_id: "preset_tpm_pole_1",
          pole_index: 0,
          foundation_component_id: "",
          foundation_index: void 0,
          width_inches: 72,
          height_inches: 48,
          depth_inches: 10,
          mount_height_inches: 84,
          quantity: 1,
          unit_cost: 0
        },
        {
          component_id: "preset_tpm_cabinet_2",
          description: "",
          mount: "pole",
          pole_component_id: "preset_tpm_pole_2",
          pole_index: 1,
          foundation_component_id: "",
          foundation_index: void 0,
          width_inches: 72,
          height_inches: 48,
          depth_inches: 10,
          mount_height_inches: 84,
          quantity: 1,
          unit_cost: 0
        }
      ]
    }
  },
  {
    preset_key: "monument-base-wall-cap",
    name: "Monument base with wall cap",
    summary: "20' x 3' footing with a closed perimeter base wall and a cap on every segment.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_monument_item_1",
          foundation_type: "spread_foot",
          description: "Monument footing",
          quantity: 1,
          length_inches: 240,
          width_inches: 36,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 120,
          z_inches: 142,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [
        {
          component_id: "preset_monument_wall_1",
          name: "Base wall",
          heightInches: 18,
          mortarGapInches: 0.375,
          materialId: "",
          internalMaterialId: "",
          shape: { points: monumentPoints, closed: true, segments: monumentSegments }
        }
      ],
      poles: [],
      wall_caps: monumentSegments.map((s, i) => ({
        component_id: `preset_monument_cap_${i + 1}`,
        cap_inventory_id: "",
        wall_component_id: "preset_monument_wall_1",
        wall_index: 0,
        segment_component_id: s.component_id,
        segment_index: i
      })),
      signage_cabinets: []
    }
  },
  {
    preset_key: "open-l-wall-run",
    name: "Open L wall on footing",
    summary: "15' x 8' footing with an open two-segment L wall and caps.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_lwall_item_1",
          foundation_type: "spread_foot",
          description: "Wall footing",
          quantity: 1,
          length_inches: 180,
          width_inches: 96,
          depth_inches: 18,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 150,
          z_inches: 148,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: ""
        }
      ],
      walls: [
        {
          component_id: "preset_lwall_wall_1",
          name: "L wall",
          heightInches: 24,
          mortarGapInches: 0.375,
          materialId: "",
          internalMaterialId: "",
          shape: { points: lWallPoints, closed: false, segments: lWallSegments }
        }
      ],
      poles: [],
      wall_caps: lWallSegments.map((s, i) => ({
        component_id: `preset_lwall_cap_${i + 1}`,
        cap_inventory_id: "",
        wall_component_id: "preset_lwall_wall_1",
        wall_index: 0,
        segment_component_id: s.component_id,
        segment_index: i
      })),
      signage_cabinets: []
    }
  }
];
var freezeDeep = (v) => {
  if (isRecord10(v) || Array.isArray(v)) {
    for (const k of Object.keys(v)) freezeDeep(v[k]);
    Object.freeze(v);
  }
  return v;
};
var FOUNDATION_ASSEMBLY_PRESETS = freezeDeep(PRESET_ROWS.map((p) => ({ ...p })));
var findPreset = (presetOrKey) => {
  const key = typeof presetOrKey === "string" ? presetOrKey : presetOrKey?.preset_key;
  const hit = FOUNDATION_ASSEMBLY_PRESETS.find((p) => p.preset_key === key);
  if (!hit) throw new Error(`foundation assembly preset: unknown preset ${JSON.stringify(key)}`);
  return hit;
};
function foundationAssemblyPresetTemplateData(presetOrKey) {
  const preset = findPreset(presetOrKey);
  return deepClone3({ ...preset.project_data, assembly_schema_version: 1 });
}
var COUNT_LABELS = [
  ["items", "foundation", "foundations"],
  ["walls", "wall", "walls"],
  ["poles", "pole", "poles"],
  ["wall_caps", "cap", "caps"],
  ["signage_cabinets", "cabinet", "cabinets"]
];
function describeFoundationAssemblyPreset(presetOrKey) {
  const preset = findPreset(presetOrKey);
  const data = preset.project_data || {};
  const counts = {};
  const parts = [];
  for (const [k, one, many] of COUNT_LABELS) {
    const n = Array.isArray(data[k]) ? data[k].length : 0;
    counts[k] = n;
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  }
  return {
    preset_key: preset.preset_key,
    name: preset.name,
    summary: preset.summary,
    counts,
    counts_label: parts.length ? parts.join(" \xB7 ") : "empty preset",
    total_components: Object.values(counts).reduce((a, n) => a + n, 0)
  };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/loadAllEntityRows.js
async function loadAllEntityRows() {
  return [];
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationTemplateDialog.jsx
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
function FoundationTemplateDialog({ open, mode, onClose, project, onApply, saveDisabled = false, saveDisabledReason = "" }) {
  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const saveAttemptRef = useRef({ signature: "", key: "" });
  const saveFlightRef = useRef(null);
  const contextRef = useRef({ open: false, mode: null, projectId: null, identity: "", generation: 0, project: null });
  const generationRef = useRef(0);
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const draftRef = useRef(null);
  draftRef.current = { project, name };
  const identity = `${open ? 1 : 0}|${mode}|${project?.id ?? ""}`;
  if (contextRef.current.identity !== identity) {
    generationRef.current += 1;
    contextRef.current = {
      open,
      mode,
      projectId: project?.id ?? null,
      project,
      identity,
      generation: generationRef.current
    };
  } else {
    contextRef.current.open = open;
    contextRef.current.project = project;
  }
  const saveContext = { ...contextRef.current };
  const sameContext = (c) => mountedRef.current && c.open && contextRef.current.open && contextRef.current.identity === c.identity && contextRef.current.generation === c.generation;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const loadRows = (gen) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    loadAllEntityRows({
      entity: base44.entities.ProjectTemplate,
      query: { module_key: "foundation" },
      sort: "created_date",
      label: "Foundation templates"
    }).then((rows) => {
      const c = contextRef.current;
      if (!mountedRef.current || !c.open || c.mode !== "load" || generationRef.current !== gen || loadSeqRef.current !== seq) return;
      setTemplates(rows || []);
      setError(null);
    }).catch((e) => {
      const c = contextRef.current;
      if (!mountedRef.current || !c.open || c.mode !== "load" || generationRef.current !== gen || loadSeqRef.current !== seq) return;
      setTemplates([]);
      setLoadFailed(true);
      setError(e?.message || "Templates could not be loaded.");
    }).finally(() => {
      if (mountedRef.current && loadSeqRef.current === seq) setLoading(false);
    });
  };
  useEffect(() => {
    if (!open) return;
    saveAttemptRef.current = { signature: "", key: "" };
    setTemplates([]);
    setError(null);
    setLoadFailed(false);
    if (mode !== "load") return;
    loadRows(generationRef.current);
  }, [open, mode, project?.id]);
  const save = () => {
    const sc = saveContext;
    if (saveFlightRef.current) return saveFlightRef.current;
    if (saveDisabled) return null;
    const trimmed = name.trim();
    if (!trimmed || !sameContext(sc) || sc.mode !== "save" || draftRef.current.project !== project || draftRef.current.name !== name) return null;
    let snapshot;
    try {
      snapshot = createFoundationTemplateSnapshot(project, {
        createId: (kind) => newCreationRequestKey(`template_${kind}`)
      });
    } catch (e) {
      setError(e?.message || "Template snapshot could not be prepared.");
      return null;
    }
    const data = { template_name: trimmed, module_key: "foundation", project_data: snapshot };
    const signature = JSON.stringify(data);
    if (saveAttemptRef.current.signature !== signature) {
      saveAttemptRef.current = {
        signature,
        key: `foundation_template_save:${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
        data
      };
    }
    const attempt = saveAttemptRef.current;
    const run = Promise.resolve().then(async () => {
      if (!sameContext(sc)) return;
      setBusy(true);
      try {
        await saveFoundationTemplate({ idempotencyKey: attempt.key, data: attempt.data });
        if (!sameContext(sc)) return;
        if (draftRef.current.project !== project || draftRef.current.name !== name) {
          setError("The earlier template snapshot was saved. Current changes have not been saved as a template.");
          return;
        }
        setName("");
        saveAttemptRef.current = { signature: "", key: "" };
        setError(null);
        onClose();
      } catch (e) {
        if (sameContext(sc)) setError(e?.message || "Template could not be saved.");
      }
    }).finally(() => {
      if (saveFlightRef.current !== run) return;
      saveFlightRef.current = null;
      if (mountedRef.current) setBusy(false);
    });
    saveFlightRef.current = run;
    return run;
  };
  const apply = (t) => {
    const sc = saveContext;
    if (!sameContext(sc)) return;
    let ok = false;
    try {
      ok = onApply(t.project_data || {}) === true;
    } catch (e) {
      if (sameContext(sc)) setError(e?.message || "Template could not be applied.");
      return;
    }
    if (!sameContext(sc)) return;
    if (ok) {
      setError(null);
      onClose();
    } else {
      setError("Template was not applied; the current project was left unchanged.");
    }
  };
  const applyPreset = (preset) => {
    const sc = saveContext;
    if (!sameContext(sc)) return;
    let ok = false;
    try {
      ok = onApply(foundationAssemblyPresetTemplateData(preset)) === true;
    } catch (e) {
      if (sameContext(sc)) setError(e?.message || "Assembly preset could not be applied.");
      return;
    }
    if (!sameContext(sc)) return;
    if (ok) {
      setError(null);
      onClose();
    } else {
      setError("Preset was not applied; the current project was left unchanged.");
    }
  };
  const remove = async (t) => {
    const sc = saveContext;
    if (!sameContext(sc)) return;
    if (!window.confirm(`Delete template "${t.template_name || "Untitled"}"?`)) return;
    try {
      await deleteFoundationTemplate(t.id);
      if (!sameContext(sc)) return;
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      setError(null);
    } catch (e) {
      if (sameContext(sc)) setError(e?.message || "Template could not be deleted.");
    }
  };
  return /* @__PURE__ */ jsx10(Dialog, { open, onOpenChange: (v) => !v && onClose(), children: /* @__PURE__ */ jsxs10(DialogContent, { className: "max-w-[520px]", children: [
    /* @__PURE__ */ jsx10(DialogHeader, { children: /* @__PURE__ */ jsx10(DialogTitle, { className: "text-[15px]", children: mode === "save" ? "Save as Template" : "Foundation Templates" }) }),
    error ? /* @__PURE__ */ jsx10("div", { role: "alert", className: "text-[12px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5", children: error }) : null,
    mode === "save" ? /* @__PURE__ */ jsxs10("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs10("label", { className: "text-[11px] text-gray-500 block", children: [
        "Template name",
        /* @__PURE__ */ jsx10(
          "input",
          {
            value: name,
            onChange: (e) => setName(e.target.value),
            placeholder: "e.g. Standard 8ft Pylon Foundation",
            className: "w-full h-[30px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400"
          }
        )
      ] }),
      saveDisabled ? /* @__PURE__ */ jsx10("p", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: saveDisabledReason || "Saving a template is not available right now." }) : null,
      /* @__PURE__ */ jsxs10("p", { className: "text-[11px] text-gray-500", children: [
        'Saved template notes lead with "',
        PRELIMINARY_NOTICE_TEXT,
        '".'
      ] }),
      /* @__PURE__ */ jsxs10("div", { className: "flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx10("button", { type: "button", onClick: onClose, className: "h-[30px] px-3 border border-gray-300 rounded-sm text-[12px]", children: "Cancel" }),
        /* @__PURE__ */ jsx10(
          "button",
          {
            type: "button",
            onClick: save,
            disabled: busy || saveDisabled,
            className: "h-[30px] px-4 rounded-sm bg-lime-300 border border-lime-400 text-[12px] font-bold text-gray-800 disabled:opacity-60",
            children: "Save Template"
          }
        )
      ] })
    ] }) : /* @__PURE__ */ jsxs10("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxs10("div", { children: [
        /* @__PURE__ */ jsx10("p", { className: "text-[10px] uppercase tracking-wide text-gray-400 mb-1", children: "Start from an assembly preset" }),
        /* @__PURE__ */ jsx10("div", { className: "divide-y divide-gray-100 border border-gray-200 rounded-sm", children: FOUNDATION_ASSEMBLY_PRESETS.map((p) => {
          const d = describeFoundationAssemblyPreset(p);
          return /* @__PURE__ */ jsxs10("div", { className: "flex items-center gap-2 px-2 py-2", children: [
            /* @__PURE__ */ jsxs10("div", { className: "flex-1", children: [
              /* @__PURE__ */ jsx10("div", { className: "text-[12px] font-semibold text-gray-800", children: d.name }),
              /* @__PURE__ */ jsx10("div", { className: "text-[11px] text-gray-500", children: d.summary }),
              /* @__PURE__ */ jsx10("div", { className: "text-[10px] text-gray-400", children: d.counts_label })
            ] }),
            /* @__PURE__ */ jsx10(
              "button",
              {
                type: "button",
                onClick: () => applyPreset(p),
                className: "h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700",
                children: "Apply"
              }
            )
          ] }, d.preset_key);
        }) }),
        /* @__PURE__ */ jsx10("p", { className: "text-[10px] text-gray-400 mt-1", children: "Applying a preset replaces the current foundation assembly sections." })
      ] }),
      /* @__PURE__ */ jsxs10("div", { children: [
        /* @__PURE__ */ jsx10("p", { className: "text-[10px] uppercase tracking-wide text-gray-400 mb-1", children: "Saved templates" }),
        loading ? /* @__PURE__ */ jsx10("p", { className: "text-[12px] text-gray-500 py-4", children: "Loading\u2026" }) : loadFailed ? /* @__PURE__ */ jsxs10("div", { className: "py-4 space-y-2", children: [
          /* @__PURE__ */ jsx10("p", { className: "text-[12px] text-gray-500", children: "Templates could not be loaded." }),
          /* @__PURE__ */ jsx10(
            "button",
            {
              type: "button",
              onClick: () => {
                const c = saveContext;
                if (sameContext(c)) loadRows(generationRef.current);
              },
              className: "h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700",
              children: "Retry"
            }
          )
        ] }) : templates.length === 0 ? /* @__PURE__ */ jsx10("p", { className: "text-[12px] text-gray-500 py-4", children: "No foundation templates saved yet." }) : /* @__PURE__ */ jsx10("div", { className: "divide-y divide-gray-200 max-h-[320px] overflow-y-auto border border-gray-200 rounded-sm", children: templates.map((t) => /* @__PURE__ */ jsxs10("div", { className: "flex items-center gap-2 px-2 py-2", children: [
          /* @__PURE__ */ jsxs10("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsx10("div", { className: "text-[12px] font-semibold text-gray-800", children: t.template_name }),
            /* @__PURE__ */ jsxs10("div", { className: "text-[11px] text-gray-500", children: [
              (t.project_data?.items || []).length,
              " foundations"
            ] }),
            typeof t.project_data?.ai_engineering_recommendation === "string" && t.project_data.ai_engineering_recommendation.trim() ? /* @__PURE__ */ jsx10("div", { className: "text-[10px] text-violet-600", children: "Includes an AI review note \u2014 stale on this project" }) : null,
            typeof t.project_data?.notes === "string" && t.project_data.notes.trim() ? /* @__PURE__ */ jsx10("div", { className: "text-[10px] text-gray-500", children: "Includes project notes" }) : null
          ] }),
          /* @__PURE__ */ jsx10(
            "button",
            {
              type: "button",
              onClick: () => apply(t),
              className: "h-[26px] px-3 rounded-sm bg-white border border-gray-300 text-[11px] font-semibold text-gray-700",
              children: "Apply"
            }
          ),
          /* @__PURE__ */ jsx10("button", { type: "button", onClick: () => remove(t), className: "text-gray-400 hover:text-red-600", children: /* @__PURE__ */ jsx10(Trash2, { className: "w-4 h-4", "aria-hidden": "true" }) })
        ] }, t.id)) })
      ] })
    ] })
  ] }) });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationSyncConflictDialog.jsx
import { Dialog as Dialog2, DialogContent as DialogContent2, DialogHeader as DialogHeader2, DialogTitle as DialogTitle2 } from "@/components/ui/dialog";

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationDraftRecovery.js
var FOUNDATION_DRAFT_FIELDS = [
  "project_name",
  "notes",
  "assembly_schema_version",
  "items",
  "walls",
  "poles",
  "wall_caps",
  "signage_cabinets",
  "selected_equipment",
  "landscape",
  "project_concrete_type",
  "project_concrete_admixtures",
  "excavation_method",
  "selected_concrete_id",
  "ai_engineering_recommendation",
  "ai_engineering_data",
  // O-104/O-105 — design-basis + site/hazard capture blocks.
  "design_basis",
  "site_hazard",
  // Customer Pricing tab surface — markup %, manual price override, and the
  // applied-tier record (applied/tier_number). Persisted by payload(); restored
  // verbatim through the assembly normalizer's passthrough.
  "customer_markup_percent",
  "customer_price_override",
  "customer_pricing",
  "concrete_cost_per_cy",
  "rebar_cost_per_ft",
  "forming_materials_cost_spread_foot",
  "forming_materials_cost_pillar",
  "min_excavation_time_hours",
  "hand_dig_excavation_cost_per_cy",
  "equipment_excavation_cost_per_cy",
  "forming_labor_rate",
  "pouring_labor_rate",
  "finishing_labor_rate",
  "hand_dig_labor_rate",
  "equipment_excavation_labor_rate"
];
var KEY_PREFIX = "ccs:foundation-draft:v1:";
var MAX_CHARS = 1e6;
var ASSEMBLY_ARRAYS2 = ["items", "walls", "poles", "wall_caps", "signage_cabinets", "selected_equipment"];
var validId = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 256;
var isPlain = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
var keyFor = (ownerId, sourceId, estimateId) => KEY_PREFIX + encodeURIComponent(JSON.stringify([ownerId, sourceId, estimateId ?? null]));
var cloneChecked = (value, seen = /* @__PURE__ */ new Set(), inArray = false) => {
  if (value === void 0) {
    if (inArray) throw new Error("Undefined array entry in draft data.");
    return void 0;
  }
  if (value === null) return null;
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in draft data.");
    return value;
  }
  if (t === "string" || t === "boolean") return value;
  if (t !== "object") throw new Error(`Unsupported draft value type: ${t}`);
  if (seen.has(value)) throw new Error("Cycle in draft data.");
  if (Array.isArray(value)) {
    seen.add(value);
    const out = Array.from(value, (v) => cloneChecked(v, seen, true));
    seen.delete(value);
    return out;
  }
  if (!isPlain(value)) throw new Error("Non-plain object in draft data (Date/Map/class instance not supported).");
  seen.add(value);
  const entries = [];
  for (const [k, v] of Object.entries(value)) {
    const c = cloneChecked(v, seen, false);
    if (c !== void 0) entries.push([k, c]);
  }
  seen.delete(value);
  return Object.fromEntries(entries);
};
var checkAssembly = (data) => {
  for (const f of ASSEMBLY_ARRAYS2) {
    if (f in data && !Array.isArray(data[f])) return `${f} must be an array.`;
    if (Array.isArray(data[f])) {
      for (const r of data[f]) if (!isPlain(r)) return `${f} must contain plain records.`;
    }
  }
  if (data.customer_pricing !== void 0 && !isPlain(data.customer_pricing))
    return "customer_pricing must be a record.";
  if (data.assembly_schema_version !== void 0 && data.assembly_schema_version !== 1)
    return `Unsupported assembly_schema_version: ${data.assembly_schema_version}`;
  return null;
};
var pickDraft = (project) => {
  const entries = [];
  for (const field of FOUNDATION_DRAFT_FIELDS) {
    if (!Object.hasOwn(project, field)) continue;
    const v = cloneChecked(project[field]);
    if (v !== void 0) entries.push([field, v]);
  }
  return Object.fromEntries(entries);
};
var validEnvelope = (raw, ownerId, sourceId, estimateId) => {
  let env;
  try {
    env = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Stored draft is not valid JSON." };
  }
  if (!isPlain(env)) return { ok: false, message: "Stored draft is not a record." };
  if (env.version !== 1) return { ok: false, message: "Unsupported draft version." };
  if (env.ownerId !== ownerId || env.sourceId !== sourceId || (env.estimateId ?? null) !== (estimateId ?? null))
    return { ok: false, message: "Stored draft context does not match." };
  if (!validId(env.token)) return { ok: false, message: "Missing draft token." };
  if (!validId(env.baseUpdatedAt)) return { ok: false, message: "Missing base revision." };
  if (typeof env.savedAt !== "string" || !Number.isFinite(Date.parse(env.savedAt))) return { ok: false, message: "Invalid savedAt timestamp." };
  if (env.draftLost === true) return { ok: true, env, lost: true };
  if (!isPlain(env.data)) return { ok: false, message: "Draft data missing." };
  const bad = checkAssembly(env.data);
  if (bad) return { ok: false, message: bad };
  let data;
  try {
    data = pickDraft(env.data);
  } catch (e) {
    return { ok: false, message: String(e.message || e) };
  }
  return { ok: true, env, data };
};
function createFoundationDraftStore({ getStorage, ownerId, sourceId, estimateId = null }) {
  const unavailable = (msg) => ({ status: "unavailable", message: msg });
  const noAccess = () => ({ read: () => unavailable("No valid draft identity for this owner/source."), write: () => unavailable("No valid draft identity for this owner/source."), clear: () => unavailable("No valid draft identity for this owner/source.") });
  if (typeof getStorage !== "function") return noAccess();
  if (!validId(ownerId) || !validId(sourceId) || estimateId !== null && !validId(estimateId)) return noAccess();
  const key = keyFor(ownerId, sourceId, estimateId);
  const storage = () => {
    try {
      const s = getStorage();
      if (!s || typeof s.getItem !== "function" || typeof s.setItem !== "function" || typeof s.removeItem !== "function")
        return { __err: "Storage provider returned no session storage." };
      return s;
    } catch (e) {
      return { __err: String(e.message || e) };
    }
  };
  const getItem = (s) => {
    try {
      return { raw: s.getItem(key) };
    } catch (e) {
      return { err: `Draft read failed: ${e.message || e}` };
    }
  };
  const read = () => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    const got = getItem(s);
    if (got.err) return unavailable(got.err);
    if (got.raw === null || got.raw === void 0) return { status: "empty" };
    if (got.raw.length > MAX_CHARS) return { status: "invalid", revision: got.raw, message: "Stored draft exceeds size limit." };
    const v = validEnvelope(got.raw, ownerId, sourceId, estimateId);
    if (!v.ok) return { status: "invalid", revision: got.raw, message: v.message };
    if (v.lost) return { status: "invalid", revision: got.raw, savedAt: v.env.savedAt, baseUpdatedAt: v.env.baseUpdatedAt, message: `A browser draft (saved ${v.env.savedAt}) could not be kept \u2014 the browser's per-tab storage refused to store it. Nothing was restored; the saved project is unchanged.` };
    return { status: "found", revision: got.raw, draft: v.data, savedAt: v.env.savedAt, baseUpdatedAt: v.env.baseUpdatedAt, token: v.env.token };
  };
  const write = ({ project, baseUpdatedAt, token, savedAt, expectedRevision }) => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    try {
      if (!isPlain(project)) return { status: "invalid", message: "Draft needs a plain project record." };
      if (project.id !== sourceId) return { status: "invalid", message: `Draft project.id must equal sourceId (${sourceId}).` };
      if (!validId(token)) return { status: "invalid", message: "Draft token must be a nonempty string." };
      if (!validId(baseUpdatedAt)) return { status: "invalid", message: "baseUpdatedAt must be a nonempty string." };
      if (typeof savedAt !== "string" || !Number.isFinite(Date.parse(savedAt))) return { status: "invalid", message: "savedAt must be a valid ISO timestamp string." };
      const data = pickDraft(project);
      const bad = checkAssembly(data);
      if (bad) return { status: "invalid", message: bad };
      const envelope = { version: 1, ownerId, sourceId, estimateId: estimateId ?? null, token, baseUpdatedAt, savedAt, data };
      const serialized = JSON.stringify(envelope);
      const got = getItem(s);
      if (got.err) return unavailable(got.err);
      const leaveLossMarker = (bytes) => {
        try {
          const cur = getItem(s);
          if (cur.err || cur.raw !== null && cur.raw !== void 0) return false;
          const marker = JSON.stringify({ version: 1, ownerId, sourceId, estimateId: estimateId ?? null, token, baseUpdatedAt, savedAt, draftLost: true, droppedBytes: bytes });
          if (marker.length > MAX_CHARS) return false;
          s.setItem(key, marker);
          return true;
        } catch {
          return false;
        }
      };
      if (serialized.length > MAX_CHARS) {
        const marked = leaveLossMarker(serialized.length);
        return { status: "invalid", message: got.raw !== null && got.raw !== void 0 ? "Draft exceeds 1,000,000 character limit; previous draft retained." : `Draft exceeds 1,000,000 character limit.${marked ? " A loss marker was stored so reopening this tab warns." : ""}` };
      }
      if ((got.raw ?? null) !== (expectedRevision ?? null))
        return { status: "conflict", revision: got.raw ?? void 0, message: "Draft changed since expected revision; existing draft retained." };
      try {
        s.setItem(key, serialized);
      } catch (e) {
        const marked = leaveLossMarker(serialized.length);
        const suffix = marked ? " A loss marker was stored so reopening this tab warns." : got.raw !== null && got.raw !== void 0 ? " The previously stored draft was retained." : "";
        return unavailable(`Draft write failed: ${e.message || e}${suffix}`);
      }
      return { status: "stored", revision: serialized, draft: data };
    } catch (e) {
      return { status: "invalid", message: String(e.message || e) };
    }
  };
  const clear = (expectedRevision) => {
    const s = storage();
    if (s.__err) return unavailable(`Draft storage unavailable: ${s.__err}`);
    const got = getItem(s);
    if (got.err) return unavailable(got.err);
    if (got.raw === null || got.raw === void 0) return { status: "removed" };
    if (got.raw !== expectedRevision) return { status: "retained", message: "Draft changed since expected revision; retained." };
    try {
      s.removeItem(key);
    } catch (e) {
      return unavailable(`Draft clear failed: ${e.message || e}`);
    }
    return { status: "removed" };
  };
  return { read, write, clear };
}
var normalizeDraftValue = (value) => {
  if (Array.isArray(value)) return value.map(normalizeDraftValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalizeDraftValue(value[key]);
    return out;
  }, {});
};
function sameFoundationDraftValue(a, b) {
  const emptyA = a === void 0 || a === null || a === "";
  const emptyB = b === void 0 || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    return String(a).trim().replace(/\s+/g, " ") === String(b).trim().replace(/\s+/g, " ");
  }
  return JSON.stringify(normalizeDraftValue(a ?? null)) === JSON.stringify(normalizeDraftValue(b ?? null));
}
var DRAFT_FIELD_LABELS = {
  project_name: "Section name",
  notes: "Notes",
  assembly_schema_version: "Assembly schema",
  items: "Foundation items",
  walls: "Masonry walls",
  poles: "Poles",
  wall_caps: "Wall caps",
  signage_cabinets: "Signage cabinets",
  selected_equipment: "Equipment",
  landscape: "Site landscape",
  project_concrete_type: "Concrete type",
  project_concrete_admixtures: "Concrete admixtures",
  excavation_method: "Excavation method",
  selected_concrete_id: "Concrete supplier",
  ai_engineering_recommendation: "AI recommendation",
  ai_engineering_data: "AI review note",
  design_basis: "Design basis",
  site_hazard: "Site / hazard notes",
  customer_markup_percent: "Customer markup %",
  customer_price_override: "Customer price override",
  customer_pricing: "Applied pricing tier",
  concrete_cost_per_cy: "Concrete $/CY",
  rebar_cost_per_ft: "Rebar $/ft",
  forming_materials_cost_spread_foot: "Forming materials $ (spread foot)",
  forming_materials_cost_pillar: "Forming materials $ (pillar)",
  min_excavation_time_hours: "Min excavation hours",
  hand_dig_excavation_cost_per_cy: "Hand-dig excavation $/CY",
  equipment_excavation_cost_per_cy: "Equipment excavation $/CY",
  forming_labor_rate: "Forming labor rate",
  pouring_labor_rate: "Pouring labor rate",
  finishing_labor_rate: "Finishing labor rate",
  hand_dig_labor_rate: "Hand-dig labor rate",
  equipment_excavation_labor_rate: "Equipment excavation labor rate"
};
function foundationDraftFieldLabel(field) {
  return DRAFT_FIELD_LABELS[field] || field;
}
var clip = (text6, max = 56) => {
  const t = String(text6);
  return t.length > max ? `${t.slice(0, max - 1)}\u2026` : t;
};
var rowCountLabel = (field, n) => {
  const labels = {
    items: ["foundation item", "foundation items"],
    walls: ["wall", "walls"],
    poles: ["pole", "poles"],
    wall_caps: ["wall cap", "wall caps"],
    signage_cabinets: ["signage cabinet", "signage cabinets"],
    selected_equipment: ["equipment row", "equipment rows"],
    project_concrete_admixtures: ["admixture", "admixtures"]
  };
  const [one, many] = labels[field] || ["row", "rows"];
  return `${n} ${n === 1 ? one : many}`;
};
function summarizeFoundationDraftField(field, value) {
  if (value === void 0) return { kind: "absent", text: "\u2014" };
  if (value === null) return { kind: "value", text: "null" };
  if (Array.isArray(value)) return { kind: "rows", count: value.length, text: rowCountLabel(field, value.length) };
  if (typeof value === "object") {
    if (field === "landscape") {
      const cells = value.cells && typeof value.cells === "object" ? Object.keys(value.cells).length : 0;
      return { kind: "record", text: `landscape grid \u2014 ${cells} filled ${cells === 1 ? "cell" : "cells"}` };
    }
    if (field === "customer_pricing") {
      if (value.applied === true) {
        const tier = Number.isFinite(Number(value.tier_number)) ? `tier ${value.tier_number}` : "a pricing tier";
        return { kind: "record", text: `Applied ${tier}` };
      }
      return { kind: "record", text: "No tier applied" };
    }
    if (field === "ai_engineering_data") return { kind: "record", text: "AI review note (recorded)" };
    const keys = Object.keys(value).length;
    return { kind: "record", text: `record (${keys} ${keys === 1 ? "field" : "fields"})` };
  }
  if (typeof value === "boolean") return { kind: "value", text: value ? "yes" : "no" };
  return { kind: "value", text: clip(value) };
}
function diffFoundationDraftFields({ draft, saved }) {
  const safeDraft = isPlain(draft) ? draft : {};
  const safeSaved = isPlain(saved) ? saved : {};
  const rows = [];
  for (const field of FOUNDATION_DRAFT_FIELDS) {
    const hasDraft = Object.hasOwn(safeDraft, field);
    const hasSaved = Object.hasOwn(safeSaved, field);
    if (!hasDraft && !hasSaved) continue;
    const dv = hasDraft ? safeDraft[field] : void 0;
    const sv = hasSaved ? safeSaved[field] : void 0;
    let status;
    if (hasDraft && hasSaved) status = sameFoundationDraftValue(dv, sv) ? "same" : "diverged";
    else status = hasDraft ? "draft_only" : "saved_only";
    rows.push({
      field,
      label: foundationDraftFieldLabel(field),
      status,
      draft: summarizeFoundationDraftField(field, dv),
      saved: summarizeFoundationDraftField(field, sv)
    });
  }
  return rows;
}
function summarizeFoundationDraftConflict({ draft, saved, baseUpdatedAt = null, draftSavedAt = null } = {}) {
  const savedUpdatedAt = isPlain(saved) && typeof saved.updated_date === "string" ? saved.updated_date : null;
  const baseMoved = !!baseUpdatedAt && !!savedUpdatedAt && baseUpdatedAt !== savedUpdatedAt;
  const base2 = {
    baseUpdatedAt: baseUpdatedAt ?? null,
    savedUpdatedAt,
    draftSavedAt: draftSavedAt ?? null,
    baseMoved
  };
  if (!isPlain(draft)) {
    return { ...base2, status: "unverifiable", reason: "draft_unreadable", fields: [], counts: { diverged: 0, draftOnly: 0, savedOnly: 0, same: 0 } };
  }
  if (!isPlain(saved)) {
    return { ...base2, status: "unverifiable", reason: "saved_unreadable", fields: [], counts: { diverged: 0, draftOnly: 0, savedOnly: 0, same: 0 } };
  }
  const fields = diffFoundationDraftFields({ draft, saved });
  const counts = fields.reduce((acc, row) => {
    if (row.status === "diverged") acc.diverged += 1;
    else if (row.status === "draft_only") acc.draftOnly += 1;
    else if (row.status === "saved_only") acc.savedOnly += 1;
    else acc.same += 1;
    return acc;
  }, { diverged: 0, draftOnly: 0, savedOnly: 0, same: 0 });
  const differs = counts.diverged + counts.draftOnly;
  const status = differs > 0 ? baseMoved ? "conflict" : "edits_only" : baseMoved ? "base_moved_identical" : "in_sync";
  return { ...base2, status, fields, counts };
}
function foundationDraftConflictNeedsReview(summary) {
  return ["conflict", "base_moved_identical", "unverifiable"].includes(summary?.status);
}
function foundationDraftRebaseProject({ draft, sourceId } = {}) {
  if (!isPlain(draft) || !validId(sourceId)) return null;
  return { id: sourceId, ...cloneChecked(draft) };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/staff/staffEntities.js
var staffEntities = {};

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/estimateMutationGuard.js
var assertEstimateProductMutationAllowed = () => true;

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/estimatePersistence.js
function normalize3(value) {
  if (Array.isArray(value)) return value.map(normalize3);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize3(value[key]);
    return out;
  }, {});
}
function sameValue3(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize3(a)) === JSON.stringify(normalize3(b));
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
      if (!sameValue3(current[fieldName], guards[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue3(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue3(currentValue, expected[fieldName]) && !sameValue3(currentValue, desired[fieldName])) {
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
      if (afterError && fieldNames.every((fieldName) => sameValue3(afterError[fieldName], desired[fieldName]))) {
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

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/builderPartGroupPersistence.js
var cleanString = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = comparable(value[key]);
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
    return cleanString(a) === cleanString(b);
  }
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}
function matchesPayload2(row, data) {
  return !!row && Object.entries(data || {}).every(([field, value]) => sameValue4(row[field], value));
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
    if (!matchesPayload2(before[0], data)) {
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
    if (created?.id && matchesPayload2(created, data)) return { record: created, status: "created_unverified_lookup" };
    throw new Error(`${label} create outcome could not be verified. Reload before retrying. ${verifyError?.message || "Recovery lookup failed."}`);
  }
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently more than once for the same Product/Group key. No uncertain Part Group was deleted; reload and review the duplicate groups.`);
  }
  if (after.length === 1) {
    if (!matchesPayload2(after[0], data)) {
      throw new Error(`${label} identity exists but its live data does not match this create. No Part Group was overwritten or deleted.`);
    }
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered"
    };
  }
  if (created?.id && matchesPayload2(created, data)) return { record: created, status: "created" };
  if (createError) throw new Error(`${label} could not be created and no matching Part Group was visible on recovery read. Reload before retrying. ${createError?.message || ""}`.trim());
  throw new Error(`${label} create response could not be verified. Reload before retrying.`);
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/builderMutationRecovery.js
var num4 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
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
    return Math.abs(num4(a) - num4(b)) <= 5e-3;
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

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationSyncRecovery.js
var MAX_ID = 200;
var MAX_TS = 64;
var bounded = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
function createFoundationSyncAttempt({ sourceId, estimateId, key, requestedAt }) {
  if (!bounded(sourceId, MAX_ID)) throw new Error("A source project id is required for a sync attempt.");
  if (!bounded(estimateId, MAX_ID)) throw new Error("An estimate id is required for a sync attempt.");
  if (!bounded(key, MAX_ID)) throw new Error("A sync attempt key is required.");
  if (!bounded(requestedAt, MAX_TS) || !ISO_RE.test(requestedAt) || Number.isNaN(Date.parse(requestedAt))) throw new Error("A sync attempt needs a valid ISO timestamp.");
  return { schema_version: 1, key, source_project_id: sourceId, estimate_id: estimateId, requested_at: requestedAt };
}
var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
function validateFoundationSyncAttempt(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  if (a.schema_version !== 1) return false;
  return bounded(a.key, MAX_ID) && bounded(a.source_project_id, MAX_ID) && bounded(a.estimate_id, MAX_ID) && bounded(a.requested_at, MAX_TS) && ISO_RE.test(a.requested_at) && !Number.isNaN(Date.parse(a.requested_at));
}
var attemptShapeOk = validateFoundationSyncAttempt;
var foundationLine = (estimate, sourceId) => {
  const items = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  return items.find((i) => i && i.module_key === "foundation" && i.project_id === sourceId) || null;
};
function foundationSyncRecoveryState({ project, estimateId, estimate }) {
  const attempt = project?.builder_sync_attempt;
  const sourceId = project?.id || "";
  const line = foundationLine(estimate, sourceId);
  const keyedPending = !!(line && line.price_acceptance_pending && line.price_acceptance_pending.key);
  if (attempt === void 0 || attempt === null) {
    return keyedPending ? { status: "pending", message: "A saved Builder sync attempt is still unacknowledged.", attempt: null, line } : { status: "none", message: "", attempt: null, line };
  }
  if (!attemptShapeOk(attempt)) {
    return { status: "unsupported", message: "An unrecognised Builder sync receipt was found and left untouched.", attempt, line };
  }
  if (attempt.source_project_id !== sourceId || !estimateId || attempt.estimate_id !== estimateId || !estimate || estimate.id !== estimateId) {
    return { status: "mismatch", message: "This project's sync receipt belongs to a different estimate context.", attempt, line };
  }
  if (typeof project.updated_date === "string" && project.updated_date && line && line.updated_date_snapshot === project.updated_date && !keyedPending) {
    return { status: "acknowledged", message: "", attempt, line };
  }
  return { status: "pending", message: "A saved Builder sync attempt is still unacknowledged.", attempt, line };
}
function assertFoundationBuilderAcknowledgment({ sourceProject, estimateId, line }) {
  if (!bounded(estimateId, MAX_ID) || !bounded(sourceProject?.id, MAX_ID)) {
    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");
  }
  const ok = !!line && typeof line === "object" && !Array.isArray(line) && line.module_key === "foundation" && line.project_id === sourceProject?.id && typeof sourceProject?.updated_date === "string" && sourceProject.updated_date && line.updated_date_snapshot === sourceProject.updated_date && !(line.price_acceptance_pending && line.price_acceptance_pending.key) && (!estimateId || !line.estimate_id || line.estimate_id === estimateId);
  if (!ok) {
    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");
  }
}
async function resolveFoundationSyncReceiptForSave({ project, estimateId, getEstimate }) {
  const prior = project?.builder_sync_attempt;
  if (prior === void 0 || prior === null) return { ok: true, clearStaleReceipt: false };
  if (!attemptShapeOk(prior) || prior.source_project_id !== project?.id) {
    return { ok: false, error: "An unrecognised Builder sync receipt blocks saving. Reload and retry." };
  }
  if (!!estimateId && prior.estimate_id === estimateId) {
    return { ok: true, clearStaleReceipt: false };
  }
  if (typeof getEstimate !== "function") {
    return { ok: false, error: "This project's Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };
  }
  const named = await Promise.resolve().then(() => getEstimate(prior.estimate_id)).then((row) => row || null).catch((error) => Number(error?.status) === 404 ? null : void 0);
  if (named === void 0) {
    return { ok: false, error: "The estimate named by the saved Builder sync receipt could not be verified. Reload and retry." };
  }
  if (named) {
    return { ok: false, error: "This project's Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };
  }
  return { ok: true, clearStaleReceipt: true };
}
var pendingLineMarker = (line) => {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && !Array.isArray(pending) && String(pending.key || "").trim() ? pending : null;
};
function classifyFoundationSyncRetry({ project, estimateId, estimate } = {}) {
  const state = foundationSyncRecoveryState({ project, estimateId, estimate });
  const line = state.line || null;
  const pending = pendingLineMarker(line);
  const attempt = state.attempt ?? null;
  const base2 = { attempt, line, pendingKey: pending ? String(pending.key) : null, stateStatus: state.status };
  if (state.status === "unsupported") {
    return { ...base2, mode: "blocked_unsupported", retryable: false, reason: state.message || "An unrecognised Builder sync receipt blocks retrying; review it first." };
  }
  if (state.status === "mismatch") {
    return { ...base2, mode: "blocked_mismatch", retryable: false, reason: state.message || "This project's sync receipt belongs to a different estimate context." };
  }
  if (!estimateId) {
    return { ...base2, mode: "blocked_no_estimate", retryable: false, reason: "This project is not linked to an estimate; there is no Builder sync to retry." };
  }
  if (pending) {
    return { ...base2, mode: "resume_pending", retryable: true, reason: "A saved Builder mutation is still in progress; retry resumes its recorded remainder." };
  }
  if (state.status === "pending") {
    return { ...base2, mode: "resync_unacknowledged", retryable: true, reason: state.message || "A saved Builder sync attempt is still unacknowledged." };
  }
  return { ...base2, mode: "none_needed", retryable: false, reason: "" };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/builderService.js
import { getModule, getModuleLabel, MODULE_TOTAL_FIELD } from "@/components/estimator/moduleRegistry";

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/vinylEstimator/vinylNestingCalculator.js
var calculateVinylProject = () => ({ parts: [] });

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/brick/brickCalc.js
var calcBrickStoneProject = () => ({ parts: [] });

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/signMaintenance/maintenanceCalculator.js
var calcServiceItem = () => ({ parts: [] });
var calcProjectTotals = () => ({ parts: [] });

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/customerPricing.js
var acceptedCustomerUnitPrice = () => null;
var liveCustomerUnitPrice = () => null;
var hasNumericValue = () => false;
var manualCustomerPriceState = () => null;
var sourceProjectEconomics = () => null;

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/builderPartPersistence.js
var cleanString2 = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function comparable2(value) {
  if (Array.isArray(value)) return value.map(comparable2);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = comparable2(value[key]);
    return result;
  }, {});
}
function sameValue5(a, b) {
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
function matchesPayload3(row, data) {
  return !!row && Object.entries(data || {}).every(([field, value]) => sameValue5(row[field], value));
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
    if (!matchesPayload3(before[0], data)) {
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
    if (created?.id && matchesPayload3(created, data)) return { record: created, status: "created_unverified_lookup" };
    throw new Error(`${label} create outcome could not be verified. Reload before retrying. ${verifyError?.message || "Recovery lookup failed."}`);
  }
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently more than once for the same Product/Part key. No uncertain Part was deleted; reload and review the duplicate Parts.`);
  }
  if (after.length === 1) {
    if (!matchesPayload3(after[0], data)) {
      throw new Error(`${label} identity exists but its live data does not match this create. No Part was overwritten or deleted.`);
    }
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered"
    };
  }
  if (created?.id && matchesPayload3(created, data)) return { record: created, status: "created" };
  if (createError) throw new Error(`${label} could not be created and no matching Part was visible on recovery read. Reload before retrying. ${createError?.message || ""}`.trim());
  throw new Error(`${label} create response could not be verified. Reload before retrying.`);
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementPartDescriptors.js
var INVALID = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
var fail = (message) => {
  const error = new Error(message);
  error.code = INVALID;
  throw error;
};
var plain2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
var finite5 = (v) => typeof v === "number" && Number.isFinite(v);
var nonnegative3 = (v) => finite5(v) && v >= 0;
var positive4 = (v) => finite5(v) && v > 0;
var nonemptyStr = (v) => typeof v === "string" && v.trim().length > 0;
var safeInt = (v) => Number.isSafeInteger(v);
var clone = (v) => structuredClone(v);
function foundationReinforcementPartDescriptors({ item, itemIndex } = {}) {
  if (!plain2(item)) fail("item must be a plain record.");
  if (!safeInt(itemIndex) || itemIndex < 0) fail("itemIndex must be a non-negative safe integer.");
  if (item.reinforcement_calculation_version !== 2) fail("reinforcement_calculation_version must be 2.");
  const include = item.include_rebar;
  if (include === false || include === null || include === void 0) return [];
  if (typeof include !== "boolean") fail("include_rebar must be a boolean.");
  if (!nonemptyStr(item.component_id)) fail("component_id must be a non-empty string.");
  const design = item.reinforcement_design;
  const material = item.reinforcement_material;
  const snapshot = item.reinforcement_cost_snapshot;
  if (!plain2(design) || design.version !== 2) fail("reinforcement_design.version must be 2.");
  if (!plain2(material)) fail("reinforcement_material must be a record.");
  if (!plain2(snapshot) || snapshot.version !== 1 || snapshot.calculation_version !== 2 || snapshot.engineering_approved !== false) {
    fail("reinforcement_cost_snapshot must be version 1 / calculation_version 2 / unapproved.");
  }
  if (!plain2(snapshot.amounts) || !plain2(snapshot.material) || !plain2(snapshot.basis) || !Array.isArray(snapshot.rate_sources)) {
    fail("reinforcement_cost_snapshot requires amounts/material/basis/rate_sources.");
  }
  const numerics = {
    rebar_feet: nonnegative3,
    rebar_rate: nonnegative3,
    rebar_material_cost: nonnegative3,
    rebar_labor_cost: nonnegative3,
    rebar_labor_hours: nonnegative3,
    rebar_cost: nonnegative3,
    rebar_geometry_feet: positive4,
    rebar_geometry_weight_lbs: positive4,
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
  if (!nonnegative3(item.rebar_weight_lbs)) fail("rebar_weight_lbs must be finite numeric non-negative.");
  for (const [itemField, snapField] of Object.entries(mapping)) {
    if (!nonnegative3(A[snapField]) || item[itemField] !== A[snapField]) fail(`${itemField} must strictly equal snapshot.amounts.${snapField}.`);
  }
  const M = snapshot.material;
  const B = snapshot.basis;
  if (!nonnegative3(B.labor_rate_per_hour)) fail("labor_rate_per_hour must be finite numeric >= 0.");
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
    if (!plain2(S) || !plain2(S.amounts) || S.status !== "resolved") {
      fail("reinforcement_cost_snapshot.supports must be a resolved support resolution when support data is present.");
    }
    const SA = S.amounts;
    for (const f of supportFields) {
      if (!nonnegative3(item[f])) fail(`${f} must be a finite numeric >= 0.`);
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
      if (!nonnegative3(SA[snapField]) || item[itemField] !== SA[snapField]) {
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
        if (!plain2(sel) || !nonemptyStr(sel.name) || !safeInt(sel.units_purchased) || sel.units_purchased <= 0 || !safeInt(sel.units_required) || sel.units_required <= 0 || sel.units_purchased < sel.units_required || !safeInt(sel.pack_size) || sel.pack_size <= 0 || !safeInt(sel.packs) || sel.packs <= 0 || sel.packs * sel.pack_size !== sel.units_purchased || !nonnegative3(sel.material_cost) || !nonnegative3(sel.unit_cost)) {
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

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementFrozenPricing.js
var plain3 = (value) => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
var nonnegative4 = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var positive5 = (value) => nonnegative4(value) && value > 0;
var text5 = (value) => typeof value === "string" && value.trim().length > 0;
var product = (a, b, amount2) => {
  const result = a * b;
  return Number.isFinite(result) && !(a > 0 && b > 0 && result === 0) && result === amount2;
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
  if (!plain3(frame) || frame.version !== 1) fail2("unsupported record/version.");
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
    if (!nonnegative4(value)) fail2("quantity, rates and amounts must be finite nonnegative numbers.");
  }
  if (!product(frame.quantity, frame.unit_cost, frame.extended_cost)) fail2("quantity times rate does not match amount.");
  if (frame.unit_cost !== unitCost || frame.extended_cost !== extendedCost) fail2("stored amounts do not match frozen fields.");
  const r = frame.reinforcement_snapshot;
  if (!plain3(r) || r.version !== 1 || r.calculation_version !== 2 || !text5(r.component_id) || r.engineering_approved !== false || r.procurement_ready !== false) fail2("invalid preliminary provenance.");
  const a = r.amounts, m = r.material;
  if (!plain3(a) || !plain3(m)) fail2("missing amount/material snapshots.");
  if (!plain3(frame.pricing_basis) || frame.pricing_basis.unit !== "ft" || frame.pricing_basis.cost_per_ft !== m.cost_per_ft || frame.pricing_basis.labor_rate_per_hour !== frame.labor_rate_per_hour || !Array.isArray(frame.rate_sources) || frame.rate_sources.some((source) => !plain3(source) || !text5(source.key) || !text5(source.source) || !nonnegative4(source.value))) fail2("invalid rate provenance.");
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
    if (!nonnegative4(a[key])) fail2(`invalid ${key}.`);
  }
  if (!positive5(a.geometry_feet) || !positive5(a.geometry_weight_lbs) || !Number.isSafeInteger(a.connection_count)) fail2("invalid geometry/connection quantities.");
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
  if (m.pricing_unit !== "ft" || !nonnegative4(m.cost_per_ft) || !positive5(m.bar_diameter_inches) || !positive5(m.weight_lb_per_ft)) fail2("unknown material metadata.");
  if (m.kind === "catalog") {
    if (!text5(m.inventory_id)) fail2("missing catalog identity.");
    if (m.cost_per_ft === 0 && (frame.zero_rate_authored !== true || m.rate_source !== "custom_rebar_cost_per_ft")) {
      fail2("catalog zero has no authored provenance.");
    }
  } else if (m.kind === "manual") {
    if (!text5(m.reason) || m.inventory_id !== null && m.inventory_id !== void 0 && m.inventory_id !== "") fail2("invalid manual basis.");
  } else fail2("unsupported material kind.");
  if (a.material_cost + a.labor_cost !== a.steel_cost || !product(a.priced_feet, m.cost_per_ft, a.material_cost) || !product(a.labor_hours, frame.labor_rate_per_hour, a.labor_cost)) fail2("snapshot costs do not reconcile.");
  const supportsSnap = r.supports;
  if (supportMaterial) {
    if (!plain3(supportsSnap) || !plain3(supportsSnap.amounts) || !Array.isArray(supportsSnap.selections)) {
      fail2("missing support snapshot.");
    }
    const sel = supportsSnap.selections[frame.support_selection_index];
    if (!plain3(sel) || frame.quantity !== sel.units_purchased || frame.unit_cost !== sel.unit_cost || frame.extended_cost !== sel.material_cost) fail2("support material amounts do not match the snapshot.");
  } else if (supportLabor) {
    if (!plain3(supportsSnap) || !plain3(supportsSnap.amounts)) fail2("missing support snapshot.");
    if (frame.quantity !== supportsSnap.amounts.support_labor_hours || frame.unit_cost !== frame.labor_rate_per_hour || frame.extended_cost !== supportsSnap.amounts.support_labor_cost) {
      fail2("support labor amounts do not match the snapshot.");
    }
  } else {
    const material = frame.part_type === "material";
    if (frame.quantity !== (material ? a.priced_feet : a.labor_hours) || frame.unit_cost !== (material ? m.cost_per_ft : frame.labor_rate_per_hour) || frame.extended_cost !== (material ? a.material_cost : a.labor_cost)) fail2("role amounts do not match the snapshot.");
  }
}
function captureFoundationReinforcementFrozenPricing(part) {
  if (!plain3(part)) fail2("part must be a plain record.");
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
  if (!plain3(part)) fail2("part must be a plain record.");
  const frame = part.pricing_basis_snapshot?.reinforcement_frozen_pricing;
  if (frame === void 0 || frame === null) return { version: 1, state: "unrecorded" };
  validate(frame, part.frozen_unit_cost, part.frozen_extended_cost);
  if (frame.state === "recorded" && frame.part_type !== part.part_type) fail2("stored role does not match part.");
  return structuredClone(frame);
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/partSync.js
var num5 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
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
  if (!row) return num5(part?.current_unit_cost, num5(part?.frozen_unit_cost));
  const entity = part?.inventory_entity || "";
  const mode = part?.pricing_basis_snapshot?.pricing_mode || row.pricing_mode || row.pole_pricing_mode || row.unit_type || "";
  if (entity === "DimensionalLetterMaterial") return num5(row.cost_per_sheet);
  if (entity === "VinylInventory") {
    if (mode === "per_sqft") return num5(row.cost_per_sqft);
    if (mode === "per_linear_foot") return num5(row.cost_per_linear_foot);
    return num5(row.cost_per_roll);
  }
  if (entity === "LaborServiceInventory") return num5(row.default_rate);
  if (entity === "ChannelLetterInstallInventory") {
    if (mode === "per_raceway_foot") return num5(row.cost_per_foot);
    if (mode === "per_project_flat") return num5(row.cost_flat);
    if (mode === "per_letter_by_size") {
      const size = part?.pricing_basis_snapshot?.letter_size || "medium";
      return num5(row[`cost_${size}`], num5(row.cost_medium || row.cost_per_letter));
    }
    return num5(row.cost_per_letter);
  }
  if (entity === "ChannelLetterInstallEquipment") {
    if (mode === "delivery_pickup") return num5(row.delivery_pickup_cost);
    if (mode === "idle_running") return num5(row.idle_running_cost_per_hour);
    if (mode === "per_hour") return num5(row.cost_per_hour);
    if (mode === "per_week") return num5(row.cost_per_week);
    if (mode === "per_month") return num5(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num5(row.cost_flat);
    return num5(row.cost_per_day);
  }
  if (entity === "MaintenanceInventory") {
    const size = part?.pricing_basis_snapshot?.size || "medium";
    if (mode === "per_letter_flat") return num5(row.cost_per_letter);
    if (mode === "per_letter_by_size" || mode === "per_cabinet_by_size") return num5(row[`cost_${size}`]);
    if (mode === "per_cabinet_flat") return num5(row.cost_per_cabinet);
    if (mode === "per_linear_foot") return num5(row.cost_per_foot);
    if (mode === "per_sqft") return num5(row.cost_per_sqft);
    return num5(row.cost_flat);
  }
  if (entity === "MaintenanceEquipment") {
    if (mode === "delivery_pickup") return num5(row.delivery_pickup_cost);
    if (mode === "idle_running") return num5(row.idle_running_cost_per_hour);
    if (mode === "per_hour") return num5(row.cost_per_hour);
    if (mode === "per_week") return num5(row.cost_per_week);
    if (mode === "per_month") return num5(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num5(row.cost_flat);
    return num5(row.cost_per_day);
  }
  if (entity === "FoundationInventory") {
    if (row.material_type === "pole" && mode === "stock_price") return num5(row.pole_stock_price);
    if (row.material_type === "wall_cap") return num5(row.cap_stock_price || row.cost_per_unit);
    if (["excavation_equipment", "attachment", "sub_attachment"].includes(row.material_type)) {
      if (mode === "pickup_delivery") return num5(row.pickup_delivery_cost);
      if (mode === "per_week") return num5(row.cost_per_week);
      if (mode === "per_month") return num5(row.cost_per_month);
      if (mode === "per_hour") return num5(row.cost_per_hour);
      return num5(row.cost_per_day || row.cost_per_unit);
    }
    return num5(row.cost_per_unit);
  }
  return num5(row.cost_per_unit ?? row.default_rate ?? row.cost_flat ?? row.cost_per_sheet, genericUnitCost(row));
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
  quantity: quantity3 = 1,
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
    quantity: num5(quantity3, 1),
    unit,
    unit_cost: num5(unitCost),
    extended_cost: num5(extendedCost),
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
    (item.materials || []).forEach((mat2, matIndex) => {
      const id = mat2.inventory_item_id || mat2.inventory_id || "";
      parts.push(makePart({
        key: `channel:item:${itemIndex}:material:${matIndex}`,
        name: mat2.item_name || "Install material",
        type: "material",
        subtype: mat2.pricing_mode || "install_material",
        sourcePath: mat2.inventory_item_id ? `items[${itemIndex}].materials[${matIndex}].inventory_item_id` : `items[${itemIndex}].materials[${matIndex}].inventory_id`,
        entity: "ChannelLetterInstallInventory",
        inventoryId: id,
        quantity: mat2.quantity,
        unit: mat2.pricing_mode || "",
        unitCost: mat2.unit_cost,
        extendedCost: mat2.total_cost,
        builderData: { parent_item: item.description, installation_type: item.installation_type, letter_size: item.letter_size, qty_letters: item.qty_letters },
        calculation: mat2,
        pricingBasis: { pricing_mode: mat2.pricing_mode, letter_size: item.letter_size, installation_type: item.installation_type }
      }));
    });
  });
  const personnelRowsTotal = (project.personnel || []).reduce(
    (sum, person) => sum + num5(person.total_cost, num5(person.hourly_rate) * num5(person.hours)),
    0
  );
  const personnelTotal = hasNumber(project.total_personnel_cost) ? num5(project.total_personnel_cost) : personnelRowsTotal;
  const installLaborInSubtotal = hasNumber(project.labor_cost_in_subtotal) ? num5(project.labor_cost_in_subtotal) : personnelTotal > 5e-3 ? 0 : num5(project.labor_cost, (project.items || []).reduce((sum, item) => sum + num5(item.labor_cost), 0));
  if (Math.abs(installLaborInSubtotal) > 5e-3) {
    let representedLabor = 0;
    (project.items || []).forEach((item, index) => {
      const cost = num5(item.labor_cost);
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
    const duration = Math.max(num5(eq.duration, 1), 0);
    const baseCost = num5(eq.unit_cost) * duration;
    const owned = eq.ownership === "owned" || eq.pricing_mode === "owned_flat";
    const deliveryCost = !owned && eq.include_delivery ? num5(eq.delivery_pickup_cost) : 0;
    const idleCost = hasNumber(eq.idle_cost) ? num5(eq.idle_cost) : num5(eq.idle_hours) * num5(eq.idle_running_cost_per_hour);
    const total = num5(eq.total_cost, baseCost + deliveryCost + idleCost);
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
  if (personnelTotal > 5e-3 || (project.personnel || []).some((person) => num5(person.total_cost) > 5e-3)) {
    let representedPersonnel = 0;
    (project.personnel || []).forEach((person, index) => {
      const cost = num5(person.total_cost, num5(person.hourly_rate) * num5(person.hours));
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
    const qty2 = Math.max(num5(purchase.qty, 1), 0);
    const materialCost = num5(fab.unit_material_cost) * qty2;
    const cutCost = num5(fab.unit_cut_cost) * qty2;
    const paintCost = num5(fab.unit_paint_cost) * qty2;
    let represented = 0;
    if (Math.abs(materialCost) > 5e-3 || fab.material_id) {
      const materialRate = num5(fab.material_cost_per_sqin);
      const materialSqinPerUnit = materialRate > 0 ? num5(fab.unit_material_cost) / materialRate : num5(purchase.size_value) * 144;
      const materialQty = materialSqinPerUnit > 0 ? materialSqinPerUnit * qty2 : qty2 || 1;
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
        unitCost: materialSqinPerUnit > 0 ? materialRate : num5(fab.unit_material_cost),
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
        quantity: qty2 || 1,
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
        quantity: qty2 || 1,
        unit: "unit",
        builderData: purchase,
        calculation: fab
      }));
      represented += paintCost;
    }
    const residual = num5(total) - represented;
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
    const qty2 = Math.max(num5(purchase.qty, 1), 0);
    const purchaseTotal = hasNumber(purchase.total_cost) ? num5(purchase.total_cost) : num5(purchase.line_total);
    const racewayTotal = num5(purchase.raceway_total);
    const backerTotal = num5(purchase.backer_total);
    const lettersTotal = hasNumber(purchase.letters_total) ? num5(purchase.letters_total) : purchaseTotal - racewayTotal - backerTotal;
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
      const size = Math.max(num5(purchase.size_value), 0);
      const effectiveQty = size > 0 ? size * Math.max(qty2, 1) : Math.max(qty2, 1);
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
      const racewayQty = Math.max(num5(purchase.raceway_qty, 1), 1);
      const racewayLength = Math.max(num5(purchase.raceway_length_feet), 0);
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
          quantity: qty2 || 1,
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
    if (Math.abs(num5(cost)) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `channel:letter-fee:${key}`,
      name,
      type: key === "permitting" ? "permit" : "service",
      subtype: `letter_${key}`,
      sourcePath: `letters_${key.replaceAll("-", "_")}_fee`,
      cost
    }));
  });
  const letterMarkup = num5(project.total_letters_cost) - num5(project.letters_subtotal);
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
  if (Math.abs(num5(project.total_supplies_cost)) > 5e-3) {
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
  if (Math.abs(num5(project.total_travel_cost)) > 5e-3) {
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
  if (Math.abs(num5(project.markup_amount)) > 5e-3) {
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
  const authoritativeTotal = num5(project.total_cost);
  const representedTotal = parts.reduce((sum, part) => sum + num5(part.extended_cost), 0);
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
        unitCost: item.vinyl_sqft ? num5(item.vinyl_cost) / num5(item.vinyl_sqft, 1) : 0,
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
        unitCost: item.laminate_sqft ? num5(item.laminate_cost) / num5(item.laminate_sqft, 1) : 0,
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
    if (num5(item.print_cost) > 5e-3) {
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
    if (num5(item.labor_cost) > 5e-3) {
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
  if (num5(project.total_supplies_cost) > 5e-3) {
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
  if (num5(project.markup_amount) > 5e-3) {
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
    quantity: quantity3 = 1,
    unit = "job",
    cost = 0,
    builderData = {},
    calculation = {},
    pricingBasis = {},
    includeZero = false
  }) => {
    const extended = num5(cost);
    if (!includeZero && Math.abs(extended) <= 5e-3) return;
    const qty2 = Math.max(num5(quantity3, 1), 1e-6);
    parts.push(makePart({
      key,
      name,
      type,
      subtype,
      sourcePath,
      entity,
      inventoryId,
      quantity: qty2,
      unit,
      unitCost: extended / qty2,
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
      overrideGutterH: workflow.gutter_h_override === "" || workflow.gutter_h_override == null ? void 0 : num5(workflow.gutter_h_override),
      overrideGutterV: workflow.gutter_v_override === "" || workflow.gutter_v_override == null ? void 0 : num5(workflow.gutter_v_override),
      printQuality: workflow.print_quality || printer?.default_print_quality || "high_quality",
      weedingDifficulty: workflow.weeding_difficulty || "moderate",
      weedingMinutesPerPartOverride: workflow.weeding_minutes_per_part_override,
      installMinutesPerPart: workflow.install_minutes_per_part,
      personnel: workflow.personnel || [],
      spoilageBufferPercent: num5(workflow.spoilage_buffer_percent),
      setupFeeFloor: num5(workflow.setup_fee_floor)
    });
    workflowMaterialTotal += num5(calc.materialCost);
    workflowMachineTotal += num5(calc.machineCost);
    workflowLaborTotal += num5(calc.laborCost);
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
        quantity: num5(calc.printMinutes) / 60 || 1,
        unit: num5(calc.printMinutes) > 0 ? "hour" : "job",
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
        quantity: num5(calc.cutMinutes) || 1,
        unit: num5(calc.cutMinutes) > 0 ? "minute" : "job",
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
        quantity: num5(calc.cutMinutes) / 60 || 1,
        unit: num5(calc.cutMinutes) > 0 ? "hour" : "job",
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
        quantity: num5(calc.laminateMinutes) / 60 || 1,
        unit: num5(calc.laminateMinutes) > 0 ? "hour" : "job",
        cost: calc.laminateMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { laminate_minutes: calc.laminateMinutes, laminate_machine_cost: calc.laminateMachineCost }
      });
    }
    let workflowPersonnelTotal = 0;
    (workflow.personnel || []).forEach((person, personIndex) => {
      const personCost = num5(person.total_cost, num5(person.hourly_rate) * num5(person.hours));
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
    const laborResidual = num5(calc.laborCost) - workflowPersonnelTotal;
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
    if (num5(calc.setupFeeApplied) > 5e-3) {
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
  const baseSupplies = workflowMaterialTotal * (num5(project.supplies_percent_of_materials) / 100);
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
  if (num5(project.extra_supplies_cost) > 5e-3) {
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
    const cost = num5(entry.total_cost);
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
    const cost = num5(person.total_cost, num5(person.hourly_rate) * num5(person.hours));
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
  const travelTotal = num5(project.total_travel_cost);
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
  const suppliesTotal = baseSupplies + num5(project.extra_supplies_cost);
  const subtotal = workflowMaterialTotal + workflowMachineTotal + workflowLaborTotal + equipmentTotal + projectPersonnelTotal + travelTotal + suppliesTotal;
  const markup = subtotal * (num5(project.markup_percent) / 100);
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
    const authoritativeTotal = num5(project.total_cost);
    const representedTotal = parts.reduce((sum, part) => sum + num5(part.extended_cost), 0);
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
    const itemQty = Math.max(num5(item.quantity, 1), 1e-6);
    const lengthPerUnit = num5(item.material_length_ft);
    const materialExtended = num5(item.material_cost) * itemQty;
    represented.material += materialExtended;
    if (Math.abs(materialExtended) > 5e-3 || item.inventory_item_id) {
      const linkedUsageQty = lengthPerUnit > 0 ? lengthPerUnit * itemQty : itemQty;
      const frozenMaterialUnitCost = lengthPerUnit > 0 ? num5(item.material_cost) / Math.max(lengthPerUnit, 1e-6) : num5(item.material_cost);
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
    const suppliesExtended = num5(item.supplies_cost) * itemQty;
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
      const extended = num5(perItemCost) * itemQty;
      represented[key] += extended;
      if (Math.abs(extended) <= 5e-3) return;
      const totalHours = num5(hoursPerItem) * itemQty;
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
    material: project.total_material_cost == null ? represented.material : num5(project.total_material_cost),
    supplies: project.total_supplies_cost == null ? represented.supplies : num5(project.total_supplies_cost),
    fabrication: project.total_fabrication_cost == null ? represented.fabrication : num5(project.total_fabrication_cost),
    welding: project.total_welding_cost == null ? represented.welding : num5(project.total_welding_cost),
    finishing: project.total_finishing_cost == null ? represented.finishing : num5(project.total_finishing_cost)
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
  const calculatedBricks = liveCalc ? liveCalc.calculated_bricks : num5(project.calculated_bricks);
  const materialCost = liveCalc ? liveCalc.material_cost : num5(project.material_cost);
  const mortarBags = liveCalc ? liveCalc.mortar_bags_needed : num5(project.mortar_bags_needed);
  const mortarCost = liveCalc ? liveCalc.mortar_cost : num5(project.mortar_cost);
  const laborHours = liveCalc ? liveCalc.labor_hours : num5(project.labor_hours);
  const laborCost = liveCalc ? liveCalc.labor_cost : num5(project.labor_cost);
  const markupAmount = liveCalc ? liveCalc.markup_amount : num5(project.markup_amount);
  if (selectedId) {
    const qty2 = Math.max(calculatedBricks, 1);
    parts.push(makePart({
      key: "brick:primary-material",
      name: project.material_name || liveRow?.material_name || "Brick / Stone Material",
      type: "material",
      subtype: liveRow?.wall_material_subtype || liveRow?.material_type || "brick_stone",
      sourcePath: "selected_material_id",
      entity,
      inventoryId: selectedId,
      quantity: qty2,
      unit: "unit",
      unitCost: qty2 ? materialCost / qty2 : 0,
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
    const represented = parts.reduce((sum, part) => sum + num5(part.extended_cost), 0);
    const residual = num5(project.total_cost) - represented;
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
  const duration = Math.max(num5(entry.duration, 1), 0);
  const unitCost = independentPartUnitCost({
    inventory_entity: entity,
    pricing_basis_snapshot: { pricing_mode: pricingMode }
  }, row);
  const owned = row.ownership === "owned" || ["owned_flat", "per_project_flat"].includes(pricingMode);
  const delivery = !owned && entry.include_delivery ? num5(row.delivery_pickup_cost) : 0;
  const idleRate = num5(row.idle_running_cost_per_hour);
  const idleHours = num5(entry.idle_hours);
  const idleCost = idleRate * idleHours;
  return {
    ...entry,
    inventory_entity: entity,
    equipment_name: row.equipment_name || entry.equipment_name,
    equipment_type: row.equipment_type || entry.equipment_type,
    pricing_mode: pricingMode,
    ownership: row.ownership || entry.ownership,
    unit_cost: unitCost,
    delivery_pickup_cost: num5(row.delivery_pickup_cost),
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
    (item.materials || []).forEach((mat2, matIndex) => {
      const ruleId = mat2.maintenance_rule_id || (!mat2.inventory_entity ? mat2.inventory_item_id || mat2.inventory_id || "" : "");
      const rule = ruleId ? catalogs.MaintenanceInventory?.byId.get(ruleId) : null;
      const linkedEntity = mat2.inventory_entity || rule?.inventory_entity || "";
      const linkedId = linkedEntity ? mat2.inventory_item_id || rule?.inventory_item_id || "" : "";
      const inventoryEntity = linkedEntity || (ruleId ? "MaintenanceInventory" : "");
      const inventoryId = linkedEntity ? linkedId : ruleId;
      const row = linkedEntity ? catalogs[linkedEntity]?.byId?.get(linkedId) : rule;
      const quantity3 = num5(mat2.quantity, 0);
      const unitCost = num5(mat2.unit_cost);
      const extendedCost = mat2.total_cost == null ? quantity3 * unitCost : num5(mat2.total_cost);
      itemMaterialParts += extendedCost;
      represented.materials += extendedCost;
      if (Math.abs(extendedCost) <= 5e-3 && !inventoryId) return;
      parts.push(makePart({
        key: `maintenance:item:${itemIndex}:material:${matIndex}`,
        name: mat2.item_name || (linkedEntity && row ? rowName(linkedEntity, row) : rule?.item_name) || "Maintenance Material",
        type: "material",
        subtype: mat2.pricing_mode || row?.pricing_mode || rule?.pricing_mode || "maintenance_material",
        sourcePath: linkedEntity ? `items[${itemIndex}].materials[${matIndex}].inventory_item_id` : ruleId ? `items[${itemIndex}].materials[${matIndex}].maintenance_rule_id` : `items[${itemIndex}].materials[${matIndex}]`,
        entity: inventoryId ? inventoryEntity : "",
        inventoryId,
        quantity: quantity3 || 1,
        unit: mat2.unit || row?.unit || rule?.unit || mat2.pricing_mode || row?.pricing_mode || rule?.pricing_mode || "unit",
        unitCost,
        extendedCost,
        builderData: { sign: item.description, sign_type: item.sign_type, size: item.size, actions: item.actions || [], maintenance_rule_id: ruleId, maintenance_rule: rule || null, material: mat2 },
        calculation: { ...mat2, maintenance_rule_id: ruleId, saved_total_cost: extendedCost },
        pricingBasis: { pricing_mode: mat2.pricing_mode || row?.pricing_mode || row?.pole_pricing_mode || row?.unit_type || rule?.pricing_mode || "", size: item.size, sign_type: item.sign_type, actions: item.actions || [], usage_basis: mat2.usage_basis || rule?.usage_basis || "", usage_multiplier: mat2.usage_multiplier ?? rule?.usage_multiplier }
      }));
    });
    const authoritativeItemMaterials = item.materials_cost == null ? itemMaterialParts : num5(item.materials_cost);
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
    const laborCost = num5(item.labor_cost);
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
    const duration = num5(eq.duration, 1);
    const baseCost = num5(eq.unit_cost) * duration;
    const deliveryCost = eq.include_delivery ? num5(eq.delivery_pickup_cost) : 0;
    const idleCost = eq.idle_cost == null ? num5(eq.idle_running_cost_per_hour) * num5(eq.idle_hours) : num5(eq.idle_cost);
    const reconstructed = baseCost + deliveryCost + idleCost;
    const authoritativeEquipment = eq.total_cost == null ? reconstructed : num5(eq.total_cost);
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
      const idleHours = num5(eq.idle_hours, 1);
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
    const cost = person.total_cost == null ? num5(person.hourly_rate) * num5(person.hours) : num5(person.total_cost);
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
  const totalSupplies = num5(project.total_supplies_cost);
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
  const totalTravel = num5(project.total_travel_cost);
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
  const totalMarkup = num5(project.markup_amount);
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
    labor: project.labor_cost == null ? represented.labor : num5(project.labor_cost),
    materials: project.total_materials_cost == null ? represented.materials : num5(project.total_materials_cost),
    equipment: project.total_equipment_cost == null ? represented.equipment : num5(project.total_equipment_cost),
    personnel: project.total_personnel_cost == null ? represented.personnel : num5(project.total_personnel_cost)
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
  const reconstructedTotal = Object.values(represented).reduce((sum, value) => sum + num5(value), 0);
  if (project.total_cost != null) {
    const finalAdjustment = num5(project.total_cost) - reconstructedTotal;
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
function manualCostPart({ key, name, type = "labor", subtype = "", sourcePath = "", cost = 0, quantity: quantity3 = 1, unit = "job", builderData = {}, calculation = {} }) {
  const extended = num5(cost);
  const qty2 = Math.max(num5(quantity3, 1), 1e-6);
  return makePart({
    key,
    name,
    type,
    subtype,
    sourcePath,
    quantity: qty2,
    unit,
    unitCost: extended / qty2,
    extendedCost: extended,
    builderData,
    calculation
  });
}
function foundationSavedSectionTotal(...candidates) {
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
function foundationEquipmentBreakdown(entry, catalogs) {
  const equipmentRow = catalogs.FoundationInventory?.byId.get(entry.equipment_id);
  if (!equipmentRow) return { baseRental: num5(entry.equipment_cost), delivery: 0, attachmentCosts: [], subAttachmentCosts: [], total: num5(entry.equipment_cost) };
  const rentalPeriod = entry.rental_period || "day";
  const duration = entry.custom_qty !== void 0 && entry.custom_qty !== null ? num5(entry.custom_qty, 1) : num5(entry.rental_duration, 1);
  const rateFor = (row, override = void 0) => {
    if (override !== void 0 && override !== null) return num5(override) * duration;
    if (rentalPeriod === "day") return num5(row?.cost_per_day) * duration;
    if (rentalPeriod === "week") return num5(row?.cost_per_week) * duration;
    if (rentalPeriod === "month") return num5(row?.cost_per_month) * duration;
    return 0;
  };
  const attachmentQty = /* @__PURE__ */ new Map();
  if (entry.attachments?.length) {
    entry.attachments.forEach((attachment) => {
      const id = attachment.id || attachment.inventory_id || "";
      if (id) attachmentQty.set(id, num5(attachment.qty, 1));
    });
  } else if (entry.attachment_counts) {
    Object.entries(entry.attachment_counts).forEach(([id, qty2]) => attachmentQty.set(id, num5(qty2, 0)));
  } else if (entry.attachment_ids?.length) {
    entry.attachment_ids.forEach((id) => attachmentQty.set(id, 1));
  }
  const attachmentCosts = [...attachmentQty.entries()].map(([id, quantity3]) => {
    const row = catalogs.FoundationInventory?.byId.get(id);
    return { id, row, quantity: quantity3, cost: rateFor(row) * quantity3, attachment: { id, qty: quantity3 } };
  }).filter((entry2) => entry2.quantity > 0);
  const subAttachmentCosts = Object.entries(entry.sub_attachment_counts || {}).map(([id, qty2]) => {
    const quantity3 = num5(qty2, 0);
    const row = catalogs.FoundationInventory?.byId.get(id);
    return { id, row, quantity: quantity3, cost: rateFor(row) * quantity3, attachment: { id, qty: quantity3 } };
  }).filter((entry2) => entry2.quantity > 0);
  const baseRental = rateFor(equipmentRow, entry.custom_rate);
  const delivery = entry.include_delivery ? entry.custom_delivery_charge !== void 0 && entry.custom_delivery_charge !== null ? num5(entry.custom_delivery_charge) : num5(equipmentRow.pickup_delivery_cost) : 0;
  const total = baseRental + delivery + attachmentCosts.reduce((sum, item) => sum + item.cost, 0) + subAttachmentCosts.reduce((sum, item) => sum + item.cost, 0);
  return { baseRental, delivery, attachmentCosts, subAttachmentCosts, total };
}
function extractFoundation(project, catalogs) {
  const parts = [];
  const rows = (v) => Array.isArray(v) ? v.filter((r) => r && typeof r === "object") : [];
  project = {
    ...project || {},
    items: rows(project?.items),
    walls: rows(project?.walls),
    poles: rows(project?.poles),
    wall_caps: rows(project?.wall_caps),
    selected_equipment: rows(project?.selected_equipment),
    signage_cabinets: rows(project?.signage_cabinets),
    project_concrete_admixtures: Array.isArray(project?.project_concrete_admixtures) ? project.project_concrete_admixtures : []
  };
  (project.items || []).forEach((item, index) => {
    const concreteId = item.selected_concrete_id || project.selected_concrete_id || "";
    if (concreteId) {
      const entity = findEntity(catalogs, concreteId, "FoundationInventory");
      const concreteRow = findRow(catalogs, entity, concreteId);
      if (concreteRow?.material_type === "bagged_concrete" || num5(item.concrete_cost) > 0) {
        const qty2 = item.concrete_bags || item.concrete_volume_cy || item.quantity || 1;
        parts.push(makePart({
          key: `foundation:item:${index}:concrete`,
          name: item.description ? `${item.description} \u2014 Concrete` : "Concrete",
          type: "material",
          subtype: concreteRow?.material_type || "concrete",
          sourcePath: `items[${index}].selected_concrete_id`,
          entity,
          inventoryId: concreteId,
          quantity: qty2,
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
        const rebarRate = num5(item.rebar_rate, num5(item.custom_rebar_cost_per_ft, genericUnitCost(rebarRow)));
        const rebarFeet = num5(item.rebar_feet);
        const totalRebarCost = num5(item.rebar_cost);
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
      const formingQty = num5(item.forming_qty, 1);
      const formingRate = num5(item.forming_rate, num5(item.custom_forming_rate, genericUnitCost(formingRow)));
      const totalFormingCost = num5(item.forming_cost);
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
    if (num5(item.excavation_cost) > 5e-3) {
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
    if (num5(item.pouring_cost) > 5e-3) {
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
    if (num5(item.finishing_cost) > 5e-3) {
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
  const itemConcreteCost = (project.items || []).reduce((sum, item) => sum + num5(item.concrete_cost), 0);
  const fallbackDeliveryCost = Math.max(0, num5(project.total_concrete_cost) - itemConcreteCost);
  const deliveryCost = num5(delivery.concreteTotal, fallbackDeliveryCost);
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
      const roundedYards = num5(delivery.roundedYards, 0);
      const selectedMix = (delivery.availableMixes || []).find((mix) => mix.id === project.project_concrete_type) || (delivery.availableMixes || []).find((mix) => mix.id === "4000_ae");
      const mixPrice = num5(selectedMix?.price, num5(delivery.ratePerYard));
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
        const rate = num5(admix?.price);
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
        const smallLoadFee = num5(truck.smallOrderFee);
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
        const fuelFee = num5(truck.fuelFee);
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
      const additionalStopsCost = num5(delivery.additionalStopsCost);
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
        // CMP-D03: poured-concrete snapshots carry materialQuantityUnit "cy"
        // — the part unit mirrors the recorded basis instead of always
        // claiming a unit count.
        unit: wall.calculatedCosts?.materialQuantityUnit === "cy" ? "cy" : "unit",
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
        unit: wall.calculatedCosts?.internalMaterialQuantityUnit === "cy" ? "cy" : "unit",
        extendedCost: wall.calculatedCosts?.internalMaterialCost,
        builderData: wall,
        calculation: wall.calculatedCosts || {}
      }));
    }
    if (num5(wall.calculatedCosts?.mortarCost) > 5e-3) {
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
    if (num5(wall.calculatedCosts?.laborCost) > 5e-3) {
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
    if (num5(wall.calculatedCosts?.internalMortarCost) > 5e-3) {
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
    if (num5(wall.calculatedCosts?.internalLaborCost) > 5e-3) {
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
    const totalPoleInches = num5(pole.height_inches) + num5(pole.y_offset_inches);
    const poleQtyFt = totalPoleInches / 12 || 1;
    const isStock = row?.pole_pricing_mode === "stock_price";
    const stockLengthFt = num5(row?.pole_stock_length_ft, 20);
    const stockPieces = isStock ? Math.max(1, Math.ceil(totalPoleInches / Math.max(stockLengthFt * 12, 1))) : null;
    const partQty = isStock ? stockPieces : poleQtyFt;
    const partUnitCost = isStock ? num5(pole.custom_cost_per_unit, num5(row?.pole_stock_price)) : num5(pole.custom_cost_per_unit, num5(row?.cost_per_unit));
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
    if (num5(pole.pole_painting_cost) > 5e-3) {
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
    const qty2 = eq.custom_qty ?? eq.rental_duration ?? 1;
    if (eq.equipment_id) {
      parts.push(makePart({
        key: `foundation:equipment:${index}`,
        name: equipmentRow?.material_name || "Foundation Equipment",
        type: "equipment",
        subtype: "excavation_equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: "FoundationInventory",
        inventoryId: eq.equipment_id,
        quantity: qty2,
        unit: eq.rental_period || "day",
        unitCost: num5(breakdown.baseRental) / Math.max(num5(qty2, 1), 1),
        extendedCost: breakdown.baseRental,
        builderData: eq,
        calculation: { ...eq, equipment_total_with_attachments: eq.equipment_cost, base_equipment_cost: breakdown.baseRental },
        pricingBasis: { pricing_mode: `per_${eq.rental_period || "day"}` }
      }));
    }
    if (eq.equipment_id && Math.abs(num5(breakdown.delivery)) > 5e-3) {
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
        quantity: entry.quantity * Math.max(num5(qty2, 1), 1),
        unit: eq.rental_period || "day",
        unitCost: entry.quantity * Math.max(num5(qty2, 1), 1) ? entry.cost / (entry.quantity * Math.max(num5(qty2, 1), 1)) : entry.cost,
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
        quantity: entry.quantity * Math.max(num5(qty2, 1), 1),
        unit: eq.rental_period || "day",
        unitCost: entry.quantity * Math.max(num5(qty2, 1), 1) ? entry.cost / (entry.quantity * Math.max(num5(qty2, 1), 1)) : entry.cost,
        extendedCost: entry.cost,
        builderData: entry.attachment,
        calculation: { rental_period: eq.rental_period, rental_duration: eq.rental_duration, attachment_quantity: entry.quantity, total_cost: entry.cost },
        pricingBasis: { pricing_mode: `per_${eq.rental_period || "day"}` }
      }));
    });
    const representedEquipment = num5(breakdown.total);
    if (eq.equipment_cost != null && Math.abs(num5(eq.equipment_cost) - representedEquipment) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:equipment:${index}:saved-adjustment`,
        name: `${equipmentRow?.material_name || "Foundation Equipment"} \u2014 Saved Cost Adjustment`,
        type: "equipment",
        subtype: "equipment_adjustment",
        sourcePath: `selected_equipment[${index}].equipment_cost`,
        cost: num5(eq.equipment_cost) - representedEquipment,
        builderData: eq,
        calculation: { authoritative_total: eq.equipment_cost, reconstructed_total: representedEquipment }
      }));
    }
  });
  const cabinetSavedTotal = foundationSavedSectionTotal(
    project.builder_calculation?.cabinet_cost,
    project.builder_calculation?.totals?.total_signage_cabinet_cost,
    project.total_signage_cabinet_cost
  );
  let representedCabinets = 0;
  calcSignageCabinetPricing(project.signage_cabinets).forEach((row, index) => {
    if (!row.available) return;
    const cabinet = row.pricedEntry;
    const quantity3 = cabinet.quantity === void 0 || cabinet.quantity === null || cabinet.quantity === "" ? 1 : num5(cabinet.quantity, 1);
    parts.push(makePart({
      key: `foundation:cabinet:${cabinet.id || index}`,
      name: cabinet.description || "Signage Cabinet",
      type: "fabrication",
      subtype: "signage_cabinet",
      sourcePath: `signage_cabinets[${index}]`,
      quantity: quantity3,
      unit: "each",
      unitCost: cabinet.unit_cost,
      extendedCost: row.cost,
      builderData: cabinet,
      calculation: { ...cabinet, pricing_available: true, line_cost: row.cost },
      pricingBasis: { pricing_mode: "cabinet_unit_cost" }
    }));
    representedCabinets += num5(row.cost);
  });
  if (cabinetSavedTotal !== null && Math.abs(cabinetSavedTotal - representedCabinets) > 5e-3) {
    parts.push(manualCostPart({
      key: "foundation:cabinet:saved-adjustment",
      name: "Signage Cabinets \u2014 Saved Cost Adjustment",
      type: "fabrication",
      subtype: "signage_cabinet_adjustment",
      sourcePath: "total_signage_cabinet_cost",
      cost: cabinetSavedTotal - representedCabinets,
      builderData: { signage_cabinets: project.signage_cabinets || [] },
      calculation: { authoritative_total: cabinetSavedTotal, reconstructed_total: representedCabinets }
    }));
  }
  const landscapeSavedTotal = foundationSavedSectionTotal(
    project.builder_calculation?.landscape_cost,
    project.builder_calculation?.totals?.total_landscape_cost,
    project.total_landscape_cost
  );
  const landscapeCalc = landscapeSummary(project.landscape);
  let representedLandscape = 0;
  landscapeCalc.lines.forEach((line) => {
    if (line.cost === null || line.sqft === null) return;
    parts.push(makePart({
      key: `foundation:landscape:${line.key}`,
      name: `Site Material \u2014 ${line.label}`,
      type: "material",
      subtype: "landscape",
      sourcePath: "landscape.cells",
      quantity: line.sqft,
      unit: "sq_ft",
      unitCost: line.cost / line.sqft,
      extendedCost: line.cost,
      builderData: { material_key: line.key, cells: line.cells, cell_size_inches: project.landscape?.cell_size_inches },
      calculation: { cells: line.cells, sqft: line.sqft, cost: line.cost },
      pricingBasis: { pricing_mode: "landscape_material_sqft" }
    }));
    representedLandscape += line.cost;
  });
  if (landscapeSavedTotal !== null && Math.abs(landscapeSavedTotal - representedLandscape) > 5e-3) {
    parts.push(manualCostPart({
      key: "foundation:landscape:saved-adjustment",
      name: "Landscape Materials \u2014 Saved Cost Adjustment",
      type: "material",
      subtype: "landscape_adjustment",
      sourcePath: "total_landscape_cost",
      cost: landscapeSavedTotal - representedLandscape,
      builderData: project.landscape || {},
      calculation: { authoritative_total: landscapeSavedTotal, reconstructed_total: representedLandscape }
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
    const quantity3 = item.item_type === "lettering" ? 1 : item.quantity || 1;
    const maskCost = num5(item.supplies_cost);
    const paintCost = num5(item.paint_cost);
    const laborCost = num5(item.labor_cost);
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
        quantity: quantity3,
        unit: quantity3 > 1 ? "each" : "job",
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
        quantity: quantity3,
        unit: quantity3 > 1 ? "each" : "job",
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
  const authoritativeMaterialTotal = num5(project.total_paint_mask_cost) + num5(project.total_liquid_paint_and_supplies_cost);
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
  const authoritativeLaborTotal = num5(project.total_labor_cost);
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
    if (num5(item.machine_cost) > 5e-3) {
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
    if (num5(item.labor_cost) > 5e-3) {
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
  const dynamicItemLabor = (project.items || []).reduce((sum, item) => sum + num5(item.labor_cost), 0);
  const fixedSetupCost = num5(
    project.builder_calculation?.totals?.fixed_setup_cost,
    num5(project.fixed_setup_hours) * num5(project.labor_rate)
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
  const authoritativeLaborTotal = num5(
    project.total_labor_cost,
    num5(project.builder_calculation?.totals?.total_labor_cost, dynamicItemLabor + fixedSetupCost)
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
    itemMachineTotal += num5(item.machine_cost);
    itemLaborTotal += num5(item.labor_cost);
    if (num5(item.machine_cost) > 5e-3) {
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
    if (num5(item.labor_cost) > 5e-3) {
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
  const fixedSetupCost = num5(
    project.builder_calculation?.totals?.fixed_setup_cost,
    num5(project.fixed_setup_hours) * num5(project.labor_rate)
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
  const authoritativeMachineTotal = num5(
    project.total_machine_cost,
    num5(project.builder_calculation?.totals?.total_machine_cost, itemMachineTotal)
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
  const authoritativeLaborTotal = num5(
    project.total_labor_cost,
    num5(project.builder_calculation?.totals?.total_labor_cost, itemLaborTotal + fixedSetupCost)
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
  const authoritativeSupplies = num5(
    project.total_supplies_cost,
    num5(project.fixed_material_setup_cost, project.builder_calculation?.totals?.total_supplies_cost)
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
    unitCost: item.quantity ? num5(item.item_total_cost) / num5(item.quantity, 1) : 0,
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
    const currentExtended = num5(descriptor.extended_cost);
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
      const initialFrozenExtended = establishBaseline ? num5(descriptor.extended_cost) : 0;
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
    const frozenUnit = shouldAccept ? currentUnitCost : num5(old.frozen_unit_cost, descriptor.unit_cost || currentUnitCost);
    const frozenExtended = shouldAccept ? currentExtended : num5(old.frozen_extended_cost, descriptor.extended_cost);
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
          const currentExtended = currentUnit * num5(old.quantity, 1);
          const changed = Math.abs(currentExtended - num5(old.frozen_extended_cost)) > 5e-3 || !same(pricingSnapshot(currentRow), pricingSnapshot(old.frozen_inventory_snapshot));
          const patch = {
            current_inventory_snapshot: currentRow,
            current_unit_cost: currentUnit,
            current_extended_cost: currentExtended,
            inventory_link_state: "attached",
            price_state: changed ? "changed" : "current",
            price_delta: currentExtended - num5(old.frozen_extended_cost),
            price_delta_percent: num5(old.frozen_extended_cost) ? (currentExtended - num5(old.frozen_extended_cost)) / num5(old.frozen_extended_cost) * 100 : 0,
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
    const frozenRemovedCost = num5(old.frozen_extended_cost);
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
    (sum, part) => sum + num5(part.current_extended_cost, num5(part.frozen_extended_cost)),
    0
  );
  const frozenPartsTotal = activeEconomicParts.reduce(
    (sum, part) => sum + num5(part.frozen_extended_cost),
    0
  );
  const markupParts = activeEconomicParts.filter((part) => part.part_subtype === "markup");
  const currentMarkupTotal = markupParts.reduce(
    (sum, part) => sum + num5(part.current_extended_cost, num5(part.frozen_extended_cost)),
    0
  );
  const frozenMarkupTotal = markupParts.reduce((sum, part) => sum + num5(part.frozen_extended_cost), 0);
  const manualAddons = activeEconomicParts.filter((part) => part.builder_sync_state === "manual_addon");
  const manualAddonFrozenTotal = manualAddons.reduce((sum, part) => sum + num5(part.frozen_extended_cost), 0);
  const manualAddonCurrentTotal = manualAddons.reduce((sum, part) => sum + num5(part.current_extended_cost, num5(part.frozen_extended_cost)), 0);
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
    const wasChanged = part.price_state === "changed" || contextChanged || Math.abs(num5(part.current_extended_cost) - num5(part.frozen_extended_cost)) > 5e-3 || !same(pricingSnapshot(part.current_inventory_snapshot), pricingSnapshot(part.frozen_inventory_snapshot));
    if (wasChanged) {
      changedParts.push({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        previous_inventory_item_id: part.original_inventory_item_id || part.inventory_item_id,
        current_inventory_item_id: part.inventory_item_id,
        previous_unit_cost: num5(part.frozen_unit_cost),
        new_unit_cost: num5(part.current_unit_cost),
        previous_extended_cost: num5(part.frozen_extended_cost),
        new_extended_cost: num5(part.current_extended_cost),
        previous_inventory_snapshot: part.frozen_inventory_snapshot || {},
        new_inventory_snapshot: part.current_inventory_snapshot || {},
        ...linkedV2 ? {
          previous_reinforcement_frozen_pricing: structuredClone(part.pricing_basis_snapshot?.reinforcement_frozen_pricing ?? { ...FOUNDATION_REINFORCEMENT_FROZEN_UNKNOWN }),
          new_reinforcement_frozen_pricing: structuredClone(nextV2Context)
        } : {},
        action: pendingRemoval ? "remove" : Math.abs(num5(part.frozen_extended_cost)) <= 5e-3 && Math.abs(num5(part.current_extended_cost)) > 5e-3 ? "add" : "price_update"
      });
    }
    const acceptedBuilderData = { ...part.builder_data || {} };
    delete acceptedBuilderData[PENDING_REMOVAL_KEY];
    partUpdates.push({
      part_id: part.id,
      expected_updated_date: part.updated_date || "",
      patch: {
        frozen_inventory_snapshot: part.current_inventory_snapshot || part.frozen_inventory_snapshot || {},
        frozen_unit_cost: num5(part.current_unit_cost, num5(part.frozen_unit_cost)),
        frozen_extended_cost: num5(part.current_extended_cost, num5(part.frozen_extended_cost)),
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

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/builderProductPersistence.js
var cleanString3 = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function normalize4(value) {
  if (Array.isArray(value)) return value.map(normalize4);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize4(value[key]);
    return out;
  }, {});
}
function sameValue6(a, b) {
  const leftEmpty = a === null || a === void 0 || a === "";
  const rightEmpty = b === null || b === void 0 || b === "";
  if (leftEmpty && rightEmpty) return true;
  if (!leftEmpty && !rightEmpty && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString3(a) === cleanString3(b);
  }
  return JSON.stringify(normalize4(a)) === JSON.stringify(normalize4(b));
}
function payloadMatches(record, payload) {
  return Boolean(record?.id) && Object.entries(payload || {}).every(([field, value]) => sameValue6(record?.[field], value));
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

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/builderService.js
var num6 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
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
  const text6 = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text6.length; i += 1) {
    hash ^= text6.charCodeAt(i);
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
  if (!record) return num6(line?.live_total_snapshot, num6(line?.total_snapshot));
  const totalField = MODULE_TOTAL_FIELD[line?.module_key];
  if (totalField) return num6(record[totalField]);
  if (line?.module_key === "painting") {
    return num6(record.total_paint_mask_cost) + num6(record.total_liquid_paint_and_supplies_cost) + num6(record.total_labor_cost);
  }
  if (line?.module_key === "foundation") {
    const split = foundationSplitFieldTotal(record);
    if (split !== null) return split;
    const direct = num6(record.grand_total, NaN);
    if (Number.isFinite(direct)) return direct;
    return 0;
  }
  return num6(record.total_cost, num6(line?.total_snapshot));
}
var FOUNDATION_RECORD_TOTAL_FIELDS = [
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
function foundationSplitFieldTotal(record) {
  if (!record || typeof record !== "object") return null;
  if (!FOUNDATION_RECORD_TOTAL_FIELDS.some((key) => Number.isFinite(Number(record[key])))) return null;
  return FOUNDATION_RECORD_TOTAL_FIELDS.reduce((sum, key) => sum + num6(record[key]), 0);
}
function foundationRecordSavedTotal(record) {
  if (!record || typeof record !== "object") return null;
  const split = foundationSplitFieldTotal(record);
  if (split !== null) return split;
  const direct = num6(record.grand_total, NaN);
  if (Number.isFinite(direct)) return direct;
  return null;
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
var sameNumber = (a, b) => Math.abs(num6(a) - num6(b)) <= 5e-3;
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
  const acceptedTotal = num6(line.total_snapshot);
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
      quantity: num6(line.customer_quantity, 1),
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
    const frozen = num6(builderProduct.frozen_cost, acceptedTotal);
    const frozenCustomer = hasNumericValue(builderProduct.frozen_customer_price) ? num6(builderProduct.frozen_customer_price) : acceptedCustomerPrice;
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
      quantity: num6(line.customer_quantity, 1),
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
    partCount: num6(builderProduct.part_count),
    detachedCount: num6(builderProduct.detached_part_count),
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
      const manualAddonCurrent = num6(partSummary.manualAddonCurrentTotal);
      const liveInternalFromParts = num6(partSummary.currentPartsTotal) - num6(partSummary.currentMarkupTotal);
      const liveBuilderCoreCost = liveInternalFromParts - manualAddonCurrent;
      const markupPercent = num6(source?.markup_percent);
      effectiveLiveTotal = liveInternalFromParts;
      effectiveLiveCustomerPrice = liveBuilderCoreCost * (1 + markupPercent / 100) + manualAddonCurrent;
    } else {
      effectiveLiveTotal = liveTotal + num6(partSummary.manualAddonCurrentTotal);
      effectiveLiveCustomerPrice = preserveLegacyEconomics ? liveCustomerPrice : economics.customerPrice + num6(partSummary.manualAddonCurrentTotal);
    }
    const frozenAfterSync = num6(builderProduct.frozen_cost, acceptedTotal);
    const frozenCustomerAfterSync = hasNumericValue(builderProduct.frozen_customer_price) ? num6(builderProduct.frozen_customer_price) : acceptedCustomerPrice;
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
  const frozenCost = isNew ? num6(builderProduct.frozen_cost) : acceptedTotal;
  const frozenCustomerPrice = hasNumericValue(builderProduct.frozen_customer_price) ? num6(builderProduct.frozen_customer_price) : acceptedCustomerPrice;
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
    detached_part_count: num6(builderProduct.detached_part_count),
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
async function recordBuilderSave({ estimateId, line, sourceProject, liveTotal, internalCost, customerPrice, expectedPendingKey }) {
  if (!estimateId || !line) return line;
  if (!sourceProject || typeof sourceProject !== "object") {
    throw new Error("The saved Builder source could not be verified. Product pricing and Parts were not synchronized.");
  }
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be verified before synchronizing this Builder save.");
  const matchedLine = (estimate.line_items || []).find(
    (item) => item.module_key === line.module_key && (line.builder_product_id && item.builder_product_id === line.builder_product_id || line.project_id && item.project_id === line.project_id)
  );
  if (!matchedLine) {
    throw new Error("This Product is no longer part of the estimate. The Builder source was saved, but its estimate section was removed \u2014 reload the estimate before retrying.");
  }
  const currentLine = matchedLine;
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
  const sourceTotal = num6(liveTotal, sourceProjectTotal(currentLine, sourceProject));
  const economics = sourceProjectEconomics(currentLine.module_key, sourceProject, sourceTotal);
  const nextLiveTotal = hasNumericValue(internalCost) ? num6(internalCost) : economics.internalCost;
  const nextLiveCustomerPrice = hasNumericValue(customerPrice) ? num6(customerPrice) : economics.customerPrice;
  const previousFrozenTotal = num6(builder?.frozen_cost, num6(currentLine.total_snapshot));
  const previousFrozenCustomerPrice = hasNumericValue(builder?.frozen_customer_price) ? num6(builder.frozen_customer_price) : acceptedCustomerUnitPrice(currentLine);
  const wantsInitialFreeze = builder?.price_state === "unchecked" && previousFrozenTotal === 0;
  let partSummary = {
    partCount: num6(builder?.part_count),
    detachedCount: num6(builder?.detached_part_count),
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
  const effectiveLiveTotal = nextLiveTotal + num6(partSummary.manualAddonCurrentTotal);
  const effectiveLiveCustomerPrice = nextLiveCustomerPrice + num6(partSummary.manualAddonCurrentTotal);
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
      const operationKey = `builder_initial_freeze:${builder.id}:${num6(builder.builder_version, 1)}:${snapshotHash({
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
        builder_version: num6(builder.builder_version, 1) + 1,
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
        builder_version_before: num6(builder.builder_version, 1),
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
    const nextRevision = num6(builder.builder_version, 1) + (initialFreezeCompleted ? 1 : 0);
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

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationBuilderRecovery.js
async function verifyFoundationRecoverySource({ sourceId, expectedSourceVersion }) {
  const saved = await staffEntities.FoundationProject.get(sourceId);
  if (saved?.id !== sourceId || !expectedSourceVersion || saved.updated_date !== expectedSourceVersion) {
    throw new Error("The Foundation project changed in another session. Reload it before recovering this Builder synchronization.");
  }
  return saved;
}
async function loadFoundationBuilderRecovery({ sourceId, estimateId, expectedSourceVersion }) {
  if (!estimateId) return null;
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (estimate?.id !== estimateId) throw new Error("The linked estimate could not be verified before Builder recovery.");
  const line = (estimate.line_items || []).find((item) => item.module_key === "foundation" && item.project_id === sourceId);
  const pending = pendingBuilderMutation(line);
  if (!pending) return null;
  if (!line.builder_product_id || typeof pending.key !== "string" || pending.estimate_id !== estimateId || pending.builder_product_id !== line.builder_product_id || pending.estimate_line_id && (line.line_id || pending.line_patch?.line_id) && pending.estimate_line_id !== (line.line_id || pending.line_patch?.line_id)) {
    throw new Error("The pending Builder operation does not match this Foundation Product. Review it in the linked estimate.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  const sourceProject = await verifyFoundationRecoverySource({ sourceId, expectedSourceVersion });
  const receipt = sourceProject.builder_sync_attempt;
  if (receipt != null && (!validateFoundationSyncAttempt(receipt) || receipt.source_project_id !== sourceId || receipt.estimate_id !== estimateId)) {
    throw new Error("The saved Foundation sync receipt does not match this estimate. Reload and review it before recovery.");
  }
  const operationSourceVersion = pending.line_patch?.updated_date_snapshot || line.updated_date_snapshot;
  if (!operationSourceVersion || operationSourceVersion !== sourceProject.updated_date) {
    throw new Error("This Builder operation belongs to a different Foundation source revision. Reload and review it before recovery.");
  }
  return { sourceProject, pendingKey: pending.key };
}
async function retryFoundationBuilderSync({
  sourceId,
  estimateId,
  expectedSourceVersion,
  savedProject = null,
  builderCalculation = null,
  liveTotal = void 0,
  expectedPendingKey = void 0,
  deps = {}
} = {}) {
  const getProject = deps.getProject || ((id) => staffEntities.FoundationProject.get(id));
  const getEstimate = deps.getEstimate || ((id) => staffEntities.AllInOneEstimate.get(id));
  const recordSave = deps.recordSave || recordBuilderSave;
  const warnings = [];
  if (!sourceId || !estimateId) {
    return { status: "invalid", reason: "missing_context", error: "A source project and a linked estimate are both required to retry a Builder sync.", warnings };
  }
  if (typeof expectedSourceVersion !== "string" || !expectedSourceVersion) {
    return { status: "invalid", reason: "missing_source_version", error: "The saved source revision this sync belongs to could not be verified. Reload before retrying.", warnings };
  }
  let fresh;
  try {
    fresh = await getProject(sourceId);
  } catch (error) {
    return { status: "conflict", reason: "source_unreadable", error: `The saved project could not be re-read before retrying: ${error?.message || "read failed"}`, warnings };
  }
  if (fresh?.id !== sourceId || fresh.updated_date !== expectedSourceVersion) {
    return { status: "conflict", reason: "source_moved", error: "The Foundation project changed in another session. Reload it before retrying this Builder synchronization.", warnings };
  }
  let estimate;
  try {
    estimate = await getEstimate(estimateId);
  } catch (error) {
    return { status: "conflict", reason: "estimate_unreadable", error: `The linked estimate could not be verified before retrying: ${error?.message || "read failed"}`, warnings };
  }
  if (estimate?.id !== estimateId) {
    return { status: "conflict", reason: "estimate_unreadable", error: "The linked estimate could not be verified before retrying this Builder synchronization.", warnings };
  }
  const classification = classifyFoundationSyncRetry({ project: fresh, estimateId, estimate });
  if (!classification.retryable) {
    return classification.mode === "none_needed" ? { status: "already_synced", mode: classification.mode, line: classification.line, attempt: classification.attempt, warnings } : { status: "blocked", mode: classification.mode, reason: classification.reason, line: classification.line, attempt: classification.attempt, warnings };
  }
  if (expectedPendingKey !== void 0 && String(expectedPendingKey || "") !== String(classification.pendingKey || "")) {
    return { status: "conflict", reason: "pending_key_changed", error: "The pending Builder operation changed before the retry could run. Reload the estimate before continuing.", line: classification.line, attempt: classification.attempt, warnings };
  }
  const base2 = savedProject?.id === sourceId ? savedProject : fresh;
  const syncSource = builderCalculation && typeof builderCalculation === "object" && !Array.isArray(builderCalculation) ? { ...base2, builder_calculation: builderCalculation } : base2;
  if (classification.mode === "resync_unacknowledged" && !builderCalculation) {
    warnings.push("descriptor_basis:record");
  }
  let result;
  try {
    result = await recordSave({
      estimateId,
      line: { project_id: sourceId, module_key: "foundation" },
      sourceProject: syncSource,
      ...liveTotal !== void 0 ? { liveTotal } : {},
      ...expectedPendingKey !== void 0 ? { expectedPendingKey } : {}
    });
  } catch (error) {
    return { status: "failed", mode: classification.mode, error: error?.message || String(error || "Builder sync retry failed."), line: classification.line, attempt: classification.attempt, warnings };
  }
  const ackLine = result?.line || result;
  try {
    assertFoundationBuilderAcknowledgment({ sourceProject: fresh, estimateId, line: ackLine });
  } catch (error) {
    return { status: "pending", mode: classification.mode, error: error?.message || String(error || "Builder sync acknowledgment could not be verified."), line: ackLine, attempt: classification.attempt, warnings };
  }
  return { status: "synced", mode: classification.mode, line: ackLine, sourceVersion: fresh.updated_date, attempt: classification.attempt, warnings };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationSyncConflictDialog.jsx
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
var fmtTs = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleString() : iso || "unknown";
};
function useFoundationSyncConflict() {
  const [conflict, setConflict] = useState(null);
  const [resolving, setResolving] = useState(false);
  const openSeq = useRef(0);
  const open = useCallback(async (kind, { draft = null, draftSavedAt = null, baseUpdatedAt = null, savedProject = null, getSavedProject = null, hasUnbackedEdits = false } = {}) => {
    const seq = ++openSeq.current;
    let saved = savedProject && typeof savedProject === "object" ? savedProject : null;
    let savedReadable = null;
    if (typeof getSavedProject === "function") {
      try {
        const fresh = await getSavedProject();
        if (fresh && typeof fresh === "object") {
          saved = fresh;
          savedReadable = true;
        } else {
          saved = null;
          savedReadable = false;
        }
      } catch {
        savedReadable = false;
      }
    }
    if (seq !== openSeq.current) return { opened: false, summary: null, stale: true };
    const summary = summarizeFoundationDraftConflict({ draft, saved, baseUpdatedAt, draftSavedAt });
    const opened = foundationDraftConflictNeedsReview(summary) || savedReadable === false;
    if (!opened) return { opened: false, summary };
    setConflict({
      kind,
      draft: draft && typeof draft === "object" ? draft : null,
      draftSavedAt,
      baseUpdatedAt,
      savedProject: saved,
      savedReadable,
      hasUnbackedEdits,
      summary,
      openedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { opened: true, summary };
  }, []);
  const openDraftConflict = useCallback(
    (args) => open("draft_vs_saved", args),
    [open]
  );
  const openSaveConflict = useCallback(
    (args) => open("save_conflict", args),
    [open]
  );
  const dismiss = useCallback(() => setConflict(null), []);
  const choose = useCallback(async (handler) => {
    if (typeof handler !== "function" || resolving) return false;
    setResolving(true);
    try {
      const result = await handler();
      if (result === false) return false;
      setConflict(null);
      return true;
    } finally {
      setResolving(false);
    }
  }, [resolving]);
  return { conflict, resolving, openDraftConflict, openSaveConflict, choose, dismiss };
}
var CHOICE_LABELS = {
  keep_draft: "Keep draft edits",
  keep_saved: "Keep saved project",
  keep_both: "Keep both \u2014 hold draft as a new offer"
};
var CHOICE_NOTES = {
  draft_vs_saved: {
    keep_draft: "Applies the browser draft's recorded fields over the saved project. Fields the draft never recorded keep their saved values. The newer saved content in the listed fields is replaced in this editor \u2014 nothing is written until you save.",
    keep_saved: "Discards the browser draft by your explicit choice. The saved project stays as loaded.",
    keep_both: "Keeps the saved project open AND re-anchors the draft to this saved revision as a new browser draft offer \u2014 nothing is dropped; restore it later from the draft banner if you still want it."
  },
  save_conflict: {
    keep_draft: "Reloads the newer saved project, then re-applies your unsent edits on top so your next save lands on the fresh revision.",
    keep_saved: "Discards your unsent edits by your explicit choice and reloads the newer saved project.",
    keep_both: "Reloads the newer saved project AND re-anchors your unsent edits as a fresh browser draft offer \u2014 nothing is dropped; restore it later from the draft banner if you still want it."
  }
};
function FoundationSyncConflictDialog({
  conflict,
  busy = false,
  disabled = {},
  onKeepDraft,
  onKeepSaved,
  onKeepBoth,
  onDismiss
}) {
  if (!conflict) return null;
  const { summary, kind } = conflict;
  const notes = CHOICE_NOTES[kind] || CHOICE_NOTES.draft_vs_saved;
  const fields = Array.isArray(summary?.fields) ? summary.fields : [];
  const conflictRows = fields.filter((f) => f.status === "diverged" || f.status === "draft_only");
  const savedOnlyRows = fields.filter((f) => f.status === "saved_only");
  const sameCount = fields.filter((f) => f.status === "same").length;
  const savedUnknown = conflict.savedReadable === false;
  const title = kind === "save_conflict" ? "Saved project changed while you were editing" : summary?.status === "base_moved_identical" ? "Browser draft matches the newer save \u2014 re-anchor?" : "Browser draft conflicts with a newer saved project";
  const reason = summary?.status === "unverifiable" && summary?.reason === "saved_unreadable" ? "The saved project record could not be read, so a field-level comparison is unavailable. The choices below still apply \u2014 discarding the draft against an unseen record is flagged." : null;
  const handlers = { keep_draft: onKeepDraft, keep_saved: onKeepSaved, keep_both: onKeepBoth };
  const renderChoice = (key) => {
    const reasonText = disabled?.[key];
    const handler = handlers[key];
    const off = busy || !!reasonText || typeof handler !== "function";
    return /* @__PURE__ */ jsx11("div", { className: "rounded-sm border border-gray-200 bg-white px-3 py-2", children: /* @__PURE__ */ jsxs11("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs11("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx11("div", { className: "text-[13px] font-semibold text-gray-800", children: CHOICE_LABELS[key] }),
        /* @__PURE__ */ jsx11("div", { className: "mt-0.5 text-[12px] text-gray-600", children: notes[key] }),
        reasonText && /* @__PURE__ */ jsx11("div", { className: "mt-1 text-[12px] font-semibold text-amber-800", children: reasonText })
      ] }),
      /* @__PURE__ */ jsx11(
        "button",
        {
          type: "button",
          disabled: off,
          onClick: () => handler?.(),
          className: `shrink-0 rounded-sm border px-2 py-1 text-[12px] font-semibold disabled:opacity-50 ${key === "keep_draft" ? "border-indigo-400 bg-indigo-50 text-indigo-800" : key === "keep_saved" ? "border-gray-400 bg-white text-gray-700" : "border-blue-400 bg-blue-50 text-blue-800"}`,
          children: CHOICE_LABELS[key]
        }
      )
    ] }) }, key);
  };
  return /* @__PURE__ */ jsx11(Dialog2, { open: true, onOpenChange: (v) => {
    if (!v && !busy) onDismiss?.();
  }, children: /* @__PURE__ */ jsxs11(DialogContent2, { className: "max-w-[720px]", children: [
    /* @__PURE__ */ jsx11(DialogHeader2, { children: /* @__PURE__ */ jsxs11(DialogTitle2, { className: "flex items-center gap-2 text-[15px]", children: [
      /* @__PURE__ */ jsx11(AlertTriangle, { className: "h-4 w-4 text-amber-600" }),
      title
    ] }) }),
    /* @__PURE__ */ jsxs11("div", { className: "space-y-3 text-[12px] text-gray-700", children: [
      /* @__PURE__ */ jsxs11("div", { className: "rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 leading-relaxed", children: [
        /* @__PURE__ */ jsxs11("div", { children: [
          /* @__PURE__ */ jsx11("span", { className: "font-semibold", children: "Browser draft" }),
          conflict.draftSavedAt ? ` \u2014 written ${fmtTs(conflict.draftSavedAt)}` : " \u2014 write time unknown",
          conflict.baseUpdatedAt ? `, anchored to saved revision ${conflict.baseUpdatedAt}` : ""
        ] }),
        /* @__PURE__ */ jsxs11("div", { children: [
          /* @__PURE__ */ jsx11("span", { className: "font-semibold", children: "Saved project" }),
          summary?.savedUpdatedAt ? ` \u2014 now at revision ${summary.savedUpdatedAt}` : savedUnknown ? " \u2014 could not be re-read" : " \u2014 revision unknown"
        ] }),
        summary?.baseMoved && /* @__PURE__ */ jsx11("div", { className: "mt-1 text-amber-800", children: "The saved project moved after this draft was written \u2014 a concurrent edit was detected." }),
        conflict.kind === "save_conflict" && !summary?.baseMoved && /* @__PURE__ */ jsx11("div", { className: "mt-1 text-amber-800", children: "The save was refused because the stored revision changed; your unsent edits are still held in this tab." })
      ] }),
      reason && /* @__PURE__ */ jsx11("div", { role: "alert", className: "rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900", children: reason }),
      conflictRows.length > 0 ? /* @__PURE__ */ jsxs11("div", { className: "overflow-hidden rounded-sm border border-gray-200", children: [
        /* @__PURE__ */ jsxs11("div", { className: "grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500", children: [
          /* @__PURE__ */ jsx11("span", { children: "Field" }),
          /* @__PURE__ */ jsxs11("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsx11(GitCompareArrows, { className: "h-3 w-3" }),
            "Browser draft"
          ] }),
          /* @__PURE__ */ jsx11("span", { children: "Saved project" })
        ] }),
        /* @__PURE__ */ jsx11("div", { className: "max-h-[280px] overflow-y-auto", children: conflictRows.map((row) => /* @__PURE__ */ jsxs11(
          "div",
          {
            "data-field": row.field,
            "data-status": row.status,
            className: `grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] border-t border-gray-100 px-3 py-1.5 ${row.status === "diverged" ? "bg-amber-50/60" : "bg-indigo-50/40"}`,
            children: [
              /* @__PURE__ */ jsx11("span", { className: "pr-2 font-medium text-gray-800", children: row.label }),
              /* @__PURE__ */ jsxs11("span", { className: "pr-2 text-gray-700", children: [
                row.draft?.text ?? "\u2014",
                row.status === "draft_only" && /* @__PURE__ */ jsx11("span", { className: "ml-1 text-[10px] font-semibold uppercase text-indigo-700", children: "draft only" })
              ] }),
              /* @__PURE__ */ jsx11("span", { className: "text-gray-700", children: row.saved?.text ?? "\u2014" })
            ]
          },
          row.field
        )) })
      ] }) : summary?.status === "base_moved_identical" ? /* @__PURE__ */ jsx11("div", { className: "rounded-sm border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900", children: "Every draft field matches the newer saved revision \u2014 only the draft's anchor is stale. Re-anchoring is safe either way; choose below." }) : null,
      (sameCount > 0 || savedOnlyRows.length > 0) && /* @__PURE__ */ jsxs11("details", { className: "rounded-sm border border-gray-200 px-3 py-2", children: [
        /* @__PURE__ */ jsxs11("summary", { className: "cursor-pointer text-[12px] font-semibold text-gray-700", children: [
          sameCount,
          " identical ",
          sameCount === 1 ? "field" : "fields",
          savedOnlyRows.length > 0 ? ` \xB7 ${savedOnlyRows.length} saved-only ${savedOnlyRows.length === 1 ? "field" : "fields"} (kept either way)` : ""
        ] }),
        /* @__PURE__ */ jsxs11("ul", { className: "mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-gray-600", children: [
          fields.filter((f) => f.status === "same").map((f) => /* @__PURE__ */ jsxs11("li", { children: [
            f.label,
            ": ",
            f.draft?.text ?? "\u2014"
          ] }, f.field)),
          savedOnlyRows.map((f) => /* @__PURE__ */ jsxs11("li", { children: [
            f.label,
            ": saved has \u201C",
            f.saved?.text ?? "\u2014",
            "\u201D; the draft never recorded it, so restore leaves it untouched."
          ] }, f.field))
        ] })
      ] }),
      /* @__PURE__ */ jsxs11("div", { className: "space-y-2", children: [
        renderChoice("keep_draft"),
        renderChoice("keep_saved"),
        renderChoice("keep_both")
      ] }),
      conflict.hasUnbackedEdits && /* @__PURE__ */ jsx11("div", { role: "alert", className: "rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900", children: "Unsent in-memory edits could not be backed up to the tab draft store. Choosing \u201Ckeep saved\u201D drops them \u2014 pick \u201Ckeep draft\u201D or resolve storage first." }),
      /* @__PURE__ */ jsx11("div", { className: "flex justify-end pt-1", children: /* @__PURE__ */ jsx11("button", { type: "button", onClick: onDismiss, disabled: busy, className: "h-[30px] rounded-sm border border-gray-300 px-3 text-[12px] text-gray-700 disabled:opacity-50", children: "Decide later" }) })
    ] })
  ] }) });
}
function useFoundationBuilderSyncRetry(getContext, impl = retryFoundationBuilderSync) {
  const [retrying, setRetrying] = useState(false);
  const [lastOutcome, setLastOutcome] = useState(null);
  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;
  const implRef = useRef(impl);
  implRef.current = impl;
  const flightRef = useRef(null);
  const retry = useCallback(async () => {
    if (flightRef.current) return flightRef.current;
    const flight = Promise.resolve().then(() => implRef.current(getContextRef.current?.() || {})).then((outcome) => {
      setLastOutcome(outcome || null);
      return outcome;
    }).finally(() => {
      if (flightRef.current === flight) flightRef.current = null;
      setRetrying(false);
    });
    flightRef.current = flight;
    setRetrying(true);
    return flight;
  }, []);
  return { retry, retrying, lastOutcome };
}
function FoundationSyncRetryAction({
  retryState,
  onRetry,
  retrying = false,
  lastOutcome = null,
  estimateHref = null,
  disabled = false
}) {
  if (!retryState || retryState.mode === "none_needed") return null;
  const attempt = retryState.attempt;
  const modeLabel = retryState.mode === "resume_pending" ? "Resume the recorded Builder operation" : "Retry the unfinished Builder sync";
  const outcomeLine = lastOutcome ? lastOutcome.status === "synced" ? { tone: "ok", text: "Builder sync completed \u2014 the estimate line now acknowledges this saved revision." } : lastOutcome.status === "already_synced" ? { tone: "ok", text: "Nothing left to sync \u2014 this revision is already acknowledged." } : lastOutcome.status === "blocked" ? { tone: "warn", text: lastOutcome.reason || "Retry is blocked until the sync receipt is reviewed." } : lastOutcome.status === "conflict" ? { tone: "warn", text: lastOutcome.error || "The saved revision or pending marker moved \u2014 reload before retrying." } : lastOutcome.status === "pending" ? { tone: "warn", text: lastOutcome.error || "The retry ran but synchronization is still incomplete \u2014 review and retry." } : lastOutcome.status === "invalid" ? { tone: "warn", text: lastOutcome.error || "Retry could not be initialized." } : { tone: "warn", text: lastOutcome.error || "Retry failed \u2014 the recorded remainder is retained for another attempt." } : null;
  return /* @__PURE__ */ jsxs11("div", { className: "rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
    /* @__PURE__ */ jsxs11("div", { className: "flex flex-wrap items-center gap-3", children: [
      /* @__PURE__ */ jsxs11("span", { className: "min-w-0", children: [
        retryState.retryable ? retryState.reason : retryState.reason || "This Builder sync cannot be retried here.",
        attempt?.requested_at ? ` Attempt recorded ${fmtTs(attempt.requested_at)}.` : "",
        " ",
        "Only the unfinished estimate-side sync replays \u2014 the saved project write is not repeated."
      ] }),
      estimateHref && /* @__PURE__ */ jsx11("a", { className: "underline", href: estimateHref, children: "Open estimate" }),
      /* @__PURE__ */ jsxs11(
        "button",
        {
          type: "button",
          disabled: disabled || retrying || !retryState.retryable || typeof onRetry !== "function",
          onClick: () => onRetry?.(),
          className: "flex items-center gap-1.5 rounded-sm bg-amber-600 px-2 py-1 text-white disabled:opacity-50",
          children: [
            /* @__PURE__ */ jsx11(RefreshCw, { className: `h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}` }),
            retrying ? "Retrying\u2026" : modeLabel
          ]
        }
      )
    ] }),
    outcomeLine && /* @__PURE__ */ jsx11("div", { className: `mt-1.5 text-[12px] ${outcomeLine.tone === "ok" ? "text-emerald-800" : "text-amber-900"}`, children: outcomeLine.text })
  ] });
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/pages/FoundationEstimator.jsx
import FoundationLayoutCanvas from "@/components/estimator/foundation/FoundationLayoutCanvas";
import SignageCabinetsPanel from "@/components/estimator/foundation/SignageCabinetsPanel";
import LandscapeDesigner from "@/components/estimator/foundation/LandscapeDesigner";
import CustomerPricingPanel from "@/components/estimator/foundation/CustomerPricingPanel";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeFoundationProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/builder/sourceProjectPersistence.js
var cleanString4 = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function normalize5(value) {
  if (Array.isArray(value)) return value.map(normalize5);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize5(value[key]);
    return out;
  }, {});
}
function sameValue7(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString4(a) === cleanString4(b);
  }
  return JSON.stringify(normalize5(a)) === JSON.stringify(normalize5(b));
}
function sourcePatchMatches(record, patch) {
  if (!record || !patch) return false;
  return Object.entries(patch).every(([key, value]) => sameValue7(record?.[key], value));
}
async function preflightBuilderSourceMutation({ estimateId = "" } = {}) {
  if (!estimateId) return null;
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (!estimate?.id) throw new Error("Estimate could not be verified before saving this Builder source.");
  await assertEstimateProductMutationAllowed(estimate);
  return estimate;
}
async function updateBuilderSourceProject({
  entity,
  sourceId,
  expectedUpdatedAt,
  data,
  estimateId = "",
  label = "Builder source project"
}) {
  if (!entity?.updateMany || !entity?.get || !sourceId) {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  const expected = String(expectedUpdatedAt || "").trim();
  if (!expected) {
    throw new Error(`${label} is missing its loaded version. Reload it before saving.`);
  }
  await preflightBuilderSourceMutation({ estimateId });
  const verified = (record) => !!record && record.id === sourceId && typeof record.updated_date === "string" && record.updated_date.length > 0 && sourcePatchMatches(record, data);
  const conflict = () => new Error(`${label} changed in another session. Reload it before saving.`);
  let result;
  try {
    result = await entity.updateMany(
      { id: sourceId, updated_date: expected },
      { $set: data }
    );
  } catch (error) {
    const current2 = await entity.get(sourceId).catch(() => null);
    if (verified(current2)) return current2;
    throw error;
  }
  if (!result || !Number.isInteger(result.updated) || result.updated !== 0 && result.updated !== 1) {
    throw new Error(`${label} conditional-update result could not be verified.`);
  }
  if (result.updated === 1) {
    const saved = await entity.get(sourceId).catch(() => null);
    if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
    if (!verified(saved)) throw conflict();
    return saved;
  }
  const current = await entity.get(sourceId).catch(() => null);
  if (verified(current)) {
    return current;
  }
  throw conflict();
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationSaveSession.js
var CONFLICT_RE = /409|conflict|changed by another|changed in another session/i;
function classify(error) {
  const msg = String(error && (error.message || error) || "");
  if (CONFLICT_RE.test(msg) || error?.status === 409 || error?.code === 409) return "conflict";
  return "failed";
}
function createFoundationSaveSession() {
  let inFlight = null;
  const run = ({ sourceId, editRevision, getCurrent, saveSource, syncBuilder }) => {
    if (inFlight) return inFlight;
    const attempt = Promise.resolve().then(async () => {
      const warnings = [];
      const base2 = { sourceId, sourceVersion: null, savedEditRevision: editRevision, sourceSaved: false, builderSync: "not_required", error: null, warnings };
      const isCurrent = () => {
        try {
          const c = getCurrent() || {};
          return c.sourceId === sourceId && c.editRevision === editRevision && c.loaded === true;
        } catch {
          return false;
        }
      };
      if (!isCurrent()) return { ...base2, status: "superseded" };
      let savedProject;
      try {
        savedProject = await saveSource();
      } catch (error) {
        const cls = classify(error);
        return { ...base2, status: isCurrent() ? cls : "superseded", error, ...cls === "conflict" ? { conflictDetected: true } : {} };
      }
      if (!savedProject || savedProject.id !== sourceId || typeof savedProject.updated_date !== "string" || !savedProject.updated_date) {
        const error = new Error("Source save returned an unverified record.");
        const cls = classify(error);
        return { ...base2, status: isCurrent() ? cls : "superseded", error, ...cls === "conflict" ? { conflictDetected: true } : {} };
      }
      base2.sourceSaved = true;
      base2.sourceVersion = savedProject.updated_date;
      if (!isCurrent()) {
        return { ...base2, status: "superseded", builderSync: syncBuilder ? "pending" : "not_required" };
      }
      if (syncBuilder) {
        try {
          await syncBuilder(savedProject);
          base2.builderSync = "synced";
        } catch (error) {
          base2.builderSync = "pending";
          base2.error = error;
          warnings.push("builder_sync_failed");
          return { ...base2, status: isCurrent() ? "partial" : "superseded" };
        }
      }
      return { ...base2, status: isCurrent() ? "saved" : "superseded" };
    });
    const shared = attempt.finally(() => {
      if (inFlight === shared) inFlight = null;
    });
    inFlight = shared;
    return shared;
  };
  return { run, isSaving: () => inFlight !== null };
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/auth/EmailGate.jsx
import { Dialog as Dialog3, DialogContent as DialogContent3, DialogHeader as DialogHeader3, DialogTitle as DialogTitle3, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input as Input2 } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
var AuthContext = createContext(null);
var useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/pages/FoundationEstimator.jsx
import { convertFoundationToBrickStone } from "@/components/estimator/foundation/convertToBrickStone";
import { createEstimateReadOnlyShareLink } from "@/components/estimator/moduleShared/moduleProjectActions";
import { Fragment as Fragment5, jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
var blankItem = (type) => ({
  // Defaults mirror SignEstimate Pro `newItem()` exactly. CCS still lets the
  // user choose Spread Foot or Pillar at add-time; only the type is overridden.
  foundation_type: type || "spread_foot",
  description: "",
  quantity: 1,
  length_inches: 48,
  width_inches: 48,
  diameter: 24,
  depth_inches: 36,
  grade_offset_inches: 0,
  include_rebar: false,
  include_forming: false,
  include_finishing: false,
  rebar_size: "#4",
  rebar_spacing_length: 12,
  rebar_spacing_width: 12,
  rebar_layers: 1,
  rebar_layer_separation_inches: 12,
  pillar_rebar_size: "#4",
  pillar_rebar_hoop_diameter: 20,
  pillar_rebar_layer_separation_inches: 12,
  pillar_rebar_layers: 1,
  pillar_vertical_rebar_count: 4,
  selected_pole_id: "",
  pole_offset_from_bottom_inches: 0,
  pole_total_height_inches: 0,
  include_pole_painting: false,
  custom_concrete_cost_per_cy: null,
  custom_rebar_cost_per_ft: null,
  excavation_method: "hand_dig",
  selected_concrete_id: "",
  is_new_sign_location: false,
  mortar_gap_inches: 0.375,
  wall_width_inches: 8
});
var TAB_CLASS = "gap-1.5 text-[12px] data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-sm";
function FoundationEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const params = new URLSearchParams(window.location.search);
  const id = embeddedProjectId || params.get("id") || params.get("edit");
  const estimateId = embeddedEstimateId || params.get("estimateId");
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const ownerId = currentUser?.id || null;
  const [project, setProject] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [templateMode, setTemplateMode] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const saveRef = useRef(null);
  const saveSessionRef = useRef(null);
  if (!saveSessionRef.current) saveSessionRef.current = createFoundationSaveSession();
  const editRevisionRef = useRef(0);
  const acknowledgedVersionRef = useRef(null);
  const currentEditorRef = useRef({ sourceId: null, editRevision: 0, loaded: false });
  const contextKeyRef = useRef(null);
  const contextGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const saveAttemptRef = useRef(null);
  const exitGenerationRef = useRef(-1);
  const loadedOwnerRef = useRef(null);
  const [saveError, setSaveError] = useState("");
  const [reloadRevision, setReloadRevision] = useState(0);
  const [linkedEstimate, setLinkedEstimate] = useState(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const contextKey = JSON.stringify([ownerId, id, estimateId, project?.id, reloadRevision]);
  if (contextKeyRef.current !== contextKey) {
    contextKeyRef.current = contextKey;
    editRevisionRef.current += 1;
    contextGenerationRef.current += 1;
    const previousAcknowledgment = acknowledgedVersionRef.current;
    acknowledgedVersionRef.current = project?.id ? {
      sourceId: project.id,
      updated_date: project.updated_date,
      ownerId,
      sourceSnapshot: previousAcknowledgment?.sourceId === project.id && previousAcknowledgment?.ownerId === ownerId ? previousAcknowledgment.sourceSnapshot : null
    } : null;
  }
  const contextLoaded = mountedRef.current && !loading && !loadError && !!project && project.id === id && (!estimateId || linkedEstimate?.id === estimateId) && loadedOwnerRef.current === ownerId;
  currentEditorRef.current = {
    sourceId: contextLoaded ? project.id : null,
    estimateId: estimateId || null,
    generation: contextGenerationRef.current,
    editRevision: editRevisionRef.current,
    loaded: contextLoaded
  };
  const bumpEdit = () => {
    editRevisionRef.current += 1;
    currentEditorRef.current = { ...currentEditorRef.current, editRevision: editRevisionRef.current };
  };
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const copyFlightRef = useRef(null);
  const sourceRefreshRef = useRef(null);
  const sourceWriteEpochRef = useRef(/* @__PURE__ */ new Map());
  const projectRef = useRef(null);
  const swapAttemptRef = useRef({ signature: "", key: "" });
  projectRef.current = contextLoaded ? project : null;
  const draftStore = useMemo(
    () => createFoundationDraftStore({ getStorage: () => window.sessionStorage, ownerId, sourceId: id, estimateId: estimateId || null }),
    [ownerId, id, estimateId]
  );
  const draftSessionRef = useRef({ store: null, revision: null, pending: false });
  if (draftSessionRef.current.store !== draftStore) draftSessionRef.current = { store: draftStore, revision: null, pending: false };
  const [draftOffer, setDraftOffer] = useState(null);
  const draftVisible = draftOffer?.store === draftStore ? draftOffer : null;
  const syncConflict = useFoundationSyncConflict();
  const lastSyncCaptureRef = useRef(null);
  const syncRetry = useFoundationBuilderSyncRetry(() => ({
    sourceId: id,
    estimateId,
    expectedSourceVersion: acknowledgedVersionRef.current?.updated_date,
    savedProject: acknowledgedVersionRef.current?.sourceSnapshot,
    builderCalculation: lastSyncCaptureRef.current?.builderCalculation ?? null,
    liveTotal: lastSyncCaptureRef.current?.liveTotal,
    expectedPendingKey: classifyFoundationSyncRetry({ project, estimateId, estimate: linkedEstimate }).pendingKey ?? void 0
  }));
  useEffect(() => {
    copyAttemptRef.current = { signature: "", key: "" };
    swapAttemptRef.current = { signature: "", key: "" };
  }, [id]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!id) {
      setLoading(false);
      setProject(null);
      setLinkedEstimate(null);
      setRecoveryRequired(false);
      setDirty(false);
      setHistory({ past: [], future: [] });
      setSaveError("");
      return;
    }
    let active = true;
    const epochAtStart = sourceWriteEpochRef.current.get(id)?.epoch || 0;
    setLoading(true);
    setLoadError("");
    setSaveError("");
    setDirty(false);
    setHistory({ past: [], future: [] });
    Promise.all([
      staffEntities.FoundationProject.get(id),
      loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
      loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
      loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" }),
      estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
    ]).then(([proj, inv, concreteServices, settingRows, est]) => {
      if (!active) return;
      if (proj?.id !== id || estimateId && est?.id !== estimateId) {
        setProject(proj?.id === id ? proj : null);
        if (estimateId && est?.id !== estimateId) setLoadError("Linked estimate could not be verified.");
        return;
      }
      const epochNow = sourceWriteEpochRef.current.get(proj.id);
      if (epochNow && epochNow.epoch > epochAtStart && proj.updated_date !== epochNow.lastSavedVersion) {
        setReloadRevision((r) => r + 1);
        return;
      }
      setLinkedEstimate(est || null);
      const merged = {
        ...proj,
        excavation_method: proj.excavation_method || "hand_dig",
        project_concrete_type: proj.project_concrete_type || "4000_ae",
        project_concrete_admixtures: proj.project_concrete_admixtures || [],
        items: proj.items || [],
        walls: proj.walls || [],
        poles: proj.poles || [],
        wall_caps: proj.wall_caps || [],
        signage_cabinets: proj.signage_cabinets || [],
        landscape: proj.landscape || { cell_size_inches: 12, cells: {} },
        selected_equipment: proj.selected_equipment || []
      };
      let normalized;
      try {
        normalized = normalizeFoundationAssembly(merged, {
          createId: (kind) => newCreationRequestKey(`foundation_${kind}`)
        }).project;
      } catch (e) {
        setLoadError(e?.message || "Foundation assembly could not be normalized.");
        return;
      }
      if (sourceRefreshRef.current?.sourceId === proj.id) sourceRefreshRef.current = null;
      acknowledgedVersionRef.current = { sourceId: proj.id, updated_date: proj.updated_date, ownerId, sourceSnapshot: normalized };
      loadedOwnerRef.current = ownerId;
      const found = draftStore.read();
      if (found.status === "found" || found.status === "invalid") {
        draftSessionRef.current.revision = found.revision ?? null;
        draftSessionRef.current.pending = true;
        setAutoSave(false);
        setDraftOffer(found.status === "found" ? { store: draftStore, revision: found.revision, draft: found.draft, savedAt: found.savedAt, baseUpdatedAt: found.baseUpdatedAt } : { store: draftStore, revision: found.revision, message: found.message });
      } else if (found.status === "unavailable") {
        draftSessionRef.current.revision = null;
        draftSessionRef.current.pending = false;
        setDraftOffer({ store: draftStore, warning: found.message });
      } else {
        draftSessionRef.current.revision = null;
        draftSessionRef.current.pending = false;
        setDraftOffer(null);
      }
      setProject(normalized);
      projectRef.current = normalized;
      const rec = foundationSyncRecoveryState({ project: merged, estimateId, estimate: est });
      if (["pending", "unsupported", "mismatch"].includes(rec.status)) {
        setRecoveryRequired(true);
        setDirty(true);
      } else {
        setRecoveryRequired(false);
      }
      setInventory(normalizeFoundationInventoryRows([...inv || [], ...(concreteServices || []).map(normalizeConcreteSupplier)]));
      setSettings(
        Object.fromEntries((settingRows || []).map((s) => [s.setting_name, s.setting_value]))
      );
    }).catch((error) => {
      if (!active) return;
      console.error("Foundation Builder prerequisites could not be loaded:", error);
      setLoadError(error?.message || "Foundation Builder prerequisites could not be verified.");
    }).finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, estimateId, reloadRevision, ownerId, draftStore]);
  const savedSourceProject = acknowledgedVersionRef.current?.sourceId === project?.id && acknowledgedVersionRef.current?.ownerId === ownerId ? acknowledgedVersionRef.current?.sourceSnapshot ?? null : null;
  const calc = useMemo(
    () => project ? calcProject(project, inventory, settings, { savedProject: savedSourceProject }) : null,
    [project, inventory, settings, savedSourceProject]
  );
  const catalogBlocked = Boolean(calc?.catalogIssues?.length);
  const inputIssues = calc?.inputIssues || [];
  const inputBlocked = inputIssues.length > 0;
  const pricingBlocked = catalogBlocked || inputBlocked;
  const constructionWarnings = calc?.constructionWarnings || [];
  const [catalogReloading, setCatalogReloading] = useState(false);
  const catalogReloadRef = useRef(null);
  const handleCatalogReload = async () => {
    if (draftSessionRef.current.pending) return;
    const live = currentEditorRef.current;
    const generation = live.generation;
    const sourceId = live.sourceId;
    const estimateKey = live.estimateId;
    if (!mountedRef.current || !live.loaded || saveAttemptRef.current || copyFlightRef.current || saveSessionRef.current?.isSaving() || catalogReloadRef.current) return;
    const isCurrentFlight = (flight2) => {
      const l = currentEditorRef.current;
      return mountedRef.current && catalogReloadRef.current === flight2 && l.loaded && l.sourceId === sourceId && l.estimateId === estimateKey && l.generation === generation;
    };
    const flight = (async () => {
      const [inv, concreteServices, settingRows] = await Promise.all([
        loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
        loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
        loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" })
      ]);
      if (!isCurrentFlight(flight)) return;
      bumpEdit();
      setInventory(normalizeFoundationInventoryRows([...inv || [], ...(concreteServices || []).map(normalizeConcreteSupplier)]));
      setSettings(Object.fromEntries((settingRows || []).map((r) => [r.setting_name, r.setting_value])));
      setAutoSave(false);
      setDirty(true);
      setSaveError("");
    })();
    catalogReloadRef.current = flight;
    setCatalogReloading(true);
    try {
      await flight;
    } catch (e) {
      if (isCurrentFlight(flight)) setSaveError("Catalog reload failed: " + (e?.message || "unknown error") + " Last known catalog retained; retry.");
    } finally {
      if (catalogReloadRef.current === flight) {
        const current = isCurrentFlight(flight);
        catalogReloadRef.current = null;
        if (current) setCatalogReloading(false);
      }
    }
  };
  useEffect(() => {
    catalogReloadRef.current = null;
    setCatalogReloading(false);
  }, [id, estimateId, reloadRevision, ownerId]);
  const assemblyIssues = useMemo(() => project ? foundationAssemblyIssues(project) : [], [project]);
  const catalog = useMemo(
    () => ({
      concrete: inventory.filter(
        (i) => ["concrete_service", "bagged_concrete"].includes(i.material_type) && i.show_in_foundation !== false
      ),
      poles: inventory.filter((i) => i.material_type === "pole"),
      walls: inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type)),
      fill: inventory.filter((i) => i.material_type === "fill_material"),
      forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
      caps: inventory.filter((i) => i.material_type === "wall_cap"),
      equipment: inventory.filter((i) => i.material_type === "excavation_equipment")
    }),
    [inventory]
  );
  useEffect(() => {
    if (!autoSave || !dirty || recoveryRequired || pricingBlocked || catalogReloading || catalogReloadRef.current || draftSessionRef.current.pending) return;
    const t = setTimeout(() => saveRef.current?.(), 2e3);
    return () => clearTimeout(t);
  }, [autoSave, dirty, project, recoveryRequired, pricingBlocked, catalogReloading]);
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) saveRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);
  useEffect(() => {
    if (!saving && !dirty && !recoveryRequired && !draftSessionRef.current.pending) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, dirty, recoveryRequired, draftOffer]);
  const navGuardArmedRef = useRef(false);
  useEffect(() => {
    const needsGuard = () => saving || dirty || recoveryRequired || draftSessionRef.current.pending;
    const confirmLeave = () => window.confirm(
      "You have unsaved changes or an unacknowledged Builder sync. Leave without saving?" + (draftSessionRef.current.revision ? " Unsent edits stay backed up in this browser tab only." : "")
    );
    const onClickCapture = (e) => {
      if (!needsGuard() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target?.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    if (!embedded && !navGuardArmedRef.current && needsGuard()) {
      try {
        window.history.pushState({ ccsFoundationLeaveGuard: true }, "", window.location.href);
        navGuardArmedRef.current = true;
      } catch {
      }
    }
    const onPop = (e) => {
      if (!navGuardArmedRef.current) return;
      if (e.state?.ccsFoundationLeaveGuard === true) return;
      if (!needsGuard()) {
        navGuardArmedRef.current = false;
        window.history.back();
        return;
      }
      if (confirmLeave()) {
        navGuardArmedRef.current = false;
        window.history.back();
      } else {
        try {
          window.history.forward();
        } catch {
        }
      }
    };
    document.addEventListener("click", onClickCapture, true);
    if (navGuardArmedRef.current) window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [embedded, saving, dirty, recoveryRequired, draftOffer]);
  const reinforcementEditor = useFoundationReinforcementEditor({
    getCurrent: () => {
      const live = currentEditorRef.current;
      const ack = acknowledgedVersionRef.current;
      return {
        project: projectRef.current,
        savedProject: ack?.sourceSnapshot ?? null,
        inventory,
        settings,
        context: {
          ...live,
          loaded: mountedRef.current && live.loaded,
          ownerId,
          sourceUpdatedAt: ack?.updated_date ?? null,
          estimateUpdatedAt: linkedEstimate?.updated_date ?? null
        },
        blocked: saving || !!saveAttemptRef.current || !!copyFlightRef.current || !!catalogReloadRef.current || catalogReloading || draftSessionRef.current.pending || recoveryRequired || !!sourceRefreshRef.current || !ack?.sourceSnapshot || ack?.ownerId !== ownerId || ack?.sourceId !== live.sourceId
      };
    },
    commit: (updater) => commit(updater)
  });
  if (loading) return /* @__PURE__ */ jsx13("div", { className: "p-10 text-center text-gray-400", children: "Loading section\u2026" });
  if (loadError) return /* @__PURE__ */ jsxs13("div", { className: "p-10 text-center text-red-700 bg-red-50 border border-red-200 rounded", children: [
    "Foundation Builder unavailable. Required project data, foundation inventory, concrete services, or Settings could not be verified. ",
    loadError
  ] });
  if (!project) return /* @__PURE__ */ jsx13("div", { className: "p-10 text-center text-gray-500", children: "Foundation section not found." });
  const persistBrowserDraft = (next) => {
    const session = draftSessionRef.current;
    if (!session.store || session.store !== draftStore || !mountedRef.current) return;
    const ack = acknowledgedVersionRef.current;
    const base2 = ack?.sourceId === id && ack?.ownerId === ownerId ? ack.updated_date : null;
    if (!base2) {
      setDraftOffer({ store: draftStore, warning: "Latest edits could not be backed up; no saved source to anchor the browser draft." });
      return;
    }
    const result = session.store.write({
      project: next,
      baseUpdatedAt: base2,
      token: newCreationRequestKey("foundation_draft"),
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      expectedRevision: session.revision
    });
    if (result.status === "stored") {
      session.revision = result.revision;
      session.pending = false;
      setDraftOffer({ store: draftStore, backedUp: true, message: "Design and customer-pricing edits backed up in this browser tab only \u2014 closing the tab loses them; save to keep all changes." });
    } else if (result.status === "conflict") {
      const latest = session.store.read();
      session.revision = latest.status !== "unavailable" ? latest.revision ?? null : result.revision ?? session.revision;
      session.pending = true;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to merge." });
      } else if (latest.status === "unavailable") setDraftOffer({ store: draftStore, revision: session.revision, message: latest.message || "Draft changed in another tab; could not re-read." });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Draft changed in another tab; review before continuing." });
    } else {
      setDraftOffer({ store: draftStore, warning: `Latest edits could not be backed up; save before leaving. ${result.message || ""}` });
    }
  };
  const commit = (updater, opts = {}) => {
    const live = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live.loaded || live.generation !== saveContext.generation || live.sourceId !== saveContext.sourceId) return false;
    if (draftSessionRef.current.pending && !opts.restoreDraft) return false;
    const prev = projectRef.current ?? project;
    let next;
    try {
      next = normalizeFoundationAssembly(
        { ...prev, ...updater(prev) },
        { previous: prev, createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }
      ).project;
    } catch (e) {
      setSaveError(e?.message || "Foundation assembly update was rejected.");
      return false;
    }
    bumpEdit();
    setHistory((h) => ({ past: [...h.past.slice(-40), prev], future: [] }));
    projectRef.current = next;
    setProject(next);
    setDirty(true);
    if (opts.restoreDraft) draftSessionRef.current.pending = false;
    persistBrowserDraft(next);
    return true;
  };
  const patch = (changes) => commit(() => changes);
  const patchItem = (index, changes) => commit((prev) => ({
    items: prev.items.map((it, i) => i === index ? { ...it, ...changes } : it)
  }));
  const removeItem = (index) => {
    const label = project.items?.[index]?.description || `item ${index + 1}`;
    if (!window.confirm(`Delete "${label}"? Dependent placements are retained for review.`)) return;
    commit((prev) => ({ items: prev.items.filter((_, i) => i !== index) }));
  };
  const duplicateItem = (index) => commit((prev) => {
    const items = [...prev.items];
    items.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(items[index])), component_id: newCreationRequestKey("foundation_item") });
    return { items };
  });
  const addItem = (type) => commit((prev) => ({ items: [...prev.items || [], blankItem(type)] }));
  const restoreBrowserDraft = () => {
    const session = draftSessionRef.current;
    const offer = draftVisible;
    if (!session.store || session.store !== draftStore || !offer?.revision) return;
    const latest = session.store.read();
    if (latest.status !== "found" || latest.revision !== offer.revision) {
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to restore." });
      } else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; nothing restored." });
      return;
    }
    session.revision = latest.revision;
    const baseChanged = latest.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== latest.baseUpdatedAt;
    if ((dirty || baseChanged) && !window.confirm("Restoring the browser draft replaces the current design edits in this editor. Continue?")) return;
    setAutoSave(false);
    if (!commit(() => latest.draft, { restoreDraft: true })) setSaveError("Browser draft could not be applied; offer retained.");
  };
  const discardBrowserDraft = () => {
    const session = draftSessionRef.current;
    const offer = draftVisible;
    if (!session.store || session.store !== draftStore) return;
    if (!window.confirm("Discard the unsent browser draft for this project?")) return;
    const result = session.store.clear(offer?.revision ?? null);
    if (result.status === "removed") {
      session.revision = null;
      session.pending = false;
      setDraftOffer(null);
      if (dirty) persistBrowserDraft(projectRef.current ?? project);
    } else if (result.status === "retained") {
      const latest = session.store.read();
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing kept." });
      } else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be re-read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; kept." });
    } else {
      setDraftOffer({ ...offer, warning: `Browser draft could not be cleared. ${result.message || ""}` });
    }
  };
  const conflictDraftFields = (draft) => {
    const out = {};
    const src = draft && typeof draft === "object" ? draft : {};
    for (const field of FOUNDATION_DRAFT_FIELDS) if (Object.hasOwn(src, field)) out[field] = src[field];
    return out;
  };
  const adoptFreshSavedForConflict = async () => {
    let saved = null;
    try {
      saved = await staffEntities.FoundationProject.get(id);
    } catch {
      saved = null;
    }
    if (!saved || saved.id !== id || typeof saved.updated_date !== "string" || !saved.updated_date) return null;
    let normalizedSaved;
    try {
      normalizedSaved = normalizeFoundationAssembly({
        ...saved,
        excavation_method: saved.excavation_method || "hand_dig",
        project_concrete_type: saved.project_concrete_type || "4000_ae",
        project_concrete_admixtures: saved.project_concrete_admixtures || [],
        items: saved.items || [],
        walls: saved.walls || [],
        poles: saved.poles || [],
        wall_caps: saved.wall_caps || [],
        signage_cabinets: saved.signage_cabinets || [],
        landscape: saved.landscape || { cell_size_inches: 12, cells: {} },
        selected_equipment: saved.selected_equipment || []
      }, { createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }).project;
    } catch {
      return null;
    }
    return { saved, normalizedSaved };
  };
  const handleConflictKeepDraft = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c?.draft || session.store !== draftStore) return false;
    if (c.kind === "draft_vs_saved") {
      const latest = draftStore.read();
      if (latest.status !== "found") return false;
      if (draftVisible?.revision && latest.revision !== draftVisible.revision) {
        session.revision = latest.revision;
        setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
        return false;
      }
      session.revision = latest.revision;
      setAutoSave(false);
      return commit(() => latest.draft, { restoreDraft: true });
    }
    const adopted = await adoptFreshSavedForConflict();
    if (!adopted) return false;
    const stored = draftStore.read();
    if (stored.status === "found" || stored.status === "invalid") draftStore.clear(stored.revision);
    session.revision = null;
    session.pending = false;
    acknowledgedVersionRef.current = { sourceId: id, updated_date: adopted.saved.updated_date, ownerId, sourceSnapshot: adopted.normalizedSaved };
    setAutoSave(false);
    return commit(() => ({ ...adopted.normalizedSaved, ...conflictDraftFields(c.draft) }), { restoreDraft: true });
  });
  const handleConflictKeepSaved = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c || session.store !== draftStore) return false;
    if (c.kind === "draft_vs_saved") {
      const cleared = draftStore.clear(draftVisible?.revision ?? session.revision ?? null);
      if (cleared.status !== "removed") {
        const latest = draftStore.read();
        if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
        else if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
        return false;
      }
      session.revision = null;
      session.pending = false;
      setDraftOffer(null);
      if (dirty) persistBrowserDraft(projectRef.current ?? project);
      return true;
    }
    const stored = draftStore.read();
    if (stored.status === "found" || stored.status === "invalid") draftStore.clear(stored.revision);
    session.revision = null;
    session.pending = false;
    setDraftOffer(null);
    setReloadRevision((r) => r + 1);
    return true;
  });
  const handleConflictKeepBoth = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c?.draft || session.store !== draftStore) return false;
    const baseRev = c.summary?.savedUpdatedAt ?? acknowledgedVersionRef.current?.updated_date ?? null;
    const rebase = foundationDraftRebaseProject({ draft: c.draft, sourceId: id });
    if (!rebase || !baseRev) return false;
    const stored = draftStore.read();
    if (stored.status === "unavailable") return false;
    const expectedRevision = stored.status === "found" || stored.status === "invalid" ? stored.revision ?? null : null;
    const w = draftStore.write({ project: rebase, baseUpdatedAt: baseRev, token: newCreationRequestKey("foundation_draft"), savedAt: (/* @__PURE__ */ new Date()).toISOString(), expectedRevision });
    if (w.status !== "stored") {
      const after = draftStore.read();
      if (after.status === "found") {
        session.revision = after.revision;
        setDraftOffer({ store: draftStore, revision: after.revision, draft: after.draft, savedAt: after.savedAt, baseUpdatedAt: after.baseUpdatedAt, conflict: true });
      }
      return false;
    }
    session.revision = w.revision;
    if (c.kind === "save_conflict") {
      setReloadRevision((r) => r + 1);
    } else {
      session.pending = true;
      setDraftOffer({ store: draftStore, revision: w.revision, draft: w.draft, savedAt: (/* @__PURE__ */ new Date()).toISOString(), baseUpdatedAt: baseRev });
    }
    return true;
  });
  const cabinetCost = calc.totals.total_signage_cabinet_cost;
  const landscapeCost = calc.totals.total_landscape_cost;
  const sectionTotal = calc.totals.grand_total === null || cabinetCost === null || landscapeCost === null ? null : calc.totals.grand_total + cabinetCost + landscapeCost;
  const savedSectionTotal = foundationRecordSavedTotal(savedSourceProject);
  const undo = () => {
    const live = currentEditorRef.current;
    if (!history.past.length || !live.loaded || live.generation !== saveContext.generation || draftSessionRef.current.pending) return;
    bumpEdit();
    const prevState = history.past[history.past.length - 1];
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [project, ...h.future] }));
    projectRef.current = prevState;
    setProject(prevState);
    setDirty(true);
    persistBrowserDraft(prevState);
  };
  const redo = () => {
    const live = currentEditorRef.current;
    if (!history.future.length || !live.loaded || live.generation !== saveContext.generation || draftSessionRef.current.pending) return;
    bumpEdit();
    const nextState = history.future[0];
    setHistory((h) => ({ past: [...h.past, project], future: h.future.slice(1) }));
    projectRef.current = nextState;
    setProject(nextState);
    setDirty(true);
    persistBrowserDraft(nextState);
  };
  const payload = () => ({
    project_name: project.project_name,
    notes: project.notes,
    status: "calculated",
    assembly_schema_version: project.assembly_schema_version ?? 1,
    items: calc.items,
    selected_equipment: calc.equipment,
    walls: calc.walls,
    // Persist the calculated snapshots too. SignEstimate Pro stored raw pole/cap
    // placement; CCS keeps those original fields plus their calculated values so
    // a later Builder/BOM sync can preserve the exact accepted cost without
    // requiring a live catalog recalc.
    wall_caps: calc.wallCaps,
    poles: calc.poles,
    signage_cabinets: project.signage_cabinets || [],
    landscape: project.landscape || { cell_size_inches: 12, cells: {} },
    total_signage_cabinet_cost: cabinetCost,
    total_landscape_cost: landscapeCost,
    customer_markup_percent: project.customer_markup_percent || 0,
    customer_price_override: project.customer_price_override,
    customer_pricing: project.customer_pricing,
    excavation_method: project.excavation_method,
    selected_concrete_id: project.selected_concrete_id,
    project_concrete_type: project.project_concrete_type,
    project_concrete_admixtures: project.project_concrete_admixtures || [],
    concrete_cost_per_cy: project.concrete_cost_per_cy,
    rebar_cost_per_ft: project.rebar_cost_per_ft,
    forming_materials_cost_spread_foot: project.forming_materials_cost_spread_foot,
    forming_materials_cost_pillar: project.forming_materials_cost_pillar,
    min_excavation_time_hours: project.min_excavation_time_hours,
    hand_dig_excavation_cost_per_cy: project.hand_dig_excavation_cost_per_cy,
    equipment_excavation_cost_per_cy: project.equipment_excavation_cost_per_cy,
    forming_labor_rate: project.forming_labor_rate,
    pouring_labor_rate: project.pouring_labor_rate,
    finishing_labor_rate: project.finishing_labor_rate,
    hand_dig_labor_rate: project.hand_dig_labor_rate,
    equipment_excavation_labor_rate: project.equipment_excavation_labor_rate,
    ai_engineering_recommendation: project.ai_engineering_recommendation,
    ai_engineering_data: project.ai_engineering_data,
    design_basis: project.design_basis,
    site_hazard: project.site_hazard,
    concrete_delivery_snapshot: captureConcreteDeliverySnapshot(calc.delivery),
    total_concrete_cost: calc.totals.total_concrete_cost,
    total_rebar_cost: calc.totals.total_rebar_cost,
    total_excavation_cost: calc.totals.total_excavation_cost,
    total_labor_cost: calc.totals.total_labor_cost,
    total_equipment_cost: calc.totals.total_equipment_cost,
    total_forming_materials_cost: calc.totals.total_forming_materials_cost,
    total_pole_cost: calc.totals.total_pole_cost,
    total_pole_painting_cost: calc.totals.total_pole_painting_cost,
    total_brick_cost: calc.totals.total_brick_cost,
    total_fill_cost: calc.totals.total_fill_cost,
    total_wall_cost: calc.totals.total_wall_cost,
    total_wall_cap_cost: calc.totals.total_wall_cap_cost
  });
  const saveContext = { ...currentEditorRef.current };
  const runSave = (intent) => {
    const attemptKey = `${saveContext.generation}|${saveContext.editRevision}|${intent}`;
    const liveNow = currentEditorRef.current;
    const staleOutcome = { status: "superseded", sourceId: saveContext.sourceId, sourceVersion: null, savedEditRevision: saveContext.editRevision, sourceSaved: false, builderSync: "not_required", error: null, warnings: [] };
    if (!(mountedRef.current && saveContext.loaded && liveNow.loaded && liveNow.sourceId === saveContext.sourceId && liveNow.generation === saveContext.generation && liveNow.editRevision === saveContext.editRevision)) {
      return Promise.resolve(staleOutcome);
    }
    if (copyFlightRef.current) return Promise.resolve(staleOutcome);
    if (draftSessionRef.current.pending) return Promise.resolve({ ...staleOutcome, status: "conflict", error: new Error("Resolve the unsent browser draft offer before saving.") });
    {
      const marker = sourceRefreshRef.current;
      if (marker && liveNow.loaded && liveNow.sourceId === marker.sourceId && liveNow.generation === marker.generation) {
        return Promise.resolve({ ...staleOutcome, status: "conflict", error: new Error("The project must be reloaded after the earlier save finished.") });
      }
    }
    const existing = saveAttemptRef.current;
    if (existing) return existing.promise;
    if (catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before saving.");
      setDirty(true);
      return Promise.resolve({ ...staleOutcome, status: "failed", error: new Error("Save paused: fix highlighted design inputs or catalog selections.") });
    }
    const captured = {
      project,
      estimateId,
      basePayload: payload(),
      draftStoreRef: draftStore,
      draftOwner: ownerId,
      draftRevision: draftSessionRef.current.revision,
      items: calc.items,
      equipment: calc.equipment,
      walls: calc.walls,
      poles: calc.poles,
      wallCaps: calc.wallCaps,
      delivery: calc.delivery,
      totals: calc.totals,
      sectionTotal,
      cabinetCost,
      landscapeCost,
      computedPricing: void 0
    };
    lastSyncCaptureRef.current = {
      builderCalculation: { totals: captured.totals, delivery: captured.delivery, cabinet_cost: captured.cabinetCost, landscape_cost: captured.landscapeCost, section_total: captured.sectionTotal },
      liveTotal: captured.sectionTotal
    };
    if (!saveContext.loaded) {
      return Promise.resolve(staleOutcome);
    }
    setSaveError("");
    setSaving(true);
    const promise = saveSessionRef.current.run({
      sourceId: saveContext.sourceId,
      editRevision: saveContext.editRevision,
      getCurrent: () => ({ ...currentEditorRef.current, loaded: mountedRef.current && currentEditorRef.current.loaded }),
      saveSource: async () => {
        const recoveryAck = acknowledgedVersionRef.current;
        const recovery = await loadFoundationBuilderRecovery({
          sourceId: saveContext.sourceId,
          estimateId: captured.estimateId,
          expectedSourceVersion: recoveryAck?.sourceId === saveContext.sourceId ? recoveryAck.updated_date : captured.project.updated_date
        });
        if (recovery) {
          captured.builderRecovery = recovery;
          captured.recoveryMatchesCurrent = sourcePatchMatches(recovery.sourceProject, captured.basePayload);
          return recovery.sourceProject;
        }
        if (pricingBlocked) {
          throw Object.assign(new Error("Save paused: fix highlighted design inputs or catalog selections."), { pricingUnavailable: true });
        }
        let customerPricing = captured.project.customer_pricing;
        if (captured.project.customer_pricing?.applied === true) {
          customerPricing = await calculateSavedCustomerPricing({
            project: { ...captured.project, ...captured.basePayload },
            categorize: categorizeFoundationProject,
            tierNumber: captured.project.customer_pricing?.tier_number
          });
          captured.computedPricing = customerPricing;
          const live = currentEditorRef.current;
          if (!(mountedRef.current && live.sourceId === saveContext.sourceId && live.generation === saveContext.generation && live.editRevision === saveContext.editRevision && live.loaded)) {
            throw Object.assign(new Error("Save superseded by a newer edit or route change."), { superseded: true });
          }
        }
        {
          const receipt = await resolveFoundationSyncReceiptForSave({
            project: captured.project,
            estimateId: captured.estimateId,
            getEstimate: (id2) => staffEntities.AllInOneEstimate.get(id2)
          });
          if (!receipt.ok) throw new Error(receipt.error);
          captured.clearStaleSyncReceipt = receipt.clearStaleReceipt === true;
        }
        if (captured.estimateId) {
          captured.syncAttempt = createFoundationSyncAttempt({
            sourceId: captured.project.id,
            estimateId: captured.estimateId,
            key: newCreationRequestKey("foundation_sync"),
            requestedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        const ack = acknowledgedVersionRef.current;
        const expectedUpdatedAt = ack?.sourceId === saveContext.sourceId ? ack.updated_date : captured.project.updated_date;
        return updateBuilderSourceProject({
          entity: staffEntities.FoundationProject,
          sourceId: saveContext.sourceId,
          expectedUpdatedAt,
          data: { ...captured.basePayload, customer_pricing: customerPricing, ...captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : captured.clearStaleSyncReceipt ? { builder_sync_attempt: null } : {} },
          estimateId: captured.estimateId,
          label: "Foundation project"
        });
      },
      syncBuilder: captured.estimateId ? async (savedProject) => recordBuilderSave({
        estimateId: captured.estimateId,
        line: { project_id: saveContext.sourceId, module_key: "foundation" },
        sourceProject: captured.builderRecovery ? savedProject : {
          ...savedProject,
          items: captured.items,
          selected_equipment: captured.equipment,
          walls: captured.walls,
          poles: captured.poles,
          wall_caps: captured.wallCaps,
          builder_calculation: { totals: captured.totals, delivery: captured.delivery, cabinet_cost: captured.cabinetCost, landscape_cost: captured.landscapeCost, section_total: captured.sectionTotal }
        },
        liveTotal: captured.builderRecovery ? void 0 : captured.sectionTotal,
        ...captured.builderRecovery ? { expectedPendingKey: captured.builderRecovery.pendingKey } : {}
      }).then(async (result) => {
        if (captured.builderRecovery) {
          await verifyFoundationRecoverySource({ sourceId: savedProject.id, expectedSourceVersion: savedProject.updated_date });
        }
        const ackLine = result?.line || result;
        assertFoundationBuilderAcknowledgment({ sourceProject: savedProject, estimateId: captured.estimateId, line: ackLine });
        captured.ackLine = ackLine;
        return result;
      }) : null
    }).then((outcome) => {
      if (!mountedRef.current) return outcome;
      const live = currentEditorRef.current;
      const sameContext = live.generation === saveContext.generation && live.sourceId === saveContext.sourceId;
      const fullyCurrent = sameContext && live.editRevision === saveContext.editRevision && live.loaded;
      if (outcome.sourceSaved && live.generation !== saveContext.generation) {
        const prevEpoch = sourceWriteEpochRef.current.get(outcome.sourceId) || { epoch: 0 };
        sourceWriteEpochRef.current.set(outcome.sourceId, { epoch: prevEpoch.epoch + 1, lastSavedVersion: outcome.sourceVersion });
      }
      if (outcome.sourceSaved && live.loaded && live.sourceId === outcome.sourceId && live.generation !== saveContext.generation && projectRef.current?.updated_date !== outcome.sourceVersion) {
        sourceRefreshRef.current = { sourceId: live.sourceId, generation: live.generation, sourceVersion: outcome.sourceVersion };
        setDirty(true);
        setSaveError("An earlier save finished after you navigated away. Reload the saved project before saving again.");
      }
      if (outcome.sourceSaved && outcome.sourceVersion && sameContext) {
        acknowledgedVersionRef.current = {
          sourceId: outcome.sourceId,
          updated_date: outcome.sourceVersion,
          ownerId,
          sourceSnapshot: captured.builderRecovery ? captured.builderRecovery.sourceProject : {
            ...captured.project,
            ...captured.basePayload,
            id: outcome.sourceId,
            updated_date: outcome.sourceVersion
          }
        };
      }
      if (captured.builderRecovery && outcome.builderSync === "synced" && sameContext) {
        setRecoveryRequired(false);
        setProject((prev) => prev?.id === outcome.sourceId ? { ...prev, updated_date: outcome.sourceVersion, builder_sync_attempt: captured.builderRecovery.sourceProject.builder_sync_attempt } : prev);
        if (!fullyCurrent || !captured.recoveryMatchesCurrent) {
          if (captured.ackLine) {
            setLinkedEstimate((prev) => prev?.id === captured.estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === outcome.sourceId ? captured.ackLine : it) } : prev);
          }
          setAutoSave(false);
          setDirty(true);
          setSaveError("Previous Builder synchronization recovered. Review and save your unsent changes separately.");
          outcome.status = "superseded";
          outcome.warnings.push("previous_sync_recovered_unsent_changes_remain");
          return outcome;
        }
      }
      if (outcome.status === "saved" && fullyCurrent) {
        setRecoveryRequired(false);
        setProject((prev) => prev && prev.id === outcome.sourceId ? { ...prev, updated_date: outcome.sourceVersion, ...captured.computedPricing !== void 0 ? { customer_pricing: captured.computedPricing } : {}, ...captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : {} } : prev);
        if (captured.ackLine) {
          setLinkedEstimate((prev) => prev && prev.id === captured.estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === outcome.sourceId ? captured.ackLine : it) } : prev);
        }
        setDirty(false);
        setSaveError("");
        if (draftSessionRef.current.store === captured.draftStoreRef && captured.draftOwner === ownerId && captured.draftRevision) {
          const cleared = captured.draftStoreRef.clear(captured.draftRevision);
          if (cleared.status === "removed") {
            draftSessionRef.current.revision = null;
            setDraftOffer((o) => o?.store === draftStore ? { store: draftStore } : o);
          } else if (cleared.status === "unavailable") setDraftOffer((o) => o?.store === draftStore ? { store: draftStore, warning: `Saved, but the browser draft backup could not be cleared. ${cleared.message || ""}` } : o);
          else if (cleared.status === "retained") setDraftOffer((o) => o?.store === draftStore ? { store: draftStore, warning: "Saved; a newer browser draft remains - review it before leaving." } : o);
        }
        try {
          onSaved?.();
        } catch (e) {
          console.error(e);
          outcome.warnings.push("observer_error");
        }
      } else if (sameContext && outcome.status === "superseded" && outcome.builderSync === "pending") {
        setRecoveryRequired(true);
        setSaveError("Source saved; estimate/Builder sync incomplete. Retry save.");
        setDirty(true);
      } else if (sameContext && outcome.status === "partial") {
        setRecoveryRequired(true);
        setSaveError("Source saved; estimate/Builder sync incomplete. Retry save.");
        setDirty(true);
      } else if (sameContext && (outcome.status === "conflict" || outcome.status === "failed")) {
        if (outcome.status === "conflict" && outcome.conflictDetected) {
          const latestDraft = draftSessionRef.current.store === draftStore ? draftStore.read() : { status: "unavailable" };
          const draftBackedUp = latestDraft.status === "found";
          syncConflict.openSaveConflict({
            draft: draftBackedUp ? latestDraft.draft : projectRef.current ?? project,
            draftSavedAt: draftBackedUp ? latestDraft.savedAt ?? null : null,
            baseUpdatedAt: draftBackedUp ? latestDraft.baseUpdatedAt ?? null : acknowledgedVersionRef.current?.updated_date ?? null,
            getSavedProject: () => staffEntities.FoundationProject.get(id),
            hasUnbackedEdits: !draftBackedUp
          });
        }
        setSaveError(outcome.error?.pricingUnavailable ? "Pricing unavailable: fix highlighted design inputs or catalog selections before saving." : "Save failed: " + (outcome.error?.message || outcome.status));
        setDirty(true);
      }
      return outcome;
    }).finally(() => {
      if (saveAttemptRef.current?.promise === promise) {
        saveAttemptRef.current = null;
        if (mountedRef.current) setSaving(saveSessionRef.current.isSaving());
      }
    });
    saveAttemptRef.current = { key: attemptKey, promise };
    return promise;
  };
  const handleSave = () => runSave("save");
  saveRef.current = handleSave;
  const handleReloadSaved = () => {
    const marker = sourceRefreshRef.current;
    const live = currentEditorRef.current;
    if (!marker || !mountedRef.current || !live.loaded || live.sourceId !== marker.sourceId || live.generation !== marker.generation) return;
    if (dirty && !window.confirm("Reload the saved project and discard current unsaved changes?")) return;
    currentEditorRef.current = { ...currentEditorRef.current, loaded: false };
    setReloadRevision((r) => r + 1);
  };
  const backTo = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator";
  const handleSaveAndExit = async () => {
    const outcome = await runSave("save_exit");
    const c = currentEditorRef.current;
    if (outcome?.status === "saved" && mountedRef.current && c.generation === saveContext.generation && c.sourceId === saveContext.sourceId && outcome.sourceId === c.sourceId && outcome.savedEditRevision === c.editRevision && c.editRevision === saveContext.editRevision && c.loaded === true && exitGenerationRef.current !== c.generation) {
      exitGenerationRef.current = c.generation;
      if (embedded) onClose?.();
      else navigate(backTo);
    }
    return outcome;
  };
  const handleSaveAsCopy = () => {
    if (draftSessionRef.current.pending) return;
    if (copyFlightRef.current) return copyFlightRef.current;
    const live0 = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live0.loaded || live0.generation !== saveContext.generation || live0.sourceId !== saveContext.sourceId || live0.estimateId !== saveContext.estimateId || live0.editRevision !== saveContext.editRevision) return null;
    if (saveAttemptRef.current || saveSessionRef.current?.isSaving()) return null;
    if (pricingBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before copying.");
      return null;
    }
    const gen = saveContext.generation;
    const sourceId = saveContext.sourceId;
    const estimateKey = saveContext.estimateId;
    const editRev = saveContext.editRevision;
    let attempt;
    try {
      const baseData = {
        ...payload(),
        project_name: `${project.project_name || "Foundation"} (Copy)`,
        client_name: project.client_name,
        customer_id: project.customer_id,
        // Same-job metadata payload() does not own — a copy keeps the
        // document link, the saved estimate-number lineage (mirroring
        // convertFoundationToBrickStone), the persisted beautify brief
        // image, and any externally-set pricing-engine context.
        estimate_number: project.estimate_number,
        hyperlink: project.hyperlink,
        beautify_data_url: project.beautify_data_url,
        pricing_engine: project.pricing_engine
      };
      const signature = JSON.stringify(baseData);
      if (copyAttemptRef.current.signature !== signature) {
        const { components } = cloneFoundationComponents(
          {
            items: calc.items || [],
            walls: calc.walls || [],
            poles: calc.poles || [],
            wall_caps: calc.wallCaps || [],
            signage_cabinets: project.signage_cabinets || []
          },
          { createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }
        );
        const data = { ...baseData, ...components, status: "draft" };
        delete data.builder_sync_attempt;
        copyAttemptRef.current = { signature, key: newCreationRequestKey("foundation_project_copy"), data };
      }
      attempt = copyAttemptRef.current;
    } catch (e) {
      setSaveError(e?.message || "Foundation project copy could not be prepared.");
      return null;
    }
    const run = Promise.resolve().then(async () => {
      const live = currentEditorRef.current;
      if (!mountedRef.current || !live.loaded || live.generation !== gen || live.sourceId !== sourceId || live.estimateId !== estimateKey || live.editRevision !== editRev) return;
      setSaving(true);
      try {
        const copy = await ensureIdempotentEntityCreate({
          entity: staffEntities.FoundationProject,
          keyField: "creation_request_key",
          key: attempt.key,
          data: attempt.data,
          label: "Foundation project copy"
        });
        if (!copy?.id) throw new Error("Foundation project copy could not be verified.");
        const live2 = currentEditorRef.current;
        if (!mountedRef.current || !live2.loaded || live2.generation !== gen || live2.sourceId !== sourceId || live2.estimateId !== estimateKey || live2.editRevision !== editRev) return;
        navigate(`/FoundationEstimator?id=${encodeURIComponent(copy.id)}`);
      } catch (e) {
        if (mountedRef.current && currentEditorRef.current.loaded && currentEditorRef.current.generation === gen && currentEditorRef.current.sourceId === sourceId) {
          console.error(e);
          alert("Save failed: " + e.message);
        }
      }
    });
    const wrapped = run.finally(() => {
      if (copyFlightRef.current !== wrapped) return;
      copyFlightRef.current = null;
      if (mountedRef.current) setSaving(Boolean(saveSessionRef.current?.isSaving()) || Boolean(saveAttemptRef.current));
    });
    copyFlightRef.current = wrapped;
    return wrapped;
  };
  const handleSwapToBrickStone = async () => {
    if (draftSessionRef.current.pending) return;
    const live = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live.loaded || live.generation !== saveContext.generation || live.sourceId !== saveContext.sourceId || live.estimateId !== saveContext.estimateId || live.editRevision !== saveContext.editRevision) return null;
    if (pricingBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before swapping.");
      return null;
    }
    setSaving(true);
    try {
      const draft = await convertFoundationToBrickStone({ project, attemptRef: swapAttemptRef });
      navigate(`/BrickStoneEstimator?id=${draft.id}`);
    } catch (e) {
      console.error(e);
      alert("Swap failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const handleShareLink = async () => {
    if (draftSessionRef.current.pending) return;
    try {
      const url = await createEstimateReadOnlyShareLink({ estimateId });
      await navigator.clipboard.writeText(url);
      alert("Read-only link copied to clipboard:\n" + url);
    } catch (e) {
      console.error(e);
      alert("Share link failed: " + e.message);
    }
  };
  return /* @__PURE__ */ jsxs13("div", { className: "clay-scope min-h-full bg-gray-50", children: [
    /* @__PURE__ */ jsxs13("div", { className: "max-w-[1500px] mx-auto p-4", children: [
      /* @__PURE__ */ jsx13(FoundationSectionBanner, { sectionName: project.project_name }),
      saveError && /* @__PURE__ */ jsx13("div", { role: "alert", className: "mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800", children: saveError }),
      catalogBlocked && /* @__PURE__ */ jsxs13("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsx13("div", { className: "font-semibold", children: "Pricing unavailable: selected materials or rental items need attention. Unavailable items show saved amounts only; other amounts may be recalculated. Save and estimate handoff are paused." }),
        /* @__PURE__ */ jsx13("ul", { className: "mt-1 list-disc pl-5", children: calc.catalogIssues.map((i, idx) => /* @__PURE__ */ jsx13("li", { children: i.message }, idx)) }),
        /* @__PURE__ */ jsx13(
          "button",
          {
            type: "button",
            onClick: handleCatalogReload,
            disabled: catalogReloading || loading || saving,
            className: "mt-2 rounded-sm border border-amber-400 bg-white px-2 py-1 text-[12px] font-semibold text-amber-800 disabled:opacity-50",
            children: catalogReloading ? "Reloading catalogs\u2026" : "Reload catalogs"
          }
        )
      ] }),
      inputBlocked && /* @__PURE__ */ jsxs13("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsx13("div", { className: "font-semibold", children: "Design input required: fix highlighted design inputs below. Save and estimate handoff are paused." }),
        /* @__PURE__ */ jsx13("ul", { className: "mt-1 list-disc pl-5", children: inputIssues.map((i, idx) => /* @__PURE__ */ jsx13("li", { children: i.message }, idx)) })
      ] }),
      (() => {
        const marker = sourceRefreshRef.current;
        const live = currentEditorRef.current;
        if (!marker || !live.loaded || live.sourceId !== marker.sourceId || live.generation !== marker.generation) return null;
        return /* @__PURE__ */ jsxs13("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800", children: [
          "An earlier save finished after this view changed. Reload the saved project before saving again.",
          /* @__PURE__ */ jsx13("button", { type: "button", onClick: handleReloadSaved, className: "ml-2 font-semibold underline", children: "Reload saved project" })
        ] });
      })(),
      (() => {
        const recovery = foundationSyncRecoveryState({ project, estimateId, estimate: linkedEstimate });
        if (!["pending", "unsupported", "mismatch"].includes(recovery.status) && !recoveryRequired) return null;
        const detail = recovery.status === "mismatch" && recovery.attempt?.estimate_id ? "Open the linked estimate to review." : recovery.message || "A saved Builder sync attempt is still unacknowledged.";
        return /* @__PURE__ */ jsxs13(Fragment5, { children: [
          /* @__PURE__ */ jsxs13("div", { role: "status", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 flex items-center gap-3", children: [
            /* @__PURE__ */ jsxs13("span", { children: [
              detail,
              " Current displayed totals will be synchronized; accepted quote prices remain under the platform workflow. ",
              dirty ? "You also have unsaved local edits." : ""
            ] }),
            recovery.status === "mismatch" && recovery.attempt?.estimate_id && /* @__PURE__ */ jsx13("a", { className: "underline", href: `/EstimateDetail?id=${encodeURIComponent(recovery.attempt.estimate_id)}`, children: "Open estimate" }),
            /* @__PURE__ */ jsx13("button", { type: "button", disabled: saving || recovery.status === "unsupported" || recovery.status === "mismatch", className: "px-2 py-1 rounded bg-amber-600 text-white disabled:opacity-50", onClick: () => saveRef.current?.(), children: "Review and retry Save" })
          ] }),
          /* @__PURE__ */ jsx13("div", { className: "mb-3", children: /* @__PURE__ */ jsx13(
            FoundationSyncRetryAction,
            {
              retryState: classifyFoundationSyncRetry({ project, estimateId, estimate: linkedEstimate }),
              retrying: syncRetry.retrying,
              lastOutcome: syncRetry.lastOutcome,
              estimateHref: estimateId ? `/EstimateDetail?id=${estimateId}` : null,
              onRetry: async () => {
                const o = await syncRetry.retry();
                if (o?.status === "synced" || o?.status === "already_synced") {
                  setRecoveryRequired(false);
                  if (o.line) setLinkedEstimate((prev) => prev && prev.id === estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === id ? o.line : it) } : prev);
                }
              }
            }
          ) })
        ] });
      })(),
      assemblyIssues.length > 0 && /* @__PURE__ */ jsxs13("div", { role: "status", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900", children: [
        /* @__PURE__ */ jsx13("span", { className: "font-semibold", children: "Unresolved placements" }),
        /* @__PURE__ */ jsx13("ul", { className: "list-disc pl-5 mt-1 space-y-0.5", children: assemblyIssues.map((issue, i) => /* @__PURE__ */ jsx13("li", { children: issue.message }, `${issue.code}-${issue.kind}-${issue.componentId || ""}-${issue.parentId || ""}-${i}`)) })
      ] }),
      constructionWarnings.length > 0 && /* @__PURE__ */ jsxs13("div", { role: "status", className: "mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] text-blue-900", children: [
        /* @__PURE__ */ jsx13("span", { className: "font-semibold", children: "Construction checks \u2014 verify before build" }),
        /* @__PURE__ */ jsx13("ul", { className: "list-disc pl-5 mt-1 space-y-0.5", children: constructionWarnings.map((warning, i) => /* @__PURE__ */ jsx13("li", { children: warning.message }, `${warning.code}-${warning.kind}-${warning.index ?? ""}-${i}`)) })
      ] }),
      draftVisible?.backedUp && !draftVisible?.warning && /* @__PURE__ */ jsx13("div", { role: "status", className: "mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[13px] text-blue-900", children: draftVisible.message }),
      draftVisible?.warning && /* @__PURE__ */ jsx13("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: draftVisible.warning }),
      (draftVisible?.draft || draftVisible?.message) && draftSessionRef.current.pending && /* @__PURE__ */ jsx13("div", { role: "alert", className: "mb-3 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-[13px] text-indigo-900", children: draftVisible.draft ? /* @__PURE__ */ jsxs13(Fragment5, { children: [
        /* @__PURE__ */ jsxs13("div", { className: "font-semibold", children: [
          "Unsent browser-tab draft found. Nothing restored or sent. ",
          draftVisible.savedAt ? `Saved ${draftVisible.savedAt}.` : "",
          " Recovery covers design and customer-pricing fields; customer links and saved receipts stay as stored."
        ] }),
        draftVisible.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== draftVisible.baseUpdatedAt && /* @__PURE__ */ jsxs13("div", { className: "mt-1", children: [
          "Saved project changed since these edits.",
          /* @__PURE__ */ jsx13(
            "button",
            {
              type: "button",
              className: "ml-2 font-semibold underline",
              onClick: () => syncConflict.openDraftConflict({
                draft: draftVisible.draft,
                draftSavedAt: draftVisible.savedAt ?? null,
                baseUpdatedAt: draftVisible.baseUpdatedAt,
                savedProject: acknowledgedVersionRef.current?.sourceSnapshot ?? null,
                getSavedProject: () => staffEntities.FoundationProject.get(id)
              }),
              children: "Review changes"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs13("div", { className: "mt-2 flex gap-2", children: [
          /* @__PURE__ */ jsx13("button", { type: "button", onClick: restoreBrowserDraft, className: "rounded-sm border border-indigo-400 bg-white px-2 py-1 text-[12px] font-semibold text-indigo-800", children: "Restore browser draft" }),
          /* @__PURE__ */ jsx13("button", { type: "button", onClick: discardBrowserDraft, className: "rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700", children: "Discard browser draft" })
        ] })
      ] }) : /* @__PURE__ */ jsxs13(Fragment5, { children: [
        /* @__PURE__ */ jsxs13("div", { className: "font-semibold", children: [
          "A browser draft exists but cannot be restored. ",
          draftVisible.message || "",
          " Recovery covers design and customer-pricing fields; customer links and saved receipts stay as stored."
        ] }),
        /* @__PURE__ */ jsx13("div", { className: "mt-2", children: /* @__PURE__ */ jsx13("button", { type: "button", onClick: discardBrowserDraft, className: "rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700", children: "Discard browser draft" }) })
      ] }) }),
      /* @__PURE__ */ jsxs13("fieldset", { disabled: draftSessionRef.current.pending, className: "contents min-w-0", children: [
        /* @__PURE__ */ jsx13(
          FoundationToolbar,
          {
            title: "Edit Concrete | Masonry | Poles Estimate",
            subtitle: "Engineering, foundation, excavation, wall & pole estimating",
            backTo,
            total: sectionTotal,
            saving,
            dirty: dirty || draftSessionRef.current.pending,
            lastSavedAt: project?.updated_date,
            autoSave,
            pricingUnavailable: pricingBlocked,
            onToggleAutoSave: () => {
              if (!draftSessionRef.current.pending) setAutoSave((v) => !v);
            },
            canUndo: history.past.length > 0,
            canRedo: history.future.length > 0,
            onUndo: undo,
            onRedo: redo,
            onSave: handleSave,
            onSaveAndExit: handleSaveAndExit,
            onSaveAsCopy: handleSaveAsCopy,
            onSaveAsTemplate: () => {
              if (!draftSessionRef.current.pending) setTemplateMode("save");
            },
            onTemplates: () => {
              if (!draftSessionRef.current.pending) setTemplateMode("load");
            },
            onSwapToBrickStone: handleSwapToBrickStone,
            onShareLink: estimateId ? handleShareLink : void 0,
            onHelp: () => setShowHelp((v) => !v),
            onBack: embedded ? () => {
              if (saving) return;
              if ((dirty || recoveryRequired) && !window.confirm("You have unsaved changes or an unacknowledged Builder sync. Leave without saving?")) return;
              onClose?.();
            } : () => {
              if (saving) return;
              if ((dirty || recoveryRequired) && !window.confirm("You have unsaved changes or an unacknowledged Builder sync. Leave without saving?")) return;
              navigate(backTo);
            }
          }
        ),
        showHelp && /* @__PURE__ */ jsxs13("div", { className: "bg-blue-50 border border-blue-200 rounded-sm p-3 mb-3 text-[12px] text-blue-900", children: [
          "Add each footing or pillar under ",
          /* @__PURE__ */ jsx13("b", { children: "Foundation" }),
          ", then place poles, masonry walls and caps in the other tabs. Concrete, rebar, excavation and labor rates come from your settings and supplier inventory. The 3D preview on the right updates as you type \u2014 left drag orbits, right drag pans, scroll zooms. Save & Exit pushes the total back to the combined estimate."
        ] }),
        /* @__PURE__ */ jsxs13("div", { className: "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_560px] gap-4 items-start", children: [
          /* @__PURE__ */ jsx13("div", { children: /* @__PURE__ */ jsxs13(Tabs, { defaultValue: "foundations", children: [
            /* @__PURE__ */ jsxs13(TabsList, { className: "flex flex-wrap h-auto bg-white border border-gray-200 p-1 mb-3 rounded-sm justify-start", children: [
              /* @__PURE__ */ jsxs13(TabsTrigger, { value: "foundations", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx13(Anchor, { className: "w-3.5 h-3.5" }),
                " Foundation (",
                calc.items.length,
                ")"
              ] }),
              /* @__PURE__ */ jsxs13(TabsTrigger, { value: "landscape", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx13(LayoutGrid, { className: "w-3.5 h-3.5" }),
                " Walls & Poles (",
                (calc.walls?.length || 0) + (calc.poles?.length || 0),
                ")"
              ] }),
              /* @__PURE__ */ jsxs13(TabsTrigger, { value: "caps", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx13(Layers, { className: "w-3.5 h-3.5" }),
                " Wall Caps"
              ] }),
              /* @__PURE__ */ jsxs13(TabsTrigger, { value: "signage", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx13(Trees, { className: "w-3.5 h-3.5" }),
                " Signage & Landscape"
              ] }),
              /* @__PURE__ */ jsxs13(TabsTrigger, { value: "equipment", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx13(Wrench, { className: "w-3.5 h-3.5" }),
                " Equipment"
              ] }),
              /* @__PURE__ */ jsxs13(TabsTrigger, { value: "summary", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx13(TrendingUp, { className: "w-3.5 h-3.5" }),
                " Cost Summary"
              ] }),
              /* @__PURE__ */ jsxs13(TabsTrigger, { value: "bom", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx13(ClipboardList, { className: "w-3.5 h-3.5" }),
                " Bill of Materials"
              ] }),
              /* @__PURE__ */ jsxs13(TabsTrigger, { value: "pricing", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx13(Tag, { className: "w-3.5 h-3.5" }),
                " Customer Pricing"
              ] })
            ] }),
            /* @__PURE__ */ jsxs13(TabsContent, { value: "foundations", className: "space-y-3", children: [
              /* @__PURE__ */ jsx13(AiEngineeringAssistant, { project, onResult: patch }),
              calc.items.length === 0 ? /* @__PURE__ */ jsx13("div", { className: "text-center py-12 bg-white rounded-sm border border-dashed border-gray-300 text-[12px] text-gray-500", children: "No foundations yet \u2014 add a spread footing or pillar to start." }) : /* @__PURE__ */ jsx13("div", { className: "space-y-3", children: calc.items.map((item, index) => {
                const componentId = item.component_id;
                const proposalState = reinforcementEditor.read(componentId);
                return /* @__PURE__ */ jsxs13("div", { className: "space-y-2", children: [
                  /* @__PURE__ */ jsx13(
                    FoundationItemCard,
                    {
                      item,
                      pricing: calc.itemPricing[index],
                      index,
                      catalog,
                      onChange: patchItem,
                      onRemove: removeItem,
                      onDuplicate: duplicateItem
                    }
                  ),
                  /* @__PURE__ */ jsx13(
                    FoundationReinforcementProposalPanel,
                    {
                      item,
                      catalog: inventory.filter((row) => row.material_type === "rebar"),
                      supportCatalog: inventory.filter((row) => row.material_type === "rebar_support"),
                      ...proposalState,
                      busy: saving || catalogReloading,
                      onStart: () => reinforcementEditor.start(componentId),
                      onDraftChange: (draft) => reinforcementEditor.changeDraft(componentId, draft),
                      onPreview: () => reinforcementEditor.preview(componentId),
                      onAccept: (proposalId) => reinforcementEditor.accept(componentId, proposalId),
                      onDiscard: () => reinforcementEditor.discard(componentId),
                      onAcknowledgmentsChange: (value) => reinforcementEditor.acknowledge(componentId, value)
                    }
                  )
                ] }, componentId || index);
              }) }),
              /* @__PURE__ */ jsxs13(
                "button",
                {
                  type: "button",
                  onClick: () => addItem("spread_foot"),
                  className: "h-[30px] px-3 flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50",
                  children: [
                    /* @__PURE__ */ jsx13(Plus, { className: "w-3.5 h-3.5" }),
                    " Add Foundation Item"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs13(TabsContent, { value: "landscape", className: "space-y-4", children: [
              /* @__PURE__ */ jsx13(
                FoundationWallsPanel,
                {
                  walls: calc.walls,
                  options: catalog.walls,
                  wallPricing: calc.wallPricing,
                  onChange: (walls) => patch({ walls })
                }
              ),
              /* @__PURE__ */ jsx13(
                FoundationPolesPanel,
                {
                  poles: calc.poles,
                  options: catalog.poles,
                  items: calc.items,
                  polePricing: calc.polePricing,
                  onChange: (poles) => patch({ poles })
                }
              ),
              /* @__PURE__ */ jsx13(
                FoundationLayoutCanvas,
                {
                  items: project.items || [],
                  poles: project.poles || [],
                  onMoveItem: patchItem
                }
              )
            ] }),
            /* @__PURE__ */ jsxs13(TabsContent, { value: "signage", className: "space-y-4", children: [
              /* @__PURE__ */ jsx13(
                SignageCabinetsPanel,
                {
                  cabinets: project.signage_cabinets || [],
                  items: project.items || [],
                  poles: project.poles || [],
                  onChange: (signage_cabinets) => patch({ signage_cabinets })
                }
              ),
              /* @__PURE__ */ jsx13(
                LandscapeDesigner,
                {
                  landscape: project.landscape,
                  onChange: (landscape) => patch({ landscape })
                }
              )
            ] }),
            /* @__PURE__ */ jsx13(TabsContent, { value: "caps", children: /* @__PURE__ */ jsx13(
              FoundationWallCapsPanel,
              {
                caps: calc.wallCaps,
                walls: calc.walls,
                options: catalog.caps,
                onChange: (wall_caps) => patch({ wall_caps })
              }
            ) }),
            /* @__PURE__ */ jsx13(TabsContent, { value: "equipment", children: /* @__PURE__ */ jsx13(
              FoundationEquipmentTab,
              {
                foundationItems: project.items || [],
                inventory,
                selectedEquipmentList: project.selected_equipment || [],
                onUpdate: (rows) => patch({ selected_equipment: rows }),
                markDirty: () => setDirty(true)
              }
            ) }),
            /* @__PURE__ */ jsxs13(TabsContent, { value: "summary", className: "space-y-3", children: [
              /* @__PURE__ */ jsxs13("label", { className: "block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500", children: [
                "Section name",
                /* @__PURE__ */ jsx13(
                  Input3,
                  {
                    value: project.project_name || "",
                    onChange: (e) => patch({ project_name: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsx13(ConcreteDeliveryPanel, { project, delivery: calc.delivery, onChange: patch }),
              /* @__PURE__ */ jsx13(FoundationRatesPanel, { settings, project, onChange: patch }),
              /* @__PURE__ */ jsxs13("div", { className: "max-w-xl", children: [
                /* @__PURE__ */ jsx13(FoundationTotals, { totals: calc.totals, pricingUnavailable: pricingBlocked, savedSectionTotal, sectionTotal, project, calc }),
                /* @__PURE__ */ jsxs13("div", { className: "mt-3 space-y-1 text-[12px] text-gray-600", children: [
                  /* @__PURE__ */ jsxs13("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx13("span", { children: "Signage cabinets" }),
                    /* @__PURE__ */ jsx13("span", { children: hasFoundationCostSnapshot(cabinetCost) ? money(cabinetCost) : "Not saved" })
                  ] }),
                  /* @__PURE__ */ jsxs13("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx13("span", { children: "Site landscaping" }),
                    /* @__PURE__ */ jsx13("span", { children: hasFoundationCostSnapshot(landscapeCost) ? money(landscapeCost) : "Not saved" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs13("div", { className: "mt-2 text-right text-[12px] text-gray-500", children: [
                  "Section total flowing to estimate: ",
                  pricingBlocked ? /* @__PURE__ */ jsx13("b", { className: "text-amber-700", children: "Estimate handoff paused" }) : /* @__PURE__ */ jsx13("b", { className: "text-red-700", children: money(sectionTotal) })
                ] }),
                /* @__PURE__ */ jsx13(
                  Link,
                  {
                    to: "/FoundationCatalog",
                    className: "inline-block mt-3 text-[12px] text-gray-600 hover:text-red-600",
                    children: "Manage foundation catalog \u2192"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx13(TabsContent, { value: "bom", children: /* @__PURE__ */ jsx13(
              FoundationBOM,
              {
                items: calc.items,
                poles: calc.poles,
                walls: calc.walls,
                delivery: calc.delivery,
                totals: calc.totals,
                inventory,
                itemPricing: calc.itemPricing,
                polePricing: calc.polePricing,
                wallPricing: calc.wallPricing,
                cabinets: project.signage_cabinets || [],
                landscape: project.landscape,
                landscapePricing: calc.landscapePricing,
                pricingUnavailable: pricingBlocked
              }
            ) }),
            /* @__PURE__ */ jsx13(TabsContent, { value: "pricing", className: "space-y-4", children: pricingBlocked ? /* @__PURE__ */ jsx13("div", { className: "rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800", children: "Customer pricing unavailable: fix highlighted design inputs or catalog selections." }) : /* @__PURE__ */ jsxs13(Fragment5, { children: [
              /* @__PURE__ */ jsx13(
                CustomerPricingPanel,
                {
                  cost: sectionTotal,
                  project,
                  onChange: (changes) => patch({
                    ...changes,
                    customer_pricing: { ...project.customer_pricing || {}, applied: false }
                  })
                }
              ),
              /* @__PURE__ */ jsx13(
                CustomerPricingTab,
                {
                  project: { ...project, ...payload() },
                  categorize: categorizeFoundationProject,
                  accentColor: "red",
                  onApplyTier: (tier) => patch({
                    customer_pricing: { ...project.customer_pricing || {}, applied: true, tier_number: tier }
                  })
                }
              )
            ] }) })
          ] }) }),
          /* @__PURE__ */ jsx13("div", { className: "xl:sticky xl:top-4", children: inputBlocked ? /* @__PURE__ */ jsx13("div", { className: "rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800", children: "3D preview hidden until the highlighted design inputs are corrected." }) : /* @__PURE__ */ jsx13(Foundation3DPreview, { project }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx13(
      FoundationSyncConflictDialog,
      {
        conflict: syncConflict.conflict,
        busy: saving || syncConflict.resolving,
        disabled: {
          keep_draft: sourceRefreshRef.current ? "The project must be reloaded after the earlier save finished \u2014 reload before applying draft edits." : null
        },
        onKeepDraft: handleConflictKeepDraft,
        onKeepSaved: handleConflictKeepSaved,
        onKeepBoth: handleConflictKeepBoth,
        onDismiss: syncConflict.dismiss
      }
    ),
    /* @__PURE__ */ jsx13(
      FoundationTemplateDialog,
      {
        open: !!templateMode && !draftSessionRef.current.pending,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        saveDisabled: pricingBlocked || catalogReloading,
        saveDisabledReason: "Pricing unavailable: fix highlighted design inputs or catalog selections before saving a template.",
        onApply: (data) => {
          let patchData;
          try {
            patchData = prepareFoundationTemplatePatch(data, {
              createId: (kind) => newCreationRequestKey(`foundation_${kind}`)
            });
          } catch (e) {
            setSaveError(e?.message || "Template assembly could not be applied.");
            return false;
          }
          return commit(() => patchData);
        }
      }
    )
  ] });
}
export {
  FoundationEstimator as default
};
