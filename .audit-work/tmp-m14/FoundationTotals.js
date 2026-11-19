import { jsx, jsxs } from "react/jsx-runtime";
import { money } from "./foundationCalc";
export default function FoundationTotals({ totals, pricingUnavailable = false }) {
  const lines = [
    ["Concrete", totals.total_concrete_cost],
    ["Rebar", totals.total_rebar_cost],
    ["Excavation", totals.total_excavation_cost],
    ["Forming materials", totals.total_forming_materials_cost],
    ["Labor", totals.total_labor_cost],
    ["Poles", totals.total_pole_cost],
    ["Pole painting", totals.total_pole_painting_cost],
    ["Wall material", totals.total_brick_cost],
    ["Internal fill wall", totals.total_fill_cost],
    ["Wall mortar + labor", wallMortar],
    ["Wall caps", totals.total_wall_cap_cost],
    ["Equipment", totals.total_equipment_cost]
  ];
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-4 sticky top-4", children: [
    /* @__PURE__ */ jsx("h2", { className: "font-semibold text-gray-900 mb-3", children: "Section Total" }),
    pricingUnavailable && /* @__PURE__ */ jsx("p", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800", children: "Saved/known amounts only; current pricing is incomplete." }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-3 gap-2 mb-3 text-center", children: [
      ["Concrete", known(totals.total_concrete_volume_cy, 2, "CY")],
      ["Excavation", known(totals.total_excavation_volume_cy, 2, "CY")],
      ["Labor", known(totals.total_labor_hours, 1, "hr")]
    ].map(([label, value]) => /* @__PURE__ */ jsxs("div", { className: "bg-slate-50 rounded-lg py-2", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] uppercase tracking-wide text-gray-400", children: label }),
      /* @__PURE__ */ jsx("div", { className: "text-sm font-semibold text-gray-800", children: value })
    ] }, label)) }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-1.5 text-sm border-t border-gray-100 pt-3", children: [
      lines.map(([label, value]) => /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-gray-600", children: [
        /* @__PURE__ */ jsx("span", { children: label }),
        /* @__PURE__ */ jsx("span", { children: amt(value) })
      ] }, label)),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2", children: [
        /* @__PURE__ */ jsx("span", { children: "Total" }),
        /* @__PURE__ */ jsx("span", { className: "text-red-600", children: pricingUnavailable ? /* @__PURE__ */ jsx("span", { className: "text-amber-700", children: "Pricing unavailable" }) : money(totals.grand_total) })
      ] })
    ] })
  ] });
}
