import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// A single labor-time card for the Raceway install settings sub-tab.
// Mirrors the visual rhythm of BaseTimesSizeCard but each card edits ONE
// raceway labor setting (per-foot, per-letter, per-raceway). The "title" /
// "range" / "suffix" all come from the caller.
export default function RacewayTimesCard({
  title,
  subtitle,
  badgeLabel,
  badgeColor = "blue", // blue | indigo | sky
  settingName,
  unitLabel,
  suffix,
  description,
  settings,
  updateSetting,
  isLocked,
}) {
  const value = settings[settingName];
  const numVal = parseFloat(value) || 0;

  const badgeBg = {
    blue: "bg-blue-100/60 border-blue-200/60 text-blue-900",
    indigo: "bg-indigo-100/60 border-indigo-200/60 text-indigo-900",
    sky: "bg-sky-100/60 border-sky-200/60 text-sky-900",
  }[badgeColor];

  const cardBg = {
    blue: "bg-blue-50/30 hover:bg-blue-50/60",
    indigo: "bg-indigo-50/30 hover:bg-indigo-50/60",
    sky: "bg-sky-50/30 hover:bg-sky-50/60",
  }[badgeColor];

  return (
    <div className={`border border-slate-200 rounded-xl p-4 transition-colors space-y-3 ${cardBg}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">{unitLabel}</div>
          <div className="text-sm font-bold text-slate-900 tabular-nums">{numVal} min</div>
        </div>
      </div>

      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${badgeBg}`}>
        <span className="text-[11px] font-medium">{badgeLabel}</span>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <Label htmlFor={settingName} className="text-xs font-medium text-slate-700">Minutes</Label>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{suffix}</span>
        </div>
        <Input
          type="number"
          step="0.25"
          id={settingName}
          value={value ?? ""}
          onChange={(e) => updateSetting(settingName, e.target.value)}
          disabled={isLocked}
          className="h-10 bg-white border-slate-200 focus:border-slate-400 focus:ring-0 text-sm tabular-nums font-medium"
          min="0"
        />
        {description && <p className="mt-1.5 text-xs text-slate-500 leading-tight">{description}</p>}
      </div>
    </div>
  );
}