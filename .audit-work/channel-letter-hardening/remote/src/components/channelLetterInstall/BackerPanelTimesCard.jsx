import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ruler } from "lucide-react";

// One card per backer-panel size range. Each range has:
//  - Max size (sqft)
//  - Install minutes for the range
//  - Per 1/4" thickness extra (additive minutes)
export default function BackerPanelTimesCard({
  rangeNumber,
  settings,
  updateSetting,
  isLocked,
}) {
  const maxName  = `install_backer_panel_range_${rangeNumber}_max_sqft`;
  const minsName = `install_backer_panel_range_${rangeNumber}_minutes`;
  const thickName = `install_backer_panel_range_${rangeNumber}_thickness_extra`;

  const maxVal = parseFloat(settings[maxName]) || 0;
  const minsVal = parseFloat(settings[minsName]) || 0;

  // Show the previous range's max as the lower bound of this range, for clarity.
  const lowerBound = rangeNumber === 1
    ? 0
    : (parseFloat(settings[`install_backer_panel_range_${rangeNumber - 1}_max_sqft`]) || 0);

  const renderField = (name, label, suffix, step = "1") => (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <Label htmlFor={name} className="text-xs font-medium text-slate-700">{label}</Label>
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{suffix}</span>
      </div>
      <Input
        type="number"
        step={step}
        id={name}
        value={settings[name] ?? ""}
        onChange={(e) => updateSetting(name, e.target.value)}
        disabled={isLocked}
        className="h-9 bg-white border-slate-200 focus:border-slate-400 focus:ring-0 text-sm tabular-nums font-medium"
        min="0"
      />
    </div>
  );

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-orange-50/30 hover:bg-orange-50/60 transition-colors space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Range {rangeNumber}</div>
          <div className="text-[11px] text-slate-500">
            {lowerBound > 0 ? `${lowerBound}–${maxVal}` : `up to ${maxVal}`} sqft
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Install / backer</div>
          <div className="text-sm font-bold text-slate-900 tabular-nums">{minsVal} min</div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-100/60 border border-orange-200/60">
        <Ruler className="w-3.5 h-3.5 text-orange-700" />
        <span className="text-[11px] font-medium text-orange-900">Per-Backer Install Time</span>
      </div>

      <div className="space-y-2 pt-1">
        {renderField(maxName, "Max Size", "sqft")}
        {renderField(minsName, "Install Time", "min/backer")}
        {renderField(thickName, "Per 1/4\" Thickness", "+min", "0.5")}
      </div>
    </div>
  );
}