import React from "react";
import { Input } from "@/components/ui/input";

const RATES = [
  { key: "concrete_cost_per_cy", label: "Concrete $/CY", def: 135 },
  { key: "rebar_cost_per_ft", label: "Rebar $/ft", def: 0.75 },
  { key: "forming_materials_cost_spread_foot", label: "Form mat. $/sqft (footing)", def: 0.5 },
  { key: "forming_materials_cost_pillar", label: "Form mat. $/sqft (pillar)", def: 0.75 },
  { key: "hand_dig_excavation_cost_per_cy", label: "Hand dig $/CY", def: 10 },
  { key: "equipment_excavation_cost_per_cy", label: "Equip. dig $/CY", def: 15 },
  { key: "min_excavation_time_hours", label: "Min excavation hrs", def: 1 },
  { key: "forming_labor_rate", label: "Forming $/hr", def: 55 },
  { key: "pouring_labor_rate", label: "Pouring $/hr", def: 60 },
  { key: "finishing_labor_rate", label: "Finishing $/hr", def: 50 },
  { key: "hand_dig_labor_rate", label: "Hand dig $/hr", def: 45 },
  { key: "equipment_excavation_labor_rate", label: "Equip. dig $/hr", def: 35 },
];

export default function FoundationRatesPanel({ project, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-900 mb-3">Rates & Defaults</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {RATES.map((r) => (
          <label key={r.key} className="text-xs text-gray-500">
            {r.label}
            <Input
              type="number"
              value={project[r.key] ?? r.def}
              onChange={(e) => onChange({ [r.key]: parseFloat(e.target.value) || 0 })}
            />
          </label>
        ))}
        <label className="text-xs text-gray-500">
          Default excavation
          <select
            value={project.excavation_method || "hand_dig"}
            onChange={(e) => onChange({ excavation_method: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            <option value="hand_dig">Hand dig</option>
            <option value="equipment_excavation">Equipment</option>
          </select>
        </label>
      </div>
    </div>
  );
}