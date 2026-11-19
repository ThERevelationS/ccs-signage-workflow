import { jsx, jsxs } from "react/jsx-runtime";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
const amt = (v) => hasFoundationCostSnapshot(v) ? money(v) : "Not saved";
const cy = (v) => Number.isFinite(v) ? `${v.toFixed(2)} CY` : "Not saved";
export default function ConcreteDeliveryPanel({ project, delivery, onChange }) {
  const admixtures = project.project_concrete_admixtures || [];
  const unavailable = delivery?.pricingUnavailable === true;
  const mixes = delivery?.availableMixes || [];
  const admix = delivery?.availableAdmixes || [];
  const savedMixId = project.project_concrete_type;
  const mixMissing = savedMixId && !mixes.some((m) => m.id === savedMixId);
  const trucks = delivery?.trucksList || [];
  const toggleAdmix = (id) => onChange({
    project_concrete_admixtures: admixtures.includes(id) ? admixtures.filter((a) => a !== id) : [...admixtures, id]
  });
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [
    unavailable && /* @__PURE__ */ jsx("p", { className: "mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800", children: "Saved amounts (not current pricing)" }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsx("h3", { className: "font-semibold text-gray-900 text-sm", children: "Ready-Mix Concrete Order" }),
      /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
        /* @__PURE__ */ jsx("div", { className: "font-bold text-gray-900", children: amt(delivery?.concreteTotal) }),
        /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-gray-400", children: [
          cy(delivery?.roundedYards),
          " \xB7 ",
          amt(delivery?.ratePerYard),
          "/CY"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 block", children: [
      "Mix strength",
      /* @__PURE__ */ jsxs(
        "select",
        {
          value: savedMixId || "4000_ae",
          disabled: unavailable,
          onChange: (e) => onChange({ project_concrete_type: e.target.value }),
          className: "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:opacity-60",
          children: [
            mixMissing && /* @__PURE__ */ jsxs("option", { value: savedMixId, disabled: true, children: [
              "Catalog mix unavailable (",
              savedMixId,
              ")"
            ] }),
            mixes.map((m) => /* @__PURE__ */ jsxs("option", { value: m.id, children: [
              m.name,
              " \u2014 ",
              money(m.price),
              "/CY"
            ] }, m.id))
          ]
        }
      )
    ] }),
    !mixMissing && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-400 mt-1", children: mixes.find((m) => m.id === (savedMixId || "4000_ae"))?.desc }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 pt-3 border-t border-gray-100", children: [
      /* @__PURE__ */ jsx("div", { className: "text-xs font-medium text-gray-700 mb-2", children: "Admixtures" }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        admixtures.filter((id) => !admix.some((a) => a.id === id)).map((id) => /* @__PURE__ */ jsxs("div", { className: "text-xs text-amber-700", children: [
          "Catalog admixture unavailable (",
          id,
          ")"
        ] }, id)),
        admix.map((a) => /* @__PURE__ */ jsxs("label", { className: `flex gap-2 items-start text-xs ${unavailable ? "text-gray-400" : "text-gray-600"}`, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              className: "mt-0.5",
              disabled: unavailable,
              checked: admixtures.includes(a.id),
              onChange: () => toggleAdmix(a.id)
            }
          ),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-800", children: a.name }),
            " \u2014 ",
            money(a.price),
            "/CY",
            /* @__PURE__ */ jsx("span", { className: "block text-[11px] text-gray-400", children: a.desc })
          ] })
        ] }, a.id))
      ] })
    ] }),
    trucks.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-3 pt-3 border-t border-gray-100 space-y-1", children: [
      trucks.map((t, i) => /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-xs text-gray-600", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "Truck ",
          i + 1,
          " \u2014 ",
          cy(t.roundedYards),
          Number.isFinite(t.smallOrderFee) && t.smallOrderFee > 0 && ` (small load ${money(t.smallOrderFee)})`,
          Number.isFinite(t.fuelFee) && t.fuelFee > 0 && ` + fuel ${money(t.fuelFee)}`
        ] }),
        /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-800", children: amt(t.cost) })
      ] }, i)),
      (delivery?.additionalStopsCost ?? 0) > 0 && /* @__PURE__ */ jsxs("div", { className: "flex justify-between text-xs text-gray-600", children: [
        /* @__PURE__ */ jsx("span", { children: "Additional sign locations / stops" }),
        /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-800", children: amt(delivery.additionalStopsCost) })
      ] })
    ] })
  ] });
}
