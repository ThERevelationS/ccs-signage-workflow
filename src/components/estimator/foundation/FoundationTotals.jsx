import { money } from "./foundationCalc";

const amt = (v) => (Number.isFinite(v) ? money(v) : "Not saved");
const known = (v, d, u) => (Number.isFinite(v) ? `${v.toFixed(d)} ${u}` : "Not saved");

export default function FoundationTotals({ totals, pricingUnavailable = false }) {
  const wallMortar = [totals.total_wall_cost, totals.total_brick_cost, totals.total_fill_cost].every(Number.isFinite)
    ? totals.total_wall_cost - totals.total_brick_cost - totals.total_fill_cost
    : null;
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
    ["Equipment", totals.total_equipment_cost],
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
      <h2 className="font-semibold text-gray-900 mb-3">Section Total</h2>
      {pricingUnavailable && <p className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">Saved/known amounts only; current pricing is incomplete.</p>}

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        {[
          ["Concrete", known(totals.total_concrete_volume_cy, 2, "CY")],
          ["Excavation", known(totals.total_excavation_volume_cy, 2, "CY")],
          ["Labor", known(totals.total_labor_hours, 1, "hr")],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-50 rounded-lg py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
            <div className="text-sm font-semibold text-gray-800">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 text-sm border-t border-gray-100 pt-3">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between text-gray-600">
            <span>{label}</span>
            <span>{amt(value)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2">
          <span>Total</span>
          <span className="text-red-600">{pricingUnavailable ? <span className="text-amber-700">Pricing unavailable</span> : money(totals.grand_total)}</span>
        </div>
      </div>
    </div>
  );
}