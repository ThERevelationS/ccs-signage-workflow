import React, { useMemo } from "react";
import { money } from "./foundationCalc";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const qty = (n, unit) => `${num(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;

export default function FoundationBOM({ items = [], delivery, totals = {}, inventory = [] }) {
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
    items.forEach((i) => {
      if (!i.selected_pole_id || num(i.pole_cost) <= 0) return;
      const key = i.selected_pole_id;
      poleGroups[key] = poleGroups[key] || { ft: 0, cost: 0 };
      poleGroups[key].ft += (num(i.pole_total_height_inches) / 12) * num(i.quantity);
      poleGroups[key].cost += num(i.pole_cost);
    });
    Object.entries(poleGroups).forEach(([id, g]) => add(nameOf(id), qty(g.ft, "LF"), g.cost));

    if (num(totals.total_pole_painting_cost) > 0) {
      add("Pole painting", "—", totals.total_pole_painting_cost);
    }

    const brickGroups = {};
    items.forEach((i) => {
      if (!i.selected_brick_id || num(i.brick_count) <= 0) return;
      brickGroups[i.selected_brick_id] = brickGroups[i.selected_brick_id] || { count: 0, cost: 0 };
      brickGroups[i.selected_brick_id].count += num(i.brick_count);
      brickGroups[i.selected_brick_id].cost += num(i.brick_cost);
    });
    Object.entries(brickGroups).forEach(([id, g]) => add(nameOf(id), qty(g.count, "units"), g.cost));

    const fillGroups = {};
    items.forEach((i) => {
      if (!i.selected_fill_material_id || num(i.fill_cost) <= 0) return;
      fillGroups[i.selected_fill_material_id] =
        fillGroups[i.selected_fill_material_id] || { cy: 0, cost: 0 };
      fillGroups[i.selected_fill_material_id].cy += num(i.fill_volume_cy);
      fillGroups[i.selected_fill_material_id].cost += num(i.fill_cost);
    });
    Object.entries(fillGroups).forEach(([id, g]) => add(nameOf(id), qty(g.cy, "CY"), g.cost));

    return out;
  }, [items, delivery, totals, inventory]);

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