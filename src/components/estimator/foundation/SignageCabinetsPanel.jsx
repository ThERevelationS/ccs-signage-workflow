import React from "react";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { money } from "./foundationCalc";

const blankCabinet = (mount, index) => ({
  id: `cab_${Date.now()}`,
  description: "",
  mount,
  foundation_index: mount === "foundation" ? index : undefined,
  pole_index: mount === "pole" ? index : undefined,
  width_inches: 48,
  height_inches: 24,
  depth_inches: 8,
  mount_height_inches: 0,
  quantity: 1,
  unit_cost: 0,
});

const Field = ({ label, ...props }) => (
  <label className="text-[10px] text-gray-500">
    {label}
    <Input {...props} className="h-8 text-[12px]" />
  </label>
);

function CabinetRow({ cabinet, onChange, onRemove }) {
  const num = (key) => (e) => onChange({ [key]: parseFloat(e.target.value) || 0 });
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-2">
      <div className="flex items-center gap-2 mb-2">
        <Input
          value={cabinet.description || ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Cabinet description"
          className="h-8 text-[12px]"
        />
        <span className="text-[12px] font-bold text-gray-800 whitespace-nowrap">
          {money((cabinet.unit_cost || 0) * (cabinet.quantity || 1))}
        </span>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-600" title="Remove">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Field label="Width (in)" type="number" value={cabinet.width_inches ?? 0} onChange={num("width_inches")} />
        <Field label="Height (in)" type="number" value={cabinet.height_inches ?? 0} onChange={num("height_inches")} />
        <Field label="Depth (in)" type="number" value={cabinet.depth_inches ?? 0} onChange={num("depth_inches")} />
        <Field
          label="Mount ht (in)"
          type="number"
          value={cabinet.mount_height_inches ?? 0}
          onChange={num("mount_height_inches")}
        />
        <Field label="Qty" type="number" value={cabinet.quantity ?? 1} onChange={num("quantity")} />
        <Field label="Unit cost" type="number" value={cabinet.unit_cost ?? 0} onChange={num("unit_cost")} />
      </div>
    </div>
  );
}

export default function SignageCabinetsPanel({ cabinets = [], items = [], poles = [], onChange }) {
  const update = (idx, changes) =>
    onChange(cabinets.map((c, i) => (i === idx ? { ...c, ...changes } : c)));
  const remove = (idx) => onChange(cabinets.filter((_, i) => i !== idx));
  const add = (mount, index) => onChange([...cabinets, blankCabinet(mount, index)]);

  const group = (mount, index) =>
    cabinets
      .map((c, i) => ({ c, i }))
      .filter(({ c }) =>
        mount === "foundation" ? c.mount === "foundation" && c.foundation_index === index : c.mount === "pole" && c.pole_index === index
      );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-sm border border-gray-200 p-3">
        <h3 className="text-[13px] font-bold text-gray-900">Signage Cabinets</h3>
        <p className="text-[11px] text-gray-400 mb-2">
          Add cabinets directly on a foundation or mount them on a placed pole.
        </p>

        {items.length === 0 ? (
          <p className="text-[11px] italic text-gray-400">Add a foundation first to mount cabinets on it.</p>
        ) : (
          items.map((item, index) => {
            const rows = group("foundation", index);
            return (
              <div key={index} className="border border-gray-200 rounded-sm p-2 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-gray-700">
                    Foundation {index + 1}
                    {item.description ? ` — ${item.description}` : ""}
                  </span>
                  <button
                    onClick={() => add("foundation", index)}
                    className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="w-3 h-3" /> Add Cabinet
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[11px] text-gray-400">No cabinets on this foundation.</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map(({ c, i }) => (
                      <CabinetRow
                        key={c.id || i}
                        cabinet={c}
                        onChange={(changes) => update(i, changes)}
                        onRemove={() => remove(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="bg-white rounded-sm border border-gray-200 p-3">
        <h3 className="text-[13px] font-bold text-gray-900">Signage Cabinets on Poles</h3>
        <p className="text-[11px] text-gray-400 mb-2">
          Add cabinets to placed poles. Place poles in the "Walls &amp; Poles" tab.
        </p>
        {poles.length === 0 ? (
          <p className="text-[11px] italic text-gray-400">
            No poles placed. To mount cabinets on a pole, add poles in the "Walls &amp; Poles" tab. (Or skip this and
            use foundation-mounted cabinets above.)
          </p>
        ) : (
          poles.map((pole, index) => {
            const rows = group("pole", index);
            return (
              <div key={index} className="border border-gray-200 rounded-sm p-2 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-gray-700">Pole {index + 1}</span>
                  <button
                    onClick={() => add("pole", index)}
                    className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="w-3 h-3" /> Add Cabinet
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[11px] text-gray-400">No cabinets on this pole.</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map(({ c, i }) => (
                      <CabinetRow
                        key={c.id || i}
                        cabinet={c}
                        onChange={(changes) => update(i, changes)}
                        onRemove={() => remove(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}