import React from "react";
import { Input } from "@/components/ui/input";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const RATES = [
  { key: "machine_rate_per_hour", label: "Machine $/hr", def: 75 },
  { key: "labor_rate", label: "Labor $/hr", def: 45 },
  { key: "setup_time_percentage", label: "Setup % of run", def: 20 },
  { key: "fixed_setup_hours", label: "Fixed setup hrs", def: 0 },
];

export default function CNCTotals({ project, totals, onChange }) {
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
            <span>Setup hours</span>
            <span>{Number(totals.total_setup_hours || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Machine time</span>
            <span className="text-gray-900">{money(totals.total_machine_cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Labor &amp; setup</span>
            <span className="text-gray-900">{money(totals.total_labor_cost)}</span>
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