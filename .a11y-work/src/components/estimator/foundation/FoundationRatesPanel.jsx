import React from "react";

// These are the rates the ported SignEstimate Pro math actually reads (Settings keys).
// They are shop-wide, so they are shown here read-only — edit them in Estimator Settings.
const RATES = [
  { key: "foundation_main_labor_rate", label: "Main labor $/hr", def: 60 },
  { key: "foundation_pouring_cost_per_cy", label: "Pouring $/CY", def: 15 },
  { key: "foundation_forming_cost_per_sqft", label: "Forming labor $/sqft", def: 2.5 },
  { key: "foundation_finishing_cost_per_sqft", label: "Finishing $/sqft", def: 1.25 },
  { key: "foundation_forming_materials_spread_foot", label: "Form mat. mult. (footing)", def: 0.5 },
  { key: "foundation_forming_materials_pillar", label: "Form mat. mult. (pillar)", def: 0.75 },
  { key: "foundation_rebar_time_cross_section", label: "Rebar hrs / intersection", def: 0.05 },
  { key: "foundation_rebar_time_linear_ft", label: "Rebar hrs / LF", def: 0.02 },
  { key: "foundation_hand_dig_time_per_cy", label: "Hand dig hrs/CY", def: 2.0 },
  { key: "foundation_equipment_excavation_time_per_cy", label: "Equip. dig hrs/CY", def: 0.5 },
  { key: "wall_labor_rate", label: "Wall labor $/sqft", def: 45 },
  { key: "wall_mortar_cost_per_bag", label: "Mortar $/bag", def: 10 },
];

export default function FoundationRatesPanel({ settings = {}, project, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Rates in Use</h2>
        <span className="text-xs text-gray-400">Shop-wide — change in Estimator Settings</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {RATES.map((r) => (
          <div key={r.key} className="bg-slate-50 rounded-lg px-2 py-1.5">
            <div className="text-[11px] text-gray-400">{r.label}</div>
            <div className="text-sm font-semibold text-gray-800">
              {settings[r.key] ?? r.def}
            </div>
          </div>
        ))}
      </div>

      <label className="text-xs text-gray-500 block mt-3 max-w-[220px]">
        Default excavation method
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
  );
}