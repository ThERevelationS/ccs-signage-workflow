// src/pages/FoundationInventory.jsx
import { useState, useEffect, useRef } from "react";

// offline:@/api/base44Client
var base44 = { entities: { FoundationInventory: {
  async get(id) {
    const env = globalThis.__catalogMetaUI;
    env.calls.push(["get", id]);
    return structuredClone(env.record);
  }
} } };

// offline:@/components/ui/button
import React from "react";
var Button = ({ children, ...props }) => React.createElement("button", props, children);

// offline:@/components/ui/input
import React2 from "react";
var Input = (p) => React2.createElement("input", p);

// offline:@/components/ui/label
import React3 from "react";
var Label = (p) => React3.createElement("label", p);

// offline:@/components/ui/select
var Select = (p) => p.children ?? null;
var SelectContent = (p) => p.children ?? null;
var SelectItem = (p) => p.children ?? null;
var SelectTrigger = (p) => p.children ?? null;
var SelectValue = (p) => p.children ?? null;

// offline:@/components/ui/card
var Card = (p) => p.children ?? null;
var CardContent = (p) => p.children ?? null;
var CardHeader = (p) => p.children ?? null;
var CardTitle = (p) => p.children ?? null;

// offline:@/components/ui/badge
var Badge = (p) => p.children ?? null;

// offline:@/components/ui/tabs
var Tabs = (p) => p.children ?? null;
var TabsContent = (p) => p.children ?? null;
var TabsList = (p) => p.children ?? null;
var TabsTrigger = (p) => p.children ?? null;

// offline:@/components/ui/dialog
var Dialog = (p) => p.children ?? null;
var DialogContent = (p) => p.children ?? null;
var DialogHeader = (p) => p.children ?? null;
var DialogTitle = (p) => p.children ?? null;

// offline:lucide-react
var Trash2 = () => null;
var Plus = () => null;
var Edit = () => null;
var Package = () => null;
var Building2 = () => null;
var Layers = () => null;
var Wrench = () => null;
var Square = () => null;

// offline:@/components/foundation/EquipmentInventoryTab
function Component() {
  return null;
}

// offline:@/components/foundation/WallCapsInventoryTab
function Component2() {
  return null;
}

// offline:@/components/estimator/loadAllEntityRows
function loadAllEntityRows() {
  throw Error("Unexpected collection read in isolated catalog form.");
}

// offline:@/components/estimator/builder/builderEntityPersistence
var expectedEntityFields = (live, data) => Object.fromEntries(Object.keys(data).map((key) => [key, live[key]]));
async function replaceEntityFieldsIfUnchanged(args) {
  const env = globalThis.__catalogMetaUI;
  env.calls.push(["replace", structuredClone(args.nextFields)]);
  if (env.wait) await env.wait;
}
function deleteEntityIfUnchanged() {
  throw Error("Unexpected delete.");
}

// offline:@/components/masterInventory/inventoryPersistence
async function createInventoryRecordWithRecovery(args) {
  globalThis.__catalogMetaUI.calls.push(["create", structuredClone(args.data)]);
}

// offline:@/components/staff/staffEntities
var staffEntities = { FoundationInventory: {} };

// src/components/estimator/foundation/foundationGeometryInputs.js
var foundationInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// src/components/estimator/foundation/foundationReinforcementCatalogMetadata.js
var FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS = Object.freeze([
  Object.freeze({ key: "rebar_diameter_inches", label: "Nominal bar diameter (in)" }),
  Object.freeze({ key: "rebar_weight_lb_per_ft", label: "Weight (lb/ft)" })
]);
var plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function createFoundationReinforcementCatalogMetadataDraft(record) {
  return Object.fromEntries(FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS.filter(({ key }) => plain(record) && Object.hasOwn(record, key)).map(({ key }) => [key, structuredClone(record[key])]));
}
function prepareFoundationReinforcementCatalogMetadataDraft(draft) {
  if (!plain(draft)) return {
    ok: false,
    values: {},
    issues: [{ field: "reinforcement_metadata", message: "Reinforcement catalog metadata must be a plain record." }]
  };
  const values = {}, issues = [];
  for (const { key, label } of FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS) {
    if (!Object.hasOwn(draft, key)) continue;
    const raw = draft[key];
    if (raw == null || typeof raw === "string" && raw.trim() === "") {
      values[key] = null;
      continue;
    }
    const number = foundationInputNumber(raw);
    if (number === null || number <= 0) {
      issues.push({ field: key, message: `${label}: enter a finite positive decimal, or leave blank for not recorded.` });
    } else values[key] = number;
  }
  return { ok: issues.length === 0, values, issues };
}

// src/components/estimator/foundation/ReinforcementDraftField.jsx
import { jsx, jsxs } from "react/jsx-runtime";
function ReinforcementDraftField({ label, value, onChange, disabled, inputMode = "decimal", maxLength, suffix, placeholder, rawInvalid = false }) {
  const invalid = rawInvalid || value != null && !["string", "number"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value);
  return /* @__PURE__ */ jsxs("label", { className: "block min-w-0", children: [
    /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-600", children: label }),
    /* @__PURE__ */ jsxs("span", { className: "mt-0.5 flex items-center gap-1", children: [
      /* @__PURE__ */ jsx(
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
      invalid && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-red-600", children: "Invalid" }),
      suffix && /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-500", children: suffix })
    ] })
  ] });
}

// src/components/estimator/foundation/FoundationReinforcementCatalogMetadataFields.jsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function FoundationReinforcementCatalogMetadataFields({ draft, onChange, disabled = false }) {
  const prepared = prepareFoundationReinforcementCatalogMetadataDraft(draft);
  return /* @__PURE__ */ jsxs2("div", { className: "rounded-sm border border-gray-200 bg-gray-50 p-2 mt-1 space-y-1", children: [
    /* @__PURE__ */ jsx2("h3", { className: "text-[12px] font-semibold text-gray-700", children: "Preliminary reinforcement metadata" }),
    /* @__PURE__ */ jsx2("p", { className: "text-[11px] text-gray-500", children: "Optional explicit measurements for preliminary reinforcement. Blank is not recorded, not zero. No diameter or weight is inferred from the bar-size label; this is not engineering approval." }),
    /* @__PURE__ */ jsx2("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS.map((field) => /* @__PURE__ */ jsx2(
      ReinforcementDraftField,
      {
        label: field.label,
        value: draft?.[field.key],
        disabled,
        inputMode: "decimal",
        maxLength: 64,
        placeholder: "Not recorded",
        onChange: (value) => onChange?.({ ...draft && typeof draft === "object" ? draft : {}, [field.key]: value })
      },
      field.key
    )) }),
    !prepared.ok && /* @__PURE__ */ jsx2("div", { role: "alert", className: "text-[11px] text-red-700 space-y-0.5", children: prepared.issues.map((issue, i) => /* @__PURE__ */ jsx2("p", { children: issue.message }, i)) })
  ] });
}

// src/pages/FoundationInventory.jsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var FoundationInventoryEntity = staffEntities.FoundationInventory;
var WALL_SUBTYPES = [
  { value: "brick", label: "Brick" },
  { value: "cinderblock", label: "Cinderblock / CMU" },
  { value: "stone", label: "Stone" },
  { value: "concrete", label: "Concrete (poured/cast)" }
];
var TEXTURE_OPTIONS = [
  { value: "smooth", label: "Smooth" },
  { value: "rough", label: "Rough / Natural" },
  { value: "textured", label: "Textured" },
  { value: "glazed", label: "Glazed" }
];
var PRESET_COLORS = [
  { label: "Red Brick", value: "#b5451b" },
  { label: "Tan Brick", value: "#c8a97e" },
  { label: "Gray Concrete", value: "#9ca3af" },
  { label: "Dark Charcoal", value: "#4b5563" },
  { label: "Sandstone", value: "#d4a76a" },
  { label: "Limestone", value: "#e5d9c3" },
  { label: "Slate Gray", value: "#708090" },
  { label: "Cream", value: "#f5e6c8" },
  { label: "Brown", value: "#795548" },
  { label: "White", value: "#f5f5f5" }
];
var TAB_CONFIGS = {
  concrete: {
    label: "Bagged Concrete",
    types: ["bagged_concrete"],
    defaultType: "bagged_concrete",
    fields: [
      { key: "material_name", label: "Material Name *", type: "text", required: true },
      { key: "material_description", label: "Description", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "unit", label: "Unit", type: "select", options: [{ value: "bag", label: "Bag" }, { value: "each", label: "Each" }] },
      { key: "cost_per_unit", label: "Cost Per Unit ($)", type: "number" },
      { key: "notes", label: "Notes", type: "text" }
    ]
  },
  rebar: {
    label: "Rebar",
    types: ["rebar"],
    defaultType: "rebar",
    fields: [
      { key: "material_name", label: "Material Name *", type: "text", required: true },
      { key: "rebar_size", label: "Rebar Size", type: "select", options: [{ value: "#3", label: "#3" }, { value: "#4", label: "#4" }, { value: "#5", label: "#5" }, { value: "#6", label: "#6" }] },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "unit", label: "Unit", type: "select", options: [{ value: "lf", label: "Linear Ft" }, { value: "ton", label: "Ton" }, { value: "each", label: "Each" }] },
      { key: "cost_per_unit", label: "Cost Per Unit ($)", type: "number" },
      { key: "notes", label: "Notes", type: "text" }
    ]
  },
  forming: {
    label: "Forming",
    types: ["forming_material"],
    defaultType: "forming_material",
    fields: [
      { key: "material_name", label: "Material Name *", type: "text", required: true },
      { key: "material_description", label: "Description", type: "text" },
      { key: "lumber_size", label: "Lumber Size", type: "select", options: [{ value: "2x4", label: "2x4" }, { value: "2x6", label: "2x6" }, { value: "2x8", label: "2x8" }, { value: "2x10", label: "2x10" }, { value: "2x12", label: "2x12" }, { value: "plywood_3/4", label: 'Plywood 3/4"' }, { value: "custom", label: "Custom" }] },
      { key: "thickness_inches", label: "Thickness (inches)", type: "number" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "unit", label: "Unit", type: "select", options: [{ value: "lf", label: "Linear Ft" }, { value: "each", label: "Each" }, { value: "sheet", label: "Sheet" }] },
      { key: "cost_per_unit", label: "Cost Per Unit ($)", type: "number" },
      { key: "notes", label: "Notes", type: "text" }
    ]
  },
  poles: {
    label: "Poles",
    types: ["pole"],
    defaultType: "pole",
    fields: [
      { key: "material_name", label: "Pole Name *", type: "text", required: true },
      { key: "pole_shape", label: "Shape", type: "select", options: [{ value: "square", label: "Square / Rectangular" }, { value: "round", label: "Round" }] },
      { key: "pole_width_inches", label: "Width (inches)", type: "number" },
      { key: "pole_depth_inches", label: "Depth (inches)", type: "number" },
      { key: "pole_wall_thickness_inches", label: "Wall Thickness (inches)", type: "number" },
      { key: "pole_stock_length_ft", label: "Stock Length (ft)", type: "number" },
      { key: "pole_pricing_mode", label: "Pricing Mode", type: "select", options: [{ value: "per_foot", label: "Per Foot" }, { value: "stock_price", label: "Per Stock Piece" }] },
      { key: "cost_per_unit", label: "Cost Per Unit ($)", type: "number" },
      { key: "pole_stock_price", label: "Stock Piece Price ($)", type: "number" },
      { key: "paint_rate_per_linear_ft", label: "Paint Rate / Linear Ft ($)", type: "number" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "notes", label: "Notes", type: "text" }
    ]
  }
};
function GenericItemForm({ tabKey, item, onSave, onCancel }) {
  const config = TAB_CONFIGS[tabKey];
  const defaults = { material_type: config.defaultType };
  config.fields.forEach((f) => {
    if (f.type === "number") defaults[f.key] = 0;
    else if (f.type === "select") defaults[f.key] = f.options?.[0]?.value || "";
    else defaults[f.key] = "";
  });
  const [form, setForm] = useState({ ...defaults, ...item });
  const [metadataDraft, setMetadataDraft] = useState(() => createFoundationReinforcementCatalogMetadataDraft(item));
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const metadata = prepareFoundationReinforcementCatalogMetadataDraft(metadataDraft);
  const isValid = config.fields.filter((f) => f.required).every((f) => form[f.key]);
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-2 gap-3", children: config.fields.map((field) => /* @__PURE__ */ jsxs3("div", { className: field.key === "material_name" || field.key === "notes" ? "col-span-2" : "", children: [
      /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: field.label }),
      field.type === "select" ? /* @__PURE__ */ jsxs3(Select, { value: String(form[field.key] ?? field.options?.[0]?.value ?? ""), onValueChange: (v) => set(field.key, v), children: [
        /* @__PURE__ */ jsx3(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx3(SelectValue, {}) }),
        /* @__PURE__ */ jsx3(SelectContent, { children: field.options.map((o) => /* @__PURE__ */ jsx3(SelectItem, { value: o.value, children: o.label }, o.value)) })
      ] }) : field.type === "number" ? /* @__PURE__ */ jsx3(
        Input,
        {
          type: "number",
          className: "h-8",
          value: form[field.key] ?? 0,
          step: "0.01",
          min: "0",
          onChange: (e) => set(field.key, parseFloat(e.target.value) || 0)
        }
      ) : /* @__PURE__ */ jsx3(Input, { className: "h-8", value: form[field.key] ?? "", onChange: (e) => set(field.key, e.target.value) })
    ] }, field.key)) }),
    form.material_type === "rebar" && /* @__PURE__ */ jsx3(FoundationReinforcementCatalogMetadataFields, { draft: metadataDraft, onChange: setMetadataDraft }),
    form.material_type === "concrete_service" && /* @__PURE__ */ jsxs3("div", { className: "col-span-2 space-y-4 border-t border-slate-200 mt-4 pt-4", children: [
      /* @__PURE__ */ jsx3("h4", { className: "text-sm font-semibold text-slate-800", children: "Mix Pricing ($/CY)" }),
      /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "3500 AE" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.mix_3500_price ?? 195.4, onChange: (e) => set("mix_3500_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "4000 AE (Standard)" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.mix_4000_price ?? 201, onChange: (e) => set("mix_4000_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "4500 AE" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.mix_4500_price ?? 208.7, onChange: (e) => set("mix_4500_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "5000 AE" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.mix_5000_price ?? 214.6, onChange: (e) => set("mix_5000_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Fast Set" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.mix_fast_set_price ?? 248, onChange: (e) => set("mix_fast_set_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("h4", { className: "text-sm font-semibold text-slate-800", children: "Admixture Pricing ($/CY)" }),
      /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Calcium Chloride" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.admix_calcium_chloride_price ?? 8.5, onChange: (e) => set("admix_calcium_chloride_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Set-Retarding" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.admix_set_retarding_price ?? 4.5, onChange: (e) => set("admix_set_retarding_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Water-Reducing" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.admix_water_reducing_price ?? 4.25, onChange: (e) => set("admix_water_reducing_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Fibers" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.admix_fibers_price ?? 12.5, onChange: (e) => set("admix_fibers_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Winter Service" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.admix_winter_service_price ?? 5.5, onChange: (e) => set("admix_winter_service_price", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("h4", { className: "text-sm font-semibold text-slate-800", children: "Small Load Fees ($)" }),
      /* @__PURE__ */ jsx3("p", { className: "text-xs text-slate-500 -mt-2", children: "Fee charged by the supplier when ordering less than a full truck. Enter $0 for no fee." }),
      /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "1 \u2013 1.75 YD" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.small_load_fee_1_1_75 ?? 150, onChange: (e) => set("small_load_fee_1_1_75", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "2 \u2013 2.75 YD" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.small_load_fee_2_2_75 ?? 120, onChange: (e) => set("small_load_fee_2_2_75", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "3 \u2013 3.75 YD" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.small_load_fee_3_3_75 ?? 105, onChange: (e) => set("small_load_fee_3_3_75", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "4 \u2013 4.25 YD" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.small_load_fee_4_4_25 ?? 80, onChange: (e) => set("small_load_fee_4_4_25", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "4.5 \u2013 4.75 YD" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.small_load_fee_4_5_4_75 ?? 40, onChange: (e) => set("small_load_fee_4_5_4_75", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("h4", { className: "text-sm font-semibold text-slate-800", children: "Fuel / Delivery Surcharge ($)" }),
      /* @__PURE__ */ jsx3("p", { className: "text-xs text-slate-500 -mt-2", children: "Flat fee added per truck load for fuel and delivery." }),
      /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Per Load Surcharge" }),
        /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.fuel_surcharge ?? 30, onChange: (e) => set("fuel_surcharge", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "flex justify-end gap-2 pt-2", children: [
      /* @__PURE__ */ jsx3(Button, { variant: "outline", size: "sm", onClick: onCancel, children: "Cancel" }),
      /* @__PURE__ */ jsx3(Button, { size: "sm", onClick: () => onSave(form.material_type === "rebar" ? { ...form, ...metadata.values } : form), disabled: !isValid || form.material_type === "rebar" && !metadata.ok, children: "Save" })
    ] })
  ] });
}
function WallMaterialForm({ item, onSave, onCancel, isFillMaterial }) {
  const [form, setForm] = useState({
    material_name: "",
    material_type: isFillMaterial ? "fill_material" : "wall_material",
    wall_material_subtype: "brick",
    wall_unit_length_inches: 8,
    wall_unit_width_inches: 4,
    wall_unit_height_inches: 2.25,
    wall_color: "#b5451b",
    wall_texture: "rough",
    cost_per_unit: 0.75,
    supplier: "",
    notes: "",
    ...item
  });
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const isConcrete = form.wall_material_subtype === "concrete";
  const applyPreset = (subtype) => {
    set("wall_material_subtype", subtype);
    if (subtype === "brick") {
      set("wall_unit_length_inches", 8);
      set("wall_unit_width_inches", 3.75);
      set("wall_unit_height_inches", 2.25);
    } else if (subtype === "cinderblock") {
      set("wall_unit_length_inches", 16);
      set("wall_unit_width_inches", 8);
      set("wall_unit_height_inches", 8);
    } else if (subtype === "stone") {
      set("wall_unit_length_inches", 12);
      set("wall_unit_width_inches", 6);
      set("wall_unit_height_inches", 4);
    } else if (subtype === "concrete") {
      set("wall_unit_length_inches", 0);
      set("wall_unit_width_inches", 8);
      set("wall_unit_height_inches", 0);
      set("wall_color", "#9ca3af");
      set("wall_texture", "smooth");
    }
  };
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs3("div", { className: "col-span-2", children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Material Name *" }),
        /* @__PURE__ */ jsx3(Input, { className: "h-8", value: form.material_name, onChange: (e) => set("material_name", e.target.value), placeholder: "e.g. Standard Red Brick" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Material Subtype" }),
        /* @__PURE__ */ jsxs3(Select, { value: form.wall_material_subtype, onValueChange: applyPreset, children: [
          /* @__PURE__ */ jsx3(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx3(SelectValue, {}) }),
          /* @__PURE__ */ jsx3(SelectContent, { children: WALL_SUBTYPES.map((s) => /* @__PURE__ */ jsx3(SelectItem, { value: s.value, children: s.label }, s.value)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Cost Per Unit ($)" }),
        /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.cost_per_unit, onChange: (e) => set("cost_per_unit", parseFloat(e.target.value) || 0), step: "0.01", min: "0" })
      ] })
    ] }),
    !isConcrete && /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsx3("div", { className: "text-xs font-semibold text-slate-600 uppercase tracking-wide", children: "Unit Dimensions" }),
      /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Length (inches)" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.wall_unit_length_inches, onChange: (e) => set("wall_unit_length_inches", parseFloat(e.target.value) || 0), step: "0.125" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Width / Depth (inches)" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.wall_unit_width_inches, onChange: (e) => set("wall_unit_width_inches", parseFloat(e.target.value) || 0), step: "0.125" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Height (inches)" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.wall_unit_height_inches, onChange: (e) => set("wall_unit_height_inches", parseFloat(e.target.value) || 0), step: "0.125" })
        ] })
      ] })
    ] }),
    isConcrete && /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-2 gap-3", children: /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Wall Depth / Width (inches)" }),
      /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.wall_unit_width_inches, onChange: (e) => set("wall_unit_width_inches", parseFloat(e.target.value) || 0), step: "0.5" })
    ] }) }),
    /* @__PURE__ */ jsx3("div", { className: "text-xs font-semibold text-slate-600 uppercase tracking-wide", children: "Visual / 3D Appearance" }),
    /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Color" }),
        /* @__PURE__ */ jsxs3("div", { className: "flex gap-2 mt-1 flex-wrap", children: [
          PRESET_COLORS.map((c) => /* @__PURE__ */ jsx3(
            "button",
            {
              type: "button",
              title: c.label,
              className: `w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${form.wall_color === c.value ? "border-blue-500 scale-110" : "border-transparent"}`,
              style: { backgroundColor: c.value },
              onClick: () => set("wall_color", c.value)
            },
            c.value
          )),
          /* @__PURE__ */ jsx3("input", { type: "color", value: form.wall_color || "#b5451b", onChange: (e) => set("wall_color", e.target.value), className: "w-6 h-6 rounded border cursor-pointer", title: "Custom color" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Texture" }),
        /* @__PURE__ */ jsxs3(Select, { value: form.wall_texture || "rough", onValueChange: (v) => set("wall_texture", v), children: [
          /* @__PURE__ */ jsx3(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx3(SelectValue, {}) }),
          /* @__PURE__ */ jsx3(SelectContent, { children: TEXTURE_OPTIONS.map((t) => /* @__PURE__ */ jsx3(SelectItem, { value: t.value, children: t.label }, t.value)) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Supplier" }),
        /* @__PURE__ */ jsx3(Input, { className: "h-8", value: form.supplier || "", onChange: (e) => set("supplier", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Notes" }),
        /* @__PURE__ */ jsx3(Input, { className: "h-8", value: form.notes || "", onChange: (e) => set("notes", e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "flex justify-end gap-2 pt-2", children: [
      /* @__PURE__ */ jsx3(Button, { variant: "outline", size: "sm", onClick: onCancel, children: "Cancel" }),
      /* @__PURE__ */ jsx3(Button, { size: "sm", onClick: () => onSave(form), disabled: !form.material_name, children: "Save" })
    ] })
  ] });
}
function GenericTab({ tabKey, items, onEdit, onDelete, onAdd, isAdmin }) {
  const config = TAB_CONFIGS[tabKey];
  const displayFields = config.fields.filter(
    (f) => !["material_name", "notes", "material_type"].includes(f.key)
  ).slice(0, 4);
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-4 mt-4", children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs3("p", { className: "text-sm text-slate-600", children: [
        config.label,
        " items used for cost estimation in foundation projects."
      ] }),
      isAdmin && /* @__PURE__ */ jsxs3(Button, { size: "sm", onClick: onAdd, children: [
        /* @__PURE__ */ jsx3(Plus, { className: "w-4 h-4 mr-1" }),
        " Add ",
        config.label
      ] })
    ] }),
    items.length === 0 ? /* @__PURE__ */ jsx3(Card, { className: "border-dashed", children: /* @__PURE__ */ jsxs3(CardContent, { className: "py-10 text-center text-slate-400", children: [
      /* @__PURE__ */ jsx3(Package, { className: "w-8 h-8 mx-auto mb-2 opacity-30" }),
      /* @__PURE__ */ jsxs3("p", { children: [
        "No ",
        config.label.toLowerCase(),
        " items yet."
      ] }),
      /* @__PURE__ */ jsxs3("p", { className: "text-xs mt-1", children: [
        'Click "Add ',
        config.label,
        '" to get started.'
      ] })
    ] }) }) : /* @__PURE__ */ jsx3("div", { className: "space-y-2", children: items.map((item) => /* @__PURE__ */ jsx3(Card, { className: "hover:shadow-sm transition-shadow border-blue-200 shadow-sm overflow-hidden mb-3", children: /* @__PURE__ */ jsxs3(CardContent, { className: "py-3 px-4 flex items-start justify-between gap-3 bg-blue-50/30", children: [
      /* @__PURE__ */ jsxs3("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsx3("p", { className: "text-sm font-semibold text-slate-800", children: item.material_name }),
        /* @__PURE__ */ jsxs3("div", { className: "flex flex-wrap gap-x-4 gap-y-0.5 mt-1", children: [
          /* @__PURE__ */ jsx3("span", { className: "text-xs text-slate-500 capitalize", children: item.material_type?.replace(/_/g, " ") }),
          displayFields.map((f) => {
            const val = item[f.key];
            if (!val && val !== 0) return null;
            const label = f.label.replace(" ($)", "").replace(" *", "");
            const display = f.type === "number" && f.label.includes("$") ? `$${parseFloat(val).toFixed(2)}` : val;
            return /* @__PURE__ */ jsxs3("span", { className: "text-xs text-slate-500", children: [
              label,
              ": ",
              /* @__PURE__ */ jsx3("span", { className: "text-slate-700 font-medium", children: display })
            ] }, f.key);
          }),
          item.cost_per_unit > 0 && !displayFields.find((f) => f.key === "cost_per_unit") && /* @__PURE__ */ jsxs3("span", { className: "text-xs text-slate-500", children: [
            "Cost: ",
            /* @__PURE__ */ jsxs3("span", { className: "text-slate-700 font-medium", children: [
              "$",
              parseFloat(item.cost_per_unit).toFixed(2)
            ] })
          ] }),
          item.cost_per_day > 0 && /* @__PURE__ */ jsxs3("span", { className: "text-xs text-slate-500", children: [
            "Day: ",
            /* @__PURE__ */ jsxs3("span", { className: "text-slate-700 font-medium", children: [
              "$",
              parseFloat(item.cost_per_day).toFixed(2)
            ] })
          ] }),
          item.cost_per_week > 0 && /* @__PURE__ */ jsxs3("span", { className: "text-xs text-slate-500", children: [
            "Week: ",
            /* @__PURE__ */ jsxs3("span", { className: "text-slate-700 font-medium", children: [
              "$",
              parseFloat(item.cost_per_week).toFixed(2)
            ] })
          ] }),
          item.notes && /* @__PURE__ */ jsx3("span", { className: "text-xs text-slate-400 italic", children: item.notes })
        ] })
      ] }),
      isAdmin && /* @__PURE__ */ jsxs3("div", { className: "flex gap-1 flex-shrink-0", children: [
        /* @__PURE__ */ jsx3(Button, { size: "sm", variant: "ghost", onClick: () => onEdit(item), children: /* @__PURE__ */ jsx3(Edit, { className: "w-3 h-3" }) }),
        /* @__PURE__ */ jsx3(Button, { size: "sm", variant: "ghost", className: "text-red-500 hover:text-red-600", onClick: () => onDelete(item), children: /* @__PURE__ */ jsx3(Trash2, { className: "w-3 h-3" }) })
      ] })
    ] }) }, item.id)) })
  ] });
}
function FoundationInventoryPage({ embedded = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("wall_material");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadError, setLoadError] = useState("");
  const actionRef = useRef(/* @__PURE__ */ new Set());
  const [showWallForm, setShowWallForm] = useState(false);
  const [wallEditItem, setWallEditItem] = useState(null);
  const [wallEditItemIsFill, setWallEditItemIsFill] = useState(false);
  const [showGenericForm, setShowGenericForm] = useState(false);
  const [genericTabKey, setGenericTabKey] = useState(null);
  const [genericEditItem, setGenericEditItem] = useState(null);
  useEffect(() => {
    const checkAuth = async () => {
      const user = await base44.auth.me().catch(() => null);
      setIsAdmin(user?.role === "admin");
    };
    checkAuth();
    loadItems();
  }, []);
  const loadItems = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await loadAllEntityRows({ entity: FoundationInventoryEntity, sort: "-created_date", label: "Foundation inventory" });
      setItems(data);
    } catch (error) {
      console.error("Foundation inventory load failed:", error);
      setLoadError(error?.message || "Concrete & Stone inventory could not be verified.");
    } finally {
      setLoading(false);
    }
  };
  const handleDelete = async (item) => {
    if (!item?.id || loadError || actionRef.current.has(`delete:${item.id}`)) return;
    const lockKey = `delete:${item.id}`;
    actionRef.current.add(lockKey);
    if (!window.confirm("Delete this item?")) {
      actionRef.current.delete(lockKey);
      return;
    }
    try {
      const live = await FoundationInventoryEntity.get(item.id);
      if (item.updated_date && live?.updated_date && item.updated_date !== live.updated_date) {
        alert("This material changed in another session and was not deleted. The latest Concrete & Stone inventory will be reloaded first.");
        await loadItems();
        return;
      }
      await deleteEntityIfUnchanged({
        entity: FoundationInventoryEntity,
        record: live,
        label: `Foundation material \u201C${item.material_name || "Item"}\u201D`
      });
      await loadItems();
    } catch (error) {
      console.error("Foundation inventory delete failed:", error);
      alert(error?.message || "Material could not be deleted.");
      await loadItems();
    } finally {
      actionRef.current.delete(lockKey);
    }
  };
  const handleSaveWall = async (form) => {
    const lockKey = `wall:${wallEditItem?.id || "new"}`;
    if (loadError || actionRef.current.has(lockKey)) return;
    actionRef.current.add(lockKey);
    try {
      if (wallEditItem?.id) {
        const live = await FoundationInventoryEntity.get(wallEditItem.id);
        if (wallEditItem.updated_date && live?.updated_date && wallEditItem.updated_date !== live.updated_date) {
          alert("This wall material changed in another session. Your changes were not saved; the latest inventory will be reloaded.");
          setShowWallForm(false);
          setWallEditItem(null);
          setWallEditItemIsFill(false);
          await loadItems();
          return;
        }
        await replaceEntityFieldsIfUnchanged({
          entity: FoundationInventoryEntity,
          id: wallEditItem.id,
          expectedUpdatedAt: live.updated_date || "",
          expectedFields: expectedEntityFields(live, form),
          nextFields: form,
          label: `Wall material \u201C${form.material_name || "Item"}\u201D`
        });
      } else {
        await createInventoryRecordWithRecovery({
          entity: FoundationInventoryEntity,
          data: form,
          nameField: "material_name",
          label: `Wall material \u201C${form.material_name || "Item"}\u201D`
        });
      }
      setShowWallForm(false);
      setWallEditItem(null);
      setWallEditItemIsFill(false);
      await loadItems();
    } catch (error) {
      console.error("Wall material save failed:", error);
      alert(error?.message || "Wall material could not be saved.");
    } finally {
      actionRef.current.delete(lockKey);
    }
  };
  const handleSaveGeneric = async (form) => {
    const lockKey = `generic:${genericEditItem?.id || "new"}`;
    if (loadError || actionRef.current.has(lockKey)) return;
    actionRef.current.add(lockKey);
    try {
      if (genericEditItem?.id) {
        const live = await FoundationInventoryEntity.get(genericEditItem.id);
        if (genericEditItem.updated_date && live?.updated_date && genericEditItem.updated_date !== live.updated_date) {
          alert("This material changed in another session. Your changes were not saved; the latest inventory will be reloaded.");
          setShowGenericForm(false);
          setGenericEditItem(null);
          setGenericTabKey(null);
          await loadItems();
          return;
        }
        await replaceEntityFieldsIfUnchanged({
          entity: FoundationInventoryEntity,
          id: genericEditItem.id,
          expectedUpdatedAt: live.updated_date || "",
          expectedFields: expectedEntityFields(live, form),
          nextFields: form,
          label: `Foundation material \u201C${form.material_name || "Item"}\u201D`
        });
      } else {
        await createInventoryRecordWithRecovery({
          entity: FoundationInventoryEntity,
          data: form,
          nameField: "material_name",
          label: `Foundation material \u201C${form.material_name || "Item"}\u201D`
        });
      }
      setShowGenericForm(false);
      setGenericEditItem(null);
      setGenericTabKey(null);
      await loadItems();
    } catch (error) {
      console.error("Foundation material save failed:", error);
      alert(error?.message || "Material could not be saved.");
    } finally {
      actionRef.current.delete(lockKey);
    }
  };
  const openGenericAdd = (tabKey) => {
    setGenericTabKey(tabKey);
    setGenericEditItem(null);
    setShowGenericForm(true);
  };
  const openGenericEdit = (tabKey, item) => {
    setGenericTabKey(tabKey);
    setGenericEditItem(item);
    setShowGenericForm(true);
  };
  const byType = (types) => items.filter((i) => types.includes(i.material_type));
  const wallMaterials = byType(["wall_material"]);
  const fillMaterials = byType(["fill_material"]);
  const canEdit = isAdmin && !loadError;
  return /* @__PURE__ */ jsxs3("div", { className: embedded ? "space-y-4" : "p-6 max-w-7xl mx-auto space-y-6", children: [
    !embedded && /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3("h1", { className: "text-2xl font-bold text-slate-900", children: "Concrete | Masonry | Poles Inventory" }),
        /* @__PURE__ */ jsx3("p", { className: "text-slate-500 text-sm", children: "Manage material costs for use in concrete, masonry & pole estimates" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900", children: [
        /* @__PURE__ */ jsx3("strong", { children: "Heads up:" }),
        " This page has moved into ",
        /* @__PURE__ */ jsx3("a", { href: "/MasterInventory", className: "underline font-semibold", children: "Master Inventory \u2192 Concrete & Stone" }),
        ". Poles now live under ",
        /* @__PURE__ */ jsx3("a", { href: "/MasterInventory", className: "underline font-semibold", children: "Master Inventory \u2192 Extruded Metals & Poles" }),
        "."
      ] })
    ] }),
    loadError && /* @__PURE__ */ jsxs3("div", { className: "p-3 text-center text-red-700 bg-red-50 border border-red-200 rounded", children: [
      /* @__PURE__ */ jsx3("div", { className: "font-semibold", children: "Concrete & Stone inventory could not be verified." }),
      /* @__PURE__ */ jsx3("div", { className: "text-xs mt-1", children: loadError }),
      /* @__PURE__ */ jsx3(Button, { variant: "outline", size: "sm", className: "mt-2", onClick: loadItems, children: "Retry" })
    ] }),
    /* @__PURE__ */ jsxs3(Tabs, { value: activeTab, onValueChange: setActiveTab, children: [
      /* @__PURE__ */ jsxs3(TabsList, { className: "flex-wrap h-auto gap-1 bg-slate-100/80 p-1.5 border border-slate-200 rounded-xl shadow-sm", children: [
        /* @__PURE__ */ jsxs3(TabsTrigger, { value: "wall_material", className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsx3(Building2, { className: "w-3 h-3" }),
          " Wall Materials"
        ] }),
        /* @__PURE__ */ jsx3(TabsTrigger, { value: "concrete", children: "Concrete" }),
        /* @__PURE__ */ jsx3(TabsTrigger, { value: "rebar", children: "Rebar" }),
        /* @__PURE__ */ jsx3(TabsTrigger, { value: "forming", children: "Forming" }),
        !embedded && /* @__PURE__ */ jsxs3(TabsTrigger, { value: "equipment", className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsx3(Wrench, { className: "w-3 h-3" }),
          " Equipment"
        ] }),
        !embedded && /* @__PURE__ */ jsx3(TabsTrigger, { value: "poles", children: "Poles" }),
        /* @__PURE__ */ jsxs3(TabsTrigger, { value: "fill_material", children: [
          /* @__PURE__ */ jsx3(Layers, { className: "w-3 h-3 mr-1" }),
          "Wall Fill"
        ] }),
        /* @__PURE__ */ jsxs3(TabsTrigger, { value: "wall_cap", className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsx3(Square, { className: "w-3 h-3" }),
          " Wall Caps"
        ] })
      ] }),
      /* @__PURE__ */ jsxs3(TabsContent, { value: "wall_material", className: "space-y-4 mt-4", children: [
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx3("p", { className: "text-sm text-slate-600", children: "Brick, cinderblock, stone, and concrete units for building walls above the foundation." }),
          canEdit && /* @__PURE__ */ jsxs3(Button, { size: "sm", onClick: () => {
            setWallEditItem(null);
            setShowWallForm(true);
          }, children: [
            /* @__PURE__ */ jsx3(Plus, { className: "w-4 h-4 mr-1" }),
            " Add Wall Material"
          ] })
        ] }),
        loading ? /* @__PURE__ */ jsx3("div", { className: "text-center text-slate-400 py-8", children: "Loading..." }) : wallMaterials.length === 0 ? /* @__PURE__ */ jsx3(Card, { className: "border-dashed", children: /* @__PURE__ */ jsxs3(CardContent, { className: "py-10 text-center text-slate-400", children: [
          /* @__PURE__ */ jsx3(Building2, { className: "w-10 h-10 mx-auto mb-3 opacity-30" }),
          /* @__PURE__ */ jsx3("p", { children: "No wall materials yet. Add brick, stone, cinderblock, or concrete units." })
        ] }) }) : /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: wallMaterials.map((m) => /* @__PURE__ */ jsxs3(Card, { className: "hover:shadow-md transition-shadow border-orange-200 shadow-sm overflow-hidden", children: [
          /* @__PURE__ */ jsx3(CardHeader, { className: "py-3 px-4 bg-orange-50/50 border-b border-orange-100", children: /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx3("div", { className: "w-8 h-8 rounded border border-slate-300 flex-shrink-0", style: { backgroundColor: m.wall_color || "#cc9966" } }),
              /* @__PURE__ */ jsxs3("div", { children: [
                /* @__PURE__ */ jsx3(CardTitle, { className: "text-sm font-semibold", children: m.material_name }),
                /* @__PURE__ */ jsx3(Badge, { variant: "outline", className: "text-xs capitalize", children: m.wall_material_subtype })
              ] })
            ] }),
            canEdit && /* @__PURE__ */ jsxs3("div", { className: "flex gap-1", children: [
              /* @__PURE__ */ jsx3(Button, { size: "sm", variant: "ghost", onClick: () => {
                setWallEditItem(m);
                setShowWallForm(true);
              }, children: /* @__PURE__ */ jsx3(Edit, { className: "w-3 h-3" }) }),
              /* @__PURE__ */ jsx3(Button, { size: "sm", variant: "ghost", className: "text-red-500", onClick: () => handleDelete(m), children: /* @__PURE__ */ jsx3(Trash2, { className: "w-3 h-3" }) })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxs3(CardContent, { className: "px-4 pb-3 text-xs text-slate-600 space-y-1", children: [
            m.wall_material_subtype !== "concrete" && /* @__PURE__ */ jsxs3("div", { children: [
              "Size: ",
              m.wall_unit_length_inches,
              '"L \xD7 ',
              m.wall_unit_width_inches,
              '"W \xD7 ',
              m.wall_unit_height_inches,
              '"H'
            ] }),
            m.wall_material_subtype === "concrete" && /* @__PURE__ */ jsxs3("div", { children: [
              "Wall depth: ",
              m.wall_unit_width_inches,
              '"'
            ] }),
            /* @__PURE__ */ jsxs3("div", { children: [
              "Cost: $",
              parseFloat(m.cost_per_unit || 0).toFixed(2),
              " / unit"
            ] }),
            /* @__PURE__ */ jsxs3("div", { children: [
              "Texture: ",
              /* @__PURE__ */ jsx3("span", { className: "capitalize", children: m.wall_texture })
            ] }),
            m.supplier && /* @__PURE__ */ jsxs3("div", { children: [
              "Supplier: ",
              m.supplier
            ] })
          ] })
        ] }, m.id)) })
      ] }),
      /* @__PURE__ */ jsxs3(TabsContent, { value: "fill_material", className: "space-y-4 mt-4", children: [
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx3("p", { className: "text-sm text-slate-600", children: "Materials for internal walls (configured identically to Wall Materials)." }),
          canEdit && /* @__PURE__ */ jsxs3(Button, { size: "sm", onClick: () => {
            setWallEditItem(null);
            setWallEditItemIsFill(true);
            setShowWallForm(true);
          }, children: [
            /* @__PURE__ */ jsx3(Plus, { className: "w-4 h-4 mr-1" }),
            " Add Wall Fill"
          ] })
        ] }),
        loading ? /* @__PURE__ */ jsx3("div", { className: "text-center text-slate-400 py-8", children: "Loading..." }) : fillMaterials.length === 0 ? /* @__PURE__ */ jsx3(Card, { className: "border-dashed", children: /* @__PURE__ */ jsxs3(CardContent, { className: "py-10 text-center text-slate-400", children: [
          /* @__PURE__ */ jsx3(Layers, { className: "w-10 h-10 mx-auto mb-3 opacity-30" }),
          /* @__PURE__ */ jsx3("p", { children: "No wall fill materials yet." })
        ] }) }) : /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: fillMaterials.map((m) => /* @__PURE__ */ jsxs3(Card, { className: "hover:shadow-md transition-shadow border-indigo-200 shadow-sm overflow-hidden", children: [
          /* @__PURE__ */ jsx3(CardHeader, { className: "py-3 px-4 bg-indigo-50/50 border-b border-indigo-100", children: /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx3("div", { className: "w-8 h-8 rounded border border-slate-300 flex-shrink-0", style: { backgroundColor: m.wall_color || "#cc9966" } }),
              /* @__PURE__ */ jsxs3("div", { children: [
                /* @__PURE__ */ jsx3(CardTitle, { className: "text-sm font-semibold", children: m.material_name }),
                /* @__PURE__ */ jsx3(Badge, { variant: "outline", className: "text-xs capitalize", children: m.wall_material_subtype })
              ] })
            ] }),
            canEdit && /* @__PURE__ */ jsxs3("div", { className: "flex gap-1", children: [
              /* @__PURE__ */ jsx3(Button, { size: "sm", variant: "ghost", onClick: () => {
                setWallEditItem(m);
                setWallEditItemIsFill(true);
                setShowWallForm(true);
              }, children: /* @__PURE__ */ jsx3(Edit, { className: "w-3 h-3" }) }),
              /* @__PURE__ */ jsx3(Button, { size: "sm", variant: "ghost", className: "text-red-500", onClick: () => handleDelete(m), children: /* @__PURE__ */ jsx3(Trash2, { className: "w-3 h-3" }) })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxs3(CardContent, { className: "px-4 pb-3 text-xs text-slate-600 space-y-1", children: [
            m.wall_material_subtype !== "concrete" && /* @__PURE__ */ jsxs3("div", { children: [
              "Size: ",
              m.wall_unit_length_inches,
              '"L \xD7 ',
              m.wall_unit_width_inches,
              '"W \xD7 ',
              m.wall_unit_height_inches,
              '"H'
            ] }),
            m.wall_material_subtype === "concrete" && /* @__PURE__ */ jsxs3("div", { children: [
              "Wall depth: ",
              m.wall_unit_width_inches,
              '"'
            ] }),
            /* @__PURE__ */ jsxs3("div", { children: [
              "Cost: $",
              parseFloat(m.cost_per_unit || 0).toFixed(2),
              " / unit"
            ] }),
            /* @__PURE__ */ jsxs3("div", { children: [
              "Texture: ",
              /* @__PURE__ */ jsx3("span", { className: "capitalize", children: m.wall_texture })
            ] }),
            m.supplier && /* @__PURE__ */ jsxs3("div", { children: [
              "Supplier: ",
              m.supplier
            ] })
          ] })
        ] }, m.id)) })
      ] }),
      /* @__PURE__ */ jsx3(TabsContent, { value: "equipment", children: /* @__PURE__ */ jsx3(Component, { allItems: items, loadItems, isAdmin: canEdit }) }),
      /* @__PURE__ */ jsx3(TabsContent, { value: "wall_cap", children: /* @__PURE__ */ jsx3(Component2, { allItems: items, FoundationInventoryEntity, loadItems, isAdmin: canEdit }) }),
      Object.keys(TAB_CONFIGS).map((tabKey) => /* @__PURE__ */ jsx3(TabsContent, { value: tabKey, children: /* @__PURE__ */ jsx3(
        GenericTab,
        {
          tabKey,
          items: byType(TAB_CONFIGS[tabKey].types),
          onAdd: () => openGenericAdd(tabKey),
          onEdit: (item) => openGenericEdit(tabKey, item),
          onDelete: handleDelete,
          isAdmin: canEdit
        }
      ) }, tabKey))
    ] }),
    /* @__PURE__ */ jsx3(Dialog, { open: showWallForm, onOpenChange: (open) => {
      if (!open) {
        setShowWallForm(false);
        setWallEditItem(null);
        setWallEditItemIsFill(false);
      }
    }, children: /* @__PURE__ */ jsxs3(DialogContent, { className: "max-w-lg max-h-[90vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsx3(DialogHeader, { children: /* @__PURE__ */ jsx3(DialogTitle, { children: wallEditItem ? wallEditItemIsFill ? "Edit Wall Fill" : "Edit Wall Material" : wallEditItemIsFill ? "Add Wall Fill" : "Add Wall Material" }) }),
      /* @__PURE__ */ jsx3(WallMaterialForm, { isFillMaterial: wallEditItemIsFill, item: wallEditItem, onSave: handleSaveWall, onCancel: () => {
        setShowWallForm(false);
        setWallEditItem(null);
        setWallEditItemIsFill(false);
      } })
    ] }) }),
    /* @__PURE__ */ jsx3(Dialog, { open: showGenericForm, onOpenChange: (open) => {
      if (!open) {
        setShowGenericForm(false);
        setGenericEditItem(null);
        setGenericTabKey(null);
      }
    }, children: /* @__PURE__ */ jsxs3(DialogContent, { className: "max-w-lg max-h-[90vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsx3(DialogHeader, { children: /* @__PURE__ */ jsx3(DialogTitle, { children: genericEditItem ? `Edit ${TAB_CONFIGS[genericTabKey]?.label}` : `Add ${TAB_CONFIGS[genericTabKey]?.label}` }) }),
      genericTabKey && /* @__PURE__ */ jsx3(GenericItemForm, { tabKey: genericTabKey, item: genericEditItem, onSave: handleSaveGeneric, onCancel: () => {
        setShowGenericForm(false);
        setGenericEditItem(null);
        setGenericTabKey(null);
      } })
    ] }) })
  ] });
}
export {
  GenericItemForm,
  FoundationInventoryPage as default
};
