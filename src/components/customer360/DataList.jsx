import React from "react";
import { CloudOff } from "lucide-react";

const thCls =
  "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

// Section card shell used by every tab on the Customer 360 page.
export function Section({ title, count, actions, notice, children, className = "" }) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          {title}
          {typeof count === "number" && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {count}
            </span>
          )}
        </h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {notice && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          {notice}
        </div>
      )}
      {children}
    </section>
  );
}

// Shown inside a section whose rows need function-only entities (Invoice,
// Payment, PurchaseOrder, ChangeOrder, Opportunity, CustomerContact) that the
// staff read gateway cannot serve — i.e. the workspace action is not deployed.
export function BackendRequired({ label = "These records" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <CloudOff className="h-7 w-7 text-slate-300 dark:text-slate-600" />
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {label} will appear here once the Customer 360 backend is deployed.
      </p>
    </div>
  );
}

// Responsive record list: a real table on md+ that collapses into stacked
// label/value cards on mobile — the same collapse pattern the app's queue
// pages use (min-w table inside an overflow-x scroller, md:hidden card list).
//
//   columns: [{ label, align?, className?, render(row) => node }]
//   rows, rowKey(row), empty: string|node
export function DataList({ columns, rows, rowKey, empty = "Nothing here yet." }) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
        {empty}
      </div>
    );
  }
  const alignCls = (a) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
  return (
    <>
      {/* mobile: stacked cards */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
        {list.map((row, i) => (
          <div key={rowKey?.(row, i) ?? i} className="px-4 py-3">
            {columns.map((col, ci) => (
              <div
                key={col.label || ci}
                className="flex items-start justify-between gap-3 py-0.5 text-sm"
              >
                {ci === 0 ? (
                  <div className="min-w-0 flex-1 font-medium text-slate-800 dark:text-slate-200">
                    {col.render(row)}
                  </div>
                ) : (
                  <>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {col.label}
                    </span>
                    <span className={`min-w-0 text-right text-slate-700 dark:text-slate-300 ${col.cardClassName || ""}`}>
                      {col.render(row)}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* md+: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {columns.map((col, i) => (
                <th key={col.label || i} className={`${thCls} ${alignCls(col.align)}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((row, i) => (
              <tr
                key={rowKey?.(row, i) ?? i}
                className="border-t border-slate-100 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                {columns.map((col, ci) => (
                  <td
                    key={col.label || ci}
                    className={`px-3 py-2.5 align-top ${alignCls(col.align)} ${col.className || ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
