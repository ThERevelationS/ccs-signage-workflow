// frozen:/app/src/pages/BrickStoneEstimator.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

// s:s://@/components/ui/button
import { jsx } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx("button", { type: "button", ...p, children: p.children });

// s:s://@/components/ui/input
import { jsx as jsx2 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx2("input", { ...p });

// s:s://lucide-react
var AlertTriangle = () => null;
var ArrowLeft = () => null;
var Save = () => null;

// frozen:/app/src/components/estimator/brick/BrickGeometryPanel.jsx
import React from "react";

// frozen:/app/src/components/estimator/brick/brickCalc.js
var num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
function calcBrickStoneProject(project, material) {
  const gap = num(project.mortar_gap, 0.375);
  const layers = Math.max(1, num(project.layers, 1));
  const courses = num(project.courses_high, 0);
  const alongLength = num(project.bricks_along_length, 0);
  const alongWidth = num(project.bricks_along_width, 0);
  const waste = num(project.waste_factor, 1.1);
  const b = {
    length: num(material?.length),
    width: num(material?.width),
    height: num(material?.height)
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
  const material_cost = calculated_bricks * num(material?.cost_per_unit);
  const mortar_cost = mortar_bags_needed * num(project.mortar_bag_cost, 12);
  const labor_hours = calculated_bricks / Math.max(1, num(project.bricks_per_hour, 40));
  const labor_cost = labor_hours * num(project.labor_rate_per_hour, 55);
  const subtotal = material_cost + mortar_cost + labor_cost;
  const markup_amount = subtotal * num(project.markup_percent) / 100;
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

// frozen:/app/src/components/estimator/brick/brickPricingAvailability.js
var brickNumber = (v) => {
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
var brickNonNegativeNumber = (v) => {
  const n = brickNumber(v);
  return n !== null && n >= 0 ? n : null;
};
var brickPositiveNumber = (v) => {
  const n = brickNumber(v);
  return n !== null && n > 0 ? n : null;
};
var brickRecorded = (v) => v !== void 0 && v !== null;
var hasBrickCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var brickDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};
var issue = (kind, { index = null, itemIndex = null, inventoryId = null, field, code, message, hold = "project" }) => ({
  kind,
  index,
  itemIndex,
  inventoryId,
  field,
  code,
  message,
  hold
});
var brickMaterialIssues = (project = {}, material = null) => {
  const issues = [];
  const add = (field, code, message, inventoryId = null) => issues.push(issue("brick_catalog", { inventoryId, field, code, message, hold: "project" }));
  const selectedId = project?.selected_material_id;
  if (!selectedId) {
    add(
      "selected_material_id",
      "brick_material_unavailable",
      "select a brick or stone material \u2014 a wall priced without one silently bills $0 material"
    );
    return issues;
  }
  if (!material) {
    add(
      "selected_material_id",
      "brick_material_unavailable",
      "the selected material record is no longer available \u2014 reselect the brick or stone material",
      selectedId
    );
    return issues;
  }
  const label = material.material_name || "the selected material";
  for (const [field, human] of [
    ["length", "unit length (inches)"],
    ["width", "unit width (inches)"],
    ["height", "unit height (inches)"]
  ]) {
    if (brickPositiveNumber(material[field]) === null) {
      add(
        field,
        "brick_material_dimension_unavailable",
        `Material "${label}": record a positive, finite ${human} in the masonry catalog \u2014 a missing dimension silently prices as 0"`,
        material.id ?? null
      );
    }
  }
  if (brickNonNegativeNumber(material.cost_per_unit) === null) {
    add(
      "cost_per_unit",
      "brick_material_price_unavailable",
      `Material "${label}": record a finite, nonnegative cost per unit \u2014 a missing price is not free`,
      material.id ?? null
    );
  }
  return issues;
};
var brickProjectInputIssues = (project = {}) => {
  const issues = [];
  const add = (field, code, message) => issues.push(issue("brick", { field, code, message, hold: "project" }));
  for (const [field, human] of [
    ["bricks_along_length", "brick count along the length"],
    ["bricks_along_width", "brick count along the width"]
  ]) {
    if (!brickRecorded(project?.[field])) {
      add(
        field,
        "brick_dimension_unavailable",
        `record the ${human} \u2014 the displayed hint is not stored, so an unset value silently prices as 0 (record 0 for a flat side)`
      );
      continue;
    }
    const n = brickNumber(project[field]);
    if (n === null || n < 0) {
      add(
        field,
        "brick_dimension_unavailable",
        `record a finite, nonnegative ${human} \u2014 the stored value cannot price the wall`
      );
    }
  }
  const alongLength = brickNumber(project?.bricks_along_length);
  const alongWidth = brickNumber(project?.bricks_along_width);
  if (alongLength !== null && alongWidth !== null && alongLength >= 0 && alongWidth >= 0 && alongLength + alongWidth <= 0) {
    add(
      "bricks_along_length",
      "brick_wall_extent_unavailable",
      "record bricks along the length or the width \u2014 a wall with no extent cannot be priced"
    );
  }
  if (!brickRecorded(project?.courses_high)) {
    add(
      "courses_high",
      "brick_courses_unavailable",
      "record the courses high \u2014 the displayed hint is not stored, so an unset value silently prices no wall"
    );
  } else if (brickPositiveNumber(project.courses_high) === null) {
    add(
      "courses_high",
      "brick_courses_unavailable",
      "record a positive, finite courses high \u2014 a zero or malformed count prices no wall"
    );
  }
  if (brickRecorded(project?.layers)) {
    const n = brickNumber(project.layers);
    if (n === null || n < 1) {
      add(
        "layers",
        "brick_layers_unavailable",
        "record a layer count of 1 or more \u2014 a lower or malformed value silently prices as 1 layer"
      );
    }
  }
  if (brickRecorded(project?.mortar_gap) && brickNonNegativeNumber(project.mortar_gap) === null) {
    add(
      "mortar_gap",
      "brick_mortar_gap_unavailable",
      "record a finite, nonnegative mortar gap in inches \u2014 the stored value cannot price mortar joints"
    );
  }
  if (brickRecorded(project?.waste_factor) && brickPositiveNumber(project.waste_factor) === null) {
    add(
      "waste_factor",
      "brick_waste_factor_unavailable",
      "record a positive, finite waste factor (1.0 = exact count) \u2014 a zero or negative factor silently prices $0 materials"
    );
  }
  if (brickRecorded(project?.mortar_bag_cost) && brickNonNegativeNumber(project.mortar_bag_cost) === null) {
    add(
      "mortar_bag_cost",
      "brick_mortar_cost_unavailable",
      "record a finite, nonnegative mortar bag cost \u2014 the stored value cannot price mortar"
    );
  }
  if (brickRecorded(project?.bricks_per_hour)) {
    const n = brickNumber(project.bricks_per_hour);
    if (n === null || n < 1) {
      add(
        "bricks_per_hour",
        "brick_lay_rate_unavailable",
        "record a laying rate of 1 brick/hour or more \u2014 a lower or malformed rate silently reprices labor at 1/hr"
      );
    }
  }
  if (brickRecorded(project?.labor_rate_per_hour) && brickNonNegativeNumber(project.labor_rate_per_hour) === null) {
    add(
      "labor_rate_per_hour",
      "brick_labor_rate_unavailable",
      "record a finite, nonnegative mason labor rate per hour \u2014 the stored value cannot price labor"
    );
  }
  if (brickRecorded(project?.markup_percent) && brickNonNegativeNumber(project.markup_percent) === null) {
    add(
      "markup_percent",
      "brick_markup_unavailable",
      "record a finite, nonnegative markup % or clear it \u2014 the stored value cannot price markup"
    );
  }
  return issues;
};
var calcBrickStoneAvailability = (project = {}, material = null) => {
  const issues = [
    ...brickMaterialIssues(project, material),
    ...brickProjectInputIssues(project)
  ];
  const calc = calcBrickStoneProject(project, material);
  if (!issues.length) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held: false };
  }
  const out = { ...calc };
  for (const field of Object.keys(out)) {
    if (typeof out[field] === "number") out[field] = null;
  }
  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held: true };
};
var issuesForField = (issues = [], field, itemIndex = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
var hasIssueFor = (issues = [], field, itemIndex = null) => issuesForField(issues, field, itemIndex).length > 0;

// frozen:/app/src/components/estimator/brick/BrickGeometryPanel.jsx
import { jsx as jsx3, jsxs } from "react/jsx-runtime";
var selectCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
var dimText = (v) => Number.isFinite(v) ? v.toFixed(1) : "\u2014";
var countText = (v) => Number.isFinite(v) ? String(v) : "\u2014";
var FIELDS = [
  { key: "bricks_along_length", label: "Bricks along length", def: 6 },
  { key: "bricks_along_width", label: "Bricks along width", def: 9 },
  { key: "courses_high", label: "Courses high", def: 5 },
  { key: "layers", label: "Layers (depth)", def: 1 },
  { key: "mortar_gap", label: "Mortar gap (in)", def: 0.375, step: "0.0625" },
  { key: "waste_factor", label: "Waste factor", def: 1.1, step: "0.01" }
];
function BrickGeometryPanel({ project, materials, derived, issues = [], onChange }) {
  const material = materials.find((m) => m.id === project.selected_material_id);
  React.useEffect(() => {
    if (project.selected_material_id) return;
    try {
      const last = localStorage.getItem("estimator:last_material:brick_stone");
      const m = materials.find((x) => x.id === last);
      if (m) onChange({ selected_material_id: m.id, material_name: m.material_name || "", material_dimensions: { length: m.length, width: m.width, height: m.height } });
    } catch {
    }
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-4 space-y-3", children: [
    /* @__PURE__ */ jsx3("h2", { className: "font-semibold text-gray-900", children: "Masonry Base" }),
    /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 block", children: [
      "Brick / stone",
      /* @__PURE__ */ jsxs(
        "select",
        {
          value: project.selected_material_id || "",
          onChange: (e) => {
            try {
              localStorage.setItem("estimator:last_material:brick_stone", e.target.value);
            } catch {
            }
            const m = materials.find((x) => x.id === e.target.value);
            onChange({
              selected_material_id: e.target.value,
              material_name: m?.material_name || "",
              material_dimensions: m ? { length: m.length, width: m.width, height: m.height } : void 0
            });
          },
          className: selectCls,
          "aria-invalid": hasIssueFor(issues, "selected_material_id") || void 0,
          "aria-describedby": hasIssueFor(issues, "selected_material_id") ? "brick-pricing-issues" : void 0,
          children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "\u2014 select material \u2014" }),
            materials.map((m) => /* @__PURE__ */ jsxs("option", { value: m.id, children: [
              m.material_name,
              " \u2014 ",
              m.length,
              "\xD7",
              m.width,
              "\xD7",
              m.height,
              '" \xB7 $',
              Number(m.cost_per_unit || 0).toFixed(2)
            ] }, m.id))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-3", children: FIELDS.map((f) => /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
      f.label,
      /* @__PURE__ */ jsx3(
        Input,
        {
          type: "number",
          step: f.step,
          value: project[f.key] ?? f.def,
          onChange: (e) => onChange({ [f.key]: brickDraftValue(e.target.value) }),
          "aria-invalid": hasIssueFor(issues, f.key) || void 0,
          "aria-describedby": hasIssueFor(issues, f.key) ? "brick-pricing-issues" : void 0
        }
      )
    ] }, f.key)) }),
    material ? /* @__PURE__ */ jsxs("div", { className: "text-xs text-gray-500 border-t border-gray-100 pt-2 space-y-1", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        "Derived footprint: ",
        dimText(derived?.derived_length),
        '" \xD7',
        " ",
        dimText(derived?.derived_width),
        '" \xD7 ',
        dimText(derived?.derived_height),
        '" high'
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        countText(derived?.bricks_per_course),
        " per course \xB7 ",
        countText(derived?.calculated_bricks),
        " total (with waste) \xB7",
        " ",
        dimText(derived?.calculated_surface_area),
        " sq ft face"
      ] })
    ] }) : /* @__PURE__ */ jsx3("p", { className: "text-xs text-amber-600 border-t border-gray-100 pt-2", children: "Select a brick or stone to calculate quantities." })
  ] });
}

// frozen:/app/src/components/estimator/brick/BrickTotals.jsx
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
var money = (n) => `$${Number(n || 0).toFixed(2)}`;
var RATES = [
  { key: "mortar_bag_cost", label: "Mortar bag $", def: 12 },
  { key: "bricks_per_hour", label: "Bricks laid /hr", def: 40 },
  { key: "labor_rate_per_hour", label: "Mason $/hr", def: 55 },
  { key: "markup_percent", label: "Markup %", def: 0 }
];
var moneyOrSaved = (live, saved) => hasBrickCostSnapshot(live) ? money(live) : hasBrickCostSnapshot(saved) ? money(saved) : /* @__PURE__ */ jsx4("span", { className: "text-amber-700 font-medium", children: "Not saved" });
var countOrSaved = (live, saved, digits = null) => Number.isFinite(live) ? digits === null ? String(live) : live.toFixed(digits) : Number.isFinite(saved) ? digits === null ? String(saved) : saved.toFixed(digits) : "\u2014";
function BrickTotals({ project, totals, issues = [], onChange }) {
  const pricingUnavailable = !!totals?.pricingUnavailable;
  return /* @__PURE__ */ jsxs2("div", { className: "space-y-4 sticky top-4", children: [
    /* @__PURE__ */ jsxs2("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [
      /* @__PURE__ */ jsx4("h3", { className: "font-semibold text-gray-900 text-sm mb-3", children: "Rates" }),
      /* @__PURE__ */ jsx4("div", { className: "grid grid-cols-2 gap-3", children: RATES.map((f) => /* @__PURE__ */ jsxs2("label", { className: "text-xs text-gray-500", children: [
        f.label,
        /* @__PURE__ */ jsx4(
          Input,
          {
            type: "number",
            value: project[f.key] ?? f.def,
            onChange: (e) => onChange({ [f.key]: brickDraftValue(e.target.value) }),
            "aria-invalid": hasIssueFor(issues, f.key) || void 0,
            "aria-describedby": hasIssueFor(issues, f.key) ? "brick-pricing-issues" : void 0
          }
        )
      ] }, f.key)) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "bg-white rounded-xl border border-red-200 p-4", children: [
      /* @__PURE__ */ jsx4("h3", { className: "font-semibold text-gray-900 mb-3", children: "Section Total" }),
      pricingUnavailable && /* @__PURE__ */ jsx4("p", { className: "text-[11px] text-amber-800 mb-2", children: "Saved amounts (not current pricing) \u2014 fix the flagged values to reprice." }),
      /* @__PURE__ */ jsxs2("div", { className: "space-y-1.5 text-sm", children: [
        /* @__PURE__ */ jsxs2("div", { className: "flex justify-between text-xs text-gray-400", children: [
          /* @__PURE__ */ jsx4("span", { children: "Bricks / stones" }),
          /* @__PURE__ */ jsx4("span", { children: countOrSaved(totals?.calculated_bricks, project?.calculated_bricks) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "flex justify-between text-xs text-gray-400", children: [
          /* @__PURE__ */ jsx4("span", { children: "Mortar bags" }),
          /* @__PURE__ */ jsx4("span", { children: countOrSaved(totals?.mortar_bags_needed, project?.mortar_bags_needed) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "flex justify-between text-xs text-gray-400", children: [
          /* @__PURE__ */ jsx4("span", { children: "Labor hours" }),
          /* @__PURE__ */ jsx4("span", { children: countOrSaved(totals?.labor_hours, project?.labor_hours, 2) })
        ] }),
        [
          ["Material", totals?.material_cost, project?.material_cost],
          ["Mortar", totals?.mortar_cost, project?.mortar_cost],
          ["Labor", totals?.labor_cost, project?.labor_cost]
        ].map(([label, live, saved]) => /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-gray-500", children: label }),
          /* @__PURE__ */ jsx4("span", { className: "text-gray-900", children: moneyOrSaved(live, saved) })
        ] }, label)),
        /* @__PURE__ */ jsxs2("div", { className: "flex justify-between border-t border-gray-100 pt-2", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-gray-500", children: "Subtotal" }),
          /* @__PURE__ */ jsx4("span", { className: "text-gray-900", children: moneyOrSaved(totals?.subtotal, project?.subtotal) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-gray-500", children: "Markup" }),
          /* @__PURE__ */ jsx4("span", { className: "text-gray-900", children: moneyOrSaved(totals?.markup_amount, project?.markup_amount) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "flex justify-between border-t border-red-200 pt-2 mt-2 font-bold text-lg", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-gray-900", children: "Total" }),
          /* @__PURE__ */ jsx4("span", { className: "text-red-600", children: moneyOrSaved(totals?.total_cost, project?.total_cost) })
        ] })
      ] })
    ] })
  ] });
}

// s:s://@/components/estimator/builder/builderService
var recordBuilderSave = async (a) => {
  globalThis.__spies.push(["recordBuilderSave", a]);
  return { ok: true };
};

// s:s://@/components/estimator/loadAllEntityRows
async function loadAllEntityRows(a) {
  globalThis.__catalogReads.push(a.label);
  if (a.entity === globalThis.__entLegacyInv) return globalThis.__legacyRows || [];
  if (a.entity === globalThis.__entFoundationInv) return globalThis.__foundationRows || [];
  return [];
}

// s:s://@/components/estimator/builder/sourceProjectPersistence
var updateBuilderSourceProject = async (a) => {
  globalThis.__spies.push(["saveSource", a]);
  return { ...a.data, id: a.sourceId, updated_date: "v2" };
};

// s:s://@/components/estimator/moduleShared/ModuleActionBar
import { jsx as jsx5 } from "react/jsx-runtime";
var ModuleActionBar_default = (p) => /* @__PURE__ */ jsx5("button", { type: "button", "data-stub": "copy", onClick: p.onSaveAsCopy, children: "copy" });

// s:s://@/components/estimator/moduleShared/ModuleTemplateDialog
var ModuleTemplateDialog_default = () => null;

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var saveModuleProjectCopy = async (a) => {
  globalThis.__spies.push(["saveCopy", a]);
  return { id: "copy-1" };
};

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx6 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx6("div", { "data-stub": "CustomerPricingTab" });

// frozen:/app/src/components/markup/projectCategorizer.jsx
var num2 = (v) => Number(v) || 0;
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
function _impl_categorizeBrickStoneProject(p) {
  if (!p) return [];
  const lines = [];
  const materials = num2(p.material_cost) + num2(p.mortar_cost);
  if (materials > 0) lines.push({ module: "brick_stone", label: "Brick / Stone / Mortar Materials", cost: materials, category_key: "outsourced_fab" });
  const labor = num2(p.labor_cost);
  if (labor > 0) lines.push({ module: "brick_stone", label: "Masonry Labor", cost: labor, category_key: "outsourced_services" });
  return lines;
}
var categorizeBrickStoneProject = (p) => _catMemo(p, _impl_categorizeBrickStoneProject);

// s:s://@/components/markup/savedCustomerPricing
async function calculateSavedCustomerPricing(a) {
  globalThis.__spies.push(["pricing", a]);
  return null;
}

// s:s://@/components/staff/staffEntities
var staffEntities = {
  BrickStoneProject: {
    get: async (id) => {
      globalThis.__spies.push(["projectGet", id]);
      return globalThis.__project ?? null;
    }
  },
  BrickStoneInventory: globalThis.__entLegacyInv ||= { __ent: "brickStoneInventory" },
  FoundationInventory: globalThis.__entFoundationInv ||= { __ent: "foundationInventory" }
};

// frozen:/app/src/pages/BrickStoneEstimator.jsx
import { jsx as jsx7, jsxs as jsxs3 } from "react/jsx-runtime";
function BrickStoneEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const params = new URLSearchParams(window.location.search);
  const id = embeddedProjectId || params.get("id") || params.get("edit");
  const estimateId = embeddedEstimateId || params.get("estimateId");
  const [project, setProject] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [templateMode, setTemplateMode] = useState(null);
  const saveRef = useRef(null);
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const navigate = useNavigate();
  useEffect(() => {
    copyAttemptRef.current = { signature: "", key: "" };
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [p, legacyMats, foundationMats] = await Promise.all([
          id ? staffEntities.BrickStoneProject.get(id) : Promise.resolve(null),
          // Legacy entity is optional compatibility data; the modern Foundation
          // inventory below is the authoritative masonry catalog and is strict.
          loadAllEntityRows({ entity: staffEntities.BrickStoneInventory, sort: "material_name", label: "Legacy Brick & Stone inventory" }).catch(() => []),
          loadAllEntityRows({ entity: staffEntities.FoundationInventory, sort: "material_name", label: "Foundation masonry inventory" })
        ]);
        const modernMats = (foundationMats || []).filter(
          (row) => row.show_in_foundation !== false && (row.material_type === "brick_stone" || row.material_type === "wall_material" && ["brick", "stone", "cinderblock"].includes(row.wall_material_subtype))
        ).map((row) => ({
          ...row,
          length: row.material_type === "brick_stone" ? row.brick_length_inches : row.wall_unit_length_inches,
          width: row.material_type === "brick_stone" ? row.brick_width_inches : row.wall_unit_width_inches,
          height: row.material_type === "brick_stone" ? row.brick_height_inches : row.wall_unit_height_inches,
          _inventory_entity: "FoundationInventory"
        }));
        const legacyNormalized = (legacyMats || []).map((row) => ({
          ...row,
          _inventory_entity: "BrickStoneInventory"
        }));
        setProject(p);
        setMaterials([...modernMats, ...legacyNormalized]);
      } catch (error) {
        console.error("Brick & Stone prerequisites could not be loaded:", error);
        setLoadError(error?.message || "Brick & Stone Builder prerequisites could not be verified.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);
  const material = useMemo(
    () => materials.find((m) => m.id === project?.selected_material_id),
    [materials, project]
  );
  const priced = useMemo(
    () => project ? calcBrickStoneAvailability(project, material) : null,
    [project, material]
  );
  const totals = priced?.calc || null;
  const allIssues = priced?.issues || [];
  const catalogBlocked = allIssues.some((i) => i.kind === "brick_catalog");
  const pricingBlocked = allIssues.length > 0;
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
    if (!saving) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  if (loading) return /* @__PURE__ */ jsx7("div", { className: "p-10 text-center text-gray-400", children: "Loading section\u2026" });
  if (loadError) return /* @__PURE__ */ jsxs3("div", { className: "p-10 text-center text-red-700 bg-red-50 border border-red-200 rounded", children: [
    "Brick & Stone Builder unavailable. Required project data or the primary masonry catalog could not be verified. ",
    loadError
  ] });
  if (!project) return /* @__PURE__ */ jsx7("div", { className: "p-10 text-center text-gray-500", children: "Section not found." });
  const patch = (changes) => setProject((prev) => ({ ...prev, ...changes }));
  const handleSave = async () => {
    if (pricingBlocked) {
      window.alert(catalogBlocked ? "Save paused: the selected material record is missing or unusable \u2014 fix it in the masonry catalog, then save." : "Save paused: fix the flagged pricing values before saving \u2014 unavailable pricing is never written as $0.");
      return;
    }
    if (!(Number(totals?.calculated_surface_area) > 0)) {
      window.alert("Wall area must be greater than zero before this section can be saved. Check the wall dimensions and material selection.");
      return;
    }
    setSaving(true);
    try {
      const pricingProject = {
        ...project,
        material_cost: totals.material_cost,
        mortar_cost: totals.mortar_cost,
        labor_cost: totals.labor_cost,
        subtotal: totals.subtotal
      };
      const customerPricing = project.customer_pricing?.applied === true ? await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizeBrickStoneProject,
        tierNumber: project.customer_pricing?.tier_number
      }) : project.customer_pricing;
      const dataToSave = {
        project_name: project.project_name,
        notes: project.notes,
        status: "calculated",
        selected_material_id: project.selected_material_id,
        material_name: project.material_name,
        material_dimensions: project.material_dimensions,
        bricks_along_length: project.bricks_along_length,
        bricks_along_width: project.bricks_along_width,
        courses_high: project.courses_high,
        layers: project.layers,
        mortar_gap: project.mortar_gap,
        waste_factor: project.waste_factor,
        mortar_bag_cost: project.mortar_bag_cost,
        bricks_per_hour: project.bricks_per_hour,
        labor_rate_per_hour: project.labor_rate_per_hour,
        markup_percent: project.markup_percent,
        base_length: totals.derived_length,
        base_width: totals.derived_width,
        base_height: totals.derived_height,
        calculated_bricks: totals.calculated_bricks,
        calculated_surface_area: totals.calculated_surface_area,
        mortar_bags_needed: totals.mortar_bags_needed,
        material_cost: totals.material_cost,
        mortar_cost: totals.mortar_cost,
        labor_hours: totals.labor_hours,
        labor_cost: totals.labor_cost,
        subtotal: totals.subtotal,
        markup_amount: totals.markup_amount,
        total_cost: totals.total_cost,
        customer_pricing: customerPricing
      };
      const savedProject = await updateBuilderSourceProject({
        entity: staffEntities.BrickStoneProject,
        sourceId: project.id,
        expectedUpdatedAt: project.updated_date,
        data: dataToSave,
        estimateId,
        label: "Brick & Stone project"
      });
      if (savedProject?.updated_date) {
        setProject((prev) => ({ ...prev, updated_date: savedProject.updated_date }));
      }
      if (estimateId) {
        await recordBuilderSave({
          estimateId,
          line: { project_id: project.id, module_key: "brick_stone" },
          sourceProject: savedProject,
          liveTotal: totals.total_cost
        });
      }
      onSaved?.();
    } catch (e) {
      console.error(e);
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  saveRef.current = handleSave;
  const handleSaveAsCopy = async () => {
    if (pricingBlocked) {
      window.alert(catalogBlocked ? "Save paused: the selected material record is missing or unusable \u2014 fix it in the masonry catalog, then save a copy." : "Save paused: fix the flagged pricing values before saving a copy \u2014 unavailable pricing is never written as $0.");
      return;
    }
    if (!(Number(totals?.calculated_surface_area) > 0)) {
      window.alert("Wall area must be greater than zero before this section can be copied. Check the wall dimensions and material selection.");
      return;
    }
    setSaving(true);
    try {
      const copy = await saveModuleProjectCopy({
        entity: staffEntities.BrickStoneProject,
        payload: {
          project_name: project.project_name,
          client_name: project.client_name,
          customer_id: project.customer_id,
          estimate_number: project.estimate_number,
          hyperlink: project.hyperlink,
          notes: project.notes,
          status: "calculated",
          selected_material_id: project.selected_material_id,
          material_name: project.material_name,
          material_dimensions: project.material_dimensions,
          bricks_along_length: project.bricks_along_length,
          bricks_along_width: project.bricks_along_width,
          courses_high: project.courses_high,
          layers: project.layers,
          mortar_gap: project.mortar_gap,
          waste_factor: project.waste_factor,
          mortar_bag_cost: project.mortar_bag_cost,
          bricks_per_hour: project.bricks_per_hour,
          labor_rate_per_hour: project.labor_rate_per_hour,
          markup_percent: project.markup_percent,
          base_length: totals.derived_length,
          base_width: totals.derived_width,
          base_height: totals.derived_height,
          calculated_bricks: totals.calculated_bricks,
          calculated_surface_area: totals.calculated_surface_area,
          mortar_bags_needed: totals.mortar_bags_needed,
          material_cost: totals.material_cost,
          mortar_cost: totals.mortar_cost,
          labor_hours: totals.labor_hours,
          labor_cost: totals.labor_cost,
          subtotal: totals.subtotal,
          markup_amount: totals.markup_amount,
          total_cost: totals.total_cost,
          customer_pricing: project.customer_pricing
        },
        attemptRef: copyAttemptRef,
        keyPrefix: "brick_stone_project_copy",
        baseName: project.project_name || "Brick & Stone",
        label: "Brick & Stone project copy"
      });
      if (embedded) onSaved?.();
      else navigate(`/BrickStoneEstimator?id=${copy.id}`);
    } catch (e) {
      console.error(e);
      alert("Save copy failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const buildBrickStoneTemplateData = (p) => ({
    selected_material_id: p.selected_material_id,
    material_name: p.material_name,
    material_dimensions: p.material_dimensions,
    bricks_along_length: p.bricks_along_length,
    bricks_along_width: p.bricks_along_width,
    courses_high: p.courses_high,
    layers: p.layers,
    mortar_gap: p.mortar_gap,
    waste_factor: p.waste_factor,
    mortar_bag_cost: p.mortar_bag_cost,
    bricks_per_hour: p.bricks_per_hour,
    labor_rate_per_hour: p.labor_rate_per_hour,
    markup_percent: p.markup_percent,
    notes: p.notes
  });
  return /* @__PURE__ */ jsx7("div", { className: "clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50", children: /* @__PURE__ */ jsxs3("div", { className: "max-w-6xl mx-auto p-4 sm:p-6", children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-4 mb-5", children: [
      embedded ? /* @__PURE__ */ jsxs3(
        "button",
        {
          type: "button",
          onClick: onClose,
          className: "flex items-center gap-1 text-sm text-gray-600 hover:text-red-600",
          children: [
            /* @__PURE__ */ jsx7(ArrowLeft, { className: "w-4 h-4" }),
            " Back to products"
          ]
        }
      ) : /* @__PURE__ */ jsxs3(
        Link,
        {
          to: estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator",
          className: "flex items-center gap-1 text-sm text-gray-600 hover:text-red-600",
          children: [
            /* @__PURE__ */ jsx7(ArrowLeft, { className: "w-4 h-4" }),
            " Back to estimate"
          ]
        }
      ),
      project?.updated_date && /* @__PURE__ */ jsxs3("div", { className: "mt-1 text-[10px] text-gray-400", children: [
        "Last saved ",
        new Date(project.updated_date).toLocaleString()
      ] }),
      /* @__PURE__ */ jsxs3(Button, { onClick: handleSave, disabled: saving || !project.selected_material_id, className: "clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold", children: [
        /* @__PURE__ */ jsx7(Save, { className: "w-4 h-4" }),
        " ",
        saving ? "Saving\u2026" : "Save Section"
      ] }),
      /* @__PURE__ */ jsx7(
        ModuleActionBar_default,
        {
          onTemplates: () => setTemplateMode("load"),
          onSaveAsTemplate: () => setTemplateMode("save"),
          onSaveAsCopy: handleSaveAsCopy,
          estimateId,
          saving
        }
      )
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "mb-4", children: [
      /* @__PURE__ */ jsx7("h1", { className: "text-2xl font-bold text-gray-900", children: "Brick & Stone" }),
      /* @__PURE__ */ jsx7("p", { className: "text-sm text-gray-500", children: project.client_name })
    ] }),
    allIssues.length > 0 && /* @__PURE__ */ jsxs3(
      "div",
      {
        role: "status",
        id: "brick-pricing-issues",
        className: "mb-4 flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2",
        children: [
          /* @__PURE__ */ jsx7(AlertTriangle, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" }),
          /* @__PURE__ */ jsxs3("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxs3("div", { className: "font-semibold", children: [
              "Pricing unavailable \u2014 ",
              allIssues.length,
              " value",
              allIssues.length === 1 ? "" : "s",
              " need",
              allIssues.length === 1 ? "s" : "",
              " attention before this section can be priced or saved."
            ] }),
            /* @__PURE__ */ jsxs3("ul", { className: "mt-1 space-y-0.5 list-disc list-inside", children: [
              allIssues.slice(0, 5).map((it, i) => /* @__PURE__ */ jsx7("li", { children: it.message }, i)),
              allIssues.length > 5 && /* @__PURE__ */ jsxs3("li", { children: [
                "\u2026and ",
                allIssues.length - 5,
                " more"
              ] })
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-5", children: [
      /* @__PURE__ */ jsxs3("div", { className: "lg:col-span-2 space-y-4", children: [
        /* @__PURE__ */ jsx7("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: /* @__PURE__ */ jsxs3("label", { className: "text-xs text-gray-500", children: [
          "Section name",
          /* @__PURE__ */ jsx7(
            Input,
            {
              value: project.project_name || "",
              onChange: (e) => patch({ project_name: e.target.value })
            }
          )
        ] }) }),
        /* @__PURE__ */ jsx7(
          BrickGeometryPanel,
          {
            project,
            materials,
            derived: totals,
            issues: allIssues,
            onChange: patch
          }
        ),
        materials.length === 0 && /* @__PURE__ */ jsxs3("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700", children: [
          "No masonry materials in the catalog yet.",
          " ",
          /* @__PURE__ */ jsx7(Link, { to: "/FoundationCatalog", className: "font-semibold underline hover:text-amber-900", children: "Add brick or stone in the foundation catalog \u2192" })
        ] })
      ] }),
      /* @__PURE__ */ jsx7("div", { children: /* @__PURE__ */ jsx7(
        BrickTotals,
        {
          project,
          totals,
          issues: allIssues,
          onChange: (changes) => patch({
            ...changes,
            ...Object.prototype.hasOwnProperty.call(changes, "markup_percent") ? { customer_pricing: { ...project.customer_pricing || {}, applied: false } } : {}
          })
        }
      ) })
    ] }),
    /* @__PURE__ */ jsx7("div", { className: "mt-5", children: /* @__PURE__ */ jsx7(
      CustomerPricingTab_default,
      {
        project: {
          ...project,
          material_cost: totals.material_cost,
          mortar_cost: totals.mortar_cost,
          labor_cost: totals.labor_cost,
          subtotal: totals.subtotal
        },
        categorize: categorizeBrickStoneProject,
        accentColor: "red",
        onApplyTier: (tier) => patch({
          customer_pricing: { ...project.customer_pricing || {}, applied: true, tier_number: tier }
        })
      }
    ) }),
    /* @__PURE__ */ jsx7(
      ModuleTemplateDialog_default,
      {
        open: !!templateMode,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => patch(data),
        moduleKey: "brick_stone",
        title: "Brick & Stone",
        buildTemplateData: buildBrickStoneTemplateData,
        describeTemplate: (t) => t.project_data?.material_name || "Saved wall setup"
      }
    )
  ] }) });
}
export {
  BrickStoneEstimator as Page
};
