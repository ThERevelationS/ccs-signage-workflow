import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, ArrowUpToLine as LucideLadder } from "lucide-react";
import {
  selectedEquipmentFromInventory,
  recalcEquipmentRow,
  durationUnitLabel,
  isOwnedEquipment,
} from "./equipmentSuggester";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

/**
 * Dedicated ladder picker for the Crew & Equipment page. Ladders live in the same
 * equipment inventory (equipment_type === "ladder") and feed the same
 * selectedEquipment list the rest of the equipment uses — this card just gives
 * them a focused, obvious control alongside the vehicle/equipment requirements.
 */
export default function LadderSelector({
  selectedEquipment = [],
  onChange,
  equipmentInventory = [],
  projectLaborHours = 0,
  crewSize = 0,
}) {
  const ladderInventory = useMemo(
    () => equipmentInventory.filter((e) => e.is_active !== false && e.equipment_type === "ladder"),
    [equipmentInventory]
  );

  const selectedIds = new Set(selectedEquipment.map((e) => e.equipment_id));

  // Which rows in the current selection are ladders
  const ladderRows = selectedEquipment
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => row.equipment_type === "ladder");

  const addableLadders = ladderInventory.filter((e) => !selectedIds.has(e.id));

  const handleAdd = (inv) => {
    if (!inv || selectedIds.has(inv.id)) return;
    const row = selectedEquipmentFromInventory(inv, projectLaborHours, crewSize);
    onChange([...selectedEquipment, row]);
  };

  const handleUpdate = (idx, patch) => {
    const next = [...selectedEquipment];
    next[idx] = recalcEquipmentRow({ ...next[idx], ...patch });
    onChange(next);
  };

  const handleRemove = (idx) => {
    const next = [...selectedEquipment];
    next.splice(idx, 1);
    onChange(next);
  };

  const totalCost = ladderRows.reduce((s, { row }) => s + (parseFloat(row.total_cost) || 0), 0);

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <LucideLadder className="w-5 h-5 text-purple-600" />
            Ladders ({ladderRows.length})
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Select a ladder to account for installation tools alongside your vehicles.
          </p>
        </div>
        {addableLadders.length > 0 ? (
          <Select
            key={ladderRows.length}
            onValueChange={(val) => {
              const inv = ladderInventory.find((e) => e.id === val);
              if (inv) handleAdd(inv);
            }}
          >
            <SelectTrigger className="w-56 h-9 text-sm bg-purple-50 border-purple-300 text-purple-800 font-semibold hover:bg-purple-100">
              <Plus className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Add a ladder..." />
            </SelectTrigger>
            <SelectContent>
              {addableLadders.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.equipment_name}
                  {e.max_height_feet ? ` (${e.max_height_feet}ft)` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : ladderInventory.length === 0 ? (
          <span className="text-xs text-slate-400 italic">No ladders in inventory</span>
        ) : (
          <span className="text-xs text-slate-400 italic">All ladders added</span>
        )}
      </CardHeader>
      <CardContent>
        {ladderRows.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 bg-slate-50/40 rounded-lg p-6 text-center">
            <LucideLadder className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No ladder selected</p>
            <p className="text-xs text-slate-400 mt-1">
              {ladderInventory.length === 0
                ? "Add a ladder (equipment type = ladder) in Equipment Inventory first."
                : "Pick a ladder from the dropdown above."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {ladderRows.map(({ row, idx }) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <div className="grid md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-4">
                    <Label className="text-xs">Ladder</Label>
                    <div className="text-sm font-medium mt-0.5">{row.equipment_name}</div>
                    <div className="text-xs text-slate-500 capitalize">
                      {row.pricing_mode?.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Duration ({durationUnitLabel(row.pricing_mode)})</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={row.duration}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleUpdate(idx, { duration: parseFloat(e.target.value) || 0 })}
                      className="h-8 mt-0.5"
                      disabled={row.pricing_mode === "owned_flat" || row.pricing_mode === "per_project_flat"}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Unit Cost</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={row.unit_cost}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleUpdate(idx, { unit_cost: parseFloat(e.target.value) || 0 })}
                      className="h-8 mt-0.5"
                    />
                  </div>
                  <div className="md:col-span-3">
                    {isOwnedEquipment(row) ? (
                      <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 inline-block">
                        Owned — no delivery fee
                      </span>
                    ) : (
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs mb-1">
                        <Checkbox
                          checked={!!row.include_delivery}
                          onCheckedChange={(c) => handleUpdate(idx, { include_delivery: !!c })}
                        />
                        <span>Delivery/Pickup ({fmt(row.delivery_pickup_cost)})</span>
                      </label>
                    )}
                  </div>
                  <div className="md:col-span-1 flex items-end justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemove(idx)}
                      className="text-red-500 hover:bg-red-50 h-8 w-8 p-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end mt-2 pt-2 border-t border-slate-200 text-sm">
                  <span className="text-slate-600 mr-2">Line Total:</span>
                  <span className="font-semibold tabular-nums">{fmt(row.total_cost)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2 border-t border-slate-200">
              <div className="text-right">
                <div className="text-xs text-slate-500">Total Ladder Cost</div>
                <div className="text-lg font-bold tabular-nums">{fmt(totalCost)}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}