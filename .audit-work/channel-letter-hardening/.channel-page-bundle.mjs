// frozen:/app/src/pages/ChannelLetterEstimator.jsx
import React25, { useState as useState10, useEffect as useEffect7, useCallback as useCallback4, useMemo as useMemo7 } from "react";

// s:s://@/api/base44Client
var fail = () => {
  globalThis.__unexpectedSdk++;
  throw Error("Unexpected SDK access in the channel page proof");
};
var entity = new Proxy({}, { get: () => fail });
var base44 = { functions: { invoke: async () => {
  throw Error("offline invoke blocked");
} }, entities: new Proxy({}, { get: () => entity }) };

// s:s://@/api/gatedEntities
var Settings = globalThis.__entSettings ||= { __ent: "settings" };
var ChannelLetterInstallInventory = globalThis.__entInv ||= { __ent: "inv" };
var ChannelLetterInstallEquipment = globalThis.__entEquip ||= { __ent: "equip" };
var DimensionalLetterMaterial = globalThis.__entDim ||= { __ent: "dim" };
var ChannelLetterInstallation = {
  get: async (id) => {
    globalThis.__spies.push(["projectGet", id]);
    return globalThis.__project ?? null;
  }
};

// frozen:/app/src/pages/ChannelLetterEstimator.jsx
import { useNavigate, useSearchParams, Link as Link7 } from "react-router-dom";

// s:s://@/utils
var createPageUrl = (p) => "/" + p;

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

// s:s://@/components/ui/tabs
import { jsx as jsx6 } from "react/jsx-runtime";
var Tabs = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var TabsContent = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var TabsList = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var TabsTrigger = (p) => /* @__PURE__ */ jsx6("button", { type: "button", onClick: p.onClick, children: p.children });

// s:s://lucide-react
var Check = () => null;
var Zap = () => null;
var Navigation = () => null;
var ArrowDownToLine = () => null;
var Mountain = () => null;
var AlertTriangle = () => null;
var AlertCircle = () => null;
var CheckCircle2 = () => null;
var BarChart3 = () => null;
var ChevronDown = () => null;
var ChevronUp = () => null;
var Router = () => null;
var Search = () => null;
var ArrowUpDown = () => null;
var Box = () => null;
var Paintbrush = () => null;
var Calculator = () => null;
var Sparkles = () => null;
var Link = () => null;
var RefreshCw = () => null;
var Users = () => null;
var HardHat = () => null;
var Trash2 = () => null;
var Layers = () => null;
var X = () => null;
var Plus = () => null;
var Clock = () => null;
var ChevronRight = () => null;
var Copy = () => null;
var Sliders = () => null;
var Save = () => null;
var FileDown = () => null;
var TrendingUp = () => null;
var GripVertical = () => null;
var ArrowUpToLine = () => null;
var Link2 = () => null;
var GitBranch = () => null;
var CornerDownRight = () => null;
var Type = () => null;
var Truck = () => null;
var Receipt = () => null;
var Info = () => null;
var Settings2 = () => null;
var ArrowUp = () => null;
var Package = () => null;
var Loader2 = () => null;
var ImageIcon = () => null;
var Wand2 = () => null;
var ListChecks = () => null;
var MapPin = () => null;
var Wrench = () => null;
var DollarSign = () => null;
var ArrowLeft = () => null;
var FileText = () => null;
var Boxes = () => null;
var Camera = () => null;
var HelpCircle = () => null;

// s:s://@/components/channelLetterInstall/ChannelLetterHelpAssistant
var ChannelLetterHelpAssistant_default = () => null;

// s:s://@/components/UnsavedChangesContext
var useUnsavedChanges = () => ({ setIsDirty: () => {
}, isDirty: false });

// s:s://@/components/auth/EmailGate
var useAuth = () => ({ sessionToken: "tok", user: null });
var getSessionToken = () => "tok";

// s:s://@/components/ClientSearchInput
import { jsx as jsx7 } from "react/jsx-runtime";
var ClientSearchInput_default = (p) => /* @__PURE__ */ jsx7("input", { value: p.value || "", onChange: (e) => p.onChange?.(e.target.value), placeholder: p.placeholder });

// frozen:/app/src/components/channelLetterInstall/InstallSummaryCard.jsx
import React2 from "react";

// frozen:/app/src/components/channelLetterInstall/CostBreakdownBar.jsx
import React from "react";
import { jsx as jsx8, jsxs } from "react/jsx-runtime";
function CostBreakdownBar({ segments, labor, materials }) {
  let segs = segments;
  let dark = true;
  if (!segs && (labor != null || materials != null)) {
    segs = [
      { label: "Labor", value: labor || 0, color: "bg-purple-400" },
      { label: "Materials", value: materials || 0, color: "bg-emerald-400" }
    ];
    dark = false;
  }
  segs = segs || [];
  const total = segs.reduce((s, x) => s + (parseFloat(x.value) || 0), 0);
  const trackClass = dark ? "bg-white/10" : "bg-slate-100";
  const legendClass = dark ? "text-slate-300" : "text-slate-500";
  if (total <= 0) {
    return /* @__PURE__ */ jsx8("div", { className: `h-2 w-full rounded-full ${trackClass}` });
  }
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsx8("div", { className: `h-2 w-full rounded-full ${trackClass} overflow-hidden flex`, children: segs.map((s, i) => {
      const v = parseFloat(s.value) || 0;
      if (v <= 0) return null;
      const pct = v / total * 100;
      return /* @__PURE__ */ jsx8(
        "div",
        {
          className: `${s.color} transition-all`,
          style: { width: `${pct}%` },
          title: `${s.label}: ${pct.toFixed(0)}%`
        },
        i
      );
    }) }),
    /* @__PURE__ */ jsx8("div", { className: `flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] ${legendClass}`, children: segs.filter((s) => (parseFloat(s.value) || 0) > 0).map((s, i) => {
      const pct = (parseFloat(s.value) || 0) / total * 100;
      return /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1", children: [
        /* @__PURE__ */ jsx8("span", { className: `w-1.5 h-1.5 rounded-full ${s.color}` }),
        s.label,
        " ",
        pct.toFixed(0),
        "%"
      ] }, i);
    }) })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/InstallSummaryCard.jsx
import { jsx as jsx9, jsxs as jsxs2 } from "react/jsx-runtime";
var fmt = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
function InstallSummaryCard({
  project,
  onUpdate,
  onSave,
  isSaving,
  isEditing,
  onCopySummary,
  onExportCSV
}) {
  const itemsCount = (project.items || []).length;
  const labor = project.labor_cost;
  const laborViaCrew = !!project.labor_priced_via_personnel;
  const laborInSubtotal = laborViaCrew ? 0 : labor;
  const materials = project.total_materials_cost;
  const equipment = project.total_equipment_cost;
  const personnel = project.total_personnel_cost;
  const travel = project.total_travel_cost;
  const letters = project.total_letters_cost;
  const subtotal = project.subtotal;
  const total = project.total_cost;
  const showSeg = (v) => v === null || Number.isFinite(v) && v > 0;
  const segments = [
    { label: "Labor", value: laborInSubtotal, color: "bg-purple-400" },
    { label: "Materials", value: materials, color: "bg-emerald-400" },
    { label: "Equipment", value: equipment, color: "bg-amber-400" },
    { label: "Personnel", value: personnel, color: "bg-sky-400" },
    { label: "Travel", value: travel, color: "bg-orange-400" },
    { label: "Letters", value: letters, color: "bg-pink-400" }
  ].map((s) => ({ ...s, value: Number.isFinite(s.value) ? s.value : 0 }));
  return /* @__PURE__ */ jsxs2(Card, { className: "border-0 shadow-xl sticky top-8 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white", children: [
    /* @__PURE__ */ jsx9("div", { className: "px-5 pt-5 pb-4 bg-gradient-to-br from-purple-600/30 to-transparent", children: /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2 mb-1", children: [
      /* @__PURE__ */ jsx9("div", { className: "w-8 h-8 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center", children: /* @__PURE__ */ jsx9(Calculator, { className: "w-4 h-4 text-purple-200" }) }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx9("div", { className: "text-sm font-semibold tracking-wide", children: "Estimate Summary" }),
        /* @__PURE__ */ jsxs2("div", { className: "text-[11px] text-slate-300", children: [
          itemsCount,
          " item",
          itemsCount !== 1 ? "s" : "",
          (project.letter_purchases || []).length > 0 && ` \xB7 ${project.letter_purchases.length} letter line${project.letter_purchases.length !== 1 ? "s" : ""}`
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-4 pt-2 pb-5 px-5", children: [
      project.__held && /* @__PURE__ */ jsx9("p", { className: "text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-md px-2.5 py-1.5", children: "Saved amounts (not current pricing) \u2014 fix the flagged values to reprice." }),
      /* @__PURE__ */ jsxs2("div", { className: "space-y-1.5 text-sm", children: [
        !laborViaCrew && /* @__PURE__ */ jsx9(Row, { label: `Labor (${Number.isFinite(project.labor_hours) ? project.labor_hours.toFixed(2) : "\u2014"} hrs)`, value: labor, dot: "bg-purple-400" }),
        /* @__PURE__ */ jsx9(Row, { label: "Materials", value: materials, dot: "bg-emerald-400" }),
        showSeg(equipment) && /* @__PURE__ */ jsx9(Row, { label: `Equipment (${(project.selected_equipment || []).length})`, value: equipment, dot: "bg-amber-400" }),
        showSeg(personnel) && /* @__PURE__ */ jsx9(
          Row,
          {
            label: laborViaCrew ? `Crew Labor (${(project.personnel || []).length} crew \xB7 ${Number.isFinite(project.labor_hours) ? project.labor_hours.toFixed(2) : "\u2014"} hrs)` : `Personnel (${(project.personnel || []).length})`,
            value: personnel,
            dot: "bg-sky-400"
          }
        ),
        showSeg(travel) && /* @__PURE__ */ jsx9(Row, { label: `Travel (${(parseFloat(project.travel_miles_round_trip) || 0).toFixed(1)} mi)`, value: travel, dot: "bg-orange-400" }),
        showSeg(letters) && /* @__PURE__ */ jsx9(Row, { label: `Letters (${(project.letter_purchases || []).length})`, value: letters, dot: "bg-pink-400" }),
        /* @__PURE__ */ jsxs2("div", { className: "flex justify-between border-t border-white/10 pt-2 mt-2", children: [
          /* @__PURE__ */ jsx9("span", { className: "text-slate-300", children: "Subtotal" }),
          /* @__PURE__ */ jsx9("span", { className: "font-semibold tabular-nums", children: fmt(subtotal) })
        ] })
      ] }),
      Number.isFinite(subtotal) && subtotal > 0 && /* @__PURE__ */ jsxs2("div", { className: "bg-white/5 rounded-lg p-3 space-y-2 border border-white/5", children: [
        /* @__PURE__ */ jsx9("div", { className: "flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400", children: /* @__PURE__ */ jsxs2("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsx9(TrendingUp, { className: "w-3 h-3" }),
          " Where the money goes"
        ] }) }),
        /* @__PURE__ */ jsx9(CostBreakdownBar, { segments })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl px-4 py-3 shadow-lg border border-purple-400/30", children: [
        /* @__PURE__ */ jsx9("div", { className: "text-[10px] text-purple-100 uppercase tracking-widest font-semibold", children: "Subtotal (Before Markup)" }),
        /* @__PURE__ */ jsx9("div", { className: "text-3xl font-bold tabular-nums leading-tight", children: fmt(Number.isFinite(subtotal) ? subtotal : total) }),
        /* @__PURE__ */ jsxs2("div", { className: "text-[10px] text-purple-200 mt-0.5", children: [
          "See ",
          /* @__PURE__ */ jsx9("span", { className: "font-semibold", children: "Customer Pricing" }),
          " tab for tier-based pricing."
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "space-y-2 pt-1", children: [
        project?.updated_date && /* @__PURE__ */ jsxs2("div", { className: "mt-1 text-[10px] text-gray-400", children: [
          "Last saved ",
          new Date(project.updated_date).toLocaleString()
        ] }),
        /* @__PURE__ */ jsxs2(
          Button,
          {
            onClick: onSave,
            disabled: isSaving,
            className: "w-full bg-green-500 hover:bg-green-600 text-white h-11 shadow-md",
            children: [
              /* @__PURE__ */ jsx9(Save, { className: "w-4 h-4 mr-2" }),
              isSaving ? "Saving..." : isEditing ? "Update Estimate" : "Save Estimate"
            ]
          }
        ),
        /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxs2(
            Button,
            {
              variant: "outline",
              onClick: onCopySummary,
              className: "h-9 text-xs bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white",
              children: [
                /* @__PURE__ */ jsx9(Copy, { className: "w-3.5 h-3.5 mr-1" }),
                " Copy"
              ]
            }
          ),
          /* @__PURE__ */ jsxs2(
            Button,
            {
              variant: "outline",
              onClick: onExportCSV,
              className: "h-9 text-xs bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white",
              children: [
                /* @__PURE__ */ jsx9(FileDown, { className: "w-3.5 h-3.5 mr-1" }),
                " CSV"
              ]
            }
          )
        ] })
      ] })
    ] })
  ] });
}
var Row = ({ label, value, dot }) => /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center", children: [
  /* @__PURE__ */ jsxs2("span", { className: "text-slate-300 flex items-center gap-2", children: [
    /* @__PURE__ */ jsx9("span", { className: `w-1.5 h-1.5 rounded-full ${dot}` }),
    label
  ] }),
  /* @__PURE__ */ jsx9("span", { className: "font-medium tabular-nums", children: fmt(value) })
] });

// frozen:/app/src/components/channelLetterInstall/ItemsList.jsx
import React11 from "react";

// s:s://@hello-pangea/dnd
var DragDropContext = (p) => p.children;
var Droppable = (p) => p.children({ droppableProps: {}, innerRef: () => {
}, placeholder: null });
var Draggable = (p) => p.children({ draggableProps: {}, dragHandleProps: {}, innerRef: () => {
} }, { isDragging: false });

// frozen:/app/src/components/channelLetterInstall/InstallLineItem.jsx
import React10, { useState as useState4, useEffect as useEffect2 } from "react";

// s:s://@/components/ui/badge
import { jsx as jsx10 } from "react/jsx-runtime";
var Badge = (p) => /* @__PURE__ */ jsx10("span", { ...p, children: p.children });

// frozen:/app/src/components/channelLetterInstall/MaterialsList.jsx
import React3, { useState } from "react";

// s:s://@/components/ui/select
import { jsx as jsx11 } from "react/jsx-runtime";
var Select = (p) => /* @__PURE__ */ jsx11("div", { children: p.children });
var SelectTrigger = (p) => /* @__PURE__ */ jsx11("div", { children: p.children });
var SelectValue = () => /* @__PURE__ */ jsx11("span", {});
var SelectContent = (p) => /* @__PURE__ */ jsx11("div", { children: p.children });
var SelectItem = (p) => /* @__PURE__ */ jsx11("div", { children: p.children });

// frozen:/app/src/components/channelLetterInstall/wallMaterials.jsx
var WALL_MATERIALS = [
  { id: "eifs", label: "EIFS / Stucco Synthetic", description: "Synthetic stucco over foam", settingKey: "install_wall_eifs_multiplier", default: 1 },
  { id: "brick", label: "Brick Veneer", description: "Standard brick facade", settingKey: "install_wall_brick_multiplier", default: 1.2 },
  { id: "cmu", label: "CMU / Cinder Block", description: "Concrete masonry units", settingKey: "install_wall_cmu_multiplier", default: 1.15 },
  { id: "poured_concrete", label: "Concrete", description: "Solid concrete wall / tilt-up", settingKey: "install_wall_concrete_multiplier", default: 1.3 },
  { id: "metal_panel", label: "Metal Panel", description: "Insulated or single-skin metal", settingKey: "install_wall_metal_panel_multiplier", default: 1 },
  { id: "acm", label: "ACM / Composite Panel", description: "Aluminum composite cladding", settingKey: "install_wall_acm_multiplier", default: 1.05 },
  { id: "wood_siding", label: "Wood Siding", description: "Lap, shake, or board siding", settingKey: "install_wall_wood_multiplier", default: 0.95 },
  { id: "vinyl_siding", label: "Vinyl Siding", description: "PVC lap siding", settingKey: "install_wall_vinyl_multiplier", default: 0.95 },
  { id: "stone_veneer", label: "Stone Veneer", description: "Natural or manufactured stone", settingKey: "install_wall_stone_multiplier", default: 1.3 },
  { id: "drywall_interior", label: "Drywall (Interior)", description: "Interior gypsum board", settingKey: "install_wall_drywall_multiplier", default: 0.9 },
  { id: "plywood_substrate", label: "Plywood / OSB", description: "Wood sheathing substrate", settingKey: "install_wall_plywood_multiplier", default: 0.95 },
  { id: "other", label: "Other / Unknown", description: "Custom or unspecified surface", settingKey: "install_wall_other_multiplier", default: 1.1 }
];
var WALL_MATERIAL_MAP = WALL_MATERIALS.reduce((acc, m) => {
  acc[m.id] = m;
  return acc;
}, {});
var getWallMaterialMultiplier = (wallMaterialId, settings) => {
  if (!wallMaterialId) return 1;
  const def = WALL_MATERIAL_MAP[wallMaterialId];
  if (!def) return 1;
  const v = parseFloat(settings?.[def.settingKey]);
  return isNaN(v) ? def.default : v;
};

// frozen:/app/src/components/channelLetterInstall/installSizeRates.jsx
var heightBucketFor = (heightFt) => {
  const h = parseFloat(heightFt) || 0;
  if (h <= 12) return "h0_12";
  if (h <= 20) return "h12_20";
  if (h <= 30) return "h20_30";
  return "h30plus";
};
var normalizeEnv = (env) => env === "interior" ? "interior" : "exterior";
var TYPE_PREFIXES = {
  flush_mount: { drill: "install_drill_rate_", prep: "install_prep_rate_", elec: "install_electrical_rate_" },
  halo_lit: { drill: "install_halo_drill_rate_", prep: "install_halo_prep_rate_", elec: "install_halo_electrical_rate_" },
  dimensional_lettering: { drill: "install_dimensional_drill_rate_", prep: "install_dimensional_prep_rate_", elec: null }
};
var qualifiedKey = (prefix, size, env, heightBucket) => `${prefix}${size}__${normalizeEnv(env)}__${heightBucket}`;
var resolveRateMinutes = (settings, prefix, size, env, heightBucket, fallbackDefault = 0) => {
  if (!prefix) return 0;
  const qk = qualifiedKey(prefix, size, env, heightBucket);
  const qv = parseFloat(settings[qk]);
  if (!isNaN(qv)) return qv;
  const legacy = parseFloat(settings[`${prefix}${size}`]);
  if (!isNaN(legacy)) return legacy;
  return fallbackDefault;
};

// frozen:/app/src/components/channelLetterInstall/installCalculator.jsx
var TYPE_LABELS = {
  flush_mount: "Flush Mount",
  halo_lit: "Halo-Lit",
  raceway: "Raceway",
  dimensional_lettering: "Dimensional Lettering",
  dimensional_lettering_with_backer: "Dimensional Lettering + Backer"
};
var SIZE_LABELS = {
  extra_small: 'XS (2"-8")',
  small: 'Small (8"-12")',
  medium: 'Medium (12"-24")',
  large: 'Large (24"-48")',
  extra_large: 'XL (48"-60")',
  extra_extra_large: 'XXL (60"+)'
};
var emptyLineItem = () => ({
  description: "",
  installation_type: "flush_mount",
  qty_letters: 10,
  letter_size: "medium",
  letter_height_inches: 24,
  installation_height_feet: 12,
  raceway_length_feet: 0,
  wall_material: "eifs",
  thick_hollow_walls: false,
  parapet: false,
  parapet_electrical_routing: "roof",
  poor_electrical_access: false,
  poor_electrical_severity: 1,
  escort_required: false,
  badging_checkin: false,
  after_hours_weekend: false,
  set_hours_installation: false,
  poor_site_access: false,
  poor_site_access_severity: 1,
  materials: []
});
var defaultMaterialsForItem = (item, inventory) => {
  return (inventory || []).filter((inv) => {
    if (!inv.is_default) return false;
    if (inv.pricing_mode === "per_raceway_foot") return false;
    const list = Array.isArray(inv.applies_to_list) ? inv.applies_to_list : [];
    if (list.length > 0) return list.includes(item.installation_type);
    if (!inv.applies_to || inv.applies_to === "all") return true;
    return inv.applies_to === item.installation_type;
  }).map((inv) => materialFromInventory(inv, item));
};
var materialFromInventory = (inv, item) => {
  const m = {
    inventory_item_id: inv.id,
    item_name: inv.item_name,
    pricing_mode: inv.pricing_mode,
    unit_cost: 0,
    quantity: 0,
    total_cost: 0
  };
  if (inv.pricing_mode === "per_letter_flat") {
    m.unit_cost = parseFloat(inv.cost_per_letter) || 0;
    m.quantity = parseFloat(item.qty_letters) || 0;
  } else if (inv.pricing_mode === "per_letter_by_size") {
    const sizeKey = `cost_${item.letter_size}`;
    m.unit_cost = parseFloat(inv[sizeKey]) || 0;
    m.quantity = parseFloat(item.qty_letters) || 0;
  } else if (inv.pricing_mode === "per_raceway_foot") {
    m.unit_cost = parseFloat(inv.cost_per_foot) || 0;
    m.quantity = parseFloat(item.raceway_length_feet) || 0;
  } else if (inv.pricing_mode === "per_project_flat") {
    m.unit_cost = parseFloat(inv.cost_flat) || 0;
    m.quantity = 1;
  }
  m.total_cost = m.unit_cost * m.quantity;
  return m;
};
var calcLineItem = (item, settings, inventory) => {
  const laborRate = parseFloat(settings.install_labor_rate) || 65;
  const MIN_TO_HR = 1 / 60;
  const TYPE_DEFAULTS = {
    flush_mount: {
      extra_small: [15, 30, 5],
      small: [30, 60, 10],
      medium: [50, 100, 15],
      large: [80, 160, 20],
      extra_large: [120, 240, 25],
      extra_extra_large: [170, 340, 30]
    },
    halo_lit: {
      extra_small: [15, 30, 5],
      small: [30, 60, 10],
      medium: [50, 100, 15],
      large: [80, 160, 20],
      extra_large: [120, 240, 25],
      extra_extra_large: [170, 340, 30]
    },
    dimensional_lettering: {
      extra_small: [10, 20, 0],
      small: [20, 45, 0],
      medium: [40, 80, 0],
      large: [65, 130, 0],
      extra_large: [100, 200, 0],
      extra_extra_large: [140, 280, 0]
    }
  };
  const env = normalizeEnv(item.install_environment || settings._project_install_environment || "exterior");
  const heightBucket = heightBucketFor(item.installation_height_feet);
  const sizeMinutesForType = (type, size) => {
    const prefixes = TYPE_PREFIXES[type];
    const defs = TYPE_DEFAULTS[type]?.[size] || [50, 100, 15];
    if (!prefixes) return defs[0] + defs[1] + defs[2];
    const d = resolveRateMinutes(settings, prefixes.drill, size, env, heightBucket, defs[0]);
    const p = resolveRateMinutes(settings, prefixes.prep, size, env, heightBucket, defs[1]);
    const e = prefixes.elec ? resolveRateMinutes(settings, prefixes.elec, size, env, heightBucket, defs[2]) : 0;
    return d + p + e;
  };
  const rateType = item.installation_type === "dimensional_lettering_with_backer" ? "dimensional_lettering" : item.installation_type;
  let baseHours = 0;
  if (rateType === "raceway") {
    const basePerFt = (parseFloat(settings.install_raceway_base_minutes_per_foot) || 30) * MIN_TO_HR;
    const extraPerFt = (parseFloat(settings.install_raceway_extra_minutes_per_foot) || 0) * MIN_TO_HR;
    const racewayHoursPerFoot = basePerFt + extraPerFt;
    baseHours = (parseFloat(item.raceway_length_feet) || 0) * racewayHoursPerFoot;
    const letterMountingHours = (parseFloat(settings.install_raceway_letter_mounting_rate) || 18) * MIN_TO_HR;
    baseHours += (parseFloat(item.qty_letters) || 0) * letterMountingHours;
    const racewayElecHours = (parseFloat(settings.install_raceway_electrical_hookup_minutes) || 30) * MIN_TO_HR;
    baseHours += racewayElecHours;
  } else {
    const minutesPerLetter = sizeMinutesForType(rateType, item.letter_size);
    baseHours = (parseFloat(item.qty_letters) || 0) * minutesPerLetter * MIN_TO_HR;
  }
  if (item.thick_hollow_walls) {
    const extraPerLetterMin = parseFloat(settings.install_thick_walls_extra_per_letter);
    const extraPerRacewayMin = parseFloat(settings.install_thick_walls_extra_per_raceway);
    const perLetter = isNaN(extraPerLetterMin) ? 8 : extraPerLetterMin;
    const perRaceway = isNaN(extraPerRacewayMin) ? 30 : extraPerRacewayMin;
    baseHours += (parseFloat(item.qty_letters) || 0) * perLetter * MIN_TO_HR;
    if (item.installation_type === "raceway") {
      baseHours += perRaceway * MIN_TO_HR;
    }
  }
  if (item.parapet) {
    const routing = item.parapet_electrical_routing === "drop" ? "drop" : "roof";
    const perLetterKey = routing === "drop" ? "install_parapet_drop_extra_per_letter" : "install_parapet_roof_extra_per_letter";
    const perRacewayKey = routing === "drop" ? "install_parapet_drop_extra_per_raceway" : "install_parapet_roof_extra_per_raceway";
    const perLetterDefault = routing === "drop" ? 18 : 10;
    const perRacewayDefault = routing === "drop" ? 65 : 40;
    const extraPerLetterMin = parseFloat(settings[perLetterKey]);
    const extraPerRacewayMin = parseFloat(settings[perRacewayKey]);
    const perLetter = isNaN(extraPerLetterMin) ? perLetterDefault : extraPerLetterMin;
    const perRaceway = isNaN(extraPerRacewayMin) ? perRacewayDefault : extraPerRacewayMin;
    baseHours += (parseFloat(item.qty_letters) || 0) * perLetter * MIN_TO_HR;
    if (item.installation_type === "raceway") {
      baseHours += perRaceway * MIN_TO_HR;
    }
  }
  baseHours *= getWallMaterialMultiplier(item.wall_material, settings);
  if (item.escort_required) baseHours *= parseFloat(settings.install_escort_multiplier) || 1.15;
  if (item.badging_checkin) baseHours *= parseFloat(settings.install_badging_multiplier) || 1.1;
  if (item.after_hours_weekend) baseHours *= parseFloat(settings.install_after_hours_multiplier) || 1.5;
  if (item.set_hours_installation) baseHours *= parseFloat(settings.install_set_hours_multiplier) || 1.15;
  if (item.poor_site_access) {
    const level = Math.max(1, Math.min(10, parseInt(item.poor_site_access_severity) || 1));
    const severityDefaults = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 20, 6: 28, 7: 38, 8: 50, 9: 65, 10: 90 };
    const bonusMin = parseFloat(settings[`install_site_access_level_${level}`]);
    const bonus = isNaN(bonusMin) ? severityDefaults[level] : bonusMin;
    baseHours += (parseFloat(item.qty_letters) || 0) * bonus * MIN_TO_HR;
  }
  if (item.poor_electrical_access && rateType !== "raceway" && rateType !== "dimensional_lettering") {
    const level = Math.max(1, Math.min(10, parseInt(item.poor_electrical_severity) || 1));
    const severityDefaults = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 20, 6: 28, 7: 38, 8: 50, 9: 65, 10: 90 };
    const bonusMin = parseFloat(settings[`install_poor_electrical_level_${level}`]);
    const bonus = isNaN(bonusMin) ? severityDefaults[level] : bonusMin;
    baseHours += (parseFloat(item.qty_letters) || 0) * bonus * MIN_TO_HR;
  }
  const materials = (item.materials || []).filter((mat) => mat.pricing_mode !== "per_raceway_foot").map((mat) => {
    const inv = (inventory || []).find((i) => i.id === mat.inventory_item_id);
    if (!inv) {
      return { ...mat, total_cost: (parseFloat(mat.unit_cost) || 0) * (parseFloat(mat.quantity) || 0) };
    }
    if (inv.pricing_mode === "per_raceway_foot") return null;
    return materialFromInventory(inv, item);
  }).filter(Boolean);
  const materialsCost = materials.reduce((sum, m) => sum + (parseFloat(m.total_cost) || 0), 0);
  const laborCost = baseHours * laborRate;
  const itemTotalCost = laborCost + materialsCost;
  return {
    ...item,
    materials,
    labor_hours: baseHours,
    labor_cost: laborCost,
    materials_cost: materialsCost,
    item_total_cost: itemTotalCost
  };
};
var calcProjectTotals = (project) => {
  const items = project.items || [];
  const total_materials_cost = items.reduce((s, it) => s + (parseFloat(it.materials_cost) || 0), 0);
  const labor_cost = items.reduce((s, it) => s + (parseFloat(it.labor_cost) || 0), 0);
  const labor_hours = items.reduce((s, it) => s + (parseFloat(it.labor_hours) || 0), 0);
  const total_equipment_cost = (project.selected_equipment || []).reduce(
    (s, e) => s + (parseFloat(e.total_cost) || 0),
    0
  );
  const total_personnel_cost = (project.personnel || []).reduce(
    (s, p) => s + (parseFloat(p.total_cost) || 0),
    0
  );
  const labor_priced_via_personnel = total_personnel_cost > 0;
  const labor_cost_in_subtotal = labor_priced_via_personnel ? 0 : labor_cost;
  const total_letters_cost = parseFloat(project.total_letters_cost) || 0;
  const pct = parseFloat(project.supplies_percent_of_materials);
  const suppliesPct = isNaN(pct) ? 10 : pct;
  const extra = parseFloat(project.extra_supplies_cost) || 0;
  const supplies_from_materials = total_materials_cost * (suppliesPct / 100);
  const total_supplies_cost = supplies_from_materials + extra;
  const total_travel_cost = parseFloat(project.total_travel_cost) || 0;
  const subtotal = labor_cost_in_subtotal + total_materials_cost + total_supplies_cost + total_equipment_cost + total_personnel_cost + total_travel_cost + total_letters_cost;
  const markupPct = parseFloat(project.markup_percent) || 0;
  const markup_amount = subtotal * (markupPct / 100);
  const total_cost = subtotal + markup_amount;
  return {
    labor_hours,
    labor_cost,
    labor_cost_in_subtotal,
    labor_priced_via_personnel,
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

// frozen:/app/src/components/channelLetterInstall/lettersCalculator.jsx
var LETTER_TYPE_LABELS = {
  raceway: "Raceway",
  channel_raceway_mounted: "Raceway Mounted Letters",
  channel_flush_mounted: "Flush Mounted Letters",
  channel_halo_lit: "Channel Letters \u2014 Halo-Lit",
  capsule_logo_pillbox: "Capsule / Logo / Pillbox",
  dimensional_letters: "Dimensional Letters (fabricated in-house)"
};
var SIZE_UNITS = {
  raceway: "ft",
  // linear feet
  channel_raceway_mounted: "in",
  // vertical inches per letter
  channel_flush_mounted: "in",
  channel_halo_lit: "in",
  capsule_logo_pillbox: "sqft",
  // square feet
  dimensional_letters: "sqft"
};
var DEFAULTS = {
  letters_raceway_1st_per_ft: 22.53,
  letters_raceway_2nd_per_ft: 23.53,
  letters_raceway_3rd_per_ft: 24.53,
  letters_raceway_4th_per_ft: 25.53,
  letters_channel_raceway_per_inch: 7.1,
  letters_channel_flush_per_inch: 9.03,
  letters_channel_halo_per_inch: 11.75,
  // ~30% premium over flush
  letters_capsule_logo_per_sqft: 45.37,
  letters_dimensional_per_sqft: 65,
  // placeholder — in-house fab
  letters_default_delivery_fee: 90,
  letters_default_design_fee: 150,
  letters_default_install_supplies_fee: 100,
  letters_default_permitting_fee: 750,
  letters_default_markup_percent: 86.2
  // tier 1 markup from the Excel
};
var num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};
var newSetId = () => `set_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
var groupPurchasesBySet = (purchases) => {
  const list = purchases || [];
  const byId = new Map(list.map((p) => [p.id, p]));
  const childrenByParent = /* @__PURE__ */ new Map();
  list.forEach((p) => {
    if (p.set_parent_id && byId.has(p.set_parent_id)) {
      const arr = childrenByParent.get(p.set_parent_id) || [];
      arr.push(p);
      childrenByParent.set(p.set_parent_id, arr);
    }
  });
  const seen = /* @__PURE__ */ new Set();
  const groups = [];
  for (const p of list) {
    if (seen.has(p.id)) continue;
    if (!p.set_parent_id && childrenByParent.has(p.id)) {
      const children = childrenByParent.get(p.id);
      groups.push({ kind: "set", parent: p, children });
      seen.add(p.id);
      children.forEach((c) => seen.add(c.id));
    } else if (!p.set_parent_id) {
      groups.push({ kind: "solo", purchase: p });
      seen.add(p.id);
    }
  }
  for (const p of list) {
    if (!seen.has(p.id)) {
      groups.push({ kind: "solo", purchase: p });
      seen.add(p.id);
    }
  }
  return groups;
};
var emptyLetterPurchase = (type = "channel_flush_mounted") => ({
  id: `lp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  letter_type: type,
  description: "",
  raceway_index: 1,
  // Dimensional letters: nothing prefilled — user MUST configure via Build Fab Cost modal
  qty: type === "dimensional_letters" ? 0 : type === "raceway" ? 1 : 5,
  size_value: type === "dimensional_letters" ? 0 : type === "raceway" ? 8 : type.startsWith("channel_") ? 24 : 6,
  // For combined raceway-mounted rows: track the raceway hardware alongside the letters
  raceway_length_feet: type === "channel_raceway_mounted" ? 8 : 0,
  raceway_qty: type === "channel_raceway_mounted" ? 1 : 0,
  unit_cost: 0,
  unit_cost_override: false,
  total_cost: 0,
  create_install_item: type !== "raceway",
  // raceway is purchase-only by default
  install_height_feet: 12,
  wall_material: "eifs",
  // Backer (dimensional letters only) — disabled by default
  backer_enabled: false,
  backer_material_id: null,
  backer_width_inches: 0,
  backer_height_inches: 0,
  backer_standoff_inventory_id: null,
  backer_standoff_qty: 0,
  backer_fab_config: null
});
var resolveUnitCost = (purchase, settings) => {
  if (purchase.unit_cost_override) return num(purchase.unit_cost);
  switch (purchase.letter_type) {
    case "raceway": {
      const qty = Math.max(1, Math.min(4, Math.floor(num(purchase.qty, 1))));
      let sum = 0;
      for (let i = 0; i < qty; i++) {
        const k = ["letters_raceway_1st_per_ft", "letters_raceway_2nd_per_ft", "letters_raceway_3rd_per_ft", "letters_raceway_4th_per_ft"][i];
        sum += num(settings[k], DEFAULTS[k]);
      }
      return sum / qty;
    }
    case "channel_raceway_mounted":
      return num(settings.letters_channel_raceway_per_inch, DEFAULTS.letters_channel_raceway_per_inch);
    case "channel_flush_mounted":
      return num(settings.letters_channel_flush_per_inch, DEFAULTS.letters_channel_flush_per_inch);
    case "channel_halo_lit":
      return num(settings.letters_channel_halo_per_inch, DEFAULTS.letters_channel_halo_per_inch);
    case "capsule_logo_pillbox":
      return num(settings.letters_capsule_logo_per_sqft, DEFAULTS.letters_capsule_logo_per_sqft);
    case "dimensional_letters":
      return num(settings.letters_dimensional_per_sqft, DEFAULTS.letters_dimensional_per_sqft);
    default:
      return 0;
  }
};
var racewayTierKeys = [
  "letters_raceway_1st_per_ft",
  "letters_raceway_2nd_per_ft",
  "letters_raceway_3rd_per_ft",
  "letters_raceway_4th_per_ft"
];
var resolveRacewayAvgPerFt = (racewayQty, settings) => {
  const q = Math.max(1, Math.min(4, Math.floor(num(racewayQty, 1))));
  let sum = 0;
  for (let i = 0; i < q; i++) {
    sum += num(settings[racewayTierKeys[i]], DEFAULTS[racewayTierKeys[i]]);
  }
  return sum / q;
};
var calcLetterPurchase = (purchase, settings) => {
  const qty = num(purchase.qty);
  const size = num(purchase.size_value);
  const isDimensional = purchase.letter_type === "dimensional_letters";
  const isCombinedRaceway = purchase.letter_type === "channel_raceway_mounted";
  let unit_cost;
  let letters_total;
  if (isDimensional) {
    const fabUnit = num(purchase.fab_config?.unit_total_cost);
    const perLetter = purchase.unit_cost_override ? num(purchase.unit_cost) : fabUnit;
    letters_total = perLetter * qty;
    unit_cost = perLetter;
  } else {
    const autoUnit = resolveUnitCost({ ...purchase, unit_cost_override: false }, settings);
    if (purchase.letters_total_override) {
      letters_total = num(purchase.letters_total);
      unit_cost = size > 0 && qty > 0 ? letters_total / (size * qty) : 0;
    } else {
      unit_cost = purchase.unit_cost_override ? num(purchase.unit_cost) : autoUnit;
      letters_total = unit_cost * size * qty;
    }
  }
  let raceway_total = 0;
  let raceway_unit_cost = 0;
  if (isCombinedRaceway) {
    const rwLen = num(purchase.raceway_length_feet);
    const rwQty = num(purchase.raceway_qty, 1);
    const avgPerFt = resolveRacewayAvgPerFt(rwQty, settings);
    if (purchase.raceway_total_override) {
      raceway_total = num(purchase.raceway_total);
      raceway_unit_cost = rwLen > 0 && rwQty > 0 ? raceway_total / (rwLen * rwQty) : 0;
    } else if (purchase.raceway_unit_cost_override) {
      raceway_unit_cost = num(purchase.raceway_unit_cost);
      raceway_total = raceway_unit_cost * rwLen * rwQty;
    } else {
      raceway_unit_cost = avgPerFt;
      raceway_total = avgPerFt * rwLen * rwQty;
    }
  }
  let backer_total = 0;
  if (isDimensional && purchase.backer_enabled && purchase.backer_fab_config?.unit_total_cost) {
    backer_total = num(purchase.backer_fab_config.unit_total_cost) * qty;
  }
  const total_cost = letters_total + raceway_total + backer_total;
  return {
    ...purchase,
    unit_cost,
    letters_total,
    raceway_total,
    backer_total,
    raceway_unit_cost,
    total_cost
  };
};
var calcLettersTotals = (project, settings) => {
  const purchases = (project.letter_purchases || []).map((p) => calcLetterPurchase(p, settings));
  const purchasesTotal = purchases.reduce((s, p) => s + num(p.total_cost), 0);
  const onlyDimensional = purchases.length > 0 && purchases.every((p) => p.letter_type === "dimensional_letters");
  const delivery = onlyDimensional ? 0 : num(project.letters_delivery_fee);
  const design = num(project.letters_design_fee);
  const supplies = num(project.letters_install_supplies_fee);
  const permitting = num(project.letters_permitting_fee);
  const other = num(project.letters_other_fee);
  const letters_subtotal = purchasesTotal + delivery + design + supplies + permitting + other;
  const markupPct = num(project.letters_markup_percent);
  const total_letters_cost = letters_subtotal * (1 + markupPct / 100);
  return {
    letter_purchases: purchases,
    letters_subtotal,
    total_letters_cost
  };
};
var purchaseTypeToInstallType = (letter_type, backerEnabled = false) => {
  switch (letter_type) {
    case "channel_raceway_mounted":
    case "raceway":
      return "raceway";
    case "channel_halo_lit":
      return "halo_lit";
    case "dimensional_letters":
      return backerEnabled ? "dimensional_lettering_with_backer" : "dimensional_lettering";
    case "channel_flush_mounted":
    case "capsule_logo_pillbox":
    default:
      return "flush_mount";
  }
};
var inchesToLetterSize = (inches) => {
  const n = num(inches);
  if (n <= 8) return "extra_small";
  if (n <= 12) return "small";
  if (n <= 24) return "medium";
  if (n <= 48) return "large";
  if (n <= 60) return "extra_large";
  return "extra_extra_large";
};
var syncInstallItemsFromPurchases = (existingItems, purchases, emptyLineItemFn, inventory = []) => {
  const defaultMaterialsForItem2 = (item) => (inventory || []).filter((inv) => {
    if (!inv.is_default) return false;
    if (inv.pricing_mode === "per_raceway_foot") return false;
    const list = Array.isArray(inv.applies_to_list) ? inv.applies_to_list : [];
    if (list.length > 0) return list.includes(item.installation_type);
    if (!inv.applies_to || inv.applies_to === "all") return true;
    return inv.applies_to === item.installation_type;
  }).map((inv) => {
    const m = {
      inventory_item_id: inv.id,
      item_name: inv.item_name,
      pricing_mode: inv.pricing_mode,
      unit_cost: 0,
      quantity: 0,
      total_cost: 0
    };
    if (inv.pricing_mode === "per_letter_flat") {
      m.unit_cost = parseFloat(inv.cost_per_letter) || 0;
      m.quantity = parseFloat(item.qty_letters) || 0;
    } else if (inv.pricing_mode === "per_letter_by_size") {
      const sizeKey = `cost_${item.letter_size}`;
      m.unit_cost = parseFloat(inv[sizeKey]) || 0;
      m.quantity = parseFloat(item.qty_letters) || 0;
    } else if (inv.pricing_mode === "per_raceway_foot") {
      m.unit_cost = parseFloat(inv.cost_per_foot) || 0;
      m.quantity = parseFloat(item.raceway_length_feet) || 0;
    } else if (inv.pricing_mode === "per_project_flat") {
      m.unit_cost = parseFloat(inv.cost_flat) || 0;
      m.quantity = 1;
    }
    m.total_cost = m.unit_cost * m.quantity;
    return m;
  });
  const items = [...existingItems || []];
  const byPurchaseId = /* @__PURE__ */ new Map();
  items.forEach((it, idx) => {
    if (it.source_letter_purchase_id) byPurchaseId.set(it.source_letter_purchase_id, idx);
  });
  const validPurchaseIds = /* @__PURE__ */ new Set();
  const purchasesById = new Map((purchases || []).map((p) => [p.id, p]));
  for (const p of purchases || []) {
    if (!p.create_install_item) continue;
    if (p.letter_type === "raceway") continue;
    validPurchaseIds.add(p.id);
    const installType = purchaseTypeToInstallType(p.letter_type, !!p.backer_enabled);
    const sizeUnit = SIZE_UNITS[p.letter_type];
    const letter_height_inches = sizeUnit === "in" ? num(p.size_value, 24) : 24;
    const letter_size = sizeUnit === "in" ? inchesToLetterSize(p.size_value) : "medium";
    const raceway_length_feet = p.letter_type === "channel_raceway_mounted" ? num(p.raceway_length_feet) : 0;
    const parent = p.set_parent_id ? purchasesById.get(p.set_parent_id) : null;
    const inheritedInstallHeight = parent ? num(parent.install_height_feet, 12) : num(p.install_height_feet, 12);
    const inheritedWallMaterial = parent ? parent.wall_material || "eifs" : p.wall_material || "eifs";
    const patch = {
      description: p.description || LETTER_TYPE_LABELS[p.letter_type],
      installation_type: installType,
      qty_letters: num(p.qty),
      letter_size,
      letter_height_inches,
      installation_height_feet: inheritedInstallHeight,
      raceway_length_feet,
      wall_material: inheritedWallMaterial,
      source_letter_purchase_id: p.id,
      set_id: p.set_id || void 0,
      set_parent_id: p.set_parent_id || void 0,
      // Backer fields propagate to the install item for install-time pricing
      backer_width_inches: p.backer_enabled ? num(p.backer_width_inches) : 0,
      backer_height_inches: p.backer_enabled ? num(p.backer_height_inches) : 0,
      backer_standoff_qty: p.backer_enabled ? num(p.backer_standoff_qty) : 0
    };
    if (byPurchaseId.has(p.id)) {
      const idx = byPurchaseId.get(p.id);
      items[idx] = { ...items[idx], ...patch };
    } else {
      const fresh = emptyLineItemFn();
      const newItem = { ...fresh, ...patch };
      newItem.materials = defaultMaterialsForItem2(newItem);
      items.push(newItem);
    }
  }
  return items.filter((it) => !it.source_letter_purchase_id || validPurchaseIds.has(it.source_letter_purchase_id));
};

// frozen:/app/src/components/channelLetterInstall/channelLetterPricingAvailability.js
var channelNumber = (v) => {
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
var channelNonNegativeNumber = (v) => {
  const n = channelNumber(v);
  return n !== null && n >= 0 ? n : null;
};
var channelPositiveNumber = (v) => {
  const n = channelNumber(v);
  return n !== null && n > 0 ? n : null;
};
var recorded = (v) => v !== void 0 && v !== null && v !== "";
var hasChannelCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);
var channelDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};
var issue = (kind, { index = null, itemIndex = null, componentId = null, inventoryId = null, field, code, message, hold = "project", letterTypes = void 0, itemIndexes = void 0 }) => {
  const rec = { kind, index, itemIndex, componentId, inventoryId, field, code, message, hold };
  if (letterTypes !== void 0) rec.letterTypes = letterTypes;
  if (itemIndexes !== void 0) rec.itemIndexes = itemIndexes;
  return rec;
};
var RACEWAY_TIER_KEYS = [
  "letters_raceway_1st_per_ft",
  "letters_raceway_2nd_per_ft",
  "letters_raceway_3rd_per_ft",
  "letters_raceway_4th_per_ft"
];
var LETTER_RATE_KEY_BY_TYPE = {
  channel_raceway_mounted: "letters_channel_raceway_per_inch",
  channel_flush_mounted: "letters_channel_flush_per_inch",
  channel_halo_lit: "letters_channel_halo_per_inch",
  capsule_logo_pillbox: "letters_capsule_logo_per_sqft"
};
var VALID_LETTER_TYPES = /* @__PURE__ */ new Set([
  "raceway",
  "channel_raceway_mounted",
  "channel_flush_mounted",
  "channel_halo_lit",
  "capsule_logo_pillbox",
  "dimensional_letters"
]);
var VALID_INSTALL_TYPES = /* @__PURE__ */ new Set([
  "flush_mount",
  "halo_lit",
  "raceway",
  "dimensional_lettering",
  "dimensional_lettering_with_backer"
]);
var VALID_SIZES = /* @__PURE__ */ new Set([
  "extra_small",
  "small",
  "medium",
  "large",
  "extra_large",
  "extra_extra_large"
]);
var MINUTES_SETTINGS_BY_CONDITION = {
  thick_hollow_walls: (item) => {
    const keys = ["install_thick_walls_extra_per_letter"];
    if (item.installation_type === "raceway") keys.push("install_thick_walls_extra_per_raceway");
    return keys;
  },
  parapet: (item) => {
    const routing = item.parapet_electrical_routing === "drop" ? "drop" : "roof";
    const keys = [`install_parapet_${routing}_extra_per_letter`];
    if (item.installation_type === "raceway") keys.push(`install_parapet_${routing}_extra_per_raceway`);
    return keys;
  },
  escort_required: () => ["install_escort_multiplier"],
  badging_checkin: () => ["install_badging_multiplier"],
  after_hours_weekend: () => ["install_after_hours_multiplier"],
  set_hours_installation: () => ["install_set_hours_multiplier"]
};
var ROLE_RATE_KEY = {
  "Crew Lead": "install_crew_lead_rate",
  "Installer": "install_installer_rate",
  "Helper": "install_helper_rate"
};
var VEHICLE_TYPES = /* @__PURE__ */ new Set(["truck", "van", "flatbed", "car", "boom_truck"]);
var OWNED_MODES = /* @__PURE__ */ new Set(["owned_flat", "per_project_flat"]);
var EQUIPMENT_COST_FIELD = {
  per_hour: "cost_per_hour",
  per_day: "cost_per_day",
  per_week: "cost_per_week",
  per_month: "cost_per_month",
  owned_flat: "cost_flat",
  per_project_flat: "cost_flat"
};
var CNC_REQUIRED = ["cnc_machine_rate", "cnc_labor_rate", "cnc_setup_time_percentage", "cnc_letter_perimeter_factor"];
var CNC_OPTIONAL = ["min_cnc_setup_hours", "min_cnc_labor_hours"];
var LASER_REQUIRED = ["parameter_laser_machine_rate", "parameter_laser_labor_rate", "parameter_handling_time_percentage", "laser_letter_perimeter_factor"];
var LASER_OPTIONAL = ["min_laser_setup_hours", "min_laser_labor_hours"];
var PAINT_REQUIRED_NONNEG = [
  "default_labor_rate",
  "default_paint_supplies_per_sqft",
  "paint_waste_multiplier",
  "base_labor_hours_per_sqft",
  "paint_mixing_labor_hours",
  "setup_time_labor_hours",
  "color_change_setup_hours",
  "paint_gun_cleaning_hours",
  "one_side_paint_multiplier",
  "both_sides_paint_multiplier",
  "complex_complexity_multiplier",
  "additional_color_multiplier"
];
var PAINT_REQUIRED_POSITIVE = ["mixed_paint_coverage_sqft_per_gallon"];
var PAINT_OPTIONAL = ["min_labor_hours", "min_paint_cost"];
var PAINT_MASK_REQUIRED = [
  "paint_mask_rate_per_sqft",
  "paint_mask_machine_cutting_rate_per_sqft",
  "paint_mask_application_labor_rate_per_sqft",
  "paint_mask_cutting_labor_rate_per_sqft"
];
var PAINT_UNIT_FIELDS = ["paint_unit", "hardener_unit", "reducer_unit"];
var PAINT_UNITS = /* @__PURE__ */ new Set(["oz", "pint", "quart", "liter", "gallon"]);
var PAINT_COST_FIELDS = ["paint_cost_per_unit", "hardener_cost_per_unit", "reducer_cost_per_unit"];
var PAINT_RATIO_FIELDS = ["paint_mix_ratio", "hardener_mix_ratio", "reducer_mix_ratio"];
var imperialThicknessKeys = (decimal) => {
  const map = {
    0.0625: ["1_16"],
    0.125: ["1_8"],
    0.1875: ["3_16"],
    0.25: ["1_4"],
    0.375: ["3_8"],
    0.5: ["1_2"],
    0.625: ["5_8"],
    0.75: ["3_4"],
    0.875: ["7_8"],
    1: ["1"],
    1.25: ["1_1_4"],
    1.5: ["1_1_2"],
    2: ["2"],
    2.5: ["2_1_2"],
    3: ["3"],
    3.5: ["3_1_2"],
    4: ["4"]
  };
  const n = channelNumber(decimal);
  if (n === null) return [];
  const snap = Math.round(n * 16) / 16;
  return map[snap] || [];
};
var channelProjectIssues = (project, {
  settings = {},
  inventory = [],
  equipmentInventory = [],
  dimensionalMaterials = null
  // null = entity not loaded → skip staleness checks
} = {}) => {
  const issues = [];
  const inSeen = /* @__PURE__ */ new Set();
  const add = (field, code, message, { hold, index = null, itemIndex = null, componentId = null } = {}) => {
    const key = `${index}|${itemIndex}|${field}|${code}`;
    if (inSeen.has(key)) return;
    inSeen.add(key);
    issues.push(issue("channel", { index, itemIndex, componentId, field, code, message, hold }));
  };
  const catSeen = /* @__PURE__ */ new Map();
  const addCat = (field, code, message, { hold = "project", itemIndexes = null, inventoryId = null, letterTypes = void 0, index = null, componentId = null } = {}) => {
    const key = `${code}|${field}|${inventoryId || ""}`;
    const existing = catSeen.get(key);
    if (existing) {
      if (Array.isArray(itemIndexes)) existing.itemIndexes = [.../* @__PURE__ */ new Set([...existing.itemIndexes || [], ...itemIndexes])];
      if (Array.isArray(letterTypes)) existing.letterTypes = [.../* @__PURE__ */ new Set([...existing.letterTypes || [], ...letterTypes])];
      return;
    }
    const rec = issue("channel_catalog", {
      index,
      componentId,
      inventoryId,
      field,
      code,
      message,
      hold,
      itemIndexes: Array.isArray(itemIndexes) ? itemIndexes : void 0,
      letterTypes
    });
    catSeen.set(key, rec);
  };
  const scope = project?.project_scope || "full";
  const lettersActive = scope !== "install_only";
  const installActive = scope !== "letters_only";
  const items = project?.items || [];
  const purchases = project?.letter_purchases || [];
  const envOf = (item) => item?.install_environment === "interior" ? "interior" : "exterior";
  const projectEnv = project?.install_environment === "interior" ? "interior" : "exterior";
  const racewayTiersFor = (qty) => Math.max(1, Math.min(4, Math.floor(channelPositiveNumber(qty) ?? 1)));
  if (lettersActive) {
    purchases.forEach((p, index) => {
      const type = p?.letter_type;
      const label = `Letter row ${index + 1}${p?.description ? ` "${p.description}"` : ""}`;
      if (!VALID_LETTER_TYPES.has(type)) {
        add(
          "letter_type",
          "channel_letter_type_unavailable",
          `${label}: choose a supported letter type \u2014 "${type || "blank"}" prices as $0`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
        return;
      }
      if (channelPositiveNumber(p?.qty) === null) {
        add(
          "qty",
          "channel_qty_unavailable",
          `${label}: record a positive, finite quantity \u2014 a blank or zero quantity prices the row as $0`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
      }
      if (type === "raceway") {
        const tiers = racewayTiersFor(p?.qty);
        for (let i = 0; i < tiers; i++) {
          const key = RACEWAY_TIER_KEYS[i];
          if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
            addCat(
              key,
              "channel_letter_rate_unavailable",
              `Setting ${key}: record a positive, finite raceway tier ${i + 1} $/ft rate \u2014 ${label} would price with a hidden default`,
              { hold: "letters", letterTypes: ["raceway"] }
            );
          }
        }
        if (channelPositiveNumber(p?.size_value) === null) {
          add(
            "size_value",
            "channel_size_unavailable",
            `${label}: record a positive, finite raceway length (ft) \u2014 a blank or zero length prices the row as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
      } else if (type === "channel_raceway_mounted") {
        const key = LETTER_RATE_KEY_BY_TYPE[type];
        if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
          addCat(
            key,
            "channel_letter_rate_unavailable",
            `Setting ${key}: record a positive, finite per-inch letter rate \u2014 ${label} would price with a hidden default`,
            { hold: "letters", letterTypes: [type] }
          );
        }
        if (channelPositiveNumber(p?.size_value) === null) {
          add(
            "size_value",
            "channel_size_unavailable",
            `${label}: record a positive, finite letter height (in) \u2014 a blank or zero size prices the letters as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        if (channelPositiveNumber(p?.raceway_qty) === null) {
          add(
            "raceway_qty",
            "channel_raceway_qty_unavailable",
            `${label}: record a positive, finite # of raceways`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        if (channelPositiveNumber(p?.raceway_length_feet) === null) {
          add(
            "raceway_length_feet",
            "channel_raceway_length_unavailable",
            `${label}: record a positive, finite raceway length (ft) \u2014 raceway hardware would price as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        const rwTiers = racewayTiersFor(p?.raceway_qty);
        for (let i = 0; i < rwTiers; i++) {
          const k = RACEWAY_TIER_KEYS[i];
          if (!recorded(settings?.[k]) || channelPositiveNumber(settings[k]) === null) {
            addCat(
              k,
              "channel_letter_rate_unavailable",
              `Setting ${k}: record a positive, finite raceway tier ${i + 1} $/ft rate \u2014 ${label} would price with a hidden default`,
              { hold: "letters", letterTypes: [type] }
            );
          }
        }
        if (p?.raceway_unit_cost_override && channelNonNegativeNumber(p?.raceway_unit_cost) === null) {
          add(
            "raceway_unit_cost",
            "channel_raceway_unit_cost_unavailable",
            `${label}: record a finite, nonnegative raceway $/ft override`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        if (p?.raceway_total_override && channelNonNegativeNumber(p?.raceway_total) === null) {
          add(
            "raceway_total",
            "channel_raceway_total_unavailable",
            `${label}: record a finite, nonnegative raceway total override`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
      } else if (type === "dimensional_letters") {
        const fab = p?.fab_config;
        if (!fab || !recorded(fab.material_id) || channelNonNegativeNumber(fab.unit_total_cost) === null) {
          add(
            "fab_config",
            "dimensional_fab_unavailable",
            `${label}: complete "Build Fab Cost" \u2014 a dimensional row without a material + computed unit cost prices as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        } else {
          if (!["cnc", "laser"].includes(fab.cutting_method)) {
            add(
              "cutting_method",
              "dimensional_fab_unavailable",
              `${label}: choose a supported cutting method (CNC / Laser)`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          }
          if (channelPositiveNumber(fab.letter_height_inches) === null) {
            add(
              "fab_config",
              "dimensional_fab_unavailable",
              `${label}: record a positive, finite letter height (in) in the fab builder`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          }
          if (fab.width_override && channelPositiveNumber(fab.letter_width_inches) === null) {
            add(
              "fab_config",
              "dimensional_fab_unavailable",
              `${label}: Oversize is on \u2014 record a positive, finite letter width (in) or turn Oversize off`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          }
          dimensionalSettingIssues({ addCat, fab, settings, dimensionalMaterials, rowLabel: label });
        }
        if (p?.unit_cost_override && channelNonNegativeNumber(p?.unit_cost) === null) {
          add(
            "unit_cost",
            "channel_unit_cost_unavailable",
            `${label}: record a finite, nonnegative per-letter cost override`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
        if (p?.backer_enabled) {
          const bf = p?.backer_fab_config;
          if (!bf || !recorded(bf.material_id) || channelNonNegativeNumber(bf.unit_total_cost) === null) {
            add(
              "backer_fab_config",
              "dimensional_backer_unavailable",
              `${label}: complete the Backer Panel fab (material + size + computed cost) or remove the backer \u2014 it currently prices as $0`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          } else {
            if (!["cnc", "laser"].includes(bf.cutting_method)) {
              add(
                "cutting_method",
                "dimensional_backer_unavailable",
                `${label}: backer panel has an unsupported cutting method`,
                { hold: "purchase", index, componentId: p?.id ?? null }
              );
            }
            if (channelPositiveNumber(bf.width_inches) === null || channelPositiveNumber(bf.height_inches) === null) {
              add(
                "backer_fab_config",
                "dimensional_backer_unavailable",
                `${label}: record positive, finite backer panel width \xD7 height (in)`,
                { hold: "purchase", index, componentId: p?.id ?? null }
              );
            }
          }
          if (recorded(p?.backer_standoff_qty) && channelNonNegativeNumber(p.backer_standoff_qty) === null) {
            add(
              "backer_standoff_qty",
              "channel_standoff_unavailable",
              `${label}: record a finite, nonnegative standoff quantity or clear it`,
              { hold: "purchase", index, componentId: p?.id ?? null }
            );
          }
          if (recorded(p?.backer_standoff_inventory_id)) {
            const standoff = inventory.find((i) => i.id === p.backer_standoff_inventory_id);
            if (!standoff) {
              addCat(
                "backer_standoff_inventory_id",
                "channel_material_unavailable",
                `${label}: the selected standoff record is no longer available \u2014 reselect it`,
                { hold: "purchase", inventoryId: p.backer_standoff_inventory_id, index }
              );
            } else {
              const cost = recorded(standoff.cost_per_letter) ? standoff.cost_per_letter : standoff.cost_flat;
              if (!recorded(cost) || channelNonNegativeNumber(cost) === null) {
                addCat(
                  recorded(standoff.cost_per_letter) ? "cost_per_letter" : "cost_flat",
                  "channel_material_price_unavailable",
                  `Inventory "${standoff.item_name || "standoff"}": record a finite, nonnegative standoff cost \u2014 a missing price is not free`,
                  { hold: "purchase", inventoryId: standoff.id, index }
                );
              }
            }
          }
          if (bf && recorded(bf.material_id)) {
            dimensionalMaterialIssues({ addCat, fab: bf, settings, dimensionalMaterials, rowLabel: `${label} (backer)` });
            dimensionalSettingIssues({ addCat, fab: bf, settings, dimensionalMaterials: null, rowLabel: `${label} (backer)` });
          }
        }
      } else {
        const key = LETTER_RATE_KEY_BY_TYPE[type];
        if (!recorded(settings?.[key]) || channelPositiveNumber(settings[key]) === null) {
          addCat(
            key,
            "channel_letter_rate_unavailable",
            `Setting ${key}: record a positive, finite ${type.replace(/_/g, " ")} rate \u2014 ${label} would price with a hidden default`,
            { hold: "letters", letterTypes: [type] }
          );
        }
        if (channelPositiveNumber(p?.size_value) === null) {
          add(
            "size_value",
            "channel_size_unavailable",
            `${label}: record a positive, finite ${type === "capsule_logo_pillbox" ? "area (sq ft)" : "letter height (in)"} \u2014 a blank or zero size prices the row as $0`,
            { hold: "purchase", index, componentId: p?.id ?? null }
          );
        }
      }
      if (type !== "dimensional_letters" && p?.unit_cost_override && channelNonNegativeNumber(p?.unit_cost) === null) {
        add(
          "unit_cost",
          "channel_unit_cost_unavailable",
          `${label}: record a finite, nonnegative unit cost override`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
      }
      if (p?.letters_total_override && channelNonNegativeNumber(p?.letters_total) === null) {
        add(
          "letters_total",
          "channel_letters_total_unavailable",
          `${label}: record a finite, nonnegative line total override`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
      }
      if (recorded(p?.install_height_feet) && channelNonNegativeNumber(p.install_height_feet) === null) {
        add(
          "install_height_feet",
          "channel_install_height_unavailable",
          `${label}: record a finite, nonnegative install height (ft) or clear it`,
          { hold: "purchase", index, componentId: p?.id ?? null }
        );
      }
    });
    const onlyDimensional = purchases.length > 0 && purchases.every((p) => p.letter_type === "dimensional_letters");
    for (const [field, human] of [
      ["letters_delivery_fee", "delivery / shipping fee"],
      ["letters_design_fee", "design fee"],
      ["letters_install_supplies_fee", "install supplies fee"],
      ["letters_permitting_fee", "permitting fee"],
      ["letters_other_fee", "other fee"]
    ]) {
      if (field === "letters_delivery_fee" && onlyDimensional) continue;
      if (recorded(project?.[field]) && channelNonNegativeNumber(project[field]) === null) {
        add(
          field,
          "channel_fee_unavailable",
          `record a finite, nonnegative ${human} or clear it \u2014 a malformed fee corrupts the letters subtotal`,
          { hold: "letters" }
        );
      }
    }
    if (recorded(project?.letters_markup_percent) && channelNonNegativeNumber(project.letters_markup_percent) === null) {
      add(
        "letters_markup_percent",
        "channel_letters_markup_unavailable",
        "record a finite, nonnegative letters markup % or clear it",
        { hold: "letters" }
      );
    }
  }
  if (installActive) {
    items.forEach((it, index) => {
      const label = `Install item ${index + 1}${it?.description ? ` "${it.description}"` : ""}`;
      const type = it?.installation_type;
      const rateType = type === "dimensional_lettering_with_backer" ? "dimensional_lettering" : type;
      const isRaceway = rateType === "raceway";
      const env = envOf(it) || projectEnv;
      if (!VALID_INSTALL_TYPES.has(type)) {
        add(
          "installation_type",
          "channel_item_type_unavailable",
          `${label}: choose a supported installation type \u2014 "${type || "blank"}" silently prices at flush-mount defaults`,
          { hold: "install", index, itemIndex: index }
        );
        return;
      }
      const qtyCheck = isRaceway ? channelNonNegativeNumber : channelPositiveNumber;
      if (qtyCheck(it?.qty_letters) === null) {
        add(
          "qty_letters",
          "channel_item_qty_unavailable",
          `${label}: record a ${isRaceway ? "finite, nonnegative" : "positive, finite"} letter quantity${isRaceway ? "" : " \u2014 0 letters prices the row as $0"}`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (!isRaceway && !VALID_SIZES.has(it?.letter_size)) {
        add(
          "letter_size",
          "channel_item_size_unavailable",
          `${label}: choose a letter size \u2014 "${it?.letter_size || "blank"}" silently prices at medium-size defaults`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (isRaceway && channelPositiveNumber(it?.raceway_length_feet) === null) {
        add(
          "raceway_length_feet",
          "channel_raceway_length_unavailable",
          `${label}: record a positive, finite raceway length (ft)`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (recorded(it?.installation_height_feet) && channelNonNegativeNumber(it.installation_height_feet) === null) {
        add(
          "installation_height_feet",
          "channel_item_height_unavailable",
          `${label}: record a finite, nonnegative install height (ft) or clear it`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (recorded(it?.install_environment) && !["interior", "exterior"].includes(it.install_environment)) {
        add(
          "install_environment",
          "channel_item_env_unavailable",
          `${label}: choose Interior or Exterior \u2014 "${it.install_environment}" silently resolves as exterior`,
          { hold: "install", index, itemIndex: index }
        );
      }
      if (!recorded(settings?.install_labor_rate) || channelPositiveNumber(settings.install_labor_rate) === null) {
        addCat(
          "install_labor_rate",
          "channel_install_rate_unavailable",
          `Setting install_labor_rate: record a positive, finite install labor rate \u2014 ${label} would price with a hidden default`,
          { hold: "install", itemIndexes: [index] }
        );
      }
      if (isRaceway) {
        for (const [key, human] of [
          ["install_raceway_base_minutes_per_foot", "raceway base minutes per foot"],
          ["install_raceway_letter_mounting_rate", "raceway letter mounting minutes"],
          ["install_raceway_electrical_hookup_minutes", "raceway electrical hookup minutes"]
        ]) {
          if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
            addCat(
              key,
              "channel_install_minutes_unavailable",
              `Setting ${key}: record a finite, nonnegative ${human} \u2014 ${label} would price with a hidden default`,
              { hold: "install", itemIndexes: [index] }
            );
          }
        }
        if (recorded(settings?.install_raceway_extra_minutes_per_foot) && channelNonNegativeNumber(settings.install_raceway_extra_minutes_per_foot) === null) {
          addCat(
            "install_raceway_extra_minutes_per_foot",
            "channel_install_minutes_unavailable",
            "Setting install_raceway_extra_minutes_per_foot is malformed \u2014 fix or clear it in Installation Settings",
            { hold: "install", itemIndexes: [index] }
          );
        }
      } else if (VALID_SIZES.has(it?.letter_size)) {
        const prefixes = TYPE_PREFIXES[rateType];
        const heightBucket = (() => {
          const h = channelNonNegativeNumber(it?.installation_height_feet) ?? 0;
          if (h <= 12) return "h0_12";
          if (h <= 20) return "h12_20";
          if (h <= 30) return "h20_30";
          return "h30plus";
        })();
        if (prefixes) {
          for (const [phase, prefix] of [["drill", prefixes.drill], ["prep", prefixes.prep], ["electrical", prefixes.elec]]) {
            if (!prefix) continue;
            rateMinuteSettingIssue({ addCat, settings, prefix, size: it.letter_size, env, heightBucket, phase, itemIndex: index, label });
          }
        } else {
          add(
            "installation_type",
            "channel_item_type_unavailable",
            `${label}: "${type}" has no configured size-rate settings \u2014 it silently prices at hardcoded defaults`,
            { hold: "install", index, itemIndex: index }
          );
        }
      }
      const wallDef = WALL_MATERIAL_MAP[it?.wall_material];
      if (it?.wall_material && !wallDef) {
        add(
          "wall_material",
          "channel_wall_material_unavailable",
          `${label}: "${it.wall_material}" is not a configured wall material \u2014 it silently prices at a 1.0\xD7 multiplier`,
          { hold: "install", index, itemIndex: index }
        );
      } else if (wallDef) {
        const v = settings?.[wallDef.settingKey];
        if (!recorded(v) || channelNumber(v) === null) {
          addCat(
            wallDef.settingKey,
            "channel_wall_multiplier_unavailable",
            `Setting ${wallDef.settingKey}: record a finite ${wallDef.label} time multiplier \u2014 ${label} would price with a hidden default`,
            { hold: "install", itemIndexes: [index] }
          );
        }
      }
      for (const [flag, keysFor] of Object.entries(MINUTES_SETTINGS_BY_CONDITION)) {
        if (!it?.[flag]) continue;
        for (const key of keysFor(it)) {
          const v = settings?.[key];
          if (!recorded(v) || channelPositiveNumber(v) === null) {
            addCat(
              key,
              "channel_condition_setting_unavailable",
              `Setting ${key}: record a positive, finite value \u2014 ${label} has ${flag.replace(/_/g, " ")} on and would price with a hidden default`,
              { hold: "install", itemIndexes: [index] }
            );
          }
        }
      }
      if (it?.poor_site_access) {
        const lvl = severityLevel(it.poor_site_access_severity, add, index, label, "poor_site_access_severity");
        const key = `install_site_access_level_${lvl}`;
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(
            key,
            "channel_condition_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative site-access level ${lvl} minutes \u2014 ${label} would price with a hidden default`,
            { hold: "install", itemIndexes: [index] }
          );
        }
      }
      if (it?.poor_electrical_access && !isRaceway && rateType !== "dimensional_lettering") {
        const lvl = severityLevel(it.poor_electrical_severity, add, index, label, "poor_electrical_severity");
        const key = `install_poor_electrical_level_${lvl}`;
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(
            key,
            "channel_condition_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative poor-electrical level ${lvl} minutes \u2014 ${label} would price with a hidden default`,
            { hold: "install", itemIndexes: [index] }
          );
        }
      }
      if (it?.poor_electrical_access && (isRaceway || rateType === "dimensional_lettering") && recorded(it?.poor_electrical_severity)) {
        severityLevel(it.poor_electrical_severity, add, index, label, "poor_electrical_severity");
      }
      (it?.materials || []).forEach((m, mi) => {
        materialIssues({ add, addCat, m, it, inventory, index, itemIndex: mi, label });
      });
    });
    if (recorded(project?.install_environment) && !["interior", "exterior"].includes(project.install_environment)) {
      add(
        "install_environment",
        "channel_environment_unavailable",
        `Project installation environment "${project.install_environment}" is not supported \u2014 it silently resolves as exterior`,
        { hold: "install" }
      );
    }
  }
  if (installActive) {
    (project?.selected_equipment || []).forEach((e, index) => {
      const name = e?.equipment_name || `row ${index + 1}`;
      if (!recorded(e?.equipment_id)) {
        add(
          "equipment_id",
          "channel_equipment_unassigned",
          `Equipment "${name}": select an equipment record \u2014 an unlinked row cannot be repriced`,
          { hold: "equipment", index }
        );
      } else {
        const inv = equipmentInventory.find((r) => r.id === e.equipment_id);
        if (!inv) {
          addCat(
            "selected_equipment",
            "channel_equipment_unavailable",
            `Equipment "${name}": the selected equipment record is no longer available \u2014 reselect it`,
            { hold: "equipment", inventoryId: e.equipment_id, index }
          );
        } else {
          const costField = EQUIPMENT_COST_FIELD[inv.pricing_mode];
          if (!costField) {
            addCat(
              "pricing_mode",
              "channel_equipment_mode_unavailable",
              `Equipment "${inv.equipment_name || name}": pricing mode "${inv.pricing_mode || "blank"}" is not supported \u2014 it silently bills $0`,
              { hold: "equipment", inventoryId: inv.id, index }
            );
          } else if (channelNonNegativeNumber(inv[costField]) === null) {
            addCat(
              costField,
              "channel_equipment_price_unavailable",
              `Equipment "${inv.equipment_name || name}": record a finite, nonnegative ${costField.replace(/_/g, " ")} in Equipment Inventory \u2014 a missing price is not free`,
              { hold: "equipment", inventoryId: inv.id, index }
            );
          }
          if (e?.include_delivery && !isOwnedRow(e, inv) && channelNonNegativeNumber(inv.delivery_pickup_cost) === null && channelNonNegativeNumber(e.delivery_pickup_cost) === null) {
            addCat(
              "delivery_pickup_cost",
              "channel_equipment_price_unavailable",
              `Equipment "${inv.equipment_name || name}": record a finite, nonnegative delivery/pickup cost in Equipment Inventory \u2014 a missing price is not free`,
              { hold: "equipment", inventoryId: inv.id, index }
            );
          }
          const milesNum = channelNonNegativeNumber(project?.travel_miles_round_trip);
          if (milesNum !== null && milesNum > 0 && (inv.ownership === "owned" || OWNED_MODES.has(inv.pricing_mode)) && VEHICLE_TYPES.has(inv.equipment_type) && channelPositiveNumber(inv.mpg) === null) {
            addCat(
              "mpg",
              "channel_vehicle_mpg_unavailable",
              `Equipment "${inv.equipment_name || name}": record a positive, finite MPG in Equipment Inventory \u2014 travel fuel pricing is unavailable`,
              { hold: "travel", inventoryId: inv.id, index }
            );
          }
        }
      }
      const flatMode = OWNED_MODES.has(e?.pricing_mode);
      if (!flatMode && e?.duration !== void 0 && channelPositiveNumber(e?.duration) === null) {
        add(
          "duration",
          "channel_equipment_duration_unavailable",
          `Equipment "${name}": record a positive, finite rental duration \u2014 0 ${e?.pricing_mode === "per_hour" ? "hours" : "periods"} bills as $0`,
          { hold: "equipment", index }
        );
      }
      if (e?.unit_cost !== void 0 && channelNonNegativeNumber(e?.unit_cost) === null) {
        add(
          "unit_cost",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative unit cost`,
          { hold: "equipment", index }
        );
      }
      if (recorded(e?.delivery_pickup_cost) && channelNonNegativeNumber(e.delivery_pickup_cost) === null) {
        add(
          "delivery_pickup_cost",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative delivery/pickup cost`,
          { hold: "equipment", index }
        );
      }
      if (recorded(e?.idle_hours) && channelNonNegativeNumber(e.idle_hours) === null) {
        add(
          "idle_hours",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative idle hours value or clear it`,
          { hold: "equipment", index }
        );
      }
      if (recorded(e?.idle_running_cost_per_hour) && channelNonNegativeNumber(e.idle_running_cost_per_hour) === null) {
        add(
          "idle_running_cost_per_hour",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": record a finite, nonnegative idle $/hr or clear it`,
          { hold: "equipment", index }
        );
      }
      if (channelNonNegativeNumber(e?.total_cost) === null) {
        add(
          "total_cost",
          "channel_equipment_value_unavailable",
          `Equipment "${name}": recorded total cost is not a finite, nonnegative number \u2014 recalculate the row before repricing`,
          { hold: "equipment", index }
        );
      }
    });
  }
  if (installActive) {
    (project?.personnel || []).forEach((p, index) => {
      const role = p?.role || p?.name || `row ${index + 1}`;
      const hrs2 = channelNumber(p?.hours);
      const rate = channelNumber(p?.hourly_rate);
      if (p?.hours !== void 0 && (hrs2 === null || hrs2 < 0)) {
        add(
          "hours",
          "channel_personnel_hours_unavailable",
          `Crew "${role}": record a finite, nonnegative hours value`,
          { hold: "personnel", index }
        );
      }
      if (p?.hourly_rate !== void 0 && (rate === null || rate < 0)) {
        add(
          "hourly_rate",
          "channel_personnel_rate_unavailable",
          `Crew "${role}": record a finite, nonnegative hourly rate`,
          { hold: "personnel", index }
        );
      }
      if (hrs2 !== null && hrs2 > 0 && (rate === null || rate <= 0)) {
        add(
          "hourly_rate",
          "channel_personnel_rate_unavailable",
          `Crew "${role}": record a positive hourly rate or clear the hours \u2014 ${hrs2} hr would bill $0`,
          { hold: "personnel", index }
        );
      }
      if (channelNonNegativeNumber(p?.total_cost) === null) {
        add(
          "total_cost",
          "channel_personnel_cost_unavailable",
          `Crew "${role}": recorded total cost is not a finite, nonnegative number \u2014 recalculate the row before repricing`,
          { hold: "personnel", index }
        );
      }
    });
    const rolesPresent = new Set((project?.personnel || []).map((p) => p?.role).filter((r) => r in ROLE_RATE_KEY));
    rolesPresent.forEach((role) => {
      const field = ROLE_RATE_KEY[role];
      if (!recorded(settings?.[field]) || channelPositiveNumber(settings[field]) === null) {
        addCat(
          field,
          "channel_install_rate_unavailable",
          `Setting ${field}: record a positive, finite ${role} rate in Installation Settings \u2014 crew pricing is unavailable`,
          { hold: "personnel" }
        );
      }
    });
  }
  if (installActive) {
    if (recorded(project?.travel_miles_round_trip) && channelNonNegativeNumber(project.travel_miles_round_trip) === null) {
      add(
        "travel_miles_round_trip",
        "channel_travel_miles_unavailable",
        "record a finite, nonnegative round-trip mileage \u2014 travel pricing is unavailable",
        { hold: "travel" }
      );
    }
    if (recorded(project?.total_travel_cost) && channelNonNegativeNumber(project.total_travel_cost) === null) {
      add(
        "total_travel_cost",
        "channel_travel_cost_unavailable",
        "recorded travel cost is not a finite, nonnegative number \u2014 recalculate travel before repricing",
        { hold: "travel" }
      );
    }
    const milesNum = channelNonNegativeNumber(project?.travel_miles_round_trip);
    if (milesNum !== null && milesNum > 0) {
      for (const [field, human] of [
        ["install_gasoline_price_per_gallon", "gasoline price per gallon"],
        ["install_diesel_price_per_gallon", "diesel price per gallon"],
        ["install_travel_labor_rate", "travel labor rate"],
        ["install_travel_avg_speed_mph", "travel average speed (mph)"]
      ]) {
        if (!recorded(settings?.[field]) || channelPositiveNumber(settings[field]) === null) {
          addCat(
            field,
            "channel_travel_setting_unavailable",
            `Setting ${field}: record a positive, finite ${human} in Installation Settings \u2014 travel pricing is unavailable`,
            { hold: "travel" }
          );
        }
      }
      for (const [field, human] of [
        ["install_travel_overhead_per_mile", "travel overhead per mile"],
        ["install_min_travel_charge", "minimum travel charge"]
      ]) {
        if (recorded(settings?.[field]) && channelNonNegativeNumber(settings[field]) === null) {
          addCat(
            field,
            "channel_travel_setting_unavailable",
            `Setting ${field}: record a finite, nonnegative ${human} in Installation Settings`,
            { hold: "travel" }
          );
        }
      }
    }
  }
  if (recorded(project?.supplies_percent_of_materials) && channelNonNegativeNumber(project.supplies_percent_of_materials) === null) {
    add(
      "supplies_percent_of_materials",
      "channel_supplies_percent_unavailable",
      "record a finite, nonnegative supplies % of materials or clear it",
      { hold: "supplies" }
    );
  }
  if (recorded(project?.extra_supplies_cost) && channelNonNegativeNumber(project.extra_supplies_cost) === null) {
    add(
      "extra_supplies_cost",
      "channel_extra_supplies_unavailable",
      "record a finite, nonnegative extra supplies cost ($) or clear it",
      { hold: "supplies" }
    );
  }
  if (recorded(project?.markup_percent) && channelNonNegativeNumber(project.markup_percent) === null) {
    add(
      "markup_percent",
      "channel_markup_unavailable",
      "record a finite, nonnegative project markup % or clear it",
      { hold: "markup" }
    );
  }
  return [...issues, ...catSeen.values()];
};
var severityLevel = (v, add, index, label, field) => {
  const n = channelNumber(v);
  if (n === null || n < 1 || n > 10 || Math.floor(n) !== n) {
    add(
      field,
      "channel_item_severity_unavailable",
      `${label}: choose a whole-number severity 1\u201310`,
      { hold: "install", index, itemIndex: index }
    );
    return 1;
  }
  return n;
};
var rateMinuteSettingIssue = ({ addCat, settings, prefix, size, env, heightBucket, phase, itemIndex, label }) => {
  const qk = qualifiedKey(prefix, size, env, heightBucket);
  const qv = settings?.[qk];
  if (recorded(qv)) {
    if (channelNonNegativeNumber(qv) === null) {
      addCat(
        qk,
        "channel_install_minutes_unavailable",
        `Setting ${qk}: fix the malformed ${phase} minutes \u2014 ${label} silently falls back to legacy rates`,
        { hold: "install", itemIndexes: [itemIndex] }
      );
    }
    return;
  }
  const lk = `${prefix}${size}`;
  const lv = settings?.[lk];
  if (recorded(lv)) {
    if (channelNonNegativeNumber(lv) === null) {
      addCat(
        lk,
        "channel_install_minutes_unavailable",
        `Setting ${lk}: fix the malformed ${phase} minutes \u2014 ${label} silently falls back to hardcoded defaults`,
        { hold: "install", itemIndexes: [itemIndex] }
      );
    }
    return;
  }
  addCat(
    qk,
    "channel_install_minutes_unavailable",
    `Setting ${qk} (or legacy ${lk}): record finite, nonnegative ${phase} minutes for ${size.replace(/_/g, " ")} / ${env} / ${heightBucket} \u2014 ${label} would price with a hidden default`,
    { hold: "install", itemIndexes: [itemIndex] }
  );
};
var isOwnedRow = (row, inv) => row?.ownership === "owned" || inv?.ownership === "owned" || OWNED_MODES.has(row?.pricing_mode) || OWNED_MODES.has(inv?.pricing_mode);
var materialIssues = ({ add, addCat, m, it, inventory, index, itemIndex, label }) => {
  const matLabel = `${label}, material "${m?.item_name || `#${itemIndex + 1}`}"`;
  if (recorded(m?.inventory_item_id)) {
    const inv = inventory.find((i) => i.id === m.inventory_item_id);
    if (!inv) {
      addCat(
        "inventory_item_id",
        "channel_material_unavailable",
        `${matLabel}: the linked inventory record is no longer available \u2014 reselect or reprice it`,
        { hold: "install", inventoryId: m.inventory_item_id, index, itemIndexes: [index] }
      );
      detachedMaterialValues({ add, m, index, itemIndex, label: matLabel });
      return;
    }
    if (inv.pricing_mode === "per_raceway_foot") {
      add(
        "pricing_mode",
        "channel_material_mode_unavailable",
        `${matLabel}: raceway hardware is priced on the Letters tab \u2014 remove it from install materials`,
        { hold: "install", index, itemIndex }
      );
      return;
    }
    const costField = { per_letter_flat: "cost_per_letter", per_letter_by_size: `cost_${it?.letter_size}`, per_project_flat: "cost_flat" }[inv.pricing_mode];
    if (!costField) {
      addCat(
        "pricing_mode",
        "channel_material_mode_unavailable",
        `Inventory "${inv.item_name}": pricing mode "${inv.pricing_mode || "blank"}" is not supported on install items \u2014 it silently bills $0`,
        { hold: "install", inventoryId: inv.id, index, itemIndexes: [index] }
      );
      return;
    }
    if (!recorded(inv[costField]) || channelNonNegativeNumber(inv[costField]) === null) {
      addCat(
        costField,
        "channel_material_price_unavailable",
        `Inventory "${inv.item_name}": record a finite, nonnegative ${costField.replace(/_/g, " ")} \u2014 a missing material price is not free`,
        { hold: "install", inventoryId: inv.id, index, itemIndexes: [index] }
      );
    }
    return;
  }
  detachedMaterialValues({ add, m, index, itemIndex, label: matLabel });
};
var detachedMaterialValues = ({ add, m, index, itemIndex, label }) => {
  if (m?.unit_cost !== void 0 && channelNonNegativeNumber(m.unit_cost) === null) {
    add(
      "unit_cost",
      "channel_material_value_unavailable",
      `${label}: record a finite, nonnegative unit cost`,
      { hold: "install", index, itemIndex }
    );
  }
  if (m?.quantity !== void 0 && channelNonNegativeNumber(m.quantity) === null) {
    add(
      "quantity",
      "channel_material_value_unavailable",
      `${label}: record a finite, nonnegative quantity`,
      { hold: "install", index, itemIndex }
    );
  }
};
var dimensionalMaterialIssues = ({ addCat, fab, settings, dimensionalMaterials, rowLabel }) => {
  if (!recorded(fab?.material_id)) return;
  if (dimensionalMaterials === null) return;
  const mat = (dimensionalMaterials || []).find((m) => m.id === fab.material_id);
  if (!mat) {
    addCat(
      "material_id",
      "dimensional_material_unavailable",
      `${rowLabel}: the selected sheet material is no longer available \u2014 reselect it in the fab builder`,
      { hold: "letters", inventoryId: fab.material_id, letterTypes: ["dimensional_letters"] }
    );
    return;
  }
  if (mat.is_active === false) {
    addCat(
      "is_active",
      "dimensional_material_unavailable",
      `Dimensional material "${mat.material_name || mat.id}" is no longer active \u2014 reselect an active material in the fab builder`,
      { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] }
    );
  }
  for (const [field, human] of [
    ["cost_per_sheet", "sheet cost"],
    ["sheet_length_inches", "sheet length (in)"],
    ["sheet_width_inches", "sheet width (in)"],
    ["thickness_inches", "thickness (in)"],
    ["yield_factor", "sheet yield factor"],
    ["material_type", "material type"]
  ]) {
    const v = mat[field];
    if (field === "material_type") {
      if (!recorded(v)) {
        addCat(
          field,
          "dimensional_material_setting_unavailable",
          `Dimensional material "${mat.material_name || mat.id}": record a ${human} \u2014 the cut multiplier cannot resolve and silently prices as 1.0\xD7`,
          { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] }
        );
      }
      continue;
    }
    if (field === "yield_factor") {
      const n = channelNumber(v);
      if (n === null || n <= 0 || n > 1) {
        addCat(
          field,
          "dimensional_material_setting_unavailable",
          `Dimensional material "${mat.material_name || mat.id}": record a ${human} between 0 and 1 \u2014 it silently prices at 70%`,
          { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] }
        );
      }
      continue;
    }
    const check = field === "cost_per_sheet" ? channelNonNegativeNumber : channelPositiveNumber;
    if (check(v) === null) {
      addCat(
        field,
        "dimensional_material_setting_unavailable",
        `Dimensional material "${mat.material_name || mat.id}": record a ${field === "cost_per_sheet" ? "finite, nonnegative" : "positive, finite"} ${human} \u2014 the per-sqin material price is unavailable`,
        { hold: "letters", inventoryId: mat.id, letterTypes: ["dimensional_letters"] }
      );
    }
  }
};
var dimensionalSettingIssues = ({ addCat, fab, settings, dimensionalMaterials, rowLabel }) => {
  dimensionalMaterialIssues({ addCat, fab, settings, dimensionalMaterials, rowLabel });
  const method = fab?.cutting_method === "laser" ? "laser" : "cnc";
  const required = method === "laser" ? LASER_REQUIRED : CNC_REQUIRED;
  const optional = method === "laser" ? LASER_OPTIONAL : CNC_OPTIONAL;
  for (const key of required) {
    if (!recorded(settings?.[key]) || channelNumber(settings[key]) === null) {
      addCat(
        key,
        "dimensional_setting_unavailable",
        `Setting ${key}: record a finite ${method === "laser" ? "laser" : "CNC"} ${key.replace(/_/g, " ")} \u2014 ${rowLabel} would price with a hidden default`,
        { hold: "letters", letterTypes: ["dimensional_letters"] }
      );
    }
  }
  for (const key of optional) {
    if (recorded(settings?.[key]) && channelNonNegativeNumber(settings[key]) === null) {
      addCat(
        key,
        "dimensional_setting_unavailable",
        `Setting ${key}: fix the malformed value or clear it in ${method === "laser" ? "Laser" : "CNC"} Settings`,
        { hold: "letters", letterTypes: ["dimensional_letters"] }
      );
    }
  }
  const thickness = fab?.material_thickness_inches;
  const prefix = method === "laser" ? "cut_speed_" : "cnc_cut_speed_";
  const candidates = imperialThicknessKeys(thickness);
  if (candidates.length > 0) {
    const firstRecorded = candidates.map((c) => `${prefix}${c}`).find((k) => recorded(settings?.[k]));
    if (firstRecorded) {
      if (channelPositiveNumber(settings[firstRecorded]) === null) {
        addCat(
          firstRecorded,
          "dimensional_setting_unavailable",
          `Setting ${firstRecorded}: record a positive, finite cut speed (in/min) \u2014 ${rowLabel} would price with a hidden default`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    } else {
      addCat(
        `${prefix}${candidates[0]}`,
        "dimensional_setting_unavailable",
        `No ${method} cut-speed setting exists for ${thickness}" material (looked for ${candidates.map((c) => `${prefix}${c}`).join(", ")}) \u2014 ${rowLabel} would price with a hidden default`,
        { hold: "letters", letterTypes: ["dimensional_letters"] }
      );
    }
  }
  const matType = String(fab?.material_type || "").toLowerCase();
  if (matType) {
    const multKey = method === "laser" ? `${matType}_cut_multiplier` : `${matType}_cnc_cut_multiplier`;
    if (recorded(settings?.[multKey]) && channelPositiveNumber(settings[multKey]) === null) {
      addCat(
        multKey,
        "dimensional_setting_unavailable",
        `Setting ${multKey}: record a positive, finite cut multiplier or clear it`,
        { hold: "letters", letterTypes: ["dimensional_letters"] }
      );
    }
  }
  if (fab?.paint_letters && fab?.paint_sides !== "none") {
    for (const key of PAINT_REQUIRED_POSITIVE) {
      if (channelPositiveNumber(settings?.[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: record a positive, finite paint coverage (sqft/gal) \u2014 ${rowLabel} would price with a hidden default`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_REQUIRED_NONNEG) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative value in Paint Settings \u2014 ${rowLabel} would price with a hidden default`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_OPTIONAL) {
      if (recorded(settings?.[key]) && channelNonNegativeNumber(settings[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: fix the malformed value or clear it in Paint Settings`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_COST_FIELDS) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative paint component cost \u2014 liquid paint would price as $0`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_RATIO_FIELDS) {
      if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: record a finite, nonnegative paint mix ratio`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    for (const key of PAINT_UNIT_FIELDS) {
      if (recorded(settings?.[key]) && !PAINT_UNITS.has(settings[key])) {
        addCat(
          key,
          "dimensional_setting_unavailable",
          `Setting ${key}: "${settings[key]}" is not a supported paint unit (oz/pint/quart/liter/gallon)`,
          { hold: "letters", letterTypes: ["dimensional_letters"] }
        );
      }
    }
    const colors = Array.isArray(fab?.paint_colors) ? fab.paint_colors.filter((c) => c && String(c).trim() !== "") : [];
    const numColors = Math.max(1, colors.length || (channelPositiveNumber(fab?.num_paint_colors) ?? 1));
    if (numColors > 1 && channelPositiveNumber(fab?.paint_mask_sqft) !== null) {
      for (const key of PAINT_MASK_REQUIRED) {
        if (!recorded(settings?.[key]) || channelNonNegativeNumber(settings[key]) === null) {
          addCat(
            key,
            "dimensional_setting_unavailable",
            `Setting ${key}: record a finite, nonnegative paint-mask rate in Paint Settings`,
            { hold: "letters", letterTypes: ["dimensional_letters"] }
          );
        }
      }
    }
  }
};
var addOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
var sumStrict = (rows, field) => {
  let total = 0;
  for (const r of rows || []) {
    const v = channelNumber(r?.[field]);
    if (v === null) return null;
    total += v;
  }
  return total;
};
var calcChannelProject = ({ project, settings = {}, inventory = [], equipmentInventory = [], dimensionalMaterials = null, savedProject = null } = {}) => {
  const saved = savedProject || project || {};
  if (!settings || Object.keys(settings).length === 0) {
    return { recalculated: { ...project, __held: false, pricingUnavailable: false, issues: [] }, issues: [], held: false };
  }
  const issues = channelProjectIssues(project, { settings, inventory, equipmentInventory, dimensionalMaterials });
  const scope = project?.project_scope || "full";
  const lettersActive = scope !== "install_only";
  const installActive = scope !== "letters_only";
  const settingsWithEnv = { ...settings, _project_install_environment: project?.install_environment || "exterior" };
  const lettersTotals = !lettersActive ? { letters_subtotal: 0, total_letters_cost: 0, letter_purchases: project?.letter_purchases || [] } : calcLettersTotals(project, settingsWithEnv);
  const recalcItems = !installActive ? [] : (project?.items || []).map((it) => calcLineItem(it, settingsWithEnv, inventory));
  const projectForTotals = !installActive ? { ...project, ...lettersTotals, items: recalcItems, selected_equipment: [], personnel: [] } : { ...project, ...lettersTotals, items: recalcItems };
  const totals = calcProjectTotals(projectForTotals);
  const live = { ...project, ...lettersTotals, items: recalcItems, ...totals };
  const held = issues.length > 0;
  if (!held) {
    return {
      recalculated: { ...live, __held: false, pricingUnavailable: false, issues: [] },
      issues: [],
      held: false
    };
  }
  const rawPurchases = project?.letter_purchases || [];
  const rawItems = project?.items || [];
  const heldPurchaseIdx = /* @__PURE__ */ new Set();
  const heldItemIdx = /* @__PURE__ */ new Set();
  const holdSeen = /* @__PURE__ */ new Set();
  issues.forEach((i) => {
    holdSeen.add(i.hold);
    if (i.hold === "purchase" && i.index != null) heldPurchaseIdx.add(i.index);
    if (i.hold === "letters" && Array.isArray(i.letterTypes)) {
      rawPurchases.forEach((p, idx) => {
        if (i.letterTypes.includes(p?.letter_type)) heldPurchaseIdx.add(idx);
      });
    }
    if (i.hold === "install") {
      if (Array.isArray(i.itemIndexes)) i.itemIndexes.forEach((x) => heldItemIdx.add(x));
      else if (i.index != null) heldItemIdx.add(i.index);
      else rawItems.forEach((_, x) => heldItemIdx.add(x));
    }
  });
  const letter_purchases = (live.letter_purchases || []).map((p, idx) => heldPurchaseIdx.has(idx) ? { ...rawPurchases[idx], __held: true } : p);
  const itemsHeld = (live.items || []).map((it, idx) => heldItemIdx.has(idx) ? { ...rawItems[idx], __held: true } : it);
  const cat = (field, current) => Number.isFinite(current) ? current : hasChannelCostSnapshot(saved?.[field]) ? saved[field] : null;
  const purchasesTotal = letter_purchases.length === 0 ? 0 : letter_purchases.reduce((s, p) => {
    if (s === null || p.__held) return null;
    const v = channelNumber(p.total_cost);
    return v === null ? null : s + v;
  }, 0);
  const onlyDimensional = letter_purchases.length > 0 && letter_purchases.every((p) => p.letter_type === "dimensional_letters");
  const feeOrNull = (field) => recorded(project?.[field]) ? channelNonNegativeNumber(project[field]) : 0;
  const delivery = onlyDimensional ? 0 : feeOrNull("letters_delivery_fee");
  const lettersSubtotal = addOrNull(
    purchasesTotal,
    delivery,
    feeOrNull("letters_design_fee"),
    feeOrNull("letters_install_supplies_fee"),
    feeOrNull("letters_permitting_fee"),
    feeOrNull("letters_other_fee")
  );
  const lettersMarkupPct = recorded(project?.letters_markup_percent) ? channelNonNegativeNumber(project.letters_markup_percent) : 0;
  const letters_subtotal = cat("letters_subtotal", lettersSubtotal);
  const totalLetters = lettersMarkupPct === null ? null : Number.isFinite(letters_subtotal) ? letters_subtotal * (1 + lettersMarkupPct / 100) : null;
  const total_letters_cost = cat("total_letters_cost", totalLetters);
  const sumHeld = (rows, field) => {
    let total = 0;
    for (const r of rows || []) {
      if (r.__held) return null;
      const v = channelNumber(r[field]);
      if (v === null) return null;
      total += v;
    }
    return total;
  };
  const labor_hours = installActive ? cat("labor_hours", sumHeld(itemsHeld, "labor_hours")) : 0;
  const labor_cost = installActive ? cat("labor_cost", sumHeld(itemsHeld, "labor_cost")) : 0;
  const total_materials_cost = installActive ? cat("total_materials_cost", sumHeld(itemsHeld, "materials_cost")) : 0;
  const equipmentHeld = holdSeen.has("equipment");
  const personnelHeld = holdSeen.has("personnel");
  const total_equipment_cost = !installActive ? 0 : cat("total_equipment_cost", equipmentHeld ? null : sumStrict(project?.selected_equipment, "total_cost"));
  const total_personnel_cost = !installActive ? 0 : cat("total_personnel_cost", personnelHeld ? null : sumStrict(project?.personnel, "total_cost"));
  const labor_priced_via_personnel = Number.isFinite(total_personnel_cost) ? total_personnel_cost > 0 : hasChannelCostSnapshot(saved?.total_personnel_cost) ? saved.total_personnel_cost > 0 : !!saved?.labor_priced_via_personnel;
  const labor_cost_in_subtotal = labor_priced_via_personnel ? 0 : labor_cost;
  const travelHeld = holdSeen.has("travel");
  const travelCurrent = travelHeld ? null : recorded(project?.total_travel_cost) ? channelNonNegativeNumber(project.total_travel_cost) : 0;
  const total_travel_cost = !installActive ? 0 : cat("total_travel_cost", travelCurrent);
  const suppliesPct = recorded(project?.supplies_percent_of_materials) ? channelNonNegativeNumber(project.supplies_percent_of_materials) : 10;
  const extraSupplies = recorded(project?.extra_supplies_cost) ? channelNonNegativeNumber(project.extra_supplies_cost) : 0;
  const suppliesHeld = holdSeen.has("supplies");
  const suppliesCurrent = suppliesHeld || suppliesPct === null || extraSupplies === null || total_materials_cost === null ? null : total_materials_cost * (suppliesPct / 100) + extraSupplies;
  const total_supplies_cost = !installActive ? 0 : cat("total_supplies_cost", suppliesCurrent);
  const subtotalCurrent = addOrNull(
    labor_cost_in_subtotal,
    total_materials_cost,
    total_supplies_cost,
    total_equipment_cost,
    total_personnel_cost,
    total_travel_cost,
    lettersActive ? total_letters_cost : 0
  );
  const subtotal = cat("subtotal", subtotalCurrent);
  const markupPct = recorded(project?.markup_percent) ? channelNonNegativeNumber(project.markup_percent) : 0;
  const markupCurrent = holdSeen.has("markup") || markupPct === null ? null : Number.isFinite(subtotal) ? subtotal * (markupPct / 100) : null;
  const markup_amount = cat("markup_amount", markupCurrent);
  const total_cost = cat("total_cost", addOrNull(subtotal, markup_amount));
  const recalculated = {
    ...live,
    letter_purchases,
    items: itemsHeld,
    letters_subtotal,
    total_letters_cost,
    labor_hours,
    labor_cost,
    labor_cost_in_subtotal,
    labor_priced_via_personnel,
    total_materials_cost,
    total_supplies_cost,
    total_equipment_cost,
    total_personnel_cost,
    total_travel_cost,
    subtotal,
    markup_amount,
    total_cost,
    __held: true,
    pricingUnavailable: true,
    issues
  };
  return { recalculated, issues, held: true };
};
var issuesForField = (issues = [], field, itemIndex = null, index = null) => issues.filter((i) => i.field === field && (itemIndex === null || i.itemIndex === itemIndex) && (index === null || i.index === index));

// s:s://@/api/integrations
var GenerateImage = async () => {
  throw Error("offline GenerateImage blocked");
};

// frozen:/app/src/components/channelLetterInstall/MaterialsList.jsx
import { jsx as jsx12, jsxs as jsxs3 } from "react/jsx-runtime";
var fmt2 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
function MaterialsList({ item, itemIndex = null, inventory, onChange, issues = [] }) {
  const materials = item.materials || [];
  const [generatingIdx, setGeneratingIdx] = useState(null);
  const matIssues = (field, mi) => issuesForField(issues, field, mi, itemIndex);
  const matInvalid = (field, mi) => matIssues(field, mi).length > 0;
  const eligibleInventory = (inventory || []).filter((inv) => {
    if (inv.applies_to === "all") return true;
    return inv.applies_to === item.installation_type;
  });
  const addMaterial = (invId) => {
    const inv = inventory.find((i) => i.id === invId);
    if (!inv) return;
    if (materials.some((m) => m.inventory_item_id === invId)) return;
    const newMat = materialFromInventory(inv, item);
    if (inv.image_url) newMat.image_url = inv.image_url;
    onChange([...materials, newMat]);
  };
  const addCustomMaterial = () => {
    onChange([
      ...materials,
      {
        inventory_item_id: null,
        item_name: "Custom item",
        pricing_mode: "custom",
        unit_cost: 0,
        quantity: 1,
        total_cost: 0,
        is_custom: true,
        image_url: ""
      }
    ]);
  };
  const removeMaterial = (idx) => {
    if (!confirm(`Remove "${materials[idx]?.item_name || "this material"}"?`)) return;
    const next = [...materials];
    next.splice(idx, 1);
    onChange(next);
  };
  const updateMaterial = (idx, patch) => {
    const next = [...materials];
    next[idx] = { ...next[idx], ...patch };
    const u = channelNumber(next[idx].unit_cost);
    const q = channelNumber(next[idx].quantity);
    next[idx].total_cost = u === null || q === null ? null : u * q;
    onChange(next);
  };
  const generateImageForMaterial = async (idx) => {
    const mat = materials[idx];
    const name = (mat.item_name || "").trim();
    if (!name || name === "Custom item") {
      alert("Please name the material first.");
      return;
    }
    setGeneratingIdx(idx);
    try {
      const res = await GenerateImage({
        prompt: `Photograph of "${name}" \u2014 a signage installation material or hardware item used by professional sign installers. Product is centered in the frame, full item clearly visible, neutral light background, professional product photography, sharp focus, no people, no text overlay.`
      });
      if (res?.url) {
        updateMaterial(idx, { image_url: res.url });
      }
    } catch (e) {
      console.error("Image generation failed:", e);
      alert("Image generation failed: " + (e.message || "unknown error"));
    }
    setGeneratingIdx(null);
  };
  const totalMaterials = materials.reduce((s, m) => {
    if (s === null) return null;
    const v = channelNumber(m.total_cost);
    return v === null ? null : s + v;
  }, 0);
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx12(Package, { className: "w-4 h-4 text-slate-500" }),
        /* @__PURE__ */ jsx12("span", { className: "text-sm font-medium text-slate-700", children: "Materials" }),
        /* @__PURE__ */ jsxs3("span", { className: "text-xs text-slate-400", children: [
          "(",
          materials.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxs3(Select, { value: "", onValueChange: addMaterial, children: [
          /* @__PURE__ */ jsx12(SelectTrigger, { className: "h-8 text-xs w-auto min-w-[160px]", children: /* @__PURE__ */ jsx12(SelectValue, { placeholder: "+ Add material..." }) }),
          /* @__PURE__ */ jsx12(SelectContent, { children: eligibleInventory.length === 0 ? /* @__PURE__ */ jsx12("div", { className: "px-2 py-1.5 text-xs text-slate-500", children: "No inventory items match this install type" }) : eligibleInventory.map((inv) => /* @__PURE__ */ jsx12(
            SelectItem,
            {
              value: inv.id,
              disabled: materials.some((m) => m.inventory_item_id === inv.id),
              children: inv.item_name
            },
            inv.id
          )) })
        ] }),
        /* @__PURE__ */ jsxs3(
          Button,
          {
            type: "button",
            variant: "outline",
            size: "sm",
            onClick: addCustomMaterial,
            className: "h-8 text-xs",
            children: [
              /* @__PURE__ */ jsx12(Plus, { className: "w-3 h-3 mr-1" }),
              " Custom"
            ]
          }
        )
      ] })
    ] }),
    materials.length === 0 ? /* @__PURE__ */ jsx12("div", { className: "text-xs text-slate-400 italic px-2 py-3 text-center border border-dashed border-slate-200 rounded", children: "No materials added. Use the dropdown to add from inventory." }) : /* @__PURE__ */ jsx12("div", { className: "border border-slate-200 rounded-lg overflow-hidden", children: /* @__PURE__ */ jsxs3("table", { className: "w-full text-xs", children: [
      /* @__PURE__ */ jsx12("thead", { className: "bg-slate-50 text-slate-600", children: /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx12("th", { className: "text-left px-2 py-1.5 font-medium w-12", children: "Img" }),
        /* @__PURE__ */ jsx12("th", { className: "text-left px-2 py-1.5 font-medium", children: "Item" }),
        /* @__PURE__ */ jsx12("th", { className: "text-right px-2 py-1.5 font-medium w-20", children: "Unit $" }),
        /* @__PURE__ */ jsx12("th", { className: "text-right px-2 py-1.5 font-medium w-16", children: "Qty" }),
        /* @__PURE__ */ jsx12("th", { className: "text-right px-2 py-1.5 font-medium w-20", children: "Total" }),
        /* @__PURE__ */ jsx12("th", { className: "w-8" })
      ] }) }),
      /* @__PURE__ */ jsx12("tbody", { children: materials.map((m, idx) => /* @__PURE__ */ jsxs3("tr", { className: "border-t border-slate-100", children: [
        /* @__PURE__ */ jsx12("td", { className: "px-2 py-1", children: m.image_url ? /* @__PURE__ */ jsx12(
          "img",
          {
            src: m.image_url,
            alt: m.item_name,
            className: "w-10 h-10 object-contain rounded border border-slate-200 bg-white"
          }
        ) : /* @__PURE__ */ jsx12(
          "button",
          {
            type: "button",
            onClick: () => generateImageForMaterial(idx),
            disabled: generatingIdx === idx,
            title: "Generate image with AI",
            className: "w-10 h-10 rounded border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-purple-600 disabled:opacity-50",
            children: generatingIdx === idx ? /* @__PURE__ */ jsx12(Loader2, { className: "w-4 h-4 animate-spin" }) : /* @__PURE__ */ jsx12(ImageIcon, { className: "w-4 h-4" })
          }
        ) }),
        /* @__PURE__ */ jsx12("td", { className: "px-2 py-1", children: m.is_custom ? /* @__PURE__ */ jsx12(
          Input,
          {
            value: m.item_name || "",
            onChange: (e) => updateMaterial(idx, { item_name: e.target.value }),
            onBlur: () => {
              const name = (m.item_name || "").trim();
              if (!m.image_url && name && name !== "Custom item" && generatingIdx === null) {
                generateImageForMaterial(idx);
              }
            },
            className: "h-7 text-xs",
            placeholder: "Custom item name"
          }
        ) : m.item_name }),
        /* @__PURE__ */ jsxs3("td", { className: "px-2 py-1", children: [
          /* @__PURE__ */ jsx12(
            Input,
            {
              type: "number",
              step: "0.01",
              value: m.unit_cost ?? "",
              onFocus: (e) => e.target.select(),
              onChange: (e) => updateMaterial(idx, { unit_cost: channelDraftValue(e.target.value) }),
              className: `h-7 text-xs text-right ${matInvalid("unit_cost", idx) ? "border-red-500" : ""}`,
              "aria-invalid": matInvalid("unit_cost", idx) || void 0,
              "aria-describedby": matInvalid("unit_cost", idx) ? `cli-${itemIndex}-mat-${idx}-unit-issue` : void 0,
              title: matIssues("unit_cost", idx)[0]?.message
            }
          ),
          matInvalid("unit_cost", idx) && /* @__PURE__ */ jsx12("p", { id: `cli-${itemIndex}-mat-${idx}-unit-issue`, className: "text-[10px] text-red-600", role: "alert", children: matIssues("unit_cost", idx)[0].message })
        ] }),
        /* @__PURE__ */ jsxs3("td", { className: "px-2 py-1", children: [
          /* @__PURE__ */ jsx12(
            Input,
            {
              type: "number",
              step: "0.01",
              value: m.quantity ?? "",
              onFocus: (e) => e.target.select(),
              onChange: (e) => updateMaterial(idx, { quantity: channelDraftValue(e.target.value) }),
              className: `h-7 text-xs text-right ${matInvalid("quantity", idx) ? "border-red-500" : ""}`,
              "aria-invalid": matInvalid("quantity", idx) || void 0,
              "aria-describedby": matInvalid("quantity", idx) ? `cli-${itemIndex}-mat-${idx}-qty-issue` : void 0,
              title: matIssues("quantity", idx)[0]?.message
            }
          ),
          matInvalid("quantity", idx) && /* @__PURE__ */ jsx12("p", { id: `cli-${itemIndex}-mat-${idx}-qty-issue`, className: "text-[10px] text-red-600", role: "alert", children: matIssues("quantity", idx)[0].message })
        ] }),
        /* @__PURE__ */ jsx12("td", { className: "px-2 py-1 text-right font-medium tabular-nums", children: fmt2(m.total_cost) }),
        /* @__PURE__ */ jsx12("td", { className: "px-1 py-1", children: /* @__PURE__ */ jsx12(
          Button,
          {
            variant: "ghost",
            size: "sm",
            onClick: () => removeMaterial(idx),
            className: "h-6 w-6 p-0 text-red-500 hover:bg-red-50",
            children: /* @__PURE__ */ jsx12(Trash2, { className: "w-3 h-3" })
          }
        ) })
      ] }, idx)) }),
      /* @__PURE__ */ jsx12("tfoot", { className: "bg-slate-50 border-t border-slate-200", children: /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx12("td", { colSpan: "4", className: "px-2 py-1.5 text-right font-medium", children: "Materials Total" }),
        /* @__PURE__ */ jsx12("td", { className: "px-2 py-1.5 text-right font-semibold tabular-nums", children: fmt2(totalMaterials) }),
        /* @__PURE__ */ jsx12("td", {})
      ] }) })
    ] }) })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/InstallTypePicker.jsx
import React5 from "react";

// frozen:/app/src/components/channelLetterInstall/CyclingImage.jsx
import React4, { useState as useState2, useEffect } from "react";
import { jsx as jsx13 } from "react/jsx-runtime";
function CyclingImage({ images, alt, intervalMs = 1e4, className = "" }) {
  const list = Array.isArray(images) && images.length > 0 ? images : [];
  const [idx, setIdx] = useState2(
    () => list.length > 1 ? Math.floor(Math.random() * list.length) : 0
  );
  useEffect(() => {
    if (list.length <= 1) return;
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % list.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [list.length, intervalMs]);
  if (list.length === 0) {
    return /* @__PURE__ */ jsx13("div", { className: `bg-slate-100 ${className}` });
  }
  return /* @__PURE__ */ jsx13("div", { className: `relative bg-slate-100 overflow-hidden ${className}`, children: list.map((src, i) => /* @__PURE__ */ jsx13(
    "img",
    {
      src,
      alt,
      loading: "lazy",
      className: `absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0"}`
    },
    src
  )) });
}

// frozen:/app/src/components/channelLetterInstall/InstallTypePicker.jsx
import { jsx as jsx14, jsxs as jsxs4 } from "react/jsx-runtime";
var BASE = "https://media.base44.com/images/public/68a5a85045cf8570330146ef/";
var TYPES = [
  {
    id: "flush_mount",
    label: "Flush Mount",
    description: "Letters mounted flat to wall",
    example: "e.g. retail storefront, office lobby",
    images: [
      "c1dec958a",
      "7c8c1d09f",
      "2907d461a",
      "355d62b6a",
      "795df3288",
      "216b21ecc",
      "abe8b7df1",
      "79b30b6d9",
      "70ddcec95",
      "ba6fb0479"
    ],
    accent: "border-blue-500 bg-blue-50 text-blue-900",
    accentDot: "bg-blue-500"
  },
  {
    id: "halo_lit",
    label: "Halo-Lit",
    description: "Backlit with standoffs (reverse-lit)",
    example: "e.g. corporate HQ, restaurant exterior",
    images: [
      "fef3762ec",
      "79bd2c918",
      "0bcccdd3a",
      "8f1f68269",
      "21925927d",
      "62fb6f9ab",
      "67db77fb8",
      "793fd8120",
      "afbe69411",
      "041c2928a"
    ],
    accent: "border-amber-500 bg-amber-50 text-amber-900",
    accentDot: "bg-amber-500"
  },
  {
    id: "raceway",
    label: "Raceway",
    description: "Letters mounted on a power-feed bar",
    example: "e.g. strip mall, shopping center",
    images: [
      "fff304050",
      "ab23bffd2",
      "26917ff97",
      "239f865d9",
      "b339c00ca",
      "ce9921b80",
      "de8222d6f",
      "59168c7bd",
      "69bb91603",
      "9daa9d8ad"
    ],
    accent: "border-purple-500 bg-purple-50 text-purple-900",
    accentDot: "bg-purple-500"
  },
  {
    id: "dimensional_lettering",
    label: "Dimensional Lettering",
    description: "Non-illuminated solid / fabricated letters",
    example: "e.g. acrylic, foam, metal flat-cut",
    images: [
      "98e05518a",
      "abb0a0232",
      "2daa53740",
      "1e95036bc",
      "603b1288d"
    ],
    accent: "border-teal-500 bg-teal-50 text-teal-900",
    accentDot: "bg-teal-500"
  }
].map((t) => ({ ...t, images: t.images.map((id) => `${BASE}${id}_generated_image.png`) }));
function InstallTypePicker({ value, onChange }) {
  return /* @__PURE__ */ jsx14("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2", children: TYPES.map((t) => {
    const selected = value === t.id;
    return /* @__PURE__ */ jsxs4(
      "button",
      {
        type: "button",
        type: "button",
        onClick: () => onChange(t.id),
        className: `relative rounded-lg border-2 transition-all text-left overflow-hidden ${selected ? t.accent + " shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`,
        children: [
          selected && /* @__PURE__ */ jsx14("div", { className: `absolute top-2 right-2 w-2 h-2 rounded-full ${t.accentDot} z-10` }),
          /* @__PURE__ */ jsx14(
            CyclingImage,
            {
              images: t.images,
              alt: t.label,
              className: "w-full aspect-video",
              intervalMs: 1e4
            }
          ),
          /* @__PURE__ */ jsxs4("div", { className: "p-2.5", children: [
            /* @__PURE__ */ jsx14("div", { className: "text-sm font-semibold", children: t.label }),
            /* @__PURE__ */ jsx14("div", { className: "text-[10px] opacity-70 leading-tight", children: t.description }),
            /* @__PURE__ */ jsx14("div", { className: "text-[9px] opacity-60 leading-tight mt-1 italic", children: t.example })
          ] })
        ]
      },
      t.id
    );
  }) });
}

// frozen:/app/src/components/channelLetterInstall/LetterSizePicker.jsx
import React6 from "react";
import { jsx as jsx15, jsxs as jsxs5 } from "react/jsx-runtime";
var BASE2 = "https://media.base44.com/images/public/68a5a85045cf8570330146ef/";
var SIZES = [
  {
    id: "extra_small",
    label: "XS",
    range: '2"-8"',
    example: "Door / suite plaque",
    images: [
      "555cbbeca",
      "47cc68c3c",
      "0ae8a25a5",
      "86981777e",
      "595485382",
      "fca2b7964",
      "81c712070",
      "850521dd1",
      "fe029cb70",
      "612e64f5f"
    ]
  },
  {
    id: "small",
    label: "Small",
    range: '8"-12"',
    example: "Window / shop sign",
    images: [
      "e2e2d9788",
      "c8c64cc17",
      "d1f219407",
      "319d90fc6",
      "4b34667b7",
      "ba5486827",
      "e4ce924fb",
      "7a979f1a5",
      "f96f64467"
    ]
  },
  {
    id: "medium",
    label: "Medium",
    range: '12"-24"',
    example: "Standard storefront",
    images: [
      "f75172321",
      "5deeae55b",
      "32e8d9f84",
      "3ff95f7ac",
      "23d74bd82",
      "0d047f81d",
      "dbd1cb24e",
      "56f698c81",
      "e34477987",
      "5cb8deeb8"
    ]
  },
  {
    id: "large",
    label: "Large",
    range: '24"-48"',
    example: "Building fa\xE7ade",
    images: [
      "61ed95929",
      "1015872f4",
      "ee23edf18",
      "c6d1d57da",
      "e458fd3e2",
      "b1bad6ab4",
      "8b04ed34e",
      "5cbe67a69",
      "1133885b1",
      "f36e8b4cc"
    ]
  },
  {
    id: "extra_large",
    label: "XL",
    range: '48"-60"',
    example: "Highway-visible sign",
    images: [
      "0a7924cfe",
      "edaf2fcd6",
      "78a3b5323",
      "6d0ba4af5",
      "fa9670076",
      "a5e6bb7d1",
      "10e103fd9",
      "68799ccfd",
      "e5b918e05",
      "3911df154"
    ]
  },
  {
    id: "extra_extra_large",
    label: "XXL",
    range: '60"+',
    example: "Monument / tower sign",
    images: [
      "918d12caf",
      "0fd09f6ba",
      "430500a5c",
      "72eb52e51",
      "985bb14fd",
      "dceb534d3",
      "8ddf701e5",
      "ec2aad86d",
      "684f4bda2",
      "e8fa5c330"
    ]
  }
].map((s) => ({ ...s, images: s.images.map((id) => `${BASE2}${id}_generated_image.png`) }));
function LetterSizePicker({ value, onChange }) {
  return /* @__PURE__ */ jsx15("div", { className: "grid grid-cols-3 md:grid-cols-6 gap-1.5", children: SIZES.map((s) => {
    const selected = value === s.id;
    return /* @__PURE__ */ jsxs5(
      "button",
      {
        type: "button",
        type: "button",
        onClick: () => onChange(s.id),
        className: `relative rounded-lg border-2 transition-all overflow-hidden text-left ${selected ? "border-purple-500 bg-purple-50 text-purple-900 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`,
        title: `${s.range} \u2014 ${s.example}`,
        children: [
          /* @__PURE__ */ jsx15(
            CyclingImage,
            {
              images: s.images,
              alt: `${s.label} channel letters`,
              className: "w-full aspect-[4/3]",
              intervalMs: 1e4
            }
          ),
          /* @__PURE__ */ jsxs5("div", { className: "p-1.5 text-center", children: [
            /* @__PURE__ */ jsx15("div", { className: "text-[11px] font-semibold", children: s.label }),
            /* @__PURE__ */ jsx15("div", { className: "text-[9px] opacity-70", children: s.range }),
            /* @__PURE__ */ jsx15("div", { className: "text-[8px] opacity-60 leading-tight mt-0.5", children: s.example })
          ] })
        ]
      },
      s.id
    );
  }) });
}

// frozen:/app/src/components/channelLetterInstall/ConditionPicker.jsx
import React7 from "react";

// s:s://@/components/ui/slider
import { jsx as jsx16 } from "react/jsx-runtime";
var Slider = (p) => /* @__PURE__ */ jsx16("input", { type: "range", value: Array.isArray(p.value) ? p.value[0] : p.value, onChange: (e) => p.onValueChange?.([parseFloat(e.target.value)]) });

// frozen:/app/src/components/channelLetterInstall/ConditionPicker.jsx
import { jsx as jsx17, jsxs as jsxs6 } from "react/jsx-runtime";
var ELECTRICAL_SEVERITY_DEFAULTS = {
  1: "A Bit Harder",
  2: "Mildly Annoying",
  3: "Inconvenient",
  4: "Real Pain",
  5: "Frustrating",
  6: "Seriously?",
  7: "Nightmare Fuel",
  8: "Who Designed This?",
  9: "Total Disaster",
  10: "What the Heck is Wrong With These People!?"
};
var SITE_ACCESS_SEVERITY_DEFAULTS = {
  1: "Mildly Cramped",
  2: "Slightly Awkward",
  3: "Squeeze Play",
  4: "Tight Quarters",
  5: "Obstacle Course",
  6: "Where Does the Lift Go?",
  7: "Sketchy Footing",
  8: "Hold My Coffee",
  9: "Mission Impossible",
  10: "Did a Sign Even Belong Here?"
};
var labelFromSettings = (settings, key, fallback) => {
  const v = settings && settings[key];
  if (typeof v === "string" && v.trim()) return v;
  return fallback;
};
var BASE3 = "https://media.base44.com/images/public/68a5a85045cf8570330146ef/";
var CONDITIONS = [
  {
    id: "thick_hollow_walls",
    label: "Thick / Hollow Walls",
    description: "Brick veneer, masonry, hollow cavity",
    images: [
      "354337612",
      "84462815e",
      "5b7a796e9",
      "3e74960b9",
      "f3485fd9a",
      "bf147d559",
      "d188f44b1",
      "5d1898ed4",
      "084e9cdf8",
      "dade9676f"
    ],
    accent: "border-orange-500 bg-orange-50 text-orange-900",
    accentDot: "bg-orange-500"
  },
  {
    id: "parapet",
    label: "Parapet",
    description: "Working over rooftop edge wall",
    images: [
      "46e545715",
      "dc634e87b",
      "d20b09c6e",
      "f0be4b794",
      "4678784bb",
      "f56669274",
      "43a05074f",
      "46609c428",
      "50ac973f7",
      "0b19729fe"
    ],
    accent: "border-red-500 bg-red-50 text-red-900",
    accentDot: "bg-red-500"
  },
  {
    id: "poor_electrical_access",
    label: "Poor Electrical Access",
    description: "Difficult conduit / power routing",
    images: [
      "1ec96707a",
      "d5ae58684",
      "57fcecc8c",
      "c5347f3af",
      "509147fed",
      "6b56939ac",
      "dcf9c1adc",
      "8ec6bf0fe",
      "e09579e01",
      "0915a9043"
    ],
    accent: "border-yellow-500 bg-yellow-50 text-yellow-900",
    accentDot: "bg-yellow-500"
  },
  {
    id: "escort_required",
    label: "Escort Required",
    description: "Must be escorted on-site at all times",
    images: [
      "2f0c1de7c",
      "c687a46d3",
      "1c49571c6",
      "412d12b68",
      "ffb60cf1f",
      "917adf941",
      "700611476",
      "4650bb73b",
      "b42272e3d"
    ],
    accent: "border-sky-500 bg-sky-50 text-sky-900",
    accentDot: "bg-sky-500"
  },
  {
    id: "badging_checkin",
    label: "Badging / Check-in",
    description: "Security badge or sign-in required",
    images: [
      "f2ded6395",
      "aa55e3ae9",
      "cf1cadee6",
      "388fcc5a8",
      "b45f279f4",
      "0f1161fe7",
      "39a14f0a2",
      "4200e28a3",
      "891770826"
    ],
    accent: "border-indigo-500 bg-indigo-50 text-indigo-900",
    accentDot: "bg-indigo-500"
  },
  {
    id: "after_hours_weekend",
    label: "After-Hours / Weekend",
    description: "Night, early morning, or weekend install",
    images: [
      "1cdf0e29e",
      "f58ad5ed6",
      "ac51fe06c",
      "e1e776e0f",
      "42caaf28b",
      "de4312c59",
      "89abe805e",
      "287c5d801",
      "ae9640c42"
    ],
    accent: "border-violet-500 bg-violet-50 text-violet-900",
    accentDot: "bg-violet-500"
  },
  {
    id: "set_hours_installation",
    label: "Set-Hours Installation",
    description: "Fixed time window / scheduled appointment",
    images: [
      "1670f70d1",
      "1c5add52a",
      "e3768da95",
      "d36581597",
      "5b6acff88",
      "a3f771ff2",
      "ab486c2bb",
      "516c15423",
      "c9c9de17b"
    ],
    accent: "border-teal-500 bg-teal-50 text-teal-900",
    accentDot: "bg-teal-500"
  },
  {
    id: "poor_site_access",
    label: "Poor Site Access",
    description: "No lift room, obstructions, tight space",
    images: [
      "786a757c7",
      "16a9c332e",
      "f1fb9a541",
      "028ff7b47",
      "22d9b1525",
      "e9785417c",
      "7794ec650",
      "87e0ab013",
      "28eb113ca"
    ],
    accent: "border-rose-500 bg-rose-50 text-rose-900",
    accentDot: "bg-rose-500"
  }
].map((c) => ({ ...c, images: c.images.map((id) => `${BASE3}${id}_generated_image.png`) }));
function ConditionPicker({ values, onChange, settings = {} }) {
  const toggle = (id) => onChange({ ...values, [id]: !values[id] });
  const elecSeverity = Math.max(1, Math.min(10, parseInt(values.poor_electrical_severity) || 1));
  const siteSeverity = Math.max(1, Math.min(10, parseInt(values.poor_site_access_severity) || 1));
  const parapetRouting = values.parapet_electrical_routing === "drop" ? "drop" : "roof";
  const elecLabel = labelFromSettings(
    settings,
    `install_poor_electrical_label_${elecSeverity}`,
    ELECTRICAL_SEVERITY_DEFAULTS[elecSeverity]
  );
  const siteLabel = labelFromSettings(
    settings,
    `install_site_access_label_${siteSeverity}`,
    SITE_ACCESS_SEVERITY_DEFAULTS[siteSeverity]
  );
  return /* @__PURE__ */ jsx17("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2", children: CONDITIONS.map((c) => {
    const selected = !!values[c.id];
    const isElectrical = c.id === "poor_electrical_access";
    const isSiteAccess = c.id === "poor_site_access";
    const isParapet = c.id === "parapet";
    return /* @__PURE__ */ jsxs6(
      "div",
      {
        className: `relative rounded-lg border-2 transition-all text-left overflow-hidden ${selected ? c.accent + " shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`,
        children: [
          isElectrical && selected && /* @__PURE__ */ jsxs6(
            "div",
            {
              className: "px-2.5 pt-2.5 pb-1 bg-yellow-100/60 border-b border-yellow-300",
              onClick: (e) => e.stopPropagation(),
              children: [
                /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-1.5 mb-1", children: [
                  /* @__PURE__ */ jsx17(Zap, { className: "w-3 h-3 text-yellow-700" }),
                  /* @__PURE__ */ jsxs6("span", { className: "text-[10px] font-bold text-yellow-900 uppercase tracking-wide", children: [
                    "Severity ",
                    elecSeverity,
                    "/10"
                  ] })
                ] }),
                /* @__PURE__ */ jsx17(
                  Slider,
                  {
                    min: 1,
                    max: 10,
                    step: 1,
                    value: [elecSeverity],
                    onValueChange: (v) => onChange({ ...values, poor_electrical_severity: v[0] }),
                    className: "my-1"
                  }
                ),
                /* @__PURE__ */ jsxs6("div", { className: "text-[10px] font-semibold text-yellow-900 leading-tight italic h-7 flex items-center", children: [
                  '"',
                  elecLabel,
                  '"'
                ] })
              ]
            }
          ),
          isParapet && selected && /* @__PURE__ */ jsxs6(
            "div",
            {
              className: "px-2.5 pt-2.5 pb-1 bg-red-100/60 border-b border-red-300",
              onClick: (e) => e.stopPropagation(),
              children: [
                /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-1.5 mb-1", children: [
                  parapetRouting === "drop" ? /* @__PURE__ */ jsx17(ArrowDownToLine, { className: "w-3 h-3 text-red-700" }) : /* @__PURE__ */ jsx17(Mountain, { className: "w-3 h-3 text-red-700" }),
                  /* @__PURE__ */ jsx17("span", { className: "text-[10px] font-bold text-red-900 uppercase tracking-wide", children: "Electrical Routing" })
                ] }),
                /* @__PURE__ */ jsx17(
                  Slider,
                  {
                    min: 0,
                    max: 1,
                    step: 1,
                    value: [parapetRouting === "drop" ? 1 : 0],
                    onValueChange: (v) => onChange({
                      ...values,
                      parapet_electrical_routing: v[0] === 1 ? "drop" : "roof"
                    }),
                    className: "my-1"
                  }
                ),
                /* @__PURE__ */ jsx17("div", { className: "text-[10px] font-semibold text-red-900 leading-tight italic h-7 flex items-center", children: parapetRouting === "drop" ? '"Drops inside parapet" (harder)' : '"Runs on roof" (easier)' })
              ]
            }
          ),
          isSiteAccess && selected && /* @__PURE__ */ jsxs6(
            "div",
            {
              className: "px-2.5 pt-2.5 pb-1 bg-rose-100/60 border-b border-rose-300",
              onClick: (e) => e.stopPropagation(),
              children: [
                /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-1.5 mb-1", children: [
                  /* @__PURE__ */ jsx17(Navigation, { className: "w-3 h-3 text-rose-700" }),
                  /* @__PURE__ */ jsxs6("span", { className: "text-[10px] font-bold text-rose-900 uppercase tracking-wide", children: [
                    "Severity ",
                    siteSeverity,
                    "/10"
                  ] })
                ] }),
                /* @__PURE__ */ jsx17(
                  Slider,
                  {
                    min: 1,
                    max: 10,
                    step: 1,
                    value: [siteSeverity],
                    onValueChange: (v) => onChange({ ...values, poor_site_access_severity: v[0] }),
                    className: "my-1"
                  }
                ),
                /* @__PURE__ */ jsxs6("div", { className: "text-[10px] font-semibold text-rose-900 leading-tight italic h-7 flex items-center", children: [
                  '"',
                  siteLabel,
                  '"'
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxs6(
            "button",
            {
              type: "button",
              onClick: () => toggle(c.id),
              className: "block w-full text-left",
              children: [
                selected && /* @__PURE__ */ jsx17("div", { className: `absolute top-2 right-2 w-5 h-5 rounded-full ${c.accentDot} flex items-center justify-center z-10`, children: /* @__PURE__ */ jsx17(Check, { className: "w-3 h-3 text-white" }) }),
                /* @__PURE__ */ jsx17(
                  CyclingImage,
                  {
                    images: c.images,
                    alt: c.label,
                    className: "w-full aspect-video",
                    intervalMs: 5e3
                  }
                ),
                /* @__PURE__ */ jsxs6("div", { className: "p-2.5", children: [
                  /* @__PURE__ */ jsx17("div", { className: "text-sm font-semibold", children: c.label }),
                  /* @__PURE__ */ jsx17("div", { className: "text-[10px] opacity-70 leading-tight", children: c.description })
                ] })
              ]
            }
          )
        ]
      },
      c.id
    );
  }) });
}

// frozen:/app/src/components/channelLetterInstall/WallMaterialPicker.jsx
import React8 from "react";
import { jsx as jsx18, jsxs as jsxs7 } from "react/jsx-runtime";
function WallMaterialPicker({ value, onChange }) {
  return /* @__PURE__ */ jsx18("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2", children: WALL_MATERIALS.map((m) => {
    const selected = value === m.id;
    return /* @__PURE__ */ jsxs7(
      "button",
      {
        type: "button",
        type: "button",
        onClick: () => onChange(m.id),
        className: `text-left rounded-lg border px-3 py-2 transition-all ${selected ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`,
        children: [
          /* @__PURE__ */ jsx18("div", { className: `text-xs font-semibold leading-tight ${selected ? "text-purple-900" : "text-slate-800"}`, children: m.label }),
          /* @__PURE__ */ jsx18("div", { className: "text-[10px] text-slate-500 mt-0.5 leading-tight", children: m.description })
        ]
      },
      m.id
    );
  }) });
}

// frozen:/app/src/components/channelLetterInstall/InstallHeightSlider.jsx
import React9, { useState as useState3 } from "react";

// s:s://@/components/channelLetterInstall/BoomLiftReachChart
var BoomLiftReachChart_default = () => null;

// frozen:/app/src/components/channelLetterInstall/InstallHeightSlider.jsx
import { jsx as jsx19, jsxs as jsxs8 } from "react/jsx-runtime";
var MAX_FT = 180;
var getZone = (h) => {
  if (h >= 55) return {
    key: "red",
    label: "Rental Boom Lift Required",
    Icon: AlertCircle,
    track: "bg-red-500",
    range: "bg-red-500",
    thumb: "border-red-600 bg-red-50",
    bg: "bg-red-50 border-red-200",
    text: "text-red-800"
  };
  if (h >= 40) return {
    key: "yellow",
    label: "Can we reach from our parking location?",
    Icon: AlertTriangle,
    track: "bg-yellow-400",
    range: "bg-yellow-400",
    thumb: "border-yellow-500 bg-yellow-50",
    bg: "bg-yellow-50 border-yellow-200",
    text: "text-yellow-800"
  };
  return {
    key: "green",
    label: "Standard reach \u2014 ladders / small lift",
    Icon: CheckCircle2,
    track: "bg-emerald-500",
    range: "bg-emerald-500",
    thumb: "border-emerald-600 bg-emerald-50",
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800"
  };
};
function InstallHeightSlider({ value, onChange }) {
  const h = parseFloat(value) || 0;
  const zone = getZone(h);
  const Icon = zone.Icon;
  const [showChart, setShowChart] = useState3(false);
  return /* @__PURE__ */ jsxs8("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsx19(
        Input,
        {
          type: "number",
          value,
          onFocus: (e) => e.target.select(),
          onChange: (e) => onChange(parseFloat(e.target.value) || 0),
          className: "h-9 w-24"
        }
      ),
      /* @__PURE__ */ jsx19("span", { className: "text-xs text-slate-500", children: "ft" }),
      /* @__PURE__ */ jsxs8(
        Button,
        {
          type: "button",
          variant: "outline",
          size: "sm",
          onClick: () => setShowChart((s) => !s),
          className: "ml-auto h-8 text-xs gap-1.5",
          title: "Show / hide boom lift reach chart",
          children: [
            /* @__PURE__ */ jsx19(BarChart3, { className: "w-3.5 h-3.5 text-purple-600" }),
            "Reach Chart",
            showChart ? /* @__PURE__ */ jsx19(ChevronUp, { className: "w-3 h-3" }) : /* @__PURE__ */ jsx19(ChevronDown, { className: "w-3 h-3" })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "px-1", children: [
      /* @__PURE__ */ jsx19(
        Slider,
        {
          value: [Math.min(h, MAX_FT)],
          min: 0,
          max: MAX_FT,
          step: 1,
          onValueChange: (v) => onChange(v[0]),
          colorClass: zone.range
        }
      ),
      /* @__PURE__ */ jsxs8("div", { className: "flex justify-between text-[10px] text-slate-400 mt-1 px-0.5", children: [
        /* @__PURE__ */ jsx19("span", { children: "0" }),
        /* @__PURE__ */ jsx19("span", { className: "text-emerald-600", children: "40" }),
        /* @__PURE__ */ jsx19("span", { className: "text-yellow-600", children: "55" }),
        /* @__PURE__ */ jsx19("span", { children: "120" }),
        /* @__PURE__ */ jsxs8("span", { children: [
          MAX_FT,
          "+"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: `flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${zone.bg} ${zone.text}`, children: [
      /* @__PURE__ */ jsx19(Icon, { className: "w-3.5 h-3.5 shrink-0" }),
      /* @__PURE__ */ jsx19("span", { className: "font-medium", children: zone.label })
    ] }),
    showChart && /* @__PURE__ */ jsx19("div", { className: "border border-purple-200 bg-purple-50/30 rounded-lg p-3", children: /* @__PURE__ */ jsx19(BoomLiftReachChart_default, { installationHeightFeet: h }) })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/InstallLineItem.jsx
import { jsx as jsx20, jsxs as jsxs9 } from "react/jsx-runtime";
var fmt3 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var TYPE_BADGE_COLOR = {
  flush_mount: "bg-blue-50 text-blue-700 border-blue-200",
  halo_lit: "bg-amber-50 text-amber-700 border-amber-200",
  raceway: "bg-purple-50 text-purple-700 border-purple-200",
  dimensional_lettering: "bg-teal-50 text-teal-700 border-teal-200"
};
function InstallLineItem({ item, index, inventory, settings = {}, onUpdate, onRemove, onDuplicate, compact: compact2 = false, issues = [] }) {
  const [expanded, setExpanded] = useState4(!compact2);
  const [advancedOpen, setAdvancedOpen] = useState4(false);
  const isRaceway = item.installation_type === "raceway";
  const fieldIssues = (field) => issuesForField(issues, field, null, index);
  const invalidCls = (field) => fieldIssues(field).length ? "border-red-500" : "";
  const ariaFor = (field) => fieldIssues(field).length ? { "aria-invalid": true, "aria-describedby": `cli-${index}-${field}-issue` } : {};
  const FieldIssue = ({ field }) => {
    const fi = fieldIssues(field);
    if (!fi.length) return null;
    return /* @__PURE__ */ jsx20("p", { id: `cli-${index}-${field}-issue`, className: "text-[10px] text-red-600 mt-0.5", role: "alert", children: fi[0].message });
  };
  const activeConditionsCount = [
    item.thick_hollow_walls,
    item.parapet,
    item.poor_electrical_access,
    item.escort_required,
    item.badging_checkin,
    item.after_hours_weekend,
    item.set_hours_installation,
    item.poor_site_access
  ].filter(Boolean).length;
  useEffect2(() => {
    setExpanded(!compact2);
  }, [compact2]);
  const update = (patch) => onUpdate({ ...item, ...patch });
  const wallMat = WALL_MATERIAL_MAP[item.wall_material];
  const conditionBadges = [];
  if (wallMat) conditionBadges.push({ label: wallMat.label, color: "bg-purple-50 text-purple-700 border-purple-200" });
  if (item.thick_hollow_walls) conditionBadges.push({ label: "Thick Walls", color: "bg-orange-50 text-orange-700 border-orange-200" });
  if (item.parapet) conditionBadges.push({ label: "Parapet", color: "bg-red-50 text-red-700 border-red-200" });
  if (item.poor_electrical_access) conditionBadges.push({ label: "Poor Electrical", color: "bg-yellow-50 text-yellow-800 border-yellow-200" });
  if (item.escort_required) conditionBadges.push({ label: "Escort Req'd", color: "bg-sky-50 text-sky-700 border-sky-200" });
  if (item.badging_checkin) conditionBadges.push({ label: "Badging/Check-in", color: "bg-indigo-50 text-indigo-700 border-indigo-200" });
  if (item.after_hours_weekend) conditionBadges.push({ label: "After-Hours", color: "bg-violet-50 text-violet-700 border-violet-200" });
  if (item.set_hours_installation) conditionBadges.push({ label: "Set-Hours", color: "bg-teal-50 text-teal-700 border-teal-200" });
  if (item.poor_site_access) conditionBadges.push({ label: "Poor Site Access", color: "bg-rose-50 text-rose-700 border-rose-200" });
  return /* @__PURE__ */ jsxs9(Card, { className: "border border-slate-200 shadow-sm overflow-hidden", children: [
    /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100 flex-wrap", children: [
      /* @__PURE__ */ jsx20("button", { type: "button", onClick: () => setExpanded((e) => !e), className: "text-slate-500 hover:text-slate-900", children: expanded ? /* @__PURE__ */ jsx20(ChevronDown, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx20(ChevronRight, { className: "w-4 h-4" }) }),
      /* @__PURE__ */ jsxs9("span", { className: "text-xs font-semibold text-slate-500 w-6", children: [
        "#",
        index + 1
      ] }),
      /* @__PURE__ */ jsx20(
        Input,
        {
          value: item.description || "",
          onChange: (e) => update({ description: e.target.value }),
          placeholder: `${TYPE_LABELS[item.installation_type]} \u2014 describe this line...`,
          className: "h-8 text-sm flex-1 bg-white min-w-[160px]",
          onClick: (e) => e.stopPropagation()
        }
      ),
      /* @__PURE__ */ jsx20(Badge, { variant: "outline", className: `capitalize ${TYPE_BADGE_COLOR[item.installation_type]}`, children: TYPE_LABELS[item.installation_type] }),
      item.__held && /* @__PURE__ */ jsx20(Badge, { variant: "outline", className: "text-[10px] text-amber-700 border-amber-300 bg-amber-50", children: "Saved value \u2014 not repriced" }),
      conditionBadges.map((b, i) => /* @__PURE__ */ jsx20(Badge, { variant: "outline", className: `text-[10px] ${b.color}`, children: b.label }, i)),
      /* @__PURE__ */ jsx20(Badge, { variant: "outline", className: "bg-slate-100 text-slate-700 font-semibold tabular-nums", children: fmt3(item.item_total_cost) }),
      /* @__PURE__ */ jsx20(Button, { variant: "ghost", size: "sm", onClick: onDuplicate, className: "h-7 w-7 p-0 text-slate-500 hover:bg-slate-200", title: "Duplicate", children: /* @__PURE__ */ jsx20(Copy, { className: "w-3.5 h-3.5" }) }),
      /* @__PURE__ */ jsx20(Button, { variant: "ghost", size: "sm", onClick: onRemove, className: "h-7 w-7 p-0 text-red-500 hover:bg-red-50", title: "Remove", children: /* @__PURE__ */ jsx20(Trash2, { className: "w-3.5 h-3.5" }) })
    ] }),
    /* @__PURE__ */ jsx20("div", { className: "px-4 py-2 border-b border-slate-100 bg-white", children: /* @__PURE__ */ jsx20(
      CostBreakdownBar,
      {
        labor: item.labor_cost || 0,
        materials: item.materials_cost || 0
      }
    ) }),
    expanded && /* @__PURE__ */ jsxs9(CardContent, { className: "p-4 space-y-4", children: [
      /* @__PURE__ */ jsx20("div", { className: "text-xs text-slate-500", children: isRaceway ? `${item.qty_letters} letters \xB7 ${item.raceway_length_feet} ft raceway \xB7 ${item.installation_height_feet} ft high` : `${item.qty_letters} letters \xB7 ${item.installation_height_feet} ft high` }),
      /* @__PURE__ */ jsxs9("div", { className: "bg-slate-50 rounded-lg p-3 border border-slate-200", children: [
        /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsx20(Label, { className: "text-xs font-semibold text-slate-700", children: "Installation Environment" }),
          /* @__PURE__ */ jsx20("span", { className: "text-[10px] text-slate-400", children: "(overrides project default for this line item)" })
        ] }),
        /* @__PURE__ */ jsx20("div", { className: "grid grid-cols-3 gap-1 max-w-md", children: [
          { value: "", label: "Project Default" },
          { value: "exterior", label: "Exterior" },
          { value: "interior", label: "Interior" }
        ].map((opt) => {
          const active = (item.install_environment || "") === opt.value;
          return /* @__PURE__ */ jsx20(
            "button",
            {
              type: "button",
              onClick: () => update({ install_environment: opt.value || void 0 }),
              className: `text-xs px-2 py-1.5 rounded-md border transition-all ${active ? "border-purple-500 bg-purple-50 text-purple-900 font-semibold shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`,
              children: opt.label
            },
            opt.value || "default"
          );
        }) })
      ] }),
      /* @__PURE__ */ jsxs9("div", { className: "grid md:grid-cols-2 gap-4 bg-slate-50 rounded-lg p-3 border border-slate-200", children: [
        /* @__PURE__ */ jsxs9("div", { children: [
          /* @__PURE__ */ jsx20(Label, { className: "text-xs font-semibold text-slate-700", children: "Qty Letters" }),
          /* @__PURE__ */ jsx20(
            Input,
            {
              type: "number",
              value: item.qty_letters,
              onFocus: (e) => e.target.select(),
              onChange: (e) => update({ qty_letters: channelDraftValue(e.target.value) }),
              className: `h-9 mt-1.5 ${invalidCls("qty_letters")}`,
              ...ariaFor("qty_letters")
            }
          ),
          /* @__PURE__ */ jsx20(FieldIssue, { field: "qty_letters" }),
          isRaceway && /* @__PURE__ */ jsxs9("div", { className: "mt-3", children: [
            /* @__PURE__ */ jsx20(Label, { className: "text-xs font-semibold text-slate-700", children: "Raceway Length (ft)" }),
            /* @__PURE__ */ jsx20(
              Input,
              {
                type: "number",
                value: item.raceway_length_feet,
                onFocus: (e) => e.target.select(),
                onChange: (e) => update({ raceway_length_feet: channelDraftValue(e.target.value) }),
                className: `h-9 mt-1.5 ${invalidCls("raceway_length_feet")}`,
                ...ariaFor("raceway_length_feet")
              }
            ),
            /* @__PURE__ */ jsx20(FieldIssue, { field: "raceway_length_feet" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs9("div", { children: [
          /* @__PURE__ */ jsx20(Label, { className: "text-xs font-semibold text-slate-700", children: "Installation Height (ft)" }),
          /* @__PURE__ */ jsx20("div", { className: "mt-1.5", children: /* @__PURE__ */ jsx20(
            InstallHeightSlider,
            {
              value: item.installation_height_feet,
              onChange: (v) => update({ installation_height_feet: v })
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs9("div", { children: [
        /* @__PURE__ */ jsx20(Label, { className: "text-xs text-slate-600", children: "Installation Type" }),
        /* @__PURE__ */ jsx20("div", { className: "mt-1.5", children: /* @__PURE__ */ jsx20(InstallTypePicker, { value: item.installation_type, onChange: (v) => update({ installation_type: v }) }) })
      ] }),
      !isRaceway && /* @__PURE__ */ jsxs9("div", { children: [
        /* @__PURE__ */ jsx20(Label, { className: "text-xs text-slate-600", children: "Letter Size" }),
        /* @__PURE__ */ jsx20("div", { className: "mt-1.5", children: /* @__PURE__ */ jsx20(LetterSizePicker, { value: item.letter_size, onChange: (v) => update({ letter_size: v }) }) })
      ] }),
      /* @__PURE__ */ jsxs9("div", { className: "space-y-3 border-t pt-3", children: [
        /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-2 text-xs font-semibold text-slate-700", children: [
          /* @__PURE__ */ jsx20(Sliders, { className: "w-3.5 h-3.5" }),
          "Wall & Site Conditions",
          activeConditionsCount > 0 && /* @__PURE__ */ jsxs9(Badge, { variant: "outline", className: "bg-purple-100 text-purple-800 border-purple-200 text-[10px] h-4 px-1.5", children: [
            activeConditionsCount,
            " active"
          ] })
        ] }),
        /* @__PURE__ */ jsxs9("div", { children: [
          /* @__PURE__ */ jsxs9(Label, { className: "text-xs text-slate-600", children: [
            "Wall Material ",
            /* @__PURE__ */ jsx20("span", { className: "text-slate-400 font-normal", children: "(what we're installing into)" })
          ] }),
          /* @__PURE__ */ jsx20("div", { className: "mt-1.5", children: /* @__PURE__ */ jsx20(WallMaterialPicker, { value: item.wall_material || "eifs", onChange: (v) => update({ wall_material: v }) }) })
        ] }),
        /* @__PURE__ */ jsxs9("div", { children: [
          /* @__PURE__ */ jsxs9(Label, { className: "text-xs text-slate-600", children: [
            "Site Conditions ",
            /* @__PURE__ */ jsx20("span", { className: "text-slate-400 font-normal", children: "(toggle if applicable)" })
          ] }),
          /* @__PURE__ */ jsx20("div", { className: "mt-1.5", children: /* @__PURE__ */ jsx20(
            ConditionPicker,
            {
              settings,
              values: {
                thick_hollow_walls: item.thick_hollow_walls,
                parapet: item.parapet,
                parapet_electrical_routing: item.parapet_electrical_routing || "roof",
                poor_electrical_access: item.poor_electrical_access,
                poor_electrical_severity: item.poor_electrical_severity || 1,
                escort_required: item.escort_required,
                badging_checkin: item.badging_checkin,
                after_hours_weekend: item.after_hours_weekend,
                set_hours_installation: item.set_hours_installation,
                poor_site_access: item.poor_site_access,
                poor_site_access_severity: item.poor_site_access_severity || 1
              },
              onChange: (v) => update(v)
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ jsx20("div", { className: "border-t pt-3", children: /* @__PURE__ */ jsx20(MaterialsList, { item, itemIndex: index, inventory, onChange: (materials) => update({ materials }), issues }) }),
      /* @__PURE__ */ jsxs9("div", { className: "border-t pt-3 grid grid-cols-3 gap-3 text-xs", children: [
        /* @__PURE__ */ jsxs9("div", { className: "bg-slate-50 rounded p-2", children: [
          /* @__PURE__ */ jsx20("div", { className: "text-slate-500", children: "Labor" }),
          /* @__PURE__ */ jsxs9("div", { className: "font-semibold tabular-nums", children: [
            Number.isFinite(item.labor_hours) ? item.labor_hours.toFixed(2) : "\u2014",
            " hrs \xB7 ",
            fmt3(item.labor_cost)
          ] })
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "bg-slate-50 rounded p-2", children: [
          /* @__PURE__ */ jsx20("div", { className: "text-slate-500", children: "Materials" }),
          /* @__PURE__ */ jsx20("div", { className: "font-semibold tabular-nums", children: fmt3(item.materials_cost) })
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "bg-purple-50 rounded p-2 border border-purple-100", children: [
          /* @__PURE__ */ jsx20("div", { className: "text-purple-700", children: "Item Total" }),
          /* @__PURE__ */ jsx20("div", { className: "font-bold text-purple-900 tabular-nums", children: fmt3(item.item_total_cost) })
        ] })
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/ItemsList.jsx
import { jsx as jsx21, jsxs as jsxs10 } from "react/jsx-runtime";
function ItemsList({ items, inventory, settings, compact: compact2, onUpdate, onRemove, onDuplicate, onReorder, issues = [] }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    onReorder(result.source.index, result.destination.index);
  };
  return /* @__PURE__ */ jsx21(DragDropContext, { onDragEnd: handleDragEnd, children: /* @__PURE__ */ jsx21(Droppable, { droppableId: "install-items", children: (provided) => /* @__PURE__ */ jsxs10("div", { ...provided.droppableProps, ref: provided.innerRef, className: "space-y-3", children: [
    items.map((item, idx) => /* @__PURE__ */ jsx21(Draggable, { draggableId: `item-${idx}`, index: idx, children: (prov, snapshot) => /* @__PURE__ */ jsxs10(
      "div",
      {
        ref: prov.innerRef,
        ...prov.draggableProps,
        className: `flex items-stretch gap-1 ${snapshot.isDragging ? "opacity-80 shadow-2xl" : ""}`,
        children: [
          /* @__PURE__ */ jsx21(
            "div",
            {
              ...prov.dragHandleProps,
              className: "flex items-center px-1 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing",
              title: "Drag to reorder",
              children: /* @__PURE__ */ jsx21(GripVertical, { className: "w-4 h-4" })
            }
          ),
          /* @__PURE__ */ jsx21("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ jsx21(
            InstallLineItem,
            {
              item,
              index: idx,
              inventory,
              settings,
              compact: compact2,
              onUpdate: (updated) => onUpdate(idx, updated),
              onRemove: () => onRemove(idx),
              onDuplicate: () => onDuplicate(idx),
              issues
            }
          ) })
        ]
      }
    ) }, `item-${idx}`)),
    provided.placeholder
  ] }) }) });
}

// frozen:/app/src/components/channelLetterInstall/CrewEquipmentHint.jsx
import React12 from "react";
import { jsx as jsx22, jsxs as jsxs11 } from "react/jsx-runtime";
function CrewEquipmentHint({ items = [] }) {
  if (!items.length) return null;
  const maxHeight = items.reduce(
    (max, it) => Math.max(max, parseFloat(it.installation_height_feet) || 0),
    0
  );
  const totalLetters = items.reduce(
    (s, it) => s + (parseFloat(it.qty_letters) || 0),
    0
  );
  let crewSize = 2;
  let equipment = "Standard ladder";
  let equipmentLevel = "low";
  if (maxHeight > 30) {
    crewSize = 4;
    equipment = "Boom lift (40ft+) + ground crew";
    equipmentLevel = "high";
  } else if (maxHeight > 20) {
    crewSize = 3;
    equipment = "Scissor lift / boom lift (30ft)";
    equipmentLevel = "medium";
  } else if (maxHeight > 12) {
    crewSize = 2;
    equipment = "Scissor lift or extension ladder (20ft)";
    equipmentLevel = "medium";
  }
  if (totalLetters > 30 && crewSize < 3) crewSize += 1;
  const levelColor = {
    low: "bg-green-50 border-green-200 text-green-900",
    medium: "bg-amber-50 border-amber-200 text-amber-900",
    high: "bg-red-50 border-red-200 text-red-900"
  }[equipmentLevel];
  return /* @__PURE__ */ jsxs11("div", { className: `rounded-lg border p-3 ${levelColor}`, children: [
    /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide", children: [
      /* @__PURE__ */ jsx22(HardHat, { className: "w-3.5 h-3.5" }),
      "Crew & Equipment Hint"
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "space-y-1 text-xs", children: [
      /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx22(Users, { className: "w-3 h-3" }),
        /* @__PURE__ */ jsxs11("span", { children: [
          /* @__PURE__ */ jsxs11("strong", { children: [
            crewSize,
            "-person crew"
          ] }),
          " recommended"
        ] })
      ] }),
      /* @__PURE__ */ jsxs11("div", { className: "flex items-start gap-1.5", children: [
        /* @__PURE__ */ jsx22(AlertTriangle, { className: "w-3 h-3 mt-0.5" }),
        /* @__PURE__ */ jsxs11("span", { children: [
          /* @__PURE__ */ jsx22("strong", { children: equipment }),
          " (max ",
          maxHeight,
          "ft)"
        ] })
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/ValidationWarnings.jsx
import React13 from "react";
import { jsx as jsx23, jsxs as jsxs12 } from "react/jsx-runtime";
function ValidationWarnings({ project, pricingIssues = [] }) {
  const issues = [];
  const items = project?.items || [];
  const equipment = project?.selected_equipment || [];
  if (items.length === 0 && (project?.letter_purchases || []).length === 0) {
    issues.push({ level: "warn", msg: "No line items or letter purchases yet." });
  }
  if (equipment.length === 0 && items.length > 0) {
    issues.push({ level: "error", msg: "No equipment selected \u2014 required to save." });
  }
  const maxItemHeight = items.reduce(
    (m, it) => Math.max(m, parseFloat(it.installation_height_feet) || 0),
    0
  );
  if (maxItemHeight > 0) {
    const lifts = equipment.filter((e) => ["ladder", "scissor_lift", "boom_lift", "scaffold"].includes(e.equipment_type));
    if (lifts.length > 0) {
      const maxReach = lifts.reduce((m, e) => Math.max(m, parseFloat(e.max_height_feet) || 0), 0);
      if (maxReach > 0 && maxReach < maxItemHeight) {
        issues.push({
          level: "error",
          msg: `Equipment max reach (${maxReach}ft) is below the tallest install (${maxItemHeight}ft).`
        });
      }
    } else if (equipment.length > 0 && maxItemHeight > 8) {
      issues.push({ level: "warn", msg: `Install reaches ${maxItemHeight}ft but no lift/ladder selected.` });
    }
  }
  items.forEach((it, i) => {
    const num6 = i + 1;
    if (!it.qty_letters || it.qty_letters <= 0) {
      issues.push({ level: "warn", msg: `Item #${num6}: Letter quantity is 0.` });
    }
    if (it.installation_type === "raceway" && (!it.raceway_length_feet || it.raceway_length_feet <= 0)) {
      issues.push({ level: "warn", msg: `Item #${num6}: Raceway selected but length is 0 ft.` });
    }
    if (!it.installation_height_feet || it.installation_height_feet <= 0) {
      issues.push({ level: "warn", msg: `Item #${num6}: Install height is 0 ft.` });
    }
    if (!it.wall_material) {
      issues.push({ level: "info", msg: `Item #${num6}: Wall material not set.` });
    }
    if (!it.materials || it.materials.length === 0) {
      issues.push({ level: "info", msg: `Item #${num6}: No materials attached.` });
    }
  });
  const catalogIssues = (pricingIssues || []).filter((i) => i.kind === "channel_catalog");
  const inputIssues = (pricingIssues || []).filter((i) => i.kind !== "channel_catalog");
  if (issues.length === 0 && pricingIssues.length === 0) {
    return /* @__PURE__ */ jsxs12("div", { className: "rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx23("span", { className: "w-1.5 h-1.5 rounded-full bg-green-500" }),
      "Estimate looks good \u2014 no issues detected."
    ] });
  }
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  const infos = issues.filter((i) => i.level === "info");
  return /* @__PURE__ */ jsxs12("div", { className: "space-y-2", children: [
    catalogIssues.length > 0 && /* @__PURE__ */ jsx23(
      PricingGroup,
      {
        tone: "catalog",
        title: `Pricing records unavailable (${catalogIssues.length})`,
        note: "These settings or inventory records are missing, malformed, or were deleted \u2014 save is blocked until they are fixed in Pricing Settings, Materials / Equipment Inventory, or the dimensional material library.",
        issues: catalogIssues
      }
    ),
    inputIssues.length > 0 && /* @__PURE__ */ jsx23(
      PricingGroup,
      {
        tone: "input",
        title: `Pricing needs attention (${inputIssues.length})`,
        note: "These values can't produce a real price \u2014 fix them or use a saved acknowledged snapshot. Save is blocked.",
        issues: inputIssues
      }
    ),
    errors.length > 0 && /* @__PURE__ */ jsx23(Group, { level: "error", issues: errors }),
    warns.length > 0 && /* @__PURE__ */ jsx23(Group, { level: "warn", issues: warns }),
    infos.length > 0 && /* @__PURE__ */ jsx23(Group, { level: "info", issues: infos })
  ] });
}
var PRICING_STYLES = {
  catalog: {
    box: "border-red-300 bg-red-50",
    header: "text-red-900",
    text: "text-red-900",
    note: "text-red-800"
  },
  input: {
    box: "border-amber-300 bg-amber-50",
    header: "text-amber-900",
    text: "text-amber-900",
    note: "text-amber-800"
  }
};
var PricingGroup = ({ tone, title, note, issues }) => {
  const s = PRICING_STYLES[tone];
  const visible = issues.slice(0, 8);
  return /* @__PURE__ */ jsxs12("div", { className: `rounded-lg border p-3 ${s.box}`, role: "alert", children: [
    /* @__PURE__ */ jsxs12("div", { className: `flex items-center gap-2 mb-1 text-xs font-semibold uppercase tracking-wide ${s.header}`, children: [
      /* @__PURE__ */ jsx23(DollarSign, { className: "w-3.5 h-3.5" }),
      title
    ] }),
    /* @__PURE__ */ jsx23("p", { className: `text-[11px] mb-1.5 ${s.note}`, children: note }),
    /* @__PURE__ */ jsxs12("ul", { className: `text-xs space-y-0.5 list-disc list-inside ${s.text}`, children: [
      visible.map((w, i) => /* @__PURE__ */ jsx23("li", { children: w.message }, `${w.field}-${w.index ?? w.itemIndex ?? "p"}-${i}`)),
      issues.length > visible.length && /* @__PURE__ */ jsxs12("li", { className: "opacity-70 list-none", children: [
        "+",
        issues.length - visible.length,
        " more..."
      ] })
    ] })
  ] });
};
var STYLES = {
  error: {
    box: "border-red-300 bg-red-50",
    header: "text-red-900",
    text: "text-red-900",
    icon: AlertCircle,
    label: "Must fix"
  },
  warn: {
    box: "border-amber-200 bg-amber-50",
    header: "text-amber-900",
    text: "text-amber-900",
    icon: AlertTriangle,
    label: "Heads up"
  },
  info: {
    box: "border-slate-200 bg-slate-50",
    header: "text-slate-700",
    text: "text-slate-700",
    icon: Info,
    label: "FYI"
  }
};
var Group = ({ level, issues }) => {
  const s = STYLES[level];
  const Icon = s.icon;
  const visible = issues.slice(0, 6);
  return /* @__PURE__ */ jsxs12("div", { className: `rounded-lg border p-3 ${s.box}`, children: [
    /* @__PURE__ */ jsxs12("div", { className: `flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide ${s.header}`, children: [
      /* @__PURE__ */ jsx23(Icon, { className: "w-3.5 h-3.5" }),
      s.label,
      " (",
      issues.length,
      ")"
    ] }),
    /* @__PURE__ */ jsxs12("ul", { className: `text-xs space-y-0.5 list-disc list-inside ${s.text}`, children: [
      visible.map((w, i) => /* @__PURE__ */ jsx23("li", { children: w.msg }, i)),
      issues.length > visible.length && /* @__PURE__ */ jsxs12("li", { className: "opacity-70 list-none", children: [
        "+",
        issues.length - visible.length,
        " more..."
      ] })
    ] })
  ] });
};

// frozen:/app/src/components/channelLetterInstall/EquipmentSelector.jsx
import React14, { useMemo } from "react";

// s:s://@/components/ui/checkbox
import { jsx as jsx24 } from "react/jsx-runtime";
var Checkbox = (p) => /* @__PURE__ */ jsx24("input", { type: "checkbox", checked: p.checked, onChange: (e) => p.onCheckedChange?.(e.target.checked) });

// frozen:/app/src/components/channelLetterInstall/equipmentSuggester.jsx
var LIFT_TYPES = ["ladder", "scissor_lift", "boom_lift", "boom_truck", "scaffold"];
var BOOM_TYPES = ["boom_lift", "boom_truck"];
var VEHICLE_TYPES2 = ["truck", "van", "flatbed", "boom_truck"];
function isOwnedEquipment(invOrRow = {}) {
  if (invOrRow.ownership) return invOrRow.ownership === "owned";
  return invOrRow.pricing_mode === "owned_flat" || invOrRow.pricing_mode === "per_project_flat";
}
var invIsOwned = (e) => e.ownership === "owned" || e.pricing_mode === "owned_flat" || e.pricing_mode === "per_project_flat";
var safetyMarginOf = (e) => {
  const m = parseFloat(e.vertical_reach_safety_margin_feet);
  return isNaN(m) ? 2 : m;
};
var liftReaches = (e, height) => (parseFloat(e.max_height_feet) || 0) >= height + safetyMarginOf(e);
function pickLift(active, maxHeight) {
  const lifts = active.filter((e) => LIFT_TYPES.includes(e.equipment_type));
  if (lifts.length === 0) return null;
  const primaryOwned = lifts.find(
    (e) => invIsOwned(e) && e.is_primary_owned && liftReaches(e, maxHeight)
  );
  if (primaryOwned) return primaryOwned;
  const defaultByRange = lifts.find((e) => {
    if (!BOOM_TYPES.includes(e.equipment_type)) return false;
    if (!e.is_default_for_height) return false;
    const min = parseFloat(e.default_height_min_feet) || 0;
    const max = parseFloat(e.default_height_max_feet) || 0;
    if (max <= 0) return false;
    return maxHeight >= min && maxHeight <= max;
  });
  if (defaultByRange) return defaultByRange;
  const bySize = (a, b) => (parseFloat(a.max_height_feet) || 0) - (parseFloat(b.max_height_feet) || 0);
  const ownedReaching = lifts.filter((e) => invIsOwned(e) && liftReaches(e, maxHeight)).sort(bySize);
  if (ownedReaching.length > 0) return ownedReaching[0];
  const rentedReaching = lifts.filter((e) => !invIsOwned(e) && liftReaches(e, maxHeight)).sort(bySize);
  if (rentedReaching.length > 0) return rentedReaching[0];
  const anyReaching = lifts.filter((e) => (parseFloat(e.max_height_feet) || 0) >= maxHeight).sort((a, b) => {
    const own = (invIsOwned(b) ? 1 : 0) - (invIsOwned(a) ? 1 : 0);
    if (own !== 0) return own;
    return bySize(b, a);
  });
  return anyReaching[0] || null;
}
function suggestEquipmentForProject(items = [], inventory = []) {
  if (!items.length || !inventory.length) return [];
  const maxHeight = items.reduce(
    (m, it) => Math.max(m, parseFloat(it.installation_height_feet) || 0),
    0
  );
  const active = inventory.filter((e) => e.is_active !== false);
  const suggestions = [];
  const lift = pickLift(active, maxHeight);
  if (lift) suggestions.push(lift);
  const haveVehicle = suggestions.some((s) => VEHICLE_TYPES2.includes(s.equipment_type));
  if (!haveVehicle) {
    const vehicles = active.filter((e) => VEHICLE_TYPES2.includes(e.equipment_type)).sort((a, b) => (invIsOwned(a) ? 0 : 1) - (invIsOwned(b) ? 0 : 1));
    if (vehicles.length > 0) suggestions.push(vehicles[0]);
  }
  return suggestions;
}
function selectedEquipmentFromInventory(inv, projectLaborHours = 0, crewSize = 1) {
  const laborHours = parseFloat(projectLaborHours) || 0;
  const crew = Math.max(1, parseInt(crewSize) || 1);
  const clockHours = laborHours / crew;
  const clockDays = Math.max(1, Math.ceil(clockHours / 8));
  let duration = 1;
  let unitCost = 0;
  switch (inv.pricing_mode) {
    case "per_hour":
      duration = Math.max(1, Math.ceil(clockHours));
      unitCost = parseFloat(inv.cost_per_hour) || 0;
      break;
    case "per_day":
      duration = clockDays;
      unitCost = parseFloat(inv.cost_per_day) || 0;
      break;
    case "per_week":
      duration = Math.max(1, Math.ceil(clockDays / 5));
      unitCost = parseFloat(inv.cost_per_week) || 0;
      break;
    case "per_month":
      duration = 1;
      unitCost = parseFloat(inv.cost_per_month) || 0;
      break;
    case "owned_flat":
    case "per_project_flat":
      duration = 1;
      unitCost = parseFloat(inv.cost_flat) || 0;
      break;
    default:
      duration = 1;
      unitCost = 0;
  }
  const isBoom = BOOM_TYPES.includes(inv.equipment_type);
  const idleRate = isBoom ? parseFloat(inv.idle_running_cost_per_hour) || 0 : 0;
  const idleHours = isBoom && idleRate > 0 ? Math.max(0, Math.ceil(clockHours)) : 0;
  const owned = isOwnedEquipment(inv);
  return {
    equipment_id: inv.id,
    inventory_entity: inv._inventory_entity || inv.inventory_entity || "",
    equipment_name: inv.equipment_name,
    equipment_type: inv.equipment_type,
    pricing_mode: inv.pricing_mode,
    ownership: owned ? "owned" : inv.ownership || "rented",
    duration,
    include_delivery: false,
    delivery_pickup_cost: owned ? 0 : parseFloat(inv.delivery_pickup_cost) || 0,
    unit_cost: unitCost,
    idle_running_cost_per_hour: idleRate,
    idle_hours: idleHours,
    idle_cost: idleRate * idleHours,
    total_cost: unitCost * duration + idleRate * idleHours,
    notes: ""
  };
}
function recalcEquipmentRow(row) {
  const duration = parseFloat(row.duration) || 0;
  const unitCost = parseFloat(row.unit_cost) || 0;
  const delivery = !isOwnedEquipment(row) && row.include_delivery ? parseFloat(row.delivery_pickup_cost) || 0 : 0;
  const idleHours = parseFloat(row.idle_hours) || 0;
  const idleRate = parseFloat(row.idle_running_cost_per_hour) || 0;
  const idle_cost = idleHours * idleRate;
  return {
    ...row,
    idle_cost,
    total_cost: unitCost * duration + delivery + idle_cost
  };
}
function recalcPersonnelRow(row) {
  const rate = parseFloat(row.hourly_rate) || 0;
  const hours = parseFloat(row.hours) || 0;
  return { ...row, total_cost: rate * hours };
}
function durationUnitLabel(pricing_mode) {
  switch (pricing_mode) {
    case "per_hour":
      return "hours";
    case "per_day":
      return "days";
    case "per_week":
      return "weeks";
    case "per_month":
      return "months";
    case "owned_flat":
    case "per_project_flat":
      return "flat";
    default:
      return "units";
  }
}
function suggestCrewSize(items = []) {
  const maxHeight = items.reduce(
    (m, it) => Math.max(m, parseFloat(it.installation_height_feet) || 0),
    0
  );
  const totalLetters = items.reduce(
    (s, it) => s + (parseFloat(it.qty_letters) || 0),
    0
  );
  return maxHeight >= 40 || totalLetters >= 30 ? 3 : 2;
}
function suggestPersonnelForProject(items = [], projectLaborHours = 0, rateForRole = () => 0) {
  const crewSize = suggestCrewSize(items);
  const perPersonHours = projectLaborHours && crewSize > 0 ? +(projectLaborHours / crewSize).toFixed(2) : 0;
  const roles = ["Crew Lead", "Installer", "Helper"];
  return Array.from({ length: crewSize }, (_, i) => {
    const role = roles[i] || "Installer";
    return recalcPersonnelRow({
      name: "",
      role,
      hourly_rate: rateForRole(role),
      hours: perPersonHours,
      total_cost: 0
    });
  });
}

// frozen:/app/src/components/channelLetterInstall/EquipmentSelector.jsx
import { jsx as jsx25, jsxs as jsxs13 } from "react/jsx-runtime";
var BOOM_TYPES2 = /* @__PURE__ */ new Set(["boom_lift", "boom_truck"]);
var fmtMoney = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var fmt4 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
function EquipmentSelector({
  selectedEquipment = [],
  onChange,
  equipmentInventory = [],
  items = [],
  projectLaborHours = 0,
  crewSize = 0,
  issues = []
}) {
  const effectiveCrewSize = crewSize > 0 ? crewSize : suggestCrewSize(items);
  const activeInventory = useMemo(
    () => equipmentInventory.filter((e) => e.is_active !== false),
    [equipmentInventory]
  );
  const suggestions = useMemo(
    () => suggestEquipmentForProject(items, activeInventory),
    [items, activeInventory]
  );
  const selectedIds = new Set(selectedEquipment.map((e) => e.equipment_id));
  const handleAdd = (inv) => {
    if (!inv || selectedIds.has(inv.id)) return;
    const row = selectedEquipmentFromInventory(inv, projectLaborHours, effectiveCrewSize);
    onChange([...selectedEquipment, row]);
  };
  const handleAcceptSuggestion = (inv) => handleAdd(inv);
  const handleAcceptAllSuggestions = () => {
    const toAdd = suggestions.filter((s) => !selectedIds.has(s.id)).map((s) => selectedEquipmentFromInventory(s, projectLaborHours, effectiveCrewSize));
    if (toAdd.length === 0) return;
    onChange([...selectedEquipment, ...toAdd]);
  };
  const handleUpdate = (idx, patch) => {
    const next = [...selectedEquipment];
    next[idx] = recalcEquipmentRow({ ...next[idx], ...patch });
    onChange(next);
  };
  const rowIssues = (idx, field) => issuesForField(issues, field, null, idx);
  const rowInvalid = (idx, field) => rowIssues(idx, field).length > 0;
  const rowAria = (idx, field) => rowInvalid(idx, field) ? { "aria-invalid": true, "aria-describedby": `cle-${idx}-${field}-issue` } : {};
  const RowIssue = ({ idx, field }) => {
    const fi = rowIssues(idx, field);
    if (!fi.length) return null;
    return /* @__PURE__ */ jsx25("p", { id: `cle-${idx}-${field}-issue`, className: "text-[10px] text-red-600 mt-0.5", role: "alert", children: fi[0].message });
  };
  const handleRemove = (idx) => {
    if (!confirm(`Remove "${selectedEquipment[idx]?.equipment_name || "this equipment"}"?`)) return;
    const next = [...selectedEquipment];
    next.splice(idx, 1);
    onChange(next);
  };
  const totalCost = selectedEquipment.reduce(
    (s, e) => {
      if (s === null) return null;
      const v = channelNumber(e.total_cost);
      return v === null ? null : s + v;
    },
    0
  );
  const addableInventory = activeInventory.filter((e) => !selectedIds.has(e.id));
  const newSuggestions = suggestions.filter((s) => !selectedIds.has(s.id));
  return /* @__PURE__ */ jsxs13("div", { className: "space-y-3", children: [
    newSuggestions.length > 0 && /* @__PURE__ */ jsxs13(Card, { className: "bg-amber-50 border-amber-200", children: [
      /* @__PURE__ */ jsxs13(CardHeader, { className: "pb-2", children: [
        /* @__PURE__ */ jsxs13(CardTitle, { className: "text-sm flex items-center gap-2 text-amber-900", children: [
          /* @__PURE__ */ jsx25(Sparkles, { className: "w-4 h-4" }),
          " Suggested Equipment"
        ] }),
        /* @__PURE__ */ jsx25("p", { className: "text-xs text-amber-800", children: "Based on your line items, we recommend the following equipment." })
      ] }),
      /* @__PURE__ */ jsxs13(CardContent, { className: "space-y-2", children: [
        newSuggestions.map((s) => /* @__PURE__ */ jsxs13(
          "div",
          {
            className: "flex items-center justify-between bg-white rounded-md border border-amber-200 px-3 py-2",
            children: [
              /* @__PURE__ */ jsxs13("div", { className: "text-sm", children: [
                /* @__PURE__ */ jsx25("div", { className: "font-medium", children: s.equipment_name }),
                /* @__PURE__ */ jsxs13("div", { className: "text-xs text-slate-500 capitalize", children: [
                  s.equipment_type?.replace("_", " "),
                  s.max_height_feet ? ` \xB7 ${s.max_height_feet}ft max` : "",
                  s.ownership ? ` \xB7 ${s.ownership}` : ""
                ] })
              ] }),
              /* @__PURE__ */ jsxs13(
                Button,
                {
                  size: "sm",
                  variant: "outline",
                  onClick: () => handleAcceptSuggestion(s),
                  className: "h-8 text-xs bg-white",
                  children: [
                    /* @__PURE__ */ jsx25(Plus, { className: "w-3 h-3 mr-1" }),
                    " Add"
                  ]
                }
              )
            ]
          },
          s.id
        )),
        newSuggestions.length > 1 && /* @__PURE__ */ jsx25(
          Button,
          {
            size: "sm",
            onClick: handleAcceptAllSuggestions,
            className: "w-full bg-amber-600 hover:bg-amber-700 text-white",
            children: "Accept All Suggestions"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs13(Card, { className: "bg-white border-0 shadow-sm", children: [
      /* @__PURE__ */ jsxs13(CardHeader, { className: "pb-3 flex flex-row items-center justify-between flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxs13("div", { children: [
          /* @__PURE__ */ jsxs13(CardTitle, { className: "text-lg flex items-center gap-2", children: [
            /* @__PURE__ */ jsx25(HardHat, { className: "w-5 h-5 text-purple-600" }),
            "Selected Equipment (",
            selectedEquipment.length,
            ")"
          ] }),
          /* @__PURE__ */ jsx25("p", { className: "text-xs text-slate-500 mt-1", children: "At least one piece of equipment is required." })
        ] }),
        addableInventory.length > 0 ? /* @__PURE__ */ jsxs13(
          Select,
          {
            onValueChange: (val) => {
              const inv = activeInventory.find((e) => e.id === val);
              if (inv) handleAdd(inv);
            },
            children: [
              /* @__PURE__ */ jsxs13(SelectTrigger, { className: "w-60 h-9 text-sm bg-purple-50 border-purple-300 text-purple-800 font-semibold hover:bg-purple-100", children: [
                /* @__PURE__ */ jsx25(Plus, { className: "w-4 h-4 mr-1" }),
                /* @__PURE__ */ jsx25(SelectValue, { placeholder: "Add another piece of equipment..." })
              ] }),
              /* @__PURE__ */ jsx25(SelectContent, { children: addableInventory.map((e) => /* @__PURE__ */ jsxs13(SelectItem, { value: e.id, children: [
                e.equipment_name,
                e.max_height_feet ? ` (${e.max_height_feet}ft)` : ""
              ] }, e.id)) })
            ]
          },
          selectedEquipment.length
        ) : /* @__PURE__ */ jsx25("span", { className: "text-xs text-slate-400 italic", children: "All inventory equipment has been added" })
      ] }),
      /* @__PURE__ */ jsx25(CardContent, { children: selectedEquipment.length === 0 ? /* @__PURE__ */ jsxs13("div", { className: "border-2 border-dashed border-red-200 bg-red-50/30 rounded-lg p-8 text-center", children: [
        /* @__PURE__ */ jsx25(AlertCircle, { className: "w-8 h-8 text-red-400 mx-auto mb-2" }),
        /* @__PURE__ */ jsx25("p", { className: "text-sm text-red-700 font-medium", children: "No equipment selected" }),
        /* @__PURE__ */ jsx25("p", { className: "text-xs text-red-600 mt-1", children: "Add equipment from the dropdown above or accept a suggestion." }),
        activeInventory.length === 0 && /* @__PURE__ */ jsx25("p", { className: "text-xs text-slate-500 mt-3", children: "Your equipment inventory is empty. Add equipment in the Inventory page first." })
      ] }) : /* @__PURE__ */ jsxs13("div", { className: "space-y-2", children: [
        selectedEquipment.map((row, idx) => /* @__PURE__ */ jsxs13(
          "div",
          {
            className: "border border-slate-200 rounded-lg p-3 bg-slate-50/50",
            children: [
              /* @__PURE__ */ jsxs13("div", { className: "grid md:grid-cols-12 gap-2 items-end", children: [
                /* @__PURE__ */ jsxs13("div", { className: "md:col-span-4", children: [
                  /* @__PURE__ */ jsx25(Label, { className: "text-xs", children: "Equipment" }),
                  /* @__PURE__ */ jsx25("div", { className: "text-sm font-medium mt-0.5", children: row.equipment_name }),
                  /* @__PURE__ */ jsxs13("div", { className: "text-xs text-slate-500 capitalize", children: [
                    row.equipment_type?.replace("_", " "),
                    " \xB7 ",
                    row.pricing_mode?.replace(/_/g, " ")
                  ] })
                ] }),
                /* @__PURE__ */ jsxs13("div", { className: "md:col-span-2", children: [
                  /* @__PURE__ */ jsxs13(Label, { className: "text-xs", children: [
                    "Duration (",
                    durationUnitLabel(row.pricing_mode),
                    ")"
                  ] }),
                  /* @__PURE__ */ jsx25(
                    Input,
                    {
                      type: "number",
                      step: "0.5",
                      value: row.duration,
                      onFocus: (e) => e.target.select(),
                      onChange: (e) => handleUpdate(idx, { duration: channelDraftValue(e.target.value) }),
                      className: `h-8 mt-0.5 ${rowInvalid(idx, "duration") ? "border-red-500" : ""}`,
                      disabled: row.pricing_mode === "owned_flat" || row.pricing_mode === "per_project_flat",
                      ...rowAria(idx, "duration")
                    }
                  ),
                  /* @__PURE__ */ jsx25(RowIssue, { idx, field: "duration" })
                ] }),
                /* @__PURE__ */ jsxs13("div", { className: "md:col-span-2", children: [
                  /* @__PURE__ */ jsx25(Label, { className: "text-xs", children: "Unit Cost" }),
                  /* @__PURE__ */ jsx25(
                    Input,
                    {
                      type: "number",
                      step: "0.01",
                      value: row.unit_cost,
                      onFocus: (e) => e.target.select(),
                      onChange: (e) => handleUpdate(idx, { unit_cost: channelDraftValue(e.target.value) }),
                      className: `h-8 mt-0.5 ${rowInvalid(idx, "unit_cost") ? "border-red-500" : ""}`,
                      ...rowAria(idx, "unit_cost")
                    }
                  ),
                  /* @__PURE__ */ jsx25(RowIssue, { idx, field: "unit_cost" })
                ] }),
                /* @__PURE__ */ jsx25("div", { className: "md:col-span-3", children: isOwnedEquipment(row) ? /* @__PURE__ */ jsx25("span", { className: "text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 inline-block", children: "Owned \u2014 no delivery fee" }) : /* @__PURE__ */ jsxs13("label", { className: "flex items-center gap-1.5 cursor-pointer text-xs mb-1", children: [
                  /* @__PURE__ */ jsx25(
                    Checkbox,
                    {
                      checked: !!row.include_delivery,
                      onCheckedChange: (c) => handleUpdate(idx, { include_delivery: !!c })
                    }
                  ),
                  /* @__PURE__ */ jsxs13("span", { children: [
                    "Delivery/Pickup (",
                    fmt4(row.delivery_pickup_cost),
                    ")"
                  ] })
                ] }) }),
                /* @__PURE__ */ jsx25("div", { className: "md:col-span-1 flex items-end justify-end", children: /* @__PURE__ */ jsx25(
                  Button,
                  {
                    size: "sm",
                    variant: "ghost",
                    onClick: () => handleRemove(idx),
                    className: "text-red-500 hover:bg-red-50 h-8 w-8 p-0",
                    children: /* @__PURE__ */ jsx25(Trash2, { className: "w-3.5 h-3.5" })
                  }
                ) })
              ] }),
              BOOM_TYPES2.has(row.equipment_type) && (parseFloat(row.idle_running_cost_per_hour) || 0) > 0 && /* @__PURE__ */ jsxs13("div", { className: "mt-2 pt-2 border-t border-slate-200 grid md:grid-cols-12 gap-2 items-end bg-amber-50/50 -mx-3 -mb-3 px-3 py-2 rounded-b-lg", children: [
                /* @__PURE__ */ jsxs13("div", { className: "md:col-span-5 flex items-center gap-1.5 text-xs text-amber-900", children: [
                  /* @__PURE__ */ jsx25(Clock, { className: "w-3.5 h-3.5" }),
                  /* @__PURE__ */ jsx25("span", { className: "font-medium", children: "Idle running on-site" }),
                  /* @__PURE__ */ jsx25("span", { className: "text-amber-700/80", children: "\u2014 added to rental rate" })
                ] }),
                /* @__PURE__ */ jsxs13("div", { className: "md:col-span-2", children: [
                  /* @__PURE__ */ jsx25(Label, { className: "text-xs", children: "Idle Hours" }),
                  /* @__PURE__ */ jsx25(
                    Input,
                    {
                      type: "number",
                      step: "0.25",
                      value: row.idle_hours || 0,
                      onFocus: (e) => e.target.select(),
                      onChange: (e) => handleUpdate(idx, { idle_hours: channelDraftValue(e.target.value) }),
                      className: `h-8 mt-0.5 ${rowInvalid(idx, "idle_hours") ? "border-red-500" : ""}`,
                      ...rowAria(idx, "idle_hours")
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs13("div", { className: "md:col-span-2", children: [
                  /* @__PURE__ */ jsx25(Label, { className: "text-xs", children: "$/hr Idle" }),
                  /* @__PURE__ */ jsx25(
                    Input,
                    {
                      type: "number",
                      step: "0.01",
                      value: row.idle_running_cost_per_hour || 0,
                      onFocus: (e) => e.target.select(),
                      onChange: (e) => handleUpdate(idx, { idle_running_cost_per_hour: channelDraftValue(e.target.value) }),
                      className: `h-8 mt-0.5 ${rowInvalid(idx, "idle_running_cost_per_hour") ? "border-red-500" : ""}`,
                      ...rowAria(idx, "idle_running_cost_per_hour")
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs13("div", { className: "md:col-span-3 text-right", children: [
                  /* @__PURE__ */ jsx25("div", { className: "text-[10px] text-amber-800", children: "Idle Cost" }),
                  /* @__PURE__ */ jsx25("div", { className: "text-sm font-semibold tabular-nums text-amber-900", children: fmtMoney(row.idle_cost) })
                ] })
              ] }),
              /* @__PURE__ */ jsxs13("div", { className: "flex justify-end mt-2 pt-2 border-t border-slate-200 text-sm", children: [
                /* @__PURE__ */ jsx25("span", { className: "text-slate-600 mr-2", children: "Line Total:" }),
                /* @__PURE__ */ jsx25("span", { className: "font-semibold tabular-nums", children: fmt4(row.total_cost) })
              ] })
            ]
          },
          idx
        )),
        /* @__PURE__ */ jsx25("div", { className: "flex justify-end pt-2 border-t border-slate-200", children: /* @__PURE__ */ jsxs13("div", { className: "text-right", children: [
          /* @__PURE__ */ jsx25("div", { className: "text-xs text-slate-500", children: "Total Equipment Cost" }),
          /* @__PURE__ */ jsx25("div", { className: "text-lg font-bold tabular-nums", children: fmt4(totalCost) })
        ] }) })
      ] }) })
    ] })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/LadderSelector.jsx
import React15, { useMemo as useMemo2 } from "react";
import { jsx as jsx26, jsxs as jsxs14 } from "react/jsx-runtime";
var fmt5 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
function LadderSelector({
  selectedEquipment = [],
  onChange,
  equipmentInventory = [],
  projectLaborHours = 0,
  crewSize = 0,
  issues = []
}) {
  const rowIssues = (idx, field) => issuesForField(issues, field, null, idx);
  const rowInvalid = (idx, field) => rowIssues(idx, field).length > 0;
  const rowAria = (idx, field) => rowInvalid(idx, field) ? { "aria-invalid": true, "aria-describedby": `cll-${idx}-${field}-issue` } : {};
  const RowIssue = ({ idx, field }) => {
    const fi = rowIssues(idx, field);
    if (!fi.length) return null;
    return /* @__PURE__ */ jsx26("p", { id: `cll-${idx}-${field}-issue`, className: "text-[10px] text-red-600 mt-0.5", role: "alert", children: fi[0].message });
  };
  const ladderInventory = useMemo2(
    () => equipmentInventory.filter((e) => e.is_active !== false && e.equipment_type === "ladder"),
    [equipmentInventory]
  );
  const selectedIds = new Set(selectedEquipment.map((e) => e.equipment_id));
  const ladderRows = selectedEquipment.map((row, idx) => ({ row, idx })).filter(({ row }) => row.equipment_type === "ladder");
  const addableLadders = ladderInventory.filter((e) => !selectedIds.has(e.id));
  const handleAdd = (inv) => {
    if (!inv || selectedIds.has(inv.id)) return;
    const row = selectedEquipmentFromInventory(inv, projectLaborHours, crewSize);
    onChange([...selectedEquipment, row]);
  };
  const handleUpdate = (idx, patch) => {
    const next = [...selectedEquipment];
    next[idx] = recalcEquipmentRow({ ...next[idx], ...patch });
    onChange(next);
  };
  const handleRemove = (idx) => {
    if (!confirm(`Remove "${selectedEquipment[idx]?.equipment_name || "this ladder"}"?`)) return;
    const next = [...selectedEquipment];
    next.splice(idx, 1);
    onChange(next);
  };
  const totalCost = ladderRows.reduce((s, { row }) => {
    if (s === null) return null;
    const v = channelNumber(row.total_cost);
    return v === null ? null : s + v;
  }, 0);
  return /* @__PURE__ */ jsxs14(Card, { className: "bg-white border-0 shadow-sm", children: [
    /* @__PURE__ */ jsxs14(CardHeader, { className: "pb-3 flex flex-row items-center justify-between flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxs14("div", { children: [
        /* @__PURE__ */ jsxs14(CardTitle, { className: "text-lg flex items-center gap-2", children: [
          /* @__PURE__ */ jsx26(ArrowUpToLine, { className: "w-5 h-5 text-purple-600" }),
          "Ladders (",
          ladderRows.length,
          ")"
        ] }),
        /* @__PURE__ */ jsx26("p", { className: "text-xs text-slate-500 mt-1", children: "Select a ladder to account for installation tools alongside your vehicles." })
      ] }),
      addableLadders.length > 0 ? /* @__PURE__ */ jsxs14(
        Select,
        {
          onValueChange: (val) => {
            const inv = ladderInventory.find((e) => e.id === val);
            if (inv) handleAdd(inv);
          },
          children: [
            /* @__PURE__ */ jsxs14(SelectTrigger, { className: "w-56 h-9 text-sm bg-purple-50 border-purple-300 text-purple-800 font-semibold hover:bg-purple-100", children: [
              /* @__PURE__ */ jsx26(Plus, { className: "w-4 h-4 mr-1" }),
              /* @__PURE__ */ jsx26(SelectValue, { placeholder: "Add a ladder..." })
            ] }),
            /* @__PURE__ */ jsx26(SelectContent, { children: addableLadders.map((e) => /* @__PURE__ */ jsxs14(SelectItem, { value: e.id, children: [
              e.equipment_name,
              e.max_height_feet ? ` (${e.max_height_feet}ft)` : ""
            ] }, e.id)) })
          ]
        },
        ladderRows.length
      ) : ladderInventory.length === 0 ? /* @__PURE__ */ jsx26("span", { className: "text-xs text-slate-400 italic", children: "No ladders in inventory" }) : /* @__PURE__ */ jsx26("span", { className: "text-xs text-slate-400 italic", children: "All ladders added" })
    ] }),
    /* @__PURE__ */ jsx26(CardContent, { children: ladderRows.length === 0 ? /* @__PURE__ */ jsxs14("div", { className: "border-2 border-dashed border-slate-200 bg-slate-50/40 rounded-lg p-6 text-center", children: [
      /* @__PURE__ */ jsx26(ArrowUpToLine, { className: "w-7 h-7 text-slate-300 mx-auto mb-2" }),
      /* @__PURE__ */ jsx26("p", { className: "text-sm text-slate-500", children: "No ladder selected" }),
      /* @__PURE__ */ jsx26("p", { className: "text-xs text-slate-400 mt-1", children: ladderInventory.length === 0 ? "Add a ladder (equipment type = ladder) in Equipment Inventory first." : "Pick a ladder from the dropdown above." })
    ] }) : /* @__PURE__ */ jsxs14("div", { className: "space-y-2", children: [
      ladderRows.map(({ row, idx }) => /* @__PURE__ */ jsxs14("div", { className: "border border-slate-200 rounded-lg p-3 bg-slate-50/50", children: [
        /* @__PURE__ */ jsxs14("div", { className: "grid md:grid-cols-12 gap-2 items-end", children: [
          /* @__PURE__ */ jsxs14("div", { className: "md:col-span-4", children: [
            /* @__PURE__ */ jsx26(Label, { className: "text-xs", children: "Ladder" }),
            /* @__PURE__ */ jsx26("div", { className: "text-sm font-medium mt-0.5", children: row.equipment_name }),
            /* @__PURE__ */ jsx26("div", { className: "text-xs text-slate-500 capitalize", children: row.pricing_mode?.replace(/_/g, " ") })
          ] }),
          /* @__PURE__ */ jsxs14("div", { className: "md:col-span-2", children: [
            /* @__PURE__ */ jsxs14(Label, { className: "text-xs", children: [
              "Duration (",
              durationUnitLabel(row.pricing_mode),
              ")"
            ] }),
            /* @__PURE__ */ jsx26(
              Input,
              {
                type: "number",
                step: "0.5",
                value: row.duration,
                onFocus: (e) => e.target.select(),
                onChange: (e) => handleUpdate(idx, { duration: channelDraftValue(e.target.value) }),
                className: `h-8 mt-0.5 ${rowInvalid(idx, "duration") ? "border-red-500" : ""}`,
                disabled: row.pricing_mode === "owned_flat" || row.pricing_mode === "per_project_flat",
                ...rowAria(idx, "duration")
              }
            ),
            /* @__PURE__ */ jsx26(RowIssue, { idx, field: "duration" })
          ] }),
          /* @__PURE__ */ jsxs14("div", { className: "md:col-span-2", children: [
            /* @__PURE__ */ jsx26(Label, { className: "text-xs", children: "Unit Cost" }),
            /* @__PURE__ */ jsx26(
              Input,
              {
                type: "number",
                step: "0.01",
                value: row.unit_cost,
                onFocus: (e) => e.target.select(),
                onChange: (e) => handleUpdate(idx, { unit_cost: channelDraftValue(e.target.value) }),
                className: `h-8 mt-0.5 ${rowInvalid(idx, "unit_cost") ? "border-red-500" : ""}`,
                ...rowAria(idx, "unit_cost")
              }
            ),
            /* @__PURE__ */ jsx26(RowIssue, { idx, field: "unit_cost" })
          ] }),
          /* @__PURE__ */ jsx26("div", { className: "md:col-span-3", children: isOwnedEquipment(row) ? /* @__PURE__ */ jsx26("span", { className: "text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 inline-block", children: "Owned \u2014 no delivery fee" }) : /* @__PURE__ */ jsxs14("label", { className: "flex items-center gap-1.5 cursor-pointer text-xs mb-1", children: [
            /* @__PURE__ */ jsx26(
              Checkbox,
              {
                checked: !!row.include_delivery,
                onCheckedChange: (c) => handleUpdate(idx, { include_delivery: !!c })
              }
            ),
            /* @__PURE__ */ jsxs14("span", { children: [
              "Delivery/Pickup (",
              fmt5(row.delivery_pickup_cost),
              ")"
            ] })
          ] }) }),
          /* @__PURE__ */ jsx26("div", { className: "md:col-span-1 flex items-end justify-end", children: /* @__PURE__ */ jsx26(
            Button,
            {
              size: "sm",
              variant: "ghost",
              onClick: () => handleRemove(idx),
              className: "text-red-500 hover:bg-red-50 h-8 w-8 p-0",
              children: /* @__PURE__ */ jsx26(Trash2, { className: "w-3.5 h-3.5" })
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxs14("div", { className: "flex justify-end mt-2 pt-2 border-t border-slate-200 text-sm", children: [
          /* @__PURE__ */ jsx26("span", { className: "text-slate-600 mr-2", children: "Line Total:" }),
          /* @__PURE__ */ jsx26("span", { className: "font-semibold tabular-nums", children: fmt5(row.total_cost) })
        ] })
      ] }, idx)),
      /* @__PURE__ */ jsx26("div", { className: "flex justify-end pt-2 border-t border-slate-200", children: /* @__PURE__ */ jsxs14("div", { className: "text-right", children: [
        /* @__PURE__ */ jsx26("div", { className: "text-xs text-slate-500", children: "Total Ladder Cost" }),
        /* @__PURE__ */ jsx26("div", { className: "text-lg font-bold tabular-nums", children: fmt5(totalCost) })
      ] }) })
    ] }) })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/PersonnelSelector.jsx
import React16 from "react";
import { jsx as jsx27, jsxs as jsxs15 } from "react/jsx-runtime";
var fmt6 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var ROLE_OPTIONS = ["Crew Lead", "Installer", "Helper"];
var emptyRow = () => ({
  name: "",
  role: "Installer",
  hourly_rate: 0,
  hours: 0,
  total_cost: 0
});
function PersonnelSelector({
  personnel = [],
  onChange,
  projectLaborHours = 0,
  roleRates = {},
  items = [],
  issues = []
}) {
  const rateForRole = (role) => {
    const r = parseFloat(roleRates[role]);
    if (!isNaN(r) && r > 0) return r;
    const fallback = parseFloat(roleRates.Installer);
    return !isNaN(fallback) ? fallback : 0;
  };
  const handleAdd = () => {
    const row = emptyRow();
    row.hourly_rate = rateForRole(row.role);
    onChange([...personnel, row]);
  };
  const handleUpdate = (idx, patch) => {
    const next = [...personnel];
    const merged = { ...next[idx], ...patch };
    if ("role" in patch && patch.role !== next[idx].role) {
      merged.hourly_rate = rateForRole(patch.role);
    }
    next[idx] = recalcPersonnelRow(merged);
    onChange(next);
  };
  const handleRemove = (idx) => {
    if (!confirm(`Remove "${personnel[idx]?.name || "this person"}"?`)) return;
    const next = [...personnel];
    next.splice(idx, 1);
    onChange(next);
  };
  const handleAutoFillCrew = () => {
    const newCrew = suggestPersonnelForProject(items, projectLaborHours, rateForRole);
    onChange(newCrew);
  };
  const rowIssues = (idx, field) => issuesForField(issues, field, null, idx);
  const rowInvalid = (idx, field) => rowIssues(idx, field).length > 0;
  const rowAria = (idx, field) => rowInvalid(idx, field) ? { "aria-invalid": true, "aria-describedby": `clp-crew-${idx}-${field}-issue` } : {};
  const RowIssue = ({ idx, field }) => {
    const fi = rowIssues(idx, field);
    if (!fi.length) return null;
    return /* @__PURE__ */ jsx27("p", { id: `clp-crew-${idx}-${field}-issue`, className: "text-[10px] text-red-600 mt-0.5", role: "alert", children: fi[0].message });
  };
  const totalCost = personnel.reduce(
    (s, p) => {
      if (s === null) return null;
      const v = channelNumber(p.total_cost);
      return v === null ? null : s + v;
    },
    0
  );
  const totalHours = personnel.reduce(
    (s, p) => {
      if (s === null) return null;
      const v = channelNumber(p.hours);
      return v === null ? null : s + v;
    },
    0
  );
  return /* @__PURE__ */ jsxs15(Card, { className: "bg-white border-0 shadow-sm", children: [
    /* @__PURE__ */ jsxs15(CardHeader, { className: "pb-3 flex flex-row items-center justify-between flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxs15("div", { children: [
        /* @__PURE__ */ jsxs15(CardTitle, { className: "text-lg flex items-center gap-2", children: [
          /* @__PURE__ */ jsx27(Users, { className: "w-5 h-5 text-purple-600" }),
          "Personnel (",
          personnel.length,
          ")"
        ] }),
        /* @__PURE__ */ jsx27("p", { className: "text-xs text-slate-500 mt-1", children: "Assign crew members and their hours for this job." })
      ] }),
      /* @__PURE__ */ jsxs15("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxs15(
          Button,
          {
            size: "sm",
            variant: "outline",
            onClick: handleAutoFillCrew,
            className: "h-9 text-xs",
            title: "Auto-suggest crew based on project size & height",
            children: [
              /* @__PURE__ */ jsx27(Wand2, { className: "w-3.5 h-3.5 mr-1" }),
              " Auto-Suggest Crew"
            ]
          }
        ),
        /* @__PURE__ */ jsxs15(
          Button,
          {
            size: "sm",
            onClick: handleAdd,
            className: "bg-purple-600 hover:bg-purple-700 text-white",
            children: [
              /* @__PURE__ */ jsx27(Plus, { className: "w-4 h-4 mr-1" }),
              " Add Person"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx27(CardContent, { children: personnel.length === 0 ? /* @__PURE__ */ jsxs15("div", { className: "border-2 border-dashed border-slate-300 bg-slate-50/50 rounded-lg p-8 text-center", children: [
      /* @__PURE__ */ jsx27(Users, { className: "w-8 h-8 text-slate-400 mx-auto mb-2" }),
      /* @__PURE__ */ jsx27("p", { className: "text-sm text-slate-600 font-medium", children: "No personnel assigned" }),
      /* @__PURE__ */ jsx27("p", { className: "text-xs text-slate-500 mt-1", children: "Add crew members or use Auto-Suggest to populate based on the project." })
    ] }) : /* @__PURE__ */ jsxs15("div", { className: "space-y-2", children: [
      personnel.map((row, idx) => /* @__PURE__ */ jsx27(
        "div",
        {
          className: "border border-slate-200 rounded-lg p-3 bg-slate-50/50",
          children: /* @__PURE__ */ jsxs15("div", { className: "grid md:grid-cols-12 gap-2 items-end", children: [
            /* @__PURE__ */ jsxs15("div", { className: "md:col-span-3", children: [
              /* @__PURE__ */ jsx27(Label, { className: "text-xs", children: "Name" }),
              /* @__PURE__ */ jsx27(
                Input,
                {
                  value: row.name,
                  onChange: (e) => handleUpdate(idx, { name: e.target.value }),
                  placeholder: "e.g. Mike",
                  className: "h-8 mt-0.5"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs15("div", { className: "md:col-span-3", children: [
              /* @__PURE__ */ jsx27(Label, { className: "text-xs", children: "Role" }),
              /* @__PURE__ */ jsx27(
                "select",
                {
                  value: row.role || "Installer",
                  onChange: (e) => handleUpdate(idx, { role: e.target.value }),
                  className: "h-8 mt-0.5 w-full border border-slate-200 rounded-md px-2 text-sm bg-white",
                  children: ROLE_OPTIONS.map((r) => /* @__PURE__ */ jsx27("option", { value: r, children: r }, r))
                }
              )
            ] }),
            /* @__PURE__ */ jsxs15("div", { className: "md:col-span-2", children: [
              /* @__PURE__ */ jsx27(Label, { className: "text-xs", children: "Rate $/hr" }),
              /* @__PURE__ */ jsx27(
                Input,
                {
                  type: "number",
                  step: "0.01",
                  value: row.hourly_rate,
                  onFocus: (e) => e.target.select(),
                  onChange: (e) => handleUpdate(idx, { hourly_rate: channelDraftValue(e.target.value) }),
                  className: `h-8 mt-0.5 ${rowInvalid(idx, "hourly_rate") ? "border-red-500" : ""}`,
                  ...rowAria(idx, "hourly_rate")
                }
              ),
              /* @__PURE__ */ jsx27(RowIssue, { idx, field: "hourly_rate" })
            ] }),
            /* @__PURE__ */ jsxs15("div", { className: "md:col-span-2", children: [
              /* @__PURE__ */ jsx27(Label, { className: "text-xs", children: "Hours" }),
              /* @__PURE__ */ jsx27(
                Input,
                {
                  type: "number",
                  step: "0.25",
                  value: row.hours,
                  onFocus: (e) => e.target.select(),
                  onChange: (e) => handleUpdate(idx, { hours: channelDraftValue(e.target.value) }),
                  className: `h-8 mt-0.5 ${rowInvalid(idx, "hours") ? "border-red-500" : ""}`,
                  ...rowAria(idx, "hours")
                }
              ),
              /* @__PURE__ */ jsx27(RowIssue, { idx, field: "hours" })
            ] }),
            /* @__PURE__ */ jsxs15("div", { className: "md:col-span-1", children: [
              /* @__PURE__ */ jsx27(Label, { className: "text-xs", children: "Total" }),
              /* @__PURE__ */ jsx27("div", { className: "h-8 mt-0.5 text-sm font-medium flex items-center tabular-nums", children: fmt6(row.total_cost) })
            ] }),
            /* @__PURE__ */ jsx27("div", { className: "md:col-span-1 flex items-end justify-end", children: /* @__PURE__ */ jsx27(
              Button,
              {
                size: "sm",
                variant: "ghost",
                onClick: () => handleRemove(idx),
                className: "text-red-500 hover:bg-red-50 h-8 w-8 p-0",
                children: /* @__PURE__ */ jsx27(Trash2, { className: "w-3.5 h-3.5" })
              }
            ) })
          ] })
        },
        idx
      )),
      /* @__PURE__ */ jsxs15("div", { className: "flex justify-between pt-2 border-t border-slate-200 text-sm", children: [
        /* @__PURE__ */ jsxs15("div", { children: [
          /* @__PURE__ */ jsx27("span", { className: "text-slate-500", children: "Total Hours:" }),
          " ",
          /* @__PURE__ */ jsx27("span", { className: "font-semibold tabular-nums", children: Number.isFinite(totalHours) ? totalHours.toFixed(2) : "\u2014" }),
          projectLaborHours > 0 && /* @__PURE__ */ jsxs15("span", { className: "text-xs text-slate-400 ml-2", children: [
            "(calculated: ",
            projectLaborHours.toFixed(2),
            " hrs)"
          ] })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "text-right", children: [
          /* @__PURE__ */ jsx27("span", { className: "text-xs text-slate-500", children: "Total Personnel Cost: " }),
          /* @__PURE__ */ jsx27("span", { className: "text-lg font-bold tabular-nums", children: fmt6(totalCost) })
        ] })
      ] })
    ] }) })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/LettersPurchaseTab.jsx
import React21 from "react";
import { Link as Link6 } from "react-router-dom";

// frozen:/app/src/components/channelLetterInstall/LetterPurchaseRow.jsx
import React20 from "react";

// frozen:/app/src/components/channelLetterInstall/DimensionalFabPanel.jsx
import { useState as useState6, useEffect as useEffect3, useMemo as useMemo4, useCallback } from "react";
import { Link as Link3 } from "react-router-dom";

// s:s://@/components/estimator/loadAllEntityRows
async function loadAllEntityRows(a) {
  globalThis.__catalogReads.push(a.label);
  if (a.entity === globalThis.__entSettings) return globalThis.__settingRows || [];
  if (a.entity === globalThis.__entInv) return globalThis.__invRows || [];
  if (a.entity === globalThis.__entEquip) return globalThis.__equipRows || [];
  if (a.entity === globalThis.__entDim) return globalThis.__dimRows || [];
  return [];
}

// frozen:/app/src/components/channelLetterInstall/dimensionalFabCalculator.jsx
var num2 = (v, fb = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fb : n;
};
var emptyFabConfig = () => ({
  material_id: null,
  material_name: "",
  material_thickness_inches: 0.5,
  material_cost_per_sqin: 0,
  sheet_yield_factor: 0.7,
  // Letter geometry
  letter_height_inches: 0,
  letter_width_inches: 0,
  letter_perimeter_inches: 0,
  // Cutting method
  cutting_method: "cnc",
  // "cnc" | "laser"
  // Cut params (auto-seeded from settings; overridable)
  cut_speed_ipm: 50,
  cut_multiplier: 1,
  // Paint params — same shape as the stand-alone Paint estimator items
  paint_letters: true,
  paint_sides: "front_and_edges",
  // none | front | front_and_edges | all
  num_paint_colors: 1,
  paint_colors: [],
  paint_mask_sqft: 0,
  approx_coverage_factor: "1/4",
  // Resolved cost breakdown (filled by calculator)
  unit_material_cost: 0,
  unit_cut_cost: 0,
  unit_paint_cost: 0,
  unit_total_cost: 0
});
var estimatePerimeterPerLetter = (h, settings, cuttingMethod, override) => {
  if (num2(override) > 0) return num2(override);
  const factorKey = cuttingMethod === "laser" ? "laser_letter_perimeter_factor" : "cnc_letter_perimeter_factor";
  const factor = num2(settings[factorKey], 3.5);
  return num2(h) * factor;
};
var estimateFaceAreaSqinPerLetter = (h) => {
  return Math.pow(num2(h), 2) * 0.8;
};
var getCncRates = (settings) => ({
  machine_rate: num2(settings.cnc_machine_rate, 75),
  labor_rate: num2(settings.cnc_labor_rate, 45),
  setup_time_percentage: num2(settings.cnc_setup_time_percentage, 20),
  min_setup_hours: num2(settings.min_cnc_setup_hours, 0),
  min_labor_hours: num2(settings.min_cnc_labor_hours, 0),
  letter_perimeter_factor: num2(settings.cnc_letter_perimeter_factor, 3.5)
});
var getLaserRates = (settings) => ({
  machine_rate: num2(settings.parameter_laser_machine_rate, 100),
  labor_rate: num2(settings.parameter_laser_labor_rate, 45),
  // Laser uses "handling time percentage" instead of "setup time percentage"
  setup_time_percentage: num2(settings.parameter_handling_time_percentage, 15),
  min_setup_hours: num2(settings.min_laser_setup_hours, 0),
  min_labor_hours: num2(settings.min_laser_labor_hours, 0),
  letter_perimeter_factor: num2(settings.laser_letter_perimeter_factor, 3.5)
});
var getActiveRates = (cuttingMethod, settings) => cuttingMethod === "laser" ? getLaserRates(settings) : getCncRates(settings);
var computeLiquidPaintPerSqft = (settings) => {
  const unitFactors = { oz: 128, pint: 8, quart: 4, liter: 3.78541, gallon: 1 };
  const perGallon = (cost, unit) => {
    const c = num2(cost);
    const f = unitFactors[unit] || 1;
    return c * f;
  };
  const paintG = perGallon(settings.paint_cost_per_unit, settings.paint_unit);
  const hardG = perGallon(settings.hardener_cost_per_unit, settings.hardener_unit);
  const redG = perGallon(settings.reducer_cost_per_unit, settings.reducer_unit);
  const pR = num2(settings.paint_mix_ratio, 3);
  const hR = num2(settings.hardener_mix_ratio, 1);
  const rR = num2(settings.reducer_mix_ratio, 1);
  const total = pR + hR + rR;
  if (total === 0) return 0;
  const costPerMixedGallon = paintG / total * pR + hardG / total * hR + redG / total * rR;
  const coverage = num2(settings.mixed_paint_coverage_sqft_per_gallon, 350);
  return coverage > 0 ? costPerMixedGallon / coverage : 0;
};
var getPaintRates = (settings) => ({
  labor_rate: num2(settings.default_labor_rate, 60),
  supplies_per_sqft: num2(settings.default_paint_supplies_per_sqft, 1.25),
  liquid_paint_per_sqft: computeLiquidPaintPerSqft(settings),
  waste_multiplier: num2(settings.paint_waste_multiplier, 1.25),
  coverage_sqft_per_gallon: num2(settings.mixed_paint_coverage_sqft_per_gallon, 350),
  base_hours_per_sqft: num2(settings.base_labor_hours_per_sqft, 0.05),
  min_labor_hours: num2(settings.min_labor_hours, 0),
  min_paint_cost: num2(settings.min_paint_cost, 0),
  mixing_hours_per_gallon: num2(settings.paint_mixing_labor_hours, 0.25),
  setup_hours: num2(settings.setup_time_labor_hours, 0.5),
  color_change_setup_hours: num2(settings.color_change_setup_hours, 0.25),
  paint_gun_cleaning_hours: num2(settings.paint_gun_cleaning_hours, 0.15),
  // Mask rates
  mask_material_rate: num2(settings.paint_mask_rate_per_sqft, 0.75),
  mask_machine_rate: num2(settings.paint_mask_machine_cutting_rate_per_sqft, 0.1),
  mask_application_labor_rate: num2(settings.paint_mask_application_labor_rate_per_sqft, 0.25),
  mask_cutting_labor_rate: num2(settings.paint_mask_cutting_labor_rate_per_sqft, 0.15),
  // Multipliers — letter complexity defaults to "complex" for dimensional letters
  // since they're not rectangular panels (matches Paint estimator behavior).
  complex_multiplier: num2(settings.complex_complexity_multiplier, 1.5),
  moderate_multiplier: num2(settings.moderate_complexity_multiplier, 1),
  one_side_multiplier: num2(settings.one_side_paint_multiplier, 0.8),
  both_sides_multiplier: num2(settings.both_sides_paint_multiplier, 1),
  additional_color_multiplier: num2(settings.additional_color_multiplier, 0.3)
});
var calcDimensionalUnitCost = (fab, qty, settings) => {
  const safe = { ...emptyFabConfig(), ...fab };
  const numLetters = Math.max(1, num2(qty, 1));
  const facePerLetterSqin = estimateFaceAreaSqinPerLetter(safe.letter_height_inches);
  const unit_material_cost = facePerLetterSqin * num2(safe.material_cost_per_sqin);
  const rates = getActiveRates(safe.cutting_method, settings);
  const perLetterCutLengthIn = estimatePerimeterPerLetter(
    safe.letter_height_inches,
    settings,
    safe.cutting_method,
    safe.letter_perimeter_inches
  );
  const totalCutLengthIn = perLetterCutLengthIn * numLetters;
  const cutSpeed = Math.max(1, num2(safe.cut_speed_ipm, 50));
  const cutMultiplier = Math.max(0.01, num2(safe.cut_multiplier, 1));
  const cutTimeMinutes = totalCutLengthIn / cutSpeed * cutMultiplier;
  const machineTimeHours = cutTimeMinutes / 60;
  let setupTimeHours = machineTimeHours * (rates.setup_time_percentage / 100);
  if (rates.min_setup_hours > 0 && setupTimeHours < rates.min_setup_hours) {
    setupTimeHours = rates.min_setup_hours;
  }
  let machineCost = machineTimeHours * rates.machine_rate;
  let cutLaborCost = setupTimeHours * rates.labor_rate;
  if (rates.min_labor_hours > 0 && setupTimeHours > 0 && setupTimeHours < rates.min_labor_hours) {
    cutLaborCost = rates.min_labor_hours * rates.labor_rate;
  }
  const totalCutCost = machineCost + cutLaborCost;
  const unit_cut_cost = totalCutCost / numLetters;
  let unit_paint_cost = 0;
  let totalPaintMaskCost = 0;
  let totalLiquidPaintAndSuppliesCost = 0;
  let totalPaintLaborCost = 0;
  let totalPaintGallons = 0;
  if (safe.paint_letters && safe.paint_sides !== "none") {
    const paint = getPaintRates(settings);
    const totalFaceSqft = facePerLetterSqin * numLetters / 144;
    const thickness = num2(safe.material_thickness_inches, 0.5);
    const totalEdgeSqft = totalCutLengthIn * thickness / 144;
    let paintableSqft = 0;
    let paintSidesKey = "one_side";
    if (safe.paint_sides === "front") {
      paintableSqft = totalFaceSqft;
      paintSidesKey = "one_side";
    } else if (safe.paint_sides === "front_and_edges") {
      paintableSqft = totalFaceSqft + totalEdgeSqft;
      paintSidesKey = "one_side";
    } else if (safe.paint_sides === "all") {
      paintableSqft = totalFaceSqft * 2 + totalEdgeSqft;
      paintSidesKey = "both_sides";
    }
    const colors = Array.isArray(safe.paint_colors) ? safe.paint_colors.filter((c) => c && c.trim() !== "") : [];
    const numColors = Math.max(1, colors.length || num2(safe.num_paint_colors, 1));
    if (numColors > 1 && num2(safe.paint_mask_sqft) > 0) {
      const maskMaterial = num2(safe.paint_mask_sqft) * paint.mask_material_rate * (numColors - 1);
      const maskMachine = num2(safe.paint_mask_sqft) * paint.mask_machine_rate * (numColors - 1);
      totalPaintMaskCost = maskMaterial + maskMachine;
    }
    const paintApplicationSupplies = paintableSqft * paint.supplies_per_sqft * numColors;
    const liquidPaint = paintableSqft * paint.liquid_paint_per_sqft * paint.waste_multiplier * numColors;
    totalLiquidPaintAndSuppliesCost = paintApplicationSupplies + liquidPaint;
    if (paint.coverage_sqft_per_gallon > 0) {
      totalPaintGallons = paintableSqft * paint.waste_multiplier * numColors / paint.coverage_sqft_per_gallon;
    }
    const complexityMult = paint.complex_multiplier;
    const sidesMult = paintSidesKey === "both_sides" ? paint.both_sides_multiplier : paint.one_side_multiplier;
    let baseHours = paintableSqft * paint.base_hours_per_sqft * complexityMult * sidesMult;
    if (numColors > 1) {
      baseHours *= 1 + (numColors - 1) * paint.additional_color_multiplier;
    }
    if (numColors > 1 && num2(safe.paint_mask_sqft) > 0) {
      const maskApplyHrs = num2(safe.paint_mask_sqft) * paint.mask_application_labor_rate * (numColors - 1) / paint.labor_rate;
      const maskCutHrs = num2(safe.paint_mask_sqft) * paint.mask_cutting_labor_rate * (numColors - 1) / paint.labor_rate;
      baseHours += maskApplyHrs + maskCutHrs;
    }
    let paintLaborHours = baseHours;
    const numberOfMixes = Math.max(1, Math.ceil(totalPaintGallons));
    const mixingHrs = numberOfMixes * paint.mixing_hours_per_gallon;
    const setupHrs = paint.setup_hours;
    const uniqueColors = new Set(
      colors.map((c) => c.trim().toLowerCase()).filter((c) => c)
    );
    const uniqueColorCount = Math.max(numColors > 1 ? uniqueColors.size : 1, 1);
    const colorChangeHrs = uniqueColorCount > 1 ? (uniqueColorCount - 1) * paint.color_change_setup_hours : 0;
    const gunCleanHrs = uniqueColorCount * paint.paint_gun_cleaning_hours;
    const totalPaintLaborHrs = paintLaborHours + mixingHrs + setupHrs + colorChangeHrs + gunCleanHrs;
    const effectivePaintLaborHrs = paint.min_labor_hours > 0 && totalPaintLaborHrs < paint.min_labor_hours ? paint.min_labor_hours : totalPaintLaborHrs;
    totalPaintLaborCost = effectivePaintLaborHrs * paint.labor_rate;
    if (paint.min_paint_cost > 0 && totalLiquidPaintAndSuppliesCost < paint.min_paint_cost) {
      totalLiquidPaintAndSuppliesCost = paint.min_paint_cost;
    }
    const totalPaint = totalPaintMaskCost + totalLiquidPaintAndSuppliesCost + totalPaintLaborCost;
    unit_paint_cost = totalPaint / numLetters;
  }
  const unit_total_cost = unit_material_cost + unit_cut_cost + unit_paint_cost;
  return {
    ...safe,
    face_area_sqin: facePerLetterSqin,
    cut_length_inches: perLetterCutLengthIn,
    // Per-letter values (used by the on-row breakdown UI)
    unit_material_cost,
    unit_cut_cost,
    unit_cnc_cost: unit_cut_cost,
    // back-compat alias
    unit_paint_cost,
    unit_total_cost,
    // Row-level totals (so caller can compare with stand-alone estimator numbers)
    row_total_material_cost: unit_material_cost * numLetters,
    row_total_cut_cost: totalCutCost,
    row_total_paint_mask_cost: totalPaintMaskCost,
    row_total_paint_supplies_cost: totalLiquidPaintAndSuppliesCost,
    row_total_paint_labor_cost: totalPaintLaborCost,
    row_total_paint_gallons: totalPaintGallons,
    row_machine_time_hours: machineTimeHours,
    row_setup_time_hours: setupTimeHours
  };
};
var materialCostPerSqin = (material) => {
  if (!material) return 0;
  const sheetArea = num2(material.sheet_length_inches) * num2(material.sheet_width_inches);
  const yieldFactor = Math.max(0.05, Math.min(1, num2(material.yield_factor, 0.7)));
  const usableArea = sheetArea * yieldFactor;
  if (usableArea <= 0) return 0;
  return num2(material.cost_per_sheet) / usableArea;
};
var lookupCutSpeed = (cuttingMethod, thicknessInches, settings) => {
  if (!thicknessInches) return null;
  const candidates = decimalToImperialKeys(thicknessInches);
  const prefix = cuttingMethod === "laser" ? "cut_speed_" : "cnc_cut_speed_";
  for (const c of candidates) {
    const v = settings[`${prefix}${c}`];
    if (v !== void 0 && v !== null && v !== "") return num2(v);
  }
  return null;
};
var lookupCutMultiplier = (cuttingMethod, materialType, settings) => {
  if (!materialType) return 1;
  const mat = materialType.toLowerCase();
  const key = cuttingMethod === "laser" ? `${mat}_cut_multiplier` : `${mat}_cnc_cut_multiplier`;
  const v = settings[key];
  return v !== void 0 && v !== null && v !== "" ? num2(v, 1) : 1;
};
var decimalToImperialKeys = (decimal) => {
  const map = {
    0.0625: ["1_16"],
    0.125: ["1_8"],
    0.1875: ["3_16"],
    0.25: ["1_4"],
    0.375: ["3_8"],
    0.5: ["1_2"],
    0.625: ["5_8"],
    0.75: ["3_4"],
    0.875: ["7_8"],
    1: ["1"],
    1.25: ["1_1_4"],
    1.5: ["1_1_2"],
    2: ["2"],
    2.5: ["2_1_2"],
    3: ["3"],
    3.5: ["3_1_2"],
    4: ["4"]
  };
  const snap = Math.round(decimal * 16) / 16;
  return map[snap] || [];
};
var PAINT_SIDES_LABELS = {
  none: "No Paint",
  front: "Front Only",
  front_and_edges: "Front + Edges",
  all: "All Sides"
};
var CUTTING_METHOD_LABELS = {
  cnc: "CNC Routing",
  laser: "Laser Cutting"
};

// frozen:/app/src/components/channelLetterInstall/CuttingMethodSlider.jsx
import React17 from "react";
import { jsx as jsx28, jsxs as jsxs16 } from "react/jsx-runtime";
function CuttingMethodSlider({ value, onChange, disabled = false, disableLaser = false }) {
  const options = [
    { key: "cnc", label: "CNC Routing", icon: Router, activeBg: "bg-green-600", activeIcon: "text-white" },
    { key: "laser", label: "Laser Cutting", icon: Zap, activeBg: "bg-red-600", activeIcon: "text-white" }
  ];
  return /* @__PURE__ */ jsx28("div", { className: "inline-flex bg-slate-100 rounded-xl p-1 gap-1 w-full max-w-md", children: options.map((opt) => {
    const active = value === opt.key;
    const Icon = opt.icon;
    const isDisabled = disabled || disableLaser && opt.key === "laser";
    return /* @__PURE__ */ jsxs16(
      "button",
      {
        type: "button",
        type: "button",
        disabled: isDisabled,
        onClick: () => !isDisabled && onChange(opt.key),
        title: disableLaser && opt.key === "laser" ? "This material cannot be cut on the laser." : void 0,
        className: [
          "flex-1 inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-sm font-medium transition-all",
          active ? `${opt.activeBg} text-white shadow-sm` : "text-slate-600 hover:bg-white hover:text-slate-900",
          isDisabled ? "opacity-50 cursor-not-allowed line-through" : "cursor-pointer"
        ].join(" "),
        children: [
          /* @__PURE__ */ jsx28(Icon, { className: `w-4 h-4 ${active ? opt.activeIcon : ""}` }),
          /* @__PURE__ */ jsx28("span", { children: opt.label })
        ]
      },
      opt.key
    );
  }) });
}

// frozen:/app/src/components/channelLetterInstall/PaintCoverageHelper.jsx
import React18 from "react";
import { Fragment, jsx as jsx29, jsxs as jsxs17 } from "react/jsx-runtime";
var COVERAGE_FACTORS = [
  "1/8",
  "1/4",
  "3/8",
  "1/2",
  "5/8",
  "3/4",
  "7/8",
  "1",
  "1-1/8",
  "1-1/4",
  "1-3/8",
  "1-1/2",
  "1-5/8",
  "1-3/4",
  "1-7/8",
  "2"
];
var parseImperialFraction = (s) => {
  if (typeof s !== "string") return parseFloat(s) || 0;
  let total = 0;
  let rest = s;
  const [whole, fracPart] = s.split("-");
  if (fracPart !== void 0) {
    total += parseFloat(whole) || 0;
    rest = fracPart;
  }
  const [num6, den] = rest.split("/");
  if (den !== void 0) {
    const n = parseFloat(num6);
    const d = parseFloat(den);
    if (d) total += n / d;
  } else {
    total += parseFloat(rest) || 0;
  }
  return total;
};
function PaintCoverageHelper({
  faceAreaSqft = 0,
  bothSides = false,
  value = 0,
  factor = "1/4",
  onChange,
  className = ""
}) {
  const setFactor = (f) => {
    const frac = parseImperialFraction(f);
    const sides = bothSides ? 2 : 1;
    const calculated = (parseFloat(faceAreaSqft) || 0) * frac * sides;
    onChange({
      paint_mask_sqft: Number.isFinite(calculated) ? calculated : 0,
      approx_coverage_factor: f
    });
  };
  const setManual = (v) => {
    onChange({
      paint_mask_sqft: parseFloat(v) || 0,
      approx_coverage_factor: factor
    });
  };
  return /* @__PURE__ */ jsxs17("div", { className: `grid grid-cols-1 md:grid-cols-2 gap-3 ${className}`, children: [
    /* @__PURE__ */ jsxs17("div", { children: [
      /* @__PURE__ */ jsx29(Label, { className: "text-xs", children: "Paint Mask Square Feet" }),
      /* @__PURE__ */ jsx29(
        Input,
        {
          type: "number",
          min: "0",
          step: "0.25",
          value: value || "",
          onFocus: (e) => e.target.select(),
          onChange: (e) => setManual(e.target.value),
          className: "mt-1"
        }
      ),
      /* @__PURE__ */ jsx29("p", { className: "text-[11px] text-slate-500 mt-1", children: "Manually enter sqft or use the helper." })
    ] }),
    /* @__PURE__ */ jsxs17("div", { children: [
      /* @__PURE__ */ jsx29(Label, { className: "text-xs", children: "Approx. Coverage Helper" }),
      /* @__PURE__ */ jsxs17(Select, { value: factor || "1/4", onValueChange: setFactor, children: [
        /* @__PURE__ */ jsx29(SelectTrigger, { className: "mt-1", children: /* @__PURE__ */ jsx29(SelectValue, {}) }),
        /* @__PURE__ */ jsx29(SelectContent, { children: COVERAGE_FACTORS.map((f) => /* @__PURE__ */ jsx29(SelectItem, { value: f, children: f }, f)) })
      ] }),
      /* @__PURE__ */ jsx29("p", { className: "text-[11px] text-slate-500 mt-1", children: faceAreaSqft > 0 ? /* @__PURE__ */ jsxs17(Fragment, { children: [
        "Face area: ",
        /* @__PURE__ */ jsxs17("strong", { children: [
          faceAreaSqft.toFixed(2),
          " sqft"
        ] }),
        bothSides ? " \xD7 2 sides" : ""
      ] }) : /* @__PURE__ */ jsx29(Fragment, { children: "Calculates mask sqft based on face area." }) })
    ] })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/letterWidthCalculator.jsx
var AVG_WIDTH_TO_HEIGHT_RATIO = 0.72;
var estimateAverageLetterWidth = (heightInches) => {
  const h = parseFloat(heightInches);
  if (!isFinite(h) || h <= 0) return 0;
  const raw = h * AVG_WIDTH_TO_HEIGHT_RATIO;
  return Math.ceil(raw * 2) / 2;
};

// frozen:/app/src/components/channelLetterInstall/DimensionalMaterialPickerDialog.jsx
import React19, { useState as useState5, useMemo as useMemo3 } from "react";

// s:s://@/components/ui/dialog
import { jsx as jsx30 } from "react/jsx-runtime";
var Dialog = (p) => p.open ? /* @__PURE__ */ jsx30("div", { children: p.children }) : null;
var DialogContent = (p) => /* @__PURE__ */ jsx30("div", { children: p.children });
var DialogHeader = (p) => /* @__PURE__ */ jsx30("div", { children: p.children });
var DialogTitle = (p) => /* @__PURE__ */ jsx30("div", { children: p.children });
var DialogFooter = (p) => /* @__PURE__ */ jsx30("div", { children: p.children });
var DialogDescription = (p) => /* @__PURE__ */ jsx30("div", { children: p.children });

// frozen:/app/src/components/channelLetterInstall/DimensionalMaterialPickerDialog.jsx
import { jsx as jsx31, jsxs as jsxs18 } from "react/jsx-runtime";
var MATERIAL_TYPE_LABELS = {
  acrylic: "Acrylic",
  pvc: "PVC / Sintra",
  aluminum_composite: "ACM (Aluminum Composite)",
  aluminum_solid: "Solid Aluminum",
  aluminum_sheet: "Aluminum Sheet",
  steel_sheet: "Steel Sheet",
  stainless_sheet: "Stainless Sheet",
  galvanized_sheet: "Galvanized Sheet",
  polycarbonate: "Polycarbonate",
  styrene: "Styrene",
  coroplast: "Coroplast",
  gatorboard: "Gatorboard",
  wood: "Wood",
  mdf: "MDF",
  hdu: "HDU Foam",
  foam: "EPS Foam",
  other: "Other"
};
var TYPE_COLORS = {
  acrylic: "bg-cyan-100 text-cyan-800",
  pvc: "bg-blue-100 text-blue-800",
  aluminum_composite: "bg-slate-100 text-slate-800",
  aluminum_solid: "bg-zinc-100 text-zinc-800",
  wood: "bg-amber-100 text-amber-800",
  mdf: "bg-orange-100 text-orange-800",
  hdu: "bg-pink-100 text-pink-800",
  foam: "bg-purple-100 text-purple-800",
  other: "bg-slate-100 text-slate-800"
};
var fmt7 = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;
var SORT_OPTIONS = {
  name: { label: "Name (A\u2013Z)", fn: (a, b) => (a.material_name || "").localeCompare(b.material_name || "") },
  type: { label: "Material Type", fn: (a, b) => (a.material_type || "").localeCompare(b.material_type || "") },
  thickness: { label: "Thickness (low\u2192high)", fn: (a, b) => (a.thickness_inches || 0) - (b.thickness_inches || 0) },
  cost_low: { label: "$/sqft (low\u2192high)", fn: (a, b) => materialCostPerSqin(a) - materialCostPerSqin(b) },
  cost_high: { label: "$/sqft (high\u2192low)", fn: (a, b) => materialCostPerSqin(b) - materialCostPerSqin(a) }
};
function DimensionalMaterialPickerDialog({ open, onClose, materials = [], selectedId, onSelect }) {
  const [search, setSearch] = useState5("");
  const [typeFilter, setTypeFilter] = useState5("all");
  const [paintFilter, setPaintFilter] = useState5("all");
  const [laserFilter, setLaserFilter] = useState5("all");
  const [sortKey, setSortKey] = useState5("name");
  const availableTypes = useMemo3(() => {
    const set = new Set(materials.map((m) => m.material_type).filter(Boolean));
    return Array.from(set);
  }, [materials]);
  const filtered = useMemo3(() => {
    let list = materials.filter((m) => {
      if (typeFilter !== "all" && m.material_type !== typeFilter) return false;
      if (paintFilter === "yes" && !m.needs_painting) return false;
      if (paintFilter === "no" && m.needs_painting) return false;
      if (laserFilter === "yes" && m.allow_laser === false) return false;
      if (laserFilter === "no" && m.allow_laser !== false) return false;
      if (search) {
        const hay = `${m.material_name} ${m.color || ""} ${m.supplier || ""} ${MATERIAL_TYPE_LABELS[m.material_type] || ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
    return list.sort(SORT_OPTIONS[sortKey].fn);
  }, [materials, typeFilter, paintFilter, laserFilter, search, sortKey]);
  return /* @__PURE__ */ jsx31(Dialog, { open, onOpenChange: (o) => !o && onClose(), children: /* @__PURE__ */ jsxs18(DialogContent, { className: "max-w-4xl max-h-[85vh] flex flex-col p-0", children: [
    /* @__PURE__ */ jsx31(DialogHeader, { className: "p-4 pb-2 border-b", children: /* @__PURE__ */ jsx31(DialogTitle, { children: "Select Sheet Material" }) }),
    /* @__PURE__ */ jsxs18("div", { className: "px-4 py-3 border-b space-y-2 bg-slate-50", children: [
      /* @__PURE__ */ jsxs18("div", { className: "relative", children: [
        /* @__PURE__ */ jsx31(Search, { className: "w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }),
        /* @__PURE__ */ jsx31(
          Input,
          {
            autoFocus: true,
            placeholder: "Search by name, color, supplier, type...",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            className: "pl-9 h-9 bg-white"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs18("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxs18(Select, { value: typeFilter, onValueChange: setTypeFilter, children: [
          /* @__PURE__ */ jsx31(SelectTrigger, { className: "h-8 w-44 text-xs bg-white", children: /* @__PURE__ */ jsx31(SelectValue, {}) }),
          /* @__PURE__ */ jsxs18(SelectContent, { children: [
            /* @__PURE__ */ jsx31(SelectItem, { value: "all", children: "All Types" }),
            availableTypes.map((t) => /* @__PURE__ */ jsx31(SelectItem, { value: t, children: MATERIAL_TYPE_LABELS[t] || t }, t))
          ] })
        ] }),
        /* @__PURE__ */ jsxs18(Select, { value: paintFilter, onValueChange: setPaintFilter, children: [
          /* @__PURE__ */ jsx31(SelectTrigger, { className: "h-8 w-36 text-xs bg-white", children: /* @__PURE__ */ jsx31(SelectValue, {}) }),
          /* @__PURE__ */ jsxs18(SelectContent, { children: [
            /* @__PURE__ */ jsx31(SelectItem, { value: "all", children: "Paint: Any" }),
            /* @__PURE__ */ jsx31(SelectItem, { value: "yes", children: "Needs Paint" }),
            /* @__PURE__ */ jsx31(SelectItem, { value: "no", children: "Pre-finished" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs18(Select, { value: laserFilter, onValueChange: setLaserFilter, children: [
          /* @__PURE__ */ jsx31(SelectTrigger, { className: "h-8 w-36 text-xs bg-white", children: /* @__PURE__ */ jsx31(SelectValue, {}) }),
          /* @__PURE__ */ jsxs18(SelectContent, { children: [
            /* @__PURE__ */ jsx31(SelectItem, { value: "all", children: "Laser: Any" }),
            /* @__PURE__ */ jsx31(SelectItem, { value: "yes", children: "Laser OK" }),
            /* @__PURE__ */ jsx31(SelectItem, { value: "no", children: "CNC Only" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs18(Select, { value: sortKey, onValueChange: setSortKey, children: [
          /* @__PURE__ */ jsxs18(SelectTrigger, { className: "h-8 w-48 text-xs bg-white", children: [
            /* @__PURE__ */ jsx31(ArrowUpDown, { className: "w-3.5 h-3.5 mr-1 text-slate-400" }),
            /* @__PURE__ */ jsx31(SelectValue, {})
          ] }),
          /* @__PURE__ */ jsx31(SelectContent, { children: Object.entries(SORT_OPTIONS).map(([k, o]) => /* @__PURE__ */ jsx31(SelectItem, { value: k, children: o.label }, k)) })
        ] }),
        /* @__PURE__ */ jsxs18("span", { className: "text-xs text-slate-500 self-center ml-auto", children: [
          filtered.length,
          " of ",
          materials.length
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx31("div", { className: "flex-1 overflow-y-auto p-3 space-y-1.5", children: filtered.length === 0 ? /* @__PURE__ */ jsx31("div", { className: "text-center py-12 text-slate-400 text-sm", children: "No materials match your filters." }) : filtered.map((m) => {
      const isSel = m.id === selectedId;
      const sqin = materialCostPerSqin(m);
      return /* @__PURE__ */ jsxs18(
        "button",
        {
          type: "button",
          onClick: () => {
            onSelect(m.id);
            onClose();
          },
          className: `w-full text-left border rounded-lg p-3 transition-colors flex items-center gap-3 ${isSel ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`,
          children: [
            /* @__PURE__ */ jsxs18("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsxs18("div", { className: "flex items-center gap-2 flex-wrap", children: [
                /* @__PURE__ */ jsx31("span", { className: "font-medium text-sm text-slate-900 truncate", children: m.material_name }),
                /* @__PURE__ */ jsx31(Badge, { className: `${TYPE_COLORS[m.material_type] || TYPE_COLORS.other} text-[10px]`, children: MATERIAL_TYPE_LABELS[m.material_type] || m.material_type }),
                m.allow_laser === false && /* @__PURE__ */ jsx31(Badge, { variant: "outline", className: "text-[10px] text-amber-700 border-amber-300", children: "CNC only" })
              ] }),
              /* @__PURE__ */ jsxs18("div", { className: "text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3", children: [
                /* @__PURE__ */ jsxs18("span", { children: [
                  m.thickness_inches,
                  '" thick'
                ] }),
                m.color && /* @__PURE__ */ jsx31("span", { children: m.color }),
                m.supplier && /* @__PURE__ */ jsx31("span", { children: m.supplier }),
                /* @__PURE__ */ jsxs18("span", { children: [
                  Math.round((m.yield_factor || 0.7) * 100),
                  "% yield"
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsx31("div", { className: "text-right flex-shrink-0", children: /* @__PURE__ */ jsxs18("div", { className: "text-sm font-semibold tabular-nums text-slate-900", children: [
              fmt7(sqin * 144),
              /* @__PURE__ */ jsx31("span", { className: "text-[10px] text-slate-400", children: "/sqft" })
            ] }) }),
            isSel && /* @__PURE__ */ jsx31(Check, { className: "w-4 h-4 text-blue-600 flex-shrink-0" })
          ]
        },
        m.id
      );
    }) }),
    /* @__PURE__ */ jsx31("div", { className: "p-3 border-t flex justify-end bg-slate-50", children: /* @__PURE__ */ jsx31(Button, { variant: "outline", onClick: onClose, children: "Close" }) })
  ] }) });
}

// frozen:/app/src/components/channelLetterInstall/DimensionalFabPanel.jsx
import { Fragment as Fragment2, jsx as jsx32, jsxs as jsxs19 } from "react/jsx-runtime";
var fmt8 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
function DimensionalFabPanel({ purchase, onUpdate, onReset }) {
  const [materials, setMaterials] = useState6([]);
  const [settings, setSettings] = useState6({});
  const [fab, setFab] = useState6(() => ({ ...emptyFabConfig(), ...purchase?.fab_config || {} }));
  const [loading, setLoading] = useState6(true);
  const [pickerOpen, setPickerOpen] = useState6(false);
  const loadSettings = useCallback(async () => {
    try {
      const list = await loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" });
      const map = {};
      list.forEach((s) => {
        map[s.setting_name] = s.setting_value;
      });
      setSettings(map);
      return map;
    } catch (e) {
      console.error("Failed to load settings:", e);
      return {};
    }
  }, []);
  useEffect3(() => {
    (async () => {
      setLoading(true);
      try {
        const [mats] = await Promise.all([
          loadAllEntityRows({ entity: DimensionalLetterMaterial, query: { is_active: true }, sort: "sort_order", label: "Dimensional Letter materials" }),
          loadSettings()
        ]);
        setMaterials(mats);
        const seed = { ...emptyFabConfig(), ...purchase?.fab_config || {} };
        if (seed.cnc_cut_speed_ipm && !seed.cut_speed_ipm) seed.cut_speed_ipm = seed.cnc_cut_speed_ipm;
        if (seed.width_override === void 0) seed.width_override = false;
        setFab(seed);
      } catch (e) {
        console.error("Failed to load fab inputs:", e);
      }
      setLoading(false);
    })();
  }, [purchase?.id]);
  const update = (patch) => setFab((prev) => ({ ...prev, ...patch }));
  const selectedMaterial = useMemo4(
    () => materials.find((x) => x.id === fab.material_id) || null,
    [materials, fab.material_id]
  );
  const laserDisallowed = selectedMaterial ? selectedMaterial.allow_laser === false : false;
  const selectMaterial = (id) => {
    const m = materials.find((x) => x.id === id);
    if (!m) return;
    const matType = m.material_type || "";
    const forceCnc = m.allow_laser === false && fab.cutting_method === "laser";
    const nextMethod = forceCnc ? "cnc" : fab.cutting_method;
    const speedFromSettings = lookupCutSpeed(nextMethod, m.thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(nextMethod, matType, settings);
    setFab((prev) => ({
      ...prev,
      material_id: m.id,
      material_name: m.material_name,
      material_type: matType,
      material_thickness_inches: m.thickness_inches,
      material_cost_per_sqin: materialCostPerSqin(m),
      sheet_yield_factor: m.yield_factor,
      paint_letters: !!m.needs_painting,
      cutting_method: nextMethod,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings
    }));
  };
  const setCuttingMethod = (method) => {
    if (method === "laser" && laserDisallowed) return;
    const speedFromSettings = lookupCutSpeed(method, fab.material_thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(method, fab.material_type, settings);
    setFab((prev) => ({
      ...prev,
      cutting_method: method,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings
    }));
  };
  const qty = parseFloat(purchase?.qty) || 1;
  const computed = useMemo4(() => calcDimensionalUnitCost(fab, qty, settings), [fab, qty, settings]);
  const activeRates = useMemo4(() => getActiveRates(fab.cutting_method, settings), [fab.cutting_method, settings]);
  const paintR = useMemo4(() => getPaintRates(settings), [settings]);
  useEffect3(() => {
    if (loading) return;
    const final = calcDimensionalUnitCost(fab, qty, settings);
    onUpdate({
      fab_config: {
        material_id: final.material_id,
        material_name: final.material_name,
        material_type: final.material_type,
        material_thickness_inches: final.material_thickness_inches,
        material_cost_per_sqin: final.material_cost_per_sqin,
        sheet_yield_factor: final.sheet_yield_factor,
        letter_height_inches: final.letter_height_inches,
        letter_width_inches: final.letter_width_inches,
        width_override: !!fab.width_override,
        letter_perimeter_inches: final.letter_perimeter_inches,
        cutting_method: final.cutting_method,
        cut_speed_ipm: final.cut_speed_ipm,
        cut_multiplier: final.cut_multiplier,
        paint_letters: final.paint_letters,
        paint_sides: final.paint_sides,
        num_paint_colors: final.num_paint_colors,
        paint_colors: final.paint_colors || [],
        paint_mask_sqft: final.paint_mask_sqft || 0,
        approx_coverage_factor: final.approx_coverage_factor || "1/4",
        unit_material_cost: final.unit_material_cost,
        unit_cut_cost: final.unit_cut_cost,
        unit_paint_cost: final.unit_paint_cost,
        unit_total_cost: final.unit_total_cost
      },
      size_value: (final.face_area_sqin || 1) / 144
    });
  }, [fab, qty, settings, loading]);
  const isLaser = fab.cutting_method === "laser";
  const cutSettingsPage = "EstimatorSettings";
  const faceAreaSqft = (computed.face_area_sqin || 0) / 144;
  const paintColors = Array.isArray(fab.paint_colors) ? fab.paint_colors : [];
  const numColors = paintColors.length || fab.num_paint_colors || 1;
  const updateColor = (idx, val) => {
    const list = [...paintColors];
    list[idx] = val;
    update({ paint_colors: list, num_paint_colors: list.length });
  };
  const addColor = () => {
    const list = [...paintColors, ""];
    update({ paint_colors: list, num_paint_colors: list.length });
  };
  const removeColor = (idx) => {
    const list = paintColors.filter((_, i) => i !== idx);
    update({ paint_colors: list, num_paint_colors: Math.max(1, list.length) });
  };
  const oversize = !!fab.width_override;
  useEffect3(() => {
    if (loading) return;
    if (oversize) return;
    const h = parseFloat(fab.letter_height_inches) || 0;
    if (h <= 0) return;
    const autoW = estimateAverageLetterWidth(h);
    if (autoW !== fab.letter_width_inches) {
      setFab((prev) => ({ ...prev, letter_width_inches: autoW }));
    }
  }, [fab.letter_height_inches, oversize, loading]);
  if (loading) {
    return /* @__PURE__ */ jsx32("div", { className: "rounded-xl p-4 text-center text-slate-500", children: "Loading material library\u2026" });
  }
  return /* @__PURE__ */ jsxs19("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx32(
      DimensionalMaterialPickerDialog,
      {
        open: pickerOpen,
        onClose: () => setPickerOpen(false),
        materials,
        selectedId: fab.material_id,
        onSelect: selectMaterial
      }
    ),
    /* @__PURE__ */ jsx32(Section, { icon: Box, title: "1. Material", color: "bg-blue-50 text-blue-700", children: materials.length === 0 ? /* @__PURE__ */ jsxs19("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2", children: [
      /* @__PURE__ */ jsx32(AlertCircle, { className: "w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" }),
      /* @__PURE__ */ jsxs19("div", { className: "flex-1 text-xs text-amber-800", children: [
        /* @__PURE__ */ jsx32("p", { className: "font-medium mb-1", children: "No sheet materials in your library yet." }),
        /* @__PURE__ */ jsxs19(Link3, { to: createPageUrl("MasterInventory"), className: "inline-flex items-center gap-1 underline", children: [
          /* @__PURE__ */ jsx32(Link, { className: "w-3 h-3" }),
          " Open Inventory \u2192 Dimensional Sheets tab"
        ] })
      ] })
    ] }) : /* @__PURE__ */ jsxs19(Fragment2, { children: [
      /* @__PURE__ */ jsxs19("div", { className: "grid grid-cols-1 md:grid-cols-12 gap-3", children: [
        /* @__PURE__ */ jsxs19("div", { className: "md:col-span-6", children: [
          /* @__PURE__ */ jsx32(Label, { className: "text-xs", children: "Sheet Material" }),
          /* @__PURE__ */ jsxs19(
            Button,
            {
              type: "button",
              variant: "outline",
              onClick: () => setPickerOpen(true),
              className: "h-9 mt-1 w-full justify-between bg-white font-normal",
              children: [
                /* @__PURE__ */ jsx32("span", { className: "truncate", children: fab.material_id ? `${fab.material_name} \u2014 ${fab.material_thickness_inches}"` : /* @__PURE__ */ jsx32("span", { className: "text-slate-400", children: "Select material..." }) }),
                /* @__PURE__ */ jsx32(Search, { className: "w-4 h-4 text-slate-400 flex-shrink-0" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs19("div", { className: "md:col-span-3", children: [
          /* @__PURE__ */ jsx32(Label, { className: "text-xs", children: "Letter Height (in)" }),
          /* @__PURE__ */ jsx32(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.5",
              value: fab.letter_height_inches,
              onFocus: (e) => e.target.select(),
              onChange: (e) => update({ letter_height_inches: channelDraftValue(e.target.value) }),
              className: "h-9 mt-1 bg-white tabular-nums"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs19("div", { className: "md:col-span-3", children: [
          /* @__PURE__ */ jsxs19(Label, { className: "text-xs flex items-center justify-between gap-1", children: [
            /* @__PURE__ */ jsx32("span", { children: "Letter Width (avg, in)" }),
            /* @__PURE__ */ jsxs19("label", { className: "flex items-center gap-1 text-[10px] text-slate-500 font-normal cursor-pointer", children: [
              /* @__PURE__ */ jsx32(
                Checkbox,
                {
                  checked: oversize,
                  onCheckedChange: (c) => update({ width_override: !!c }),
                  className: "h-3 w-3"
                }
              ),
              "Oversize"
            ] })
          ] }),
          /* @__PURE__ */ jsx32(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.5",
              value: fab.letter_width_inches,
              onFocus: (e) => e.target.select(),
              disabled: !oversize,
              onChange: (e) => update({ letter_width_inches: channelDraftValue(e.target.value) }),
              className: `h-9 mt-1 tabular-nums ${oversize ? "bg-white" : "bg-slate-50 text-slate-600"}`
            }
          )
        ] })
      ] }),
      fab.material_id && /* @__PURE__ */ jsxs19("p", { className: "text-[11px] text-slate-500", children: [
        "Thickness: ",
        /* @__PURE__ */ jsxs19("strong", { children: [
          fab.material_thickness_inches,
          '"'
        ] }),
        " \xB7 \u2248 ",
        fmt8(fab.material_cost_per_sqin * 144),
        "/sqft after ",
        Math.round(fab.sheet_yield_factor * 100),
        "% yield",
        !oversize && /* @__PURE__ */ jsxs19("span", { className: "ml-2 text-slate-400", children: [
          "\xB7 Width auto-calculated from height (avg of 10 fonts). Check ",
          /* @__PURE__ */ jsx32("strong", { children: "Oversize" }),
          " to edit."
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs19(
      Section,
      {
        icon: isLaser ? Zap : Router,
        title: "2. Cutting",
        color: isLaser ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700",
        children: [
          /* @__PURE__ */ jsx32(CuttingMethodSlider, { value: fab.cutting_method, onChange: setCuttingMethod, disableLaser: laserDisallowed }),
          laserDisallowed && /* @__PURE__ */ jsxs19("div", { className: "bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 text-[11px] text-amber-800 flex items-start gap-1.5", children: [
            /* @__PURE__ */ jsx32(AlertCircle, { className: "w-3.5 h-3.5 flex-shrink-0 mt-0.5" }),
            /* @__PURE__ */ jsxs19("span", { children: [
              /* @__PURE__ */ jsx32("strong", { children: selectedMaterial?.material_name }),
              " is not laser-cuttable \u2014 CNC is being used. (Change in Inventory \u2192 Dimensional Sheets if this is wrong.)"
            ] })
          ] }),
          /* @__PURE__ */ jsxs19("div", { className: "flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-md px-2 py-1.5", children: [
            /* @__PURE__ */ jsxs19("span", { children: [
              "Machine: ",
              /* @__PURE__ */ jsxs19("strong", { children: [
                "$",
                activeRates.machine_rate.toFixed(0),
                "/hr"
              ] }),
              " \xB7 Operator: ",
              /* @__PURE__ */ jsxs19("strong", { children: [
                "$",
                activeRates.labor_rate.toFixed(0),
                "/hr"
              ] }),
              fab.cut_speed_ipm ? /* @__PURE__ */ jsxs19(Fragment2, { children: [
                " \xB7 Speed: ",
                /* @__PURE__ */ jsxs19("strong", { children: [
                  Math.round(fab.cut_speed_ipm),
                  " in/min"
                ] })
              ] }) : null
            ] }),
            /* @__PURE__ */ jsxs19("span", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxs19(Link3, { to: createPageUrl(cutSettingsPage), className: "underline", children: [
                "Edit ",
                isLaser ? "Laser" : "CNC",
                " settings"
              ] }),
              /* @__PURE__ */ jsxs19(
                "button",
                {
                  type: "button",
                  onClick: loadSettings,
                  title: "Refresh rates from settings",
                  className: "inline-flex items-center gap-1 text-slate-500 hover:text-slate-800",
                  children: [
                    /* @__PURE__ */ jsx32(RefreshCw, { className: "w-3 h-3" }),
                    " Refresh"
                  ]
                }
              )
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs19(Section, { icon: Paintbrush, title: "3. Paint", color: "bg-purple-50 text-purple-700", children: [
      /* @__PURE__ */ jsxs19("label", { className: "flex items-center gap-2 cursor-pointer text-sm", children: [
        /* @__PURE__ */ jsx32(Checkbox, { checked: !!fab.paint_letters, onCheckedChange: (c) => update({ paint_letters: !!c }) }),
        /* @__PURE__ */ jsx32("span", { className: "font-medium", children: "Paint these letters" })
      ] }),
      fab.paint_letters && /* @__PURE__ */ jsxs19(Fragment2, { children: [
        /* @__PURE__ */ jsxs19("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs19("div", { children: [
            /* @__PURE__ */ jsx32(Label, { className: "text-xs", children: "Paint Sides" }),
            /* @__PURE__ */ jsxs19(Select, { value: fab.paint_sides, onValueChange: (v) => update({ paint_sides: v }), children: [
              /* @__PURE__ */ jsx32(SelectTrigger, { className: "h-9 mt-1 bg-white", children: /* @__PURE__ */ jsx32(SelectValue, {}) }),
              /* @__PURE__ */ jsx32(SelectContent, { children: Object.entries(PAINT_SIDES_LABELS).map(([v, l]) => /* @__PURE__ */ jsx32(SelectItem, { value: v, children: l }, v)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs19("div", { children: [
            /* @__PURE__ */ jsx32(Label, { className: "text-xs", children: "Paint Colors" }),
            /* @__PURE__ */ jsxs19("div", { className: "space-y-1.5 mt-1", children: [
              paintColors.length === 0 ? /* @__PURE__ */ jsx32(
                Input,
                {
                  placeholder: "e.g., PMS 186C, Black, White",
                  onChange: (e) => update({ paint_colors: [e.target.value], num_paint_colors: 1 }),
                  className: "h-9 bg-white"
                }
              ) : paintColors.map((c, i) => /* @__PURE__ */ jsxs19("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx32(
                  Input,
                  {
                    value: c,
                    onChange: (e) => updateColor(i, e.target.value),
                    placeholder: "e.g., PMS 186C, Black, White",
                    className: "h-9 bg-white"
                  }
                ),
                paintColors.length > 1 && /* @__PURE__ */ jsx32(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 text-red-500 hover:bg-red-50", onClick: () => removeColor(i), children: /* @__PURE__ */ jsx32(Trash2, { className: "w-3.5 h-3.5" }) })
              ] }, i)),
              /* @__PURE__ */ jsx32(Button, { type: "button", variant: "outline", size: "sm", onClick: addColor, className: "h-7 text-xs", children: "+ Add Color" })
            ] })
          ] })
        ] }),
        numColors > 1 && /* @__PURE__ */ jsxs19("div", { className: "bg-white border border-purple-200 rounded-lg p-3", children: [
          /* @__PURE__ */ jsx32("p", { className: "text-xs font-semibold text-purple-900 mb-2", children: "Paint Mask (multi-color)" }),
          /* @__PURE__ */ jsx32(
            PaintCoverageHelper,
            {
              faceAreaSqft,
              bothSides: fab.paint_sides === "all",
              value: fab.paint_mask_sqft,
              factor: fab.approx_coverage_factor || "1/4",
              onChange: (patch) => update(patch)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs19("p", { className: "text-[11px] text-slate-500", children: [
        "Labor: $",
        paintR.labor_rate.toFixed(0),
        "/hr \xB7 Supplies: $",
        paintR.supplies_per_sqft.toFixed(2),
        "/sqft \xB7 Liquid: $",
        paintR.liquid_paint_per_sqft.toFixed(2),
        "/sqft",
        " ",
        /* @__PURE__ */ jsx32(Link3, { to: createPageUrl("EstimatorSettings"), className: "underline ml-1", children: "Edit Paint settings" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs19("div", { className: "bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-3 space-y-1.5", children: [
      /* @__PURE__ */ jsxs19("div", { className: "flex items-center gap-2 mb-1", children: [
        /* @__PURE__ */ jsx32(Calculator, { className: "w-4 h-4" }),
        /* @__PURE__ */ jsx32("span", { className: "font-semibold text-sm", children: "Per-Letter Breakdown" }),
        /* @__PURE__ */ jsxs19(Badge, { className: "ml-auto bg-white/10 text-white border-0", children: [
          qty,
          " letter",
          qty === 1 ? "" : "s"
        ] })
      ] }),
      /* @__PURE__ */ jsx32(PreviewRow, { label: "Material", value: computed.unit_material_cost, subtitle: `${(computed.face_area_sqin || 0).toFixed(1)} sqin/letter` }),
      /* @__PURE__ */ jsx32(
        PreviewRow,
        {
          label: CUTTING_METHOD_LABELS[fab.cutting_method] || "Cutting",
          value: computed.unit_cut_cost,
          subtitle: `${(computed.cut_length_inches || 0).toFixed(0)}" cut/letter`
        }
      ),
      fab.paint_letters && /* @__PURE__ */ jsx32(PreviewRow, { label: "Paint", value: computed.unit_paint_cost, subtitle: PAINT_SIDES_LABELS[fab.paint_sides] }),
      /* @__PURE__ */ jsxs19("div", { className: "border-t border-white/20 pt-2 space-y-1", children: [
        /* @__PURE__ */ jsxs19("div", { className: "flex justify-between items-center text-[11px] text-slate-400", children: [
          /* @__PURE__ */ jsxs19("span", { children: [
            "Row totals (from ",
            isLaser ? "Laser" : "CNC",
            " + Paint settings)"
          ] }),
          /* @__PURE__ */ jsxs19("span", { className: "tabular-nums", children: [
            "Mat $",
            (computed.row_total_material_cost || 0).toFixed(2),
            " \xB7 Cut $",
            (computed.row_total_cut_cost || 0).toFixed(2),
            fab.paint_letters && /* @__PURE__ */ jsxs19(Fragment2, { children: [
              " \xB7 Paint $",
              ((computed.row_total_paint_mask_cost || 0) + (computed.row_total_paint_supplies_cost || 0) + (computed.row_total_paint_labor_cost || 0)).toFixed(2)
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs19("div", { className: "flex justify-between items-center", children: [
          /* @__PURE__ */ jsxs19("span", { className: "text-sm text-slate-300", children: [
            "Total (",
            qty,
            " letter",
            qty === 1 ? "" : "s",
            ")"
          ] }),
          /* @__PURE__ */ jsx32("span", { className: "text-xl font-bold tabular-nums", children: fmt8(computed.unit_total_cost * qty) })
        ] })
      ] })
    ] })
  ] });
}
var Section = ({ icon: Icon, title, color, children }) => /* @__PURE__ */ jsxs19("div", { className: "border border-slate-200 rounded-lg p-3 space-y-3 bg-white", children: [
  /* @__PURE__ */ jsxs19("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsx32("div", { className: `w-7 h-7 rounded-lg ${color} flex items-center justify-center`, children: /* @__PURE__ */ jsx32(Icon, { className: "w-4 h-4" }) }),
    /* @__PURE__ */ jsx32("span", { className: "font-semibold text-slate-800 text-sm", children: title })
  ] }),
  children
] });
var PreviewRow = ({ label, value, subtitle }) => /* @__PURE__ */ jsxs19("div", { className: "flex justify-between items-center text-sm", children: [
  /* @__PURE__ */ jsxs19("div", { children: [
    /* @__PURE__ */ jsx32("span", { className: "text-slate-300", children: label }),
    subtitle && /* @__PURE__ */ jsx32("span", { className: "ml-2 text-[10px] text-slate-500", children: subtitle })
  ] }),
  /* @__PURE__ */ jsx32("span", { className: "tabular-nums font-medium", children: fmt8(value) })
] });

// frozen:/app/src/components/channelLetterInstall/BackerSection.jsx
import { useState as useState9, useEffect as useEffect6 } from "react";

// frozen:/app/src/components/channelLetterInstall/BackerFabPanel.jsx
import { useState as useState8, useEffect as useEffect5, useMemo as useMemo6, useCallback as useCallback3 } from "react";
import { Link as Link5 } from "react-router-dom";

// frozen:/app/src/components/channelLetterInstall/BackerFabModal.jsx
import { useState as useState7, useEffect as useEffect4, useMemo as useMemo5, useCallback as useCallback2 } from "react";
import { Link as Link4 } from "react-router-dom";
import { Fragment as Fragment3, jsx as jsx33, jsxs as jsxs20 } from "react/jsx-runtime";
var num3 = (v, fb = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fb : n;
};
var emptyBackerFabConfig = () => ({
  material_id: null,
  material_name: "",
  material_thickness_inches: 0.5,
  material_cost_per_sqin: 0,
  sheet_yield_factor: 0.7,
  width_inches: 48,
  height_inches: 24,
  cut_length_override_inches: 0,
  // 0 = use 2*(W+H) perimeter
  cutting_method: "cnc",
  cut_speed_ipm: 50,
  setup_minutes: 15,
  cut_multiplier: 1,
  paint_letters: true,
  // applies to backer face
  paint_sides: "front_and_edges",
  num_paint_colors: 1,
  unit_material_cost: 0,
  unit_cut_cost: 0,
  unit_paint_cost: 0,
  unit_total_cost: 0
});
var calcBackerUnitCost = (fab, qty, settings) => {
  const safe = { ...emptyBackerFabConfig(), ...fab };
  const panelQty = Math.max(1, num3(qty, 1));
  const faceAreaSqin = num3(safe.width_inches) * num3(safe.height_inches);
  const unit_material_cost = faceAreaSqin * num3(safe.material_cost_per_sqin);
  const cutLengthIn = num3(safe.cut_length_override_inches) > 0 ? num3(safe.cut_length_override_inches) : 2 * (num3(safe.width_inches) + num3(safe.height_inches));
  const rates = getActiveRates(safe.cutting_method, settings);
  const cutSpeed = Math.max(1, num3(safe.cut_speed_ipm, 50));
  const cutMultiplier = Math.max(0.01, num3(safe.cut_multiplier, 1));
  const cutMinutes = cutLengthIn / cutSpeed * cutMultiplier;
  const setupMinutesPerPanel = num3(safe.setup_minutes, 0) / panelQty;
  const cutHours = (cutMinutes + setupMinutesPerPanel) / 60;
  const unit_cut_cost = cutHours * (rates.machine_rate + rates.labor_rate);
  let unit_paint_cost = 0;
  if (safe.paint_letters && safe.paint_sides !== "none") {
    const paint = getPaintRates(settings);
    const perSqftCost = paint.supplies_per_sqft + paint.liquid_paint_per_sqft;
    const faceSqft = faceAreaSqin / 144;
    const thickness = num3(safe.material_thickness_inches, 0.5);
    const edgeSqft = cutLengthIn * thickness / 144;
    let paintedSqft = 0;
    if (safe.paint_sides === "front") paintedSqft = faceSqft;
    else if (safe.paint_sides === "front_and_edges") paintedSqft = faceSqft + edgeSqft;
    else if (safe.paint_sides === "all") paintedSqft = faceSqft * 2 + edgeSqft;
    const colorMultiplier = 1 + Math.max(0, num3(safe.num_paint_colors, 1) - 1) * 0.15;
    const paintMaterialsCost = paintedSqft * perSqftCost * colorMultiplier;
    const paintLaborHours = paintedSqft * 3 / 60;
    const paintLaborCost = paintLaborHours * paint.labor_rate * colorMultiplier;
    unit_paint_cost = paintMaterialsCost + paintLaborCost;
  }
  const unit_total_cost = unit_material_cost + unit_cut_cost + unit_paint_cost;
  return {
    ...safe,
    face_area_sqin: faceAreaSqin,
    cut_length_inches: cutLengthIn,
    unit_material_cost,
    unit_cut_cost,
    unit_paint_cost,
    unit_total_cost
  };
};

// frozen:/app/src/components/channelLetterInstall/BackerFabPanel.jsx
import { Fragment as Fragment4, jsx as jsx34, jsxs as jsxs21 } from "react/jsx-runtime";
var fmt9 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
function BackerFabPanel({ purchase, onUpdate }) {
  const [materials, setMaterials] = useState8([]);
  const [settings, setSettings] = useState8({});
  const [fab, setFab] = useState8(() => ({ ...emptyBackerFabConfig(), ...purchase?.backer_fab_config || {} }));
  const [loading, setLoading] = useState8(true);
  const loadSettings = useCallback3(async () => {
    try {
      const list = await loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" });
      const map = {};
      list.forEach((s) => {
        map[s.setting_name] = s.setting_value;
      });
      setSettings(map);
      return map;
    } catch (e) {
      console.error("Failed to load settings:", e);
      return {};
    }
  }, []);
  useEffect5(() => {
    (async () => {
      setLoading(true);
      try {
        const [mats] = await Promise.all([
          loadAllEntityRows({ entity: DimensionalLetterMaterial, query: { is_active: true }, sort: "sort_order", label: "Dimensional Letter materials" }),
          loadSettings()
        ]);
        setMaterials(mats);
        const seed = { ...emptyBackerFabConfig(), ...purchase?.backer_fab_config || {} };
        if (!purchase?.backer_fab_config) {
          if (purchase?.backer_width_inches) seed.width_inches = purchase.backer_width_inches;
          if (purchase?.backer_height_inches) seed.height_inches = purchase.backer_height_inches;
        }
        setFab(seed);
      } catch (e) {
        console.error("Failed to load backer fab inputs:", e);
      }
      setLoading(false);
    })();
  }, [purchase?.id]);
  const update = (patch) => setFab((prev) => ({ ...prev, ...patch }));
  const selectMaterial = (id) => {
    const m = materials.find((x) => x.id === id);
    if (!m) return;
    const matType = m.material_type || "";
    const speedFromSettings = lookupCutSpeed(fab.cutting_method, m.thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(fab.cutting_method, matType, settings);
    setFab((prev) => ({
      ...prev,
      material_id: m.id,
      material_name: m.material_name,
      material_type: matType,
      material_thickness_inches: m.thickness_inches,
      material_cost_per_sqin: materialCostPerSqin(m),
      sheet_yield_factor: m.yield_factor,
      paint_letters: !!m.needs_painting,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings
    }));
  };
  const setCuttingMethod = (method) => {
    const speedFromSettings = lookupCutSpeed(method, fab.material_thickness_inches, settings);
    const multiplierFromSettings = lookupCutMultiplier(method, fab.material_type, settings);
    setFab((prev) => ({
      ...prev,
      cutting_method: method,
      cut_speed_ipm: speedFromSettings ?? prev.cut_speed_ipm,
      cut_multiplier: multiplierFromSettings
    }));
  };
  const computed = useMemo6(() => calcBackerUnitCost(fab, purchase?.qty || 1, settings), [fab, purchase?.qty, settings]);
  const activeRates = useMemo6(() => getActiveRates(fab.cutting_method, settings), [fab.cutting_method, settings]);
  const paintR = useMemo6(() => getPaintRates(settings), [settings]);
  useEffect5(() => {
    if (loading) return;
    const final = calcBackerUnitCost(fab, purchase?.qty || 1, settings);
    onUpdate({
      backer_fab_config: {
        material_id: final.material_id,
        material_name: final.material_name,
        material_type: final.material_type,
        material_thickness_inches: final.material_thickness_inches,
        material_cost_per_sqin: final.material_cost_per_sqin,
        sheet_yield_factor: final.sheet_yield_factor,
        width_inches: final.width_inches,
        height_inches: final.height_inches,
        cut_length_override_inches: final.cut_length_override_inches,
        cutting_method: final.cutting_method,
        cut_speed_ipm: final.cut_speed_ipm,
        setup_minutes: final.setup_minutes,
        cut_multiplier: final.cut_multiplier,
        paint_letters: final.paint_letters,
        paint_sides: final.paint_sides,
        num_paint_colors: final.num_paint_colors,
        paint_colors: final.paint_colors || [],
        paint_mask_sqft: final.paint_mask_sqft || 0,
        approx_coverage_factor: final.approx_coverage_factor || "1/4",
        unit_material_cost: final.unit_material_cost,
        unit_cut_cost: final.unit_cut_cost,
        unit_paint_cost: final.unit_paint_cost,
        unit_total_cost: final.unit_total_cost
      },
      backer_material_id: final.material_id,
      backer_width_inches: final.width_inches,
      backer_height_inches: final.height_inches
    });
  }, [fab, purchase?.qty, settings, loading]);
  const isLaser = fab.cutting_method === "laser";
  const cutSettingsPage = "EstimatorSettings";
  const faceAreaSqft = fab.width_inches * fab.height_inches / 144;
  const paintColors = Array.isArray(fab.paint_colors) ? fab.paint_colors : [];
  const numColors = paintColors.length || fab.num_paint_colors || 1;
  const updateColor = (idx, val) => {
    const list = [...paintColors];
    list[idx] = val;
    update({ paint_colors: list, num_paint_colors: list.length });
  };
  const addColor = () => {
    const list = [...paintColors, ""];
    update({ paint_colors: list, num_paint_colors: list.length });
  };
  const removeColor = (idx) => {
    const list = paintColors.filter((_, i) => i !== idx);
    update({ paint_colors: list, num_paint_colors: Math.max(1, list.length) });
  };
  if (loading) {
    return /* @__PURE__ */ jsx34("div", { className: "bg-white border border-orange-200 rounded-lg p-3 text-center text-sm text-slate-500", children: "Loading\u2026" });
  }
  return /* @__PURE__ */ jsxs21("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs21("div", { className: "flex items-center justify-between flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxs21("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx34(Sparkles, { className: "w-4 h-4 text-orange-600" }),
        /* @__PURE__ */ jsx34("span", { className: "text-sm font-semibold text-orange-900", children: "Backer Panel Fabrication" })
      ] }),
      /* @__PURE__ */ jsxs21(Badge, { variant: "outline", className: "bg-white text-orange-700 border-orange-300", children: [
        fmt9(computed.unit_total_cost),
        " / backer"
      ] })
    ] }),
    /* @__PURE__ */ jsxs21(Section2, { icon: Box, title: "1. Backer Material", color: "bg-blue-50 text-blue-700", children: [
      materials.length === 0 ? /* @__PURE__ */ jsxs21("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2", children: [
        /* @__PURE__ */ jsx34(AlertCircle, { className: "w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" }),
        /* @__PURE__ */ jsxs21("div", { className: "flex-1 text-xs text-amber-800", children: [
          /* @__PURE__ */ jsx34("p", { className: "font-medium mb-1", children: "No sheet materials in your library yet." }),
          /* @__PURE__ */ jsxs21(Link5, { to: createPageUrl("MasterInventory"), className: "inline-flex items-center gap-1 underline", children: [
            /* @__PURE__ */ jsx34(Link, { className: "w-3 h-3" }),
            " Open Inventory \u2192 Dimensional Sheets tab"
          ] })
        ] })
      ] }) : /* @__PURE__ */ jsxs21("div", { children: [
        /* @__PURE__ */ jsx34(Label, { className: "text-xs", children: "Sheet Material" }),
        /* @__PURE__ */ jsxs21(Select, { value: fab.material_id || "", onValueChange: selectMaterial, children: [
          /* @__PURE__ */ jsx34(SelectTrigger, { className: "h-9 mt-1 bg-white", children: /* @__PURE__ */ jsx34(SelectValue, { placeholder: "Select material..." }) }),
          /* @__PURE__ */ jsx34(SelectContent, { children: materials.map((m) => /* @__PURE__ */ jsxs21(SelectItem, { value: m.id, children: [
            m.material_name,
            " \u2014 ",
            m.thickness_inches,
            '"'
          ] }, m.id)) })
        ] }),
        fab.material_id && /* @__PURE__ */ jsxs21("p", { className: "text-[11px] text-slate-500 mt-1", children: [
          "Thickness: ",
          /* @__PURE__ */ jsxs21("strong", { children: [
            fab.material_thickness_inches,
            '"'
          ] }),
          " \xB7 \u2248 ",
          fmt9(fab.material_cost_per_sqin * 144),
          "/sqft after ",
          Math.round(fab.sheet_yield_factor * 100),
          "% yield"
        ] })
      ] }),
      /* @__PURE__ */ jsxs21("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxs21("div", { children: [
          /* @__PURE__ */ jsx34(Label, { className: "text-xs", children: "Width (in)" }),
          /* @__PURE__ */ jsx34(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.5",
              value: fab.width_inches,
              onChange: (e) => update({ width_inches: channelDraftValue(e.target.value) }),
              className: "h-9 mt-1 bg-white tabular-nums"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs21("div", { children: [
          /* @__PURE__ */ jsx34(Label, { className: "text-xs", children: "Height (in)" }),
          /* @__PURE__ */ jsx34(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.5",
              value: fab.height_inches,
              onChange: (e) => update({ height_inches: channelDraftValue(e.target.value) }),
              className: "h-9 mt-1 bg-white tabular-nums"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs21("p", { className: "text-[11px] text-slate-500", children: [
        "Area: ",
        /* @__PURE__ */ jsxs21("strong", { children: [
          faceAreaSqft.toFixed(2),
          " sqft"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs21(Section2, { icon: isLaser ? Zap : Router, title: "2. Cutting", color: isLaser ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700", children: [
      /* @__PURE__ */ jsx34(CuttingMethodSlider, { value: fab.cutting_method, onChange: setCuttingMethod }),
      /* @__PURE__ */ jsxs21("div", { className: "flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-md px-2 py-1.5", children: [
        /* @__PURE__ */ jsxs21("span", { children: [
          "Machine: ",
          /* @__PURE__ */ jsxs21("strong", { children: [
            "$",
            activeRates.machine_rate.toFixed(0),
            "/hr"
          ] }),
          " \xB7 Operator: ",
          /* @__PURE__ */ jsxs21("strong", { children: [
            "$",
            activeRates.labor_rate.toFixed(0),
            "/hr"
          ] }),
          fab.cut_speed_ipm ? /* @__PURE__ */ jsxs21(Fragment4, { children: [
            " \xB7 Speed: ",
            /* @__PURE__ */ jsxs21("strong", { children: [
              Math.round(fab.cut_speed_ipm),
              " in/min"
            ] })
          ] }) : null
        ] }),
        /* @__PURE__ */ jsxs21("span", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxs21(Link5, { to: createPageUrl(cutSettingsPage), className: "underline", children: [
            "Edit ",
            isLaser ? "Laser" : "CNC",
            " settings"
          ] }),
          /* @__PURE__ */ jsxs21("button", { type: "button", onClick: loadSettings, className: "inline-flex items-center gap-1 text-slate-500 hover:text-slate-800", children: [
            /* @__PURE__ */ jsx34(RefreshCw, { className: "w-3 h-3" }),
            " Refresh"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs21(Section2, { icon: Paintbrush, title: "3. Paint (Optional)", color: "bg-purple-50 text-purple-700", children: [
      /* @__PURE__ */ jsxs21("label", { className: "flex items-center gap-2 cursor-pointer text-sm", children: [
        /* @__PURE__ */ jsx34(Checkbox, { checked: !!fab.paint_letters, onCheckedChange: (c) => update({ paint_letters: !!c }) }),
        /* @__PURE__ */ jsx34("span", { className: "font-medium", children: "Paint this backer" })
      ] }),
      fab.paint_letters && /* @__PURE__ */ jsxs21(Fragment4, { children: [
        /* @__PURE__ */ jsxs21("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs21("div", { children: [
            /* @__PURE__ */ jsx34(Label, { className: "text-xs", children: "Paint Sides" }),
            /* @__PURE__ */ jsxs21(Select, { value: fab.paint_sides, onValueChange: (v) => update({ paint_sides: v }), children: [
              /* @__PURE__ */ jsx34(SelectTrigger, { className: "h-9 mt-1 bg-white", children: /* @__PURE__ */ jsx34(SelectValue, {}) }),
              /* @__PURE__ */ jsx34(SelectContent, { children: Object.entries(PAINT_SIDES_LABELS).map(([v, l]) => /* @__PURE__ */ jsx34(SelectItem, { value: v, children: l }, v)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs21("div", { children: [
            /* @__PURE__ */ jsx34(Label, { className: "text-xs", children: "Paint Colors" }),
            /* @__PURE__ */ jsxs21("div", { className: "space-y-1.5 mt-1", children: [
              paintColors.length === 0 ? /* @__PURE__ */ jsx34(
                Input,
                {
                  placeholder: "e.g., PMS 186C, Black, White",
                  onChange: (e) => update({ paint_colors: [e.target.value], num_paint_colors: 1 }),
                  className: "h-9 bg-white"
                }
              ) : paintColors.map((c, i) => /* @__PURE__ */ jsxs21("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx34(Input, { value: c, onChange: (e) => updateColor(i, e.target.value), placeholder: "e.g., PMS 186C", className: "h-9 bg-white" }),
                paintColors.length > 1 && /* @__PURE__ */ jsx34(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 text-red-500 hover:bg-red-50", onClick: () => removeColor(i), children: /* @__PURE__ */ jsx34(Trash2, { className: "w-3.5 h-3.5" }) })
              ] }, i)),
              /* @__PURE__ */ jsx34(Button, { type: "button", variant: "outline", size: "sm", onClick: addColor, className: "h-7 text-xs", children: "+ Add Color" })
            ] })
          ] })
        ] }),
        numColors > 1 && /* @__PURE__ */ jsxs21("div", { className: "bg-white border border-purple-200 rounded-lg p-3", children: [
          /* @__PURE__ */ jsx34("p", { className: "text-xs font-semibold text-purple-900 mb-2", children: "Paint Mask (multi-color)" }),
          /* @__PURE__ */ jsx34(
            PaintCoverageHelper,
            {
              faceAreaSqft,
              bothSides: fab.paint_sides === "all",
              value: fab.paint_mask_sqft,
              factor: fab.approx_coverage_factor || "1/4",
              onChange: (patch) => update(patch)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs21("p", { className: "text-[11px] text-slate-500", children: [
        "Labor: $",
        paintR.labor_rate.toFixed(0),
        "/hr \xB7 Supplies: $",
        paintR.supplies_per_sqft.toFixed(2),
        "/sqft \xB7 Liquid: $",
        paintR.liquid_paint_per_sqft.toFixed(2),
        "/sqft",
        /* @__PURE__ */ jsx34(Link5, { to: createPageUrl("EstimatorSettings"), className: "underline ml-1", children: "Edit Paint settings" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs21("div", { className: "bg-gradient-to-r from-orange-900 to-orange-700 text-white rounded-xl p-3 space-y-1.5", children: [
      /* @__PURE__ */ jsxs21("div", { className: "flex items-center gap-2 mb-1", children: [
        /* @__PURE__ */ jsx34(Calculator, { className: "w-4 h-4" }),
        /* @__PURE__ */ jsx34("span", { className: "font-semibold text-sm", children: "Per-Backer Breakdown" }),
        /* @__PURE__ */ jsxs21(Badge, { className: "ml-auto bg-white/10 text-white border-0", children: [
          "qty: ",
          purchase?.qty || 1
        ] })
      ] }),
      /* @__PURE__ */ jsx34(PreviewRow2, { label: "Material", value: computed.unit_material_cost, subtitle: `${(computed.face_area_sqin || 0).toFixed(0)} sqin` }),
      /* @__PURE__ */ jsx34(PreviewRow2, { label: CUTTING_METHOD_LABELS[fab.cutting_method] || "Cutting", value: computed.unit_cut_cost, subtitle: `${(computed.cut_length_inches || 0).toFixed(0)}" cut` }),
      fab.paint_letters ? /* @__PURE__ */ jsx34(PreviewRow2, { label: "Paint", value: computed.unit_paint_cost, subtitle: PAINT_SIDES_LABELS[fab.paint_sides] }) : /* @__PURE__ */ jsx34(PreviewRow2, { label: "Paint", value: 0, subtitle: "Excluded" }),
      /* @__PURE__ */ jsxs21("div", { className: "border-t border-white/20 pt-2 flex justify-between items-center", children: [
        /* @__PURE__ */ jsxs21("span", { className: "text-sm text-orange-100", children: [
          "Total (",
          purchase?.qty || 1,
          " backers)"
        ] }),
        /* @__PURE__ */ jsx34("span", { className: "text-xl font-bold tabular-nums", children: fmt9(computed.unit_total_cost * (parseFloat(purchase?.qty) || 1)) })
      ] })
    ] })
  ] });
}
var Section2 = ({ icon: Icon, title, color, children }) => /* @__PURE__ */ jsxs21("div", { className: "border border-slate-200 rounded-lg p-3 space-y-3 bg-white", children: [
  /* @__PURE__ */ jsxs21("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsx34("div", { className: `w-7 h-7 rounded-lg ${color} flex items-center justify-center`, children: /* @__PURE__ */ jsx34(Icon, { className: "w-4 h-4" }) }),
    /* @__PURE__ */ jsx34("span", { className: "font-semibold text-slate-800 text-sm", children: title })
  ] }),
  children
] });
var PreviewRow2 = ({ label, value, subtitle }) => /* @__PURE__ */ jsxs21("div", { className: "flex justify-between items-center text-sm", children: [
  /* @__PURE__ */ jsxs21("div", { children: [
    /* @__PURE__ */ jsx34("span", { className: "text-orange-100", children: label }),
    subtitle && /* @__PURE__ */ jsx34("span", { className: "ml-2 text-[10px] text-orange-300/80", children: subtitle })
  ] }),
  /* @__PURE__ */ jsx34("span", { className: "tabular-nums font-medium", children: fmt9(value) })
] });

// frozen:/app/src/components/channelLetterInstall/BackerSection.jsx
import { jsx as jsx35, jsxs as jsxs22 } from "react/jsx-runtime";
var fmt10 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
function BackerSection({ purchase, onUpdate, onDisable }) {
  const [standoffs, setStandoffs] = useState9([]);
  useEffect6(() => {
    (async () => {
      try {
        const inv = await loadAllEntityRows({ entity: ChannelLetterInstallInventory, sort: "sort_order", label: "Backer standoff inventory" });
        const filtered = (inv || []).filter((i) => {
          const list = Array.isArray(i.applies_to_list) ? i.applies_to_list : [];
          return list.includes("backer");
        });
        setStandoffs(filtered);
      } catch (e) {
        console.error("BackerSection load failed", e);
      }
    })();
  }, []);
  const fab = purchase.backer_fab_config;
  const standoffPicked = standoffs.find((s) => s.id === purchase.backer_standoff_inventory_id);
  const standoffUnitCost = standoffPicked ? parseFloat(standoffPicked.cost_per_letter) || parseFloat(standoffPicked.cost_flat) || 0 : 0;
  const standoffTotalCost = standoffUnitCost * (parseFloat(purchase.backer_standoff_qty) || 0);
  return /* @__PURE__ */ jsxs22("div", { className: "border-2 border-orange-200 bg-orange-50/40 rounded-xl p-4 space-y-3", children: [
    /* @__PURE__ */ jsxs22("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs22("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx35(Layers, { className: "w-4 h-4 text-orange-600" }),
        /* @__PURE__ */ jsx35("span", { className: "text-sm font-semibold text-orange-900", children: "Backer Panel Configuration" }),
        /* @__PURE__ */ jsx35(Badge, { className: "bg-orange-200 text-orange-900 border-orange-300 text-[10px]", children: "SWITCHES PRICING SCHEDULE" })
      ] }),
      /* @__PURE__ */ jsxs22(Button, { variant: "ghost", size: "sm", onClick: () => {
        if (confirm("Remove the backer panel and its configuration?")) onDisable();
      }, className: "h-7 text-xs text-orange-700 hover:bg-orange-100", children: [
        /* @__PURE__ */ jsx35(X, { className: "w-3 h-3 mr-1" }),
        " Remove Backer"
      ] })
    ] }),
    /* @__PURE__ */ jsxs22("div", { className: "grid md:grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs22("div", { children: [
        /* @__PURE__ */ jsx35(Label, { className: "text-xs", children: "Standoff Type" }),
        /* @__PURE__ */ jsxs22(
          Select,
          {
            value: purchase.backer_standoff_inventory_id || "",
            onValueChange: (v) => onUpdate({ backer_standoff_inventory_id: v }),
            children: [
              /* @__PURE__ */ jsx35(SelectTrigger, { className: "h-9 mt-1 bg-white", children: /* @__PURE__ */ jsx35(SelectValue, { placeholder: "Pick a standoff..." }) }),
              /* @__PURE__ */ jsxs22(SelectContent, { children: [
                standoffs.length === 0 && /* @__PURE__ */ jsx35(SelectItem, { value: "__none", disabled: true, children: "No backer standoffs in inventory" }),
                standoffs.map((s) => /* @__PURE__ */ jsxs22(SelectItem, { value: s.id, children: [
                  s.item_name,
                  " \u2014 ",
                  fmt10(parseFloat(s.cost_per_letter) || parseFloat(s.cost_flat) || 0),
                  "/ea"
                ] }, s.id))
              ] })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs22("div", { children: [
        /* @__PURE__ */ jsx35(Label, { className: "text-xs", children: "Qty of Standoffs (per letter)" }),
        /* @__PURE__ */ jsx35(
          Input,
          {
            type: "number",
            min: "0",
            step: "1",
            value: purchase.backer_standoff_qty ?? 0,
            onChange: (e) => onUpdate({ backer_standoff_qty: channelDraftValue(e.target.value) }),
            className: "h-9 mt-1 bg-white"
          }
        )
      ] })
    ] }),
    standoffs.length === 0 && /* @__PURE__ */ jsxs22("div", { className: "bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-2", children: [
      /* @__PURE__ */ jsx35(AlertCircle, { className: "w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" }),
      /* @__PURE__ */ jsxs22("p", { className: "text-[11px] text-amber-800", children: [
        "No standoffs yet. Add them in ",
        /* @__PURE__ */ jsx35("strong", { children: "Channel Letter Install Inventory \u2192 Materials \u2192 Backer" }),
        " group."
      ] })
    ] }),
    /* @__PURE__ */ jsx35("div", { className: "border-t border-orange-200 pt-3", children: /* @__PURE__ */ jsx35(BackerFabPanel, { purchase, onUpdate }) }),
    /* @__PURE__ */ jsxs22("div", { className: "bg-white rounded-lg border border-orange-200 p-2.5 grid grid-cols-3 gap-2 text-xs", children: [
      /* @__PURE__ */ jsxs22("div", { children: [
        /* @__PURE__ */ jsx35("div", { className: "text-[10px] uppercase tracking-wider text-slate-500", children: "Backer Fab \xD7 Qty" }),
        /* @__PURE__ */ jsx35("div", { className: "font-semibold tabular-nums text-slate-900", children: fmt10((fab?.unit_total_cost || 0) * (parseFloat(purchase.qty) || 0)) })
      ] }),
      /* @__PURE__ */ jsxs22("div", { children: [
        /* @__PURE__ */ jsxs22("div", { className: "text-[10px] uppercase tracking-wider text-slate-500", children: [
          "Standoffs (",
          purchase.backer_standoff_qty || 0,
          ")"
        ] }),
        /* @__PURE__ */ jsx35("div", { className: "font-semibold tabular-nums text-slate-900", children: fmt10(standoffTotalCost) }),
        /* @__PURE__ */ jsx35("div", { className: "text-[10px] text-slate-400", children: "Per install line" })
      ] }),
      /* @__PURE__ */ jsxs22("div", { children: [
        /* @__PURE__ */ jsx35("div", { className: "text-[10px] uppercase tracking-wider text-slate-500", children: "Pricing Schedule" }),
        /* @__PURE__ */ jsx35(Badge, { className: "bg-orange-100 text-orange-800 border-orange-200 text-[10px]", children: "w/ Backer" })
      ] })
    ] })
  ] });
}

// frozen:/app/src/components/channelLetterInstall/LetterPurchaseRow.jsx
import { Fragment as Fragment5, jsx as jsx36, jsxs as jsxs23 } from "react/jsx-runtime";
var SET_CHILD_TYPES = [
  { value: "channel_flush_mounted", label: "Flush-Mounted" },
  { value: "channel_halo_lit", label: "Halo-Lit" },
  { value: "channel_raceway_mounted", label: "Raceway-Mounted" },
  { value: "capsule_logo_pillbox", label: "Capsule / Logo" },
  { value: "dimensional_letters", label: "Dimensional" }
];
var fmt11 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var SIZE_LABEL = {
  in: "Letter Height (in)",
  ft: "Raceway Length (ft)",
  sqft: "Area (sq ft)"
};
var QTY_LABEL = {
  raceway: "# of Raceways",
  channel_raceway_mounted: "# of Letters",
  channel_flush_mounted: "# of Letters",
  channel_halo_lit: "# of Letters",
  capsule_logo_pillbox: "# of Logos",
  dimensional_letters: "# of Letters"
};
var TYPE_COLOR = {
  raceway: "bg-blue-100 text-blue-800 border-blue-200",
  channel_raceway_mounted: "bg-indigo-100 text-indigo-800 border-indigo-200",
  channel_flush_mounted: "bg-purple-100 text-purple-800 border-purple-200",
  channel_halo_lit: "bg-pink-100 text-pink-800 border-pink-200",
  capsule_logo_pillbox: "bg-amber-100 text-amber-800 border-amber-200",
  dimensional_letters: "bg-emerald-100 text-emerald-800 border-emerald-200"
};
function LetterPurchaseRow({
  purchase,
  settings,
  onUpdate,
  onRemove,
  onDuplicate,
  onAddToSet,
  index,
  fabHighlight = false,
  setRole = "solo",
  // "solo" | "parent" | "child"
  setSize = 1,
  setIndex = 0,
  issues = []
}) {
  const [addToSetOpen, setAddToSetOpen] = React20.useState(false);
  const isFirst = index === 0;
  const tourId = (suffix) => isFirst ? `clp-letter-${suffix}` : void 0;
  const sizeUnit = SIZE_UNITS[purchase.letter_type];
  const autoUnitCost = resolveUnitCost({ ...purchase, unit_cost_override: false }, settings);
  const effectiveUnit = purchase.unit_cost_override ? channelNumber(purchase.unit_cost) ?? 0 : autoUnitCost;
  const isDimensional = purchase.letter_type === "dimensional_letters";
  const isCombinedRaceway = purchase.letter_type === "channel_raceway_mounted";
  const backerEnabled = isDimensional && !!purchase.backer_enabled;
  const update = (patch) => onUpdate({ ...purchase, ...patch });
  const isChild = setRole === "child";
  const isParent = setRole === "parent";
  const fieldIssues = (field) => issuesForField(issues, field, null, index);
  const invalidCls = (field) => fieldIssues(field).length ? "border-red-500" : "";
  const ariaFor = (field) => fieldIssues(field).length ? { "aria-invalid": true, "aria-describedby": `clp-${index}-${field}-issue` } : {};
  const FieldIssue = ({ field }) => {
    const fi = fieldIssues(field);
    if (!fi.length) return null;
    return /* @__PURE__ */ jsx36("p", { id: `clp-${index}-${field}-issue`, className: "text-[10px] text-red-600 mt-0.5", role: "alert", children: fi[0].message });
  };
  const containerClass = isChild ? "bg-white rounded-xl border border-slate-200 border-l-4 border-l-purple-400 shadow-sm p-4 space-y-3 ml-6" : isParent ? "bg-white rounded-xl border-2 border-purple-200 shadow-sm p-4 space-y-3" : "bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3";
  return /* @__PURE__ */ jsxs23("div", { className: containerClass, children: [
    /* @__PURE__ */ jsxs23("div", { id: tourId("type-picker"), className: "flex items-center gap-2 flex-wrap", children: [
      isChild && /* @__PURE__ */ jsx36(CornerDownRight, { className: "w-4 h-4 text-purple-500 flex-shrink-0", title: `Part of set (item ${setIndex + 1})` }),
      /* @__PURE__ */ jsxs23(Badge, { className: `${TYPE_COLOR[purchase.letter_type] || "bg-slate-100"} font-medium`, children: [
        "#",
        index + 1,
        " \xB7 ",
        backerEnabled ? "Dimensional Letters w/ Backer" : LETTER_TYPE_LABELS[purchase.letter_type]
      ] }),
      purchase.__held && /* @__PURE__ */ jsx36(Badge, { variant: "outline", className: "text-[10px] text-amber-700 border-amber-300 bg-amber-50", children: "Saved value \u2014 not repriced" }),
      isParent && /* @__PURE__ */ jsxs23(Badge, { className: "bg-purple-600 text-white text-xs", children: [
        /* @__PURE__ */ jsx36(Layers, { className: "w-3 h-3 mr-1" }),
        " Set of ",
        setSize
      ] }),
      isChild && /* @__PURE__ */ jsx36(Badge, { variant: "outline", className: "text-[10px] text-purple-700 border-purple-300 bg-purple-50", children: "\u21B3 inherits height & wall from parent" }),
      purchase.create_install_item && purchase.letter_type !== "raceway" && /* @__PURE__ */ jsxs23(Badge, { variant: "outline", className: "text-xs bg-emerald-50 text-emerald-700 border-emerald-200", children: [
        /* @__PURE__ */ jsx36(Link2, { className: "w-3 h-3 mr-1" }),
        " Auto-creates install item"
      ] }),
      /* @__PURE__ */ jsxs23("div", { className: "ml-auto flex items-center gap-1", children: [
        /* @__PURE__ */ jsx36("span", { className: "text-lg font-bold tabular-nums text-slate-900 mr-2", children: fmt11(purchase.total_cost) }),
        !isChild && onAddToSet && /* @__PURE__ */ jsxs23("div", { className: "relative", children: [
          /* @__PURE__ */ jsxs23(
            Button,
            {
              variant: "outline",
              size: "sm",
              onClick: () => setAddToSetOpen((o) => !o),
              className: "h-8 px-3 border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:text-purple-800 font-medium",
              title: "Group multiple letter types together as one sign",
              children: [
                /* @__PURE__ */ jsx36(GitBranch, { className: "w-3.5 h-3.5 mr-1.5" }),
                "Add to Set"
              ]
            }
          ),
          addToSetOpen && /* @__PURE__ */ jsxs23("div", { className: "absolute right-0 top-9 z-20 bg-white border border-slate-200 rounded-lg shadow-lg w-56 py-1 text-xs", children: [
            /* @__PURE__ */ jsx36("div", { className: "px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100", children: "Add to set as\u2026" }),
            SET_CHILD_TYPES.map((t) => /* @__PURE__ */ jsxs23(
              "button",
              {
                type: "button",
                onClick: () => {
                  onAddToSet(purchase, t.value);
                  setAddToSetOpen(false);
                },
                className: "w-full text-left px-3 py-1.5 hover:bg-purple-50 text-slate-700",
                children: [
                  "+ ",
                  t.label
                ]
              },
              t.value
            ))
          ] })
        ] }),
        /* @__PURE__ */ jsx36(Button, { variant: "ghost", size: "icon", onClick: onDuplicate, className: "h-8 w-8", title: "Duplicate", children: /* @__PURE__ */ jsx36(Copy, { className: "w-4 h-4 text-slate-500" }) }),
        /* @__PURE__ */ jsx36(Button, { variant: "ghost", size: "icon", onClick: onRemove, className: "h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50", title: "Remove", children: /* @__PURE__ */ jsx36(Trash2, { className: "w-4 h-4" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs23("div", { children: [
      /* @__PURE__ */ jsx36(Label, { className: "text-xs", children: "Description (optional)" }),
      /* @__PURE__ */ jsx36(
        Input,
        {
          value: purchase.description || "",
          onChange: (e) => update({ description: e.target.value }),
          placeholder: "e.g., Main building front sign",
          className: "mt-1 h-9"
        }
      )
    ] }),
    isCombinedRaceway && /* @__PURE__ */ jsxs23("div", { className: "flex items-center gap-2 pt-1", children: [
      /* @__PURE__ */ jsx36("span", { className: "text-[10px] uppercase tracking-wider font-semibold text-indigo-700", children: "Channel Letters" }),
      /* @__PURE__ */ jsx36("div", { className: "flex-1 h-px bg-indigo-100" })
    ] }),
    isDimensional ? /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: [
      /* @__PURE__ */ jsxs23("div", { id: tourId("qty"), children: [
        /* @__PURE__ */ jsx36(Label, { className: "text-xs", children: QTY_LABEL[purchase.letter_type] }),
        /* @__PURE__ */ jsx36(
          Input,
          {
            type: "number",
            min: "0",
            value: purchase.qty,
            onChange: (e) => update({ qty: channelDraftValue(e.target.value) }),
            className: `mt-1 h-9 ${invalidCls("qty")}`,
            ...ariaFor("qty")
          }
        ),
        /* @__PURE__ */ jsx36(FieldIssue, { field: "qty" })
      ] }),
      /* @__PURE__ */ jsxs23("div", { children: [
        /* @__PURE__ */ jsxs23(Label, { className: "text-xs flex items-center justify-between", children: [
          /* @__PURE__ */ jsx36("span", { children: "Per-Letter Cost" }),
          /* @__PURE__ */ jsxs23("label", { className: "flex items-center gap-1 text-[10px] text-slate-500 font-normal cursor-pointer", children: [
            /* @__PURE__ */ jsx36(
              Checkbox,
              {
                checked: !!purchase.unit_cost_override,
                onCheckedChange: (c) => update({
                  unit_cost_override: !!c,
                  unit_cost: !!c ? parseFloat(purchase.fab_config?.unit_total_cost) || 0 : 0
                }),
                className: "h-3 w-3"
              }
            ),
            "Override"
          ] })
        ] }),
        /* @__PURE__ */ jsxs23("div", { className: "relative mt-1", children: [
          /* @__PURE__ */ jsx36("span", { className: "absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm", children: "$" }),
          /* @__PURE__ */ jsx36(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.01",
              disabled: !purchase.unit_cost_override,
              value: purchase.unit_cost_override ? purchase.unit_cost : (parseFloat(purchase.fab_config?.unit_total_cost) || 0).toFixed(2),
              onChange: (e) => update({ unit_cost: channelDraftValue(e.target.value) }),
              className: `h-9 pl-6 ${purchase.unit_cost_override ? "" : "bg-slate-50"} ${invalidCls("unit_cost")}`,
              ...ariaFor("unit_cost")
            }
          )
        ] }),
        /* @__PURE__ */ jsx36(FieldIssue, { field: "unit_cost" })
      ] }),
      /* @__PURE__ */ jsxs23("div", { children: [
        /* @__PURE__ */ jsx36(Label, { className: "text-xs", children: "Line Total" }),
        /* @__PURE__ */ jsx36("div", { className: "mt-1 h-9 flex items-center px-3 bg-emerald-50 rounded-md border border-emerald-200 font-semibold tabular-nums text-emerald-800", children: fmt11(purchase.total_cost) })
      ] })
    ] }) : /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [
      /* @__PURE__ */ jsxs23("div", { id: tourId("qty"), children: [
        /* @__PURE__ */ jsx36(Label, { className: "text-xs", children: QTY_LABEL[purchase.letter_type] }),
        /* @__PURE__ */ jsx36(
          Input,
          {
            type: "number",
            min: "0",
            value: purchase.qty,
            onChange: (e) => update({ qty: channelDraftValue(e.target.value) }),
            className: `mt-1 h-9 ${invalidCls("qty")}`,
            ...ariaFor("qty")
          }
        ),
        /* @__PURE__ */ jsx36(FieldIssue, { field: "qty" })
      ] }),
      /* @__PURE__ */ jsxs23("div", { id: tourId("size"), children: [
        /* @__PURE__ */ jsx36(Label, { className: "text-xs", children: SIZE_LABEL[sizeUnit] }),
        /* @__PURE__ */ jsx36(
          Input,
          {
            type: "number",
            min: "0",
            step: "0.01",
            value: purchase.size_value,
            onChange: (e) => update({ size_value: channelDraftValue(e.target.value) }),
            className: `mt-1 h-9 ${invalidCls("size_value")}`,
            ...ariaFor("size_value")
          }
        ),
        /* @__PURE__ */ jsx36(FieldIssue, { field: "size_value" })
      ] }),
      /* @__PURE__ */ jsxs23("div", { children: [
        /* @__PURE__ */ jsxs23(Label, { className: "text-xs flex items-center justify-between", children: [
          /* @__PURE__ */ jsx36("span", { children: "Unit Cost" }),
          /* @__PURE__ */ jsxs23(
            "label",
            {
              className: `flex items-center gap-1 text-[10px] font-normal ${purchase.letters_total_override ? "text-slate-300 cursor-not-allowed" : "text-slate-500 cursor-pointer"}`,
              title: purchase.letters_total_override ? "Disabled \u2014 Line Total is overridden" : "",
              children: [
                /* @__PURE__ */ jsx36(
                  Checkbox,
                  {
                    checked: !!purchase.unit_cost_override,
                    disabled: !!purchase.letters_total_override,
                    onCheckedChange: (c) => update({ unit_cost_override: !!c, unit_cost: !!c ? effectiveUnit : 0 }),
                    className: "h-3 w-3"
                  }
                ),
                "Override"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs23("div", { className: "relative mt-1", children: [
          /* @__PURE__ */ jsx36("span", { className: "absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm", children: "$" }),
          /* @__PURE__ */ jsx36(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.01",
              disabled: !purchase.unit_cost_override || !!purchase.letters_total_override,
              value: purchase.unit_cost_override ? purchase.unit_cost : (parseFloat(purchase.unit_cost) || autoUnitCost).toFixed(2),
              onChange: (e) => update({ unit_cost: channelDraftValue(e.target.value) }),
              className: `h-9 pl-6 ${invalidCls("unit_cost")}`,
              ...ariaFor("unit_cost")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs23("div", { children: [
        /* @__PURE__ */ jsxs23(Label, { className: "text-xs flex items-center justify-between", children: [
          /* @__PURE__ */ jsx36("span", { children: isCombinedRaceway ? "Letters Total" : "Line Total" }),
          /* @__PURE__ */ jsxs23(
            "label",
            {
              className: `flex items-center gap-1 text-[10px] font-normal ${purchase.unit_cost_override ? "text-slate-300 cursor-not-allowed" : "text-slate-500 cursor-pointer"}`,
              title: purchase.unit_cost_override ? "Disabled \u2014 Unit Cost is overridden" : "",
              children: [
                /* @__PURE__ */ jsx36(
                  Checkbox,
                  {
                    checked: !!purchase.letters_total_override,
                    disabled: !!purchase.unit_cost_override,
                    onCheckedChange: (c) => update({
                      letters_total_override: !!c,
                      letters_total: !!c ? parseFloat(purchase.letters_total) || 0 : 0
                    }),
                    className: "h-3 w-3"
                  }
                ),
                "Override"
              ]
            }
          )
        ] }),
        purchase.letters_total_override ? /* @__PURE__ */ jsxs23("div", { className: "relative mt-1", children: [
          /* @__PURE__ */ jsx36("span", { className: "absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm", children: "$" }),
          /* @__PURE__ */ jsx36(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.01",
              value: purchase.letters_total,
              onChange: (e) => update({ letters_total: channelDraftValue(e.target.value) }),
              className: `h-9 pl-6 ${invalidCls("letters_total")}`,
              ...ariaFor("letters_total")
            }
          )
        ] }) : /* @__PURE__ */ jsx36("div", { className: "mt-1 h-9 flex items-center px-3 bg-slate-50 rounded-md border border-slate-200 font-semibold tabular-nums", children: fmt11(isCombinedRaceway ? purchase.letters_total : purchase.total_cost) })
      ] })
    ] }),
    isCombinedRaceway && /* @__PURE__ */ jsxs23(Fragment5, { children: [
      /* @__PURE__ */ jsxs23("div", { className: "flex items-center gap-2 pt-2", children: [
        /* @__PURE__ */ jsx36("span", { className: "text-[10px] uppercase tracking-wider font-semibold text-blue-700", children: "Raceway and Components" }),
        /* @__PURE__ */ jsx36("div", { className: "flex-1 h-px bg-blue-100" })
      ] }),
      /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxs23("div", { children: [
          /* @__PURE__ */ jsx36(Label, { className: "text-xs", children: "# of Raceways" }),
          /* @__PURE__ */ jsx36(
            Input,
            {
              type: "number",
              min: "0",
              value: purchase.raceway_qty ?? 1,
              onChange: (e) => update({ raceway_qty: channelDraftValue(e.target.value) }),
              className: `mt-1 h-9 ${invalidCls("raceway_qty")}`,
              ...ariaFor("raceway_qty")
            }
          ),
          /* @__PURE__ */ jsx36("p", { className: "text-[10px] text-slate-400 mt-0.5", children: "Tier auto: 1=1st, 2=2nd, 3=3rd, 4+=4th" }),
          /* @__PURE__ */ jsx36(FieldIssue, { field: "raceway_qty" })
        ] }),
        /* @__PURE__ */ jsxs23("div", { children: [
          /* @__PURE__ */ jsx36(Label, { className: "text-xs", children: "Raceway Length (ft)" }),
          /* @__PURE__ */ jsx36(
            Input,
            {
              type: "number",
              min: "0",
              step: "0.01",
              value: purchase.raceway_length_feet ?? 0,
              onChange: (e) => update({ raceway_length_feet: channelDraftValue(e.target.value) }),
              className: `mt-1 h-9 ${invalidCls("raceway_length_feet")}`,
              ...ariaFor("raceway_length_feet")
            }
          ),
          /* @__PURE__ */ jsx36(FieldIssue, { field: "raceway_length_feet" })
        ] }),
        /* @__PURE__ */ jsxs23("div", { children: [
          /* @__PURE__ */ jsxs23(Label, { className: "text-xs flex items-center justify-between", children: [
            /* @__PURE__ */ jsx36("span", { children: "Raceway $/ft" }),
            /* @__PURE__ */ jsxs23(
              "label",
              {
                className: `flex items-center gap-1 text-[10px] font-normal ${purchase.raceway_total_override ? "text-slate-300 cursor-not-allowed" : "text-slate-500 cursor-pointer"}`,
                title: purchase.raceway_total_override ? "Disabled \u2014 Raceway Total is overridden" : "",
                children: [
                  /* @__PURE__ */ jsx36(
                    Checkbox,
                    {
                      checked: !!purchase.raceway_unit_cost_override,
                      disabled: !!purchase.raceway_total_override,
                      onCheckedChange: (c) => update({
                        raceway_unit_cost_override: !!c,
                        raceway_unit_cost: !!c ? parseFloat(purchase.raceway_unit_cost) || 0 : 0
                      }),
                      className: "h-3 w-3"
                    }
                  ),
                  "Override"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs23("div", { className: "relative mt-1", children: [
            /* @__PURE__ */ jsx36("span", { className: "absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm", children: "$" }),
            /* @__PURE__ */ jsx36(
              Input,
              {
                type: "number",
                min: "0",
                step: "0.01",
                disabled: !purchase.raceway_unit_cost_override || !!purchase.raceway_total_override,
                value: purchase.raceway_unit_cost_override ? purchase.raceway_unit_cost : (purchase.raceway_unit_cost || 0).toFixed(2),
                onChange: (e) => update({ raceway_unit_cost: channelDraftValue(e.target.value) }),
                className: `h-9 pl-6 ${purchase.raceway_unit_cost_override ? "" : "bg-slate-50"} ${invalidCls("raceway_unit_cost")}`,
                ...ariaFor("raceway_unit_cost")
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs23("div", { children: [
          /* @__PURE__ */ jsxs23(Label, { className: "text-xs flex items-center justify-between", children: [
            /* @__PURE__ */ jsx36("span", { children: "Raceway Total" }),
            /* @__PURE__ */ jsxs23(
              "label",
              {
                className: `flex items-center gap-1 text-[10px] font-normal ${purchase.raceway_unit_cost_override ? "text-slate-300 cursor-not-allowed" : "text-slate-500 cursor-pointer"}`,
                title: purchase.raceway_unit_cost_override ? "Disabled \u2014 Raceway $/ft is overridden" : "",
                children: [
                  /* @__PURE__ */ jsx36(
                    Checkbox,
                    {
                      checked: !!purchase.raceway_total_override,
                      disabled: !!purchase.raceway_unit_cost_override,
                      onCheckedChange: (c) => update({
                        raceway_total_override: !!c,
                        raceway_total: !!c ? parseFloat(purchase.raceway_total) || 0 : 0
                      }),
                      className: "h-3 w-3"
                    }
                  ),
                  "Override"
                ]
              }
            )
          ] }),
          purchase.raceway_total_override ? /* @__PURE__ */ jsxs23("div", { className: "relative mt-1", children: [
            /* @__PURE__ */ jsx36("span", { className: "absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm", children: "$" }),
            /* @__PURE__ */ jsx36(
              Input,
              {
                type: "number",
                min: "0",
                step: "0.01",
                value: purchase.raceway_total,
                onChange: (e) => update({ raceway_total: channelDraftValue(e.target.value) }),
                className: `h-9 pl-6 ${invalidCls("raceway_total")}`,
                ...ariaFor("raceway_total")
              }
            )
          ] }) : /* @__PURE__ */ jsx36("div", { className: "mt-1 h-9 flex items-center px-3 bg-slate-50 rounded-md border border-slate-200 font-semibold tabular-nums", children: fmt11(purchase.raceway_total) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-end gap-3 pt-2 border-t border-slate-100", children: [
        /* @__PURE__ */ jsxs23("span", { className: "text-xs text-slate-500", children: [
          "Letters ",
          fmt11(purchase.letters_total),
          " + Raceway ",
          fmt11(purchase.raceway_total),
          " ="
        ] }),
        /* @__PURE__ */ jsx36("span", { className: "text-lg font-bold tabular-nums text-slate-900", children: fmt11(purchase.total_cost) })
      ] })
    ] }),
    isDimensional && /* @__PURE__ */ jsxs23("div", { id: tourId("dimensional-fab"), className: "border-t pt-3 space-y-3", children: [
      /* @__PURE__ */ jsx36(
        DimensionalFabPanel,
        {
          purchase,
          onUpdate: (patch) => update(patch)
        }
      ),
      fabHighlight && !purchase.fab_config?.unit_total_cost && /* @__PURE__ */ jsx36("p", { className: "text-xs text-red-600 font-medium text-center", children: "Required \u2014 pick a sheet material above to build the fab cost." }),
      backerEnabled && /* @__PURE__ */ jsx36(
        BackerSection,
        {
          purchase,
          onUpdate: (patch) => update(patch),
          onDisable: () => update({
            backer_enabled: false,
            backer_material_id: null,
            backer_standoff_inventory_id: null,
            backer_standoff_qty: 0,
            backer_fab_config: null,
            backer_width_inches: 0,
            backer_height_inches: 0
          })
        }
      )
    ] }),
    purchase.letter_type !== "raceway" && /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between border-t pt-3 gap-3 flex-wrap", children: [
      /* @__PURE__ */ jsxs23("label", { className: "flex items-center gap-2 cursor-pointer text-sm", children: [
        /* @__PURE__ */ jsx36(
          Checkbox,
          {
            checked: !!purchase.create_install_item,
            onCheckedChange: (c) => update({ create_install_item: !!c })
          }
        ),
        /* @__PURE__ */ jsx36("span", { children: "Auto-create matching item on Installation tab" })
      ] }),
      purchase.create_install_item && !isChild && /* @__PURE__ */ jsxs23("div", { className: "flex items-center gap-2 text-xs", children: [
        /* @__PURE__ */ jsx36(Label, { className: "text-xs", children: "Install Height (ft)" }),
        /* @__PURE__ */ jsx36(
          Input,
          {
            type: "number",
            min: "0",
            step: "0.5",
            value: purchase.install_height_feet,
            onChange: (e) => update({ install_height_feet: channelDraftValue(e.target.value) }),
            className: `h-8 w-20 ${invalidCls("install_height_feet")}`,
            ...ariaFor("install_height_feet")
          }
        )
      ] }),
      isChild && /* @__PURE__ */ jsx36("div", { className: "text-[11px] text-purple-700 italic", children: "Install height inherited from the parent in this set." })
    ] })
  ] });
}

// s:s://@/components/channelLetterInstall/AIScopeWriterModal
var AIScopeWriterModal_default = () => null;

// frozen:/app/src/components/channelLetterInstall/LettersPurchaseTab.jsx
import { jsx as jsx37, jsxs as jsxs24 } from "react/jsx-runtime";
var fmt12 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var QUICK_ADD = [
  { type: "channel_raceway_mounted", label: "+ Raceway Mounted Letters", color: "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200" },
  { type: "channel_flush_mounted", label: "+ Flush Mounted Letters", color: "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200" },
  { type: "channel_halo_lit", label: "+ Halo-Lit Letters", color: "bg-pink-50 hover:bg-pink-100 text-pink-700 border-pink-200" },
  { type: "capsule_logo_pillbox", label: "+ Capsule / Logo", color: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200" },
  { type: "dimensional_letters", label: "+ Dimensional Letters", color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200" }
];
function LettersPurchaseTab({ project, settings, onUpdateProject, incompleteDimensionalIds = [], issues = [] }) {
  const purchases = project.letter_purchases || [];
  const [aiOpen, setAiOpen] = React21.useState(false);
  const [feesOpen, setFeesOpen] = React21.useState(false);
  const incompleteSet = React21.useMemo(() => new Set(incompleteDimensionalIds || []), [incompleteDimensionalIds]);
  const addPurchase = (type) => {
    const p = emptyLetterPurchase(type);
    onUpdateProject({ letter_purchases: [...purchases, p] });
  };
  const hasDimensional = purchases.some((p) => p.letter_type === "dimensional_letters");
  const onlyDimensional = purchases.length > 0 && purchases.every((p) => p.letter_type === "dimensional_letters");
  const addBackerToFirstDimensional = () => {
    const idx = purchases.findIndex((p) => p.letter_type === "dimensional_letters" && !p.backer_enabled);
    if (idx === -1) return;
    const arr = [...purchases];
    arr[idx] = { ...arr[idx], backer_enabled: true };
    onUpdateProject({ letter_purchases: arr });
  };
  const allDimensionalHaveBacker = hasDimensional && purchases.filter((p) => p.letter_type === "dimensional_letters").every((p) => p.backer_enabled);
  const applyAIPurchases = (aiPurchases, mode = "append") => {
    const newOnes = aiPurchases.map((ai) => {
      const base = emptyLetterPurchase(ai.letter_type || "channel_flush_mounted");
      return {
        ...base,
        description: ai.description || base.description,
        qty: parseFloat(ai.qty) || 0,
        size_value: parseFloat(ai.size_value) || 0,
        install_height_feet: parseFloat(ai.install_height_feet) || base.install_height_feet || 12,
        wall_material: ai.wall_material || base.wall_material || "eifs"
      };
    });
    onUpdateProject({
      letter_purchases: mode === "replace" ? newOnes : [...purchases, ...newOnes]
    });
  };
  const updatePurchase = (idx, next) => {
    const arr = [...purchases];
    arr[idx] = next;
    onUpdateProject({ letter_purchases: arr });
  };
  const removePurchase = (idx) => {
    if (!confirm("Remove this letter row?")) return;
    const arr = [...purchases];
    arr.splice(idx, 1);
    onUpdateProject({ letter_purchases: arr });
  };
  const duplicatePurchase = (idx) => {
    const arr = [...purchases];
    const copy = JSON.parse(JSON.stringify(arr[idx]));
    copy.id = `lp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    copy.set_id = void 0;
    copy.set_parent_id = void 0;
    arr.splice(idx + 1, 0, copy);
    onUpdateProject({ letter_purchases: arr });
  };
  const addToSet = (parent, childType) => {
    const arr = [...purchases];
    const parentIdx = arr.findIndex((p) => p.id === parent.id);
    if (parentIdx === -1) return;
    const sid = parent.set_id || newSetId();
    if (!parent.set_id) {
      arr[parentIdx] = { ...arr[parentIdx], set_id: sid };
    }
    const child = emptyLetterPurchase(childType);
    child.set_id = sid;
    child.set_parent_id = parent.id;
    child.install_height_feet = parent.install_height_feet;
    child.wall_material = parent.wall_material || "eifs";
    let insertAt = parentIdx + 1;
    while (insertAt < arr.length && arr[insertAt].set_parent_id === parent.id) insertAt++;
    arr.splice(insertAt, 0, child);
    onUpdateProject({ letter_purchases: arr });
  };
  const updatePurchaseWithSetSync = (idx, next) => {
    const arr = [...purchases];
    const prev = arr[idx];
    arr[idx] = next;
    const heightChanged = (prev.install_height_feet || 0) !== (next.install_height_feet || 0);
    const wallChanged = (prev.wall_material || "") !== (next.wall_material || "");
    if (next.set_id && !next.set_parent_id && (heightChanged || wallChanged)) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].set_parent_id === next.id) {
          arr[i] = {
            ...arr[i],
            install_height_feet: next.install_height_feet,
            wall_material: next.wall_material || "eifs"
          };
        }
      }
    }
    onUpdateProject({ letter_purchases: arr });
  };
  const removePurchaseWithSetCleanup = (idx) => {
    const target = purchases[idx];
    if (!target) return;
    const ids = /* @__PURE__ */ new Set([target.id]);
    purchases.forEach((p) => {
      if (p.set_parent_id === target.id) ids.add(p.id);
    });
    if (!confirm(ids.size > 1 ? `Remove this row and its ${ids.size - 1} linked set item${ids.size - 1 === 1 ? "" : "s"}?` : "Remove this letter row?")) return;
    onUpdateProject({ letter_purchases: purchases.filter((p) => !ids.has(p.id)) });
  };
  const purchasesTotal = purchases.reduce((s, p) => {
    if (s === null || p.__held) return null;
    const v = channelNumber(p.total_cost);
    return v === null ? null : s + v;
  }, 0);
  const dimensionalBreakdown = React21.useMemo(() => {
    const acc = { material: 0, cnc: 0, laser: 0, paint: 0, backer: 0 };
    let hasAny = false;
    for (const p of purchases) {
      if (p.letter_type !== "dimensional_letters") continue;
      const fc = p.fab_config;
      if (!fc) continue;
      const qty = parseFloat(p.qty) || 0;
      if (qty <= 0) continue;
      hasAny = true;
      acc.material += (parseFloat(fc.unit_material_cost) || 0) * qty;
      const cutCostTotal = (parseFloat(fc.unit_cut_cost) || 0) * qty;
      if (fc.cutting_method === "laser") acc.laser += cutCostTotal;
      else acc.cnc += cutCostTotal;
      acc.paint += (parseFloat(fc.unit_paint_cost) || 0) * qty;
      if (p.backer_enabled && p.backer_fab_config?.unit_total_cost) {
        acc.backer += (parseFloat(p.backer_fab_config.unit_total_cost) || 0) * qty;
      }
    }
    return { ...acc, hasAny };
  }, [purchases]);
  return /* @__PURE__ */ jsxs24("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx37(Card, { className: "bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200", children: /* @__PURE__ */ jsxs24(CardContent, { className: "p-4 space-y-3", children: [
      /* @__PURE__ */ jsxs24("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsx37("div", { className: "w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx37(Type, { className: "w-5 h-5 text-white" }) }),
        /* @__PURE__ */ jsxs24("div", { className: "flex-1", children: [
          /* @__PURE__ */ jsx37("h3", { className: "font-semibold text-slate-900", children: "Letters & Logos \u2014 Fabricate or Purchase" }),
          /* @__PURE__ */ jsx37("p", { className: "text-xs text-slate-600", children: "Build up the cost of the signage itself \u2014 letters, logos, and dimensional pieces you either fabricate in-house or purchase from a vendor (separate from installation labor). Each line auto-creates a matching item on the Installation tab." })
        ] }),
        /* @__PURE__ */ jsxs24("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxs24(
            Button,
            {
              onClick: () => setAiOpen(true),
              size: "sm",
              className: "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-sm",
              children: [
                /* @__PURE__ */ jsx37(Sparkles, { className: "w-3.5 h-3.5 mr-1.5" }),
                " AI Scope Writer"
              ]
            }
          ),
          /* @__PURE__ */ jsx37(Link6, { to: createPageUrl("EstimatorSettings"), children: /* @__PURE__ */ jsxs24(Button, { variant: "outline", size: "sm", className: "bg-white", children: [
            /* @__PURE__ */ jsx37(Settings2, { className: "w-3.5 h-3.5 mr-1.5" }),
            " Letter Pricing"
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs24("div", { id: "clp-add-letter-row", className: "flex flex-wrap gap-2 pt-1", children: [
        QUICK_ADD.map((qa) => /* @__PURE__ */ jsx37(
          "button",
          {
            type: "button",
            onClick: () => addPurchase(qa.type),
            className: `px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${qa.color}`,
            children: qa.label
          },
          qa.type
        )),
        hasDimensional && /* @__PURE__ */ jsx37(
          "button",
          {
            type: "button",
            onClick: addBackerToFirstDimensional,
            disabled: allDimensionalHaveBacker,
            title: allDimensionalHaveBacker ? "All Dimensional Letter rows already have a backer" : "Add a backer panel to the first Dimensional Letter row",
            className: `px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${allDimensionalHaveBacker ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"}`,
            children: "+ Backer Panel"
          }
        )
      ] })
    ] }) }),
    purchases.length === 0 ? /* @__PURE__ */ jsx37(Card, { className: "border-2 border-dashed border-slate-300 bg-white/50", children: /* @__PURE__ */ jsxs24(CardContent, { className: "p-10 text-center text-slate-500", children: [
      /* @__PURE__ */ jsxs24("div", { className: "flex items-end justify-center gap-2 mb-3 h-12 text-purple-500", children: [
        /* @__PURE__ */ jsx37(ArrowUp, { className: "w-6 h-6 animate-bounce", style: { animationDelay: "0ms" } }),
        /* @__PURE__ */ jsx37(ArrowUp, { className: "w-7 h-7 animate-bounce", style: { animationDelay: "120ms" } }),
        /* @__PURE__ */ jsx37(ArrowUp, { className: "w-8 h-8 animate-bounce", style: { animationDelay: "240ms" } }),
        /* @__PURE__ */ jsx37(ArrowUp, { className: "w-7 h-7 animate-bounce", style: { animationDelay: "120ms" } }),
        /* @__PURE__ */ jsx37(ArrowUp, { className: "w-6 h-6 animate-bounce", style: { animationDelay: "0ms" } })
      ] }),
      /* @__PURE__ */ jsx37("p", { className: "mb-1 font-semibold text-slate-700", children: "Add Product" }),
      /* @__PURE__ */ jsx37("p", { className: "text-xs", children: "Use the quick-add buttons above to choose a letter type." })
    ] }) }) : /* @__PURE__ */ jsx37("div", { className: "space-y-2", children: groupPurchasesBySet(purchases).map((group, gi) => {
      if (group.kind === "solo") {
        const p = group.purchase;
        const idx = purchases.findIndex((x) => x.id === p.id);
        return /* @__PURE__ */ jsx37("div", { id: idx === 0 ? "clp-letter-purchase-row" : void 0, children: /* @__PURE__ */ jsx37(
          LetterPurchaseRow,
          {
            index: idx,
            purchase: p,
            settings,
            onUpdate: (next) => updatePurchaseWithSetSync(idx, next),
            onRemove: () => removePurchaseWithSetCleanup(idx),
            onDuplicate: () => duplicatePurchase(idx),
            onAddToSet: addToSet,
            fabHighlight: incompleteSet.has(p.id),
            issues
          }
        ) }, p.id || gi);
      }
      const { parent, children } = group;
      const parentIdx = purchases.findIndex((x) => x.id === parent.id);
      const setSize = 1 + children.length;
      const setMembers = [parent, ...children];
      const setTotal = setMembers.some((m) => m.__held) ? null : setMembers.reduce((s, m) => s + (channelNumber(m.total_cost) ?? 0), 0);
      return /* @__PURE__ */ jsxs24("div", { className: "space-y-2 bg-purple-50/40 rounded-2xl p-2 border border-purple-100", children: [
        /* @__PURE__ */ jsx37(
          LetterPurchaseRow,
          {
            index: parentIdx,
            purchase: parent,
            settings,
            onUpdate: (next) => updatePurchaseWithSetSync(parentIdx, next),
            onRemove: () => removePurchaseWithSetCleanup(parentIdx),
            onDuplicate: () => duplicatePurchase(parentIdx),
            onAddToSet: addToSet,
            fabHighlight: incompleteSet.has(parent.id),
            setRole: "parent",
            setSize,
            issues
          }
        ),
        children.map((c, ci) => {
          const cidx = purchases.findIndex((x) => x.id === c.id);
          return /* @__PURE__ */ jsx37(
            LetterPurchaseRow,
            {
              index: cidx,
              purchase: c,
              settings,
              onUpdate: (next) => updatePurchase(cidx, next),
              onRemove: () => removePurchase(cidx),
              onDuplicate: () => duplicatePurchase(cidx),
              fabHighlight: incompleteSet.has(c.id),
              setRole: "child",
              setSize,
              setIndex: ci + 1,
              issues
            },
            c.id
          );
        }),
        /* @__PURE__ */ jsxs24("div", { className: "flex items-center justify-end gap-3 pr-2 pt-1", children: [
          /* @__PURE__ */ jsxs24("span", { className: "text-[11px] text-purple-700 flex items-center gap-1", children: [
            /* @__PURE__ */ jsx37(Layers, { className: "w-3 h-3" }),
            " Set total (",
            setSize,
            " items)"
          ] }),
          /* @__PURE__ */ jsx37("span", { className: "text-base font-bold tabular-nums text-purple-900", children: fmt12(setTotal) })
        ] })
      ] }, parent.id || gi);
    }) }),
    /* @__PURE__ */ jsxs24(Card, { id: "clp-letter-fees", className: "bg-white border-0 shadow-sm overflow-hidden", children: [
      /* @__PURE__ */ jsxs24(
        "button",
        {
          type: "button",
          onClick: () => setFeesOpen((o) => !o),
          className: "w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors",
          children: [
            /* @__PURE__ */ jsxs24("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx37(Settings2, { className: "w-4 h-4 text-slate-500" }),
              /* @__PURE__ */ jsx37("span", { className: "text-base font-semibold text-slate-900", children: "Advanced Settings \u2014 Project Fees" })
            ] }),
            /* @__PURE__ */ jsx37(ChevronDown, { className: `w-4 h-4 text-slate-500 transition-transform ${feesOpen ? "rotate-180" : ""}` })
          ]
        }
      ),
      feesOpen && /* @__PURE__ */ jsxs24(CardContent, { className: "border-t border-slate-100 pt-4", children: [
        /* @__PURE__ */ jsxs24("div", { className: "mb-4 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg", children: [
          /* @__PURE__ */ jsx37(Info, { className: "w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" }),
          /* @__PURE__ */ jsxs24("p", { className: "text-xs text-blue-900", children: [
            "These fees are prefilled based on the defaults configured by your admin in the",
            " ",
            /* @__PURE__ */ jsx37(Link6, { to: createPageUrl("EstimatorSettings"), className: "font-semibold underline", children: "Settings page" }),
            ". Override them here for this estimate only."
          ] })
        ] }),
        onlyDimensional && /* @__PURE__ */ jsxs24("div", { className: "mb-3 flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg", children: [
          /* @__PURE__ */ jsx37(Info, { className: "w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" }),
          /* @__PURE__ */ jsx37("p", { className: "text-xs text-emerald-900", children: "Delivery / Shipping doesn't apply to dimensional lettering (fabricated in-house), so it's hidden for this estimate." })
        ] }),
        /* @__PURE__ */ jsxs24("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: [
          !onlyDimensional && /* @__PURE__ */ jsx37(
            FeeInput,
            {
              icon: Truck,
              label: "Delivery / Shipping",
              field: "letters_delivery_fee",
              issues,
              value: project.letters_delivery_fee,
              onChange: (v) => onUpdateProject({ letters_delivery_fee: v })
            }
          ),
          /* @__PURE__ */ jsx37(
            FeeInput,
            {
              icon: Receipt,
              label: "Other",
              field: "letters_other_fee",
              issues,
              value: project.letters_other_fee,
              onChange: (v) => onUpdateProject({ letters_other_fee: v })
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx37(Card, { className: "bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0", children: /* @__PURE__ */ jsxs24(CardContent, { className: "p-4 space-y-2", children: [
      project.__held && /* @__PURE__ */ jsx37("p", { className: "text-[11px] text-amber-300", children: "Saved amounts (not current pricing) \u2014 fix the flagged values to reprice." }),
      dimensionalBreakdown.hasAny && /* @__PURE__ */ jsxs24("div", { className: "bg-white/5 rounded-lg p-3 mb-1 space-y-1 border border-white/10", children: [
        /* @__PURE__ */ jsx37("p", { className: "text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1", children: "Dimensional Letter Breakdown" }),
        dimensionalBreakdown.material > 0 && /* @__PURE__ */ jsx37(BreakdownRow, { label: "Material (sheet)", value: dimensionalBreakdown.material }),
        dimensionalBreakdown.cnc > 0 && /* @__PURE__ */ jsx37(BreakdownRow, { label: "CNC Routing", value: dimensionalBreakdown.cnc }),
        dimensionalBreakdown.laser > 0 && /* @__PURE__ */ jsx37(BreakdownRow, { label: "Laser Cutting", value: dimensionalBreakdown.laser }),
        dimensionalBreakdown.paint > 0 && /* @__PURE__ */ jsx37(BreakdownRow, { label: "Paint", value: dimensionalBreakdown.paint }),
        dimensionalBreakdown.backer > 0 && /* @__PURE__ */ jsx37(BreakdownRow, { label: "Backer Panel", value: dimensionalBreakdown.backer })
      ] }),
      /* @__PURE__ */ jsxs24("div", { className: "flex justify-between text-sm", children: [
        /* @__PURE__ */ jsx37("span", { className: "text-slate-300", children: "Letters Subtotal" }),
        /* @__PURE__ */ jsx37("span", { className: "tabular-nums font-medium", children: fmt12(purchasesTotal) })
      ] }),
      !onlyDimensional && (parseFloat(project.letters_delivery_fee) || 0) > 0 && /* @__PURE__ */ jsx37(RollupRow, { label: "Delivery / Shipping", value: project.letters_delivery_fee }),
      (parseFloat(project.letters_other_fee) || 0) > 0 && /* @__PURE__ */ jsx37(RollupRow, { label: "Other", value: project.letters_other_fee }),
      /* @__PURE__ */ jsxs24("div", { className: "border-t border-white/20 pt-2 flex justify-between", children: [
        /* @__PURE__ */ jsx37("span", { className: "text-slate-300 text-sm", children: "Subtotal w/ Fees" }),
        /* @__PURE__ */ jsx37("span", { className: "tabular-nums font-medium", children: fmt12(project.letters_subtotal) })
      ] }),
      (parseFloat(project.letters_markup_percent) || 0) > 0 && /* @__PURE__ */ jsxs24("div", { className: "flex justify-between text-xs text-slate-400", children: [
        /* @__PURE__ */ jsxs24("span", { children: [
          "Markup (",
          parseFloat(project.letters_markup_percent).toFixed(1),
          "%)"
        ] }),
        /* @__PURE__ */ jsx37("span", { className: "tabular-nums", children: fmt12(Number.isFinite(project.total_letters_cost) && Number.isFinite(project.letters_subtotal) ? project.total_letters_cost - project.letters_subtotal : null) })
      ] }),
      /* @__PURE__ */ jsxs24("div", { className: "border-t-2 border-white/30 pt-2 flex justify-between items-center", children: [
        /* @__PURE__ */ jsx37("span", { className: "text-lg font-bold", children: "Total Letters Cost" }),
        /* @__PURE__ */ jsx37("span", { className: "text-2xl font-bold tabular-nums", children: fmt12(project.total_letters_cost) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs24("div", { className: "text-[11px] text-slate-500 flex items-start gap-1.5 px-1", children: [
      /* @__PURE__ */ jsx37(Info, { className: "w-3.5 h-3.5 flex-shrink-0 mt-0.5" }),
      /* @__PURE__ */ jsx37("span", { children: 'Letter pricing pulls from your Channel Letter Settings page. Click "Letter Pricing" above to adjust. The total above is added to the project Grand Total on the Summary tab.' })
    ] }),
    /* @__PURE__ */ jsx37(AIScopeWriterModal_default, { open: aiOpen, onClose: () => setAiOpen(false), onApply: applyAIPurchases })
  ] });
}
var FeeInput = ({ icon: Icon, label, value, onChange, field, issues = [] }) => {
  const fi = issuesForField(issues, field);
  const invalid = fi.length > 0;
  const id = `clp-fee-${field}`;
  return /* @__PURE__ */ jsxs24("div", { children: [
    /* @__PURE__ */ jsxs24(Label, { className: "text-xs flex items-center gap-1", htmlFor: id, children: [
      /* @__PURE__ */ jsx37(Icon, { className: "w-3 h-3 text-slate-500" }),
      label
    ] }),
    /* @__PURE__ */ jsxs24("div", { className: "relative mt-1", children: [
      /* @__PURE__ */ jsx37("span", { className: "absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm", children: "$" }),
      /* @__PURE__ */ jsx37(
        Input,
        {
          id,
          type: "number",
          min: "0",
          step: "0.01",
          value: value ?? "",
          onChange: (e) => onChange(channelDraftValue(e.target.value)),
          className: `h-9 pl-6 ${invalid ? "border-red-500" : ""}`,
          "aria-invalid": invalid || void 0,
          "aria-describedby": invalid ? `${id}-issue` : void 0
        }
      )
    ] }),
    invalid && /* @__PURE__ */ jsx37("p", { id: `${id}-issue`, className: "text-[10px] text-red-600 mt-0.5", role: "alert", children: fi[0].message })
  ] });
};
var RollupRow = ({ label, value }) => /* @__PURE__ */ jsxs24("div", { className: "flex justify-between text-xs text-slate-400", children: [
  /* @__PURE__ */ jsx37("span", { children: label }),
  /* @__PURE__ */ jsx37("span", { className: "tabular-nums", children: fmt12(value) })
] });
var BreakdownRow = ({ label, value }) => /* @__PURE__ */ jsxs24("div", { className: "flex justify-between text-xs", children: [
  /* @__PURE__ */ jsx37("span", { className: "text-slate-300", children: label }),
  /* @__PURE__ */ jsx37("span", { className: "tabular-nums text-slate-100 font-medium", children: fmt12(value) })
] });

// s:s://@/components/channelLetterInstall/TravelCostCard
import { jsx as jsx38 } from "react/jsx-runtime";
var TravelCostCard_default = () => /* @__PURE__ */ jsx38("div", { "data-stub": "TravelCostCard" });

// frozen:/app/src/components/channelLetterInstall/SummaryDetailsCard.jsx
import React22 from "react";
import { Fragment as Fragment6, jsx as jsx39, jsxs as jsxs25 } from "react/jsx-runtime";
var fmt13 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var num4 = (v) => parseFloat(v) || 0;
var hrs = (v) => Number.isFinite(v) ? v.toFixed(2) : "\u2014";
var Section3 = ({ icon: Icon, title, subtitle, color = "purple", children }) => /* @__PURE__ */ jsxs25(Card, { className: "bg-white border-0 shadow-sm", children: [
  /* @__PURE__ */ jsxs25(CardHeader, { className: "pb-2 border-b border-slate-100", children: [
    /* @__PURE__ */ jsxs25(CardTitle, { className: `text-base flex items-center gap-2 text-slate-900`, children: [
      Icon && /* @__PURE__ */ jsx39(Icon, { className: `w-4 h-4 text-${color}-600` }),
      title
    ] }),
    subtitle && /* @__PURE__ */ jsx39("p", { className: "text-xs text-slate-500 mt-0.5", children: subtitle })
  ] }),
  /* @__PURE__ */ jsx39(CardContent, { className: "p-0", children })
] });
var Th = ({ children, align = "left" }) => /* @__PURE__ */ jsx39("th", { className: `px-3 py-1.5 text-${align} font-medium text-slate-600 text-xs`, children });
var Td = ({ children, align = "left", className = "" }) => /* @__PURE__ */ jsx39("td", { className: `px-3 py-1.5 text-${align} ${className}`, children });
function SummaryDetailsCard({ project }) {
  const items = project.items || [];
  const purchases = project.letter_purchases || [];
  const equipment = project.selected_equipment || [];
  const personnel = project.personnel || [];
  const lettersSubtotal = Number.isFinite(project.letters_subtotal) ? project.letters_subtotal : null;
  const fees = [
    { label: "Delivery Fee", v: num4(project.letters_delivery_fee) },
    { label: "Design Fee", v: num4(project.letters_design_fee) },
    { label: "Install Supplies Fee", v: num4(project.letters_install_supplies_fee) },
    { label: "Permitting Fee", v: num4(project.letters_permitting_fee) },
    { label: "Other Fee", v: num4(project.letters_other_fee) }
  ].filter((f) => f.v > 0);
  const lettersMarkupPct = num4(project.letters_markup_percent);
  return /* @__PURE__ */ jsxs25("div", { className: "space-y-3", children: [
    project.__held && /* @__PURE__ */ jsx39("div", { className: "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900", children: "Saved amounts (not current pricing) \u2014 fix the flagged values to reprice." }),
    items.length > 0 && /* @__PURE__ */ jsx39(Section3, { icon: ListChecks, title: "Installation Line Items", subtitle: `${items.length} item${items.length === 1 ? "" : "s"}`, children: /* @__PURE__ */ jsxs25("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx39("thead", { className: "bg-slate-50", children: /* @__PURE__ */ jsxs25("tr", { children: [
        /* @__PURE__ */ jsx39(Th, { children: "#" }),
        /* @__PURE__ */ jsx39(Th, { children: "Description" }),
        /* @__PURE__ */ jsx39(Th, { children: "Type" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Qty" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Size" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Height" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Hours" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Labor" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Materials" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Total" })
      ] }) }),
      /* @__PURE__ */ jsx39("tbody", { children: items.map((it, i) => /* @__PURE__ */ jsxs25("tr", { className: "border-t border-slate-100", children: [
        /* @__PURE__ */ jsx39(Td, { className: "text-slate-500", children: i + 1 }),
        /* @__PURE__ */ jsx39(Td, { className: "font-medium", children: it.description || `Item ${i + 1}` }),
        /* @__PURE__ */ jsx39(Td, { className: "text-xs text-slate-600 capitalize", children: (it.installation_type || "").replace(/_/g, " ") }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: num4(it.qty_letters) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "text-xs text-slate-600 capitalize", children: (it.letter_size || "").replace(/_/g, " ") }),
        /* @__PURE__ */ jsxs25(Td, { align: "right", className: "tabular-nums", children: [
          num4(it.installation_height_feet),
          "ft"
        ] }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: hrs(it.labor_hours) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: fmt13(it.labor_cost) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: fmt13(it.materials_cost) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums font-semibold", children: fmt13(it.item_total_cost) })
      ] }, i)) }),
      /* @__PURE__ */ jsx39("tfoot", { className: "bg-slate-50 border-t-2 border-slate-200 text-sm", children: /* @__PURE__ */ jsxs25("tr", { children: [
        /* @__PURE__ */ jsx39("td", { colSpan: "6", className: "px-3 py-2 text-right font-medium", children: "Installation Subtotals" }),
        /* @__PURE__ */ jsx39("td", { className: "px-3 py-2 text-right tabular-nums font-medium", children: hrs(project.labor_hours) }),
        /* @__PURE__ */ jsx39("td", { className: "px-3 py-2 text-right tabular-nums font-medium", children: fmt13(project.labor_cost) }),
        /* @__PURE__ */ jsx39("td", { className: "px-3 py-2 text-right tabular-nums font-medium", children: fmt13(project.total_materials_cost) }),
        /* @__PURE__ */ jsx39("td", { className: "px-3 py-2 text-right tabular-nums font-bold", children: fmt13(Number.isFinite(project.labor_cost) && Number.isFinite(project.total_materials_cost) ? project.labor_cost + project.total_materials_cost : null) })
      ] }) })
    ] }) }),
    purchases.length > 0 && /* @__PURE__ */ jsx39(Section3, { icon: Type, title: "Letter Purchases", subtitle: `${purchases.length} line${purchases.length === 1 ? "" : "s"}`, color: "pink", children: /* @__PURE__ */ jsxs25("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx39("thead", { className: "bg-slate-50", children: /* @__PURE__ */ jsxs25("tr", { children: [
        /* @__PURE__ */ jsx39(Th, { children: "#" }),
        /* @__PURE__ */ jsx39(Th, { children: "Letter Type" }),
        /* @__PURE__ */ jsx39(Th, { children: "Description" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Qty" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Size" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Unit $" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Total" })
      ] }) }),
      /* @__PURE__ */ jsx39("tbody", { children: purchases.map((p, i) => /* @__PURE__ */ jsxs25("tr", { className: "border-t border-slate-100", children: [
        /* @__PURE__ */ jsx39(Td, { className: "text-slate-500", children: i + 1 }),
        /* @__PURE__ */ jsx39(Td, { className: "text-xs capitalize", children: (p.letter_type || "").replace(/_/g, " ") }),
        /* @__PURE__ */ jsx39(Td, { className: "text-xs text-slate-600", children: p.description || "\u2014" }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: num4(p.qty) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: num4(p.size_value).toFixed(2) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: fmt13(p.unit_cost) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums font-semibold", children: fmt13(p.total_cost) })
      ] }, p.id || i)) }),
      /* @__PURE__ */ jsxs25("tfoot", { className: "bg-slate-50 border-t border-slate-200 text-xs", children: [
        fees.length > 0 && fees.map((f, i) => /* @__PURE__ */ jsxs25("tr", { children: [
          /* @__PURE__ */ jsx39("td", { colSpan: "6", className: "px-3 py-1 text-right text-slate-600", children: f.label }),
          /* @__PURE__ */ jsx39("td", { className: "px-3 py-1 text-right tabular-nums", children: fmt13(f.v) })
        ] }, i)),
        lettersMarkupPct > 0 && /* @__PURE__ */ jsxs25("tr", { children: [
          /* @__PURE__ */ jsxs25("td", { colSpan: "6", className: "px-3 py-1 text-right text-slate-600", children: [
            "Letters Markup (",
            lettersMarkupPct,
            "%)"
          ] }),
          /* @__PURE__ */ jsx39("td", { className: "px-3 py-1 text-right tabular-nums", children: fmt13(Number.isFinite(project.total_letters_cost) && lettersSubtotal !== null ? project.total_letters_cost - lettersSubtotal - fees.reduce((s, f) => s + f.v, 0) : null) })
        ] }),
        /* @__PURE__ */ jsxs25("tr", { className: "border-t-2 border-slate-200 text-sm", children: [
          /* @__PURE__ */ jsx39("td", { colSpan: "6", className: "px-3 py-2 text-right font-bold", children: "Total Letters Cost" }),
          /* @__PURE__ */ jsx39("td", { className: "px-3 py-2 text-right tabular-nums font-bold", children: fmt13(project.total_letters_cost) })
        ] })
      ] })
    ] }) }),
    equipment.length > 0 && /* @__PURE__ */ jsx39(Section3, { icon: HardHat, title: "Equipment", subtitle: `${equipment.length} piece${equipment.length === 1 ? "" : "s"}`, color: "amber", children: /* @__PURE__ */ jsxs25("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx39("thead", { className: "bg-slate-50", children: /* @__PURE__ */ jsxs25("tr", { children: [
        /* @__PURE__ */ jsx39(Th, { children: "Equipment" }),
        /* @__PURE__ */ jsx39(Th, { children: "Type" }),
        /* @__PURE__ */ jsx39(Th, { children: "Pricing" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Duration" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Unit $" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Delivery" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Idle" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Total" })
      ] }) }),
      /* @__PURE__ */ jsx39("tbody", { children: equipment.map((e, i) => /* @__PURE__ */ jsxs25("tr", { className: "border-t border-slate-100", children: [
        /* @__PURE__ */ jsx39(Td, { className: "font-medium", children: e.equipment_name }),
        /* @__PURE__ */ jsx39(Td, { className: "text-xs capitalize", children: (e.equipment_type || "").replace(/_/g, " ") }),
        /* @__PURE__ */ jsx39(Td, { className: "text-xs capitalize", children: (e.pricing_mode || "").replace(/_/g, " ") }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: num4(e.duration) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: fmt13(e.unit_cost) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums text-xs text-slate-500", children: e.include_delivery ? fmt13(e.delivery_pickup_cost) : "\u2014" }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums text-xs", children: num4(e.idle_cost) > 0 ? /* @__PURE__ */ jsxs25("span", { className: "inline-flex items-center gap-0.5", children: [
          /* @__PURE__ */ jsx39(Clock, { className: "w-3 h-3 text-amber-600" }),
          fmt13(e.idle_cost)
        ] }) : "\u2014" }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums font-semibold", children: fmt13(e.total_cost) })
      ] }, i)) }),
      /* @__PURE__ */ jsx39("tfoot", { className: "bg-slate-50 border-t-2 border-slate-200", children: /* @__PURE__ */ jsxs25("tr", { children: [
        /* @__PURE__ */ jsx39("td", { colSpan: "7", className: "px-3 py-2 text-right font-semibold", children: "Total Equipment Cost" }),
        /* @__PURE__ */ jsx39("td", { className: "px-3 py-2 text-right tabular-nums font-bold", children: fmt13(project.total_equipment_cost) })
      ] }) })
    ] }) }),
    personnel.length > 0 && /* @__PURE__ */ jsx39(Section3, { icon: Users, title: "Personnel", subtitle: `${personnel.length} crew member${personnel.length === 1 ? "" : "s"}`, color: "sky", children: /* @__PURE__ */ jsxs25("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx39("thead", { className: "bg-slate-50", children: /* @__PURE__ */ jsxs25("tr", { children: [
        /* @__PURE__ */ jsx39(Th, { children: "Name" }),
        /* @__PURE__ */ jsx39(Th, { children: "Role" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Hours" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Rate" }),
        /* @__PURE__ */ jsx39(Th, { align: "right", children: "Total" })
      ] }) }),
      /* @__PURE__ */ jsx39("tbody", { children: personnel.map((p, i) => /* @__PURE__ */ jsxs25("tr", { className: "border-t border-slate-100", children: [
        /* @__PURE__ */ jsx39(Td, { className: "font-medium", children: p.name || /* @__PURE__ */ jsx39("span", { className: "text-slate-400 italic", children: "Unnamed" }) }),
        /* @__PURE__ */ jsx39(Td, { children: /* @__PURE__ */ jsx39(Badge, { variant: "outline", className: "text-xs", children: p.role || "Installer" }) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: hrs(p.hours) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums", children: fmt13(p.hourly_rate) }),
        /* @__PURE__ */ jsx39(Td, { align: "right", className: "tabular-nums font-semibold", children: fmt13(p.total_cost) })
      ] }, i)) }),
      /* @__PURE__ */ jsx39("tfoot", { className: "bg-slate-50 border-t-2 border-slate-200", children: /* @__PURE__ */ jsxs25("tr", { children: [
        /* @__PURE__ */ jsx39("td", { colSpan: "4", className: "px-3 py-2 text-right font-semibold", children: "Total Personnel Cost" }),
        /* @__PURE__ */ jsx39("td", { className: "px-3 py-2 text-right tabular-nums font-bold", children: fmt13(project.total_personnel_cost) })
      ] }) })
    ] }) }),
    (num4(project.total_travel_cost) > 0 || project.total_travel_cost === null) && /* @__PURE__ */ jsx39(Section3, { icon: MapPin, title: "Travel & Fuel", subtitle: "Round-trip from shop to job site", color: "orange", children: /* @__PURE__ */ jsxs25("div", { className: "p-4 text-sm grid grid-cols-2 sm:grid-cols-4 gap-3", children: [
      /* @__PURE__ */ jsxs25("div", { children: [
        /* @__PURE__ */ jsx39("div", { className: "text-xs text-slate-500", children: "Round-Trip Miles" }),
        /* @__PURE__ */ jsxs25("div", { className: "font-semibold tabular-nums", children: [
          num4(project.travel_miles_round_trip).toFixed(1),
          " mi"
        ] })
      ] }),
      /* @__PURE__ */ jsxs25("div", { children: [
        /* @__PURE__ */ jsx39("div", { className: "text-xs text-slate-500", children: "Vehicles Counted" }),
        /* @__PURE__ */ jsx39("div", { className: "font-semibold tabular-nums", children: equipment.filter((e) => ["truck", "van", "flatbed", "car", "boom_truck"].includes(e.equipment_type)).length })
      ] }),
      /* @__PURE__ */ jsxs25("div", { children: [
        /* @__PURE__ */ jsx39("div", { className: "text-xs text-slate-500", children: "Crew Size" }),
        /* @__PURE__ */ jsx39("div", { className: "font-semibold tabular-nums", children: personnel.length || 1 })
      ] }),
      /* @__PURE__ */ jsxs25("div", { className: "text-right", children: [
        /* @__PURE__ */ jsx39("div", { className: "text-xs text-slate-500", children: "Total Travel Cost" }),
        /* @__PURE__ */ jsx39("div", { className: "text-lg font-bold tabular-nums text-orange-700", children: fmt13(project.total_travel_cost) })
      ] })
    ] }) }),
    num4(project.total_supplies_cost) > 0 && /* @__PURE__ */ jsx39(Section3, { icon: Package, title: "Supplies", color: "emerald", children: /* @__PURE__ */ jsxs25("div", { className: "p-4 text-sm flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs25("div", { className: "text-xs text-slate-500", children: [
        num4(project.supplies_percent_of_materials || 10).toFixed(0),
        "% of materials",
        num4(project.extra_supplies_cost) > 0 && /* @__PURE__ */ jsxs25(Fragment6, { children: [
          " + ",
          fmt13(project.extra_supplies_cost),
          " extra"
        ] })
      ] }),
      /* @__PURE__ */ jsx39("div", { className: "font-semibold tabular-nums", children: fmt13(project.total_supplies_cost) })
    ] }) }),
    /* @__PURE__ */ jsx39(Section3, { icon: Calculator, title: "Grand Total", color: "purple", children: /* @__PURE__ */ jsxs25("div", { className: "p-4 text-sm space-y-1", children: [
      project.labor_priced_via_personnel ? /* @__PURE__ */ jsxs25("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsxs25("span", { className: "text-slate-600", children: [
          "Installation Labor",
          " ",
          /* @__PURE__ */ jsx39("span", { className: "text-xs text-slate-400", children: "(priced via Personnel crew \u2014 not double-counted)" })
        ] }),
        /* @__PURE__ */ jsx39("span", { className: "tabular-nums text-slate-400 line-through", children: fmt13(project.labor_cost) })
      ] }) : /* @__PURE__ */ jsx39(Row2, { label: "Installation Labor", value: project.labor_cost }),
      /* @__PURE__ */ jsx39(Row2, { label: "Installation Materials", value: project.total_materials_cost }),
      /* @__PURE__ */ jsx39(Row2, { label: "Supplies", value: project.total_supplies_cost, hideIfZero: true }),
      /* @__PURE__ */ jsx39(Row2, { label: "Equipment", value: project.total_equipment_cost, hideIfZero: true }),
      /* @__PURE__ */ jsx39(Row2, { label: "Personnel", value: project.total_personnel_cost, hideIfZero: true }),
      /* @__PURE__ */ jsx39(Row2, { label: "Travel & Fuel", value: project.total_travel_cost, hideIfZero: true }),
      /* @__PURE__ */ jsx39(Row2, { label: "Letter Purchases", value: project.total_letters_cost, hideIfZero: true }),
      /* @__PURE__ */ jsxs25("div", { className: "flex justify-between pt-2 border-t border-slate-200 text-base", children: [
        /* @__PURE__ */ jsx39("span", { className: "font-semibold text-slate-900", children: "Subtotal (Before Markup)" }),
        /* @__PURE__ */ jsx39("span", { className: "font-bold tabular-nums", children: fmt13(project.subtotal) })
      ] }),
      num4(project.markup_amount) > 0 && /* @__PURE__ */ jsx39(Row2, { label: `Project Markup (${num4(project.markup_percent).toFixed(0)}%)`, value: project.markup_amount }),
      /* @__PURE__ */ jsxs25("div", { className: "flex justify-between pt-2 border-t-2 border-slate-300 text-lg", children: [
        /* @__PURE__ */ jsx39("span", { className: "font-bold text-slate-900", children: "Total Cost" }),
        /* @__PURE__ */ jsx39("span", { className: "font-bold tabular-nums text-purple-700", children: fmt13(project.total_cost) })
      ] }),
      /* @__PURE__ */ jsxs25("p", { className: "text-[11px] text-slate-400 pt-1", children: [
        "See ",
        /* @__PURE__ */ jsx39("span", { className: "font-semibold", children: "Customer Pricing" }),
        " tab for tier-based sell prices."
      ] })
    ] }) })
  ] });
}
var Row2 = ({ label, value, hideIfZero }) => {
  const v = value === null || value === void 0 ? null : num4(value);
  if (hideIfZero && v === 0) return null;
  return /* @__PURE__ */ jsxs25("div", { className: "flex justify-between", children: [
    /* @__PURE__ */ jsx39("span", { className: "text-slate-600", children: label }),
    /* @__PURE__ */ jsx39("span", { className: "tabular-nums", children: fmt13(v) })
  ] });
};

// frozen:/app/src/components/channelLetterInstall/TabBadgeTrigger.jsx
import React23 from "react";
import { jsx as jsx40, jsxs as jsxs26 } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsxs26(
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
        /* @__PURE__ */ jsx40(Icon, { className: "w-3.5 h-3.5" }),
        /* @__PURE__ */ jsx40("span", { className: "text-xs font-medium", children: label }),
        count != null && /* @__PURE__ */ jsx40("span", { className: "text-[10px] bg-slate-200 text-slate-700 data-[state=active]:bg-white/20 data-[state=active]:text-white rounded-full px-1.5 py-0 leading-tight", children: count }),
        hasAmount && /* @__PURE__ */ jsx40("span", { className: "text-[10px] tabular-nums font-semibold opacity-80 leading-tight", children: compact(amount) }),
        warn && /* @__PURE__ */ jsx40("span", { className: "w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse", title: "Action required" })
      ]
    }
  );
}

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx41 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx41("div", { "data-stub": "CustomerPricingTab" });

// frozen:/app/src/components/markup/projectCategorizer.jsx
var num5 = (v) => Number(v) || 0;
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
function _impl_categorizeChannelLetterProject(p) {
  if (!p) return [];
  const lines = [];
  (p.letter_purchases || []).forEach((lp) => {
    const isDimensional = lp.letter_type === "dimensional_letters";
    const total = num5(lp.total_cost);
    if (total <= 0) return;
    if (isDimensional && lp.fab_config) {
      const matCost2 = num5(lp.fab_config.material_cost) + num5(lp.fab_config.paint_material_cost);
      const laborCost = num5(lp.fab_config.cnc_labor_cost) + num5(lp.fab_config.paint_labor_cost);
      if (matCost2 > 0) {
        lines.push({ module: "channel_letter", label: `Dimensional Letter Material \u2014 ${lp.description || ""}`, cost: matCost2, category_key: "substrates" });
      }
      if (laborCost > 0) {
        lines.push({ module: "channel_letter", label: `Dimensional Letter Fab Labor \u2014 ${lp.description || ""}`, cost: laborCost, category_key: "inhouse_labor" });
      }
      const remainder = total - matCost2 - laborCost;
      if (remainder > 0.01) {
        lines.push({ module: "channel_letter", label: `Dimensional Letter (other) \u2014 ${lp.description || ""}`, cost: remainder, category_key: "substrates" });
      }
    } else if (isDimensional) {
      lines.push({ module: "channel_letter", label: `Dimensional Letters \u2014 ${lp.description || ""}`, cost: total, category_key: "substrates" });
    } else {
      lines.push({ module: "channel_letter", label: `Letter Purchase \u2014 ${lp.description || lp.letter_type}`, cost: total, category_key: "outsourced_fab" });
    }
  });
  const onlyDimensional = (p.letter_purchases || []).length > 0 && (p.letter_purchases || []).every((lp) => lp.letter_type === "dimensional_letters");
  const letterFees = (onlyDimensional ? 0 : num5(p.letters_delivery_fee)) + num5(p.letters_design_fee) + num5(p.letters_install_supplies_fee) + num5(p.letters_permitting_fee) + num5(p.letters_other_fee);
  if (letterFees > 0) {
    lines.push({ module: "channel_letter", label: "Letter Fees (delivery/design/permit/etc.)", cost: letterFees, category_key: "outsourced_fab" });
  }
  const baseLabor = p.labor_cost_in_subtotal !== void 0 ? num5(p.labor_cost_in_subtotal) : num5(p.labor_cost);
  const installLabor = baseLabor + num5(p.total_personnel_cost);
  if (installLabor > 0) {
    lines.push({ module: "channel_letter", label: "Installation Labor", cost: installLabor, category_key: "inhouse_labor" });
  }
  const matCost = num5(p.total_materials_cost) + num5(p.total_supplies_cost);
  if (matCost > 0) {
    lines.push({ module: "channel_letter", label: "Install Materials & Supplies", cost: matCost, category_key: "outsourced_fab" });
  }
  const eqCost = num5(p.total_equipment_cost);
  if (eqCost > 0) {
    lines.push({ module: "channel_letter", label: "Equipment Rental", cost: eqCost, category_key: "outsourced_services" });
  }
  const travelCost = num5(p.total_travel_cost);
  if (travelCost > 0) {
    lines.push({ module: "channel_letter", label: "Travel & Fuel", cost: travelCost, category_key: "outsourced_services" });
  }
  return lines;
}
var categorizeChannelLetterProject = (p) => _catMemo(p, _impl_categorizeChannelLetterProject);

// s:s://@/components/markup/savedCustomerPricing
async function calculateSavedCustomerPricing(a) {
  globalThis.__spies.push(["pricing", a]);
  return null;
}

// s:s://@/components/channelLetterInstall/PhotoEstimateModal
var PhotoEstimateModal_default = () => null;

// s:s://@/components/channelLetterInstall/AIInstallScopeModal
var AIInstallScopeModal_default = () => null;

// frozen:/app/src/components/channelLetterInstall/ConfirmModal.jsx
import React24 from "react";
import { jsx as jsx42, jsxs as jsxs27 } from "react/jsx-runtime";
function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = "OK",
  cancelLabel,
  tone = "warning",
  onConfirm
}) {
  const toneStyles = {
    warning: { iconBg: "bg-amber-100", iconColor: "text-amber-600", btn: "bg-amber-600 hover:bg-amber-700" },
    danger: { iconBg: "bg-red-100", iconColor: "text-red-600", btn: "bg-red-600 hover:bg-red-700" },
    info: { iconBg: "bg-blue-100", iconColor: "text-blue-600", btn: "bg-blue-600 hover:bg-blue-700" }
  }[tone] || {};
  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose?.();
  };
  return /* @__PURE__ */ jsx42(Dialog, { open, onOpenChange: (v) => {
    if (!v) onClose?.();
  }, children: /* @__PURE__ */ jsxs27(DialogContent, { className: "sm:max-w-md rounded-2xl", children: [
    /* @__PURE__ */ jsx42(DialogHeader, { children: /* @__PURE__ */ jsxs27("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx42("div", { className: `w-10 h-10 rounded-full ${toneStyles.iconBg} flex items-center justify-center flex-shrink-0`, children: /* @__PURE__ */ jsx42(AlertTriangle, { className: `w-5 h-5 ${toneStyles.iconColor}` }) }),
      /* @__PURE__ */ jsxs27("div", { className: "flex-1 pt-1", children: [
        /* @__PURE__ */ jsx42(DialogTitle, { className: "text-base font-semibold text-slate-900 text-left", children: title }),
        description && /* @__PURE__ */ jsx42(DialogDescription, { className: "text-sm text-slate-600 text-left mt-1.5 leading-relaxed", children: description })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs27(DialogFooter, { className: "gap-2 sm:gap-2 pt-2", children: [
      cancelLabel && /* @__PURE__ */ jsx42(Button, { variant: "outline", onClick: onClose, className: "rounded-xl", children: cancelLabel }),
      /* @__PURE__ */ jsx42(Button, { onClick: handleConfirm, className: `text-white rounded-xl ${toneStyles.btn}`, children: confirmLabel })
    ] })
  ] }) });
}

// s:s://@/components/channelLetterInstall/AddressAutocomplete
import { jsx as jsx43 } from "react/jsx-runtime";
var AddressAutocomplete_default = (p) => /* @__PURE__ */ jsx43("input", { value: p.value || "", onChange: (e) => p.onChange?.(e.target.value), placeholder: p.placeholder });

// frozen:/app/src/components/channelLetterInstall/installExport.jsx
var fmt14 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var fixed = (v, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : "\u2014";
var buildSummaryText = (project) => {
  const lines = [];
  lines.push(`CHANNEL LETTER INSTALLATION ESTIMATE`);
  lines.push(`================================`);
  lines.push(`Project: ${project.project_name || "-"}`);
  lines.push(`Client:  ${project.client_name || "-"}`);
  lines.push(`Est #:   ${project.estimate_number || "-"}`);
  if (project.hyperlink) lines.push(`Link:    ${project.hyperlink}`);
  lines.push("");
  lines.push(`LINE ITEMS`);
  lines.push(`----------`);
  (project.items || []).forEach((it, i) => {
    const label = it.description || TYPE_LABELS[it.installation_type] || "Item";
    lines.push(`${i + 1}. ${label} \u2014 ${TYPE_LABELS[it.installation_type] || it.installation_type}`);
    if (it.installation_type === "raceway") {
      lines.push(`   Raceway: ${it.raceway_length_feet} ft \xB7 ${it.qty_letters} letters`);
    } else {
      lines.push(`   ${it.qty_letters} letters \xB7 ${SIZE_LABELS[it.letter_size] || it.letter_size}`);
    }
    lines.push(`   Height: ${it.installation_height_feet} ft`);
    const conds = [];
    if (it.thick_hollow_walls) conds.push("Thick/Hollow Walls");
    if (it.parapet) conds.push("Parapet");
    if (it.poor_electrical_access) conds.push("Poor Electrical");
    if (conds.length) lines.push(`   Conditions: ${conds.join(", ")}`);
    lines.push(`   Labor: ${fixed(it.labor_hours)} hrs (${fmt14(it.labor_cost)})${it.__held ? " \u2014 saved values (not repriced)" : ""}`);
    lines.push(`   Materials: ${fmt14(it.materials_cost)}`);
    lines.push(`   Item Total: ${fmt14(it.item_total_cost)}`);
    lines.push("");
  });
  lines.push(`TOTALS${project.__held ? " (saved amounts \u2014 not current pricing)" : ""}`);
  lines.push(`------`);
  lines.push(`Labor:        ${fmt14(project.labor_cost)} (${fixed(project.labor_hours)} hrs)`);
  lines.push(`Materials:    ${fmt14(project.total_materials_cost)}`);
  lines.push(`Supplies:     ${fmt14(project.total_supplies_cost)}`);
  lines.push(`Subtotal:     ${fmt14(project.subtotal)}`);
  if ((project.markup_percent || 0) > 0) {
    lines.push(`Markup (${project.markup_percent}%): ${fmt14(project.markup_amount)}`);
  }
  lines.push(`TOTAL:        ${fmt14(project.total_cost)}`);
  if (project.notes) {
    lines.push("");
    lines.push(`Notes: ${project.notes}`);
  }
  return lines.join("\n");
};
var downloadCSV = (project) => {
  const rows = [["#", "Description", "Type", "Qty Letters", "Size", "Raceway Ft", "Height Ft", "Labor Hrs", "Labor $", "Materials $", "Item Total $"]];
  (project.items || []).forEach((it, i) => {
    rows.push([
      i + 1,
      it.description || "",
      TYPE_LABELS[it.installation_type] || it.installation_type,
      it.qty_letters || 0,
      SIZE_LABELS[it.letter_size] || it.letter_size || "",
      it.raceway_length_feet || 0,
      it.installation_height_feet || 0,
      fixed(it.labor_hours),
      fixed(it.labor_cost),
      fixed(it.materials_cost),
      fixed(it.item_total_cost)
    ]);
  });
  rows.push([]);
  rows.push(["", "", "", "", "", "", "", "Labor Total", fixed(project.labor_cost), "Materials", fixed(project.total_materials_cost)]);
  rows.push(["", "", "", "", "", "", "", "Supplies", fixed(project.total_supplies_cost), "Subtotal", fixed(project.subtotal)]);
  if ((project.markup_percent || 0) > 0) {
    rows.push(["", "", "", "", "", "", "", `Markup ${project.markup_percent}%`, fixed(project.markup_amount), "", ""]);
  }
  rows.push(["", "", "", "", "", "", "", "TOTAL", fixed(project.total_cost), "", ""]);
  const csv = rows.map((r) => r.map((cell) => {
    const s = String(cell ?? "");
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(project.project_name || "estimate").replace(/[^a-z0-9]/gi, "_")}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// s:s://@/components/customerSummary/upsertCustomerSummary
var upsertCustomerSummaryForEstimate = async (a) => {
  globalThis.__spies.push(["custSummary", a]);
  return { ok: true };
};

// s:s://@/components/estimator/builder/builderService
var recordBuilderSave = async (a) => {
  globalThis.__spies.push(["recordBuilderSave", a]);
  return { ok: true };
};

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
import { jsx as jsx44 } from "react/jsx-runtime";
var ModuleActionBar_default = (p) => /* @__PURE__ */ jsx44("span", { children: /* @__PURE__ */ jsx44("button", { type: "button", "data-stub": "copy", onClick: p.onSaveAsCopy, children: "copy" }) });

// s:s://@/components/estimator/moduleShared/ModuleTemplateDialog
var ModuleTemplateDialog_default = () => null;

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var saveModuleProjectCopy = async (a) => {
  globalThis.__spies.push(["saveCopy", a]);
  return { id: "copy-1" };
};

// frozen:/app/src/pages/ChannelLetterEstimator.jsx
import { Fragment as Fragment7, jsx as jsx45, jsxs as jsxs28 } from "react/jsx-runtime";
var fmt15 = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "\u2014";
var blankProject = () => ({
  project_name: "",
  client_name: "",
  estimate_number: "",
  hyperlink: "",
  site_address: "",
  project_scope: "full",
  install_environment: "exterior",
  items: [],
  letter_purchases: [],
  letters_delivery_fee: 0,
  letters_design_fee: 0,
  letters_install_supplies_fee: 0,
  letters_permitting_fee: 0,
  letters_other_fee: 0,
  letters_markup_percent: 0,
  selected_equipment: [],
  personnel: [],
  base_supplies_cost: 0,
  extra_supplies_cost: 0,
  markup_percent: 0,
  travel_miles_round_trip: 0,
  total_travel_cost: 0,
  notes: ""
});
function ChannelLetterEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const navigate = useNavigate();
  const { sessionToken } = useAuth();
  const [searchParams] = useSearchParams();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [isEditing, setIsEditing] = useState10(false);
  const { setIsDirty } = useUnsavedChanges();
  const [project, setProject] = useState10(blankProject());
  const [settings, setSettings] = useState10({});
  const [inventory, setInventory] = useState10([]);
  const [equipmentInventory, setEquipmentInventory] = useState10([]);
  const [dimensionalMaterials, setDimensionalMaterials] = useState10(null);
  const [isLoading, setIsLoading] = useState10(true);
  const [loadError, setLoadError] = useState10("");
  const [isSaving, setIsSaving] = useState10(false);
  const [hasLoaded, setHasLoaded] = useState10(false);
  const [activeTab, setActiveTab] = useState10("project");
  const [photoModalOpen, setPhotoModalOpen] = useState10(false);
  const [aiInstallOpen, setAiInstallOpen] = useState10(false);
  const [confirmModal, setConfirmModal] = useState10(null);
  const [helpTrigger, setHelpTrigger] = useState10(false);
  const persistedProjectIdRef = React25.useRef(editId || "");
  const createAttemptRef = React25.useRef({ signature: "", key: "" });
  const copyAttemptRef = React25.useRef({ signature: "", key: "" });
  const [templateMode, setTemplateMode] = useState10(null);
  useEffect7(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
    copyAttemptRef.current = { signature: "", key: "" };
  }, [editId]);
  useEffect7(() => {
    if (!isLoading && !loadError) setHasLoaded(true);
  }, [isLoading, loadError]);
  useEffect7(() => {
    if (hasLoaded) setIsDirty(true);
  }, [project, hasLoaded, setIsDirty]);
  const loadEverything = useCallback4(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [settingsList, inv, equipInv, dimMats] = await Promise.all([
        loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" }),
        loadAllEntityRows({ entity: ChannelLetterInstallInventory, sort: "sort_order", label: "Channel Letter installation inventory" }),
        loadAllEntityRows({ entity: ChannelLetterInstallEquipment, sort: "sort_order", label: "Channel Letter equipment" }),
        // Dimensional materials are catalog for the availability model — load
        // the full table (incl. inactive) so stale/deleted selections can be
        // flagged. Failure degrades to null = skip staleness checks, same
        // pattern as vinyl's optional catalog lanes.
        loadAllEntityRows({ entity: DimensionalLetterMaterial, label: "Dimensional Letter materials" }).catch(() => null)
      ]);
      const settingsObj = {};
      settingsList.forEach((s) => {
        settingsObj[s.setting_name] = s.setting_value;
      });
      setSettings(settingsObj);
      setInventory(inv);
      setEquipmentInventory(equipInv);
      setDimensionalMaterials(dimMats);
      if (editId) {
        const existing = await ChannelLetterInstallation.get(editId);
        if (existing) {
          if ((!existing.items || existing.items.length === 0) && existing.installation_type) {
            existing.items = [{
              description: "",
              installation_type: existing.installation_type,
              qty_letters: existing.qty_letters || 0,
              letter_size: existing.letter_size || "medium",
              letter_height_inches: existing.letter_height_inches || 24,
              installation_height_feet: existing.installation_height_feet || 12,
              raceway_length_feet: existing.raceway_length_feet || 0,
              thick_hollow_walls: !!existing.thick_hollow_walls,
              parapet: !!existing.parapet,
              poor_electrical_access: !!existing.poor_electrical_access,
              materials: []
            }];
          }
          setProject({ ...blankProject(), ...existing, items: existing.items || [] });
          setIsEditing(true);
        } else {
          navigate(createPageUrl("Estimator"));
        }
      } else {
        setProject((prev) => ({
          ...prev,
          base_supplies_cost: parseFloat(settingsObj.install_base_supplies) || 0,
          // Pre-fill project-level fees from settings defaults
          letters_delivery_fee: parseFloat(settingsObj.letters_default_delivery_fee) || 0,
          letters_other_fee: parseFloat(settingsObj.letters_default_other_fee) || 0,
          items: []
        }));
      }
    } catch (e) {
      console.error("Load error:", e);
      setLoadError(e?.message || "Channel / Dimensional Letter Builder prerequisites could not be verified.");
    }
    setIsLoading(false);
  }, [editId, navigate]);
  useEffect7(() => {
    loadEverything();
  }, [loadEverything]);
  const pricing = useMemo7(
    () => calcChannelProject({
      project,
      settings,
      inventory,
      equipmentInventory,
      dimensionalMaterials,
      savedProject: project
    }),
    [project, settings, inventory, equipmentInventory, dimensionalMaterials]
  );
  const recalculated = pricing.recalculated;
  const pricingIssues = pricing.issues;
  const pricingBlocked = pricingIssues.length > 0;
  const pricingCatalogBlocked = pricingIssues.some((i) => i.kind === "channel_catalog");
  const lettersIssues = pricingIssues.some((i) => i.hold === "letters" || i.hold === "purchase");
  const installIssues = pricingIssues.some((i) => i.hold === "install");
  const crewIssues = pricingIssues.some((i) => ["equipment", "personnel", "travel"].includes(i.hold));
  const incompleteDimensionalIds = useMemo7(
    () => (recalculated.letter_purchases || []).filter((p) => p.letter_type === "dimensional_letters" && !p.fab_config?.unit_total_cost).map((p) => p.id),
    [recalculated.letter_purchases]
  );
  const hasIncompleteDimensional = incompleteDimensionalIds.length > 0;
  const handleTabChange = (next) => {
    if (activeTab === "letters" && next !== "letters" && hasIncompleteDimensional) {
      setConfirmModal({
        title: "Finish building your dimensional letters first",
        description: "Each Dimensional Letters row needs a completed 'Build Fab Cost from CNC + Paint' before you can move on. Click the highlighted row(s) on the Letters tab to configure them.",
        confirmLabel: "Got it",
        tone: "warning"
      });
      return;
    }
    setActiveTab(next);
  };
  const scope = project.project_scope || "full";
  const showLettersTab = scope !== "install_only";
  const showInstallTab = scope !== "letters_only";
  const showCrewTab = scope !== "letters_only";
  useEffect7(() => {
    if (activeTab === "letters" && !showLettersTab) setActiveTab("project");
    if ((activeTab === "items" || activeTab === "crew") && scope === "letters_only") setActiveTab("project");
  }, [scope]);
  const aggregatedMaterials = useMemo7(() => {
    const map = /* @__PURE__ */ new Map();
    (recalculated.items || []).forEach((it) => {
      (it.materials || []).forEach((m) => {
        const key = m.inventory_item_id || `manual:${m.item_name}`;
        const mTotal = Number.isFinite(m.total_cost) ? m.total_cost : null;
        const existing = map.get(key);
        if (existing) {
          existing.quantity += parseFloat(m.quantity) || 0;
          existing.total_cost = existing.total_cost === null || mTotal === null ? null : existing.total_cost + mTotal;
        } else {
          map.set(key, {
            item_name: m.item_name,
            quantity: parseFloat(m.quantity) || 0,
            unit_cost: parseFloat(m.unit_cost) || 0,
            total_cost: mTotal
          });
        }
      });
    });
    return Array.from(map.values());
  }, [recalculated]);
  const updateProject = (patch) => {
    setProject((prev) => {
      const next = { ...prev, ...patch };
      if ("letter_purchases" in patch) {
        next.items = syncInstallItemsFromPurchases(next.items, next.letter_purchases, emptyLineItem, inventory);
      }
      return next;
    });
  };
  const updateItem = (idx, updated) => {
    const next = [...project.items];
    next[idx] = updated;
    setProject((prev) => ({ ...prev, items: next }));
  };
  const addItem = () => {
    const newItem = emptyLineItem();
    newItem.materials = defaultMaterialsForItem(newItem, inventory);
    setProject((prev) => ({ ...prev, items: [...prev.items, newItem] }));
    setActiveTab("items");
  };
  const removeItem = (idx) => {
    if (!confirm("Remove this line item and all its materials?")) return;
    const next = [...project.items];
    next.splice(idx, 1);
    setProject((prev) => ({ ...prev, items: next }));
  };
  const duplicateItem = (idx) => {
    const copy = JSON.parse(JSON.stringify(project.items[idx]));
    const next = [...project.items];
    next.splice(idx + 1, 0, copy);
    setProject((prev) => ({ ...prev, items: next }));
  };
  const reorderItems = (from, to) => {
    const next = [...project.items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setProject((prev) => ({ ...prev, items: next }));
  };
  const hasSiteAddress = !!(project.site_address && project.site_address.trim());
  const hasEquipment = (project.selected_equipment || []).length > 0;
  const travelAutoKey = hasSiteAddress && hasEquipment && scope !== "letters_only" ? `auto:${project.site_address}` : null;
  const travelPrefetchKeyRef = React25.useRef(null);
  useEffect7(() => {
    const shop = (settings.install_shop_address || "").trim();
    const site = (project.site_address || "").trim();
    if (!hasLoaded) return;
    if (scope === "letters_only") return;
    if (!shop || !site || !hasEquipment) return;
    if ((parseFloat(project.travel_miles_round_trip) || 0) > 0) return;
    const key = `${shop}|${site}`;
    if (travelPrefetchKeyRef.current === key) return;
    travelPrefetchKeyRef.current = key;
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("calculateTravelMiles", { shop_address: shop, site_address: site, session_token: getSessionToken() });
        const rt = parseFloat(res?.data?.round_trip_miles);
        if (!cancelled && isFinite(rt) && rt > 0) {
          updateProject({ travel_miles_round_trip: rt });
        }
      } catch (e) {
        console.error("Travel prefetch failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasLoaded, hasEquipment, project.site_address, settings.install_shop_address, scope]);
  const maxInstallHeight = useMemo7(
    () => (project.items || []).reduce((m, it) => Math.max(m, parseFloat(it.installation_height_feet) || 0), 0),
    [project.items]
  );
  useEffect7(() => {
    if (!hasLoaded) return;
    if ((project.selected_equipment || []).length > 0) return;
    if (maxInstallHeight <= 0 || equipmentInventory.length === 0) return;
    const projectLaborHours = recalculated.labor_hours || 0;
    const suggested = suggestEquipmentForProject(project.items, equipmentInventory);
    if (suggested.length === 0) return;
    const crewSize = (project.personnel || []).length || suggestCrewSize(project.items);
    const rows = suggested.map((inv) => selectedEquipmentFromInventory(inv, projectLaborHours, crewSize));
    setProject((prev) => ({ ...prev, selected_equipment: rows }));
  }, [maxInstallHeight, equipmentInventory, hasLoaded]);
  useEffect7(() => {
    if (!hasLoaded) return;
    if (activeTab !== "crew") return;
    if ((project.personnel || []).length > 0) return;
    if (!project.items || project.items.length === 0) return;
    const projectLaborHours = recalculated.labor_hours || 0;
    if (projectLaborHours <= 0) return;
    const rateForRole = (role) => {
      const map = {
        "Crew Lead": parseFloat(settings.install_crew_lead_rate) || 75,
        "Installer": parseFloat(settings.install_installer_rate) || 65,
        "Helper": parseFloat(settings.install_helper_rate) || 35
      };
      return map[role] ?? map.Installer;
    };
    const newCrew = suggestPersonnelForProject(project.items, projectLaborHours, rateForRole);
    if (newCrew.length === 0) return;
    setProject((prev) => ({ ...prev, personnel: newCrew }));
  }, [activeTab, hasLoaded]);
  const applyAIInstallItems = (aiItems, mode = "append") => {
    const newItems = aiItems.map((ai) => {
      const base = emptyLineItem();
      const merged = {
        ...base,
        ...ai,
        // ensure numeric fields are numbers
        qty_letters: parseFloat(ai.qty_letters) || 0,
        letter_height_inches: parseFloat(ai.letter_height_inches) || base.letter_height_inches,
        installation_height_feet: parseFloat(ai.installation_height_feet) || base.installation_height_feet,
        raceway_length_feet: parseFloat(ai.raceway_length_feet) || 0
      };
      merged.materials = defaultMaterialsForItem(merged, inventory);
      return merged;
    });
    setProject((prev) => ({
      ...prev,
      items: mode === "replace" ? newItems : [...prev.items, ...newItems]
    }));
  };
  const applyPhotoEstimate = (result) => {
    const newItem = emptyLineItem();
    newItem.installation_height_feet = parseFloat(result.estimated_height_feet) || newItem.installation_height_feet;
    newItem.wall_material = result.wall_material || newItem.wall_material;
    newItem.installation_type = result.recommended_install_type || newItem.installation_type;
    newItem.parapet = !!result.site_conditions?.parapet;
    newItem.poor_electrical_access = !!result.site_conditions?.poor_electrical_access;
    newItem.thick_hollow_walls = !!result.site_conditions?.thick_hollow_walls;
    newItem.description = `From site photo \u2014 ${result.confidence || ""} confidence`.trim();
    newItem.materials = defaultMaterialsForItem(newItem, inventory);
    setProject((prev) => ({ ...prev, items: [...prev.items, newItem] }));
    setActiveTab("items");
  };
  useEffect7(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "s") {
        e.preventDefault();
        saveProject();
      } else if (e.key === "i") {
        e.preventDefault();
        addItem();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project, recalculated]);
  const blockIfPricingUnavailable = () => {
    if (!pricingBlocked) return false;
    const first = pricingIssues[0];
    const focusTab = {
      purchase: "letters",
      letters: "letters",
      install: "items",
      equipment: "crew",
      personnel: "crew",
      travel: "crew",
      supplies: "summary",
      markup: "summary",
      project: "project"
    }[first?.hold] || "summary";
    setActiveTab(focusTab);
    alert(
      `Can't save \u2014 ${pricingIssues.length} pricing issue${pricingIssues.length === 1 ? "" : "s"} must be fixed first${pricingCatalogBlocked ? " (missing or unavailable pricing records)" : ""}. The flagged fields are highlighted and details are in the warnings panel.`
    );
    return true;
  };
  const saveProject = async () => {
    if (blockIfPricingUnavailable()) return;
    if (!embedded && (!project.project_name || !project.client_name)) {
      alert("Please fill in Project Name and Client Name.");
      setActiveTab("project");
      return;
    }
    if (scope !== "letters_only" && (!project.selected_equipment || project.selected_equipment.length === 0)) {
      alert("Please select at least one piece of equipment before saving.");
      setActiveTab("crew");
      return;
    }
    setIsSaving(true);
    setIsDirty(false);
    try {
      const customerPricing = await calculateSavedCustomerPricing({
        project: recalculated,
        categorize: categorizeChannelLetterProject,
        tierNumber: project.customer_pricing?.tier_number
      });
      const dataToSave = {
        ...recalculated,
        customer_pricing: customerPricing || project.customer_pricing,
        status: "calculated"
      };
      delete dataToSave.__held;
      delete dataToSave.pricingUnavailable;
      delete dataToSave.issues;
      dataToSave.items = (dataToSave.items || []).map(({ __held, ...rest }) => rest);
      dataToSave.letter_purchases = (dataToSave.letter_purchases || []).map(({ __held, ...rest }) => rest);
      let savedId = persistedProjectIdRef.current || editId || "";
      let persistedSource = null;
      if (savedId) {
        persistedSource = await updateBuilderSourceProject({
          entity: ChannelLetterInstallation,
          sourceId: savedId,
          expectedUpdatedAt: project.updated_date,
          data: dataToSave,
          estimateId,
          label: "Channel Letter project"
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(dataToSave);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("channel_letter_project")
          };
        }
        const created = await ensureIdempotentEntityCreate({
          entity: ChannelLetterInstallation,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: dataToSave,
          label: "Channel Letter project"
        });
        if (!created?.id) throw new Error("Channel Letter project create could not be verified.");
        savedId = created.id;
        persistedSource = created;
        persistedProjectIdRef.current = created.id;
        setIsEditing(true);
      }
      if (persistedSource?.updated_date) {
        setProject((prev) => ({ ...prev, updated_date: persistedSource.updated_date }));
      }
      await upsertCustomerSummaryForEstimate({
        module: "channel_letter_installation",
        client_name: project.client_name,
        project_id: savedId,
        project_name: project.project_name,
        estimate_number: project.estimate_number,
        sessionToken
      });
      if (estimateId && savedId) {
        const savedProject = await ChannelLetterInstallation.get(savedId).catch(() => null);
        await recordBuilderSave({
          estimateId,
          line: { project_id: savedId, module_key: "channel_letters" },
          sourceProject: savedProject || { ...dataToSave, id: savedId },
          liveTotal: parseFloat(recalculated.total_cost) || 0
        });
      }
      onSaved?.();
      if (!embedded) navigate(createPageUrl("Estimator"));
    } catch (e) {
      console.error(e);
      alert("Save failed: " + e.message);
    }
    setIsSaving(false);
  };
  const handleSaveAsCopy = async () => {
    if (blockIfPricingUnavailable()) return;
    setIsSaving(true);
    try {
      const copyPayload = {
        ...recalculated,
        customer_pricing: project.customer_pricing,
        status: "calculated"
      };
      delete copyPayload.__held;
      delete copyPayload.pricingUnavailable;
      delete copyPayload.issues;
      copyPayload.items = (copyPayload.items || []).map(({ __held, ...rest }) => rest);
      copyPayload.letter_purchases = (copyPayload.letter_purchases || []).map(({ __held, ...rest }) => rest);
      const copy = await saveModuleProjectCopy({
        entity: ChannelLetterInstallation,
        payload: copyPayload,
        attemptRef: copyAttemptRef,
        keyPrefix: "channel_letter_project_copy",
        baseName: project.project_name || "Channel Letter",
        label: "Channel Letter project copy"
      });
      if (embedded) onSaved?.();
      else navigate(`/ChannelLetterEstimator?edit=${copy.id}`);
    } catch (e) {
      console.error(e);
      alert("Save copy failed: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };
  const buildChannelLetterTemplateData = (p) => ({
    items: p.items || [],
    letter_purchases: p.letter_purchases || [],
    letters_delivery_fee: p.letters_delivery_fee,
    letters_design_fee: p.letters_design_fee,
    letters_install_supplies_fee: p.letters_install_supplies_fee,
    letters_permitting_fee: p.letters_permitting_fee,
    letters_other_fee: p.letters_other_fee,
    letters_markup_percent: p.letters_markup_percent,
    selected_equipment: p.selected_equipment || [],
    personnel: p.personnel || [],
    base_supplies_cost: p.base_supplies_cost,
    extra_supplies_cost: p.extra_supplies_cost,
    markup_percent: p.markup_percent,
    travel_miles_round_trip: p.travel_miles_round_trip,
    project_scope: p.project_scope,
    install_environment: p.install_environment,
    notes: p.notes
  });
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText(recalculated));
      alert("Summary copied to clipboard!");
    } catch (e) {
      alert("Copy failed: " + e.message);
    }
  };
  const exportCSV = () => downloadCSV(recalculated);
  const [materialsCopied, setMaterialsCopied] = useState10(null);
  const flashCopied = (which) => {
    setMaterialsCopied(which);
    setTimeout(() => setMaterialsCopied(null), 1800);
  };
  const buildPlainMaterialsList = () => {
    if (aggregatedMaterials.length === 0) return "";
    const sorted = [...aggregatedMaterials].sort((a, b) => a.item_name.localeCompare(b.item_name));
    const qtyWidth = Math.max(3, ...sorted.map((m) => m.quantity.toFixed(2).length));
    const lines = sorted.map((m) => `${m.quantity.toFixed(2).padStart(qtyWidth)}  ${m.item_name}`);
    return [
      "MATERIALS LIST",
      `${project.project_name || "Untitled Project"}${project.estimate_number ? ` \u2014 ${project.estimate_number}` : ""}`,
      "\u2500".repeat(40),
      ...lines
    ].join("\n");
  };
  const buildPricedMaterialsList = () => {
    if (aggregatedMaterials.length === 0) return "";
    const sorted = [...aggregatedMaterials].sort((a, b) => a.item_name.localeCompare(b.item_name));
    const nameWidth = Math.max(4, ...sorted.map((m) => m.item_name.length));
    const qtyWidth = Math.max(3, ...sorted.map((m) => m.quantity.toFixed(2).length));
    const unitWidth = Math.max(6, ...sorted.map((m) => `$${m.unit_cost.toFixed(2)}`.length));
    const totalWidth = Math.max(6, ...sorted.map((m) => `$${m.total_cost.toFixed(2)}`.length));
    const header = `${"Item".padEnd(nameWidth)}  ${"Qty".padStart(qtyWidth)}  ${"Unit".padStart(unitWidth)}  ${"Total".padStart(totalWidth)}`;
    const divider = "\u2500".repeat(header.length);
    const rows = sorted.map(
      (m) => `${m.item_name.padEnd(nameWidth)}  ${m.quantity.toFixed(2).padStart(qtyWidth)}  ${`$${m.unit_cost.toFixed(2)}`.padStart(unitWidth)}  ${`$${m.total_cost.toFixed(2)}`.padStart(totalWidth)}`
    );
    const totalLine = `${"MATERIALS TOTAL".padEnd(nameWidth + qtyWidth + unitWidth + 4)}  ${fmt15(recalculated.total_materials_cost).padStart(totalWidth)}`;
    return [
      "MATERIALS LIST (WITH PRICING)",
      `${project.project_name || "Untitled Project"}${project.estimate_number ? ` \u2014 ${project.estimate_number}` : ""}`,
      divider,
      header,
      divider,
      ...rows,
      divider,
      totalLine
    ].join("\n");
  };
  const copyMaterialsPlain = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainMaterialsList());
      flashCopied("plain");
    } catch (e) {
      alert("Copy failed: " + e.message);
    }
  };
  const copyMaterialsPriced = async () => {
    try {
      await navigator.clipboard.writeText(buildPricedMaterialsList());
      flashCopied("priced");
    } catch (e) {
      alert("Copy failed: " + e.message);
    }
  };
  if (isLoading) {
    return /* @__PURE__ */ jsx45("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen flex items-center justify-center", children: /* @__PURE__ */ jsx45("p", { className: "text-slate-600", children: "Loading..." }) });
  }
  if (loadError) {
    return /* @__PURE__ */ jsx45("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: /* @__PURE__ */ jsxs28("div", { className: "max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800", children: [
      /* @__PURE__ */ jsx45("div", { className: "font-bold", children: "Channel / Dimensional Letter Builder unavailable" }),
      /* @__PURE__ */ jsx45("div", { className: "mt-1 text-sm", children: "Required Settings, installation inventory, equipment, or project data could not be verified. Fallback configuration was not used." }),
      /* @__PURE__ */ jsx45("div", { className: "mt-2 text-xs break-words", children: loadError }),
      /* @__PURE__ */ jsxs28(Button, { variant: "outline", className: "mt-4", onClick: () => embedded ? onClose?.() : navigate(estimateId ? `/EstimateDetail?id=${estimateId}` : createPageUrl("Estimator")), children: [
        /* @__PURE__ */ jsx45(ArrowLeft, { className: "w-4 h-4 mr-2" }),
        " Back"
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxs28("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: [
    /* @__PURE__ */ jsxs28("div", { className: "max-w-7xl mx-auto", children: [
      /* @__PURE__ */ jsxs28("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3", children: [
        /* @__PURE__ */ jsxs28("div", { children: [
          /* @__PURE__ */ jsxs28("h1", { className: "text-3xl font-bold text-slate-900 flex items-center gap-3", children: [
            /* @__PURE__ */ jsx45(Wrench, { className: "w-8 h-8 text-purple-600" }),
            isEditing ? "Edit" : "New",
            " Channel / Dimensional Letter / Lobby Sign Estimate"
          ] }),
          /* @__PURE__ */ jsx45("p", { className: "text-slate-600", children: "Multi-item estimate \u2014 letters, install, crew" })
        ] }),
        /* @__PURE__ */ jsxs28("div", { className: "flex gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsxs28(
            Button,
            {
              variant: "outline",
              onClick: () => setHelpTrigger(true),
              className: "bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100",
              title: "Walk me through this page",
              children: [
                /* @__PURE__ */ jsx45(HelpCircle, { className: "w-4 h-4 mr-2" }),
                " Help"
              ]
            }
          ),
          /* @__PURE__ */ jsxs28(
            Button,
            {
              variant: "outline",
              onClick: () => setPhotoModalOpen(true),
              className: "bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 text-purple-800 hover:from-purple-100 hover:to-pink-100",
              children: [
                /* @__PURE__ */ jsx45(Camera, { className: "w-4 h-4 mr-2" }),
                " Photo \u2192 Estimate"
              ]
            }
          ),
          /* @__PURE__ */ jsx45(Link7, { to: createPageUrl("MasterInventory"), children: /* @__PURE__ */ jsxs28(Button, { variant: "outline", className: "bg-white", children: [
            /* @__PURE__ */ jsx45(Package, { className: "w-4 h-4 mr-2" }),
            " Inventory"
          ] }) }),
          /* @__PURE__ */ jsxs28(Button, { variant: "outline", onClick: () => embedded ? onClose?.() : navigate(createPageUrl("Estimator")), children: [
            /* @__PURE__ */ jsx45(ArrowLeft, { className: "w-4 h-4 mr-2" }),
            " Back"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs28("div", { className: "grid lg:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsx45("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs28(Tabs, { value: activeTab, onValueChange: handleTabChange, className: "w-full", children: [
          /* @__PURE__ */ jsx45("div", { className: "sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60", children: (() => {
            const visibleTabsCount = 3 + (showLettersTab ? 1 : 0) + (showInstallTab ? 1 : 0) + (showCrewTab ? 1 : 0);
            return /* @__PURE__ */ jsxs28(TabsList, { className: `grid w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1`, style: { gridTemplateColumns: `repeat(${visibleTabsCount}, minmax(0, 1fr))` }, children: [
              /* @__PURE__ */ jsx45(TabBadgeTrigger, { value: "project", icon: FileText, label: "Project" }),
              showLettersTab && /* @__PURE__ */ jsx45(TabBadgeTrigger, { value: "letters", icon: Type, label: "Letters", amount: recalculated.total_letters_cost, warn: hasIncompleteDimensional || lettersIssues }),
              showInstallTab && /* @__PURE__ */ jsx45(
                TabBadgeTrigger,
                {
                  value: "items",
                  icon: ListChecks,
                  label: "Install",
                  amount: Number.isFinite(recalculated.labor_cost_in_subtotal ?? recalculated.labor_cost) && Number.isFinite(recalculated.total_materials_cost) ? (recalculated.labor_cost_in_subtotal ?? recalculated.labor_cost) + recalculated.total_materials_cost : null,
                  count: recalculated.items.length,
                  warn: installIssues
                }
              ),
              showCrewTab && /* @__PURE__ */ jsx45(
                TabBadgeTrigger,
                {
                  value: "crew",
                  icon: HardHat,
                  label: "Crew & Equipment",
                  amount: [recalculated.total_equipment_cost, recalculated.total_personnel_cost, recalculated.total_travel_cost].every(Number.isFinite) ? recalculated.total_equipment_cost + recalculated.total_personnel_cost + recalculated.total_travel_cost : null,
                  warn: crewIssues || (recalculated.selected_equipment?.length || 0) === 0
                }
              ),
              /* @__PURE__ */ jsx45(TabBadgeTrigger, { value: "summary", icon: Calculator, label: "Summary", amount: recalculated.total_cost, warn: pricingBlocked }),
              /* @__PURE__ */ jsx45(TabBadgeTrigger, { value: "pricing", icon: TrendingUp, label: "Customer Pricing", accent: true })
            ] });
          })() }),
          /* @__PURE__ */ jsxs28(TabsContent, { value: "project", className: "mt-4 space-y-4", children: [
            /* @__PURE__ */ jsxs28(Card, { className: "bg-white border-0 shadow-sm", children: [
              /* @__PURE__ */ jsx45(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx45(CardTitle, { className: "text-lg", children: "Project Information" }) }),
              /* @__PURE__ */ jsxs28(CardContent, { className: "space-y-4", children: [
                embedded ? (
                  /* Inside All-In-One: client / estimate # / link come from the
                     parent estimate. Show them read-only so they aren't re-entered. */
                  /* @__PURE__ */ jsxs28("div", { className: "rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3", children: [
                    /* @__PURE__ */ jsx45("p", { className: "text-xs font-medium text-indigo-700 mb-2", children: "Inherited from the All-In-One estimate" }),
                    /* @__PURE__ */ jsxs28("div", { className: "grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm", children: [
                      /* @__PURE__ */ jsxs28("div", { className: "flex justify-between sm:block", children: [
                        /* @__PURE__ */ jsx45("span", { className: "text-slate-500", children: "Client" }),
                        /* @__PURE__ */ jsx45("span", { className: "sm:block font-medium text-slate-900", children: project.client_name || "\u2014" })
                      ] }),
                      /* @__PURE__ */ jsxs28("div", { className: "flex justify-between sm:block", children: [
                        /* @__PURE__ */ jsx45("span", { className: "text-slate-500", children: "Section Name" }),
                        /* @__PURE__ */ jsx45("span", { className: "sm:block font-medium text-slate-900", children: project.project_name || "\u2014" })
                      ] }),
                      /* @__PURE__ */ jsxs28("div", { className: "flex justify-between sm:block", children: [
                        /* @__PURE__ */ jsx45("span", { className: "text-slate-500", children: "Estimate #" }),
                        /* @__PURE__ */ jsx45("span", { className: "sm:block font-medium text-slate-900", children: project.estimate_number || "\u2014" })
                      ] }),
                      /* @__PURE__ */ jsxs28("div", { className: "flex justify-between sm:block", children: [
                        /* @__PURE__ */ jsx45("span", { className: "text-slate-500", children: "Project Link" }),
                        /* @__PURE__ */ jsx45("span", { className: "sm:block font-medium text-slate-900 truncate", children: project.hyperlink || "\u2014" })
                      ] })
                    ] })
                  ] })
                ) : /* @__PURE__ */ jsxs28(Fragment7, { children: [
                  /* @__PURE__ */ jsxs28("div", { className: "grid md:grid-cols-2 gap-4", children: [
                    /* @__PURE__ */ jsxs28("div", { id: "clp-client-name", children: [
                      /* @__PURE__ */ jsx45(Label, { htmlFor: "client_name", children: "Client Name *" }),
                      /* @__PURE__ */ jsx45(
                        ClientSearchInput_default,
                        {
                          value: project.client_name,
                          onChange: (val) => updateProject({ client_name: val }),
                          onSelectProject: (data) => updateProject({
                            client_name: data.client_name || project.client_name,
                            project_name: data.project_name || project.project_name,
                            estimate_number: data.estimate_number || project.estimate_number,
                            hyperlink: data.hyperlink || project.hyperlink
                          }),
                          className: "mt-1",
                          placeholder: "Enter client name"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs28("div", { id: "clp-project-name", children: [
                      /* @__PURE__ */ jsx45(Label, { htmlFor: "project_name", children: "Project Name *" }),
                      /* @__PURE__ */ jsx45(
                        Input,
                        {
                          id: "project_name",
                          value: project.project_name,
                          onChange: (e) => updateProject({ project_name: e.target.value }),
                          placeholder: "Enter project name",
                          className: "mt-1"
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs28("div", { className: "grid md:grid-cols-2 gap-4", children: [
                    /* @__PURE__ */ jsxs28("div", { id: "clp-estimate-number", children: [
                      /* @__PURE__ */ jsxs28(Label, { htmlFor: "estimate_number", children: [
                        "Estimate Number ",
                        /* @__PURE__ */ jsx45("span", { className: "text-xs font-normal text-slate-400", children: "(optional)" })
                      ] }),
                      /* @__PURE__ */ jsx45(
                        Input,
                        {
                          id: "estimate_number",
                          value: project.estimate_number,
                          onChange: (e) => updateProject({ estimate_number: e.target.value }),
                          placeholder: "e.g., INST-2024-001",
                          className: "mt-1"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs28("div", { id: "clp-hyperlink", children: [
                      /* @__PURE__ */ jsxs28(Label, { htmlFor: "hyperlink", children: [
                        "Project Link ",
                        /* @__PURE__ */ jsx45("span", { className: "text-xs font-normal text-slate-400", children: "(optional)" })
                      ] }),
                      /* @__PURE__ */ jsx45(
                        Input,
                        {
                          id: "hyperlink",
                          value: project.hyperlink,
                          onChange: (e) => updateProject({ hyperlink: e.target.value }),
                          placeholder: "https://...",
                          className: "mt-1"
                        }
                      )
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { id: "clp-install-env", children: [
                  /* @__PURE__ */ jsx45(Label, { className: "text-sm font-semibold text-slate-900", children: "Installation Environment" }),
                  /* @__PURE__ */ jsx45("p", { className: "text-xs text-slate-500 mt-1 mb-2", children: "Default for every line item \u2014 interior installs typically have different drill/prep times than exterior. You can override this on any line item." }),
                  /* @__PURE__ */ jsx45("div", { className: "grid grid-cols-2 gap-2 max-w-md", children: [
                    { value: "exterior", label: "Exterior", desc: "Outdoor wall, parapet, storefront", color: "blue" },
                    { value: "interior", label: "Interior", desc: "Lobby, indoor wall, office signage", color: "amber" }
                  ].map((opt) => {
                    const active = (project.install_environment || "exterior") === opt.value;
                    const ringClass = opt.color === "blue" ? active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300" : active ? "border-amber-500 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300";
                    const titleClass = opt.color === "blue" ? active ? "text-blue-900" : "text-slate-800" : active ? "text-amber-900" : "text-slate-800";
                    return /* @__PURE__ */ jsxs28(
                      "button",
                      {
                        type: "button",
                        onClick: () => updateProject({ install_environment: opt.value }),
                        className: `text-left p-3 rounded-lg border-2 transition-all ${ringClass}`,
                        children: [
                          /* @__PURE__ */ jsx45("div", { className: `text-sm font-semibold ${titleClass}`, children: opt.label }),
                          /* @__PURE__ */ jsx45("div", { className: "text-[11px] text-slate-500 mt-0.5 leading-tight", children: opt.desc })
                        ]
                      },
                      opt.value
                    );
                  }) })
                ] }),
                /* @__PURE__ */ jsxs28("div", { id: "clp-project-scope", children: [
                  /* @__PURE__ */ jsx45(Label, { className: "text-sm font-semibold text-slate-900", children: "Project Scope" }),
                  /* @__PURE__ */ jsx45("p", { className: "text-xs text-slate-500 mt-1 mb-2", children: "Choose what this estimate covers. Hidden tabs are excluded from totals." }),
                  /* @__PURE__ */ jsx45("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-2", children: [
                    { value: "full", label: "Letters + Install", desc: "Both letter purchases and installation labor" },
                    { value: "install_only", label: "Installation Only", desc: "Install labor only \u2014 no letter purchases" },
                    { value: "letters_only", label: "Lettering / Logo Only", desc: "Letter purchases only \u2014 no install or crew" }
                  ].map((opt) => {
                    const active = (project.project_scope || "full") === opt.value;
                    return /* @__PURE__ */ jsxs28(
                      "button",
                      {
                        type: "button",
                        onClick: () => updateProject({ project_scope: opt.value }),
                        className: `text-left p-3 rounded-lg border-2 transition-all ${active ? "border-purple-500 bg-purple-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`,
                        children: [
                          /* @__PURE__ */ jsx45("div", { className: `text-sm font-semibold ${active ? "text-purple-900" : "text-slate-800"}`, children: opt.label }),
                          /* @__PURE__ */ jsx45("div", { className: "text-[11px] text-slate-500 mt-0.5 leading-tight", children: opt.desc })
                        ]
                      },
                      opt.value
                    );
                  }) })
                ] }),
                /* @__PURE__ */ jsxs28("div", { id: "clp-site-address", children: [
                  /* @__PURE__ */ jsxs28(Label, { htmlFor: "site_address", className: "flex items-center gap-1.5", children: [
                    /* @__PURE__ */ jsx45(MapPin, { className: "w-3.5 h-3.5 text-purple-600" }),
                    "Site Address",
                    /* @__PURE__ */ jsx45("span", { className: "text-xs font-normal text-slate-500", children: "(used for travel mileage)" })
                  ] }),
                  /* @__PURE__ */ jsx45(
                    AddressAutocomplete_default,
                    {
                      id: "site_address",
                      value: project.site_address || "",
                      onChange: (val) => updateProject({ site_address: val }),
                      placeholder: "e.g., 123 Main St, Cincinnati, OH 45202",
                      className: "mt-1"
                    }
                  ),
                  /* @__PURE__ */ jsxs28("p", { className: "mt-1 text-xs text-slate-500", children: [
                    "Travel cost will be calculated from your shop (",
                    /* @__PURE__ */ jsx45(Link7, { to: createPageUrl("InstallationSettings"), className: "underline hover:text-purple-700", children: "Travel settings" }),
                    ") to this address."
                  ] })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs28(Card, { id: "clp-notes", className: "bg-white border-0 shadow-sm", children: [
              /* @__PURE__ */ jsx45(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsx45(CardTitle, { className: "text-lg", children: "Notes" }) }),
              /* @__PURE__ */ jsx45(CardContent, { children: /* @__PURE__ */ jsx45(
                Textarea,
                {
                  value: project.notes,
                  onChange: (e) => updateProject({ notes: e.target.value }),
                  placeholder: "Add any additional notes or special considerations...",
                  className: "h-32"
                }
              ) })
            ] }),
            /* @__PURE__ */ jsx45("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxs28(
              Button,
              {
                onClick: () => setActiveTab(showLettersTab ? "letters" : showInstallTab ? "items" : "summary"),
                className: "bg-purple-600 hover:bg-purple-700 text-white",
                children: [
                  "Continue to ",
                  showLettersTab ? "Letters" : showInstallTab ? "Install" : "Summary",
                  " \u2192"
                ]
              }
            ) })
          ] }),
          /* @__PURE__ */ jsx45(TabsContent, { value: "letters", className: "mt-4 space-y-3", children: /* @__PURE__ */ jsx45(
            LettersPurchaseTab,
            {
              project: recalculated,
              settings,
              onUpdateProject: updateProject,
              incompleteDimensionalIds,
              issues: pricingIssues
            }
          ) }),
          /* @__PURE__ */ jsxs28(TabsContent, { value: "items", className: "mt-4 space-y-3", children: [
            /* @__PURE__ */ jsxs28("div", { id: "clp-install-ai", className: "flex items-center justify-end gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm", children: [
              /* @__PURE__ */ jsxs28(
                Button,
                {
                  onClick: () => setAiInstallOpen(true),
                  size: "sm",
                  className: "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-sm",
                  children: [
                    /* @__PURE__ */ jsx45(Sparkles, { className: "w-4 h-4 mr-1" }),
                    " AI Scope"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs28(Button, { onClick: addItem, size: "sm", className: "bg-purple-600 hover:bg-purple-700 text-white", children: [
                /* @__PURE__ */ jsx45(Plus, { className: "w-4 h-4 mr-1" }),
                " Add Item"
              ] })
            ] }),
            recalculated.items.length === 0 ? /* @__PURE__ */ jsx45(Card, { className: "border-2 border-dashed border-slate-300 bg-white/50", children: /* @__PURE__ */ jsxs28(CardContent, { className: "p-12 text-center text-slate-500", children: [
              /* @__PURE__ */ jsx45(ListChecks, { className: "w-12 h-12 mx-auto mb-3 text-slate-300" }),
              /* @__PURE__ */ jsx45("p", { className: "mb-3 font-medium", children: "No line items yet" }),
              /* @__PURE__ */ jsx45("p", { className: "text-xs mb-4", children: "Add your first installation item to get started" }),
              /* @__PURE__ */ jsxs28(Button, { onClick: addItem, className: "bg-purple-600 hover:bg-purple-700 text-white", children: [
                /* @__PURE__ */ jsx45(Plus, { className: "w-4 h-4 mr-2" }),
                " Add Line Item"
              ] })
            ] }) }) : /* @__PURE__ */ jsx45("div", { id: "clp-install-row", children: /* @__PURE__ */ jsx45(
              ItemsList,
              {
                items: recalculated.items,
                inventory,
                settings,
                compact: false,
                onUpdate: updateItem,
                onRemove: removeItem,
                onDuplicate: duplicateItem,
                onReorder: reorderItems,
                issues: pricingIssues
              }
            ) })
          ] }),
          /* @__PURE__ */ jsxs28(TabsContent, { value: "crew", className: "mt-4 space-y-3", children: [
            /* @__PURE__ */ jsx45("div", { id: "clp-equipment", children: /* @__PURE__ */ jsx45(
              EquipmentSelector,
              {
                selectedEquipment: recalculated.selected_equipment || [],
                onChange: (next) => updateProject({ selected_equipment: next }),
                equipmentInventory,
                items: recalculated.items,
                projectLaborHours: recalculated.labor_hours || 0,
                crewSize: (recalculated.personnel || []).length,
                issues: pricingIssues
              }
            ) }),
            /* @__PURE__ */ jsx45("div", { id: "clp-ladder", children: /* @__PURE__ */ jsx45(
              LadderSelector,
              {
                selectedEquipment: recalculated.selected_equipment || [],
                onChange: (next) => updateProject({ selected_equipment: next }),
                equipmentInventory,
                projectLaborHours: recalculated.labor_hours || 0,
                crewSize: (recalculated.personnel || []).length,
                issues: pricingIssues
              }
            ) }),
            /* @__PURE__ */ jsx45("div", { id: "clp-personnel", children: /* @__PURE__ */ jsx45(
              PersonnelSelector,
              {
                personnel: recalculated.personnel || [],
                onChange: (next) => updateProject({ personnel: next }),
                projectLaborHours: recalculated.labor_hours || 0,
                roleRates: {
                  "Crew Lead": parseFloat(settings.install_crew_lead_rate) || 75,
                  "Installer": parseFloat(settings.install_installer_rate) || 65,
                  "Helper": parseFloat(settings.install_helper_rate) || 35
                },
                items: recalculated.items,
                issues: pricingIssues
              }
            ) }),
            /* @__PURE__ */ jsx45("div", { id: "clp-travel", children: /* @__PURE__ */ jsx45(
              TravelCostCard_default,
              {
                shopAddress: settings.install_shop_address || "",
                siteAddress: project.site_address || "",
                selectedEquipment: recalculated.selected_equipment || [],
                equipmentInventory,
                personnel: recalculated.personnel || [],
                settings,
                travelMiles: project.travel_miles_round_trip || 0,
                onMilesChange: (miles) => updateProject({ travel_miles_round_trip: miles }),
                onTotalChange: (total) => {
                  if ((project.total_travel_cost || 0) !== total) {
                    updateProject({ total_travel_cost: total });
                  }
                },
                autoTriggerKey: travelAutoKey
              }
            ) }),
            equipmentInventory.length === 0 && /* @__PURE__ */ jsx45(Card, { className: "bg-amber-50 border-amber-200", children: /* @__PURE__ */ jsxs28(CardContent, { className: "p-3 text-xs text-amber-900", children: [
              "Your equipment inventory is empty.",
              " ",
              /* @__PURE__ */ jsx45(Link7, { to: createPageUrl("MasterInventory"), className: "underline font-medium", children: "Add equipment in Inventory" }),
              " ",
              "to enable selection."
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs28(TabsContent, { value: "summary", className: "mt-4 space-y-3", children: [
            /* @__PURE__ */ jsx45("div", { id: "clp-summary-breakdown", children: /* @__PURE__ */ jsx45(SummaryDetailsCard, { project: recalculated }) }),
            /* @__PURE__ */ jsxs28(Card, { id: "clp-summary-materials", className: "bg-white border-0 shadow-sm", children: [
              /* @__PURE__ */ jsxs28(CardHeader, { className: "pb-3 flex flex-row items-start justify-between gap-3 flex-wrap", children: [
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsxs28(CardTitle, { className: "text-lg flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx45(Boxes, { className: "w-5 h-5 text-purple-600" }),
                    "Materials (Pick List)"
                  ] }),
                  /* @__PURE__ */ jsx45("p", { className: "text-xs text-slate-500 mt-1", children: "Combined materials across all line items \u2014 your shopping list." })
                ] }),
                aggregatedMaterials.length > 0 && /* @__PURE__ */ jsxs28("div", { className: "flex gap-2", children: [
                  /* @__PURE__ */ jsx45(
                    Button,
                    {
                      variant: "outline",
                      size: "sm",
                      onClick: copyMaterialsPlain,
                      className: "h-8 text-xs",
                      title: "Copy materials list without pricing",
                      children: materialsCopied === "plain" ? /* @__PURE__ */ jsxs28(Fragment7, { children: [
                        /* @__PURE__ */ jsx45(Check, { className: "w-3.5 h-3.5 mr-1 text-green-600" }),
                        " Copied!"
                      ] }) : /* @__PURE__ */ jsxs28(Fragment7, { children: [
                        /* @__PURE__ */ jsx45(Copy, { className: "w-3.5 h-3.5 mr-1" }),
                        " Copy List"
                      ] })
                    }
                  ),
                  /* @__PURE__ */ jsx45(
                    Button,
                    {
                      variant: "outline",
                      size: "sm",
                      onClick: copyMaterialsPriced,
                      className: "h-8 text-xs",
                      title: "Copy materials list with pricing",
                      children: materialsCopied === "priced" ? /* @__PURE__ */ jsxs28(Fragment7, { children: [
                        /* @__PURE__ */ jsx45(Check, { className: "w-3.5 h-3.5 mr-1 text-green-600" }),
                        " Copied!"
                      ] }) : /* @__PURE__ */ jsxs28(Fragment7, { children: [
                        /* @__PURE__ */ jsx45(DollarSign, { className: "w-3.5 h-3.5 mr-1" }),
                        " Copy with Pricing"
                      ] })
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsx45(CardContent, { className: "p-0", children: aggregatedMaterials.length === 0 ? /* @__PURE__ */ jsx45("div", { className: "p-8 text-center text-slate-400 text-sm", children: "No materials yet. Add line items to populate this list." }) : /* @__PURE__ */ jsxs28("table", { className: "w-full text-sm", children: [
                /* @__PURE__ */ jsx45("thead", { className: "bg-slate-50 text-slate-600 text-xs", children: /* @__PURE__ */ jsxs28("tr", { children: [
                  /* @__PURE__ */ jsx45("th", { className: "text-left px-4 py-2 font-medium", children: "Item" }),
                  /* @__PURE__ */ jsx45("th", { className: "text-right px-4 py-2 font-medium", children: "Qty" }),
                  /* @__PURE__ */ jsx45("th", { className: "text-right px-4 py-2 font-medium", children: "Unit $" }),
                  /* @__PURE__ */ jsx45("th", { className: "text-right px-4 py-2 font-medium", children: "Total" })
                ] }) }),
                /* @__PURE__ */ jsx45("tbody", { children: aggregatedMaterials.map((m, i) => /* @__PURE__ */ jsxs28("tr", { className: "border-t border-slate-100", children: [
                  /* @__PURE__ */ jsx45("td", { className: "px-4 py-2", children: m.item_name }),
                  /* @__PURE__ */ jsx45("td", { className: "px-4 py-2 text-right tabular-nums", children: m.quantity.toFixed(2) }),
                  /* @__PURE__ */ jsx45("td", { className: "px-4 py-2 text-right tabular-nums text-slate-500", children: fmt15(m.unit_cost) }),
                  /* @__PURE__ */ jsx45("td", { className: "px-4 py-2 text-right tabular-nums font-medium", children: fmt15(m.total_cost) })
                ] }, i)) }),
                /* @__PURE__ */ jsx45("tfoot", { className: "bg-slate-50 border-t-2 border-slate-200", children: /* @__PURE__ */ jsxs28("tr", { children: [
                  /* @__PURE__ */ jsx45("td", { colSpan: "3", className: "px-4 py-2 text-right font-semibold", children: "Materials Total" }),
                  /* @__PURE__ */ jsx45("td", { className: "px-4 py-2 text-right font-bold tabular-nums", children: fmt15(recalculated.total_materials_cost) })
                ] }) })
              ] }) })
            ] })
          ] }),
          /* @__PURE__ */ jsx45(TabsContent, { value: "pricing", className: "mt-4 space-y-3", children: /* @__PURE__ */ jsx45(
            CustomerPricingTab_default,
            {
              project: recalculated,
              categorize: categorizeChannelLetterProject,
              accentColor: "purple",
              onTierChange: (tier) => setProject((prev) => ({
                ...prev,
                customer_pricing: { ...prev.customer_pricing || {}, tier_number: tier }
              }))
            }
          ) })
        ] }) }),
        /* @__PURE__ */ jsxs28("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsx45(
            InstallSummaryCard,
            {
              project: recalculated,
              onUpdate: updateProject,
              onSave: saveProject,
              isSaving,
              isEditing,
              onCopySummary: copySummary,
              onExportCSV: exportCSV
            }
          ),
          /* @__PURE__ */ jsx45("div", { className: "flex flex-wrap gap-2", children: /* @__PURE__ */ jsx45(
            ModuleActionBar_default,
            {
              onTemplates: () => setTemplateMode("load"),
              onSaveAsTemplate: () => setTemplateMode("save"),
              onSaveAsCopy: handleSaveAsCopy,
              estimateId,
              saving: isSaving
            }
          ) }),
          /* @__PURE__ */ jsx45(CrewEquipmentHint, { items: recalculated.items }),
          /* @__PURE__ */ jsx45(ValidationWarnings, { project: recalculated, pricingIssues }),
          /* @__PURE__ */ jsxs28("div", { className: "text-[10px] text-slate-400 text-center px-2", children: [
            "Shortcuts: ",
            /* @__PURE__ */ jsx45("kbd", { className: "px-1 bg-slate-100 rounded", children: "\u2318S" }),
            " Save \xB7 ",
            /* @__PURE__ */ jsx45("kbd", { className: "px-1 bg-slate-100 rounded", children: "\u2318I" }),
            " Add Item"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx45(
      ChannelLetterHelpAssistant_default,
      {
        activeTab,
        manualTrigger: helpTrigger,
        onManualTriggerClose: () => setHelpTrigger(false)
      }
    ),
    /* @__PURE__ */ jsx45(
      PhotoEstimateModal_default,
      {
        open: photoModalOpen,
        onClose: () => setPhotoModalOpen(false),
        onApply: applyPhotoEstimate
      }
    ),
    /* @__PURE__ */ jsx45(
      AIInstallScopeModal_default,
      {
        open: aiInstallOpen,
        onClose: () => setAiInstallOpen(false),
        onApply: applyAIInstallItems
      }
    ),
    /* @__PURE__ */ jsx45(
      ModuleTemplateDialog_default,
      {
        open: !!templateMode,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => setProject((prev) => ({ ...prev, ...data })),
        moduleKey: "channel_letters",
        title: "Channel Letter",
        buildTemplateData: buildChannelLetterTemplateData,
        describeTemplate: (t) => `${(t.project_data?.items || []).length} items`
      }
    ),
    /* @__PURE__ */ jsx45(
      ConfirmModal,
      {
        open: !!confirmModal,
        onClose: () => setConfirmModal(null),
        title: confirmModal?.title,
        description: confirmModal?.description,
        confirmLabel: confirmModal?.confirmLabel,
        tone: confirmModal?.tone
      }
    )
  ] });
}
export {
  ChannelLetterEstimator as Page
};
