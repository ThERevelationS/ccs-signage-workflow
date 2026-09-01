import React from "react";
import { WALL_MATERIALS } from "./wallMaterials";

export default function WallMaterialPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {WALL_MATERIALS.map((m) => {
        const selected = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`text-left rounded-lg border px-3 py-2 transition-all ${
              selected
                ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className={`text-xs font-semibold leading-tight ${selected ? "text-purple-900" : "text-slate-800"}`}>
              {m.label}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
              {m.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}