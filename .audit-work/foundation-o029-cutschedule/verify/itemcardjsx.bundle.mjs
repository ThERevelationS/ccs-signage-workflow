// .audit-work/foundation-o029-cutschedule/verify/stubs/ui.js
var stub = (name) => {
  const fn = (props) => ({ type: "ui", props: { ...props || {}, uiComponent: name } });
  return fn;
};
var Input = stub("Input");
var Button = stub("Button");
var Label = stub("Label");
var Badge = stub("Badge");
var Tabs = stub("Tabs");
var TabsContent = stub("TabsContent");
var TabsList = stub("TabsList");
var TabsTrigger = stub("TabsTrigger");
var Select = stub("Select");
var SelectContent = stub("SelectContent");
var SelectItem = stub("SelectItem");
var SelectTrigger = stub("SelectTrigger");
var SelectValue = stub("SelectValue");
var Card = stub("Card");
var CardContent = stub("CardContent");
var CardHeader = stub("CardHeader");
var CardTitle = stub("CardTitle");
var Dialog = stub("Dialog");
var DialogContent = stub("DialogContent");
var DialogHeader = stub("DialogHeader");
var DialogTitle = stub("DialogTitle");
var DialogDescription = stub("DialogDescription");
var Switch = stub("Switch");
var Checkbox = stub("Checkbox");
var Textarea = stub("Textarea");

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

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/masterInventory/inventoryNormalization.js
var inventoryNumberInput = (value) => String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationCatalogIntegrity.js
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementCost.js
var STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementCutSchedule.js
var STEEL_ROLES2 = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
var ROLE_SHAPES = Object.freeze({
  horizontal: "straight",
  longitudinal: "straight",
  hoop: "hoop",
  inter_mat_tie: "as_authored"
});

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationCalc.js
var num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
var money = (n) => `$${num(n).toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// .audit-work/foundation-o029-cutschedule/verify/stubs/jsx-runtime.js
var jsx = (type, props) => ({ type, props: props || {} });
var jsxs = jsx;
var Fragment = "Fragment";

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/FoundationItemCard.jsx
var amt = (v) => hasFoundationCostSnapshot(v) ? money(v) : "Not saved";
var num2 = (v) => Number.isFinite(v) ? v.toFixed(2) : "Not saved";
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
          num2(item.concrete_volume_cy),
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
      isPillar ? /* @__PURE__ */ jsx(Field, { label: "Diameter (in)", type: "number", value: item.diameter ?? 0, onChange: numSet("diameter") }) : /* @__PURE__ */ jsxs(Fragment, { children: [
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
      isPillar ? /* @__PURE__ */ jsxs(Fragment, { children: [
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
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
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
    !legacyReinforcement && /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600", children: item.reinforcement_calculation_version === 2 ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "Version 2 reinforcement uses the accepted design. Edit geometry and pricing through the controlled proposal below.",
      " ",
      /* @__PURE__ */ jsxs("span", { className: "font-semibold text-gray-800", children: [
        "Physical ",
        num2(item.rebar_geometry_feet),
        " ft / priced ",
        num2(item.rebar_feet),
        " ft - ",
        amt(item.rebar_cost)
      ] }),
      Number.isFinite(item.support_count) && item.support_count > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        " \xB7 Supports: ",
        item.support_count,
        " required",
        Number.isFinite(item.support_purchased_units) && item.support_purchased_units !== item.support_count ? ` / ${item.support_purchased_units} purchased` : "",
        " - ",
        amt(item.support_cost)
      ] })
    ] }) : /* @__PURE__ */ jsx(Fragment, { children: "Unsupported reinforcement version. Reload before changing reinforcement pricing." }) }),
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
export {
  FoundationItemCard as default
};
