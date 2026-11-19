import { jsx, jsxs } from "react/jsx-runtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
export default function FoundationPolesPanel({ poles = [], options = [], items = [], onChange }) {
  const patchPole = (index, changes) => onChange(poles.map((p, i) => i === index ? { ...p, ...changes } : p));
  const removePole = (index) => {
    if (!window.confirm(`Remove Pole ${index + 1}? Cabinets mounted on it are retained for review.`)) return;
    onChange(poles.filter((_, i) => i !== index));
  };
  const addPole = () => onChange([
    ...poles,
    { pole_id: options[0]?.id || "", height_inches: 120, y_offset_inches: 42, include_pole_painting: false }
  ]);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { className: "font-semibold text-gray-900", children: "Poles" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500", children: "Priced on total length \u2014 height above grade plus depth in the ground." })
      ] }),
      /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: addPole, disabled: options.length === 0, children: [
        /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
        " Pole"
      ] })
    ] }),
    options.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: "Pole catalog unavailable \u2014 existing rows remain editable; new poles cannot be added." }),
    poles.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No poles on this section." }) : poles.map((pole, index) => /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-2 items-end", children: [
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
          "Pole",
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: pole.pole_id || "",
              "aria-label": "Pole material",
              onChange: (e) => patchPole(index, { pole_id: e.target.value }),
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Select pole\u2026" }),
                pole.pole_id && !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx("option", { value: pole.pole_id, disabled: true, children: `Catalog pole unavailable (${pole.pole_id})` }),
                options.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.material_name }, o.id))
              ]
            }
          ),
          pole.pole_id && !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog pole unavailable; current pricing needs review." })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Height above grade (in)",
          /* @__PURE__ */ jsx(
            Input,
            {
              type: "number",
              value: pole.height_inches ?? 0,
              onChange: (e) => patchPole(index, { height_inches: num(e.target.value) })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Depth in ground (in)",
          /* @__PURE__ */ jsx(
            Input,
            {
              type: "number",
              value: pole.y_offset_inches ?? 0,
              onChange: (e) => patchPole(index, { y_offset_inches: num(e.target.value) })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
          "Foundation",
          /* @__PURE__ */ jsxs(
            "select",
            {
              className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
              value: pole.foundation_component_id ?? "",
              "aria-label": "Pole foundation",
              onChange: (e) => {
                const id = e.target.value;
                const i = items.findIndex((it) => it.component_id === id);
                patchPole(index, {
                  foundation_component_id: id,
                  foundation_idx: id === "" || i < 0 ? void 0 : i
                });
              },
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Unassigned" }),
                pole.foundation_component_id && !items.some((it) => it.component_id === pole.foundation_component_id) && /* @__PURE__ */ jsx("option", { value: pole.foundation_component_id, disabled: true, children: `Missing foundation (${String(pole.foundation_component_id).slice(0, 18)}\u2026)` }),
                items.map((it, i) => /* @__PURE__ */ jsx("option", { value: it.component_id || "", children: it.description || `Foundation ${i + 1}` }, it.component_id || i))
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mt-2", children: [
        /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-gray-700", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              checked: !!pole.include_pole_painting,
              onChange: (e) => patchPole(index, { include_pole_painting: e.target.checked })
            }
          ),
          "Paint pole"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 text-xs text-gray-600", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            "Pole ",
            hasFoundationCostSnapshot(pole.pole_cost) ? money(pole.pole_cost) : "Not saved"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "Paint ",
            hasFoundationCostSnapshot(pole.pole_painting_cost) ? money(pole.pole_painting_cost) : "Not saved"
          ] }),
          /* @__PURE__ */ jsx("span", { className: "font-bold text-gray-900 text-sm", children: hasFoundationCostSnapshot(pole.total_cost) ? money(pole.total_cost) : "Not saved" }),
          !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx("span", { className: "col-span-full text-[10px] text-amber-700", children: "Saved amounts (not current pricing)" }),
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => removePole(index), children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
        ] })
      ] })
    ] }, pole.component_id || index))
  ] });
}
