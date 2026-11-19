import { jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, PenLine } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import WallShapeEditor from "./WallShapeEditor";
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
function WallRow({ wall, index, options, onChange, onRemove }) {
  const c = wall.calculatedCosts || {};
  const set = (changes) => onChange(index, changes);
  const [showEditor, setShowEditor] = React.useState(false);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-3 space-y-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx(
        Input,
        {
          className: "max-w-[220px]",
          value: wall.name || "",
          placeholder: `Wall ${index + 1}`,
          onChange: (e) => set({ name: e.target.value })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("span", { className: "font-bold text-gray-900", children: amt(c.totalCost) }),
        /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => onRemove(index), children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2", children: [
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
        "Height (in)",
        /* @__PURE__ */ jsx(
          Input,
          {
            type: "number",
            value: wall.heightInches ?? 24,
            onChange: (e) => set({ heightInches: num(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
        "Mortar gap (in)",
        /* @__PURE__ */ jsx(
          Input,
          {
            type: "number",
            step: "0.125",
            value: wall.mortarGapInches ?? 0.375,
            onChange: (e) => set({ mortarGapInches: num(e.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
        "Wall material",
        /* @__PURE__ */ jsxs(
          "select",
          {
            className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
            value: wall.materialId || "",
            "aria-label": "Wall material",
            onChange: (e) => set({ materialId: e.target.value }),
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Select material\u2026" }),
              wall.materialId && !options.some((o) => o.id === wall.materialId) && /* @__PURE__ */ jsx("option", { value: wall.materialId, disabled: true, children: `Catalog material unavailable (${wall.materialId})` }),
              options.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.material_name }, o.id))
            ]
          }
        ),
        wall.materialId && !options.some((o) => o.id === wall.materialId) && /* @__PURE__ */ jsx("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog material unavailable; current pricing needs review." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg bg-slate-50 p-2 space-y-2", children: [
      /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-xs font-medium text-gray-700", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "checkbox",
            checked: !!wall.includeInternalWall,
            onChange: (e) => set({ includeInternalWall: e.target.checked })
          }
        ),
        "Internal fill wall"
      ] }),
      wall.includeInternalWall && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
          "Fill material",
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: wall.internalMaterialId || "",
              "aria-label": "Internal wall material",
              onChange: (e) => set({ internalMaterialId: e.target.value }),
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Select material\u2026" }),
                wall.internalMaterialId && !options.some((o) => o.id === wall.internalMaterialId) && /* @__PURE__ */ jsx("option", { value: wall.internalMaterialId, disabled: true, children: `Catalog material unavailable (${wall.internalMaterialId})` }),
                options.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.material_name }, o.id))
              ]
            }
          ),
          wall.internalMaterialId && !options.some((o) => o.id === wall.internalMaterialId) && /* @__PURE__ */ jsx("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog material unavailable; current pricing needs review." })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Fill height (in)",
          /* @__PURE__ */ jsx(
            Input,
            {
              type: "number",
              value: wall.internalWallHeightInches ?? wall.heightInches ?? 24,
              onChange: (e) => set({ internalWallHeightInches: num(e.target.value) })
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        "Units: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-900", children: Math.round(num(c.totalBricks)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Courses: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-900", children: Math.ceil(num(c.numCourses)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Material: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-900", children: amt(c.materialCost) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Mortar: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-900", children: amt(c.mortarCost) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Labor: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-900", children: amt(c.laborCost) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Labor hrs: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-900", children: num(c.laborHours).toFixed(1) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        "Linear in: ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-900", children: Math.round(num(c.totalLinearInches)) })
      ] }),
      catalogMissing && /* @__PURE__ */ jsx("div", { className: "col-span-full text-[10px] font-semibold text-amber-700", children: "Saved amounts (not current pricing)" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: () => setShowEditor((v) => !v), children: [
        /* @__PURE__ */ jsx(PenLine, { className: "w-4 h-4", "aria-hidden": "true" }),
        " ",
        showEditor ? "Hide outline" : "Wall outline"
      ] }),
      !wall.shape?.segments?.length && /* @__PURE__ */ jsx("span", { className: "text-xs text-amber-600", children: "No outline yet \u2014 this wall stays at $0 until its footprint is drawn." })
    ] }),
    showEditor && /* @__PURE__ */ jsx(WallShapeEditor, { shape: wall.shape, onChange: (shape) => set({ shape }) })
  ] });
}
export default function FoundationWallsPanel({ walls = [], options = [], onChange }) {
  const patchWall = (index, changes) => onChange(walls.map((w, i) => i === index ? { ...w, ...changes } : w));
  const removeWall = (index) => {
    const name = walls[index]?.name || `Wall ${index + 1}`;
    if (!window.confirm(`Remove ${name}? Wall caps attached to it are retained for review.`)) return;
    onChange(walls.filter((_, i) => i !== index));
  };
  const addWall = () => onChange([
    ...walls,
    { name: `Wall ${walls.length + 1}`, heightInches: 24, mortarGapInches: 0.375, offsetFraction: 0.5 }
  ]);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("h2", { className: "font-semibold text-gray-900", children: "Masonry Walls" }),
      /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: addWall, children: [
        /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
        " Wall"
      ] })
    ] }),
    walls.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No walls on this section." }) : walls.map((wall, index) => /* @__PURE__ */ jsx(
      WallRow,
      {
        wall,
        index,
        options,
        onChange: patchWall,
        onRemove: removeWall
      },
      wall.component_id || index
    ))
  ] });
}
