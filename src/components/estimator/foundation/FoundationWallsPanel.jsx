import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, PenLine } from "lucide-react";
import { money } from "./foundationCalc";
import WallShapeEditor from "./WallShapeEditor";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function WallRow({ wall, index, options, onChange, onRemove }) {
  const c = wall.calculatedCosts || {};
  const set = (changes) => onChange(index, changes);
  const [showEditor, setShowEditor] = React.useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Input
          className="max-w-[220px]"
          value={wall.name || ""}
          placeholder={`Wall ${index + 1}`}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-900">{money(c.totalCost)}</span>
          <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="text-xs text-gray-500">
          Height (in)
          <Input
            type="number"
            value={wall.heightInches ?? 24}
            onChange={(e) => set({ heightInches: num(e.target.value) })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Mortar gap (in)
          <Input
            type="number"
            step="0.125"
            value={wall.mortarGapInches ?? 0.375}
            onChange={(e) => set({ mortarGapInches: num(e.target.value) })}
          />
        </label>
        <label className="text-xs text-gray-500 md:col-span-2">
          Wall material
          <select
            className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={wall.materialId || ""}
            onChange={(e) => set({ materialId: e.target.value })}
          >
            <option value="">Select material…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.material_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-lg bg-slate-50 p-2 space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
          <input
            type="checkbox"
            checked={!!wall.includeInternalWall}
            onChange={(e) => set({ includeInternalWall: e.target.checked })}
          />
          Internal fill wall
        </label>
        {wall.includeInternalWall && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <label className="text-xs text-gray-500 md:col-span-2">
              Fill material
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={wall.internalMaterialId || ""}
                onChange={(e) => set({ internalMaterialId: e.target.value })}
              >
                <option value="">Select material…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.material_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Fill height (in)
              <Input
                type="number"
                value={wall.internalWallHeightInches ?? wall.heightInches ?? 24}
                onChange={(e) => set({ internalWallHeightInches: num(e.target.value) })}
              />
            </label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
        <div>Units: <span className="font-semibold text-gray-900">{Math.round(num(c.totalBricks))}</span></div>
        <div>Courses: <span className="font-semibold text-gray-900">{Math.ceil(num(c.numCourses))}</span></div>
        <div>Material: <span className="font-semibold text-gray-900">{money(c.materialCost)}</span></div>
        <div>Mortar: <span className="font-semibold text-gray-900">{money(c.mortarCost)}</span></div>
        <div>Labor: <span className="font-semibold text-gray-900">{money(c.laborCost)}</span></div>
        <div>Labor hrs: <span className="font-semibold text-gray-900">{num(c.laborHours).toFixed(1)}</span></div>
        <div>Linear in: <span className="font-semibold text-gray-900">{Math.round(num(c.totalLinearInches))}</span></div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowEditor((v) => !v)}>
          <PenLine className="w-4 h-4" /> {showEditor ? "Hide outline" : "Wall outline"}
        </Button>
        {!wall.shape?.segments?.length && (
          <span className="text-xs text-amber-600">
            No outline yet — this wall stays at $0 until its footprint is drawn.
          </span>
        )}
      </div>

      {showEditor && (
        <WallShapeEditor shape={wall.shape} onChange={(shape) => set({ shape })} />
      )}
    </div>
  );
}

export default function FoundationWallsPanel({ walls = [], options = [], onChange }) {
  const patchWall = (index, changes) =>
    onChange(walls.map((w, i) => (i === index ? { ...w, ...changes } : w)));

  const removeWall = (index) => onChange(walls.filter((_, i) => i !== index));

  const addWall = () =>
    onChange([
      ...walls,
      { name: `Wall ${walls.length + 1}`, heightInches: 24, mortarGapInches: 0.375, offsetFraction: 0.5 },
    ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Masonry Walls</h2>
        <Button variant="outline" size="sm" onClick={addWall}>
          <Plus className="w-4 h-4" /> Wall
        </Button>
      </div>

      {walls.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No walls on this section.
        </div>
      ) : (
        walls.map((wall, index) => (
          <WallRow
            key={index}
            wall={wall}
            index={index}
            options={options}
            onChange={patchWall}
            onRemove={removeWall}
          />
        ))
      )}
    </div>
  );
}