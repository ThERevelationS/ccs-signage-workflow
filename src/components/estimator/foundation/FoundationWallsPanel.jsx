import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, PenLine } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { foundationWallPricingIssues } from "./wallCalculator";
import { FoundationDimensionInput } from "./foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";
import WallShapeEditor from "./WallShapeEditor";

// O-093 (CMP-H02): linear-dimension fields take feet/inches entry through the
// shared dimension field  -  -  -  same verbatim-draft contract as the CMP-A08
// boundary it replaces, canonical inches stored, plain-language label + help +
// suggested-format placeholder from the field meta map (never stored defaults).
const wallDimMeta = (field) => foundationDimensionFieldMeta("wall", field);

function WallRow({ wall, index, options, pricing, onChange, onRemove, items = [] }) {
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
          <Button variant="ghost" size="icon" aria-label={`Remove wall ${index + 1}`} onClick={() => onRemove(index)}>
            <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <FoundationDimensionInput
          {...wallDimMeta("heightInches")}
          value={wall.heightInches ?? ""}
          onCommit={(v) => set({ heightInches: v })}
          ariaLabel="Wall height (in)"
          invalid={fieldIssue("heightInches") || undefined}
          describedBy={describedBy("heightInches")}
        />
        <FoundationDimensionInput
          {...wallDimMeta("mortarGapInches")}
          // Display-only fallback: 0.375 shows until a value is recorded  -  -  - 
          // nothing is stored by the fallback (explicit-null discipline).
          value={wall.mortarGapInches ?? 0.375}
          onCommit={(v) => set({ mortarGapInches: v })}
          ariaLabel="Wall mortar gap (in)"
          invalid={fieldIssue("mortarGapInches") || undefined}
          describedBy={describedBy("mortarGapInches")}
        />
        <FoundationDimensionInput
          {...wallDimMeta("wasteFraction")}
          // O-047 -- authored waste/cut factor scales brick+mortar+labor;
          // blank stores undefined (never a silent 0).
          value={wall.wasteFraction ?? ""}
          onCommit={(v) => set({ wasteFraction: v === "" || v == null ? undefined : v })}
          ariaLabel="Wall waste fraction"
          invalid={fieldIssue("wasteFraction") || undefined}
          describedBy={describedBy("wasteFraction")}
        />
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
            <option value="">Select material -  -  - </option>
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
        {/* O-047 (CMP-D04) -- brick_bond_type: the coursing bond's named
            pattern, recorded separately from the stagger fraction
            (offsetFraction drives the coursing math; this names the bond).
            Blank = "not recorded", the diagnostics hold it accordingly. */}
        <label className="text-xs text-gray-500">
          Bond type
          <select
            className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={wall.brick_bond_type ?? ""}
            aria-label="Wall bond type"
            onChange={(e) => set({ brick_bond_type: e.target.value === "" ? undefined : e.target.value })}
          >
            <option value="">Not recorded</option>
            <option value="running">Running</option>
            <option value="stack">Stack</option>
            <option value="flemish">Flemish</option>
            <option value="soldier">Soldier</option>
          </select>
        </label>
        {/* O-047 (CMP-D04) -- corner_return_count: the operator's recorded
            count of corner returns on this wall (geometry still derives
            corners from the shape; this is the field record). */}
        <label className="text-xs text-gray-500">
          Corner returns
          <input
            type="number" min="0" step="1" placeholder="0"
            value={wall.corner_return_count ?? ""}
            onChange={(e) => set({ corner_return_count: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            aria-label="Wall corner return count"
          />
        </label>
        <label className="text-xs text-gray-500 md:col-span-2">
          Foundation
          <select
            className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={wall.foundation_component_id ?? ""}
            aria-label="Wall foundation"
            onChange={(e) => {
              const id = e.target.value;
              const i = items.findIndex((it) => it.component_id === id);
              set({
                foundation_component_id: id,
                foundation_index: id === "" || i < 0 ? undefined : i,
              });
            }}
          >
            <option value="">Freestanding (no foundation)</option>
            {wall.foundation_component_id && !items.some((it) => it.component_id === wall.foundation_component_id) && (
              <option value={wall.foundation_component_id} disabled>{`Missing foundation (${String(wall.foundation_component_id).slice(0, 18)}...)`}</option>
            )}
            {items.map((it, i) => (
              <option key={it.component_id || i} value={it.component_id || ""}>
                {it.name || it.label || `Foundation ${i + 1}`}
              </option>
            ))}
          </select>
          {wall.foundation_component_id && !items.some((it) => it.component_id === wall.foundation_component_id) && (
            <span className="block text-[10px] text-amber-700 mt-1">Referenced foundation is not in this section; the wall stays priced until reassigned.</span>
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
                <option value="">Select material -  -  - </option>
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
            <FoundationDimensionInput
              {...wallDimMeta("internalWallHeightInches")}
              // Display-only fallback: blank follows the outer wall height  -  -  - 
              // nothing is stored by the fallback (explicit-null discipline).
              value={wall.internalWallHeightInches ?? wall.heightInches ?? ""}
              onCommit={(v) => set({ internalWallHeightInches: v })}
              ariaLabel="Internal wall height (in)"
              invalid={fieldIssue("internalWallHeightInches") || undefined}
              describedBy={describedBy("internalWallHeightInches")}
            />
            <FoundationDimensionInput
              {...wallDimMeta("internalMortarGapInches")}
              // Display-only fallback: 0.375 shows until a value is recorded.
              value={wall.internalMortarGapInches ?? 0.375}
              onCommit={(v) => set({ internalMortarGapInches: v })}
              ariaLabel="Internal wall mortar gap (in)"
              invalid={fieldIssue("internalMortarGapInches") || undefined}
              describedBy={describedBy("internalMortarGapInches")}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
        {/* CMP-D03: the snapshot carries its quantity basis  -  -  -  poured concrete
            reads placed volume in CY (never "Units"), unit masonry keeps the
            unit count. Held rows keep whatever basis the acknowledged
            snapshot recorded. */}
        {c.materialQuantityUnit === "cy" ? (
          <div>CY: <span className="font-semibold text-gray-900">{hasFoundationCostSnapshot(c.totalBricks) ? c.totalBricks.toFixed(2) : "Not saved"}</span></div>
        ) : (
          <div>Units: <span className="font-semibold text-gray-900">{hasFoundationCostSnapshot(c.totalBricks) ? Math.round(c.totalBricks) : "Not saved"}</span></div>
        )}
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
      {/* O-045 (CMP-D02) -- wall openings: each row deducts its area from the
          masonry quantities in calcWallCosts. width/height must be finite
          positive; a malformed row holds the whole deduction (never partial). */}
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-600">Openings ({(wall.openings || []).length})</span>
          <button
            type="button"
            onClick={() => set({ openings: [...(wall.openings || []), { id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, width_inches: "", height_inches: "" }] })}
            className="h-5 px-1.5 rounded-sm border border-gray-300 text-[10px] text-gray-600 hover:bg-gray-50"
          >+ Opening</button>
        </div>
        {(wall.openings || []).map((o, oi) => (
          <div key={o.id || oi} className="flex items-center gap-1.5 mt-1">
            <input
              type="number" min="0" step="0.25" placeholder="W in"
              value={o.width_inches ?? ""}
              onChange={(e) => set({ openings: (wall.openings || []).map((row, j) => j === oi ? { ...row, width_inches: e.target.value === "" ? undefined : Number(e.target.value) } : row) })}
              className="w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]"
              aria-label={`Wall opening ${oi + 1} width (inches)`}
            />
            <input
              type="number" min="0" step="0.25" placeholder="H in"
              value={o.height_inches ?? ""}
              onChange={(e) => set({ openings: (wall.openings || []).map((row, j) => j === oi ? { ...row, height_inches: e.target.value === "" ? undefined : Number(e.target.value) } : row) })}
              className="w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]"
              aria-label={`Wall opening ${oi + 1} height (inches)`}
            />
            <button
              type="button"
              onClick={() => set({ openings: (wall.openings || []).filter((_, j) => j !== oi) })}
              className="h-7 px-1.5 rounded-sm border border-gray-300 text-[10px] text-gray-500 hover:bg-gray-50"
              aria-label={`Remove opening ${oi + 1}`}
            >x</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FoundationWallsPanel({ walls = [], options = [], onChange, wallPricing = [], items = [] }) {
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
            items={items}
          />
        ))
      )}
    </div>
  );
}