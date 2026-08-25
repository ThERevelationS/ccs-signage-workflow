import React from "react";
import { money } from "./foundationCalc";

export default function FoundationTotals({ totals }) {
  const lines = [
    ["Concrete", totals.total_concrete_cost],
    ["Rebar", totals.total_rebar_cost],
    ["Excavation", totals.total_excavation_cost],
    ["Forming materials", totals.total_forming_materials_cost],
    ["Labor", totals.total_labor_cost],
    ["Poles", totals.total_pole_cost],
    ["Pole painting", totals.total_pole_painting_cost],
    ["Brick / wall", totals.total_brick_cost],
    ["Fill material", totals.total_fill_cost],
    ["Masonry walls", totals.total_wall_cost],
    ["Wall caps", totals.total_wall_cap_cost],
    ["Equipment", totals.total_equipment_cost],
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
      <h2 className="font-semibold text-gray-900 mb-3">Section Total</h2>

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        {[
          ["Concrete", `${totals.total_concrete_volume_cy.toFixed(2)} CY`],
          ["Excavation", `${totals.total_excavation_volume_cy.toFixed(2)} CY`],
          ["Labor", `${totals.total_labor_hours.toFixed(1)} hr`],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-50 rounded-lg py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
            <div className="text-sm font-semibold text-gray-800">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 text-sm border-t border-gray-100 pt-3">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between text-gray-600">
            <span>{label}</span>
            <span>{money(value)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2">
          <span>Total</span>
          <span className="text-red-600">{money(totals.grand_total)}</span>
        </div>
      </div>
    </div>
  );
}