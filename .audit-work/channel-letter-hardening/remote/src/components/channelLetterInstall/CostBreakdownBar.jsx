import React from "react";

// Compact horizontal stacked bar showing where money is going.
// Supports two APIs:
//   1. <CostBreakdownBar labor={...} materials={...} />  (legacy, used by InstallLineItem)
//   2. <CostBreakdownBar segments={[{label, value, color}]} />  (new)
export default function CostBreakdownBar({ segments, labor, materials }) {
  let segs = segments;
  let dark = true;

  // Legacy mode: build segments from labor/materials and render light-mode
  if (!segs && (labor != null || materials != null)) {
    segs = [
      { label: "Labor",     value: labor || 0,     color: "bg-purple-400" },
      { label: "Materials", value: materials || 0, color: "bg-emerald-400" },
    ];
    dark = false;
  }

  segs = segs || [];
  const total = segs.reduce((s, x) => s + (parseFloat(x.value) || 0), 0);
  const trackClass = dark ? "bg-white/10" : "bg-slate-100";
  const legendClass = dark ? "text-slate-300" : "text-slate-500";

  if (total <= 0) {
    return <div className={`h-2 w-full rounded-full ${trackClass}`} />;
  }

  return (
    <div className="space-y-1.5">
      <div className={`h-2 w-full rounded-full ${trackClass} overflow-hidden flex`}>
        {segs.map((s, i) => {
          const v = parseFloat(s.value) || 0;
          if (v <= 0) return null;
          const pct = (v / total) * 100;
          return (
            <div
              key={i}
              className={`${s.color} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${pct.toFixed(0)}%`}
            />
          );
        })}
      </div>
      <div className={`flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] ${legendClass}`}>
        {segs
          .filter((s) => (parseFloat(s.value) || 0) > 0)
          .map((s, i) => {
            const pct = ((parseFloat(s.value) || 0) / total) * 100;
            return (
              <span key={i} className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                {s.label} {pct.toFixed(0)}%
              </span>
            );
          })}
      </div>
    </div>
  );
}