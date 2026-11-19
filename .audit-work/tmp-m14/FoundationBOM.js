import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const qty = (n, unit) => `${num(n).toLocaleString(void 0, { maximumFractionDigits: 2 })} ${unit}`;
const EMPTY_ITEMS = [];
const EMPTY_POLES = [];
const EMPTY_WALLS = [];
const EMPTY_TOTALS = [];
const EMPTY_INVENTORY = [];
export default function FoundationBOM({
  items = EMPTY_ITEMS,
  poles = EMPTY_POLES,
  walls = EMPTY_WALLS,
  delivery,
  totals = EMPTY_TOTALS,
  inventory = EMPTY_INVENTORY,
  itemPricing = EMPTY_ITEMS,
  pricingUnavailable = false
}) {
  const rows = useMemo(() => {
    const out = [];
    const add = (material, displayQty, cost, rawQty = num(displayQty)) => {
      if (num(rawQty) <= 0 && !hasFoundationCostSnapshot(cost)) return;
      out.push({ material, quantity: displayQty, cost });
    };
    const nameOf = (id) => inventory.find((i) => i.id === id)?.material_name || "Material";
    const resolved = items.filter((_, i) => itemPricing[i]?.available !== false);
    const blocked = items.filter((_, i) => itemPricing[i]?.available === false);
    if (delivery?.pricingUnavailable) {
      out.push({
        material: "Ready-mix concrete (delivered) \u2014 saved",
        quantity: Number.isFinite(delivery.roundedYards) ? qty(delivery.roundedYards, "CY") : "Not saved",
        cost: hasFoundationCostSnapshot(delivery.concreteTotal) ? delivery.concreteTotal : "Not saved",
        saved: true
      });
    } else if (num(delivery?.roundedYards) > 0) {
      add("Ready-mix concrete (delivered)", qty(delivery.roundedYards, "CY"), delivery.concreteTotal, delivery.roundedYards);
    }
    const bags = resolved.reduce((s, i) => s + num(i.concrete_bags), 0);
    const baggedCost = resolved.reduce((s, i) => s + num(i.concrete_cost), 0);
    if (bags > 0 || hasFoundationCostSnapshot(baggedCost)) add("Bagged concrete", qty(bags, "bags"), baggedCost, bags);
    const rebarFt = resolved.reduce((s, i) => s + num(i.rebar_feet), 0);
    const rebarLbs = resolved.reduce((s, i) => s + num(i.rebar_weight_lbs), 0);
    if (rebarFt > 0) {
      add(`Rebar (${qty(rebarLbs, "lbs")})`, qty(rebarFt, "LF"), totals.total_rebar_cost, rebarFt);
    }
    const formingQty = resolved.reduce((s, i) => s + num(i.forming_qty), 0);
    if (formingQty > 0) add("Forming material", qty(formingQty, "units"), totals.total_forming_materials_cost, formingQty);
    blocked.forEach((i) => {
      const label = `Foundation ${i.component_id ?? "?"} (saved)`;
      if (i.selected_concrete_id || i.concrete_bags || hasFoundationCostSnapshot(i.concrete_cost)) {
        out.push({
          material: `${label} \u2014 concrete`,
          quantity: Number.isFinite(i.concrete_bags) ? qty(i.concrete_bags, "bags") : "Not saved",
          cost: hasFoundationCostSnapshot(i.concrete_cost) ? i.concrete_cost : "Not saved",
          saved: true
        });
      }
      if (i.include_rebar) {
        out.push({
          material: `${label} \u2014 rebar`,
          quantity: Number.isFinite(i.rebar_feet) ? qty(i.rebar_feet, "LF") : "Not saved",
          cost: hasFoundationCostSnapshot(i.rebar_cost) ? i.rebar_cost : "Not saved",
          saved: true
        });
      }
      if (i.include_forming) {
        out.push({
          material: `${label} \u2014 forming`,
          quantity: Number.isFinite(i.forming_qty) ? qty(i.forming_qty, "units") : "Not saved",
          cost: hasFoundationCostSnapshot(i.forming_cost) ? i.forming_cost : "Not saved",
          saved: true
        });
      }
    });
    const poleGroups = {};
    poles.forEach((p) => {
      if (!p.pole_id || num(p.pole_cost) <= 0) return;
      poleGroups[p.pole_id] = poleGroups[p.pole_id] || { ft: 0, cost: 0 };
      poleGroups[p.pole_id].ft += (num(p.height_inches) + num(p.y_offset_inches)) / 12;
      poleGroups[p.pole_id].cost += num(p.pole_cost);
    });
    Object.entries(poleGroups).forEach(([id, g]) => add(nameOf(id), qty(g.ft, "LF"), g.cost));
    if (num(totals.total_pole_painting_cost) > 0) {
      add("Pole painting", "\u2014", totals.total_pole_painting_cost);
    }
    walls.forEach((w, i) => {
      const c = w.calculatedCosts || {};
      const label = w.name || `Wall ${i + 1}`;
      if (num(c.materialCost) > 0) add(`${label} \u2014 ${nameOf(w.materialId)}`, qty(c.totalBricks, "units"), c.materialCost);
      if (num(c.mortarCost) > 0) add(`${label} \u2014 mortar`, "\u2014", c.mortarCost);
      if (num(c.internalMaterialCost) > 0) {
        add(
          `${label} \u2014 ${nameOf(w.internalMaterialId)} (internal)`,
          qty(c.internalTotalBricks, "units"),
          c.internalMaterialCost
        );
      }
      if (num(c.internalMortarCost) > 0) add(`${label} \u2014 internal mortar`, "\u2014", c.internalMortarCost);
    });
    (totals.wall_caps_by_material || []).forEach((g) => add(g.name || "Wall cap", qty(g.qty, "pcs"), g.cost, g.qty));
    return out;
  }, [items, poles, walls, delivery, totals, inventory, itemPricing]);
  const materialTotal = rows.reduce((s, r) => s + num(r.cost), 0);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [
    /* @__PURE__ */ jsx("h3", { className: "font-semibold text-gray-900 mb-3", children: "Bill of Materials" }),
    rows.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500", children: "No materials yet \u2014 add a foundation to build the list." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "text-left text-xs text-gray-500 border-b border-gray-200", children: [
          /* @__PURE__ */ jsx("th", { className: "py-1.5", children: "Material" }),
          /* @__PURE__ */ jsx("th", { className: "py-1.5", children: "Quantity" }),
          /* @__PURE__ */ jsx("th", { className: "py-1.5 text-right", children: "Cost" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: rows.map((r, i) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-gray-100 last:border-0", children: [
          /* @__PURE__ */ jsx("td", { className: "py-1.5 text-gray-800", children: r.material }),
          /* @__PURE__ */ jsx("td", { className: "py-1.5 text-gray-600", children: r.quantity }),
          /* @__PURE__ */ jsx("td", { className: "py-1.5 text-right text-gray-900", children: hasFoundationCostSnapshot(r.cost) ? money(r.cost) : "Not saved" })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between pt-3 mt-1 border-t border-gray-200 font-bold text-gray-900", children: [
        /* @__PURE__ */ jsx("span", { children: "Listed cost subtotal" }),
        /* @__PURE__ */ jsx("span", { children: pricingUnavailable ? /* @__PURE__ */ jsx("span", { className: "text-amber-700", children: "Pricing unavailable" }) : money(materialTotal) })
      ] })
    ] })
  ] });
}
