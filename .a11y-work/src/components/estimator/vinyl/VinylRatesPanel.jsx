import React from "react";
import { Input } from "@/components/ui/input";

const FIELDS = [
  { key: "labor_rate_per_hour", label: "Labor $/hr", def: 65 },
  { key: "print_cost_per_sqft", label: "Print $/sqft", def: 1.5 },
  { key: "supplies_percent_of_materials", label: "Supplies % of materials", def: 5 },
  { key: "extra_supplies_cost", label: "Extra supplies $", def: 0 },
  { key: "markup_percent", label: "Markup %", def: 0 },
];

export default function VinylRatesPanel({ project, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 text-sm mb-3">Rates & Markup</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {FIELDS.map((f) => (
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
  );
}