// Right-side summary panel — cost breakdown + supplies & markup inputs.

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const Line = ({ label, value, muted, bold }) => (
  <div className={`flex justify-between text-sm ${muted ? "text-slate-500" : "text-slate-800"} ${bold ? "font-bold text-base" : ""}`}>
    <span>{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

export default function VinylSummaryPanel({
  calc, vinyl, laminate, printer, cutter, laminator,
  suppliesPercent, onSuppliesPercentChange,
  extraSupplies, onExtraSuppliesChange,
  markupPercent, onMarkupPercentChange,
  personnelCost = 0,
}) {
  const baseSupplies = (calc.materialCost || 0) * ((parseFloat(suppliesPercent) || 0) / 100);
  const supplies = baseSupplies + (parseFloat(extraSupplies) || 0);
  const subtotal = calc.totalCost + supplies + personnelCost;
  const markupAmt = subtotal * ((parseFloat(markupPercent) || 0) / 100);
  const grandTotal = subtotal + markupAmt;

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-2"><CardTitle className="text-base">Estimate Summary</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <Line label={`Vinyl${vinyl ? ` · ${vinyl.vinyl_name}` : ""}`} value={fmt(calc.vinylCost)} />
          {laminate && <Line label={`Laminate · ${laminate.vinyl_name}`} value={fmt(calc.laminateCost)} />}
          {printer && <Line label="Ink" value={fmt(calc.inkCost)} muted />}
          {cutter && <Line label="Blade Wear" value={fmt(calc.bladeCost)} muted />}
        </div>

        <div className="border-t pt-2 space-y-1">
          <Line label="Machine Time" value={fmt(calc.machineCost)} />
          <Line label={`Labor · ${calc.laborHours.toFixed(2)} hr`} value={fmt(calc.laborCost)} />
          {personnelCost > 0 && <Line label="Personnel" value={fmt(personnelCost)} />}
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Supplies %</Label>
              <Input type="number" step="0.5" value={suppliesPercent} onChange={(e) => onSuppliesPercentChange(parseFloat(e.target.value) || 0)} className="h-8 text-sm tabular-nums" />
            </div>
            <div>
              <Label className="text-[11px]">Extra Supplies $</Label>
              <Input type="number" step="1" value={extraSupplies} onChange={(e) => onExtraSuppliesChange(parseFloat(e.target.value) || 0)} className="h-8 text-sm tabular-nums" />
            </div>
          </div>
          <Line label="Supplies Total" value={fmt(supplies)} muted />
        </div>

        <div className="border-t pt-3 space-y-2">
          <div>
            <Label className="text-[11px]">Markup %</Label>
            <Input type="number" step="0.5" value={markupPercent} onChange={(e) => onMarkupPercentChange(parseFloat(e.target.value) || 0)} className="h-8 text-sm tabular-nums" />
          </div>
          <Line label="Subtotal" value={fmt(subtotal)} muted />
          <Line label="Markup" value={fmt(markupAmt)} muted />
        </div>

        <div className="border-t pt-3 bg-slate-900 text-white -mx-6 -mb-6 px-6 py-4 rounded-b-xl">
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="tabular-nums">{fmt(grandTotal)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}