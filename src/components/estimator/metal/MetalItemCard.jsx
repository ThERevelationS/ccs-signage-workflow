import React from "react";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const selectCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

const ITEM_TYPES = [
  "channel_letters",
  "cabinet_sign",
  "monument_sign",
  "pole_sign",
  "flat_cut_letters",
  "fabricated_letters",
  "frame_assembly",
  "custom_brackets",
];
const labelFor = (t) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const invLabel = (inv) =>
  `${inv.material_type?.replace(/_/g, " ")} ${inv.product_type?.replace(/_/g, " ")} ${inv.size}${
    inv.thickness_gauge ? ` (${inv.thickness_gauge})` : ""
  } — $${Number(inv.cost_per_unit || 0).toFixed(2)} ${inv.unit_type?.replace("per_", "/")}`;

export default function MetalItemCard({ item, index, inventory, onChange, onRemove }) {
  const set = (patch) => onChange(index, patch);

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
          placeholder="Item description"
          onChange={(e) => set({ description: e.target.value })}
        />
        <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-600 p-2">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">
          Item type
          <select
            value={item.item_type || "channel_letters"}
            onChange={(e) => set({ item_type: e.target.value })}
            className={selectCls}
          >
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {labelFor(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Material from inventory
          <select
            value={item.inventory_item_id || ""}
            onChange={(e) => set({ inventory_item_id: e.target.value })}
            className={selectCls}
          >
            <option value="">— none —</option>
            {inventory.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {invLabel(inv)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {numField("quantity", "Qty")}
        {numField("material_length_ft", "Material (ft)")}
        {numField("fabrication_hours", "Fab hrs")}
        {numField("welding_hours", "Weld hrs")}
        {numField("finishing_hours", "Finish hrs")}
      </div>

      <div className="flex flex-wrap gap-x-4 text-xs text-gray-500 border-t border-gray-100 pt-2">
        <span>{money(item.material_cost)} material</span>
        <span>{money(item.supplies_cost)} supplies</span>
        <span>
          {money(
            Number(item.fabrication_cost || 0) +
              Number(item.welding_cost || 0) +
              Number(item.finishing_cost || 0)
          )}{" "}
          labor
        </span>
        <span className="font-semibold text-gray-900 ml-auto">{money(item.item_total_cost)}</span>
      </div>
    </div>
  );
}