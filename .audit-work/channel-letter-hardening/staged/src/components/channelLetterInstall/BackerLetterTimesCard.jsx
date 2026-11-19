import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers } from "lucide-react";
import AutoGrowNotes from "./AutoGrowNotes";

// One card per letter size for the "Dimensional Letters w/ Backer" base-time settings.
// Matches the visual style of BaseTimesSizeCard but without env / height pills
// since these times don't vary by interior/exterior or height bucket.
export default function BackerLetterTimesCard({
  sizeKey,
  sizeLabel,
  sizeRange,
  settings,
  updateSetting,
  isLocked,
}) {
  const drillName = `install_dim_backer_drill_rate_${sizeKey}`;
  const prepName = `install_dim_backer_prep_rate_${sizeKey}`;

  const drillVal = parseFloat(settings[drillName]) || 0;
  const prepVal = parseFloat(settings[prepName]) || 0;
  const total = drillVal + prepVal;

  const renderField = (name, label) => {
    const value = settings[name];
    const notesName = `${name}__notes`;
    const notesValue = settings[notesName];
    return (
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <Label htmlFor={name} className="text-xs font-medium text-slate-700">{label}</Label>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">min</span>
        </div>
        <div className="flex items-start gap-2">
          <Input
            type="number"
            step="1"
            id={name}
            value={value ?? ""}
            onChange={(e) => updateSetting(name, e.target.value)}
            disabled={isLocked}
            className="h-9 w-14 flex-shrink-0 bg-white border-slate-200 focus:border-slate-400 focus:ring-0 text-sm tabular-nums font-medium px-1.5 text-center"
            min="0"
          />
          <AutoGrowNotes
            value={notesValue}
            onChange={(v) => updateSetting(notesName, v)}
            disabled={isLocked}
            className="flex-1 min-w-0"
            minHeightPx={36}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-orange-50/30 hover:bg-orange-50/60 transition-colors space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{sizeLabel}</div>
          <div className="text-[11px] text-slate-500">{sizeRange}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Total / letter</div>
          <div className="text-sm font-bold text-slate-900 tabular-nums">{total} min</div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-100/60 border border-orange-200/60">
        <Layers className="w-3.5 h-3.5 text-orange-700" />
        <span className="text-[11px] font-medium text-orange-900">Drill + Assemble to Backer</span>
      </div>

      <div className="space-y-2 pt-1">
        {renderField(drillName, "Drill Pattern / Drill Time")}
        {renderField(prepName, "Assembly Time")}
      </div>
    </div>
  );
}