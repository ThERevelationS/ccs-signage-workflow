// frozen:/app/src/pages/CNCEstimator.jsx
import { useState, useEffect, useMemo, useRef } from "react";

// s:s://@/api/gatedEntities
var CNCProject = {
  get: async (id) => {
    globalThis.__spies.push(["projectGet", id]);
    return globalThis.__project ?? null;
  }
};
var Settings = globalThis.__entSettings ||= { __ent: "settings" };

// frozen:/app/src/pages/CNCEstimator.jsx
import { useSearchParams } from "react-router-dom";

// s:s://@/components/ui/button
import { jsx } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx("button", { type: "button", ...p, children: p.children });

// s:s://@/components/ui/card
import { jsx as jsx2 } from "react/jsx-runtime";
var Card = (p) => /* @__PURE__ */ jsx2("div", { ...p, children: p.children });
var CardContent = (p) => /* @__PURE__ */ jsx2("div", { ...p, children: p.children });
var CardHeader = (p) => /* @__PURE__ */ jsx2("div", { ...p, children: p.children });
var CardTitle = (p) => /* @__PURE__ */ jsx2("div", { ...p, children: p.children });

// s:s://@/components/ui/input
import { jsx as jsx3 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx3("input", { ...p });

// s:s://@/components/ui/label
import { jsx as jsx4 } from "react/jsx-runtime";
var Label = (p) => /* @__PURE__ */ jsx4("label", { ...p, children: p.children });

// s:s://@/components/ui/textarea
import { jsx as jsx5 } from "react/jsx-runtime";
var Textarea = (p) => /* @__PURE__ */ jsx5("textarea", { ...p });

// s:s://@/components/ui/select
import { jsx as jsx6 } from "react/jsx-runtime";
var Select = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var SelectTrigger = (p) => /* @__PURE__ */ jsx6("div", { "data-trigger": true, "aria-invalid": p["aria-invalid"], "aria-describedby": p["aria-describedby"], className: p.className, children: p.children });
var SelectValue = () => /* @__PURE__ */ jsx6("span", {});
var SelectContent = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var SelectItem = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });

// s:s://lucide-react
var AlertTriangle = () => null;
var ArrowLeft = () => null;
var Plus = () => null;
var Trash2 = () => null;
var Save = () => null;
var Router = () => null;
var FileText = () => null;
var ListChecks = () => null;
var Calculator = () => null;
var TrendingUp = () => null;

// s:s://@/components/ui/tabs
import { jsx as jsx7 } from "react/jsx-runtime";
var Tabs = (p) => /* @__PURE__ */ jsx7("div", { className: p.className, children: p.children });
var TabsList = (p) => /* @__PURE__ */ jsx7("div", { className: p.className, children: p.children });
var TabsContent = (p) => /* @__PURE__ */ jsx7("div", { className: p.className, children: p.children });
var TabsTrigger = (p) => /* @__PURE__ */ jsx7("button", { type: "button", className: p.className, value: p.value, children: p.children });

// frozen:/app/src/pages/CNCEstimator.jsx
import { Link, useNavigate } from "react-router-dom";

// frozen:/app/src/components/channelLetterInstall/TabBadgeTrigger.jsx
import React from "react";
import { jsx as jsx8, jsxs } from "react/jsx-runtime";
var compact = (v) => {
  const n = parseFloat(v) || 0;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
};
var COLOR_STYLES = {
  purple: {
    active: "data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-purple-50 data-[state=inactive]:text-purple-900"
  },
  blue: {
    active: "data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-blue-50 data-[state=inactive]:text-blue-900"
  },
  red: {
    active: "data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-red-50 data-[state=inactive]:text-red-900"
  },
  green: {
    active: "data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-green-50 data-[state=inactive]:text-green-900"
  },
  orange: {
    active: "data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-orange-50 data-[state=inactive]:text-orange-900"
  }
};
function TabBadgeTrigger({ value, icon: Icon, label, amount, count, warn, accent, color = "purple" }) {
  const hasAmount = parseFloat(amount) > 0;
  const styles = COLOR_STYLES[color] || COLOR_STYLES.purple;
  return /* @__PURE__ */ jsxs(
    TabsTrigger,
    {
      value,
      className: `
        flex flex-row items-center justify-center gap-1.5 h-7 px-2 rounded-lg
        text-slate-700
        ${styles.active}
        ${accent ? styles.accent : ""}
        relative transition-all
      `,
      children: [
        /* @__PURE__ */ jsx8(Icon, { className: "w-3.5 h-3.5" }),
        /* @__PURE__ */ jsx8("span", { className: "text-xs font-medium", children: label }),
        count != null && /* @__PURE__ */ jsx8("span", { className: "text-[10px] bg-slate-200 text-slate-700 data-[state=active]:bg-white/20 data-[state=active]:text-white rounded-full px-1.5 py-0 leading-tight", children: count }),
        hasAmount && /* @__PURE__ */ jsx8("span", { className: "text-[10px] tabular-nums font-semibold opacity-80 leading-tight", children: compact(amount) }),
        warn && /* @__PURE__ */ jsx8("span", { className: "w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse", title: "Action required" })
      ]
    }
  );
}

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx9 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx9("div", { "data-stub": "CustomerPricingTab" });

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
function _impl_categorizeCNCProject(p) {
  if (!p) return [];
  const lines = [];
  const machine = num(p.total_machine_cost);
  if (machine > 0) lines.push({ module: "cnc", label: "CNC Machine Time", cost: machine, category_key: "machine_time" });
  const labor = num(p.total_labor_cost);
  if (labor > 0) lines.push({ module: "cnc", label: "CNC Labor", cost: labor, category_key: "inhouse_labor" });
  return lines;
}
var categorizeCNCProject = (p) => _catMemo(p, _impl_categorizeCNCProject);

// s:s://@/components/markup/savedCustomerPricing
async function calculateSavedCustomerPricing(a) {
  globalThis.__spies.push(["pricing", a]);
  return null;
}

// s:s://@/components/cnc/HoldDownAdvisor
import { jsx as jsx10 } from "react/jsx-runtime";
var HoldDownAdvisor_default = () => /* @__PURE__ */ jsx10("div", { "data-stub": "HoldDownAdvisor" });

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

// frozen:/app/src/components/estimator/builder/itemIdentity.js
function newBuilderItemId(prefix = "item") {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}
function seedBuilderItemIds(items = []) {
  return (items || []).map((item, index) => ({
    ...item || {},
    builder_item_id: String(item?.builder_item_id ?? index)
  }));
}

// s:s://@/components/estimator/idempotentEntityCreate
var ensureIdempotentEntityCreate = async (a) => {
  globalThis.__spies.push(["ensureIdempotent", a]);
  return { ...a.data, id: "new-1", updated_date: "v1" };
};
var newCreationRequestKey = (k) => "key-" + k + "-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);

// s:s://@/components/estimator/moduleShared/ModuleActionBar
import { jsx as jsx11 } from "react/jsx-runtime";
var ModuleActionBar_default = (p) => /* @__PURE__ */ jsx11("button", { type: "button", "data-stub": "copy", onClick: p.onSaveAsCopy, children: "copy" });

// s:s://@/components/estimator/moduleShared/ModuleTemplateDialog
var ModuleTemplateDialog_default = () => null;

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var saveModuleProjectCopy = async (a) => {
  globalThis.__spies.push(["saveCopy", a]);
  return { id: "copy-1" };
};

// s:s://@/components/staff/staffEntities
var staffEntities = {
  AllInOneEstimate: { get: async (id) => globalThis.__estimate ?? null }
};

// frozen:/app/src/components/estimator/cnc/cncPricingAvailability.js
var cncStrictNumber = (v) => {
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
var cncNonNegativeNumber = (v) => {
  const n = cncStrictNumber(v);
  return n !== null && n >= 0 ? n : null;
};
var cncPositiveNumber = (v) => {
  const n = cncStrictNumber(v);
  return n !== null && n > 0 ? n : null;
};
var recorded = (v) => v !== void 0 && v !== null && !(typeof v === "string" && v.trim() === "");
var cncSettingRecorded = (settings, key) => recorded(settings?.[key]);
var cncSettingNumber = (settings, key) => cncStrictNumber(settings?.[key]);
var hasCncCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var cncDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
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
var CNC_MATERIALS = ["Acrylic", "Wood", "MDF", "Plywood", "PVC", "HDPE", "Aluminum", "Corian"];
var CNC_ITEM_TYPES = ["panel", "lettering", "3d_carving"];
var IMPERIAL_SIZES = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8", "1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4"];
var CUT_SPEED_KEYS = IMPERIAL_SIZES.map((s) => `cnc_cut_speed_${s.replace("/", "_").replace("-", "_")}`);
var CUT_MULTIPLIER_KEYS = CNC_MATERIALS.map((m) => `${m.toLowerCase()}_cnc_cut_multiplier`);
var LIVE_SETTINGS = [
  ["cnc_letter_perimeter_factor", "letter perimeter factor", true],
  ["min_cnc_labor_hours", "minimum dynamic labor hours floor", false],
  ...CUT_SPEED_KEYS.map((k) => [k, "cut speed (in/min)", true]),
  ...CUT_MULTIPLIER_KEYS.map((k) => [k, "material cut multiplier", true])
];
function cncSettingIssues(settings = {}) {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("cnc_catalog", { field, code, message, hold: "project" }));
  for (const [key, human, positive] of LIVE_SETTINGS) {
    if (!cncSettingRecorded(settings, key)) continue;
    const n = cncStrictNumber(settings[key]);
    if (n === null || (positive ? n <= 0 : n < 0)) {
      add(
        key,
        "cnc_setting_unavailable",
        `Setting ${key}: record a finite, ${positive ? "positive" : "nonnegative"} ${human} in CNC Settings \u2014 the stored value cannot price this estimate`
      );
    }
  }
  return issues;
}
function cncItemIssues(rawItem = {}, index = 0) {
  const issues = [];
  const label = `Item ${index + 1}${rawItem?.description ? ` "${rawItem.description}"` : ""}`;
  const add = (field, code, message) => issues.push(issue("cnc", { index, itemIndex: index, field, code, message: `${label}: ${message}`, hold: "item" }));
  const type = rawItem?.item_type;
  const typeKnown = CNC_ITEM_TYPES.includes(type);
  if (!typeKnown) {
    add(
      "item_type",
      "cnc_item_type_unavailable",
      "select Panel Cut, Lettering Cut, or 3D Carving \u2014 the stored type silently prices the cut leg as $0"
    );
  }
  const cutLeg = type === "panel" || type === "lettering";
  if (type !== "lettering" && typeKnown) {
    const q = cncStrictNumber(rawItem?.quantity);
    if (q === null || q < 1) {
      add(
        "quantity",
        "cnc_quantity_unavailable",
        "record a quantity of 1 or more \u2014 a blank or malformed value silently zeroes this item's machine time"
      );
    }
  }
  if (cutLeg) {
    const mt = rawItem?.material_type;
    if (!recorded(mt) || !CNC_MATERIALS.map((m) => m.toLowerCase()).includes(String(mt).toLowerCase())) {
      add(
        "material_type",
        "cnc_material_unavailable",
        "choose a known material \u2014 the stored value silently prices the cut multiplier as 1\xD7"
      );
    }
  }
  if (type === "panel") {
    for (const [field, human] of [["length", "length"], ["width", "height"]]) {
      const n = cncStrictNumber(rawItem?.[field]);
      if (n === null || n < 0) {
        add(
          field,
          "cnc_dimension_unavailable",
          `record a finite, nonnegative ${human} (inches) \u2014 the stored value cannot price the cut perimeter`
        );
      }
    }
    const l = cncStrictNumber(rawItem?.length);
    const w = cncStrictNumber(rawItem?.width);
    if (l !== null && w !== null && l >= 0 && w >= 0 && l + w === 0) {
      add(
        "length",
        "cnc_dimension_unavailable",
        "a 0 \xD7 0 panel has no cut perimeter \u2014 it silently prices as $0"
      );
    }
  }
  if (type === "lettering") {
    if (cncPositiveNumber(rawItem?.letter_height) === null) {
      add(
        "letter_height",
        "cnc_dimension_unavailable",
        "record a positive, finite letter height (inches) \u2014 a blank or zero height silently prices the letters as $0"
      );
    }
    if (cncPositiveNumber(rawItem?.num_letters) === null) {
      add(
        "num_letters",
        "cnc_dimension_unavailable",
        "record a positive, finite letter count \u2014 a blank or zero count silently prices the letters as $0"
      );
    }
  }
  if (cutLeg && cncPositiveNumber(rawItem?.cut_speed_ipm) === null) {
    add(
      "cut_speed_ipm",
      "cnc_cut_speed_unavailable",
      "record a positive, finite cut speed (in/min) \u2014 a blank or zero speed silently drops cut pricing"
    );
  }
  const carveArea = cncStrictNumber(rawItem?.carve_area_sqin);
  if (type === "3d_carving") {
    if (cncPositiveNumber(rawItem?.carve_area_sqin) === null) {
      add(
        "carve_area_sqin",
        "cnc_dimension_unavailable",
        "record a positive, finite carve area (in\xB2) \u2014 a blank or zero area silently prices the carving as $0"
      );
    }
    if (cncPositiveNumber(rawItem?.carve_speed_sqipm) === null) {
      add(
        "carve_speed_sqipm",
        "cnc_carve_speed_unavailable",
        "record a positive, finite carve speed (in\xB2/min) \u2014 a blank or zero speed silently drops carve pricing"
      );
    }
  } else {
    if (recorded(rawItem?.carve_area_sqin) && (carveArea === null || carveArea < 0)) {
      add(
        "carve_area_sqin",
        "cnc_dimension_unavailable",
        "the stored carve area is malformed or negative \u2014 it is silently ignored; fix it or clear it"
      );
    }
    if (carveArea !== null && carveArea > 0 && cncPositiveNumber(rawItem?.carve_speed_sqipm) === null) {
      add(
        "carve_speed_sqipm",
        "cnc_carve_speed_unavailable",
        "a stored carve area is priced only with a positive, finite carve speed \u2014 the stored speed silently drops it"
      );
    }
  }
  return issues;
}
function cncProjectInputIssues(project = {}) {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("cnc", { field, code, message, hold: "project" }));
  if (project?.items !== void 0 && !Array.isArray(project.items)) {
    add(
      "items",
      "cnc_items_unavailable",
      "the stored CNC items are malformed \u2014 the project cannot be repriced"
    );
  }
  for (const [field, human] of [
    ["machine_rate_per_hour", "machine rate ($/hr)"],
    ["labor_rate", "labor rate ($/hr)"],
    ["setup_time_percentage", "setup time percentage (%)"],
    ["fixed_setup_hours", "fixed setup hours"]
  ]) {
    if (cncNonNegativeNumber(project?.[field]) === null) {
      add(
        field,
        "cnc_project_rate_unavailable",
        `record a finite, nonnegative ${human} \u2014 fix the project value or the CNC Settings value it was seeded from; the stored value cannot price this estimate`
      );
    }
  }
  return issues;
}
var num2 = (v) => cncStrictNumber(v) ?? 0;
var settingOr = (settings, key, dflt) => cncSettingRecorded(settings, key) ? cncSettingNumber(settings, key) ?? 0 : dflt;
function computeCncItemPricing(item = {}, project = {}, settings = {}) {
  const letterPerimFactor = settingOr(settings, "cnc_letter_perimeter_factor", 3.5);
  let cutLength = 0;
  if (item?.item_type === "panel") {
    cutLength = (num2(item.length) + num2(item.width)) * 2;
  } else if (item?.item_type === "lettering") {
    cutLength = num2(item.letter_height) * letterPerimFactor * num2(item.num_letters);
  }
  const materialCutMultiplierKey = `${String(item?.material_type ?? "").toLowerCase()}_cnc_cut_multiplier`;
  const cutMultiplier = settingOr(settings, materialCutMultiplierKey, 1);
  const cutSpeed = num2(item?.cut_speed_ipm);
  const carveArea = num2(item?.carve_area_sqin);
  const carveSpeed = num2(item?.carve_speed_sqipm);
  const qty = item?.item_type === "lettering" ? 1 : num2(item?.quantity);
  const cutTimeMinutes = cutLength > 0 && cutSpeed > 0 ? cutLength / cutSpeed * cutMultiplier : 0;
  const carveTimeMinutes = carveArea > 0 && carveSpeed > 0 ? carveArea / carveSpeed : 0;
  const machineTimeHours = (cutTimeMinutes + carveTimeMinutes) * qty / 60;
  const setupTimeHours = machineTimeHours * (num2(project?.setup_time_percentage) / 100);
  return {
    machine_time_hours: machineTimeHours,
    setup_time_hours: setupTimeHours,
    machine_cost: machineTimeHours * num2(project?.machine_rate_per_hour),
    labor_cost: setupTimeHours * num2(project?.labor_rate)
  };
}
function computeCncTotals(derivedItems = [], project = {}, settings = {}) {
  const laborRate = num2(project?.labor_rate);
  const totalMachineCost = derivedItems.reduce((sum, item) => sum + num2(item.machine_cost), 0);
  const dynamicLaborFromItems = derivedItems.reduce((sum, item) => sum + num2(item.labor_cost), 0);
  const totalSetupHours = derivedItems.reduce((sum, item) => sum + num2(item.setup_time_hours), 0);
  const fixedSetupCost = num2(project?.fixed_setup_hours) * laborRate;
  const minLaborHours = settingOr(settings, "min_cnc_labor_hours", 0);
  const effectiveDynamicLabor = totalSetupHours > 0 && totalSetupHours < minLaborHours ? minLaborHours * laborRate : dynamicLaborFromItems;
  const minimumDynamicLaborAdjustment = effectiveDynamicLabor - dynamicLaborFromItems;
  const totalLaborCost = fixedSetupCost + effectiveDynamicLabor;
  return {
    totalMachine: totalMachineCost,
    totalLabor: totalLaborCost,
    totalSetupHours,
    dynamicLaborFromItems,
    fixedSetupCost,
    minLaborHours,
    minimumDynamicLaborAdjustment
  };
}
var ITEM_HELD_FIELDS = ["machine_time_hours", "setup_time_hours", "machine_cost", "labor_cost"];
var NULL_TOTALS = {
  totalMachine: null,
  totalLabor: null,
  totalSetupHours: null,
  dynamicLaborFromItems: null,
  fixedSetupCost: null,
  minLaborHours: null,
  minimumDynamicLaborAdjustment: null
};
function calcCncPricing(project = {}, settings = {}) {
  const issues = [
    ...cncSettingIssues(settings),
    ...(Array.isArray(project?.items) ? project.items : []).flatMap((item, index) => cncItemIssues(item, index)),
    ...cncProjectInputIssues(project)
  ];
  const held = issues.length > 0;
  const rawItems = Array.isArray(project?.items) ? project.items : [];
  const hasProjectHold = issues.some((i) => i.hold === "project");
  const itemHolds = new Set(issues.filter((i) => i.hold === "item").map((i) => i.itemIndex));
  const items = rawItems.map((item, index) => {
    if (hasProjectHold || itemHolds.has(index)) {
      const heldItem = { ...item };
      for (const field of ITEM_HELD_FIELDS) heldItem[field] = null;
      return heldItem;
    }
    return { ...item, ...computeCncItemPricing(item, project, settings) };
  });
  const totals = held ? { ...NULL_TOTALS } : computeCncTotals(items, project, settings);
  return {
    items,
    totals,
    issues,
    held,
    __held: held,
    pricingUnavailable: held
  };
}
var issuesForField = (issues = [], field, itemIndex = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
var hasIssueFor = (issues = [], field, itemIndex = null) => issuesForField(issues, field, itemIndex).length > 0;

// frozen:/app/src/pages/CNCEstimator.jsx
import { Fragment, jsx as jsx12, jsxs as jsxs2 } from "react/jsx-runtime";
var imperialSizes = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8", "1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4"];
var materials = ["Acrylic", "Wood", "MDF", "Plywood", "PVC", "HDPE", "Aluminum", "Corian"];
var MATERIAL_THICKNESS_PRESETS = {
  Acrylic: ["1/8", "1/4", "3/8", "1/2"],
  Wood: ["1/2", "3/4", "1", "1-1/2"],
  MDF: ["1/4", "1/2", "3/4", "1"],
  Plywood: ["1/4", "1/2", "3/4", "1"],
  PVC: ["1/4", "1/2", "3/4", "1"],
  HDPE: ["1/4", "1/2", "3/4", "1"],
  Aluminum: ["1/16", "1/8", "3/16", "1/4"],
  Corian: ["1/4", "1/2", "3/4"]
};
var escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var moneyCell = (v) => hasCncCostSnapshot(v) ? `$${v.toFixed(2)}` : /* @__PURE__ */ jsx12("span", { className: "text-amber-700 font-medium", children: "Not saved" });
var heldMoney = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var heldNum = (v, digits = 1, suffix = "") => Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : "\u2014";
function CNCEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [isEditing, setIsEditing] = useState(false);
  const [project, setProject] = useState({
    project_name: "",
    client_name: "",
    items: [],
    machine_rate_per_hour: 75,
    labor_rate: 45,
    setup_time_percentage: 20,
    // New field
    fixed_setup_hours: 0,
    // New field
    notes: ""
  });
  const [globalSettings, setGlobalSettings] = useState({});
  const [estimateContext, setEstimateContext] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState("project");
  const persistedProjectIdRef = useRef(editId || "");
  const createAttemptRef = useRef({ signature: "", key: "" });
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const [templateMode, setTemplateMode] = useState(null);
  useEffect(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
    copyAttemptRef.current = { signature: "", key: "" };
    loadPrerequisites();
  }, [editId, estimateId]);
  const loadPrerequisites = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [settingsData, existing, estimate] = await Promise.all([
        loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" }),
        editId ? CNCProject.get(editId) : Promise.resolve(null),
        estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
      ]);
      const settingsObj = {};
      (settingsData || []).forEach((s) => {
        settingsObj[s.setting_name] = s.setting_value;
      });
      setGlobalSettings(settingsObj);
      setEstimateContext(estimate || null);
      const strictSeed = (key, dflt) => cncSettingRecorded(settingsObj, key) ? cncSettingNumber(settingsObj, key) : dflt;
      const sourceDefaults = {
        machine_rate_per_hour: strictSeed("cnc_machine_rate", 75),
        labor_rate: strictSeed("cnc_labor_rate", 45),
        setup_time_percentage: strictSeed("cnc_setup_time_percentage", 20),
        fixed_setup_hours: strictSeed("min_cnc_setup_hours", 0),
        notes: settingsObj.default_notes_template || ""
      };
      if (existing) {
        setProject((prev) => ({
          ...prev,
          ...sourceDefaults,
          ...existing,
          client_name: estimate?.client_name || existing.client_name || prev.client_name,
          customer_id: estimate?.customer_id || existing.customer_id,
          estimate_number: estimate?.estimate_number || existing.estimate_number,
          items: seedBuilderItemIds(existing.items || []),
          machine_rate_per_hour: existing.machine_rate_per_hour ?? sourceDefaults.machine_rate_per_hour,
          labor_rate: existing.labor_rate ?? sourceDefaults.labor_rate,
          setup_time_percentage: existing.setup_time_percentage ?? sourceDefaults.setup_time_percentage,
          fixed_setup_hours: existing.fixed_setup_hours ?? sourceDefaults.fixed_setup_hours
        }));
        setIsEditing(true);
      } else {
        setProject((prev) => ({
          ...prev,
          ...sourceDefaults,
          client_name: estimate?.client_name || prev.client_name,
          customer_id: estimate?.customer_id,
          estimate_number: estimate?.estimate_number
        }));
      }
    } catch (error) {
      console.error("Error loading prerequisites:", error);
      setLoadError(error?.message || "CNC Builder prerequisites could not be verified.");
    }
    setIsLoading(false);
  };
  const addItem = () => {
    setTimeout(() => document.querySelector(`input[data-item-desc="${(project.items || []).length}"]`)?.focus(), 60);
    setProject((prev) => ({
      ...prev,
      items: [...prev.items, {
        builder_item_id: newBuilderItemId("cnc-item"),
        item_type: "panel",
        description: "",
        material_type: "Wood",
        material_thickness: "3/4",
        quantity: 1,
        length: 0,
        width: 0,
        letter_height: 0,
        num_letters: 0,
        carve_area_sqin: 0,
        carve_depth: 0.125,
        cut_speed_ipm: 50,
        carve_speed_sqipm: 10,
        machine_time_hours: 0,
        setup_time_hours: 0,
        machine_cost: 0,
        labor_cost: 0,
        force_enhanced: false,
        cutter_diameter_in: 0,
        smallest_detail_in: 0,
        workholding_method: "",
        creates_loose_pieces: false
      }]
    }));
  };
  const removeItem = (index) => {
    if (!window.confirm("Remove this item?")) return;
    setProject((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };
  const updateItem = (index, field, value) => {
    setProject((prev) => {
      const newItems = [...prev.items];
      let item = { ...newItems[index], [field]: value };
      if (field === "item_type" && value === "lettering") {
        item.quantity = 1;
      }
      if (item.item_type === "lettering") {
        item.quantity = 1;
      }
      if (field === "material_thickness") {
        const speedSettingKey = `cnc_cut_speed_${value.replace("/", "_").replace("-", "_")}`;
        item.cut_speed_ipm = cncSettingRecorded(globalSettings, speedSettingKey) ? cncSettingNumber(globalSettings, speedSettingKey) : 50;
      }
      const letterPerimFactor = parseFloat(globalSettings.cnc_letter_perimeter_factor) || 3.5;
      let cutLength = 0;
      if (item.item_type === "panel") {
        cutLength = (item.length + item.width) * 2;
      } else if (item.item_type === "lettering") {
        cutLength = item.letter_height * letterPerimFactor * item.num_letters;
      }
      const materialCutMultiplierKey = `${item.material_type.toLowerCase()}_cnc_cut_multiplier`;
      const cutMultiplier = parseFloat(globalSettings[materialCutMultiplierKey]) || 1;
      const cutTimeMinutes = cutLength > 0 && item.cut_speed_ipm > 0 ? cutLength / item.cut_speed_ipm * cutMultiplier : 0;
      const carveTimeMinutes = item.carve_area_sqin > 0 && item.carve_speed_sqipm > 0 ? item.carve_area_sqin / item.carve_speed_sqipm : 0;
      const machineTimeHours = (cutTimeMinutes + carveTimeMinutes) * item.quantity / 60;
      item.machine_time_hours = machineTimeHours;
      const setupTimePercentage = prev.setup_time_percentage;
      const setupTimeHours = machineTimeHours * (setupTimePercentage / 100);
      item.setup_time_hours = setupTimeHours;
      item.machine_cost = machineTimeHours * prev.machine_rate_per_hour;
      item.labor_cost = setupTimeHours * prev.labor_rate;
      newItems[index] = { ...item };
      return { ...prev, items: newItems };
    });
  };
  const priced = useMemo(() => calcCncPricing(project, globalSettings), [project, globalSettings]);
  const pricedItems = priced.items;
  const allIssues = priced.issues;
  const catalogBlocked = allIssues.some((i) => i.kind === "cnc_catalog");
  const pricingBlocked = allIssues.length > 0;
  const pricingUnavailable = priced.held;
  const itemIssues = (index) => allIssues.filter((i) => i.itemIndex === index);
  const calculateTotals = () => priced.totals;
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
      setSaveError(catalogBlocked ? "Save paused: a CNC Settings value is missing or unusable \u2014 update it in CNC Settings, then save." : "Save paused: fix the flagged pricing values before saving \u2014 unavailable pricing is never written as $0.");
      return;
    }
    if (!project.project_name || !(estimateContext?.client_name || project.client_name)) {
      alert("Please fill in project name and client name");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      const totals = calculateTotals();
      const totalCost2 = totals.totalMachine + totals.totalLabor;
      const pricingProject = {
        ...project,
        // Persist the derived-fresh item costs so the acknowledged snapshot is
        // always current pricing (reprice-on-save; never a stale snapshot).
        items: pricedItems,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        total_machine_cost: totals.totalMachine,
        total_labor_cost: totals.totalLabor
      };
      const customerPricing = await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizeCNCProject,
        tierNumber: project.customer_pricing?.tier_number
      });
      const finalProject = {
        ...pricingProject,
        customer_pricing: customerPricing || project.customer_pricing,
        total_cost: totalCost2,
        status: "calculated"
      };
      let saved;
      const activeProjectId = persistedProjectIdRef.current || editId || "";
      if (activeProjectId) {
        saved = await updateBuilderSourceProject({
          entity: CNCProject,
          sourceId: activeProjectId,
          expectedUpdatedAt: project.updated_date,
          data: finalProject,
          estimateId,
          label: "CNC project"
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(finalProject);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("cnc_project")
          };
        }
        saved = await ensureIdempotentEntityCreate({
          entity: CNCProject,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: finalProject,
          label: "CNC project"
        });
        if (!saved?.id) throw new Error("CNC project create could not be verified.");
        persistedProjectIdRef.current = saved.id;
        setIsEditing(true);
      }
      const savedId = saved?.id || activeProjectId;
      if (estimateId && savedId) {
        const refreshed = await CNCProject.get(savedId).catch(() => ({ ...finalProject, id: savedId }));
        await recordBuilderSave({
          estimateId,
          line: { project_id: savedId, module_key: "cnc" },
          sourceProject: {
            ...refreshed,
            builder_calculation: {
              totals: {
                total_machine_cost: totals.totalMachine,
                total_labor_cost: totals.totalLabor,
                total_setup_hours: totals.totalSetupHours,
                dynamic_labor_from_items: totals.dynamicLaborFromItems,
                fixed_setup_cost: totals.fixedSetupCost,
                min_labor_hours: totals.minLaborHours,
                minimum_dynamic_labor_adjustment: totals.minimumDynamicLaborAdjustment,
                total_cost: totalCost2
              }
            }
          },
          liveTotal: totalCost2
        });
      }
      setProject((prev) => ({
        ...prev,
        ...finalProject,
        id: savedId || prev.id,
        updated_date: saved?.updated_date || prev.updated_date
      }));
      onSaved?.();
      if (!embedded) navigate("/Estimator");
    } catch (error) {
      console.error("Error saving project:", error);
      alert("Error saving project. Please try again.");
    }
    setIsSaving(false);
  };
  const handleSaveAsCopy = async () => {
    if (pricingBlocked) {
      setSaveError("Save paused: fix the flagged pricing values before saving a copy \u2014 unavailable pricing is never written as $0.");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      const totals = calculateTotals();
      const copy = await saveModuleProjectCopy({
        entity: CNCProject,
        payload: {
          ...project,
          items: pricedItems,
          client_name: estimateContext?.client_name || project.client_name,
          customer_id: estimateContext?.customer_id || project.customer_id,
          estimate_number: estimateContext?.estimate_number || project.estimate_number,
          total_machine_cost: totals.totalMachine,
          total_labor_cost: totals.totalLabor,
          total_cost: totals.totalMachine + totals.totalLabor,
          status: "calculated"
        },
        attemptRef: copyAttemptRef,
        keyPrefix: "cnc_project_copy",
        baseName: project.project_name || "CNC",
        label: "CNC project copy"
      });
      if (embedded) onSaved?.();
      else navigate(`/CNCEstimator?edit=${copy.id}`);
    } catch (e) {
      console.error(e);
      alert("Save copy failed: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };
  const buildCncTemplateData = (p) => ({
    items: p.items || [],
    machine_rate_per_hour: p.machine_rate_per_hour,
    labor_rate: p.labor_rate,
    setup_time_percentage: p.setup_time_percentage,
    fixed_setup_hours: p.fixed_setup_hours,
    notes: p.notes
  });
  const downloadEstimate = () => {
    if (pricingBlocked) {
      setSaveError("Fix the flagged pricing values before downloading \u2014 unavailable pricing is never exported as $0.");
      return;
    }
    const { totalMachine: totalMachine2, totalLabor: totalLabor2 } = calculateTotals();
    const totalCost2 = totalMachine2 + totalLabor2;
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>CNC Estimate - ${escHtml(project.project_name)}</title>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 40px;
      color: #1e293b;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      border-bottom: 3px solid #10b981;
      display: inline-block;
    }
    
    .item {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
    }
    
    .item-header {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      border-color: #10b981;
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    }
    
    .cost-box.labor {
      border-color: #3b82f6;
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
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
    
    .summary-row.machine .summary-value { color: #10b981; }
    .summary-row.labor .summary-value { color: #3b82f6; }
    
    .total-row {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 3px solid #10b981;
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
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      <h1>\xF0\u0178\u201D\xA7 CNC Routing Estimate</h1>
      <div class="subtitle">Precision Machining Services</div>
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
          <span class="info-label">Date:</span>
          <span class="info-value">${(/* @__PURE__ */ new Date()).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
    
    <div class="content">
      <div class="section-title">Items Breakdown</div>
      
      ${pricedItems.map((item, i) => `
        <div class="item">
          <div class="item-header">
            Item ${i + 1}: ${escHtml(item.description || "CNC item")}
          </div>
          
          <div class="item-details">
            <div class="detail-row">
              <span class="detail-label">Material:</span>
              <span class="detail-value">${escHtml(item.material_type)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Dimensions:</span>
              <span class="detail-value">${escHtml(item.length)}" \xC3\u2014 ${escHtml(item.width)}" \xC3\u2014 ${escHtml(item.material_thickness)}"</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Job Type:</span>
              <span class="detail-value">${escHtml(item.item_type)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Quantity:</span>
              <span class="detail-value">${escHtml(item.quantity)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Machine Time:</span>
              <span class="detail-value">${item.machine_time_hours.toFixed(2)} hrs</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Labor Time:</span>
              <span class="detail-value">${item.setup_time_hours.toFixed(2)} hrs</span>
            </div>
          </div>
          
          <div class="item-costs">
            <div class="cost-box machine">
              <div class="cost-label">Machine Cost</div>
              <div class="cost-value">$${item.machine_cost.toFixed(2)}</div>
            </div>
            <div class="cost-box labor">
              <div class="cost-label">Labor Cost</div>
              <div class="cost-value">$${item.labor_cost.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `).join("")}
      
      <div class="summary">
        <div class="section-title" style="border-color: #10b981;">Cost Summary</div>
        
        <div class="summary-row machine">
          <span class="summary-label">Total Machine Cost:</span>
          <span class="summary-value">$${totalMachine2.toFixed(2)}</span>
        </div>
        <div class="summary-row labor">
          <span class="summary-label">Total Labor Cost:</span>
          <span class="summary-value">$${totalLabor2.toFixed(2)}</span>
        </div>
        
        <div class="total-row">
          <span class="total-label">Total Estimate</span>
          <span class="total-value">$${totalCost2.toFixed(2)}</span>
        </div>
      </div>
      
      ${project.notes ? `
        <div class="notes">
          <h3>\xF0\u0178\u201C\uFFFD Additional Notes</h3>
          <p>${escHtml(project.notes)}</p>
        </div>
      ` : ""}
    </div>
    
    <div class="footer">
      Generated by SignEstimate Pro - Professional Estimating Suite<br>
      \xC2\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} All Rights Reserved
    </div>
  </div>
</body>
</html>
    `;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.project_name.replace(/\s+/g, "_")}_CNC_Estimate.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const printEstimate = () => {
    if (pricingBlocked) {
      setSaveError("Fix the flagged pricing values before printing \u2014 unavailable pricing is never exported as $0.");
      return;
    }
    const { totalMachine: totalMachine2, totalLabor: totalLabor2 } = calculateTotals();
    const totalCost2 = totalMachine2 + totalLabor2;
    const printContent = `
      <html>
        <head>
          <title>CNC Estimate - ${escHtml(project.project_name)}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 0;
              padding: 40px;
              color: #1e293b;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
              border-bottom: 3px solid #10b981;
              display: inline-block;
            }
            
            .item {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              border: 2px solid #e2e8f0;
              border-radius: 12px;
              padding: 25px;
              margin-bottom: 20px;
            }
            
            .item-header {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
              border-color: #10b981;
              background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
            }
            
            .cost-box.labor {
              border-color: #3b82f6;
              background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
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
            
            .summary-row.machine .summary-value { color: #10b981; }
            .summary-row.labor .summary-value { color: #3b82f6; }
            
            .total-row {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 3px solid #10b981;
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
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
              <h1>\xF0\u0178\u201D\xA7 CNC Routing Estimate</h1>
              <div class="subtitle">Precision Machining Services</div>
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
                  <span class="info-label">Date:</span>
                  <span class="info-value">${(/* @__PURE__ */ new Date()).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            <div class="content">
              <div class="section-title">Items Breakdown</div>
              
              ${pricedItems.map((item, i) => `
                <div class="item">
                  <div class="item-header">
                    Item ${i + 1}: ${escHtml(item.description || "CNC item")}
                  </div>
                  
                  <div class="item-details">
                    <div class="detail-row">
                      <span class="detail-label">Material:</span>
                      <span class="detail-value">${escHtml(item.material_type)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Dimensions:</span>
                      <span class="detail-value">${escHtml(item.length)}" \xC3\u2014 ${escHtml(item.width)}" \xC3\u2014 ${escHtml(item.material_thickness)}"</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Job Type:</span>
                      <span class="detail-value">${escHtml(item.item_type)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Quantity:</span>
                      <span class="detail-value">${escHtml(item.quantity)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Machine Time:</span>
                      <span class="detail-value">${item.machine_time_hours.toFixed(2)} hrs</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Labor Time:</span>
                      <span class="detail-value">${item.setup_time_hours.toFixed(2)} hrs</span>
                    </div>
                  </div>
                  
                  <div class="item-costs">
                    <div class="cost-box machine">
                      <div class="cost-label">Machine Cost</div>
                      <div class="cost-value">$${item.machine_cost.toFixed(2)}</div>
                    </div>
                    <div class="cost-box labor">
                      <div class="cost-label">Labor Cost</div>
                      <div class="cost-value">$${item.labor_cost.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              `).join("")}
              
              <div class="summary">
                <div class="section-title" style="border-color: #10b981;">Cost Summary</div>
                
                <div class="summary-row machine">
                  <span class="summary-label">Total Machine Cost:</span>
                  <span class="summary-value">$${totalMachine2.toFixed(2)}</span>
                </div>
                <div class="summary-row labor">
                  <span class="summary-label">Total Labor Cost:</span>
                  <span class="summary-value">$${totalLabor2.toFixed(2)}</span>
                </div>
                
                <div class="total-row">
                  <span class="total-label">Total Estimate</span>
                  <span class="total-value">$${totalCost2.toFixed(2)}</span>
                </div>
              </div>
              
              ${project.notes ? `
                <div class="notes">
                  <h3>\xF0\u0178\u201C\uFFFD Additional Notes</h3>
                  <p>${escHtml(project.notes)}</p>
                </div>
              ` : ""}
            </div>
            
            <div class="footer">
              Generated by SignEstimate Pro - Professional Estimating Suite<br>
              \xC2\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} All Rights Reserved
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
  const { totalMachine, totalLabor } = calculateTotals();
  const totalCost = Number.isFinite(totalMachine) && Number.isFinite(totalLabor) ? totalMachine + totalLabor : null;
  if (isLoading) return /* @__PURE__ */ jsx12("div", { className: "p-8", children: "Loading..." });
  if (loadError) return /* @__PURE__ */ jsx12("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: /* @__PURE__ */ jsxs2("div", { className: "max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800", children: [
    /* @__PURE__ */ jsx12("div", { className: "font-bold", children: "CNC Builder unavailable" }),
    /* @__PURE__ */ jsx12("div", { className: "mt-1 text-sm", children: "Required Settings, project data, or estimate context could not be verified. Hard-coded fallback rates were not used." }),
    /* @__PURE__ */ jsx12("div", { className: "mt-2 text-xs break-words", children: loadError }),
    /* @__PURE__ */ jsxs2(Button, { variant: "outline", className: "mt-4", onClick: () => embedded ? onClose?.() : navigate(estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator"), children: [
      /* @__PURE__ */ jsx12(ArrowLeft, { className: "w-4 h-4 mr-2" }),
      " Back"
    ] })
  ] }) });
  return /* @__PURE__ */ jsxs2("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: [
    /* @__PURE__ */ jsxs2("div", { className: "max-w-5xl mx-auto", children: [
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-4 mb-8", children: [
        embedded ? /* @__PURE__ */ jsx12(Button, { variant: "outline", size: "icon", onClick: onClose, title: "Back to products", children: /* @__PURE__ */ jsx12(ArrowLeft, { className: "w-4 h-4" }) }) : /* @__PURE__ */ jsx12(Link, { to: estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator", children: /* @__PURE__ */ jsx12(Button, { variant: "outline", size: "icon", children: /* @__PURE__ */ jsx12(ArrowLeft, { className: "w-4 h-4" }) }) }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsxs2("h1", { className: "text-3xl font-bold text-slate-900 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx12(Router, { className: "w-6 h-6" }),
            isEditing ? "Edit" : "New",
            " CNC Estimate"
          ] }),
          /* @__PURE__ */ jsx12("p", { className: "text-slate-600", children: "Estimate costs for CNC routing and carving jobs" })
        ] })
      ] }),
      allIssues.length > 0 && /* @__PURE__ */ jsxs2(
        "div",
        {
          role: "status",
          id: "cnc-pricing-issues",
          className: "mb-4 flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-300 rounded px-3 py-2",
          children: [
            /* @__PURE__ */ jsx12(AlertTriangle, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" }),
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
                allIssues.slice(0, 5).map((it, i) => /* @__PURE__ */ jsx12("li", { children: it.message }, i)),
                allIssues.length > 5 && /* @__PURE__ */ jsxs2("li", { children: [
                  "\u2026and ",
                  allIssues.length - 5,
                  " more"
                ] })
              ] })
            ] })
          ]
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "grid lg:grid-cols-3 gap-8", children: [
        /* @__PURE__ */ jsx12("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs2(Tabs, { value: activeTab, onValueChange: setActiveTab, className: "w-full", children: [
          /* @__PURE__ */ jsx12("div", { className: "sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60", children: /* @__PURE__ */ jsxs2(TabsList, { className: "grid grid-cols-4 w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1", children: [
            /* @__PURE__ */ jsx12(TabBadgeTrigger, { value: "project", icon: FileText, label: "Project", color: "green" }),
            /* @__PURE__ */ jsx12(TabBadgeTrigger, { value: "items", icon: ListChecks, label: "Items", amount: totalCost, count: project.items.length, color: "green" }),
            /* @__PURE__ */ jsx12(TabBadgeTrigger, { value: "summary", icon: Calculator, label: "Summary", amount: totalCost, color: "green" }),
            /* @__PURE__ */ jsx12(TabBadgeTrigger, { value: "pricing", icon: TrendingUp, label: "Customer Pricing", accent: true, color: "green" })
          ] }) }),
          /* @__PURE__ */ jsx12(TabsContent, { value: "project", className: "mt-4 space-y-6", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx12(CardHeader, { children: /* @__PURE__ */ jsx12(CardTitle, { children: "Project Information" }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-4", children: [
              /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 gap-4", children: [
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx12(Label, { children: "Project Name *" }),
                  /* @__PURE__ */ jsx12(Input, { value: project.project_name, onChange: (e) => setProject((p) => ({ ...p, project_name: e.target.value })) })
                ] }),
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx12(Label, { children: "Client Name *" }),
                  /* @__PURE__ */ jsx12(
                    Input,
                    {
                      value: estimateContext?.client_name || project.client_name || "",
                      readOnly: embedded,
                      onChange: (e) => !embedded && setProject((p) => ({ ...p, client_name: e.target.value }))
                    }
                  ),
                  embedded && /* @__PURE__ */ jsx12("p", { className: "text-[10px] text-slate-400 mt-1", children: "Inherited from the All-In-One estimate." })
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 gap-4", children: [
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx12(Label, { children: "Fixed Setup Time (hours)" }),
                  /* @__PURE__ */ jsx12(
                    Input,
                    {
                      type: "number",
                      min: "0",
                      value: project.fixed_setup_hours ?? "",
                      onFocus: (e) => e.target.select(),
                      onChange: (e) => setProject((p) => ({ ...p, fixed_setup_hours: cncDraftValue(e.target.value) })),
                      "aria-invalid": hasIssueFor(allIssues, "fixed_setup_hours") || void 0,
                      "aria-describedby": hasIssueFor(allIssues, "fixed_setup_hours") ? "cnc-pricing-issues" : void 0
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx12(Label, { children: "Setup Time Percentage (%)" }),
                  /* @__PURE__ */ jsx12(
                    Input,
                    {
                      type: "number",
                      min: "0",
                      max: "100",
                      value: project.setup_time_percentage ?? "",
                      onFocus: (e) => e.target.select(),
                      onChange: (e) => setProject((p) => ({ ...p, setup_time_percentage: cncDraftValue(e.target.value) })),
                      "aria-invalid": hasIssueFor(allIssues, "setup_time_percentage") || void 0,
                      "aria-describedby": hasIssueFor(allIssues, "setup_time_percentage") ? "cnc-pricing-issues" : void 0
                    }
                  ),
                  /* @__PURE__ */ jsx12("p", { className: "text-xs text-slate-500 mt-1", children: "Percentage of machine time added as labor setup time per item." })
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx12(Label, { children: "Notes" }),
                /* @__PURE__ */ jsx12(Textarea, { value: project.notes, onChange: (e) => setProject((p) => ({ ...p, notes: e.target.value })) })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx12(TabsContent, { value: "items", className: "mt-4 space-y-6", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx12(CardHeader, { children: /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center", children: [
              /* @__PURE__ */ jsx12(CardTitle, { children: "Project Items" }),
              /* @__PURE__ */ jsxs2(Button, { onClick: addItem, size: "sm", children: [
                /* @__PURE__ */ jsx12(Plus, { className: "w-4 h-4 mr-2" }),
                "Add Item"
              ] })
            ] }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-6", children: [
              project.items.length === 0 && /* @__PURE__ */ jsx12("div", { className: "text-center py-8 text-slate-500", children: /* @__PURE__ */ jsx12("p", { children: 'No items added yet. Click "Add Item" to get started.' }) }),
              project.items.map((item, index) => {
                const pricedItem = pricedItems[index] || item;
                const rowIssues = itemIssues(index);
                const rowIssuesId = `cnc-item-${index}-issues`;
                const fieldFlag = (field) => hasIssueFor(allIssues, field, index) || void 0;
                const fieldDesc = (field) => hasIssueFor(allIssues, field, index) ? rowIssuesId : void 0;
                return /* @__PURE__ */ jsxs2("div", { className: "p-6 border rounded-xl bg-slate-25", children: [
                  /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-start mb-4", children: [
                    /* @__PURE__ */ jsxs2("h4", { className: "font-medium", children: [
                      "Item ",
                      index + 1
                    ] }),
                    /* @__PURE__ */ jsx12(Button, { variant: "ghost", size: "icon", onClick: () => removeItem(index), className: "text-red-500", children: /* @__PURE__ */ jsx12(Trash2, { className: "w-4 h-4" }) })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 lg:grid-cols-3 gap-4", children: [
                    /* @__PURE__ */ jsxs2("div", { className: "md:col-span-3", children: [
                      /* @__PURE__ */ jsx12(Label, { children: "Description" }),
                      /* @__PURE__ */ jsx12(Input, { "data-item-desc": index, value: item.description, onChange: (e) => updateItem(index, "description", e.target.value) })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12(Label, { children: "Job Type" }),
                      /* @__PURE__ */ jsxs2(Select, { value: item.item_type, onValueChange: (v) => updateItem(index, "item_type", v), children: [
                        /* @__PURE__ */ jsx12(SelectTrigger, { "aria-invalid": fieldFlag("item_type"), "aria-describedby": fieldDesc("item_type"), children: /* @__PURE__ */ jsx12(SelectValue, {}) }),
                        /* @__PURE__ */ jsxs2(SelectContent, { children: [
                          /* @__PURE__ */ jsx12(SelectItem, { value: "panel", children: "Panel Cut" }),
                          /* @__PURE__ */ jsx12(SelectItem, { value: "lettering", children: "Lettering Cut" }),
                          /* @__PURE__ */ jsx12(SelectItem, { value: "3d_carving", children: "3D Carving" })
                        ] })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12(Label, { children: "Material Type" }),
                      /* @__PURE__ */ jsxs2(Select, { value: item.material_type, onValueChange: (v) => updateItem(index, "material_type", v), children: [
                        /* @__PURE__ */ jsx12(SelectTrigger, { "aria-invalid": fieldFlag("material_type"), "aria-describedby": fieldDesc("material_type"), children: /* @__PURE__ */ jsx12(SelectValue, {}) }),
                        /* @__PURE__ */ jsx12(SelectContent, { children: materials.map((mat) => /* @__PURE__ */ jsx12(SelectItem, { value: mat, children: mat }, mat)) })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12(Label, { children: "Material Thickness" }),
                      /* @__PURE__ */ jsxs2(Select, { value: item.material_thickness, onValueChange: (v) => updateItem(index, "material_thickness", v), children: [
                        /* @__PURE__ */ jsx12(SelectTrigger, { children: /* @__PURE__ */ jsx12(SelectValue, {}) }),
                        /* @__PURE__ */ jsx12(SelectContent, { children: imperialSizes.map((size) => /* @__PURE__ */ jsxs2(SelectItem, { value: size, children: [
                          size,
                          '"'
                        ] }, size)) })
                      ] }),
                      /* @__PURE__ */ jsx12("div", { className: "flex flex-wrap gap-1 mt-1", children: (MATERIAL_THICKNESS_PRESETS[item.material_type] || ["1/4", "1/2", "3/4"]).map((t) => /* @__PURE__ */ jsxs2("button", { type: "button", onClick: () => updateItem(index, "material_thickness", t), className: `px-1.5 h-[20px] rounded border text-[10px] ${item.material_thickness === t ? "border-red-400 bg-red-50 text-red-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`, children: [
                        t,
                        '"'
                      ] }, t)) })
                    ] }),
                    item.item_type !== "lettering" && /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12(Label, { children: "Quantity" }),
                      /* @__PURE__ */ jsx12(Input, { type: "number", min: "1", value: item.quantity ?? "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "quantity", cncDraftValue(e.target.value)), "aria-invalid": fieldFlag("quantity"), "aria-describedby": fieldDesc("quantity") })
                    ] }),
                    item.item_type === "panel" && /* @__PURE__ */ jsxs2(Fragment, { children: [
                      /* @__PURE__ */ jsxs2("div", { children: [
                        /* @__PURE__ */ jsx12(Label, { children: "Length (in)" }),
                        /* @__PURE__ */ jsx12(Input, { type: "number", min: "0", value: item.length ?? "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "length", cncDraftValue(e.target.value)), "aria-invalid": fieldFlag("length"), "aria-describedby": fieldDesc("length") })
                      ] }),
                      /* @__PURE__ */ jsxs2("div", { children: [
                        /* @__PURE__ */ jsx12(Label, { children: "Height (in)" }),
                        /* @__PURE__ */ jsx12(Input, { type: "number", min: "0", value: item.width ?? "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "width", cncDraftValue(e.target.value)), "aria-invalid": fieldFlag("width"), "aria-describedby": fieldDesc("width") })
                      ] })
                    ] }),
                    item.item_type === "lettering" && /* @__PURE__ */ jsxs2(Fragment, { children: [
                      /* @__PURE__ */ jsxs2("div", { children: [
                        /* @__PURE__ */ jsx12(Label, { children: "Letter Height (in)" }),
                        /* @__PURE__ */ jsx12(Input, { type: "number", min: "0", value: item.letter_height ?? "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "letter_height", cncDraftValue(e.target.value)), "aria-invalid": fieldFlag("letter_height"), "aria-describedby": fieldDesc("letter_height") })
                      ] }),
                      /* @__PURE__ */ jsxs2("div", { children: [
                        /* @__PURE__ */ jsx12(Label, { children: "Number of Letters" }),
                        /* @__PURE__ */ jsx12(Input, { type: "number", min: "0", value: item.num_letters ?? "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "num_letters", cncDraftValue(e.target.value)), "aria-invalid": fieldFlag("num_letters"), "aria-describedby": fieldDesc("num_letters") })
                      ] })
                    ] }),
                    item.item_type === "3d_carving" && /* @__PURE__ */ jsxs2(Fragment, { children: [
                      /* @__PURE__ */ jsxs2("div", { children: [
                        /* @__PURE__ */ jsx12(Label, { children: "Carve Area (in\xC2\xB2)" }),
                        /* @__PURE__ */ jsx12(Input, { type: "number", min: "0", value: item.carve_area_sqin ?? "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "carve_area_sqin", cncDraftValue(e.target.value)), "aria-invalid": fieldFlag("carve_area_sqin"), "aria-describedby": fieldDesc("carve_area_sqin") })
                      ] }),
                      /* @__PURE__ */ jsxs2("div", { children: [
                        /* @__PURE__ */ jsx12(Label, { children: "Carve Depth (in)" }),
                        /* @__PURE__ */ jsx12(Input, { type: "number", min: "0", step: "0.125", value: item.carve_depth || "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "carve_depth", parseFloat(e.target.value) || 0) })
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { className: "mt-4 pt-4 border-t grid md:grid-cols-2 gap-4", children: [
                    item.item_type !== "3d_carving" && /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12(Label, { children: "Cut Speed (in/min)" }),
                      /* @__PURE__ */ jsx12(Input, { type: "number", min: "0", value: item.cut_speed_ipm ?? "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "cut_speed_ipm", cncDraftValue(e.target.value)), placeholder: "Auto-calculated", "aria-invalid": fieldFlag("cut_speed_ipm"), "aria-describedby": fieldDesc("cut_speed_ipm") }),
                      /* @__PURE__ */ jsx12("p", { className: "text-xs text-slate-500 mt-1", children: "Auto-set by thickness, can be overridden." })
                    ] }),
                    item.item_type === "3d_carving" && /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12(Label, { children: "Carve Speed (in\xC2\xB2/min)" }),
                      /* @__PURE__ */ jsx12(Input, { type: "number", min: "0", value: item.carve_speed_sqipm ?? "", onFocus: (e) => e.target.select(), onChange: (e) => updateItem(index, "carve_speed_sqipm", cncDraftValue(e.target.value)), "aria-invalid": fieldFlag("carve_speed_sqipm"), "aria-describedby": fieldDesc("carve_speed_sqipm") })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx12(
                    HoldDownAdvisor_default,
                    {
                      item,
                      onUpdate: (field, value) => updateItem(index, field, value),
                      letterPerimFactor: parseFloat(globalSettings.cnc_letter_perimeter_factor) || 3.5
                    }
                  ),
                  rowIssues.length > 0 && /* @__PURE__ */ jsxs2(
                    "div",
                    {
                      role: "status",
                      id: rowIssuesId,
                      className: "mt-3 flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1",
                      children: [
                        /* @__PURE__ */ jsx12(AlertTriangle, { className: "w-3 h-3 mt-0.5 flex-shrink-0" }),
                        /* @__PURE__ */ jsx12("div", { className: "space-y-0.5", children: rowIssues.map((it, i) => /* @__PURE__ */ jsx12("div", { children: it.message }, i)) })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx12("div", { className: "mt-4 p-4 bg-white rounded-lg border", children: /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4 text-sm", children: [
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12("span", { className: "text-slate-500", children: "Machine Time:" }),
                      /* @__PURE__ */ jsx12("p", { className: "font-medium", children: heldNum(pricedItem.machine_time_hours, 1, " hrs") })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12("span", { className: "text-slate-500", children: "Machine Cost:" }),
                      /* @__PURE__ */ jsx12("p", { className: "font-medium", children: heldMoney(pricedItem.machine_cost) })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12("span", { className: "text-slate-500", children: "Setup Time:" }),
                      /* @__PURE__ */ jsx12("p", { className: "font-medium", children: heldNum(pricedItem.setup_time_hours, 1, " hrs") })
                    ] }),
                    /* @__PURE__ */ jsxs2("div", { children: [
                      /* @__PURE__ */ jsx12("span", { className: "text-slate-500", children: "Labor Cost:" }),
                      /* @__PURE__ */ jsx12("p", { className: "font-semibold", children: heldMoney(pricedItem.labor_cost) })
                    ] })
                  ] }) })
                ] }, index);
              })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx12(TabsContent, { value: "summary", className: "mt-4 space-y-6", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx12(CardHeader, { children: /* @__PURE__ */ jsx12(CardTitle, { children: "Estimate Breakdown" }) }),
            /* @__PURE__ */ jsx12(CardContent, { className: "p-0", children: /* @__PURE__ */ jsxs2("table", { className: "w-full text-sm", children: [
              /* @__PURE__ */ jsx12("thead", { className: "bg-slate-50 text-slate-600 text-xs", children: /* @__PURE__ */ jsxs2("tr", { children: [
                /* @__PURE__ */ jsx12("th", { className: "text-left px-4 py-2 font-medium w-8", children: "#" }),
                /* @__PURE__ */ jsx12("th", { className: "text-left px-4 py-2 font-medium", children: "Description" }),
                /* @__PURE__ */ jsx12("th", { className: "text-left px-4 py-2 font-medium", children: "Material" }),
                /* @__PURE__ */ jsx12("th", { className: "text-right px-4 py-2 font-medium", children: "Machine" }),
                /* @__PURE__ */ jsx12("th", { className: "text-right px-4 py-2 font-medium", children: "Labor" }),
                /* @__PURE__ */ jsx12("th", { className: "text-right px-4 py-2 font-medium", children: "Total" })
              ] }) }),
              /* @__PURE__ */ jsx12("tbody", { children: pricedItems.map((it, i) => /* @__PURE__ */ jsxs2("tr", { className: "border-t border-slate-100", children: [
                /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 text-slate-500", children: i + 1 }),
                /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 font-medium", children: it.description || `Item ${i + 1}` }),
                /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 text-xs text-slate-600", children: it.material_type }),
                /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 text-right tabular-nums", children: heldMoney(it.machine_cost) }),
                /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 text-right tabular-nums", children: heldMoney(it.labor_cost) }),
                /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 text-right tabular-nums font-semibold", children: Number.isFinite(it.machine_cost) && Number.isFinite(it.labor_cost) ? `$${(it.machine_cost + it.labor_cost).toFixed(2)}` : "\u2014" })
              ] }, i)) }),
              /* @__PURE__ */ jsxs2("tfoot", { className: "bg-slate-50 border-t-2 border-slate-200 text-sm", children: [
                pricingUnavailable && /* @__PURE__ */ jsx12("tr", { children: /* @__PURE__ */ jsx12("td", { colSpan: "6", className: "px-4 py-1.5 text-[11px] text-amber-800", children: "Saved amounts (not current pricing) \u2014 fix the flagged values to reprice." }) }),
                /* @__PURE__ */ jsxs2("tr", { children: [
                  /* @__PURE__ */ jsx12("td", { colSpan: "3", className: "px-4 py-2 text-right font-medium", children: "Totals" }),
                  /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 text-right tabular-nums font-medium", children: moneyCell(Number.isFinite(totalMachine) ? totalMachine : project.total_machine_cost) }),
                  /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 text-right tabular-nums font-medium", children: moneyCell(Number.isFinite(totalLabor) ? totalLabor : project.total_labor_cost) }),
                  /* @__PURE__ */ jsx12("td", { className: "px-4 py-2 text-right tabular-nums font-bold", children: moneyCell(totalCost ?? project.total_cost) })
                ] })
              ] })
            ] }) })
          ] }) }),
          /* @__PURE__ */ jsx12(TabsContent, { value: "pricing", className: "mt-4 space-y-6", children: /* @__PURE__ */ jsx12(
            CustomerPricingTab_default,
            {
              project: { ...project, items: pricedItems, total_machine_cost: Number.isFinite(totalMachine) ? totalMachine : project.total_machine_cost ?? null, total_labor_cost: Number.isFinite(totalLabor) ? totalLabor : project.total_labor_cost ?? null },
              categorize: categorizeCNCProject,
              accentColor: "green",
              onTierChange: (tier) => setProject((prev) => ({
                ...prev,
                customer_pricing: { ...prev.customer_pricing || {}, tier_number: tier }
              }))
            }
          ) })
        ] }) }),
        /* @__PURE__ */ jsxs2("div", { className: "space-y-6", children: [
          /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm sticky top-8", children: [
            /* @__PURE__ */ jsx12(CardHeader, { children: /* @__PURE__ */ jsx12(CardTitle, { children: "Cost Summary" }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-4", children: [
              pricingUnavailable && /* @__PURE__ */ jsx12("p", { className: "text-[11px] text-amber-800", children: "Saved amounts (not current pricing) \u2014 fix the flagged values to reprice." }),
              /* @__PURE__ */ jsx12("div", { className: "p-4 bg-green-50 rounded-lg", children: /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center", children: [
                /* @__PURE__ */ jsx12("span", { className: "font-medium text-green-800", children: "Total Machine Cost:" }),
                /* @__PURE__ */ jsx12("span", { className: "font-bold text-lg text-green-900", children: moneyCell(Number.isFinite(totalMachine) ? totalMachine : project.total_machine_cost) })
              ] }) }),
              /* @__PURE__ */ jsx12("div", { className: "p-4 bg-blue-50 rounded-lg", children: /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center", children: [
                /* @__PURE__ */ jsx12("span", { className: "font-medium text-blue-800", children: "Total Labor Cost:" }),
                /* @__PURE__ */ jsx12("span", { className: "font-bold text-lg text-blue-900", children: moneyCell(Number.isFinite(totalLabor) ? totalLabor : project.total_labor_cost) })
              ] }) }),
              /* @__PURE__ */ jsx12("div", { className: "mt-4 pt-4 border-t", children: /* @__PURE__ */ jsx12("p", { className: "text-xs text-slate-500 text-center", children: "Using the migrated SignEstimate Pro CNC rates and calculation settings." }) })
            ] })
          ] }),
          project?.updated_date && /* @__PURE__ */ jsxs2("div", { className: "mt-1 text-[10px] text-gray-400", children: [
            "Last saved ",
            new Date(project.updated_date).toLocaleString()
          ] }),
          saveError && /* @__PURE__ */ jsx12("div", { role: "alert", className: "px-3 py-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded", children: saveError }),
          /* @__PURE__ */ jsx12(Button, { onClick: saveProject, disabled: isSaving || !project.project_name || !(estimateContext?.client_name || project.client_name), className: "w-full bg-green-600 hover:bg-green-700", children: isSaving ? "Saving..." : /* @__PURE__ */ jsxs2(Fragment, { children: [
            /* @__PURE__ */ jsx12(Save, { className: "w-4 h-4 mr-2" }),
            "Save Estimate"
          ] }) }),
          /* @__PURE__ */ jsx12("div", { className: "flex flex-wrap gap-2", children: /* @__PURE__ */ jsx12(
            ModuleActionBar_default,
            {
              onTemplates: () => setTemplateMode("load"),
              onSaveAsTemplate: () => setTemplateMode("save"),
              onSaveAsCopy: handleSaveAsCopy,
              estimateId,
              saving: isSaving
            }
          ) }),
          /* @__PURE__ */ jsx12(Button, { onClick: downloadEstimate, variant: "outline", className: "w-full", children: "Download Estimate (HTML)" }),
          /* @__PURE__ */ jsx12(Button, { onClick: printEstimate, variant: "outline", className: "w-full", children: "Print Estimate" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx12(
      ModuleTemplateDialog_default,
      {
        open: !!templateMode,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => setProject((prev) => ({ ...prev, ...data })),
        moduleKey: "cnc",
        title: "CNC",
        buildTemplateData: buildCncTemplateData,
        describeTemplate: (t) => `${(t.project_data?.items || []).length} items`
      }
    )
  ] });
}
export {
  CNCEstimator as Page
};
