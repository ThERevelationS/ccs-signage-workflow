import * as React from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { TONE_TEXT_CLASSES } from "./statusTones";

// Metric tile row: [{ label, value, tone?, hint?, to?, icon? }].
// `to` makes the tile a react-router link; tone tints the value using the
// shared tone text classes (statusTones.js). Responsive 2 -> 5 columns.
const KpiStrip = React.forwardRef(({ tiles = [], className, ...props }, ref) => {
  const visible = (Array.isArray(tiles) ? tiles : []).filter(Boolean);
  if (!visible.length) return null;
  return (
    <div
      ref={ref}
      className={cn(
        "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5",
        className
      )}
      {...props}
    >
      {visible.map((tile, i) => {
        const Icon = tile.icon;
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {tile.label}
              </span>
              {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}
            </div>
            <div
              className={cn(
                "mt-0.5 truncate text-xl font-bold text-slate-900 dark:text-slate-100",
                tile.tone && TONE_TEXT_CLASSES[tile.tone]
              )}
            >
              {tile.value ?? "\u2014"}
            </div>
            {tile.hint && (
              <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                {tile.hint}
              </div>
            )}
          </>
        );
        const tileCls = cn(
          "rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900",
          tile.to && "transition-colors hover:border-violet-300 hover:bg-violet-50/40 dark:hover:bg-slate-800/60",
          tile.className
        );
        return tile.to ? (
          <Link key={tile.key ?? i} to={tile.to} className={tileCls}>
            {body}
          </Link>
        ) : (
          <div key={tile.key ?? i} className={tileCls}>
            {body}
          </div>
        );
      })}
    </div>
  );
});
KpiStrip.displayName = "KpiStrip";

export { KpiStrip };
