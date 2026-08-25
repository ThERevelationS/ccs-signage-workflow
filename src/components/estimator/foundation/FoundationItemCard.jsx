import React from "react";
import { Input } from "@/components/ui/input";
import { Trash2, Box } from "lucide-react";
import { money } from "./foundationCalc";

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

const Picker = ({ label, value, onChange, options, placeholder }) => (
  <label className="text-xs text-gray-500">
    {label}
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.material_name}
        </option>
      ))}
    </select>
  </label>
);

export default function FoundationItemCard({ item, index, catalog, onChange, onRemove }) {
  const set = (patch) => onChange(index, patch);
  const numSet = (key) => (e) => set({ [key]: parseFloat(e.target.value) || 0 });
  const isPillar = item.foundation_type === "pillar";

  return (
    <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-amber-500 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-amber-500" />
          <select
            value={item.foundation_type || "spread_foot"}
            onChange={(e) => set({ foundation_type: e.target.value })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm font-semibold"
          >
            <option value="spread_foot">Spread Footing</option>
            <option value="pillar">Pillar / Caisson</option>
          </select>
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-900">{money(item.item_total_cost)}</div>
          <div className="text-[11px] text-gray-400">
            {Number(item.concrete_volume_cy || 0).toFixed(2)} CY concrete
          </div>
        </div>
        <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-600">
          <Trash2 className="w-4 h-4" />
        </button>
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
        <Field
          label="Concrete $/CY override"
          type="number"
          value={item.custom_concrete_cost_per_cy ?? ""}
          onChange={numSet("custom_concrete_cost_per_cy")}
        />
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100">
        <Check label="Rebar" checked={item.include_rebar} onChange={(v) => set({ include_rebar: v })} />
        <Check label="Forming" checked={item.include_forming} onChange={(v) => set({ include_forming: v })} />
        <Check label="Finishing" checked={item.include_finishing} onChange={(v) => set({ include_finishing: v })} />
        <Check
          label="Wall material"
          checked={item.include_wall_material}
          onChange={(v) => set({ include_wall_material: v })}
        />
        <Check
          label="Fill material"
          checked={item.include_fill_material}
          onChange={(v) => set({ include_fill_material: v })}
        />
        <Check
          label="Paint pole"
          checked={item.include_pole_painting}
          onChange={(v) => set({ include_pole_painting: v })}
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
                label="Hoop spacing (in)"
                type="number"
                value={item.pillar_rebar_layer_separation_inches ?? 12}
                onChange={numSet("pillar_rebar_layer_separation_inches")}
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
                value={item.rebar_size || "#4"}
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
            {Number(item.rebar_feet || 0).toFixed(1)} ft · {Number(item.rebar_weight_lbs || 0).toFixed(0)} lbs ·{" "}
            {money(item.rebar_cost)}
          </div>
        </div>
      )}

      {/* Pole */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        <Picker
          label="Pole"
          value={item.selected_pole_id}
          onChange={(v) => set({ selected_pole_id: v })}
          options={catalog.poles}
          placeholder="None"
        />
        <Field
          label="Pole height (in)"
          type="number"
          value={item.pole_total_height_inches ?? 0}
          onChange={numSet("pole_total_height_inches")}
        />
        <Field
          label="Embed offset (in)"
          type="number"
          value={item.pole_offset_from_bottom_inches ?? 0}
          onChange={numSet("pole_offset_from_bottom_inches")}
        />
      </div>

      {item.include_wall_material && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <Picker
            label="Brick / wall unit"
            value={item.selected_brick_id}
            onChange={(v) => set({ selected_brick_id: v })}
            options={catalog.walls}
            placeholder="Select"
          />
          <Field
            label="Wall length (in)"
            type="number"
            value={item.wall_length_inches ?? 0}
            onChange={numSet("wall_length_inches")}
          />
          <Field
            label="Wall height (in)"
            type="number"
            value={item.wall_height_inches ?? 0}
            onChange={numSet("wall_height_inches")}
          />
          <Field
            label="Wall width (in)"
            type="number"
            value={item.wall_width_inches ?? 8}
            onChange={numSet("wall_width_inches")}
          />
          <Field
            label="Mortar gap (in)"
            type="number"
            value={item.mortar_gap_inches ?? 0.375}
            onChange={numSet("mortar_gap_inches")}
          />
          <div className="col-span-2 sm:col-span-3 self-end text-xs text-gray-500">
            {Number(item.brick_count || 0).toFixed(0)} units · {money(item.brick_cost)}
          </div>
        </div>
      )}

      {item.include_fill_material && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Picker
            label="Fill material"
            value={item.selected_fill_material_id}
            onChange={(v) => set({ selected_fill_material_id: v })}
            options={catalog.fill}
            placeholder="Select"
          />
          <div className="self-end text-xs text-gray-500">
            {Number(item.fill_volume_cy || 0).toFixed(2)} CY · {money(item.fill_cost)}
          </div>
        </div>
      )}

      {/* Cost breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-gray-100 text-xs">
        {[
          ["Concrete", item.concrete_cost],
          ["Excavation", item.excavation_cost],
          ["Forming", (item.forming_cost || 0) + (item.forming_materials_cost || 0)],
          ["Pour + finish", (item.pouring_cost || 0) + (item.finishing_cost || 0)],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-50 rounded-lg px-2 py-1.5">
            <div className="text-gray-400">{label}</div>
            <div className="font-semibold text-gray-800">{money(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}