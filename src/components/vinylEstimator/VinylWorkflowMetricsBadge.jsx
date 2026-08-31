// Inline per-workflow margin / yield meter shown in the card header. Feature #20, #21.

import React from "react";

export default function VinylWorkflowMetricsBadge({ metrics }) {
  if (!metrics || metrics.sqFtPulled <= 0) return null;
  const yieldPct = metrics.yieldPercent;
  const tone =
    yieldPct >= 75 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
    yieldPct >= 50 ? "bg-amber-100 text-amber-800 border-amber-200" :
                     "bg-red-100 text-red-800 border-red-200";

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center gap-2 text-[10px] px-2 py-0.5 rounded border ${tone}`}>
        <span>Yield: <b className="tabular-nums">{yieldPct.toFixed(0)}%</b></span>
        <span className="text-slate-500">·</span>
        <span>${metrics.costPerSqFt.toFixed(2)}/sqft</span>
      </div>
      {/* Yield bar */}
      <div className="w-32 h-1 rounded-full overflow-hidden bg-slate-200" title={`${yieldPct.toFixed(1)}% used, ${metrics.wastePercent.toFixed(1)}% waste`}>
        <div
          className={`h-full transition-all ${yieldPct >= 75 ? "bg-emerald-500" : yieldPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${Math.min(100, yieldPct)}%` }}
        />
      </div>
    </div>
  );
}