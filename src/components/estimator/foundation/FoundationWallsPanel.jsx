import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, PenLine } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { foundationWallPricingIssues } from "./wallCalculator";
import { inventoryDraftInput } from "@/components/masterInventory/inventoryNormalization";
import WallShapeEditor from "./WallShapeEditor";

// Blank-preserving project-entry draft, delegated to the boundary (CMP-A08).
const heightInput = inventoryDraftInput;

function WallRow({ wall, index, options, pricing, onChange, onRemove }) {
  const c = wall.calculatedCosts || {};
  const set = (changes) => onChange(index, changes);
  // Settings-aware issues arrive from calcProject; the local re-derive covers
  // consumers that cannot supply them (no settings visibility).
  const pricingIssues = pricing?.issues ?? foundationWallPricingIssues(wall, options, index);
  const pricingUnavailable = pricing?.available === false || pricingIssues.length > 0;
  const amt = (v) => (hasFoundationCostSnapshot(v) ? money(v) : "Not saved");
  const [showEditor, setShowEditor] = React.useState(false);
  const fieldIssue = (field) => pricingIssues.some((i) => i.field === field);
  const describedBy = (field) => (fieldIssue(field) ? `wall-${index}-pricing` : undefined);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Input
          className="min-w-0 max-w-[220px]"
          value={wall.name || ""}
          placeholder={`Wall ${index + 1}`}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="flex shrink-0 items-center gap-3">
          <span className="whitespace-nowrap font-bold text-gray-900">{amt(c.totalCost)}</span>
          <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
            <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="text-xs text-gray-500">
          Height (in)
          <Input
            type="number"
            step="any"
            value={wall.heightInches ?? ""}
            onChange={(e) => set({ heightInches: heightInput(e.target.value) })}
            aria-label="Wall height (in)"
            aria-invalid={fieldIssue("heightInches") || undefined}
            aria-describedby={describedBy("heightInches")}
          />
        </label>
        <label className="text-xs text-gray-500">
          Mortar gap (in)
          <Input
            type="number"
            step="0.125"
            min="0"
            value={wall.mortarGapInches ?? 0.375}
            placeholder="0.375"
            onChange={(e) => set({ mortarGapInches: heightInput(e.target.value) })}
            aria-label="Wall mortar gap (in)"
            aria-invalid={fieldIssue("mortarGapInches") || undefined}
            aria-describedby={describedBy("mortarGapInches")}
          />
        </label>
        <label className="text-xs text-gray-500 md:col-span-2">
          Wall material
          <select
            className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={wall.materialId || ""}
            aria-label="Wall material"
            aria-invalid={fieldIssue("materialId") || undefined}
            aria-describedby={describedBy("materialId")}
            onChange={(e) => set({ materialId: e.target.value })}
          >
            <option value="">Select material…</option>
            {wall.materialId && !options.some((o) => o.id === wall.materialId) && (
              <option value={wall.materialId} disabled>{`Catalog material unavailable (${wall.materialId})`}</option>
            )}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.material_name}
              </option>
            ))}
          </select>
          {wall.materialId && !options.some((o) => o.id === wall.materialId) && (
            <span className="block text-[10px] text-amber-700 mt-1">Catalog material unavailable; current pricing needs review.</span>
          )}
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
                aria-label="Internal wall material"
                aria-invalid={fieldIssue("internalMaterialId") || undefined}
                aria-describedby={describedBy("internalMaterialId")}
                onChange={(e) => set({ internalMaterialId: e.target.value })}
              >
                <option value="">Select material…</option>
                {wall.internalMaterialId && !options.some((o) => o.id === wall.internalMaterialId) && (
                  <option value={wall.internalMaterialId} disabled>{`Catalog material unavailable (${wall.internalMaterialId})`}</option>
                )}
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.material_name}
                  </option>
                ))}
              </select>
              {wall.internalMaterialId && !options.some((o) => o.id === wall.internalMaterialId) && (
                <span className="block text-[10px] text-amber-700 mt-1">Catalog material unavailable; current pricing needs review.</span>
              )}
            </label>
            <label className="text-xs text-gray-500">
              Fill height (in)
              <Input
                type="number"
                step="any"
                value={wall.internalWallHeightInches ?? wall.heightInches ?? ""}
                onChange={(e) => set({ internalWallHeightInches: heightInput(e.target.value) })}
                aria-label="Internal wall height (in)"
                aria-invalid={fieldIssue("internalWallHeightInches") || undefined}
                aria-describedby={describedBy("internalWallHeightInches")}
              />
            </label>
            <label className="text-xs text-gray-500">
              Fill mortar gap (in)
              <Input
                type="number"
                step="0.125"
                min="0"
                value={wall.internalMortarGapInches ?? 0.375}
                placeholder="0.375"
                onChange={(e) => set({ internalMortarGapInches: heightInput(e.target.value) })}
                aria-label="Internal wall mortar gap (in)"
                aria-invalid={fieldIssue("internalMortarGapInches") || undefined}
                aria-describedby={describedBy("internalMortarGapInches")}
              />
            </label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
        <div>Units: <span className="font-semibold text-gray-900">{hasFoundationCostSnapshot(c.totalBricks) ? Math.round(c.totalBricks) : "Not saved"}</span></div>
        <div>Courses: <span className="font-semibold text-gray-900">{hasFoundationCostSnapshot(c.numCourses) ? Math.ceil(c.numCourses) : "Not saved"}</span></div>
        <div>Material: <span className="font-semibold text-gray-900">{amt(c.materialCost)}</span></div>
        <div>Mortar: <span className="font-semibold text-gray-900">{amt(c.mortarCost)}</span></div>
        <div>Labor: <span className="font-semibold text-gray-900">{amt(c.laborCost)}</span></div>
        <div>Labor hrs: <span className="font-semibold text-gray-900">{hasFoundationCostSnapshot(c.laborHours) ? c.laborHours.toFixed(1) : "Not saved"}</span></div>
        <div>Linear in: <span className="font-semibold text-gray-900">{hasFoundationCostSnapshot(c.totalLinearInches) ? Math.round(c.totalLinearInches) : "Not saved"}</span></div>
        {pricingUnavailable && <div className="col-span-full text-[10px] font-semibold text-amber-700">Saved amounts (not current pricing)</div>}
        {pricingIssues.length > 0 && (
          <div role="status" className="col-span-full text-[10px] text-amber-700 space-y-0.5" id={`wall-${index}-pricing`}>
            {pricingIssues.map((issue) => <p key={`${issue.field}-${issue.code}`}>{issue.message}</p>)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowEditor((v) => !v)}
          aria-expanded={showEditor}
          aria-invalid={fieldIssue("shape") || undefined}
          aria-describedby={describedBy("shape")}>
          <PenLine className="w-4 h-4" aria-hidden="true" /> {showEditor ? "Hide outline" : "Wall outline"}
        </Button>
        {fieldIssue("shape") ? (
          <span className="text-xs text-amber-600">
            Outline geometry needs repair before repricing - see diagnostics above.
          </span>
        ) : !wall.shape?.segments?.length ? (
          <span className="text-xs text-amber-600">
            No outline yet - draw the wall footprint before estimating quantities.
          </span>
        ) : null}
      </div>

      {showEditor && (
        <WallShapeEditor shape={wall.shape} onChange={(shape) => set({ shape })} />
      )}
    </div>
  );
}

export default function FoundationWallsPanel({ walls = [], options = [], onChange, wallPricing = [] }) {
  const patchWall = (index, changes) =>
    onChange(walls.map((w, i) => (i === index ? { ...w, ...changes } : w)));

  const removeWall = (index) => {
    const name = walls[index]?.name || `Wall ${index + 1}`;
    if (!window.confirm(`Remove ${name}? Wall caps attached to it are retained for review.`)) return;
    onChange(walls.filter((_, i) => i !== index));
  };

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
          <Plus className="w-4 h-4" aria-hidden="true" /> Wall
        </Button>
      </div>

      {walls.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No walls on this section.
        </div>
      ) : (
        walls.map((wall, index) => (
          <WallRow
            key={wall.component_id || index}
            wall={wall}
            index={index}
            options={options}
            pricing={wallPricing[index]}
            onChange={patchWall}
            onRemove={removeWall}
          />
        ))
      )}
    </div>
  );
}
