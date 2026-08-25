import React from "react";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import HoldDownAdvisor from "./HoldDownAdvisor";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const selectCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

const ITEM_TYPES = [
  { value: "panel", label: "Panel / Shape" },
  { value: "lettering", label: "Lettering" },
  { value: "3d_carving", label: "3D Carving" },
];
const MATERIALS = ["Acrylic", "Wood", "MDF", "Plywood", "PVC", "HDPE", "Aluminum", "Corian"];
const WORKHOLDING = [
  { value: "vacuum_full", label: "Full vacuum" },
  { value: "vacuum_zoned", label: "Zoned vacuum" },
  { value: "tape_glue", label: "Tape & glue" },
  { value: "screws", label: "Screws" },
  { value: "clamps", label: "Clamps" },
  { value: "none", label: "None" },
];

export default function CNCItemCard({ item, index, onChange, onRemove }) {
  const set = (patch) => onChange(index, patch);
  const numField = (key, label, placeholder) => (
    <label className="text-xs text-gray-500">
      {label}
      <Input
        type="number"
        placeholder={placeholder}
        value={item[key] ?? 0}
        onChange={(e) => set({ [key]: parseFloat(e.target.value) || 0 })}
      />
    </label>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Input
          value={item.description || ""}
          placeholder="Part description"
          onChange={(e) => set({ description: e.target.value })}
        />
        <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-600 p-2">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs text-gray-500">
          Item type
          <select
            value={item.item_type || "panel"}
            onChange={(e) => set({ item_type: e.target.value })}
            className={selectCls}
          >
            {ITEM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Material
          <select
            value={item.material_type || "Wood"}
            onChange={(e) => set({ material_type: e.target.value })}
            className={selectCls}
          >
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Thickness
          <Input
            value={item.material_thickness || ""}
            placeholder='e.g. 1/4"'
            onChange={(e) => set({ material_thickness: e.target.value })}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {numField("quantity", "Qty")}
        {item.item_type === "3d_carving" ? (
          <>
            {numField("carve_area_sqin", "Carve area (sq in)")}
            {numField("carve_depth", "Carve depth (in)")}
            {numField("carve_speed_sqipm", "Carve sq in/min")}
          </>
        ) : item.item_type === "lettering" ? (
          <>
            {numField("num_letters", "# Letters")}
            {numField("letter_height", "Letter height (in)")}
            {numField("cut_speed_ipm", "Cut speed (ipm)")}
          </>
        ) : (
          <>
            {numField("length", "Length (in)")}
            {numField("width", "Width (in)")}
            {numField("cut_speed_ipm", "Cut speed (ipm)")}
          </>
        )}
        {numField("total_cut_length_inches", "Cut length override (in)")}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-gray-100 pt-3">
        {numField("cutter_diameter_in", "Cutter dia. (in)")}
        {numField("smallest_detail_in", "Smallest detail (in)")}
        <label className="text-xs text-gray-500">
          Base workholding
          <select
            value={item.workholding_method || "none"}
            onChange={(e) => set({ workholding_method: e.target.value })}
            className={selectCls}
          >
            {WORKHOLDING.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={!!item.creates_loose_pieces}
            onChange={(e) => set({ creates_loose_pieces: e.target.checked })}
          />
          Creates loose pieces
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={!!item.force_enhanced}
            onChange={(e) => set({ force_enhanced: e.target.checked })}
          />
          Force enhanced hold-down
        </label>
      </div>

      <HoldDownAdvisor advice={item.hold_down} />

      <div className="flex flex-wrap gap-x-4 text-xs text-gray-500 border-t border-gray-100 pt-2">
        <span>
          Machine {Number(item.machine_time_hours || 0).toFixed(2)} hr · {money(item.machine_cost)}
        </span>
        <span>
          Setup {Number(item.setup_time_hours || 0).toFixed(2)} hr · {money(item.labor_cost)}
        </span>
        <span className="font-semibold text-gray-900 ml-auto">{money(item.item_total_cost)}</span>
      </div>
    </div>
  );
}