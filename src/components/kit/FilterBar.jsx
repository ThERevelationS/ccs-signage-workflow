import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

// Filter row with a fixed control order -- every list page lays its controls
// out the same way, so callers only supply the pieces they actually have:
//
//   [search] [children = primary selects] [presets] [views] [pageSize] [actions]
//
// Each named slot accepts a node (or array). Slots not passed simply collapse.
// Styled defaults below (FilterSearchInput / FilterSelect / FilterField) carry
// the shared input vocabulary so callers don't re-type the class string.
const FilterBar = React.forwardRef(
  ({ search, presets, views, pageSize, actions, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/40",
        className
      )}
      {...props}
    >
      {search}
      {children}
      {presets}
      {views}
      {pageSize}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
);
FilterBar.displayName = "FilterBar";

// Shared input styles -- the PurchaseOrders/Invoices `inputCls` vocabulary.
const filterInputCls =
  "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

// Search input with the leading Search icon, sized to grow in the bar.
// Ref lands on the <input>; wrap in FilterField for a labelled layout.
const FilterSearchInput = React.forwardRef(
  ({ className, containerClassName, ...props }, ref) => (
    <div className={cn("relative min-w-52 flex-1", containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={ref}
        type="search"
        className={cn(filterInputCls, "pl-9", className)}
        {...props}
      />
    </div>
  )
);
FilterSearchInput.displayName = "FilterSearchInput";

// Styled <select> matching FilterSearchInput. Pass options as children.
const FilterSelect = React.forwardRef(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(filterInputCls, "w-auto", className)} {...props}>
    {children}
  </select>
));
FilterSelect.displayName = "FilterSelect";

// Label + control wrapper for the labelled-filter layout the queue pages use
// ("STATUS v"). Wrap any kit input/select: <FilterField label="Status"><FilterSelect/></FilterField>
const FilterField = React.forwardRef(({ label, className, children, ...props }, ref) => (
  <label ref={ref} className={cn("flex flex-col gap-0.5", className)} {...props}>
    {label && (
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
    )}
    {children}
  </label>
));
FilterField.displayName = "FilterField";

export { FilterBar, FilterSearchInput, FilterSelect, FilterField, filterInputCls };
