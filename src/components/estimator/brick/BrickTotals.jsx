import React from "react";
import { Input } from "@/components/ui/input";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const RATES = [
  { key: "mortar_bag_cost", label: "Mortar bag $", def: 12 },
  { key: "bricks_per_hour", label: "Bricks laid /hr", def: 40 },
  { key: "labor_rate_per_hour", label: "Mason $/hr", def: 55 },
  { key: "markup_percent", label: "Markup %", def: 0 },
];

export default function BrickTotals({ project, totals, onChange }) {
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
            <span>Bricks / stones</span>
            <span>{totals.calculated_bricks}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Mortar bags</span>
            <span>{totals.mortar_bags_needed}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Labor hours</span>
            <span>{totals.labor_hours.toFixed(2)}</span>
          </div>
          {[
            ["Material", totals.material_cost],
            ["Mortar", totals.mortar_cost],
            ["Labor", totals.labor_cost],
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