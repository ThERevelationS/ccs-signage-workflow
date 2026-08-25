import React from "react";
import { Input } from "@/components/ui/input";

const selectCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

const FIELDS = [
  { key: "bricks_along_length", label: "Bricks along length", def: 6 },
  { key: "bricks_along_width", label: "Bricks along width", def: 9 },
  { key: "courses_high", label: "Courses high", def: 5 },
  { key: "layers", label: "Layers (depth)", def: 1 },
  { key: "mortar_gap", label: 'Mortar gap (in)', def: 0.375, step: "0.0625" },
  { key: "waste_factor", label: "Waste factor", def: 1.1, step: "0.01" },
];

export default function BrickGeometryPanel({ project, materials, derived, onChange }) {
  const material = materials.find((m) => m.id === project.selected_material_id);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-900">Masonry Base</h2>

      <label className="text-xs text-gray-500 block">
        Brick / stone
        <select
          value={project.selected_material_id || ""}
          onChange={(e) => {
            const m = materials.find((x) => x.id === e.target.value);
            onChange({
              selected_material_id: e.target.value,
              material_name: m?.material_name || "",
              material_dimensions: m
                ? { length: m.length, width: m.width, height: m.height }
                : undefined,
            });
          }}
          className={selectCls}
        >
          <option value="">— select material —</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.material_name} — {m.length}×{m.width}×{m.height}" · $
              {Number(m.cost_per_unit || 0).toFixed(2)}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-gray-500">
            {f.label}
            <Input
              type="number"
              step={f.step}
              value={project[f.key] ?? f.def}
              onChange={(e) => onChange({ [f.key]: parseFloat(e.target.value) || 0 })}
            />
          </label>
        ))}
      </div>

      {material ? (
        <div className="text-xs text-gray-500 border-t border-gray-100 pt-2 space-y-1">
          <div>
            Derived footprint: {derived.derived_length.toFixed(1)}" ×{" "}
            {derived.derived_width.toFixed(1)}" × {derived.derived_height.toFixed(1)}" high
          </div>
          <div>
            {derived.bricks_per_course} per course · {derived.calculated_bricks} total (with waste) ·{" "}
            {derived.calculated_surface_area.toFixed(1)} sq ft face
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-600 border-t border-gray-100 pt-2">
          Select a brick or stone to calculate quantities.
        </p>
      )}
    </div>
  );
}