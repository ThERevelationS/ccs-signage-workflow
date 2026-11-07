import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { foundationWallCapCatalogIssues } from "./wallCapCalculator";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function FoundationWallCapsPanel({ caps = [], walls = [], options = [], onChange }) {
  const patchCap = (index, changes) =>
    onChange(caps.map((c, i) => (i === index ? { ...c, ...changes } : c)));

  const removeCap = (index) => {
    if (!window.confirm(`Remove cap ${index + 1}?`)) return;
    onChange(caps.filter((_, i) => i !== index));
  };

  const addCap = () => {
    const inv = options[0];
    onChange([
      ...caps,
      {
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cap_inventory_id: inv?.id || "",
        wall_component_id: walls[0]?.component_id || "",
        wall_index: walls.length ? 0 : undefined,
        segment_component_id: walls[0]?.shape?.segments?.[0]?.component_id || "",
        segment_index: walls[0]?.shape?.segments?.length ? 0 : undefined,
        position_along_segment_inches: 0,
        length_inches: num(inv?.cap_stock_length_inches) || 48,
        rotation_offset_degrees: 0,
        lateral_offset_inches: 0,
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Wall Caps</h2>
          <p className="text-xs text-gray-500">Full stock price is charged per cut piece.</p>
        </div>
        <Button variant="outline" size="sm" onClick={addCap} disabled={options.length === 0}>
          <Plus className="w-4 h-4" aria-hidden="true" /> Cap
        </Button>
      </div>

      {options.length === 0 && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Wall cap catalog unavailable — existing rows remain editable; new caps cannot be added.
        </div>
      )}
      {caps.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No caps on this section.
        </div>
      ) : (
        caps.map((cap, index) => (
          <div key={cap.component_id || cap.id || index} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <label className="text-xs text-gray-500 md:col-span-2">
                Cap material
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={cap.cap_inventory_id || ""}
                  aria-label="Cap material"
                  onChange={(e) => {
                    const inv = options.find((o) => o.id === e.target.value);
                    patchCap(index, {
                      cap_inventory_id: e.target.value,
                      length_inches: num(inv?.cap_stock_length_inches) || cap.length_inches,
                    });
                  }}
                >
                  <option value="">Select cap…</option>
                  {cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && (
                    <option value={cap.cap_inventory_id} disabled>{`Catalog cap unavailable (${cap.cap_inventory_id})`}</option>
                  )}
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.material_name}
                    </option>
                  ))}
                </select>
                {cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && (
                  <span className="block text-[10px] text-amber-700 mt-1">Catalog cap unavailable; current pricing needs review.</span>
                )}
              </label>
              <label className="text-xs text-gray-500">
                Wall
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={cap.wall_component_id ?? ""}
                  aria-label="Cap wall"
                  onChange={(e) => {
                    const id = e.target.value;
                    const i = walls.findIndex((w) => w.component_id === id);
                    patchCap(index, {
                      wall_component_id: id,
                      wall_index: id === "" || i < 0 ? undefined : i,
                      segment_component_id: "",
                      segment_index: undefined,
                    });
                  }}
                >
                  <option value="">Unassigned</option>
                  {cap.wall_component_id && !walls.some((w) => w.component_id === cap.wall_component_id) && (
                    <option value={cap.wall_component_id} disabled>{`Missing wall (${String(cap.wall_component_id).slice(0, 18)}…)`}</option>
                  )}
                  {walls.map((w, i) => (
                    <option key={w.component_id || i} value={w.component_id || ""}>
                      {w.name || `Wall ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Segment
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={cap.segment_component_id ?? ""}
                  aria-label="Cap segment"
                  onChange={(e) => {
                    const id = e.target.value;
                    const wall = walls.find((w) => w.component_id === cap.wall_component_id);
                    const segs = wall?.shape?.segments || [];
                    const i = segs.findIndex((sg) => sg.component_id === id);
                    patchCap(index, {
                      segment_component_id: id,
                      segment_index: id === "" || i < 0 ? undefined : i,
                    });
                  }}
                >
                  <option value="">Unassigned</option>
                  {cap.segment_component_id && !(walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).some((sg) => sg.component_id === cap.segment_component_id) && (
                    <option value={cap.segment_component_id} disabled>{`Missing segment (${String(cap.segment_component_id).slice(0, 18)}…)`}</option>
                  )}
                  {(walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).map((sg, i) => (
                    <option key={sg.component_id || i} value={sg.component_id || ""}>
                      {`Segment ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Cut length (in)
                <Input
                  type="number"
                  value={cap.length_inches ?? 48}
                  onChange={(e) => patchCap(index, { length_inches: Math.max(1, num(e.target.value)) })}
                />
              </label>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
              <span>
                Stock length: <span className="font-semibold text-gray-900">{hasFoundationCostSnapshot(cap.stock_length_inches) && cap.stock_length_inches > 0 ? cap.stock_length_inches + String.fromCharCode(34) : "Not saved"}</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-900">{hasFoundationCostSnapshot(cap.cost) ? money(cap.cost) : "Not saved"}</span>
                {(!options.some((o) => o.id === cap.cap_inventory_id)) && <span className="text-[10px] text-amber-700">Saved amounts (not current pricing)</span>}
                <Button variant="ghost" size="icon" onClick={() => removeCap(index)}>
                  <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}