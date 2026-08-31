import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Users, Wand2 } from "lucide-react";
import { recalcPersonnelRow, suggestPersonnelForProject } from "./equipmentSuggester";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

const ROLE_OPTIONS = ["Crew Lead", "Installer", "Helper"];

const emptyRow = () => ({
  name: "",
  role: "Installer",
  hourly_rate: 0,
  hours: 0,
  total_cost: 0,
});

export default function PersonnelSelector({
  personnel = [],
  onChange,
  projectLaborHours = 0,
  roleRates = {},
  items = [],
}) {
  // Resolve the rate for a given role (fallback to Installer rate, then 0)
  const rateForRole = (role) => {
    const r = parseFloat(roleRates[role]);
    if (!isNaN(r) && r > 0) return r;
    const fallback = parseFloat(roleRates.Installer);
    return !isNaN(fallback) ? fallback : 0;
  };

  const handleAdd = () => {
    const row = emptyRow();
    row.hourly_rate = rateForRole(row.role);
    onChange([...personnel, row]);
  };

  const handleUpdate = (idx, patch) => {
    const next = [...personnel];
    const merged = { ...next[idx], ...patch };
    // When the role changes, auto-fill the rate from the role's setting
    if ("role" in patch && patch.role !== next[idx].role) {
      merged.hourly_rate = rateForRole(patch.role);
    }
    next[idx] = recalcPersonnelRow(merged);
    onChange(next);
  };

  const handleRemove = (idx) => {
    const next = [...personnel];
    next.splice(idx, 1);
    onChange(next);
  };

  // Quick-fill: build a suggested crew from project height & letter count.
  // Uses the shared suggestPersonnelForProject helper so the auto-trigger and
  // the manual button produce the exact same crew.
  const handleAutoFillCrew = () => {
    const newCrew = suggestPersonnelForProject(items, projectLaborHours, rateForRole);
    onChange(newCrew);
  };

  const totalCost = personnel.reduce(
    (s, p) => s + (parseFloat(p.total_cost) || 0),
    0
  );
  const totalHours = personnel.reduce(
    (s, p) => s + (parseFloat(p.hours) || 0),
    0
  );

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Personnel ({personnel.length})
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Assign crew members and their hours for this job.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoFillCrew}
            className="h-9 text-xs"
            title="Auto-suggest crew based on project size & height"
          >
            <Wand2 className="w-3.5 h-3.5 mr-1" /> Auto-Suggest Crew
          </Button>
          <Button
            size="sm"
            onClick={handleAdd}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Person
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {personnel.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 bg-slate-50/50 rounded-lg p-8 text-center">
            <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">No personnel assigned</p>
            <p className="text-xs text-slate-500 mt-1">
              Add crew members or use Auto-Suggest to populate based on the project.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {personnel.map((row, idx) => (
              <div
                key={idx}
                className="border border-slate-200 rounded-lg p-3 bg-slate-50/50"
              >
                <div className="grid md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-3">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={row.name}
                      onChange={(e) => handleUpdate(idx, { name: e.target.value })}
                      placeholder="e.g. Mike"
                      className="h-8 mt-0.5"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">Role</Label>
                    <select
                      value={row.role || "Installer"}
                      onChange={(e) => handleUpdate(idx, { role: e.target.value })}
                      className="h-8 mt-0.5 w-full border border-slate-200 rounded-md px-2 text-sm bg-white"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Rate $/hr</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={row.hourly_rate}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        handleUpdate(idx, { hourly_rate: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 mt-0.5"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Hours</Label>
                    <Input
                      type="number"
                      step="0.25"
                      value={row.hours}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        handleUpdate(idx, { hours: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 mt-0.5"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-xs">Total</Label>
                    <div className="h-8 mt-0.5 text-sm font-medium flex items-center tabular-nums">
                      {fmt(row.total_cost)}
                    </div>
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
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
              <div>
                <span className="text-slate-500">Total Hours:</span>{" "}
                <span className="font-semibold tabular-nums">{totalHours.toFixed(2)}</span>
                {projectLaborHours > 0 && (
                  <span className="text-xs text-slate-400 ml-2">
                    (calculated: {projectLaborHours.toFixed(2)} hrs)
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500">Total Personnel Cost: </span>
                <span className="text-lg font-bold tabular-nums">{fmt(totalCost)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}