import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { money } from "./foundationCalc";

const blankCabinet = (mount, index, canonId) => ({
  id: `cab_${Date.now()}`,
  description: "",
  mount,
  foundation_index: mount === "foundation" ? index : undefined,
  foundation_component_id: mount === "foundation" ? canonId || "" : "",
  pole_index: mount === "pole" ? index : undefined,
  pole_component_id: mount === "pole" ? canonId || "" : "",
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
        <button type="button" onClick={onRemove} className="text-gray-500 hover:text-red-600" title="Remove">
          <Trash2 className="w-4 h-4" aria-hidden="true" />
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
        {/* O-062 (CMP-E07) -- typed mount hardware: bracket / base-plate /
            anchor assembly. Authored; blank = "not recorded", never invented. */}
        <label className="text-[10px] text-gray-500">
          Mount hardware
          <select
            value={cabinet.mount_hardware ?? ""}
            onChange={(e) => onChange({ mount_hardware: e.target.value === "" ? undefined : e.target.value })}
            className="block w-full h-7 rounded-sm border border-gray-300 px-1 text-[11px]"
            aria-label="Cabinet mount hardware"
          >
            <option value="">--</option>
            <option value="bracket">Bracket</option>
            <option value="base_plate">Base plate</option>
            <option value="anchor">Anchor assembly</option>
            <option value="other">Other (engineering review)</option>
          </select>
        </label>
        {/* O-062 (CMP-E07) -- catalog hardware model: the specific hardware
            model the typed mount references (`mount_hardware_model`); blank =
            "not recorded" (never an invented model). */}
        <label className="text-[10px] text-gray-500">
          Hardware model
          <input
            type="text" placeholder="model/SKU"
            value={cabinet.mount_hardware_model ?? ""}
            onChange={(e) => onChange({ mount_hardware_model: e.target.value === "" ? undefined : e.target.value })}
            className="block w-full h-7 rounded-sm border border-gray-300 px-1 text-[11px]"
            aria-label="Cabinet mount hardware model"
          />
        </label>
        <Field label="Qty" type="number" value={cabinet.quantity ?? 1} onChange={num("quantity")} />
        <Field label="Unit cost" type="number" value={cabinet.unit_cost ?? 0} onChange={num("unit_cost")} />
      </div>
    </div>
  );
}

export default function SignageCabinetsPanel({ cabinets = [], items = [], poles = [], onChange }) {
  const update = (idx, changes) =>
    onChange(cabinets.map((c, i) => (i === idx ? { ...c, ...changes } : c)));
  const remove = (idx) => {
    if (!window.confirm("Remove this cabinet?")) return;
    onChange(cabinets.filter((_, i) => i !== idx));
  };
  const add = (mount, index) => {
    const parent = mount === "foundation" ? items[index] : poles[index];
    onChange([...cabinets, blankCabinet(mount, index, parent?.component_id)]);
  };

  const canonParentId = (c) => (c.mount === "pole" ? c.pole_component_id : c.foundation_component_id);
  const hasCanonProp = (c) => (c.mount === "pole" ? Object.prototype.hasOwnProperty.call(c, "pole_component_id") : Object.prototype.hasOwnProperty.call(c, "foundation_component_id"));

  const group = (mount, index) =>
    cabinets
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
        if (c.mount !== mount) return false;
        const parent = mount === "foundation" ? items[index] : poles[index];
        const canon = canonParentId(c);
        if (hasCanonProp(c)) return canon !== "" && canon === parent?.component_id;
        return mount === "foundation" ? c.foundation_index === index : c.pole_index === index;
      });

  const orphans = cabinets
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => {
      if (c.mount !== "pole" && c.mount !== "foundation") return true;
      const canon = canonParentId(c);
      const pool = c.mount === "pole" ? poles : items;
      if (hasCanonProp(c)) {
        if (canon === "") return true;
        return !pool.some((p) => p?.component_id === canon);
      }
      const legacy = c.mount === "pole" ? c.pole_index : c.foundation_index;
      const resolved = typeof legacy === "number" && Number.isInteger(legacy) && legacy >= 0 && pool[legacy] !== undefined;
      return !resolved;
    });

  const reassign = (i, mount, canonId) => {
    const pool = mount === "pole" ? poles : items;
    const index = pool.findIndex((p) => p?.component_id === canonId);
    if (mount === "pole") update(i, { mount: "pole", pole_component_id: canonId, pole_index: canonId === "" || index < 0 ? undefined : index, foundation_component_id: "", foundation_index: undefined });
    else update(i, { mount: "foundation", foundation_component_id: canonId, foundation_index: canonId === "" || index < 0 ? undefined : index, pole_component_id: "", pole_index: undefined });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-sm border border-gray-200 p-3">
        <h3 className="text-[13px] font-bold text-gray-900">Signage Cabinets</h3>
        <p className="text-[11px] text-gray-500 mb-2">
          Add cabinets directly on a foundation or mount them on a placed pole.
        </p>

        {items.length === 0 ? (
          <p className="text-[11px] italic text-gray-500">Add a foundation first to mount cabinets on it.</p>
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
                  <button type="button"
                    onClick={() => add("foundation", index)}
                    className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" /> Add Cabinet
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[11px] text-gray-500">No cabinets on this foundation.</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map(({ c, i }) => (
                      <CabinetRow
                        key={c.component_id || c.id || i}
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
        <p className="text-[11px] text-gray-500 mb-2">
          Add cabinets to placed poles. Place poles in the "Walls &amp; Poles" tab.
        </p>
        {poles.length === 0 ? (
          <p className="text-[11px] italic text-gray-500">
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
                  <button type="button"
                    onClick={() => add("pole", index)}
                    className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" /> Add Cabinet
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[11px] text-gray-500">No cabinets on this pole.</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map(({ c, i }) => (
                      <CabinetRow
                        key={c.component_id || c.id || i}
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

        {orphans.length > 0 && (
          <div data-orphan="true" className="border border-amber-300 bg-amber-50 rounded-sm p-2 mt-2">
            <span className="text-[12px] font-semibold text-amber-800">Unassigned cabinets</span>
            <div className="space-y-2 mt-2">
              {orphans.map(({ c, i }) => (
                <div key={c.component_id || c.id || i}>
                  <CabinetRow
                    cabinet={c}
                    onChange={(changes) => update(i, changes)}
                    onRemove={() => remove(i)}
                  />
                  <label className="block text-[10px] text-amber-800 mt-1">
                    Reassign
                    <select
                      className="ml-2 h-7 rounded-sm border border-amber-300 bg-white px-1 text-[11px]"
                      value=""
                      aria-label="Reassign cabinet"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") return;
                        if (v.startsWith("pole:")) reassign(i, "pole", v.slice(5));
                        else if (v.startsWith("foundation:")) reassign(i, "foundation", v.slice(11));
                      }}
                    >
                      <option value="">Select parent…</option>
                      {items.map((it, ix) => (
                        <option key={it.component_id || ix} value={`foundation:${it.component_id}`}>{it.description || `Foundation ${ix + 1}`}</option>
                      ))}
                      {poles.map((po, ix) => (
                        <option key={po.component_id || ix} value={`pole:${po.component_id}`}>{po.description || `Pole ${ix + 1}`}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}