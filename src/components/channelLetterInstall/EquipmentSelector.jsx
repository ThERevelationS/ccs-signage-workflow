import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Sparkles, HardHat, AlertCircle, Clock } from "lucide-react";

const BOOM_TYPES = new Set(["boom_lift", "boom_truck"]);
const fmtMoney = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;
import {
  suggestEquipmentForProject,
  selectedEquipmentFromInventory,
  recalcEquipmentRow,
  durationUnitLabel,
  isOwnedEquipment,
  suggestCrewSize,
} from "./equipmentSuggester";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

export default function EquipmentSelector({
  selectedEquipment = [],
  onChange,
  equipmentInventory = [],
  items = [],
  projectLaborHours = 0,
  crewSize = 0,
}) {
  // On-site crew size — the actual assigned crew wins, otherwise the suggested crew.
  // Used to convert man-hours into on-site clock time for rental durations.
  const effectiveCrewSize = crewSize > 0 ? crewSize : suggestCrewSize(items);

  const activeInventory = useMemo(
    () => equipmentInventory.filter((e) => e.is_active !== false),
    [equipmentInventory]
  );

  const suggestions = useMemo(
    () => suggestEquipmentForProject(items, activeInventory),
    [items, activeInventory]
  );

  const selectedIds = new Set(selectedEquipment.map((e) => e.equipment_id));

  const handleAdd = (inv) => {
    if (!inv || selectedIds.has(inv.id)) return;
    const row = selectedEquipmentFromInventory(inv, projectLaborHours, effectiveCrewSize);
    onChange([...selectedEquipment, row]);
  };

  const handleAcceptSuggestion = (inv) => handleAdd(inv);

  const handleAcceptAllSuggestions = () => {
    const toAdd = suggestions
      .filter((s) => !selectedIds.has(s.id))
      .map((s) => selectedEquipmentFromInventory(s, projectLaborHours, effectiveCrewSize));
    if (toAdd.length === 0) return;
    onChange([...selectedEquipment, ...toAdd]);
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

  const totalCost = selectedEquipment.reduce(
    (s, e) => s + (parseFloat(e.total_cost) || 0),
    0
  );

  // Inventory items not yet selected — used for the "Add" dropdown
  const addableInventory = activeInventory.filter((e) => !selectedIds.has(e.id));

  const newSuggestions = suggestions.filter((s) => !selectedIds.has(s.id));

  return (
    <div className="space-y-3">
      {/* Suggestions card */}
      {newSuggestions.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-900">
              <Sparkles className="w-4 h-4" /> Suggested Equipment
            </CardTitle>
            <p className="text-xs text-amber-800">
              Based on your line items, we recommend the following equipment.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {newSuggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-white rounded-md border border-amber-200 px-3 py-2"
              >
                <div className="text-sm">
                  <div className="font-medium">{s.equipment_name}</div>
                  <div className="text-xs text-slate-500 capitalize">
                    {s.equipment_type?.replace("_", " ")}
                    {s.max_height_feet ? ` · ${s.max_height_feet}ft max` : ""}
                    {s.ownership ? ` · ${s.ownership}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAcceptSuggestion(s)}
                  className="h-8 text-xs bg-white"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            ))}
            {newSuggestions.length > 1 && (
              <Button
                size="sm"
                onClick={handleAcceptAllSuggestions}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                Accept All Suggestions
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected equipment list */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <HardHat className="w-5 h-5 text-purple-600" />
              Selected Equipment ({selectedEquipment.length})
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              At least one piece of equipment is required.
            </p>
          </div>
          {addableInventory.length > 0 ? (
            <Select
              key={selectedEquipment.length}
              onValueChange={(val) => {
                const inv = activeInventory.find((e) => e.id === val);
                if (inv) handleAdd(inv);
              }}
            >
              <SelectTrigger className="w-60 h-9 text-sm bg-purple-50 border-purple-300 text-purple-800 font-semibold hover:bg-purple-100">
                <Plus className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Add another piece of equipment..." />
              </SelectTrigger>
              <SelectContent>
                {addableInventory.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.equipment_name}
                    {e.max_height_feet ? ` (${e.max_height_feet}ft)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-slate-400 italic">
              All inventory equipment has been added
            </span>
          )}
        </CardHeader>
        <CardContent>
          {selectedEquipment.length === 0 ? (
            <div className="border-2 border-dashed border-red-200 bg-red-50/30 rounded-lg p-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-700 font-medium">No equipment selected</p>
              <p className="text-xs text-red-600 mt-1">
                Add equipment from the dropdown above or accept a suggestion.
              </p>
              {activeInventory.length === 0 && (
                <p className="text-xs text-slate-500 mt-3">
                  Your equipment inventory is empty. Add equipment in the Inventory page first.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {selectedEquipment.map((row, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-lg p-3 bg-slate-50/50"
                >
                  <div className="grid md:grid-cols-12 gap-2 items-end">
                    <div className="md:col-span-4">
                      <Label className="text-xs">Equipment</Label>
                      <div className="text-sm font-medium mt-0.5">{row.equipment_name}</div>
                      <div className="text-xs text-slate-500 capitalize">
                        {row.equipment_type?.replace("_", " ")} · {row.pricing_mode?.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Duration ({durationUnitLabel(row.pricing_mode)})</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={row.duration}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleUpdate(idx, { duration: parseFloat(e.target.value) || 0 })
                        }
                        className="h-8 mt-0.5"
                        disabled={
                          row.pricing_mode === "owned_flat" ||
                          row.pricing_mode === "per_project_flat"
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Unit Cost</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.unit_cost}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleUpdate(idx, { unit_cost: parseFloat(e.target.value) || 0 })
                        }
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
                  {BOOM_TYPES.has(row.equipment_type) && (parseFloat(row.idle_running_cost_per_hour) || 0) > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200 grid md:grid-cols-12 gap-2 items-end bg-amber-50/50 -mx-3 -mb-3 px-3 py-2 rounded-b-lg">
                      <div className="md:col-span-5 flex items-center gap-1.5 text-xs text-amber-900">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="font-medium">Idle running on-site</span>
                        <span className="text-amber-700/80">— added to rental rate</span>
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Idle Hours</Label>
                        <Input
                          type="number"
                          step="0.25"
                          value={row.idle_hours || 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            handleUpdate(idx, { idle_hours: parseFloat(e.target.value) || 0 })
                          }
                          className="h-8 mt-0.5"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">$/hr Idle</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.idle_running_cost_per_hour || 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            handleUpdate(idx, { idle_running_cost_per_hour: parseFloat(e.target.value) || 0 })
                          }
                          className="h-8 mt-0.5"
                        />
                      </div>
                      <div className="md:col-span-3 text-right">
                        <div className="text-[10px] text-amber-800">Idle Cost</div>
                        <div className="text-sm font-semibold tabular-nums text-amber-900">
                          {fmtMoney(row.idle_cost)}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end mt-2 pt-2 border-t border-slate-200 text-sm">
                    <span className="text-slate-600 mr-2">Line Total:</span>
                    <span className="font-semibold tabular-nums">{fmt(row.total_cost)}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t border-slate-200">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Total Equipment Cost</div>
                  <div className="text-lg font-bold tabular-nums">{fmt(totalCost)}</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}