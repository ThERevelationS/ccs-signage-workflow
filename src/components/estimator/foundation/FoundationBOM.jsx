import { useMemo } from "react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { foundationWallBomRows } from "./wallCalculator";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const qty = (n, unit) => `${num(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
const EMPTY_ITEMS = [];
const EMPTY_POLES = [];
const EMPTY_WALLS = [];
const EMPTY_TOTALS = {};
const EMPTY_INVENTORY = [];

export default function FoundationBOM({
  items = EMPTY_ITEMS,
  poles = EMPTY_POLES,
  walls = EMPTY_WALLS,
  delivery,
  totals = EMPTY_TOTALS,
  inventory = EMPTY_INVENTORY,
  itemPricing = EMPTY_ITEMS,
  polePricing = EMPTY_ITEMS,
  wallPricing = EMPTY_ITEMS,
  pricingUnavailable = false,
}) {
  const rows = useMemo(() => {
    const out = [];
    // rawQty is the real numeric quantity; displayQty is the formatted label.
    // A row with a positive quantity OR a known cost stays listed (free rows
    // included) — the formatted string is never parsed for the drop test.
    const add = (material, displayQty, cost, rawQty = num(displayQty)) => {
      if (num(rawQty) <= 0 && !hasFoundationCostSnapshot(cost)) return;
      out.push({ material, quantity: displayQty, cost });
    };
    const nameOf = (id) => inventory.find((i) => i.id === id)?.material_name || "Material";
    const resolved = items.filter((_, i) => itemPricing[i]?.available !== false);
    const blocked = items.filter((_, i) => itemPricing[i]?.available === false);

    if (delivery?.pricingUnavailable) {
      out.push({
        material: "Concrete delivery/order (saved)",
        quantity: Number.isFinite(delivery.roundedYards) ? qty(delivery.roundedYards, "CY") : "Not saved",
        cost: hasFoundationCostSnapshot(delivery.concreteTotal) ? delivery.concreteTotal : "Not saved",
        saved: true,
      });
    } else if (num(delivery?.roundedYards) > 0) {
      add("Ready-mix concrete (delivered)", qty(delivery.roundedYards, "CY"), delivery.concreteTotal, delivery.roundedYards);
    }
    const bags = resolved.reduce((s, i) => s + num(i.concrete_bags), 0);
    const baggedCost = resolved.reduce((s, i) => s + num(i.concrete_cost), 0);
    if (bags > 0 || baggedCost > 0) add("Bagged concrete", qty(bags, "bags"), baggedCost, bags);

    const rebarFt = resolved.reduce((s, i) => s + num(i.rebar_feet), 0);
    const rebarLbs = resolved.reduce((s, i) => s + num(i.rebar_weight_lbs), 0);
    const rebarCost = resolved.reduce((s, i) => s + num(i.rebar_cost), 0);
    if (rebarFt > 0) {
      add(`Rebar (${qty(rebarLbs, "lbs")})`, qty(rebarFt, "LF"), rebarCost, rebarFt);
    }

    const formingQty = resolved.reduce((s, i) => s + num(i.forming_qty), 0);
    const formingCost = resolved.reduce((s, i) => s + num(i.forming_cost), 0);
    if (formingQty > 0) add("Forming material", qty(formingQty, "units"), formingCost, formingQty);

    blocked.forEach((i) => {
      const label = `Foundation ${i.component_id ?? "?"} (saved)`;
      {
        out.push({
          material: `${label} — concrete`,
          quantity: Number.isFinite(i.concrete_bags) ? qty(i.concrete_bags, "bags") : "Not saved",
          cost: hasFoundationCostSnapshot(i.concrete_cost) ? i.concrete_cost : "Not saved",
          saved: true,
        });
      }
      if (i.include_rebar) {
        out.push({
          material: `${label} — rebar`,
          quantity: Number.isFinite(i.rebar_feet) ? qty(i.rebar_feet, "LF") : "Not saved",
          cost: hasFoundationCostSnapshot(i.rebar_cost) ? i.rebar_cost : "Not saved",
          saved: true,
        });
      }
      if (i.include_forming) {
        out.push({
          material: `${label} — forming`,
          quantity: Number.isFinite(i.forming_qty) ? qty(i.forming_qty, "units") : "Not saved",
          cost: hasFoundationCostSnapshot(i.forming_cost) ? i.forming_cost : "Not saved",
          saved: true,
        });
      }
    });

    const poleGroups = {};
    poles.forEach((p, index) => {
      // Held poles list their acknowledged amounts separately, never dropped.
      if (polePricing[index]?.available === false) return;
      if (!p.pole_id) return;
      poleGroups[p.pole_id] = poleGroups[p.pole_id] || { ft: 0, cost: 0 };
      poleGroups[p.pole_id].ft += (num(p.height_inches) + num(p.y_offset_inches)) / 12;
      poleGroups[p.pole_id].cost += num(p.pole_cost);
    });
    Object.entries(poleGroups).forEach(([id, g]) => add(nameOf(id), qty(g.ft, "LF"), g.cost, g.ft));

    const polePainting = poles.reduce((s, p, index) =>
      polePricing[index]?.available === false ? s : s + num(p.pole_painting_cost), 0);
    if (polePainting > 0) {
      add("Pole painting", "—", polePainting);
    }

    const savedPoleFt = (p) => {
      const h = Number(p.height_inches), d = Number(p.y_offset_inches);
      return Number.isFinite(h) && h > 0 && Number.isFinite(d) && d >= 0 ? (h + d) / 12 : null;
    };
    poles.forEach((p, index) => {
      if (polePricing[index]?.available !== false) return;
      const label = `Pole ${index + 1} (saved)`;
      const ft = savedPoleFt(p);
      out.push({
        material: `${label} — pole`,
        quantity: Number.isFinite(ft) ? qty(ft, "LF") : "Not saved",
        cost: hasFoundationCostSnapshot(p.pole_cost) ? p.pole_cost : "Not saved",
        saved: true,
      });
      if (p.include_pole_painting || hasFoundationCostSnapshot(p.pole_painting_cost)) {
        out.push({
          material: `${label} — painting`,
          quantity: "—",
          cost: hasFoundationCostSnapshot(p.pole_painting_cost) ? p.pole_painting_cost : "Not saved",
          saved: true,
        });
      }
    });

    out.push(...foundationWallBomRows(walls, inventory, wallPricing));

    (totals.wall_caps_by_material || []).forEach((g) => add(g.name || "Wall cap", qty(g.qty, "pcs"), g.cost, g.qty));

    return out;
  }, [items, poles, walls, delivery, totals, inventory, itemPricing, polePricing, wallPricing]);

  const materialTotal = rows.every(r => hasFoundationCostSnapshot(r.cost)) ? rows.reduce((sum, row) => sum + row.cost, 0) : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Bill of Materials</h3>
      {pricingUnavailable && (
        <div className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1">
          <p className="text-[11px] font-semibold text-amber-800">Pricing unavailable — saved quantities may be outdated.</p>
          {itemPricing.filter(p => p && p.available === false)
            .concat(polePricing.filter(p => p && p.available === false))
            .flatMap((p, k) =>
            (p.issues || []).map((i, j) => <p key={`${k}-${j}`} className="text-[10px] text-amber-700">{i.message}</p>)
          )}
        </div>
      )}
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
                  <td className="py-1.5 pr-3 text-gray-800">{r.material}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-gray-600">{r.quantity}</td>
                  <td className="py-1.5 pl-3 whitespace-nowrap text-right text-gray-900">{hasFoundationCostSnapshot(r.cost) ? money(r.cost) : "Not saved"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between pt-3 mt-1 border-t border-gray-200 font-bold text-gray-900">
            <span>Listed cost subtotal</span>
            <span>{pricingUnavailable ? <span className="text-amber-700">Pricing unavailable</span> : hasFoundationCostSnapshot(materialTotal) ? money(materialTotal) : "Not saved"}</span>
          </div>
        </>
      )}
    </div>
  );
}