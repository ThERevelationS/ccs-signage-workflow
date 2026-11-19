// .audit-work/foundation-o021-supports/stage/src/components/masterInventory/FoundationMaterialDialog.jsx
import { useState, useEffect, useRef } from "react";

// s:s://@/components/ui/dialog
import { jsx } from "react/jsx-runtime";
var Dialog = ({ open, children }) => open ? /* @__PURE__ */ jsx("div", { "data-dialog": "1", children }) : null;
var DialogContent = ({ children }) => /* @__PURE__ */ jsx("div", { children });
var DialogHeader = ({ children }) => /* @__PURE__ */ jsx("div", { children });
var DialogTitle = ({ children }) => /* @__PURE__ */ jsx("div", { children });
var DialogFooter = ({ children }) => /* @__PURE__ */ jsx("div", { children });

// s:s://@/components/ui/button
import { jsx as jsx2 } from "react/jsx-runtime";
var Button = ({ children, ...p }) => /* @__PURE__ */ jsx2("button", { ...p, children });

// s:s://@/components/ui/input
import { jsx as jsx3 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx3("input", { ...p });

// s:s://@/api/base44Client
var api = {
  auth: { me: async () => globalThis.__USER || { role: "admin" } },
  entities: new Proxy({}, { get: (t, k) => globalThis.__ENTITIES[k] })
};
var base44 = api;

// .audit-work/foundation-o021-supports/stage/src/components/masterInventory/foundationFieldSchema.js
var MATERIAL_TYPES = [
  { value: "concrete_service", label: "Ready-Mix Concrete" },
  { value: "bagged_concrete", label: "Bagged Concrete" },
  { value: "rebar", label: "Rebar" },
  // O-021 / CMP-B07: rebar supports (chairs / stands / bolsters) sit next to
  // rebar in every type picker — same reinforcement family, own catalog type.
  { value: "rebar_support", label: "Rebar Support" },
  { value: "forming_material", label: "Forming Material" },
  { value: "excavation_equipment", label: "Excavation Equipment" },
  { value: "pole", label: "Pole" },
  { value: "brick_stone", label: "Brick / Stone" },
  { value: "wall_material", label: "Wall Material" },
  { value: "wall_cap", label: "Wall Cap" },
  { value: "fill_material", label: "Fill Material" }
];
var COMMON = [
  { key: "material_name", label: "Name", type: "text" },
  { key: "material_description", label: "Description", type: "text" },
  { key: "supplier", label: "Supplier", type: "text" },
  { key: "unit", label: "Unit", type: "text" },
  { key: "cost_per_unit", label: "Cost per unit", type: "number" }
];
var BY_TYPE = {
  concrete_service: [
    { key: "minimum_order_yards", label: "Min order (CY)", type: "number" },
    { key: "below_minimum_cost_per_cy", label: "Below-min $/CY", type: "number" },
    { key: "fuel_surcharge", label: "Fuel surcharge", type: "number" }
  ],
  bagged_concrete: [{ key: "minimum_cost", label: "Minimum cost", type: "number" }],
  rebar: [{ key: "rebar_size", label: "Rebar size (e.g. #4)", type: "text" }],
  // O-021 / CMP-B07: the ten rebar_support_* catalog fields plus the COMMON
  // name/description/supplier/unit/cost_per_unit row. Field descriptor types:
  //   • "select" — renders a native <select> with the given options plus a
  //     blank option that clears the field to null (untyped, never guessed);
  //     a stored value outside the options list is shown verbatim.
  //   • "list"   — a comma-separated text draft parsed into a string array on
  //     save via listFieldValue (blank clears to [] = "unknown, not
  //     universal"; a stored non-string/non-array value passes through
  //     verbatim so validation can report it).
  rebar_support: [
    {
      key: "rebar_support_kind",
      label: "Kind",
      type: "select",
      options: [
        { value: "chair", label: "Chair" },
        { value: "stand", label: "Stand" },
        { value: "bolster", label: "Bolster" }
      ]
    },
    { key: "rebar_support_height_inches", label: "Height (in)", type: "number" },
    { key: "rebar_support_height_min_inches", label: "Height min (in, adjustable)", type: "number" },
    { key: "rebar_support_height_max_inches", label: "Height max (in, adjustable)", type: "number" },
    { key: "rebar_support_footprint_length_inches", label: "Footprint length (in)", type: "number" },
    { key: "rebar_support_footprint_width_inches", label: "Footprint width (in)", type: "number" },
    { key: "rebar_support_material", label: "Material (steel / plastic / concrete)", type: "text" },
    { key: "rebar_support_pack_size", label: "Pack size (units per pack)", type: "number" },
    { key: "rebar_support_compatible_bar_sizes", label: "Compatible bar sizes (comma-separated, e.g. #3, #4)", type: "list" },
    { key: "rebar_support_placement_notes", label: "Placement notes / constraints", type: "text" }
  ],
  forming_material: [
    { key: "lumber_size", label: "Lumber size", type: "text" },
    { key: "thickness_inches", label: "Thickness (in)", type: "number" }
  ],
  excavation_equipment: [
    { key: "cost_per_day", label: "$/day", type: "number" },
    { key: "cost_per_week", label: "$/week", type: "number" },
    { key: "cost_per_month", label: "$/month", type: "number" },
    { key: "pickup_delivery_cost", label: "Delivery cost", type: "number" },
    { key: "rental_company", label: "Rental company", type: "text" }
  ],
  pole: [
    { key: "pole_shape", label: "Shape (square/round)", type: "text" },
    { key: "pole_width_inches", label: "Width (in)", type: "number" },
    { key: "pole_wall_thickness_inches", label: "Wall thickness (in)", type: "number" },
    { key: "pole_stock_length_ft", label: "Stock length (ft)", type: "number" },
    { key: "pole_stock_price", label: "Stock price", type: "number" },
    { key: "pole_pricing_mode", label: "Pricing (per_foot / stock_price)", type: "text" },
    { key: "paint_rate_per_linear_ft", label: "Paint $/linear ft", type: "number" }
  ],
  brick_stone: [
    { key: "brick_length_inches", label: "Length (in)", type: "number" },
    { key: "brick_width_inches", label: "Width (in)", type: "number" },
    { key: "brick_height_inches", label: "Height (in)", type: "number" },
    { key: "brick_color", label: "Color", type: "text" }
  ],
  wall_material: [
    { key: "wall_unit_length_inches", label: "Unit length (in)", type: "number" },
    { key: "wall_unit_width_inches", label: "Unit width (in)", type: "number" },
    { key: "wall_unit_height_inches", label: "Unit height (in)", type: "number" },
    { key: "wall_color", label: "Color", type: "text" }
  ],
  wall_cap: [
    { key: "cap_stock_length_inches", label: "Stock length (in)", type: "number" },
    { key: "cap_width_inches", label: "Width (in)", type: "number" },
    { key: "cap_height_inches", label: "Height (in)", type: "number" },
    { key: "cap_stock_price", label: "Stock price", type: "number" },
    { key: "cap_profile", label: "Profile", type: "text" }
  ],
  fill_material: [{ key: "fill_material_subtype", label: "Subtype", type: "text" }]
};
var fieldsFor = (type) => [...COMMON, ...BY_TYPE[type] || []];
var listFieldDraft = (value) => Array.isArray(value) ? value.join(", ") : value ?? "";
var listFieldValue = (value) => typeof value === "string" ? value.split(",").map((token) => token.trim()).filter(Boolean) : value;

// s:s://@/components/estimator/builder/builderEntityPersistence
var expectedEntityFields = () => ({});
var replaceEntityFieldsIfUnchanged = async ({ entity, id, nextFields }) => {
  globalThis.__CALLS.push({ op: "replaceFields", id, nextFields });
  return entity.update(id, nextFields);
};

// s:s://@/components/masterInventory/inventoryPersistence
var createInventoryRecordWithRecovery = async ({ entity, data }) => {
  globalThis.__CALLS.push({ op: "createRecord", data });
  return entity.create(data);
};

// .audit-work/foundation-o021-supports/stage/src/components/masterInventory/inventoryNormalization.js
var inventoryNumberInput = (value) => String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;

// .audit-work/foundation-o021-supports/stage/src/components/masterInventory/FoundationMaterialDialog.jsx
import { jsx as jsx4, jsxs } from "react/jsx-runtime";
function FoundationMaterialDialog({ open, record, defaultType, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(false);
  useEffect(() => {
    if (open) {
      setForm(record || { material_type: defaultType, show_in_foundation: true });
    }
  }, [open, record, defaultType]);
  const type = form.material_type || defaultType;
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const handleSave = async () => {
    if (!form.material_name?.trim() || saveRef.current) return;
    saveRef.current = true;
    setSaving(true);
    try {
      const id = form.id;
      const updated_date = form.updated_date;
      const data = { ...form };
      ["id", "created_date", "updated_date", "created_by_id", "created_by"].forEach((key) => delete data[key]);
      data.material_type = type;
      data.show_in_foundation = true;
      for (const f of fieldsFor(type)) {
        if (f.type === "list") data[f.key] = listFieldValue(data[f.key]);
      }
      if (id) {
        const live = await base44.entities.FoundationInventory.get(id);
        if (!live) {
          alert("This Foundation Catalog item no longer exists. The catalog will reload.");
          onSaved();
          return;
        }
        if (updated_date && live.updated_date && updated_date !== live.updated_date) {
          alert("This Foundation Catalog item changed in another session. Your changes were not saved; the latest catalog will reload.");
          onSaved();
          return;
        }
        await replaceEntityFieldsIfUnchanged({
          entity: base44.entities.FoundationInventory,
          id,
          expectedUpdatedAt: live.updated_date || "",
          expectedFields: expectedEntityFields(live, data),
          nextFields: data,
          label: "Foundation Catalog item"
        });
      } else {
        await createInventoryRecordWithRecovery({
          entity: base44.entities.FoundationInventory,
          data,
          nameField: "material_name",
          label: `Foundation Catalog item \u201C${data.material_name || "Material"}\u201D`
        });
      }
      onSaved();
    } catch (error) {
      console.error("Foundation Catalog save failed:", error);
      alert(error?.message || "Foundation Catalog item could not be saved.");
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsx4(Dialog, { open, onOpenChange: (o) => !o && !saving && onClose(), children: /* @__PURE__ */ jsxs(DialogContent, { className: "sm:max-w-xl max-h-[85vh] overflow-y-auto", children: [
    /* @__PURE__ */ jsx4(DialogHeader, { children: /* @__PURE__ */ jsx4(DialogTitle, { children: record?.id ? "Edit Material" : "New Material" }) }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-3 py-1", children: [
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 block", children: [
        "Material type",
        /* @__PURE__ */ jsx4(
          "select",
          {
            value: type,
            onChange: (e) => set({ material_type: e.target.value }),
            className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm",
            children: MATERIAL_TYPES.map((t) => /* @__PURE__ */ jsx4("option", { value: t.value, children: t.label }, t.value))
          }
        )
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: fieldsFor(type).map((f) => /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
        f.label,
        f.type === "select" ? /* @__PURE__ */ jsxs(
          "select",
          {
            value: form[f.key] ?? "",
            onChange: (e) => set({ [f.key]: e.target.value === "" ? null : e.target.value }),
            className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm",
            children: [
              /* @__PURE__ */ jsx4("option", { value: "", children: "\u2014" }),
              (f.options || []).map((o) => /* @__PURE__ */ jsx4("option", { value: o.value, children: o.label }, o.value)),
              form[f.key] !== null && form[f.key] !== void 0 && form[f.key] !== "" && !(f.options || []).some((o) => o.value === form[f.key]) && /* @__PURE__ */ jsx4("option", { value: form[f.key], children: String(form[f.key]) })
            ]
          }
        ) : f.type === "list" ? /* @__PURE__ */ jsx4(
          Input,
          {
            type: "text",
            value: listFieldDraft(form[f.key]),
            onChange: (e) => set({ [f.key]: e.target.value })
          }
        ) : /* @__PURE__ */ jsx4(
          Input,
          {
            type: f.type,
            value: form[f.key] ?? "",
            onChange: (e) => set({ [f.key]: f.type === "number" ? inventoryNumberInput(e.target.value) : e.target.value })
          }
        )
      ] }, f.key)) }),
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 block", children: [
        "Notes",
        /* @__PURE__ */ jsx4(Input, { value: form.notes ?? "", onChange: (e) => set({ notes: e.target.value }) })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 block", children: [
        "Image URL ",
        /* @__PURE__ */ jsx4("span", { className: "font-normal text-gray-400", children: "(optional)" }),
        /* @__PURE__ */ jsx4(Input, { value: form.image_url ?? "", onChange: (e) => set({ image_url: e.target.value }), placeholder: "https://\u2026" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(DialogFooter, { children: [
      /* @__PURE__ */ jsx4(Button, { variant: "outline", onClick: onClose, disabled: saving, children: "Cancel" }),
      /* @__PURE__ */ jsx4(
        Button,
        {
          onClick: handleSave,
          disabled: saving || !form.material_name?.trim(),
          className: "bg-red-600 hover:bg-red-700 text-white",
          children: saving ? "Saving\u2026" : "Save"
        }
      )
    ] })
  ] }) });
}
export {
  FoundationMaterialDialog as default
};
