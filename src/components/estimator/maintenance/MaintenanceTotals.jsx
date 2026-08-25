import React from "react";
import { Input } from "@/components/ui/input";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const RATE_FIELDS = [
  { key: "labor_rate_per_hour", label: "Labor $/hr", def: 85 },
  { key: "travel_miles_round_trip", label: "Travel miles (RT)", def: 0 },
  { key: "travel_cost_per_mile", label: "Travel $/mile", def: 1.25 },
  { key: "supplies_percent_of_materials", label: "Supplies %", def: 10 },
  { key: "extra_supplies_cost", label: "Extra supplies $", def: 0 },
  { key: "markup_percent", label: "Markup %", def: 0 },
];

const ROWS = [
  ["Labor", "labor_cost"],
  ["Materials", "total_materials_cost"],
  ["Supplies", "total_supplies_cost"],
  ["Equipment", "total_equipment_cost"],
  ["Travel", "total_travel_cost"],
];

export default function MaintenanceTotals({ project, totals, onChange }) {
  return (
    <div className="space-y-4 sticky top-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Rates</h3>
        <div className="grid grid-cols-2 gap-3">
          {RATE_FIELDS.map((f) => (
            <label key={f.key} className="text-xs text-gray-500">
              {f.label}
              <Input
                type="number"
                value={project[f.key] ?? f.def}
                onChange={(e) => onChange({ [f.key]: parseFloat(e.target.value) || 0 })}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Section Total</h3>
        <div className="space-y-1.5 text-sm">
          {ROWS.map(([label, key]) => (
            <div key={key} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-900">{money(totals[key])}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs text-gray-400 pt-1">
            <span>Labor hours</span>
            <span>{Number(totals.labor_hours || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-900">{money(totals.subtotal)}</span>
          </div>
          {totals.markup_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Markup</span>
              <span className="text-gray-900">{money(totals.markup_amount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-red-200 pt-2 mt-2 font-bold text-lg">
            <span className="text-gray-900">Total</span>
            <span className="text-red-600">{money(totals.total_cost)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}