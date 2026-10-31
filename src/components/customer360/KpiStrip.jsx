import React from "react";

// KPI chip row — presentational; the page assembles the item list from the
// workspace totals (or client-computed fallbacks).
export default function KpiStrip({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {(items || []).map((it) => (
        <div
          key={it.label}
          className={`rounded-xl border px-3 py-2.5 ${
            it.tone === "warn"
              ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
              : it.tone === "bad"
                ? "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30"
                : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {it.label}
          </div>
          <div className={`mt-0.5 truncate text-base font-bold ${
            it.tone === "bad"
              ? "text-red-700 dark:text-red-300"
              : it.tone === "warn"
                ? "text-amber-800 dark:text-amber-300"
                : "text-slate-900 dark:text-slate-100"
          }`} title={it.title || String(it.value ?? "")}>
            {it.value}
          </div>
          {it.hint && (
            <div className="truncate text-[10px] text-slate-400 dark:text-slate-500" title={it.hint}>
              {it.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
