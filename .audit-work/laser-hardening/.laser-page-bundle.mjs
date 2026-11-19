// frozen:/app/src/pages/LaserEstimator.jsx
import { useState, useEffect, useMemo, useRef } from "react";

// s:s://@/api/gatedEntities
var LaserProject = {
  get: async (id) => {
    globalThis.__spies.push(["projectGet", id]);
    return globalThis.__project ?? null;
  }
};
var Settings = globalThis.__entSettings ||= { __ent: "settings" };

// frozen:/app/src/pages/LaserEstimator.jsx
import { useSearchParams, useNavigate } from "react-router-dom";

// s:s://@/api/base44Client
var fail = () => {
  globalThis.__unexpectedSdk++;
  throw Error("Unexpected SDK access in the laser page proof");
};
var entity = new Proxy({}, { get: () => fail });
var base44 = { functions: { invoke: fail }, entities: new Proxy({}, { get: () => entity }) };

// s:s://@/components/ui/button
import { jsx } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx("button", { type: "button", ...p, children: p.children });

// s:s://@/components/ui/card
import { jsx as jsx2 } from "react/jsx-runtime";
var Card = (p) => /* @__PURE__ */ jsx2("div", { ...p });
var CardContent = (p) => /* @__PURE__ */ jsx2("div", { ...p });
var CardHeader = (p) => /* @__PURE__ */ jsx2("div", { ...p });
var CardTitle = (p) => /* @__PURE__ */ jsx2("div", { ...p });

// s:s://@/components/ui/input
import { jsx as jsx3 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx3("input", { ...p });

// s:s://@/components/ui/label
import { jsx as jsx4 } from "react/jsx-runtime";
var Label = (p) => /* @__PURE__ */ jsx4("label", { ...p, children: p.children });

// s:s://@/components/ui/select
import { jsx as jsx5 } from "react/jsx-runtime";
var Select = (p) => /* @__PURE__ */ jsx5("div", { children: p.children });
var SelectTrigger = (p) => /* @__PURE__ */ jsx5("div", { "data-trigger": true, ...p, children: p.children });
var SelectValue = () => /* @__PURE__ */ jsx5("span", {});
var SelectContent = (p) => /* @__PURE__ */ jsx5("div", { children: p.children });
var SelectItem = (p) => /* @__PURE__ */ jsx5("div", { children: p.children });

// s:s://@/components/ui/textarea
import { jsx as jsx6 } from "react/jsx-runtime";
var Textarea = (p) => /* @__PURE__ */ jsx6("textarea", { ...p });

// s:s://lucide-react
var Save = () => null;
var Plus = () => null;
var Trash2 = () => null;
var ArrowLeft = () => null;
var Zap = () => null;
var FileText = () => null;
var ListChecks = () => null;
var Calculator = () => null;
var Settings2 = () => null;
var AlertTriangle = () => null;
var TrendingUp = () => null;

// s:s://@/components/ui/tabs
import { jsx as jsx7 } from "react/jsx-runtime";
var Tabs = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });
var TabsList = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });
var TabsContent = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });

// s:s://@/components/channelLetterInstall/TabBadgeTrigger
import { jsxs } from "react/jsx-runtime";
var TabBadgeTrigger_default = (p) => /* @__PURE__ */ jsxs("button", { type: "button", "data-tab": p.value, children: [
  p.label,
  p.count !== void 0 ? " (" + p.count + ")" : ""
] });

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx8 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx8("div", { "data-stub": "CustomerPricingTab" });

// s:s://@/components/markup/projectCategorizer
var categorizeLaserProject = () => ({ categories: [] });

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
  if (a.entity === globalThis.__entSettings) return globalThis.__settingRows || [];
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

// s:s://@/components/estimator/builder/itemIdentity
var newBuilderItemId = (p) => p + "-" + (globalThis.__bseq = (globalThis.__bseq || 0) + 1);
var seedBuilderItemIds = (items) => (items || []).map((it, i) => ({ builder_item_id: it.builder_item_id || "bitem-" + i, ...it }));

// s:s://@/components/estimator/idempotentEntityCreate
var ensureIdempotentEntityCreate = async (a) => {
  globalThis.__spies.push(["ensureIdempotent", a]);
  return { ...a.data, id: "new-1", updated_date: "v1" };
};
var newCreationRequestKey = (k) => "key-" + k + "-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);

// s:s://@/components/estimator/moduleShared/ModuleActionBar
import { jsx as jsx9 } from "react/jsx-runtime";
var ModuleActionBar_default = (p) => /* @__PURE__ */ jsx9("button", { type: "button", "data-stub": "copy", onClick: p.onSaveAsCopy, children: "copy" });

// s:s://@/components/estimator/moduleShared/ModuleTemplateDialog
var ModuleTemplateDialog_default = () => null;

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var saveModuleProjectCopy = async (a) => {
  globalThis.__spies.push(["saveCopy", a]);
  return { id: "copy-1" };
};

// s:s://@/components/staff/staffEntities
var staffEntities = {
  AllInOneEstimate: { get: async (id) => {
    globalThis.__spies.push(["estimateGet", id]);
    return globalThis.__estimate ?? null;
  } }
};

// frozen:/app/src/components/estimator/laser/laserPricingAvailability.js
var laserStrictNumber = (v) => {
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
var laserSettingRecorded = (settings, key) => {
  const v = settings?.[key];
  return v !== void 0 && v !== null && !(typeof v === "string" && v.trim() === "");
};
var laserSeedNumber = (settings, key, fallback, { positive = false } = {}) => {
  if (!laserSettingRecorded(settings, key)) return fallback;
  const n = laserStrictNumber(settings[key]);
  if (n === null) return fallback;
  if (positive ? n <= 0 : n < 0) return fallback;
  return n;
};
var issue = (kind, { index = null, itemIndex = null, field, code, message, hold }) => ({
  kind,
  index,
  itemIndex,
  field,
  code,
  message,
  hold
});
var CUT_TYPES = /* @__PURE__ */ new Set(["panel", "lettering", "engrave_and_cut"]);
var ENGRAVE_TYPES = /* @__PURE__ */ new Set(["engraving", "engrave_and_cut"]);
var VALID_TYPES = /* @__PURE__ */ new Set(["panel", "lettering", "engraving", "engrave_and_cut"]);
var IMPERIAL_SIZES = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "3/4"];
var MATERIALS = ["Acrylic", "Wood", "Leather"];
var PRESENT = (v) => v !== void 0 && v !== null && v !== "";
var cutConsumed = (item) => CUT_TYPES.has(item?.item_type);
var engraveConsumed = (item) => ENGRAVE_TYPES.has(item?.item_type);
var SEED_SETTINGS = [
  ["parameter_laser_machine_rate", "parameter laser machine rate ($/hr)", true],
  ["parameter_laser_labor_rate", "parameter laser labor rate ($/hr)", true],
  ["engraving_laser_machine_rate", "engraving laser machine rate ($/hr)", true],
  ["engraving_labor_rate", "engraving labor rate ($/hr)", true],
  ["parameter_handling_time_percentage", "parameter handling time %", false],
  ["engraving_handling_time_percentage", "engraving handling time %", false],
  ["min_parameter_laser_setup_hours", "minimum parameter laser setup hours", false],
  ["parameter_laser_fixed_material_setup_cost", "parameter laser fixed material setup cost", false]
];
var thicknessSpeedKey = (t) => `cut_speed_${String(t || "").replace("/", "_")}`;
var cutMultiplierKey = (m) => `${String(m || "").toLowerCase()}_cut_multiplier`;
var engraveMultiplierKey = (m) => `${String(m || "").toLowerCase()}_engrave_multiplier`;
function laserSettingIssues(project = {}, settings = {}) {
  const issues = [];
  const add = (field, message) => issues.push(issue("laser_catalog", { field, code: "laser_setting_unavailable", message, hold: "project" }));
  const check = (key, human, positive) => {
    if (!laserSettingRecorded(settings, key)) return;
    const n = laserStrictNumber(settings[key]);
    if (n === null || (positive ? n <= 0 : n < 0)) {
      add(key, `Setting ${key}: record a finite, ${positive ? "positive" : "nonnegative"} ${human} in Laser Settings \u2014 the stored value cannot price this estimate`);
    }
  };
  if (!project?.id) {
    for (const [key, human, positive] of SEED_SETTINGS) check(key, human, positive);
  }
  const items = Array.isArray(project?.items) ? project.items : [];
  const derivedKeys = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (cutConsumed(it)) {
      if (IMPERIAL_SIZES.includes(it?.material_thickness)) {
        derivedKeys.set(thicknessSpeedKey(it.material_thickness), `cut speed for ${it.material_thickness}" material (mm/sec)`);
      }
      if (MATERIALS.includes(it?.material_type)) {
        derivedKeys.set(cutMultiplierKey(it.material_type), `${it.material_type} cut multiplier`);
      }
      if (it?.item_type === "lettering") {
        derivedKeys.set("laser_letter_perimeter_factor", "letter perimeter factor");
      }
    }
    if (engraveConsumed(it)) {
      derivedKeys.set("laser_engrave_speed_sqipm", "engrave speed (sq mm/sec)");
      if (MATERIALS.includes(it?.material_type)) {
        derivedKeys.set(engraveMultiplierKey(it.material_type), `${it.material_type} engrave multiplier`);
      }
    }
  }
  for (const [key, human] of derivedKeys) check(key, human, true);
  return issues;
}
function laserItemIssues(rawItem = {}, index = 0) {
  const issues = [];
  const label = `Item ${index + 1}${rawItem?.description ? ` "${rawItem.description}"` : ""}`;
  const add = (field, code, message) => issues.push(issue("laser", { index, itemIndex: index, field, code, message: `${label}: ${message}`, hold: "item" }));
  if (!VALID_TYPES.has(rawItem?.item_type)) {
    add(
      "item_type",
      "laser_item_type_unavailable",
      "select Panel, Lettering, Engraving, or Engrave and Cut \u2014 the stored type prices as $0 silently"
    );
  }
  const effectiveType = VALID_TYPES.has(rawItem?.item_type) ? rawItem.item_type : "panel";
  const cuts = cutConsumed({ item_type: effectiveType });
  const engraves = engraveConsumed({ item_type: effectiveType });
  if (!MATERIALS.includes(rawItem?.material_type)) {
    add(
      "material_type",
      "laser_material_type_unavailable",
      "choose Acrylic, Wood, or Leather \u2014 the stored material silently prices at a 1.0\xD7 multiplier"
    );
  }
  if (cuts && !IMPERIAL_SIZES.includes(rawItem?.material_thickness)) {
    add(
      "material_thickness",
      "laser_thickness_unavailable",
      "choose a listed thickness \u2014 the stored size has no cut-speed setting and silently prices at 20 mm/sec"
    );
  }
  if (effectiveType === "lettering") {
    const h = laserStrictNumber(rawItem?.letter_height);
    if (h === null || h <= 0) {
      add(
        "letter_height",
        "laser_dimension_unavailable",
        "record a positive, finite letter height (inches) \u2014 a blank or zero height prices the letters as $0 silently"
      );
    }
    const n = laserStrictNumber(rawItem?.num_letters);
    if (n === null || n < 1) {
      add(
        "num_letters",
        "laser_quantity_unavailable",
        "record a letter count of 1 or more \u2014 a blank or malformed count prices the letters as $0 silently"
      );
    }
  } else {
    for (const field of ["length", "width"]) {
      const n = laserStrictNumber(rawItem?.[field]);
      if (cuts) {
        if (n === null || n <= 0) {
          add(
            field,
            "laser_dimension_unavailable",
            `record a positive, finite ${field} (inches) \u2014 a blank or zero dimension silently mis-prices the cut perimeter`
          );
        }
      } else if (PRESENT(rawItem?.[field]) && (n === null || n < 0)) {
        add(
          field,
          "laser_dimension_unavailable",
          `record a finite, nonnegative ${field} (inches) or clear it \u2014 the stored value poisons the engrave area`
        );
      }
    }
  }
  {
    const q = laserStrictNumber(rawItem?.quantity);
    if (q === null || q < 1) {
      add(
        "quantity",
        "laser_quantity_unavailable",
        "record a quantity of 1 or more \u2014 a blank or malformed value prices this row as $0 silently"
      );
    }
  }
  {
    const n = laserStrictNumber(rawItem?.total_cut_length_inches);
    if (n === null || (cuts ? n <= 0 : n < 0)) {
      add(
        "total_cut_length_inches",
        "laser_cut_length_unavailable",
        cuts ? "re-enter the dimensions \u2014 the derived cut length is unusable and would silently price $0 machine time" : "the stored cut length is malformed \u2014 it corrupts the row's machine time"
      );
    }
  }
  {
    const n = laserStrictNumber(rawItem?.engrave_area_sqin);
    if (n === null || (engraves ? n <= 0 : n < 0)) {
      add(
        "engrave_area_sqin",
        "laser_engrave_area_unavailable",
        engraves ? "record a positive, finite engraving area (sq in) \u2014 a blank or zero area prices the engraving as $0 silently" : "the stored engrave area is malformed \u2014 it corrupts the row's machine time"
      );
    }
  }
  {
    const n = laserStrictNumber(rawItem?.cut_speed_ipm);
    if (n === null || n <= 0) {
      add(
        "cut_speed_ipm",
        "laser_cut_speed_unavailable",
        "re-pick the material and thickness \u2014 the derived cut speed is unusable and corrupts the row's machine time"
      );
    }
    const e = laserStrictNumber(rawItem?.engrave_speed_sqipm);
    if (e === null || e <= 0) {
      add(
        "engrave_speed_sqipm",
        "laser_engrave_speed_unavailable",
        "re-pick the material \u2014 the derived engrave speed is unusable and corrupts the row's machine time"
      );
    }
  }
  return issues;
}
function laserProjectInputIssues(project = {}) {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("laser", { field, code, message, hold: "project" }));
  if (project?.items !== void 0 && !Array.isArray(project.items)) {
    add(
      "items",
      "laser_items_unavailable",
      "the stored laser items are malformed \u2014 the project cannot be repriced"
    );
  }
  const items = Array.isArray(project?.items) ? project.items : [];
  const anyCut = items.some(cutConsumed);
  const anyEngrave = items.some(engraveConsumed);
  const needPositive = (field, human, active) => {
    if (!active) return;
    const n = laserStrictNumber(project?.[field]);
    if (n === null || n <= 0) {
      add(
        field,
        "laser_rate_unavailable",
        `record a positive, finite ${human} \u2014 the stored value silently reprices this estimate`
      );
    }
  };
  const needNonNeg = (field, human, active) => {
    if (!active) return;
    const n = laserStrictNumber(project?.[field]);
    if (n === null || n < 0) {
      add(
        field,
        "laser_rate_unavailable",
        `record a finite, nonnegative ${human} \u2014 the stored value silently reprices this estimate`
      );
    }
  };
  needPositive("machine_rate_per_hour", "machine rate ($/hr)", anyCut);
  needPositive("labor_rate", "labor rate ($/hr)", true);
  needPositive("engraving_machine_rate_per_hour", "engraving machine rate ($/hr)", anyEngrave);
  needPositive("engraving_labor_rate", "engraving labor rate ($/hr)", anyEngrave);
  needNonNeg("parameter_handling_time_percentage", "parameter handling %", anyCut);
  needNonNeg("engraving_handling_time_percentage", "engraving handling %", anyEngrave);
  needNonNeg("fixed_setup_hours", "fixed setup hours", true);
  needNonNeg("fixed_material_setup_cost", "fixed material setup cost ($)", true);
  return issues;
}
function computeLaserTotals(project = {}) {
  let totalMachineCost = 0;
  let totalLaborCost = 0;
  let totalSuppliesCost = 0;
  const MM_PER_IN = 25.4;
  const SQMM_PER_SQIN = 25.4 * 25.4;
  const updatedItems = project.items.map((item) => {
    const cutLengthMm = item.total_cut_length_inches * MM_PER_IN;
    const engraveAreaSqMm = item.engrave_area_sqin * item.quantity * SQMM_PER_SQIN;
    const cutTimeSeconds = cutLengthMm / (item.cut_speed_ipm || 20);
    const engraveTimeSeconds = engraveAreaSqMm / (item.engrave_speed_sqipm || 5);
    const cutTimeHours = cutTimeSeconds / 3600;
    const engraveTimeHours = engraveTimeSeconds / 3600;
    const machineTimeHours = cutTimeHours + engraveTimeHours;
    const paramMachineRate = project.machine_rate_per_hour || 100;
    const paramLaborRate = project.labor_rate || 75;
    const paramHandlingPct = (project.parameter_handling_time_percentage || 15) / 100;
    const engraveMachineRate = project.engraving_machine_rate_per_hour || 80;
    const engraveLaborRate = project.engraving_labor_rate || 40;
    const engraveHandlingPct = (project.engraving_handling_time_percentage || 20) / 100;
    let itemMachineCost = 0;
    let itemLaborCost = 0;
    let itemHandlingHours = 0;
    if (item.item_type === "panel" || item.item_type === "lettering") {
      itemHandlingHours = machineTimeHours * paramHandlingPct;
      itemMachineCost = machineTimeHours * paramMachineRate;
      itemLaborCost = itemHandlingHours * paramLaborRate;
    } else if (item.item_type === "engraving") {
      itemHandlingHours = machineTimeHours * engraveHandlingPct;
      itemMachineCost = machineTimeHours * engraveMachineRate;
      itemLaborCost = itemHandlingHours * engraveLaborRate;
    } else if (item.item_type === "engrave_and_cut") {
      const cutHandling = cutTimeHours * paramHandlingPct;
      const engraveHandling = engraveTimeHours * engraveHandlingPct;
      itemHandlingHours = cutHandling + engraveHandling;
      itemMachineCost = cutTimeHours * paramMachineRate + engraveTimeHours * engraveMachineRate;
      itemLaborCost = cutHandling * paramLaborRate + engraveHandling * engraveLaborRate;
    }
    totalMachineCost += itemMachineCost;
    totalLaborCost += itemLaborCost;
    return {
      ...item,
      machine_time_hours: machineTimeHours,
      handling_time_hours: itemHandlingHours,
      machine_cost: itemMachineCost,
      labor_cost: itemLaborCost
    };
  });
  const fixedSetupLaborCost = project.fixed_setup_hours * project.labor_rate;
  totalLaborCost += fixedSetupLaborCost;
  const fixedMaterialSetupCost = project.fixed_material_setup_cost || 0;
  totalSuppliesCost += fixedMaterialSetupCost;
  return {
    items: updatedItems,
    total_machine_cost: totalMachineCost,
    total_labor_cost: totalLaborCost,
    total_supplies_cost: totalSuppliesCost
  };
}
var ITEM_HELD_FIELDS = ["machine_time_hours", "handling_time_hours", "machine_cost", "labor_cost"];
var TOTAL_FIELDS = ["total_machine_cost", "total_labor_cost", "total_supplies_cost"];
function calcLaserPricing(project = {}, settings = {}) {
  const issues = [
    ...laserSettingIssues(project, settings),
    ...laserProjectInputIssues(project),
    ...(Array.isArray(project?.items) ? project.items : []).flatMap((item, index) => laserItemIssues(item, index))
  ];
  const calcable = Array.isArray(project?.items) ? project : { ...project, items: [] };
  const calc = computeLaserTotals(calcable);
  const leakedNaN = issues.length === 0 && (!TOTAL_FIELDS.every((f) => Number.isFinite(calc[f])) || calc.items.some((it) => ITEM_HELD_FIELDS.some((f) => !Number.isFinite(it[f]))));
  if (leakedNaN) {
    issues.push(issue("laser", {
      field: "total_cost",
      code: "laser_totals_unavailable",
      message: "Pricing produced a non-finite total \u2014 re-check the item values before saving",
      hold: "project"
    }));
  }
  const held = issues.length > 0;
  if (!held) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held };
  }
  const out = { ...calc, items: calc.items.slice() };
  const hasProjectHold = issues.some((i) => i.hold === "project");
  const itemHolds = new Set(issues.filter((i) => i.hold === "item").map((i) => i.itemIndex));
  out.items = calc.items.map((item, index) => {
    if (!hasProjectHold && !itemHolds.has(index)) return item;
    const heldItem = { ...item };
    for (const field of ITEM_HELD_FIELDS) heldItem[field] = null;
    return heldItem;
  });
  for (const field of TOTAL_FIELDS) out[field] = null;
  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held };
}
var hasLaserCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var laserSumOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
var laserDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};
var issuesForField = (issues = [], field, itemIndex = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
var hasIssueFor = (issues = [], field, itemIndex = null) => issuesForField(issues, field, itemIndex).length > 0;

// frozen:/app/src/pages/LaserEstimator.jsx
import { Fragment, jsx as jsx10, jsxs as jsxs2 } from "react/jsx-runtime";
var imperialSizes = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "3/4"];
var materials = ["Acrylic", "Wood", "Leather"];
var escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var exportMoney = (v) => Number.isFinite(v) ? "$" + v.toFixed(2) : "\u2014";
var exportHours = (v) => Number.isFinite(v) ? v.toFixed(3) : "\u2014";
function LaserEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [isEditing, setIsEditing] = useState(false);
  const [project, setProject] = useState({
    project_name: "",
    client_name: "",
    estimate_number: "",
    hyperlink: "",
    items: [],
    machine_rate_per_hour: 100,
    labor_rate: 75,
    engraving_machine_rate_per_hour: 80,
    engraving_labor_rate: 40,
    parameter_handling_time_percentage: 15,
    engraving_handling_time_percentage: 20,
    fixed_setup_hours: 0.5,
    fixed_material_setup_cost: 0,
    notes: "",
    total_supplies_cost: 0
  });
  const [globalSettings, setGlobalSettings] = useState({});
  const [estimateContext, setEstimateContext] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedTotals, setSavedTotals] = useState({
    total_machine_cost: null,
    total_labor_cost: null,
    total_supplies_cost: null
  });
  const [activeTab, setActiveTab] = useState("project");
  const persistedProjectIdRef = useRef(editId || "");
  const createAttemptRef = useRef({ signature: "", key: "" });
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const [templateMode, setTemplateMode] = useState(null);
  useEffect(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
    copyAttemptRef.current = { signature: "", key: "" };
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [settingsData, existing, estimate] = await Promise.all([
          loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" }),
          editId ? LaserProject.get(editId) : Promise.resolve(null),
          estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
        ]);
        if (cancelled) return;
        const settingsObj = {};
        (settingsData || []).forEach((setting) => {
          settingsObj[setting.setting_name] = setting.setting_value;
        });
        setGlobalSettings(settingsObj);
        setEstimateContext(estimate || null);
        const newDefaults = {
          machine_rate_per_hour: laserSeedNumber(settingsObj, "parameter_laser_machine_rate", 100, { positive: true }),
          labor_rate: laserSeedNumber(settingsObj, "parameter_laser_labor_rate", 75, { positive: true }),
          engraving_machine_rate_per_hour: laserSeedNumber(settingsObj, "engraving_laser_machine_rate", 80, { positive: true }),
          engraving_labor_rate: laserSeedNumber(settingsObj, "engraving_labor_rate", 40, { positive: true }),
          parameter_handling_time_percentage: laserSeedNumber(settingsObj, "parameter_handling_time_percentage", 15),
          engraving_handling_time_percentage: laserSeedNumber(settingsObj, "engraving_handling_time_percentage", 20),
          fixed_setup_hours: laserSeedNumber(settingsObj, "min_parameter_laser_setup_hours", 0.5),
          fixed_material_setup_cost: laserSeedNumber(settingsObj, "parameter_laser_fixed_material_setup_cost", 0),
          notes: settingsObj.default_notes_template || "",
          total_supplies_cost: 0
        };
        setSavedTotals({
          total_machine_cost: existing?.total_machine_cost ?? null,
          total_labor_cost: existing?.total_labor_cost ?? null,
          total_supplies_cost: existing?.total_supplies_cost ?? null
        });
        if (existing) {
          setProject((prev) => ({
            ...prev,
            ...existing,
            client_name: estimate?.client_name || existing.client_name || prev.client_name,
            customer_id: estimate?.customer_id || existing.customer_id,
            estimate_number: estimate?.estimate_number || existing.estimate_number,
            items: seedBuilderItemIds(existing.items || []),
            // Historical Laser rows predate several of these fields. Resolve
            // missing values to the exact fallbacks used by SignEstimate Pro's
            // calculator instead of inheriting today's Settings. In particular,
            // an absent fixed_setup_hours must mean 0 or the old row can become NaN.
            machine_rate_per_hour: existing.machine_rate_per_hour ?? 100,
            labor_rate: existing.labor_rate ?? 75,
            engraving_machine_rate_per_hour: existing.engraving_machine_rate_per_hour ?? 80,
            engraving_labor_rate: existing.engraving_labor_rate ?? 40,
            parameter_handling_time_percentage: existing.parameter_handling_time_percentage ?? 15,
            engraving_handling_time_percentage: existing.engraving_handling_time_percentage ?? 20,
            fixed_setup_hours: existing.fixed_setup_hours ?? 0,
            fixed_material_setup_cost: existing.fixed_material_setup_cost ?? 0
          }));
          setIsEditing(true);
        } else {
          setProject((prev) => ({
            ...prev,
            ...newDefaults,
            client_name: estimate?.client_name || prev.client_name,
            customer_id: estimate?.customer_id,
            estimate_number: estimate?.estimate_number || prev.estimate_number
          }));
          setIsEditing(false);
        }
      } catch (error) {
        console.error("Error loading laser estimator:", error);
        if (!cancelled) setLoadError(error?.message || "Laser Builder prerequisites could not be verified.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [editId, estimateId]);
  async function extractLaserDims(file) {
    try {
      const text = await file.text();
      const lines = String(text).split(/[\r\n]+/);
      const readPair = (marker) => {
        const idx = lines.findIndex((l) => String(l).trim() === marker);
        if (idx < 0) return null;
        let x = NaN, y = NaN;
        for (let j = idx + 1; j < Math.min(idx + 14, lines.length); j += 1) {
          const code = String(lines[j]).trim();
          if (code === "10") x = parseFloat(lines[j + 1]);
          else if (code === "20") y = parseFloat(lines[j + 1]);
          if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
        }
        return null;
      };
      const extMin = readPair("$EXTMIN");
      const extMax = readPair("$EXTMAX");
      const metric = lines.some((l, i) => String(l).trim() === "$MEASUREMENT" && String(lines[i + 2] || "").trim() === "1");
      const insUnitsMM = lines.some((l, i) => String(l).trim() === "$INSUNITS" && String(lines[i + 2] || "").trim() === "4");
      const toIn = metric || insUnitsMM ? 1 / 25.4 : 1;
      if (extMin && extMax && extMax.x > extMin.x) {
        const w = (extMax.x - extMin.x) * toIn;
        const h = Math.abs(extMax.y - extMin.y) * toIn;
        return { w: +w.toFixed(2), h: +h.toFixed(2) };
      }
      const vb = /viewBox=["']([\d\.\s-]+)["']/.exec(text);
      const sW = /width=["']([\d\.]+)/.exec(text), sH = /height=["']([\d\.]+)/.exec(text);
      if (Number.isFinite(parseFloat(sW?.[1])) && Number.isFinite(parseFloat(sH?.[1]))) return { w: parseFloat(sW[1]), h: parseFloat(sH[1]) };
      if (vb) {
        const p = vb[1].trim().split(/\s+/).map(Number);
        if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: +p[2].toFixed(2), h: +p[3].toFixed(2) };
      }
    } catch {
    }
    return null;
  }
  const addItem = () => {
    setTimeout(() => document.querySelector(`input[data-item-desc="${(project.items || []).length}"]`)?.focus(), 60);
    const newItem = {
      builder_item_id: newBuilderItemId("laser-item"),
      item_type: "panel",
      description: "",
      material_type: "Acrylic",
      material_thickness: "1/4",
      quantity: 1,
      length: 24,
      width: 12,
      letter_height: 12,
      num_letters: 10,
      engrave_area_sqin: 0,
      total_cut_length_inches: 0,
      cut_speed_ipm: 20,
      engrave_speed_sqipm: 5,
      machine_time_hours: 0,
      handling_time_hours: 0,
      machine_cost: 0,
      labor_cost: 0
    };
    setProject((prev) => ({ ...prev, items: [...prev.items, newItem] }));
  };
  const attachFileToItem = async (index, file) => {
    if (!file) return;
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const url = up?.file_url || "";
      if (url) updateItem(index, "file_url", url);
      const dims = await extractLaserDims(file);
      if (dims && (dims.w > 0 || dims.h > 0)) {
        updateItem(index, "length", dims.w);
        updateItem(index, "width", dims.h);
        window.alert(`Attached file \u2014 extracted ${dims.w}" \xD7 ${dims.h}" into length/width.`);
      } else {
        window.alert("File attached (no readable dimensions \u2014 length/width left as entered).");
      }
    } catch (e) {
      window.alert(e?.message || "Attach failed.");
    }
  };
  const removeItem = (index) => {
    if (!window.confirm("Remove this item?")) return;
    setProject((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };
  const updateItem = (index, field, value) => {
    setProject((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "item_type" || field === "material_type" || field === "material_thickness" || field === "length" || field === "width" || field === "letter_height" || field === "num_letters" || field === "quantity" || field === "engrave_area_sqin") {
          const perimFactor = parseFloat(globalSettings.laser_letter_perimeter_factor) || 3.5;
          updated.total_cut_length_inches = 0;
          if (updated.item_type === "panel" || updated.item_type === "engrave_and_cut") {
            const perimeterInches = 2 * (updated.length + updated.width);
            updated.total_cut_length_inches = perimeterInches * updated.quantity;
          }
          if ((updated.item_type === "engraving" || updated.item_type === "engrave_and_cut") && (field === "length" || field === "width" || field === "item_type")) {
            updated.engrave_area_sqin = updated.length * updated.width;
          }
          if (updated.item_type === "lettering") {
            const perimeterPerLetter = updated.letter_height * perimFactor;
            updated.total_cut_length_inches = perimeterPerLetter * updated.num_letters * updated.quantity;
          }
          const thicknessKey = `cut_speed_${String(updated.material_thickness ?? "").replace("/", "_")}`;
          const baseSpeed = parseFloat(globalSettings[thicknessKey]) || 20;
          const materialMultiplier = parseFloat(globalSettings[`${String(updated.material_type ?? "").toLowerCase()}_cut_multiplier`]) || 1;
          updated.cut_speed_ipm = baseSpeed * materialMultiplier;
          const engraveBaseSpeed = parseFloat(globalSettings.laser_engrave_speed_sqipm) || 5;
          const engraveMultiplier = parseFloat(globalSettings[`${String(updated.material_type ?? "").toLowerCase()}_engrave_multiplier`]) || 1;
          updated.engrave_speed_sqipm = engraveBaseSpeed * engraveMultiplier;
        }
        return updated;
      })
    }));
  };
  const priced = useMemo(() => calcLaserPricing(project, globalSettings), [project, globalSettings]);
  const calculated = priced.calc;
  const allIssues = priced.issues || [];
  const catalogBlocked = allIssues.some((i) => i.kind === "laser_catalog");
  const pricingBlocked = allIssues.length > 0;
  const pricingUnavailable = !!calculated?.pricingUnavailable;
  const itemIssues = (index) => allIssues.filter((i) => i.itemIndex === index);
  const itemIssuesId = (index) => `laser-item-${index}-issues`;
  const itemFieldFlag = (field, index) => hasIssueFor(allIssues, field, index) || void 0;
  const itemFieldDesc = (field, index) => hasIssueFor(allIssues, field, index) ? itemIssuesId(index) : void 0;
  const projectFieldFlag = (field) => hasIssueFor(allIssues, field) || void 0;
  const projectFieldDesc = (field) => hasIssueFor(allIssues, field) ? "laser-pricing-issues" : void 0;
  const displayTotals = {
    total_machine_cost: Number.isFinite(calculated?.total_machine_cost) ? calculated.total_machine_cost : savedTotals.total_machine_cost,
    total_labor_cost: Number.isFinite(calculated?.total_labor_cost) ? calculated.total_labor_cost : savedTotals.total_labor_cost,
    total_supplies_cost: Number.isFinite(calculated?.total_supplies_cost) ? calculated.total_supplies_cost : savedTotals.total_supplies_cost
  };
  const displayTotalCost = laserSumOrNull(
    displayTotals.total_machine_cost,
    displayTotals.total_supplies_cost,
    displayTotals.total_labor_cost
  );
  const displayItems = Array.isArray(calculated?.items) && calculated.items.length === (project.items || []).length ? calculated.items : project.items || [];
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!isSaving) saveProject();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSaving]);
  useEffect(() => {
    if (!isSaving) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isSaving]);
  const saveProject = async () => {
    if (pricingBlocked) {
      setSaveError(catalogBlocked ? "Save paused: a Laser Settings value is missing or unusable \u2014 update it in Laser Settings, then save." : "Save paused: fix the flagged pricing values before saving \u2014 unavailable pricing is never written as $0.");
      return;
    }
    setSaveError("");
    if (!project.project_name || !(estimateContext?.client_name || project.client_name)) {
      alert("Please fill in project name and client name");
      return;
    }
    if (project.items.length === 0) {
      alert("Please add at least one item to the project");
      return;
    }
    setIsSaving(true);
    try {
      const totalCost = calculated.total_machine_cost + calculated.total_supplies_cost + calculated.total_labor_cost;
      const pricingProject = {
        ...project,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        items: calculated.items,
        total_machine_cost: calculated.total_machine_cost,
        total_supplies_cost: calculated.total_supplies_cost,
        total_labor_cost: calculated.total_labor_cost
      };
      const customerPricing = await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizeLaserProject,
        tierNumber: project.customer_pricing?.tier_number
      });
      const dataToSave = {
        ...pricingProject,
        customer_pricing: customerPricing || project.customer_pricing,
        total_cost: totalCost,
        status: "calculated"
      };
      let saved;
      const activeProjectId = persistedProjectIdRef.current || editId || "";
      if (activeProjectId) {
        saved = await updateBuilderSourceProject({
          entity: LaserProject,
          sourceId: activeProjectId,
          expectedUpdatedAt: project.updated_date,
          data: dataToSave,
          estimateId,
          label: "Laser project"
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(dataToSave);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("laser_project")
          };
        }
        saved = await ensureIdempotentEntityCreate({
          entity: LaserProject,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: dataToSave,
          label: "Laser project"
        });
        if (!saved?.id) throw new Error("Laser project create could not be verified.");
        persistedProjectIdRef.current = saved.id;
        setIsEditing(true);
      }
      const savedId = saved?.id || activeProjectId;
      if (estimateId && savedId) {
        const refreshed = await LaserProject.get(savedId).catch(() => ({ ...dataToSave, id: savedId }));
        await recordBuilderSave({
          estimateId,
          line: { project_id: savedId, module_key: "laser" },
          sourceProject: {
            ...refreshed,
            items: calculated.items,
            builder_calculation: {
              totals: {
                total_machine_cost: calculated.total_machine_cost,
                total_labor_cost: calculated.total_labor_cost,
                total_supplies_cost: calculated.total_supplies_cost,
                fixed_setup_cost: (project.fixed_setup_hours || 0) * (project.labor_rate || 0),
                total_cost: totalCost
              }
            }
          },
          liveTotal: totalCost
        });
      }
      setProject((prev) => ({
        ...prev,
        ...dataToSave,
        id: savedId || prev.id,
        updated_date: saved?.updated_date || prev.updated_date
      }));
      setSavedTotals({
        total_machine_cost: calculated.total_machine_cost,
        total_labor_cost: calculated.total_labor_cost,
        total_supplies_cost: calculated.total_supplies_cost
      });
      onSaved?.();
      if (!embedded) alert(isEditing ? "Project updated successfully!" : "Project saved successfully!");
    } catch (error) {
      console.error("Error saving project:", error);
      alert("Error saving project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
  const handleSaveAsCopy = async () => {
    if (pricingBlocked) {
      setSaveError(catalogBlocked ? "Copy paused: a Laser Settings value is missing or unusable \u2014 update it in Laser Settings first." : "Copy paused: fix the flagged pricing values before copying \u2014 unavailable pricing is never written as $0.");
      return;
    }
    setSaveError("");
    setIsSaving(true);
    try {
      const copy = await saveModuleProjectCopy({
        entity: LaserProject,
        payload: {
          ...project,
          client_name: estimateContext?.client_name || project.client_name,
          customer_id: estimateContext?.customer_id || project.customer_id,
          estimate_number: estimateContext?.estimate_number || project.estimate_number,
          items: calculated.items,
          total_machine_cost: calculated.total_machine_cost,
          total_supplies_cost: calculated.total_supplies_cost,
          total_labor_cost: calculated.total_labor_cost,
          total_cost: calculated.total_machine_cost + calculated.total_supplies_cost + calculated.total_labor_cost,
          status: "calculated"
        },
        attemptRef: copyAttemptRef,
        keyPrefix: "laser_project_copy",
        baseName: project.project_name || "Laser",
        label: "Laser project copy"
      });
      if (embedded) onSaved?.();
      else navigate(`/LaserEstimator?edit=${copy.id}`);
    } catch (e) {
      console.error(e);
      alert("Save copy failed: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };
  const buildLaserTemplateData = (p) => ({
    items: p.items || [],
    machine_rate_per_hour: p.machine_rate_per_hour,
    labor_rate: p.labor_rate,
    engraving_machine_rate_per_hour: p.engraving_machine_rate_per_hour,
    engraving_labor_rate: p.engraving_labor_rate,
    parameter_handling_time_percentage: p.parameter_handling_time_percentage,
    engraving_handling_time_percentage: p.engraving_handling_time_percentage,
    fixed_setup_hours: p.fixed_setup_hours,
    fixed_material_setup_cost: p.fixed_material_setup_cost,
    notes: p.notes
  });
  const downloadEstimate = () => {
    const totalCost = displayTotalCost;
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Laser Estimate - ${escHtml(project.project_name)}</title>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 40px;
      color: #1e293b;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .header .subtitle {
      font-size: 16px;
      opacity: 0.95;
      font-weight: 500;
    }
    
    .project-info {
      padding: 30px 40px;
      background: #f8fafc;
      border-bottom: 3px solid #e2e8f0;
    }
    
    .project-info h2 {
      color: #475569;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    
    .info-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .info-label {
      font-weight: 600;
      color: #64748b;
      font-size: 13px;
    }
    
    .info-value {
      color: #1e293b;
      font-size: 13px;
    }
    
    .content {
      padding: 40px;
    }
    
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 25px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
      display: inline-block;
    }
    
    .item {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
      transition: transform 0.2s;
    }
    
    .item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .item-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      margin: -25px -25px 20px -25px;
      font-weight: 600;
      font-size: 16px;
    }
    
    .item-details {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 15px;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    
    .detail-label {
      font-weight: 600;
      color: #64748b;
      font-size: 13px;
    }
    
    .detail-value {
      color: #1e293b;
      font-weight: 500;
      font-size: 13px;
    }
    
    .item-costs {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px dashed #cbd5e1;
    }
    
    .cost-box {
      background: white;
      padding: 15px;
      border-radius: 8px;
      border: 2px solid #e2e8f0;
    }
    
    .cost-box.machine {
      border-color: #3b82f6;
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    }
    
    .cost-box.labor {
      border-color: #10b981;
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    }
    
    .cost-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 5px;
    }
    
    .cost-value {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
    }
    
    .summary {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 3px solid #e2e8f0;
      border-radius: 16px;
      padding: 30px;
      margin-top: 40px;
    }
    
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .summary-row:last-child {
      border-bottom: none;
    }
    
    .summary-label {
      font-weight: 600;
      color: #475569;
      font-size: 15px;
    }
    
    .summary-value {
      font-weight: 700;
      color: #1e293b;
      font-size: 15px;
    }
    
    .summary-row.machine .summary-value { color: #3b82f6; }
    .summary-row.supplies .summary-value { color: #8b5cf6; }
    .summary-row.labor .summary-value { color: #10b981; }
    
    .total-row {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 3px solid #667eea;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .total-label {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .total-value {
      font-size: 36px;
      font-weight: 800;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .notes {
      background: #fef3c7;
      border: 2px solid #fbbf24;
      border-radius: 12px;
      padding: 25px;
      margin-top: 30px;
    }
    
    .notes h3 {
      color: #92400e;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .notes p {
      color: #78350f;
      line-height: 1.6;
      font-size: 14px;
    }
    
    .footer {
      background: #1e293b;
      color: white;
      padding: 20px;
      text-align: center;
      font-size: 12px;
    }
    
    @media print {
      body { 
        background: white;
        padding: 0;
      }
      .container {
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>\u26A1 Laser Estimate</h1>
      <div class="subtitle">Precision Cutting & Engraving Services</div>
    </div>
    
    <div class="project-info">
      <h2>Project Details</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Project:</span>
          <span class="info-value">${escHtml(project.project_name)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Client:</span>
          <span class="info-value">${escHtml(project.client_name)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Estimate #:</span>
          <span class="info-value">${escHtml(project.estimate_number)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Date:</span>
          <span class="info-value">${(/* @__PURE__ */ new Date()).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
    
    <div class="content">
      <div class="section-title">Items Breakdown</div>
      
      ${displayItems.map((item, i) => `
        <div class="item">
          <div class="item-header">
            Item ${i + 1}: ${escHtml(item.description || item.item_type + " item")}
          </div>
          
          <div class="item-details">
            <div class="detail-row">
              <span class="detail-label">Type:</span>
              <span class="detail-value">${escHtml(item.item_type)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Material:</span>
              <span class="detail-value">${escHtml(item.material_type)} - ${escHtml(item.material_thickness)}"</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Quantity:</span>
              <span class="detail-value">${escHtml(item.quantity)}</span>
            </div>
            ${item.item_type === "panel" || item.item_type === "engrave_and_cut" ? `
            <div class="detail-row">
              <span class="detail-label">Dimensions:</span>
              <span class="detail-value">${escHtml(item.length)}" \xD7 ${escHtml(item.width)}"</span>
            </div>
            ` : ""}
            ${item.item_type === "lettering" ? `
            <div class="detail-row">
              <span class="detail-label">Letter Height:</span>
              <span class="detail-value">${escHtml(item.letter_height)}"</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Letter Count:</span>
              <span class="detail-value">${escHtml(item.num_letters)}</span>
            </div>
            ` : ""}
            ${(item.item_type === "engraving" || item.item_type === "engrave_and_cut") && Number.isFinite(item.engrave_area_sqin) && item.engrave_area_sqin > 0 ? `
            <div class="detail-row">
              <span class="detail-label">Engrave Area:</span>
              <span class="detail-value">${escHtml(item.engrave_area_sqin)} sq in</span>
            </div>
            ` : ""}
            <div class="detail-row">
              <span class="detail-label">Machine Time:</span>
              <span class="detail-value">${exportHours(item.machine_time_hours)} hrs</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Handling Time:</span>
              <span class="detail-value">${exportHours(item.handling_time_hours)} hrs</span>
            </div>
          </div>
          
          <div class="item-costs">
            <div class="cost-box machine">
              <div class="cost-label">Machine Cost</div>
              <div class="cost-value">${exportMoney(item.machine_cost)}</div>
            </div>
            <div class="cost-box labor">
              <div class="cost-label">Labor Cost</div>
              <div class="cost-value">${exportMoney(item.labor_cost)}</div>
            </div>
          </div>
        </div>
      `).join("")}
      
      <div class="summary">
        <div class="section-title" style="border-color: #10b981;">Cost Summary</div>
        
        <div class="summary-row">
          <span class="summary-label">Setup Hours:</span>
          <span class="summary-value">${escHtml(project.fixed_setup_hours)} hrs</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Material Setup Cost:</span>
          <span class="summary-value">${exportMoney(laserStrictNumber(project.fixed_material_setup_cost))}</span>
        </div>
        
        <div class="summary-row machine">
          <span class="summary-label">Total Machine Cost:</span>
          <span class="summary-value">${exportMoney(displayTotals.total_machine_cost)}</span>
        </div>
        <div class="summary-row supplies">
          <span class="summary-label">Total Supplies Cost:</span>
          <span class="summary-value">${exportMoney(displayTotals.total_supplies_cost)}</span>
        </div>
        <div class="summary-row labor">
          <span class="summary-label">Total Labor Cost:</span>
          <span class="summary-value">${exportMoney(displayTotals.total_labor_cost)}</span>
        </div>
        
        <div class="total-row">
          <span class="total-label">Total Estimate</span>
          <span class="total-value">${exportMoney(totalCost)}</span>
        </div>
      </div>
      
      ${project.notes ? `
        <div class="notes">
          <h3>\u{1F4DD} Additional Notes</h3>
          <p>${escHtml(project.notes)}</p>
        </div>
      ` : ""}
    </div>
    
    <div class="footer">
      Generated by SignEstimate Pro - Professional Estimating Suite<br>
      \xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} All Rights Reserved
    </div>
  </div>
</body>
</html>
    `;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.project_name.replace(/\s+/g, "_")}_Laser_Estimate.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const printEstimate = () => {
    const totalCost = displayTotalCost;
    const printContent = `
      <html>
        <head>
          <title>Laser Estimate - ${escHtml(project.project_name)}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 0;
              padding: 40px;
              color: #1e293b;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
            }
            
            .container {
              max-width: 900px;
              margin: 0 auto;
              background: white;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              overflow: hidden;
            }
            
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px;
              text-align: center;
            }
            
            .header h1 {
              font-size: 32px;
              font-weight: 700;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
            
            .header .subtitle {
              font-size: 16px;
              opacity: 0.95;
              font-weight: 500;
            }
            
            .project-info {
              padding: 30px 40px;
              background: #f8fafc;
              border-bottom: 3px solid #e2e8f0;
            }
            
            .project-info h2 {
              color: #475569;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 15px;
              font-weight: 600;
            }
            
            .info-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
            }
            
            .info-item {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            
            .info-label {
              font-weight: 600;
              color: #64748b;
              font-size: 13px;
            }
            
            .info-value {
              color: #1e293b;
              font-size: 13px;
            }
            
            .content {
              padding: 40px;
            }
            
            .section-title {
              font-size: 20px;
              font-weight: 700;
              color: #1e293b;
              margin-bottom: 25px;
              padding-bottom: 10px;
              border-bottom: 3px solid #667eea;
              display: inline-block;
            }
            
            .item {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              border: 2px solid #e2e8f0;
              border-radius: 12px;
              padding: 25px;
              margin-bottom: 20px;
              transition: transform 0.2s;
            }
            
            .item:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            
            .item-header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 12px 20px;
              border-radius: 8px;
              margin: -25px -25px 20px -25px;
              font-weight: 600;
              font-size: 16px;
            }
            
            .item-details {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
              margin-bottom: 15px;
            }
            
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
            }
            
            .detail-label {
              font-weight: 600;
              color: #64748b;
              font-size: 13px;
            }
            
            .detail-value {
              color: #1e293b;
              font-weight: 500;
              font-size: 13px;
            }
            
            .item-costs {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
              margin-top: 20px;
              padding-top: 20px;
              border-top: 2px dashed #cbd5e1;
            }
            
            .cost-box {
              background: white;
              padding: 15px;
              border-radius: 8px;
              border: 2px solid #e2e8f0;
            }
            
            .cost-box.machine {
              border-color: #3b82f6;
              background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            }
            
            .cost-box.labor {
              border-color: #10b981;
              background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
            }
            
            .cost-label {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748b;
              font-weight: 600;
              margin-bottom: 5px;
            }
            
            .cost-value {
              font-size: 20px;
              font-weight: 700;
              color: #1e293b;
            }
            
            .summary {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              border: 3px solid #e2e8f0;
              border-radius: 16px;
              padding: 30px;
              margin-top: 40px;
            }
            
            .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 12px 0;
              border-bottom: 1px solid #e2e8f0;
            }
            
            .summary-row:last-child {
              border-bottom: none;
            }
            
            .summary-label {
              font-weight: 600;
              color: #475569;
              font-size: 15px;
            }
            
            .summary-value {
              font-weight: 700;
              color: #1e293b;
              font-size: 15px;
            }
            
            .summary-row.machine .summary-value { color: #3b82f6; }
            .summary-row.supplies .summary-value { color: #8b5cf6; }
            .summary-row.labor .summary-value { color: #10b981; }
            
            .total-row {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 3px solid #667eea;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            
            .total-label {
              font-size: 24px;
              font-weight: 700;
              color: #1e293b;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .total-value {
              font-size: 36px;
              font-weight: 800;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            
            .notes {
              background: #fef3c7;
              border: 2px solid #fbbf24;
              border-radius: 12px;
              padding: 25px;
              margin-top: 30px;
            }
            
            .notes h3 {
              color: #92400e;
              font-size: 16px;
              font-weight: 700;
              margin-bottom: 15px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .notes p {
              color: #78350f;
              line-height: 1.6;
              font-size: 14px;
            }
            
            .footer {
              background: #1e293b;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 12px;
            }
            
            @media print {
              body { 
                background: white;
                padding: 0;
              }
              .container {
                box-shadow: none;
                border-radius: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>\u26A1 Laser Estimate</h1>
              <div class="subtitle">Precision Cutting & Engraving Services</div>
            </div>
            
            <div class="project-info">
              <h2>Project Details</h2>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Project:</span>
                  <span class="info-value">${escHtml(project.project_name)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Client:</span>
                  <span class="info-value">${escHtml(project.client_name)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Estimate #:</span>
                  <span class="info-value">${escHtml(project.estimate_number)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Date:</span>
                  <span class="info-value">${(/* @__PURE__ */ new Date()).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            <div class="content">
              <div class="section-title">Items Breakdown</div>
              
              ${displayItems.map((item, i) => `
                <div class="item">
                  <div class="item-header">
                    Item ${i + 1}: ${escHtml(item.description || item.item_type + " item")}
                  </div>
                  
                  <div class="item-details">
                    <div class="detail-row">
                      <span class="detail-label">Type:</span>
                      <span class="detail-value">${escHtml(item.item_type)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Material:</span>
                      <span class="detail-value">${escHtml(item.material_type)} - ${escHtml(item.material_thickness)}"</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Quantity:</span>
                      <span class="detail-value">${escHtml(item.quantity)}</span>
                    </div>
                    ${item.item_type === "panel" || item.item_type === "engrave_and_cut" ? `
                    <div class="detail-row">
                      <span class="detail-label">Dimensions:</span>
                      <span class="detail-value">${escHtml(item.length)}" \xD7 ${escHtml(item.width)}"</span>
                    </div>
                    ` : ""}
                    ${item.item_type === "lettering" ? `
                    <div class="detail-row">
                      <span class="detail-label">Letter Height:</span>
                      <span class="detail-value">${escHtml(item.letter_height)}"</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Letter Count:</span>
                      <span class="detail-value">${escHtml(item.num_letters)}</span>
                    </div>
                    ` : ""}
                    ${(item.item_type === "engraving" || item.item_type === "engrave_and_cut") && Number.isFinite(item.engrave_area_sqin) && item.engrave_area_sqin > 0 ? `
                    <div class="detail-row">
                      <span class="detail-label">Engrave Area:</span>
                      <span class="detail-value">${escHtml(item.engrave_area_sqin)} sq in</span>
                    </div>
                    ` : ""}
                    <div class="detail-row">
                      <span class="detail-label">Machine Time:</span>
                      <span class="detail-value">${exportHours(item.machine_time_hours)} hrs</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Handling Time:</span>
                      <span class="detail-value">${exportHours(item.handling_time_hours)} hrs</span>
                    </div>
                  </div>
                  
                  <div class="item-costs">
                    <div class="cost-box machine">
                      <div class="cost-label">Machine Cost</div>
                      <div class="cost-value">${exportMoney(item.machine_cost)}</div>
                    </div>
                    <div class="cost-box labor">
                      <div class="cost-label">Labor Cost</div>
                      <div class="cost-value">${exportMoney(item.labor_cost)}</div>
                    </div>
                  </div>
                </div>
              `).join("")}
              
              <div class="summary">
                <div class="section-title" style="border-color: #10b981;">Cost Summary</div>
                
                <div class="summary-row">
                  <span class="summary-label">Setup Hours:</span>
                  <span class="summary-value">${escHtml(project.fixed_setup_hours)} hrs</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Material Setup Cost:</span>
                  <span class="summary-value">${exportMoney(laserStrictNumber(project.fixed_material_setup_cost))}</span>
                </div>
                
                <div class="summary-row machine">
                  <span class="summary-label">Total Machine Cost:</span>
                  <span class="summary-value">${exportMoney(displayTotals.total_machine_cost)}</span>
                </div>
                <div class="summary-row supplies">
                  <span class="summary-label">Total Supplies Cost:</span>
                  <span class="summary-value">${exportMoney(displayTotals.total_supplies_cost)}</span>
                </div>
                <div class="summary-row labor">
                  <span class="summary-label">Total Labor Cost:</span>
                  <span class="summary-value">${exportMoney(displayTotals.total_labor_cost)}</span>
                </div>
                
                <div class="total-row">
                  <span class="total-label">Total Estimate</span>
                  <span class="total-value">${exportMoney(totalCost)}</span>
                </div>
              </div>
              
              ${project.notes ? `
                <div class="notes">
                  <h3>\u{1F4DD} Additional Notes</h3>
                  <p>${escHtml(project.notes)}</p>
                </div>
              ` : ""}
            </div>
            
            <div class="footer">
              Generated by SignEstimate Pro - Professional Estimating Suite<br>
              \xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} All Rights Reserved
            </div>
          </div>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };
  const emailEstimate = () => {
    const totalCost = displayTotalCost;
    const emailBody = `Hello,

Please find the laser cutting estimate for ${project.project_name}:

Estimate Number: ${project.estimate_number}
Reference Link: ${project.hyperlink}

ESTIMATE SUMMARY:
Total Machine Cost: ${exportMoney(displayTotals.total_machine_cost)}
Total Supplies Cost: ${exportMoney(displayTotals.total_supplies_cost)}
Total Labor Cost: ${exportMoney(displayTotals.total_labor_cost)}
TOTAL ESTIMATE: ${exportMoney(totalCost)}

ITEMS BREAKDOWN:
${displayItems.map((item, i) => `
Item ${i + 1}: ${item.description || `${item.item_type} item`}
- Type: ${item.item_type}
- Material: ${item.material_type} - ${item.material_thickness}"
- Quantity: ${item.quantity}
${item.item_type === "panel" || item.item_type === "engrave_and_cut" ? `- Dimensions: ${item.length}" \xD7 ${item.width}"` : ""}
${item.item_type === "lettering" ? `- Letter Height: ${item.letter_height}", Count: ${item.num_letters}` : ""}
${(item.item_type === "engraving" || item.item_type === "engrave_and_cut") && Number.isFinite(item.engrave_area_sqin) && item.engrave_area_sqin > 0 ? `- Engrave Area: ${item.engrave_area_sqin} sq in` : ""}
- Item Total: ${exportMoney(laserSumOrNull(item.machine_cost, item.labor_cost))}
`).join("\n")}

${project.notes ? `
Additional Notes:
${project.notes}` : ""}

Best regards`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Laser Estimate - ${project.project_name}`)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
  };
  if (isLoading) {
    return /* @__PURE__ */ jsx10("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen flex items-center justify-center", children: /* @__PURE__ */ jsx10("p", { className: "text-slate-600", children: "Loading..." }) });
  }
  if (loadError) {
    return /* @__PURE__ */ jsx10("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: /* @__PURE__ */ jsxs2("div", { className: "max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800", children: [
      /* @__PURE__ */ jsx10("div", { className: "font-bold", children: "Laser Builder unavailable" }),
      /* @__PURE__ */ jsx10("div", { className: "mt-1 text-sm", children: "Required Settings, project data, or estimate context could not be verified. Hard-coded fallback rates were not used." }),
      /* @__PURE__ */ jsx10("div", { className: "mt-2 text-xs break-words", children: loadError }),
      /* @__PURE__ */ jsxs2(Button, { variant: "outline", className: "mt-4", onClick: () => embedded ? onClose?.() : window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator", children: [
        /* @__PURE__ */ jsx10(ArrowLeft, { className: "w-4 h-4 mr-2" }),
        " Back"
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxs2("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: [
    /* @__PURE__ */ jsxs2("div", { className: "max-w-5xl mx-auto", children: [
      /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center mb-6", children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsxs2("h1", { className: "text-3xl font-bold text-slate-900 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx10(Zap, { className: "w-8 h-8" }),
            isEditing ? "Edit" : "New",
            " Laser Estimate"
          ] }),
          /* @__PURE__ */ jsx10("p", { className: "text-slate-600", children: "Create detailed laser cutting and engraving estimates" })
        ] }),
        /* @__PURE__ */ jsx10("div", { className: "flex gap-3", children: /* @__PURE__ */ jsxs2(
          Button,
          {
            variant: "outline",
            onClick: () => embedded ? onClose?.() : window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator",
            children: [
              /* @__PURE__ */ jsx10(ArrowLeft, { className: "w-4 h-4 mr-2" }),
              embedded ? "Back to Products" : "Back to Estimator"
            ]
          }
        ) })
      ] }),
      saveError && /* @__PURE__ */ jsx10("div", { role: "alert", className: "mb-3 px-3 py-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded", children: saveError }),
      allIssues.length > 0 && /* @__PURE__ */ jsxs2("div", { role: "status", id: "laser-pricing-issues", className: "mb-3 flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-300 rounded px-3 py-2", children: [
        /* @__PURE__ */ jsx10(AlertTriangle, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" }),
        /* @__PURE__ */ jsxs2("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxs2("div", { className: "font-semibold", children: [
            "Pricing unavailable \u2014 ",
            allIssues.length,
            " value",
            allIssues.length === 1 ? "" : "s",
            " need",
            allIssues.length === 1 ? "s" : "",
            " attention before this estimate can be priced or saved."
          ] }),
          /* @__PURE__ */ jsxs2("ul", { className: "mt-1 space-y-0.5 list-disc list-inside", children: [
            allIssues.slice(0, 5).map((it, i) => /* @__PURE__ */ jsx10("li", { children: it.message }, i)),
            allIssues.length > 5 && /* @__PURE__ */ jsxs2("li", { children: [
              "\u2026and ",
              allIssues.length - 5,
              " more"
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "grid lg:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsx10("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs2(Tabs, { value: activeTab, onValueChange: setActiveTab, className: "w-full", children: [
          /* @__PURE__ */ jsx10("div", { className: "sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60", children: /* @__PURE__ */ jsxs2(TabsList, { className: "grid grid-cols-5 w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1", children: [
            /* @__PURE__ */ jsx10(TabBadgeTrigger_default, { value: "project", icon: FileText, label: "Project", color: "red" }),
            /* @__PURE__ */ jsx10(TabBadgeTrigger_default, { value: "items", icon: ListChecks, label: "Items", amount: (displayTotals.total_machine_cost ?? 0) + (displayTotals.total_labor_cost ?? 0), count: (project.items || []).length, color: "red" }),
            /* @__PURE__ */ jsx10(TabBadgeTrigger_default, { value: "advanced", icon: Settings2, label: "Advanced", color: "red" }),
            /* @__PURE__ */ jsx10(TabBadgeTrigger_default, { value: "summary", icon: Calculator, label: "Summary", amount: displayTotalCost ?? 0, color: "red" }),
            /* @__PURE__ */ jsx10(TabBadgeTrigger_default, { value: "pricing", icon: TrendingUp, label: "Customer Pricing", accent: true, color: "red" })
          ] }) }),
          /* @__PURE__ */ jsx10(TabsContent, { value: "project", className: "mt-4 space-y-4", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx10(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx10(CardTitle, { className: "text-lg font-semibold text-slate-900", children: "Project Information" }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "px-2 space-y-3", children: [
              /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 gap-3", children: [
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx10(Label, { htmlFor: "client_name", children: "Client Name *" }),
                  /* @__PURE__ */ jsx10(
                    Input,
                    {
                      value: estimateContext?.client_name || project.client_name || "",
                      onChange: (e) => !embedded && setProject((prev) => ({ ...prev, client_name: e.target.value })),
                      readOnly: embedded,
                      className: "mt-1",
                      placeholder: "Enter client name"
                    }
                  ),
                  embedded && /* @__PURE__ */ jsx10("p", { className: "text-[10px] text-slate-400 mt-1", children: "Inherited from the All-In-One estimate." })
                ] }),
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx10(Label, { htmlFor: "project_name", children: "Project Name *" }),
                  /* @__PURE__ */ jsx10(
                    Input,
                    {
                      id: "project_name",
                      value: project.project_name,
                      onChange: (e) => setProject((prev) => ({ ...prev, project_name: e.target.value })),
                      placeholder: "Enter project name",
                      className: "mt-1"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 gap-3", children: [
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx10(Label, { htmlFor: "estimate_number", children: "Estimate Number" }),
                  /* @__PURE__ */ jsx10(
                    Input,
                    {
                      id: "estimate_number",
                      value: estimateContext?.estimate_number || project.estimate_number || "",
                      onChange: (e) => !embedded && setProject((prev) => ({ ...prev, estimate_number: e.target.value })),
                      readOnly: embedded,
                      placeholder: "e.g., LASER-2024-001",
                      className: "mt-1"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsxs2(Label, { htmlFor: "hyperlink", children: [
                    "Project Link ",
                    /* @__PURE__ */ jsx10("span", { className: "text-xs font-normal text-slate-400", children: "(optional)" })
                  ] }),
                  /* @__PURE__ */ jsx10(
                    Input,
                    {
                      id: "hyperlink",
                      value: project.hyperlink,
                      onChange: (e) => setProject((prev) => ({ ...prev, hyperlink: e.target.value })),
                      placeholder: "https://...",
                      className: "mt-1"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx10(Label, { htmlFor: "notes", children: "Project Notes" }),
                /* @__PURE__ */ jsx10(
                  Textarea,
                  {
                    id: "notes",
                    value: project.notes,
                    onChange: (e) => setProject((prev) => ({ ...prev, notes: e.target.value })),
                    placeholder: "Any additional notes...",
                    className: "bg-transparent px-2 py-2 text-base rounded-md flex min-h-[60px] w-full border border-input shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-12"
                  }
                )
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx10(TabsContent, { value: "items", className: "mt-4 space-y-4", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx10(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center", children: [
              /* @__PURE__ */ jsx10(CardTitle, { className: "text-lg font-semibold text-slate-900", children: "Items" }),
              /* @__PURE__ */ jsxs2(Button, { onClick: addItem, size: "sm", className: "bg-red-600 hover:bg-red-700", children: [
                /* @__PURE__ */ jsx10(Plus, { className: "w-4 h-4 mr-2" }),
                "Add Item"
              ] })
            ] }) }),
            /* @__PURE__ */ jsx10(CardContent, { className: "space-y-4", children: (project.items || []).length === 0 ? /* @__PURE__ */ jsx10("div", { className: "text-center py-8 text-slate-500", children: /* @__PURE__ */ jsx10("p", { children: 'No items added yet. Click "Add Item" to get started.' }) }) : (project.items || []).map(
              (item, index) => /* @__PURE__ */ jsxs2("div", { className: "p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3", children: [
                /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-start", children: [
                  /* @__PURE__ */ jsxs2("h4", { className: "font-semibold text-slate-900", children: [
                    "Item #",
                    index + 1
                  ] }),
                  /* @__PURE__ */ jsxs2("label", { title: "Attach a DXF/SVG cut file - extracts width x height into length/width", className: "inline-flex items-center gap-1 h-[27px] px-2 rounded border border-sky-300 bg-sky-50 text-[9px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer", children: [
                    item.file_url ? "Re-attach" : "Attach",
                    /* @__PURE__ */ jsx10("input", { type: "file", accept: ".dxf,.svg,.dwg,.txt", className: "hidden", onChange: (e) => attachFileToItem(index, e.target.files?.[0]) })
                  ] }),
                  /* @__PURE__ */ jsx10(Button, { variant: "ghost", size: "icon", onClick: () => removeItem(index), className: "text-red-500 hover:text-red-700 hover:bg-red-50", children: /* @__PURE__ */ jsx10(Trash2, { className: "w-4 h-4" }) })
                ] }),
                /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 gap-3", children: [
                  /* @__PURE__ */ jsxs2("div", { className: "md:col-span-2", children: [
                    /* @__PURE__ */ jsx10(Label, { children: "Description" }),
                    /* @__PURE__ */ jsx10(
                      Input,
                      {
                        "data-item-desc": index,
                        value: item.description,
                        onChange: (e) => updateItem(index, "description", e.target.value),
                        placeholder: "Brief description",
                        className: "mt-1"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx10(Label, { children: "Item Type" }),
                    /* @__PURE__ */ jsxs2(Select, { value: item.item_type, onValueChange: (value) => updateItem(index, "item_type", value), children: [
                      /* @__PURE__ */ jsx10(SelectTrigger, { className: "mt-1", "aria-invalid": itemFieldFlag("item_type", index), "aria-describedby": itemFieldDesc("item_type", index), children: /* @__PURE__ */ jsx10(SelectValue, {}) }),
                      /* @__PURE__ */ jsxs2(SelectContent, { children: [
                        /* @__PURE__ */ jsx10(SelectItem, { value: "panel", children: "Panel (Cut Perimeter)" }),
                        /* @__PURE__ */ jsx10(SelectItem, { value: "lettering", children: "Lettering (Cut Letters)" }),
                        /* @__PURE__ */ jsx10(SelectItem, { value: "engraving", children: "Engraving Only" }),
                        /* @__PURE__ */ jsx10(SelectItem, { value: "engrave_and_cut", children: "Engrave and Cut" })
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx10(Label, { children: "Material Type" }),
                    /* @__PURE__ */ jsxs2(Select, { value: item.material_type, onValueChange: (value) => updateItem(index, "material_type", value), children: [
                      /* @__PURE__ */ jsx10(SelectTrigger, { className: "mt-1", "aria-invalid": itemFieldFlag("material_type", index), "aria-describedby": itemFieldDesc("material_type", index), children: /* @__PURE__ */ jsx10(SelectValue, {}) }),
                      /* @__PURE__ */ jsx10(SelectContent, { children: materials.map(
                        (mat) => /* @__PURE__ */ jsx10(SelectItem, { value: mat, children: mat }, mat)
                      ) })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx10(Label, { children: "Material Thickness" }),
                    /* @__PURE__ */ jsxs2(Select, { value: item.material_thickness, onValueChange: (value) => updateItem(index, "material_thickness", value), children: [
                      /* @__PURE__ */ jsx10(SelectTrigger, { className: "mt-1", "aria-invalid": itemFieldFlag("material_thickness", index), "aria-describedby": itemFieldDesc("material_thickness", index), children: /* @__PURE__ */ jsx10(SelectValue, {}) }),
                      /* @__PURE__ */ jsx10(SelectContent, { children: imperialSizes.map(
                        (size) => /* @__PURE__ */ jsxs2(SelectItem, { value: size, children: [
                          size,
                          '"'
                        ] }, size)
                      ) })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx10(Label, { children: "Quantity" }),
                    /* @__PURE__ */ jsx10(
                      Input,
                      {
                        type: "number",
                        min: "1",
                        value: item.quantity ?? "",
                        onChange: (e) => updateItem(index, "quantity", laserDraftValue(e.target.value)),
                        "aria-invalid": itemFieldFlag("quantity", index),
                        "aria-describedby": itemFieldDesc("quantity", index),
                        className: "mt-1"
                      }
                    )
                  ] }),
                  (item.item_type === "panel" || item.item_type === "engrave_and_cut" || item.item_type === "engraving") && /* @__PURE__ */ jsxs2(Fragment, { children: [
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx10(Label, { children: "Length (inches)" }),
                      /* @__PURE__ */ jsx10(
                        Input,
                        {
                          type: "number",
                          step: "0.125",
                          value: item.length ?? "",
                          onChange: (e) => updateItem(index, "length", laserDraftValue(e.target.value)),
                          "aria-invalid": itemFieldFlag("length", index),
                          "aria-describedby": itemFieldDesc("length", index),
                          className: "mt-1"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx10(Label, { children: "Width (inches)" }),
                      /* @__PURE__ */ jsx10(
                        Input,
                        {
                          type: "number",
                          step: "0.125",
                          value: item.width ?? "",
                          onChange: (e) => updateItem(index, "width", laserDraftValue(e.target.value)),
                          "aria-invalid": itemFieldFlag("width", index),
                          "aria-describedby": itemFieldDesc("width", index),
                          className: "mt-1"
                        }
                      )
                    ] })
                  ] }),
                  item.item_type === "lettering" && /* @__PURE__ */ jsxs2(Fragment, { children: [
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx10(Label, { children: "Letter Height (inches)" }),
                      /* @__PURE__ */ jsx10(
                        Input,
                        {
                          type: "number",
                          step: "0.125",
                          value: item.letter_height ?? "",
                          onChange: (e) => updateItem(index, "letter_height", laserDraftValue(e.target.value)),
                          "aria-invalid": itemFieldFlag("letter_height", index),
                          "aria-describedby": itemFieldDesc("letter_height", index),
                          className: "mt-1"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx10(Label, { children: "Number of Letters" }),
                      /* @__PURE__ */ jsx10(
                        Input,
                        {
                          type: "number",
                          min: "1",
                          value: item.num_letters ?? "",
                          onChange: (e) => updateItem(index, "num_letters", laserDraftValue(e.target.value)),
                          "aria-invalid": itemFieldFlag("num_letters", index),
                          "aria-describedby": itemFieldDesc("num_letters", index),
                          className: "mt-1"
                        }
                      )
                    ] })
                  ] }),
                  (item.item_type === "panel" || item.item_type === "lettering" || item.item_type === "engrave_and_cut") && /* @__PURE__ */ jsx10("div", { className: "md:col-span-2 p-3 bg-blue-50 rounded-lg", children: /* @__PURE__ */ jsxs2("p", { className: "text-sm text-blue-800", children: [
                    /* @__PURE__ */ jsx10("strong", { children: "Total Cut Length:" }),
                    " ",
                    Number.isFinite(item.total_cut_length_inches) ? item.total_cut_length_inches.toFixed(2) : "\u2014",
                    '"',
                    /* @__PURE__ */ jsx10("span", { className: "mx-2", children: "\u2022" }),
                    /* @__PURE__ */ jsx10("strong", { children: "Cut Speed:" }),
                    " ",
                    Number.isFinite(item.cut_speed_ipm) ? item.cut_speed_ipm.toFixed(1) : "\u2014",
                    " mm/sec"
                  ] }) }),
                  (item.item_type === "engraving" || item.item_type === "engrave_and_cut") && /* @__PURE__ */ jsxs2("div", { className: "md:col-span-2 border-t pt-4", children: [
                    /* @__PURE__ */ jsx10(Label, { children: "Engraving Area (sq inches)" }),
                    /* @__PURE__ */ jsx10(
                      Input,
                      {
                        type: "number",
                        step: "0.1",
                        min: "0",
                        value: item.engrave_area_sqin ?? "",
                        onChange: (e) => updateItem(index, "engrave_area_sqin", laserDraftValue(e.target.value)),
                        "aria-invalid": itemFieldFlag("engrave_area_sqin", index),
                        "aria-describedby": itemFieldDesc("engrave_area_sqin", index),
                        placeholder: "Enter engraving area",
                        className: "mt-1"
                      }
                    ),
                    Number.isFinite(item.engrave_area_sqin) && item.engrave_area_sqin > 0 && /* @__PURE__ */ jsxs2("p", { className: "text-xs text-slate-500 mt-1", children: [
                      "Engrave Speed: ",
                      Number.isFinite(item.engrave_speed_sqipm) ? item.engrave_speed_sqipm.toFixed(1) : "\u2014",
                      " mm\xB2/sec"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx10("div", { className: "md:col-span-2 p-3 bg-green-50 rounded-lg border border-green-200", children: /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-2 gap-3 text-sm", children: [
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx10("p", { className: "text-slate-600", children: "Machine Time" }),
                      /* @__PURE__ */ jsxs2("p", { className: "font-semibold text-slate-900", children: [
                        Number.isFinite(displayItems[index]?.machine_time_hours) ? displayItems[index].machine_time_hours.toFixed(3) : "\u2014",
                        " hrs"
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx10("p", { className: "text-slate-600", children: "Handling Time" }),
                      /* @__PURE__ */ jsxs2("p", { className: "font-semibold text-slate-900", children: [
                        Number.isFinite(displayItems[index]?.handling_time_hours) ? displayItems[index].handling_time_hours.toFixed(3) : "\u2014",
                        " hrs"
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx10("p", { className: "text-slate-600", children: "Machine Cost" }),
                      /* @__PURE__ */ jsx10("p", { className: "font-semibold text-green-700", children: exportMoney(displayItems[index]?.machine_cost) })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx10("p", { className: "text-slate-600", children: "Labor Cost" }),
                      /* @__PURE__ */ jsx10("p", { className: "font-semibold text-green-700", children: exportMoney(displayItems[index]?.labor_cost) })
                    ] })
                  ] }) }),
                  itemIssues(index).length > 0 && /* @__PURE__ */ jsxs2("div", { role: "status", id: itemIssuesId(index), className: "md:col-span-2 flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: [
                    /* @__PURE__ */ jsx10(AlertTriangle, { className: "w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" }),
                    /* @__PURE__ */ jsx10("ul", { className: "space-y-0.5 list-disc list-inside", children: itemIssues(index).map((it, ii) => /* @__PURE__ */ jsx10("li", { children: it.message }, ii)) })
                  ] })
                ] })
              ] }, index)
            ) })
          ] }) }),
          /* @__PURE__ */ jsx10(TabsContent, { value: "advanced", className: "mt-4 space-y-4", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx10(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx10(CardTitle, { className: "text-lg font-semibold text-slate-900", children: "Advanced Settings" }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-3", children: [
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx10(Label, { children: "Fixed Setup Time (hours)" }),
                /* @__PURE__ */ jsx10(
                  Input,
                  {
                    type: "number",
                    step: "0.1",
                    min: "0",
                    value: project.fixed_setup_hours ?? "",
                    onChange: (e) => setProject((prev) => ({ ...prev, fixed_setup_hours: laserDraftValue(e.target.value) })),
                    "aria-invalid": projectFieldFlag("fixed_setup_hours"),
                    "aria-describedby": projectFieldDesc("fixed_setup_hours"),
                    className: "mt-1"
                  }
                ),
                /* @__PURE__ */ jsx10("p", { className: "text-xs text-slate-500 mt-1", children: "One-time setup labor cost applied to the entire project" })
              ] }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx10(Label, { children: "Fixed Material Setup Cost ($)" }),
                /* @__PURE__ */ jsx10(
                  Input,
                  {
                    type: "number",
                    step: "1",
                    min: "0",
                    value: project.fixed_material_setup_cost ?? "",
                    onChange: (e) => setProject((prev) => ({ ...prev, fixed_material_setup_cost: laserDraftValue(e.target.value) })),
                    "aria-invalid": projectFieldFlag("fixed_material_setup_cost"),
                    "aria-describedby": projectFieldDesc("fixed_material_setup_cost"),
                    className: "mt-1"
                  }
                ),
                /* @__PURE__ */ jsx10("p", { className: "text-xs text-slate-500 mt-1", children: "One-time material/setup cost applied to the entire project, added to supplies cost." })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx10(TabsContent, { value: "summary", className: "mt-4 space-y-4", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx10(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx10(CardTitle, { className: "text-lg font-semibold text-slate-900", children: "Estimate Breakdown" }) }),
            /* @__PURE__ */ jsx10(CardContent, { className: "p-0", children: /* @__PURE__ */ jsxs2("table", { className: "w-full text-sm", children: [
              /* @__PURE__ */ jsx10("thead", { className: "bg-slate-50 text-slate-600 text-xs", children: /* @__PURE__ */ jsxs2("tr", { children: [
                /* @__PURE__ */ jsx10("th", { className: "text-left px-4 py-2 font-medium w-8", children: "#" }),
                /* @__PURE__ */ jsx10("th", { className: "text-left px-4 py-2 font-medium", children: "Description" }),
                /* @__PURE__ */ jsx10("th", { className: "text-left px-4 py-2 font-medium", children: "Type" }),
                /* @__PURE__ */ jsx10("th", { className: "text-right px-4 py-2 font-medium", children: "Machine" }),
                /* @__PURE__ */ jsx10("th", { className: "text-right px-4 py-2 font-medium", children: "Labor" }),
                /* @__PURE__ */ jsx10("th", { className: "text-right px-4 py-2 font-medium", children: "Total" })
              ] }) }),
              /* @__PURE__ */ jsx10("tbody", { children: displayItems.map((it, i) => /* @__PURE__ */ jsxs2("tr", { className: "border-t border-slate-100", children: [
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 text-slate-500", children: i + 1 }),
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 font-medium", children: it.description || `Item ${i + 1}` }),
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 capitalize text-xs text-slate-600", children: (it.item_type || "").replace(/_/g, " ") }),
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 text-right tabular-nums", children: exportMoney(it.machine_cost) }),
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 text-right tabular-nums", children: exportMoney(it.labor_cost) }),
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 text-right tabular-nums font-semibold", children: exportMoney(laserSumOrNull(it.machine_cost, it.labor_cost)) })
              ] }, i)) }),
              /* @__PURE__ */ jsx10("tfoot", { className: "bg-slate-50 border-t-2 border-slate-200 text-sm", children: /* @__PURE__ */ jsxs2("tr", { children: [
                /* @__PURE__ */ jsx10("td", { colSpan: "3", className: "px-4 py-2 text-right font-medium", children: "Totals" }),
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 text-right tabular-nums font-medium", children: exportMoney(displayTotals.total_machine_cost) }),
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 text-right tabular-nums font-medium", children: exportMoney(displayTotals.total_labor_cost) }),
                /* @__PURE__ */ jsx10("td", { className: "px-4 py-2 text-right tabular-nums font-bold", children: exportMoney(displayTotalCost) })
              ] }) })
            ] }) })
          ] }) }),
          /* @__PURE__ */ jsx10(TabsContent, { value: "pricing", className: "mt-4 space-y-4", children: /* @__PURE__ */ jsx10(
            CustomerPricingTab_default,
            {
              project: {
                ...project,
                // Advisory tier math — under held pricing feed the
                // acknowledged/saved amounts (or 0 when none), never NaN.
                total_machine_cost: displayTotals.total_machine_cost ?? 0,
                total_supplies_cost: displayTotals.total_supplies_cost ?? 0,
                total_labor_cost: displayTotals.total_labor_cost ?? 0,
                total_cost: displayTotalCost ?? 0
              },
              categorize: categorizeLaserProject,
              accentColor: "red",
              onTierChange: (tier) => setProject((prev) => ({
                ...prev,
                customer_pricing: { ...prev.customer_pricing || {}, tier_number: tier }
              }))
            }
          ) })
        ] }) }),
        /* @__PURE__ */ jsx10("div", { children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm sticky top-8", children: [
          /* @__PURE__ */ jsx10(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx10(CardTitle, { children: "Project Summary" }) }),
          /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-4 pt-4", children: [
            pricingUnavailable && /* @__PURE__ */ jsx10("p", { className: "text-[10px] text-amber-700", children: "Saved amounts (not current pricing) \u2014 held until the flagged values are fixed." }),
            /* @__PURE__ */ jsxs2("div", { className: "p-4 bg-blue-50 rounded-lg", children: [
              /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center mb-2", children: [
                /* @__PURE__ */ jsx10("span", { className: "text-sm font-medium text-blue-800", children: "Machine Cost:" }),
                /* @__PURE__ */ jsx10("span", { className: "text-lg font-bold text-blue-900", children: hasLaserCostSnapshot(displayTotals.total_machine_cost) ? `$${displayTotals.total_machine_cost.toFixed(2)}` : /* @__PURE__ */ jsx10("span", { className: "text-amber-700 text-sm font-semibold", children: "Not saved" }) })
              ] }),
              /* @__PURE__ */ jsx10("p", { className: "text-xs text-blue-600", children: "Laser machine operating time costs" })
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "p-4 bg-purple-50 rounded-lg", children: [
              /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center mb-2", children: [
                /* @__PURE__ */ jsx10("span", { className: "text-sm font-medium text-purple-800", children: "Supplies Cost:" }),
                /* @__PURE__ */ jsx10("span", { className: "text-lg font-bold text-purple-900", children: hasLaserCostSnapshot(displayTotals.total_supplies_cost) ? `$${displayTotals.total_supplies_cost.toFixed(2)}` : /* @__PURE__ */ jsx10("span", { className: "text-amber-700 text-sm font-semibold", children: "Not saved" }) })
              ] }),
              /* @__PURE__ */ jsx10("p", { className: "text-xs text-purple-600", children: "Materials and setup supplies" })
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "p-4 bg-green-50 rounded-lg", children: [
              /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center mb-2", children: [
                /* @__PURE__ */ jsx10("span", { className: "text-sm font-medium text-green-800", children: "Labor Cost:" }),
                /* @__PURE__ */ jsx10("span", { className: "text-lg font-bold text-green-900", children: hasLaserCostSnapshot(displayTotals.total_labor_cost) ? `$${displayTotals.total_labor_cost.toFixed(2)}` : /* @__PURE__ */ jsx10("span", { className: "text-amber-700 text-sm font-semibold", children: "Not saved" }) })
              ] }),
              /* @__PURE__ */ jsx10("p", { className: "text-xs text-green-600", children: "Handling, setup, and labor time" })
            ] }),
            /* @__PURE__ */ jsx10("div", { className: "border-t pt-4", children: /* @__PURE__ */ jsxs2("div", { className: "flex justify-between text-sm text-slate-600", children: [
              /* @__PURE__ */ jsx10("span", { children: "Total Quantity:" }),
              /* @__PURE__ */ jsx10("span", { className: "font-medium", children: (project.items || []).reduce((sum, item) => {
                const qty = parseFloat(item.quantity) || 0;
                if (item.item_type === "lettering") {
                  return sum + qty * (parseFloat(item.num_letters) || 0);
                }
                return sum + qty;
              }, 0) })
            ] }) }),
            /* @__PURE__ */ jsxs2("div", { className: "space-y-2 pt-4 border-t", children: [
              /* @__PURE__ */ jsx10(Button, { onClick: downloadEstimate, variant: "outline", className: "w-full", children: "Download Estimate" }),
              /* @__PURE__ */ jsx10(Button, { onClick: printEstimate, variant: "outline", className: "w-full", children: "Print Estimate" }),
              /* @__PURE__ */ jsx10(Button, { onClick: emailEstimate, variant: "outline", className: "w-full", children: "Email Estimate" })
            ] }),
            project?.updated_date && /* @__PURE__ */ jsxs2("div", { className: "mt-1 text-[10px] text-gray-400", children: [
              "Last saved ",
              new Date(project.updated_date).toLocaleString()
            ] }),
            /* @__PURE__ */ jsx10(Button, { onClick: saveProject, disabled: isSaving || !project.project_name || !(estimateContext?.client_name || project.client_name) || project.items.length === 0, className: "w-full bg-green-600 hover:bg-green-700 text-white py-3 mt-4", children: isSaving ? "Saving..." : /* @__PURE__ */ jsxs2(Fragment, { children: [
              /* @__PURE__ */ jsx10(Save, { className: "w-4 h-4 mr-2" }),
              " ",
              isEditing ? "Update Estimate" : "Save Estimate"
            ] }) }),
            /* @__PURE__ */ jsx10("div", { className: "flex flex-wrap gap-2 mt-2", children: /* @__PURE__ */ jsx10(
              ModuleActionBar_default,
              {
                onTemplates: () => setTemplateMode("load"),
                onSaveAsTemplate: () => setTemplateMode("save"),
                onSaveAsCopy: handleSaveAsCopy,
                estimateId,
                saving: isSaving
              }
            ) })
          ] })
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ jsx10(
      ModuleTemplateDialog_default,
      {
        open: !!templateMode,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => setProject((prev) => ({ ...prev, ...data })),
        moduleKey: "laser",
        title: "Laser",
        buildTemplateData: buildLaserTemplateData,
        describeTemplate: (t) => `${(t.project_data?.items || []).length} items`
      }
    )
  ] });
}
export {
  LaserEstimator as Page
};
