import { Input } from "@/components/ui/input";
import { Trash2, Box, Copy } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { inventoryNumberInput } from "@/components/masterInventory/inventoryNormalization";

const amt = (v) => (hasFoundationCostSnapshot(v) ? money(v) : "Not saved");
const num2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "Not saved");

const Field = ({ label, ...props }) => (
  <label className="text-xs text-gray-500">
    {label}
    <Input {...props} />
  </label>
);

const Check = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const Picker = ({ label, value, onChange, options, placeholder }) => {
  const missing = value && !options.some((o) => o.id === value);
  return (
    <label className="text-xs text-gray-500">
      {label}
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
      >
        <option value="">{placeholder}</option>
        {missing && (
          <option value={value} disabled>
            Catalog item unavailable ({value})
          </option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.material_name}
          </option>
        ))}
      </select>
    </label>
  );
};

export default function FoundationItemCard({ item, index, catalog, onChange, onRemove, onDuplicate, pricing }) {
  const set = (patch) => onChange(index, patch);
  const numSet = (key) => (e) => set({ [key]: parseFloat(e.target.value) || 0 });
  // Blank clears the override (null); a malformed draft is preserved verbatim so
  // the item validation reports it instead of a NaN leaking into saved costs.
  // Delegates to the boundary's catalog draft (CMP-A08) — identical contract,
  // plus whitespace-only drafts clear to null instead of minting Number(" ")=0.
  const nullSet = (key) => (e) => set({ [key]: inventoryNumberInput(e.target.value) });
  const isPillar = item.foundation_type === "pillar";
  const unavailable = pricing?.available === false;
  const concreteRow = (catalog.concrete || []).find((c) => c.id === item.selected_concrete_id);
  const overrideLabel = !concreteRow
    ? "Concrete cost override (unknown unit)"
    : concreteRow.material_type === "bagged_concrete"
      ? "Concrete $/bag override"
      : "Concrete $/CY override";

  return (
    <div className="bg-white rounded-sm border border-gray-200 border-l-4 border-l-amber-500 p-4">
      {unavailable && (
        <div className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1" id={`foundation-${index}-pricing`}>
          <p className="text-[11px] font-semibold text-amber-800">Saved amounts (not current pricing)</p>
          <p className="text-[10px] text-amber-700">Saved quantities may not reflect the current design.</p>
          {(pricing.issues || []).map((i, k) => (
            <p key={k} className="text-[10px] text-amber-700">{i.message}</p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-amber-500" aria-hidden="true" />
          <span className="text-[12px] font-bold text-gray-700">Foundation #{index + 1}</span>
          <select
            value={item.foundation_type || ""}
            onChange={(e) => set({ foundation_type: e.target.value })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm font-semibold"
          >
            {item.foundation_type !== "spread_foot" && item.foundation_type !== "pillar" && (
              <option value={item.foundation_type || ""} disabled>
                {item.foundation_type ? `Unsupported type: ${item.foundation_type}` : "Choose foundation type"}
              </option>
            )}
            <option value="spread_foot">Spread Footing</option>
            <option value="pillar">Pillar / Caisson</option>
          </select>
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-900">{amt(item.item_total_cost)}</div>
          <div className="text-[11px] text-gray-400">
            {num2(item.concrete_volume_cy)} CY concrete
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onDuplicate && (
            <button type="button" onClick={() => onDuplicate(index)} className="text-gray-400 hover:text-blue-600" title="Duplicate">
              <Copy className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <button type="button"
            onClick={() => {
              if (!window.confirm(`Remove Foundation #${index + 1}?`)) return;
              onRemove(index);
            }}
            className="text-gray-400 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Field
        label="Description"
        value={item.description || ""}
        onChange={(e) => set({ description: e.target.value })}
      />

      {/* Dimensions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <Field label="Quantity" type="number" value={item.quantity ?? 1} onChange={numSet("quantity")} />
        {isPillar ? (
          <Field label="Diameter (in)" type="number" value={item.diameter ?? 0} onChange={numSet("diameter")} />
        ) : (
          <>
            <Field label="Length (in)" type="number" value={item.length_inches ?? 0} onChange={numSet("length_inches")} />
            <Field label="Width (in)" type="number" value={item.width_inches ?? 0} onChange={numSet("width_inches")} />
          </>
        )}
        <Field label="Depth (in)" type="number" value={item.depth_inches ?? 0} onChange={numSet("depth_inches")} />
        <Field
          label="Grade offset (in)"
          type="number"
          value={item.grade_offset_inches ?? 0}
          onChange={numSet("grade_offset_inches")}
        />
        <Field
          label="Rotation (°)"
          type="number"
          value={item.rotation_degrees ?? 0}
          onChange={numSet("rotation_degrees")}
        />
      </div>

      {/* Concrete + excavation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        <Picker
          label="Concrete"
          value={item.selected_concrete_id}
          onChange={(v) => set({ selected_concrete_id: v })}
          options={catalog.concrete}
          placeholder="Use project rate"
        />
        <label className="text-xs text-gray-500">
          Excavation method
          <select
            value={item.excavation_method || ""}
            onChange={(e) => set({ excavation_method: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            <option value="">Project default</option>
            <option value="hand_dig">Hand dig</option>
            <option value="equipment_excavation">Equipment</option>
          </select>
        </label>
        <Picker
          label="Forming material"
          value={item.selected_forming_id}
          onChange={(v) => set({ selected_forming_id: v })}
          options={catalog.forming || []}
          placeholder="None"
        />
        <Field
          label={overrideLabel}
          type="number"
          step="any"
          min="0"
          value={item.custom_concrete_cost_per_cy ?? ""}
          onChange={nullSet("custom_concrete_cost_per_cy")}
          aria-label={overrideLabel}
          aria-invalid={pricing?.issues?.some((i) => i.field === "custom_concrete_cost_per_cy") || undefined}
          aria-describedby={pricing?.issues?.some((i) => i.field === "custom_concrete_cost_per_cy") ? `foundation-${index}-pricing` : undefined}
        />
        {item.custom_concrete_cost_per_cy !== null && item.custom_concrete_cost_per_cy !== undefined && (
          <button
            type="button"
            className="text-[10px] text-amber-700 hover:underline self-end"
            onClick={() => set({ custom_concrete_cost_per_cy: null })}
          >
            Clear override
          </button>
        )}
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100">
        <Check label="Rebar" checked={item.include_rebar} onChange={(v) => set({ include_rebar: v })} />
        <Check label="Forming" checked={item.include_forming} onChange={(v) => set({ include_forming: v })} />
        <Check label="Finishing" checked={item.include_finishing} onChange={(v) => set({ include_finishing: v })} />
        <Check
          label="This is a new sign location"
          checked={item.is_new_sign_location}
          onChange={(v) => set({ is_new_sign_location: v })}
        />
      </div>

      {item.include_rebar && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {isPillar ? (
            <>
              <Field
                label="Rebar size"
                value={item.pillar_rebar_size || "#4"}
                onChange={(e) => set({ pillar_rebar_size: e.target.value })}
              />
              <Field
                label="Hoop dia (in)"
                type="number"
                value={item.pillar_rebar_hoop_diameter ?? 0}
                onChange={numSet("pillar_rebar_hoop_diameter")}
              />
              <Field
                label="Hoops (layers)"
                type="number"
                value={item.pillar_rebar_layers ?? 1}
                onChange={numSet("pillar_rebar_layers")}
              />
              <Field
                label="Vertical bars"
                type="number"
                value={item.pillar_vertical_rebar_count ?? 4}
                onChange={numSet("pillar_vertical_rebar_count")}
              />
            </>
          ) : (
            <>
              <Field
                label="Rebar size"
                value={item.rebar_size ?? ""}
                onChange={(e) => set({ rebar_size: e.target.value })}
              />
              <Field
                label="Spacing length (in)"
                type="number"
                value={item.rebar_spacing_length ?? 12}
                onChange={numSet("rebar_spacing_length")}
              />
              <Field
                label="Spacing width (in)"
                type="number"
                value={item.rebar_spacing_width ?? 12}
                onChange={numSet("rebar_spacing_width")}
              />
              <Field label="Layers" type="number" value={item.rebar_layers ?? 1} onChange={numSet("rebar_layers")} />
            </>
          )}
          <div className="col-span-2 sm:col-span-4 text-xs text-gray-500">
            {Number.isFinite(item.rebar_feet) ? item.rebar_feet.toFixed(1) : "Not saved"} ft ·{" "}
            {Number.isFinite(item.rebar_weight_lbs) ? item.rebar_weight_lbs.toFixed(0) : "Not saved"} lbs ·{" "}
            {amt(item.rebar_cost)}
          </div>
        </div>
      )}

      {/* Excavation summary */}
      <div className="mt-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Excavation</div>
        <div className="text-[11px] text-amber-900">
          Volume: ~{Number.isFinite(item.excavation_volume_cy) ? item.excavation_volume_cy.toFixed(2) : "Not saved"} CY · Cost: {amt(item.excavation_cost)}
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="mt-3 rounded-sm border border-gray-200 bg-slate-50 p-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            ["Rebar", item.rebar_cost],
            ["Forming", item.forming_cost],
            ["Pouring", item.pouring_cost],
            ["Finishing", item.finishing_cost],
            ["Excavation", item.excavation_cost],
          ].map(([label, value]) => (
            <div key={label} className="px-1">
              <div className="text-gray-400">{label}</div>
              <div className="font-semibold text-gray-800">{amt(value)}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-center text-[11px] italic text-amber-700">
          Concrete material &amp; truck costs are aggregated for the entire project.
        </div>
      </div>
    </div>
  );
}