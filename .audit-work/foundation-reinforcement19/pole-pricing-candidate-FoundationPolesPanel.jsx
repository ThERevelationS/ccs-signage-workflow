import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";

const heightInput = (value) => value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;

export default function FoundationPolesPanel({ poles = [], options = [], items = [], onChange, polePricing = [] }) {
  const patchPole = (index, changes) =>
    onChange(poles.map((p, i) => (i === index ? { ...p, ...changes } : p)));

  const removePole = (index) => {
    if (!window.confirm(`Remove Pole ${index + 1}? Cabinets mounted on it are retained for review.`)) return;
    onChange(poles.filter((_, i) => i !== index));
  };

  const addPole = () =>
    onChange([
      ...poles,
      { pole_id: options[0]?.id || "", height_inches: 120, y_offset_inches: 42, include_pole_painting: false },
    ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Poles</h2>
          <p className="text-xs text-gray-500">
            Priced on total length — height above grade plus depth in the ground.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addPole} disabled={options.length === 0}>
          <Plus className="w-4 h-4" aria-hidden="true" /> Pole
        </Button>
      </div>

      {options.length === 0 && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Pole catalog unavailable — existing rows remain editable; new poles cannot be added.
        </div>
      )}
      {poles.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No poles on this section.
        </div>
      ) : (
        poles.map((pole, index) => {
          const issues = polePricing[index]?.issues || [];
          const pricingUnavailable = polePricing[index]?.available === false;
          const fieldIssue = (field) => issues.some((i) => i.field === field);
          const describedBy = issues.length ? `pole-${index}-pricing` : undefined;
          return (
            <div key={pole.component_id || index} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                <label className="text-xs text-gray-500 md:col-span-2">
                  Pole
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={pole.pole_id || ""}
                    aria-label="Pole material"
                    aria-invalid={fieldIssue("pole_id") || undefined}
                    aria-describedby={fieldIssue("pole_id") ? describedBy : undefined}
                    onChange={(e) => patchPole(index, { pole_id: e.target.value })}
                  >
                    <option value="">Select pole…</option>
                    {pole.pole_id && !options.some((o) => o.id === pole.pole_id) && (
                      <option value={pole.pole_id} disabled>{`Catalog pole unavailable (${pole.pole_id})`}</option>
                    )}
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.material_name}
                      </option>
                    ))}
                  </select>
                  {pole.pole_id && !options.some((o) => o.id === pole.pole_id) && (
                    <span className="block text-[10px] text-amber-700 mt-1">Catalog pole unavailable; current pricing needs review.</span>
                  )}
                </label>
                <label className="text-xs text-gray-500">
                  Height above grade (in)
                  <Input
                    type="number"
                    step="any"
                    value={pole.height_inches ?? ""}
                    aria-label={`Pole ${index + 1} height above grade (inches)`}
                    aria-invalid={fieldIssue("height_inches") || undefined}
                    aria-describedby={fieldIssue("height_inches") ? describedBy : undefined}
                    onChange={(e) => patchPole(index, { height_inches: heightInput(e.target.value) })}
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Depth in ground (in)
                  <Input
                    type="number"
                    step="any"
                    value={pole.y_offset_inches ?? ""}
                    aria-label={`Pole ${index + 1} depth in ground (inches)`}
                    aria-invalid={fieldIssue("y_offset_inches") || undefined}
                    aria-describedby={fieldIssue("y_offset_inches") ? describedBy : undefined}
                    onChange={(e) => patchPole(index, { y_offset_inches: heightInput(e.target.value) })}
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Foundation
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={pole.foundation_component_id ?? ""}
                    aria-label="Pole foundation"
                    onChange={(e) => {
                      const id = e.target.value;
                      const i = items.findIndex((it) => it.component_id === id);
                      patchPole(index, {
                        foundation_component_id: id,
                        foundation_idx: id === "" || i < 0 ? undefined : i,
                      });
                    }}
                  >
                    <option value="">Unassigned</option>
                    {pole.foundation_component_id && !items.some((it) => it.component_id === pole.foundation_component_id) && (
                      <option value={pole.foundation_component_id} disabled>{`Missing foundation (${String(pole.foundation_component_id).slice(0, 18)}…)`}</option>
                    )}
                    {items.map((it, i) => (
                      <option key={it.component_id || i} value={it.component_id || ""}>
                        {it.description || `Foundation ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!pole.include_pole_painting}
                    aria-invalid={issues.some((i) => i.code === "pole_paint_setting_unavailable") || undefined}
                    aria-describedby={issues.some((i) => i.code === "pole_paint_setting_unavailable") ? describedBy : undefined}
                    onChange={(e) => patchPole(index, { include_pole_painting: e.target.checked })}
                  />
                  Paint pole
                </label>
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span>Pole {hasFoundationCostSnapshot(pole.pole_cost) ? money(pole.pole_cost) : "Not saved"}</span>
                  <span>Paint {hasFoundationCostSnapshot(pole.pole_painting_cost) ? money(pole.pole_painting_cost) : "Not saved"}</span>
                  <span className="font-bold text-gray-900 text-sm">{hasFoundationCostSnapshot(pole.total_cost) ? money(pole.total_cost) : "Not saved"}</span>
                  {pricingUnavailable && <span className="col-span-full text-[10px] text-amber-700">Saved amounts (not current pricing)</span>}
                  <Button variant="ghost" size="icon" onClick={() => removePole(index)}>
                    <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {issues.length > 0 && (
                <div role="status" className="mt-2 text-[10px] text-amber-700 space-y-0.5" id={`pole-${index}-pricing`}>
                  {issues.map((issue) => <p key={`${issue.field}-${issue.code}`}>{issue.message}</p>)}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
