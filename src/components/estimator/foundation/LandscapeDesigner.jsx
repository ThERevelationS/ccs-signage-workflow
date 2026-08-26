import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  LANDSCAPE_MATERIALS,
  GRID_COLS,
  GRID_ROWS,
  landscapeSummary,
  materialByKey,
} from "./landscapeMaterials";
import { money } from "./foundationCalc";

export default function LandscapeDesigner({ landscape, onChange }) {
  const [brush, setBrush] = useState("grass");
  const [painting, setPainting] = useState(false);
  const cells = landscape?.cells || {};
  const summary = landscapeSummary(landscape);

  const paint = (x, y) => {
    const key = `${x},${y}`;
    const next = { ...cells };
    if (brush === "dirt") delete next[key];
    else next[key] = brush;
    onChange({ cell_size_inches: landscape?.cell_size_inches || 12, cells: next });
  };

  return (
    <div className="bg-white rounded-sm border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900">Landscape Designer</h3>
          <p className="text-[11px] text-gray-400">
            Draw landscaping features, paths and site boundaries. Each cell is 1 sq ft.
          </p>
        </div>
        <button
          onClick={() => onChange({ cell_size_inches: 12, cells: {} })}
          className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-600 hover:bg-gray-50"
        >
          <Trash2 className="w-3 h-3" /> Clear
        </button>
      </div>

      <div className="flex gap-3 items-start">
        <div className="w-[120px] flex-shrink-0 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Materials</div>
          {LANDSCAPE_MATERIALS.map((m) => (
            <button
              key={m.key}
              onClick={() => setBrush(m.key)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded-sm border text-[11px] ${
                brush === m.key ? "border-red-400 bg-red-50 font-semibold" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className="w-3 h-3 rounded-sm" style={{ background: m.color }} />
              <span className="truncate text-gray-700">{m.label}</span>
            </button>
          ))}
        </div>

        <div
          className="flex-1 overflow-auto rounded-sm border border-gray-300 bg-[#a1866f] p-1 select-none"
          onMouseLeave={() => setPainting(false)}
        >
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(14px, 1fr))` }}
          >
            {Array.from({ length: GRID_ROWS }).map((_, y) =>
              Array.from({ length: GRID_COLS }).map((__, x) => {
                const key = cells[`${x},${y}`];
                const mat = key ? materialByKey(key) : null;
                return (
                  <div
                    key={`${x},${y}`}
                    onMouseDown={() => {
                      setPainting(true);
                      paint(x, y);
                    }}
                    onMouseEnter={() => painting && paint(x, y)}
                    onMouseUp={() => setPainting(false)}
                    className="aspect-square cursor-crosshair"
                    style={{ background: mat ? mat.color : "rgba(0,0,0,0.06)" }}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {summary.lines.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-2 space-y-1">
          {summary.lines.map((l) => (
            <div key={l.key} className="flex items-center gap-2 text-[11px] text-gray-600">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
              <span className="flex-1">{l.label}</span>
              <span>{l.sqft.toFixed(0)} sq ft</span>
              <span className="w-16 text-right font-semibold text-gray-800">{money(l.cost)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[12px] font-bold text-gray-900 pt-1">
            <span>Landscape total</span>
            <span>{money(summary.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}