// Sticky summary card for the right side of the Vinyl Estimator page.
// Rolls up across all workflows + installation + travel + personnel + markup.

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const Line = ({ label, value, muted }) => (
  <div className={`flex justify-between text-sm ${muted ? "text-slate-500" : "text-slate-800"}`}>
    <span className="truncate pr-2">{label}</span>
    <span className="tabular-nums shrink-0">{value}</span>
  </div>
);

export default function VinylProjectSummaryCard({ rollup, project, onUpdateProject, onSave, isSaving }) {
  return (
    <Card className="sticky top-4 bg-white border-0 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-base">Estimate Summary</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <Line label="Vinyl"    value={fmt(rollup.vinylCost)} />
          <Line label="Laminate" value={fmt(rollup.laminateCost)} muted />
          <Line label="Ink"      value={fmt(rollup.inkCost)} muted />
          <Line label="Blade"    value={fmt(rollup.bladeCost)} muted />
        </div>

        <div className="border-t pt-2 space-y-1">
          <Line label="Machine Time" value={fmt(rollup.machineCost)} />
          <Line label={`Labor · ${rollup.laborHours.toFixed(2)} hr`} value={fmt(rollup.laborCost)} />
        </div>

        {(rollup.equipmentCost > 0 || rollup.personnelCost > 0 || rollup.travelCost > 0) && (
          <div className="border-t pt-2 space-y-1">
            {rollup.equipmentCost > 0 && <Line label="Equipment" value={fmt(rollup.equipmentCost)} />}
            {rollup.personnelCost > 0 && <Line label="Personnel" value={fmt(rollup.personnelCost)} />}
            {rollup.travelCost > 0    && <Line label="Travel"    value={fmt(rollup.travelCost)} />}
          </div>
        )}

        <div className="border-t pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Supplies %</Label>
              <Input type="number" step="0.5"
                value={project.supplies_percent_of_materials}
                onChange={(e) => onUpdateProject({ supplies_percent_of_materials: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm tabular-nums" />
            </div>
            <div>
              <Label className="text-[11px]">Extra Supplies $</Label>
              <Input type="number" step="1"
                value={project.extra_supplies_cost}
                onChange={(e) => onUpdateProject({ extra_supplies_cost: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm tabular-nums" />
            </div>
          </div>
          <Line label="Supplies Total" value={fmt(rollup.supplies)} muted />
        </div>

        <div className="border-t pt-3 space-y-2">
          <div>
            <Label className="text-[11px]">Markup %</Label>
            <Input type="number" step="0.5"
              value={project.markup_percent}
              onChange={(e) => onUpdateProject({ markup_percent: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm tabular-nums" />
          </div>
          <Line label="Subtotal" value={fmt(rollup.subtotal)} muted />
          <Line label="Markup"   value={fmt(rollup.markupAmount)} muted />
        </div>

        <div className="border-t pt-3 bg-slate-900 text-white -mx-6 -mb-6 px-6 py-4 rounded-b-xl">
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="tabular-nums">{fmt(rollup.totalCost)}</span>
          </div>
        </div>

        <Button onClick={onSave} disabled={isSaving} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-3">
          {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Estimate
        </Button>
      </CardContent>
    </Card>
  );
}