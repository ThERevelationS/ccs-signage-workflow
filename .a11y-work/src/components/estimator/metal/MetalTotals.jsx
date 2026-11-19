import React from "react";
import { Input } from "@/components/ui/input";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const RATES = [
  { key: "fabrication_rate", label: "Fabrication $/hr", def: 65 },
  { key: "welding_rate", label: "Welding $/hr", def: 75 },
  { key: "finishing_rate", label: "Finishing $/hr", def: 55 },
  { key: "supplies_percent_of_materials", label: "Supplies % of mat.", def: 8 },
  { key: "extra_supplies_cost", label: "Extra supplies $", def: 0 },
  { key: "markup_percent", label: "Markup %", def: 0 },
];

export default function MetalTotals({ project, totals, onChange }) {
  return (
    <div className="space-y-4 sticky top-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Rates</h3>
        <div className="grid grid-cols-2 gap-3">
          {RATES.map((f) => (
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
          <div className="flex justify-between text-xs text-gray-400">
            <span>Labor hours</span>
            <span>{Number(totals.total_labor_hours || 0).toFixed(2)}</span>
          </div>
          {[
            ["Materials", totals.total_material_cost],
            ["Supplies", totals.total_supplies_cost],
            ["Fabrication", totals.total_fabrication_cost],
            ["Welding", totals.total_welding_cost],
            ["Finishing", totals.total_finishing_cost],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-900">{money(val)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-gray-100 pt-2">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-900">{money(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Markup</span>
            <span className="text-gray-900">{money(totals.markup_amount)}</span>
          </div>
          <div className="flex justify-between border-t border-red-200 pt-2 mt-2 font-bold text-lg">
            <span className="text-gray-900">Total</span>
            <span className="text-red-600">{money(totals.total_cost)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}