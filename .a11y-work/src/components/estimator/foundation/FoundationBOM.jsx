import React, { useMemo } from "react";
import { money } from "./foundationCalc";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const qty = (n, unit) => `${num(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;

export default function FoundationBOM({
  items = [],
  poles = [],
  walls = [],
  delivery,
  totals = {},
  inventory = [],
}) {
  const rows = useMemo(() => {
    const out = [];
    const add = (material, quantity, cost) => {
      if (num(quantity) <= 0 && num(cost) <= 0) return;
      out.push({ material, quantity, cost });
    };
    const nameOf = (id) => inventory.find((i) => i.id === id)?.material_name || "Material";

    if (num(delivery?.roundedYards) > 0) {
      add("Ready-mix concrete (delivered)", qty(delivery.roundedYards, "CY"), delivery.concreteTotal);
    }
    const bags = items.reduce((s, i) => s + num(i.concrete_bags), 0);
    const baggedCost = items.reduce((s, i) => s + num(i.concrete_cost), 0);
    if (bags > 0) add("Bagged concrete", qty(bags, "bags"), baggedCost);

    const rebarFt = items.reduce((s, i) => s + num(i.rebar_feet), 0);
    const rebarLbs = items.reduce((s, i) => s + num(i.rebar_weight_lbs), 0);
    if (rebarFt > 0) {
      add(`Rebar (${qty(rebarLbs, "lbs")})`, qty(rebarFt, "LF"), totals.total_rebar_cost);
    }

    const formingQty = items.reduce((s, i) => s + num(i.forming_qty), 0);
    if (formingQty > 0) add("Forming material", qty(formingQty, "units"), totals.total_forming_materials_cost);

    const poleGroups = {};
    poles.forEach((p) => {
      if (!p.pole_id || num(p.pole_cost) <= 0) return;
      poleGroups[p.pole_id] = poleGroups[p.pole_id] || { ft: 0, cost: 0 };
      poleGroups[p.pole_id].ft += (num(p.height_inches) + num(p.y_offset_inches)) / 12;
      poleGroups[p.pole_id].cost += num(p.pole_cost);
    });
    Object.entries(poleGroups).forEach(([id, g]) => add(nameOf(id), qty(g.ft, "LF"), g.cost));

    if (num(totals.total_pole_painting_cost) > 0) {
      add("Pole painting", "—", totals.total_pole_painting_cost);
    }

    walls.forEach((w, i) => {
      const c = w.calculatedCosts || {};
      const label = w.name || `Wall ${i + 1}`;
      if (num(c.materialCost) > 0) add(`${label} — ${nameOf(w.materialId)}`, qty(c.totalBricks, "units"), c.materialCost);
      if (num(c.mortarCost) > 0) add(`${label} — mortar`, "—", c.mortarCost);
      if (num(c.internalMaterialCost) > 0) {
        add(
          `${label} — ${nameOf(w.internalMaterialId)} (internal)`,
          qty(c.internalTotalBricks, "units"),
          c.internalMaterialCost
        );
      }
      if (num(c.internalMortarCost) > 0) add(`${label} — internal mortar`, "—", c.internalMortarCost);
    });

    (totals.wall_caps_by_material || []).forEach((g) => add(g.name || "Wall cap", qty(g.qty, "pcs"), g.cost));

    return out;
  }, [items, poles, walls, delivery, totals, inventory]);

  const materialTotal = rows.reduce((s, r) => s + num(r.cost), 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Bill of Materials</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No materials yet — add a foundation to build the list.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-1.5">Material</th>
                <th className="py-1.5">Quantity</th>
                <th className="py-1.5 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 text-gray-800">{r.material}</td>
                  <td className="py-1.5 text-gray-600">{r.quantity}</td>
                  <td className="py-1.5 text-right text-gray-900">{money(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between pt-3 mt-1 border-t border-gray-200 font-bold text-gray-900">
            <span>Material total</span>
            <span>{money(materialTotal)}</span>
          </div>
        </>
      )}
    </div>
  );
}