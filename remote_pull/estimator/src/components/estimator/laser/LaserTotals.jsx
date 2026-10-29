import React from "react";
import { Input } from "@/components/ui/input";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const RATES = [
  { key: "machine_rate_per_hour", label: "Cut laser $/hr", def: 100 },
  { key: "labor_rate", label: "Cut labor $/hr", def: 75 },
  { key: "engraving_machine_rate_per_hour", label: "Engrave laser $/hr", def: 80 },
  { key: "engraving_labor_rate", label: "Engrave labor $/hr", def: 40 },
  { key: "parameter_handling_time_percentage", label: "Cut handling %", def: 15 },
  { key: "engraving_handling_time_percentage", label: "Engrave handling %", def: 20 },
  { key: "fixed_setup_hours", label: "Fixed setup hrs", def: 0 },
  { key: "fixed_material_setup_cost", label: "Material setup $", def: 0 },
];

export default function LaserTotals({ project, totals, onChange }) {
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
            <span>Machine hours</span>
            <span>{Number(totals.total_machine_hours || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Handling hours</span>
            <span>{Number(totals.total_handling_hours || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Machine time</span>
            <span className="text-gray-900">{money(totals.total_machine_cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Labor &amp; handling</span>
            <span className="text-gray-900">{money(totals.total_labor_cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Material setup</span>
            <span className="text-gray-900">{money(totals.total_supplies_cost)}</span>
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