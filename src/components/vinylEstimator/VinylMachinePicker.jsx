// Picks printer + cutter + laminator. Exposes per-workflow Print Quality
// (Draft / Production / High Quality) — High Quality is the default.

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Printer, Scissors, Layers } from "lucide-react";
import { PRINT_QUALITY_TIERS, inkCostPerSqIn } from "@/components/vinylInventory/vinylConstants";

const MachineRow = ({ icon: RowIcon, label, machines, value, onValueChange, apply, onApplyChange, disabled, accent, children }) => (
  <div className={`p-3 rounded-lg border ${apply ? accent : "bg-slate-50 border-slate-200 opacity-70"}`}>
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <RowIcon className="w-4 h-4" /> {label}
      </div>
      <Switch checked={apply} onCheckedChange={onApplyChange} disabled={disabled} />
    </div>
    <Select value={value || ""} onValueChange={onValueChange} disabled={!apply}>
      <SelectTrigger className="h-9"><SelectValue placeholder="Choose machine…" /></SelectTrigger>
      <SelectContent>
        {machines.map(m => (
          <SelectItem key={m.id} value={m.id}>{m.machine_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    {apply && machines.length === 0 && (
      <p className="text-[11px] text-amber-600 mt-1">No machines configured. Add one in Vinyl Settings.</p>
    )}
    {children}
  </div>
);

export default function VinylMachinePicker({ machines, value, onChange }) {
  const printers   = machines.filter(m => m.is_active !== false && (m.machine_type === "printer" || m.machine_type === "print_and_cut"));
  const cutters    = machines.filter(m => m.is_active !== false && (m.machine_type === "cutter"  || m.machine_type === "print_and_cut"));
  const laminators = machines.filter(m => m.is_active !== false && m.machine_type === "laminator");

  const printer = printers.find(m => m.id === value.printer_id);
  const quality = value.printQuality || "high_quality";

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Production Machines</CardTitle></CardHeader>
      <CardContent className="grid md:grid-cols-3 gap-3">
        <MachineRow
          icon={Printer} label="Printer"
          machines={printers}
          value={value.printer_id}
          onValueChange={(id) => onChange({ printer_id: id })}
          apply={value.applyPrint}
          onApplyChange={(v) => onChange({ applyPrint: v })}
          accent="bg-emerald-50 border-emerald-200"
        >
          {value.applyPrint && (
            <div className="mt-2">
              <Label className="text-[10px] uppercase tracking-wider text-emerald-800">Print Quality</Label>
              <Select value={quality} onValueChange={(q) => onChange({ printQuality: q })}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRINT_QUALITY_TIERS.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label} · ${inkCostPerSqIn(printer, t.id).toFixed(3)}/sqin
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </MachineRow>
        <MachineRow
          icon={Scissors} label="Cutter"
          machines={cutters}
          value={value.cutter_id}
          onValueChange={(id) => onChange({ cutter_id: id })}
          apply={value.applyCut}
          onApplyChange={(v) => onChange({ applyCut: v })}
          accent="bg-rose-50 border-rose-200"
        />
        <MachineRow
          icon={Layers} label="Laminator"
          machines={laminators}
          value={value.laminator_id}
          onValueChange={(id) => onChange({ laminator_id: id })}
          apply={value.applyLaminate}
          onApplyChange={(v) => onChange({ applyLaminate: v })}
          accent="bg-purple-50 border-purple-200"
        />
      </CardContent>
    </Card>
  );
}