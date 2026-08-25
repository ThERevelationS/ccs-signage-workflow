import React from "react";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const selectCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

const ITEM_TYPES = [
  { value: "panel", label: "Panel / Shape (cut)" },
  { value: "lettering", label: "Lettering (cut)" },
  { value: "engraving", label: "Engraving only" },
  { value: "engrave_and_cut", label: "Engrave + Cut" },
];
const MATERIALS = ["Acrylic", "Wood", "Leather"];

export default function LaserItemCard({ item, index, onChange, onRemove }) {
  const set = (patch) => onChange(index, patch);
  const type = item.item_type || "panel";
  const doesEngrave = type === "engraving" || type === "engrave_and_cut";
  const doesCut = type !== "engraving";

  const numField = (key, label) => (
    <label className="text-xs text-gray-500">
      {label}
      <Input
        type="number"
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
            value={type}
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
            value={item.material_type || "Acrylic"}
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
            placeholder='e.g. 1/8"'
            onChange={(e) => set({ material_thickness: e.target.value })}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {numField("quantity", "Qty")}
        {doesEngrave && numField("engrave_area_sqin", "Engrave area (sq in)")}
        {doesEngrave && numField("engrave_speed_sqipm", "Engrave sq in/min")}
        {doesCut && type === "lettering" && numField("num_letters", "# Letters")}
        {doesCut && type === "lettering" && numField("letter_height", "Letter height (in)")}
        {doesCut && type !== "lettering" && numField("length", "Length (in)")}
        {doesCut && type !== "lettering" && numField("width", "Width (in)")}
        {doesCut && numField("cut_speed_ipm", "Cut speed (ipm)")}
        {doesCut && numField("total_cut_length_inches", "Cut length override (in)")}
      </div>

      <div className="flex flex-wrap gap-x-4 text-xs text-gray-500 border-t border-gray-100 pt-2">
        <span>Engrave {Number(item.engrave_hours || 0).toFixed(2)} hr</span>
        <span>Cut {Number(item.cut_hours || 0).toFixed(2)} hr</span>
        <span>
          {money(item.machine_cost)} machine · {money(item.labor_cost)} labor
        </span>
        <span className="font-semibold text-gray-900 ml-auto">{money(item.item_total_cost)}</span>
      </div>
    </div>
  );
}